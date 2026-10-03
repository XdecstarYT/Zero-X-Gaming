import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildPed, posePed, type PedModel, type Pose } from "../code-3/people3d";
import { concreteTexture, asphaltTexture, setTextureDetail } from "../neon-siege/three/textures";
import type { Detail } from "../sports-kit/look";
import { canvasTexture, SportsPipeline } from "../sports-kit/pipeline";
import { accessPoint, CATEGORIES, doorOf, FACING, FIXTURES, fixtureRect, PRODUCTS, priceOf, sizeOf, stockroomOf, type Fixture, type FixtureKind, type ProductId, type Shape, type Store } from "./logic";

/**
 * UBusiness in 3D: a photoreal shop floor seen like a doll's house (the walls
 * nearest the camera drop away). Daylight comes through the shop front from a
 * physical sky; inside, LED panels, an interior reflection environment, PBR
 * floors and glass, bloom and the filmic grade do the rest. Every product is
 * instanced (one draw per product line) with its own printed packaging.
 */

export interface Person {
  id: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  pose: Pose;
  staff?: boolean;
  basket?: boolean;
  seed: number;
  /** A thought over their head ("Too pricey", an emoji). */
  bubble?: string;
}

const WALL_H = 3.4;
const SHELF_LEVELS = [0.14, 0.52, 0.9, 1.28];

/** Rotation for a fixture's quarter turns (rot 0 faces -z). */
export const yawOf = (rot: number) => -rot * (Math.PI / 2);

