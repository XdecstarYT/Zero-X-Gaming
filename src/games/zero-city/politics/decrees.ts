/**
 * Mayoral decrees (Statecraft, 1.0): orders that skip the chamber. Each costs political capital
 * (some cost money too), lasts a while, then needs time before it can be used again. Ruling by
 * decree annoys every party that wasn't asked.
 */
import type { SimPolicy } from "../sim/sim";
import { FACTIONS, PARTIES, type Faction, type Moods, type PoliticsState } from "./politics";
import { clamp } from "./util";

export const DECREE_IDS = ["curfew", "festival", "hiringFreeze", "carFree", "publicWorks", "taxAmnesty", "emergencyHousing"] as const;
export type DecreeId = (typeof DECREE_IDS)[number];

export interface DecreeDef {
  capital: number;
  cash?: number;
  /** Game hours it lasts (0: one-off). */
  hours: number;
  /** Game hours before it can be used again (from when it's issued). */
  cooldown: number;
  /** Mood each hour while it's in force. */
  perHour?: Partial<Moods>;
  /** Mood once, when issued. */
  once?: Partial<Moods>;
  sim?: { carShare?: number; tourismMul?: number; bias?: Partial<SimPolicy["bias"]> };
  /** Multiplies upkeep / income while in force. */
  upkeepMul?: number;
  incomeMul?: number;
}

export const DECREES: Record<DecreeId, DecreeDef> = {
  curfew: { capital: 15, hours: 24, cooldown: 72, perHour: { seniors: 0.25, families: 0.15, workers: -0.2, greens: -0.1 }, incomeMul: 0.98 },
  festival: { capital: 8, cash: 6_000, hours: 12, cooldown: 48, once: { workers: 5, families: 4, business: 3, greens: 2, seniors: 1 }, sim: { tourismMul: 1.3 } },
  hiringFreeze: { capital: 12, hours: 48, cooldown: 96, perHour: { workers: -0.15, families: -0.05 }, upkeepMul: 0.9 },
  carFree: { capital: 10, hours: 24, cooldown: 72, perHour: { greens: 0.25, families: 0.05, business: -0.15 }, sim: { carShare: 0.7 } },
  publicWorks: { capital: 14, cash: 15_000, hours: 48, cooldown: 96, perHour: { workers: 0.3, business: 0.05 }, sim: { bias: { I: 0.05 } } },
  taxAmnesty: { capital: 18, hours: 0, cooldown: 120, once: { business: 4, workers: -3, families: -2 } },
  emergencyHousing: { capital: 16, cash: 10_000, hours: 48, cooldown: 96, perHour: { workers: 0.15, families: 0.1, seniors: -0.05 }, sim: { bias: { R: 0.15 } } },
};

export interface DecreeState {
  active: { id: DecreeId; until: number }[];
  /** When each decree can be used again. */
  readyAt: Partial<Record<DecreeId, number>>;
  issued: number;
}

export const newDecrees = (): DecreeState => ({ active: [], readyAt: {}, issued: 0 });

export function canIssue(s: PoliticsState, id: DecreeId, minutes: number) {
  const d = DECREES[id];
  return s.status === "office" && s.parl.capital >= d.capital && (s.x.decrees.readyAt[id] ?? 0) <= minutes && s.cash - (d.cash ?? 0) >= -25_000 && !s.x.decrees.active.some((a) => a.id === id);
}

/** Issue a decree. `dailyIncome` is today's tax take (the amnesty brings half a day forward). */
export function issue(s: PoliticsState, id: DecreeId, minutes: number, dailyIncome: number) {
  if (!canIssue(s, id, minutes)) return false;
  const d = DECREES[id];
  const st = s.x.decrees;
  s.parl.capital -= d.capital;
  s.cash -= d.cash ?? 0;
  if (id === "taxAmnesty") s.cash += Math.round(dailyIncome * 0.5);
  for (const [g, v] of Object.entries(d.once ?? {})) s.mood[g as Faction] += v ?? 0;
  if (d.hours > 0) st.active = [...st.active, { id, until: minutes + d.hours * 60 }];
  st.readyAt[id] = minutes + d.cooldown * 60;
  st.issued++;
  // Ruling by decree: the opposition notices.
  for (const p of PARTIES) if (p !== "civic" && !s.parl.coalition.includes(p)) s.parl.relations[p] = clamp(s.parl.relations[p] - 3, -100, 100);
  return true;
}

/** What decrees in force do to the sim. */
export function decreeSim(s: PoliticsState, out: SimPolicy) {
  for (const a of s.x.decrees.active) {
    const d = DECREES[a.id].sim;
    if (!d) continue;
    if (d.carShare) out.carShare *= d.carShare;
    if (d.tourismMul) out.tourismMul = (out.tourismMul ?? 1) * d.tourismMul;
    for (const z of ["R", "C", "I", "M"] as const) out.bias[z] += d.bias?.[z] ?? 0;
  }
}

export function decreeMul(s: PoliticsState) {
  let upkeep = 1;
  let income = 1;
  for (const a of s.x?.decrees.active ?? []) {
    upkeep *= DECREES[a.id].upkeepMul ?? 1;
    income *= DECREES[a.id].incomeMul ?? 1;
  }
  return { upkeep, income };
}

export type DecreeEvent = { t: "decreeEnded"; id: DecreeId };

/** An hour of decrees: their moods, and the ones that run out. */
export function decreeHour(s: PoliticsState, minutes: number): DecreeEvent[] {
  const st = s.x.decrees;
  const out: DecreeEvent[] = [];
  for (const a of st.active) for (const g of FACTIONS) s.mood[g] += DECREES[a.id].perHour?.[g] ?? 0;
  for (const a of st.active) if (minutes >= a.until) out.push({ t: "decreeEnded", id: a.id });
  st.active = st.active.filter((a) => minutes < a.until);
  return out;
}
