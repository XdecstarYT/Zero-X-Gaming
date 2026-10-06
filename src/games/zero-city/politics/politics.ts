/**
 * Mayor mode: the city's politics. Pure and deterministic given its seed, so it runs on the
 * main thread off the sim's stats and is unit-tested on its own.
 *
 * You are the mayor. Money is real: taxes come in every hour and upkeep goes out, and
 * building costs money. Five groups of voters each judge you on what they care about.
 * Policies need the seven-seat council to pass them. Dilemmas land on your desk. Every
 * term ends in an election you can lose.
 */
import { rng } from "../core/rng";
import type { SimPolicy, Stats } from "../sim/sim";
import type { ServiceKind } from "../world/lots";
import type { RoadTypeId } from "../world/roads";

export const FACTIONS = ["workers", "business", "families", "greens", "seniors"] as const;
export type Faction = (typeof FACTIONS)[number];
export type Moods = Record<Faction, number>;

/** Game minutes in a term (four days). */
export const TERM_MINUTES = 4 * 24 * 60;
/** How far below zero the treasury may go before building stops (a credit line). */
export const CREDIT = 25_000;
export const START_CASH = 80_000;
export const COUNCIL_SEATS = 7;

// ------------------------------------------------------------------ costs

/** Construction, per metre of road. Bridges cost three times as much. */
export const ROAD_COST: Record<RoadTypeId, number> = {
  street: 12,
  avenue: 22,
  boulevard: 34,
  highway: 60,
  expressway: 80,
  ramp: 40,
  busStreet: 16,
  busAvenue: 26,
  parkingStreet: 15,
  parkingAvenue: 25,
};
export const SERVICE_COST: Record<ServiceKind, { build: number; upkeep: number }> = {
  police: { build: 9_000, upkeep: 500 },
  fire: { build: 9_000, upkeep: 500 },
  clinic: { build: 12_000, upkeep: 700 },
  school: { build: 14_000, upkeep: 800 },
  power: { build: 20_000, upkeep: 900 },
  water: { build: 12_000, upkeep: 400 },
  park: { build: 3_000, upkeep: 80 },
  depot: { build: 15_000, upkeep: 600 },
  marina: { build: 70_000, upkeep: 1_500 },
  lighthouse: { build: 25_000, upkeep: 300 },
  casino: { build: 120_000, upkeep: 2_000 },
  resort: { build: 95_000, upkeep: 1_800 },
  hospital: { build: 60_000, upkeep: 2_400 },
  museum: { build: 45_000, upkeep: 1_200 },
  university: { build: 90_000, upkeep: 3_000 },
  stadium: { build: 140_000, upkeep: 3_500 },
  tower: { build: 220_000, upkeep: 2_000 },
};
/** Per day: each km of road, each bus line. */
export const ROAD_UPKEEP_KM = 200;
export const LINE_UPKEEP = 400;
export const STOP_COST = 400;
/** Terrain work, per brush dab. */
export const TERRAIN_COST = 60;
/** Tax per day at a 100% rate (so 10% of this): per resident, per commercial job, per industrial job. */
const TAX_BASE = { R: 26, C: 26, I: 24 };
export const TOWN_HALL_COST = 2_500;

// --------------------------------------------------------------- policies

export const POLICY_IDS = [
  "freeTransit",
  "recycling",
  "heritage",
  "smallBiz",
  "nightlife",
  "cleanAir",
  "bikeLanes",
  "tourism",
  "watch",
  "rentCap",
  "auditOffice",
  "landTax",
  "roadFund",
  "congestionCharge",
  "nightBuses",
  "solarRoofs",
  "treePlanting",
  "greenBelt",
  "socialHousing",
  "zoningReform",
  "fireCode",
  "cctv",
  "festivalFund",
  "libraries",
] as const;
export type PolicyId = (typeof POLICY_IDS)[number];

/** The six departments: every law belongs to one, and each has a minister. */
export const MINISTRIES = ["finance", "transport", "environment", "housing", "safety", "culture"] as const;
export type Ministry = (typeof MINISTRIES)[number];

