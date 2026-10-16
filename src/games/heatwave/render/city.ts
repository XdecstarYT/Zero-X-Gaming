import * as THREE from "three";
import { asphaltDetail, concrete } from "../../code-3/textures";
import { leafClusterTexture } from "../../neon-siege/three/textures";
import { G, getMap, type Lines } from "../mapdata";
import type { State } from "../state";
import { at, tracksFor, type Track } from "../trams";
import { BOUNDS, districtAt, groundClass, groundY, insideSolid, laneOffsets, nearestRoad, nearRoad, noise, rayEnter, segAt, solidsNear, TRAMS, WATER_Y, type Building, type City, type District, type Node, type Prop, type Seg, type Solid } from "../world";
import { FACADE_UNIFORMS, facadeMaterial, LOD_UNIFORMS } from "./facade";
import { buildLandmark, type LandmarkModel } from "./landmarks";
import { box, cyl, merge, paint, propSurface, propTemplate } from "./models";
import { FacadeSheet, Sheet } from "./sheet";
import { asphaltTone, billboard, corrugated, frondTexture, glow, graffiti, groundDetail, lace, neonSign, planks, poolTiles, rippleNormal, shopSign, tramStopSign } from "./textures";

/**
 * The real Melbourne in 3D, streamed in 160 m chunks round the camera.
 *
 *  - The ground from the map's raster: lawns, sports grounds, sand, paving, ballast, back yards.
 *  - Every road at its real angle, with footpaths, bluestone kerbs and channels, and junctions
 *    filled from the real geometry of the streets that meet there. Australian markings (white
 *    centre lines, lane lines, broken-line crossings and stop lines), kerbside lights on the left.
 *  - The real tram and train lines (rails, sleepers on the ballast, the trams' overhead wire),
 *    the elevated freeways on their piers, the piers and jetties over the water, the bridges.
 *  - Every building from its real footprint and height, walls through the facade shader (rooms
 *    behind the windows), flat roofs with parapets and plant, iron hipped, gabled and sawtooth
 *    roofs where the footprint allows, lace verandahs, shop awnings and signs on the street front.
 *  - Street trees, lamps, benches, bins, stops and poles, laneway art.
 * Beyond the chunks, a far skyline (the taller buildings, same facades) and a coarse ground.
 */

export const CHUNK = 160;
export type Quality = "low" | "medium" | "high";

const X0 = BOUNDS.x0;
const Z0 = BOUNDS.z0;
const CX = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CHUNK);
const CZ = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CHUNK);

interface Piece {
  seg: Seg;
  u0: number;
  u1: number;
}
interface LinePiece {
  line: number;
  i0: number;
  i1: number;
}
interface ChunkData {
  buildings: Building[];
  props: Prop[];
  pieces: Piece[];
  nodes: Node[];
  rails: LinePiece[];
  elevated: LinePiece[];
  piers: number[];
  stops: { t: Track; x: number; z: number; h: number; num: string }[];
}

export interface SignalHead {
  node: Node;
  ph: number;
  x: number;
  y: number;
  z: number;
  ry: number;
}

