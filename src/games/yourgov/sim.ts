/**
 * YourGov's rules. A country (made up, or one of twelve real ones), its parties and its
 * political system come from the scenario (scenario.ts): how the lower house is elected (first
 * past the post, two rounds, preferential, proportional, mixed), what kind of upper house it
 * has, whether a President or a Prime Minister governs (with coalitions, confidence and snap
 * elections), the election calendar and the titles. One turn is a week. You lead a party:
 * hold events to win voters, write bills and steer them through the legislature, vote, form
 * or join governments, keep your promises and win elections, counted county by county.
 *
 * Pure and deterministic: all randomness comes from the state's own seeded stream.
 */
import { createRng } from "../engine/rng";
import { COMMITTEES, EVENT, EVENT_MAX, GROUP_COMMITTEE, LAW, LAW_GROUPS, LAWS, WEEKS, type Effects, type LawDef, type LawGroup, type PartyId, type Pos } from "./data";
import { buildCountry, geoOf, type Country, type MapSpec } from "./map";
import { NAMES } from "./names";
import { avalon, LOWER_SYSTEMS, type LowerSystem, type PartyDef, type Scenario, type SystemDef, type Titles } from "./scenario";
import { campaignAfterElection, campaignWeek, initCampaign, settleCampaign, staffSkill, budgetLean, budgetPassed, aiBudget, note, type BudgetPlan, type Pledge, type QTState, type ScandalState, type StaffMember } from "./campaign";
import { afterElection, cabinetFx, courtGroup, initPolitics, lawChanged, newGovernment, playerBonus, politicsWeek, pressEvent, runPlan, settlePending, type CrisisState, type DebateState, type Deal, type Faction, type Foreign, type PlanItem } from "./politics";

export const COMMITTEE_SIZE = 9;
/** Weeks a bill spends at each stage. */
export const STAGE_WEEKS = 1;
export const BUDGET_WEEK = 40;
export const CAREER_YEARS = 20;
/** Weeks between a government falling and the snap election. */
export const SNAP_WEEKS = 6;

export interface Politician {
  id: number;
  first: string;
  last: string;
  party: PartyId;
  age: number;
  face: number;
  state: number;
  charisma: number;
  /** The player. */
  you?: boolean;
}

export type Stage = "committee" | "house" | "senate" | "president" | "override" | "passed" | "failed";
export interface Tally {
  yes: number;
  no: number;
  abstain: number;
  /** How each member voted (politician id → 1 yes, 0 abstain, -1 no). */
  by: Record<number, number>;
}
export interface Bill {
  id: number;
  law: string;
  option: number;
  /** "budget" bills approve the year's budget instead of changing a law. */
  budget?: boolean;
  proposer: number;
  party: PartyId;
  stage: Stage;
  /** Week it reaches a vote at its current stage. */
  voteAt: number;
  committee: number[];
  /** The player's vote at the current stage (if they sit there). */
  yourVote: number | null;
  /** Parties lobbied for this bill (extra support, current stage). */
  lobbied: PartyId[];
  /** The upper house said no and the lower house is overriding it. */
  insist?: boolean;
  /** A budget's spending and tax plan (campaign.ts). */
  plan?: BudgetPlan;
  last: { stage: Stage; tally: Tally; passed: boolean } | null;
}

export interface Mission {
  id: number;
  kind: "election" | "promise" | "members" | "seats" | "laws";
  law?: string;
  /** For a promise: lower (-1) or raise (+1) the option index. */
  dir?: number;
  target?: number;
  start?: number;
  deadline: number;
  reward: number;
  done?: boolean;
  failed?: boolean;
  /** A promise from your manifesto. */
  pledge?: boolean;
}

export interface NewsItem {
  week: number;
  kind: "election" | "law" | "death" | "mayor" | "economy" | "scandal" | "mission" | "event" | "budget" | "party" | "government";
  text: string;
  tone: 1 | 0 | -1;
}

export interface Seat {
  /** Region (-1 for a national list). */
  r: number;
  /** Party index. */
  p: number;
  /** Class (upper houses elected in halves or thirds). */
  c?: number;
}

export interface ElectionRun {
  kind: "general" | "midterm" | "upper" | "president" | "snap";
  title: string;
  contests: { lower: boolean; upper: boolean; pres: boolean };
  week: number;
  /** Per section, per party (scenario order) vote share, flattened. */
  shares: number[];
  turnout: number[];
  /** Order the counties report in. */
  order: number[];
  /** National vote share per party. */
  national: Record<PartyId, number>;
  /** Lower and upper house make-up after the election. */
  houseSeats: Record<PartyId, number>;
  senateSeats: Record<PartyId, number>;
  lower: Seat[] | null;
  upper: Seat[] | null;
  president: { party: PartyId; name: string; share: number; runoff: boolean; college?: Record<PartyId, number>; first?: Record<PartyId, number> } | null;
  governors: Record<PartyId, number>;
  prevHouse: Record<PartyId, number>;
  prevSenate: Record<PartyId, number>;
}

export interface PartyState {
  funds: number;
  members: number;
  unity: number;
  /** National popularity offset (utility). */
  swing: number;
  leader: number;
  /** Who the party puts up for President when its leader can't run again. */
  nominee?: number;
  relations: Record<PartyId, number>;
}

export interface Stats {
  happiness: number;
  /** GDP, trillions (in the country's currency). */
  gdp: number;
  growth: number;
  /** Yearly budget balance, billions. */
  budget: number;
  debt: number;
  unemployment: number;
  /** Approval of the government. */
  approval: number;
}

/** One week's snapshot, for the trend charts. */
export interface HistoryPoint {
  w: number;
  /** National poll per party (scenario order). */
  poll: number[];
  approval: number;
  happiness: number;
  growth: number;
  unemployment: number;
}

export interface Government {
  /** Governing parties, the head's first. */
  parties: PartyId[];
  /** The head of government. */
  head: number;
  since: number;
}

/** Coalition talks waiting on the player. */
export interface Talks {
  /** "invited": another party asks you to join; "lead": you're forming the government. */
  kind: "invited" | "lead";
  options: PartyId[][];
  week: number;
}

export interface GameState {
  v: 3;
  seed: number;
  sc: Scenario;
  week: number;
  rolls: number;
  you: number;
  party: PartyId;
  homeState: number;
  parties: Record<PartyId, PartyState>;
  /** Campaign boost per party per state (decays weekly). */
  campaign: Record<PartyId, number[]>;
  /** What you've learned from polls: state → week polled. */
  polled: Record<number, number>;
  laws: Record<string, number>;
  stats: Stats;
  /** What the laws in force at the start did (the economy moves with changes from there). */
  fx0: Required<Effects>;
  /** How each region leans to each party beyond ideology (region × party, utility). */
  calib: number[];
  politicians: Politician[];
  nextId: number;
  house: number[];
  /** The region each House seat is for (-1 national list). */
  houseR: number[];
  senate: number[];
  senateR: number[];
  senateC: number[];
  /** Which class of the upper house is up next. */
  upperClass: number;
  /** The directly elected President, or -1. */
  president: number;
  gov: Government;
  talks: Talks | null;
  governors: number[];
  /** Week each region next elects its government. */
  regionNext: number[];
  /** Weeks of the next elections (-1: none). */
  cal: { lower: number; upper: number; pres: number };
  lastLower: number;
  /** Week of a snap election that has been called (-1: none). */
  snapAt: number;
  /** Terms served as President, by politician. */
  presTerms: Record<number, number>;
  mayors: { section: number; holder: number }[];
  bills: Bill[];
  nextBill: number;
  news: NewsItem[];
  missions: Mission[];
  nextMission: number;
  election: ElectionRun | null;
  lastElection: ElectionRun | null;
  budgetPassed: number;
  lawsPassed: number;
  electionsWon: number;
  score: number;
  /** Events you've held this turn (each at most EVENT_MAX times a turn). */
  usedEvents: string[];
  /** Week you last tried a vote of no confidence. */
  lastMotion: number;
  over: boolean;
  /** Laws the player has drafted (they work like any other law). */
  custom: LawDef[];
  nextLaw: number;
  /** Weekly snapshots, newest last (capped). */
  history: HistoryPoint[];

  // The wider politics (politics.ts).
  /** Events booked for later weeks. */
  plan: PlanItem[];
  nextPlan: number;
  /** How each voter group feels about your party (-40 … 60). */
  goodwill: Record<string, number>;
  /** How each interest group gets on with your party (-50 … 100). */
  lobbies: Record<string, number>;
  /** Your party's factions. */
  factions: Faction[];
  /** Weeks of low unity in a row (a challenge comes after eight). */
  lowUnity: number;
  challenge: { week: number; faction: string } | null;
  /** The cabinet: portfolio → politician. */
  cabinet: Record<string, number>;
  /** Coalition partners' moods (0–100). */
  partners: Record<PartyId, number>;
  deals: Deal[];
  crisis: CrisisState | null;
  nextCrisis: number;
  /** Executive actions: id → week it's ready again. */
  orders: Record<string, number>;
  foreign: Foreign[];
  /** How each outlet covers you (-50 … 50). */
  press: Record<string, number>;
  debate: DebateState | null;
  lastReferendum: number;
  /** Temporary pushes to growth and happiness (they fade). */
  boosts: { growth: number; happiness: number };
  /** Growth from trade deals. */
  tradeGrowth: number;
  /** Donor fatigue: each fundraiser raises less if the last was recent. */
  donors: number;
  /** Your party removed you as leader. */
  ousted?: boolean;

  // The campaign machine (campaign.ts).
  /** Campaign staff, by role. */
  staff: Record<string, StaffMember>;
  /** Who's available to hire, by role. */
  hires: Record<string, StaffMember[]>;
  hiresWeek: number;
  manifesto: { week: number; pledges: Pledge[] } | null;
  /** The budget you've written for this year. */
  budgetDraft: { year: number; plan: BudgetPlan } | null;
  /** What the last budget passed does each year. */
  budgetFx: Required<Effects> & { approval: number };
  qt: QTState | null;
  scandal: ScandalState | null;
  nextScandal: number;
  /** Achievements unlocked: id → week. */
  achievements: Record<string, number>;
  counters: Record<string, number>;
  /** The last seat projection you commissioned. */
  mrp: ({ week: number } & SeatProjection) | null;
  /** Where your party stood at the start. */
  pos0: Pos;
  lastMove: number;
  /** The election week you last gave a speech. */
  speech: number;
}

export interface SeatProjection {
  lower: Record<PartyId, number>;
  national: Record<PartyId, number>;
  pres: { party: PartyId; share: number; runoff: boolean; college?: Record<PartyId, number> } | null;
}

// ------------------------------------------------------------------ the scenario

export const sys = (s: GameState): SystemDef => s.sc.system;
export const titles = (s: GameState): Titles => s.sc.system.titles;
export const partyDefs = (s: GameState): PartyDef[] => s.sc.parties;
export const ids = (s: GameState): PartyId[] => s.sc.parties.map((p) => p.id);
const GREY: PartyDef = { id: "?", name: "Independent", short: "IND", color: "#9aa0a8", pos: { e: 0, s: 0 }, ideology: "Independent", base: 0 };
/** A party's definition (name, colour, place on the compass). */
export const party = (s: GameState, id: PartyId): PartyDef => s.sc.parties.find((p) => p.id === id) ?? GREY;
export const pidx = (s: GameState, id: PartyId) => s.sc.parties.findIndex((p) => p.id === id);
/** Parties that put up candidates. */
export const running = (s: GameState) => s.sc.parties.filter((p) => !p.noRun).map((p) => p.id);

const byScenario = new WeakMap<Scenario, Country>();
/** The country being played (cached). A number gives Avalon for that seed. */
export function country(x: number | GameState | Scenario): Country {
  const sc = typeof x === "number" ? avalon(x) : "sc" in x ? x.sc : x;
  let c = byScenario.get(sc);
  if (!c) {
    c = buildCountry(mapSpec(sc));
    byScenario.set(sc, c);
  }
  return c;
}

/** The map a scenario needs, with enough counties in each region for its districts. */
export function mapSpec(sc: Scenario): MapSpec {
  const m = sc.map;
  if (m.kind !== "real") return m;
  const geo = geoOf(m.code);
  if (!geo) return m;
  const keys = geo.regions.map((g) => g.id);
  const pops = keys.map((k) => m.pops[k] ?? 0.5);
  const d = districtPlan(sc.system, keys, pops);
  return { ...m, min: Object.fromEntries(keys.map((k, i) => [k, d[i]])) };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a: Pos, b: Pos) => Math.hypot(a.e - b.e, a.s - b.s);

/** A fresh random stream for this roll (the state remembers how many it has used). */
export function roll(s: GameState) {
  return createRng(s.seed * 7919 + ++s.rolls * 104729);
}

export const yearOf = (s: GameState, week = s.week) => s.sc.startYear + Math.floor(week / WEEKS);
export const weekOf = (week: number) => (week % WEEKS) + 1;
export const dateLabel = (s: GameState, week = s.week) => `${yearOf(s, week)}.${String(weekOf(week)).padStart(2, "0")}`;
/** The game week a year's week falls on. */
const weekFor = (s: GameState, year: number, w: number) => (year - s.sc.startYear) * WEEKS + w - 1;
export const fullName = (p: Politician) => `${p.first} ${p.last}`;

const index = new WeakMap<Politician[], { n: number; m: Map<number, Politician> }>();
/** A politician by id. */
export function pol(s: GameState, id: number) {
  let ix = index.get(s.politicians);
  if (!ix || ix.n !== s.politicians.length) {
    ix = { n: s.politicians.length, m: new Map(s.politicians.map((p) => [p.id, p])) };
    index.set(s.politicians, ix);
  }
  return ix.m.get(id);
}
/** A law by id: one of the built-in ones or one the player drafted. */
export const lawOf = (s: GameState, id: string): LawDef | undefined => LAW[id] ?? s.custom.find((l) => l.id === id);
/** Every law on the books, built-in first. */
export const allLaws = (s: GameState): LawDef[] => (s.custom.length ? [...LAWS, ...s.custom] : LAWS);

/** The country's pool of first and last names. */
export const namePool = (s: GameState) => NAMES[s.sc.culture] ?? NAMES.en;

