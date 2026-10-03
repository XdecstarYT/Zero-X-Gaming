-- Hometown: servers and townsfolk.
--
-- Servers are separate streets of the same town (their own Realtime room, so you see the
-- people on yours); the economy, land and elections are shared. Two start locked "in
-- development"; only the site owner's account can open or close them.
--
-- Townsfolk are the town's NPC traders. They keep the exchange moving when nobody is
-- playing: every ten minutes one of them buys a fairly priced ask from a player (paid by
-- the treasury) or sells from their stall into a fair bid (the money goes to the
-- treasury). Like energy and elections this is lazy: the time since the last visit is
-- caught up on the next snapshot (at most a day's worth), so no scheduler is needed.
-- Money only moves between players and the treasury, so it's still conserved.

create table public.town_servers (
  id text primary key check (id ~ '^[a-z0-9-]{2,20}$'),
  name text not null,
  blurb text not null default '',
  locked boolean not null default false,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.town_servers enable row level security;
create policy "town servers are public" on public.town_servers for select using (true);
grant select on public.town_servers to anon, authenticated;

insert into public.town_servers (id, name, blurb, locked, sort) values
  ('main', 'Main Street', 'The live town. Open to everyone.', false, 0),
  ('harbour', 'Harbour Side', 'In development: opening soon.', true, 1),
  ('hillcrest', 'Hillcrest', 'In development: opening soon.', true, 2);

-- The site owner, by the email on their account.
create function public.town__owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
     where id = (select auth.uid()) and lower(email) = 'decmar098@gmail.com');
$$;

create function public.town_server_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'owner', public.town__owner(),
    'servers', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'blurb', blurb, 'locked', locked) order by sort)
        from public.town_servers), '[]'::jsonb));
$$;

