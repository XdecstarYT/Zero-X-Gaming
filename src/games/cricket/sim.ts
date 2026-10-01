import { createRng, type Rng } from "../engine/rng";
import { bowlers, type Player, type Team } from "./teams";

/**
 * Boundary Blitz: a T20 match ball by ball. The ball is a real projectile
 * (gravity, drag, swing in the air, seam and spin off the pitch, bounce and
 * roll on the outfield); shots come from your aim, shot type and timing
 * against the ball's line and length; fielders read the ball's flight and
 * run to catch it or cut it off; the batters run what's safe (or what you
 * push for) and throws can run them out.
 *
 * Coordinates (m): the striker's stumps at the origin, the bowler's stumps
 * at z = PITCH. +z is "straight" back past the bowler, +x the leg side for a
 * right-hander, -x the off side, -z behind the wicket.
 */

export const PITCH = 20.12;
export const CREASE = 1.22;
export const STUMP_H = 0.711;
export const STUMP_HALF = 0.114;
export const BALL_R = 0.036;
const G = 9.81;
const DRAG = 0.0055;
/** Bat-swing time from the press to the bat meeting the ball (s). */
export const SWING_LAG = 0.22;
/** The boundary rope: an ellipse round the middle of the pitch. */
export const ROPE = { rx: 63, rz: 69, cz: PITCH / 2 };
export const ropeDist = (x: number, z: number) => Math.hypot(x / ROPE.rx, (z - ROPE.cz) / ROPE.rz);

export type Kind = "stock" | "outswing" | "inswing" | "bouncer" | "yorker" | "slower" | "offbreak" | "legbreak" | "armball" | "flighted";
export type ShotType = "ground" | "loft" | "defend";
export type FieldSet = "attack" | "balanced" | "defend";
export type Difficulty = "rookie" | "pro" | "legend";
export type Mode = "match" | "superover" | "nets";

export interface KindDef {
  name: string;
  style: "pace" | "spin";
  /** Release speed (m/s). */
  speed: number;
  /** Default pitching length (m from the batter's stumps). */
  len: number;
  /** Swing: sideways acceleration in the air (m/s², + toward leg). */
  swing: number;
  /** Turn / seam: sideways speed added off the pitch (m/s). */
  turn: number;
  /** Bounce: restitution off the pitch. */
  e: number;
}

export const KINDS: Record<Kind, KindDef> = {
  stock: { name: "Stock", style: "pace", speed: 38, len: 6.5, swing: 0, turn: 0, e: 0.52 },
  outswing: { name: "Outswinger", style: "pace", speed: 36, len: 6, swing: -2.8, turn: -0.2, e: 0.5 },
  inswing: { name: "Inswinger", style: "pace", speed: 36, len: 6, swing: 2.6, turn: 0.2, e: 0.5 },
  bouncer: { name: "Bouncer", style: "pace", speed: 39.5, len: 11.5, swing: 0, turn: 0, e: 0.6 },
  yorker: { name: "Yorker", style: "pace", speed: 37, len: 1.4, swing: 0.6, turn: 0, e: 0.45 },
  slower: { name: "Slower ball", style: "pace", speed: 29, len: 5.5, swing: 0, turn: 0, e: 0.45 },
  offbreak: { name: "Off-break", style: "spin", speed: 23, len: 4.8, swing: 0, turn: 2.6, e: 0.46 },
  legbreak: { name: "Leg-break", style: "spin", speed: 22, len: 4.8, swing: 0, turn: -3.0, e: 0.48 },
  armball: { name: "Arm ball", style: "spin", speed: 25.5, len: 5.2, swing: 0.4, turn: 0, e: 0.42 },
  flighted: { name: "Flighted", style: "spin", speed: 19.5, len: 3.4, swing: 0, turn: 1.6, e: 0.46 },
};
export const PACE_KINDS: Kind[] = ["stock", "outswing", "inswing", "bouncer", "yorker", "slower"];
export const SPIN_KINDS: Kind[] = ["offbreak", "legbreak", "armball", "flighted"];

export const LEVELS: Record<Difficulty, { name: string; bat: number; bowl: number; field: number }> = {
  // bat: AI batting timing spread (×), bowl: AI bowling error (×), field: catching (×).
  rookie: { name: "Club", bat: 1.45, bowl: 1.45, field: 0.85 },
  pro: { name: "Pro", bat: 1.0, bowl: 1.0, field: 1.0 },
  legend: { name: "International", bat: 0.78, bowl: 0.75, field: 1.08 },
};

export const FIELDS: Record<FieldSet, { name: string; spots: [number, number][] }> = {
  // [angle (deg, 0 = straight, + leg side), distance (m)] for the nine fielders besides keeper and bowler.
  attack: { name: "Attacking", spots: [[-165, 17], [-158, 18], [-128, 19], [-92, 24], [-52, 27], [-14, 28], [16, 28], [92, 26], [164, 56]] },
  balanced: { name: "Balanced", spots: [[-150, 58], [-95, 27], [-46, 29], [-62, 61], [-14, 28], [14, 28], [56, 60], [96, 27], [158, 57]] },
  defend: { name: "Boundary riders", spots: [[-158, 61], [-96, 61], [-52, 60], [-14, 26], [-11, 66], [12, 66], [52, 61], [94, 60], [160, 59]] },
};

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Delivery {
  kind: Kind;
  speed: number;
  /** Where it pitches. */
  px: number;
  pz: number;
  swing: number;
  turn: number;
  e: number;
  noBall: boolean;
}

export interface BatCard {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: string | null;
}
export interface BowlCard {
  balls: number;
  runs: number;
  wkts: number;
}

export interface Innings {
  bat: 0 | 1;
  runs: number;
  wkts: number;
  balls: number;
  extras: number;
  fours: number;
  sixes: number;
  cards: BatCard[];
  bowl: Map<number, BowlCard>;
  striker: number;
  nonStriker: number;
  next: number;
  bowler: number;
  lastBowler: number;
  /** This over, ball by ball ("•", "1", "4", "6", "W", "wd", "nb"). */
  over: string[];
  /** Runs at the end of each over (for the worm). */
  worm: number[];
}

export type Pose = "stand" | "run" | "crouch" | "keeper" | "catch" | "dive" | "throw" | "bowl" | "celebrate" | "stance" | "shot" | "out";

export interface Fielder {
  /** Index in the bowling team's squad. */
  p: number;
  role: "keeper" | "bowler" | "field";
  x: number;
  z: number;
  hx: number;
  hz: number;
  heading: number;
  speed: number;
  pose: Pose;
  act: number;
  /** Where it's running to, and the time (sim t) it wants to be there. */
  goal: { x: number; z: number; at: number } | null;
}

export interface Batter {
  x: number;
  z: number;
  heading: number;
  speed: number;
  pose: Pose;
  act: number;
  shot: ShotType | "pull" | "cut" | "leave";
}

export type SimEvent =
  | { kind: "runup"; bowler: string; delivery: string }
  | { kind: "release"; speed: number }
  | { kind: "bounce"; onPitch: boolean }
  | { kind: "hit"; quality: number; label: string; speed: number; loft: boolean }
  | { kind: "edge" }
  | { kind: "beaten" }
  | { kind: "leave" }
  | { kind: "pad"; appeal: boolean }
  | { kind: "stumps" }
  | { kind: "catch"; by: string; hard: boolean }
  | { kind: "drop"; by: string }
  | { kind: "gather" }
  | { kind: "throw" }
  | { kind: "runs"; n: number }
  | { kind: "four" }
  | { kind: "six"; dist: number }
  | { kind: "wide" }
  | { kind: "noball" }
  | { kind: "out"; how: string; batter: string; runs: number; balls: number }
  | { kind: "notout" }
  | { kind: "overEnd"; summary: string }
  | { kind: "inningsEnd"; summary: string }
  | { kind: "matchEnd"; result: string; won: boolean | null };

export type Phase = "plan" | "runup" | "delivery" | "live" | "dead" | "break" | "done";

