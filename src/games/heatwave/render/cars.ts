import * as THREE from "three";
import { glowTexture } from "../../code-3/models";

/**
 * Heatwave's road cars, modelled as real car bodies rather than boxes.
 *
 * Each body is lofted: a side profile (sills, wheel arches, bonnet, beltline, boot), a plan shape
 * (rounded nose and tail, flared guards over the wheels) and a cross-section that is a rounded
 * box with tumblehome, swept along the car. A second loft makes the glasshouse: a raked windscreen,
 * the roof and the rear window or hatch, with pillars, a B-pillar and seals. Every triangle is
 * tagged with what it is (paint, glass, rubber, chrome, a lamp, the police checker band), and one
 * shader draws them all, so a whole car body is a single draw call. The paint colour, the lamps
 * (head, brake, reverse, indicators, the red and blue bar) and the wreck all come from per-car
 * uniforms, so cars of the same body share their geometry. The wheels (tyre, rim, spokes, brake
 * disc) are drawn for every car at once by `WheelBatch`.
 *
 * Local frame, like the shared kit: +x forward, +y up, +z to the driver's right.
 */

export type BodyKind = "sedan" | "cruiser" | "suv" | "interceptor" | "pickup" | "van" | "transport" | "ambulance" | "sports" | "pursuit";

/** Lamps, by uniform slot. */
export const LAMP = { head: 0, tail: 1, reverse: 2, amberL: 3, amberR: 4, red: 5, blue: 6 } as const;
const NLAMP = 7;
const LAMP_COLORS = ["#fff3dc", "#ff1a14", "#ffffff", "#ff9a1a", "#ff9a1a", "#ff1020", "#2050ff"];

/** Liveries painted by the shader from the body's own coordinates. */
export const LIVERY = { none: 0, police: 1, ambulance: 2, response: 3 } as const;
export type Livery = (typeof LIVERY)[keyof typeof LIVERY];

/* ------------------------------------------------------------------------- body shapes */

interface Cabin {
  /** Windscreen base and top, rear window top and base (x, m). */
  wb: number;
  wt: number;
  rt: number;
  rb: number;
  /** Roof height and its crown across the car. */
  roof: number;
  crown: number;
  /** How much narrower the roof is than the beltline (0..1). */
  tumble: number;
  /** Painted C-pillar length behind the rear door glass (m). */
  cPillar: number;
  /** Panel van: side glass only ahead of this x. */
  glassFrom?: number;
}

interface Body {
  L: number;
  W: number;
  /** Sill height. */
  clear: number;
  /** Wheel radius and axle positions. */
  r: number;
  axF: number;
  axR: number;
  /** The top of the lower body, rear to front: boot or tailgate, beltline, bonnet, nose. */
  shoulder: [number, number][];
  cabin: Cabin;
  /** Plan rounding at the nose and tail: the length it takes, and the bluntness. */
  nose: [number, number];
  tail: [number, number];
  /** Ute: a black tonneau over the tray behind this x. */
  tray?: number;
  /** A tall box body (vans): flat sides, no tumblehome on the lower body. */
  box?: boolean;
  rim: "alloy" | "sport" | "steel";
}

const sedan: Body = {
  L: 4.6,
  W: 1.84,
  clear: 0.2,
  r: 0.33,
  axF: 1.4,
  axR: -1.32,
  shoulder: [
    [-2.3, 0.7],
    [-2.24, 0.88],
    [-1.95, 0.95],
    [-1.3, 0.97],
    [-0.2, 0.96],
    [0.65, 0.93],
    [1.4, 0.86],
    [2.05, 0.77],
    [2.3, 0.64],
  ],
  cabin: { wb: 0.72, wt: 0.02, rt: -1.08, rb: -1.75, roof: 1.45, crown: 0.05, tumble: 0.2, cPillar: 0.26 },
  nose: [0.55, 2.6],
  tail: [0.45, 3.2],
  rim: "alloy",
};