export interface PolicyDef {
  ministry: Ministry;
  /** Per day. */
  cost: number;
  /** How each group feels about it, −1…1. */
  stance: Partial<Moods>;
  /** Multiplies all tax income. */
  income?: number;
  /** Multiplies all upkeep. */
  upkeepMul?: number;
  sim?: { bias?: Partial<SimPolicy["bias"]>; maxTier?: number; carShare?: number; wearMul?: number; fireMul?: number; tourismMul?: number };
}
export const POLICIES: Record<PolicyId, PolicyDef> = {
  freeTransit: { ministry: "transport", cost: 1_800, stance: { workers: 0.6, greens: 0.5, business: -0.1, seniors: 0.2 }, sim: { carShare: 0.75 } },
  recycling: { ministry: "environment", cost: 900, stance: { greens: 0.7, families: 0.2, business: -0.2 } },
  heritage: { ministry: "culture", cost: 300, stance: { seniors: 0.6, greens: 0.2, business: -0.6, workers: -0.2 }, sim: { maxTier: 3 } },
  smallBiz: { ministry: "finance", cost: 1_000, stance: { business: 0.7, workers: 0.2, greens: -0.1 }, sim: { bias: { C: 0.15 } } },
  nightlife: { ministry: "culture", cost: 0, stance: { workers: 0.4, business: 0.4, seniors: -0.6, families: -0.3 }, income: 1.04, sim: { bias: { C: 0.08 } } },
  cleanAir: { ministry: "environment", cost: 500, stance: { greens: 0.8, families: 0.4, business: -0.5, workers: -0.3 }, sim: { bias: { I: -0.2 } } },
  bikeLanes: { ministry: "transport", cost: 600, stance: { greens: 0.5, workers: 0.2, seniors: -0.2, business: -0.1 }, sim: { carShare: 0.9 } },
  tourism: { ministry: "culture", cost: 1_200, stance: { business: 0.5, workers: 0.2, seniors: -0.2 }, income: 1.06, sim: { bias: { C: 0.1 } } },
  watch: { ministry: "safety", cost: 400, stance: { seniors: 0.5, families: 0.5, workers: -0.1, greens: -0.1 } },
  rentCap: { ministry: "housing", cost: 0, stance: { workers: 0.6, families: 0.4, business: -0.7, seniors: 0.1 }, sim: { bias: { R: 0.1, C: -0.05 } } },
  auditOffice: { ministry: "finance", cost: 400, stance: { business: 0.4, seniors: 0.4, workers: -0.1 }, upkeepMul: 0.93 },
  landTax: { ministry: "finance", cost: 0, stance: { business: -0.6, workers: 0.3, greens: 0.3, seniors: -0.2 }, income: 1.06, sim: { bias: { C: -0.04 } } },
  roadFund: { ministry: "transport", cost: 900, stance: { business: 0.4, workers: 0.3, seniors: 0.2, greens: -0.2 }, sim: { wearMul: 0.6 } },
  congestionCharge: { ministry: "transport", cost: 0, stance: { greens: 0.7, business: -0.5, workers: -0.4, families: -0.1 }, income: 1.03, sim: { carShare: 0.85 } },
  nightBuses: { ministry: "transport", cost: 700, stance: { workers: 0.6, greens: 0.2, seniors: -0.1 }, sim: { carShare: 0.95 } },
  solarRoofs: { ministry: "environment", cost: 1_100, stance: { greens: 0.8, families: 0.2, business: -0.2 }, sim: { bias: { I: -0.03 } } },
  treePlanting: { ministry: "environment", cost: 500, stance: { greens: 0.6, families: 0.4, seniors: 0.2 } },
  greenBelt: { ministry: "environment", cost: 0, stance: { greens: 0.7, seniors: 0.3, business: -0.7, workers: -0.3 }, sim: { bias: { R: -0.08, I: -0.05 } } },
  socialHousing: { ministry: "housing", cost: 1_500, stance: { workers: 0.7, families: 0.4, business: -0.4, seniors: -0.1 }, sim: { bias: { R: 0.12 } } },
  zoningReform: { ministry: "housing", cost: 0, stance: { business: 0.6, workers: 0.2, seniors: -0.6, greens: -0.2 }, sim: { bias: { M: 0.15, C: 0.04 } } },
  fireCode: { ministry: "safety", cost: 600, stance: { families: 0.5, seniors: 0.4, business: -0.4 }, sim: { fireMul: 0.45 } },
  cctv: { ministry: "safety", cost: 800, stance: { seniors: 0.6, families: 0.2, greens: -0.5, workers: -0.3 } },
  festivalFund: { ministry: "culture", cost: 900, stance: { workers: 0.4, business: 0.4, families: 0.2, seniors: -0.3 }, sim: { tourismMul: 1.25 } },
  libraries: { ministry: "culture", cost: 600, stance: { families: 0.6, seniors: 0.4, greens: 0.1 } },
};

// ------------------------------------------------------------- parliament

