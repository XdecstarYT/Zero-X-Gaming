import * as THREE from "three";
import { asphaltDetail, concrete } from "../../code-3/textures";
import { leafClusterTexture } from "../../neon-siege/three/textures";
import { junctionHalf } from "../traffic";
import type { State } from "../state";
import { at, TRACK_OFF, tracksFor, type Track } from "../trams";
import { districtAt, groundY, noise, PIERS, riverAt, ROAD, segAt, TRAMS, WATER_Y, type Building, type City, type District, type Node, type Prop, type Seg } from "../world";
import { FACADE_UNIFORMS, facadeMaterial, LOD_UNIFORMS } from "./facade";
import { buildLandmark, type LandmarkModel } from "./landmarks";
import { box, cyl, merge, paint, propTemplate } from "./models";
import { FacadeSheet, Sheet } from "./sheet";
import { asphaltTone, billboard, corrugated, frondTexture, glow, graffiti, groundDetail, lace, neonSign, planks, poolTiles, rippleNormal, shopSign, tramStopSign } from "./textures";

/**
 * Melbourne in 3D, streamed in 160 m chunks round the camera: the ground (lawns, sand, bluestone
 * paving, the docks' concrete), roads with Australian markings (white centre lines, broken-line
 * crossings, kerbside lights on the left), bluestone kerbs and channels, tram rails and their
 * overhead wires on poles, tram stops, bridges, piers, and the buildings: every wall drawn by the
 * facade shader (glass, concrete, sandstone, brick, render, weatherboard, iron, bluestone, with
 * rooms behind the windows), corrugated-iron roofs (hipped, gabled, sawtooth), cast-iron lace
 * verandahs, shop awnings and signs, laneway graffiti, and the street trees and props. The
 * landmarks are always there; beyond the chunks a far skyline (the same facades, simplified) and
 * a coarse ground keep the horizon full.
 */

export const CHUNK = 160;
export type Quality = "low" | "medium" | "high";

const X0 = -1760;
const Z0 = -1010;
const CX = 21;
const CZ = 17;

interface ChunkData {
  buildings: Building[];
  props: Prop[];
  pieces: { seg: Seg; t0: number; t1: number }[];
  nodes: Node[];
  piers: typeof PIERS;
  rails: { t: Track; i0: number; i1: number }[];
  stops: { t: Track; x: number; z: number; h: number; num: string }[];
}

export interface SignalHead {
  node: Node;
  axis: "ns" | "ew";
  x: number;
  y: number;
  z: number;
  ry: number;
}

const WHITE = new THREE.Color(1, 1, 1);
const CBD_LIKE = new Set<District>(["cbd", "southbank", "docklands"]);
/** Face index (0 east, 1 south, 2 west, 3 north) → its outward normal. */
const FACE_N: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const ROOF_IRON = ["#8e3a2c", "#6d7378", "#4a5058", "#2f3a33", "#9a9fa4", "#7a3a2e"];

export class CityView {
  readonly root = new THREE.Group();
  private data: ChunkData[] = [];
  private chunks = new Map<number, THREE.Group>();
  private lodMesh: THREE.Mesh;
  private farGround: THREE.Mesh;
  private signMats = new Set<THREE.MeshBasicMaterial>();
  readonly glowMats: THREE.PointsMaterial[] = [];
  private poolMeshes = new Set<THREE.Mesh>();
  readonly mats: Record<string, THREE.Material>;
  readonly signals: SignalHead[] = [];
  readonly landmarks: { model: LandmarkModel; x: number; z: number; r: number }[] = [];
  private graffitiMats: THREE.MeshStandardMaterial[] = [];
  private stopMats = new Map<string, THREE.MeshStandardMaterial>();
  private radius: number;
  private detailR: number;
  night = 0;