export interface CricketInput {
  /** Batting: aim direction (deg, 0 = straight, + leg side). */
  aim: number;
  /** Batting: a shot pressed this frame. */
  shot: ShotType | null;
  /** Batting: push for another run. */
  run: boolean;
  /** Bowling: the delivery, where to pitch it and the field. */
  kind: Kind;
  target: { x: number; z: number };
  field: FieldSet;
  /** Bowling: press to run in, press again to release on the meter. */
  bowl: boolean;
  /** Continue past a break. */
  next: boolean;
  /** Online: when the remote batter pressed (delivery time, s), and that they let it go. */
  pressAt?: number;
  leave?: boolean;
  /** Online: the meter value the remote bowler saw when they released. */
  meter?: number;
}

export const emptyInput = (): CricketInput => ({ aim: -20, shot: null, run: false, kind: "stock", target: { x: -0.2, z: 6 }, field: "balanced", bowl: false, next: false });

export interface MatchOptions {
  teams: [Team, Team];
  /** Which team you are (0 or 1), -1 to watch. */
  human: 0 | 1 | -1;
  /** Who bats first. */
  batFirst: 0 | 1;
  overs: number;
  difficulty: Difficulty;
  mode: Mode;
  seed: number;
  /** Super over: the target to chase. */
  target?: number;
  /** Online: the other team is a person too (their input comes in as `remote`). */
  versus?: boolean;
}

export const RUNUP_S = 1.7;
const deg = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const gauss = (r: Rng) => {
  const u = Math.max(1e-6, r.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r.next());
};

/** One physics step for a ball in play (outfield: bounces and rolls). */
export function stepBall(p: V3, v: V3, dt: number, onOutfield = true) {
  const sp = Math.hypot(v.x, v.y, v.z);
  v.x -= DRAG * sp * v.x * dt;
  v.y -= DRAG * sp * v.y * dt + G * dt;
  v.z -= DRAG * sp * v.z * dt;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;
  let bounced = false;
  if (p.y <= BALL_R) {
    p.y = BALL_R;
    if (v.y < -1.2) {
      v.y = -v.y * (onOutfield ? 0.36 : 0.5);
      v.x *= 0.72;
      v.z *= 0.72;
      bounced = true;
    } else {
      v.y = 0;
      // Rolling: grass slows it.
      const h = Math.hypot(v.x, v.z);
      if (h > 0) {
        const k = Math.max(0, h - 2.4 * dt) / h;
        v.x *= k;
        v.z *= k;
      }
    }
  }
  return bounced;
}

export interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  air: boolean;
}

/** Predict a hit ball's path (until it stops, crosses the rope or `maxT`). */
export function predict(p0: V3, v0: V3, maxT = 9, dt = 1 / 30): { samples: Sample[]; rope: Sample | null } {
  const p = { ...p0 };
  const v = { ...v0 };
  const out: Sample[] = [];
  let air = true;
  let rope: Sample | null = null;
  for (let t = 0; t <= maxT; t += dt) {
    const s = { t, x: p.x, y: p.y, z: p.z, air };
    out.push(s);
    if (ropeDist(p.x, p.z) >= 1) {
      rope = s;
      break;
    }
    if (stepBall(p, v, dt)) air = false;
    if (!air && Math.hypot(v.x, v.z) < 0.05) break;
  }
  return { samples: out, rope };
}

/** Delivery launch: the velocity that pitches the ball at (px, pz) from the release point. */
export function launch(rel: V3, d: Delivery): V3 {
  const dz = d.pz - rel.z;
  const T = Math.abs(dz) / d.speed;
  const vy = (BALL_R - rel.y + 0.5 * G * T * T) / T;
  const vx = (d.px - rel.x - 0.5 * d.swing * T * T) / T;
  return { x: vx, y: vy, z: dz / T };
}

/** The shot a ball "asks for": the natural direction (deg) for its line and height at the bat. */
export function naturalAim(xc: number, yc: number, len: number) {
  if (yc > 1.05) return xc < -0.25 ? -88 : 72;
  if (len < 2.2) return xc < -0.3 ? -22 : 6;
  if (xc < -0.4) return -55;
  if (xc < -0.12) return -24;
  if (xc < 0.16) return 6;
  return 48;
}

export interface Contact {
  type: "hit" | "edge" | "miss";
  speed: number;
  dir: number;
  elev: number;
  quality: number;
  label: string;
  /** Inside edge onto the stumps. */
  playedOn?: boolean;
}

/**
 * Bat on ball: `dt` is the timing error (s; < 0 early, > 0 late), `aim` the
 * direction asked for, `skill` 0–1. Returns where the ball goes.
 */
export function contact(r: Rng, o: { xc: number; yc: number; len: number; ballSpeed: number; movement: number; aim: number; shot: ShotType; dt: number; skill: number }): Contact {
  const window = o.shot === "defend" ? 1.6 : 1;
  const a = Math.abs(o.dt) / window;
  if (a > 0.13) return { type: "miss", speed: 0, dir: 0, elev: 0, quality: 0, label: o.dt < 0 ? "Too early" : "Too late" };
  const tq = a <= 0.035 ? 1 : a <= 0.075 ? 0.82 : 0.45;
  const nat = naturalAim(o.xc, o.yc, o.len);
  let diff = Math.abs(o.aim - nat);
  if (diff > 180) diff = 360 - diff;
  const mismatch = clamp((diff - 38) / 90, 0, 1);
  const loft = o.shot === "loft";
  const defend = o.shot === "defend";
  let pe = (tq < 0.5 ? 0.3 : tq < 0.9 ? 0.06 : 0.015) + mismatch * 0.3 + o.movement * 0.08 + (loft ? 0.05 : 0) - (defend ? 0.05 : 0);
  pe *= 1.25 - o.skill * 0.5;
  if (mismatch > 0.75 && r.next() < 0.35) return { type: "miss", speed: 0, dir: 0, elev: 0, quality: 0, label: "Played across the line" };
  if (r.next() < pe) {
    if (o.xc < -0.05 || r.next() < 0.5) {
      // Outside edge: behind on the off side, low and quick (slips, keeper, third man).
      return { type: "edge", speed: 14 + r.next() * 12 + o.ballSpeed * 0.15, dir: -152 - r.next() * 24, elev: 2 + r.next() * 9, quality: 0.2, label: "Edged!" };
    }
    const onStumps = Math.abs(o.xc) < STUMP_HALF + 0.1;
    return { type: "edge", speed: 8 + r.next() * 10, dir: 150 + r.next() * 25, elev: -4 + r.next() * 8, quality: 0.2, label: "Inside edge", playedOn: onStumps && r.next() < 0.45 };
  }
  const q = tq * (1 - 0.45 * mismatch) * (0.8 + 0.2 * o.skill);
  // Early sends it to leg, late to the off side.
  let dir = o.aim - (o.dt / 0.13) * 26 * window + (1 - q) * (r.next() - 0.5) * 34;
  const sf = 0.85 + 0.3 * o.skill;
  let speed: number;
  let elev: number;
  let label: string;
  if (defend) {
    speed = 3 + r.next() * 3.5;
    elev = -12 + r.next() * 4;
    dir = o.aim * 0.4 + (r.next() - 0.5) * 30;
    label = tq >= 1 ? "Solid defence" : "Blocked";
  } else if (loft) {
    if (q > 0.62) {
      speed = (20 + 15 * q * sf) * (0.92 + o.ballSpeed / 300);
      elev = 26 + 10 * q + (r.next() - 0.5) * 6;
      label = q > 0.9 ? "Middled it!" : "Lofted";
    } else {
      // Skied: up in the air, not far.
      speed = 17 + 8 * q;
      elev = 48 + r.next() * 18;
      label = "Skied!";
    }
  } else {
    speed = (19 + 17 * q * sf) * (0.9 + o.ballSpeed / 260);
    elev = -3 + r.next() * 7 + (o.yc > 1.05 && q < 0.6 ? 18 : 0);
    label = tq >= 1 ? "Perfect timing" : tq > 0.8 ? "Good shot" : o.dt < 0 ? "Early" : "Late";
  }
  return { type: "hit", speed, dir, elev, quality: q, label };
}

