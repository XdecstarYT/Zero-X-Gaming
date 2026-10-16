import { createRng, type Rng } from "../engine/rng";
import { F_ALLEY, F_BACK, F_BRIDGE, F_FWD, G, getMap, PT, type MapData } from "./mapdata";

/**
 * Melbourne, the Heatwave map, built from real map data (see `mapdata.ts`): every street with its
 * real name and shape, one-way where it is in life, lit junctions where the real traffic lights
 * are; every building's real footprint and height; the bay, the Yarra and the lakes; parks,
 * beaches, piers, railway yards; benches, bins, lamps and stops where they really stand. On top
 * of that the game adds what the data doesn't have: what each building is to the game (a shop, a
 * pub, a terrace with a lace verandah, a glass tower), street trees and lamps, parked cars, the
 * fixed places of the story, and a few landmark extras (a dome, a spire, the wheel's rim).
 *
 * Coordinates are metres on the ground round the corner of Flinders and Swanston Sts: x east,
 * z south, y up. Land is flat at y = 0; the water sits at WATER_Y. Traffic drives on the LEFT.
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
  docks: { name: "Fishermans Bend", color: "#8aa0b4" },
  westmelb: { name: "West Melbourne", color: "#9a9a8e" },
  carlton: { name: "Carlton", color: "#c9a27e" },
  fitzroy: { name: "Fitzroy", color: "#b98a7a" },
  eastmelb: { name: "East Melbourne", color: "#a8b48a" },
  richmond: { name: "Richmond", color: "#c49a8a" },
  southmelb: { name: "South Melbourne", color: "#b8a08a" },
  port: { name: "Port Melbourne", color: "#9fb4b8" },
  domain: { name: "Kings Domain", color: "#7fae6a" },
  southyarra: { name: "South Yarra", color: "#c4a8b8" },
  toorak: { name: "Prahran", color: "#a8c49a" },
  albertpark: { name: "Albert Park", color: "#8fbf7a" },
  stkilda: { name: "St Kilda", color: "#e7a4b8" },
  beach: { name: "The beach", color: "#ecd9a6" },
};

/** Road dimensions by class: half the carriageway, the footpath, and lane centres from the middle. */
export const ROAD: Record<RoadClass, { half: number; walk: number; lanes: number[] }> = {
  boulevard: { half: 10.5, walk: 4.5, lanes: [2.25, 5.75, 9.0] },
  avenue: { half: 7.0, walk: 4, lanes: [2.25, 5.25] },
  street: { half: 4.5, walk: 2.6, lanes: [2.25] },
  lane: { half: 2.4, walk: 0.6, lanes: [0] },
};
const CLASSES: RoadClass[] = ["boulevard", "avenue", "street", "lane"];

/** The map's edges (as the build script crops it). */
export const BOUNDS = { x0: -4322, z0: -2869, x1: 3584, z1: 6249 };

/** The build script's origin (Flinders St and Swanston St), for placing things by latitude and longitude. */
const LAT0 = -37.8178;
const LON0 = 144.9672;
const KX = Math.cos((LAT0 * Math.PI) / 180) * ((6371008.8 * Math.PI) / 180);
const KZ = (6371008.8 * Math.PI) / 180;
/** Degrees to map metres. */
export function geo(lat: number, lon: number) {
  return { x: (lon - LON0) * KX, z: -(lat - LAT0) * KZ };
}

/* -------------------------------------------------------------------------------- noise */

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

/* -------------------------------------------------------------------------------- the ground */

let gData: MapData["ground"] | null = null;
let gHeight: Float32Array | null = null;
let gX0 = 0;
let gZ0 = 0;

function setupGround(m: MapData) {
  const g = m.ground;
  gData = g;
  gX0 = m.x0;
  gZ0 = m.z0;
  const h = new Float32Array(g.nx * g.nz);
  for (let i = 0; i < h.length; i++) {
    const c = g.data[i];
    if (c >= G.water) h[i] = Math.max(-7.5, -1.0 - (c - G.water) * 0.45);
    else h[i] = 0;
  }
  // Sand shelves down to the water's edge.
  for (let j = 1; j < g.nz - 1; j++)
    for (let i = 1; i < g.nx - 1; i++) {
      const k = j * g.nx + i;
      if (g.data[k] !== G.sand) continue;
      const wet = g.data[k - 1] >= G.water || g.data[k + 1] >= G.water || g.data[k - g.nx] >= G.water || g.data[k + g.nx] >= G.water;
      if (wet) h[k] = -0.55;
    }
  gHeight = h;
}

/** The ground's class under a point (see `G`). */
export function groundClass(x: number, z: number) {
  const g = gData;
  if (!g) return G.land;
  const i = Math.floor((x - gX0) / g.cell);
  const j = Math.floor((z - gZ0) / g.cell);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return G.water + 15;
  return g.data[j * g.nx + i];
}

function rawHeight(x: number, z: number) {
  const g = gData;
  const h = gHeight;
  if (!g || !h) return 0;
  const fx = (x - gX0) / g.cell - 0.5;
  const fz = (z - gZ0) / g.cell - 0.5;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const at = (a: number, b: number) => {
    if (a < 0 || b < 0 || a >= g.nx || b >= g.nz) return -7.5;
    return h[b * g.nx + a];
  };
  const a0 = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
  const a1 = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
  return a0 + (a1 - a0) * tz;
}

/** Ground height: land at 0, beaches shelving into the bay, quays dropping into the river. */
export function groundY(x: number, z: number) {
  const y = rawHeight(x, z);
  if (y < -0.05 && onDeck(x, z)) return 0;
  return y;
}

export function isWater(x: number, z: number) {
  return groundY(x, z) < WATER_Y + 0.2;
}

/** On a pier, a jetty or a bridge's deck. */
export function onDeck(x: number, z: number) {
  const c = groundClass(x, z);
  if (c === G.deck) return true;
  if (c < G.water && rawHeight(x, z) > -0.3) return false;
  return bridgeAt(x, z);
}

let bridgeRoads: Roads | null = null;
function bridgeAt(x: number, z: number) {
  const r = bridgeRoads;
  if (!r) return false;
  for (const id of segsAt(r, x, z)) {
    const s = r.segs[id];
    if (!s.bridge) continue;
    const d = segDistance(r, s, x, z);
    if (d.d <= s.half + s.walk + 0.3 && d.t > -0.02 && d.t < 1.02) return true;
  }
  return false;
}

/** Is this the beach (sand on the bay)? */
export function onBeach(x: number, z: number) {
  return groundClass(x, z) === G.sand && !nearRoad(x, z, 3);
}

/** A park or a sports ground. */
export function isPark(x: number, z: number) {
  const c = groundClass(x, z);
  return c === G.grass || c === G.sport;
}

/* -------------------------------------------------------------------------------- districts */

const SUBURBS: [District, number, number][] = [
  ["southbank", -37.8255, 144.9625],
  ["docklands", -37.8165, 144.942],
  ["docks", -37.8255, 144.925],
  ["westmelb", -37.806, 144.946],
  ["carlton", -37.7995, 144.967],
  ["fitzroy", -37.8005, 144.979],
  ["eastmelb", -37.8125, 144.986],
  ["richmond", -37.8205, 145.001],
  ["southmelb", -37.8345, 144.957],
  ["port", -37.8395, 144.9375],
  ["domain", -37.8305, 144.976],
  ["southyarra", -37.8395, 144.993],
  ["toorak", -37.853, 144.995],
  ["albertpark", -37.8455, 144.958],
  ["stkilda", -37.864, 144.979],
];
let suburbXY: { d: District; x: number; z: number }[] = [];
// The Hoddle Grid (its four corners): Flinders/Spencer, Flinders/Spring, Spring/La Trobe, La Trobe/Spencer.
let cbdQuad: { x: number; z: number }[] = [];

function setupDistricts() {
  suburbXY = SUBURBS.map(([d, lat, lon]) => ({ d, ...geo(lat, lon) }));
  cbdQuad = [geo(-37.8212, 144.9545), geo(-37.8155, 144.9738), geo(-37.8094, 144.9714), geo(-37.8149, 144.9520)];
}

/** Where to write each district's name on the map. */
export function districtLabels() {
  if (!suburbXY.length) setupDistricts();
  return [{ name: DISTRICTS.cbd.name, ...geo(-37.8148, 144.9632) }, ...suburbXY.map((q) => ({ name: DISTRICTS[q.d].name, x: q.x, z: q.z }))];
}

