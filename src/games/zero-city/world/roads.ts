import { cumulative, polyLength, project, resample, sampleAt, segX, type P } from "../core/geom";
import type { StringKey } from "../i18n";

export type RoadGroup = "transit" | "highway" | "traffic" | "parking";
export type RoadTypeId =
  | "street"
  | "avenue"
  | "boulevard"
  | "highway"
  | "expressway"
  | "ramp"
  | "busStreet"
  | "busAvenue"
  | "parkingStreet"
  | "parkingAvenue";

export interface RoadType {
  id: RoadTypeId;
  group: RoadGroup;
  label: StringKey;
  /** Total driving lanes (split between the two directions unless one-way). */
  lanes: number;
  speed: number;
  /** Each sidewalk, metres (0 on highways). */
  sidewalk: number;
  median: number;
  medianTrees: boolean;
  parking: boolean;
  bus: boolean;
  /** Priority class at junctions (higher goes first). */
  cls: number;
  oneWay?: boolean;
}

export const LANE = 3.5;
export const PARKING = 2.4;

export const ROAD_TYPES: Record<RoadTypeId, RoadType> = {
  street: { id: "street", group: "traffic", label: "rt.street", lanes: 2, speed: 40, sidewalk: 2.6, median: 0, medianTrees: false, parking: false, bus: false, cls: 1 },
  avenue: { id: "avenue", group: "traffic", label: "rt.avenue", lanes: 4, speed: 50, sidewalk: 3, median: 0, medianTrees: false, parking: false, bus: false, cls: 2 },
  boulevard: { id: "boulevard", group: "traffic", label: "rt.boulevard", lanes: 4, speed: 60, sidewalk: 3.4, median: 4, medianTrees: true, parking: false, bus: false, cls: 3 },
  highway: { id: "highway", group: "highway", label: "rt.highway", lanes: 4, speed: 90, sidewalk: 0, median: 2, medianTrees: false, parking: false, bus: false, cls: 4 },
  expressway: { id: "expressway", group: "highway", label: "rt.expressway", lanes: 6, speed: 110, sidewalk: 0, median: 2.5, medianTrees: false, parking: false, bus: false, cls: 5 },
  ramp: { id: "ramp", group: "highway", label: "rt.ramp", lanes: 1, speed: 70, sidewalk: 0, median: 0, medianTrees: false, parking: false, bus: false, cls: 3, oneWay: true },
  busStreet: { id: "busStreet", group: "transit", label: "rt.busStreet", lanes: 2, speed: 40, sidewalk: 3, median: 0, medianTrees: false, parking: false, bus: true, cls: 1 },
  busAvenue: { id: "busAvenue", group: "transit", label: "rt.busAvenue", lanes: 4, speed: 50, sidewalk: 3, median: 0, medianTrees: false, parking: false, bus: true, cls: 2 },
  parkingStreet: { id: "parkingStreet", group: "parking", label: "rt.parkingStreet", lanes: 2, speed: 30, sidewalk: 2.8, median: 0, medianTrees: false, parking: true, bus: false, cls: 1 },
  parkingAvenue: { id: "parkingAvenue", group: "parking", label: "rt.parkingAvenue", lanes: 4, speed: 40, sidewalk: 3, median: 0, medianTrees: false, parking: true, bus: false, cls: 2 },
};

export const GROUPS: { id: RoadGroup; label: StringKey; types: RoadTypeId[] }[] = [
  { id: "traffic", label: "grp.traffic", types: ["street", "avenue", "boulevard"] },
  { id: "highway", label: "grp.highway", types: ["highway", "expressway", "ramp"] },
  { id: "transit", label: "grp.transit", types: ["busStreet", "busAvenue"] },
  { id: "parking", label: "grp.parking", types: ["parkingStreet", "parkingAvenue"] },
];

export interface RNode {
  id: number;
  x: number;
  z: number;
  /** The highway's way in from the edge of the map. */
  gate?: boolean;
}

export interface REdge {
  id: number;
  a: number;
  b: number;
  type: RoadTypeId;
  /** Flat [x0, z0, …] from node a to node b. */
  pts: number[];
  name: string;
  /** Lanes a→b and b→a. */
  lanesF: number;
  lanesB: number;
}

