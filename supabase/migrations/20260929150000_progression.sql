-- Phase 4: XP, achievements, daily login rewards, period-based global boards.
--
-- XP is only ever granted by server functions and is recorded in an append-only
-- ledger (xp_events) so daily/weekly global boards can sum XP earned in a window.

-- ---------------------------------------------------------------------------
-- XP ledger
-- ---------------------------------------------------------------------------

create table public.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount > 0),
  reason text not null check (reason in ('run', 'achievement', 'daily_login')),
  ref text,
  created_at timestamptz not null default now()
);

create index xp_events_time_idx on public.xp_events (created_at, user_id);
create index xp_events_user_idx on public.xp_events (user_id, created_at desc);

alter table public.xp_events enable row level security;

create policy "Players read their own XP history"
  on public.xp_events for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.xp_events from anon, authenticated;

-- Per-game XP rate: run XP = 10 + min(floor(score / xp_divisor), 190).
alter table public.games add column xp_divisor numeric not null default 10 check (xp_divisor > 0);
update public.games set xp_divisor = 20 where slug = 'zero-dash';
update public.games set xp_divisor = 50 where slug = 'grid-lock';
update public.games set xp_divisor = 20 where slug = 'orbit';
update public.games set xp_divisor = 50 where slug = 'blitz-trivia';

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

create or replace function public.award_xp(p_user uuid, p_amount integer, p_reason text, p_ref text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount <= 0 then
    return;
  end if;
  insert into public.xp_events (user_id, amount, reason, ref) values (p_user, p_amount, p_reason, p_ref);
  update public.profiles set xp = xp + p_amount where id = p_user;
end;
$$;

/** Grants an achievement once. Returns its xp_reward if newly granted, else null. */
create or replace function public.grant_achievement(p_user uuid, p_achievement text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reward integer;
begin
  insert into public.player_achievements (user_id, achievement_id)
  values (p_user, p_achievement)
  on conflict do nothing;
  if not found then
    return null;
  end if;
  select a.xp_reward into reward from public.achievements a where a.id = p_achievement;
  perform public.award_xp(p_user, coalesce(reward, 0), 'achievement', p_achievement);
  return coalesce(reward, 0);
end;
$$;

revoke execute on function public.award_xp(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.grant_achievement(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_score: now also awards XP and achievements
-- ---------------------------------------------------------------------------

drop function public.submit_score(text, integer, integer);

create function public.submit_score(p_game_slug text, p_score integer, p_duration_ms integer)
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
    unlocked := unlocked || 'first-run';
  end if;

  if (
    select count(distinct s.game_slug) from public.scores s
    where s.user_id = uid and s.game_slug in ('zero-dash', 'grid-lock', 'orbit', 'blitz-trivia') and s.score > 0
  ) = 4 then
    reward := public.grant_achievement(uid, 'all-rounder');
    if reward is not null then
      gained := gained + reward;
      unlocked := unlocked || 'all-rounder';
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
      unlocked := unlocked || 'top-10';
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

revoke execute on function public.submit_score(text, integer, integer) from public, anon;
grant execute on function public.submit_score(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- touch_daily_streak: first visit each UTC day grants XP (10 × streak, max 70); 7 days unlocks "On Fire"
-- ---------------------------------------------------------------------------

drop function public.touch_daily_streak();

create function public.touch_daily_streak()
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
        unlocked := unlocked || 'streak-7';
      end if;
    end if;
  end if;

  return query
    select d.current_streak, d.longest_streak, d.last_active_date, gained, unlocked
    from public.daily_streaks d
    where d.user_id = uid;
end;
$$;

revoke execute on function public.touch_daily_streak() from public, anon;
grant execute on function public.touch_daily_streak() to authenticated;

-- ---------------------------------------------------------------------------
-- get_leaderboard: global board now supports daily / weekly via the XP ledger
-- ---------------------------------------------------------------------------

create or replace function public.get_leaderboard(
  p_game_slug text default null,
  p_period text default 'weekly',
  p_limit integer default 10
)
returns table (rank bigint, user_id uuid, username text, avatar_url text, xp bigint, score bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim integer := least(greatest(coalesce(p_limit, 10), 1), 100);
  since timestamptz;
begin
  if p_period not in ('daily', 'weekly', 'all') then
    raise exception 'invalid period' using errcode = '22023';
  end if;

  since := case p_period
    when 'daily' then date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    when 'weekly' then date_trunc('week', now() at time zone 'utc') at time zone 'utc'
    else '-infinity'::timestamptz
  end;

  if p_game_slug is null then
    if p_period = 'all' then
      return query
        select row_number() over (order by p.xp desc, p.created_at asc),
               p.id, p.username::text, p.avatar_url, p.xp, p.xp
        from public.profiles p
        where p.xp > 0
        order by p.xp desc, p.created_at asc
        limit lim;
    else
      return query
        with earned as (
          select e.user_id, sum(e.amount)::bigint as total, max(e.created_at) as last_at
          from public.xp_events e
          where e.created_at >= since
          group by e.user_id
        )
        select row_number() over (order by x.total desc, x.last_at asc),
               p.id, p.username::text, p.avatar_url, p.xp, x.total
        from earned x
        join public.profiles p on p.id = x.user_id
        order by x.total desc, x.last_at asc
        limit lim;
    end if;
    return;
  end if;

  return query
    with best as (
      select distinct on (s.user_id) s.user_id, s.score, s.created_at
      from public.scores s
      where s.game_slug = p_game_slug and s.created_at >= since
      order by s.user_id, s.score desc, s.created_at asc
    )
    select row_number() over (order by b.score desc, b.created_at asc),
           p.id, p.username::text, p.avatar_url, p.xp, b.score::bigint
    from best b
    join public.profiles p on p.id = b.user_id
    order by b.score desc, b.created_at asc
    limit lim;
end;
$$;

revoke execute on function public.get_leaderboard(text, text, integer) from public;
grant execute on function public.get_leaderboard(text, text, integer) to anon, authenticated;
