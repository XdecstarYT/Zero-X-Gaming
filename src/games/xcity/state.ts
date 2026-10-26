import type { CivicKind, Crop, Parking, Pattern, RoadKind, Roof, Rules, Style, Use } from "./data";
import { Hash, type Pts } from "./geom";

/** A junction (or a dead end) in the road network. */
export interface RNode {
  id: number;
  x: number;
  z: number;
  edges: number[];
}

/** A road between two nodes, along a polyline. */
export interface REdge {
  id: number;
  a: number;
  b: number;
  kind: RoadKind;
  pts: Pts;
  len: number;
  bike: boolean;
  tram: boolean;
  name: string;
  /** Reaches the edge of the map (so people and goods can get in). */
  conn: boolean;
}

/** A plot facing a road: LOT_W of frontage, LOT_D deep. `side` is which side of the road. */
export interface Lot {
  id: number;
  edge: number;
  side: 1 | -1;
  /** Arc length along the edge at the middle of the frontage. */
  s: number;
  x: number;
  z: number;
  /** Unit vector along the road. */
  ux: number;
  uz: number;
  bld: number;
  district: number;
  /** Location value (1 is average): centrality, transit, parks, river. */
  loc: number;
}

export type BUse = "homes" | "mixed" | "shops" | "jobs" | "industry" | "civic" | "farm";
export type Form = "house" | "townhouse" | "walkup" | "midrise" | "highrise" | "tower" | "shop" | "office" | "workshop" | "civic" | "farmhouse";

/** What gets built: by a developer, an application, or the city's own design. */
export interface Plan {
  use: BUse;
  storeys: number;
  style: Style;
  roof: Roof;
  bay: boolean;
  color: string;
  parking: Parking;
  affordable: number;
  name: string;
  lots: number[];
  civic?: CivicKind;
}

export interface Building extends Plan {
  id: number;
  form: Form;
  homes: number;
  jobs: number;
  /** Footprint: centre, axis along the road, half sizes. */
  x: number;
  z: number;
  ux: number;
  uz: number;
  hw: number;
  hd: number;
  /** Which way the front faces (unit vector toward the road). */
  fx: number;
  fz: number;
  done: boolean;
  /** Construction progress 0..1. */
  progress: number;
  months: number;
  started: number;
  quality: number;
  city: boolean;
  seed: number;
}

export interface District {
  id: number;
  name: string;
  poly: Pts;
  use: Use;
  band: number;
  rules: Rules;
  crop?: Crop;
  pattern?: Pattern;
  created: number;
}

export type Lean = "yes" | "no";

/** A developer's application to build more than the zoning allows. */
export interface Application {
  id: number;
  dev: string;
  plan: Plan;
  submitted: number;
  homes: number;
  jobs: number;
  homesLost: number;
  jobsLost: number;
  /** Extra property tax a year once built. */
  tax: number;
  lean: Lean;
  reason: string;
  /** The zoning's limit, for the agenda. */
  zoned: number;
  /** Terms changed once already (they won't haggle twice). */
  changed: boolean;
  /** How keen the developer is: the margin they expect. */
  margin: number;
}

export interface NewsItem {
  month: number;
  text: string;
  kind: "info" | "good" | "bad" | "tip";
}

export interface History {
  month: number;
  pop: number;
  rent: number;
  homes: number;
  approval: number;
  money: number;
}

export interface Budget {
  tax: number;
  fees: number;
  farms: number;
  rents: number;
  roads: number;
  transit: number;
  civic: number;
  /** Police, fire, bins and the rest, per resident. */
  services: number;
  builds: number;
}

export interface Stats {
  pop: number;
  homes: number;
  households: number;
  jobs: number;
  shopJobs: number;
  officeJobs: number;
  industryJobs: number;
  farmJobs: number;
  civicJobs: number;
  building: number;
  value: number;
  /** Homes wanted beyond what's built. */
  homeDemand: number;
  jobDemand: number;
  shopDemand: number;
}

