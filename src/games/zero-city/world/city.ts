import { CELL, CELLS, UNDO_LIMIT, WATER_LEVEL } from "../config";
import { cumulative, project, sampleAt, type P } from "../core/geom";
import type { SimSave, SimWorld } from "../sim/sim";
import { LotStore, Occupancy, rectCells, sideNormal, type Lot, type PaintOpts, type ServiceKind } from "./lots";
import { MAPS, gatewayPath, generateTerrain, generateTrees, mapById, type MapDef } from "./maps";
import { halfWidth, ROAD_TYPES, RoadGraph, type REdge, type RoadTypeId } from "./roads";
import { Terrain } from "./terrain";

export interface BusStop {
  id: number;
  edge: number;
  s: number;
  side: number;
  /** Where it stands (kept so the stop can find its road again after the road is split). */
  x: number;
  z: number;
}
export interface BusLine {
  id: number;
  stops: number[];
  color: number;
}

/** What the renderer needs to know changed. */
export interface Changes {
  edges: Set<number>;
  removedEdges: Set<number>;
  nodes: Set<number>;
  lots: boolean;
  services: boolean;
  trees: boolean;
  transit: boolean;
}

const BRIDGE_DECK = WATER_LEVEL + 4.5;
const MAX_GRADE = 0.1;

export interface CityJSON {
  mapId: string;
  name: string;
  created: number;
  playSeconds: number;
  heights: string;
  trees: string;
  roads: ReturnType<RoadGraph["toJSON"]>;
  lots: ReturnType<LotStore["toJSON"]>;
  stops: BusStop[];
  lines: BusLine[];
  nextTransit: number;
  sim: SimSave | null;
  camera?: { x: number; z: number; dist: number; yaw: number; pitch: number };
  visited: string[];
  /** Mayor mode (absent = Sandbox). */
  mode?: "sandbox" | "mayor";
  politics?: unknown;
  /** Money spent building, all time (undo refunds it). */
  spent?: number;
}

interface Snapshot {
  spent: number;
  roads: string;
  lots: string;
  stops: string;
  lines: string;
  heights: Int16Array;
  trees: Float32Array;
}

export class City {
  map: MapDef;
  terrain: Terrain;
  roads = new RoadGraph();
  occ = new Occupancy();
  lots: LotStore;
  trees: Float32Array;
  /** Tree visible flags (cleared trees stay in the array, hidden). */
  treeAlive: Uint8Array;
  stops: BusStop[] = [];
  lines: BusLine[] = [];
  nextTransit = 1;
  name: string;
  created = Date.now();
  playSeconds = 0;
  /** Money spent on construction so far; part of each undo step, so undoing refunds it. */
  spent = 0;
  /** Edge id → road surface height at each polyline vertex. */
  profiles = new Map<number, Float32Array>();
  changes: Changes = freshChanges();
  version = 0;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  constructor(mapId: string, name: string, json?: CityJSON) {
    this.map = mapById(mapId);
    this.name = name;
    this.terrain = json ? new Terrain(decodeHeights(json.heights)) : generateTerrain(this.map);
    this.lots = new LotStore(this.occ, this.roads, this.terrain);
    if (json) {
      this.trees = decodeF32(json.trees);
      this.treeAlive = new Uint8Array(this.trees.length / 4);
      for (let i = 0; i < this.treeAlive.length; i++) this.treeAlive[i] = this.trees[i * 4 + 2] > 0 ? 1 : 0;
      this.roads = RoadGraph.from(json.roads);
      this.lots = new LotStore(this.occ, this.roads, this.terrain);
      for (const e of this.roads.edges.values()) this.occ.addRoad(e);
      this.lots.load(json.lots);
      this.stops = json.stops;
      this.lines = json.lines;
      this.nextTransit = json.nextTransit;
      this.created = json.created;
      this.playSeconds = json.playSeconds;
      this.spent = json.spent ?? 0;
      for (const e of this.roads.edges.values()) this.profiles.set(e.id, this.computeProfile(e));
    } else {
      this.trees = generateTrees(this.map, this.terrain);
      this.treeAlive = new Uint8Array(this.trees.length / 4).fill(1);
      const g = gatewayPath(this.map, this.terrain);
      const gate = this.roads.addNode(g.a.x, g.a.z, true);
      this.addRoad([gate.x, gate.z, g.b.x, g.b.z], "highway", { record: false, name: "Gateway Highway" });
    }
    this.markAll();
  }

