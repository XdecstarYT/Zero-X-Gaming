import { createRng, type Rng } from "../engine/rng";

/**
 * Melbourne, the Heatwave map. Pure, seeded data that the simulation, the renderer and the maps
 * all read. It's the real city's shape, squeezed to fit (roughly half size in the middle,
 * tighter further out), with the real street names:
 *
 *  - The CBD: the Hoddle Grid from Spencer St to Spring St, Flinders St to La Trobe St, with
 *    the little streets and laneways in between; Flinders Street Station, Federation Square and
 *    the cathedral on the corner of Swanston St.
 *  - The Yarra running west past Southbank's towers and the casino, under the bridges, into
 *    Victoria Harbour at Docklands and out past Swanson Dock and the West Gate to the bay.
 *  - Carlton and Fitzroy to the north, East Melbourne, the MCG in Yarra Park and Richmond to the
 *    east; Kings Domain, the Shrine and the Botanic Gardens across the river; South Yarra,
 *    Chapel St and Toorak's mansions; South Melbourne, Port Melbourne and Station Pier; Albert
 *    Park Lake; and St Kilda: Fitzroy St, Acland St, the beach, the pier and the fun park.
 *
 * Coordinates are metres on the ground: x east, z south, y up. Land is flat at y = 0; Port Phillip
 * Bay, the river, the harbour and the lakes sit at WATER_Y. Traffic drives on the LEFT.
 */

export const WATER_Y = -0.7;

export type RoadClass = "boulevard" | "avenue" | "street" | "lane";
export type District =
  | "cbd"
  | "southbank"
  | "docklands"
  | "docks"
  | "westmelb"
  | "carlton"
  | "fitzroy"
  | "eastmelb"
  | "richmond"
  | "southmelb"
  | "port"
  | "domain"
  | "southyarra"
  | "toorak"
  | "albertpark"
  | "stkilda"
  | "beach";

export const DISTRICTS: Record<District, { name: string; color: string }> = {
  cbd: { name: "Melbourne CBD", color: "#8a93a6" },
  southbank: { name: "Southbank", color: "#7f8ea8" },
  docklands: { name: "Docklands", color: "#7fa3b8" },
  docks: { name: "Swanson Dock", color: "#8aa0b4" },
  westmelb: { name: "West Melbourne", color: "#9a9a8e" },
  carlton: { name: "Carlton", color: "#c9a27e" },
  fitzroy: { name: "Fitzroy", color: "#b98a7a" },
  eastmelb: { name: "East Melbourne", color: "#a8b48a" },
  richmond: { name: "Richmond", color: "#c49a8a" },
  southmelb: { name: "South Melbourne", color: "#b8a08a" },
  port: { name: "Port Melbourne", color: "#9fb4b8" },
  domain: { name: "Kings Domain", color: "#7fae6a" },
  southyarra: { name: "South Yarra", color: "#c4a8b8" },
  toorak: { name: "Toorak", color: "#a8c49a" },
  albertpark: { name: "Albert Park", color: "#8fbf7a" },
  stkilda: { name: "St Kilda", color: "#e7a4b8" },
  beach: { name: "The beach", color: "#ecd9a6" },
};

/** Road dimensions by class: half the carriageway, the footpath, and lane centres from the middle. */
export const ROAD: Record<RoadClass, { half: number; walk: number; lanes: number[] }> = {
  boulevard: { half: 11, walk: 5, lanes: [2.25, 5.75, 9.25] },
  avenue: { half: 7.5, walk: 4.5, lanes: [2.25, 5.75] },
  street: { half: 4.5, walk: 3, lanes: [2.25] },
  lane: { half: 3, walk: 1.5, lanes: [1.5] },
};

/** The map's edges. */
export const BOUNDS = { x0: -1750, z0: -1000, x1: 1550, z1: 1700 };

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
  // The docks, West Melbourne, Docklands and Port Melbourne.
  { at: -1380, cls: "street", name: "Kensington Rd", from: -900, to: -440 },
  { at: -1380, cls: "street", name: "Swanson Dock Rd", from: -440, to: 100 },
  { at: -1200, cls: "street", name: "Appleton Dock Rd", from: -440, to: 60 },
  { at: -1080, cls: "street", name: "Macaulay Rd", from: -900, to: -440 },
  { at: -1080, cls: "street", name: "Graham St", from: 450, to: 800 },
  { at: -900, cls: "avenue", name: "Bay St", from: 380, to: 800 },
  { at: -820, cls: "street", name: "Dryburgh St", from: -900, to: -440 },
  { at: -820, cls: "street", name: "Waterfront Way", from: -440, to: 0 },
  { at: -660, cls: "avenue", name: "Harbour Esplanade", from: -440, to: 0 },
  { at: -660, cls: "street", name: "Montague St", from: 380, to: 800 },
  { at: -560, cls: "street", name: "Ferrars St", from: 380, to: 800 },
  // The Hoddle Grid, and on over the river.
  { at: -440, cls: "avenue", name: "Spencer St", from: -900, to: 0 },
  { at: -440, cls: "avenue", name: "Clarendon St", from: 0, to: 800 },
  { at: -440, cls: "street", name: "Aughtie Dr", from: 800, to: 1040 },
  { at: -330, cls: "avenue", name: "King St", from: -560, to: 0 },
  { at: -330, cls: "avenue", name: "Kings Way", from: 0, to: 800 },
  { at: -330, cls: "avenue", name: "The Esplanade", from: 1040, to: 1600 },
  { at: -220, cls: "avenue", name: "William St", from: -560, to: 0 },
  { at: -110, cls: "avenue", name: "Queen St", from: -560, to: 0 },
  { at: -110, cls: "street", name: "Queensbridge St", from: 0, to: 380 },
  { at: -110, cls: "street", name: "Acland St", from: 1130, to: 1400 },
  { at: 0, cls: "avenue", name: "Elizabeth St", from: -900, to: 0 },
  { at: 0, cls: "street", name: "Sturt St", from: 300, to: 800 },
  { at: 0, cls: "street", name: "Lakeside Dr", from: 800, to: 1040 },
  { at: 0, cls: "street", name: "Barkly St", from: 1130, to: 1600 },
  { at: 110, cls: "avenue", name: "Swanston St", from: -900, to: 0 },
  { at: 110, cls: "boulevard", name: "St Kilda Rd", from: 0, to: 1130 },
  { at: 110, cls: "avenue", name: "Brighton Rd", from: 1130, to: 1600 },
  { at: 220, cls: "avenue", name: "Lygon St", from: -900, to: -560 },
  { at: 220, cls: "avenue", name: "Russell St", from: -560, to: 0 },
  { at: 330, cls: "street", name: "Rathdowne St", from: -900, to: -560 },
  { at: 330, cls: "avenue", name: "Exhibition St", from: -560, to: 0 },
  { at: 440, cls: "avenue", name: "Nicholson St", from: -900, to: -560 },
  { at: 440, cls: "avenue", name: "Spring St", from: -560, to: 0 },
  // Fitzroy, East Melbourne, Richmond; South Yarra and Toorak.
  { at: 600, cls: "avenue", name: "Brunswick St", from: -900, to: -560 },
  { at: 600, cls: "street", name: "Lansdowne St", from: -560, to: 0 },
  { at: 600, cls: "street", name: "Anderson St", from: 560, to: 1130 },
  { at: 760, cls: "avenue", name: "Smith St", from: -900, to: -560 },
  { at: 760, cls: "street", name: "Powlett St", from: -560, to: 0 },
  { at: 760, cls: "street", name: "Darling St", from: 560, to: 1130 },
  { at: 900, cls: "avenue", name: "Hoddle St", from: -900, to: 0 },
  { at: 900, cls: "avenue", name: "Punt Rd", from: 0, to: 1130 },
  { at: 1040, cls: "street", name: "Lennox St", from: -560, to: 0 },
  { at: 1040, cls: "street", name: "Surrey Rd", from: 300, to: 1130 },
  { at: 1180, cls: "avenue", name: "Church St", from: -900, to: 300 },
  { at: 1180, cls: "avenue", name: "Chapel St", from: 300, to: 1130 },
  { at: 1340, cls: "street", name: "Burnley St", from: -900, to: 0 },
  { at: 1340, cls: "avenue", name: "Williams Rd", from: 300, to: 1130 },
];

