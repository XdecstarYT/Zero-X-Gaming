/**
 * WareForge real estate and construction. Buy land in the cities, design a building cell by cell
 * and storey by storey, get a planning permit, hire crews who lay it brick by brick from materials
 * you send from the warehouse (or have delivered straight to site), pass the inspections, then let
 * the flats, houses, shops and offices to tenants, keep them happy, borrow against it, or sell.
 *
 * Pure and seeded like the rest of the simulation; it lives on the state as `s.estate`.
 *
 * The model: a plot is a grid of 2 m cells. Every cell on every storey has a floor layer (a
 * foundation on the ground, a slab above, or a roof over the top) and a fill layer (a brick wall,
 * a window, a door or stairs, or nothing: open floor). Walls hold up the slab above them within
 * SPAN cells. Rooms are the open floor enclosed by walls; a room (or rooms joined by stairs) with a
 * way in through a door is a unit you can let. A hall with stairs that serves several units is
 * circulation, not a unit.
 */
import { CITIES, DAY, HOUR, ITEMS, MIN, SUPPLIERS, city, type ItemId } from "./data";
import { afford, alert, confirm, earn, freeStock, makeOrder, nid, pick, pop, purchaseCost, rand, ri, spend, type Order, type State } from "./sim";

/* ------------------------------------------------------------------ the land */

/** A cell is 2 m square; a storey is 3 m. */
export const CELL_M = 2;
export const CELL_M2 = CELL_M * CELL_M;
/** A slab or a roof can reach this many cells (6 m) from the wall that holds it up. */
export const SPAN = 3;

export type Zone = "residential" | "commercial" | "mixed";
export const ZONES: Record<Zone, { name: string; icon: string; blurb: string }> = {
  residential: { name: "Residential", icon: "🏠", blurb: "Flats, and houses over several storeys." },
  commercial: { name: "Commercial", icon: "🏢", blurb: "Shops on the street, offices above." },
  mixed: { name: "Mixed use", icon: "🏙️", blurb: "Shops on the ground floor, flats above." },
};

export interface PlotDef {
  id: string;
  city: string;
  address: string;
  /** Cells across (along the street) and deep. */
  w: number;
  d: number;
  zone: Zone;
  /** How many storeys the zoning allows. */
  storeys: number;
}

export const PLOTS: PlotDef[] = [
  { id: "ny1", city: "New York", address: "18 Hudson Street", w: 10, d: 8, zone: "mixed", storeys: 8 },
  { id: "ny2", city: "New York", address: "5 Bleecker Row", w: 7, d: 6, zone: "residential", storeys: 6 },
  { id: "ph1", city: "Philadelphia", address: "220 Market Street", w: 10, d: 8, zone: "commercial", storeys: 6 },
  { id: "ph2", city: "Philadelphia", address: "14 Elfreth's Alley", w: 6, d: 5, zone: "residential", storeys: 3 },
  { id: "bo1", city: "Boston", address: "9 Beacon Street", w: 8, d: 6, zone: "residential", storeys: 5 },
  { id: "bo2", city: "Boston", address: "40 Harbor Wharf", w: 10, d: 8, zone: "mixed", storeys: 6 },
  { id: "dc1", city: "Washington", address: "1200 K Street", w: 10, d: 8, zone: "commercial", storeys: 6 },
  { id: "dc2", city: "Washington", address: "33 Capitol Mews", w: 7, d: 6, zone: "residential", storeys: 4 },
  { id: "ba1", city: "Baltimore", address: "7 Fells Point Road", w: 8, d: 6, zone: "mixed", storeys: 4 },
  { id: "nw1", city: "Newark", address: "88 Broad Street", w: 9, d: 7, zone: "commercial", storeys: 5 },
  { id: "pi1", city: "Pittsburgh", address: "3 Steel Mill Lane", w: 8, d: 7, zone: "mixed", storeys: 4 },
  { id: "ha1", city: "Hartford", address: "21 Elm Grove", w: 7, d: 6, zone: "residential", storeys: 3 },
  { id: "ri1", city: "Richmond", address: "50 Canal Walk", w: 8, d: 6, zone: "mixed", storeys: 4 },
  { id: "al1", city: "Albany", address: "12 State Street", w: 7, d: 6, zone: "residential", storeys: 3 },
  { id: "bu1", city: "Buffalo", address: "64 Lakefront Drive", w: 9, d: 7, zone: "residential", storeys: 4 },
  { id: "cl1", city: "Cleveland", address: "15 Euclid Avenue", w: 9, d: 7, zone: "commercial", storeys: 4 },
  { id: "pr1", city: "Providence", address: "6 Federal Hill", w: 7, d: 5, zone: "residential", storeys: 3 },
];
export const plotDef = (id: string) => PLOTS.find((p) => p.id === id) ?? PLOTS[0];

/* ------------------------------------------------------------------ what a building is made of */

export type PartKind = "found" | "slab" | "roof" | "wall" | "window" | "door" | "stairs";
export type Trade = "concrete" | "brick" | "carpentry" | "roofing";

export interface PartStage {
  trade: Trade;
  /** Bricks to lay (bricklayers) or gang-minutes of work (everyone else). */
  work: number;
  /** Pallets of materials it uses, taken from the site's stock when the work starts. */
  mats: Partial<Record<ItemId, number>>;
}
export interface PartDef {
  kind: PartKind;
  name: string;
  icon: string;
  layer: "floor" | "fill";
  blurb: string;
  stages: PartStage[];
}

export const PARTS: Record<PartKind, PartDef> = {
  found: {
    kind: "found", name: "Foundation", icon: "⬛", layer: "floor",
    blurb: "A reinforced concrete pad on the ground: everything stands on these.",
    stages: [{ trade: "concrete", work: 20, mats: { concrete: 0.18, cement: 0.04 } }],
  },
  slab: {
    kind: "slab", name: "Floor slab", icon: "▭", layer: "floor",
    blurb: "A concrete floor on steel beams for the storey above. A wall on the storey below must be within three cells (6 m) to hold it up.",
    stages: [{ trade: "concrete", work: 25, mats: { concrete: 0.15, beams: 0.05 } }],
  },
  roof: {
    kind: "roof", name: "Roof", icon: "🟥", layer: "floor",
    blurb: "Timber and clay tiles over the top storey: a room needs a roof (or a floor) over it to be let. Needs a wall below within 6 m.",
    stages: [{ trade: "roofing", work: 20, mats: { rooftiles: 0.2, wood: 0.06 } }],
  },
  wall: {
    kind: "wall", name: "Brick wall", icon: "🧱", layer: "fill",
    blurb: "300 bricks laid course by course. Walls hold up the floors above and divide the rooms.",
    stages: [{ trade: "brick", work: 300, mats: { bricks: 0.4, cement: 0.04 } }],
  },
  window: {
    kind: "window", name: "Window", icon: "🪟", layer: "fill",
    blurb: "A wall with a glazed opening: 150 bricks, then a frame and glass. Only in outside walls. Light lets for more.",
    stages: [
      { trade: "brick", work: 150, mats: { bricks: 0.2, cement: 0.02 } },
      { trade: "carpentry", work: 20, mats: { glass: 0.1, wood: 0.03 } },
    ],
  },
  door: {
    kind: "door", name: "Door", icon: "🚪", layer: "fill",
    blurb: "A doorway with a lintel, and a timber door hung in it. Every unit needs one: from the street, or from a hall.",
    stages: [
      { trade: "brick", work: 120, mats: { bricks: 0.16, cement: 0.02 } },
      { trade: "carpentry", work: 15, mats: { wood: 0.1 } },
    ],
  },
  stairs: {
    kind: "stairs", name: "Stairs", icon: "🪜", layer: "fill",
    blurb: "A concrete flight up to the storey above. Upper storeys need stairs to be reached.",
    stages: [{ trade: "concrete", work: 40, mats: { concrete: 0.12, beams: 0.03 } }],
  },
};
export const PART_KINDS = Object.keys(PARTS) as PartKind[];
/** Walls, windows and doors hold up the floor above them. */
export const loadBearing = (k: PartKind) => k === "wall" || k === "window" || k === "door";

export const TRADES: Record<Trade, { name: string; icon: string; wage: number; rate: number; blurb: string }> = {
  concrete: { name: "Concrete crew", icon: "🚧", wage: 55, rate: 1, blurb: "Pours foundations, slabs and stairs." },
  brick: { name: "Bricklayers", icon: "🧱", wage: 45, rate: 6, blurb: "Lay walls, and the brickwork round windows and doors: 6 bricks a minute a gang." },
  carpentry: { name: "Carpenters & glaziers", icon: "🪚", wage: 40, rate: 1, blurb: "Fit window frames and glass, and hang doors." },
  roofing: { name: "Roofers", icon: "🏠", wage: 45, rate: 1, blurb: "Lay the roof timbers and tiles." },
};
export const TRADE_IDS = Object.keys(TRADES) as Trade[];
/** Crews come standard, skilled or master: dearer, quicker, and better work (inspections pass, tenants pay more). */
export const TIERS = [
  { name: "Standard", wage: 1, speed: 1, q: 0.86 },
  { name: "Skilled", wage: 1.4, speed: 1.3, q: 0.93 },
  { name: "Master", wage: 1.9, speed: 1.6, q: 0.985 },
] as const;
export const MAX_GANGS = 4;
/** Crews work 07:00–18:00, or 06:00–22:00 on overtime (time and a half for the extra hours). */
export const WORK_HOURS: [number, number] = [7, 18];
export const OVERTIME_HOURS: [number, number] = [6, 22];

/* ------------------------------------------------------------------ money */