export interface State {
  v: 1;
  seed: number;
  rseed: number;
  name: string;
  month: number;
  /** Fraction of the month gone. */
  t: number;
  money: number;
  clout: number;
  /** Property tax, % of value a year. */
  taxRate: number;
  nodes: (RNode | null)[];
  edges: (REdge | null)[];
  lots: (Lot | null)[];
  buildings: (Building | null)[];
  districts: (District | null)[];
  apps: Application[];
  nextApp: number;
  river: Pts;
  riverHalf: number;
  households: number;
  rentIndex: number;
  regionPull: number;
  approval: number;
  /** Lingering approval effects from decisions, decaying each month. */
  mood: number;
  modes: { car: number; bike: number; transit: number; walk: number };
  congestion: number;
  history: History[];
  news: NewsItem[];
  milestone: number;
  stats: Stats;
  budget: Budget;
  homesBuilt: number;
  usedNames: Record<string, number>;
  /** Bumped whenever roads, lots, buildings or districts change (the renderer watches it). */
  rev: number;
  /** Bumped when only districts change. */
  zrev: number;
  over: boolean;
}

/** Lookups rebuilt from the state (never saved). */
export interface Index {
  edges: Hash;
  lots: Hash;
  /** Lots by edge. */
  byEdge: Map<number, Set<number>>;
}

const indexes = new WeakMap<State, Index>();

export function ix(s: State): Index {
  let i = indexes.get(s);
  if (!i) {
    i = { edges: new Hash(64), lots: new Hash(48), byEdge: new Map() };
    for (const e of s.edges) if (e) indexEdge(s, i, e);
    for (const l of s.lots) if (l) indexLot(i, l);
    indexes.set(s, i);
  }
  return i;
}

export function indexEdge(_s: State, i: Index, e: REdge) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (let k = 0; k < e.pts.length; k += 2) {
    x0 = Math.min(x0, e.pts[k]);
    x1 = Math.max(x1, e.pts[k]);
    z0 = Math.min(z0, e.pts[k + 1]);
    z1 = Math.max(z1, e.pts[k + 1]);
  }
  i.edges.add(e.id, x0 - 16, z0 - 16, x1 + 16, z1 + 16);
}

export function indexLot(i: Index, l: Lot) {
  i.lots.add(l.id, l.x - 20, l.z - 20, l.x + 20, l.z + 20);
  let set = i.byEdge.get(l.edge);
  if (!set) i.byEdge.set(l.edge, (set = new Set()));
  set.add(l.id);
}

export function unindexLot(i: Index, l: Lot) {
  i.lots.remove(l.id);
  i.byEdge.get(l.edge)?.delete(l.id);
}

/** The state's own seeded random (so a saved game carries on the same way). */
export function rand(s: State) {
  s.rseed = (s.rseed + 0x6d2b79f5) >>> 0;
  let t = s.rseed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const pick = <T,>(s: State, arr: readonly T[]) => arr[Math.floor(rand(s) * arr.length) % arr.length];

export function emptyStats(): Stats {
  return { pop: 0, homes: 0, households: 0, jobs: 0, shopJobs: 0, officeJobs: 0, industryJobs: 0, farmJobs: 0, civicJobs: 0, building: 0, value: 0, homeDemand: 0, jobDemand: 0, shopDemand: 0 };
}

export function emptyBudget(): Budget {
  return { tax: 0, fees: 0, farms: 0, rents: 0, roads: 0, transit: 0, civic: 0, services: 0, builds: 0 };
}

export function news(s: State, text: string, kind: NewsItem["kind"] = "info") {
  s.news.unshift({ month: s.month, text, kind });
  if (s.news.length > 40) s.news.length = 40;
}

export function dateLabel(month: number, months: readonly string[]) {
  return `${months[month % 12]}, Year ${Math.floor(month / 12) + 1}`;
}