const WHITE = new THREE.Color(1, 1, 1);
const CBD_LIKE = new Set<District>(["cbd", "southbank", "docklands"]);
const ROOF_IRON = ["#8e3a2c", "#6d7378", "#4a5058", "#2f3a33", "#9a9fa4", "#7a3a2e"];
const ROAD_Y = 0.025;
const WALK_Y = 0.16;
const MARK_Y = ROAD_Y + 0.006;

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
    this.radius = quality === "high" ? 560 : quality === "medium" ? 400 : 300;
    this.detailR = quality === "high" ? 340 : quality === "medium" ? 250 : 170;
    const asphalt = asphaltDetail();
    asphalt.normal.repeat.set(1, 1);
    const slab = concrete();
    const leaf = leafClusterTexture(quality === "low" ? 128 : 256);
    const high = quality !== "low";
    this.mats = {
      ground: new THREE.MeshStandardMaterial({ vertexColors: true, map: groundDetail(), roughness: 0.95 }),
      road: new THREE.MeshStandardMaterial({ map: asphaltTone(), color: "#ffffff", roughness: 0.94, envMapIntensity: 0.45, normalMap: high ? asphalt.normal : null, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: asphalt.rough, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      mark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      rail: new THREE.MeshStandardMaterial({ color: "#5d5f62", roughness: 0.42, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      walk: new THREE.MeshStandardMaterial({ map: slab.map, normalMap: high ? slab.normal : null, roughness: 0.85, vertexColors: true }),
      curb: new THREE.MeshStandardMaterial({ color: "#5f5e5c", roughness: 0.8 }),
      bridge: new THREE.MeshStandardMaterial({ color: "#b8b4aa", roughness: 0.85, vertexColors: true }),
      facade: facadeMaterial(quality !== "low"),
      roof: new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true, side: THREE.DoubleSide }),
      iron: new THREE.MeshStandardMaterial({ map: corrugated(), roughness: 0.5, metalness: 0.35, vertexColors: true, side: THREE.DoubleSide }),
      lace: new THREE.MeshStandardMaterial({ map: lace(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, vertexColors: true }),
      trim: new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true, side: THREE.DoubleSide }),
      prop: propSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05 })),
      frond: new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
      leaf: new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true }),
      pool2: new THREE.MeshBasicMaterial({ map: glowTex(), color: "#ffc27a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      pool: new THREE.MeshStandardMaterial({ map: poolTiles(), color: "#bfefff", roughness: 0.05, metalness: 0.1, normalMap: rippleNormal(), normalScale: new THREE.Vector2(0.25, 0.25), transparent: true, opacity: 0.88 }),
      deck: new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.85, side: THREE.DoubleSide }),
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
    void this.sim;
  }

  /* -------------------------------------------------------------- sorting the city into chunks */

  private idx(x: number, z: number) {
    const i = Math.max(0, Math.min(CX - 1, Math.floor((x - X0) / CHUNK)));
    const j = Math.max(0, Math.min(CZ - 1, Math.floor((z - Z0) / CHUNK)));
    return j * CX + i;
  }

  private prepare() {
    this.data = Array.from({ length: CX * CZ }, () => ({ buildings: [], props: [], pieces: [], nodes: [], rails: [], elevated: [], piers: [], stops: [] }));
    for (const b of this.city.buildings) this.data[this.idx(b.x, b.z)].buildings.push(b);
    for (const p of this.city.props) this.data[this.idx(p.x, p.z)].props.push(p);
    const { nodes, segs } = this.city.roads;
    for (const n of nodes) if (n.segs.length >= 2) this.data[this.idx(n.x, n.z)].nodes.push(n);
    for (const seg of segs) {
      const A = nodes[seg.a];
      const B = nodes[seg.b];
      const u0 = Math.min(A.r, seg.len / 2);
      const u1 = Math.max(seg.len - B.r, seg.len / 2);
      if (u1 - u0 < 0.05) continue;
      const n = Math.max(1, Math.ceil((u1 - u0) / 40));
      for (let k = 0; k < n; k++) {
        const a = u0 + ((u1 - u0) * k) / n;
        const b = u0 + ((u1 - u0) * (k + 1)) / n;
        const m = (a + b) / 2;
        this.data[this.idx(A.x + seg.dx * m, A.z + seg.dz * m)].pieces.push({ seg, u0: a, u1: b });
      }
    }
    const m = getMap();
    const split = (L: Lines, key: "rails" | "elevated") => {
      for (let l = 0; l < L.len.length; l++) {
        const st = L.start[l];
        const n = L.len[l];
        let i0 = 0;
        let cur = this.idx(L.xy[st * 2], L.xy[st * 2 + 1]);
        for (let i = 1; i < n; i++) {
          const k = this.idx(L.xy[(st + i) * 2], L.xy[(st + i) * 2 + 1]);
          if (k === cur) continue;
          this.data[cur][key].push({ line: l, i0, i1: i });
          i0 = i;
          cur = k;
        }
        if (n - 1 > i0) this.data[cur][key].push({ line: l, i0, i1: n - 1 });
      }
    };
    split(m.rails, "rails");
    split(m.elevated, "elevated");
    for (let l = 0; l < m.piers.len.length; l++) {
      const st = m.piers.start[l];
      this.data[this.idx(m.piers.xy[st * 2], m.piers.xy[st * 2 + 1])].piers.push(l);
    }
    for (const t of tracksFor(this.city))
      t.stops.forEach((d, i) => {
        const p = at(t, d);
        this.data[this.idx(p.x, p.z)].stops.push({ t, x: p.x, z: p.z, h: p.h, num: String(i + 1) });
      });
  }

  /* -------------------------------------------------------------- streaming */

  /** Load what's near (one chunk a call unless `all`), free what's far. */
  update(cx: number, cz: number, all = false) {
    const need: { i: number; d: number }[] = [];
    // Only the chunks within reach (not the whole map) are looked at.
    const reach = Math.ceil((this.radius + 140 + CHUNK) / CHUNK);
    const ci = Math.floor((cx - X0) / CHUNK);
    const cj = Math.floor((cz - Z0) / CHUNK);
    for (let j = Math.max(0, cj - reach); j <= Math.min(CZ - 1, cj + reach); j++)
      for (let i = Math.max(0, ci - reach); i <= Math.min(CX - 1, ci + reach); i++) {
        const x = X0 + (i + 0.5) * CHUNK;
        const z = Z0 + (j + 0.5) * CHUNK;
        const d = Math.hypot(x - cx, z - cz) - CHUNK * 0.7;
        const k = j * CX + i;
        const have = this.chunks.get(k);
        if (have) (have.userData.detail as THREE.Object3D).visible = d < this.detailR;
        if (d < this.radius && !have) need.push({ i: k, d });
      }
    for (const k of [...this.chunks.keys()]) {
      const i = k % CX;
      const j = Math.floor(k / CX);
      const d = Math.hypot(X0 + (i + 0.5) * CHUNK - cx, Z0 + (j + 0.5) * CHUNK - cz) - CHUNK * 0.7;
      if (d > this.radius + 120) this.unload(k);
    }
    need.sort((a, b) => a.d - b.d);
    for (const n of all ? need : need.slice(0, 1)) this.load(n.i);
    LOD_UNIFORMS.uHideC.value.set(cx, cz);
    LOD_UNIFORMS.uHideR.value = need.length > 2 ? 0 : Math.max(0, this.radius - 150);
    for (const l of this.landmarks) l.model.group.visible = Math.hypot(l.x - cx, l.z - cz) - l.r < 2200;
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
    const detail = new THREE.Group();
    detail.name = "detail";
    g.add(detail);
    g.userData.detail = detail;
    this.ground(g, x0, z0);
    this.roads(g, d, k, detail);
    this.rails(g, d, detail);
    this.elevated(g, d);
    this.bridges(g, d);
    this.piers(g, d);
    this.stops(detail, d);
    this.buildings(g, d.buildings, detail);
    this.props(detail, d.props);
    this.chunks.set(k, g);
    this.root.add(g);
  }

  /* -------------------------------------------------------------- ground */

  private groundColor(x: number, z: number, y: number, out: THREE.Color) {
    const n = noise(x / 23, z / 23) * 0.6 + noise(x / 7, z / 7) * 0.4;
    const c = groundClass(x, z);
    if (y < -0.04) {
      const k = Math.min(1, -y / 3);
      return out.set("#b5a47c").lerp(DEEP, k).multiplyScalar(0.92 + n * 0.12);
    }
    switch (c) {
      case G.grass:
        return out.set(n > 0.62 ? "#7d9a4c" : "#5f9444").multiplyScalar(0.86 + n * 0.26);
      case G.sport:
        return out.set("#5aa146").multiplyScalar(0.9 + n * 0.12);
      case G.sand:
        return out.set("#ecd9a6").multiplyScalar(0.94 + n * 0.1);
      case G.paved:
        return out.set("#a9a49a").multiplyScalar(0.9 + n * 0.12);
      case G.ballast:
        return out.set("#7d746a").multiplyScalar(0.85 + n * 0.2);
      case G.deck:
        return out.set("#7a6a52");
      default: {
        const d = districtAt(x, z);
        if (CBD_LIKE.has(d)) return out.set("#8f8b85").multiplyScalar(0.9 + n * 0.14);
        if (d === "docks") return out.set("#9a9890").multiplyScalar(0.88 + n * 0.16);
        // Back yards and front gardens: dry grass, gravel and a bit of everything.
        return out.set(n > 0.52 ? "#8d9662" : "#a29d84").multiplyScalar(0.88 + n * 0.2);
      }
    }
  }

  private ground(g: THREE.Group, x0: number, z0: number) {
    // The ground's colour comes from the 4 m map raster; 8 m cells are plenty but on high.
    const step = this.quality === "high" ? 4 : 8;
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
        pos.set([x, Math.max(y, -8), z], k * 3);
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
    const nx = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / step) + 1;
    const nz = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const c = new THREE.Color();
    for (let b = 0; b < nz; b++)
      for (let a = 0; a < nx; a++) {
        const x = X0 + a * step;
        const z = Z0 + b * step;
        const y = groundY(x, z);
        const k = b * nx + a;
        pos.set([x, Math.max(y, -8) - 0.1, z], k * 3);
        this.groundColor(x, z, y, c);
        if (y > -0.05 && nearRoad(x, z, 3)) c.set("#55575c");
        col.set([c.r, c.g, c.b], k * 3);
      }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let b = 0; b < nz - 1; b++)
      for (let a = 0; a < nx - 1; a++) {
        const p = b * nx + a;
        idx.set([p, p + nx, p + 1, p + 1, p + nx, p + nx + 1], o);
        o += 6;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
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
    const { nodes, segs } = this.city.roads;
    // A strip along a segment: from u0 to u1, across from v0 to v1 (left of a→b positive).
    const strip = (sh: Sheet, s: Seg, u0: number, u1: number, v0: number, v1: number, y: number, col: THREE.Color, tile = 4) => {
      const A = nodes[s.a];
      const lx = s.dz;
      const lz = -s.dx;
      const P = (u: number, v: number) => [A.x + s.dx * u + lx * v, A.z + s.dz * u + lz * v];
      upQuad(sh, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], y, col, tile);
    };
    for (const pc of d.pieces) {
      const s = pc.seg;
      const { u0, u1 } = pc;
      const pave = CBD_LIKE.has(districtAt(nodes[s.a].x, nodes[s.a].z)) ? paveCbd : paveSub;
      const wk = s.bridge ? 1.6 : s.walk;
      strip(asphalt, s, u0, u1, -s.half, s.half, ROAD_Y, WHITE);
      // Markings.
      const dashes = (v: number, every: number, len: number, w = 0.06) => {
        for (let u = Math.ceil(u0 / every) * every; u < u1 - len; u += every) strip(marks, s, u, u + len, v - w, v + w, MARK_Y, white);
      };
      if (s.cls !== "lane") {
        const offs = laneOffsets(s);
        if (s.oneway) {
          for (let i = 0; i < offs.length - 1; i++) dashes((offs[i] + offs[i + 1]) / 2, 10, 3);
        } else if (s.cls === "boulevard" || s.cls === "avenue") {
          strip(marks, s, u0, u1, -0.3, -0.18, MARK_Y, white);
          strip(marks, s, u0, u1, 0.18, 0.3, MARK_Y, white);
          for (let i = 0; i < offs.length - 1; i++) for (const sd of [-1, 1]) dashes((sd * (offs[i] + offs[i + 1])) / 2, 12, 3);
        } else if (s.len > 20) dashes(0, 9, 3);
      }
      for (const side of [-1, 1]) {
        const va = side * s.half;
        const vb = side * (s.half + wk);
        strip(walk, s, u0, u1, Math.min(va, vb), Math.max(va, vb), WALK_Y, pave, 2);
        if (s.cls !== "lane") strip(marks, s, u0, u1, Math.min(va, va - side * 0.4), Math.max(va, va - side * 0.4), MARK_Y, channel);
        // The kerb's face, looking into the road.
        const A = nodes[s.a];
        const lx = s.dz * va;
        const lz = -s.dx * va;
        const ax = A.x + s.dx * u0 + lx;
        const az = A.z + s.dz * u0 + lz;
        const bx = A.x + s.dx * u1 + lx;
        const bz = A.z + s.dz * u1 + lz;
        const n = [-s.dz * side, 0, s.dx * side];
        if (side > 0) curbs.wall(ax, az, bx, bz, ROAD_Y - 0.01, WALK_Y, (u1 - u0) / 2, 0, 0.08, n, WHITE);
        else curbs.wall(bx, bz, ax, az, ROAD_Y - 0.01, WALK_Y, (u1 - u0) / 2, 0, 0.08, n, WHITE);
      }
    }
    // Junctions and bends: fill between the roads that meet.
    for (const n of d.nodes) {
      const ways = n.segs.map((id, k) => {
        const s = segs[id];
        const out = s.a === n.id;
        const dx = out ? s.dx : -s.dx;
        const dz = out ? s.dz : -s.dz;
        return { s, k, dx, dz, a: Math.atan2(dz, dx), r: Math.min(n.r, s.len / 2) };
      });
      ways.sort((p, q) => p.a - q.a);
      const pave = CBD_LIKE.has(districtAt(n.x, n.z)) ? paveCbd : paveSub;
      const box_: number[][] = [];
      const W = ways.length;
      for (let i = 0; i < W; i++) {
        const w = ways[i];
        const v = ways[(i + 1) % W];
        // Going round by increasing angle, the next road is on this road's (−dz, dx) side.
        const sx = -w.dz;
        const sz = w.dx;
        const ax = n.x + w.dx * w.r;
        const az = n.z + w.dz * w.r;
        box_.push([ax - sx * w.s.half, az - sz * w.s.half], [ax + sx * w.s.half, az + sz * w.s.half]);
        let gap = v.a - w.a;
        if (gap <= 0) gap += Math.PI * 2;
        // The next road's side facing back toward this one is its (dz, −dx).
        const vsx = v.dz;
        const vsz = -v.dx;
        const bx = n.x + v.dx * v.r;
        const bz = n.z + v.dz * v.r;
        const p1 = [ax + sx * w.s.half, az + sz * w.s.half];
        const p2 = [bx + vsx * v.s.half, bz + vsz * v.s.half];
        const o1 = [p1[0] + sx * w.s.walk, p1[1] + sz * w.s.walk];
        const o2 = [p2[0] + vsx * v.s.walk, p2[1] + vsz * v.s.walk];
        if (W >= 2 && gap < Math.PI - 0.12) {
          // A proper corner: the kerbs' lines meet; so do the footpaths' outer lines.
          const kc = meet(p1, [w.dx, w.dz], p2, [v.dx, v.dz]);
          const oc = meet(o1, [w.dx, w.dz], o2, [v.dx, v.dz]);
          const ok = (q: number[] | null) => !!q && Math.hypot(q[0] - n.x, q[1] - n.z) < n.r + 30;
          if (ok(kc) && ok(oc)) {
            box_.push(kc!);
            fan(walk, [p1, o1, oc!, o2, p2, kc!], WALK_Y, pave);
            continue;
          }
        }
        // A wide or reflex corner (or a dead end): round it with an arc.
        const a0 = Math.atan2(p1[1] - n.z, p1[0] - n.x);
        let a1 = Math.atan2(p2[1] - n.z, p2[0] - n.x);
        while (a1 <= a0) a1 += Math.PI * 2;
        const steps = Math.max(2, Math.ceil((a1 - a0) / 0.35));
        const r0 = Math.hypot(p1[0] - n.x, p1[1] - n.z);
        const r1 = Math.hypot(p2[0] - n.x, p2[1] - n.z);
        const wk = (w.s.walk + v.s.walk) / 2;
        const inner: number[][] = [];
        const outer: number[][] = [];
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const a = a0 + (a1 - a0) * t;
          const r = r0 + (r1 - r0) * t;
          inner.push([n.x + Math.cos(a) * r, n.z + Math.sin(a) * r]);
          outer.push([n.x + Math.cos(a) * (r + wk), n.z + Math.sin(a) * (r + wk)]);
          if (k > 0 && k < steps) box_.push(inner[k]);
        }
        for (let k = 0; k < steps; k++) upQuad(walk, [inner[k], outer[k], outer[k + 1], inner[k + 1]], WALK_Y, pave, 2);
      }
      if (box_.length >= 3) fanAround(asphalt, n.x, n.z, box_, ROAD_Y);
      if (!n.light) continue;
      // Crossings, stop lines and lights on each lit approach.
      for (const w of ways) {
        const s = w.s;
        if (s.cls === "lane") continue;
        const sx = -w.dz;
        const sz = w.dx;
        const across = (dist0: number, dist1: number, v0: number, v1: number) => {
          const P = (u: number, v: number) => [n.x + w.dx * u + sx * v, n.z + w.dz * u + sz * v];
          upQuad(marks, [P(dist0, v0), P(dist1, v0), P(dist1, v1), P(dist0, v1)], MARK_Y + 0.001, white);
        };
        const e = w.r;
        for (let v = -s.half + 0.2; v < s.half - 0.5; v += 1.2) {
          across(e + 0.5, e + 0.65, v, v + 0.6);
          across(e + 3.05, e + 3.2, v, v + 0.6);
        }
        // Traffic coming in (heading −d) keeps to its left, which is our (−dz, dx) side here... the −side.
        const inSide = s.oneway ? 0 : -1;
        if (canEnter(s, n)) {
          if (inSide) across(e + 3.6, e + 4.0, -s.half, 0);
          else across(e + 3.6, e + 4.0, -s.half, s.half);
        }
        const side = -1;
        const px = n.x + w.dx * (e + 4.5) + sx * side * (s.half + 1.2);
        const pz = n.z + w.dz * (e + 4.5) + sz * side * (s.half + 1.2);
        poles.push(cyl(0.13, 0.1, 6.4, "#3c4a42", px, 0, pz, 8));
        const armLen = Math.min(s.half + 0.6, 9);
        const ry = Math.atan2(-sz, sx);
        poles.push(box(armLen, 0.14, 0.14, "#3c4a42", px - sx * side * (armLen / 2), 6.1, pz - sz * side * (armLen / 2), ry));
        const hx = px - sx * side * (Math.min(s.half, 8) * 0.55);
        const hz = pz - sz * side * (Math.min(s.half, 8) * 0.55);
        const face = Math.atan2(w.dx, w.dz);
        poles.push(box(0.36, 1.2, 0.3, "#1c1f24", hx, 4.95, hz, face), box(0.36, 1.2, 0.3, "#1c1f24", px, 2.4, pz, face));
        const head: SignalHead & { chunk?: number } = { node: n, ph: n.ph[w.k], x: hx + w.dx * 0.18, y: 5.55, z: hz + w.dz * 0.18, ry: face, chunk };
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

  /* -------------------------------------------------------------- rail lines, freeways, piers */

  private rails(g: THREE.Group, d: ChunkData, detail: THREE.Group) {
    if (!d.rails.length) return;
    const L = getMap().rails;
    const rails = new Sheet();
    const sleepers: THREE.BufferGeometry[] = [];
    const wires: number[] = [];
    const poles: THREE.BufferGeometry[] = [];
    const G2 = 0.7175;
    for (const { line, i0, i1 } of d.rails) {
      const tram = L.tag[line] === 0;
      const st = L.start[line];
      const y = tram ? ROAD_Y + 0.012 : 0.22;
      let acc = 0;
      for (let i = i0; i < i1; i++) {
        const ax = L.xy[(st + i) * 2];
        const az = L.xy[(st + i) * 2 + 1];
        const bx = L.xy[(st + i + 1) * 2];
        const bz = L.xy[(st + i + 1) * 2 + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const ux = (bx - ax) / len;
        const uz = (bz - az) / len;
        const lx = uz;
        const lz = -ux;
        for (const o of [-G2, G2]) {
          const w = 0.05;
          const p = (x: number, z: number, k: number) => [x + lx * (o + k), z + lz * (o + k)];
          upQuad(rails, [p(ax, az, -w), p(bx, bz, -w), p(bx, bz, w), p(ax, az, w)], y, WHITE, 1);
        }
        if (!tram) {
          // Sleepers on the ballast.
          for (let u = Math.ceil(acc / 0.7) * 0.7 - acc; u < len; u += 0.7) sleepers.push(box(0.24, 0.12, 2.5, "#4a3f36", ax + ux * u, 0.1, az + uz * u, Math.atan2(-uz, ux)));
        } else {
          // The contact wire overhead, and a pole at the kerb now and then.
          wires.push(ax, 5.6, az, bx, 5.6, bz);
          const k0 = Math.floor(acc / 35);
          const k1 = Math.floor((acc + len) / 35);
          if (k1 > k0) {
            const u = k1 * 35 - acc;
            const x = ax + ux * u;
            const z = az + uz * u;
            const r = nearestRoad(this.city, x, z);
            if (r && r.d < 6) {
              const side = (x - r.x) * r.seg.dz - (z - r.z) * r.seg.dx >= 0 ? 1 : -1;
              const off = r.seg.half + 0.6;
              const px = r.x + r.seg.dz * off * side;
              const pz = r.z - r.seg.dx * off * side;
              poles.push(cyl(0.15, 0.11, 7, "#3c4a42", px, 0, pz, 8));
              wires.push(px, 6.7, pz, x, 5.75, z);
            }
          }
        }
        acc += len;
      }
    }
    if (!rails.empty) {
      const m = new THREE.Mesh(rails.geometry(), this.mats.rail);
      m.receiveShadow = true;
      g.add(m);
    }
    if (sleepers.length) detail.add(new THREE.Mesh(merge(sleepers), this.mats.prop));
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

  private elevated(g: THREE.Group, d: ChunkData) {
    if (!d.elevated.length) return;
    const L = getMap().elevated;
    const deck = new Sheet();
    const parts: THREE.BufferGeometry[] = [];
    const Y = 8.2;
    for (const { line, i0, i1 } of d.elevated) {
      const st = L.start[line];
      const half = 6;
      let acc = 0;
      for (let i = i0; i < i1; i++) {
        const ax = L.xy[(st + i) * 2];
        const az = L.xy[(st + i) * 2 + 1];
        const bx = L.xy[(st + i + 1) * 2];
        const bz = L.xy[(st + i + 1) * 2 + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const ux = (bx - ax) / len;
        const uz = (bz - az) / len;
        const lx = uz * half;
        const lz = -ux * half;
        upQuad(deck, [[ax - lx, az - lz], [bx - lx, bz - lz], [bx + lx, bz + lz], [ax + lx, az + lz]], Y, WHITE, 4);
        const ry = Math.atan2(-uz, ux);
        parts.push(box(len + 0.4, 1.6, half * 2 - 1, "#a7a39b", (ax + bx) / 2, Y - 1.62, (az + bz) / 2, ry));
        for (const sd of [-1, 1]) parts.push(box(len + 0.2, 1.0, 0.35, "#c9c4b8", (ax + bx) / 2 + uz * half * sd * 0.97, Y, (az + bz) / 2 - ux * half * sd * 0.97, ry));
        const k0 = Math.floor(acc / 32);
        const k1 = Math.floor((acc + len) / 32);
        for (let k = k0 + 1; k <= k1; k++) {
          const u = k * 32 - acc;
          const x = ax + ux * u;
          const z = az + uz * u;
          const base = Math.max(WATER_Y - 2, groundY(x, z));
          parts.push(cyl(1.1, 1.1, Y - 1.6 - base, "#9f9b93", x, base, z, 10), box(3.2, 0.9, half * 1.6, "#9f9b93", x, Y - 2.5, z, ry));
        }
        acc += len;
      }
    }
    if (!deck.empty) {
      const m = new THREE.Mesh(deck.geometry(), this.mats.road);
      m.receiveShadow = true;
      g.add(m);
    }
    if (parts.length) {
      const m = new THREE.Mesh(merge(parts), this.mats.bridge);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
  }

  private bridges(g: THREE.Group, d: ChunkData) {
    const parts: THREE.BufferGeometry[] = [];
    const nodes = this.city.roads.nodes;
    for (const pc of d.pieces) {
      const s = pc.seg;
      if (!s.bridge) continue;
      const A = nodes[s.a];
      const wet = (u: number) => groundClass(A.x + s.dx * u, A.z + s.dz * u) >= G.water;
      if (!wet((pc.u0 + pc.u1) / 2) && !wet(pc.u0) && !wet(pc.u1)) continue;
      const half = s.half + 1.6;
      const L = pc.u1 - pc.u0;
      const cu = (pc.u0 + pc.u1) / 2;
      const cx = A.x + s.dx * cu;
      const cz = A.z + s.dz * cu;
      const ry = Math.atan2(-s.dz, s.dx);
      parts.push(box(L + 0.3, 1.3, half * 2, "#bdb8ae", cx, -1.3, cz, ry));
      for (const side of [-1, 1]) {
        const ox = s.dz * (half - 0.22) * side;
        const oz = -s.dx * (half - 0.22) * side;
        parts.push(box(L + 0.3, 0.7, 0.45, "#6d6b68", cx + ox, 0.02, cz + oz, ry), box(L + 0.3, 0.08, 0.08, "#2b3530", cx + ox, 1.05, cz + oz, ry));
      }
      for (let u = pc.u0 + 6; u < pc.u1 - 4; u += 22) if (wet(u)) parts.push(box(1.6, 6, half * 1.4, "#8f8b84", A.x + s.dx * u, -7, A.z + s.dz * u, ry));
    }
    if (!parts.length) return;
    const m = new THREE.Mesh(merge(parts), this.mats.bridge);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }

  private piers(g: THREE.Group, d: ChunkData) {
    if (!d.piers.length) return;
    const L = getMap().piers;
    const top: number[] = [];
    const posts: THREE.BufferGeometry[] = [];
    for (const l of d.piers) {
      const st = L.start[l];
      const n = L.len[l];
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(L.xy[(st + i) * 2], L.xy[(st + i) * 2 + 1]));
      if (pts.length < 3) continue;
      const tris = THREE.ShapeUtils.triangulateShape(pts, []);
      for (const [a, b, c] of tris) for (const k of [a, b, c]) top.push(pts[k].x, 0, pts[k].y);
      // Piles round the edge, and a rail.
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % n];
        const len = p.distanceTo(q);
        if (len < 0.01) continue;
        for (let u = Math.ceil(acc / 6) * 6 - acc; u < len; u += 6) {
          const x = p.x + ((q.x - p.x) * u) / len;
          const z = p.y + ((q.y - p.y) * u) / len;
          posts.push(cyl(0.22, 0.22, 6, "#5b4532", x, -6, z, 6), cyl(0.05, 0.05, 1.1, "#e8e2d0", x, 0, z, 5));
        }
        if (len > 0.5) posts.push(box(len, 0.07, 0.07, "#e8e2d0", (p.x + q.x) / 2, 1.05, (p.y + q.y) / 2, Math.atan2(-(q.y - p.y), q.x - p.x)));
        acc += len;
      }
    }
    if (top.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(top, 3));
      const uv: number[] = [];
      for (let i = 0; i < top.length; i += 3) uv.push(top[i], top[i + 2]);
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.mats.deck);
      m.receiveShadow = true;
      g.add(m);
    }
    if (posts.length) {
      const m = new THREE.Mesh(merge(posts), this.mats.prop);
      m.castShadow = true;
      g.add(m);
    }
  }

  /** Tram stops along the simulated lines: a sign and a shelter at the kerb. */
  private stops(detail: THREE.Group, d: ChunkData) {
    const parts: THREE.BufferGeometry[] = [];
    const scratch: Solid[] = [];
    for (const st of d.stops) {
      const seg = segAt(this.city, st.x, st.z, 3);
      if (!seg) continue;
      const lx = Math.sin(st.h);
      const lz = -Math.cos(st.h);
      const r = nearestRoad(this.city, st.x, st.z);
      const k = seg.half + 0.7 - (r ? r.d : 0);
      const px = st.x + lx * k;
      const pz = st.z + lz * k;
      parts.push(cyl(0.05, 0.05, 2.6, "#c9cdd2", px, 0, pz, 6));
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
      const t = propTemplate("busstop");
      const sx = px + lx * 1.4 - Math.cos(st.h) * 6;
      const sz = pz + lz * 1.4 - Math.sin(st.h) * 6;
      if (solidsNear(this.city, sx, sz, 2, scratch).some((s) => insideSolid(s, sx, sz))) continue;
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(sx, 0, sz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-lx, -lz)), new THREE.Vector3(1, 1, 1));
      for (const geo of t.solid) parts.push(geo.clone().applyMatrix4(m4));
    }
    if (parts.length) detail.add(new THREE.Mesh(merge(parts), this.mats.prop));
  }

  /* -------------------------------------------------------------- buildings */

  private buildings(g: THREE.Group, list: Building[], detail: THREE.Group) {
    if (!list.length) return;
    const fs = new FacadeSheet();
    const roofs: number[] = [];
    const roofCol: number[] = [];
    const iron: THREE.BufferGeometry[] = [];
    const trims: THREE.BufferGeometry[] = [];
    const laces: THREE.BufferGeometry[] = [];
    const signs: Building[] = [];
    const tint = new THREE.Color();
    const accent = new THREE.Color();
    const rc = new THREE.Color();
    const flat = (ring: Float32Array, holes: Float32Array[], y: number, col: THREE.Color) => {
      const contour: THREE.Vector2[] = [];
      for (let i = 0; i < ring.length; i += 2) contour.push(new THREE.Vector2(ring[i], ring[i + 1]));
      const hs = holes.map((h) => {
        const o: THREE.Vector2[] = [];
        for (let i = 0; i < h.length; i += 2) o.push(new THREE.Vector2(h[i], h[i + 1]));
        return o;
      });
      const all = contour.concat(...hs);
      let tris: number[][];
      try {
        tris = THREE.ShapeUtils.triangulateShape(contour, hs);
      } catch {
        return;
      }
      for (const t of tris)
        for (const k of t) {
          roofs.push(all[k].x, y, all[k].y);
          roofCol.push(col.r, col.g, col.b);
        }
    };
    // Walls along a ring, edge by edge (outward normals (dz, −dx) for a positive-area ring).
    const walls = (b: Building, ring: Float32Array, y0: number, y1: number, col: THREE.Color, seed: number, front: boolean) => {
      const n = ring.length / 2;
      const f = b.front;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = ring[i * 2];
        const az = ring[i * 2 + 1];
        const bx = ring[j * 2];
        const bz = ring[j * 2 + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        const nx = (bz - az) / len;
        const nz = -(bx - ax) / len;
        const isFront = front && !!f && f.ax === ax && f.az === az;
        fs.look = { type: b.fac, floor: b.floor, gf: b.gf, seed, accent, shop: b.shop && isFront };
        fs.wall(ax, az, bx, bz, y0, y1, 1, 0, 1, [nx, 0, nz], col);
      }
    };
    for (const b of list) {
      tint.set(b.color).multiplyScalar(0.94 + noise(b.x * 0.1, b.z * 0.1) * 0.12);
      accent.set(b.accent);
      const seed = (Math.abs(Math.sin(b.id * 12.9898) * 43758.5453) % 1) + 0.01;
      const top = b.crown ? Math.min(b.h, b.crown.from) : b.h;
      walls(b, b.ring, b.minH, top, tint, seed, true);
      for (const h of b.holes) walls(b, h, b.minH, top, tint, seed, false);
      if (b.crown && b.crown.from < b.h) {
        const save = b.fac;
        if (b.crown.gold) {
          b.fac = 0;
          accent.set("#c9a24a");
        }
        walls(b, b.ring, top, b.h, b.crown.gold ? GOLD : tint, seed, false);
        b.fac = save;
        accent.set(b.accent);
      }
      // Roofs.
      const o = b.obb;
      switch (b.roof) {
        case "hip":
        case "gable": {
          const col = rc.set(b.kind === "mansion" ? "#4a5058" : ROOF_IRON[b.id % ROOF_IRON.length]).clone();
          iron.push(paint(b.roof === "hip" ? hipRoof(o, b.h) : gableRoof(o, b.h, trims, tint), col));
          if (b.kind === "terrace" || b.kind === "cottage") trims.push(box(0.7, 2.0, 0.5, b.kind === "terrace" ? "#9a4a36" : "#c9b89a", o.x + o.ux * o.hw * 0.4, b.h + Math.min(o.hw, o.hd) * 0.2, o.z + o.uz * o.hw * 0.4));
          break;
        }
        case "sawtooth":
          iron.push(...sawtooth(o, b.h, rc.set("#9da2a6").clone(), trims, b.color));
          break;
        case "dome":
        case "pyramid": {
          flat(b.ring, b.holes, b.h, rc.set("#8a8781"));
          const r = Math.min(o.hw, o.hd) * 0.8;
          trims.push(
            b.roof === "dome"
              ? paint(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed().scale(1, 0.8, 1).translate(o.x, b.h, o.z), "#6f8a7a")
              : paint(new THREE.ConeGeometry(r * 1.2, r * 0.9, 4).toNonIndexed().rotateY(-Math.atan2(o.uz, o.ux) + Math.PI / 4).translate(o.x, b.h + r * 0.45, o.z), "#99948a"),
          );
          break;
        }
        default: {
          const membrane = b.kind === "tower" || b.kind === "office" || b.kind === "hotel" ? "#7f7d79" : "#8f8b84";
          flat(b.ring, b.holes, b.h, rc.set(membrane).multiplyScalar(0.92 + seed * 0.12));
          // A floating part also has an underside.
          if (b.minH > 0.5) flat(b.ring, [], b.minH, rc.set("#6f6c66"));
          // A parapet round the edge, and plant on the bigger roofs.
          const ph = b.kind === "warehouse" || b.kind === "garage" || b.kind === "shed" ? 0.4 : b.kind === "heritage" || b.kind === "pub" || b.kind === "shop" ? 1.2 : 0.9;
          if (b.h > 4 && b.ring.length / 2 <= 40) parapet(trims, b.ring, b.h, ph, `#${tint.getHexString()}`);
          if (b.h > 18 && o.hw > 4 && o.hd > 4) trims.push(box(Math.min(6, o.hw), 2.2, Math.min(5, o.hd), "#a3a8ad", o.x + o.ux * o.hw * 0.25, b.h, o.z + o.uz * o.hw * 0.25, -Math.atan2(o.uz, o.ux)), box(2.4, 1.6, 2.4, "#b6babe", o.x - o.ux * o.hw * 0.4, b.h, o.z - o.uz * o.hw * 0.4));
          if (b.h > 120) trims.push(cyl(0.4, 0.18, 18, "#cfd3d8", o.x, b.h, o.z, 6));
        }
      }
      const f = b.front;
      if (f && b.verandah) verandah(b, b.kind === "terrace" && b.h > 9 ? [3.3, 6.9] : [b.kind === "cottage" ? 2.7 : 3.3], b.kind === "pub" || b.kind === "hotel" || b.kind === "shop" ? 3 : 2.1, iron, trims, laces, accent, tint);
      if (f && b.awning && !b.verandah && f.len > 3) {
        const mx = (f.ax + f.bx) / 2;
        const mz = (f.az + f.bz) / 2;
        const ry = Math.atan2(-(f.bz - f.az), f.bx - f.ax);
        trims.push(box(f.len - 0.2, 0.32, 2.8, "#2b2f36", mx + f.nx * 1.4, 3.3, mz + f.nz * 1.4, ry));
        trims.push(box(f.len - 0.2, 0.5, 0.08, `#${accent.getHexString()}`, mx + f.nx * 2.82, 3.2, mz + f.nz * 2.82, ry));
      }
      if (b.sign && f) signs.push(b);
    }
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true, to = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      to.add(m);
    };
    if (!fs.empty) add(fs.geometry(), this.mats.facade);
    if (roofs.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(roofs, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(roofCol, 3));
      const nrm = new Float32Array(roofs.length);
      for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
      geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
      add(geo, this.mats.roof, false);
    }
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
    const f = b.front!;
    const text = b.sign!;
    const roofSign = b.kind === "hotel" || ((b.kind === "bank" || b.kind === "hospital") && b.h > 20);
    let mat: THREE.MeshBasicMaterial;
    if (b.kind === "hotel") mat = this.signMat(`neon:${text}`, () => neonSign(text, ["#ff4fa3", "#3fd0ff", "#ffd23f", "#7dff8a"][b.id % 4]), true);
    else if (b.kind === "pub") mat = this.signMat(`pub:${text}`, () => shopSign(text, "#1f3a2a", "#f2e2b0"));
    else if (b.kind === "bank") mat = this.signMat(`bank:${text}`, () => shopSign(text, "#1d2a44", "#e8d9a8"));
    else if (b.kind === "station") mat = this.signMat(`stn:${text}`, () => shopSign(text, "#12305e", "#ffffff"));
    else if (b.kind === "hospital") mat = this.signMat(`hosp:${text}`, () => shopSign(text, "#ffffff", "#c8102e"));
    else mat = this.signMat(`shop:${text}`, () => shopSign(text, "#1c1f24", "#ffe14d"));
    const w = Math.min(f.len * 0.85, roofSign ? 18 : 9);
    const h = w * (b.kind === "hotel" ? 0.25 : 0.19);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const y = roofSign ? b.h + h / 2 + 0.6 : b.kind === "pub" ? Math.max(3.5, b.h - h / 2 - 0.3) : b.awning ? 3.45 : Math.min(b.h - 0.6, 4.3);
    const out = roofSign || b.kind === "pub" ? 0.2 : b.awning ? 2.9 : 0.15;
    m.position.set((f.ax + f.bx) / 2 + f.nx * out, y, (f.az + f.bz) / 2 + f.nz * out);
    m.rotation.y = Math.atan2(f.nx, f.nz);
    g.add(m);
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
    const scratch: Solid[] = [];
    let bb = 0;
    for (const p of list) {
      if (p.kind === "graffiti") {
        // On the laneway's walls, wherever they actually are.
        const half = Number(p.color) || 2.4;
        const dx = Math.cos(p.ry);
        const dz = Math.sin(p.ry);
        for (const side of [-1, 1]) {
          const nx = dz * side;
          const nz = -dx * side;
          let hitT = -1;
          for (const s of solidsNear(this.city, p.x, p.z, 10, scratch)) {
            if (s.round) continue;
            const t = rayEnter(s, p.x, p.z, nx * 8, nz * 8);
            if (t >= 0 && (hitT < 0 || t < hitT)) hitT = t;
          }
          if (hitT < 0 || hitT * 8 < half * 0.5) continue;
          const dist = hitT * 8 - 0.05;
          const pl = new THREE.PlaneGeometry(Math.max(3, p.s), 4.6).toNonIndexed();
          pl.rotateY(Math.atan2(-nx, -nz));
          pl.translate(p.x + nx * dist, 2.4, p.z + nz * dist);
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
      if (b.h < 13) continue;
      const before = fs.pos.length / 3;
      c.set(b.color);
      acc.set(b.crown?.gold ? "#c9a24a" : b.accent);
      fs.look = { type: b.fac, floor: b.floor, gf: b.gf, seed: (b.id % 97) / 97, accent: acc, shop: false };
      // The minimum box is plenty far off (and cheap).
      const o = b.obb;
      const ax = o.ux * Math.max(0.5, o.hw - 0.3);
      const az = o.uz * Math.max(0.5, o.hw - 0.3);
      const bx = -o.uz * Math.max(0.5, o.hd - 0.3);
      const bz = o.ux * Math.max(0.5, o.hd - 0.3);
      let P = [
        [o.x - ax - bx, o.z - az - bz],
        [o.x + ax - bx, o.z + az - bz],
        [o.x + ax + bx, o.z + az + bz],
        [o.x - ax + bx, o.z - az + bz],
      ];
      const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]);
      if (area < 0) P = P.reverse();
      const h = b.h - 0.1;
      for (let i = 0; i < 4; i++) {
        const p = P[i];
        const q2 = P[(i + 1) % 4];
        const len = Math.hypot(q2[0] - p[0], q2[1] - p[1]) || 1;
        fs.wall(p[0], p[1], q2[0], q2[1], b.minH, h, 1, 0, 1, [(q2[1] - p[1]) / len, 0, -(q2[0] - p[0]) / len], c);
      }
      fs.look = { type: 1, floor: 3.6, gf: 0, seed: 0, accent: acc, shop: false };
      upQuad(fs, P, h, c.clone().multiplyScalar(0.6), 4);
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
    (this.farGround.material as THREE.Material).dispose();
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
const DEEP = new THREE.Color("#5f5a48");
const GOLD = new THREE.Color("#c9a24a");

let glowCache: THREE.Texture | null = null;
export function glowTex() {
  return (glowCache ??= glow(64));
}

/* ------------------------------------------------------------------------------ geometry helpers */

/** An up-facing quad from four x/z corners in either winding. */
function upQuad(sh: Sheet, p: number[][], y: number, col: THREE.Color, tile = 4) {
  // In x/z with z south, an up-facing triangle (a, b, c) has (b−a)×(c−a) with negative y-ish sign
  // in the plain 2D cross product; flip the order if it's the other way.
  const cross = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
  const q = cross < 0 ? p : [p[0], p[3], p[2], p[1]];
  sh.quad([q[0][0], y, q[0][1]], [q[1][0], y, q[1][1]], [q[2][0], y, q[2][1]], [q[3][0], y, q[3][1]], q.map((v) => [v[0] / tile, v[1] / tile]), [0, 1, 0], col);
}

/** Can traffic arrive at node n along s? */
function canEnter(s: Seg, n: Node) {
  if (!s.oneway) return true;
  return s.oneway === 1 ? s.b === n.id : s.a === n.id;
}

/** Where two lines (point + direction) meet, or null if they're parallel. */
function meet(p: number[], d: number[], q: number[], e: number[]): number[] | null {
  const cross = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(cross) < 1e-4) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / cross;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

/** A convex-ish fan of x/z points, facing up. */
function fan(sh: Sheet, pts: number[][], y: number, col: THREE.Color) {
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p[0];
    cz += p[1];
  }
  fanAround(sh, cx / pts.length, cz / pts.length, pts, y, col);
}

