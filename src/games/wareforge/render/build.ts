/**
 * A building site in a city, in 3D: your plot on a street between its neighbours, and the building
 * going up on it. Every part is drawn as it stands: planned parts as a blue blueprint, concrete
 * poured and roofs tiled as they go, and walls laid brick by brick, course by course, by the gangs
 * standing at them; scaffolding round the storeys under way, a tower crane over a tall job, the
 * materials stacked out front. Finished, the scaffolding comes down, the hoarding goes, and at night
 * the windows of the let flats light up.
 */
import * as THREE from "three";
import { Rig } from "@/nextx/rig";
import { ITEMS, type ItemId } from "../data";
import { PARTS, fillAt, floorAt, loadBearing, plotDef, topLevel, units, type Part, type PlotDef, type Property } from "../estate";
import type { State } from "../sim";
import { asphaltTexture, box, brickTexture, car, floorTexture, mat, palletGeometry, person, roofTexture, signTexture, streetLamp, tree, woodTexture, type PersonModel } from "./models";
import { Daylight, planeHit, type View3D } from "./view";
import type { Quality } from "./world";

/** A cell is 2 m, a storey 3 m (world units are metres here). */
export const CELL = 2;
export const STOREY = 3;
const SLAB = 0.3;
const WALL_H = STOREY - SLAB;
const T = 0.3;
const COURSES = 36;
const COURSE_H = WALL_H / COURSES;
/** The low wall round a flat roof, and the slab a roof is. */
const PARAPET = 0.75;
const ROOF_T = 0.26;

/** What the camera's pointed at and which storeys show. */
export interface BuildCursor {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  l: number;
  /** A wall-height box (walls, windows, doors, stairs) or a floor-thin one. */
  fill: boolean;
  ok: boolean;
}

/** A box whose texture is laid at world scale: brick courses stay the right size on any face. */
function worldBox(w: number, h: number, d: number, tile: [number, number] = [1, 0.6]) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Faces in order: +x, −x, +y, −y, +z, −z; four vertices each.
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile[0], (uv.getY(k) * dims[f][1]) / tile[1]);
    }
  return g;
}

