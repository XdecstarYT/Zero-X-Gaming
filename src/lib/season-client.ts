"use client";

import { OUTFITS, WRAPS } from "@/games/neon-siege/cosmetics";
import { readLoadout, writeLoadout, type Loadout } from "@/games/neon-siege/loadout";
import { useAuth } from "@/store/auth";
import { useWallet } from "@/store/wallet";
import { BATTLE_PASS_PRICE, cashCupPrize, CASH_CUP_DIFFICULTY, currentDrop, isCashCup, SPORTS_PASS_ID, SPORTS_PASS_PRICE } from "./economy";
import { deviceSaveSuffix } from "./device-accounts";
import { getSupabaseBrowser } from "./supabase/client";
import {
  activeChallenges,
  asChallengeMatch,
  trenchesMatchXp,
  type TrenchesMatch,
  BANNERS,
  DEFAULT_ITEMS,
  matchXp,
  metricValue,
  REWARDS,
  SEASON,
  tierCoinsBetween,
  tierFromXp,
  type CosmeticKind,
  type Reward,
  type SiegeMatch,
} from "./season";

/**
 * Season progress, coins, the battle pass and shop purchases for the current
 * player. Signed-in players' state lives in the database (awarded and spent only
 * by server functions); guests keep theirs on this device with the same rules.
 */

export interface SeasonState {
  xp: number;
  matches: number;
  wins: number;
  kills: number;
  coins: number;
  hasPass: boolean;
  /** Keyed by `${challengeId}:${period}`. */
  challenges: Record<string, { progress: number; completed: boolean }>;
  owned: Set<string>;
  loadout: Loadout & { banner: string };
  signedIn: boolean;
}

export interface MatchSummary {
  xpMatch: number;
  xpChallenges: number;
  xpTotal: number;
  tierBefore: number;
  tierAfter: number;
  unlocked: Reward[];
  challenges: { id: string; title: string; xp: number }[];
  cashCup: boolean;
  coinsWon: number;
  /** Free-track coins for tiers crossed this match. */
  tierCoins: number;
  coins: number;
  hasPass: boolean;
}

/** A match with the difficulty it was played on (Cash Cups require Hard). */
export type RecordedMatch = SiegeMatch & { difficulty: "easy" | "normal" | "hard" };

const GUEST_BASE = `zx-season-${SEASON.id}`;
/** Guests share one save per device; each device account gets its own. */
const guestKey = () => GUEST_BASE + deviceSaveSuffix();
const bannerKey = () => "zx-banner" + deviceSaveSuffix();

interface GuestSave {
  xp: number;
  matches: number;
  wins: number;
  kills: number;
  coins: number;
  hasPass: boolean;
  /** "kind:item" for shop purchases. */
  purchases: string[];
  challenges: Record<string, { progress: number; completed: boolean }>;
}

function readGuest(): GuestSave {
  const empty: GuestSave = { xp: 0, matches: 0, wins: 0, kills: 0, coins: 0, hasPass: false, purchases: [], challenges: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(guestKey()) ?? "null") as Partial<GuestSave> | null;
    if (raw && typeof raw.xp === "number") return { ...empty, ...raw, challenges: raw.challenges ?? {}, purchases: raw.purchases ?? [] };
  } catch {
    // fall through
  }
  return empty;
}

function writeGuest(s: GuestSave) {
  try {
    localStorage.setItem(guestKey(), JSON.stringify(s));
  } catch {
    // storage blocked: progress lasts for this page only
  }
  useWallet.getState().set(s.coins);
  const { status, profile, set } = useAuth.getState();
  if (status === "device" && profile && profile.xp !== s.xp) set({ profile: { ...profile, xp: s.xp } });
}

function guestOwned(g: GuestSave) {
  const owned = new Set(DEFAULT_ITEMS.map((d) => d.item));
  if (g.hasPass) for (const r of REWARDS) if (r.tier <= tierFromXp(g.xp).tier) owned.add(r.item);
  for (const p of g.purchases) owned.add(p.split(":")[1]);
  return owned;
}

function readBanner() {
  try {
    return localStorage.getItem(bannerKey()) ?? "rookie";
  } catch {
    return "rookie";
  }
}

function signedInClient() {
  const { status, userId } = useAuth.getState();
  const supabase = getSupabaseBrowser();
  return status === "signed_in" && userId && supabase ? { supabase, userId } : null;
}

