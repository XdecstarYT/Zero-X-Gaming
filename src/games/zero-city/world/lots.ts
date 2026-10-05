import { LOT_UNIT, WORLD } from "../config";
import { cumulative, inRect, polyLength, project, sampleAt, type P } from "../core/geom";
import { rng } from "../core/rng";
import { halfWidth, type REdge, type RoadGraph } from "./roads";
import type { Terrain } from "./terrain";

export type Zone = "R" | "C" | "I" | "M";
export const ZONES: Zone[] = ["R", "C", "I", "M"];

export interface Lot {
  id: number;
  edge: number;
  /** +1 / -1: which side of the road (see sideNormal). */
  side: number;
  /** Arc length of the lot's frontage centre along its edge. */
  s: number;
  w: number;
  d: number;
  cx: number;
  cz: number;
  /** Angle of the lot's frontage axis. */
  ang: number;
  zone: Zone;
}

export type ServiceKind = "police" | "fire" | "clinic" | "school" | "power" | "water" | "park" | "hospital" | "museum" | "university" | "stadium" | "tower";
/** The everyday civic buildings (landmarks are listed in `milestones.ts`). */
export const SERVICE_KINDS: ServiceKind[] = ["police", "fire", "clinic", "school", "power", "water", "park"];
/** Footprint (frontage × depth, metres) and coverage radius. */
export const SERVICE_SPEC: Record<ServiceKind, { w: number; d: number; radius: number }> = {
  police: { w: 24, d: 24, radius: 340 },
  fire: { w: 24, d: 30, radius: 360 },
  clinic: { w: 24, d: 24, radius: 320 },
  school: { w: 36, d: 36, radius: 420 },
  power: { w: 40, d: 40, radius: 0 },
  water: { w: 16, d: 16, radius: 0 },
  park: { w: 28, d: 28, radius: 200 },
  hospital: { w: 44, d: 40, radius: 700 },
  museum: { w: 40, d: 32, radius: 500 },
  university: { w: 60, d: 48, radius: 800 },
  stadium: { w: 76, d: 60, radius: 450 },
  tower: { w: 28, d: 28, radius: 700 },
};

export interface Service {
  id: number;
  kind: ServiceKind;
  cx: number;
  cz: number;
  ang: number;
  w: number;
  d: number;
}

/** Normal pointing away from the road on a side, for a road tangent (tx, tz). */
export const sideNormal = (tx: number, tz: number, side: number): [number, number] => [side * tz, -side * tx];

export const OCC = 4;
export const OCC_N = WORLD / OCC;

/**
 * What covers each 4 m cell of the ground: how many roads, and which lot
 * (positive id) or civic building (negative id). Lots may only go where
 * nothing else is.
 */
export class Occupancy {
  road = new Uint16Array(OCC_N * OCC_N);
  owner = new Int32Array(OCC_N * OCC_N);
  private roadCells = new Map<number, Int32Array>();

  addRoad(e: REdge) {
    this.removeRoad(e.id);
    const hw = halfWidth(e) + 0.5;
    const cells = new Set<number>();
    for (let i = 0; i < e.pts.length / 2 - 1; i++) {
      const ax = e.pts[i * 2];
      const az = e.pts[i * 2 + 1];
      const bx = e.pts[i * 2 + 2];
      const bz = e.pts[i * 2 + 3];
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw) / OCC));
      const x1 = Math.min(OCC_N - 1, Math.floor((Math.max(ax, bx) + hw) / OCC));
      const z0 = Math.max(0, Math.floor((Math.min(az, bz) - hw) / OCC));
      const z1 = Math.min(OCC_N - 1, Math.floor((Math.max(az, bz) + hw) / OCC));
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1e-9;
      for (let cz = z0; cz <= z1; cz++)
        for (let cx = x0; cx <= x1; cx++) {
          const px = (cx + 0.5) * OCC;
          const pz = (cz + 0.5) * OCC;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
          if (Math.hypot(px - ax - dx * t, pz - az - dz * t) <= hw) cells.add(cz * OCC_N + cx);
        }
    }
    const arr = Int32Array.from(cells);
    for (const c of arr) this.road[c]++;
    this.roadCells.set(e.id, arr);
  }

  removeRoad(id: number) {
    const arr = this.roadCells.get(id);
    if (!arr) return;
    for (const c of arr) this.road[c] = Math.max(0, this.road[c] - 1);
    this.roadCells.delete(id);
  }

  roadCellsOf(id: number) {
    return this.roadCells.get(id);
  }

  setOwner(cells: ArrayLike<number>, id: number) {
    for (let i = 0; i < cells.length; i++) this.owner[cells[i]] = id;
  }

  clearOwner(cells: ArrayLike<number>, id: number) {
    for (let i = 0; i < cells.length; i++) if (this.owner[cells[i]] === id) this.owner[cells[i]] = 0;
  }
}

