import { ellipseK, heightAt, holesOf, lieAt, normalAt, pathInfo, pointAlong, rng, type Course, type Hole, type Lie, type V2 } from "./course";

/**
 * Fairway's rules and physics. A shot is a real ball flight (drag and Magnus
 * lift from backspin, the spin axis tilted by a mis-hit so it curves, wind)
 * that lands on the hole's ground, bounces and rolls by the lie (greens fast,
 * rough grabby, sand dead) and the slope, and drops if it finds the cup.
 *
 * The swing is the classic three-press meter: start, set the power on the way
 * up, then stop it on the snap line on the way back. Off the line early fades
 * or slices it; late draws or hooks it.
 */

export const G = 9.81;
export const BALL_R = 0.02135;
export const CUP_R = 0.054;
const K_AIR = (0.5 * 1.2 * Math.PI * BALL_R * BALL_R) / 0.0459;

export interface Club {
  id: string;
  name: string;
  /** Head speed → ball speed at full power (m/s). */
  speed: number;
  /** Launch angle (degrees). */
  launch: number;
  /** Backspin (rpm). */
  spin: number;
  putter?: boolean;
  wedge?: boolean;
}

export const CLUBS: Club[] = [
  { id: "dr", name: "Driver", speed: 70, launch: 11.5, spin: 2600 },
  { id: "3w", name: "3 Wood", speed: 65, launch: 12.5, spin: 3400 },
  { id: "hy", name: "Hybrid", speed: 60, launch: 14, spin: 4100 },
  { id: "4i", name: "4 Iron", speed: 57, launch: 14.5, spin: 4600 },
  { id: "5i", name: "5 Iron", speed: 54.5, launch: 16, spin: 5200 },
  { id: "6i", name: "6 Iron", speed: 52, launch: 17.5, spin: 5900 },
  { id: "7i", name: "7 Iron", speed: 49.5, launch: 19.5, spin: 6600 },
  { id: "8i", name: "8 Iron", speed: 47, launch: 22, spin: 7400 },
  { id: "9i", name: "9 Iron", speed: 44.5, launch: 25, spin: 8200 },
  { id: "pw", name: "Pitching Wedge", speed: 42, launch: 28.5, spin: 8900, wedge: true },
  { id: "gw", name: "Gap Wedge", speed: 39, launch: 32, spin: 9400, wedge: true },
  { id: "sw", name: "Sand Wedge", speed: 36, launch: 36, spin: 9800, wedge: true },
  { id: "lw", name: "Lob Wedge", speed: 32, launch: 41, spin: 10000, wedge: true },
  { id: "pt", name: "Putter", speed: 0, launch: 0, spin: 0, putter: true },
];
export const PUTTER = CLUBS.length - 1;

export type Difficulty = "amateur" | "pro" | "tour";
export const LEVELS: Record<Difficulty, { name: string; meter: number; error: number; wind: number; field: number }> = {
  amateur: { name: "Amateur", meter: 0.75, error: 0.6, wind: 0.6, field: -0.25 },
  pro: { name: "Pro", meter: 1, error: 1, wind: 1, field: 0 },
  tour: { name: "Tour", meter: 1.3, error: 1.35, wind: 1.3, field: 0.25 },
};

/** How each lie treats a ball: bounce, friction when rolling, spin bite, and what it costs a shot from it. */
export const LIES: Record<Lie, { name: string; bounce: number; roll: number; bite: number; dist: number; spin: number }> = {
  tee: { name: "Tee", bounce: 0.38, roll: 0.16, bite: 0.2, dist: 1, spin: 1 },
  fairway: { name: "Fairway", bounce: 0.36, roll: 0.17, bite: 0.22, dist: 1, spin: 1 },
  fringe: { name: "Fringe", bounce: 0.32, roll: 0.12, bite: 0.3, dist: 1, spin: 0.9 },
  green: { name: "Green", bounce: 0.3, roll: 0.057, bite: 0.38, dist: 1, spin: 1 },
  rough: { name: "Rough", bounce: 0.2, roll: 0.42, bite: 0.06, dist: 0.86, spin: 0.55 },
  deep: { name: "Deep rough", bounce: 0.12, roll: 0.75, bite: 0.03, dist: 0.7, spin: 0.35 },
  bunker: { name: "Bunker", bounce: 0.04, roll: 2.5, bite: 0, dist: 0.62, spin: 0.5 },
  water: { name: "Water", bounce: 0, roll: 9, bite: 0, dist: 0, spin: 0 },
  ob: { name: "Out of bounds", bounce: 0.2, roll: 0.5, bite: 0, dist: 0, spin: 0 },
};

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Ball {
  p: V3;
  v: V3;
  /** Backspin (rad/s). */
  spin: number;
  /** Spin axis tilt (rad): + curves right. */
  tilt: number;
  state: "rest" | "flight" | "roll";
  /** Flight time this shot (s). */
  t: number;
  bounces: number;
  holed: boolean;
}

export type Phase = "aim" | "swing" | "flight" | "settle" | "holed" | "card" | "over";
export type Mode = "stroke" | "ctp";

