import { createRng, type Rng } from "../engine/rng";

/**
 * Zenith: the city, as data and rules (no three.js), so it can be tested.
 * A 48×48 map of 12 m tiles with a river and woods. You lay roads from the
 * highway, paint residential, commercial and industrial zones, and supply
 * power, water and services; buildings move in, level up and empty out on
 * their own, driven by demand, land value, pollution and the budget.
 */

export const N = 48;
export const TILE = 12;

export type Zone = "R" | "C" | "I";
export type Density = "low" | "high";
export type ServiceKind =
  | "coal"
  | "wind"
  | "solar"
  | "tower"
  | "pump"
  | "police"
  | "fire"
  | "clinic"
  | "hospital"
  | "school"
  | "park"
  | "plaza";

export interface Building {
  level: 1 | 2 | 3;
  /** Which facade and shape (stable per building). */
  style: number;
  /** Days standing. */
  age: number;
  abandoned: boolean;
  /** Days without power or water. */
  short: number;
}

export interface Tile {
  water: boolean;
  tree: boolean;
  road: boolean;
  /** Part of the highway in from the west: can't be bulldozed. */
  highway?: boolean;
  zone: Zone | null;
  density: Density;
  bld: Building | null;
  svc: ServiceKind | null;
}

export interface City {
  version: 1;
  name: string;
  seed: number;
  day: number;
  money: number;
  tax: Record<Zone, number>;
  tiles: Tile[];
  milestone: number;
  /** One row a week: day, population, money. */
  history: { day: number; pop: number; money: number }[];
  nextStyle: number;
}

export interface ServiceDef {
  name: string;
  icon: string;
  cost: number;
  upkeep: number;
  /** Coverage radius in tiles (0 = none). */
  radius: number;
  power?: number;
  water?: number;
  /** Pollution it gives off (0–1) within its radius. */
  pollution?: number;
  /** Land value it adds within its radius. */
  value?: number;
  /** Milestone needed. */
  unlock: number;
  /** Must touch water (pumps). */
  needsWater?: boolean;
  group: "power" | "water" | "safety" | "health" | "education" | "parks";
}

export const SERVICES: Record<ServiceKind, ServiceDef> = {
  coal: {
    name: "Coal Power Plant",
    icon: "🏭",
    cost: 8_000,
    upkeep: 60,
    radius: 5,
    power: 1_600,
    pollution: 0.6,
    unlock: 0,
    group: "power",
  },
  wind: { name: "Wind Turbine", icon: "🌬️", cost: 2_200, upkeep: 12, radius: 0, power: 180, unlock: 0, group: "power" },
  solar: { name: "Solar Farm", icon: "☀️", cost: 6_000, upkeep: 20, radius: 0, power: 700, unlock: 2, group: "power" },
  tower: { name: "Water Tower", icon: "🗼", cost: 1_800, upkeep: 12, radius: 0, water: 500, unlock: 0, group: "water" },
  pump: {
    name: "Pumping Station",
    icon: "🚰",
    cost: 5_000,
    upkeep: 35,
    radius: 0,
    water: 2_500,
    unlock: 1,
    needsWater: true,
    group: "water",
  },
  police: { name: "Police Station", icon: "🚓", cost: 3_000, upkeep: 30, radius: 7, unlock: 0, group: "safety" },
  fire: { name: "Fire Station", icon: "🚒", cost: 3_000, upkeep: 30, radius: 7, unlock: 0, group: "safety" },
  clinic: { name: "Medical Clinic", icon: "⚕️", cost: 2_500, upkeep: 25, radius: 6, unlock: 0, group: "health" },
  hospital: {
    name: "Hospital",
    icon: "🏥",
    cost: 9_000,
    upkeep: 80,
    radius: 12,
    value: 0.05,
    unlock: 2,
    group: "health",
  },
  school: {
    name: "School",
    icon: "🏫",
    cost: 3_500,
    upkeep: 30,
    radius: 8,
    value: 0.05,
    unlock: 1,
    group: "education",
  },
  park: { name: "Park", icon: "🌳", cost: 400, upkeep: 3, radius: 3, value: 0.22, unlock: 0, group: "parks" },
  plaza: { name: "City Plaza", icon: "⛲", cost: 2_500, upkeep: 10, radius: 5, value: 0.3, unlock: 3, group: "parks" },
};
export const SERVICE_IDS = Object.keys(SERVICES) as ServiceKind[];

