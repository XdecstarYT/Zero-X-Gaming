-- ZLink+: the Zero X membership. 40 coins for 30 days (joining again extends from wherever it runs to).
-- It includes every Sports+ game, UBusiness Ultimate and double daily rewards. Neon Siege (its battle
-- pass, item shop and Cash Cups) is not part of it. Owning Sports+ or UBusiness outright still works on
-- its own, member or not.

create table if not exists public.zlink_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz not null,
  joined_at timestamptz not null default now()
);
alter table public.zlink_members enable row level security;
create policy "members read their own membership" on public.zlink_members for select using (user_id = (select auth.uid()));
grant select on public.zlink_members to authenticated;

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason = any (array['cash_cup', 'battle_pass', 'shop', 'tier_reward', 'sports_pass', 'daily', 'ubusiness', 'owner', 'zlink']));

/** Is this player a member right now? (Internal.) */
create or replace function public.zlink__active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.zlink_members where user_id = p_user and until > now());
$$;

/** When your membership runs to (null if you've never joined). */
create or replace function public.zlink_until()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select until from public.zlink_members where user_id = (select auth.uid());
$$;

/** Join (or extend) for 40 coins: 30 more days from now, or from when it would have ended. */
create or replace function public.join_zlink()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  bal integer;
  ends timestamptz;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  perform pg_advisory_xact_lock(hashtext('zlink:' || uid::text));
  select greatest(now(), coalesce((select until from public.zlink_members where user_id = uid), now())) + interval '30 days' into ends;
  bal := public.add_coins(uid, -40, 'zlink', 'zlink-30d');
  insert into public.zlink_members (user_id, until) values (uid, ends)
    on conflict (user_id) do update set until = excluded.until;
  return jsonb_build_object('coins', bal, 'until', ends);
end;
$$;

/** Can you play Sports+? You own the pass, or you're a ZLink+ member. */
create or replace function public.has_sports_plus()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.player_unlocks where user_id = (select auth.uid()) and unlock_id = 'sports-plus')
    or public.zlink__active((select auth.uid())));
$$;

-- UBusiness: members get Ultimate.
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
    when public.zlink__active((select auth.uid())) then 'ultimate'
    when exists (
      select 1 from public.season_progress p join public.seasons s on s.id = p.season_id
       where p.user_id = (select auth.uid()) and p.has_pass and now() >= s.starts_at and now() < s.ends_at) then 'ultimate'
    when exists (select 1 from public.player_unlocks where user_id = (select auth.uid()) and unlock_id = 'ubusiness-lite') then 'lite'
    else null
  end;
$$;

-- Daily rewards: members get double.
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
  k integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtext('daily:' || uid::text));
  k := case when public.zlink__active(uid) then 2 else 1 end;
  select ref into done from public.coin_ledger where user_id = uid and reason = 'daily' and ref like today::text || ':%' limit 1;
  select ref into prev from public.coin_ledger where user_id = uid and reason = 'daily' and ref like (today - 1)::text || ':%' limit 1;
  if done is not null then
    day := split_part(done, ':', 2)::integer;
    select coins into bal from public.player_wallet where user_id = uid;
    return jsonb_build_object('claimed', true, 'day', day, 'coins_won', 0, 'coins', coalesce(bal, 0), 'next', public.daily_reward_day(day + 1) * k, 'zlink', k = 2);
  end if;
  day := case when prev is null then 1 else (split_part(prev, ':', 2)::integer % 7) + 1 end;
  if p_peek then
    select coins into bal from public.player_wallet where user_id = uid;
    return jsonb_build_object('claimed', false, 'day', day, 'coins_won', 0, 'coins', coalesce(bal, 0), 'next', public.daily_reward_day(day) * k, 'zlink', k = 2);
  end if;
  bal := public.add_coins(uid, public.daily_reward_day(day) * k, 'daily', today::text || ':' || day);
  return jsonb_build_object('claimed', true, 'day', day, 'coins_won', public.daily_reward_day(day) * k, 'coins', bal, 'next', public.daily_reward_day(day + 1) * k, 'zlink', k = 2);
end;
$$;

revoke all on function public.zlink__active(uuid) from public, anon, authenticated;
revoke all on function public.zlink_until() from public;
revoke all on function public.join_zlink() from public, anon;
revoke all on function public.has_sports_plus() from public;
grant execute on function public.zlink_until() to anon, authenticated;
grant execute on function public.join_zlink() to authenticated;
grant execute on function public.has_sports_plus() to anon, authenticated;
