/**
 * WareForge's 3D world: the building (a cut-away dollhouse, so you can see in), the dock wall
 * and its doors, the yard and the road, racks, machines, pallets, forklifts and trucks, all kept
 * in step with the simulation every frame. The NextX look: a sky dome with sun and clouds that
 * also lights the scene, sun shadows, polished concrete with baked ambient occlusion, metal-clad
 * walls with dock shelters, and static geometry merged so phones can afford it all.
 */
import * as THREE from "three";
import { mergeStatic } from "@/nextx/batch";
import { SkyEnvironment, makeSky, skyFor, type SkyLight, type SkyMesh } from "@/nextx/look";
import { Rig } from "@/nextx/rig";
import { AISLE_Z, DAY, DOCK_Z, FREEZER, GRID_W, HOUR, ITEMS, MACHINES, RAIL_DOORS, RAIL_Z, ROAD_Z, STAGE_Z, TRUCK_PHASE, WIDTH_FULL, WIDTH_MEGA, doorX0, siteDef, type SiteDef } from "../data";
import { LEVEL_H, doorName, eventOn, rackLevels, route, width, type Focus, type Pallet, type State, type Truck } from "../sim";
import {
  COL, CONTAINER_COLORS, TRAILER_LEN, asphaltTexture, box, boxGeo, car, charger, claddingTexture, crane, doorTexture, fadeTexture, fenceTexture, flakeTexture, floorTexture, forklift, gatehouse,
  grassTexture, hazardTexture, lampMat, letteringTexture, loadTexture, machine, mat, office, palletGeometry, person, pin, pine, rbox, signTexture, streetLamp, train, tree, truck,
  windowMat, woodTexture, type ForkModel, type MachineModel, type PersonModel, type TrainModel, type TruckModel,
} from "./models";

/** Low: no shadows, no multisampling (weak devices). Medium (phones): sharp, multisampled, sun shadows. High: plus the post chain. */
export type Quality = "low" | "medium" | "high";

const WHITE = new THREE.Color(1, 1, 1);
const DOWN = new THREE.Vector3(0, -1, 0);
const LIGHT_ON = { red: new THREE.Color("#ff3b30"), redOff: new THREE.Color("#4a1a1a"), green: new THREE.Color("#3ddc84"), greenOff: new THREE.Color("#173a22") };

type Surface = "floor" | "clad" | "cladDim" | "plinth" | "coping" | "fascia" | "door" | "shelter" | "asphalt" | "road" | "concrete" | "hazard" | "fence" | "post";

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