export type GolfEvent =
  | { kind: "hole"; n: number; par: number; length: number }
  | { kind: "meter"; stage: number }
  | { kind: "strike"; club: string; speed: number; pure: boolean; putt: boolean }
  | { kind: "land"; lie: Lie; carry: number }
  | { kind: "bounce"; lie: Lie; speed: number }
  | { kind: "tree" }
  | { kind: "lip" }
  | { kind: "splash" }
  | { kind: "rest"; lie: Lie; carry: number; total: number; toPin: number }
  | { kind: "penalty"; why: string }
  | { kind: "holed"; strokes: number; par: number; call: string; length: number }
  | { kind: "ctp"; ball: number; dist: number; points: number }
  | { kind: "over"; won: boolean };

export interface Pro {
  name: string;
  skill: number;
  /** Strokes per hole played. */
  card: number[];
  you?: boolean;
}

export interface GolfInput {
  /** -1 left / 1 right (held). */
  aim: number;
  /** Club change this frame (-1 longer / 1 shorter). */
  club: number;
  press: boolean;
}

export const FIELD_NAMES = ["Rory Pentland", "Mika Saarinen", "Tomás Arbeloa", "Jae-won Kim", "Callum Breck", "Ana Lucía Prado", "Hugo Lindqvist", "Dev Ramaswamy", "Brodie McKay", "Kenta Ishida", "Lars Østby"];

export const callFor = (strokes: number, par: number) => {
  if (strokes === 1) return "Hole in one!";
  const d = strokes - par;
  return d <= -3 ? "Albatross!" : d === -2 ? "Eagle!" : d === -1 ? "Birdie" : d === 0 ? "Par" : d === 1 ? "Bogey" : d === 2 ? "Double bogey" : `${d > 0 ? "+" : ""}${d}`;
};
/** Stableford points for a hole. */
export const stableford = (strokes: number, par: number) => Math.max(0, 2 + par - strokes);

const len = (v: V3) => Math.hypot(v.x, v.y, v.z);

/**
 * One shot's flight on a given hole, stepped by `step`. Pure enough to
 * test alone: start it with `launch` and keep calling `step` until rest.
 */
export class BallPhysics {
  ball: Ball = { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, spin: 0, tilt: 0, state: "rest", t: 0, bounces: 0, holed: false };
  wind: V2 = { x: 0, z: 0 };
  events: GolfEvent[] = [];
  /** Where the first bounce was (carry). */
  landed: V3 | null = null;
  /** The last point the ball was in the air over dry ground (for a water drop). */
  lastDry: V3 | null = null;
  private rand: () => number;

  constructor(
    public hole: Hole,
    seed = 1,
  ) {
    this.rand = rng(seed);
  }

  place(x: number, z: number) {
    const b = this.ball;
    b.p = { x, y: heightAt(this.hole, x, z) + BALL_R, z };
    b.v = { x: 0, y: 0, z: 0 };
    b.state = "rest";
    b.holed = false;
    b.t = 0;
    b.bounces = 0;
    this.landed = null;
    this.lastDry = null;
  }

  /** Strike: speed (m/s), heading (rad, 0 = +z), launch (rad), backspin (rad/s), tilt. */
  launch(speed: number, heading: number, launch: number, spin: number, tilt: number) {
    const b = this.ball;
    const c = Math.cos(launch);
    b.v = { x: Math.sin(heading) * c * speed, y: Math.sin(launch) * speed, z: Math.cos(heading) * c * speed };
    b.spin = spin;
    b.tilt = tilt;
    b.state = "flight";
    b.t = 0;
    b.bounces = 0;
    b.holed = false;
    this.landed = null;
    this.lastDry = { ...b.p };
  }

  /** A putt (or bump and run along the ground). */
  roll(speed: number, heading: number) {
    const b = this.ball;
    b.v = { x: Math.sin(heading) * speed, y: 0, z: Math.cos(heading) * speed };
    b.spin = 0;
    b.tilt = 0;
    b.state = "roll";
    b.t = 0;
    b.holed = false;
    this.landed = { ...b.p };
  }

  /** Advance `dt` seconds in fixed substeps. Returns true while the ball moves. */
  step(dt: number) {
    const b = this.ball;
    if (b.state === "rest") return false;
    const n = Math.max(1, Math.ceil(dt / (1 / 180)));
    const h = dt / n;
    const moving = () => b.state !== "rest";
    for (let i = 0; i < n && moving(); i++) {
      if (b.state === "flight") this.fly(h);
      else this.rollStep(h);
      b.t += h;
      if (b.t > 40) this.stop();
    }
    return moving();
  }

  private stop() {
    const b = this.ball;
    b.state = "rest";
    b.v = { x: 0, y: 0, z: 0 };
  }

