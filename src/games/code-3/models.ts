import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CarKind } from "./vehicles";
import { SPECS } from "./vehicles";

/**
 * Procedural models for Code 3: cars (civilian shapes + police liveries with
 * light bars) and people (civilians, suspects, officers) with a simple rig
 * for walking, running, hands up, cuffed and down poses.
 *
 * Car local frame: +x forward, +y up, +z to the driver's right.
 */

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** A box whose top face is narrower front-to-back (a sloped cabin). */
function cabin(len: number, h: number, wid: number, x: number, y: number, taperF: number, taperB: number) {
  const g = new THREE.BoxGeometry(len, h, wid);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      const px = p.getX(i);
      p.setX(i, px > 0 ? px - taperF : px + taperB);
      p.setZ(i, p.getZ(i) * 0.9);
    }
  }
  g.computeVertexNormals();
  return g.translate(x, y, 0);
}

interface Shape {
  bodyH: number;
  clear: number;
  cabFrom: number;
  cabTo: number;
  cabH: number;
  taperF: number;
  taperB: number;
  bed?: boolean;
  boxy?: boolean;
}

const SHAPES: Record<CarKind, Shape> = {
  sedan: { bodyH: 0.62, clear: 0.3, cabFrom: -0.32, cabTo: 0.18, cabH: 0.55, taperF: 0.45, taperB: 0.3 },
  cruiser: { bodyH: 0.64, clear: 0.3, cabFrom: -0.32, cabTo: 0.18, cabH: 0.56, taperF: 0.45, taperB: 0.3 },
  slicktop: { bodyH: 0.62, clear: 0.3, cabFrom: -0.32, cabTo: 0.18, cabH: 0.55, taperF: 0.45, taperB: 0.3 },
  suv: { bodyH: 0.8, clear: 0.42, cabFrom: -0.44, cabTo: 0.16, cabH: 0.62, taperF: 0.35, taperB: 0.05 },
  interceptor: { bodyH: 0.78, clear: 0.4, cabFrom: -0.44, cabTo: 0.16, cabH: 0.6, taperF: 0.35, taperB: 0.05 },
  van: { bodyH: 1.1, clear: 0.38, cabFrom: -0.48, cabTo: 0.3, cabH: 0.85, taperF: 0.3, taperB: 0, boxy: true },
  transport: { bodyH: 1.2, clear: 0.4, cabFrom: -0.48, cabTo: 0.3, cabH: 0.9, taperF: 0.3, taperB: 0, boxy: true },
  pickup: { bodyH: 0.78, clear: 0.45, cabFrom: -0.08, cabTo: 0.22, cabH: 0.62, taperF: 0.3, taperB: 0.05, bed: true },
  sports: { bodyH: 0.5, clear: 0.2, cabFrom: -0.28, cabTo: 0.1, cabH: 0.45, taperF: 0.55, taperB: 0.45 },
  pursuit: { bodyH: 0.52, clear: 0.22, cabFrom: -0.28, cabTo: 0.12, cabH: 0.46, taperF: 0.5, taperB: 0.4 },
};

const shared = {
  glass: new THREE.MeshStandardMaterial({ color: "#0e141b", metalness: 0.85, roughness: 0.12 }),
  trim: new THREE.MeshStandardMaterial({ color: "#151618", roughness: 0.75 }),
  tyre: new THREE.MeshStandardMaterial({ color: "#0c0c0d", roughness: 0.9 }),
  hub: new THREE.MeshStandardMaterial({ color: "#a2a8ae", metalness: 0.8, roughness: 0.3 }),
  white: new THREE.MeshStandardMaterial({ color: "#eef0f2", metalness: 0.4, roughness: 0.35 }),
  head: new THREE.MeshStandardMaterial({ color: "#fff6dc", emissive: "#fff2c8", emissiveIntensity: 0.4 }),
};
const bodyMats = new Map<string, THREE.MeshStandardMaterial>();
function bodyMat(color: string) {
  let m = bodyMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.32 });
    bodyMats.set(color, m);
  }
  return m;
}

let policeDecal: THREE.CanvasTexture | null = null;
function policeText() {
  if (policeDecal) return policeDecal;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = "#0b1a3a";
  g.font = "bold 44px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("POLICE", 128, 34);
  policeDecal = new THREE.CanvasTexture(c);
  policeDecal.colorSpace = THREE.SRGBColorSpace;
  return policeDecal;
}

const geoCache = new Map<string, { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; trim: THREE.BufferGeometry; tyres: THREE.BufferGeometry; hubs: THREE.BufferGeometry; white?: THREE.BufferGeometry; heads: THREE.BufferGeometry; tails: THREE.BufferGeometry }>();

