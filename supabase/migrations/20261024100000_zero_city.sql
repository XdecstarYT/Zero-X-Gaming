-- Zero City, the ZLink+ city builder. Its score is the city's population;
-- the save lives on the device and the game posts when a city has grown, so
-- the per-second cap is generous (a big city can be posted early in a
-- session). Members only, like Linkwave and Zenith.
insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('zero-city', 'Zero City', 'sim', 'live', 2000000, 20000, 150)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;

-- Scores: Zero City joins the members-only games (the rest is unchanged).
create or replace function public.submit_score(p_game_slug text, p_score integer, p_duration_ms integer)
returns table(score_id bigint, personal_best integer, is_personal_best boolean, xp_gained integer, total_xp bigint, daily_rank integer, new_achievements text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.games%rowtype;
  new_id bigint;
  prev_best integer;
  run_xp integer;
  gained integer := 0;
  unlocked text[] := '{}';
  reward integer;
  my_daily integer;
  rank_today integer;
  member boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into g from public.games where slug = p_game_slug;
  if not found then
    raise exception 'unknown game' using errcode = '22023';
  end if;
  if g.status <> 'live' then
    raise exception 'game is not accepting scores' using errcode = '22023';
  end if;
  member := public.zlink__active(uid);
  if p_game_slug in ('linkwave', 'zenith', 'zero-city') and not member then
    raise exception 'ZLink+ members only' using errcode = '42501';
  end if;

  if p_score is null or p_score < 0 or p_score > g.max_score then
    raise exception 'score out of range' using errcode = '22023';
  end if;
  if p_duration_ms is null or p_duration_ms < 1000 or p_duration_ms > 2 * 60 * 60 * 1000 then
    raise exception 'duration out of range' using errcode = '22023';
  end if;
  if p_score > ceil(g.max_score_per_second * (p_duration_ms / 1000.0)) then
    raise exception 'score not plausible for duration' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.scores s
    where s.user_id = uid and s.game_slug = p_game_slug and s.created_at > now() - interval '2 seconds'
  ) then
    raise exception 'too many submissions' using errcode = '53400';
  end if;
  if (select count(*) from public.scores s where s.user_id = uid and s.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'too many submissions' using errcode = '53400';
  end if;

  select max(s.score) into prev_best from public.scores s where s.user_id = uid and s.game_slug = p_game_slug;

  insert into public.scores (user_id, game_slug, score, duration_ms)
  values (uid, p_game_slug, p_score, p_duration_ms)
  returning id into new_id;

  run_xp := 10 + least(floor(p_score / g.xp_divisor)::integer, 190);
  if member and p_game_slug <> 'neon-siege' then
    run_xp := round(run_xp * 1.25)::integer;
  end if;
  perform public.award_xp(uid, run_xp, 'run', p_game_slug);
  gained := run_xp;

  reward := public.grant_achievement(uid, 'first-run');
  if reward is not null then
    gained := gained + reward;
    unlocked := array_append(unlocked, 'first-run');
  end if;

  if (
    select count(distinct s.game_slug) from public.scores s
    where s.user_id = uid and s.game_slug in ('zero-dash', 'grid-lock', 'orbit', 'blitz-trivia') and s.score > 0
  ) = 4 then
    reward := public.grant_achievement(uid, 'all-rounder');
    if reward is not null then
      gained := gained + reward;
      unlocked := array_append(unlocked, 'all-rounder');
    end if;
  end if;

  select max(s.score) into my_daily
  from public.scores s
  where s.user_id = uid and s.game_slug = p_game_slug
    and s.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

  select 1 + count(*) into rank_today
  from (
    select s.user_id
    from public.scores s
    where s.game_slug = p_game_slug
      and s.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
      and s.user_id <> uid
    group by s.user_id
    having max(s.score) > my_daily
  ) better;

  if rank_today <= 10 and my_daily > 0 then
    reward := public.grant_achievement(uid, 'top-10');
    if reward is not null then
      gained := gained + reward;
      unlocked := array_append(unlocked, 'top-10');
    end if;
  end if;

  return query
    select new_id,
           greatest(coalesce(prev_best, 0), p_score),
           prev_best is null or p_score > prev_best,
           gained,
           (select p.xp from public.profiles p where p.id = uid),
           rank_today,
           unlocked;
end;
$$;