export const LAND_PER_CELL = 900;
/** Rent an hour in an average city: RENT_BASE × area^RENT_EXP (bigger units rent for a little less a square metre). */
export const RENT_BASE = 1.25;
export const RENT_EXP = 0.85;
/** A let building is worth this many days of its market rent. */
export const VALUE_DAYS = 22;
export const PERMIT = { base: 1_000, perStorey: 500, hours: [3, 6] as [number, number] };
/** A height variance: two more storeys than the zoning allows, if the planners agree. */
export const VARIANCE = { cost: 6_000, hours: 8, chance: 0.45, storeys: 2 };
export const INSPECTION_FEE = 300;
/** Materials straight from the supplier to site: dearer than sending your own. */
export const DIRECT = { markup: 1.1, fee: 250 };
export const MORTGAGE = { ltv: 0.6, rate: 0.012 };
/** Property tax and insurance, a share of the value a day. */
export const TAX = 0.002;
export const INSURANCE = 0.0008;
export const AGENT_FEE = 0.08;
export const SALE_FEE = 0.02;
export const QUICK_SALE = 0.88;
export const EVICT_FEE = 500;
export const DEMOLISH = 150;
export const MAX_PROPS = 8;

/* ------------------------------------------------------------------ the state */

export interface Part {
  k: PartKind;
  x: number;
  z: number;
  /** The storey (0 the ground; a roof sits on the storey above the last). */
  l: number;
  /** The stage under way (equal to the number of stages once it's built), and how far through it. */
  stage: number;
  prog: number;
  /** The current stage's materials have been taken from the site's stock. */
  paid: boolean;
  done?: boolean;
  /** How good the work was (0.6–1), once built. */
  q?: number;
}

export interface Crew {
  gangs: number;
  tier: number;
}

export interface Tenant {
  name: string;
  kind: "household" | "business";
  since: number;
  /** The lease runs to here; then they renew or go. */
  until: number;
  happy: number;
  /** Hours of rent owed. */
  owed: number;
}

export interface Request {
  unit: string;
  text: string;
  at: number;
  cost: number;
}

export interface Inspection {
  kind: "foundation" | "frame" | "final";
  level: number;
  at: number;
}

export interface Property {
  id: number;
  plot: string;
  bought: number;
  /** What the land cost. */
  land: number;
  parts: Part[];
  /** Bumped when a part is added or taken away. */
  rev: number;
  permit: "none" | "pending" | "granted";
  permitAt: number;
  /** Storeys allowed (the zoning, plus a variance if granted). */
  storeys: number;
  variance: "none" | "pending" | "granted" | "refused";
  varianceAt: number;
  crews: Partial<Record<Trade, Crew>>;
  overtime: boolean;
  /** Materials on site, in pallets. */
  stock: Partial<Record<ItemId, number>>;
  /** Straight-to-site deliveries on their way. */
  deliveries: { item: ItemId; n: number; at: number }[];
  autoSupply: boolean;
  /** Spent on the building so far (materials used, wages, fees): its book value. */
  spent: number;
  bricks: number;
  inspections: Inspection[];
  passed: string[];
  /** Passed its final inspection: units can be let. */
  cert: boolean;
  condition: number;
  /** Rents against the market (0.7–1.5). */
  rentLevel: number;
  agent: boolean;
  insured: boolean;
  /** Let room by room (flats, shops and offices off halls), or the whole building as one. */
  letAs: "units" | "whole";
  tenants: Record<string, Tenant>;
  requests: Request[];
  mortgage: number;
  sale: { ask: number; offer: number; offerUntil: number } | null;
  rentToday: number;
  rentTotal: number;
  /** What the crews last waited for. */
  short: ItemId[];
  log: { t: number; text: string }[];
}

export type Template = "house" | "terrace" | "apartments" | "shops" | "offices";

export interface Listing {
  id: number;
  plot: string;
  tpl: Template;
  storeys: number;
  condition: number;
  price: number;
  until: number;
  /** Share of the units let when you buy. */
  let: number;
}

export interface Estate {
  props: Property[];
  /** House prices by city (1 is normal), drifting every day. */
  index: Record<string, number>;
  listings: Listing[];
}

export const newEstate = (): Estate => ({ props: [], index: Object.fromEntries(CITIES.map((c) => [c.name, 1])), listings: [] });

/* ------------------------------------------------------------------ finding parts */

const cellKey = (x: number, z: number, l: number) => l * 10_000 + z * 100 + x;
const caches = new WeakMap<Property, { rev: number; n: number; floor: Map<number, Part>; fill: Map<number, Part> }>();

function index(p: Property) {
  const c = caches.get(p);
  if (c && c.rev === p.rev && c.n === p.parts.length) return c;
  const floor = new Map<number, Part>();
  const fill = new Map<number, Part>();
  for (const part of p.parts) (PARTS[part.k].layer === "floor" ? floor : fill).set(cellKey(part.x, part.z, part.l), part);
  const out = { rev: p.rev, n: p.parts.length, floor, fill };
  caches.set(p, out);
  return out;
}
export const floorAt = (p: Property, x: number, z: number, l: number) => index(p).floor.get(cellKey(x, z, l));
export const fillAt = (p: Property, x: number, z: number, l: number) => index(p).fill.get(cellKey(x, z, l));
export const prop = (s: State, id: number) => s.estate.props.find((p) => p.id === id);
const touched = (part: Part) => part.paid || part.prog > 0 || part.stage > 0 || !!part.done;
/** The highest storey with anything planned on it (−1 for none). */
export const topLevel = (p: Property) => p.parts.reduce((a, part) => Math.max(a, part.l), -1);
const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Is there a load-bearing wall on storey `l` within SPAN of (x, z)? (Built ones only, if `built`.) */
function wallNear(p: Property, x: number, z: number, l: number, built = false) {
  const plot = plotDef(p.plot);
  for (let dz = -SPAN; dz <= SPAN; dz++)
    for (let dx = -SPAN; dx <= SPAN; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= plot.w || nz >= plot.d) continue;
      const f = fillAt(p, nx, nz, l);
      if (f && loadBearing(f.k) && (!built || f.done)) return true;
    }
  return false;
}

/** Does (x, z) on storey `l` face the outside (the plot edge, or a cell with no floor)? */
function facesOut(p: Property, x: number, z: number, l: number) {
  const plot = plotDef(p.plot);
  return N4.some(([dx, dz]) => {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= plot.w || nz >= plot.d) return true;
    const f = floorAt(p, nx, nz, l);
    return !f || f.k === "roof";
  });
}

/** Why a part can't stand here, structurally (null if it can). */
function structureError(p: Property, kind: PartKind, x: number, z: number, l: number): string | null {
  const plot = plotDef(p.plot);
  if (x < 0 || z < 0 || x >= plot.w || z >= plot.d || l < 0) return "Off the plot";
  const top = p.storeys;
  if (PARTS[kind].layer === "floor") {
    if (l > top || (l === top && kind !== "roof")) return `Zoned for ${top} storeys here`;
    if (l === 0) return kind === "found" ? null : "The ground floor needs foundations";
    if (kind === "found") return "Foundations go on the ground";
    const below = floorAt(p, x, z, l - 1);
    if (!below || below.k === "roof") return "Nothing below to build on";
    if (!wallNear(p, x, z, l - 1)) return "Needs a wall on the storey below within 6 m to hold it up";
    return null;
  }
  if (l >= top) return `Zoned for ${top} storeys here`;
  const f = floorAt(p, x, z, l);
  if (!f || f.k === "roof") return "Lay a floor here first (a foundation, or a slab upstairs)";
  if (kind === "window" && !facesOut(p, x, z, l)) return "Windows go in outside walls";
  if (kind === "stairs" && l + 1 >= top) return "No storey above for the stairs to reach";
  return null;
}

/** Why this part can't be planned here (null if it can). */
export function planError(s: State, id: number, kind: PartKind, x: number, z: number, l: number): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  const err = structureError(p, kind, x, z, l);
  if (err) return err;
  const cur = PARTS[kind].layer === "floor" ? floorAt(p, x, z, l) : fillAt(p, x, z, l);
  if (cur && touched(cur)) return cur.k === kind ? "Already built" : "Something's built here: demolish it first";
  if (cur && cur.k === kind) return "Already planned";
  return null;
}

/** Plan a part (it replaces anything not yet started in the same place). */
export function plan(s: State, id: number, kind: PartKind, x: number, z: number, l: number): string | null {
  const err = planError(s, id, kind, x, z, l);
  if (err) return err;
  const p = prop(s, id)!;
  const cur = PARTS[kind].layer === "floor" ? floorAt(p, x, z, l) : fillAt(p, x, z, l);
  if (cur) p.parts.splice(p.parts.indexOf(cur), 1);
  p.parts.push({ k: kind, x, z, l, stage: 0, prog: 0, paid: false });
  p.rev++;
  return null;
}

/** Anything in the plan that no longer stands up (after taking something away). */
function unsound(p: Property) {
  return p.parts.find((part) => structureError(p, part.k, part.x, part.z, part.l) !== null) ?? null;
}

/**
 * Take a part out: the fill on a cell first, else its floor. Planned parts just go; started or
 * built ones are demolished (a fee, and the materials are lost). Nothing that rests on it may be left
 * standing: take those out first.
 */
export function unplan(s: State, id: number, x: number, z: number, l: number): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  const part = fillAt(p, x, z, l) ?? floorAt(p, x, z, l);
  if (!part) return "Nothing here";
  const i = p.parts.indexOf(part);
  p.parts.splice(i, 1);
  p.rev++;
  const bad = unsound(p);
  if (bad) {
    p.parts.splice(i, 0, part);
    p.rev++;
    return `The ${PARTS[bad.k].name.toLowerCase()} on it would fall: take that out first`;
  }
  if (touched(part)) {
    spend(s, DEMOLISH, "estate");
    p.spent = Math.max(0, p.spent - partValue(part));
    note(p, s, `Demolished a ${PARTS[part.k].name.toLowerCase()}`);
  }
  return null;
}