function carGeometry(kind: CarKind) {
  const hit = geoCache.get(kind);
  if (hit) return hit;
  const s = SPECS[kind];
  const sh = SHAPES[kind];
  const L = s.len;
  const W = s.wid;
  const y0 = sh.clear;
  const body: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const white: THREE.BufferGeometry[] = [];

  body.push(box(L, sh.bodyH, W, 0, y0 + sh.bodyH / 2, 0));
  const cl = (sh.cabTo - sh.cabFrom) * L;
  const cx = ((sh.cabTo + sh.cabFrom) / 2) * L;
  const cy = y0 + sh.bodyH + sh.cabH / 2;
  if (sh.boxy) {
    // Vans: tall box body behind a sloped windscreen.
    body.push(box(L * 0.72, sh.cabH, W, -L * 0.14, cy, 0));
    glass.push(cabin(L * 0.2, sh.cabH * 0.95, W * 0.98, L * 0.3, cy, 0.25, 0));
    glass.push(box(0.02, sh.cabH * 0.5, W * 0.9, -L / 2 - 0.005, cy + 0.1, 0));
  } else {
    glass.push(cabin(cl, sh.cabH, W * 0.94, cx, cy, sh.taperF, sh.taperB));
    // Roof skin in body colour.
    body.push(box(Math.max(0.4, cl - sh.taperF - sh.taperB - 0.1), 0.06, W * 0.84, cx - (sh.taperF - sh.taperB) / 2, y0 + sh.bodyH + sh.cabH + 0.02, 0));
  }
  if (sh.bed) {
    // Pickup bed walls.
    body.push(box(L * 0.42, 0.35, 0.08, -L * 0.29, y0 + sh.bodyH + 0.17, W / 2 - 0.04));
    body.push(box(L * 0.42, 0.35, 0.08, -L * 0.29, y0 + sh.bodyH + 0.17, -W / 2 + 0.04));
    body.push(box(0.08, 0.35, W, -L / 2 + 0.04, y0 + sh.bodyH + 0.17, 0));
  }
  // Bumpers and side skirts.
  trim.push(box(0.16, 0.24, W * 1.01, L / 2 + 0.02, y0 + 0.12, 0));
  trim.push(box(0.16, 0.24, W * 1.01, -L / 2 - 0.02, y0 + 0.12, 0));
  trim.push(box(L * 0.7, 0.08, W * 1.02, 0, y0 + 0.04, 0));
  const police = !!s.police;
  if (police && kind !== "slicktop") {
    // Push bar.
    if (kind !== "pursuit" && kind !== "transport") {
      trim.push(box(0.1, 0.5, W * 0.7, L / 2 + 0.2, y0 + 0.3, 0));
      trim.push(box(0.25, 0.08, W * 0.7, L / 2 + 0.12, y0 + 0.5, 0));
    }
    if (kind === "transport") white.push(box(L * 0.99, 0.25, W * 1.01, 0, y0 + sh.bodyH * 0.55, 0));
    else {
      // Black-and-white: white doors.
      white.push(box(L * 0.46, sh.bodyH * 0.72, W * 1.012, -L * 0.04, y0 + sh.bodyH * 0.52, 0));
      white.push(box(0.4, 0.05, W * 0.84, cx, y0 + sh.bodyH + sh.cabH + 0.05, 0));
    }
  }
  // Wheels.
  const wr = kind === "van" || kind === "transport" || kind === "pickup" || kind === "suv" || kind === "interceptor" ? 0.4 : 0.35;
  const tyres: THREE.BufferGeometry[] = [];
  const hubs: THREE.BufferGeometry[] = [];
  for (const wx of [L * 0.32, -L * 0.32])
    for (const wz of [W / 2 - 0.12, -W / 2 + 0.12]) {
      tyres.push(new THREE.CylinderGeometry(wr, wr, 0.26, 14).rotateX(Math.PI / 2).translate(wx, wr, wz));
      hubs.push(new THREE.CylinderGeometry(wr * 0.55, wr * 0.55, 0.27, 10).rotateX(Math.PI / 2).translate(wx, wr, wz));
    }
  const heads = mergeGeometries([box(0.05, 0.12, 0.34, L / 2 + 0.005, y0 + sh.bodyH * 0.72, W / 2 - 0.3), box(0.05, 0.12, 0.34, L / 2 + 0.005, y0 + sh.bodyH * 0.72, -W / 2 + 0.3)]);
  const tails = mergeGeometries([box(0.05, 0.12, 0.3, -L / 2 - 0.005, y0 + sh.bodyH * 0.74, W / 2 - 0.28), box(0.05, 0.12, 0.3, -L / 2 - 0.005, y0 + sh.bodyH * 0.74, -W / 2 + 0.28)]);
  const out = {
    body: mergeGeometries(body),
    glass: mergeGeometries(glass),
    trim: mergeGeometries(trim),
    tyres: mergeGeometries(tyres),
    hubs: mergeGeometries(hubs),
    white: white.length ? mergeGeometries(white) : undefined,
    heads,
    tails,
  };
  geoCache.set(kind, out);
  return out;
}

