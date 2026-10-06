/**
 * The city budget (Statecraft, 1.0). Each of the six departments runs at a spending level from
 * deep cuts (0) to generous (4); standard (2) costs nothing extra. Every two days a Budget Day
 * comes round: you draft the levels and put them to the chamber. A budget that passes sets
 * spending for the next cycle; one that fails costs you, and twice is a real crisis.
 */
import type { SimPolicy } from "../sim/sim";
import { PARTIES, PARTY_BASE, MAJORITY, MINISTRIES, type Faction, type Ministry, type Moods, type PartyId, type PoliticsState } from "./politics";
import { clamp, sigmoid } from "./util";

export const LEVELS = 5;
export const STANDARD = 2;
export const CYCLE = 2 * 24 * 60;
/** Hours you have to present the budget once Budget Day comes. */
export const WINDOW = 12 * 60;

/** Daily cost of one level above standard (a level below saves the same), before city size. */
export const UNIT: Record<Ministry, number> = { finance: 300, transport: 420, environment: 300, housing: 450, safety: 450, culture: 260 };

/** What one level above standard does for each group (approval score; cuts do the reverse). */
export const DEPT_EFFECT: Record<Ministry, Partial<Moods>> = {
  finance: { business: 0.03, seniors: 0.01 },
  transport: { workers: 0.05, business: 0.03 },
  environment: { greens: 0.07, families: 0.02 },
  housing: { workers: 0.04, families: 0.05 },
  safety: { seniors: 0.05, families: 0.04 },
  culture: { workers: 0.015, business: 0.015, families: 0.015, greens: 0.015, seniors: 0.015 },
};

export interface BudgetState {
  levels: Record<Ministry, number>;
  /** The draft you're working on (null until Budget Day). */
  draft: Record<Ministry, number> | null;
  /** When the next Budget Day comes. */
  nextDay: number;
  /** Budget Day is here: present before `dueAt`. */
  due: boolean;
  dueAt: number;
  /** Failed attempts this cycle. */
  failures: number;
  passed: number;
  last: { m: number; passed: boolean; yes: number; no: number } | null;
}

const standard = (): Record<Ministry, number> => ({ finance: 2, transport: 2, environment: 2, housing: 2, safety: 2, culture: 2 });

export function newBudget(minutes: number): BudgetState {
  return { levels: standard(), draft: null, nextDay: minutes + CYCLE, due: false, dueAt: 0, failures: 0, passed: 0, last: null };
}

/** Bigger cities cost more to run. */
const scale = (population: number) => 1 + population / 5000;

/** Extra daily spending (negative: savings) for a set of levels. */
export function deptCost(levels: Record<Ministry, number>, population: number) {
  let n = 0;
  for (const m of MINISTRIES) n += (levels[m] - STANDARD) * UNIT[m] * scale(population);
  return Math.round(n);
}

/** What the levels do for each group's approval (added to their targets). */
export function deptScore(levels: Record<Ministry, number>): Moods {
  const out: Moods = { workers: 0, business: 0, families: 0, greens: 0, seniors: 0 };
  for (const m of MINISTRIES) {
    const d = levels[m] - STANDARD;
    for (const [g, v] of Object.entries(DEPT_EFFECT[m])) out[g as Faction] += (v ?? 0) * d;
  }
  return out;
}

/** The finance department collects taxes: generous funding brings a little more in. */
export const deptIncomeMul = (levels: Record<Ministry, number>) => 1 + 0.02 * (levels.finance - STANDARD);

/** What the levels do to the city sim. */
export function deptSim(levels: Record<Ministry, number>, out: SimPolicy) {
  const d = (m: Ministry) => levels[m] - STANDARD;
  out.wearMul = (out.wearMul ?? 1) * clamp(1 - 0.12 * d("transport"), 0.5, 1.5);
  out.fireMul = (out.fireMul ?? 1) * clamp(1 - 0.12 * d("safety"), 0.5, 1.5);
  out.tourismMul = (out.tourismMul ?? 1) * clamp(1 + 0.08 * d("culture"), 0.7, 1.3);
  out.bias.R += 0.04 * d("housing");
}

