/**
 * Plane geometry for XCity, in metres on the ground (x east, z south): polylines (stored flat as
 * x, z, x, z…), segment tests, oriented rectangles, polygons, a spatial hash and a seeded random.
 */

export type Pts = number[];

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

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Distance from a point to a segment, and where along it (0..1) the nearest point is. */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + dx * t;
  const z = az + dz * t;
  return { d: Math.hypot(px - x, pz - z), t, x, z };
}

/** Where two segments cross (t along the first, u along the second), or null. */
export function segCross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t, u, x: ax + rx * t, z: az + rz * t };
}

export function polyLength(p: Pts) {
  let l = 0;
  for (let i = 2; i < p.length; i += 2) l += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return l;
}

/** The point at arc length s along a polyline, with the unit direction there. */
export function pointAt(p: Pts, s: number) {
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) {
    const dx = p[i] - p[i - 2];
    const dz = p[i + 1] - p[i - 1];
    const l = Math.hypot(dx, dz);
    if (acc + l >= s || i === p.length - 2) {
      const t = l > 0 ? clamp((s - acc) / l, 0, 1) : 0;
      return { x: p[i - 2] + dx * t, z: p[i - 1] + dz * t, dx: l > 0 ? dx / l : 1, dz: l > 0 ? dz / l : 0 };
    }
    acc += l;
  }
  return { x: p[0], z: p[1], dx: 1, dz: 0 };
}

/** The nearest point on a polyline: distance, arc length, position and segment index. */
export function nearestOn(p: Pts, x: number, z: number) {
  let best = { d: Infinity, s: 0, x: p[0], z: p[1], seg: 0 };
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) {
    const r = segDist(x, z, p[i - 2], p[i - 1], p[i], p[i + 1]);
    const l = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    if (r.d < best.d) best = { d: r.d, s: acc + r.t * l, x: r.x, z: r.z, seg: (i - 2) / 2 };
    acc += l;
  }
  return best;
}

export function distToPoly(p: Pts, x: number, z: number) {
  let d = Infinity;
  for (let i = 2; i < p.length; i += 2) {
    const r = segDist(x, z, p[i - 2], p[i - 1], p[i], p[i + 1]).d;
    if (r < d) d = r;
  }
  return d;
}

/** The part of a polyline between arc lengths s0 and s1. */
export function slice(p: Pts, s0: number, s1: number): Pts {
  const out: Pts = [];
  const a = pointAt(p, s0);
  out.push(a.x, a.z);
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) {
    acc += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    if (acc > s0 + 0.01 && acc < s1 - 0.01) out.push(p[i], p[i + 1]);
  }
  const b = pointAt(p, s1);
  out.push(b.x, b.z);
  return out;
}

export function reversePts(p: Pts): Pts {
  const out: Pts = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}

export function bbox(p: Pts, pad = 0) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i];
    if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < z0) z0 = p[i + 1];
    if (p[i + 1] > z1) z1 = p[i + 1];
  }
  return { x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad };
}

/** A smooth curve through control points (Catmull-Rom), sampled about every `step` metres. */
export function smooth(ctrl: Pts, step = 8): Pts {
  const n = ctrl.length / 2;
  if (n < 3) return ctrl.slice();
  const P = (i: number) => {
    const k = clamp(i, 0, n - 1) * 2;
    return [ctrl[k], ctrl[k + 1]];
  };
  const out: Pts = [ctrl[0], ctrl[1]];
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(1, Math.round(len / step));
    for (let j = 1; j <= k; j++) {
      const t = j / k;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ polygons */

export function pointInPoly(x: number, z: number, poly: Pts) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i];
    const zi = poly[i + 1];
    const xj = poly[j];
    const zj = poly[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(poly: Pts) {
  let a = 0;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) a += poly[j] * poly[i + 1] - poly[i] * poly[j + 1];
  return Math.abs(a) / 2;
}

export function polyCentre(poly: Pts) {
  let x = 0;
  let z = 0;
  const n = poly.length / 2;
  for (let i = 0; i < poly.length; i += 2) {
    x += poly[i];
    z += poly[i + 1];
  }
  return { x: x / n, z: z / n };
}

/* ------------------------------------------------------------------ oriented rectangles */

/** A rectangle centred at (x, z), half `hw` along (ux, uz) and half `hd` across it. */
export interface OBB {
  x: number;
  z: number;
  ux: number;
  uz: number;
  hw: number;
  hd: number;
}

export function obbCorners(o: OBB): Pts {
  const vx = -o.uz;
  const vz = o.ux;
  const out: Pts = [];
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push(o.x + o.ux * o.hw * a + vx * o.hd * b, o.z + o.uz * o.hw * a + vz * o.hd * b);
  return out;
}

/** Points spread over a rectangle (corners, edge midpoints, centre), for "does anything touch it" tests. */
export function obbSamples(o: OBB): Pts {
  const vx = -o.uz;
  const vz = o.ux;
  const out: Pts = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) out.push(o.x + o.ux * o.hw * a + vx * o.hd * b, o.z + o.uz * o.hw * a + vz * o.hd * b);
  return out;
}

export function obbOverlap(a: OBB, b: OBB, shrink = 0) {
  const axes = [
    [a.ux, a.uz],
    [-a.uz, a.ux],
    [b.ux, b.uz],
    [-b.uz, b.ux],
  ];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [ax, az] of axes) {
    const ra = Math.abs(a.ux * ax + a.uz * az) * (a.hw - shrink) + Math.abs(-a.uz * ax + a.ux * az) * (a.hd - shrink);
    const rb = Math.abs(b.ux * ax + b.uz * az) * (b.hw - shrink) + Math.abs(-b.uz * ax + b.ux * az) * (b.hd - shrink);
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
  }
  return true;
}

export function inObb(o: OBB, x: number, z: number, pad = 0) {
  const dx = x - o.x;
  const dz = z - o.z;
  return Math.abs(dx * o.ux + dz * o.uz) <= o.hw + pad && Math.abs(-dx * o.uz + dz * o.ux) <= o.hd + pad;
}

/* ------------------------------------------------------------------ spatial hash */

/** Buckets ids by the cells their boxes touch, for "what's near here" queries. */
export class Hash {
  private cells = new Map<number, Set<number>>();
  private boxes = new Map<number, [number, number, number, number]>();
  constructor(readonly cell = 64) {}

  private key(i: number, j: number) {
    return (i + 4096) * 8192 + (j + 4096);
  }

  add(id: number, x0: number, z0: number, x1: number, z1: number) {
    this.remove(id);
    const c = this.cell;
    const b: [number, number, number, number] = [Math.floor(x0 / c), Math.floor(z0 / c), Math.floor(x1 / c), Math.floor(z1 / c)];
    this.boxes.set(id, b);
    for (let i = b[0]; i <= b[2]; i++)
      for (let j = b[1]; j <= b[3]; j++) {
        const k = this.key(i, j);
        let s = this.cells.get(k);
        if (!s) this.cells.set(k, (s = new Set()));
        s.add(id);
      }
  }

  remove(id: number) {
    const b = this.boxes.get(id);
    if (!b) return;
    for (let i = b[0]; i <= b[2]; i++) for (let j = b[1]; j <= b[3]; j++) this.cells.get(this.key(i, j))?.delete(id);
    this.boxes.delete(id);
  }

  query(x0: number, z0: number, x1: number, z1: number, out = new Set<number>()) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const s = this.cells.get(this.key(i, j));
        if (s) for (const id of s) out.add(id);
      }
    return out;
  }

  clear() {
    this.cells.clear();
    this.boxes.clear();
  }
}
