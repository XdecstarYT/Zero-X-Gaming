/**
 * The country: either generated from a seed and a few knobs (the shape of the land, how many
 * regions and counties, mountains, lakes, cities), or one of twelve real countries built from
 * their real outlines, cities and elevation (geo/*.json, see scripts/yourgov/build-geo.mjs).
 *
 * Either way it ends up as the same thing: a label raster (one section id per pixel, -1 for
 * water) of a few hundred to a thousand-odd sections (the counties or districts votes are
 * counted in) grouped into states, provinces or regions, plus what the 3D terrain needs to
 * raise the ground.
 */
import { createRng as rng } from "../engine/rng";
import { SYL_A, SYL_B, type Pos } from "./data";

export const MAP_W = 480;
export const MAP_H = 320;

export type Shape = "continent" | "island" | "peninsula" | "twin" | "archipelago";
export const SHAPES: { id: Shape; name: string }[] = [
  { id: "continent", name: "Continent" },
  { id: "island", name: "Island" },
  { id: "peninsula", name: "Peninsula" },
  { id: "twin", name: "Twin islands" },
  { id: "archipelago", name: "Archipelago" },
];

/** A generated country. */
export interface GenMap {
  kind: "gen";
  seed: number;
  name: string;
  shape: Shape;
  /** States or regions, 3–30. */
  regions: number;
  /** Counties, 300–1400. */
  counties: number;
  /** 0 flat – 1 alpine. */
  mountains: number;
  /** 0 none – 1 a land of lakes. */
  lakes: number;
  /** Big cities, 6–40. */
  cities: number;
  /** Names for the regions (generated where missing). */
  names?: string[];
}

/** A real country (its outlines and elevation are loaded from geo/<code>.json). */
export interface RealMap {
  kind: "real";
  code: string;
  counties: number;
  /** Population of each region, millions, by region key. */
  pops: Record<string, number>;
  /** At least this many counties in a region (so every district has one). */
  min?: Record<string, number>;
}

export type MapSpec = GenMap | RealMap;

export interface Section {
  id: number;
  state: number;
  cx: number;
  cy: number;
  area: number;
  pop: number;
  /** 0 rural – 1 big city. */
  urban: number;
  lean: Pos;
  /** The Voronoi seed the county grew from (map pixels). */
  sx: number;
  sy: number;
  /** Name of its town (the biggest sections are cities). */
  town: string;
  city: boolean;
}

export interface StateDef {
  id: number;
  /** Stable key: the real region's id, or r0, r1… on a generated map. */
  key: string;
  name: string;
  cx: number;
  cy: number;
  sections: number[];
  pop: number;
  capital: number;
}

/** Where the ground comes from: the generator's knobs, or real elevation. */
export interface GenGround {
  kind: "gen";
  seed: number;
  shape: Shape;
  mountains: number;
  lakes: number;
  blobs: number[];
}
export interface RealGround {
  kind: "real";
  /** Signed distance to the coast per map pixel (+ inland), in pixels. */
  sdf: Float32Array;
  /** Elevation in metres on a coarse grid (dw × dh over the map). */
  dem: Float32Array;
  dw: number;
  dh: number;
}
export type Ground = GenGround | RealGround;

export interface Country {
  key: string;
  seed: number;
  name: string;
  real: boolean;
  labels: Int16Array;
  /** 1 where a pixel borders a different state (or the sea). */
  stateEdge: Uint8Array;
  sections: Section[];
  states: StateDef[];
  pop: number;
  capital: number;
  /** Neighbouring countries' land, 1 per map pixel (real maps). */
  foreign: Uint8Array | null;
  /** Inset boxes [x, y, w, h] (Alaska, Hawaii, the Canaries…). */
  insets: number[][];
  ground: Ground;
}

// ------------------------------------------------------------------ noise