const EW: Line[] = [
  { at: -900, cls: "avenue", name: "Racecourse Rd", from: -1380, to: -440 },
  { at: -900, cls: "street", name: "Princes St", from: -440, to: 1340 },
  { at: -760, cls: "street", name: "Grattan St", from: -440, to: 440 },
  { at: -760, cls: "avenue", name: "Johnston St", from: 440, to: 1340 },
  { at: -660, cls: "street", name: "Arden St", from: -1380, to: -440 },
  { at: -660, cls: "street", name: "Pelham St", from: -440, to: 330 },
  { at: -660, cls: "street", name: "Gertrude St", from: 440, to: 1340 },
  { at: -560, cls: "avenue", name: "Victoria St", from: -1380, to: 1340 },
  { at: -440, cls: "avenue", name: "Footscray Rd", from: -1380, to: -660 },
  { at: -440, cls: "avenue", name: "La Trobe St", from: -660, to: 440 },
  { at: -440, cls: "street", name: "Victoria Pde", from: 440, to: 1340 },
  { at: -385, cls: "lane", name: "Little Lonsdale St", from: -440, to: 440 },
  { at: -330, cls: "street", name: "Docklands Dr", from: -1380, to: -660 },
  { at: -330, cls: "avenue", name: "Lonsdale St", from: -440, to: 440 },
  { at: -330, cls: "street", name: "Gipps St", from: 440, to: 1340 },
  { at: -275, cls: "lane", name: "Little Bourke St", from: -440, to: 440 },
  { at: -220, cls: "avenue", name: "Bourke St", from: -660, to: 440 },
  { at: -165, cls: "lane", name: "Little Collins St", from: -440, to: 440 },
  { at: -165, cls: "street", name: "Albert St", from: 600, to: 900 },
  { at: -165, cls: "avenue", name: "Bridge Rd", from: 900, to: 1340 },
  { at: -110, cls: "avenue", name: "Collins St", from: -820, to: 440 },
  { at: -55, cls: "lane", name: "Flinders Lane", from: -440, to: 440 },
  { at: 0, cls: "avenue", name: "Flinders St", from: -820, to: 440 },
  { at: 0, cls: "avenue", name: "Wellington Pde", from: 440, to: 900 },
  { at: 0, cls: "avenue", name: "Swan St", from: 900, to: 1340 },
  // South of the river.
  { at: 300, cls: "street", name: "Southbank Blvd", from: -330, to: 110 },
  { at: 300, cls: "avenue", name: "Alexandra Ave", from: 110, to: 1340 },
  { at: 380, cls: "avenue", name: "City Rd", from: -900, to: 110 },
  { at: 450, cls: "avenue", name: "Williamstown Rd", from: -1200, to: -660 },
  { at: 560, cls: "street", name: "Park St", from: -1080, to: 110 },
  { at: 560, cls: "avenue", name: "Domain Rd", from: 110, to: 1340 },
  { at: 700, cls: "street", name: "Dorcas St", from: -1080, to: 110 },
  { at: 700, cls: "avenue", name: "Toorak Rd", from: 110, to: 1340 },
  { at: 800, cls: "street", name: "Beach St", from: -1080, to: -440 },
  { at: 800, cls: "street", name: "Albert Rd", from: -440, to: 110 },
  { at: 900, cls: "avenue", name: "Commercial Rd", from: 110, to: 1340 },
  { at: 1040, cls: "street", name: "Canterbury Rd", from: -440, to: 0 },
  { at: 1130, cls: "avenue", name: "Fitzroy St", from: -330, to: 110 },
  { at: 1130, cls: "avenue", name: "Dandenong Rd", from: 110, to: 1340 },
  { at: 1250, cls: "street", name: "Carlisle St", from: -330, to: 110 },
  { at: 1400, cls: "street", name: "Ormond Rd", from: -330, to: 110 },
];

/* -------------------------------------------------------------------------------- the shape */

/** Port Phillip Bay's shore, from the river mouth round to Elwood (land is north and east of it). */
const SHORE: [number, number][] = [
  [-1760, 590],
  [-1500, 612],
  [-1300, 690],
  [-1150, 800],
  [-1000, 878],
  [-800, 925],
  [-600, 975],
  [-520, 1040],
  [-470, 1120],
  [-445, 1250],
  [-420, 1400],
  [-385, 1550],
  [-350, 1720],
];
/** The bay as a polygon: the shore, then round the far side. */
const BAY: [number, number][] = [...SHORE, [-2700, 1720], [-2700, 590]];

/** The Yarra's centre line and half-width, west to east (the mouth opens into the bay). */
const RIVER: [number, number, number][] = [
  [-1800, 520, 120],
  [-1550, 420, 100],
  [-1300, 290, 85],
  [-1080, 150, 70],
  [-1000, 122, 60],
  [-700, 115, 45],
  [-440, 120, 42],
  [0, 130, 42],
  [300, 150, 40],
  [600, 205, 40],
  [900, 238, 38],
  [1180, 244, 38],
  [1600, 250, 38],
];
/** Victoria Harbour at Docklands. */
export const HARBOUR = { x0: -1000, z0: 40, x1: -690, z1: 200 };
/** Albert Park Lake and the Botanic Gardens' ornamental lake. */
const LAKES = [
  { x: -220, z: 920, rx: 198, rz: 92 },
  { x: 750, z: 430, rx: 62, rz: 36 },
];

