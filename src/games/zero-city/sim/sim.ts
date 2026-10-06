/**
 * The city simulation. Pure (no DOM, no three.js): it runs in a Web Worker at
 * TICK_HZ and in tests. The main thread owns the editable world (roads, lots,
 * civic buildings) and sends it here whenever it changes; this owns what
 * grows on it (buildings, residents, jobs, demand) and everything that moves.
 */
import { GAME_MINUTES_PER_SECOND } from "../config";
import { cumulative, sampleAt, segX } from "../core/geom";
import { hash, rng } from "../core/rng";
import { buildingSpec, tierCap, type Style } from "../world/buildingSpec";
import { laneOffset } from "../world/roads";

export type Zone = "R" | "C" | "I" | "M";

export interface SimNode {
  id: number;
  x: number;
  z: number;
  gate?: boolean;
}
export interface SimEdge {
  id: number;
  a: number;
  b: number;
  lanesF: number;
  lanesB: number;
  speed: number;
  cls: number;
  pts: number[];
  /** Half the carriageway, the sidewalk width and the median, metres. */
  half: number;
  sidewalk: number;
  median: number;
  name: string;
}
export interface SimLot {
  id: number;
  edge: number;
  side: number;
  s: number;
  w: number;
  d: number;
  cx: number;
  cz: number;
  zone: Zone;
  /** Within a stone's throw of water (worth more). */
  wet: boolean;
}
export interface SimService {
  id: number;
  kind: string;
  cx: number;
  cz: number;
}
export interface SimStop {
  id: number;
  edge: number;
  s: number;
  side: number;
}
export interface SimLine {
  id: number;
  stops: number[];
}
export interface SimWorld {
  nodes: SimNode[];
  edges: SimEdge[];
  lots: SimLot[];
  services: SimService[];
  stops: SimStop[];
  lines: SimLine[];
  /** Map resources 0–2: water, wood, farmland, oil. */
  res: number[];
}
/** What city policy (Mayor mode) does to growth: demand nudges, a height limit, fewer cars. */
export interface SimPolicy {
  bias: { R: number; C: number; I: number; M: number };
  maxTier: number;
  carShare: number;
  /** Multipliers from laws (and ministers): road wear, fire risk, tourism. */
  wearMul?: number;
  fireMul?: number;
  tourismMul?: number;
}
export const NO_POLICY: SimPolicy = { bias: { R: 0, C: 0, I: 0, M: 0 }, maxTier: 9, carShare: 1 };

export interface SimSettings {
  traffic: boolean;
  peds: boolean;
  trafficDensity: number;
  pedDensity: number;
  policy?: SimPolicy;
  /** Building fires (on unless switched off in Settings). */
  fires?: boolean;
}

export interface Building {
  lot: number;
  zone: Zone;
  tier: number;
  seed: number;
  /** 0–1 while it's going up; 1 when done. */
  progress: number;
  residents: number;
  capRes: number;
  capJobs: number;
  workers: number;
  age: number;
  style: Style;
}

export interface SimSave {
  minutes: number;
  seed: number;
  buildings: Building[];
  /** Road condition: edge id, condition 0–1, game minutes of roadworks left. */
  roads?: [number, number, number][];
}

/** A road's state: condition (1 = new, 0 = falling apart) and roadworks under way. */
export interface RoadState {
  c: number;
  /** Game minutes of work left (0 = no works). */
  works: number;
  /** Ordered by the player (a contractor if no depot covers it). */
  ordered?: boolean;
}

export interface Stats {
  population: number;
  jobs: number;
  workers: number;
  unemployed: number;
  demand: { R: number; C: number; I: number; M: number };
  buildings: number;
  cars: number;
  peds: number;
  congestion: number;
  power: boolean;
  water: boolean;
  staff: number;
  /** Share of residents within reach of each civic service, 0–1. */
  coverage: { police: number; fire: number; clinic: number; school: number; park: number };
  /** Share of residents living next to industry, 0–1. */
  pollution: number;
  /** Jobs by kind. */
  cJobs: number;
  iJobs: number;
  /** Visitors a day, drawn by landmarks and parks. */
  tourists: number;
  /** Buildings on fire right now. */
  fires: number;
  /** Roads: average condition (by length, 0–1), roads under works, roads in poor shape. */
  roadCondition: number;
  roadworks: number;
  poorRoads: number;
}

export interface Notice {
  key: string;
  vars?: Record<string, string | number>;
}

export const VEHICLES = ["sedan", "van", "pickup", "bus", "truck"] as const;
const VEH_LEN = [4.6, 5.2, 5.4, 11.5, 8.5];

type Leg = { edge: number; dir: 1 | -1 };

interface Car {
  id: number;
  type: number;
  color: number;
  route: Leg[];
  ri: number;
  /** Distance along the current edge in the direction of travel. */
  d: number;
  lane: number;
  v: number;
  v0: number;
  len: number;
  crossing: null | { node: number; ax: number; az: number; cx: number; cz: number; bx: number; bz: number; len: number; t: number };
  stopAt: number;
  wait: number;
  stopped: number;
  kind: "home" | "work" | "deliver" | "visit" | "bus";
  bus?: { line: number; next: number; dwell: number };
  x: number;
  z: number;
  ang: number;
}

interface Ped {
  id: number;
  edge: number;
  dir: 1 | -1;
  d: number;
  side: number;
  v: number;
  legs: number;
  color: number;
  crossing: null | { node: number; ax: number; az: number; bx: number; bz: number; len: number; t: number };
  waiting: number;
  x: number;
  z: number;
  ang: number;
}

interface EdgeInfo {
  e: SimEdge;
  cum: Float64Array;
  L: number;
  /** Stop-line setback at a and at b. */
  setA: number;
  setB: number;
  count: [number, number];
  slow: [number, number];
}

interface NodeInfo {
  n: SimNode;
  edges: number[];
  /** Max road class meeting here. */
  major: number;
  /** Active crossing segments. */
  active: { car: number; ax: number; az: number; bx: number; bz: number }[];
  pedUntil: number;
  carPhaseUntil: number;
  controlled: boolean;
}