/** Asphalt width (lanes, parking, median). */
export function carriageway(e: Pick<REdge, "type" | "lanesF" | "lanesB">) {
  const t = ROAD_TYPES[e.type];
  return (e.lanesF + e.lanesB) * LANE + (t.parking ? 2 * PARKING : 0) + t.median + (t.sidewalk === 0 ? 2 : 0);
}
/** Half of the full footprint: asphalt plus sidewalks. */
export function halfWidth(e: Pick<REdge, "type" | "lanesF" | "lanesB">) {
  return carriageway(e) / 2 + ROAD_TYPES[e.type].sidewalk;
}

/**
 * Offset of a lane's centre from the road's centre line, to the right of
 * travel. Two-way roads drive on the right of the median (lane 0 innermost);
 * one-way roads spread their lanes across the whole carriageway (lane 0 leftmost).
 */
export function laneOffset(lanesF: number, lanesB: number, median: number, dir: 1 | -1, lane: number) {
  if (lanesF > 0 && lanesB > 0) return median / 2 + (lane + 0.5) * LANE;
  const n = lanesF + lanesB;
  return -(n * LANE) / 2 + (lane + 0.5) * LANE;
}

export function defaultLanes(type: RoadTypeId): [number, number] {
  const t = ROAD_TYPES[type];
  if (t.oneWay) return [t.lanes, 0];
  return [Math.ceil(t.lanes / 2), Math.floor(t.lanes / 2)];
}

/** Original road names: a first word and a suffix that suits the road. */
const FIRST = [
  "Meadow", "Quail", "Birch", "Harbor", "Juniper", "Copper", "Willow", "Lantern", "Falcon", "Orchard", "Granite", "Maple", "Heron", "Saffron", "Thistle", "Beacon",
  "Clover", "Cedar", "Larkspur", "Foxglove", "Marigold", "Summit", "Riverbend", "Hollow", "Pioneer", "Sparrow", "Elm", "Aspen", "Bramble", "Cobble", "Ivory", "Kestrel",
  "Linden", "Mill", "Northgate", "Oak", "Pebble", "Quarry", "Rosewood", "Sycamore", "Tanner", "Union", "Vale", "Wren", "Yarrow", "Alder", "Bluebell", "Chestnut",
  "Driftwood", "Ember", "Fern", "Garnet", "Hazel", "Indigo", "Jasper", "Kingfisher", "Lilac", "Magnolia", "Nettle", "Opal", "Primrose", "Raven", "Sage", "Tulip",
];
const SUFFIX: Record<RoadGroup | "big", string[]> = {
  traffic: ["Road", "Street", "Lane", "Way", "Drive", "Close", "Row"],
  big: ["Avenue", "Boulevard", "Parade", "Promenade"],
  highway: ["Highway", "Parkway", "Expressway", "Bypass"],
  transit: ["Transitway", "Street", "Avenue"],
  parking: ["Mews", "Street", "Place"],
};

export class RoadGraph {
  nodes = new Map<number, RNode>();
  edges = new Map<number, REdge>();
  private nextNode = 1;
  private nextEdge = 1;
  private nameSeed = 1;
  private usedNames = new Set<string>();
  /** Bumped on every change. */
  version = 0;

  toJSON() {
    return { nodes: [...this.nodes.values()], edges: [...this.edges.values()], nextNode: this.nextNode, nextEdge: this.nextEdge, nameSeed: this.nameSeed };
  }

  static from(json: ReturnType<RoadGraph["toJSON"]>) {
    const g = new RoadGraph();
    for (const n of json.nodes) g.nodes.set(n.id, { ...n });
    for (const e of json.edges) {
      g.edges.set(e.id, { ...e, pts: [...e.pts] });
      g.usedNames.add(e.name);
    }
    g.nextNode = json.nextNode;
    g.nextEdge = json.nextEdge;
    g.nameSeed = json.nameSeed;
    return g;
  }

  nodeEdges(id: number) {
    const out: REdge[] = [];
    for (const e of this.edges.values()) if (e.a === id || e.b === id) out.push(e);
    return out;
  }

  degree(id: number) {
    return this.nodeEdges(id).length;
  }

  newName(type: RoadTypeId) {
    const t = ROAD_TYPES[type];
    const pool = t.group === "traffic" && t.lanes >= 4 ? SUFFIX.big : SUFFIX[t.group];
    for (let k = 0; k < 400; k++) {
      this.nameSeed = (Math.imul(this.nameSeed, 1103515245) + 12345) >>> 0;
      const a = FIRST[(this.nameSeed >>> 8) % FIRST.length];
      const b = pool[(this.nameSeed >>> 20) % pool.length];
      const name = `${a} ${b}`;
      if (!this.usedNames.has(name) || k > 300) {
        this.usedNames.add(name);
        return name;
      }
    }
    return `Road ${this.nextEdge}`;
  }

