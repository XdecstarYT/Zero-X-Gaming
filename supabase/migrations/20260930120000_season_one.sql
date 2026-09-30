-- Season 1 "Ground Zero": Neon Siege becomes a battle royale, and gets a season,
-- a 30-tier battle pass (all rewards earned by playing, nothing to buy), daily and
-- weekly challenges, cosmetics and loadouts.
--
-- The catalogue (tiers, rewards, challenge pool, XP formula) mirrors src/lib/season.ts;
-- src/lib/season.test.ts checks this file against it.

-- ---------------------------------------------------------------------------
-- Neon Siege score limits for the battle royale.
-- Score = kills × 100 + placement bonus (≤ 1000) + 2 per second survived.
-- 15 kills + a win + a full-length match stays under 3,500; 150 pts/s covers an
-- early kill (100 pts a second or two after dropping).
-- ---------------------------------------------------------------------------
update public.games set max_score = 5000, max_score_per_second = 150 where slug = 'neon-siege';

-- ---------------------------------------------------------------------------
-- Catalogue (public, read-only)
-- ---------------------------------------------------------------------------
create table public.seasons (
  id text primary key,
  number integer not null unique,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  tiers integer not null check (tiers > 0),
  tier_xp integer not null check (tier_xp > 0)
);

create table public.season_rewards (
  season_id text not null references public.seasons (id) on delete cascade,
  tier integer not null check (tier > 0),
  kind text not null check (kind in ('outfit', 'wrap', 'banner')),
  item_id text not null,
  primary key (season_id, tier)
);

