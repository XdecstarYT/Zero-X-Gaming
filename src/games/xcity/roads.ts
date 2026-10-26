import { BRIDGE_MULT, BULB_R, LOT_D, LOT_W, MAP_HALF, ROADS, STREET_NAMES, STREET_SUFFIX, type RoadKind } from "./data";
import { bbox, distToPoly, Hash, nearestOn, obbOverlap, obbSamples, pointAt, polyLength, segCross, segDist, slice, type OBB, type Pts } from "./geom";
import { indexEdge, indexLot, ix, pick, rand, unindexLot, type Building, type Lot, type REdge, type RNode, type State } from "./state";

/**
 * The road network: nodes and edges along polylines. New roads snap to nearby junctions and
 * split the roads they cross; lots line both sides of every road wherever they fit.
 */

const SNAP = 10;

export interface Loss {
  homes: number;
  jobs: number;
  people: number;
  buildings: number;
}

export const noLoss = (): Loss => ({ homes: 0, jobs: 0, people: 0, buildings: 0 });

export function addLoss(a: Loss, b: Loss) {
  a.homes += b.homes;
  a.jobs += b.jobs;
  a.people += b.people;
  a.buildings += b.buildings;
  return a;
}

/** People per home, by building form. */
export function householdSize(b: Pick<Building, "form">) {
  return b.form === "house" || b.form === "farmhouse" ? 2.7 : b.form === "townhouse" ? 2.4 : b.form === "walkup" ? 2.1 : 1.9;
}

export const roadHalf = (k: RoadKind) => ROADS[k].half;

const riverIx = new WeakMap<Pts, Hash>();

/** Distance to the river's centreline, or `cap` if it's further than that. */
export function riverDist(s: State, x: number, z: number, cap = 200) {
  let h = riverIx.get(s.river);
  const p = s.river;
  if (!h) {
    h = new Hash(64);
    for (let i = 2; i < p.length; i += 2) h.add(i, Math.min(p[i - 2], p[i]), Math.min(p[i - 1], p[i + 1]), Math.max(p[i - 2], p[i]), Math.max(p[i - 1], p[i + 1]));
    riverIx.set(p, h);
  }
  let d = cap;
  for (const i of h.query(x - cap, z - cap, x + cap, z + cap)) {
    const r = segDist(x, z, p[i - 2], p[i - 1], p[i], p[i + 1]).d;
    if (r < d) d = r;
  }
  return d;
}

export function inWater(s: State, x: number, z: number, pad = 0) {
  return riverDist(s, x, z, s.riverHalf + pad + 1) < s.riverHalf + pad;
}

export function onMap(x: number, z: number, pad = 0) {
  return Math.abs(x) <= MAP_HALF - pad && Math.abs(z) <= MAP_HALF - pad;
}

export function streetName(s: State, kind: RoadKind) {
  for (let i = 0; i < 12; i++) {
    const n = `${pick(s, STREET_NAMES)} ${pick(s, STREET_SUFFIX[kind])}`;
    if (!s.usedNames[n]) {
      s.usedNames[n] = 1;
      return n;
    }
  }
  return `${pick(s, STREET_NAMES)} ${pick(s, STREET_SUFFIX[kind])}`;
}

/* ------------------------------------------------------------------ nodes and edges */

export function addNode(s: State, x: number, z: number): RNode {
  const n: RNode = { id: s.nodes.length, x, z, edges: [] };
  s.nodes.push(n);
  return n;
}

export function addEdge(s: State, a: number, b: number, pts: Pts, kind: RoadKind, name: string, bike = false, tram = false): REdge {
  const na = s.nodes[a]!;
  const nb = s.nodes[b]!;
  pts = pts.slice();
  pts[0] = na.x;
  pts[1] = na.z;
  pts[pts.length - 2] = nb.x;
  pts[pts.length - 1] = nb.z;
  const e: REdge = { id: s.edges.length, a, b, kind, pts, len: polyLength(pts), bike, tram, name, conn: false };
  s.edges.push(e);
  na.edges.push(e.id);
  nb.edges.push(e.id);
  indexEdge(s, ix(s), e);
  s.rev++;
  return e;
}

