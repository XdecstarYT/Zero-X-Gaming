import type { Rng } from "../engine/rng";
import {
  CONSUMABLES,
  damageAt,
  rollChestLoot,
  SLOTS,
  weaponStats,
  WEAPONS,
  type ConsumableItem,
  type Item,
  type WeaponItem,
  type WeaponKind,
} from "./items";
import { castRay, lineOfSight, moveWithCollision, type GameMap } from "./map";

/**
 * Neon Siege combat simulation, shared by the battle royale (vs bots) and
 * online modes. Pure: time is passed in, randomness comes from an injected RNG.
 */

export const RADIUS = 0.28;
export const HIT_RADIUS = 0.34;
export const MOVE_SPEED = 3.4;
export const MAX_HP = 100;
export const MAX_SHIELD = 100;
export const RESPAWN_DELAY = 3;
export const PICKUP_RANGE = 1.4;
export const CHEST_RANGE = 1.6;
const USE_SLOW = 0.55;
const ADS_SLOW = 0.7;

export type EntityKind = "human" | "bot";

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind;
  /** Entities on the same team can't damage each other. Free-for-all: unique per entity. */
  team: number;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  shield: number;
  alive: boolean;
  respawnAt: number;
  kills: number;
  deaths: number;
  inventory: (Item | null)[];
  active: number;
  reloadUntil: number;
  reloadSlot: number;
  nextFireAt: number;
  /** Last time this entity fired (muzzle flash / recoil). */
  firedAt: number;
  hurtAt: number;
  lastAttacker: string | null;
  /** Using a consumable: which slot, and when it completes. */
  using: { slot: number; until: number } | null;
  aiming: boolean;
  /** Current movement speed (for animation). */
  speed: number;
  /** Bots trade raw power for numbers: multipliers on weapon damage/spread. */
  damageMult: number;
  spreadMult: number;
  /** Cosmetic outfit id (see battlepass catalogue). */
  outfit: string;
  /** Damage dealt this life/match (stats). */
  damageDealt: number;
  /** Trenches: 0 standing, 1 crouched, 2 prone. */
  stance?: 0 | 1 | 2;
  /** Trenches: sprint stamina 0..1. */
  stamina?: number;
}

export interface LootDrop {
  id: string;
  x: number;
  y: number;
  item: Item;
}

export interface Chest {
  id: string;
  x: number;
  y: number;
  opened: boolean;
}

export type WorldEvent =
  | {
      type: "shot";
      shooter: string;
      weapon: WeaponKind;
      hit: string | null;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }
  | { type: "damage"; target: string; attacker: string; amount: number; shield: boolean }
  | { type: "kill"; killer: string; victim: string; weapon: WeaponKind | "storm" }
  | { type: "respawn"; id: string }
  | { type: "reload"; id: string }
  | { type: "pickup"; id: string; item: Item }
  | { type: "chest"; id: string; by: string }
  | { type: "heal"; id: string; kind: ConsumableItem["kind"] };

export interface World {
  map: GameMap;
  entities: Map<string, Entity>;
  time: number;
  events: WorldEvent[];
  loot: Map<string, LootDrop>;
  chests: Chest[];
  lootSeq: number;
  /**
   * Online play: route a hit to the victim's owner. Return true if handled
   * elsewhere (damage is then NOT applied locally).
   */
  onHit?: (shooter: Entity, target: Entity, amount: number, weapon: WeaponKind) => boolean;
  /**
   * Optional cover model (Trenches): return true when a shot that would hit
   * `target` is stopped by cover instead (a trench lip, the ground when prone).
   */
  cover?: (shooter: Entity, target: Entity, dist: number, rng: Rng) => boolean;
}

export function createWorld(map: GameMap): World {
  return {
    map,
    entities: new Map(),
    time: 0,
    events: [],
    loot: new Map(),
    chests: map.chests.map((c, i) => ({ id: `chest-${i}`, x: c.x, y: c.y, opened: false })),
    lootSeq: 0,
  };
}

