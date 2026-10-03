-- UBusiness: a store-running sim in two editions. Lite is 5 coins; Ultimate is 30 (25 more if
-- you already own Lite), and free for anyone holding this season's battle pass. Both are
-- one-time unlocks in player_unlocks.

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason = any (array['cash_cup', 'battle_pass', 'shop', 'tier_reward', 'sports_pass', 'daily', 'ubusiness']));

-- The edition you can play: 'ultimate', 'lite' or null.
create or replace function public.ubusiness_tier()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then null
    when exists (select 1 from public.player_unlocks where user_id = (select auth.uid()) and unlock_id = 'ubusiness-ultimate') then 'ultimate'
    when exists (
      select 1 from public.season_progress p join public.seasons s on s.id = p.season_id
       where p.user_id = (select auth.uid()) and p.has_pass and now() >= s.starts_at and now() < s.ends_at) then 'ultimate'
    when exists (select 1 from public.player_unlocks where user_id = (select auth.uid()) and unlock_id = 'ubusiness-lite') then 'lite'
    else null
  end;
$$;

create or replace function public.buy_ubusiness(p_tier text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  current text;
  price integer;
  balance integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_tier not in ('lite', 'ultimate') then
    raise exception 'no such edition';
  end if;
  perform pg_advisory_xact_lock(hashtext('ubusiness:' || uid::text));
  current := public.ubusiness_tier();
  if current = 'ultimate' or (current = 'lite' and p_tier = 'lite') then
    raise exception 'already owned';
  end if;
  price := case when p_tier = 'lite' then 5 when current = 'lite' then 25 else 30 end;
  balance := public.add_coins(uid, -price, 'ubusiness', 'ubusiness-' || p_tier);
  insert into public.player_unlocks (user_id, unlock_id) values (uid, 'ubusiness-' || p_tier) on conflict do nothing;
  return jsonb_build_object('coins', balance, 'tier', p_tier);
end;
$$;

revoke all on function public.ubusiness_tier() from public;
revoke all on function public.buy_ubusiness(text) from public, anon;
grant execute on function public.ubusiness_tier() to anon, authenticated;
grant execute on function public.buy_ubusiness(text) to authenticated;

-- Scored by the business's value (dollars over a hundred); a big store runs to tens of thousands.
insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('ubusiness', 'UBusiness', 'sim', 'live', 200000, 60, 20)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;
