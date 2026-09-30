import { deviceSaveSuffix } from "@/lib/device-accounts";
import type { CarKind } from "./vehicles";

/**
 * A Code 3 career: every shift's score becomes career XP. Ranks unlock harder
 * callouts (armed robberies, shots fired, pursuits, street racing, bank jobs)
 * and faster units. Saved per device account.
 */

export const RANKS = [
  { name: "Cadet", xp: 0 },
  { name: "Officer", xp: 800 },
  { name: "Senior Officer", xp: 2500 },
  { name: "Corporal", xp: 5000 },
  { name: "Sergeant", xp: 9000 },
  { name: "Lieutenant", xp: 15000 },
  { name: "Captain", xp: 24000 },
  { name: "Chief of Police", xp: 40000 },
] as const;

export const UNITS: { kind: CarKind; rank: number; blurb: string }[] = [
  { kind: "cruiser", rank: 0, blurb: "Black-and-white patrol sedan. Push bar, light bar, dependable." },
  { kind: "interceptor", rank: 1, blurb: "Police Interceptor SUV. Heavier: wins every shove." },
  { kind: "slicktop", rank: 4, blurb: "Unmarked slicktop. Hidden lights: nobody sees you coming." },
  { kind: "pursuit", rank: 5, blurb: "Pursuit coupe. The fastest thing in Bayview." },
];

export interface Career {
  xp: number;
  shifts: number;
  arrests: number;
  calls: number;
  pursuits: number;
  best: number;
}

const EMPTY: Career = { xp: 0, shifts: 0, arrests: 0, calls: 0, pursuits: 0, best: 0 };
const key = () => "zx-code3-career" + deviceSaveSuffix();

export function readCareer(): Career {
  try {
    const raw = JSON.parse(localStorage.getItem(key()) ?? "null") as Partial<Career> | null;
    if (raw && typeof raw.xp === "number") return { ...EMPTY, ...raw };
  } catch {
    // fall through
  }
  return { ...EMPTY };
}

export function rankOf(xp: number) {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (xp >= RANKS[k].xp) i = k;
  return i;
}

/** Pure: the career after a shift. */
export function withShift(c: Career, s: { score: number; arrests: number; calls: number; pursuits: number }): Career {
  return {
    xp: c.xp + Math.max(0, s.score),
    shifts: c.shifts + 1,
    arrests: c.arrests + s.arrests,
    calls: c.calls + s.calls,
    pursuits: c.pursuits + s.pursuits,
    best: Math.max(c.best, s.score),
  };
}

export function saveShift(s: { score: number; arrests: number; calls: number; pursuits: number }) {
  const before = readCareer();
  const after = withShift(before, s);
  try {
    localStorage.setItem(key(), JSON.stringify(after));
  } catch {
    // storage blocked: this session only
  }
  return { before, after, promoted: rankOf(after.xp) > rankOf(before.xp) };
}