export function newPolitician(s: GameState, partyId: PartyId, state: number, r = roll(s)): Politician {
  const pool = namePool(s);
  const p: Politician = { id: s.nextId++, first: r.pick(pool.first), last: r.pick(pool.last), party: partyId, age: r.int(32, 70), face: Math.floor(r.next() * 1e6), state, charisma: r.int(3, 9) };
  s.politicians.push(p);
  return p;
}

/** The politician a party sends to an office (one from that region if there's one free). */
function recruit(s: GameState, partyId: PartyId, state: number, taken: Set<number>, free?: Map<string, number[]>) {
  let id: number | undefined;
  if (free) {
    const list = free.get(`${partyId}|${state}`);
    while (list?.length && id === undefined) {
      const c = list.pop()!;
      if (!taken.has(c)) id = c;
    }
  } else id = s.politicians.find((p) => p.party === partyId && p.state === state && !taken.has(p.id) && !p.you)?.id;
  if (id === undefined) id = newPolitician(s, partyId, state).id;
  taken.add(id);
  return id;
}
/** Politicians free to take a seat, by party and region. */
function freePool(s: GameState) {
  const m = new Map<string, number[]>();
  for (const p of s.politicians) {
    if (p.you) continue;
    const k = `${p.party}|${p.state}`;
    let a = m.get(k);
    if (!a) m.set(k, (a = []));
    a.push(p.id);
  }
  for (const a of m.values()) a.reverse();
  return m;
}

// ------------------------------------------------------------------ seats per region

/** Share `total` seats over regions by population (largest remainder), at least `min` each, some fixed. */
export function apportionBy(pops: number[], total: number, min: number, fixed: (number | undefined)[] = []) {
  const out = pops.map((_, i) => fixed[i] ?? 0);
  const free = pops.map((_, i) => fixed[i] === undefined);
  let left = total - out.reduce((a, b) => a + b, 0);
  const freeIdx = pops.map((_, i) => i).filter((i) => free[i]);
  if (!freeIdx.length || left <= 0) return out;
  for (const i of freeIdx) out[i] = Math.min(min, Math.floor(left / freeIdx.length));
  left -= freeIdx.reduce((a, i) => a + out[i], 0);
  const P = freeIdx.reduce((a, i) => a + pops[i], 0) || 1;
  // Divide what's left among the free regions by population, on top of their minimum.
  const want = freeIdx.map((i) => Math.max(0, (pops[i] / P) * (left + freeIdx.reduce((a, j) => a + out[j], 0)) - out[i]));
  const wsum = want.reduce((a, b) => a + b, 0) || 1;
  const q = want.map((w) => (w / wsum) * left);
  freeIdx.forEach((i, j) => (out[i] += Math.floor(q[j])));
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = freeIdx.map((i, j) => ({ i, r: q[j] - Math.floor(q[j]) })).sort((a, b) => b.r - a.r);
  for (let k = 0; rest > 0 && order.length; k++, rest--) out[order[k % order.length].i]++;
  return out;
}

const DISTRICTS: LowerSystem[] = ["fptp", "two-round", "irv"];
/** How many district seats each region has (the rest of a mixed system's seats are list seats). */
function districtPlan(sy: SystemDef, keys: string[], pops: number[]) {
  const lo = sy.lower;
  if (DISTRICTS.includes(lo.system)) return apportionBy(pops, lo.seats, 1, keys.map((k) => lo.fixed?.[k]));
  if (lo.system === "pr") return keys.map(() => 1);
  const d = Math.round(lo.seats * (1 - lo.listShare));
  return apportionBy(pops, d, 1, keys.map((k) => (lo.fixed?.[k] === 0 ? 0 : undefined)));
}

/** Lower-house seats per region (all of them for district and list systems; districts for mixed). */
export function apportion(s: GameState) {
  const c = country(s);
  const lo = sys(s).lower;
  const pops = c.states.map((st) => st.pop);
  const fixed = c.states.map((st) => lo.fixed?.[st.key]);
  const system = lowerSystem(s);
  if (system === "parallel" || system === "mmp") return districtPlan({ ...sys(s), lower: { ...lo, system } }, c.states.map((st) => st.key), pops);
  return apportionBy(pops, lo.seats, 1, fixed);
}

/** How the lower house is elected now (the election-system law can change it). */
export const lowerSystem = (s: GameState): LowerSystem => LOWER_SYSTEMS[s.laws.electoralSystem]?.id ?? sys(s).lower.system;

/** Upper-house seats per region, plus national list seats. */
export function upperPlan(s: GameState): { per: number[]; national: number } {
  const c = country(s);
  const up = sys(s).upper;
  if (up.kind === "none") return { per: c.states.map(() => 0), national: 0 };
  if (up.kind === "appointed") return { per: c.states.map(() => 0), national: up.seats };
  const fixed = c.states.map((st) => up.regionSeats?.[st.key]);
  if (up.perRegion > 0) return { per: c.states.map((_, k) => fixed[k] ?? up.perRegion), national: up.national };
  if (up.seats > 0 && fixed.some((f) => f === undefined))
    return { per: apportionBy(c.states.map((st) => st.pop), up.seats, up.classes, fixed), national: up.national };
  return { per: fixed.map((f) => f ?? 0), national: up.national };
}

// ------------------------------------------------------------------ voters

const standCache = new WeakMap<Scenario, Uint8Array>();
/** Which parties stand in which regions (region × party). */
function standing(s: GameState) {
  let st = standCache.get(s.sc);
  if (!st) {
    const c = country(s);
    const ps = partyDefs(s);
    st = new Uint8Array(c.states.length * ps.length);
    // A regional party whose regions aren't on this map stands everywhere rather than nowhere.
    const keys = new Set(c.states.map((r) => r.key));
    const only = ps.map((p) => (p.only?.some((k) => keys.has(k)) ? p.only : undefined));
    c.states.forEach((r, k) => ps.forEach((p, i) => (st![k * ps.length + i] = !p.noRun && (!only[i] || only[i]!.includes(r.key)) ? 1 : 0)));
    standCache.set(s.sc, st);
  }
  return st;
}

/** How much a county likes each party (utility), before the softmax. */
export function utilities(s: GameState, section: number) {
  const c = country(s);
  const sec = c.sections[section];
  const ps = partyDefs(s);
  const P = ps.length;
  const st = standing(s);
  const k = sec.state;
  const inc = incumbents(s);
  // Governments gain or lose as their approval moves from where it started.
  const appr = ((s.stats.approval - s.sc.economy.approval) / 50) * 0.45;
  return ps.map((p, i) => {
    if (!st[k * P + i]) return -Infinity;
    const q = s.parties[p.id];
    let u = -2.4 * dist(sec.lean, p.pos) + (s.calib[k * P + i] ?? 0) + q.swing + (s.campaign[p.id]?.[k] ?? 0) * 0.06 + Math.log(1 + q.members / 200_000) * 0.15;
    const w = inc[p.id];
    if (w) u += appr * w;
    // The voter groups you've won over, and how the press treats you.
    if (p.id === s.party) u += playerBonus(s, section);
    return u;
  });
}

/** Who answers for the government at the ballot box (party → weight). */
function incumbents(s: GameState): Record<PartyId, number> {
  const out: Record<PartyId, number> = {};
  if (sys(s).exec === "presidential") {
    const pp = pol(s, s.president)?.party;
    if (pp) out[pp] = 1;
    return out;
  }
  s.gov.parties.forEach((p, i) => (out[p] = i === 0 ? 1 : 0.5));
  return out;
}

/** Vote shares in a county (scenario party order). */
export function sharesIn(s: GameState, section: number, noise?: () => number) {
  const u = utilities(s, section).map((x) => (x === -Infinity ? x : x * 2.6 + (noise ? (noise() - 0.5) * 0.5 : 0)));
  let m = -Infinity;
  for (const x of u) if (x > m) m = x;
  if (m === -Infinity) return u.map((_, i) => (partyDefs(s)[i].noRun ? 0 : 1 / running(s).length));
  const e = u.map((x) => (x === -Infinity ? 0 : Math.exp(x - m)));
  const t = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / t);
}

function pollOver(s: GameState, secs: Iterable<number>) {
  const c = country(s);
  const P = partyDefs(s).length;
  const tot = new Array<number>(P).fill(0);
  for (const id of secs) sharesIn(s, id).forEach((v, i) => (tot[i] += v * c.sections[id].pop));
  const sum = tot.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(ids(s).map((id, i) => [id, tot[i] / sum])) as Record<PartyId, number>;
}

/** National poll: vote share per party. */
export function nationalPoll(s: GameState) {
  return pollOver(s, country(s).sections.map((x) => x.id));
}

/** Poll in one state. */
export function statePoll(s: GameState, state: number) {
  return pollOver(s, country(s).states[state].sections);
}

/**
 * Fit the regional leanings so the opening polls match the scenario: each party's national
 * share, and its share in the regions the scenario gives figures for.
 */
function calibrate(s: GameState) {
  const c = country(s);
  const ps = partyDefs(s);
  const P = ps.length;
  const R = c.states.length;
  s.calib = new Array<number>(R * P).fill(0);
  const st = standing(s);
  const regionShares = (k: number) => {
    const tot = new Array<number>(P).fill(0);
    for (const id of c.states[k].sections) sharesIn(s, id).forEach((v, i) => (tot[i] += v * c.sections[id].pop));
    const sum = tot.reduce((a, b) => a + b, 0) || 1;
    return tot.map((v) => v / sum);
  };
  // Nationally first.
  const baseSum = ps.reduce((a, p) => a + (p.noRun ? 0 : p.base), 0) || 1;
  for (let it = 0; it < 24; it++) {
    const poll = nationalPoll(s);
    ps.forEach((p, i) => {
      if (p.noRun || p.base <= 0) return;
      const d = Math.log(Math.max(1e-4, p.base / baseSum) / Math.max(1e-6, poll[p.id])) / 2.6;
      for (let k = 0; k < R; k++) s.calib[k * P + i] += d * 0.9;
    });
  }
  // Then the regions with figures.
  for (let k = 0; k < R; k++) {
    const key = c.states[k].key;
    const listed = ps.map((p, i) => (st[k * P + i] && p.regional?.[key] !== undefined ? p.regional[key] : -1));
    if (listed.every((v) => v < 0)) continue;
    // Parties without figures share what's left, but no more than a little over what they'd
    // poll there anyway (the rest of "what's left" is minor parties the game doesn't have).
    const m0 = regionShares(k);
    const listedSum = listed.reduce((a, v) => a + Math.max(0, v), 0);
    const unlisted0 = m0.reduce((a, v, i) => a + (listed[i] < 0 && st[k * P + i] ? v : 0), 0);
    const rest = unlisted0 > 1e-6 ? Math.min(Math.max(0.02, 1 - listedSum), unlisted0 * 1.2) : 0;
    const norm = listedSum + rest || 1;
    const target = ps.map((_, i) => (!st[k * P + i] ? 0 : listed[i] >= 0 ? listed[i] / norm : (m0[i] / Math.max(1e-6, unlisted0)) * (rest / norm)));
    for (let it = 0; it < 30; it++) {
      const m = regionShares(k);
      ps.forEach((_, i) => {
        if (st[k * P + i]) s.calib[k * P + i] += (Math.log(Math.max(1e-4, target[i]) / Math.max(1e-6, m[i])) / 2.6) * 0.9;
      });
    }
  }
  s.calib = s.calib.map((v) => Math.round(v * 1000) / 1000);
}

// ------------------------------------------------------------------ setup

export interface NewGameOptions {
  scenario?: Scenario;
  homeState?: number;
}

export function newGame(seed: number, partyId: PartyId, opts: NewGameOptions = {}): GameState {
  const sc = opts.scenario ?? avalon(seed);
  const c = country(sc);
  const sy = sc.system;
  const ps = sc.parties;
  const you = ps.some((p) => p.id === partyId && !p.noRun) ? partyId : ps.find((p) => !p.noRun)!.id;
  const laws: Record<string, number> = Object.fromEntries(LAWS.map((l) => [l.id, sc.laws[l.id] ?? l.start]));
  laws.electoralSystem = Math.max(0, LOWER_SYSTEMS.findIndex((x) => x.id === sy.lower.system));
  const e = sc.economy;
  const s: GameState = {
    v: 3,
    seed,
    sc,
    week: 0,
    rolls: 0,
    you: -1,
    party: you,
    homeState: opts.homeState ?? c.sections[c.capital].state,
    parties: Object.fromEntries(
      ps.map((p) => [
        p.id,
        { funds: 40 + (p.id === you ? 20 : 0), members: Math.round(40_000 + p.base * 1_000_000), unity: 70, swing: 0, leader: -1, relations: Object.fromEntries(ps.map((q) => [q.id, q.id === p.id ? 100 : Math.round(40 - 45 * dist(p.pos, q.pos) - (p.refuses?.includes(q.id) ? 30 : 0))])) },
      ]),
    ),
    campaign: Object.fromEntries(ps.map((p) => [p.id, c.states.map(() => 0)])),
    polled: {},
    laws,
    stats: { happiness: e.happiness, gdp: e.gdp, growth: e.growth, budget: e.budget, debt: e.debt, unemployment: e.unemployment, approval: e.approval },
    fx0: { happiness: 0, growth: 0, budget: 0, unemployment: 0 },
    calib: [],
    politicians: [],
    nextId: 1,
    house: [],
    houseR: [],
    senate: [],
    senateR: [],
    senateC: [],
    upperClass: 0,
    president: -1,
    gov: { parties: [], head: -1, since: 0 },
    talks: null,
    governors: [],
    regionNext: [],
    cal: { lower: -1, upper: -1, pres: -1 },
    lastLower: 0,
    snapAt: -1,
    presTerms: {},
    mayors: [],
    bills: [],
    nextBill: 1,
    news: [],
    missions: [],
    nextMission: 1,
    election: null,
    lastElection: null,
    budgetPassed: 0,
    lawsPassed: 0,
    electionsWon: 0,
    score: 0,
    usedEvents: [],
    lastMotion: -99,
    over: false,
    custom: [],
    nextLaw: 1,
    history: [],
    // Filled in by initPolitics once the offices are.
    ...({} as Pick<GameState, "plan" | "nextPlan" | "goodwill" | "lobbies" | "factions" | "lowUnity" | "challenge" | "cabinet" | "partners" | "deals" | "crisis" | "nextCrisis" | "orders" | "foreign" | "press" | "debate" | "lastReferendum" | "boosts" | "tradeGrowth" | "donors" | "staff" | "hires" | "hiresWeek" | "manifesto" | "budgetDraft" | "budgetFx" | "qt" | "scandal" | "nextScandal" | "achievements" | "counters" | "mrp" | "pos0" | "lastMove" | "speech">),
  };
  s.fx0 = lawEffects(s);
  calibrate(s);
  // You, and every party's leader.
  const r = roll(s);
  const me = newPolitician(s, you, s.homeState, r);
  me.you = true;
  me.age = 46;
  s.you = me.id;
  for (const p of ps) s.parties[p.id].leader = p.id === you ? me.id : newPolitician(s, p.id, r.int(0, c.states.length - 1), r).id;
  // The calendar.
  const first = (year: number, w: number, term: number) => {
    let wk = weekFor(s, year, w);
    while (wk < 1) wk += term * WEEKS;
    return wk;
  };
  s.cal.lower = first(sy.lower.next, sy.lower.week, sy.lower.term);
  if (sy.upper.kind === "elected" || sy.upper.kind === "indirect") s.cal.upper = first(sy.upper.next, sy.upper.week, sy.upper.term);
  if (sy.pres) s.cal.pres = first(sy.pres.next, sy.pres.week, sy.pres.term);
  const span = sy.regionTerm * WEEKS;
  s.regionNext = c.states.map((_, k) => 2 + ((k * 7919 + 13) % (span - 2)));
  // The country as it stands: run an election quietly to fill every office (with the real
  // make-up of the houses and the regions, where the scenario has it).
  const run = runElection(s, { lower: true, upper: true, pres: !!sy.pres }, true);
  if (sc.start?.lower) {
    run.lower = seatsFrom(s, run, sc.start.lower, run.lower!.map((x) => x.r));
    run.houseSeats = countBy(s, run.lower);
  }
  if (sc.start?.upper && run.upper && sy.upper.kind !== "council") {
    const up = seatsFrom(s, run, sc.start.upper, run.upper.map((x) => x.r));
    run.upper = run.upper.map((x, j) => ({ ...x, p: up[j]?.p ?? x.p }));
    run.senateSeats = countBy(s, run.upper);
  }
  applyElection(s, run, true);
  s.lastElection = run;
  s.week = 1;
  initPolitics(s);
  initCampaign(s);
  s.missions = [];
  addMission(s, { kind: "election", deadline: electionDeadline(s), reward: 400 });
  addPromise(s);
  addMission(s, { kind: "members", target: Math.round(s.parties[you].members * 1.3), deadline: s.week + 40, reward: 120 });
  news(s, "party", `${fullName(me)} is elected ${titles(s).leader.toLowerCase()} of the ${party(s, you).name}`, 1);
  record(s);
  return s;
}

