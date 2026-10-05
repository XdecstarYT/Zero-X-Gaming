/**
 * The building: a grid of cells with foundations, floors, walls and doors, the objects
 * standing on it, the rooms painted over it, and how people get around. Pure data plus
 * rules, no rendering.
 */
import { FLOORS, H, OBJECTS, PAVEMENT_Z, ROOMS, W, type FloorId, type ObjectId, type RoomId } from "./data";

export const FLOOR_IDS = Object.keys(FLOORS) as FloorId[];
export const ROOM_IDS = Object.keys(ROOMS) as RoomId[];
export const N = W * H;
export const idx = (x: number, z: number) => z * W + x;
export const cx = (i: number) => i % W;
export const cz = (i: number) => Math.floor(i / W);
export const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < W && z < H;

/** Wall/door states. */
export const NONE = 0;
export const BUILT = 1;
export const PLANNED = 2;

export interface Obj {
  id: number;
  kind: ObjectId;
  x: number;
  z: number;
  rot: number;
  built: boolean;
  /** Machines wear with use (0 new, 1 broken); workmen repair them. */
  wear?: number;
}

export interface RoomInstance {
  id: number;
  type: RoomId;
  cells: number[];
  objects: number[];
  valid: boolean;
  issues: string[];
  /** Centre, for labels and wandering. */
  x: number;
  z: number;
}

/** Facing direction for each rotation: the side people use the object from. */
export const FRONT: [number, number][] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];

export function footprint(kind: ObjectId, rot: number) {
  const d = OBJECTS[kind];
  return rot % 2 === 0 ? { w: d.w, d: d.d } : { w: d.d, d: d.w };
}

export function objCells(o: Pick<Obj, "kind" | "x" | "z" | "rot">) {
  const f = footprint(o.kind, o.rot);
  const out: number[] = [];
  for (let z = o.z; z < o.z + f.d; z++) for (let x = o.x; x < o.x + f.w; x++) out.push(idx(x, z));
  return out;
}

/** Where a person stands to use an object: the middle of its front edge, one cell out. */
export function accessCell(o: Pick<Obj, "kind" | "x" | "z" | "rot">) {
  const f = footprint(o.kind, o.rot);
  const [fx, fz] = FRONT[o.rot];
  const mx = o.x + Math.floor((f.w - 1) / 2);
  const mz = o.z + Math.floor((f.d - 1) / 2);
  let x = mx;
  let z = mz;
  if (fx > 0) x = o.x + f.w;
  if (fx < 0) x = o.x - 1;
  if (fz > 0) z = o.z + f.d;
  if (fz < 0) z = o.z - 1;
  return { x, z };
}

/** Spots on an object where a person sits or lies (world coordinates of cell centres). */
export function slots(o: Pick<Obj, "kind" | "x" | "z" | "rot">): { x: number; z: number }[] {
  const f = footprint(o.kind, o.rot);
  const centre = { x: o.x + f.w / 2, z: o.z + f.d / 2 };
  switch (o.kind) {
    case "seats":
    case "sofa": {
      const n = o.kind === "seats" ? 3 : 2;
      const along = f.w >= f.d;
      return Array.from({ length: n }, (_, i) => (along ? { x: o.x + i + 0.5, z: centre.z } : { x: centre.x, z: o.z + i + 0.5 }));
    }
    default:
      return [centre];
  }
}

export class World {
  found = new Uint8Array(N);
  /** Floor index + 1 (0 = bare ground). */
  floor = new Uint8Array(N);
  /** Planned floor index + 1. */
  floorPlan = new Uint8Array(N);
  wall = new Uint8Array(N);
  door = new Uint8Array(N);
  /** Room index + 1. */
  room = new Uint8Array(N);
  dirt = new Float32Array(N);
  /** Object id standing on the cell (0 = none). */
  occ = new Int32Array(N);
  objects = new Map<number, Obj>();
  nextObj = 1;
  rooms: RoomInstance[] = [];
  /** Cell → room instance id (0 = none). */
  roomOf = new Int32Array(N);
  version = 0;
  private roomsDirty = true;

