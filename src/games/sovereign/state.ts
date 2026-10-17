/**
 * The simulation's state (plain data, saved as JSON without the map) and a new game: every real
 * nation with its cities, wealth, deposits, government, industry and armed forces.
 */
import {
  BUILDINGS,
  CONSCRIPTION,
  ECONOMY_LAWS,
  IDEOLOGIES,
  ITEM_INFO,
  ITEMS,
  PRODUCERS,
  RESOURCES,
  START_IDEOLOGY,
  START_NUCLEAR,
  UNITS,
  type BuildingId,
  type ConscriptionId,
  type EconomyLawId,
  type IdeologyId,
  type ItemId,
  type ResourceId,
  type UnitKind,
} from "./data";
import { kmBetween, type World } from "./world";

export type Stock = Record<ItemId, number>;

export interface Nation {
  id: number;
  iso: string;
  name: string;
  color: string;
  /** A formable this nation became (its id). */
  formed: string | null;
  alive: boolean;
  capital: number;
  money: number;
  manpower: number;
  stability: number;
  exhaustion: number;
  ideology: IdeologyId;
  /** Changing government: the new one and days left. */
  transition: { to: IdeologyId; days: number } | null;
  tax: number;
  conscription: ConscriptionId;
  economy: EconomyLawId;
  stock: Stock;
  /** Sell what's beyond a reserve, item by item (the player chooses; the AI sells everything). */
  autoSell: ItemId[];
  /** Keep these topped up from the market (a month of what you use). */
  autoBuy: ItemId[];
  missiles: number;
  nukes: number;
  nuclear: boolean;
  /** Days left on the nuclear programme, when one's under way. */
  nuclearDays: number;
  /** Justifications: target nation → days left (0 = ready); expire a year after they're ready. */
  justify: { target: number; days: number; total: number; ready: number }[];
  alliance: number;
  overlord: number;
  /** Pacts: other nation → day it ends. */
  nap: Record<number, number>;
  access: number[];
  trade: number[];
  /** Days until you can improve relations with someone again. */
  cooldown: Record<number, number>;
  /** Temporary stability effects. */
  mods: { text: string; stability: number; gdp: number; days: number }[];
  ai: { aggression: number; next: number; plan: number; warNext: number };
  /** Yesterday's numbers, for the UI. */
  last: { income: number; tax: number; trade: number; upkeep: number; gdp: number; power: number; powerUse: number; consumer: number; produced: Partial<Stock>; used: Partial<Stock> };
  deaths: number;
  /** Share of the oil its forces need that it had yesterday. */
  fuel: number;
}

export interface Construction {
  id: BuildingId | "develop";
  days: number;
  total: number;
}

export interface City {
  id: number;
  owner: number;
  core: number;
  pop: number;
  dev: number;
  /** $M a day at development 3 (the city's size and its nation's wealth). */
  base: number;
  buildings: Partial<Record<BuildingId, number>>;
  build: Construction | null;
  deposits: { res: ResourceId; rich: number }[];
  unrest: number;
  /** War damage: output is down this share until it's repaired (it mends slowly). */
  damage: number;
  capture: { by: number; progress: number } | null;
  queue: { kind: UnitKind; days: number; total: number }[];
  /** Cached: yesterday's GDP. */
  gdp: number;
}

export type Order = { kind: "move"; x: number; y: number } | { kind: "patrol"; x: number; y: number } | { kind: "strike"; x: number; y: number };

export interface Army {
  id: number;
  owner: number;
  kind: UnitKind;
  hp: number;
  x: number;
  y: number;
  /** Waypoints left to walk (map px). */
  path: number[];
  order: Order | null;
  /** Air units: the city they fly from. */
  base: number;
  /** Dug in, 0..1 (grows while standing still). */
  dig: number;
  /** In combat this tick (for the map). */
  fighting: number;
}

export interface War {
  id: number;
  name: string;
  attackers: number[];
  defenders: number[];
  start: number;
  /** Casualties (manpower) each side has taken. */
  lossA: number;
  lossD: number;
}

export interface Alliance {
  id: number;
  name: string;
  leader: number;
  members: number[];
  color: string;
}