export async function loadSeasonState(): Promise<SeasonState> {
  const local = readLoadout();
  const auth = signedInClient();
  if (!auth) {
    const g = readGuest();
    useWallet.getState().set(g.coins);
    return {
      xp: g.xp,
      matches: g.matches,
      wins: g.wins,
      kills: g.kills,
      coins: g.coins,
      hasPass: g.hasPass,
      challenges: g.challenges,
      owned: guestOwned(g),
      loadout: { ...local, banner: readBanner() },
      signedIn: false,
    };
  }
  const { supabase, userId } = auth;
  const [prog, ch, cos, lo, wal] = await Promise.all([
    supabase.from("season_progress").select("*").eq("user_id", userId).eq("season_id", SEASON.id).maybeSingle(),
    supabase.from("challenge_progress").select("challenge_id, period, progress, completed_at").eq("user_id", userId).eq("season_id", SEASON.id),
    supabase.from("player_cosmetics").select("item_id").eq("user_id", userId),
    supabase.from("player_loadout").select("outfit, wrap, banner").eq("user_id", userId).maybeSingle(),
    supabase.from("player_wallet").select("coins").eq("user_id", userId).maybeSingle(),
  ]);
  const owned = new Set(DEFAULT_ITEMS.map((d) => d.item));
  for (const c of cos.data ?? []) owned.add(c.item_id);
  const challenges: SeasonState["challenges"] = {};
  for (const c of ch.data ?? [])
    challenges[`${c.challenge_id}:${c.period}`] = { progress: c.progress, completed: c.completed_at !== null };
  const loadout = lo.data ?? { ...local, banner: readBanner() };
  // Keep the game's local copy in sync with the account.
  writeLoadout({ outfit: loadout.outfit, wrap: loadout.wrap });
  const coins = wal.data?.coins ?? 0;
  useWallet.getState().set(coins);
  return {
    xp: prog.data?.xp ?? 0,
    matches: prog.data?.matches ?? 0,
    wins: prog.data?.wins ?? 0,
    kills: prog.data?.kills ?? 0,
    coins,
    hasPass: prog.data?.has_pass ?? false,
    challenges,
    owned,
    loadout,
    signedIn: true,
  };
}

/** Just the coin balance (for the header chip). */
export async function loadCoins(): Promise<number> {
  const auth = signedInClient();
  if (!auth) return readGuest().coins;
  const { data } = await auth.supabase.from("player_wallet").select("coins").eq("user_id", auth.userId).maybeSingle();
  return data?.coins ?? 0;
}

/** Ranked matches played this season (for "next match is a Cash Cup"). */
export async function loadMatchesPlayed(): Promise<number> {
  const auth = signedInClient();
  if (!auth) return readGuest().matches;
  const { data } = await auth.supabase
    .from("season_progress")
    .select("matches")
    .eq("user_id", auth.userId)
    .eq("season_id", SEASON.id)
    .maybeSingle();
  return data?.matches ?? 0;
}

/** Record a finished ranked match and return what it earned. */
export async function recordSiegeMatch(m: RecordedMatch): Promise<MatchSummary> {
  const auth = signedInClient();
  if (auth) {
    const { data, error } = await auth.supabase.rpc("record_siege_match", {
      p_kills: m.kills,
      p_placement: m.placement,
      p_players: m.players,
      p_damage: Math.round(m.damage),
      p_chests: m.chests,
      p_survived_s: Math.floor(m.survivedS),
      p_difficulty: m.difficulty,
    });
    if (error) throw new Error(error.message);
    return summaryFromServer(data as unknown as ServerMatchResult);
  }
  return recordGuestMatch(m);
}

/** Record a finished Trenches battle (season XP, challenges, free-lane coins). */
export async function recordTrenchesMatch(m: TrenchesMatch): Promise<MatchSummary> {
  const auth = signedInClient();
  if (auth) {
    const { data, error } = await auth.supabase.rpc("record_trenches_match", {
      p_kills: m.kills,
      p_deaths: m.deaths,
      p_captures: m.captures,
      p_won: m.won,
      p_duration_s: Math.floor(m.durationS),
      p_damage: Math.round(m.damage),
      p_digs: m.digs,
      p_players: m.players,
      p_front: m.front,
      p_mode: m.mode,
    });
    if (error) throw new Error(error.message);
    return summaryFromServer(data as unknown as ServerMatchResult);
  }
  return recordGuestMatch({ ...asChallengeMatch(m), difficulty: "normal" }, Date.now(), trenchesMatchXp(m), false);
}