create table public.challenge_pool (
  id text primary key,
  season_id text not null references public.seasons (id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly')),
  idx integer not null check (idx >= 0),
  metric text not null check (metric in ('kills', 'wins', 'top10', 'chests', 'damage', 'matches', 'survive')),
  goal integer not null check (goal > 0),
  xp integer not null check (xp > 0),
  title text not null,
  unique (season_id, kind, idx)
);

alter table public.seasons enable row level security;
alter table public.season_rewards enable row level security;
alter table public.challenge_pool enable row level security;
create policy "Seasons are public" on public.seasons for select to anon, authenticated using (true);
create policy "Season rewards are public" on public.season_rewards for select to anon, authenticated using (true);
create policy "Challenges are public" on public.challenge_pool for select to anon, authenticated using (true);
revoke insert, update, delete on public.seasons, public.season_rewards, public.challenge_pool from anon, authenticated;

insert into public.seasons (id, number, name, starts_at, ends_at, tiers, tier_xp)
values ('s1', 1, 'Ground Zero', '2026-09-28T00:00:00Z', '2026-12-20T00:00:00Z', 30, 1000);

insert into public.season_rewards (season_id, tier, kind, item_id) values
  ('s1', 1, 'banner', 'ground-zero'),
  ('s1', 2, 'wrap', 'woodland'),
  ('s1', 3, 'outfit', 'urban'),
  ('s1', 4, 'banner', 'dusk'),
  ('s1', 5, 'outfit', 'nomad'),
  ('s1', 6, 'wrap', 'sandstorm'),
  ('s1', 7, 'banner', 'storm-chaser'),
  ('s1', 8, 'outfit', 'desert'),
  ('s1', 9, 'wrap', 'carbon'),
  ('s1', 10, 'outfit', 'ember'),
  ('s1', 11, 'banner', 'circuit'),
  ('s1', 12, 'outfit', 'jungle'),
  ('s1', 13, 'wrap', 'tiger'),
  ('s1', 14, 'banner', 'ember'),
  ('s1', 15, 'outfit', 'arctic'),
  ('s1', 16, 'wrap', 'glacier'),
  ('s1', 17, 'banner', 'tidal'),
  ('s1', 18, 'outfit', 'crimson'),
  ('s1', 19, 'wrap', 'retro'),
  ('s1', 20, 'outfit', 'tidal'),
  ('s1', 21, 'banner', 'midnight'),
  ('s1', 22, 'outfit', 'midnight'),
  ('s1', 23, 'banner', 'gilded'),
  ('s1', 24, 'outfit', 'cipher'),
  ('s1', 25, 'banner', 'victory'),
  ('s1', 26, 'wrap', 'gilded'),
  ('s1', 27, 'banner', 'apex'),
  ('s1', 28, 'banner', 'legend'),
  ('s1', 29, 'banner', 'zero'),
  ('s1', 30, 'outfit', 'vanguard');

insert into public.challenge_pool (id, season_id, kind, idx, metric, goal, xp, title) values
  ('d0', 's1', 'daily', 0, 'kills', 3, 300, 'Eliminate 3 opponents'),
  ('d1', 's1', 'daily', 1, 'chests', 4, 300, 'Open 4 chests'),
  ('d2', 's1', 'daily', 2, 'damage', 500, 300, 'Deal 500 damage'),
  ('d3', 's1', 'daily', 3, 'matches', 3, 250, 'Play 3 matches'),
  ('d4', 's1', 'daily', 4, 'top10', 2, 350, 'Finish in the top 10 twice'),
  ('d5', 's1', 'daily', 5, 'survive', 300, 250, 'Survive 5 minutes in total'),
  ('d6', 's1', 'daily', 6, 'kills', 5, 400, 'Eliminate 5 opponents'),
  ('d7', 's1', 'daily', 7, 'chests', 6, 400, 'Open 6 chests'),
  ('d8', 's1', 'daily', 8, 'damage', 1000, 400, 'Deal 1,000 damage'),
  ('w0', 's1', 'weekly', 0, 'wins', 1, 1500, 'Win a match'),
  ('w1', 's1', 'weekly', 1, 'kills', 25, 1500, 'Eliminate 25 opponents'),
  ('w2', 's1', 'weekly', 2, 'chests', 30, 1200, 'Open 30 chests'),
  ('w3', 's1', 'weekly', 3, 'damage', 5000, 1200, 'Deal 5,000 damage'),
  ('w4', 's1', 'weekly', 4, 'top10', 8, 1200, 'Finish in the top 10 in 8 matches'),
  ('w5', 's1', 'weekly', 5, 'matches', 15, 1000, 'Play 15 matches'),
  ('w6', 's1', 'weekly', 6, 'survive', 1800, 1000, 'Survive 30 minutes in total'),
  ('w7', 's1', 'weekly', 7, 'kills', 40, 2000, 'Eliminate 40 opponents');

-- ---------------------------------------------------------------------------
-- Player state (each player reads their own; only server functions write)
-- ---------------------------------------------------------------------------
create table public.season_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_id text not null references public.seasons (id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  matches integer not null default 0,
  wins integer not null default 0,
  kills integer not null default 0,
  last_match_at timestamptz,
  primary key (user_id, season_id)
);

create table public.challenge_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_id text not null references public.seasons (id) on delete cascade,
  challenge_id text not null references public.challenge_pool (id) on delete cascade,
  period text not null,
  progress integer not null default 0 check (progress >= 0),
  completed_at timestamptz,
  primary key (user_id, challenge_id, period)
);