  addNode(x: number, z: number, gate = false) {
    const n: RNode = { id: this.nextNode++, x, z, ...(gate ? { gate } : {}) };
    this.nodes.set(n.id, n);
    this.version++;
    return n;
  }

  addEdge(a: number, b: number, pts: number[], type: RoadTypeId, name: string, lanes?: [number, number]) {
    const [lf, lb] = lanes ?? defaultLanes(type);
    const e: REdge = { id: this.nextEdge++, a, b, type, pts, name, lanesF: lf, lanesB: lb };
    this.edges.set(e.id, e);
    this.version++;
    return e;
  }

  nearestNode(p: P, maxD: number) {
    let best: RNode | null = null;
    let bd = maxD;
    for (const n of this.nodes.values()) {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Closest edge within maxD of p (measured from the centre line), with where along it. */
  nearestEdge(p: P, maxD: number, skip?: Set<number>) {
    let best: { edge: REdge; d: number; s: number; side: number; x: number; z: number } | null = null;
    for (const e of this.edges.values()) {
      if (skip?.has(e.id)) continue;
      // Cheap reject on the bounding box.
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < e.pts.length; i += 2) {
        minX = Math.min(minX, e.pts[i]);
        maxX = Math.max(maxX, e.pts[i]);
        minZ = Math.min(minZ, e.pts[i + 1]);
        maxZ = Math.max(maxZ, e.pts[i + 1]);
      }
      if (p.x < minX - maxD || p.x > maxX + maxD || p.z < minZ - maxD || p.z > maxZ + maxD) continue;
      const pr = project(e.pts, cumulative(e.pts), p);
      if (pr.d < (best?.d ?? maxD)) best = { edge: e, d: pr.d, s: pr.s, side: pr.side, x: pr.x, z: pr.z };
    }
    return best;
  }

  /** Split an edge at arc length s; returns the new node (or an end node when s is at an end). */
  splitEdge(edgeId: number, s: number): { node: RNode; parts: REdge[] } {
    const e = this.edges.get(edgeId)!;
    const cum = cumulative(e.pts);
    const L = cum[cum.length - 1];
    if (s < 1) return { node: this.nodes.get(e.a)!, parts: [e] };
    if (s > L - 1) return { node: this.nodes.get(e.b)!, parts: [e] };
    const at = sampleAt(e.pts, cum, s);
    const node = this.addNode(at.x, at.z);
    const first: number[] = [];
    const second: number[] = [at.x, at.z];
    for (let i = 0; i < cum.length; i++) {
      if (cum[i] < s - 0.01) first.push(e.pts[i * 2], e.pts[i * 2 + 1]);
      else if (cum[i] > s + 0.01) second.push(e.pts[i * 2], e.pts[i * 2 + 1]);
    }
    first.push(at.x, at.z);
    this.edges.delete(e.id);
    const p1 = this.addEdge(e.a, node.id, first, e.type, e.name, [e.lanesF, e.lanesB]);
    const p2 = this.addEdge(node.id, e.b, second, e.type, e.name, [e.lanesF, e.lanesB]);
    return { node, parts: [p1, p2] };
  }

  /**
   * Where a new road of half-width `hw` should meet edge `e` at arc length `s` (crossing it at
   * an angle whose sine is `sin`): at a new junction, or at the edge's end node when that
   * node is too close for two junctions (their pads, curbs and zebras would overlap).
   */
  junctionOn(e: REdge, s: number, hw: number, sin = 1): RNode | null {
    const L = edgeLength(e);
    const pick = (nid: number, d: number) => {
      const n = this.nodes.get(nid);
      if (!n) return null;
      const arms = this.nodeEdges(nid);
      // Room for the old junction's mouth, the new one's (wider when it meets at a slant) and both zebras.
      const old = arms.length >= 2 ? Math.max(...arms.filter((o) => o !== e).map((o) => halfWidth(o))) : 0;
      const room = old + hw / Math.max(0.5, sin) + (arms.length >= 2 ? 8 : 3);
      return d < room ? { n, d } : null;
    };
    const a = pick(e.a, s);
    const b = pick(e.b, L - s);
    if (a && b) return a.d <= b.d ? a.n : b.n;
    return a?.n ?? b?.n ?? null;
  }

  /**
   * Lay a road along a polyline: snap the ends to nodes or roads, split every
   * road it crosses into a junction, and add the pieces. Returns the new edges
   * and every edge that was split (replaced) on the way.
   */
  addPath(raw: number[], type: RoadTypeId, opts: { name?: string; snap?: number; lanes?: [number, number] } = {}) {
    const snap = opts.snap ?? 4;
    const created: REdge[] = [];
    const removed: number[] = [];
    const replaced = new Map<number, number[]>();
    if (raw.length < 4 || polyLength(raw) < 4) return { created, removed, replaced };
    const pts = resample(raw, 4);
    const name = opts.name ?? this.newName(type);
    const before = new Set(this.edges.keys());
    const [lf, lb] = opts.lanes ?? defaultLanes(type);
    const hw = halfWidth({ type, lanesF: lf, lanesB: lb });
    /** Sine of the angle between the new road at path index i and edge e near (x, z). */
    const slant = (i: number, e: REdge, x: number, z: number) => {
      const j = Math.max(0, Math.min(pts.length / 2 - 2, i));
      const dx = pts[j * 2 + 2] - pts[j * 2];
      const dz = pts[j * 2 + 3] - pts[j * 2 + 1];
      const pr = project(e.pts, cumulative(e.pts), { x, z });
      const k = Math.max(0, Math.min(e.pts.length / 2 - 2, pr.seg));
      const ex = e.pts[k * 2 + 2] - e.pts[k * 2];
      const ez = e.pts[k * 2 + 3] - e.pts[k * 2 + 1];
      const den = Math.hypot(dx, dz) * Math.hypot(ex, ez);
      return den > 0 ? Math.abs(dx * ez - dz * ex) / den : 1;
    };

    const endNode = (x: number, z: number, i: number) => {
      const n = this.nearestNode({ x, z }, snap);
      if (n) return n;
      const near = this.nearestEdge({ x, z }, snap);
      if (near) {
        const join = this.junctionOn(near.edge, near.s, hw, slant(i, near.edge, x, z));
        if (join) return join;
        const { node, parts } = this.splitEdge(near.edge.id, near.s);
        if (parts.length === 2) {
          removed.push(near.edge.id);
          replaced.set(near.edge.id, parts.map((p) => p.id));
        }
        return node;
      }
      return this.addNode(x, z);
    };
    const n0 = endNode(pts[0], pts[1], 0);
    const n1 = endNode(pts[pts.length - 2], pts[pts.length - 1], pts.length / 2 - 2);
    // How far each end moved to its node: the path's own points that close get dropped, so it bends in cleanly.
    const cut0 = Math.hypot(n0.x - pts[0], n0.z - pts[1]);
    const cut1 = Math.hypot(n1.x - pts[pts.length - 2], n1.z - pts[pts.length - 1]);
    pts[0] = n0.x;
    pts[1] = n0.z;
    pts[pts.length - 2] = n1.x;
    pts[pts.length - 1] = n1.z;

    // Crossings with existing roads become junctions.
    const cum = cumulative(pts);
    const L = cum[cum.length - 1];
    const stops: { s: number; node: RNode; cut: number }[] = [
      { s: 0, node: n0, cut: cut0 },
      { s: L, node: n1, cut: cut1 },
    ];
    for (let guard = 0; guard < 400; guard++) {
      let hit: { s: number; edge: REdge; es: number; x: number; z: number; i: number } | null = null;
      for (const e of this.edges.values()) {
        if (!before.has(e.id) && !replacedChild(replaced, e.id)) continue;
        const ec = cumulative(e.pts);
        for (let i = 0; i < pts.length / 2 - 1; i++)
          for (let j = 0; j < e.pts.length / 2 - 1; j++) {
            const x = segX(pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3], e.pts[j * 2], e.pts[j * 2 + 1], e.pts[j * 2 + 2], e.pts[j * 2 + 3]);
            if (!x) continue;
            const s = cum[i] + (cum[i + 1] - cum[i]) * x.t;
            if (stops.some((st) => Math.abs(st.s - s) < 6 || Math.hypot(st.node.x - x.x, st.node.z - x.z) < 2)) continue;
            if (!hit || s < hit.s) hit = { s, edge: e, es: ec[j] + (ec[j + 1] - ec[j]) * x.u, x: x.x, z: x.z, i };
          }
      }
      if (!hit) break;
      const near = this.junctionOn(hit.edge, hit.es, hw, slant(hit.i, hit.edge, hit.x, hit.z));
      let node: RNode;
      if (near) node = near;
      else {
        const split = this.splitEdge(hit.edge.id, hit.es);
        node = split.node;
        if (split.parts.length === 2) {
          const orig = [...replaced.entries()].find(([, kids]) => kids.includes(hit!.edge.id))?.[0];
          if (orig !== undefined) {
            replaced.set(orig, [...replaced.get(orig)!.filter((k) => k !== hit!.edge.id), ...split.parts.map((p) => p.id)]);
          } else {
            removed.push(hit.edge.id);
            replaced.set(hit.edge.id, split.parts.map((p) => p.id));
          }
        }
      }
      stops.push({ s: hit.s, node, cut: Math.hypot(node.x - hit.x, node.z - hit.z) });
    }

    stops.sort((a, b) => a.s - b.s);
    for (let k = 0; k < stops.length - 1; k++) {
      const a = stops[k];
      const b = stops[k + 1];
      if (a.node.id === b.node.id || b.s - a.s < 1) continue;
      if ([...this.edges.values()].some((e) => (e.a === a.node.id && e.b === b.node.id) || (e.a === b.node.id && e.b === a.node.id))) continue;
      const piece: number[] = [a.node.x, a.node.z];
      for (let i = 0; i < cum.length; i++) if (cum[i] > a.s + 0.5 + a.cut * 1.2 && cum[i] < b.s - 0.5 - b.cut * 1.2) piece.push(pts[i * 2], pts[i * 2 + 1]);
      piece.push(b.node.x, b.node.z);
      created.push(this.addEdge(a.node.id, b.node.id, piece, type, name, opts.lanes));
    }
    return { created, removed, replaced };
  }