interface ServerMatchResult {
  xp_match: number;
  xp_challenges: number;
  xp_total: number;
  tier_before: number;
  tier_after: number;
  unlocked: { kind: CosmeticKind; item: string }[];
  challenges: { id: string; title: string; xp: number }[];
  cash_cup: boolean;
  coins_won: number;
  coins: number;
  has_pass: boolean;
}

function summaryFromServer(r: ServerMatchResult): MatchSummary {
  useWallet.getState().set(r.coins);
  const before = r.xp_total - r.xp_match - r.xp_challenges;
  return {
    tierCoins: tierCoinsBetween(before, r.xp_total),
    xpMatch: r.xp_match,
    xpChallenges: r.xp_challenges,
    xpTotal: r.xp_total,
    tierBefore: r.tier_before,
    tierAfter: r.tier_after,
    unlocked: r.unlocked.map((u) => REWARDS.find((x) => x.kind === u.kind && x.item === u.item)!).filter(Boolean),
    challenges: r.challenges,
    cashCup: r.cash_cup,
    coinsWon: r.coins_won,
    coins: r.coins,
    hasPass: r.has_pass,
  };
}

/**
 * Guest progression, same rules as the server. Exported for tests. Trenches
 * battles pass their own XP and don't count toward Cash Cups.
 */
export function recordGuestMatch(m: RecordedMatch, now = Date.now(), xpOverride?: number, siege = true): MatchSummary {
  const g = readGuest();
  const before = g.xp;
  const xpMatch = xpOverride ?? matchXp(m);
  let xpChallenges = 0;
  const done: MatchSummary["challenges"] = [];
  for (const c of activeChallenges(now)) {
    const key = `${c.id}:${c.period}`;
    const cur = g.challenges[key] ?? { progress: 0, completed: false };
    if (cur.completed) continue;
    const v = metricValue(c.metric, m);
    if (v <= 0) continue;
    const progress = Math.min(c.goal, cur.progress + v);
    const completed = progress >= c.goal;
    g.challenges[key] = { progress, completed };
    if (completed) {
      xpChallenges += c.xp;
      done.push({ id: c.id, title: c.title, xp: c.xp });
    }
  }
  const live = new Set(activeChallenges(now).map((c) => `${c.id}:${c.period}`));
  for (const k of Object.keys(g.challenges)) if (!live.has(k)) delete g.challenges[k];

  const cashCup = siege && isCashCup(g.matches + 1);
  const coinsWon = cashCup && m.difficulty === CASH_CUP_DIFFICULTY ? cashCupPrize(m.placement) : 0;
  g.xp += xpMatch + xpChallenges;
  const tierCoins = tierCoinsBetween(before, g.xp);
  g.coins += coinsWon + tierCoins;
  g.matches++;
  g.kills += m.kills;
  if (m.placement === 1) g.wins++;
  writeGuest(g);
  const tb = tierFromXp(before).tier;
  const ta = tierFromXp(g.xp).tier;
  return {
    xpMatch,
    xpChallenges,
    xpTotal: g.xp,
    tierBefore: tb,
    tierAfter: ta,
    unlocked: g.hasPass ? REWARDS.filter((r) => r.tier > tb && r.tier <= ta) : [],
    challenges: done,
    cashCup,
    coinsWon,
    tierCoins,
    coins: g.coins,
    hasPass: g.hasPass,
  };
}

const BUY_ERRORS: Record<string, string> = {
  "not enough coins": "Not enough coins yet. Win a Cash Cup to earn more!",
  "already owned": "You already own that.",
  "not in the shop": "That item isn't in the shop right now.",
  "not authenticated": "Sign in to buy with your account coins.",
};
const buyError = (msg: string) => new Error(BUY_ERRORS[msg] ?? "Purchase failed. Check your connection.");

