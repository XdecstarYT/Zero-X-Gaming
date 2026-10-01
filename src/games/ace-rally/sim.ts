import { createRng, type Rng } from "../engine/rng";
import { TennisScore, type MatchFormat, type Side } from "./score";

/**
 * Ace Rally: singles tennis. Pure rules and physics, no DOM.
 *
 * World frame (metres): the net along x = 0, you on the near side (x < 0),
 * the AI on the far side; z across the court, y up. The ball flies with drag
 * and Magnus lift from its spin (topspin dips, slice floats), and bounces
 * off the surface with its own pace and height. Shots are aimed at a spot
 * on the far court and solved to land there, then scattered by timing,
 * footwork and the pace of the ball coming in.
 */

export const HALF_L = 11.885;
export const SINGLES = 4.115;
export const DOUBLES = 5.485;
export const SERVICE = 6.4;
export const BALL_R = 0.033;
const G = 9.81;
const DRAG = 0.0198;
const MAGNUS = 0.0072;

export type Surface = "hard" | "clay" | "grass";
export const SURFACES: Record<Surface, { name: string; sub: string; e: number; f: number }> = {
  hard: { name: "Hard court", sub: "True bounce, all-court", e: 0.76, f: 0.72 },
  clay: { name: "Clay", sub: "Slow, high, long rallies", e: 0.82, f: 0.6 },
  grass: { name: "Grass", sub: "Fast and low: serve and volley", e: 0.66, f: 0.84 },
};

export type Difficulty = "rookie" | "pro" | "legend";
export const LEVELS: Record<Difficulty, { name: string; speed: number; react: number; error: number; pace: number }> = {
  rookie: { name: "Rookie", speed: 4.4, react: 0.32, error: 0.95, pace: 0.86 },
  pro: { name: "Pro", speed: 5.0, react: 0.22, error: 0.6, pace: 0.96 },
  legend: { name: "Legend", speed: 5.6, react: 0.14, error: 0.38, pace: 1.05 },
};

export { RIVALS, type Rival } from "./rivals";
import type { Rival } from "./rivals";

export type ShotKind = "topspin" | "slice" | "lob" | "drop" | "serve" | "smash";

export interface ShotDef {
  name: string;
  /** Pace (m/s) range and spin (−1 slice … +1 topspin). */
  speed: [number, number];
  spin: number;
  /** Net clearance the solver keeps (m). */
  clear: number;
  high?: boolean;
}

export const SHOTS: Record<ShotKind, ShotDef> = {
  topspin: { name: "Topspin drive", speed: [27, 35], spin: 0.85, clear: 0.45 },
  slice: { name: "Slice", speed: [20, 25], spin: -0.75, clear: 0.25 },
  lob: { name: "Lob", speed: [17, 21], spin: 0.4, clear: 3, high: true },
  drop: { name: "Drop shot", speed: [11, 14], spin: -0.85, clear: 0.2 },
  serve: { name: "Serve", speed: [44, 58], spin: 0.25, clear: 0.04 },
  smash: { name: "Smash", speed: [38, 46], spin: 0.1, clear: 0.1 },
};

/** Which side of the net each player is on (−1 near, +1 far). */
export const sideOf = (p: Side) => (p === 0 ? -1 : 1);

/** Net height at z (the cord sags to 0.914 m in the middle). */
export function netHeight(z: number) {
  const k = Math.min(1, Math.abs(z) / (DOUBLES + 0.914));
  return 0.914 + 0.156 * k * k;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
}

/** One physics step: gravity, drag, Magnus (vertical plane), no bounce. */
export function stepAir(b: Ball, dt: number) {
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  const hs = Math.hypot(b.vx, b.vz) || 1;
  // ω = spin · (up × ĥ); a = k|v| (ω × v): topspin pushes down along the flight.
  const ox = (b.vz / hs) * b.spin;
  const oz = (-b.vx / hs) * b.spin;
  const mx = -oz * b.vy;
  const my = oz * b.vx - ox * b.vz;
  const mz = ox * b.vy;
  const km = MAGNUS * sp;
  b.vx += (-DRAG * sp * b.vx + km * mx) * dt;
  b.vy += (-G - DRAG * sp * b.vy + km * my) * dt;
  b.vz += (-DRAG * sp * b.vz + km * mz) * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
}

/** The bounce: restitution and friction from the surface, kicked on by topspin, kept low by slice. */
export function bounce(b: Ball, surface: Surface) {
  const s = SURFACES[surface];
  b.y = BALL_R;
  const e = s.e * (1 - 0.18 * Math.max(0, -b.spin)) * (1 + 0.08 * Math.max(0, b.spin));
  b.vy = Math.abs(b.vy) * e;
  const f = s.f * (1 + 0.12 * b.spin);
  b.vx *= f;
  b.vz *= f;
  b.spin *= 0.5;
}

