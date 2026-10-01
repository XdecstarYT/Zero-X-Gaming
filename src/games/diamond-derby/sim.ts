import { createRng, type Rng } from "../engine/rng";

/**
 * Diamond Derby: a home run derby. Pure rules and physics, no DOM.
 *
 * World frame (metres): home plate at the origin, +x out toward the pitcher
 * and centre field, +z toward right field (first base), y up. Spray angle φ
 * is 0 to centre, −45° down the left-field line, +45° down the right.
 *
 * Each round you get 10 outs: every swing that isn't a home run is an out, and
 * so is a strike you take. Out-homer the AI slugger to go through: three
 * rounds to the trophy. Pitches are real (fastball, changeup, curve, slider),
 * and batted balls fly with drag and backspin lift, calibrated so 105 mph at
 * 28° carries about 425 ft.
 */

export const G = 9.8;
export const MOUND = 18.44;
export const BASE = 27.43;
/** Release point: 17 m out (after the stride), 1.8 m up, a touch to the third-base side. */
export const RELEASE = { x: 17, y: 1.8, z: -0.45 };
/** The strike zone at the plate (m): lateral half-width, bottom and top. */
export const ZONE = { half: 0.23, lo: 0.5, hi: 1.08 };
const DRAG_BALL = 0.0061;
const LIFT = 0.0035;
const MPH = 0.44704;
export const FT = 0.3048;

/** Fence distance (m) at spray angle φ (radians): 330 ft down the lines, 400 to centre. */
export function fenceAt(phi: number) {
  const k = Math.min(1, Math.abs(phi) / (Math.PI / 4));
  return (400 - 70 * Math.pow(k, 1.6)) * FT;
}
/** Wall height (m): 8 ft, 12 ft in centre. */
export function wallAt(phi: number) {
  return Math.abs(phi) < 0.3 ? 3.7 : 2.6;
}

export type PitchType = "fastball" | "changeup" | "curve" | "slider";
export const PITCHES: Record<PitchType, { name: string; mph: [number, number]; breakY: number; breakZ: number; weight: number }> = {
  fastball: { name: "4-seam fastball", mph: [92, 97], breakY: 2.5, breakZ: 0, weight: 0.55 },
  changeup: { name: "Changeup", mph: [82, 86], breakY: -2.5, breakZ: 1.2, weight: 0.2 },
  curve: { name: "Curveball", mph: [75, 80], breakY: -9, breakZ: -2, weight: 0.15 },
  slider: { name: "Slider", mph: [84, 88], breakY: -3, breakZ: -5, weight: 0.1 },
};

export type Difficulty = "rookie" | "pro" | "legend";
export const LEVELS: Record<Difficulty, { name: string; speed: number; pci: number; window: number; aiHr: [number, number] }> = {
  rookie: { name: "Rookie", speed: 0.88, pci: 0.13, window: 0.14, aiHr: [3, 7] },
  pro: { name: "Pro", speed: 1, pci: 0.11, window: 0.12, aiHr: [6, 11] },
  legend: { name: "Legend", speed: 1.06, pci: 0.09, window: 0.1, aiHr: [10, 16] },
};

export { SLUGGERS } from "./sluggers";
import { SLUGGERS } from "./sluggers";

export const OUTS_PER_ROUND = 10;
export const ROUNDS = ["Quarterfinal", "Semifinal", "Final"];
/** Seconds from pressing swing to the bat reaching the zone. */
export const SWING_LAG = 0.15;

export interface Pitch {
  type: PitchType;
  mph: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ay: number;
  az: number;
  t: number;
  /** Where it crosses the plate and when (seconds after release). */
  plate: { y: number; z: number; t: number };
  strike: boolean;
}

export interface Hit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  ev: number;
  la: number;
  phi: number;
  /** Projected distance (ft), like Statcast's. */
  dist: number;
  hr: boolean;
  foul: boolean;
  /** Came down: on the grass, off the wall or in the seats. */
  landed: boolean;
  wall: boolean;
}