export const MILESTONES = [
  { name: "Hamlet", pop: 0, reward: 0 },
  { name: "Village", pop: 300, reward: 10_000 },
  { name: "Town", pop: 1_500, reward: 25_000 },
  { name: "City", pop: 6_000, reward: 60_000 },
  { name: "Metropolis", pop: 20_000, reward: 150_000 },
];
/** High-density zoning comes with Town. */
export const HIGH_DENSITY_AT = 2;

export const ROAD_COST = 25;
export const BRIDGE_COST = 150;
export const ROAD_UPKEEP = 0.15;
export const START_MONEY = 60_000;

/** People (R) or jobs (C, I) a building holds, by zone, density and level. */
export const OCCUPANTS: Record<Zone, Record<Density, [number, number, number]>> = {
  R: { low: [6, 14, 24], high: [40, 90, 160] },
  C: { low: [5, 12, 20], high: [30, 70, 120] },
  I: { low: [10, 20, 32], high: [10, 20, 32] },
};
/** Land value needed to reach level 2 and 3. */
export const LEVEL_AT = [0, 0.42, 0.68];

export const idx = (x: number, y: number) => y * N + x;
export const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
export const xy = (i: number) => ({ x: i % N, y: Math.floor(i / N) });
export const tileAt = (c: City, x: number, y: number) => (inMap(x, y) ? c.tiles[idx(x, y)] : undefined);

/** Where the highway comes in: the west edge, half way down. */
export const ENTRANCE = { x: 0, y: Math.floor(N / 2) };
const HIGHWAY_LEN = 5;

export type Result = { ok: true; cost?: number } | { ok: false; why: string };
const no = (why: string): Result => ({ ok: false, why });

// ------------------------------------------------------------------ new city

/** A fresh map: a winding river, woods, and the highway in from the west. */
export function newCity(name = "Zenith", seed = 1): City {
  const rng = createRng(seed);
  const tiles: Tile[] = Array.from({ length: N * N }, () => ({
    water: false,
    tree: false,
    road: false,
    zone: null,
    density: "low",
    bld: null,
    svc: null,
  }));
  // The river runs north to south east of the middle, with a lazy meander.
  const phase = rng.next() * Math.PI * 2;
  const base = Math.floor(N * 0.68);
  for (let y = 0; y < N; y++) {
    const cx = base + Math.round(Math.sin(y / 7 + phase) * 4 + Math.sin(y / 3.1 + phase * 2) * 1.2);
    const w = 2 + (Math.sin(y / 5 + phase) > 0.6 ? 1 : 0);
    for (let x = cx; x < cx + w; x++) if (inMap(x, y)) tiles[idx(x, y)].water = true;
  }
  // Woods: clumps from a few seeds.
  for (let k = 0; k < 14; k++) {
    const sx = rng.int(0, N - 1);
    const sy = rng.int(0, N - 1);
    const r = rng.int(2, 5);
    for (let y = sy - r; y <= sy + r; y++)
      for (let x = sx - r; x <= sx + r; x++) {
        const t = tileAt({ tiles } as City, x, y);
        if (t && !t.water && Math.hypot(x - sx, y - sy) <= r && rng.next() < 0.75) t.tree = true;
      }
  }
  // The highway in, cleared.
  for (let x = 0; x < HIGHWAY_LEN; x++) {
    const t = tiles[idx(x, ENTRANCE.y)];
    Object.assign(t, { road: true, highway: true, tree: false, water: false });
  }
  for (let y = ENTRANCE.y - 2; y <= ENTRANCE.y + 2; y++)
    for (let x = 0; x < HIGHWAY_LEN + 3; x++) tiles[idx(x, y)].tree = false;
  return {
    version: 1,
    name: name.slice(0, 24) || "Zenith",
    seed,
    day: 1,
    money: START_MONEY,
    tax: { R: 0.09, C: 0.09, I: 0.09 },
    tiles,
    milestone: 0,
    history: [],
    nextStyle: 1,
  };
}