function inPoly(poly: { x: number; z: number }[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function districtAt(x: number, z: number): District {
  if (!suburbXY.length) setupDistricts();
  if (groundClass(x, z) === G.sand) return "beach";
  if (inPoly(cbdQuad, x, z)) return "cbd";
  let best: District = "cbd";
  let bd = Infinity;
  for (const s of suburbXY) {
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (d < bd) {
      bd = d;
      best = s.d;
    }
  }
  return best;
}

/** The name of where you are, for the HUD: the beaches have their own. */
export function placeName(x: number, z: number) {
  const d = districtAt(x, z);
  if (d === "beach") {
    const p = geo(-37.858, 144.965);
    return z > p.z ? "St Kilda Beach" : x < geo(-37.84, 144.945).x ? "Port Melbourne Beach" : "Middle Park Beach";
  }
  return DISTRICTS[d].name;
}

/* -------------------------------------------------------------------------------- roads */

export interface Node {
  id: number;
  x: number;
  z: number;
  /** The segments that meet here. */
  segs: number[];
  /** Light phase (0 or 1) of each of `segs` (lit junctions). */
  ph: number[];
  light: boolean;
  /** Radius of the junction box (0 for a bend in the road). */
  r: number;
}

export interface Seg {
  id: number;
  a: number;
  b: number;
  cls: RoadClass;
  name: string;
  /** Over water. */
  bridge: boolean;
  /** 1: a→b only; −1: b→a only; 0 both ways. */
  oneway: 0 | 1 | -1;
  alley: boolean;
  half: number;
  walk: number;
  len: number;
  /** Heading a→b and its unit vector. */
  h: number;
  dx: number;
  dz: number;
}

export interface Roads {
  nodes: Node[];
  segs: Seg[];
}

export const roadHalf = (s: Seg) => s.half;
export const streetHalf = (s: Seg) => s.half + s.walk;

/** Lane centres from the middle (positive to the left of travel); the last is the kerb lane. */
export function laneOffsets(s: Seg): number[] {
  const L = ROAD[s.cls].lanes;
  if (s.oneway) {
    const n = Math.max(1, Math.min(L.length * 2, Math.floor((s.half * 2) / 3.3)));
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((i - (n - 1) / 2) * 3.3);
    return out;
  }
  const out = L.filter((o) => o < s.half - 0.9);
  return out.length ? out : [s.half * 0.5];
}

/** The light phase a segment has where it meets a node. */
export function phaseAt(n: Node, segId: number) {
  const i = n.segs.indexOf(segId);
  return i >= 0 ? n.ph[i] : 0;
}

/** Can traffic leave node `from` along this segment? */
export function canLeave(s: Seg, from: number) {
  if (s.oneway === 0) return true;
  return s.oneway === 1 ? s.a === from : s.b === from;
}

function buildRoads(m: MapData): Roads {
  const nodes: Node[] = [];
  const nN = m.nodeXY.length / 2;
  for (let i = 0; i < nN; i++) nodes.push({ id: i, x: m.nodeXY[i * 2], z: m.nodeXY[i * 2 + 1], segs: [], ph: [], light: false, r: 0 });
  const segs: Seg[] = [];
  const nE = m.edgeCls.length;
  for (let i = 0; i < nE; i++) {
    const a = m.edgeAB[i * 2];
    const b = m.edgeAB[i * 2 + 1];
    const A = nodes[a];
    const B = nodes[b];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    if (len < 0.05) continue;
    const cls = CLASSES[Math.min(3, m.edgeCls[i])];
    const fl = m.edgeFlags[i];
    const w = m.edgeWidth[i] / 4;
    const base = ROAD[cls].half;
    const half = w > 2 ? Math.max(base * 0.75, Math.min(base * 1.15, w / 2)) : base;
    const h = Math.atan2(B.z - A.z, B.x - A.x);
    const id = segs.length;
    segs.push({ id, a, b, cls, name: m.names[m.edgeName[i]] || "", bridge: !!(fl & F_BRIDGE), oneway: fl & F_FWD ? 1 : fl & F_BACK ? -1 : 0, alley: !!(fl & F_ALLEY), half, walk: ROAD[cls].walk, len, h, dx: Math.cos(h), dz: Math.sin(h) });
    A.segs.push(id);
    B.segs.push(id);
  }
  for (const n of nodes) {
    const deg = n.segs.length;
    if (deg >= 3) {
      let r = 0;
      for (const id of n.segs) r = Math.max(r, segs[id].half);
      n.r = Math.min(14, r + 1.2);
      n.light = m.lights[n.id] === 1 && n.segs.some((id) => segs[id].cls !== "lane");
    } else if (deg === 2) {
      const s0 = segs[n.segs[0]];
      const s1 = segs[n.segs[1]];
      const h0 = s0.a === n.id ? s0.h : s0.h + Math.PI;
      const h1 = s1.a === n.id ? s1.h : s1.h + Math.PI;
      const bend = Math.PI - Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)));
      n.r = bend > 0.45 ? Math.min(s0.half, s1.half) * 0.5 : 0;
    }
    // Phases: the roads in line with the widest one go together.
    let ref = 0;
    let wid = -1;
    for (const id of n.segs) {
      const s = segs[id];
      if (s.half > wid) {
        wid = s.half;
        ref = s.a === n.id ? s.h : s.h + Math.PI;
      }
    }
    n.ph = n.segs.map((id) => {
      const s = segs[id];
      const h = s.a === n.id ? s.h : s.h + Math.PI;
      const d = Math.abs(Math.atan2(Math.sin(2 * (h - ref)), Math.cos(2 * (h - ref)))) / 2;
      return d < Math.PI / 4 ? 0 : 1;
    });
  }
  // Short segments must still leave room between their junction boxes.
  for (const s of segs) {
    const A = nodes[s.a];
    const B = nodes[s.b];
    if (A.r + B.r > s.len - 0.5) {
      const k = Math.max(0, s.len - 0.5) / (A.r + B.r);
      if (A.segs.length < 3) A.r *= k;
      if (B.segs.length < 3) B.r *= k;
    }
  }
  return { nodes, segs };
}

/* ---- the segment index (50 m cells) */

const CELL = 50;
const cellKey = (cx: number, cz: number) => (cx + 1000) * 4000 + (cz + 1000);
const segCells = new WeakMap<Roads, Map<number, number[]>>();

function segIndex(r: Roads) {
  let idx = segCells.get(r);
  if (idx) return idx;
  idx = new Map();
  for (const s of r.segs) {
    const A = r.nodes[s.a];
    const B = r.nodes[s.b];
    const pad = s.half + s.walk + 4;
    const x0 = Math.floor((Math.min(A.x, B.x) - pad) / CELL);
    const x1 = Math.floor((Math.max(A.x, B.x) + pad) / CELL);
    const z0 = Math.floor((Math.min(A.z, B.z) - pad) / CELL);
    const z1 = Math.floor((Math.max(A.z, B.z) + pad) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        // Only the cells the segment's band actually crosses.
        const mx = (cx + 0.5) * CELL;
        const mz = (cz + 0.5) * CELL;
        const t = Math.max(0, Math.min(s.len, (mx - A.x) * s.dx + (mz - A.z) * s.dz));
        const d = Math.hypot(A.x + s.dx * t - mx, A.z + s.dz * t - mz);
        if (d > CELL * 0.72 + pad) continue;
        const k = cellKey(cx, cz);
        const list = idx.get(k);
        if (list) list.push(s.id);
        else idx.set(k, [s.id]);
      }
  }
  segCells.set(r, idx);
  return idx;
}

const NONE: number[] = [];
/** Segments whose street could touch (x, z). */
export function segsAt(r: Roads, x: number, z: number) {
  return segIndex(r).get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? NONE;
}

/** Distance from a point to a segment's centre line: the distance, how far along (0–1), the side (+ left of a→b). */
function segDistance(r: Roads, s: Seg, x: number, z: number) {
  const A = r.nodes[s.a];
  const px = x - A.x;
  const pz = z - A.z;
  const along = px * s.dx + pz * s.dz;
  const t = along / s.len;
  const tc = Math.max(0, Math.min(1, t));
  const cx = A.x + s.dx * s.len * tc;
  const cz = A.z + s.dz * s.len * tc;
  // Left of travel a→b is (dz, −dx).
  const side = px * s.dz - pz * s.dx;
  return { d: Math.hypot(x - cx, z - cz), t, x: cx, z: cz, side };
}

let roadsRef: Roads | null = null;

/** Is (x, z) within `pad` metres of a road's carriageway? */
export function nearRoad(x: number, z: number, pad = 0) {
  const r = roadsRef;
  if (!r) return false;
  for (const id of segsAt(r, x, z)) {
    const s = r.segs[id];
    if (segDistance(r, s, x, z).d <= s.half + pad) return true;
  }
  return false;
}

/** The road segment a point is on (within the carriageway, plus pad), if any. */
export function segAt(city: City, x: number, z: number, pad = 0): Seg | null {
  const r = city.roads;
  let best: Seg | null = null;
  let bd = Infinity;
  for (const id of segsAt(r, x, z)) {
    const s = r.segs[id];
    const d = segDistance(r, s, x, z);
    if (d.d <= s.half + pad && d.d < bd) {
      bd = d.d;
      best = s;
    }
  }
  return best;
}