/** What a part's materials are worth at list price. */
function partValue(part: Part) {
  let v = 0;
  PARTS[part.k].stages.forEach((st, i) => {
    if (i < part.stage || (i === part.stage && part.paid)) for (const [item, n] of Object.entries(st.mats) as [ItemId, number][]) v += ITEMS[item].price * n;
  });
  return v;
}

/** Plan a rectangle of a part: filled (floors, roofs), or just its outline (walls). Returns how many went in, and the first problem. */
export function planRect(s: State, id: number, kind: PartKind, x0: number, z0: number, x1: number, z1: number, l: number, outline = false) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
  let placed = 0;
  let error: string | null = null;
  for (let z = az; z <= bz; z++)
    for (let x = ax; x <= bx; x++) {
      if (outline && x !== ax && x !== bx && z !== az && z !== bz) continue;
      const e = plan(s, id, kind, x, z, l);
      if (!e) placed++;
      else if (!error && e !== "Already planned" && e !== "Already built") error = e;
    }
  return { placed, error };
}

/** Copy a storey up: slabs over the floor below, then its walls, windows, doors and stairs on top. */
export function copyUp(s: State, id: number, l: number) {
  const p = prop(s, id);
  if (!p || l < 1) return { placed: 0, error: "Nothing below to copy" };
  const below = p.parts.filter((part) => part.l === l - 1);
  let placed = 0;
  let error: string | null = null;
  const tryPlan = (k: PartKind, x: number, z: number) => {
    const e = plan(s, id, k, x, z, l);
    if (!e) placed++;
    else if (!error && e !== "Already planned" && e !== "Already built") error = e;
  };
  for (const part of below) if (part.k === "found" || part.k === "slab") tryPlan("slab", part.x, part.z);
  for (const part of below) if (PARTS[part.k].layer === "fill" && (part.k !== "stairs" || l + 1 < p.storeys)) tryPlan(part.k, part.x, part.z);
  return { placed, error };
}

/** Put a roof over every top floor. */
export function roofOver(s: State, id: number) {
  const p = prop(s, id);
  if (!p) return { placed: 0, error: "No such property" };
  let placed = 0;
  let error: string | null = null;
  for (const part of [...p.parts]) {
    if (part.k !== "found" && part.k !== "slab") continue;
    if (floorAt(p, part.x, part.z, part.l + 1)) continue;
    const e = plan(s, id, "roof", part.x, part.z, part.l + 1);
    if (!e) placed++;
    else if (!error) error = e;
  }
  return { placed, error };
}

/* ------------------------------------------------------------------ ready-made designs */

export const TEMPLATES: Record<Template, { name: string; icon: string; blurb: string; zones: Zone[] }> = {
  house: { name: "Detached house", icon: "🏡", blurb: "One family house over two storeys: a front door, an inside staircase, windows all round.", zones: ["residential"] },
  terrace: { name: "Terraced houses", icon: "🏘️", blurb: "A row of narrow houses side by side, each with its own front door and stairs.", zones: ["residential", "mixed"] },
  apartments: { name: "Apartment block", icon: "🏬", blurb: "A stair hall up the middle with four flats on every storey.", zones: ["residential", "mixed"] },
  shops: { name: "Shops with flats over", icon: "🏪", blurb: "Shop fronts on the street, a stair hall, and flats above.", zones: ["mixed", "commercial"] },
  offices: { name: "Office block", icon: "🏢", blurb: "Open-plan floors either side of a stair core, glazed all round.", zones: ["commercial", "mixed"] },
};

type Spec = { k: PartKind; x: number; z: number; l: number };

/** A design for a plot: the parts of every storey, foundations up to the roof. */
export function design(plot: PlotDef, tpl: Template, storeys: number): Spec[] {
  const W = plot.w;
  const D = plot.d;
  const n = Math.max(1, Math.min(storeys, plot.storeys));
  const out: Spec[] = [];
  const fills = new Map<number, PartKind>();
  const set = (k: PartKind, x: number, z: number, l: number) => fills.set(cellKey(x, z, l), k);
  const perim = (x: number, z: number) => x === 0 || z === 0 || x === W - 1 || z === D - 1;
  const corner = (x: number, z: number) => (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
  // Outside walls everywhere, glazed every other cell (not at corners or where an inside wall meets them).
  const shell = (l: number, glazed = 0.5) => {
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        if (!perim(x, z)) continue;
        const along = z === 0 || z === D - 1 ? x : z;
        const win = !corner(x, z) && (glazed >= 1 ? true : along % 2 === 1);
        set(win ? "window" : "wall", x, z, l);
      }
  };
  const hx = Math.floor(W / 2);
  const midZ = 1 + Math.floor((D - 2) / 2);
  for (let l = 0; l < n; l++) {
    if (tpl === "house") {
      shell(l);
      // A wall across the middle with a door through it; stairs at the back.
      for (let x = 1; x < W - 1; x++) set(x === hx ? "door" : "wall", x, midZ, l);
      if (l + 1 < n) set("stairs", 1, 1, l);
      if (l === 0) set("door", hx, D - 1, 0);
    } else if (tpl === "terrace") {
      shell(l);
      // Houses three cells wide between party walls.
      const walls: number[] = [];
      for (let x = 4; x < W - 2; x += 4) walls.push(x);
      for (const wx of walls) for (let z = 1; z < D - 1; z++) set("wall", wx, z, l);
      const bounds = [0, ...walls, W - 1];
      for (let i = 0; i + 1 < bounds.length; i++) {
        const a = bounds[i] + 1;
        const b = bounds[i + 1] - 1;
        if (b < a) continue;
        if (l + 1 < n) set("stairs", a, 1, l);
        if (l === 0) set("door", Math.min(b, a + 1), D - 1, 0);
        for (const wx of [bounds[i], bounds[i + 1]]) if (wx > 0 && wx < W - 1) set("wall", wx, D - 1, l);
      }
    } else {
      // A stair hall running front to back (up the middle on a wide plot, down one side on a narrow
      // one), with units off it; deep plots split each side into a front and a back unit.
      shell(l, tpl === "offices" ? 1 : 0.5);
      const central = W - 2 >= 8;
      const hall = central ? hx : 1;
      const hallWalls = central ? [hall - 1, hall + 1] : [hall + 1];
      const sides: [number, number][] = central ? [[1, hall - 2], [hall + 2, W - 2]] : [[hall + 2, W - 2]];
      const shopFloor = tpl === "shops" && l === 0;
      const split = tpl !== "offices" && !shopFloor && D - 2 >= 6;
      const halves: [number, number][] = split ? [[1, midZ - 1], [midZ + 1, D - 2]] : [[1, D - 2]];
      for (const wx of hallWalls) {
        for (let z = 0; z < D; z++) set("wall", wx, z, l);
        // A door from the hall into each unit on that side.
        for (const [z0, z1] of halves) set("door", wx, Math.floor((z0 + z1) / 2), l);
      }
      set(l === 0 ? "door" : "window", hall, D - 1, l);
      set("wall", hall, 0, l);
      if (l + 1 < n) set("stairs", hall, 1, l);
      if (split) for (const [a, b] of sides) for (let x = a; x <= b; x++) set("wall", x, midZ, l);
      // Shops open onto the street as well.
      if (shopFloor) for (const [a, b] of sides) set("door", Math.floor((a + b) / 2), D - 1, 0);
    }
  }
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) out.push({ k: "found", x, z, l: 0 });
  for (let l = 0; l < n; l++) {
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        const k = fills.get(cellKey(x, z, l));
        if (k) out.push({ k, x, z, l });
      }
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) out.push({ k: l + 1 < n ? "slab" : "roof", x, z, l: l + 1 });
  }
  return out;
}

/** Replace the plan (anything not yet started) with a ready-made design. */
export function applyTemplate(s: State, id: number, tpl: Template, storeys: number): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  if (p.parts.some(touched)) return "Building's under way: add to it piece by piece instead";
  const plot = plotDef(p.plot);
  if (!TEMPLATES[tpl].zones.includes(plot.zone)) return `Not allowed in a ${ZONES[plot.zone].name.toLowerCase()} zone`;
  p.parts = [];
  p.rev++;
  p.letAs = tpl === "house" ? "whole" : "units";
  for (const sp of design(plot, tpl, Math.min(storeys, p.storeys))) plan(s, id, sp.k, sp.x, sp.z, sp.l);
  note(p, s, `Plans drawn up: ${TEMPLATES[tpl].name.toLowerCase()}, ${Math.min(storeys, p.storeys)} storeys`);
  return null;
}

/** Clear everything not yet started from the plan. */
export function clearPlan(s: State, id: number) {
  const p = prop(s, id);
  if (!p) return;
  const keep = p.parts.filter(touched);
  p.parts = keep;
  p.rev++;
  // Take away anything left that can't stand without what went.
  for (let bad = unsound(p); bad; bad = unsound(p)) {
    p.parts.splice(p.parts.indexOf(bad), 1);
    p.rev++;
  }
}

/* ------------------------------------------------------------------ rooms and units */

export type UnitType = "flat" | "house" | "shop" | "office";
export const UNIT_TYPES: Record<UnitType, { name: string; icon: string; factor: number; tenant: Tenant["kind"] }> = {
  flat: { name: "Flat", icon: "🛋️", factor: 1, tenant: "household" },
  house: { name: "House", icon: "🏡", factor: 1.05, tenant: "household" },
  shop: { name: "Shop", icon: "🏪", factor: 1.3, tenant: "business" },
  office: { name: "Office", icon: "💼", factor: 1.1, tenant: "business" },
};

export interface Unit {
  key: string;
  type: UnitType;
  /** Cells of floor (each 4 m²). */
  cells: number;
  area: number;
  levels: number[];
  windows: number;
  /** The cells, as l*10000 + z*100 + x (for the renderer). */
  keys: number[];
}

