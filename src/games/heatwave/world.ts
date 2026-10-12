import { createRng, type Rng } from "../engine/rng";

/**
 * Port Solano, the Heatwave map: a sun-baked island city. Pure, seeded data that the simulation,
 * the renderer and the maps all read.
 *
 * Coordinates are metres on the ground: x east, z south, y up. Land is flat at y = 0; the sea, the
 * Solano River and the swamp ponds sit at WATER_Y. Traffic drives on the right.
 *
 *  - Downtown (towers, the bank, police HQ) north of the river.
 *  - Midtown and Bayfront Park to its west, the hospital.
 *  - The Strand: pastel hotels on Seabreeze Boulevard, then a wide beach and Solano Pier.
 *  - Calle Sol: colourful low-rise shops and cafés south of the river.
 *  - Palm Heights: houses with yards and pools.
 *  - The Harbor: warehouses, container yards and cranes on the south shore.
 *  - The Glades: mangroves, ponds, trailers and the airboat dock in the west.
 *  - Marina Keys: mansions and yachts on an island, over the Causeway.
 */

export const WATER_Y = -0.7;

export type RoadClass = "avenue" | "street";
export type District = "downtown" | "midtown" | "strand" | "beach" | "callesol" | "heights" | "harbor" | "glades" | "keys";

export const DISTRICTS: Record<District, { name: string; color: string }> = {
  downtown: { name: "Downtown", color: "#8a93a6" },
  midtown: { name: "Midtown", color: "#9aa48a" },
  strand: { name: "The Strand", color: "#e7a4b8" },
  beach: { name: "Solano Beach", color: "#ecd9a6" },
  callesol: { name: "Calle Sol", color: "#e9b46a" },
  heights: { name: "Palm Heights", color: "#9cc48a" },
  harbor: { name: "The Harbor", color: "#8aa0b4" },
  glades: { name: "The Glades", color: "#6f8a5c" },
  keys: { name: "Marina Keys", color: "#7fc8c4" },
};

/** Road dimensions by class: half the carriageway, the sidewalk, and lane centres from the middle. */
export const ROAD: Record<RoadClass, { half: number; walk: number; lanes: number[] }> = {
  avenue: { half: 7.5, walk: 4, lanes: [2.25, 5.75] },
  street: { half: 4, walk: 3, lanes: [2] },
};

/** A road line: x = at for "ns" roads (running along z), z = at for "ew" roads. */
interface Line {
  at: number;
  cls: RoadClass;
  name: string;
  from: number;
  to: number;
  /** Stretches (along the line) with no road. */
  skip?: [number, number][];
}

const NS: Line[] = [
  { at: -780, cls: "street", name: "Sawgrass Rd", from: -660, to: 560, skip: [[-450, -250]] },
  { at: -660, cls: "street", name: "Mangrove St", from: -760, to: 620 },
  { at: -560, cls: "avenue", name: "Tamarind Ave", from: -780, to: 650 },
  { at: -460, cls: "street", name: "Hibiscus St", from: -780, to: 650, skip: [[-650, -540]] },
  { at: -360, cls: "street", name: "Jasmine St", from: -780, to: 650 },
  { at: -260, cls: "avenue", name: "Flamingo Ave", from: -780, to: 660 },
  { at: -160, cls: "street", name: "Orchid St", from: -780, to: 660 },
  { at: -60, cls: "street", name: "Palmetto St", from: -780, to: 660, skip: [[430, 660]] },
  { at: 40, cls: "avenue", name: "Solano Ave", from: -780, to: 660 },
  { at: 140, cls: "street", name: "Marlin St", from: -780, to: 660, skip: [[430, 660]] },
  { at: 240, cls: "street", name: "Pelican St", from: -780, to: 660 },
  { at: 340, cls: "avenue", name: "Strand Ave", from: -780, to: 620 },
  { at: 450, cls: "avenue", name: "Seabreeze Blvd", from: -780, to: 600 },
  // Marina Keys.
  { at: 830, cls: "street", name: "Coral Ln", from: 200, to: 560 },
  { at: 930, cls: "avenue", name: "Keys Dr", from: 200, to: 560 },
  { at: 1030, cls: "street", name: "Lagoon Ln", from: 200, to: 560 },
];

const EW: Line[] = [
  { at: -760, cls: "street", name: "North Shore Dr", from: -660, to: 450 },
  { at: -650, cls: "street", name: "Cypress St", from: -660, to: 450 },
  { at: -540, cls: "avenue", name: "Bayfront Ave", from: -780, to: 450, skip: [[-560, -460]] },
  { at: -440, cls: "street", name: "Royal Palm St", from: -660, to: 450 },
  { at: -340, cls: "street", name: "Banyan St", from: -780, to: 450 },
  { at: -240, cls: "avenue", name: "Central Ave", from: -780, to: 450 },
  { at: -70, cls: "avenue", name: "Calle Sol", from: -860, to: 450 },
  { at: 30, cls: "street", name: "Gardenia St", from: -660, to: 450 },
  { at: 130, cls: "avenue", name: "Coconut Ave", from: -780, to: 450 },
  { at: 230, cls: "street", name: "Magnolia St", from: -780, to: 450 },
  { at: 330, cls: "avenue", name: "Causeway Blvd", from: -780, to: 1030 },
  { at: 430, cls: "street", name: "Dockside St", from: -660, to: 450 },
  { at: 530, cls: "avenue", name: "Cargo Way", from: -780, to: 340 },
  { at: 620, cls: "street", name: "Quay St", from: -660, to: 240 },
  // Marina Keys.
  { at: 200, cls: "street", name: "Marina Way", from: 830, to: 1030 },
  { at: 460, cls: "street", name: "Point Rd", from: 830, to: 1030 },
  { at: 560, cls: "street", name: "Yacht Club Rd", from: 830, to: 1030 },
];

/* -------------------------------------------------------------------------------- the shape */

/** The east coast's x at a given z (the beach runs down to it). */
export const eastCoast = (z: number) => 640 + 22 * Math.sin(z * 0.011) + 9 * Math.sin(z * 0.031 + 1);
export const southCoast = (x: number) => 690 + 16 * Math.sin(x * 0.013) + 7 * Math.sin(x * 0.04 + 2);
export const northCoast = (x: number) => -830 + 14 * Math.sin(x * 0.012 + 0.5);
export const westCoast = (z: number) => -900 + 18 * Math.sin(z * 0.017);
/** The Solano River's centreline z, from the Glades to the sea. */
export const riverZ = (x: number) => -150 + 10 * Math.sin(x * 0.006 + 0.4);
export const RIVER_HALF = 19;
const KEYS = { x: 930, z: 380, rx: 170, rz: 245 };
/** Piers and quays out over the water: walkable and drivable decks. */
export const PIERS: { x0: number; x1: number; z0: number; z1: number; name: string }[] = [
  { x0: 600, x1: 780, z0: -212, z1: -198, name: "Solano Pier" },
  { x0: -120, x1: -70, z0: 670, z1: 790, name: "Pier 1" },
  { x0: 80, x1: 130, z0: 670, z1: 790, name: "Pier 2" },
  { x0: 760, x1: 800, z0: 560, z1: 600, name: "Yacht Club Jetty" },
  { x0: -960, x1: -880, z0: -78, z1: -62, name: "Airboat Dock" },
];

