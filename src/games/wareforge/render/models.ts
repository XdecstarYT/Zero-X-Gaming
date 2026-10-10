/**
 * WareForge models: forklifts, trucks, machines, trees and the textures they wear, built from
 * simple shapes in a clean pastel style (soft lavender walls, cobalt racking, safety-yellow
 * forklifts, cardboard and blue-wrapped loads).
 */
import * as THREE from "three";
import { CARRIERS, type MachineType } from "../data";

export const COL = {
  wall: "#b8bdf3",
  wallDark: "#9aa1ea",
  door: "#3d5fd9",
  doorDark: "#2c47b3",
  floor: "#eef0f7",
  yard: "#dcdfe9",
  road: "#c3c7d4",
  grass: "#cfe7c6",
  rackPost: "#2f5bd3",
  rackBeam: "#f28c28",
  fork: "#f6c21c",
  forkDark: "#2b2f3a",
  pallet: "#c99b62",
  pin: "#2f6fe4",
  line: "#f3c623",
};

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** A shared standard material per colour (and roughness). */
export function mat(color: string, rough = 0.75, metal = 0) {
  const k = `${color}|${rough}|${metal}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    mats.set(k, m);
  }
  return m;
}

const boxes = new Map<string, THREE.BoxGeometry>();
export function boxGeo(w: number, h: number, d: number) {
  const k = `${w}|${h}|${d}`;
  let g = boxes.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxes.set(k, g);
  }
  return g;
}

/** A box mesh sitting on y (its base), centred on x/z. */
export function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function cyl(r: number, h: number, material: THREE.Material, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
  m.castShadow = true;
  return m;
}

/* ------------------------------------------------------------------ textures */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A load of stacked cartons (white, tinted per item by instance colour). */
export function loadTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(0,0,0,.22)";
    g.lineWidth = 2;
    for (let y = 0; y < 128; y += 42) {
      const off = (y / 42) % 2 ? 32 : 0;
      for (let x = -64; x < 128; x += 64) g.strokeRect(x + off + 1, y + 1, 62, 40);
    }
    g.fillStyle = "rgba(255,255,255,.35)";
    g.fillRect(0, 0, 128, 6);
    // Tape.
    g.fillStyle = "rgba(0,0,0,.08)";
    for (let y = 0; y < 128; y += 42) g.fillRect(0, y + 18, 128, 5);
  });
}

/** Floor: polished concrete with faint tile joints. */
export function floorTexture() {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = "#f2f3f8";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(120,125,150,${Math.random() * 0.035})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    g.strokeStyle = "rgba(120,126,160,.16)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, 256, 256);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Asphalt for the yard and road. */
export function asphaltTexture(base: string) {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) {
      const v = Math.random();
      g.fillStyle = v > 0.5 ? `rgba(255,255,255,${Math.random() * 0.08})` : `rgba(0,0,30,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const logoCache = new Map<number, THREE.CanvasTexture>();
/** The carrier's name on a trailer side. */
export function logoTexture(carrier: number) {
  let t = logoCache.get(carrier);
  if (t) return t;
  const c = CARRIERS[carrier];
  t = canvasTex(512, 128, (g) => {
    g.fillStyle = "#fbfcff";
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = c.color;
    g.fillRect(0, 96, 512, 32);
    g.fillStyle = c.stripe;
    g.fillRect(0, 88, 512, 8);
    g.fillStyle = c.color;
    g.beginPath();
    g.arc(60, 48, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "bold 30px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(c.name[0], 60, 50);
    g.fillStyle = "#1d2433";
    g.textAlign = "left";
    g.font = "800 44px system-ui, sans-serif";
    g.fillText(c.name, 100, 50);
  });
  logoCache.set(carrier, t);
  return t;
}

/** A sign over a door ("Bay 1", "In 2"). */
export function signTexture(text: string, color: string) {
  return canvasTex(256, 96, (g) => {
    g.fillStyle = color;
    const r = 22;
    g.beginPath();
    g.roundRect(4, 4, 248, 88, r);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "800 46px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, 50);
  });
}

/* ------------------------------------------------------------------ forklift */

export interface ForkModel {
  group: THREE.Group;
  carriage: THREE.Group;
  wheels: THREE.Mesh[];
  beacon: THREE.Mesh;
}

/** A counterbalance forklift, facing +z, about 0.6 wide and 1.3 long. */
export function forklift(): ForkModel {
  const g = new THREE.Group();
  const yellow = mat(COL.fork, 0.45);
  const dark = mat(COL.forkDark, 0.6);
  const steel = mat("#8a90a0", 0.4, 0.6);
  g.add(box(0.62, 0.32, 0.92, yellow, 0, 0.12, -0.1));
  g.add(box(0.6, 0.36, 0.3, dark, 0, 0.12, -0.5)); // counterweight
  g.add(box(0.36, 0.2, 0.32, dark, 0, 0.44, -0.12)); // seat
  // Overhead guard.
  for (const [x, z] of [[-0.27, 0.2], [0.27, 0.2], [-0.27, -0.38], [0.27, -0.38]]) g.add(box(0.04, 0.78, 0.04, dark, x, 0.44, z));
  g.add(box(0.62, 0.05, 0.66, yellow, 0, 1.2, -0.09));
  // Driver.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mat("#f0c7a0", 0.8));
  head.position.set(0, 0.98, -0.12);
  g.add(head);
  g.add(box(0.26, 0.28, 0.18, mat("#ff8a1f", 0.7), 0, 0.64, -0.1)); // hi-vis vest
  // Mast.
  g.add(box(0.06, 1.55, 0.06, steel, -0.22, 0.12, 0.4));
  g.add(box(0.06, 1.55, 0.06, steel, 0.22, 0.12, 0.4));
  g.add(box(0.5, 0.05, 0.05, steel, 0, 1.6, 0.4));
  const carriage = new THREE.Group();
  carriage.add(box(0.52, 0.28, 0.05, dark, 0, 0, 0.45));
  carriage.add(box(0.07, 0.04, 0.82, steel, -0.16, 0, 0.86));
  carriage.add(box(0.07, 0.04, 0.82, steel, 0.16, 0, 0.86));
  carriage.position.y = 0.1;
  g.add(carriage);
  const wheels: THREE.Mesh[] = [];
  const wheelMat = mat("#22252d", 0.9);
  for (const [x, z, r] of [[-0.33, 0.22, 0.14], [0.33, 0.22, 0.14], [-0.31, -0.45, 0.12], [0.31, -0.45, 0.12]]) {
    const w = cyl(r, 0.12, wheelMat, 14);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, r, z);
    g.add(w);
    wheels.push(w);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffb020" }));
  beacon.position.set(0, 1.28, -0.3);
  g.add(beacon);
  return { group: g, carriage, wheels, beacon };
}

/* ------------------------------------------------------------------ truck */

export interface TruckModel {
  group: THREE.Group;
  wheels: THREE.Mesh[];
}

export const TRAILER_LEN = 7.2;

/**
 * A tractor and an open-top box trailer (so the load shows from above). The origin is the
 * middle of the trailer's rear doors; the cab points along +z.
 */
export function truck(carrier: number): TruckModel {
  const g = new THREE.Group();
  const c = CARRIERS[carrier];
  const white = mat("#f7f8fc", 0.5);
  const dark = mat("#2a2e38", 0.7);
  const W = 2.4;
  const L = TRAILER_LEN;
  // Trailer bed and walls.
  g.add(box(W, 0.18, L, mat("#9aa0ad", 0.6, 0.3), 0, 0.42, L / 2));
  const side = new THREE.MeshStandardMaterial({ map: logoTexture(carrier), roughness: 0.5 });
  for (const sx of [-1, 1]) {
    const wall = box(0.06, 2.1, L, white, (sx * (W - 0.06)) / 2, 0.6, L / 2);
    g.add(wall);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.9, 1.6), side);
    panel.position.set(sx * (W / 2 + 0.005), 1.7, L / 2);
    panel.rotation.y = (sx * Math.PI) / 2;
    g.add(panel);
  }
  g.add(box(W, 2.1, 0.08, white, 0, 0.6, L - 0.04)); // front wall
  g.add(box(W, 0.12, 0.12, mat(c.color, 0.5), 0, 2.62, 0.06)); // rear header
  g.add(box(W, 0.12, 0.12, mat(c.color, 0.5), 0, 2.62, L - 0.06));
  // Cab.
  const paint = mat(c.color, 0.35, 0.2);
  g.add(box(2.3, 0.5, 2.3, dark, 0, 0.35, L + 1.3));
  g.add(box(2.26, 1.55, 1.7, paint, 0, 0.85, L + 1.55));
  const glass = new THREE.MeshStandardMaterial({ color: "#20293a", roughness: 0.1, metalness: 0.4 });
  g.add(box(2.0, 0.6, 0.05, glass, 0, 1.55, L + 2.41, false));
  g.add(box(2.28, 0.18, 1.72, mat(c.stripe, 0.5), 0, 2.4, L + 1.55));
  // Lights.
  for (const sx of [-0.85, 0.85]) {
    const l = box(0.3, 0.12, 0.04, new THREE.MeshBasicMaterial({ color: "#fff6d8" }), sx, 0.7, L + 2.42, false);
    g.add(l);
    const r = box(0.24, 0.1, 0.04, new THREE.MeshBasicMaterial({ color: "#ff4d4d" }), sx * 1.15, 0.55, -0.03, false);
    g.add(r);
  }
  const wheels: THREE.Mesh[] = [];
  const tyre = mat("#1d2027", 0.9);
  for (const z of [0.9, 1.9, L + 0.6, L + 2.0])
    for (const sx of [-1, 1]) {
      const w = cyl(0.42, 0.34, tyre, 16);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 1.0, 0.42, z);
      g.add(w);
      wheels.push(w);
    }
  return { group: g, wheels };
}

