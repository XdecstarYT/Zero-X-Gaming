import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SportsPipeline, canvasTexture } from "../sports-kit/pipeline";
import type { Detail } from "../sports-kit/look";
import { upperFacade, shingleTexture, UPPER, type FacadeSet } from "../code-3/facades";
import {
  grassTexture,
  asphaltTexture,
  concreteTexture,
  puffTexture,
  setTextureDetail,
} from "../neon-siege/three/textures";
import {
  connected,
  idx,
  N,
  SERVICES,
  TILE,
  tileAt,
  xy,
  type City,
  type Maps,
  type ServiceKind,
  type Tile,
  type Zone,
} from "./logic";

/**
 * Zenith in 3D: the city under a physical sky. Roads are textured asphalt
 * with markings, sidewalks and streetlights; buildings wear the photoreal
 * PBR facades (their windows light up at night) and are merged per 8×8
 * district so a big city stays a few hundred draw calls; trees, traffic and
 * chimney smoke are instanced or pooled.
 */

const HALF = (N * TILE) / 2;
const CHUNK = 8;
/** World centre of a tile. */
export const tileX = (x: number) => (x + 0.5) * TILE - HALF;
export const tileZ = (y: number) => (y + 0.5) * TILE - HALF;

export type Overlay = "none" | "power" | "value" | "pollution" | "police" | "fire" | "health" | "school";

export interface Ghost {
  tiles: { x: number; y: number }[];
  ok: boolean;
  kind: "road" | "zone" | "service" | "bulldoze";
  zone?: Zone | null;
}

type FacadeKind = "house" | "tower" | "office" | "store" | "warehouse";

const ZONE_COLOR: Record<Zone, string> = { R: "#4ade80", C: "#60a5fa", I: "#facc15" };

/** A box's four walls with UVs in facade tiles, so windows land at the right size on every building. */
function walls(w: number, h: number, d: number, kind: FacadeKind, y0 = 0) {
  const L = UPPER[kind];
  const tw = L.bayW * L.bays;
  const th = L.floorH * L.floors;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const quad = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number, len: number) => {
    const u1 = len / tw;
    const v0 = y0 / th;
    const v1 = (y0 + h) / th;
    pos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0, az, bx, y0 + h, bz, ax, y0 + h, az);
    for (let i = 0; i < 6; i++) nor.push(nx, 0, nz);
    uv.push(0, v0, u1, v0, u1, v1, 0, v0, u1, v1, 0, v1);
  };
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  quad(x0, z1, x1, z1, 0, 1, w);
  quad(x1, z1, x1, z0, 1, 0, d);
  quad(x1, z0, x0, z0, 0, -1, w);
  quad(x0, z0, x0, z1, -1, 0, d);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A pitched roof over a w×d footprint, ridge along x. */
function gable(w: number, d: number, rise: number, y0: number) {
  const g = new THREE.BufferGeometry();
  const x0 = -w / 2 - 0.4;
  const x1 = w / 2 + 0.4;
  const z0 = -d / 2 - 0.4;
  const z1 = d / 2 + 0.4;
  const top = y0 + rise;
  // Two slopes and two gable ends.
  const p = [
    x0,
    y0,
    z1,
    x1,
    y0,
    z1,
    x1,
    top,
    0,
    x0,
    y0,
    z1,
    x1,
    top,
    0,
    x0,
    top,
    0,
    x1,
    y0,
    z0,
    x0,
    y0,
    z0,
    x0,
    top,
    0,
    x1,
    y0,
    z0,
    x0,
    top,
    0,
    x1,
    top,
    0,
    x0,
    y0,
    z0,
    x0,
    y0,
    z1,
    x0,
    top,
    0,
    x1,
    y0,
    z1,
    x1,
    y0,
    z0,
    x1,
    top,
    0,
  ];
  const s = Math.hypot(d / 2, rise) / 4;
  const uv = [
    0,
    0,
    w / 4,
    0,
    w / 4,
    s,
    0,
    0,
    w / 4,
    s,
    0,
    s,
    0,
    0,
    w / 4,
    0,
    w / 4,
    s,
    0,
    0,
    w / 4,
    s,
    0,
    s,
    0,
    0,
    d / 4,
    0,
    d / 8,
    rise / 4,
    0,
    0,
    d / 4,
    0,
    d / 8,
    rise / 4,
  ];
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r: number, h: number, x = 0, y = 0, z = 0, seg = 16, r2 = r) =>
  new THREE.CylinderGeometry(r2, r, h, seg).translate(x, y + h / 2, z);

/** Hash for stable variety. */
const h01 = (n: number) => (((n * 2654435761) >>> 0) % 10000) / 10000;

export class CityView {
  readonly pipe: SportsPipeline;
  readonly canvas: HTMLCanvasElement;
  target = new THREE.Vector3(-HALF + 9 * TILE, 0, 0);
  yaw = -0.6;
  pitch = 0.78;
  dist = 170;
  private time = 0;
  /** 0 by day, 1 at night. */
  private night = 0;
  private P: number;
  private mats = new Map<string, THREE.Material>();
  private facades = new Map<string, FacadeSet>();
  private chunks = new Map<number, { key: string; group: THREE.Group }>();
  private roads = new THREE.Group();
  private roadKey = "";
  private zones: THREE.Mesh | null = null;
  private zoneKey = "";
  private water = new THREE.Group();
  private trees: THREE.Group = new THREE.Group();
  private treeKey = "";
  private lamps: THREE.InstancedMesh | null = null;
  private lampHeads: THREE.InstancedMesh | null = null;
  private cars: THREE.InstancedMesh;
  private carAgents: { from: number; to: number; t: number; speed: number; prev: number }[] = [];
  private roadSet: number[] = [];
  private roadLookup = new Set<number>();
  private turbines: THREE.Object3D[] = [];
  private chimneys: THREE.Vector3[] = [];
  private smoke: { s: THREE.Sprite; life: number; at: THREE.Vector3 }[] = [];
  private overlay: THREE.Mesh;
  private overlayTex: THREE.DataTexture;
  private ghost = new THREE.Group();
  private cursor: THREE.Mesh;
  private sky: THREE.Mesh | null = null;
  private waterNormal: THREE.Texture;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  photo = false;