const BODIES: Record<BodyKind, Body> = {
  sedan,
  cruiser: { ...scale(sedan, 5.0 / 4.6, 1.9 / 1.84, 1.03), rim: "steel" },
  suv: {
    L: 4.9,
    W: 2.0,
    clear: 0.34,
    r: 0.39,
    axF: 1.52,
    axR: -1.46,
    shoulder: [
      [-2.45, 0.92],
      [-2.42, 1.1],
      [-2.2, 1.14],
      [-0.5, 1.14],
      [0.8, 1.1],
      [1.5, 1.04],
      [2.2, 0.96],
      [2.45, 0.82],
    ],
    cabin: { wb: 0.9, wt: 0.12, rt: -2.18, rb: -2.36, roof: 1.78, crown: 0.04, tumble: 0.14, cPillar: 0.12 },
    nose: [0.5, 3.2],
    tail: [0.3, 4],
    rim: "alloy",
  },
  // Filled in below, from the SUV.
  interceptor: sedan,
  pickup: {
    L: 5.5,
    W: 2.0,
    clear: 0.36,
    r: 0.4,
    axF: 1.72,
    axR: -1.52,
    shoulder: [
      [-2.75, 0.98],
      [-2.7, 1.12],
      [-1.0, 1.14],
      [0.9, 1.12],
      [1.7, 1.06],
      [2.45, 0.98],
      [2.75, 0.84],
    ],
    cabin: { wb: 1.05, wt: 0.32, rt: -0.62, rb: -0.68, roof: 1.86, crown: 0.04, tumble: 0.14, cPillar: 0.1 },
    nose: [0.5, 3.4],
    tail: [0.2, 6],
    tray: -0.72,
    rim: "alloy",
  },
  van: {
    L: 5.3,
    W: 2.04,
    clear: 0.34,
    r: 0.38,
    axF: 1.75,
    axR: -1.5,
    shoulder: [
      [-2.65, 1.0],
      [-2.6, 1.08],
      [1.4, 1.1],
      [2.1, 1.02],
      [2.65, 0.86],
    ],
    cabin: { wb: 1.75, wt: 1.0, rt: -2.6, rb: -2.62, roof: 2.3, crown: 0.03, tumble: 0.05, cPillar: 0, glassFrom: 0.55 },
    nose: [0.45, 3.4],
    tail: [0.15, 6],
    box: true,
    rim: "steel",
  },
  transport: {
    L: 5.9,
    W: 2.1,
    clear: 0.36,
    r: 0.4,
    axF: 1.95,
    axR: -1.7,
    shoulder: [
      [-2.95, 1.04],
      [-2.9, 1.12],
      [1.6, 1.12],
      [2.35, 1.04],
      [2.95, 0.88],
    ],
    cabin: { wb: 1.95, wt: 1.2, rt: -2.9, rb: -2.92, roof: 2.5, crown: 0.03, tumble: 0.04, cPillar: 0, glassFrom: 1.0 },
    nose: [0.45, 3.4],
    tail: [0.15, 6],
    box: true,
    rim: "steel",
  },
  ambulance: {
    L: 6.2,
    W: 2.2,
    clear: 0.38,
    r: 0.42,
    axF: 2.05,
    axR: -1.8,
    shoulder: [
      [-3.1, 1.06],
      [-3.05, 1.14],
      [1.7, 1.14],
      [2.45, 1.06],
      [3.1, 0.9],
    ],
    cabin: { wb: 2.05, wt: 1.3, rt: -3.05, rb: -3.07, roof: 2.72, crown: 0.03, tumble: 0.03, cPillar: 0, glassFrom: 1.15 },
    nose: [0.45, 3.4],
    tail: [0.15, 6],
    box: true,
    rim: "steel",
  },
  sports: {
    L: 4.4,
    W: 1.92,
    clear: 0.14,
    r: 0.34,
    axF: 1.32,
    axR: -1.3,
    shoulder: [
      [-2.2, 0.62],
      [-2.12, 0.82],
      [-1.5, 0.88],
      [-0.8, 0.86],
      [0.3, 0.82],
      [1.2, 0.79],
      [1.95, 0.64],
      [2.2, 0.52],
    ],
    cabin: { wb: 0.42, wt: -0.28, rt: -1.18, rb: -1.85, roof: 1.18, crown: 0.04, tumble: 0.24, cPillar: 0.3 },
    nose: [0.6, 2.4],
    tail: [0.5, 2.8],
    rim: "sport",
  },
  pursuit: {
    L: 4.7,
    W: 1.95,
    clear: 0.16,
    r: 0.35,
    axF: 1.45,
    axR: -1.35,
    shoulder: [
      [-2.35, 0.7],
      [-2.27, 0.86],
      [-1.7, 0.9],
      [-0.9, 0.9],
      [0.5, 0.88],
      [1.4, 0.83],
      [2.12, 0.7],
      [2.35, 0.58],
    ],
    cabin: { wb: 0.52, wt: -0.16, rt: -1.18, rb: -1.95, roof: 1.3, crown: 0.04, tumble: 0.22, cPillar: 0.32 },
    nose: [0.55, 2.8],
    tail: [0.45, 3.4],
    rim: "sport",
  },
};
BODIES.interceptor = { ...scale(BODIES.suv, 5.05 / 4.9, 1, 0.98), rim: "steel" };

/** A body stretched to another size (lengths by sx, widths by sz, heights by sy). */
function scale(b: Body, sx: number, sz: number, sy: number): Body {
  const c = b.cabin;
  return {
    ...b,
    L: b.L * sx,
    W: b.W * sz,
    clear: b.clear * sy,
    r: b.r * Math.sqrt(sx * sy),
    axF: b.axF * sx,
    axR: b.axR * sx,
    shoulder: b.shoulder.map(([x, y]) => [x * sx, y * sy]),
    cabin: { ...c, wb: c.wb * sx, wt: c.wt * sx, rt: c.rt * sx, rb: c.rb * sx, roof: c.roof * sy, glassFrom: c.glassFrom === undefined ? undefined : c.glassFrom * sx },
    nose: [b.nose[0] * sx, b.nose[1]],
    tail: [b.tail[0] * sx, b.tail[1]],
    tray: b.tray === undefined ? undefined : b.tray * sx,
  };
}