/* ------------------------------------------------------------------ machines */

export interface MachineModel {
  group: THREE.Group;
  /** Parts that move while it runs. */
  moving: THREE.Object3D[];
  light: THREE.Mesh;
}

/** A machine filling w×d tiles from its origin corner; inputs on the left column, outputs on the right. */
export function machine(type: MachineType, w: number, d: number, color: string): MachineModel {
  const g = new THREE.Group();
  const body = mat(color, 0.45, 0.1);
  const grey = mat("#d5d9e4", 0.6);
  const dark = mat("#3a3f4c", 0.6);
  const steel = mat("#a4abb9", 0.35, 0.6);
  // Conveyors at each end, under the buffers.
  for (const x of [0.5, w - 0.5]) {
    g.add(box(0.9, 0.45, d - 0.06, grey, x, 0.05, d / 2));
    for (let i = 0; i < d * 4; i++) {
      const r = cyl(0.05, 0.86, steel, 8);
      r.rotation.z = Math.PI / 2;
      r.position.set(x, 0.5, 0.15 + i * 0.25);
      g.add(r);
    }
  }
  const moving: THREE.Object3D[] = [];
  const mid = w / 2;
  const inner = w - 2;
  if (type === "press") {
    g.add(box(inner, 0.6, d - 0.3, dark, mid, 0, d / 2));
    g.add(box(0.3, 2.6, 0.3, body, mid - inner / 2 + 0.3, 0, 0.3));
    g.add(box(0.3, 2.6, 0.3, body, mid + inner / 2 - 0.3, 0, 0.3));
    g.add(box(0.3, 2.6, 0.3, body, mid - inner / 2 + 0.3, 0, d - 0.3));
    g.add(box(0.3, 2.6, 0.3, body, mid + inner / 2 - 0.3, 0, d - 0.3));
    g.add(box(inner, 0.5, d - 0.2, body, mid, 2.5, d / 2));
    const ram = box(inner - 0.8, 0.5, d - 0.8, steel, mid, 1.3, d / 2);
    g.add(ram);
    moving.push(ram);
  } else if (type === "saw") {
    g.add(box(inner, 0.85, d - 0.2, grey, mid, 0, d / 2));
    g.add(box(0.15, 1.6, 0.15, body, mid - 0.4, 0.85, 0.15));
    g.add(box(0.15, 1.6, 0.15, body, mid - 0.4, 0.85, d - 0.15));
    const gantry = box(0.3, 0.3, d - 0.1, body, mid - 0.4, 2.3, d / 2);
    g.add(gantry);
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 24), steel);
    blade.rotation.x = Math.PI / 2;
    blade.position.set(mid, 1.15, d / 2);
    g.add(blade);
    moving.push(blade);
  } else if (type === "smt") {
    g.add(box(inner, 0.9, d - 0.4, body, mid, 0, d / 2));
    const hood = new THREE.Mesh(boxGeo(inner - 0.2, 0.6, d - 0.6), new THREE.MeshStandardMaterial({ color: "#bfe9ff", transparent: true, opacity: 0.45, roughness: 0.05 }));
    hood.position.set(mid, 1.2, d / 2);
    g.add(hood);
    for (let i = 0; i < 3; i++) {
      const head = box(0.25, 0.3, 0.25, dark, mid - inner / 2 + 0.6 + i * ((inner - 1.2) / 2), 1.05, d / 2);
      g.add(head);
      moving.push(head);
    }
    g.add(box(0.5, 0.4, 0.4, mat("#1e2430", 0.3), mid, 0.9, 0.25)); // screen
  } else {
    // An assembly cell: a guarded table and a robot arm.
    g.add(box(inner, 0.75, d - 0.4, grey, mid, 0, d / 2));
    const fence = new THREE.MeshStandardMaterial({ color: "#f6c21c", transparent: true, opacity: 0.35 });
    g.add(box(inner, 1.4, 0.04, fence, mid, 0.75, 0.25, false));
    const base = cyl(0.35, 0.3, dark, 18);
    base.position.set(mid, 0.9, d / 2);
    g.add(base);
    const arm = new THREE.Group();
    arm.position.set(mid, 1.05, d / 2);
    const a1 = box(0.22, 1.1, 0.22, body, 0, 0, 0);
    a1.rotation.z = 0.35;
    arm.add(a1);
    const a2 = box(0.18, 0.9, 0.18, body, -0.6, 0.9, 0);
    a2.rotation.z = 1.4;
    arm.add(a2);
    g.add(arm);
    moving.push(arm);
  }
  // A status beacon on a post.
  g.add(box(0.06, 2.8, 0.06, dark, w - 1.05, 0, 0.12));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshBasicMaterial({ color: "#3ddc84" }));
  light.position.set(w - 1.05, 2.9, 0.12);
  g.add(light);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group: g, moving, light };
}