  constructor(
    private city: City,
    private quality: Quality,
    private sim: State,
  ) {
    this.radius = quality === "high" ? 560 : quality === "medium" ? 430 : 330;
    this.detailR = quality === "high" ? 380 : quality === "medium" ? 280 : 190;
    const asphalt = asphaltDetail();
    asphalt.normal.repeat.set(1, 1);
    const slab = concrete();
    const leaf = leafClusterTexture(quality === "low" ? 128 : 256);
    const high = quality !== "low";
    const iron = corrugated();
    this.mats = {
      ground: new THREE.MeshStandardMaterial({ vertexColors: true, map: groundDetail(), roughness: 0.95 }),
      road: new THREE.MeshStandardMaterial({ map: asphaltTone(), color: "#ffffff", roughness: 0.94, envMapIntensity: 0.45, normalMap: high ? asphalt.normal : null, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: asphalt.rough }),
      mark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      rail: new THREE.MeshStandardMaterial({ color: "#5d5f62", roughness: 0.42, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      walk: new THREE.MeshStandardMaterial({ map: slab.map, normalMap: high ? slab.normal : null, roughness: 0.85, vertexColors: true }),
      curb: new THREE.MeshStandardMaterial({ color: "#5f5e5c", roughness: 0.8 }),
      bridge: new THREE.MeshStandardMaterial({ color: "#b8b4aa", roughness: 0.85, vertexColors: true }),
      facade: facadeMaterial(quality !== "low"),
      roof: new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true }),
      iron: new THREE.MeshStandardMaterial({ map: iron, roughness: 0.5, metalness: 0.35, vertexColors: true }),
      lace: new THREE.MeshStandardMaterial({ map: lace(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, vertexColors: true }),
      trim: new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true }),
      prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05 }),
      frond: new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
      leaf: new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true }),
      pool2: new THREE.MeshBasicMaterial({ map: glowTex(), color: "#ffc27a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      pool: new THREE.MeshStandardMaterial({ map: poolTiles(), color: "#bfefff", roughness: 0.05, metalness: 0.1, normalMap: rippleNormal(), normalScale: new THREE.Vector2(0.25, 0.25), transparent: true, opacity: 0.88 }),
      deck: new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.85 }),
      lod: facadeMaterial(false, true),
      wire: new THREE.LineBasicMaterial({ color: "#26282b" }),
      lmSolid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08, side: THREE.DoubleSide }),
      lmLit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
    (this.mats.deck as THREE.MeshStandardMaterial).map!.repeat.set(0.25, 0.25);
    for (let i = 0; i < 4; i++) this.graffitiMats.push(new THREE.MeshStandardMaterial({ map: graffiti(i), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.root.name = "city";
    this.prepare();
    this.lodMesh = this.buildLod();
    this.root.add(this.lodMesh);
    this.farGround = this.buildFarGround();
    this.root.add(this.farGround);
    for (const l of city.landmarks) {
      const model = buildLandmark(l, { facade: this.mats.facade, solid: this.mats.lmSolid, lit: this.mats.lmLit });
      for (const m of model.signs) this.signMats.add(m);
      this.root.add(model.group);
      this.landmarks.push({ model, x: l.x, z: l.z, r: Math.max(l.hw, l.hd) });
    }
  }

  /* -------------------------------------------------------------- sorting the city into chunks */

  private idx(x: number, z: number) {
    const i = Math.max(0, Math.min(CX - 1, Math.floor((x - X0) / CHUNK)));
    const j = Math.max(0, Math.min(CZ - 1, Math.floor((z - Z0) / CHUNK)));
    return j * CX + i;
  }

  private prepare() {
    this.data = Array.from({ length: CX * CZ }, () => ({ buildings: [], props: [], pieces: [], nodes: [], piers: [], rails: [], stops: [] }));
    for (const b of this.city.buildings) this.data[this.idx(b.x, b.z)].buildings.push(b);
    for (const p of this.city.props) this.data[this.idx(p.x, p.z)].props.push(p);
    for (const n of this.city.roads.nodes) this.data[this.idx(n.x, n.z)].nodes.push(n);
    for (const p of PIERS) this.data[this.idx((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2)].piers.push(p);
    const nodes = this.city.roads.nodes;
    for (const seg of this.city.roads.segs) {
      const A = nodes[seg.a];
      const B = nodes[seg.b];
      const n = Math.max(1, Math.ceil(seg.len / 40));
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const mx = A.x + (B.x - A.x) * ((t0 + t1) / 2);
        const mz = A.z + (B.z - A.z) * ((t0 + t1) / 2);
        this.data[this.idx(mx, mz)].pieces.push({ seg, t0, t1 });
      }
    }
    // Tram tracks: runs of samples per chunk (overlapping by one so they join up), and the stops.
    for (const t of tracksFor(this.city)) {
      let start = 0;
      let cur = this.idx(t.x[0], t.z[0]);
      for (let i = 1; i < t.x.length; i++) {
        const k = this.idx(t.x[i], t.z[i]);
        if (k === cur) continue;
        this.data[cur].rails.push({ t, i0: start, i1: i });
        start = i;
        cur = k;
      }
      this.data[cur].rails.push({ t, i0: start, i1: t.x.length - 1 });
      t.stops.forEach((d, i) => {
        const p = at(t, d);
        this.data[this.idx(p.x, p.z)].stops.push({ t, x: p.x, z: p.z, h: p.h, num: String(i + 1) });
      });
    }
  }

  /* -------------------------------------------------------------- streaming */

  /** Load what's near (one chunk a call unless `all`), free what's far. */
  update(cx: number, cz: number, all = false) {
    const need: { i: number; d: number }[] = [];
    for (let j = 0; j < CZ; j++)
      for (let i = 0; i < CX; i++) {
        const x = X0 + (i + 0.5) * CHUNK;
        const z = Z0 + (j + 0.5) * CHUNK;
        const d = Math.hypot(x - cx, z - cz) - CHUNK * 0.7;
        const k = j * CX + i;
        const have = this.chunks.get(k);
        if (have) (have.userData.detail as THREE.Object3D).visible = d < this.detailR;
        if (d < this.radius) {
          if (!have) need.push({ i: k, d });
        } else if (d > this.radius + 120 && have) this.unload(k);
      }
    need.sort((a, b) => a.d - b.d);
    for (const n of all ? need : need.slice(0, 1)) this.load(n.i);
    // The far skyline drops the buildings the chunks draw.
    LOD_UNIFORMS.uHideC.value.set(cx, cz);
    LOD_UNIFORMS.uHideR.value = need.length > 2 ? 0 : Math.max(0, this.radius - 150);
    for (const l of this.landmarks) l.model.group.visible = Math.hypot(l.x - cx, l.z - cz) - l.r < 1500;
    return need.length;
  }

  get loaded() {
    return this.chunks.size;
  }

  /** Slow movers: the wheels turn. */
  tick(dt: number) {
    for (const l of this.landmarks) for (const s of l.model.spin) s.rotation.z += dt * 0.025;
  }

  private unload(k: number) {
    const g = this.chunks.get(k)!;
    this.chunks.delete(k);
    this.root.remove(g);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (o.userData.glows) {
        const mat = (o as THREE.Points).material as THREE.PointsMaterial;
        const i = this.glowMats.indexOf(mat);
        if (i >= 0) this.glowMats.splice(i, 1);
        mat.dispose();
      }
      if (o.userData.pools) this.poolMeshes.delete(m);
    });
    for (let i = this.signals.length - 1; i >= 0; i--) if ((this.signals[i] as SignalHead & { chunk?: number }).chunk === k) this.signals.splice(i, 1);
  }

  private load(k: number) {
    const d = this.data[k];
    const g = new THREE.Group();
    g.name = `chunk-${k}`;
    const i = k % CX;
    const j = Math.floor(k / CX);
    const x0 = X0 + i * CHUNK;
    const z0 = Z0 + j * CHUNK;
    // Fine detail (props, markings, kerbs, wires, signs) is only drawn on the nearer chunks.
    const detail = new THREE.Group();
    detail.name = "detail";
    g.add(detail);
    g.userData.detail = detail;
    this.ground(g, x0, z0);
    this.roads(g, d, k, detail);
    this.trams(g, d, detail);
    this.bridges(g, d);
    this.piers(g, d);
    this.buildings(g, d.buildings, detail);
    this.props(detail, d.props);
    this.chunks.set(k, g);
    this.root.add(g);
  }

  /* -------------------------------------------------------------- ground */

  private groundColor(x: number, z: number, y: number, out: THREE.Color) {
    const n = noise(x / 23, z / 23) * 0.6 + noise(x / 7, z / 7) * 0.4;
    if (y < -0.04) {
      // Wet sand and silt shelving into the water, darker as it deepens.
      const k = Math.min(1, -y / 2.5);
      return out.set("#cdb88a").lerp(new THREE.Color("#6f6a52"), k).multiplyScalar(0.92 + n * 0.12);
    }
    const park = this.city.parks.some((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1);
    if (park) return out.set(n > 0.62 ? "#7d9a4c" : "#5f9444").multiplyScalar(0.86 + n * 0.26);
    const dist = districtAt(x, z);
    const r = riverAt(x);
    if (r && Math.abs(z - r.z) < r.half + 9) return out.set("#7a9150").multiplyScalar(0.88 + n * 0.22);
    switch (dist) {
      case "beach":
        return out.set("#ecd9a6").multiplyScalar(0.94 + n * 0.1);
      case "domain":
      case "albertpark":
        return out.set("#6f9a4c").multiplyScalar(0.85 + n * 0.28);
      case "docks":
      case "port":
        return out.set("#9a9890").multiplyScalar(0.88 + n * 0.16);
      case "cbd":
      case "southbank":
      case "docklands":
        return out.set("#8f8b85").multiplyScalar(0.9 + n * 0.14);
      case "toorak":
      case "southyarra":
        return out.set("#6e9450").multiplyScalar(0.86 + n * 0.24);
      default:
        // Front gardens and back yards: dry grass, gravel, a bit of everything.
        return out.set(n > 0.55 ? "#8d9662" : "#a29d84").multiplyScalar(0.88 + n * 0.2);
    }
  }

  private ground(g: THREE.Group, x0: number, z0: number) {
    const step = this.quality === "low" ? 8 : 4;
    const n = CHUNK / step + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    const c = new THREE.Color();
    let any = false;
    for (let b = 0; b < n; b++)
      for (let a = 0; a < n; a++) {
        const x = x0 + a * step;
        const z = z0 + b * step;
        const y = groundY(x, z);
        if (y > WATER_Y - 1.5) any = true;
        const k = b * n + a;
        pos.set([x, Math.max(y, -6), z], k * 3);
        this.groundColor(x, z, y, c);
        col.set([c.r, c.g, c.b], k * 3);
        uv.set([x / 8, z / 8], k * 2);
      }
    if (!any) return;
    const idx: number[] = [];
    for (let b = 0; b < n - 1; b++)
      for (let a = 0; a < n - 1; a++) {
        const p = b * n + a;
        idx.push(p, p + n, p + 1, p + 1, p + n, p + n + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.mats.ground);
    m.receiveShadow = true;
    g.add(m);
  }

  private buildFarGround() {
    const step = 24;
    const nx = Math.ceil((CX * CHUNK) / step) + 1;
    const nz = Math.ceil((CZ * CHUNK) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const c = new THREE.Color();
    for (let b = 0; b < nz; b++)
      for (let a = 0; a < nx; a++) {
        const x = X0 + a * step;
        const z = Z0 + b * step;
        const y = groundY(x, z);
        const k = b * nx + a;
        pos.set([x, Math.max(y, -6) - 0.08, z], k * 3);
        this.groundColor(x, z, y, c);
        // Roads show as grey lines far off.
        if (y > -0.05 && segAt(this.city, x, z, 4)) c.set("#55575c");
        col.set([c.r, c.g, c.b], k * 3);
        uv.set([x / 8, z / 8], k * 2);
      }
    const idx: number[] = [];
    for (let b = 0; b < nz - 1; b++)
      for (let a = 0; a < nx - 1; a++) {
        const p = b * nx + a;
        idx.push(p, p + nx, p + 1, p + 1, p + nx, p + nx + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.mats.ground);
    m.name = "far-ground";
    return m;
  }

  /* -------------------------------------------------------------- roads */

  private roads(g: THREE.Group, d: ChunkData, chunk: number, detail: THREE.Group) {
    const asphalt = new Sheet();
    const marks = new Sheet();
    const walk = new Sheet();
    const curbs = new Sheet();
    const poles: THREE.BufferGeometry[] = [];
    const white = new THREE.Color("#ecebe6");
    const channel = new THREE.Color("#6a6865");
    const paveCbd = new THREE.Color("#7a7772");
    const paveSub = new THREE.Color("#ffffff");
    const s = this.sim;
    const nodes = this.city.roads.nodes;
    const R = 0.025;
    const W = 0.16;
    const M = R + 0.005;
    for (const pc of d.pieces) {
      const seg = pc.seg;
      const A = nodes[seg.a];
      const B = nodes[seg.b];
      const ha = junctionHalf(s, A, seg.axis);
      const hb = junctionHalf(s, B, seg.axis);
      const len = seg.len;
      const u0 = Math.max(pc.t0 * len, ha);
      const u1 = Math.min(pc.t1 * len, len - hb);
      if (u1 <= u0) continue;
      const half = ROAD[seg.cls].half;
      const wk = seg.bridge ? 1.6 : ROAD[seg.cls].walk;
      const ns = seg.axis === "ns";
      const P = (u: number, v: number, y: number): number[] => (ns ? [A.x + v, y, A.z + u] : [A.x + u, y, A.z + v]);
      const rect = (sh: Sheet, ua: number, ub: number, va: number, vb: number, y: number, col: THREE.Color, tile = 4) => {
        const a = P(ua, va, y);
        const b = P(ub, vb, y);
        sh.flat(Math.min(a[0], b[0]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[2], b[2]), y, col, tile);
      };
      rect(asphalt, u0, u1, -half, half, R, WHITE);
      // Markings: a double white line down the middle of the big roads, broken lane lines; a
      // broken centre line on a street; nothing down a lane.
      if (seg.cls === "boulevard" || seg.cls === "avenue") {
        rect(marks, u0, u1, -0.3, -0.18, M, white);
        rect(marks, u0, u1, 0.18, 0.3, M, white);
        const seps = seg.cls === "boulevard" ? [4, 7.5] : [4];
        for (let u = Math.ceil(u0 / 12) * 12; u < u1 - 3; u += 12) for (const sv of seps) for (const v of [-sv, sv]) rect(marks, u, u + 3, v - 0.06, v + 0.06, M, white);
      } else if (seg.cls === "street") for (let u = Math.ceil(u0 / 9) * 9; u < u1 - 3; u += 9) rect(marks, u, u + 3, -0.06, 0.06, M, white);
      const pave = CBD_LIKE.has(districtAt((A.x + B.x) / 2, (A.z + B.z) / 2)) ? paveCbd : paveSub;
      for (const side of [-1, 1]) {
        const va = side * half;
        const vb = side * (half + wk);
        rect(walk, u0, u1, Math.min(va, vb), Math.max(va, vb), W, pave, 2);
        // A bluestone channel in the gutter.
        if (seg.cls !== "lane") rect(marks, u0, u1, Math.min(va, va - side * 0.45), Math.max(va, va - side * 0.45), M, channel);
        const a0 = P(u0, va, R);
        const a1 = P(u1, va, R);
        const n = ns ? [-side, 0, 0] : [0, 0, -side];
        if (side > 0) curbs.wall(a0[0], a0[2], a1[0], a1[2], R - 0.01, W, (u1 - u0) / 2, 0, 0.08, n, WHITE);
        else curbs.wall(a1[0], a1[2], a0[0], a0[2], R - 0.01, W, (u1 - u0) / 2, 0, 0.08, n, WHITE);
      }
    }
    // Junctions: the box, crossings, stop lines, kerb corners, traffic lights.
    for (const n of d.nodes) {
      const hx = junctionHalf(s, n, "ew") || this.ownHalf(n, "ns");
      const hz = junctionHalf(s, n, "ns") || this.ownHalf(n, "ew");
      asphalt.flat(n.x - hx, n.z - hz, n.x + hx, n.z + hz, R, WHITE, 4);
      const wk = 3.5;
      const pave = CBD_LIKE.has(districtAt(n.x, n.z)) ? paveCbd : paveSub;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) walk.flat(Math.min(n.x + sx * hx, n.x + sx * (hx + wk)), Math.min(n.z + sz * hz, n.z + sz * (hz + wk)), Math.max(n.x + sx * hx, n.x + sx * (hx + wk)), Math.max(n.z + sz * hz, n.z + sz * (hz + wk)), W, pave, 2);
      const gaps: [number, number, number, number][] = [];
      if (n.dir[0] < 0) gaps.push([n.x + hx, n.z - hz, n.x + hx + wk, n.z + hz]);
      if (n.dir[2] < 0) gaps.push([n.x - hx - wk, n.z - hz, n.x - hx, n.z + hz]);
      if (n.dir[1] < 0) gaps.push([n.x - hx, n.z + hz, n.x + hx, n.z + hz + wk]);
      if (n.dir[3] < 0) gaps.push([n.x - hx, n.z - hz - wk, n.x + hx, n.z - hz]);
      for (const [a, b, c2, d2] of gaps) walk.flat(a, b, c2, d2, W, pave, 2);
      if (!n.light) continue;
      for (let dir = 0; dir < 4; dir++) {
        const sid = n.dir[dir];
        if (sid < 0) continue;
        const seg = this.city.roads.segs[sid];
        const half = ROAD[seg.cls].half;
        const ox = dir === 0 ? 1 : dir === 2 ? -1 : 0;
        const oz = dir === 1 ? 1 : dir === 3 ? -1 : 0;
        const e = ox ? hx : hz;
        // A signalised crossing: two broken white lines across the road.
        const mk = (a: number, b: number, v0: number, v1: number) => {
          if (ox) marks.flat(Math.min(n.x + ox * a, n.x + ox * b), n.z + v0, Math.max(n.x + ox * a, n.x + ox * b), n.z + v1, M + 0.001, white, 4);
          else marks.flat(n.x + v0, Math.min(n.z + oz * a, n.z + oz * b), n.x + v1, Math.max(n.z + oz * a, n.z + oz * b), M + 0.001, white, 4);
        };
        for (let v = -half + 0.2; v < half - 0.5; v += 1.2) {
          mk(e + 0.5, e + 0.65, v, v + 0.6);
          mk(e + 3.05, e + 3.2, v, v + 0.6);
        }
        // Traffic coming in drives toward the node, keeping left: its lanes are on its left,
        // which (heading −ox, −oz) is the (−oz, ox) side.
        const lx = -oz;
        const lz = ox;
        if (ox) mk(e + 3.6, e + 4.0, Math.min(0, lz * half), Math.max(0, lz * half));
        else mk(e + 3.6, e + 4.0, Math.min(0, lx * half), Math.max(0, lx * half));
        // The pole on the near-left corner of the approach, its arm out over the incoming lanes.
        const px = n.x + ox * (e + 4.5) + lx * (half + 1.2);
        const pz = n.z + oz * (e + 4.5) + lz * (half + 1.2);
        poles.push(cyl(0.13, 0.1, 6.4, "#3c4a42", px, 0, pz, 8));
        const armLen = half + 0.6;
        poles.push(box(lx ? armLen : 0.14, 0.14, lz ? armLen : 0.14, "#3c4a42", px - lx * (armLen / 2), 6.1, pz - lz * (armLen / 2)));
        const hx2 = px - lx * (half * 0.55);
        const hz2 = pz - lz * (half * 0.55);
        poles.push(box(ox ? 0.3 : 0.42, 1.2, ox ? 0.42 : 0.3, "#1c1f24", hx2, 4.95, hz2));
        // A second, low head on the pole (Melbourne has them at eye height too).
        poles.push(box(ox ? 0.3 : 0.42, 1.2, ox ? 0.42 : 0.3, "#1c1f24", px, 2.4, pz));
        const head: SignalHead & { chunk?: number } = { node: n, axis: seg.axis, x: hx2 + ox * 0.18, y: 5.55, z: hz2 + oz * 0.18, ry: Math.atan2(ox, oz), chunk };
        this.signals.push(head);
      }
    }
    const add = (sh: Sheet, mat: THREE.Material, to = g) => {
      if (sh.empty) return;
      const m = new THREE.Mesh(sh.geometry(), mat);
      m.receiveShadow = true;
      to.add(m);
    };
    add(asphalt, this.mats.road);
    add(marks, this.mats.mark, detail);
    add(walk, this.mats.walk);
    add(curbs, this.mats.curb, detail);
    if (poles.length) {
      const m = new THREE.Mesh(merge(poles), this.mats.prop);
      m.castShadow = this.quality === "high";
      detail.add(m);
    }
  }

  private ownHalf(n: Node, axis: "ns" | "ew") {
    let h = 0;
    for (const id of n.dir) {
      if (id < 0) continue;
      const s = this.city.roads.segs[id];
      if (s.axis === axis) h = Math.max(h, ROAD[s.cls].half);
    }
    return h || 4;
  }

  /* -------------------------------------------------------------- trams: rails, wires, stops */

  private trams(g: THREE.Group, d: ChunkData, detail: THREE.Group) {
    if (!d.rails.length && !d.stops.length) return;
    const rails = new Sheet();
    const wires: number[] = [];
    const poles: THREE.BufferGeometry[] = [];
    const G = 0.7175;
    const y = 0.034;
    for (const { t, i0, i1 } of d.rails) {
      for (let i = i0; i < i1; i++) {
        const la = [Math.sin(t.h[i]), -Math.cos(t.h[i])];
        const lb = [Math.sin(t.h[i + 1]), -Math.cos(t.h[i + 1])];
        for (const o of [-G, G]) {
          const ax = t.x[i] + la[0] * o;
          const az = t.z[i] + la[1] * o;
          const bx = t.x[i + 1] + lb[0] * o;
          const bz = t.z[i + 1] + lb[1] * o;
          const w = 0.05;
          rails.quad([ax - la[0] * w, y, az - la[1] * w], [bx - lb[0] * w, y, bz - lb[1] * w], [bx + lb[0] * w, y, bz + lb[1] * w], [ax + la[0] * w, y, az + la[1] * w], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], WHITE);
        }
      }
      // The contact wire, every 10 m; span wires to poles on the kerb every 30 m.
      for (let i = i0; i < i1; i += 5) {
        const j = Math.min(i1, i + 5);
        wires.push(t.x[i], 5.6, t.z[i], t.x[j], 5.6, t.z[j]);
      }
      for (let i = i0; i <= i1; i++) {
        if (Math.round(t.s[i]) % 30 !== 0 || (i > 0 && Math.round(t.s[i - 1]) % 30 === 0)) continue;
        const seg = segAt(this.city, t.x[i], t.z[i]);
        if (!seg) continue;
        const lx = Math.sin(t.h[i]);
        const lz = -Math.cos(t.h[i]);
        const k = ROAD[seg.cls].half - TRACK_OFF + 0.6;
        const px = t.x[i] + lx * k;
        const pz = t.z[i] + lz * k;
        poles.push(cyl(0.15, 0.11, 7, "#3c4a42", px, 0, pz, 8), cyl(0.2, 0.2, 0.4, "#2b3530", px, 0, pz, 8));
        wires.push(px, 6.7, pz, t.x[i], 5.75, t.z[i], t.x[i], 5.75, t.z[i], t.x[i] - lx * TRACK_OFF, 5.95, t.z[i] - lz * TRACK_OFF);
      }
    }
    // Stops: a sign on the kerb, and a shelter.
    for (const st of d.stops) {
      const seg = segAt(this.city, st.x, st.z);
      if (!seg) continue;
      const lx = Math.sin(st.h);
      const lz = -Math.cos(st.h);
      const k = ROAD[seg.cls].half - TRACK_OFF + 0.7;
      const px = st.x + lx * k;
      const pz = st.z + lz * k;
      poles.push(cyl(0.05, 0.05, 2.6, "#c9cdd2", px, 0, pz, 6));
      const num = TRAMS[st.t.route].num;
      const key = `${num}:${st.num}`;
      let mat = this.stopMats.get(key);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ map: tramStopSign(Number(st.num)), roughness: 0.6, side: THREE.DoubleSide });
        this.stopMats.set(key, mat);
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1), mat);
      sign.position.set(px + Math.cos(st.h) * 0.27, 2.2, pz + Math.sin(st.h) * 0.27);
      sign.rotation.y = Math.atan2(lx, lz) + Math.PI / 2;
      detail.add(sign);
      // A shelter set back on the footpath, open to the road.
      const t = propTemplate("busstop");
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(px + lx * 1.4 - Math.cos(st.h) * 6, 0, pz + lz * 1.4 - Math.sin(st.h) * 6), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-lx, -lz)), new THREE.Vector3(1, 1, 1));
      for (const geo of t.solid) poles.push(geo.clone().applyMatrix4(m4));
    }
    if (!rails.empty) {
      const m = new THREE.Mesh(rails.geometry(), this.mats.rail);
      m.receiveShadow = true;
      g.add(m);
    }
    if (wires.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
      detail.add(new THREE.LineSegments(geo, this.mats.wire));
    }
    if (poles.length) {
      const m = new THREE.Mesh(merge(poles), this.mats.prop);
      m.castShadow = this.quality === "high";
      detail.add(m);
    }
  }

  /* -------------------------------------------------------------- bridges and piers */

  private bridges(g: THREE.Group, d: ChunkData) {
    const parts: THREE.BufferGeometry[] = [];
    const nodes = this.city.roads.nodes;
    for (const pc of d.pieces) {
      const seg = pc.seg;
      if (!seg.bridge) continue;
      const A = nodes[seg.a];
      const ns = seg.axis === "ns";
      const half = ROAD[seg.cls].half + 1.6;
      for (const [w0, w1] of seg.wet) {
        const a = Math.max(w0, pc.t0);
        const b = Math.min(w1, pc.t1);
        if (b <= a) continue;
        const u0 = a * seg.len;
        const u1 = b * seg.len;
        const L = u1 - u0;
        const cu = (u0 + u1) / 2;
        const cx = ns ? A.x : A.x + cu;
        const cz = ns ? A.z + cu : A.z;
        parts.push(box(ns ? half * 2 : L, 1.3, ns ? L : half * 2, "#bdb8ae", cx, -1.3, cz));
        // Parapets with lamp standards: bluestone below, iron rail above.
        for (const side of [-1, 1]) {
          parts.push(box(ns ? 0.45 : L, 0.7, ns ? L : 0.45, "#6d6b68", ns ? cx + side * (half - 0.22) : cx, 0.02, ns ? cz : cz + side * (half - 0.22)));
          parts.push(box(ns ? 0.08 : L, 0.08, ns ? L : 0.08, "#2b3530", ns ? cx + side * (half - 0.22) : cx, 1.05, ns ? cz : cz + side * (half - 0.22)));
        }
        for (let u = u0 + 6; u < u1 - 4; u += 22) {
          const px = ns ? A.x : A.x + u;
          const pz = ns ? A.z + u : A.z;
          parts.push(box(ns ? half * 1.4 : 1.6, 6, ns ? 1.6 : half * 1.4, "#8f8b84", px, -7, pz));
        }
      }
    }
    if (!parts.length) return;
    const m = new THREE.Mesh(merge(parts), this.mats.bridge);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }

  private piers(g: THREE.Group, d: ChunkData) {
    for (const p of d.piers) {
      const w = p.x1 - p.x0;
      const l = p.z1 - p.z0;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, l).translate((p.x0 + p.x1) / 2, -0.25, (p.z0 + p.z1) / 2), this.mats.deck);
      deck.receiveShadow = true;
      deck.castShadow = true;
      g.add(deck);
      const posts: THREE.BufferGeometry[] = [];
      const long = w > l;
      const n = Math.floor((long ? w : l) / 6);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        for (const side of [-1, 1]) {
          const x = long ? p.x0 + t * w : (p.x0 + p.x1) / 2 + side * (w / 2 - 0.3);
          const z = long ? (p.z0 + p.z1) / 2 + side * (l / 2 - 0.3) : p.z0 + t * l;
          posts.push(cyl(0.22, 0.22, 6, "#5b4532", x, -6, z, 6));
          posts.push(cyl(0.06, 0.06, 1.1, "#e8e2d0", x, 0, z, 5));
        }
      }
      for (const side of [-1, 1]) {
        if (long) posts.push(box(w, 0.08, 0.08, "#e8e2d0", (p.x0 + p.x1) / 2, 1.05, (p.z0 + p.z1) / 2 + side * (l / 2 - 0.3)));
        else posts.push(box(0.08, 0.08, l, "#e8e2d0", (p.x0 + p.x1) / 2 + side * (w / 2 - 0.3), 1.05, (p.z0 + p.z1) / 2));
      }
      const m = new THREE.Mesh(merge(posts), this.mats.prop);
      m.castShadow = true;
      g.add(m);
    }
  }

  /* -------------------------------------------------------------- buildings */

  private buildings(g: THREE.Group, list: Building[], detail: THREE.Group) {
    if (!list.length) return;
    const fs = new FacadeSheet();
    const roofs = new Sheet();
    const iron: THREE.BufferGeometry[] = [];
    const trims: THREE.BufferGeometry[] = [];
    const laces: THREE.BufferGeometry[] = [];
    const signs: Building[] = [];
    const roofCol = new THREE.Color();
    const tint = new THREE.Color();
    const accent = new THREE.Color();
    for (const b of list) {
      tint.set(b.color).multiplyScalar(0.94 + noise(b.x * 0.1, b.z * 0.1) * 0.12);
      accent.set(b.accent);
      const seed = (Math.abs(Math.sin(b.id * 12.9898) * 43758.5453) % 1) + 0.01;
      const x0 = b.x - b.hw;
      const x1 = b.x + b.hw;
      const z0 = b.z - b.hd;
      const z1 = b.z + b.hd;
      const top = b.crown ? b.crown.from : b.h;
      // Walls, one face at a time so only the street side gets the shopfront.
      const faces: [number, number, number, number, number[], number][] = [
        [x1, z0, x0, z0, [0, 0, -1], 3],
        [x1, z1, x1, z0, [1, 0, 0], 0],
        [x0, z1, x1, z1, [0, 0, 1], 1],
        [x0, z0, x0, z1, [-1, 0, 0], 2],
      ];
      for (const [ax, az, bx, bz, n, f] of faces) {
        fs.look = { type: b.fac, floor: b.floor, gf: b.gf, seed, accent, shop: b.shop && f === b.face };
        fs.wall(ax, az, bx, bz, 0, top, 1, 0, 1, n, tint);
      }
      fs.look = { type: b.fac, floor: b.floor, gf: b.gf, seed, accent, shop: false };
      if (b.crown) {
        const i = b.crown.inset;
        if (b.crown.gold) fs.look = { type: 0, floor: b.floor, gf: 0, seed, accent: new THREE.Color("#c9a24a"), shop: false };
        fs.walls(x0 + i, z0 + i, x1 - i, z1 - i, top, b.h, b.crown.gold ? new THREE.Color("#c9a24a") : tint);
        roofs.flat(x0, z0, x1, z1, top, roofCol.set("#8a8781"));
        roofs.flat(x0 + i, z0 + i, x1 - i, z1 - i, b.h, roofCol.set("#7d7a74"));
        if (b.h > 120) trims.push(cyl(0.4, 0.18, 18, "#cfd3d8", b.x, b.h, b.z, 6));
      }
      const [fx, fz] = FACE_N[b.face];
      const along = fz !== 0 ? b.hw * 2 : b.hd * 2;
      switch (b.roof) {
        case "hip":
          iron.push(paint(hipRoof(b), roofCol.set(b.kind === "mansion" ? "#4a5058" : ROOF_IRON[b.id % ROOF_IRON.length])));
          // Chimneys.
          if (b.kind !== "mansion" || b.id % 2) trims.push(box(0.7, 2.2, 0.5, b.kind === "terrace" ? "#9a4a36" : "#c9b89a", b.x - fx * b.hw * 0.3 + (fz ? b.hw * 0.6 : 0), b.h + 0.6, b.z - fz * b.hd * 0.3 + (fx ? b.hd * 0.6 : 0)));
          break;
        case "gable": {
          // Cottages show the street their gable; sheds run their ridge along the long side.
          const alongX = b.kind === "cottage" ? fz === 0 : b.hw >= b.hd;
          const { roof, ends } = gableRoof(x0, z0, x1, z1, b.h, Math.min(b.hw, b.hd) * (b.kind === "shed" ? 0.25 : 0.55), alongX, tint);
          iron.push(paint(roof, roofCol.set(b.kind === "shed" ? "#a9aeb3" : ROOF_IRON[b.id % ROOF_IRON.length])));
          trims.push(ends);
          break;
        }
        case "sawtooth":
          iron.push(...sawtooth(b, roofCol.set("#9da2a6"), trims));
          break;
        default: {
          const membrane = b.kind === "tower" || b.kind === "office" || b.kind === "hotel" ? "#7f7d79" : "#8f8b84";
          if (!b.crown) roofs.flat(x0, z0, x1, z1, b.h, roofCol.set(membrane).multiplyScalar(0.92 + seed * 0.12));
          const ph = b.kind === "warehouse" || b.kind === "garage" || b.kind === "shed" ? 0.5 : b.kind === "heritage" || b.kind === "pub" || b.kind === "shop" ? 1.4 : 1;
          const pc = `#${tint.getHexString()}`;
          const hh = b.crown ? top : b.h;
          trims.push(box(b.hw * 2, ph, 0.35, pc, b.x, hh, z0 + 0.17), box(b.hw * 2, ph, 0.35, pc, b.x, hh, z1 - 0.17), box(0.35, ph, b.hd * 2, pc, x0 + 0.17, hh, b.z), box(0.35, ph, b.hd * 2, pc, x1 - 0.17, hh, b.z));
          // A cornice on the old stone and brick fronts.
          if (b.kind === "heritage" || b.kind === "pub" || b.kind === "bank") trims.push(box(fz ? along + 0.6 : 0.8, 0.45, fz ? 0.8 : along + 0.6, `#${accent.getHexString()}`, b.x + fx * b.hw, hh - 0.2, b.z + fz * b.hd));
          if (b.h > 18) trims.push(box(Math.min(6, b.hw), 2.2, Math.min(5, b.hd), "#a3a8ad", b.x + b.hw * 0.25, hh, b.z - b.hd * 0.2), box(2.4, 1.6, 2.4, "#b6babe", b.x - b.hw * 0.4, hh, b.z + b.hd * 0.35));
          if (b.h > 8 && b.h <= 18 && (b.kind === "apartment" || b.kind === "shop")) trims.push(cyl(0.6, 0.6, 1.4, "#c9cdd2", b.x - b.hw * 0.5, hh, b.z - b.hd * 0.5, 8));
        }
      }
      // A cast-iron lace verandah (two storeys on the taller terraces); a shop awning.
      if (b.verandah) {
        const levels = b.kind === "terrace" && b.h > 9 ? [3.3, 6.9] : [b.kind === "cottage" ? 2.7 : 3.3];
        const depth = b.kind === "pub" || b.kind === "hotel" || b.kind === "shop" ? 3 : 2.1;
        verandah(b, levels, depth, iron, trims, laces, accent, tint);
      }
      if (b.awning && !b.verandah) {
        const ax = b.x + fx * (b.hw + 1.4);
        const az = b.z + fz * (b.hd + 1.4);
        trims.push(box(fz ? along - 0.2 : 2.8, 0.32, fz ? 2.8 : along - 0.2, "#2b2f36", ax, 3.3, az));
        trims.push(box(fz ? along - 0.2 : 0.08, 0.5, fz ? 0.08 : along - 0.2, `#${accent.getHexString()}`, b.x + fx * (b.hw + 2.82), 3.2, b.z + fz * (b.hd + 2.82)));
      }
      if (b.sign) signs.push(b);
    }
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true, to = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      to.add(m);
    };
    add(fs.geometry(), this.mats.facade);
    if (!roofs.empty) add(roofs.geometry(), this.mats.roof, false);
    if (iron.length) add(merge(iron), this.mats.iron);
    if (trims.length) add(merge(trims), this.mats.trim);
    if (laces.length) add(merge(laces), this.mats.lace, this.quality === "high", detail);
    for (const b of signs) this.sign(b.kind === "hotel" || b.kind === "bank" || b.kind === "hospital" ? g : detail, b);
  }

  private signMat(key: string, make: () => THREE.Texture, transparent = false) {
    const k = `${key}|${transparent}`;
    let m = SIGN_CACHE.get(k);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: make(), transparent });
      SIGN_CACHE.set(k, m);
    }
    this.signMats.add(m);
    m.color.setScalar(0.62 + this.night * 0.75);
    return m;
  }

  private sign(g: THREE.Group, b: Building) {
    const text = b.sign!;
    const [fx, fz] = FACE_N[b.face];
    const along = fz !== 0 ? b.hw * 2 : b.hd * 2;
    const roofSign = b.kind === "hotel" || ((b.kind === "bank" || b.kind === "hospital") && b.h > 20);
    let mat: THREE.MeshBasicMaterial;
    if (b.kind === "hotel") mat = this.signMat(`neon:${text}`, () => neonSign(text, ["#ff4fa3", "#3fd0ff", "#ffd23f", "#7dff8a"][b.id % 4]), true);
    else if (b.kind === "pub") mat = this.signMat(`pub:${text}`, () => shopSign(text, "#1f3a2a", "#f2e2b0"));
    else if (b.kind === "bank") mat = this.signMat(`bank:${text}`, () => shopSign(text, "#1d2a44", "#e8d9a8"));
    else if (b.kind === "station") mat = this.signMat(`stn:${text}`, () => shopSign(text, "#12305e", "#ffffff"));
    else if (b.kind === "hospital") mat = this.signMat(`hosp:${text}`, () => shopSign(text, "#ffffff", "#c8102e"));
    else mat = this.signMat(`shop:${text}`, () => shopSign(text, "#1c1f24", "#ffe14d"));
    const w = Math.min(along * 0.85, roofSign ? 18 : 9);
    const h = w * (b.kind === "hotel" ? 0.25 : 0.19);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    // On the roof for hotels; on the parapet for pubs; on the awning fascia (or over the door) for shops.
    const y = roofSign ? b.h + h / 2 + 0.6 : b.kind === "pub" ? b.h - h / 2 - 0.3 : b.awning ? 3.45 : Math.min(b.h - 0.6, 4.3);
    const out = roofSign || b.kind === "pub" ? 0.2 : b.awning ? 2.9 : 0.15;
    m.position.set(b.x + fx * (b.hw + out), y, b.z + fz * (b.hd + out));
    m.rotation.y = Math.atan2(fx, fz);
    g.add(m);
    if (roofSign) {
      const frame = new THREE.Mesh(merge([box(w + 0.4, 0.25, 0.25, "#2b2f36", 0, -h / 2 - 0.3, 0), box(0.2, h + 0.6, 0.2, "#2b2f36", -w / 2, -h / 2 - 0.6, -0.15), box(0.2, h + 0.6, 0.2, "#2b2f36", w / 2, -h / 2 - 0.6, -0.15)]), this.mats.prop);
      frame.position.copy(m.position);
      frame.rotation.y = m.rotation.y;
      g.add(frame);
    }
  }

  /* -------------------------------------------------------------- props */

  private props(g: THREE.Group, list: Prop[]) {
    if (!list.length) return;
    const solid: THREE.BufferGeometry[] = [];
    const fronds: THREE.BufferGeometry[] = [];
    const leaves: THREE.BufferGeometry[] = [];
    const water: THREE.BufferGeometry[] = [];
    const tags: THREE.BufferGeometry[][] = [[], [], [], []];
    const glows: number[] = [];
    const pools: THREE.BufferGeometry[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const sv = new THREE.Vector3();
    const low = this.quality === "low";
    let bb = 0;
    for (const p of list) {
      if (p.kind === "graffiti") {
        // Both walls of the laneway, painted.
        const len = Math.max(3, p.s * 0.9);
        for (const side of [-1, 1]) {
          const pl = new THREE.PlaneGeometry(len, 4.6).toNonIndexed();
          pl.rotateY(side < 0 ? Math.PI / 2 : -Math.PI / 2);
          pl.translate(p.x + side * 2.47, 2.4, p.z);
          tags[Math.abs(Math.round(p.x * 7 + p.z * 3 + side)) % 4].push(pl);
        }
        continue;
      }
      const t = propTemplate(p.kind, p.kind === "container" || p.kind === "pool" || p.kind === "yacht" || p.kind === "fountain" ? p.s : 1, p.color ?? "#ffffff");
      const sc = p.kind === "palm" || p.kind === "tree" || p.kind === "plane" || p.kind === "elm" || p.kind === "gum" ? p.s : 1;
      m4.compose(v.set(p.x, p.kind === "yacht" ? WATER_Y - 0.2 : 0, p.z), q.setFromAxisAngle(up, p.ry), sv.set(sc, sc, sc));
      for (const geo of t.solid) solid.push(geo.clone().applyMatrix4(m4));
      for (const geo of t.fronds) fronds.push(geo.clone().applyMatrix4(m4));
      if (!low || (p.kind !== "tree" && p.kind !== "elm" && p.kind !== "plane")) for (const geo of t.leaves) leaves.push(geo.clone().applyMatrix4(m4));
      for (const geo of t.water) water.push(geo.clone().applyMatrix4(m4));
      for (const [x, y, z] of t.glows) {
        v.set(x, y, z).applyMatrix4(m4);
        glows.push(v.x, v.y, v.z);
        if (y > 3 && p.kind === "lamp") pools.push(new THREE.PlaneGeometry(y * 2.6, y * 2.6).rotateX(-Math.PI / 2).translate(v.x, 0.06, v.z));
      }
      if (p.kind === "billboard") {
        const mat = this.signMat(`bb:${bb % 8}:${Math.abs(Math.round(p.z)) % 8}`, () => billboard(bb + Math.abs(Math.round(p.z))));
        bb++;
        const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), mat);
        board.position.set(p.x, 8.7, p.z);
        board.rotation.y = p.ry + Math.PI;
        board.translateZ(0.02);
        g.add(board);
      }
    }
    const add = (list: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) => {
      if (!list.length) return;
      const m = new THREE.Mesh(merge(list), mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      g.add(m);
    };
    add(solid, this.mats.prop, true);
    add(fronds, this.mats.frond, this.quality === "high");
    add(leaves, this.mats.leaf, this.quality === "high");
    add(water, this.mats.pool, false);
    tags.forEach((list, i) => add(list, this.graffitiMats[i], false));
    if (glows.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(glows, 3));
      const mat = new THREE.PointsMaterial({ map: glowTex(), color: "#ffd9a0", size: 3.6, sizeAttenuation: true, transparent: true, opacity: this.night, depthWrite: false, blending: THREE.AdditiveBlending });
      this.glowMats.push(mat);
      const pts = new THREE.Points(geo, mat);
      pts.userData.glows = true;
      g.add(pts);
    }
    if (pools.length) {
      const m = new THREE.Mesh(merge(pools), this.mats.pool2);
      m.renderOrder = 1;
      m.visible = this.night > 0.05;
      m.userData.pools = true;
      this.poolMeshes.add(m);
      g.add(m);
    }
  }

  /* -------------------------------------------------------------- the far skyline */

  private buildLod() {
    const fs = new FacadeSheet();
    const ctr: number[] = [];
    const c = new THREE.Color();
    const acc = new THREE.Color();
    for (const b of this.city.buildings) {
      if (b.h < 6) continue;
      const before = fs.pos.length / 3;
      c.set(b.color);
      acc.set(b.crown?.gold ? "#c9a24a" : b.accent);
      fs.look = { type: b.fac, floor: b.floor, gf: b.gf, seed: (b.id % 97) / 97, accent: acc, shop: false };
      const i = 0.3;
      const h = b.h - 0.1;
      fs.walls(b.x - b.hw + i, b.z - b.hd + i, b.x + b.hw - i, b.z + b.hd - i, 0, h, c);
      fs.flat(b.x - b.hw + i, b.z - b.hd + i, b.x + b.hw - i, b.z + b.hd - i, h, c.clone().multiplyScalar(0.6));
      for (let k = before; k < fs.pos.length / 3; k++) ctr.push(b.x, b.z);
    }
    const geo = fs.geometry();
    geo.setAttribute("aCtr", new THREE.Float32BufferAttribute(ctr, 2));
    const m = new THREE.Mesh(geo, this.mats.lod);
    m.name = "skyline";
    m.frustumCulled = false;
    return m;
  }

  /** Night: windows and signs light up, lamps glow. */
  setNight(n: number) {
    this.night = n;
    // Windows come on as the dusk deepens, not the moment the sun dips.
    const w = Math.max(0, Math.min(1, (n - 0.35) / 0.6));
    FACADE_UNIFORMS.uNight.value = w * w * (3 - 2 * w);
    FACADE_UNIFORMS.uDay.value = 1 - n;
    for (const m of this.signMats) m.color.setScalar(0.62 + n * 0.75);
    for (const m of this.glowMats) m.opacity = n;
    (this.mats.pool2 as THREE.MeshBasicMaterial).opacity = n * 0.5;
    for (const m of this.poolMeshes) m.visible = n > 0.05;
    (this.mats.lmLit as THREE.MeshBasicMaterial).color.setScalar(0.55 + n * 1.6);
  }

  /** Rain: the roads go dark and glossy (they pick up the sky and the lights), walls darken. */
  setWet(w: number) {
    FACADE_UNIFORMS.uWet.value = w;
    const road = this.mats.road as THREE.MeshStandardMaterial;
    road.roughness = 0.94 - w * 0.62;
    road.envMapIntensity = 0.45 + w * 1.4;
    road.color.setScalar(1 - w * 0.35);
    const walk = this.mats.walk as THREE.MeshStandardMaterial;
    walk.roughness = 0.85 - w * 0.45;
    walk.color.setScalar(1 - w * 0.25);
  }

  dispose() {
    for (const k of [...this.chunks.keys()]) this.unload(k);
    this.lodMesh.geometry.dispose();
    this.farGround.geometry.dispose();
    for (const l of this.landmarks)
      l.model.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    for (const m of Object.values(this.mats)) if (m !== this.mats.facade && m !== this.mats.lod) m.dispose();
    for (const m of this.graffitiMats) m.dispose();
    for (const m of this.stopMats.values()) m.dispose();
  }
}