/** The nearest point on any road's centreline, with its segment. */
export function nearestRoad(city: City, x: number, z: number) {
  const r = city.roads;
  let best: { seg: Seg; x: number; z: number; t: number; d: number } | null = null;
  const scan = (ids: readonly number[]) => {
    for (const id of ids) {
      const s = r.segs[id];
      const d = segDistance(r, s, x, z);
      if (!best || d.d < best.d) best = { seg: s, x: d.x, z: d.z, t: Math.max(0, Math.min(1, d.t)), d: d.d };
    }
  };
  scan(segsAt(r, x, z));
  if (!best || (best as { d: number }).d > 30) {
    // Look further out, ring by ring.
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const idx = segIndex(r);
    for (let ring = 1; ring < 40 && (!best || (best as { d: number }).d > ring * CELL - CELL); ring++)
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
          const list = idx.get(cellKey(cx + i, cz + j));
          if (list) scan(list);
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
  const c = groundClass(x, z);
  if (c === G.sand) return "sand";
  if (segAt(city, x, z, 5)) return "walk";
  if (c === G.grass || c === G.sport) return "grass";
  return "lot";
}

/** A small binary heap of [priority, id]. */
class Heap {
  private p: number[] = [];
  private v: number[] = [];
  get size() {
    return this.v.length;
  }
  push(pri: number, id: number) {
    const p = this.p;
    const v = this.v;
    p.push(pri);
    v.push(id);
    let i = p.length - 1;
    while (i > 0) {
      const u = (i - 1) >> 1;
      if (p[u] <= p[i]) break;
      [p[u], p[i]] = [p[i], p[u]];
      [v[u], v[i]] = [v[i], v[u]];
      i = u;
    }
  }
  pop() {
    const p = this.p;
    const v = this.v;
    const top = v[0];
    const lp = p.pop()!;
    const lv = v.pop()!;
    if (v.length) {
      p[0] = lp;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < p.length && p[l] < p[m]) m = l;
        if (r < p.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [p[m], p[i]] = [p[i], p[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Node ids of the shortest way along the roads between two nodes (A*). */
export function routeNodes(city: City, from: number[], goal: Set<number>, tx: number, tz: number, opts: { lanes?: boolean; oneway?: boolean; start?: number[] } = {}) {
  const { nodes, segs } = city.roads;
  const g = new Map<number, number>();
  const prev = new Map<number, number>();
  const open = new Heap();
  from.forEach((id, i) => {
    const d = opts.start?.[i] ?? 0;
    g.set(id, d);
    open.push(d + Math.hypot(nodes[id].x - tx, nodes[id].z - tz), id);
  });
  const closed = new Set<number>();
  let end = -1;
  let guard = 0;
  while (open.size && guard++ < 200000) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (goal.has(cur)) {
      end = cur;
      break;
    }
    const gc = g.get(cur) ?? 0;
    for (const sid of nodes[cur].segs) {
      const s = segs[sid];
      if (opts.lanes === false && s.cls === "lane") continue;
      const nb = s.a === cur ? s.b : s.a;
      if (closed.has(nb)) continue;
      // Laneways cost more, so routes keep to the proper roads; wrong way down a one-way more still.
      let cost = s.len * (s.cls === "lane" ? 1.8 : s.cls === "street" ? 1.1 : 1);
      if (!canLeave(s, cur)) {
        if (opts.oneway) continue;
        cost *= 3;
      }
      const ng = gc + cost;
      if (ng < (g.get(nb) ?? Infinity)) {
        g.set(nb, ng);
        prev.set(nb, cur);
        open.push(ng + Math.hypot(nodes[nb].x - tx, nodes[nb].z - tz), nb);
      }
    }
  }
  if (end < 0) return [];
  const chain: number[] = [];
  for (let c: number | undefined = end; c !== undefined; c = prev.get(c)) chain.unshift(c);
  return chain;
}

/** Shortest route along the roads between two points; returns the points to follow. */
export function route(city: City, fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
  const { nodes } = city.roads;
  const s0 = nearestRoad(city, fx, fz);
  const s1 = nearestRoad(city, tx, tz);
  const A0 = nodes[s0.seg.a];
  const B0 = nodes[s0.seg.b];
  const chain = routeNodes(city, [s0.seg.a, s0.seg.b], new Set([s1.seg.a, s1.seg.b]), tx, tz, { start: [Math.hypot(A0.x - s0.x, A0.z - s0.z), Math.hypot(B0.x - s0.x, B0.z - s0.z)] });
  const pts: { x: number; z: number }[] = [{ x: s0.x, z: s0.z }];
  for (const id of chain) pts.push({ x: nodes[id].x, z: nodes[id].z });
  pts.push({ x: s1.x, z: s1.z }, { x: tx, z: tz });
  // Thin out the bends: keep a point every few metres, and every corner.
  const out: { x: number; z: number }[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const h0 = Math.atan2(b.z - a.z, b.x - a.x);
    const h1 = Math.atan2(c.z - b.z, c.x - b.x);
    const turn = Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)));
    if (turn > 0.25 || Math.hypot(b.x - a.x, b.z - a.z) > 24) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** The street names round a point (for the HUD's location line). */
export function streetName(city: City, x: number, z: number) {
  const r = nearestRoad(city, x, z);
  return r && r.d < 30 && r.seg.name ? r.seg.name : placeName(x, z);
}

/** A spot on the sand within r of (x, z), or null if there's no beach near. */
export function sandSpot(x: number, z: number, r: number, rnd: () => number) {
  for (let i = 0; i < 14; i++) {
    const px = x + (rnd() * 2 - 1) * r;
    const pz = z + (rnd() * 2 - 1) * r;
    if (onBeach(px, pz) && groundY(px, pz) > -0.3) return { x: px, z: pz };
  }
  return null;
}

/* -------------------------------------------------------------------------------- trams */

/** A tram route: real tram streets, by way of these points (the track follows the roads between). */
export interface TramRoute {
  id: string;
  num: string;
  name: string;
  /** E-class (modern, three sections) or the heritage W-class of the City Circle. */
  type: "E" | "W";
  loop: boolean;
  /** Way points, latitude and longitude. */
  via: [number, number][];
}

export const TRAMS: TramRoute[] = [
  { id: "t16", num: "16", name: "Melbourne Uni – St Kilda Beach", type: "E", loop: false, via: [[-37.7985, 144.9637], [-37.8095, 144.9658], [-37.8178, 144.9676], [-37.8300, 144.9712], [-37.8556, 144.9800], [-37.8590, 144.9780], [-37.8640, 144.9740]] },
  { id: "t96", num: "96", name: "Spencer St – Nicholson St", type: "E", loop: false, via: [[-37.8158, 144.9535], [-37.8135, 144.9640], [-37.8105, 144.9725], [-37.8050, 144.9740], [-37.7960, 144.9775]] },
  { id: "t86", num: "86", name: "Docklands – Smith St", type: "E", loop: false, via: [[-37.8145, 144.9420], [-37.8160, 144.9530], [-37.8120, 144.9690], [-37.8100, 144.9748], [-37.8060, 144.9850], [-37.7960, 144.9840]] },
  { id: "t35", num: "35", name: "City Circle", type: "W", loop: true, via: [[-37.8205, 144.9548], [-37.8160, 144.9710], [-37.8105, 144.9710], [-37.8135, 144.9530]] },
  { id: "t58", num: "58", name: "Toorak Rd", type: "E", loop: false, via: [[-37.8300, 144.9712], [-37.8390, 144.9785], [-37.8395, 144.9910], [-37.8415, 145.0060]] },
  { id: "t78", num: "78", name: "Chapel St", type: "E", loop: false, via: [[-37.8235, 145.0003], [-37.8400, 144.9955], [-37.8520, 144.9930], [-37.8680, 144.9915]] },
  { id: "t70", num: "70", name: "Flinders St – Swan St", type: "E", loop: false, via: [[-37.8182, 144.9620], [-37.8150, 144.9748], [-37.8245, 144.9905], [-37.8255, 145.0060]] },
  { id: "t12", num: "12", name: "Collins St – St Kilda", type: "E", loop: false, via: [[-37.8120, 144.9720], [-37.8175, 144.9545], [-37.8255, 144.9535], [-37.8360, 144.9600], [-37.8510, 144.9720], [-37.8590, 144.9780]] },
];

/* -------------------------------------------------------------------------------- buildings */

export type BuildingKind = "tower" | "office" | "apartment" | "heritage" | "shop" | "pub" | "terrace" | "cottage" | "mansion" | "warehouse" | "shed" | "hotel" | "hospital" | "station" | "bank" | "garage";

/** Facade types (the facade shader's materials). */
export const FAC = { glass: 0, grid: 1, sandstone: 2, brick: 3, render: 4, weatherboard: 5, metal: 6, bluestone: 7 } as const;
export type Facade = (typeof FAC)[keyof typeof FAC];

export interface Building {
  id: number;
  /** Centre of its bounding box, and half the box's size. */
  x: number;
  z: number;
  hw: number;
  hd: number;
  h: number;
  /** Where the walls start (a podium's tower, an overhang): above the ground. */
  minH: number;
  kind: BuildingKind;
  style: number;
  /** Wall colour (glass tint, stone, brick, paint). */
  color: string;
  /** Trim colour (frames, mullions, lace). */
  accent: string;
  /** Legacy compass face (0 east, 1 south, 2 west, 3 north) nearest the street side. */
  face: number;
  /** The street front: its edge and outward normal. */
  front: { ax: number; az: number; bx: number; bz: number; nx: number; nz: number; len: number } | null;
  fac: Facade;
  floor: number;
  gf: number;
  shop: boolean;
  roof: "flat" | "hip" | "gable" | "sawtooth" | "dome" | "pyramid";
  verandah?: boolean;
  awning?: boolean;
  sign?: string;
  crown?: { from: number; inset: number; gold?: boolean };
  /** The footprint (x/z pairs, positive area) and its courtyards (negative). */
  ring: Float32Array;
  holes: Float32Array[];
  /** A minimum box round the footprint (for pitched roofs): centre, axis, half sizes. */
  obb: { x: number; z: number; ux: number; uz: number; hw: number; hd: number; fill: number };
  /** The real building's name, where it has one. */
  name?: string;
  /** Walls you can walk into (not a floating part). */
  solid: boolean;
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
  | "graffiti"
  | "pole";

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

/** Landmark extras on top of the real buildings, each drawn by its own model. */
export type LandmarkKind = "dome" | "spire" | "wheel" | "bolte" | "mcglights" | "cathedral" | "lunagate" | "kiosk";

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
  /** Its turn about y (radians), to sit square on the real streets. */
  rot: number;
  /** The roof it stands on (the tallest real building under its centre), or 0. */
  base: number;
  /** Solid footprint pieces. */
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

/** Something you can't walk or drive through: a box, a post, or a building's footprint. */
export interface Solid {
  x: number;
  z: number;
  hw: number;
  hd: number;
  /** A round post (radius hw) rather than a box. */
  round?: boolean;
  /** A polygon (x/z pairs); x, z, hw, hd are then its bounding box. */
  poly?: Float32Array;
  h: number;
  b?: number;
}

/* ---- palettes */

const GLASS = ["#5f7d96", "#4f6f7f", "#6d8798", "#7b8a8e", "#3e5466", "#5d7a6f", "#8a7d64", "#93a2ad", "#2e3a48", "#46525e"];
const CONCRETE = ["#c9c4b8", "#b9b5ab", "#d6d0c2", "#a9a7a0", "#c2b8a6", "#d9d4ca"];
const SANDSTONE = ["#d7c29a", "#cdb38a", "#e0cfa8", "#c8a978", "#d9c7a4"];
const BRICK = ["#9a4a32", "#a85a3a", "#7e3d2b", "#b5683f", "#8c5236", "#c9b08a", "#6e3a2a"];
const RENDER = ["#f3d9c7", "#e8d4b8", "#cfe0e6", "#f1e3c8", "#e7c9cf", "#d6e2c8", "#f5ecd8", "#e2d3e8", "#f0d2b0"];
const BOARDS = ["#efe9dc", "#d9e3e7", "#e9dccb", "#cbd8c8", "#f2e6c6", "#e3d0d0", "#d0d8e6"];
const METAL = ["#a9b1b6", "#8b9aa4", "#c0b6a4", "#9fa79a", "#b7b9bb"];
const TRIM = ["#f4f1ea", "#1f2a24", "#2a3b4a", "#5a2a24", "#e9e2d0", "#2e4a3a", "#3a3f47"];

const SHOPS: Partial<Record<District, string[]>> = {
  cbd: ["Flinders Lane Espresso", "Degraves Café", "Laneway Records", "Hardware Lane Grill", "Golden Dragon", "Pho 87", "Little Bourke Dumplings", "The Long Black", "Collins Books", "Block Arcade Tea", "Centre Place Bagels", "Chinatown Noodle", "Royal Arcade Toys", "Bourke St Optics", "Tramline Bar", "Hosier Lane Cans", "Elizabeth St Pawn", "Swanston Newsagency"],
  carlton: ["Trattoria Roma", "Pasticceria Lygon", "Gelato Bello", "Caffè Milano", "La Nonna", "Pizzeria Napoli", "Enoteca 21", "Osteria Carlton", "Il Gattopardo", "Bar Sport"],
  fitzroy: ["Vinyl Vault", "Rose St Tattoo", "The Black Cat Café", "Vintage Threads", "Bar Bodega", "Fitzroy Bike Co", "Smith St Pho", "Gertrude Gallery", "Polyester Books", "Night Cat Records", "Brunswick St Bagels"],
  stkilda: ["Acland Cake Co", "Europa Cakes", "Palm Court", "Fitzroy St Diner", "Pier Bar", "Sunset Fish & Chips", "Kiosk Gelato", "Backpackers by the Bay", "Acland Books", "Deco Lounge", "Little Blue Café"],
  toorak: ["Chapel St Boutique", "Prahran Denim", "Sneaker Lab", "Toorak Wines", "Lume Gallery", "The Jam Factory", "Windsor Coffee", "Neon Burger"],
  southyarra: ["Chapel St Boutique", "Toorak Rd Wines", "Sneaker Lab", "Como Florist", "South Yarra Sushi"],
  richmond: ["Swan St Hotel", "Bridge Rd Outlet", "Saigon Kitchen", "Victoria St Pho", "Richmond Hardware", "Church St Bikes", "Corner Grocer", "Bottle-O"],
  southmelb: ["Clarendon St Café", "South Melbourne Dim Sum", "Market Lane Coffee", "Emerald Hill Books", "Dorcas St Deli"],
  port: ["Bay St Bakery", "Port Fish & Chips", "Graham St Grocer", "The Albert Hotel Bistro"],
  albertpark: ["Victoria Ave Café", "Dundas Place Deli", "Bridport St Books"],
};
const PUBS = ["The Royal Oak", "The Union Hotel", "The Railway Hotel", "The Prince Alfred", "Builders Arms", "The Cricketers Arms", "The Duke of Wellington", "The Lord Newry", "The Esplanade Arms", "The Standard", "The Napier", "The Tote"];
const HOTELS = ["The Grand Esplanade", "Seaview Hotel", "The Victoria Palms", "Hotel Majestic", "The Belvedere", "Bayside Inn"];

/** Footprint maths. */
function ringArea(r: Float32Array) {
  let a = 0;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
  return a / 2;
}

/** The smallest box round a footprint (rotating calipers over the hull's edges). */
function minBox(r: Float32Array) {
  const n = r.length / 2;
  let best = { x: 0, z: 0, ux: 1, uz: 0, hw: 1, hd: 1, area: Infinity };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let ux = r[j * 2] - r[i * 2];
    let uz = r[j * 2 + 1] - r[i * 2 + 1];
    const l = Math.hypot(ux, uz);
    if (l < 0.5) continue;
    ux /= l;
    uz /= l;
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = r[k * 2];
      const z = r[k * 2 + 1];
      const a = x * ux + z * uz;
      const b = -x * uz + z * ux;
      if (a < a0) a0 = a;
      if (a > a1) a1 = a;
      if (b < b0) b0 = b;
      if (b > b1) b1 = b;
    }
    const area = (a1 - a0) * (b1 - b0);
    if (area < best.area) {
      const ca = (a0 + a1) / 2;
      const cb = (b0 + b1) / 2;
      best = { x: ca * ux - cb * uz, z: ca * uz + cb * ux, ux, uz, hw: (a1 - a0) / 2, hd: (b1 - b0) / 2, area };
    }
  }
  return best;
}

/** Point inside a polygon ring (x/z pairs). */
export function inRing(r: Float32Array, x: number, z: number) {
  let inside = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2];
    const zi = r[i * 2 + 1];
    const xj = r[j * 2];
    const zj = r[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/* -------------------------------------------------------------------------------- what each building is */

function lookFor(rng: Rng, b: Building, dist: District, cat: number, area: number, fillR: number) {
  const h = b.h;
  const pick = rng.pick;
  const r = rng.next();
  const cbdish = dist === "cbd" || dist === "southbank" || dist === "docklands";
  let kind: BuildingKind;
  switch (cat) {
    case 0:
      kind = area > 380 && (dist === "southyarra" || dist === "toorak" || dist === "eastmelb") ? "mansion" : "cottage";
      break;
    case 1:
      kind = "terrace";
      break;
    case 2:
      kind = h > 40 ? "tower" : "apartment";
      break;
    case 3:
      kind = h < 16 ? (r < 0.07 ? "pub" : "shop") : h > 45 ? "tower" : "office";
      break;
    case 4:
      kind = h > 45 ? "tower" : cbdish && h < 32 && r < 0.4 ? "heritage" : "office";
      break;
    case 5:
      kind = h < 6 ? "shed" : "warehouse";
      break;
    case 6:
      kind = "heritage";
      break;
    case 7:
      kind = area > 120 ? "garage" : "shed";
      break;
    case 8:
      kind = "station";
      break;
    case 10:
      kind = "hotel";
      break;
    default:
      if (h >= 45) kind = "tower";
      else if (h >= 18) kind = cbdish ? (r < 0.3 ? "heritage" : "office") : "apartment";
      else if (cbdish) kind = r < 0.45 ? "heritage" : r < 0.85 ? "shop" : "office";
      else if (dist === "docks") kind = area < 60 ? "shed" : "warehouse";
      else if (area < 40) kind = "shed";
      else if (area < 170 && fillR > 0.7 && b.obb.hw > 1 && Math.min(b.obb.hw, b.obb.hd) < 3.8) kind = "terrace";
      else if (area < 260) kind = h > 9 ? "shop" : "cottage";
      else kind = h > 10 ? "apartment" : r < 0.5 ? "shop" : "warehouse";
  }
  b.kind = kind;
  // Looks per kind.
  switch (kind) {
    case "tower": {
      const glass = r < 0.72;
      Object.assign(b, { color: glass ? pick(GLASS) : pick(CONCRETE), accent: pick(["#2a2f36", "#c9ced4", "#8a8f96", "#e9e2d0"]), fac: glass ? FAC.glass : FAC.grid, floor: 3.7, gf: 6, shop: true });
      break;
    }
    case "office":
      Object.assign(b, { color: r < 0.45 ? pick(GLASS) : pick(CONCRETE), accent: pick(["#2a2f36", "#d9d4ca", "#6a6f76"]), fac: r < 0.45 ? FAC.glass : FAC.grid, floor: 3.6, gf: 5, shop: true, awning: rng.next() < 0.35 });
      break;
    case "apartment":
      Object.assign(b, { color: r < 0.5 ? pick(RENDER) : r < 0.75 ? pick(CONCRETE) : pick(BRICK), accent: pick(TRIM), fac: r < 0.5 ? FAC.render : r < 0.75 ? FAC.grid : FAC.brick, floor: 3.1, gf: 3.6, shop: rng.next() < 0.25 });
      break;
    case "heritage": {
      const stone = rng.next() < 0.55;
      Object.assign(b, { color: stone ? pick(SANDSTONE) : pick(BRICK), accent: pick(["#e9e2d0", "#2e4a3a", "#3a3f47", "#f4f1ea"]), fac: stone ? (rng.next() < 0.15 ? FAC.bluestone : FAC.sandstone) : FAC.brick, floor: 4.3, gf: 4.6, shop: cat !== 6, awning: cat !== 6 && rng.next() < 0.6 });
      break;
    }
    case "shop":
    case "pub":
      Object.assign(b, { color: r < 0.5 ? pick(BRICK) : pick(RENDER), accent: pick(TRIM), fac: r < 0.5 ? FAC.brick : FAC.render, floor: 3.7, gf: 4.1, shop: true, awning: kind === "shop", verandah: kind === "pub" });
      break;
    case "terrace":
      Object.assign(b, { color: r < 0.55 ? pick(RENDER) : pick(BRICK), accent: pick(TRIM), fac: r < 0.55 ? FAC.render : FAC.brick, floor: 3.5, gf: 0, shop: false, roof: "hip", verandah: true });
      break;
    case "cottage":
      Object.assign(b, { color: r < 0.4 ? pick(BOARDS) : r < 0.75 ? pick(BRICK) : pick(RENDER), accent: pick(TRIM), fac: r < 0.4 ? FAC.weatherboard : r < 0.75 ? FAC.brick : FAC.render, floor: 3, gf: 0, shop: false, roof: rng.next() < 0.75 ? "hip" : "gable", verandah: rng.next() < 0.55 });
      break;
    case "mansion":
      Object.assign(b, { color: pick(["#f5f1e6", "#efe6d6", "#e6eef0", "#f3e3e0", "#d7c29a"]), accent: pick(["#2e4a3a", "#1f2a24", "#f4f1ea"]), fac: rng.next() < 0.7 ? FAC.render : FAC.brick, floor: 4, gf: 0, shop: false, roof: "hip" });
      break;
    case "warehouse":
      Object.assign(b, { color: r < 0.6 ? pick(BRICK) : pick(METAL), accent: "#2a2a2a", fac: r < 0.6 ? (rng.next() < 0.15 ? FAC.bluestone : FAC.brick) : FAC.metal, floor: 4.5, gf: 0, shop: false, roof: fillR > 0.85 && area > 400 && rng.next() < 0.45 ? "sawtooth" : "flat" });
      break;
    case "shed":
    case "garage":
      Object.assign(b, { color: rng.next() < 0.6 ? pick(METAL) : pick(BOARDS), accent: pick(["#d64a2a", "#2a6f9e", "#e2b33a", "#2a2a2a"]), fac: FAC.metal, floor: 4, gf: 0, shop: false, roof: fillR > 0.8 && area < 200 ? "gable" : "flat" });
      break;
    case "hotel":
      Object.assign(b, { color: pick(RENDER), accent: pick(TRIM), fac: FAC.render, floor: 3.3, gf: 4.4, shop: true, sign: pick(HOTELS) });
      break;
    case "station":
      Object.assign(b, { color: pick(SANDSTONE), accent: "#a8452e", fac: FAC.sandstone, floor: 4.8, gf: 5, shop: false });
      break;
    default:
      break;
  }
  // Pitched roofs only where the footprint is near enough a rectangle (and not too tall).
  if ((b.roof === "hip" || b.roof === "gable") && (fillR < 0.72 || h > 14 || Math.max(b.obb.hw, b.obb.hd) > 30)) b.roof = "flat";
  if (b.roof === "sawtooth" && fillR < 0.85) b.roof = "flat";
  // Signs on the street fronts.
  if (b.front && b.front.len > 4) {
    if (kind === "pub") b.sign = pick(PUBS);
    else if (kind === "shop" && rng.next() < 0.55) b.sign = pick(SHOPS[dist] ?? SHOPS.cbd!);
  }
  if (!b.front || b.front.len < 3) {
    b.awning = false;
    b.verandah = false;
  }
}

/** Named real buildings that get a particular look. */
const NAMED: [RegExp, Partial<Building>][] = [
  [/flinders street station/i, { kind: "station", color: "#d9a04a", accent: "#a8452e", fac: FAC.sandstone, floor: 4.6, gf: 5 }],
  [/federation square|ian potter/i, { kind: "heritage", color: "#c9ac7a", accent: "#8d9599", fac: FAC.grid, floor: 3.6, gf: 4 }],
  [/st paul'?s cathedral|cathedral/i, { kind: "heritage", color: "#b19a7a", accent: "#6f5f4a", fac: FAC.sandstone, floor: 9, gf: 0, shop: false }],
  [/parliament house/i, { kind: "heritage", color: "#c9b58e", accent: "#7a6a50", fac: FAC.sandstone, floor: 6, gf: 6, shop: false }],
  [/royal exhibition/i, { kind: "heritage", color: "#d9c19a", accent: "#8e3b2b", fac: FAC.render, floor: 8, gf: 0, shop: false, roof: "dome" }],
  [/shrine of remembrance/i, { kind: "heritage", color: "#aaa59a", accent: "#7a756a", fac: FAC.sandstone, floor: 60, gf: 0, shop: false, roof: "pyramid" }],
  [/eureka/i, { kind: "tower", color: "#c9a24a", accent: "#2a3850", fac: FAC.glass, crown: { from: 250, inset: 0, gold: true } }],
  [/southern cross station/i, { kind: "station", color: "#e9ecee", accent: "#3a4550", fac: FAC.glass, floor: 4, gf: 0 }],
  [/melbourne cricket ground|\bmcg\b/i, { kind: "warehouse", color: "#dfe2e4", accent: "#1f3a6e", fac: FAC.grid, floor: 7, gf: 0 }],
  [/arts centre|hamer hall|state theatre/i, { kind: "heritage", color: "#6f6a63", accent: "#3a3a3a", fac: FAC.bluestone, floor: 60, gf: 0, shop: false }],
  [/crown|casino/i, { kind: "office", color: "#2e3440", accent: "#384150", fac: FAC.glass, floor: 4.2, gf: 6 }],
  [/state library/i, { kind: "heritage", color: "#d7c29a", accent: "#5a4a3a", fac: FAC.sandstone, floor: 6, gf: 6, shop: false, roof: "dome" }],
  [/town hall|gpo|post office/i, { kind: "heritage", color: "#d0bd94", accent: "#5a4a3a", fac: FAC.sandstone, floor: 5.5, gf: 5.5 }],
];

/* -------------------------------------------------------------------------------- the fixed places */

interface PoiSpec {
  id: string;
  kind: PoiKind;
  name: string;
  lat: number;
  lon: number;
  /** Building kinds that will do, and the size range of footprint (m²). */
  want?: BuildingKind[];
  area?: [number, number];
  /** Make the building this kind (the shop it becomes). */
  as?: BuildingKind;
}

const POI_SPECS: PoiSpec[] = [
  { id: "safe-nina", kind: "safehouse", name: "Nina's flat", lat: -37.8678, lon: 144.9787, want: ["apartment", "shop", "terrace"], area: [120, 1500] },
  { id: "safe-dex", kind: "safehouse", name: "Dex's cottage", lat: -37.8392, lon: 144.9378, want: ["cottage", "terrace"], area: [60, 400] },
  { id: "hospital", kind: "hospital", name: "Yarra General Hospital", lat: -37.8456, lon: 144.9822, area: [1500, 1e6], as: "hospital" },
  { id: "police-hq", kind: "police", name: "Metro Police Centre", lat: -37.8205, lon: 144.9535, area: [500, 1e6], as: "station" },
  { id: "police-stk", kind: "police", name: "St Kilda Police Station", lat: -37.8608, lon: 144.9795, area: [150, 4000], as: "station" },
  { id: "police-rich", kind: "police", name: "Richmond Police Station", lat: -37.8190, lon: 144.9985, area: [150, 4000], as: "station" },
  { id: "bank", kind: "bank", name: "Southern Cross Reserve Bank", lat: -37.81816, lon: 144.9598, area: [600, 1e6], as: "bank" },
  { id: "gun-rich", kind: "gunshop", name: "Bullseye Arms", lat: -37.8256, lon: 144.9930, area: [80, 1200], as: "shop" },
  { id: "gun-smelb", kind: "gunshop", name: "Bullseye Arms", lat: -37.8332, lon: 144.9582, area: [80, 1200], as: "shop" },
  { id: "clothes-chapel", kind: "clothes", name: "Threadline", lat: -37.8462, lon: 144.9932, area: [80, 2000], as: "shop" },
  { id: "clothes-cbd", kind: "clothes", name: "Threadline", lat: -37.8137, lon: 144.9642, area: [80, 3000], as: "shop" },
  { id: "respray-rich", kind: "respray", name: "Spray Bay", lat: -37.8215, lon: 144.9962, area: [120, 3000], as: "garage" },
  { id: "respray-port", kind: "respray", name: "Spray Bay", lat: -37.8300, lon: 144.9395, area: [120, 5000], as: "garage" },
  { id: "store-1", kind: "store", name: "Rosa's Milk Bar", lat: -37.8000, lon: 144.9690, area: [50, 800], as: "shop" },
  { id: "store-2", kind: "store", name: "Corner Milk Bar", lat: -37.8002, lon: 144.9802, area: [50, 800], as: "shop" },
  { id: "store-3", kind: "store", name: "Park St Milk Bar", lat: -37.8382, lon: 144.9552, area: [50, 800], as: "shop" },
  { id: "store-4", kind: "store", name: "Prahran Milk Bar", lat: -37.8502, lon: 144.9922, area: [50, 800], as: "shop" },
  { id: "store-5", kind: "store", name: "Barkly St Milk Bar", lat: -37.8652, lon: 144.9832, area: [50, 800], as: "shop" },
  { id: "store-6", kind: "store", name: "Victoria St Milk Bar", lat: -37.8112, lon: 144.9952, area: [50, 800], as: "shop" },
  { id: "gas-1", kind: "gas", name: "Sunline Fuel", lat: -37.8332, lon: 144.9852, area: [40, 1500], as: "shop" },
  { id: "gas-2", kind: "gas", name: "Sunline Fuel", lat: -37.8372, lon: 144.9422, area: [40, 1500], as: "shop" },
  { id: "gas-3", kind: "gas", name: "Sunline Fuel", lat: -37.7992, lon: 144.9622, area: [40, 1500], as: "shop" },
  { id: "chop", kind: "chopshop", name: "Dockside Motors", lat: -37.8290, lon: 144.9300, area: [400, 1e5], as: "warehouse" },
  { id: "marina", kind: "marina", name: "Docklands Marina", lat: -37.8188, lon: 144.9425, area: [60, 6000], as: "shop" },
  { id: "mansion", kind: "mansion", name: "Coonara House", lat: -37.8418, lon: 144.9975, want: ["mansion", "cottage", "apartment"], area: [200, 3000], as: "mansion" },
  { id: "airboat", kind: "airboat", name: "Yarra Boat Hire", lat: -37.8196, lon: 144.96583 },
  { id: "pier", kind: "pier", name: "St Kilda Pier", lat: -37.86471, lon: 144.96857 },
];

/* -------------------------------------------------------------------------------- the build */

export function generate(seed = 7): City {
  const m = getMap();
  setupGround(m);
  setupDistricts();
  const rng = createRng(seed);
  const roads = buildRoads(m);
  roadsRef = roads;
  bridgeRoads = roads;
  const city: City = { roads, buildings: [], landmarks: [], props: [], pois: [], parks: [], parking: [], grid: new Map(), solids: [] };
  buildBuildings(city, m, rng);
  placeLandmarks(city);
  placePois(city);
  indexBuildings(city);
  streetscape(city, rng);
  furniture(city, m);
  parkTrees(city, rng);
  beaches(city, rng);
  index(city);
  return city;
}

function buildBuildings(city: City, m: MapData, rng: Rng) {
  const nB = m.bH.length;
  for (let i = 0; i < nB; i++) {
    const nr = m.bRings[i];
    if (!nr) continue;
    const r0 = m.bRing0[i];
    const rings: Float32Array[] = [];
    for (let k = 0; k < nr; k++) {
      const st = m.ringStart[r0 + k];
      const n = m.ringLen[r0 + k];
      rings.push(m.coords.slice(st * 2, (st + n) * 2));
    }
    let ring = rings[0];
    if (ring.length < 6) continue;
    // Positive area (shoelace in x, z), so outward normals are (dz, −dx) of each edge.
    if (ringArea(ring) < 0) ring = reverseRing(ring);
    const area = Math.abs(ringArea(ring));
    if (area < 10) continue;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let k = 0; k < ring.length; k += 2) {
      x0 = Math.min(x0, ring[k]);
      x1 = Math.max(x1, ring[k]);
      z0 = Math.min(z0, ring[k + 1]);
      z1 = Math.max(z1, ring[k + 1]);
    }
    const box = minBox(ring);
    const fillR = area / Math.max(1, box.area);
    const catRaw = m.bCat[i];
    const solid = (catRaw & 128) === 0 && m.bMin[i] < 2.5;
    const cat = catRaw & 127;
    const roofCode = m.bRoof[i] & 15;
    const b: Building = {
      id: city.buildings.length,
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      hw: (x1 - x0) / 2,
      hd: (z1 - z0) / 2,
      h: Math.max(2.6, m.bH[i]),
      minH: m.bMin[i],
      kind: "shop",
      style: rng.int(0, 3),
      color: "#cccccc",
      accent: "#333333",
      face: 0,
      front: null,
      fac: FAC.render,
      floor: 3.4,
      gf: 0,
      shop: false,
      roof: roofCode === 2 ? "gable" : roofCode === 3 || roofCode === 4 ? "hip" : roofCode === 5 ? "dome" : "flat",
      ring,
      holes: rings.slice(1).map((h) => (ringArea(h) > 0 ? reverseRing(h) : h)),
      obb: { x: box.x, z: box.z, ux: box.ux, uz: box.uz, hw: box.hw, hd: box.hd, fill: fillR },
      name: m.names[m.bName[i]] || undefined,
      solid,
    };
    if (b.minH > 0.5) {
      // A floating part (a tower over its podium, a skybridge): plain walls in its parent's style.
      b.front = null;
    } else b.front = streetFront(city, ring);
    if (b.front) {
      const f = b.front;
      b.face = Math.abs(f.nx) > Math.abs(f.nz) ? (f.nx > 0 ? 0 : 2) : f.nz > 0 ? 1 : 3;
    }
    const dist = districtAt(b.x, b.z);
    lookFor(rng, b, dist, cat, area, fillR);
    // The data's own colour and materials win.
    const col = m.bColor[i];
    if (col) b.color = `#${(((col >> 11) & 31) * 8).toString(16).padStart(2, "0")}${(((col >> 5) & 63) * 4).toString(16).padStart(2, "0")}${((col & 31) * 8).toString(16).padStart(2, "0")}`;
    const mat = m.bRoof[i] >> 4;
    if (mat === 1) b.fac = FAC.brick;
    else if (mat === 2) b.fac = FAC.glass;
    else if (mat === 3) b.fac = FAC.grid;
    else if (mat === 4) b.fac = FAC.weatherboard;
    else if (mat === 5) b.fac = FAC.metal;
    else if (mat === 6) b.fac = FAC.sandstone;
    if (b.name) for (const [re, look] of NAMED) if (re.test(b.name)) Object.assign(b, look);
    if (b.minH > 0.5) {
      b.awning = false;
      b.verandah = false;
      b.sign = undefined;
      if (b.roof === "hip" || b.roof === "gable") b.roof = "flat";
    }
    city.buildings.push(b);
  }
}

function reverseRing(r: Float32Array) {
  const n = r.length / 2;
  const out = new Float32Array(r.length);
  for (let i = 0; i < n; i++) {
    out[i * 2] = r[(n - 1 - i) * 2];
    out[i * 2 + 1] = r[(n - 1 - i) * 2 + 1];
  }
  return out;
}

/** The footprint edge that faces the nearest street: long enough, close to the road, looking at it. */
function streetFront(city: City, ring: Float32Array): Building["front"] {
  const n = ring.length / 2;
  let best: Building["front"] = null;
  let score = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2];
    const az = ring[i * 2 + 1];
    const bx = ring[j * 2];
    const bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 2.5) continue;
    // The ring has positive area (x east, z south), so the outward normal of a→b is (dz, −dx).
    const nx = (bz - az) / len;
    const nz = -(bx - ax) / len;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const r = nearestRoad(city, mx + nx * 2, mz + nz * 2);
    if (!r) continue;
    const toRoad = (r.x - mx) * nx + (r.z - mz) * nz;
    if (toRoad < 1) continue;
    const gap = toRoad - r.seg.half;
    if (gap > 28) continue;
    // Prefer close, long fronts square on to the road.
    const square = Math.abs(nx * -r.seg.dz + nz * r.seg.dx);
    const sc = gap + (1 - square) * 12 - Math.min(len, 20) * 0.4 + (r.seg.cls === "lane" ? 8 : 0);
    if (sc < score) {
      score = sc;
      best = { ax, az, bx, bz, nx, nz, len };
    }
  }
  return best;
}

/* ---- landmarks: extras on the real buildings */

function placeLandmarks(city: City) {
  const L = (kind: LandmarkKind, name: string, lat: number, lon: number, hw: number, hd: number, h: number, rotDeg: number, parts?: Landmark["parts"]) => {
    const p = geo(lat, lon);
    let base = 0;
    for (const b of city.buildings) if (b.h > base && Math.abs(b.x - p.x) < 150 && Math.abs(b.z - p.z) < 150 && inRing(b.ring, p.x, p.z)) base = b.h;
    city.landmarks.push({ kind, name, x: p.x, z: p.z, hw, hd, h, face: 1, base, rot: (rotDeg * Math.PI) / 180, parts: parts?.map((q) => ({ ...q, x: q.x + p.x, z: q.z + p.z })) });
  };
  // The Hoddle Grid sits about 20° off north; Flinders St runs along it.
  const grid = 20.5;
  L("dome", "Flinders Street Station", -37.81818, 144.96705, 12, 12, 36, grid);
  L("spire", "The Arts Centre", -37.82085, 144.96855, 12, 12, 162, 0);
  L("cathedral", "St Paul's Cathedral", -37.81695, 144.96770, 16, 30, 96, grid);
  L("wheel", "The Harbour Star", -37.81135, 144.93735, 14, 8, 120, -20, [{ x: 0, z: 0, hw: 6, hd: 8, h: 12 }]);
  L("bolte", "Bolte Bridge", -37.8178, 144.92855, 18, 6, 140, 0);
  L("mcglights", "The MCG", -37.81995, 144.98345, 95, 95, 75, 0);
  L("lunagate", "Big Mouth Fun Park", -37.86775, 144.97605, 14, 6, 26, -55, [{ x: 0, z: 0, hw: 10, hd: 4, h: 18 }]);
  L("kiosk", "The Pier Kiosk", -37.86079, 144.96151, 9, 7, 8, 54, [{ x: 0, z: 0, hw: 7, hd: 9, h: 6 }]);
  // Real buildings under an extra's footprint give way where the extra is the building.
  for (const l of city.landmarks) {
    if (l.kind !== "kiosk" && l.kind !== "lunagate") continue;
    city.buildings = city.buildings.filter((b) => Math.hypot(b.x - l.x, b.z - l.z) > Math.max(l.hw, l.hd) + 4 || b.h > 30);
  }
  city.buildings.forEach((b, i) => (b.id = i));
}

function placePois(city: City) {
  const cand = (sp: PoiSpec, p: { x: number; z: number }, radius: number) => {
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of city.buildings) {
      if (!b.front || !b.solid) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d > radius || d > bd) continue;
      const a = Math.abs(ringArea(b.ring));
      if (sp.area && (a < sp.area[0] || a > sp.area[1])) continue;
      if (sp.want && !sp.want.includes(b.kind)) continue;
      if (city.pois.some((q) => q.building === b.id)) continue;
      bd = d;
      best = b;
    }
    return best;
  };
  for (const sp of POI_SPECS) {
    const p = geo(sp.lat, sp.lon);
    if (sp.kind === "pier" || sp.kind === "airboat") {
      const fx = sp.kind === "pier" ? -1 : 0;
      const fz = sp.kind === "pier" ? 0 : -1;
      city.pois.push({ id: sp.id, kind: sp.kind, name: sp.name, x: p.x, z: p.z, fx, fz, district: districtAt(p.x, p.z) });
      continue;
    }
    const b = cand(sp, p, 180) ?? cand({ ...sp, want: undefined }, p, 260) ?? cand({ ...sp, want: undefined, area: undefined }, p, 600);
    if (!b || !b.front) continue;
    if (sp.as) {
      const keep = { ring: b.ring, front: b.front, h: b.h };
      b.kind = sp.as;
      if (sp.as === "shop") Object.assign(b, { fac: b.fac === FAC.glass ? FAC.grid : b.fac, shop: true, awning: true, gf: Math.max(b.gf, 4) });
      if (sp.as === "garage") Object.assign(b, { fac: FAC.metal, color: "#b7b9bb", accent: "#d64a2a", shop: false, gf: 0 });
      if (sp.as === "station") Object.assign(b, { fac: FAC.grid, color: "#c9c4b8", accent: "#1f3a6e", shop: false, gf: 5 });
      if (sp.as === "hospital") Object.assign(b, { fac: FAC.grid, color: "#e9ecef", accent: "#2a6f9e", shop: false, gf: 5 });
      if (sp.as === "bank") Object.assign(b, { fac: FAC.sandstone, color: "#d7c29a", accent: "#2b2b2b", shop: false, gf: 7, floor: 4.6 });
      Object.assign(b, keep);
    }
    if (sp.kind !== "safehouse") b.sign = sp.name;
    const f = b.front;
    const out = sp.kind === "gas" ? 4 : 2.4;
    const x = (f.ax + f.bx) / 2 + f.nx * out;
    const z = (f.az + f.bz) / 2 + f.nz * out;
    city.pois.push({ id: sp.id, kind: sp.kind, name: sp.name, x, z, fx: f.nx, fz: f.nz, district: districtAt(x, z), building: b.id });
  }
}

