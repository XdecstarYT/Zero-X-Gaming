-- Zero X | Gaming: initial schema (Phase 2)
--
-- Security model:
--   * RLS is enabled on every table.
--   * Clients never write scores, XP, streaks or achievements directly. Those change only
--     through SECURITY DEFINER functions (submit_score, touch_daily_streak) or triggers.
--   * Private data (favorites, play_sessions, daily_streaks, a player's raw scores) is
--     readable only by its owner. Leaderboards are exposed read-only via get_leaderboard().

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- games: catalog + plausibility limits used by submit_score
-- ---------------------------------------------------------------------------

create table public.games (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  title text not null check (char_length(title) between 1 and 60),
  category text not null check (category in ('arcade', 'puzzle', 'runner', 'trivia')),
  status text not null default 'coming_soon' check (status in ('live', 'coming_soon', 'retired')),
  max_score integer not null check (max_score > 0),
  max_score_per_second numeric not null check (max_score_per_second > 0),
  created_at timestamptz not null default now()
);

alter table public.games enable row level security;

create policy "Games are public"
  on public.games for select
  to anon, authenticated
  using (true);

-- Games are registered but not live yet; score submission is refused until status = 'live'.
insert into public.games (slug, title, category, status, max_score, max_score_per_second) values
  ('zero-dash',    'Zero Dash',    'runner', 'coming_soon', 1000000, 250),
  ('grid-lock',    'Grid Lock',    'puzzle', 'coming_soon',  500000, 500),
  ('orbit',        'Orbit',        'arcade', 'coming_soon', 1000000, 300),
  ('blitz-trivia', 'Blitz Trivia', 'trivia', 'coming_soon',   50000, 1000);

-- ---------------------------------------------------------------------------
-- profiles: one per auth user, public (username / avatar / xp appear on boards)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  xp bigint not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create policy "Profiles are public"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Players update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Players may only change cosmetic columns; xp is server-managed.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- scores: written only by submit_score(); owners can read their own history
-- ---------------------------------------------------------------------------

create table public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_slug text not null references public.games (slug),
  score integer not null check (score >= 0),
  duration_ms integer not null check (duration_ms > 0),
  created_at timestamptz not null default now()
);

create index scores_game_time_score_idx on public.scores (game_slug, created_at desc, score desc);
create index scores_user_time_idx on public.scores (user_id, created_at desc);

alter table public.scores enable row level security;

create policy "Players read their own scores"
  on public.scores for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.scores from anon, authenticated;

-- ---------------------------------------------------------------------------
-- achievements (catalog) + player_achievements (earned, shown on public profiles)
-- ---------------------------------------------------------------------------

create table public.achievements (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  description text not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'neon')),
  xp_reward integer not null default 0 check (xp_reward >= 0),
  created_at timestamptz not null default now()
);

alter table public.achievements enable row level security;

create policy "Achievements are public"
  on public.achievements for select
  to anon, authenticated
  using (true);

insert into public.achievements (id, name, description, tier, xp_reward) values
  ('first-run',   'First Run',   'Finish your first game.',              'bronze', 50),
  ('streak-7',    'On Fire',     'Log in 7 days in a row.',              'silver', 150),
  ('top-10',      'Top Ten',     'Place top 10 on any daily board.',     'gold',   300),
  ('all-rounder', 'All-Rounder', 'Score in every launch game.',          'neon',   500);

create table public.player_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index player_achievements_achievement_idx on public.player_achievements (achievement_id);

alter table public.player_achievements enable row level security;

create policy "Earned badges are public"
  on public.player_achievements for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.player_achievements from anon, authenticated;

-- ---------------------------------------------------------------------------
-- favorites: private, owner read/write
-- ---------------------------------------------------------------------------

create table public.favorites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  game_slug text not null references public.games (slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_slug)
);

create index favorites_game_idx on public.favorites (game_slug);

alter table public.favorites enable row level security;

create policy "Players read their own favorites"
  on public.favorites for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Players add their own favorites"
  on public.favorites for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Players remove their own favorites"
  on public.favorites for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.favorites from anon, authenticated;

-- ---------------------------------------------------------------------------
-- play_sessions: private "recently played" / history
-- ---------------------------------------------------------------------------

create table public.play_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  game_slug text not null references public.games (slug) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

create index play_sessions_user_time_idx on public.play_sessions (user_id, started_at desc);
create index play_sessions_game_idx on public.play_sessions (game_slug);