export function createEntity(init: Pick<Entity, "id" | "name" | "kind" | "team" | "x" | "y"> & Partial<Entity>): Entity {
  return {
    angle: 0,
    hp: MAX_HP,
    maxHp: MAX_HP,
    shield: 0,
    alive: true,
    respawnAt: 0,
    kills: 0,
    deaths: 0,
    inventory: Array.from({ length: SLOTS }, () => null),
    active: 0,
    reloadUntil: 0,
    reloadSlot: -1,
    nextFireAt: 0,
    firedAt: -10,
    hurtAt: -10,
    lastAttacker: null,
    using: null,
    aiming: false,
    speed: 0,
    damageMult: 1,
    spreadMult: 1,
    outfit: "recruit",
    damageDealt: 0,
    ...init,
  };
}

export const isEnemy = (a: Entity, b: Entity) => a.id !== b.id && a.team !== b.team;

export function activeItem(e: Entity): Item | null {
  return e.inventory[e.active] ?? null;
}

export function activeWeapon(e: Entity): WeaponItem | null {
  const it = activeItem(e);
  return it?.type === "weapon" ? it : null;
}

export function isReloading(world: World, e: Entity) {
  return e.reloadUntil > world.time;
}

export function move(world: World, e: Entity, forward: number, strafe: number, dt: number, speedMult = 1) {
  if (!e.alive) {
    e.speed = 0;
    return;
  }
  const len = Math.hypot(forward, strafe);
  if (len < 1e-6) {
    e.speed = 0;
    return;
  }
  const f = forward / Math.max(1, len);
  const s = strafe / Math.max(1, len);
  const w = activeWeapon(e);
  const speed =
    MOVE_SPEED *
    speedMult *
    (w ? WEAPONS[w.kind].mobility : 1) *
    (e.using ? USE_SLOW : 1) *
    (e.aiming ? ADS_SLOW : 1);
  const cos = Math.cos(e.angle);
  const sin = Math.sin(e.angle);
  const dx = (cos * f - sin * s) * speed * dt;
  const dy = (sin * f + cos * s) * speed * dt;
  const p = moveWithCollision(world.map, e.x, e.y, dx, dy, RADIUS);
  e.speed = Math.hypot(p.x - e.x, p.y - e.y) / Math.max(dt, 1e-6);
  e.x = p.x;
  e.y = p.y;
}

export const DRAW_TIME = 0.3;

export function switchSlot(world: World, e: Entity, slot: number) {
  if (slot < 0 || slot >= SLOTS || slot === e.active) return;
  e.active = slot;
  e.reloadUntil = 0;
  e.reloadSlot = -1;
  e.using = null;
  e.aiming = false;
  // Draw delay, so quick-switching between guns isn't a free DPS boost.
  e.nextFireAt = Math.max(e.nextFireAt, world.time + DRAW_TIME);
}

