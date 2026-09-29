import { castRay, lineOfSight, moveWithCollision, parseMap, type GameMap } from "./map";
import type { Rng } from "../engine/rng";

/**
 * Neon Siege combat simulation shared by solo (vs bots) and online modes.
 * Pure: time is passed in, randomness comes from the injected RNG.
 */

export const RADIUS = 0.25;
export const HIT_RADIUS = 0.32;
export const MOVE_SPEED = 3.2;
export const MAX_HP = 100;
export const MAG_SIZE = 24;
export const FIRE_INTERVAL = 0.12;
export const RELOAD_TIME = 1.4;
export const DAMAGE = 25;
export const FAR_DAMAGE = 16;
export const FALLOFF_DIST = 10;
export const SPREAD = 0.012;
export const RESPAWN_DELAY = 3;

export type EntityKind = "human" | "bot";

export interface Weapon {
  damage: number;
  farDamage: number;
  interval: number;
  spread: number;
}

/** Player rifle. Bots get weaker, less accurate variants (see bots.ts). */
export const RIFLE: Weapon = { damage: DAMAGE, farDamage: FAR_DAMAGE, interval: FIRE_INTERVAL, spread: SPREAD };

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind;
  /** Entities on the same team can't damage each other. Deathmatch: unique per entity. */
  team: number;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAt: number;
  kills: number;
  deaths: number;
  ammo: number;
  reloadUntil: number;
  nextFireAt: number;
  /** Last time this entity fired (muzzle flash). */
  firedAt: number;
  /** Last time this entity took damage, and from whom. */
  hurtAt: number;
  lastAttacker: string | null;
  weapon: Weapon;
}

export type WorldEvent =
  | { type: "shot"; shooter: string; hit: string | null; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "damage"; target: string; attacker: string; amount: number }
  | { type: "kill"; killer: string; victim: string }
  | { type: "respawn"; id: string }
  | { type: "reload"; id: string }
  | { type: "wave"; wave: number; cleared: boolean };

export interface World {
  map: GameMap;
  entities: Map<string, Entity>;
  time: number;
  events: WorldEvent[];
  /**
   * Online play: route a hit to the victim's owner. Return true if handled
   * elsewhere (damage is then NOT applied locally).
   */
  onHit?: (shooter: Entity, target: Entity, amount: number) => boolean;
}

export function createWorld(map = parseMap()): World {
  return { map, entities: new Map(), time: 0, events: [] };
}

export function createEntity(
  init: Pick<Entity, "id" | "name" | "kind" | "team" | "x" | "y"> & Partial<Entity>,
): Entity {
  return {
    angle: 0,
    hp: MAX_HP,
    maxHp: MAX_HP,
    alive: true,
    respawnAt: 0,
    kills: 0,
    deaths: 0,
    ammo: MAG_SIZE,
    reloadUntil: 0,
    nextFireAt: 0,
    firedAt: -10,
    hurtAt: -10,
    lastAttacker: null,
    weapon: RIFLE,
    ...init,
  };
}

export const isEnemy = (a: Entity, b: Entity) => a.id !== b.id && a.team !== b.team;

export function move(world: World, e: Entity, forward: number, strafe: number, dt: number, speed = MOVE_SPEED) {
  if (!e.alive) return;
  const len = Math.hypot(forward, strafe);
  if (len < 1e-6) return;
  const f = forward / Math.max(1, len);
  const s = strafe / Math.max(1, len);
  const cos = Math.cos(e.angle);
  const sin = Math.sin(e.angle);
  const dx = (cos * f - sin * s) * speed * dt;
  const dy = (sin * f + cos * s) * speed * dt;
  const p = moveWithCollision(world.map, e.x, e.y, dx, dy, RADIUS);
  e.x = p.x;
  e.y = p.y;
}

export function startReload(world: World, e: Entity) {
  if (!e.alive || e.reloadUntil > world.time || e.ammo === MAG_SIZE) return false;
  e.reloadUntil = world.time + RELOAD_TIME;
  world.events.push({ type: "reload", id: e.id });
  return true;
}

export function isReloading(world: World, e: Entity) {
  return e.reloadUntil > world.time;
}