export interface Layout {
  units: Unit[];
  halls: number;
  /** Rooms that can't be let yet, and why. */
  problems: string[];
}

const layouts = new WeakMap<Property, { key: string; built: Layout; planned: Layout }>();

/** The units a building has (built parts only), or will have (the whole plan). */
export function units(p: Property, planned = false): Layout {
  const doneN = p.parts.reduce((a, part) => a + (part.done ? 1 : 0), 0);
  const k = `${p.rev}|${p.parts.length}|${doneN}`;
  let c = layouts.get(p);
  if (!c || c.key !== k) {
    c = { key: k, built: computeUnits(p, true), planned: computeUnits(p, false) };
    layouts.set(p, c);
  }
  return planned ? c.planned : c.built;
}

function computeUnits(p: Property, built: boolean): Layout {
  const plot = plotDef(p.plot);
  const W = plot.w;
  const D = plot.d;
  const L = topLevel(p) + 1;
  const empty: Layout = { units: [], halls: 0, problems: [] };
  if (L <= 0) return empty;
  const ok = (part: Part | undefined): part is Part => !!part && (!built || !!part.done);
  const hasFloor = (x: number, z: number, l: number) => {
    const f = floorAt(p, x, z, l);
    return ok(f) && f.k !== "roof";
  };
  const passable = (x: number, z: number, l: number) => {
    if (!hasFloor(x, z, l)) return false;
    const f = fillAt(p, x, z, l);
    return !ok(f) || f.k === "stairs";
  };
  const region = new Int32Array(L * W * D).fill(-1);
  const at = (x: number, z: number, l: number) => (l * D + z) * W + x;
  const regs: { l: number; cells: number[]; open: boolean; covered: boolean; stairs: boolean }[] = [];
  for (let l = 0; l < L; l++)
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        if (region[at(x, z, l)] >= 0 || !passable(x, z, l)) continue;
        const id = regs.length;
        const r = { l, cells: [] as number[], open: false, covered: true, stairs: false };
        regs.push(r);
        const stack: [number, number][] = [[x, z]];
        region[at(x, z, l)] = id;
        while (stack.length) {
          const [cx, cz] = stack.pop()!;
          r.cells.push(cellKey(cx, cz, l));
          const f = fillAt(p, cx, cz, l);
          if (ok(f) && f.k === "stairs") r.stairs = true;
          const over = floorAt(p, cx, cz, l + 1);
          if (!ok(over)) r.covered = false;
          for (const [dx, dz] of N4) {
            const nx = cx + dx;
            const nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= D || !hasFloor(nx, nz, l)) {
              r.open = true;
              continue;
            }
            if (!passable(nx, nz, l)) continue;
            if (region[at(nx, nz, l)] >= 0) continue;
            region[at(nx, nz, l)] = id;
            stack.push([nx, nz]);
          }
        }
      }
  // Rooms joined by stairs are one stack (a house over three storeys, or a stair hall).
  const parent = regs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (const part of p.parts) {
    if (part.k !== "stairs" || !ok(part) || part.l + 1 >= L) continue;
    const a = region[at(part.x, part.z, part.l)];
    const b = region[at(part.x, part.z, part.l + 1)];
    if (a >= 0 && b >= 0) union(a, b);
  }
  // Doors join a stack to the street (on the ground) or to the stack on the other side.
  const OUT = -2;
  const links = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (a === b) return;
    (links.get(a) ?? links.set(a, new Set()).get(a)!).add(b);
    (links.get(b) ?? links.set(b, new Set()).get(b)!).add(a);
  };
  const side = (x: number, z: number, l: number): number | null => {
    if (x < 0 || z < 0 || x >= W || z >= D || !hasFloor(x, z, l)) return l === 0 ? OUT : null;
    const r = region[at(x, z, l)];
    return r >= 0 ? find(r) : null;
  };
  for (const part of p.parts) {
    if (part.k !== "door" || !ok(part)) continue;
    for (const [[ax, az], [bx, bz]] of [[[1, 0], [-1, 0]], [[0, 1], [0, -1]]] as [[number, number], [number, number]][]) {
      const a = side(part.x + ax, part.z + az, part.l);
      const b = side(part.x + bx, part.z + bz, part.l);
      if (a !== null && b !== null) link(a, b);
    }
  }
  const stacks = new Map<number, { regs: number[]; cells: number; open: boolean; covered: boolean }>();
  regs.forEach((r, i) => {
    const g = find(i);
    const e = stacks.get(g) ?? { regs: [], cells: 0, open: false, covered: true };
    e.regs.push(i);
    e.cells += r.cells.length;
    e.open ||= r.open;
    e.covered &&= r.covered;
    stacks.set(g, e);
  });
  const near = (g: number) => [...(links.get(g) ?? [])];
  // Halls: a stack you come into from the street (or from another hall) that has doors to two or more
  // rooms. Let as one, the whole building is a single unit: there are no halls.
  const halls = new Set<number>();
  if (p.letAs !== "whole")
    for (let grew = true; grew; ) {
      grew = false;
      for (const g of stacks.keys()) {
        if (halls.has(g)) continue;
        const ns = near(g);
        if (ns.filter((n) => n !== OUT && !halls.has(n)).length >= 2 && ns.some((n) => n === OUT || halls.has(n))) {
          halls.add(g);
          grew = true;
        }
      }
    }
  // Units: stacks joined by doors (not through a hall), and in from the street or a hall.
  const uParent = new Map<number, number>();
  const uf = (g: number): number => {
    const q = uParent.get(g) ?? g;
    if (q === g) return g;
    const r = uf(q);
    uParent.set(g, r);
    return r;
  };
  for (const g of stacks.keys()) if (!halls.has(g)) for (const n of near(g)) if (n !== OUT && !halls.has(n)) uParent.set(uf(n), uf(g));
  const groups = new Map<number, number[]>();
  for (const g of stacks.keys()) if (!halls.has(g)) (groups.get(uf(g)) ?? groups.set(uf(g), []).get(uf(g))!).push(g);
  const zone = plot.zone;
  const out: Layout = { units: [], halls: halls.size, problems: [] };
  for (const members of groups.values()) {
    const rs = members.flatMap((g) => stacks.get(g)!.regs);
    const cells = members.reduce((a, g) => a + stacks.get(g)!.cells, 0);
    const levels = [...new Set(rs.map((i) => regs[i].l))].sort((a, b) => a - b);
    const where = levels[0] === 0 ? "Ground floor" : `Storey ${levels[0] + 1}`;
    if (cells < 3) continue;
    if (members.some((g) => stacks.get(g)!.open)) {
      out.problems.push(`${where}: a room isn't walled in all round`);
      continue;
    }
    if (members.some((g) => !stacks.get(g)!.covered)) {
      out.problems.push(`${where}: a room has no floor or roof over it`);
      continue;
    }
    if (!members.some((g) => near(g).some((n) => n === OUT || halls.has(n)))) {
      out.problems.push(`${where}: a room has no door in (from the street or a hall)`);
      continue;
    }
    const keys = rs.flatMap((i) => regs[i].cells);
    const cellSet = new Set(keys);
    const wins = new Set<number>();
    for (const ck of keys) {
      const l = Math.floor(ck / 10_000);
      const z = Math.floor((ck % 10_000) / 100);
      const x = ck % 100;
      for (const [dx, dz] of N4) {
        const f = fillAt(p, x + dx, z + dz, l);
        if (ok(f) && f.k === "window" && !cellSet.has(cellKey(x + dx, z + dz, l))) wins.add(cellKey(x + dx, z + dz, l));
      }
    }
    const multi = levels.length > 1;
    const type: UnitType =
      zone === "commercial" ? (levels[0] === 0 ? "shop" : "office") : multi ? "house" : zone === "residential" ? "flat" : levels[0] === 0 ? "shop" : "flat";
    out.units.push({ key: `u${Math.min(...keys)}`, type, cells, area: cells * CELL_M2, levels, windows: wins.size, keys });
  }
  out.units.sort((a, b) => a.levels[0] - b.levels[0] || Math.min(...a.keys) - Math.min(...b.keys));
  return out;
}

/* ------------------------------------------------------------------ worth and rent */

/** How good the building work is, on average (0.6–1). */
export function quality(p: Property) {
  const done = p.parts.filter((part) => part.done);
  return done.length ? done.reduce((a, part) => a + (part.q ?? 0.9), 0) / done.length : 0.9;
}

export const cityIndex = (s: State, name: string) => s.estate.index[name] ?? 1;

/** What the land under a plot is worth today. */
export const landValue = (s: State, plot: PlotDef) => Math.round(plot.w * plot.d * LAND_PER_CELL * Math.pow(city(plot.city).pop, 1.5) * cityIndex(s, plot.city));

/** The market rent for a unit, an hour. */
export function marketRent(s: State, p: Property, u: Unit) {
  const plot = plotDef(p.plot);
  const q = Math.max(0.7, Math.min(1.25, 0.75 + (2.5 * (quality(p) - 0.8))));
  const light = 0.85 + 0.3 * Math.min(1, u.windows / Math.max(1, u.cells / 4));
  return Math.pow(u.area, RENT_EXP) * RENT_BASE * Math.pow(city(plot.city).pop, 0.7) * cityIndex(s, plot.city) * UNIT_TYPES[u.type].factor * q * light * (0.6 + 0.4 * p.condition);
}
/** What you're asking for a unit, an hour. */
export const rentOf = (s: State, p: Property, u: Unit) => marketRent(s, p, u) * p.rentLevel;

