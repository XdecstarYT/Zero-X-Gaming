import * as THREE from "three";
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
  if (!g) geoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
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

export function buildGun(kind: WeaponKind, rarity: Rarity, wrapId: string): GunModel {
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