/** Piers and jetties out over the water: walkable and drivable decks. */
export const PIERS: { x0: number; x1: number; z0: number; z1: number; name: string }[] = [
  { x0: -720, x1: -438, z0: 1176, z1: 1186, name: "St Kilda Pier" },
  { x0: -995, x1: -965, z0: 862, z1: 1150, name: "Station Pier" },
  { x0: -930, x1: -918, z0: 40, z1: 130, name: "Harbour Jetty" },
  { x0: -820, x1: -808, z0: 40, z1: 120, name: "Marina Jetty" },
  { x0: -60, x1: -18, z0: 160, z1: 176, name: "Southbank Landing" },
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

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function insidePoly(poly: [number, number][], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed distance (m) to the bay's shore: positive on land, negative out in the bay. */
export function shoreDistance(x: number, z: number) {
  if (z < 520) return 999;
  let d = Infinity;
  for (let i = 0; i < SHORE.length - 1; i++) d = Math.min(d, segDist(x, z, SHORE[i][0], SHORE[i][1], SHORE[i + 1][0], SHORE[i + 1][1]));
  return insidePoly(BAY, x, z) ? -d : d;
}

/** The river's centre z and half-width at x (or null off its ends). */
export function riverAt(x: number) {
  if (x < RIVER[0][0] || x > RIVER[RIVER.length - 1][0]) return null;
  let i = 0;
  while (i < RIVER.length - 2 && RIVER[i + 1][0] < x) i++;
  const [x0, z0, h0] = RIVER[i];
  const [x1, z1, h1] = RIVER[i + 1];
  const t = (x - x0) / (x1 - x0);
  return { z: z0 + (z1 - z0) * t, half: h0 + (h1 - h0) * t };
}

function inLake(x: number, z: number) {
  for (const l of LAKES) {
    const dx = (x - l.x) / l.rx;
    const dz = (z - l.z) / l.rz;
    if (dx * dx + dz * dz < 1) return true;
  }
  return false;
}

/** Inland water: the river, the harbour, the lakes (quay walls and banks, not beaches). */
function inlandWater(x: number, z: number) {
  const r = riverAt(x);
  if (r && Math.abs(z - r.z) < r.half) return true;
  if (x > HARBOUR.x0 && x < HARBOUR.x1 && z > HARBOUR.z0 && z < HARBOUR.z1) return true;
  return inLake(x, z);
}

/** Sand along the bay from Port Melbourne round to St Kilda and Elwood. */
function sandy(x: number, z: number, shore: number) {
  if (x < -1100 || shore > 140) return false;
  // How far inland the beach runs: wide at Port Melbourne and St Kilda, a strip elsewhere.
  const wide = x < -700 ? 70 : z > 1100 ? 95 : 55;
  return shore < wide;
}

/** Ground height: land at 0, beaches shelving into the bay, quays dropping into the river. */
export function groundY(x: number, z: number) {
  if (onDeck(x, z)) return 0;
  const d = shoreDistance(x, z);
  if (d < 0) return Math.max(-8, -1.2 + d * 0.12);
  if (inlandWater(x, z)) return -2.6;
  if (d < 14 && sandy(x, z, d)) return -1.2 + (d / 14) * 1.2;
  return 0;
}

export function isWater(x: number, z: number) {
  return groundY(x, z) < WATER_Y + 0.2;
}

export function onDeck(x: number, z: number) {
  for (const p of PIERS) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return true;
  return onBridge(x, z);
}

/** Is this the beach (sand on the bay)? */
export function onBeach(x: number, z: number) {
  const d = shoreDistance(x, z);
  return d >= 0 && sandy(x, z, d) && !nearRoad(x, z, 4);
}

export function districtAt(x: number, z: number): District {
  if (z > 520 && onBeach(x, z)) return "beach";
  const r = riverAt(x);
  const south = r ? z > r.z : z > 200;
  if (!south) {
    if (x < -1000) return z < -440 ? "westmelb" : "docks";
    if (x < -452) return z < -440 ? "westmelb" : "docklands";
    if (x <= 452) return z < -452 ? "carlton" : "cbd";
    if (z < -560) return "fitzroy";
    return x < 900 ? "eastmelb" : "richmond";
  }
  if (x < -1000) return z < 470 ? "docks" : "port";
  if (x < -660) return "port";
  if (z < 380 && x >= -452 && x < 452) return "southbank";
  if (x < 110) {
    if (z < 800) return "southmelb";
    if (z < 1040 && x >= -452) return "albertpark";
    return "stkilda";
  }
  if (z > 1040) return "stkilda";
  if (z < 560 && x < 900) return "domain";
  return x < 1180 ? "southyarra" : "toorak";
}

/** The name of where you are, for the HUD: the beaches have their own. */
export function placeName(x: number, z: number) {
  const d = districtAt(x, z);
  if (d === "beach") return x < -700 ? "Port Melbourne Beach" : z < 1100 ? "Middle Park Beach" : z > 1450 ? "Elwood Beach" : "St Kilda Beach";
  if (d === "eastmelb" && Math.hypot(x - 680, z - 105) < 160) return "Yarra Park";
  if (d === "domain" && x > 600) return "Royal Botanic Gardens";
  if (d === "albertpark" && Math.hypot((x + 220) / 230, (z - 920) / 125) < 1) return "Albert Park Lake";
  return DISTRICTS[d].name;
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
  /** Crosses water (the river). */
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
  // Lights where three or more proper roads meet and one of them is a main road; the laneways
  // just give way.
  for (const n of nodes) {
    const ways = n.dir.filter((d) => d >= 0 && segs[d].cls !== "lane");
    const main = ways.some((d) => segs[d].cls === "avenue" || segs[d].cls === "boulevard");
    n.light = ways.length >= 3 && main;
  }
  return { nodes, segs };
}

/** Water before bridges are known (for finding where the bridges go). */
function rawWater(x: number, z: number) {
  return shoreDistance(x, z) < 0 || inlandWater(x, z);
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

/* -------------------------------------------------------------------------------- trams */

/** A tram route along the roads' centre lines (corners on junctions); trams run on the inside lane. */
export interface TramRoute {
  id: string;
  num: string;
  name: string;
  /** E-class (modern, three sections) or the heritage W-class of the City Circle. */
  type: "E" | "W";
  loop: boolean;
  pts: [number, number][];
}

export const TRAMS: TramRoute[] = [
  { id: "t16", num: "16", name: "Melbourne Uni – St Kilda Beach", type: "E", loop: false, pts: [[110, -900], [110, 1130], [-110, 1130], [-110, 1400]] },
  { id: "t48", num: "48", name: "Docklands – Collins St", type: "E", loop: false, pts: [[-820, -110], [440, -110]] },
  { id: "t96", num: "96", name: "Docklands – Nicholson St", type: "E", loop: false, pts: [[-660, -220], [440, -220], [440, -900]] },
  { id: "t35", num: "35", name: "City Circle", type: "W", loop: true, pts: [[-440, 0], [440, 0], [440, -440], [-440, -440]] },
  { id: "t58", num: "58", name: "Toorak Rd", type: "E", loop: false, pts: [[110, 700], [1340, 700]] },
  { id: "t78", num: "78", name: "Church St – Chapel St", type: "E", loop: false, pts: [[1180, -560], [1180, 1130]] },
  { id: "t70", num: "70", name: "Wellington Pde – Swan St", type: "E", loop: false, pts: [[440, 0], [1340, 0]] },
  { id: "t109", num: "109", name: "Collins St – Port Melbourne", type: "E", loop: false, pts: [[440, -110], [-440, -110], [-440, 380], [-900, 380], [-900, 800]] },
];

/* -------------------------------------------------------------------------------- the city */

export type BuildingKind =
  | "tower"
  | "office"
  | "apartment"
  | "heritage"
  | "shop"
  | "pub"
  | "terrace"
  | "cottage"
  | "mansion"
  | "warehouse"
  | "shed"
  | "hotel"
  | "hospital"
  | "station"
  | "bank"
  | "garage";

/** Facade materials (the renderer draws each its own way). */
export const FAC = { glass: 0, grid: 1, sandstone: 2, brick: 3, render: 4, weatherboard: 5, metal: 6, bluestone: 7 } as const;
export type Facade = (typeof FAC)[keyof typeof FAC];

export interface Building {
  id: number;
  x: number;
  z: number;
  hw: number;
  hd: number;
  h: number;
  kind: BuildingKind;
  style: number;
  /** Wall colour (glass tint, stone, brick, paint). */
  color: string;
  /** Trim colour (frames, mullions, lace). */
  accent: string;
  /** Which side faces the street: 0 east, 1 south, 2 west, 3 north. */
  face: number;
  fac: Facade;
  /** Storey height. */
  floor: number;
  /** Ground floor height (taller for shops and lobbies). */
  gf: number;
  /** Shopfront glass at street level. */
  shop: boolean;
  roof: "flat" | "hip" | "gable" | "sawtooth";
  /** A cast-iron lace verandah over the footpath (terraces and pubs). */
  verandah?: boolean;
  /** A street awning over the footpath (shops). */
  awning?: boolean;
  sign?: string;
  /** A setback crown on a tower: from this height up it's this much narrower. */
  crown?: { from: number; inset: number; gold?: boolean };
}

export type PropKind =
  | "palm"
  | "tree"
  | "plane"
  | "elm"
  | "gum"
  | "lamp"
  | "bench"
  | "bin"
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
  | "planter"
  | "beachbox"
  | "tennis"
  | "flame"
  | "graffiti";

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
  /** Where to stand (on the footpath in front of the door). */
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

/** The big one-off buildings and structures, each drawn by its own model. */
export type LandmarkKind =
  | "flinders"
  | "fedsquare"
  | "cathedral"
  | "aurum"
  | "tower108"
  | "arts"
  | "casino"
  | "mcg"
  | "stadium"
  | "wheel"
  | "bolte"
  | "westgate"
  | "shrine"
  | "exhibition"
  | "parliament"
  | "market"
  | "funpark"
  | "theatre"
  | "kiosk"
  | "cruiseship"
  | "southerncross"
  | "boatshed";

export interface Landmark {
  kind: LandmarkKind;
  name: string;
  x: number;
  z: number;
  hw: number;
  hd: number;
  h: number;
  /** Which way it faces (0 east, 1 south, 2 west, 3 north). */
  face: number;
  /** Solid footprint pieces (where it's not one box). */
  parts?: { x: number; z: number; hw: number; hd: number; h: number; round?: boolean }[];
}

export interface City {
  roads: Roads;
  buildings: Building[];
  landmarks: Landmark[];
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

/* ---- palettes */

const GLASS = ["#5f7d96", "#4f6f7f", "#6d8798", "#7b8a8e", "#3e5466", "#5d7a6f", "#8a7d64", "#93a2ad"];
const CONCRETE = ["#c9c4b8", "#b9b5ab", "#d6d0c2", "#a9a7a0", "#c2b8a6", "#d9d4ca"];
const SANDSTONE = ["#d7c29a", "#cdb38a", "#e0cfa8", "#c8a978", "#d9c7a4"];
const BRICK = ["#9a4a32", "#a85a3a", "#7e3d2b", "#b5683f", "#8c5236", "#c9b08a", "#6e3a2a"];
const RENDER = ["#f3d9c7", "#e8d4b8", "#cfe0e6", "#f1e3c8", "#e7c9cf", "#d6e2c8", "#f5ecd8", "#e2d3e8", "#f0d2b0"];
const BOARDS = ["#efe9dc", "#d9e3e7", "#e9dccb", "#cbd8c8", "#f2e6c6", "#e3d0d0", "#d0d8e6"];
const METAL = ["#a9b1b6", "#8b9aa4", "#c0b6a4", "#9fa79a", "#b7b9bb"];
const TRIM = ["#f4f1ea", "#1f2a24", "#2a3b4a", "#5a2a24", "#e9e2d0", "#2e4a3a", "#3a3f47"];

const CBD_SHOPS = ["Flinders Lane Espresso", "Degraves Café", "Laneway Records", "Hardware Lane Grill", "Golden Dragon", "Pho 87", "Little Bourke Dumplings", "The Long Black", "Collins Books", "Block Arcade Tea", "Centre Place Bagels", "Chinatown Noodle", "Royal Arcade Toys", "Bourke St Optics", "Tramline Bar", "Hosier Lane Cans", "Elizabeth St Pawn", "Swanston Newsagency"];
const LYGON = ["Trattoria Roma", "Pasticceria Lygon", "Gelato Bello", "Caffè Milano", "La Nonna", "Pizzeria Napoli", "Enoteca 21", "Osteria Carlton", "Il Gattopardo", "Bar Sport"];
const FITZROY = ["Vinyl Vault", "Rose St Tattoo", "The Black Cat Café", "Vintage Threads", "Bar Bodega", "Fitzroy Bike Co", "Smith St Pho", "Gertrude Gallery", "Polyester Books", "Night Cat Records", "Brunswick St Bagels"];
const STKILDA = ["Acland Cake Co", "Europa Cakes", "Palm Court", "Fitzroy St Diner", "Pier Bar", "Sunset Fish & Chips", "Kiosk Gelato", "Backpackers by the Bay", "Acland Books", "Deco Lounge", "Little Blue Café"];
const CHAPEL = ["Chapel St Boutique", "Prahran Denim", "Sneaker Lab", "Toorak Wines", "Lume Gallery", "The Jam Factory", "Windsor Coffee", "Neon Burger"];
const RICHMOND = ["Swan St Hotel", "Bridge Rd Outlet", "Saigon Kitchen", "Victoria St Pho", "Richmond Hardware", "Church St Bikes", "Corner Grocer", "Bottle-O"];
const PUBS = ["The Royal Oak", "The Union Hotel", "The Railway Hotel", "The Prince Alfred", "Builders Arms", "The Cricketers Arms", "The Duke of Wellington", "The Lord Newry", "The Esplanade Arms", "The Standard", "The Napier", "The Tote"];
const HOTELS = ["The Grand Esplanade", "Seaview Hotel", "The Victoria Palms", "Hotel Majestic", "The Belvedere", "Bayside Inn"];

export interface Blk {
  i: number;
  j: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  district: District;
  /** The road class along each edge (0 east, 1 south, 2 west, 3 north), or null. */
  edge: (RoadClass | null)[];
}

/** The road a line has at v (with its class), or null if there's none there. */
function lineAt(l: Line, v: number) {
  if (!covers(l, v)) return null;
  if (l.skip?.some(([a, b]) => v > a && v < b)) return null;
  return l;
}

function blocks(): Blk[] {
  const out: Blk[] = [];
  const main = (lines: Line[]) => lines.map((l) => l.at).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  const bx = [BOUNDS.x0 + 40, ...main(NS), BOUNDS.x1 - 40];
  const bz = [BOUNDS.z0 + 40, ...main(EW), BOUNDS.z1 - 40];
  const road = (lines: Line[], at: number, mid: number) => lines.find((q) => q.at === at && lineAt(q, mid)) ?? null;
  const inset = (l: Line | null) => (l ? ROAD[l.cls].half + ROAD[l.cls].walk + 0.6 : 2);
  for (let i = 0; i < bx.length - 1; i++)
    for (let j = 0; j < bz.length - 1; j++) {
      const mx = (bx[i] + bx[i + 1]) / 2;
      const mz = (bz[j] + bz[j + 1]) / 2;
      const w = road(NS, bx[i], mz);
      const e = road(NS, bx[i + 1], mz);
      const n = road(EW, bz[j], mx);
      const s = road(EW, bz[j + 1], mx);
      const x0 = bx[i] + inset(w);
      const x1 = bx[i + 1] - inset(e);
      const z0 = bz[j] + inset(n);
      const z1 = bz[j + 1] - inset(s);
      if (x1 - x0 < 8 || z1 - z0 < 8) continue;
      out.push({ i, j, x0, z0, x1, z1, district: districtAt(mx, mz), edge: [e?.cls ?? null, s?.cls ?? null, w?.cls ?? null, n?.cls ?? null] });
    }
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
  { id: "safe-nina", kind: "safehouse", name: "Nina's flat", x: -122, z: 1170, bkind: "apartment", h: 14, w: 26, d: 22 },
  { id: "safe-dex", kind: "safehouse", name: "Dex's cottage", x: -888, z: 640, bkind: "cottage", h: 5.5, w: 10, d: 14 },
  { id: "hospital", kind: "hospital", name: "Yarra General Hospital", x: 520, z: -452, bkind: "hospital", h: 34, w: 60, d: 44 },
  { id: "police-hq", kind: "police", name: "Metro Police Centre", x: -452, z: -12, bkind: "station", h: 40, w: 50, d: 36 },
  { id: "police-stk", kind: "police", name: "St Kilda Police Station", x: 98, z: 1240, bkind: "station", h: 12, w: 30, d: 24 },
  { id: "police-rich", kind: "police", name: "Richmond Police Station", x: 1168, z: -120, bkind: "station", h: 12, w: 30, d: 24 },
  { id: "bank", kind: "bank", name: "Southern Cross Reserve Bank", x: -160, z: -98, bkind: "bank", h: 64, w: 44, d: 36 },
  { id: "gun-rich", kind: "gunshop", name: "Bullseye Arms", x: 1028, z: -240, bkind: "shop", h: 8, w: 18, d: 18 },
  { id: "gun-smelb", kind: "gunshop", name: "Bullseye Arms", x: -648, z: 460, bkind: "shop", h: 8, w: 18, d: 18 },
  { id: "clothes-chapel", kind: "clothes", name: "Threadline", x: 1168, z: 760, bkind: "shop", h: 10, w: 20, d: 18 },
  { id: "clothes-cbd", kind: "clothes", name: "Threadline", x: 55, z: -208, bkind: "shop", h: 14, w: 22, d: 30 },
  { id: "respray-rich", kind: "respray", name: "Spray Bay", x: 912, z: -300, bkind: "garage", h: 7, w: 22, d: 20 },
  { id: "respray-port", kind: "respray", name: "Spray Bay", x: -1068, z: 600, bkind: "garage", h: 7, w: 22, d: 20 },
  { id: "store-1", kind: "store", name: "Rosa's Milk Bar", x: 232, z: -700, bkind: "shop", h: 7, w: 14, d: 14 },
  { id: "store-2", kind: "store", name: "Corner Milk Bar", x: 612, z: -700, bkind: "shop", h: 7, w: 14, d: 14 },
  { id: "store-3", kind: "store", name: "Park St Milk Bar", x: -548, z: 572, bkind: "shop", h: 7, w: 14, d: 14 },
  { id: "store-4", kind: "store", name: "Prahran Milk Bar", x: 1052, z: 912, bkind: "shop", h: 7, w: 14, d: 14 },
  { id: "store-5", kind: "store", name: "Barkly St Milk Bar", x: 12, z: 1320, bkind: "shop", h: 7, w: 14, d: 14 },
  { id: "store-6", kind: "store", name: "Victoria St Milk Bar", x: 1052, z: -548, bkind: "shop", h: 7, w: 14, d: 14 },
  { id: "gas-1", kind: "gas", name: "Sunline Fuel", x: 912, z: 640, bkind: "shop", h: 5, w: 14, d: 12 },
  { id: "gas-2", kind: "gas", name: "Sunline Fuel", x: -648, z: 620, bkind: "shop", h: 5, w: 14, d: 12 },
  { id: "gas-3", kind: "gas", name: "Sunline Fuel", x: 1192, z: -480, bkind: "shop", h: 5, w: 14, d: 12 },
  { id: "chop", kind: "chopshop", name: "Dockside Motors", x: -1192, z: -120, bkind: "warehouse", h: 10, w: 40, d: 30 },
  { id: "marina", kind: "marina", name: "Docklands Marina", x: -808, z: -12, bkind: "shop", h: 8, w: 26, d: 18 },
  { id: "mansion", kind: "mansion", name: "Coonara House", x: 1352, z: 980, bkind: "mansion", h: 12, w: 36, d: 30 },
  { id: "airboat", kind: "airboat", name: "Yarra Boat Hire", x: -40, z: 186 },
  { id: "pier", kind: "pier", name: "St Kilda Pier", x: -432, z: 1181 },
];

/** The landmarks: footprints are clear of the roads round them. */
const LANDMARKS: Landmark[] = [
  { kind: "flinders", name: "Flinders Street Station", x: 55, z: 47, hw: 43, hd: 34, h: 22, face: 3 },
  { kind: "fedsquare", name: "Federation Square", x: 166, z: 46, hw: 42, hd: 33, h: 20, face: 3 },
  { kind: "cathedral", name: "St Paul's Cathedral", x: 160, z: -31, hw: 37, hd: 18, h: 30, face: 2 },
  { kind: "aurum", name: "Aurum Tower", x: -75, z: 222, hw: 20, hd: 20, h: 297, face: 3 },
  { kind: "tower108", name: "Southbank One", x: -250, z: 333, hw: 21, hd: 21, h: 316, face: 1 },
  { kind: "arts", name: "The Arts Centre", x: 168, z: 340, hw: 40, hd: 26, h: 28, face: 2 },
  { kind: "casino", name: "Riverside Casino", x: -222, z: 238, hw: 92, hd: 46, h: 38, face: 3 },
  { kind: "mcg", name: "The MCG", x: 680, z: 105, hw: 92, hd: 92, h: 42, face: 3 },
  { kind: "stadium", name: "Docklands Stadium", x: -550, z: -330, hw: 96, hd: 96, h: 52, face: 0 },
  { kind: "wheel", name: "The Harbour Star", x: -920, z: -150, hw: 14, hd: 8, h: 120, face: 1 },
  { kind: "bolte", name: "Bolte Bridge", x: -1080, z: 120, hw: 14, hd: 6, h: 140, face: 1 },
  { kind: "westgate", name: "West Gate Bridge", x: -1600, z: 420, hw: 10, hd: 10, h: 102, face: 1 },
  { kind: "shrine", name: "The Shrine", x: 370, z: 440, hw: 34, hd: 34, h: 30, face: 3 },
  { kind: "exhibition", name: "Royal Exhibition Building", x: 385, z: -690, hw: 38, hd: 24, h: 56, face: 1 },
  { kind: "parliament", name: "Parliament House", x: 520, z: -280, hw: 62, hd: 36, h: 26, face: 2 },
  { kind: "market", name: "Queen Victoria Market", x: -55, z: -500, hw: 42, hd: 46, h: 9, face: 1 },
  { kind: "funpark", name: "Big Mouth Fun Park", x: -250, z: 1190, hw: 66, hd: 46, h: 34, face: 2 },
  { kind: "theatre", name: "The Palace Theatre", x: -270, z: 1290, hw: 46, hd: 28, h: 24, face: 2 },
  { kind: "kiosk", name: "The Pier Kiosk", x: -706, z: 1181, hw: 12, hd: 9, h: 8, face: 2 },
  { kind: "cruiseship", name: "Spirit of the Bay", x: -935, z: 1010, hw: 16, hd: 120, h: 52, face: 1 },
  { kind: "southerncross", name: "Southern Cross Station", x: -550, z: -165, hw: 96, hd: 43, h: 22, face: 0 },
  { kind: "boatshed", name: "Yarra Boathouses", x: 520, z: 250, hw: 40, hd: 10, h: 9, face: 3 },
];

/** Parks and gardens (no buildings; trees, lawns, paths). */
const PARKS: { x0: number; z0: number; x1: number; z1: number; name: string; trees: "gum" | "elm" | "mixed" | "palm" }[] = [
  { x0: -318, z0: -548, x1: -232, z1: -452, name: "Flagstaff Gardens", trees: "elm" },
  { x0: 342, z0: -748, x1: 428, z1: -572, name: "Carlton Gardens", trees: "elm" },
  { x0: 452, z0: -228, x1: 588, z1: -12, name: "Treasury Gardens", trees: "elm" },
  { x0: 612, z0: -322, x1: 748, z1: -12, name: "Fitzroy Gardens", trees: "elm" },
  { x0: 452, z0: 12, x1: 888, z1: 190, name: "Yarra Park", trees: "gum" },
  { x0: 222, z0: 12, x1: 428, z1: 104, name: "Birrarung Marr", trees: "gum" },
  { x0: 126, z0: 312, x1: 588, z1: 548, name: "Kings Domain", trees: "mixed" },
  { x0: 612, z0: 312, x1: 888, z1: 548, name: "Royal Botanic Gardens", trees: "mixed" },
  { x0: -428, z0: 812, x1: -12, z1: 1028, name: "Albert Park", trees: "gum" },
  { x0: 612, z0: -888, x1: 748, z1: -772, name: "Edinburgh Gardens", trees: "elm" },
  { x0: 612, z0: 572, x1: 748, z1: 688, name: "Fawkner Park", trees: "elm" },
  { x0: -318, z0: 1262, x1: -122, z1: 1388, name: "Catani Gardens", trees: "palm" },
];

/** Build the whole map from a seed (the layout is fixed; the seed varies details). */
export function generate(seed = 7): City {
  const rng = createRng(seed);
  const roads = buildRoads();
  roadsRef = roads;
  segCells = null;
  nodesRef = roads.nodes;
  bridgeSegs = roads.segs.filter((s) => s.bridge);
  const buildings: Building[] = [];
  const props: Prop[] = [];
  const pois: Poi[] = [];
  const parks: City["parks"] = [];
  const parking: ParkSpot[] = [];
  const landmarks: Landmark[] = [];
  const blks = blocks();
  const taken: { x0: number; z0: number; x1: number; z1: number }[] = [];
  const free = (x0: number, z0: number, x1: number, z1: number) => !taken.some((t) => x0 < t.x1 && x1 > t.x0 && z0 < t.z1 && z1 > t.z0);
  const dry = (x0: number, z0: number, x1: number, z1: number) => {
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) if (groundY(x, z) < -0.05 || onBeach(x, z)) return false;
    return true;
  };
  const addB: AddB = (b) => {
    const x0 = b.x - b.hw;
    const x1 = b.x + b.hw;
    const z0 = b.z - b.hd;
    const z1 = b.z + b.hd;
    if (!free(x0, z0, x1, z1) || !dry(x0, z0, x1, z1) || onRoadRect(roads, x0, z0, x1, z1)) return -1;
    taken.push({ x0, z0, x1, z1 });
    buildings.push({ ...b, id: buildings.length });
    return buildings.length - 1;
  };

  // The landmarks claim their ground first.
  for (const l of LANDMARKS) {
    landmarks.push({ ...l, parts: landmarkParts(l) });
    if (l.kind === "westgate" || l.kind === "bolte" || l.kind === "cruiseship") continue;
    taken.push({ x0: l.x - l.hw - 2, z0: l.z - l.hd - 2, x1: l.x + l.hw + 2, z1: l.z + l.hd + 2 });
  }
  // The casino's gas towers along the promenade, lit at night.
  for (let x = -306; x <= -136; x += 24) props.push({ kind: "flame", x, z: 184, ry: 0, s: 1 });

  // Fixed places next, on the side of their block nearest the point given.
  for (const sp of POI_SPECS) {
    if (sp.kind === "pier" || sp.kind === "airboat") {
      pois.push({ id: sp.id, kind: sp.kind, name: sp.name, x: sp.x, z: sp.z, fx: sp.kind === "pier" ? -1 : 0, fz: sp.kind === "pier" ? 0 : -1, district: districtAt(sp.x, sp.z) });
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
    const setback = sp.bkind === "mansion" ? 12 : sp.kind === "gas" ? 14 : sp.bkind === "cottage" ? 4 : 0.5;
    let x: number, z: number, hw: number, hd: number, fx = 0, fz = 0;
    if (face === 0) [x, z, hw, hd, fx] = [b.x1 - setback - d / 2, along, d / 2, w / 2, 1];
    else if (face === 2) [x, z, hw, hd, fx] = [b.x0 + setback + d / 2, along, d / 2, w / 2, -1];
    else if (face === 1) [x, z, hw, hd, fz] = [along, b.z1 - setback - d / 2, w / 2, d / 2, 1];
    else [x, z, hw, hd, fz] = [along, b.z0 + setback + d / 2, w / 2, d / 2, -1];
    const kind = sp.bkind ?? "shop";
    const look = poiLook(rng, kind);
    const id = addB({ x, z, hw, hd, h: sp.h ?? 8, kind, style: rng.int(0, 3), face, sign: sp.kind === "safehouse" ? undefined : sp.name, crown: kind === "bank" ? { from: 44, inset: 6 } : undefined, ...look });
    // The marker: just off the door, on the footpath.
    const out = sp.kind === "gas" ? 16 : sp.bkind === "mansion" ? 14 : sp.bkind === "cottage" ? 6 : 2.5;
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

  for (const p of PARKS) {
    parks.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, name: p.name });
    taken.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1 });
  }

  for (const b of blks) fillBlock(rng, b, addB, props, parking);

  // Parks: trees, paths' benches, a fountain in the formal gardens.
  for (const p of PARKS) {
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    const formal = p.trees === "elm";
    if (formal && p.x1 - p.x0 < 200) props.push({ kind: "fountain", x: cx, z: cz, ry: 0, s: p.x1 - p.x0 > 120 ? 2 : 1 });
    const n = Math.round(((p.x1 - p.x0) * (p.z1 - p.z0)) / (p.trees === "palm" ? 260 : 300));
    for (let i = 0; i < n; i++) {
      const x = rng.range(p.x0 + 4, p.x1 - 4);
      const z = rng.range(p.z0 + 4, p.z1 - 4);
      if (formal && Math.hypot(x - cx, z - cz) < 16) continue;
      if (groundY(x, z) < -0.05 || insideLandmark(landmarks, x, z, 6)) continue;
      const kind: PropKind = p.trees === "palm" ? (rng.next() < 0.75 ? "palm" : "plane") : p.trees === "gum" ? (rng.next() < 0.8 ? "gum" : "elm") : p.trees === "elm" ? (rng.next() < 0.7 ? "elm" : "plane") : rng.pick(["elm", "gum", "plane", "palm"] as const);
      props.push({ kind, x, z, ry: rng.range(0, 6.28), s: rng.range(0.85, 1.3) });
    }
    if (formal) for (let i = 0; i < 6; i++) props.push({ kind: "bench", x: cx + Math.cos(i) * 20, z: cz + Math.sin(i) * 20, ry: -i + Math.PI / 2, s: 1 });
  }

  streetscape(rng, roads, props, parking);
  beaches(rng, props);
  docks(rng, props, taken);
  marinas(rng, props);

  const city: City = { roads, buildings, landmarks, props, pois, parks, parking, grid: new Map(), solids: [] };
  index(city);
  return city;
}

function insideLandmark(list: Landmark[], x: number, z: number, pad: number) {
  return list.some((l) => Math.abs(x - l.x) < l.hw + pad && Math.abs(z - l.z) < l.hd + pad);
}

/** Collision pieces of a landmark: most are one box; the stadiums are rings with gates. */
function landmarkParts(l: Landmark): Landmark["parts"] {
  switch (l.kind) {
    case "mcg":
    case "stadium":
      return [{ x: l.x, z: l.z, hw: l.hw, hd: l.hd, h: l.h, round: true }];
    case "wheel":
      return [{ x: l.x, z: l.z, hw: 6, hd: 8, h: 12 }];
    case "bolte":
    case "westgate":
    case "cruiseship":
      return [];
    case "kiosk":
      return [{ x: l.x, z: l.z, hw: l.hw, hd: l.hd, h: l.h }];
    case "funpark":
      // The fun park is open: rides and the big mouth gate are solid, the paths aren't.
      return [
        { x: l.x - l.hw + 6, z: l.z, hw: 5, hd: 12, h: 18 },
        { x: l.x + 20, z: l.z - 20, hw: 14, hd: 14, h: 30 },
        { x: l.x + 30, z: l.z + 24, hw: 10, hd: 10, h: 16 },
      ];
    default:
      return [{ x: l.x, z: l.z, hw: l.hw, hd: l.hd, h: l.h }];
  }
}

type AddB = (b: Omit<Building, "id">) => number;

/** A plain look for the fixed places' buildings. */
function poiLook(rng: Rng, kind: BuildingKind): Pick<Building, "color" | "accent" | "fac" | "floor" | "gf" | "shop" | "roof" | "awning" | "verandah"> {
  switch (kind) {
    case "hospital":
      return { color: "#e9ecef", accent: "#2a6f9e", fac: FAC.grid, floor: 3.8, gf: 5, shop: false, roof: "flat" };
    case "station":
      return { color: "#c9c4b8", accent: "#1f3a6e", fac: FAC.grid, floor: 3.6, gf: 5, shop: false, roof: "flat" };
    case "bank":
      return { color: rng.pick(SANDSTONE), accent: "#2b2b2b", fac: FAC.sandstone, floor: 4.6, gf: 7, shop: false, roof: "flat" };
    case "apartment":
      return { color: rng.pick(RENDER), accent: "#f4f1ea", fac: FAC.render, floor: 3.1, gf: 3.6, shop: false, roof: "flat" };
    case "cottage":
      return { color: rng.pick(BOARDS), accent: "#f4f1ea", fac: FAC.weatherboard, floor: 3, gf: 0, shop: false, roof: "gable", verandah: true };
    case "mansion":
      return { color: "#f2ede2", accent: "#2e4a3a", fac: FAC.render, floor: 4, gf: 0, shop: false, roof: "hip" };
    case "warehouse":
      return { color: rng.pick(BRICK), accent: "#2a2a2a", fac: FAC.brick, floor: 4.5, gf: 0, shop: false, roof: "sawtooth" };
    case "garage":
      return { color: rng.pick(METAL), accent: "#d64a2a", fac: FAC.metal, floor: 4, gf: 0, shop: false, roof: "flat" };
    default:
      return { color: rng.pick(RENDER), accent: rng.pick(TRIM), fac: FAC.render, floor: 3.4, gf: 4, shop: true, roof: "flat", awning: true };
  }
}

/** Does a rectangle touch a street (carriageway or footpath)? */
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

type Make = (x: number, z: number, hw: number, hd: number, face: number) => void;

/** Fill a block with buildings in its district's style, fronting the roads round it. */
function fillBlock(rng: Rng, b: Blk, addB: AddB, props: Prop[], parking: ParkSpot[]) {
  const W = b.x1 - b.x0;
  const D = b.z1 - b.z0;
  const d = b.district;
  if (d === "beach" || d === "domain") return;
  // Rows of lots along the north and south frontages, then the ends.
  const lots = (front: 1 | 3, wMin: number, wMax: number, depth: number, gap: number, setback: number, make: Make, lanes = 0) => {
    let x = b.x0 + rng.range(0, gap);
    while (x < b.x1 - wMin) {
      const w = Math.min(rng.range(wMin, wMax), b.x1 - x);
      if (w < wMin) break;
      const hd = Math.min(depth, D - setback - 1) / 2;
      const z = front === 3 ? b.z0 + setback + hd : b.z1 - setback - hd;
      make(x + w / 2, z, w / 2 - 0.25, hd, front);
      x += w + rng.range(0, gap);
      // Now and then a laneway through the row (graffiti on its walls).
      if (lanes && rng.next() < lanes && x < b.x1 - wMin - 6) {
        props.push({ kind: "graffiti", x: x + 2.5, z: front === 3 ? b.z0 + setback + hd : b.z1 - setback - hd, ry: 0, s: hd * 2 });
        x += 5;
      }
    }
  };
  const ends = (wMin: number, wMax: number, depth: number, gap: number, setback: number, make: Make) => {
    for (const face of [0, 2] as const) {
      let z = b.z0 + Math.min(depth, D / 2) + 1;
      while (z < b.z1 - Math.min(depth, D / 2) - wMin) {
        const w = Math.min(rng.range(wMin, wMax), b.z1 - Math.min(depth, D / 2) - 1 - z);
        if (w < wMin) break;
        const hw = Math.min(depth, W / 2 - 1) / 2;
        const x = face === 0 ? b.x1 - setback - hw : b.x0 + setback + hw;
        make(x, z + w / 2, hw, w / 2 - 0.25, face);
        z += w + rng.range(0, gap);
      }
    }
  };
  const main = (c: RoadClass | null) => c === "avenue" || c === "boulevard";
  const north = b.edge[3];
  const south = b.edge[1];
  /** The frontage rows: both sides, or one deep row onto the better road when the block's shallow. */
  const rows = (depth: number, make: Make, wMin: number, wMax: number, gap: number, setback: number, lanes = 0) => {
    if (D < depth * 2 + 4) {
      const front: 1 | 3 = main(south) && !main(north) ? 1 : main(north) && !main(south) ? 3 : south && !north ? 1 : 3;
      lots(front, wMin, wMax, D - setback * 2, gap, setback, make, lanes);
    } else {
      lots(3, wMin, wMax, depth, gap, setback, make, lanes);
      lots(1, wMin, wMax, depth, gap, setback, make, lanes);
      ends(wMin, wMax, depth, gap, setback, make);
    }
  };
  const fz = (face: number) => (face === 1 ? 1 : face === 3 ? -1 : 0);
  const fx = (face: number) => (face === 0 ? 1 : face === 2 ? -1 : 0);
  /** Kerbside parking in front of a building on a quieter road. */
  const curbPark = (x: number, z: number, hw: number, hd: number, face: number) => {
    const road = b.edge[face];
    if (road !== "street" || rng.next() < 0.45) return;
    const out = ROAD.street.walk + 1.4;
    const px = x + fx(face) * (hw + out);
    const pz = z + fz(face) * (hd + out);
    parking.push({ x: px, z: pz, h: face % 2 === 0 ? (rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : rng.next() < 0.5 ? 0 : Math.PI });
  };

  switch (d) {
    case "cbd": {
      const towerish = (x: number, z: number) => {
        // Taller to the west and along Collins and William; the old city's heritage round the edges.
        let k = 0.18 + (x < 0 ? 0.12 : 0) + (Math.abs(z + 110) < 70 ? 0.1 : 0) + (Math.abs(x + 220) < 70 ? 0.08 : 0);
        if (Math.abs(x - 110) < 60) k -= 0.1;
        return k;
      };
      const make: Make = (x, z, hw, hd, face) => {
        const r = rng.next();
        const tk = towerish(x, z);
        if (r < tk && hw > 13) {
          const h = Math.round(rng.range(90, 250));
          const glass = rng.next() < 0.75;
          addB({ x, z, hw, hd, h, kind: "tower", style: rng.int(0, 3), color: glass ? rng.pick(GLASS) : rng.pick(CONCRETE), accent: rng.pick(["#2a2f36", "#c9ced4", "#8a8f96"]), face, fac: glass ? FAC.glass : FAC.grid, floor: 3.8, gf: 7, shop: true, roof: "flat", crown: rng.next() < 0.55 ? { from: Math.round(h * rng.range(0.72, 0.88)), inset: Math.min(hw, hd) * 0.22 } : undefined });
        } else if (r < tk + 0.32) {
          const h = Math.round(rng.range(28, 84));
          const glass = rng.next() < 0.35;
          addB({ x, z, hw, hd, h, kind: "office", style: rng.int(0, 3), color: glass ? rng.pick(GLASS) : rng.pick(CONCRETE), accent: rng.pick(["#2a2f36", "#d9d4ca", "#6a6f76"]), face, fac: glass ? FAC.glass : FAC.grid, floor: 3.6, gf: 5.5, shop: true, roof: "flat", awning: rng.next() < 0.5 });
        } else {
          const h = Math.round(rng.range(11, 30));
          const stone = rng.next() < 0.55;
          addB({ x, z, hw, hd, h, kind: "heritage", style: rng.int(0, 3), color: stone ? rng.pick(SANDSTONE) : rng.pick(BRICK), accent: rng.pick(["#e9e2d0", "#2e4a3a", "#3a3f47", "#f4f1ea"]), face, fac: stone ? FAC.sandstone : FAC.brick, floor: 4.2, gf: 4.6, shop: true, roof: "flat", awning: rng.next() < 0.7, sign: rng.next() < 0.45 ? rng.pick(CBD_SHOPS) : undefined });
        }
      };
      rows(36, make, 12, 34, 0.5, 0.2, 0.12);
      break;
    }
    case "southbank":
    case "docklands": {
      const sb = d === "southbank";
      const make: Make = (x, z, hw, hd, face) => {
        const r = rng.next();
        if (r < (sb ? 0.55 : 0.4) && hw > 12) {
          const h = Math.round(rng.range(sb ? 90 : 50, sb ? 230 : 140));
          addB({ x, z, hw, hd, h, kind: "tower", style: rng.int(0, 3), color: rng.pick(GLASS), accent: rng.pick(["#2a2f36", "#c9ced4", "#e9e2d0"]), face, fac: rng.next() < 0.7 ? FAC.glass : FAC.grid, floor: 3.2, gf: 6, shop: rng.next() < 0.6, roof: "flat", crown: rng.next() < 0.4 ? { from: Math.round(h * 0.85), inset: Math.min(hw, hd) * 0.2 } : undefined });
        } else {
          const h = Math.round(rng.range(18, 60));
          addB({ x, z, hw, hd, h, kind: r < 0.75 ? "apartment" : "office", style: rng.int(0, 3), color: rng.next() < 0.5 ? rng.pick(GLASS) : rng.pick(CONCRETE), accent: rng.pick(["#2a2f36", "#d9d4ca"]), face, fac: rng.next() < 0.5 ? FAC.glass : FAC.grid, floor: 3.2, gf: 5, shop: rng.next() < 0.5, roof: "flat" });
        }
      };
      rows(34, make, 22, 44, 8, 1);
      break;
    }
    case "docks": {
      const make: Make = (x, z, hw, hd, face) => {
        if (rng.next() < 0.25) return;
        addB({ x, z, hw, hd, h: Math.round(rng.range(9, 16)), kind: "shed", style: rng.int(0, 1), color: rng.pick(METAL), accent: rng.pick(["#d64a2a", "#2a6f9e", "#e2b33a"]), face, fac: FAC.metal, floor: 5, gf: 0, shop: false, roof: rng.next() < 0.6 ? "gable" : "flat" });
      };
      rows(44, make, 34, 60, 14, 4);
      break;
    }
    case "westmelb":
    case "southmelb":
    case "carlton":
    case "fitzroy":
    case "eastmelb":
    case "richmond":
    case "albertpark":
    case "port": {
      // The inner suburbs: Victorian terraces with lace verandahs, workers' cottages in
      // weatherboard, warehouses in brick and bluestone, shops and corner pubs on the main roads.
      const shopsOn = (face: number) => main(b.edge[face]);
      const names = d === "carlton" ? LYGON : d === "fitzroy" ? FITZROY : d === "richmond" ? RICHMOND : CBD_SHOPS;
      const industrial = (d === "westmelb" && b.x0 < -800) || (d === "port" && b.x0 < -1000) || (d === "southmelb" && b.z0 < 560 && b.x0 < -500);
      const make: Make = (x, z, hw, hd, face) => {
        const r = rng.next();
        if (industrial && r < 0.7) {
          const blue = rng.next() < 0.3;
          addB({ x, z, hw, hd, h: Math.round(rng.range(8, 15)), kind: "warehouse", style: rng.int(0, 3), color: blue ? "#4f5357" : rng.pick(BRICK), accent: "#2a2a2a", face, fac: blue ? FAC.bluestone : FAC.brick, floor: 4.5, gf: 0, shop: false, roof: rng.next() < 0.5 ? "sawtooth" : "flat" });
          return;
        }
        if (shopsOn(face)) {
          // Shops, and a pub on the corner now and then.
          const pub = r < 0.16;
          addB({ x, z, hw, hd, h: Math.round(rng.range(7.5, pub ? 11 : 12)), kind: pub ? "pub" : "shop", style: rng.int(0, 3), color: rng.next() < 0.5 ? rng.pick(BRICK) : rng.pick(RENDER), accent: rng.pick(TRIM), face, fac: rng.next() < 0.5 ? FAC.brick : FAC.render, floor: 3.6, gf: 4, shop: true, roof: "flat", verandah: pub || rng.next() < 0.35, awning: !pub, sign: pub ? rng.pick(PUBS) : rng.next() < 0.6 ? rng.pick(names) : undefined });
          return;
        }
        if (r < 0.12 && (d === "fitzroy" || d === "richmond" || d === "southmelb" || d === "westmelb")) {
          addB({ x, z, hw, hd, h: Math.round(rng.range(9, 16)), kind: "warehouse", style: rng.int(0, 3), color: rng.pick(BRICK), accent: "#2a2a2a", face, fac: FAC.brick, floor: 4.2, gf: 0, shop: false, roof: rng.next() < 0.4 ? "sawtooth" : "flat" });
          return;
        }
        if (r < 0.2 && d !== "port") {
          const h = Math.round(rng.range(12, d === "eastmelb" ? 34 : 24));
          addB({ x, z, hw, hd, h, kind: "apartment", style: rng.int(0, 3), color: rng.next() < 0.5 ? rng.pick(RENDER) : rng.pick(CONCRETE), accent: rng.pick(TRIM), face, fac: rng.next() < 0.6 ? FAC.render : FAC.grid, floor: 3.1, gf: 3.4, shop: false, roof: "flat" });
          return;
        }
        const cottage = d === "port" || d === "richmond" ? r < 0.7 : r < 0.25;
        if (cottage) {
          // Single-fronted weatherboards with a gable roof and a front verandah, set back a little.
          const id = addB({ x, z, hw, hd, h: rng.range(5, 6), kind: "cottage", style: rng.int(0, 3), color: rng.pick(BOARDS), accent: rng.pick(TRIM), face, fac: FAC.weatherboard, floor: 3, gf: 0, shop: false, roof: "gable", verandah: true });
          if (id >= 0) curbPark(x, z, hw, hd, face);
          return;
        }
        const id = addB({ x, z, hw, hd, h: rng.next() < 0.75 ? 8 : 11, kind: "terrace", style: rng.int(0, 3), color: rng.next() < 0.55 ? rng.pick(RENDER) : rng.pick(BRICK), accent: rng.pick(TRIM), face, fac: rng.next() < 0.55 ? FAC.render : FAC.brick, floor: 3.6, gf: 0, shop: false, roof: "hip", verandah: true });
        if (id >= 0) curbPark(x, z, hw, hd, face);
      };
      const terraces = d !== "port" && d !== "richmond";
      rows(terraces ? 18 : 16, make, terraces ? 6.5 : 8, terraces ? 9 : 12, terraces ? 0.6 : 2.5, terraces ? 0.8 : 3);
      break;
    }
    case "southyarra":
    case "toorak": {
      const rich = d === "toorak";
      const forrest = !rich && b.x0 > 880 && b.z1 < 560;
      const make: Make = (x, z, hw, hd, face) => {
        if (forrest) {
          const h = Math.round(rng.range(40, 120));
          addB({ x, z, hw, hd, h, kind: "tower", style: rng.int(0, 3), color: rng.pick(GLASS), accent: "#2a2f36", face, fac: FAC.glass, floor: 3.2, gf: 5, shop: false, roof: "flat" });
          return;
        }
        if (!rich && main(b.edge[face])) {
          addB({ x, z, hw, hd, h: Math.round(rng.range(8, 13)), kind: "shop", style: rng.int(0, 3), color: rng.next() < 0.5 ? rng.pick(RENDER) : rng.pick(BRICK), accent: rng.pick(TRIM), face, fac: rng.next() < 0.5 ? FAC.render : FAC.brick, floor: 3.8, gf: 4.2, shop: true, roof: "flat", awning: true, sign: rng.next() < 0.65 ? rng.pick(CHAPEL) : undefined });
          return;
        }
        if (rich) {
          const id = addB({ x, z, hw, hd, h: rng.range(9, 12), kind: "mansion", style: rng.int(0, 3), color: rng.pick(["#f5f1e6", "#efe6d6", "#e6eef0", "#f3e3e0", "#d7c29a"]), accent: rng.pick(["#2e4a3a", "#1f2a24", "#f4f1ea"]), face, fac: rng.next() < 0.7 ? FAC.render : FAC.brick, floor: 4, gf: 0, shop: false, roof: "hip" });
          if (id < 0) return;
          const back = face === 3 ? 1 : face === 1 ? -1 : 0;
          if (back && rng.next() < 0.8) props.push({ kind: "pool", x: x - hw * 0.3, z: z + back * (hd + 7), ry: 0, s: 1.3 });
          if (back && rng.next() < 0.45) props.push({ kind: "tennis", x: x + hw * 0.3, z: z + back * (hd + 18), ry: 0, s: 1 });
          if (rng.next() < 0.8) props.push({ kind: "gum", x: x + fx(face) * (hw + 6) + (fz(face) ? rng.range(-hw, hw) : 0), z: z + fz(face) * (hd + 6) + (fx(face) ? rng.range(-hd, hd) : 0), ry: rng.range(0, 6.28), s: rng.range(1, 1.4) });
          parking.push({ x: x + fx(face) * (hw + 5) + (fz(face) ? hw * 0.6 : 0), z: z + fz(face) * (hd + 5) + (fx(face) ? hd * 0.6 : 0), h: face % 2 === 0 ? 0 : Math.PI / 2 });
          return;
        }
        if (rng.next() < 0.18) {
          addB({ x, z, hw, hd, h: Math.round(rng.range(12, 30)), kind: "apartment", style: rng.int(0, 3), color: rng.pick(RENDER), accent: rng.pick(TRIM), face, fac: FAC.render, floor: 3.1, gf: 3.4, shop: false, roof: "flat" });
          return;
        }
        const id = addB({ x, z, hw, hd, h: rng.next() < 0.7 ? 8 : 11, kind: "terrace", style: rng.int(0, 3), color: rng.next() < 0.6 ? rng.pick(RENDER) : rng.pick(BRICK), accent: rng.pick(TRIM), face, fac: rng.next() < 0.6 ? FAC.render : FAC.brick, floor: 3.6, gf: 0, shop: false, roof: "hip", verandah: true });
        if (id >= 0) curbPark(x, z, hw, hd, face);
      };
      if (rich) rows(26, make, 34, 46, 10, 12);
      else if (forrest) rows(30, make, 26, 40, 10, 2);
      else rows(18, make, 7, 10, 0.6, 0.8);
      break;
    }
    case "stkilda": {
      // Art deco flats in pastel render, cake shops on Acland St, bars on Fitzroy St.
      const make: Make = (x, z, hw, hd, face) => {
        const road = b.edge[face];
        if (main(road) || road === "street") {
          if (rng.next() < 0.6 || main(road)) {
            const hotel = rng.next() < 0.15 && main(road);
            addB({ x, z, hw, hd, h: Math.round(rng.range(hotel ? 14 : 8, hotel ? 24 : 12)), kind: hotel ? "hotel" : "shop", style: rng.int(0, 3), color: rng.pick(RENDER), accent: rng.pick(TRIM), face, fac: FAC.render, floor: 3.4, gf: 4, shop: true, roof: "flat", awning: !hotel, verandah: hotel, sign: hotel ? rng.pick(HOTELS) : rng.next() < 0.7 ? rng.pick(STKILDA) : undefined });
            return;
          }
        }
        const h = Math.round(rng.range(9, 19));
        addB({ x, z, hw, hd, h, kind: "apartment", style: rng.int(0, 3), color: rng.pick(RENDER), accent: rng.pick(["#f4f1ea", "#2a3b4a", "#e9e2d0"]), face, fac: FAC.render, floor: 3, gf: 3.2, shop: false, roof: "flat" });
      };
      rows(22, make, 12, 24, 2, 1);
      break;
    }
  }
}

/** Lamps, street trees, benches and bins along the roads. */
function streetscape(rng: Rng, roads: Roads, props: Prop[], parking: ParkSpot[]) {
  for (const s of roads.segs) {
    const a = roads.nodes[s.a];
    const b = roads.nodes[s.b];
    const h = ROAD[s.cls].half + 0.7;
    const dist = districtAt((a.x + b.x) / 2, (a.z + b.z) / 2);
    const lane = s.cls === "lane";
    const step = lane ? 30 : 22;
    const n = Math.floor(s.len / step);
    // Which trees line this road.
    const tree: PropKind | null = lane
      ? null
      : s.name === "St Kilda Rd" || s.name === "Royal Pde"
        ? "elm"
        : s.name === "Fitzroy St" || s.name === "The Esplanade" || s.name === "Alexandra Ave"
          ? "palm"
          : dist === "cbd"
            ? s.name === "Collins St" || s.name === "Swanston St" || s.cls === "avenue"
              ? "plane"
              : null
            : dist === "docks"
              ? null
              : dist === "toorak" || dist === "port" || dist === "albertpark"
                ? rng.next() < 0.5
                  ? "gum"
                  : "plane"
                : dist === "docklands" || dist === "southbank"
                  ? "gum"
                  : "plane";
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
        // Lamps reach their arm (local +x) out over the road.
        const ry = s.axis === "ns" ? (side > 0 ? Math.PI : 0) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (i % 2 === 0 || lane) props.push({ kind: "lamp", x: px, z: pz, ry, s: lane ? 0.7 : 1 });
        else if (tree) props.push({ kind: tree, x: px + (s.axis === "ns" ? side * 1.4 : 0), z: pz + (s.axis === "ew" ? side * 1.4 : 0), ry: rng.range(0, 6.28), s: rng.range(0.85, 1.2) });
        else if (dist === "cbd" && i % 4 === 1) props.push({ kind: "bin", x: px, z: pz, ry, s: 1 });
      }
      if (i === Math.floor(n / 2) && (s.cls === "avenue" || s.cls === "boulevard") && dist === "cbd") props.push({ kind: "bench", x: x + (s.axis === "ns" ? h + 1.6 : 0), z: z + (s.axis === "ew" ? h + 1.6 : 0), ry: s.axis === "ns" ? Math.PI / 2 : 0, s: 1 });
    }
    // Kerbside parking down the quieter streets.
    if (s.cls === "street" && !s.bridge && dist !== "docks") {
      for (let i = 1; i < Math.floor(s.len / 16) - 1; i++) {
        if (rng.next() < 0.6) continue;
        const t = (i * 16) / s.len;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        // On the left: parked facing the way the near-side traffic goes.
        const side = rng.next() < 0.5 ? 1 : -1;
        const off = ROAD.street.half - 1.1;
        if (s.axis === "ns") parking.push({ x: x + side * off, z, h: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
        else parking.push({ x, z: z + side * off, h: side > 0 ? Math.PI : 0 });
      }
    }
  }
}

/** The beaches: palms along the Esplanade, lifeguard towers, umbrellas, volleyball, beach boxes. */
function beaches(rng: Rng, props: Prop[]) {
  // St Kilda: palms in a line along the Esplanade's beach side.
  for (let z = 1050; z < 1590; z += 11) {
    const x = -330 - ROAD.avenue.half - ROAD.avenue.walk - 3;
    if (Math.abs(z - 1181) < 10) continue;
    props.push({ kind: "palm", x: x + rng.range(-1, 1), z: z + rng.range(-2, 2), ry: rng.range(0, 6.28), s: rng.range(1, 1.35) });
  }
  // Lifeguard towers and umbrellas along every stretch of sand.
  const sand = (x: number, z: number) => onBeach(x, z) && groundY(x, z) > -0.25;
  for (let i = 0; i < 900; i++) {
    const x = rng.range(-1100, -330);
    const z = rng.range(800, 1650);
    if (!sand(x, z)) continue;
    if (PIERS.some((p) => x > p.x0 - 6 && x < p.x1 + 6 && z > p.z0 - 6 && z < p.z1 + 6)) continue;
    const r = rng.next();
    if (r < 0.62) props.push({ kind: "umbrella", x, z, ry: rng.range(0, 6.28), s: 1, color: rng.pick(["#e14b6a", "#f2b134", "#3fa7a0", "#4b8fd6", "#f6f1e7", "#7a5cc4", "#e9724c"]) });
  }
  for (const [x, z] of [[-1050, 880], [-760, 960], [-560, 1030], [-410, 1150], [-400, 1330], [-380, 1500]] as [number, number][]) {
    const s = shoreDistance(x, z);
    if (s < 0 || s > 80) continue;
    props.push({ kind: "lifeguard", x, z, ry: Math.PI / 2, s: 1, color: rng.pick(["#f2b134", "#e14b6a"]) });
  }
  for (const z of [1290, 1420]) props.push({ kind: "volley", x: -390, z, ry: 0, s: 1 });
  // Middle Park's bathing boxes in their colours, in a row along the back of the sand.
  for (let x = -760; x < -560; x += 6) {
    let z = 960;
    while (shoreDistance(x, z) > 30 && z < 1100) z += 2;
    if (!sand(x, z)) continue;
    props.push({ kind: "beachbox", x, z, ry: Math.PI, s: 1, color: rng.pick(["#e14b6a", "#3fa7a0", "#f2b134", "#4b8fd6", "#f6f1e7", "#2f5a3a", "#d81e2b", "#7a5cc4"]) });
  }
  for (const [x, z] of [[-360, 1080], [-345, 1460]] as [number, number][]) props.push({ kind: "billboard", x, z, ry: Math.PI / 2, s: 1 });
}

/** Swanson Dock: container stacks in the yards, cranes on the quay. */
function docks(rng: Rng, props: Prop[], taken: { x0: number; z0: number; x1: number; z1: number }[]) {
  const colors = ["#c0392b", "#2c6fa8", "#e67e22", "#27ae60", "#8e44ad", "#7f8c8d", "#d4ac0d", "#16a085", "#e8e6e1"];
  const yards = [
    { x0: -1660, x1: -1400, z0: -420, z1: 200 },
    { x0: -1360, x1: -1220, z0: -420, z1: 80 },
    { x0: -1180, x1: -1100, z0: -420, z1: 40 },
  ];
  for (const y of yards) {
    for (let x = y.x0 + 4; x < y.x1 - 6; x += 7)
      for (let z = y.z0 + 4; z < y.z1 - 14; z += 16) {
        if (taken.some((t) => x > t.x0 - 4 && x < t.x1 + 4 && z > t.z0 - 8 && z < t.z1 + 8)) continue;
        if (nearRoad(x, z, 6) || groundY(x, z + 6) < -0.05) continue;
        if (rng.next() < 0.2) continue;
        props.push({ kind: "container", x, z: z + 6, ry: Math.PI / 2, s: rng.int(1, 4), color: rng.pick(colors) });
      }
  }
  // Ship-to-shore cranes along the north bank.
  for (const x of [-1700, -1620, -1540, -1460, -1300, -1220]) {
    const r = riverAt(x);
    if (!r) continue;
    props.push({ kind: "crane", x, z: r.z - r.half - 14, ry: 0, s: 1 });
  }
}

/** Yachts in Victoria Harbour and off St Kilda. */
function marinas(rng: Rng, props: Prop[]) {
  for (let i = 0; i < 16; i++) props.push({ kind: "yacht", x: -960 + (i % 8) * 34 + rng.range(-3, 3), z: 70 + Math.floor(i / 8) * 70 + rng.range(-4, 4), ry: Math.PI / 2, s: rng.range(0.8, 1.4) });
  for (let i = 0; i < 10; i++) props.push({ kind: "yacht", x: -620 - (i % 5) * 26 + rng.range(-3, 3), z: 1140 + Math.floor(i / 5) * 22, ry: Math.PI / 2, s: rng.range(0.7, 1.1) });
}

/* -------------------------------------------------------------------------------- lookups */

let roadsRef: Roads | null = null;
/** Road segments by 50 m cell (with a 16 m margin), for quick lookups. */
let segCells: Map<number, number[]> | null = null;

function segIndex(r: Roads) {
  if (segCells) return segCells;
  segCells = new Map();
  for (const s of r.segs) {
    const A = r.nodes[s.a];
    const B = r.nodes[s.b];
    const m = 18;
    const x0 = Math.floor((Math.min(A.x, B.x) - m) / CELL);
    const x1 = Math.floor((Math.max(A.x, B.x) + m) / CELL);
    const z0 = Math.floor((Math.min(A.z, B.z) - m) / CELL);
    const z1 = Math.floor((Math.max(A.z, B.z) + m) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = cellKey(cx, cz);
        const list = segCells.get(k);
        if (list) list.push(s.id);
        else segCells.set(k, [s.id]);
      }
  }
  return segCells;
}

const NONE: number[] = [];
/** Segments whose street could touch (x, z) (within 18 m). */
export function segsAt(r: Roads, x: number, z: number) {
  return segIndex(r).get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? NONE;
}

/** Is (x, z) within `pad` metres of a road's carriageway? */
export function nearRoad(x: number, z: number, pad = 0) {
  const r = roadsRef ?? (roadsRef = buildRoads());
  if (pad <= 6) {
    for (const id of segsAt(r, x, z)) {
      const s = r.segs[id];
      const a = r.nodes[s.a];
      const b = r.nodes[s.b];
      const h = ROAD[s.cls].half + pad;
      if (s.axis === "ns") {
        if (Math.abs(x - a.x) <= h && z >= a.z - h && z <= b.z + h) return true;
      } else if (Math.abs(z - a.z) <= h && x >= a.x - h && x <= b.x + h) return true;
    }
    return false;
  }
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

/** Collision shapes for buildings, landmarks and solid props, hashed into 50 m cells. */
function index(city: City) {
  const solids: Solid[] = [];
  for (const b of city.buildings) solids.push({ x: b.x, z: b.z, hw: b.hw, hd: b.hd, h: b.h, b: b.id });
  for (const l of city.landmarks) for (const p of l.parts ?? []) solids.push({ x: p.x, z: p.z, hw: p.hw, hd: p.round ? 0 : p.hd, round: p.round, h: p.h });
  for (const p of city.props) {
    if (p.kind === "palm" || p.kind === "tree" || p.kind === "plane" || p.kind === "elm" || p.kind === "gum" || p.kind === "lamp") solids.push({ x: p.x, z: p.z, hw: p.kind === "lamp" ? 0.18 : 0.35 * p.s, hd: 0, round: true, h: 6 });
    else if (p.kind === "container") {
      const along = Math.abs(Math.sin(p.ry)) > 0.5;
      solids.push({ x: p.x, z: p.z, hw: along ? 6.1 : 1.25, hd: along ? 1.25 : 6.1, h: 2.6 * p.s });
    } else if (p.kind === "pump") solids.push({ x: p.x, z: p.z, hw: 0.6, hd: 0.6, h: 1.8 });
    else if (p.kind === "fountain") solids.push({ x: p.x, z: p.z, hw: 5 * p.s, hd: 0, round: true, h: 1 });
    else if (p.kind === "lifeguard") solids.push({ x: p.x, z: p.z, hw: 2, hd: 2, h: 4 });
    else if (p.kind === "beachbox") solids.push({ x: p.x, z: p.z, hw: 1.3, hd: 1.3, h: 3 });
    else if (p.kind === "flame") solids.push({ x: p.x, z: p.z, hw: 0.9, hd: 0, round: true, h: 12 });
    else if (p.kind === "crane") for (const dx of [-7, 7]) for (const dz of [-7, 7]) solids.push({ x: p.x + dx, z: p.z + dz, hw: 0.9, hd: 0.9, h: 60 });
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
  return true;
}

/** The road segment a point is on (within the carriageway, plus pad), if any. */
export function segAt(city: City, x: number, z: number, pad = 0): Seg | null {
  const { nodes, segs } = city.roads;
  for (const id of segsAt(city.roads, x, z)) {
    const s = segs[id];
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
  const near = segsAt(city.roads, x, z);
  const list = near.length ? near.map((i) => segs[i]) : segs;
  for (const s of list) {
    const a = nodes[s.a];
    const b = nodes[s.b];
    let t = s.axis === "ns" ? (z - a.z) / (b.z - a.z) : (x - a.x) / (b.x - a.x);
    t = Math.max(0, Math.min(1, t));
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    const d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { seg: s, x: px, z: pz, t, d };
  }
  if (best && best.d > 18 && near.length) {
    // The cell's roads were all far off: check the lot.
    for (const s of segs) {
      const a = nodes[s.a];
      const b = nodes[s.b];
      let t = s.axis === "ns" ? (z - a.z) / (b.z - a.z) : (x - a.x) / (b.x - a.x);
      t = Math.max(0, Math.min(1, t));
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < best.d) best = { seg: s, x: px, z: pz, t, d };
    }
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
  if (segAt(city, x, z, 5)) return "walk";
  const d = districtAt(x, z);
  if (d === "beach" || y < -0.05) return "sand";
  if (city.parks.some((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1)) return "grass";
  if (d === "toorak" || d === "domain") return "grass";
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
      // Laneways cost more, so routes keep to the proper roads.
      const ng = (g.get(cur.id) ?? 0) + s.len * (s.cls === "lane" ? 1.8 : 1);
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
  return r.d < 30 ? r.seg.name : placeName(x, z);
}

/** A spot on the sand within r of (x, z), or null if there's no beach near. */
export function sandSpot(x: number, z: number, r: number, rnd: () => number) {
  for (let i = 0; i < 12; i++) {
    const px = x + (rnd() * 2 - 1) * r;
    const pz = z + (rnd() * 2 - 1) * r;
    if (onBeach(px, pz) && groundY(px, pz) > -0.3) return { x: px, z: pz };
  }
  return null;
}

export const LINES = { NS, EW };