/** What a property's worth: the land, plus the building at the higher of what went into it and what its rents are worth. */
export function value(s: State, p: Property) {
  const land = landValue(s, plotDef(p.plot));
  const lay = units(p);
  const occ = lay.units.length ? lay.units.filter((u) => p.tenants[u.key]).length / lay.units.length : 0;
  const income = p.cert ? lay.units.reduce((a, u) => a + marketRent(s, p, u), 0) * 24 * VALUE_DAYS * (0.85 + 0.15 * occ) : 0;
  return Math.round(land + Math.max(p.spent * 0.9 * (0.5 + 0.5 * p.condition), income));
}

/** Everything you own in property, less what you owe on it. */
export function estateWorth(s: State) {
  return s.estate.props.reduce((a, p) => a + value(s, p) - p.mortgage, 0);
}

/** What the materials for the rest of the plan come to, pallets by item. */
export function materialsLeft(p: Property) {
  const need: Partial<Record<ItemId, number>> = {};
  for (const part of p.parts)
    PARTS[part.k].stages.forEach((st, i) => {
      if (part.done || i < part.stage || (i === part.stage && part.paid)) return;
      for (const [item, n] of Object.entries(st.mats) as [ItemId, number][]) need[item] = (need[item] ?? 0) + n;
    });
  return need;
}

/** A cost estimate for the rest of the plan: materials at list, and labour at standard rates. */
export function estimate(p: Property) {
  const need = materialsLeft(p);
  const materials = (Object.entries(need) as [ItemId, number][]).reduce((a, [item, n]) => a + ITEMS[item].price * n, 0);
  let labour = 0;
  for (const part of p.parts)
    PARTS[part.k].stages.forEach((st, i) => {
      if (part.done || i < part.stage) return;
      const left = i === part.stage ? 1 - part.prog : 1;
      labour += ((st.work * left) / TRADES[st.trade].rate / 60) * TRADES[st.trade].wage;
    });
  return { materials: Math.round(materials), labour: Math.round(labour), need };
}

/** How far along the build is (0–1), by work. */
export function progress(p: Property) {
  let total = 0;
  let done = 0;
  for (const part of p.parts)
    PARTS[part.k].stages.forEach((st, i) => {
      const w = st.trade === "brick" ? st.work / TRADES.brick.rate : st.work;
      total += w;
      if (part.done || i < part.stage) done += w;
      else if (i === part.stage) done += w * part.prog;
    });
  return total ? done / total : 0;
}

/* ------------------------------------------------------------------ buying land and buildings */

const note = (p: Property, s: State, text: string) => {
  p.log.push({ t: s.time, text });
  if (p.log.length > 30) p.log.splice(0, p.log.length - 30);
};

const owned = (s: State, plot: string) => s.estate.props.some((p) => p.plot === plot);
/** What it costs to buy a plot today (the land, and 3% in fees). */
export const plotPrice = (s: State, plot: PlotDef) => Math.round(landValue(s, plot) * 1.03);

function newProperty(s: State, plot: PlotDef, land: number): Property {
  return {
    id: nid(s), plot: plot.id, bought: s.time, land, parts: [], rev: 0,
    permit: "none", permitAt: 0, storeys: plot.storeys, variance: "none", varianceAt: 0,
    crews: {}, overtime: false, stock: {}, deliveries: [], autoSupply: false, spent: 0, bricks: 0,
    inspections: [], passed: [], cert: false, condition: 1, rentLevel: 1, agent: false, insured: false, letAs: "units",
    tenants: {}, requests: [], mortgage: 0, sale: null, rentToday: 0, rentTotal: 0, short: [], log: [],
  };
}

export function buyPlot(s: State, plotId: string): string | null {
  const plot = PLOTS.find((p) => p.id === plotId);
  if (!plot) return "No such plot";
  if (owned(s, plotId)) return "You own it already";
  if (s.estate.props.length >= MAX_PROPS) return `${MAX_PROPS} properties is the most you can run`;
  const price = plotPrice(s, plot);
  if (!afford(s, price)) return "Not enough cash";
  spend(s, price, "capex");
  pop(s, -price, "Land");
  const p = newProperty(s, plot, price);
  s.estate.props.push(p);
  s.estate.listings = s.estate.listings.filter((l) => l.plot !== plotId);
  s.stats.propsBought++;
  note(p, s, `Bought the land for $${price.toLocaleString("en-US")}`);
  alert(s, "good", `🏗️ You own ${plot.address}, ${plot.city}: draw up plans and apply for a permit`);
  return null;
}

/* ------------------------------------------------------------------ planning */

export const permitFee = (p: Property) => PERMIT.base + PERMIT.perStorey * Math.max(1, topLevel(p) + 1);

export function applyPermit(s: State, id: number): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  if (p.permit !== "none") return p.permit === "pending" ? "The planners are looking at it" : "You have a permit";
  if (!p.parts.length) return "Draw up some plans first";
  const fee = permitFee(p);
  if (!afford(s, fee)) return "Not enough cash";
  spend(s, fee, "estate");
  p.spent += fee;
  p.permit = "pending";
  p.permitAt = s.time + ri(s, PERMIT.hours[0], PERMIT.hours[1]) * HOUR;
  note(p, s, `Applied for planning permission ($${fee.toLocaleString("en-US")})`);
  return null;
}

/** Ask the planners to allow two storeys more than the zoning: they may say no. */
export function applyVariance(s: State, id: number): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  if (p.variance === "pending") return "The planners are considering it";
  if (p.variance === "granted") return "You've got the extra storeys";
  if (!afford(s, VARIANCE.cost)) return "Not enough cash";
  spend(s, VARIANCE.cost, "estate");
  p.spent += VARIANCE.cost;
  p.variance = "pending";
  p.varianceAt = s.time + VARIANCE.hours * HOUR;
  note(p, s, "Applied for a height variance");
  return null;
}

/* ------------------------------------------------------------------ crews */

/** Hire (or with 0 gangs, let go) a trade's crew on a site. */
export function hireCrew(s: State, id: number, trade: Trade, gangs: number, tier = 0): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  gangs = Math.max(0, Math.min(MAX_GANGS, Math.round(gangs)));
  tier = Math.max(0, Math.min(TIERS.length - 1, Math.round(tier)));
  if (!gangs) {
    delete p.crews[trade];
    return null;
  }
  const had = p.crews[trade]?.gangs ?? 0;
  const fee = Math.max(0, gangs - had) * 200;
  if (!afford(s, fee)) return "Not enough cash";
  if (fee) spend(s, fee, "estate");
  p.crews[trade] = { gangs, tier };
  return null;
}

/** A crew's wage bill an hour (time and a half for overtime hours). */
export const crewWage = (c: Crew, t: Trade) => c.gangs * TRADES[t].wage * TIERS[c.tier].wage;
export const siteWages = (p: Property) => TRADE_IDS.reduce((a, t) => a + (p.crews[t] ? crewWage(p.crews[t]!, t) : 0), 0);

const hourOf = (s: State) => (s.time % DAY) / HOUR;
/** Are the crews at work now (and is it overtime)? */
export function onShift(s: State, p: Property): { on: boolean; overtime: boolean } {
  const h = hourOf(s);
  if (h >= WORK_HOURS[0] && h < WORK_HOURS[1]) return { on: true, overtime: false };
  if (p.overtime && h >= OVERTIME_HOURS[0] && h < OVERTIME_HOURS[1]) return { on: true, overtime: true };
  return { on: false, overtime: false };
}

/** Can a part's current stage be worked on now (what it stands on is built)? */
export function workable(p: Property, part: Part) {
  if (part.done) return false;
  if (PARTS[part.k].layer === "fill") {
    const f = floorAt(p, part.x, part.z, part.l);
    return !!f?.done;
  }
  if (part.l === 0) return true;
  const below = floorAt(p, part.x, part.z, part.l - 1);
  if (!below?.done) return false;
  // Every wall below within reach is up (and at least one is there to carry it).
  const plot = plotDef(p.plot);
  let any = false;
  for (let dz = -SPAN; dz <= SPAN; dz++)
    for (let dx = -SPAN; dx <= SPAN; dx++) {
      const nx = part.x + dx;
      const nz = part.z + dz;
      if (nx < 0 || nz < 0 || nx >= plot.w || nz >= plot.d) continue;
      const f = fillAt(p, nx, nz, part.l - 1);
      if (!f || !loadBearing(f.k)) continue;
      if (!f.done) return false;
      any = true;
    }
  return any;
}

/** Take a stage's materials from the site's stock, if they're all there. */
function takeMaterials(s: State, p: Property, part: Part) {
  const st = PARTS[part.k].stages[part.stage];
  for (const [item, n] of Object.entries(st.mats) as [ItemId, number][]) if ((p.stock[item] ?? 0) + 1e-9 < n) return item;
  for (const [item, n] of Object.entries(st.mats) as [ItemId, number][]) {
    p.stock[item] = Math.max(0, (p.stock[item] ?? 0) - n);
    p.spent += ITEMS[item].price * n;
  }
  part.paid = true;
  return null;
}

/** Lay a course by hand on a wall going up (the boss lends a hand): a twelfth of its bricks, free. */
export function layCourse(s: State, id: number, x: number, z: number, l: number): string | null {
  const p = prop(s, id);
  const part = p && fillAt(p, x, z, l);
  if (!p || !part) return "Nothing here";
  const st = PARTS[part.k].stages[part.stage];
  if (part.done || !st || st.trade !== "brick") return "No brickwork to do here";
  if (p.permit !== "granted") return "Wait for the permit";
  if (!workable(p, part)) return "Its floor isn't down yet";
  if (!part.paid) {
    const short = takeMaterials(s, p, part);
    if (short) return `Short of ${ITEMS[short].name.toLowerCase()} on site`;
  }
  const n = Math.min(Math.ceil(st.work / 12), Math.round(st.work * (1 - part.prog)));
  advance(s, p, part, n / st.work, n, 0, false);
  return null;
}

