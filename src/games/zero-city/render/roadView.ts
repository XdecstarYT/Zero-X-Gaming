import * as THREE from "three";
import { rng } from "../core/rng";
import { WATER_LEVEL } from "../config";
import { cumulative, sampleAt } from "../core/geom";
import { world as W } from "../theme";
import type { City } from "../world/city";
import { carriageway, endDir, junctionSetback, LANE, laneOffset, PARKING, ROAD_TYPES, type REdge } from "../world/roads";
import { shared } from "./engine";
import { asphaltTexture, labelTexture, sidewalkTexture, SPEEDS, speedAtlas } from "./textures";
import { foliageMaterial, merge, paint, TreeView } from "./terrainView";

let streetTreeGeo: THREE.BufferGeometry | null = null;
let streetTreeMat: THREE.MeshStandardMaterial | null = null;

/** Growable geometry buffer. */
class Buf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  quad(a: V, b: V, c: V, d: V, uv: [number, number, number, number, number, number, number, number] = [0, 0, 1, 0, 1, 1, 0, 1], color?: THREE.Color, up = true) {
    const o = this.pos.length / 3;
    for (const p of [a, b, c, d]) this.pos.push(p[0], p[1], p[2]);
    if (up) for (let i = 0; i < 4; i++) this.nor.push(0, 1, 0);
    else {
      const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2])).normalize();
      for (let i = 0; i < 4; i++) this.nor.push(n.x, n.y, n.z);
    }
    this.uv.push(...uv);
    const k = color ?? WHITE;
    for (let i = 0; i < 4; i++) this.col.push(k.r, k.g, k.b);
    // Flat pieces always face up; walls keep the winding that matches their normal.
    const ny = up ? (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) : 1;
    if (ny >= 0) this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    else this.idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  tri(a: V, b: V, c: V, color?: THREE.Color) {
    const o = this.pos.length / 3;
    for (const p of [a, b, c]) this.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 3; i++) this.nor.push(0, 1, 0);
    this.uv.push(a[0] / 6, a[2] / 6, b[0] / 6, b[2] / 6, c[0] / 6, c[2] / 6);
    const k = color ?? WHITE;
    for (let i = 0; i < 3; i++) this.col.push(k.r, k.g, k.b);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny >= 0) this.idx.push(o, o + 1, o + 2);
    else this.idx.push(o, o + 2, o + 1);
  }
  build() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
type V = [number, number, number];
const WHITE = new THREE.Color("#ffffff");
const CONE = new THREE.Color("#ff7a1a");
const BARRIER = new THREE.Color("#e8452c");
const FRESH = new THREE.Color("#141416");
const CRACK = new THREE.Color("#1d1d1f");
const HOLE = new THREE.Color("#121213");
const PATCH = new THREE.Color("#3a3a3d");
/** How far a road's outer face reaches down (hidden underground where the land is flush). */
const WALL_DEPTH = 9;
const LINE_W = new THREE.Color(W.lineWhite);
const LINE_Y = new THREE.Color(W.lineYellow);
const BUS = new THREE.Color(W.busLane);
const GREEN = new THREE.Color("#5c9a3c");
const CONCRETE = new THREE.Color("#a7a39b");

/** A frame along an edge: position, height and tangent. */
interface Frame {
  x: number;
  z: number;
  y: number;
  tx: number;
  tz: number;
  s: number;
}

export class RoadView {
  readonly group = new THREE.Group();
  readonly labels = new THREE.Group();
  private edgeObjs = new Map<number, THREE.Group>();
  private nodeObjs = new Map<number, THREE.Group>();
  private mats: Record<"asphalt" | "walk" | "curb" | "lines" | "decal" | "concrete" | "label", THREE.Material>;
  private lampHeads: THREE.MeshStandardMaterial;
  private streetTrees: THREE.InstancedMesh | null = null;
  private lamps: THREE.InstancedMesh | null = null;
  private lampLights: THREE.InstancedMesh | null = null;
  private signs: THREE.InstancedMesh | null = null;
  private propsDirty = true;
  shadows = true;
  /** A road's condition (1 new … 0 broken) and whether roadworks are on, from the sim. */
  roadState: (edgeId: number) => { c: number; works: number } | undefined = () => undefined;

