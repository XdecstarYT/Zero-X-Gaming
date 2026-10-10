/**
 * WareForge's 3D world: the building (a cut-away dollhouse, so you can see in), the dock wall
 * and its doors, the yard and the road, racks, machines, pallets, forklifts and trucks, all kept
 * in step with the simulation every frame. Clean pastel look: soft daylight, ACES grading,
 * image-based light and soft shadows.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Rig } from "@/nextx/rig";
import { AISLE_Z, DAY, DOCK_Z, GRID_W, HOUR, ITEMS, MACHINES, RAIL_DOORS, RAIL_Z, ROAD_Z, STAGE_Z, TRUCK_PHASE, WIDTH_FULL, WIDTH_MEGA, doorX0, siteDef, type SiteDef } from "../data";
import { LEVEL_H, doorName, rackLevels, route, width, type Focus, type Pallet, type State, type Truck } from "../sim";
import {
  COL, CONTAINER_COLORS, TRAILER_LEN, asphaltTexture, box, car, charger, crane, floorTexture, forklift, gatehouse, lampMat, loadTexture, machine, mat, office, person, pin,
  signTexture, streetLamp, train, tree, truck, windowMat, type ForkModel, type MachineModel, type PersonModel, type TrainModel, type TruckModel,
} from "./models";

export type Quality = "high" | "low";

export interface Ghost {
  x: number;
  z: number;
  w: number;
  d: number;
  ok: boolean;
  /** Racks: the side forklifts pick from (0 south, 1 north). */
  rot?: number;
  rack?: boolean;
}

const MAX_PALLETS = 1400;
const LANE_IN = ROAD_Z + 2.3;
const LANE_OUT = ROAD_Z + 0.9;

/** Where a train is (the middle of its two wagons); it always runs along +x. */
export function trainPose(t: Truck): { x: number; z: number; rot: number; visible: boolean } {
  const cx = t.door >= 0 ? RAIL_DOORS[t.door] + 1.5 : 0;
  const u = Math.min(1, t.t / TRUCK_PHASE);
  const ease = (v: number) => 1 - (1 - v) * (1 - v);
  switch (t.state) {
    case "arriving":
      return { x: -70 + (cx + 70) * ease(u), z: RAIL_Z, rot: 0, visible: true };
    case "docked":
      return { x: cx, z: RAIL_Z, rot: 0, visible: true };
    case "leaving":
      return { x: cx + (GRID_W + 80 - cx) * u * u, z: RAIL_Z, rot: 0, visible: true };
    default:
      return { x: 0, z: 0, rot: 0, visible: false };
  }
}

/** Where a truck is (the middle of its trailer's rear) and which way it faces. */
export function truckPose(s: State, t: Truck): { x: number; z: number; rot: number; visible: boolean } {
  if (t.rail) return trainPose(t);
  const cx = t.door >= 0 ? doorX0(t.door) + 1.5 : 0;
  const u = Math.min(1, t.t / TRUCK_PHASE);
  const ease = (v: number) => v * v * (3 - 2 * v);
  switch (t.state) {
    case "queued": {
      const q = s.trucks.filter((x) => x.state === "queued");
      const k = q.indexOf(t);
      return { x: width(s) + 3.2 + k * 3.1, z: DOCK_Z + 1.4, rot: 0, visible: true };
    }
    case "arriving": {
      const e = ease(u);
      return { x: GRID_W + 40 + (cx - 7 - GRID_W - 40) * e, z: LANE_IN, rot: -Math.PI / 2, visible: true };
    }
    case "backing": {
      const e = ease(u);
      const p0 = [cx - 7, LANE_IN];
      const p1 = [cx, LANE_IN];
      const p2 = [cx, DOCK_Z + 0.15];
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      const c = e * e;
      const tx = 2 * (1 - e) * (p1[0] - p0[0]) + 2 * e * (p2[0] - p1[0]);
      const tz = 2 * (1 - e) * (p1[1] - p0[1]) + 2 * e * (p2[1] - p1[1]);
      return { x: a * p0[0] + b * p1[0] + c * p2[0], z: a * p0[1] + b * p1[1] + c * p2[1], rot: Math.atan2(-tx, -tz), visible: true };
    }
    case "docked":
      return { x: cx, z: DOCK_Z + 0.15, rot: 0, visible: true };
    case "leaving": {
      if (u < 0.6) {
        const e = ease(u / 0.6);
        const p0 = [cx, DOCK_Z + 0.15];
        const p1 = [cx, LANE_OUT];
        const p2 = [cx + 12, LANE_OUT];
        const a = (1 - e) * (1 - e);
        const b = 2 * (1 - e) * e;
        const c = e * e;
        const tx = 2 * (1 - e) * (p1[0] - p0[0]) + 2 * e * (p2[0] - p1[0]);
        const tz = 2 * (1 - e) * (p1[1] - p0[1]) + 2 * e * (p2[1] - p1[1]);
        return { x: a * p0[0] + b * p1[0] + c * p2[0], z: a * p0[1] + b * p1[1] + c * p2[1], rot: Math.atan2(tx, tz), visible: true };
      }
      const e = (u - 0.6) / 0.4;
      return { x: cx + 12 + (GRID_W + 60 - cx - 12) * e * e, z: LANE_OUT, rot: Math.PI / 2, visible: true };
    }
    default:
      return { x: 0, z: 0, rot: 0, visible: false };
  }
}