/** Move a part along (and finish it, with a quality, when the last stage is done). */
function advance(s: State, p: Property, part: Part, frac: number, bricks: number, tier: number, overtime: boolean) {
  part.prog += frac;
  if (bricks > 0) {
    p.bricks += bricks;
    s.stats.bricks += bricks;
    s.today.bricks += bricks;
  }
  if (part.prog < 1 - 1e-9) return;
  part.stage++;
  part.prog = 0;
  part.paid = false;
  if (part.stage < PARTS[part.k].stages.length) return;
  part.done = true;
  part.q = Math.max(0.6, Math.min(1, TIERS[tier].q * (overtime ? 0.96 : 1) * (0.97 + rand(s) * 0.05)));
  s.stats.partsBuilt++;
  if (part.k === "roof") s.stats.roofs++;
  milestones(s, p);
}

/** Every game minute: the crews on site get on with it. */
function stepWork(s: State, p: Property) {
  if (p.permit !== "granted") {
    // Hired and waiting: they're paid all the same.
    const { on } = onShift(s, p);
    if (on) spend(s, siteWages(p) / 60, "estate");
    return;
  }
  const { on, overtime } = onShift(s, p);
  if (!on) return;
  const wage = siteWages(p) * (overtime ? 1.5 : 1);
  if (wage) {
    spend(s, wage / 60, "estate");
    p.spent += wage / 60;
  }
  const short = new Set<ItemId>();
  const storm = s.event?.kind === "storm";
  for (const t of TRADE_IDS) {
    const c = p.crews[t];
    if (!c) continue;
    // Roofers stop in a storm.
    if (storm && t === "roofing") continue;
    const jobs = p.parts
      .filter((part) => !part.done && PARTS[part.k].stages[part.stage]?.trade === t && workable(p, part))
      .sort((a, b) => a.l - b.l || Number(b.paid) - Number(a.paid) || b.prog - a.prog || b.z - a.z || a.x - b.x);
    let gangs = c.gangs;
    for (const part of jobs) {
      if (gangs <= 0) break;
      if (!part.paid) {
        const miss = takeMaterials(s, p, part);
        if (miss) {
          short.add(miss);
          continue;
        }
      }
      gangs--;
      const st = PARTS[part.k].stages[part.stage];
      const rate = TRADES[t].rate * TIERS[c.tier].speed;
      advance(s, p, part, rate / st.work, t === "brick" ? rate : 0, c.tier, overtime);
    }
  }
  p.short = [...short];
}

/* ------------------------------------------------------------------ inspections */

function scheduleInspection(s: State, p: Property, kind: Inspection["kind"], level: number) {
  const tag = kind === "frame" ? `frame-${level}` : kind;
  if (p.passed.includes(tag) || p.inspections.some((i) => i.kind === kind && i.level === level)) return;
  p.inspections.push({ kind, level, at: s.time + ri(s, 1, 3) * HOUR });
  spend(s, INSPECTION_FEE, "estate");
  p.spent += INSPECTION_FEE;
}

/** Book the inspections a milestone calls for. */
function milestones(s: State, p: Property) {
  const founds = p.parts.filter((part) => part.k === "found");
  if (founds.length && founds.every((part) => part.done)) scheduleInspection(s, p, "foundation", 0);
  for (let l = 0; l <= topLevel(p); l++) {
    const fills = p.parts.filter((part) => part.l === l && PARTS[part.k].layer === "fill");
    const over = p.parts.filter((part) => part.l === l + 1 && PARTS[part.k].layer === "floor");
    if (fills.length && over.length && fills.every((part) => part.done) && over.every((part) => part.done)) scheduleInspection(s, p, "frame", l);
  }
  if (p.parts.length && p.parts.every((part) => part.done)) {
    if (units(p).units.length) scheduleInspection(s, p, "final", 0);
    // The roof sits on the storey above the last: its level is the number of storeys.
    if (p.parts.some((part) => part.k === "roof")) s.stats.tallest = Math.max(s.stats.tallest, topLevel(p));
  }
}

function inspect(s: State, p: Property, i: Inspection) {
  const scope = p.parts.filter((part) =>
    i.kind === "foundation" ? part.k === "found" : i.kind === "frame" ? part.l === i.level || (part.l === i.level + 1 && PARTS[part.k].layer === "floor") : true,
  );
  const q = scope.length ? scope.reduce((a, part) => a + (part.q ?? 0.9), 0) / scope.length : 1;
  const fail = Math.max(0.02, Math.min(0.8, (0.95 - q) * 3));
  const name = i.kind === "foundation" ? "Foundation inspection" : i.kind === "frame" ? `Storey ${i.level + 1} frame inspection` : "Final inspection";
  if (rand(s) >= fail) {
    p.passed.push(i.kind === "frame" ? `frame-${i.level}` : i.kind);
    note(p, s, `${name}: passed`);
    if (i.kind === "final") {
      p.cert = true;
      s.stats.certified++;
      alert(s, "good", `🔑 ${plotDef(p.plot).address} passed its final inspection: the units can be let`);
    } else alert(s, "info", `${name} passed at ${plotDef(p.plot).address}`);
    return;
  }
  // Failed: the worst work has to be redone.
  const worst = scope.filter((part) => part.done && (part.q ?? 1) < 0.92).sort((a, b) => (a.q ?? 1) - (b.q ?? 1)).slice(0, 4);
  for (const part of worst) {
    part.done = false;
    part.stage = PARTS[part.k].stages.length - 1;
    part.prog = 0.5;
    part.paid = true;
    part.q = undefined;
  }
  spend(s, 500, "estate");
  p.spent += 500;
  note(p, s, `${name}: failed (${worst.length} part${worst.length === 1 ? "" : "s"} to redo, $500 fine)`);
  alert(s, "warn", `${name} failed at ${plotDef(p.plot).address}: ${worst.length} part${worst.length === 1 ? "" : "s"} must be redone. Better crews do better work.`);
  if (!worst.length) scheduleInspection(s, p, i.kind, i.level);
}

/* ------------------------------------------------------------------ materials */

/** Send pallets from the warehouse to a building site: picked, loaded and trucked like any shipment. */
export function sendToSite(s: State, id: number, lines: { item: ItemId; n: number }[]): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  const want = lines.filter((l) => l.n > 0).map((l) => ({ item: l.item, n: Math.round(l.n) }));
  if (!want.length) return "Nothing to send";
  if (want.reduce((a, l) => a + l.n, 0) > 12) return "A truck takes 12 pallets";
  for (const l of want) if (freeStock(s, l.item) < l.n) return `Only ${Math.max(0, Math.floor(freeStock(s, l.item)))} ${ITEMS[l.item].name.toLowerCase()} spare in the warehouse`;
  const plot = plotDef(p.plot);
  const c = city(plot.city);
  const o = makeOrder(s, { customer: plot.address, city: plot.city, lines: want, due: s.time + c.transit * MIN + 6 * HOUR, rush: false });
  o.value = 0;
  o.site = p.id;
  o.code = `SITE-${String(o.id).padStart(5, "0")}`;
  confirm(s, o);
  return null;
}

/** A delivery to a site has arrived (called by the orders when the truck gets there). */
export function siteDelivered(s: State, o: Order) {
  const p = s.estate.props.find((x) => x.id === o.site);
  if (!p) return;
  for (const l of o.lines) p.stock[l.item] = (p.stock[l.item] ?? 0) + l.n;
  note(p, s, `Delivered from the warehouse: ${o.lines.map((l) => `${l.n} × ${ITEMS[l.item].name}`).join(", ")}`);
}

/** Pallets on their way to a site (from the warehouse and direct). */
export function siteIncoming(s: State, id: number) {
  const out: Partial<Record<ItemId, number>> = {};
  for (const o of s.orders) if (o.site === id && ["confirmed", "picked", "loading", "transit"].includes(o.state)) for (const l of o.lines) out[l.item] = (out[l.item] ?? 0) + l.n;
  const p = prop(s, id);
  for (const d of p?.deliveries ?? []) out[d.item] = (out[d.item] ?? 0) + d.n;
  return out;
}

export const directCost = (s: State, item: ItemId, n: number) => Math.round(purchaseCost(s, item, n) * DIRECT.markup + DIRECT.fee);

/** Order materials from the supplier straight to site (dearer, but no warehouse handling). */
export function orderToSite(s: State, id: number, item: ItemId, n: number): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  n = Math.max(1, Math.min(12, Math.round(n)));
  const cost = directCost(s, item, n);
  if (!afford(s, cost)) return "Not enough cash";
  spend(s, cost, "estate");
  pop(s, -cost, `${n} × ${ITEMS[item].name} to site`);
  const sup = SUPPLIERS.find((x) => x.items.includes(item)) ?? SUPPLIERS[SUPPLIERS.length - 1];
  const lead = ri(s, sup.lead[0], sup.lead[1]) + city(plotDef(p.plot).city).transit * 0.5;
  p.deliveries.push({ item, n, at: s.time + lead * MIN });
  return null;
}

/** Keep a site supplied: order what the next stretch of work needs, from the warehouse if it's there, else direct. */
function autoSupply(s: State, p: Property) {
  if (!p.autoSupply || p.permit === "none") return;
  const coming = siteIncoming(s, p.id);
  if (Object.keys(coming).length) return;
  // What the next dozen jobs need, against what's on site.
  const next = p.parts.filter((part) => !part.done && !part.paid).sort((a, b) => a.l - b.l).slice(0, 14);
  const need: Partial<Record<ItemId, number>> = {};
  for (const part of next) for (const [item, n] of Object.entries(PARTS[part.k].stages[part.stage].mats) as [ItemId, number][]) need[item] = (need[item] ?? 0) + n;
  const lines: { item: ItemId; n: number }[] = [];
  let room = 12;
  for (const [item, n] of Object.entries(need) as [ItemId, number][]) {
    const want = Math.ceil(n - (p.stock[item] ?? 0));
    if (want <= 0 || room <= 0) continue;
    const take = Math.min(want, room);
    lines.push({ item, n: take });
    room -= take;
  }
  if (!lines.length) return;
  const fromStock = lines.filter((l) => freeStock(s, l.item) >= l.n);
  if (fromStock.length) sendToSite(s, p.id, fromStock);
  for (const l of lines.filter((x) => !fromStock.includes(x))) if (afford(s, directCost(s, l.item, l.n) + 5_000)) orderToSite(s, p.id, l.item, l.n);
}

