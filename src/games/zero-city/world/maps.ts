import { CELL, CELLS, WATER_LEVEL, WORLD } from "../config";
import { fbm, noise2, rng } from "../core/rng";
import type { StringKey } from "../i18n";
import { Terrain } from "./terrain";

export type Level = 0 | 1 | 2;
export type Edge = "W" | "E" | "N" | "S";

export interface MapDef {
  id: string;
  seed: number;
  tag: StringKey;
  relief: StringKey;
  /** Water, Wood, Farmland, Oil. */
  res: [Level, Level, Level, Level];
  /** Where the highway comes in: map edge and position along it (0–1). */
  gate: { edge: Edge; pos: number };
  shape: (u: number, v: number, n: Noise) => number;
  /** Part of a DLC (locked until it's owned). */
  dlc?: "riviera";
  /** Building palette: whitewashed walls and terracotta roofs. */
  look?: "riviera";
}

interface Noise {
  a: (x: number, y: number) => number;
  b: (x: number, y: number) => number;
  c: (x: number, y: number) => number;
  r: ReturnType<typeof rng>;
  extra: number[];
}

const ss = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const gauss = (u: number, v: number, cu: number, cv: number, r: number) => Math.exp(-((u - cu) ** 2 + (v - cv) ** 2) / (r * r));