// ---------------------------------------------------------------- building

/** The tiles of a road drawn from A to B: along x first, then y (an L). */
export function roadPath(ax: number, ay: number, bx: number, by: number) {
  const out = [{ x: ax, y: ay }];
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  let x = ax;
  while (x !== bx) {
    x += sx;
    out.push({ x, y: ay });
  }
  let y = ay;
  while (y !== by) {
    y += sy;
    out.push({ x: bx, y });
  }
  return out;
}

/** What a road from A to B would cost (and whether it can go there). */
export function roadCost(c: City, ax: number, ay: number, bx: number, by: number): Result {
  let cost = 0;
  for (const p of roadPath(ax, ay, bx, by)) {
    const t = tileAt(c, p.x, p.y);
    if (!t) return no("Off the map");
    if (t.road) continue;
    if (t.svc || t.bld) return no("Something's in the way: bulldoze it first");
    cost += t.water ? BRIDGE_COST : ROAD_COST;
  }
  return { ok: true, cost };
}

export function placeRoad(c: City, ax: number, ay: number, bx: number, by: number): Result {
  const r = roadCost(c, ax, ay, bx, by);
  if (!r.ok) return r;
  if ((r.cost ?? 0) > c.money) return no("Not enough money");
  c.money -= r.cost ?? 0;
  for (const p of roadPath(ax, ay, bx, by)) {
    const t = c.tiles[idx(p.x, p.y)];
    t.road = true;
    t.tree = false;
    t.zone = null;
  }
  return r;
}

/** Zoned tiles must be within two tiles of a road. */
export function nearRoad(c: City, x: number, y: number, reach = 2) {
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) if (tileAt(c, x + dx, y + dy)?.road) return true;
  return false;
}

/** Paint zoning over a rectangle (null clears it). Returns how many tiles changed. */
export function zoneRect(
  c: City,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  zone: Zone | null,
  density: Density = "low",
): Result & { tiles?: number } {
  if (density === "high" && zone && zone !== "I" && c.milestone < HIGH_DENSITY_AT)
    return no(`High density comes with ${MILESTONES[HIGH_DENSITY_AT].name}`);
  let n = 0;
  for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++)
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
      const t = tileAt(c, x, y);
      if (!t || t.water || t.road || t.svc || !nearRoad(c, x, y)) continue;
      const d: Density = zone === "I" ? "low" : density;
      if (t.zone === zone && t.density === d) continue;
      // Rezoning knocks down what's there.
      if (t.zone !== zone || t.density !== d) t.bld = null;
      t.zone = zone;
      t.density = d;
      if (zone) t.tree = false;
      n++;
    }
  return { ok: true, tiles: n };
}

/** Whether a service can go on a tile (without building it). */
export function canService(c: City, kind: ServiceKind, x: number, y: number): Result {
  const d = SERVICES[kind];
  const t = tileAt(c, x, y);
  if (!t) return no("Off the map");
  if (c.milestone < d.unlock) return no(`Unlocks at ${MILESTONES[d.unlock].name}`);
  if (t.water || t.road || t.svc) return no("Can't build there");
  if (
    kind !== "park" &&
    kind !== "wind" &&
    ![
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => tileAt(c, x + dx, y + dy)?.road)
  )
    return no("Needs a road beside it");
  if (
    d.needsWater &&
    ![
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => tileAt(c, x + dx, y + dy)?.water)
  )
    return no("Must be on the riverbank");
  if (c.money < d.cost) return no("Not enough money");
  return { ok: true, cost: d.cost };
}

