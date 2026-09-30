-- Trenches: the Frontline mode and its Cape Helles map ('helles').
-- Widens the trenches_matches checks and the record_trenches_match validation;
-- Frontline battles last up to 25 minutes, so the duration cap goes to 1560 s.
-- Everything else about the RPC (rate limits, XP, rewards) is unchanged.

alter table public.trenches_matches drop constraint if exists trenches_matches_front_check;
alter table public.trenches_matches add constraint trenches_matches_front_check
  check (front in ('gallipoli', 'somme', 'verdun', 'passchendaele', 'vimy', 'helles'));
alter table public.trenches_matches drop constraint if exists trenches_matches_mode_check;
alter table public.trenches_matches add constraint trenches_matches_mode_check
  check (mode in ('conquest', 'breakthrough', 'frontline'));

create or replace function public.record_trenches_match(
  p_kills integer, p_deaths integer, p_captures integer, p_won boolean, p_duration_s integer,
  p_damage integer, p_digs integer, p_players integer, p_front text, p_mode text
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
  if p_players is null or p_players < 2 or p_players > 32
     or p_duration_s is null or p_duration_s < 20 or p_duration_s > 1560
     or p_kills is null or p_kills < 0 or p_kills > least(120, p_duration_s / 4)
     or p_deaths is null or p_deaths < 0 or p_deaths > p_duration_s / 3
     or p_captures is null or p_captures < 0 or p_captures > least(30, p_duration_s / 8)
     or p_damage is null or p_damage < 0 or p_damage > least(40000, p_duration_s * 120)
     or p_digs is null or p_digs < 0 or p_digs > least(400, p_duration_s)
     or p_won is null
     or p_front not in ('gallipoli', 'somme', 'verdun', 'passchendaele', 'vimy', 'helles')
     or p_mode not in ('conquest', 'breakthrough', 'frontline') then
    raise exception 'match not plausible';
  end if;

  insert into public.season_progress (user_id, season_id) values (uid, s.id) on conflict do nothing;
  select * into prog from public.season_progress where user_id = uid and season_id = s.id for update;
  if prog.last_match_at is not null
     and now() - prog.last_match_at < make_interval(secs => greatest(20, p_duration_s)) then
    raise exception 'too many matches';
  end if;

  xp_match := public.trenches_match_xp(p_kills, p_captures, p_won, p_duration_s, p_digs);

  -- Same challenges as Neon Siege: a win counts as a win and a top-10 finish.
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
      when 'wins' then p_won::integer
      when 'top10' then p_won::integer
      when 'damage' then p_damage
      when 'matches' then 1
      when 'survive' then least(p_duration_s, 900)
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
    wins = wins + p_won::integer,
    kills = kills + p_kills,
    last_match_at = now()
  where user_id = uid and season_id = s.id;

  insert into public.trenches_matches
    (user_id, season_id, front, mode, kills, deaths, captures, won, duration_s, damage, digs, xp)
    values (uid, s.id, p_front, p_mode, p_kills, p_deaths, p_captures, p_won, p_duration_s, p_damage, p_digs,
            xp_match + xp_ch);

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

  -- Free-lane coins are paid by the season_progress trigger; report the balance.
  balance := public.add_coins(uid, 0, 'trenches', 'battle');

  return jsonb_build_object(
    'xp_match', xp_match,
    'xp_challenges', xp_ch,
    'xp_total', xp_after,
    'tier_before', least(s.tiers, prog.xp / s.tier_xp),
    'tier_after', least(s.tiers, xp_after / s.tier_xp),
    'unlocked', unlocked,
    'challenges', completed,
    'cash_cup', false,
    'coins_won', 0,
    'coins', balance,
    'has_pass', prog.has_pass);
end;
$$;

revoke execute on function public.record_trenches_match(integer, integer, integer, boolean, integer, integer, integer, integer, text, text) from public, anon;
grant execute on function public.record_trenches_match(integer, integer, integer, boolean, integer, integer, integer, integer, text, text) to authenticated;