/* ------------------------------------------------------------------ tenants */

const HOUSEHOLDS = ["The Patels", "Garcia family", "J. Okafor", "The Nguyens", "M. Kowalski", "The O'Briens", "S. Haddad", "The Lindqvists", "R. Mensah", "The Moreaus", "A. Tanaka", "The Romanos", "D. Fischer", "The Abebes", "L. Novak", "The Silvas"];
const BUSINESSES = ["Bean There Café", "Northside Dental", "Pixel & Co. Studio", "Golden Wok", "Brightside Insurance", "Fern & Bloom Florist", "Ledger Accountants", "Copperhead Barbers", "Tidewater Books", "Summit Physio", "Blue Door Bakery", "Arc Legal", "Lumen Opticians", "Kettle & Crumb"];
const REQUESTS = {
  household: ["A dripping tap", "The heating's playing up", "A window that sticks", "Damp in the bathroom", "A broken door lock", "No hot water"],
  business: ["The shop sign's flickering", "A leak in the stockroom", "The shutter's jammed", "The air conditioning's out", "A tripping fuse"],
};

/** Every game hour: rent comes in, tenants come and go, things wear and break. */
function stepTenants(s: State, p: Property) {
  const lay = units(p);
  const plot = plotDef(p.plot);
  // Tenants whose home isn't there any more (a fire, a demolition) move out.
  for (const k of Object.keys(p.tenants))
    if (!lay.units.some((u) => u.key === k)) {
      alert(s, "warn", `${p.tenants[k].name} moved out of ${plot.address}: their unit isn't there any more`);
      delete p.tenants[k];
    }
  const fee = p.agent ? 1 - AGENT_FEE : 1;
  for (const u of lay.units) {
    const t = p.tenants[u.key];
    if (!t) {
      if (!p.cert || p.sale) continue;
      // Someone takes it: more often in a big city, at a fair rent, in a good building with light.
      const demand = Math.sqrt(city(plot.city).pop) * cityIndex(s, plot.city) * (0.7 + 0.3 * p.condition) * Math.max(0.6, quality(p) + 0.1);
      const price = Math.max(0, Math.min(2, Math.pow((1.45 - p.rentLevel) / 0.45, 2)));
      if (rand(s) < 0.14 * demand * price) {
        const kind = UNIT_TYPES[u.type].tenant;
        p.tenants[u.key] = { name: pick(s, kind === "household" ? HOUSEHOLDS : BUSINESSES), kind, since: s.time, until: s.time + ri(s, 2, 6) * DAY, happy: 70, owed: 0 };
        s.stats.tenantsIn++;
        note(p, s, `${p.tenants[u.key].name} moved into the ${UNIT_TYPES[u.type].name.toLowerCase()} (${u.area} m²)`);
      }
      continue;
    }
    // Rent, unless they're behind.
    if (t.owed > 0) {
      t.owed++;
      if (rand(s) < 0.2) {
        const back = Math.round(rentOf(s, p, u) * t.owed);
        earn(s, back * fee, "rentIn");
        p.rentToday += back;
        p.rentTotal += back;
        t.owed = 0;
        note(p, s, `${t.name} paid what they owed`);
      } else if (p.agent && t.owed > 12) {
        evict(s, p.id, u.key);
        continue;
      }
    } else {
      const r = rentOf(s, p, u);
      earn(s, r * fee, "rentIn");
      p.rentToday += r;
      p.rentTotal += r;
      s.today.rent += r;
      if (rand(s) < 0.004) {
        t.owed = 1;
        alert(s, "warn", `${t.name} at ${plot.address} is behind with the rent`);
      }
    }
    // Happiness drifts toward how fair the rent is and how well the place is kept.
    const fixes = p.requests.filter((r) => r.unit === u.key && s.time - r.at > 6 * HOUR).length;
    const target = 75 - (p.rentLevel - 1) * 120 + (p.condition - 0.8) * 100 + (quality(p) - 0.9) * 80 + (p.agent ? 5 : 0) - fixes * 15;
    t.happy = Math.max(0, Math.min(100, t.happy + (target - t.happy) * 0.08));
    if (rand(s) < 0.006 && !p.requests.some((r) => r.unit === u.key)) {
      const text = pick(s, REQUESTS[t.kind]);
      p.requests.push({ unit: u.key, text, at: s.time, cost: ri(s, 3, 12) * 50 });
      if (p.agent) fixRequest(s, p.id, p.requests.length - 1);
    }
    // The lease ends: they stay if they're happy, otherwise they go. Very unhappy tenants break it.
    if (s.time >= t.until) {
      if (t.happy >= 50) {
        t.until = s.time + ri(s, 2, 6) * DAY;
        note(p, s, `${t.name} renewed their lease`);
      } else {
        note(p, s, `${t.name} moved out at the end of their lease`);
        delete p.tenants[u.key];
      }
    } else if (t.happy < 25 && rand(s) < 0.02) {
      note(p, s, `${t.name} broke their lease and left`);
      alert(s, "warn", `${t.name} left ${plot.address} unhappy`);
      delete p.tenants[u.key];
    }
  }
  // The letting agent keeps the rents where the market is.
  if (p.agent && lay.units.length && p.cert) {
    const occ = lay.units.filter((u) => p.tenants[u.key]).length / lay.units.length;
    if (occ < 0.7 && p.rentLevel > 0.85) p.rentLevel = Math.round((p.rentLevel - 0.05) * 20) / 20;
    else if (occ === 1 && p.rentLevel < 1.2 && rand(s) < 0.1) p.rentLevel = Math.round((p.rentLevel + 0.05) * 20) / 20;
  }
}

export function setRent(s: State, id: number, level: number) {
  const p = prop(s, id);
  if (p) p.rentLevel = Math.round(Math.max(0.7, Math.min(1.5, level)) * 20) / 20;
}

export function fixRequest(s: State, id: number, i: number): string | null {
  const p = prop(s, id);
  const r = p?.requests[i];
  if (!p || !r) return "Nothing to fix";
  if (!afford(s, r.cost)) return "Not enough cash";
  spend(s, r.cost, "estate");
  p.requests.splice(i, 1);
  const t = p.tenants[r.unit];
  if (t) t.happy = Math.min(100, t.happy + 6);
  note(p, s, `Fixed: ${r.text.toLowerCase()}`);
  return null;
}

export function evict(s: State, id: number, unit: string): string | null {
  const p = prop(s, id);
  const t = p?.tenants[unit];
  if (!p || !t) return "No tenant there";
  spend(s, EVICT_FEE, "estate");
  note(p, s, `${t.name} evicted ($${EVICT_FEE})`);
  delete p.tenants[unit];
  p.requests = p.requests.filter((r) => r.unit !== unit);
  return null;
}

/** Make the building good as new. */
export const refurbCost = (s: State, p: Property) => Math.round((1 - p.condition) * Math.max(p.spent, value(s, p) - landValue(s, plotDef(p.plot))) * 0.25 + 500);
export function refurbish(s: State, id: number): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  if (p.condition > 0.98) return "It's in fine shape";
  const cost = refurbCost(s, p);
  if (!afford(s, cost)) return "Not enough cash";
  spend(s, cost, "estate");
  p.spent += cost * 0.5;
  p.condition = 1;
  for (const t of Object.values(p.tenants)) t.happy = Math.min(100, t.happy + 10);
  note(p, s, `Refurbished ($${cost.toLocaleString("en-US")})`);
  return null;
}

export function setSite(s: State, id: number, o: Partial<Pick<Property, "overtime" | "autoSupply" | "agent" | "insured" | "letAs">>) {
  const p = prop(s, id);
  if (!p) return;
  Object.assign(p, o);
}

/* ------------------------------------------------------------------ the bank, and selling */

export const mortgageLimit = (s: State, p: Property) => Math.max(0, Math.floor((value(s, p) * MORTGAGE.ltv - p.mortgage) / 1000) * 1000);

export function borrowOn(s: State, id: number, amount: number): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  amount = Math.round(amount);
  if (amount <= 0) return "Nothing to borrow";
  if (amount > mortgageLimit(s, p)) return "More than the bank will lend on it";
  p.mortgage += amount;
  if (!s.sandbox) s.cash += amount;
  s.stats.mortgaged += amount;
  note(p, s, `Mortgaged for $${amount.toLocaleString("en-US")}`);
  return null;
}

export function repayOn(s: State, id: number, amount: number): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  amount = Math.min(Math.round(amount), p.mortgage);
  if (amount <= 0) return "Nothing owed";
  if (!afford(s, amount)) return "Not enough cash";
  if (!s.sandbox) s.cash -= amount;
  p.mortgage -= amount;
  note(p, s, `Paid $${amount.toLocaleString("en-US")} off the mortgage`);
  return null;
}

/** Put a property up for sale at an asking price: buyers make offers now and then (tenants stay). */
export function listForSale(s: State, id: number, ask: number | null): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  p.sale = ask === null ? null : { ask: Math.round(ask), offer: 0, offerUntil: 0 };
  return null;
}