/* ---- the street: trees, lamps, parking, bins, laneway art */

function streetscape(city: City, rng: Rng) {
  const { segs, nodes } = city.roads;
  const solidNear = (x: number, z: number, pad: number) => {
    for (const b of buildingsNear(city, x, z)) {
      if (!b.solid) continue;
      if (x < b.x - b.hw - pad || x > b.x + b.hw + pad || z < b.z - b.hd - pad || z > b.z + b.hd + pad) continue;
      if (inRing(b.ring, x, z) || ringDist(b.ring, x, z) < pad) return true;
    }
    return false;
  };
  for (const s of segs) {
    if (s.cls === "lane") {
      // Laneway art on the walls of the city's lanes.
      const d = districtAt((nodes[s.a].x + nodes[s.b].x) / 2, (nodes[s.a].z + nodes[s.b].z) / 2);
      if ((d === "cbd" || d === "fitzroy" || d === "richmond") && s.len > 12 && rng.next() < 0.55) {
        const A = nodes[s.a];
        city.props.push({ kind: "graffiti", x: A.x + s.dx * s.len * 0.5, z: A.z + s.dz * s.len * 0.5, ry: s.h, s: Math.min(30, s.len * 0.8), color: String(s.half) });
      }
      continue;
    }
    if (s.bridge) continue;
    const A = nodes[s.a];
    const B = nodes[s.b];
    const mid = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
    const dist = districtAt(mid.x, mid.z);
    const cbd = dist === "cbd" || dist === "southbank" || dist === "docklands";
    const tree: PropKind = dist === "stkilda" && rng.next() < 0.45 ? "palm" : cbd || s.cls !== "street" ? "plane" : dist === "carlton" || dist === "fitzroy" || dist === "eastmelb" || dist === "albertpark" ? "elm" : dist === "port" || dist === "docks" || dist === "southmelb" ? (rng.next() < 0.6 ? "gum" : "plane") : rng.pick(["elm", "plane", "gum"] as const);
    const spacing = cbd ? 15 : 17;
    const u0 = A.r + 7;
    const u1 = s.len - B.r - 7;
    const lx = s.dz;
    const lz = -s.dx;
    for (let u = u0 + rng.range(0, spacing); u < u1; u += spacing) {
      for (const side of [-1, 1]) {
        const off = s.half + s.walk * 0.62;
        const x = A.x + s.dx * u + lx * off * side;
        const z = A.z + s.dz * u + lz * off * side;
        if (groundY(x, z) < -0.05) continue;
        const r = rng.next();
        if (r < (cbd ? 0.5 : 0.62) && !solidNear(x, z, 1.4) && !nearRoad(x, z, 0.4)) city.props.push({ kind: tree, x, z, ry: rng.range(0, 6.28), s: rng.range(0.8, 1.15) });
        // A street lamp now and then, between the trees.
        else if (r > 0.86 && !solidNear(x, z, 0.6) && !nearRoad(x, z, 0.3)) city.props.push({ kind: "lamp", x, z, ry: Math.atan2(-side * s.dx, -side * s.dz), s: 1 });
      }
    }
    // Parked cars along the kerb of the quieter streets.
    if (s.cls === "street" && !s.oneway && s.len > 30 && dist !== "cbd") {
      for (let u = u0 + 2; u < u1 - 2; u += 6.5) {
        if (rng.next() > 0.3) continue;
        const side = rng.next() < 0.5 ? 1 : -1;
        const off = s.half - 1.0;
        city.parking.push({ x: A.x + s.dx * u + lx * off * side, z: A.z + s.dz * u + lz * off * side, h: side > 0 ? s.h : s.h + Math.PI });
      }
    }
  }
}

