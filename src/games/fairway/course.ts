/**
 * Fairway's courses: each hole is generated from a fixed seed, so it plays
 * the same every round. A hole is data (the line of play, the green, its pin,
 * bunkers, ponds and trees) plus two pure functions over it, the ground
 * height and the lie, which both the physics and the renderer use.
 *
 * Hole frame: metres, the tee at the origin, the hole heading roughly +z.
 */

export type Lie = "tee" | "fairway" | "rough" | "deep" | "fringe" | "green" | "bunker" | "water" | "ob";
export type Style = "links" | "parkland";

export interface V2 {
  x: number;
  z: number;
}
export interface Ellipse extends V2 {
  rx: number;
  rz: number;
  rot: number;
}
export interface Bunker extends Ellipse {
  depth: number;
}
export interface Pond extends Ellipse {
  level: number;
}
export interface Tree extends V2 {
  h: number;
  r: number;
  kind: number;
}

export interface Hole {
  n: number;
  par: number;
  style: Style;
  seed: number;
  tee: V2;
  /** The line of play, tee to the middle of the green (densely sampled). */
  path: V2[];
  /** Cumulative length along `path`. */
  along: number[];
  green: Ellipse;
  pin: V2;
  fairwayW: number;
  bunkers: Bunker[];
  ponds: Pond[];
  trees: Tree[];
  /** Height gradient across the green (m per m), the break. */
  slope: V2;
  /** Height of the green's centre. */
  greenY: number;
  teeY: number;
  hills: number;
  /** Tee to pin along the line of play. */
  length: number;
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** Links: the sea, a big hazard down one side (x sign), or 0. */
  sea: number;
}

export interface Course {
  id: string;
  name: string;
  place: string;
  style: Style;
  pars: number[];
  seed: number;
  /** Typical wind strength (m/s). */
  wind: number;
}

export const COURSES: Course[] = [
  { id: "saltgrass", name: "Saltgrass Links", place: "On the dunes by the sea", style: "links", pars: [4, 3, 5, 4, 4, 3, 4, 5, 4], seed: 1847, wind: 6 },
  { id: "ironbark", name: "Ironbark Hills", place: "Gum-lined parkland and lakes", style: "parkland", pars: [4, 5, 3, 4, 4, 5, 3, 4, 4], seed: 3301, wind: 3 },
];
export const courseById = (id: string) => COURSES.find((c) => c.id === id) ?? COURSES[0];

export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ noise

function hash(x: number, z: number, s: number) {
  const h = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x: number, z: number, s: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0, s) + (hash(x0 + 1, z0, s) - hash(x0, z0, s)) * sx;
  const b = hash(x0, z0 + 1, s) + (hash(x0 + 1, z0 + 1, s) - hash(x0, z0 + 1, s)) * sx;
  return a + (b - a) * sz;
}
/** Fractal noise, roughly -1..1. */
export function fbm(x: number, z: number, s: number, oct = 3) {
  let v = 0;
  let amp = 1;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    v += (vnoise(x * f, z * f, s + i * 17) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return v / norm;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** (dx, dz) in an ellipse's frame, normalised: < 1 inside. */
export function ellipseK(e: Ellipse, x: number, z: number) {
  const dx = x - e.x;
  const dz = z - e.z;
  const c = Math.cos(e.rot);
  const s = Math.sin(e.rot);
  const u = (dx * c - dz * s) / e.rx;
  const v = (dx * s + dz * c) / e.rz;
  return Math.sqrt(u * u + v * v);
}

// --------------------------------------------------------------- geometry

/** Distance from the line of play and how far along it. */
export function pathInfo(h: Hole, x: number, z: number) {
  let best = Infinity;
  let at = 0;
  const p = h.path;
  for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i].x;
    const az = p[i].z;
    const dx = p[i + 1].x - ax;
    const dz = p[i + 1].z - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) {
      best = d;
      at = h.along[i] + Math.sqrt(l2) * t;
    }
  }
  return { d: best, at };
}

/** The point `d` metres along the line of play. */
export function pointAlong(h: Hole, d: number): V2 {
  const p = h.path;
  for (let i = 0; i < p.length - 1; i++) {
    if (d <= h.along[i + 1] || i === p.length - 2) {
      const seg = h.along[i + 1] - h.along[i] || 1;
      const t = Math.max(0, Math.min(1, (d - h.along[i]) / seg));
      return { x: p[i].x + (p[i + 1].x - p[i].x) * t, z: p[i].z + (p[i + 1].z - p[i].z) * t };
    }
  }
  return p[p.length - 1];
}

