/**
 * Lifeline's rules: construction (orders, deliveries, workmen), staff (stations, rest,
 * cleaning), patients (check-in, waiting, diagnosis, treatment, needs, health), money,
 * reputation, grants and events. Deterministic for a seed; no DOM.
 */
import {
  ADMINS,
  CONDITIONS,
  DOOR_COST,
  EVENTS,
  FIRST,
  FLOORS,
  GATE,
  GRANT_ORDER,
  GRANTS,
  H,
  LAST,
  MINUTES_PER_SECOND,
  OBJECTS,
  PAVEMENT_Z,
  ROLES,
  ROOMS,
  START_CASH,
  STEP_MINUTES,
  STEP_ROOM,
  W,
  WALL_COST,
  type ConditionId,
  type EventId,
  type FloorId,
  type GrantId,
  type ObjectId,
  type Role,
  type RoomId,
  type Step,
} from "./data";
import { accessCell, BUILT, cx, cz, FLOOR_IDS, FRONT, idx, inside, NONE, objCells, PLANNED, ROOM_IDS, slots, World, type Obj, type RoomInstance } from "./world";

// --------------------------------------------------------------------- rng

export class Rng {
  constructor(public s: number) {}
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  pick<T>(a: readonly T[]) {
    return a[Math.floor(this.next() * a.length)];
  }
}

// ------------------------------------------------------------------- types

export type JobKind = "wall" | "door" | "floor" | "object";
export interface Job {
  id: number;
  kind: JobKind;
  cell: number;
  obj: number;
  /** Seconds of work. */
  work: number;
  done: number;
  needsCrate: boolean;
  crate: number;
  worker: number;
}
export interface Crate {
  id: number;
  x: number;
  z: number;
  job: number;
  carriedBy: number;
}
export type Pose = "walk" | "stand" | "sit" | "lie" | "work" | "carry" | "clean" | "dead";
export type PState = "arrive" | "checkin" | "waitStep" | "toStep" | "inStep" | "need" | "leaving" | "dead" | "idle" | "toStation" | "station" | "rest" | "work" | "fetch" | "carry" | "clean" | "wander";

export interface Person {
  id: number;
  kind: "staff" | "patient";
  role: Role | null;
  name: string;
  x: number;
  z: number;
  heading: number;
  path: number[];
  goal: number;
  state: PState;
  pose: Pose;
  timer: number;
  /** Staff. */
  energy: number;
  room: number;
  task: number;
  carrying: number;
  onDuty: boolean;
  /** Patients. */
  cond: ConditionId | null;
  step: number;
  health: number;
  hunger: number;
  bladder: number;
  waited: number;
  ambulance: boolean;
  slot: number;
  checkedIn: boolean;
  infected: boolean;
  arrived: number;
  /** Where a sitting/lying person is drawn (object slot), if not their cell. */
  at: { x: number; z: number } | null;
  /** The seat position claimed while waiting. */
  seat: { x: number; z: number } | null;
  /** Sim time before which a waiting patient doesn't re-think. */
  cool: number;
  /** The last unreachable target, and when to try it again. */
  failCell: number;
  failUntil: number;
  needTarget: "food" | "toilet" | null;
}

export interface Vehicle {
  id: number;
  kind: "truck" | "ambulance";
  x: number;
  /** Where it stops. */
  stop: number;
  state: "in" | "stopped" | "out";
  t: number;
  payload: number;
}

export interface DayReport {
  day: number;
  income: number;
  expense: number;
  treated: number;
  deaths: number;
}

export interface Notice {
  kind: "warn" | "info";
  text: string;
}

export interface Stats {
  treated: number;
  deaths: number;
  left: number;
  scans: number;
  meds: number;
  ops: number;
  er: number;
  wardDone: number;
  infections: number;
  income: number;
  expense: number;
  /** Rolling window for reputation. */
  recent: { t: number; d: number; l: number; wait: number; waits: number };
  cleanHours: number;
  history: DayReport[];
  today: DayReport;
}

export type GrantState = "open" | "done";

/** Walking speed, cells per sim second. */
const ROLE_SPEED: Record<string, number> = { patient: 2.1, staff: 2.7 };
const STAFFED_BY: Partial<Record<RoomId, Role[]>> = Object.fromEntries(Object.entries(ROOMS).filter(([, d]) => d.staff).map(([k, d]) => [k, d.staff!]));
/** The object a patient uses in each treatment room. */
const PATIENT_OBJ: Record<Step | "reception", ObjectId> = { gp: "examBed", radiology: "xray", pharmacy: "pharmacyCounter", ward: "bed", theatre: "opTable", emergency: "traumaBed", reception: "receptionDesk" };
const LIE_ON = new Set<ObjectId>(["examBed", "bed", "opTable", "traumaBed"]);

export class Sim {
  world = new World();
  people = new Map<number, Person>();
  jobs = new Map<number, Job>();
  crates = new Map<number, Crate>();
  vehicles: Vehicle[] = [];
  orders: number[] = [];
  cash = START_CASH;
  minutes = 7 * 60;
  rep = 2.5;
  hygiene = 1;
  power = { supply: 0, demand: 0, ok: true };
  stats: Stats = freshStats();
  grants: Partial<Record<GrantId, GrantState>> = { opening: "open", firstTen: "open" };
  events: { id: EventId; until: number }[] = [];
  loan = 0;
  notices: Notice[] = [];
  /** One-off messages for the UI to show and clear. */
  messages: { text: string; kind: "info" | "good" | "bad" }[] = [];
  /** Patient slot claims: object id → person id. */
  claims = new Map<number, number>();
  nextId = 1;
  rng: Rng;
  private lastHour = -1;
  /** Sim seconds (for think cooldowns). */
  private time = 0;
  /** Per-substep caches: room key → roles on duty there; seat object → people on it; room:role → assigned. */
  private duty = new Map<number, Set<Role>>();
  private seatUse = new Map<number, number>();
  private assignedN = new Map<string, number>();
  private lastTruck = -1e9;
  private cleanTargets = new Set<number>();

  constructor(seed = 1) {
    this.rng = new Rng(seed);
    this.lastHour = Math.floor(this.minutes / 60);
  }

  get day() {
    return Math.floor(this.minutes / 1440) + 1;
  }
  get hour() {
    return (this.minutes / 60) % 24;
  }

  // --------------------------------------------------------------- building

  private spend(n: number) {
    this.cash -= n;
    this.stats.expense += n;
    this.stats.today.expense += n;
  }
  private earn(n: number) {
    this.cash += n;
    this.stats.income += n;
    this.stats.today.income += n;
  }
  canAfford(n: number) {
    return this.cash - n >= -10_000;
  }

  private addJob(kind: JobKind, cell: number, obj = 0) {
    const work = kind === "floor" ? 1.2 : kind === "wall" ? 3 : kind === "door" ? 4 : OBJECTS[this.world.objects.get(obj)!.kind].build;
    const j: Job = { id: this.nextId++, kind, cell, obj, work, done: 0, needsCrate: kind !== "floor", crate: 0, worker: 0 };
    this.jobs.set(j.id, j);
    if (j.needsCrate) this.orders.push(j.id);
    return j;
  }