export interface News {
  day: number;
  text: string;
  kind: "info" | "war" | "peace" | "good" | "bad" | "world";
  /** Nations it's about (the player sees the ones that touch them first). */
  who: number[];
}

export interface Strike {
  id: number;
  kind: "missile" | "nuke";
  from: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  t: number;
  owner: number;
}

/** Something another nation is asking the player. */
export interface Offer {
  id: number;
  from: number;
  kind: "peace" | "alliance" | "nap" | "trade" | "access";
  warId?: number;
  terms?: "status" | "return" | "subjugate";
  day: number;
}

export interface State {
  version: 1;
  seed: number;
  rng: number;
  day: number;
  player: number;
  difficulty: "easy" | "normal" | "hard";
  nations: Nation[];
  cities: City[];
  armies: Army[];
  wars: War[];
  alliances: Alliance[];
  /** Relations, -100..100, nations × nations (symmetric). */
  rel: number[];
  price: Stock;
  /** Today's market flows, for price moves. */
  flow: Stock;
  news: News[];
  strikes: Strike[];
  offers: Offer[];
  nextId: number;
  over: null | { reason: string; score: number };
  /** Nations that formed something (formable id → nation). */
  formed: Record<string, number>;
}

/* ------------------------------------------------------------------ helpers */

export function rand(s: State) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const pickOne = <T>(s: State, xs: readonly T[]) => xs[Math.floor(rand(s) * xs.length)];
export const nextId = (s: State) => ++s.nextId;
export const emptyStock = (): Stock => Object.fromEntries(ITEMS.map((k) => [k, 0])) as Stock;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function relation(s: State, a: number, b: number) {
  return a === b ? 100 : s.rel[a * s.nations.length + b];
}
export function setRelation(s: State, a: number, b: number, v: number) {
  if (a === b) return;
  const N = s.nations.length;
  s.rel[a * N + b] = s.rel[b * N + a] = clamp(v, -100, 100);
}
export function addRelation(s: State, a: number, b: number, d: number) {
  setRelation(s, a, b, relation(s, a, b) + d);
}

export function say(s: State, text: string, kind: News["kind"], who: number[]) {
  s.news.unshift({ day: s.day, text, kind, who });
  if (s.news.length > 160) s.news.length = 160;
}