alter table public.play_sessions enable row level security;

create policy "Players read their own sessions"
  on public.play_sessions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Players start their own sessions"
  on public.play_sessions for insert
  to authenticated
  with check (user_id = (select auth.uid()));

revoke update, delete on public.play_sessions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- daily_streaks: private, maintained by touch_daily_streak()
-- ---------------------------------------------------------------------------

create table public.daily_streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_active_date date
);

alter table public.daily_streaks enable row level security;

create policy "Players read their own streak"
  on public.daily_streaks for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.daily_streaks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- New user → profile + streak row
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base text;
  candidate text;
begin
  base := regexp_replace(
    coalesce(
      meta ->> 'username',
      meta ->> 'preferred_username',
      meta ->> 'user_name',
      meta ->> 'full_name',
      meta ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    '[^A-Za-z0-9_]', '', 'g'
  );
  base := left(coalesce(base, ''), 14);
  if char_length(base) < 3 then
    base := 'player';
  end if;

  candidate := base;
  while exists (select 1 from public.profiles p where p.username = candidate::extensions.citext) loop
    candidate := base || '_' || floor(random() * 100000)::int::text;
  end loop;

  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    candidate,
    case when meta ->> 'avatar_url' ~ '^https://' then meta ->> 'avatar_url' end
  );

  insert into public.daily_streaks (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPC: touch_daily_streak() — call once per app load when signed in
-- ---------------------------------------------------------------------------

create or replace function public.touch_daily_streak()
returns table (current_streak integer, longest_streak integer, last_active_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

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

  return query
    select d.current_streak, d.longest_streak, d.last_active_date
    from public.daily_streaks d
    where d.user_id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit_score() — the only way a score enters the database
-- ---------------------------------------------------------------------------

create or replace function public.submit_score(p_game_slug text, p_score integer, p_duration_ms integer)
returns table (score_id bigint, personal_best integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.games%rowtype;
  new_id bigint;
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

  -- Plausibility checks.
  if p_score is null or p_score < 0 or p_score > g.max_score then
    raise exception 'score out of range' using errcode = '22023';
  end if;
  if p_duration_ms is null or p_duration_ms < 1000 or p_duration_ms > 2 * 60 * 60 * 1000 then
    raise exception 'duration out of range' using errcode = '22023';
  end if;
  if p_score > ceil(g.max_score_per_second * (p_duration_ms / 1000.0)) then
    raise exception 'score not plausible for duration' using errcode = '22023';
  end if;

  -- Rate limits: one run per 5s per game, 120 runs per hour overall.
  if exists (
    select 1 from public.scores s
    where s.user_id = uid and s.game_slug = p_game_slug and s.created_at > now() - interval '5 seconds'
  ) then
    raise exception 'too many submissions' using errcode = '53400';
  end if;
  if (select count(*) from public.scores s where s.user_id = uid and s.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'too many submissions' using errcode = '53400';
  end if;

  insert into public.scores (user_id, game_slug, score, duration_ms)
  values (uid, p_game_slug, p_score, p_duration_ms)
  returning id into new_id;

  return query
    select new_id, max(s.score)
    from public.scores s
    where s.user_id = uid and s.game_slug = p_game_slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: get_leaderboard() — read-only boards
--   p_game_slug null → global board by total XP (period ignored until XP history exists)
--   p_period: 'daily' | 'weekly' | 'all' (UTC; weeks start Monday)
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

  if p_game_slug is null then
    return query
      select row_number() over (order by p.xp desc, p.created_at asc),
             p.id, p.username::text, p.avatar_url, p.xp, p.xp
      from public.profiles p
      where p.xp > 0
      order by p.xp desc, p.created_at asc
      limit lim;
    return;
  end if;

  since := case p_period
    when 'daily' then date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    when 'weekly' then date_trunc('week', now() at time zone 'utc') at time zone 'utc'
    else '-infinity'::timestamptz
  end;

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

-- ---------------------------------------------------------------------------
-- Function privileges (Postgres grants EXECUTE to PUBLIC by default)
-- ---------------------------------------------------------------------------

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_daily_streak() from public, anon;
revoke execute on function public.submit_score(text, integer, integer) from public, anon;
revoke execute on function public.get_leaderboard(text, text, integer) from public;

grant execute on function public.touch_daily_streak() to authenticated;
grant execute on function public.submit_score(text, integer, integer) to authenticated;
grant execute on function public.get_leaderboard(text, text, integer) to anon, authenticated;