/** Simulate a shot in flight to its first landing: where, and its clearance over the net. */
export function flight(b0: Ball) {
  const b = { ...b0 };
  const dt = 1 / 240;
  let clear = Infinity;
  let t = 0;
  for (; t < 6 && b.y > BALL_R; t += dt) {
    const px = b.x;
    stepAir(b, dt);
    if ((px < 0) !== (b.x < 0)) clear = Math.min(clear, b.y - netHeight(b.z));
  }
  return { x: b.x, z: b.z, t, clear };
}

/**
 * Launch velocity from `from` to land at (tx, tz) with `speed` and `spin`,
 * clearing the net by `clear`. Low trajectory unless `high` (a lob). Lowers
 * the pace if it has to. Returns the ball, ready to fly.
 */
export function solveShot(from: { x: number; y: number; z: number }, tx: number, tz: number, speed: number, spin: number, clear: number, high = false): Ball {
  const dx = tx - from.x;
  const dz = tz - from.z;
  const dist = Math.hypot(dx, dz);
  const ux = dx / dist;
  const uz = dz / dist;
  const make = (v: number, el: number): Ball => ({ x: from.x, y: from.y, z: from.z, vx: ux * Math.cos(el) * v, vy: Math.sin(el) * v, vz: uz * Math.cos(el) * v, spin });
  const range = (v: number, el: number) => {
    const f = flight(make(v, el));
    return { d: (f.x - from.x) * ux + (f.z - from.z) * uz, clear: f.clear };
  };
  let v = speed;
  let best: Ball | null = null;
  for (let tries = 0; tries < 12; tries++) {
    // Find the angle of maximum range, then bisect on the low (or high) branch.
    let peak = 0;
    let peakD = -Infinity;
    for (let a = -0.4; a <= 1.25; a += 0.12) {
      const r = range(v, a).d;
      if (r > peakD) {
        peakD = r;
        peak = a;
      }
    }
    if (peakD < dist) {
      best = make(v, peak);
      v *= 1.06;
      if (v > speed * 1.25) break;
      continue;
    }
    let lo = high ? peak : -0.45;
    let hi = high ? 1.4 : peak;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const r = range(v, mid).d;
      if (high ? r > dist : r < dist) lo = mid;
      else hi = mid;
    }
    const el = (lo + hi) / 2;
    best = make(v, el);
    const c = range(v, el).clear;
    if (c >= clear || high) return best;
    v *= 0.94;
  }
  return best!;
}

export interface PlayerState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Facing along +x (near) or −x (far). */
  swing: { kind: ShotKind | "whiff"; fore: boolean; t: number } | null;
  /** Shot button pressed and waiting for the ball (sim time it was pressed). */
  armed: { kind: ShotKind; at: number } | null;
}

export interface Stats {
  points: number;
  aces: number;
  doubleFaults: number;
  winners: number;
  errors: number;
  firstIn: number;
  firstServes: number;
  fastestServe: number;
  longestRally: number;
}

export type Phase = "intro" | "serve" | "toss" | "rally" | "dead" | "changeover" | "over";

export type TennisEvent =
  | { kind: "toss"; who: Side }
  | { kind: "hit"; who: Side; shot: ShotKind; kmh: number; fore: boolean; quality: number }
  | { kind: "whiff"; who: Side }
  | { kind: "bounce"; x: number; z: number; in: boolean; margin: number; who: Side }
  | { kind: "net"; cord: boolean }
  | { kind: "let" }
  | { kind: "fault"; second: boolean }
  | { kind: "point"; winner: Side; why: "ace" | "winner" | "error" | "double" | "out" | "net" | "unreturned"; rally: number; call: string }
  | { kind: "game"; winner: Side; games: [number, number]; break: boolean }
  | { kind: "set"; winner: Side; sets: [number, number][] }
  | { kind: "changeover" }
  | { kind: "over"; winner: Side };

export interface TennisInput {
  /** Movement (−1..1): mx toward the net (forward), mz to your right. */
  mx: number;
  mz: number;
  /** Aim at contact (−1..1): left/right and short/deep. */
  ax: number;
  ay: number;
  /** A shot button pressed this step. */
  shot: ShotKind | null;
  /** Serve: press to toss, press again to hit. */
  serve: boolean;
}

export const NO_INPUT: TennisInput = { mx: 0, mz: 0, ax: 0, ay: 0, shot: null, serve: false };

export interface TennisOptions {
  seed: number;
  difficulty: Difficulty;
  surface: Surface;
  format: MatchFormat;
  rival: Rival;
  /** Name shown for you. */
  you?: string;
  /** Movement assist: you run to the ball, you choose the shot. */
  autoRun?: boolean;
}