export type Phase = "intro" | "ready" | "windup" | "pitch" | "result" | "roundEnd" | "over";

export type DerbyEvent =
  | { kind: "pitch"; type: PitchType; mph: number }
  | { kind: "swing" }
  | { kind: "contact"; ev: number; la: number; quality: number }
  | { kind: "miss"; why: "late" | "early" | "under" | "over" | "wide" }
  | { kind: "take"; strike: boolean }
  | { kind: "homer"; dist: number; ev: number; la: number; moonshot: boolean }
  | { kind: "out"; outs: number; why: string }
  | { kind: "wall" }
  | { kind: "foul" }
  | { kind: "round"; round: number; you: number; them: number; won: boolean }
  | { kind: "over"; champion: boolean };

export interface DerbyInput {
  /** Aim (the plate coverage indicator) in zone coordinates: z lateral, y height (m). */
  aimZ: number;
  aimY: number;
  swing: boolean;
}

export interface DerbyOptions {
  seed: number;
  difficulty: Difficulty;
  /** AI hits for you (tests, Live Sports). */
  autopilot?: boolean;
}

/** Fly a batted ball from contact: returns the projected distance (ft) on flat ground. */
export function carry(evMph: number, laDeg: number) {
  const v = evMph * MPH;
  const a = (laDeg * Math.PI) / 180;
  let x = 0;
  let y = 1;
  let vx = v * Math.cos(a);
  let vy = v * Math.sin(a);
  const dt = 1 / 240;
  for (let t = 0; t < 12 && y > 0; t += dt) {
    const sp = Math.hypot(vx, vy);
    const ax = -DRAG_BALL * sp * vx - LIFT * sp * vy;
    const ay = -G - DRAG_BALL * sp * vy + LIFT * sp * vx;
    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;
  }
  return x / FT;
}

export class DerbySim {
  readonly rng: Rng;
  readonly level: (typeof LEVELS)[Difficulty];
  phase: Phase = "intro";
  phaseT = 0;
  time = 0;
  round = 0;
  outs = 0;
  /** Home runs this round, and in the derby. */
  hrs = 0;
  totalHrs = 0;
  /** Each round's opponent and their total. */
  opponents: { name: string; team: string; hrs: number }[] = [];
  pitch: Pitch | null = null;
  hit: Hit | null = null;
  /** The swing in progress: when it was pressed (sim time) and the aim then. */
  swing: { at: number; z: number; y: number } | null = null;
  aim = { z: 0, y: 0.8 };
  longest = 0;
  totalDist = 0;
  hrLog: { dist: number; ev: number; la: number; phi: number }[] = [];
  events: DerbyEvent[] = [];
  champion = false;
  autopilot: boolean;
  private nextPitchType: PitchType = "fastball";
  private autoSwing = -1;
  private autoTarget = { z: 0, y: 0.8 };
  /** The derby is decided: the round-end card leads to the final whistle. */
  private finalPending = false;

  constructor(o: DerbyOptions) {
    this.rng = createRng(o.seed);
    this.level = LEVELS[o.difficulty];
    this.autopilot = !!o.autopilot;
    const pool = [...SLUGGERS];
    for (let i = 0; i < ROUNDS.length; i++) {
      const s = pool.splice(Math.floor(this.rng.next() * pool.length), 1)[0];
      const [lo, hi] = this.level.aiHr;
      // Later rounds, tougher opponents.
      const hrs = Math.round(lo + (hi - lo) * (0.35 + 0.65 * this.rng.next()) * (0.85 + i * 0.12));
      this.opponents.push({ ...s, hrs });
    }
  }

  get opponent() {
    return this.opponents[Math.min(this.round, this.opponents.length - 1)];
  }

  private emit(e: DerbyEvent) {
    this.events.push(e);
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
  }