export function dateOf(day: number) {
  const d = new Date(Date.UTC(2026, 0, 1) + day * 86400000);
  return d;
}
export function dateText(day: number) {
  return dateOf(day).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const citiesOf = (s: State, n: number) => s.cities.filter((c) => c.owner === n);
export const armiesOf = (s: State, n: number) => s.armies.filter((a) => a.owner === n);

/** Map colours: real ones for the well-known, Natural Earth's scheme (neighbours differ) for the rest. */
const COLORS: Record<string, string> = {
  USA: "#3b6fd8", RUS: "#3f8f4f", CHN: "#d63a32", GBR: "#c2185b", FRA: "#4f7df5", DEU: "#5d5d66", JPN: "#e8837b", IND: "#f29a38", BRA: "#2fae5a", CAN: "#d84d4d", AUS: "#e0a33c",
  ITA: "#4fae6a", ESP: "#e6c12f", TUR: "#c4473f", IRN: "#4e9a6f", SAU: "#3f8f5c", EGY: "#d8b86a", MEX: "#3e9b6b", ARG: "#78b8e8", KOR: "#5a8fd8", PRK: "#9b3434", POL: "#e05561", UKR: "#f2cc3d", PAK: "#3a7d44", IDN: "#c94b4b",
};
const C9 = [
  [205, 60, 54], [32, 70, 54], [48, 72, 52], [118, 42, 48], [168, 44, 44], [200, 56, 52], [262, 40, 58], [300, 36, 54], [14, 58, 58], [86, 40, 50],
];
function hsl(h: number, s: number, l: number) {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}
export function nationColor(iso: string, c9: number, i: number) {
  if (COLORS[iso]) return COLORS[iso];
  const [h, s, l] = C9[(c9 || 1) % C9.length];
  return hsl(h + ((i * 37) % 26) - 13, s + ((i * 13) % 12) - 6, l + ((i * 7) % 12) - 6);
}

/* ------------------------------------------------------------------ the starting world */

/** Active forces, thousands (rough real figures). Others: from population. */
const FORCES: Record<string, number> = {
  USA: 1330, CHN: 2035, IND: 1450, RUS: 1150, PRK: 1280, KOR: 500, PAK: 650, IRN: 610, VNM: 480, EGY: 440, MMR: 400, IDN: 400, BRA: 370, THA: 360, TUR: 355, COL: 290, SAU: 260, MEX: 280, JPN: 250, UKR: 500, FRA: 200, IRQ: 190, ISR: 170, GBR: 150, DEU: 180, ITA: 165, ESP: 120, TWN: 170, MAR: 195, ETH: 160, SYR: 170, BGD: 165, PHL: 145, POL: 150, GRC: 140, NGA: 140, DZA: 140, ERI: 200, AGO: 107, SDN: 105, VEN: 125, MYS: 115, SGP: 70, JOR: 100, CAN: 70, AUS: 60, ARG: 75, PER: 80, CHL: 80, CUB: 50, AZE: 70, ARE: 65, ROU: 70, KAZ: 40, UZB: 50, BLR: 50, AFG: 150,
};
/** Arms industry at the start (levels of arms factories, spread over the biggest cities). */
const ARMS: Record<string, number> = { USA: 9, RUS: 7, CHN: 8, IND: 4, GBR: 4, FRA: 4, KOR: 4, TUR: 4, ISR: 3, DEU: 3, JPN: 3, IRN: 3, PAK: 2, BRA: 2, ITA: 2, EGY: 2, UKR: 3, SAU: 2, AUS: 2, PRK: 3, POL: 2, TWN: 2, SWE: 2, ESP: 1, CAN: 1 };
const NAVY: Record<string, Partial<Record<UnitKind, number>>> = {
  USA: { carrier: 4, battleship: 5, destroyer: 12, submarine: 9 },
  CHN: { carrier: 2, battleship: 3, destroyer: 10, submarine: 7 },
  RUS: { carrier: 1, battleship: 3, destroyer: 6, submarine: 7 },
  GBR: { carrier: 2, battleship: 1, destroyer: 5, submarine: 3 },
  FRA: { carrier: 1, destroyer: 5, submarine: 3 },
  JPN: { destroyer: 9, submarine: 5 },
  IND: { carrier: 1, destroyer: 6, submarine: 4 },
  KOR: { destroyer: 6, submarine: 4 },
  ITA: { carrier: 1, destroyer: 4, submarine: 2 },
  TUR: { destroyer: 4, submarine: 3 },
  DEU: { destroyer: 3, submarine: 2 },
  ESP: { destroyer: 3, submarine: 1 },
  AUS: { destroyer: 3, submarine: 2 },
  BRA: { destroyer: 2, submarine: 2 },
  IRN: { destroyer: 1, submarine: 3 },
  PRK: { submarine: 4 },
  PAK: { destroyer: 2, submarine: 2 },
  EGY: { destroyer: 2, submarine: 1 },
  ISR: { submarine: 2 },
  CAN: { destroyer: 2 },
  SAU: { destroyer: 2 },
  NLD: { destroyer: 2 },
  TWN: { destroyer: 3, submarine: 1 },
  GRC: { destroyer: 3, submarine: 2 },
  IDN: { destroyer: 2, submarine: 1 },
};
const NUCLEAR_POWER = new Set(["FRA", "USA", "RUS", "CHN", "JPN", "KOR", "GBR", "CAN", "UKR", "SWE", "FIN", "ESP", "IND", "CZE", "BEL", "CHE", "SVK", "HUN", "BGR", "ROU", "ARG", "BRA", "ZAF", "PAK", "MEX", "ARE", "IRN", "SVN", "ARM", "BLR"]);

/** Real alliances at the start (under the game's own names). */
const START_ALLIANCES: { name: string; color: string; members: string[] }[] = [
  { name: "Atlantic Alliance", color: "#4f7df5", members: ["USA", "GBR", "FRA", "DEU", "CAN", "ITA", "ESP", "PRT", "NLD", "BEL", "LUX", "NOR", "DNK", "ISL", "POL", "CZE", "SVK", "HUN", "ROU", "BGR", "GRC", "TUR", "EST", "LVA", "LTU", "SVN", "HRV", "ALB", "MNE", "MKD", "FIN", "SWE"] },
  { name: "Collective Security Pact", color: "#3f8f4f", members: ["RUS", "BLR", "ARM", "KAZ", "KGZ", "TJK"] },
];

/** A nation's yearly GDP in game money ($M a day): real GDP, flattened so small nations can still play. */
export function gameGdp(realGdpMillions: number) {
  const b = Math.max(0.3, realGdpMillions / 1000);
  return 2.2 * b ** 0.72;
}
export const devFactor = (dev: number) => 0.55 + 0.15 * dev;

export function newGame(world: World, playerIso: string, opts: { seed?: number; difficulty?: State["difficulty"] } = {}): State {
  const seed = opts.seed ?? 20260101;
  const N = world.nations.length;
  const s: State = {
    version: 1,
    seed,
    rng: seed,
    day: 0,
    player: Math.max(0, world.nations.findIndex((n) => n.iso === playerIso)),
    difficulty: opts.difficulty ?? "normal",
    nations: [],
    cities: [],
    armies: [],
    wars: [],
    alliances: [],
    rel: new Array(N * N).fill(0),
    price: Object.fromEntries(ITEMS.map((k) => [k, ITEM_INFO[k].price])) as Stock,
    flow: emptyStock(),
    news: [],
    strikes: [],
    offers: [],
    nextId: 0,
    over: null,
    formed: {},
  };

  const cityList = new Map<number, number[]>();
  world.cities.forEach((c) => {
    if (!cityList.has(c.nation)) cityList.set(c.nation, []);
    cityList.get(c.nation)!.push(c.id);
  });

  for (const wn of world.nations) {
    const ideology = START_IDEOLOGY[wn.iso] ?? "democracy";
    const mine = cityList.get(wn.id) ?? [];
    const capital = mine.find((i) => world.cities[i].capital) ?? mine[0] ?? 0;
    const aggression = clamp((ideology === "democracy" ? 0.15 : ideology === "authoritarian" ? 0.55 : ideology === "communism" || ideology === "theocracy" ? 0.45 : 0.3) + (rand(s) - 0.5) * 0.3, 0, 1);
    const n: Nation = {
      id: wn.id,
      iso: wn.iso,
      name: wn.name,
      color: nationColor(wn.iso, wn.c9, wn.id),
      formed: null,
      alive: mine.length > 0,
      capital,
      money: 0,
      manpower: 0,
      stability: IDEOLOGIES[ideology].stability,
      exhaustion: 0,
      ideology,
      transition: null,
      tax: 0.22,
      conscription: ideology === "democracy" ? "volunteer" : "limited",
      economy: "civilian",
      stock: emptyStock(),
      autoSell: ["gold", "diamond"],
      autoBuy: ["oil", "uranium", "consumerGoods"],
      missiles: 0,
      nukes: START_NUCLEAR[wn.iso] ?? 0,
      nuclear: wn.iso in START_NUCLEAR,
      nuclearDays: 0,
      justify: [],
      alliance: -1,
      overlord: -1,
      nap: {},
      access: [],
      trade: [],
      cooldown: {},
      mods: [],
      ai: { aggression, next: wn.id % 7, plan: 0, warNext: 120 + Math.floor(rand(s) * 300) },
      last: { income: 0, tax: 0, trade: 0, upkeep: 0, gdp: 0, power: 0, powerUse: 0, consumer: 1, produced: {}, used: {} },
      deaths: 0,
      fuel: 1,
    };
    s.nations.push(n);
  }

  // Cities: wealth from the nation's GDP shared by size; development from GDP per head.
  for (const wc of world.cities) {
    const wn = world.nations[wc.nation];
    const perHead = wn.gdp / Math.max(1, wn.pop / 1000); // $k a head
    const dev = clamp(Math.round(1 + Math.log2(Math.max(0.5, perHead)) * 1.05), 1, 8);
    s.cities.push({ id: wc.id, owner: wc.nation, core: wc.nation, pop: wc.pop, dev, base: 0, buildings: {}, build: null, deposits: [], unrest: 0, damage: 0, capture: null, queue: [], gdp: 0 });
  }
  for (const [nid, ids] of cityList) {
    const wn = world.nations[nid];
    const weights = ids.map((i) => world.cities[i].pop ** 0.6 * (world.cities[i].capital ? 1.6 : 1));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const g = gameGdp(wn.gdp);
    ids.forEach((i, k) => {
      const c = s.cities[i];
      c.base = (g * weights[k]) / total / devFactor(c.dev);
    });
  }

  placeDeposits(s, world, cityList);
  startIndustry(s, world, cityList);

  // Relations: neighbours wary, like governments friendly; alliances close.
  for (let a = 0; a < N; a++)
    for (let b = a + 1; b < N; b++) {
      const na = s.nations[a];
      const nb = s.nations[b];
      let r = (rand(s) - 0.5) * 20;
      if (na.ideology === nb.ideology) r += 14;
      if (world.nations[a].continent === world.nations[b].continent) r += 4;
      setRelation(s, a, b, r);
    }
  for (const c of world.cities) for (const o of c.near) if (world.cities[o].nation !== c.nation) addRelation(s, c.nation, world.cities[o].nation, -0.6);
  for (const al of START_ALLIANCES) {
    const members = al.members.map((iso) => s.nations.findIndex((n) => n.iso === iso && n.alive)).filter((i) => i >= 0);
    if (!members.length) continue;
    const id = nextId(s);
    s.alliances.push({ id, name: al.name, leader: members[0], members, color: al.color });
    for (const m of members) s.nations[m].alliance = id;
    for (const a of members) for (const b of members) if (a < b) addRelation(s, a, b, 45);
  }

  // Money and manpower to start: two months of tax and a full pool.
  for (const n of s.nations) {
    if (!n.alive) continue;
    const gdp = citiesOf(s, n.id).reduce((a, c) => a + c.base * devFactor(c.dev), 0);
    n.money = Math.round(gdp * n.tax * 60);
    n.manpower = manpowerMax(s, n.id) * 0.8;
    for (const r of RESOURCES) n.stock[r] = 20;
    n.stock.steel = 40;
    n.stock.electronics = 15;
    n.stock.motorParts = 15;
    n.stock.consumerGoods = 30;
  }
  startForces(s, world, cityList);
  say(s, `1 January 2026. You lead ${s.nations[s.player].name}.`, "info", [s.player]);
  return s;
}

function placeDeposits(s: State, world: World, cityList: Map<number, number[]>) {
  const isoIdx = new Map(world.nations.map((n) => [n.iso, n.id]));
  for (const r of RESOURCES) {
    for (const [iso, w] of PRODUCERS[r]) {
      const nid = isoIdx.get(iso);
      if (nid === undefined) continue;
      const ids = cityList.get(nid) ?? [];
      if (!ids.length) continue;
      const count = Math.max(1, Math.min(ids.length, Math.round(w / 2.5 + rand(s))));
      for (let k = 0; k < count; k++) {
        // Big territories more likely (the land is where the rock is).
        const pool = ids.filter((i) => !s.cities[i].deposits.some((d) => d.res === r));
        if (!pool.length) break;
        const totalA = pool.reduce((a, i) => a + Math.sqrt(world.cities[i].area), 0);
        let t = rand(s) * totalA;
        let pick = pool[0];
        for (const i of pool)
          if ((t -= Math.sqrt(world.cities[i].area)) <= 0) {
            pick = i;
            t = Infinity;
          }
        const c = s.cities[pick];
        if (c.deposits.length >= 3) continue;
        c.deposits.push({ res: r, rich: clamp(Math.round(1 + w / 4 + rand(s)), 1, 4) });
      }
    }
  }
  // A little of something common almost everywhere; every nation gets at least one.
  const common: ResourceId[] = ["iron", "copper", "oil", "phosphate", "aluminium"];
  for (const c of s.cities) if (!c.deposits.length && rand(s) < 0.16) c.deposits.push({ res: pickOne(s, common), rich: 1 });
  for (const [, ids] of cityList) if (!ids.some((i) => s.cities[i].deposits.length)) s.cities[ids[0]].deposits.push({ res: pickOne(s, common), rich: 1 });
}

function startIndustry(s: State, world: World, cityList: Map<number, number[]>) {
  for (const [nid, ids] of cityList) {
    const n = s.nations[nid];
    const sorted = ids.slice().sort((a, b) => world.cities[b].pop - world.cities[a].pop);
    const capital = s.cities[n.capital];
    const rich = capital.dev;
    let powerNeed = 0;
    const add = (c: City, b: BuildingId, lv: number) => {
      const was = c.buildings[b] ?? 0;
      const now = Math.min(BUILDINGS[b].max, Math.max(was, lv));
      c.buildings[b] = now;
      powerNeed += Math.max(0, BUILDINGS[b].power) * (now - was);
    };
    for (const i of ids) {
      const c = s.cities[i];
      if (c.deposits.length) add(c, "mine", c.deposits.some((d) => d.rich >= 3) ? 2 : 1);
    }
    sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.4))).forEach((i, k) => add(s.cities[i], "civilian", clamp(Math.round(rich / 3) - (k > 2 ? 1 : 0), 1, 3)));
    const hasIron = ids.some((i) => s.cities[i].deposits.some((d) => d.res === "iron"));
    if (rich >= 5 || hasIron) add(s.cities[sorted[Math.min(1, sorted.length - 1)]], "steel", rich >= 6 ? 2 : 1);
    if (rich >= 6) add(capital, "electronics", rich >= 7 ? 2 : 1);
    if (rich >= 6) add(s.cities[sorted[Math.min(2, sorted.length - 1)]], "motor", 1);
    let arms = ARMS[n.iso] ?? (world.nations[nid].gdp > 300000 ? 1 : 0);
    for (let k = 0; arms > 0; k++) {
      const c = s.cities[sorted[k % sorted.length]];
      add(c, "arms", (c.buildings.arms ?? 0) + 1);
      arms--;
      if (k > 20) break;
    }
    add(capital, "airport", rich >= 5 ? 2 : 1);
    if (sorted[1] !== undefined && rich >= 5) add(s.cities[sorted[1]], "airport", 1);
    const coastal = sorted.filter((i) => world.cities[i].coastal);
    coastal.slice(0, Math.max(1, Math.round(coastal.length * 0.3))).forEach((i) => add(s.cities[i], "port", rich >= 5 ? 2 : 1));
    if (NAVY[n.iso] && coastal.length) add(s.cities[coastal[0]], "shipyard", Math.min(3, Math.ceil(Object.values(NAVY[n.iso]).reduce((a, b) => a + (b ?? 0), 0) / 8)));
    if (n.nuclear) add(capital, "silo", 1);
    // Power for all of it (and a margin), as the country really makes it.
    const cap = s.cities[sorted[0]];
    let need = powerNeed * 1.15;
    if (NUCLEAR_POWER.has(n.iso) && need > 20) {
      const lv = Math.min(3, Math.ceil((need * 0.5) / 45));
      add(cap, "nuclearPower", lv);
      need -= lv * 45;
    }
    if (need > 0 && rich >= 6) {
      const lv = Math.min(5, Math.ceil((need * 0.4) / 6));
      add(s.cities[sorted[Math.min(1, sorted.length - 1)]], "renewable", lv);
      need -= lv * 6;
    }
    for (let k = 0; need > 0 && k < sorted.length * 5; k++) {
      const c = s.cities[sorted[k % sorted.length]];
      if ((c.buildings.oilPower ?? 0) >= 5) continue;
      c.buildings.oilPower = (c.buildings.oilPower ?? 0) + 1;
      need -= 12;
    }
  }
}

