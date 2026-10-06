import { CELL, CELLS, UNDO_LIMIT, WATER_LEVEL } from "../config";
import { cumulative, project, sampleAt, type P } from "../core/geom";
import type { SimSave, SimWorld } from "../sim/sim";
import { LotStore, Occupancy, rectCells, sideNormal, type Lot, type PaintOpts, type ServiceKind } from "./lots";
import { BASE_MAPS, gatewayPath, generateTerrain, generateTrees, mapById, type MapDef } from "./maps";
import { halfWidth, ROAD_TYPES, RoadGraph, stopSetback, type REdge, type RoadTypeId } from "./roads";
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
/** Graded ground sits this far below the road surface (so grass never shows through). */
const GAP = 0.3;
/** Ground flattened under and beside a road: the footprint plus 1.5 terrain cells, so no 8 m terrain triangle under the road reaches a raised vertex. */
const flatOf = (e: REdge) => halfWidth(e) + CELL * 1.5;
/** A road at bridge-deck height (a bridge or its approach), which stands on piers instead of earth. */
const isDeck = (y: number) => Math.abs(y - BRIDGE_DECK) < 0.6;
/** graded[] values: 1 = blended verge, 2 = flattened under a road (GAP below it). */
const UNDER_ROAD = 2;

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
  /** The most people the city has had (milestones go by it). */
  bestPop?: number;
  /** Each road's surface heights (edge id → encoded Float32Array), so a load puts roads back exactly. */
  profiles?: Record<string, string>;
}

