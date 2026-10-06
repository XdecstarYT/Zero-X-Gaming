/**
 * Crises (Statecraft, 1.0): events that run over hours and stages, each with three ways to
 * respond and a cost for doing nothing. A general strike that halts industry, a flood in one
 * district, a corruption probe after a leak or a scandal, angry protests, a debt crunch.
 * One crisis at a time.
 */
import type { Stats } from "../sim/sim";
import type { LobbyId } from "./lobbies";
import { FACTIONS, MINISTRIES, setTax, type Faction, type Moods, type PoliticsState } from "./politics";
import { clamp, isHour, rollOf } from "./util";

export const CRISIS_IDS = ["strike", "flood", "probe", "protest", "crunch"] as const;
export type CrisisId = (typeof CRISIS_IDS)[number];

export interface Opt {
  cash?: number;
  capital?: number;
  mood?: Partial<Moods>;
  /** Mood for the group the crisis is about (protests). */
  groupMood?: number;
  lobby?: Partial<Record<LobbyId, number>>;
  /** Ground game in the district it's about. */
  effort?: number;
  /** Something only code can do. */
  special?: "sack" | "taxRise" | "cuts";
  /** Where it goes: another stage, or the end with a headline. */
  next?: string;
  outcome?: string;
  /** A gamble: with this chance it goes to `next`/`outcome`, otherwise to `alt`/`altOutcome`. */
  chance?: number;
  alt?: string;
  altOutcome?: string;
  /** Extra effects when the gamble fails. */
  altMood?: Partial<Moods>;
  altCash?: number;
}
export interface Stage {
  hours: number;
  options: [Opt, Opt, Opt];
  /** What happens if you let the clock run out. */
  timeout: Opt;
  /** Industry stops while this stage runs. */
  incomeIMul?: number;
}
export const CRISES: Record<CrisisId, { first: string; stages: Record<string, Stage> }> = {
  strike: {
    first: "threat",
    stages: {
      threat: {
        hours: 24,
        options: [
          { cash: -8_000, mood: { workers: 6 }, lobby: { unions: 10 }, outcome: "deal" },
          { capital: -8, chance: 0.5, outcome: "deal", alt: "strike" },
          { mood: { business: 3 }, lobby: { commerce: 5 }, next: "strike" },
        ],
        timeout: { next: "strike" },
      },
      strike: {
        hours: 24,
        incomeIMul: 0.4,
        options: [
          { cash: -12_000, mood: { workers: 4 }, outcome: "settled" },
          { mood: { workers: -2 }, outcome: "fizzled", chance: 0.4, alt: "strike" },
          { capital: -15, mood: { business: 5, workers: -12 }, lobby: { unions: -30 }, outcome: "broken" },
        ],
        timeout: { mood: { workers: -6, business: -4 }, outcome: "fizzled" },
      },
    },
  },
  flood: {
    first: "flood",
    stages: {
      flood: {
        hours: 12,
        options: [
          { cash: -15_000, mood: { workers: 2, business: 2, families: 2, greens: 2, seniors: 2 }, effort: 15, outcome: "relief" },
          { capital: -10, chance: 0.6, outcome: "aid", altOutcome: "aidRefused", altMood: { workers: -2, business: -2, families: -2, greens: -2, seniors: -2 } },
          { mood: { workers: -4, business: -4, families: -4, greens: -4, seniors: -4 }, effort: -20, outcome: "neglect" },
        ],
        timeout: { mood: { workers: -4, business: -4, families: -4, greens: -4, seniors: -4 }, effort: -20, outcome: "neglect" },
      },
    },
  },
  probe: {
    first: "allegations",
    stages: {
      allegations: {
        hours: 24,
        options: [
          { capital: -8, mood: { workers: -1, business: -1, families: -1, greens: -1, seniors: -1 }, chance: 0.6, outcome: "cleared", alt: "inquiry" },
          { chance: 0.5, outcome: "blownOver", alt: "inquiry" },
          { special: "sack", mood: { workers: 1, business: 1, families: 1, greens: 1, seniors: 1 }, outcome: "scapegoat" },
        ],
        timeout: { next: "inquiry" },
      },
      inquiry: {
        hours: 24,
        options: [
          { capital: -12, chance: 0.6, outcome: "cleared", altOutcome: "censured", altMood: { workers: -5, business: -5, families: -5, greens: -5, seniors: -5 } },
          { cash: -10_000, chance: 0.75, outcome: "cleared", altOutcome: "censured", altMood: { workers: -5, business: -5, families: -5, greens: -5, seniors: -5 } },
          { mood: { seniors: 1 }, chance: 0.3, outcome: "cleared", altOutcome: "censured", altMood: { workers: -6, business: -6, families: -6, greens: -6, seniors: -6 } },
        ],
        timeout: { mood: { workers: -5, business: -5, families: -5, greens: -5, seniors: -5 }, outcome: "censured" },
      },
    },
  },
  protest: {
    first: "protest",
    stages: {
      protest: {
        hours: 12,
        options: [
          { capital: -6, groupMood: 5, outcome: "heard" },
          { cash: -5_000, groupMood: 7, mood: { workers: -1, business: -1, families: -1, greens: -1, seniors: -1 }, outcome: "concession" },
          { groupMood: -8, mood: { seniors: 2, greens: -3 }, outcome: "crackdown" },
        ],
        timeout: { groupMood: -4, outcome: "festered" },
      },
    },
  },
  crunch: {
    first: "crunch",
    stages: {
      crunch: {
        hours: 24,
        options: [
          { special: "taxRise", mood: { workers: -2, business: -5, families: -2, greens: -2, seniors: -2 }, outcome: "taxes" },
          { special: "cuts", mood: { workers: -4, families: -3 }, outcome: "cuts" },
          { cash: 20_000, capital: -10, mood: { seniors: -2 }, outcome: "loan" },
        ],
        timeout: { capital: -10, mood: { workers: -3, business: -3, families: -3, greens: -3, seniors: -3 }, outcome: "default" },
      },
    },
  },
};