/* ------------------------------------------------------------------ scenery */

export function tree(seed: number) {
  const g = new THREE.Group();
  const trunk = cyl(0.12, 0.9, mat("#9b7653", 0.9), 8);
  trunk.position.y = 0.45;
  g.add(trunk);
  const greens = ["#8fcf8a", "#7cc39a", "#a5d98f", "#86c7a8"];
  const leaf = mat(greens[seed % greens.length], 0.85);
  const n = 2 + (seed % 2);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 - i * 0.12, 1), leaf);
    s.position.set(((seed * 13 + i * 7) % 5) * 0.06 - 0.12, 1.3 + i * 0.55, ((seed * 7 + i * 3) % 5) * 0.06 - 0.12);
    s.castShadow = true;
    g.add(s);
  }
  return g;
}

/** A blue map pin, its point at the origin. */
export function pin() {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: COL.pin, roughness: 0.3, emissive: COL.pin, emissiveIntensity: 0.25 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), blue);
  head.position.y = 1.35;
  g.add(head);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 20), blue);
  cone.rotation.x = Math.PI;
  cone.position.y = 0.75;
  g.add(cone);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  dot.position.set(0, 1.38, 0.32);
  g.add(dot);
  return g;
}

/* ------------------------------------------------------------------ super mega update models */