function startForces(s: State, world: World, cityList: Map<number, number[]>) {
  for (const [nid, ids] of cityList) {
    const n = s.nations[nid];
    const wn = world.nations[nid];
    const k = FORCES[n.iso] ?? Math.max(1, wn.pop * 0.0015 / 1000);
    const arms = Object.values(ids).reduce((a, i) => a + (s.cities[i].buildings.arms ?? 0), 0);
    const units: Partial<Record<UnitKind, number>> = {
      infantry: Math.max(1, Math.round(Math.sqrt(k) * 1.1)),
      tank: arms >= 2 ? Math.round(arms * 2.2) : arms,
      artillery: arms >= 2 ? Math.round(arms * 1.4) : 0,
      antiair: arms >= 1 ? Math.max(1, Math.round(arms * 0.8)) : 0,
      fighter: arms >= 2 ? Math.round(arms * 1.1) : arms,
      bomber: arms >= 4 ? Math.round(arms * 0.5) : 0,
      ...NAVY[n.iso],
    };
    // Land forces: the capital and the cities on the border.
    const capital = n.capital;
    const border = ids.filter((i) => world.cities[i].near.some((o) => world.cities[o].nation !== nid));
    const spots = [capital, ...border.filter((i) => i !== capital).slice(0, 8)];
    const coastal = ids.filter((i) => world.cities[i].coastal && (s.cities[i].buildings.port ?? 0) > 0);
    const airbases = ids.filter((i) => (s.cities[i].buildings.airport ?? 0) > 0);
    for (const kind of Object.keys(units) as UnitKind[]) {
      let count = units[kind] ?? 0;
      const def = UNITS[kind];
      if (!count) continue;
      if (def.domain === "land") {
        for (let j = 0; count > 0; j++) {
          const c = world.cities[spots[j % spots.length]];
          const take = Math.min(count, kind === "infantry" ? Math.max(1, Math.ceil((units.infantry ?? 1) / spots.length)) : Math.max(1, Math.ceil(count / 3)));
          spawn(s, nid, kind, take, c.x + (rand(s) - 0.5) * 3, c.y + (rand(s) - 0.5) * 3, -1);
          count -= take;
        }
      } else if (def.domain === "sea") {
        if (!coastal.length) continue;
        const c = world.cities[coastal[0]];
        const p = seaSpotNear(world, c.x, c.y);
        if (p) spawn(s, nid, kind, count, p[0], p[1], -1);
      } else if (def.domain === "air") {
        if (!airbases.length) continue;
        const b = airbases[0];
        spawn(s, nid, kind, count, world.cities[b].x, world.cities[b].y, b);
      }
    }
  }
}