  private fly(h: number) {
    const b = this.ball;
    const hole = this.hole;
    const ground = heightAt(hole, b.p.x, b.p.z);
    // Wind grows with height above the ground.
    const wk = Math.min(1, Math.max(0.25, (b.p.y - ground) / 12));
    const ax = b.v.x - this.wind.x * wk;
    const ay = b.v.y;
    const az = b.v.z - this.wind.z * wk;
    const sp = Math.hypot(ax, ay, az) || 1e-6;
    const S = (BALL_R * b.spin) / sp;
    const cd = 0.23 + 0.32 * Math.min(0.3, S);
    const cl = Math.min(0.3, 1.7 * S);
    // Lift: perpendicular to the air flow, rolled by the tilt.
    const hx = ax / sp;
    const hy = ay / sp;
    const hz = az / sp;
    // right = v × up
    let rx = -hz;
    let rz = hx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    // up' = right × v
    const ux = -rz * hy;
    const uy = rz * hx - rx * hz;
    const uz = rx * hy;
    const ct = Math.cos(b.tilt);
    const st = Math.sin(b.tilt);
    const lx = ux * ct + rx * st;
    const ly = uy * ct;
    const lz = uz * ct + rz * st;
    const drag = K_AIR * cd * sp;
    const lift = K_AIR * cl * sp * sp;
    b.v.x += (-drag * ax + lift * lx) * h;
    b.v.y += (-drag * ay + lift * ly - G) * h;
    b.v.z += (-drag * az + lift * lz) * h;
    b.spin *= Math.exp(-h / 22);
    const px = b.p.x;
    const pz = b.p.z;
    b.p.x += b.v.x * h;
    b.p.y += b.v.y * h;
    b.p.z += b.v.z * h;
    this.trees(px, pz);
    if (lieAt(hole, b.p.x, b.p.z) !== "water") this.lastDry = { ...b.p };
    // Straight in the cup on the full.
    if (b.v.y < 0 && Math.hypot(b.p.x - hole.pin.x, b.p.z - hole.pin.z) < CUP_R + BALL_R * 0.5 && b.p.y - heightAt(hole, hole.pin.x, hole.pin.z) < 0.08) {
      this.landed ??= { ...b.p };
      this.drop();
      return;
    }
    const gy = heightAt(hole, b.p.x, b.p.z);
    if (b.p.y - BALL_R <= gy) this.bounce(gy);
  }

  private trees(px: number, pz: number) {
    const b = this.ball;
    for (const t of this.hole.trees) {
      const dx = b.p.x - t.x;
      const dz = b.p.z - t.z;
      if (Math.abs(dx) > t.r + 1 || Math.abs(dz) > t.r + 1) continue;
      const base = heightAt(this.hole, t.x, t.z);
      const y = b.p.y - base;
      const trunkTop = t.h * 0.45;
      if (y < trunkTop && Math.hypot(dx, dz) < 0.35) {
        // Off the trunk.
        b.p.x = px;
        b.p.z = pz;
        b.v.x *= -0.4;
        b.v.z *= -0.4;
        this.events.push({ kind: "tree" });
        return;
      }
      const cy = t.h * 0.68;
      const ry = t.h * 0.36;
      const k = Math.hypot(dx / t.r, (y - cy) / ry, dz / t.r);
      if (k < 1 && this.rand() < 0.06) {
        // Clipped the leaves: knocked down and about.
        const keep = 0.25 + this.rand() * 0.3;
        b.v.x = b.v.x * keep + (this.rand() - 0.5) * 3;
        b.v.z = b.v.z * keep + (this.rand() - 0.5) * 3;
        b.v.y = Math.min(b.v.y, 0) * keep;
        b.spin *= 0.3;
        this.events.push({ kind: "tree" });
        return;
      }
    }
  }

  private bounce(gy: number) {
    const b = this.ball;
    const hole = this.hole;
    const lie = lieAt(hole, b.p.x, b.p.z);
    if (!this.landed) {
      this.landed = { ...b.p };
      this.events.push({ kind: "land", lie, carry: 0 });
    }
    if (lie === "water") {
      this.events.push({ kind: "splash" });
      this.stop();
      return;
    }
    const L = LIES[lie];
    const [nx, ny, nz] = normalAt(hole, b.p.x, b.p.z);
    const vn = b.v.x * nx + b.v.y * ny + b.v.z * nz;
    let tx = b.v.x - vn * nx;
    let ty = b.v.y - vn * ny;
    let tz = b.v.z - vn * nz;
    const ts = Math.hypot(tx, ty, tz) || 1e-6;
    // Friction at impact, plus backspin biting (a high wedge can check or zip back).
    const bite = Math.min(ts * 1.25, b.spin * BALL_R * L.bite * (b.bounces === 0 ? 1 : 0.4));
    const keep = Math.max(-0.35, (ts * (1 - 0.18 - (1 - L.bounce) * 0.25) - bite) / ts);
    tx *= keep;
    ty *= keep;
    tz *= keep;
    const out = -vn * L.bounce;
    b.v.x = tx + nx * out;
    b.v.y = ty + ny * out;
    b.v.z = tz + nz * out;
    b.spin *= 0.45;
    b.p.y = gy + BALL_R;
    b.bounces++;
    this.events.push({ kind: "bounce", lie, speed: -vn });
    if (out < 0.7 || lie === "bunker") {
      b.state = "roll";
      b.v.y = 0;
    }
  }