/** The real street furniture. */
function furniture(city: City, m: MapData) {
  const n = m.ptType.length;
  // Lamps reach their arm (local +x) out over the road; everything else faces it (local +z).
  const ry = (x: number, z: number, lamp: boolean) => {
    const r = nearestRoad(city, x, z);
    if (!r || r.d < 0.01) return 0;
    const vx = (r.x - x) / r.d;
    const vz = (r.z - z) / r.d;
    return lamp ? Math.atan2(-vz, vx) : Math.atan2(vx, vz);
  };
  for (let i = 0; i < n; i++) {
    const t = m.ptType[i];
    const x = m.ptXY[i * 2];
    const z = m.ptXY[i * 2 + 1];
    if (nearRoad(x, z, -0.3)) continue;
    let kind: PropKind | null = null;
    if (t === PT.bench) kind = "bench";
    else if (t === PT.bin) kind = "bin";
    else if (t === PT.lamp) kind = "lamp";
    else if (t === PT.busStop) kind = "busstop";
    else if (t === PT.pole || t === PT.mast) kind = "pole";
    else if (t === PT.fountain) kind = "fountain";
    if (!kind) continue;
    city.props.push({ kind, x, z, ry: ry(x, z, kind === "lamp"), s: kind === "fountain" ? 0.6 : t === PT.mast ? 2 : 1 });
  }
}