export function nearestNode(s: State, x: number, z: number, maxD: number): RNode | null {
  let best: RNode | null = null;
  let bd = maxD;
  for (const n of s.nodes) {
    if (!n || !n.edges.length) continue;
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

export function nearestEdge(s: State, x: number, z: number, maxD: number, skip?: Set<number>) {
  let best: { id: number; d: number; s: number; x: number; z: number } | null = null;
  for (const id of ix(s).edges.query(x - maxD, z - maxD, x + maxD, z + maxD)) {
    if (skip?.has(id)) continue;
    const e = s.edges[id];
    if (!e) continue;
    const r = nearestOn(e.pts, x, z);
    if (r.d <= maxD && (!best || r.d < best.d)) best = { id, d: r.d, s: r.s, x: r.x, z: r.z };
  }
  return best;
}

/** Split an edge at arc length `at`; the head keeps its id, the tail is a new edge. Returns the new node. */
export function splitEdge(s: State, id: number, at: number): RNode {
  const e = s.edges[id]!;
  const p = pointAt(e.pts, at);
  const n = addNode(s, p.x, p.z);
  const head = slice(e.pts, 0, at);
  const tail = slice(e.pts, at, e.len);
  const I = ix(s);
  const nb = s.nodes[e.b]!;
  nb.edges = nb.edges.filter((x) => x !== id);
  const oldB = e.b;
  e.b = n.id;
  e.pts = head;
  head[head.length - 2] = n.x;
  head[head.length - 1] = n.z;
  e.len = polyLength(head);
  n.edges.push(id);
  indexEdge(s, I, e);
  const t = addEdge(s, n.id, oldB, tail, e.kind, e.name, e.bike, e.tram);
  t.conn = e.conn;
  // Lots past the split now front the tail.
  for (const lid of [...(I.byEdge.get(id) ?? [])]) {
    const l = s.lots[lid]!;
    if (l.s > at) {
      unindexLot(I, l);
      l.edge = t.id;
      l.s -= at;
      indexLot(I, l);
    }
  }
  s.rev++;
  return n;
}

/** Remove a road, everything on its lots, and any junction left with nothing. */
export function removeEdge(s: State, id: number): Loss {
  const e = s.edges[id];
  const loss = noLoss();
  if (!e) return loss;
  const I = ix(s);
  for (const lid of [...(I.byEdge.get(id) ?? [])]) addLoss(loss, removeLot(s, lid));
  I.byEdge.delete(id);
  I.edges.remove(id);
  for (const nid of [e.a, e.b]) {
    const n = s.nodes[nid];
    if (!n) continue;
    n.edges = n.edges.filter((x) => x !== id);
    if (!n.edges.length) s.nodes[nid] = null;
  }
  s.edges[id] = null;
  refreshConn(s);
  s.rev++;
  return loss;
}

/** Which roads reach the edge of the map, through the network. */
export function refreshConn(s: State) {
  const seen = new Set<number>();
  const q: number[] = [];
  for (const n of s.nodes) {
    if (!n || !n.edges.length || onMap(n.x, n.z, 3)) continue;
    q.push(n.id);
    seen.add(n.id);
  }
  while (q.length) {
    const nid = q.pop()!;
    for (const eid of s.nodes[nid]!.edges) {
      const e = s.edges[eid]!;
      const o = e.a === nid ? e.b : e.a;
      if (!seen.has(o)) {
        seen.add(o);
        q.push(o);
      }
    }
  }
  for (const e of s.edges) if (e) e.conn = seen.has(e.a) || seen.has(e.b);
}

/** A junction is a dead end (where a cul-de-sac gets its turning circle). */
export function isDeadEnd(s: State, n: RNode) {
  if (n.edges.length !== 1 || !onMap(n.x, n.z, 4)) return false;
  return s.edges[n.edges[0]]?.kind !== "lane";
}

/* ------------------------------------------------------------------ laying a road */

/** Can a road go here? Returns a reason if not. */
export function checkRoad(s: State, pts: Pts, kind: RoadKind): string | null {
  const L = polyLength(pts);
  if (L < 12) return "Too short";
  for (let i = 0; i < pts.length; i += 2) if (!onMap(pts[i], pts[i + 1], -1)) return "Off the map";
  const half = roadHalf(kind);
  // Roads that meet this one's ends carry on from it, so they don't count.
  const skip = new Set<number>();
  for (const k of [0, pts.length - 2]) for (const id of nearestNode(s, pts[k], pts[k + 1], 1)?.edges ?? []) skip.add(id);
  // Running along another road, too close to it.
  let close = 0;
  let n = 0;
  for (let d = 12; d < L - 12; d += 6) {
    n++;
    const p = pointAt(pts, d);
    const r = nearestEdge(s, p.x, p.z, half + 18, skip);
    if (!r) continue;
    const e = s.edges[r.id]!;
    const q = pointAt(e.pts, r.s);
    const par = Math.abs(q.dx * p.dx + q.dz * p.dz);
    if (par > 0.92 && r.d < half + roadHalf(e.kind) + 4) close++;
  }
  if (n && close / n > 0.25) return "Too close to another road";
  return null;
}

export function roadCost(s: State, pts: Pts, kind: RoadKind, extra = 0) {
  const L = polyLength(pts);
  let wet = 0;
  for (let d = 0; d < L; d += 5) {
    const p = pointAt(pts, d);
    if (inWater(s, p.x, p.z, roadHalf(kind))) wet += 5;
  }
  const per = ROADS[kind].cost + extra;
  return Math.round((L - wet) * per + wet * per * BRIDGE_MULT);
}

/** What a road along `pts` would knock down. */
export function roadClears(s: State, pts: Pts, kind: RoadKind): Loss {
  const loss = noLoss();
  const seen = new Set<number>();
  for (const lid of lotsTouching(s, pts, roadHalf(kind))) {
    const l = s.lots[lid]!;
    if (l.bld < 0 || seen.has(l.bld)) continue;
    seen.add(l.bld);
    addLoss(loss, buildingLoss(s.buildings[l.bld]!));
  }
  return loss;
}

export function buildingLoss(b: Building): Loss {
  if (!b.done) return { homes: 0, jobs: 0, people: 0, buildings: 1 };
  return { homes: b.homes, jobs: b.jobs, people: Math.round(b.homes * householdSize(b)), buildings: 1 };
}

function lotsTouching(s: State, pts: Pts, half: number, skipEdge = -1) {
  const out: number[] = [];
  const b = bbox(pts, half + 30);
  for (const lid of ix(s).lots.query(b.x0, b.z0, b.x1, b.z1)) {
    const l = s.lots[lid];
    if (!l || l.edge === skipEdge) continue;
    const sm = obbSamples(lotObb(l));
    for (let k = 0; k < sm.length; k += 2)
      if (distToPoly(pts, sm[k], sm[k + 1]) < half + 0.4) {
        out.push(lid);
        break;
      }
  }
  return out;
}

/**
 * Lay a road along a polyline: snap its ends to nearby junctions or roads, split every road it
 * crosses, knock down what's in the way and line the new road with lots. Returns the new edges
 * and what was lost, or a reason it can't be built.
 */
export function addRoad(s: State, pts0: Pts, kind: RoadKind, name?: string): { edges: number[]; loss: Loss } | string {
  const pts = pts0.slice();
  const snapEnd = (k: number) => {
    const n = nearestNode(s, pts[k], pts[k + 1], SNAP);
    if (n) {
      pts[k] = n.x;
      pts[k + 1] = n.z;
      return;
    }
    const e = nearestEdge(s, pts[k], pts[k + 1], SNAP);
    if (e) {
      pts[k] = e.x;
      pts[k + 1] = e.z;
    }
  };
  snapEnd(0);
  snapEnd(pts.length - 2);
  const why = checkRoad(s, pts, kind);
  if (why) return why;
  const L = polyLength(pts);
  // Every crossing with an existing road, by distance along the new one.
  const hits: { s: number; x: number; z: number }[] = [{ s: 0, x: pts[0], z: pts[1] }];
  const b = bbox(pts, 2);
  for (const id of ix(s).edges.query(b.x0, b.z0, b.x1, b.z1)) {
    const e = s.edges[id];
    if (!e) continue;
    let acc = 0;
    for (let i = 2; i < pts.length; i += 2) {
      const l = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      for (let j = 2; j < e.pts.length; j += 2) {
        const c = segCross(pts[i - 2], pts[i - 1], pts[i], pts[i + 1], e.pts[j - 2], e.pts[j - 1], e.pts[j], e.pts[j + 1]);
        if (c) hits.push({ s: acc + c.t * l, x: c.x, z: c.z });
      }
      acc += l;
    }
  }
  hits.push({ s: L, x: pts[pts.length - 2], z: pts[pts.length - 1] });
  hits.sort((p, q) => p.s - q.s);
  const nodes: number[] = [];
  const at: number[] = [];
  let lastS = -Infinity;
  for (let k = 0; k < hits.length; k++) {
    const h = hits[k];
    const end = k === 0 || k === hits.length - 1;
    if (!end && (h.s - lastS < 8 || L - h.s < 8)) continue;
    let n = nearestNode(s, h.x, h.z, SNAP);
    if (!n) {
      const e = nearestEdge(s, h.x, h.z, 1.5);
      if (e) {
        const ed = s.edges[e.id]!;
        n = e.s < SNAP ? s.nodes[ed.a]! : e.s > ed.len - SNAP ? s.nodes[ed.b]! : splitEdge(s, e.id, e.s);
      } else n = addNode(s, h.x, h.z);
    }
    if (nodes.length && nodes[nodes.length - 1] === n.id) continue;
    nodes.push(n.id);
    at.push(h.s);
    lastS = h.s;
  }
  const made: number[] = [];
  const nm = name ?? streetName(s, kind);
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i];
    const c = nodes[i + 1];
    if (a === c) continue;
    const piece = slice(pts, at[i], at[i + 1]);
    if (polyLength(piece) < 3) continue;
    const dup = s.nodes[a]!.edges.some((eid) => {
      const e = s.edges[eid]!;
      return (e.a === c || e.b === c) && Math.abs(e.len - polyLength(piece)) < 6;
    });
    if (dup) continue;
    made.push(addEdge(s, a, c, piece, kind, nm).id);
  }
  // Drop orphan nodes made for nothing.
  for (const nid of nodes) if (s.nodes[nid] && !s.nodes[nid]!.edges.length) s.nodes[nid] = null;
  const loss = noLoss();
  for (const id of made) {
    const e = s.edges[id]!;
    for (const lid of lotsTouching(s, e.pts, roadHalf(e.kind), id)) addLoss(loss, removeLot(s, lid));
  }
  refreshConn(s);
  // Line the new roads (and the roads they meet) with lots.
  const touch = new Set(made);
  for (const nid of nodes) for (const eid of s.nodes[nid]?.edges ?? []) touch.add(eid);
  fillLots(s, [...touch]);
  return { edges: made, loss };
}