  step(dt: number, input: DerbyInput) {
    if (this.phase === "over") return;
    this.time += dt;
    this.phaseT += dt;
    this.aim.z = Math.max(-ZONE.half * 1.6, Math.min(ZONE.half * 1.6, input.aimZ));
    this.aim.y = Math.max(ZONE.lo - 0.25, Math.min(ZONE.hi + 0.25, input.aimY));
    if (this.autopilot) this.autoAim();
    const wantsSwing = this.autopilot ? this.autoSwing >= 0 && this.pitch !== null && this.pitch.t >= this.autoSwing : input.swing;

    switch (this.phase) {
      case "intro":
        if (this.phaseT > 2.5) this.setPhase("ready");
        break;
      case "ready":
        if (this.phaseT > 1.1) {
          this.nextPitchType = this.pickPitch();
          this.setPhase("windup");
        }
        break;
      case "windup":
        if (this.phaseT > 0.85) this.release();
        break;
      case "pitch":
        this.stepPitch(dt, wantsSwing);
        break;
      case "result":
        if (this.hit && !this.hit.landed) this.stepHit(dt);
        if ((this.hit ? this.hit.landed && this.phaseT > 2.4 : this.phaseT > 1.4) || this.phaseT > 8) this.nextPitch();
        break;
      case "roundEnd":
        if (this.phaseT > 4) this.nextRound();
        break;
    }
  }

  private pickPitch(): PitchType {
    let r = this.rng.next();
    for (const [k, p] of Object.entries(PITCHES) as [PitchType, (typeof PITCHES)[PitchType]][]) {
      r -= p.weight;
      if (r <= 0) return k;
    }
    return "fastball";
  }

  /** Throw: solve the release velocity so the pitch (with its break) crosses the plate at the target. */
  private release() {
    const type = this.nextPitchType;
    const def = PITCHES[type];
    const mph = (def.mph[0] + this.rng.next() * (def.mph[1] - def.mph[0])) * this.level.speed;
    const inZone = this.rng.next() < 0.82;
    const ty = inZone ? ZONE.lo + 0.08 + this.rng.next() * (ZONE.hi - ZONE.lo - 0.16) : this.rng.next() < 0.5 ? ZONE.lo - 0.15 : ZONE.hi + 0.15;
    const tz = inZone ? (this.rng.next() * 2 - 1) * (ZONE.half - 0.04) : (this.rng.next() < 0.5 ? -1 : 1) * (ZONE.half + 0.1);
    const speed = mph * MPH;
    const p: Pitch = { type, mph, x: RELEASE.x, y: RELEASE.y, z: RELEASE.z, vx: -speed, vy: 0, vz: 0, ay: def.breakY, az: def.breakZ, t: 0, plate: { y: ty, z: tz, t: 0 }, strike: inZone };
    // Shoot: adjust the aim until the simulated pitch lands on target.
    let aimY = ty;
    let aimZ = tz;
    for (let it = 0; it < 4; it++) {
      const d = Math.hypot(RELEASE.x, aimY - RELEASE.y, aimZ - RELEASE.z);
      p.vx = (-RELEASE.x / d) * speed;
      p.vy = ((aimY - RELEASE.y) / d) * speed;
      p.vz = ((aimZ - RELEASE.z) / d) * speed;
      const end = flyPitch({ ...p });
      aimY += ty - end.y;
      aimZ += tz - end.z;
    }
    const end = flyPitch({ ...p });
    p.plate = { y: end.y, z: end.z, t: end.t };
    p.strike = Math.abs(end.z) <= ZONE.half + 0.037 && end.y >= ZONE.lo - 0.037 && end.y <= ZONE.hi + 0.037;
    this.pitch = p;
    this.swing = null;
    this.hit = null;
    this.autoSwing = -1;
    if (this.autopilot) this.planAuto();
    this.setPhase("pitch");
    this.emit({ kind: "pitch", type, mph: Math.round(mph) });
  }