const SERVICE_STAFF: Record<string, number> = { police: 12, fire: 10, clinic: 14, school: 20, power: 15, water: 6, park: 2, depot: 14, marina: 25, lighthouse: 3, casino: 70, resort: 60, hospital: 60, museum: 20, university: 80, stadium: 40, tower: 30 };
/** Road wear: per car per game minute on a road (trucks wear it four times as fast), and by age alone per game day. */
const WEAR_PER_CAR = 0.000003;
const WEAR_AGE = 0.015;
/** Roads below this get a crew sent from a depot in reach; how far a depot reaches; crews per depot. */
const WORKS_BELOW = 0.45;
const DEPOT_REACH = 650;
const CREWS_PER_DEPOT = 2;
/** How fast traffic may go on a road in this state (fraction of the limit). */
export function roadSpeedFactor(r: RoadState | undefined) {
  if (!r) return 1;
  if (r.works > 0) return 0.45;
  return r.c >= 0.5 ? 1 : 0.7 + 0.6 * r.c;
}
const SERVICE_RADIUS: Record<string, number> = { police: 340, fire: 360, clinic: 320, school: 420, park: 200, marina: 600, lighthouse: 500, casino: 550, resort: 600, hospital: 700, museum: 500, university: 800, stadium: 450, tower: 700 };
/** Landmarks that also count as an everyday service's coverage. */
const COVER_AS: Record<string, string> = { hospital: "clinic", university: "school" };
/** Land value each service adds within its radius. */
const VALUE_ADD: Record<string, number> = { park: 0.12, marina: 0.14, lighthouse: 0.1, casino: 0.06, resort: 0.12, hospital: 0.1, museum: 0.16, university: 0.12, stadium: 0.08, tower: 0.2 };
/** Visitors a day each draws. */
const TOURISM: Record<string, number> = { park: 12, marina: 380, lighthouse: 140, casino: 600, resort: 520, museum: 260, university: 70, stadium: 520, tower: 420 };
/** Fire: chance per building per game hour; minutes until firefighters put it out (covered) or it burns down. */
const FIRE_RATE = 0.0003;
const FIRE_OUT = 30;
const FIRE_DOWN = 100;
const COVER_KINDS = ["police", "fire", "clinic", "school", "park"] as const;
const COVER_BIT: Record<string, number> = { police: 1, fire: 2, clinic: 4, school: 8, park: 16 };
const POLLUTED = 32;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class Sim {
  minutes = 8 * 60;
  seed = 1;
  buildings = new Map<number, Building>();
  stats: Stats = emptyStats();
  notices: Notice[] = [];
  settings: SimSettings = { traffic: true, peds: true, trafficDensity: 100, pedDensity: 100 };

  private world: SimWorld = { nodes: [], edges: [], lots: [], services: [], stops: [], lines: [], res: [0, 0, 0, 0] };
  private edges = new Map<number, EdgeInfo>();
  private nodes = new Map<number, NodeInfo>();
  private lots = new Map<number, SimLot>();
  private adj = new Map<number, { to: number; edge: number; dir: 1 | -1 }[]>();
  private connected = new Set<number>();
  private lv = new Map<number, number>();
  private cars: Car[] = [];
  private peds: Ped[] = [];
  private nextAgent = 1;
  private t = 0;
  private growAcc = 0;
  private roadAcc = 0;
  /** Road states are sent to the main thread when this is set (about once a second). */
  private roadsOut = true;
  private lvAcc = 0;
  private spawnAcc = 0;
  private noticeAcc = 0;
  private congestion = new Map<number, number>();
  private rand = rng(1);
  /** Burning buildings: lot → minutes alight, and whether a fire station covers it. */
  fires = new Map<number, { t: number; covered: boolean }>();
  /** One-off messages for the player (drained with each tick). */
  events: Notice[] = [];
  /** Every road's condition and roadworks. */
  roads = new Map<number, RoadState>();
  /** Lots whose building changed since the last drain. */
  private changed = new Set<number>();
  private removedLots = new Set<number>();
  private svcGrid = new Map<string, SimService[]>();
  /** Services whose reach is longer than the grid search (the landmarks). */
  private farServices: SimService[] = [];
  /** Lot id → which services reach it (COVER_BIT) and whether industry is next door. */
  private cover = new Map<number, number>();
  private indGrid = new Map<string, number>();

  load(save: SimSave | null) {
    if (!save) return;
    this.minutes = save.minutes;
    this.seed = save.seed;
    this.rand = rng(save.seed + Math.floor(save.minutes));
    this.buildings.clear();
    for (const b of save.buildings) this.buildings.set(b.lot, { ...b });
    this.roads.clear();
    for (const [id, c, works] of save.roads ?? []) this.roads.set(id, { c, works });
    for (const id of this.buildings.keys()) this.changed.add(id);
  }

  save(): SimSave {
    return {
      minutes: this.minutes,
      seed: this.seed,
      buildings: [...this.buildings.values()].map((b) => ({ ...b })),
      roads: [...this.roads].map(([id, r]) => [id, Math.round(r.c * 1000) / 1000, Math.round(r.works)] as [number, number, number]),
    };
  }

  setWorld(w: SimWorld) {
    this.world = w;
    this.edges.clear();
    this.nodes.clear();
    for (const n of w.nodes) this.nodes.set(n.id, { n, edges: [], major: 0, active: [], pedUntil: 0, carPhaseUntil: 0, controlled: false });
    for (const e of w.edges) {
      const cum = cumulative(e.pts);
      this.edges.set(e.id, { e, cum, L: cum[cum.length - 1], setA: 0, setB: 0, count: [0, 0], slow: [0, 0] });
      this.nodes.get(e.a)?.edges.push(e.id);
      this.nodes.get(e.b)?.edges.push(e.id);
    }
    for (const ni of this.nodes.values()) {
      const es = ni.edges.map((id) => this.edges.get(id)!.e);
      ni.major = Math.max(0, ...es.map((e) => e.cls));
      ni.controlled = es.length >= 3;
      const set = es.length >= 2 ? Math.max(...es.map((e) => e.half + e.sidewalk * 0.5)) + 0.8 : 0;
      for (const id of ni.edges) {
        const info = this.edges.get(id)!;
        const s = Math.min(set, info.L * 0.3);
        if (info.e.a === ni.n.id) info.setA = s;
        if (info.e.b === ni.n.id) info.setB = s;
      }
    }
    this.adj.clear();
    for (const { e } of this.edges.values()) {
      if (e.lanesF > 0) (this.adj.get(e.a) ?? this.adj.set(e.a, []).get(e.a)!).push({ to: e.b, edge: e.id, dir: 1 });
      if (e.lanesB > 0) (this.adj.get(e.b) ?? this.adj.set(e.b, []).get(e.b)!).push({ to: e.a, edge: e.id, dir: -1 });
    }
    // Reachable both ways from the gate (undirected is enough to call a lot "connected").
    this.connected.clear();
    const und = new Map<number, number[]>();
    for (const { e } of this.edges.values()) {
      (und.get(e.a) ?? und.set(e.a, []).get(e.a)!).push(e.b);
      (und.get(e.b) ?? und.set(e.b, []).get(e.b)!).push(e.a);
    }
    const stack = w.nodes.filter((n) => n.gate).map((n) => n.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (this.connected.has(id)) continue;
      this.connected.add(id);
      for (const nb of und.get(id) ?? []) stack.push(nb);
    }
    // Roads: new ones start as new, gone ones are forgotten.
    for (const id of [...this.roads.keys()]) if (!this.edges.has(id)) this.roads.delete(id);
    for (const id of this.edges.keys()) if (!this.roads.has(id)) this.roads.set(id, { c: 1, works: 0 });
    this.lots.clear();
    for (const l of w.lots) this.lots.set(l.id, l);
    // Buildings on lots that are gone or rezoned go too.
    for (const [lot, b] of this.buildings) {
      const l = this.lots.get(lot);
      if (!l || l.zone !== b.zone) {
        this.buildings.delete(lot);
        this.removedLots.add(lot);
      } else if (b.tier > tierCap(l.zone, l.w, l.d)) {
        b.tier = tierCap(l.zone, l.w, l.d);
        this.refreshCapacity(b, l);
        this.changed.add(lot);
      }
    }
    // Agents on roads that no longer exist vanish.
    this.cars = this.cars.filter((c) => c.route.every((leg) => this.edges.has(leg.edge)) && (!c.crossing || this.nodes.has(c.crossing.node)));
    this.peds = this.peds.filter((p) => this.edges.has(p.edge));
    this.svcGrid.clear();
    this.farServices = w.services.filter((s) => (SERVICE_RADIUS[s.kind] ?? 0) > 384);
    for (const [lot] of this.fires) if (!this.buildings.has(lot)) this.fires.delete(lot);
    for (const s of w.services) {
      const k = `${Math.floor(s.cx / 128)},${Math.floor(s.cz / 128)}`;
      (this.svcGrid.get(k) ?? this.svcGrid.set(k, []).get(k)!).push(s);
    }
    this.lvAcc = 999;
  }

  /** Lot id → land value 0–1 (for the Land overlay). */
  landValues() {
    return this.lv;
  }

  /** Lot id → services reaching it (bits: police 1, fire 2, clinic 4, school 8, park 16) and 32 for pollution. */
  coverage() {
    return this.cover;
  }

  /** Buildings changed and lots cleared since the last call. */
  drainChanges() {
    const changed = [...this.changed].map((id) => this.buildings.get(id)).filter((b): b is Building => !!b);
    const removed = [...this.removedLots];
    this.changed.clear();
    this.removedLots.clear();
    return { changed, removed };
  }

  // ------------------------------------------------------------------ step

  /** Advance by dt real seconds at the given speed (0 = paused). */
  step(dt: number, speed: number) {
    if (speed <= 0) return;
    const steps = Math.ceil(speed);
    const sub = (dt * speed) / steps;
    for (let i = 0; i < steps; i++) this.substep(sub);
  }

  private substep(dt: number) {
    this.t += dt;
    this.minutes += dt * GAME_MINUTES_PER_SECOND;
    this.growAcc += dt;
    this.lvAcc += dt;
    this.spawnAcc += dt;
    this.noticeAcc += dt;
    if (this.lvAcc > 3) {
      this.lvAcc = 0;
      this.updateLandValue();
    }
    this.construct(dt);
    if (this.growAcc > 0.8) {
      this.grow(this.growAcc);
      this.growAcc = 0;
    }
    if (this.spawnAcc > 0.25) {
      this.spawnAcc = 0;
      this.spawnAgents();
    }
    this.moveCars(dt);
    this.roadAcc += dt;
    if (this.roadAcc > 1) {
      this.roadwork(this.roadAcc);
      this.roadAcc = 0;
    }
    this.movePeds(dt);
    if (this.noticeAcc > 2) {
      this.noticeAcc = 0;
      this.updateStats();
      this.updateNotices();
    }
  }

  // --------------------------------------------------------------- growth

  private hasService(kind: string) {
    return this.world.services.some((s) => s.kind === kind);
  }

  private demand() {
    return this.stats.demand;
  }

  private refreshCapacity(b: Building, l: SimLot) {
    const bonus = l.zone === "I" ? Math.max(this.world.res[1], this.world.res[2], this.world.res[3]) : 0;
    const spec = buildingSpec(l.zone, b.tier, l.w, l.d, b.seed, bonus);
    b.capRes = spec.residents;
    b.capJobs = spec.jobs;
    b.style = spec.style;
    b.residents = Math.min(b.residents, b.capRes);
    b.workers = Math.min(b.workers, b.capJobs);
  }

  private construct(dt: number) {
    for (const b of this.buildings.values()) {
      b.age += dt * GAME_MINUTES_PER_SECOND;
      if (b.progress < 1) {
        b.progress = Math.min(1, b.progress + dt / 6);
        this.changed.add(b.lot);
      }
    }
  }

  /** Fires start, spread no further than their building, and are put out or burn it down. */
  private burn(dt: number) {
    const minutes = dt * GAME_MINUTES_PER_SECOND;
    for (const [lot, f] of this.fires) {
      const b = this.buildings.get(lot);
      if (!b) {
        this.fires.delete(lot);
        continue;
      }
      f.t += minutes;
      // A fire station in reach sends a crew.
      f.covered = ((this.cover.get(lot) ?? 0) & COVER_BIT.fire) !== 0;
      if (f.covered && f.t >= FIRE_OUT) {
        this.fires.delete(lot);
        this.events.push({ key: "ev.fireOut", vars: { road: this.roadOf(lot) } });
      } else if (!f.covered && f.t >= FIRE_DOWN) {
        this.fires.delete(lot);
        this.buildings.delete(lot);
        this.removedLots.add(lot);
        this.events.push({ key: "ev.burnt", vars: { road: this.roadOf(lot) } });
      }
    }
    if (this.settings.fires === false) return;
    const hours = minutes / 60;
    for (const b of this.buildings.values()) {
      if (b.progress < 1 || this.fires.has(b.lot)) continue;
      const covered = ((this.cover.get(b.lot) ?? 0) & COVER_BIT.fire) !== 0;
      if (this.rand.next() > FIRE_RATE * hours * (1 + b.tier * 0.3) * (covered ? 0.35 : 1) * (this.settings.policy?.fireMul ?? 1)) continue;
      this.fires.set(b.lot, { t: 0, covered });
      this.events.push({ key: covered ? "ev.fire" : "ev.fireNoStation", vars: { road: this.roadOf(b.lot) } });
    }
  }

  /**
   * Roads wear with traffic (trucks most) and age. A depot sends a crew to the worst road
   * in its reach once it's worn; roadworks close a lane and slow traffic until it's done.
   */
  private roadwork(dt: number) {
    const minutes = dt * GAME_MINUTES_PER_SECOND;
    const mul = this.settings.policy?.wearMul ?? 1;
    const traffic = new Map<number, number>();
    for (const c of this.cars) {
      if (c.crossing) continue;
      const e = c.route[c.ri]?.edge;
      if (e !== undefined) traffic.set(e, (traffic.get(e) ?? 0) + (c.type === 4 ? 4 : 1));
    }
    for (const [id, r] of this.roads) {
      const info = this.edges.get(id);
      if (!info) continue;
      if (r.works > 0) {
        r.works -= minutes;
        if (r.works <= 0) {
          r.works = 0;
          r.c = 1;
          if (r.ordered) this.events.push({ key: "ev.roadDone", vars: { road: info.e.name } });
          r.ordered = false;
        }
        continue;
      }
      // Wear spreads over the road's length and lanes: a short busy street wears fastest.
      const per = (traffic.get(id) ?? 0) / Math.max(1, (info.L / 60) * Math.max(1, info.e.lanesF + info.e.lanesB) * 0.5);
      r.c = Math.max(0, r.c - (per * WEAR_PER_CAR * 60 * minutes + (WEAR_AGE * minutes) / 1440) * mul);
    }
    // Depots send crews to the worst roads they reach.
    for (const d of this.world.services) {
      if (d.kind !== "depot") continue;
      const near: [number, RoadState, EdgeInfo][] = [];
      let busy = 0;
      for (const [id, r] of this.roads) {
        const info = this.edges.get(id);
        if (!info) continue;
        const m = info.e.pts.length >> 2 << 1;
        if (Math.hypot(info.e.pts[m] - d.cx, info.e.pts[m + 1] - d.cz) > DEPOT_REACH) continue;
        if (r.works > 0 && !r.ordered) busy++;
        else if (r.works <= 0 && r.c < WORKS_BELOW) near.push([id, r, info]);
      }
      near.sort((a, b) => a[1].c - b[1].c);
      for (const [, r, info] of near.slice(0, Math.max(0, CREWS_PER_DEPOT - busy))) r.works = worksMinutes(info.L);
    }
    this.roadsOut = true;
  }

  /** Order roadworks on these roads now (the Repair tool). Returns the ones started. */
  repair(ids: number[]) {
    const out: number[] = [];
    for (const id of ids) {
      const r = this.roads.get(id);
      const info = this.edges.get(id);
      if (!r || !info || r.works > 0 || r.c > 0.97) continue;
      r.works = worksMinutes(info.L);
      r.ordered = true;
      out.push(id);
    }
    this.roadsOut = true;
    return out;
  }

  /** Age every road (not under works) to this condition (tests and the debug hook). */
  wear(c: number) {
    for (const r of this.roads.values()) if (r.works <= 0) r.c = Math.min(r.c, c);
    this.roadsOut = true;
  }

  /** Road states for the renderer, about once a second (null in between). */
  takeRoads() {
    if (!this.roadsOut) return null;
    this.roadsOut = false;
    return [...this.roads].map(([id, r]) => [id, r.c, r.works] as [number, number, number]);
  }

  /** Start a fire now (tests and the debug hook). */
  ignite(lot: number) {
    if (!this.buildings.has(lot) || this.fires.has(lot)) return false;
    const covered = ((this.cover.get(lot) ?? 0) & COVER_BIT.fire) !== 0;
    this.fires.set(lot, { t: 0, covered });
    this.events.push({ key: covered ? "ev.fire" : "ev.fireNoStation", vars: { road: this.roadOf(lot) } });
    return true;
  }

  private roadOf(lot: number) {
    const l = this.lots.get(lot);
    return (l && this.edges.get(l.edge)?.e.name) || "";
  }

  /** Burning buildings for the renderer: [lot, minutes alight, covered 0/1]. */
  fireList() {
    return [...this.fires].map(([lot, f]) => [lot, f.t, f.covered ? 1 : 0] as [number, number, number]);
  }

  /** Messages since the last call. */
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  private grow(dt: number) {
    this.burn(dt);
    const dem = this.demand();
    const lotsBy: Record<Zone, SimLot[]> = { R: [], C: [], I: [], M: [] };
    for (const l of this.lots.values()) {
      if (this.buildings.has(l.id)) continue;
      const info = this.edges.get(l.edge);
      if (!info || !this.connected.has(info.e.a)) continue;
      lotsBy[l.zone].push(l);
    }
    const power = this.hasService("power");
    const water = this.hasService("water");
    const maxTier = this.settings.policy?.maxTier ?? 9;
    for (const z of ["R", "C", "I", "M"] as Zone[]) {
      const d = dem[z];
      if (d <= 0.02 || lotsBy[z].length === 0) continue;
      // Up to a few new buildings per zone per beat, more when demand is high.
      const n = Math.min(lotsBy[z].length, Math.ceil(d * 2.6 * dt + this.rand.next() * d));
      for (let k = 0; k < n; k++) {
        const i = Math.floor(this.rand.next() * lotsBy[z].length);
        const l = lotsBy[z].splice(i, 1)[0];
        const b: Building = { lot: l.id, zone: z, tier: 1, seed: Math.floor(this.rand.next() * 1e9), progress: 0, residents: 0, capRes: 0, capJobs: 0, workers: 0, age: 0, style: "house" };
        this.refreshCapacity(b, l);
        this.buildings.set(l.id, b);
        this.changed.add(l.id);
      }
    }
    // Upgrades: richer land and a healthy city lift buildings a tier.
    const pop = this.stats.population;
    for (const b of this.buildings.values()) {
      if (b.progress < 1 || b.age < 120) continue;
      const l = this.lots.get(b.lot);
      if (!l) continue;
      const cap = tierCap(l.zone, l.w, l.d);
      if (b.tier >= Math.min(cap, maxTier)) continue;
      const lv = this.lv.get(l.id) ?? 0.3;
      const need = [0, 0.32, 0.46, 0.6][b.tier] ?? 1;
      if (lv < need) continue;
      if (b.tier >= 2 && !(power && water)) continue;
      if (b.tier === 2 && pop < 350) continue;
      if (b.tier === 3 && pop < 1400) continue;
      if (dem[l.zone] < -0.15) continue;
      if (this.rand.next() > 0.035 * dt * (1 + lv)) continue;
      b.tier++;
      b.seed = Math.floor(this.rand.next() * 1e9);
      b.progress = 0;
      b.age = 0;
      this.refreshCapacity(b, l);
      this.changed.add(l.id);
    }
    // People move in and jobs fill.
    const st = this.stats;
    for (const b of this.buildings.values()) {
      if (b.progress < 1) continue;
      if (b.residents < b.capRes && dem.R > -0.3) {
        const add = Math.max(1, Math.round((b.capRes - b.residents) * 0.25));
        b.residents = Math.min(b.capRes, b.residents + add);
      }
      if (b.workers < b.capJobs) {
        const avail = Math.max(2, st.population * 0.5 - st.workers + 4);
        b.workers = Math.min(b.capJobs, b.workers + Math.max(1, Math.round(Math.min(b.capJobs - b.workers, avail * 0.2 + 1))));
      }
    }
  }

  private updateLandValue() {
    // Industry pollutes its neighbours.
    this.indGrid.clear();
    for (const b of this.buildings.values()) {
      if (b.zone !== "I") continue;
      const l = this.lots.get(b.lot);
      if (!l) continue;
      const k = `${Math.floor(l.cx / 128)},${Math.floor(l.cz / 128)}`;
      this.indGrid.set(k, (this.indGrid.get(k) ?? 0) + b.tier);
    }
    this.cover.clear();
    for (const l of this.lots.values()) {
      let v = 0.3;
      let mask = 0;
      const gx = Math.floor(l.cx / 128);
      const gz = Math.floor(l.cz / 128);
      const seen = new Set<string>();
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          for (const s of this.svcGrid.get(`${gx + dx},${gz + dz}`) ?? []) {
            const r = SERVICE_RADIUS[s.kind];
            if (!r || seen.has(s.kind)) continue;
            if (Math.hypot(s.cx - l.cx, s.cz - l.cz) <= r) {
              seen.add(s.kind);
              mask |= COVER_BIT[COVER_AS[s.kind] ?? s.kind] ?? 0;
              v += VALUE_ADD[s.kind] ?? 0.08;
            }
          }
          if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && l.zone !== "I") {
            const ind = this.indGrid.get(`${gx + dx},${gz + dz}`) ?? 0;
            if (ind > 0) mask |= POLLUTED;
            v -= Math.min(0.3, ind * 0.025);
          }
        }
      // Landmarks reach further than the grid search.
      for (const s of this.farServices) {
        if (seen.has(s.kind) || Math.hypot(s.cx - l.cx, s.cz - l.cz) > SERVICE_RADIUS[s.kind]) continue;
        seen.add(s.kind);
        mask |= COVER_BIT[COVER_AS[s.kind] ?? s.kind] ?? 0;
        v += VALUE_ADD[s.kind] ?? 0.08;
      }
      this.cover.set(l.id, mask);
      if (l.wet) v += 0.12;
      v -= (this.congestion.get(l.edge) ?? 0) * 0.12;
      // Potholes outside put people off.
      v -= (1 - (this.roads.get(l.edge)?.c ?? 1)) * 0.1;
      const b = this.buildings.get(l.id);
      if (b) v += Math.min(0.08, b.age / 6000);
      this.lv.set(l.id, clamp(v, 0, 1));
    }
  }

  private updateStats() {
    let pop = 0;
    let jobs = 0;
    let workers = 0;
    let cJobs = 0;
    let iJobs = 0;
    let count = 0;
    for (const b of this.buildings.values()) {
      count++;
      pop += b.residents;
      jobs += b.capJobs;
      workers += b.workers;
      if (b.zone === "C" || b.zone === "M") cJobs += b.capJobs;
      if (b.zone === "I") iJobs += b.capJobs;
    }
    // Who can reach which service, weighted by residents.
    const cov = { police: 0, fire: 0, clinic: 0, school: 0, park: 0 };
    let polluted = 0;
    for (const b of this.buildings.values()) {
      if (!b.residents) continue;
      const m = this.cover.get(b.lot) ?? 0;
      for (const k of COVER_KINDS) if (m & COVER_BIT[k]) cov[k] += b.residents;
      if (m & POLLUTED) polluted += b.residents;
    }
    for (const k of COVER_KINDS) cov[k] = pop ? cov[k] / pop : 0;
    const svcJobs = this.world.services.reduce((n, s) => n + (SERVICE_STAFF[s.kind] ?? 0), 0);
    const labour = pop * 0.52;
    const res = this.world.res;
    const traffic = this.avgCongestion();
    const bias = this.settings.policy?.bias ?? NO_POLICY.bias;
    const R = clamp(bias.R + 0.5 + (0.75 * (jobs + svcJobs - labour)) / (labour * 0.5 + 60) - traffic * 0.25, -1, 1);
    // Visitors come for the landmarks (more as the city gets known), and shop.
    const draw = this.world.services.reduce((n, s) => n + (TOURISM[s.kind] ?? 0), 0);
    const tourists = Math.round(draw * (0.4 + 0.6 * Math.min(1, pop / 6000)) * (this.settings.policy?.tourismMul ?? 1));
    const C = clamp(bias.C + 0.12 + (pop * 0.16 - cJobs) / (pop * 0.08 + 24) + Math.min(0.35, tourists / (pop * 0.4 + 500)) - traffic * 0.15, -1, 1);
    const I = clamp(bias.I + 0.3 + (labour * 0.36 - iJobs) / (labour * 0.22 + 24) + 0.05 * (res[1] + res[2] + res[3]) - traffic * 0.15, -1, 1);
    this.stats = {
      population: pop,
      jobs: jobs + svcJobs,
      workers: Math.min(workers + svcJobs, Math.round(labour)),
      unemployed: Math.max(0, Math.round(labour - workers - svcJobs)),
      demand: { R, C, I, M: clamp((R + C) / 2 + bias.M, -1, 1) },
      buildings: count,
      cars: this.cars.length,
      peds: this.peds.length,
      congestion: traffic,
      power: this.hasService("power"),
      water: this.hasService("water"),
      staff: svcJobs,
      coverage: cov,
      pollution: pop ? polluted / pop : 0,
      cJobs,
      iJobs,
      tourists,
      fires: this.fires.size,
      ...this.roadStats(),
    };
  }

  private roadStats() {
    let len = 0;
    let sum = 0;
    let works = 0;
    let poor = 0;
    for (const [id, r] of this.roads) {
      const info = this.edges.get(id);
      if (!info) continue;
      len += info.L;
      sum += r.c * info.L;
      if (r.works > 0) works++;
      else if (r.c < 0.35) poor++;
    }
    return { roadCondition: len ? sum / len : 1, roadworks: works, poorRoads: poor };
  }

  private avgCongestion() {
    let sum = 0;
    let n = 0;
    for (const [id, c] of this.congestion) {
      if (!this.edges.has(id)) continue;
      sum += c;
      n++;
    }
    return n ? sum / n : 0;
  }

  private updateNotices() {
    const st = this.stats;
    const out: Notice[] = [];
    const gateEdges = [...this.edges.values()].filter(({ e }) => this.nodes.get(e.a)?.n.gate || this.nodes.get(e.b)?.n.gate).length;
    if (this.edges.size <= gateEdges + 1 && this.lots.size === 0) out.push({ key: "n.welcome" });
    else if (this.lots.size === 0) out.push({ key: "n.zone" });
    if (st.population >= 250 && !st.power) out.push({ key: "n.power" });
    if (st.population >= 250 && !st.water) out.push({ key: "n.water" });
    if (st.population > 120 && st.unemployed > st.population * 0.12) out.push({ key: "n.jobs" });
    if (st.jobs - st.workers > 80) out.push({ key: "n.housing" });
    if (st.population > 150 && st.demand.C > 0.55) out.push({ key: "n.shops" });
    if (st.population >= 800 && !this.hasService("school")) out.push({ key: "n.school" });
    if (this.fires.size) out.push({ key: "n.fires", vars: { n: this.fires.size } });
    if (st.poorRoads >= 3) out.push({ key: this.hasService("depot") ? "n.roadsPoor" : "n.roadsDepot", vars: { n: st.poorRoads } });
    let worst: { e: SimEdge; c: number } | null = null;
    for (const [id, c] of this.congestion) {
      const info = this.edges.get(id);
      if (info && c > 0.6 && info.slow[0] + info.slow[1] >= 6 && (!worst || c > worst.c)) worst = { e: info.e, c };
    }
    if (worst) out.push({ key: "n.traffic", vars: { road: worst.e.name } });
    if ([...this.nodes.keys()].some((id) => !this.connected.has(id))) out.push({ key: "n.unconnected" });
    this.notices = out;
  }

  // ---------------------------------------------------------------- routes

  private cost(edge: number, dir: 1 | -1) {
    const info = this.edges.get(edge)!;
    const v = (info.e.speed / 3.6) * 0.85 * roadSpeedFactor(this.roads.get(edge));
    return (info.L / v) * (1 + 2 * (this.congestion.get(edge) ?? 0)) + (dir ? 0 : 0);
  }

  /** A* from a node to any of the targets (node → the leg into the destination edge). */
  private astar(from: number, targets: Map<number, Leg>): Leg[] | null {
    const goal = [...targets.keys()].map((id) => this.nodes.get(id)!.n);
    const h = (id: number) => {
      const n = this.nodes.get(id)!.n;
      let best = Infinity;
      for (const g of goal) best = Math.min(best, Math.hypot(g.x - n.x, g.z - n.z));
      return best / 31;
    };
    const g = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, { node: number; leg: Leg }>();
    const open = new Heap();
    open.push(from, h(from));
    const closed = new Set<number>();
    let found = -1;
    let guard = 0;
    while (open.size && guard++ < 20000) {
      const cur = open.pop();
      if (closed.has(cur)) continue;
      if (targets.has(cur)) {
        found = cur;
        break;
      }
      closed.add(cur);
      for (const nb of this.adj.get(cur) ?? []) {
        const cost = g.get(cur)! + this.cost(nb.edge, nb.dir);
        if (cost < (g.get(nb.to) ?? Infinity)) {
          g.set(nb.to, cost);
          prev.set(nb.to, { node: cur, leg: { edge: nb.edge, dir: nb.dir } });
          open.push(nb.to, cost + h(nb.to));
        }
      }
    }
    if (found < 0) return null;
    const legs: Leg[] = [targets.get(found)!];
    let at = found;
    while (at !== from) {
      const p = prev.get(at);
      if (!p) return null;
      legs.unshift(p.leg);
      at = p.node;
    }
    return legs;
  }

  /** A route from (edge, s) to (edge, s), starting in either allowed direction. */
  private route(fromEdge: number, fromS: number, toEdge: number, toS: number) {
    const a = this.edges.get(fromEdge);
    const b = this.edges.get(toEdge);
    if (!a || !b) return null;
    let best: { legs: Leg[]; d: number; stopAt: number; cost: number } | null = null;
    const starts: (1 | -1)[] = [];
    if (a.e.lanesF > 0) starts.push(1);
    if (a.e.lanesB > 0) starts.push(-1);
    const targets = new Map<number, Leg>();
    if (b.e.lanesF > 0) targets.set(b.e.a, { edge: b.e.id, dir: 1 });
    if (b.e.lanesB > 0) targets.set(b.e.b, { edge: b.e.id, dir: -1 });
    for (const dir of starts) {
      const d = dir === 1 ? fromS : a.L - fromS;
      // Same edge, ahead of us: just drive there.
      if (fromEdge === toEdge) {
        const stop = dir === 1 ? toS : a.L - toS;
        if (stop > d + 5) {
          const c = (stop - d) / 10;
          if (!best || c < best.cost) best = { legs: [{ edge: fromEdge, dir }], d, stopAt: stop, cost: c };
          continue;
        }
      }
      const exit = dir === 1 ? a.e.b : a.e.a;
      const rest = this.astar(exit, targets);
      if (!rest) continue;
      const last = rest[rest.length - 1];
      const stopAt = last.dir === 1 ? toS : b.L - toS;
      let cost = (a.L - d) / 10;
      for (const leg of rest) cost += this.cost(leg.edge, leg.dir);
      if (!best || cost < best.cost) best = { legs: [{ edge: fromEdge, dir }, ...rest], d, stopAt, cost };
    }
    return best;
  }

  // ---------------------------------------------------------------- agents

  private targetCars() {
    if (!this.settings.traffic) return 0;
    const st = this.stats;
    const hour = (this.minutes / 60) % 24;
    const day = hour < 5 ? 0.25 : hour < 7 ? 0.7 : hour < 10 ? 1.25 : hour < 16 ? 0.9 : hour < 19 ? 1.3 : hour < 22 ? 0.8 : 0.45;
    const want = (st.population * 0.07 + st.jobs * 0.03) * day + (this.buildings.size > 0 ? 4 : 0);
    const cap = 80 + 1700 * (this.settings.trafficDensity / 100);
    return Math.min(cap, Math.round(want * (this.settings.policy?.carShare ?? 1) * (0.4 + 0.6 * (this.settings.trafficDensity / 100))));
  }

  private targetPeds() {
    if (!this.settings.peds) return 0;
    const st = this.stats;
    const hour = (this.minutes / 60) % 24;
    const day = hour < 6 ? 0.15 : hour < 21 ? 1 : 0.4;
    const cap = 60 + 1600 * (this.settings.pedDensity / 100);
    return Math.min(cap, Math.round((st.population * 0.06 + st.jobs * 0.02) * day * (0.4 + 0.6 * (this.settings.pedDensity / 100))));
  }

  private pickLot(pred: (b: Building) => boolean, weight: (b: Building) => number) {
    let total = 0;
    const pool: [Building, number][] = [];
    for (const b of this.buildings.values()) {
      if (b.progress < 1 || !pred(b)) continue;
      const w = weight(b);
      if (w <= 0) continue;
      total += w;
      pool.push([b, w]);
    }
    if (!pool.length) return null;
    let r = this.rand.next() * total;
    for (const [b, w] of pool) {
      r -= w;
      if (r <= 0) return this.lots.get(b.lot) ?? null;
    }
    return this.lots.get(pool[pool.length - 1][0].lot) ?? null;
  }

  private spawnAgents() {
    const want = this.targetCars();
    let tries = 0;
    while (this.cars.filter((c) => c.kind !== "bus").length < want && tries++ < 6) this.spawnCar();
    this.syncBuses();
    const wantP = this.targetPeds();
    tries = 0;
    while (this.peds.length < wantP && tries++ < 8) this.spawnPed();
  }

  private gateEdge() {
    for (const ni of this.nodes.values()) if (ni.n.gate && ni.edges.length) return { node: ni.n.id, edge: ni.edges[0] };
    return null;
  }

  private spawnCar() {
    const hour = (this.minutes / 60) % 24;
    const r = this.rand.next();
    let from: { edge: number; s: number } | null = null;
    let to: { edge: number; s: number } | null = null;
    let kind: Car["kind"] = "visit";
    let type = 0;
    const home = () => this.pickLot((b) => b.capRes > 0, (b) => b.residents);
    const work = () => this.pickLot((b) => b.capJobs > 0, (b) => b.workers + 1);
    const shop = () => this.pickLot((b) => b.zone === "C" || b.zone === "M", (b) => b.capJobs + 2);
    const ind = () => this.pickLot((b) => b.zone === "I", (b) => b.capJobs + 1);
    const gate = this.gateEdge();
    const gateAt = () => {
      if (!gate) return null;
      const info = this.edges.get(gate.edge)!;
      return { edge: gate.edge, s: info.e.a === gate.node ? 2 : info.L - 2 };
    };
    const at = (l: SimLot | null) => (l ? { edge: l.edge, s: l.s } : null);
    const morning = hour >= 6 && hour < 10;
    const evening = hour >= 16 && hour < 20;
    if (r < 0.18) {
      // Commuters and visitors from out of town.
      from = gateAt();
      to = at(this.rand.next() < 0.5 ? work() : shop());
      kind = "work";
    } else if (r < 0.3) {
      from = at(work() ?? shop());
      to = gateAt();
      kind = "home";
    } else if (r < 0.45) {
      from = at(ind());
      to = at(shop());
      kind = "deliver";
      type = this.rand.next() < 0.55 ? 1 : this.rand.next() < 0.6 ? 2 : 4;
    } else if (morning || (!evening && r < 0.7)) {
      from = at(home());
      to = at(morning ? work() : shop());
      kind = morning ? "work" : "visit";
    } else {
      from = at(work() ?? shop());
      to = at(home());
      kind = "home";
    }
    if (!from || !to) return;
    if (kind !== "deliver") type = this.rand.next() < 0.68 ? 0 : this.rand.next() < 0.5 ? 2 : 1;
    const rt = this.route(from.edge, from.s, to.edge, to.s);
    if (!rt) return;
    const info = this.edges.get(rt.legs[0].edge)!;
    const lanes = rt.legs[0].dir === 1 ? info.e.lanesF : info.e.lanesB;
    const car: Car = {
      id: this.nextAgent++,
      type,
      color: Math.floor(this.rand.next() * 12),
      route: rt.legs,
      ri: 0,
      d: rt.d,
      lane: lanes > 1 ? Math.floor(this.rand.next() * lanes) : 0,
      v: 0,
      v0: 0.85 + this.rand.next() * 0.25,
      len: VEH_LEN[type],
      crossing: null,
      stopAt: rt.stopAt,
      wait: 0,
      stopped: 0,
      kind,
      x: 0,
      z: 0,
      ang: 0,
    };
    // Don't drop a car on top of another one.
    if (this.cars.some((c) => !c.crossing && c.route[c.ri].edge === car.route[0].edge && c.route[c.ri].dir === car.route[0].dir && c.lane === car.lane && Math.abs(c.d - car.d) < 8)) return;
    this.place(car);
    this.cars.push(car);
  }

  private syncBuses() {
    const want = new Map<number, number>();
    for (const line of this.world.lines) if (line.stops.length >= 2) want.set(line.id, Math.max(1, Math.ceil(line.stops.length / 2)));
    this.cars = this.cars.filter((c) => c.kind !== "bus" || (c.bus && want.has(c.bus.line)));
    for (const [line, n] of want) {
      const have = this.cars.filter((c) => c.bus?.line === line).length;
      for (let k = have; k < n; k++) this.spawnBus(line, k);
    }
  }

  private stop(id: number) {
    return this.world.stops.find((s) => s.id === id);
  }

  private spawnBus(lineId: number, k: number) {
    const line = this.world.lines.find((l) => l.id === lineId);
    if (!line) return;
    const i = (k * 2) % line.stops.length;
    const a = this.stop(line.stops[i]);
    const b = this.stop(line.stops[(i + 1) % line.stops.length]);
    if (!a || !b) return;
    const rt = this.route(a.edge, a.s, b.edge, b.s);
    if (!rt) return;
    const car: Car = {
      id: this.nextAgent++,
      type: 3,
      color: 12 + (lineId % 6),
      route: rt.legs,
      ri: 0,
      d: rt.d,
      lane: 0,
      v: 0,
      v0: 0.85,
      len: VEH_LEN[3],
      crossing: null,
      stopAt: rt.stopAt,
      wait: 0,
      stopped: 0,
      kind: "bus",
      bus: { line: lineId, next: (i + 1) % line.stops.length, dwell: 0 },
      x: 0,
      z: 0,
      ang: 0,
    };
    this.place(car);
    this.cars.push(car);
  }

  private laneOffset(info: EdgeInfo, dir: 1 | -1, lane: number) {
    return laneOffset(info.e.lanesF, info.e.lanesB, info.e.median, dir, lane);
  }

  /** World position on an edge for a car in a lane at distance d along its travel direction. */
  private lanePoint(info: EdgeInfo, dir: 1 | -1, lane: number, d: number) {
    const s = dir === 1 ? d : info.L - d;
    const p = sampleAt(info.e.pts, info.cum, s);
    const tx = p.tx * dir;
    const tz = p.tz * dir;
    const off = this.laneOffset(info, dir, lane);
    return { x: p.x - tz * off, z: p.z + tx * off, tx, tz, s };
  }

  private place(c: Car) {
    if (c.crossing) {
      const k = c.crossing;
      const t = k.t;
      const u = 1 - t;
      c.x = u * u * k.ax + 2 * u * t * k.cx + t * t * k.bx;
      c.z = u * u * k.az + 2 * u * t * k.cz + t * t * k.bz;
      const dx = 2 * u * (k.cx - k.ax) + 2 * t * (k.bx - k.cx);
      const dz = 2 * u * (k.cz - k.az) + 2 * t * (k.bz - k.cz);
      if (dx || dz) c.ang = Math.atan2(dz, dx);
      return;
    }
    const leg = c.route[c.ri];
    const info = this.edges.get(leg.edge)!;
    const p = this.lanePoint(info, leg.dir, c.lane, c.d);
    c.x = p.x;
    c.z = p.z;
    c.ang = Math.atan2(p.tz, p.tx);
  }

  private moveCars(dt: number) {
    // Lane buckets, sorted by distance.
    const buckets = new Map<string, Car[]>();
    for (const info of this.edges.values()) {
      info.count = [0, 0];
      info.slow = [0, 0];
    }
    for (const c of this.cars) {
      if (c.crossing) continue;
      const leg = c.route[c.ri];
      const key = `${leg.edge}:${leg.dir}:${c.lane}`;
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(c);
      const info = this.edges.get(leg.edge)!;
      info.count[leg.dir === 1 ? 0 : 1]++;
      if (c.v < 1.5) info.slow[leg.dir === 1 ? 0 : 1]++;
    }
    for (const b of buckets.values()) b.sort((p, q) => p.d - q.d);
    const firstOn = (edge: number, dir: number, lane: number) => buckets.get(`${edge}:${dir}:${lane}`)?.[0];

    // Release finished crossings.
    for (const ni of this.nodes.values()) ni.active = ni.active.filter((a) => this.cars.some((c) => c.id === a.car && c.crossing?.node === ni.n.id));

    const gone = new Set<number>();
    for (const c of this.cars) {
      if (c.crossing) {
        const k = c.crossing;
        c.v = Math.min(c.v + 2 * dt, 7);
        k.t += (Math.max(c.v, 2) * dt) / k.len;
        if (k.t >= 1) {
          const node = this.nodes.get(k.node);
          if (node) node.active = node.active.filter((a) => a.car !== c.id);
          c.crossing = null;
          c.ri++;
          const leg = c.route[c.ri];
          const info = this.edges.get(leg.edge)!;
          c.d = leg.dir === 1 ? info.setA : info.setB;
        } else {
          this.place(c);
          continue;
        }
      }
      const leg = c.route[c.ri];
      const info = this.edges.get(leg.edge);
      if (!info) {
        gone.add(c.id);
        continue;
      }
      const L = info.L;
      const last = c.ri === c.route.length - 1;
      const endSet = leg.dir === 1 ? info.setB : info.setA;
      const stopLine = L - endSet;
      const v0 = (info.e.speed / 3.6) * c.v0 * (c.kind === "bus" ? 0.85 : 1) * roadSpeedFactor(this.roads.get(leg.edge));
      const bucket = buckets.get(`${leg.edge}:${leg.dir}:${c.lane}`) ?? [];
      const idx = bucket.indexOf(c);
      const leader = idx >= 0 ? bucket[idx + 1] : bucket.find((k) => k.d > c.d);
      let gap = Infinity;
      let lv = 0;
      if (leader) {
        gap = leader.d - leader.len - c.d;
        lv = leader.v;
      }
      let mayCross = false;
      if (last) {
        gap = Math.min(gap, c.stopAt - c.d);
        lv = 0;
      } else if (c.d > stopLine - 40) {
        const next = c.route[c.ri + 1];
        const endNode = leg.dir === 1 ? info.e.b : info.e.a;
        const node = this.nodes.get(endNode)!;
        const ninfo = this.edges.get(next.edge)!;
        const nLanes = next.dir === 1 ? ninfo.e.lanesF : ninfo.e.lanesB;
        const nLane = Math.min(c.lane, Math.max(0, nLanes - 1));
        const ahead = firstOn(next.edge, next.dir, nLane);
        const entry = next.dir === 1 ? ninfo.setA : ninfo.setB;
        const room = !ahead || ahead.d - ahead.len > entry + 2;
        const geo = this.crossGeom(c, info, leg, ninfo, next, nLane, node);
        const free = room && this.junctionFree(node, c, info, geo);
        if (free && (!node.controlled || this.priority(node, info, c, buckets))) mayCross = true;
        if (!mayCross) {
          if (stopLine - c.d < gap) {
            gap = stopLine - c.d;
            lv = 0;
          }
        } else if (c.d >= stopLine - 0.6) {
          // Enter the junction.
          c.crossing = { node: node.n.id, ...geo, t: 0 };
          node.active.push({ car: c.id, ax: geo.ax, az: geo.az, bx: geo.bx, bz: geo.bz });
          c.lane = nLane;
          c.stopped = 0;
          this.place(c);
          continue;
        }
      }
      // IDM.
      const sStar = 2.2 + Math.max(0, c.v * 1.2 + (c.v * (c.v - lv)) / (2 * Math.sqrt(2.2 * 3)));
      const free = 1 - (c.v / Math.max(0.1, v0)) ** 4;
      const inter = gap === Infinity ? 0 : (sStar / Math.max(0.3, gap)) ** 2;
      const acc = clamp(2.2 * (free - inter), -9, 2.2);
      c.v = Math.max(0, c.v + acc * dt);
      let step = c.v * dt;
      if (gap !== Infinity) step = Math.min(step, Math.max(0, gap - 0.5));
      c.d += step;
      if (c.v < 0.3) c.stopped += dt;
      else c.stopped = 0;
      if (last && c.d >= c.stopAt - 1) {
        if (c.kind === "bus") this.busArrive(c, dt);
        else gone.add(c.id);
        continue;
      }
      if (!last && c.d > stopLine && !mayCross) c.d = stopLine;
      if (c.d > L) c.d = L;
      // Gridlock breaker: a car stuck for long enough gives up and parks.
      if (c.stopped > 45 && c.kind !== "bus") gone.add(c.id);
      this.place(c);
    }
    if (gone.size) this.cars = this.cars.filter((c) => !gone.has(c.id));
    // Congestion per edge: how full and how slow.
    for (const [id, info] of this.edges) {
      const cap = Math.max(1, (info.L / 9) * Math.max(1, info.e.lanesF + info.e.lanesB));
      const occ = (info.count[0] + info.count[1]) / cap;
      const slow = (info.slow[0] + info.slow[1]) / Math.max(1, info.count[0] + info.count[1]);
      const c = clamp(occ * 0.6 + slow * occ * 1.2, 0, 1);
      this.congestion.set(id, (this.congestion.get(id) ?? 0) * 0.9 + c * 0.1);
    }
  }

  private busArrive(c: Car, dt: number) {
    const b = c.bus!;
    c.v = 0;
    b.dwell += dt;
    if (b.dwell < 4) return;
    b.dwell = 0;
    const line = this.world.lines.find((l) => l.id === b.line);
    if (!line) return;
    const from = this.stop(line.stops[b.next]);
    b.next = (b.next + 1) % line.stops.length;
    const to = this.stop(line.stops[b.next]);
    if (!from || !to) return;
    const rt = this.route(from.edge, from.s, to.edge, to.s);
    if (!rt) return;
    c.route = rt.legs;
    c.ri = 0;
    c.d = rt.d;
    c.stopAt = rt.stopAt;
    this.place(c);
  }

  private crossGeom(c: Car, info: EdgeInfo, leg: Leg, ninfo: EdgeInfo, next: Leg, nLane: number, node: NodeInfo) {
    const endSet = leg.dir === 1 ? info.setB : info.setA;
    const a = this.lanePoint(info, leg.dir, c.lane, info.L - endSet);
    const entry = next.dir === 1 ? ninfo.setA : ninfo.setB;
    const b = this.lanePoint(ninfo, next.dir, nLane, entry);
    // Control point: where the two lane lines would meet (or the node, for near-parallel ones).
    let cx = node.n.x;
    let cz = node.n.z;
    const den = a.tx * b.tz - a.tz * b.tx;
    if (Math.abs(den) > 0.15) {
      const t = ((b.x - a.x) * b.tz - (b.z - a.z) * b.tx) / den;
      if (t > 0 && t < 40) {
        cx = a.x + a.tx * t;
        cz = a.z + a.tz * t;
      }
    } else {
      cx = (a.x + b.x) / 2;
      cz = (a.z + b.z) / 2;
    }
    const len = Math.max(2, Math.hypot(cx - a.x, cz - a.z) + Math.hypot(b.x - cx, b.z - cz));
    return { ax: a.x, az: a.z, cx, cz, bx: b.x, bz: b.z, len };
  }

  /** No conflicting car or pedestrian in the junction. */
  private junctionFree(node: NodeInfo, c: Car, _info: EdgeInfo, g: { ax: number; az: number; cx: number; cz: number; bx: number; bz: number }) {
    if (node.pedUntil > this.t) return false;
    for (const a of node.active) {
      if (a.car === c.id) continue;
      // Two paths conflict if their chords cross, or they merge into the same spot.
      if (segX(g.ax, g.az, g.bx, g.bz, a.ax, a.az, a.bx, a.bz)) return false;
      if (Math.hypot(g.bx - a.bx, g.bz - a.bz) < 3 || Math.hypot(g.ax - a.ax, g.az - a.az) < 3) return false;
    }
    return true;
  }

  /** Stop and yield: minor roads wait for major-road traffic close to the junction, and stop briefly first. */
  private priority(node: NodeInfo, info: EdgeInfo, c: Car, buckets: Map<string, Car[]>) {
    if (info.e.cls >= node.major) return true;
    if (c.stopped < 0.6) return false;
    for (const id of node.edges) {
      const o = this.edges.get(id)!;
      if (o.e.cls < node.major) continue;
      // Traffic heading into this node on the major road.
      const dir = o.e.b === node.n.id ? 1 : -1;
      const lanes = dir === 1 ? o.e.lanesF : o.e.lanesB;
      for (let lane = 0; lane < lanes; lane++) {
        const b = buckets.get(`${id}:${dir}:${lane}`);
        const k = b?.[b.length - 1];
        if (k && k !== c && o.L - k.d < 26 && k.v > 0.5) return false;
      }
    }
    return true;
  }

  private spawnPed() {
    const l = this.pickLot(() => true, (b) => b.residents + b.capJobs * 0.5 + 1);
    if (!l) return;
    const info = this.edges.get(l.edge);
    if (!info || info.e.sidewalk === 0) return;
    const dir: 1 | -1 = this.rand.next() < 0.5 ? 1 : -1;
    const p: Ped = {
      id: this.nextAgent++,
      edge: l.edge,
      dir,
      d: dir === 1 ? l.s : info.L - l.s,
      side: l.side,
      v: 1.2 + this.rand.next() * 0.5,
      legs: 2 + Math.floor(this.rand.next() * 6),
      color: Math.floor(this.rand.next() * 10),
      crossing: null,
      waiting: 0,
      x: 0,
      z: 0,
      ang: 0,
    };
    this.placePed(p);
    this.peds.push(p);
  }

  private walkPoint(info: EdgeInfo, side: number, s: number) {
    const p = sampleAt(info.e.pts, info.cum, s);
    const off = info.e.half + info.e.sidewalk * 0.5;
    return { x: p.x + side * p.tz * off, z: p.z - side * p.tx * off, tx: p.tx, tz: p.tz };
  }

  private placePed(p: Ped) {
    if (p.crossing) {
      const k = p.crossing;
      p.x = k.ax + (k.bx - k.ax) * k.t;
      p.z = k.az + (k.bz - k.az) * k.t;
      p.ang = Math.atan2(k.bz - k.az, k.bx - k.ax);
      return;
    }
    const info = this.edges.get(p.edge)!;
    const s = p.dir === 1 ? p.d : info.L - p.d;
    const w = this.walkPoint(info, p.side, s);
    p.x = w.x;
    p.z = w.z;
    p.ang = Math.atan2(w.tz * p.dir, w.tx * p.dir);
  }

  private movePeds(dt: number) {
    const gone = new Set<number>();
    for (const p of this.peds) {
      if (p.crossing) {
        p.crossing.t += (p.v * dt) / p.crossing.len;
        if (p.crossing.t >= 1) p.crossing = null;
        else {
          this.placePed(p);
          continue;
        }
        this.placePed(p);
        continue;
      }
      const info = this.edges.get(p.edge);
      if (!info) {
        gone.add(p.id);
        continue;
      }
      const endSet = p.dir === 1 ? info.setB : info.setA;
      const end = info.L - Math.max(0, endSet - info.e.sidewalk);
      if (p.d < end) {
        p.d = Math.min(end, p.d + p.v * dt);
        this.placePed(p);
        continue;
      }
      if (--p.legs <= 0) {
        gone.add(p.id);
        continue;
      }
      // Turn onto another road at this node.
      const nodeId = p.dir === 1 ? info.e.b : info.e.a;
      const node = this.nodes.get(nodeId)!;
      const options = node.edges.filter((id) => id !== p.edge && this.edges.get(id)!.e.sidewalk > 0);
      const nextId = options.length ? options[Math.floor(this.rand.next() * options.length)] : p.edge;
      const ninfo = this.edges.get(nextId)!;
      const ndir: 1 | -1 = ninfo.e.a === nodeId ? 1 : -1;
      const startS = ndir === 1 ? Math.max(0, ninfo.setA - ninfo.e.sidewalk) : ninfo.L - Math.max(0, ninfo.setB - ninfo.e.sidewalk);
      const here = { x: p.x, z: p.z };
      // Keep to whichever sidewalk is nearer, unless it's the same road (then cross it).
      const candidates = [1, -1].map((side) => ({ side, ...this.walkPoint(ninfo, side, startS) }));
      candidates.sort((a, b) => Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z));
      let target = candidates[0];
      if (nextId === p.edge || this.rand.next() < 0.3) target = candidates[1];
      const len = Math.hypot(target.x - here.x, target.z - here.z);
      const crossesRoad = len > info.e.sidewalk * 2 + 2;
      if (crossesRoad && node.controlled) {
        // Zebra crossing: wait for the junction to clear, then the cars wait for us.
        if (node.active.length > 0 || node.carPhaseUntil > this.t) {
          p.waiting += dt;
          if (p.waiting < 25) {
            this.placePed(p);
            continue;
          }
        }
        if (node.pedUntil < this.t) node.carPhaseUntil = this.t + Math.max(4, len / p.v) + 6;
        node.pedUntil = Math.max(node.pedUntil, this.t + len / p.v);
      }
      p.waiting = 0;
      p.crossing = { node: nodeId, ax: here.x, az: here.z, bx: target.x, bz: target.z, len: Math.max(0.5, len), t: 0 };
      p.edge = nextId;
      p.dir = ndir;
      p.side = target.side;
      p.d = ndir === 1 ? startS : ninfo.L - startS;
      this.placePed(p);
    }
    if (gone.size) this.peds = this.peds.filter((p) => !gone.has(p.id));
  }

  // --------------------------------------------------------------- output

  /** Cars: [id, x, z, angle, type, colour, edge (or -node while crossing), s] per car. */
  carBuffer() {
    const out = new Float32Array(this.cars.length * 8);
    let k = 0;
    for (const c of this.cars) {
      const leg = c.route[c.ri];
      const info = this.edges.get(leg.edge);
      out[k++] = c.id;
      out[k++] = c.x;
      out[k++] = c.z;
      out[k++] = c.ang;
      out[k++] = c.type;
      out[k++] = c.color;
      out[k++] = c.crossing ? -c.crossing.node : leg.edge;
      out[k++] = c.crossing ? c.crossing.t : info ? (leg.dir === 1 ? c.d : info.L - c.d) : 0;
    }
    return out;
  }

  /** Pedestrians: [id, x, z, angle, colour, edge (or -node), s]. */
  pedBuffer() {
    const out = new Float32Array(this.peds.length * 7);
    let k = 0;
    for (const p of this.peds) {
      const info = this.edges.get(p.edge);
      out[k++] = p.id;
      out[k++] = p.x;
      out[k++] = p.z;
      out[k++] = p.ang;
      out[k++] = p.color;
      out[k++] = p.crossing ? -p.crossing.node : p.edge;
      out[k++] = p.crossing ? p.crossing.t : info ? (p.dir === 1 ? p.d : info.L - p.d) : 0;
    }
    return out;
  }

  /** The rest of a car's trip as a polyline, and what it's doing. */
  routeOf(id: number) {
    const c = this.cars.find((k) => k.id === id);
    if (!c) return null;
    const pts: number[] = [c.x, c.z];
    const refs: number[] = [c.crossing ? -c.crossing.node : c.route[c.ri].edge, 0];
    for (let i = c.ri; i < c.route.length; i++) {
      const leg = c.route[i];
      const info = this.edges.get(leg.edge);
      if (!info) break;
      const from = i === c.ri && !c.crossing ? c.d : 0;
      const to = i === c.route.length - 1 ? c.stopAt : info.L;
      for (let d = from; d <= to; d += 6) {
        const p = this.lanePoint(info, leg.dir, Math.min(c.lane, Math.max(0, (leg.dir === 1 ? info.e.lanesF : info.e.lanesB) - 1)), d);
        pts.push(p.x, p.z);
        refs.push(leg.edge, p.s);
      }
      const p = this.lanePoint(info, leg.dir, 0, to);
      pts.push(p.x, p.z);
      refs.push(leg.edge, p.s);
    }
    const leg = c.route[Math.min(c.ri, c.route.length - 1)];
    return { pts, refs, type: c.type, kind: c.kind, road: this.edges.get(leg.edge)?.e.name ?? "" };
  }

  /** Knock buildings down (the lots stay zoned unless the world update removes them). */
  demolish(lots: number[]) {
    for (const id of lots)
      if (this.buildings.delete(id)) this.removedLots.add(id);
  }

  /** Test helper: total cars stopped in queues. */
  queued() {
    return this.cars.filter((c) => !c.crossing && c.v < 0.5).length;
  }
}

/** How long a crew takes to resurface a road, game minutes. */
function worksMinutes(L: number) {
  return 60 + L * 0.25;
}

function emptyStats(): Stats {
  return { population: 0, jobs: 0, workers: 0, unemployed: 0, demand: { R: 0.5, C: 0.12, I: 0.3, M: 0.3 }, buildings: 0, cars: 0, peds: 0, congestion: 0, power: false, water: false, staff: 0, coverage: { police: 0, fire: 0, clinic: 0, school: 0, park: 0 }, pollution: 0, cJobs: 0, iJobs: 0, tourists: 0, fires: 0, roadCondition: 1, roadworks: 0, poorRoads: 0 };
}

/** Binary min-heap of node ids by priority. */
class Heap {
  private ids: number[] = [];
  private ps: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, p: number) {
    this.ids.push(id);
    this.ps.push(p);
    let i = this.ids.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.ps[up] <= this.ps[i]) break;
      this.swap(i, up);
      i = up;
    }
  }
  pop() {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastP = this.ps.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.ps[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.ps[l] < this.ps[m]) m = l;
        if (r < this.ids.length && this.ps[r] < this.ps[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.ps[a], this.ps[b]] = [this.ps[b], this.ps[a]];
  }
}

export { hash };