function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, seed: number, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise(x * f, y * f, seed + i * 17);
    a *= 0.5;
    f *= 2.03;
  }
  return s / (1 - Math.pow(0.5, oct));
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function genName(r: ReturnType<typeof rng>, used: Set<string>) {
  for (let k = 0; k < 40; k++) {
    const n = r.pick(SYL_A) + r.pick(SYL_B);
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  return `${r.pick(SYL_A)}${r.pick(SYL_B)} ${used.size}`;
}

// ------------------------------------------------------------------ generated land

/** The islands of an archipelago or the pair of twin islands: centre x, y and radii, normalised. */
function blobsFor(seed: number, shape: Shape): number[] {
  if (shape === "twin") return [0.29, 0.44, 0.25, 0.37, 0.73, 0.56, 0.22, 0.34];
  if (shape !== "archipelago") return [];
  const r = rng(seed * 13 + 5);
  const out: number[] = [];
  // A big island and a scatter of smaller ones round it.
  out.push(0.42 + r.next() * 0.16, 0.42 + r.next() * 0.16, 0.2, 0.27);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + r.next() * 0.6;
    const d = 0.3 + r.next() * 0.1;
    out.push(0.5 + Math.cos(a) * d * 0.95, 0.5 + Math.sin(a) * d * 1.05, 0.07 + r.next() * 0.06, 0.1 + r.next() * 0.08);
  }
  return out;
}

export function genGround(m: GenMap): GenGround {
  return { kind: "gen", seed: m.seed, shape: m.shape, mountains: m.mountains, lakes: m.lakes, blobs: blobsFor(m.seed, m.shape) };
}

/**
 * How far inland a point is: positive on land, negative at sea, continuous (the 3D terrain
 * uses it for its coastline). `lake` is 0–1 where an inland lake cuts in.
 */
export function landField(g: GenGround, x: number, y: number) {
  const u = x / MAP_W;
  const v = y / MAP_H;
  let d: number;
  if (g.shape === "island") d = Math.hypot((u - 0.5) / 0.37, (v - 0.5) / 0.36);
  else if (g.shape === "peninsula") {
    // A spine of land running down from the top of the map, narrowing to a tip.
    const cx = 0.5 + 0.11 * Math.sin(v * 3.2 + (g.seed % 7));
    const w = 0.3 - 0.16 * v;
    d = Math.hypot((u - cx) / w, Math.max(0, v - 0.52) / 0.42);
  } else if (g.blobs.length) {
    d = Infinity;
    for (let i = 0; i < g.blobs.length; i += 4) d = Math.min(d, Math.hypot((u - g.blobs[i]) / g.blobs[i + 2], (v - g.blobs[i + 1]) / g.blobs[i + 3]));
  } else d = Math.hypot((u - 0.47) / 0.48, ((v - 0.5) / 0.44) * 1.1);
  const n = fbm(x / 70, y / 70, g.seed) * 0.75 + fbm(x / 22, y / 22, g.seed + 7) * 0.25;
  const ln = fbm(x / 30, y / 30, g.seed + 99);
  const thr = 0.84 - g.lakes * 0.12;
  const lake = d < 0.6 && g.lakes > 0 ? clamp((ln - thr + 0.02) / 0.04, 0, 1) : 0;
  return { coast: 0.82 - (d + (0.5 - n) * 0.75), lake, lakeIn: g.lakes > 0 && ln > thr && d < 0.6 };
}

/** Build a generated country. Deterministic. */
export function makeCountry(seed: number, nSections = 950, nStates = 16): Country {
  return buildGen({ kind: "gen", seed, name: "Avalon", shape: "continent", regions: nStates, counties: nSections, mountains: 0.5, lakes: 0.5, cities: 24 });
}