/* ------------------------------------------------------------------ lots */

export function lotObb(l: Pick<Lot, "x" | "z" | "ux" | "uz">, w = LOT_W, d = LOT_D): OBB {
  return { x: l.x, z: l.z, ux: l.ux, uz: l.uz, hw: w / 2, hd: d / 2 };
}

/** Does a lot fit here: on land, on the map, clear of roads, turning circles and other lots? */
export function lotFits(s: State, o: OBB, ownEdge: number) {
  const sm = obbSamples(o);
  for (let k = 0; k < sm.length; k += 2) {
    if (!onMap(sm[k], sm[k + 1], 4)) return false;
    if (inWater(s, sm[k], sm[k + 1], 3)) return false;
  }
  const I = ix(s);
  const r = Math.max(o.hw, o.hd) + 2;
  for (const id of I.edges.query(o.x - r, o.z - r, o.x + r, o.z + r)) {
    const e = s.edges[id];
    if (!e) continue;
    const h = roadHalf(e.kind) + (id === ownEdge ? 0.3 : 0.8);
    for (let k = 0; k < sm.length; k += 2) if (distToPoly(e.pts, sm[k], sm[k + 1]) < h) return false;
    for (const nid of [e.a, e.b]) {
      const n = s.nodes[nid]!;
      if (isDeadEnd(s, n)) for (let k = 0; k < sm.length; k += 2) if (Math.hypot(sm[k] - n.x, sm[k + 1] - n.z) < BULB_R + 1.5) return false;
    }
  }
  for (const id of I.lots.query(o.x - r - 20, o.z - r - 20, o.x + r + 20, o.z + r + 20)) {
    const l = s.lots[id];
    if (l && obbOverlap(o, lotObb(l), 0.4)) return false;
  }
  return true;
}