function addMission(s: GameState, m: Omit<Mission, "id">) {
  s.missions.push({ id: s.nextMission++, ...m });
}

/** A promise to voters: move a law one way within a deadline. */
function addPromise(s: GameState) {
  const r = roll(s);
  const pos = party(s, s.party).pos;
  // Promise what your voters want: a law where some other option sits closer to your party.
  const choices = allLaws(s)
    .filter((l) => !l.constitutional && !s.missions.some((m) => m.law === l.id && !m.done && !m.failed))
    .flatMap((l) => {
      const cur = s.laws[l.id];
      return [-1, 1].filter((d) => l.options[cur + d] && dist(l.options[cur + d].pos, pos) < dist(l.options[cur].pos, pos) - 0.05).map((d) => ({ l, d }));
    });
  if (!choices.length) return;
  const { l, d } = r.pick(choices);
  addMission(s, { kind: "promise", law: l.id, dir: d, start: s.laws[l.id], deadline: s.week + r.int(40, 90), reward: 150 });
}

/** A manifesto pledge becomes a promise to keep within two years. */
export function addPledge(s: GameState, law: string, dir: number) {
  if (s.missions.some((m) => m.kind === "promise" && m.law === law && !m.done && !m.failed)) return;
  addMission(s, { kind: "promise", law, dir, start: s.laws[law], deadline: s.week + 2 * WEEKS, reward: 150, pledge: true });
}

/** The week the "win the next election" mission is decided. */
function electionDeadline(s: GameState) {
  return sys(s).exec === "presidential" && s.cal.pres > 0 ? s.cal.pres : s.cal.lower;
}

export function missionText(m: Mission, s: GameState) {
  const t = titles(s);
  if (m.kind === "election") return sys(s).exec === "presidential" ? `Win the presidency` : `Become ${t.head}`;
  if (m.kind === "members") return `Grow the party to ${(m.target! / 1000).toFixed(0)}k members`;
  if (m.kind === "seats") return `Win ${m.target} seats in the ${sys(s).lower.short}`;
  if (m.kind === "laws") return `Pass ${m.target} laws`;
  const l = lawOf(s, m.law!);
  if (!l) return "Keep a promise (the law was repealed)";
  const isRate = l.options[0].label.endsWith("%");
  const what = isRate ? `${m.dir! < 0 ? "lower" : "raise"} ${l.name.toLowerCase()}` : `change ${l.name.toLowerCase()} to ${l.options[(m.start ?? s.laws[l.id]) + m.dir!]?.label ?? "…"}`;
  return m.pledge ? `Manifesto pledge: ${what}` : `Promise to ${what}`;
}

/** The next national election of any kind. */
export function nextElectionWeek(s: GameState) {
  const ws = [s.cal.lower, s.cal.upper, s.cal.pres].filter((w) => w >= s.week);
  return ws.length ? Math.min(...ws) : s.week + WEEKS * 2;
}
/** What the next national election will be. */
export function nextElection(s: GameState) {
  const w = nextElectionWeek(s);
  const c = { lower: s.cal.lower === w, upper: s.cal.upper === w, pres: s.cal.pres === w };
  return { week: w, ...describe(s, c, false) };
}

function describe(s: GameState, c: ElectionRun["contests"], snap: boolean): { kind: ElectionRun["kind"]; title: string } {
  const t = titles(s);
  const sy = sys(s);
  if (snap) return { kind: "snap", title: `Snap ${t.election.toLowerCase()}` };
  if (c.pres && c.lower) return { kind: "general", title: t.election };
  if (c.pres) return { kind: "president", title: t.president === "President" ? "Presidential election" : `${t.president} election` };
  if (c.lower) return sy.exec === "presidential" ? { kind: "midterm", title: t.midterm } : { kind: "general", title: t.election };
  return { kind: "upper", title: `${sy.upper.name} election` };
}

// ------------------------------------------------------------------ counting

function dhondt(votes: number[], seats: number, sainte = false) {
  const out = votes.map(() => 0);
  for (let k = 0; k < seats; k++) {
    let best = -1;
    let bv = 0;
    for (let i = 0; i < votes.length; i++) {
      const v = votes[i] / (sainte ? 2 * out[i] + 1 : out[i] + 1);
      if (v > bv) {
        bv = v;
        best = i;
      }
    }
    if (best < 0) break;
    out[best]++;
  }
  return out;
}

/** Candidates in a district: each bloc puts up one (its strongest party there). */
function pooled(s: GameState, v: number[]) {
  const ps = partyDefs(s);
  const cand: { p: number; v: number }[] = [];
  const blocAt = new Map<string, number>();
  ps.forEach((pd, i) => {
    if (v[i] <= 0) return;
    if (pd.bloc) {
      const j = blocAt.get(pd.bloc);
      if (j === undefined) {
        blocAt.set(pd.bloc, cand.length);
        cand.push({ p: i, v: v[i] });
      } else {
        if (v[i] > v[cand[j].p]) cand[j].p = i;
        cand[j].v += v[i];
      }
    } else cand.push({ p: i, v: v[i] });
  });
  return cand;
}

/** Where a voter for party `from` goes when their candidate is out. */
function transfer(s: GameState, from: number, to: number[]) {
  const ps = partyDefs(s);
  const w = to.map((t) => Math.exp(-3.2 * dist(ps[from].pos, ps[t].pos)) * (ps[from].refuses?.includes(ps[t].id) ? 0.12 : 1) * (ps[from].bloc && ps[from].bloc === ps[t].bloc ? 3 : 1));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => x / sum);
}

/** Who wins a district under the lower house's system. */
function districtWinner(s: GameState, v: number[], system: LowerSystem): number {
  if (system === "irv") {
    // Preferences: knock out the last candidate and pass their votes on until someone has half.
    let alive = v.map((x, i) => (x > 0 ? i : -1)).filter((i) => i >= 0);
    const cur = [...v];
    while (alive.length > 1) {
      const tot = alive.reduce((a, i) => a + cur[i], 0);
      const top = alive.reduce((a, i) => (cur[i] > cur[a] ? i : a), alive[0]);
      if (cur[top] > tot / 2) return top;
      const last = alive.reduce((a, i) => (cur[i] < cur[a] ? i : a), alive[0]);
      alive = alive.filter((i) => i !== last);
      transfer(s, last, alive).forEach((f, j) => (cur[alive[j]] += cur[last] * f));
      cur[last] = 0;
    }
    return alive[0] ?? 0;
  }
  const cand = pooled(s, v).sort((a, b) => b.v - a.v);
  if (!cand.length) return 0;
  if (system === "fptp" && cand.length > 2) {
    // Tactical voting: some of the also-rans' voters back whichever of the front two they mind least.
    const [a, b] = cand;
    for (const c of cand.slice(2)) {
      const [fa, fb] = transfer(s, c.p, [a.p, b.p]);
      a.v += c.v * 0.3 * fa;
      b.v += c.v * 0.3 * fb;
    }
    return a.v >= b.v ? a.p : b.p;
  }
  if (system !== "two-round" || cand.length < 2) return cand[0].p;
  const tot = cand.reduce((a, c) => a + c.v, 0);
  if (cand[0].v > tot / 2) return cand[0].p;
  // Run-off between the top two; everyone else's voters pick the closer finalist (or stay home).
  const [a, b] = cand;
  let va = a.v;
  let vb = b.v;
  for (const c of cand.slice(2)) {
    const [fa, fb] = transfer(s, c.p, [a.p, b.p]);
    va += c.v * fa * 0.8;
    vb += c.v * fb * 0.8;
  }
  return va >= vb ? a.p : b.p;
}

/** Plurality in a region with blocs pooled, and the runner-up. */
function topTwo(s: GameState, v: number[]) {
  const cand = pooled(s, v).sort((a, b) => b.v - a.v);
  return { first: cand[0]?.p ?? 0, second: cand[1]?.p ?? cand[0]?.p ?? 0, landslide: (cand[0]?.v ?? 0) > 2 * (cand[1]?.v ?? 0) };
}

/** Members a party list wins: by D'Hondt among the parties over the threshold. */
function listSeats(votes: number[], seats: number, eligible: boolean[], sainte = false) {
  return dhondt(
    votes.map((v, i) => (eligible[i] ? v : 0)),
    seats,
    sainte,
  );
}

/** Seats from a party's region-by-region votes: which regions its list members come from. */
function spreadOverRegions(regionVotes: number[][], p: number, n: number) {
  const v = regionVotes.map((rv) => rv[p]);
  return dhondt(v, n);
}

interface Counted {
  sections: number[];
  shares: number[];
  turnout: number[];
  regionVotes: number[][];
  nat: number[];
}

/** Count the vote, county by county (with a little noise). */
function countVotes(s: GameState): Counted {
  const c = country(s);
  const r = roll(s);
  const P = partyDefs(s).length;
  const shares: number[] = [];
  const turnout: number[] = [];
  const regionVotes = c.states.map(() => new Array<number>(P).fill(0));
  const nat = new Array<number>(P).fill(0);
  const compulsory = sys(s).compulsory;
  for (const sec of c.sections) {
    const sh = sharesIn(s, sec.id, r.next);
    const t = compulsory ? clamp(0.9 + (r.next() - 0.5) * 0.06, 0.8, 0.97) : clamp(0.6 + (s.stats.happiness - 20) * -0.004 + (r.next() - 0.5) * 0.2, 0.3, 0.9);
    turnout.push(Math.round(t * 1000) / 1000);
    sh.forEach((v, i) => {
      shares.push(Math.round(v * 1000) / 1000);
      const votes = v * sec.pop * t;
      regionVotes[sec.state][i] += votes;
      nat[i] += votes;
    });
  }
  return { sections: c.sections.map((x) => x.id), shares, turnout, regionVotes, nat };
}

