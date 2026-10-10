/**
 * WareForge's 3D world: the building (a cut-away dollhouse, so you can see in), the dock wall
 * and its doors, the yard and the road, racks, machines, pallets, forklifts and trucks, all kept
 * in step with the simulation every frame. Clean pastel look: soft daylight, ACES grading,
 * image-based light and soft shadows.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Rig } from "@/nextx/rig";
import { AISLE_Z, DOCK_Z, GRID_W, ITEMS, MACHINES, ROAD_Z, STAGE_Z, TRUCK_PHASE, WIDTH_FULL, doorX0 } from "../data";
import { LEVEL_H, doorName, rackLevels, width, type Focus, type Pallet, type State, type Truck } from "../sim";
import { COL, TRAILER_LEN, asphaltTexture, box, floorTexture, forklift, loadTexture, machine, mat, pin, signTexture, tree, truck, type ForkModel, type MachineModel, type TruckModel } from "./models";

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

/** Where a truck is (the middle of its trailer's rear) and which way it faces. */
export function truckPose(s: State, t: Truck): { x: number; z: number; rot: number; visible: boolean } {
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
    const hemi = new THREE.HemisphereLight("#f6f7ff", "#cfd3e6", 0.9);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight("#fff5e6", 2.3);
    this.sun.position.set(-22, 60, 40);
    this.sun.target.position.set(22, 0, 16);
    this.scene.add(this.sun, this.sun.target);
    if (quality === "high") {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const c = this.sun.shadow.camera;
      c.left = -48;
      c.right = 48;
      c.top = 40;
      c.bottom = -40;
      c.near = 10;
      c.far = 160;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.03;
      this.sun.shadow.radius = 4;
    }
    this.scene.add(this.layoutGroup);
    this.buildScenery();
    // Pallets: a wooden base and a load, one instance each.
    const lt = loadTexture();
    this.palletBase = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.14, 0.9), mat(COL.pallet, 0.85), MAX_PALLETS);
    this.palletLoad = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.55 }), MAX_PALLETS);
    for (const m of [this.palletBase, this.palletLoad]) {
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
    // Trees round the edges and across the road.
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const side = i % 4;
      let x: number;
      let z: number;
      if (side === 0) {
        x = -12 + r() * 8;
        z = -6 + r() * 36;
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

  /* ---------------------------------------------------------------- the building (rebuilt when the layout changes) */

  private keyOf(s: State) {
    return `${s.expanded}|${s.doors.map((d) => d.type).join("")}|${s.structs.length}|${s.structs.filter((t) => t.dead).length}|${rackLevels(s)}`;
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
    // Back wall (full height), low side walls, a coping on top.
    G.add(box(W - 1.5, 4.4, 0.3, wall, (W + 1.75) / 2, 0, 1.6));
    G.add(box(W - 1.5, 0.14, 0.42, wallDark, (W + 1.75) / 2, 4.4, 1.6));
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
    // The unit next door until the site expands.
    if (!s.expanded) {
      const nx0 = W + 0.6;
      const nw = WIDTH_FULL + 0.4 - nx0;
      G.add(box(nw, 3.6, DOCK_Z - 1.1, mat("#c9ccef", 0.85), nx0 + nw / 2, 0, (DOCK_Z + 1.5) / 2));
      G.add(box(nw + 0.2, 0.18, DOCK_Z - 0.9, mat("#dfe1f6", 0.7), nx0 + nw / 2, 3.6, (DOCK_Z + 1.5) / 2));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.1), new THREE.MeshBasicMaterial({ map: signTexture("TO LET", "#8b92b8"), transparent: true }));
      sign.position.set(nx0 + nw / 2, 2.2, DOCK_Z + 0.02);
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

  sync(s: State, dt: number, sel: Focus | null, ghost: Ghost | null) {
    this.time += dt;
    const key = this.keyOf(s);
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.buildLayout(s);
    }
    this.picks = [];
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
      const h = t.kind === "rack" ? rackLevels(s) * LEVEL_H : 0.9;
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
      (m.beacon.material as THREE.MeshBasicMaterial).color.set(f.phase === "idle" ? "#8a90a0" : Math.sin(this.time * 9 + i) > 0 ? "#ffb020" : "#ff7a00");
      this.picks.push({ box: new THREE.Box3(new THREE.Vector3(f.x - 0.6, 0, f.z - 0.6), new THREE.Vector3(f.x + 0.6, 1.4, f.z + 0.6)), focus: { k: "fork", id: f.id } });
    });
  }

  private syncTrucks(s: State, dt: number) {
    const seen = new Set<number>();
    for (const t of s.trucks) {
      const pose = truckPose(s, t);
      if (!pose.visible) continue;
      seen.add(t.id);
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
  }

  /** World position of a pallet (tile units, y up). */
  palletWorld(s: State, p: Pallet): { x: number; y: number; z: number; rot: number } | null {
    if (p.loc === "truck") {
      const t = s.trucks.find((x) => x.id === p.ref);
      if (!t) return null;
      const pose = truckPose(s, t);
      if (!pose.visible) return null;
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
      this.palletLoad.setMatrixAt(n, o.matrix);
      this.palletLoad.setColorAt(n, this.col.set(item.load));
      if (p.loc === "slot") this.picks.push({ box: new THREE.Box3(new THREE.Vector3(w.x - 0.45, w.y, w.z - 0.45), new THREE.Vector3(w.x + 0.45, w.y + h + 0.14, w.z + 0.45)), focus: { k: "pallet", id: p.id } });
      n++;
    }
    this.palletBase.count = n;
    this.palletLoad.count = n;
    this.palletBase.instanceMatrix.needsUpdate = true;
    this.palletLoad.instanceMatrix.needsUpdate = true;
    if (this.palletLoad.instanceColor) this.palletLoad.instanceColor.needsUpdate = true;
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