function buildGen(m: GenMap): Country {
  const seed = m.seed;
  const r = rng(seed);
  const W = MAP_W;
  const H = MAP_H;
  const ground = genGround(m);
  const nSections = clamp(Math.round(m.counties), 200, 1600);
  const nStates = clamp(Math.round(m.regions), 2, 40);
  // Land: the shape, its coast roughened by noise.
  const land = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const f = landField(ground, x, y);
      land[y * W + x] = f.coast > 0 && !f.lakeIn ? 1 : 0;
    }
  // Keep the big landmasses (islands and slivers would be odd sections).
  const comp = new Int32Array(W * H).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!land[i] || comp[i] >= 0) continue;
    const id = sizes.length;
    const stack = [i];
    comp[i] = id;
    let size = 0;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const px = p % W;
      const py = (p / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const qx = px + dx;
        const qy = py + dy;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        const q = qy * W + qx;
        if (land[q] && comp[q] < 0) {
          comp[q] = id;
          stack.push(q);
        }
      }
    }
    sizes.push(size);
  }
  const biggest = Math.max(...sizes);
  const many = m.shape === "twin" || m.shape === "archipelago";
  const keep = sizes.map((sz) => (many ? sz >= Math.max(300, biggest * 0.06) : sz === biggest));
  let landSize = 0;
  for (let i = 0; i < W * H; i++) {
    if (land[i] && !keep[comp[i]]) land[i] = 0;
    landSize += land[i];
  }

  // Section seeds: rejection-sampled on land, denser where people live.
  const density = (x: number, y: number) => 0.35 + fbm(x / 60, y / 60, seed + 3) * 0.9;
  const seeds: { x: number; y: number }[] = [];
  const minD = Math.sqrt((landSize / nSections) * 0.5);
  for (let tries = 0; seeds.length < nSections && tries < nSections * 60; tries++) {
    const x = r.next() * W;
    const y = r.next() * H;
    if (!land[(y | 0) * W + (x | 0)]) continue;
    const md = minD / Math.sqrt(density(x, y));
    if (seeds.some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < md * md)) continue;
    seeds.push({ x, y });
  }
  const labels = voronoi(land, seeds);
  const n = seeds.length;
  const { area, cxs, cys } = sectionStats(labels, n);
  // Big cities: population bumps.
  const nCities = clamp(Math.round(m.cities), 4, 40);
  const centres = Array.from({ length: Math.max(4, Math.round(nCities * 0.6)) }, () => seeds[Math.floor(r.next() * n)]);
  const sections: Section[] = seeds.map((s, i) => {
    const cx = area[i] ? cxs[i] : s.x;
    const cy = area[i] ? cys[i] : s.y;
    let urban = 0;
    centres.forEach((c, k) => (urban = Math.max(urban, Math.exp(-((c.x - cx) ** 2 + (c.y - cy) ** 2) / (k < 4 ? 260 : 120)))));
    urban = clamp(urban + (fbm(cx / 40, cy / 40, seed + 11) - 0.5) * 0.3 + 0.1, 0, 1);
    const pop = Math.round((60_000 + 2_700_000 * urban ** 2.2 + 180_000 * density(cx, cy)) * (0.7 + r.next() * 0.6));
    // Leanings: cities lean left and liberal, the countryside right and conservative, with regional colour.
    const reg = { e: (fbm(cx / 90, cy / 90, seed + 21) - 0.5) * 2.2, s: (fbm(cx / 90, cy / 90, seed + 31) - 0.5) * 2.2 };
    const lean = { e: clamp(reg.e + (0.25 - urban) * 0.9 + (r.next() - 0.5) * 0.25, -1, 1), s: clamp(reg.s + (0.3 - urban) * 1.1 + (r.next() - 0.5) * 0.25, -1, 1) };
    return { id: i, state: -1, cx, cy, sx: s.x, sy: s.y, area: area[i], pop, urban, lean, town: "", city: false };
  });
  // States: grow from seeds over the section adjacency so every state is in one piece.
  const adj = adjacency(labels, n);
  const stateSeeds: number[] = [];
  const spread = Math.sqrt(landSize / nStates) * 0.75;
  for (let k = 0; k < nStates * 60 && stateSeeds.length < nStates; k++) {
    const c = Math.floor(r.next() * n);
    const need = k < nStates * 30 ? spread : spread * 0.5;
    if (stateSeeds.every((o) => Math.hypot(sections[o].cx - sections[c].cx, sections[o].cy - sections[c].cy) > need)) stateSeeds.push(c);
  }
  const frontier = stateSeeds.map((c, k) => {
    sections[c].state = k;
    return [c];
  });
  const size = stateSeeds.map(() => 1);
  for (let guard = 0; guard < n * 4; guard++) {
    // The smallest state with room to grow takes its nearest free neighbour.
    let k = -1;
    for (let j = 0; j < frontier.length; j++) if (frontier[j].length && (k < 0 || size[j] < size[k])) k = j;
    if (k < 0) break;
    let took = false;
    while (frontier[k].length && !took) {
      const f = frontier[k][0];
      const free = [...adj[f]].filter((b) => sections[b].state < 0);
      if (!free.length) {
        frontier[k].shift();
        continue;
      }
      const seedS = sections[stateSeeds[k]];
      free.sort((a, b) => Math.hypot(sections[a].cx - seedS.cx, sections[a].cy - seedS.cy) - Math.hypot(sections[b].cx - seedS.cx, sections[b].cy - seedS.cy));
      sections[free[0]].state = k;
      frontier[k].push(free[0]);
      size[k]++;
      took = true;
    }
  }
  // Islands no state reached join the nearest state.
  for (let pass = 0; pass < 4 && sections.some((s) => s.state < 0); pass++)
    for (const s of sections) {
      if (s.state >= 0) continue;
      let best = -1;
      let bd = Infinity;
      for (const o of sections) {
        if (o.state < 0) continue;
        const d = (o.cx - s.cx) ** 2 + (o.cy - s.cy) ** 2;
        if (d < bd) {
          bd = d;
          best = o.state;
        }
      }
      s.state = Math.max(0, best);
    }
  const used = new Set<string>();
  const names = (m.names ?? []).map((x) => cleanName(x, 24));
  const states: StateDef[] = stateSeeds.map((c, k) => {
    const nm = names[k] && !used.has(names[k]) ? names[k] : genName(r, used);
    used.add(nm);
    return { id: k, key: `r${k}`, name: nm, cx: 0, cy: 0, sections: [], pop: 0, capital: c };
  });
  finishStates(states, sections);
  // Towns: the biggest sections are cities.
  const byPop = [...sections].sort((a, b) => b.pop - a.pop);
  byPop.forEach((s, i) => {
    s.town = genName(r, used);
    s.city = i < nCities;
  });
  const pop = sections.reduce((a, s) => a + s.pop, 0);
  return {
    key: mapKey(m),
    seed,
    name: cleanName(m.name, 32) || "Avalon",
    real: false,
    labels,
    stateEdge: stateEdges(labels, sections),
    sections,
    states,
    pop,
    capital: byPop[0].id,
    foreign: null,
    insets: [],
    ground,
  };
}