/** A shared emissive material for lamps: its intensity follows the time of day. */
export const lampMat = new THREE.MeshStandardMaterial({ color: "#fff7e0", emissive: "#ffe7b0", emissiveIntensity: 0, roughness: 0.4 });
export const windowMat = new THREE.MeshStandardMaterial({ color: "#9fc4ef", emissive: "#ffd998", emissiveIntensity: 0, roughness: 0.08, metalness: 0.3 });

export interface TrainModel {
  group: THREE.Group;
  wheels: THREE.Mesh[];
}

/** A shunting locomotive and two flat wagons, running along +x. The origin is the middle of the two wagons. */
export function train(carrier: number): TrainModel {
  const g = new THREE.Group();
  const c = CARRIERS[carrier];
  const dark = mat("#2a2e38", 0.7);
  const steel = mat("#7d8494", 0.5, 0.5);
  const wheels: THREE.Mesh[] = [];
  const tyre = mat("#1d2027", 0.8, 0.4);
  const wagon = (cx: number) => {
    g.add(box(4.6, 0.25, 2.6, mat("#5b6474", 0.6, 0.3), cx, 0.65, 0));
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) g.add(box(0.08, 0.7, 0.08, steel, cx - 2.2 + i * 1.47, 0.9, sx * 1.25));
    for (const wx of [-1.7, -1.0, 1.0, 1.7]) {
      for (const sz of [-0.85, 0.85]) {
        const w = cyl(0.32, 0.12, tyre, 14);
        w.rotation.x = Math.PI / 2;
        w.position.set(cx + wx, 0.32, sz);
        g.add(w);
        wheels.push(w);
      }
    }
  };
  wagon(-2.4);
  wagon(2.4);
  // The locomotive at the front (+x).
  const paint = mat(c.color, 0.35, 0.2);
  const lx = 8.4;
  g.add(box(7, 0.4, 2.6, dark, lx, 0.5, 0));
  g.add(box(4.6, 1.9, 2.2, paint, lx - 1, 0.9, 0));
  g.add(box(2, 2.6, 2.5, paint, lx + 2.3, 0.9, 0));
  g.add(box(2.02, 0.3, 2.52, mat(c.stripe, 0.5), lx + 2.3, 2.6, 0));
  const glass = new THREE.MeshStandardMaterial({ color: "#20293a", roughness: 0.1, metalness: 0.4 });
  g.add(box(0.05, 0.7, 2.0, glass, lx + 3.32, 2.2, 0, false));
  g.add(box(0.1, 0.12, 0.3, new THREE.MeshBasicMaterial({ color: "#fff6d8" }), lx + 3.35, 1.3, 0, false));
  g.add(box(4.6, 0.2, 2.25, mat(c.stripe, 0.5), lx - 1, 1.5, 0));
  for (const wx of [-2.8, -1.6, 1.6, 2.8]) {
    for (const sz of [-0.85, 0.85]) {
      const w = cyl(0.36, 0.14, tyre, 14);
      w.rotation.x = Math.PI / 2;
      w.position.set(lx + wx, 0.36, sz);
      g.add(w);
      wheels.push(w);
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group: g, wheels };
}

