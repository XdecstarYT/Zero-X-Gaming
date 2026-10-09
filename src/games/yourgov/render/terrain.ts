/**
 * The country's ground, as a satellite would see it: a heightfield (plains rising inland,
 * ridged mountain ranges, lakes, a continental shelf), and a surface texture painted from it:
 * farmland laid out county by county, forests, pasture, dry scrub, bare rock and snow,
 * beaches, cities with dense cores and leafy suburbs, rivers running downhill to the sea and
 * highways between the cities.
 *
 * Pure (no WebGL): it fills typed arrays the renderer turns into a mesh and textures (and a
 * web worker can run it off the main thread). Deterministic per seed.
 */
import { createRng } from "../../engine/rng";
import { MAP_H, MAP_W, fbm, landField, type Country } from "../map";

export interface TerrainQuality {
  /** Height samples per map unit. */
  grid: number;
  /** Surface texture pixels per map unit. */
  tex: number;
  /** Most buildings to place. */
  buildings: number;
}

export const QUALITY: Record<"high" | "low", TerrainQuality> = {
  high: { grid: 1, tex: 4, buildings: 16000 },
  low: { grid: 0.5, tex: 2, buildings: 5000 },
};

export interface Building {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** 0–1: which facade colour. */
  tone: number;
}

export interface Terrain {
  /** Grid size in samples (gw × gh), covering the whole map. */
  gw: number;
  gh: number;
  /** Map units per sample. */
  step: number;
  /** Height at each sample (world units; sea level 0). */
  heights: Float32Array;
  /** How built-up each sample is, 0–1. */
  urban: Float32Array;
  /** Surface colour, tw × th RGBA (sRGB). */
  tw: number;
  th: number;
  albedo: Uint8ClampedArray;
  /** County id per surface pixel (65535 for open sea), packed low byte / high byte. */
  labels: Uint8Array;
  rivers: { x: number; y: number }[][];
  roads: { x: number; y: number }[][];
  buildings: Building[];
  borders: Borders;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Height at a map point (world units). */
export function heightAt(seed: number, x: number, y: number) {
  const f = landField(seed, x, y);
  const c = f.coast;
  let h: number;
  if (c > 0) {
    const hills = fbm(x / 14, y / 14, seed + 81, 3);
    const range = smooth(0.44, 0.64, fbm(x / 95, y / 95, seed + 61, 3));
    const r = 1 - Math.abs(2 * fbm(x / 30, y / 30, seed + 51, 5) - 1);
    const ridge = r * r * r;
    const inland = smooth(0.03, 0.22, c);
    h = smooth(0, 0.05, c) * 0.35 + smooth(0, 0.4, c) * (1.4 + hills * 2.4) + range * (ridge * 15 + hills * 3) * inland;
  } else {
    // A narrow shelf, then deep water.
    h = Math.max(-12, c * 26 + Math.min(0, c + 0.07) * 70);
  }
  // Lakes cut down to a shallow bed.
  if (f.lake > 0) h = mix(h, -1.6, f.lake);
  return h;
}

function hash(x: number, y: number, s: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bilinear sample of a grid at map coordinates. */
function sampler(grid: Float32Array, gw: number, gh: number, step: number) {
  return (x: number, y: number) => {
    const gx = Math.min(gw - 1.001, Math.max(0, x / step));
    const gy = Math.min(gh - 1.001, Math.max(0, y / step));
    const x0 = gx | 0;
    const y0 = gy | 0;
    const fx = gx - x0;
    const fy = gy - y0;
    const i = y0 * gw + x0;
    return mix(mix(grid[i], grid[i + 1], fx), mix(grid[i + gw], grid[i + gw + 1], fx), fy);
  };
}

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const C = {
  sand: hex("#d6c7a0"),
  wetSand: hex("#8a8065"),
  seabed: hex("#3f5b5e"),
  dry: hex("#9c9163"),
  grass: hex("#6c7f3e"),
  lush: hex("#4f6a2c"),
  forest: hex("#2c4220"),
  conifer: hex("#213420"),
  scrub: hex("#8a7f58"),
  rock: hex("#776e61"),
  rockLight: hex("#958b7b"),
  snow: hex("#eef1f4"),
  core: [hex("#8f8b86"), hex("#a39e97"), hex("#77736f"), hex("#9b958c"), hex("#6a6967"), hex("#b1aca3")],
  roofs: [hex("#9a8f86"), hex("#a5594a"), hex("#8b8b8d"), hex("#b9b0a2"), hex("#7c4f40"), hex("#6e7276")],
  garden: hex("#5d7536"),
  street: hex("#56575a"),
  park: hex("#4c6a31"),
  fields: [hex("#b9a86b"), hex("#7c8f3d"), hex("#8c7049"), hex("#a9a174"), hex("#6a8838"), hex("#c4b37b"), hex("#98874f"), hex("#5c7833"), hex("#a68e5a"), hex("#86964a")],
};

/** Build the terrain for a country. Around a second at high quality (run it in a worker). */
export function buildTerrain(c: Country, q: TerrainQuality): Terrain {
  const seed = c.seed;
  const step = 1 / q.grid;
  const gw = Math.round(MAP_W * q.grid) + 1;
  const gh = Math.round(MAP_H * q.grid) + 1;
  const n = gw * gh;
  const heights = new Float32Array(n);
  const moist = new Float32Array(n);
  const forestG = new Float32Array(n);
  const farmG = new Float32Array(n);
  const detailG = new Float32Array(n);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const x = i * step;
      const y = j * step;
      const k = j * gw + i;
      heights[k] = heightAt(seed, x, y);
      moist[k] = fbm(x / 90, y / 90, seed + 71, 3) * 0.75 + fbm(x / 25, y / 25, seed + 73, 2) * 0.25;
      forestG[k] = fbm(x / 13, y / 13, seed + 91, 4);
      farmG[k] = fbm(x / 48, y / 48, seed + 43, 3);
      detailG[k] = fbm(x / 3, y / 3, seed + 3, 2);
    }

  // Slope and sunlight per sample (the texture interpolates them).
  const slopeG = new Float32Array(n);
  const shadeG = new Float32Array(n);
  const sun = norm3(-0.55, 0.62, -0.55);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      const hx = (heights[j * gw + Math.min(gw - 1, i + 1)] - heights[j * gw + Math.max(0, i - 1)]) / (2 * step);
      const hy = (heights[Math.min(gh - 1, j + 1) * gw + i] - heights[Math.max(0, j - 1) * gw + i]) / (2 * step);
      slopeG[k] = Math.hypot(hx, hy);
      const nn = norm3(-hx, 1, -hy);
      shadeG[k] = 0.8 + 0.3 * Math.max(0, nn[0] * sun[0] + nn[1] * sun[1] + nn[2] * sun[2]);
    }