/** The fairway's edge wanders a little. */
const edgeWobble = (h: Hole, at: number) => fbm(at / 40, 3.3, h.seed + 5, 2) * 4;

/** Ground height without the green, tee, bunker and pond shaping. */
function baseHeight(h: Hole, x: number, z: number, d: number) {
  const s = h.seed;
  const big = fbm(x / 140, z / 140, s, 3) * h.hills;
  const mid = fbm(x / 45, z / 45, s + 3, 2) * h.hills * 0.35;
  // Fairways are rolled flatter; the rough rises into banks (dunes on a links).
  const corridor = smooth(h.fairwayW * 0.5, h.fairwayW * 0.5 + 35, d);
  const dunes = h.style === "links" ? Math.max(0, fbm(x / 30, z / 30, s + 9, 3)) * 7 * corridor : corridor * 2.5 * (0.6 + 0.4 * fbm(x / 60, z / 60, s + 11, 2));
  let y = big + mid * (0.35 + 0.65 * corridor) + dunes;
  if (h.sea) {
    // Falls away to the beach and the water beyond.
    const off = x * h.sea - (h.fairwayW * 0.5 + 45);
    if (off > 0) y -= Math.min(9, off * 0.25);
  }
  return y;
}

/**
 * Ground height: the shaped surface sampled on a 25 cm lattice (filled in as
 * it's asked for) and blended between, so the physics can ask thousands of
 * times a second.
 */
const CELL = 0.25;
const heights = new WeakMap<Hole, Map<number, number>>();
const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
export function heightAt(h: Hole, x: number, z: number) {
  let m = heights.get(h);
  if (!m) heights.set(h, (m = new Map()));
  const fx = x / CELL;
  const fz = z / CELL;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const at = (a: number, b: number) => {
    const k = key(a, b);
    let v = m.get(k);
    if (v === undefined) {
      v = rawHeight(h, a * CELL, b * CELL);
      m.set(k, v);
    }
    return v;
  };
  const tx = fx - i;
  const tz = fz - j;
  const a = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
  const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
  return a + (b - a) * tz;
}

function rawHeight(h: Hole, x: number, z: number) {
  const { d } = pathInfo(h, x, z);
  let y = baseHeight(h, x, z, d);
  // Tee box: a level, raised pad.
  const td = Math.hypot(x - h.tee.x, z - h.tee.z);
  y += (h.teeY - y) * (1 - smooth(5, 11, td));
  // Green: a tilted plate with soft undulation, blended into the surrounds.
  const gk = ellipseK(h.green, x, z);
  const gy = h.greenY + h.slope.x * (x - h.green.x) + h.slope.z * (z - h.green.z) + fbm(x / 11, z / 11, h.seed + 21, 2) * 0.05;
  y += (gy - y) * (1 - smooth(1.05, 1.9, gk));
  // Bunkers: bowls with a little lip.
  for (const b of h.bunkers) {
    const k = ellipseK(b, x, z);
    if (k < 1) y -= b.depth * (1 - k * k);
    else if (k < 1.35) y += 0.25 * Math.sin(((k - 1) / 0.35) * Math.PI);
  }
  // Ponds: dug below the water line.
  for (const p of h.ponds) {
    const k = ellipseK(p, x, z);
    if (k < 1.4) y = Math.min(y, p.level - 1.4 * (1 - Math.min(1, k) ** 2) + Math.max(0, k - 0.85) * 2.4);
  }
  return y;
}

/** Ground normal (finite differences). */
export function normalAt(h: Hole, x: number, z: number): [number, number, number] {
  const e = 0.25;
  const hx = (heightAt(h, x + e, z) - heightAt(h, x - e, z)) / (2 * e);
  const hz = (heightAt(h, x, z + e) - heightAt(h, x, z - e)) / (2 * e);
  const l = Math.hypot(hx, 1, hz);
  return [-hx / l, 1 / l, -hz / l];
}

