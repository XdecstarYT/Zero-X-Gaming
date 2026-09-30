import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { wrapOf } from "../cosmetics";
import { RARITY, type ConsumableKind, type Rarity, type WeaponKind } from "../items";
import { wrapTexture } from "./textures";

/**
 * Weapon and item models built from primitives, at real-world scale (metres).
 * Barrel points along +X, grip hangs down (-Y). Each gun exposes a `muzzle`
 * child for flashes and tracers, and a `grip`/`fore` pair for hand placement.
 */

export interface GunModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  /** Where the trigger hand holds (local). */
  grip: THREE.Vector3;
  /** Where the support hand holds (local). */
  fore: THREE.Vector3;
  /** Sight height above the bore line (for aiming down sights). */
  sightY: number;
}

const matCache = new Map<string, THREE.Material>();

function mat(key: string, make: () => THREE.Material) {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

const metal = () =>
  mat("metal", () => new THREE.MeshStandardMaterial({ color: "#1f2124", metalness: 0.6, roughness: 0.45 }));
const polymer = () =>
  mat("polymer", () => new THREE.MeshStandardMaterial({ color: "#1d1e20", metalness: 0.1, roughness: 0.7 }));
const wood = () => mat("wood", () => new THREE.MeshStandardMaterial({ color: "#6e4a2c", metalness: 0, roughness: 0.62 }));
const glass = () =>
  mat(
    "glass",
    () => new THREE.MeshStandardMaterial({ color: "#1c3a52", metalness: 0.9, roughness: 0.05, emissive: "#0a2233", emissiveIntensity: 0.6 }),
  );

function wrapMat(wrapId: string) {
  const w = wrapOf(wrapId);
  return mat(`wrap:${w.id}`, () => {
    const map = wrapTexture(w.base, w.alt, w.pattern);
    map.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({ map, metalness: w.metal, roughness: 0.45 });
  });
}

function rarityMat(r: Rarity) {
  return mat(
    `rarity:${r}`,
    () =>
      new THREE.MeshStandardMaterial({
        color: RARITY[r].color,
        emissive: RARITY[r].color,
        emissiveIntensity: r === "common" ? 0.05 : 0.45,
        metalness: 0.3,
        roughness: 0.4,
      }),
  );
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function box(w: number, h: number, d: number) {
  const k = `b${w},${h},${d}`;
  let g = geoCache.get(k);
  // Slightly rounded edges read as machined metal / moulded polymer.
  if (!g) geoCache.set(k, (g = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.22)));
  return g;
}
function cyl(r: number, len: number, seg = 12) {
  const k = `c${r},${len},${seg}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(r, r, len, seg);
    g.rotateZ(Math.PI / 2); // along X
    geoCache.set(k, g);
  }
  return g;
}

function part(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.z = rz;
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

export function buildGun(kind: WeaponKind, rarity: Rarity, wrapId: string, era?: "ww1"): GunModel {
  if (era === "ww1") return buildWW1Gun(kind);
  const g = new THREE.Group();
  const body = wrapMat(wrapId);
  const accent = rarityMat(rarity);
  const muzzle = new THREE.Object3D();
  let grip = new THREE.Vector3();
  let fore = new THREE.Vector3();
  let sightY = 0.06;

  switch (kind) {
    case "pistol": {
      part(g, box(0.19, 0.035, 0.03), metal(), 0.02, 0.025); // slide
      part(g, box(0.17, 0.028, 0.028), body, 0.015, -0.005); // frame
      part(g, box(0.05, 0.11, 0.03), body, -0.045, -0.065, 0, 0.22); // grip
      part(g, box(0.045, 0.006, 0.026), polymer(), 0.0, -0.035); // trigger guard
      part(g, box(0.1, 0.004, 0.031), accent, 0.02, 0.012);
      part(g, box(0.01, 0.012, 0.01), metal(), 0.1, 0.048); // front sight
      muzzle.position.set(0.12, 0.025, 0);
      grip = new THREE.Vector3(-0.045, -0.06, 0);
      fore = new THREE.Vector3(-0.03, -0.07, 0);
      sightY = 0.05;
      break;
    }
    case "smg": {
      part(g, box(0.3, 0.07, 0.05), body, 0, 0); // receiver
      part(g, cyl(0.013, 0.12), metal(), 0.21, 0.01); // barrel
      part(g, cyl(0.022, 0.07), metal(), 0.19, 0.01); // suppressor-ish shroud
      part(g, box(0.035, 0.16, 0.03), polymer(), 0.03, -0.11, 0, -0.05); // mag
      part(g, box(0.045, 0.1, 0.035), polymer(), -0.08, -0.08, 0, 0.25); // grip
      part(g, box(0.18, 0.015, 0.012), metal(), -0.23, 0.005, 0.02); // wire stock
      part(g, box(0.18, 0.015, 0.012), metal(), -0.23, 0.005, -0.02);
      part(g, box(0.02, 0.07, 0.05), polymer(), -0.32, 0);
      part(g, box(0.12, 0.012, 0.051), accent, 0.02, 0.02);
      part(g, box(0.06, 0.03, 0.03), polymer(), 0.02, 0.05); // sight
      muzzle.position.set(0.28, 0.01, 0);
      grip = new THREE.Vector3(-0.08, -0.07, 0);
      fore = new THREE.Vector3(0.12, -0.03, 0);
      sightY = 0.065;
      break;
    }
    case "ar": {
      part(g, box(0.36, 0.08, 0.055), body, 0, 0); // receiver
      part(g, box(0.26, 0.06, 0.06), polymer(), 0.3, 0.005); // handguard
      part(g, cyl(0.012, 0.2), metal(), 0.5, 0.01); // barrel
      part(g, cyl(0.02, 0.05), metal(), 0.61, 0.01); // muzzle brake
      part(g, box(0.05, 0.19, 0.035), polymer(), 0.07, -0.13, 0, -0.18); // curved-ish mag
      part(g, box(0.045, 0.11, 0.04), polymer(), -0.1, -0.09, 0, 0.3); // grip
      part(g, box(0.24, 0.07, 0.045), body, -0.3, -0.015, 0, 0.05); // stock
      part(g, box(0.03, 0.11, 0.05), polymer(), -0.42, -0.02);
      part(g, box(0.34, 0.012, 0.056), accent, 0.02, 0.03);
      // Red-dot optic
      part(g, box(0.09, 0.012, 0.03), metal(), 0.02, 0.05);
      part(g, cyl(0.022, 0.07, 14), polymer(), 0.02, 0.078);
      part(g, cyl(0.016, 0.072, 14), glass(), 0.02, 0.078);
      muzzle.position.set(0.64, 0.01, 0);
      grip = new THREE.Vector3(-0.1, -0.08, 0);
      fore = new THREE.Vector3(0.28, -0.03, 0);
      sightY = 0.078;
      break;
    }
    case "shotgun": {
      part(g, box(0.26, 0.07, 0.055), body, 0, 0); // receiver
      part(g, cyl(0.016, 0.52), metal(), 0.39, 0.015); // barrel
      part(g, cyl(0.014, 0.42), metal(), 0.33, -0.018); // tube mag
      part(g, cyl(0.026, 0.16, 10), wood(), 0.3, -0.018); // pump
      part(g, box(0.05, 0.1, 0.04), wood(), -0.1, -0.08, 0, 0.35); // grip
      part(g, box(0.3, 0.075, 0.045), wood(), -0.3, -0.03, 0, 0.1); // stock
      part(g, box(0.2, 0.012, 0.056), accent, 0.0, 0.03);
      part(g, box(0.012, 0.012, 0.012), metal(), 0.64, 0.035); // bead sight
      muzzle.position.set(0.66, 0.015, 0);
      grip = new THREE.Vector3(-0.1, -0.07, 0);
      fore = new THREE.Vector3(0.3, -0.04, 0);
      sightY = 0.035;
      break;
    }
    case "sniper": {
      part(g, box(0.34, 0.075, 0.055), body, 0, 0); // receiver
      part(g, cyl(0.014, 0.6), metal(), 0.46, 0.01); // barrel
      part(g, cyl(0.022, 0.06), metal(), 0.77, 0.01); // brake
      part(g, box(0.3, 0.05, 0.06), body, 0.26, -0.03); // forend
      part(g, box(0.045, 0.11, 0.04), polymer(), -0.1, -0.09, 0, 0.3); // grip
      part(g, box(0.34, 0.09, 0.05), body, -0.33, -0.02, 0, 0.04); // stock
      part(g, box(0.16, 0.03, 0.052), polymer(), -0.3, 0.035); // cheek rest
      part(g, box(0.05, 0.08, 0.03), polymer(), 0.05, -0.08); // mag
      part(g, cyl(0.008, 0.06), metal(), -0.02, 0.02, 0.05).rotation.y = Math.PI / 2; // bolt
      part(g, box(0.3, 0.012, 0.056), accent, 0.02, 0.028);
      // Scope
      part(g, cyl(0.022, 0.3, 16), polymer(), 0.02, 0.09);
      part(g, cyl(0.032, 0.07, 16), polymer(), 0.16, 0.09);
      part(g, cyl(0.03, 0.06, 16), polymer(), -0.12, 0.09);
      part(g, cyl(0.028, 0.072, 16), glass(), 0.16, 0.09);
      part(g, box(0.03, 0.04, 0.02), metal(), -0.04, 0.055);
      part(g, box(0.03, 0.04, 0.02), metal(), 0.08, 0.055);
      muzzle.position.set(0.8, 0.01, 0);
      grip = new THREE.Vector3(-0.1, -0.08, 0);
      fore = new THREE.Vector3(0.24, -0.05, 0);
      sightY = 0.09;
      break;
    }
  }
  g.add(muzzle);
  return { group: g, muzzle, grip, fore, sightY };
}

export function buildConsumable(kind: ConsumableKind): THREE.Group {
  const g = new THREE.Group();
  if (kind === "medkit") {
    const white = mat("medkit", () => new THREE.MeshStandardMaterial({ color: "#e9ecef", roughness: 0.5 }));
    const red = mat("medcross", () => new THREE.MeshStandardMaterial({ color: "#c62828", roughness: 0.5 }));
    part(g, box(0.2, 0.13, 0.08), white, 0, 0);
    part(g, box(0.1, 0.03, 0.082), red, 0, 0);
    part(g, box(0.03, 0.1, 0.082), red, 0, 0);
    part(g, box(0.08, 0.02, 0.03), polymer(), 0, 0.075);
  } else {
    const liquid = mat(
      "shieldLiquid",
      () =>
        new THREE.MeshStandardMaterial({
          color: "#3c9bff",
          emissive: "#1f6fe0",
          emissiveIntensity: 0.8,
          roughness: 0.1,
          metalness: 0.1,
          transparent: true,
          opacity: 0.9,
        }),
    );
    const bottle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), liquid);
    bottle.castShadow = true;
    g.add(bottle);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.07, 10), liquid);
    neck.position.y = 0.08;
    g.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.03, 10), wood());
    cork.position.y = 0.125;
    g.add(cork);
  }
  return g;
}

// --------------------------------------------------------------- Great War

const walnut = () => mat("walnut", () => new THREE.MeshStandardMaterial({ color: "#5a3a22", metalness: 0, roughness: 0.55 }));
const walnutDark = () => mat("walnutDark", () => new THREE.MeshStandardMaterial({ color: "#3e2716", metalness: 0, roughness: 0.6 }));
const blued = () => mat("blued", () => new THREE.MeshStandardMaterial({ color: "#23262b", metalness: 0.75, roughness: 0.38 }));
const worn = () => mat("worn", () => new THREE.MeshStandardMaterial({ color: "#4a4d52", metalness: 0.8, roughness: 0.3 }));
const brass = () => mat("brass", () => new THREE.MeshStandardMaterial({ color: "#b08a3e", metalness: 0.85, roughness: 0.35 }));
const leather = () => mat("leather", () => new THREE.MeshStandardMaterial({ color: "#5b3b22", metalness: 0, roughness: 0.8 }));

function plainBox(w: number, h: number, d: number) {
  const k = `p${w},${h},${d}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
}

/** A tapering wooden stock (butt) seen from the side, extruded to its width. */
function stockGeo(len: number, heel: number, toe: number, wrist: number, width: number) {
  const k = `s${len},${heel},${toe},${wrist},${width}`;
  let g = geoCache.get(k);
  if (!g) {
    const s = new THREE.Shape();
    s.moveTo(0, wrist / 2);
    s.lineTo(-len, heel);
    s.lineTo(-len, -toe);
    s.lineTo(0, -wrist / 2);
    s.closePath();
    g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
    g.translate(0, 0, -width / 2);
    geoCache.set(k, g);
  }
  return g;
}

/** Period weapons for Trenches: walnut, blued steel and brass, at real size. */
export function buildWW1Gun(kind: WeaponKind): GunModel {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let grip = new THREE.Vector3();
  let fore = new THREE.Vector3();
  let sightY = 0.05;

  const rifle = (scoped: boolean) => {
    // Full-length wooden furniture over the barrel (Lee-Enfield SMLE).
    part(g, plainBox(0.62, 0.045, 0.042), walnut(), 0.28, -0.005); // forend
    part(g, plainBox(0.5, 0.022, 0.036), walnut(), 0.3, 0.03); // upper handguard
    part(g, cyl(0.009, 0.1), blued(), 0.64, 0.012); // barrel stub + nose cap
    part(g, plainBox(0.05, 0.05, 0.046), blued(), 0.6, 0.0); // nose cap
    part(g, plainBox(0.02, 0.035, 0.03), blued(), 0.645, 0.03); // front sight protector
    part(g, plainBox(0.2, 0.05, 0.04), blued(), -0.07, 0.008); // receiver
    part(g, plainBox(0.06, 0.07, 0.034), blued(), -0.02, -0.055); // magazine
    part(g, plainBox(0.07, 0.008, 0.03), blued(), -0.08, -0.03); // trigger guard
    // Bolt with its round knob, on the right.
    part(g, cyl(0.008, 0.1), worn(), -0.1, 0.03);
    const handle = part(g, cyl(0.005, 0.05), worn(), -0.1, 0.02, 0.03);
    handle.rotation.y = Math.PI / 2;
    part(g, new THREE.SphereGeometry(0.011, 10, 8), worn(), -0.1, 0.012, 0.056);
    part(g, plainBox(0.06, 0.012, 0.02), blued(), 0.1, 0.045); // rear sight leaf
    part(g, stockGeo(0.36, 0.05, 0.075, 0.045, 0.04), walnut(), -0.16, -0.01); // butt
    part(g, plainBox(0.012, 0.13, 0.042), brass(), -0.525, 0.0); // brass butt plate
    part(g, plainBox(0.03, 0.006, 0.043), brass(), 0.12, -0.03); // barrel band
    part(g, plainBox(0.03, 0.006, 0.043), brass(), 0.44, -0.03);
    // Sling.
    const sling = part(g, plainBox(0.6, 0.004, 0.022), leather(), 0.0, -0.075);
    sling.rotation.z = 0.06;
    if (scoped) {
      // Offset Aldis-pattern scope on a side mount.
      part(g, cyl(0.016, 0.3, 14), blued(), -0.02, 0.085, -0.012);
      part(g, cyl(0.021, 0.05, 14), blued(), 0.13, 0.085, -0.012);
      part(g, cyl(0.02, 0.05, 14), blued(), -0.16, 0.085, -0.012);
      part(g, cyl(0.018, 0.052, 14), glass(), 0.13, 0.085, -0.012);
      part(g, plainBox(0.03, 0.04, 0.02), blued(), -0.06, 0.055, -0.01);
      part(g, plainBox(0.03, 0.04, 0.02), blued(), 0.05, 0.055, -0.01);
      muzzle.position.set(0.7, 0.012, 0);
      sightY = 0.085;
    } else {
      // Pattern 1907 sword bayonet.
      part(g, plainBox(0.04, 0.035, 0.03), blued(), 0.67, -0.008);
      const blade = part(g, plainBox(0.42, 0.022, 0.004), worn(), 0.9, -0.012);
      blade.scale.set(1, 1, 1);
      part(g, new THREE.ConeGeometry(0.011, 0.04, 4).rotateZ(-Math.PI / 2), worn(), 1.13, -0.012);
      muzzle.position.set(0.69, 0.012, 0);
      sightY = 0.045;
    }
    grip = new THREE.Vector3(-0.12, -0.045, 0);
    fore = new THREE.Vector3(0.2, -0.03, 0);
  };

  switch (kind) {
    case "ar":
      rifle(false);
      break;
    case "sniper":
      rifle(true);
      break;
    case "smg": {
      // Bergmann MP18: perforated barrel jacket, side magazine, wooden stock.
      part(g, cyl(0.022, 0.24, 14), blued(), 0.2, 0.01); // jacket
      for (let i = 0; i < 6; i++) part(g, cyl(0.0232, 0.012, 14), worn(), 0.1 + i * 0.04, 0.01); // cooling rings
      part(g, cyl(0.008, 0.04), blued(), 0.34, 0.01); // muzzle
      part(g, cyl(0.02, 0.2, 14), blued(), -0.01, 0.01); // receiver tube
      part(g, plainBox(0.035, 0.05, 0.03), blued(), -0.02, -0.01, 0.0); // trigger housing
      const mag = part(g, cyl(0.02, 0.13, 12), blued(), 0.06, 0.01, -0.08); // side magazine (left)
      mag.rotation.y = Math.PI / 2;
      part(g, plainBox(0.05, 0.03, 0.05), blued(), 0.06, 0.01, -0.03); // mag well
      part(g, plainBox(0.07, 0.008, 0.03), blued(), -0.04, -0.035); // trigger guard
      part(g, cyl(0.006, 0.03), worn(), -0.05, 0.02, 0.025).rotation.y = Math.PI / 2; // bolt handle
      part(g, stockGeo(0.34, 0.045, 0.08, 0.05, 0.04), walnut(), -0.1, -0.015); // stock
      part(g, plainBox(0.012, 0.13, 0.042), worn(), -0.445, -0.02); // butt plate
      part(g, plainBox(0.015, 0.02, 0.012), blued(), 0.3, 0.035); // front sight
      muzzle.position.set(0.37, 0.01, 0);
      grip = new THREE.Vector3(-0.1, -0.04, 0);
      fore = new THREE.Vector3(0.14, -0.015, 0);
      sightY = 0.035;
      break;
    }
    case "shotgun": {
      // Winchester M1897 trench gun: vented heat shield, ribbed pump, bayonet lug.
      part(g, cyl(0.014, 0.52), blued(), 0.37, 0.018); // barrel
      part(g, cyl(0.022, 0.4, 14), worn(), 0.36, 0.022); // heat shield
      for (let i = 0; i < 7; i++) part(g, plainBox(0.018, 0.012, 0.046), blued(), 0.2 + i * 0.05, 0.022); // vents
      part(g, cyl(0.012, 0.42), blued(), 0.33, -0.016); // tube mag
      part(g, cyl(0.024, 0.14, 10), walnut(), 0.24, -0.016); // pump
      for (let i = 0; i < 5; i++) part(g, cyl(0.0245, 0.006, 10), walnutDark(), 0.19 + i * 0.025, -0.016);
      part(g, plainBox(0.2, 0.065, 0.048), blued(), -0.02, 0.0); // receiver
      part(g, plainBox(0.06, 0.012, 0.03), worn(), 0.0, 0.04); // exposed hammer rail
      part(g, plainBox(0.07, 0.008, 0.03), blued(), -0.06, -0.04); // trigger guard
      part(g, stockGeo(0.36, 0.055, 0.085, 0.05, 0.042), walnut(), -0.12, -0.012); // stock
      part(g, plainBox(0.012, 0.14, 0.044), blued(), -0.485, -0.01); // butt plate
      part(g, plainBox(0.04, 0.02, 0.02), blued(), 0.6, 0.0); // bayonet lug
      part(g, new THREE.SphereGeometry(0.005, 8, 6), brass(), 0.625, 0.035); // bead
      muzzle.position.set(0.64, 0.018, 0);
      grip = new THREE.Vector3(-0.12, -0.045, 0);
      fore = new THREE.Vector3(0.24, -0.035, 0);
      sightY = 0.035;
      break;
    }
    case "pistol": {
      // Webley Mk VI: top-break frame, six-round cylinder, bird's-head grip.
      part(g, cyl(0.009, 0.15), blued(), 0.1, 0.03); // barrel
      part(g, plainBox(0.15, 0.012, 0.012), blued(), 0.1, 0.042); // top rib
      const cylinder = part(g, cyl(0.024, 0.05, 6), worn(), 0.0, 0.02);
      cylinder.rotation.x = Math.PI / 6;
      part(g, plainBox(0.08, 0.05, 0.022), blued(), -0.01, 0.015); // frame
      part(g, plainBox(0.03, 0.03, 0.012), blued(), -0.05, 0.045, 0, -0.5); // hammer
      part(g, plainBox(0.05, 0.1, 0.028), walnutDark(), -0.05, -0.045, 0, 0.35); // grip
      part(g, new THREE.TorusGeometry(0.009, 0.0025, 6, 12), brass(), -0.07, -0.1, 0); // lanyard ring
      part(g, plainBox(0.035, 0.006, 0.02), blued(), -0.005, -0.02); // trigger guard
      part(g, plainBox(0.01, 0.012, 0.006), blued(), 0.17, 0.048); // front sight
      muzzle.position.set(0.18, 0.03, 0);
      grip = new THREE.Vector3(-0.05, -0.05, 0);
      fore = new THREE.Vector3(-0.04, -0.06, 0);
      sightY = 0.048;
      break;
    }
  }
  g.add(muzzle);
  return { group: g, muzzle, grip, fore, sightY };
}

/** Mills bomb (No. 5 grenade): segmented iron body, lever and ring. */
export function buildMillsBomb() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10).scale(1, 1.3, 1), blued());
  g.add(body);
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.003, 4, 16), worn());
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.024 + i * 0.016;
    ring.scale.setScalar(1 - Math.abs(i - 1.5) * 0.12);
    g.add(ring);
  }
  const lever = new THREE.Mesh(plainBox(0.01, 0.07, 0.012), worn());
  lever.position.set(0.032, 0.005, 0);
  g.add(lever);
  const pin = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.002, 4, 12), brass());
  pin.position.set(0.0, 0.05, 0.012);
  g.add(pin);
  return g;
}

/** Entrenching tool: short spade with a wooden haft. */
export function buildSpade() {
  const g = new THREE.Group();
  g.add(Object.assign(new THREE.Mesh(cyl(0.013, 0.45), walnut()), {}));
  const blade = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.004, 0.13, 2, 0.002), worn());
  blade.position.set(0.3, 0, 0);
  g.add(blade);
  const grip = new THREE.Mesh(plainBox(0.02, 0.02, 0.08), walnutDark());
  grip.position.set(-0.23, 0, 0);
  g.add(grip);
  return g;
}