  constructor(
    host: HTMLElement,
    readonly detail: Detail,
  ) {
    setTextureDetail(detail === "low" ? "low" : "high");
    this.P = detail === "low" ? 12 : detail === "high" ? 20 : 28;
    this.pipe = new SportsPipeline(host, detail, "day", { fov: 38, shadowSpan: 160, far: 6000 });
    this.pipe.lights([], { fog: 0.0006 });
    this.canvas = this.pipe.canvas;
    const scene = this.pipe.scene;
    this.sky =
      (scene.children.find(
        (o) => ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms?.sunPosition,
      ) as THREE.Mesh) ?? null;
    this.pipe.key.shadow.camera.far = 900;

    // The land: grass out to the horizon, a little darker beyond the city.
    const grass = grassTexture(256);
    for (const t of [grass.map, grass.normal]) if (t) t.repeat.set(N * 2, N * 2);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(N * TILE, N * TILE).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normal, roughness: 0.95 }),
    );
    ground.receiveShadow = true;
    const outer = grassTexture(256);
    for (const t of [outer.map, outer.normal]) if (t) t.repeat.set(160, 160);
    const far = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2).translate(0, -0.05, 0),
      new THREE.MeshStandardMaterial({ map: outer.map, color: "#9bb07f", roughness: 1 }),
    );
    far.receiveShadow = true;
    scene.add(far, ground, this.roads, this.water, this.trees, this.ghost);

    // Water ripples (a tiling normal map, scrolled).
    this.waterNormal = canvasTexture(
      256,
      256,
      (g) => {
        const img = g.createImageData(256, 256);
        for (let y = 0; y < 256; y++)
          for (let x = 0; x < 256; x++) {
            const a = Math.sin((x / 256) * Math.PI * 8 + Math.sin((y / 256) * Math.PI * 4) * 1.5);
            const b = Math.cos((y / 256) * Math.PI * 6 + Math.sin((x / 256) * Math.PI * 2));
            const i = (y * 256 + x) * 4;
            img.data[i] = 128 + a * 40;
            img.data[i + 1] = 128 + b * 40;
            img.data[i + 2] = 255;
            img.data[i + 3] = 255;
          }
        g.putImageData(img, 0, 0);
      },
      true,
    );
    this.waterNormal.colorSpace = THREE.NoColorSpace;

    // Traffic: one instanced mesh of little cars.
    const car = mergeGeometries(
      [box(2, 0.8, 4.2, 0, 0.25, 0), box(1.7, 0.6, 2.2, 0, 1.05, -0.2)].map((g) => g.toNonIndexed()),
    )!;
    this.cars = new THREE.InstancedMesh(car, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5 }), 260);
    this.cars.count = 0;
    this.cars.castShadow = detail !== "low";
    scene.add(this.cars);

    // Data overlays: one texel a tile.
    this.overlayTex = new THREE.DataTexture(new Uint8Array(N * N * 4), N, N, THREE.RGBAFormat);
    this.overlayTex.magFilter = THREE.NearestFilter;
    this.overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(N * TILE, N * TILE).rotateX(-Math.PI / 2).translate(0, 0.6, 0),
      new THREE.MeshBasicMaterial({ map: this.overlayTex, transparent: true, opacity: 0.62, depthWrite: false }),
    );
    this.overlay.visible = false;
    this.overlay.renderOrder = 5;
    scene.add(this.overlay);

    this.cursor = new THREE.Mesh(
      new THREE.BoxGeometry(TILE, 0.3, TILE),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.cursor.visible = false;
    scene.add(this.cursor);
  }

  // -------------------------------------------------------------- materials

  private mat(key: string, make: () => THREE.Material) {
    let m = this.mats.get(key);
    if (!m) {
      m = make();
      this.mats.set(key, m);
    }
    return m;
  }

  private std(color: string, rough = 0.7, metal = 0) {
    return this.mat(
      `s${color}${rough}${metal}`,
      () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }),
    );
  }

  private glow(color: string, k = 1.5) {
    return this.mat(
      `g${color}${k}`,
      () => new THREE.MeshStandardMaterial({ color: "#222", emissive: color, emissiveIntensity: k, roughness: 0.4 }),
    );
  }

  /** A photoreal facade (its windows light at night); abandoned ones go dark and dusty. */
  private facade(kind: FacadeKind, style: number, abandoned = false) {
    const key = `f${kind}${style}${abandoned}`;
    return this.mat(key, () => {
      const fk = `${kind}${style}`;
      let f = this.facades.get(fk);
      if (!f) {
        f = upperFacade(kind, style, this.P, true);
        for (const t of [f.map, f.lit, f.rm, f.normal]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        this.facades.set(fk, f);
      }
      return new THREE.MeshStandardMaterial({
        map: f.map,
        normalMap: f.normal,
        roughnessMap: f.rm,
        metalnessMap: f.rm,
        roughness: 1,
        metalness: 1,
        emissiveMap: abandoned ? null : f.lit,
        emissive: abandoned ? "#000000" : "#ffd7a1",
        emissiveIntensity: 0,
        color: abandoned ? "#6b6b6b" : "#ffffff",
      });
    });
  }

  private roof() {
    return this.mat("roofshingle", () => {
      const s = shingleTexture(this.P);
      for (const t of [s.map, s.normal]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normal, roughness: 0.85, color: "#9a7c6a" });
    });
  }

  // --------------------------------------------------------------- the world

  /** Bring the 3D city in line with the data (only what changed is rebuilt). */
  sync(c: City) {
    this.syncWater(c);
    this.syncRoads(c);
    this.syncZones(c);
    this.syncTrees(c);
    for (let cy = 0; cy < N / CHUNK; cy++) for (let cx = 0; cx < N / CHUNK; cx++) this.syncChunk(c, cx, cy);
  }

  private syncWater(c: City) {
    if (this.water.children.length) return;
    const quads: THREE.BufferGeometry[] = [];
    const banks: THREE.BufferGeometry[] = [];
    c.tiles.forEach((t, i) => {
      const { x, y } = xy(i);
      if (t.water)
        quads.push(new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2).translate(tileX(x), 0.08, tileZ(y)));
      else if (
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => tileAt(c, x + dx, y + dy)?.water)
      )
        banks.push(new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2).translate(tileX(x), 0.03, tileZ(y)));
    });
    if (quads.length) {
      this.waterNormal.repeat.set(4, 4);
      const w = new THREE.Mesh(
        mergeGeometries(quads)!,
        new THREE.MeshPhysicalMaterial({
          color: "#1d4a57",
          roughness: 0.06,
          metalness: 0.1,
          normalMap: this.waterNormal,
          normalScale: new THREE.Vector2(0.25, 0.25),
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          envMapIntensity: 1.4,
        }),
      );
      w.receiveShadow = true;
      this.water.add(w);
    }
    if (banks.length) this.water.add(new THREE.Mesh(mergeGeometries(banks)!, this.std("#b9a37a", 1)));
  }

  private syncRoads(c: City) {
    const key = c.tiles.map((t) => (t.road ? 1 : 0)).join("");
    if (key === this.roadKey) return;
    this.roadKey = key;
    for (const o of [...this.roads.children]) {
      this.roads.remove(o);
      (o as THREE.Mesh).geometry?.dispose();
    }
    if (this.lamps) {
      this.pipe.scene.remove(this.lamps, this.lampHeads!);
      this.lamps.dispose();
      this.lampHeads!.dispose();
    }
    const asphalt: THREE.BufferGeometry[] = [];
    const lines: THREE.BufferGeometry[] = [];
    const edges: THREE.BufferGeometry[] = [];
    const walks: THREE.BufferGeometry[] = [];
    const decks: THREE.BufferGeometry[] = [];
    const lampAt: THREE.Vector3[] = [];
    const isRoad = (x: number, y: number) => !!tileAt(c, x, y)?.road;
    const W = TILE * 0.72;
    c.tiles.forEach((t, i) => {
      if (!t.road) return;
      const { x, y } = xy(i);
      const X = tileX(x);
      const Z = tileZ(y);
      const lift = t.water ? 1.6 : 0.1;
      const e = isRoad(x + 1, y);
      const wv = isRoad(x - 1, y);
      const s = isRoad(x, y + 1);
      const nn = isRoad(x, y - 1);
      // The carriageway: the middle square plus an arm to each connected neighbour.
      asphalt.push(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2).translate(X, lift, Z));
      const arm = (TILE - W) / 2;
      if (e)
        asphalt.push(new THREE.PlaneGeometry(arm, W).rotateX(-Math.PI / 2).translate(X + W / 2 + arm / 2, lift, Z));
      if (wv)
        asphalt.push(new THREE.PlaneGeometry(arm, W).rotateX(-Math.PI / 2).translate(X - W / 2 - arm / 2, lift, Z));
      if (s)
        asphalt.push(new THREE.PlaneGeometry(W, arm).rotateX(-Math.PI / 2).translate(X, lift, Z + W / 2 + arm / 2));
      if (nn)
        asphalt.push(new THREE.PlaneGeometry(W, arm).rotateX(-Math.PI / 2).translate(X, lift, Z - W / 2 - arm / 2));
      // Centre lines: dashed on straights.
      const straightX = (e || wv) && !s && !nn;
      const straightZ = (s || nn) && !e && !wv;
      if (straightX)
        for (const dx of [-3.5, 3.5])
          lines.push(new THREE.PlaneGeometry(2.4, 0.22).rotateX(-Math.PI / 2).translate(X + dx, lift + 0.02, Z));
      if (straightZ)
        for (const dz of [-3.5, 3.5])
          lines.push(new THREE.PlaneGeometry(0.22, 2.4).rotateX(-Math.PI / 2).translate(X, lift + 0.02, Z + dz));
      if (t.highway)
        for (const dz of [-W / 2 + 0.4, W / 2 - 0.4])
          edges.push(new THREE.PlaneGeometry(TILE, 0.25).rotateX(-Math.PI / 2).translate(X, lift + 0.02, Z + dz));
      // Sidewalks on the sides with no road, and a streetlight now and then.
      const side = (dx: number, dz: number) => {
        const along = dx === 0;
        const g = box(
          along ? TILE : 1.6,
          0.18,
          along ? 1.6 : TILE,
          X + dx * (W / 2 + 0.8),
          lift,
          Z + dz * (W / 2 + 0.8),
        );
        (t.water ? decks : walks).push(g);
      };
      if (!e) side(1, 0);
      if (!wv) side(-1, 0);
      if (!s) side(0, 1);
      if (!nn) side(0, -1);
      if (t.water) decks.push(box(TILE, 1.4, W + 3.2, X, lift - 1.45, Z).rotateY(straightZ ? Math.PI / 2 : 0));
      if ((x + y) % 2 === 0 && !t.water) {
        if (!s) lampAt.push(new THREE.Vector3(X + 3, 0, Z + W / 2 + 1));
        else if (!e) lampAt.push(new THREE.Vector3(X + W / 2 + 1, 0, Z + 3));
      }
    });
    const tex = asphaltTexture(256);
    for (const t2 of [tex.map, tex.normal]) if (t2) t2.repeat.set(1, 1);
    const add = (geos: THREE.BufferGeometry[], m: THREE.Material, shadow = true) => {
      if (!geos.length) return;
      const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => g.toNonIndexed()))!, m);
      mesh.receiveShadow = true;
      mesh.castShadow = shadow && this.detail !== "low";
      this.roads.add(mesh);
    };
    add(
      asphalt,
      this.mat(
        "asphalt",
        () => new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normal, roughness: 0.9, color: "#9a9a9a" }),
      ),
      false,
    );
    add(
      lines,
      this.mat("line", () => new THREE.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.6 })),
      false,
    );
    add(
      edges,
      this.mat("edge", () => new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.6 })),
      false,
    );
    const conc = concreteTexture(128);
    add(
      walks,
      this.mat("walk", () => new THREE.MeshStandardMaterial({ map: conc.map, roughness: 0.85, color: "#d4d4d0" })),
    );
    add(decks, this.std("#a8a29e", 0.8));
    // Streetlights: a pole and a lamp, instanced.
    this.lamps = new THREE.InstancedMesh(cyl(0.12, 6.5), this.std("#3f3f46", 0.5, 0.6), Math.max(1, lampAt.length));
    this.lampHeads = new THREE.InstancedMesh(
      box(0.9, 0.25, 0.45, 0, 6.4),
      this.mat(
        "lamp",
        () => new THREE.MeshStandardMaterial({ color: "#555", emissive: "#ffe2a8", emissiveIntensity: 0 }),
      ),
      Math.max(1, lampAt.length),
    );
    const m4 = new THREE.Matrix4();
    lampAt.forEach((p, i) => {
      m4.makeTranslation(p.x, p.y, p.z);
      this.lamps!.setMatrixAt(i, m4);
      this.lampHeads!.setMatrixAt(i, m4);
    });
    this.lamps.count = this.lampHeads.count = lampAt.length;
    this.pipe.scene.add(this.lamps, this.lampHeads);
    // The traffic graph.
    const live = connected(c);
    this.roadSet = [...live];
    this.roadLookup = live;
    this.carAgents = this.carAgents.filter((a) => live.has(a.from) && live.has(a.to));
  }

  private syncZones(c: City) {
    const key = c.tiles.map((t) => (t.zone && !t.bld ? t.zone + t.density[0] : "-")).join("");
    if (key === this.zoneKey) return;
    this.zoneKey = key;
    if (this.zones) {
      this.pipe.scene.remove(this.zones);
      this.zones.geometry.dispose();
      this.zones = null;
    }
    const geos: THREE.BufferGeometry[] = [];
    const col = new THREE.Color();
    c.tiles.forEach((t, i) => {
      if (!t.zone || t.bld) return;
      const { x, y } = xy(i);
      const g = new THREE.PlaneGeometry(TILE - 1.2, TILE - 1.2)
        .rotateX(-Math.PI / 2)
        .translate(tileX(x), 0.12, tileZ(y))
        .toNonIndexed();
      col.set(ZONE_COLOR[t.zone]);
      if (t.density === "high") col.offsetHSL(0, 0, -0.15);
      const cs = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < cs.length; k += 3) cs.set([col.r, col.g, col.b], k);
      g.setAttribute("color", new THREE.BufferAttribute(cs, 3));
      geos.push(g);
    });
    if (!geos.length) return;
    this.zones = new THREE.Mesh(
      mergeGeometries(geos)!,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.pipe.scene.add(this.zones);
  }

  private syncTrees(c: City) {
    const key = c.tiles.map((t) => (t.tree ? 1 : t.svc === "park" ? 2 : 0)).join("");
    if (key === this.treeKey) return;
    this.treeKey = key;
    for (const o of [...this.trees.children]) {
      this.trees.remove(o);
      (o as THREE.InstancedMesh).dispose?.();
    }
    const spots: { x: number; z: number; s: number; tint: number }[] = [];
    c.tiles.forEach((t, i) => {
      if (!t.tree && t.svc !== "park") return;
      const { x, y } = xy(i);
      const n = t.svc === "park" ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const r = h01(i * 7 + k * 131);
        const r2 = h01(i * 13 + k * 71);
        spots.push({
          x: tileX(x) + (r - 0.5) * TILE * 0.8,
          z: tileZ(y) + (r2 - 0.5) * TILE * 0.8,
          s: 0.8 + h01(i + k * 3) * 0.7,
          tint: h01(i * 3 + k),
        });
      }
    });
    if (!spots.length) return;
    const trunks = new THREE.InstancedMesh(cyl(0.35, 4, 0, 0, 0, 6, 0.25), this.std("#5b4636", 0.9), spots.length);
    const crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(2.6, 1).translate(0, 5.6, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
      spots.length,
    );
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    spots.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(0, p.tint * 6, 0));
      m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      trunks.setMatrixAt(i, m4);
      crowns.setMatrixAt(i, m4);
      crowns.setColorAt(i, col.setHSL(0.24 + p.tint * 0.1, 0.45, 0.22 + p.tint * 0.1));
    });
    for (const m of [trunks, crowns]) {
      m.castShadow = this.detail !== "low";
      m.receiveShadow = true;
      this.trees.add(m);
    }
  }

  /** One 8×8 district: every building and service in it, merged by material. */
  private syncChunk(c: City, cx: number, cy: number) {
    const id = cy * 100 + cx;
    let key = "";
    for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++)
      for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
        const t = c.tiles[idx(x, y)];
        key += t.svc
          ? `s${t.svc}`
          : t.bld
            ? `${t.zone}${t.density[0]}${t.bld.level}${t.bld.style % 6}${t.bld.abandoned ? "a" : ""}`
            : "-";
      }
    const old = this.chunks.get(id);
    if (old?.key === key) return;
    if (old) {
      this.pipe.scene.remove(old.group);
      old.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (m: THREE.Material, g: THREE.BufferGeometry, x: number, z: number, rot = 0) => {
      const gg = g.toNonIndexed().rotateY(rot).translate(x, 0, z);
      if (!gg.attributes.uv)
        gg.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      const list = byMat.get(m) ?? [];
      list.push(gg);
      byMat.set(m, list);
    };
    const group = new THREE.Group();
    this.chimneys = this.chimneys.filter(
      (p) => Math.floor((p.x + HALF) / TILE / CHUNK) !== cx || Math.floor((p.z + HALF) / TILE / CHUNK) !== cy,
    );
    this.turbines = this.turbines.filter((t) => {
      const keep =
        Math.floor((t.position.x + HALF) / TILE / CHUNK) !== cx ||
        Math.floor((t.position.z + HALF) / TILE / CHUNK) !== cy;
      if (!keep) this.pipe.scene.remove(t);
      return keep;
    });
    for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++)
      for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
        const t = c.tiles[idx(x, y)];
        const X = tileX(x);
        const Z = tileZ(y);
        // Face the nearest road.
        const rot = tileAt(c, x, y + 1)?.road
          ? 0
          : tileAt(c, x + 1, y)?.road
            ? Math.PI / 2
            : tileAt(c, x, y - 1)?.road
              ? Math.PI
              : tileAt(c, x - 1, y)?.road
                ? -Math.PI / 2
                : 0;
        if (t.svc) this.service(t.svc, X, Z, rot, put, group);
        else if (t.bld && t.zone) this.building(t, idx(x, y), X, Z, rot, put);
      }
    for (const [m, list] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(list)!, m);
      mesh.castShadow = this.detail !== "low";
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.pipe.scene.add(group);
    this.chunks.set(id, { key, group });
  }

  private building(
    t: Tile,
    i: number,
    X: number,
    Z: number,
    rot: number,
    put: (m: THREE.Material, g: THREE.BufferGeometry, x: number, z: number, r?: number) => void,
  ) {
    const b = t.bld!;
    const v = h01(b.style * 31 + i);
    const st = b.style % 3;
    const ab = b.abandoned;
    const lv = b.level;
    if (t.zone === "R" && t.density === "low") {
      // A house: one or two storeys under a pitched roof, a little bigger with each level.
      const w = 6.5 + lv * 0.8 + v;
      const d = 6 + lv * 0.5;
      const h = lv === 1 ? 3 : 5.6;
      put(this.facade("house", st, ab), walls(w, h, d, "house"), X, Z, rot);
      put(this.roof(), gable(w, d, 2.4, h), X, Z, rot);
      put(this.std("#e7e5e4", 0.8), box(1.6, 0.05, 2.5, 0, 0, d / 2 + 1.2), X, Z, rot);
    } else if (t.zone === "R") {
      // Apartments: towers that climb with the level.
      const h = [16, 32, 58][lv - 1] + Math.round(v * 3) * 3.6;
      const w = 9.5;
      put(this.facade("tower", st, ab), walls(w, h, w, "tower"), X, Z, rot);
      put(this.std("#57534e", 0.8), box(w + 0.3, 0.6, w + 0.3, 0, h), X, Z, rot);
      if (lv > 1) put(this.std("#a8a29e", 0.6), box(3, 2.4, 3, 1.5, h + 0.6, -1.5), X, Z, rot);
    } else if (t.zone === "C" && t.density === "low") {
      // Shops: low, wide, a canopy over the door.
      const h = 5 + lv * 2 + v * 2;
      put(this.facade("store", st, ab), walls(10, h, 9, "store"), X, Z, rot);
      put(this.std("#44403c", 0.9), box(10.2, 0.5, 9.2, 0, h), X, Z, rot);
      put(
        this.std(["#dc2626", "#2563eb", "#16a34a", "#f59e0b"][b.style % 4], 0.5),
        box(10.4, 0.4, 1.6, 0, 3.4, 5.2),
        X,
        Z,
        rot,
      );
    } else if (t.zone === "C") {
      // Offices: glass towers.
      const h = [24, 48, 84][lv - 1] + Math.round(v * 4) * 3.4;
      const w = 10;
      put(this.facade("office", st, ab), walls(w, h, w, "office"), X, Z, rot);
      put(this.std("#3f3f46", 0.6, 0.4), box(w + 0.2, 0.8, w + 0.2, 0, h), X, Z, rot);
      if (lv === 3) put(this.std("#a1a1aa", 0.4, 0.8), cyl(0.15, 10, 0, h + 0.8, 0, 6), X, Z, rot);
    } else {
      // Industry: a shed with a sawtooth roof at the back of a concrete yard, tanks out front, a chimney that smokes.
      const h = 5 + lv * 2;
      const w = 7.5 + v * 2.5;
      const d = 6.5 + (1 - v) * 1.5;
      const back = -(TILE - 0.6 - d) / 2 + 0.3;
      put(this.std("#9ca3af", 0.95), box(TILE - 0.6, 0.06, TILE - 0.6), X, Z, rot);
      put(this.facade("warehouse", st, ab), walls(w, h, d, "warehouse").translate(0, 0, back), X, Z, rot);
      const roof = this.std(ab ? "#6b7280" : ["#cbd5e1", "#b4bcc6", "#d6d3d1"][st], 0.45, 0.6);
      const teeth = 3;
      for (let k = 0; k < teeth; k++)
        put(
          roof,
          gable(w - 0.8, d / teeth - 0.8, 1.3, h).translate(0, 0, back - d / 2 + (k + 0.5) * (d / teeth)),
          X,
          Z,
          rot,
        );
      put(this.std("#4b5563", 0.8), box(w + 0.2, 0.3, d + 0.2, 0, h - 0.3, back), X, Z, rot);
      if (lv > 1) {
        const tank = this.std("#e5e7eb", 0.35, 0.7);
        put(tank, cyl(1.3, 3.2 + lv, -3, 0, 3.4, 14), X, Z, rot);
        put(tank, cyl(1.3, 3.2 + lv, 0, 0, 3.4, 14), X, Z, rot);
      } else put(this.std("#92400e", 0.8), box(2.4, 1.2, 1.6, -3, 0, 3.6), X, Z, rot);
      if (!ab) {
        put(this.std("#78716c", 0.8), cyl(0.6, h + 6, w / 2 - 1.2, 0, back - d / 2 + 1.2, 12, 0.45), X, Z, rot);
        put(this.std("#b91c1c", 0.7), cyl(0.62, 0.8, w / 2 - 1.2, h + 4.6, back - d / 2 + 1.2, 12), X, Z, rot);
        const p = new THREE.Vector3(w / 2 - 1.2, h + 6.5, back - d / 2 + 1.2)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), rot)
          .add(new THREE.Vector3(X, 0, Z));
        this.chimneys.push(p);
      }
    }
  }

  private service(
    k: ServiceKind,
    X: number,
    Z: number,
    rot: number,
    put: (m: THREE.Material, g: THREE.BufferGeometry, x: number, z: number, r?: number) => void,
    group: THREE.Group,
  ) {
    const white = this.std("#f5f5f4", 0.7);
    const grey = this.std("#a8a29e", 0.8);
    const pad = this.std("#9ca3af", 0.9);
    put(pad, box(TILE - 0.6, 0.15, TILE - 0.6), X, Z);
    switch (k) {
      case "coal": {
        put(this.std("#78716c", 0.8), box(8, 9, 6, -1, 0.15, 1), X, Z, rot);
        const tower = new THREE.LatheGeometry(
          [0, 0.1, 0.4, 0.7, 1].map((t, i) => new THREE.Vector2([3.6, 3, 2.4, 2.6, 2.9][i], t * 14)),
          20,
        );
        put(this.std("#d6d3d1", 0.9), tower, X + 2.5, Z - 3, 0);
        put(this.std("#57534e", 0.8), cyl(0.7, 22, -3.5, 0.15, -3.5), X, Z, rot);
        this.chimneys.push(
          new THREE.Vector3(-3.5, 22.5, -3.5)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), rot)
            .add(new THREE.Vector3(X, 0, Z)),
        );
        this.chimneys.push(new THREE.Vector3(X + 2.5, 14.5, Z - 3));
        break;
      }
      case "wind": {
        put(white, cyl(0.45, 26, 0, 0, 0, 12, 0.3), X, Z);
        const rotor = new THREE.Group();
        const blade = new THREE.Mesh(box(0.6, 11, 0.25, 0, 0, 0), white);
        for (let i = 0; i < 3; i++) {
          const b = blade.clone();
          b.rotation.z = (i * Math.PI * 2) / 3;
          rotor.add(b);
        }
        rotor.add(new THREE.Mesh(box(1, 1, 2, 0, -0.5, 0), white));
        rotor.position.set(X, 26, Z + 0.8);
        rotor.castShadow = true;
        this.pipe.scene.add(rotor);
        this.turbines.push(rotor);
        break;
      }
      case "solar":
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 2; c++)
            put(
              this.std("#1e3a8a", 0.25, 0.6),
              box(4.6, 0.15, 2.4, -2.6 + c * 5.2, 1.1, -3.4 + r * 3.4).rotateX(-0.35),
              X,
              Z,
            );
        break;
      case "tower":
        for (const [a, b] of [
          [-2, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
        ])
          put(grey, cyl(0.25, 12, a, 0.15, b, 6), X, Z);
        put(this.std("#e2e8f0", 0.5, 0.4), cyl(3.4, 5, 0, 12, 0, 20, 3), X, Z);
        put(this.std("#0ea5e9", 0.5), cyl(3.5, 0.6, 0, 17, 0, 20, 0.5), X, Z);
        break;
      case "pump":
        put(white, box(7, 4, 6, 0, 0.15, -1), X, Z, rot);
        put(this.std("#0284c7", 0.5, 0.4), cyl(0.7, 3, 3.5, 0.15, 3), X, Z, rot);
        break;
      case "police":
      case "fire":
      case "clinic":
      case "hospital":
      case "school": {
        const tint = { police: "#1d4ed8", fire: "#b91c1c", clinic: "#f8fafc", hospital: "#f8fafc", school: "#b45309" }[
          k
        ];
        const h = k === "hospital" ? 16 : 7;
        const fk: FacadeKind = k === "school" ? "house" : k === "hospital" ? "office" : "store";
        put(this.facade(fk, k === "fire" ? 2 : 1), walls(9.5, h, 8.5, fk), X, Z, rot);
        put(this.std(tint, 0.6), box(9.8, 0.8, 8.8, 0, h), X, Z, rot);
        if (k === "fire") put(this.std("#7f1d1d", 0.6), box(6, 4, 0.3, 0, 0.15, 4.4), X, Z, rot);
        if (k === "clinic" || k === "hospital") {
          put(this.glow("#ef4444", 1.2), box(0.9, 3, 0.3, 0, h - 4, 4.35), X, Z, rot);
          put(this.glow("#ef4444", 1.2), box(3, 0.9, 0.3, 0, h - 2.95, 4.35), X, Z, rot);
        }
        if (k === "police") put(this.glow("#3b82f6", 1.4), box(4, 0.8, 0.3, 0, h - 1.5, 4.35), X, Z, rot);
        break;
      }
      case "park":
        put(this.std("#4d7c0f", 0.95), box(TILE - 0.8, 0.2, TILE - 0.8), X, Z);
        put(this.std("#d6c7a1", 0.9), box(TILE - 1, 0.24, 1.6), X, Z, rot);
        break;
      case "plaza":
        put(this.std("#d6d3d1", 0.8), box(TILE - 0.6, 0.25, TILE - 0.6), X, Z);
        put(grey, cyl(3, 0.8, 0, 0.25), X, Z);
        put(this.std("#38bdf8", 0.1, 0.1), cyl(2.6, 0.2, 0, 1), X, Z);
        put(grey, cyl(0.4, 2.6, 0, 1), X, Z);
        break;
    }
    void group;
  }

  // ------------------------------------------------------------- overlays

  setOverlay(mode: Overlay, c: City, m: Maps, powered: (i: number) => boolean) {
    this.overlay.visible = mode !== "none";
    if (mode === "none") return;
    const data = this.overlayTex.image.data as Uint8Array;
    const ramp = (k: number, good = true) => {
      const v = Math.max(0, Math.min(1, k));
      const g = good ? v : 1 - v;
      return [Math.round(255 * (1 - g)), Math.round(200 * g + 30), 60];
    };
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = idx(x, y);
        const t = c.tiles[i];
        // Texture rows run bottom-up; flip so it lines up with the map.
        const o = ((N - 1 - y) * N + x) * 4;
        let rgb = [0, 0, 0];
        let a = 0;
        if (mode === "value") {
          // Most land sits between 0.2 and 0.8: stretch that across the ramp.
          rgb = ramp((m.value[i] - 0.2) / 0.6);
          a = t.water || t.road ? 0 : 150;
        } else if (mode === "pollution") {
          rgb = ramp(m.pollution[i], false);
          a = m.pollution[i] > 0.02 ? 170 : 40;
        } else if (mode === "power") {
          if (t.bld) {
            rgb = powered(i) ? [40, 210, 120] : [240, 60, 60];
            a = 200;
          }
        } else {
          const on = m.cover[mode][i];
          rgb = on ? [40, 200, 120] : [230, 80, 80];
          a = t.bld || t.zone ? 170 : on ? 70 : 0;
        }
        data.set([rgb[0], rgb[1], rgb[2], a], o);
      }
    this.overlayTex.needsUpdate = true;
  }

  // -------------------------------------------------------------- tools

  setGhost(g: Ghost | null) {
    for (const o of [...this.ghost.children]) {
      this.ghost.remove(o);
      (o as THREE.Mesh).geometry.dispose();
    }
    if (!g) return;
    const col = !g.ok
      ? "#ef4444"
      : g.kind === "bulldoze"
        ? "#f97316"
        : g.kind === "zone" && g.zone
          ? ZONE_COLOR[g.zone]
          : g.kind === "zone"
            ? "#e5e7eb"
            : "#22e5ff";
    const m = this.mat(
      `ghost${col}`,
      () => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    const h = g.kind === "service" ? 6 : 0.5;
    const geos = g.tiles
      .slice(0, 600)
      .map((p) => box(TILE - 0.6, h, TILE - 0.6, tileX(p.x), 0.1, tileZ(p.y)).toNonIndexed());
    if (geos.length) this.ghost.add(new THREE.Mesh(mergeGeometries(geos)!, m));
  }

  setCursor(p: { x: number; y: number } | null) {
    this.cursor.visible = !!p;
    if (p) this.cursor.position.set(tileX(p.x), 0.2, tileZ(p.y));
  }

  /** The tile under a screen point (normalised device coords). */
  pick(nx: number, ny: number) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.pipe.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    const x = Math.floor((hit.x + HALF) / TILE);
    const y = Math.floor((hit.z + HALF) / TILE);
    return x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
  }

  // -------------------------------------------------------------- frame

  /** `dayFrac` is the time of day (0 = midnight); `traffic` how many cars to run. */
  frame(dt: number, dayFrac: number, traffic: number) {
    this.time += dt;
    // The sun: up at 6, down at 20.
    const sunH = Math.sin(((dayFrac * 24 - 6) / 14) * Math.PI);
    const up = Math.max(0, sunH);
    this.night = Math.max(0, Math.min(1, 1 - (sunH + 0.15) * 3));
    const az = dayFrac * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(az) * 0.6, Math.max(0.05, sunH), Math.sin(az) * 0.6 + 0.4).normalize();
    if (this.sky) ((this.sky.material as THREE.ShaderMaterial).uniforms.sunPosition.value as THREE.Vector3).copy(dir);
    this.pipe.key.position.copy(this.pipe.key.target.position).addScaledVector(dir, 300);
    this.pipe.key.intensity = 0.15 + up * 2.8;
    this.pipe.key.color.setHSL(0.09, 0.6, 0.55 + up * 0.35);
    this.pipe.hemi.intensity = 0.25 + up * 0.9;
    this.pipe.renderer.toneMappingExposure = 0.75 + this.night * 0.35;
    for (const m of this.mats.values()) {
      const s = m as THREE.MeshStandardMaterial;
      if (s.emissiveMap) s.emissiveIntensity = this.night * 1.6;
    }
    const lamp = this.mats.get("lamp") as THREE.MeshStandardMaterial | undefined;
    if (lamp) lamp.emissiveIntensity = this.night * 3;
    this.waterNormal.offset.set(this.time * 0.01, this.time * 0.006);
    for (const t of this.turbines) t.rotation.z += dt * 1.6;
    this.moveCars(dt, traffic);
    this.puff(dt);
    // The camera: orbit the target.
    if (this.photo) this.yaw += dt * 0.05;
    this.target.x = Math.max(-HALF, Math.min(HALF, this.target.x));
    this.target.z = Math.max(-HALF, Math.min(HALF, this.target.z));
    const cp = Math.cos(this.pitch);
    const want = new THREE.Vector3(
      this.target.x - Math.sin(this.yaw) * cp * this.dist,
      Math.sin(this.pitch) * this.dist,
      this.target.z - Math.cos(this.yaw) * cp * this.dist,
    );
    const k = Math.min(1, dt * 6);
    this.camPos.lerp(want, this.camPos.lengthSq() ? k : 1);
    this.camLook.lerp(this.target, this.camLook.lengthSq() ? k : 1);
    this.pipe.camera.position.copy(this.camPos);
    this.pipe.camera.lookAt(this.camLook);
    this.pipe.follow(this.target.x, this.target.z);
    this.pipe.render();
  }

  /** Jump straight to the target next frame instead of gliding there. */
  snap() {
    this.camPos.set(0, 0, 0);
    this.camLook.set(0, 0, 0);
  }

  private moveCars(dt: number, want: number) {
    const roads = this.roadSet;
    const n = Math.min(this.cars.instanceMatrix.count, Math.floor(want), roads.length * 2);
    while (this.carAgents.length < n && roads.length > 1) {
      const from = roads[Math.floor(Math.random() * roads.length)];
      this.carAgents.push({ from, to: from, t: 1, speed: 9 + Math.random() * 6, prev: -1 });
    }
    this.carAgents.length = Math.min(this.carAgents.length, n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    this.carAgents.forEach((a, i) => {
      a.t += (dt * a.speed) / TILE;
      if (a.t >= 1) {
        // Pick the next road tile (no U-turns unless it's a dead end).
        const { x, y } = xy(a.to);
        const opts = [idx(x + 1, y), idx(x - 1, y), idx(x, y + 1), idx(x, y - 1)].filter(
          (j, k) => this.roadLookup.has(j) && [x + 1 < N, x > 0, y + 1 < N, y > 0][k],
        );
        const fwd = opts.filter((j) => j !== a.from);
        const next =
          (fwd.length ? fwd : opts)[Math.floor(Math.random() * Math.max(1, (fwd.length ? fwd : opts).length))] ?? a.to;
        a.from = a.to;
        a.to = next;
        a.t = 0;
      }
      const f = xy(a.from);
      const t = xy(a.to);
      const fx = tileX(f.x);
      const fz = tileZ(f.y);
      const tx = tileX(t.x);
      const tz = tileZ(t.y);
      const dx = tx - fx;
      const dz = tz - fz;
      const len = Math.hypot(dx, dz) || 1;
      // Keep right: offset across the direction of travel.
      const ox = (-dz / len) * 2;
      const oz = (dx / len) * 2;
      const lift = this.roadLookup.has(a.from) ? 0.1 : 0.1;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz));
      m4.compose(new THREE.Vector3(fx + dx * a.t + ox, lift, fz + dz * a.t + oz), q, new THREE.Vector3(1, 1, 1));
      this.cars.setMatrixAt(i, m4);
      this.cars.setColorAt(i, col.setHSL(h01(i * 17), 0.55, 0.25 + h01(i * 5) * 0.4));
    });
    this.cars.count = this.carAgents.length;
    this.cars.instanceMatrix.needsUpdate = true;
    if (this.cars.instanceColor) this.cars.instanceColor.needsUpdate = true;
  }

  private puffTex: THREE.Texture | null = null;
  private puff(dt: number) {
    this.puffTex ??= puffTexture(128);
    if (this.chimneys.length && this.smoke.length < Math.min(80, this.chimneys.length * 6) && Math.random() < dt * 8) {
      const at = this.chimneys[Math.floor(Math.random() * this.chimneys.length)];
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.puffTex,
          color: "#d4d4d8",
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      );
      s.position.copy(at);
      s.scale.setScalar(3);
      this.pipe.scene.add(s);
      this.smoke.push({ s, life: 0, at: at.clone() });
    }
    this.smoke = this.smoke.filter((p) => {
      p.life += dt;
      p.s.position.y += dt * 2.2;
      p.s.position.x += dt * 1.4;
      p.s.scale.setScalar(3 + p.life * 3);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.45 - p.life * 0.08);
      if (p.life > 5.5) {
        this.pipe.scene.remove(p.s);
        p.s.material.dispose();
        return false;
      }
      return true;
    });
  }

  destroy() {
    this.pipe.destroy();
  }
}

/** For the service icons in the toolbar and info panels. */
export const SERVICE_NAMES = Object.fromEntries(Object.entries(SERVICES).map(([k, v]) => [k, v.name])) as Record<
  ServiceKind,
  string
>;