/** An instanced mesh that grows to whatever it's asked to draw. */
class Pool {
  mesh: THREE.InstancedMesh;
  private cap: number;
  constructor(
    private geo: THREE.BufferGeometry,
    private material: THREE.Material,
    private parent: THREE.Object3D,
    private shadow = true,
    /** Tinted per instance: the colour buffer exists from the start so the shader never swaps. */
    private colored = false,
    cap = 32,
  ) {
    this.cap = cap;
    this.mesh = this.make(cap);
  }
  private make(cap: number) {
    const m = new THREE.InstancedMesh(this.geo, this.material, cap);
    m.castShadow = this.shadow;
    m.receiveShadow = true;
    m.count = 0;
    m.frustumCulled = false;
    if (this.colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.parent.add(m);
    return m;
  }
  set(ms: THREE.Matrix4[], cols?: THREE.Color[]) {
    if (ms.length > this.cap) {
      this.parent.remove(this.mesh);
      this.mesh.dispose();
      this.cap = Math.max(ms.length, this.cap * 2);
      this.mesh = this.make(this.cap);
    }
    for (let i = 0; i < ms.length; i++) this.mesh.setMatrixAt(i, ms[i]);
    if (cols) for (let i = 0; i < cols.length; i++) this.mesh.setColorAt(i, cols[i]);
    this.mesh.count = ms.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (cols && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
  }
}

const Q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const mtx = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Q.clone().setFromAxisAngle(UP, ry), new THREE.Vector3(sx, sy, sz));

/** The four ways an arm of wall can run from a cell's centre: east, south, west, north (and its turn). */
const DIRS: { dx: number; dz: number; ry: number }[] = [
  { dx: 1, dz: 0, ry: 0 },
  { dx: 0, dz: 1, ry: -Math.PI / 2 },
  { dx: -1, dz: 0, ry: Math.PI },
  { dx: 0, dz: -1, ry: Math.PI / 2 },
];

export class BuildWorld implements View3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.3, 800);
  readonly rig: Rig;
  /** Storeys above this are hidden (to see inside), and the storey the build tools work on. */
  viewLevel = 99;
  editLevel = 0;
  private day: Daylight;
  private propId = -1;
  private plot: PlotDef = plotDef("ny1");
  private statics = new THREE.Group();
  private site = new THREE.Group();
  private siteKey = "";
  private dyn = new THREE.Group();
  private key = "";
  private pools: Record<string, Pool> = {};
  private brickCache = new Map<string, THREE.Matrix4[]>();
  private builders: PersonModel[] = [];
  private walkers: { m: PersonModel; x: number; dir: number; speed: number }[] = [];
  private traffic: { g: THREE.Group; x: number; lane: number; speed: number }[] = [];
  private crane: { root: THREE.Group; jib: THREE.Group; trolley: THREE.Object3D; cable: THREE.Mesh; hook: THREE.Object3D; h: number; reach: number } | null = null;
  private craneAim = 0;
  private grid: THREE.LineSegments | null = null;
  private cursorMesh: THREE.Mesh;
  private selLine: THREE.LineSegments;
  private time = 0;
  private materials: Record<string, THREE.Material>;
  private geos: Record<string, THREE.BufferGeometry>;

  constructor(readonly quality: Quality) {
    this.rig = new Rig({ minDist: 8, maxDist: 110, minPitch: 0.25, maxPitch: 1.45 }, { target: new THREE.Vector3(10, 4, 8), dist: 46, yaw: 0.5, pitch: 0.62 });
    this.day = new Daylight(this.scene, quality !== "low", 46);
    const brick = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.88 });
    const concrete = new THREE.MeshStandardMaterial({ map: floorTexture(), color: "#c9ccd2", roughness: 0.85 });
    const plan = new THREE.MeshStandardMaterial({ color: "#5aa9ff", transparent: true, opacity: 0.22, roughness: 0.6, depthWrite: false, emissive: "#1d5fd1", emissiveIntensity: 0.25 });
    const roof = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.95 });
    (roof.map as THREE.Texture).repeat.set(1, 1);
    this.materials = {
      brick, concrete, plan, roof,
      glass: new THREE.MeshStandardMaterial({ color: "#9cc8ea", roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.55 }),
      lit: new THREE.MeshBasicMaterial({ color: "#ffd890" }),
      sill: mat("#eef0f4", 0.5),
      leaf: new THREE.MeshStandardMaterial({ map: woodTexture(), color: "#a46a3c", roughness: 0.6 }),
      stairs: mat("#b8bcc4", 0.8),
      bricky: mat("#b5502f", 0.85),
      tube: mat("#9aa3b1", 0.35, 0.7),
      board: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 }),
      pallet: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 }),
      load: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.75 }),
      plant: mat("#c3c7cf", 0.45, 0.5),
    };
    const stair = (() => {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 10; i++) {
        const g = new THREE.BoxGeometry(CELL / 10, (STOREY * (i + 1)) / 10, CELL * 0.8);
        g.translate(-CELL / 2 + (CELL / 10) * (i + 0.5), (STOREY * (i + 1)) / 20, 0);
        parts.push(g);
      }
      const merged = mergeBoxes(parts);
      parts.forEach((g) => g.dispose());
      return merged;
    })();
    const arm = (h: number) => {
      const g = worldBox(CELL / 2, h, T);
      g.translate(CELL / 4, h / 2, 0);
      return g;
    };
    this.geos = {
      found: worldBox(CELL, SLAB, CELL, [2, 2]),
      roof: worldBox(CELL + 0.02, 0.26, CELL + 0.02, [2, 2]),
      armFull: arm(WALL_H),
      armLow: arm(0.9),
      armTop: arm(0.6),
      post: (() => {
        const g = worldBox(T + 0.02, WALL_H, T + 0.02);
        g.translate(0, WALL_H / 2, 0);
        return g;
      })(),
      glass: (() => {
        const g = new THREE.BoxGeometry(CELL / 2, 1.2, 0.05);
        g.translate(CELL / 4, 0.9 + 0.6, 0);
        return g;
      })(),
      sill: (() => {
        const g = new THREE.BoxGeometry(CELL / 2, 0.06, T + 0.08);
        g.translate(CELL / 4, 0.9, 0);
        return g;
      })(),
      leaf: (() => {
        const g = new THREE.BoxGeometry(CELL / 2, 2.1, 0.07);
        g.translate(CELL / 4, 1.05, 0);
        return g;
      })(),
      stairs: stair,
      brick: new THREE.BoxGeometry(0.235, COURSE_H * 0.86, T * 0.92),
      tube: new THREE.CylinderGeometry(0.035, 0.035, 1, 6),
      board: new THREE.BoxGeometry(1, 0.05, 0.6),
      pallet: palletGeometry(),
      load: new THREE.BoxGeometry(1, 1, 1),
      parapet: arm(PARAPET),
      parapetPost: (() => {
        const g = worldBox(T + 0.02, PARAPET, T + 0.02);
        g.translate(0, PARAPET / 2, 0);
        return g;
      })(),
      // Coping stones along the top: a square one on the post, a run out to the cell's edge.
      coping: (() => {
        const a = T / 2 + 0.05;
        const g = new THREE.BoxGeometry(CELL / 2 - a, 0.07, T + 0.1);
        g.translate((a + CELL / 2) / 2, PARAPET + 0.035, 0);
        return g;
      })(),
      copingPost: (() => {
        const g = new THREE.BoxGeometry(T + 0.1, 0.07, T + 0.1);
        g.translate(0, PARAPET + 0.035, 0);
        return g;
      })(),
      ac: (() => {
        // A rooftop air-conditioning unit: a box with its fan grille on top.
        const body = new THREE.BoxGeometry(1.1, 0.7, 0.8);
        body.translate(0, 0.35, 0);
        const fan = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16);
        fan.translate(0, 0.72, 0);
        const m = mergeBoxes([body, fan]);
        body.dispose();
        fan.dispose();
        return m;
      })(),
      vent: (() => {
        const g = new THREE.CylinderGeometry(0.09, 0.09, 0.9, 10);
        g.translate(0, 0.45, 0);
        return g;
      })(),
    };
    const P = (geo: string, m: string, shadow = true, colored = false) => new Pool(this.geos[geo], this.materials[m], this.dyn, shadow, colored);
    this.pools = {
      found: P("found", "concrete"),
      slab: P("found", "concrete"),
      roof: P("roof", "roof"),
      armFull: P("armFull", "brick"),
      armLow: P("armLow", "brick"),
      armTop: P("armTop", "brick"),
      post: P("post", "brick"),
      glass: P("glass", "glass", false),
      lit: P("glass", "lit", false),
      sill: P("sill", "sill"),
      leaf: P("leaf", "leaf"),
      stairs: P("stairs", "stairs"),
      parapet: P("parapet", "brick"),
      parapetPost: P("parapetPost", "brick"),
      coping: P("coping", "sill"),
      copingPost: P("copingPost", "sill"),
      ac: P("ac", "plant"),
      vent: P("vent", "plant"),
      // The blueprint: the same shapes, see-through blue.
      planFloor: P("found", "plan", false),
      planRoof: P("roof", "plan", false),
      planArm: P("armFull", "plan", false),
      planPost: P("post", "plan", false),
      planStairs: P("stairs", "plan", false),
      // Work under way.
      bricks: P("brick", "bricky"),
      wip: P("found", "concrete"),
      wipRoof: P("roof", "roof"),
      wipStairs: P("stairs", "stairs"),
      wipLow: P("armLow", "brick"),
      wipTop: P("armTop", "brick"),
      wipPost: P("post", "brick"),
      tube: P("tube", "tube"),
      board: P("board", "board"),
      pallet: P("pallet", "pallet"),
      load: P("load", "load", true, true),
    };
    this.scene.add(this.statics, this.site, this.dyn);
    this.cursorMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#3ddc84", transparent: true, opacity: 0.35, depthWrite: false }));
    this.cursorMesh.visible = false;
    this.cursorMesh.renderOrder = 4;
    this.scene.add(this.cursorMesh);
    this.selLine = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: "#2f6fe4", depthTest: false, transparent: true }));
    this.selLine.visible = false;
    this.selLine.renderOrder = 6;
    this.scene.add(this.selLine);
  }

  get nightness() {
    return this.day.night;
  }

  bakeEnvironment(renderer: THREE.WebGLRenderer) {
    this.day.bake(renderer);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 46 : 32;
    this.camera.updateProjectionMatrix();
  }

  groundAt(nx: number, ny: number, y = 0) {
    return planeHit(this.camera, nx, ny, y);
  }

  /** The cell under a screen point, on the storey being edited (null off the plot). */
  cellAt(nx: number, ny: number): { x: number; z: number } | null {
    const hit = planeHit(this.camera, nx, ny, this.editLevel * STOREY + (this.editLevel ? SLAB : 0.02));
    if (!hit) return null;
    const x = Math.floor(hit.x / CELL);
    const z = Math.floor(hit.z / CELL);
    if (x < 0 || z < 0 || x >= this.plot.w || z >= this.plot.d) return null;
    return { x, z };
  }

  /** Point the camera at the plot. */
  frame(p: Property) {
    const plot = plotDef(p.plot);
    const h = Math.max(1, topLevel(p) + 1);
    const span = Math.max(plot.w, plot.d) * CELL;
    this.rig.jump({ target: new THREE.Vector3((plot.w * CELL) / 2, Math.min(10, h * 1.2), (plot.d * CELL) / 2), dist: 18 + span * 1.25 + h * 2, yaw: 0.45, pitch: 0.6 });
  }

  /* ---------------------------------------------------------------- the street (once a plot) */

  private buildStreet() {
    const G = this.statics;
    for (const o of [...G.children]) {
      G.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh && m.userData.own) m.geometry.dispose();
      });
    }
    const plot = this.plot;
    const W = plot.w * CELL;
    const D = plot.d * CELL;
    const big = Math.max(0.6, Math.min(1.7, 0.5 + (cityPop(plot) - 0.7) * 1.2));
    let seed = plot.id.charCodeAt(0) * 131 + plot.id.charCodeAt(1) * 17 + plot.id.charCodeAt(2);
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ground = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number, tile = 6) => {
      const geo = new THREE.PlaneGeometry(w, d);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
      const p = new THREE.Mesh(geo, m);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, y, z);
      p.receiveShadow = true;
      p.userData.own = true;
      G.add(p);
    };
    const pave = new THREE.MeshStandardMaterial({ map: floorTexture(), color: "#d6d3cc", roughness: 0.9 });
    const road = new THREE.MeshStandardMaterial({ map: asphaltTexture("#585d66"), roughness: 0.9 });
    const grass = mat("#8fbf6f", 0.95);
    // The block: pavement all round, the road in front, a park across it.
    ground(260, 140, pave, W / 2, -0.02, D / 2 - 40, 4);
    ground(260, 8, road, W / 2, -0.01, D + 7.5, 8);
    for (let x = -120; x < 140; x += 6) G.add(box(3, 0.02, 0.18, mat("#f3f1ea", 0.6), W / 2 + x, 0, D + 7.5, false));
    G.add(box(260, 0.14, 0.3, mat("#b9b6ae", 0.8), W / 2, 0, D + 3.4, false));
    G.add(box(260, 0.14, 0.3, mat("#b9b6ae", 0.8), W / 2, 0, D + 11.6, false));
    ground(260, 40, grass, W / 2, -0.015, D + 32, 8);
    for (let i = 0; i < 18; i++) {
      const t = tree(i);
      t.scale.setScalar(2.4 + r());
      t.position.set(W / 2 - 80 + i * 9 + r() * 3, 0, D + 16 + r() * 18);
      G.add(t);
    }
    // Street lamps and trees on our side, and parked cars.
    for (let x = -60; x < W + 60; x += 14) {
      const l = streetLamp();
      l.rotation.y = Math.PI / 2;
      l.position.set(x, 0, D + 3.0);
      G.add(l);
      if (x < -2 || x > W + 2) {
        const t = tree(Math.floor(x));
        t.scale.setScalar(2.2);
        t.position.set(x + 7, 0, D + 2.2);
        G.add(t);
      }
    }
    for (let i = 0; i < 6; i++) {
      const c = car(i + plot.w);
      c.rotation.y = Math.PI / 2;
      const x = i < 3 ? -30 + i * 7 : W + 10 + (i - 3) * 7;
      c.position.set(x, 0, D + 4.6);
      G.add(c);
    }
    // The neighbours: brick and rendered blocks either side and behind, taller in a bigger city.
    const facades = ["#c98b6b", "#d9cbb4", "#b8c4cf", "#e1d6c4", "#a8735a", "#cfc4b8"];
    const neighbour = (x0: number, x1: number, z0: number, z1: number, storeys: number, i: number) => {
      const h = storeys * STOREY;
      const colour = facades[i % facades.length];
      const m = new THREE.MeshStandardMaterial({ map: facadeTexture(colour, i), roughness: 0.85 });
      (m.map as THREE.Texture).repeat.set((x1 - x0) / 4, storeys);
      const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), m);
      b.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      b.castShadow = true;
      b.receiveShadow = true;
      b.userData.own = true;
      G.add(b);
      G.add(box(x1 - x0 + 0.3, 0.4, z1 - z0 + 0.3, mat("#5c6370", 0.6), (x0 + x1) / 2, h, (z0 + z1) / 2));
    };
    const st = (k: number) => Math.max(2, Math.round((2 + r() * 4) * big + k));
    neighbour(-14 - r() * 4, -1.2, 0, D, st(0), 0);
    neighbour(-34, -16, 1, D, st(1), 1);
    neighbour(W + 1.2, W + 13 + r() * 4, 0, D, st(0), 2);
    neighbour(W + 19, W + 36, 1, D, st(1), 3);
    for (let i = 0; i < 6; i++) neighbour(-30 + i * 14 + W / 2 - 40, -30 + i * 14 + 12 + W / 2 - 40, -26, -12, st(2), 4 + i);
  }

  /* ---------------------------------------------------------------- the site: hoarding, the ground, a sign */

  private buildSite(p: Property, active: boolean) {
    const G = this.site;
    for (const o of [...G.children]) {
      G.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh && m.userData.own) m.geometry.dispose();
      });
    }
    const plot = this.plot;
    const W = plot.w * CELL;
    const D = plot.d * CELL;
    const dirt = mat(active || !p.cert ? "#a8906c" : "#cfcabe", 0.95);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(W, D), dirt);
    g.rotation.x = -Math.PI / 2;
    g.position.set(W / 2, 0.005, D / 2);
    g.receiveShadow = true;
    g.userData.own = true;
    G.add(g);
    if (!p.cert || active) {
      // Hoarding round the plot (open at the gate), with the company's sign.
      const ply = new THREE.MeshStandardMaterial({ map: woodTexture(), color: "#e8dcc8", roughness: 0.85 });
      const post = mat("#3a414f", 0.6);
      const seg = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const b = new THREE.Mesh(new THREE.BoxGeometry(len, 2.2, 0.06), ply);
        b.position.set((x0 + x1) / 2, 1.1, (z0 + z1) / 2);
        b.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        b.castShadow = true;
        b.userData.own = true;
        G.add(b);
        G.add(box(0.1, 2.3, 0.1, post, x0, 0, z0));
      };
      const e = 0.6;
      seg(-e, D + e, W / 2 - 2.5, D + e);
      seg(W / 2 + 2.5, D + e, W + e, D + e);
      seg(-e, -e, -e, D + e);
      seg(W + e, -e, W + e, D + e);
      seg(-e, -e, W + e, -e);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.3), new THREE.MeshBasicMaterial({ map: signTexture("WareForge Developments", "#2f6fe4") }));
      sign.position.set(W / 4 - 0.6, 1.3, D + e + 0.05);
      sign.userData.own = true;
      G.add(sign);
    } else {
      // A finished building: a paved forecourt and a name plate.
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: signTexture(plot.address, "#1b2236") }));
      plate.position.set(W / 2, 3.25, D + 0.2);
      plate.userData.own = true;
      G.add(plate);
      for (const x of [1, W - 1]) {
        const t = tree(x);
        t.scale.setScalar(1.8);
        t.position.set(x, 0, D + 1.4);
        G.add(t);
      }
    }
  }

  /* ---------------------------------------------------------------- the building */

  /** Which ways a wall-type part's arms run: toward wall neighbours, or along the plot edge if it has none. */
  private arms(p: Property, part: Part) {
    const out: number[] = [];
    DIRS.forEach((d, i) => {
      const n = fillAt(p, part.x + d.dx, part.z + d.dz, part.l);
      if (n && loadBearing(n.k)) out.push(i);
    });
    if (out.length === 0) {
      const edgeZ = part.z === 0 || part.z === this.plot.d - 1;
      return edgeZ || !(part.x === 0 || part.x === this.plot.w - 1) ? [0, 2] : [1, 3];
    }
    // A wall that ends here still fills its own cell across.
    if (out.length === 1) out.push((out[0] + 2) % 4);
    return out;
  }

  /** Bricks of a wall-type part in the order they're laid (course by course, the post then the arms). */
  private brickPlan(p: Property, part: Part, arms: number[]) {
    const k = `${part.x},${part.z},${part.l},${part.k},${arms.join("")}`;
    let out = this.brickCache.get(k);
    if (out) return out;
    out = [];
    const cx = (part.x + 0.5) * CELL;
    const cz = (part.z + 0.5) * CELL;
    const y0 = part.l * STOREY + SLAB;
    for (let c = 0; c < COURSES; c++) {
      const y = y0 + (c + 0.5) * COURSE_H;
      const band = part.k === "wall" || (part.k === "window" ? c < 12 || c >= 28 : c >= 28);
      out.push(mtx(cx, y, cz, c % 2 ? Math.PI / 2 : 0, 1.2, 1, 1));
      if (!band) continue;
      for (const a of arms) {
        const d = DIRS[a];
        const odd = c % 2 === 1;
        for (let i = 0; i < 4; i++) {
          const along = 0.15 + (i + (odd ? 0.5 : 0)) * 0.235;
          if (along > CELL / 2 - 0.05) continue;
          out.push(mtx(cx + d.dx * along, y, cz + d.dz * along, d.ry));
        }
      }
    }
    this.brickCache.set(k, out);
    return out;
  }

  /**
   * A floor slab's box. Where it ends over a wall it stops just past the wall's outer face, so the
   * outside of the building runs flush instead of every storey's slab jutting out half a cell.
   */
  private floorBox(p: Property, part: Part, y: number) {
    const wall = (l: number) => {
      const f = fillAt(p, part.x, part.z, l);
      return !!f && loadBearing(f.k);
    };
    let x0 = -CELL / 2;
    let x1 = CELL / 2;
    let z0 = -CELL / 2;
    let z1 = CELL / 2;
    if (wall(part.l) || wall(part.l - 1)) {
      const cut = T / 2 + 0.1;
      if (!floorAt(p, part.x + 1, part.z, part.l)) x1 = cut;
      if (!floorAt(p, part.x - 1, part.z, part.l)) x0 = -cut;
      if (!floorAt(p, part.x, part.z + 1, part.l)) z1 = cut;
      if (!floorAt(p, part.x, part.z - 1, part.l)) z0 = -cut;
    }
    const cx = (part.x + 0.5) * CELL;
    const cz = (part.z + 0.5) * CELL;
    return mtx(cx + (x0 + x1) / 2, y, cz + (z0 + z1) / 2, 0, (x1 - x0) / CELL, 1, (z1 - z0) / CELL);
  }

  /** A finished roof over an outside wall: the wall carries on up as a parapet. */
  private parapetAt(p: Property, x: number, z: number, l: number) {
    const r = floorAt(p, x, z, l);
    if (!r || r.k !== "roof" || !r.done) return false;
    const below = fillAt(p, x, z, l - 1);
    if (!below || !loadBearing(below.k) || fillAt(p, x, z, l)) return false;
    return DIRS.some((d) => !floorAt(p, x + d.dx, z + d.dz, l));
  }

  /** Rebuild what's built and what's planned (when parts are added, finished, or the view's storey changes). */
  private rebuild(p: Property, night: boolean) {
    this.brickCache.clear();
    const L: Record<string, THREE.Matrix4[]> = {};
    const add = (k: string, m: THREE.Matrix4) => (L[k] ??= []).push(m);
    // Windows of let units light up at night.
    const litWins = new Set<string>();
    if (night)
      for (const u of units(p).units) {
        if (!p.tenants[u.key]) continue;
        for (const ck of u.keys) {
          const l = Math.floor(ck / 10_000);
          const z = Math.floor((ck % 10_000) / 100);
          const x = ck % 100;
          for (const d of DIRS) litWins.add(`${x + d.dx},${z + d.dz},${l}`);
        }
      }
    for (const part of p.parts) {
      if (part.l > this.viewLevel + (PARTS[part.k].layer === "floor" && part.k === "roof" ? 1 : 0)) continue;
      if (PARTS[part.k].layer === "floor" && part.l > this.viewLevel) continue;
      const cx = (part.x + 0.5) * CELL;
      const cz = (part.z + 0.5) * CELL;
      const fresh = !part.done && !part.paid && part.prog === 0 && part.stage === 0;
      if (PARTS[part.k].layer === "floor") {
        const y = part.k === "roof" ? part.l * STOREY + ROOF_T / 2 : part.l * STOREY + SLAB / 2;
        const m = this.floorBox(p, part, y);
        if (part.done) add(part.k === "found" ? "found" : part.k === "slab" ? "slab" : "roof", m);
        else add(part.k === "roof" ? "planRoof" : "planFloor", m);
        if (part.k === "roof" && part.done) {
          const yr = part.l * STOREY + ROOF_T;
          if (this.parapetAt(p, part.x, part.z, part.l)) {
            add("parapetPost", mtx(cx, yr, cz));
            add("copingPost", mtx(cx, yr, cz));
            for (const d of DIRS)
              if (this.parapetAt(p, part.x + d.dx, part.z + d.dz, part.l)) {
                add("parapet", mtx(cx, yr, cz, d.ry));
                add("coping", mtx(cx, yr, cz, d.ry));
              }
          } else if (!DIRS.some((d) => !floorAt(p, part.x + d.dx, part.z + d.dz, part.l))) {
            // Plant on the roof, away from the edge: an air-conditioning unit here, a vent there.
            const h = (part.x * 73 + part.z * 151 + part.l * 37) % 17;
            if (h === 3) add("ac", mtx(cx, yr, cz, (part.x + part.z) % 2 ? 0 : Math.PI / 2));
            else if (h === 9 || h === 14) add("vent", mtx(cx + 0.4, yr, cz - 0.3));
          }
        }
        continue;
      }
      const y0 = part.l * STOREY + SLAB;
      if (part.k === "stairs") {
        add(part.done ? "stairs" : "planStairs", mtx(cx, y0, cz));
        continue;
      }
      const arms = this.arms(p, part);
      if (part.done) {
        add("post", mtx(cx, y0, cz));
        for (const a of arms) {
          const d = DIRS[a];
          if (part.k === "wall") add("armFull", mtx(cx, y0, cz, d.ry));
          else if (part.k === "window") {
            add("armLow", mtx(cx, y0, cz, d.ry));
            add("armTop", mtx(cx, y0 + 2.1, cz, d.ry));
            add("sill", mtx(cx, y0, cz, d.ry));
            add(litWins.has(`${part.x},${part.z},${part.l}`) ? "lit" : "glass", mtx(cx, y0, cz, d.ry));
          } else {
            add("armTop", mtx(cx, y0 + 2.1, cz, d.ry));
            add("leaf", mtx(cx, y0, cz, d.ry));
          }
        }
      } else if (fresh || part.stage === 0) {
        // The blueprint of what's to come (bricks going up are drawn on top, as they're laid).
        add("planPost", mtx(cx, y0, cz));
        for (const a of arms) add("planArm", mtx(cx, y0, cz, DIRS[a].ry));
      }
    }
    for (const k of ["found", "slab", "roof", "parapet", "parapetPost", "coping", "copingPost", "ac", "vent", "armFull", "armLow", "armTop", "post", "glass", "lit", "sill", "leaf", "stairs", "planFloor", "planRoof", "planArm", "planPost", "planStairs"]) this.pools[k].set(L[k] ?? []);
  }

  /** Work under way, every frame: bricks laid so far, concrete poured, tiles on, windows waiting for glass. */
  private syncWork(p: Property) {
    const bricks: THREE.Matrix4[] = [];
    const wip: THREE.Matrix4[] = [];
    const wipRoof: THREE.Matrix4[] = [];
    const wipStairs: THREE.Matrix4[] = [];
    const wipLow: THREE.Matrix4[] = [];
    const wipTop: THREE.Matrix4[] = [];
    const wipPost: THREE.Matrix4[] = [];
    const active: Part[] = [];
    for (const part of p.parts) {
      if (part.done || (!part.paid && part.prog === 0 && part.stage === 0)) continue;
      if (part.l > this.viewLevel) continue;
      const cx = (part.x + 0.5) * CELL;
      const cz = (part.z + 0.5) * CELL;
      const f = Math.max(0.04, part.prog);
      if (part.prog > 0) active.push(part);
      if (PARTS[part.k].layer === "floor") {
        if (part.k === "roof") wipRoof.push(mtx(cx - (CELL * (1 - f)) / 2, part.l * STOREY + ROOF_T / 2, cz, 0, f, 1, 1));
        else wip.push(mtx(cx, part.l * STOREY + (SLAB * f) / 2, cz, 0, 1, f, 1));
        continue;
      }
      const y0 = part.l * STOREY + SLAB;
      if (part.k === "stairs") {
        wipStairs.push(mtx(cx, y0, cz, 0, 1, f, 1));
        continue;
      }
      const arms = this.arms(p, part);
      if (part.stage === 0) {
        const plan = this.brickPlan(p, part, arms);
        const n = Math.floor(plan.length * part.prog);
        for (let i = 0; i < n; i++) bricks.push(plan[i]);
      } else {
        // Brickwork done; the carpenters are fitting the frame and glass, or hanging the door.
        wipPost.push(mtx(cx, y0, cz));
        for (const a of arms) {
          const d = DIRS[a];
          if (part.k === "window") wipLow.push(mtx(cx, y0, cz, d.ry));
          wipTop.push(mtx(cx, y0 + 2.1, cz, d.ry));
        }
      }
    }
    this.pools.bricks.set(bricks);
    this.pools.wip.set(wip);
    this.pools.wipRoof.set(wipRoof);
    this.pools.wipStairs.set(wipStairs);
    this.pools.wipLow.set(wipLow);
    this.pools.wipTop.set(wipTop);
    this.pools.wipPost.set(wipPost);
    return active;
  }

  /** Scaffolding round the storeys under way: standards, ledgers and boards on every lift. */
  private syncScaffold(p: Property, building: boolean) {
    const tubes: THREE.Matrix4[] = [];
    const boards: THREE.Matrix4[] = [];
    if (building) {
      const founds = p.parts.filter((x) => x.k === "found");
      if (founds.length) {
        const x0 = Math.min(...founds.map((x) => x.x)) * CELL - 0.8;
        const x1 = (Math.max(...founds.map((x) => x.x)) + 1) * CELL + 0.8;
        const z0 = Math.min(...founds.map((x) => x.z)) * CELL - 0.8;
        const z1 = (Math.max(...founds.map((x) => x.z)) + 1) * CELL + 0.8;
        const upTo = p.parts.reduce((a, x) => (PARTS[x.k].layer === "fill" && (x.done || x.prog > 0 || x.paid) ? Math.max(a, x.l + 1) : a), 0);
        if (upTo > 0) {
          const H = upTo * STOREY + 1;
          const edge = (ax: number, az: number, bx: number, bz: number) => {
            const len = Math.hypot(bx - ax, bz - az);
            const n = Math.max(1, Math.round(len / 2.4));
            const ry = -Math.atan2(bz - az, bx - ax);
            for (let i = 0; i <= n; i++) {
              const x = ax + ((bx - ax) * i) / n;
              const z = az + ((bz - az) * i) / n;
              tubes.push(mtx(x, H / 2, z, 0, 1, H, 1));
            }
            for (let l = 0; l <= upTo; l++) {
              const y = l * STOREY + SLAB;
              boards.push(mtx((ax + bx) / 2, y, (az + bz) / 2, ry, len, 1, 1));
              // Guard rail a metre up, and a ledger at the board.
              for (const yy of [y + 1, y + 0.05]) {
                const m = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, yy, (az + bz) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, Math.PI / 2)), new THREE.Vector3(1, len, 1));
                tubes.push(m);
              }
            }
          };
          edge(x0, z1, x1, z1);
          edge(x0, z0, x1, z0);
          edge(x0, z0, x0, z1);
          edge(x1, z0, x1, z1);
        }
      }
    }
    this.pools.tube.set(tubes);
    this.pools.board.set(boards);
  }

  /** Materials stacked out front, a pallet for every one on site (up to four of each). */
  private syncStock(p: Property) {
    const pal: THREE.Matrix4[] = [];
    const load: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const D = this.plot.d * CELL;
    let i = 0;
    for (const [item, n] of Object.entries(p.stock) as [ItemId, number][]) {
      if (n < 0.05) continue;
      const k = Math.min(4, Math.ceil(n));
      for (let j = 0; j < k; j++) {
        const x = 1 + i * 1.3;
        const z = D + 1.5 + (j % 2) * 1.2;
        const y = Math.floor(j / 2) * 0.9;
        if (x > this.plot.w * CELL - 1) break;
        pal.push(mtx(x, y, z, 0, 1.1, 1, 1.1));
        load.push(mtx(x, y + 0.15 + 0.32, z, 0, 1.0, 0.64, 1.0));
        cols.push(new THREE.Color(ITEMS[item].load));
      }
      i++;
    }
    this.pools.pallet.set(pal);
    this.pools.load.set(load, cols);
  }

  /** The gangs at work: a builder at every part under way. */
  private syncBuilders(active: Part[]) {
    const want = Math.min(16, active.length);
    while (this.builders.length < want) {
      const m = person(this.builders.length + 3);
      m.group.scale.setScalar(1.6);
      this.dyn.add(m.group);
      this.builders.push(m);
    }
    this.builders.forEach((m, i) => {
      const part = active[i];
      m.group.visible = !!part;
      if (!part) return;
      const cx = (part.x + 0.5) * CELL;
      const cz = (part.z + 0.5) * CELL;
      const fill = PARTS[part.k].layer === "fill";
      // Stand beside the wall, on the inside, facing it.
      const ox = fill ? (part.x === 0 ? 0.75 : part.x === this.plot.w - 1 ? -0.75 : 0) : 0.4;
      const oz = fill ? (part.z === this.plot.d - 1 ? -0.75 : part.z === 0 ? 0.75 : 0.75) : 0.4;
      const y = part.l * STOREY + (part.k === "found" ? 0 : part.k === "roof" ? 0.26 : SLAB);
      m.group.position.set(cx + ox, y + (PARTS[part.k].layer === "floor" && part.k !== "found" && part.k !== "roof" ? 0 : 0), cz + oz);
      m.group.rotation.y = Math.atan2(-ox, -oz);
      const ph = this.time * 5 + i;
      m.legs[0].rotation.x = Math.sin(ph) * 0.15;
      m.legs[1].rotation.x = -Math.sin(ph) * 0.15;
      m.group.position.y += Math.abs(Math.sin(ph * 0.5)) * 0.05;
    });
  }

  /** A tower crane over a job of three storeys or more, its jib swinging to the work. */
  private syncCrane(p: Property, active: Part[], building: boolean, dt: number) {
    const tall = topLevel(p) + 1 >= 3;
    if (!(building && tall)) {
      if (this.crane) {
        this.dyn.remove(this.crane.root);
        this.crane = null;
      }
      return;
    }
    const levels = topLevel(p) + 1;
    const h = (levels + 3) * STOREY;
    const reach = Math.max(this.plot.w, this.plot.d) * CELL + 6;
    if (!this.crane || this.crane.h !== h) {
      if (this.crane) this.dyn.remove(this.crane.root);
      const root = new THREE.Group();
      const yellow = mat("#f2b632", 0.45, 0.3);
      const dark = mat("#2b2d33", 0.6);
      root.add(box(1.4, 0.6, 1.4, mat("#9aa3b1", 0.8), 0, 0, 0));
      for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) root.add(box(0.12, h, 0.12, yellow, x, 0.6, z));
      for (let y = 2; y < h; y += 2) {
        root.add(box(1.0, 0.08, 0.08, yellow, 0, 0.6 + y, -0.45));
        root.add(box(1.0, 0.08, 0.08, yellow, 0, 0.6 + y, 0.45));
        root.add(box(0.08, 0.08, 1.0, yellow, -0.45, 0.6 + y, 0));
        root.add(box(0.08, 0.08, 1.0, yellow, 0.45, 0.6 + y, 0));
      }
      const jib = new THREE.Group();
      jib.position.y = h + 0.6;
      jib.add(box(reach, 0.5, 0.6, yellow, reach / 2, 0, 0));
      jib.add(box(7, 0.5, 0.6, yellow, -3.5, 0, 0));
      jib.add(box(2, 1.4, 1.2, mat("#9aa3b1", 0.7), -6, -0.9, 0));
      jib.add(box(1.4, 1.4, 1.4, mat("#e8ecf4", 0.4), 0, -1.4, 0.9));
      jib.add(box(0.12, 3, 0.12, yellow, 0, 0.5, 0));
      const trolley = box(0.8, 0.3, 0.8, dark, 8, -0.3, 0);
      jib.add(trolley);
      const cable = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1, 0.04), dark);
      cable.userData.own = true;
      jib.add(cable);
      const hook = box(0.35, 0.5, 0.35, mat("#f2b632", 0.4, 0.3), 0, 0, 0);
      jib.add(hook);
      root.add(jib);
      root.position.set((this.plot.w * CELL) / 2, 0, -4);
      this.dyn.add(root);
      this.crane = { root, jib, trolley, cable, hook, h, reach };
    }
    const c = this.crane;
    const job = active.find((x) => x.k === "slab" || x.k === "roof" || x.k === "stairs") ?? active[0];
    const tx = job ? (job.x + 0.5) * CELL : (this.plot.w * CELL) / 2;
    const tz = job ? (job.z + 0.5) * CELL : (this.plot.d * CELL) / 2;
    const ty = job ? job.l * STOREY + 1.5 : 2;
    const dx = tx - c.root.position.x;
    const dz = tz - c.root.position.z;
    const aim = -Math.atan2(dz, dx);
    this.craneAim += Math.atan2(Math.sin(aim - this.craneAim), Math.cos(aim - this.craneAim)) * Math.min(1, dt * 0.6);
    c.jib.rotation.y = this.craneAim;
    const dist = Math.min(c.reach - 1, Math.hypot(dx, dz));
    c.trolley.position.x += (dist - c.trolley.position.x) * Math.min(1, dt * 0.8);
    const drop = Math.max(1, c.h + 0.6 - ty);
    c.cable.scale.y = drop;
    c.cable.position.set(c.trolley.position.x, -drop / 2 - 0.3, 0);
    c.hook.position.set(c.trolley.position.x, -drop - 0.5, 0);
  }

  /** People along the pavement and cars down the road. */
  private syncStreet(dt: number) {
    const D = this.plot.d * CELL;
    const W = this.plot.w * CELL;
    while (this.walkers.length < 5) {
      const m = person(this.walkers.length + 20);
      m.group.scale.setScalar(1.6);
      this.statics.add(m.group);
      this.walkers.push({ m, x: -40 + this.walkers.length * 21, dir: this.walkers.length % 2 ? 1 : -1, speed: 1.1 + (this.walkers.length % 3) * 0.2 });
    }
    for (const w of this.walkers) {
      w.x += w.dir * w.speed * dt;
      if (w.x > W + 60) w.x = -60;
      if (w.x < -60) w.x = W + 60;
      w.m.group.position.set(w.x, 0, D + 2.4 + (w.dir > 0 ? 0 : 0.6));
      w.m.group.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const ph = this.time * 6 + w.x;
      w.m.legs[0].rotation.x = Math.sin(ph) * 0.5;
      w.m.legs[1].rotation.x = -Math.sin(ph) * 0.5;
    }
    while (this.traffic.length < 3) {
      const g = car(this.traffic.length * 3 + 1);
      this.statics.add(g);
      this.traffic.push({ g, x: -80 + this.traffic.length * 60, lane: this.traffic.length % 2, speed: 9 + this.traffic.length * 2 });
    }
    for (const c of this.traffic) {
      const dir = c.lane ? -1 : 1;
      c.x += dir * c.speed * dt;
      if (c.x > W + 120) c.x = -120;
      if (c.x < -120) c.x = W + 120;
      c.g.position.set(c.x, 0, D + (c.lane ? 9.4 : 5.8));
      c.g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  /** The grid on the storey being built on, and the tool's footprint. */
  setCursor(c: BuildCursor | null) {
    const m = this.cursorMesh;
    if (!c) {
      m.visible = false;
      return;
    }
    const x0 = Math.min(c.x0, c.x1) * CELL;
    const x1 = (Math.max(c.x0, c.x1) + 1) * CELL;
    const z0 = Math.min(c.z0, c.z1) * CELL;
    const z1 = (Math.max(c.z0, c.z1) + 1) * CELL;
    const h = c.fill ? WALL_H : 0.34;
    const y = c.l * STOREY + (c.fill ? SLAB : 0);
    m.visible = true;
    m.scale.set(x1 - x0 + 0.04, h, z1 - z0 + 0.04);
    m.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
    (m.material as THREE.MeshBasicMaterial).color.set(c.ok ? "#3ddc84" : "#ff5a5f");
  }

  /** Outline a cell on a storey (the part you've tapped). */
  select(sel: { x: number; z: number; l: number } | null) {
    this.selLine.visible = !!sel;
    if (!sel) return;
    this.selLine.scale.set(CELL + 0.1, STOREY, CELL + 0.1);
    this.selLine.position.set((sel.x + 0.5) * CELL, sel.l * STOREY + STOREY / 2, (sel.z + 0.5) * CELL);
  }

  private syncGrid(show: boolean) {
    const plot = this.plot;
    if (!this.grid) {
      const pts: number[] = [];
      for (let x = 0; x <= plot.w; x++) pts.push(x * CELL, 0, 0, x * CELL, 0, plot.d * CELL);
      for (let z = 0; z <= plot.d; z++) pts.push(0, 0, z * CELL, plot.w * CELL, 0, z * CELL);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false }));
      this.grid.renderOrder = 3;
      this.scene.add(this.grid);
    }
    this.grid.visible = show;
    this.grid.position.y = this.editLevel * STOREY + (this.editLevel ? SLAB : 0) + 0.03;
  }

  /** Keep in step with a property: called every frame while it's showing. */
  sync(s: State, p: Property, dt: number, opts: { editing: boolean; daylight?: "cycle" | "day" }) {
    this.time += dt;
    if (p.id !== this.propId) {
      this.propId = p.id;
      this.plot = plotDef(p.plot);
      this.key = "";
      this.siteKey = "";
      if (this.grid) {
        this.scene.remove(this.grid);
        this.grid.geometry.dispose();
        this.grid = null;
      }
      this.buildStreet();
      this.frame(p);
    }
    const building = p.permit === "granted" && p.parts.some((x) => !x.done);
    const siteKey = `${building}|${p.cert}`;
    if (siteKey !== this.siteKey) {
      this.siteKey = siteKey;
      this.buildSite(p, building);
    }
    const lamps = this.day.sync(s.time, this.rig.cur.target, { storm: s.event?.kind === "storm", day: opts.daylight === "day" });
    const night = lamps > 0.3;
    let doneN = 0;
    let stages = 0;
    for (const x of p.parts) {
      if (x.done) doneN++;
      stages += x.stage + (x.paid ? 0.5 : 0);
    }
    const key = `${p.rev}|${p.parts.length}|${doneN}|${stages}|${this.viewLevel}|${night}|${Object.keys(p.tenants).length}`;
    if (key !== this.key) {
      this.key = key;
      this.rebuild(p, night);
    }
    const active = this.syncWork(p);
    this.syncScaffold(p, building);
    this.syncStock(p);
    this.syncBuilders(active);
    this.syncCrane(p, active, building, dt);
    this.syncStreet(dt);
    this.syncGrid(opts.editing);
  }

  update(dt: number) {
    this.rig.step(dt, this.camera);
    this.day.follow(this.camera, dt);
  }

  dispose() {
    for (const p of Object.values(this.pools)) p.dispose();
    for (const g of Object.values(this.geos)) g.dispose();
    for (const G of [this.statics, this.site, this.dyn])
      G.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh && m.userData.own) m.geometry.dispose();
      });
    this.grid?.geometry.dispose();
    this.day.dispose();
  }
}