function parkTrees(city: City, rng: Rng) {
  const g = gData!;
  // Sample the grass on a jittered 20 m lattice.
  const step = 5;
  for (let j = 0; j < g.nz; j += step)
    for (let i = 0; i < g.nx; i += step) {
      const ci = Math.min(g.nx - 1, i + rng.int(0, step - 1));
      const cj = Math.min(g.nz - 1, j + rng.int(0, step - 1));
      const c = g.data[cj * g.nx + ci];
      if (c !== G.grass) continue;
      if (rng.next() > 0.42) continue;
      const x = gX0 + (ci + 0.5) * g.cell + rng.range(-1.5, 1.5);
      const z = gZ0 + (cj + 0.5) * g.cell + rng.range(-1.5, 1.5);
      if (nearRoad(x, z, 3)) continue;
      const d = districtAt(x, z);
      const kind: PropKind = d === "stkilda" || d === "beach" ? (rng.next() < 0.6 ? "palm" : "gum") : d === "domain" || d === "albertpark" ? rng.pick(["gum", "elm", "plane", "gum"] as const) : rng.pick(["elm", "plane", "gum"] as const);
      city.props.push({ kind, x, z, ry: rng.range(0, 6.28), s: rng.range(0.85, 1.35) });
    }
}

function beaches(city: City, rng: Rng) {
  const g = gData!;
  for (let j = 0; j < g.nz; j += 3)
    for (let i = 0; i < g.nx; i += 3) {
      if (g.data[j * g.nx + i] !== G.sand) continue;
      if (rng.next() > 0.08) continue;
      const x = gX0 + (i + 0.5) * g.cell;
      const z = gZ0 + (j + 0.5) * g.cell;
      if (nearRoad(x, z, 2)) continue;
      const r = rng.next();
      if (r < 0.75) city.props.push({ kind: "umbrella", x, z, ry: rng.range(0, 6.28), s: 1, color: rng.pick(["#e14b6a", "#3fa7a0", "#f2b134", "#4b8fd6", "#f6f1e7"]) });
      else if (r < 0.8) city.props.push({ kind: "lifeguard", x, z, ry: 0, s: 1, color: "#e8b730" });
      else if (r < 0.84) city.props.push({ kind: "volley", x, z, ry: 0, s: 1 });
    }
}