/** A trailer's cargo position, relative to its rear. */
const cargoLocal = (ci: number) => ({ x: ci % 2 ? 0.55 : -0.55, z: 1.4 + Math.floor(ci / 2) * 1.0 });

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
  readonly rig: Rig;
  private layoutGroup = new THREE.Group();
  private layoutKey = "";
  private sun: THREE.DirectionalLight;
  private palletBase: THREE.InstancedMesh;
  private palletLoad: THREE.InstancedMesh;
  private forks: ForkModel[] = [];
  private trucks = new Map<number, TruckModel & { carrier: number }>();
  private trains = new Map<number, TrainModel>();
  private chargers = new Map<number, { leds: THREE.Mesh[] }>();
  private workers: { m: PersonModel; path: [number, number][]; x: number; z: number; wait: number; speed: number }[] = [];
  private hemi: THREE.HemisphereLight;
  private night = 0;
  /** Lights that come on at night (switched off by day). */
  private nightLights: THREE.PointLight[] = [];
  private scenery = new THREE.Group();
  private sceneryKey = "";
  private barrier: THREE.Group | null = null;
  private palletWrap!: THREE.InstancedMesh;
  private spots: THREE.Mesh[] = [];
  /** How bright the night is (0 day … 1 night), for bloom and exposure. */
  get nightness() {
    return this.night;
  }
  private machines = new Map<number, MachineModel>();
  private shutters: { door: number; mesh: THREE.Mesh }[] = [];
  private pinObj = pin();
  private selLine: THREE.LineLoop;
  private ghost: THREE.Mesh;
  private ghostArrow: THREE.Mesh;
  private tmp = new THREE.Object3D();
  private col = new THREE.Color();
  private time = 0;
  private picks: { box: THREE.Box3; focus: Focus }[] = [];

  constructor(readonly quality: Quality) {
    this.scene.background = new THREE.Color("#e8ebf6");
    this.scene.fog = new THREE.Fog("#e8ebf6", 120, 320);
    this.rig = new Rig(
      { minDist: 10, maxDist: 120, minPitch: 0.42, maxPitch: 1.42, bounds: { x0: -6, z0: -2, x1: GRID_W + 10, z1: 40 } },
      { target: new THREE.Vector3(14, 0, 17), dist: 58, yaw: 0.42, pitch: 0.88 },
    );
    this.hemi = new THREE.HemisphereLight("#f6f7ff", "#cfd3e6", 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff5e6", 2.3);
    this.sun.position.set(-22, 60, 40);
    this.sun.target.position.set(22, 0, 16);
    this.scene.add(this.sun, this.sun.target);
    if (quality === "high") {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const c = this.sun.shadow.camera;
      c.left = -50;
      c.right = 50;
      c.top = 44;
      c.bottom = -44;
      c.near = 10;
      c.far = 200;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.03;
      this.sun.shadow.radius = 4;
    }
    this.scene.add(this.layoutGroup, this.scenery);
    this.buildScenery();
    // Floodlights for the night.
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight("#ffd9a0", 0, 26, 2);
      l.visible = false;
      this.nightLights.push(l);
      this.scene.add(l);
    }
    // Pallets: a wooden base and a load, one instance each.
    const lt = loadTexture();
    this.palletBase = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.14, 0.9), mat(COL.pallet, 0.85), MAX_PALLETS);
    this.palletLoad = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.55 }), MAX_PALLETS);
    // Finished goods wear glossy shrink-wrap.
    this.palletWrap = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshPhysicalMaterial({ map: lt, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.4, sheenColor: new THREE.Color("#dfe9ff") }),
      MAX_PALLETS,
    );
    this.palletWrap.setColorAt(0, new THREE.Color("#fff"));
    for (const m of [this.palletBase, this.palletLoad, this.palletWrap]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }
    this.palletLoad.setColorAt(0, new THREE.Color("#fff"));
    // Selection: a pin and a dashed outline.
    this.pinObj.visible = false;
    this.scene.add(this.pinObj);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 1), new THREE.Vector3(0, 0, 1)]);
    this.selLine = new THREE.LineLoop(lg, new THREE.LineDashedMaterial({ color: COL.pin, dashSize: 0.35, gapSize: 0.22, depthTest: false, transparent: true }));
    this.selLine.renderOrder = 5;
    this.selLine.visible = false;
    this.scene.add(this.selLine);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#3ddc84", transparent: true, opacity: 0.4, depthWrite: false }));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.ghostArrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 3), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    this.ghostArrow.rotation.x = Math.PI / 2;
    this.ghostArrow.visible = false;
    this.scene.add(this.ghostArrow);
  }

  bakeEnvironment(renderer: THREE.WebGLRenderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    // Upright phones see more of the yard.
    this.camera.fov = w < h ? 42 : 30;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------------- the fixed scenery */

  private buildScenery() {
    const S = this.scene;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), mat(COL.grass, 0.95));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(22, -0.03, 17);
    grass.receiveShadow = true;
    S.add(grass);
    // Yard.
    const yardTex = asphaltTexture("#dfe2ec");
    yardTex.repeat.set(8, 2);
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W + 28, 11), new THREE.MeshStandardMaterial({ map: yardTex, roughness: 0.9 }));
    yard.rotation.x = -Math.PI / 2;
    yard.position.set((GRID_W + 24) / 2 - 2, -0.01, DOCK_Z + 5);
    yard.receiveShadow = true;
    S.add(yard);
    // Back lot behind the building.
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W + 28, 4), new THREE.MeshStandardMaterial({ map: yardTex, roughness: 0.9 }));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set((GRID_W + 24) / 2 - 2, -0.015, 0);
    lot.receiveShadow = true;
    S.add(lot);
    // Road with markings.
    const roadTex = asphaltTexture("#c5c9d6");
    roadTex.repeat.set(30, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(260, 3.6), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(22, 0, ROAD_Z + 1.6);
    road.receiveShadow = true;
    S.add(road);
    const white = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const yellow = new THREE.MeshBasicMaterial({ color: COL.line });
    for (const z of [ROAD_Z - 0.1, ROAD_Z + 3.3]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(260, 0.08), white);
      l.rotation.x = -Math.PI / 2;
      l.position.set(22, 0.01, z);
      S.add(l);
    }
    for (let x = -100; x < 140; x += 3) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.1), yellow);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.01, ROAD_Z + 1.6);
      S.add(d);
    }
    // A fence round the site.
    const fenceMat = mat("#c8ccd8", 0.6, 0.3);
    const fence = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 2.5));
      for (let i = 0; i <= n; i++) {
        const p = box(0.08, 1.2, 0.08, fenceMat, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, false);
        S.add(p);
      }
      for (const y of [0.45, 1.1]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), fenceMat);
        r.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
        r.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        S.add(r);
      }
    };
    fence(-2.5, -2, GRID_W + 24, -2);
    fence(-2.5, -2, -2.5, ROAD_Z - 0.6);
    fence(GRID_W + 24, -2, GRID_W + 24, ROAD_Z - 0.6);
    // The office, the car park, the gatehouse and street lamps.
    const off = office(10, 8);
    off.position.set(-10, 0, 12);
    S.add(off);
    const parkTex = asphaltTexture("#d3d7e2");
    parkTex.repeat.set(3, 2);
    const park = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ map: parkTex, roughness: 0.9 }));
    park.rotation.x = -Math.PI / 2;
    park.position.set(-10, -0.012, 23.5);
    park.receiveShadow = true;
    S.add(park);
    for (let i = 0; i < 6; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4.6), white);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-16 + i * 2.4, 0.004, 21.4);
      S.add(line);
      if (i < 5 && (i * 7) % 3 !== 1) {
        const c = car(i * 3 + 1);
        c.position.set(-14.8 + i * 2.4, 0, 21.4);
        S.add(c);
      }
    }
    const gh = gatehouse();
    gh.group.position.set(-4.4, 0, ROAD_Z - 2.2);
    S.add(gh.group);
    this.barrier = gh.arm;
    for (let x = -30; x < GRID_W + 60; x += 14) {
      const l = streetLamp();
      l.position.set(x, 0, ROAD_Z + 3.9);
      l.rotation.y = Math.PI / 2;
      S.add(l);
    }
    for (let x = 4; x < GRID_W + 20; x += 18) {
      const l = streetLamp();
      l.position.set(x, 0, ROAD_Z - 1.2);
      l.rotation.y = -Math.PI / 2;
      S.add(l);
    }
    // Trees round the edges and across the road.
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const side = i % 4;
      let x: number;
      let z: number;
      if (side === 0) {
        x = -24 + r() * 8;
        z = -6 + r() * 20;
      } else if (side === 1) {
        x = GRID_W + 26 + r() * 10;
        z = -6 + r() * 36;
      } else if (side === 2) {
        x = -14 + r() * (GRID_W + 50);
        z = -12 + r() * 8;
      } else {
        x = -14 + r() * (GRID_W + 50);
        z = ROAD_Z + 5 + r() * 12;
      }
      const t = tree(i);
      t.position.set(x, 0, z);
      t.scale.setScalar(1.3 + r() * 0.9);
      S.add(t);
    }
  }

  /** What's round each site: a river, fields, an old works, a harbor with cranes, or hills. */
  private buildTheme(def: SiteDef) {
    const G = this.scenery;
    this.disposeGroup(G);
    let seed = def.id.charCodeAt(3) * 97 + 13;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const water = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1), new THREE.MeshStandardMaterial({ color: "#86b8e8", roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, -0.05, z);
      m.userData.own = true;
      m.userData.water = true;
      G.add(m);
    };
    if (def.theme === "river") {
      water(40, 52, 360, 16);
      for (let x = -60; x < 140; x += 3) {
        const reed = box(0.3 + r() * 0.4, 0.4 + r() * 0.5, 0.3, mat("#9cc98a", 0.9), x + r(), 0, 43.6 + r() * 0.8, false);
        G.add(reed);
      }
    } else if (def.theme === "harbor") {
      water(40, 58, 360, 26);
      G.add(box(300, 0.6, 3, mat("#c3c7d4", 0.8), 40, -0.4, 44.5));
      for (const [x, c] of [[8, "#2f6fe4"], [38, "#f0743a"], [68, "#2f6fe4"]] as [number, string][]) {
        const cr = crane(c);
        cr.position.set(x, 0, 42);
        G.add(cr);
      }
      // Container stacks along the quay.
      for (let i = 0; i < 36; i++) {
        const x = -20 + (i % 18) * 6.5 + r();
        const z = 38 + Math.floor(i / 18) * 3;
        const h = 1 + Math.floor(r() * 3);
        for (let k = 0; k < h; k++) G.add(box(6, 2.4, 2.4, mat(CONTAINER_COLORS[Math.floor(r() * CONTAINER_COLORS.length)], 0.6), x, k * 2.42, z));
      }
      // A ship at the berth.
      G.add(box(70, 6, 14, mat("#2b2f3a", 0.6), 40, -2, 55));
      G.add(box(70, 0.6, 14.2, mat("#d94848", 0.6), 40, 3.4, 55));
      G.add(box(10, 8, 10, mat("#e9ecf4", 0.5), 70, 4, 55));
    } else if (def.theme === "works") {
      for (const [x, z, h] of [[-26, -8, 22], [-20, -12, 16], [100, -6, 26]] as [number, number, number][]) {
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, h, 18), mat("#b98a74", 0.85));
        ch.position.set(x, h / 2, z);
        ch.castShadow = true;
        ch.userData.own = true;
        G.add(ch);
        G.add(box(2.6, 0.6, 2.6, mat("#d94848", 0.6), x, h - 2, z));
      }
      for (let i = 0; i < 4; i++) {
        const shed = box(14, 6, 10, mat(["#d3c6c0", "#c9ccef", "#d8d2c4"][i % 3], 0.85), -40 + i * 50, 0, -16 - (i % 2) * 6);
        G.add(shed);
      }
      for (const x of [94, 100]) {
        const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 10, 20), mat("#dfe2ec", 0.5, 0.4));
        silo.position.set(x, 5, 6);
        silo.castShadow = true;
        silo.userData.own = true;
        G.add(silo);
      }
    } else if (def.theme === "fields") {
      for (let i = 0; i < 10; i++) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), mat(["#d9e7a6", "#c4dc9a", "#e8d98f", "#b9d79f"][i % 4], 0.95));
        f.rotation.x = -Math.PI / 2;
        f.position.set(-40 + (i % 5) * 32, -0.02, 46 + Math.floor(i / 5) * 16);
        f.userData.own = true;
        G.add(f);
      }
      const barn = box(8, 5, 6, mat("#d94848", 0.8), -30, 0, 52);
      G.add(barn);
    } else {
      // Summit: rolling hills and pines behind.
      for (let i = 0; i < 9; i++) {
        const h = 10 + r() * 16;
        const hill = new THREE.Mesh(new THREE.ConeGeometry(18 + r() * 14, h, 7), mat(["#b9d7a6", "#a8cf9a", "#c6ddb0"][i % 3], 0.95));
        hill.position.set(-50 + i * 24, h / 2 - 1, -34 - r() * 10);
        hill.userData.own = true;
        G.add(hill);
      }
      for (let i = 0; i < 40; i++) {
        const pine = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 7), mat("#5f9f78", 0.85));
        pine.position.set(-40 + r() * 160, 1.7, -12 - r() * 12);
        pine.castShadow = true;
        pine.userData.own = true;
        G.add(pine);
      }
    }
  }

  /* ---------------------------------------------------------------- the building (rebuilt when the layout changes) */

  private keyOf(s: State) {
    return `${s.expanded}|${s.mega}|${s.rail}|${s.doors.map((d) => d.type).join("")}|${s.structs.length}|${s.structs.filter((t) => t.dead).length}|${rackLevels(s)}`;
  }

  private disposeGroup(g: THREE.Object3D) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.userData.own as boolean)) m.geometry.dispose();
    });
    g.clear();
  }

  private buildLayout(s: State) {
    const G = this.layoutGroup;
    this.disposeGroup(G);
    this.machines.clear();
    this.chargers.clear();
    this.shutters = [];
    const W = width(s);
    // Floor.
    const ft = floorTexture();
    ft.repeat.set((W - 2) / 2, 9);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W - 1.5, 0.12, DOCK_Z - 1.5), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55, metalness: 0.02 }));
    floor.position.set((W + 1.75) / 2, -0.06, (DOCK_Z + 1.75) / 2);
    floor.receiveShadow = true;
    floor.userData.own = true;
    G.add(floor);
    // Paint: aisle lines, staging lanes, walkway.
    const paint = (x: number, z: number, w: number, d: number, color: string) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x + w / 2, 0.006, z + d / 2);
      m.userData.own = true;
      G.add(m);
    };
    paint(2, AISLE_Z[0] - 0.05, W - 2, 0.1, COL.line);
    paint(2, AISLE_Z[1] + 1 - 0.05, W - 2, 0.1, COL.line);
    for (let x = 3; x < W - 1; x += 1.6) paint(x, AISLE_Z[0] + 0.96, 0.7, 0.08, "#ffffff");
    const wall = mat(COL.wall, 0.8);
    const wallDark = mat(COL.wallDark, 0.8);
    // Back wall (full height, with rail doors when there's a siding), low side walls, a coping on top.
    const backSeg = (x0: number, x1: number) => {
      if (x1 - x0 <= 0.05) return;
      G.add(box(x1 - x0, 4.4, 0.3, wall, (x0 + x1) / 2, 0, 1.6));
    };
    let bc = 1.75;
    if (s.rail)
      for (const x0 of RAIL_DOORS) {
        backSeg(bc, x0);
        G.add(box(3, 1.4, 0.3, wall, x0 + 1.5, 3.0, 1.6));
        G.add(box(0.14, 3, 0.36, mat("#2fae7e", 0.4), x0 + 0.07, 0, 1.6));
        G.add(box(0.14, 3, 0.36, mat("#2fae7e", 0.4), x0 + 2.93, 0, 1.6));
        const rs = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: signTexture(`Rail ${RAIL_DOORS.indexOf(x0) + 1}`, "#2fae7e"), transparent: true }));
        rs.position.set(x0 + 1.5, 3.3, 1.79);
        rs.userData.own = true;
        G.add(rs);
        bc = x0 + 3;
      }
    backSeg(bc, W + 0.25);
    G.add(box(W - 1.5, 0.14, 0.42, wallDark, (W + 1.75) / 2, 4.4, 1.6));
    // Roof trusses with high-bay lights (no roof, so you can see in).
    const steel = mat("#aab1c0", 0.45, 0.6);
    for (let x = 4; x < W - 1; x += 6) {
      G.add(box(0.16, 0.5, DOCK_Z - 1.6, steel, x, 4.2, (DOCK_Z + 1.75) / 2));
      for (const z of [6, 12, 17]) {
        const lamp = box(0.9, 0.08, 0.5, lampMat, x, 4.08, z, false);
        G.add(lamp);
      }
    }
    G.add(box(W - 2, 0.16, 0.16, steel, (W + 1.75) / 2, 4.5, (DOCK_Z + 1.75) / 2));
    // A green pedestrian walkway along the back, and yellow bollards at every door.
    paint(2, 2.15, W - 2, 0.6, "#bfe6c9");
    for (let x = 3; x < W - 1; x += 3) paint(x, 2.25, 0.18, 0.4, "#ffffff");
    for (const d of s.doors) {
      const x0 = doorX0(d.i);
      for (const bx of [x0 - 0.2, x0 + 3.2]) {
        G.add(box(0.16, 0.9, 0.16, mat(COL.line, 0.4), bx, 0, DOCK_Z - 0.35));
        G.add(box(0.17, 0.12, 0.17, mat("#2b2f3a", 0.6), bx, 0.55, DOCK_Z - 0.35));
      }
    }
    // The rail siding: ballast, sleepers and rails behind the building.
    if (s.rail) {
      const ballast = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W + 160, 3.4), mat("#b8b2a6", 0.95));
      ballast.rotation.x = -Math.PI / 2;
      ballast.position.set(GRID_W / 2, -0.005, RAIL_Z);
      ballast.receiveShadow = true;
      ballast.userData.own = true;
      G.add(ballast);
      const sleepers: THREE.Matrix4[] = [];
      for (let x = -80; x < GRID_W + 80; x += 0.9) sleepers.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.05, RAIL_Z), new THREE.Quaternion(), new THREE.Vector3(0.22, 0.1, 2.6)));
      const sm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat("#7a6a5a", 0.9), sleepers.length);
      sleepers.forEach((m, i) => sm.setMatrixAt(i, m));
      sm.receiveShadow = true;
      sm.userData.own = true;
      G.add(sm);
      for (const dz of [-0.72, 0.72]) G.add(box(GRID_W + 160, 0.14, 0.1, mat("#8d929c", 0.3, 0.8), GRID_W / 2, 0.1, RAIL_Z + dz, false));
      // Loading apron between the wall and the track.
      for (const x0 of RAIL_DOORS) G.add(box(3, 0.08, 1.2, mat("#9ca3b3", 0.5, 0.5), x0 + 1.5, 0, 0.9));
    }
    for (const x of [1.6, W + 0.15]) {
      G.add(box(0.3, 1.3, DOCK_Z - 1.4, wall, x, 0, (DOCK_Z + 1.75) / 2));
      G.add(box(0.42, 0.1, DOCK_Z - 1.4, wallDark, x, 1.3, (DOCK_Z + 1.75) / 2));
    }
    // Dock wall: pillars between door openings, a header, the doors.
    const H = 3.1;
    const wallSeg = (x0: number, x1: number) => {
      const wlen = x1 - x0;
      if (wlen <= 0.05) return;
      G.add(box(wlen, H, 0.3, wall, x0 + wlen / 2, 0, DOCK_Z + 0.12));
      G.add(box(wlen, 0.12, 0.42, wallDark, x0 + wlen / 2, H, DOCK_Z + 0.12));
    };
    let cursor = 1.45;
    for (const d of [...s.doors].sort((a, b) => a.i - b.i)) {
      const x0 = doorX0(d.i);
      wallSeg(cursor, x0);
      cursor = x0 + 3;
      // Header above the opening, blue frame, a rolled-up shutter, bumpers.
      G.add(box(3, H - 2.7, 0.32, wall, x0 + 1.5, 2.7, DOCK_Z + 0.12));
      const frame = mat(COL.door, 0.4);
      G.add(box(0.12, 2.7, 0.36, frame, x0 + 0.06, 0, DOCK_Z + 0.12));
      G.add(box(0.12, 2.7, 0.36, frame, x0 + 2.94, 0, DOCK_Z + 0.12));
      G.add(box(2.8, 0.3, 0.3, mat(COL.doorDark, 0.4), x0 + 1.5, 2.4, DOCK_Z + 0.12));
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(2.76, 1, 0.08), mat(COL.door, 0.45, 0.15));
      shutter.userData.own = true;
      shutter.castShadow = true;
      shutter.position.set(x0 + 1.5, 2.4, DOCK_Z + 0.2);
      G.add(shutter);
      this.shutters.push({ door: d.i, mesh: shutter });
      for (const bx of [x0 + 0.45, x0 + 2.55]) G.add(box(0.3, 0.35, 0.2, mat("#262a33", 0.9), bx, 0.6, DOCK_Z + 0.38));
      // Dock leveller plate.
      G.add(box(2.4, 0.06, 0.5, mat("#9ca3b3", 0.5, 0.5), x0 + 1.5, 0, DOCK_Z + 0.3));
      // Sign.
      const color = d.type === "in" ? "#1f9d74" : d.type === "out" ? COL.door : "#7c5cf0";
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: signTexture(doorName(s, d.i), color), transparent: true }));
      sign.position.set(x0 + 1.5, 2.88, DOCK_Z + 0.29);
      sign.userData.own = true;
      G.add(sign);
      // Lane paint behind the door and stripes in the yard.
      paint(x0, STAGE_Z[0], 3, 0.07, color);
      paint(x0, STAGE_Z[1] + 0.93, 3, 0.07, color);
      paint(x0, STAGE_Z[0], 0.07, 2, color);
      paint(x0 + 2.93, STAGE_Z[0], 0.07, 2, color);
      for (const sx of [x0 - 0.2, x0 + 3.15]) {
        const st = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 7.6), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
        st.rotation.x = -Math.PI / 2;
        st.position.set(sx, 0.006, DOCK_Z + 4.2);
        st.userData.own = true;
        G.add(st);
      }
    }
    wallSeg(cursor, W + 0.3);
    // The units next door until the site expands (and the block until the Mega hall).
    const units: [number, number, string, string][] = [];
    if (!s.expanded) units.push([W + 0.6, WIDTH_FULL + 0.4, "#c9ccef", "TO LET"]);
    if (!s.mega) units.push([(s.expanded ? W : WIDTH_FULL + 0.4) + 0.6, WIDTH_MEGA + 0.4, "#d2cfe9", "MEGA HALL SITE"]);
    for (const [nx0, nx1, color, label] of units) {
      const nw = nx1 - nx0;
      G.add(box(nw, 3.6, DOCK_Z - 1.1, mat(color, 0.85), nx0 + nw / 2, 0, (DOCK_Z + 1.5) / 2));
      G.add(box(nw + 0.2, 0.18, DOCK_Z - 0.9, mat("#dfe1f6", 0.7), nx0 + nw / 2, 3.6, (DOCK_Z + 1.5) / 2));
      for (let x = nx0 + 2; x < nx1 - 2; x += 5) G.add(box(3, 2.6, 0.05, mat("#aab0dc", 0.8), x + 1.5, 0, DOCK_Z + 0.03));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(label.length * 0.45 + 1, 1.1), new THREE.MeshBasicMaterial({ map: signTexture(label, "#8b92b8"), transparent: true }));
      sign.position.set(nx0 + nw / 2, 2.9, DOCK_Z + 0.06);
      sign.userData.own = true;
      G.add(sign);
    }
    // Racks and floor blocks.
    const posts: THREE.Matrix4[] = [];
    const beams: THREE.Matrix4[] = [];
    const L = rackLevels(s);
    const m4 = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    for (const t of s.structs) {
      if (t.dead) continue;
      if (t.kind === "rack") {
        const h = (L - 1) * LEVEL_H + 1.1;
        for (let c = 0; c <= t.w; c++) for (const dz of [0.1, 0.9]) posts.push(m4(t.x + c + (c === 0 ? 0.05 : c === t.w ? -0.05 : 0), h / 2, t.z + dz, 0.08, h, 0.08));
        for (let lv = 1; lv < L + 1; lv++) {
          const y = lv === L ? h - 0.04 : lv * LEVEL_H - 0.06;
          for (const dz of [0.1, 0.9]) beams.push(m4(t.x + t.w / 2, y, t.z + dz, t.w, 0.1, 0.06));
        }
        // Base plates.
        beams.push(m4(t.x + t.w / 2, 0.01, t.z + 0.5, t.w, 0.02, 0.02));
      } else if (t.kind === "floor") {
        const y = mat(COL.line, 0.6);
        for (const [px, pz, w, d] of [[t.x, t.z, t.w, 0.08], [t.x, t.z + t.d - 0.08, t.w, 0.08], [t.x, t.z, 0.08, t.d], [t.x + t.w - 0.08, t.z, 0.08, t.d]]) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), y);
          m.rotation.x = -Math.PI / 2;
          m.position.set(px + w / 2, 0.008, pz + d / 2);
          m.userData.own = true;
          G.add(m);
        }
      } else if (t.kind === "charger") {
        const ch = charger();
        ch.group.position.set(t.x, 0, t.z);
        G.add(ch.group);
        this.chargers.set(t.id, { leds: ch.leds });
      } else if (t.m) {
        const def = MACHINES[t.m.type];
        const mm = machine(t.m.type, t.w, t.d, def.color);
        mm.group.position.set(t.x, 0, t.z);
        G.add(mm.group);
        this.machines.set(t.id, mm);
      }
    }
    const inst = (list: THREE.Matrix4[], color: string) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(color, 0.45, 0.2), list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      im.receiveShadow = true;
      im.userData.own = true;
      G.add(im);
    };
    inst(posts, COL.rackPost);
    inst(beams, COL.rackBeam);
  }

  /* ---------------------------------------------------------------- every frame */

  sync(s: State, dt: number, sel: Focus | null, ghost: Ghost | null, opts: { daylight?: "cycle" | "day"; speed?: number } = {}) {
    this.time += dt;
    if (this.sceneryKey !== s.site) {
      this.sceneryKey = s.site;
      this.buildTheme(siteDef(s.site));
    }
    const key = this.keyOf(s);
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.buildLayout(s);
    }
    this.picks = [];
    this.syncSky(opts.daylight === "day" ? 11 * HOUR : s.time);
    this.syncWorkers(s, dt * Math.min(3, opts.speed ?? 1));
    // Charging bays: green when free, amber while charging.
    for (const [id, ch] of this.chargers) {
      ch.leds.forEach((led, k) => {
        const busy = s.forks.some((f) => f.charger === id * 2 + k && f.phase === "charge" && f.path.length === 0);
        (led.material as THREE.MeshBasicMaterial).color.set(busy ? (Math.sin(this.time * 4) > 0 ? "#ffb020" : "#ffd27a") : "#3ddc84");
      });
    }
    // The gate lifts for trucks coming and going.
    if (this.barrier) {
      const busy = s.trucks.some((t) => !t.rail && (t.state === "arriving" || t.state === "leaving"));
      const target = busy ? -1.35 : 0;
      this.barrier.rotation.z += (target - this.barrier.rotation.z) * Math.min(1, dt * 3);
    }
    // Machines.
    for (const [id, mm] of this.machines) {
      const t = s.structs[id];
      const m = t?.m;
      if (!m) continue;
      const running = m.state === "running";
      const color = running ? "#3ddc84" : m.state === "broken" ? "#ff3b30" : m.state === "repair" || m.state === "service" ? "#3d8bff" : m.state === "off" ? "#8a90a0" : "#ffb020";
      (mm.light.material as THREE.MeshBasicMaterial).color.set(color);
      const blink = m.state === "broken" ? (Math.sin(this.time * 8) > 0 ? 1.25 : 0.8) : 1;
      mm.light.scale.setScalar(blink);
      if (running) {
        const ph = this.time;
        mm.moving.forEach((o, i) => {
          if (m.type === "press") o.position.y = 1.3 + Math.abs(Math.sin(ph * 2.2)) * 0.6;
          else if (m.type === "saw") o.rotation.y += dt * 18;
          else if (m.type === "smt") o.position.x = o.userData.x0 === undefined ? ((o.userData.x0 = o.position.x), o.position.x) : o.userData.x0 + Math.sin(ph * 4 + i) * 0.25;
          else o.rotation.y = Math.sin(ph * 1.3) * 1.2;
        });
      }
      this.picks.push({ box: new THREE.Box3(new THREE.Vector3(t.x, 0, t.z), new THREE.Vector3(t.x + t.w, 2.8, t.z + t.d)), focus: { k: "struct", id } });
    }
    for (const t of s.structs) {
      if (t.dead || t.kind === "machine") continue;
      const h = t.kind === "rack" ? rackLevels(s) * LEVEL_H : t.kind === "charger" ? 1.4 : 0.9;
      this.picks.push({ box: new THREE.Box3(new THREE.Vector3(t.x, 0, t.z), new THREE.Vector3(t.x + t.w, h, t.z + t.d)), focus: { k: "struct", id: t.id } });
    }
    // Shutters open for a truck.
    for (const sh of this.shutters) {
      const d = s.doors[sh.door];
      const tr = d && d.truck >= 0 ? s.trucks.find((t) => t.id === d.truck) : null;
      const open = tr && (tr.state === "docked" || tr.state === "backing" || (tr.state === "leaving" && tr.t < TRUCK_PHASE * 0.2)) ? 1 : 0;
      const target = open ? 0.25 : 2.5;
      const cur = sh.mesh.scale.y;
      const next = cur + (target - cur) * Math.min(1, dt * 3);
      sh.mesh.scale.y = next;
      sh.mesh.position.y = 2.7 - next / 2;
      this.picks.push({ box: new THREE.Box3(new THREE.Vector3(doorX0(sh.door), 0, STAGE_Z[0]), new THREE.Vector3(doorX0(sh.door) + 3, 0.2, DOCK_Z + 1)), focus: { k: "door", id: sh.door } });
    }
    this.syncForks(s, dt);
    this.syncTrucks(s, dt);
    this.syncPallets(s);
    this.syncSelection(s, sel);
    this.syncGhost(ghost);
  }

  private syncForks(s: State, dt: number) {
    while (this.forks.length < s.forks.length) {
      const f = forklift();
      this.scene.add(f.group);
      this.forks.push(f);
    }
    while (this.forks.length > s.forks.length) this.scene.remove(this.forks.pop()!.group);
    while (this.spots.length > s.forks.length) this.scene.remove(this.spots.pop()!);
    s.forks.forEach((f, i) => {
      const m = this.forks[i];
      const g = m.group;
      const moved = Math.hypot(g.position.x - f.x, g.position.z - f.z);
      g.position.set(f.x, 0, f.z);
      // Turn smoothly.
      let d = f.dir - g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * Math.min(1, dt * 12);
      m.carriage.position.y = 0.1 + f.lift;
      for (const w of m.wheels) w.rotation.x += moved * 4;
      (m.beacon.material as THREE.MeshBasicMaterial).color.set(
        f.phase === "charge" ? "#3ddc84" : f.battery < 0.22 ? "#ff3b30" : f.phase === "idle" ? "#8a90a0" : Math.sin(this.time * 9 + i) > 0 ? "#ffb020" : "#ff7a00",
      );
      // The blue safety spot on the floor ahead while it drives.
      let spot = this.spots[i];
      if (!spot) {
        spot = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: "#3d8bff", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
        spot.rotation.x = -Math.PI / 2;
        this.scene.add(spot);
        this.spots[i] = spot;
      }
      spot.visible = moved > 1e-4 && f.phase !== "charge";
      spot.position.set(f.x + Math.sin(g.rotation.y) * 2.1, 0.012, f.z + Math.cos(g.rotation.y) * 2.1);
      this.picks.push({ box: new THREE.Box3(new THREE.Vector3(f.x - 0.6, 0, f.z - 0.6), new THREE.Vector3(f.x + 0.6, 1.4, f.z + 0.6)), focus: { k: "fork", id: f.id } });
    });
  }

  private syncTrucks(s: State, dt: number) {
    const seen = new Set<number>();
    for (const t of s.trucks) {
      const pose = truckPose(s, t);
      if (!pose.visible) continue;
      seen.add(t.id);
      if (t.rail) {
        let tm = this.trains.get(t.id);
        if (!tm) {
          tm = train(t.carrier);
          this.scene.add(tm.group);
          this.trains.set(t.id, tm);
        }
        const moved = Math.abs(tm.group.position.x - pose.x);
        tm.group.position.set(pose.x, 0, pose.z);
        for (const w of tm.wheels) w.rotation.y -= moved * 3;
        this.picks.push({ box: new THREE.Box3(new THREE.Vector3(pose.x - 5, 0, pose.z - 1.4), new THREE.Vector3(pose.x + 12, 3, pose.z + 1.4)), focus: { k: "truck", id: t.id } });
        continue;
      }
      let m = this.trucks.get(t.id);
      if (!m) {
        m = { ...truck(t.carrier), carrier: t.carrier };
        m.group.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.scene.add(m.group);
        this.trucks.set(t.id, m);
        m.group.position.set(pose.x, 0, pose.z);
        m.group.rotation.y = pose.rot;
      }
      const g = m.group;
      const moved = Math.hypot(g.position.x - pose.x, g.position.z - pose.z);
      g.position.set(pose.x, 0, pose.z);
      g.rotation.y = pose.rot;
      for (const w of m.wheels) w.rotation.x += moved * 2.4 * (t.state === "backing" ? -1 : 1);
      void dt;
      const c = Math.cos(pose.rot);
      const sn = Math.sin(pose.rot);
      const far = { x: pose.x + sn * (TRAILER_LEN + 2.4), z: pose.z + c * (TRAILER_LEN + 2.4) };
      this.picks.push({ box: new THREE.Box3(new THREE.Vector3(Math.min(pose.x, far.x) - 1.3, 0, Math.min(pose.z, far.z) - 1.3), new THREE.Vector3(Math.max(pose.x, far.x) + 1.3, 3, Math.max(pose.z, far.z) + 1.3)), focus: { k: "truck", id: t.id } });
    }
    for (const [id, m] of this.trucks)
      if (!seen.has(id)) {
        this.scene.remove(m.group);
        this.trucks.delete(id);
      }
    for (const [id, m] of this.trains)
      if (!seen.has(id)) {
        this.scene.remove(m.group);
        this.trains.delete(id);
      }
  }

  /** World position of a pallet (tile units, y up). */
  palletWorld(s: State, p: Pallet): { x: number; y: number; z: number; rot: number } | null {
    if (p.loc === "truck") {
      const t = s.trucks.find((x) => x.id === p.ref);
      if (!t) return null;
      const pose = truckPose(s, t);
      if (!pose.visible) return null;
      if (t.rail) {
        const k = p.ci % 8;
        return { x: pose.x + (p.ci < 8 ? -2.4 : 2.4) + ((k % 4) - 1.5) * 1.05, z: pose.z + (k < 4 ? 0.6 : -0.6), y: 0.8, rot: 0 };
      }
      const l = cargoLocal(p.ci);
      const c = Math.cos(pose.rot);
      const sn = Math.sin(pose.rot);
      return { x: pose.x + l.x * c + l.z * sn, z: pose.z - l.x * sn + l.z * c, y: 0.6, rot: pose.rot };
    }
    if (p.loc === "fork") {
      const m = this.forks[p.ref];
      if (!m) return null;
      const g = m.group;
      return { x: g.position.x + Math.sin(g.rotation.y) * 0.9, z: g.position.z + Math.cos(g.rotation.y) * 0.9, y: m.carriage.position.y + 0.02, rot: g.rotation.y };
    }
    const sl = s.slots[p.ref];
    if (!sl) return null;
    return { x: sl.x + 0.5, z: sl.z + 0.5, y: sl.y, rot: 0 };
  }

  private syncPallets(s: State) {
    let n = 0;
    let nl = 0;
    let nw = 0;
    const o = this.tmp;
    for (const p of Object.values(s.pallets)) {
      if (n >= MAX_PALLETS) break;
      const w = this.palletWorld(s, p);
      if (!w) continue;
      const item = ITEMS[p.item];
      const h = item.tier === "raw" ? 0.55 : item.tier === "part" ? 0.68 : 0.82;
      o.position.set(w.x, w.y + 0.07, w.z);
      o.rotation.set(0, w.rot, 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      this.palletBase.setMatrixAt(n, o.matrix);
      o.position.y = w.y + 0.14 + h / 2;
      o.scale.set(0.84, h, 0.84);
      o.updateMatrix();
      const wrapped = item.tier === "goods";
      const target = wrapped ? this.palletWrap : this.palletLoad;
      const k = wrapped ? nw++ : nl++;
      target.setMatrixAt(k, o.matrix);
      target.setColorAt(k, this.col.set(item.load));
      if (p.loc === "slot") this.picks.push({ box: new THREE.Box3(new THREE.Vector3(w.x - 0.45, w.y, w.z - 0.45), new THREE.Vector3(w.x + 0.45, w.y + h + 0.14, w.z + 0.45)), focus: { k: "pallet", id: p.id } });
      n++;
    }
    this.palletBase.count = n;
    this.palletLoad.count = nl;
    this.palletWrap.count = nw;
    for (const m of [this.palletBase, this.palletLoad, this.palletWrap]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /* ---------------------------------------------------------------- day and night */

  private skyDay = new THREE.Color("#e8ebf6");
  private skyDusk = new THREE.Color("#f6c9a8");
  private skyNight = new THREE.Color("#141a33");
  private sunDay = new THREE.Color("#fff5e6");
  private sunDusk = new THREE.Color("#ffb070");
  private moon = new THREE.Color("#9fb4ff");

  /** Sun, sky, lamps and floodlights for the time of day (game seconds). */
  private syncSky(t: number) {
    const h = (t % DAY) / HOUR;
    // Elevation: sunrise at 5, noon at 13, sunset at 21.
    const el = Math.sin((Math.PI * (h - 5)) / 16);
    const day = Math.min(1, Math.max(0, el * 1.6 + 0.1));
    const dusk = Math.max(0, 1 - Math.abs(el) * 3.2) * (h > 4 && h < 22 ? 1 : 0);
    this.night = 1 - day;
    const sky = this.col.copy(this.skyNight).lerp(this.skyDay, day);
    sky.lerp(this.skyDusk, dusk * 0.6);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    const az = (Math.PI * (h - 5)) / 16;
    const tgt = this.rig.cur.target;
    const sunOn = el > -0.05;
    this.sun.position.set(tgt.x - Math.cos(az) * 70, sunOn ? 18 + Math.max(0, el) * 60 : 60, tgt.z + 40);
    this.sun.target.position.set(tgt.x, 0, tgt.z);
    if (sunOn) this.sun.color.copy(this.sunDay).lerp(this.sunDusk, dusk);
    else this.sun.color.copy(this.moon);
    this.sun.intensity = sunOn ? 0.5 + 1.9 * day : 0.35;
    this.hemi.intensity = 0.28 + 0.62 * day;
    this.hemi.color.set(day > 0.5 ? "#f6f7ff" : "#8ea2dc");
    this.scene.environmentIntensity = 0.18 + 0.4 * day;
    const night = Math.max(0, Math.min(1, (0.75 - day) / 0.6));
    lampMat.emissiveIntensity = night * 1.5;
    windowMat.emissiveIntensity = night * 0.6;
    const spots: [number, number][] = [
      [tgt.x - 14, DOCK_Z + 4],
      [tgt.x + 14, DOCK_Z + 4],
      [tgt.x - 10, 9],
      [tgt.x + 10, 9],
    ];
    this.nightLights.forEach((l, i) => {
      l.visible = night > 0.02;
      l.intensity = night * 14;
      l.position.set(spots[i][0], 6, spots[i][1]);
    });
    for (const o of this.scenery.children) if (o.userData.water) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(day > 0.4 ? "#86b8e8" : "#2a3a66");
  }

  /* ---------------------------------------------------------------- people */

  private syncWorkers(s: State, dt: number) {
    const want = Math.min(10, 3 + Math.floor(s.forks.length / 2) + (s.mega ? 3 : 0));
    while (this.workers.length < want) {
      const m = person(this.workers.length);
      const x = 3 + ((this.workers.length * 7) % Math.max(4, width(s) - 5)) + 0.5;
      m.group.position.set(x, 0, 2.5);
      this.scene.add(m.group);
      this.workers.push({ m, path: [], x, z: 2.5, wait: this.workers.length * 2, speed: 0.9 + (this.workers.length % 3) * 0.15 });
    }
    while (this.workers.length > want) this.scene.remove(this.workers.pop()!.m.group);
    const W = width(s);
    this.workers.forEach((w, i) => {
      if (!w.path.length) {
        w.wait -= dt;
        w.m.legs.forEach((l) => (l.rotation.x *= 0.8));
        if (w.wait > 0) return;
        // Walk to somewhere on the walkway, the apron or the aisle.
        const zs = [2, AISLE_Z[1], 19];
        const tx = 2 + Math.floor(((Math.sin(this.time * 1.7 + i * 13.1) + 1) / 2) * (W - 3));
        const tz = zs[(i + Math.floor(this.time)) % zs.length];
        w.path = route(s, w.x, w.z, tx, tz);
        w.wait = 2 + (i % 4);
      }
      let step = w.speed * dt;
      while (step > 0 && w.path.length) {
        const [px, pz] = w.path[0];
        const dx = px - w.x;
        const dz = pz - w.z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-4) {
          w.path.shift();
          continue;
        }
        const m = Math.min(d, step);
        w.x += (dx / d) * m;
        w.z += (dz / d) * m;
        w.m.group.rotation.y = Math.atan2(dx, dz);
        step -= m;
        if (m >= d) w.path.shift();
      }
      // Walk on the right of the lane so forklifts pass.
      w.m.group.position.set(w.x + 0.3, 0, w.z + 0.3);
      const swing = w.path.length ? Math.sin(this.time * 9 + i) * 0.5 : 0;
      w.m.legs[0].rotation.x = swing;
      w.m.legs[1].rotation.x = -swing;
    });
  }

  /** The footprint and pin height of a selected thing. */
  footprint(s: State, f: Focus): { x0: number; z0: number; x1: number; z1: number; y: number } | null {
    switch (f.k) {
      case "struct": {
        const t = s.structs[f.id];
        if (!t || t.dead) return null;
        return { x0: t.x, z0: t.z, x1: t.x + t.w, z1: t.z + t.d, y: t.kind === "rack" ? rackLevels(s) * LEVEL_H + 0.3 : t.kind === "machine" ? 3.2 : 0.4 };
      }
      case "fork": {
        const m = this.forks[f.id];
        if (!m) return null;
        const p = m.group.position;
        return { x0: p.x - 0.75, z0: p.z - 0.75, x1: p.x + 0.75, z1: p.z + 0.75, y: 1.5 };
      }
      case "truck": {
        const t = s.trucks.find((x) => x.id === f.id);
        if (!t) return null;
        const pose = truckPose(s, t);
        if (!pose.visible) return null;
        const c = Math.cos(pose.rot);
        const sn = Math.sin(pose.rot);
        const far = { x: pose.x + sn * (TRAILER_LEN + 2.4), z: pose.z + c * (TRAILER_LEN + 2.4) };
        return { x0: Math.min(pose.x, far.x) - 1.4, z0: Math.min(pose.z, far.z) - 1.4, x1: Math.max(pose.x, far.x) + 1.4, z1: Math.max(pose.z, far.z) + 1.4, y: 3.2 };
      }
      case "door": {
        const x0 = doorX0(f.id);
        return { x0, z0: STAGE_Z[0], x1: x0 + 3, z1: DOCK_Z + 0.4, y: 3.4 };
      }
      case "pallet": {
        const p = s.pallets[f.id];
        if (!p) return null;
        const w = this.palletWorld(s, p);
        if (!w) return null;
        return { x0: w.x - 0.55, z0: w.z - 0.55, x1: w.x + 0.55, z1: w.z + 0.55, y: w.y + 1.1 };
      }
      case "order": {
        const o = s.orders.find((x) => x.id === f.id);
        if (!o) return null;
        if (o.door >= 0) return this.footprint(s, { k: "door", id: o.door });
        return o.truck >= 0 ? this.footprint(s, { k: "truck", id: o.truck }) : null;
      }
    }
  }

  private syncSelection(s: State, sel: Focus | null) {
    const fp = sel ? this.footprint(s, sel) : null;
    this.pinObj.visible = !!fp;
    this.selLine.visible = !!fp;
    if (!fp) return;
    const pos = this.selLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    const y = 0.05;
    pos.setXYZ(0, fp.x0, y, fp.z0);
    pos.setXYZ(1, fp.x1, y, fp.z0);
    pos.setXYZ(2, fp.x1, y, fp.z1);
    pos.setXYZ(3, fp.x0, y, fp.z1);
    pos.needsUpdate = true;
    this.selLine.computeLineDistances();
    this.selLine.geometry.computeBoundingSphere();
    this.pinObj.position.set((fp.x0 + fp.x1) / 2, fp.y + Math.sin(this.time * 2.4) * 0.12, (fp.z0 + fp.z1) / 2);
    this.pinObj.rotation.y = this.rig.cur.yaw;
  }

  private syncGhost(g: Ghost | null) {
    this.ghost.visible = !!g;
    this.ghostArrow.visible = !!g?.rack;
    if (!g) return;
    this.ghost.position.set(g.x + g.w / 2, 0.6, g.z + g.d / 2);
    this.ghost.scale.set(g.w, 1.2, g.d);
    (this.ghost.material as THREE.MeshStandardMaterial).color.set(g.ok ? "#3ddc84" : "#ff3b30");
    if (g.rack) {
      const south = (g.rot ?? 0) === 0;
      this.ghostArrow.position.set(g.x + g.w / 2, 1.3, south ? g.z + g.d + 0.2 : g.z - 0.2);
      this.ghostArrow.rotation.set(south ? Math.PI / 2 : -Math.PI / 2, 0, 0);
    }
  }

  /* ---------------------------------------------------------------- picking */

  private ray = new THREE.Raycaster();

  /** What's under a point on the screen (normalised device coordinates). */
  pick(nx: number, ny: number): Focus | null {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    let best: Focus | null = null;
    let bd = Infinity;
    const hit = new THREE.Vector3();
    // Smaller things (pallets, forklifts) win over the rack or truck they're on when hit about as close.
    const weight = (f: Focus) => (f.k === "pallet" ? 0 : f.k === "fork" ? 0.4 : f.k === "door" ? 3 : 1.5);
    for (const p of this.picks) {
      if (!this.ray.ray.intersectBox(p.box, hit)) continue;
      const d = hit.distanceTo(this.ray.ray.origin) + weight(p.focus);
      if (d < bd) {
        bd = d;
        best = p.focus;
      }
    }
    return best;
  }

  /** The tile under a point on the screen. */
  groundAt(nx: number, ny: number): THREE.Vector3 | null {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out) ? out : null;
  }

  /** Glide the camera to look at something. */
  focusOn(s: State, f: Focus) {
    const fp = this.footprint(s, f);
    if (!fp) return;
    this.rig.fly({ target: new THREE.Vector3((fp.x0 + fp.x1) / 2, 0, (fp.z0 + fp.z1) / 2), dist: Math.min(this.rig.goal.dist, 34) });
  }

  update(dt: number) {
    this.rig.step(dt, this.camera);
  }

  dispose() {
    this.disposeGroup(this.layoutGroup);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose();
    });
    this.scene.environment?.dispose();
  }
}