const TOSS_PEAK = 0.52;

export class TennisSim {
  readonly rng: Rng;
  readonly level: (typeof LEVELS)[Difficulty];
  readonly surface: Surface;
  readonly rival: Rival;
  readonly names: [string, string];
  score: TennisScore;
  phase: Phase = "intro";
  phaseT = 0;
  time = 0;
  players: [PlayerState, PlayerState];
  ball: Ball = { x: 0, y: -1, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 };
  /** Ball in play: who hit it last, bounces since, is it a serve. */
  last: Side = 0;
  bounces = 0;
  isServe = false;
  serveNo: 1 | 2 = 1;
  rally = 0;
  ballLive = false;
  /** Toss: time since the toss. */
  tossT = 0;
  stats: [Stats, Stats];
  events: TennisEvent[] = [];
  /** AI plays your side too (tests, Live Sports). */
  autopilot = false;
  autoRun: boolean;
  /** Where each side's AI wants to be, and its planned shot. */
  private plan: [{ x: number; z: number; react: number; shot: ShotKind | null; at: number } | null, { x: number; z: number; react: number; shot: ShotKind | null; at: number } | null] = [null, null];
  private aiServeAt = 0;
  private lastHitTouch = false;

  constructor(o: TennisOptions) {
    this.rng = createRng(o.seed);
    this.level = LEVELS[o.difficulty];
    this.surface = o.surface;
    this.rival = o.rival;
    this.names = [o.you ?? "You", o.rival.name];
    this.autoRun = !!o.autoRun;
    this.score = new TennisScore(o.format, this.rng.next() < 0.5 ? 0 : 1);
    const blank = (): PlayerState => ({ x: 0, z: 0, vx: 0, vz: 0, swing: null, armed: null });
    this.players = [blank(), blank()];
    const s = (): Stats => ({ points: 0, aces: 0, doubleFaults: 0, winners: 0, errors: 0, firstIn: 0, firstServes: 0, fastestServe: 0, longestRally: 0 });
    this.stats = [s(), s()];
    this.setupPoint();
  }

  private emit(e: TennisEvent) {
    this.events.push(e);
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
  }

  get server(): Side {
    return this.score.server;
  }

  /** Server and receiver to their spots for the next point. */
  private setupPoint() {
    const s = this.server;
    const r = (1 - s) as Side;
    // Deuce court: the server's right. Near player faces +x (right is +z); far faces −x.
    const right = (p: Side) => (p === 0 ? 1 : -1);
    const sz = (this.score.court === "deuce" ? 1 : -1) * right(s);
    this.players[s].x = sideOf(s) * (HALF_L + 0.3);
    this.players[s].z = sz * 0.9;
    this.players[r].x = sideOf(r) * (HALF_L + 0.6);
    this.players[r].z = -sz * 2.6;
    for (const p of this.players) {
      p.vx = p.vz = 0;
      p.swing = null;
      p.armed = null;
    }
    this.ball = { x: this.players[s].x, y: -1, z: this.players[s].z, vx: 0, vy: 0, vz: 0, spin: 0 };
    this.ballLive = false;
    this.isServe = true;
    this.rally = 0;
    this.bounces = 0;
    this.plan = [null, null];
    this.aiServeAt = 1.0 + this.rng.next() * 0.9;
  }

  /** Whose input drives side p this step. */
  private ai(p: Side) {
    return p === 1 || this.autopilot;
  }

  step(dt: number, input: TennisInput) {
    if (this.phase === "over") return;
    this.time += dt;
    this.phaseT += dt;
    const me = this.players[0];
    if (input.shot && !this.ai(0)) me.armed = { kind: input.shot, at: this.time };
    if (me.armed && this.time - me.armed.at > 1.5) me.armed = null;
    for (const p of this.players) if (p.swing) {
      p.swing.t += dt;
      if (p.swing.t > 0.7) p.swing = null;
    }

    switch (this.phase) {
      case "intro":
        if (this.phaseT > 2.2) this.setPhase("serve");
        break;
      case "serve": {
        const s = this.server;
        const go = this.ai(s) ? this.phaseT > this.aiServeAt : input.serve && this.phaseT > 0.3;
        if (go) {
          this.tossT = 0;
          this.setPhase("toss");
          this.emit({ kind: "toss", who: s });
        }
        this.moveReceiver(dt, input);
        break;
      }
      case "toss": {
        const s = this.server;
        this.tossT += dt;
        const sp = this.players[s];
        // The toss: up from the hand, a little in front.
        this.ball = { x: sp.x - sideOf(s) * 0.35, y: 1.55 + 5.2 * this.tossT - 4.9 * this.tossT * this.tossT, z: sp.z + (s === 0 ? 0.25 : -0.25), vx: 0, vy: 0, vz: 0, spin: 0 };
        const hit = this.ai(s) ? this.tossT >= TOSS_PEAK + (this.rng.next() - 0.5) * 0.02 : input.serve;
        if (hit) this.serve(s, this.ai(s) ? this.aiServeQuality() : Math.max(0, 1 - Math.abs(this.tossT - TOSS_PEAK) / 0.22), input);
        else if (this.tossT > 1.05) {
          // Let it drop and toss again.
          this.ball.y = -1;
          this.setPhase("serve");
          this.aiServeAt = 0.6;
        }
        this.moveReceiver(dt, input);
        break;
      }
      case "rally":
        this.stepRally(dt, input);
        break;
      case "dead":
        this.stepDeadBall(dt);
        if (this.phaseT > (this.faultReplay || this.letReplay ? 1.2 : 2.3)) this.nextPoint();
        break;
      case "changeover":
        if (this.phaseT > 3) {
          this.setupPoint();
          this.setPhase("serve");
        }
        break;
    }
  }