/** The lower house, seat by seat. */
function electLower(s: GameState, v: Counted): Seat[] {
  const c = country(s);
  const lo = sys(s).lower;
  const P = partyDefs(s).length;
  const system = lowerSystem(s);
  const pops = c.states.map((st) => st.pop);
  const natSum = v.nat.reduce((a, b) => a + b, 0) || 1;
  const seats: Seat[] = [];
  const districtsIn = (k: number, n: number) => {
    // Counties chunked into n districts of about equal population, swept across the region.
    const st = c.states[k];
    const secs = [...st.sections].sort((a, b) => c.sections[a].cx + c.sections[a].cy * 0.6 - (c.sections[b].cx + c.sections[b].cy * 0.6));
    const out: number[][] = [];
    if (n <= 0) return out;
    const target = st.pop / n;
    let acc = new Array<number>(P).fill(0);
    let popAcc = 0;
    secs.forEach((id, j) => {
      const sec = c.sections[id];
      const t = v.turnout[id];
      for (let i = 0; i < P; i++) acc[i] += v.shares[id * P + i] * sec.pop * t;
      popAcc += sec.pop;
      if ((popAcc >= target && out.length < n - 1) || j === secs.length - 1) {
        out.push(acc);
        acc = new Array<number>(P).fill(0);
        popAcc = 0;
      }
    });
    // Any districts left over (a region with fewer counties than seats) follow the region.
    while (out.length < n) out.push([...v.regionVotes[k]]);
    return out;
  };
  const isDistrict = DISTRICTS.includes(system);
  const fixed = c.states.map((st) => lo.fixed?.[st.key]);
  // A party passes the threshold nationally, or by being strong in a region (regional parties).
  const eligibleIn = (k: number) => v.nat.map((x, i) => x / natSum >= lo.threshold || (k >= 0 && v.regionVotes[k][i] / (v.regionVotes[k].reduce((a, b) => a + b, 0) || 1) >= lo.threshold * 3));
  if (isDistrict || system === "pr") {
    const per = apportionBy(pops, lo.seats, 1, fixed);
    c.states.forEach((_, k) => {
      if (system === "pr") {
        listSeats(v.regionVotes[k], per[k], eligibleIn(k)).forEach((n, p) => {
          for (let j = 0; j < n; j++) seats.push({ r: k, p });
        });
        return;
      }
      for (const d of districtsIn(k, per[k])) seats.push({ r: k, p: districtWinner(s, d, system) });
    });
    return seats;
  }
  // Mixed: district members by first past the post, plus list members.
  const D = Math.round(lo.seats * (1 - lo.listShare));
  const per = apportionBy(pops, D, 1, c.states.map((st) => (lo.fixed?.[st.key] === 0 ? 0 : undefined)));
  const districtSeats: Seat[] = [];
  c.states.forEach((_, k) => {
    for (const d of districtsIn(k, per[k])) districtSeats.push({ r: k, p: districtWinner(s, d, "fptp") });
  });
  const wins = new Array<number>(P).fill(0);
  for (const d of districtSeats) wins[d.p]++;
  const eligible = v.nat.map((x, i) => x / natSum >= lo.threshold || (system === "mmp" && wins[i] >= 3));
  if (system === "parallel") {
    const lists = listSeats(v.nat, lo.seats - D, eligible);
    seats.push(...districtSeats);
    lists.forEach((n, p) => spreadOverRegions(v.regionVotes, p, n).forEach((m, k) => {
      for (let j = 0; j < m; j++) seats.push({ r: k, p });
    }));
    return seats;
  }
  // Mixed-member proportional: seats follow the party vote; a party's district winners sit first.
  const total = listSeats(v.nat, lo.seats, eligible, true);
  const winsBy: Seat[][] = Array.from({ length: P }, () => []);
  for (const d of districtSeats) winsBy[d.p].push(d);
  for (let p = 0; p < P; p++) {
    const keep = winsBy[p].slice(0, total[p]);
    seats.push(...keep);
    const more = total[p] - keep.length;
    if (more > 0) spreadOverRegions(v.regionVotes, p, more).forEach((m, k) => {
      for (let j = 0; j < m; j++) seats.push({ r: k, p });
    });
  }
  // Seats won in districts by parties that didn't earn them go to the strongest lists' parties.
  while (seats.length < lo.seats) {
    const short = total.map((t, p) => t - seats.filter((x) => x.p === p).length);
    const p = short.indexOf(Math.max(...short));
    seats.push({ r: v.regionVotes.reduce((best, rv, k) => (rv[p] > v.regionVotes[best][p] ? k : best), 0), p });
  }
  return seats.slice(0, lo.seats);
}

/** The upper house after an election (only the class that's up changes). */
function electUpper(s: GameState, v: Counted, all: boolean): Seat[] {
  const up = sys(s).upper;
  const ps = partyDefs(s);
  const P = ps.length;
  const plan = upperPlan(s);
  const cls = all ? -1 : s.upperClass % Math.max(1, up.classes);
  const current: Seat[] = s.senate.map((id, j) => ({ r: s.senateR[j] ?? -1, p: Math.max(0, pidx(s, pol(s, id)?.party ?? "")), c: s.senateC[j] ?? 0 }));
  if (up.kind === "appointed") {
    if (!all && current.length) return current;
    const mk = up.makeup ?? {};
    const out: Seat[] = [];
    const counts = ps.map((p) => mk[p.id] ?? 0);
    const sum = counts.reduce((a, b) => a + b, 0);
    // Without a make-up, the house mirrors the lower house's parties.
    const fill = sum ? apportionBy(counts, up.seats, 0) : apportionBy(v.nat, up.seats, 0);
    fill.forEach((n, p) => {
      for (let j = 0; j < n; j++) out.push({ r: -1, p, c: 0 });
    });
    return out;
  }
  // Every seat, with its region and class.
  const slots: { r: number; c: number }[] = [];
  plan.per.forEach((n, k) => {
    for (let j = 0; j < n; j++) slots.push({ r: k, c: (k * n + j) % Math.max(1, up.classes) });
  });
  for (let j = 0; j < plan.national; j++) slots.push({ r: -1, c: j % Math.max(1, up.classes) });
  if (up.kind === "council") {
    // Each region's government casts all its votes.
    return slots.map((sl) => ({ r: sl.r, p: Math.max(0, pidx(s, pol(s, s.governors[sl.r])?.party ?? ps[0].id)), c: sl.c }));
  }
  const keep = current.length === slots.length && !all;
  // The make-up for an indirectly chosen house follows the vote slowly.
  const chamberShare = new Array<number>(P).fill(0);
  if (up.kind === "indirect") {
    const mk = up.makeup;
    const base = current.length ? current.map((x) => x.p) : ps.flatMap((p, i) => new Array(mk?.[p.id] ?? 0).fill(i));
    for (const p of base) chamberShare[p] += 1 / Math.max(1, base.length);
  }
  const votesIn = (k: number) => {
    const rv = k >= 0 ? v.regionVotes[k] : v.nat;
    const sum = rv.reduce((a, b) => a + b, 0) || 1;
    if (up.kind !== "indirect" || !chamberShare.some((x) => x > 0)) return rv;
    return rv.map((x, i) => (0.5 * x) / sum + 0.5 * chamberShare[i]);
  };
  const byRegion = new Map<number, number[]>();
  slots.forEach((sl, j) => {
    if (keep && sl.c !== cls) return;
    let a = byRegion.get(sl.r);
    if (!a) byRegion.set(sl.r, (a = []));
    a.push(j);
  });
  const out: Seat[] = slots.map((sl, j) => (keep ? { ...current[j], r: sl.r, c: sl.c } : { r: sl.r, p: 0, c: sl.c }));
  for (const [k, js] of byRegion) {
    const vv = votesIn(k);
    const n = js.length;
    let parties: number[] = [];
    if (up.method === "pr" || k < 0) {
      dhondt(vv, n).forEach((m, p) => {
        for (let j = 0; j < m; j++) parties.push(p);
      });
    } else {
      const t = topTwo(s, vv);
      const firstN = up.method === "limited" ? n - Math.floor(n / 3) : n === 1 || t.landslide ? n : n - 1;
      parties = [...new Array(firstN).fill(t.first), ...new Array(n - firstN).fill(t.second)];
    }
    js.forEach((j, q) => (out[j].p = parties[q] ?? parties[0] ?? 0));
  }
  return out;
}

/** Who a party puts up for President: its leader, unless they've served their terms. */
function nominee(s: GameState, partyId: PartyId): number {
  const ps = s.parties[partyId];
  const limit = [1, 2, Infinity][s.laws.termLimits ?? 1] ?? 2;
  const can = (id: number | undefined) => id !== undefined && !!pol(s, id) && pol(s, id)!.party === partyId && (s.presTerms[id] ?? 0) < limit;
  if (can(ps.leader)) return ps.leader;
  if (can(ps.nominee)) return ps.nominee!;
  const alt = [...s.governors, ...s.senate].find((g) => g !== s.you && can(g));
  ps.nominee = alt ?? newPolitician(s, partyId, 0).id;
  return ps.nominee;
}

function electPresident(s: GameState, v: Counted, named = true): ElectionRun["president"] {
  const ps = partyDefs(s);
  const pres = sys(s).pres!;
  const c = country(s);
  const cand = pooled(s, v.nat).filter((x) => !ps[x.p].noRun && !ps[x.p].others);
  const tot = cand.reduce((a, x) => a + x.v, 0) || 1;
  const first = Object.fromEntries(cand.map((x) => [ps[x.p].id, x.v / tot]));
  const nameOf = (p: number) => {
    if (!named) return ps[p].name;
    const n = pol(s, nominee(s, ps[p].id));
    return n ? fullName(n) : ps[p].name;
  };
  if (pres.college) {
    // Each region's electors (its seats in both houses, at least three) go to its winner.
    const lowerPer = apportion(s);
    const upperPer = upperPlan(s).per;
    const college: number[] = new Array(ps.length).fill(0);
    c.states.forEach((_, k) => {
      const e = lowerPer[k] + upperPer[k] || 3;
      college[topTwo(s, v.regionVotes[k]).first] += e;
    });
    const win = college.indexOf(Math.max(...college));
    const pooledWin = cand.find((x) => x.p === win);
    return { party: ps[win].id, name: nameOf(win), share: (pooledWin?.v ?? 0) / tot, runoff: false, college: Object.fromEntries(college.map((n, i) => [ps[i].id, n]).filter(([, n]) => (n as number) > 0)), first };
  }
  const order = [...cand].sort((a, b) => b.v - a.v);
  if (!order.length) return null;
  if (!pres.runoff || order[0].v > tot / 2 || order.length < 2) return { party: ps[order[0].p].id, name: nameOf(order[0].p), share: order[0].v / tot, runoff: false, first };
  const [a, b] = order;
  let va = a.v;
  let vb = b.v;
  for (const x of order.slice(2)) {
    const [fa, fb] = transfer(s, x.p, [a.p, b.p]);
    va += x.v * fa;
    vb += x.v * fb;
  }
  const w = va >= vb ? a : b;
  return { party: ps[w.p].id, name: nameOf(w.p), share: Math.max(va, vb) / (va + vb), runoff: true, first };
}

const countBy = (s: GameState, seats: Seat[]) => {
  const out: Record<PartyId, number> = Object.fromEntries(ids(s).map((id) => [id, 0]));
  for (const x of seats) out[partyDefs(s)[x.p]?.id ?? ""]++;
  return out;
};

/** Count an election (doesn't change offices; see applyElection). */
export function runElection(s: GameState, contests: ElectionRun["contests"], quiet = false, snap = false): ElectionRun {
  const c = country(s);
  const v = countVotes(s);
  const P = partyDefs(s).length;
  const natSum = v.nat.reduce((a, b) => a + b, 0) || 1;
  const national = Object.fromEntries(ids(s).map((id, i) => [id, v.nat[i] / natSum]));
  const lower = contests.lower ? electLower(s, v) : null;
  const up = sys(s).upper;
  const upper = up.kind !== "none" && (contests.upper || quiet) ? electUpper(s, v, quiet) : null;
  const president = contests.pres && sys(s).pres ? electPresident(s, v) : null;
  // Counties report in a sweeping, slightly random order (east to west, like returns coming in).
  const r = roll(s);
  const order = c.sections.map((sec) => sec.id).sort((a, b) => c.sections[b].cx + r.next() * 120 - (c.sections[a].cx + r.next() * 120));
  const prevHouse = houseBy(s);
  const prevSenate = senateBy(s);
  const govs: Record<PartyId, number> = Object.fromEntries(ids(s).map((id) => [id, 0]));
  for (const g of s.governors) {
    const p = pol(s, g)?.party;
    if (p) govs[p]++;
  }
  void P;
  return {
    ...describe(s, contests, snap),
    contests,
    week: s.week,
    shares: v.shares,
    turnout: v.turnout,
    order,
    national,
    houseSeats: lower ? countBy(s, lower) : prevHouse,
    senateSeats: upper ? countBy(s, upper) : prevSenate,
    lower,
    upper,
    president,
    governors: govs,
    prevHouse,
    prevSenate,
  };
}

/** A seat projection from today's polls (an MRP): the lower house, and the presidency. Changes nothing. */
export function projectSeats(s: GameState): SeatProjection {
  const r0 = s.rolls;
  const v = countVotes(s);
  const lower = countBy(s, electLower(s, v));
  const p = sys(s).pres ? electPresident(s, v, false) : null;
  s.rolls = r0;
  const sum = v.nat.reduce((a, b) => a + b, 0) || 1;
  return { lower, national: Object.fromEntries(ids(s).map((id, i) => [id, v.nat[i] / sum])), pres: p ? { party: p.party, share: p.share, runoff: p.runoff, college: p.college } : null };
}