/** The parties in the chamber. "civic" is yours. */
export const PARTIES = ["civic", "labour", "enterprise", "green", "heritage"] as const;
export type PartyId = (typeof PARTIES)[number];
/** Which voters each party speaks for (weights). Your party speaks for whoever likes you. */
export const PARTY_BASE: Record<Exclude<PartyId, "civic">, Partial<Moods>> = {
  labour: { workers: 1, families: 0.35, greens: 0.1 },
  enterprise: { business: 1, workers: 0.15, seniors: 0.2 },
  green: { greens: 1, families: 0.35 },
  heritage: { seniors: 1, families: 0.5, business: 0.1 },
};
export const PARTY_COLOR: Record<PartyId, string> = { civic: "#22e5ff", labour: "#ef4444", enterprise: "#3b82f6", green: "#22c55e", heritage: "#a855f7" };
export const CHAMBER = 15;
export const MAJORITY = Math.floor(CHAMBER / 2) + 1;

export interface Minister {
  id: number;
  name: string;
  party: PartyId;
  /** 1–5: how much good they do in their department. */
  skill: number;
  /** 0–100: low loyalty means scandals. */
  loyalty: number;
}

export interface ParlState {
  seats: Record<PartyId, number>;
  /** Parties governing with you. */
  coalition: PartyId[];
  /** Each party's feeling toward you, −100…100. */
  relations: Record<PartyId, number>;
  /** Political capital, 0–100: spent lobbying, inviting partners, reshuffling, calling referendums. */
  capital: number;
  ministers: Record<Ministry, Minister | null>;
  /** People who could serve (refreshed each term). */
  pool: Minister[];
  /** The bill on the floor: the law, on or off, and the parties you've lobbied. */
  bill: { law: PolicyId; enable: boolean; lobbied: PartyId[] } | null;
  /** The last bill the chamber threw out (a referendum can overturn it). */
  failed: { law: PolicyId; enable: boolean } | null;
  /** What each coalition partner wants passed this term. */
  demands: Partial<Record<PartyId, PolicyId>>;
  /** The campaign: groups you've rallied, ad blitzes run, whether you've debated. */
  campaign: { rallies: Faction[]; ads: number; debated: boolean };
  /** Term of the last referendum (one per term). */
  referendum: number;
  /** A minister caught in a scandal, waiting on your call. */
  scandal: Ministry | null;
  nextId: number;
  /** The last game hour the chamber was run for. */
  hour: number;
}

// -------------------------------------------------------------- dilemmas

export interface Choice {
  cash?: number;
  mood: Partial<Moods>;
  /** Switch a policy on as part of the deal. */
  policy?: PolicyId;
}
export const DILEMMA_IDS = ["factory", "festival", "strike", "stadium", "meadow", "heatwave", "startup", "noise", "potholes", "donor", "laptops", "blackout", "march", "scandal"] as const;
export type DilemmaId = (typeof DILEMMA_IDS)[number];
export const DILEMMAS: Record<DilemmaId, { a: Choice; b: Choice; minPop?: number }> = {
  factory: { a: { cash: -3_000, mood: { business: 8, workers: 6, greens: -8 } }, b: { mood: { greens: 4, business: -6, workers: -2 } } },
  festival: { a: { cash: -4_000, mood: { workers: 5, families: 5, business: 3, seniors: -3 } }, b: { mood: { workers: -3, families: -2 } } },
  strike: { a: { cash: -5_000, mood: { workers: 9, business: -2 } }, b: { mood: { workers: -9, business: 4 } }, minPop: 400 },
  stadium: { a: { cash: -12_000, mood: { business: 10, workers: 6, greens: -6, seniors: -4 } }, b: { mood: { business: -4, greens: 2 } }, minPop: 1_200 },
  meadow: { a: { mood: { greens: 10, families: 4, business: -5 } }, b: { cash: 4_000, mood: { business: 6, greens: -10 } } },
  heatwave: { a: { cash: -3_000, mood: { seniors: 10, families: 3 } }, b: { mood: { seniors: -10, families: -2 } } },
  startup: { a: { cash: -6_000, mood: { business: 8, greens: 2, workers: 2 } }, b: { mood: { business: -4 } } },
  noise: { a: { mood: { seniors: 8, families: 4, business: -6, workers: -3 } }, b: { mood: { seniors: -6, families: -2, business: 2 } }, minPop: 600 },
  potholes: { a: { cash: -5_000, mood: { workers: 4, business: 4, seniors: 3 } }, b: { mood: { workers: -4, business: -4, seniors: -2 } } },
  donor: { a: { cash: 8_000, mood: { greens: -3, seniors: -2, workers: -2 } }, b: { mood: { families: 2, seniors: 1 } } },
  laptops: { a: { cash: -4_000, mood: { families: 8 } }, b: { mood: { families: -6 } } },
  blackout: { a: { cash: -5_000, mood: { families: 4, seniors: 4, business: 2 } }, b: { mood: { business: -4, seniors: -3, families: -2 } }, minPop: 300 },
  march: { a: { mood: { greens: 8, workers: 2, business: -3 } }, b: { mood: { greens: -8 } } },
  scandal: { a: { mood: { workers: -3, business: -3, families: -3, greens: -3, seniors: -3 } }, b: { mood: { seniors: -7, families: -5, greens: -4 } } },
};