  /** The ball after the point: rolls on, slows. */
  private stepDeadBall(dt: number) {
    const b = this.ball;
    if (b.y < -0.5) return;
    stepAir(b, dt);
    if (b.y <= BALL_R && b.vy < 0) {
      bounce(b, this.surface);
      if (Math.abs(b.vy) < 0.4) b.vy = 0;
    }
    if (Math.abs(b.x) > HALF_L + 6 || Math.abs(b.z) > 9) {
      b.vx *= 0.2;
      b.vz *= 0.2;
    }
  }

  private aiServeQuality() {
    return Math.max(0.3, Math.min(1, 1 - Math.abs(this.rng.next() + this.rng.next() - 1) * this.level.error));
  }

  private moveReceiver(dt: number, input: TennisInput) {
    const r = (1 - this.server) as Side;
    if (!this.ai(r) && !this.autoRun) this.movePlayer(r, dt, input.mx, input.mz);
  }

  /** Move with acceleration and a top speed; never across the net. */
  private movePlayer(p: Side, dt: number, fwd: number, right: number, speedK = 1) {
    const pl = this.players[p];
    const s = sideOf(p);
    // Your forward is toward the net: −s along x. Right: +z near, −z far.
    let wx = -s * fwd;
    let wz = (p === 0 ? 1 : -1) * right;
    const m = Math.hypot(wx, wz);
    if (m > 1) {
      wx /= m;
      wz /= m;
    }
    const top = (p === 0 && !this.autopilot ? 5.6 : this.level.speed) * speedK * (pl.swing && pl.swing.t < 0.35 ? 0.4 : 1);
    const acc = 22;
    const tx = wx * top;
    const tz = wz * top;
    const k = Math.min(1, (acc * dt) / Math.max(0.01, Math.hypot(tx - pl.vx, tz - pl.vz)));
    pl.vx += (tx - pl.vx) * k;
    pl.vz += (tz - pl.vz) * k;
    pl.x += pl.vx * dt;
    pl.z += pl.vz * dt;
    // Stay on your side, inside the run-off.
    const near = 0.5;
    if (s < 0) pl.x = Math.max(-HALF_L - 6, Math.min(-near, pl.x));
    else pl.x = Math.min(HALF_L + 6, Math.max(near, pl.x));
    pl.z = Math.max(-8, Math.min(8, pl.z));
  }

  /** Steer side p toward a spot (the AI's legs, or movement assist). */
  private runTo(p: Side, dt: number, tx: number, tz: number) {
    const pl = this.players[p];
    const dx = tx - pl.x;
    const dz = tz - pl.z;
    const d = Math.hypot(dx, dz);
    const s = sideOf(p);
    const k = d < 0.15 ? 0 : Math.min(1, d / 1.2);
    // Convert the world direction to that player's forward/right.
    const fwd = d ? (-s * dx * k) / d : 0;
    const right = d ? ((p === 0 ? 1 : -1) * dz * k) / d : 0;
    this.movePlayer(p, dt, fwd, right);
  }

  // ------------------------------------------------------------------ serve