function sell(s: State, p: Property, price: number) {
  const net = Math.round(price * (1 - SALE_FEE)) - p.mortgage;
  const cost = p.land + p.spent;
  if (!s.sandbox) s.cash += net;
  s.stats.propsSold++;
  if (price > cost) s.stats.flips++;
  pop(s, net, "Sold");
  alert(s, "good", `🏷️ Sold ${plotDef(p.plot).address} for $${price.toLocaleString("en-US")}${p.mortgage ? `; the $${p.mortgage.toLocaleString("en-US")} mortgage is paid off` : ""}`);
  s.estate.props = s.estate.props.filter((x) => x !== p);
}

export function acceptOffer(s: State, id: number): string | null {
  const p = prop(s, id);
  if (!p?.sale?.offer) return "No offer on the table";
  sell(s, p, p.sale.offer);
  return null;
}

/** Sell today to a cash buyer, below value. */
export function quickSell(s: State, id: number): string | null {
  const p = prop(s, id);
  if (!p) return "No such property";
  sell(s, p, Math.round(value(s, p) * QUICK_SALE));
  return null;
}

/* ------------------------------------------------------------------ the property market */

/** A finished building for a listing or a purchase: every part built (to the quality given). */
function builtFrom(s: State, plot: PlotDef, tpl: Template, storeys: number, q: number): Property {
  const p = newProperty(s, plot, 0);
  for (const sp of design(plot, tpl, storeys)) p.parts.push({ k: sp.k, x: sp.x, z: sp.z, l: sp.l, stage: PARTS[sp.k].stages.length, prog: 0, paid: false, done: true, q });
  p.rev++;
  p.cert = true;
  p.letAs = tpl === "house" ? "whole" : "units";
  return p;
}

/** Now and then, a finished building comes up for sale. */
function stepListings(s: State) {
  const e = s.estate;
  e.listings = e.listings.filter((l) => l.until > s.time && !owned(s, l.plot));
  if (e.listings.length >= 3 || rand(s) > 0.04) return;
  const free = PLOTS.filter((pl) => !owned(s, pl.id) && !e.listings.some((l) => l.plot === pl.id));
  if (!free.length) return;
  const plot = pick(s, free);
  const tpls = (Object.keys(TEMPLATES) as Template[]).filter((t) => TEMPLATES[t].zones.includes(plot.zone) && (t !== "house" || plot.w <= 8));
  const tpl = pick(s, tpls);
  const storeys = Math.min(plot.storeys, ri(s, 2, tpl === "house" ? 2 : 5));
  const condition = Math.round((0.45 + rand(s) * 0.5) * 100) / 100;
  const tmp = builtFrom(s, plot, tpl, storeys, 0.88 + rand(s) * 0.08);
  tmp.condition = condition;
  const price = Math.round((value(s, tmp) * (0.88 + rand(s) * 0.2) * (condition < 0.65 ? 0.85 : 1)) / 1000) * 1000;
  e.listings.push({ id: nid(s), plot: plot.id, tpl, storeys, condition, price, until: s.time + ri(s, 24, 48) * HOUR, let: Math.round(rand(s) * 10) / 10 });
}

export function buyListing(s: State, id: number): string | null {
  const l = s.estate.listings.find((x) => x.id === id);
  if (!l) return "That's been sold";
  if (s.estate.props.length >= MAX_PROPS) return `${MAX_PROPS} properties is the most you can run`;
  if (!afford(s, l.price)) return "Not enough cash";
  const plot = plotDef(l.plot);
  spend(s, l.price, "capex");
  pop(s, -l.price, "Property");
  const p = builtFrom(s, plot, l.tpl, l.storeys, 0.88 + rand(s) * 0.08);
  p.condition = l.condition;
  p.land = landValue(s, plot);
  p.spent = Math.max(0, l.price - p.land);
  p.permit = "granted";
  // Some of the tenants come with it.
  for (const u of units(p).units)
    if (rand(s) < l.let) {
      const kind = UNIT_TYPES[u.type].tenant;
      p.tenants[u.key] = { name: pick(s, kind === "household" ? HOUSEHOLDS : BUSINESSES), kind, since: s.time, until: s.time + ri(s, 1, 5) * DAY, happy: 55 + ri(s, 0, 25), owed: 0 };
    }
  s.estate.props.push(p);
  s.estate.listings = s.estate.listings.filter((x) => x.id !== id);
  s.stats.propsBought++;
  note(p, s, `Bought for $${l.price.toLocaleString("en-US")}`);
  alert(s, "good", `🏢 You bought ${plot.address}, ${plot.city}`);
  return null;
}

/* ------------------------------------------------------------------ the clock */

/** Every game minute: construction, deliveries and inspections. */
export function stepEstateMinute(s: State) {
  for (const p of s.estate.props) {
    for (const d of p.deliveries.filter((x) => s.time >= x.at)) {
      p.stock[d.item] = (p.stock[d.item] ?? 0) + d.n;
      note(p, s, `Delivered direct: ${d.n} × ${ITEMS[d.item].name}`);
    }
    p.deliveries = p.deliveries.filter((x) => s.time < x.at);
    stepWork(s, p);
    for (const i of p.inspections.filter((x) => s.time >= x.at)) inspect(s, p, i);
    p.inspections = p.inspections.filter((x) => s.time < x.at);
  }
}

/** Every ten game minutes: sites order what they need. */
export function stepEstateTen(s: State) {
  for (const p of s.estate.props) autoSupply(s, p);
}

/** Every game hour: planning decisions, tenants, wear, the running costs, offers, events. */
export function stepEstateHour(s: State) {
  for (const p of [...s.estate.props]) {
    const plot = plotDef(p.plot);
    if (p.permit === "pending" && s.time >= p.permitAt) {
      // Neighbours object, now and then: it takes a little longer.
      if (rand(s) < 0.15) {
        p.permitAt = s.time + 4 * HOUR;
        note(p, s, "A neighbour objected: the planners need another four hours");
        alert(s, "warn", `A neighbour objected to your plans at ${plot.address}: the decision's four hours later`);
      } else {
        p.permit = "granted";
        s.stats.permits++;
        note(p, s, "Planning permission granted");
        alert(s, "good", `📜 Planning permission granted for ${plot.address}: hire crews and get materials on site`);
      }
    }
    if (p.variance === "pending" && s.time >= p.varianceAt) {
      if (rand(s) < VARIANCE.chance + (s.rep - 60) / 400) {
        p.variance = "granted";
        p.storeys = plot.storeys + VARIANCE.storeys;
        alert(s, "good", `Height variance granted at ${plot.address}: up to ${p.storeys} storeys`);
      } else {
        p.variance = "refused";
        alert(s, "warn", `The planners refused a height variance at ${plot.address}`);
      }
      note(p, s, `Height variance ${p.variance}`);
    }
    const v = value(s, p);
    // Running costs: property tax, insurance, the mortgage.
    spend(s, (v * TAX) / 24, "estate");
    if (p.insured) spend(s, (v * INSURANCE) / 24, "estate");
    if (p.mortgage > 0) spend(s, (p.mortgage * MORTGAGE.rate) / 24, "interest");
    stepTenants(s, p);
    // Wear: better work wears slower.
    if (units(p).units.length) p.condition = Math.max(0.2, p.condition - 0.0006 * (1.3 - quality(p)));
    // Things happen.
    if (p.cert && rand(s) < 0.0006) fire(s, p);
    else if (p.cert && Object.keys(p.tenants).length && rand(s) < 0.002) {
      p.condition = Math.max(0.2, p.condition - 0.06);
      for (const t of Object.values(p.tenants)) t.happy = Math.max(0, t.happy - 8);
      note(p, s, "A burst pipe: water damage");
      alert(s, "warn", `💧 A burst pipe at ${plot.address}: some water damage`);
    }
    // Offers, if it's for sale.
    if (p.sale) {
      if (p.sale.offer && s.time > p.sale.offerUntil) {
        note(p, s, "The buyer's offer lapsed");
        p.sale.offer = 0;
      }
      const ratio = p.sale.ask / Math.max(1, v);
      if (!p.sale.offer && rand(s) < 0.12 * Math.max(0, Math.min(1, (1.3 - ratio) / 0.4))) {
        p.sale.offer = Math.round(Math.min(p.sale.ask, v * (0.92 + rand(s) * 0.16)) / 100) * 100;
        p.sale.offerUntil = s.time + 6 * HOUR;
        alert(s, "info", `A buyer offers $${p.sale.offer.toLocaleString("en-US")} for ${plot.address} (Estate)`);
      }
    }
  }
  stepListings(s);
}

/** A fire: insured, the insurer pays for the repairs; otherwise some of the building has to be rebuilt. */
export function fire(s: State, p: Property) {
  const plot = plotDef(p.plot);
  if (p.insured) {
    p.condition = Math.max(0.3, p.condition - 0.1);
    alert(s, "warn", `🔥 A small fire at ${plot.address}: the insurance covers the repairs`);
    note(p, s, "A fire: the insurance paid for the repairs");
    return;
  }
  p.condition = Math.max(0.2, p.condition - 0.3);
  const burnt = p.parts.filter((part) => part.done && (part.k === "roof" || part.k === "wall" || part.k === "window")).sort(() => rand(s) - 0.5).slice(0, ri(s, 2, 5));
  for (const part of burnt) {
    part.done = false;
    part.stage = 0;
    part.prog = 0.3;
    part.paid = true;
    part.q = undefined;
  }
  alert(s, "bad", `🔥 Fire at ${plot.address}: ${burnt.length} parts burnt out and must be rebuilt (no insurance)`);
  note(p, s, `A fire: ${burnt.length} parts to rebuild`);
}

/** Every game day: house prices move. */
export function stepEstateDay(s: State) {
  for (const c of CITIES) {
    const v = cityIndex(s, c.name) * (1 + 0.004 + (rand(s) - 0.5) * 0.06);
    s.estate.index[c.name] = Math.round(Math.max(0.7, Math.min(1.6, v + (1 - v) * 0.05)) * 1000) / 1000;
  }
  for (const p of s.estate.props) p.rentToday = 0;
}
