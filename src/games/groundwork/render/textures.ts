import * as THREE from "three";

/**
 * Groundwork's materials, painted in code (nothing to download): for each, a tileable albedo,
 * a normal map (from a height field) and a roughness map. Fired clay with its sand and pits,
 * mortar's grain, concrete's pores and formwork lines, timber's grain and knots, a terracotta
 * tile, galvanised steel, the lawn, the soil, gravel and the asphalt out on the street.
 */

export interface PBR {
  map: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
}

let seedState = 1;
const rand = () => {
  seedState = (seedState * 16807) % 2147483647;
  return (seedState - 1) / 2147483646;
};
const reseed = (s: number) => {
  seedState = Math.max(1, Math.floor(s) % 2147483646);
};

/** Tileable value noise on an N×N grid with `cells` lattice cells across. */
function vnoise(N: number, cells: number): Float32Array {
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = rand();
  const out = new Float32Array(N * N);
  const at = (i: number, j: number) => lat[((j + cells) % cells) * cells + ((i + cells) % cells)];
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * cells;
    const j = Math.floor(fy);
    const ty = fy - j;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cells;
      const i = Math.floor(fx);
      const tx = fx - i;
      const sx = tx * tx * (3 - 2 * tx);
      const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
      const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
      out[y * N + x] = a + (b - a) * sy;
    }
  }
  return out;
}

/** Fractal noise: octaves of value noise, each twice as fine and half as strong. */
function fbm(N: number, base: number, octaves: number, seed: number) {
  reseed(seed);
  const out = new Float32Array(N * N);
  let amp = 0.5;
  let cells = base;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = vnoise(N, cells);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Scatter round dents (pits, stones, pores) into a height field, wrapping at the edges. */
function dents(h: Float32Array, N: number, count: number, rMin: number, rMax: number, depth: number, seed: number, bump = false) {
  reseed(seed);
  for (let k = 0; k < count; k++) {
    const cx = rand() * N;
    const cy = rand() * N;
    const r = rMin + rand() * (rMax - rMin);
    const d = depth * (0.5 + rand() * 0.5);
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dd = (x - cx) ** 2 + (y - cy) ** 2;
        if (dd > r2) continue;
        const f = 1 - dd / r2;
        const i = ((y + N) % N) * N + ((x + N) % N);
        h[i] += (bump ? 1 : -1) * d * f * f;
      }
  }
}

function canvas(N: number) {
  const c = document.createElement("canvas");
  c.width = c.height = N;
  return { c, g: c.getContext("2d")! };
}