function hash2(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Smooth value noise (0..1). */
export function noise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** A pond in the Glades (not where a road runs). */
function pond(x: number, z: number) {
  if (x > -640) return false;
  const n = noise(x / 55, z / 55) * 0.7 + noise(x / 19, z / 19) * 0.3;
  return n > 0.62;
}

/** Signed distance (m) to the main island's coast: positive inland. */
export function coastDistance(x: number, z: number) {
  return Math.min(eastCoast(z) - x, southCoast(x) - z, z - northCoast(x), x - westCoast(z));
}

function keysInside(x: number, z: number) {
  const dx = (x - KEYS.x) / KEYS.rx;
  const dz = (z - KEYS.z) / KEYS.rz;
  return dx * dx + dz * dz;
}

/** Ground height: land at 0, the beach shelving into the water. */
export function groundY(x: number, z: number) {
  if (onDeck(x, z)) return 0;
  // Marina Keys.
  const k = keysInside(x, z);
  const kd = (1 - Math.sqrt(k)) * Math.min(KEYS.rx, KEYS.rz);
  let d = coastDistance(x, z);
  d = Math.max(d, kd);
  if (d < 0) return Math.max(-6, -1.2 + d * 0.15);
  // Beaches shelve; quays and the river bank drop straight in.
  const r = Math.abs(z - riverZ(x)) - RIVER_HALF;
  if (x > -700 && x < eastCoast(z) && r < 0) return -2.5;
  if (pond(x, z) && !nearRoad(x, z, 6)) return -1.6;
  if (d < 14 && beachy(x, z)) return -1.2 + (d / 14) * 1.2;
  return 0;
}

/** Sand runs into the sea on the east coast and the Keys; elsewhere it's a quay or a bank. */
function beachy(x: number, z: number) {
  if (x > 760) return true;
  return eastCoast(z) - x < 30 && z < 600;
}

export function isWater(x: number, z: number) {
  return groundY(x, z) < WATER_Y + 0.2;
}

export function onDeck(x: number, z: number) {
  for (const p of PIERS) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return true;
  return onBridge(x, z);
}

export function districtAt(x: number, z: number): District {
  if (x > 700) return "keys";
  if (x < -680) return "glades";
  if (x > 455) return "beach";
  if (x > 345) return "strand";
  const north = z < riverZ(x);
  if (north) return x > -210 ? "downtown" : "midtown";
  if (z > 380 && x > -210) return "harbor";
  return x > -210 ? "callesol" : "heights";
}

/* -------------------------------------------------------------------------------- roads */

export interface Node {
  id: number;
  x: number;
  z: number;
  /** Segment ids, by direction: 0 east, 1 south, 2 west, 3 north (−1 if none). */
  dir: [number, number, number, number];
  light: boolean;
}

export interface Seg {
  id: number;
  /** From node a (west or north end) to node b. */
  a: number;
  b: number;
  axis: "ns" | "ew";
  cls: RoadClass;
  name: string;
  /** Crosses water (the river or the bay). */
  bridge: boolean;
  /** Where the deck is over water, along the segment (0–1). */
  wet: [number, number][];
  len: number;
}

const covers = (l: Line, v: number) => v >= l.from - 0.01 && v <= l.to + 0.01;
const skipped = (l: Line, v0: number, v1: number) => !!l.skip?.some(([s0, s1]) => v0 >= s0 - 0.01 && v1 <= s1 + 0.01);

export interface Roads {
  nodes: Node[];
  segs: Seg[];
}

let bridgeSegs: Seg[] = [];
let nodesRef: Node[] = [];

function buildRoads(): Roads {
  const nodes: Node[] = [];
  const segs: Seg[] = [];
  const key = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;
  const at = new Map<string, number>();
  const node = (x: number, z: number) => {
    const k = key(x, z);
    let id = at.get(k);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ id, x, z, dir: [-1, -1, -1, -1], light: false });
      at.set(k, id);
    }
    return id;
  };
  const along = (l: Line, other: Line[]) => {
    const stops = new Set<number>([l.from, l.to]);
    for (const o of other) if (covers(o, l.at) && o.at > l.from && o.at < l.to) stops.add(o.at);
    return [...stops].sort((a, b) => a - b);
  };
  const add = (l: Line, axis: "ns" | "ew", v0: number, v1: number) => {
    if (skipped(l, v0, v1)) return;
    const a = axis === "ns" ? node(l.at, v0) : node(v0, l.at);
    const b = axis === "ns" ? node(l.at, v1) : node(v1, l.at);
    const id = segs.length;
    const na = nodes[a];
    const nb = nodes[b];
    // Where it runs over water.
    const wet: [number, number][] = [];
    let start = -1;
    const N = Math.max(2, Math.ceil((v1 - v0) / 4));
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = na.x + (nb.x - na.x) * t;
      const z = na.z + (nb.z - na.z) * t;
      const w = rawWater(x, z);
      if (w && start < 0) start = t;
      if (!w && start >= 0) {
        wet.push([Math.max(0, start - 0.02), Math.min(1, t + 0.02)]);
        start = -1;
      }
    }
    if (start >= 0) wet.push([Math.max(0, start - 0.02), 1]);
    segs.push({ id, a, b, axis, cls: l.cls, name: l.name, bridge: wet.length > 0, wet, len: Math.hypot(nb.x - na.x, nb.z - na.z) });
    if (axis === "ns") {
      na.dir[1] = id;
      nb.dir[3] = id;
    } else {
      na.dir[0] = id;
      nb.dir[2] = id;
    }
  };
  for (const l of NS) {
    const stops = along(l, EW);
    for (let i = 0; i < stops.length - 1; i++) add(l, "ns", stops[i], stops[i + 1]);
  }
  for (const l of EW) {
    const stops = along(l, NS);
    for (let i = 0; i < stops.length - 1; i++) add(l, "ew", stops[i], stops[i + 1]);
  }
  // Lights where an avenue meets three or more ways.
  for (const n of nodes) {
    const deg = n.dir.filter((d) => d >= 0).length;
    const avenue = n.dir.some((d) => d >= 0 && segs[d].cls === "avenue");
    n.light = deg >= 3 && avenue;
  }
  return { nodes, segs };
}

/** Water before bridges are known (for finding where the bridges go). */
function rawWater(x: number, z: number) {
  const k = keysInside(x, z);
  if (k < 1) return false;
  if (coastDistance(x, z) < 0) return true;
  return x > -700 && x < eastCoast(z) && Math.abs(z - riverZ(x)) < RIVER_HALF;
}

export const roadHalf = (s: Seg) => ROAD[s.cls].half;
export const streetHalf = (s: Seg) => ROAD[s.cls].half + (s.bridge ? 1.6 : ROAD[s.cls].walk);