interface Snapshot {
  spent: number;
  roads: string;
  lots: string;
  stops: string;
  lines: string;
  heights: Int16Array;
  trees: Float32Array;
  profiles: [number, Float32Array][];
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
  /** The most people the city has had (milestones go by it). */
  bestPop = 0;
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
      // Older saves can have two junctions crammed together; fold them into one.
      const tidy = this.roads.collapseStubs();
      const reshaped = new Set(tidy.moved);
      this.lots = new LotStore(this.occ, this.roads, this.terrain);
      for (const e of this.roads.edges.values()) this.occ.addRoad(e);
      this.lots.load(json.lots);
      this.stops = json.stops;
      this.lines = json.lines;
      if (tidy.removed.length) {
        const gone = new Set(tidy.removed);
        for (const l of [...this.lots.lots.values()]) if (gone.has(l.edge)) this.lots.remove(l.id);
        this.stops = this.stops.filter((st) => !gone.has(st.edge));
        this.lines = this.lines.map((l) => ({ ...l, stops: l.stops.filter((id) => this.stops.some((st) => st.id === id)) })).filter((l) => l.stops.length >= 2);
      }
      this.nextTransit = json.nextTransit;
      this.created = json.created;
      this.playSeconds = json.playSeconds;
      this.bestPop = json.bestPop ?? 0;
      this.spent = json.spent ?? 0;
      // Saved heights put every road back exactly; older saves rebuild them from the ground.
      let exact = !!json.profiles;
      if (json.profiles)
        for (const e of this.roads.edges.values()) {
          if (reshaped.has(e.id)) continue;
          const enc = json.profiles[String(e.id)];
          const ys = enc ? decodeF32(enc) : null;
          if (ys && ys.length === e.pts.length / 2) this.profiles.set(e.id, ys);
          else exact = false;
        }
      if (exact) this.markGraded();
      else this.rebuildProfiles();
      if (reshaped.size) {
        for (const id of reshaped) {
          const e = this.roads.edges.get(id)!;
          if (exact || !this.profiles.has(id)) this.profiles.set(id, this.computeProfile(e));
        }
        for (const id of reshaped) {
          const e = this.roads.edges.get(id)!;
          this.profiles.set(id, this.levelAtJunctions(e, this.profiles.get(id)!));
        }
        this.dropClashes();
      }
      // Ground under every road sits GAP below it (repairs saves from before roads were settled).
      this.settle(this.roads.edges.keys(), false);
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
      profiles: [...this.profiles].map(([id, ys]) => [id, ys.slice()]),
    };
  }

  /** Call before a road or zone action so it can be undone. */
  /** Set how a junction is run (undefined: back to automatic). */
  setJunctionControl(id: number, control: "signal" | "stop" | "yield" | undefined) {
    const n = this.roads.nodes.get(id);
    if (!n) return false;
    this.record();
    if (control) n.control = control;
    else delete n.control;
    this.roads.version++;
    this.changes.nodes.add(id);
    return true;
  }

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
    this.profiles = new Map(s.profiles.map(([id, ys]) => [id, ys.slice()]));
    this.markGraded();
    this.markAll();
  }

  /** Re-mark which ground is graded for the roads (the flags aren't saved). */
  private markGraded() {
    this.terrain.graded.fill(0);
    for (const e of this.roads.edges.values()) {
      const ys = this.profiles.get(e.id);
      if (ys) this.groundRoad(e, ys, true);
    }
  }

  /**
   * Every road's profile from the ground under it. Graded ground was laid GAP below its
   * road, so it's read back up by GAP: profiles don't sink a little on every load or split.
   */
  private rebuildProfiles() {
    this.terrain.graded.fill(0);
    this.profiles.clear();
    const edges = [...this.roads.edges.values()];
    for (const e of edges) this.profiles.set(e.id, this.computeProfile(e));
    for (const e of edges) this.groundRoad(e, this.profiles.get(e.id)!, true);
    // The ground was shaped to each road: read the road back off it rather than smoothing
    // again (smoothing a smoothed profile on every load would slowly flatten it).
    for (const e of edges) this.profiles.set(e.id, this.readProfile(e) ?? this.computeProfile(e));
  }

  /** A road's profile read straight off ground graded for it; null where some of it isn't. */
  private readProfile(e: REdge) {
    const t = this.terrain;
    const n = e.pts.length / 2;
    const ys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = e.pts[i * 2];
      const z = e.pts[i * 2 + 1];
      if (this.terrainUnderIsWater(x, z)) {
        ys[i] = BRIDGE_DECK;
        continue;
      }
      const vi = Math.min(t.n - 1, Math.max(0, Math.round(x / CELL)));
      const vj = Math.min(t.n - 1, Math.max(0, Math.round(z / CELL)));
      if (t.graded[vj * t.n + vi] !== UNDER_ROAD) return null;
      ys[i] = Math.max(WATER_LEVEL + 0.6, this.groundFor(x, z));
    }
    ys[0] = this.nodeY(e.a);
    ys[n - 1] = this.nodeY(e.b);
    return ys;
  }

  /**
   * Junctions are level: within reach of a junction (3+ roads) every arm eases to the
   * junction's height. On a slope the roads meeting there would otherwise sit at different
   * heights side by side, and the ground can't be under one without leaving a pit under
   * the other.
   */
  private levelAtJunctions(e: REdge, ys: Float32Array) {
    const cum = this.cumOf(e);
    const L = cum[cum.length - 1];
    for (const end of ["a", "b"] as const) {
      const id = end === "a" ? e.a : e.b;
      const others = this.roads.nodeEdges(id).filter((o) => o.id !== e.id);
      if (others.length < 2) continue;
      const y0 = end === "a" ? ys[0] : ys[ys.length - 1];
      if (isDeck(y0)) continue;
      const R = Math.min(L * 0.4, Math.max(...others.map((o) => flatOf(o))) + 2);
      const ramp = Math.min(L * 0.4, 16);
      for (let i = 0; i < ys.length; i++) {
        const d = end === "a" ? cum[i] : L - cum[i];
        if (d >= R + ramp) continue;
        const u = d <= R ? 0 : (d - R) / ramp;
        const w = u * u * (3 - 2 * u);
        ys[i] = y0 + (ys[i] - y0) * w;
      }
    }
    return ys;
  }

  /** A profile for an edge cut from (or joined from) older ones: the old heights, carried over. */
  private inheritProfile(e: REdge, sources: { pts: number[]; ys: Float32Array }[]) {
    const n = e.pts.length / 2;
    const ys = new Float32Array(n);
    const cums = sources.map((src) => cumulative(src.pts));
    for (let i = 0; i < n; i++) {
      const p = { x: e.pts[i * 2], z: e.pts[i * 2 + 1] };
      let best = Infinity;
      for (let k = 0; k < sources.length; k++) {
        const pr = project(sources[k].pts, cums[k], p);
        if (pr.d >= best) continue;
        best = pr.d;
        const sy = sources[k].ys;
        ys[i] = sy[pr.seg] + (sy[Math.min(pr.seg + 1, sy.length - 1)] - sy[pr.seg]) * pr.t;
      }
    }
    return ys;
  }

  /** Ground height for a road resting here (graded ground is read back up to the road it was cut for). */
  private groundFor(x: number, z: number) {
    const t = this.terrain;
    const i = Math.min(t.n - 1, Math.max(0, Math.round(x / CELL)));
    const j = Math.min(t.n - 1, Math.max(0, Math.round(z / CELL)));
    return t.heightAt(x, z) + (t.graded[j * t.n + i] === UNDER_ROAD ? GAP : 0);
  }

  /**
   * Sit the ground flush under these roads and every road near them: each terrain vertex
   * within a road's flat strip goes to GAP below the lowest road over it. This fixes ground
   * that a newer road's grading pushed up through an older road (or left it floating), and
   * where two roads' strips overlap the ground stays under both.
   */
  private settle(ids: Iterable<number>, withNeighbours = true) {
    const t = this.terrain;
    const seeds = [...ids].map((id) => this.roads.edges.get(id)).filter((e): e is REdge => !!e);
    if (!seeds.length) return;
    const box = (e: REdge, pad: number) => {
      const xs = xsOf(e.pts);
      const zs = zsOf(e.pts);
      return [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad];
    };
    const edges = new Set(seeds);
    if (withNeighbours) {
      const boxes = seeds.map((e) => box(e, flatOf(e) + 30));
      for (const e of this.roads.edges.values()) {
        if (edges.has(e)) continue;
        const b = box(e, flatOf(e));
        if (boxes.some((a) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3])) edges.add(e);
      }
    }
    const target = new Map<number, number>();
    for (const e of edges) {
      const ys = this.profiles.get(e.id);
      if (!ys) continue;
      const flat = flatOf(e);
      const cum = this.cumOf(e);
      const [x0, z0, x1, z1] = box(e, flat);
      for (let j = Math.max(0, Math.floor(z0 / CELL)); j <= Math.min(CELLS, Math.ceil(z1 / CELL)); j++)
        for (let i = Math.max(0, Math.floor(x0 / CELL)); i <= Math.min(CELLS, Math.ceil(x1 / CELL)); i++) {
          const pr = project(e.pts, cum, { x: i * CELL, z: j * CELL });
          if (pr.d > flat) continue;
          const h = t.at(i, j);
          if (h < WATER_LEVEL + 0.3) continue;
          // The lowest the road gets within a cell either way: ground between grid points is
          // a straight line, and it mustn't cut across a bend in the road (the foot of a
          // ramp, a junction levelling off) and come up through it.
          const sv = cum[pr.seg] + (cum[Math.min(pr.seg + 1, cum.length - 1)] - cum[pr.seg]) * pr.t;
          let y = Infinity;
          for (let k = -12; k <= 12; k += 2) y = Math.min(y, profileAt(ys, cum, sv + k));
          y -= GAP;
          // Bridges stand over the water on piers; leave the ground alone there.
          if (this.overWater(e.pts, pr)) continue;
          const k = j * t.n + i;
          const cur = target.get(k);
          if (cur === undefined || y < cur) target.set(k, y);
        }
    }
    for (const [k, y] of target) {
      const i = k % t.n;
      const j = (k - i) / t.n;
      if (Math.abs(t.at(i, j) - y) > 0.01) t.set(i, j, y);
      t.graded[k] = UNDER_ROAD;
    }
  }

  // ----------------------------------------------------------------- roads

  /** Height of the road surface at a node. */
  nodeY(id: number) {
    const n = this.roads.nodes.get(id)!;
    if (this.terrainUnderIsWater(n.x, n.z)) return BRIDGE_DECK;
    return Math.max(WATER_LEVEL + 0.6, this.groundFor(n.x, n.z));
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
      ys[i] = this.terrainUnderIsWater(x, z) ? BRIDGE_DECK : Math.max(WATER_LEVEL + 0.6, this.groundFor(x, z));
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
    // Grade limit both ways (ramps up to bridges become embankments). Where the two ends
    // are further apart in height than the limit allows, the road takes the grade it needs:
    // otherwise the limit lifts the road all the way along and it drops off a cliff at the
    // far junction.
    const g = Math.max(MAX_GRADE, (Math.abs(ys[0] - ys[n - 1]) / Math.max(1, cum[n - 1])) * 1.05);
    for (let i = 1; i < n; i++) {
      const run = cum[i] - cum[i - 1];
      ys[i] = Math.max(ys[i], ys[i - 1] - run * g);
    }
    for (let i = n - 2; i >= 0; i--) {
      const run = cum[i + 1] - cum[i];
      ys[i] = Math.max(ys[i], ys[i + 1] - run * g);
    }
    ys[0] = this.nodeY(e.a);
    ys[n - 1] = this.nodeY(e.b);
    return this.levelAtJunctions(e, ys);
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
  /**
   * Shape the ground to a road: flat right across the road (wide enough that no terrain
   * triangle under the road can rise through it, since the grid is 8 m), then blended
   * smoothly back into the hillside. With `markOnly` it just records which vertices are
   * graded (after loading a save).
   */
  private groundRoad(e: REdge, ys: Float32Array, markOnly = false) {
    const flat = flatOf(e);
    const reach = flat + 14;
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
        const y = ys[seg] + (ys[Math.min(seg + 1, ys.length - 1)] - ys[seg]) * t - GAP;
        if (this.overWater(e.pts, pr)) continue;
        const u = pr.d <= flat ? 1 : 1 - (pr.d - flat) / (reach - flat);
        const w = u * u * (3 - 2 * u);
        const k = j * this.terrain.n + i;
        if (pr.d <= flat) this.terrain.graded[k] = UNDER_ROAD;
        else if (!this.terrain.graded[k]) this.terrain.graded[k] = 1;
        if (markOnly) continue;
        const nh = h + (y - h) * Math.max(0, Math.min(1, w));
        if (Math.abs(nh - h) > 0.02) this.terrain.set(i, j, nh);
      }
  }

  /** Is the road's centre line over water at this projection (a bridge span)? */
  private overWater(pts: number[], pr: { seg: number; t: number }) {
    const i = pr.seg;
    const j = Math.min(i + 1, pts.length / 2 - 1);
    const x = pts[i * 2] + (pts[j * 2] - pts[i * 2]) * pr.t;
    const z = pts[i * 2 + 1] + (pts[j * 2 + 1] - pts[i * 2 + 1]) * pr.t;
    return this.terrainUnderIsWater(x, z);
  }

  /** Clear the trees standing on a lot (when something is built there). */
  clearTreesOnLot(l: Lot) {
    this.clearTreesNear(rectCells(l.cx, l.cz, l.w, l.d, l.ang));
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
    // What each edge looked like before (an edge this road splits keeps its heights).
    const prior = new Map([...this.roads.edges.values()].map((e) => [e.id, { pts: e.pts, ys: this.profiles.get(e.id) }]));
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
        const was = prior.get(old);
        this.profiles.set(k, was?.ys ? this.inheritProfile(e, [{ pts: was.pts, ys: was.ys }]) : this.computeProfile(e));
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
    // Every road at a junction this made (or grew) eases level into it.
    const touched = new Set<number>();
    for (const e of r.created) for (const nid of [e.a, e.b]) for (const ne of this.roads.nodeEdges(nid)) touched.add(ne.id);
    for (const kids of r.replaced.values()) for (const k of kids) touched.add(k);
    for (const id of touched) {
      const e = this.roads.edges.get(id);
      const ys = this.profiles.get(id);
      if (e && ys) this.profiles.set(id, this.levelAtJunctions(e, ys));
    }
    // Seat the ground under the new roads and their neighbours.
    this.settle(touched);
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
    const prior = new Map([...this.roads.edges.values()].map((x) => [x.id, { pts: x.pts, ys: this.profiles.get(x.id) }]));
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
      const srcs = m.from.map((f) => prior.get(f)).filter((x): x is { pts: number[]; ys: Float32Array } => !!x?.ys);
      this.profiles.set(ne.id, srcs.length === m.from.length ? this.inheritProfile(ne, srcs) : this.computeProfile(ne));
      this.settle([ne.id]);
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
    this.settle([id]);
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
      this.settle([e.id]);
      this.changes.edges.add(e.id);
      this.changes.nodes.add(e.a);
      this.changes.nodes.add(e.b);
    }
  }

  // -------------------------------------------------------------- the sim

  toSim(): SimWorld {
    const at = new Map<number, REdge[]>();
    for (const e of this.roads.edges.values())
      for (const id of e.a === e.b ? [e.a] : [e.a, e.b]) (at.get(id) ?? at.set(id, []).get(id)!).push(e);
    const edges = [...this.roads.edges.values()].map((e) => {
      const t = ROAD_TYPES[e.type];
      return {
        stopA: stopSetback(at.get(e.a)!, e.a, e),
        stopB: stopSetback(at.get(e.b)!, e.b, e),
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
      nodes: [...this.roads.nodes.values()].map((n) => ({ id: n.id, x: n.x, z: n.z, gate: n.gate, control: n.control })),
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
      bestPop: this.bestPop,
      profiles: Object.fromEntries([...this.profiles].map(([id, ys]) => [String(id), encodeF32(ys)])),
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

/** A profile's height at arc length s (clamped to the edge). */
function profileAt(ys: Float32Array, cum: Float64Array, s: number) {
  const n = ys.length;
  if (s <= 0) return ys[0];
  if (s >= cum[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  return ys[lo] + (ys[hi] - ys[lo]) * ((s - cum[lo]) / seg);
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

export const ALL_MAP_IDS = BASE_MAPS.map((m) => m.id);