  markAll() {
    for (const e of this.roads.edges.keys()) this.changes.edges.add(e);
    for (const n of this.roads.nodes.keys()) this.changes.nodes.add(n);
    this.changes.lots = this.changes.services = this.changes.trees = this.changes.transit = true;
    this.version++;
  }

  takeChanges() {
    const c = this.changes;
    this.changes = freshChanges();
    return c;
  }

  // ------------------------------------------------------------- undo/redo

  private snapshot(): Snapshot {
    return {
      spent: this.spent,
      roads: JSON.stringify(this.roads.toJSON()),
      lots: JSON.stringify(this.lots.toJSON()),
      stops: JSON.stringify(this.stops),
      lines: JSON.stringify(this.lines),
      heights: toI16(this.terrain.h),
      trees: this.trees.slice(),
    };
  }

  /** Call before a road or zone action so it can be undone. */
  record() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.redoStack.push(this.snapshot());
    this.restore(s);
    return true;
  }

  redo() {
    const s = this.redoStack.pop();
    if (!s) return false;
    this.undoStack.push(this.snapshot());
    this.restore(s);
    return true;
  }

  private restore(s: Snapshot) {
    this.spent = s.spent;
    for (const e of this.roads.edges.keys()) this.changes.removedEdges.add(e);
    this.roads = RoadGraph.from(JSON.parse(s.roads));
    this.occ = new Occupancy();
    for (const e of this.roads.edges.values()) this.occ.addRoad(e);
    const lotsJson = JSON.parse(s.lots);
    this.lots = new LotStore(this.occ, this.roads, this.terrain);
    this.lots.load(lotsJson);
    this.stops = JSON.parse(s.stops);
    this.lines = JSON.parse(s.lines);
    fromI16(s.heights, this.terrain.h);
    this.terrain.dirty.clear();
    for (let i = 0; i < 16; i++) this.terrain.dirty.add(i);
    this.terrain.version++;
    this.trees.set(s.trees);
    for (let i = 0; i < this.treeAlive.length; i++) this.treeAlive[i] = this.trees[i * 4 + 2] > 0 ? 1 : 0;
    this.profiles.clear();
    for (const e of this.roads.edges.values()) this.profiles.set(e.id, this.computeProfile(e));
    this.markAll();
  }

  // ----------------------------------------------------------------- roads

  /** Height of the road surface at a node. */
  nodeY(id: number) {
    const n = this.roads.nodes.get(id)!;
    if (this.terrainUnderIsWater(n.x, n.z)) return BRIDGE_DECK;
    return Math.max(WATER_LEVEL + 0.6, this.terrain.heightAt(n.x, n.z));
  }

  private terrainUnderIsWater(x: number, z: number) {
    return this.terrain.heightAt(x, z) < WATER_LEVEL + 0.4;
  }

  /** Road height along an edge: hugging the land, a deck over water, ramps no steeper than 10%. */
  computeProfile(e: REdge) {
    const n = e.pts.length / 2;
    const ys = new Float32Array(n);
    const cum = cumulative(e.pts);
    for (let i = 0; i < n; i++) {
      const x = e.pts[i * 2];
      const z = e.pts[i * 2 + 1];
      ys[i] = this.terrainUnderIsWater(x, z) ? BRIDGE_DECK : Math.max(WATER_LEVEL + 0.6, this.terrain.heightAt(x, z));
    }
    ys[0] = this.nodeY(e.a);
    ys[n - 1] = this.nodeY(e.b);
    // Smooth, keeping the ends and the decks.
    for (let pass = 0; pass < 6; pass++)
      for (let i = 1; i < n - 1; i++) {
        const deck = this.terrainUnderIsWater(e.pts[i * 2], e.pts[i * 2 + 1]);
        const avg = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) / 4;
        ys[i] = deck ? Math.max(BRIDGE_DECK, avg) : avg;
      }
    // Grade limit both ways (ramps up to bridges become embankments).
    for (let i = 1; i < n; i++) {
      const run = cum[i] - cum[i - 1];
      ys[i] = Math.max(ys[i], ys[i - 1] - run * MAX_GRADE);
    }
    for (let i = n - 2; i >= 0; i--) {
      const run = cum[i + 1] - cum[i];
      ys[i] = Math.max(ys[i], ys[i + 1] - run * MAX_GRADE);
    }
    ys[0] = this.nodeY(e.a);
    ys[n - 1] = this.nodeY(e.b);
    return ys;
  }

  /** Road surface height at arc length s along an edge. */
  private cumCache = new WeakMap<number[], Float64Array>();
  cumOf(e: REdge) {
    let c = this.cumCache.get(e.pts);
    if (!c) this.cumCache.set(e.pts, (c = cumulative(e.pts)));
    return c;
  }

  roadY(edgeId: number, s: number) {
    const e = this.roads.edges.get(edgeId);
    const ys = this.profiles.get(edgeId);
    if (!e || !ys) return 0;
    const cum = this.cumOf(e);
    const p = sampleAt(e.pts, cum, s);
    const i = p.seg;
    const seg = Math.max(1e-6, cum[i + 1] - cum[i]);
    const t = Math.min(1, Math.max(0, (s - cum[i]) / seg));
    return ys[i] + (ys[Math.min(i + 1, ys.length - 1)] - ys[i]) * t;
  }

  /** Cut and fill the ground under a road so it sits flush (bridges leave water alone). */
  private groundRoad(e: REdge, ys: Float32Array) {
    const hw = halfWidth(e);
    const reach = hw + 7;
    const cum = cumulative(e.pts);
    const L = cum[cum.length - 1];
    const i0 = Math.max(0, Math.floor(Math.min(...xsOf(e.pts)) / CELL) - 2);
    const i1 = Math.min(CELLS, Math.ceil(Math.max(...xsOf(e.pts)) / CELL) + 2);
    const j0 = Math.max(0, Math.floor(Math.min(...zsOf(e.pts)) / CELL) - 2);
    const j1 = Math.min(CELLS, Math.ceil(Math.max(...zsOf(e.pts)) / CELL) + 2);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const p = { x: i * CELL, z: j * CELL };
        const pr = project(e.pts, cum, p);
        if (pr.d > reach) continue;
        void L;
        const h = this.terrain.at(i, j);
        if (h < WATER_LEVEL + 0.3) continue;
        const seg = pr.seg;
        const t = pr.t;
        const y = ys[seg] + (ys[Math.min(seg + 1, ys.length - 1)] - ys[seg]) * t - 0.15;
        if (y > BRIDGE_DECK - 0.5 && h < y - 3) continue;
        const w = pr.d <= hw + 1 ? 1 : 1 - (pr.d - hw - 1) / (reach - hw - 1);
        const nh = h + (y - h) * Math.max(0, Math.min(1, w));
        if (Math.abs(nh - h) > 0.02) this.terrain.set(i, j, nh);
      }
  }

  private clearTreesNear(cells: ArrayLike<number>) {
    if (!cells.length) return;
    const set = new Set<number>();
    for (let i = 0; i < cells.length; i++) set.add(cells[i]);
    let any = false;
    for (let i = 0; i < this.treeAlive.length; i++) {
      if (!this.treeAlive[i]) continue;
      const cx = Math.floor(this.trees[i * 4] / 4);
      const cz = Math.floor(this.trees[i * 4 + 1] / 4);
      if (set.has(cz * 512 + cx)) {
        this.treeAlive[i] = 0;
        this.trees[i * 4 + 2] = 0;
        any = true;
      }
    }
    if (any) this.changes.trees = true;
  }

  /**
   * Lay a road. Splits what it crosses, grounds it on the terrain (cuttings,
   * embankments, bridges), clears the trees and any lots in its way.
   */
  addRoad(pts: number[], type: RoadTypeId, opts: { record?: boolean; name?: string; lanes?: [number, number] } = {}) {
    if (opts.record !== false) this.record();
    const r = this.roads.addPath(pts, type, { name: opts.name, snap: 5, lanes: opts.lanes });
    for (const old of r.removed) {
      this.occ.removeRoad(old);
      this.profiles.delete(old);
      this.changes.removedEdges.add(old);
    }
    for (const [old, kids] of r.replaced) {
      this.lots.reattach(old, kids);
      this.reattachStops(old, kids);
      for (const k of kids) {
        const e = this.roads.edges.get(k);
        if (!e) continue;
        this.occ.addRoad(e);
        this.profiles.set(k, this.computeProfile(e));
        this.changes.edges.add(k);
      }
    }
    for (const e of r.created) {
      this.occ.addRoad(e);
      const ys = this.computeProfile(e);
      this.profiles.set(e.id, ys);
      this.groundRoad(e, ys);
      this.clearTreesNear(this.occ.roadCellsOf(e.id) ?? []);
      this.changes.edges.add(e.id);
      this.changes.nodes.add(e.a);
      this.changes.nodes.add(e.b);
    }
    // Neighbours share junctions; refresh their ends.
    for (const e of r.created) for (const nid of [e.a, e.b]) for (const ne of this.roads.nodeEdges(nid)) this.changes.edges.add(ne.id);
    this.dropClashes();
    this.version++;
    return r;
  }

  /** Lots or civic buildings a road now runs over are removed. */
  private dropClashes() {
    let any = false;
    for (const id of this.lots.clashing()) {
      this.lots.remove(id);
      any = true;
    }
    for (const id of this.lots.servicesClashing()) {
      this.lots.removeService(id);
      this.changes.services = true;
    }
    if (any) this.changes.lots = true;
  }

  removeEdge(id: number, record = true) {
    const e = this.roads.edges.get(id);
    if (!e) return;
    if (this.roads.nodes.get(e.a)?.gate || this.roads.nodes.get(e.b)?.gate) {
      // The way in stays (you can still change its type).
      const other = this.roads.nodeEdges(this.roads.nodes.get(e.a)?.gate ? e.a : e.b);
      if (other.length <= 1) return;
    }
    if (record) this.record();
    for (const l of [...this.lots.lots.values()]) if (l.edge === id) this.lots.remove(l.id);
    this.stops = this.stops.filter((s) => s.edge !== id);
    this.lines = this.lines.map((l) => ({ ...l, stops: l.stops.filter((s) => this.stops.some((st) => st.id === s)) })).filter((l) => l.stops.length >= 2);
    this.occ.removeRoad(id);
    this.profiles.delete(id);
    this.changes.removedEdges.add(id);
    const res = this.roads.removeEdge(id);
    for (const m of res.merged) {
      for (const f of m.from) {
        this.occ.removeRoad(f);
        this.profiles.delete(f);
        this.changes.removedEdges.add(f);
      }
      const ne = this.roads.edges.get(m.to)!;
      this.lots.reattach(m.from[0], [m.to]);
      this.lots.reattach(m.from[1], [m.to]);
      this.reattachStops(m.from[0], [m.to]);
      this.reattachStops(m.from[1], [m.to]);
      this.occ.addRoad(ne);
      this.profiles.set(ne.id, this.computeProfile(ne));
      this.changes.edges.add(ne.id);
    }
    for (const nid of [e.a, e.b]) {
      this.changes.nodes.add(nid);
      for (const ne of this.roads.nodeEdges(nid)) this.changes.edges.add(ne.id);
    }
    this.changes.lots = true;
    this.changes.transit = true;
    this.version++;
  }

  /** Upgrade (change type), lane layout and one-way. */
  editEdge(id: number, op: { type?: RoadTypeId; lanes?: true; oneway?: true }, record = true) {
    const e = this.roads.edges.get(id);
    if (!e) return;
    if (record) this.record();
    if (op.type && op.type !== e.type) this.roads.setType(id, op.type);
    if (op.lanes) this.roads.cycleLanes(id);
    if (op.oneway) this.roads.cycleOneWay(id);
    this.occ.addRoad(e);
    this.profiles.set(id, this.computeProfile(e));
    this.dropClashes();
    this.changes.edges.add(id);
    for (const nid of [e.a, e.b]) this.changes.nodes.add(nid);
    this.version++;
  }

  // ----------------------------------------------------------------- zones

  paint(edge: number, side: number, s0: number, s1: number, o: PaintOpts, mirror: boolean) {
    const res = this.lots.paint(edge, side, s0, s1, o, Math.floor(this.playSeconds));
    if (mirror) {
      const m = this.lots.paint(edge, -side, s0, s1, o, Math.floor(this.playSeconds) + 7);
      res.created.push(...m.created);
      res.rezoned.push(...m.rezoned);
    }
    if (res.created.length || res.rezoned.length) {
      this.changes.lots = true;
      this.version++;
    }
    return res;
  }

  erase(edge: number, side: number, s0: number, s1: number, mirror: boolean) {
    const gone = this.lots.erase(edge, side, s0, s1);
    if (mirror) gone.push(...this.lots.erase(edge, -side, s0, s1));
    if (gone.length) {
      this.changes.lots = true;
      this.version++;
    }
    return gone;
  }

  removeLot(id: number) {
    this.lots.remove(id);
    this.changes.lots = true;
    this.version++;
  }

  // -------------------------------------------------------------- services

  addService(kind: ServiceKind, edge: number, side: number, s: number) {
    const svc = this.lots.addService(kind, edge, side, s);
    if (svc) {
      this.clearTreesNear(rectCells(svc.cx, svc.cz, svc.w, svc.d, svc.ang));
      this.flattenRect(svc.cx, svc.cz, svc.w, svc.d);
      this.changes.services = true;
      this.version++;
    }
    return svc;
  }

  flattenRect(cx: number, cz: number, w: number, d: number) {
    const r = Math.hypot(w, d) / 2 + 4;
    const target = this.terrain.heightAt(cx, cz);
    this.terrain.brush(cx, cz, r, (h, wgt) => h + (target - h) * Math.min(1, wgt * 1.6));
  }

  // --------------------------------------------------------------- transit

  addStop(edge: number, s: number, side: number) {
    const e = this.roads.edges.get(edge);
    if (!e || ROAD_TYPES[e.type].sidewalk === 0) return null;
    if (this.stops.some((st) => st.edge === edge && Math.abs(st.s - s) < 30)) return null;
    const at = this.sidePoint(edge, s, side, -1);
    if (!at) return null;
    const stop: BusStop = { id: this.nextTransit++, edge, s, side, x: at.x, z: at.z };
    this.stops.push(stop);
    this.changes.transit = true;
    this.version++;
    return stop;
  }

  addLine(stops: number[]) {
    if (stops.length < 2) return null;
    const line: BusLine = { id: this.nextTransit++, stops, color: this.lines.length % 6 };
    this.lines.push(line);
    this.changes.transit = true;
    this.version++;
    return line;
  }

  removeLine(id: number) {
    this.lines = this.lines.filter((l) => l.id !== id);
    this.changes.transit = true;
    this.version++;
  }

  private reattachStops(old: number, kids: number[]) {
    for (const st of this.stops) {
      if (st.edge !== old) continue;
      let best = { id: kids[0], d: Infinity, s: 0 };
      for (const k of kids) {
        const e = this.roads.edges.get(k);
        if (!e) continue;
        const pr = project(e.pts, cumulative(e.pts), { x: st.x, z: st.z });
        if (pr.d < best.d) best = { id: k, d: pr.d, s: pr.s };
      }
      st.edge = best.id;
      st.s = best.s;
    }
    this.changes.transit = true;
  }

  // ----------------------------------------------------------------- trees

  /** Plant (or clear) trees in a circle. */
  treeBrush(x: number, z: number, r: number, plant: boolean, seed: number) {
    if (plant) {
      const add: number[] = [];
      let k = seed;
      for (let i = 0; i < Math.max(2, (r * r) / 90); i++) {
        k = (Math.imul(k, 1103515245) + 12345) >>> 0;
        const a = (k / 4294967296) * Math.PI * 2;
        k = (Math.imul(k, 1103515245) + 12345) >>> 0;
        const d = Math.sqrt(k / 4294967296) * r;
        const px = x + Math.cos(a) * d;
        const pz = z + Math.sin(a) * d;
        if (this.terrain.isWater(px, pz) || this.lots.ownerAt(px, pz) !== 0) continue;
        const cx = Math.floor(px / 4);
        const cz = Math.floor(pz / 4);
        if (cx < 0 || cz < 0 || cx >= 512 || cz >= 512 || this.occ.road[cz * 512 + cx] > 0) continue;
        add.push(px, pz, 0.8 + ((k >>> 8) % 50) / 100, k % 4);
      }
      if (add.length) {
        const next = new Float32Array(this.trees.length + add.length);
        next.set(this.trees);
        next.set(add, this.trees.length);
        this.trees = next;
        const alive = new Uint8Array(next.length / 4);
        alive.set(this.treeAlive);
        alive.fill(1, this.treeAlive.length);
        this.treeAlive = alive;
      }
    } else {
      for (let i = 0; i < this.treeAlive.length; i++)
        if (this.treeAlive[i] && Math.hypot(this.trees[i * 4] - x, this.trees[i * 4 + 1] - z) < r) {
          this.treeAlive[i] = 0;
          this.trees[i * 4 + 2] = 0;
        }
    }
    this.changes.trees = true;
    this.version++;
  }

  /** After the ground moved: re-seat nearby roads. */
  reseatRoadsNear(x: number, z: number, r: number) {
    for (const e of this.roads.edges.values()) {
      const pr = project(e.pts, cumulative(e.pts), { x, z });
      if (pr.d > r + halfWidth(e) + 8) continue;
      const ys = this.computeProfile(e);
      this.profiles.set(e.id, ys);
      this.groundRoad(e, ys);
      this.changes.edges.add(e.id);
      this.changes.nodes.add(e.a);
      this.changes.nodes.add(e.b);
    }
  }

  // -------------------------------------------------------------- the sim

  toSim(): SimWorld {
    const edges = [...this.roads.edges.values()].map((e) => {
      const t = ROAD_TYPES[e.type];
      return {
        id: e.id,
        a: e.a,
        b: e.b,
        lanesF: e.lanesF,
        lanesB: e.lanesB,
        speed: t.speed,
        cls: t.cls,
        pts: e.pts,
        half: halfWidth(e) - t.sidewalk,
        sidewalk: t.sidewalk,
        median: t.median,
        name: e.name,
      };
    });
    const lots = [...this.lots.lots.values()].map((l) => ({
      id: l.id,
      edge: l.edge,
      side: l.side,
      s: l.s,
      w: l.w,
      d: l.d,
      cx: l.cx,
      cz: l.cz,
      zone: l.zone,
      wet: this.nearWater(l),
    }));
    return {
      nodes: [...this.roads.nodes.values()].map((n) => ({ id: n.id, x: n.x, z: n.z, gate: n.gate })),
      edges,
      lots,
      services: [...this.lots.services.values()].map((s) => ({ id: s.id, kind: s.kind, cx: s.cx, cz: s.cz })),
      stops: this.stops,
      lines: this.lines.map((l) => ({ id: l.id, stops: l.stops })),
      res: [...this.map.res],
    };
  }

  private wetCache = new Map<number, boolean>();
  nearWater(l: Lot) {
    let v = this.wetCache.get(l.id);
    if (v === undefined) {
      v = false;
      for (let a = 0; a < 8 && !v; a++) {
        const x = l.cx + Math.cos((a / 8) * Math.PI * 2) * 60;
        const z = l.cz + Math.sin((a / 8) * Math.PI * 2) * 60;
        if (this.terrain.isWater(x, z)) v = true;
      }
      this.wetCache.set(l.id, v);
    }
    return v;
  }

  // ------------------------------------------------------------------ save

  toJSON(sim: SimSave | null, camera?: CityJSON["camera"], visited: string[] = []): CityJSON {
    return {
      mapId: this.map.id,
      name: this.name,
      created: this.created,
      playSeconds: this.playSeconds,
      heights: encodeHeights(this.terrain.h),
      trees: encodeF32(this.trees),
      roads: this.roads.toJSON(),
      lots: this.lots.toJSON(),
      stops: this.stops,
      lines: this.lines,
      nextTransit: this.nextTransit,
      sim,
      camera,
      visited,
      spent: this.spent,
    };
  }

  /** The point on the side of an edge at arc length s (for lots, stops, labels). */
  sidePoint(edgeId: number, s: number, side: number, extra = 0): P | null {
    const e = this.roads.edges.get(edgeId);
    if (!e) return null;
    const p = sampleAt(e.pts, cumulative(e.pts), s);
    const [nx, nz] = sideNormal(p.tx, p.tz, side);
    const off = halfWidth(e) + extra;
    return { x: p.x + nx * off, z: p.z + nz * off };
  }
}

function freshChanges(): Changes {
  return { edges: new Set(), removedEdges: new Set(), nodes: new Set(), lots: false, services: false, trees: false, transit: false };
}

const xsOf = (pts: number[]) => pts.filter((_, i) => i % 2 === 0);
const zsOf = (pts: number[]) => pts.filter((_, i) => i % 2 === 1);

function toI16(h: Float32Array) {
  const out = new Int16Array(h.length);
  for (let i = 0; i < h.length; i++) out[i] = Math.round(h[i] * 100);
  return out;
}
function fromI16(src: Int16Array, dst: Float32Array) {
  for (let i = 0; i < src.length; i++) dst[i] = src[i] / 100;
}

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeHeights(h: Float32Array) {
  return b64(new Uint8Array(toI16(h).buffer));
}
function decodeHeights(s: string) {
  const i16 = new Int16Array(unb64(s).buffer);
  const out = new Float32Array(i16.length);
  fromI16(i16, out);
  return out;
}
function encodeF32(a: Float32Array) {
  return b64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
}
function decodeF32(s: string) {
  const bytes = unb64(s);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice();
}

export const ALL_MAP_IDS = MAPS.map((m) => m.id);