function fanAround(sh: Sheet, cx: number, cz: number, pts: number[][], y: number, col = WHITE) {
  const sorted = [...pts].sort((a, b) => Math.atan2(a[1] - cz, a[0] - cx) - Math.atan2(b[1] - cz, b[0] - cx));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[(i + 1) % sorted.length];
    // Going round by increasing angle (x east, z south): centre, b, a faces up.
    sh.tri([cx, y, cz], [b[0], y, b[1]], [a[0], y, a[1]], [0, 1, 0], col);
  }
}

type Obb = Building["obb"];

/** A four-sided hip roof over a footprint's minimum box (eaves a little out). */
function hipRoof(o: Obb, y: number) {
  const e = 0.35;
  const hw = o.hw + e;
  const hd = o.hd + e;
  const rise = Math.min(o.hw, o.hd) * 0.5;
  const ux = o.ux;
  const uz = o.uz;
  const vx = -uz;
  const vz = ux;
  const P = (a: number, b: number, h: number) => [o.x + ux * a + vx * b, y + h, o.z + uz * a + vz * b];
  const A = P(-hw, -hd, 0);
  const B = P(hw, -hd, 0);
  const C = P(hw, hd, 0);
  const D = P(-hw, hd, 0);
  const along = hw >= hd;
  const r0 = along ? P(-hw + hd, 0, rise) : P(0, -hd + hw, rise);
  const r1 = along ? P(hw - hd, 0, rise) : P(0, hd - hw, rise);
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  if (along) {
    tri(A, B, r1);
    tri(A, r1, r0);
    tri(C, D, r0);
    tri(C, r0, r1);
    tri(D, A, r0);
    tri(B, C, r1);
  } else {
    tri(B, C, r1);
    tri(B, r1, r0);
    tri(D, A, r0);
    tri(D, r0, r1);
    tri(A, B, r0);
    tri(C, D, r1);
  }
  return roofGeo(pos, o);
}

