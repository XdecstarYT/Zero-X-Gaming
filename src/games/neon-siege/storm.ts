import type { Rng } from "../engine/rng";

/**
 * The storm: a safe circle that waits, then shrinks toward the next (smaller)
 * circle, phase after phase. Outside the circle you take damage per second,
 * rising each phase. Each new circle lies entirely inside the previous one.
 */

export interface StormPhase {
  /** Seconds before this phase's shrink starts. */
  wait: number;
  /** Seconds the shrink takes. */
  shrink: number;
  /** Target radius of this phase. */
  radius: number;
  /** Damage per second outside the circle during this phase. */
  dps: number;
}

export const STORM_PHASES: StormPhase[] = [
  { wait: 40, shrink: 30, radius: 26, dps: 1 },
  { wait: 30, shrink: 25, radius: 16, dps: 2 },
  { wait: 25, shrink: 20, radius: 9, dps: 5 },
  { wait: 20, shrink: 15, radius: 4, dps: 8 },
  { wait: 15, shrink: 15, radius: 0.5, dps: 10 },
];

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface StormState {
  phase: number;
  /** Seconds into the current phase. */
  t: number;
  from: Circle;
  to: Circle;
  current: Circle;
  dps: number;
  done: boolean;
  /** Map scale against Ground Zero (1 there; bigger arenas get wider circles and longer waits). */
  k?: number;
}

/** The map size the phases are tuned for. */
const BASE_SIZE = 72;

/** Phase `i`, scaled for the storm's map. */
export function phaseOf(s: Pick<StormState, "k">, i: number): StormPhase {
  const p = STORM_PHASES[i];
  const k = s.k ?? 1;
  if (k === 1) return p;
  const slow = 1 + (k - 1) * 0.6;
  return { wait: p.wait * slow, shrink: p.shrink * slow, radius: p.radius * k, dps: p.dps };
}

function nextCircle(prev: Circle, radius: number, rng: Rng, bounds: { w: number; h: number }): Circle {
  const slack = Math.max(0, prev.r - radius);
  const a = rng.next() * Math.PI * 2;
  const d = Math.sqrt(rng.next()) * slack;
  let x = prev.x + Math.cos(a) * d;
  let y = prev.y + Math.sin(a) * d;
  // Keep the playable part of the circle on the map.
  x = Math.min(bounds.w - 3 - radius * 0.3, Math.max(3 + radius * 0.3, x));
  y = Math.min(bounds.h - 3 - radius * 0.3, Math.max(3 + radius * 0.3, y));
  return { x, y, r: radius };
}

export function createStorm(width: number, height: number, rng: Rng): StormState {
  const k = Math.max(1, width / BASE_SIZE);
  const start: Circle = { x: width / 2, y: height / 2, r: Math.hypot(width, height) / 2 };
  const to = nextCircle(start, phaseOf({ k }, 0).radius, rng, { w: width, h: height });
  return { phase: 0, t: 0, from: start, to, current: { ...start }, dps: STORM_PHASES[0].dps, done: false, ...(k > 1 ? { k } : {}) };
}

export function stepStorm(s: StormState, dt: number, rng: Rng, width: number, height: number) {
  if (s.done) return;
  const p = phaseOf(s, s.phase);
  s.t += dt;
  s.dps = p.dps;
  const k = Math.min(1, Math.max(0, (s.t - p.wait) / p.shrink));
  s.current = {
    x: s.from.x + (s.to.x - s.from.x) * k,
    y: s.from.y + (s.to.y - s.from.y) * k,
    r: s.from.r + (s.to.r - s.from.r) * k,
  };
  if (k >= 1) {
    if (s.phase === STORM_PHASES.length - 1) {
      s.done = true;
      return;
    }
    s.phase++;
    s.t = 0;
    s.from = { ...s.to };
    s.to = nextCircle(s.from, phaseOf(s, s.phase).radius, rng, { w: width, h: height });
  }
}

export function outside(c: Circle, x: number, y: number) {
  return Math.hypot(x - c.x, y - c.y) > c.r;
}

/** Seconds until the next shrink starts (0 while shrinking). */
export function stormCountdown(s: StormState) {
  const p = phaseOf(s, s.phase);
  return Math.max(0, p.wait - s.t);
}

export function isShrinking(s: StormState) {
  return !s.done && s.t >= phaseOf(s, s.phase).wait;
}