// -------------------------------------------------------------- promises

export const PROMISE_IDS = ["lowTax", "jobs", "grow", "parks", "transit", "safe"] as const;
export type PromiseId = (typeof PROMISE_IDS)[number];
/** Who cares about each promise, by how much when kept (broken costs 1.5×). */
export const PROMISES: Record<PromiseId, Partial<Moods>> = {
  lowTax: { families: 8, workers: 6, seniors: 6 },
  jobs: { workers: 12, business: 4 },
  grow: { business: 10, workers: 4 },
  parks: { greens: 12, families: 4 },
  transit: { workers: 6, greens: 8 },
  safe: { families: 10, seniors: 8 },
};

// ------------------------------------------------------------------ state

export interface Taxes {
  R: number;
  C: number;
  I: number;
}
export interface Ledger {
  income: { R: number; C: number; I: number };
  upkeep: { roads: number; services: number; policies: number; transit: number };
}
export interface ElectionResult {
  term: number;
  share: number;
  won: boolean;
  byFaction: Moods;
  challenger: string;
  council: Faction[];
  /** The new chamber, and whether you stayed in office by forming a coalition. */
  seats?: Record<PartyId, number>;
  rescued?: boolean;
}
export interface BillResult {
  policy: PolicyId;
  enable: boolean;
  votes: { faction: Faction; yes: boolean }[];
  passed: boolean;
}
export interface PoliticsState {
  seed: number;
  cash: number;
  taxes: Taxes;
  policies: PolicyId[];
  approval: Moods;
  /** Short-lived feelings from dilemmas and town halls, decaying back to 0. */
  mood: Moods;
  term: number;
  termStart: number;
  council: Faction[];
  /** One poll a game day: minutes, overall approval. */
  polls: { m: number; a: number }[];
  dilemma: DilemmaId | null;
  dilemmaAt: number;
  nextDilemma: number;
  seen: DilemmaId[];
  promise: PromiseId | null;
  /** What the city looked like when the promise was made. */
  promiseBase: { population: number; parks: number; lowTaxBroken: boolean };
  challenger: string;
  lastHour: number;
  ledger: Ledger;
  lastElection: ElectionResult | null;
  status: "office" | "ousted";
  townHallAt: number;
  rolls: number;
  /** The chamber, your coalition, your cabinet and your political capital. */
  parl: ParlState;
}

/** Facts about the city the main thread knows (the sim doesn't). */
export interface CityFacts {
  roadKm: number;
  services: Partial<Record<ServiceKind, number>>;
  lines: number;
  /** Population, residents and jobs by zone, from the buildings. */
  residents: number;
  cJobs: number;
  iJobs: number;
  /** Visitors a day (landmarks): they spend in the shops, taxed at the commercial rate. */
  tourists?: number;
}

const zeroMoods = (): Moods => ({ workers: 0, business: 0, families: 0, greens: 0, seniors: 0 });
const allMoods = (v: number): Moods => ({ workers: v, business: v, families: v, greens: v, seniors: v });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const FIRST_NAMES = ["Ada", "Bram", "Cleo", "Dev", "Esme", "Felix", "Gita", "Hal", "Iris", "Jonas", "Kemi", "Luca", "Mara", "Nico", "Oona", "Pavel", "Rosa", "Soren", "Tess", "Ugo", "Vera", "Wren", "Yara", "Zane"];
const LAST_NAMES = ["Abbott", "Brandt", "Costa", "Duval", "Eze", "Fontaine", "Grieg", "Hale", "Ivanova", "Jensen", "Kaur", "Lindqvist", "Moreno", "Nakamura", "Osei", "Petrov", "Quigley", "Rasmussen", "Sato", "Toure", "Ulrich", "Varga", "Whitlock", "Yilmaz"];

/** People who could serve as ministers: three from each party, with their skill and loyalty. */
export function ministerPool(seed: number, term: number, start: number): Minister[] {
  const r = rng(seed * 31 + term * 977);
  const out: Minister[] = [];
  let id = start;
  for (const party of PARTIES)
    for (let k = 0; k < 3; k++)
      out.push({ id: id++, party, name: `${FIRST_NAMES[Math.floor(r.next() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(r.next() * LAST_NAMES.length)]}`, skill: 1 + Math.floor(r.next() * 5), loyalty: Math.round(35 + r.next() * 60) });
  return out;
}