  touch() {
    this.version++;
    this.roomsDirty = true;
  }

  isRoad(z: number) {
    return z > PAVEMENT_Z;
  }

  walkable(i: number) {
    const z = cz(i);
    if (this.isRoad(z)) return false;
    if (this.wall[i] === BUILT && this.door[i] !== BUILT) return false;
    const o = this.occ[i];
    if (o) {
      const obj = this.objects.get(o);
      if (obj && obj.built && !OBJECTS[obj.kind].walkable) return false;
    }
    return true;
  }

  floorAt(i: number): FloorId | null {
    return this.floor[i] ? FLOOR_IDS[this.floor[i] - 1] : null;
  }

  roomAt(i: number): RoomId | null {
    return this.room[i] ? ROOM_IDS[this.room[i] - 1] : null;
  }

  /** Can an object go here (all cells free of walls and other objects, on the plot)? */
  canPlace(kind: ObjectId, x: number, z: number, rot: number) {
    const f = footprint(kind, rot);
    const def = OBJECTS[kind];
    for (let zz = z; zz < z + f.d; zz++)
      for (let xx = x; xx < x + f.w; xx++) {
        if (!inside(xx, zz) || this.isRoad(zz) || zz >= PAVEMENT_Z) return false;
        const i = idx(xx, zz);
        if (this.wall[i] || this.door[i] || this.occ[i]) return false;
        if (def.indoor && !this.found[i]) return false;
      }
    // Things you sit on can be reached from any side; everything else needs its front clear.
    if (def.walkable) return true;
    const a = accessCell({ kind, x, z, rot });
    if (!inside(a.x, a.z)) return false;
    const ai = idx(a.x, a.z);
    if (this.wall[ai] && !this.door[ai]) return false;
    if (this.occ[ai]) {
      const other = this.objects.get(this.occ[ai]);
      if (other && !OBJECTS[other.kind].walkable) return false;
    }
    return true;
  }

  addObject(kind: ObjectId, x: number, z: number, rot: number, built = false): Obj | null {
    if (!this.canPlace(kind, x, z, rot)) return null;
    const o: Obj = { id: this.nextObj++, kind, x, z, rot, built };
    this.objects.set(o.id, o);
    for (const c of objCells(o)) this.occ[c] = o.id;
    this.touch();
    return o;
  }

  removeObject(id: number) {
    const o = this.objects.get(id);
    if (!o) return null;
    for (const c of objCells(o)) if (this.occ[c] === id) this.occ[c] = 0;
    this.objects.delete(id);
    this.touch();
    return o;
  }

  // ------------------------------------------------------------- rooms

  /** Recompute room instances (connected painted areas) and check each one's rules. */
  rebuildRooms(power: { ok: boolean }) {
    if (!this.roomsDirty) return false;
    this.roomsDirty = false;
    this.roomOf.fill(0);
    const rooms: RoomInstance[] = [];
    let id = 0;
    for (let i = 0; i < N; i++) {
      if (!this.room[i] || this.roomOf[i]) continue;
      const type = ROOM_IDS[this.room[i] - 1];
      id++;
      const cells: number[] = [];
      const stack = [i];
      this.roomOf[i] = id;
      while (stack.length) {
        const c = stack.pop()!;
        cells.push(c);
        const x = cx(c);
        const z = cz(c);
        for (const [dx, dz] of FRONT) {
          const nx = x + dx;
          const nz = z + dz;
          if (!inside(nx, nz)) continue;
          const n = idx(nx, nz);
          if (this.roomOf[n] || this.room[n] !== this.room[i]) continue;
          // Walls split rooms of the same type.
          if (this.wall[n] === BUILT && this.door[n] !== BUILT) continue;
          this.roomOf[n] = id;
          stack.push(n);
        }
      }
      let sx = 0;
      let sz = 0;
      for (const c of cells) {
        sx += cx(c) + 0.5;
        sz += cz(c) + 0.5;
      }
      rooms.push({ id, type, cells, objects: [], valid: false, issues: [], x: sx / cells.length, z: sz / cells.length });
    }
    for (const o of this.objects.values()) {
      const cs = objCells(o);
      const r = this.roomOf[cs[0]];
      if (r && cs.every((c) => this.roomOf[c] === r)) rooms[r - 1].objects.push(o.id);
    }
    for (const r of rooms) this.validate(r, power);
    this.rooms = rooms;
    return true;
  }