export interface ActiveCrisis {
  id: CrisisId;
  stage: string;
  until: number;
  /** The district it's in (flood, protest), and the group it's about (protest). */
  district: number;
  group: Faction | null;
}
export interface CrisisState {
  active: ActiveCrisis | null;
  /** When each crisis last happened (they don't repeat within three days). */
  last: Partial<Record<CrisisId, number>>;
  resolved: number;
}

export const newCrises = (): CrisisState => ({ active: null, last: {}, resolved: 0 });

/** Industrial tax income while a strike is on. */
export const crisisIncomeI = (s: PoliticsState) => {
  const a = s.x?.crises.active;
  return a ? (CRISES[a.id].stages[a.stage]?.incomeIMul ?? 1) : 1;
};

export type CrisisEvent = { t: "crisis"; c: ActiveCrisis } | { t: "crisisStage"; c: ActiveCrisis } | { t: "crisisOver"; id: CrisisId; outcome: string };

function applyOpt(s: PoliticsState, c: ActiveCrisis, o: Opt) {
  s.cash += o.cash ?? 0;
  s.parl.capital = clamp(s.parl.capital + (o.capital ?? 0), 0, 100);
  for (const [g, v] of Object.entries(o.mood ?? {})) s.mood[g as Faction] += v ?? 0;
  if (c.group && o.groupMood) s.mood[c.group] += o.groupMood;
  for (const [l, v] of Object.entries(o.lobby ?? {})) {
    const r = s.x.lobbies.rec[l as LobbyId];
    if (r) r.relation = clamp(r.relation + (v ?? 0), -100, 100);
  }
  if (o.effort && c.district >= 0) s.m.effort[c.district] = clamp((s.m.effort[c.district] ?? 0) + o.effort, 0, 100);
  if (o.special === "sack") {
    const m = MINISTRIES.find((k) => s.parl.ministers[k]);
    if (m) {
      const who = s.parl.ministers[m]!;
      s.parl.ministers[m] = null;
      if (who.party !== "civic") s.parl.relations[who.party] = clamp(s.parl.relations[who.party] - 10, -100, 100);
    }
  } else if (o.special === "taxRise") {
    for (const z of ["R", "C", "I"] as const) setTax(s, z, s.taxes[z] + 0.02);
  } else if (o.special === "cuts") {
    for (const k of MINISTRIES) s.x.budget.levels[k] = Math.max(0, s.x.budget.levels[k] - 1);
  }
}