/** Clean a name typed by a player (no control characters or markup). */
export function cleanName(t: unknown, max: number) {
  return [...String(t ?? "")]
    .filter((ch) => ch >= " " && ch !== "\u007f" && ch !== "<" && ch !== ">")
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// ------------------------------------------------------------------ shared steps

/** Nearest seed per land pixel (a bucket grid keeps it fast). */
function voronoi(land: Uint8Array, seeds: { x: number; y: number }[]) {
  const W = MAP_W;
  const H = MAP_H;
  const G = 16;
  const gw = Math.ceil(W / G);
  const gh = Math.ceil(H / G);
  const grid: number[][] = Array.from({ length: gw * gh }, () => []);
  seeds.forEach((s, i) => grid[Math.min(gh - 1, (s.y / G) | 0) * gw + Math.min(gw - 1, (s.x / G) | 0)].push(i));
  const labels = new Int16Array(W * H).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!land[i]) continue;
      const gx = (x / G) | 0;
      const gy = (y / G) | 0;
      let bi = -1;
      let bd = Infinity;
      for (let rad = 1; rad <= Math.max(gw, gh) && (bi < 0 || rad <= 2); rad++)
        for (let yy = Math.max(0, gy - rad); yy <= Math.min(gh - 1, gy + rad); yy++)
          for (let xx = Math.max(0, gx - rad); xx <= Math.min(gw - 1, gx + rad); xx++)
            for (const k of grid[yy * gw + xx]) {
              const d = (seeds[k].x - x) ** 2 + (seeds[k].y - y) ** 2;
              if (d < bd) {
                bd = d;
                bi = k;
              }
            }
      labels[i] = bi;
    }
  return labels;
}