create function public.town_set_server(p_id text, p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.town__owner() then
    raise exception 'Only the site owner can open or close servers';
  end if;
  if p_id = 'main' and p_locked then
    raise exception 'Main Street always stays open';
  end if;
  update public.town_servers set locked = p_locked, updated_at = now() where id = p_id;
  if not found then
    raise exception 'No such server';
  end if;
  perform public.town__news('town', (select name from public.town_servers where id = p_id)
    || case when p_locked then ' is closed for building work' else ' is open: come and have a look' end);
end;
$$;

-- ------------------------------------------------------------- townsfolk

alter table public.town_state add column npc_at timestamptz not null default now();

create table public.town_npc_stock (
  item text primary key check (item in ('wheat', 'logs', 'ore', 'flour', 'planks', 'steel', 'bread', 'furniture', 'tools')),
  qty integer not null default 0 check (qty between 0 and 60)
);
alter table public.town_npc_stock enable row level security;
insert into public.town_npc_stock (item, qty)
  select unnest(array['wheat', 'logs', 'ore', 'flour', 'planks', 'steel', 'bread', 'furniture', 'tools']), 6;

create function public.town__npcs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.town_state;
  slots integer;
  names text[] := array['Maple Jones', 'Rosa Quill', 'Ted Harrow', 'Ivy Banks', 'Sol Okafor', 'Nina Park',
                        'Gus Fairweather', 'Lena Moss', 'Arlo Penn', 'Hattie Vale', 'Omar Reyes', 'Pip Calloway'];
  items text[] := array['wheat', 'logs', 'ore', 'flour', 'planks', 'steel', 'bread', 'furniture', 'tools'];
  base integer[] := array[6, 6, 9, 12, 12, 35, 10, 60, 30];
  i integer;
  k integer;
  it text;
  b integer;
  who text;
  o public.town_orders;
  n integer;
  gross bigint;
  tax bigint;
  stock integer;
  bought integer := 0;
  sold integer := 0;
  quiet boolean;
begin
  select * into st from public.town_state where id = 1 for update;
  slots := floor(extract(epoch from (now() - st.npc_at)) / 600)::integer;
  if slots < 1 then
    return;
  end if;
  quiet := slots > 1;
  update public.town_state set npc_at = case when slots > 144 then now() else npc_at + make_interval(secs => slots * 600) end where id = 1;
  slots := least(slots, 144);
  for i in 1 .. slots loop
    k := 1 + floor(random() * 9)::integer;
    it := items[k];
    b := base[k];
    who := names[1 + floor(random() * 12)::integer];
    select qty into stock from public.town_npc_stock where item = it for update;

    -- Buy the cheapest fair ask a player has up.
    select * into o from public.town_orders
     where open and item = it and side = 'sell' and price <= ceil(b * 1.2)
     order by price, id limit 1 for update;
    if o.id is not null and stock < 60 then
      n := least(o.qty, 3, 60 - stock);
      gross := o.price::bigint * n;
      tax := floor(gross * st.sales_tax);
      if (select treasury from public.town_state where id = 1) >= gross - tax then
        perform public.town__treasury(-(gross - tax));
        perform public.town__cash(o.user_id, gross - tax);
        update public.town_npc_stock set qty = qty + n where item = it;
        update public.town_orders set qty = case when n = qty then qty else qty - n end, open = n < qty where id = o.id;
        insert into public.town_trades (item, price, qty, buyer, seller, via) values (it, o.price, n, null, o.user_id, 'npc');
        bought := bought + n;
        if not quiet then
          perform public.town__news('market', who || ' bought ' || n || ' ' || it || ' at ' || o.price || ' each');
        end if;
        continue;
      end if;
    end if;

    -- Sell from the stall into the best fair bid.
    select * into o from public.town_orders
     where open and item = it and side = 'buy' and price >= floor(b * 0.9)
     order by price desc, id limit 1 for update;
    if o.id is not null and stock > 0 then
      n := least(o.qty, stock, 3);
      gross := o.price::bigint * n;
      -- The buyer's cash is already in escrow at their price.
      perform public.town__inv(o.user_id, it, n);
      perform public.town__treasury(gross);
      update public.town_npc_stock set qty = qty - n where item = it;
      update public.town_orders set qty = case when n = qty then qty else qty - n end, open = n < qty where id = o.id;
      insert into public.town_trades (item, price, qty, buyer, seller, via) values (it, o.price, n, o.user_id, null, 'npc');
      sold := sold + n;
      if not quiet then
        perform public.town__news('market', who || ' sold ' || n || ' ' || it || ' at ' || o.price || ' each');
      end if;
      continue;
    end if;

    -- Nothing to trade: work the farm, the yard or the mine and restock the stall.
    update public.town_npc_stock set qty = least(60, qty + 1) where item = it;
  end loop;
  if quiet and bought + sold > 0 then
    perform public.town__news('market', 'While the town was quiet, the townsfolk bought ' || bought || ' and sold ' || sold || ' goods on the exchange');
  end if;
end;
$$;

-- Every snapshot, vote and candidacy already ticks the town; the townsfolk ride along.
create or replace function public.town__tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  el public.town_elections;
  win record;
  n integer;
begin
  for el in select * from public.town_elections where not resolved and ends_at <= now() order by id for update loop
    select count(*) into n from public.town_votes where election_id = el.id;
    select c.user_id, c.sales_tax, c.public_wage, count(v.voter) as votes
      into win
      from public.town_candidates c
      left join public.town_votes v on v.election_id = c.election_id and v.candidate = c.user_id
     where c.election_id = el.id
     group by c.user_id, c.sales_tax, c.public_wage, c.created_at
     order by count(v.voter) desc, c.created_at
     limit 1;
    update public.town_elections set resolved = true, winner = win.user_id, turnout = n where id = el.id;
    if win.user_id is not null then
      update public.town_state set mayor = win.user_id, sales_tax = win.sales_tax, public_wage = win.public_wage, updated_at = now() where id = 1;
      perform public.town__news('election', public.town__name(win.user_id) || ' is elected mayor with ' || win.votes || ' of ' || n || ' votes');
    else
      perform public.town__news('election', 'Nobody stood for mayor; the old council stays on');
    end if;
  end loop;
  if not exists (select 1 from public.town_elections where not resolved) then
    insert into public.town_elections (ends_at) values (now() + interval '6 hours');
  end if;
  perform public.town__npcs();
end;
$$;

revoke all on function public.town__owner() from public, anon, authenticated;
revoke all on function public.town__npcs() from public, anon, authenticated;
revoke all on function public.town_server_list() from public;
revoke all on function public.town_set_server(text, boolean) from public;
grant execute on function public.town_server_list() to anon, authenticated;
grant execute on function public.town_set_server(text, boolean) to authenticated;