function texture(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Albedo from an RGB function of the pixel. */
function paint(N: number, f: (i: number, x: number, y: number) => [number, number, number]) {
  const { c, g } = canvas(N);
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const [r, gg, b] = f(i, x, y);
      img.data[i * 4] = Math.max(0, Math.min(255, r * 255));
      img.data[i * 4 + 1] = Math.max(0, Math.min(255, gg * 255));
      img.data[i * 4 + 2] = Math.max(0, Math.min(255, b * 255));
      img.data[i * 4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return texture(c, true);
}

/** A normal map from a height field (strength: how steep a unit of height is per pixel). */
function normals(h: Float32Array, N: number, strength: number) {
  const { c, g } = canvas(N);
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const l = h[y * N + ((x + N - 1) % N)];
      const r = h[y * N + ((x + 1) % N)];
      const u = h[((y + N - 1) % N) * N + x];
      const d = h[((y + 1) % N) * N + x];
      const dx = (r - l) * strength;
      const dy = (d - u) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      img.data[i] = (-dx / len) * 127.5 + 127.5;
      img.data[i + 1] = (dy / len) * 127.5 + 127.5;
      img.data[i + 2] = (1 / len) * 127.5 + 127.5;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return texture(c, false);
}

/** A roughness map (in the green channel, as three.js reads it). */
function roughness(N: number, f: (i: number) => number) {
  const { c, g } = canvas(N);
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = Math.max(0, Math.min(255, f(i) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return texture(c, false);
}

/** Fired clay: near-white (the brick's own colour comes from each one), with sand, pits and flashing. */
export function brickPBR(N = 512): PBR {
  const blot = fbm(N, 4, 4, 11);
  const fine = fbm(N, 64, 2, 12);
  const h = fbm(N, 32, 4, 13);
  for (let i = 0; i < h.length; i++) h[i] = h[i] * 0.35 + fine[i] * 0.25;
  dents(h, N, 900, 0.8, 2.6, 0.5, 14);
  dents(h, N, 60, 2.5, 6, 0.35, 15);
  reseed(16);
  const speck = new Float32Array(N * N);
  for (let k = 0; k < 7000; k++) speck[Math.floor(rand() * N) * N + Math.floor(rand() * N)] = rand() < 0.6 ? -1 : 1;
  const map = paint(N, (i) => {
    const b = 0.84 + (blot[i] - 0.5) * 0.36 + (fine[i] - 0.5) * 0.14 + speck[i] * 0.14;
    // Kiln flashing: darker, a little purple, in patches.
    const flash = Math.max(0, blot[i] - 0.62) * 1.4;
    return [b - flash * 0.32, b - flash * 0.4, b - flash * 0.3];
  });
  return { map, normal: normals(h, N, 3.2), rough: roughness(N, (i) => 0.78 + fine[i] * 0.18 - Math.max(0, -speck[i]) * 0.1) };
}

/** Sand and cement: pale grain with the odd dark grain of sand. */
export function mortarPBR(N = 256): PBR {
  const g1 = fbm(N, 32, 3, 21);
  const h = fbm(N, 64, 2, 22);
  dents(h, N, 1400, 0.5, 1.6, 0.4, 23, true);
  reseed(24);
  const sand = new Float32Array(N * N);
  for (let k = 0; k < 5000; k++) sand[Math.floor(rand() * N) * N + Math.floor(rand() * N)] = rand() * 2 - 1;
  const map = paint(N, (i) => {
    const b = 0.86 + (g1[i] - 0.5) * 0.16 + sand[i] * 0.12;
    return [b * 1.01, b, b * 0.96];
  });
  return { map, normal: normals(h, N, 4), rough: roughness(N, () => 0.96) };
}

/** Concrete: pale, blotchy, full of small pores, with the faint lines of the formwork. */
export function concretePBR(N = 512): PBR {
  const blot = fbm(N, 3, 5, 31);
  const fine = fbm(N, 48, 2, 32);
  const h = fbm(N, 24, 3, 33);
  for (let i = 0; i < h.length; i++) h[i] *= 0.3;
  dents(h, N, 2600, 0.5, 1.8, 0.6, 34);
  const map = paint(N, (i, _x, y) => {
    const board = Math.abs(((y / N) * 6) % 1 - 0.5) > 0.494 ? -0.05 : 0;
    const b = 0.8 + (blot[i] - 0.5) * 0.22 + (fine[i] - 0.5) * 0.08 + board;
    return [b, b * 0.995, b * 0.97];
  });
  return { map, normal: normals(h, N, 3), rough: roughness(N, (i) => 0.84 + fine[i] * 0.12) };
}

/** Sawn timber, its grain along u: growth rings warped by noise, the odd knot. */
export function timberPBR(N = 512): PBR {
  const warp = fbm(N, 4, 4, 41);
  const fine = fbm(N, 64, 2, 42);
  const grain = new Float32Array(N * N);
  reseed(43);
  const knots = Array.from({ length: 5 }, () => ({ x: rand() * N, y: rand() * N, r: 6 + rand() * 10 }));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      let v = y / N + warp[i] * 0.18;
      for (const k of knots) {
        const dx = Math.min(Math.abs(x - k.x), N - Math.abs(x - k.x)) / 3;
        const dy = Math.min(Math.abs(y - k.y), N - Math.abs(y - k.y));
        const d = Math.hypot(dx, dy);
        v += (k.r * 2.2) / (d + k.r) / 40;
      }
      grain[i] = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 22);
    }
  const h = new Float32Array(N * N);
  for (let i = 0; i < h.length; i++) h[i] = grain[i] * 0.25 + fine[i] * 0.15;
  const map = paint(N, (i) => {
    const late = Math.pow(grain[i], 3);
    const b = 0.95 - late * 0.26 + (fine[i] - 0.5) * 0.08 + (warp[i] - 0.5) * 0.12;
    return [b, b * 0.97, b * 0.92];
  });
  return { map, normal: normals(h, N, 2.2), rough: roughness(N, (i) => 0.62 + grain[i] * 0.2) };
}

/** A clay roof tile: smoother than a brick, with a sandy face and some weathering. */
export function tilePBR(N = 256): PBR {
  const blot = fbm(N, 4, 4, 51);
  const fine = fbm(N, 48, 2, 52);
  const h = fbm(N, 32, 3, 53);
  for (let i = 0; i < h.length; i++) h[i] *= 0.25;
  dents(h, N, 300, 0.6, 1.8, 0.3, 54);
  const map = paint(N, (i) => {
    const b = 0.86 + (blot[i] - 0.5) * 0.3 + (fine[i] - 0.5) * 0.12;
    const lichen = Math.max(0, fine[i] - 0.82) * 1.4;
    return [b - lichen * 0.2, b - lichen * 0.05, b - lichen * 0.3];
  });
  return { map, normal: normals(h, N, 2.4), rough: roughness(N, (i) => 0.62 + blot[i] * 0.25) };
}

/** Galvanised steel: a faint crystalline spangle. */
export function metalPBR(N = 256): PBR {
  reseed(61);
  const cells = Array.from({ length: 70 }, () => ({ x: rand() * N, y: rand() * N, v: rand() }));
  const id = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let best = Infinity;
      let v = 0;
      for (const c of cells) {
        const dx = Math.min(Math.abs(x - c.x), N - Math.abs(x - c.x));
        const dy = Math.min(Math.abs(y - c.y), N - Math.abs(y - c.y));
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          v = c.v;
        }
      }
      id[y * N + x] = v;
    }
  const fine = fbm(N, 32, 2, 62);
  const h = new Float32Array(N * N);
  for (let i = 0; i < h.length; i++) h[i] = id[i] * 0.05 + fine[i] * 0.04;
  const map = paint(N, (i) => {
    const b = 0.86 + (id[i] - 0.5) * 0.1 + (fine[i] - 0.5) * 0.05;
    return [b, b, b * 1.01];
  });
  return { map, normal: normals(h, N, 2), rough: roughness(N, (i) => 0.3 + id[i] * 0.25) };
}

