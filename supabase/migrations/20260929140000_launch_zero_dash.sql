-- Phase 3: Zero Dash ships.
-- Also shortens the per-game submission cooldown from 5s to 2s: a runner can die
-- within a few seconds and players replay immediately.

update public.games set status = 'live' where slug = 'zero-dash';

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

  insert into public.scores (user_id, game_slug, score, duration_ms)
  values (uid, p_game_slug, p_score, p_duration_ms)
  returning id into new_id;

  return query
    select new_id, max(s.score)
    from public.scores s
    where s.user_id = uid and s.game_slug = p_game_slug;
end;
$$;

revoke execute on function public.submit_score(text, integer, integer) from public, anon;
grant execute on function public.submit_score(text, integer, integer) to authenticated;
