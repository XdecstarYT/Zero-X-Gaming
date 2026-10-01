import { createRng } from "../engine/rng";
import { BUILDINGS, finishCost, GRID, TROOPS, type BuildingType, type Resource, type TroopType } from "./data";

/**
 * Your village: buildings on a 40 × 40 grid, resources, builders and their
 * timers, collectors filling up, the training queue and your army, the clan
 * hall's reinforcements, trophies and the defence log. Everything is pure and
 * driven by a `now` timestamp (ms), so offline progress is just `tick(v, now)`.
 */

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  /** 0 while it's first being built. */
  level: number;
  /** Building or upgrading until this time (ms). */
  busyUntil?: number;
  /** Collectors: resources waiting to be collected. */
  stored?: number;
  /** Collectors: last time production was counted. */
  lastTick?: number;
}

export interface DefenseLog {
  at: number;
  attacker: string;
  stars: number;
  destruction: number;
  gold: number;
  mana: number;
  trophies: number;
}

export type Army = Record<TroopType, number>;

export interface Village {
  v: 1;
  seed: number;
  name: string;
  gold: number;
  mana: number;
  crystals: number;
  trophies: number;
  buildings: Building[];
  nextId: number;
  army: Army;
  /** Training: troops and when each finishes (ms). */
  queue: { type: TroopType; done: number }[];
  clan: Army;
  /** The clan is filling your request until then. */
  clanReady?: number;
  log: DefenseLog[];
  shieldUntil: number;
  lastSeen: number;
  stats: { raids: number; wins: number; stars: number; goldLooted: number; manaLooted: number; defenses: number };
}

export const emptyArmy = (): Army => ({ brawler: 0, ranger: 0, raider: 0, brute: 0, sapper: 0, drake: 0 });

// ------------------------------------------------------------------- grid

/** Which building covers each tile (-1: none). */
export function occupancy(list: { id: number; type: BuildingType; x: number; y: number }[], skip = -1) {
  const g = new Int32Array(GRID * GRID).fill(-1);
  for (const b of list) {
    if (b.id === skip) continue;
    const s = BUILDINGS[b.type].size;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const x = b.x + dx;
      const y = b.y + dy;
      if (x >= 0 && y >= 0 && x < GRID && y < GRID) g[y * GRID + x] = b.id;
    }
  }
  return g;
}

export function fits(list: { id: number; type: BuildingType; x: number; y: number }[], type: BuildingType, x: number, y: number, skip = -1, occ?: Int32Array) {
  const s = BUILDINGS[type].size;
  if (x < 0 || y < 0 || x + s > GRID || y + s > GRID) return false;
  const g = occ ?? occupancy(list, skip);
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (g[(y + dy) * GRID + x + dx] !== -1) return false;
  return true;
}

// --------------------------------------------------------------- village

export function newVillage(seed: number, now: number, name = "Your village"): Village {
  const v: Village = {
    v: 1,
    seed,
    name,
    gold: 1500,
    mana: 1500,
    crystals: 250,
    trophies: 0,
    buildings: [],
    nextId: 1,
    army: { ...emptyArmy(), brawler: 10, ranger: 6 },
    queue: [],
    clan: emptyArmy(),
    log: [],
    shieldUntil: now + 3 * 3600_000,
    lastSeen: now,
    stats: { raids: 0, wins: 0, stars: 0, goldLooted: 0, manaLooted: 0, defenses: 0 },
  };
  const put = (type: BuildingType, x: number, y: number, level = 1) => {
    v.buildings.push({ id: v.nextId++, type, x, y, level, ...(BUILDINGS[type].levels[0].rate ? { stored: 0, lastTick: now } : {}) });
  };
  put("keep", 18, 18);
  put("goldMine", 12, 12);
  put("manaWell", 25, 12);
  put("goldVault", 13, 24);
  put("manaVat", 24, 24);
  put("barracks", 10, 18);
  put("camp", 26, 18);
  put("builderHut", 16, 14);
  put("builderHut", 22, 14);
  put("cannon", 18, 23);
  put("cannon", 18, 14);
  return v;
}

export const keepLevel = (v: Village) => v.buildings.find((b) => b.type === "keep")?.level ?? 1;
export const countOf = (v: Village, t: BuildingType) => v.buildings.filter((b) => b.type === t).length;
export const maxOf = (v: Village, t: BuildingType) => BUILDINGS[t].max[Math.min(keepLevel(v), 6) - 1] ?? 0;

