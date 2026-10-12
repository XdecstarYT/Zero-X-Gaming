import * as THREE from "three";
import { baseFacade, BASE_UNITS, BASE_W, GROUND_FLOOR, UPPER, upperFacade } from "../../code-3/facades";
import { asphaltDetail, concrete } from "../../code-3/textures";
import { leafClusterTexture } from "../../neon-siege/three/textures";
import { junctionHalf } from "../traffic";
import type { State } from "../state";
import { districtAt, groundY, noise, PIERS, riverZ, RIVER_HALF, ROAD, WATER_Y, type Building, type City, type Node, type Prop, type Seg } from "../world";
import { box, cyl, merge, paint, propTemplate } from "./models";
import { asphaltTone, barrelTiles, billboard, frondTexture, glow, groundDetail, neonSign, planks, poolTiles, rippleNormal, shopSign } from "./textures";

/**
 * Port Solano in 3D, streamed in 160 m chunks round the camera: the ground (sand, lawns, marsh,
 * paving), roads with their markings, crossings and stop lines, kerbs and sidewalks, bridges over
 * the river and the bay, piers, facade-textured buildings (pastel hotels with neon, Calle Sol's
 * painted shops, towers, houses with barrel-tiled roofs), signs, awnings, and the street props.
 * Beyond the chunks a low-detail skyline and ground keep the horizon full.
 */

export const CHUNK = 160;
export type Quality = "low" | "medium" | "high";

const X0 = -1100;
const Z0 = -1000;
const CX = 15;
const CZ = 13;

const FACADE: Record<Building["kind"], "tower" | "office" | "store" | "house" | "warehouse" | "hospital" | "station"> = {
  tower: "tower",
  office: "office",
  hotel: "office",
  bank: "tower",
  store: "store",
  house: "house",
  mansion: "house",
  warehouse: "warehouse",
  garage: "warehouse",
  trailer: "house",
  hospital: "hospital",
  station: "station",
};

interface ChunkData {
  buildings: Building[];
  props: Prop[];
  pieces: { seg: Seg; t0: number; t1: number }[];
  nodes: Node[];
  piers: typeof PIERS;
}

export interface SignalHead {
  node: Node;
  axis: "ns" | "ew";
  x: number;
  y: number;
  z: number;
  ry: number;
}

