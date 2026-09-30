/**
 * Season 1 "Ground Zero": battle pass tiers, rewards, challenges and the match
 * XP formula. The same numbers live in the database (see the season migration);
 * `season.test.ts` checks the two stay in sync.
 */

export interface Season {
  id: string;
  number: number;
  name: string;
  startsAt: string;
  endsAt: string;
  tiers: number;
  tierXp: number;
}

export const SEASON: Season = {
  id: "s1",
  number: 1,
  name: "Ground Zero",
  startsAt: "2026-09-28T00:00:00Z",
  endsAt: "2026-12-20T00:00:00Z",
  tiers: 30,
  tierXp: 1000,
};

export type CosmeticKind = "outfit" | "wrap" | "banner";

export interface Banner {
  id: string;
  name: string;
  /** CSS gradient. */
  art: string;
}

export const BANNERS: Record<string, Banner> = {
  rookie: { id: "rookie", name: "Rookie", art: "linear-gradient(135deg,#3a4150,#1d222b)" },
  "ground-zero": { id: "ground-zero", name: "Ground Zero", art: "linear-gradient(135deg,#6b7350,#2b3024 60%,#ffb321)" },
  dusk: { id: "dusk", name: "Dusk", art: "linear-gradient(160deg,#f28c38,#8a3d6b 55%,#2a1d45)" },
  "storm-chaser": { id: "storm-chaser", name: "Storm Chaser", art: "radial-gradient(circle at 70% 30%,#c79bff,#5b2d9e 45%,#1a0d33)" },
  circuit: { id: "circuit", name: "Circuit", art: "repeating-linear-gradient(90deg,#0f2a24 0 10px,#123a30 10px 12px),linear-gradient(#39d98a,#0f2a24)" },
  ember: { id: "ember", name: "Ember", art: "linear-gradient(0deg,#ff5a1f,#ffb321 45%,#2b1308)" },
  tidal: { id: "tidal", name: "Tidal", art: "linear-gradient(180deg,#7fd6e8,#1f5f7a 50%,#0b2230)" },
  midnight: { id: "midnight", name: "Midnight", art: "radial-gradient(circle at 30% 20%,#8a6bff,#1c1d2b 60%)" },
  gilded: { id: "gilded", name: "Gilded", art: "linear-gradient(135deg,#8a6a1c,#f1d27a 50%,#8a6a1c)" },
  victory: { id: "victory", name: "Victory Royale", art: "linear-gradient(135deg,#ffb321,#ff6a3d 50%,#b25cff)" },
  apex: { id: "apex", name: "Apex", art: "conic-gradient(from 200deg,#3c9bff,#b25cff,#ff4d6d,#3c9bff)" },
  legend: { id: "legend", name: "Legend", art: "linear-gradient(135deg,#1a1916,#d4a637 45%,#1a1916)" },
  zero: { id: "zero", name: "Zero", art: "linear-gradient(135deg,#22e5ff,#05060b 45%,#ff2bd6)" },
  // Item Shop · DROP 1
  "drop-1": { id: "drop-1", name: "DROP 1", art: "repeating-linear-gradient(135deg,#ff7a1a 0 14px,#1b1d22 14px 28px)" },
  "cash-king": { id: "cash-king", name: "Cash King", art: "radial-gradient(circle at 50% 30%,#fff3b0,#f2c230 35%,#6b4a00)" },
};

export interface Reward {
  tier: number;
  kind: CosmeticKind;
  item: string;
}

/** One reward per tier. Everything is earned by playing: there is nothing to buy. */
export const REWARDS: Reward[] = (
  [
    ["banner", "ground-zero"],
    ["wrap", "woodland"],
    ["outfit", "urban"],
    ["banner", "dusk"],
    ["outfit", "nomad"],
    ["wrap", "sandstorm"],
    ["banner", "storm-chaser"],
    ["outfit", "desert"],
    ["wrap", "carbon"],
    ["outfit", "ember"],
    ["banner", "circuit"],
    ["outfit", "jungle"],
    ["wrap", "tiger"],
    ["banner", "ember"],
    ["outfit", "arctic"],
    ["wrap", "glacier"],
    ["banner", "tidal"],
    ["outfit", "crimson"],
    ["wrap", "retro"],
    ["outfit", "tidal"],
    ["banner", "midnight"],
    ["outfit", "midnight"],
    ["banner", "gilded"],
    ["outfit", "cipher"],
    ["banner", "victory"],
    ["wrap", "gilded"],
    ["banner", "apex"],
    ["banner", "legend"],
    ["banner", "zero"],
    ["outfit", "vanguard"],
  ] as const
).map(([kind, item], i) => ({ tier: i + 1, kind, item }));

/**
 * The free track: coins for everyone (pass or not) at these tiers. Worth 175
 * coins over the season, so the 200-coin pass nearly pays for itself.
 */
export const COIN_TIERS: Record<number, number> = { 5: 25, 10: 25, 15: 25, 20: 25, 25: 25, 30: 50 };

/** Free-track coins earned going from one XP total to another. */
export function tierCoinsBetween(fromXp: number, toXp: number) {
  const a = tierFromXp(fromXp).tier;
  const b = tierFromXp(toXp).tier;
  let coins = 0;
  for (const [t, c] of Object.entries(COIN_TIERS)) if (Number(t) > a && Number(t) <= b) coins += c;
  return coins;
}

/** Owned by everyone from the start. */
export const DEFAULT_ITEMS: { kind: CosmeticKind; item: string }[] = [
  { kind: "outfit", item: "recruit" },
  { kind: "outfit", item: "ranger" },
  { kind: "wrap", item: "factory" },
  { kind: "banner", item: "rookie" },
];