/** Fill the offices from a counted election. */
export function applyElection(s: GameState, e: ElectionRun, quiet = false) {
  const c = country(s);
  const ps = partyDefs(s);
  const P = ps.length;
  const taken = new Set<number>();
  const free = freePool(s);
  const sy = sys(s);
  // The President first (so they don't also take a seat).
  if (e.president) {
    const winner = nominee(s, e.president.party);
    s.president = winner;
    s.presTerms[winner] = (s.presTerms[winner] ?? 0) + 1;
  }
  if (s.president >= 0) taken.add(s.president);
  if (e.lower) {
    // The House: seat by seat; you take your party's first seat (in your home region if it has one).
    const order = [...e.lower].sort((a, b) => (a.p === pidx(s, s.party) && a.r === s.homeState ? -1 : 0) - (b.p === pidx(s, s.party) && b.r === s.homeState ? -1 : 0));
    const house: number[] = [];
    const houseR: number[] = [];
    let youSat = false;
    for (const seat of order) {
      const pid = ps[seat.p].id;
      let id: number;
      if (pid === s.party && !youSat && s.president !== s.you) {
        id = s.you;
        youSat = true;
        taken.add(id);
      } else id = recruit(s, pid, Math.max(0, seat.r), taken, free);
      house.push(id);
      houseR.push(seat.r);
    }
    s.house = house;
    s.houseR = houseR;
    s.lastLower = e.week;
  }
  if (e.upper) {
    const keepIds = new Map<number, number>();
    // Members whose seats weren't up keep them.
    if (!quiet && s.senate.length === e.upper.length)
      e.upper.forEach((seat, j) => {
        const cur = pol(s, s.senate[j]);
        if (cur && pidx(s, cur.party) === seat.p && (s.senateC[j] ?? 0) !== (s.upperClass % Math.max(1, sy.upper.classes)) ) keepIds.set(j, cur.id);
      });
    for (const id of keepIds.values()) taken.add(id);
    s.senate = e.upper.map((seat, j) => keepIds.get(j) ?? recruit(s, ps[seat.p].id, Math.max(0, seat.r), taken, free));
    s.senateR = e.upper.map((x) => x.r);
    s.senateC = e.upper.map((x) => x.c ?? 0);
    if (e.contests.upper && !quiet) s.upperClass++;
  }
  if (quiet) {
    // Every region's government and the big cities' mayors.
    const startRegions = s.sc.start?.regions ?? {};
    s.governors = c.states.map((st, k) => recruit(s, startRegions[st.key] ?? ps[topTwo(s, regionShares(s, e, k)).first].id, k, taken, free));
    s.mayors = c.sections
      .filter((sec) => sec.city)
      .map((sec) => {
        let w = 0;
        for (let i = 0; i < P; i++) if (e.shares[sec.id * P + i] > e.shares[sec.id * P + w]) w = i;
        return { section: sec.id, holder: recruit(s, ps[w].id, sec.state, taken, free) };
      });
    if (sy.upper.kind === "council") refreshCouncil(s);
  }
  if (quiet) {
    // Who holds office as the game opens, where the scenario says.
    const pp = s.sc.start?.pres;
    if (pp && sy.pres && pol(s, s.president)?.party !== pp) {
      s.president = nominee(s, pp);
      s.presTerms[s.president] = 1;
    }
  }
  // The government.
  if (sy.exec === "presidential") {
    const head = s.gov.head;
    s.gov = { parties: [pol(s, s.president)?.party ?? ps[0].id], head: s.president, since: head === s.president ? s.gov.since : e.week };
    if (!quiet && head !== s.president) newGovernment(s);
  } else if (e.lower) {
    const start = quiet ? s.sc.start?.gov : undefined;
    if (start?.length) setGovernment(s, start, true);
    else formGovernment(s, quiet);
  }
  if (quiet) {
    prune(s);
    return;
  }
  // Reschedule.
  if (e.contests.lower) {
    s.cal.lower = e.week + sy.lower.term * WEEKS;
    s.snapAt = -1;
  }
  if (e.contests.upper) s.cal.upper = e.week + sy.upper.term * WEEKS;
  if (e.contests.pres && sy.pres) s.cal.pres = e.week + sy.pres.term * WEEKS;
  const t = titles(s);
  const mine = e.houseSeats[s.party] ?? 0;
  const seats = sy.lower.seats;
  if (e.contests.lower) news(s, "election", `${e.title}: the ${party(s, s.party).name} win ${mine} of ${seats} seats in the ${sy.lower.short}`, mine >= (e.prevHouse[s.party] ?? 0) ? 1 : -1);
  if (e.contests.upper && e.upper) news(s, "election", `${sy.upper.name}: the ${party(s, s.party).short} hold ${e.senateSeats[s.party] ?? 0} of ${e.upper.length} seats`, (e.senateSeats[s.party] ?? 0) >= (e.prevSenate[s.party] ?? 0) ? 1 : 0);
  if (e.president) {
    const youWon = e.president.party === s.party;
    news(s, "election", `${e.president.name} (${party(s, e.president.party).short}) is elected ${t.president} with ${Math.round(e.president.share * 100)}%${e.president.runoff ? " in the run-off" : ""}`, youWon ? 1 : -1);
    if (youWon) {
      s.electionsWon++;
      s.score += 500;
      s.stats.approval = Math.max(s.stats.approval, 55);
    }
    for (const m of s.missions) if (m.kind === "election" && !m.done && !m.failed && sy.exec === "presidential") (youWon ? complete : fail)(s, m);
  }
  if (e.contests.lower) {
    s.score += Math.round((mine * 500) / seats);
    for (const m of s.missions) if (!m.done && !m.failed && m.kind === "seats" && mine >= (m.target ?? 0)) complete(s, m);
    if (!s.missions.some((m) => m.kind === "seats" && !m.done && !m.failed)) addMission(s, { kind: "seats", target: Math.min(Math.round(seats * 0.6), mine + Math.max(2, Math.round(seats * 0.06))), deadline: s.cal.lower, reward: 150 });
  }
  if (!s.missions.some((m) => m.kind === "election" && !m.done && !m.failed) && !s.talks) addMission(s, { kind: "election", deadline: electionDeadline(s), reward: 400 });
  afterElection(s, e);
  campaignAfterElection(s, e);
  prune(s);
}

/**
 * Seats for a given make-up (party → seats): each seat keeps its region, and goes to the party
 * that does best there among those with seats left to place.
 */
function seatsFrom(s: GameState, e: ElectionRun, makeup: Record<PartyId, number>, regions: number[]): Seat[] {
  const ps = partyDefs(s);
  const left = ps.map((p) => makeup[p.id] ?? 0);
  const total = left.reduce((a, b) => a + b, 0);
  // Scale to the number of seats (in case the make-up doesn't add up).
  if (total !== regions.length && total > 0) {
    const scaled = apportionBy(left, regions.length, 0);
    scaled.forEach((v, i) => (left[i] = v));
  }
  const counts = [...left];
  const shares = new Map<number, number[]>();
  const shareIn = (r: number) => {
    let sh = shares.get(r);
    if (!sh) {
      const tot = r >= 0 ? regionShares(s, e, r) : ps.map((p) => e.national[p.id] ?? 0);
      const sum = tot.reduce((a, b) => a + b, 0) || 1;
      shares.set(r, (sh = tot.map((v) => v / sum)));
    }
    return sh;
  };
  // Place the most contested regions' seats last: go region by region, best fit first.
  return regions.map((r) => {
    const sh = shareIn(r);
    let best = -1;
    let bv = -Infinity;
    for (let p = 0; p < ps.length; p++) {
      if (left[p] <= 0) continue;
      const v = (sh[p] + 0.02) * (left[p] / Math.max(1, counts[p]));
      if (v > bv) {
        bv = v;
        best = p;
      }
    }
    if (best < 0) best = sh.indexOf(Math.max(...sh));
    else left[best]--;
    return { r, p: best };
  });
}

function regionShares(s: GameState, e: ElectionRun, k: number) {
  const c = country(s);
  const P = partyDefs(s).length;
  const tot = new Array<number>(P).fill(0);
  for (const id of c.states[k].sections) for (let i = 0; i < P; i++) tot[i] += e.shares[id * P + i] * c.sections[id].pop;
  return tot;
}

/** The council upper house follows the regions' governments. */
function refreshCouncil(s: GameState) {
  const plan = upperPlan(s);
  const taken = new Set<number>();
  const senate: number[] = [];
  const senateR: number[] = [];
  plan.per.forEach((n, k) => {
    const gp = pol(s, s.governors[k])?.party ?? partyDefs(s)[0].id;
    // The governor's own members first, then others of their party from the region.
    for (let j = 0; j < n; j++) {
      const cur = s.senate.find((id, q) => s.senateR[q] === k && pol(s, id)?.party === gp && !taken.has(id));
      senate.push(cur !== undefined ? (taken.add(cur), cur) : recruit(s, gp, k, taken));
      senateR.push(k);
    }
  });
  s.senate = senate;
  s.senateR = senateR;
  s.senateC = senate.map(() => 0);
}

/** Drop politicians who hold nothing and aren't needed (keeps saves small). */
function prune(s: GameState) {
  const keep = new Set<number>([s.you, s.president, s.gov.head, ...s.house, ...s.senate, ...s.governors, ...s.mayors.map((m) => m.holder)]);
  for (const p of Object.values(s.parties)) {
    keep.add(p.leader);
    if (p.nominee !== undefined) keep.add(p.nominee);
  }
  for (const b of s.bills) {
    keep.add(b.proposer);
    for (const m of b.committee) keep.add(m);
  }
  for (const id of Object.keys(s.presTerms)) keep.add(Number(id));
  for (const id of Object.values(s.cabinet ?? {})) keep.add(id);
  if (s.politicians.length > keep.size * 1.3) s.politicians = s.politicians.filter((p) => keep.has(p.id));
}

// ------------------------------------------------------------------ governments

/** Seats per party in the lower house (scenario order). */
const lowerSeats = (s: GameState) => {
  const by = houseBy(s);
  return ids(s).map((id) => by[id] ?? 0);
};

/** Governments that could command a majority, best first (each a list of parties, the head's first). */
export function coalitionOptions(s: GameState, without?: PartyId): PartyId[][] {
  const ps = partyDefs(s);
  const seats = lowerSeats(s);
  const total = seats.reduce((a, b) => a + b, 0);
  // Units: blocs move together.
  const units: { parties: number[]; seats: number; pos: Pos }[] = [];
  const blocAt = new Map<string, number>();
  ps.forEach((p, i) => {
    if (seats[i] <= 0 || p.noRun || p.id === without) return;
    if (p.bloc && blocAt.has(p.bloc)) {
      const u = units[blocAt.get(p.bloc)!];
      u.parties.push(i);
      u.seats += seats[i];
      return;
    }
    if (p.bloc) blocAt.set(p.bloc, units.length);
    units.push({ parties: [i], seats: seats[i], pos: p.pos });
  });
  for (const u of units) {
    const w = u.parties.reduce((a, i) => a + seats[i], 0) || 1;
    u.pos = { e: u.parties.reduce((a, i) => a + ps[i].pos.e * seats[i], 0) / w, s: u.parties.reduce((a, i) => a + ps[i].pos.s * seats[i], 0) / w };
  }
  units.sort((a, b) => b.seats - a.seats);
  const n = Math.min(units.length, 12);
  const refuse = (a: number[], b: number[]) => a.some((i) => b.some((j) => ps[i].refuses?.includes(ps[j].id) || ps[j].refuses?.includes(ps[i].id)));
  const out: { parties: number[]; score: number }[] = [];
  const presParty = sys(s).exec === "semi" ? pol(s, s.president)?.party : undefined;
  for (let mask = 1; mask < 1 << n; mask++) {
    const us = units.filter((_, i) => mask & (1 << i));
    if (us.length > 4) continue;
    const sum = us.reduce((a, u) => a + u.seats, 0);
    if (sum * 2 <= total) continue;
    if (us.some((u) => sum - u.seats > total / 2)) continue;
    if (us.some((u, i) => us.some((w, j) => j > i && refuse(u.parties, w.parties)))) continue;
    let spread = 0;
    for (const a of us) for (const b of us) spread = Math.max(spread, dist(a.pos, b.pos));
    const parties = us.flatMap((u) => u.parties).sort((a, b) => (ps[a].others ? 1 : 0) - (ps[b].others ? 1 : 0) || seats[b] - seats[a]);
    if (ps[parties[0]].others) continue;
    const score = spread + 0.25 * (us.length - 1) - (mask & 1 ? 0.45 : 0) - (presParty && parties.some((i) => ps[i].id === presParty) ? 0.3 : 0);
    out.push({ parties, score });
  }
  out.sort((a, b) => a.score - b.score);
  return out.map((o) => o.parties.map((i) => ps[i].id));
}

/** A minority government of the biggest party (and its bloc). */
function minority(s: GameState, lead?: PartyId): PartyId[] {
  const ps = partyDefs(s);
  const seats = lowerSeats(s);
  const top = lead ?? ps.filter((p) => !p.others && !p.noRun).sort((a, b) => seats[pidx(s, b.id)] - seats[pidx(s, a.id)])[0].id;
  const bloc = party(s, top).bloc;
  return [top, ...(bloc ? ps.filter((p) => p.bloc === bloc && p.id !== top && seats[pidx(s, p.id)] > 0).map((p) => p.id) : [])];
}

/** Put a government in office. */
export function setGovernment(s: GameState, parties: PartyId[], quiet = false) {
  let head = sys(s).exec === "presidential" ? s.president : s.parties[parties[0]].leader;
  if (sys(s).exec === "semi" && head === s.president) {
    // The President appoints someone else from their party as Prime Minister.
    head = s.house.find((h) => h !== s.president && h !== s.you && pol(s, h)?.party === parties[0]) ?? newPolitician(s, parties[0], 0).id;
  }
  const before = s.gov.parties[0];
  s.gov = { parties, head, since: s.week };
  s.talks = null;
  if (s.cabinet) newGovernment(s);
  if (quiet) return;
  const t = titles(s);
  const names = parties.map((p) => party(s, p).short).join("–");
  const p = pol(s, head);
  news(s, "government", `${p ? fullName(p) : party(s, parties[0]).name} becomes ${t.head}${parties.length > 1 ? ` at the head of a ${names} coalition` : ""}`, parties.includes(s.party) ? 1 : before === s.party ? -1 : 0);
  if (parties.includes(s.party)) s.stats.approval = Math.max(s.stats.approval, 50);
  for (const m of s.missions) {
    if (m.kind !== "election" || m.done || m.failed || sys(s).exec === "presidential") continue;
    if (parties[0] === s.party) {
      s.electionsWon++;
      s.score += 500;
      complete(s, m);
    } else fail(s, m);
  }
  if (!s.missions.some((m) => m.kind === "election" && !m.done && !m.failed)) addMission(s, { kind: "election", deadline: electionDeadline(s), reward: 400 });
}

/** After a lower-house election: form a government, asking the player when it's theirs to decide. */
function formGovernment(s: GameState, quiet: boolean) {
  const opts = coalitionOptions(s);
  const best = opts[0];
  if (!quiet) {
    if (best && best.includes(s.party) && best[0] !== s.party && best.length > 1) {
      s.talks = { kind: "invited", options: [best], week: s.week };
      news(s, "government", `The ${party(s, best[0]).name} invite the ${party(s, s.party).short} into coalition talks`, 1);
      return;
    }
    const mine = opts.filter((o) => o[0] === s.party).slice(0, 3);
    if (mine.length && (mine.length > 1 || mine[0].length > 1)) {
      s.talks = { kind: "lead", options: mine, week: s.week };
      news(s, "government", `The ${party(s, s.party).name} lead the coalition talks`, 1);
      return;
    }
  }
  setGovernment(s, best ?? minority(s), quiet);
}

/** The player's answer in coalition talks: an option's index, or -1 (decline / govern alone). */
export function chooseGovernment(s: GameState, i: number) {
  const t = s.talks;
  if (!t) return false;
  if (i >= 0 && t.options[i]) setGovernment(s, t.options[i]);
  else if (t.kind === "invited") {
    s.talks = null;
    news(s, "government", `The ${party(s, s.party).short} turn down a place in government`, 0);
    setGovernment(s, coalitionOptions(s, s.party)[0] ?? minority(s, t.options[0][0]));
  } else setGovernment(s, minority(s, s.party));
  return true;
}

/** Is the player in the government (as head or partner)? */
export const inGovernment = (s: GameState) => s.gov.parties.includes(s.party);

