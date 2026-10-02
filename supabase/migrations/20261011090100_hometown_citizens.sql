-- Hometown, part 2: internal helpers and citizens.

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

create or replace function public.town__uid()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Sign in to play Hometown';
  end if;
  if not exists (select 1 from public.town_citizens where user_id = uid) then
    raise exception 'Move to town first';
  end if;
  return uid;
end;
$$;

create or replace function public.town__inv(p_user uuid, p_item text, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  have integer;
begin
  insert into public.town_inventory (user_id, item, qty) values (p_user, p_item, 0) on conflict do nothing;
  select qty into have from public.town_inventory where user_id = p_user and item = p_item for update;
  if have + p_delta < 0 then
    raise exception 'Not enough %', p_item;
  end if;
  update public.town_inventory set qty = qty + p_delta where user_id = p_user and item = p_item;
  return have + p_delta;
end;
$$;

create or replace function public.town__cash(p_user uuid, p_delta bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  have bigint;
begin
  select cash into have from public.town_citizens where user_id = p_user for update;
  if have + p_delta < 0 then
    raise exception 'Not enough cash';
  end if;
  update public.town_citizens set cash = cash + p_delta where user_id = p_user;
  return have + p_delta;
end;
$$;

create or replace function public.town__treasury(p_delta bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  t bigint;
begin
  select treasury into t from public.town_state where id = 1 for update;
  if t + p_delta < 0 then
    raise exception 'The town treasury is empty';
  end if;
  update public.town_state set treasury = treasury + p_delta, updated_at = now() where id = 1;
  return t + p_delta;
end;
$$;

-- Energy refills one point every two minutes; bring it up to date and return it.
create or replace function public.town__energy(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.town_citizens;
  e integer;
begin
  select * into c from public.town_citizens where user_id = p_user for update;
  e := least(100, c.energy + floor(extract(epoch from (now() - c.energy_at)) / 120)::integer);
  update public.town_citizens set energy = e, energy_at = case when e >= 100 then now() else c.energy_at + make_interval(secs => (e - c.energy) * 120) end where user_id = p_user;
  return e;
end;
$$;

create or replace function public.town__spend_energy(p_user uuid, p_n integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e integer := public.town__energy(p_user);
begin
  if e < p_n then
    raise exception 'Too tired: eat something or rest';
  end if;
  update public.town_citizens set energy = e - p_n, energy_at = case when e >= 100 then now() else energy_at end where user_id = p_user;
  return e - p_n;
end;
$$;

create or replace function public.town__news(p_kind text, p_text text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.town_log (kind, text) values (p_kind, left(p_text, 200));
$$;

create or replace function public.town__name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select name from public.town_citizens where user_id = p_user), 'Someone');
$$;

-- Close any election that's over (the winner becomes mayor and brings their platform in), and keep
-- one open election running. Cheap; called from the other functions.
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
end;
$$;

revoke execute on function public.town__uid() from public, anon, authenticated;
revoke execute on function public.town__inv(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.town__cash(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.town__treasury(bigint) from public, anon, authenticated;
revoke execute on function public.town__energy(uuid) from public, anon, authenticated;
revoke execute on function public.town__spend_energy(uuid, integer) from public, anon, authenticated;
revoke execute on function public.town__news(text, text) from public, anon, authenticated;
revoke execute on function public.town__name(uuid) from public, anon, authenticated;
revoke execute on function public.town__tick() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Citizens
-- ---------------------------------------------------------------------------

-- Move to town: your citizen takes your account name, starts with cash and a loaf or three.
create or replace function public.town_join(p_look jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  nm text;
begin
  if uid is null then
    raise exception 'Sign in to play Hometown';
  end if;
  perform public.town__tick();
  if not exists (select 1 from public.town_citizens where user_id = uid) then
    select username::text into nm from public.profiles where id = uid;
    nm := coalesce(nm, 'Citizen' || substr(replace(uid::text, '-', ''), 1, 6));
    insert into public.town_citizens (user_id, name, look) values (uid, left(nm, 20), coalesce(p_look, '{}'::jsonb));
    perform public.town__inv(uid, 'bread', 3);
    perform public.town__news('arrival', nm || ' moved to town');
  elsif p_look is not null and p_look <> '{}'::jsonb then
    update public.town_citizens set look = p_look where user_id = uid;
  end if;
  return public.town_me();
end;
$$;

-- You: cash, energy (up to date), job cooldown, inventory, your open orders.
create or replace function public.town_me()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  e integer := public.town__energy(uid);
  c public.town_citizens;
begin
  select * into c from public.town_citizens where user_id = uid;
  return jsonb_build_object(
    'id', uid,
    'name', c.name,
    'cash', c.cash,
    'energy', e,
    'workedAt', c.worked_at,
    'look', c.look,
    'inventory', coalesce((select jsonb_object_agg(item, qty) from public.town_inventory where user_id = uid and qty > 0), '{}'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'item', item, 'side', side, 'price', price, 'qty', qty) order by id) from public.town_orders where user_id = uid and open), '[]'::jsonb),
    'voted', (select candidate from public.town_votes v join public.town_elections el on el.id = v.election_id where not el.resolved and v.voter = uid limit 1)
  );
end;
$$;

-- Work a shift: gather raw goods (with tools, more), or public works paid from the treasury.
create or replace function public.town_work(p_job text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  c public.town_citizens;
  st public.town_state;
  got text;
  n integer;
  pay integer := 10;
  tools integer;
begin
  select * into c from public.town_citizens where user_id = uid for update;
  if c.worked_at is not null and c.worked_at > now() - interval '20 seconds' then
    raise exception 'Still catching your breath from the last shift';
  end if;
  perform public.town__spend_energy(uid, 15);
  if p_job = 'public' then
    select * into st from public.town_state where id = 1;
    perform public.town__treasury(-st.public_wage);
    perform public.town__cash(uid, st.public_wage);
    update public.town_citizens set worked_at = now() where user_id = uid;
    return jsonb_build_object('cash', st.public_wage);
  end if;
  got := case p_job when 'farm' then 'wheat' when 'forest' then 'logs' when 'mine' then 'ore' end;
  if got is null then
    raise exception 'No such job';
  end if;
  n := case p_job when 'mine' then 2 else 3 end;
  select coalesce((select i.qty from public.town_inventory i where i.user_id = uid and i.item = 'tools'), 0) into tools;
  if tools > 0 then
    n := n + 2;
    if random() < 0.2 then
      perform public.town__inv(uid, 'tools', -1);
    end if;
  end if;
  perform public.town__inv(uid, got, n);
  perform public.town__cash(uid, pay);
  update public.town_citizens set worked_at = now() where user_id = uid;
  return jsonb_build_object('item', got, 'qty', n, 'cash', pay);
end;
$$;

create or replace function public.town_eat()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.town__uid();
  e integer;
begin
  perform public.town__inv(uid, 'bread', -1);
  e := least(100, public.town__energy(uid) + 35);
  update public.town_citizens set energy = e, energy_at = now() where user_id = uid;
  return e;
end;
$$;