const SIGN_CACHE = new Map<string, THREE.MeshBasicMaterial>();

let glowCache: THREE.Texture | null = null;
export function glowTex() {
  return (glowCache ??= glow(64));
}

/** Roof UVs in metres: u along the eave (across the corrugations), v up the slope. */
function roofUV(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const uv: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const xDominant = Math.abs(n.getX(i)) > Math.abs(n.getZ(i));
    const u = xDominant ? pos.getZ(i) : pos.getX(i);
    const v = (xDominant ? pos.getX(i) : pos.getZ(i)) + pos.getY(i);
    uv.push(u, v);
  }
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function fromTris(pos: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return roofUV(g);
}

/** A four-sided hip roof over a building. */
function hipRoof(b: Building) {
  const rise = Math.min(b.hw, b.hd) * 0.5;
  const e = 0.35;
  const x0 = b.x - b.hw - e;
  const x1 = b.x + b.hw + e;
  const z0 = b.z - b.hd - e;
  const z1 = b.z + b.hd + e;
  const y = b.h;
  const top = y + rise;
  const ridge = b.hw > b.hd;
  const r0 = ridge ? [x0 + b.hd, top, b.z] : [b.x, top, z0 + b.hw];
  const r1 = ridge ? [x1 - b.hd, top, b.z] : [b.x, top, z1 - b.hw];
  const pos: number[] = [];
  const tri = (a: number[], c: number[], d: number[]) => pos.push(...a, ...c, ...d);
  const A = [x0, y, z0];
  const B = [x1, y, z0];
  const C = [x1, y, z1];
  const D = [x0, y, z1];
  if (ridge) {
    tri(A, r0, B);
    tri(B, r0, r1);
    tri(D, C, r1);
    tri(D, r1, r0);
    tri(A, D, r0);
    tri(B, r1, C);
  } else {
    tri(A, r0, B);
    tri(B, r0, r1);
    tri(B, r1, C);
    tri(C, r1, D);
    tri(D, r1, r0);
    tri(D, r0, A);
  }
  return fromTris(pos);
}