/** A gabled roof (ridge along the box's long side) and its two gable-end walls. */
function gableRoof(o: Obb, y: number, trims: THREE.BufferGeometry[], wall: THREE.Color) {
  const e = 0.35;
  const long = o.hw >= o.hd;
  const ux = long ? o.ux : -o.uz;
  const uz = long ? o.uz : o.ux;
  const hw = (long ? o.hw : o.hd) + e;
  const hd = (long ? o.hd : o.hw) + e;
  const vx = -uz;
  const vz = ux;
  const rise = (hd - e) * 0.55;
  const P = (a: number, b: number, h: number) => [o.x + ux * a + vx * b, y + h, o.z + uz * a + vz * b];
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  const r0 = P(-hw, 0, rise);
  const r1 = P(hw, 0, rise);
  tri(P(-hw, -hd, 0), P(hw, -hd, 0), r1);
  tri(P(-hw, -hd, 0), r1, r0);
  tri(P(hw, hd, 0), P(-hw, hd, 0), r0);
  tri(P(hw, hd, 0), r0, r1);
  const ends = new THREE.BufferGeometry();
  const w = hw - e;
  const d = hd - e;
  ends.setAttribute("position", new THREE.Float32BufferAttribute([...P(-w, -d, 0), ...P(-w, d, 0), ...P(-w, 0, rise), ...P(w, d, 0), ...P(w, -d, 0), ...P(w, 0, rise)], 3));
  ends.computeVertexNormals();
  trims.push(paint(ends, wall.clone()));
  return roofGeo(pos, o);
}