/** Place a service on a tile next to a road. */
export function placeService(c: City, kind: ServiceKind, x: number, y: number): Result {
  const r = canService(c, kind, x, y);
  if (!r.ok) return r;
  const d = SERVICES[kind];
  const t = c.tiles[idx(x, y)];
  c.money -= d.cost;
  Object.assign(t, { svc: kind, bld: null, zone: null, tree: false });
  return { ok: true, cost: d.cost };
}

/** Clear a tile (roads, buildings, services, zoning). The highway stays. */
export function bulldoze(c: City, x: number, y: number): Result {
  const t = tileAt(c, x, y);
  if (!t) return no("Off the map");
  if (t.highway) return no("That's the highway");
  if (!t.road && !t.svc && !t.bld && !t.zone && !t.tree) return no("Nothing to clear");
  Object.assign(t, { road: false, svc: null, bld: null, zone: null, tree: false });
  return { ok: true };
}

// ---------------------------------------------------------------- the city

/** Road tiles you can drive to from the highway. */
export function connected(c: City): Set<number> {
  const seen = new Set<number>();
  const start = idx(ENTRANCE.x, ENTRANCE.y);
  const queue = [start];
  seen.add(start);
  while (queue.length) {
    const i = queue.pop()!;
    const { x, y } = xy(i);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const t = tileAt(c, x + dx, y + dy);
      const j = idx(x + dx, y + dy);
      if (t?.road && !seen.has(j)) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
  return seen;
}

export interface Stats {
  population: number;
  jobsC: number;
  jobsI: number;
  workers: number;
  powerSupply: number;
  powerUse: number;
  waterSupply: number;
  waterUse: number;
  income: number;
  upkeep: number;
  happiness: number;
  buildings: number;
}

const occupantsOf = (t: Tile) =>
  t.bld && !t.bld.abandoned && t.zone ? OCCUPANTS[t.zone][t.density][t.bld.level - 1] : 0;
/** Power and water a building uses. */
const usageOf = (t: Tile) => (t.bld && !t.bld.abandoned ? 1 + occupantsOf(t) / 8 : 0);

/** Coverage per service kind, pollution and the land value of every tile. */
export interface Maps {
  cover: Record<"police" | "fire" | "health" | "school", Uint8Array>;
  pollution: Float32Array;
  value: Float32Array;
  access: Uint8Array;
}

export function maps(c: City): Maps {
  const size = N * N;
  const cover = {
    police: new Uint8Array(size),
    fire: new Uint8Array(size),
    health: new Uint8Array(size),
    school: new Uint8Array(size),
  };
  const pollution = new Float32Array(size);
  const bonus = new Float32Array(size);
  const spread = (x: number, y: number, r: number, fn: (j: number, k: number) => void) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r || !inMap(x + dx, y + dy)) continue;
        fn(idx(x + dx, y + dy), 1 - d / (r + 1));
      }
  };
  c.tiles.forEach((t, i) => {
    const { x, y } = xy(i);
    if (t.svc) {
      const d = SERVICES[t.svc];
      const key =
        t.svc === "police"
          ? "police"
          : t.svc === "fire"
            ? "fire"
            : t.svc === "clinic" || t.svc === "hospital"
              ? "health"
              : t.svc === "school"
                ? "school"
                : null;
      if (key) spread(x, y, d.radius, (j) => (cover[key][j] = 1));
      if (d.pollution) spread(x, y, d.radius, (j, k) => (pollution[j] = Math.min(1, pollution[j] + d.pollution! * k)));
      if (d.value) spread(x, y, d.radius, (j, k) => (bonus[j] += d.value! * k));
    }
    if (t.zone === "I" && t.bld && !t.bld.abandoned)
      spread(x, y, 4, (j, k) => (pollution[j] = Math.min(1, pollution[j] + 0.18 * k * t.bld!.level)));
    if (t.water) spread(x, y, 2, (j, k) => (bonus[j] += 0.06 * k));
    if (t.tree) bonus[i] += 0.02;
  });
  const roads = connected(c);
  const access = new Uint8Array(size);
  for (const r of roads) {
    const { x, y } = xy(r);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (inMap(x + dx, y + dy)) access[idx(x + dx, y + dy)] = 1;
  }
  const value = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const services = (cover.police[i] + cover.fire[i] + cover.health[i] + cover.school[i]) * 0.07;
    value[i] = Math.max(0, Math.min(1, 0.25 + services + Math.min(0.45, bonus[i]) - pollution[i] * 0.55));
  }
  return { cover, pollution, value, access };
}