  // How built-up: ragged blobs round the towns, big and dense round the cities.
  const urban = new Float32Array(n);
  for (const sec of c.sections) {
    if (sec.urban < 0.2 && !sec.city) continue;
    const amp = Math.min(1, (0.35 + sec.urban * 0.6) * (sec.city ? 1.1 : 1));
    const sig = Math.max(0.8, (0.5 + 3.4 * sec.urban ** 2) * Math.sqrt(Math.max(0.3, sec.pop / 1_000_000)) * (sec.city ? 1.15 : 1));
    const R = sig * 3;
    for (let y = Math.max(0, Math.floor((sec.cy - R) / step)); y <= Math.min(gh - 1, Math.ceil((sec.cy + R) / step)); y++)
      for (let x = Math.max(0, Math.floor((sec.cx - R) / step)); x <= Math.min(gw - 1, Math.ceil((sec.cx + R) / step)); x++) {
        // Warp the distance with noise so towns sprawl along valleys and coasts, never in neat circles.
        const wx = x * step + (fbm((x * step) / 5, (y * step) / 5, seed + 35, 3) - 0.5) * sig * 2.2;
        const wy = y * step + (fbm((x * step) / 5, (y * step) / 5, seed + 37, 3) - 0.5) * sig * 2.2;
        const d2 = (wx - sec.cx) ** 2 + (wy - sec.cy) ** 2;
        const k = y * gw + x;
        const v = amp * Math.exp(-d2 / (2 * sig * sig)) * (0.55 + fbm((x * step) / 2.5, (y * step) / 2.5, seed + 33, 3) * 0.9);
        urban[k] = Math.min(1, urban[k] + v);
      }
  }
  for (let k = 0; k < n; k++) if (heights[k] < 0.15) urban[k] = 0;