  private validate(r: RoomInstance, power: { ok: boolean }) {
    const def = ROOMS[r.type];
    const issues: string[] = [];
    // Floor space: cells not taken by walls.
    const area = r.cells.filter((c) => !this.wall[c]).length;
    if (area < def.min) issues.push(`Needs at least ${def.min} m² (has ${area})`);
    const have = new Map<ObjectId, number>();
    const broken: string[] = [];
    for (const id of r.objects) {
      const o = this.objects.get(id)!;
      if (!o.built) continue;
      // A broken machine doesn't count until it's repaired.
      if ((o.wear ?? 0) >= 1) {
        broken.push(OBJECTS[o.kind].name.toLowerCase());
        continue;
      }
      have.set(o.kind, (have.get(o.kind) ?? 0) + 1);
    }
    for (const [k, n] of Object.entries(def.needs) as [ObjectId, number][]) {
      const got = have.get(k) ?? 0;
      if (got < n) issues.push(`Needs ${n > 1 ? `${n} × ` : ""}${OBJECTS[k].name.toLowerCase()}${got ? ` (has ${got})` : ""}`);
    }
    for (const b of new Set(broken)) if (issues.some((i) => i.includes(b))) issues.push(`The ${b} is broken: a workman will repair it`);
    if (def.indoor && r.cells.some((c) => !this.found[c] || !this.floor[c])) issues.push("Must be indoors, on a finished floor");
    if (def.enclosed) {
      let open = false;
      let doors = 0;
      for (const c of r.cells) {
        const x = cx(c);
        const z = cz(c);
        for (const [dx, dz] of FRONT) {
          const nx = x + dx;
          const nz = z + dz;
          if (!inside(nx, nz)) {
            open = true;
            continue;
          }
          const n = idx(nx, nz);
          if (this.roomOf[n] === r.id) continue;
          if (this.door[n] === BUILT) doors++;
          else if (this.wall[n] !== BUILT) open = true;
        }
      }
      if (open) issues.push("Must be enclosed by walls");
      if (!doors) issues.push("Needs a door");
    }
    // Only required equipment stops a room working without power (a TV just goes dark).
    const powered = (Object.keys(def.needs) as ObjectId[]).some((k) => (OBJECTS[k].power ?? 0) > 0);
    if (powered && !power.ok) issues.push("Not enough power: build a generator");
    r.issues = issues;
    r.valid = issues.length === 0;
  }

  roomsOf(type: RoomId) {
    return this.rooms.filter((r) => r.type === type);
  }

  // --------------------------------------------------------- pathfinding