/* -------------------------------------------------------------------------------- collisions */

function buildingsNear(_city: City, x: number, z: number) {
  return bGridNear(x, z);
}

/** A grid of buildings, made before the solids index exists (for placing street trees). */
let bGrid: Map<number, Building[]> | null = null;
function bGridNear(x: number, z: number) {
  return bGrid?.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
}
function indexBuildings(city: City) {
  bGrid = new Map();
  for (const b of city.buildings) {
    const x0 = Math.floor((b.x - b.hw - 2) / CELL);
    const x1 = Math.floor((b.x + b.hw + 2) / CELL);
    const z0 = Math.floor((b.z - b.hd - 2) / CELL);
    const z1 = Math.floor((b.z + b.hd + 2) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = cellKey(cx, cz);
        const l = bGrid.get(k);
        if (l) l.push(b);
        else bGrid.set(k, [b]);
      }
  }
}

/** Distance from a point to a ring's edges. */
export function ringDist(r: Float32Array, x: number, z: number) {
  const n = r.length / 2;
  let best = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = r[j * 2];
    const az = r[j * 2 + 1];
    const bx = r[i * 2];
    const bz = r[i * 2 + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best) best = d;
  }
  return best;
}

/** Collision shapes for buildings, landmarks and solid props, hashed into 50 m cells. */
function index(city: City) {
  const solids: Solid[] = [];
  for (const b of city.buildings) if (b.solid) solids.push({ x: b.x, z: b.z, hw: b.hw, hd: b.hd, h: b.h, b: b.id, poly: b.ring });
  for (const l of city.landmarks) for (const p of l.parts ?? []) solids.push({ x: p.x, z: p.z, hw: p.hw, hd: p.round ? 0 : p.hd, round: p.round, h: p.h });
  for (const p of city.props) {
    if (p.kind === "palm" || p.kind === "tree" || p.kind === "plane" || p.kind === "elm" || p.kind === "gum" || p.kind === "lamp" || p.kind === "pole") solids.push({ x: p.x, z: p.z, hw: p.kind === "lamp" || p.kind === "pole" ? 0.18 : 0.35 * p.s, hd: 0, round: true, h: 6 });
    else if (p.kind === "fountain") solids.push({ x: p.x, z: p.z, hw: 5 * p.s, hd: 0, round: true, h: 1 });
    else if (p.kind === "lifeguard") solids.push({ x: p.x, z: p.z, hw: 2, hd: 2, h: 4 });
    else if (p.kind === "busstop") solids.push({ x: p.x, z: p.z, hw: 0.4, hd: 0, round: true, h: 2.6 });
  }
  city.solids = solids;
  city.grid = new Map();
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
  const single = x0 === x1 && z0 === z1;
  const seen = single ? null : new Set<number>();
  for (let cx = x0; cx <= x1; cx++)
    for (let cz = z0; cz <= z1; cz++) {
      const list = city.grid.get(cellKey(cx, cz));
      if (!list) continue;
      for (const i of list) {
        if (seen) {
          if (seen.has(i)) continue;
          seen.add(i);
        }
        out.push(city.solids[i]);
      }
    }
  return out;
}