const tex = new Map<string, THREE.Texture>();
/** Printed packaging for a product: brand, name, colour bands and a barcode. */
function packTexture(id: ProductId) {
  let t = tex.get(id);
  if (t) return t;
  const p = PRODUCTS[id];
  t = canvasTexture(256, 256, (g) => {
    g.fillStyle = p.color;
    g.fillRect(0, 0, 256, 256);
    // A soft highlight and shade, as on printed card or plastic.
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, "rgba(0,0,0,0.18)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.12)");
    grad.addColorStop(1, "rgba(0,0,0,0.22)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = p.accent;
    g.fillRect(0, 150, 256, 48);
    g.beginPath();
    g.arc(200, 70, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.accent === "#000000" || p.accent === "#111827" ? "#f5f5f4" : "#111111";
    g.font = "bold 30px Arial";
    g.textAlign = "center";
    g.fillStyle = luminance(p.color) > 0.6 ? "#111827" : "#ffffff";
    g.fillText(p.brand.toUpperCase().slice(0, 14), 128, 60);
    g.font = "bold 22px Arial";
    const words = p.name.split(" ");
    const mid = Math.ceil(words.length / 2);
    g.fillText(words.slice(0, mid).join(" "), 128, 104);
    g.fillText(words.slice(mid).join(" "), 128, 132);
    g.fillStyle = luminance(p.accent) > 0.6 ? "#111827" : "#ffffff";
    g.font = "bold 18px Arial";
    g.fillText(CATEGORIES[p.cat].name.toUpperCase(), 128, 181);
    g.fillStyle = "#ffffff";
    g.fillRect(70, 212, 116, 32);
    g.fillStyle = "#111";
    for (let i = 0; i < 28; i++) g.fillRect(74 + i * 4, 215, (i * 7) % 3 === 0 ? 2 : 1, 22);
  });
  tex.set(id, t);
  return t;
}

/** A tiny seeded random for decoration. */
function createRngLite(seed: number) {
  let a = seed * 2654435761;
  return () => {
    a = (a ^ (a >>> 13)) * 1274126177;
    a ^= a >>> 16;
    return ((a >>> 0) % 10000) / 10000;
  };
}

function luminance(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** A unit-sized shape for each kind of packaging (scaled per product). */
const shapes = new Map<Shape, THREE.BufferGeometry>();
function shapeGeo(s: Shape) {
  let g = shapes.get(s);
  if (g) return g;
  switch (s) {
    case "bottle": {
      const pts = [
        [0, 0],
        [0.48, 0],
        [0.5, 0.05],
        [0.5, 0.62],
        [0.36, 0.78],
        [0.18, 0.86],
        [0.18, 1],
        [0, 1],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      g = new THREE.LatheGeometry(pts, 16).translate(0, -0.5, 0);
      break;
    }
    case "can":
    case "jar":
    case "roll":
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
      break;
    case "fruit":
      g = new THREE.SphereGeometry(0.5, 14, 10);
      break;
    case "bag":
    case "toy":
      g = new RoundedBoxGeometry(1, 1, 1, 3, 0.18);
      break;
    case "carton": {
      const body = new THREE.BoxGeometry(1, 0.82, 1).translate(0, -0.09, 0);
      const roof = new THREE.CylinderGeometry(0.02, 0.72, 0.18, 4, 1).rotateY(Math.PI / 4).translate(0, 0.41, 0);
      g = mergeGeometries([body.toNonIndexed(), roof.toNonIndexed()])!;
      break;
    }
    default:
      g = new RoundedBoxGeometry(1, 1, 1, 2, 0.04);
  }
  shapes.set(s, g);
  return g;
}

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  let m = mats.get(key);
  if (!m) mats.set(key, (m = make()));
  return m;
}
const std = (color: string, rough = 0.6, metal = 0) => mat(`s${color}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
const glass = () =>
  mat("glass", () => new THREE.MeshPhysicalMaterial({ color: "#d8eef5", roughness: 0.04, metalness: 0, transparent: true, opacity: 0.18, reflectivity: 0.6, clearcoat: 1, depthWrite: false }));
const emissive = (color: string, k = 1.6) => mat(`e${color}${k}`, () => new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: color, emissiveIntensity: k, roughness: 0.4 }));

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};
const cyl = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  return mesh;
};

/** A small printed card: a shelf-edge price label or a sign. */
function label(text: string, w: number, h: number, bg: string, fg: string, font = 64) {
  const t = canvasTexture(Math.round(w * 400), Math.round(h * 400), (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    g.fillStyle = fg;
    g.font = `bold ${font}px Arial`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, g.canvas.width / 2, g.canvas.height / 2 + 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
  return m;
}

/** How a slot's units sit: across, deep and stacked. */
function layout(id: ProductId, width: number, depth: number, height: number) {
  const [w, h, d] = PRODUCTS[id].size;
  const across = Math.max(1, Math.floor(width / (w + 0.012)));
  const deep = Math.max(1, Math.floor(depth / (d + 0.012)));
  const stack = Math.max(1, Math.floor(height / (h + 0.005)));
  return { across, deep, stack, w, h, d };
}

export interface Pick {
  fixture: number | null;
  ground: { x: number; z: number } | null;
  /** A spill or litter under the pointer. */
  mess: number | null;
}

const bubbleTex = new Map<string, THREE.Texture>();
/** A rounded speech bubble with text, cached per text. */
function bubbleTexture(text: string) {
  let t = bubbleTex.get(text);
  if (t) return t;
  t = canvasTexture(256, 96, (g) => {
    g.clearRect(0, 0, 256, 96);
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.roundRect(6, 6, 244, 64, 26);
    g.fill();
    g.beginPath();
    g.moveTo(112, 68);
    g.lineTo(128, 90);
    g.lineTo(144, 68);
    g.fill();
    g.fillStyle = "#111827";
    g.font = "bold 30px Arial";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text.slice(0, 16), 128, 39);
  });
  bubbleTex.set(text, t);
  return t;
}

export class StoreView {
  readonly pipe: SportsPipeline;
  readonly canvas: HTMLCanvasElement;
  private shell = new THREE.Group();
  private fixturesGroup = new THREE.Group();
  private productsGroup = new THREE.Group();
  private stockGroup = new THREE.Group();
  private fixtures = new Map<number, { group: THREE.Group; key: string; hit: THREE.Mesh }>();
  private people = new Map<string, { m: PedModel; x: number; z: number; h: number; step: number; basket?: THREE.Object3D; bubble?: THREE.Sprite; text?: string }>();
  private messGroup = new THREE.Group();
  private messKey = "";
  private messSpots: { id: number; x: number; z: number }[] = [];
  private street = new THREE.Group();
  private cars: { g: THREE.Group; lane: number; speed: number; offset: number }[] = [];
  private walkers: { m: PedModel; offset: number; speed: number; dir: number; lane: number; step: number }[] = [];
  private rain: THREE.LineSegments | null = null;
  private raining = false;
  private walls: { mesh: THREE.Group; nx: number; nz: number; cx: number; cz: number }[] = [];
  /** Things on the shop front (fascia, sign, awning) that hide when the front wall drops away. */
  private frontDressing: THREE.Object3D[] = [];
  private shellKey = "";
  private stockKey = "";
  private productsKey = "";
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ghost: THREE.Group | null = null;
  private highlight: THREE.Mesh;
  private interior: THREE.PointLight[] = [];
  private screens = new Map<number, { tex: THREE.CanvasTexture; text: string }>();
  private envRT: THREE.WebGLRenderTarget;
  private time = 0;
  readonly lod: "high" | "low";
  // Camera.
  target = new THREE.Vector3(6, 0, 5);
  /** Start behind the back wall, looking across the shop floor to the sunny shop front. */
  yaw = Math.PI + 0.45;
  pitch = 0.72;
  dist = 16;
  photo = false;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();

  constructor(host: HTMLElement, readonly detail: Detail) {
    setTextureDetail(detail === "low" ? "low" : "high");
    this.lod = detail === "low" ? "low" : "high";
    this.pipe = new SportsPipeline(host, detail, "day", { fov: 42, shadowSpan: 26, far: 900 });
    this.canvas = this.pipe.canvas;
    this.pipe.lights([], { sunDir: new THREE.Vector3(-0.35, 0.62, -0.7), fog: 0.0016 });
    // Inside, reflections come from a lit room rather than the sky.
    const pm = new THREE.PMREMGenerator(this.pipe.renderer);
    this.envRT = pm.fromScene(new RoomEnvironment(), 0.03);
    pm.dispose();
    this.pipe.scene.environment = this.envRT.texture;
    this.pipe.scene.environmentIntensity = 0.35;
    this.pipe.renderer.toneMappingExposure = 1.0;
    this.pipe.scene.add(this.shell, this.fixturesGroup, this.productsGroup, this.stockGroup, this.messGroup, this.street);
    this.highlight = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1), new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.45, depthWrite: false }));
    this.highlight.visible = false;
    this.pipe.scene.add(this.highlight);
  }

  // ----------------------------------------------------------------- shell

  /** The building: floor, walls, shop front, sign, street, stockroom and lights. Rebuilt when the store grows or is renamed. */
  private buildShell(s: Store) {
    const { w, d } = sizeOf(s);
    const key = `${w}x${d}|${s.name}|${s.sign}`;
    if (key === this.shellKey) return;
    this.shellKey = key;
    for (const c of [...this.shell.children]) this.shell.remove(c);
    this.walls = [];
    this.frontDressing = [];
    for (const l of this.interior) this.pipe.scene.remove(l);
    this.interior = [];
    const high = this.detail !== "low";

    // Polished concrete floor in big tiles, with real reflections.
    const fl = concreteTexture(high ? 512 : 256);
    for (const t of [fl.map, fl.normal!]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(w / 3, d / 3);
    }
    const floorMat = new THREE.MeshPhysicalMaterial({ map: fl.map, normalMap: fl.normal, normalScale: new THREE.Vector2(0.25, 0.25), color: "#e7e2da", roughness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.18 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w / 2, 0.001, d / 2);
    floor.receiveShadow = true;
    this.shell.add(floor);
    // Tile joints.
    const joints = canvasTexture(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(60,55,50,0.35)";
      g.lineWidth = 2;
      g.strokeRect(0, 0, 256, 256);
    }, true);
    joints.repeat.set(w / 1.2, d / 1.2);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: joints, transparent: true, depthWrite: false }));
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(w / 2, 0.003, d / 2);
    this.shell.add(grid);

    // Walls: painted plaster with a band in the store colour, a dark skirting board.
    const plaster = new THREE.MeshStandardMaterial({ color: "#f4f1ec", roughness: 0.92 });
    const band = new THREE.MeshStandardMaterial({ color: s.sign, roughness: 0.55 });
    const skirting = std("#3f3f46", 0.5);
    const wall = (len: number, cx: number, cz: number, nx: number, nz: number, withWindows = false) => {
      const g = new THREE.Group();
      const along = nx === 0;
      const add = (m: THREE.Mesh) => g.add(m);
      if (withWindows) {
        // Shop front: aluminium frames, big panes, a sliding door in the middle, a solid fascia above.
        const door = doorOf(s).x;
        const alu = std("#a3a3a3", 0.3, 0.9);
        add(box(len, 0.5, 0.2, plaster, 0, 0, 0));
        add(box(len, 0.7, 0.24, band, 0, WALL_H - 0.7, 0));
        const panes = Math.max(2, Math.round(len / 2.4));
        for (let i = 0; i <= panes; i++) {
          const x = -len / 2 + (len / panes) * i;
          if (Math.abs(x + len / 2 - door) < 1.25) continue;
          add(box(0.08, WALL_H - 1.2, 0.12, alu, x, 0.5, 0));
        }
        for (let i = 0; i < panes; i++) {
          const x0 = -len / 2 + (len / panes) * i;
          const x1 = x0 + len / panes;
          const mid = (x0 + x1) / 2;
          if (Math.abs(mid + len / 2 - door) < 1.2) continue;
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.08, WALL_H - 1.2), glass());
          pane.position.set(mid, 0.5 + (WALL_H - 1.2) / 2, 0);
          g.add(pane);
        }
        add(box(len, 0.06, 0.14, alu, 0, 0.5, 0));
        add(box(len, 0.06, 0.14, alu, 0, WALL_H - 0.7, 0));
        // The sliding doors (open a little) and their header.
        const dx = door - len / 2;
        for (const side of [-1, 1]) {
          const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.3), glass());
          leaf.position.set(dx + side * 1.05, 1.15, -0.05);
          g.add(leaf);
          add(box(0.05, 2.3, 0.06, alu, dx + side * 1.55, 0, -0.05));
        }
        add(box(2.6, 0.25, 0.25, alu, dx, 2.3, 0));
        // The welcome mat.
        const mat2 = box(2.2, 0.01, 1.2, std("#27272a", 0.95), dx, 0, 0.65);
        g.add(mat2);
      } else {
        add(box(len, WALL_H, 0.2, plaster, 0, 0, 0));
        add(box(len, 0.35, 0.22, band, 0, 2.35, 0));
        add(box(len, 0.12, 0.22, skirting, 0, 0, 0));
      }
      g.position.set(cx, 0, cz);
      if (!along) g.rotation.y = Math.PI / 2;
      this.shell.add(g);
      this.walls.push({ mesh: g, nx, nz, cx, cz });
    };
    wall(w + 0.2, w / 2, 0, 0, -1, true);
    wall(w + 0.2, w / 2, d, 0, 1);
    wall(d, 0, d / 2, -1, 0);
    wall(d, w, d / 2, 1, 0);

    // The stockroom behind the back wall, with its door.
    const back = stockroomOf(s);
    const room = new THREE.Group();
    const rf = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.5), std("#9ca3af", 0.85));
    rf.rotation.x = -Math.PI / 2;
    rf.position.set(back.x - 1, 0.002, d + 1.75);
    rf.receiveShadow = true;
    room.add(rf, box(5, 2.6, 0.15, plaster, back.x - 1, 0, d + 3.5), box(0.15, 2.6, 3.5, plaster, back.x + 1.5, 0, d + 1.75), box(0.15, 2.6, 3.5, plaster, back.x - 3.5, 0, d + 1.75));
    const doorSign = label("STAFF ONLY", 0.9, 0.22, "#111827", "#f5f5f4", 52);
    doorSign.position.set(back.x, 2.55, d - 0.12);
    doorSign.rotation.y = Math.PI;
    room.add(doorSign, box(1.1, 2.2, 0.05, std("#52525b", 0.4, 0.6), back.x, 0, d - 0.08));
    this.shell.add(room);

    // Outside: the pavement, the road, kerbs, street lamps and a row of buildings opposite.
    const pave = concreteTexture(256);
    pave.map.wrapS = pave.map.wrapT = THREE.RepeatWrapping;
    pave.map.repeat.set((w + 40) / 2, 3);
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(w + 40, 6), new THREE.MeshStandardMaterial({ map: pave.map, color: "#d6d3d1", roughness: 0.85 }));
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(w / 2, 0, -3);
    sidewalk.receiveShadow = true;
    const asp = asphaltTexture(256);
    asp.map.wrapS = asp.map.wrapT = THREE.RepeatWrapping;
    asp.map.repeat.set((w + 80) / 6, 2);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(w + 80, 10), new THREE.MeshStandardMaterial({ map: asp.map, color: "#9ca3af", roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(w / 2, -0.12, -11);
    road.receiveShadow = true;
    this.shell.add(sidewalk, road, box(w + 40, 0.14, 0.25, std("#a8a29e", 0.8), w / 2, -0.12, -6));
    const dash = std("#f5f5f4", 0.6);
    for (let x = -30; x < w + 30; x += 6) this.shell.add(box(2.4, 0.01, 0.15, dash, x, -0.115, -11));
    const facade = [std("#7c2d12", 0.85), std("#a8a29e", 0.8), std("#1f2937", 0.7), std("#c2410c", 0.85)];
    for (let x = -24, i = 0; x < w + 24; i++) {
      const bw = 7 + ((i * 5) % 4);
      const bh = 7 + ((i * 7) % 6);
      const b = box(bw, bh, 8, facade[i % facade.length], x + bw / 2, -0.12, -21);
      b.castShadow = false;
      this.shell.add(b);
      const win = emissive("#fde68a", 0.15);
      for (let fy = 1.4; fy < bh - 1; fy += 2.6)
        for (let fx = 1; fx < bw - 1; fx += 1.9) {
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), (fx + fy) % 3 < 1 ? win : std("#1e293b", 0.1, 0.5));
          pane.position.set(x + fx + 0.5, fy, -16.98);
          this.shell.add(pane);
        }
      x += bw + 0.4;
    }
    for (let x = -2; x < w + 4; x += 10) {
      const pole = cyl(0.06, 5, std("#27272a", 0.4, 0.6), x, 0, -5.4, 10);
      const head = box(0.9, 0.12, 0.3, std("#27272a", 0.4, 0.6), x + 0.35, 5, -5.4);
      this.shell.add(pole, head);
    }

    // The fascia sign over the door, outside, and an awning.
    const fascia = box(w + 0.3, 1.2, 0.35, band, w / 2, WALL_H, -0.05);
    const sign = label(s.name.toUpperCase(), Math.min(w - 1, 9), 0.8, s.sign, "#ffffff", 150);
    sign.position.set(doorOf(s).x, WALL_H + 0.6, -0.24);
    sign.rotation.y = Math.PI;
    const glow = sign.material as THREE.MeshStandardMaterial;
    glow.emissive = new THREE.Color("#ffffff");
    glow.emissiveMap = glow.map;
    glow.emissiveIntensity = 0.35;
    this.shell.add(fascia, sign);
    this.frontDressing.push(fascia, sign);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 1.4), std(s.sign, 0.7));
    awn.position.set(w / 2, WALL_H - 0.75, -0.7);
    awn.rotation.x = -0.25;
    awn.castShadow = true;
    this.shell.add(awn);
    this.frontDressing.push(awn);

    // LED ceiling panels: faces that point down, so they glow from below but vanish
    // from the doll's-house camera above. A few real lights hang under them.
    const panel = mat("panel", () => new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff6ea", emissiveIntensity: 1.1, side: THREE.FrontSide }));
    const lights: [number, number][] = [];
    for (let x = 2; x < w - 1; x += 4)
      for (let z = 2.5; z < d - 1; z += 4) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), panel);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, WALL_H - 0.05, z);
        this.shell.add(p);
        lights.push([x, z]);
      }
    const budget = high ? 6 : 2;
    const step = Math.max(1, Math.ceil(lights.length / budget));
    lights.forEach(([x, z], i) => {
      if (i % step) return;
      const l = new THREE.PointLight("#fff3e2", high ? 4 : 6, 10, 1.8);
      l.position.set(x, WALL_H - 0.4, z);
      this.pipe.scene.add(l);
      this.interior.push(l);
    });
    this.target.set(w / 2, 0, d / 2);
  }

  // -------------------------------------------------------------- fixtures

  private fixtureModel(f: Fixture, s: Store): THREE.Group {
    const g = new THREE.Group();
    const def = FIXTURES[f.kind];
    const steel = std("#d4d4d8", 0.35, 0.8);
    const white = std("#f5f5f4", 0.45, 0.2);
    const dark = std("#27272a", 0.5, 0.3);
    const wood = std("#a16207", 0.6);
    switch (f.kind) {
      case "shelf": {
        g.add(box(def.w, 0.12, def.d, dark, 0, 0, 0));
        g.add(box(def.w, 1.75, 0.04, std("#e5e7eb", 0.6, 0.3), 0, 0.12, def.d / 2 - 0.02));
        for (const x of [-def.w / 2 + 0.03, def.w / 2 - 0.03]) g.add(box(0.05, 1.85, def.d, steel, x, 0, 0));
        SHELF_LEVELS.forEach((y, i) => {
          g.add(box(def.w - 0.08, 0.025, def.d - 0.06, white, 0, y - 0.025, -0.02));
          const sl = f.slots[i];
          const text = sl?.product ? `${PRODUCTS[sl.product].name.slice(0, 18)}  $${(priceOf(s, sl.product) / 100).toFixed(2)}` : "";
          if (text) {
            const tag = label(text, 0.9, 0.05, "#fef08a", "#111827", 15);
            tag.position.set(0, y - 0.012, -def.d / 2 + 0.008);
            tag.rotation.y = Math.PI;
            g.add(tag);
          }
        });
        const cat = f.slots.find((x) => x.product)?.product;
        const head = label(cat ? CATEGORIES[PRODUCTS[cat].cat].name.toUpperCase() : "", def.w - 0.1, 0.22, s.sign, "#ffffff", 46);
        head.position.set(0, 1.98, def.d / 2 - 0.05);
        head.rotation.y = Math.PI;
        g.add(head);
        break;
      }
      case "fridge": {
        g.add(box(def.w, 2.1, def.d, std("#e5e7eb", 0.35, 0.6), 0, 0, 0.05));
        g.add(box(def.w - 0.12, 1.75, def.d - 0.14, emissive("#eef6ff", 0.55), 0, 0.2, 0.06));
        SHELF_LEVELS.forEach((y) => g.add(box(def.w - 0.14, 0.02, def.d - 0.2, std("#cbd5e1", 0.2, 0.7), 0, y + 0.06, 0.03)));
        for (let i = 0; i < 3; i++) {
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(def.w / 3 - 0.04, 1.8), glass());
          pane.position.set(-def.w / 3 + (i * def.w) / 3, 1.1, -def.d / 2 - 0.01);
          pane.rotation.y = Math.PI;
          g.add(pane, box(0.03, 1.8, 0.04, steel, -def.w / 2 + (i * def.w) / 3 + 0.02, 0.2, -def.d / 2));
        }
        g.add(box(def.w, 0.22, 0.04, std(s.sign, 0.5), 0, 1.95, -def.d / 2 - 0.02));
        break;
      }
      case "produce": {
        g.add(box(def.w, 0.65, def.d, wood, 0, 0, 0));
        for (let i = 0; i < 4; i++) {
          const crate = box(def.w / 2 - 0.08, 0.16, def.d / 2 - 0.08, std("#d6a565", 0.8), -def.w / 4 + (i % 2) * (def.w / 2), 0.65, -def.d / 4 + Math.floor(i / 2) * (def.d / 2));
          g.add(crate);
        }
        g.add(box(def.w, 0.9, 0.06, wood, 0, 0.65, def.d / 2 - 0.03));
        break;
      }
      case "rack": {
        for (const x of [-def.w / 2 + 0.05, def.w / 2 - 0.05]) g.add(cyl(0.02, 1.55, steel, x, 0, 0, 10), box(0.08, 0.03, def.d, steel, x, 0, 0));
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, def.w, 10), steel);
        bar.rotation.z = Math.PI / 2;
        bar.position.y = 1.55;
        g.add(bar);
        break;
      }
      case "display": {
        g.add(box(def.w, 0.88, def.d, std("#1c1917", 0.4), 0, 0, 0));
        g.add(box(def.w + 0.04, 0.04, def.d + 0.04, std("#e7e5e4", 0.25), 0, 0.88, 0));
        const screen = box(0.9, 0.55, 0.04, emissive("#38bdf8", 0.9), 0, 1.1, def.d / 2 - 0.08);
        g.add(screen, box(0.06, 0.25, 0.06, dark, 0, 0.9, def.d / 2 - 0.08));
        break;
      }
      case "checkout": {
        g.add(box(def.w, 0.9, def.d, std("#e7e5e4", 0.5), 0, 0, 0));
        g.add(box(def.w, 0.04, def.d + 0.04, std(s.sign, 0.4), 0, 0.9, 0));
        // The belt and the scanner window.
        g.add(box(def.w * 0.6, 0.02, def.d * 0.5, std("#18181b", 0.85), -def.w * 0.18, 0.94, -0.05));
        g.add(box(0.3, 0.015, 0.3, emissive("#ef4444", 0.35), def.w * 0.18, 0.94, 0));
        // The register: monitor (its own screen texture), drawer, card terminal.
        const scr = canvasTexture(256, 160, (gg) => {
          gg.fillStyle = "#0b1220";
          gg.fillRect(0, 0, 256, 160);
        });
        const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24), new THREE.MeshStandardMaterial({ map: scr, emissive: "#ffffff", emissiveMap: scr, emissiveIntensity: 0.9 }));
        mon.position.set(def.w * 0.36, 1.3, 0.12);
        g.add(mon, box(0.4, 0.28, 0.05, dark, def.w * 0.36, 1.15, 0.15), box(0.05, 0.25, 0.05, dark, def.w * 0.36, 0.94, 0.2), box(0.42, 0.12, 0.36, dark, def.w * 0.36, 0.94, 0.12));
        g.add(box(0.08, 0.04, 0.14, dark, def.w * 0.1, 0.94, -def.d / 2 + 0.14), box(0.08, 0.05, 0.02, emissive("#22c55e", 0.6), def.w * 0.1, 0.98, -def.d / 2 + 0.08));
        this.screens.set(f.id, { tex: scr, text: "" });
        // A lane light on a pole with the lane number.
        g.add(cyl(0.025, 1.4, steel, -def.w / 2 + 0.1, 0.9, 0.3, 8), box(0.3, 0.3, 0.06, emissive("#fef3c7", 0.6), -def.w / 2 + 0.1, 2.3, 0.3));
        break;
      }
      case "selfCheckout": {
        g.add(box(def.w, 0.95, def.d, std("#f5f5f4", 0.4), 0, 0, 0), box(0.5, 0.36, 0.05, dark, 0, 1.15, 0.1), box(0.46, 0.32, 0.01, emissive("#22d3ee", 0.8), 0, 1.17, 0.07), box(0.3, 0.02, 0.3, emissive("#ef4444", 0.3), 0, 0.95, -0.12));
        break;
      }
      case "plant": {
        g.add(cyl(0.22, 0.5, std("#e7e5e4", 0.6), 0, 0, 0, 16));
        for (let i = 0; i < 6; i++) {
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 6), std(i % 2 ? "#15803d" : "#166534", 0.7));
          leaf.position.set(Math.cos(i) * 0.12, 0.9, Math.sin(i) * 0.12);
          leaf.rotation.set(Math.sin(i * 2) * 0.6, 0, Math.cos(i * 2) * 0.6);
          leaf.castShadow = true;
          g.add(leaf);
        }
        break;
      }
      case "promo": {
        g.add(box(def.w, 0.7, def.d, std(s.sign, 0.5), 0, 0, 0));
        const card = label("SPECIAL OFFERS", def.w, 0.5, "#dc2626", "#ffffff", 60);
        card.position.set(0, 1.25, -def.d / 2 + 0.05);
        card.rotation.y = Math.PI;
        g.add(card, cyl(0.02, 0.5, steel, 0, 0.7, 0, 8));
        break;
      }
    }
    // An invisible box for clicking.
    const r = fixtureRect({ kind: f.kind, x: 0, z: 0, rot: 0 });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(r.w, 2, r.d), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1;
    hit.userData.fixture = f.id;
    g.add(hit);
    g.position.set(f.x, 0, f.z);
    g.rotation.y = yawOf(f.rot);
    g.userData.hit = hit;
    return g;
  }

  /** Where each unit on a fixture stands, in world space. */
  private unitSpots(f: Fixture, slot: number, id: ProductId, count: number, out: THREE.Matrix4[]) {
    const def = FIXTURES[f.kind];
    const turn = new THREE.Matrix4().makeRotationY(yawOf(f.rot));
    const at = new THREE.Matrix4().makeTranslation(f.x, 0, f.z).multiply(turn);
    const p = PRODUCTS[id];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3(...p.size);
    const push = (x: number, y: number, z: number, rx = 0) => {
      q.setFromEuler(new THREE.Euler(rx, 0, 0));
      m.compose(new THREE.Vector3(x, y, z), q, scale);
      out.push(at.clone().multiply(m));
    };
    let n = 0;
    if (f.kind === "shelf" || f.kind === "fridge") {
      const y0 = SHELF_LEVELS[slot] + (f.kind === "fridge" ? 0.08 : 0);
      const L = layout(id, def.w - 0.16, def.d - 0.12, 0.34);
      for (let k = 0; k < L.stack && n < count; k++)
        for (let j = 0; j < L.deep && n < count; j++)
          for (let i = 0; i < L.across && n < count; i++, n++) push(-((L.across - 1) * (L.w + 0.012)) / 2 + i * (L.w + 0.012), y0 + L.h / 2 + k * (L.h + 0.003), -def.d / 2 + 0.08 + L.d / 2 + j * (L.d + 0.012));
    } else if (f.kind === "produce") {
      const cx = -def.w / 4 + (slot % 2) * (def.w / 2);
      const cz = -def.d / 4 + Math.floor(slot / 2) * (def.d / 2);
      const L = layout(id, def.w / 2 - 0.14, def.d / 2 - 0.14, 0.3);
      for (let k = 0; k < 3 && n < count; k++)
        for (let j = 0; j < L.deep && n < count; j++)
          for (let i = 0; i < L.across && n < count; i++, n++) push(cx - ((L.across - 1) * L.w) / 2 + i * L.w + (k % 2) * 0.02, 0.74 + L.h / 2 + k * L.h * 0.8, cz - ((L.deep - 1) * L.d) / 2 + j * L.d);
    } else if (f.kind === "rack") {
      const x0 = slot === 0 ? -def.w / 2 + 0.15 : 0.08;
      for (let i = 0; i < Math.min(count, 8); i++) push(x0 + i * 0.085, 1.5 - p.size[1] / 2, 0, 0);
    } else if (f.kind === "display") {
      const x = -def.w / 2 + 0.3 + slot * ((def.w - 0.6) / 2);
      for (let i = 0; i < Math.min(count, 4); i++) push(x + (i % 2) * 0.16 - 0.08, 0.9 + p.size[1] / 2, -0.15 + Math.floor(i / 2) * 0.2);
    }
  }

  /** Rebuild fixtures that changed, and the instanced products. */
  private syncFixtures(s: Store) {
    const seen = new Set<number>();
    for (const f of s.fixtures) {
      seen.add(f.id);
      const key = `${f.kind}|${f.x}|${f.z}|${f.rot}|${s.sign}|${f.slots.map((sl) => (sl.product ? `${sl.product}:${priceOf(s, sl.product)}` : "-")).join(",")}`;
      const old = this.fixtures.get(f.id);
      if (old?.key === key) continue;
      if (old) this.fixturesGroup.remove(old.group);
      const group = this.fixtureModel(f, s);
      this.fixturesGroup.add(group);
      this.fixtures.set(f.id, { group, key, hit: group.userData.hit as THREE.Mesh });
    }
    for (const [id, o] of this.fixtures)
      if (!seen.has(id)) {
        this.fixturesGroup.remove(o.group);
        this.fixtures.delete(id);
        this.screens.delete(id);
      }
    // Products: one instanced mesh per product line.
    const pk = s.fixtures.map((f) => `${f.id}:${f.x},${f.z},${f.rot}:${f.slots.map((sl) => `${sl.product}${sl.qty}`).join("/")}`).join("|");
    if (pk === this.productsKey) return;
    this.productsKey = pk;
    for (const c of [...this.productsGroup.children]) {
      this.productsGroup.remove(c);
      (c as THREE.InstancedMesh).dispose();
    }
    const spots = new Map<ProductId, THREE.Matrix4[]>();
    for (const f of s.fixtures)
      f.slots.forEach((sl, i) => {
        if (!sl.product || sl.qty <= 0) return;
        const list = spots.get(sl.product) ?? [];
        this.unitSpots(f, i, sl.product, sl.qty, list);
        spots.set(sl.product, list);
      });
    for (const [id, list] of spots) {
      const p = PRODUCTS[id];
      const gloss = p.shape === "bottle" || p.shape === "can" || p.shape === "device" || p.shape === "jar";
      const m = mat(`p${id}`, () => (p.shape === "fruit" ? new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.45 }) : new THREE.MeshPhysicalMaterial({ map: packTexture(id), roughness: gloss ? 0.25 : 0.6, metalness: p.shape === "can" ? 0.6 : 0, clearcoat: gloss ? 0.6 : 0 })));
      const inst = new THREE.InstancedMesh(shapeGeo(p.shape), m, list.length);
      list.forEach((mx, i) => inst.setMatrixAt(i, mx));
      inst.castShadow = this.detail !== "low";
      inst.receiveShadow = true;
      this.productsGroup.add(inst);
    }
  }

  /** Boxes in the stockroom: one stack per product line you hold. */
  private syncStock(s: Store) {
    const key = Object.entries(s.storage)
      .map(([k, v]) => `${k}${Math.ceil((v ?? 0) / Math.max(1, PRODUCTS[k as ProductId].box))}`)
      .join(",");
    if (key === this.stockKey) return;
    this.stockKey = key;
    for (const c of [...this.stockGroup.children]) this.stockGroup.remove(c);
    const back = stockroomOf(s);
    const card = std("#c8a26b", 0.85);
    let i = 0;
    for (const [id, units] of Object.entries(s.storage)) {
      const boxes = Math.min(6, Math.ceil((units ?? 0) / Math.max(1, PRODUCTS[id as ProductId].box)));
      if (!boxes) continue;
      const col = i % 6;
      const row = Math.floor(i / 6);
      for (let k = 0; k < boxes; k++) {
        const b = box(0.55, 0.4, 0.4, card, back.x - 3.1 + col * 0.75, k * 0.41, s && sizeOf(s).d + 0.6 + row * 0.6);
        this.stockGroup.add(b);
        if (k === boxes - 1) {
          const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: packTexture(id as ProductId) }));
          tag.rotation.x = -Math.PI / 2;
          tag.position.set(b.position.x, k * 0.41 + 0.41, b.position.z);
          this.stockGroup.add(tag);
        }
      }
      i++;
    }
  }

  /** What the register shows. */
  setScreen(fixtureId: number, lines: string[]) {
    const sc = this.screens.get(fixtureId);
    const text = lines.join("|");
    if (!sc || sc.text === text) return;
    sc.text = text;
    const g = (sc.tex.image as HTMLCanvasElement).getContext("2d")!;
    g.fillStyle = "#0b1220";
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = "#22d3ee";
    g.font = "bold 22px monospace";
    lines.slice(0, 5).forEach((l, i) => g.fillText(l.slice(0, 18), 12, 32 + i * 28));
    sc.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- people

  syncPeople(list: Person[], dt: number, sign: string) {
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.id);
      let o = this.people.get(p.id);
      if (!o) {
        const m = buildPed({ skin: ["#f1c9a5", "#e0ac84", "#c68c5d", "#8d5a3b", "#5a3a28"][p.seed % 5], shirt: p.staff ? sign : ["#1e3a8a", "#7f1d1d", "#166534", "#f5f5f4", "#111827", "#a16207", "#6d28d9", "#be185d"][p.seed % 8], pants: p.staff ? "#1f2937" : ["#1f2937", "#374151", "#1e3a8a", "#57534e"][p.seed % 4], seed: 900 + p.seed * 13, lod: this.lod, outfit: p.staff ? { top: "tee", bottom: "trousers", hat: "none", backpack: false } : undefined });
        m.group.traverse((c) => (c.castShadow = true));
        this.pipe.scene.add(m.group);
        o = { m, x: p.x, z: p.z, h: p.heading, step: 0 };
        if (!p.staff) {
          const b = new THREE.Group();
          b.add(box(0.36, 0.2, 0.24, std("#dc2626", 0.5), 0, 0, 0), box(0.02, 0.18, 0.02, std("#18181b", 0.5), 0, 0.18, 0));
          b.position.set(0.28, 0.62, 0.1);
          m.group.add(b);
          o.basket = b;
        }
        this.people.set(p.id, o);
      }
      const k = Math.min(1, dt * 10);
      o.x += (p.x - o.x) * k;
      o.z += (p.z - o.z) * k;
      let d = p.heading - o.h;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      o.h += d * Math.min(1, dt * 8);
      o.step += dt * p.speed * 1.45;
      o.m.group.position.set(o.x, 0, o.z);
      o.m.group.rotation.y = -(Math.PI / 2 - o.h);
      if (o.basket) o.basket.visible = !!p.basket;
      posePed(o.m, p.pose, o.step, p.speed, this.time, dt);
      if (p.bubble !== o.text) {
        o.text = p.bubble;
        if (o.bubble) this.pipe.scene.remove(o.bubble);
        o.bubble = undefined;
        if (p.bubble) {
          // A fixed size on screen, so it's readable from any distance.
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(p.bubble), depthTest: false, transparent: true, sizeAttenuation: false }));
          sp.scale.set(0.13, 0.049, 1);
          sp.renderOrder = 10;
          this.pipe.scene.add(sp);
          o.bubble = sp;
        }
      }
      o.bubble?.position.set(o.x, 2.25 + Math.sin(this.time * 3) * 0.03, o.z);
    }
    for (const [id, o] of this.people)
      if (!seen.has(id)) {
        this.pipe.scene.remove(o.m.group);
        if (o.bubble) this.pipe.scene.remove(o.bubble);
        this.people.delete(id);
      }
  }

  // --------------------------------------------------------------- picking

  pick(nx: number, ny: number): Pick {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.pipe.camera);
    const hits = this.ray.intersectObjects([...this.fixtures.values()].map((f) => f.hit), false);
    const g = this.ray.ray.intersectPlane(this.ground, new THREE.Vector3());
    let mess: number | null = null;
    if (g) {
      let best = 0.7;
      for (const m of this.messSpots) {
        const d = Math.hypot(m.x - g.x, m.z - g.z);
        if (d < best) {
          best = d;
          mess = m.id;
        }
      }
    }
    return { fixture: hits.length && mess === null ? (hits[0].object.userData.fixture as number) : null, ground: g ? { x: g.x, z: g.z } : null, mess };
  }

  /** Spills (glossy puddles) and litter (crumpled packets) on the floor. */
  private syncMess(s: Store) {
    const list = s.mess ?? [];
    const key = list.map((m) => m.id).join(",");
    if (key === this.messKey) return;
    this.messKey = key;
    this.messSpots = list.map((m) => ({ id: m.id, x: m.x, z: m.z }));
    for (const c of [...this.messGroup.children]) this.messGroup.remove(c);
    const puddle = mat("puddle", () => new THREE.MeshPhysicalMaterial({ color: "#7c5a2a", roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.75 }));
    for (const m of list) {
      const r = createRngLite(m.id);
      if (m.kind === "spill") {
        const shape = new THREE.Shape();
        const n = 9;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const rr = 0.25 + r() * 0.18;
          if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), puddle);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(m.x, 0.006, m.z);
        mesh.receiveShadow = true;
        this.messGroup.add(mesh);
      } else {
        for (let k = 0; k < 3; k++) {
          const bit = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05 + r() * 0.03, 0), std(["#f5f5f4", "#dc2626", "#facc15", "#2563eb"][Math.floor(r() * 4)], 0.8));
          bit.position.set(m.x + (r() - 0.5) * 0.4, 0.04, m.z + (r() - 0.5) * 0.4);
          bit.rotation.set(r() * 3, r() * 3, r() * 3);
          bit.castShadow = true;
          this.messGroup.add(bit);
        }
      }
      // A yellow wet-floor sign by the bigger spills.
      if (m.kind === "spill" && m.id % 3 === 0) {
        const sign = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 4), std("#facc15", 0.5));
        sign.position.set(m.x + 0.45, 0.28, m.z);
        sign.castShadow = true;
        this.messGroup.add(sign);
      }
    }
  }

  /** Traffic on the road and people on the pavement: on the shared clock, so it never stops. */
  private buildStreet(s: Store) {
    if (this.cars.length) return;
    const colours = ["#b91c1c", "#1d4ed8", "#f5f5f4", "#111827", "#a16207", "#475569", "#15803d"];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const body = std(colours[i % colours.length], 0.25, 0.6);
      g.add(box(4.2, 0.7, 1.8, body, 0, 0.3, 0), box(2.3, 0.55, 1.6, std("#1e293b", 0.05, 0.4), -0.2, 1.0, 0));
      for (const [x, z] of [
        [1.3, 0.85],
        [-1.3, 0.85],
        [1.3, -0.85],
        [-1.3, -0.85],
      ]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 14).rotateX(Math.PI / 2), std("#0a0a0a", 0.9));
        w.position.set(x, 0.34, z);
        g.add(w);
      }
      g.add(box(0.05, 0.12, 0.3, emissive("#fff7d6", 1.4), 2.1, 0.55, 0.55), box(0.05, 0.12, 0.3, emissive("#fff7d6", 1.4), 2.1, 0.55, -0.55));
      this.street.add(g);
      this.cars.push({ g, lane: i % 2, speed: 9 + (i % 3) * 2.5, offset: i * 23 });
    }
    for (let i = 0; i < 5; i++) {
      const m = buildPed({ skin: ["#f1c9a5", "#c68c5d", "#8d5a3b", "#e0ac84"][i % 4], shirt: ["#7f1d1d", "#1e3a8a", "#f5f5f4", "#166534", "#6d28d9"][i], pants: "#1f2937", seed: 400 + i * 17, lod: this.lod });
      m.group.traverse((c) => (c.castShadow = true));
      this.street.add(m.group);
      this.walkers.push({ m, offset: i * 17, speed: 1.1 + (i % 3) * 0.2, dir: i % 2 ? 1 : -1, lane: i % 2, step: 0 });
    }
    void s;
  }

  private moveStreet(dt: number, w: number) {
    const span = w + 80;
    for (const c of this.cars) {
      const t = (this.time * c.speed + c.offset) % span;
      const x = c.lane ? -40 + t : w + 40 - t;
      c.g.position.set(x, -0.12, c.lane ? -9.3 : -12.7);
      c.g.rotation.y = c.lane ? 0 : Math.PI;
    }
    const walk = w + 30;
    for (const p of this.walkers) {
      const t = (this.time * p.speed + p.offset) % walk;
      const x = p.dir > 0 ? -15 + t : w + 15 - t;
      p.m.group.position.set(x, 0, p.lane ? -2.2 : -4.4);
      p.m.group.rotation.y = p.dir > 0 ? 0 : Math.PI;
      p.step += dt * p.speed * 1.45;
      posePed(p.m, "walk", p.step, p.speed, this.time, dt);
    }
  }

  /** Rain outside on a rainy day: streaks falling over the street. */
  setRain(on: boolean, s: Store) {
    if (on === this.raining) return;
    this.raining = on;
    if (this.rain) {
      this.pipe.scene.remove(this.rain);
      this.rain = null;
    }
    if (!on) return;
    const { w } = sizeOf(s);
    const n = this.detail === "low" ? 400 : 1400;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = -20 + Math.random() * (w + 40);
      const y = Math.random() * 12;
      const z = -22 + Math.random() * 21.5;
      pos.set([x, y, z, x + 0.03, y - 0.45, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#cbd5e1", transparent: true, opacity: 0.35 }));
    this.pipe.scene.add(this.rain);
  }

  /** Build mode: a see-through fixture, green where it fits and red where it doesn't. */
  setGhost(kind: FixtureKind | null, at?: { x: number; z: number; rot: number; ok: boolean }, s?: Store) {
    if (this.ghost) {
      this.pipe.scene.remove(this.ghost);
      this.ghost = null;
    }
    if (!kind || !at || !s) return;
    const g = this.fixtureModel({ id: -1, kind, x: at.x, z: at.z, rot: at.rot, slots: [] }, s);
    const m = new THREE.MeshBasicMaterial({ color: at.ok ? "#4ade80" : "#ef4444", transparent: true, opacity: 0.45, depthWrite: false });
    g.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = m;
    });
    this.screens.delete(-1);
    this.ghost = g;
    this.pipe.scene.add(g);
  }

  /** A glowing outline under the fixture you're pointing at. */
  setHighlight(f: Fixture | null) {
    this.highlight.visible = !!f;
    if (!f) return;
    const r = fixtureRect(f);
    this.highlight.scale.set(r.w + 0.2, 1, r.d + 0.2);
    this.highlight.position.set(r.x + r.w / 2, 0.01, r.z + r.d / 2);
  }

  // ----------------------------------------------------------------- frame

  frame(dt: number, s: Store, people: Person[]) {
    this.time += dt;
    this.buildShell(s);
    this.syncFixtures(s);
    this.syncStock(s);
    this.syncPeople(people, dt, s.sign);
    this.syncMess(s);
    this.buildStreet(s);
    const { w, d } = sizeOf(s);
    this.moveStreet(dt, w);
    if (this.rain) {
      this.rain.position.y = -((this.time * 14) % 6);
    }
    // The camera: orbit the target, which stays over the shop floor.
    if (this.photo) this.yaw += dt * 0.08;
    this.target.x = Math.max(-2, Math.min(w + 2, this.target.x));
    this.target.z = Math.max(-2, Math.min(d + 4, this.target.z));
    const cp = Math.cos(this.pitch);
    const want = new THREE.Vector3(this.target.x - Math.sin(this.yaw) * cp * this.dist, Math.sin(this.pitch) * this.dist + 0.5, this.target.z - Math.cos(this.yaw) * cp * this.dist);
    const k = Math.min(1, dt * 6);
    this.camPos.lerp(want, this.camPos.lengthSq() ? k : 1);
    this.camLook.lerp(this.target, this.camLook.lengthSq() ? k : 1);
    const cam = this.pipe.camera;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    // Doll's house: walls between the camera and the floor drop to a low stub.
    for (const wl of this.walls) {
      const toCam = (cam.position.x - wl.cx) * wl.nx + (cam.position.z - wl.cz) * wl.nz;
      const cut = toCam > 0.5 && !this.photo;
      const target = cut ? 0.14 : 1;
      wl.mesh.scale.y += (target - wl.mesh.scale.y) * Math.min(1, dt * 8);
      if (wl.nz === -1) for (const o of this.frontDressing) o.visible = !cut;
    }
    // The sun crosses the sky with the store's clock; inside lights matter more as it gets late.
    const h = s.minute / 60;
    const sunUp = Math.max(0.05, Math.sin(((h - 6) / 14) * Math.PI));
    const sky = this.raining ? 0.35 : 1;
    this.pipe.key.intensity = (0.4 + 2.2 * sunUp) * sky;
    this.pipe.hemi.intensity = 0.3 + 0.55 * sunUp;
    this.pipe.renderer.toneMappingExposure = 0.78 + (1 - sunUp) * 0.2;
    this.pipe.follow(w / 2, d / 2);
    this.pipe.render();
  }

  /** Where a fixture's shopper stands (handy for the HUD and tests). */
  accessOf(f: Fixture) {
    return accessPoint(f);
  }

  destroy() {
    for (const o of this.people.values()) this.pipe.scene.remove(o.m.group);
    this.envRT.dispose();
    this.pipe.destroy();
  }
}

export { FACING };