/** Buy this season's battle pass (200 coins). Returns rewards granted for tiers already reached. */
export async function buyBattlePass(): Promise<{ coins: number; unlocked: Reward[] }> {
  const auth = signedInClient();
  if (auth) {
    const { data, error } = await auth.supabase.rpc("buy_battle_pass");
    if (error) throw buyError(error.message);
    const r = data as { coins: number; unlocked: { kind: CosmeticKind; item: string }[] };
    useWallet.getState().set(r.coins);
    return { coins: r.coins, unlocked: r.unlocked.map((u) => REWARDS.find((x) => x.kind === u.kind && x.item === u.item)!).filter(Boolean) };
  }
  const g = readGuest();
  if (g.hasPass) throw buyError("already owned");
  if (g.coins < BATTLE_PASS_PRICE) throw buyError("not enough coins");
  g.coins -= BATTLE_PASS_PRICE;
  g.hasPass = true;
  writeGuest(g);
  return { coins: g.coins, unlocked: REWARDS.filter((r) => r.tier <= tierFromXp(g.xp).tier) };
}

/** Buy an item from the current Item Shop drop. */
export async function buyShopItem(kind: CosmeticKind, item: string): Promise<{ coins: number }> {
  const auth = signedInClient();
  if (auth) {
    const { data, error } = await auth.supabase.rpc("buy_shop_item", { p_kind: kind, p_item: item });
    if (error) throw buyError(error.message);
    const r = data as { coins: number };
    useWallet.getState().set(r.coins);
    return r;
  }
  const g = readGuest();
  const it = currentDrop()?.items.find((x) => x.kind === kind && x.item === item);
  if (!it) throw buyError("not in the shop");
  if (g.purchases.includes(`${kind}:${item}`)) throw buyError("already owned");
  if (g.coins < it.price) throw buyError("not enough coins");
  g.coins -= it.price;
  g.purchases.push(`${kind}:${item}`);
  writeGuest(g);
  return { coins: g.coins };
}

/** Has this player unlocked Sports+ (50 coins, once)? */
export async function hasSportsPass(): Promise<boolean> {
  const auth = signedInClient();
  if (!auth) return readGuest().purchases.includes(`unlock:${SPORTS_PASS_ID}`);
  const { data } = await auth.supabase.from("player_unlocks").select("unlock_id").eq("user_id", auth.userId).eq("unlock_id", SPORTS_PASS_ID).maybeSingle();
  return !!data;
}

/** Unlock Sports+ for 50 coins. */
export async function buySportsPass(): Promise<{ coins: number }> {
  const auth = signedInClient();
  if (auth) {
    const { data, error } = await auth.supabase.rpc("buy_sports_pass");
    if (error) throw buyError(error.message);
    const r = data as { coins: number };
    useWallet.getState().set(r.coins);
    return r;
  }
  const g = readGuest();
  if (g.purchases.includes(`unlock:${SPORTS_PASS_ID}`)) throw buyError("already owned");
  if (g.coins < SPORTS_PASS_PRICE) throw buyError("not enough coins");
  g.coins -= SPORTS_PASS_PRICE;
  g.purchases.push(`unlock:${SPORTS_PASS_ID}`);
  writeGuest(g);
  useWallet.getState().set(g.coins);
  return { coins: g.coins };
}

export async function saveLoadout(l: Loadout & { banner: string }) {
  writeLoadout({ outfit: l.outfit, wrap: l.wrap });
  try {
    localStorage.setItem(bannerKey(), l.banner);
  } catch {
    // ignore
  }
  const auth = signedInClient();
  if (!auth) return;
  const { error } = await auth.supabase.rpc("set_loadout", { p_outfit: l.outfit, p_wrap: l.wrap, p_banner: l.banner });
  if (error) throw new Error(error.message);
}

export function rewardLabel(r: { kind: CosmeticKind; item: string }) {
  const name =
    r.kind === "outfit" ? OUTFITS[r.item]?.name : r.kind === "wrap" ? WRAPS[r.item]?.name : BANNERS[r.item]?.name;
  const kind = r.kind === "outfit" ? "Outfit" : r.kind === "wrap" ? "Wrap" : "Banner";
  return `${name ?? r.item} ${kind}`;
}

/**
 * A new device account starts with the guest progress played on this device
 * (so nobody loses what they earned before signing up), then keeps its own.
 */
export function adoptGuestSave() {
  try {
    const key = guestKey();
    if (key === GUEST_BASE || localStorage.getItem(key)) return;
    const guest = localStorage.getItem(GUEST_BASE);
    if (guest) localStorage.setItem(key, guest);
  } catch {
    // storage blocked
  }
}

/** Season XP saved on this device for the current guest / device account. */
export function localSeasonXp() {
  return readGuest().xp;
}