export function startReload(world: World, e: Entity) {
  const w = activeWeapon(e);
  if (!e.alive || !w || isReloading(world, e) || w.ammo >= WEAPONS[w.kind].mag) return false;
  e.reloadUntil = world.time + weaponStats(w).reload;
  e.reloadSlot = e.active;
  e.aiming = false;
  world.events.push({ type: "reload", id: e.id });
  return true;
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
 * Pull the trigger: fires the active weapon (all pellets), or starts using the
 * active consumable. Returns the shot summary, or null if nothing happened.
 */
export function fire(world: World, shooter: Entity, rng: Rng) {
  if (!shooter.alive || world.time < shooter.nextFireAt || isReloading(world, shooter) || shooter.using) return null;
  const item = activeItem(shooter);
  if (!item) return null;
  if (item.type === "consumable") {
    startUse(world, shooter);
    return null;
  }
  if (item.ammo <= 0) {
    startReload(world, shooter);
    return null;
  }
  const stats = weaponStats(item);
  item.ammo--;
  shooter.nextFireAt = world.time + stats.interval;
  shooter.firedAt = world.time;
  const spread = (shooter.aiming ? stats.adsSpread : stats.spread) * shooter.spreadMult;

  const perTarget = new Map<Entity, { amount: number; dist: number }>();
  let first: { dist: number; dx: number; dy: number; hit: Entity | null } | null = null;
  for (let p = 0; p < stats.pellets; p++) {
    const angle = shooter.angle + (rng.next() - 0.5) * 2 * spread;
    const trace = traceShot(world, shooter, angle);
    const { wall, dx, dy } = trace;
    let best = trace.best;
    // Cover soaks the round: the tracer ends at the target, but nobody is hit.
    const covered = best && world.cover?.(shooter, best.target, best.dist, rng);
    if (!first) first = { dist: best ? best.dist : wall.dist, dx, dy, hit: covered ? null : (best?.target ?? null) };
    if (covered) best = null;
    if (best) {
      const cur = perTarget.get(best.target) ?? { amount: 0, dist: best.dist };
      cur.amount += damageAt(item, best.dist) * shooter.damageMult;
      perTarget.set(best.target, cur);
    }
  }
  const f = first!;
  const anyHit = [...perTarget.keys()][0] ?? null;
  world.events.push({
    type: "shot",
    shooter: shooter.id,
    weapon: item.kind,
    hit: anyHit?.id ?? null,
    fromX: shooter.x,
    fromY: shooter.y,
    toX: shooter.x + f.dx * f.dist,
    toY: shooter.y + f.dy * f.dist,
  });
  for (const [target, { amount }] of perTarget) {
    const dmg = Math.round(amount);
    shooter.damageDealt += dmg;
    if (!world.onHit?.(shooter, target, dmg, item.kind)) damage(world, target, shooter, dmg, item.kind);
  }
  if (item.ammo === 0) startReload(world, shooter);
  return { hit: anyHit, dist: f.dist, targets: perTarget.size };
}

/** Apply damage: shield absorbs first. `attacker` may be a pseudo-entity like the storm. */
export function damage(
  world: World,
  target: Entity,
  attacker: Entity | { id: string },
  amount: number,
  weapon: WeaponKind | "storm" = "ar",
) {
  if (!target.alive || amount <= 0) return;
  let left = amount;
  const shieldHit = target.shield > 0 && weapon !== "storm";
  if (shieldHit) {
    const absorbed = Math.min(target.shield, left);
    target.shield -= absorbed;
    left -= absorbed;
  }
  target.hp = Math.max(0, target.hp - left);
  target.hurtAt = world.time;
  target.lastAttacker = attacker.id;
  target.using = null;
  world.events.push({ type: "damage", target: target.id, attacker: attacker.id, amount, shield: shieldHit });
  if (target.hp === 0) {
    target.alive = false;
    target.deaths++;
    target.respawnAt = world.time + RESPAWN_DELAY;
    target.using = null;
    target.aiming = false;
    const killer = world.entities.get(attacker.id);
    if (killer && killer.id !== target.id) killer.kills++;
    world.events.push({ type: "kill", killer: attacker.id, victim: target.id, weapon });
  }
}

// ------------------------------------------------------------- consumables

export function startUse(world: World, e: Entity) {
  const item = activeItem(e);
  if (!e.alive || item?.type !== "consumable" || e.using) return false;
  const def = CONSUMABLES[item.kind];
  const full = item.kind === "medkit" ? e.hp >= e.maxHp : e.shield >= MAX_SHIELD;
  if (full) return false;
  e.using = { slot: e.active, until: world.time + def.useTime };
  e.aiming = false;
  return true;
}

function finishUse(world: World, e: Entity) {
  const u = e.using!;
  e.using = null;
  const item = e.inventory[u.slot];
  if (item?.type !== "consumable") return;
  const def = CONSUMABLES[item.kind];
  if (item.kind === "medkit") e.hp = Math.min(e.maxHp, e.hp + def.amount);
  else e.shield = Math.min(MAX_SHIELD, e.shield + def.amount);
  item.count--;
  if (item.count <= 0) e.inventory[u.slot] = null;
  world.events.push({ type: "heal", id: e.id, kind: item.kind });
}

// ------------------------------------------------------------ loot & chests

export function spawnLoot(world: World, x: number, y: number, item: Item) {
  const id = `loot-${++world.lootSeq}`;
  world.loot.set(id, { id, x, y, item });
  return id;
}

/** Spread items in a small ring around a point (on walkable cells). */
export function scatterLoot(world: World, x: number, y: number, items: Item[], rng: Rng) {
  items.forEach((item, i) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = (i / Math.max(1, items.length)) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const r = rng.range(0.5, 1.1);
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (!isSolid(world, px, py)) {
        spawnLoot(world, px, py, item);
        return;
      }
    }
    spawnLoot(world, x, y, item);
  });
}

function isSolid(world: World, x: number, y: number) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= world.map.width || cy >= world.map.height) return true;
  return world.map.cells[cy * world.map.width + cx] !== 0;
}

