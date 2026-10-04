-- The owner panel. One account (the site owner's, by its email) can see the site's numbers and run it:
-- a site-wide announcement, taking a game down for maintenance, granting or taking coins, hiding a
-- player from the boards, and working through reports. Everything goes through owner-only functions;
-- the settings table is readable by everyone (the banner and the maintenance list are public).

create or replace function public.site__owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
     where id = (select auth.uid()) and lower(email) = 'decmar098@gmail.com');
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.site__owner();
$$;

create table if not exists public.site_settings (
  key text primary key check (key in ('announcement', 'maintenance')),
  -- Null means cleared.
  value jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
create policy "site settings are public" on public.site_settings for select using (true);
grant select on public.site_settings to anon, authenticated;

-- Coins the owner grants (or takes back) are their own kind of ledger entry.
alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason = any (array['cash_cup', 'battle_pass', 'shop', 'tier_reward', 'sports_pass', 'daily', 'ubusiness', 'owner']));

create or replace function public.owner__check()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.site__owner() then
    raise exception 'owner only';
  end if;
end;
$$;

/** Set or clear (null) a site setting, checked. */
create or replace function public.owner_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text;
begin
  perform public.owner__check();
  if p_key not in ('announcement', 'maintenance') then
    raise exception 'no such setting';
  end if;
  if p_value is null or p_value = 'null'::jsonb then
    insert into public.site_settings (key, value, updated_at) values (p_key, null, now())
      on conflict (key) do update set value = null, updated_at = now();
    return;
  end if;
  if p_key = 'announcement' then
    t := p_value ->> 'text';
    if t is null or char_length(btrim(t)) < 2 or char_length(t) > 200 then
      raise exception 'Announcements are 2 to 200 characters';
    end if;
    if coalesce(p_value ->> 'tone', 'info') not in ('info', 'success', 'warning', 'event') then
      raise exception 'Unknown tone';
    end if;
    if p_value ? 'href' and (p_value ->> 'href') !~ '^/[A-Za-z0-9/_?=&#.-]*$' then
      raise exception 'Links must be to a page on this site (start with /)';
    end if;
    p_value := jsonb_build_object('text', btrim(t), 'tone', coalesce(p_value ->> 'tone', 'info'), 'href', p_value -> 'href', 'id', extract(epoch from now())::bigint);
  else
    if jsonb_typeof(p_value -> 'games') <> 'array' then
      raise exception 'maintenance needs a games list';
    end if;
    p_value := jsonb_build_object('games', coalesce((
      select jsonb_agg(distinct g) from jsonb_array_elements_text(p_value -> 'games') g
       where exists (select 1 from public.games where slug = g)), '[]'::jsonb));
  end if;
  insert into public.site_settings (key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

/** Everything the owner panel shows, in one call. */
create or replace function public.owner_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.seasons;
begin
  perform public.owner__check();
  select * into s from public.seasons where now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
  return jsonb_build_object(
    'players', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'new24h', (select count(*) from public.profiles where created_at > now() - interval '1 day'),
      'new7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'active7d', (select count(distinct user_id) from public.scores where created_at > now() - interval '7 days'),
      'hidden', (select count(*) from public.profiles where is_hidden)),
    'plays', jsonb_build_object(
      'total', (select count(*) from public.scores),
      'day', (select count(*) from public.scores where created_at > now() - interval '1 day'),
      'week', (select count(*) from public.scores where created_at > now() - interval '7 days'),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object('day', d::date, 'plays', (select count(*) from public.scores sc where sc.created_at >= d and sc.created_at < d + interval '1 day')) order by d)
          from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d), '[]'::jsonb)),
    'games', coalesce((
      select jsonb_agg(jsonb_build_object('slug', g.slug, 'title', g.title, 'status', g.status,
          'plays', (select count(*) from public.scores sc where sc.game_slug = g.slug),
          'week', (select count(*) from public.scores sc where sc.game_slug = g.slug and sc.created_at > now() - interval '7 days'),
          'best', (select max(score) from public.scores sc where sc.game_slug = g.slug))
          order by g.title)
        from public.games g), '[]'::jsonb),
    'economy', jsonb_build_object(
      'coins', (select coalesce(sum(coins), 0) from public.player_wallet),
      'wallets', (select count(*) from public.player_wallet where coins > 0),
      'passHolders', (select count(*) from public.season_progress where season_id = s.id and has_pass),
      'season', s.id,
      'unlocks', coalesce((select jsonb_object_agg(unlock_id, n) from (select unlock_id, count(*) n from public.player_unlocks group by unlock_id) u), '{}'::jsonb),
      'spent7d', (select coalesce(-sum(amount), 0) from public.coin_ledger where amount < 0 and created_at > now() - interval '7 days'),
      'earned7d', (select coalesce(sum(amount), 0) from public.coin_ledger where amount > 0 and created_at > now() - interval '7 days')),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('username', username, 'xp', xp, 'hidden', is_hidden, 'joined', created_at) order by xp desc)
        from (select * from public.profiles order by xp desc limit 10) t), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('username', username, 'xp', xp, 'hidden', is_hidden, 'joined', created_at) order by created_at desc)
        from (select * from public.profiles order by created_at desc limit 10) t), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'target', coalesce((select username::text from public.profiles where id::text = r.target_id), r.target_id),
          'reason', r.reason, 'details', r.details, 'at', r.created_at,
          'by', (select username::text from public.profiles where id = r.reporter_id)) order by r.created_at desc)
        from (select * from public.reports where status = 'open' order by created_at desc limit 25) r), '[]'::jsonb),
    'town', jsonb_build_object(
      'citizens', (select count(*) from public.town_citizens),
      'treasury', (select treasury from public.town_state where id = 1),
      'servers', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'locked', locked) order by sort) from public.town_servers), '[]'::jsonb)),
    'settings', coalesce((select jsonb_object_agg(key, value) from public.site_settings where value is not null), '{}'::jsonb)
  );