create table public.player_cosmetics (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null,
  kind text not null check (kind in ('outfit', 'wrap', 'banner')),
  source text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

create table public.player_loadout (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  outfit text not null default 'recruit',
  wrap text not null default 'factory',
  banner text not null default 'rookie',
  updated_at timestamptz not null default now()
);

create table public.siege_matches (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_id text not null references public.seasons (id) on delete cascade,
  kills integer not null,
  placement integer not null,
  players integer not null,
  damage integer not null,
  chests integer not null,
  survived_s integer not null,
  xp integer not null,
  created_at timestamptz not null default now()
);
create index siege_matches_user_idx on public.siege_matches (user_id, created_at desc);

alter table public.season_progress enable row level security;
alter table public.challenge_progress enable row level security;
alter table public.player_cosmetics enable row level security;
alter table public.player_loadout enable row level security;
alter table public.siege_matches enable row level security;

create policy "Players read their season progress" on public.season_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Players read their challenge progress" on public.challenge_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Players read their cosmetics" on public.player_cosmetics
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Players read their loadout" on public.player_loadout
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Players read their matches" on public.siege_matches
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.season_progress, public.challenge_progress, public.player_cosmetics,
  public.player_loadout, public.siege_matches from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Season XP for one match (mirrors matchXp() in src/lib/season.ts).
create or replace function public.siege_match_xp(
  p_kills integer, p_placement integer, p_damage integer, p_chests integer, p_survived_s integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(1500,
    50
    + p_kills * 40
    + case when p_placement = 1 then 250 when p_placement <= 3 then 120 when p_placement <= 5 then 80
           when p_placement <= 10 then 40 else 0 end
    + least(p_survived_s, 600) / 2
    + p_chests * 10
    + least(p_damage, 2000) / 20);
$$;

-- Record a finished battle royale vs bots: validates plausibility, awards season
-- XP, advances challenges and unlocks battle pass rewards. Returns a summary.
create or replace function public.record_siege_match(
  p_kills integer, p_placement integer, p_players integer, p_damage integer, p_chests integer, p_survived_s integer
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
  if p_players is null or p_players < 2 or p_players > 16
     or p_placement is null or p_placement < 1 or p_placement > p_players
     or p_kills is null or p_kills < 0 or p_kills > p_players - 1
     or p_chests is null or p_chests < 0 or p_chests > 60
     or p_survived_s is null or p_survived_s < 0 or p_survived_s > 900
     or p_damage is null or p_damage < 0 or p_damage > 6000 or p_damage > p_survived_s * 200 then
    raise exception 'match not plausible';
  end if;

  insert into public.season_progress (user_id, season_id) values (uid, s.id) on conflict do nothing;
  select * into prog from public.season_progress where user_id = uid and season_id = s.id for update;
  -- A match can't have lasted longer than the time since the previous one was recorded.
  if prog.last_match_at is not null
     and now() - prog.last_match_at < make_interval(secs => greatest(15, p_survived_s)) then
    raise exception 'too many matches';
  end if;

  xp_match := public.siege_match_xp(p_kills, p_placement, p_damage, p_chests, p_survived_s);

  -- Challenges live right now (mirrors activeChallenges() in src/lib/season.ts).
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

  return jsonb_build_object(
    'xp_match', xp_match,
    'xp_challenges', xp_ch,
    'xp_total', xp_after,
    'tier_before', least(s.tiers, prog.xp / s.tier_xp),
    'tier_after', least(s.tiers, xp_after / s.tier_xp),
    'unlocked', unlocked,
    'challenges', completed);
end;
$$;

-- Equip cosmetics you own (defaults are owned by everyone).
create or replace function public.set_loadout(p_outfit text, p_wrap text, p_banner text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_outfit not in ('recruit', 'ranger') and not exists (
       select 1 from public.player_cosmetics where user_id = uid and kind = 'outfit' and item_id = p_outfit)
     or p_wrap <> 'factory' and not exists (
       select 1 from public.player_cosmetics where user_id = uid and kind = 'wrap' and item_id = p_wrap)
     or p_banner <> 'rookie' and not exists (
       select 1 from public.player_cosmetics where user_id = uid and kind = 'banner' and item_id = p_banner) then
    raise exception 'item not owned';
  end if;
  insert into public.player_loadout (user_id, outfit, wrap, banner, updated_at)
    values (uid, p_outfit, p_wrap, p_banner, now())
    on conflict (user_id) do update
      set outfit = excluded.outfit, wrap = excluded.wrap, banner = excluded.banner, updated_at = now();
end;
$$;

revoke execute on function public.siege_match_xp(integer, integer, integer, integer, integer) from public, anon;
revoke execute on function public.record_siege_match(integer, integer, integer, integer, integer, integer) from public, anon;
revoke execute on function public.set_loadout(text, text, text) from public, anon;
grant execute on function public.siege_match_xp(integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.record_siege_match(integer, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.set_loadout(text, text, text) to authenticated;
