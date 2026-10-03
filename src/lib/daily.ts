import { addGuestCoins, signedIn } from "./season-client";
import { deviceSaveSuffix } from "./device-accounts";

/**
 * Daily rewards: coins for coming back, on a seven-day cycle. Miss a day and
 * it starts again. Signed-in players claim on the server (claim_daily_reward);
 * guests keep the same rules on this device.
 */

export const DAILY_COINS = [5, 5, 10, 10, 15, 20, 50] as const;

/** Coins for day `n` of a streak (1-based, cycling every seven). */
export const coinsForDay = (n: number) => DAILY_COINS[(Math.max(1, n) - 1) % 7];

export interface DailyState {
  /** Today's day of the cycle (1–7): claimed already, or up next. */
  day: number;
  claimed: boolean;
  /** Coins for the next claim. */
  next: number;
}

export interface DailyClaim extends DailyState {
  coinsWon: number;
  coins: number;
}

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const key = () => `zx-daily${deviceSaveSuffix()}`;

interface GuestDaily {
  last: string;
  day: number;
}

function readLocal(): GuestDaily | null {
  try {
    const v = JSON.parse(localStorage.getItem(key()) ?? "null") as GuestDaily | null;
    return v && typeof v.last === "string" && typeof v.day === "number" ? v : null;
  } catch {
    return null;
  }
}

/** Where a guest stands today (pure, given the last claim). */
export function guestState(last: GuestDaily | null, now = Date.now()): DailyState {
  const today = utcDay(now);
  if (last?.last === today) return { day: last.day, claimed: true, next: coinsForDay(last.day + 1) };
  const day = last && last.last === utcDay(now - 86_400_000) ? (last.day % 7) + 1 : 1;
  return { day, claimed: false, next: coinsForDay(day) };
}

export async function loadDaily(now = Date.now()): Promise<DailyState> {
  const auth = signedIn();
  if (!auth) return guestState(readLocal(), now);
  const { data, error } = await (auth.supabase.rpc as unknown as (f: string, a: object) => PromiseLike<{ data: { day: number; claimed: boolean; next: number } | null; error: unknown }>).call(auth.supabase, "claim_daily_reward", { p_peek: true });
  if (error || !data) throw new Error("Couldn't check your daily reward.");
  return { day: data.day, claimed: data.claimed, next: data.next };
}

export async function claimDaily(now = Date.now()): Promise<DailyClaim> {
  const auth = signedIn();
  if (!auth) {
    const s = guestState(readLocal(), now);
    if (s.claimed) return { ...s, coinsWon: 0, coins: addGuestCoins(0) };
    try {
      localStorage.setItem(key(), JSON.stringify({ last: utcDay(now), day: s.day }));
    } catch {
      // storage blocked: the coins still land for this visit
    }
    const won = coinsForDay(s.day);
    return { day: s.day, claimed: true, next: coinsForDay(s.day + 1), coinsWon: won, coins: addGuestCoins(won) };
  }
  const { data, error } = await (auth.supabase.rpc as unknown as (f: string, a: object) => PromiseLike<{ data: { day: number; claimed: boolean; next: number; coins_won: number; coins: number } | null; error: unknown }>).call(auth.supabase, "claim_daily_reward", { p_peek: false });
  if (error || !data) throw new Error("Couldn't claim your daily reward. Try again.");
  const { useWallet } = await import("@/store/wallet");
  useWallet.getState().set(data.coins);
  return { day: data.day, claimed: true, next: data.next, coinsWon: data.coins_won, coins: data.coins };
}