function sectionStats(labels: Int16Array, n: number) {
  const area = new Float64Array(n);
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l < 0) continue;
    area[l]++;
    sx[l] += i % MAP_W;
    sy[l] += (i / MAP_W) | 0;
  }
  const cxs = new Float64Array(n);
  const cys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cxs[i] = area[i] ? sx[i] / area[i] + 0.5 : 0;
    cys[i] = area[i] ? sy[i] / area[i] + 0.5 : 0;
  }
  return { area, cxs, cys };
}

function adjacency(labels: Int16Array, n: number) {
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let y = 0; y < MAP_H - 1; y++)
    for (let x = 0; x < MAP_W - 1; x++) {
      const a = labels[y * MAP_W + x];
      if (a < 0) continue;
      for (const b of [labels[y * MAP_W + x + 1], labels[(y + 1) * MAP_W + x]])
        if (b >= 0 && b !== a) {
          adj[a].add(b);
          adj[b].add(a);
        }
    }
  return adj;
}

function finishStates(states: StateDef[], sections: Section[]) {
  for (const s of sections) {
    const st = states[s.state];
    st.sections.push(s.id);
    st.pop += s.pop;
  }
  for (const st of states) {
    let ax = 0;
    let ay = 0;
    let w = 0;
    for (const id of st.sections) {
      const s = sections[id];
      ax += s.cx * s.area;
      ay += s.cy * s.area;
      w += s.area;
    }
    st.cx = ax / Math.max(1, w);
    st.cy = ay / Math.max(1, w);
    st.capital = st.sections.length ? st.sections.reduce((a, b) => (sections[b].pop > sections[a].pop ? b : a), st.sections[0]) : 0;
  }
}

function stateEdges(labels: Int16Array, sections: Section[]) {
  const W = MAP_W;
  const H = MAP_H;
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const l = labels[y * W + x];
      if (l < 0) continue;
      const st = sections[l].state;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const q = labels[Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))];
        if (q < 0 || sections[q].state !== st) out[y * W + x] = 1;
      }
    }
  return out;
}

// ------------------------------------------------------------------ real countries

export interface GeoData {
  code: string;
  regions: { id: string; name: string; inset?: string; rings: number[][] }[];
  foreign: number[][];
  insets: number[][];
  cities: { n: string; x: number; y: number; p: number; c: number }[];
  dem: { w: number; h: number; data: string };
}

/** The real countries there's map data for, with how to load each (code-split). */
const GEO: Record<string, () => Promise<{ default: unknown }>> = {
  us: () => import("./geo/us.json"),
  gb: () => import("./geo/gb.json"),
  ca: () => import("./geo/ca.json"),
  au: () => import("./geo/au.json"),
  de: () => import("./geo/de.json"),
  fr: () => import("./geo/fr.json"),
  es: () => import("./geo/es.json"),
  it: () => import("./geo/it.json"),
  jp: () => import("./geo/jp.json"),
  in: () => import("./geo/in.json"),
  br: () => import("./geo/br.json"),
  mx: () => import("./geo/mx.json"),
};
export const REAL_CODES = Object.keys(GEO);

const geoCache = new Map<string, GeoData>();

/** Load the map data a spec needs (nothing to do for a generated map). */
export async function prepareMap(spec: MapSpec) {
  if (spec.kind !== "real" || geoCache.has(spec.code)) return;
  const load = GEO[spec.code];
  if (!load) throw new Error(`No map data for ${spec.code}`);
  geoCache.set(spec.code, (await load()).default as GeoData);
}
export const mapReady = (spec: MapSpec) => spec.kind !== "real" || geoCache.has(spec.code);
/** Hand over already-loaded map data (tests, the terrain worker). */
export function provideGeo(g: GeoData) {
  geoCache.set(g.code.toLowerCase(), g);
}
export function geoOf(code: string) {
  return geoCache.get(code);
}