  private serve(s: Side, quality: number, input: TennisInput) {
    const r = (1 - s) as Side;
    const sp = this.players[s];
    const first = this.serveNo === 1;
    const def = SHOTS.serve;
    // Target in the service box: wide, body or down the T.
    const boxSign = Math.sign(sp.z) * -1 || 1;
    this.serveBox = boxSign;
    let aim: number;
    if (this.ai(s)) aim = this.rng.next() < 0.45 ? 0.85 : this.rng.next() < 0.6 ? 0.15 : 0.5;
    else aim = 0.5 + (s === 0 ? input.ax : -input.ax) * boxSign * 0.42 * (s === 0 ? 1 : -1);
    aim = Math.max(0.08, Math.min(0.92, aim));
    const tz = boxSign * SINGLES * aim;
    const tx = sideOf(r) * (SERVICE - 0.9 - this.rng.next() * 0.6);
    const pace = (first ? def.speed[0] + (def.speed[1] - def.speed[0]) * quality : 40) * (this.ai(s) ? this.level.pace : 1);
    const spin = first ? def.spin : 0.85;
    // Scatter: the first serve is a risk, the second is safe.
    const err = (first ? 0.75 : 0.5) * (1.25 - quality) * (this.ai(s) ? this.level.error * 1.3 : 0.85);
    const ex = tx + this.gauss() * err * 0.9;
    const ez = tz + this.gauss() * err;
    const from = { x: this.ball.x, y: Math.max(2.4, this.ball.y), z: this.ball.z };
    this.ball = solveShot(from, ex, ez, pace, spin, def.clear);
    this.last = s;
    this.bounces = 0;
    this.isServe = true;
    this.netted = false;
    this.pendingLet = false;
    this.ballLive = true;
    this.rally = 0;
    this.lastHitTouch = false;
    sp.swing = { kind: "serve", fore: true, t: 0.3 };
    const kmh = Math.round(Math.hypot(this.ball.vx, this.ball.vy, this.ball.vz) * 3.6);
    if (first) this.stats[s].firstServes++;
    this.stats[s].fastestServe = Math.max(this.stats[s].fastestServe, kmh);
    this.emit({ kind: "hit", who: s, shot: "serve", kmh, fore: true, quality });
    this.setPhase("rally");
  }

  // ------------------------------------------------------------------ rally

  private stepRally(dt: number, input: TennisInput) {
    const b = this.ball;
    // Players: AI sides run to their plan; you move (or the assist runs you).
    for (const p of [0, 1] as Side[]) {
      if (this.ai(p) || (p === 0 && this.autoRun)) this.aiMove(p, dt);
      else this.movePlayer(p, dt, input.mx, input.mz);
    }
    if (!this.ballLive) return;
    const px = b.x;
    const py = b.y;
    stepAir(b, dt);
    // The net.
    if ((px < 0) !== (b.x < 0) && Math.abs(b.z) < DOUBLES + 0.914) {
      const h = netHeight(b.z);
      if (b.y < h + BALL_R) {
        if (b.y > h - 0.02 && this.rng.next() < 0.6) {
          // Clips the tape and dribbles over.
          if (this.isServe) {
            this.emit({ kind: "net", cord: true });
            b.vx *= 0.35;
            b.vy = Math.abs(b.vy) * 0.3 + 0.5;
            b.vz *= 0.35;
            this.pendingLet = true;
          } else {
            this.emit({ kind: "net", cord: true });
            b.vx *= 0.45;
            b.vy = 1.2 + this.rng.next();
            b.vz *= 0.5;
          }
        } else {
          this.emit({ kind: "net", cord: false });
          b.x = px;
          b.vx *= -0.12;
          b.vz *= 0.3;
          b.vy = Math.min(b.vy, 0) * 0.3;
          this.netted = true;
        }
      }
    }
    // Bounce.
    if (b.y <= BALL_R && py > BALL_R) {
      this.onBounce();
      if (this.phase !== "rally") return;
      bounce(b, this.surface);
    }
    // Contact: the ball reaching a player.
    for (const p of [0, 1] as Side[]) this.tryHit(p, input);
    // Way out: the ball has gone past everyone.
    if (Math.abs(b.x) > HALF_L + 9 || Math.abs(b.z) > 12 || (b.y < 0 && Math.abs(b.vy) < 0.1)) {
      // A ball that landed in and went untouched: the hitter wins.
      if (this.bounces >= 1) this.endPoint(this.last, this.isServe ? "ace" : "winner");
      else this.endPoint((1 - this.last) as Side, "out");
    }
  }

  private pendingLet = false;
  /** Which service box (sign of z) the serve must land in. */
  private serveBox = 1;
  private netted = false;