/** A charging bay: a cabinet and two charging posts with status lights, 2×1 tiles from its corner. */
export function charger() {
  const g = new THREE.Group();
  g.add(box(1.9, 1.3, 0.5, mat("#e9ecf4", 0.5), 1, 0, 0.3));
  g.add(box(1.9, 0.08, 0.55, mat("#2fae7e", 0.5), 1, 1.3, 0.3));
  const leds: THREE.Mesh[] = [];
  for (const x of [0.5, 1.5]) {
    g.add(box(0.22, 1.1, 0.22, mat("#3a3f4c", 0.6), x, 0, 0.75));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: "#3ddc84" }));
    led.position.set(x, 1.0, 0.87);
    g.add(led);
    leds.push(led);
    // A charging spot painted in front.
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: "#2fae7e", transparent: true, opacity: 0.35 }));
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(x, 0.007, 1.5);
    g.add(spot);
  }
  g.add(box(0.5, 0.35, 0.05, new THREE.MeshBasicMaterial({ color: "#2fae7e" }), 1, 0.85, 0.56, false));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).geometry.type.startsWith("Plane")) o.castShadow = true;
  });
  return { group: g, leds };
}

export interface PersonModel {
  group: THREE.Group;
  legs: THREE.Mesh[];
}

/** A warehouse worker in a hi-vis vest and a hard hat. */
export function person(seed: number): PersonModel {
  const g = new THREE.Group();
  const trousers = mat(["#2c3443", "#3b3f4a", "#24314a"][seed % 3], 0.8);
  const legs: THREE.Mesh[] = [];
  for (const x of [-0.07, 0.07]) {
    const l = box(0.1, 0.42, 0.1, trousers, 0, -0.42, 0);
    const hip = new THREE.Group();
    hip.position.set(x, 0.45, 0);
    l.position.y = -0.21;
    hip.add(l);
    g.add(hip);
    legs.push(hip as unknown as THREE.Mesh);
  }
  g.add(box(0.28, 0.4, 0.16, mat(seed % 2 ? "#ff8a1f" : "#d9f23a", 0.6), 0, 0.45, 0));
  const skin = mat(["#f0c7a0", "#c99a72", "#8d5f3d", "#e8b88f"][seed % 4], 0.8);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), skin);
  head.position.y = 0.95;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(seed % 3 === 0 ? "#f6c21c" : "#ffffff", 0.4));
  hat.position.y = 0.98;
  g.add(hat);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { group: g, legs };
}