/** A lawn: blades in every shade of green, clover, a few dry patches. 1 tile = 4 m. */
export function grassPBR(N = 1024): PBR {
  const big = fbm(N, 3, 4, 71);
  const mid = fbm(N, 16, 3, 72);
  const h = new Float32Array(N * N);
  reseed(73);
  const col = new Float32Array(N * N * 3);
  // Paint blades: short strokes, mostly upright in the texture.
  for (let i = 0; i < N * N; i++) {
    const g = 0.36 + (mid[i] - 0.5) * 0.12 + (big[i] - 0.5) * 0.08;
    col[i * 3] = g * 0.62;
    col[i * 3 + 1] = g;
    col[i * 3 + 2] = g * 0.36;
    h[i] = mid[i] * 0.2;
  }
  for (let k = 0; k < N * 90; k++) {
    const x0 = rand() * N;
    const y0 = rand() * N;
    const len = 3 + rand() * 8;
    const ang = -Math.PI / 2 + (rand() - 0.5) * 1.3;
    const shade = 0.75 + rand() * 0.6;
    const dry = rand() < 0.08 ? 1 : 0;
    for (let t = 0; t < len; t++) {
      const x = Math.floor(x0 + Math.cos(ang) * t + N) % N;
      const y = Math.floor(y0 + Math.sin(ang) * t + N) % N;
      const i = y * N + x;
      const tip = t / len;
      const g = (0.34 + tip * 0.16) * shade;
      col[i * 3] = dry ? g * 0.95 : g * 0.6;
      col[i * 3 + 1] = dry ? g * 0.88 : g;
      col[i * 3 + 2] = dry ? g * 0.45 : g * 0.32;
      h[i] = 0.3 + tip * 0.7;
    }
  }
  const map = paint(N, (i) => [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]]);
  return { map, normal: normals(h, N, 1.6), rough: roughness(N, () => 0.95) };
}

/** Bare soil, trodden, with stones. 1 tile = 3 m. */
export function soilPBR(N = 512): PBR {
  const big = fbm(N, 4, 5, 81);
  const fine = fbm(N, 64, 2, 82);
  const h = new Float32Array(N * N);
  for (let i = 0; i < h.length; i++) h[i] = big[i] * 0.3 + fine[i] * 0.2;
  dents(h, N, 500, 1.2, 4, 0.7, 83, true);
  const map = paint(N, (i) => {
    const b = 0.3 + (big[i] - 0.5) * 0.12 + (fine[i] - 0.5) * 0.08 + Math.max(0, h[i] - 0.45) * 0.5;
    return [b * 1.1, b * 0.88, b * 0.66];
  });
  return { map, normal: normals(h, N, 3), rough: roughness(N, () => 0.97) };
}