  private onBounce() {
    const b = this.ball;
    const h = this.last;
    const o = (1 - h) as Side;
    const onSide = b.x < 0 ? 0 : 1;
    if (this.netted || onSide === h) {
      // Into the net, or back on your own side.
      if (this.isServe) return this.fault();
      return this.endPoint(o, "net");
    }
    if (this.bounces === 0) {
      // First bounce on the receiver's side: in or out?
      let inside: boolean;
      let margin: number;
      if (this.isServe) {
        const boxSign = this.serveBox;
        const dx = SERVICE - Math.abs(b.x);
        const dzIn = SINGLES - Math.abs(b.z);
        const dzCentre = b.z * boxSign;
        margin = Math.min(dx, dzIn, dzCentre);
        inside = margin >= -BALL_R;
      } else {
        margin = Math.min(HALF_L - Math.abs(b.x), SINGLES - Math.abs(b.z));
        inside = margin >= -BALL_R;
      }
      this.emit({ kind: "bounce", x: b.x, z: b.z, in: inside, margin, who: h });
      if (!inside) {
        if (this.isServe) return this.fault();
        return this.endPoint(o, "out");
      }
      if (this.isServe && this.pendingLet) {
        this.emit({ kind: "let" });
        this.pendingLet = false;
        this.ballLive = false;
        this.setPhase("dead");
        this.letReplay = true;
        return;
      }
      if (this.isServe && this.serveNo === 1) this.stats[h].firstIn++;
      this.bounces = 1;
      return;
    }
    // Second bounce: the receiver didn't get there.
    this.emit({ kind: "bounce", x: b.x, z: b.z, in: true, margin: 1, who: h });
    this.endPoint(h, this.isServe && this.rally === 0 ? "ace" : "winner");
  }

  private letReplay = false;

  private fault() {
    const s = this.server;
    this.ballLive = false;
    if (this.serveNo === 1) {
      this.emit({ kind: "fault", second: false });
      this.serveNo = 2;
      this.setPhase("dead");
      this.faultReplay = true;
      return;
    }
    this.emit({ kind: "fault", second: true });
    this.stats[s].doubleFaults++;
    this.endPoint((1 - s) as Side, "double");
  }

  private faultReplay = false;

  private tryHit(p: Side, input: TennisInput) {
    const b = this.ball;
    const pl = this.players[p];
    const o = (1 - p) as Side;
    const s = sideOf(p);
    if (this.last === p || !this.ballLive) return;
    // Coming toward p (on p's side, moving away from the net).
    if (Math.sign(b.x) !== s || Math.sign(b.vx) !== s) return;
    // A serve must bounce first; anything else can be volleyed.
    if (this.isServe && this.bounces === 0) return;
    if (this.bounces >= 2) return;
    // Contact plane: 0.45 m in front of the player toward the net.
    const ahead = (pl.x - b.x) * s; // > 0: ball still in front
    if (ahead > 0.45 || ahead < -0.9) return;
    const lateral = b.z - pl.z;
    const reach = this.isServe ? 1.7 : 1.25;
    const inReach = Math.abs(lateral) <= reach && b.y >= 0.12 && b.y <= 3.1;
    const ai = this.ai(p);
    let kind: ShotKind | null = null;
    let quality = 1;
    if (ai) {
      if (!inReach) return;
      const plan = this.plan[p];
      kind = plan?.shot ?? "topspin";
      quality = Math.max(0.25, 1 - Math.abs(this.gauss()) * this.level.error * 0.45);
    } else {
      if (!pl.armed) {
        // Not armed: with the assist on, a late auto-swing; otherwise you let it go.
        if (this.autoRun && inReach && ahead < 0.2) {
          kind = "topspin";
          quality = 0.55;
        } else return;
      } else {
        if (!inReach) {
          if (ahead < 0) {
            pl.armed = null;
            pl.swing = { kind: "whiff", fore: lateral * (p === 0 ? 1 : -1) >= 0, t: 0.2 };
            this.emit({ kind: "whiff", who: p });
          }
          return;
        }
        const lead = this.time - pl.armed.at;
        // Ideal: pressed 0.2–0.55 s before contact.
        quality = lead < 0.2 ? 0.45 + (lead / 0.2) * 0.55 : lead <= 0.55 ? 1 : Math.max(0.35, 1 - (lead - 0.55) * 0.8);
        kind = pl.armed.kind;
        pl.armed = null;
      }
    }
    if (b.y > 2.35 && kind !== "lob" && kind !== "drop") kind = "smash";
    this.hit(p, o, kind!, quality, ai ? null : input);
  }