/** Grid cells whose centres fall inside a rotated rectangle. */
export function rectCells(cx: number, cz: number, w: number, d: number, ang: number) {
  const r = Math.hypot(w, d) / 2 + OCC;
  const out: number[] = [];
  const x0 = Math.max(0, Math.floor((cx - r) / OCC));
  const x1 = Math.min(OCC_N - 1, Math.floor((cx + r) / OCC));
  const z0 = Math.max(0, Math.floor((cz - r) / OCC));
  const z1 = Math.min(OCC_N - 1, Math.floor((cz + r) / OCC));
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) if (inRect({ x: (x + 0.5) * OCC, z: (z + 0.5) * OCC }, cx, cz, w / 2, d / 2, ang)) out.push(z * OCC_N + x);
  return out;
}

export interface PaintOpts {
  zone: Zone;
  /** Lot frontage and depth in LOT_UNIT steps. */
  width: number;
  depth: number;
  mixed: boolean;
}

/** The lots and civic buildings of a city, kept in step with the road graph. */
export class LotStore {
  lots = new Map<number, Lot>();
  services = new Map<number, Service>();
  cells = new Map<number, number[]>();
  private next = 1;
  private nextSvc = 1;
  version = 0;

  constructor(
    public occ: Occupancy,
    private roads: RoadGraph,
    private terrain: Terrain,
  ) {}

  toJSON() {
    return { lots: [...this.lots.values()], services: [...this.services.values()], next: this.next, nextSvc: this.nextSvc };
  }

  load(json: ReturnType<LotStore["toJSON"]>) {
    this.lots.clear();
    this.services.clear();
    this.cells.clear();
    this.occ.owner.fill(0);
    for (const l of json.lots) this.place(l);
    for (const s of json.services) this.placeService(s);
    this.next = json.next;
    this.nextSvc = json.nextSvc;
    this.version++;
  }

  private place(l: Lot) {
    const cells = rectCells(l.cx, l.cz, l.w, l.d, l.ang);
    this.lots.set(l.id, l);
    this.cells.set(l.id, cells);
    this.occ.setOwner(cells, l.id);
  }

  private placeService(s: Service) {
    const cells = rectCells(s.cx, s.cz, s.w, s.d, s.ang);
    this.services.set(s.id, s);
    this.cells.set(-s.id, cells);
    this.occ.setOwner(cells, -s.id);
  }

  remove(id: number) {
    const l = this.lots.get(id);
    if (!l) return;
    this.occ.clearOwner(this.cells.get(id) ?? [], id);
    this.lots.delete(id);
    this.cells.delete(id);
    this.version++;
  }

  removeService(id: number) {
    if (!this.services.has(id)) return;
    this.occ.clearOwner(this.cells.get(-id) ?? [], -id);
    this.services.delete(id);
    this.cells.delete(-id);
    this.version++;
  }