  private cellsIn(x0: number, z0: number, x1: number, z1: number) {
    const out: number[] = [];
    for (let z = Math.max(0, Math.min(z0, z1)); z <= Math.min(PAVEMENT_Z - 1, Math.max(z0, z1)); z++)
      for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(W - 1, Math.max(x0, x1)); x++) out.push(idx(x, z));
    return out;
  }

  /** Cost of a foundation over a rectangle (floor everywhere, walls round the edge). */
  foundationCost(x0: number, z0: number, x1: number, z1: number, floor: FloorId = "lino") {
    let n = 0;
    const w = this.world;
    for (const c of this.cellsIn(x0, z0, x1, z1)) {
      if (!w.found[c]) n += FLOORS[floor].cost;
      if (this.onEdge(c, x0, z0, x1, z1) && !w.wall[c] && !w.found[c]) n += WALL_COST;
    }
    return n;
  }

  private onEdge(c: number, x0: number, z0: number, x1: number, z1: number) {
    const x = cx(c);
    const z = cz(c);
    return x === Math.min(x0, x1) || x === Math.max(x0, x1) || z === Math.min(z0, z1) || z === Math.max(z0, z1);
  }

  /** Lay a foundation: a floor everywhere and walls round the edge, as jobs for the workmen. */
  foundation(x0: number, z0: number, x1: number, z1: number, floor: FloorId = "lino") {
    const cost = this.foundationCost(x0, z0, x1, z1, floor);
    if (cost <= 0 || !this.canAfford(cost)) return false;
    const w = this.world;
    const cells = this.cellsIn(x0, z0, x1, z1);
    if (cells.some((c) => w.occ[c] && !w.found[c])) return false;
    this.spend(cost);
    for (const c of cells) {
      if (w.found[c]) continue;
      w.found[c] = 1;
      w.floorPlan[c] = FLOOR_IDS.indexOf(floor) + 1;
      this.addJob("floor", c);
      if (this.onEdge(c, x0, z0, x1, z1) && !w.wall[c]) {
        w.wall[c] = PLANNED;
        this.addJob("wall", c);
      }
    }
    w.touch();
    return true;
  }

  /** Walls along a straight line of cells. */
  walls(cells: number[]) {
    const w = this.world;
    const todo = cells.filter((c) => !w.wall[c] && !w.occ[c] && cz(c) < PAVEMENT_Z);
    const cost = todo.length * WALL_COST;
    if (!todo.length || !this.canAfford(cost)) return false;
    this.spend(cost);
    for (const c of todo) {
      w.wall[c] = PLANNED;
      this.addJob("wall", c);
    }
    w.touch();
    return true;
  }

  /** A door goes in a wall (built or planned). */
  door(c: number) {
    const w = this.world;
    if (!w.wall[c] || w.door[c] || !this.canAfford(DOOR_COST)) return false;
    // It needs walls (or the edge of the building) either side, in a line.
    const x = cx(c);
    const z = cz(c);
    const solid = (xx: number, zz: number) => inside(xx, zz) && !!w.wall[idx(xx, zz)];
    if (!((solid(x - 1, z) && solid(x + 1, z)) || (solid(x, z - 1) && solid(x, z + 1)))) return false;
    this.spend(DOOR_COST);
    w.door[c] = PLANNED;
    // A planned wall under the door no longer needs building on its own.
    for (const j of this.jobs.values()) if (j.kind === "wall" && j.cell === c) this.cancelJob(j.id, false);
    w.wall[c] = PLANNED;
    this.addJob("door", c);
    w.touch();
    return true;
  }

  floorCost(x0: number, z0: number, x1: number, z1: number, floor: FloorId) {
    const w = this.world;
    return this.cellsIn(x0, z0, x1, z1).filter((c) => (floor === "path" || w.found[c]) && !w.wall[c] && w.floor[c] !== FLOOR_IDS.indexOf(floor) + 1).length * FLOORS[floor].cost;
  }

  /** Re-floor inside (or lay paving anywhere outside). */
  floor(x0: number, z0: number, x1: number, z1: number, floor: FloorId) {
    const w = this.world;
    const id = FLOOR_IDS.indexOf(floor) + 1;
    const cells = this.cellsIn(x0, z0, x1, z1).filter((c) => (floor === "path" || w.found[c]) && !w.wall[c] && w.floor[c] !== id);
    const cost = cells.length * FLOORS[floor].cost;
    if (!cells.length || !this.canAfford(cost)) return false;
    this.spend(cost);
    for (const c of cells) {
      w.floorPlan[c] = id;
      if (![...this.jobs.values()].some((j) => j.kind === "floor" && j.cell === c)) this.addJob("floor", c);
    }
    w.touch();
    return true;
  }

  placeObject(kind: ObjectId, x: number, z: number, rot: number) {
    const def = OBJECTS[kind];
    if (!this.canAfford(def.cost) || !this.world.canPlace(kind, x, z, rot)) return null;
    const o = this.world.addObject(kind, x, z, rot, false)!;
    this.spend(def.cost);
    this.addJob("object", objCells(o)[0], o.id);
    return o;
  }

  paintRoom(x0: number, z0: number, x1: number, z1: number, room: RoomId | null) {
    const w = this.world;
    const v = room ? ROOM_IDS.indexOf(room) + 1 : 0;
    let n = 0;
    for (const c of this.cellsIn(x0, z0, x1, z1)) {
      if (room && ROOMS[room].indoor && !w.found[c]) continue;
      if (w.room[c] !== v) {
        w.room[c] = v;
        n++;
      }
    }
    if (n) w.touch();
    return n > 0;
  }

  private cancelJob(id: number, refund: boolean) {
    const j = this.jobs.get(id);
    if (!j) return;
    this.jobs.delete(id);
    this.orders = this.orders.filter((o) => o !== id);
    if (j.crate) {
      const c = this.crates.get(j.crate);
      if (c) {
        if (c.carriedBy) {
          const p = this.people.get(c.carriedBy);
          if (p) p.carrying = 0;
        }
        this.crates.delete(c.id);
      }
    }
    if (j.worker) {
      const p = this.people.get(j.worker);
      if (p) this.idle(p);
    }
    if (refund) {
      const w = this.world;
      const back = j.kind === "wall" ? WALL_COST : j.kind === "door" ? DOOR_COST : j.kind === "floor" ? FLOORS[FLOOR_IDS[(w.floorPlan[j.cell] || 1) - 1]].cost : OBJECTS[w.objects.get(j.obj)?.kind ?? "plant"].cost;
      this.earn(back);
      this.stats.income -= back;
      this.stats.today.income -= back;
      this.stats.expense -= back;
      this.stats.today.expense -= back;
    }
  }

  /** Clear everything in a rectangle: plans are refunded, built things are scrapped (a quarter back for objects). */
  demolish(x0: number, z0: number, x1: number, z1: number) {
    const w = this.world;
    const cells = new Set(this.cellsIn(x0, z0, x1, z1));
    let did = false;
    for (const j of [...this.jobs.values()]) {
      const hit = j.kind === "object" ? objCells(w.objects.get(j.obj)!).some((c) => cells.has(c)) : cells.has(j.cell);
      if (!hit) continue;
      this.cancelJob(j.id, true);
      did = true;
      if (j.kind === "object") w.removeObject(j.obj);
      if (j.kind === "wall" || j.kind === "door") {
        w.wall[j.cell] = w.wall[j.cell] === PLANNED ? NONE : w.wall[j.cell];
        w.door[j.cell] = w.door[j.cell] === PLANNED ? NONE : w.door[j.cell];
      }
      if (j.kind === "floor") w.floorPlan[j.cell] = 0;
    }
    for (const o of [...w.objects.values()]) {
      if (!objCells(o).some((c) => cells.has(c))) continue;
      if (o.built) this.earn(Math.round(OBJECTS[o.kind].cost / 4));
      this.release(o.id);
      w.removeObject(o.id);
      did = true;
    }
    for (const c of cells) {
      if (w.wall[c] || w.door[c]) {
        w.wall[c] = NONE;
        w.door[c] = NONE;
        did = true;
      }
    }
    // A cleared rectangle with nothing left standing loses its foundation too.
    for (const c of cells)
      if (w.found[c] && !w.wall[c] && !w.occ[c]) {
        w.found[c] = 0;
        w.floor[c] = 0;
        w.floorPlan[c] = 0;
        w.room[c] = 0;
        did = true;
      }
    if (did) w.touch();
    return did;
  }

  // ------------------------------------------------------------------ staff

  unlocked(role: Role) {
    const need = ROLES[role].unlock;
    return !need || this.adminActive(need);
  }

  /** An administrator counts once they're at their desk in an office. */
  adminActive(role: Role) {
    for (const p of this.people.values()) if (p.role === role && p.onDuty) return true;
    return false;
  }

  roomUnlocked(room: RoomId) {
    const need = ROOMS[room].unlock;
    return !need || this.adminActive(need);
  }

  hire(role: Role) {
    if (!this.unlocked(role)) return null;
    if (ADMINS.includes(role) && [...this.people.values()].some((p) => p.role === role)) return null;
    const p = this.spawn("staff", role);
    this.messages.push({ text: `${p.name} joins as ${ROLES[role].name.toLowerCase()}.`, kind: "info" });
    return p;
  }

  fire(id: number) {
    const p = this.people.get(id);
    if (!p || p.kind !== "staff") return false;
    if (p.carrying) {
      const c = this.crates.get(p.carrying);
      if (c) {
        c.carriedBy = 0;
        c.x = p.x;
        c.z = p.z;
      }
    }
    for (const j of this.jobs.values()) if (j.worker === id) j.worker = 0;
    this.people.delete(id);
    return true;
  }

  takeLoan() {
    if (!this.adminActive("accountant") || this.loan > 0) return false;
    this.loan = 27_500;
    this.earn(25_000);
    this.stats.income -= 25_000;
    this.stats.today.income -= 25_000;
    this.messages.push({ text: "The bank lends you $25,000 (repaid at $5,500 a day for five days).", kind: "info" });
    return true;
  }

  private spawn(kind: "staff" | "patient", role: Role | null, cond: ConditionId | null = null, ambulance = false): Person {
    const x = GATE.x + 0.5 + (this.rng.next() - 0.5) * 2;
    const p: Person = {
      id: this.nextId++,
      kind,
      role,
      name: `${this.rng.pick(FIRST)} ${this.rng.pick(LAST)}`,
      x,
      z: GATE.z + 0.5,
      heading: Math.PI,
      path: [],
      goal: -1,
      state: kind === "staff" ? "idle" : "arrive",
      pose: "stand",
      timer: 0,
      energy: 70 + this.rng.next() * 30,
      room: 0,
      task: 0,
      carrying: 0,
      onDuty: false,
      cond,
      step: 0,
      health: cond ? (CONDITIONS[cond].critical ? 45 + this.rng.next() * 20 : 70 + this.rng.next() * 25) : 100,
      hunger: this.rng.next() * 30,
      bladder: this.rng.next() * 30,
      waited: 0,
      ambulance,
      slot: 0,
      checkedIn: ambulance,
      infected: false,
      arrived: this.minutes,
      at: null,
      seat: null,
      cool: 0,
      failCell: -1,
      failUntil: 0,
      needTarget: null,
    };
    this.people.set(p.id, p);
    return p;
  }

  // ------------------------------------------------------------- the clock

  /** Advance by dt real seconds at the given speed. */
  step(dt: number, speed: number) {
    if (speed <= 0) return;
    let left = Math.min(0.5, dt) * speed;
    while (left > 1e-6) {
      const t = Math.min(0.1, left);
      left -= t;
      this.substep(t);
    }
  }

  private substep(t: number) {
    const dm = t * MINUTES_PER_SECOND;
    this.minutes += dm;
    this.time += t;
    this.duty.clear();
    this.seatUse.clear();
    this.assignedN.clear();
    for (const p of this.people.values()) {
      if (p.kind === "staff" && p.room) {
        const k = `${p.room}:${p.role}`;
        this.assignedN.set(k, (this.assignedN.get(k) ?? 0) + 1);
        if (p.onDuty) (this.duty.get(p.room) ?? this.duty.set(p.room, new Set()).get(p.room)!).add(p.role!);
      }
      if (p.kind === "patient" && p.seat && p.slot) this.seatUse.set(p.slot, (this.seatUse.get(p.slot) ?? 0) + 1);
    }
    const w = this.world;
    // Power and rooms.
    let supply = 0;
    let demand = 0;
    for (const o of w.objects.values()) {
      if (!o.built) continue;
      const p = OBJECTS[o.kind].power ?? 0;
      if (p < 0) supply -= p;
      else demand += p;
    }
    const ok = demand <= supply;
    if (ok !== this.power.ok) w.touch();
    this.power = { supply, demand, ok };
    if (w.rebuildRooms(this.power)) this.afterRooms();
    this.vehiclesStep(t);
    this.arrivals(dm);
    for (const p of [...this.people.values()]) {
      if (p.kind === "staff") this.staffStep(p, t, dm);
      else this.patientStep(p, t, dm);
      this.move(p, t);
    }
    const hour = Math.floor(this.minutes / 60);
    while (this.lastHour < hour) {
      this.lastHour++;
      this.hourly(this.lastHour);
    }
  }

  /** Rooms changed: drop staff and claims from rooms that are gone or broken. */
  private afterRooms() {
    const keys = new Map(this.world.rooms.map((r) => [r.cells[0], r]));
    for (const p of this.people.values()) {
      if (p.kind !== "staff" || !p.room) continue;
      const r = keys.get(p.room);
      if (!r || !r.valid) this.idle(p);
    }
    for (const [obj, pid] of this.claims) {
      const o = this.world.objects.get(obj);
      const p = this.people.get(pid);
      if (!o || !p) this.claims.delete(obj);
    }
  }

  roomByKey(key: number): RoomInstance | undefined {
    return this.world.rooms.find((r) => r.cells[0] === key);
  }

  // ------------------------------------------------------------- vehicles

  private vehiclesStep(t: number) {
    // A truck comes when there are orders, at most every 20 game minutes.
    if (this.orders.length && !this.vehicles.some((v) => v.kind === "truck") && this.minutes - this.lastTruck > 20) {
      this.lastTruck = this.minutes;
      this.vehicles.push({ id: this.nextId++, kind: "truck", x: -6, stop: this.deliveryStop(), state: "in", t: 0, payload: 0 });
    }
    for (const v of this.vehicles) {
      const speed = v.kind === "ambulance" ? 9 : 6;
      if (v.state === "in") {
        v.x = Math.min(v.stop, v.x + speed * t);
        if (v.x >= v.stop) {
          v.state = "stopped";
          v.t = 0;
          if (v.kind === "truck") this.unload();
          else this.ambulanceArrives();
        }
      } else if (v.state === "stopped") {
        v.t += t;
        if (v.t > (v.kind === "truck" ? 4 : 3)) v.state = "out";
      } else v.x += speed * t;
    }
    this.vehicles = this.vehicles.filter((v) => v.x < W + 8);
  }

  private deliveryCells() {
    const w = this.world;
    const out: number[] = [];
    for (const r of w.roomsOf("deliveries")) for (const c of r.cells) if (w.walkable(c) && !w.wall[c]) out.push(c);
    if (!out.length) for (let x = 2; x < 16; x++) for (const z of [PAVEMENT_Z - 1, PAVEMENT_Z - 2]) out.push(idx(x, z));
    return out.filter((c) => w.walkable(c));
  }

  private deliveryStop() {
    const cells = this.deliveryCells();
    if (!cells.length) return GATE.x;
    return cells.reduce((s, c) => s + cx(c), 0) / cells.length;
  }

  private unload() {
    const cells = this.deliveryCells();
    const taken = new Set([...this.crates.values()].filter((c) => !c.carriedBy).map((c) => idx(Math.floor(c.x), Math.floor(c.z))));
    const free = cells.filter((c) => !taken.has(c));
    let n = 0;
    while (this.orders.length && n < 16) {
      const jobId = this.orders.shift()!;
      const j = this.jobs.get(jobId);
      if (!j) continue;
      const cell = free.length ? free.shift()! : cells[n % Math.max(1, cells.length)] ?? idx(GATE.x, PAVEMENT_Z - 1);
      const c: Crate = { id: this.nextId++, x: cx(cell) + 0.5, z: cz(cell) + 0.5, job: jobId, carriedBy: 0 };
      this.crates.set(c.id, c);
      j.crate = c.id;
      n++;
    }
  }

  private ambulanceArrives() {
    const v = this.vehicles.find((x) => x.kind === "ambulance" && x.state === "stopped" && !x.payload);
    if (!v) return;
    v.payload = 1;
    const p = this.spawn("patient", null, this.pickCondition(true), true);
    p.x = v.stop + 0.5;
    this.messages.push({ text: `Ambulance: ${p.name}, ${CONDITIONS[p.cond!].name.toLowerCase()}.`, kind: "info" });
  }

  // ------------------------------------------------------------- arrivals

  private eventOn(id: EventId) {
    return this.events.some((e) => e.id === id && e.until > this.minutes);
  }

  private pickCondition(critical: boolean): ConditionId {
    const pool = (Object.entries(CONDITIONS) as [ConditionId, (typeof CONDITIONS)[ConditionId]][]).filter(([, c]) => !!c.critical === critical && c.weight > 0);
    const weight = (id: ConditionId, base: number) => base * (id === "flu" && this.eventOn("fluSeason") ? 3 : 1) * (id === "burns" && this.eventOn("heatwave") ? 3 : 1);
    // Without a chief of medicine there's no surgery; send fewer surgical cases until there is.
    const surgical = this.roomUnlocked("theatre") && this.world.roomsOf("theatre").some((r) => r.valid);
    const total = pool.reduce((n, [id, c]) => n + weight(id, c.weight) * (!surgical && c.path.includes("theatre") ? 0.3 : 1), 0);
    let r = this.rng.next() * total;
    for (const [id, c] of pool) {
      r -= weight(id, c.weight) * (!surgical && c.path.includes("theatre") ? 0.3 : 1);
      if (r <= 0) return id;
    }
    return pool[0][0];
  }

  private validRoom(type: RoomId) {
    return this.world.roomsOf(type).some((r) => r.valid);
  }

  /** Walk-ins once there's a reception; ambulances once there's an emergency room. */
  private arrivals(dm: number) {
    const h = this.hour;
    const night = h < 6 || h >= 22 ? 0.35 : h < 9 || h > 19 ? 0.7 : 1;
    if (this.validRoom("reception")) {
      const gps = this.world.roomsOf("gp").filter((r) => r.valid).length;
      const rate = (1.1 + this.rep * 0.75) * night * Math.min(1.6, 0.45 + 0.3 * gps);
      if (this.rng.next() < (rate / 60) * dm) this.spawn("patient", null, this.pickCondition(false));
    }
    if (this.validRoom("emergency")) {
      const rate = (0.12 + this.rep * 0.05) * (night < 1 ? 0.7 : 1);
      if (this.rng.next() < (rate / 60) * dm) this.callAmbulance();
    }
  }

  private callAmbulance() {
    this.vehicles.push({ id: this.nextId++, kind: "ambulance", x: -6, stop: GATE.x, state: "in", t: 0, payload: 0 });
  }

  // ---------------------------------------------------------------- moving

  cellOf(p: Person) {
    return idx(Math.min(W - 1, Math.max(0, Math.floor(p.x))), Math.min(H - 1, Math.max(0, Math.floor(p.z))));
  }

  /** Head for a cell. False when there's no way there. */
  private goTo(p: Person, cell: number) {
    p.at = null;
    if (p.goal === cell && (p.path.length || this.cellOf(p) === cell)) return true;
    const from = this.cellOf(p);
    // Don't retry a route that just failed for a couple of seconds (an unreachable room).
    if (p.failCell === cell && this.time < p.failUntil) return false;
    const path = this.world.path(this.world.walkable(from) ? from : this.world.nearestWalkable(p.x, p.z), cell);
    if (!path) {
      p.failCell = cell;
      p.failUntil = this.time + 3;
      return false;
    }
    p.path = path;
    p.goal = cell;
    return true;
  }

  private arrived(p: Person) {
    return p.path.length === 0 && p.goal >= 0 && this.cellOf(p) === p.goal;
  }

  private move(p: Person, t: number) {
    if (!p.path.length || p.state === "dead") {
      if (p.pose === "walk" || p.pose === "carry") p.pose = p.carrying ? "carry" : "stand";
      return;
    }
    const w = this.world;
    const speed = (p.kind === "staff" ? ROLE_SPEED.staff * (p.energy < 10 ? 0.6 : 1) : ROLE_SPEED.patient * (p.health < 30 ? 0.6 : 1)) * t;
    let budget = speed;
    while (budget > 0 && p.path.length) {
      const next = p.path[0];
      if (!w.walkable(next) && next !== p.goal) {
        // Something was built in the way: find another route.
        const g = p.goal;
        p.goal = -1;
        if (!this.goTo(p, g)) p.path = [];
        return;
      }
      const tx = cx(next) + 0.5;
      const tz = cz(next) + 0.5;
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d <= budget) {
        p.x = tx;
        p.z = tz;
        budget -= d;
        p.path.shift();
        // Footfall dirties floors (indoors), sick patients more.
        if (w.found[next]) {
          const f = w.floorAt(next);
          const mess = (p.cond && CONDITIONS[p.cond].messy ? 4 : 1) * 0.004 / (f ? FLOORS[f].clean : 1);
          w.dirt[next] = Math.min(1, w.dirt[next] + mess);
        }
      } else {
        p.x += (dx / d) * budget;
        p.z += (dz / d) * budget;
        budget = 0;
      }
      if (d > 1e-4) p.heading = Math.atan2(dx, dz);
    }
    p.pose = p.carrying ? "carry" : "walk";
  }

  private idle(p: Person) {
    p.state = "idle";
    p.room = 0;
    p.task = 0;
    p.onDuty = false;
    p.at = null;
    p.path = [];
    p.goal = -1;
  }

  // ----------------------------------------------------------------- staff

  /** How many of a role a room wants. */
  private wants(r: RoomInstance, role: Role) {
    if (r.type === "office") return ADMINS.includes(role) ? 1 : 0;
    const staff = STAFFED_BY[r.type];
    if (!staff || !staff.includes(role)) return 0;
    if (r.type === "ward") {
      const beds = r.objects.filter((id) => this.world.objects.get(id)?.kind === "bed").length;
      return Math.max(1, Math.ceil(beds / 4));
    }
    return 1;
  }

  private assigned(r: RoomInstance, role: Role) {
    // An office seats one administrator of any kind.
    if (r.type === "office") return ADMINS.reduce((n, a) => n + (this.assignedN.get(`${r.cells[0]}:${a}`) ?? 0), 0);
    return this.assignedN.get(`${r.cells[0]}:${role}`) ?? 0;
  }

  /** Is the room staffed right now (everyone it needs at their station)? */
  staffed(r: RoomInstance) {
    const need = STAFFED_BY[r.type];
    if (!need) return true;
    const on = this.duty.get(r.cells[0]);
    if (on) return need.every((role) => on.has(role));
    // Outside a substep (UI, tests), look it up.
    return need.every((role) => [...this.people.values()].some((p) => p.role === role && p.room === r.cells[0] && p.onDuty));
  }

  private stationCell(r: RoomInstance, p: Person): { cell: number; at: { x: number; z: number } | null } {
    const w = this.world;
    const objs = r.objects.map((id) => w.objects.get(id)!).filter((o) => o?.built);
    const find = (k: ObjectId) => objs.find((o) => o.kind === k);
    const role = p.role!;
    // Sit on the room's chair when it has one (reception, consulting rooms, offices).
    const chair = find("chair");
    if (chair && (r.type === "reception" || r.type === "gp" || r.type === "office")) return { cell: objCells(chair)[0], at: { x: chair.x + 0.5, z: chair.z + 0.5 } };
    const by = (k: ObjectId) => {
      const o = find(k);
      if (!o) return null;
      const a = accessCell(o);
      return { cell: idx(a.x, a.z), at: null };
    };
    if (r.type === "theatre") {
      const t = find("opTable");
      if (t && role === "surgeon") {
        const cells = objCells(t);
        for (const c of cells)
          for (const [dx, dz] of FRONT) {
            const n = idx(cx(c) + dx, cz(c) + dz);
            if (inside(cx(c) + dx, cz(c) + dz) && w.walkable(n) && w.roomOf[n] === r.id) return { cell: n, at: null };
          }
      }
      return by("anesthesia") ?? { cell: w.nearestWalkable(r.x, r.z), at: null };
    }
    const spot = { radiology: "leadScreen", pharmacy: "medCabinet", emergency: "defib", ward: "monitor" } as Partial<Record<RoomId, ObjectId>>;
    const k = spot[r.type];
    const s = k ? by(k) : null;
    if (s && w.walkable(s.cell)) return s;
    // Otherwise any free floor in the room, spread out by person.
    const free = r.cells.filter((c) => w.walkable(c) && !w.occ[c]);
    return { cell: free.length ? free[p.id % free.length] : w.nearestWalkable(r.x, r.z), at: null };
  }

  private staffStep(p: Person, t: number, dm: number) {
    const role = p.role!;
    const medical = role === "doctor" || role === "nurse" || role === "surgeon" || role === "receptionist";
    if (medical) p.energy = Math.max(0, p.energy - (dm / 60) * (p.onDuty ? 4 : 2));
    if (role === "workman") return this.workmanStep(p, t);
    if (role === "janitor") return this.janitorStep(p, t);
    // Tired: rest in the staff room if there is one.
    if (medical && (p.state === "rest" || (p.energy < 15 && this.time >= p.cool))) {
      const room = this.world.roomsOf("staffRoom").find((r) => r.valid);
      if (room) {
        if (p.state !== "rest") {
          const sofa = room.objects.map((id) => this.world.objects.get(id)!).find((o) => o.kind === "sofa");
          const cell = sofa ? accessCell(sofa) : null;
          if (!this.goTo(p, cell ? idx(cell.x, cell.z) : this.world.nearestWalkable(room.x, room.z))) {
            // Can't get there: carry on working, tired, and try again later.
            p.cool = this.time + 20;
          } else {
            p.onDuty = false;
            p.state = "rest";
            const k = `${p.room}:${role}`;
            if (p.room) this.assignedN.set(k, Math.max(0, (this.assignedN.get(k) ?? 1) - 1));
            p.room = 0;
            return;
          }
        }
        if (p.state === "rest" && (this.arrived(p) || !p.path.length)) {
          p.pose = "sit";
          const coffee = room.objects.some((id) => this.world.objects.get(id)?.kind === "coffee");
          p.energy = Math.min(100, p.energy + (dm / 60) * (coffee ? 75 : 50));
          if (p.energy >= 95) {
            p.state = "idle";
            p.pose = "stand";
            p.goal = -1;
          }
        }
        return;
      }
    }
    // Find a room to work in (at most once a second while there's none).
    if (!p.room && this.time < p.cool) return;
    if (!p.room) {
      const rooms = this.world.rooms.filter((r) => r.valid && this.wants(r, role) > this.assigned(r, role) && (r.type !== "theatre" || this.roomUnlocked("theatre")));
      if (!rooms.length) {
        p.cool = this.time + 1;
        if (p.state !== "wander" || this.arrived(p)) {
          p.state = "wander";
          p.onDuty = false;
          const spot = idx(Math.min(W - 2, GATE.x + 2 + (p.id % 9)), PAVEMENT_Z - 2 - (p.id % 3));
          this.goTo(p, this.world.walkable(spot) ? spot : this.world.nearestWalkable(GATE.x, PAVEMENT_Z - 2));
        }
        return;
      }
      rooms.sort((a, b) => this.assigned(a, role) - this.assigned(b, role) || Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      p.room = rooms[0].cells[0];
      const k = `${p.room}:${role}`;
      this.assignedN.set(k, (this.assignedN.get(k) ?? 0) + 1);
      p.state = "toStation";
      p.onDuty = false;
    }
    const r = this.roomByKey(p.room);
    if (!r || !r.valid) return this.idle(p);
    const st = this.stationCell(r, p);
    if (p.state === "toStation") {
      if (!this.goTo(p, st.cell)) return this.idle(p);
      if (this.arrived(p) || this.cellOf(p) === st.cell) {
        p.state = "station";
        p.onDuty = true;
        p.at = st.at;
        p.pose = st.at ? "sit" : "stand";
      }
      return;
    }
    if (p.state === "station") {
      p.onDuty = true;
      // Nurses on a ward walk between the beds now and then.
      if (r.type === "ward" && p.path.length === 0 && this.rng.next() < t * 0.08) {
        const beds = r.objects.map((id) => this.world.objects.get(id)!).filter((o) => o.kind === "bed");
        const b = beds[Math.floor(this.rng.next() * beds.length)];
        if (b) {
          const a = accessCell(b);
          this.goTo(p, idx(a.x, a.z));
        }
      }
      if (!p.path.length) p.pose = p.at ? "sit" : role === "surgeon" || p.timer > 0 ? "work" : "stand";
      return;
    }
    p.state = "toStation";
  }

  private workmanStep(p: Person, t: number) {
    const w = this.world;
    const rate = this.adminActive("facilities") ? 1.3 : 1;
    if (p.carrying || p.task) {
      const j = this.jobs.get(p.task);
      if (!j) {
        if (p.carrying) {
          this.crates.delete(p.carrying);
          p.carrying = 0;
        }
        return this.idle(p);
      }
      if (p.state === "fetch") {
        const c = this.crates.get(j.crate);
        if (!c) return this.idle(p);
        const cell = idx(Math.floor(c.x), Math.floor(c.z));
        if (!this.goTo(p, cell)) {
          j.worker = 0;
          return this.idle(p);
        }
        if (this.arrived(p) || this.cellOf(p) === cell) {
          c.carriedBy = p.id;
          p.carrying = c.id;
          p.state = "carry";
          p.goal = -1;
        }
        return;
      }
      const site = this.jobSite(j, p);
      if (site < 0) {
        j.worker = 0;
        return this.idle(p);
      }
      if (p.state !== "work") {
        p.state = p.carrying ? "carry" : "work";
        if (!this.goTo(p, site)) {
          j.worker = 0;
          return this.idle(p);
        }
        if (this.arrived(p) || this.cellOf(p) === site) p.state = "work";
        else return;
      }
      if (p.carrying && !this.arrived(p) && this.cellOf(p) !== site) {
        p.state = "carry";
        return;
      }
      p.pose = "work";
      j.done += t * rate;
      if (j.done >= j.work) this.complete(j, p);
      return;
    }
    // Pick the nearest job that's ready (materials here, or none needed).
    let best: Job | null = null;
    let bd = Infinity;
    for (const j of this.jobs.values()) {
      if (j.worker) continue;
      if (j.needsCrate) {
        const c = j.crate ? this.crates.get(j.crate) : null;
        if (!c || c.carriedBy) continue;
      }
      const at = j.kind === "object" ? objCells(w.objects.get(j.obj)!)[0] : j.cell;
      const d = Math.hypot(cx(at) - p.x, cz(at) - p.z) + (j.kind === "floor" ? 0 : 2);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    if (!best) {
      if (p.state !== "wander") {
        p.state = "wander";
        const spot = this.deliveryCells()[p.id % Math.max(1, this.deliveryCells().length)] ?? idx(GATE.x, PAVEMENT_Z - 1);
        this.goTo(p, spot);
      }
      p.pose = "stand";
      return;
    }
    best.worker = p.id;
    p.task = best.id;
    p.state = best.needsCrate ? "fetch" : "work";
    if (!best.needsCrate) p.goal = -1;
  }

  /** Where a workman stands to do a job (a walkable cell next to it, or on it for floors). */
  private jobSite(j: Job, p: Person) {
    const w = this.world;
    let cells: number[];
    if (j.kind === "object") {
      const o = w.objects.get(j.obj);
      if (!o) return -1;
      const a = accessCell(o);
      if (inside(a.x, a.z) && w.walkable(idx(a.x, a.z))) return idx(a.x, a.z);
      cells = objCells(o);
    } else if (j.kind === "floor") {
      if (w.walkable(j.cell)) return j.cell;
      cells = [j.cell];
    } else cells = [j.cell];
    let best = -1;
    let bd = Infinity;
    for (const c of cells)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx(c) + dx;
          const z = cz(c) + dz;
          if ((!dx && !dz) || !inside(x, z)) continue;
          const n = idx(x, z);
          if (!w.walkable(n) || cells.includes(n)) continue;
          if (w.wall[n] === PLANNED) continue;
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < bd) {
            bd = d;
            best = n;
          }
        }
    return best;
  }

  private complete(j: Job, p: Person) {
    const w = this.world;
    this.jobs.delete(j.id);
    if (j.crate) this.crates.delete(j.crate);
    p.carrying = 0;
    p.task = 0;
    p.state = "idle";
    p.goal = -1;
    if (j.kind === "floor") {
      w.floor[j.cell] = w.floorPlan[j.cell] || w.floor[j.cell];
      w.floorPlan[j.cell] = 0;
    } else if (j.kind === "wall") {
      w.wall[j.cell] = BUILT;
      this.evict(j.cell);
    } else if (j.kind === "door") {
      w.wall[j.cell] = BUILT;
      w.door[j.cell] = BUILT;
    } else {
      const o = w.objects.get(j.obj);
      if (o) {
        o.built = true;
        for (const c of objCells(o)) if (!OBJECTS[o.kind].walkable) this.evict(c);
      }
    }
    w.touch();
  }

  /** Anyone standing where a wall or object just went up steps aside. */
  private evict(cell: number) {
    for (const q of this.people.values()) {
      if (this.cellOf(q) !== cell || q.at) continue;
      const n = this.world.nearestWalkable(q.x, q.z);
      q.x = cx(n) + 0.5;
      q.z = cz(n) + 0.5;
      q.goal = -1;
      q.path = [];
    }
  }

  private janitorStep(p: Person, t: number) {
    const w = this.world;
    const rate = (w.roomsOf("janitor").some((r) => r.valid) ? 1.4 : 1) * (this.adminActive("facilities") ? 1.3 : 1);
    if (p.state === "clean" && p.task >= 0 && w.dirt[p.task] > 0.04) {
      if (this.arrived(p) || this.cellOf(p) === p.task) {
        p.pose = "clean";
        w.dirt[p.task] = Math.max(0, w.dirt[p.task] - t * 0.35 * rate);
        for (const [dx, dz] of FRONT) {
          const x = cx(p.task) + dx;
          const z = cz(p.task) + dz;
          if (inside(x, z)) w.dirt[idx(x, z)] = Math.max(0, w.dirt[idx(x, z)] - t * 0.12 * rate);
        }
      }
      return;
    }
    if (p.state === "clean") this.cleanTargets.delete(p.task);
    // The dirtiest reachable cell nearby that nobody else is on.
    let best = -1;
    let bs = 0.18;
    for (let i = 0; i < w.dirt.length; i++) {
      const d = w.dirt[i];
      if (d < 0.18 || !w.found[i] || this.cleanTargets.has(i) || !w.walkable(i)) continue;
      const s = d - Math.hypot(cx(i) - p.x, cz(i) - p.z) * 0.01;
      if (s > bs) {
        bs = s;
        best = i;
      }
    }
    if (best >= 0 && this.goTo(p, best)) {
      p.state = "clean";
      p.task = best;
      this.cleanTargets.add(best);
      return;
    }
    p.state = "wander";
    p.task = -1;
    p.pose = "stand";
  }

  // --------------------------------------------------------------- patients

  private release(objId: number) {
    const pid = this.claims.get(objId);
    this.claims.delete(objId);
    if (pid) {
      const p = this.people.get(pid);
      if (p && p.slot === objId) p.slot = 0;
    }
  }

  private freeSlot(type: RoomId | "seat", p: Person) {
    const w = this.world;
    if (type === "seat") {
      const rooms = w.roomsOf("waiting").filter((r) => r.valid);
      let best: { o: Obj; d: number } | null = null;
      for (const r of rooms)
        for (const id of r.objects) {
          const o = w.objects.get(id)!;
          if (o.kind !== "seats" || !o.built) continue;
          if ((this.seatUse.get(id) ?? 0) >= 3) continue;
          const d = Math.hypot(o.x - p.x, o.z - p.z);
          if (!best || d < best.d) best = { o, d };
        }
      return best?.o ?? null;
    }
    const kind = PATIENT_OBJ[type as Step | "reception"];
    for (const r of w.roomsOf(type)) {
      if (!r.valid || !this.staffed(r)) continue;
      for (const id of r.objects) {
        const o = w.objects.get(id)!;
        if (o.kind === kind && o.built && !this.claims.has(id)) return o;
      }
    }
    return null;
  }

  private stepNow(p: Person): Step | null {
    const c = CONDITIONS[p.cond!];
    return c.path[p.step] ?? null;
  }

  private patientStep(p: Person, t: number, dm: number) {
    if (p.state === "dead") {
      p.timer += t;
      p.pose = "dead";
      if (p.timer > 8) this.people.delete(p.id);
      return;
    }
    if (p.state === "leaving") {
      const exit = idx(GATE.x, PAVEMENT_Z);
      if (!this.goTo(p, exit) || this.arrived(p) || this.cellOf(p) === exit) this.people.delete(p.id);
      return;
    }
    const cond = CONDITIONS[p.cond!];
    const hours = dm / 60;
    const inTreatment = p.state === "inStep";
    const step = this.stepNow(p);
    // Health: falls while untreated (half as fast once diagnosed), rises in a ward bed.
    if (inTreatment && step === "ward") p.health = Math.min(100, p.health + hours * 7);
    else if (!inTreatment) p.health -= hours * cond.decay * (p.step > 0 ? 0.5 : 1);
    p.hunger = Math.min(100, p.hunger + hours * 5);
    p.bladder = Math.min(100, p.bladder + hours * 7);
    if (!inTreatment) p.waited += dm;
    // Dirty floors make people sick.
    if (!p.infected && this.world.dirt[this.cellOf(p)] > 0.6 && this.rng.next() < hours * 0.05) {
      p.infected = true;
      this.stats.infections++;
    }
    if (p.health <= 0) return this.die(p);
    // Waited all day for something the hospital can't do: go elsewhere.
    if (!cond.critical && p.waited > 10 * 60 && p.state === "waitStep") {
      this.stats.left++;
      this.stats.recent.l++;
      this.messages.push({ text: `${p.name} gave up waiting and left.`, kind: "bad" });
      return this.leave(p);
    }
    // Waiting patients look around twice a second, not every tick.
    const waiting = p.state === "waitStep" || (p.state === "checkin" && !!p.seat);
    if (waiting && this.time < p.cool) return;
    if (waiting) p.cool = this.time + 0.5;
    switch (p.state) {
      case "arrive":
      case "checkin":
        return this.checkIn(p, dm);
      case "waitStep":
        return this.waitForStep(p);
      case "need":
        return this.meetNeed(p, dm);
      case "toStep": {
        const o = this.world.objects.get(p.slot);
        if (!o) {
          p.state = "waitStep";
          return;
        }
        const target = LIE_ON.has(o.kind) ? objCells(o)[0] : (() => {
          const a = accessCell(o);
          return idx(a.x, a.z);
        })();
        if (!this.goTo(p, target)) {
          this.release(o.id);
          p.state = "waitStep";
          return;
        }
        if (this.arrived(p) || this.cellOf(p) === target) {
          p.state = "inStep";
          p.timer = 0;
          if (LIE_ON.has(o.kind)) {
            const s = slots(o)[0];
            p.at = s;
            p.pose = "lie";
          } else p.pose = "stand";
        }
        return;
      }
      case "inStep":
        return this.treat(p, dm);
    }
  }

  private leave(p: Person) {
    if (p.slot) this.release(p.slot);
    p.state = "leaving";
    p.at = null;
    p.goal = -1;
  }

  private die(p: Person) {
    if (p.slot) this.release(p.slot);
    p.state = "dead";
    p.pose = "dead";
    p.timer = 0;
    p.path = [];
    this.stats.deaths++;
    this.stats.recent.d++;
    this.stats.today.deaths++;
    this.rep = Math.max(0, this.rep - 0.08);
    this.messages.push({ text: `${p.name} died of ${CONDITIONS[p.cond!].name.toLowerCase()}.`, kind: "bad" });
  }

  private checkIn(p: Person, dm: number) {
    if (p.checkedIn) {
      p.state = "waitStep";
      return;
    }
    const w = this.world;
    const rec = w.roomsOf("reception").find((r) => r.valid);
    if (!rec) {
      // Nowhere to check in: hang about by the door.
      p.state = "arrive";
      this.goTo(p, w.nearestWalkable(GATE.x + 2, PAVEMENT_Z - 2));
      return;
    }
    const desk = rec.objects.map((id) => w.objects.get(id)!).find((o) => o.kind === "receptionDesk" && o.built);
    if (!desk) return;
    const a = accessCell(desk);
    const spot = idx(a.x, a.z);
    const holder = this.claims.get(desk.id);
    if (holder && holder !== p.id) {
      // Someone's at the desk: queue in the waiting room.
      p.state = "checkin";
      this.waitSeated(p);
      return;
    }
    this.claims.set(desk.id, p.id);
    p.slot = desk.id;
    p.seat = null;
    p.at = null;
    p.state = "checkin";
    if (!this.goTo(p, spot)) return;
    if (this.arrived(p) || this.cellOf(p) === spot) {
      p.pose = "stand";
      p.at = null;
      if (!this.staffed(rec)) return;
      p.timer += dm;
      if (p.timer >= 5) {
        p.checkedIn = true;
        p.timer = 0;
        this.release(desk.id);
        p.state = "waitStep";
      }
    }
  }

  /** Find a seat (or a spot in the waiting room) and head for it. */
  private sitDown(p: Person) {
    const seat = this.freeSlot("seat", p);
    if (seat) {
      const taken = [...this.people.values()].filter((q) => q.id !== p.id && q.slot === seat.id && q.seat).map((q) => `${q.seat!.x},${q.seat!.z}`);
      const a = accessCell(seat);
      if (this.goTo(p, idx(a.x, a.z))) {
        p.slot = seat.id;
        p.seat = slots(seat).find((s) => !taken.includes(`${s.x},${s.z}`)) ?? slots(seat)[0];
        return;
      }
    }
    p.seat = null;
    const room = this.world.roomsOf("waiting").find((r) => r.valid) ?? this.world.roomsOf("reception").find((r) => r.valid);
    if (room) {
      const free = room.cells.filter((c) => this.world.walkable(c) && !this.world.occ[c]);
      if (free.length) this.goTo(p, free[p.id % free.length]);
    }
  }

  /** Wait sitting down if there's a seat, standing if not. */
  private waitSeated(p: Person) {
    const onSeat = p.seat && p.slot && this.world.objects.get(p.slot)?.kind === "seats";
    if (onSeat) {
      if (!p.path.length) {
        p.at = p.seat;
        p.pose = "sit";
      }
      return;
    }
    if (!p.path.length && !p.at) this.sitDown(p);
    if (!p.path.length && !p.at) p.pose = "stand";
  }

  private waitForStep(p: Person) {
    const step = this.stepNow(p);
    if (!step) return this.discharge(p);
    // Needs first, while waiting.
    if (p.hunger > 70 && this.validRoom("cafe")) {
      p.seat = null;
      p.at = null;
      p.state = "need";
      p.needTarget = "food";
      return;
    }
    if (p.bladder > 75 && this.validRoom("toilets")) {
      p.seat = null;
      p.at = null;
      p.state = "need";
      p.needTarget = "toilet";
      return;
    }
    const o = this.freeSlot(STEP_ROOM[step], p);
    if (o) {
      this.claims.set(o.id, p.id);
      p.slot = o.id;
      p.seat = null;
      p.state = "toStep";
      p.at = null;
      p.goal = -1;
      return;
    }
    // Nothing free: sit and wait.
    this.waitSeated(p);
  }

  private meetNeed(p: Person, dm: number) {
    const w = this.world;
    const type: RoomId = p.needTarget === "food" ? "cafe" : "toilets";
    const kind: ObjectId = p.needTarget === "food" ? "vending" : "toilet";
    const room = w.roomsOf(type).find((r) => r.valid);
    const o = room?.objects.map((id) => w.objects.get(id)!).find((x) => x.kind === kind && x.built);
    if (!o) {
      p.state = "waitStep";
      return;
    }
    const a = accessCell(o);
    const spot = kind === "toilet" ? objCells(o)[0] : idx(a.x, a.z);
    if (!this.goTo(p, spot)) {
      p.state = "waitStep";
      return;
    }
    if (this.arrived(p) || this.cellOf(p) === spot) {
      p.timer += dm;
      p.pose = kind === "toilet" ? "sit" : "stand";
      if (kind === "toilet") p.at = slots(o)[0];
      if (p.timer > 10) {
        p.timer = 0;
        p.at = null;
        if (kind === "vending") {
          p.hunger = 0;
          this.earn(6);
        } else {
          p.bladder = 0;
          w.dirt[spot] = Math.min(1, w.dirt[spot] + 0.08);
        }
        p.state = "waitStep";
        p.goal = -1;
      }
    }
  }

  private treat(p: Person, dm: number) {
    const step = this.stepNow(p)!;
    const o = this.world.objects.get(p.slot);
    const r = o ? this.world.rooms.find((x) => x.objects.includes(o.id)) : null;
    if (!o || !r || !r.valid) {
      if (o) this.release(o.id);
      p.state = "waitStep";
      p.at = null;
      return;
    }
    // Work only happens with the staff at their stations.
    if (!this.staffed(r)) return;
    let need = step === "ward" ? (CONDITIONS[p.cond!].wardHours ?? 8) * 60 : STEP_MINUTES[step];
    // A monitor on the ward speeds recovery.
    if (step === "ward" && r.objects.some((id) => this.world.objects.get(id)?.kind === "monitor")) need *= 0.8;
    p.timer += dm;
    if (p.timer < need) return;
    // Step done.
    if (step === "radiology") this.stats.scans++;
    if (step === "pharmacy") this.stats.meds++;
    if (step === "theatre") this.stats.ops++;
    if (step === "emergency") this.stats.er++;
    if (step === "ward") this.stats.wardDone++;
    this.release(o.id);
    p.at = null;
    p.timer = 0;
    p.step++;
    p.waited = 0;
    p.health = Math.max(p.health, step === "theatre" || step === "emergency" ? 55 : p.health);
    p.state = "waitStep";
    if (!this.stepNow(p)) this.discharge(p);
  }

  private discharge(p: Person) {
    const cond = CONDITIONS[p.cond!];
    if (p.infected && p.cond !== "infection") {
      // Caught something here: back to the ward, on the house.
      this.messages.push({ text: `${p.name} caught a hospital infection.`, kind: "bad" });
      this.earn(cond.fee);
      p.cond = "infection";
      p.step = 0;
      p.infected = false;
      p.state = "waitStep";
      return;
    }
    this.earn(cond.fee);
    this.stats.treated++;
    this.stats.recent.t++;
    this.stats.today.treated++;
    this.stats.recent.wait += (this.minutes - p.arrived) / 60;
    this.stats.recent.waits++;
    if (this.stats.treated % 10 === 0) this.messages.push({ text: `${this.stats.treated} patients treated.`, kind: "good" });
    this.leave(p);
  }

  // ----------------------------------------------------------------- hourly

  private hourly(hour: number) {
    const h = hour % 24;
    // Wages.
    let wages = 0;
    for (const p of this.people.values()) if (p.kind === "staff") wages += ROLES[p.role!].wage / 24;
    if (this.adminActive("accountant")) wages *= 0.95;
    this.spend(Math.round(wages));
    // Hygiene: how clean the floors are, indoors.
    let n = 0;
    let dirt = 0;
    const w = this.world;
    for (let i = 0; i < w.found.length; i++)
      if (w.found[i] && w.floor[i]) {
        n++;
        dirt += w.dirt[i];
      }
    this.hygiene = n ? Math.max(0, 1 - (dirt / n) * 2.5) : 1;
    const janitors = [...this.people.values()].filter((p) => p.role === "janitor").length;
    this.stats.cleanHours = this.hygiene >= 0.85 && janitors >= 3 ? this.stats.cleanHours + 1 : 0;
    if (this.hygiene < 0.55 && n > 30 && !this.eventOn("outbreak")) {
      this.events.push({ id: "outbreak", until: this.minutes + 12 * 60 });
      this.messages.push({ text: `${EVENTS.outbreak.name}: ${EVENTS.outbreak.desc}`, kind: "bad" });
    }
    // Reputation drifts toward how the hospital's doing.
    const rc = this.stats.recent;
    const cure = rc.t + rc.d + rc.l > 0 ? rc.t / (rc.t + 3 * rc.d + rc.l) : 0.6;
    const wait = rc.waits ? rc.wait / rc.waits : 2;
    const target = 5 * (0.5 * cure + 0.25 * this.hygiene + 0.25 * Math.max(0, Math.min(1, 1 - (wait - 1) / 6)));
    this.rep += (target - this.rep) * 0.06;
    this.rep = Math.max(0, Math.min(5, this.rep));
    // Events: one roll each morning.
    if (h === 6 && this.day > 1 && this.rng.next() < 0.45) this.startEvent();
    if (h === 14 && this.eventOn("inspection")) this.inspect();
    // Midnight: the day's report, loan repayments, the rolling window fades.
    if (h === 0) {
      const today = { ...this.stats.today, day: this.day - 1 };
      this.stats.history = [...this.stats.history.slice(-13), today];
      this.stats.today = { day: this.day, income: 0, expense: 0, treated: 0, deaths: 0 };
      if (this.loan > 0) {
        const pay = Math.min(this.loan, 5_500);
        this.loan -= pay;
        this.spend(pay);
      }
      rc.t *= 0.6;
      rc.d *= 0.6;
      rc.l *= 0.6;
      rc.wait *= 0.6;
      rc.waits *= 0.6;
    }
    this.events = this.events.filter((e) => e.until > this.minutes);
    this.checkGrants();
    this.updateNotices();
  }

  private startEvent() {
    const pool: EventId[] = ["fluSeason", "inspection", "donation", "heatwave"];
    if (this.validRoom("emergency")) pool.push("busCrash");
    const id = this.rng.pick(pool);
    const until = this.minutes + (id === "fluSeason" ? 48 : 24) * 60;
    this.events.push({ id, until });
    this.messages.push({ text: `${EVENTS[id].name}: ${EVENTS[id].desc}`, kind: id === "donation" ? "good" : "info" });
    if (id === "donation") this.earn(3_000 + Math.round(this.rng.next() * 5) * 1_000);
    if (id === "busCrash") for (let i = 0; i < 5; i++) this.callAmbulance();
  }

  private inspect() {
    if (this.hygiene >= 0.8) {
      this.earn(5_000);
      this.rep = Math.min(5, this.rep + 0.3);
      this.messages.push({ text: "The inspector was impressed: +$5,000.", kind: "good" });
    } else if (this.hygiene < 0.6) {
      this.spend(4_000);
      this.rep = Math.max(0, this.rep - 0.3);
      this.messages.push({ text: "The inspector found dirty floors: fined $4,000.", kind: "bad" });
    }
  }

  grantDone(id: GrantId): boolean {
    const s = this.stats;
    const has = (role: Role) => [...this.people.values()].some((p) => p.role === role);
    switch (id) {
      case "opening":
        return this.validRoom("reception") && this.validRoom("waiting") && this.validRoom("gp") && has("receptionist") && has("doctor");
      case "firstTen":
        return s.treated >= 10;
      case "pharmacy":
        return this.validRoom("pharmacy") && s.meds >= 5;
      case "ward":
        return this.world.roomsOf("ward").some((r) => r.valid && r.objects.filter((id) => this.world.objects.get(id)?.kind === "bed").length >= 4) && s.wardDone >= 3;
      case "radiology":
        return this.validRoom("radiology") && s.scans >= 5;
      case "emergency":
        return s.er >= 5;
      case "surgery":
        return s.ops >= 3;
      case "clean":
        return s.cleanHours >= 24;
      case "fifty":
        return s.treated >= 50;
      case "stars":
        return this.rep >= 4;
      case "hundred":
        return s.treated >= 100;
    }
  }

  private checkGrants() {
    const director = this.adminActive("director");
    for (const id of GRANT_ORDER) {
      const g = GRANTS[id];
      if (!this.grants[id] && (!g.director || director)) this.grants[id] = "open";
      if (this.grants[id] === "open" && this.grantDone(id)) {
        this.grants[id] = "done";
        this.earn(g.reward);
        this.messages.push({ text: `Grant complete: ${g.name} (+$${g.reward.toLocaleString("en-US")})`, kind: "good" });
      }
    }
  }

  // ---------------------------------------------------------------- notices

  updateNotices() {
    const w = this.world;
    const out: Notice[] = [];
    const staff = [...this.people.values()].filter((p) => p.kind === "staff");
    const has = (r: Role) => staff.some((p) => p.role === r);
    if (!has("workman") && this.jobs.size) out.push({ kind: "warn", text: "Nothing gets built without workmen. Hire some from Staff." });
    if (!w.roomsOf("deliveries").length && this.jobs.size) out.push({ kind: "info", text: "Trucks are leaving materials on the kerb. Paint a Deliveries zone by the road." });
    if (!this.validRoom("reception")) out.push({ kind: "info", text: "Patients start arriving once you have a working reception." });
    else if (!has("receptionist")) out.push({ kind: "warn", text: "Hire a receptionist to check patients in." });
    if (this.validRoom("gp") && !has("doctor")) out.push({ kind: "warn", text: "Consulting rooms need a doctor." });
    if (!this.power.ok) {
      // Only a warning when it stops a room working; otherwise the TVs and vending machines are just off.
      const blocking = w.rooms.some((r) => r.issues.some((i) => i.includes("power")));
      out.push(blocking ? { kind: "warn", text: `Not enough power (${this.power.demand} needed, ${this.power.supply} available). Build a generator.` } : { kind: "info", text: "Some equipment (TVs, monitors, vending) has no power. A generator switches it on." });
    }
    if (this.hygiene < 0.7) out.push({ kind: "warn", text: `Hygiene is ${Math.round(this.hygiene * 100)}%. Hire janitors before infections spread.` });
    // What waiting patients need that doesn't exist.
    const missing = new Map<RoomId, number>();
    for (const p of this.people.values()) {
      if (p.kind !== "patient" || p.state !== "waitStep") continue;
      const s = this.stepNow(p);
      if (!s) continue;
      const room = STEP_ROOM[s];
      if (!this.world.roomsOf(room).some((r) => r.valid && this.staffed(r))) missing.set(room, (missing.get(room) ?? 0) + 1);
    }
    for (const [room, n] of missing) {
      const locked = !this.roomUnlocked(room) ? ` (hire a ${ROLES[ROOMS[room].unlock!].name.toLowerCase()} to unlock it)` : "";
      out.push({ kind: "warn", text: `${n} waiting for a working ${ROOMS[room].name.toLowerCase()}${locked}.` });
    }
    const tired = staff.filter((p) => p.energy < 10).length;
    if (tired && !this.validRoom("staffRoom")) out.push({ kind: "warn", text: `${tired} staff are exhausted. Build a staff room.` });
    for (const p of staff) if (ROLES[p.role!].admin && !p.onDuty && !w.roomsOf("office").some((r) => r.valid)) {
      out.push({ kind: "warn", text: `${ROLES[p.role!].name} needs an office to work from.` });
      break;
    }
    for (const r of w.rooms) if (!r.valid && r.issues.length) out.push({ kind: "info", text: `${ROOMS[r.type].name}: ${r.issues[0]}.` });
    this.notices = out.slice(0, 8);
  }

  /** Finish every job at once (tests, the menu's demo hospital). */
  instantBuild() {
    const w = this.world;
    for (const j of [...this.jobs.values()]) {
      if (j.kind === "floor") {
        w.floor[j.cell] = w.floorPlan[j.cell] || w.floor[j.cell];
        w.floorPlan[j.cell] = 0;
      } else if (j.kind === "wall") w.wall[j.cell] = BUILT;
      else if (j.kind === "door") {
        w.wall[j.cell] = BUILT;
        w.door[j.cell] = BUILT;
      } else {
        const o = w.objects.get(j.obj);
        if (o) o.built = true;
      }
      if (j.crate) this.crates.delete(j.crate);
      this.jobs.delete(j.id);
    }
    this.orders = [];
    w.touch();
  }

  // ------------------------------------------------------------------ saves

  toJSON() {
    return {
      v: 1,
      world: this.world.toJSON(),
      people: [...this.people.values()].map((p) => ({ ...p, path: [], goal: -1 })),
      jobs: [...this.jobs.values()],
      crates: [...this.crates.values()],
      orders: this.orders,
      cash: this.cash,
      minutes: this.minutes,
      rep: this.rep,
      stats: this.stats,
      grants: this.grants,
      events: this.events,
      loan: this.loan,
      claims: [...this.claims],
      nextId: this.nextId,
      rng: this.rng.s,
      lastTruck: this.lastTruck,
    };
  }

  static from(j: ReturnType<Sim["toJSON"]>) {
    const s = new Sim(1);
    s.world = World.from(j.world);
    for (const p of j.people) s.people.set(p.id, { ...p, state: p.kind === "staff" && p.state !== "rest" ? "idle" : p.state, room: p.kind === "staff" ? 0 : p.room, onDuty: false });
    for (const x of j.jobs) s.jobs.set(x.id, { ...x, worker: 0 });
    for (const c of j.crates) s.crates.set(c.id, { ...c, carriedBy: 0 });
    for (const p of s.people.values()) {
      p.carrying = 0;
      p.task = 0;
    }
    s.orders = j.orders;
    s.cash = j.cash;
    s.minutes = j.minutes;
    s.rep = j.rep;
    s.stats = { ...freshStats(), ...j.stats };
    s.grants = j.grants;
    s.events = j.events;
    s.loan = j.loan;
    s.claims = new Map(j.claims);
    s.nextId = j.nextId;
    s.rng.s = j.rng;
    s.lastTruck = j.lastTruck;
    s.lastHour = Math.floor(s.minutes / 60);
    return s;
  }
}

export function freshStats(): Stats {
  return {
    treated: 0,
    deaths: 0,
    left: 0,
    scans: 0,
    meds: 0,
    ops: 0,
    er: 0,
    wardDone: 0,
    infections: 0,
    income: 0,
    expense: 0,
    recent: { t: 0, d: 0, l: 0, wait: 0, waits: 0 },
    cleanHours: 0,
    history: [],
    today: { day: 1, income: 0, expense: 0, treated: 0, deaths: 0 },
  };
}

/** Building one bit of everything a starter hospital needs, for tests and the demo. */
export type { Obj };