/** Storage capacity for each resource (the Keep plus vaults / vats that are built). */
export function capacity(v: Village): Record<Resource, number> {
  const cap = { gold: 0, mana: 0 };
  for (const b of v.buildings) {
    if (b.level < 1) continue;
    const st = BUILDINGS[b.type].levels[b.level - 1];
    if (b.type === "keep") {
      cap.gold += st.capacity ?? 0;
      cap.mana += st.capacity ?? 0;
    } else if (b.type === "goldVault") cap.gold += st.capacity ?? 0;
    else if (b.type === "manaVat") cap.mana += st.capacity ?? 0;
  }
  return cap;
}

export const builders = (v: Village) => countOf(v, "builderHut");
export const busyBuilders = (v: Village, now: number) => v.buildings.filter((b) => b.busyUntil && b.busyUntil > now).length;

/** Army housing: camps' capacity, and what's used (trained plus in training). */
export function housing(v: Village) {
  const cap = v.buildings.filter((b) => b.type === "camp" && b.level > 0).reduce((a, b) => a + (BUILDINGS.camp.levels[b.level - 1].capacity ?? 0), 0);
  const used = (Object.keys(v.army) as TroopType[]).reduce((a, t) => a + v.army[t] * TROOPS[t].housing, 0) + v.queue.reduce((a, q) => a + TROOPS[q.type].housing, 0);
  return { cap, used };
}

export const barracksLevel = (v: Village) => Math.max(0, ...v.buildings.filter((b) => b.type === "barracks").map((b) => b.level));
export const clanCapacity = (v: Village) => {
  const h = v.buildings.find((b) => b.type === "clanHall" && b.level > 0);
  return h ? (BUILDINGS.clanHall.levels[h.level - 1].capacity ?? 0) : 0;
};

const cappedAdd = (v: Village, r: Resource, amt: number) => {
  const cap = capacity(v)[r];
  const before = v[r];
  v[r] = Math.min(cap, v[r] + amt);
  return v[r] - before;
};

/** Move time on: finish builds, fill collectors, finish training, the clan's reinforcements. */
export function tick(v: Village, now: number) {
  for (const b of v.buildings) {
    if (b.busyUntil && b.busyUntil <= now) {
      b.level++;
      delete b.busyUntil;
      if (BUILDINGS[b.type].levels[0].rate && b.lastTick === undefined) {
        b.stored = 0;
        b.lastTick = now;
      }
    }
    const def = BUILDINGS[b.type];
    if (def.levels[0].rate && b.level > 0) {
      const st = def.levels[b.level - 1];
      const last = b.lastTick ?? now;
      // Collectors don't produce while they're being upgraded.
      if (!b.busyUntil) b.stored = Math.min(st.capacity ?? 0, (b.stored ?? 0) + ((st.rate ?? 0) * Math.max(0, now - last)) / 60_000);
      b.lastTick = now;
    }
  }
  // Training: finished troops join the army, in order.
  while (v.queue.length && v.queue[0].done <= now) {
    const q = v.queue.shift()!;
    v.army[q.type]++;
  }
  if (v.clanReady && v.clanReady <= now) {
    const rng = createRng(v.seed + Math.floor(now / 1000));
    let room = clanCapacity(v);
    const pool: TroopType[] = ["brawler", "ranger", "raider", "brute"];
    const c = emptyArmy();
    for (let i = 0; i < 40 && room > 0; i++) {
      const t = pool[Math.floor(rng.next() * pool.length)];
      if (TROOPS[t].housing <= room) {
        c[t]++;
        room -= TROOPS[t].housing;
      }
    }
    v.clan = c;
    delete v.clanReady;
  }
  v.lastSeen = now;
}

export type ActionResult = { ok: true } | { ok: false; why: string };
const fail = (why: string): ActionResult => ({ ok: false, why });