/** The ten maps. Map 1 is the starter. Names and descriptions live in the i18n tables (map.<id>, desc.<id>). */
export const MAPS: MapDef[] = [
  {
    id: "broad-plains",
    seed: 1101,
    tag: "tag.landlocked",
    relief: "relief.flat",
    res: [0, 0, 2, 0],
    gate: { edge: "W", pos: 0.5 },
    shape: (u, v, n) => {
      const h = 4.5 + 2.5 * fbm(n.a, u * 4, v * 4, 4) + 1.2 * fbm(n.b, u * 14, v * 14, 3);
      return Math.max(0.8, h) - 7 * gauss(u, v, 0.72, 0.28, 0.035) - 5 * gauss(u, v, 0.3, 0.78, 0.025);
    },
  },
  {
    id: "hollow-valley",
    seed: 2202,
    tag: "tag.valley",
    relief: "relief.rolling",
    res: [1, 1, 2, 0],
    gate: { edge: "W", pos: 0.5 },
    shape: (u, v, n) => {
      const d = Math.abs(v - 0.5 - 0.07 * Math.sin(u * 6.5));
      let h = 3 + d * d * 160 + 7 * fbm(n.a, u * 5, v * 5, 4) * (0.4 + d * 2);
      h -= 15 * gauss(u, v, 0.32, 0.5 + 0.07 * Math.sin(0.32 * 6.5), 0.065);
      h -= 13 * gauss(u, v, 0.66, 0.5 + 0.07 * Math.sin(0.66 * 6.5), 0.055);
      h -= 12 * gauss(u, v, 0.85, 0.36, 0.045);
      return h;
    },
  },
  {
    id: "crossriver",
    seed: 3303,
    tag: "tag.river",
    relief: "relief.gentle",
    res: [2, 1, 1, 0],
    gate: { edge: "W", pos: 0.2 },
    shape: (u, v, n) => {
      const vr = 0.5 + 0.12 * Math.sin(u * 5 + 1) + 0.04 * Math.sin(u * 13 + 2);
      const w = 0.024 + 0.006 * Math.sin(u * 9);
      const d = Math.abs(v - vr);
      const base = 6 + 5 * fbm(n.a, u * 5, v * 5, 4);
      const bed = -5 - 2 * (1 - Math.min(1, d / w));
      return d < w ? bed : bed + (base - bed) * ss(w, w * 2.6, d);
    },
  },
  {
    id: "mirror-lakes",
    seed: 4404,
    tag: "tag.twinlakes",
    relief: "relief.gentle",
    res: [2, 2, 1, 0],
    gate: { edge: "S", pos: 0.5 },
    shape: (u, v, n) => {
      const base = 6 + 6 * fbm(n.a, u * 5, v * 5, 4);
      const lake = (cu: number, cv: number, ru: number, rv: number, rot: number) => {
        const du = u - cu;
        const dv = v - cv;
        const x = du * Math.cos(rot) + dv * Math.sin(rot);
        const y = -du * Math.sin(rot) + dv * Math.cos(rot);
        const r = Math.sqrt((x / ru) ** 2 + (y / rv) ** 2) + 0.12 * fbm(n.b, u * 9, v * 9, 3);
        return r;
      };
      const r = Math.min(lake(0.31, 0.42, 0.14, 0.08, 0.5), lake(0.69, 0.6, 0.12, 0.09, -0.4));
      return r < 1 ? -6 * (1 - r) - 1 : -1 + (base + 1) * ss(1, 1.35, r);
    },
  },
  {
    id: "cedar-shore",
    seed: 5505,
    tag: "tag.coast",
    relief: "relief.rolling",
    res: [2, 2, 0, 1],
    gate: { edge: "W", pos: 0.5 },
    shape: (u, v, n) => {
      const coast = 0.7 + 0.05 * Math.sin(v * 7) + 0.05 * fbm(n.b, v * 4, 0.5, 3);
      const base = 5 + 12 * Math.max(0, fbm(n.a, u * 4, v * 4, 4) + 0.3);
      const s = ss(-0.04, 0.06, u - coast);
      return base * (1 - s) - 16 * s;
    },
  },
  {
    id: "crescent-isle",
    seed: 6606,
    tag: "tag.island",
    relief: "relief.hilly",
    res: [2, 1, 0, 0],
    gate: { edge: "W", pos: 0.5 },
    shape: (u, v, n) => {
      const du = u - 0.52;
      const dv = v - 0.5;
      const wob = 0.04 * fbm(n.b, u * 6, v * 6, 3);
      const r = Math.hypot(du, dv) + wob;
      const ang = Math.atan2(dv, du);
      let m = ss(0.45, 0.36, r) * ss(0.12, 0.19, r);
      m *= ss(0.3, 0.75, Math.abs(ang));
      return -14 + m * (19 + 24 * Math.max(0, fbm(n.a, u * 5, v * 5, 4) + 0.35));
    },
  },
  {
    id: "stepping-stones",
    seed: 7707,
    tag: "tag.archipelago",
    relief: "relief.gentle",
    res: [2, 0, 0, 1],
    gate: { edge: "W", pos: 0.5 },
    shape: (u, v, n) => {
      let m = 0;
      for (let i = 0; i < n.extra.length; i += 3) {
        const d = Math.hypot(u - n.extra[i], v - n.extra[i + 1]) / n.extra[i + 2] + 0.18 * fbm(n.b, u * 8, v * 8, 3);
        m = Math.max(m, 1 - d * d);
      }
      return -7 + Math.max(0, m) * 17 + 3 * fbm(n.a, u * 6, v * 6, 3) * Math.max(0, m);
    },
  },
  {
    id: "anchor-bay",
    seed: 8808,
    tag: "tag.harbour",
    relief: "relief.rolling",
    res: [2, 0, 1, 2],
    gate: { edge: "N", pos: 0.45 },
    shape: (u, v, n) => {
      const base = 6 + 9 * Math.max(0, fbm(n.a, u * 4, v * 4, 4) + 0.25);
      const sea = ss(0.74, 0.86, v + 0.03 * Math.sin(u * 8));
      const bayW = 0.05 + 0.1 * ss(0.85, 0.5, v);
      const bay = ss(bayW, bayW * 0.6, Math.abs(u - 0.5 - 0.04 * Math.sin(v * 6))) * ss(0.42, 0.55, v);
      const water = Math.max(sea, bay);
      return base * (1 - water) - 14 * water;
    },
  },
  {
    id: "longpoint",
    seed: 9909,
    tag: "tag.peninsula",
    relief: "relief.hilly",
    res: [2, 1, 0, 1],
    gate: { edge: "W", pos: 0.5 },
    shape: (u, v, n) => {
      const cv = 0.5 + 0.07 * Math.sin(u * 5);
      const halfW = 0.27 * (1 - u) ** 0.9 + 0.04;
      const along = ss(0.92, 0.82, u);
      const m = ss(halfW, halfW * 0.7, Math.abs(v - cv) + 0.03 * fbm(n.b, u * 7, v * 7, 3)) * along;
      const land = Math.max(m, ss(0.2, 0.12, u));
      return -14 + land * (18 + 26 * Math.max(0, fbm(n.a, u * 5, v * 5, 4) + 0.3));
    },
  },
  {
    id: "stonecrest",
    seed: 10010,
    tag: "tag.ridge",
    relief: "relief.steep",
    res: [1, 2, 0, 2],
    gate: { edge: "S", pos: 0.5 },
    shape: (u, v, n) => {
      let ridge = 0;
      let amp = 1;
      let f = 2.2;
      for (let o = 0; o < 5; o++) {
        ridge += (1 - Math.abs(n.a(u * f, v * f))) ** 2 * amp;
        amp *= 0.5;
        f *= 2;
      }
      ridge /= 1.9;
      const valley = ss(0.06, 0.22, Math.abs(v - 0.45 - 0.08 * Math.sin(u * 7)));
      let h = 6 + 105 * ridge * ridge * (0.25 + 0.75 * valley);
      h -= 30 * gauss(u, v, 0.32, 0.45 + 0.08 * Math.sin(0.32 * 7), 0.06);
      h -= 26 * gauss(u, v, 0.7, 0.45 + 0.08 * Math.sin(0.7 * 7), 0.045);
      return h;
    },
  },
  // ---------------------------------------------------------- Riviera DLC
  {
    id: "riviera-coast",
    seed: 12121,
    tag: "tag.riviera",
    relief: "relief.rolling",
    res: [2, 1, 1, 0],
    gate: { edge: "W", pos: 0.3 },
    dlc: "riviera",
    look: "riviera",
    shape: (u, v, n) => {
      // Terraced hills stepping down to a long south-facing sea, with sandy coves.
      const shore = 0.68 + 0.05 * Math.sin(u * 9) + 0.03 * fbm(n.b, u * 5, 0.3, 3);
      const sea = ss(shore, shore + 0.07, v);
      const hills = 4 + 30 * ss(shore, 0.05, v) * (0.5 + 0.5 * Math.max(0, fbm(n.a, u * 4, v * 4, 4) + 0.4));
      const terraces = Math.round(hills / 4) * 4 * 0.35 + hills * 0.65;
      const cove = 6 * gauss(u, v, 0.32, shore + 0.02, 0.05) + 6 * gauss(u, v, 0.74, shore + 0.02, 0.05);
      return terraces * (1 - sea) - 15 * sea - cove;
    },
  },
  {
    id: "sunset-isles",
    seed: 13131,
    tag: "tag.isles",
    relief: "relief.gentle",
    res: [2, 1, 0, 0],
    gate: { edge: "W", pos: 0.5 },
    dlc: "riviera",
    look: "riviera",
    shape: (u, v, n) => {
      // Two big islands across a narrow strait, the mainland on the west.
      const isle = (cu: number, cv: number, r: number) => ss(r, r * 0.72, Math.hypot(u - cu, (v - cv) * 0.9) + 0.035 * fbm(n.b, u * 7, v * 7, 3));
      const main = ss(0.24, 0.16, u);
      const land = Math.max(main, isle(0.45, 0.42, 0.2), isle(0.78, 0.6, 0.17));
      return -12 + land * (16 + 14 * Math.max(0, fbm(n.a, u * 5, v * 5, 4) + 0.3));
    },
  },
  {
    id: "cliffside-bay",
    seed: 14141,
    tag: "tag.cliffs",
    relief: "relief.hilly",
    res: [2, 2, 0, 1],
    gate: { edge: "N", pos: 0.5 },
    dlc: "riviera",
    look: "riviera",
    shape: (u, v, n) => {
      // A horseshoe bay ringed by cliffs, open to the south.
      const r = Math.hypot(u - 0.5, (v - 0.72) * 1.15);
      const bay = ss(0.3, 0.2, r) * ss(0.45, 0.6, v);
      const sea = Math.max(bay, ss(0.88, 0.95, v));
      const cliffs = 10 + 28 * ss(0.2, 0.34, r) + 12 * Math.max(0, fbm(n.a, u * 5, v * 5, 4) + 0.3);
      return cliffs * (1 - sea) - 16 * sea;
    },
  },
];