/** Put lots along both sides of these roads wherever they fit. */
export function fillLots(s: State, edges: number[]) {
  const I = ix(s);
  let added = 0;
  for (const id of edges) {
    const e = s.edges[id];
    if (!e) continue;
    const off = roadHalf(e.kind) + 0.6 + LOT_D / 2;
    for (const side of [1, -1] as const) {
      let d = 1;
      while (d + LOT_W <= e.len - 1) {
        const p = pointAt(e.pts, d + LOT_W / 2);
        const nx = -p.dz * side;
        const nz = p.dx * side;
        const lot: Lot = { id: s.lots.length, edge: id, side, s: d + LOT_W / 2, x: p.x + nx * off, z: p.z + nz * off, ux: p.dx, uz: p.dz, bld: -1, district: -1, loc: 1 };
        if (lotFits(s, lotObb(lot), id)) {
          s.lots.push(lot);
          indexLot(I, lot);
          added++;
          d += LOT_W;
        } else d += 3;
      }
    }
  }
  if (added) s.rev++;
  return added;
}

/** Which way a lot's front faces (toward its road). */
export function lotFront(l: Lot) {
  return { x: l.uz * l.side, z: -l.ux * l.side };
}

export function removeLot(s: State, id: number): Loss {
  const l = s.lots[id];
  if (!l) return noLoss();
  const loss = l.bld >= 0 ? demolish(s, l.bld) : noLoss();
  unindexLot(ix(s), l);
  s.lots[id] = null;
  s.rev++;
  return loss;
}

/** Knock a building down, freeing its lots. */
export function demolish(s: State, id: number): Loss {
  const b = s.buildings[id];
  if (!b) return noLoss();
  const loss = buildingLoss(b);
  for (const lid of b.lots) {
    const l = s.lots[lid];
    if (l && l.bld === id) l.bld = -1;
  }
  s.buildings[id] = null;
  s.rev++;
  return loss;
}

/** The lots in a row along the same road side, starting at `lid` and going `n` long (or fewer). */
export function lotRow(s: State, lid: number, n: number) {
  const l0 = s.lots[lid]!;
  const row = [...(ix(s).byEdge.get(l0.edge) ?? [])].map((i) => s.lots[i]!).filter((l) => l.side === l0.side);
  row.sort((a, b) => a.s - b.s);
  const k = row.findIndex((l) => l.id === lid);
  const out = [l0.id];
  for (let i = k + 1; i < row.length && out.length < n; i++) {
    if (Math.abs(row[i].s - row[i - 1].s - LOT_W) > 0.5) break;
    out.push(row[i].id);
  }
  return out;
}

/** A random bend for an organic road, used by the patterns. */
export const wobble = (s: State, a: number) => (rand(s) - 0.5) * a;