function onBridge(x: number, z: number) {
  for (const s of bridgeSegs) {
    const a = nodesRef[s.a];
    const b = nodesRef[s.b];
    const h = streetHalf(s);
    if (s.axis === "ns") {
      if (Math.abs(x - a.x) > h || z < a.z || z > b.z) continue;
      const t = (z - a.z) / (b.z - a.z);
      if (s.wet.some(([t0, t1]) => t >= t0 && t <= t1)) return true;
    } else {
      if (Math.abs(z - a.z) > h || x < a.x || x > b.x) continue;
      const t = (x - a.x) / (b.x - a.x);
      if (s.wet.some(([t0, t1]) => t >= t0 && t <= t1)) return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------------- the city */

export type BuildingKind = "tower" | "office" | "hotel" | "store" | "house" | "mansion" | "warehouse" | "trailer" | "hospital" | "station" | "bank" | "garage";

export interface Building {
  id: number;
  x: number;
  z: number;
  hw: number;
  hd: number;
  h: number;
  kind: BuildingKind;
  style: number;
  color: string;
  /** Which side faces the street: 0 east, 1 south, 2 west, 3 north. */
  face: number;
  sign?: string;
  /** A setback crown on a tower: from this height up it's this much narrower. */
  crown?: { from: number; inset: number };
}

export type PropKind =
  | "palm"
  | "tree"
  | "mangrove"
  | "lamp"
  | "bench"
  | "hydrant"
  | "umbrella"
  | "lifeguard"
  | "volley"
  | "container"
  | "crane"
  | "pump"
  | "canopy"
  | "pool"
  | "yacht"
  | "dumpster"
  | "fence"
  | "billboard"
  | "fountain"
  | "busstop"
  | "planter";

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  ry: number;
  /** Size / variant (meaning depends on kind). */
  s: number;
  color?: string;
}

export type PoiKind = "safehouse" | "hospital" | "police" | "gunshop" | "clothes" | "respray" | "store" | "bank" | "chopshop" | "gas" | "marina" | "airboat" | "pier" | "mansion";

export interface Poi {
  id: string;
  kind: PoiKind;
  name: string;
  /** Where to stand (on the sidewalk in front of the door). */
  x: number;
  z: number;
  /** Facing the street (unit). */
  fx: number;
  fz: number;
  district: District;
  building?: number;
}

export interface ParkSpot {
  x: number;
  z: number;
  h: number;
}

export interface City {
  roads: Roads;
  buildings: Building[];
  props: Prop[];
  pois: Poi[];
  parks: { x0: number; z0: number; x1: number; z1: number; name: string }[];
  parking: ParkSpot[];
  /** Spatial hash of buildings and solid props, 50 m cells. */
  grid: Map<number, number[]>;
  solids: Solid[];
}

/** Something you can't walk or drive through: a box (buildings, containers) or a post. */
export interface Solid {
  x: number;
  z: number;
  hw: number;
  hd: number;
  /** A round post (radius hw) rather than a box. */
  round?: boolean;
  h: number;
  b?: number;
}

const CELL = 50;
const cellKey = (cx: number, cz: number) => (cx + 1000) * 4000 + (cz + 1000);

const PASTEL = ["#f3c1d2", "#bfe3e0", "#f6e2a6", "#c9d8f2", "#f2cba8", "#d9c7ef", "#e8f0f2", "#c5e8c1"];
const SOL = ["#e9724c", "#f2b134", "#3fa7a0", "#e14b6a", "#7a5cc4", "#f4d35e", "#4b8fd6", "#f08a5d"];
const HOUSE = ["#f1e3c8", "#e8d6c2", "#d9e6ef", "#f2d4c2", "#e3eadb", "#f5efe0", "#e6d0dc"];
const HOTELS = ["The Coral", "Hotel Flamingo", "Seaspray", "The Palms", "Hotel del Sol", "Sandpiper", "The Tidewater", "Hotel Nautilus", "Starfish Inn", "The Lumière", "Pelican Arms", "Hotel Ocaso", "Bluewave", "The Avalon Deco", "Moonglow"];
const SHOPS = ["Café Brisa", "Bodega Luz", "La Ventana", "Panadería Sol", "Mango Juice", "Taquería 8", "Salsa Club", "Botánica", "Farmacia", "Barbería", "Lavandería", "Joyería", "Discos Ritmo", "Cuban Café", "Mercado"];

export interface Blk {
  i: number;
  j: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  district: District;
}

/** The road a line has at v (with its class), or null if there's none there. */
function lineAt(l: Line, v: number) {
  if (!covers(l, v)) return null;
  if (l.skip?.some(([a, b]) => v > a && v < b)) return null;
  return l;
}

function blocks(): Blk[] {
  const out: Blk[] = [];
  const xs = NS.filter((l) => l.at < 700);
  const zs = EW.filter((l) => l.from < 700);
  const main = (lines: Line[]) => lines.map((l) => l.at).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  const bx = [westCoast(0) + 40, ...main(xs), 700];
  const bz = [northCoast(0) + 30, ...main(zs), 700];
  const inset = (lines: Line[], at: number, mid: number) => {
    const l = lines.find((q) => q.at === at && lineAt(q, mid));
    return l ? ROAD[l.cls].half + ROAD[l.cls].walk + 1 : 2;
  };
  for (let i = 0; i < bx.length - 1; i++)
    for (let j = 0; j < bz.length - 1; j++) {
      const mx = (bx[i] + bx[i + 1]) / 2;
      const mz = (bz[j] + bz[j + 1]) / 2;
      const x0 = bx[i] + inset(xs, bx[i], mz);
      const x1 = bx[i + 1] - inset(xs, bx[i + 1], mz);
      const z0 = bz[j] + inset(zs, bz[j], mx);
      const z1 = bz[j + 1] - inset(zs, bz[j + 1], mx);
      if (x1 - x0 < 8 || z1 - z0 < 8) continue;
      out.push({ i, j, x0, z0, x1, z1, district: districtAt(mx, mz) });
    }
  // Marina Keys.
  const kx = [830, 930, 1030];
  const kz = [200, 330, 460, 560];
  for (let i = 0; i < kx.length - 1; i++)
    for (let j = 0; j < kz.length - 1; j++)
      out.push({ i: 100 + i, j: 100 + j, x0: kx[i] + 8, x1: kx[i + 1] - 8, z0: kz[j] + (kz[j] === 330 ? 12 : 8), z1: kz[j + 1] - (kz[j + 1] === 330 ? 12 : 8), district: "keys" });
  return out;
}

/** Fixed places: the safehouses, shops and services, set on given blocks and sides. */
interface PoiSpec {
  id: string;
  kind: PoiKind;
  name: string;
  /** Near this point: the nearest block, and the side of it toward the point. */
  x: number;
  z: number;
  bkind?: BuildingKind;
  h?: number;
  w?: number;
  d?: number;
}

const POI_SPECS: PoiSpec[] = [
  { id: "safe-nina", kind: "safehouse", name: "Nina's apartment", x: 448, z: -300, bkind: "hotel", h: 22, w: 34, d: 26 },
  { id: "safe-dex", kind: "safehouse", name: "Dex's trailer", x: -780, z: -60, bkind: "trailer", h: 3.4, w: 14, d: 6 },
  { id: "hospital", kind: "hospital", name: "Solano General Hospital", x: -360, z: -300, bkind: "hospital", h: 30, w: 60, d: 44 },
  { id: "police-hq", kind: "police", name: "Solano Police HQ", x: 40, z: -500, bkind: "station", h: 24, w: 50, d: 36 },
  { id: "police-heights", kind: "police", name: "Palm Heights Precinct", x: -260, z: 180, bkind: "station", h: 12, w: 36, d: 26 },
  { id: "bank", kind: "bank", name: "Solano Union Bank", x: 140, z: -400, bkind: "bank", h: 60, w: 44, d: 40 },
  { id: "gun-cs", kind: "gunshop", name: "Bullseye Arms", x: 240, z: 80, bkind: "store", h: 8, w: 18, d: 18 },
  { id: "gun-mid", kind: "gunshop", name: "Bullseye Arms", x: -560, z: -480, bkind: "store", h: 8, w: 18, d: 18 },
  { id: "clothes-strand", kind: "clothes", name: "Threadline", x: 340, z: -10, bkind: "store", h: 10, w: 20, d: 18 },
  { id: "clothes-dt", kind: "clothes", name: "Threadline", x: -60, z: -290, bkind: "store", h: 10, w: 20, d: 18 },
  { id: "respray-cs", kind: "respray", name: "Spray Bay", x: -160, z: 270, bkind: "garage", h: 7, w: 22, d: 20 },
  { id: "respray-mid", kind: "respray", name: "Spray Bay", x: -460, z: -600, bkind: "garage", h: 7, w: 22, d: 20 },
  { id: "store-1", kind: "store", name: "Quik Stop", x: 40, z: 0, bkind: "store", h: 6, w: 16, d: 14 },
  { id: "store-2", kind: "store", name: "Quik Stop", x: 340, z: -580, bkind: "store", h: 6, w: 16, d: 14 },
  { id: "store-3", kind: "store", name: "Quik Stop", x: -460, z: 80, bkind: "store", h: 6, w: 16, d: 14 },
  { id: "store-4", kind: "store", name: "Quik Stop", x: -560, z: 280, bkind: "store", h: 6, w: 16, d: 14 },
  { id: "store-5", kind: "store", name: "Quik Stop", x: 240, z: 380, bkind: "store", h: 6, w: 16, d: 14 },
  { id: "store-6", kind: "store", name: "Quik Stop", x: -260, z: -700, bkind: "store", h: 6, w: 16, d: 14 },
  { id: "gas-1", kind: "gas", name: "Sunline Gas", x: -160, z: 100, bkind: "store", h: 5, w: 14, d: 12 },
  { id: "gas-2", kind: "gas", name: "Sunline Gas", x: -660, z: -200, bkind: "store", h: 5, w: 14, d: 12 },
  { id: "gas-3", kind: "gas", name: "Sunline Gas", x: 340, z: 480, bkind: "store", h: 5, w: 14, d: 12 },
  { id: "chop", kind: "chopshop", name: "Dockside Motors", x: -60, z: 560, bkind: "warehouse", h: 10, w: 40, d: 30 },
  { id: "marina", kind: "marina", name: "Marina Keys Yacht Club", x: 830, z: 540, bkind: "store", h: 8, w: 26, d: 18 },
  { id: "mansion", kind: "mansion", name: "Villa Esmeralda", x: 1030, z: 280, bkind: "mansion", h: 11, w: 36, d: 30 },
  { id: "airboat", kind: "airboat", name: "Gator Bait Airboats", x: -860, z: -70, bkind: "trailer", h: 4, w: 12, d: 8 },
  { id: "pier", kind: "pier", name: "Solano Pier", x: 560, z: -205 },
];

/** Build the whole map from a seed (the layout is fixed; the seed varies details). */
export function generate(seed = 7): City {
  const rng = createRng(seed);
  const roads = buildRoads();
  roadsRef = roads;
  nodesRef = roads.nodes;
  bridgeSegs = roads.segs.filter((s) => s.bridge);
  const buildings: Building[] = [];
  const props: Prop[] = [];
  const pois: Poi[] = [];
  const parks: City["parks"] = [];
  const parking: ParkSpot[] = [];
  const blks = blocks();
  const taken: { x0: number; z0: number; x1: number; z1: number }[] = [];
  const free = (x0: number, z0: number, x1: number, z1: number) => !taken.some((t) => x0 < t.x1 && x1 > t.x0 && z0 < t.z1 && z1 > t.z0);
  const dry = (x0: number, z0: number, x1: number, z1: number) => {
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) if (groundY(x, z) < -0.05) return false;
    return true;
  };
  const addB = (b: Omit<Building, "id">) => {
    const x0 = b.x - b.hw;
    const x1 = b.x + b.hw;
    const z0 = b.z - b.hd;
    const z1 = b.z + b.hd;
    if (!free(x0, z0, x1, z1) || !dry(x0, z0, x1, z1) || onRoadRect(roads, x0, z0, x1, z1)) return -1;
    taken.push({ x0, z0, x1, z1 });
    buildings.push({ ...b, id: buildings.length });
    return buildings.length - 1;
  };

  // Fixed places first, on the side of their block nearest the point given.
  for (const sp of POI_SPECS) {
    if (sp.kind === "pier") {
      pois.push({ id: sp.id, kind: sp.kind, name: sp.name, x: sp.x, z: sp.z, fx: -1, fz: 0, district: districtAt(sp.x, sp.z) });
      continue;
    }
    let best: Blk | null = null;
    let bd = Infinity;
    for (const b of blks) {
      const cx = Math.max(b.x0, Math.min(b.x1, sp.x));
      const cz = Math.max(b.z0, Math.min(b.z1, sp.z));
      const d = Math.hypot(cx - sp.x, cz - sp.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best) continue;
    const b = best;
    // The side: the edge nearest the point.
    const ds = [Math.abs(sp.x - b.x1), Math.abs(sp.z - b.z1), Math.abs(sp.x - b.x0), Math.abs(sp.z - b.z0)];
    const face = ds.indexOf(Math.min(...ds));
    const w = Math.min(sp.w ?? 16, (face % 2 === 0 ? b.z1 - b.z0 : b.x1 - b.x0) - 2);
    const d = Math.min(sp.d ?? 14, (face % 2 === 0 ? b.x1 - b.x0 : b.z1 - b.z0) - 2);
    const along = face % 2 === 0 ? Math.max(b.z0 + w / 2 + 1, Math.min(b.z1 - w / 2 - 1, sp.z)) : Math.max(b.x0 + w / 2 + 1, Math.min(b.x1 - w / 2 - 1, sp.x));
    const setback = sp.bkind === "mansion" ? 10 : sp.kind === "gas" ? 14 : 1;
    let x: number, z: number, hw: number, hd: number, fx = 0, fz = 0;
    if (face === 0) [x, z, hw, hd, fx] = [b.x1 - setback - d / 2, along, d / 2, w / 2, 1];
    else if (face === 2) [x, z, hw, hd, fx] = [b.x0 + setback + d / 2, along, d / 2, w / 2, -1];
    else if (face === 1) [x, z, hw, hd, fz] = [along, b.z1 - setback - d / 2, w / 2, d / 2, 1];
    else [x, z, hw, hd, fz] = [along, b.z0 + setback + d / 2, w / 2, d / 2, -1];
    const kind = sp.bkind ?? "store";
    const color = kind === "hotel" ? "#f6d4c8" : kind === "station" ? "#d5d9e0" : kind === "hospital" ? "#eef1f4" : kind === "bank" ? "#e4dccb" : kind === "trailer" ? "#d8d2c0" : kind === "mansion" ? "#f5f1e6" : kind === "garage" ? "#cfd3d8" : rng.pick(SOL);
    const id = addB({ x, z, hw, hd, h: sp.h ?? 8, kind, style: rng.int(0, 3), color, face, sign: sp.kind === "safehouse" ? undefined : sp.name, crown: kind === "bank" ? { from: 40, inset: 6 } : undefined });
    // The marker: just off the door, on the sidewalk.
    const out = sp.kind === "gas" ? 16 : sp.bkind === "mansion" ? 12 : 3;
    const px = x + fx * (hw + out);
    const pz = z + fz * (hd + out);
    pois.push({ id: sp.id, kind: sp.kind, name: sp.name, x: px, z: pz, fx, fz, district: districtAt(px, pz), building: id >= 0 ? id : undefined });
    if (sp.kind === "gas") {
      // The forecourt: a canopy over two pumps.
      const cx = x + fx * (hw + 8);
      const cz = z + fz * (hd + 8);
      props.push({ kind: "canopy", x: cx, z: cz, ry: face % 2 === 0 ? Math.PI / 2 : 0, s: 1 });
      for (const k of [-1, 1]) props.push({ kind: "pump", x: cx + (face % 2 === 0 ? 0 : k * 4), z: cz + (face % 2 === 0 ? k * 4 : 0), ry: face % 2 === 0 ? Math.PI / 2 : 0, s: 1 });
      taken.push({ x0: cx - 8, z0: cz - 8, x1: cx + 8, z1: cz + 8 });
    }
  }

  // Bayfront Park, a lake in the middle; a park in Calle Sol.
  parks.push({ x0: -556, z0: -646, x1: -364, z1: -444, name: "Bayfront Park" });
  parks.push({ x0: -152, z0: 36, x1: -68, z1: 124, name: "Plaza del Sol" });
  for (const p of parks) taken.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1 });

  for (const b of blks) fillBlock(rng, b, addB, props, parking);

  // Parks: trees, paths, a fountain.
  for (const p of parks) {
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    props.push({ kind: "fountain", x: cx, z: cz, ry: 0, s: p.x1 - p.x0 > 120 ? 2 : 1 });
    const n = Math.round(((p.x1 - p.x0) * (p.z1 - p.z0)) / 260);
    for (let i = 0; i < n; i++) {
      const x = rng.range(p.x0 + 4, p.x1 - 4);
      const z = rng.range(p.z0 + 4, p.z1 - 4);
      if (Math.hypot(x - cx, z - cz) < 14) continue;
      props.push({ kind: rng.next() < 0.45 ? "palm" : "tree", x, z, ry: rng.range(0, 6.28), s: rng.range(0.8, 1.25) });
    }
    for (let i = 0; i < 6; i++) props.push({ kind: "bench", x: cx + Math.cos(i) * 18, z: cz + Math.sin(i) * 18, ry: -i + Math.PI / 2, s: 1 });
  }

  streetscape(rng, roads, props);
  beach(rng, props);
  harbor(rng, props, taken);
  glades(rng, props);
  keysExtras(rng, props);

  const city: City = { roads, buildings, props, pois, parks, parking, grid: new Map(), solids: [] };
  index(city);
  return city;
}