  const H = sampler(heights, gw, gh, step);
  const M = sampler(moist, gw, gh, step);
  const F = sampler(forestG, gw, gh, step);
  const FA = sampler(farmG, gw, gh, step);
  const U = sampler(urban, gw, gh, step);
  const SL = sampler(slopeG, gw, gh, step);
  const SH = sampler(shadeG, gw, gh, step);
  const DT = sampler(detailG, gw, gh, step);

  const T = q.tex;
  const tw = MAP_W * T;
  const th = MAP_H * T;
  const labels = countyLabels(c, T, tw, th);

  // Each county's farms are surveyed on their own grid: one angle and field size per county.
  const farmAng = Float32Array.from(c.sections, (s) => (hash(s.id, 1, seed) - 0.5) * 1.4);
  const farmW = Float32Array.from(c.sections, (s) => 1.3 + hash(s.id, 2, seed) * 1.3);
  const farmH = Float32Array.from(c.sections, (s) => 0.8 + hash(s.id, 3, seed) * 0.9);

  const albedo = new Uint8ClampedArray(tw * th * 4);
  for (let py = 0; py < th; py++) {
    const y = (py + 0.5) / T;
    for (let px = 0; px < tw; px++) {
      const x = (px + 0.5) / T;
      const h = H(x, y);
      const o = (py * tw + px) * 4;
      const grain = 0.94 + hash(px, py, seed) * 0.12;
      let r: number;
      let g: number;
      let b: number;
      if (h < 0.02) {
        // Under water: sand in the shallows, darkening into the deep.
        const t = smooth(0, 2.5, -h);
        r = mix(C.wetSand[0], C.seabed[0], t);
        g = mix(C.wetSand[1], C.seabed[1], t);
        b = mix(C.wetSand[2], C.seabed[2], t);
      } else {
        const slope = SL(x, y);
        const m = M(x, y);
        const u = U(x, y);
        const mottle = 0.86 + DT(x, y) * 0.28;
        // Pasture: dry to lush by moisture, mottled.
        let vr = mix(mix(C.dry[0], C.grass[0], smooth(0.3, 0.55, m)), C.lush[0], smooth(0.55, 0.75, m)) * mottle;
        let vg = mix(mix(C.dry[1], C.grass[1], smooth(0.3, 0.55, m)), C.lush[1], smooth(0.55, 0.75, m)) * mottle;
        let vb = mix(mix(C.dry[2], C.grass[2], smooth(0.3, 0.55, m)), C.lush[2], smooth(0.55, 0.75, m)) * mottle;
        // Farmland: in the farming regions of the lowland countryside.
        const farm = smooth(0.42, 0.55, FA(x, y)) * (1 - smooth(3.5, 6.5, h)) * (1 - smooth(0.5, 1.1, slope)) * (1 - smooth(0.12, 0.3, u));
        if (farm > 0.02) {
          const lab = labels[(py * tw + px) * 2] | (labels[(py * tw + px) * 2 + 1] << 8);
          if (lab !== 65535) {
            const ang = farmAng[lab];
            const ca = Math.cos(ang);
            const sa = Math.sin(ang);
            const fx = (x * ca - y * sa) / farmW[lab];
            const fy = (x * sa + y * ca) / farmH[lab];
            const cx = Math.floor(fx);
            const cy = Math.floor(fy);
            const f = C.fields[Math.floor(hash(cx, cy, seed + 5 + lab) * C.fields.length)];
            // Hedgerows and tracks between the fields; a few fields lie fallow (left as pasture).
            const edge = Math.min(fx - cx, 1 - (fx - cx), fy - cy, 1 - (fy - cy)) < 0.05 ? 0.7 : 1;
            const k = farm * (hash(cx, cy, seed + 6 + lab) < 0.12 ? 0.25 : 1);
            const stripe = 0.96 + 0.04 * Math.sin((fx - cx) * 40);
            vr = mix(vr, f[0] * edge * stripe, k);
            vg = mix(vg, f[1] * edge * stripe, k);
            vb = mix(vb, f[2] * edge * stripe, k);
          }
        }
        // Forest: wherever it's wet enough and nobody farms; conifers up the hills.
        const fo = smooth(0.5, 0.58, F(x, y) * 0.7 + m * 0.4) * (1 - farm) * (1 - smooth(0.2, 0.45, u)) * (1 - smooth(10, 12.5, h));
        if (fo > 0) {
          const t = smooth(3, 9, h);
          const dapple = 0.78 + hash(px >> 1, py >> 1, seed + 9) * 0.34;
          vr = mix(vr, mix(C.forest[0], C.conifer[0], t) * dapple, fo);
          vg = mix(vg, mix(C.forest[1], C.conifer[1], t) * dapple, fo);
          vb = mix(vb, mix(C.forest[2], C.conifer[2], t) * dapple, fo);
        }
        // Dry scrub on the warm, dry hills.
        const sc = smooth(0.42, 0.25, m) * smooth(2, 6, h) * 0.65;
        vr = mix(vr, C.scrub[0], sc);
        vg = mix(vg, C.scrub[1], sc);
        vb = mix(vb, C.scrub[2], sc);
        // Rock on steep ground and high up; snow on the peaks.
        const rock = Math.max(smooth(1.0, 2.0, slope), smooth(7.5, 11, h));
        if (rock > 0) {
          const rt = hash(px >> 2, py >> 2, seed + 13);
          vr = mix(vr, mix(C.rock[0], C.rockLight[0], rt), rock);
          vg = mix(vg, mix(C.rock[1], C.rockLight[1], rt), rock);
          vb = mix(vb, mix(C.rock[2], C.rockLight[2], rt), rock);
        }
        const snow = smooth(14, 16.5, h + (hash(px >> 1, py >> 1, seed + 17) - 0.5) * 1.4 + (1 - y / MAP_H) * 1.5) * (1 - smooth(1.8, 3, slope));
        if (snow > 0) {
          vr = mix(vr, C.snow[0], snow);
          vg = mix(vg, C.snow[1], snow);
          vb = mix(vb, C.snow[2], snow);
        }
        // Beaches.
        const beach = (1 - smooth(0.12, 0.4, h)) * (1 - smooth(0.4, 1, slope));
        if (beach > 0) {
          vr = mix(vr, C.sand[0], beach);
          vg = mix(vg, C.sand[1], beach);
          vb = mix(vb, C.sand[2], beach);
        }
        // Towns and cities: leafy suburbs of single houses, then a dense grid of blocks downtown.
        const town = smooth(0.18, 0.36, u);
        if (town > 0) {
          const core = smooth(0.62, 0.85, u);
          const bs = mix(0.22, 0.4, core);
          const bx = x / bs;
          const by = y / bs;
          const ix = Math.floor(bx);
          const iy = Math.floor(by);
          const fxp = bx - ix;
          const fyp = by - iy;
          const street = Math.min(fxp, 1 - fxp, fyp, 1 - fyp) < mix(0.16, 0.1, core);
          const cell = hash(ix, iy, seed + 21);
          let cc: number[];
          if (street) cc = C.street;
          else if (core > 0.5) cc = cell < 0.05 ? C.park : C.core[Math.floor(hash(ix, iy, seed + 22) * C.core.length)];
          else {
            // A house on its plot, or a garden.
            const inHouse = Math.abs(fxp - 0.5) < 0.28 && Math.abs(fyp - 0.5) < 0.24;
            cc = inHouse && cell < 0.35 + u ? C.roofs[Math.floor(hash(ix, iy, seed + 23) * C.roofs.length)] : C.garden;
          }
          vr = mix(vr, cc[0], town);
          vg = mix(vg, cc[1], town);
          vb = mix(vb, cc[2], town);
        }
        // Sunlight (soft: the renderer lights the mesh as well).
        const shade = SH(x, y);
        r = vr * shade;
        g = vg * shade;
        b = vb * shade;
      }
      albedo[o] = r * grain;
      albedo[o + 1] = g * grain;
      albedo[o + 2] = b * grain;
      albedo[o + 3] = 255;
    }
  }