/** Place a new building (walls are instant and need no builder). */
export function build(v: Village, type: BuildingType, x: number, y: number, now: number): ActionResult {
  const def = BUILDINGS[type];
  const l1 = def.levels[0];
  if (l1.keep > keepLevel(v)) return fail(`Needs Keep level ${l1.keep}`);
  if (countOf(v, type) >= maxOf(v, type)) return fail(`Upgrade your Keep to build more ${def.name}s`);
  if (!fits(v.buildings, type, x, y)) return fail("Doesn't fit there");
  if (type === "builderHut") {
    const price = 250 * (countOf(v, "builderHut") - 1);
    if (v.crystals < price) return fail(`Needs ${price} crystals`);
    v.crystals -= price;
    v.buildings.push({ id: v.nextId++, type, x, y, level: 1 });
    return { ok: true };
  }
  if (v[def.resource] < l1.cost) return fail(`Not enough ${def.resource}`);
  if (l1.time > 0 && busyBuilders(v, now) >= builders(v)) return fail("All builders are busy");
  v[def.resource] -= l1.cost;
  const b: Building = { id: v.nextId++, type, x, y, level: l1.time > 0 ? 0 : 1 };
  if (l1.time > 0) b.busyUntil = now + l1.time * 1000;
  if (l1.rate) {
    b.stored = 0;
    b.lastTick = now;
  }
  v.buildings.push(b);
  return { ok: true };
}

export function upgrade(v: Village, id: number, now: number): ActionResult {
  const b = v.buildings.find((x) => x.id === id);
  if (!b) return fail("No such building");
  if (b.busyUntil) return fail("Already being upgraded");
  const def = BUILDINGS[b.type];
  const next = def.levels[b.level];
  if (!next) return fail("Max level");
  if (next.keep > keepLevel(v) && b.type !== "keep") return fail(`Needs Keep level ${next.keep}`);
  if (v[def.resource] < next.cost) return fail(`Not enough ${def.resource}`);
  if (next.time > 0 && busyBuilders(v, now) >= builders(v)) return fail("All builders are busy");
  tick(v, now);
  v[def.resource] -= next.cost;
  if (next.time > 0) b.busyUntil = now + next.time * 1000;
  else b.level++;
  return { ok: true };
}

/** Finish a build or upgrade now, for crystals. */
export function finishNow(v: Village, id: number, now: number): ActionResult {
  const b = v.buildings.find((x) => x.id === id);
  if (!b?.busyUntil) return fail("Nothing to finish");
  const cost = finishCost((b.busyUntil - now) / 1000);
  if (v.crystals < cost) return fail(`Needs ${cost} crystals`);
  v.crystals -= cost;
  b.busyUntil = now;
  tick(v, now);
  return { ok: true };
}

export function move(v: Village, id: number, x: number, y: number): ActionResult {
  const b = v.buildings.find((q) => q.id === id);
  if (!b) return fail("No such building");
  if (!fits(v.buildings, b.type, x, y, id)) return fail("Doesn't fit there");
  b.x = x;
  b.y = y;
  return { ok: true };
}

/** Collect a collector (or all of them): returns what was collected. */
export function collect(v: Village, now: number, id?: number) {
  tick(v, now);
  const got = { gold: 0, mana: 0 };
  for (const b of v.buildings) {
    if (id !== undefined && b.id !== id) continue;
    if (!b.stored) continue;
    const r: Resource = b.type === "goldMine" ? "gold" : "mana";
    const added = cappedAdd(v, r, Math.floor(b.stored));
    got[r] += added;
    b.stored -= added;
  }
  return got;
}

export function train(v: Village, type: TroopType, now: number): ActionResult {
  const t = TROOPS[type];
  if (barracksLevel(v) < t.barracks) return fail(`Needs Barracks level ${t.barracks}`);
  const h = housing(v);
  if (h.used + t.housing > h.cap) return fail("Your camps are full");
  if (v.mana < t.cost) return fail("Not enough mana");
  v.mana -= t.cost;
  const start = Math.max(now, v.queue.length ? v.queue[v.queue.length - 1].done : now);
  v.queue.push({ type, done: start + t.time * 1000 });
  return { ok: true };
}

/** Cancel the last queued troop of a type (refunds the mana). */
export function untrain(v: Village, type: TroopType, now: number) {
  for (let i = v.queue.length - 1; i >= 0; i--) {
    if (v.queue[i].type !== type) continue;
    v.queue.splice(i, 1);
    v.mana += TROOPS[type].cost;
    // Re-time the rest of the queue.
    let t = now;
    for (const q of v.queue) {
      t = Math.max(t, now) + TROOPS[q.type].time * 1000;
      q.done = t;
    }
    return true;
  }
  return false;
}