/** Road asphalt: dark binder and pale aggregate. */
export function asphaltPBR(N = 512): PBR {
  const big = fbm(N, 4, 4, 91);
  const h = fbm(N, 64, 2, 92);
  dents(h, N, 6000, 0.5, 1.5, 0.5, 93, true);
  const map = paint(N, (i) => {
    const b = 0.2 + (big[i] - 0.5) * 0.06 + Math.max(0, h[i] - 0.55) * 0.5;
    return [b, b, b * 1.02];
  });
  return { map, normal: normals(h, N, 3), rough: roughness(N, (i) => 0.82 + big[i] * 0.1) };
}

/** Gravel: a carpet of grey and buff stones. */
export function gravelPBR(N = 512): PBR {
  const h = new Float32Array(N * N);
  const col = new Float32Array(N * N);
  reseed(101);
  for (let k = 0; k < 5200; k++) {
    const cx = rand() * N;
    const cy = rand() * N;
    const r = 2 + rand() * 4.5;
    const shade = 0.4 + rand() * 0.45;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r);
        if (d > 1) continue;
        const i = ((y + N) % N) * N + ((x + N) % N);
        const hh = Math.sqrt(1 - d) * r * 0.2;
        if (hh > h[i]) {
          h[i] = hh;
          col[i] = shade * (0.85 + Math.sqrt(1 - d) * 0.2);
        }
      }
  }
  const map = paint(N, (i) => {
    const b = col[i] || 0.22;
    return [b, b * 0.97, b * 0.9];
  });
  return { map, normal: normals(h, N, 1.6), rough: roughness(N, () => 0.9) };
}

/** Laid brickwork, for the houses next door: one tile = 2.25 m by 1.2 m of stretcher bond. */
export function brickworkPBR(colors: string[], N = 512): PBR {
  const { c, g } = canvas(N);
  const fine = fbm(N, 48, 2, 111);
  g.fillStyle = "#c9c3b6";
  g.fillRect(0, 0, N, N);
  const bw = N / 10;
  const bh = N / 16;
  const h = new Float32Array(N * N);
  reseed(112);
  for (let r = 0; r < 16; r++)
    for (let k = -1; k < 11; k++) {
      const x = k * bw + (r % 2) * (bw / 2);
      const col = new THREE.Color(colors[Math.floor(rand() * colors.length)]).multiplyScalar(0.85 + rand() * 0.3);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
      for (let y = r * bh + 2; y < r * bh + bh - 2; y++)
        for (let xx = Math.max(0, Math.floor(x + 2)); xx < Math.min(N, x + bw - 2); xx++) h[y * N + xx] = 0.6;
    }
  const img = g.getImageData(0, 0, N, N);
  for (let i = 0; i < N * N; i++) {
    const k = 0.9 + (fine[i] - 0.5) * 0.25;
    img.data[i * 4] *= k;
    img.data[i * 4 + 1] *= k;
    img.data[i * 4 + 2] *= k;
    h[i] += fine[i] * 0.1;
  }
  g.putImageData(img, 0, 0);
  return { map: texture(c, true), normal: normals(h, N, 2), rough: roughness(N, () => 0.9) };
}

/** A solar panel's face: 6 × 10 cells with silver busbars, pale so the panel's own colour tints it. */
export function solarTexture(N = 512) {
  const { c, g } = canvas(N);
  g.fillStyle = "#f2f4f8";
  g.fillRect(0, 0, N, N);
  const cols = 6;
  const rows = 10;
  const cw = N / cols;
  const ch = N / rows;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = i * cw + 2;
      const y = j * ch + 2;
      const grd = g.createLinearGradient(x, y, x + cw, y + ch);
      grd.addColorStop(0, "#c7cfdc");
      grd.addColorStop(1, "#b3bdcc");
      g.fillStyle = grd;
      g.fillRect(x, y, cw - 4, ch - 4);
      // Busbars and fingers.
      g.fillStyle = "rgba(255,255,255,.75)";
      for (const f of [0.33, 0.66]) g.fillRect(x + (cw - 4) * f - 1, y, 2, ch - 4);
      g.fillStyle = "rgba(255,255,255,.18)";
      for (let k = 1; k < 8; k++) g.fillRect(x, y + ((ch - 4) * k) / 8, cw - 4, 1);
    }
  return texture(c, true);
}