export const mapKey = (m: MapSpec) => JSON.stringify(m);

const countries = new Map<string, Country>();
/** The (cached) country for a map. Real maps must be prepared first (`prepareMap`). */
export function buildCountry(m: MapSpec): Country {
  const key = mapKey(m);
  let c = countries.get(key);
  if (c) return c;
  if (m.kind === "real") {
    const geo = geoCache.get(m.code);
    if (!geo) throw new Error(`Map data for ${m.code} isn't loaded`);
    c = buildReal(m, geo);
  } else c = buildGen(m);
  // A handful of countries is plenty to keep.
  if (countries.size > 6) countries.delete(countries.keys().next().value!);
  countries.set(key, c);
  return c;
}

function decodeBase64(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Fill polygons (even-odd, rings in tenths of a pixel) at pixel centres. */
function fillRings(rings: number[][], put: (i: number) => void) {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const r of rings)
    for (let i = 1; i < r.length; i += 2) {
      y0 = Math.min(y0, r[i]);
      y1 = Math.max(y1, r[i]);
    }
  const ya = Math.max(0, Math.floor(y0 / 10 - 0.5));
  const yb = Math.min(MAP_H - 1, Math.ceil(y1 / 10));
  const xs: number[] = [];
  for (let y = ya; y <= yb; y++) {
    const yy = (y + 0.5) * 10;
    xs.length = 0;
    for (const r of rings) {
      const n = r.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ay = r[i * 2 + 1];
        const by = r[j * 2 + 1];
        if (ay > yy !== by > yy) xs.push(r[i * 2] + ((yy - ay) * (r[j * 2] - r[i * 2])) / (by - ay));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] / 10 - 0.5));
      const xb = Math.min(MAP_W - 1, Math.floor(xs[k + 1] / 10 - 0.5));
      for (let x = xa; x <= xb; x++) put(y * MAP_W + x);
    }
  }
}

/** Distance (pixels) from each pixel to the nearest pixel where `mask` differs (chamfer 3-4). */
function chamfer(mask: Uint8Array, inside: number) {
  const W = MAP_W;
  const H = MAP_H;
  const BIG = 1e6;
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = mask[i] === inside ? BIG : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? BIG : d[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4142, at(x + 1, y - 1) + 1.4142);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4142, at(x - 1, y + 1) + 1.4142);
    }
  return d;
}

