/** Seeded random numbers (mulberry32) and seeded 2D noise. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + next() * (hi - lo),
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

/** Integer hash of a few numbers to [0, 1). */
export function hash(...xs: number[]) {
  let h = 2166136261;
  for (const x of xs) {
    h ^= Math.floor(x * 1000) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Seeded gradient noise in 2D, roughly in [-1, 1]. */
export function noise2(seed: number) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = r.next() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const g = (ix: number, iy: number, dx: number, dy: number) => {
      const h = perm[(perm[ix & 255] + iy) & 511];
      return gx[h] * dx + gy[h] * dy;
    };
    const u = fade(xf);
    const v = fade(yf);
    const a = g(xi, yi, xf, yf) + u * (g(xi + 1, yi, xf - 1, yf) - g(xi, yi, xf, yf));
    const b = g(xi, yi + 1, xf, yf - 1) + u * (g(xi + 1, yi + 1, xf - 1, yf - 1) - g(xi, yi + 1, xf, yf - 1));
    return (a + v * (b - a)) * 1.414;
  };
}

/** Fractal sum of octaves. */
export function fbm(n: (x: number, y: number) => number, x: number, y: number, octaves = 5, lac = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += n(x * f, y * f) * amp;
    norm += amp;
    amp *= gain;
    f *= lac;
  }
  return sum / norm;
}