export function nearestLoot(world: World, e: Entity, range = PICKUP_RANGE) {
  let best: LootDrop | null = null;
  let bestD = range;
  for (const l of world.loot.values()) {
    const d = Math.hypot(l.x - e.x, l.y - e.y);
    if (d <= bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

export function nearestChest(world: World, e: Entity, range = CHEST_RANGE) {
  let best: Chest | null = null;
  let bestD = range;
  for (const c of world.chests) {
    if (c.opened) continue;
    const d = Math.hypot(c.x - e.x, c.y - e.y);
    if (d <= bestD && lineOfSight(world.map, e.x, e.y, c.x, c.y)) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Put an item into the inventory. Weapons swap with the active slot when full (the old one drops). */
export function giveItem(world: World, e: Entity, item: Item): boolean {
  if (item.type === "consumable") {
    const stackMax = CONSUMABLES[item.kind].stack;
    for (const it of e.inventory) {
      if (it?.type === "consumable" && it.kind === item.kind && it.count < stackMax) {
        const take = Math.min(stackMax - it.count, item.count);
        it.count += take;
        item.count -= take;
        if (item.count === 0) return true;
      }
    }
  }
  const empty = e.inventory.findIndex((s) => s === null);
  if (empty >= 0) {
    e.inventory[empty] = item;
    if (!activeItem(e)) e.active = empty;
    return true;
  }
  if (item.type === "weapon") {
    const old = e.inventory[e.active];
    e.inventory[e.active] = item;
    e.reloadUntil = 0;
    e.using = null;
    if (old) spawnLoot(world, e.x, e.y, old);
    return true;
  }
  return false;
}

export function pickup(world: World, e: Entity, drop: LootDrop) {
  if (!e.alive || Math.hypot(drop.x - e.x, drop.y - e.y) > PICKUP_RANGE + 0.01) return false;
  world.loot.delete(drop.id);
  const item = drop.item;
  const taken = giveItem(world, e, { ...item } as Item);
  if (!taken) {
    world.loot.set(drop.id, drop);
    return false;
  }
  world.events.push({ type: "pickup", id: e.id, item });
  return true;
}

export function openChest(world: World, e: Entity, chest: Chest, rng: Rng) {
  if (chest.opened || !e.alive || Math.hypot(chest.x - e.x, chest.y - e.y) > CHEST_RANGE + 0.01) return false;
  chest.opened = true;
  scatterLoot(world, chest.x, chest.y, rollChestLoot(rng), rng);
  world.events.push({ type: "chest", id: chest.id, by: e.id });
  return true;
}

/** The interact button: open a nearby chest, else pick up the nearest item. */
export function interact(world: World, e: Entity, rng: Rng) {
  const chest = nearestChest(world, e);
  if (chest) return openChest(world, e, chest, rng);
  const drop = nearestLoot(world, e);
  return drop ? pickup(world, e, drop) : false;
}

/** On elimination, a fighter's inventory spills onto the floor. */
export function dropInventory(world: World, e: Entity, rng: Rng) {
  const items = e.inventory.filter((i): i is Item => i !== null);
  e.inventory = Array.from({ length: SLOTS }, () => null);
  scatterLoot(world, e.x, e.y, items, rng);
}

// --------------------------------------------------------------- spawning

/**
 * Spawn point out of sight of living enemies, as far as possible up to `idealDist`.
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
      if (nearest < 25 && lineOfSight(world.map, e.x, e.y, s.x, s.y)) seen = true;
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
    shield: 0,
    alive: true,
    reloadUntil: 0,
    reloadSlot: -1,
    lastAttacker: null,
    using: null,
    aiming: false,
  });
  e.angle = Math.atan2(world.map.height / 2 - s.y, world.map.width / 2 - s.x);
  world.events.push({ type: "respawn", id: e.id });
}

/** Advance timers: finish reloads and consumable uses. */
export function tickWorld(world: World, dt: number) {
  world.time += dt;
  for (const e of world.entities.values()) {
    if (e.reloadSlot >= 0 && e.reloadUntil <= world.time) {
      const w = e.inventory[e.reloadSlot];
      if (w?.type === "weapon") w.ammo = WEAPONS[w.kind].mag;
      e.reloadSlot = -1;
      e.reloadUntil = 0;
    }
    if (e.using && e.using.until <= world.time) finishUse(world, e);
  }
}

export function drainEvents(world: World) {
  const ev = world.events;
  world.events = [];
  return ev;
}