  /**
   * A* over walkable cells, 8-way without cutting corners. Returns cell indices from
   * start (exclusive) to goal (inclusive), or null.
   */
  path(from: number, to: number, maxNodes = 6000): number[] | null {
    if (from === to) return [];
    if (!this.walkable(to) && !this.endOk(to)) return null;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open = new MinHeap();
    g[from] = 0;
    const tx = cx(to);
    const tz = cz(to);
    const h = (i: number) => {
      const dx = Math.abs(cx(i) - tx);
      const dz = Math.abs(cz(i) - tz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    open.push(from, h(from));
    let seen = 0;
    while (open.size) {
      const c = open.pop();
      if (c === to) break;
      if (closed[c]) continue;
      closed[c] = 1;
      if (++seen > maxNodes) return null;
      const x = cx(c);
      const z = cz(c);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx;
          const nz = z + dz;
          if (!inside(nx, nz)) continue;
          const n = idx(nx, nz);
          if (closed[n]) continue;
          if (n !== to && !this.walkable(n)) continue;
          if (n === to && !this.walkable(n) && !this.endOk(n)) continue;
          if (dx && dz && (!this.walkable(idx(x + dx, z)) || !this.walkable(idx(x, z + dz)))) continue;
          // Doors are fine to pass through but a diagonal step through one isn't.
          if (dx && dz && (this.door[n] || this.door[c])) continue;
          const cost = g[c] + (dx && dz ? 1.414 : 1) + (this.dirt[n] > 0.6 ? 0.2 : 0);
          if (cost < g[n]) {
            g[n] = cost;
            came[n] = c;
            open.push(n, cost + h(n));
          }
        }
    }
    if (came[to] === -1) return null;
    const out: number[] = [];
    for (let c = to; c !== from; c = came[c]) out.push(c);
    return out.reverse();
  }

  /** A path may end on an object's cell (to lie on a bed, sit on a seat). */
  private endOk(i: number) {
    return !!this.occ[i];
  }

  /** Nearest walkable cell to (x, z), searching outward. */
  nearestWalkable(x: number, z: number) {
    for (let r = 0; r < 12; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = Math.floor(x) + dx;
          const nz = Math.floor(z) + dz;
          if (inside(nx, nz) && this.walkable(idx(nx, nz))) return idx(nx, nz);
        }
    return idx(Math.floor(x), Math.floor(z));
  }

  // -------------------------------------------------------------- saves

  toJSON() {
    const enc = (a: Uint8Array) => Array.from(a);
    return {
      found: rle(enc(this.found)),
      floor: rle(enc(this.floor)),
      floorPlan: rle(enc(this.floorPlan)),
      wall: rle(enc(this.wall)),
      door: rle(enc(this.door)),
      room: rle(enc(this.room)),
      dirt: rle(Array.from(this.dirt, (d) => Math.round(d * 20))),
      objects: [...this.objects.values()],
      nextObj: this.nextObj,
    };
  }

  static from(j: ReturnType<World["toJSON"]>) {
    const w = new World();
    w.found.set(unrle(j.found));
    w.floor.set(unrle(j.floor));
    w.floorPlan.set(unrle(j.floorPlan));
    w.wall.set(unrle(j.wall));
    w.door.set(unrle(j.door));
    w.room.set(unrle(j.room));
    w.dirt.set(unrle(j.dirt).map((d) => d / 20));
    for (const o of j.objects) {
      w.objects.set(o.id, { ...o });
      for (const c of objCells(o)) w.occ[c] = o.id;
    }
    w.nextObj = j.nextObj;
    w.touch();
    return w;
  }
}

/** Run-length encoding for the mostly-empty grids: [value, count, value, count, ...]. */
export function rle(a: number[]) {
  const out: number[] = [];
  for (let i = 0; i < a.length; ) {
    let j = i;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
}
export function unrle(r: number[]) {
  const out: number[] = [];
  for (let i = 0; i < r.length; i += 2) for (let k = 0; k < r[i + 1]; k++) out.push(r[i]);
  return out;
}

class MinHeap {
  private k: number[] = [];
  private p: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, pri: number) {
    const k = this.k;
    const p = this.p;
    let i = k.length;
    k.push(key);
    p.push(pri);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up] <= p[i]) break;
      [k[up], k[i]] = [k[i], k[up]];
      [p[up], p[i]] = [p[i], p[up]];
      i = up;
    }
  }
  pop() {
    const k = this.k;
    const p = this.p;
    const top = k[0];
    const lk = k.pop()!;
    const lp = p.pop()!;
    if (k.length) {
      k[0] = lk;
      p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}