/** The wheel radius of a body (for the drivers' seats and spinning the wheels). */
export const wheelRadius = (k: BodyKind) => BODIES[k].r;
/** The roof height of a body. */
export const roofHeight = (k: BodyKind) => BODIES[k].cabin.roof;

/** Catmull-Rom through points sorted by x. */
function spline(pts: [number, number][], x: number) {
  if (x <= pts[0][0]) return pts[0][1];
  const n = pts.length;
  if (x >= pts[n - 1][0]) return pts[n - 1][1];
  let i = 0;
  while (i < n - 2 && x > pts[i + 1][0]) i++;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n - 1, i + 2)];
  const t = (x - p1[0]) / (p2[0] - p1[0]);
  const dx = p2[0] - p1[0];
  const m1 = ((p2[1] - p0[1]) / Math.max(1e-6, p2[0] - p0[0])) * dx;
  const m2 = ((p3[1] - p1[1]) / Math.max(1e-6, p3[0] - p1[0])) * dx;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}

const sgnPow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------------- surfaces */

// Surface codes: what each triangle is.
const S_PLAIN = 0;
const S_PAINT = 1;
const S_LIVERY = 2;
const S_LAMP = 10;

interface Surf {
  color: string;
  metal: number;
  rough: number;
  coat: number;
  code: number;
}
const PAINT: Surf = { color: "#ffffff", metal: 0.4, rough: 0.3, coat: 1, code: S_PAINT };
const GLASS: Surf = { color: "#0b1016", metal: 0.0, rough: 0.04, coat: 1, code: S_PLAIN };
const RUBBER: Surf = { color: "#111214", metal: 0, rough: 0.7, coat: 0, code: S_PLAIN };
const GRILLE: Surf = { color: "#0d0e10", metal: 0.3, rough: 0.45, coat: 0, code: S_PLAIN };
const CHROME: Surf = { color: "#dfe3e8", metal: 1, rough: 0.12, coat: 0, code: S_PLAIN };
const UNDER: Surf = { color: "#0a0a0b", metal: 0, rough: 0.95, coat: 0, code: S_PLAIN };
const PLATE: Surf = { color: "#e8e8e2", metal: 0, rough: 0.5, coat: 0.3, code: S_PLAIN };
const TONNEAU: Surf = { color: "#141516", metal: 0, rough: 0.8, coat: 0, code: S_PLAIN };
const LIVERY_S: Surf = { ...PAINT, code: S_LIVERY };
const lamp = (i: number, color: string): Surf => ({ color, metal: 0.4, rough: 0.08, coat: 1, code: S_LAMP + i });
const HEAD = lamp(LAMP.head, "#c9d2d8");
const TAIL = lamp(LAMP.tail, "#5a0a0d");
const REV = lamp(LAMP.reverse, "#c8c8c8");
const AMB_L = lamp(LAMP.amberL, "#6a3a08");
const AMB_R = lamp(LAMP.amberR, "#6a3a08");
const RED = lamp(LAMP.red, "#5a0008");
const BLUE = lamp(LAMP.blue, "#00145a");

/** Accumulates triangles with their surface attributes. */
class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  srf: number[] = [];
  private c = new THREE.Color();
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3, s: Surf) {
    this.c.set(s.color);
    for (const [p, n] of [
      [a, na],
      [b, nb],
      [c, nc],
    ] as const) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.srf.push(s.metal, s.rough, s.coat, s.code);
    }
  }
  /** Add any geometry as one surface (it's made non-indexed). */
  geo(g: THREE.BufferGeometry, s: Surf) {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.attributes.normal) ng.computeVertexNormals();
    const p = ng.attributes.position as THREE.BufferAttribute;
    const n = ng.attributes.normal as THREE.BufferAttribute;
    this.c.set(s.color);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.srf.push(s.metal, s.rough, s.coat, s.code);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aSurf", new THREE.Float32BufferAttribute(this.srf, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * A lofted grid: `rows` stations by `cols` points, smooth normals from the grid, then each quad
 * given the surface `pick` chooses from its centre and normal.
 */