/** The government falls; the country goes to the polls. */
function collapse(s: GameState, why: string) {
  if (s.cal.lower - s.week <= SNAP_WEEKS) return;
  // Within a year of an election there's no new one: the lower house finds another government.
  if (s.week - s.lastLower < WEEKS) {
    news(s, "government", `${why}. Talks begin on a new government`, inGovernment(s) ? -1 : 1);
    const opts = coalitionOptions(s).filter((o) => o.join() !== s.gov.parties.join());
    setGovernment(s, opts[0] ?? minority(s));
    return;
  }
  s.cal.lower = s.week + SNAP_WEEKS;
  s.snapAt = s.cal.lower;
  news(s, "government", `${why}. A snap election is called for ${dateLabel(s, s.cal.lower)}`, inGovernment(s) ? -1 : 1);
}

/** As head of a parliamentary government, call an early election (after the first six months). */
export function callElection(s: GameState) {
  if (sys(s).exec === "presidential" || s.gov.head !== s.you || s.week - s.lastLower < 26 || s.election || s.talks) return false;
  collapse(s, `${fullName(pol(s, s.you)!)} asks for the dissolution of the ${sys(s).lower.short}`);
  return s.cal.lower === s.week + SNAP_WEEKS;
}

export const MOTION_COST = 3;
/** In opposition, table a motion of no confidence in the government. Returns the vote. */
export function noConfidence(s: GameState): { ok: boolean; tally?: Tally; passed?: boolean } {
  const ps = s.parties[s.party];
  if (sys(s).exec === "presidential" || inGovernment(s) || ps.funds < MOTION_COST || s.week - s.lastMotion < 26 || s.election || s.talks) return { ok: false };
  ps.funds -= MOTION_COST;
  s.lastMotion = s.week;
  const r = roll(s);
  const head = s.gov.parties[0];
  const by: Record<number, number> = {};
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const id of s.house) {
    const p = pol(s, id);
    if (!p) continue;
    let v: number;
    if (id === s.you) v = 1;
    else if (s.gov.parties.includes(p.party)) v = -1;
    else {
      const rel = s.parties[p.party].relations[head] ?? 0;
      const u = 0.15 + (25 - rel) / 90 + (50 - s.stats.approval) / 120 + (r.next() - 0.5) * (1.3 - s.parties[p.party].unity / 100);
      v = u > 0.1 ? 1 : u < -0.1 ? -1 : 0;
    }
    by[id] = v;
    if (v > 0) yes++;
    else if (v < 0) no++;
    else abstain++;
  }
  const passed = yes * 2 > s.house.length;
  const t = titles(s);
  news(s, "government", `Motion of no confidence in the ${t.head}: ${yes} to ${no}, ${passed ? "carried" : "defeated"}`, passed ? 1 : -1);
  if (passed) collapse(s, `The government loses the confidence of the ${sys(s).lower.short}`);
  else s.parties[s.party].swing -= 0.02;
  return { ok: true, tally: { yes, no, abstain, by }, passed };
}

function complete(s: GameState, m: Mission) {
  m.done = true;
  if (m.kind === "promise") note(s, "promisesKept");
  s.score += m.reward;
  s.parties[s.party].swing += 0.04;
  news(s, "mission", `Mission complete: ${missionText(m, s)}`, 1);
}
function fail(s: GameState, m: Mission) {
  m.failed = true;
  if (m.kind === "promise") s.parties[s.party].swing -= 0.08;
  news(s, "mission", `Mission failed: ${missionText(m, s)}`, -1);
}

// ------------------------------------------------------------------ bills and votes

export function lawEffects(s: GameState) {
  const fx: Required<Effects> = { happiness: 0, growth: 0, budget: 0, unemployment: 0 };
  for (const l of allLaws(s)) {
    const o = l.options[s.laws[l.id] ?? l.start]?.fx ?? {};
    fx.happiness += o.happiness ?? 0;
    fx.growth += o.growth ?? 0;
    fx.budget += o.budget ?? 0;
    fx.unemployment += o.unemployment ?? 0;
  }
  return fx;
}

/** How much a party wants a bill: positive for, negative against. */
export function partyStance(s: GameState, partyId: PartyId, b: Bill) {
  const pos = party(s, partyId).pos;
  if (b.budget) {
    const govParty = s.gov.parties[0];
    const rel = govParty ? s.parties[partyId].relations[govParty] ?? 0 : 0;
    return (s.gov.parties.includes(partyId) ? 0.8 : 0) + rel / 120 + (s.stats.happiness - s.sc.economy.happiness) / 60 - 0.05 + budgetLean(s, b.plan, partyId);
  }
  const l = lawOf(s, b.law);
  if (!l) return -1;
  const cur = l.options[s.laws[l.id]].pos;
  const nxt = l.options[b.option].pos;
  let u = (dist(cur, pos) - dist(nxt, pos)) * 1.4;
  u += (s.parties[partyId].relations[b.party] ?? 0) / 400;
  if (partyId === b.party) u += 0.3;
  // Government parties back the government's bills.
  if (s.gov.parties.includes(partyId) && s.gov.parties.includes(b.party)) u += 0.15;
  const n = timesLobbied(b, partyId);
  if (n) u += n > 1 ? 0.5 : 0.3;
  return u;
}

/** The members who vote at a bill's current stage. */
export function voters(s: GameState, b: Bill) {
  if (b.stage === "committee") return b.committee;
  if (b.stage === "house") return s.house;
  if (b.stage === "senate") return s.senate;
  if (b.stage === "president") return [s.president];
  if (b.stage === "override") return [...s.house, ...s.senate];
  return [];
}

export const youVoteOn = (s: GameState, b: Bill) => voters(s, b).includes(s.you);

/** The share of votes needed (ordinary half, constitutional two thirds, overrides as the system says). */
export const required = (s: GameState, b: Bill) => {
  const base = !b.budget && lawOf(s, b.law)?.constitutional ? 2 / 3 : 0.5;
  if (b.stage === "override" || (b.stage === "house" && b.insist)) return Math.max(base, sys(s).override);
  return base;
};

/** Count the votes at the current stage (with the player's own vote if they sit there). */
export function tally(s: GameState, b: Bill, r = roll(s)): Tally {
  const by: Record<number, number> = {};
  let yes = 0;
  let no = 0;
  let abstain = 0;
  const stance = new Map<PartyId, number>();
  for (const id of voters(s, b)) {
    const p = pol(s, id);
    if (!p) continue;
    let v: number;
    if (id === s.you && b.yourVote !== null) v = b.yourVote;
    else {
      let st = stance.get(p.party);
      if (st === undefined) stance.set(p.party, (st = partyStance(s, p.party, b)));
      const unity = (s.parties[p.party]?.unity ?? 50) / 100;
      const u = st + (r.next() - 0.5) * (1.2 - unity);
      v = u > 0.08 ? 1 : u < -0.08 ? -1 : 0;
    }
    by[id] = v;
    if (v > 0) yes++;
    else if (v < 0) no++;
    else abstain++;
  }
  return { yes, no, abstain, by };
}

/** Does a stage's vote carry? */
export const carries = (s: GameState, b: Bill, t: Tally) => (b.stage === "president" ? t.yes > 0 || t.abstain > 0 : t.yes > (t.yes + t.no) * required(s, b) && t.yes > 0);

function committeeFor(s: GameState, law: string) {
  // Committee members: drawn from the lower house in proportion to party strength; you sit on half of them.
  const r = roll(s);
  const pool = [...s.house];
  const out: number[] = [];
  const youSit = s.house.includes(s.you) && (lawOf(s, law)?.committee ?? 1) % 2 === 1;
  if (youSit) out.push(s.you);
  while (out.length < COMMITTEE_SIZE && pool.length) {
    const i = Math.floor(r.next() * pool.length);
    const id = pool.splice(i, 1)[0];
    if (id !== s.you) out.push(id);
  }
  return out;
}

/** Put a bill forward. Returns null if that bill is already in the pipeline or changes nothing. */
export function proposeBill(s: GameState, law: string, option: number, proposer = s.you): Bill | null {
  const l = lawOf(s, law);
  if (!l || option === s.laws[law] || !l.options[option]) return null;
  if (s.bills.some((b) => b.law === law && b.stage !== "passed" && b.stage !== "failed")) return null;
  const p = pol(s, proposer);
  if (!p) return null;
  const b: Bill = { id: s.nextBill++, law, option, proposer, party: p.party, stage: "committee", voteAt: s.week + STAGE_WEEKS, committee: committeeFor(s, law), yourVote: null, lobbied: [], last: null };
  s.bills.push(b);
  if (proposer === s.you) s.score += 5;
  return b;
}

export const BILL_COST = 0.5;
export const LOBBY_COST = 1.5;

/** Write a bill (costs a little party money). */
export function writeBill(s: GameState, law: string, option: number) {
  const ps = s.parties[s.party];
  if (ps.funds < BILL_COST) return null;
  const b = proposeBill(s, law, option);
  if (b) ps.funds -= BILL_COST;
  return b;
}

export function castVote(s: GameState, billId: number, v: -1 | 0 | 1) {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || !youVoteOn(s, b)) return false;
  b.yourVote = v;
  return true;
}

/** How many times a party can be lobbied on a bill at one stage. */
export const LOBBY_MAX = 2;
export const timesLobbied = (b: Bill, partyId: PartyId) => b.lobbied.reduce((n, p) => n + (p === partyId ? 1 : 0), 0);

/** Spend party money to win a party round on a bill at its current stage (twice at most). */
export function lobby(s: GameState, billId: number, partyId: PartyId) {
  const b = s.bills.find((x) => x.id === billId);
  const ps = s.parties[s.party];
  if (!b || timesLobbied(b, partyId) >= LOBBY_MAX || ps.funds < LOBBY_COST || partyId === s.party || !s.parties[partyId]) return false;
  ps.funds -= LOBBY_COST;
  b.lobbied.push(partyId);
  s.parties[partyId].relations[s.party] = clamp(s.parties[partyId].relations[s.party] + 2, -100, 100);
  return true;
}

/** The stage after this one in the country's legislature. */
function nextStage(s: GameState, b: Bill): Stage {
  const sy = sys(s);
  const exec: Stage = sy.exec === "presidential" ? "president" : "passed";
  if (b.stage === "committee") return "house";
  if (b.stage === "house") return sy.upper.kind === "none" || b.insist ? exec : "senate";
  if (b.stage === "senate") return exec;
  return "passed";
}

function advanceBill(s: GameState, b: Bill) {
  const t = tally(s, b);
  const ok = carries(s, b, t);
  b.last = { stage: b.stage, tally: t, passed: ok };
  const mine = b.party === s.party;
  const sy = sys(s);
  const name = lawOf(s, b.law)?.name ?? "A bill";
  if (!ok) {
    if (b.budget) {
      b.stage = "failed";
      s.stats.approval -= 6;
      s.stats.happiness -= 1;
      news(s, "budget", `The ${sy.lower.short} rejects the budget, ${t.yes} to ${t.no}`, -1);
      if (sy.exec !== "presidential") collapse(s, "The government loses the budget vote and falls");
      return;
    }
    if (b.stage === "senate" && sy.upper.power === "weak" && !b.insist) {
      // A weaker upper house can only send it back; the lower house may insist.
      b.stage = "house";
      b.insist = true;
      b.voteAt = s.week + STAGE_WEEKS;
      b.yourVote = null;
      b.lobbied = [];
      news(s, "law", `${name}: the ${sy.upper.short} votes it down; it goes back to the ${sy.lower.short}`, mine ? -1 : 0);
      return;
    }
    if (b.stage === "president") {
      b.stage = "override";
      b.voteAt = s.week + STAGE_WEEKS;
      b.yourVote = null;
      b.lobbied = [];
      news(s, "law", `${name}: the ${titles(s).president} vetoes the bill. Both houses can override it with ${Math.round(sy.override * 100)}%`, mine ? -1 : 0);
      return;
    }
    const where = b.last.stage === "override" ? "the veto stands" : `the bill falls in the ${stageName(s, b.last.stage)}`;
    b.stage = "failed";
    news(s, "law", `${name}: ${where}`, mine ? -1 : 0);
    return;
  }
  // Budgets only need the lower house.
  b.stage = b.budget ? "passed" : b.stage === "override" ? "passed" : nextStage(s, b);
  b.voteAt = s.week + STAGE_WEEKS;
  b.yourVote = null;
  b.lobbied = [];
  if (b.stage === "passed") {
    if (b.budget) {
      s.budgetPassed++;
      s.stats.approval += 2;
      const what = budgetPassed(s, b.plan, b.proposer === s.you);
      news(s, "budget", `The ${sy.lower.short} approves the budget, ${t.yes} to ${t.no}: ${what}`, 1);
      return;
    }
    const from = s.laws[b.law];
    s.laws[b.law] = b.option;
    lawChanged(s, b.law, from, b.option, mine, s.gov.head === s.you);
    const l = lawOf(s, b.law)!;
    news(s, "law", `${l.name} becomes law${sy.exec === "presidential" ? "" : ` with ${titles(s).assent}`}: ${l.options[b.option].label}`, mine ? 1 : 0);
    if (mine) {
      s.lawsPassed++;
      s.score += 40;
    }
    for (const m of s.missions) if (!m.done && !m.failed && m.kind === "promise" && m.law === b.law && Math.sign(s.laws[b.law] - (m.start ?? 0)) === m.dir) complete(s, m);
    for (const m of s.missions) if (!m.done && !m.failed && m.kind === "laws" && s.lawsPassed >= (m.target ?? 0)) complete(s, m);
  }
}

/** A stage's name in this country ("House of Commons", "President's desk"). */
export const stageName = (s: GameState, st: Stage) => {
  const sy = sys(s);
  return { committee: "committee", house: sy.lower.short, senate: sy.upper.short, president: `${titles(s).president}'s desk`, override: "veto override", passed: "law", failed: "failed" }[st];
};

// ------------------------------------------------------------------ events

export interface EventResult {
  ok: boolean;
  boost: number;
  backfired: boolean;
  poll?: Record<PartyId, number>;
  /** Money raised (fundraisers), after costs. */
  raised?: number;
  /** Why it couldn't be held. */
  why?: string;
}

/** How much a fundraiser raises now compared with fresh donors (1). */
export const donorFactor = (s: GameState) => 1 / (1 + 0.25 * (s.donors ?? 0));

/** What an event costs you (a pollster makes polls cheaper). */
export const eventCost = (s: GameState, ev: (typeof EVENT)[string]) => (ev.poll ? ev.cost * (1 - 0.15 * staffSkill(s, "pollster")) : ev.cost);