  constructor(private city: () => City) {
    const asphalt = asphaltTexture();
    const walk = sidewalkTexture();
    this.mats = {
      asphalt: new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      walk: new THREE.MeshStandardMaterial({ map: walk, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      curb: new THREE.MeshStandardMaterial({ color: W.curb, roughness: 0.8, side: THREE.DoubleSide }),
      lines: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
      decal: new THREE.MeshStandardMaterial({ map: speedAtlas(), transparent: true, alphaTest: 0.35, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, depthWrite: false }),
      concrete: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
      label: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    };
    this.lampHeads = new THREE.MeshStandardMaterial({ color: "#2b2b2b", emissive: new THREE.Color("#ffd48a"), emissiveIntensity: 0 });
    this.lampHeads.onBeforeRender = () => {
      this.lampHeads.emissiveIntensity = shared.uNight.value * 2.2;
    };
    this.group.add(this.labels);
  }

  // ------------------------------------------------------------- geometry

  /**
   * How far an edge's own mesh stops short of a node, leaving the rest to the junction
   * pad. Far enough that its full width (sidewalks included) never overlaps another arm's,
   * whatever the angle between them, so crossing surfaces don't fight or poke through.
   */
  private setback(nodeId: number, e: REdge) {
    return junctionSetback(this.city().roads.nodeEdges(nodeId), nodeId, e);
  }

  private frames(e: REdge, ys: Float32Array, s0: number, s1: number, step = 3): Frame[] {
    const cum = cumulative(e.pts);
    const L = cum[cum.length - 1];
    s0 = Math.max(0, s0);
    s1 = Math.min(L, s1);
    const ss: number[] = [s0];
    for (let i = 1; i < cum.length - 1; i++) if (cum[i] > s0 + 0.2 && cum[i] < s1 - 0.2) ss.push(cum[i]);
    ss.push(s1);
    ss.sort((a, b) => a - b);
    const fine: number[] = [];
    for (let i = 0; i < ss.length; i++) {
      fine.push(ss[i]);
      if (i < ss.length - 1) {
        const gap = ss[i + 1] - ss[i];
        const n = Math.floor(gap / step);
        for (let k = 1; k < n; k++) fine.push(ss[i] + (gap * k) / n);
      }
    }
    return fine.map((s) => {
      const p = sampleAt(e.pts, cum, s);
      const i = p.seg;
      const seg = Math.max(1e-6, cum[i + 1] - cum[i]);
      const t = Math.min(1, Math.max(0, (s - cum[i]) / seg));
      const y = ys[i] + (ys[Math.min(i + 1, ys.length - 1)] - ys[i]) * t;
      return { x: p.x, z: p.z, y, tx: p.tx, tz: p.tz, s };
    });
  }

  /** A band between two lateral offsets (right of a→b is +), dy above the road surface. */
  private band(buf: Buf, fr: Frame[], o0: number, o1: number, dy: number, color?: THREE.Color, vScale = 6, uWidth = 1) {
    for (let i = 0; i < fr.length - 1; i++) {
      const a = fr[i];
      const b = fr[i + 1];
      const pa0: V = [a.x - a.tz * o0, a.y + dy, a.z + a.tx * o0];
      const pa1: V = [a.x - a.tz * o1, a.y + dy, a.z + a.tx * o1];
      const pb0: V = [b.x - b.tz * o0, b.y + dy, b.z + b.tx * o0];
      const pb1: V = [b.x - b.tz * o1, b.y + dy, b.z + b.tx * o1];
      buf.quad(pa0, pa1, pb1, pb0, [0, a.s / vScale, uWidth, a.s / vScale, uWidth, b.s / vScale, 0, b.s / vScale], color);
    }
  }

  /** A vertical face along an offset, from dy0 up to dy1. */
  private wall(buf: Buf, fr: Frame[], o: number, dy0: number, dy1: number, flip: boolean, color?: THREE.Color) {
    for (let i = 0; i < fr.length - 1; i++) {
      const a = fr[i];
      const b = fr[i + 1];
      const lo1: V = [a.x - a.tz * o, a.y + dy0, a.z + a.tx * o];
      const hi1: V = [a.x - a.tz * o, a.y + dy1, a.z + a.tx * o];
      const lo2: V = [b.x - b.tz * o, b.y + dy0, b.z + b.tx * o];
      const hi2: V = [b.x - b.tz * o, b.y + dy1, b.z + b.tx * o];
      if (flip) buf.quad(lo2, hi2, hi1, lo1, undefined, color, false);
      else buf.quad(lo1, hi1, hi2, lo2, undefined, color, false);
    }
  }

  private dashes(buf: Buf, e: REdge, ys: Float32Array, s0: number, s1: number, off: number, w: number, color: THREE.Color, dash = 3, gap = 6) {
    for (let s = s0 + 1; s + dash <= s1; s += dash + gap) this.band(buf, this.frames(e, ys, s, s + dash, 1.5), off - w / 2, off + w / 2, 0.012, color);
  }

  buildEdge(e: REdge): THREE.Group {
    const c = this.city();
    const ys = c.profiles.get(e.id) ?? c.computeProfile(e);
    const t = ROAD_TYPES[e.type];
    const cw = carriageway(e);
    const half = cw / 2;
    const L = cumulative(e.pts)[e.pts.length / 2 - 1];
    const sA = Math.min(this.setback(e.a, e), L * 0.45);
    const sB = Math.min(this.setback(e.b, e), L * 0.45);
    const s0 = sA;
    const s1 = L - sB;
    const fr = this.frames(e, ys, s0, s1);
    const asphalt = new Buf();
    const walk = new Buf();
    const curb = new Buf();
    const lines = new Buf();
    const decals = new Buf();
    const concrete = new Buf();

    // Carriageway.
    this.band(asphalt, fr, -half, half, 0.03, undefined, 8, cw / 8);
    // Sidewalks and curbs.
    if (t.sidewalk > 0) {
      for (const side of [-1, 1]) {
        const a = side * half;
        const b = side * (half + t.sidewalk);
        this.band(walk, fr, Math.min(a, b), Math.max(a, b), 0.18, undefined, 4, t.sidewalk / 4);
        this.wall(curb, fr, a, 0.03, 0.18, side > 0);
        // The outer face runs well down into the ground: where the land falls away beside
        // a road (two roads at different heights on a slope) it reads as a retaining wall,
        // never a gap under the road.
        this.wall(curb, fr, b, -WALL_DEPTH, 0.18, side < 0);
      }
    } else {
      // Highway shoulders: solid edge lines, and the embankment face below the edge.
      for (const side of [-1, 1]) this.band(lines, fr, side * (half - 0.45) - 0.08, side * (half - 0.45) + 0.08, 0.012, LINE_W);
      for (const side of [-1, 1]) this.wall(concrete, fr, side * half, -WALL_DEPTH, 0.03, side < 0, CONCRETE);
    }
    // Median.
    if (t.median > 0) {
      if (t.medianTrees) {
        this.band(concrete, fr, -t.median / 2, t.median / 2, 0.2, GREEN);
        this.wall(curb, fr, -t.median / 2, 0.03, 0.2, true);
        this.wall(curb, fr, t.median / 2, 0.03, 0.2, false);
      } else {
        this.band(concrete, fr, -0.35, 0.35, 0.85, CONCRETE);
        this.wall(concrete, fr, -0.35, 0.03, 0.85, true, CONCRETE);
        this.wall(concrete, fr, 0.35, 0.03, 0.85, false, CONCRETE);
      }
      for (const side of [-1, 1]) this.band(lines, fr, side * (t.median / 2 + 0.25) - 0.07, side * (t.median / 2 + 0.25) + 0.07, 0.012, LINE_Y);
    }
    // Lanes, centre lines, bus and parking lanes.
    const two = e.lanesF > 0 && e.lanesB > 0;
    const offs = (dir: 1 | -1, lane: number) => dir * laneOffset(e.lanesF, e.lanesB, t.median, dir, lane);
    if (two && t.median === 0) {
      if (t.cls >= 2) {
        this.band(lines, fr, -0.2, -0.06, 0.012, LINE_Y);
        this.band(lines, fr, 0.06, 0.2, 0.012, LINE_Y);
      } else this.dashes(lines, e, ys, s0, s1, 0, 0.13, LINE_Y, 3, 5);
    }
    for (const dir of [1, -1] as const) {
      const n = dir === 1 ? e.lanesF : e.lanesB;
      for (let k = 0; k < n - 1; k++) {
        const o = (offs(dir, k) + offs(dir, k + 1)) / 2;
        this.dashes(lines, e, ys, s0, s1, o, 0.13, LINE_W);
      }
      if (t.bus && n > 0) {
        const o = offs(dir, n - 1);
        this.band(lines, fr, o - LANE / 2 + 0.15, o + LANE / 2 - 0.15, 0.008, BUS);
      }
    }
    if (!two && (e.lanesF + e.lanesB) > 1) {
      // One-way: lane lines across the whole carriageway.
      const n = e.lanesF + e.lanesB;
      for (let k = 1; k < n; k++) this.dashes(lines, e, ys, s0, s1, -(n * LANE) / 2 + k * LANE, 0.13, LINE_W);
    }
    if (t.parking) {
      for (const side of [-1, 1]) {
        const inner = side * (half - PARKING);
        this.band(lines, fr, inner - 0.07, inner + 0.07, 0.012, LINE_W);
        for (let s = s0 + 4; s < s1 - 2; s += 6) this.band(lines, this.frames(e, ys, s, s + 0.15, 1), Math.min(inner, side * half), Math.max(inner, side * half), 0.012, LINE_W);
      }
    }
    // Junction approaches: zebras, stop lines, arrows, painted speed limits.
    for (const end of ["a", "b"] as const) {
      const nodeId = end === "a" ? e.a : e.b;
      const deg = c.roads.degree(nodeId);
      const sEdge = end === "a" ? s0 : s1;
      const inward = end === "a" ? 1 : -1;
      // The lanes that drive toward this end.
      const inDir: 1 | -1 = end === "b" ? 1 : -1;
      const inLanes = inDir === 1 ? e.lanesF : e.lanesB;
      const outDir: 1 | -1 = end === "a" ? 1 : -1;
      const outLanes = outDir === 1 ? e.lanesF : e.lanesB;
      if (deg >= 3) {
        if (t.sidewalk > 0) {
          const z0 = sEdge + inward * 0.6;
          const z1 = sEdge + inward * 3.4;
          const zf = this.frames(e, ys, Math.min(z0, z1), Math.max(z0, z1), 1);
          for (let o = -half + 0.6; o < half - 0.4; o += 1.1) this.band(lines, zf, o, o + 0.55, 0.013, LINE_W);
        }
        const major = Math.max(...c.roads.nodeEdges(nodeId).map((o) => ROAD_TYPES[o.type].cls));
        if (inLanes > 0) {
          const lo = Math.min(offs(inDir, 0), offs(inDir, inLanes - 1)) - LANE / 2;
          const hi = Math.max(offs(inDir, 0), offs(inDir, inLanes - 1)) + LANE / 2;
          if (t.cls < major) {
            const sl = sEdge + inward * 4.2;
            this.band(lines, this.frames(e, ys, Math.min(sl, sl + inward * 0.5), Math.max(sl, sl + inward * 0.5), 1), lo + 0.2, hi - 0.2, 0.013, LINE_W);
            this.signAt(e, ys, sEdge + inward * 4.6, inDir * (half + (t.sidewalk > 0 ? t.sidewalk * 0.6 : 1.2)), inDir);
          }
          for (let k = 0; k < inLanes; k++) this.arrow(lines, e, ys, sEdge + inward * 12, offs(inDir, k), inDir, k === 0 && inLanes > 1 ? "left" : k === inLanes - 1 && inLanes > 1 ? "right" : "straight");
        }
      }
      if (outLanes > 0 && L > 60) {
        const sp = SPEEDS.indexOf(t.speed);
        if (sp >= 0) for (let k = 0; k < Math.min(outLanes, 2); k++) this.number(decals, e, ys, sEdge + inward * 20, offs(outDir, k), outDir, sp);
      }
      if (deg === 1) this.cap(asphalt, walk, curb, e, ys, end, half, t.sidewalk);
    }
    // Wear and roadworks.
    this.wear(lines, concrete, e, ys, s0, s1, offs);
    // Bridges.
    this.bridge(concrete, e, ys, s0, s1, half + t.sidewalk);

    const g = new THREE.Group();
    const add = (buf: Buf, mat: THREE.Material, shadow = false) => {
      const geo = buf.build();
      if (!geo) return;
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.castShadow = shadow && this.shadows;
      m.userData.edge = e.id;
      g.add(m);
    };
    add(asphalt, this.mats.asphalt);
    add(walk, this.mats.walk);
    add(curb, this.mats.curb);
    add(lines, this.mats.lines);
    add(decals, this.mats.decal);
    add(concrete, this.mats.concrete, true);
    g.userData.edge = e.id;
    return g;
  }

  /**
   * A worn road gets cracks, then patches and potholes; a road under works gets its outer
   * lane coned off with barriers at each end.
   */
  private wear(lines: Buf, concrete: Buf, e: REdge, ys: Float32Array, s0: number, s1: number, offs: (dir: 1 | -1, lane: number) => number) {
    const st = this.roadState(e.id);
    if (!st) return;
    const r = rng(e.id * 7919 + 13);
    const half = carriageway(e) / 2;
    const len = s1 - s0;
    if (st.works > 0) {
      const dir: 1 | -1 = e.lanesF > 0 ? 1 : -1;
      const n = dir === 1 ? e.lanesF : e.lanesB;
      const lane = offs(dir, Math.max(0, n - 1));
      const inner = lane - (dir * LANE) / 2;
      const a = s0 + 4;
      const b = s1 - 4;
      if (b - a < 6) return;
      // Cones along the closed lane's inner edge, barriers across both ends.
      for (let s = a; s <= b; s += 5) this.cone(concrete, e, ys, s, inner);
      for (const s of [a - 1, b + 1]) {
        const f = this.frames(e, ys, s, s + 0.4, 1);
        this.band(concrete, f, Math.min(inner, lane + (dir * LANE) / 2), Math.max(inner, lane + (dir * LANE) / 2), 0.9, BARRIER);
        this.band(concrete, f, Math.min(inner, lane + (dir * LANE) / 2), Math.max(inner, lane + (dir * LANE) / 2), 1.0, WHITE);
      }
      // Fresh black tarmac where they've dug up.
      this.band(lines, this.frames(e, ys, a + 2, Math.min(b - 2, a + 2 + len * 0.4), 2), Math.min(lane - LANE / 2 + 0.3, lane + LANE / 2 - 0.3), Math.max(lane - LANE / 2 + 0.3, lane + LANE / 2 - 0.3), 0.009, FRESH);
      return;
    }
    if (st.c >= 0.75) return;
    // Cracks first; patches and potholes as it gets worse.
    const cracks = Math.floor(((0.75 - st.c) * len) / 9);
    for (let i = 0; i < cracks; i++) {
      const s = s0 + r.range(2, Math.max(3, len - 2));
      const o = r.range(-half + 0.6, half - 0.6);
      this.band(lines, this.frames(e, ys, s, Math.min(s1, s + r.range(1.5, 4)), 1), o - 0.04, o + 0.04, 0.0105, CRACK);
    }
    if (st.c >= 0.5) return;
    const holes = Math.floor(((0.5 - st.c) * len) / 7) + 1;
    for (let i = 0; i < holes; i++) {
      const s = s0 + r.range(2, Math.max(3, len - 2));
      const o = r.range(-half + 0.8, half - 0.8);
      const sz = r.range(0.5, 1.3);
      this.band(lines, this.frames(e, ys, s, Math.min(s1, s + sz), 1), o - sz / 2, o + sz / 2, 0.0105, r.next() < 0.5 ? HOLE : PATCH);
    }
  }

  /** A traffic cone at arc length s, lateral offset o. */
  private cone(buf: Buf, e: REdge, ys: Float32Array, s: number, o: number) {
    const f = this.frames(e, ys, s, s + 0.01, 1)[0];
    const cx = f.x - f.tz * o;
    const cz = f.z + f.tx * o;
    const y = f.y + 0.03;
    const r = 0.22;
    const top: V = [cx, y + 0.75, cz];
    const base: V[] = [
      [cx - r, y, cz - r],
      [cx + r, y, cz - r],
      [cx + r, y, cz + r],
      [cx - r, y, cz + r],
    ];
    for (let i = 0; i < 4; i++) buf.tri(base[i], top, base[(i + 1) % 4], CONE);
    // The white band.
    const k = 0.45;
    const band = base.map((p): V => [cx + (p[0] - cx) * (1 - k), y + 0.75 * k + 0.01, cz + (p[2] - cz) * (1 - k)]);
    for (let i = 0; i < 4; i++) buf.tri(band[i], [cx, y + 0.75 * k + 0.12, cz], band[(i + 1) % 4], WHITE);
  }

  private cap(asphalt: Buf, walk: Buf, curb: Buf, e: REdge, ys: Float32Array, end: "a" | "b", half: number, sw: number) {
    const L = cumulative(e.pts)[e.pts.length / 2 - 1];
    const f = this.frames(e, ys, end === "a" ? 0 : L, end === "a" ? 0.01 : L, 1)[0];
    const out = end === "a" ? -1 : 1;
    const n = 12;
    for (const [r0, r1, buf, dy] of [
      [0, half, asphalt, 0.03],
      [half, half + sw, walk, 0.18],
    ] as const) {
      if (r1 <= r0) continue;
      for (let k = 0; k < n; k++) {
        const a0 = -Math.PI / 2 + (Math.PI * k) / n;
        const a1 = -Math.PI / 2 + (Math.PI * (k + 1)) / n;
        const pt = (r: number, a: number): V => {
          const along = Math.cos(a) * r * out;
          const side = Math.sin(a) * r;
          return [f.x + f.tx * along - f.tz * side, f.y + dy, f.z + f.tz * along + f.tx * side];
        };
        const a = pt(r0, a0);
        const b = pt(r1, a0);
        const c2 = pt(r1, a1);
        const d = pt(r0, a1);
        // World-space texture: the round end tiles on from the straight road.
        const m = buf === asphalt ? 8 : 4;
        buf.quad(a, b, c2, d, [a[0] / m, a[2] / m, b[0] / m, b[2] / m, c2[0] / m, c2[2] / m, d[0] / m, d[2] / m]);
        // The outer rim runs down into the ground like the road's sides.
        if (r1 === half + sw) curb.quad(c2, b, [b[0], b[1] - WALL_DEPTH, b[2]], [c2[0], c2[1] - WALL_DEPTH, c2[2]], undefined, undefined, false);
      }
    }
  }

  private arrow(buf: Buf, e: REdge, ys: Float32Array, s: number, off: number, dir: 1 | -1, kind: "straight" | "left" | "right") {
    const fr = this.frames(e, ys, s, s + 0.01, 1)[0];
    if (!fr) return;
    const tx = fr.tx * dir;
    const tz = fr.tz * dir;
    const base: [number, number] = [fr.x - fr.tz * off, fr.z + fr.tx * off];
    const P = (along: number, side: number): V => [base[0] + tx * along - tz * side, fr.y + 0.014, base[1] + tz * along + tx * side];
    // Shaft and head.
    buf.quad(P(-2.4, -0.13), P(-2.4, 0.13), P(0.6, 0.13), P(0.6, -0.13), undefined, LINE_W);
    buf.tri(P(0.6, -0.45), P(1.8, 0), P(0.6, 0.45), LINE_W);
    if (kind !== "straight") {
      const sgn = kind === "left" ? -1 : 1;
      buf.quad(P(-0.8, 0), P(-0.8, sgn * 0.9), P(-0.55, sgn * 0.9), P(-0.55, 0), undefined, LINE_W);
      buf.tri(P(-1.0, sgn * 0.9), P(-0.68, sgn * 1.5), P(-0.35, sgn * 0.9), LINE_W);
    }
  }

  private number(buf: Buf, e: REdge, ys: Float32Array, s: number, off: number, dir: 1 | -1, tile: number) {
    const fr = this.frames(e, ys, s, s + 0.01, 1)[0];
    if (!fr) return;
    const tx = fr.tx * dir;
    const tz = fr.tz * dir;
    const cx = fr.x - fr.tz * off;
    const cz = fr.z + fr.tx * off;
    const P = (along: number, side: number): V => [cx + tx * along - tz * side, fr.y + 0.016, cz + tz * along + tx * side];
    const u0 = tile / SPEEDS.length;
    const u1 = (tile + 1) / SPEEDS.length;
    // Read by a driver coming toward it: the bottom of the text faces them.
    buf.quad(P(-2.4, -1.25), P(-2.4, 1.25), P(2.4, 1.25), P(2.4, -1.25), [u0, 0, u1, 0, u1, 1, u0, 1]);
  }

  private yieldSigns: number[] = [];
  private signAt(e: REdge, ys: Float32Array, s: number, off: number, dir: 1 | -1) {
    const fr = this.frames(e, ys, s, s + 0.01, 1)[0];
    if (!fr) return;
    this.yieldSigns.push(fr.x - fr.tz * off, fr.y, fr.z + fr.tx * off, Math.atan2(fr.tz * dir, fr.tx * dir));
    this.propsDirty = true;
  }

  private bridge(buf: Buf, e: REdge, ys: Float32Array, s0: number, s1: number, hw: number) {
    const c = this.city();
    const fr = this.frames(e, ys, s0, s1, 3);
    let run: Frame[] = [];
    const flush = () => {
      if (run.length >= 2) {
        // Deck sides and underside, railings.
        for (const side of [-1, 1]) {
          this.wall(buf, run, side * (hw + 0.05), -1.4, 0.2, side > 0, CONCRETE);
          this.band(buf, run, side * (hw - 0.2), side * (hw + 0.05), 1.05, new THREE.Color("#8e8c86"));
          this.wall(buf, run, side * (hw + 0.05), 0.2, 1.05, side > 0, new THREE.Color("#8e8c86"));
        }
        this.band(buf, run.slice().reverse(), -hw - 0.05, hw + 0.05, -1.4, CONCRETE);
        // Pillars.
        for (const f of run.filter((_, i) => i % 7 === 3)) this.pillars.push(f.x, f.z, f.y - 1.4, Math.min(f.y - 1.4, c.terrain.heightAt(f.x, f.z) - 1), hw);
        this.propsDirty = true;
      }
      run = [];
    };
    for (const f of fr) {
      const ground = c.terrain.heightAt(f.x, f.z);
      const elevated = f.y - Math.max(ground, WATER_LEVEL - 0.5) > 1.6;
      if (elevated) run.push(f);
      else flush();
    }
    flush();
  }
  private pillars: number[] = [];

  /** Junction surface with rounded corners and corner sidewalks. */
  buildNode(id: number): THREE.Group | null {
    const c = this.city();
    const n = c.roads.nodes.get(id);
    if (!n) return null;
    const es = c.roads.nodeEdges(id);
    if (es.length < 2) return null;
    const y = c.nodeY(id);
    const arms = es
      .map((e) => {
        const d = endDir(e, id);
        const L = cumulative(e.pts)[e.pts.length / 2 - 1];
        const set = Math.min(this.setback(id, e), L * 0.45);
        const t = ROAD_TYPES[e.type];
        // The pad meets each arm at the arm's own height there (roads on a slope aren't level).
        const ay = c.roadY(e.id, e.a === id ? set : L - set);
        return { e, d, set, half: carriageway(e) / 2, sw: t.sidewalk, ang: Math.atan2(d.z, d.x), cx: n.x + d.x * set, cz: n.z + d.z * set, y: ay };
      })
      .sort((a, b) => a.ang - b.ang);
    if (arms.every((a) => a.set < 0.01)) return null;
    const asphalt = new Buf();
    const walk = new Buf();
    const curb = new Buf();
    const ring: V[] = [];
    const corners: { from: V; ctrl: V; to: V; a: (typeof arms)[number]; b: (typeof arms)[number] }[] = [];
    for (let k = 0; k < arms.length; k++) {
      const a = arms[k];
      const b = arms[(k + 1) % arms.length];
      const ra = { x: -a.d.z, z: a.d.x };
      const rb = { x: -b.d.z, z: b.d.x };
      const left: V = [a.cx - ra.x * a.half, a.y + 0.03, a.cz - ra.z * a.half];
      const right: V = [a.cx + ra.x * a.half, a.y + 0.03, a.cz + ra.z * a.half];
      const next: V = [b.cx - rb.x * b.half, b.y + 0.03, b.cz - rb.z * b.half];
      ring.push(left, right);
      const ctrl = intersect(right, a.d, next, b.d) ?? [(right[0] + next[0]) / 2, (a.y + b.y) / 2 + 0.03, (right[2] + next[2]) / 2];
      ctrl[1] = (a.y + b.y) / 2 + 0.03;
      corners.push({ from: right, ctrl, to: next, a, b });
      for (let i = 1; i < 8; i++) ring.push(bez(right, ctrl, next, i / 8));
    }
    for (let i = 0; i < ring.length; i++) asphalt.tri([n.x, y + 0.03, n.z], ring[i], ring[(i + 1) % ring.length]);
    // Corner sidewalks follow the curb outward.
    for (const k of corners) {
      if (k.a.sw <= 0 || k.b.sw <= 0) continue;
      const sw = Math.min(k.a.sw, k.b.sw);
      const pts: V[] = [];
      for (let i = 0; i <= 8; i++) pts.push(bez(k.from, k.ctrl, k.to, i / 8));
      // One outward offset per point (from the tangent through it), shared by the pieces on
      // either side, so the paving runs round the corner without wedge-shaped gaps.
      const outer: V[] = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b[0] - a[0];
        const dz = b[2] - a[2];
        const l = Math.hypot(dx, dz) || 1;
        // Outward is to the right of travel along the corner; p sits on the asphalt (+0.03), the walk 0.15 above.
        return [p[0] + (-dz / l) * sw, p[1] + 0.15, p[2] + (dx / l) * sw];
      });
      // World-space texture, so the corner paving tiles on smoothly from the straight walks.
      const uv = (v: V) => [v[0] / 4, v[2] / 4] as const;
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        const pw: V = [p[0], p[1] + 0.15, p[2]];
        const qw: V = [q[0], q[1] + 0.15, q[2]];
        const p2 = outer[i];
        const q2 = outer[i + 1];
        walk.quad(pw, p2, q2, qw, [...uv(pw), ...uv(p2), ...uv(q2), ...uv(qw)] as [number, number, number, number, number, number, number, number]);
        curb.quad([p[0], p[1], p[2]], [q[0], q[1], q[2]], qw, pw, undefined, undefined, false);
        // The outer face of the corner walk, down into the ground like the edges' curbs.
        curb.quad(q2, p2, [p2[0], p2[1] - WALL_DEPTH, p2[2]], [q2[0], q2[1] - WALL_DEPTH, q2[2]], undefined, undefined, false);
      }
    }
    const g = new THREE.Group();
    for (const [buf, mat] of [
      [asphalt, this.mats.asphalt],
      [walk, this.mats.walk],
      [curb, this.mats.curb],
    ] as const) {
      const geo = buf.build();
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }

  // ---------------------------------------------------------------- sync

  /** Rebuild what changed. */
  sync(changes: { edges: Set<number>; removedEdges: Set<number>; nodes: Set<number> }) {
    const c = this.city();
    for (const id of changes.removedEdges) this.dropEdge(id);
    const nodes = new Set(changes.nodes);
    for (const id of changes.edges) {
      const e = c.roads.edges.get(id);
      if (!e) {
        this.dropEdge(id);
        continue;
      }
      nodes.add(e.a);
      nodes.add(e.b);
    }
    // Edges touching a changed node need their ends redrawn.
    const edges = new Set(changes.edges);
    for (const nid of nodes) for (const e of c.roads.nodeEdges(nid)) edges.add(e.id);
    for (const id of edges) {
      const e = c.roads.edges.get(id);
      if (!e) continue;
      this.dropEdge(id);
      const g = this.buildEdge(e);
      this.edgeObjs.set(id, g);
      this.group.add(g);
    }
    for (const id of nodes) {
      const old = this.nodeObjs.get(id);
      if (old) {
        dispose(old);
        this.group.remove(old);
        this.nodeObjs.delete(id);
      }
      const g = this.buildNode(id);
      if (g) {
        this.nodeObjs.set(id, g);
        this.group.add(g);
      }
    }
    // Nodes that vanished.
    for (const id of [...this.nodeObjs.keys()])
      if (!c.roads.nodes.has(id)) {
        dispose(this.nodeObjs.get(id)!);
        this.group.remove(this.nodeObjs.get(id)!);
        this.nodeObjs.delete(id);
      }
    if (edges.size || changes.removedEdges.size) {
      this.rebuildProps();
      this.rebuildLabels();
    }
  }