type AddB = (b: Omit<Building, "id">) => number;

/** Does a rectangle touch a street (carriageway or sidewalk)? */
function onRoadRect(roads: Roads, x0: number, z0: number, x1: number, z1: number) {
  for (const s of roads.segs) {
    const A = roads.nodes[s.a];
    const B = roads.nodes[s.b];
    const h = streetHalf(s) - 0.5;
    const ax0 = Math.min(A.x, B.x) - (s.axis === "ns" ? h : 0);
    const ax1 = Math.max(A.x, B.x) + (s.axis === "ns" ? h : 0);
    const az0 = Math.min(A.z, B.z) - (s.axis === "ew" ? h : 0);
    const az1 = Math.max(A.z, B.z) + (s.axis === "ew" ? h : 0);
    if (x1 > ax0 && x0 < ax1 && z1 > az0 && z0 < az1) return true;
  }
  return false;
}

/** Fill a block with buildings in its district's style, fronting the streets round it. */
function fillBlock(rng: Rng, b: Blk, addB: AddB, props: Prop[], parking: ParkSpot[]) {
  const W = b.x1 - b.x0;
  const D = b.z1 - b.z0;
  const d = b.district;
  if (d === "beach") return;
  // Rows of lots facing north and south (the longer frontage), then fill the ends.
  const lots = (front: 1 | 3, wMin: number, wMax: number, depth: number, gap: number, setback: number, make: (x: number, z: number, hw: number, hd: number, face: number) => void) => {
    let x = b.x0 + rng.range(0, gap);
    while (x < b.x1 - wMin) {
      const w = Math.min(rng.range(wMin, wMax), b.x1 - x);
      if (w < wMin) break;
      const hd = Math.min(depth, D / 2 - 1) / 2;
      const z = front === 3 ? b.z0 + setback + hd : b.z1 - setback - hd;
      make(x + w / 2, z, w / 2 - 0.5, hd, front);
      x += w + rng.range(0, gap);
    }
  };
  const ends = (wMin: number, wMax: number, depth: number, gap: number, setback: number, make: (x: number, z: number, hw: number, hd: number, face: number) => void) => {
    // East and west frontages, between the north and south rows.
    for (const face of [0, 2] as const) {
      let z = b.z0 + Math.min(depth, D / 2) + 2;
      while (z < b.z1 - Math.min(depth, D / 2) - wMin) {
        const w = Math.min(rng.range(wMin, wMax), b.z1 - Math.min(depth, D / 2) - 2 - z);
        if (w < wMin) break;
        const hw = Math.min(depth, W / 2 - 1) / 2;
        const x = face === 0 ? b.x1 - setback - hw : b.x0 + setback + hw;
        make(x, z + w / 2, hw, w / 2 - 0.5, face);
        z += w + rng.range(0, gap);
      }
    }
  };
  const near = (x: number, z: number) => Math.hypot(x - 140, z + 400);
  switch (d) {
    case "downtown": {
      const tall = (x: number, z: number, hw: number, hd: number, face: number) => {
        const core = Math.max(0, 1 - near(x, z) / 520);
        const h = Math.round(rng.range(24, 60) + core * rng.range(30, 130));
        const kind: BuildingKind = h > 50 ? "tower" : "office";
        addB({ x, z, hw, hd, h, kind, style: rng.int(0, 3), color: rng.pick(["#cfd6df", "#b9c4d1", "#e0dccf", "#a8b5c2", "#d6cfc4"]), face, crown: h > 70 && rng.next() < 0.6 ? { from: Math.round(h * rng.range(0.6, 0.8)), inset: Math.min(hw, hd) * 0.25 } : undefined });
      };
      lots(3, 26, 44, 40, 6, 1, tall);
      lots(1, 26, 44, 40, 6, 1, tall);
      ends(22, 34, 30, 6, 1, tall);
      break;
    }
    case "midtown": {
      const mid = (x: number, z: number, hw: number, hd: number, face: number) => {
        const h = Math.round(rng.range(12, 44));
        addB({ x, z, hw, hd, h, kind: h > 20 ? "office" : "store", style: rng.int(0, 3), color: rng.pick(["#dcd3c4", "#cfd6df", "#e6dccb", "#c8c2b8"]), face });
      };
      lots(3, 22, 36, 32, 8, 2, mid);
      lots(1, 22, 36, 32, 8, 2, mid);
      ends(20, 30, 26, 8, 2, mid);
      break;
    }
    case "strand": {
      // Hotels face the boulevard (east); smaller ones on the cross streets.
      const hotel = (x: number, z: number, hw: number, hd: number, face: number) => {
        const h = Math.round(rng.range(12, 34));
        const name = rng.pick(HOTELS);
        addB({ x, z, hw, hd, h, kind: "hotel", style: rng.int(0, 3), color: rng.pick(PASTEL), face, sign: face === 0 && rng.next() < 0.8 ? name : undefined });
      };
      ends(26, 40, 34, 4, 2, hotel);
      lots(3, 20, 30, 24, 6, 2, hotel);
      lots(1, 20, 30, 24, 6, 2, hotel);
      break;
    }
    case "callesol": {
      const shop = (x: number, z: number, hw: number, hd: number, face: number) => {
        const h = Math.round(rng.range(6, 14));
        addB({ x, z, hw, hd, h, kind: "store", style: rng.int(0, 3), color: rng.pick(SOL), face, sign: rng.next() < 0.55 ? rng.pick(SHOPS) : undefined });
      };
      lots(3, 12, 20, 22, 3, 0.5, shop);
      lots(1, 12, 20, 22, 3, 0.5, shop);
      ends(12, 18, 20, 3, 0.5, shop);
      break;
    }
    case "heights":
    case "keys": {
      const big = d === "keys";
      const house = (x: number, z: number, hw: number, hd: number, face: number) => {
        const h = big ? rng.range(8, 11) : rng.range(5.5, 7.5);
        const id = addB({ x, z, hw, hd, h, kind: big ? "mansion" : "house", style: rng.int(0, 3), color: rng.pick(big ? ["#f5f1e6", "#efe6d6", "#e6eef0", "#f3e3e0"] : HOUSE), face });
        if (id < 0) return;
        // A pool out the back, a palm or two out front, a car on the drive.
        const back = face === 3 ? 1 : face === 1 ? -1 : 0;
        if (rng.next() < (big ? 0.9 : 0.35) && back) props.push({ kind: "pool", x, z: z + back * (hd + 6), ry: 0, s: big ? 1.4 : 1 });
        const fz = face === 3 ? -1 : face === 1 ? 1 : 0;
        const fx = face === 0 ? 1 : face === 2 ? -1 : 0;
        if (rng.next() < 0.7) props.push({ kind: "palm", x: x + fx * (hw + 3) + (fz ? rng.range(-hw, hw) : 0), z: z + fz * (hd + 3) + (fx ? rng.range(-hd, hd) : 0), ry: rng.range(0, 6.28), s: rng.range(0.85, 1.2) });
        if (rng.next() < 0.45) parking.push({ x: x + fx * (hw + 3.5) + (fz ? hw * 0.6 : 0), z: z + fz * (hd + 3.5) + (fx ? hd * 0.6 : 0), h: face % 2 === 0 ? 0 : Math.PI / 2 });
      };
      if (big) {
        lots(3, 34, 46, 26, 10, 10, house);
        lots(1, 34, 46, 26, 10, 10, house);
      } else {
        lots(3, 18, 24, 15, 4, 6, house);
        lots(1, 18, 24, 15, 4, 6, house);
        ends(18, 22, 14, 4, 6, house);
      }
      break;
    }
    case "harbor": {
      const shed = (x: number, z: number, hw: number, hd: number, face: number) => {
        addB({ x, z, hw, hd, h: Math.round(rng.range(8, 15)), kind: "warehouse", style: rng.int(0, 1), color: rng.pick(["#b9c0c6", "#c9b9a0", "#9fb0bf", "#d0c8bb"]), face });
      };
      lots(3, 34, 56, 40, 12, 3, shed);
      lots(1, 34, 56, 40, 12, 3, shed);
      break;
    }
    case "glades": {
      const trailer = (x: number, z: number, hw: number, hd: number, face: number) => {
        if (rng.next() < 0.45) return;
        const w = Math.min(hw, 7);
        const dd = Math.min(hd, 3);
        addB({ x, z, hw: face % 2 ? w : dd, hd: face % 2 ? dd : w, h: 3.2, kind: "trailer", style: rng.int(0, 3), color: rng.pick(["#d8d2c0", "#c9d6d8", "#e0cdb0", "#b8c4b0"]), face });
      };
      lots(3, 18, 26, 8, 16, 6, trailer);
      lots(1, 18, 26, 8, 16, 6, trailer);
      break;
    }
  }
  // Street trees in the leafier districts; parking along the curb.
  void props;
}