/** Merge plain boxes into one geometry (position, normal, uv). */
function mergeBoxes(parts: THREE.BufferGeometry[]) {
  let n = 0;
  let idx = 0;
  for (const g of parts) {
    n += g.attributes.position.count;
    idx += g.index!.count;
  }
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const index = new Uint32Array(idx);
  let o = 0;
  let io = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    const gi = g.index!.array;
    for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + o;
    o += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

const facadeCache = new Map<string, THREE.Texture>();
/** A facade a storey high and 4 m wide: a band of wall, a window with a frame and a sill. */
function facadeTexture(colour: string, i: number) {
  const k = `${colour}|${i % 3}`;
  let t = facadeCache.get(k);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = colour;
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = "rgba(0,0,0,0.08)";
  for (let y = 0; y < 96; y += 6) g.fillRect(0, y, 128, 1);
  const wide = i % 3 === 0;
  const x0 = wide ? 16 : 34;
  const w = wide ? 96 : 60;
  g.fillStyle = "#f3f1ea";
  g.fillRect(x0 - 4, 18, w + 8, 56);
  g.fillStyle = i % 2 ? "#5d7a99" : "#6f8aa8";
  g.fillRect(x0, 22, w, 48);
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(x0 + 4, 26, w * 0.35, 40);
  g.fillStyle = "#f3f1ea";
  g.fillRect(x0 + w / 2 - 2, 22, 4, 48);
  g.fillRect(x0 - 6, 72, w + 12, 5);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  facadeCache.set(k, t);
  return t;
}

const POPS: Record<string, number> = {};
function cityPop(plot: PlotDef) {
  return (POPS[plot.city] ??= { "New York": 1.6, Philadelphia: 1.25, Boston: 1.25, Washington: 1.15, Baltimore: 1, Pittsburgh: 0.95, Newark: 0.9, Cleveland: 0.9, Richmond: 0.85, Buffalo: 0.8, Hartford: 0.75, Providence: 0.75, Albany: 0.7 }[plot.city] ?? 1);
}

