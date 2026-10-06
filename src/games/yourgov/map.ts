/**
 * The country: a continent generated from a seed, cut into a few hundred sections (the
 * counties votes are counted in) that are grouped into states. Kept as a label raster
 * (one section id per pixel, -1 for water) so the map draws county outlines exactly.
 */
import { createRng as rng } from "../engine/rng";
import { SYL_A, SYL_B, type Pos } from "./data";

export const MAP_W = 480;
export const MAP_H = 320;

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
  /** Name of its town (the biggest sections are cities). */
  town: string;
  city: boolean;
}

export interface StateDef {
  id: number;
  name: string;
  cx: number;
  cy: number;
  sections: number[];
  pop: number;
  capital: number;
}

export interface Country {
  seed: number;
  name: string;
  labels: Int16Array;
  /** 1 where a pixel borders a different state (or the sea). */
  stateEdge: Uint8Array;
  sections: Section[];
  states: StateDef[];
  pop: number;
  capital: number;
}

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

function name(r: ReturnType<typeof rng>, used: Set<string>) {
  for (let k = 0; k < 40; k++) {
    const n = r.pick(SYL_A) + r.pick(SYL_B);
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  return `${r.pick(SYL_A)}${r.pick(SYL_B)} ${used.size}`;
}

/** Build the country for a seed. Deterministic. */
export function makeCountry(seed: number, nSections = 950, nStates = 16): Country {
  const r = rng(seed);
  const W = MAP_W;
  const H = MAP_H;
  // Land: a broad continent, coast roughened by noise, a sea to the east and south.
  const land = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = (x / W - 0.47) / 0.48;
      const ny = (y / H - 0.5) / 0.44;
      const d = Math.hypot(nx * 1.0, ny * 1.1);
      const n = fbm(x / 70, y / 70, seed) * 0.75 + fbm(x / 22, y / 22, seed + 7) * 0.25;
      const lake = fbm(x / 30, y / 30, seed + 99) > 0.78 && d < 0.6;
      land[y * W + x] = d + (0.5 - n) * 0.75 < 0.82 && !lake ? 1 : 0;
    }
  // Keep the biggest landmass only (islands and slivers would be odd sections).
  const comp = new Int32Array(W * H).fill(-1);
  let best = -1;
  let bestSize = 0;
  let cid = 0;
  for (let i = 0; i < W * H; i++) {
    if (!land[i] || comp[i] >= 0) continue;
    const stack = [i];
    comp[i] = cid;
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
          comp[q] = cid;
          stack.push(q);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = cid;
    }
    cid++;
  }
  for (let i = 0; i < W * H; i++) if (comp[i] !== best) land[i] = 0;

  // Section seeds: rejection-sampled on land, denser where people live.
  const density = (x: number, y: number) => 0.35 + fbm(x / 60, y / 60, seed + 3) * 0.9;
  const seeds: { x: number; y: number }[] = [];
  const minD = Math.sqrt((bestSize / nSections) * 0.5);
  for (let tries = 0; seeds.length < nSections && tries < nSections * 60; tries++) {
    const x = r.next() * W;
    const y = r.next() * H;
    if (!land[(y | 0) * W + (x | 0)]) continue;
    const md = minD / Math.sqrt(density(x, y));
    if (seeds.some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < md * md)) continue;
    seeds.push({ x, y });
  }
  // Nearest seed per pixel (a bucket grid keeps it fast).
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
      for (let rad = 1; rad <= 4 && bi < 0; rad++)
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
  // Section stats.
  const n = seeds.length;
  const area = new Float64Array(n);
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  for (let i = 0; i < W * H; i++) {
    const l = labels[i];
    if (l < 0) continue;
    area[l]++;
    sx[l] += i % W;
    sy[l] += (i / W) | 0;
  }
  // A few big cities: population bumps.
  const cities = Array.from({ length: 14 }, () => seeds[Math.floor(r.next() * n)]);
  const sections: Section[] = seeds.map((s, i) => {
    const cx = area[i] ? sx[i] / area[i] : s.x;
    const cy = area[i] ? sy[i] / area[i] : s.y;
    let urban = 0;
    cities.forEach((c, k) => (urban = Math.max(urban, Math.exp(-((c.x - cx) ** 2 + (c.y - cy) ** 2) / (k < 4 ? 260 : 120)))));
    urban = Math.max(0, Math.min(1, urban + (fbm(cx / 40, cy / 40, seed + 11) - 0.5) * 0.3 + 0.1));
    const pop = Math.round((60_000 + 2_700_000 * urban ** 2.2 + 180_000 * density(cx, cy)) * (0.7 + r.next() * 0.6));
    // Leanings: cities lean left and liberal, the countryside right and conservative, with regional colour.
    const reg = { e: (fbm(cx / 90, cy / 90, seed + 21) - 0.5) * 2.2, s: (fbm(cx / 90, cy / 90, seed + 31) - 0.5) * 2.2 };
    const lean = { e: Math.max(-1, Math.min(1, reg.e + (0.25 - urban) * 0.9 + (r.next() - 0.5) * 0.25)), s: Math.max(-1, Math.min(1, reg.s + (0.3 - urban) * 1.1 + (r.next() - 0.5) * 0.25)) };
    return { id: i, state: -1, cx, cy, area: area[i], pop, urban, lean, town: "", city: false };
  });
  // States: grow from seeds over the section adjacency so every state is in one piece.
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++) {
      const a = labels[y * W + x];
      if (a < 0) continue;
      for (const b of [labels[y * W + x + 1], labels[(y + 1) * W + x]])
        if (b >= 0 && b !== a) {
          adj[a].add(b);
          adj[b].add(a);
        }
    }
  const stateSeeds: number[] = [];
  for (let k = 0; k < nStates * 30 && stateSeeds.length < nStates; k++) {
    const c = Math.floor(r.next() * n);
    if (stateSeeds.every((o) => Math.hypot(sections[o].cx - sections[c].cx, sections[o].cy - sections[c].cy) > 52)) stateSeeds.push(c);
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
  for (const s of sections) if (s.state < 0) s.state = [...adj[s.id]].map((b) => sections[b].state).find((x) => x >= 0) ?? 0;
  const used = new Set<string>();
  const states: StateDef[] = stateSeeds.map((c, k) => ({ id: k, name: name(r, used), cx: 0, cy: 0, sections: [], pop: 0, capital: c }));
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
    st.capital = st.sections.reduce((a, b) => (sections[b].pop > sections[a].pop ? b : a), st.sections[0]);
  }
  // Towns: the biggest sections are cities.
  const byPop = [...sections].sort((a, b) => b.pop - a.pop);
  byPop.forEach((s, i) => {
    s.town = name(r, used);
    s.city = i < 24;
  });
  const stateEdge = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const l = labels[y * W + x];
      if (l < 0) continue;
      const st = sections[l].state;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const q = labels[Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))];
        if (q < 0 || sections[q].state !== st) stateEdge[y * W + x] = 1;
      }
    }
  const pop = sections.reduce((a, s) => a + s.pop, 0);
  const capital = byPop[0].id;
  return { seed, name: "Avalon", labels, stateEdge, sections, states, pop, capital };
}