/** Lamps, palms, hydrants, benches and bus stops along the streets. */
function streetscape(rng: Rng, roads: Roads, props: Prop[]) {
  for (const s of roads.segs) {
    const a = roads.nodes[s.a];
    const b = roads.nodes[s.b];
    const h = ROAD[s.cls].half + 0.6;
    const dist = districtAt((a.x + b.x) / 2, (a.z + b.z) / 2);
    const palmy = dist === "strand" || dist === "callesol" || dist === "heights" || dist === "keys" || dist === "beach" || s.name === "Calle Sol" || s.name === "Causeway Blvd";
    const n = Math.floor(s.len / 26);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (s.wet.some(([t0, t1]) => t > t0 - 0.05 && t < t1 + 0.05)) continue;
      for (const side of [-1, 1]) {
        const ox = s.axis === "ns" ? side * h : 0;
        const oz = s.axis === "ew" ? side * h : 0;
        const px = x + ox;
        const pz = z + oz;
        if (groundY(px, pz) < -0.05) continue;
        const ry = s.axis === "ns" ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
        if (i % 2 === 0) props.push({ kind: "lamp", x: px, z: pz, ry, s: 1 });
        else if (palmy && dist !== "glades") props.push({ kind: "palm", x: px + (s.axis === "ns" ? side * 1.2 : 0), z: pz + (s.axis === "ew" ? side * 1.2 : 0), ry: rng.range(0, 6.28), s: rng.range(0.9, 1.25) });
        else if (dist === "midtown" || dist === "downtown") props.push({ kind: "tree", x: px + (s.axis === "ns" ? side * 1.2 : 0), z: pz + (s.axis === "ew" ? side * 1.2 : 0), ry: rng.range(0, 6.28), s: rng.range(0.8, 1.1) });
      }
      if (i === Math.floor(n / 2) && s.cls === "avenue" && dist !== "glades") props.push({ kind: "busstop", x: x + (s.axis === "ns" ? h + 1.2 : 0), z: z + (s.axis === "ew" ? h + 1.2 : 0), ry: s.axis === "ns" ? Math.PI / 2 : 0, s: 1 });
      if (i === 1 && rng.next() < 0.5) props.push({ kind: "hydrant", x: x + (s.axis === "ns" ? -h : 0), z: z + (s.axis === "ew" ? -h : 0), ry: 0, s: 1 });
    }
  }
}

