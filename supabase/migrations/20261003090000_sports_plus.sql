-- Sports+: a one-time 50-coin unlock for every Sports+ game, a new "sports"
-- category, and the first Sports+ game (Screamer: Aussie Rules).

-- Generic one-time unlocks (the Sports+ pass is the first).
create table if not exists public.player_unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  unlock_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, unlock_id)
);
alter table public.player_unlocks enable row level security;
drop policy if exists "Players read their unlocks" on public.player_unlocks;
create policy "Players read their unlocks" on public.player_unlocks
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.player_unlocks from anon, authenticated;

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason in ('cash_cup', 'battle_pass', 'shop', 'tier_reward', 'sports_pass'));

create or replace function public.buy_sports_pass()
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
  if exists (select 1 from public.player_unlocks where user_id = uid and unlock_id = 'sports-plus') then
    raise exception 'already owned';
  end if;
  balance := public.add_coins(uid, -50, 'sports_pass', 'sports-plus');
  insert into public.player_unlocks (user_id, unlock_id) values (uid, 'sports-plus');
  return jsonb_build_object('coins', balance);
end;
$$;
revoke execute on function public.buy_sports_pass() from public, anon;
grant execute on function public.buy_sports_pass() to authenticated;

-- Matches are scored client-side: goals 6, behinds 1, plus bonuses; a
-- 4 x 3-minute match tops out around 3 000 in practice.
alter table public.games drop constraint if exists games_category_check;
alter table public.games add constraint games_category_check
  check (category in ('arcade', 'puzzle', 'runner', 'trivia', 'shooter', 'sim', 'sports'));

insert into public.games (slug, title, category, status, max_score, max_score_per_second, xp_divisor)
values ('aussie-rules', 'Screamer: Aussie Rules', 'sports', 'live', 20000, 40, 10)
on conflict (slug) do update
  set title = excluded.title, category = excluded.category, status = excluded.status,
      max_score = excluded.max_score, max_score_per_second = excluded.max_score_per_second, xp_divisor = excluded.xp_divisor;