  private dropEdge(id: number) {
    const g = this.edgeObjs.get(id);
    if (!g) return;
    dispose(g);
    this.group.remove(g);
    this.edgeObjs.delete(id);
  }

  /** Rebuild everything (map load, undo). */
  rebuildAll() {
    for (const id of [...this.edgeObjs.keys()]) this.dropEdge(id);
    for (const g of this.nodeObjs.values()) {
      dispose(g);
      this.group.remove(g);
    }
    this.nodeObjs.clear();
    const c = this.city();
    this.sync({ edges: new Set(c.roads.edges.keys()), removedEdges: new Set(), nodes: new Set(c.roads.nodes.keys()) });
  }

  /** Street trees, lamps, yield signs and bridge pillars for the whole network. */
  private rebuildProps() {
    const c = this.city();
    this.yieldSigns = [];
    this.pillars = [];
    // Re-run the per-edge passes that emit props (cheap: they only record positions).
    for (const e of c.roads.edges.values()) {
      const ys = c.profiles.get(e.id);
      if (!ys) continue;
      const L = cumulative(e.pts)[e.pts.length / 2 - 1];
      const s0 = Math.min(this.setback(e.a, e), L * 0.45);
      const s1 = L - Math.min(this.setback(e.b, e), L * 0.45);
      const t = ROAD_TYPES[e.type];
      const half = carriageway(e) / 2;
      this.bridge(new Buf(), e, ys, s0, s1, half + t.sidewalk);
      for (const end of ["a", "b"] as const) {
        const nodeId = end === "a" ? e.a : e.b;
        if (c.roads.degree(nodeId) < 3) continue;
        const major = Math.max(...c.roads.nodeEdges(nodeId).map((o) => ROAD_TYPES[o.type].cls));
        const inDir: 1 | -1 = end === "b" ? 1 : -1;
        const inLanes = inDir === 1 ? e.lanesF : e.lanesB;
        if (t.cls < major && inLanes > 0) this.signAt(e, ys, (end === "a" ? s0 + 4.6 : s1 - 4.6), inDir * (half + (t.sidewalk > 0 ? t.sidewalk * 0.6 : 1.2)), inDir);
      }
    }
    for (const m of [this.streetTrees, this.lamps, this.lampLights, this.signs, this.pillarMesh]) {
      if (!m) continue;
      this.group.remove(m);
      m.dispose();
    }
    const treePos: number[] = [];
    const lampPos: number[] = [];
    for (const e of c.roads.edges.values()) {
      const t = ROAD_TYPES[e.type];
      const ys = c.profiles.get(e.id);
      if (!ys) continue;
      const L = cumulative(e.pts)[e.pts.length / 2 - 1];
      const half = carriageway(e) / 2;
      const fr = this.frames(e, ys, 0, L, 3);
      const at = (s: number) => fr.reduce((best, f) => (Math.abs(f.s - s) < Math.abs(best.s - s) ? f : best), fr[0]);
      if (t.medianTrees) for (let s = 14; s < L - 14; s += 12) {
        const f = at(s);
        treePos.push(f.x, f.y + 0.2, f.z);
      }
      if (t.sidewalk > 0) {
        for (let s = 16; s < L - 10; s += 32) {
          for (const side of [-1, 1]) {
            const f = at(s + (side > 0 ? 0 : 16));
            const o = side * (half + t.sidewalk - 0.6);
            lampPos.push(f.x - f.tz * o, f.y + 0.18, f.z + f.tx * o, Math.atan2(-f.tx * side, -f.tz * side));
          }
          if (t.group === "traffic" && t.lanes >= 4 && !t.medianTrees) {
            for (const side of [-1, 1]) {
              const f = at(s + 8);
              const o = side * (half + t.sidewalk * 0.5);
              treePos.push(f.x - f.tz * o, f.y + 0.18, f.z + f.tx * o);
            }
          }
        }
      } else if (t.median > 0) {
        for (let s = 20; s < L - 10; s += 40) {
          const f = at(s);
          lampPos.push(f.x, f.y + 0.85, f.z, Math.atan2(f.tx, f.tz));
        }
      }
    }
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const Y = new THREE.Vector3(0, 1, 0);
    if (treePos.length) {
      // The same organic broadleaf as the woods, a little smaller, each turned its own way.
      streetTreeGeo ??= TreeView.broadGeometry().scale(0.62, 0.62, 0.62);
      streetTreeMat ??= foliageMaterial();
      const m = new THREE.InstancedMesh(streetTreeGeo, streetTreeMat, treePos.length / 3);
      for (let i = 0; i < treePos.length / 3; i++) {
        const x = treePos[i * 3];
        const z = treePos[i * 3 + 2];
        const k = 0.9 + rng(Math.floor(x * 7 + z * 13)).next() * 0.25;
        mtx.compose(new THREE.Vector3(x, treePos[i * 3 + 1], z), q.setFromAxisAngle(Y, (x * 0.37 + z * 0.61) % (Math.PI * 2)), new THREE.Vector3(k, k, k));
        m.setMatrixAt(i, mtx);
      }
      m.castShadow = this.shadows;
      m.receiveShadow = true;
      this.streetTrees = m;
      this.group.add(m);
    } else this.streetTrees = null;
    if (lampPos.length) {
      const pole = merge([paint(new THREE.CylinderGeometry(0.07, 0.1, 6, 6).translate(0, 3, 0), "#3a3d42"), paint(new THREE.BoxGeometry(0.12, 0.12, 1.6).translate(0, 6, 0.75), "#3a3d42")]);
      const n = lampPos.length / 4;
      const m = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }), n);
      const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.12, 0.6).translate(0, 5.9, 1.4), this.lampHeads, n);
      for (let i = 0; i < n; i++) {
        q.setFromAxisAngle(Y, lampPos[i * 4 + 3]);
        mtx.compose(new THREE.Vector3(lampPos[i * 4], lampPos[i * 4 + 1], lampPos[i * 4 + 2]), q, one);
        m.setMatrixAt(i, mtx);
        heads.setMatrixAt(i, mtx);
      }
      m.castShadow = this.shadows;
      this.lamps = m;
      this.lampLights = heads;
      this.group.add(m, heads);
    } else {
      this.lamps = this.lampLights = null;
    }
    if (this.yieldSigns.length) {
      const sign = merge([
        paint(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5).translate(0, 1.1, 0), "#8a8f96"),
        paint(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 3).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, 2.3, 0.04), "#ffffff"),
        paint(new THREE.CylinderGeometry(0.42, 0.42, 0.065, 3).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, 2.3, 0.045), "#d8322c"),
      ]);
      const n = this.yieldSigns.length / 4;
      const m = new THREE.InstancedMesh(sign, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), n);
      for (let i = 0; i < n; i++) {
        q.setFromAxisAngle(Y, -this.yieldSigns[i * 4 + 3] - Math.PI / 2);
        mtx.compose(new THREE.Vector3(this.yieldSigns[i * 4], this.yieldSigns[i * 4 + 1] + 0.18, this.yieldSigns[i * 4 + 2]), q, one);
        m.setMatrixAt(i, mtx);
      }
      this.signs = m;
      this.group.add(m);
    } else this.signs = null;
    if (this.pillars.length) {
      const n = this.pillars.length / 5;
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#a29e96", roughness: 0.85 }), n);
      for (let i = 0; i < n; i++) {
        const [x, z, top, bottom, hw] = this.pillars.slice(i * 5, i * 5 + 5);
        const h = Math.max(0.5, top - bottom);
        mtx.compose(new THREE.Vector3(x, bottom + h / 2, z), q.identity(), new THREE.Vector3(Math.min(hw * 1.2, 6), h, 1.6));
        m.setMatrixAt(i, mtx);
      }
      m.castShadow = this.shadows;
      m.receiveShadow = true;
      this.pillarMesh = m;
      this.group.add(m);
    } else this.pillarMesh = null;
    this.propsDirty = false;
  }
  private pillarMesh: THREE.InstancedMesh | null = null;

  /** Street names, flat along the road. */
  private rebuildLabels() {
    for (const m of [...this.labels.children]) {
      (m as THREE.Mesh).geometry.dispose();
      ((m as THREE.Mesh).material as THREE.Material).dispose();
      this.labels.remove(m);
    }
    const c = this.city();
    const done = new Map<string, number>();
    for (const e of c.roads.edges.values()) {
      const L = cumulative(e.pts)[e.pts.length / 2 - 1];
      if (L < 70) continue;
      const count = done.get(e.name) ?? 0;
      if (count > 6) continue;
      done.set(e.name, count + 1);
      const ys = c.profiles.get(e.id);
      if (!ys) continue;
      const { tex, aspect } = labelTexture(e.name);
      const f = this.frames(e, ys, L / 2, L / 2 + 0.01, 1)[0];
      const h = 2.6;
      const w = h * aspect;
      const geo = new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);
      const mat = (this.mats.label as THREE.MeshBasicMaterial).clone();
      mat.map = tex;
      const m = new THREE.Mesh(geo, mat);
      // Read left to right from the default camera: flip labels that would be upside down.
      let ang = Math.atan2(f.tz, f.tx);
      if (Math.cos(ang) < -0.05) ang += Math.PI;
      m.rotation.y = -ang;
      const off = e.lanesF > 0 && e.lanesB > 0 && ROAD_TYPES[e.type].median > 0 ? 0 : 0;
      m.position.set(f.x - f.tz * off, f.y + 0.06, f.z + f.tx * off);
      m.renderOrder = 3;
      this.labels.add(m);
    }
  }

  /** Labels show at middle zoom only. */
  update(dist: number) {
    this.labels.visible = dist < 520 && dist > 30;
    if (this.propsDirty) this.rebuildProps();
  }

  setShadows(on: boolean) {
    this.shadows = on;
    for (const m of [this.streetTrees, this.lamps, this.pillarMesh]) if (m) m.castShadow = on;
  }

  pickables() {
    return [...this.edgeObjs.values()];
  }

  /** A quick ghost ribbon (drawing preview). */
  static ghost(pts: number[], ys: number[], width: number, color: string) {
    const buf = new Buf();
    const cum = cumulative(pts);
    for (let i = 0; i < pts.length / 2 - 1; i++) {
      const ax = pts[i * 2];
      const az = pts[i * 2 + 1];
      const bx = pts[i * 2 + 2];
      const bz = pts[i * 2 + 3];
      const l = Math.hypot(bx - ax, bz - az) || 1;
      const tx = (bx - ax) / l;
      const tz = (bz - az) / l;
      const h = width / 2;
      buf.quad([ax + tz * h, ys[i] + 0.3, az - tx * h], [ax - tz * h, ys[i] + 0.3, az + tx * h], [bx - tz * h, ys[i + 1] + 0.3, bz + tx * h], [bx + tz * h, ys[i + 1] + 0.3, bz - tx * h], [0, cum[i] / 8, 1, cum[i] / 8, 1, cum[i + 1] / 8, 0, cum[i + 1] / 8]);
    }
    const geo = buf.build();
    const m = new THREE.Mesh(geo ?? new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 5;
    return m;
  }

  dispose() {
    for (const g of this.edgeObjs.values()) dispose(g);
    for (const g of this.nodeObjs.values()) dispose(g);
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

/** Unit direction pointing from a node into an edge. */
/**
 * How far along arm A (direction da, half-width ha) its cross-section must start so no part
 * of it lies inside arm B (direction db, half-width hb), both leaving the same node.
 */
/** Where two curb lines (each running back toward the node) meet. */
function intersect(p: V, dp: { x: number; z: number }, q: V, dq: { x: number; z: number }): V | null {
  const den = dp.x * dq.z - dp.z * dq.x;
  if (Math.abs(den) < 0.08) return null;
  const t = ((q[0] - p[0]) * dq.z - (q[2] - p[2]) * dq.x) / den;
  if (t > 0) return null;
  if (t < -60) return null;
  return [p[0] + dp.x * t, p[1], p[2] + dp.z * t];
}

function bez(a: V, c: V, b: V, t: number): V {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], a[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]];
}

export function dispose(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}