export function newParl(seed: number): ParlState {
  const pool = ministerPool(seed, 1, 1);
  return {
    seats: { civic: 6, labour: 3, enterprise: 3, green: 2, heritage: 1 },
    coalition: [],
    relations: { civic: 100, labour: 10, enterprise: 10, green: 10, heritage: 10 },
    capital: 40,
    ministers: { finance: null, transport: null, environment: null, housing: null, safety: null, culture: null },
    pool,
    bill: null,
    failed: null,
    demands: {},
    campaign: { rallies: [], ads: 0, debated: false },
    referendum: 0,
    scandal: null,
    nextId: pool.length + 1,
    hour: -1,
  };
}

/** How skilled the minister for a department is (0 when the post is empty). */
export function ministerSkill(s: PoliticsState, m: Ministry) {
  return s.parl?.ministers[m]?.skill ?? 0;
}

export function newPolitics(seed: number, minutes: number): PoliticsState {
  return {
    seed,
    cash: START_CASH,
    taxes: { R: 0.1, C: 0.1, I: 0.1 },
    policies: [],
    approval: allMoods(58),
    mood: zeroMoods(),
    term: 1,
    termStart: minutes,
    council: ["workers", "workers", "business", "families", "families", "greens", "seniors"],
    polls: [{ m: minutes, a: 58 }],
    dilemma: null,
    dilemmaAt: 0,
    nextDilemma: minutes + 6 * 60,
    seen: [],
    promise: null,
    promiseBase: { population: 0, parks: 0, lowTaxBroken: false },
    challenger: "",
    lastHour: Math.floor(minutes / 60),
    ledger: { income: { R: 0, C: 0, I: 0 }, upkeep: { roads: 0, services: 0, policies: 0, transit: 0 } },
    lastElection: null,
    status: "office",
    townHallAt: -1e9,
    rolls: 0,
    parl: { ...newParl(seed), hour: Math.floor(minutes / 60) },
  };
}

/** Fill in anything an older save is missing. */
export function normalisePolitics(p: Partial<PoliticsState> | null | undefined, minutes: number): PoliticsState {
  const base = newPolitics(p?.seed ?? 1, minutes);
  if (!p) return base;
  const parl = p.parl ? { ...base.parl, ...p.parl, seats: { ...base.parl.seats, ...p.parl.seats }, relations: { ...base.parl.relations, ...p.parl.relations }, ministers: { ...base.parl.ministers, ...p.parl.ministers }, campaign: { ...base.parl.campaign, ...p.parl.campaign } } : base.parl;
  return { ...base, ...p, approval: { ...base.approval, ...p.approval }, mood: { ...base.mood, ...p.mood }, taxes: { ...base.taxes, ...p.taxes }, parl };
}

/** A fresh random stream for each roll, so results don't depend on how often the UI asks. */
function roll(s: PoliticsState) {
  s.rolls++;
  return rng(s.seed * 7919 + s.rolls * 104729);
}

/** What the policies switched on do to the sim. */
export function simPolicy(s: PoliticsState): SimPolicy {
  const out: SimPolicy = { bias: { R: 0, C: 0, I: 0, M: 0 }, maxTier: 9, carShare: 1, wearMul: 1, fireMul: 1, tourismMul: 1 };
  // Taxes: 10% is neutral; every point above it cools demand for that zone.
  out.bias.R += (0.1 - s.taxes.R) * 2.2;
  out.bias.C += (0.1 - s.taxes.C) * 2.2;
  out.bias.I += (0.1 - s.taxes.I) * 2.2;
  for (const id of s.policies) {
    const p = POLICIES[id].sim;
    if (!p) continue;
    for (const z of ["R", "C", "I", "M"] as const) out.bias[z] += p.bias?.[z] ?? 0;
    if (p.maxTier) out.maxTier = Math.min(out.maxTier, p.maxTier);
    if (p.carShare) out.carShare *= p.carShare;
    if (p.wearMul) out.wearMul! *= p.wearMul;
    if (p.fireMul) out.fireMul! *= p.fireMul;
    if (p.tourismMul) out.tourismMul! *= p.tourismMul;
  }
  // Ministers: a good one makes their department work better.
  out.wearMul! *= 1 - 0.06 * ministerSkill(s, "transport");
  out.fireMul! *= 1 - 0.07 * ministerSkill(s, "safety");
  out.tourismMul! *= 1 + 0.05 * ministerSkill(s, "culture");
  out.bias.R += 0.02 * ministerSkill(s, "housing");
  return out;
}