/** A gabled roof (ridge along x or z) and its two gable-end walls (in the wall colour). */
function gableRoof(x0: number, z0: number, x1: number, z1: number, y: number, rise: number, alongX: boolean, wall: THREE.Color) {
  const e = 0.35;
  const pos: number[] = [];
  const ends: number[] = [];
  const t = (arr: number[], a: number[], b: number[], c: number[]) => arr.push(...a, ...b, ...c);
  if (alongX) {
    const zm = (z0 + z1) / 2;
    const r0 = [x0 - e, y + rise, zm];
    const r1 = [x1 + e, y + rise, zm];
    t(pos, [x0 - e, y, z1 + e], [x1 + e, y, z1 + e], r1);
    t(pos, [x0 - e, y, z1 + e], r1, r0);
    t(pos, [x1 + e, y, z0 - e], [x0 - e, y, z0 - e], r0);
    t(pos, [x1 + e, y, z0 - e], r0, r1);
    t(ends, [x0, y, z0], [x0, y, z1], [x0, y + rise, zm]);
    t(ends, [x1, y, z1], [x1, y, z0], [x1, y + rise, zm]);
  } else {
    const xm = (x0 + x1) / 2;
    const r0 = [xm, y + rise, z0 - e];
    const r1 = [xm, y + rise, z1 + e];
    t(pos, [x1 + e, y, z1 + e], [x1 + e, y, z0 - e], r0);
    t(pos, [x1 + e, y, z1 + e], r0, r1);
    t(pos, [x0 - e, y, z0 - e], [x0 - e, y, z1 + e], r1);
    t(pos, [x0 - e, y, z0 - e], r1, r0);
    t(ends, [x1, y, z0], [x0, y, z0], [xm, y + rise, z0]);
    t(ends, [x0, y, z1], [x1, y, z1], [xm, y + rise, z1]);
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute("position", new THREE.Float32BufferAttribute(ends, 3));
  eg.computeVertexNormals();
  return { roof: fromTris(pos), ends: paint(eg, wall.clone()) };
}

/** A factory's sawtooth roof: teeth along z, the glazed faces looking south (+z). */
function sawtooth(b: Building, col: THREE.Color, trims: THREE.BufferGeometry[]) {
  const x0 = b.x - b.hw;
  const x1 = b.x + b.hw;
  const z0 = b.z - b.hd;
  const D = b.hd * 2;
  const n = Math.max(1, Math.round(D / 7));
  const w = D / n;
  const rise = Math.min(3, w * 0.45);
  const pos: number[] = [];
  const glass: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = z0 + k * w;
    const c = a + w;
    const y = b.h;
    // The sloping iron face, rising toward the south.
    pos.push(x0, y, a, x0, y + rise, c, x1, y + rise, c, x0, y, a, x1, y + rise, c, x1, y, a);
    // The upright glazing, looking south.
    glass.push(x0, y, c, x1, y, c, x1, y + rise, c, x0, y, c, x1, y + rise, c, x0, y + rise, c);
    const ends = new THREE.BufferGeometry();
    ends.setAttribute("position", new THREE.Float32BufferAttribute([x0, y, a, x0, y, c, x0, y + rise, c, x1, y, c, x1, y, a, x1, y + rise, c], 3));
    ends.computeVertexNormals();
    trims.push(paint(ends, b.color));
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute("position", new THREE.Float32BufferAttribute(glass, 3));
  gg.computeVertexNormals();
  trims.push(paint(gg, "#3a4a58"));
  return [paint(fromTris(pos), col)];
}

/**
 * A verandah along the street face: a sloping iron roof (bullnose-ish, falling away from the wall),
 * slender cast-iron posts, a lace frieze under the eave, and party-wall wing fins at the ends.
 */
function verandah(b: Building, levels: number[], depth: number, iron: THREE.BufferGeometry[], trims: THREE.BufferGeometry[], laces: THREE.BufferGeometry[], accent: THREE.Color, wall: THREE.Color) {
  const [fx, fz] = FACE_N[b.face];
  const along = fz !== 0 ? b.hw * 2 : b.hd * 2;
  // Wall line and the along-face direction.
  const wx = b.x + fx * b.hw;
  const wz = b.z + fz * b.hd;
  const tx = fz !== 0 ? 1 : 0;
  const tz = fx !== 0 ? 1 : 0;
  const L = along / 2 - 0.15;
  const roofCol = new THREE.Color(b.id % 3 === 0 ? "#b8bcc0" : b.id % 3 === 1 ? "#5d7a5a" : "#8a8f94");
  const ac = `#${accent.getHexString()}`;
  levels.forEach((H, li) => {
    const pos: number[] = [];
    const a = [wx - tx * L, H + 0.45, wz - tz * L];
    const bb = [wx + tx * L, H + 0.45, wz + tz * L];
    const c = [wx + tx * L + fx * depth, H, wz + tz * L + fz * depth];
    const d = [wx - tx * L + fx * depth, H, wz - tz * L + fz * depth];
    pos.push(...a, ...d, ...c, ...a, ...c, ...bb);
    iron.push(paint(fromTris(pos), roofCol));
    // Posts, the lace frieze, the balustrade upstairs.
    const posts = Math.max(2, Math.round(along / 2.8) + 1);
    for (let i = 0; i < posts; i++) {
      const s = -L + (2 * L * i) / (posts - 1);
      trims.push(cyl(0.06, 0.06, H - (li ? levels[li - 1] + 0.1 : 0), ac, wx + tx * s + fx * (depth - 0.12), li ? levels[li - 1] + 0.1 : 0, wz + tz * s + fz * (depth - 0.12), 6));
    }
    const fr = new THREE.PlaneGeometry(2 * L, 0.42).toNonIndexed();
    const uv = fr.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * ((2 * L) / 1.2));
    fr.rotateY(Math.atan2(fx, fz));
    fr.translate(wx + fx * (depth - 0.1), H - 0.25, wz + fz * (depth - 0.1));
    laces.push(paint(fr, b.id % 2 ? new THREE.Color("#f2efe6") : accent));
    if (li > 0) {
      const bal = new THREE.PlaneGeometry(2 * L, 0.9).toNonIndexed();
      const u2 = bal.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < u2.count; i++) u2.setX(i, u2.getX(i) * ((2 * L) / 1.2));
      bal.rotateY(Math.atan2(fx, fz));
      bal.translate(wx + fx * (depth - 0.1), levels[li - 1] + 0.95, wz + fz * (depth - 0.1));
      laces.push(paint(bal, accent));
      trims.push(box(tx ? 2 * L : depth, 0.15, tz ? 2 * L : depth, "#8a6a48", wx + fx * (depth / 2), levels[li - 1] + 0.45, wz + fz * (depth / 2)));
    }
  });
  // Wing walls at each end (terraces have them between neighbours).
  if (b.kind === "terrace") {
    const top = levels[levels.length - 1] + 0.5;
    for (const s of [-1, 1]) trims.push(box(tx ? 0.25 : depth, top, tz ? 0.25 : depth, `#${wall.getHexString()}`, wx + tx * s * (along / 2 - 0.12) + fx * (depth / 2), 0, wz + tz * s * (along / 2 - 0.12) + fz * (depth / 2)));
  }
}

export { WHITE };
