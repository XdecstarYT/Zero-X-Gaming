/**
 * WareForge simulation: a warehouse and factory on a tile grid. Pure and seeded (no DOM, no
 * three.js), so it can be tested and saved as plain JSON.
 *
 * Pallets live in slots (rack bays, floor blocks, staging lanes behind each dock door, machine
 * buffers), in trucks or on a forklift's forks. Forklifts pick their own jobs (load a docked
 * truck, unload one, clear a machine, pick an order, feed a machine, put stock away) and drive
 * the aisles on a path found around racks and machines. Trucks drive in, back onto a door,
 * load or unload and leave. Customers offer orders with a deadline; you buy stock or the
 * materials to make it.
 */
import {
  AISLE_Z, BACK_Z, BATTERY_PER_LIFT, BATTERY_PER_TILE, CARRIERS, CHARGE_RATE, CHARGER, CITIES, CUSTOMERS, DAY, DETENTION_PER_MIN,
  DOCK_Z, EVENTS, FLOOR, FORK_HANDLE, FORK_SPEED, FORKLIFT_COST, FORKLIFT_WAGE, GOALS, GRID_H, GRID_W, HIGH_TECH, HOUR, ITEM_IDS,
  ITEMS, MACHINES, MAX_DOORS, MAX_FORKLIFTS, MIN, RACK, RAIL_CAP, RAIL_DOORS, RAIL_Z, SEASON_DAYS, STAGE_Z, TRUCK_PHASE, UPGRADES,
  WIDTH_BASE, WIDTH_FULL, WIDTH_MEGA, buyPrice, doorX0, siteDef, supplierFor,
  CARRIER_FEE, FREEZER, FROZEN, LOAN_RATE, MAX_OWN_TRUCKS, MISSIONS, OWN_CARRIER, OWN_TRUCK_COST, OWN_TRUCK_WAGE, THAW_SECS,
  type DoorType, type EventKind, type ItemId, type MachineType, type MissionKind, type UpgradeId,
} from "./data";

/* ------------------------------------------------------------------ state */

export type SlotKind = "store" | "stage" | "in" | "out";

export interface Slot {
  id: number;
  kind: SlotKind;
  /** Tile. */
  x: number;
  z: number;
  /** Height of the pallet's base (rack level). */
  y: number;
  /** Rack / floor block / machine id, or the door index for staging. */
  owner: number;
  pallet: number;
  /** A pallet on its way here (or -2: a machine's next output). */
  res: number;
  dead?: boolean;
  /** A freezer bay. */
  cold?: boolean;
}

export type StructKind = "rack" | "floor" | "machine" | "charger" | "freezer";

export interface Machine {
  type: MachineType;
  recipe: number;
  state: "idle" | "starved" | "blocked" | "running" | "broken" | "repair" | "service" | "off";
  t: number;
  wear: number;
  made: number;
  on: boolean;
  /** Mk II: faster and wears less. */
  mk?: number;
  /** Where the running cycle's pallet will land. */
  outSlot: number;
}

export interface Struct {
  id: number;
  kind: StructKind;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Racks: 0 picks from the south (toward the docks), 1 from the north. */
  rot: number;
  slots: number[];
  m?: Machine;
  dead?: boolean;
}

export interface Door {
  i: number;
  type: DoorType;
  truck: number;
  order: number;
  stage: number[];
}

export interface Pallet {
  id: number;
  item: ItemId;
  lot: string;
  born: number;
  loc: "slot" | "truck" | "fork";
  ref: number;
  /** Cargo position in a truck. */
  ci: number;
  /** The forklift moving it, or -1. */
  busy: number;
  /** The order it's been picked for, or -1. */
  order: number;
  /** Frozen goods: game seconds spent out of the cold (it spoils at THAW_SECS). */
  warm?: number;
}

export type JobKind = "load" | "unload" | "output" | "pick" | "feed" | "putaway";
export type Dest = { k: "slot"; id: number } | { k: "truck"; id: number; ci: number };

export interface Forklift {
  id: number;
  name: string;
  x: number;
  z: number;
  /** Facing (radians, 0 = +z). */
  dir: number;
  lift: number;
  phase: "idle" | "go1" | "pick" | "go2" | "drop" | "park" | "charge";
  t: number;
  path: [number, number][];
  job: { kind: JobKind; pallet: number; to: Dest } | null;
  trips: number;
  dist: number;
  /** When it last looked for work (game seconds). */
  looked: number;
  /** Battery, 0..1. */
  battery: number;
  /** The charging point it's using (charger struct id × 2 + point), or -1. */
  charger: number;
}

export type TruckState = "transit" | "queued" | "arriving" | "backing" | "docked" | "leaving" | "gone";

export interface Truck {
  id: number;
  plate: string;
  carrier: number;
  dir: "in" | "out";
  state: TruckState;
  t: number;
  eta: number;
  door: number;
  cap: number;
  /** Pallet ids by cargo position (-1 empty, -2 a pallet on its way). */
  cargo: number[];
  /** Order (out) or purchase order (in). */
  ref: number;
  arrived: number;
  docked: number;
  /** A train at the rail siding (door is then a rail door). */
  rail?: boolean;
  /** One of your own trucks (its id in the fleet). */
  own?: number;
}

export type OrderState = "offer" | "confirmed" | "picked" | "loading" | "transit" | "delivered" | "failed" | "declined";

export interface Order {
  id: number;
  code: string;
  customer: string;
  city: string;
  lines: { item: ItemId; n: number }[];
  total: number;
  value: number;
  offered: number;
  expires: number;
  due: number;
  transit: number;
  state: OrderState;
  door: number;
  truck: number;
  departed: number;
  delivers: number;
  onTime?: boolean;
  rush: boolean;
  paid: number;
  /** The contract it belongs to, if any. */
  contract?: number;
  /** A VIP order: half again the price, a tight deadline. */
  vip?: boolean;
  /** Carried by one of your own trucks. */
  own?: number;
}

export interface OwnTruck {
  id: number;
  name: string;
  /** When it's back at the depot and free (OUT_ON_JOB while it's out with a shipment). */
  free: number;
  trips: number;
}

/** An own truck's `free` while it's out on a job (finite, so it survives a save). */
export const OUT_ON_JOB = 1e15;

export interface Mission {
  kind: MissionKind;
  name: string;
  icon: string;
  target: number;
  reward: number;
  done: boolean;
}

/** Something for the renderer to show once (a money pop over the office). */
export interface Fx {
  id: number;
  amount: number;
  text: string;
}

export interface Contract {
  id: number;
  customer: string;
  city: string;
  item: ItemId;
  /** Pallets a shipment, how many shipments, how often (game hours). */
  n: number;
  count: number;
  every: number;
  bonus: number;
  state: "offer" | "active" | "done" | "failed" | "declined";
  expires: number;
  orders: number[];
  onTime: number;
  late: number;
}

export interface WorldEvent {
  kind: EventKind;
  started: number;
  until: number;
}

export interface PO {
  id: number;
  code: string;
  supplier: string;
  item: ItemId;
  n: number;
  cost: number;
  ordered: number;
  truck: number;
  done: boolean;
}

export type AlertKind = "info" | "good" | "warn" | "bad";
export type Focus = { k: "truck" | "fork" | "order" | "struct" | "door" | "pallet"; id: number };

export interface Alert {
  id: number;
  t: number;
  kind: AlertKind;
  text: string;
  focus?: Focus;
}

export interface Ledger {
  revenue: number;
  purchases: number;
  wages: number;
  upkeep: number;
  rent: number;
  penalties: number;
  capex: number;
  rewards: number;
  carriers: number;
  interest: number;
  spoilage: number;
}

export interface DayStat {
  day: number;
  revenue: number;
  costs: number;
  shipped: number;
  received: number;
  made: number;
  onTime: number;
  late: number;
  /** Orders delivered, trucks and trains unloaded, pallets moved. */
  orders: number;
  unloads: number;
  moves: number;
}

export interface State {
  v: 1;
  site: string;
  seed: number;
  rng: number;
  time: number;
  cash: number;
  startWorth: number;
  rep: number;
  expanded: boolean;
  /** The Mega hall (the second expansion) and the rail siding. */
  mega: boolean;
  rail: boolean;
  /** Today's market: a price factor for every item. */
  market: Partial<Record<ItemId, number>>;
  contracts: Contract[];
  event: WorldEvent | null;
  /** The bank loan outstanding. */
  loan: number;
  /** Cash at the end of each game hour (the last three days). */
  cashLog: number[];
  /** Yesterday's report, waiting to be read. */
  report: (DayStat & { profit: number }) | null;
  missions: Mission[];
  /** How each customer rates you. */
  customers: Record<string, { onTime: number; late: number }>;
  ownTrucks: OwnTruck[];
  fx: Fx[];
  /** The tutorial step (and whether it's switched off). */
  tip: number;
  tipsOff?: boolean;
  slots: Slot[];
  structs: Struct[];
  doors: Door[];
  pallets: Record<number, Pallet>;
  forks: Forklift[];
  trucks: Truck[];
  orders: Order[];
  pos: PO[];
  alerts: Alert[];
  up: Partial<Record<UpgradeId, number>>;
  goals: Record<string, boolean>;
  auto: Partial<Record<ItemId, { min: number; qty: number }>>;
  next: number;
  lot: number;
  ledger: Ledger;
  today: DayStat;
  days: DayStat[];
  history: boolean[];
  stats: { delivered: number; onTime: number; late: number; failed: number; revenue: number; made: number; madeGoods: number; unloaded: number; moves: number; rushOnTime: number; phones: number; peakStock: number; trains: number; charges: number; contractsDone: number; events: number; madeItems: Partial<Record<ItemId, number>>; borrowed: number; repaid: number; coldShipped: number; ownShipped: number; missions: number; vipOnTime: number; spoiled: number };
  seasonOver: boolean;
  bankrupt: boolean;
}

/* ------------------------------------------------------------------ random */

export function rand(s: State) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (s: State, a: number, b: number) => a + Math.floor(rand(s) * (b - a + 1));
const pick = <T,>(s: State, a: readonly T[]) => a[Math.floor(rand(s) * a.length)];
const nid = (s: State) => ++s.next;

/* ------------------------------------------------------------------ helpers */