  /**
   * Junctions joined by a two-way stub too short for both of their mouths (laid before
   * crossings snapped to nearby junctions) become one junction. Roundabout rings are one-way
   * and left alone. Returns the stubs removed and the edges whose ends moved.
   */
  collapseStubs() {
    const removed: number[] = [];
    const moved = new Set<number>();
    for (let guard = 0; guard < 500; guard++) {
      let hit: REdge | null = null;
      for (const e of this.edges.values()) {
        if (e.lanesF === 0 || e.lanesB === 0 || e.a === e.b) continue;
        if (this.nodes.get(e.a)?.gate || this.nodes.get(e.b)?.gate) continue;
        const A = this.nodeEdges(e.a).filter((o) => o !== e);
        const B = this.nodeEdges(e.b).filter((o) => o !== e);
        if (A.length < 2 || B.length < 2) continue;
        if (edgeLength(e) < Math.max(...A.map((o) => halfWidth(o))) + Math.max(...B.map((o) => halfWidth(o))) + 8) {
          hit = e;
          break;
        }
      }
      if (!hit) break;
      // The busier junction stays where it is; the other folds into it.
      const keep = this.degree(hit.a) >= this.degree(hit.b) ? hit.a : hit.b;
      const drop = keep === hit.a ? hit.b : hit.a;
      const k = this.nodes.get(keep)!;
      this.edges.delete(hit.id);
      removed.push(hit.id);
      for (const o of this.nodeEdges(drop)) {
        if (o.a === keep || o.b === keep) {
          // A second stub between the same two junctions would become a loop.
          this.edges.delete(o.id);
          removed.push(o.id);
          continue;
        }
        if (o.a === drop) {
          o.a = keep;
          o.pts = [k.x, k.z, ...trimNear(o.pts.slice(2), k, 1)];
        }
        if (o.b === drop) {
          o.b = keep;
          o.pts = [...trimNear(o.pts.slice(0, -2), k, -1), k.x, k.z];
        }
        moved.add(o.id);
      }
      this.nodes.delete(drop);
      this.version++;
    }
    return { removed, moved: [...moved].filter((id) => this.edges.has(id)) };
  }