export interface CarModel {
  group: THREE.Group;
  tail: THREE.MeshStandardMaterial;
  heads: THREE.Mesh;
  /** Police light bar: red (driver side) and blue lamps. */
  red?: THREE.MeshStandardMaterial;
  blue?: THREE.MeshStandardMaterial;
  smoke?: THREE.Mesh;
}

export function buildCar(kind: CarKind, color: string): CarModel {
  const g = carGeometry(kind);
  const s = SPECS[kind];
  const sh = SHAPES[kind];
  const group = new THREE.Group();
  const police = !!s.police;
  const mat = bodyMat(police && kind !== "transport" && kind !== "slicktop" ? "#0d0f13" : color);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, cast = false) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = cast;
    group.add(mesh);
    return mesh;
  };
  add(g.body, mat, true);
  add(g.glass, shared.glass);
  add(g.trim, shared.trim);
  add(g.tyres, shared.tyre);
  add(g.hubs, shared.hub);
  if (g.white) add(g.white, shared.white);
  const heads = add(g.heads, shared.head);
  const tail = new THREE.MeshStandardMaterial({ color: "#5a0b0b", emissive: "#ff1a1a", emissiveIntensity: 0.3 });
  add(g.tails, tail);
  const model: CarModel = { group, tail, heads };
  if (police) {
    const red = new THREE.MeshStandardMaterial({ color: "#5a0000", emissive: "#ff1020", emissiveIntensity: 0 });
    const blue = new THREE.MeshStandardMaterial({ color: "#00104a", emissive: "#1848ff", emissiveIntensity: 0 });
    const topY = sh.clear + sh.bodyH + sh.cabH + (sh.boxy ? 0 : 0.06);
    const cx = ((sh.cabTo + sh.cabFrom) / 2) * s.len;
    if (kind === "slicktop") {
      // Hidden lights behind the windscreen and in the grille.
      add(box(0.06, 0.08, 0.5, cx + 0.3, topY - 0.14, -0.35), red);
      add(box(0.06, 0.08, 0.5, cx + 0.3, topY - 0.14, 0.35), blue);
      add(box(0.04, 0.07, 0.2, s.len / 2 + 0.01, sh.clear + 0.2, -0.3), red);
      add(box(0.04, 0.07, 0.2, s.len / 2 + 0.01, sh.clear + 0.2, 0.3), blue);
    } else {
      const bx = sh.boxy ? s.len * 0.2 : cx;
      add(box(0.32, 0.08, s.wid * 0.86, bx, topY + 0.04, 0), shared.trim);
      add(box(0.28, 0.12, s.wid * 0.4, bx, topY + 0.14, -s.wid * 0.22), red);
      add(box(0.28, 0.12, s.wid * 0.4, bx, topY + 0.14, s.wid * 0.22), blue);
      add(box(0.3, 0.05, 0.12, bx, topY + 0.14, 0), shared.head);
    }
    if (kind !== "slicktop") {
      // "POLICE" on both front doors.
      const decal = new THREE.MeshBasicMaterial({ map: policeText(), transparent: true, depthWrite: false });
      for (const side of [1, -1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38), decal);
        p.position.set(-s.len * 0.04, sh.clear + sh.bodyH * 0.55, side * (s.wid / 2 + 0.012));
        p.rotation.y = side > 0 ? 0 : Math.PI;
        group.add(p);
      }
    }
    model.red = red;
    model.blue = blue;
  }
  return model;
}

// ------------------------------------------------------------------- people

export interface PedModel {
  group: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  gun: THREE.Mesh;
  taser: THREE.Mesh;
}