/** Solano Beach: palms along the boulevard, lifeguard towers, umbrellas, volleyball. */
function beach(rng: Rng, props: Prop[]) {
  for (let z = -780; z < 600; z += 9) {
    const x = 450 + ROAD.avenue.half + ROAD.avenue.walk + 3;
    props.push({ kind: "palm", x: x + rng.range(-1, 1), z: z + rng.range(-2, 2), ry: rng.range(0, 6.28), s: rng.range(1, 1.35) });
  }
  for (let z = -740; z < 580; z += 130) {
    const x = eastCoast(z) - 34;
    props.push({ kind: "lifeguard", x, z, ry: -Math.PI / 2, s: 1, color: rng.pick(["#f2b134", "#e14b6a", "#3fa7a0", "#7a5cc4"]) });
  }
  for (let i = 0; i < 140; i++) {
    const z = rng.range(-760, 590);
    const x = rng.range(480, eastCoast(z) - 40);
    if (Math.abs(z + 205) < 16) continue;
    props.push({ kind: "umbrella", x, z, ry: rng.range(0, 6.28), s: 1, color: rng.pick(["#e14b6a", "#f2b134", "#3fa7a0", "#4b8fd6", "#f6f1e7", "#7a5cc4"]) });
  }
  for (const z of [-480, -60, 260]) props.push({ kind: "volley", x: 530, z, ry: 0, s: 1 });
  for (const z of [-600, -350, 100, 420]) props.push({ kind: "billboard", x: 470, z, ry: -Math.PI / 2, s: 1 });
}

