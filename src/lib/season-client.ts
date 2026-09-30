"use client";

import { OUTFITS, WRAPS } from "@/games/neon-siege/cosmetics";
import { readLoadout, writeLoadout, type Loadout } from "@/games/neon-siege/loadout";
import { useAuth } from "@/store/auth";
import { getSupabaseBrowser } from "./supabase/client";
import {
  activeChallenges,
  BANNERS,
  matchXp,
  metricValue,
  ownedItems,
  REWARDS,
  SEASON,
  tierFromXp,
  type CosmeticKind,
  type Reward,
  type SiegeMatch,
} from "./season";

/**
 * Season progress for the current player. Signed-in players' progress lives in
 * the database (awarded by `record_siege_match`); guests keep theirs on this
 * device, computed with the same rules.
 */

export interface SeasonState {
  xp: number;
  matches: number;
  wins: number;
  kills: number;
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
}

const GUEST_KEY = `zx-season-${SEASON.id}`;
const BANNER_KEY = "zx-banner";

interface GuestSave {
  xp: number;
  matches: number;
  wins: number;
  kills: number;
  challenges: Record<string, { progress: number; completed: boolean }>;
}

function readGuest(): GuestSave {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null") as GuestSave | null;
    if (raw && typeof raw.xp === "number") return { ...raw, challenges: raw.challenges ?? {} };
  } catch {
    // fall through
  }
  return { xp: 0, matches: 0, wins: 0, kills: 0, challenges: {} };
}

function writeGuest(s: GuestSave) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(s));
  } catch {
    // storage blocked: progress lasts for this page only
  }
}

function readBanner() {
  try {
    return localStorage.getItem(BANNER_KEY) ?? "rookie";
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
    return { ...g, owned: ownedItems(g.xp), loadout: { ...local, banner: readBanner() }, signedIn: false };
  }
  const { supabase, userId } = auth;
  const [prog, ch, cos, lo] = await Promise.all([
    supabase.from("season_progress").select("*").eq("user_id", userId).eq("season_id", SEASON.id).maybeSingle(),
    supabase.from("challenge_progress").select("challenge_id, period, progress, completed_at").eq("user_id", userId).eq("season_id", SEASON.id),
    supabase.from("player_cosmetics").select("item_id").eq("user_id", userId),
    supabase.from("player_loadout").select("outfit, wrap, banner").eq("user_id", userId).maybeSingle(),
  ]);
  const xp = prog.data?.xp ?? 0;
  const owned = ownedItems(0);
  for (const c of cos.data ?? []) owned.add(c.item_id);
  const challenges: SeasonState["challenges"] = {};
  for (const c of ch.data ?? [])
    challenges[`${c.challenge_id}:${c.period}`] = { progress: c.progress, completed: c.completed_at !== null };
  const loadout = lo.data ?? { ...local, banner: readBanner() };
  // Keep the game's local copy in sync with the account.
  writeLoadout({ outfit: loadout.outfit, wrap: loadout.wrap });
  return {
    xp,
    matches: prog.data?.matches ?? 0,
    wins: prog.data?.wins ?? 0,
    kills: prog.data?.kills ?? 0,
    challenges,
    owned,
    loadout,
    signedIn: true,
  };
}

/** Record a finished ranked match and return what it earned. */
export async function recordSiegeMatch(m: SiegeMatch): Promise<MatchSummary> {
  const auth = signedInClient();
  if (auth) {
    const { data, error } = await auth.supabase.rpc("record_siege_match", {
      p_kills: m.kills,
      p_placement: m.placement,
      p_players: m.players,
      p_damage: Math.round(m.damage),
      p_chests: m.chests,
      p_survived_s: Math.floor(m.survivedS),
    });
    if (error) throw new Error(error.message);
    const r = data as {
      xp_match: number;
      xp_challenges: number;
      xp_total: number;
      tier_before: number;
      tier_after: number;
      unlocked: { kind: CosmeticKind; item: string }[];
      challenges: { id: string; title: string; xp: number }[];
    };
    return {
      xpMatch: r.xp_match,
      xpChallenges: r.xp_challenges,
      xpTotal: r.xp_total,
      tierBefore: r.tier_before,
      tierAfter: r.tier_after,
      unlocked: r.unlocked.map((u) => REWARDS.find((x) => x.kind === u.kind && x.item === u.item)!).filter(Boolean),
      challenges: r.challenges,
    };
  }
  return recordGuestMatch(m);
}

/** Guest progression, same rules as the server. Exported for tests. */
export function recordGuestMatch(m: SiegeMatch, now = Date.now()): MatchSummary {
  const g = readGuest();
  const before = g.xp;
  const xpMatch = matchXp(m);
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
  // Drop progress from expired periods.
  const live = new Set(activeChallenges(now).map((c) => `${c.id}:${c.period}`));
  for (const k of Object.keys(g.challenges)) if (!live.has(k)) delete g.challenges[k];
  g.xp += xpMatch + xpChallenges;
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
    unlocked: REWARDS.filter((r) => r.tier > tb && r.tier <= ta),
    challenges: done,
  };
}

export async function saveLoadout(l: Loadout & { banner: string }) {
  writeLoadout({ outfit: l.outfit, wrap: l.wrap });
  try {
    localStorage.setItem(BANNER_KEY, l.banner);
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