function loft(b: Builder, pts: THREE.Vector3[][], closed: boolean, pick: (c: THREE.Vector3, n: THREE.Vector3, i: number, j: number) => Surf, flip = false) {
  const rows = pts.length;
  const cols = pts[0].length;
  const nrm = pts.map((r) => r.map(() => new THREE.Vector3()));
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const fn = new THREE.Vector3();
  const jn = closed ? cols : cols - 1;
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < jn; j++) {
      const j1 = (j + 1) % cols;
      const a = pts[i][j];
      const c = pts[i + 1][j1];
      e1.subVectors(c, a);
      e2.subVectors(pts[i][j1], pts[i + 1][j]);
      fn.crossVectors(e1, e2);
      if (flip) fn.negate();
      for (const [ii, jj] of [
        [i, j],
        [i + 1, j],
        [i, j1],
        [i + 1, j1],
      ])
        nrm[ii][jj].add(fn);
    }
  for (const r of nrm)
    for (const n of r) {
      if (n.lengthSq() > 1e-12) n.normalize();
      else n.set(0, 1, 0);
    }
  const ctr = new THREE.Vector3();
  const qn = new THREE.Vector3();
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < jn; j++) {
      const j1 = (j + 1) % cols;
      const a = pts[i][j];
      const bq = pts[i + 1][j];
      const c = pts[i + 1][j1];
      const d = pts[i][j1];
      ctr.copy(a).add(bq).add(c).add(d).multiplyScalar(0.25);
      qn.copy(nrm[i][j]).add(nrm[i + 1][j]).add(nrm[i + 1][j1]).add(nrm[i][j1]).normalize();
      const s = pick(ctr, qn, i, j);
      if (flip) {
        b.tri(a, d, c, nrm[i][j], nrm[i][j1], nrm[i + 1][j1], s);
        b.tri(a, c, bq, nrm[i][j], nrm[i + 1][j1], nrm[i + 1][j], s);
      } else {
        b.tri(a, bq, c, nrm[i][j], nrm[i + 1][j], nrm[i + 1][j1], s);
        b.tri(a, c, d, nrm[i][j], nrm[i + 1][j1], nrm[i][j1], s);
      }
    }
}

/** Stations along x, denser at the ends and through the wheel arches. */
function stations(b: Body, n: number) {
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const cosine = (1 - Math.cos(Math.PI * u)) / 2;
    xs.push(-b.L / 2 + b.L * (0.45 * u + 0.55 * cosine));
  }
  return xs;
}

function halfWidth(b: Body, x: number) {
  let hw = b.W / 2;
  const [nl, np] = b.nose;
  const [tl, tp] = b.tail;
  const xn = b.L / 2 - nl;
  const xt = -b.L / 2 + tl;
  if (x > xn) hw *= Math.pow(Math.max(0, 1 - Math.pow((x - xn) / nl, np)), 1 / np);
  if (x < xt) hw *= Math.pow(Math.max(0, 1 - Math.pow((xt - x) / tl, tp)), 1 / tp);
  // Guards flared over the wheels.
  for (const ax of [b.axF, b.axR]) hw += 0.022 * Math.exp(-Math.pow((x - ax) / 0.55, 2));
  return Math.max(0.004, hw);
}

/** The sill line, lifted over the wheel arches and at the overhangs. */
function sill(b: Body, x: number) {
  let y = b.clear + 0.07 * smooth(b.L / 2 - 0.55, b.L / 2, Math.abs(x));
  const Ra = b.r + 0.075;
  for (const ax of [b.axF, b.axR]) {
    const d = Math.abs(x - ax);
    if (d < Ra) y = Math.max(y, b.r + Math.sqrt(Ra * Ra - d * d) * 0.97);
  }
  return y;
}