/** How many times you've held an event this week. */
export const eventUses = (s: GameState, id: string) => s.usedEvents.reduce((n, x) => n + (x === id ? 1 : 0), 0);

/** Why an event can't be held now (or null if it can). Fundraisers can always be held: they pay for themselves. */
export function eventBlocked(s: GameState, id: string): string | null {
  const ev = EVENT[id];
  if (!ev) return "Unknown event.";
  if (s.over) return "Your career is over.";
  if (eventUses(s, id) >= EVENT_MAX) return `Already held ${EVENT_MAX === 2 ? "twice" : `${EVENT_MAX} times`} this week.`;
  if (!ev.fund && s.parties[s.party].funds < eventCost(s, ev)) return "Not enough party funds.";
  return null;
}

/** Events that bring the press round (a good one wins coverage; a bad one costs it). */
const PRESS_EVENTS: Record<string, number> = { pressConf: 4, interview: 4, debate: 3, manifesto: 2, endorse: 2, charity: 2 };

/** Hold an event (a rally, an advert, a fundraiser…), in a state where it needs one. Twice a week at most; the second time does a little less. */
export function holdEvent(s: GameState, id: string, state = s.homeState, target?: PartyId): EventResult {
  const ev = EVENT[id];
  const ps = s.parties[s.party];
  const why = eventBlocked(s, id);
  if (!ev || why) return { ok: false, boost: 0, backfired: false, why: why ?? "Unknown event." };
  const again = eventUses(s, id) > 0 ? 0.6 : 1;
  const r = roll(s);
  ps.funds -= eventCost(s, ev);
  s.usedEvents.push(id);
  const you = pol(s, s.you)!;
  // Campaign staff: the press secretary heads off backfires, the campaign manager gets more out of every event.
  const backfired = !!ev.risk && r.next() < ev.risk * (1 - 0.1 * staffSkill(s, "press"));
  const k = (backfired ? -0.8 : 1) * (0.7 + you.charisma / 15) * again * (backfired ? 1 : 1 + 0.05 * staffSkill(s, "manager"));
  const boost = ev.boost * k;
  const camp = s.campaign[s.party];
  if (ev.scope === "state") camp[state] = clamp(camp[state] + boost, -20, 40);
  else if (ev.scope === "national") for (let i = 0; i < camp.length; i++) camp[i] = clamp(camp[i] + boost * 0.6, -20, 40);
  let raised: number | undefined;
  if (ev.money) {
    // Donors give less when the party is in trouble, and a scandal at a gala scares some off.
    let takings = ev.money * (0.8 + r.next() * 0.4) * again * (backfired ? 0.5 : 1) * (0.85 + ps.unity / 400) * (1 + 0.06 * staffSkill(s, "finance"));
    if (ev.fund) {
      takings *= donorFactor(s);
      s.donors += 1;
    }
    ps.funds += takings;
    raised = Math.round((takings - ev.cost) * 100) / 100;
  }
  if (ev.members) ps.members += Math.round(ev.members * (0.7 + r.next() * 0.6) * again * (1 + 0.1 * staffSkill(s, "field")));
  if (ev.unity) ps.unity = clamp(ps.unity + ev.unity * again, 0, 100);
  // The voter group it's aimed at (and the interest group that speaks for it).
  if (ev.group && ev.goodwill) courtGroup(s, ev.group, ev.goodwill * again * (backfired ? -0.5 : 1));
  // The party's factions.
  if (id === "congress") for (const f of s.factions) f.mood = clamp(f.mood + 8 * again, 0, 100);
  else if (id === "caucus") for (const f of s.factions) f.mood = clamp(f.mood + 3 * again, 0, 100);
  else if (id === "manifesto") for (const f of s.factions) f.mood = clamp(f.mood + (f.id === "centre" ? 4 : -1), 0, 100);
  else if (id === "donorRetreat") for (const f of s.factions) f.mood = clamp(f.mood + (f.id === "left" ? -5 : 1), 0, 100);
  // The press.
  if (backfired) pressEvent(s, -3);
  else if (PRESS_EVENTS[id]) pressEvent(s, PRESS_EVENTS[id] * again);
  if (ev.attack) {
    // Hit the strongest rival (or the one you chose).
    const poll = nationalPoll(s);
    const rival = target ?? running(s).filter((p) => p !== s.party).sort((a, b) => poll[b] - poll[a])[0];
    if (backfired) s.parties[s.party].swing -= 0.05;
    else s.parties[rival].swing -= ev.attack * 0.02 * again;
    s.parties[rival].relations[s.party] = clamp(s.parties[rival].relations[s.party] - 8, -100, 100);
    news(s, "scandal", backfired ? `The ${party(s, s.party).name}'s attack on the ${party(s, rival).name} backfires` : `The ${party(s, rival).name} reel from ${party(s, s.party).short} attacks`, backfired ? -1 : 1);
  }
  let poll: Record<PartyId, number> | undefined;
  if (ev.poll) {
    s.polled[state] = s.week;
    poll = statePoll(s, state);
  }
  if (backfired && !ev.attack) {
    if (ev.fund) s.parties[s.party].swing -= 0.015;
    news(s, "event", ev.fund ? `${ev.name}: questions over who paid for access to ${fullName(you)}` : `${ev.name} goes badly for ${fullName(you)}`, -1);
  }
  return { ok: true, boost, backfired, poll, raised };
}

// ------------------------------------------------------------------ the turn

export function news(s: GameState, kind: NewsItem["kind"], text: string, tone: 1 | 0 | -1) {
  s.news.unshift({ week: s.week, kind, text, tone });
  if (s.news.length > 80) s.news.length = 80;
}

/** AI parties: campaign where it counts, now and then put a bill forward. */
function aiTurn(s: GameState) {
  const c = country(s);
  const r = roll(s);
  const near = nextElectionWeek(s) - s.week < 26;
  const by = houseBy(s);
  const total = Math.max(1, s.house.length);
  for (const id of running(s)) {
    if (id === s.party) continue;
    const ps = s.parties[id];
    const pd = party(s, id);
    // Campaigning: more as an election nears, where the party stands.
    const n = near ? 3 : 1;
    for (let k = 0; k < n && ps.funds > 1; k++) {
      const st = c.states[Math.floor(r.next() * c.states.length)];
      if (pd.only && !pd.only.includes(st.key)) continue;
      s.campaign[id][st.id] = clamp(s.campaign[id][st.id] + 2 + r.next() * 3, -20, 40);
      ps.funds -= 0.6;
    }
    // Bills: the biggest parties write the most.
    if (r.next() < 0.04 + (by[id] ?? 0) / total / 6) {
      const pos = pd.pos;
      const cand = allLaws(s).flatMap((l) => {
        const cur = s.laws[l.id];
        return [cur - 1, cur + 1].filter((o) => l.options[o] && dist(l.options[o].pos, pos) < dist(l.options[cur].pos, pos) - 0.08).map((o) => ({ l, o }));
      });
      if (cand.length) {
        const { l, o } = r.pick(cand);
        const member = s.house.find((h) => pol(s, h)?.party === id) ?? ps.leader;
        const b = proposeBill(s, l.id, o, member);
        if (b) news(s, "law", `The ${pd.name} introduce a bill: ${l.name} → ${l.options[o].label}`, 0);
      }
    }
  }
  // Relations drift back toward what the parties' ideologies suggest.
  for (const p of partyDefs(s))
    for (const q of partyDefs(s)) {
      if (q.id === p.id) continue;
      const base = 40 - 45 * dist(p.pos, q.pos) - (p.refuses?.includes(q.id) ? 30 : 0);
      const rel = s.parties[p.id].relations;
      rel[q.id] = (rel[q.id] ?? 0) + (base - (rel[q.id] ?? 0)) * 0.02;
    }
}

/** The economy moves with the laws (changes from the ones in force at the start). */
function economy(s: GameState) {
  const now = lawEffects(s);
  const e = s.sc.economy;
  const k = e.gdp / 18;
  const fx = { happiness: now.happiness - s.fx0.happiness, growth: now.growth - s.fx0.growth, budget: (now.budget - s.fx0.budget) * k, unemployment: now.unemployment - s.fx0.unemployment };
  const st = s.stats;
  const r = roll(s);
  // The cabinet (good ministers help), temporary boosts (crisis decisions, executive actions) and trade deals.
  const cab = cabinetFx(s);
  const bf = s.budgetFx;
  const extra = { growth: cab.growth + (s.boosts?.growth ?? 0) + (s.tradeGrowth ?? 0) + (bf?.growth ?? 0), happiness: cab.happiness + (s.boosts?.happiness ?? 0) + (bf?.happiness ?? 0) };
  const targetHappy = e.happiness + fx.happiness + extra.happiness - Math.max(0, st.unemployment - e.unemployment - 1) * 0.8 + (st.growth - e.growth) * 1.5;
  st.happiness += (targetHappy - st.happiness) * 0.05 + (r.next() - 0.5) * 0.3;
  const debtNorm = e.debt / (e.gdp * 1000);
  const targetGrowth = e.growth + fx.growth + extra.growth - Math.max(0, st.debt / (st.gdp * 1000) - debtNorm - 0.2) * 1.5;
  st.growth += (targetGrowth - st.growth) * 0.04 + (r.next() - 0.5) * 0.08;
  st.unemployment = clamp(st.unemployment + (e.unemployment + fx.unemployment + (bf?.unemployment ?? 0) - (st.growth - e.growth) * 0.6 - st.unemployment) * 0.04, 1, 30);
  st.budget = e.budget + fx.budget + (cab.budget + (bf?.budget ?? 0)) * k + (st.growth - e.growth) * 25 * k;
  st.debt = Math.max(0, st.debt - st.budget / WEEKS);
  st.gdp *= 1 + st.growth / 100 / WEEKS;
  // The government's approval follows how people feel.
  const targetApproval = e.approval + (st.happiness - e.happiness) * 1.6 + (st.growth - e.growth) * 4 + cab.approval + (bf?.approval ?? 0);
  st.approval = clamp(st.approval + (targetApproval - st.approval) * 0.03 + (r.next() - 0.5) * 0.6, 5, 95);
  st.happiness = clamp(st.happiness, -50, 60);
}

function events(s: GameState) {
  const r = roll(s);
  const c = country(s);
  const t = titles(s);
  // Deaths in office: someone takes over.
  if (r.next() < 0.02) {
    const office = [...s.house, ...s.senate, ...s.governors].filter((id) => id !== s.you);
    const id = r.pick(office);
    const p = pol(s, id);
    if (p && p.age > 55) {
      const heir = newPolitician(s, p.party, p.state);
      for (const arr of [s.house, s.senate, s.governors]) {
        const i = arr.indexOf(id);
        if (i >= 0) arr[i] = heir.id;
      }
      news(s, "death", `${fullName(p)} (${p.age}) has passed away. ${fullName(heir)} takes their place`, 0);
    }
  }
  // Mayoral races in the cities.
  if (r.next() < 0.05 && s.mayors.length) {
    const m = r.pick(s.mayors);
    const sh = sharesIn(s, m.section, r.next);
    let w = 0;
    sh.forEach((v, i) => (v > sh[w] ? (w = i) : 0));
    const p = newPolitician(s, partyDefs(s)[w].id, c.sections[m.section].state);
    m.holder = p.id;
    news(s, "mayor", `${c.sections[m.section].town} mayor election: ${fullName(p)} (${party(s, p.party).short}) wins`, p.party === s.party ? 1 : 0);
  }
  // Scandals hit someone.
  if (r.next() < 0.02) {
    const id = r.pick(running(s).filter((p) => p !== s.party)) as PartyId | undefined;
    if (id) {
    s.parties[id].swing -= 0.06;
    news(s, "scandal", `Scandal: a ${party(s, id).name} donor is under investigation`, 0);
    }
  }
  // An appointed upper house: retirements, and the government (or an independent commission) fills the seats.
  const up = sys(s).upper;
  if (up.kind === "appointed" && weekOf(s.week) === 2 && s.senate.length) {
    const n = Math.max(1, Math.round(s.senate.length * 0.03));
    const filler = up.nonpartisan ? (partyDefs(s).find((p) => p.noRun)?.id ?? s.gov.parties[0]) : s.gov.parties[0];
    for (let k = 0; k < n; k++) {
      const j = Math.floor(r.next() * s.senate.length);
      if (s.senate[j] === s.you) continue;
      s.senate[j] = newPolitician(s, filler, Math.max(0, s.senateR[j]), r).id;
    }
    news(s, "government", `${n} new members are appointed to the ${up.name}`, filler === s.party ? 1 : 0);
  }
  if (weekOf(s.week) === 1) news(s, "economy", `${yearOf(s) - 1} in review: growth ${s.stats.growth.toFixed(1)}%, unemployment ${s.stats.unemployment.toFixed(1)}%`, s.stats.growth > s.sc.economy.growth - 0.3 ? 1 : -1);
  void t;
}

/** Regions elect their own governments on their own calendars. */
function regionalElections(s: GameState) {
  const c = country(s);
  const sy = sys(s);
  const r = roll(s);
  const ps = partyDefs(s);
  let council = false;
  c.states.forEach((st, k) => {
    if (s.regionNext[k] !== s.week) return;
    s.regionNext[k] += sy.regionTerm * WEEKS;
    const tot = new Array<number>(ps.length).fill(0);
    for (const id of st.sections) sharesIn(s, id, r.next).forEach((v, i) => (tot[i] += v * c.sections[id].pop));
    const w = ps[topTwo(s, tot).first].id;
    const before = pol(s, s.governors[k])?.party;
    const busy = new Set<number>([s.you, s.president, s.gov.head, ...s.house, ...s.senate, ...s.governors]);
    const head = recruit(s, w, k, busy);
    s.governors[k] = head;
    const role = sy.titles.regionHeads?.[st.key] ?? sy.titles.regionHead;
    const p = pol(s, head)!;
    news(s, "election", `${st.name} election: ${fullName(p)} (${party(s, w).short}) ${before === w ? "holds" : "wins"} the post of ${role}`, w === s.party ? 1 : before === s.party ? -1 : 0);
    if (sy.upper.kind === "council") council = true;
  });
  if (council) refreshCouncil(s);
}

