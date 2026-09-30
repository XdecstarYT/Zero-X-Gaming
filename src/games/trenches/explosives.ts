import { GROUND, lineOfSight, SEE_THROUGH, SOLID, wallAt, type GameMap } from "../neon-siege/map";

/**
 * Grenades and shells (pure). A grenade flies a ballistic arc in 3D over the
 * 2D grid: walls bounce it (low props only when it's below their top),
 * trenches are pits it can drop into, and it rolls to a stop before the fuse
 * burns out. Blasts hurt with distance falloff; trenches, lying flat and
 * walls between you and the blast all soak it up.
 */

export const TRENCH_FLOOR = -1.35;
export const GRENADE_FUSE = 3.2;
export const THROW_SPEED = 15;
const THROW_PITCH = 0.55;
const GRAVITY = 9.8;

export interface Grenade {
  id: string;
  owner: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** World time it goes off. */
  fuseAt: number;
}

export interface BlastSpec {
  x: number;
  y: number;
  radius: number;
  damage: number;
}

export const GRENADE_BLAST = { radius: 6, damage: 170 };
export const SHELL_BLAST = { radius: 8, damage: 240 };

export function floorAt(map: GameMap, x: number, y: number) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return 0;
  return map.ground[cy * map.width + cx] === GROUND.trench ? TRENCH_FLOOR : 0;
}

/** How tall a solid cell is, for things flying over it. */
function heightOf(cell: number) {
  switch (cell) {
    case SOLID.rock:
      return 0.7;
    case SOLID.crate:
      return 1.2;
    case SOLID.sandbag:
      return 1.1;
    case SOLID.tree:
      return 6;
    default:
      return 4;
  }
}

/** Throw from a soldier's hands; `power` 0..1 scales the speed (bots aim by distance). */
export function throwGrenade(id: string, owner: string, x: number, y: number, angle: number, time: number, power = 1): Grenade {
  const speed = THROW_SPEED * Math.max(0.3, Math.min(1, power));
  const h = Math.cos(THROW_PITCH) * speed;
  return {
    id,
    owner,
    x: x + Math.cos(angle) * 0.4,
    y: y + Math.sin(angle) * 0.4,
    z: RELEASE_HEIGHT,
    vx: Math.cos(angle) * h,
    vy: Math.sin(angle) * h,
    vz: Math.sin(THROW_PITCH) * speed,
    fuseAt: time + GRENADE_FUSE,
  };
}

const RELEASE_HEIGHT = 1.5;

/** Where a throw at `power` first touches flat ground (from a 1.5 m release). */
function carry(power: number) {
  const v = THROW_SPEED * power;
  const vs = Math.sin(THROW_PITCH) * v;
  return 0.4 + ((Math.cos(THROW_PITCH) * v) / GRAVITY) * (vs + Math.sqrt(vs * vs + 2 * GRAVITY * RELEASE_HEIGHT));
}

/** Throw power whose first bounce is about `dist` metres away (it rolls a little further). */
export function powerFor(dist: number) {
  let lo = 0.3;
  let hi = 1;
  if (carry(hi) <= dist) return 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (carry(mid) < dist) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function stepGrenade(g: Grenade, map: GameMap, dt: number) {
  const steps = Math.max(1, Math.ceil(dt / 0.01));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    g.vz -= GRAVITY * h;
    // Horizontal move with bounces off anything taller than the grenade.
    // Walls, props taller than the grenade, and a trench's earth sides all bounce it.
    const blocked = (x: number, y: number) => {
      const c = wallAt(map, Math.floor(x), Math.floor(y));
      return (c !== 0 && !SEE_THROUGH.has(c) && g.z < heightOf(c)) || g.z < floorAt(map, x, y) - 0.05;
    };
    const nx = g.x + g.vx * h;
    if (blocked(nx, g.y)) g.vx *= -0.35;
    else g.x = nx;
    const ny = g.y + g.vy * h;
    if (blocked(g.x, ny)) g.vy *= -0.35;
    else g.y = ny;
    g.z += g.vz * h;
    const floor = floorAt(map, g.x, g.y);
    if (g.z <= floor) {
      g.z = floor;
      if (Math.abs(g.vz) > 1.2) {
        g.vz = -g.vz * 0.3;
        g.vx *= 0.45;
        g.vy *= 0.45;
      } else {
        // Rolling: friction brings it to rest.
        g.vz = 0;
        const k = Math.max(0, 1 - 6 * h);
        g.vx *= k;
        g.vy *= k;
      }
    }
  }
}

export interface Exposed {
  x: number;
  y: number;
  stance?: 0 | 1 | 2;
}

/** Damage a blast does to someone standing at (x, y), after falloff and cover. */
export function blastDamage(b: BlastSpec, map: GameMap, t: Exposed, blastZ = floorAt(map, b.x, b.y)) {
  const d = Math.hypot(t.x - b.x, t.y - b.y);
  if (d >= b.radius) return 0;
  let dmg = b.damage * Math.pow(1 - d / b.radius, 1.4);
  const tIn = floorAt(map, t.x, t.y) < 0;
  const bIn = blastZ < -0.5;
  if (d > 1.5) {
    // Fragments fly over a trench; a blast down in one is contained by its walls.
    if (tIn && !bIn) dmg *= 0.25;
    else if (!tIn && bIn) dmg *= 0.35;
    if (!lineOfSight(map, b.x, b.y, t.x, t.y)) dmg *= 0.15;
  }
  if (t.stance === 2) dmg *= 0.55;
  else if (t.stance === 1) dmg *= 0.8;
  return Math.round(dmg);
}

export interface ShellPlan {
  x: number;
  y: number;
  /** Seconds after the barrage was called. */
  delay: number;
}

/** A barrage: `n` shells walking around a target over a few seconds. */
export function planBarrage(x: number, y: number, n: number, rand: () => number, spread = 10): ShellPlan[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * spread;
    return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, delay: 3 + i * 0.7 + rand() * 0.4 };
  });
}