/** A parked car, facing +z. */
export function car(seed: number) {
  const g = new THREE.Group();
  const cols = ["#e8ecf4", "#2f6fe4", "#d94848", "#2b2f3a", "#9aa4b1", "#f0b429", "#1f9d74"];
  const paint = mat(cols[seed % cols.length], 0.3, 0.3);
  g.add(box(1.7, 0.55, 3.9, paint, 0, 0.25, 0));
  g.add(box(1.5, 0.48, 2.0, new THREE.MeshStandardMaterial({ color: "#25303f", roughness: 0.1, metalness: 0.4 }), 0, 0.8, -0.2));
  for (const x of [-0.75, 0.75])
    for (const z of [-1.25, 1.25]) {
      const w = cyl(0.3, 0.2, mat("#1d2027", 0.9), 12);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.3, z);
      g.add(w);
    }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

/** A two-storey glass office with a canopy and a rooftop sign. w along x, d along z. */
export function office(w: number, d: number) {
  const g = new THREE.Group();
  const frame = mat("#e6e9f3", 0.6);
  g.add(box(w, 0.3, d, frame, 0, 0, 0));
  g.add(box(w - 0.3, 5.6, d - 0.3, windowMat, 0, 0.3, 0));
  for (let x = -w / 2 + 0.15; x <= w / 2; x += 1.6) g.add(box(0.12, 5.6, d + 0.02, frame, x, 0.3, 0));
  for (const y of [0.3, 3.0, 5.8]) g.add(box(w + 0.05, 0.25, d + 0.05, frame, 0, y, 0));
  g.add(box(w + 0.4, 0.3, d + 0.4, mat("#cfd3f7", 0.6), 0, 6.0, 0));
  g.add(box(3.6, 0.15, 2, frame, 0, 2.6, d / 2 + 1));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshBasicMaterial({ map: signTexture("WAREFORGE", "#2f6fe4"), transparent: true }));
  sign.position.set(0, 7.1, d / 2 - 0.5);
  g.add(sign);
  g.add(box(5.2, 0.12, 0.12, frame, 0, 6.4, d / 2 - 0.5));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/** The gatehouse and a barrier arm (returned so it can lift). */
export function gatehouse() {
  const g = new THREE.Group();
  g.add(box(2.4, 2.6, 2.4, mat("#e9ecf4", 0.6), 0, 0, 0));
  g.add(box(2.42, 0.9, 2.42, windowMat, 0, 1.3, 0));
  g.add(box(2.8, 0.2, 2.8, mat("#2f6fe4", 0.5), 0, 2.6, 0));
  g.add(box(0.3, 1.0, 0.3, mat("#f6c21c", 0.5), 1.6, 0, 1.4));
  const arm = new THREE.Group();
  arm.position.set(1.6, 0.95, 1.4);
  const bar = box(5.5, 0.12, 0.12, mat("#d94848", 0.5), 2.75, -0.06, 0);
  arm.add(bar);
  for (let i = 0; i < 4; i++) arm.add(box(0.6, 0.125, 0.125, mat("#ffffff", 0.5), 0.9 + i * 1.3, -0.065, 0));
  g.add(arm);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { group: g, arm };
}

/** A street lamp; its head glows at night. */
export function streetLamp() {
  const g = new THREE.Group();
  const pole = mat("#7d8494", 0.5, 0.5);
  g.add(box(0.14, 5.2, 0.14, pole, 0, 0, 0));
  g.add(box(1.2, 0.1, 0.1, pole, 0.55, 5.1, 0));
  const head = box(0.6, 0.12, 0.3, lampMat, 1.1, 5.0, 0, false);
  g.add(head);
  return g;
}

/** A ship-to-shore container crane (for the harbor). */
export function crane(color: string) {
  const g = new THREE.Group();
  const m = mat(color, 0.5, 0.2);
  for (const x of [-3, 3]) for (const z of [-2.5, 2.5]) g.add(box(0.5, 14, 0.5, m, x, 0, z));
  g.add(box(6.5, 0.8, 0.8, m, 0, 13, -2.5));
  g.add(box(6.5, 0.8, 0.8, m, 0, 13, 2.5));
  g.add(box(0.8, 0.8, 26, m, -2.2, 14, 6));
  g.add(box(0.8, 0.8, 26, m, 2.2, 14, 6));
  g.add(box(3, 2, 2.2, mat("#e8ecf4", 0.5), 0, 12.6, 9));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

export const CONTAINER_COLORS = ["#d94848", "#2f6fe4", "#1f9d74", "#f0743a", "#7c5cf0", "#e9ecf4", "#f0b429"];