/** Money in and out per game day at today's rates. */
export function ledger(s: PoliticsState, f: CityFacts): Ledger {
  const mul = s.policies.reduce((m, id) => m * (POLICIES[id].income ?? 1), 1) * (1 + 0.012 * ministerSkill(s, "finance"));
  const upMul = s.policies.reduce((m, id) => m * (POLICIES[id].upkeepMul ?? 1), 1);
  const income = {
    R: Math.round(f.residents * s.taxes.R * TAX_BASE.R * mul),
    C: Math.round((f.cJobs + (f.tourists ?? 0) * 0.4) * s.taxes.C * TAX_BASE.C * mul),
    I: Math.round(f.iJobs * s.taxes.I * TAX_BASE.I * mul),
  };
  let services = 0;
  for (const [k, n] of Object.entries(f.services)) services += (SERVICE_COST[k as ServiceKind]?.upkeep ?? 0) * (n ?? 0);
  const upkeep = {
    roads: Math.round(f.roadKm * ROAD_UPKEEP_KM * upMul),
    services: Math.round(services * upMul),
    policies: s.policies.reduce((n, id) => n + POLICIES[id].cost, 0),
    transit: Math.round(f.lines * LINE_UPKEEP * upMul),
  };
  return { income, upkeep };
}

export const net = (l: Ledger) => l.income.R + l.income.C + l.income.I - (l.upkeep.roads + l.upkeep.services + l.upkeep.policies + l.upkeep.transit);

/** Voter groups' shares of the electorate, shaped by the kind of city it is. */
export function shares(st: Pick<Stats, "jobs" | "cJobs" | "iJobs" | "coverage">): Moods {
  const jobs = Math.max(1, st.cJobs + st.iJobs);
  const ind = st.iJobs / jobs;
  const com = st.cJobs / jobs;
  const raw: Moods = {
    workers: 0.24 + 0.12 * ind,
    business: 0.11 + 0.08 * com,
    families: 0.24 + 0.06 * st.coverage.school,
    greens: 0.15,
    seniors: 0.17 + 0.04 * st.coverage.clinic,
  };
  const sum = FACTIONS.reduce((n, f) => n + raw[f], 0);
  for (const f of FACTIONS) raw[f] /= sum;
  return raw;
}

/**
 * Where each group's approval is heading (0–100), from how the city is doing for them.
 * A small town isn't expected to have every service yet.
 */
export function targets(s: PoliticsState, st: Stats, l: Ledger, lines: number): Moods {
  const labour = Math.max(1, st.population * 0.52);
  const unemp = st.unemployed / labour;
  const expect = clamp(st.population / 600, 0, 1);
  const cover = (v: number) => clamp((v - 0.5 * expect) * 2, -1, 1) * expect + (1 - expect) * 0.2;
  const jobs = clamp(1 - (unemp / 0.12) * 2, -1, 1);
  const tax = (t: number) => clamp((0.1 - t) / 0.08, -1.2, 1);
  const traffic = clamp(1 - st.congestion * 2.5, -1, 1);
  const safety = (cover(st.coverage.police) + cover(st.coverage.fire)) / 2;
  const daily = net(l);
  const books = s.cash < 0 ? -1 : clamp(daily / 4000, -1, 1) * 0.6 + 0.2;
  const growth = clamp(st.demand.R, -1, 1);
  const pollution = clamp(1 - st.pollution * 5, -1, 1);
  const transit = clamp(lines / 2, 0, 1) * 2 - 1;
  const score: Moods = {
    workers: 0.4 * jobs + 0.25 * tax(s.taxes.R) + 0.15 * traffic + 0.1 * transit + 0.1 * cover(st.coverage.clinic),
    business: 0.3 * (tax(s.taxes.C) + tax(s.taxes.I)) / 2 + 0.2 * traffic + 0.2 * books + 0.2 * growth + 0.1 * jobs,
    families: 0.3 * safety + 0.25 * cover(st.coverage.school) + 0.15 * cover(st.coverage.park) + 0.15 * pollution + 0.15 * tax(s.taxes.R),
    greens: 0.35 * cover(st.coverage.park) + 0.3 * pollution + 0.2 * transit + 0.15 * traffic,
    seniors: 0.3 * cover(st.coverage.clinic) + 0.25 * safety + 0.2 * tax(s.taxes.R) + 0.15 * books + 0.1 * traffic,
  };
  for (const id of s.policies) for (const [f, v] of Object.entries(POLICIES[id].stance)) score[f as Faction] += (v ?? 0) * 0.25;
  // An environment minister who knows their stuff keeps the greens on side.
  score.greens += 0.03 * ministerSkill(s, "environment");
  const out = zeroMoods();
  for (const f of FACTIONS) out[f] = clamp(52 + score[f] * 40 + s.mood[f], 0, 100);
  return out;
}