  private hit(p: Side, o: Side, kind: ShotKind, quality: number, input: TennisInput | null) {
    const b = this.ball;
    const pl = this.players[p];
    const def = SHOTS[kind];
    const so = sideOf(o);
    const fore = (b.z - pl.z) * (p === 0 ? 1 : -1) >= 0;
    // Aim: across the far court and its depth.
    let az: number;
    let depth: number;
    if (input) {
      az = input.ax;
      depth = input.ay;
    } else {
      const plan = this.aiAim(p, kind);
      az = plan.az;
      depth = plan.depth;
    }
    const across = (p === 0 ? 1 : -1) * az * (SINGLES - 0.55);
    let tx: number;
    if (kind === "drop") tx = so * (1.6 + (depth + 1) * 0.9);
    else if (kind === "lob") tx = so * (HALF_L - 1.2 - (1 - depth) * 0.6);
    else tx = so * (HALF_L - 2.6 + depth * 1.6);
    const tz = Math.max(-SINGLES + 0.3, Math.min(SINGLES - 0.3, across));
    // Pace: the shot's range, more with good timing; incoming pace adds a little.
    const inPace = Math.hypot(b.vx, b.vy, b.vz);
    const moving = Math.hypot(pl.vx, pl.vz);
    let pace = def.speed[0] + (def.speed[1] - def.speed[0]) * quality + Math.min(4, inPace * 0.06);
    if (this.ai(p)) pace *= this.level.pace * (0.92 + this.rival.aggression * 0.16);
    // Scatter: timing, running, pace coming in; better on easy balls.
    const base = this.ai(p) ? 0.45 + this.level.error * 0.75 : 0.3;
    const err = base + (1 - quality) * 1.5 + Math.max(0, moving - 2.5) * 0.22 + Math.max(0, inPace - 22) * 0.035 + (kind === "smash" ? -0.1 : 0);
    const ex = tx + this.gauss() * err * 0.85;
    const ez = tz + this.gauss() * err;
    const from = { x: b.x, y: Math.max(0.35, b.y), z: b.z };
    // Mishits off the frame: quality very low sprays the ball.
    const spin = def.spin * (0.6 + 0.4 * quality);
    this.ball = solveShot(from, ex, ez, pace, spin, def.clear * (this.ai(p) ? 1 : 0.9), def.high);
    this.last = p;
    this.bounces = 0;
    this.isServe = false;
    this.netted = false;
    this.pendingLet = false;
    this.rally++;
    pl.swing = { kind, fore, t: 0.3 };
    this.plan[p] = null;
    this.plan[o] = null;
    this.emit({ kind: "hit", who: p, shot: kind, kmh: Math.round(Math.hypot(this.ball.vx, this.ball.vy, this.ball.vz) * 3.6), fore, quality });
  }

  // --------------------------------------------------------------------- AI

  /** Where the ball will be hittable on side p: after one bounce, around waist height. */
  predict(p: Side): { x: number; z: number; t: number; y: number } | null {
    const b = { ...this.ball };
    const s = sideOf(p);
    let bounced = this.last !== p ? this.bounces : 0;
    const dt = 1 / 120;
    for (let t = 0; t < 7; t += dt) {
      const py = b.y;
      stepAir(b, dt);
      if (b.y <= BALL_R && py > BALL_R) {
        if (Math.sign(b.x) !== s) return null;
        bounced++;
        if (bounced >= 2) return { x: b.x, z: b.z, t, y: b.y };
        bounce(b, this.surface);
      }
      if (Math.sign(b.x) === s && Math.abs(b.x) > 1) {
        // A volley if it's high enough and we're near the net; otherwise after the bounce, coming down.
        if (bounced >= 1 && b.vy < 0 && b.y < 1.3) return { x: b.x, z: b.z, t, y: b.y };
        // Deep in the run-off: take it on the rise, whatever the height.
        if (bounced >= 1 && Math.abs(b.x) > HALF_L + 4.5 && b.y < 2.9) return { x: b.x, z: b.z, t, y: b.y };
      }
    }
    return null;
  }

  private aiMove(p: Side, dt: number) {
    const pl = this.players[p];
    const s = sideOf(p);
    const incoming = this.ballLive && this.last !== p;
    if (incoming) {
      if (!this.plan[p]) {
        const pr = this.predict(p);
        // Returners read the serve early; in a rally they react to the stroke.
        const react = this.isServe ? 0.04 : (p === 1 || this.autopilot ? this.level.react : 0.05) * (0.7 + this.rng.next() * 0.6);
        if (pr) {
          // Stand so the ball comes to the forehand (or backhand if closer), slightly behind the contact.
          const right = p === 0 ? 1 : -1;
          const off = (pr.z - pl.z) * right >= 0 ? -0.75 * right : 0.75 * right;
          this.plan[p] = { x: pr.x + s * 0.35, z: pr.z + off, react: this.time + react, shot: this.chooseShot(p, pr), at: pr.t };
        }
      }
      const plan = this.plan[p];
      if (plan && this.time >= plan.react) this.runTo(p, dt, plan.x, plan.z);
      else this.movePlayer(p, dt, 0, 0);
      return;
    }
    // Recover: back to the middle of the baseline (or hold at the net).
    const home = { x: s * (HALF_L + (this.surface === "clay" ? 1.6 : 0.8)), z: -this.ball.z * 0.15 };
    if (this.phase === "rally") this.runTo(p, dt, home.x, home.z);
    else this.movePlayer(p, dt, 0, 0);
  }

