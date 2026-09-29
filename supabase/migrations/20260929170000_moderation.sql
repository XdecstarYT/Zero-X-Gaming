-- Phase 6: basic report / moderation hook.
--
-- * Players report other players (today: offensive usernames, cheating) via report_content().
-- * Moderators review public.reports in the dashboard and can set profiles.is_hidden,
--   which removes a profile from every public leaderboard.
-- * target_type is open-ended so future user content (e.g. creator-submitted games) can reuse it.

alter table public.profiles add column is_hidden boolean not null default false;

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('profile')),
  target_id text not null check (char_length(target_id) between 1 and 100),
  reason text not null check (reason in ('offensive_name', 'cheating', 'harassment', 'other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index reports_open_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

create policy "Players read their own reports"
  on public.reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

revoke insert, update, delete on public.reports from anon, authenticated;

create or replace function public.report_content(
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_target_type = 'profile' then
    if p_target_id = uid::text then
      raise exception 'cannot report yourself' using errcode = '22023';
    end if;
    if not exists (select 1 from public.profiles p where p.id::text = p_target_id) then
      raise exception 'unknown target' using errcode = '22023';
    end if;
  end if;
  if (select count(*) from public.reports r where r.reporter_id = uid and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many reports' using errcode = '53400';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (uid, p_target_type, p_target_id, p_reason, nullif(btrim(p_details), ''))
  on conflict (reporter_id, target_type, target_id) do update
    set reason = excluded.reason, details = excluded.details, status = 'open', created_at = now();
end;
$$;

revoke execute on function public.report_content(text, text, text, text) from public, anon;
grant execute on function public.report_content(text, text, text, text) to authenticated;

-- Leaderboards skip hidden profiles.
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
        where p.xp > 0 and not p.is_hidden
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
        where not p.is_hidden
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
    where not p.is_hidden
    order by b.score desc, b.created_at asc
    limit lim;
end;
$$;