/** Is a point inside a solid (in plan)? */
export function insideSolid(s: Solid, x: number, z: number) {
  if (s.round) return Math.hypot(x - s.x, z - s.z) < s.hw;
  if (Math.abs(x - s.x) > s.hw || Math.abs(z - s.z) > s.hd) return false;
  return s.poly ? inRing(s.poly, x, z) : true;
}

/**
 * Where a ray (from o along d, t from 0 to 1 over d) first enters a solid in plan, or −1.
 * Boxes by slabs, posts by their circle, buildings by their footprint's edges.
 */
export function rayEnter(s: Solid, ox: number, oz: number, dx: number, dz: number) {
  if (s.round) {
    const fx = ox - s.x;
    const fz = oz - s.z;
    const a = dx * dx + dz * dz;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - s.hw * s.hw;
    if (c < 0) return 0;
    const disc = b * b - 4 * a * c;
    if (disc < 0 || a < 1e-12) return -1;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : -1;
  }
  // The box first (cheap), then the footprint.
  let t0 = 0;
  let t1 = 1;
  const slab = (p: number, v: number, lo: number, hi: number) => {
    if (Math.abs(v) < 1e-9) return p >= lo && p <= hi;
    let ta = (lo - p) / v;
    let tb = (hi - p) / v;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  if (!slab(ox, dx, s.x - s.hw, s.x + s.hw) || !slab(oz, dz, s.z - s.hd, s.z + s.hd)) return -1;
  if (!s.poly) return t0;
  if (inRing(s.poly, ox, oz)) return 0;
  const r = s.poly;
  const n = r.length / 2;
  let best = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = r[j * 2];
    const az = r[j * 2 + 1];
    const ex = r[i * 2] - ax;
    const ez = r[i * 2 + 1] - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - ox) * ez - (az - oz) * ex) / den;
    const u = ((ax - ox) * dz - (az - oz) * dx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best === Infinity ? -1 : best;
}

/** Push a circle (x, z, radius r) out of the solids near it; returns the push and the normal of the last hit. */
export function pushOut(city: City, p: { x: number; z: number }, r: number, scratch: Solid[] = [], maxH = Infinity) {
  let hit = false;
  let nx = 0;
  let nz = 0;
  for (const s of solidsNear(city, p.x, p.z, r + 4, scratch)) {
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
    if (p.x < s.x - s.hw - r || p.x > s.x + s.hw + r || p.z < s.z - s.hd - r || p.z > s.z + s.hd + r) continue;
    if (s.poly) {
      // Nearest point on the footprint's edges; push out along it (or out of the inside).
      const ring = s.poly;
      const n = ring.length / 2;
      let bd = Infinity;
      let cx = 0;
      let cz = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = ring[j * 2];
        const az = ring[j * 2 + 1];
        const ex = ring[i * 2] - ax;
        const ez = ring[i * 2 + 1] - az;
        const l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * ex + (p.z - az) * ez) / l2));
        const qx = ax + ex * t;
        const qz = az + ez * t;
        const d = (p.x - qx) * (p.x - qx) + (p.z - qz) * (p.z - qz);
        if (d < bd) {
          bd = d;
          cx = qx;
          cz = qz;
        }
      }
      const inside = inRing(ring, p.x, p.z);
      const d = Math.sqrt(bd);
      if (!inside && d >= r) continue;
      hit = true;
      let ux = p.x - cx;
      let uz = p.z - cz;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul;
      uz /= ul;
      if (inside) {
        ux = -ux;
        uz = -uz;
      }
      p.x = cx + ux * r;
      p.z = cz + uz * r;
      nx = ux;
      nz = uz;
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
  const list = solidsNear(city, (ax + bx) / 2, (az + bz) / 2, d / 2 + 4, scratch);
  for (const s of list) {
    if (s.round || s.h < y) continue;
    if (rayEnter(s, ax, az, bx - ax, bz - az) >= 0) return false;
  }
  return true;
}