interface Plan {
  kind: "catch" | "gather" | "boundary";
  fielder: number;
  at: number;
  x: number;
  z: number;
  willCatch?: boolean;
  six?: boolean;
}

export class CricketSim {
  readonly opts: MatchOptions;
  readonly rng: Rng;
  readonly teams: [Team, Team];
  readonly maxWkts: number;
  innings: Innings[] = [];
  cur = 0;
  phase: Phase = "plan";
  /** Seconds in the current phase. */
  pt = 0;
  /** Seconds since the ball was released / hit. */
  t = 0;
  events: SimEvent[] = [];
  /** Let the AI play your side (tests, spectating). */
  autopilot = false;

  ball: V3 = { x: 0, y: 2, z: PITCH };
  vel: V3 = { x: 0, y: 0, z: 0 };
  ballVisible = false;
  bounced = false;
  delivery: Delivery | null = null;
  fielders: Fielder[] = [];
  batters: [Batter, Batter];
  umpires: { x: number; z: number; pose: "stand" | "out" | "four" | "six" | "wide" | "noball" }[] = [];
  /** Stumps broken at the batting / bowling end. */
  broken: [number, number] = [0, 0];
  field: FieldSet = "balanced";

  // Batting state for this ball.
  private pressAt = -1;
  private pressShot: ShotType = "ground";
  aim = -20;
  private aiPress: { at: number; shot: ShotType; aim: number } | null = null;
  contactZ = 1.9;
  private freeHit = false;
  lastShot: Contact | null = null;
  // Bowling meter (human): 0–1 while running in; locked value.
  meter = 0;
  meterLocked: number | null = null;
  private humanPlan: { kind: Kind; target: { x: number; z: number } } | null = null;
  // Live ball.
  private plan: Plan | null = null;
  private runPlan = 0;
  private runPush = 0;
  private runClock = 0;
  private thrown = false;
  /** The ball has been thrown in (the live ball is now a throw). */
  get isThrown() {
    return this.thrown;
  }
  private throwFrom: V3 | null = null;
  private throwTo: V3 | null = null;
  private throwT = 0;
  private throwDur = 0;
  /** What happened on this ball (for the HUD and the over log). */
  result: { text: string; runs: number; wicket: boolean } | null = null;
  private ballRuns = 0;
  private ballWicket: string | null = null;
  private ballExtra: "wd" | "nb" | null = null;
  /** Your score for the platform. */
  /** Per team: runs scored, wickets taken, sixes and the longest six. */
  runsBy = [0, 0];
  wktsBy = [0, 0];
  sixesBy = [0, 0];
  longestBy = [0, 0];
  won: boolean | null = null;
  /** The winning team (null for a tie or nets). */
  winner: 0 | 1 | null = null;
  // Online, host: holding the ball at the bat for the remote batter's press.
  private remoteLeft = false;
  private holdT = 0;
  // Online, guest: the delivery flies locally so your timing is exact.
  puppet = false;
  localFlight = false;
  /** Guest: your press (delivery time), and whether the ball has passed you unplayed. */
  localPress = -1;
  localLeave = false;
  netThrown = false;
  resultText = "";

  constructor(opts: MatchOptions) {
    this.opts = opts;
    this.rng = createRng(opts.seed);
    this.teams = opts.teams;
    this.maxWkts = opts.mode === "superover" ? 2 : 10;
    this.batters = [this.newBatter(), this.newBatter()];
    this.startInnings(opts.batFirst);
  }

  private newBatter(): Batter {
    return { x: 0.32, z: CREASE, heading: 0, speed: 0, pose: "stance", act: 0, shot: "leave" };
  }

  get inn() {
    return this.innings[this.cur];
  }
  get batTeam() {
    return this.teams[this.inn.bat];
  }
  get bowlTeam() {
    return this.teams[1 - this.inn.bat];
  }
  /** Is the human batting / bowling right now? */
  get humanBats() {
    return !this.autopilot && this.opts.human === this.inn.bat;
  }
  get humanBowls() {
    return !this.autopilot && this.opts.mode !== "nets" && this.opts.human === 1 - this.inn.bat;
  }
  /** Online: is the other person batting / bowling? */
  get remoteBats() {
    return !this.autopilot && !!this.opts.versus && this.opts.human !== this.inn.bat;
  }
  get remoteBowls() {
    return !this.autopilot && !!this.opts.versus && this.opts.mode !== "nets" && this.opts.human !== 1 - this.inn.bat;
  }
  private get personBats() {
    return this.humanBats || this.remoteBats;
  }
  private get personBowls() {
    return this.humanBowls || this.remoteBowls;
  }
  private get me() {
    return this.opts.human < 0 ? -1 : this.opts.human;
  }
  get humanRuns() {
    return this.me < 0 ? 0 : this.runsBy[this.me];
  }
  get humanWkts() {
    return this.me < 0 ? 0 : this.wktsBy[this.me];
  }
  get sixes() {
    return this.me < 0 ? 0 : this.sixesBy[this.me];
  }
  get longest() {
    return this.me < 0 ? 0 : this.longestBy[this.me];
  }
  get target() {
    if (this.opts.mode === "superover" && this.opts.target) return this.opts.target;
    return this.cur === 1 ? this.innings[0].runs + 1 : 0;
  }
  get ballsPerInnings() {
    return this.opts.mode === "superover" ? 6 : this.opts.overs * 6;
  }
  get striker(): Player {
    return this.batTeam.players[this.inn.striker];
  }
  get bowler(): Player {
    return this.bowlTeam.players[this.inn.bowler];
  }
  overs(balls = this.inn.balls) {
    return `${Math.floor(balls / 6)}.${balls % 6}`;
  }

  private startInnings(bat: 0 | 1) {
    const inn: Innings = {
      bat,
      runs: 0,
      wkts: 0,
      balls: 0,
      extras: 0,
      fours: 0,
      sixes: 0,
      cards: this.teams[bat].players.map(() => ({ runs: 0, balls: 0, fours: 0, sixes: 0, out: null })),
      bowl: new Map(),
      striker: 0,
      nonStriker: 1,
      next: 2,
      bowler: -1,
      lastBowler: -1,
      over: [],
      worm: [],
    };
    this.innings.push(inn);
    this.cur = this.innings.length - 1;
    this.pickBowler();
    this.placeField();
    this.phase = "plan";
    this.pt = 0;
  }

  /** The next over's bowler: the best one who isn't on a quota or just bowled. */
  private pickBowler() {
    const inn = this.inn;
    const list = bowlers(this.bowlTeam);
    const quota = Math.max(1, Math.ceil(this.opts.overs / 5));
    const overs = (i: number) => Math.floor((inn.bowl.get(i)?.balls ?? 0) / 6);
    const death = inn.balls >= this.ballsPerInnings - 12;
    const ok = list.filter((i) => i !== inn.lastBowler && (this.opts.mode === "superover" || overs(i) < quota));
    const pool = ok.length ? ok : list.filter((i) => i !== inn.lastBowler);
    // Pace at the start and the death, spin in the middle.
    const score = (i: number) => {
      const p = this.bowlTeam.players[i];
      const phaseFit = (p.style === "pace") === (inn.balls < 36 || death) ? 12 : 0;
      return p.bowl + phaseFit - overs(i) * 3;
    };
    pool.sort((a, b) => score(b) - score(a));
    inn.bowler = pool[0] ?? list[0];
    if (!inn.bowl.has(inn.bowler)) inn.bowl.set(inn.bowler, { balls: 0, runs: 0, wkts: 0 });
  }