/** The Harbor: container stacks, cranes on the quay. */
function harbor(rng: Rng, props: Prop[], taken: { x0: number; z0: number; x1: number; z1: number }[]) {
  const colors = ["#c0392b", "#2c6fa8", "#e67e22", "#27ae60", "#8e44ad", "#7f8c8d", "#d4ac0d", "#16a085"];
  const yards = [
    { x0: -50, x1: 130, z0: 440, z1: 520 },
    { x0: -50, x1: 230, z0: 545, z1: 610 },
    { x0: 150, x1: 230, z0: 440, z1: 520 },
  ];
  for (const y of yards) {
    for (let x = y.x0 + 4; x < y.x1 - 6; x += 7)
      for (let z = y.z0 + 4; z < y.z1 - 14; z += 16) {
        if (taken.some((t) => x > t.x0 - 4 && x < t.x1 + 4 && z > t.z0 - 8 && z < t.z1 + 8)) continue;
        if (rng.next() < 0.18) continue;
        props.push({ kind: "container", x, z: z + 6, ry: Math.PI / 2, s: rng.int(1, 3), color: rng.pick(colors) });
      }
  }
  for (const x of [-180, -40, 100, 200]) props.push({ kind: "crane", x, z: southCoast(x) - 12, ry: 0, s: 1 });
}

/** The Glades: mangroves round the ponds. */
function glades(rng: Rng, props: Prop[]) {
  for (let i = 0; i < 520; i++) {
    const x = rng.range(-890, -680);
    const z = rng.range(-800, 660);
    const g = groundY(x, z);
    if (g < -0.1 || nearRoad(x, z, 9)) continue;
    props.push({ kind: rng.next() < 0.7 ? "mangrove" : "tree", x, z, ry: rng.range(0, 6.28), s: rng.range(0.7, 1.3) });
  }
}

/** Marina Keys: yachts in the marina, palms everywhere. */
function keysExtras(rng: Rng, props: Prop[]) {
  for (let i = 0; i < 9; i++) props.push({ kind: "yacht", x: 735 - (i % 3) * 22, z: 520 + Math.floor(i / 3) * 30 + rng.range(-3, 3), ry: Math.PI / 2, s: rng.range(0.8, 1.3) });
  for (let i = 0; i < 160; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.82, 0.96);
    const x = KEYS.x + Math.cos(a) * KEYS.rx * r;
    const z = KEYS.z + Math.sin(a) * KEYS.rz * r;
    if (nearRoad(x, z, 8) || groundY(x, z) < -0.05) continue;
    props.push({ kind: "palm", x, z, ry: rng.range(0, 6.28), s: rng.range(0.9, 1.3) });
  }
}

/* -------------------------------------------------------------------------------- lookups */

let roadsRef: Roads | null = null;

/** Is (x, z) within `pad` metres of a road's carriageway? */
export function nearRoad(x: number, z: number, pad = 0) {
  const r = roadsRef ?? (roadsRef = buildRoads());
  for (const s of r.segs) {
    const a = r.nodes[s.a];
    const b = r.nodes[s.b];
    const h = ROAD[s.cls].half + pad;
    if (s.axis === "ns") {
      if (Math.abs(x - a.x) <= h && z >= a.z - h && z <= b.z + h) return true;
    } else if (Math.abs(z - a.z) <= h && x >= a.x - h && x <= b.x + h) return true;
  }
  return false;
}

/** Collision shapes for buildings and solid props, hashed into 50 m cells. */
function index(city: City) {
  const solids: Solid[] = [];
  for (const b of city.buildings) solids.push({ x: b.x, z: b.z, hw: b.hw, hd: b.hd, h: b.h, b: b.id });
  for (const p of city.props) {
    if (p.kind === "palm" || p.kind === "tree" || p.kind === "lamp" || p.kind === "mangrove") solids.push({ x: p.x, z: p.z, hw: p.kind === "lamp" ? 0.18 : 0.35 * p.s, hd: 0, round: true, h: 6 });
    else if (p.kind === "container") {
      const along = Math.abs(Math.sin(p.ry)) > 0.5;
      solids.push({ x: p.x, z: p.z, hw: along ? 6.1 : 1.25, hd: along ? 1.25 : 6.1, h: 2.6 * p.s });
    } else if (p.kind === "pump") solids.push({ x: p.x, z: p.z, hw: 0.6, hd: 0.6, h: 1.8 });
    else if (p.kind === "fountain") solids.push({ x: p.x, z: p.z, hw: 5 * p.s, hd: 0, round: true, h: 1 });
    else if (p.kind === "lifeguard") solids.push({ x: p.x, z: p.z, hw: 2, hd: 2, h: 4 });
    else if (p.kind === "crane") for (const dx of [-6, 6]) for (const dz of [-6, 6]) solids.push({ x: p.x + dx, z: p.z + dz, hw: 0.8, hd: 0.8, h: 40 });
    else if (p.kind === "canopy") for (const dx of [-5, 5]) solids.push({ x: p.x + (Math.abs(Math.sin(p.ry)) > 0.5 ? 0 : dx), z: p.z + (Math.abs(Math.sin(p.ry)) > 0.5 ? dx : 0), hw: 0.3, hd: 0, round: true, h: 5 });
  }
  city.solids = solids;
  solids.forEach((s, i) => {
    const r = s.round ? s.hw : 0;
    const x0 = Math.floor((s.x - (s.round ? r : s.hw)) / CELL);
    const x1 = Math.floor((s.x + (s.round ? r : s.hw)) / CELL);
    const z0 = Math.floor((s.z - (s.round ? r : s.hd)) / CELL);
    const z1 = Math.floor((s.z + (s.round ? r : s.hd)) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = cellKey(cx, cz);
        const list = city.grid.get(k);
        if (list) list.push(i);
        else city.grid.set(k, [i]);
      }
  });
}