/** Finish training now for crystals. */
export function finishTraining(v: Village, now: number): ActionResult {
  if (!v.queue.length) return fail("Nothing training");
  const cost = finishCost((v.queue[v.queue.length - 1].done - now) / 1000);
  if (v.crystals < cost) return fail(`Needs ${cost} crystals`);
  v.crystals -= cost;
  for (const q of v.queue) q.done = now;
  tick(v, now);
  return { ok: true };
}

/** Ask your clan for troops: they arrive in 45 seconds. */
export function requestClan(v: Village, now: number): ActionResult {
  if (!clanCapacity(v)) return fail("Build a Clan Hall first");
  if (v.clanReady) return fail("Your clan is on it");
  v.clanReady = now + 45_000;
  return { ok: true };
}

/** What an attacker could take: per building, the gold and mana it holds that can be looted. */
export function lootable(v: Village, now: number) {
  tick(v, now);
  const out = new Map<number, { gold: number; mana: number }>();
  const capG = capacity(v).gold || 1;
  const capM = capacity(v).mana || 1;
  for (const b of v.buildings) {
    const def = BUILDINGS[b.type];
    if (b.level < 1 || !def.loot) continue;
    const st = def.levels[b.level - 1];
    let g = 0;
    let m = 0;
    if (b.type === "goldMine") g = b.stored ?? 0;
    else if (b.type === "manaWell") m = b.stored ?? 0;
    else if (b.type === "goldVault") g = (v.gold * (st.capacity ?? 0)) / capG;
    else if (b.type === "manaVat") m = (v.mana * (st.capacity ?? 0)) / capM;
    else if (b.type === "keep") {
      g = (v.gold * (st.capacity ?? 0)) / capG;
      m = (v.mana * (st.capacity ?? 0)) / capM;
    }
    out.set(b.id, { gold: Math.floor(g * def.loot), mana: Math.floor(m * def.loot) });
  }
  return out;
}

/** After your raid: loot in, trophies, the troops you used are gone. */
export function applyRaid(v: Village, r: { stars: number; gold: number; mana: number; trophies: number; used: Army; usedClan: boolean }, now: number) {
  tick(v, now);
  const g = cappedAdd(v, "gold", r.gold);
  const m = cappedAdd(v, "mana", r.mana);
  v.trophies = Math.max(0, v.trophies + r.trophies);
  for (const t of Object.keys(r.used) as TroopType[]) v.army[t] = Math.max(0, v.army[t] - r.used[t]);
  if (r.usedClan) v.clan = emptyArmy();
  v.stats.raids++;
  if (r.stars > 0) v.stats.wins++;
  v.stats.stars += r.stars;
  v.stats.goldLooted += g;
  v.stats.manaLooted += m;
  // Attacking drops your shield.
  v.shieldUntil = Math.min(v.shieldUntil, now);
  // Stars earn a few crystals.
  v.crystals += r.stars;
  return { gold: g, mana: m };
}

/** After a raid on you: what they took, trophies, a shield if it went badly. */
export function applyDefense(v: Village, d: DefenseLog, takenFrom: Map<number, { gold: number; mana: number }>, now: number) {
  for (const b of v.buildings) {
    const t = takenFrom.get(b.id);
    if (!t) continue;
    if (b.type === "goldMine") b.stored = Math.max(0, (b.stored ?? 0) - t.gold);
    if (b.type === "manaWell") b.stored = Math.max(0, (b.stored ?? 0) - t.mana);
  }
  const fromStores = [...v.buildings].reduce(
    (a, b) => {
      const t = takenFrom.get(b.id);
      if (!t || b.type === "goldMine" || b.type === "manaWell") return a;
      return { gold: a.gold + t.gold, mana: a.mana + t.mana };
    },
    { gold: 0, mana: 0 },
  );
  v.gold = Math.max(0, v.gold - fromStores.gold);
  v.mana = Math.max(0, v.mana - fromStores.mana);
  v.trophies = Math.max(0, v.trophies + d.trophies);
  v.log.unshift(d);
  v.log = v.log.slice(0, 10);
  v.stats.defenses++;
  if (d.stars >= 2 || d.destruction >= 60) v.shieldUntil = now + (d.stars === 3 ? 14 : 12) * 3600_000;
}

export function parseVillage(raw: unknown): Village | null {
  const v = raw as Village | null;
  return v && v.v === 1 && Array.isArray(v.buildings) && v.army ? v : null;
}