  // Rivers: traced on the height grid, then straightened and rounded so they meander smoothly.
  const rivers = traceRivers(seed, heights, gw, gh, step).map((r) => {
    const flat = simplify(
      r.flatMap((p) => [p.x, p.y]),
      step * 0.6,
    );
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
    return chaikin(pts, 3);
  });
  const roads = layRoads(c, H);
  const buildings = placeBuildings(seed, U, H, q.buildings);
  const borders = traceBorders(c, labels, tw, th);
  return { gw, gh, step, heights, urban, tw, th, albedo, labels, rivers, roads, buildings, borders };
}

/**
 * County ids at texture resolution: each pixel takes the nearest county seed among the
 * counties around it, so borders are smooth curves instead of map-pixel steps.
 */
function countyLabels(c: Country, T: number, tw: number, th: number) {
  const labels = new Uint8Array(tw * th * 2);
  const sxs = Float32Array.from(c.sections, (q) => q.sx);
  const sys = Float32Array.from(c.sections, (q) => q.sy);
  const lab = (x: number, y: number) => c.labels[Math.min(MAP_H - 1, Math.max(0, y)) * MAP_W + Math.min(MAP_W - 1, Math.max(0, x))];
  // Each surface pixel sits among four map pixels; where they're all one county (most of the
  // time) there's nothing to search.
  const uniform = new Int32Array(MAP_W * MAP_H).fill(-2);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const l = lab(x, y);
      if (lab(x + 1, y) === l && lab(x, y + 1) === l && lab(x + 1, y + 1) === l) uniform[y * MAP_W + x] = l;
    }
  const cand: number[] = [];
  for (let py = 0; py < th; py++) {
    const y = (py + 0.5) / T;
    const ly = Math.max(0, Math.floor(y - 0.5));
    for (let px = 0; px < tw; px++) {
      const x = (px + 0.5) / T;
      const lx = Math.max(0, Math.floor(x - 0.5));
      const o = (py * tw + px) * 2;
      const u = uniform[ly * MAP_W + lx];
      if (u !== -2) {
        const v = u < 0 ? 65535 : u;
        labels[o] = v & 255;
        labels[o + 1] = v >> 8;
        continue;
      }
      cand.length = 0;
      for (let dy = -1; dy <= 2; dy++)
        for (let dx = -1; dx <= 2; dx++) {
          if ((dx === -1 || dx === 2) && (dy === -1 || dy === 2)) continue;
          const l = lab(lx + dx, ly + dy);
          if (l >= 0 && !cand.includes(l)) cand.push(l);
        }
      let best = 65535;
      let bd = Infinity;
      for (const l of cand) {
        const d = (sxs[l] - x) ** 2 + (sys[l] - y) ** 2;
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      labels[o] = best & 255;
      labels[o + 1] = best >> 8;
    }
  }
  return labels;
}