/** The base game's maps (DLC maps aside). */
export const BASE_MAPS = MAPS.filter((m) => !m.dlc);

export const mapById = (id: string) => MAPS.find((m) => m.id === id) ?? MAPS[0];

/** Build the heightfield for a map (deterministic from its seed). */
export function generateTerrain(def: MapDef): Terrain {
  const t = new Terrain();
  const r = rng(def.seed);
  const extra: number[] = [];
  if (def.id === "stepping-stones") {
    const spots = [
      [0.17, 0.5, 0.15],
      [0.37, 0.3, 0.14],
      [0.4, 0.7, 0.15],
      [0.6, 0.48, 0.16],
      [0.79, 0.27, 0.13],
      [0.82, 0.68, 0.14],
      [0.6, 0.88, 0.1],
    ];
    for (const [a, b, c] of spots) extra.push(a + r.range(-0.02, 0.02), b + r.range(-0.02, 0.02), c);
  }
  const n: Noise = { a: noise2(def.seed), b: noise2(def.seed + 17), c: noise2(def.seed + 31), r, extra };
  for (let j = 0; j <= CELLS; j++)
    for (let i = 0; i <= CELLS; i++) t.h[j * t.n + i] = def.shape(i / CELLS, j / CELLS, n);
  t.dirty.clear();
  return t;
}

