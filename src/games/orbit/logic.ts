import { createRng, type Rng } from "../engine/rng";

/**
 * Orbit rules. A probe thrusts along its heading while planets pull on it.
 * Collect energy shards (chain them quickly for a multiplier), dodge debris,
 * don't hit a planet. Screen edges wrap. Pure and seeded; rendered by ./index.ts.
 */

export const W = 960;
export const H = 540;
export const PROBE_R = 9;
const THRUST = 260;
const BOOST_THRUST = 620;
const DRAG = 0.9;
const TURN_RATE = 3.6;
const GRAVITY = 2_400_000;
const SOFTENING = 900;
export const SHARD_R = 10;
export const SHARD_POINTS = 25;
export const MAX_COMBO = 4;
const COMBO_WINDOW_S = 3;
export const SURVIVAL_POINTS_PER_S = 10;
const MAX_BOOST = 1;
const BOOST_DRAIN = 0.8;
const BOOST_REGEN = 0.25;
const SHARDS_ON_FIELD = 3;
/** Collisions are ignored (and debris held back) for the first moments of a run. */
export const SPAWN_SHIELD_S = 2;

export interface Planet {
  x: number;
  y: number;
  r: number;
  mass: number;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface OrbitState {
  rng: Rng;
  t: number;
  probe: Body & { heading: number };
  planets: Planet[];
  shards: { x: number; y: number }[];
  debris: Body[];
  boost: number;
  combo: number;
  sinceShard: number;
  shardPoints: number;
  collected: number;
  dead: boolean;
}

export interface OrbitInput {
  /** -1 left, 0 none, +1 right. Ignored when targetHeading is set. */
  turn: number;
  /** Touch steering: rotate toward this angle (radians). */
  targetHeading: number | null;
  boost: boolean;
}

export type OrbitEvent = "shard" | "combo" | "hit";

const wrap = (v: number, max: number) => ((v % max) + max) % max;

/** Shortest wrapped distance vector from a to b. */
export function delta(ax: number, ay: number, bx: number, by: number) {
  let dx = bx - ax;
  let dy = by - ay;
  if (dx > W / 2) dx -= W;
  if (dx < -W / 2) dx += W;
  if (dy > H / 2) dy -= H;
  if (dy < -H / 2) dy += H;
  return { dx, dy, d: Math.hypot(dx, dy) };
}

function freeSpot(s: Pick<OrbitState, "rng" | "planets" | "probe">, clearance: number) {
  for (let i = 0; i < 50; i++) {
    const x = s.rng.range(40, W - 40);
    const y = s.rng.range(40, H - 40);
    const nearPlanet = s.planets.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + clearance);
    const nearProbe = s.probe && delta(s.probe.x, s.probe.y, x, y).d < 90;
    if (!nearPlanet && !nearProbe) return { x, y };
  }
  return { x: 60, y: 60 };
}

export function createOrbit(seed = Date.now()): OrbitState {
  const rng = createRng(seed);
  const planets: Planet[] = [];
  const count = rng.int(2, 3);
  for (let i = 0; i < 400 && planets.length < count; i++) {
    const r = rng.range(26, 44);
    const x = rng.range(160, W - 160);
    const y = rng.range(110, H - 110);
    const clearOfOthers = planets.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r + 170);
    const clearOfSpawn = Math.hypot(x - 120, y - H / 2) > 200;
    if (clearOfOthers && clearOfSpawn) planets.push({ x, y, r, mass: r * r * r * 0.02 });
  }
  const s: OrbitState = {
    rng,
    t: 0,
    probe: { x: 120, y: H / 2, vx: 60, vy: 0, r: PROBE_R, heading: 0 },
    planets,
    shards: [],
    debris: [],
    boost: MAX_BOOST,
    combo: 0,
    sinceShard: Infinity,
    shardPoints: 0,
    collected: 0,
    dead: false,
  };
  while (s.shards.length < SHARDS_ON_FIELD) s.shards.push(freeSpot(s, 50));
  return s;
}

export function multiplier(s: Pick<OrbitState, "combo">) {
  return Math.min(MAX_COMBO, 1 + s.combo);
}

export function score(s: Pick<OrbitState, "t" | "shardPoints">) {
  return Math.floor(s.t) * SURVIVAL_POINTS_PER_S + s.shardPoints;
}

export function maxDebris(t: number) {
  return Math.min(10, 2 + Math.floor(t / 12));
}