export function stats(c: City, m: Maps = maps(c)): Stats {
  let population = 0;
  let jobsC = 0;
  let jobsI = 0;
  let use = 0;
  let powerSupply = 0;
  let waterSupply = 0;
  let upkeep = 0;
  let roads = 0;
  let happySum = 0;
  let homes = 0;
  let buildings = 0;
  c.tiles.forEach((t, i) => {
    if (t.road) roads++;
    if (t.svc) {
      const d = SERVICES[t.svc];
      powerSupply += d.power ?? 0;
      waterSupply += d.water ?? 0;
      upkeep += d.upkeep;
    }
    if (!t.bld) return;
    buildings++;
    const n = occupantsOf(t);
    use += usageOf(t);
    if (t.zone === "R") {
      population += n;
      if (n) {
        const svc = (m.cover.police[i] + m.cover.fire[i] + m.cover.health[i] + m.cover.school[i]) / 4;
        happySum += n * (0.35 + svc * 0.35 + m.value[i] * 0.3 - m.pollution[i] * 0.3);
        homes += n;
      }
    } else if (t.zone === "C") jobsC += n;
    else if (t.zone === "I") jobsI += n;
  });
  upkeep += roads * ROAD_UPKEEP;
  const taxMood = ((c.tax.R + c.tax.C + c.tax.I) / 3 - 0.09) * 2.5;
  const happiness = Math.round(Math.max(0, Math.min(100, (homes ? happySum / homes : 0.6) * 100 - taxMood * 100)));
  const income = population * 9 * c.tax.R + jobsC * 11 * c.tax.C + jobsI * 10 * c.tax.I;
  return {
    population,
    jobsC,
    jobsI,
    workers: Math.round(population * 0.55),
    powerSupply,
    powerUse: Math.ceil(use),
    waterSupply,
    waterUse: Math.ceil(use),
    income,
    upkeep,
    happiness,
    buildings,
  };
}

/** Demand for each zone, −1 to 1: homes follow jobs, shops follow people, industry follows shops. */
export function demand(c: City, s: Stats = stats(c)): Record<Zone, number> {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const jobs = s.jobsC + s.jobsI;
  const tax = (z: Zone) => (c.tax[z] - 0.09) * 6;
  return {
    R: clamp(0.55 + (jobs - s.workers) / (s.workers + 60) + (s.happiness - 55) / 150 - tax("R")),
    C: clamp(0.25 + (s.population * 0.16 - s.jobsC) / (s.population * 0.16 + 25) - tax("C")),
    I: clamp(0.35 + (s.population * 0.22 + s.jobsC * 0.4 - s.jobsI) / (s.population * 0.22 + 30) - tax("I")),
  };
}

/** Power and water reach a building when supply covers use; in a shortage, a stable share goes without. */
export function served(c: City, i: number, s: Stats) {
  const p = s.powerUse ? Math.min(1, s.powerSupply / s.powerUse) : s.powerSupply > 0 ? 1 : 0;
  const w = s.waterUse ? Math.min(1, s.waterSupply / s.waterUse) : s.waterSupply > 0 ? 1 : 0;
  const h = ((i * 2654435761) >>> 0) / 4294967296;
  return { power: h < p, water: h < w };
}