/** Where an option leads: a new stage, or the end with a headline. */
function settle(s: PoliticsState, c: ActiveCrisis, o: Opt, minutes: number): CrisisEvent {
  let next = o.next;
  let outcome = o.outcome;
  if (o.chance !== undefined && rollOf(s, 4519).next() >= o.chance) {
    next = o.alt;
    outcome = o.altOutcome;
    for (const [g, v] of Object.entries(o.altMood ?? {})) s.mood[g as Faction] += v ?? 0;
    s.cash += o.altCash ?? 0;
  } else if (o.outcome === "aid") s.cash += 10_000;
  if (next) {
    // A gamble that fails into the same stage just buys time.
    c.stage = next;
    c.until = minutes + CRISES[c.id].stages[next].hours * 60;
    return { t: "crisisStage", c: { ...c } };
  }
  s.x.crises.active = null;
  s.x.crises.resolved++;
  return { t: "crisisOver", id: c.id, outcome: outcome ?? "over" };
}

/** Respond to the crisis on your desk. */
export function respond(s: PoliticsState, pick: number, minutes: number): CrisisEvent | null {
  const c = s.x.crises.active;
  if (!c) return null;
  const o = CRISES[c.id].stages[c.stage].options[clamp(pick, 0, 2)];
  if ((o.capital ?? 0) < 0 && s.parl.capital < -(o.capital ?? 0)) return null;
  applyOpt(s, c, o);
  return settle(s, c, o, minutes);
}

/** Can you afford this option (capital)? */
export const canRespond = (s: PoliticsState, pick: number) => {
  const c = s.x.crises.active;
  if (!c) return false;
  const o = CRISES[c.id].stages[c.stage].options[pick];
  return (o.capital ?? 0) >= 0 || s.parl.capital >= -(o.capital ?? 0);
};

export function crisisHour(s: PoliticsState, minutes: number, h: number, st: Stats): CrisisEvent[] {
  const cs = s.x.crises;
  const out: CrisisEvent[] = [];
  const c = cs.active;
  if (c && minutes >= c.until) {
    const o = CRISES[c.id].stages[c.stage].timeout;
    applyOpt(s, c, o);
    out.push(settle(s, c, o, minutes));
  }
  // Mid-morning: is something brewing?
  if (!cs.active && isHour(h, 10) && s.status === "office" && st.population > 150) {
    const r = rollOf(s, 2203);
    const fresh = (id: CrisisId) => minutes - (cs.last[id] ?? -1e9) > 3 * 24 * 60;
    const ds = s.m.districts;
    const lowest = FACTIONS.reduce((a, b) => (s.approval[b] < s.approval[a] ? b : a));
    let pick: { id: CrisisId; district: number; group: Faction | null } | null = null;
    if (fresh("probe") && s.x.lobbies.leaked) pick = { id: "probe", district: -1, group: null };
    else if (fresh("crunch") && s.cash < -15_000) pick = { id: "crunch", district: -1, group: null };
    else if (fresh("strike") && s.approval.workers < 38 && st.iJobs > 80 && r.next() < 0.5) pick = { id: "strike", district: -1, group: "workers" };
    else if (fresh("protest") && s.approval[lowest] < 30 && r.next() < 0.6) {
      const d = ds.length ? ds.reduce((a, b) => ((s.m.dstats.find((x) => x.id === b.id)?.mix[lowest] ?? 0) > (s.m.dstats.find((x) => x.id === a.id)?.mix[lowest] ?? 0) ? b : a)).id : -1;
      pick = { id: "protest", district: d, group: lowest };
    } else if (fresh("flood") && ds.length && r.next() < 0.05) pick = { id: "flood", district: ds[Math.floor(r.next() * ds.length)].id, group: null };
    if (pick) {
      if (pick.id === "probe") s.x.lobbies.leaked = false;
      const first = CRISES[pick.id].first;
      cs.active = { id: pick.id, stage: first, until: minutes + CRISES[pick.id].stages[first].hours * 60, district: pick.district, group: pick.group };
      cs.last[pick.id] = minutes;
      out.push({ t: "crisis", c: { ...cs.active } });
    }
  }
  return out;
}