export const width = (s: State) => (s.mega ? WIDTH_MEGA : s.expanded ? WIDTH_FULL : WIDTH_BASE);
export const day = (t: number) => Math.floor(t / DAY) + 1;
export const clock = (t: number) => {
  const m = Math.floor((t % DAY) / 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const up = (s: State, id: UpgradeId) => (s.up[id] ?? 0) > 0;
export const rackLevels = (s: State) => (up(s, "highbay") ? 3 : 2);
export const LEVEL_H = 1.15;
export const eventOn = (s: State, k: EventKind) => s.event?.kind === k;
/** Today's price factor for an item. */
export const marketOf = (s: State, item: ItemId) => s.market[item] ?? 1;
/** A forklift driver's level (1–5), from trips driven. */
export const forkLevel = (s: State, f: Forklift) => Math.min(5, 1 + Math.floor(Math.sqrt((f.trips * (up(s, "academy") ? 2 : 1)) / 12)));
/** A customer's loyalty: 0 none, 1 bronze, 2 silver, 3 gold. */
export function loyalty(s: State, name: string) {
  const c = s.customers[name];
  const n = c ? c.onTime : 0;
  return n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0;
}
export const LOYALTY = ["", "Bronze", "Silver", "Gold"] as const;

export function alert(s: State, kind: AlertKind, text: string, focus?: Focus) {
  s.alerts.push({ id: nid(s), t: s.time, kind, text, focus });
  if (s.alerts.length > 40) s.alerts.splice(0, s.alerts.length - 40);
}

function spend(s: State, amount: number, k: keyof Ledger) {
  s.cash -= amount;
  s.ledger[k] += amount;
  s.today.costs += amount;
}
function earn(s: State, amount: number, k: keyof Ledger) {
  s.cash += amount;
  s.ledger[k] += amount;
  if (k === "revenue") {
    s.today.revenue += amount;
    s.stats.revenue += amount;
  }
}

const newDay = (d: number): DayStat => ({ day: d, revenue: 0, costs: 0, shipped: 0, received: 0, made: 0, onTime: 0, late: 0, orders: 0, unloads: 0, moves: 0 });

/** A money pop for the renderer (and a flash on the cash counter). */
function pop(s: State, amount: number, text: string) {
  s.fx.push({ id: nid(s), amount: Math.round(amount), text });
  if (s.fx.length > 30) s.fx.splice(0, s.fx.length - 30);
}

/** The goods customers here may order. */
function mixOf(s: State) {
  const def = siteDef(s.site);
  const mix = new Set(def.goodsMix);
  if (up(s, "premium")) for (const i of HIGH_TECH) mix.add(i);
  if (up(s, "cold")) for (const i of FROZEN) mix.add(i);
  return [...mix];
}

/* ------------------------------------------------------------------ the floor */

const inside = (s: State, x: number, z: number) => x >= 2 && x < width(s) && z >= BACK_Z && z < DOCK_Z;

/** Tiles: 0 floor you can drive on, 1 blocked. Rebuilt when the layout changes. */
let gridCache: { key: string; g: Uint8Array } | null = null;
function layoutKey(s: State) {
  return `${s.expanded}|${s.mega}|${s.rail}|${s.doors.length}|${s.structs.length}|${s.structs.filter((t) => t.dead).length}`;
}
export function grid(s: State): Uint8Array {
  const key = layoutKey(s);
  if (gridCache && gridCache.key === key) return gridCache.g;
  const g = new Uint8Array(GRID_W * GRID_H).fill(1);
  for (let z = BACK_Z; z < DOCK_Z; z++) for (let x = 2; x < width(s); x++) g[z * GRID_W + x] = 0;
  for (const d of s.doors) {
    const x0 = doorX0(d.i);
    for (const z of STAGE_Z) for (let x = x0; x < x0 + 3; x++) g[z * GRID_W + x] = 1;
    g[DOCK_Z * GRID_W + x0 + 1] = 0;
  }
  // Rail doors open in the back wall.
  if (s.rail) for (const x0 of RAIL_DOORS) g[1 * GRID_W + x0 + 1] = 0;
  for (const t of s.structs) {
    if (t.dead) continue;
    for (let z = t.z; z < t.z + t.d; z++) for (let x = t.x; x < t.x + t.w; x++) g[z * GRID_W + x] = 1;
  }
  gridCache = { key, g };
  return g;
}
const free = (g: Uint8Array, x: number, z: number) => x >= 0 && z >= 0 && x < GRID_W && z < GRID_H && g[z * GRID_W + x] === 0;

/** Where a forklift stands to reach a slot: candidates in order of preference. */
function accessCandidates(s: State, sl: Slot): [number, number][] {
  if (sl.kind === "stage") return sl.z === STAGE_Z[0] ? [[sl.x, sl.z - 1]] : [[sl.x, sl.z + 1]];
  const t = s.structs[sl.owner];
  if (!t) return [];
  if (t.kind === "rack" || t.kind === "freezer") return [[sl.x, t.rot === 0 ? t.z + 1 : t.z - 1]];
  if (t.kind === "machine") {
    const out: [number, number][] = [];
    const left = sl.kind === "in";
    out.push([left ? t.x - 1 : t.x + t.w, sl.z]);
    if (sl.z === t.z) out.push([sl.x, t.z - 1]);
    if (sl.z === t.z + t.d - 1) out.push([sl.x, t.z + t.d]);
    return out;
  }
  return [
    [sl.x, sl.z + 1],
    [sl.x, sl.z - 1],
    [sl.x - 1, sl.z],
    [sl.x + 1, sl.z],
  ];
}

export function access(s: State, sl: Slot): [number, number] | null {
  const g = grid(s);
  for (const c of accessCandidates(s, sl)) if (free(g, c[0], c[1])) return c;
  return null;
}

/** Tiles reachable from the main aisle. */
function reach(s: State, g: Uint8Array) {
  const seen = new Uint8Array(GRID_W * GRID_H);
  const q: number[] = [];
  const start = AISLE_Z[0] * GRID_W + 2;
  if (g[start] === 0) {
    seen[start] = 1;
    q.push(start);
  }
  while (q.length) {
    const c = q.pop()!;
    const x = c % GRID_W;
    const z = (c - x) / GRID_W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (free(g, nx, nz) && !seen[nz * GRID_W + nx]) {
        seen[nz * GRID_W + nx] = 1;
        q.push(nz * GRID_W + nx);
      }
    }
  }
  return seen;
}

/** Shortest path on the grid (4-way, turns cost a little so routes run straight), as tile centres. */
export function route(s: State, ax: number, az: number, bx: number, bz: number): [number, number][] {
  const g = grid(s);
  const sx = Math.floor(ax);
  const sz = Math.floor(az);
  // A forklift standing on a tile that's since been built over drives off it first.
  let start = sz * GRID_W + sx;
  if (!free(g, sx, sz)) {
    let best = -1;
    let bd = Infinity;
    for (let z = 0; z < GRID_H; z++)
      for (let x = 0; x < GRID_W; x++)
        if (g[z * GRID_W + x] === 0) {
          const d = Math.abs(x - sx) + Math.abs(z - sz);
          if (d < bd) {
            bd = d;
            best = z * GRID_W + x;
          }
        }
    if (best < 0) return [[bx + 0.5, bz + 0.5]];
    start = best;
  }
  const goal = bz * GRID_W + bx;
  const N = GRID_W * GRID_H;
  // State = tile * 4 + heading, so turning can cost.
  const cost = new Float64Array(N * 4).fill(Infinity);
  const prev = new Int32Array(N * 4).fill(-1);
  const h = (c: number) => Math.abs((c % GRID_W) - bx) + Math.abs(Math.floor(c / GRID_W) - bz);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // A binary heap of [priority, state].
  const heap: number[] = [];
  const hp: number[] = [];
  const push = (st: number, pr: number) => {
    let i = heap.length;
    heap.push(st);
    hp.push(pr);
    while (i > 0) {
      const up2 = (i - 1) >> 1;
      if (hp[up2] <= hp[i]) break;
      [heap[up2], heap[i]] = [heap[i], heap[up2]];
      [hp[up2], hp[i]] = [hp[i], hp[up2]];
      i = up2;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    const lp = hp.pop()!;
    if (heap.length) {
      heap[0] = last;
      hp[0] = lp;
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        const b = a + 1;
        let m = i;
        if (a < heap.length && hp[a] < hp[m]) m = a;
        if (b < heap.length && hp[b] < hp[m]) m = b;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        [hp[m], hp[i]] = [hp[i], hp[m]];
        i = m;
      }
    }
    return top;
  };
  for (let k = 0; k < 4; k++) {
    cost[start * 4 + k] = 0;
    push(start * 4 + k, h(start));
  }
  let found = -1;
  const closed = new Uint8Array(N * 4);
  while (heap.length) {
    const st = pop();
    if (closed[st]) continue;
    closed[st] = 1;
    const c = st >> 2;
    if (c === goal) {
      found = st;
      break;
    }
    const x = c % GRID_W;
    const z = (c - x) / GRID_W;
    for (let k = 0; k < 4; k++) {
      const nx = x + DIRS[k][0];
      const nz = z + DIRS[k][1];
      const nc = nz * GRID_W + nx;
      if (!free(g, nx, nz) && nc !== goal) continue;
      const ns = nc * 4 + k;
      const nc2 = cost[st] + 1 + ((st & 3) === k ? 0 : 0.35);
      if (nc2 < cost[ns]) {
        cost[ns] = nc2;
        prev[ns] = st;
        push(ns, nc2 + h(nc));
      }
    }
  }
  if (found < 0) return [[bx + 0.5, bz + 0.5]];
  const tiles: number[] = [];
  for (let st = found; st >= 0; st = prev[st]) tiles.push(st >> 2);
  tiles.reverse();
  const pts: [number, number][] = [];
  for (let i = 0; i < tiles.length; i++) {
    const c = tiles[i];
    const p: [number, number] = [(c % GRID_W) + 0.5, Math.floor(c / GRID_W) + 0.5];
    // Drop points in the middle of straight runs.
    if (i > 0 && i < tiles.length - 1) {
      const a = tiles[i - 1];
      const b = tiles[i + 1];
      if (c - a === b - c) continue;
    }
    pts.push(p);
  }
  return pts;
}

/* ------------------------------------------------------------------ building */

function addSlot(s: State, kind: SlotKind, x: number, z: number, y: number, owner: number) {
  const sl: Slot = { id: s.slots.length, kind, x, z, y, owner, pallet: -1, res: -1 };
  s.slots.push(sl);
  return sl.id;
}

function addDoor(s: State, type: DoorType) {
  const i = s.doors.length;
  const x0 = doorX0(i);
  const stage: number[] = [];
  for (const z of STAGE_Z) for (let x = x0; x < x0 + 3; x++) stage.push(addSlot(s, "stage", x, z, 0, i));
  s.doors.push({ i, type, truck: -1, order: -1, stage });
}

export const doorFits = (s: State, i: number) => i < MAX_DOORS && doorX0(i) + 3 <= width(s);

export interface Placement {
  kind: StructKind;
  type?: MachineType;
  x: number;
  z: number;
  rot?: number;
}

export function footprint(p: Placement) {
  if (p.kind === "machine") {
    const m = MACHINES[p.type ?? "press"];
    return { w: m.w, d: m.d };
  }
  if (p.kind === "charger") return { w: CHARGER.w, d: CHARGER.d };
  if (p.kind === "freezer") return { w: FREEZER.w, d: FREEZER.d };
  return p.kind === "rack" ? { w: RACK.w, d: RACK.d } : { w: FLOOR.w, d: FLOOR.d };
}

export const structCost = (p: Placement) =>
  p.kind === "machine" ? MACHINES[p.type ?? "press"].cost : p.kind === "rack" ? RACK.cost : p.kind === "charger" ? CHARGER.cost : p.kind === "freezer" ? FREEZER.cost : FLOOR.cost;

/** The tiles in front of a charging bay where forklifts park to charge. */
export const chargePoints = (t: Struct): [number, number][] => [
  [t.x, t.z + 1],
  [t.x + 1, t.z + 1],
];

function makeStruct(s: State, p: Placement): Struct {
  const { w, d } = footprint(p);
  const t: Struct = { id: s.structs.length, kind: p.kind, x: p.x, z: p.z, w, d, rot: p.rot ?? 0, slots: [] };
  s.structs.push(t);
  if (p.kind === "rack") {
    for (let lv = 0; lv < rackLevels(s); lv++) for (let c = 0; c < w; c++) t.slots.push(addSlot(s, "store", p.x + c, p.z, lv * LEVEL_H, t.id));
  } else if (p.kind === "freezer") {
    for (let lv = 0; lv < FREEZER.levels; lv++)
      for (let c = 0; c < w; c++) {
        const id = addSlot(s, "store", p.x + c, p.z, lv * LEVEL_H, t.id);
        s.slots[id].cold = true;
        t.slots.push(id);
      }
  } else if (p.kind === "floor") {
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) t.slots.push(addSlot(s, "store", p.x + dx, p.z + dz, 0, t.id));
  } else if (p.kind === "machine") {
    for (let dz = 0; dz < d; dz++) t.slots.push(addSlot(s, "in", p.x, p.z + dz, 0.55, t.id));
    for (let dz = 0; dz < d; dz++) t.slots.push(addSlot(s, "out", p.x + w - 1, p.z + dz, 0.55, t.id));
    t.m = { type: p.type ?? "press", recipe: 0, state: "idle", t: 0, wear: 0, made: 0, on: true, outSlot: -1 };
  }
  gridCache = null;
  return t;
}

/** Why a placement can't go here, or null if it can. */
export function placeError(s: State, p: Placement): string | null {
  const { w, d } = footprint(p);
  for (let z = p.z; z < p.z + d; z++)
    for (let x = p.x; x < p.x + w; x++) {
      if (!inside(s, x, z)) return "Outside the building";
      if (z >= AISLE_Z[0]) return "Keep the aisle and docks clear";
      if (s.rail && z === BACK_Z && RAIL_DOORS.some((x0) => x >= x0 && x < x0 + 3)) return "Keep the rail doors clear";
    }
  const g = grid(s);
  for (let z = p.z; z < p.z + d; z++) for (let x = p.x; x < p.x + w; x++) if (g[z * GRID_W + x] !== 0) return "Something's already there";
  // Try it, and make sure every slot can still be reached.
  const before = { slots: s.slots.length, structs: s.structs.length };
  const t = makeStruct(s, p);
  const g2 = grid(s);
  const seen = reach(s, g2);
  let err: string | null = null;
  for (const st of s.structs) {
    if (st.dead || err) continue;
    for (const id of st.slots) {
      const sl = s.slots[id];
      const ok = accessCandidates(s, sl).some(([x, z]) => free(g2, x, z) && seen[z * GRID_W + x]);
      if (!ok) {
        err = st === t ? "It couldn't be reached there" : "That would block another rack or machine";
        break;
      }
    }
    if (st.kind === "charger" && !err && !chargePoints(st).some(([x, z]) => free(g2, x, z) && seen[z * GRID_W + x]))
      err = st === t ? "Forklifts couldn't reach the chargers there" : "That would block a charging bay";
  }
  for (const f of s.forks) {
    const fx = Math.floor(f.x);
    const fz = Math.floor(f.z);
    if (fx >= p.x && fx < p.x + w && fz >= p.z && fz < p.z + d) err = err ?? "A forklift is in the way";
  }
  s.slots.length = before.slots;
  s.structs.length = before.structs;
  gridCache = null;
  return err;
}