export interface DayReport {
  grew: number;
  upgraded: number;
  abandoned: number;
  milestone: string | null;
  money: number;
}

/**
 * A day passes: money comes in and goes out, buildings appear on zoned land
 * that has road access, power and water and where there's demand, level up
 * where land is valuable, and empty out if they go without for too long.
 */
export function simDay(c: City, rng: Rng = createRng(c.seed * 13 + c.day)): DayReport {
  const m = maps(c);
  const s = stats(c, m);
  const d = demand(c, s);
  const rep: DayReport = { grew: 0, upgraded: 0, abandoned: 0, milestone: null, money: 0 };
  // Money.
  const net = s.income - s.upkeep;
  c.money += net;
  rep.money = net;
  // Growth: a handful of zoned tiles each day.
  const zoned: number[] = [];
  c.tiles.forEach((t, i) => t.zone && zoned.push(i));
  const tries = Math.min(zoned.length, 4 + Math.floor(zoned.length / 12));
  for (let k = 0; k < tries; k++) {
    const i = zoned[Math.floor(rng.next() * zoned.length)];
    const t = c.tiles[i];
    const z = t.zone!;
    const sv = served(c, i, s);
    const ok = m.access[i] && sv.power && sv.water;
    if (!t.bld) {
      if (ok && d[z] > 0.05 && rng.next() < 0.35 + d[z] * 0.6) {
        t.bld = { level: 1, style: c.nextStyle++ % 997, age: 0, abandoned: false, short: 0 };
        t.tree = false;
        rep.grew++;
      }
    } else if (
      !t.bld.abandoned &&
      ok &&
      t.bld.level < 3 &&
      t.bld.age > 8 &&
      m.value[i] >= LEVEL_AT[t.bld.level] &&
      d[z] > -0.15 &&
      rng.next() < 0.3
    ) {
      t.bld.level = (t.bld.level + 1) as 2 | 3;
      rep.upgraded++;
    }
  }
  // Every building ages; without power or water for 20 days it empties; given them back, it fills again.
  c.tiles.forEach((t, i) => {
    if (!t.bld) return;
    t.bld.age++;
    const sv = served(c, i, s);
    const without = !sv.power || !sv.water || !m.access[i];
    t.bld.short = without ? t.bld.short + 1 : 0;
    if (!t.bld.abandoned && t.bld.short > 20) {
      t.bld.abandoned = true;
      rep.abandoned++;
    } else if (t.bld.abandoned && !without && d[t.zone ?? "R"] > 0) t.bld.abandoned = false;
  });
  // Milestones (counted after today's growth).
  const pop = stats(c).population;
  while (c.milestone + 1 < MILESTONES.length && pop >= MILESTONES[c.milestone + 1].pop) {
    c.milestone++;
    c.money += MILESTONES[c.milestone].reward;
    rep.milestone = MILESTONES[c.milestone].name;
  }
  if (c.day % 7 === 0) c.history = [...c.history, { day: c.day, pop, money: Math.round(c.money) }].slice(-52);
  c.day++;
  return rep;
}

/** The leaderboard score: the population. */
export const score = (c: City) => stats(c).population;

// --------------------------------------------------------------------- save

export const SAVE_KEY = "zx-zenith-city";

export function loadCity(raw: string | null): City | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as City;
    if (c?.version !== 1 || !Array.isArray(c.tiles) || c.tiles.length !== N * N) return null;
    return c;
  } catch {
    return null;
  }
}

export const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
export const dateOf = (day: number) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = day - 1;
  return `${(d % 30) + 1} ${months[Math.floor(d / 30) % 12]}, Year ${Math.floor(d / 360) + 1}`;
};