function norm3(x: number, y: number, z: number) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** Rivers: from springs high in the hills, downhill (with a little momentum) to the sea. */
function traceRivers(seed: number, heights: Float32Array, gw: number, gh: number, step: number) {
  const r = createRng(seed * 31 + 7);
  const out: { x: number; y: number }[][] = [];
  const taken = new Uint8Array(gw * gh);
  for (let tries = 0; tries < 4000 && out.length < 40; tries++) {
    let i = r.int(1, gw - 2);
    let j = r.int(1, gh - 2);
    if (heights[j * gw + i] < 3.2) continue;
    const path: { x: number; y: number }[] = [];
    let dx = 0;
    let dy = 0;
    let ok = false;
    for (let n = 0; n < 900; n++) {
      path.push({ x: i * step, y: j * step });
      const k = j * gw + i;
      if (heights[k] < 0) {
        ok = true;
        break;
      }
      if (taken[k] && path.length > 10) {
        ok = true;
        break;
      }
      taken[k] = 1;
      let best = -1;
      let bh = Infinity;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const ni = i + ox;
          const nj = j + oy;
          if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
          // Prefer to keep going the same way (rivers meander, they don't zigzag).
          const v = heights[nj * gw + ni] - (ox * dx + oy * dy) * 0.05 + (taken[nj * gw + ni] ? 0.5 : 0);
          if (v < bh) {
            bh = v;
            best = nj * gw + ni;
          }
        }
      if (best < 0) break;
      const ni = best % gw;
      const nj = (best / gw) | 0;
      // A pit with nowhere lower to go: give up on this one.
      if (heights[best] > heights[k] + 0.25) break;
      dx = ni - i;
      dy = nj - j;
      i = ni;
      j = nj;
    }
    // Keep rivers that actually go somewhere: no spirals round a hollow, no wandering on a plain.
    const straight = Math.hypot(path[path.length - 1].x - path[0].x, path[path.length - 1].y - path[0].y);
    let curly = false;
    for (let k = 0; k + 24 < path.length && !curly; k += 6) curly = Math.hypot(path[k + 24].x - path[k].x, path[k + 24].y - path[k].y) < 6 * step;
    if (ok && path.length > 14 / step && straight > path.length * step * 0.35 && !curly) out.push(path);
  }
  return out;
}