  private chooseShot(p: Side, pr: { x: number; y: number }): ShotKind {
    const r = this.rng.next();
    const touch = p === 1 ? this.rival.touch : 0.3;
    const deep = Math.abs(pr.x) > HALF_L;
    const opp = this.players[(1 - p) as Side];
    if (pr.y > 2.4) return "smash";
    // Lob a net-rusher; otherwise only rarely, to buy time from deep.
    if (Math.abs(opp.x) < 7 ? r < 0.45 : deep && r < 0.03 + touch * 0.04) return "lob";
    if (r < touch * 0.25) return "slice";
    if (!deep && r > 1 - touch * 0.12) return "drop";
    return "topspin";
  }

  private aiAim(p: Side, kind: ShotKind) {
    const o = (1 - p) as Side;
    const opp = this.players[o];
    const right = p === 0 ? 1 : -1;
    const aggr = p === 1 ? this.rival.aggression : 0.5;
    // Away from the opponent, more so when aggressive.
    const away = -Math.sign(opp.z * right) || (this.rng.next() < 0.5 ? -1 : 1);
    let az = away * (0.5 + aggr * 0.45) + (this.rng.next() - 0.5) * 0.4;
    if (kind === "lob" || kind === "drop") az *= 0.5;
    az = Math.max(-1, Math.min(1, az));
    const depth = Math.max(-1, Math.min(1, 0.2 + aggr * 0.5 + (this.rng.next() - 0.5) * 0.6));
    return { az, depth };
  }

  private gauss() {
    const u = Math.max(1e-9, this.rng.next());
    const v = this.rng.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ----------------------------------------------------------------- points

  private endPoint(w: Side, why: "ace" | "winner" | "error" | "double" | "out" | "net" | "unreturned") {
    if (this.phase !== "rally" && why !== "double") return;
    const l = (1 - w) as Side;
    this.ballLive = false;
    this.stats[w].points++;
    if (why === "ace") this.stats[w].aces++;
    else if (why === "winner") this.stats[w].winners++;
    else if (why === "out" || why === "net") this.stats[l].errors++;
    for (const s of this.stats) s.longestRally = Math.max(s.longestRally, this.rally);
    const wasServer = this.server;
    const res = this.score.point(w);
    const call = res.game ? `Game ${this.names[w]}` : this.score.announce(this.names);
    this.emit({ kind: "point", winner: w, why, rally: this.rally, call });
    if (res.game) {
      const g = this.score.sets.length && res.set ? this.score.sets[this.score.sets.length - 1] : this.score.games;
      this.emit({ kind: "game", winner: w, games: [g[0], g[1]], break: w !== wasServer });
    }
    if (res.set) this.emit({ kind: "set", winner: w, sets: this.score.sets.map((s) => [...s] as [number, number]) });
    if (res.match) {
      this.emit({ kind: "over", winner: w });
      this.pendingOver = true;
    }
    this.pendingGame = res.game;
    this.serveNo = 1;
    this.faultReplay = false;
    this.letReplay = false;
    this.setPhase("dead");
  }

  private pendingOver = false;
  private pendingGame = false;

  private nextPoint() {
    if (this.pendingOver) {
      this.setPhase("over");
      return;
    }
    if (this.faultReplay || this.letReplay) {
      // Second serve (or the same serve again after a let).
      this.faultReplay = this.letReplay = false;
      const s = this.server;
      // Back to the same spot on the baseline.
      const right = s === 0 ? 1 : -1;
      this.players[s].x = sideOf(s) * (HALF_L + 0.3);
      this.players[s].z = (this.score.court === "deuce" ? 1 : -1) * right * 0.9;
      this.players[s].vx = this.players[s].vz = 0;
      this.ball = { x: this.players[s].x, y: -1, z: this.players[s].z, vx: 0, vy: 0, vz: 0, spin: 0 };
      this.isServe = true;
      this.aiServeAt = 0.7 + this.rng.next() * 0.6;
      this.setPhase("serve");
      return;
    }
    const games = this.score.games[0] + this.score.games[1];
    if (this.pendingGame && games % 2 === 1) {
      this.pendingGame = false;
      this.emit({ kind: "changeover" });
      this.setPhase("changeover");
      return;
    }
    this.pendingGame = false;
    this.setupPoint();
    this.setPhase("serve");
  }

  /** Leaderboard points: rallies won, games, sets, the match, aces and winners. */
  matchScore() {
    const st = this.stats[0];
    const games = this.score.sets.reduce((a, s) => a + s[0], 0) + this.score.games[0];
    const sets = this.score.setsWon(0);
    const won = this.score.winner === 0;
    const k = this.level === LEVELS.legend ? 1.5 : this.level === LEVELS.pro ? 1.2 : 1;
    return Math.min(20000, Math.round((st.points * 10 + games * 60 + sets * 300 + (won ? 1500 : 0) + st.aces * 40 + st.winners * 25) * k));
  }
}
