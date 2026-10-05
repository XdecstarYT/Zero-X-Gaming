/** 2D geometry on the ground plane (x, z) and polylines stored as flat [x0, z0, x1, z1, …] arrays. */
export interface P {
  x: number;
  z: number;
}

export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z);
export const lerpP = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function polyLength(pts: number[]) {
  let L = 0;
  for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return L;
}

/** Cumulative distance at each vertex. */
export function cumulative(pts: number[]) {
  const out = new Float64Array(pts.length / 2);
  for (let i = 1; i < out.length; i++) out[i] = out[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  return out;
}

/** Point and unit tangent at distance s along a polyline. */
export function sampleAt(pts: number[], cum: ArrayLike<number>, s: number) {
  const n = cum.length;
  const L = cum[n - 1];
  s = clamp(s, 0, L);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = Math.max(1e-9, cum[hi] - cum[lo]);
  const t = (s - cum[lo]) / seg;
  const ax = pts[lo * 2];
  const az = pts[lo * 2 + 1];
  const bx = pts[hi * 2];
  const bz = pts[hi * 2 + 1];
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  return { x: ax + dx * t, z: az + dz * t, tx: dx / len, tz: dz / len, seg: lo };
}

/** Closest point on a polyline: distance, arc length, signed side (+1 left of travel, -1 right). */
export function project(pts: number[], cum: ArrayLike<number>, p: P) {
  let best = { d: Infinity, s: 0, side: 1, x: 0, z: 0, seg: 0, t: 0 };
  for (let i = 0; i < pts.length / 2 - 1; i++) {
    const ax = pts[i * 2];
    const az = pts[i * 2 + 1];
    const dx = pts[i * 2 + 2] - ax;
    const dz = pts[i * 2 + 3] - az;
    const l2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((p.x - ax) * dx + (p.z - az) * dz) / l2, 0, 1);
    const x = ax + dx * t;
    const z = az + dz * t;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best.d) {
      const cross = dx * (p.z - az) - dz * (p.x - ax);
      best = { d, s: cum[i] + Math.sqrt(l2) * t, side: cross > 0 ? -1 : 1, x, z, seg: i, t };
    }
  }
  return best;
}

/** Segment intersection: params (t on ab, u on cd) or null. */
export function segX(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const rX = bx - ax;
  const rZ = bz - az;
  const sX = dx - cx;
  const sZ = dz - cz;
  const den = rX * sZ - rZ * sX;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sZ - (cz - az) * sX) / den;
  const u = ((cx - ax) * rZ - (cz - az) * rX) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: ax + rX * t, z: az + rZ * t };
}

/** Resample a polyline to points about `step` apart (keeps both ends). */
export function resample(pts: number[], step: number) {
  const cum = cumulative(pts);
  const L = cum[cum.length - 1];
  const n = Math.max(1, Math.round(L / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = sampleAt(pts, cum, (L * i) / n);
    out.push(p.x, p.z);
  }
  return out;
}

/** Quadratic Bezier a → (via c) → b, sampled. */
export function quadratic(a: P, c: P, b: P, step = 4) {
  const L = dist(a, c) + dist(c, b);
  const n = Math.max(2, Math.ceil(L / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
  }
  return out;
}

export function cubic(a: P, c1: P, c2: P, b: P, step = 4) {
  const L = dist(a, c1) + dist(c1, c2) + dist(c2, b);
  const n = Math.max(2, Math.ceil(L / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const k0 = u * u * u;
    const k1 = 3 * u * u * t;
    const k2 = 3 * u * t * t;
    const k3 = t * t * t;
    out.push(k0 * a.x + k1 * c1.x + k2 * c2.x + k3 * b.x, k0 * a.z + k1 * c1.z + k2 * c2.z + k3 * b.z);
  }
  return out;
}

/** Chaikin smoothing for freehand strokes. */
export function chaikin(pts: number[], rounds = 2) {
  let cur = pts;
  for (let r = 0; r < rounds; r++) {
    if (cur.length < 6) return cur;
    const out = [cur[0], cur[1]];
    for (let i = 0; i < cur.length / 2 - 1; i++) {
      const ax = cur[i * 2];
      const az = cur[i * 2 + 1];
      const bx = cur[i * 2 + 2];
      const bz = cur[i * 2 + 3];
      out.push(ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25, ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75);
    }
    out.push(cur[cur.length - 2], cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

/** Is p inside the rotated rectangle (centre, half sizes, angle of its +x axis)? */
export function inRect(p: P, cx: number, cz: number, hw: number, hd: number, ang: number) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const dx = p.x - cx;
  const dz = p.z - cz;
  const u = dx * c + dz * s;
  const v = -dx * s + dz * c;
  return Math.abs(u) <= hw && Math.abs(v) <= hd;
}

/** Corners of a rotated rectangle. */
export function rectCorners(cx: number, cz: number, hw: number, hd: number, ang: number): P[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([u, v]) => ({ x: cx + u * c - v * s, z: cz + u * s + v * c }));
}

/** Snap an angle to 15° steps. */
export const snapAngle = (a: number, step = Math.PI / 12) => Math.round(a / step) * step;