/** The lie, plus where the point is relative to the line of play (for mowing patterns). */
export function lieInfo(h: Hole, x: number, z: number): { lie: Lie; d: number; at: number } {
  const { d, at } = pathInfo(h, x, z);
  const lie = ((): Lie => {
    const b = h.bounds;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return "ob";
    if (h.sea && x * h.sea > h.fairwayW * 0.5 + 62) return "water";
    for (const p of h.ponds) if (ellipseK(p, x, z) < 1) return "water";
    for (const bk of h.bunkers) if (ellipseK(bk, x, z) < 1) return "bunker";
    const gk = ellipseK(h.green, x, z);
    if (gk < 1) return "green";
    if (gk < 1 + 2 / Math.min(h.green.rx, h.green.rz)) return "fringe";
    if (Math.abs(x - h.tee.x) < 5 && Math.abs(z - h.tee.z) < 7) return "tee";
    if (d > h.fairwayW * 0.5 + 70) return "ob";
    const fw = h.fairwayW * 0.5 + edgeWobble(h, at);
    const start = h.par === 3 ? h.length - 40 : 45;
    if (d < fw && at > start && at < h.length + 6) return "fairway";
    if (d < fw + 20) return "rough";
    return "deep";
  })();
  return { lie, d, at };
}

/** The lie (cached on the same 25 cm lattice, nearest cell). */
const lies = new WeakMap<Hole, Map<number, Lie>>();
export function lieAt(h: Hole, x: number, z: number): Lie {
  let m = lies.get(h);
  if (!m) lies.set(h, (m = new Map()));
  const i = Math.round(x / CELL);
  const j = Math.round(z / CELL);
  const k = key(i, j);
  let v = m.get(k);
  if (v === undefined) {
    v = lieInfo(h, i * CELL, j * CELL).lie;
    m.set(k, v);
  }
  return v;
}

// ------------------------------------------------------------- generation

const NAMES: Record<Style, string[]> = {
  links: ["The Gully", "Marram", "Lighthouse", "Sandpiper", "Spindrift", "Pot Luck", "Shorebird", "The Long Walk", "Home"],
  parkland: ["Ironbark", "The Lake", "Kookaburra", "Ridgeline", "Old Gum", "Long Paddock", "Wattle", "Boundary", "Homeward"],
};