export function place(s: State, p: Placement): string | null {
  const err = placeError(s, p);
  if (err) return err;
  const cost = structCost(p);
  if (s.cash < cost) return "Not enough cash";
  spend(s, cost, "capex");
  const t = makeStruct(s, p);
  if (t.kind === "machine") alert(s, "good", `${MACHINES[t.m!.type].name} installed`, { k: "struct", id: t.id });
  if (t.kind === "charger") alert(s, "good", "Charging bay installed", { k: "struct", id: t.id });
  if (t.kind === "freezer") alert(s, "good", "Freezer rack installed", { k: "struct", id: t.id });
  pop(s, -cost, "Built");
  return null;
}

export function removeError(s: State, id: number): string | null {
  const t = s.structs[id];
  if (!t || t.dead) return "Gone already";
  if (t.slots.some((sl) => s.slots[sl].pallet >= 0 || s.slots[sl].res !== -1)) return "Empty it first";
  if (t.m && (t.m.state === "running" || t.m.state === "repair" || t.m.state === "service")) return "Wait for it to finish";
  if (t.kind === "charger" && s.forks.some((f) => f.charger >= 0 && Math.floor(f.charger / 2) === t.id)) return "A forklift is charging";
  return null;
}

export function remove(s: State, id: number): string | null {
  const err = removeError(s, id);
  if (err) return err;
  const t = s.structs[id];
  t.dead = true;
  for (const sl of t.slots) s.slots[sl].dead = true;
  // Half back.
  earn(s, Math.round(structCost({ kind: t.kind, type: t.m?.type, x: 0, z: 0 }) / 2), "rewards");
  gridCache = null;
  return null;
}

/* ------------------------------------------------------------------ pallets */

function lotCode(s: State) {
  s.lot++;
  return `L${String(day(s.time)).padStart(2, "0")}-${String(s.lot).padStart(4, "0")}`;
}

function newPallet(s: State, item: ItemId): Pallet {
  const p: Pallet = { id: nid(s), item, lot: lotCode(s), born: s.time, loc: "slot", ref: -1, ci: -1, busy: -1, order: -1 };
  s.pallets[p.id] = p;
  return p;
}

const freeSlot = (sl: Slot) => !sl.dead && sl.pallet < 0 && sl.res === -1;

export function stock(s: State, item?: ItemId) {
  let n = 0;
  for (const p of Object.values(s.pallets)) if (p.loc === "slot" && (!item || p.item === item)) n++;
  return n;
}

/** Pallets of an item a forklift could pick: in storage, not promised and not moving. */
function available(s: State, item: ItemId) {
  const out: Pallet[] = [];
  for (const p of Object.values(s.pallets)) if (p.item === item && p.loc === "slot" && p.busy < 0 && p.order < 0 && s.slots[p.ref].kind === "store") out.push(p);
  return out;
}
export const availableCount = (s: State, item: ItemId) => available(s, item).length;

export const slotPos = (sl: Slot) => ({ x: sl.x + 0.5, z: sl.z + 0.5 });
const dist = (ax: number, az: number, bx: number, bz: number) => Math.abs(ax - bx) + Math.abs(az - bz);