const iceGlow = new THREE.MeshBasicMaterial({ color: "#8fd3ff" });
const frostMat = new THREE.MeshBasicMaterial({ color: "#dff1ff", transparent: true, opacity: 0.55 });

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
  private grass: THREE.Mesh | null = null;
  /** Falling snow at the cold store, rain in a storm. */
  private weather: { kind: "snow" | "rain"; obj: THREE.Points | THREE.LineSegments; pos: Float32Array; n: number; speed: Float32Array } | null = null;
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
  private sky: SkyMesh;
  private skyEnv: SkyEnvironment | null = null;
  private light: SkyLight = skyFor(1);
  private sunDir = new THREE.Vector3(0.3, 0.8, 0.5);
  private stormSky = new THREE.Color("#8d96aa");
  /** The fixed scenery round the site, merged into a few meshes once built. */
  private statics = new THREE.Group();
  /** Red and green lights by each dock door. */
  private doorLights: { door: number; red: THREE.Mesh; green: THREE.Mesh }[] = [];
  private floorAOTex: THREE.Texture | null = null;
  /** Shared surfaces, their textures drawn once. */
  private surf: Record<Surface, THREE.MeshStandardMaterial>;
  private fade: THREE.MeshBasicMaterial;
  private signMats = new Map<string, THREE.MeshBasicMaterial>();
  /** The roof trusses: they fade away as the camera comes in close, so they don't block the view. */
  private roof: THREE.Group | null = null;
  private trussMat = new THREE.MeshStandardMaterial({ color: "#a9b0bf", roughness: 0.4, metalness: 0.65, transparent: true });

  constructor(readonly quality: Quality) {
    this.scene.background = new THREE.Color("#bcd7ef");
    this.scene.fog = new THREE.Fog("#bcd7ef", 150, 470);
    this.rig = new Rig(
      { minDist: 10, maxDist: 120, minPitch: 0.42, maxPitch: 1.42, bounds: { x0: -6, z0: -2, x1: GRID_W + 10, z1: 40 } },
      { target: new THREE.Vector3(14, 0, 17), dist: 58, yaw: 0.42, pitch: 0.88 },
    );
    // The sky dome: it lights the scene too, through an environment map captured from it.
    this.sky = makeSky();
    this.sky.scale.setScalar(480);
    this.scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight("#dce9ff", "#8d8c78", 0.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff1d8", 3);
    this.sun.position.set(-22, 60, 40);
    this.sun.target.position.set(22, 0, 16);
    this.scene.add(this.sun, this.sun.target);
    if (quality !== "low") {
      this.sun.castShadow = true;
      const size = quality === "high" ? 4096 : 2048;
      this.sun.shadow.mapSize.set(size, size);
      const c = this.sun.shadow.camera;
      c.left = -52;
      c.right = 52;
      c.top = 46;
      c.bottom = -46;
      c.near = 10;
      c.far = 220;
      this.sun.shadow.bias = -0.0003;
      this.sun.shadow.normalBias = 0.035;
    }
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
    this.surf = {
      floor: std({ map: floorTexture(), roughness: 0.42 }),
      clad: std({ map: claddingTexture(), roughness: 0.5, metalness: 0.18 }),
      cladDim: std({ map: claddingTexture(), color: "#c7cdd8", roughness: 0.55, metalness: 0.15 }),
      plinth: std({ color: COL.plinth, roughness: 0.85 }),
      coping: std({ color: COL.wallDark, roughness: 0.45, metalness: 0.4 }),
      fascia: std({ color: COL.fascia, roughness: 0.35, metalness: 0.25 }),
      door: std({ map: doorTexture(), roughness: 0.45, metalness: 0.25 }),
      shelter: std({ color: COL.shelter, roughness: 0.9 }),
      asphalt: std({ map: asphaltTexture(COL.yard), roughness: 0.92 }),
      road: std({ map: asphaltTexture(COL.road), roughness: 0.9 }),
      concrete: std({ map: floorTexture(), color: "#e6e8ec", roughness: 0.88 }),
      hazard: std({ map: hazardTexture(), roughness: 0.5 }),
      fence: std({ map: fenceTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }),
      post: std({ color: "#4b5263", roughness: 0.45, metalness: 0.5 }),
    };
    this.fade = new THREE.MeshBasicMaterial({ map: fadeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.scene.add(this.layoutGroup, this.scenery, this.statics);
    this.buildScenery();
    // Floodlights for the night.
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight("#ffd9a0", 0, 26, 2);
      l.visible = false;
      this.nightLights.push(l);
      this.scene.add(l);
    }
    // Pallets: a wooden pallet and a load of cartons, one instance each.
    const lt = loadTexture();
    this.palletBase = new THREE.InstancedMesh(palletGeometry(), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 }), MAX_PALLETS);
    this.palletLoad = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.82 }), MAX_PALLETS);
    // Finished goods wear glossy shrink-wrap.
    this.palletWrap = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshPhysicalMaterial({ map: lt, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.4, sheenColor: new THREE.Color("#dfe9ff") }),
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

  /** Light the scene from the sky (an environment map recaptured as the day goes on). */
  bakeEnvironment(renderer: THREE.WebGLRenderer) {
    this.skyEnv = new SkyEnvironment(renderer, this.sky, 64);
    this.syncSky(11 * HOUR);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    // Upright phones see more of the yard.
    this.camera.fov = w < h ? 42 : 30;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------------- the fixed scenery */

  /** A flat patch of ground with its texture laid every `tile` world units. */
  private ground(G: THREE.Object3D, w: number, d: number, m: THREE.Material, x: number, y: number, z: number, tile = 8) {
    const geo = new THREE.PlaneGeometry(w, d);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
    const p = new THREE.Mesh(geo, m);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, y, z);
    p.receiveShadow = true;
    p.userData.own = true;
    G.add(p);
    return p;
  }

  /** Soft shadow along the foot of a wall: x0..x1 at z, fading out `depth` towards +z (dir 1) or −z (dir −1). */
  private footShadow(G: THREE.Object3D, x0: number, x1: number, z: number, depth: number, dir = 1, y = 0.004) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, depth), this.fade);
    p.rotation.x = -Math.PI / 2;
    if (dir > 0) p.rotation.z = Math.PI;
    p.position.set((x0 + x1) / 2, y, z + (dir * depth) / 2);
    p.renderOrder = 1;
    p.userData.own = true;
    G.add(p);
  }

  private signMat(text: string, color: string, sub?: string) {
    const k = `${text}|${color}|${sub ?? ""}`;
    let m = this.signMats.get(k);
    if (!m) this.signMats.set(k, (m = new THREE.MeshBasicMaterial({ map: sub !== undefined ? letteringTexture(text, sub) : signTexture(text, color), transparent: true })));
    return m;
  }

  private buildScenery() {
    const S = this.statics;
    const sf = this.surf;
    // The lawn: tiled grass with broad, gentle patches of lighter and darker green across it.
    const gt = grassTexture();
    gt.repeat.set(60, 60);
    const gg = new THREE.PlaneGeometry(420, 420, 48, 48);
    const pos = gg.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const n = Math.sin(x * 0.045 + 1.3) * Math.cos(y * 0.052) * 0.55 + Math.sin(x * 0.13 + y * 0.09) * 0.3;
      const v = 0.9 + n * 0.12;
      cols.set([v * 0.97, v, v * 0.92], i * 3);
    }
    gg.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const grass = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: gt, vertexColors: true, roughness: 0.95 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(22, -0.03, 17);
    grass.receiveShadow = true;
    this.scene.add(grass);
    this.grass = grass;
    // Yard and back lot in asphalt, the road darker, a footway and kerb on the far side.
    this.ground(S, GRID_W + 28, 11, sf.asphalt, (GRID_W + 24) / 2 - 2, -0.01, DOCK_Z + 5, 14);
    this.ground(S, GRID_W + 28, 4, sf.asphalt, (GRID_W + 24) / 2 - 2, -0.015, 0, 14);
    this.ground(S, 260, 3.6, sf.road, 22, 0, ROAD_Z + 1.6, 12);
    this.ground(S, 260, 1.8, sf.concrete, 22, 0.1, ROAD_Z + 4.4, 4);
    S.add(box(260, 0.12, 0.16, mat("#c9ccd3", 0.8), 22, 0, ROAD_Z + 3.5));
    // Road markings, lit like the road so they fall into shade with it.
    const white = mat("#f2f3f6", 0.6);
    const yellow = mat(COL.line, 0.55);
    for (const z of [ROAD_Z - 0.1, ROAD_Z + 3.3]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(260, 0.08), white);
      l.rotation.x = -Math.PI / 2;
      l.position.set(22, 0.01, z);
      l.receiveShadow = true;
      l.userData.own = true;
      S.add(l);
    }
    for (let x = -100; x < 140; x += 3) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.1), yellow);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.01, ROAD_Z + 1.6);
      d.receiveShadow = true;
      d.userData.own = true;
      S.add(d);
    }
    // A chain-link fence round the site: posts, a top rail and the mesh.
    const fence = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 2.5));
      const ang = -Math.atan2(z1 - z0, x1 - x0);
      for (let i = 0; i <= n; i++) S.add(box(0.07, 1.65, 0.07, sf.post, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n));
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), sf.post);
      rail.position.set((x0 + x1) / 2, 1.6, (z0 + z1) / 2);
      rail.rotation.y = ang;
      rail.castShadow = true;
      rail.userData.own = true;
      S.add(rail);
      const geo = new THREE.PlaneGeometry(len, 1.55);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 0.6, (uv.getY(i) * 1.55) / 0.6);
      const mesh = new THREE.Mesh(geo, sf.fence);
      mesh.position.set((x0 + x1) / 2, 0.8, (z0 + z1) / 2);
      mesh.rotation.y = ang;
      mesh.userData.own = true;
      S.add(mesh);
    };
    fence(-2.5, -2, GRID_W + 24, -2);
    fence(-2.5, -2, -2.5, ROAD_Z - 0.6);
    fence(GRID_W + 24, -2, GRID_W + 24, ROAD_Z - 0.6);
    // The office, the car park, the gatehouse and street lamps.
    const off = office(10, 8);
    off.position.set(-10, 0, 12);
    S.add(off);
    this.footShadow(S, -15.4, -4.6, 16.1, 1.2, 1, 0.02);
    const parkTex = asphaltTexture("#61666f");
    const park = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ map: parkTex, roughness: 0.92 }));
    parkTex.repeat.set(2, 1.5);
    park.rotation.x = -Math.PI / 2;
    park.position.set(-10, -0.012, 23.5);
    park.receiveShadow = true;
    park.userData.own = true;
    S.add(park);
    for (let i = 0; i < 6; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4.6), white);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-16 + i * 2.4, 0.004, 21.4);
      line.userData.own = true;
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
      l.position.set(x, 0.1, ROAD_Z + 3.9);
      l.rotation.y = Math.PI / 2;
      S.add(l);
    }
    for (let x = 4; x < GRID_W + 20; x += 18) {
      const l = streetLamp();
      l.position.set(x, 0, ROAD_Z - 1.2);
      l.rotation.y = -Math.PI / 2;
      S.add(l);
    }
    // Trees round the edges and across the road: broadleaves with the odd pine.
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
        z = ROAD_Z + 6 + r() * 12;
      }
      const t = i % 6 === 0 ? pine(i) : tree(i);
      t.position.set(x, 0, z);
      t.scale.setScalar(1.3 + r() * 0.9);
      t.rotation.y = r() * 6.28;
      S.add(t);
    }
    mergeStatic(S);
  }

  /** What's round each site: a river, fields, an old works, a harbor with cranes, or hills. */
  private buildTheme(def: SiteDef) {
    const G = this.scenery;
    this.disposeGroup(G);
    let seed = def.id.charCodeAt(3) * 97 + 13;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (this.grass) this.grass.visible = def.theme !== "snow";
    const water = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1), new THREE.MeshStandardMaterial({ color: "#86b8e8", roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, -0.05, z);
      m.userData.own = true;
      m.userData.water = true;
      m.userData.dynamic = true;
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
    } else if (def.theme === "snow") {
      // The cold store: snow on the ground, drifts, snowy pines and fells behind.
      const snow = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), mat("#f4f7fc", 0.92));
      snow.rotation.x = -Math.PI / 2;
      snow.position.set(22, -0.03, 17);
      snow.receiveShadow = true;
      snow.userData.own = true;
      G.add(snow);
      for (let i = 0; i < 9; i++) {
        const h = 14 + r() * 18;
        const fell = new THREE.Mesh(new THREE.ConeGeometry(18 + r() * 14, h, 7), mat(["#eef3fb", "#e3ebf7", "#f6f9fd"][i % 3], 0.9));
        fell.position.set(-50 + i * 24, h / 2 - 1, -34 - r() * 10);
        fell.userData.own = true;
        G.add(fell);
      }
      const needles = mat("#3f7a63", 0.85);
      const caps = mat("#ffffff", 0.7);
      for (let i = 0; i < 70; i++) {
        const x = i % 2 ? -40 + r() * 160 : -30 + r() * 20;
        const z = i % 2 ? -12 - r() * 12 : 30 + r() * 40;
        const sc = 0.8 + r() * 0.7;
        for (const [rad, hh, y, m] of [[0.95, 2.4, 1.2, needles], [0.7, 1.8, 2.3, needles], [0.42, 0.9, 3.1, caps]] as [number, number, number, THREE.Material][]) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(rad * sc, hh * sc, 7), m);
          c.position.set(x, y * sc, z);
          c.castShadow = true;
          c.userData.own = true;
          G.add(c);
        }
      }
      // Drifts along the fence and the road.
      for (let i = 0; i < 26; i++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), mat("#ffffff", 0.8));
        d.scale.set(2 + r() * 3, 0.35 + r() * 0.3, 1 + r() * 1.2);
        d.position.set(-24 + r() * 130, 0, i % 2 ? -3.2 : ROAD_Z + 5.5 + r() * 3);
        d.userData.own = true;
        G.add(d);
      }
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
    mergeStatic(G);
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
    this.doorLights = [];
    const W = width(s);
    const sf = this.surf;
    // Floor: polished concrete, with soft shadow baked round everything that stands on it.
    const fx0 = 1.625;
    const fz0 = 1.625;
    const fx1 = W + 0.125;
    const fz1 = DOCK_Z + 0.125;
    sf.floor.map!.repeat.set((fx1 - fx0) / 4, (fz1 - fz0) / 4);
    this.floorAOTex?.dispose();
    this.floorAOTex = this.floorAO(s, fx0, fz0, fx1, fz1);
    sf.floor.aoMap = this.floorAOTex;
    sf.floor.aoMapIntensity = 1;
    sf.floor.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(fx1 - fx0, 0.12, fz1 - fz0), sf.floor);
    floor.position.set((fx0 + fx1) / 2, -0.06, (fz0 + fz1) / 2);
    floor.receiveShadow = true;
    floor.userData.own = true;
    G.add(floor);
    // Paint: aisle lines, staging lanes, walkway (lit, so it sits in the shade like the floor).
    const paint = (x: number, z: number, w: number, d: number, color: string) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, 0.55));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x + w / 2, 0.006, z + d / 2);
      m.receiveShadow = true;
      m.userData.own = true;
      G.add(m);
    };
    paint(2, AISLE_Z[0] - 0.05, W - 2, 0.1, COL.line);
    paint(2, AISLE_Z[1] + 1 - 0.05, W - 2, 0.1, COL.line);
    for (let x = 3; x < W - 1; x += 1.6) paint(x, AISLE_Z[0] + 0.96, 0.7, 0.08, "#ffffff");
    // Metal-clad walls: the ribs keep their spacing on every wall (a texture every two tiles along it).
    const clad = (w: number, h: number, d: number, x: number, y: number, z: number, m = sf.clad) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv;
      for (let f = 0; f < 6; f++) {
        const span = f < 2 ? d : w;
        for (let k = 0; k < 4; k++) uv.setX(f * 4 + k, (uv.getX(f * 4 + k) * span) / 2);
      }
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y + h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.own = true;
      G.add(mesh);
      return mesh;
    };
    // Back wall (full height, with rail doors when there's a siding), a concrete plinth, a coping on top.
    const backSeg = (x0: number, x1: number) => {
      if (x1 - x0 <= 0.05) return;
      clad(x1 - x0, 4.4, 0.3, (x0 + x1) / 2, 0, 1.6);
      G.add(box(x1 - x0, 0.55, 0.36, sf.plinth, (x0 + x1) / 2, 0, 1.6));
    };
    let bc = 1.75;
    if (s.rail)
      for (const x0 of RAIL_DOORS) {
        backSeg(bc, x0);
        clad(3, 1.4, 0.3, x0 + 1.5, 3.0, 1.6);
        G.add(box(0.14, 3, 0.36, mat("#2fae7e", 0.4), x0 + 0.07, 0, 1.6));
        G.add(box(0.14, 3, 0.36, mat("#2fae7e", 0.4), x0 + 2.93, 0, 1.6));
        const rs = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), this.signMat(`Rail ${RAIL_DOORS.indexOf(x0) + 1}`, "#2fae7e"));
        rs.position.set(x0 + 1.5, 3.3, 1.79);
        rs.userData.own = true;
        G.add(rs);
        bc = x0 + 3;
      }
    backSeg(bc, W + 0.25);
    G.add(box(W - 1.5, 0.14, 0.42, sf.coping, (W + 1.75) / 2, 4.4, 1.6));
    // Inside, a wall graphic along the back: the blue band and the site's name.
    const def = siteDef(s.site);
    G.add(box(W - 2.4, 0.78, 0.03, sf.fascia, (W + 1.75) / 2, 3.32, 1.77, false));
    const name = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.9), this.signMat("WAREFORGE", "#fff", `${def.code} · ${def.name.toUpperCase()}`));
    name.position.set(Math.min(W / 2, 6.2), 3.71, 1.8);
    name.userData.own = true;
    G.add(name);
    // Roof trusses (no roof, so you can see in) and high-bay lights in their frames.
    const roof = new THREE.Group();
    roof.userData.dynamic = true;
    for (let x = 4; x < W - 1; x += 6) {
      roof.add(box(0.09, 0.34, DOCK_Z - 1.6, this.trussMat, x, 4.28, (DOCK_Z + 1.75) / 2));
      for (const z of [6, 12, 17]) {
        G.add(box(0.98, 0.05, 0.58, mat("#454c5a", 0.5, 0.4), x, 4.05, z, false));
        G.add(box(0.9, 0.08, 0.5, lampMat, x, 4.08, z, false));
      }
    }
    roof.add(box(W - 2, 0.1, 0.1, this.trussMat, (W + 1.75) / 2, 4.52, (DOCK_Z + 1.75) / 2));
    mergeStatic(roof);
    G.add(roof);
    this.roof = roof;
    // A green pedestrian walkway along the back, and yellow bollards at every door.
    paint(2, 2.15, W - 2, 0.6, "#4fae7c");
    for (let x = 3; x < W - 1; x += 3) paint(x, 2.25, 0.18, 0.4, "#ffffff");
    for (const d of s.doors) {
      const x0 = doorX0(d.i);
      for (const bx of [x0 - 0.2, x0 + 3.2]) {
        G.add(rbox(0.17, 0.95, 0.17, mat(COL.line, 0.35), bx, 0, DOCK_Z - 0.35, 0.06));
        G.add(box(0.18, 0.12, 0.18, mat("#2b2f3a", 0.6), bx, 0.6, DOCK_Z - 0.35));
      }
    }
    // The rail siding: ballast, sleepers and rails behind the building.
    if (s.rail) {
      const ballast = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W + 160, 3.4), mat("#a9a399", 0.95));
      ballast.rotation.x = -Math.PI / 2;
      ballast.position.set(GRID_W / 2, -0.005, RAIL_Z);
      ballast.receiveShadow = true;
      ballast.userData.own = true;
      G.add(ballast);
      const sleepers: THREE.Matrix4[] = [];
      for (let x = -80; x < GRID_W + 80; x += 0.9) sleepers.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.05, RAIL_Z), new THREE.Quaternion(), new THREE.Vector3(0.22, 0.1, 2.6)));
      const sm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat("#6f6153", 0.9), sleepers.length);
      sleepers.forEach((m, i) => sm.setMatrixAt(i, m));
      sm.receiveShadow = true;
      sm.userData.own = true;
      G.add(sm);
      for (const dz of [-0.72, 0.72]) G.add(box(GRID_W + 160, 0.14, 0.1, mat("#8d929c", 0.25, 0.85), GRID_W / 2, 0.1, RAIL_Z + dz, false));
      // Loading apron between the wall and the track.
      for (const x0 of RAIL_DOORS) G.add(box(3, 0.08, 1.2, mat("#9ca3b3", 0.45, 0.55), x0 + 1.5, 0, 0.9));
    }
    for (const x of [1.6, W + 0.15]) {
      clad(0.3, 1.3, DOCK_Z - 1.4, x, 0, (DOCK_Z + 1.75) / 2);
      G.add(box(0.42, 0.1, DOCK_Z - 1.4, sf.coping, x, 1.3, (DOCK_Z + 1.75) / 2));
    }
    // Dock wall: cladding between the doors on a concrete plinth, the blue fascia along the top.
    const H = 3.4;
    const wallSeg = (x0: number, x1: number) => {
      const wlen = x1 - x0;
      if (wlen <= 0.05) return;
      clad(wlen, H, 0.3, x0 + wlen / 2, 0, DOCK_Z + 0.12);
      G.add(box(wlen, 0.55, 0.36, sf.plinth, x0 + wlen / 2, 0, DOCK_Z + 0.12));
    };
    G.add(box(W - 1.15, 0.62, 0.06, sf.fascia, (W + 1.75) / 2, H - 0.66, DOCK_Z + 0.3));
    G.add(box(W - 1.15, 0.12, 0.46, sf.coping, (W + 1.75) / 2, H, DOCK_Z + 0.12));
    const frame = mat("#3a414f", 0.45, 0.5);
    let cursor = 1.45;
    for (const d of [...s.doors].sort((a, b) => a.i - b.i)) {
      const x0 = doorX0(d.i);
      wallSeg(cursor, x0);
      cursor = x0 + 3;
      // Header above the opening, a steel frame, the sectional door (it rolls up for a truck).
      clad(3, H - 2.7, 0.32, x0 + 1.5, 2.7, DOCK_Z + 0.12);
      G.add(box(0.12, 2.7, 0.36, frame, x0 + 0.06, 0, DOCK_Z + 0.12));
      G.add(box(0.12, 2.7, 0.36, frame, x0 + 2.94, 0, DOCK_Z + 0.12));
      G.add(box(2.8, 0.3, 0.3, frame, x0 + 1.5, 2.4, DOCK_Z + 0.12));
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(2.76, 1, 0.08), sf.door);
      shutter.userData.own = true;
      shutter.userData.dynamic = true;
      shutter.castShadow = true;
      shutter.receiveShadow = true;
      shutter.position.set(x0 + 1.5, 2.4, DOCK_Z + 0.2);
      G.add(shutter);
      this.shutters.push({ door: d.i, mesh: shutter });
      // A dock shelter round the opening: padded sides and a head pad (the trailer backs in between).
      G.add(rbox(0.3, 2.6, 0.3, sf.shelter, x0 + 0.15, 0.25, DOCK_Z + 0.43, 0.05));
      G.add(rbox(0.3, 2.6, 0.3, sf.shelter, x0 + 2.85, 0.25, DOCK_Z + 0.43, 0.05));
      G.add(rbox(3.0, 0.3, 0.3, sf.shelter, x0 + 1.5, 2.56, DOCK_Z + 0.43, 0.05));
      // Bumpers, a hazard-striped kerb plate and the leveller.
      for (const bx of [x0 + 0.45, x0 + 2.55]) G.add(rbox(0.3, 0.35, 0.2, mat("#1d2027", 0.9), bx, 0.6, DOCK_Z + 0.38, 0.04));
      G.add(box(3.0, 0.24, 0.04, sf.hazard, x0 + 1.5, 0, DOCK_Z + 0.3));
      G.add(box(2.4, 0.06, 0.5, mat("#9ca3b3", 0.4, 0.6), x0 + 1.5, 0, DOCK_Z + 0.3));
      // Dock lights by the door: red while a truck is on it, green when it's clear to back in.
      G.add(rbox(0.17, 0.44, 0.1, mat("#2b2f38", 0.5), x0 - 0.32, 1.55, DOCK_Z + 0.32, 0.03));
      const lamp = (y: number, c: THREE.Color) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: c }));
        m.position.set(x0 - 0.32, y, DOCK_Z + 0.39);
        m.userData.own = true;
        m.userData.dynamic = true;
        G.add(m);
        return m;
      };
      this.doorLights.push({ door: d.i, red: lamp(1.87, LIGHT_ON.redOff), green: lamp(1.69, LIGHT_ON.green) });
      // Sign on the fascia.
      const color = d.type === "in" ? "#1f9d74" : d.type === "out" ? COL.door : "#7c5cf0";
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), this.signMat(doorName(s, d.i), color));
      sign.position.set(x0 + 1.5, H - 0.35, DOCK_Z + 0.34);
      sign.userData.own = true;
      G.add(sign);
      // Lane paint behind the door and stripes in the yard.
      paint(x0, STAGE_Z[0], 3, 0.07, color);
      paint(x0, STAGE_Z[1] + 0.93, 3, 0.07, color);
      paint(x0, STAGE_Z[0], 0.07, 2, color);
      paint(x0 + 2.93, STAGE_Z[0], 0.07, 2, color);
      for (const sx of [x0 - 0.2, x0 + 3.15]) {
        const st = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 7.6), mat("#f2f3f6", 0.6));
        st.rotation.x = -Math.PI / 2;
        st.position.set(sx, 0.006, DOCK_Z + 4.2);
        st.receiveShadow = true;
        st.userData.own = true;
        G.add(st);
      }
    }
    wallSeg(cursor, W + 0.3);
    // Concrete apron in front of the doors, and shade at the foot of the dock wall.
    this.ground(G, W - 1.1, 2.3, sf.concrete, (W + 1.75) / 2, -0.004, DOCK_Z + 1.42, 4);
    this.footShadow(G, 1.45, W + 0.3, DOCK_Z + 0.27, 1.0, 1);
    // The units next door until the site expands (and the block until the Mega hall).
    const units: [number, number, string][] = [];
    if (!s.expanded) units.push([W + 0.6, WIDTH_FULL + 0.4, "TO LET"]);
    if (!s.mega) units.push([(s.expanded ? W : WIDTH_FULL + 0.4) + 0.6, WIDTH_MEGA + 0.4, "MEGA HALL SITE"]);
    for (const [nx0, nx1, label] of units) {
      const nw = nx1 - nx0;
      clad(nw, 3.6, DOCK_Z - 1.1, nx0 + nw / 2, 0, (DOCK_Z + 1.5) / 2, sf.cladDim);
      G.add(box(nw + 0.2, 0.16, DOCK_Z - 0.9, mat("#d3d7de", 0.8), nx0 + nw / 2, 3.6, (DOCK_Z + 1.5) / 2));
      G.add(box(nw + 0.24, 0.1, 0.3, sf.coping, nx0 + nw / 2, 3.66, DOCK_Z + 0.05));
      for (let x = nx0 + 3; x < nx1 - 3; x += 8) G.add(box(2.4, 0.08, 5, mat("#bcd6f2", 0.15, 0.4), x + 1.2, 3.6, (DOCK_Z + 1.5) / 2, false));
      for (let x = nx0 + 2; x < nx1 - 2; x += 5) G.add(box(3, 2.6, 0.06, sf.door, x + 1.5, 0, DOCK_Z + 0.03));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(label.length * 0.45 + 1, 1.1), this.signMat(label, "#7d86a8"));
      sign.position.set(nx0 + nw / 2, 2.9, DOCK_Z + 0.08);
      sign.userData.own = true;
      G.add(sign);
      this.footShadow(G, nx0, nx1, DOCK_Z + 0.03, 1.0, 1);
    }
    // Racks and floor blocks.
    const posts: THREE.Matrix4[] = [];
    const beams: THREE.Matrix4[] = [];
    const guards: THREE.Matrix4[] = [];
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
        // Base plates, and column guards on the aisle side.
        beams.push(m4(t.x + t.w / 2, 0.01, t.z + 0.5, t.w, 0.02, 0.02));
        const face = t.rot ? 0.1 : 0.9;
        for (const c of [0, t.w]) guards.push(m4(t.x + c + (c === 0 ? 0.05 : -0.05), 0.2, t.z + face, 0.14, 0.4, 0.14));
      } else if (t.kind === "floor") {
        const y = mat(COL.line, 0.6);
        for (const [px, pz, w, d] of [[t.x, t.z, t.w, 0.08], [t.x, t.z + t.d - 0.08, t.w, 0.08], [t.x, t.z, 0.08, t.d], [t.x + t.w - 0.08, t.z, 0.08, t.d]]) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), y);
          m.rotation.x = -Math.PI / 2;
          m.position.set(px + w / 2, 0.008, pz + d / 2);
          m.userData.own = true;
          G.add(m);
        }
      } else if (t.kind === "freezer") {
        // An insulated white cabinet, open to the picking side, with an ice-blue light along the top.
        const h = (FREEZER.levels - 1) * LEVEL_H + 1.25;
        const south = t.rot === 0;
        const wall = mat("#f3f6fb", 0.35, 0.1);
        G.add(box(t.w, h, 0.08, wall, t.x + t.w / 2, 0, south ? t.z + 0.04 : t.z + t.d - 0.04));
        for (const sx of [t.x + 0.04, t.x + t.w - 0.04]) G.add(box(0.08, h, t.d, wall, sx, 0, t.z + t.d / 2));
        G.add(box(t.w + 0.08, 0.14, t.d + 0.08, mat("#dfe8f5", 0.4, 0.2), t.x + t.w / 2, h, t.z + t.d / 2));
        G.add(box(t.w - 0.16, 0.06, t.d - 0.12, mat("#cfe3f7", 0.25, 0.3), t.x + t.w / 2, LEVEL_H - 0.08, t.z + t.d / 2, false));
        const glow = new THREE.Mesh(boxGeo(t.w - 0.1, 0.09, 0.05), iceGlow);
        glow.position.set(t.x + t.w / 2, h - 0.12, south ? t.z + t.d - 0.02 : t.z + 0.02);
        G.add(glow);
        // Frost on the floor in front.
        const frost = new THREE.Mesh(new THREE.PlaneGeometry(t.w, 0.5), frostMat);
        frost.rotation.x = -Math.PI / 2;
        frost.position.set(t.x + t.w / 2, 0.012, south ? t.z + t.d + 0.25 : t.z - 0.25);
        frost.userData.own = true;
        G.add(frost);
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
    const inst = (list: THREE.Matrix4[], m: THREE.Material) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, list.length);
      list.forEach((x, i) => im.setMatrixAt(i, x));
      im.castShadow = true;
      im.receiveShadow = true;
      im.userData.own = true;
      G.add(im);
    };
    inst(posts, mat(COL.rackPost, 0.42, 0.35));
    inst(beams, mat(COL.rackBeam, 0.42, 0.3));
    inst(guards, sf.hazard);
    // Everything that doesn't move goes into a few big meshes.
    mergeStatic(G);
  }

  /** Ambient occlusion for the floor: soft shade round racks and machines and along the walls. */
  private floorAO(s: State, x0: number, z0: number, x1: number, z1: number) {
    const PX = 8;
    const w = Math.ceil((x1 - x0) * PX);
    const h = Math.ceil((z1 - z0) * PX);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    const X = (x: number) => (x - x0) * PX;
    const Z = (z: number) => (z - z0) * PX;
    // A dark core with a soft edge: rings of faint shade, the core under all of them.
    const soft = (ax: number, az: number, bx: number, bz: number, a: number, spread: number) => {
      const N = 6;
      g.fillStyle = `rgba(0,0,0,${a / (N + 1)})`;
      for (let k = N; k >= 0; k--) {
        const e = (spread * k) / N;
        g.fillRect(X(ax - e), Z(az - e), (bx - ax + 2 * e) * PX, (bz - az + 2 * e) * PX);
      }
    };
    for (const t of s.structs) {
      if (t.dead) continue;
      const a = t.kind === "machine" ? 0.55 : t.kind === "floor" ? 0.12 : t.kind === "charger" ? 0.32 : 0.45;
      soft(t.x + 0.05, t.z + 0.05, t.x + t.w - 0.05, t.z + t.d - 0.05, a, t.kind === "floor" ? 0.3 : 0.65);
    }
    const edge = (ax: number, ay: number, bx: number, by: number, rx: number, ry: number, rw: number, rh: number, a: number) => {
      const gr = g.createLinearGradient(ax, ay, bx, by);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(rx, ry, rw, rh);
    };
    const e = 1.3 * PX;
    edge(0, 0, 0, e, 0, 0, w, e, 0.45);
    edge(0, 0, e, 0, 0, 0, e, h, 0.4);
    edge(w, 0, w - e, 0, w - e, 0, e, h, 0.4);
    edge(0, h, 0, h - e * 0.8, 0, h - e * 0.8, w, e * 0.8, 0.3);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
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
    this.syncSky(opts.daylight === "day" ? 11 * HOUR : s.time, eventOn(s, "storm"));
    this.syncWorkers(s, dt * Math.min(3, opts.speed ?? 1));
    this.syncWeather(s, dt);
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
      const h = t.kind === "rack" ? rackLevels(s) * LEVEL_H : t.kind === "freezer" ? FREEZER.levels * LEVEL_H : t.kind === "charger" ? 1.4 : 0.9;
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
    // Dock lights: red while a truck is on the door, green when it's clear to back in.
    for (const dl of this.doorLights) {
      const d = s.doors[dl.door];
      const busy = !!d && d.truck >= 0 && s.trucks.some((t) => t.id === d.truck && (t.state === "docked" || t.state === "backing" || t.state === "arriving"));
      (dl.red.material as THREE.MeshBasicMaterial).color.copy(busy ? LIGHT_ON.red : LIGHT_ON.redOff);
      (dl.green.material as THREE.MeshBasicMaterial).color.copy(busy ? LIGHT_ON.greenOff : LIGHT_ON.green);
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

  /** Sun, sky, the sky's light, lamps and floodlights for the time of day (game seconds). */
  private syncSky(t: number, storm = false) {
    const h = (t % DAY) / HOUR;
    // Elevation: sunrise at 5, noon at 13, sunset at 21.
    const el = Math.sin((Math.PI * (h - 5)) / 16);
    const L = skyFor(el, this.light);
    if (storm) {
      L.zenith.lerp(this.stormSky, 0.7);
      L.horizon.lerp(this.stormSky, 0.55);
      L.sunI *= 0.45;
    }
    const day = Math.min(1, Math.max(0, el * 1.6 + 0.1));
    this.night = 1 - day;
    const az = (Math.PI * (h - 5)) / 16;
    const tgt = this.rig.cur.target;
    const sunOn = el > -0.05;
    if (sunOn) this.sunDir.set(-Math.cos(az) * 70, 18 + Math.max(0, el) * 60, 40).normalize();
    else this.sunDir.set(-30, 60, 40).normalize();
    // Keep the shadow box over the view, snapped to its texels so the shadows don't shimmer.
    const sc = this.sun.shadow.camera;
    const texel = (sc.right - sc.left) / Math.max(1, this.sun.shadow.mapSize.x);
    const fx = Math.round(tgt.x / texel) * texel;
    const fz = Math.round(tgt.z / texel) * texel;
    this.sun.position.set(fx + this.sunDir.x * 80, this.sunDir.y * 80, fz + this.sunDir.z * 80);
    this.sun.target.position.set(fx, 0, fz);
    this.sun.color.copy(L.sun);
    this.sun.intensity = L.sunI;
    this.hemi.intensity = L.hemiI * 0.55;
    this.hemi.color.copy(L.zenith).lerp(WHITE, 0.55);
    const u = this.sky.material.uniforms;
    u.uZenith.value.copy(L.zenith);
    u.uHorizon.value.copy(L.horizon);
    u.uSunDir.value.copy(sunOn ? this.sunDir : DOWN);
    u.uSunColor.value.copy(L.sun).multiplyScalar(sunOn ? 1 : 0.1);
    u.uSunSize.value = sunOn ? 1 + (1 - Math.min(1, Math.max(0, el) * 3)) * 1.5 : 1;
    u.uNight.value = this.night;
    u.uCloud.value = storm ? 1 : 0.2;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(L.horizon).lerp(L.zenith, 0.18);
    (this.scene.background as THREE.Color).copy(fog.color);
    // The sky's own light, recaptured as it changes (a few times an hour).
    if (this.skyEnv) this.scene.environment = this.skyEnv.update(`${Math.round(el * 14)}|${storm ? 1 : 0}`);
    this.scene.environmentIntensity = 0.75;
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
      // The yard floodlights, and the hall lit brighter from above.
      l.intensity = night * (i < 2 ? 14 : 22);
      l.position.set(spots[i][0], i < 2 ? 6 : 5, spots[i][1]);
    });
    for (const o of this.scenery.children) if (o.userData.water) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(day > 0.4 ? "#7fb2e4" : "#2a3a66");
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
        return { x0: t.x, z0: t.z, x1: t.x + t.w, z1: t.z + t.d, y: t.kind === "rack" ? rackLevels(s) * LEVEL_H + 0.3 : t.kind === "freezer" ? FREEZER.levels * LEVEL_H + 0.4 : t.kind === "machine" ? 3.2 : 0.4 };
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

  /* ---------------------------------------------------------------- weather */

  private syncWeather(s: State, dt: number) {
    const want = eventOn(s, "storm") ? "rain" : siteDef(s.site).theme === "snow" ? "snow" : null;
    if (want !== (this.weather?.kind ?? null)) {
      if (this.weather) {
        this.scene.remove(this.weather.obj);
        this.weather.obj.geometry.dispose();
        (this.weather.obj.material as THREE.Material).dispose();
        this.weather = null;
      }
      if (want) {
        const n = this.quality === "high" ? 1400 : 600;
        const rain = want === "rain";
        const pos = new Float32Array(n * (rain ? 6 : 3));
        const speed = new Float32Array(n);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        for (let i = 0; i < n; i++) speed[i] = rain ? 26 + Math.random() * 10 : 1.2 + Math.random() * 1.4;
        const obj = rain
          ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#5f7fae", transparent: true, opacity: 0.75, depthWrite: false }))
          : new THREE.Points(geo, new THREE.PointsMaterial({ color: "#ffffff", map: flakeTexture(), size: 0.5, transparent: true, opacity: 0.95, depthWrite: false }));
        obj.frustumCulled = false;
        this.scene.add(obj);
        this.weather = { kind: want, obj, pos, n, speed };
        // Scatter it through the air to start.
        for (let i = 0; i < n; i++) this.dropAt(i, Math.random() * 30);
      }
    }
    const w = this.weather;
    if (!w) return;
    const rain = w.kind === "rain";
    const c = this.rig.cur.target;
    for (let i = 0; i < w.n; i++) {
      const k = i * (rain ? 6 : 3);
      w.pos[k + 1] -= w.speed[i] * dt;
      if (!rain) {
        w.pos[k] += Math.sin(this.time * 0.8 + i) * dt * 0.4;
        w.pos[k + 2] += Math.cos(this.time * 0.6 + i * 0.7) * dt * 0.3;
      } else w.pos[k + 4] = w.pos[k + 1] + 0.7;
      if (w.pos[k + 1] < 0 || Math.abs(w.pos[k] - c.x) > 45 || Math.abs(w.pos[k + 2] - c.z) > 40) this.dropAt(i, 26 + Math.random() * 6);
    }
    (w.obj.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  private dropAt(i: number, y: number) {
    const w = this.weather!;
    const c = this.rig.cur.target;
    const x = c.x + (Math.random() - 0.5) * 88;
    const z = c.z + (Math.random() - 0.5) * 76;
    if (w.kind === "rain") w.pos.set([x, y, z, x - 0.12, y + 0.7, z], i * 6);
    else w.pos.set([x, y, z], i * 3);
  }

  /** Keep the camera on something that moves (a truck, a forklift); false when it's gone. */
  follow(s: State, f: Focus) {
    const fp = this.footprint(s, f);
    if (!fp) return false;
    this.rig.goal.target.lerp(new THREE.Vector3((fp.x0 + fp.x1) / 2, 0, (fp.z0 + fp.z1) / 2), 0.25);
    return true;
  }

  /** Glide the camera to look at something. */
  focusOn(s: State, f: Focus) {
    const fp = this.footprint(s, f);
    if (!fp) return;
    this.rig.fly({ target: new THREE.Vector3((fp.x0 + fp.x1) / 2, 0, (fp.z0 + fp.z1) / 2), dist: Math.min(this.rig.goal.dist, 34) });
  }

  update(dt: number) {
    this.rig.step(dt, this.camera);
    // Trusses fade out as the camera comes in close.
    if (this.roof) {
      const o = THREE.MathUtils.smoothstep(this.rig.cur.dist, 20, 34);
      this.trussMat.opacity = o;
      this.roof.visible = o > 0.02;
    }
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.uTime.value += dt;
  }

  dispose() {
    this.disposeGroup(this.layoutGroup);
    this.weather?.obj.geometry.dispose();
    this.skyEnv?.dispose();
    this.floorAOTex?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose();
    });
    this.scene.environment?.dispose();
  }
}