/** Highways: a minimum spanning tree over the state capitals and the cities, kept off the water. */
function layRoads(c: Country, H: (x: number, y: number) => number) {
  const hubs = [...new Set([...c.states.map((s) => s.capital), ...c.sections.filter((s) => s.city).map((s) => s.id)])].map((id) => c.sections[id]);
  const inTree = new Set<number>([0]);
  const edges: [number, number][] = [];
  const dry = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) => {
    const n = Math.ceil(Math.hypot(b.cx - a.cx, b.cy - a.cy) / 2);
    for (let k = 1; k < n; k++) if (H(mix(a.cx, b.cx, k / n), mix(a.cy, b.cy, k / n)) < 0.1) return false;
    return true;
  };
  while (inTree.size < hubs.length) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (const a of inTree)
      for (let b = 0; b < hubs.length; b++) {
        if (inTree.has(b)) continue;
        const d = Math.hypot(hubs[a].cx - hubs[b].cx, hubs[a].cy - hubs[b].cy) * (dry(hubs[a], hubs[b]) ? 1 : 4);
        if (d < bd) {
          bd = d;
          best = [a, b];
        }
      }
    if (!best) break;
    inTree.add(best[1]);
    if (dry(hubs[best[0]], hubs[best[1]])) edges.push(best);
  }
  return edges.map(([a, b]) => {
    const A = hubs[a];
    const B = hubs[b];
    const n = Math.max(2, Math.ceil(Math.hypot(B.cx - A.cx, B.cy - A.cy) / 4));
    const nx = -(B.cy - A.cy);
    const ny = B.cx - A.cx;
    const nl = Math.hypot(nx, ny) || 1;
    // A gentle bow and a little wander, so it reads as a road and not a ruler line.
    return Array.from({ length: n + 1 }, (_, k) => {
      const t = k / n;
      const bow = Math.sin(t * Math.PI) * (fbm(A.cx / 9, B.cy / 9, a * 7 + b, 1) - 0.5) * 0.18 * nl;
      const wob = k === 0 || k === n ? 0 : (fbm(t * 6, a + b, 3, 2) - 0.5) * 2.2;
      return { x: mix(A.cx, B.cx, t) + (nx / nl) * (bow + wob), y: mix(A.cy, B.cy, t) + (ny / nl) * (bow + wob) };
    });
  });
}