  /** Remove an edge; tidy up nodes left with nothing, and merge straight-through joints of one road. */
  removeEdge(id: number) {
    const e = this.edges.get(id);
    if (!e) return { removed: [] as number[], merged: [] as { from: number[]; to: number }[] };
    this.edges.delete(id);
    this.version++;
    const merged: { from: number[]; to: number }[] = [];
    for (const nid of [e.a, e.b]) {
      const n = this.nodes.get(nid);
      if (!n) continue;
      const es = this.nodeEdges(nid);
      if (es.length === 0 && !n.gate) this.nodes.delete(nid);
      else if (es.length === 2 && !n.gate) {
        const m = this.mergeAt(nid);
        if (m) merged.push(m);
      }
    }
    return { removed: [id], merged };
  }

  /** Two edges of the same road meeting at a node become one. */
  mergeAt(nid: number) {
    const es = this.nodeEdges(nid);
    if (es.length !== 2) return null;
    const [p, q] = es;
    if (p.type !== q.type || p.name !== q.name || p.lanesF + p.lanesB !== q.lanesF + q.lanesB || p.id === q.id) return null;
    // Orient both so p ends at nid and q starts at it.
    const pPts = p.b === nid ? p.pts : reverse(p.pts);
    const qPts = q.a === nid ? q.pts : reverse(q.pts);
    const start = p.b === nid ? p.a : p.b;
    const end = q.a === nid ? q.b : q.a;
    if (start === end) return null;
    const lanes: [number, number] = p.b === nid ? [p.lanesF, p.lanesB] : [p.lanesB, p.lanesF];
    this.edges.delete(p.id);
    this.edges.delete(q.id);
    this.nodes.delete(nid);
    const e = this.addEdge(start, end, [...pPts, ...qPts.slice(2)], p.type, p.name, lanes);
    return { from: [p.id, q.id], to: e.id };
  }

