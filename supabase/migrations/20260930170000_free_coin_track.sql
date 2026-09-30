-- Free coin track: every player (pass or not) earns coins at tiers 5/10/15/20/25 (25 each)
-- and 30 (50). Mirrors COIN_TIERS in src/lib/season.ts. Paid by a trigger whenever
-- season XP crosses one of those tiers, so every XP source is covered.

create table public.season_coin_rewards (
  season_id text not null references public.seasons (id) on delete cascade,
  tier integer not null check (tier > 0),
  coins integer not null check (coins > 0),
  primary key (season_id, tier)
);
alter table public.season_coin_rewards enable row level security;
create policy "Coin rewards are public" on public.season_coin_rewards for select to anon, authenticated using (true);
revoke insert, update, delete on public.season_coin_rewards from anon, authenticated;

insert into public.season_coin_rewards (season_id, tier, coins) values
  ('s1', 5, 25),
  ('s1', 10, 25),
  ('s1', 15, 25),
  ('s1', 20, 25),
  ('s1', 25, 25),
  ('s1', 30, 50);

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason in ('cash_cup', 'battle_pass', 'shop', 'tier_reward'));

create or replace function public.pay_tier_coins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  r record;
begin
  select * into s from public.seasons where id = new.season_id;
  for r in
    select tier, coins from public.season_coin_rewards
    where season_id = new.season_id
      and tier > least(s.tiers, old.xp / s.tier_xp)
      and tier <= least(s.tiers, new.xp / s.tier_xp)
  loop
    perform public.add_coins(new.user_id, r.coins, 'tier_reward', new.season_id || ':tier' || r.tier);
  end loop;
  return new;
end;
$$;
revoke execute on function public.pay_tier_coins() from public, anon, authenticated;

create trigger season_progress_tier_coins
  after update of xp on public.season_progress
  for each row
  when (new.xp > old.xp)
  execute function public.pay_tier_coins();