/** A factory's sawtooth roof over its box: teeth across the long side, glazing in the risers. */
function sawtooth(o: Obb, y: number, col: THREE.Color, trims: THREE.BufferGeometry[], wallCol: string) {
  const long = o.hw >= o.hd;
  const ux = long ? o.ux : -o.uz;
  const uz = long ? o.uz : o.ux;
  const hw = long ? o.hw : o.hd;
  const hd = long ? o.hd : o.hw;
  const vx = -uz;
  const vz = ux;
  const P = (a: number, b: number, h: number) => [o.x + ux * a + vx * b, y + h, o.z + uz * a + vz * b];
  const n = Math.max(1, Math.round((hw * 2) / 7));
  const w = (hw * 2) / n;
  const rise = Math.min(3, w * 0.45);
  const pos: number[] = [];
  const glass: number[] = [];
  const ends: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = -hw + k * w;
    const c = a + w;
    pos.push(...P(a, -hd, 0), ...P(c, -hd, rise), ...P(c, hd, rise), ...P(a, -hd, 0), ...P(c, hd, rise), ...P(a, hd, 0));
    glass.push(...P(c, -hd, 0), ...P(c, hd, 0), ...P(c, hd, rise), ...P(c, -hd, 0), ...P(c, hd, rise), ...P(c, -hd, rise));
    ends.push(...P(a, -hd, 0), ...P(c, -hd, 0), ...P(c, -hd, rise), ...P(c, hd, 0), ...P(a, hd, 0), ...P(c, hd, rise));
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute("position", new THREE.Float32BufferAttribute(ends, 3));
  eg.computeVertexNormals();
  trims.push(paint(eg, wallCol));
  const gg = new THREE.BufferGeometry();
  gg.setAttribute("position", new THREE.Float32BufferAttribute(glass, 3));
  gg.computeVertexNormals();
  trims.push(paint(gg, "#3a4a58"));
  return [paint(roofGeo(pos, o), col)];
}

