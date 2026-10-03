-- Daily rewards: come back every day for coins, on a seven-day cycle (5, 5, 10, 10, 15, 20, then 50 on day 7).
-- Miss a day and the cycle starts again. Claims are coin-ledger rows (reason 'daily', ref 'YYYY-MM-DD:day'), so
-- one a day is enforced by the ledger itself and the history is the audit trail.

-- A new reason for coins.
alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check check (reason = any (array['cash_cup', 'battle_pass', 'shop', 'tier_reward', 'sports_pass', 'daily']));

create or replace function public.daily_reward_day(p_n integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (array[5, 5, 10, 10, 15, 20, 50])[((greatest(p_n, 1) - 1) % 7) + 1];
$$;

create or replace function public.claim_daily_reward(p_peek boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (now() at time zone 'utc')::date;
  done text;
  prev text;
  day integer;
  bal integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  -- One claim at a time per player.
  perform pg_advisory_xact_lock(hashtext('daily:' || uid::text));
  select ref into done from public.coin_ledger where user_id = uid and reason = 'daily' and ref like today::text || ':%' limit 1;
  select ref into prev from public.coin_ledger where user_id = uid and reason = 'daily' and ref like (today - 1)::text || ':%' limit 1;
  if done is not null then
    day := split_part(done, ':', 2)::integer;
    select coins into bal from public.player_wallet where user_id = uid;
    return jsonb_build_object('claimed', true, 'day', day, 'coins_won', 0, 'coins', coalesce(bal, 0), 'next', public.daily_reward_day(day + 1));
  end if;
  day := case when prev is null then 1 else (split_part(prev, ':', 2)::integer % 7) + 1 end;
  if p_peek then
    select coins into bal from public.player_wallet where user_id = uid;
    return jsonb_build_object('claimed', false, 'day', day, 'coins_won', 0, 'coins', coalesce(bal, 0), 'next', public.daily_reward_day(day));
  end if;
  bal := public.add_coins(uid, public.daily_reward_day(day), 'daily', today::text || ':' || day);
  return jsonb_build_object('claimed', true, 'day', day, 'coins_won', public.daily_reward_day(day), 'coins', bal, 'next', public.daily_reward_day(day + 1));
end;
$$;

revoke execute on function public.claim_daily_reward(boolean) from public, anon;
grant execute on function public.claim_daily_reward(boolean) to authenticated;