function bodyGeometry(kind: BodyKind, hi: boolean, livery: Livery, bar: "police" | "ems" | null) {
  const b = BODIES[kind];
  const cab = b.cabin;
  const out = new Builder();
  const xs = stations(b, hi ? 46 : 26);
  const M = hi ? 28 : 16;
  const shoulder = (x: number) => spline(b.shoulder, x);
  // --- The lower body: a rounded-box section, wider at the guards, in at the shoulders.
  const rows: THREE.Vector3[][] = [];
  for (const x of xs) {
    const yb = sill(b, x);
    const yt = Math.max(yb + 0.05, shoulder(x));
    const yc = (yb + yt) / 2;
    const hh = (yt - yb) / 2;
    const hw = halfWidth(b, x);
    const row: THREE.Vector3[] = [];
    for (let j = 0; j < M; j++) {
      const t = (j / M) * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const y = yc + hh * sgnPow(s, b.box ? 0.35 : 0.42);
      let z = hw * sgnPow(c, b.box ? 0.22 : 0.3);
      // Tumblehome: the shoulders lean in.
      const k = Math.max(0, (y - yc) / Math.max(0.01, hh));
      z *= 1 - (b.box ? 0.02 : 0.07) * k * k;
      row.push(new THREE.Vector3(x, y, z));
    }
    rows.push(row);
  }
  const L2 = b.L / 2;
  const band0 = b.clear + (shoulder(0) - b.clear) * 0.3;
  const band1 = b.clear + (shoulder(0) - b.clear) * 0.62;
  loft(out, rows, true, (p, n) => {
    const yb = sill(b, p.x);
    const yt = shoulder(p.x);
    const hw = halfWidth(b, p.x);
    const az = Math.abs(p.z);
    if (n.y < -0.5) return UNDER;
    if (p.y < yb + 0.07) return RUBBER;
    // The nose: lamps, grille and the air dam.
    if (p.x > L2 - 0.5 && n.x > 0.2) {
      if (p.y > yt - 0.17 && p.y < yt - 0.035 && az > hw * 0.42 && az < hw * 0.97) return HEAD;
      if (p.y > yt - 0.24 && p.y < yt - 0.17 && az > hw * 0.68) return p.z < 0 ? AMB_L : AMB_R;
      if (p.y > yt - 0.32 && p.y < yt - 0.1 && az < hw * 0.4) return GRILLE;
      if (p.y < yb + 0.26 && az < hw * 0.72) return GRILLE;
      if (p.y > yb + 0.3 && p.y < yb + 0.42 && az < 0.27 && n.x > 0.7) return PLATE;
    }
    // The tail: lamps, reverse lamps, the plate and the diffuser.
    if (p.x < -L2 + 0.45 && n.x < -0.2) {
      if (p.y > yt - 0.19 && p.y < yt - 0.03 && az > hw * 0.38) return az < hw * 0.52 ? REV : TAIL;
      if (p.y > yb + 0.32 && p.y < yb + 0.46 && az < 0.27 && n.x < -0.7) return PLATE;
      if (p.y < yb + 0.22) return GRILLE;
    }
    // The checker band down each side.
    if (livery && Math.abs(n.z) > 0.55 && p.y > band0 && p.y < band1 && p.x > -L2 + 0.25 && p.x < L2 - 0.35) return LIVERY_S;
    if (b.tray !== undefined && p.x < b.tray && n.y > 0.75) return TONNEAU;
    return PAINT;
  });
  // --- The glasshouse.
  const roofPts: [number, number][] = [
    [cab.rb, shoulder(cab.rb)],
    [(cab.rb * 0.55 + cab.rt * 0.45), shoulder(cab.rb) * 0.42 + cab.roof * 0.58 - 0.01],
    [cab.rt, cab.roof - 0.025],
    [(cab.rt + cab.wt) / 2, cab.roof],
    [cab.wt, cab.roof - 0.015],
    [(cab.wt * 0.5 + cab.wb * 0.5), shoulder(cab.wb) * 0.5 + cab.roof * 0.5 + 0.015],
    [cab.wb, shoulder(cab.wb)],
  ];
  const gxs: number[] = [];
  const NG = hi ? 28 : 14;
  for (let i = 0; i <= NG; i++) gxs.push(cab.rb + ((cab.wb - cab.rb) * (1 - Math.cos((Math.PI * i) / NG))) / 2);
  const K = hi ? 16 : 10;
  const A = 0.3;
  const grows: THREE.Vector3[][] = [];
  for (const x of gxs) {
    const belt = shoulder(x) - 0.004;
    const top = Math.max(belt, spline(roofPts, x));
    const wb = halfWidth(b, x) * (b.box ? 0.99 : 0.9);
    const wr = wb * (1 - cab.tumble);
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= K; j++) {
      const s = j / K;
      let y: number;
      let z: number;
      if (s < A || s > 1 - A) {
        const k = s < A ? s / A : (1 - s) / A;
        const kk = 1 - Math.pow(1 - k, 1.6);
        y = belt + (top - cab.crown * 0.6 - belt) * kk;
        z = (wb + (wr - wb) * kk + 0.025 * Math.sin(k * Math.PI)) * (s < A ? -1 : 1);
      } else {
        const k = (s - A) / (1 - 2 * A);
        const u = 2 * k - 1;
        y = top - cab.crown * 0.6 + cab.crown * (1 - u * u);
        z = wr * sgnPow(u, 0.75) * 0.985;
      }
      row.push(new THREE.Vector3(x, y, z));
    }
    grows.push(row);
  }
  const xB = (cab.wt + cab.rt) / 2 + (cab.wb - cab.wt) * 0.1;
  loft(out, grows, false, (p, _n, _i, j) => {
    const s = (j + 0.5) / K;
    const side = s < A || s > 1 - A;
    const edge = Math.min(Math.abs(s - A), Math.abs(s - (1 - A)));
    if (s < 0.03 || s > 0.97) return RUBBER;
    if (p.x <= cab.rt) {
      // The rear window (or hatch glass) with its C-pillars.
      if (edge < 0.07 || (side && p.x > cab.rt - cab.cPillar - 0.4)) return PAINT;
      if (side) return cab.cPillar > 0.2 ? PAINT : GLASS;
      return GLASS;
    }
    if (p.x >= cab.wt) {
      // The windscreen and its A-pillars.
      if (edge < 0.035) return PAINT;
      return GLASS;
    }
    if (!side || edge < 0.025) return PAINT;
    if (cab.glassFrom !== undefined && p.x < cab.glassFrom) return PAINT;
    if (p.x < cab.rt + cab.cPillar) return PAINT;
    if (Math.abs(p.x - xB) < 0.055 && !b.box) return RUBBER;
    return GLASS;
  }, true);
  // --- Details: mirrors, door handles, exhaust, the bar and grille strobes.
  const rb = (w: number, h: number, d: number, x: number, y: number, z: number, s: Surf) => out.geo(new THREE.BoxGeometry(w, h, d).translate(x, y, z), s);
  const mx = cab.wb - 0.12;
  const my = shoulder(mx) + 0.1;
  for (const sz of [-1, 1]) {
    out.geo(new THREE.SphereGeometry(0.1, hi ? 10 : 6, hi ? 6 : 4).scale(0.9, 0.7, 1.15).translate(mx, my, sz * (halfWidth(b, mx) + 0.1)), PAINT);
    rb(0.05, 0.05, 0.1, mx + 0.04, my - 0.02, sz * (halfWidth(b, mx) + 0.03), RUBBER);
    if (hi && !b.box)
      for (const hx of [xB + 0.35, xB - 0.55]) {
        const hy = shoulder(hx) - 0.1;
        rb(0.16, 0.03, 0.025, hx, hy, sz * (halfWidth(b, hx) * 0.985 + 0.005), CHROME);
      }
  }
  if (hi) out.geo(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8).rotateZ(Math.PI / 2).translate(-L2 - 0.01, sill(b, -L2 + 0.2) + 0.03, halfWidth(b, -L2 + 0.4) * 0.55), CHROME);
  if (bar) {
    const bx = (cab.rt + cab.wt) / 2 + 0.1;
    const by = cab.roof + cab.crown * 0.4;
    const bw = halfWidth(b, bx) * (1 - cab.tumble) * 1.7;
    rb(0.36, 0.06, bw, bx, by + 0.03, 0, RUBBER);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const z = -bw / 2 + ((i + 0.5) * bw) / n;
      out.geo(new THREE.BoxGeometry(0.3, 0.075, bw / n - 0.02).translate(bx, by + 0.095, z), z < 0 ? RED : bar === "ems" && i % 2 ? HEAD : BLUE);
    }
    // Grille strobes and the rear deck pair.
    for (const sz of [-1, 1]) {
      rb(0.03, 0.045, 0.14, L2 - 0.02, shoulder(L2 - 0.1) - 0.22, sz * 0.24, sz < 0 ? RED : BLUE);
      if (!b.box) rb(0.04, 0.04, 0.22, cab.rb + 0.05, shoulder(cab.rb) + 0.03, sz * 0.32, sz < 0 ? RED : BLUE);
    }
  }
  void livery;
  return out.build();
}