/** Roof UVs in metres: u along the box's long axis (across the corrugations), v up the slope. */
function roofGeo(pos: number[], o: Obb) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const a = (pos[i] - o.x) * o.ux + (pos[i + 2] - o.z) * o.uz;
    const b = -(pos[i] - o.x) * o.uz + (pos[i + 2] - o.z) * o.ux;
    uv.push(a, b + pos[i + 1]);
  }
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A parapet: a low wall round the roof's edge, in the wall colour. */
function parapet(trims: THREE.BufferGeometry[], ring: Float32Array, y: number, h: number, color: string) {
  const n = ring.length / 2;
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2];
    const az = ring[i * 2 + 1];
    const bx = ring[j * 2];
    const bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.3) continue;
    const nx = (bz - az) / len;
    const nz = -(bx - ax) / len;
    const t = 0.3;
    // Outside face, top, inside face (double-sided material, so the winding doesn't matter).
    pos.push(ax, y, az, bx, y, bz, bx, y + h, bz, ax, y, az, bx, y + h, bz, ax, y + h, az);
    pos.push(ax, y + h, az, bx, y + h, bz, bx - nx * t, y + h, bz - nz * t, ax, y + h, az, bx - nx * t, y + h, bz - nz * t, ax - nx * t, y + h, az - nz * t);
    pos.push(ax - nx * t, y, az - nz * t, bx - nx * t, y, bz - nz * t, bx - nx * t, y + h, bz - nz * t, ax - nx * t, y, az - nz * t, bx - nx * t, y + h, bz - nz * t, ax - nx * t, y + h, az - nz * t);
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  trims.push(paint(g, color));
}

