-- Zero City: the Riviera DLC, a one-time unlock for 50 ZX Cash (coins). Three coastal maps,
-- the Riviera building look and four seaside landmarks. Kept in player_unlocks like Sports+.

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason = any (array['cash_cup', 'battle_pass', 'shop', 'tier_reward', 'sports_pass', 'daily', 'ubusiness', 'owner', 'zlink', 'zero_city']));

/** Do you own the Riviera DLC? */
create or replace function public.zero_city_dlc_owned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and exists (select 1 from public.player_unlocks where user_id = (select auth.uid()) and unlock_id = 'zero-city-riviera');
$$;

/** Buy the Riviera DLC: 50 coins, once. */
create or replace function public.buy_zero_city_dlc()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  balance integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  perform pg_advisory_xact_lock(hashtext('zero-city-dlc:' || uid::text));
  if exists (select 1 from public.player_unlocks where user_id = uid and unlock_id = 'zero-city-riviera') then
    raise exception 'already owned';
  end if;
  balance := public.add_coins(uid, -50, 'zero_city', 'zero-city-riviera');
  insert into public.player_unlocks (user_id, unlock_id) values (uid, 'zero-city-riviera');
  return jsonb_build_object('coins', balance);
end;
$$;

revoke all on function public.zero_city_dlc_owned() from public;
revoke all on function public.buy_zero_city_dlc() from public, anon;
grant execute on function public.zero_city_dlc_owned() to anon, authenticated;
grant execute on function public.buy_zero_city_dlc() to authenticated;