const bodyCache = new Map<string, THREE.BufferGeometry>();
function bodyFor(kind: BodyKind, hi: boolean, livery: Livery, bar: "police" | "ems" | null) {
  const key = `${kind}|${hi}|${livery ? 1 : 0}|${bar}`;
  let g = bodyCache.get(key);
  if (!g) {
    g = bodyGeometry(kind, hi, livery, bar);
    bodyCache.set(key, g);
  }
  return g;
}

/* ------------------------------------------------------------------------- the shader */

function surfaceShader(sh: THREE.WebGLProgramParametersWithUniforms, u: Record<string, THREE.IUniform>, body: boolean) {
  Object.assign(sh.uniforms, u);
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec4 aSurf;\nvarying vec4 vSurf;\nvarying vec3 vLocal;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSurf = aSurf;\nvLocal = position;");
  let fs = sh.fragmentShader.replace(
    "#include <common>",
    `#include <common>
varying vec4 vSurf;
varying vec3 vLocal;
${body ? `uniform vec3 uPaint;\nuniform vec3 uLivA;\nuniform vec3 uLivB;\nuniform float uLamp[${NLAMP}];\nuniform vec3 uLampCol[${NLAMP}];\nuniform float uWreck;` : ""}`,
  );
  if (body)
    fs = fs.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
int code = int(vSurf.w + 0.5);
if (code == 1) diffuseColor.rgb *= uPaint;
else if (code == 2) {
  // Two rows of squares along the side (Victoria's blue-and-white chequer).
  float cx = floor(vLocal.x / 0.13);
  float cy = floor(vLocal.y / 0.1);
  diffuseColor.rgb = mod(cx + cy, 2.0) < 0.5 ? uLivA : uLivB;
}
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03), uWreck);`,
    );
  fs = fs
    .replace("float roughnessFactor = roughness;", "float roughnessFactor = mix(vSurf.y, 0.9, " + (body ? "uWreck" : "0.0") + ");")
    .replace("float metalnessFactor = metalness;", "float metalnessFactor = vSurf.x;")
    .replace("material.clearcoat = clearcoat;", "material.clearcoat = vSurf.z * (1.0 - " + (body ? "uWreck" : "0.0") + ");");
  if (body)
    fs = fs.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
{
  int li = int(vSurf.w + 0.5) - 10;
  for (int k = 0; k < ${NLAMP}; k++) if (k == li) totalEmissiveRadiance += uLampCol[k] * uLamp[k] * (1.0 - uWreck);
}`,
    );
  sh.fragmentShader = fs;
}

export interface HwCar {
  group: THREE.Group;
  body: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  /** Lamp intensities by `LAMP` slot (write, then they show next frame). */
  lamps: number[];
  /** Wheel pivots (front-left, front-right, rear-left, rear-right); each has a spin child, then a mount. */
  wheels: THREE.Group[];
  wheelKey: string;
  wheelR: number;
  headGlow: THREE.Sprite[];
  tailGlow: THREE.Sprite[];
  redGlow?: THREE.Sprite[];
  blueGlow?: THREE.Sprite[];
  beam: THREE.Mesh;
  wreck(): void;
  /** Swap to the lighter body far off (cars built in detail only). */
  setNear(near: boolean): void;
}

function sprite(color: string, size: number, x: number, y: number, z: number) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  s.position.set(x, y, z);
  s.renderOrder = 5;
  s.visible = false;
  return s;
}