export function overall(approval: Moods, sh: Moods) {
  return FACTIONS.reduce((n, f) => n + approval[f] * sh[f], 0);
}

export type PoliticsEvent =
  | { t: "dilemma"; id: DilemmaId }
  | { t: "dilemmaExpired"; id: DilemmaId }
  | { t: "campaign"; challenger: string }
  | { t: "election"; result: ElectionResult }
  | { t: "broke" };

const CHALLENGERS = ["Avery Lane", "Morgan Reyes", "Sam Okafor", "Riley Chen", "Jordan Patel", "Casey Novak", "Quinn Adeyemi", "Harper Silva"];

/**
 * Run the hours that have passed since the last call: collect taxes, pay upkeep, move
 * approval, hand out dilemmas, and hold the election when the term is up.
 */
export function advance(s: PoliticsState, minutes: number, st: Stats, f: CityFacts): PoliticsEvent[] {
  const events: PoliticsEvent[] = [];
  if (s.status !== "office") return events;
  const hour = Math.floor(minutes / 60);
  // Never replay more than a day in one go (a long pause, a big save gap).
  const from = Math.max(s.lastHour, hour - 24);
  for (let h = from + 1; h <= hour; h++) {
    const m = h * 60;
    const l = ledger(s, f);
    s.ledger = l;
    const wasPositive = s.cash >= 0;
    s.cash += net(l) / 24;
    if (wasPositive && s.cash < 0) events.push({ t: "broke" });
    // Feelings settle; approval drifts toward where the city puts it.
    const tg = targets(s, st, l, f.lines);
    for (const g of FACTIONS) {
      s.mood[g] *= 0.97;
      s.approval[g] += (tg[g] - s.approval[g]) * 0.12;
    }
    if (s.promise === "lowTax" && s.taxes.R > 0.08) s.promiseBase.lowTaxBroken = true;
    // A poll every morning.
    if (h % 24 === 8) s.polls = [...s.polls.slice(-29), { m, a: Math.round(overall(s.approval, shares(st))) }];
    // Dilemmas.
    if (s.dilemma && m - s.dilemmaAt > 8 * 60) {
      // Ignored: everyone notices the dithering.
      events.push({ t: "dilemmaExpired", id: s.dilemma });
      for (const g of FACTIONS) s.mood[g] -= 2;
      s.dilemma = null;
    }
    if (!s.dilemma && m >= s.nextDilemma && st.population > 40) {
      const r = roll(s);
      const fresh = DILEMMA_IDS.filter((id) => !s.seen.includes(id) && (DILEMMAS[id].minPop ?? 0) <= st.population);
      const pool = fresh.length ? fresh : DILEMMA_IDS.filter((id) => (DILEMMAS[id].minPop ?? 0) <= st.population);
      const id = pool[Math.floor(r.next() * pool.length)];
      s.dilemma = id;
      s.dilemmaAt = m;
      s.seen = [...s.seen.filter((x) => x !== id), id].slice(-10);
      s.nextDilemma = m + (10 + r.next() * 8) * 60;
      events.push({ t: "dilemma", id });
    }
    // The campaign opens with a day to go.
    const end = s.termStart + TERM_MINUTES;
    if (!s.challenger && m >= end - 24 * 60) {
      const r = roll(s);
      s.challenger = CHALLENGERS[Math.floor(r.next() * CHALLENGERS.length)];
      events.push({ t: "campaign", challenger: s.challenger });
    }
    if (m >= end) {
      const result = election(s, st, f);
      events.push({ t: "election", result });
      if (!result.won) break;
    }
  }
  s.lastHour = Math.max(s.lastHour, hour);
  return events;
}

/** Was the promise kept? null when none was made. */
export function promiseKept(s: PoliticsState, st: Stats, f: CityFacts): boolean | null {
  switch (s.promise) {
    case null:
      return null;
    case "lowTax":
      return !s.promiseBase.lowTaxBroken && s.taxes.R <= 0.08;
    case "jobs":
      return st.unemployed / Math.max(1, st.population * 0.52) < 0.06;
    case "grow":
      return st.population >= Math.max(s.promiseBase.population * 1.5, s.promiseBase.population + 500);
    case "parks":
      return (f.services.park ?? 0) >= s.promiseBase.parks + 3;
    case "transit":
      return f.lines >= 2;
    case "safe":
      return st.coverage.police >= 0.7 && st.coverage.fire >= 0.7;
  }
}