export function tierFromXp(xp: number) {
  const tier = Math.min(SEASON.tiers, Math.floor(Math.max(0, xp) / SEASON.tierXp));
  const into = tier >= SEASON.tiers ? SEASON.tierXp : Math.max(0, xp) - tier * SEASON.tierXp;
  return { tier, into, need: SEASON.tierXp, pct: into / SEASON.tierXp };
}

export function rewardsBetween(fromXp: number, toXp: number) {
  const a = tierFromXp(fromXp).tier;
  const b = tierFromXp(toXp).tier;
  return REWARDS.filter((r) => r.tier > a && r.tier <= b);
}

export function ownedItems(xp: number) {
  const tier = tierFromXp(xp).tier;
  return new Set([...DEFAULT_ITEMS.map((d) => d.item), ...REWARDS.filter((r) => r.tier <= tier).map((r) => r.item)]);
}

export function rewardFor(kind: CosmeticKind, item: string) {
  return REWARDS.find((r) => r.kind === kind && r.item === item) ?? null;
}

// ------------------------------------------------------------------ match XP

export interface SiegeMatch {
  kills: number;
  placement: number;
  players: number;
  damage: number;
  chests: number;
  survivedS: number;
}

export function placementXp(placement: number) {
  if (placement === 1) return 250;
  if (placement <= 3) return 120;
  if (placement <= 5) return 80;
  if (placement <= 10) return 40;
  return 0;
}

export const MATCH_XP_CAP = 1500;

/** Season XP for a match. Mirrored exactly by `public.siege_match_xp` in SQL. */
export function matchXp(m: SiegeMatch) {
  const xp =
    50 +
    m.kills * 40 +
    placementXp(m.placement) +
    Math.floor(Math.min(m.survivedS, 600) / 2) +
    m.chests * 10 +
    Math.floor(Math.min(m.damage, 2000) / 20);
  return Math.min(MATCH_XP_CAP, xp);
}

// ---------------------------------------------------------------- challenges

export type Metric = "kills" | "wins" | "top10" | "chests" | "damage" | "matches" | "survive";

export interface Challenge {
  id: string;
  kind: "daily" | "weekly";
  idx: number;
  metric: Metric;
  goal: number;
  xp: number;
  title: string;
}

const pool = (kind: "daily" | "weekly", rows: [Metric, number, number, string][]): Challenge[] =>
  rows.map(([metric, goal, xp, title], idx) => ({ id: `${kind[0]}${idx}`, kind, idx, metric, goal, xp, title }));

export const DAILY: Challenge[] = pool("daily", [
  ["kills", 3, 300, "Eliminate 3 opponents"],
  ["chests", 4, 300, "Open 4 chests"],
  ["damage", 500, 300, "Deal 500 damage"],
  ["matches", 3, 250, "Play 3 matches"],
  ["top10", 2, 350, "Finish in the top 10 twice"],
  ["survive", 300, 250, "Survive 5 minutes in total"],
  ["kills", 5, 400, "Eliminate 5 opponents"],
  ["chests", 6, 400, "Open 6 chests"],
  ["damage", 1000, 400, "Deal 1,000 damage"],
]);

export const WEEKLY: Challenge[] = pool("weekly", [
  ["wins", 1, 1500, "Win a match"],
  ["kills", 25, 1500, "Eliminate 25 opponents"],
  ["chests", 30, 1200, "Open 30 chests"],
  ["damage", 5000, 1200, "Deal 5,000 damage"],
  ["top10", 8, 1200, "Finish in the top 10 in 8 matches"],
  ["matches", 15, 1000, "Play 15 matches"],
  ["survive", 1800, 1000, "Survive 30 minutes in total"],
  ["kills", 40, 2000, "Eliminate 40 opponents"],
]);

export const DAILY_COUNT = 3;
export const WEEKLY_COUNT = 4;
const DAY_MS = 86_400_000;

/** Whole days since the season started (UTC). */
export function seasonDay(now = Date.now()) {
  return Math.max(0, Math.floor((now - Date.parse(SEASON.startsAt)) / DAY_MS));
}

export interface ActiveChallenge extends Challenge {
  /** e.g. "d12" / "w1": progress resets when this changes. */
  period: string;
  /** Epoch ms when it rotates out. */
  endsAt: number;
}

/** The challenges live right now. Mirrored by `public.active_challenges` in SQL. */
export function activeChallenges(now = Date.now()): ActiveChallenge[] {
  const d = seasonDay(now);
  const w = Math.floor(d / 7);
  const start = Date.parse(SEASON.startsAt);
  const daily = Array.from({ length: DAILY_COUNT }, (_, i) => ({
    ...DAILY[(d * DAILY_COUNT + i) % DAILY.length],
    period: `d${d}`,
    endsAt: start + (d + 1) * DAY_MS,
  }));
  const weekly = Array.from({ length: WEEKLY_COUNT }, (_, i) => ({
    ...WEEKLY[(w * WEEKLY_COUNT + i) % WEEKLY.length],
    period: `w${w}`,
    endsAt: start + (w + 1) * 7 * DAY_MS,
  }));
  return [...daily, ...weekly];
}

/** How much a match advances a challenge metric. */
export function metricValue(metric: Metric, m: SiegeMatch) {
  switch (metric) {
    case "kills":
      return m.kills;
    case "wins":
      return m.placement === 1 ? 1 : 0;
    case "top10":
      return m.placement <= 10 ? 1 : 0;
    case "chests":
      return m.chests;
    case "damage":
      return m.damage;
    case "matches":
      return 1;
    case "survive":
      return m.survivedS;
  }
}

export function seasonTimeLeft(now = Date.now()) {
  const ms = Date.parse(SEASON.endsAt) - now;
  return { ms, days: Math.max(0, Math.ceil(ms / DAY_MS)) };
}