end;
$$;

/** Give (or take back, with a negative amount) coins. */
create or replace function public.owner_grant_coins(p_username text, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  bal integer;
begin
  perform public.owner__check();
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then
    raise exception 'Between 1 and 100000 coins';
  end if;
  select id into uid from public.profiles where lower(username::text) = lower(btrim(p_username));
  if uid is null then
    raise exception 'No player called %', p_username;
  end if;
  bal := public.add_coins(uid, p_amount, 'owner', 'owner-grant');
  return jsonb_build_object('coins', bal);
end;
$$;

/** Hide a player from every public board (or bring them back). */
create or replace function public.owner_set_hidden(p_username text, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.owner__check();
  update public.profiles set is_hidden = coalesce(p_hidden, true) where lower(username::text) = lower(btrim(p_username));
  if not found then
    raise exception 'No player called %', p_username;
  end if;
end;
$$;

/** Close a report: actioned or dismissed. */
create or replace function public.owner_resolve_report(p_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.owner__check();
  if p_status not in ('actioned', 'dismissed') then
    raise exception 'actioned or dismissed';
  end if;
  update public.reports set status = p_status where id = p_id and status = 'open';
  if not found then
    raise exception 'No such open report';
  end if;
end;
$$;

revoke all on function public.site__owner() from public, anon, authenticated;
revoke all on function public.owner__check() from public, anon, authenticated;
revoke all on function public.is_owner() from public;
revoke all on function public.owner_set_setting(text, jsonb) from public, anon;
revoke all on function public.owner_dashboard() from public, anon;
revoke all on function public.owner_grant_coins(text, integer) from public, anon;
revoke all on function public.owner_set_hidden(text, boolean) from public, anon;
revoke all on function public.owner_resolve_report(bigint, text) from public, anon;
grant execute on function public.is_owner() to anon, authenticated;
grant execute on function public.owner_set_setting(text, jsonb) to authenticated;
grant execute on function public.owner_dashboard() to authenticated;
grant execute on function public.owner_grant_coins(text, integer) to authenticated;
grant execute on function public.owner_set_hidden(text, boolean) to authenticated;
grant execute on function public.owner_resolve_report(bigint, text) to authenticated;