  /** Set the field: keeper, bowler, the nine others from a preset. */
  placeField(set?: FieldSet) {
    const bowlerP = this.inn.bowler;
    if (!set) {
      const b = this.inn.balls;
      const n = this.ballsPerInnings;
      set = b < Math.min(36, n * 0.3) ? "attack" : b >= n - 18 ? "defend" : "balanced";
      if (this.opts.mode === "superover") set = "defend";
      if (this.opts.mode === "nets") set = "balanced";
    }
    this.field = set;
    const spin = this.bowler.style === "spin";
    const team = this.bowlTeam.players;
    const keeperI = Math.max(0, team.findIndex((p) => p.role === "keeper"));
    const others = team.map((_, i) => i).filter((i) => i !== keeperI && i !== bowlerP);
    const spots = FIELDS[set].spots.map(([a, d]) => {
      // Spinners bring the slips in and men up.
      const dd = spin && d < 22 ? d * 0.7 : d;
      return { x: Math.sin(a * deg) * dd, z: Math.cos(a * deg) * dd };
    });
    const kz = spin ? -1.1 : -13;
    const list: Fielder[] = [
      { p: keeperI, role: "keeper", x: -0.3, z: kz, hx: -0.3, hz: kz, heading: 0, speed: 0, pose: "keeper", act: 0, goal: null },
      { p: bowlerP, role: "bowler", x: 0.9, z: PITCH + 16, hx: 0.9, hz: PITCH + 16, heading: Math.PI, speed: 0, pose: "stand", act: 0, goal: null },
      ...others.slice(0, 9).map((p, i): Fielder => ({ p, role: "field", x: spots[i].x, z: spots[i].z, hx: spots[i].x, hz: spots[i].z, heading: Math.atan2(-spots[i].x, -spots[i].z), speed: 0, pose: "crouch", act: 0, goal: null })),
    ];
    this.fielders = list;
    this.umpires = [
      { x: -0.9, z: PITCH + 1.6, pose: "stand" },
      { x: 26, z: CREASE, pose: "stand" },
    ];
  }

  // ------------------------------------------------------------------ step

  step(dt: number, input: CricketInput, remote?: CricketInput) {
    if (this.puppet) return this.stepPuppet(dt);
    this.pt += dt;
    this.t += dt;
    const batIn = this.humanBats ? input : this.remoteBats ? (remote ?? null) : null;
    const bowlIn = this.humanBowls ? input : this.remoteBowls ? (remote ?? null) : null;
    if (batIn) this.aim = clamp(batIn.aim, -180, 180);
    this.stepPeople(dt);
    for (let i = 0; i < 2; i++) this.broken[i] = Math.max(0, this.broken[i] - dt * 0.15);
    switch (this.phase) {
      case "plan":
        return this.stepPlan(bowlIn);
      case "runup":
        return this.stepRunup(bowlIn);
      case "delivery":
        if (batIn?.shot && this.pressAt < 0) {
          this.pressAt = batIn.pressAt ?? this.t;
          this.pressShot = batIn.shot;
        }
        if (batIn?.leave) this.remoteLeft = true;
        return this.stepDelivery(dt);
      case "live":
        if (batIn?.run) this.pushRun();
        return this.stepLive(dt);
      case "dead":
        if (this.pt > 1.6) this.nextBall();
        return;
      case "break":
        if (input.next || remote?.next || this.pt > (this.opts.human >= 0 ? 45 : 3)) this.afterBreak();
        return;
      case "done":
        return;
    }
  }

  private stepPlan(input: CricketInput | null) {
    const person = this.personBowls && !!input;
    const wait = person ? Infinity : this.personBats ? 0.9 : 0.5;
    if (person && this.field !== input.field) this.placeField(input.field);
    if (this.pt >= wait || (person && input.bowl)) {
      this.humanPlan = person ? { kind: input.kind, target: { ...input.target } } : null;
      this.meter = 0;
      this.meterLocked = null;
      this.phase = "runup";
      this.pt = 0;
      const kind = this.humanPlan?.kind ?? this.aiKind();
      this.delivery = person ? null : this.aiDelivery(kind);
      this.events.push({ kind: "runup", bowler: this.bowler.name, delivery: KINDS[kind].name });
      this.pendingKind = kind;
    }
  }
  private pendingKind: Kind = "stock";

  private stepRunup(input: CricketInput | null) {
    const k = this.pt / RUNUP_S;
    if (this.humanPlan && this.meterLocked === null) {
      this.meter = Math.min(1, k * 1.08);
      if (input?.bowl && this.pt > 0.15) this.meterLocked = clamp(input.meter ?? this.meter, 0, 1);
    }
    if (this.pt < RUNUP_S) return;
    if (this.humanPlan) {
      const m = this.meterLocked ?? 0.55 + this.rng.next() * 0.3;
      this.delivery = this.humanDelivery(this.humanPlan!.kind, this.humanPlan!.target, m);
    }
    this.release();
  }

  /** Human bowling: the meter's sweet spot is 0.78–0.9; past 0.97 is a no-ball. */
  humanDelivery(kind: Kind, target: { x: number; z: number }, m: number): Delivery {
    const def = KINDS[kind];
    const acc = clamp(1 - Math.abs(m - 0.84) / 0.42, 0, 1);
    const err = (1 - acc) * 1.1 * (0.5 + this.rng.next() * 0.5);
    const a = this.rng.next() * Math.PI * 2;
    const skill = this.bowler.bowl / 100;
    return {
      kind,
      speed: def.speed * (0.94 + 0.1 * skill) * (0.9 + 0.1 * acc),
      px: clamp(target.x + Math.cos(a) * err * 0.7, -2.2, 1.8),
      pz: clamp(target.z + Math.sin(a) * err * 1.5, 0.4, 14),
      swing: def.swing * (0.6 + 0.6 * skill),
      turn: def.turn * (0.6 + 0.6 * skill),
      e: def.e,
      noBall: m > 0.97,
    };
  }

  private aiKind(): Kind {
    const p = this.bowler;
    const r = this.rng.next();
    const death = this.inn.balls >= this.ballsPerInnings - 12;
    if (p.style === "spin") {
      const main: Kind = this.inn.bowler % 2 ? "offbreak" : "legbreak";
      return r < 0.62 ? main : r < 0.82 ? "armball" : "flighted";
    }
    if (death) return r < 0.42 ? "yorker" : r < 0.62 ? "slower" : r < 0.75 ? "bouncer" : "stock";
    return r < 0.38 ? "stock" : r < 0.56 ? "outswing" : r < 0.68 ? "inswing" : r < 0.8 ? "bouncer" : r < 0.9 ? "yorker" : "slower";
  }

  private aiDelivery(kind: Kind): Delivery {
    const def = KINDS[kind];
    const p = this.bowler;
    const lv = LEVELS[this.opts.difficulty];
    const sd = ((100 - p.bowl) / 100) * 0.45 * lv.bowl + 0.06;
    const speed = def.speed * (0.95 + p.bowl / 1000) * (1 + (this.rng.next() - 0.5) * 0.04);
    const swing = def.swing * (0.7 + this.rng.next() * 0.6);
    const turn = def.turn * (0.7 + this.rng.next() * 0.6) + (def.style === "pace" ? (this.rng.next() - 0.5) * 0.6 : 0);
    const pz = clamp(def.len + gauss(this.rng) * sd * 1.6, 0.3, 14);
    // Aim off so the movement brings it back onto off stump.
    const tIn = (PITCH - pz) / speed;
    const tOut = pz / (speed * 0.85);
    const px = -0.12 - (turn + swing * tIn) * tOut * 0.85;
    return { kind, speed, px: clamp(px + gauss(this.rng) * sd * 0.7, -2.2, 1.8), pz, swing, turn, e: def.e, noBall: this.rng.next() < 0.012 };
  }

  private release() {
    const d = this.delivery!;
    const spin = KINDS[d.kind].style === "spin";
    this.ball = { x: 0.6, y: spin ? 1.95 : 2.2, z: PITCH - 0.6 };
    this.vel = launch(this.ball, d);
    this.ballVisible = true;
    this.bounced = false;
    this.phase = "delivery";
    this.pt = 0;
    this.t = 0;
    this.pressAt = -1;
    this.aiPress = null;
    this.lastShot = null;
    this.result = null;
    this.ballRuns = 0;
    this.ballWicket = null;
    this.ballExtra = d.noBall ? "nb" : null;
    this.contactZ = d.pz < 6.2 ? 1.95 : 1.15;
    if (d.noBall) this.events.push({ kind: "noball" });
    this.events.push({ kind: "release", speed: Math.round(d.speed * 3.6) });
    this.remoteLeft = false;
    this.holdT = 0;
    if (!this.personBats) this.planAiShot();
  }