/** Nearest enemy whose hit circle the ray crosses before the wall, if any. */
export function traceShot(world: World, shooter: Entity, angle: number) {
  const wall = castRay(world.map, shooter.x, shooter.y, angle);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best: { target: Entity; dist: number } | null = null;
  for (const t of world.entities.values()) {
    if (!t.alive || !isEnemy(shooter, t)) continue;
    const vx = t.x - shooter.x;
    const vy = t.y - shooter.y;
    const along = vx * dx + vy * dy;
    if (along <= 0 || along >= wall.dist) continue;
    const perp = Math.abs(vx * dy - vy * dx);
    if (perp <= HIT_RADIUS && (!best || along < best.dist)) best = { target: t, dist: along };
  }
  return { wall, best, dx, dy };
}

/**
 * Fire the shooter's weapon if possible (alive, off cooldown, loaded).
 * Hit detection is hitscan with a small random spread.
 */
export function fire(world: World, shooter: Entity, rng: Rng) {
  if (!shooter.alive || world.time < shooter.nextFireAt || isReloading(world, shooter)) return null;
  if (shooter.ammo <= 0) {
    startReload(world, shooter);
    return null;
  }
  shooter.ammo--;
  shooter.nextFireAt = world.time + shooter.weapon.interval;
  shooter.firedAt = world.time;
  const angle = shooter.angle + (rng.next() - 0.5) * 2 * shooter.weapon.spread;
  const { wall, best, dx, dy } = traceShot(world, shooter, angle);
  const dist = best ? best.dist : wall.dist;
  world.events.push({
    type: "shot",
    shooter: shooter.id,
    hit: best?.target.id ?? null,
    fromX: shooter.x,
    fromY: shooter.y,
    toX: shooter.x + dx * dist,
    toY: shooter.y + dy * dist,
  });
  if (best) {
    const amount = best.dist > FALLOFF_DIST ? shooter.weapon.farDamage : shooter.weapon.damage;
    if (!world.onHit?.(shooter, best.target, amount)) damage(world, best.target, shooter, amount);
  }
  if (shooter.ammo === 0) startReload(world, shooter);
  return { hit: best?.target ?? null, dist };
}

export function damage(world: World, target: Entity, attacker: Entity | { id: string }, amount: number) {
  if (!target.alive) return;
  target.hp = Math.max(0, target.hp - amount);
  target.hurtAt = world.time;
  target.lastAttacker = attacker.id;
  world.events.push({ type: "damage", target: target.id, attacker: attacker.id, amount });
  if (target.hp === 0) {
    target.alive = false;
    target.deaths++;
    target.respawnAt = world.time + RESPAWN_DELAY;
    const killer = world.entities.get(attacker.id);
    if (killer && killer.id !== target.id) killer.kills++;
    world.events.push({ type: "kill", killer: attacker.id, victim: target.id });
  }
}

/**
 * Spawn point out of sight of living enemies, as far as possible up to `idealDist`
 * (beyond that all spawns rank equally, so wave modes can bring enemies in closer).
 */
export function pickSpawn(world: World, forEntity: Entity, rng: Rng, idealDist = 30) {
  const enemies = [...world.entities.values()].filter((e) => e.alive && isEnemy(forEntity, e));
  let best = world.map.spawns[0];
  let bestScore = -Infinity;
  for (const s of world.map.spawns) {
    let nearest = Infinity;
    let seen = false;
    for (const e of enemies) {
      nearest = Math.min(nearest, Math.hypot(e.x - s.x, e.y - s.y));
      if (lineOfSight(world.map, e.x, e.y, s.x, s.y)) seen = true;
    }
    const score = Math.min(nearest, idealDist) - (seen ? 20 : 0) - (nearest < 4 ? 10 : 0) + rng.next() * 2;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

export function respawn(world: World, e: Entity, rng: Rng) {
  const s = pickSpawn(world, e, rng);
  Object.assign(e, {
    x: s.x,
    y: s.y,
    hp: e.maxHp,
    alive: true,
    ammo: MAG_SIZE,
    reloadUntil: 0,
    lastAttacker: null,
  });
  e.angle = Math.atan2(world.map.height / 2 - s.y, world.map.width / 2 - s.x);
  world.events.push({ type: "respawn", id: e.id });
}

/** Advance timers: finish reloads. (Respawns are decided by the mode.) */
export function tickWorld(world: World, dt: number) {
  world.time += dt;
  for (const e of world.entities.values()) {
    if (e.reloadUntil && e.reloadUntil <= world.time && e.reloadUntil > world.time - dt - 1e-9) e.ammo = MAG_SIZE;
  }
}

export function drainEvents(world: World) {
  const ev = world.events;
  world.events = [];
  return ev;
}
