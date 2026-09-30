-- Coins, Cash Cups, a 200-coin battle pass and the Item Shop (DROP 1).
--
-- Coins are only ever earned by playing (Cash Cup placements) and only ever
-- spent here: there is no real-money purchase. Mirrors src/lib/economy.ts;
-- src/lib/economy.test.ts checks this file against it.

-- ---------------------------------------------------------------------------
-- Wallet + append-only ledger (clients can read their own; only functions write)
-- ---------------------------------------------------------------------------
create table public.player_wallet (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  coins integer not null default 0 check (coins >= 0),
  updated_at timestamptz not null default now()
);

create table public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('cash_cup', 'battle_pass', 'shop')),
  ref text,
  created_at timestamptz not null default now()
);
create index coin_ledger_user_idx on public.coin_ledger (user_id, created_at desc);

alter table public.player_wallet enable row level security;
alter table public.coin_ledger enable row level security;
create policy "Players read their wallet" on public.player_wallet
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Players read their coin history" on public.coin_ledger
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.player_wallet, public.coin_ledger from anon, authenticated;

-- The battle pass is now bought (200 coins). Tiers still progress without it;
-- buying it grants every reward already reached, and later tiers as you reach them.
alter table public.season_progress add column has_pass boolean not null default false;

-- ---------------------------------------------------------------------------
-- Item Shop catalogue (public)
-- ---------------------------------------------------------------------------
create table public.shop_items (
  drop_id text not null,
  drop_name text not null,
  kind text not null check (kind in ('outfit', 'wrap', 'banner')),
  item_id text not null,
  price integer not null check (price > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  primary key (kind, item_id)
);
alter table public.shop_items enable row level security;
create policy "Shop is public" on public.shop_items for select to anon, authenticated using (true);
revoke insert, update, delete on public.shop_items from anon, authenticated;

insert into public.shop_items (drop_id, drop_name, kind, item_id, price, starts_at, ends_at) values
  ('drop-1', 'DROP 1', 'outfit', 'apex', 150, '2026-09-30T00:00:00Z', '2026-10-14T00:00:00Z'),
  ('drop-1', 'DROP 1', 'outfit', 'dropzone', 100, '2026-09-30T00:00:00Z', '2026-10-14T00:00:00Z'),
  ('drop-1', 'DROP 1', 'outfit', 'sunset', 90, '2026-09-30T00:00:00Z', '2026-10-14T00:00:00Z'),
  ('drop-1', 'DROP 1', 'outfit', 'frostbite', 60, '2026-09-30T00:00:00Z', '2026-10-14T00:00:00Z'),
  ('drop-1', 'DROP 1', 'wrap', 'chrome', 80, '2026-09-30T00:00:00Z', '2026-10-14T00:00:00Z'),
  ('drop-1', 'DROP 1', 'wrap', 'molten', 60, '2026-09-30T00:00:00Z', '2026-10-14T00:00:00Z'),
  ('drop-1', 'DROP 1', 'wrap', 'aurora', 40, '2026-09-30T00:00:00Z', '2026-10-14T00:00:00Z'),
  ('drop-1', 'DROP 1', 'banner', 'cash-king', 35, '2026-09-30T00:00:00Z', '2026-10-14T00:00:00Z'),
  ('drop-1', 'DROP 1', 'banner', 'drop-1', 25, '2026-09-30T00:00:00Z', '2026-10-14T00:00:00Z');

-- ---------------------------------------------------------------------------
-- Internal: move coins (never callable by clients)
-- ---------------------------------------------------------------------------
create or replace function public.add_coins(p_user uuid, p_amount integer, p_reason text, p_ref text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  bal integer;
begin
  insert into public.player_wallet (user_id) values (p_user) on conflict do nothing;
  select coins into bal from public.player_wallet where user_id = p_user for update;
  if bal + p_amount < 0 then
    raise exception 'not enough coins';
  end if;
  if p_amount <> 0 then
    update public.player_wallet set coins = coins + p_amount, updated_at = now() where user_id = p_user;
    insert into public.coin_ledger (user_id, amount, reason, ref) values (p_user, p_amount, p_reason, p_ref);
  end if;
  return bal + p_amount;
end;
$$;
revoke execute on function public.add_coins(uuid, integer, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- record_siege_match v2: Cash Cups + pass-gated rewards
-- ---------------------------------------------------------------------------
drop function public.record_siege_match(integer, integer, integer, integer, integer, integer);

create or replace function public.record_siege_match(
  p_kills integer, p_placement integer, p_players integer, p_damage integer, p_chests integer, p_survived_s integer,
  p_difficulty text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.seasons;
  prog public.season_progress;
  xp_match integer;
  xp_ch integer := 0;
  d integer;
  w integer;
  n_daily integer;
  n_weekly integer;
  ch public.challenge_pool;
  per text;
  val integer;
  cur public.challenge_progress;
  newp integer;
  completed jsonb := '[]'::jsonb;
  xp_after integer;
  unlocked jsonb := '[]'::jsonb;
  cash_cup boolean;
  coins_won integer := 0;
  balance integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into s from public.seasons
    where now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
  if not found then
    raise exception 'no active season';
  end if;
  if p_players is null or p_players < 2 or p_players > 16
     or p_placement is null or p_placement < 1 or p_placement > p_players
     or p_kills is null or p_kills < 0 or p_kills > p_players - 1
     or p_chests is null or p_chests < 0 or p_chests > 60
     or p_survived_s is null or p_survived_s < 0 or p_survived_s > 900
     or p_damage is null or p_damage < 0 or p_damage > 6000 or p_damage > p_survived_s * 200
     or p_difficulty not in ('easy', 'normal', 'hard') then
    raise exception 'match not plausible';
  end if;

  insert into public.season_progress (user_id, season_id) values (uid, s.id) on conflict do nothing;
  select * into prog from public.season_progress where user_id = uid and season_id = s.id for update;
  if prog.last_match_at is not null
     and now() - prog.last_match_at < make_interval(secs => greatest(15, p_survived_s)) then
    raise exception 'too many matches';
  end if;

  -- Every third ranked match is a Cash Cup (always vs Hard bots): 50 / 20 / 5 coins for the top 3.
  cash_cup := (prog.matches + 1) % 3 = 0;
  if cash_cup and p_difficulty = 'hard' then
    coins_won := case p_placement when 1 then 50 when 2 then 20 when 3 then 5 else 0 end;
  end if;

  xp_match := public.siege_match_xp(p_kills, p_placement, p_damage, p_chests, p_survived_s);

  d := greatest(0, floor(extract(epoch from (now() - s.starts_at)) / 86400)::integer);
  w := d / 7;
  select count(*) into n_daily from public.challenge_pool where season_id = s.id and kind = 'daily';
  select count(*) into n_weekly from public.challenge_pool where season_id = s.id and kind = 'weekly';
  for ch in
    select c.* from public.challenge_pool c
    where c.season_id = s.id and (
      (c.kind = 'daily' and n_daily > 0 and c.idx in (select (d * 3 + i) % n_daily from generate_series(0, 2) i))
      or (c.kind = 'weekly' and n_weekly > 0 and c.idx in (select (w * 4 + i) % n_weekly from generate_series(0, 3) i)))
  loop
    per := case when ch.kind = 'daily' then 'd' || d else 'w' || w end;
    val := case ch.metric
      when 'kills' then p_kills
      when 'wins' then (p_placement = 1)::integer
      when 'top10' then (p_placement <= 10)::integer
      when 'chests' then p_chests
      when 'damage' then p_damage
      when 'matches' then 1
      when 'survive' then p_survived_s
      else 0 end;
    continue when val <= 0;
    insert into public.challenge_progress (user_id, season_id, challenge_id, period)
      values (uid, s.id, ch.id, per) on conflict do nothing;
    select * into cur from public.challenge_progress
      where user_id = uid and challenge_id = ch.id and period = per for update;
    continue when cur.completed_at is not null;
    newp := least(ch.goal, cur.progress + val);
    update public.challenge_progress
      set progress = newp, completed_at = case when newp >= ch.goal then now() else null end
      where user_id = uid and challenge_id = ch.id and period = per;
    if newp >= ch.goal then
      xp_ch := xp_ch + ch.xp;
      completed := completed || jsonb_build_object('id', ch.id, 'title', ch.title, 'xp', ch.xp);
    end if;
  end loop;

  xp_after := prog.xp + xp_match + xp_ch;
  update public.season_progress set
    xp = xp_after,
    matches = matches + 1,
    wins = wins + (p_placement = 1)::integer,
    kills = kills + p_kills,
    last_match_at = now()
  where user_id = uid and season_id = s.id;

  insert into public.siege_matches (user_id, season_id, kills, placement, players, damage, chests, survived_s, xp)
    values (uid, s.id, p_kills, p_placement, p_players, p_damage, p_chests, p_survived_s, xp_match + xp_ch);

  -- Tier rewards go to battle pass owners.
  if prog.has_pass then
    with granted as (
      insert into public.player_cosmetics (user_id, item_id, kind, source)
      select uid, r.item_id, r.kind, 'season:' || s.id
      from public.season_rewards r
      where r.season_id = s.id
        and r.tier > least(s.tiers, prog.xp / s.tier_xp)
        and r.tier <= least(s.tiers, xp_after / s.tier_xp)
      on conflict do nothing
      returning kind, item_id
    )
    select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'item', item_id)), '[]'::jsonb) into unlocked from granted;
  end if;

  balance := public.add_coins(uid, coins_won, 'cash_cup', 'match:' || (prog.matches + 1));

  return jsonb_build_object(
    'xp_match', xp_match,
    'xp_challenges', xp_ch,
    'xp_total', xp_after,
    'tier_before', least(s.tiers, prog.xp / s.tier_xp),
    'tier_after', least(s.tiers, xp_after / s.tier_xp),
    'unlocked', unlocked,
    'challenges', completed,
    'cash_cup', cash_cup,
    'coins_won', coins_won,
    'coins', balance,
    'has_pass', prog.has_pass);
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------------
create or replace function public.buy_battle_pass()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.seasons;
  prog public.season_progress;
  balance integer;
  unlocked jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into s from public.seasons
    where now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
  if not found then
    raise exception 'no active season';
  end if;
  insert into public.season_progress (user_id, season_id) values (uid, s.id) on conflict do nothing;
  select * into prog from public.season_progress where user_id = uid and season_id = s.id for update;
  if prog.has_pass then
    raise exception 'already owned';
  end if;
  balance := public.add_coins(uid, -200, 'battle_pass', s.id);
  update public.season_progress set has_pass = true where user_id = uid and season_id = s.id;
  -- Grant every tier already reached.
  with granted as (
    insert into public.player_cosmetics (user_id, item_id, kind, source)
    select uid, r.item_id, r.kind, 'season:' || s.id
    from public.season_rewards r
    where r.season_id = s.id and r.tier <= least(s.tiers, prog.xp / s.tier_xp)
    on conflict do nothing
    returning kind, item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'item', item_id)), '[]'::jsonb) into unlocked from granted;
  return jsonb_build_object('coins', balance, 'unlocked', unlocked);
end;
$$;

create or replace function public.buy_shop_item(p_kind text, p_item text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  it public.shop_items;
  balance integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into it from public.shop_items
    where kind = p_kind and item_id = p_item and now() >= starts_at and now() < ends_at;
  if not found then
    raise exception 'not in the shop';
  end if;
  if exists (select 1 from public.player_cosmetics where user_id = uid and kind = p_kind and item_id = p_item) then
    raise exception 'already owned';
  end if;
  balance := public.add_coins(uid, -it.price, 'shop', it.drop_id || ':' || p_kind || ':' || p_item);
  insert into public.player_cosmetics (user_id, item_id, kind, source) values (uid, p_item, p_kind, 'shop:' || it.drop_id);
  return jsonb_build_object('coins', balance);
end;
$$;

revoke execute on function public.record_siege_match(integer, integer, integer, integer, integer, integer, text) from public, anon;
revoke execute on function public.buy_battle_pass() from public, anon;
revoke execute on function public.buy_shop_item(text, text) from public, anon;
grant execute on function public.record_siege_match(integer, integer, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.buy_battle_pass() to authenticated;
grant execute on function public.buy_shop_item(text, text) to authenticated;