  /** Where the delivery will be when it reaches the bat (no shot). */
  private readBall() {
    const p = { ...this.ball };
    const v = { ...this.vel };
    let bounced = false;
    let t = 0;
    let len = this.delivery!.pz;
    for (; t < 3 && p.z > this.contactZ; t += 1 / 240) {
      if (this.flightStep(p, v, 1 / 240, bounced)) {
        bounced = true;
        len = p.z;
      }
    }
    return { x: p.x, y: p.y, t, len };
  }

  private planAiShot() {
    const d = this.delivery!;
    const read = this.readBall();
    const batter = this.striker;
    const skill = batter.bat / 100;
    const lv = LEVELS[this.opts.difficulty];
    const inn = this.inn;
    // How hard is this ball to score off?
    let diff = 0.3;
    if (read.len < 2.1 && Math.abs(read.x) < 0.3) diff = 0.85;
    else if (read.len >= 4.5 && read.len <= 7.5 && read.x > -0.5 && read.x < 0.1) diff = 0.58;
    else if (read.y > 1.1 && read.x > -0.2) diff = 0.5;
    else if (read.len >= 2.1 && read.len < 4.5) diff = 0.16;
    else if (read.x < -0.6 || read.x > 0.45) diff = 0.2;
    if (d.kind === "slower") diff += 0.15;
    diff += Math.min(0.15, (Math.abs(d.swing) + Math.abs(d.turn)) * 0.03);
    // How much risk to take.
    const ballsLeft = this.ballsPerInnings - inn.balls;
    let aggr = 0.45 + (ballsLeft < 24 ? 0.25 : 0) + (inn.balls < 36 ? 0.1 : 0);
    if (this.target) {
      const need = this.target - inn.runs;
      aggr = clamp((need / Math.max(1, ballsLeft)) * 0.45, 0.2, 1);
    }
    if (inn.wkts >= this.maxWkts - 2) aggr *= 0.75;
    if (this.opts.mode === "nets") aggr = 0.5;
    let shot: ShotType = this.rng.next() < aggr * (1 - diff) * 0.5 ? "loft" : "ground";
    if (diff > 0.55 && this.rng.next() > aggr + 0.4) shot = "defend";
    const nat = naturalAim(read.x, read.y, read.len);
    // Leaves: well outside off and not chasing.
    if (read.x < -0.75 && aggr < 0.55 && this.rng.next() < 0.7) {
      this.aiPress = null;
      return;
    }
    const sd = (0.034 + 0.07 * diff) * (1.45 - skill * 0.7) * lv.bat * (this.personBowls ? 1 : 0.9);
    let dt = gauss(this.rng) * sd;
    if (d.kind === "slower" && this.rng.next() < 0.6) dt -= 0.05;
    const aim = this.findGap(nat, shot === "loft");
    this.aiPress = { at: read.t - SWING_LAG + dt, shot, aim };
  }

  /** Pick a direction near the natural one that splits the fielders (ring ones for ground shots, deep ones for lofts). */
  private findGap(nat: number, loft: boolean) {
    const angles = this.fielders
      .filter((f) => f.role === "field" && (loft ? Math.hypot(f.x, f.z) > 40 : Math.hypot(f.x, f.z) < 40))
      .map((f) => Math.atan2(f.x, f.z) / deg);
    let best = nat;
    let bestGap = -1;
    for (let a = nat - 45; a <= nat + 45; a += 5) {
      let gap = 180;
      for (const fa of angles) {
        let d = Math.abs(a - fa);
        if (d > 180) d = 360 - d;
        gap = Math.min(gap, d);
      }
      const v = gap - Math.abs(a - nat) * 0.2 + this.rng.next() * 6;
      if (v > bestGap) {
        bestGap = v;
        best = a;
      }
    }
    return best;
  }

  /** Delivery flight: swing before the bounce, seam and turn off the pitch. Returns true on the bounce. */
  private flightStep(p: V3, v: V3, dt: number, bounced: boolean) {
    const d = this.delivery!;
    const sp = Math.hypot(v.x, v.y, v.z);
    if (!bounced) v.x += d.swing * dt;
    v.x -= DRAG * 0.6 * sp * v.x * dt;
    v.y -= G * dt + DRAG * 0.6 * sp * v.y * dt;
    v.z -= DRAG * 0.6 * sp * v.z * dt;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    if (p.y <= BALL_R && v.y < 0) {
      p.y = BALL_R;
      v.y = -v.y * d.e;
      const spin = KINDS[d.kind].style === "spin";
      v.z *= spin ? 0.8 : 0.87;
      v.x = v.x * 0.9 + d.turn;
      return true;
    }
    return false;
  }

  private stepDelivery(dt: number) {
    const sub = 4;
    for (let i = 0; i < sub; i++) {
      const prevZ = this.ball.z;
      const h = dt / sub;
      // Online: the remote batter sees the ball a moment later; hold it at the bat until their call arrives.
      if (this.remoteBats && this.pressAt < 0 && !this.remoteLeft && this.holdT < 0.6) {
        const p = { ...this.ball };
        const v = { ...this.vel };
        this.flightStep(p, v, h, this.bounced);
        if (prevZ > this.contactZ && p.z <= this.contactZ) {
          this.holdT += h;
          this.t -= h;
          continue;
        }
      }
      if (this.aiPress && this.pressAt < 0 && this.t >= this.aiPress.at) {
        this.pressAt = this.aiPress.at;
        this.pressShot = this.aiPress.shot;
        this.aim = this.aiPress.aim;
      }
      if (this.flightStep(this.ball, this.vel, h, this.bounced)) {
        this.bounced = true;
        this.events.push({ kind: "bounce", onPitch: true });
      }
      // The bat.
      if (prevZ > this.contactZ && this.ball.z <= this.contactZ) {
        if (this.batAtBall()) return;
      }
      // The pad (LBW).
      const padZ = this.contactZ - 0.35;
      if (prevZ > padZ && this.ball.z <= padZ && this.lastShot?.type !== "hit") {
        if (this.ball.x > 0.02 && this.ball.x < 0.42 && this.ball.y < 0.78) return this.padHit();
      }
      // The stumps.
      if (prevZ > 0 && this.ball.z <= 0) {
        if (Math.abs(this.ball.x) < STUMP_HALF + BALL_R && this.ball.y < STUMP_H + BALL_R) return this.bowled("Bowled");
        // Wide?
        if (!this.lastShot && (this.ball.x < -1.0 || this.ball.x > 0.62 || this.ball.y > 1.95)) {
          this.ballExtra = this.ballExtra ?? "wd";
          this.events.push({ kind: "wide" });
          this.umpires[0].pose = "wide";
        }
      }
      // Into the keeper's gloves.
      const k = this.fielders[0];
      if (this.ball.z <= k.z + 0.3 || this.pt > 4) return this.keeperTakes();
    }
  }

