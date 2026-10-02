import * as THREE from "three";
import { SportsPipeline, canvasTexture } from "../sports-kit/pipeline";
import type { Detail } from "../sports-kit/look";
import { asphaltTexture, concreteTexture, grassTexture, setTextureDetail } from "../neon-siege/three/textures";
import { baseFacade, GROUND_FLOOR, upperFacade, UPPER } from "../code-3/facades";
import { buildCar, type CarModel } from "../code-3/models";
import type { CarKind } from "../code-3/vehicles";
import { buildPed, posePed, type PedModel, type Pose } from "../code-3/people3d";
import { houseModel, furnitureModel, type HouseModel } from "./models";
import { PLACES, PLOTS, PLOT_D, PLOT_W, ROADS, WALK_W, itemRect, plotYaw, sunAt, toWorld, type Build, type FurnitureType, type Place, type Plot } from "./world";

/**
 * Life's 3D view of Harbour City: sun and sky that move with the clock,
 * PBR grass, asphalt and concrete, shops with real facades and lit windows
 * at night, every plot's house (yours as you built it), trees and street
 * lamps, the harbour, parked cars, neighbours walking about, you, your car,
 * and the build-mode grid and ghosts.
 */

export type ViewMode = "walk" | "drive" | "build";

export interface Look {
  sex: "M" | "F";
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  seed: number;
}

export interface FrameState {
  mode: ViewMode;
  minutes: number;
  me: { x: number; z: number; heading: number; speed: number; pose: Pose; act: number; visible: boolean };
  car: { x: number; z: number; heading: number; speed: number; visible: boolean } | null;
  /** The plot whose roof is lifted (you're inside, or building). */
  open: number | null;
  /** A glowing marker (shop door, delivery drop) and the use ring. */
  marker: { x: number; z: number; color: string } | null;
  use: { x: number; z: number } | null;
}

const facadeKind: Record<string, "store" | "office" | "tower" | "hospital" | "station"> = {
  freshmart: "store", cafe: "store", pizza: "store", realty: "store", gym: "store", furniture: "store", carlot: "store", garage: "store",
  office: "tower", studio: "office", cityhall: "station", school: "office", hospital: "hospital", police: "station", fire: "station", beach: "store", airport: "office",
};

export class LifeView {
  readonly pipe: SportsPipeline;
  private houses = new Map<number, HouseModel>();
  private me!: PedModel;
  private meStep = 0;
  private car: CarModel | null = null;
  private carKind = "";
  private npcs: { m: PedModel; x: number; z: number; tx: number; tz: number; step: number; speed: number }[] = [];
  private lit: THREE.MeshStandardMaterial[] = [];
  private lampGlow!: THREE.MeshStandardMaterial;
  private sky: THREE.ShaderMaterial | null = null;
  private marker: THREE.Mesh;
  private use: THREE.Mesh;
  private grid: THREE.LineSegments;
  private ghost: THREE.Object3D | null = null;
  private ghostKey = "";
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private time = 0;
  private lod: "high" | "low";
  /** Camera orbit (walk/drive) and build view. */
  yaw = Math.PI;
  pitch = 0.32;
  dist = 7;
  buildFocus = new THREE.Vector3();
  buildDist = 34;
  private camPos = new THREE.Vector3(0, 10, 20);
  private camLook = new THREE.Vector3();

