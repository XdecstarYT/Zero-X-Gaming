-- Cash Cup: Neon Siege tournaments for ZX Cash. 32 fighters on the Cash Cup
-- Arena, entry 10 ZX Cash (the battle pass gives two free entries a season),
-- prizes 250 / 125 / 75 / 40 (4th–5th) / 20 (6th–10th) / 10 (11th–15th),
-- plus 3 per elimination. Results are checked against the time since the
-- entry was taken; one entry is open at a time (an old one is forfeited).
-- Both legs go in the ledger as 'cash_cup' (refs cup-entry:<id> / cup-prize:<id>).

create table public.cash_cup_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_id text not null references public.seasons (id) on delete cascade,
  free boolean not null default false,
  paid integer not null default 0 check (paid >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  placement integer,
  kills integer,
  damage integer,
  chests integer,
  survived_s integer,
  prize integer not null default 0 check (prize >= 0)
);
create index cash_cup_entries_user on public.cash_cup_entries (user_id, created_at desc);
alter table public.cash_cup_entries enable row level security;
create policy "cash cup entries: read your own" on public.cash_cup_entries
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.cash_cup__prize(p_placement integer, p_kills integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (case
    when p_placement = 1 then 250
    when p_placement = 2 then 125
    when p_placement = 3 then 75
    when p_placement between 4 and 5 then 40
    when p_placement between 6 and 10 then 20
    when p_placement between 11 and 15 then 10
    else 0 end) + greatest(0, p_kills) * 3;
$$;

-- Where you stand: price, free entries left, any open entry, your recent cups.
create or replace function public.cash_cup_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.seasons;
  pass boolean := false;
  used integer := 0;
  bal integer := 0;
  open_entry jsonb;
  hist jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into s from public.seasons where now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
  if found then
    select coalesce(sp.has_pass, false) into pass from public.season_progress sp where sp.user_id = uid and sp.season_id = s.id;
    select count(*) into used from public.cash_cup_entries e where e.user_id = uid and e.season_id = s.id and e.free;
  end if;
  select coalesce(w.coins, 0) into bal from public.player_wallet w where w.user_id = uid;
  select jsonb_build_object('id', e.id, 'at', e.created_at) into open_entry
    from public.cash_cup_entries e
    where e.user_id = uid and e.finished_at is null and e.created_at > now() - interval '40 minutes'
    order by e.created_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('at', h.created_at, 'placement', h.placement, 'kills', h.kills, 'prize', h.prize, 'free', h.free) order by h.created_at desc), '[]'::jsonb)
    into hist
    from (select * from public.cash_cup_entries e where e.user_id = uid and e.finished_at is not null order by e.created_at desc limit 10) h;
  return jsonb_build_object(
    'price', 10,
    'has_pass', coalesce(pass, false),
    'free_left', case when coalesce(pass, false) then greatest(0, 2 - used) else 0 end,
    'coins', coalesce(bal, 0),
    'open', open_entry,
    'history', hist);
end;
$$;

-- Take an entry: a free one if the battle pass has any left, otherwise 10 ZX Cash.
create or replace function public.enter_cash_cup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.seasons;
  pass boolean := false;
  used integer := 0;
  use_free boolean;
  bal integer;
  new_id bigint;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into s from public.seasons where now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
  if not found then
    raise exception 'no active season';
  end if;
  -- One cup at a time: an entry still open is forfeited.
  update public.cash_cup_entries set finished_at = now()
    where user_id = uid and finished_at is null;
  select coalesce(sp.has_pass, false) into pass from public.season_progress sp where sp.user_id = uid and sp.season_id = s.id;
  select count(*) into used from public.cash_cup_entries e where e.user_id = uid and e.season_id = s.id and e.free;
  use_free := coalesce(pass, false) and used < 2;
  if use_free then
    insert into public.player_wallet (user_id) values (uid) on conflict do nothing;
    select coins into bal from public.player_wallet where user_id = uid;
  end if;
  insert into public.cash_cup_entries (user_id, season_id, free, paid)
    values (uid, s.id, use_free, case when use_free then 0 else 10 end)
    returning id into new_id;
  if not use_free then
    bal := public.add_coins(uid, -10, 'cash_cup', 'cup-entry:' || new_id);
  end if;
  return jsonb_build_object(
    'id', new_id,
    'free', use_free,
    'coins', bal,
    'free_left', case when coalesce(pass, false) then greatest(0, 2 - used - use_free::integer) else 0 end);
end;
$$;

-- Report how the cup went; pays the prize.
create or replace function public.finish_cash_cup(
  p_entry bigint, p_placement integer, p_kills integer, p_damage integer, p_chests integer, p_survived_s integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  e public.cash_cup_entries;
  elapsed numeric;
  won integer;
  bal integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into e from public.cash_cup_entries where id = p_entry and user_id = uid for update;
  if not found or e.finished_at is not null then
    raise exception 'no open entry' using errcode = '22023';
  end if;
  elapsed := extract(epoch from now() - e.created_at);
  if elapsed > 40 * 60 then
    update public.cash_cup_entries set finished_at = now() where id = e.id;
    raise exception 'entry expired' using errcode = '22023';
  end if;
  if p_placement is null or p_placement < 1 or p_placement > 32
     or p_kills is null or p_kills < 0 or p_kills > 32 - p_placement
     or p_chests is null or p_chests < 0 or p_chests > 120
     or p_survived_s is null or p_survived_s < 0 or p_survived_s > 1800 or p_survived_s > elapsed + 5
     or p_damage is null or p_damage < 0 or p_damage > 20000 or p_damage > p_survived_s * 200
     or (p_placement = 1 and p_survived_s < 150)
     or (p_placement <= 10 and p_survived_s < 60) then
    raise exception 'match not plausible' using errcode = '22023';
  end if;
  won := public.cash_cup__prize(p_placement, p_kills);
  update public.cash_cup_entries set
    finished_at = now(), placement = p_placement, kills = p_kills, damage = p_damage,
    chests = p_chests, survived_s = p_survived_s, prize = won
    where id = e.id;
  bal := public.add_coins(uid, won, 'cash_cup', 'cup-prize:' || e.id);
  return jsonb_build_object('prize', won, 'coins', bal, 'placement', p_placement);
end;
$$;

revoke all on function public.cash_cup_status() from public, anon;
revoke all on function public.enter_cash_cup() from public, anon;
revoke all on function public.finish_cash_cup(bigint, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.cash_cup_status() to authenticated;
grant execute on function public.enter_cash_cup() to authenticated;
grant execute on function public.finish_cash_cup(bigint, integer, integer, integer, integer, integer) to authenticated;