function spawnDebris(s: OrbitState): Body {
  const side = s.rng.int(0, 3);
  const speed = s.rng.range(70, 130 + Math.min(120, s.t * 2));
  const angle = s.rng.range(-0.5, 0.5);
  const r = s.rng.range(8, 16);
  // Enter from an edge, heading roughly across the field.
  const base = [0, Math.PI / 2, Math.PI, -Math.PI / 2][side];
  const x = side === 0 ? -20 : side === 2 ? W + 20 : s.rng.range(0, W);
  const y = side === 1 ? -20 : side === 3 ? H + 20 : s.rng.range(0, H);
  return { x, y, vx: Math.cos(base + angle) * speed, vy: Math.sin(base + angle) * speed, r };
}

function gravity(planets: Planet[], x: number, y: number) {
  let ax = 0;
  let ay = 0;
  for (const p of planets) {
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy + SOFTENING;
    const a = (GRAVITY * p.mass) / 1000 / d2;
    const d = Math.sqrt(d2);
    ax += (a * dx) / d;
    ay += (a * dy) / d;
  }
  return { ax, ay };
}

export function step(s: OrbitState, dt: number, input: OrbitInput): OrbitEvent[] {
  const events: OrbitEvent[] = [];
  if (s.dead) return events;
  s.t += dt;
  s.sinceShard += dt;
  if (s.sinceShard > COMBO_WINDOW_S) s.combo = 0;

  const p = s.probe;
  // Steering
  if (input.targetHeading !== null) {
    let diff = input.targetHeading - p.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    p.heading += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
  } else {
    p.heading += input.turn * TURN_RATE * dt;
  }

  // Thrust, boost energy, gravity, drag
  const boosting = input.boost && s.boost > 0.05;
  s.boost = boosting ? Math.max(0, s.boost - BOOST_DRAIN * dt) : Math.min(MAX_BOOST, s.boost + BOOST_REGEN * dt);
  const thrust = boosting ? BOOST_THRUST : THRUST;
  const g = gravity(s.planets, p.x, p.y);
  p.vx += (Math.cos(p.heading) * thrust + g.ax) * dt;
  p.vy += (Math.sin(p.heading) * thrust + g.ay) * dt;
  const drag = Math.exp(-DRAG * dt);
  p.vx *= drag;
  p.vy *= drag;
  p.x = wrap(p.x + p.vx * dt, W);
  p.y = wrap(p.y + p.vy * dt, H);

  // Shards
  for (let i = s.shards.length - 1; i >= 0; i--) {
    const sh = s.shards[i];
    if (delta(p.x, p.y, sh.x, sh.y).d < PROBE_R + SHARD_R) {
      if (s.sinceShard <= COMBO_WINDOW_S) {
        s.combo = Math.min(MAX_COMBO - 1, s.combo + 1);
        events.push("combo");
      } else events.push("shard");
      s.shardPoints += SHARD_POINTS * multiplier(s);
      s.collected++;
      s.sinceShard = 0;
      s.shards.splice(i, 1);
    }
  }
  while (s.shards.length < SHARDS_ON_FIELD) s.shards.push(freeSpot(s, 50));

  // Debris: drift (lightly affected by gravity), despawn off-field, top up.
  for (const d of s.debris) {
    const gd = gravity(s.planets, d.x, d.y);
    d.vx += gd.ax * dt * 0.3;
    d.vy += gd.ay * dt * 0.3;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
  }
  s.debris = s.debris.filter((d) => d.x > -60 && d.x < W + 60 && d.y > -60 && d.y < H + 60);
  if (s.t > SPAWN_SHIELD_S && s.debris.length < maxDebris(s.t) && s.rng.next() < dt * 1.5)
    s.debris.push(spawnDebris(s));

  // Collisions (after the spawn shield). Planets bounce a shielded probe back out.
  if (s.t <= SPAWN_SHIELD_S) {
    for (const pl of s.planets) {
      const d = Math.hypot(p.x - pl.x, p.y - pl.y);
      if (d < pl.r + PROBE_R) {
        const nx = (p.x - pl.x) / d;
        const ny = (p.y - pl.y) / d;
        p.x = pl.x + nx * (pl.r + PROBE_R);
        p.y = pl.y + ny * (pl.r + PROBE_R);
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) {
          p.vx -= 2 * vn * nx;
          p.vy -= 2 * vn * ny;
        }
      }
    }
    return events;
  }
  const hitPlanet = s.planets.some((pl) => Math.hypot(pl.x - p.x, pl.y - p.y) < pl.r + PROBE_R * 0.8);
  const hitDebris = s.debris.some((d) => Math.hypot(d.x - p.x, d.y - p.y) < d.r + PROBE_R * 0.8);
  if (hitPlanet || hitDebris) {
    s.dead = true;
    events.push("hit");
  }
  return events;
}