  /** Nodes reachable from the gate(s). */
  connectedNodes() {
    const adj = new Map<number, number[]>();
    for (const e of this.edges.values()) {
      (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b);
      (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a);
    }
    const seen = new Set<number>();
    const stack = [...this.nodes.values()].filter((n) => n.gate).map((n) => n.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const nb of adj.get(id) ?? []) if (!seen.has(nb)) stack.push(nb);
    }
    return seen;
  }

  /** Change type; lanes reset to the new type's split. */
  setType(id: number, type: RoadTypeId) {
    const e = this.edges.get(id);
    if (!e) return;
    e.type = type;
    [e.lanesF, e.lanesB] = defaultLanes(type);
    this.version++;
  }

  /** Lane layout: cycle the split of the same lane total (2+2 → 3+1 → 1+3 → 2+2). */
  cycleLanes(id: number) {
    const e = this.edges.get(id);
    if (!e) return;
    const total = e.lanesF + e.lanesB;
    if (total < 2) return;
    const splits: [number, number][] = [];
    for (let f = 1; f < total; f++) splits.push([f, total - f]);
    const half: [number, number] = [Math.ceil(total / 2), Math.floor(total / 2)];
    const order = [half, ...splits.filter(([f]) => f !== half[0])];
    const k = order.findIndex(([f, b]) => f === e.lanesF && b === e.lanesB);
    [e.lanesF, e.lanesB] = order[(k + 1) % order.length];
    this.version++;
  }

  /** One-way: two-way → a→b → b→a → two-way. */
  cycleOneWay(id: number) {
    const e = this.edges.get(id);
    if (!e) return;
    const total = e.lanesF + e.lanesB;
    if (e.lanesB > 0 && e.lanesF > 0) [e.lanesF, e.lanesB] = [total, 0];
    else if (e.lanesB === 0) [e.lanesF, e.lanesB] = [0, total];
    else [e.lanesF, e.lanesB] = defaultLanes(e.type).every((x) => x > 0) ? [Math.ceil(total / 2), Math.floor(total / 2)] : [total, 0];
    this.version++;
  }
}

function replacedChild(replaced: Map<number, number[]>, id: number) {
  for (const kids of replaced.values()) if (kids.includes(id)) return true;
  return false;
}

/**
 * Drop the points at one end of a polyline (dir 1: the start, -1: the end) that sit within
 * the junction's mouth around k, so a road whose end moved bends in cleanly. Keeps one point.
 */
function trimNear(pts: number[], k: { x: number; z: number }, dir: 1 | -1) {
  const out = dir === 1 ? pts.slice() : reverse(pts);
  while (out.length > 2 && Math.hypot(out[0] - k.x, out[1] - k.z) < 12) out.splice(0, 2);
  return dir === 1 ? out : reverse(out);
}

export function reverse(pts: number[]) {
  const out: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
  return out;
}

export const edgeLength = (e: REdge) => polyLength(e.pts);