  private rollStep(h: number) {
    const b = this.ball;
    const hole = this.hole;
    const lie = lieAt(hole, b.p.x, b.p.z);
    if (lie === "water") {
      this.events.push({ kind: "splash" });
      this.stop();
      return;
    }
    const L = LIES[lie];
    const [nx, ny, nz] = normalAt(hole, b.p.x, b.p.z);
    // Gravity along the slope.
    const gx = -G * ny * nx;
    const gz = -G * ny * nz;
    const sp = Math.hypot(b.v.x, b.v.z);
    const fr = L.roll * G * ny;
    if (sp < 0.03) {
      if (Math.hypot(gx, gz) < fr * 1.25) {
        this.stop();
        this.settle();
        return;
      }
      b.v.x += gx * h;
      b.v.z += gz * h;
    } else {
      const dec = Math.min(sp / h, fr);
      b.v.x += (gx - (b.v.x / sp) * dec) * h;
      b.v.z += (gz - (b.v.z / sp) * dec) * h;
    }
    b.p.x += b.v.x * h;
    b.p.z += b.v.z * h;
    b.p.y = heightAt(hole, b.p.x, b.p.z) + BALL_R;
    // The cup.
    // A slow ball whose centre crosses the cup, or catches its edge, can drop.
    const d = Math.hypot(b.p.x - hole.pin.x, b.p.z - hole.pin.z);
    const R = CUP_R + BALL_R * 0.4;
    if (d < R) {
      const s = Math.hypot(b.v.x, b.v.z);
      const capture = 1.35 * (1 - (d / R) ** 2 * 0.6);
      if (s < capture) this.drop();
      else if (s < capture + 0.6 && !b.holed) {
        // Lipped out: turned away round the cup.
        const ang = (d / R) * 0.9 * (this.rand() < 0.5 ? -1 : 1);
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const vx = b.v.x * c - b.v.z * sn;
        const vz = b.v.x * sn + b.v.z * c;
        b.v.x = vx * 0.6;
        b.v.z = vz * 0.6;
        b.p.x = hole.pin.x + ((b.p.x - hole.pin.x) / (d || 1)) * R * 1.05;
        b.p.z = hole.pin.z + ((b.p.z - hole.pin.z) / (d || 1)) * R * 1.05;
        this.events.push({ kind: "lip" });
      }
    }
  }

  private settle() {
    const b = this.ball;
    b.p.y = heightAt(this.hole, b.p.x, b.p.z) + BALL_R;
  }

  private drop() {
    const b = this.ball;
    const hole = this.hole;
    b.holed = true;
    b.p = { x: hole.pin.x, y: heightAt(hole, hole.pin.x, hole.pin.z) - 0.06, z: hole.pin.z };
    this.stop();
  }
}

/** Carry (and total) for a club at a power on flat, calm ground: the yardage book. */
const flat: Hole = {
  n: 0,
  par: 4,
  style: "parkland",
  seed: 1,
  tee: { x: 0, z: 0 },
  path: [
    { x: 0, z: 0 },
    { x: 0, z: 1000 },
  ],
  along: [0, 1000],
  green: { x: 0, z: 5000, rx: 1, rz: 1, rot: 0 },
  pin: { x: 0, z: 5000 },
  fairwayW: 400,
  bunkers: [],
  ponds: [],
  trees: [],
  slope: { x: 0, z: 0 },
  greenY: 0,
  teeY: 0,
  hills: 0,
  length: 1000,
  bounds: { x0: -1000, x1: 1000, z0: -100, z1: 6000 },
  sea: 0,
};
const book = new Map<string, { carry: number; total: number }>();
export function yardage(club: Club, power = 1) {
  const key = `${club.id}:${power.toFixed(2)}`;
  const hit = book.get(key);
  if (hit) return hit;
  // A wide, dead flat fairway: no hills, no tee pad, nothing to shape.
  const ph = new BallPhysics(flat, 1);
  ph.place(0, 0);
  ph.ball.p.y = BALL_R;
  const s = shotParams(club, power, 0, "fairway");
  ph.launch(s.speed, 0, s.launch, s.spin, 0);
  let carry = 0;
  for (let i = 0; i < 4000 && ph.ball.state !== "rest"; i++) {
    ph.step(1 / 60);
    if (!carry && ph.landed) carry = ph.landed.z;
  }
  const r = { carry: carry || ph.ball.p.z, total: ph.ball.p.z };
  book.set(key, r);
  return r;
}

/** Ball speed, launch and spin for a club, power (0–1.1) and accuracy error, from a lie. */
export function shotParams(club: Club, power: number, err: number, lie: Lie) {
  const L = LIES[lie];
  // Sand: wedges splash it out; anything else digs in.
  const dist = lie === "bunker" ? (club.wedge ? 0.8 : 0.55) : L.dist;
  const p = Math.max(0.05, power);
  const speed = club.speed * (0.32 + 0.68 * Math.min(1, p) + Math.max(0, p - 1) * 0.5) * dist * (1 - Math.min(0.25, Math.abs(err) * 0.9));
  const launch = ((club.launch + (1 - Math.min(1, p)) * 4 + (lie === "rough" || lie === "deep" ? 2 : 0)) * Math.PI) / 180;
  const spin = ((club.spin * (0.55 + 0.45 * Math.min(1, p)) * L.spin) * 2 * Math.PI) / 60;
  return { speed, launch, spin };
}

/** The flat-green speed for a putt that would roll `d` metres. */
export const puttSpeed = (d: number) => Math.sqrt(2 * LIES.green.roll * G * Math.max(0.05, d));

export const PUTT_RANGES = [3, 6, 10, 16, 25, 40];

export interface Meter {
  /** 0 idle, 1 rising, 2 falling, 3 done. */
  stage: number;
  value: number;
  power: number;
  acc: number;
}

export interface GolfOpts {
  course: Course;
  mode: Mode;
  holes: number;
  /** First hole index (for a short round). */
  start?: number;
  difficulty: Difficulty;
  seed: number;
  you?: string;
}

/**
 * A round: the holes, the field, whose shot it is, the meter, the ball.
 */