/**
 * The highway in: a straight run from the map edge inland, long enough to
 * reach dry land and clear 200 m beyond the shore. Picks the best spot near
 * the map's preferred position (least water, gentlest ground).
 */
export function gatewayPath(def: MapDef, t: Terrain): { a: { x: number; z: number }; b: { x: number; z: number } } {
  const inward = { W: [1, 0], E: [-1, 0], N: [0, 1], S: [0, -1] }[def.gate.edge];
  const start = (pos: number) => {
    const p = Math.min(0.9, Math.max(0.1, pos)) * WORLD;
    return def.gate.edge === "W" ? { x: 2, z: p } : def.gate.edge === "E" ? { x: WORLD - 2, z: p } : def.gate.edge === "N" ? { x: p, z: 2 } : { x: p, z: WORLD - 2 };
  };
  let best = { cost: Infinity, pos: def.gate.pos };
  for (let k = -12; k <= 12; k++) {
    const pos = def.gate.pos + k * 0.025;
    const a = start(pos);
    let cost = Math.abs(k) * 0.5;
    let prev = t.surfaceAt(a.x, a.z);
    for (let s = 8; s <= 320; s += 8) {
      const x = a.x + inward[0] * s;
      const z = a.z + inward[1] * s;
      const h = t.surfaceAt(x, z);
      if (t.isWater(x, z)) cost += 6;
      cost += Math.abs(h - prev) * 2;
      prev = h;
    }
    if (cost < best.cost) best = { cost, pos };
  }
  const a = start(best.pos);
  // Walk in until we've been on dry land for 200 m (or 900 m at most).
  let dry = 0;
  let s = 0;
  for (; s < 900 && dry < 200; s += CELL) {
    if (t.isWater(a.x + inward[0] * s, a.z + inward[1] * s)) dry = 0;
    else dry += CELL;
  }
  s = Math.max(s, 240);
  return { a, b: { x: a.x + inward[0] * s, z: a.z + inward[1] * s } };
}

/** Trees: forest patches whose density follows the map's wood level. Flat array of [x, z, scale, variant]. */
export function generateTrees(def: MapDef, t: Terrain): Float32Array {
  const r = rng(def.seed + 99);
  const forest = noise2(def.seed + 7);
  const target = [1400, 3800, 7000][def.res[1]];
  const out: number[] = [];
  let tries = 0;
  while (out.length / 4 < target && tries < target * 12) {
    tries++;
    const x = r.range(8, WORLD - 8);
    const z = r.range(8, WORLD - 8);
    const f = fbm(forest, x / 260, z / 260, 3);
    const want = def.res[1] === 0 ? f > 0.28 : def.res[1] === 1 ? f > 0.12 : f > -0.05;
    if (!want && !r.chance(0.02)) continue;
    const h = t.heightAt(x, z);
    if (h < WATER_LEVEL + 1.2 || t.slopeAt(x, z) > 0.9) continue;
    out.push(x, z, r.range(0.75, 1.35), r.int(0, 3));
  }
  return new Float32Array(out);
}

/** A top-down terrain thumbnail: blue water, green land, tan and grey high ground, with hill shading. */
export function drawThumbnail(t: Terrain, size = 160): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const wx = ((x + 0.5) / size) * WORLD;
      const wz = ((y + 0.5) / size) * WORLD;
      const h = t.heightAt(wx, wz);
      const shade = Math.max(0.65, Math.min(1.25, 1 + (t.heightAt(wx - 8, wz - 8) - h) * 0.06));
      let col: [number, number, number];
      if (h < WATER_LEVEL) {
        const d = Math.min(1, -h / 14);
        col = [60 - 40 * d, 170 - 90 * d, 205 - 70 * d];
      } else if (h < 1.6) col = [216, 200, 146];
      else if (h < 28) col = [92 + h * 0.6, 162 - h * 0.4, 62];
      else if (h < 62) col = [176 - (h - 28) * 0.4, 156 - (h - 28) * 0.7, 112 - (h - 28) * 0.5];
      else col = [205, 205, 200];
      const k = (y * size + x) * 4;
      const s = h < WATER_LEVEL ? 1 : shade;
      img.data[k] = Math.min(255, col[0] * s);
      img.data[k + 1] = Math.min(255, col[1] * s);
      img.data[k + 2] = Math.min(255, col[2] * s);
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}