  /** The ball reaches the bat: shot or no shot. */
  private batAtBall(): boolean {
    const b = this.ball;
    const reach = b.x > -1.15 && b.x < 0.75 && b.y < 2.05;
    const d = this.delivery!;
    const bat = this.batters[0];
    if (this.pressAt < 0) {
      bat.shot = "leave";
      this.events.push({ kind: Math.abs(b.x) < 0.3 ? "beaten" : "leave" });
      return false;
    }
    const dtErr = this.pressAt + SWING_LAG - this.t;
    if (!reach) {
      this.lastShot = { type: "miss", speed: 0, dir: 0, elev: 0, quality: 0, label: "Out of reach" };
      this.events.push({ kind: "beaten" });
      return false;
    }
    const c = contact(this.rng, {
      xc: b.x,
      yc: b.y,
      len: d.pz,
      ballSpeed: d.speed,
      movement: Math.min(1, (Math.abs(d.swing) + Math.abs(d.turn)) / 3),
      aim: this.aim,
      shot: this.pressShot,
      dt: dtErr,
      skill: this.striker.bat / 100,
    });
    this.lastShot = c;
    bat.shot = this.pressShot === "defend" ? "defend" : b.y > 1.05 ? (b.x < -0.25 ? "cut" : "pull") : this.pressShot;
    if (c.type === "miss") {
      this.events.push({ kind: "beaten" });
      return false;
    }
    if (c.playedOn) {
      this.events.push({ kind: "edge" });
      this.bowled("Played on");
      return true;
    }
    const s = c.speed;
    this.vel = { x: Math.sin(c.dir * deg) * Math.cos(c.elev * deg) * s, y: Math.sin(c.elev * deg) * s, z: Math.cos(c.dir * deg) * Math.cos(c.elev * deg) * s };
    this.ball = { x: b.x, y: Math.max(BALL_R + 0.05, b.y), z: b.z };
    this.events.push(c.type === "edge" ? { kind: "edge" } : { kind: "hit", quality: c.quality, label: c.label, speed: Math.round(s * 3.6), loft: this.pressShot === "loft" });
    this.startLive();
    return true;
  }

  private padHit() {
    const d = this.delivery!;
    const b = { ...this.ball };
    const v = { ...this.vel };
    // Hawk-Eye: carry on to the stumps.
    for (let i = 0; i < 400 && b.z > 0; i++) this.flightStep(b, v, 1 / 240, true);
    const hitting = Math.abs(b.x) < STUMP_HALF + BALL_R * 0.5 && b.y < STUMP_H;
    const outsideLeg = d.px > STUMP_HALF + BALL_R;
    const outsideOffWithShot = this.ball.x < -STUMP_HALF - BALL_R && this.pressAt >= 0;
    const appeal = hitting || Math.abs(b.x) < 0.3;
    this.events.push({ kind: "pad", appeal });
    this.ballVisible = true;
    this.vel = { x: (this.rng.next() - 0.5) * 2, y: 0.5, z: 2 + this.rng.next() * 2 };
    if (hitting && !outsideLeg && !outsideOffWithShot && !this.freeHit) {
      this.wicket("LBW");
      this.umpires[0].pose = "out";
      this.endBall();
      return;
    }
    if (appeal) this.events.push({ kind: "notout" });
    // Leg bye? Just a dead ball.
    this.endBall();
  }

  private bowled(how: string) {
    this.broken[0] = 1;
    this.events.push({ kind: "stumps" });
    if (this.freeHit || this.ballExtra === "nb") {
      this.events.push({ kind: "notout" });
    } else this.wicket(how);
    this.vel = { x: this.vel.x * 0.3, y: 1, z: -4 };
    this.endBall();
  }

  private keeperTakes() {
    this.ball.z = this.fielders[0].z + 0.3;
    this.fielders[0].x = clamp(this.ball.x, -3, 3);
    this.fielders[0].pose = "catch";
    this.fielders[0].act = 0;
    this.ballVisible = false;
    if (this.ballExtra === "wd") this.result = { text: "Wide", runs: 1, wicket: false };
    this.endBall();
  }

  // ------------------------------------------------------------- the field

  private startLive() {
    this.phase = "live";
    this.pt = 0;
    this.t = 0;
    this.thrown = false;
    this.runClock = 0;
    this.runPush = 0;
    this.plan = this.planField(this.ball, this.vel);
    const pl = this.plan;
    // How many runs: what the batters judge safe before the throw comes in.
    if (pl.kind === "boundary") this.runPlan = 2;
    else {
      const ta = pl.at + 0.75 + Math.hypot(pl.x, pl.z - (pl.z > PITCH / 2 ? PITCH : 0)) / 28;
      const margin = this.personBats ? 0.35 : 0.12 + (1 - this.aggression()) * 0.3;
      let n = 0;
      while (n < 4 && runTime(n + 1) + margin < ta) n++;
      if (pl.kind === "catch" && pl.willCatch) n = Math.min(n, 1);
      this.runPlan = n;
    }
    // Fielders move.
    const f = this.fielders[pl.fielder];
    f.goal = { x: pl.x, z: pl.z, at: pl.at };
    // A second fielder backs up.
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < this.fielders.length; i++) {
      if (i === pl.fielder || i === 0) continue;
      const d = Math.hypot(this.fielders[i].x - pl.x, this.fielders[i].z - pl.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0 && bd < 40) this.fielders[best].goal = { x: pl.x * 0.85 + this.fielders[best].x * 0.15, z: pl.z * 0.85 + this.fielders[best].z * 0.15, at: pl.at + 0.6 };
  }

  private aggression() {
    const inn = this.inn;
    if (!this.target) return inn.balls > this.ballsPerInnings - 24 ? 0.8 : 0.5;
    const need = this.target - inn.runs;
    return clamp((need / Math.max(1, this.ballsPerInnings - inn.balls)) * 0.5, 0.2, 1);
  }

  /** Read the ball's flight: who gets there first, and whether it's a catch. */
  planField(p: V3, v: V3): Plan {
    const { samples, rope } = predict(p, v);
    const lv = LEVELS[this.opts.difficulty];
    let best: Plan | null = null;
    for (let i = 0; i < this.fielders.length; i++) {
      const f = this.fielders[i];
      const player = this.bowlTeam.players[f.p];
      const speed = (f.role === "keeper" ? 5 : 7) * (0.9 + player.field / 1000);
      const react = f.role === "keeper" ? 0.15 : 0.3;
      const reachR = f.role === "keeper" ? 1.4 : 1.2;
      for (const s of samples) {
        if (best && s.t >= best.at) break;
        const d = Math.max(0, Math.hypot(s.x - f.x, s.z - f.z) - reachR);
        const need = react + d / speed;
        if (need > s.t) continue;
        if (s.air && s.y > 2.7) continue;
        if (s.air && s.y > 0.12) {
          const slack = s.t - need;
          const sp = Math.hypot(v.x, v.y, v.z);
          let pc = (0.62 + player.field / 280) * lv.field;
          if (sp > 30) pc -= 0.18;
          if (slack < 0.18) pc -= 0.25;
          if (f.role === "keeper") pc += 0.08;
          if (this.freeHit || this.ballExtra === "nb") pc = 0;
          best = { kind: "catch", fielder: i, at: s.t, x: s.x, z: s.z, willCatch: this.rng.next() < clamp(pc, 0.15, 0.97) };
        } else if (!s.air || s.y <= 0.6) {
          best = { kind: "gather", fielder: i, at: s.t, x: s.x, z: s.z };
        } else continue;
        break;
      }
    }
    if (rope && (!best || rope.t < best.at)) {
      // Nobody gets there: who chases it to the rope.
      let chaser = 2;
      let cd = Infinity;
      for (let i = 1; i < this.fielders.length; i++) {
        const d = Math.hypot(this.fielders[i].x - rope.x, this.fielders[i].z - rope.z);
        if (d < cd) {
          cd = d;
          chaser = i;
        }
      }
      return { kind: "boundary", fielder: chaser, at: rope.t, x: rope.x, z: rope.z, six: rope.air };
    }
    if (best) return best;
    const last = samples[samples.length - 1];
    return { kind: "gather", fielder: 2, at: last.t + 2, x: last.x, z: last.z };
  }

  private pushRun() {
    if (this.thrown || this.runPush >= 1 || this.plan?.kind === "boundary") return;
    this.runPush = 1;
  }