export function buildHole(c: Course, i: number): Hole {
  const par = c.pars[i];
  const seed = c.seed * 31 + i * 977;
  const r = rng(seed);
  const links = c.style === "links";
  const L = par === 3 ? 135 + r() * 60 : par === 4 ? 305 + r() * 95 : 445 + r() * 70;
  const fairwayW = links ? 38 + r() * 10 : 30 + r() * 8;
  // The line of play: straight, or a dogleg at 55–65%.
  const dog = par !== 3 && r() < 0.65 ? (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.3) : 0;
  const bendAt = L * (0.55 + r() * 0.1);
  const pts: V2[] = [];
  const N = 40;
  for (let k = 0; k <= N; k++) {
    const s = (k / N) * L;
    if (s <= bendAt) pts.push({ x: 0, z: s });
    else {
      // Ease into the bend so the line is smooth.
      const u = s - bendAt;
      const a = dog * Math.min(1, u / 60);
      const prev = pts[pts.length - 1];
      const step = L / N;
      pts.push({ x: prev.x + Math.sin(a) * step, z: prev.z + Math.cos(a) * step });
    }
  }
  const along = [0];
  for (let k = 1; k < pts.length; k++) along.push(along[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
  const end = pts[pts.length - 1];
  const prev = pts[pts.length - 3];
  const heading = Math.atan2(end.x - prev.x, end.z - prev.z);
  const green: Ellipse = { x: end.x, z: end.z, rx: 11 + r() * 4, rz: 13 + r() * 6, rot: -heading };
  const pa = r() * Math.PI * 2;
  const pr = 0.25 + r() * 0.35;
  const c0 = Math.cos(-green.rot);
  const s0 = Math.sin(-green.rot);
  const lx = Math.cos(pa) * green.rx * pr;
  const lz = Math.sin(pa) * green.rz * pr;
  const pin = { x: green.x + lx * c0 + lz * s0, z: green.z - lx * s0 + lz * c0 };
  const slopeMag = 0.005 + r() * 0.015;
  const sa = r() * Math.PI * 2;
  const sea = links && r() < 0.45 ? (r() < 0.5 ? -1 : 1) : 0;

  const pad = fairwayW * 0.5 + 75;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x - pad);
    x1 = Math.max(x1, p.x + pad);
    z1 = Math.max(z1, p.z + 45);
  }
  const h: Hole = {
    n: i + 1,
    par,
    style: c.style,
    seed,
    tee: { x: 0, z: 0 },
    path: pts,
    along,
    green,
    pin,
    fairwayW,
    bunkers: [],
    ponds: [],
    trees: [],
    slope: { x: Math.cos(sa) * slopeMag, z: Math.sin(sa) * slopeMag },
    greenY: 0,
    teeY: 0,
    hills: links ? 2.2 : 4,
    length: along[along.length - 1],
    bounds: { x0, x1, z0: -30, z1 },
    sea,
  };
  const raw = (x: number, z: number) => baseHeight(h, x, z, pathInfo(h, x, z).d);
  h.teeY = raw(0, 0) + 0.5;
  h.greenY = raw(green.x, green.z) + 0.3;

  // Bunkers: a couple guarding the landing zone (par 4/5), two or three by the green.
  const side = (s: number, at: number, off: number): V2 => {
    const p = pointAlong(h, at);
    const q = pointAlong(h, at + 2);
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: p.x + (dz / l) * off * s, z: p.z - (dx / l) * off * s };
  };
  if (par !== 3) {
    const n = 1 + Math.floor(r() * 2.5);
    for (let k = 0; k < n; k++) {
      const at = 210 + r() * 45 + k * 25;
      if (at > h.length - 60) break;
      const p = side(r() < 0.5 ? -1 : 1, at, fairwayW * (0.35 + r() * 0.2));
      h.bunkers.push({ ...p, rx: links ? 3 + r() * 2 : 5 + r() * 4, rz: links ? 3 + r() * 2 : 8 + r() * 6, rot: -heading + (r() - 0.5) * 0.6, depth: links ? 1.3 : 0.7 });
    }
  }
  const nG = 2 + Math.floor(r() * 2);
  for (let k = 0; k < nG; k++) {
    const a = -heading + Math.PI / 2 + (k - (nG - 1) / 2) * (1.2 + r() * 0.4) + (r() - 0.5) * 0.4 + (r() < 0.5 ? 0 : Math.PI);
    const dist = Math.max(green.rx, green.rz) + 4 + r() * 3;
    const bx = green.x + Math.cos(a) * dist;
    const bz = green.z + Math.sin(a) * dist;
    // Not straight in front of the green on a par 5, so it can be run on.
    h.bunkers.push({ x: bx, z: bz, rx: links ? 2.6 + r() * 1.5 : 4 + r() * 3, rz: links ? 2.6 + r() * 1.5 : 7 + r() * 4, rot: a, depth: links ? 1.4 : 0.8 });
  }
  // Ponds (parkland): in front of a par 3's green, or beside the landing zone.
  if (!links && (par === 3 ? r() < 0.7 : r() < 0.45)) {
    const p = par === 3 ? pointAlong(h, h.length - Math.max(green.rz, green.rx) - 16) : side(r() < 0.5 ? -1 : 1, Math.min(h.length - 90, 190 + r() * 60), fairwayW * 0.5 + 18);
    const pond: Pond = { ...p, rx: par === 3 ? 26 : 16 + r() * 8, rz: par === 3 ? 12 : 24 + r() * 10, rot: -heading, level: 0 };
    pond.level = raw(p.x, p.z) - 0.6;
    h.ponds.push(pond);
  }
  // Trees: lining the corridor beyond the rough, thinner on a links.
  const want = links ? 26 : 150;
  let tries = 0;
  while (h.trees.length < want && tries++ < want * 12) {
    const x = x0 + r() * (x1 - x0);
    const z = -25 + r() * (z1 + 25);
    const { d, at } = pathInfo(h, x, z);
    if (d < fairwayW * 0.5 + (links ? 30 : 16) || d > fairwayW * 0.5 + 110) continue;
    if (Math.hypot(x, z) < 20 || ellipseK(green, x, z) < 2.4 || at > h.length + 30) continue;
    if (h.ponds.some((p) => ellipseK(p, x, z) < 1.3)) continue;
    if (sea && x * sea > fairwayW * 0.5 + 40) continue;
    const big = r();
    const th = links ? 3.5 + r() * 2.5 : 10 + big * 10;
    h.trees.push({ x, z, h: th, r: th * 0.36, kind: links ? 2 : Math.floor(r() * 2) });
  }
  return h;
}

export const holeName = (c: Course, i: number) => NAMES[c.style][i % 9];

/** Every hole of a course (cached). */
const cache = new Map<string, Hole[]>();
export function holesOf(c: Course) {
  let hs = cache.get(c.id);
  if (!hs) {
    hs = c.pars.map((_, i) => buildHole(c, i));
    cache.set(c.id, hs);
  }
  return hs;
}