/** Buildings: low and spread out in the suburbs, tall and tight downtown. */
function placeBuildings(seed: number, U: (x: number, y: number) => number, H: (x: number, y: number) => number, max: number): Building[] {
  const out: Building[] = [];
  const cell = 0.42;
  for (let y = cell / 2; y < MAP_H && out.length < max; y += cell)
    for (let x = cell / 2; x < MAP_W && out.length < max; x += cell) {
      const u = U(x, y);
      if (u < 0.34) continue;
      const ix = Math.round(x / cell);
      const iy = Math.round(y / cell);
      const r = hash(ix, iy, seed + 101);
      if (r < 0.07 || r > 0.25 + u * 0.75) continue;
      const h0 = H(x, y);
      if (h0 < 0.2) continue;
      const tall = u ** 4;
      const w = cell * (0.45 + hash(ix, iy, seed + 102) * 0.35);
      const d = cell * (0.45 + hash(ix, iy, seed + 103) * 0.35);
      out.push({ x, y, w, d, h: 0.05 + 0.06 * hash(ix, iy, seed + 104) + tall * hash(ix, iy, seed + 105) ** 2 * 2.4, tone: hash(ix, iy, seed + 106) });
    }
  return out;
}

/** Tileable cloud cover (0–255), `size` × `size`, for a drifting cloud layer and its shadows. */
export function cloudMap(seed: number, size: number) {
  const out = new Uint8Array(size * size);
  // Value noise on a lattice that wraps, so the texture repeats without a seam.
  const lattice = (x: number, y: number, p: number, s: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const w = (a: number) => ((a % p) + p) % p;
    const a = hash(w(xi), w(yi), s);
    const b = hash(w(xi + 1), w(yi), s);
    const c = hash(w(xi), w(yi + 1), s);
    const d = hash(w(xi + 1), w(yi + 1), s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let tot = 0;
      for (let o = 0; o < 6; o++) {
        const p = 4 << o;
        v += amp * lattice((x / size) * p, (y / size) * p, p, seed + o * 31);
        tot += amp;
        amp *= 0.52;
      }
      v /= tot;
      // Mostly clear sky with drifting banks of cloud.
      out[y * size + x] = Math.round(smooth(0.5, 0.78, v) * 255);
    }
  return out;
}

export interface Borders {
  /** Polyline points (map units), x/y pairs. */
  pts: Float32Array;
  /** Per line: first point index and point count. */
  start: Uint32Array;
  count: Uint32Array;
  /** Per line: 0 between counties, 1 between states, 2 the coast. */
  kind: Uint8Array;
  /** Per line: the counties either side (65535 for the sea). */
  a: Uint16Array;
  b: Uint16Array;
}

/** Douglas–Peucker: drop points within eps of the line through their neighbours. */
function simplify(p: number[], eps: number): number[] {
  const n = p.length / 2;
  if (n < 3) return p;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const ax = p[i0 * 2];
    const ay = p[i0 * 2 + 1];
    const dx = p[i1 * 2] - ax;
    const dy = p[i1 * 2 + 1] - ay;
    const L = Math.hypot(dx, dy) || 1;
    let best = -1;
    let bd = eps;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((p[i * 2] - ax) * dy - (p[i * 2 + 1] - ay) * dx) / L;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i0, best], [best, i1]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

/**
 * The borders as clean polylines: walk the pixel edges between differing counties in the
 * label image, chain them, and straighten the staircases (Voronoi borders are straight).
 */
export function traceBorders(c: Country, labels: Uint8Array, tw: number, th: number): Borders {
  const T = tw / MAP_W;
  const lab = (x: number, y: number) => (x < 0 || y < 0 || x >= tw || y >= th ? 65535 : labels[(y * tw + x) * 2] | (labels[(y * tw + x) * 2 + 1] << 8));
  // Corner ids: (x, y) with 0 ≤ x ≤ tw, 0 ≤ y ≤ th. Each boundary edge joins two corners.
  const W1 = tw + 1;
  const segA: number[] = [];
  const segB: number[] = [];
  const segL: number[] = [];
  const segR: number[] = [];
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      const l = lab(x, y);
      const r = lab(x + 1, y);
      if (r !== l && x + 1 < tw && (l !== 65535 || r !== 65535)) {
        segA.push(y * W1 + x + 1);
        segB.push((y + 1) * W1 + x + 1);
        segL.push(Math.min(l, r));
        segR.push(Math.max(l, r));
      }
      const d = lab(x, y + 1);
      if (d !== l && y + 1 < th && (l !== 65535 || d !== 65535)) {
        segA.push((y + 1) * W1 + x);
        segB.push((y + 1) * W1 + x + 1);
        segL.push(Math.min(l, d));
        segR.push(Math.max(l, d));
      }
    }
  const nSeg = segA.length;
  // Corner → segments touching it.
  const deg = new Map<number, number[]>();
  for (let i = 0; i < nSeg; i++) {
    for (const k of [segA[i], segB[i]]) {
      let a = deg.get(k);
      if (!a) deg.set(k, (a = []));
      a.push(i);
    }
  }
  const used = new Uint8Array(nSeg);
  const pts: number[] = [];
  const start: number[] = [];
  const count: number[] = [];
  const kind: number[] = [];
  const A: number[] = [];
  const B: number[] = [];
  const pairKey = (i: number) => segL[i] * 65536 + segR[i];
  const emit = (chain: number[], i0: number) => {
    const flat: number[] = [];
    for (const k of chain) flat.push((k % W1) / T, Math.floor(k / W1) / T);
    const s = simplify(flat, 0.9 / T);
    start.push(pts.length / 2);
    count.push(s.length / 2);
    for (const v of s) pts.push(v);
    const a = segL[i0];
    const b = segR[i0];
    A.push(a);
    B.push(b);
    kind.push(b === 65535 ? 2 : c.sections[a].state !== c.sections[b].state ? 1 : 0);
  };
  // A chain runs while each corner joins exactly two segments of the same pair of counties.
  const next = (corner: number, from: number) => {
    const list = deg.get(corner)!;
    const same = list.filter((j) => j !== from && !used[j] && pairKey(j) === pairKey(from));
    return list.length === 2 && same.length === 1 ? same[0] : -1;
  };
  for (let i = 0; i < nSeg; i++) {
    if (used[i]) continue;
    used[i] = 1;
    // Grow both ways from this segment.
    const fwd: number[] = [segB[i]];
    let cur = i;
    let corner = segB[i];
    for (;;) {
      const j = next(corner, cur);
      if (j < 0) break;
      used[j] = 1;
      corner = segA[j] === corner ? segB[j] : segA[j];
      fwd.push(corner);
      cur = j;
    }
    const back: number[] = [];
    cur = i;
    corner = segA[i];
    for (;;) {
      const j = next(corner, cur);
      if (j < 0) break;
      used[j] = 1;
      corner = segA[j] === corner ? segB[j] : segA[j];
      back.push(corner);
      cur = j;
    }
    emit([...back.reverse(), segA[i], ...fwd], i);
  }
  return { pts: Float32Array.from(pts), start: Uint32Array.from(start), count: Uint32Array.from(count), kind: Uint8Array.from(kind), a: Uint16Array.from(A), b: Uint16Array.from(B) };
}

/** Smooth a polyline (Chaikin corner cutting), keeping its ends. */
export function chaikin(p: { x: number; y: number }[], rounds = 2) {
  let out = p;
  for (let r = 0; r < rounds; r++) {
    if (out.length < 3) return out;
    const n: { x: number; y: number }[] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i];
      const b = out[i + 1];
      n.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    n.push(out[out.length - 1]);
    out = n;
  }
  return out;
}