let beamTex: THREE.Texture | null = null;
function beamTexture() {
  if (beamTex) return beamTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 96, 4, 64, 60, 70);
  gr.addColorStop(0, "rgba(255,245,220,0.9)");
  gr.addColorStop(0.5, "rgba(255,240,210,0.35)");
  gr.addColorStop(1, "rgba(255,240,210,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}

const LIVERY_COLORS: Record<number, [string, string, string]> = {
  [LIVERY.police]: ["#f3f5f7", "#14306f", "#f3f5f7"],
  [LIVERY.ambulance]: ["#f3f5f7", "#c8102e", "#f3f5f7"],
  [LIVERY.response]: ["#1b2333", "#14306f", "#f3f5f7"],
};

/**
 * One car. `livery` paints it as a Victoria Police car (white, blue-and-white chequer), an
 * ambulance (red chequer) or a Critical Response van (dark, with the chequer); `bar` adds the
 * light bar and strobes.
 */
export function buildHwCar(kind: BodyKind, color: string, hi: boolean, livery: Livery = LIVERY.none, bar: "police" | "ems" | null = null): HwCar {
  const b = BODIES[kind];
  const geo = bodyFor(kind, hi, livery, bar);
  const lamps = new Array(NLAMP).fill(0);
  const paintCol = livery ? LIVERY_COLORS[livery][0] : color;
  const uniforms: Record<string, THREE.IUniform> = {
    uPaint: { value: new THREE.Color(paintCol) },
    uLivA: { value: new THREE.Color(livery ? LIVERY_COLORS[livery][1] : "#000") },
    uLivB: { value: new THREE.Color(livery ? LIVERY_COLORS[livery][2] : "#fff") },
    uLamp: { value: lamps },
    uLampCol: { value: LAMP_COLORS.map((c) => new THREE.Color(c)) },
    uWreck: { value: 0 },
  };
  const mat = hi ? new THREE.MeshPhysicalMaterial({ vertexColors: true, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.15 }) : new THREE.MeshStandardMaterial({ vertexColors: true, envMapIntensity: 1.1 });
  mat.onBeforeCompile = (sh) => surfaceShader(sh, uniforms, true);
  mat.customProgramCacheKey = () => `hwcar|${hi}`;
  const group = new THREE.Group();
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // Wheel pivots.
  const wheels: THREE.Group[] = [];
  const tw = Math.min(0.3, b.W * 0.13);
  for (const [wx, sz] of [
    [b.axF, -1],
    [b.axF, 1],
    [b.axR, -1],
    [b.axR, 1],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, b.r, sz * (halfWidth(b, wx) - tw / 2 - 0.035));
    const spin = new THREE.Group();
    const mount = new THREE.Group();
    if (sz < 0) mount.rotation.y = Math.PI;
    spin.add(mount);
    pivot.add(spin);
    group.add(pivot);
    wheels.push(pivot);
  }
  const L2 = b.L / 2;
  const hy = spline(b.shoulder, L2 - 0.2) - 0.1;
  const ty = spline(b.shoulder, -L2 + 0.2) - 0.11;
  const hz = halfWidth(b, L2 - 0.3) * 0.7;
  const headGlow = [sprite("#fff1d6", 1.1, L2 + 0.08, hy, hz), sprite("#fff1d6", 1.1, L2 + 0.08, hy, -hz)];
  const tailGlow = [sprite("#ff2020", 0.7, -L2 - 0.06, ty, hz), sprite("#ff2020", 0.7, -L2 - 0.06, ty, -hz)];
  group.add(...headGlow, ...tailGlow);
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 7).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(L2 + 6.5, 0.05, 0),
    new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
  );
  beam.renderOrder = 2;
  beam.visible = false;
  group.add(beam);
  const car: HwCar = {
    group,
    body,
    mat,
    lamps,
    wheels,
    wheelKey: `${b.r.toFixed(3)}|${tw.toFixed(3)}|${b.rim}|${hi}`,
    wheelR: b.r,
    headGlow,
    tailGlow,
    beam,
    wreck: () => (uniforms.uWreck.value = 0.85),
    setNear: (near) => {
      if (!hi) return;
      const want = near ? geo : bodyFor(kind, false, livery, bar);
      if (body.geometry !== want) body.geometry = want;
    },
  };
  if (bar) {
    const c = b.cabin;
    const bx = (c.rt + c.wt) / 2 + 0.1;
    const by = c.roof + 0.14;
    car.redGlow = [sprite("#ff2030", 1.6, bx, by, -0.4), sprite("#ff2030", 0.8, L2 + 0.08, hy - 0.12, -0.24)];
    car.blueGlow = [sprite(bar === "ems" ? "#ffffff" : "#2a5cff", 1.6, bx, by, 0.4), sprite(bar === "ems" ? "#ffffff" : "#2a5cff", 0.8, L2 + 0.08, hy - 0.12, 0.24)];
    group.add(...car.redGlow, ...car.blueGlow);
  }
  if (livery === LIVERY.police || livery === LIVERY.response || livery === LIVERY.ambulance) group.add(...lettering(b, livery));
  return car;
}

/* ------------------------------------------------------------------------- lettering */