  private stepPitch(dt: number, wantsSwing: boolean) {
    const p = this.pitch!;
    if (wantsSwing && !this.swing) {
      this.swing = { at: p.t, z: this.aim.z, y: this.aim.y };
      this.emit({ kind: "swing" });
    }
    const prevX = p.x;
    stepPitchBody(p, dt);
    // At the front of the plate: contact, a miss, or a take.
    if (prevX > 0.2 && p.x <= 0.2) {
      if (this.swing) this.resolveSwing(p);
      else {
        this.emit({ kind: "take", strike: p.strike });
        if (p.strike) this.addOut("Called strike");
        this.setPhase("result");
      }
      return;
    }
    if (p.t > 3) this.setPhase("result");
  }

  private resolveSwing(p: Pitch) {
    const s = this.swing!;
    const e = s.at + SWING_LAG - p.t; // > 0: late, < 0: early
    const w = this.level.window;
    const dz = s.z - p.z;
    const dy = s.y - p.y;
    const dist = Math.hypot(dz, dy);
    const reach = this.level.pci + 0.037;
    if (Math.abs(e) > w || dist > reach) {
      const why = Math.abs(e) > w ? (e > 0 ? "late" : "early") : Math.abs(dy) > Math.abs(dz) ? (dy > 0 ? "over" : "under") : "wide";
      this.emit({ kind: "miss", why });
      this.addOut("Swing and a miss");
      this.setPhase("result");
      return;
    }
    const quality = Math.max(0, 1 - (e / w) ** 2) * Math.max(0, 1 - (dist / reach) ** 2);
    const pitchBonus = (p.mph - 88) * 0.06;
    const ev = Math.min(118, 78 + 38 * Math.sqrt(quality) + pitchBonus + (this.rng.next() - 0.5) * 3);
    // Bat above the ball → topped into the ground; below → under it, in the air.
    const la = Math.max(-25, Math.min(70, 24 - dy * 150 + (this.rng.next() - 0.5) * 8));
    // Early pulls (to left for a right-handed hitter), late goes the other way.
    const phi = Math.max(-1.2, Math.min(1.2, (e / w) * 0.95 + (this.rng.next() - 0.5) * 0.14));
    this.emit({ kind: "contact", ev: Math.round(ev), la: Math.round(la), quality });
    this.launch(ev, la, phi);
  }

  private launch(ev: number, la: number, phi: number) {
    const v = ev * MPH;
    const a = (la * Math.PI) / 180;
    this.hit = {
      x: 0.25,
      y: 0.9,
      z: 0,
      vx: Math.cos(a) * Math.cos(phi) * v,
      vy: Math.sin(a) * v,
      vz: Math.cos(a) * Math.sin(phi) * v,
      t: 0,
      ev,
      la,
      phi,
      dist: Math.round(carry(ev, la)),
      hr: false,
      foul: Math.abs(phi) > Math.PI / 4,
      landed: false,
      wall: false,
    };
    this.setPhase("result");
  }

  private stepHit(dt: number) {
    const h = this.hit!;
    const sp = Math.hypot(h.vx, h.vy, h.vz);
    const hs = Math.hypot(h.vx, h.vz) || 1;
    // Lift acts upward, perpendicular to the flight (backspin).
    h.vx += (-DRAG_BALL * sp * h.vx - LIFT * sp * h.vy * (h.vx / hs)) * dt;
    h.vz += (-DRAG_BALL * sp * h.vz - LIFT * sp * h.vy * (h.vz / hs)) * dt;
    h.vy += (-G - DRAG_BALL * sp * h.vy + LIFT * sp * hs) * dt;
    const r0 = Math.hypot(h.x, h.z);
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.z += h.vz * dt;
    h.t += dt;
    const r = Math.hypot(h.x, h.z);
    const phi = Math.atan2(h.z, h.x);
    if (!h.foul && !h.hr && !h.wall) {
      const f = fenceAt(phi);
      if (r0 < f && r >= f) {
        if (h.y > wallAt(phi)) {
          h.hr = true;
          this.homer(h);
        } else {
          // Off the wall: it drops back into play.
          h.wall = true;
          h.vx *= -0.3;
          h.vz *= -0.3;
          this.emit({ kind: "wall" });
          this.addOut("Off the wall");
        }
      }
    }
    if (h.y <= 0) {
      h.y = 0;
      if (!h.hr && !h.wall) {
        if (h.foul) {
          this.emit({ kind: "foul" });
          this.addOut("Foul ball");
        } else this.addOut(h.la < 10 ? "Grounder" : r < 60 ? "Pop-up" : "Fly ball, caught");
      }
      h.landed = true;
    }
    // Into the seats: it's gone, call it landed after a moment.
    if (h.hr && (r > fenceAt(phi) + 25 || h.t > 7)) h.landed = true;
  }