function buildReal(m: RealMap, geo: GeoData): Country {
  const W = MAP_W;
  const H = MAP_H;
  const seed = [...m.code].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 100000;
  const r = rng(seed);
  const R = geo.regions.length;
  // Regions, rasterised.
  const reg = new Int16Array(W * H).fill(-1);
  geo.regions.forEach((g, k) => fillRings(g.rings, (i) => (reg[i] = k)));
  const pops = geo.regions.map((g) => Math.max(0.01, m.pops[g.id] ?? 0.5));
  const need = geo.regions.map((g) => Math.max(1, m.min?.[g.id] ?? 1));
  // Tiny regions (Washington DC, Delhi, Berlin at some scales) get a disc big enough for their districts.
  const count = new Int32Array(R);
  for (let i = 0; i < W * H; i++) if (reg[i] >= 0) count[reg[i]]++;
  geo.regions.forEach((g, k) => {
    if (count[k] >= need[k] * 2.5 + 2) return;
    const ring = g.rings.reduce((a, b) => (b.length > a.length ? b : a), g.rings[0] ?? []);
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length; i += 2) {
      cx += ring[i] / 10;
      cy += ring[i + 1] / 10;
    }
    cx /= Math.max(1, ring.length / 2);
    cy /= Math.max(1, ring.length / 2);
    const rad = Math.sqrt((need[k] * 2.5 + 2) / Math.PI) + 0.4;
    for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
      for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++)
        if (x >= 0 && y >= 0 && x < W && y < H && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad) reg[y * W + x] = k;
  });
  count.fill(0);
  for (let i = 0; i < W * H; i++) if (reg[i] >= 0) count[reg[i]]++;

  // Neighbouring land (not inside the inset boxes).
  const foreign = new Uint8Array(W * H);
  for (const ring of geo.foreign) fillRings([ring], (i) => (foreign[i] = 1));
  for (const [bx, by, bw, bh] of geo.insets)
    for (let y = Math.max(0, Math.floor(by)); y < Math.min(H, Math.ceil(by + bh)); y++)
      for (let x = Math.max(0, Math.floor(bx)); x < Math.min(W, Math.ceil(bx + bw)); x++) foreign[y * W + x] = 0;
  for (let i = 0; i < W * H; i++) if (reg[i] >= 0) foreign[i] = 0;

  // Where people live: round the real cities.
  const cities = geo.cities;
  const dens = (x: number, y: number) => {
    let v = 0.4;
    for (const c of cities) {
      const sig = 2.5 + Math.sqrt(c.p) * 1.8;
      const d2 = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d2 < sig * sig * 9) v += Math.sqrt(c.p) * 1.5 * Math.exp(-d2 / (2 * sig * sig));
    }
    return v;
  };
  const urbanAt = (x: number, y: number) => {
    let u = 0;
    for (const c of cities) {
      const sig = 1 + Math.sqrt(c.p) * 1.6;
      const d2 = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d2 < sig * sig * 9) u = Math.max(u, Math.min(1, 0.32 + 0.36 * Math.sqrt(c.p)) * Math.exp(-d2 / (2 * sig * sig)));
    }
    return u;
  };

  // Counties per region: by area and population, at least what its districts need.
  const A = count.reduce((a, b) => a + b, 0);
  const P = pops.reduce((a, b) => a + b, 0);
  const N = clamp(Math.round(m.counties), 200, 1600);
  const alloc = geo.regions.map((_, k) => {
    const want = Math.round(N * (0.35 * (count[k] / A) + 0.65 * (pops[k] / P)));
    return clamp(Math.max(want, Math.ceil(need[k] * 1.05)), 1, Math.max(1, Math.floor(count[k] / 1.6)));
  });
  const pixels: number[][] = geo.regions.map(() => []);
  for (let i = 0; i < W * H; i++) if (reg[i] >= 0) pixels[reg[i]].push(i);
  const seeds: { x: number; y: number; r: number }[] = [];
  const labels = new Int16Array(W * H).fill(-1);
  for (let k = 0; k < R; k++) {
    const px = pixels[k];
    if (!px.length) continue;
    const mine: { x: number; y: number }[] = [];
    const md = Math.sqrt((px.length / alloc[k]) * 0.5);
    for (let tries = 0; mine.length < alloc[k] && tries < alloc[k] * 50; tries++) {
      const i = px[Math.floor(r.next() * px.length)];
      const x = (i % W) + 0.2 + r.next() * 0.6;
      const y = ((i / W) | 0) + 0.2 + r.next() * 0.6;
      const d = md / Math.sqrt(dens(x, y));
      if (tries < alloc[k] * 40 && mine.some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < d * d)) continue;
      if (mine.some((s) => Math.abs(s.x - x) < 0.5 && Math.abs(s.y - y) < 0.5)) continue;
      mine.push({ x, y });
    }
    // Each pixel of the region joins its nearest seed in the region.
    const base = seeds.length;
    for (const s of mine) seeds.push({ ...s, r: k });
    for (const i of px) {
      const x = (i % W) + 0.5;
      const y = ((i / W) | 0) + 0.5;
      let best = 0;
      let bd = Infinity;
      for (let j = 0; j < mine.length; j++) {
        const d = (mine[j].x - x) ** 2 + (mine[j].y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      labels[i] = base + best;
    }
  }
  const n = seeds.length;
  const { area, cxs, cys } = sectionStats(labels, n);
  const sections: Section[] = seeds.map((s, i) => {
    const cx = area[i] ? cxs[i] : s.x;
    const cy = area[i] ? cys[i] : s.y;
    const urban = clamp(urbanAt(cx, cy) + (fbm(cx / 30, cy / 30, seed + 11) - 0.5) * 0.18 + 0.06, 0, 1);
    const reg2 = { e: (fbm(cx / 90, cy / 90, seed + 21) - 0.5) * 1.0, s: (fbm(cx / 90, cy / 90, seed + 31) - 0.5) * 1.0 };
    const lean = { e: clamp(reg2.e + (0.25 - urban) * 0.9 + (r.next() - 0.5) * 0.25, -1, 1), s: clamp(reg2.s + (0.3 - urban) * 1.1 + (r.next() - 0.5) * 0.25, -1, 1) };
    return { id: i, state: s.r, cx, cy, sx: s.x, sy: s.y, area: area[i], pop: 0, urban, lean, town: "", city: false };
  });
  // People: each region's real population, spread over its counties by how built-up they are.
  for (let k = 0; k < R; k++) {
    const mine = sections.filter((s) => s.state === k);
    const w = mine.map((s) => Math.max(0.2, s.area) * (0.12 + 6 * s.urban ** 1.6));
    const tot = w.reduce((a, b) => a + b, 0) || 1;
    mine.forEach((s, j) => (s.pop = Math.max(500, Math.round((pops[k] * 1e6 * w[j]) / tot))));
  }
  const states: StateDef[] = geo.regions.map((g, k) => ({ id: k, key: g.id, name: g.name, cx: 0, cy: 0, sections: [], pop: 0, capital: 0 }));
  finishStates(states, sections);
  // Towns: the real cities name the counties they stand in; the rest are numbered by region.
  let capital = -1;
  for (const c of cities) {
    let id = labels[clamp(Math.round(c.y - 0.5), 0, H - 1) * W + clamp(Math.round(c.x - 0.5), 0, W - 1)];
    if (id < 0) {
      let bd = 16;
      for (const s of sections) {
        const d = (s.cx - c.x) ** 2 + (s.cy - c.y) ** 2;
        if (d < bd) {
          bd = d;
          id = s.id;
        }
      }
    }
    if (id < 0 || sections[id].city) continue;
    sections[id].town = c.n;
    sections[id].city = true;
    if (c.c && capital < 0) capital = id;
  }
  for (const st of states) {
    let k = 0;
    for (const id of st.sections) if (!sections[id].town) sections[id].town = `${st.name} ${++k}`;
    const capCity = st.sections.find((id) => sections[id].city);
    if (capCity !== undefined) st.capital = st.sections.filter((id) => sections[id].city).reduce((a, b) => (sections[b].pop > sections[a].pop ? b : a), capCity);
  }
  const pop = sections.reduce((a, s) => a + s.pop, 0);
  if (capital < 0) capital = [...sections].sort((a, b) => b.pop - a.pop)[0].id;

  // The ground: the real elevation, and how far each pixel is from the coast.
  const raw = decodeBase64(geo.dem.data);
  const dem = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    dem[i] = v >= 128 ? ((v - 128) / 127) ** 2 * 6000 : -(((128 - v) / 128) ** 2) * 3000;
  }
  const landMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) landMask[i] = reg[i] >= 0 || foreign[i] ? 1 : 0;
  const dIn = chamfer(landMask, 1);
  const dOut = chamfer(landMask, 0);
  const sdf = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) sdf[i] = landMask[i] ? dIn[i] - 0.5 : -(dOut[i] - 0.5);

  return {
    key: mapKey(m),
    seed,
    name: "",
    real: true,
    labels,
    stateEdge: stateEdges(labels, sections),
    sections,
    states,
    pop,
    capital,
    foreign,
    insets: geo.insets,
    ground: { kind: "real", sdf, dem, dw: geo.dem.w, dh: geo.dem.h },
  };
}
