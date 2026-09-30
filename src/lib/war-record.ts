import { deviceSaveSuffix } from "./device-accounts";
import type { TrenchesMatch } from "./season";

/**
 * A soldier's Trenches career on this device (per guest / device account /
 * online account): totals, bests and the medals they unlock.
 */

export interface WarRecord {
  battles: number;
  wins: number;
  kills: number;
  deaths: number;
  captures: number;
  digs: number;
  grenadeKills: number;
  bestStreak: number;
  bestKills: number;
  breakthroughWins: number;
  /** Fronts won at least once. */
  frontsWon: string[];
  /** Battles per front. */
  fronts: Record<string, number>;
}

export const EMPTY_RECORD: WarRecord = {
  battles: 0,
  wins: 0,
  kills: 0,
  deaths: 0,
  captures: 0,
  digs: 0,
  grenadeKills: 0,
  bestStreak: 0,
  bestKills: 0,
  breakthroughWins: 0,
  frontsWon: [],
  fronts: {},
};

export interface Medal {
  id: string;
  name: string;
  description: string;
  /** Ribbon colours (left → right). */
  ribbon: [string, string, string];
  earned: (r: WarRecord) => boolean;
  /** Progress toward it, 0..1. */
  progress: (r: WarRecord) => number;
}

const toward = (v: number, goal: number) => Math.min(1, v / goal);

export const MEDALS: Medal[] = [
  {
    id: "dispatches",
    name: "Mentioned in Dispatches",
    description: "Win your first battle.",
    ribbon: ["#8a1c1c", "#e9e3d0", "#8a1c1c"],
    earned: (r) => r.wins >= 1,
    progress: (r) => toward(r.wins, 1),
  },
  {
    id: "old-contemptible",
    name: "Old Contemptible",
    description: "Fight in 25 battles.",
    ribbon: ["#c42b2b", "#f2f2f2", "#2b4fc4"],
    earned: (r) => r.battles >= 25,
    progress: (r) => toward(r.battles, 25),
  },
  {
    id: "flag-bearer",
    name: "Flag Bearer",
    description: "Capture 25 flags.",
    ribbon: ["#c9a24a", "#3a2f1a", "#c9a24a"],
    earned: (r) => r.captures >= 25,
    progress: (r) => toward(r.captures, 25),
  },
  {
    id: "sappers-spade",
    name: "Sapper's Spade",
    description: "Dig 100 cells of trench.",
    ribbon: ["#5b4a32", "#a38f68", "#5b4a32"],
    earned: (r) => r.digs >= 100,
    progress: (r) => toward(r.digs, 100),
  },
  {
    id: "grenadier",
    name: "Grenadier",
    description: "Take out 15 enemies with grenades.",
    ribbon: ["#2e4a2a", "#d8c07a", "#2e4a2a"],
    earned: (r) => r.grenadeKills >= 15,
    progress: (r) => toward(r.grenadeKills, 15),
  },
  {
    id: "military-cross",
    name: "Military Cross",
    description: "100 kills in total.",
    ribbon: ["#f1f1f1", "#6c3a8e", "#f1f1f1"],
    earned: (r) => r.kills >= 100,
    progress: (r) => toward(r.kills, 100),
  },
  {
    id: "iron-nerve",
    name: "Iron Nerve",
    description: "8 kills without dying.",
    ribbon: ["#3b3f45", "#9aa3ad", "#3b3f45"],
    earned: (r) => r.bestStreak >= 8,
    progress: (r) => toward(r.bestStreak, 8),
  },
  {
    id: "breakthrough",
    name: "The Breakthrough",
    description: "Win a Breakthrough battle.",
    ribbon: ["#1f5a8a", "#e9e3d0", "#b52a2a"],
    earned: (r) => r.breakthroughWins >= 1,
    progress: (r) => toward(r.breakthroughWins, 1),
  },
  {
    id: "five-fronts",
    name: "Five Fronts",
    description: "Win on Gallipoli, the Somme, Verdun, Passchendaele and Vimy Ridge.",
    ribbon: ["#2a6e3f", "#e0c35a", "#8a1c1c"],
    earned: (r) => r.frontsWon.length >= 5,
    progress: (r) => toward(r.frontsWon.length, 5),
  },
  {
    id: "victoria-cross",
    name: "Victoria Cross",
    description: "12 kills in a single battle.",
    ribbon: ["#7a1f2b", "#7a1f2b", "#7a1f2b"],
    earned: (r) => r.bestKills >= 12,
    progress: (r) => toward(r.bestKills, 12),
  },
];

const key = () => "zx-war-record" + deviceSaveSuffix();

export function readWarRecord(): WarRecord {
  try {
    const raw = JSON.parse(localStorage.getItem(key()) ?? "null") as Partial<WarRecord> | null;
    if (raw && typeof raw.battles === "number") return { ...EMPTY_RECORD, ...raw, frontsWon: raw.frontsWon ?? [], fronts: raw.fronts ?? {} };
  } catch {
    // fall through
  }
  return { ...EMPTY_RECORD, frontsWon: [], fronts: {} };
}

/** Pure: the record after one more battle. */
export function withBattle(r: WarRecord, m: TrenchesMatch): WarRecord {
  return {
    battles: r.battles + 1,
    wins: r.wins + (m.won ? 1 : 0),
    kills: r.kills + m.kills,
    deaths: r.deaths + m.deaths,
    captures: r.captures + m.captures,
    digs: r.digs + m.digs,
    grenadeKills: r.grenadeKills + m.grenadeKills,
    bestStreak: Math.max(r.bestStreak, m.bestStreak),
    bestKills: Math.max(r.bestKills, m.kills),
    breakthroughWins: r.breakthroughWins + (m.won && m.mode === "breakthrough" ? 1 : 0),
    frontsWon: m.won && !r.frontsWon.includes(m.front) ? [...r.frontsWon, m.front] : r.frontsWon,
    fronts: { ...r.fronts, [m.front]: (r.fronts[m.front] ?? 0) + 1 },
  };
}

/** Record a battle; returns the medals it just earned. */
export function addBattle(m: TrenchesMatch): Medal[] {
  const before = readWarRecord();
  const after = withBattle(before, m);
  try {
    localStorage.setItem(key(), JSON.stringify(after));
  } catch {
    // storage blocked: the record lasts for this page only
  }
  return MEDALS.filter((x) => x.earned(after) && !x.earned(before));
}