/** Money and members, weekly. */
function finances(s: GameState) {
  const hb = houseBy(s);
  const sb = senateBy(s);
  const H = Math.max(1, s.house.length);
  const S = Math.max(1, s.senate.length);
  for (const id of ids(s)) {
    const ps = s.parties[id];
    // Small donations and state funding keep every party going; members and seats add more.
    ps.funds += 0.45 + ps.members * 0.0000025 + ((hb[id] ?? 0) / H) * 2 + ((sb[id] ?? 0) / S) * 0.6 - 0.25;
    const camp = s.campaign[id];
    // Members join while a party campaigns and drift away when it doesn't.
    ps.members = Math.max(1000, Math.round(ps.members * (1 - 0.0008 + (camp.reduce((a, b) => a + b, 0) / Math.max(1, camp.length)) * 0.0004)));
    ps.unity = clamp(ps.unity + (70 - ps.unity) * 0.03, 0, 100);
    ps.swing *= 0.995;
    // Time for a change: governing wears a party down.
    if (s.gov.parties.includes(id)) ps.swing -= s.gov.parties[0] === id ? 0.0006 : 0.0003;
  }
}

/** End the week: votes fall due, the world moves, elections when they come. */
export function endTurn(s: GameState) {
  if (s.over || s.election || s.talks) return s;
  // Whatever the player left unanswered (a crisis, a debate, a challenge) is settled.
  settlePending(s);
  settleCampaign(s);
  if (s.over) return s;
  // Votes due this week.
  for (const b of s.bills) if (b.stage !== "passed" && b.stage !== "failed" && b.voteAt <= s.week) advanceBill(s, b);
  s.bills = s.bills.filter((b) => (b.stage !== "passed" && b.stage !== "failed") || s.week - b.voteAt < 4);
  aiTurn(s);
  economy(s);
  finances(s);
  events(s);
  record(s);
  for (const id of ids(s)) s.campaign[id] = s.campaign[id].map((v) => v * 0.93);
  // Budget day.
  if (weekOf(s.week) === BUDGET_WEEK && !s.bills.some((b) => b.budget && b.stage !== "passed" && b.stage !== "failed")) {
    const head = pol(s, s.gov.head) ?? pol(s, s.president);
    if (head) {
      const yours = head.id === s.you;
      const plan = yours ? (s.budgetDraft?.year === yearOf(s) ? s.budgetDraft.plan : undefined) : aiBudget(s, head.party);
      const b: Bill = { id: s.nextBill++, law: "budget", option: 0, budget: true, proposer: head.id, party: head.party, stage: "house", voteAt: s.week + 1, committee: [], yourVote: null, lobbied: [], last: null, plan };
      s.bills.push(b);
      news(s, "budget", `The budget for ${yearOf(s) + 1} goes to the ${sys(s).lower.short}`, 0);
    }
  }
  // Deadlines.
  for (const m of s.missions) {
    if (m.done || m.failed || m.deadline > s.week) continue;
    if (m.kind === "election") continue;
    if (m.kind === "members" && s.parties[s.party].members >= (m.target ?? 0)) complete(s, m);
    else fail(s, m);
  }
  for (const m of s.missions) if (!m.done && !m.failed && m.kind === "members" && s.parties[s.party].members >= (m.target ?? 0)) complete(s, m);
  if (s.missions.filter((m) => m.kind === "promise" && !m.done && !m.failed).length < 2 && roll(s).next() < 0.1) addPromise(s);
  if (!s.missions.some((m) => m.kind === "laws" && !m.done && !m.failed)) addMission(s, { kind: "laws", target: s.lawsPassed + 2, deadline: s.week + 52, reward: 120 });
  for (const m of s.missions) if (m.kind === "election" && !m.done && !m.failed) m.deadline = electionDeadline(s);
  s.missions = s.missions.filter((m) => (!m.done && !m.failed) || s.week - m.deadline < 6);
  politicsWeek(s);
  campaignWeek(s);
  s.usedEvents = [];
  s.week++;
  // What's in the diary for the new week.
  runPlan(s);
  // Election day.
  const contests = { lower: s.cal.lower === s.week, upper: s.cal.upper === s.week, pres: s.cal.pres === s.week };
  if (contests.lower || contests.upper || contests.pres) {
    s.election = runElection(s, contests, false, contests.lower && s.snapAt === s.week);
  } else regionalElections(s);
  // Regional elections that fell on a national election day happen the week after.
  if (s.election) s.regionNext = s.regionNext.map((w) => (w === s.week ? w + 1 : w));
  if (yearOf(s) - s.sc.startYear >= CAREER_YEARS) s.over = true;
  return s;
}

/** The count has been shown: fill the offices. */
export function closeElection(s: GameState) {
  if (!s.election) return;
  applyElection(s, s.election);
  s.lastElection = s.election;
  s.election = null;
}

// ------------------------------------------------------------------ saving

/** Keep this week's numbers for the trend charts (about five years of weeks). */
function record(s: GameState) {
  const poll = nationalPoll(s);
  s.history.push({ w: s.week, poll: ids(s).map((id) => Math.round(poll[id] * 10000) / 10000), approval: Math.round(s.stats.approval * 10) / 10, happiness: Math.round(s.stats.happiness * 10) / 10, growth: Math.round(s.stats.growth * 100) / 100, unemployment: Math.round(s.stats.unemployment * 10) / 10 });
  if (s.history.length > 260) s.history.splice(0, s.history.length - 260);
}

// ------------------------------------------------------------------ custom laws

export const CUSTOM_MAX = 10;
export const DRAFT_COST = 2;
/** How far a custom law's options may move each number (per year in force). */
export const FX_LIMITS: Required<Effects> = { happiness: 6, growth: 0.5, budget: 80, unemployment: 1.5 };

export interface LawDraft {
  name: string;
  about?: string;
  group: LawGroup;
  committee?: number;
  constitutional?: boolean;
  /** Index of the option that is in force today. */
  start: number;
  options: { label: string; pos: Pos; fx: Effects }[];
}

const cleanText = (t: unknown, max: number) =>
  [...String(t ?? "")]
    .filter((ch) => ch >= " " && ch !== "\u007f" && ch !== "<" && ch !== ">")
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Check and tidy a draft. Returns the law it would make, or why it can't be made. */
export function checkDraft(s: GameState, d: LawDraft, id = `custom-${s.nextLaw}`): LawDef | string {
  const name = cleanText(d.name, 40);
  if (name.length < 3) return "Give the law a name (at least 3 letters).";
  if (allLaws(s).some((l) => l.name.toLowerCase() === name.toLowerCase() && l.id !== id)) return "There's already a law with that name.";
  if (!LAW_GROUPS.includes(d.group)) return "Pick a category.";
  if (!Array.isArray(d.options) || d.options.length < 2 || d.options.length > 5) return "A law needs 2 to 5 options.";
  const options = d.options.map((o) => ({
    label: cleanText(o.label, 28),
    pos: { e: clamp(Number(o.pos?.e) || 0, -1, 1), s: clamp(Number(o.pos?.s) || 0, -1, 1) },
    fx: Object.fromEntries(
      (Object.keys(FX_LIMITS) as (keyof Effects)[]).map((k) => [k, clamp(Number(o.fx?.[k]) || 0, -FX_LIMITS[k], FX_LIMITS[k])]).filter(([, v]) => v !== 0),
    ) as Effects,
  }));
  if (options.some((o) => !o.label)) return "Every option needs a name.";
  if (new Set(options.map((o) => o.label.toLowerCase())).size !== options.length) return "Two options have the same name.";
  const start = Math.round(Number(d.start));
  if (!(start >= 0 && start < options.length)) return "Choose which option is in force today.";
  const committee = Math.round(Number(d.committee ?? GROUP_COMMITTEE[d.group]));
  return { id, name, about: cleanText(d.about, 120) || undefined, group: d.group, committee: committee >= 1 && committee <= COMMITTEES.length ? committee : GROUP_COMMITTEE[d.group], options, start, constitutional: !!d.constitutional, custom: true };
}

/** Write a new law into the books (with today's option in force). Costs party money. */
export function draftLaw(s: GameState, d: LawDraft): LawDef | string {
  if (s.custom.length >= CUSTOM_MAX) return `You can have at most ${CUSTOM_MAX} laws of your own.`;
  const ps = s.parties[s.party];
  if (ps.funds < DRAFT_COST) return "Not enough party funds.";
  const law = checkDraft(s, d);
  if (typeof law === "string") return law;
  s.nextLaw++;
  ps.funds -= DRAFT_COST;
  s.custom.push(law);
  s.laws[law.id] = law.start;
  s.fx0 = addFx(s.fx0, law.options[law.start].fx);
  s.score += 10;
  news(s, "law", `${fullName(pol(s, s.you)!)} drafts a new law: ${law.name}`, 1);
  return law;
}

const addFx = (a: Required<Effects>, b: Effects, k = 1): Required<Effects> => ({ happiness: a.happiness + (b.happiness ?? 0) * k, growth: a.growth + (b.growth ?? 0) * k, budget: a.budget + (b.budget ?? 0) * k, unemployment: a.unemployment + (b.unemployment ?? 0) * k });

/** Change a drafted law that has never been put to a vote. */
export function editLaw(s: GameState, id: string, d: LawDraft): LawDef | string {
  const i = s.custom.findIndex((l) => l.id === id);
  if (i < 0) return "That law isn't one of yours.";
  if (s.bills.some((b) => b.law === id)) return "That law has already been before the legislature.";
  const law = checkDraft(s, d, id);
  if (typeof law === "string") return law;
  const old = s.custom[i];
  s.fx0 = addFx(addFx(s.fx0, old.options[s.laws[id]]?.fx ?? {}, -1), law.options[law.start].fx);
  s.custom[i] = law;
  s.laws[id] = law.start;
  return law;
}

/** Strike a drafted law from the books (not while a bill on it is going through). */
export function repealLaw(s: GameState, id: string) {
  const i = s.custom.findIndex((l) => l.id === id);
  if (i < 0 || s.bills.some((b) => b.law === id && b.stage !== "passed" && b.stage !== "failed")) return false;
  const [law] = s.custom.splice(i, 1);
  delete s.laws[id];
  s.bills = s.bills.filter((b) => b.law !== id);
  s.missions = s.missions.filter((m) => m.law !== id);
  news(s, "law", `${law.name} is struck from the books`, 0);
  return true;
}

export function save(s: GameState) {
  return JSON.stringify(s);
}

/** Read a save (upgrading older ones: version 1 and 2 saves are Avalon games). */
export function load(json: string | null): GameState | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown> & { v: number };
    if (![1, 2, 3].includes(raw.v) || !raw.parties || !raw.laws) return null;
    if (raw.v === 3) {
      const s = raw as unknown as GameState;
      initPolitics(s);
      initCampaign(s);
      return s;
    }
    // Version 1 and 2: Avalon, before scenarios.
    const s = raw as unknown as GameState & { v: number };
    const sc = avalon(s.seed);
    s.sc = sc;
    s.custom ??= [];
    s.nextLaw ??= 1;
    s.history ??= [];
    for (const l of allLaws(s)) s.laws[l.id] ??= l.start;
    // The election system law grew from two options to six.
    s.laws.electoralSystem = s.laws.electoralSystem === 1 ? 5 : 0;
    s.fx0 = lawEffects(avalonStart(s));
    s.calib = new Array(country(s).states.length * sc.parties.length).fill(0);
    // (Old saves' national swings already carry the parties' starting popularity, so no calibration.)
    s.houseR = s.house.map((id) => pol(s, id)?.state ?? 0);
    s.senateR = s.senate.map((id) => pol(s, id)?.state ?? 0);
    s.senateC = s.senate.map(() => 0);
    s.upperClass = 0;
    const presParty = pol(s, s.president)?.party ?? sc.parties[0].id;
    s.gov = { parties: [presParty], head: s.president, since: 0 };
    s.talks = null;
    s.presTerms = { [s.president]: 1 };
    s.lastMotion = -99;
    s.snapAt = -1;
    // The calendar: the old rules (every two years in week 45; President and Senate every four).
    const nextIn = (every: number) => {
      for (let y = 0; y < 12; y++) {
        const w = y * WEEKS + 44;
        if (w >= s.week && y % every === 0) return w;
      }
      return s.week + WEEKS * every;
    };
    s.cal = { lower: nextIn(2), upper: nextIn(4), pres: nextIn(4) };
    s.lastLower = Math.max(0, s.cal.lower - 2 * WEEKS);
    s.regionNext = country(s).states.map((_, k) => s.week + 1 + ((k * 7919 + 13) % (4 * WEEKS - 2)));
    // Elections counted under the old rules can't be shown again.
    s.election = null;
    s.lastElection = null;
    s.v = 3;
    initPolitics(s);
    initCampaign(s);
    return s as GameState;
  } catch {
    return null;
  }
}

/** The laws as they stood at the start of an Avalon game (for upgraded saves). */
function avalonStart(s: GameState): GameState {
  return { ...s, laws: Object.fromEntries(LAWS.map((l) => [l.id, l.start])), custom: [] };
}

export const committeeName = (law: LawDef) => COMMITTEES[law.committee - 1] ?? COMMITTEES[0];
export const houseBy = (s: GameState) => {
  const out: Record<PartyId, number> = Object.fromEntries(ids(s).map((id) => [id, 0]));
  for (const h of s.house) {
    const p = pol(s, h)?.party;
    if (p !== undefined) out[p] = (out[p] ?? 0) + 1;
  }
  return out;
};
export const senateBy = (s: GameState) => {
  const out: Record<PartyId, number> = Object.fromEntries(ids(s).map((id) => [id, 0]));
  for (const h of s.senate) {
    const p = pol(s, h)?.party;
    if (p !== undefined) out[p] = (out[p] ?? 0) + 1;
  }
  return out;
};
/** The offices the player holds, for the top bar. */
export const youHold = (s: GameState) => {
  const t = titles(s);
  const sy = sys(s);
  const out: string[] = [`${t.leader}, ${party(s, s.party).short}`];
  if (s.president === s.you) out.unshift(t.president);
  else if (s.gov.head === s.you && sy.exec !== "presidential") out.unshift(t.head);
  if (s.house.includes(s.you)) out.push(sy.lower.member);
  if (s.senate.includes(s.you)) out.push(sy.upper.member);
  return out;
};
/** A region's head's title ("Governor", "First Minister"). */
export const regionHead = (s: GameState, k: number) => {
  const t = titles(s);
  return t.regionHeads?.[country(s).states[k]?.key] ?? t.regionHead;
};