  private homer(h: Hit) {
    this.hrs++;
    this.totalHrs++;
    this.totalDist += h.dist;
    this.longest = Math.max(this.longest, h.dist);
    this.hrLog.push({ dist: h.dist, ev: Math.round(h.ev), la: Math.round(h.la), phi: h.phi });
    this.emit({ kind: "homer", dist: h.dist, ev: Math.round(h.ev), la: Math.round(h.la), moonshot: h.dist >= 450 });
  }

  private addOut(why: string) {
    this.outs++;
    this.emit({ kind: "out", outs: this.outs, why });
  }

  private nextPitch() {
    this.pitch = null;
    this.hit = null;
    this.swing = null;
    if (this.outs >= OUTS_PER_ROUND) return this.endRound();
    this.setPhase("ready");
  }

  private endRound() {
    const won = this.hrs > this.opponent.hrs || (this.hrs === this.opponent.hrs && this.rng.next() < 0.5);
    this.emit({ kind: "round", round: this.round, you: this.hrs, them: this.opponent.hrs, won });
    if (!won || this.round >= ROUNDS.length - 1) {
      this.champion = won;
      this.setPhase("roundEnd");
      this.phaseT = -2;
      this.finalPending = true;
      return;
    }
    this.setPhase("roundEnd");
  }

  private nextRound() {
    if (this.finalPending) {
      this.setPhase("over");
      this.emit({ kind: "over", champion: this.champion });
      return;
    }
    this.round++;
    this.outs = 0;
    this.hrs = 0;
    this.setPhase("ready");
  }

  /** Points for the leaderboard: home runs, distance, the longest, rounds won and the trophy. */
  score() {
    const rounds = this.round + (this.champion ? 1 : 0);
    return Math.min(20000, Math.round(this.totalHrs * 100 + this.totalDist / 10 + this.longest * 0.5 + rounds * 300 + (this.champion ? 1000 : 0)));
  }

  // ---------------------------------------------------------------- autopilot

  /** AI: pick a swing time and aim for this pitch (good, not perfect). */
  private planAuto() {
    const p = this.pitch!;
    if (!p.strike && this.rng.next() < 0.8) return;
    const err = (this.rng.next() - 0.5) * this.level.window * 0.75;
    this.autoSwing = Math.max(0, p.plate.t - SWING_LAG + err);
    this.autoTarget = { z: p.plate.z + (this.rng.next() - 0.5) * 0.06, y: p.plate.y - 0.03 + (this.rng.next() - 0.5) * 0.06 };
  }

  private autoAim() {
    this.aim.z += (this.autoTarget.z - this.aim.z) * 0.3;
    this.aim.y += (this.autoTarget.y - this.aim.y) * 0.3;
  }
}

/** One step of a pitch in flight (drag, gravity and its break). */
export function stepPitchBody(p: Pitch, dt: number) {
  const sp = Math.hypot(p.vx, p.vy, p.vz);
  p.vx += -DRAG_BALL * 0.8 * sp * p.vx * dt;
  p.vy += (-G + p.ay - DRAG_BALL * 0.8 * sp * p.vy) * dt;
  p.vz += (p.az - DRAG_BALL * 0.8 * sp * p.vz) * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  p.t += dt;
}

/** Where a pitch crosses the front of the plate (x = 0.2) and when. */
export function flyPitch(p: Pitch) {
  const dt = 1 / 600;
  while (p.x > 0.2 && p.t < 3) stepPitchBody(p, dt);
  return { y: p.y, z: p.z, t: p.t };
}