function nearestStore(s: State, x: number, z: number, nearDocks: boolean, item?: ItemId): Slot | null {
  let best: Slot | null = null;
  let bd = Infinity;
  const frozen = !!item && !!ITEMS[item].frozen;
  for (const sl of s.slots) {
    if (sl.kind !== "store" || !freeSlot(sl) || !access(s, sl)) continue;
    // Without smart slotting stock goes in the first free bay; with it, as near as can be.
    // Frozen goods go in the freezers if there's room; everything else leaves the freezers free.
    const d = (nearDocks ? dist(sl.x, sl.z, x, z) + sl.y * 2 : sl.id) + (frozen !== !!sl.cold ? 100_000 : 0);
    if (d < bd) {
      bd = d;
      best = sl;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ new game */

const PLATE_BASE = 2000;

export function newGame(siteId: string, seed = 1): State {
  const def = siteDef(siteId);
  const s: State = {
    v: 1, site: def.id, seed, rng: seed >>> 0, time: 7 * HOUR, cash: def.cash, startWorth: 0, rep: 60, expanded: def.expanded,
    mega: !!def.mega, rail: !!def.rail, market: {}, contracts: [], event: null,
    loan: 0, cashLog: [], report: null, missions: [], customers: {}, ownTrucks: [], fx: [], tip: 0,
    slots: [], structs: [], doors: [], pallets: {}, forks: [], trucks: [], orders: [], pos: [], alerts: [], up: {}, goals: {}, auto: {},
    next: 0, lot: 0,
    ledger: { revenue: 0, purchases: 0, wages: 0, upkeep: 0, rent: 0, penalties: 0, capex: 0, rewards: 0, carriers: 0, interest: 0, spoilage: 0 },
    today: newDay(1), days: [], history: [],
    stats: { delivered: 0, onTime: 0, late: 0, failed: 0, revenue: 0, made: 0, madeGoods: 0, unloaded: 0, moves: 0, rushOnTime: 0, phones: 0, peakStock: 0, trains: 0, charges: 0, contractsDone: 0, events: 0, madeItems: {}, borrowed: 0, repaid: 0, coldShipped: 0, ownShipped: 0, missions: 0, vipOnTime: 0, spoiled: 0 },
    seasonOver: false, bankrupt: false,
  };
  for (const id of ITEM_IDS) s.market[id] = 1;
  if (def.cold) s.up.cold = 1;
  for (const d of def.doors) addDoor(s, d);
  for (const [x, z] of def.racks) makeStruct(s, { kind: "rack", x, z, rot: 0 });
  for (const m of def.machines) {
    const t = makeStruct(s, { kind: "machine", type: m.type, x: m.x, z: m.z });
    t.m!.recipe = m.recipe;
  }
  for (const [x, z] of def.freezers ?? []) makeStruct(s, { kind: "freezer", x, z, rot: 0 });
  makeStruct(s, { kind: "charger", x: def.charger[0], z: def.charger[1] });
  // Opening stock, spread through the racks.
  let k = 0;
  for (const [item, n] of Object.entries(def.stock) as [ItemId, number][])
    for (let i = 0; i < n; i++) {
      const store = s.slots.filter((sl) => sl.kind === "store" && !!sl.cold === !!ITEMS[item].frozen);
      if (!store.length) break;
      const sl = store[(k * 7) % store.length].pallet < 0 ? store[(k * 7) % store.length] : store.find((x) => x.pallet < 0);
      if (!sl) break;
      k++;
      const p = newPallet(s, item);
      p.born = s.time - ri(s, 1, 5) * HOUR - ri(s, 0, 59) * MIN;
      p.ref = sl.id;
      sl.pallet = p.id;
    }
  for (let i = 0; i < def.forklifts; i++) addForklift(s);
  // The first shift: a shipment booked and a delivery on its way in.
  const goods = def.goodsMix[0];
  const first = makeOrder(s, { customer: "SafeWork PPE", city: "Philadelphia", lines: [{ item: goods, n: Math.min(6, (def.stock[goods] ?? 0) || 4) }], due: s.time + 5 * HOUR, rush: false });
  first.code = "SHP-78442";
  accept(s, first.id);
  const inItem = def.machines.length ? "plastic" : goods;
  const po = buy(s, inItem, 6, true);
  if (po) {
    const tr = s.trucks.find((t) => t.id === po.truck)!;
    tr.eta = s.time + 12 * MIN;
    tr.plate = "TRK-2287";
  }
  offer(s);
  newMissions(s);
  s.startWorth = worth(s);
  alert(s, "info", `Welcome to ${def.code} ${def.name}. Shift starts 07:00.`);
  return s;
}

/* ------------------------------------------------------------------ forklifts */

export function addForklift(s: State) {
  const n = s.forks.length;
  const x = 2.5 + ((n * 3) % (width(s) - 3));
  s.forks.push({ id: n, name: `FL-${String(n + 1).padStart(2, "0")}`, x, z: AISLE_Z[0] + 0.5, dir: Math.PI / 2, lift: 0, phase: "idle", t: 0, path: [], job: null, trips: 0, dist: 0, looked: -99, battery: 1, charger: -1 });
}

export function buyForklift(s: State): string | null {
  if (s.forks.length >= MAX_FORKLIFTS) return "The fleet is full";
  if (s.cash < FORKLIFT_COST) return "Not enough cash";
  spend(s, FORKLIFT_COST, "capex");
  addForklift(s);
  alert(s, "good", `${s.forks[s.forks.length - 1].name} joins the fleet`, { k: "fork", id: s.forks.length - 1 });
  return null;
}

const forkSpeed = (s: State, f?: Forklift) =>
  FORK_SPEED * (up(s, "fast2") ? 1.4 : up(s, "fast1") ? 1.2 : 1) * (f && f.battery <= 0.02 ? 0.4 : 1) * (f ? 1 + (forkLevel(s, f) - 1) * 0.03 : 1);
const handleTime = (s: State, atDock: boolean) => FORK_HANDLE * (up(s, "scanner") ? 0.5 : 1) * (atDock && up(s, "levellers") ? 0.6 : 1) * (up(s, "training") ? 0.75 : 1);
const drainFactor = (s: State) => (eventOn(s, "heat") ? 1.5 : 1) * (up(s, "training") ? 0.8 : 1);
function drain(s: State, f: Forklift, amount: number) {
  f.battery = Math.max(0, f.battery - amount * drainFactor(s));
}

/** A free charging point near a forklift: [charger id × 2 + point, x, z]. */
function freeChargePoint(s: State, f: Forklift): [number, number, number] | null {
  const g = grid(s);
  let best: [number, number, number] | null = null;
  let bd = Infinity;
  for (const t of s.structs) {
    if (t.dead || t.kind !== "charger") continue;
    chargePoints(t).forEach(([x, z], k) => {
      const key = t.id * 2 + k;
      if (!free(g, x, z) || s.forks.some((o) => o !== f && o.charger === key)) return;
      const d = dist(x, z, f.x, f.z);
      if (d < bd) {
        bd = d;
        best = [key, x, z];
      }
    });
  }
  return best;
}

/** Where a pallet is in the world (tile coordinates plus height). */
export function palletPos(s: State, p: Pallet): { x: number; z: number; y: number } {
  if (p.loc === "slot") {
    const sl = s.slots[p.ref];
    return { x: sl.x + 0.5, z: sl.z + 0.5, y: sl.y };
  }
  if (p.loc === "truck") {
    const t = s.trucks.find((tr) => tr.id === p.ref);
    if (t) return cargoPos(s, t, p.ci);
  }
  const f = s.forks[p.ref];
  if (f) return { x: f.x + Math.sin(f.dir) * 0.75, z: f.z + Math.cos(f.dir) * 0.75, y: f.lift };
  return { x: 0, z: 0, y: 0 };
}

/** A cargo position in a docked trailer (two across, front to back), or on a train's two flat wagons. */
export function cargoPos(s: State, t: Truck, ci: number) {
  if (t.rail) {
    const x0 = t.door >= 0 ? RAIL_DOORS[t.door] : 0;
    // Two flat wagons either side of the door, four pallets long and two across.
    const k = ci % 8;
    return { x: x0 + 1.5 + (ci < 8 ? -2.4 : 2.4) + ((k % 4) - 1.5) * 1.05, z: RAIL_Z + (k < 4 ? 0.6 : -0.6), y: 0.95 };
  }
  const x0 = t.door >= 0 ? doorX0(t.door) : 0;
  return { x: x0 + 1.5 + (ci % 2 ? 0.55 : -0.55), z: DOCK_Z + 1.55 + Math.floor(ci / 2) * 1.0, y: 0.55 };
}

const truckAccess = (t: Truck | undefined): [number, number] | null => (t && t.door >= 0 ? (t.rail ? [RAIL_DOORS[t.door] + 1, 1] : [doorX0(t.door) + 1, DOCK_Z]) : null);
function destAccess(s: State, d: Dest): [number, number] | null {
  if (d.k === "slot") return access(s, s.slots[d.id]);
  return truckAccess(s.trucks.find((x) => x.id === d.id));
}
function sourceAccess(s: State, p: Pallet): [number, number] | null {
  if (p.loc === "slot") return access(s, s.slots[p.ref]);
  return truckAccess(s.trucks.find((x) => x.id === p.ref));
}

function claim(s: State, f: Forklift, kind: JobKind, p: Pallet, to: Dest) {
  p.busy = f.id;
  if (to.k === "slot") s.slots[to.id].res = p.id;
  else {
    const t = s.trucks.find((x) => x.id === to.id)!;
    t.cargo[to.ci] = -2;
  }
  f.job = { kind, pallet: p.id, to };
  const a = sourceAccess(s, p)!;
  f.path = route(s, f.x, f.z, a[0], a[1]);
  f.phase = "go1";
  f.t = 0;
}

/** Find the most urgent job for an idle forklift. */
function findJob(s: State, f: Forklift): boolean {
  const near = (ps: Pallet[]) => {
    let best: Pallet | null = null;
    let bd = Infinity;
    for (const p of ps) {
      if (!sourceAccess(s, p)) continue;
      const q = palletPos(s, p);
      const d = dist(q.x, q.z, f.x, f.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  };
  const docked = s.trucks.filter((t) => t.state === "docked");
  // 1 · Load trucks at the doors.
  for (const t of docked) {
    if (t.dir !== "out") continue;
    const o = s.orders.find((x) => x.id === t.ref);
    if (!o) continue;
    const ci = t.cargo.indexOf(-1);
    if (ci < 0) continue;
    const staged = Object.values(s.pallets).filter((p) => p.order === o.id && p.busy < 0 && p.loc === "slot" && s.slots[p.ref].kind === "stage");
    const p = near(staged);
    if (p) {
      claim(s, f, "load", p, { k: "truck", id: t.id, ci });
      return true;
    }
  }
  // 2 · Unload inbound trucks.
  for (const t of docked) {
    if (t.dir !== "in") continue;
    const ps = t.cargo.filter((id) => id >= 0).map((id) => s.pallets[id]).filter((p) => p && p.busy < 0);
    if (!ps.length) continue;
    // Front of the trailer first.
    ps.sort((a, b) => a.ci - b.ci);
    const p = ps[0];
    // Cross-docking: straight onto the lane of an order that needs it.
    if (up(s, "crossdock")) {
      const o = s.orders
        .filter((o) => (o.state === "confirmed" || o.state === "picked" || o.state === "loading") && o.door >= 0)
        .sort((a, b) => a.due - b.due)
        .find((o) => o.lines.some((l) => l.item === p.item && Object.values(s.pallets).filter((q) => q.order === o.id && q.item === l.item).length < l.n));
      const lane = o ? s.doors[o.door].stage.map((id) => s.slots[id]).find(freeSlot) : undefined;
      if (o && lane) {
        p.order = o.id;
        claim(s, f, "unload", p, { k: "slot", id: lane.id });
        return true;
      }
    }
    const [ax, az] = truckAccess(t)!;
    const dst = nearestStore(s, ax, az, up(s, "slotting"), p.item) ?? (t.rail ? null : (s.slots.find((sl) => s.doors[t.door].stage.includes(sl.id) && freeSlot(sl)) ?? null));
    if (!dst) continue;
    claim(s, f, "unload", p, { k: "slot", id: dst.id });
    return true;
  }
  // 3 · Clear machine outputs before they block the line.
  for (const t of s.structs) {
    if (t.dead || !t.m) continue;
    for (const id of t.slots) {
      const sl = s.slots[id];
      if (sl.kind !== "out" || sl.pallet < 0) continue;
      const p = s.pallets[sl.pallet];
      if (p.busy >= 0) continue;
      // Straight to a machine that needs it, if one does.
      const feed = feedTarget(s, p.item);
      const dst = feed ?? nearestStore(s, sl.x, sl.z, true, p.item);
      if (!dst) continue;
      claim(s, f, feed ? "feed" : "output", p, { k: "slot", id: dst.id });
      return true;
    }
  }
  // 4 · Pick orders onto their doors' lanes, earliest deadline first.
  const picking = s.orders.filter((o) => (o.state === "confirmed" || o.state === "picked" || o.state === "loading") && o.door >= 0).sort((a, b) => a.due - b.due);
  for (const o of picking) {
    const door = s.doors[o.door];
    const lane = door.stage.map((id) => s.slots[id]).filter(freeSlot);
    if (!lane.length) continue;
    for (const line of o.lines) {
      const have = Object.values(s.pallets).filter((p) => p.order === o.id && p.item === line.item).length;
      if (have >= line.n) continue;
      const av = available(s, line.item);
      // First in, first out (by lot) unless slotting says nearest.
      const p = up(s, "slotting") || up(s, "wms") ? near(av) : av.filter((q) => sourceAccess(s, q)).sort((a, b) => a.born - b.born)[0];
      if (!p) continue;
      p.order = o.id;
      claim(s, f, "pick", p, { k: "slot", id: lane[0].id });
      return true;
    }
  }
  // 5 · Feed machines.
  for (const t of s.structs) {
    if (t.dead || !t.m || !t.m.on || t.m.state === "broken" || t.m.state === "repair") continue;
    const r = MACHINES[t.m.type].recipes[t.m.recipe];
    for (const item of r.inputs) {
      const dst = feedSlot(s, t, item);
      if (!dst) continue;
      const av = available(s, item);
      const p = av.filter((q) => sourceAccess(s, q)).sort((a, b) => a.born - b.born)[0];
      if (!p) continue;
      claim(s, f, "feed", p, { k: "slot", id: dst.id });
      return true;
    }
  }
  // 6 · Put away whatever's left on the lanes, and inputs a machine no longer uses.
  for (const sl of s.slots) {
    if (sl.dead || sl.pallet < 0) continue;
    const p = s.pallets[sl.pallet];
    if (p.busy >= 0) continue;
    let stray = false;
    if (sl.kind === "stage" && p.order < 0) stray = true;
    if (sl.kind === "in") {
      const t = s.structs[sl.owner];
      stray = !MACHINES[t.m!.type].recipes[t.m!.recipe].inputs.includes(p.item);
    }
    // Frozen pallets out of the cold go back in a freezer if one has room.
    const coldFree = () => s.slots.some((x) => x.cold && freeSlot(x) && !x.dead);
    if (!stray && ITEMS[p.item].frozen && sl.kind === "store" && !sl.cold && coldFree()) stray = true;
    if (!stray) continue;
    const dst = nearestStore(s, sl.x, sl.z, true, p.item);
    if (!dst) continue;
    claim(s, f, "putaway", p, { k: "slot", id: dst.id });
    return true;
  }
  return false;
}

/** A free input slot on machine `t` for `item`, if the machine wants more of it. */
function feedSlot(s: State, t: Struct, item: ItemId): Slot | null {
  const m = t.m!;
  const r = MACHINES[m.type].recipes[m.recipe];
  if (!r.inputs.includes(item)) return null;
  const ins = t.slots.map((id) => s.slots[id]).filter((sl) => sl.kind === "in");
  const target = Math.max(1, Math.floor(ins.length / r.inputs.length));
  let have = 0;
  for (const sl of ins) {
    if (sl.pallet >= 0 && s.pallets[sl.pallet].item === item) have++;
    if (sl.res >= 0 && s.pallets[sl.res]?.item === item) have++;
  }
  if (have >= target) return null;
  // Leave room for the other inputs.
  const freeIns = ins.filter(freeSlot);
  const others = r.inputs.filter((i) => i !== item);
  const othersMissing = others.filter((o) => !ins.some((sl) => (sl.pallet >= 0 && s.pallets[sl.pallet].item === o) || (sl.res >= 0 && s.pallets[sl.res]?.item === o))).length;
  if (freeIns.length <= othersMissing) return null;
  return freeIns[0] ?? null;
}

function feedTarget(s: State, item: ItemId): Slot | null {
  for (const t of s.structs) {
    if (t.dead || !t.m || !t.m.on || t.m.state === "broken") continue;
    const sl = feedSlot(s, t, item);
    if (sl) return sl;
  }
  return null;
}

function moveAlong(s: State, f: Forklift, step: number) {
  while (step > 0 && f.path.length) {
    const [tx, tz] = f.path[0];
    const dx = tx - f.x;
    const dz = tz - f.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) {
      f.path.shift();
      continue;
    }
    f.dir = Math.atan2(dx, dz);
    const m = Math.min(d, step);
    f.x += (dx / d) * m;
    f.z += (dz / d) * m;
    f.dist += m;
    f.battery = Math.max(0, f.battery - m * BATTERY_PER_TILE * drainFactor(s));
    step -= m;
    if (m >= d) f.path.shift();
  }
  return f.path.length === 0;
}

function faceTo(f: Forklift, x: number, z: number) {
  const dx = x - f.x;
  const dz = z - f.z;
  if (Math.abs(dx) + Math.abs(dz) > 0.05) f.dir = Math.atan2(dx, dz);
}

function abandon(s: State, f: Forklift) {
  const j = f.job;
  if (!j) return;
  const p = s.pallets[j.pallet];
  if (j.to.k === "slot") {
    const sl = s.slots[j.to.id];
    if (sl.res === j.pallet) sl.res = -1;
  } else {
    const t = s.trucks.find((x) => x.id === (j.to as { id: number }).id);
    if (t && t.cargo[j.to.ci] === -2) t.cargo[j.to.ci] = -1;
  }
  if (p) {
    p.busy = -1;
    if (j.kind === "pick" && p.loc !== "fork") p.order = -1;
  }
  f.job = null;
  f.phase = "idle";
  f.path = [];
}

function stepFork(s: State, f: Forklift, dt: number) {
  const j = f.job;
  const speed = forkSpeed(s, f);
  const liftTo = (y: number) => {
    const d = y - f.lift;
    f.lift += Math.sign(d) * Math.min(Math.abs(d), dt * 0.12);
  };
  switch (f.phase) {
    case "idle":
    case "park": {
      liftTo(0);
      if (f.phase === "park" && moveAlong(s, f, speed * dt)) f.phase = "idle";
      if (s.time - f.looked < 2) return;
      f.looked = s.time;
      // Low battery: off to a charger (or a slow top-up where it stands if there isn't one).
      if (f.battery < 0.22) {
        const cp = freeChargePoint(s, f);
        if (cp) {
          f.charger = cp[0];
          f.path = route(s, f.x, f.z, cp[1], cp[2]);
          f.phase = "charge";
          return;
        }
        if (!s.structs.some((t) => !t.dead && t.kind === "charger") && f.battery < 0.05) {
          f.battery = Math.min(1, f.battery + 0.004);
          if (!s.alerts.some((a) => a.text.startsWith("Build a charging bay") && s.time - a.t < 4 * HOUR)) alert(s, "warn", "Build a charging bay: forklift batteries are flat");
        }
      }
      if (findJob(s, f)) return;
      // Nothing to do: wait on the aisle, out of the way.
      if (f.phase === "idle") {
        const px = 2 + ((f.id * 4) % Math.max(4, width(s) - 3)) + 0.5;
        const pz = AISLE_Z[f.id % 2] + 0.5;
        if (Math.abs(f.x - px) + Math.abs(f.z - pz) > 0.2) {
          f.path = route(s, f.x, f.z, Math.floor(px), Math.floor(pz));
          f.phase = "park";
        }
      }
      return;
    }
    case "charge": {
      liftTo(0);
      if (!moveAlong(s, f, speed * dt)) return;
      const t = s.structs[Math.floor(f.charger / 2)];
      if (!t || t.dead) {
        f.charger = -1;
        f.phase = "idle";
        return;
      }
      faceTo(f, f.x, f.z - 1);
      f.dir = Math.PI;
      f.battery = Math.min(1, f.battery + CHARGE_RATE * (up(s, "fastcharge") ? 2 : 1) * dt);
      if (f.battery >= 0.995) {
        f.charger = -1;
        f.phase = "idle";
        f.looked = -99;
        s.stats.charges++;
      }
      return;
    }
    case "go1":
    case "go2": {
      if (!j) {
        f.phase = "idle";
        return;
      }
      liftTo(f.phase === "go2" ? 0.3 : 0);
      if (!moveAlong(s, f, speed * dt)) return;
      const p = s.pallets[j.pallet];
      if (!p) {
        abandon(s, f);
        return;
      }
      if (f.phase === "go1") {
        const q = palletPos(s, p);
        faceTo(f, q.x, q.z);
        f.phase = "pick";
      } else {
        const tr = j.to.k === "truck" ? s.trucks.find((t) => t.id === (j.to as { id: number }).id) : undefined;
        if (j.to.k === "truck" && !tr) {
          abandon(s, f);
          return;
        }
        const q = j.to.k === "slot" ? { ...slotPos(s.slots[j.to.id]), y: s.slots[j.to.id].y } : cargoPos(s, tr!, (j.to as { ci: number }).ci);
        faceTo(f, q.x, q.z);
        f.phase = "drop";
      }
      f.t = 0;
      return;
    }
    case "pick": {
      if (!j) return void (f.phase = "idle");
      const p = s.pallets[j.pallet];
      const q = palletPos(s, p);
      liftTo(q.y);
      f.t += dt;
      if (f.t < handleTime(s, p.loc === "truck")) return;
      drain(s, f, BATTERY_PER_LIFT);
      // Take it.
      if (p.loc === "slot") s.slots[p.ref].pallet = -1;
      else {
        const t = s.trucks.find((x) => x.id === p.ref);
        if (t) t.cargo[p.ci] = -1;
      }
      p.loc = "fork";
      p.ref = f.id;
      p.ci = -1;
      const a = destAccess(s, j.to);
      if (!a) {
        // The destination went away: put it in storage instead.
        const dst = nearestStore(s, f.x, f.z, true, p.item);
        if (j.to.k === "slot" && s.slots[j.to.id].res === p.id) s.slots[j.to.id].res = -1;
        if (!dst) return;
        dst.res = p.id;
        j.to = { k: "slot", id: dst.id };
        const a2 = access(s, dst)!;
        f.path = route(s, f.x, f.z, a2[0], a2[1]);
      } else f.path = route(s, f.x, f.z, a[0], a[1]);
      f.phase = "go2";
      return;
    }
    case "drop": {
      if (!j) return void (f.phase = "idle");
      const p = s.pallets[j.pallet];
      const toTruck = j.to.k === "truck";
      const tr = j.to.k === "truck" ? s.trucks.find((t) => t.id === (j.to as { id: number }).id) : undefined;
      const y = j.to.k === "slot" ? s.slots[j.to.id].y : tr?.rail ? 0.95 : 0.55;
      liftTo(y);
      f.t += dt;
      if (f.t < handleTime(s, toTruck)) return;
      if (j.to.k === "slot") {
        const sl = s.slots[j.to.id];
        sl.pallet = p.id;
        sl.res = -1;
        p.loc = "slot";
        p.ref = sl.id;
      } else {
        const t = s.trucks.find((x) => x.id === j.to.id)!;
        t.cargo[j.to.ci] = p.id;
        p.loc = "truck";
        p.ref = t.id;
        p.ci = j.to.ci;
      }
      p.busy = -1;
      drain(s, f, BATTERY_PER_LIFT);
      if (j.kind === "unload") s.today.received++;
      s.stats.moves++;
      s.today.moves++;
      f.trips++;
      f.job = null;
      f.phase = "idle";
      f.looked = -99;
      return;
    }
  }
}

/* ------------------------------------------------------------------ trucks */

function newTruck(s: State, dir: "in" | "out", ref: number, eta: number, cap = 12, rail = false): Truck {
  if (eventOn(s, "storm")) eta += HOUR;
  const t: Truck = {
    id: nid(s), plate: rail ? `TRN-${400 + ri(s, 0, 499)}` : `TRK-${PLATE_BASE + ri(s, 0, 7999)}`, carrier: ri(s, 0, CARRIERS.length - 1), dir, state: "transit", t: 0, eta, door: -1, cap,
    cargo: new Array(cap).fill(-1), ref, arrived: -1, docked: -1, ...(rail ? { rail: true } : {}),
  };
  if (t.carrier === OWN_CARRIER) t.carrier = 0;
  s.trucks.push(t);
  return t;
}

function freeDoorFor(s: State, t: Truck): number {
  if (t.rail) {
    if (!s.rail) return -1;
    for (let k = 0; k < RAIL_DOORS.length; k++) if (!s.trucks.some((o) => o.rail && o !== t && o.door === k && ["arriving", "docked", "leaving"].includes(o.state))) return k;
    return -1;
  }
  if (t.dir === "out") {
    const o = s.orders.find((x) => x.id === t.ref);
    if (!o) return -1;
    if (o.door < 0) assignDoor(s, o);
    return o.door >= 0 && s.doors[o.door].truck < 0 ? o.door : -1;
  }
  const d = s.doors.find((d) => (d.type === "in" || d.type === "flex") && d.truck < 0 && d.order < 0);
  return d ? d.i : -1;
}

function stepTruck(s: State, t: Truck, dt: number) {
  switch (t.state) {
    case "transit":
      if (s.time < t.eta) return;
      t.arrived = s.time;
      t.state = "queued";
      return;
    case "queued": {
      const d = freeDoorFor(s, t);
      if (d < 0) return;
      t.door = d;
      if (!t.rail) s.doors[d].truck = t.id;
      t.state = "arriving";
      t.t = 0;
      return;
    }
    case "arriving":
    case "backing":
      t.t += dt;
      if (t.t >= TRUCK_PHASE) {
        t.t = 0;
        if (t.state === "arriving" && !t.rail) t.state = "backing";
        else {
          t.state = "docked";
          t.docked = s.time;
          if (t.dir === "out") {
            const o = s.orders.find((x) => x.id === t.ref);
            if (o && (o.state === "confirmed" || o.state === "picked")) o.state = "loading";
          }
        }
      }
      return;
    case "docked": {
      if (t.dir === "in") {
        if (t.cargo.every((c) => c === -1)) {
          leave(s, t);
          const po = s.pos.find((p) => p.id === t.ref);
          if (po) po.done = true;
          s.stats.unloaded++;
          s.today.unloads++;
          if (t.rail) s.stats.trains++;
          alert(s, "info", `${t.plate} unloaded at ${t.rail ? `Rail ${t.door + 1}` : doorName(s, t.door)}`, { k: "truck", id: t.id });
        }
        return;
      }
      const o = s.orders.find((x) => x.id === t.ref);
      if (!o) return leave(s, t);
      const loaded = t.cargo.filter((c) => c >= 0).length;
      if (loaded >= o.total && !t.cargo.includes(-2)) {
        // Away it goes.
        for (const id of t.cargo) if (id >= 0) delete s.pallets[id];
        t.cargo.fill(-1);
        o.state = "transit";
        o.departed = s.time;
        // Carriers take their cut; your own trucks don't.
        if (t.own === undefined) {
          const fee = Math.round(o.value * CARRIER_FEE);
          spend(s, fee, "carriers");
        }
        o.delivers = s.time + o.transit * MIN * (up(s, "express") ? 0.75 : 1);
        s.doors[o.door].order = -1;
        o.door = -1;
        s.today.shipped += o.total;
        leave(s, t);
        alert(s, "info", `#${o.code} left for ${o.city}`, { k: "order", id: o.id });
      }
      return;
    }
    case "leaving":
      t.t += dt;
      if (t.t >= TRUCK_PHASE) t.state = "gone";
      return;
  }
}

function leave(s: State, t: Truck) {
  if (!t.rail && t.door >= 0 && s.doors[t.door].truck === t.id) s.doors[t.door].truck = -1;
  t.state = "leaving";
  t.t = 0;
}

export const doorName = (s: State, i: number) => {
  const d = s.doors[i];
  if (!d) return "—";
  const same = s.doors.filter((x) => x.type === d.type && x.i <= i).length;
  return d.type === "in" ? `In ${same}` : d.type === "out" ? `Bay ${same}` : `Flex ${same}`;
};

export function setDoorType(s: State, i: number, type: DoorType): string | null {
  const d = s.doors[i];
  if (!d) return "No such door";
  if (d.truck >= 0 || d.order >= 0) return "Wait until the door is clear";
  d.type = type;
  return null;
}

/* ------------------------------------------------------------------ orders */

function makeOrder(s: State, o: { customer: string; city: string; lines: { item: ItemId; n: number }[]; due: number; rush: boolean; vip?: boolean }): Order {
  const city = CITIES.find((c) => c.name === o.city) ?? CITIES[0];
  const total = o.lines.reduce((a, l) => a + l.n, 0);
  const prem = 0.97 + rand(s) * 0.15;
  const base = o.lines.reduce((a, l) => a + ITEMS[l.item].price * marketOf(s, l.item) * l.n * (eventOn(s, "boom") && HIGH_TECH.includes(l.item) ? 1.2 : 1), 0);
  const loyal = [1, 1.03, 1.06, 1.1][loyalty(s, o.customer)];
  const value = Math.round(
    base * prem * loyal * (up(s, "sales") ? 1.06 : 1) * (up(s, "quality") ? 1.05 : 1) * (eventOn(s, "rush") ? 1.1 : 1) * (o.rush ? 1.25 : 1) * (o.vip ? 1.5 : 1),
  );
  const order: Order = {
    id: nid(s), code: `SHP-${78000 + ri(s, 100, 999) + s.orders.length * 7}`, customer: o.customer, city: city.name, lines: o.lines, total, value,
    offered: s.time, expires: s.time + ri(s, 45, 80) * MIN, due: o.due, transit: city.transit, state: "offer", door: -1, truck: -1, departed: -1, delivers: -1, rush: o.rush, paid: 0,
    ...(o.vip ? { vip: true } : {}),
  };
  s.orders.push(order);
  return order;
}

/** A customer asks for something. */
export function offer(s: State) {
  const cust = pick(s, CUSTOMERS);
  const city = pick(s, CITIES);
  const mix = mixOf(s);
  const pool = cust.likes.filter((i) => mix.includes(i));
  const items = pool.length ? pool : mix;
  const d = day(s.time);
  // Loyal customers order a little more.
  const maxN = Math.min(8, 2 + d + (loyalty(s, cust.name) >= 2 ? 1 : 0));
  const lines: { item: ItemId; n: number }[] = [{ item: pick(s, items), n: ri(s, 1, maxN) }];
  if (rand(s) < 0.3 && items.length > 1) {
    const other = items.find((i) => i !== lines[0].item)!;
    lines.push({ item: other, n: ri(s, 1, Math.max(1, maxN - 2)) });
  }
  const vip = rand(s) < (up(s, "vip") ? 0.12 : 0.05);
  const rush = !vip && rand(s) < 0.15;
  const due = s.time + city.transit * MIN + (rush ? ri(s, 80, 110) : vip ? ri(s, 110, 170) : ri(s, 160, 320)) * MIN;
  return makeOrder(s, { customer: cust.name, city: city.name, lines, due, rush, vip });
}

function assignDoor(s: State, o: Order) {
  // Contract shipments far in the future don't hold a door yet.
  if (o.due - s.time > o.transit * MIN + 8 * HOUR) return;
  const d = s.doors.find((d) => (d.type === "out" || d.type === "flex") && d.order < 0 && (d.truck < 0 || d.truck === o.truck) && d.stage.every((id) => freeSlot(s.slots[id])));
  if (!d) return;
  d.order = o.id;
  o.door = d.i;
}

export function accept(s: State, id: number): string | null {
  const o = s.orders.find((x) => x.id === id);
  if (!o || o.state !== "offer") return "That offer has gone";
  confirm(s, o);
  return null;
}

function confirm(s: State, o: Order) {
  o.state = "confirmed";
  // Book the collection in time to make the deadline, with a margin.
  const eta = Math.max(s.time + 35 * MIN, o.due - o.transit * MIN * (up(s, "express") ? 0.75 : 1) - 100 * MIN);
  const t = newTruck(s, "out", o.id, eta, 12);
  // One of your own trucks if one is back at the depot.
  const own = up(s, "depot") ? s.ownTrucks.find((x) => x.free <= s.time) : undefined;
  if (own) {
    own.free = OUT_ON_JOB;
    t.own = own.id;
    t.carrier = OWN_CARRIER;
    t.plate = own.name;
    o.own = own.id;
  }
  o.truck = t.id;
  assignDoor(s, o);
}

/* ------------------------------------------------------------------ contracts */

/** A customer offers a run of shipments of one item, with a bonus if every one is on time. */
export function offerContract(s: State) {
  const def = siteDef(s.site);
  void def;
  const mix = mixOf(s);
  const cust = pick(s, CUSTOMERS);
  const items = cust.likes.filter((i) => mix.includes(i));
  const item = pick(s, items.length ? items : mix);
  const city = pick(s, CITIES);
  const n = ri(s, 2, 5);
  const count = ri(s, 3, 6);
  const every = pick(s, [6, 8, 12]);
  const value = ITEMS[item].price * n * count;
  const c: Contract = {
    id: nid(s), customer: cust.name, city: city.name, item, n, count, every, bonus: Math.round((value * 0.25) / 100) * 100,
    state: "offer", expires: s.time + 3 * HOUR, orders: [], onTime: 0, late: 0,
  };
  s.contracts.push(c);
  alert(s, "info", `Contract offered: ${cust.name} wants ${count} shipments of ${n} × ${ITEMS[item].name}`);
  return c;
}

export function acceptContract(s: State, id: number): string | null {
  const c = s.contracts.find((x) => x.id === id);
  if (!c || c.state !== "offer") return "That contract has gone";
  c.state = "active";
  const city = CITIES.find((x) => x.name === c.city) ?? CITIES[0];
  for (let k = 0; k < c.count; k++) {
    const due = s.time + city.transit * MIN + 5 * HOUR + k * c.every * HOUR;
    const o = makeOrder(s, { customer: c.customer, city: c.city, lines: [{ item: c.item, n: c.n }], due, rush: false });
    o.value = Math.round(o.value * 1.1);
    o.contract = c.id;
    c.orders.push(o.id);
    confirm(s, o);
  }
  return null;
}

export function declineContract(s: State, id: number) {
  const c = s.contracts.find((x) => x.id === id);
  if (c && c.state === "offer") c.state = "declined";
}

function contractResult(s: State, o: Order, onTime: boolean) {
  const c = s.contracts.find((x) => x.id === o.contract);
  if (!c || c.state !== "active") return;
  if (onTime) c.onTime++;
  else c.late++;
  if (c.onTime + c.late < c.count) return;
  if (c.late === 0) {
    c.state = "done";
    earn(s, c.bonus, "rewards");
    s.stats.contractsDone++;
    s.rep = Math.min(100, s.rep + 5);
    alert(s, "good", `Contract with ${c.customer} complete, all on time: +$${c.bonus.toLocaleString("en-US")} bonus`);
  } else {
    c.state = "failed";
    alert(s, "warn", `Contract with ${c.customer} finished with ${c.late} late or cancelled: no bonus`);
  }
}

export function decline(s: State, id: number) {
  const o = s.orders.find((x) => x.id === id);
  if (o && o.state === "offer") o.state = "declined";
}

/** Give up on an order: a penalty, and everything picked goes back. */
export function cancel(s: State, id: number, why: "player" | "late" = "player") {
  const o = s.orders.find((x) => x.id === id);
  if (!o || !["confirmed", "picked", "loading"].includes(o.state)) return;
  o.state = "failed";
  const fee = Math.round(o.value * 0.2);
  spend(s, fee, "penalties");
  s.rep = Math.max(0, s.rep - 6);
  s.stats.failed++;
  s.history.push(false);
  contractResult(s, o, false);
  if (o.own !== undefined) {
    const own = s.ownTrucks.find((x) => x.id === o.own);
    if (own) own.free = s.time;
  }
  for (const p of Object.values(s.pallets)) if (p.order === o.id) p.order = -1;
  // Anything already in the trailer comes back off.
  const t = s.trucks.find((x) => x.id === o.truck);
  if (t) {
    for (let ci = 0; ci < t.cargo.length; ci++) {
      const id = t.cargo[ci];
      if (id < 0) continue;
      const p = s.pallets[id];
      const sl = s.doors[o.door]?.stage.map((i) => s.slots[i]).find(freeSlot) ?? s.slots.find((x) => x.kind === "store" && freeSlot(x));
      if (sl) {
        sl.pallet = p.id;
        p.loc = "slot";
        p.ref = sl.id;
        p.ci = -1;
        t.cargo[ci] = -1;
      }
    }
    for (const f of s.forks) if (f.job?.to.k === "truck" && f.job.to.id === t.id) abandon(s, f);
    if (t.state === "transit" || t.state === "queued") t.state = "gone";
    else if (t.state !== "leaving" && t.state !== "gone") leave(s, t);
  }
  if (o.door >= 0) s.doors[o.door].order = -1;
  o.door = -1;
  alert(s, "bad", why === "late" ? `#${o.code} cancelled by ${o.customer}: too late ($${fee.toLocaleString("en-US")} penalty)` : `#${o.code} cancelled ($${fee.toLocaleString("en-US")} penalty)`, { k: "order", id: o.id });
}

/** Send for the truck now (costs a call-out fee). */
export function callTruck(s: State, id: number): string | null {
  const o = s.orders.find((x) => x.id === id);
  if (!o) return "No such order";
  const t = s.trucks.find((x) => x.id === o.truck);
  if (!t || t.state !== "transit") return "The truck's already here";
  t.eta = Math.min(t.eta, s.time + 15 * MIN);
  spend(s, 150, "penalties");
  return null;
}

/** How much of an order is picked, staged and loaded. */
export function orderProgress(s: State, o: Order) {
  let assigned = 0;
  let staged = 0;
  let loaded = 0;
  for (const p of Object.values(s.pallets)) {
    if (p.order !== o.id) continue;
    assigned++;
    if (p.loc === "slot" && s.slots[p.ref].kind === "stage") staged++;
    if (p.loc === "truck") loaded++;
  }
  if (o.state === "transit" || o.state === "delivered") loaded = o.total;
  const short = o.lines.map((l) => ({ item: l.item, n: Math.max(0, l.n - Object.values(s.pallets).filter((p) => p.order === o.id && p.item === l.item).length - availableCount(s, l.item)) })).filter((x) => x.n > 0);
  return { assigned, staged, loaded, picked: staged + loaded, short };
}

/** The five stages of the shipment tracker. */
export const TRACK_STAGES = ["Order Confirmed", "Picked", "Loading", "In Transit", "Delivered"] as const;
export function trackStage(s: State, o: Order) {
  if (o.state === "delivered") return 4;
  if (o.state === "transit") return 3;
  const pr = orderProgress(s, o);
  if (o.state === "loading" || pr.loaded > 0) return 2;
  if (pr.picked >= o.total) return 1;
  return 0;
}

function stepOrders(s: State) {
  for (const o of s.orders) {
    if (o.state === "offer" && s.time > o.expires) o.state = "declined";
    if ((o.state === "confirmed" || o.state === "picked" || o.state === "loading") && o.door < 0) assignDoor(s, o);
    if (o.state === "confirmed") {
      const pr = orderProgress(s, o);
      if (pr.picked >= o.total) o.state = "picked";
    }
    if ((o.state === "confirmed" || o.state === "picked" || o.state === "loading") && s.time > o.due + 3 * HOUR) cancel(s, o.id, "late");
    if (o.state === "transit" && s.time >= o.delivers) {
      o.state = "delivered";
      o.onTime = o.delivers <= o.due;
      const pay = Math.round(o.value * (o.onTime ? 1 : up(s, "insurance") ? 0.75 : 0.6));
      o.paid = pay;
      earn(s, pay, "revenue");
      pop(s, pay, `#${o.code}`);
      s.stats.delivered++;
      s.today.orders++;
      const cu = (s.customers[o.customer] ??= { onTime: 0, late: 0 });
      const before = loyalty(s, o.customer);
      if (o.onTime) cu.onTime += up(s, "care") ? 2 : 1;
      else cu.late++;
      const after = loyalty(s, o.customer);
      if (after > before) alert(s, "good", `${o.customer} is now a ${LOYALTY[after]} customer: bigger orders and better prices`);
      if (o.lines.some((l) => ITEMS[l.item].frozen)) s.stats.coldShipped++;
      if (o.own !== undefined) {
        s.stats.ownShipped++;
        const own = s.ownTrucks.find((x) => x.id === o.own);
        if (own) {
          own.free = s.time + o.transit * MIN * (up(s, "express") ? 0.75 : 1);
          own.trips++;
        }
      }
      if (o.vip && o.onTime) s.stats.vipOnTime++;
      s.history.push(o.onTime);
      if (s.history.length > 30) s.history.shift();
      if (o.onTime) {
        s.stats.onTime++;
        s.today.onTime++;
        if (o.rush) s.stats.rushOnTime++;
        s.rep = Math.min(100, s.rep + (o.vip ? 6 : o.rush ? 3 : 1.5));
      } else {
        s.stats.late++;
        s.today.late++;
        s.rep = Math.max(0, s.rep - (o.vip ? 8 : 4));
      }
      contractResult(s, o, o.onTime);
      alert(s, o.onTime ? "good" : "warn", `#${o.code} delivered to ${o.customer}, ${o.city}${o.onTime ? "" : " (late)"}: +$${pay.toLocaleString("en-US")}`, { k: "order", id: o.id });
    }
  }
  // Keep the books short.
  const old = s.orders.filter((o) => (o.state === "delivered" || o.state === "failed" || o.state === "declined") && s.time - (o.delivers > 0 ? o.delivers : o.offered) > 12 * HOUR);
  if (old.length) s.orders = s.orders.filter((o) => !old.includes(o));
  for (const c of s.contracts) if (c.state === "offer" && s.time > c.expires) c.state = "declined";
  s.contracts = s.contracts.filter((c) => c.state === "offer" || c.state === "active" || s.time - c.expires < 24 * HOUR);
  s.trucks = s.trucks.filter((t) => t.state !== "gone");
}

/* ------------------------------------------------------------------ purchasing */

/** What a pallet costs today. */
export const unitCost = (s: State, item: ItemId, rail = false) => buyPrice(item) * marketOf(s, item) * (up(s, "buyer") ? 0.92 : 1) * (eventOn(s, "strike") ? 1.15 : 1) * (rail ? 0.9 : 1);
export const purchaseCost = (s: State, item: ItemId, n: number, rail = false) => Math.round(unitCost(s, item, rail) * n + (rail ? 60 : 120));

/** Order stock from a supplier: a truck (or, with the rail siding, a train) brings it in. */
export function buy(s: State, item: ItemId, n: number, free = false, rail = false): PO | null {
  if (rail && !s.rail) return null;
  n = Math.max(1, Math.min(rail ? RAIL_CAP : 12, Math.round(n)));
  const cost = free ? 0 : purchaseCost(s, item, n, rail);
  if (!free && s.cash < cost) return null;
  if (!free) {
    spend(s, cost, "purchases");
    pop(s, -cost, `${n} × ${ITEMS[item].name}`);
  }
  const sup = supplierFor(item);
  const po: PO = { id: nid(s), code: `PO-${1200 + s.pos.length + 1}`, supplier: sup.name, item, n, cost, ordered: s.time, truck: -1, done: false };
  s.pos.push(po);
  const lead = ri(s, sup.lead[0], sup.lead[1]) * (rail ? 1.5 : 1) * (eventOn(s, "strike") ? 2 : 1);
  const t = newTruck(s, "in", po.id, s.time + lead * MIN, rail ? RAIL_CAP : 12, rail);
  for (let i = 0; i < n; i++) {
    const p = newPallet(s, item);
    p.loc = "truck";
    p.ref = t.id;
    p.ci = i;
    t.cargo[i] = p.id;
  }
  po.truck = t.id;
  return po;
}

/** Pallets of an item already on their way in. */
export function incoming(s: State, item: ItemId) {
  let n = 0;
  for (const t of s.trucks) if (t.dir === "in" && t.state !== "gone" && t.state !== "leaving") for (const id of t.cargo) if (id >= 0 && s.pallets[id]?.item === item) n++;
  return n;
}

export function setAuto(s: State, item: ItemId, min: number, qty: number) {
  if (min <= 0) delete s.auto[item];
  else s.auto[item] = { min, qty: Math.max(1, Math.min(12, qty)) };
}

function stepAuto(s: State) {
  for (const [item, rule] of Object.entries(s.auto) as [ItemId, { min: number; qty: number }][]) {
    if (stock(s, item) + incoming(s, item) >= rule.min) continue;
    // Autopilot: by rail when the siding's there, and never below $5,000.
    const rail = up(s, "autopilot") && s.rail;
    if (up(s, "autopilot") && s.cash - purchaseCost(s, item, rule.qty, rail) < 5_000) continue;
    if (buy(s, item, rule.qty, false, rail)) alert(s, "info", `Auto-replenish: ${rule.qty} × ${ITEMS[item].name} ordered${rail ? " by rail" : ""}`);
  }
}

/* ------------------------------------------------------------------ machines */

const cycleTime = (s: State, t: Struct) =>
  MACHINES[t.m!.type].recipes[t.m!.recipe].secs *
  (up(s, "lean") ? 0.8 : 1) *
  (up(s, "robotics") && (t.m!.type === "assembly" || t.m!.type === "robot") ? 0.7 : 1) *
  (t.m!.mk === 2 ? 0.75 : 1);
export const cycleSecs = cycleTime;

function stepMachine(s: State, t: Struct, dt: number) {
  const m = t.m!;
  const def = MACHINES[m.type];
  const r = def.recipes[m.recipe];
  const slots = t.slots.map((id) => s.slots[id]);
  // No power, no production.
  if (eventOn(s, "power") && m.state !== "broken" && m.state !== "repair") return;
  switch (m.state) {
    case "running": {
      m.t += dt;
      if (m.t < cycleTime(s, t)) return;
      const sl = s.slots[m.outSlot];
      const p = newPallet(s, r.output);
      sl.pallet = p.id;
      sl.res = -1;
      p.ref = sl.id;
      m.outSlot = -1;
      m.made++;
      s.stats.made++;
      if (ITEMS[r.output].tier === "goods") {
        s.stats.madeGoods++;
        s.today.made++;
      }
      if (r.output === "phone") s.stats.phones++;
      s.stats.madeItems[r.output] = (s.stats.madeItems[r.output] ?? 0) + 1;
      m.wear = Math.min(1, m.wear + 0.035 * (up(s, "crew") ? 0.6 : 1) * (m.mk === 2 ? 0.8 : 1));
      m.t = 0;
      m.state = "idle";
      if (rand(s) < Math.max(0, m.wear - 0.45) * 0.5) {
        m.state = "broken";
        alert(s, "bad", `${def.name} broke down${up(s, "crew") ? ": the crew is on it" : ""}`, { k: "struct", id: t.id });
      }
      return;
    }
    case "broken":
      if (up(s, "crew")) {
        m.state = "repair";
        m.t = 0;
      }
      return;
    case "repair":
    case "service":
      m.t += dt;
      if (m.t >= (m.state === "repair" ? 25 : 10) * MIN) {
        m.wear = m.state === "repair" ? 0.15 : 0;
        m.state = "idle";
        m.t = 0;
      }
      return;
    default: {
      if (!m.on) {
        m.state = "off";
        return;
      }
      const ins = slots.filter((sl) => sl.kind === "in" && sl.pallet >= 0 && s.pallets[sl.pallet].busy < 0);
      const use: Slot[] = [];
      for (const item of r.inputs) {
        const sl = ins.find((x) => s.pallets[x.pallet].item === item && !use.includes(x));
        if (sl) use.push(sl);
      }
      if (use.length < r.inputs.length) {
        m.state = "starved";
        return;
      }
      const out = slots.find((sl) => sl.kind === "out" && freeSlot(sl));
      if (!out) {
        m.state = "blocked";
        return;
      }
      for (const sl of use) {
        delete s.pallets[sl.pallet];
        sl.pallet = -1;
      }
      out.res = -2;
      m.outSlot = out.id;
      m.state = "running";
      m.t = 0;
    }
  }
}

export function setRecipe(s: State, id: number, recipe: number): string | null {
  const t = s.structs[id];
  if (!t?.m) return "Not a machine";
  if (t.m.state === "running") return "Wait for the cycle to finish";
  t.m.recipe = Math.max(0, Math.min(MACHINES[t.m.type].recipes.length - 1, recipe));
  t.m.state = "idle";
  return null;
}

export function toggleMachine(s: State, id: number) {
  const t = s.structs[id];
  if (!t?.m) return;
  t.m.on = !t.m.on;
  if (t.m.on && t.m.state === "off") t.m.state = "idle";
}

export const REPAIR_COST = 900;
export const mk2Cost = (t: Struct) => Math.round(MACHINES[t.m!.type].cost * 0.6);

/** Rebuild a machine as a Mk II: 25% faster cycles, less wear. */
export function upgradeMachine(s: State, id: number): string | null {
  const t = s.structs[id];
  if (!t?.m) return "Not a machine";
  if (t.m.mk === 2) return "Already a Mk II";
  if (t.m.state === "running") return "Wait for the cycle to finish";
  const cost = mk2Cost(t);
  if (s.cash < cost) return "Not enough cash";
  spend(s, cost, "capex");
  pop(s, -cost, "Mk II");
  t.m.mk = 2;
  alert(s, "good", `${MACHINES[t.m.type].name} rebuilt as a Mk II`, { k: "struct", id });
  return null;
}
export const SERVICE_COST = 350;

export function repair(s: State, id: number): string | null {
  const m = s.structs[id]?.m;
  if (!m || m.state !== "broken") return "It isn't broken";
  const cost = up(s, "insurance") ? 0 : REPAIR_COST;
  if (s.cash < cost) return "Not enough cash";
  spend(s, cost, "upkeep");
  m.state = "repair";
  m.t = 0;
  return null;
}

export function service(s: State, id: number): string | null {
  const m = s.structs[id]?.m;
  if (!m || m.state === "running" || m.state === "broken" || m.state === "repair" || m.state === "service") return "Not now";
  if (s.cash < SERVICE_COST) return "Not enough cash";
  spend(s, SERVICE_COST, "upkeep");
  m.state = "service";
  m.t = 0;
  return null;
}

/* ------------------------------------------------------------------ upgrades */

export function buyUpgrade(s: State, id: UpgradeId): string | null {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return "Unknown";
  if (id !== "door" && up(s, id)) return "Already done";
  if (u.needs && !up(s, u.needs)) return `Needs ${UPGRADES.find((x) => x.id === u.needs)!.name}`;
  if (id === "door" && !doorFits(s, s.doors.length)) return s.mega ? "No room for another door" : s.expanded ? "Open the Mega hall first" : "Expand the site first";
  if (id === "rail") {
    const g = grid(s);
    if (RAIL_DOORS.some((x0) => [0, 1, 2].some((dx) => g[BACK_Z * GRID_W + x0 + dx] !== 0))) return `Clear the back row at bays ${RAIL_DOORS.map((x) => `${x}–${x + 2}`).join(" and ")} first`;
  }
  const cost = id === "door" ? u.cost * (1 + (s.up.door ?? 0) * 0.5) : u.cost;
  if (s.cash < cost) return "Not enough cash";
  spend(s, cost, "capex");
  s.up[id] = (s.up[id] ?? 0) + 1;
  if (id === "door") addDoor(s, "flex");
  if (id === "expand") s.expanded = true;
  if (id === "mega") s.mega = true;
  if (id === "rail") s.rail = true;
  if (id === "wms") s.rep = Math.min(100, s.rep + 5);
  if (id === "brand") s.rep = Math.min(100, s.rep + 10);
  if (id === "highbay")
    for (const t of s.structs)
      if (t.kind === "rack" && !t.dead) for (let c = 0; c < t.w; c++) t.slots.push(addSlot(s, "store", t.x + c, t.z, 2 * LEVEL_H, t.id));
  gridCache = null;
  alert(s, "good", `${u.name} done`);
  return null;
}
export const upgradeCost = (s: State, id: UpgradeId) => {
  const u = UPGRADES.find((x) => x.id === id)!;
  return id === "door" ? u.cost * (1 + (s.up.door ?? 0) * 0.5) : u.cost;
};

/* ------------------------------------------------------------------ the bank */

/** How much more the bank will lend: half your net worth (three quarters with a bank partner), less what you owe. */
export function creditLimit(s: State) {
  const gross = s.cash + stockValue(s) + assets(s);
  const cap = Math.floor((Math.max(0, gross) * (up(s, "bank") ? 0.75 : 0.5)) / 5_000) * 5_000;
  return Math.max(0, Math.min(500_000, cap) - s.loan);
}
export const loanRate = (s: State) => LOAN_RATE * (up(s, "bank") ? 0.5 : 1);

export function borrow(s: State, amount: number): string | null {
  amount = Math.round(amount);
  if (amount <= 0) return "Nothing to borrow";
  if (amount > creditLimit(s)) return "Over your credit limit";
  s.loan += amount;
  s.cash += amount;
  s.stats.borrowed += amount;
  pop(s, amount, "Loan");
  alert(s, "info", `Borrowed $${amount.toLocaleString("en-US")} at ${(loanRate(s) * 100).toFixed(1)}% a day`);
  return null;
}

export function repay(s: State, amount: number): string | null {
  amount = Math.round(Math.min(amount, s.loan));
  if (amount <= 0) return "Nothing owed";
  if (s.cash < amount) return "Not enough cash";
  s.loan -= amount;
  s.cash -= amount;
  s.stats.repaid += amount;
  pop(s, -amount, "Repaid");
  if (s.loan === 0) alert(s, "good", "Loan paid off");
  return null;
}

/* ------------------------------------------------------------------ your own fleet */

export function buyOwnTruck(s: State): string | null {
  if (!up(s, "depot")) return "Build the Transport depot first";
  if (s.ownTrucks.length >= MAX_OWN_TRUCKS) return "The depot is full";
  if (s.cash < OWN_TRUCK_COST) return "Not enough cash";
  spend(s, OWN_TRUCK_COST, "capex");
  pop(s, -OWN_TRUCK_COST, "Truck");
  const n = s.ownTrucks.length + 1;
  s.ownTrucks.push({ id: n, name: `WF-${String(n).padStart(2, "0")}`, free: s.time, trips: 0 });
  alert(s, "good", `WF-${String(n).padStart(2, "0")} joins your fleet`);
  return null;
}

/* ------------------------------------------------------------------ missions */

function newMissions(s: State) {
  const d = day(s.time);
  const pool = [...MISSIONS];
  s.missions = [];
  for (let k = 0; k < 3 && pool.length; k++) {
    const m = pool.splice(Math.floor(rand(s) * pool.length), 1)[0];
    const target = m.target(d);
    s.missions.push({ kind: m.kind, icon: m.icon, name: m.name.replace("{n}", target.toLocaleString("en-US")), target, reward: m.reward(d), done: false });
  }
}

export function missionProgress(s: State, m: Mission) {
  const t = s.today;
  return { ship: t.orders, unload: t.unloads, make: t.made, revenue: t.revenue, ontime: t.onTime, moves: t.moves }[m.kind];
}

function stepMissions(s: State) {
  for (const m of s.missions) {
    if (m.done || missionProgress(s, m) < m.target) continue;
    m.done = true;
    earn(s, m.reward, "rewards");
    pop(s, m.reward, "Mission");
    s.stats.missions++;
    alert(s, "good", `Mission done: ${m.name} (+$${m.reward.toLocaleString("en-US")})`);
  }
}

/* ------------------------------------------------------------------ the cold chain */

/** How fast a frozen pallet warms in a slot: not at all in a freezer, half speed on the (insulated) dock lanes, a sixth with reefer lanes. */
export const warmRate = (s: State, sl: Slot) => (sl.cold ? 0 : sl.kind === "stage" ? (up(s, "reefer") ? 1 / 6 : 0.5) : 1);

/** Frozen pallets out of a freezer warm up; too warm and they spoil. In a freezer they chill again. */
function stepCold(s: State, secs: number) {
  for (const p of Object.values(s.pallets)) {
    if (!ITEMS[p.item].frozen || p.loc !== "slot") continue;
    const sl = s.slots[p.ref];
    if (sl.cold) {
      p.warm = Math.max(0, (p.warm ?? 0) - secs * 2);
      continue;
    }
    p.warm = (p.warm ?? 0) + secs * warmRate(s, sl);
    if (p.warm < THAW_SECS || p.busy >= 0) continue;
    // Spoiled: it goes in the skip.
    sl.pallet = -1;
    delete s.pallets[p.id];
    const loss = buyPrice(p.item);
    s.ledger.spoilage += loss;
    s.stats.spoiled++;
    alert(s, "bad", `A pallet of ${ITEMS[p.item].name} spoiled out of the cold (−$${loss.toLocaleString("en-US")} of stock)`);
  }
}

/* ------------------------------------------------------------------ the books */

export function stockValue(s: State) {
  let v = 0;
  for (const p of Object.values(s.pallets)) if (p.loc !== "truck" || s.trucks.find((t) => t.id === p.ref)?.dir === "in") v += buyPrice(p.item) * 0.9;
  return v;
}

export function assets(s: State) {
  let v = s.forks.length * FORKLIFT_COST * 0.5;
  for (const t of s.structs) if (!t.dead) v += structCost({ kind: t.kind, type: t.m?.type, x: 0, z: 0 }) * 0.5;
  return v;
}

export const worth = (s: State) => Math.round(s.cash + stockValue(s) + assets(s) - s.loan);
/** Money in and out over the last game hour (from the hourly log). */
export const cashTrend = (s: State) => (s.cashLog.length ? Math.round(s.cash - s.cashLog[s.cashLog.length - 1]) : 0);
export const score = (s: State) => Math.max(0, Math.round((worth(s) - s.startWorth) / 10) + s.stats.onTime * 25 + s.stats.madeGoods * 5);

export function kpis(s: State) {
  const onSite = s.trucks.filter((t) => ["queued", "arriving", "backing", "docked"].includes(t.state));
  const inbound = s.trucks.filter((t) => t.state === "transit");
  const total = s.slots.filter((sl) => sl.kind === "store" && !sl.dead).length;
  const held = stock(s);
  const hist = s.history;
  return {
    stock: held,
    capacity: total,
    full: total ? Math.round((s.slots.filter((sl) => sl.kind === "store" && !sl.dead && sl.pallet >= 0).length / total) * 100) : 0,
    delta: s.today.received - s.today.shipped,
    onSite: onSite.length,
    inbound: inbound.length,
    docked: s.trucks.filter((t) => t.state === "docked").length,
    onTime: hist.length ? (hist.filter(Boolean).length / hist.length) * 100 : 100,
    deliveries: hist.length,
    cash: s.cash,
    made: s.today.made,
    worth: worth(s),
  };
}

const GOAL_CHECKS: Record<string, (s: State) => boolean> = {
  unload: (s) => s.stats.unloaded >= 1,
  ship1: (s) => s.stats.delivered >= 1,
  ship10: (s) => s.stats.delivered >= 10,
  rush: (s) => s.stats.rushOnTime >= 1,
  ontime: (s) => s.history.length >= 20 && s.history.filter(Boolean).length / s.history.length >= 0.95,
  machine: (s) => s.structs.some((t) => !t.dead && t.kind === "machine") && siteDef(s.site).machines.length < s.structs.filter((t) => !t.dead && t.kind === "machine").length,
  made10: (s) => s.stats.madeGoods >= 10,
  phone: (s) => s.stats.phones >= 1,
  stock150: (s) => s.stats.peakStock >= 150,
  fleet4: (s) => s.forks.length >= 4,
  rev100: (s) => s.stats.revenue >= 100_000,
  worth250: (s) => worth(s) >= 250_000,
  rail1: (s) => s.stats.trains >= 1,
  charge: (s) => s.stats.charges >= 1,
  contract: (s) => s.stats.contractsDone >= 1,
  ebike: (s) => (s.stats.madeItems.ebike ?? 0) >= 1,
  laptop: (s) => (s.stats.madeItems.laptop ?? 0) >= 1,
  drone: (s) => (s.stats.madeItems.drone ?? 0) >= 1,
  doors10: (s) => s.doors.length >= 10,
  mega: (s) => up(s, "mega"),
  ship50: (s) => s.stats.delivered >= 50,
  fleet8: (s) => s.forks.length >= 8,
  event: (s) => s.stats.events >= 1,
  worth1m: (s) => worth(s) >= 1_000_000,
  debtfree: (s) => s.stats.borrowed > 0 && s.loan === 0,
  coldship: (s) => s.stats.coldShipped >= 1,
  ownfleet: (s) => s.stats.ownShipped >= 1,
  missions10: (s) => s.stats.missions >= 10,
  gold: (s) => Object.keys(s.customers).some((c) => loyalty(s, c) === 3),
  vipship: (s) => s.stats.vipOnTime >= 1,
  mk2: (s) => s.structs.some((t) => !t.dead && t.m?.mk === 2),
  veteran: (s) => s.forks.some((f) => forkLevel(s, f) >= 5),
};

function stepGoals(s: State) {
  for (const g of GOALS) {
    if (s.goals[g.id] || !GOAL_CHECKS[g.id]?.(s)) continue;
    s.goals[g.id] = true;
    if (g.reward) {
      earn(s, g.reward, "rewards");
      pop(s, g.reward, "Goal");
    }
    alert(s, "good", `Goal: ${g.name}${g.reward ? ` (+$${g.reward.toLocaleString("en-US")})` : ""}`);
  }
}

/* ------------------------------------------------------------------ the market and events */

/** Prices drift a little every day. */
function stepMarket(s: State) {
  for (const id of ITEM_IDS) {
    const f = marketOf(s, id) * (1 + (rand(s) - 0.5) * 0.16);
    s.market[id] = Math.round(Math.min(1.35, Math.max(0.75, f + (1 - f) * 0.15)) * 1000) / 1000;
  }
}

export function startEvent(s: State, kind: EventKind) {
  const def = EVENTS.find((e) => e.kind === kind)!;
  s.event = { kind, started: s.time, until: s.time + ri(s, def.hours[0], def.hours[1]) * HOUR };
  if (kind === "storm") for (const t of s.trucks) if (t.state === "transit") t.eta += HOUR;
  alert(s, kind === "rush" || kind === "boom" ? "good" : "warn", `${def.icon} ${def.name}: ${def.body}`);
}

function stepHour(s: State) {
  s.cashLog.push(Math.round(s.cash));
  if (s.cashLog.length > 72) s.cashLog.shift();
  if (s.cash < 5_000 && s.cash >= -25_000 && !s.alerts.some((a) => a.text.startsWith("Cash is low") && s.time - a.t < 6 * HOUR))
    alert(s, "warn", "Cash is low: take fewer risks, sell stock, or borrow from the bank (tap your cash)");
  if (s.event && s.time >= s.event.until) {
    const def = EVENTS.find((e) => e.kind === s.event!.kind)!;
    alert(s, "info", `${def.name} is over`);
    s.event = null;
    s.stats.events++;
  } else if (!s.event && day(s.time) > 1 && rand(s) < 0.035) startEvent(s, pick(s, EVENTS).kind);
  if (!s.contracts.some((c) => c.state === "offer") && day(s.time) + (s.time % DAY) / DAY > 1.25 && rand(s) < 0.06) offerContract(s);
}

/* ------------------------------------------------------------------ the clock */

/** Advance the world by `dt` game seconds. */
export function tick(s: State, dt: number) {
  if (s.bankrupt) return;
  while (dt > 0) {
    const h = Math.min(dt, 2);
    dt -= h;
    stepOnce(s, h);
  }
}

function stepOnce(s: State, dt: number) {
  const before = s.time;
  s.time += dt;
  const def = siteDef(s.site);
  // Running costs.
  const machines = s.structs.filter((t) => !t.dead && t.m);
  const solar = up(s, "solar") ? 0.75 : 1;
  spend(s, (def.rent * solar * (s.mega && !def.mega ? 1.8 : s.expanded && !def.expanded ? 1.35 : 1) * dt) / HOUR, "rent");
  spend(s, ((FORKLIFT_WAGE * (up(s, "agv") ? 0.4 : 1) * s.forks.length + OWN_TRUCK_WAGE * s.ownTrucks.length) * dt) / HOUR, "wages");
  if (s.loan > 0) spend(s, (s.loan * loanRate(s) * dt) / DAY, "interest");
  spend(s, (machines.reduce((a, t) => a + MACHINES[t.m!.type].upkeep * (t.m!.on ? 1 : 0.3), 0) * solar * dt) / HOUR, "upkeep");
  // Trucks kept waiting cost money.
  for (const t of s.trucks)
    if ((t.state === "queued" || t.state === "docked") && t.arrived >= 0 && s.time - t.arrived > HOUR) spend(s, (DETENTION_PER_MIN * dt) / MIN, "penalties");
  for (const t of s.trucks) stepTruck(s, t, dt);
  for (const t of machines) stepMachine(s, t, dt);
  for (const f of s.forks) stepFork(s, f, dt);
  // Customers.
  const hour = (s.time % DAY) / HOUR;
  const night = hour < 6 || hour >= 22;
  const open = s.orders.filter((o) => o.state === "offer").length;
  const rate =
    def.demand * (up(s, "sales") ? 1.3 : 1) * (up(s, "brand") ? 1.25 : 1) * (eventOn(s, "rush") ? 2 : 1) * (s.mega ? 1.3 : 1) * (night && !up(s, "night") ? 0.3 : 1) * (0.6 + (s.rep / 100) * 0.8);
  if (open < 5 && rand(s) < (rate * dt) / HOUR) offer(s);
  // Once a game minute.
  if (Math.floor(before / MIN) !== Math.floor(s.time / MIN)) {
    stepOrders(s);
    const held = stock(s);
    s.stats.peakStock = Math.max(s.stats.peakStock, held);
    stepCold(s, MIN);
    stepMissions(s);
    stepGoals(s);
  }
  if (Math.floor(before / (10 * MIN)) !== Math.floor(s.time / (10 * MIN))) stepAuto(s);
  // Once a game hour: contracts and events.
  if (Math.floor(before / HOUR) !== Math.floor(s.time / HOUR)) stepHour(s);
  // A new day.
  if (day(before) !== day(s.time)) {
    s.days.push(s.today);
    if (s.days.length > 14) s.days.shift();
    s.report = { ...s.today, profit: Math.round(s.today.revenue - s.today.costs) };
    s.today = newDay(day(s.time));
    newMissions(s);
    stepMarket(s);
    alert(s, "info", `Day ${day(s.time)}`);
    if (day(s.time) > SEASON_DAYS && !s.seasonOver) {
      s.seasonOver = true;
      alert(s, "good", `Season over: net worth $${worth(s).toLocaleString("en-US")}. Keep going if you like.`);
    }
  }
  if (s.cash < -25_000 && !s.bankrupt) {
    s.bankrupt = true;
    alert(s, "bad", "The bank has called in the loan: you're bankrupt.");
  }
}

/** Count inbound pallets as received when they land in the building. */
export function received(s: State) {
  return s.today.received;
}

/* ------------------------------------------------------------------ search */

export interface Hit {
  label: string;
  sub: string;
  focus: Focus;
}

export function search(s: State, q: string): Hit[] {
  const k = q.trim().toLowerCase();
  if (!k) return [];
  const out: Hit[] = [];
  for (const t of s.trucks) if (t.state !== "gone" && `${t.plate} ${CARRIERS[t.carrier].name}`.toLowerCase().includes(k)) out.push({ label: t.plate, sub: `Truck · ${CARRIERS[t.carrier].name} · ${t.state}`, focus: { k: "truck", id: t.id } });
  for (const f of s.forks) if (f.name.toLowerCase().includes(k) || "forklift".includes(k)) out.push({ label: f.name, sub: "Forklift", focus: { k: "fork", id: f.id } });
  for (const o of s.orders) if (o.state !== "declined" && `${o.code} ${o.customer} ${o.city}`.toLowerCase().includes(k)) out.push({ label: `#${o.code}`, sub: `Shipment · ${o.city}`, focus: { k: "order", id: o.id } });
  for (const p of Object.values(s.pallets))
    if (`pal-${p.id} ${ITEMS[p.item].name} ${p.lot}`.toLowerCase().includes(k) && p.loc === "slot") out.push({ label: `PAL-${1000 + p.id}`, sub: `${ITEMS[p.item].name} · ${p.lot}`, focus: { k: "pallet", id: p.id } });
  for (const d of s.doors) if (doorName(s, d.i).toLowerCase().includes(k)) out.push({ label: doorName(s, d.i), sub: "Dock door", focus: { k: "door", id: d.i } });
  return out.slice(0, 12);
}

/* ------------------------------------------------------------------ saving */

export function serialize(s: State) {
  return JSON.stringify(s);
}
export function deserialize(json: string): State | null {
  try {
    const s = JSON.parse(json) as State;
    if (s?.v !== 1 || !Array.isArray(s.slots)) return null;
    // Saves from before the super mega update.
    s.mega ??= false;
    s.rail ??= false;
    s.market ??= {};
    for (const id of ITEM_IDS) s.market[id] ??= 1;
    s.contracts ??= [];
    s.event ??= null;
    s.stats.trains ??= 0;
    s.stats.charges ??= 0;
    s.stats.contractsDone ??= 0;
    s.stats.events ??= 0;
    s.stats.madeItems ??= {};
    for (const f of s.forks) {
      f.battery ??= 1;
      f.charger ??= -1;
    }
    // Saves from before the mega super update.
    s.loan ??= 0;
    s.cashLog ??= [];
    s.report ??= null;
    s.missions ??= [];
    s.customers ??= {};
    s.ownTrucks ??= [];
    // Out on a job (an older save wrote Infinity, which JSON turns to null).
    for (const t of s.ownTrucks) t.free ??= OUT_ON_JOB;
    s.fx ??= [];
    s.tip ??= 99;
    s.ledger.carriers ??= 0;
    s.ledger.interest ??= 0;
    s.ledger.spoilage ??= 0;
    s.today.orders ??= 0;
    s.today.unloads ??= 0;
    s.today.moves ??= 0;
    for (const k of ["borrowed", "repaid", "coldShipped", "ownShipped", "missions", "vipOnTime", "spoiled"] as const) s.stats[k] ??= 0;
    if (!s.missions.length) newMissions(s);
    gridCache = null;
    return s;
  } catch {
    return null;
  }
}
