-- Fix: `text[] || 'literal'` parses the literal as an array ("malformed array literal").
-- Use array_append() when recording newly unlocked achievements.

create or replace function public.submit_score(p_game_slug text, p_score integer, p_duration_ms integer)
returns table (
  score_id bigint,
  personal_best integer,
  is_personal_best boolean,
  xp_gained integer,
  total_xp bigint,
  daily_rank integer,
  new_achievements text[]
)
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

  -- Run XP
  run_xp := 10 + least(floor(p_score / g.xp_divisor)::integer, 190);
  perform public.award_xp(uid, run_xp, 'run', p_game_slug);
  gained := run_xp;

  -- Achievements
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

  -- Today's rank on this game's daily board (UTC).
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


create or replace function public.touch_daily_streak()
returns table (
  current_streak integer,
  longest_streak integer,
  last_active_date date,
  xp_gained integer,
  new_achievements text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  prev date;
  streak integer;
  gained integer := 0;
  unlocked text[] := '{}';
  reward integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select d.last_active_date into prev from public.daily_streaks d where d.user_id = uid for update;

  insert into public.daily_streaks as d (user_id, current_streak, longest_streak, last_active_date)
  values (uid, 1, 1, today)
  on conflict (user_id) do update
    set current_streak = case
          when d.last_active_date = today then d.current_streak
          when d.last_active_date = today - 1 then d.current_streak + 1
          else 1
        end,
        longest_streak = greatest(
          d.longest_streak,
          case
            when d.last_active_date = today then d.current_streak
            when d.last_active_date = today - 1 then d.current_streak + 1
            else 1
          end
        ),
        last_active_date = today;

  select d.current_streak into streak from public.daily_streaks d where d.user_id = uid;

  if prev is distinct from today then
    gained := least(streak, 7) * 10;
    perform public.award_xp(uid, gained, 'daily_login', today::text);
    if streak >= 7 then
      reward := public.grant_achievement(uid, 'streak-7');
      if reward is not null then
        gained := gained + reward;
        unlocked := array_append(unlocked, 'streak-7');
      end if;
    end if;
  end if;

  return query
    select d.current_streak, d.longest_streak, d.last_active_date, gained, unlocked
    from public.daily_streaks d
    where d.user_id = uid;
end;
$$;