  constructor(host: HTMLElement, detail: Detail, look: Look) {
    const high = detail !== "low";
    this.lod = high ? "high" : "low";
    setTextureDetail(high ? "high" : "low");
    this.pipe = new SportsPipeline(host, detail, "day", { fov: 55, shadowSpan: 42, far: 2500 });
    const { scene } = this.pipe;
    this.pipe.lights([], { sunDir: new THREE.Vector3(0.4, 0.8, 0.3), fog: 0.0012 });
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (m && m.uniforms?.sunPosition) this.sky = m;
    });

    // ---------------------------------------------------------- ground
    const grass = grassTexture(256);
    for (const t of [grass.map, grass.normal]) t?.repeat.set(160, 100);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(640, 400).rotateX(-Math.PI / 2).translate(0, 0, 60), new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95 }));
    ground.receiveShadow = true;
    scene.add(ground);
    // The harbour to the north.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 600).rotateX(-Math.PI / 2).translate(0, -0.6, -380), new THREE.MeshStandardMaterial({ color: "#1e4d6b", roughness: 0.08, metalness: 0.4 }));
    scene.add(water);
    const sea = new THREE.Mesh(new THREE.BoxGeometry(640, 1.2, 8).translate(0, -0.2, -84), new THREE.MeshStandardMaterial({ map: concreteTexture(256).map, roughness: 0.9 }));
    sea.receiveShadow = true;
    scene.add(sea);
    // Hills on the far side.
    const hillMat = new THREE.MeshStandardMaterial({ color: "#3f5a2e", roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI + Math.PI * 0.02;
      const r = 520 + (i % 3) * 60;
      const h = new THREE.Mesh(new THREE.SphereGeometry(90 + (i % 4) * 30, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
      h.scale.y = 0.45;
      h.position.set(Math.cos(a) * r, -4, 60 + Math.sin(a) * r);
      scene.add(h);
    }

    // ----------------------------------------------------------- roads
    const asphalt = asphaltTexture(256);
    const roadMat = new THREE.MeshStandardMaterial({ map: asphalt.map, normalMap: asphalt.normal, roughness: 0.92 });
    asphalt.map.repeat.set(1, 1);
    const conc = concreteTexture(256);
    const walkMat = new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normal, roughness: 0.9 });
    const lines = canvasTexture(64, 256, (g) => {
      g.clearRect(0, 0, 64, 256);
      g.fillStyle = "#f8fafc";
      g.fillRect(29, 0, 6, 128);
    }, true);
    for (const r of ROADS) {
      const along = r.w > r.d;
      const geo = new THREE.PlaneGeometry(r.w, r.d).rotateX(-Math.PI / 2).translate(r.x + r.w / 2, 0.02, r.z + r.d / 2);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (r.w / 8), uv.getY(i) * (r.d / 8));
      const road = new THREE.Mesh(geo, roadMat);
      road.receiveShadow = true;
      scene.add(road);
      const lt = lines.clone();
      lt.needsUpdate = true;
      lt.repeat.set(1, (along ? r.w : r.d) / 8);
      const lineGeo = new THREE.PlaneGeometry(0.25, along ? r.w : r.d).rotateX(-Math.PI / 2);
      if (along) lineGeo.rotateY(Math.PI / 2);
      lineGeo.translate(r.x + r.w / 2, 0.03, r.z + r.d / 2);
      scene.add(new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({ map: lt, transparent: true, roughness: 0.6, depthWrite: false })));
      // Footpaths both sides, raised a kerb.
      for (const s of [-1, 1]) {
        const g = along ? new THREE.BoxGeometry(r.w, 0.15, WALK_W).translate(r.x + r.w / 2, 0.075, r.z + r.d / 2 + s * (r.d / 2 + WALK_W / 2)) : new THREE.BoxGeometry(WALK_W, 0.15, r.d).translate(r.x + r.w / 2 + s * (r.w / 2 + WALK_W / 2), 0.075, r.z + r.d / 2);
        const uv2 = g.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv2.count; i++) uv2.setXY(i, uv2.getX(i) * (along ? r.w : WALK_W) / 3, uv2.getY(i) * (along ? WALK_W : r.d) / 3);
        const m = new THREE.Mesh(g, walkMat);
        m.receiveShadow = true;
        scene.add(m);
      }
    }

    // ----------------------------------------------------------- shops
    const P = high ? 32 : 16;
    const cache = new Map<string, THREE.MeshStandardMaterial>();
    const facadeMat = (kind: keyof typeof UPPER, style: number, base: boolean) => {
      const key = `${kind}|${style}|${base}`;
      let m = cache.get(key);
      if (!m) {
        const f = base ? baseFacade(kind as never, style, P) : upperFacade(kind as never, style, P, true);
        for (const t of [f.map, f.lit, f.rm, f.normal]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        m = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.lit, emissive: "#ffe2b0", emissiveIntensity: 0, roughnessMap: f.rm, metalnessMap: f.rm, normalMap: f.normal, aoMap: f.rm });
        cache.set(key, m);
        this.lit.push(m);
      }
      return m;
    };
    const roofMat = new THREE.MeshStandardMaterial({ color: "#3f3f46", roughness: 0.9 });
    PLACES.forEach((p, i) => this.addPlace(p, facadeKind[p.id] ?? "store", i % 4, facadeMat, roofMat));

    // ---------------------------------------------------------- houses
    // (filled by setBuild)

    // ---------------------------------------------- trees, lamps, fences
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#4a3426", roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: "#3d6b2c", roughness: 0.95 });
    const trunks: THREE.Matrix4[] = [];
    const crowns: THREE.Matrix4[] = [];
    const lamps: THREE.Matrix4[] = [];
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (const r of ROADS) {
      const along = r.w > r.d;
      const len = along ? r.w : r.d;
      for (let k = 6; k < len - 6; k += 18) {
        for (const side of [-1, 1]) {
          const off = (along ? r.d : r.w) / 2 + WALK_W - 0.6;
          const x = along ? r.x + k : r.x + r.w / 2 + side * off;
          const z = along ? r.z + r.d / 2 + side * off : r.z + k;
          if (PLACES.some((p) => x > p.x - 1 && x < p.x + p.w + 1 && z > p.z - 1 && z < p.z + p.d + 1)) continue;
          if ((k / 18 + (side > 0 ? 1 : 0)) % 2 === 0) {
            const h = 2.5 + rnd() * 1.5;
            trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
            const c = 2 + rnd() * 1.3;
            crowns.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h + c * 0.6, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(c, c * 1.15, c)));
          } else lamps.push(new THREE.Matrix4().makeTranslation(x, 0, z));
        }
      }
    }
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1, 7);
    const crownGeo = new THREE.IcosahedronGeometry(1, high ? 2 : 1);
    {
      const p = crownGeo.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        v.multiplyScalar(0.85 + Math.sin(v.x * 9 + v.y * 7) * 0.08 + Math.cos(v.z * 11) * 0.07);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      crownGeo.computeVertexNormals();
    }
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((x, i) => m.setMatrixAt(i, x));
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    inst(trunkGeo, trunkMat, trunks);
    inst(crownGeo, leafMat, crowns);
    const poleMat = new THREE.MeshStandardMaterial({ color: "#3f3f46", roughness: 0.5, metalness: 0.6 });
    inst(new THREE.CylinderGeometry(0.07, 0.1, 6, 8).translate(0, 3, 0), poleMat, lamps);
    this.lampGlow = new THREE.MeshStandardMaterial({ color: "#fff7e0", emissive: "#ffd89a", emissiveIntensity: 0 });
    inst(new THREE.BoxGeometry(0.5, 0.18, 0.3).translate(0, 6, 0), this.lampGlow, lamps);
    // Plot fences, driveways and mailboxes.
    const fenceMat = new THREE.MeshStandardMaterial({ color: "#f5f5f4", roughness: 0.7 });
    const fence: THREE.Matrix4[] = [];
    const drive: THREE.BufferGeometry[] = [];
    for (const p of PLOTS) {
      for (const lz of [0.2, PLOT_D - 0.2])
        for (let lx = 0.5; lx < PLOT_W; lx += 1) {
          if (lz > PLOT_D / 2 && lx > PLOT_W / 2 - 3 && lx < PLOT_W / 2 + 6) continue;
          const w = toWorld(p, lx, lz);
          fence.push(new THREE.Matrix4().makeTranslation(w.x, 0.45, w.z));
        }
      const a = toWorld(p, PLOT_W / 2 + 2, PLOT_D);
      const b = toWorld(p, PLOT_W / 2 + 5, PLOT_D - 9);
      drive.push(new THREE.PlaneGeometry(Math.abs(b.x - a.x), Math.abs(b.z - a.z)).rotateX(-Math.PI / 2).translate((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2));
    }
    inst(new THREE.BoxGeometry(0.08, 0.9, 0.08), fenceMat, fence);
    for (const g of drive) {
      const m = new THREE.Mesh(g, walkMat);
      m.receiveShadow = true;
      scene.add(m);
    }

    // ------------------------------------------------------ parked cars
    const kinds: CarKind[] = ["sedan", "suv", "pickup", "van", "sedan", "sports"];
    const colors = ["#e5e7eb", "#1f2937", "#7f1d1d", "#1e3a8a", "#d4d4d8", "#0f766e", "#a16207"];
    PLOTS.filter((_, i) => i % 3 === 1).forEach((p, i) => {
      const c = buildCar(kinds[i % kinds.length], colors[i % colors.length], "", this.lod);
      const w = toWorld(p, PLOT_W / 2 + 3.5, PLOT_D - 5);
      c.group.position.set(w.x, 0, w.z);
      c.group.rotation.y = plotYaw(p) + Math.PI / 2;
      c.group.traverse((o) => (o.castShadow = true));
      scene.add(c.group);
    });

    // ------------------------------------------------------- neighbours
    const shirts = ["#1e3a8a", "#7f1d1d", "#166534", "#f5f5f4", "#111827", "#a16207", "#6d28d9"];
    for (let i = 0; i < (high ? 14 : 7); i++) {
      const m = buildPed({ skin: ["#f1c9a5", "#e0ac84", "#c68c5d", "#8d5a3b", "#5a3a28"][i % 5], shirt: shirts[i % shirts.length], pants: i % 2 ? "#1f2937" : "#374151", seed: 500 + i * 7, lod: this.lod });
      m.group.traverse((o) => (o.castShadow = true));
      scene.add(m.group);
      const r = ROADS[i % ROADS.length];
      const x = r.x + 10 + rnd() * (r.w - 20);
      const z = r.z + r.d + WALK_W / 2;
      this.npcs.push({ m, x, z, tx: x, tz: z, step: 0, speed: 1.2 + rnd() * 0.4 });
    }

    // ---------------------------------------------------------- you
    this.setLook(look);

    // ------------------------------------------------- markers & build
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#facc15", toneMapped: false }));
    this.marker.visible = false;
    scene.add(this.marker);
    this.use = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.65, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.use.visible = false;
    scene.add(this.use);
    const pts: number[] = [];
    for (let i = 0; i <= PLOT_W; i++) pts.push(i, 0.06, 0, i, 0.06, PLOT_D);
    for (let k = 0; k <= PLOT_D; k++) pts.push(0, 0.06, k, PLOT_W, 0.06, k);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35 }));
    this.grid.visible = false;
    scene.add(this.grid);
  }

  get canvas() {
    return this.pipe.canvas;
  }
  setResolution(k: number) {
    this.pipe.setResolution(k);
  }

  private addPlace(p: Place, kind: keyof typeof UPPER, style: number, facade: (k: keyof typeof UPPER, s: number, base: boolean) => THREE.MeshStandardMaterial, roofMat: THREE.Material) {
    const { scene } = this.pipe;
    const gf = GROUND_FLOOR[kind as never] || 4.5;
    const L = UPPER[kind];
    const upper = Math.max(0, p.floors - 1) * L.floorH;
    const H = gf + upper;
    const mk = (w: number, h: number, d: number, y0: number, mat: THREE.Material, uScale: number, vScale: number) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      // Faces: +x, -x, +y, -y, +z, -z (4 verts each).
      for (let f = 0; f < 6; f++) {
        const faceW = f < 2 ? d : w;
        for (let v = 0; v < 4; v++) {
          const i = f * 4 + v;
          uv.setXY(i, uv.getX(i) * (faceW / uScale), uv.getY(i) * (h / vScale));
        }
      }
      g.setAttribute("uv1", g.attributes.uv);
      const m = new THREE.Mesh(g, mat);
      m.position.set(p.x + p.w / 2, y0 + h / 2, p.z + p.d / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    mk(p.w, gf, p.d, 0, facade(kind, style, true), 16, gf);
    if (upper > 0) mk(p.w, upper, p.d, gf, facade(kind, style, false), L.bayW * L.bays, L.floorH * L.floors);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.4, 0.5, p.d + 0.4), roofMat);
    roof.position.set(p.x + p.w / 2, H + 0.25, p.z + p.d / 2);
    roof.castShadow = true;
    scene.add(roof);
    // The sign over the door.
    const sign = canvasTexture(512, 96, (g) => {
      g.fillStyle = p.color;
      g.fillRect(0, 0, 512, 96);
      g.fillStyle = ["#f5f5f4", "#f8fafc", "#e7e5e4", "#e5e7eb", "#d6d3d1"].includes(p.color) ? "#111827" : "#ffffff";
      g.font = "900 54px Arial Black, Arial, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(p.sign, 256, 50, 490);
    });
    const sw = Math.min(p.w - 2, 12);
    const signMat = new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: "#ffffff", emissiveIntensity: 0.15, roughness: 0.5 });
    this.lit.push(signMat);
    const board = new THREE.Mesh(new THREE.BoxGeometry(sw, sw * 0.19, 0.2), signMat);
    board.position.set(p.door.x, gf + 0.6, p.z + p.d + 0.15);
    scene.add(board);
    // Awning.
    const awn = new THREE.Mesh(new THREE.BoxGeometry(Math.min(p.w, 10), 0.12, 1.6), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.7 }));
    awn.position.set(p.door.x, Math.min(gf - 0.6, 3.4), p.z + p.d + 0.8);
    awn.rotation.x = -0.12;
    awn.castShadow = true;
    scene.add(awn);
  }

  // ------------------------------------------------------------- houses

  /** (Re)build a plot's house. */
  setBuild(p: Plot, b: Build) {
    const old = this.houses.get(p.id);
    if (old) {
      this.pipe.scene.remove(old.group);
      old.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const h = houseModel(b, this.lod);
    const o = toWorld(p, 0, 0);
    h.group.position.set(o.x, 0, o.z);
    h.group.rotation.y = plotYaw(p);
    this.pipe.scene.add(h.group);
    this.houses.set(p.id, h);
  }

  // ---------------------------------------------------------------- you

  setLook(l: Look) {
    if (this.me) this.pipe.scene.remove(this.me.group);
    this.me = buildPed({ skin: l.skin, shirt: l.shirt, pants: l.pants, hair: l.hair, seed: l.seed, lod: this.lod, outfit: { female: l.sex === "F", top: "tee", bottom: "trousers", hair: l.sex === "F" ? "long" : "short", beard: false, hat: "none", backpack: false, officer: false } });
    this.me.group.traverse((o) => (o.castShadow = true));
    this.pipe.scene.add(this.me.group);
  }

  setCar(kind: string | null, color = "#1e3a8a") {
    const key = kind ? `${kind}|${color}` : "";
    if (key === this.carKind) return;
    this.carKind = key;
    if (this.car) this.pipe.scene.remove(this.car.group);
    this.car = null;
    if (!kind) return;
    this.car = buildCar(kind as CarKind, color, "LIFE", this.lod);
    this.car.group.traverse((o) => (o.castShadow = true));
    this.pipe.scene.add(this.car.group);
  }

  // -------------------------------------------------------------- build

  /** The build ghost: a furniture model, or a wall/floor preview box. */
  setGhost(p: Plot | null, g: { kind: "item"; type: FurnitureType; x: number; z: number; rot: number; ok: boolean } | { kind: "wall"; x1: number; z1: number; x2: number; z2: number; ok: boolean } | { kind: "cell"; x: number; z: number; ok: boolean } | null) {
    const key = !g || !p ? "" : g.kind === "item" ? `item|${g.type}` : g.kind;
    if (key !== this.ghostKey) {
      if (this.ghost) this.pipe.scene.remove(this.ghost);
      this.ghost = null;
      this.ghostKey = key;
      if (!g || !p) return;
      this.ghost = g.kind === "item" ? furnitureModel(g.type, true) : new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#4ade80", transparent: true, opacity: 0.5, depthWrite: false }));
      this.pipe.scene.add(this.ghost);
    }
    if (!g || !p || !this.ghost) return;
    const color = g.ok ? "#4ade80" : "#ef4444";
    this.ghost.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m?.color) m.color.set(color);
    });
    const o = toWorld(p, 0, 0);
    const yaw = plotYaw(p);
    const place = (lx: number, lz: number) => {
      const w = toWorld(p, lx, lz);
      this.ghost!.position.set(w.x, 0, w.z);
    };
    if (g.kind === "item") {
      place(g.x, g.z);
      this.ghost.rotation.y = yaw + (g.rot * Math.PI) / 2;
      this.ghost.scale.set(1, 1, 1);
    } else if (g.kind === "wall") {
      const len = Math.max(0.2, Math.hypot(g.x2 - g.x1, g.z2 - g.z1));
      place((g.x1 + g.x2) / 2, (g.z1 + g.z2) / 2);
      this.ghost.position.y = 1.5;
      this.ghost.rotation.y = yaw + (g.z1 === g.z2 ? 0 : Math.PI / 2);
      this.ghost.scale.set(len, 3, 0.2);
    } else {
      place(g.x + 0.5, g.z + 0.5);
      this.ghost.position.y = 0.05;
      this.ghost.rotation.y = yaw;
      this.ghost.scale.set(1, 0.06, 1);
    }
    void o;
  }

  /** Ground point under a screen position. */
  groundAt(nx: number, ny: number) {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.pipe.camera);
    const hit = this.ray.ray.intersectPlane(this.ground, new THREE.Vector3());
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  // ------------------------------------------------------------- frame

  render(dt: number, s: FrameState, buildPlot: Plot | null) {
    this.time += dt;
    this.dayNight(s.minutes);
    // You.
    const me = this.me;
    me.group.visible = s.me.visible;
    me.group.position.set(s.me.x, s.me.pose === "sleep" ? 0.62 : s.me.pose === "sit" ? 0.05 : 0, s.me.z);
    me.group.rotation.y = -(Math.PI / 2 - s.me.heading);
    this.meStep += dt * s.me.speed * 1.45;
    posePed(me, s.me.pose, this.meStep, s.me.speed, this.time, dt, s.me.act);
    // Your car.
    if (this.car) {
      this.car.group.visible = !!s.car?.visible;
      if (s.car) {
        this.car.group.position.set(s.car.x, 0, s.car.z);
        this.car.group.rotation.y = s.car.heading - Math.PI / 2;
        for (const w of this.car.wheels) if (w.children[0]) w.children[0].rotation.x += (s.car.speed * dt) / 0.34;
        const night = sunAt(s.minutes) < 0.05;
        for (const g of this.car.headGlow) (g.material as THREE.SpriteMaterial).opacity = night ? 0.9 : 0;
        (this.car.beam.material as THREE.MeshBasicMaterial).opacity = night ? 0.5 : 0;
      }
    }
    // Neighbours stroll along the footpaths.
    for (const n of this.npcs) {
      const dx = n.tx - n.x;
      const dz = n.tz - n.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        const r = ROADS[Math.floor(Math.random() * ROADS.length)];
        const along = r.w > r.d;
        n.tx = along ? Math.max(r.x + 4, Math.min(r.x + r.w - 4, n.x + (Math.random() - 0.5) * 60)) : r.x + r.w + WALK_W / 2;
        n.tz = along ? r.z + r.d + WALK_W / 2 : Math.max(r.z + 4, Math.min(r.z + r.d - 4, n.z + (Math.random() - 0.5) * 60));
        if (Math.hypot(n.tx - n.x, n.tz - n.z) > 80) {
          n.tx = n.x + (Math.random() - 0.5) * 20;
          n.tz = n.z;
        }
      } else {
        n.x += (dx / d) * n.speed * dt;
        n.z += (dz / d) * n.speed * dt;
      }
      n.step += dt * n.speed * 1.45;
      n.m.group.position.set(n.x, 0.15, n.z);
      n.m.group.rotation.y = -Math.atan2(dz, dx);
      if (Math.hypot(n.x - s.me.x, n.z - s.me.z) < 60) posePed(n.m, "walk", n.step, n.speed, this.time, dt);
    }
    // Roofs lift off the house you're in (and while building).
    for (const [id, h] of this.houses) h.roof.visible = id !== s.open;
    // Markers.
    this.marker.visible = !!s.marker;
    if (s.marker) {
      this.marker.position.set(s.marker.x, 0.2 + Math.sin(this.time * 3) * 0.08, s.marker.z);
      (this.marker.material as THREE.MeshBasicMaterial).color.set(s.marker.color);
    }
    this.use.visible = !!s.use;
    if (s.use) this.use.position.set(s.use.x, 0.06, s.use.z);
    // Build grid.
    this.grid.visible = s.mode === "build" && !!buildPlot;
    if (buildPlot) {
      const o = toWorld(buildPlot, 0, 0);
      this.grid.position.set(o.x, 0, o.z);
      this.grid.rotation.y = plotYaw(buildPlot);
    }
    this.camera(dt, s, buildPlot);
    const fx = s.mode === "build" ? this.buildFocus.x : s.me.x;
    const fz = s.mode === "build" ? this.buildFocus.z : s.me.z;
    this.pipe.follow(fx, fz);
    this.pipe.render();
  }

  private camera(dt: number, s: FrameState, buildPlot: Plot | null) {
    const c = this.pipe.camera;
    const want = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov = 55;
    if (s.mode === "build" && buildPlot) {
      look.copy(this.buildFocus);
      want.set(look.x + Math.sin(this.yaw) * Math.cos(0.95) * this.buildDist, Math.sin(0.95) * this.buildDist, look.z + Math.cos(this.yaw) * Math.cos(0.95) * this.buildDist);
      fov = 45;
    } else if (s.mode === "drive" && s.car) {
      look.set(s.car.x, 1.2, s.car.z);
      const back = s.car.heading + Math.PI;
      want.set(s.car.x + Math.sin(back) * 8, 3.4, s.car.z + Math.cos(back) * 8);
      fov = 60 + Math.min(12, Math.abs(s.car.speed) * 0.4);
    } else {
      look.set(s.me.x, 1.5, s.me.z);
      const cp = Math.cos(this.pitch);
      want.set(s.me.x + Math.sin(this.yaw) * cp * this.dist, 1.5 + Math.sin(this.pitch) * this.dist, s.me.z + Math.cos(this.yaw) * cp * this.dist);
    }
    const k = Math.min(1, dt * (s.mode === "walk" ? 12 : 6));
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, k);
    c.position.copy(this.camPos);
    c.fov += (fov - c.fov) * k;
    c.updateProjectionMatrix();
    c.lookAt(this.camLook);
  }

  /** The sun crosses the sky with the clock; lamps and windows come on at dusk. */
  private dayNight(minutes: number) {
    const h = ((minutes % 1440) / 1440) * Math.PI * 2 - Math.PI / 2;
    const sun = sunAt(minutes);
    const dir = new THREE.Vector3(Math.cos(h) * 0.8, Math.max(-0.3, Math.sin(h)), 0.35).normalize();
    (this.pipe as unknown as { sunDir: THREE.Vector3 }).sunDir.copy(dir.y > 0.05 ? dir : new THREE.Vector3(0.3, 0.9, 0.3).normalize());
    if (this.sky) (this.sky.uniforms.sunPosition.value as THREE.Vector3).copy(dir);
    const day = Math.max(0, Math.min(1, (sun + 0.1) / 0.5));
    const dusk = Math.max(0, 1 - Math.abs(sun) / 0.25);
    this.pipe.key.intensity = 0.25 + 2.6 * day;
    this.pipe.key.color.setRGB(1, 0.8 + 0.2 * day - 0.15 * dusk, 0.62 + 0.36 * day - 0.2 * dusk);
    if (dir.y <= 0.05) this.pipe.key.color.set("#9fb4ff");
    this.pipe.hemi.intensity = 0.18 + 0.95 * day;
    this.pipe.scene.environmentIntensity = 0.12 + 0.5 * day;
    this.pipe.renderer.toneMappingExposure = 0.75 + 0.25 * day + 0.3 * (1 - day);
    if (this.sky) this.sky.uniforms.skyGain.value = 0.012 + 0.065 * day;
    const night = 1 - day;
    for (const m of this.lit) m.emissiveIntensity = night * 1.4;
    this.lampGlow.emissiveIntensity = night * 3;
  }

  destroy() {
    this.pipe.destroy();
  }
}

export { itemRect };