export class GolfSim {
  readonly holes: Hole[];
  readonly opts: GolfOpts;
  readonly level: (typeof LEVELS)[Difficulty];
  holeIdx = 0;
  phys: BallPhysics;
  phase: Phase = "aim";
  phaseT = 0;
  /** Aim heading (rad, 0 = +z). */
  aim = 0;
  club = 0;
  puttRange = 2;
  meter: Meter = { stage: 0, value: 0, power: 0, acc: 0 };
  strokes = 0;
  card: number[] = [];
  field: Pro[];
  lie: Lie = "tee";
  from: V3 = { x: 0, y: 0, z: 0 };
  /** Swing animation progress 0–1 (render). */
  swingT = 0;
  lastShot: { carry: number; total: number; club: string } | null = null;
  autopilot = false;
  events: GolfEvent[] = [];
  /** Closest to the pin: balls hit and their distances. */
  ctp: { dist: number; points: number }[] = [];
  readonly ctpBalls = 5;
  private rand: () => number;
  /** The autopilot's plan for this shot. */
  private plan: { aim: number; power: number } | null = null;
  /** Swing in progress: launch at this point of the animation. */
  private launchAt = -1;

  constructor(opts: GolfOpts) {
    this.opts = opts;
    this.level = LEVELS[opts.difficulty];
    this.rand = rng(opts.seed);
    const all = holesOf(opts.course);
    if (opts.mode === "ctp") {
      const i = opts.start ?? all.findIndex((h) => h.par === 3);
      this.holes = [all[Math.max(0, i)]];
    } else {
      const s = opts.start ?? 0;
      this.holes = Array.from({ length: Math.min(opts.holes, all.length) }, (_, k) => all[(s + k) % all.length]);
    }
    this.field = [{ name: opts.you ?? "You", skill: 0, card: [], you: true }, ...FIELD_NAMES.slice(0, opts.mode === "ctp" ? 5 : 11).map((name, i) => ({ name, skill: 0.5 - i * 0.07 + this.level.field + this.rand() * 0.1, card: [] }))];
    this.phys = new BallPhysics(this.holes[0], opts.seed + 7);
    this.startHole(0);
  }

  get hole() {
    return this.holes[this.holeIdx];
  }
  get ball() {
    return this.phys.ball;
  }
  get clubDef() {
    return CLUBS[this.club];
  }
  get toPin() {
    const b = this.ball.p;
    return Math.hypot(this.hole.pin.x - b.x, this.hole.pin.z - b.z);
  }
  get putting() {
    return this.club === PUTTER;
  }
  get puttMax() {
    return PUTT_RANGES[this.puttRange];
  }
  get wind() {
    return this.phys.wind;
  }

  /** Total to par over finished holes (+ this one if it's done). */
  toPar(p: Pro = this.field[0]) {
    let t = 0;
    p.card.forEach((s, i) => (t += s - this.holes[i].par));
    return t;
  }
  points() {
    return this.field[0].card.reduce((a, s, i) => a + stableford(s, this.holes[i].par), 0);
  }
  standings() {
    return [...this.field].sort((a, b) => this.toPar(a) - this.toPar(b) || (a.you ? -1 : b.you ? 1 : 0));
  }
  position() {
    const me = this.toPar();
    return this.field.filter((p) => !p.you && this.toPar(p) < me).length + 1;
  }
  get won() {
    return this.opts.mode === "stroke" && this.phase === "over" && this.position() === 1;
  }

  score() {
    if (this.opts.mode === "ctp") return this.ctp.reduce((a, c) => a + c.points, 0);
    const pts = this.points() * 100;
    const done = this.phase === "over";
    const pos = this.position();
    return pts + (done ? Math.max(0, this.field.length - pos) * 40 + (pos === 1 ? 1000 : 0) : 0);
  }

  private startHole(i: number) {
    this.holeIdx = i;
    const h = this.hole;
    this.phys.hole = h;
    this.phys.place(h.tee.x, h.tee.z + 0.5);
    this.phys.ball.p.y += 0.03; // On a tee peg.
    this.strokes = 0;
    // Wind for the hole.
    const ws = this.opts.course.wind * this.level.wind * (0.4 + this.rand() * 0.8);
    const wa = this.rand() * Math.PI * 2;
    this.phys.wind = { x: Math.sin(wa) * ws, z: Math.cos(wa) * ws };
    this.events.push({ kind: "hole", n: h.n, par: h.par, length: Math.round(h.length) });
    this.ready();
  }

  /** Ready for the next shot: auto club and aim. */
  private ready() {
    const b = this.ball.p;
    this.lie = this.strokes === 0 ? "tee" : lieAt(this.hole, b.x, b.z);
    this.from = { ...b };
    this.phase = "aim";
    this.phaseT = 0;
    this.meter = { stage: 0, value: 0, power: 0, acc: 0 };
    this.swingT = 0;
    this.autoClub();
  }