/** Election day: each group votes by how it feels, plus a promise kept or broken. */
export function election(s: PoliticsState, st: Stats, f: CityFacts): ElectionResult {
  const r = roll(s);
  const kept = promiseKept(s, st, f);
  const feel = { ...s.approval };
  if (kept !== null && s.promise)
    for (const [g, v] of Object.entries(PROMISES[s.promise])) feel[g as Faction] = clamp(feel[g as Faction] + (kept ? v! : -1.5 * v!), 0, 100);
  const sh = shares(st);
  const swing = (r.next() - 0.5) * 0.06;
  const byFaction = zeroMoods();
  let share = 0;
  for (const g of FACTIONS) {
    const p = clamp(1 / (1 + Math.exp(-(feel[g] - 50) / 9)) + swing, 0.02, 0.98);
    byFaction[g] = p;
    share += p * sh[g];
  }
  const won = share > 0.5;
  // Council seats: each group wins seats in proportion to its share, and its councillors
  // lean toward the mayor if that group backed them (largest remainder).
  const quota = FACTIONS.map((g) => ({ g, q: sh[g] * COUNCIL_SEATS }));
  const seats = quota.map(({ g, q }) => ({ g, n: Math.floor(q), rem: q - Math.floor(q) }));
  let left = COUNCIL_SEATS - seats.reduce((n, x) => n + x.n, 0);
  for (const x of [...seats].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    x.n++;
    left--;
  }
  const council = seats.flatMap((x) => Array.from({ length: x.n }, () => x.g));
  const result: ElectionResult = { term: s.term, share, won, byFaction, challenger: s.challenger || CHALLENGERS[0], council };
  s.lastElection = result;
  s.council = council;
  if (won) {
    s.term++;
    s.termStart += TERM_MINUTES;
    s.challenger = "";
    s.promise = null;
    // A fresh mandate.
    for (const g of FACTIONS) s.mood[g] += 4;
  } else {
    s.status = "ousted";
  }
  return result;
}

/** How a group's councillor feels about a bill, −1…1 (before their view of the mayor). */
function lean(s: PoliticsState, g: Faction, id: PolicyId, enable: boolean) {
  const v = (POLICIES[id].stance[g] ?? 0) * (enable ? 1 : -1);
  const broke = enable && s.cash < 0 && POLICIES[id].cost > 0 ? -0.25 : 0;
  return v + broke;
}

/** Put a policy (or its repeal) to the council. Passed bills take effect at once. */
export function propose(s: PoliticsState, id: PolicyId, enable: boolean): BillResult {
  const r = roll(s);
  const votes = s.council.map((g) => {
    const score = lean(s, g, id, enable) * 45 + (s.approval[g] - 50) * 0.5 + (r.next() - 0.5) * 12;
    return { faction: g, yes: score > 0 };
  });
  const passed = votes.filter((v) => v.yes).length > COUNCIL_SEATS / 2;
  if (passed) s.policies = enable ? [...new Set([...s.policies, id])] : s.policies.filter((p) => p !== id);
  return { policy: id, enable, votes, passed };
}

/** Answer the dilemma on the desk. */
export function decide(s: PoliticsState, pick: "a" | "b") {
  const id = s.dilemma;
  if (!id) return null;
  const c = DILEMMAS[id][pick];
  s.cash += c.cash ?? 0;
  for (const [g, v] of Object.entries(c.mood)) s.mood[g as Faction] += v ?? 0;
  if (c.policy) s.policies = [...new Set([...s.policies, c.policy])];
  s.dilemma = null;
  return c;
}

/** Hold a town hall: costs a little, cheers everyone up a little. Once a day. */
export function townHall(s: PoliticsState, minutes: number) {
  if (minutes - s.townHallAt < 24 * 60 || s.cash < TOWN_HALL_COST - CREDIT) return false;
  s.townHallAt = minutes;
  s.cash -= TOWN_HALL_COST;
  for (const g of FACTIONS) s.mood[g] += 4;
  return true;
}

export function makePromise(s: PoliticsState, id: PromiseId, population: number, parks: number) {
  if (s.promise) return false;
  s.promise = id;
  s.promiseBase = { population, parks, lowTaxBroken: s.taxes.R > 0.08 };
  return true;
}

export function setTax(s: PoliticsState, zone: keyof Taxes, rate: number) {
  s.taxes = { ...s.taxes, [zone]: clamp(Math.round(rate * 100) / 100, 0, 0.2) };
}

/** Road repairs cost less with a good transport minister (1 = no change). */
export function repairDiscount(s: PoliticsState) {
  return 1 - 0.05 * ministerSkill(s, "transport");
}

/** Can the city pay `cost` (with its credit line)? */
export function canAfford(s: PoliticsState, cost: number) {
  return s.cash - cost >= -CREDIT;
}