/** Solids near a point (within r metres, roughly). */
export function solidsNear(city: City, x: number, z: number, r: number, out: Solid[] = []) {
  out.length = 0;
  const x0 = Math.floor((x - r) / CELL);
  const x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL);
  const z1 = Math.floor((z + r) / CELL);
  const seen = new Set<number>();
  for (let cx = x0; cx <= x1; cx++)
    for (let cz = z0; cz <= z1; cz++) {
      const list = city.grid.get(cellKey(cx, cz));
      if (!list) continue;
      for (const i of list) {
        if (seen.has(i)) continue;
        seen.add(i);
        out.push(city.solids[i]);
      }
    }
  return out;
}

/** Push a circle (x, z, radius r) out of the solids near it; returns the push and the normal of the last hit. */
export function pushOut(city: City, p: { x: number; z: number }, r: number, scratch: Solid[] = [], maxH = Infinity) {
  let hit = false;
  let nx = 0;
  let nz = 0;
  for (const s of solidsNear(city, p.x, p.z, r + 8, scratch)) {
    if (s.h > maxH) continue;
    if (s.round) {
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      const d = Math.hypot(dx, dz);
      const m = r + s.hw;
      if (d < m && d > 1e-6) {
        p.x = s.x + (dx / d) * m;
        p.z = s.z + (dz / d) * m;
        nx = dx / d;
        nz = dz / d;
        hit = true;
      }
      continue;
    }
    const cx = Math.max(s.x - s.hw, Math.min(s.x + s.hw, p.x));
    const cz = Math.max(s.z - s.hd, Math.min(s.z + s.hd, p.z));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
      nx = dx / d;
      nz = dz / d;
    } else {
      // Centre inside the box: out the nearest face.
      const ex = [s.x + s.hw - p.x, p.x - (s.x - s.hw), s.z + s.hd - p.z, p.z - (s.z - s.hd)];
      const k = ex.indexOf(Math.min(...ex));
      if (k === 0) [p.x, nx, nz] = [s.x + s.hw + r, 1, 0];
      else if (k === 1) [p.x, nx, nz] = [s.x - s.hw - r, -1, 0];
      else if (k === 2) [p.z, nx, nz] = [s.z + s.hd + r, 0, 1];
      else [p.z, nx, nz] = [s.z - s.hd - r, 0, -1];
    }
  }
  return { hit, nx, nz };
}

/** Does a straight line at eye height clear the buildings? (Line of sight.) */
export function clearLine(city: City, ax: number, az: number, bx: number, bz: number, y = 1.6, scratch: Solid[] = []) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(d / 3);
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const list = solidsNear(city, mx, mz, d / 2 + 4, scratch);
  for (const s of list) {
    if (s.round || s.h < y) continue;
    // Slab test against the box.
    let t0 = 0;
    let t1 = 1;
    const dx = bx - ax;
    const dz = bz - az;
    const slab = (p: number, v: number, lo: number, hi: number) => {
      if (Math.abs(v) < 1e-9) return p >= lo && p <= hi;
      let ta = (lo - p) / v;
      let tb = (hi - p) / v;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      return t0 <= t1;
    };
    if (slab(ax, dx, s.x - s.hw, s.x + s.hw) && slab(az, dz, s.z - s.hd, s.z + s.hd)) return false;
  }
  void steps;
  return true;
}

/** The road segment a point is on (within the carriageway, plus pad), if any. */
export function segAt(city: City, x: number, z: number, pad = 0): Seg | null {
  const { nodes, segs } = city.roads;
  for (const s of segs) {
    const a = nodes[s.a];
    const b = nodes[s.b];
    const h = ROAD[s.cls].half + pad;
    if (s.axis === "ns") {
      if (Math.abs(x - a.x) <= h && z >= a.z && z <= b.z) return s;
    } else if (Math.abs(z - a.z) <= h && x >= a.x && x <= b.x) return s;
  }
  return null;
}

/** The nearest point on any road's centreline, with its segment. */
export function nearestRoad(city: City, x: number, z: number) {
  const { nodes, segs } = city.roads;
  let best: { seg: Seg; x: number; z: number; t: number; d: number } | null = null;
  for (const s of segs) {
    const a = nodes[s.a];
    const b = nodes[s.b];
    let t = s.axis === "ns" ? (z - a.z) / (b.z - a.z) : (x - a.x) / (b.x - a.x);
    t = Math.max(0, Math.min(1, t));
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    const d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { seg: s, x: px, z: pz, t, d };
  }
  return best!;
}

/** What's underfoot (for footsteps, tyre grip, the ground's colour). */
export type Surface = "road" | "walk" | "sand" | "grass" | "lot" | "water" | "deck";
export function surfaceAt(city: City, x: number, z: number): Surface {
  if (onDeck(x, z)) return "deck";
  const y = groundY(x, z);
  if (y < WATER_Y + 0.2) return "water";
  if (segAt(city, x, z)) return "road";
  if (segAt(city, x, z, 4.5)) return "walk";
  const d = districtAt(x, z);
  if (d === "beach" || y < -0.05) return "sand";
  if (city.parks.some((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1)) return "grass";
  if (d === "heights" || d === "keys" || d === "glades") return "grass";
  return "lot";
}

/** Shortest route along the roads between two points (A* over the junctions); returns the points to follow. */
export function route(city: City, fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
  const { nodes, segs } = city.roads;
  const s0 = nearestRoad(city, fx, fz);
  const s1 = nearestRoad(city, tx, tz);
  const startIds = [s0.seg.a, s0.seg.b];
  const goalIds = new Set([s1.seg.a, s1.seg.b]);
  const g = new Map<number, number>();
  const from = new Map<number, number>();
  const open: { id: number; f: number }[] = [];
  for (const id of startIds) {
    const d = Math.hypot(nodes[id].x - s0.x, nodes[id].z - s0.z);
    g.set(id, d);
    open.push({ id, f: d + Math.hypot(nodes[id].x - tx, nodes[id].z - tz) });
  }
  let end = -1;
  const closed = new Set<number>();
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (closed.has(cur.id)) continue;
    closed.add(cur.id);
    if (goalIds.has(cur.id)) {
      end = cur.id;
      break;
    }
    for (const sid of nodes[cur.id].dir) {
      if (sid < 0) continue;
      const s = segs[sid];
      const nb = s.a === cur.id ? s.b : s.a;
      const ng = (g.get(cur.id) ?? 0) + s.len;
      if (ng < (g.get(nb) ?? Infinity)) {
        g.set(nb, ng);
        from.set(nb, cur.id);
        open.push({ id: nb, f: ng + Math.hypot(nodes[nb].x - tx, nodes[nb].z - tz) });
      }
    }
  }
  const pts: { x: number; z: number }[] = [{ x: s0.x, z: s0.z }];
  if (end >= 0) {
    const chain: number[] = [];
    for (let c: number | undefined = end; c !== undefined; c = from.get(c)) chain.unshift(c);
    for (const id of chain) pts.push({ x: nodes[id].x, z: nodes[id].z });
  }
  pts.push({ x: s1.x, z: s1.z }, { x: tx, z: tz });
  return pts;
}

/** The street names round a point (for the HUD's location line). */
export function streetName(city: City, x: number, z: number) {
  const r = nearestRoad(city, x, z);
  return r.d < 30 ? r.seg.name : DISTRICTS[districtAt(x, z)].name;
}

export const LINES = { NS, EW };