// ------------------------------------------------------------------- the vote

function partyScore(s: PoliticsState, party: PartyId, levels: Record<Ministry, number>, population: number) {
  if (party === "civic") return 99;
  const sc = deptScore(levels);
  let v = 0;
  let w = 0;
  for (const [g, k] of Object.entries(PARTY_BASE[party])) {
    v += sc[g as Faction] * (k ?? 0);
    w += k ?? 0;
  }
  // Every party weighs what its voters get against what it costs; Enterprise most of all,
  // and doubly while the books are in the red.
  const spend = deptCost(levels, population) / (1000 * scale(population));
  const thrift = (party === "enterprise" ? 10 : 5) * (s.cash < 0 ? 2 : 1);
  return (w ? v / w : 0) * 200 - spend * thrift + s.parl.relations[party] * 0.3 + (s.parl.coalition.includes(party) ? 18 : 0) + 4;
}

export function budgetForecast(s: PoliticsState, levels: Record<Ministry, number>, population: number) {
  const votes = PARTIES.map((party) => ({ party, seats: s.parl.seats[party], yes: party === "civic" ? s.parl.seats.civic : Math.round(s.parl.seats[party] * sigmoid(partyScore(s, party, levels, population) / 10)) }));
  const yes = votes.reduce((n, v) => n + v.yes, 0);
  const total = votes.reduce((n, v) => n + v.seats, 0);
  return { votes, yes, no: total - yes, passed: yes >= MAJORITY };
}

/** Set a level in the draft (starting from the current budget). */
export function setDraft(s: PoliticsState, m: Ministry, level: number) {
  const b = s.x.budget;
  if (!b.due) return false;
  b.draft = { ...(b.draft ?? b.levels), [m]: clamp(Math.round(level), 0, LEVELS - 1) };
  return true;
}

export type BudgetEvent = { t: "budgetDay" } | { t: "budgetLapsed" } | { t: "budgetPassed"; yes: number; no: number } | { t: "budgetFailed"; yes: number; no: number; twice: boolean };

/** Put the draft to the chamber. */
export function presentBudget(s: PoliticsState, minutes: number, population: number): BudgetEvent | null {
  const b = s.x.budget;
  if (!b.due) return null;
  const levels = b.draft ?? b.levels;
  const f = budgetForecast(s, levels, population);
  b.last = { m: minutes, passed: f.passed, yes: f.yes, no: f.no };
  if (f.passed) {
    b.levels = { ...levels };
    b.draft = null;
    b.due = false;
    b.failures = 0;
    b.passed++;
    b.nextDay = minutes + CYCLE;
    return { t: "budgetPassed", yes: f.yes, no: f.no };
  }
  b.failures++;
  s.parl.capital = Math.max(0, s.parl.capital - 6);
  const twice = b.failures >= 2;
  if (twice) {
    // Two defeats: the old budget rolls on, and the city notices.
    for (const g of Object.keys(s.mood) as Faction[]) s.mood[g] -= 3;
    s.parl.capital = Math.max(0, s.parl.capital - 10);
    b.due = false;
    b.draft = null;
    b.failures = 0;
    b.nextDay = minutes + CYCLE;
  }
  return { t: "budgetFailed", yes: f.yes, no: f.no, twice };
}

export function budgetHour(s: PoliticsState, minutes: number): BudgetEvent[] {
  const b = s.x.budget;
  const out: BudgetEvent[] = [];
  if (!b.due && minutes >= b.nextDay) {
    b.due = true;
    b.dueAt = minutes + WINDOW;
    b.draft = { ...b.levels };
    out.push({ t: "budgetDay" });
  } else if (b.due && minutes >= b.dueAt) {
    // Not presented in time: the old budget rolls over, and you look disorganised.
    b.due = false;
    b.draft = null;
    b.failures = 0;
    b.nextDay = minutes + CYCLE;
    s.parl.capital = Math.max(0, s.parl.capital - 8);
    out.push({ t: "budgetLapsed" });
  }
  return out;
}