const words = new Map<string, THREE.MeshBasicMaterial>();
function word(text: string, color: string) {
  const key = text + color;
  let m = words.get(key);
  if (m) return m;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.font = "bold 76px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  words.set(key, m);
  return m;
}

function lettering(b: Body, livery: Livery) {
  const text = livery === LIVERY.ambulance ? "AMBULANCE" : "POLICE";
  const col = livery === LIVERY.ambulance ? "#c8102e" : livery === LIVERY.response ? "#f3f5f7" : "#14306f";
  const mat = word(text, col);
  const out: THREE.Mesh[] = [];
  const y = b.clear + (spline(b.shoulder, 0) - b.clear) * 0.82;
  const x = b.box ? -b.L * 0.12 : -b.L * 0.06;
  for (const sz of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.box ? 2.2 : 1.3, b.box ? 0.4 : 0.24), mat);
    m.position.set(x, b.box ? y + 0.5 : y, sz * (halfWidth(b, x) + 0.012));
    if (sz < 0) m.rotation.y = Math.PI;
    out.push(m);
  }
  return out;
}

/* ------------------------------------------------------------------------- wheels */

function wheelGeometry(r: number, tw: number, rim: Body["rim"], hi: boolean) {
  const out = new Builder();
  const seg = hi ? 22 : 12;
  // The tyre: a rounded sidewall turned round the axle (z).
  const prof = [
    [r * 0.7, -tw / 2],
    [r * 0.9, -tw / 2],
    [r * 0.975, -tw * 0.42],
    [r, -tw * 0.22],
    [r, tw * 0.22],
    [r * 0.975, tw * 0.42],
    [r * 0.9, tw / 2],
    [r * 0.7, tw / 2],
  ].map(([a, y]) => new THREE.Vector2(a, y));
  out.geo(new THREE.LatheGeometry(prof, seg).rotateX(Math.PI / 2), { ...RUBBER, rough: 0.85 });
  const face = tw / 2 - 0.015;
  const metal: Surf = rim === "steel" ? { color: "#2b2e33", metal: 0.6, rough: 0.45, coat: 0, code: 0 } : { color: "#c4c8cd", metal: 0.95, rough: 0.22, coat: 0, code: 0 };
  // The rim's barrel, its face, the spokes and the hub; the brake disc behind.
  out.geo(new THREE.CylinderGeometry(r * 0.7, r * 0.7, tw * 0.9, seg, 1, true).rotateX(Math.PI / 2), { ...metal, color: "#3a3d42" });
  out.geo(new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.02, seg).rotateX(Math.PI / 2).translate(0, 0, -0.02), { color: "#6f7175", metal: 0.8, rough: 0.5, coat: 0, code: 0 });
  out.geo(new THREE.TorusGeometry(r * 0.66, 0.018, 4, seg).translate(0, 0, face), metal);
  const spokes = rim === "sport" ? 10 : rim === "steel" ? 0 : 5;
  if (spokes)
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2;
      out.geo(new THREE.BoxGeometry(rim === "sport" ? 0.035 : 0.07, r * 0.56, 0.03).translate(0, r * 0.36, face).rotateZ(a), metal);
    }
  else out.geo(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.02, seg).rotateX(Math.PI / 2).translate(0, 0, face - 0.01), metal);
  out.geo(new THREE.CylinderGeometry(r * 0.13, r * 0.15, 0.05, 10).rotateX(Math.PI / 2).translate(0, 0, face + 0.01), { ...metal, color: rim === "steel" ? "#b9bdc2" : "#9ea3a8" });
  return out.build();
}

/** Every car's wheels, one instanced draw per wheel size. */
export class WheelBatch {
  private sets = new Map<string, { mesh: THREE.InstancedMesh; n: number }>();
  private mat: THREE.MeshStandardMaterial;
  constructor(
    private scene: THREE.Scene,
    private shadows: boolean,
  ) {
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, envMapIntensity: 0.9 });
    this.mat.onBeforeCompile = (sh) => surfaceShader(sh, {}, false);
    this.mat.customProgramCacheKey = () => "hwwheel";
  }
  begin() {
    for (const s of this.sets.values()) s.n = 0;
  }
  add(car: HwCar) {
    let set = this.sets.get(car.wheelKey);
    if (!set) {
      const [r, tw, rim, hi] = car.wheelKey.split("|");
      const mesh = new THREE.InstancedMesh(wheelGeometry(+r, +tw, rim as Body["rim"], hi === "true"), this.mat, 256);
      mesh.frustumCulled = false;
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = true;
      mesh.count = 0;
      this.scene.add(mesh);
      set = { mesh, n: 0 };
      this.sets.set(car.wheelKey, set);
    }
    for (const w of car.wheels) {
      if (set.n >= 256) return;
      const mount = w.children[0].children[0];
      mount.updateWorldMatrix(true, false);
      set.mesh.setMatrixAt(set.n++, mount.matrixWorld);
    }
  }
  end() {
    for (const s of this.sets.values()) {
      s.mesh.count = s.n;
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  dispose() {
    for (const s of this.sets.values()) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.mat.dispose();
  }
}