/**
 * A verandah along the street front: a sloping iron roof falling away from the wall, slender
 * cast-iron posts, a lace frieze under the eave, a balustrade upstairs, wing walls on terraces.
 */
function verandah(b: Building, levels: number[], depth: number, iron: THREE.BufferGeometry[], trims: THREE.BufferGeometry[], laces: THREE.BufferGeometry[], accent: THREE.Color, wall: THREE.Color) {
  const f = b.front!;
  const tx = (f.bx - f.ax) / f.len;
  const tz = (f.bz - f.az) / f.len;
  const wx = (f.ax + f.bx) / 2;
  const wz = (f.az + f.bz) / 2;
  const fx = f.nx;
  const fz = f.nz;
  const L = f.len / 2 - 0.15;
  const roofCol = new THREE.Color(b.id % 3 === 0 ? "#b8bcc0" : b.id % 3 === 1 ? "#5d7a5a" : "#8a8f94");
  const ac = `#${accent.getHexString()}`;
  const ry = Math.atan2(-tz, tx);
  levels.forEach((H, li) => {
    const a = [wx - tx * L, H + 0.45, wz - tz * L];
    const bb = [wx + tx * L, H + 0.45, wz + tz * L];
    const c = [wx + tx * L + fx * depth, H, wz + tz * L + fz * depth];
    const d = [wx - tx * L + fx * depth, H, wz - tz * L + fz * depth];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...d, ...c, ...a, ...c, ...bb], 3));
    g.computeVertexNormals();
    const uv: number[] = [];
    for (const p of [a, d, c, a, c, bb]) uv.push((p[0] - wx) * tx + (p[2] - wz) * tz, (p[0] - wx) * fx + (p[2] - wz) * fz);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    iron.push(paint(g, roofCol));
    const base = li ? levels[li - 1] + 0.1 : 0;
    const posts = Math.max(2, Math.round(f.len / 2.8) + 1);
    for (let i = 0; i < posts; i++) {
      const s = -L + (2 * L * i) / (posts - 1);
      trims.push(cyl(0.06, 0.06, H - base, ac, wx + tx * s + fx * (depth - 0.12), base, wz + tz * s + fz * (depth - 0.12), 6));
    }
    const fr = new THREE.PlaneGeometry(2 * L, 0.42).toNonIndexed();
    const fuv = fr.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < fuv.count; i++) fuv.setX(i, fuv.getX(i) * ((2 * L) / 1.2));
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
      trims.push(box(2 * L, 0.15, depth, "#8a6a48", wx + fx * (depth / 2), levels[li - 1] + 0.45, wz + fz * (depth / 2), ry));
    }
  });
  if (b.kind === "terrace") {
    const topY = levels[levels.length - 1] + 0.5;
    for (const s of [-1, 1]) trims.push(box(0.25, topY, depth, `#${wall.getHexString()}`, wx + tx * s * (f.len / 2 - 0.12) + fx * (depth / 2), 0, wz + tz * s * (f.len / 2 - 0.12) + fz * (depth / 2), ry));
  }
}

export { WHITE };