  private stepLive(dt: number) {
    const pl = this.plan!;
    this.runClock += dt;
    if (!this.thrown) {
      stepBall(this.ball, this.vel, dt);
    }
    // Runners: they run what they planned (+ a push).
    const runs = this.runPlan + this.runPush;
    this.moveRunners(runs);
    if (!this.thrown && this.t >= pl.at) {
      const f = this.fielders[pl.fielder];
      const name = this.bowlTeam.players[f.p].name;
      if (pl.kind === "boundary") {
        const six = !!pl.six;
        const dist = Math.round(Math.hypot(this.ball.x, this.ball.z - 0));
        this.ballRuns = six ? 6 : 4;
        if (six) {
          this.sixesBy[this.inn.bat]++;
          this.longestBy[this.inn.bat] = Math.max(this.longestBy[this.inn.bat], dist);
          this.events.push({ kind: "six", dist });
          this.umpires[0].pose = "six";
        } else {
          this.events.push({ kind: "four" });
          this.umpires[0].pose = "four";
        }
        this.result = { text: six ? `SIX! ${dist} m` : "FOUR!", runs: this.ballRuns, wicket: false };
        this.thrown = true;
        this.endBall();
        return;
      }
      if (pl.kind === "catch") {
        if (pl.willCatch) {
          f.pose = "catch";
          f.act = 0;
          this.ballVisible = false;
          this.events.push({ kind: "catch", by: name, hard: Math.hypot(this.vel.x, this.vel.z) > 25 });
          this.wicket(`c ${name.split(" ")[1]} b ${this.bowler.name.split(" ")[1]}`);
          this.endBall();
          return;
        }
        // Put down: it pops out and the fielder gathers it.
        this.events.push({ kind: "drop", by: name });
        f.pose = "dive";
        f.act = 0;
        this.vel = { x: this.vel.x * 0.15, y: 1.2, z: this.vel.z * 0.15 };
        this.plan = { kind: "gather", fielder: pl.fielder, at: this.t + 1.0, x: this.ball.x + this.vel.x, z: this.ball.z + this.vel.z };
        return;
      }
      // Gathered: throw it in.
      this.events.push({ kind: "gather" });
      f.pose = "throw";
      f.act = 0;
      const toKeeper = Math.abs(this.ball.z - 0) < Math.abs(this.ball.z - PITCH) || this.ball.z < 0;
      const end = toKeeper ? 0 : PITCH;
      this.throwFrom = { x: this.ball.x, y: 1.6, z: this.ball.z };
      this.throwTo = { x: 0, y: 0.6, z: end + (toKeeper ? -0.6 : 0.6) };
      this.throwDur = 0.45 + Math.hypot(this.ball.x, this.ball.z - end) / 28;
      this.throwT = 0;
      this.thrown = true;
      this.events.push({ kind: "throw" });
      // The keeper or bowler comes to the stumps.
      if (toKeeper) this.fielders[0].goal = { x: 0, z: -0.6, at: this.t + 0.6 };
      else this.fielders[1].goal = { x: 0.3, z: PITCH + 0.6, at: this.t + 0.6 };
      return;
    }
    if (this.thrown && this.throwFrom && this.throwTo) {
      this.throwT += dt;
      const k = Math.min(1, this.throwT / this.throwDur);
      const a = this.throwFrom;
      const b = this.throwTo;
      const arc = Math.min(6, this.throwDur * 3);
      this.ball = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * arc, z: a.z + (b.z - a.z) * k };
      if (k >= 1) {
        // Ball's in: did they make their ground?
        const made = runTime(runs) <= this.runClock + 0.3;
        if (runs > 0 && !made) {
          this.broken[this.throwTo.z > PITCH / 2 ? 1 : 0] = 1;
          this.ballRuns = runs - 1;
          this.wicket("Run out", true);
        } else {
          this.ballRuns = runs;
          if (runs) this.events.push({ kind: "runs", n: runs });
        }
        this.endBall();
      }
    }
  }

  private moveRunners(runs: number) {
    const [s, n] = this.batters;
    const t = this.runClock;
    const progress = (tt: number) => {
      // Run legs: 0.2 s start, then 2.85 s a run with 0.3 s turns.
      const tt2 = Math.max(0, tt - 0.2);
      const leg = Math.floor(tt2 / 3.15);
      const f = Math.min(1, (tt2 - leg * 3.15) / 2.85);
      return { leg, f };
    };
    const { leg, f } = progress(t);
    const done = Math.min(leg, runs);
    const onLeg = leg < runs;
    const pos = (startAtBatEnd: boolean) => {
      const dir = (startAtBatEnd ? 1 : -1) * (done % 2 ? -1 : 1);
      const from = startAtBatEnd === (done % 2 === 0) ? CREASE : PITCH - CREASE;
      return onLeg ? from + dir * (PITCH - 2 * CREASE) * f : from;
    };
    if (runs > 0) {
      s.z = pos(true);
      s.x = 0.6;
      n.z = pos(false);
      n.x = -0.6;
      s.pose = n.pose = onLeg ? "run" : "stand";
      s.speed = n.speed = onLeg ? 6.5 : 0;
      s.heading = n.heading = 0;
    }
  }

  // ------------------------------------------------------------- outcomes

  private wicket(how: string, runOut = false) {
    const inn = this.inn;
    const out = inn.striker;
    const card = inn.cards[out];
    card.out = how;
    inn.wkts++;
    this.ballWicket = how;
    if (!runOut) {
      const bc = inn.bowl.get(inn.bowler)!;
      bc.wkts++;
      this.wktsBy[1 - inn.bat]++;
    }
    this.batters[0].pose = "out";
    this.events.push({ kind: "out", how, batter: this.batTeam.players[out].name, runs: card.runs, balls: card.balls + 1 });
    this.umpires[0].pose = "out";
    this.result = { text: how === "Run out" ? "RUN OUT!" : how === "LBW" ? "LBW!" : how.startsWith("c ") ? "CAUGHT!" : how.toUpperCase() + "!", runs: 0, wicket: true };
  }

  /** The ball is dead: score it, the over log, who's on strike. */
  private endBall() {
    const inn = this.inn;
    const extra = this.ballExtra;
    const legal = !extra;
    const runs = this.ballRuns;
    const ext = extra ? 1 : 0;
    inn.runs += runs + ext;
    inn.extras += ext;
    const card = inn.cards[inn.striker];
    const bc = inn.bowl.get(inn.bowler)!;
    bc.runs += runs + ext;
    if (legal) bc.balls++;
    if (extra !== "wd") {
      card.balls += 1;
      card.runs += runs;
      if (runs === 4) {
        card.fours++;
        inn.fours++;
      }
      if (runs === 6) {
        card.sixes++;
        inn.sixes++;
      }
    }
    this.runsBy[inn.bat] += runs;
    if (legal) inn.balls++;
    const sym = this.ballWicket ? "W" : extra === "wd" ? "wd" : extra === "nb" ? `nb${runs ? "+" + runs : ""}` : runs ? String(runs) : "•";
    inn.over.push(sym);
    if (!this.result) this.result = { text: extra === "wd" ? "Wide" : extra === "nb" ? "No ball! Free hit" : runs ? `${runs} run${runs > 1 ? "s" : ""}` : "Dot ball", runs, wicket: false };
    this.freeHit = extra === "nb";
    // New batter in.
    if (this.ballWicket) {
      if (inn.wkts < this.maxWkts && inn.next < this.batTeam.players.length) {
        inn.striker = inn.next++;
      }
    }
    if (runs % 2 === 1) [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
    this.phase = "dead";
    this.pt = 0;
  }

  private nextBall() {
    const inn = this.inn;
    // Innings over?
    const target = this.target;
    const allOut = inn.wkts >= this.maxWkts;
    const oversDone = inn.balls >= this.ballsPerInnings;
    const chased = target > 0 && inn.runs >= target;
    if (this.opts.mode === "nets") {
      inn.wkts = 0;
      if (inn.balls % 6 === 0 && inn.over.length) inn.over = [];
      if (oversDone) return this.finishMatch();
      return this.resetForBall();
    }
    if (allOut || oversDone || chased) {
      inn.worm.push(inn.runs);
      const summary = `${this.batTeam.name} ${inn.runs}/${inn.wkts} (${this.overs()})`;
      if (this.cur === 0 && this.opts.mode === "match") {
        this.events.push({ kind: "inningsEnd", summary });
        this.phase = "break";
        this.pt = 0;
        return;
      }
      return this.finishMatch();
    }
    if (inn.balls % 6 === 0 && inn.over.length && inn.over.filter((s) => s !== "wd" && !s.startsWith("nb")).length >= 6) {
      inn.worm.push(inn.runs);
      this.events.push({ kind: "overEnd", summary: `${inn.over.join(" ")}` });
      inn.over = [];
      [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
      inn.lastBowler = inn.bowler;
      this.pickBowler();
      this.placeField(this.personBowls ? this.field : undefined);
    }
    this.resetForBall();
  }

  private afterBreak() {
    if (this.phase !== "break") return;
    this.startInnings((1 - this.inn.bat) as 0 | 1);
    this.resetForBall();
  }

  private resetForBall() {
    this.phase = "plan";
    this.pt = 0;
    this.t = 0;
    this.ballVisible = false;
    this.ball = { x: 0.6, y: 2, z: PITCH };
    this.vel = { x: 0, y: 0, z: 0 };
    this.plan = null;
    this.thrown = false;
    this.throwFrom = this.throwTo = null;
    this.runPlan = this.runPush = 0;
    this.runClock = 0;
    this.lastShot = null;
    this.batters = [this.newBatter(), { ...this.newBatter(), x: -1.1, z: PITCH - CREASE, pose: "stand" }];
    for (const f of this.fielders) {
      f.goal = null;
      f.x = f.hx;
      f.z = f.hz;
      f.pose = f.role === "keeper" ? "keeper" : f.role === "bowler" ? "stand" : "crouch";
    }
    this.umpires[0].pose = "stand";
  }

  private finishMatch() {
    this.phase = "done";
    const inns = this.innings;
    const mode = this.opts.mode;
    let winner: 0 | 1 | null = null;
    let text = "";
    if (mode === "nets") {
      text = `${inns[0].runs} runs in the nets`;
    } else if (mode === "superover") {
      const need = this.target;
      const inn = inns[0];
      const ok = inn.runs >= need;
      winner = ok ? inn.bat : ((1 - inn.bat) as 0 | 1);
      text = ok ? `${this.teams[inn.bat].name} chased ${need} with ${6 - inn.balls} balls to spare` : `${this.teams[1 - inn.bat].name} defended ${need - 1}`;
    } else {
      const [a, b] = inns;
      if (b.runs > a.runs) {
        text = `${this.teams[b.bat].name} won by ${this.maxWkts - b.wkts} wicket${this.maxWkts - b.wkts === 1 ? "" : "s"}`;
        winner = b.bat;
      } else if (b.runs < a.runs) {
        const by = a.runs - b.runs;
        text = `${this.teams[a.bat].name} won by ${by} run${by === 1 ? "" : "s"}`;
        winner = a.bat;
      } else {
        text = "Match tied!";
      }
    }
    this.setResult(winner, text);
    this.events.push({ kind: "matchEnd", result: text, won: this.won });
  }

  /** The result, seen from your side. */
  setResult(winner: 0 | 1 | null, text: string) {
    this.winner = winner;
    this.resultText = text;
    this.won = this.opts.human < 0 || this.opts.mode === "nets" || winner === null ? null : winner === this.opts.human;
  }

  /** Platform score: runs you made, wickets you took, a win bonus. */
  score() {
    return this.humanRuns + this.humanWkts * 20 + (this.won ? 150 : 0) + this.sixes * 4;
  }

  // -------------------------------------------------------------- people

  private stepPeople(dt: number) {
    // The bowler runs in and bowls.
    const bw = this.fielders[1];
    if (bw) {
      if (this.phase === "runup") {
        const k = this.pt / RUNUP_S;
        bw.x = 0.9 - 0.3 * k;
        bw.z = PITCH + 16 - 15.4 * Math.min(1, k / 0.82);
        bw.speed = k < 0.8 ? 6.5 : 2;
        bw.heading = Math.PI;
        bw.pose = k < 0.72 ? "run" : "bowl";
        bw.act = clamp((k - 0.72) / 0.42, 0, 1);
      } else if (this.phase === "delivery") {
        bw.act = Math.min(1, bw.act + dt * 2);
        bw.z = Math.max(PITCH - 3, bw.z - dt * 3);
      }
    }
    // The striker: stance, then the shot.
    const s = this.batters[0];
    if (s.pose === "stance" && this.pressAt >= 0 && this.phase !== "plan" && this.phase !== "runup") {
      s.pose = "shot";
      s.act = 0;
      if (s.shot === "leave") s.shot = this.pressShot;
    }
    if (s.pose === "shot") s.act = Math.min(1, s.act + dt / 0.55);
    // Fielders chase.
    for (const f of this.fielders) {
      if (f.role === "bowler" && (this.phase === "runup" || this.phase === "plan")) continue;
      if (f.goal) {
        const dx = f.goal.x - f.x;
        const dz = f.goal.z - f.z;
        const d = Math.hypot(dx, dz);
        const left = Math.max(0.05, f.goal.at - this.t);
        const want = Math.min(f.role === "keeper" ? 5.5 : 7.5, d / left);
        if (d > 0.05) {
          const step = Math.min(d, want * dt);
          f.x += (dx / d) * step;
          f.z += (dz / d) * step;
          f.heading = Math.atan2(dx, dz);
          f.speed = want;
          if (f.pose !== "catch" && f.pose !== "throw" && f.pose !== "dive") f.pose = want > 0.6 ? "run" : "stand";
        } else {
          f.speed = 0;
          if (f.pose === "run") f.pose = "stand";
        }
      }
      if (f.pose === "catch" || f.pose === "throw" || f.pose === "dive") f.act = Math.min(1, f.act + dt * 1.6);
    }
  }

  // ------------------------------------------------------------- online

  /**
   * Guest side of an online match: the host's snapshots set the state; in
   * between, the ball and people carry on, and while you bat the delivery is
   * flown here so the timing of your shot is exactly what you see.
   */
  private stepPuppet(dt: number) {
    this.t += dt;
    this.pt += dt;
    if (this.phase === "delivery" && this.localFlight && this.delivery) {
      const sub = 4;
      for (let i = 0; i < sub; i++) {
        const prevZ = this.ball.z;
        const p = { ...this.ball };
        const v = { ...this.vel };
        if (this.flightStep(p, v, dt / sub, this.bounced)) {
          this.bounced = true;
          this.events.push({ kind: "bounce", onPitch: true });
        }
        if (prevZ > this.contactZ && p.z <= this.contactZ) {
          // At the bat: wait here for the host's verdict if you played; otherwise it's gone past.
          if (this.localPress >= 0 && this.lastShot?.type !== "miss") return;
          this.localLeave = true;
        }
        this.ball = p;
        this.vel = v;
        if (this.ball.z < this.fielders[0]?.z + 0.3) {
          this.ballVisible = false;
          return;
        }
      }
    } else if (this.phase === "live" && !this.netThrown) {
      stepBall(this.ball, this.vel, dt);
    }
    if (this.phase === "runup" && this.meterLocked === null) this.meter = Math.min(1, (this.pt / RUNUP_S) * 1.08);
    const s = this.batters[0];
    if (s?.pose === "shot") s.act = Math.min(1, s.act + dt / 0.55);
  }

  /** Guest: you played a shot (shown straight away; the host decides what happened). */
  localShot(shot: ShotType) {
    if (this.localPress >= 0 || this.phase !== "delivery") return -1;
    this.localPress = this.t;
    const s = this.batters[0];
    s.pose = "shot";
    s.act = 0;
    s.shot = shot;
    return this.localPress;
  }

  // ---------------------------------------------------------- headless

  /** Sim the rest of the match (AI both sides) – for tests and "simulate". */
  simulateToEnd(maxSteps = 2_000_000) {
    const was = this.autopilot;
    this.autopilot = true;
    const inp = emptyInput();
    inp.next = true;
    for (let i = 0; i < maxSteps && this.phase !== "done"; i++) {
      this.step(1 / 60, inp);
      this.events.length = 0;
    }
    this.autopilot = was;
  }
}

/** Time to complete n runs (s). */
export const runTime = (n: number) => (n <= 0 ? 0 : 0.2 + n * 2.85 + (n - 1) * 0.3);