  /** Is this rectangle on free, dry, not-too-steep ground? */
  fits(cx: number, cz: number, w: number, d: number, ang: number, ignore = 0) {
    const cells = rectCells(cx, cz, w, d, ang);
    if (cells.length === 0) return null;
    for (const c of cells) {
      if (this.occ.road[c] > 0) return null;
      const o = this.occ.owner[c];
      if (o !== 0 && o !== ignore) return null;
    }
    const corners = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
      [0, 0],
    ].map(([u, v]) => ({ x: cx + u * Math.cos(ang) - v * Math.sin(ang), z: cz + u * Math.sin(ang) + v * Math.cos(ang) }));
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of corners) {
      if (p.x < 2 || p.z < 2 || p.x > WORLD - 2 || p.z > WORLD - 2) return null;
      if (this.terrain.isWater(p.x, p.z)) return null;
      const h = this.terrain.heightAt(p.x, p.z);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    if (hi - lo > 6) return null;
    return cells;
  }

  /** Where a lot of this frontage/depth would sit at arc length s on one side of an edge. */
  frame(e: REdge, side: number, s: number, w: number, d: number) {
    const cum = cumulative(e.pts);
    const p = sampleAt(e.pts, cum, s);
    const [nx, nz] = sideNormal(p.tx, p.tz, side);
    const off = halfWidth(e) + 0.6 + d / 2;
    return { cx: p.x + nx * off, cz: p.z + nz * off, ang: Math.atan2(p.tz, p.tx), tx: p.tx, tz: p.tz };
  }

  /**
   * Zone one side of an edge between arc lengths s0 and s1: rezones lots
   * already there and cuts new ones into the gaps. Returns lots whose zone
   * changed (their buildings must go).
   */
  paint(edgeId: number, side: number, s0: number, s1: number, o: PaintOpts, seed = 1) {
    const e = this.roads.edges.get(edgeId);
    const rezoned: number[] = [];
    const created: Lot[] = [];
    if (!e) return { rezoned, created };
    const L = polyLength(e.pts);
    if (s0 > s1) [s0, s1] = [s1, s0];
    for (const l of this.lots.values())
      if (l.edge === edgeId && l.side === side && l.s >= s0 - l.w / 2 && l.s <= s1 + l.w / 2 && l.zone !== o.zone) {
        l.zone = o.zone;
        rezoned.push(l.id);
      }
    const r = rng(seed + edgeId * 31 + Math.floor(s0));
    const cum = cumulative(e.pts);
    let s = Math.max(s0, 1);
    const end = Math.min(s1, L - 1);
    while (s + LOT_UNIT <= end + 0.01) {
      let wu = o.mixed ? Math.max(1, Math.min(6, o.width + r.int(-1, 1))) : o.width;
      let w = wu * LOT_UNIT;
      if (s + w > end + 0.01) {
        wu = Math.floor((end - s) / LOT_UNIT);
        w = wu * LOT_UNIT;
        if (wu < 1) break;
      }
      // Tight bends: one unit at a time.
      const t0 = sampleAt(e.pts, cum, s);
      const t1 = sampleAt(e.pts, cum, s + w);
      if (t0.tx * t1.tx + t0.tz * t1.tz < 0.9 && wu > 1) {
        wu = 1;
        w = LOT_UNIT;
      }
      let placed = false;
      for (let du = o.depth; du >= 1 && !placed; du--) {
        const d = du * LOT_UNIT;
        const f = this.frame(e, side, s + w / 2, w - 0.6, d - 0.6);
        const cells = this.fits(f.cx, f.cz, w - 0.6, d - 0.6, f.ang);
        if (!cells) continue;
        const lot: Lot = { id: this.next++, edge: e.id, side, s: s + w / 2, w: w - 0.6, d: d - 0.6, cx: f.cx, cz: f.cz, ang: f.ang, zone: o.zone };
        this.lots.set(lot.id, lot);
        this.cells.set(lot.id, cells);
        this.occ.setOwner(cells, lot.id);
        created.push(lot);
        placed = true;
      }
      s += placed ? w : 4;
    }
    if (rezoned.length || created.length) this.version++;
    return { rezoned, created };
  }

  /** Remove lots on one side of an edge between two arc lengths. */
  erase(edgeId: number, side: number, s0: number, s1: number) {
    if (s0 > s1) [s0, s1] = [s1, s0];
    const gone: number[] = [];
    for (const l of [...this.lots.values()])
      if (l.edge === edgeId && l.side === side && l.s >= s0 - l.w / 2 && l.s <= s1 + l.w / 2) {
        this.remove(l.id);
        gone.push(l.id);
      }
    return gone;
  }

  /** Frontage ranges (per edge side) whose lots would fall inside an axis-aligned world rectangle. */
  rangesInRect(a: P, b: P, depth: number) {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const z0 = Math.min(a.z, b.z);
    const z1 = Math.max(a.z, b.z);
    const out: { edge: number; side: number; s0: number; s1: number }[] = [];
    for (const e of this.roads.edges.values()) {
      const cum = cumulative(e.pts);
      const L = cum[cum.length - 1];
      for (const side of [1, -1]) {
        let start = -1;
        let last = -1;
        for (let s = 0; s <= L; s += 2) {
          const p = sampleAt(e.pts, cum, s);
          const [nx, nz] = sideNormal(p.tx, p.tz, side);
          const off = halfWidth(e) + depth / 2;
          const x = p.x + nx * off;
          const z = p.z + nz * off;
          const inside = x >= x0 && x <= x1 && z >= z0 && z <= z1;
          if (inside) {
            if (start < 0) start = s;
            last = s;
          } else if (start >= 0) {
            out.push({ edge: e.id, side, s0: start, s1: last });
            start = -1;
          }
        }
        if (start >= 0) out.push({ edge: e.id, side, s0: start, s1: last });
      }
    }
    return out;
  }

  /** Lots of an edge after it was split into `parts`: each moves to the piece it fronts. */
  reattach(oldEdge: number, parts: number[]) {
    for (const l of this.lots.values()) {
      if (l.edge !== oldEdge) continue;
      let best = { id: parts[0], d: Infinity, s: 0 };
      for (const pid of parts) {
        const e = this.roads.edges.get(pid);
        if (!e) continue;
        const pr = project(e.pts, cumulative(e.pts), { x: l.cx, z: l.cz });
        if (pr.d < best.d) best = { id: pid, d: pr.d, s: pr.s };
      }
      l.edge = best.id;
      l.s = best.s;
    }
    this.version++;
  }

  /** Lots that now overlap a road (after a road was widened or laid over them). */
  clashing() {
    const out: number[] = [];
    for (const [id, cells] of this.cells) if (id > 0 && cells.some((c) => this.occ.road[c] > 0)) out.push(id);
    return out;
  }

  servicesClashing() {
    const out: number[] = [];
    for (const [id, cells] of this.cells) if (id < 0 && cells.some((c) => this.occ.road[c] > 0)) out.push(-id);
    return out;
  }

  /** Place a civic building fronting a road at (edge, side, s). */
  addService(kind: ServiceKind, edgeId: number, side: number, s: number) {
    const e = this.roads.edges.get(edgeId);
    if (!e) return null;
    const spec = SERVICE_SPEC[kind];
    const f = this.frame(e, side, s, spec.w, spec.d);
    if (!this.fits(f.cx, f.cz, spec.w, spec.d, f.ang)) return null;
    const svc: Service = { id: this.nextSvc++, kind, cx: f.cx, cz: f.cz, ang: f.ang, w: spec.w, d: spec.d };
    this.placeService(svc);
    this.version++;
    return svc;
  }

  /** Move or rotate a civic building, if the new spot is free. */
  moveService(id: number, cx: number, cz: number, ang: number) {
    const s = this.services.get(id);
    if (!s) return false;
    const cells = this.fits(cx, cz, s.w, s.d, ang, -id);
    if (!cells) return false;
    this.occ.clearOwner(this.cells.get(-id) ?? [], -id);
    Object.assign(s, { cx, cz, ang });
    this.cells.set(-id, cells);
    this.occ.setOwner(cells, -id);
    this.version++;
    return true;
  }

  copyService(id: number, cx: number, cz: number) {
    const s = this.services.get(id);
    if (!s) return null;
    const cells = this.fits(cx, cz, s.w, s.d, s.ang);
    if (!cells) return null;
    const svc: Service = { ...s, id: this.nextSvc++, cx, cz };
    this.placeService(svc);
    this.version++;
    return svc;
  }

  ownerAt(x: number, z: number) {
    const cx = Math.floor(x / OCC);
    const cz = Math.floor(z / OCC);
    if (cx < 0 || cz < 0 || cx >= OCC_N || cz >= OCC_N) return 0;
    return this.occ.owner[cz * OCC_N + cx];
  }
}