  /** How long a shot to (x, z) plays: uphill longer, downwind shorter. */
  playsLike(x: number, z: number) {
    const b = this.ball.p;
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < 1) return d;
    const rise = heightAt(this.hole, x, z) - b.y;
    const along = (this.wind.x * (x - b.x) + this.wind.z * (z - b.z)) / d;
    return Math.max(1, d + rise * 0.9 - along * d * 0.011);
  }

  /** Pick the club and line for the shot (the caddie's suggestion). */
  autoClub() {
    const h = this.hole;
    const b = this.ball.p;
    const d = this.playsLike(h.pin.x, h.pin.z);
    this.plan = null;
    const pinAim = Math.atan2(h.pin.x - b.x, h.pin.z - b.z);
    if (this.lie === "green" || (this.lie === "fringe" && d < 14)) {
      this.club = PUTTER;
      this.aim = pinAim;
      this.puttRange = PUTT_RANGES.findIndex((r) => r >= this.toPin * 1.15);
      if (this.puttRange < 0) this.puttRange = PUTT_RANGES.length - 1;
      return;
    }
    const tee = this.strokes === 0;
    let pick = -1;
    for (let i = PUTTER - 1; i >= (tee ? 0 : 1); i--) {
      const y = yardage(CLUBS[i]);
      const lieK = LIES[this.lie].dist;
      if (y.total * lieK >= d - 4) {
        pick = i;
        break;
      }
    }
    if (pick >= 0) {
      this.club = pick;
      this.aim = pinAim;
      return;
    }
    // Can't get there: the longest club, up the line of play.
    this.club = tee ? 0 : 1;
    const { at } = pathInfo(h, b.x, b.z);
    const reach = yardage(CLUBS[this.club]).total * LIES[this.lie].dist;
    const tgt = pointAlong(h, Math.min(h.length - 30, at + reach));
    this.aim = Math.atan2(tgt.x - b.x, tgt.z - b.z);
  }

  /** Where a full shot with this club would land (no wind), for the aim marker. */
  preview(): V2 & { carry: number } {
    const b = this.ball.p;
    if (this.putting) {
      const d = Math.min(this.puttMax, this.toPin);
      return { x: b.x + Math.sin(this.aim) * d, z: b.z + Math.cos(this.aim) * d, carry: d };
    }
    const c = yardage(this.clubDef).carry * (this.lie === "bunker" ? (this.clubDef.wedge ? 0.8 : 0.55) : LIES[this.lie].dist);
    return { x: b.x + Math.sin(this.aim) * c, z: b.z + Math.cos(this.aim) * c, carry: c };
  }

  step(dt: number, input: GolfInput) {
    this.phaseT += dt;
    if (this.autopilot) input = this.autoInput(input, dt);
    switch (this.phase) {
      case "aim":
        this.aim += input.aim * dt * (this.putting ? 0.35 : 0.6);
        if (input.club) this.changeClub(input.club);
        if (input.press) {
          this.phase = "swing";
          this.meter = { stage: 1, value: 0, power: 0, acc: 0 };
          this.events.push({ kind: "meter", stage: 1 });
        }
        break;
      case "swing":
        this.stepMeter(dt, input.press);
        break;
      case "flight": {
        this.phys.step(dt);
        for (const e of this.phys.events) this.events.push(e);
        this.phys.events.length = 0;
        if (this.ball.state === "rest") this.onRest();
        break;
      }
      case "settle":
        if (this.phaseT > (this.autopilot ? 0.4 : 1.4)) this.afterShot();
        break;
      case "holed":
        if (this.phaseT > (this.autopilot ? 0.5 : 3)) this.toCard();
        break;
      case "card":
        if (input.press || this.phaseT > (this.autopilot ? 0.3 : 8)) this.nextHole();
        break;
      default:
        break;
    }
    // The swing animation and the strike.
    if (this.launchAt >= 0) {
      this.swingT = Math.min(1, this.swingT + dt / 1.1);
      if (this.swingT >= this.launchAt) {
        this.launchAt = -1;
        this.strike();
      }
    } else if (this.phase === "flight" || this.phase === "settle") this.swingT = Math.min(1, this.swingT + dt / 1.1);
  }

  changeClub(d: number) {
    if (this.putting && d) {
      // On the putter, up/down changes the length of the stroke.
      const r = this.puttRange + d * -1;
      if (r >= 0 && r < PUTT_RANGES.length) this.puttRange = r;
      else if (r < 0 && this.lie !== "green") this.club = PUTTER - 1;
      return;
    }
    this.club = Math.max(this.strokes === 0 ? 0 : 1, Math.min(PUTTER, this.club + d));
    if (this.club === PUTTER) this.puttRange = Math.max(0, PUTT_RANGES.findIndex((r) => r >= this.toPin * 1.15));
  }

  private stepMeter(dt: number, press: boolean) {
    const m = this.meter;
    const speed = 0.95 * this.level.meter * (this.putting ? 0.8 : 1);
    if (m.stage === 1) {
      m.value += dt * speed;
      if (press) {
        m.power = m.value;
        m.stage = 2;
        this.events.push({ kind: "meter", stage: 2 });
      } else if (m.value >= 1.1) {
        m.value = 1.1;
        m.power = 1.1;
        m.stage = 2;
        this.events.push({ kind: "meter", stage: 2 });
      }
    } else if (m.stage === 2) {
      m.value -= dt * speed * 1.25;
      if (press || m.value <= -0.15) {
        m.acc = press ? m.value : -0.15;
        m.stage = 3;
        this.events.push({ kind: "meter", stage: 3 });
        this.swing();
      }
    }
  }

  /** Begin the swing animation; the ball leaves at impact. */
  private swing() {
    this.swingT = 0;
    this.launchAt = this.putting ? 0.42 : 0.5;
  }

  /** Hit it: the meter's power and accuracy become a ball flight. */
  private strike() {
    const m = this.meter;
    const club = this.clubDef;
    this.strokes++;
    this.from = { ...this.ball.p };
    const lie = this.lie;
    // Accuracy error: 0 is pure; +early (fade/slice), -late (draw/hook). Overswing adds wobble.
    const over = Math.max(0, m.power - 1);
    const err = (m.acc + over * (this.rand() - 0.5) * 0.6) * this.level.error;
    const pure = Math.abs(m.acc) < 0.025 && over === 0;
    if (club.putter) {
      const d = m.power * this.puttMax;
      const heading = this.aim + err * 0.09;
      this.phys.roll(puttSpeed(d) * (1 - Math.abs(err) * 0.15), heading);
      this.events.push({ kind: "strike", club: club.name, speed: puttSpeed(d), pure, putt: true });
    } else {
      const s = shotParams(club, m.power, err, lie);
      const heading = this.aim + err * 0.12 * (lie === "rough" || lie === "deep" ? 1.4 : 1);
      // A little natural scatter, more from bad lies.
      const scatter = (this.rand() - 0.5) * (lie === "deep" ? 0.06 : lie === "rough" || lie === "bunker" ? 0.03 : 0.012);
      const tilt = Math.max(-0.7, Math.min(0.7, err * 1.6));
      this.phys.place(this.ball.p.x, this.ball.p.z);
      if (this.strokes === 1) this.phys.ball.p.y += 0.03;
      this.phys.launch(s.speed, heading + scatter, s.launch, s.spin, tilt);
      this.events.push({ kind: "strike", club: club.name, speed: s.speed, pure, putt: false });
    }
    this.phase = "flight";
    this.phaseT = 0;
  }

  private onRest() {
    const h = this.hole;
    const b = this.ball;
    const carryAt = this.phys.landed ?? b.p;
    const carry = Math.hypot(carryAt.x - this.from.x, carryAt.z - this.from.z);
    const total = Math.hypot(b.p.x - this.from.x, b.p.z - this.from.z);
    this.lastShot = { carry, total, club: this.clubDef.name };
    if (b.holed) {
      if (this.opts.mode === "ctp") return this.ctpRecord(0);
      this.phase = "holed";
      this.phaseT = 0;
      this.events.push({ kind: "holed", strokes: this.strokes, par: h.par, call: callFor(this.strokes, h.par), length: Math.round(total) });
      return;
    }
    const lie = lieAt(h, b.p.x, b.p.z);
    this.events.push({ kind: "rest", lie, carry: Math.round(carry), total: Math.round(total), toPin: this.toPin });
    if (this.opts.mode === "ctp") return this.ctpRecord(lie === "water" || lie === "ob" ? Infinity : this.toPin);
    if (lie === "water") {
      // One-stroke penalty: drop back where it crossed the water's edge.
      this.strokes++;
      const at = this.dropPoint();
      this.phys.place(at.x, at.z);
      this.events.push({ kind: "penalty", why: "In the water: one-shot penalty, take a drop." });
    } else if (lie === "ob") {
      // Stroke and distance.
      this.strokes++;
      this.phys.place(this.from.x, this.from.z);
      this.events.push({ kind: "penalty", why: "Out of bounds: stroke and distance." });
    }
    this.phase = "settle";
    this.phaseT = 0;
  }

  private dropPoint(): V2 {
    const h = this.hole;
    const e = this.phys.lastDry ?? this.from;
    // Back toward where the shot came from until it's dry, then a club length more.
    const dx = this.from.x - e.x;
    const dz = this.from.z - e.z;
    const l = Math.hypot(dx, dz) || 1;
    for (let s = 0; s < l; s += 1) {
      const x = e.x + (dx / l) * s;
      const z = e.z + (dz / l) * s;
      const lie = lieAt(h, x, z);
      if (lie !== "water" && lie !== "ob" && !h.ponds.some((p) => ellipseK(p, x, z) < 1.15)) return { x: x + (dx / l) * 1.5, z: z + (dz / l) * 1.5 };
    }
    return { x: this.from.x, z: this.from.z };
  }

  private ctpRecord(dist: number) {
    const points = dist === 0 ? 1000 : Number.isFinite(dist) ? Math.max(0, Math.round(300 - dist * 10)) : 0;
    this.ctp.push({ dist, points });
    this.events.push({ kind: "ctp", ball: this.ctp.length, dist, points });
    this.phase = "settle";
    this.phaseT = 0;
  }

  private afterShot() {
    if (this.opts.mode === "ctp") {
      if (this.ctp.length >= this.ctpBalls) return this.finish();
      const h = this.hole;
      this.phys.place(h.tee.x, h.tee.z + 0.5);
      this.phys.ball.p.y += 0.03;
      this.strokes = 0;
      this.ready();
      return;
    }
    if (this.strokes >= 10) {
      // Pick up.
      this.phase = "holed";
      this.phaseT = 0;
      this.events.push({ kind: "holed", strokes: this.strokes, par: this.hole.par, call: "Picked up", length: 0 });
      return;
    }
    this.ready();
  }

  private toCard() {
    const h = this.hole;
    this.field[0].card.push(this.strokes);
    // The rest of the field play the hole.
    for (const p of this.field) {
      if (p.you) continue;
      const r = this.rand() - p.skill * 0.12;
      const d = r < 0.012 ? -2 : r < 0.24 ? -1 : r < 0.8 ? 0 : r < 0.96 ? 1 : 2;
      p.card.push(h.par + d);
    }
    this.card = this.field[0].card;
    this.phase = "card";
    this.phaseT = 0;
  }

  private nextHole() {
    if (this.holeIdx + 1 >= this.holes.length) return this.finish();
    this.startHole(this.holeIdx + 1);
  }

  private finish() {
    this.phase = "over";
    this.phaseT = 0;
    this.events.push({ kind: "over", won: this.opts.mode === "stroke" ? this.position() === 1 : this.ctp.some((c) => c.dist === 0) });
  }

  /** The AI (autopilot): sensible club and line, a decent swing. */
  private autoInput(inp: GolfInput, dt: number): GolfInput {
    const out: GolfInput = { aim: 0, club: 0, press: false };
    if (this.phase === "aim") {
      if (!this.plan) this.plan = this.makePlan();
      this.aim = this.plan.aim;
      if (this.phaseT > 0.2) out.press = true;
      return out;
    }
    if (this.phase === "card") return { ...out, press: true };
    if (this.phase !== "swing") return inp;
    // The press lands after this frame's move, so press a frame ahead.
    const m = this.meter;
    const rate = 0.95 * this.level.meter * (this.putting ? 0.8 : 1);
    if (m.stage === 1) {
      if (m.value + rate * dt >= this.autoPower() - rate * dt * 0.5) out.press = true;
    } else if (m.stage === 2) {
      const miss = (this.rand() - 0.5) * 0.03;
      if (m.value - rate * 1.25 * dt <= miss + rate * 1.25 * dt * 0.5) out.press = true;
    }
    return out;
  }

  private autoPower() {
    return (this.plan ??= this.makePlan()).power;
  }

  /**
   * The autopilot's shot: putts are solved by rolling trial putts (line and
   * pace, so it plays the break); full shots aim off for the crosswind and
   * take the power from the yardage book at the distance it plays.
   */
  private makePlan(): { aim: number; power: number } {
    const h = this.hole;
    const b = this.ball.p;
    if (this.putting) {
      const base = Math.atan2(h.pin.x - b.x, h.pin.z - b.z);
      const trial = (aim: number, speed: number) => {
        const ph = new BallPhysics(h, 1);
        ph.place(b.x, b.z);
        ph.roll(speed, aim);
        let closest = Infinity;
        for (let i = 0; i < 600 && ph.ball.state !== "rest"; i++) {
          ph.step(1 / 20);
          closest = Math.min(closest, Math.hypot(ph.ball.p.x - h.pin.x, ph.ball.p.z - h.pin.z));
        }
        const past = (ph.ball.p.x - h.pin.x) * Math.sin(base) + (ph.ball.p.z - h.pin.z) * Math.cos(base);
        return { holed: ph.ball.holed, closest, past, rest: Math.hypot(ph.ball.p.x - h.pin.x, ph.ball.p.z - h.pin.z) };
      };
      let best = { aim: base, speed: puttSpeed(this.toPin + 0.3), score: Infinity };
      for (let k = -5; k <= 5; k++) {
        const aim = base + k * 0.016;
        // Pace: bisect for the ball to finish about 40 cm past.
        let lo = 0.2;
        let hi = 9;
        for (let i = 0; i < 11; i++) {
          const mid = (lo + hi) / 2;
          const t = trial(aim, mid);
          if (!t.holed && t.past < 0.4) lo = mid;
          else hi = mid;
        }
        const speed = (lo + hi) / 2;
        const t = trial(aim, speed);
        const score = t.holed ? -1 : t.closest;
        if (score < best.score) best = { aim, speed, score };
      }
      // Speed back to meter power on this stroke length.
      const flat = (best.speed * best.speed) / (2 * LIES.green.roll * G);
      while (this.puttRange < PUTT_RANGES.length - 1 && flat > this.puttMax) this.puttRange++;
      return { aim: best.aim, power: Math.min(1.1, flat / this.puttMax) };
    }
    // Full shots: aim into the crosswind, power for the distance it plays.
    let aim = this.aim;
    const ln = { x: Math.cos(aim), z: -Math.sin(aim) };
    aim -= (this.wind.x * ln.x + this.wind.z * ln.z) * 0.008;
    const target = { x: b.x + Math.sin(this.aim) * this.toPin, z: b.z + Math.cos(this.aim) * this.toPin };
    const d = this.playsLike(target.x, target.z);
    const k = this.lie === "bunker" ? (this.clubDef.wedge ? 0.8 : 0.55) : LIES[this.lie].dist;
    const full = yardage(this.clubDef).total * k;
    if (full <= d + 2) return { aim, power: 1 };
    let lo = 0.1;
    let hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (yardage(this.clubDef, Math.round(mid * 50) / 50).total * k < d) lo = mid;
      else hi = mid;
    }
    return { aim, power: (lo + hi) / 2 };
  }

  /** Test hook: hit now with this power and accuracy. */
  hitNow(power: number, acc = 0) {
    if (this.phase !== "aim" && this.phase !== "swing") return;
    this.meter = { stage: 3, value: acc, power, acc };
    this.strike();
  }

  /** Play everything out with the autopilot (tests). */
  simulateToEnd(maxSteps = 200000) {
    this.autopilot = true;
    for (let i = 0; i < maxSteps && this.phase !== "over"; i++) this.step(1 / 30, { aim: 0, club: 0, press: false });
    this.events.length = 0;
  }
}