class Sheet {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[], uv: number[][], n: number[], col: THREE.Color) {
    for (const [v, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [a, uv[0]], [c, uv[2]], [d, uv[3]]] as [number[], number[]][]) {
      this.pos.push(v[0], v[1], v[2]);
      this.uv.push(t[0], t[1]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(col.r, col.g, col.b);
    }
  }
  /** A vertical wall from a to b (outside on the left-to-right view), y0..y1. */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, u1: number, v0: number, v1: number, n: number[], col: THREE.Color) {
    this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [[0, v0], [u1, v0], [u1, v1], [0, v1]], n, col);
  }
  /** A flat rectangle (x0..x1, z0..z1) at height y, facing up, UVs in metres / tile. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, col: THREE.Color, tile = 1) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[x0 / tile, z1 / tile], [x1 / tile, z1 / tile], [x1 / tile, z0 / tile], [x0 / tile, z0 / tile]], [0, 1, 0], col);
  }
  get empty() {
    return this.pos.length === 0;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

const WHITE = new THREE.Color(1, 1, 1);

export class CityView {
  readonly root = new THREE.Group();
  private data: ChunkData[] = [];
  private chunks = new Map<number, THREE.Group>();
  private lodMesh: THREE.Mesh;
  private farGround: THREE.Mesh;
  private facadeMats = new Map<string, THREE.MeshStandardMaterial>();
  private signMats: THREE.MeshBasicMaterial[] = [];
  readonly glowMats: THREE.PointsMaterial[] = [];
  /** Lamp light pools on the ground (shown at night). */
  private poolMeshes = new Set<THREE.Mesh>();
  readonly mats: Record<string, THREE.Material>;
  readonly signals: SignalHead[] = [];
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
    const frond = frondTexture();
    const detail = groundDetail();
    const high = quality !== "low";
    this.mats = {
      ground: new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95 }),
      road: new THREE.MeshStandardMaterial({ map: asphaltTone(), color: "#ffffff", roughness: 0.94, envMapIntensity: 0.45, normalMap: high ? asphalt.normal : null, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: asphalt.rough }),
      mark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      walk: new THREE.MeshStandardMaterial({ map: slab.map, normalMap: high ? slab.normal : null, roughness: 0.85, vertexColors: true }),
      curb: new THREE.MeshStandardMaterial({ color: "#c9c4b8", roughness: 0.8 }),
      bridge: new THREE.MeshStandardMaterial({ color: "#b8b4aa", roughness: 0.85, vertexColors: true }),
      roof: new THREE.MeshStandardMaterial({ color: "#7d7a74", roughness: 0.95, vertexColors: true }),
      tiles: new THREE.MeshStandardMaterial({ map: barrelTiles(), roughness: 0.75, vertexColors: true }),
      trim: new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true }),
      prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05 }),
      frond: new THREE.MeshStandardMaterial({ map: frond, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
      leaf: new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: "#d8f0b8" }),
      pool2: new THREE.MeshBasicMaterial({ map: glowTex(), color: "#ffc27a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      pool: new THREE.MeshStandardMaterial({ map: poolTiles(), color: "#bfefff", roughness: 0.05, metalness: 0.1, normalMap: rippleNormal(), normalScale: new THREE.Vector2(0.25, 0.25), transparent: true, opacity: 0.88 }),
      deck: new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.85 }),
      lod: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    };
    (this.mats.deck as THREE.MeshStandardMaterial).map!.repeat.set(0.25, 0.25);
    this.root.name = "city";
    this.prepare();
    this.lodMesh = this.buildLod();
    this.root.add(this.lodMesh);
    this.farGround = this.buildFarGround();
    this.root.add(this.farGround);
  }

  /* -------------------------------------------------------------- sorting the city into chunks */

  private idx(x: number, z: number) {
    const i = Math.max(0, Math.min(CX - 1, Math.floor((x - X0) / CHUNK)));
    const j = Math.max(0, Math.min(CZ - 1, Math.floor((z - Z0) / CHUNK)));
    return j * CX + i;
  }

  private prepare() {
    this.data = Array.from({ length: CX * CZ }, () => ({ buildings: [], props: [], pieces: [], nodes: [], piers: [] }));
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
    return need.length;
  }

  get loaded() {
    return this.chunks.size;
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
    // Fine detail (props, markings, kerbs, shop signs) is only drawn on the nearer chunks.
    const detail = new THREE.Group();
    detail.name = "detail";
    g.add(detail);
    g.userData.detail = detail;
    this.ground(g, x0, z0);
    this.roads(g, d, k, detail);
    this.bridges(g, d);
    this.piers(g, d);
    this.buildings(g, d.buildings, detail);
    this.props(detail, d.props);
    this.chunks.set(k, g);
    this.root.add(g);
    // Hide the low-detail skyline's buildings that this chunk now draws properly? They sit inside
    // the real walls (inset), so they never show.
  }

  /* -------------------------------------------------------------- ground */

  private groundColor(x: number, z: number, y: number, out: THREE.Color) {
    const n = noise(x / 23, z / 23) * 0.6 + noise(x / 7, z / 7) * 0.4;
    const dist = districtAt(x, z);
    if (y < -0.04) {
      // Wet sand shelving into the sea, darker as it deepens.
      const k = Math.min(1, -y / 2.5);
      return out.set("#d8c08c").lerp(new THREE.Color("#8f8a64"), k).multiplyScalar(0.92 + n * 0.12);
    }
    const park = this.city.parks.some((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1);
    if (park) return out.set("#6aa04a").multiplyScalar(0.85 + n * 0.3);
    if (dist === "beach") return out.set("#efdcaa").multiplyScalar(0.94 + n * 0.1);
    if (dist === "glades") return out.set(n > 0.55 ? "#6c7a46" : "#7c8a4e").multiplyScalar(0.85 + n * 0.25);
    if (dist === "heights" || dist === "keys") return out.set("#79ab55").multiplyScalar(0.85 + n * 0.28);
    if (dist === "harbor") return out.set("#9c9a92").multiplyScalar(0.9 + n * 0.15);
    // The river bank.
    if (Math.abs(z - riverZ(x)) < RIVER_HALF + 6) return out.set("#8fa36a").multiplyScalar(0.9 + n * 0.2);
    return out.set("#b9b3a6").multiplyScalar(0.9 + n * 0.14);
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
        if (y > -0.05 && this.nearCarriageway(x, z)) c.set("#55575c");
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
    m.receiveShadow = false;
    m.name = "far-ground";
    return m;
  }

  private nearCarriageway(x: number, z: number) {
    const { nodes, segs } = this.city.roads;
    for (const s of segs) {
      const A = nodes[s.a];
      const B = nodes[s.b];
      const h = ROAD[s.cls].half + 4;
      if (s.axis === "ns" ? Math.abs(x - A.x) < h && z > A.z && z < B.z : Math.abs(z - A.z) < h && x > A.x && x < B.x) return true;
    }
    return false;
  }

  /* -------------------------------------------------------------- roads */

  private roads(g: THREE.Group, d: ChunkData, chunk: number, detail: THREE.Group) {
    const asphalt = new Sheet();
    const marks = new Sheet();
    const walk = new Sheet();
    const curbs = new Sheet();
    const poles: THREE.BufferGeometry[] = [];
    const yellow = new THREE.Color("#e8b730");
    const white = new THREE.Color("#ecebe6");
    const walkCol = new THREE.Color("#ffffff");
    const s = this.sim;
    const nodes = this.city.roads.nodes;
    const R = 0.025;
    const W = 0.16;
    for (const pc of d.pieces) {
      const seg = pc.seg;
      const A = nodes[seg.a];
      const B = nodes[seg.b];
      const ha = junctionHalf(s, A, seg.axis);
      const hb = junctionHalf(s, B, seg.axis);
      const len = seg.len;
      // Along the road, from the box at A to the box at B.
      const u0 = Math.max(pc.t0 * len, ha);
      const u1 = Math.min(pc.t1 * len, len - hb);
      if (u1 <= u0) continue;
      const half = ROAD[seg.cls].half;
      const wk = seg.bridge ? 1.6 : ROAD[seg.cls].walk;
      const ns = seg.axis === "ns";
      // A point at (along u, across v): ns roads run +z, ew roads +x.
      const P = (u: number, v: number, y: number): number[] => (ns ? [A.x + v, y, A.z + u] : [A.x + u, y, A.z + v]);
      const rect = (sh: Sheet, ua: number, ub: number, va: number, vb: number, y: number, col: THREE.Color, tile = 4) => {
        const a = P(ua, va, y);
        const b = P(ub, vb, y);
        sh.flat(Math.min(a[0], b[0]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[2], b[2]), y, col, tile);
      };
      rect(asphalt, u0, u1, -half, half, R, WHITE);
      // Markings: a double yellow down an avenue, a dashed yellow on a street; dashed white between lanes.
      if (seg.cls === "avenue") {
        rect(marks, u0, u1, -0.3, -0.18, R + 0.005, yellow);
        rect(marks, u0, u1, 0.18, 0.3, R + 0.005, yellow);
        for (let u = Math.ceil(u0 / 9) * 9; u < u1 - 3; u += 9) for (const v of [-4, 4]) rect(marks, u, u + 3, v - 0.07, v + 0.07, R + 0.005, white);
      } else for (let u = Math.ceil(u0 / 7) * 7; u < u1 - 3; u += 7) rect(marks, u, u + 3, -0.07, 0.07, R + 0.005, yellow);
      // Sidewalks with a kerb.
      for (const side of [-1, 1]) {
        const va = side * half;
        const vb = side * (half + wk);
        rect(walk, u0, u1, Math.min(va, vb), Math.max(va, vb), W, walkCol, 2);
        const a0 = P(u0, va, R);
        const a1 = P(u1, va, R);
        const n = ns ? [-side, 0, 0] : [0, 0, -side];
        // The kerb face looks into the road.
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
      // Kerb corners, and sidewalk across the mouth of a missing road.
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) walk.flat(Math.min(n.x + sx * hx, n.x + sx * (hx + wk)), Math.min(n.z + sz * hz, n.z + sz * (hz + wk)), Math.max(n.x + sx * hx, n.x + sx * (hx + wk)), Math.max(n.z + sz * hz, n.z + sz * (hz + wk)), W, walkCol, 2);
      const gaps: [number, number, number, number][] = [];
      if (n.dir[0] < 0) gaps.push([n.x + hx, n.z - hz, n.x + hx + wk, n.z + hz]);
      if (n.dir[2] < 0) gaps.push([n.x - hx - wk, n.z - hz, n.x - hx, n.z + hz]);
      if (n.dir[1] < 0) gaps.push([n.x - hx, n.z + hz, n.x + hx, n.z + hz + wk]);
      if (n.dir[3] < 0) gaps.push([n.x - hx, n.z - hz - wk, n.x + hx, n.z - hz]);
      for (const [a, b, c2, d2] of gaps) walk.flat(a, b, c2, d2, W, walkCol, 2);
      if (!n.light) continue;
      // Zebra crossings and stop lines on each approach; a light on a mast arm for each.
      for (let dir = 0; dir < 4; dir++) {
        const sid = n.dir[dir];
        if (sid < 0) continue;
        const seg = this.city.roads.segs[sid];
        const half = ROAD[seg.cls].half;
        const ox = dir === 0 ? 1 : dir === 2 ? -1 : 0;
        const oz = dir === 1 ? 1 : dir === 3 ? -1 : 0;
        const e = ox ? hx : hz;
        for (let v = -half + 0.4; v < half - 0.3; v += 1) {
          if (ox) marks.flat(Math.min(n.x + ox * (e + 0.4), n.x + ox * (e + 3.2)), n.z + v, Math.max(n.x + ox * (e + 0.4), n.x + ox * (e + 3.2)), n.z + v + 0.5, R + 0.006, white, 4);
          else marks.flat(n.x + v, Math.min(n.z + oz * (e + 0.4), n.z + oz * (e + 3.2)), n.x + v + 0.5, Math.max(n.z + oz * (e + 0.4), n.z + oz * (e + 3.2)), R + 0.006, white, 4);
        }
        // Incoming traffic on this approach drives toward the node: heading opposite to (ox, oz);
        // its lanes are on its right.
        const rx = oz;
        const rz = -ox;
        const a0 = 0;
        const a1 = half;
        if (ox) marks.flat(Math.min(n.x + ox * (e + 3.5), n.x + ox * (e + 3.9)), n.z + Math.min(rz * a0, rz * a1), Math.max(n.x + ox * (e + 3.5), n.x + ox * (e + 3.9)), n.z + Math.max(rz * a0, rz * a1), R + 0.006, white, 4);
        else marks.flat(n.x + Math.min(rx * a0, rx * a1), Math.min(n.z + oz * (e + 3.5), n.z + oz * (e + 3.9)), n.x + Math.max(rx * a0, rx * a1), Math.max(n.z + oz * (e + 3.5), n.z + oz * (e + 3.9)), R + 0.006, white, 4);
        // The pole on the far-right corner of the approach, its arm over the incoming lanes.
        const px = n.x + ox * (e + 4.5) + rx * (half + 1.2);
        const pz = n.z + oz * (e + 4.5) + rz * (half + 1.2);
        poles.push(cyl(0.13, 0.1, 6.4, "#2b2f36", px, 0, pz, 8));
        const armLen = half + 0.6;
        const ax = px - rx * (armLen / 2);
        const az = pz - rz * (armLen / 2);
        poles.push(box(rx ? armLen : 0.14, 0.14, rz ? armLen : 0.14, "#2b2f36", ax, 6.1, az));
        const hx2 = px - rx * (half * 0.55);
        const hz2 = pz - rz * (half * 0.55);
        poles.push(box(ox ? 0.3 : 0.42, 1.2, ox ? 0.42 : 0.3, "#1c1f24", hx2, 4.95, hz2));
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

  /** A node with roads on one axis only (a bend or dead end): its own road's half-width. */
  private ownHalf(n: Node, axis: "ns" | "ew") {
    let h = 0;
    for (const id of n.dir) {
      if (id < 0) continue;
      const s = this.city.roads.segs[id];
      if (s.axis === axis) h = Math.max(h, ROAD[s.cls].half);
    }
    return h || 4;
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
        // The deck, its parapets, piers down into the water every 22 m.
        parts.push(box(ns ? half * 2 : L, 1.3, ns ? L : half * 2, "#bdb8ae", cx, -1.3, cz));
        for (const side of [-1, 1]) parts.push(box(ns ? 0.35 : L, 0.95, ns ? L : 0.35, "#d6d1c6", ns ? cx + side * (half - 0.17) : cx, 0.02, ns ? cz : cz + side * (half - 0.17)));
        for (let u = u0 + 6; u < u1 - 4; u += 22) {
          const px = ns ? A.x : A.x + u;
          const pz = ns ? A.z + u : A.z;
          parts.push(box(ns ? half * 1.4 : 1.6, 6, ns ? 1.6 : half * 1.4, "#a8a398", px, -7, pz));
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
          posts.push(cyl(0.22, 0.22, 6, "#6b5038", x, -6, z, 6));
          posts.push(cyl(0.06, 0.06, 1.1, "#e8e2d0", x, 0, z, 5));
        }
      }
      // Rails.
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

  private facadeMat(part: "u" | "b", kind: string, style: number) {
    const key = `${part}:${kind}:${style}`;
    let mat = this.facadeMats.get(key);
    if (!mat) {
      const P = this.quality === "high" ? 32 : this.quality === "medium" ? 24 : 16;
      const k = kind as Parameters<typeof upperFacade>[0];
      const tex = part === "b" ? baseFacade(k, style, P) : upperFacade(k, style, P);
      mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.lit,
        emissive: "#ffffff",
        emissiveIntensity: this.night * 1.3,
        roughnessMap: tex.rm,
        metalnessMap: tex.rm,
        aoMap: tex.rm,
        roughness: 1,
        metalness: 1,
        normalMap: this.quality === "high" ? tex.normal : null,
        vertexColors: true,
        envMapIntensity: 1.2,
      });
      this.facadeMats.set(key, mat);
    }
    return mat;
  }

  private styleOf(b: Building) {
    const f = FACADE[b.kind];
    if (f === "tower" || f === "office" || f === "house") return b.style % 4;
    if (f === "warehouse") return b.style % 2;
    return 0;
  }

  private tint(b: Building) {
    const c = new THREE.Color("#ffffff");
    const k = 0.92 + noise(b.x * 0.1, b.z * 0.1) * 0.14;
    if (b.kind === "hotel" || b.kind === "store") c.lerp(new THREE.Color(b.color), 0.7);
    else if (b.kind === "house" || b.kind === "mansion" || b.kind === "trailer") c.lerp(new THREE.Color(b.color), 0.85);
    else c.lerp(new THREE.Color(b.color), 0.2);
    return c.multiplyScalar(k);
  }

  private buildings(g: THREE.Group, list: Building[], detail: THREE.Group) {
    if (!list.length) return;
    const sheets = new Map<string, Sheet>();
    const sheet = (k: string) => sheets.get(k) ?? sheets.set(k, new Sheet()).get(k)!;
    const roofs = new Sheet();
    const tiles: THREE.BufferGeometry[] = [];
    const trims: THREE.BufferGeometry[] = [];
    const signs: { b: Building; text: string }[] = [];
    for (const b of list) {
      const kind = FACADE[b.kind];
      const style = this.styleOf(b);
      const L = UPPER[kind];
      const GF = b.kind === "trailer" ? 0 : GROUND_FLOOR[kind];
      const tint = this.tint(b);
      const x0 = b.x - b.hw;
      const x1 = b.x + b.hw;
      const z0 = b.z - b.hd;
      const z1 = b.z + b.hd;
      const faces: [number, number, number, number, number[]][] = [
        [x1, z0, x0, z0, [0, 0, -1]],
        [x1, z1, x1, z0, [1, 0, 0]],
        [x0, z1, x1, z1, [0, 0, 1]],
        [x0, z0, x0, z1, [-1, 0, 0]],
      ];
      const crownFrom = b.crown ? b.crown.from : b.h;
      for (const [ax, az, bx, bz, n] of faces) {
        const len = Math.hypot(bx - ax, bz - az);
        // Ground floor strip: whole shopfronts across the wall.
        if (GF > 0) {
          const units = Math.max(1, Math.round(len / (BASE_W / BASE_UNITS)));
          sheet(`b:${kind}:${style}`).wall(ax, az, bx, bz, 0, Math.min(GF, b.h), units / BASE_UNITS, 0, Math.min(1, b.h / GF), n, tint);
        }
        if (b.h > GF) {
          const bays = Math.max(1, Math.round(len / L.bayW));
          const top = Math.min(b.h, crownFrom);
          const floors = Math.max(1, Math.round((top - GF) / L.floorH));
          sheet(`u:${kind}:${style}`).wall(ax, az, bx, bz, GF, top, bays / L.bays, 0, floors / L.floors, n, tint);
        }
      }
      if (b.crown) {
        // A setback crown on top.
        const i = b.crown.inset;
        const cx0 = x0 + i;
        const cx1 = x1 - i;
        const cz0 = z0 + i;
        const cz1 = z1 - i;
        const cf: [number, number, number, number, number[]][] = [
          [cx1, cz0, cx0, cz0, [0, 0, -1]],
          [cx1, cz1, cx1, cz0, [1, 0, 0]],
          [cx0, cz1, cx1, cz1, [0, 0, 1]],
          [cx0, cz0, cx0, cz1, [-1, 0, 0]],
        ];
        const ch = b.h + 12;
        for (const [ax, az, bx, bz, n] of cf) {
          const len = Math.hypot(bx - ax, bz - az);
          const bays = Math.max(1, Math.round(len / L.bayW));
          const floors = Math.max(1, Math.round((ch - crownFrom) / L.floorH));
          sheet(`u:${kind}:${style}`).wall(ax, az, bx, bz, crownFrom, ch, bays / L.bays, 0, floors / L.floors, n, tint);
        }
        roofs.flat(x0, z0, x1, z1, crownFrom, new THREE.Color("#9a968e"));
        roofs.flat(cx0, cz0, cx1, cz1, ch, new THREE.Color("#8a8680"));
        trims.push(box(1.4, 14, 1.4, "#cfd3d8", b.x, ch, b.z), cyl(0.12, 0.08, 10, "#cfd3d8", b.x, ch + 14, b.z, 6));
      }
      // Roofs: barrel tiles on the houses, flat with a parapet on the rest.
      const hip = b.kind === "house" || (b.kind === "mansion" && b.style % 2 === 0);
      if (hip) tiles.push(hipRoof(b));
      else if (!b.crown) {
        roofs.flat(x0, z0, x1, z1, b.h, new THREE.Color(b.kind === "trailer" ? "#c9cdd2" : "#8f8b84"));
        if (b.kind !== "trailer") {
          const ph = b.kind === "warehouse" || b.kind === "garage" ? 0.5 : 1;
          const pc = b.kind === "hotel" ? "#f6f1e7" : "#bdb8ae";
          trims.push(box(b.hw * 2, ph, 0.35, pc, b.x, b.h, z0 + 0.17), box(b.hw * 2, ph, 0.35, pc, b.x, b.h, z1 - 0.17), box(0.35, ph, b.hd * 2, pc, x0 + 0.17, b.h, b.z), box(0.35, ph, b.hd * 2, pc, x1 - 0.17, b.h, b.z));
          if (b.kind === "tower" || b.kind === "office" || b.kind === "hospital" || b.kind === "bank") trims.push(box(3, 1.6, 2.2, "#aeb3ba", b.x + b.hw * 0.4, b.h, b.z - b.hd * 0.3), box(2, 1.2, 2, "#aeb3ba", b.x - b.hw * 0.35, b.h, b.z + b.hd * 0.35));
        }
      }
      // Art-deco hotels: eyebrow ledges every floor on the front, a fin up the middle.
      const fx = b.face === 0 ? 1 : b.face === 2 ? -1 : 0;
      const fz = b.face === 1 ? 1 : b.face === 3 ? -1 : 0;
      const along = fz !== 0 ? b.hw * 2 : b.hd * 2;
      if (b.kind === "hotel") {
        for (let y = 4.5; y < b.h - 1; y += 3.4) trims.push(box(fz ? along : 0.7, 0.14, fz ? 0.7 : along, "#f6f1e7", b.x + fx * (b.hw + 0.3), y, b.z + fz * (b.hd + 0.3)));
        if (b.h > 16) trims.push(box(fz ? 1.6 : 0.8, b.h + 5, fz ? 0.8 : 1.6, "#f6f1e7", b.x + fx * (b.hw + 0.35), 0, b.z + fz * (b.hd + 0.35)));
      }
      // Shopfront awnings.
      if (b.kind === "store" && b.h < 16) {
        const AW = ["#e14b6a", "#3fa7a0", "#f2b134", "#2f5a3a", "#7a5cc4", "#1d3f7a"];
        const shops = Math.max(1, Math.round(along / 7));
        const w = along / shops;
        for (let k = 0; k < shops; k++) {
          const o = -along / 2 + w * (k + 0.5);
          const aw = box(fz ? w - 0.8 : 1.6, 0.08, fz ? 1.6 : w - 0.8, AW[(Math.abs(Math.round(b.x * 3 + b.z)) + k) % AW.length], b.x + fx * (b.hw + 0.75) + (fz ? o : 0), 3.1, b.z + fz * (b.hd + 0.75) + (fx ? o : 0));
          trims.push(aw);
        }
      }
      if (b.sign) signs.push({ b, text: b.sign });
    }
    for (const [key, sh] of sheets) {
      const [part, kind, style] = key.split(":");
      const m = new THREE.Mesh(sh.geometry(), this.facadeMat(part as "u" | "b", kind, Number(style)));
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    if (!roofs.empty) {
      const m = new THREE.Mesh(roofs.geometry(), this.mats.roof);
      m.receiveShadow = true;
      g.add(m);
    }
    if (tiles.length) {
      const m = new THREE.Mesh(merge(tiles), this.mats.tiles);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    if (trims.length) {
      const m = new THREE.Mesh(merge(trims), this.mats.trim);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    for (const { b, text } of signs) this.sign(b.kind === "hotel" ? g : detail, b, text);
  }

  private sign(g: THREE.Group, b: Building, text: string) {
    const fx = b.face === 0 ? 1 : b.face === 2 ? -1 : 0;
    const fz = b.face === 1 ? 1 : b.face === 3 ? -1 : 0;
    const along = fz !== 0 ? b.hw * 2 : b.hd * 2;
    const hotel = b.kind === "hotel";
    const NEON = ["#ff4fa3", "#3fd0ff", "#ffd23f", "#7dff8a", "#c58bff"];
    const color = NEON[Math.abs(Math.round(b.x + b.z)) % NEON.length];
    const tex = hotel ? neonSign(text, color) : b.kind === "bank" ? shopSign(text, "#1d2a44", "#e8d9a8") : b.kind === "station" ? shopSign(text, "#12305e", "#ffffff") : b.kind === "hospital" ? shopSign(text, "#ffffff", "#c8102e") : shopSign(text, "#1c1f24", "#ffe14d");
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: hotel, toneMapped: true });
    this.signMats.push(mat);
    const w = Math.min(along * 0.85, hotel ? 16 : 10);
    const h = w * (hotel ? 0.25 : 0.19);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const y = hotel ? b.h + h / 2 + 0.6 : Math.min(b.h - 0.6, 4.3);
    m.position.set(b.x + fx * (b.hw + (hotel ? 0.2 : 0.95)), y, b.z + fz * (b.hd + (hotel ? 0.2 : 0.95)));
    m.rotation.y = Math.atan2(fx, fz);
    g.add(m);
    if (hotel) {
      // Its frame on the roof.
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
    const glows: number[] = [];
    const pools: THREE.BufferGeometry[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const low = this.quality === "low";
    let bb = 0;
    for (const p of list) {
      const t = propTemplate(p.kind, p.kind === "container" || p.kind === "pool" || p.kind === "yacht" || p.kind === "fountain" ? p.s : 1, p.color ?? "#ffffff");
      const sc = p.kind === "palm" || p.kind === "tree" || p.kind === "mangrove" ? p.s : 1;
      m4.compose(v.set(p.x, p.kind === "yacht" ? WATER_Y - 0.2 : 0, p.z), q.setFromAxisAngle(up, p.ry), new THREE.Vector3(sc, sc, sc));
      for (const geo of t.solid) solid.push(geo.clone().applyMatrix4(m4));
      for (const geo of t.fronds) fronds.push(geo.clone().applyMatrix4(m4));
      if (!low || p.kind !== "tree") for (const geo of t.leaves) leaves.push(geo.clone().applyMatrix4(m4));
      for (const geo of t.water) water.push(geo.clone().applyMatrix4(m4));
      for (const [x, y, z] of t.glows) {
        v.set(x, y, z).applyMatrix4(m4);
        glows.push(v.x, v.y, v.z);
        // The pool of light a street lamp throws on the pavement and the road.
        if (y > 3) pools.push(new THREE.PlaneGeometry(y * 2.6, y * 2.6).rotateX(-Math.PI / 2).translate(v.x, 0.06, v.z));
      }
      if (p.kind === "billboard") {
        const mat = new THREE.MeshBasicMaterial({ map: billboard(bb++ + Math.abs(Math.round(p.z))) });
        this.signMats.push(mat);
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
    const sh = new Sheet();
    const c = new THREE.Color();
    for (const b of this.city.buildings) {
      if (b.h < 6) continue;
      c.copy(this.tint(b)).multiplyScalar(b.kind === "tower" || b.kind === "office" || b.kind === "bank" ? 0.62 : 0.8);
      const i = 0.35;
      const x0 = b.x - b.hw + i;
      const x1 = b.x + b.hw - i;
      const z0 = b.z - b.hd + i;
      const z1 = b.z + b.hd - i;
      const h = b.h - 0.2 + (b.crown ? 12 : 0);
      sh.wall(x1, z0, x0, z0, 0, h, 1, 0, 1, [0, 0, -1], c);
      sh.wall(x1, z1, x1, z0, 0, h, 1, 0, 1, [1, 0, 0], c);
      sh.wall(x0, z1, x1, z1, 0, h, 1, 0, 1, [0, 0, 1], c);
      sh.wall(x0, z0, x0, z1, 0, h, 1, 0, 1, [-1, 0, 0], c);
      sh.flat(x0, z0, x1, z1, h, c.clone().multiplyScalar(0.85));
    }
    const m = new THREE.Mesh(sh.geometry(), this.mats.lod);
    m.name = "skyline";
    return m;
  }

  /** Night: windows and signs light up, lamps glow. */
  setNight(n: number) {
    this.night = n;
    for (const m of this.facadeMats.values()) m.emissiveIntensity = n * 1.3;
    for (const m of this.signMats) m.color.setScalar(0.62 + n * 0.75);
    for (const m of this.glowMats) m.opacity = n;
    (this.mats.pool2 as THREE.MeshBasicMaterial).opacity = n * 0.5;
    for (const m of this.poolMeshes) m.visible = n > 0.05;
    (this.mats.lod as THREE.MeshStandardMaterial).emissive.setScalar(n * 0.08);
  }

  dispose() {
    for (const k of [...this.chunks.keys()]) this.unload(k);
    this.lodMesh.geometry.dispose();
    this.farGround.geometry.dispose();
    for (const m of this.facadeMats.values()) m.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

let glowCache: THREE.Texture | null = null;
export function glowTex() {
  return (glowCache ??= glow(64));
}

/** A four-sided hip roof over a building (barrel tiles, UVs in metres). */
function hipRoof(b: Building) {
  const pitch = 0.45;
  const rise = Math.min(b.hw, b.hd) * pitch;
  const x0 = b.x - b.hw - 0.4;
  const x1 = b.x + b.hw + 0.4;
  const z0 = b.z - b.hd - 0.4;
  const z1 = b.z + b.hd + 0.4;
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
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const uv: number[] = [];
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.length / 3; i++) {
    const nx = n.getX(i);
    const u = Math.abs(nx) > 0.5 ? pos[i * 3 + 2] : pos[i * 3];
    uv.push(u / 2, pos[i * 3 + 1] / 1.2 + (Math.abs(nx) > 0.5 ? pos[i * 3] : pos[i * 3 + 2]) / 2.4);
  }
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return paint(g, "#ffffff");
}

export { WHITE };
