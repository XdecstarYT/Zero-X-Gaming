-- UBusiness launch offer: anyone signed in can claim Ultimate for free until the end of 31 October
-- 2026 (anywhere on Earth, so the 31st counts in every time zone). A claimed copy is theirs to keep:
-- it's an ordinary 'ubusiness-ultimate' unlock, no coins change hands.

create or replace function public.ubusiness_free_until()
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select timestamptz '2026-11-01 12:00:00+00';
$$;

create or replace function public.claim_ubusiness_free()
returns jsonb
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
  if now() >= public.ubusiness_free_until() then
    raise exception 'The free Ultimate offer has ended';
  end if;
  perform pg_advisory_xact_lock(hashtext('ubusiness:' || uid::text));
  if exists (select 1 from public.player_unlocks where user_id = uid and unlock_id = 'ubusiness-ultimate') then
    raise exception 'already owned';
  end if;
  insert into public.player_unlocks (user_id, unlock_id) values (uid, 'ubusiness-ultimate') on conflict do nothing;
  return jsonb_build_object('tier', 'ultimate');
end;
$$;

revoke all on function public.ubusiness_free_until() from public;
revoke all on function public.claim_ubusiness_free() from public, anon;
grant execute on function public.ubusiness_free_until() to anon, authenticated;
grant execute on function public.claim_ubusiness_free() to authenticated;
