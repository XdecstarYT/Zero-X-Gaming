-- The ZX Cash fresh start. Coins are now called ZX Cash (the wallet column
-- keeps its name), and every player starts again from zero: balances and the
-- coin history, ZLink+ memberships, battle pass progress, unlocks (Sports+,
-- UBusiness editions), cosmetics, challenges, achievements, XP, streaks,
-- match records and the whole Hometown economy. Accounts, usernames,
-- favourites, reports and every leaderboard score stay. A one-off (run once,
-- e.g. in the Supabase SQL editor): re-running
-- it wipes again.

truncate table
  public.coin_ledger,
  public.xp_events,
  public.zlink_members,
  public.season_progress,
  public.challenge_progress,
  public.player_achievements,
  public.player_unlocks,
  public.player_cosmetics,
  public.player_loadout,
  public.siege_matches,
  public.trenches_matches,
  public.play_sessions,
  public.town_inventory,
  public.town_orders,
  public.town_trades,
  public.town_log,
  public.town_votes,
  public.town_candidates,
  public.town_elections,
  public.town_shop_items,
  public.town_shops,
  public.town_businesses;

update public.player_wallet set coins = 0, updated_at = now() where user_id is not null;
update public.profiles set xp = 0, updated_at = now() where id is not null;
update public.daily_streaks set current_streak = 0, longest_streak = 0, last_active_date = null where user_id is not null;

-- Hometown: every lot back on the market, a fresh treasury and no mayor; citizens keep their name and look.
update public.town_plots set owner = null, sale_price = null, build = null, walls = 0, items = 0, updated_at = now() where id is not null;
update public.town_state set mayor = null, sales_tax = 0.05, public_wage = 60, treasury = 5000, updated_at = now() where id is not null;
update public.town_citizens
  set cash = 1500, energy = 100, energy_at = now(), worked_at = null, savings = 0, saved_at = now(), allowance_at = null
  where user_id is not null;