/** Make (or reinforce) a stack of `count` units. */
export function spawn(s: State, owner: number, kind: UnitKind, count: number, x: number, y: number, base: number) {
  const hp = UNITS[kind].hp * count;
  // Join an idle stack of the same kind right here.
  const here = s.armies.find((a) => a.owner === owner && a.kind === kind && !a.order && Math.hypot(a.x - x, a.y - y) < 2.5 && a.hp < UNITS[kind].hp * 30);
  if (here) {
    here.hp += hp;
    return here;
  }
  const a: Army = { id: nextId(s), owner, kind, hp, x, y, path: [], order: null, base, dig: 0, fighting: 0 };
  s.armies.push(a);
  return a;
}

/** The nearest open sea to a coastal point (for launching ships). */
export function seaSpotNear(world: World, x: number, y: number): [number, number] | null {
  const g = world.grid;
  const gx = Math.floor(x / g.cell);
  const gy = Math.floor(y / g.cell);
  for (let r = 1; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = gx + dx;
        const yy = gy + dy;
        if (xx < 0 || yy < 0 || xx >= g.w || yy >= g.h) continue;
        if (g.data[yy * g.w + xx] === 0) return [(xx + 0.5) * g.cell, (yy + 0.5) * g.cell];
      }
  return null;
}

export function manpowerMax(s: State, n: number) {
  const nat = s.nations[n];
  const pop = citiesOf(s, n).reduce((a, c) => a + (c.core === n ? c.pop : c.pop * 0.3), 0);
  return pop * CONSCRIPTION[nat.conscription].share * IDEOLOGIES[nat.ideology].manpower;
}

export const unitCount = (a: Army) => Math.max(0, a.hp / UNITS[a.kind].hp);
export const shownCount = (a: Army) => Math.max(1, Math.ceil(unitCount(a) - 0.05));

/** Total military strength (rough) for AI judgements. */
export function power(s: State, n: number) {
  let p = 0;
  for (const a of s.armies) if (a.owner === n) p += unitCount(a) * (UNITS[a.kind].atk.land + UNITS[a.kind].atk.sea * 0.5 + UNITS[a.kind].atk.air * 0.3);
  return p;
}

export const distKm = kmBetween;
export const economyLaw = (n: Nation) => ECONOMY_LAWS[n.economy];