const pedMats = new Map<string, THREE.MeshStandardMaterial>();
function pmat(color: string) {
  let m = pedMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    pedMats.set(color, m);
  }
  return m;
}
const limbGeo = new THREE.BoxGeometry(0.16, 0.86, 0.18).translate(0, -0.43, 0);
const armGeo = new THREE.BoxGeometry(0.13, 0.62, 0.13).translate(0, -0.31, 0);
const torsoGeo = new THREE.BoxGeometry(0.26, 0.62, 0.46);
const headGeo = new THREE.SphereGeometry(0.13, 12, 10);
const hairGeo = new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const capGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.08, 14).translate(0, 0.1, 0);
const brimGeo = new THREE.BoxGeometry(0.12, 0.02, 0.22).translate(0.13, 0.07, 0);
const belt = new THREE.BoxGeometry(0.28, 0.08, 0.48);
const gunGeo = new THREE.BoxGeometry(0.22, 0.1, 0.05).translate(0.1, -0.62, 0);
const handGeo = new THREE.SphereGeometry(0.06, 8, 6).translate(0, -0.64, 0);

export function buildPed(o: { skin: string; shirt: string; pants: string; officer?: boolean; hair?: string }): PedModel {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const skin = pmat(o.skin);
  const shirt = pmat(o.shirt);
  const pants = pmat(o.pants);
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const leg = (z: number) => {
    const g = new THREE.Group();
    g.position.set(0, 0.92, z);
    mk(limbGeo, pants, g);
    body.add(g);
    return g;
  };
  const legL = leg(-0.11);
  const legR = leg(0.11);
  mk(torsoGeo, shirt, body, 0, 1.23, 0);
  const arm = (z: number) => {
    const g = new THREE.Group();
    g.position.set(0, 1.5, z);
    mk(armGeo, shirt, g);
    mk(handGeo, skin, g);
    body.add(g);
    return g;
  };
  const armL = arm(-0.3);
  const armR = arm(0.3);
  mk(headGeo, skin, body, 0.01, 1.7, 0);
  if (o.officer) {
    const navy = pmat("#141c2e");
    mk(capGeo, navy, body, 0, 1.73, 0);
    mk(brimGeo, pmat("#0b0f18"), body, 0, 1.73, 0);
    mk(belt, pmat("#111111"), body, 0, 0.95, 0);
    // Badge.
    mk(new THREE.BoxGeometry(0.02, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: "#d9b44a", metalness: 0.9, roughness: 0.25 }), body, 0.14, 1.4, -0.12);
  } else mk(hairGeo, pmat(o.hair ?? "#2a1d14"), body, 0, 1.72, 0);
  const gun = mk(gunGeo, pmat("#1a1a1a"), armR);
  gun.visible = false;
  const taser = mk(gunGeo, pmat("#e5c52e"), armR);
  taser.visible = false;
  return { group, body, legL, legR, armL, armR, gun, taser };
}

export type Pose = "walk" | "stand" | "handsup" | "cuffed" | "down" | "dead" | "aim" | "drive";

/** Animate a person: `step` is the walk cycle, `speed` in m/s. */
export function posePed(m: PedModel, pose: Pose, step: number, speed: number) {
  const swing = Math.min(1, speed / 4) * 0.7;
  const s = Math.sin(step * 2.2);
  m.body.rotation.set(0, 0, 0);
  m.body.position.set(0, 0, 0);
  m.legL.rotation.set(0, 0, s * swing);
  m.legR.rotation.set(0, 0, -s * swing);
  m.armL.rotation.set(0, 0, -s * swing * 0.8);
  m.armR.rotation.set(0, 0, s * swing * 0.8);
  if (speed > 4.5) m.body.rotation.z = -0.18;
  switch (pose) {
    case "handsup":
      m.armL.rotation.set(-0.25, 0, Math.PI * 0.95);
      m.armR.rotation.set(0.25, 0, Math.PI * 0.95);
      break;
    case "cuffed":
      m.armL.rotation.set(0.35, 0, -0.35);
      m.armR.rotation.set(-0.35, 0, -0.35);
      break;
    case "aim":
      m.armR.rotation.set(0, 0, Math.PI / 2);
      m.armL.rotation.set(0.35, 0, Math.PI / 2.2);
      break;
    case "down":
    case "dead":
      m.body.rotation.x = Math.PI / 2;
      m.body.position.y = 0.16;
      m.legL.rotation.set(0, 0, 0.1);
      m.legR.rotation.set(0, 0, -0.15);
      m.armL.rotation.set(-0.6, 0, 0.4);
      m.armR.rotation.set(0.6, 0, -0.2);
      break;
    case "drive":
      m.legL.rotation.set(0, 0, Math.PI / 2);
      m.legR.rotation.set(0, 0, Math.PI / 2);
      m.body.position.y = -0.45;
      m.armL.rotation.set(0, 0, Math.PI / 3);
      m.armR.rotation.set(0, 0, Math.PI / 3);
      break;
  }
}
