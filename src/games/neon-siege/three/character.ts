import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { outfitOf, type Outfit } from "../cosmetics";
import type { Item } from "../items";
import { buildConsumable, buildGun, type GunModel } from "./guns";

/**
 * A procedurally animated humanoid (~1.8 m) built from primitives.
 * Faces +X, right side is +Z. Arms reach for the held weapon with a simple
 * two-bone solve, legs run a walk cycle scaled by speed, and it falls on death.
 */

export interface PoseState {
  /** Ground speed (m/s). */
  speed: number;
  aiming: boolean;
  /** Seconds since last shot / hurt / death. */
  firedAgo: number;
  hurtAgo: number;
  alive: boolean;
  deadAgo: number;
  /** Using a consumable. */
  using: boolean;
  /** 0 standing, 1 crouched, 2 prone. */
  stance?: 0 | 1 | 2;
}

const geo = {
  head: new THREE.SphereGeometry(0.115, 20, 16),
  eye: new THREE.SphereGeometry(0.014, 8, 6),
  neck: new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10),
  torso: new THREE.CapsuleGeometry(0.16, 0.32, 6, 14),
  vest: new RoundedBoxGeometry(0.3, 0.36, 0.38, 3, 0.05),
  pelvis: new RoundedBoxGeometry(0.22, 0.14, 0.32, 3, 0.05),
  belt: new RoundedBoxGeometry(0.24, 0.04, 0.34, 3, 0.015),
  limbUpper: new THREE.CapsuleGeometry(0.06, 0.3, 4, 10),
  limbLower: new THREE.CapsuleGeometry(0.052, 0.3, 4, 10),
  armUpper: new THREE.CapsuleGeometry(0.048, 1, 4, 10),
  armLower: new THREE.CapsuleGeometry(0.042, 1, 4, 10),
  hand: new RoundedBoxGeometry(0.07, 0.085, 0.05, 3, 0.02),
  boot: new RoundedBoxGeometry(0.26, 0.1, 0.12, 3, 0.035),
  pack: new RoundedBoxGeometry(0.14, 0.3, 0.28, 3, 0.05),
  cap: new THREE.SphereGeometry(0.122, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.BoxGeometry(0.12, 0.012, 0.2),
  helmet: new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI / 1.8),
  hood: new THREE.SphereGeometry(0.14, 20, 14, 0, Math.PI * 2, 0, Math.PI / 1.5),
  visor: new THREE.BoxGeometry(0.05, 0.05, 0.2),
  hair: new THREE.SphereGeometry(0.119, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4),
  stripe: new THREE.BoxGeometry(0.305, 0.03, 0.385),
  // Detail (v2): face, shoulders, tapered limbs, hands, gear.
  jaw: new THREE.SphereGeometry(0.085, 16, 12),
  nose: new THREE.ConeGeometry(0.018, 0.05, 8).rotateZ(-Math.PI / 2),
  ear: new THREE.SphereGeometry(0.028, 10, 8),
  brow: new THREE.BoxGeometry(0.012, 0.012, 0.045),
  shoulder: new THREE.SphereGeometry(0.075, 14, 10),
  chest: new THREE.SphereGeometry(0.2, 20, 14),
  thigh: new THREE.CylinderGeometry(0.085, 0.066, 0.42, 14),
  calf: new THREE.CylinderGeometry(0.064, 0.046, 0.42, 14),
  kneeJ: new THREE.SphereGeometry(0.066, 12, 10),
  kneePad: new RoundedBoxGeometry(0.05, 0.1, 0.1, 3, 0.02),
  pocket: new RoundedBoxGeometry(0.04, 0.11, 0.1, 3, 0.015),
  pouch: new RoundedBoxGeometry(0.06, 0.08, 0.075, 3, 0.02),
  holster: new RoundedBoxGeometry(0.1, 0.16, 0.05, 3, 0.02),
  sole: new RoundedBoxGeometry(0.28, 0.035, 0.125, 3, 0.012),
  toe: new THREE.SphereGeometry(0.062, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  collar: new THREE.TorusGeometry(0.075, 0.02, 8, 18).rotateX(Math.PI / 2),
};

let fabric: THREE.Texture | null = null;
/** Fine woven-cloth normal map shared by all clothing. */
function fabricNormal() {
  if (fabric) return fabric;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // Twill weave: diagonal ridges.
      const ridge = Math.sin(((x + y) / size) * Math.PI * 16);
      const cross = Math.sin((x / size) * Math.PI * 32) * 0.3;
      const i = (y * size + x) * 4;
      img.data[i] = 128 + ridge * 40 + cross * 30;
      img.data[i + 1] = 128 + ridge * 40;
      img.data[i + 2] = 235;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  fabric = new THREE.CanvasTexture(c);
  fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
  fabric.repeat.set(6, 6);
  return fabric;
}

const outfitMats = new Map<string, Record<string, THREE.MeshStandardMaterial>>();
function materials(o: Outfit) {
  let m = outfitMats.get(o.id);
  if (!m) {
    const std = (color: string, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const cloth = (color: string, rough: number) =>
      new THREE.MeshStandardMaterial({ color, roughness: rough, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.6, 0.6) });
    m = {
      skin: std(o.skin, 0.55),
      top: cloth(o.top, 0.88),
      bottom: cloth(o.bottom, 0.92),
      accent: cloth(o.accent, 0.75),
      boots: std(o.boots, 0.6, 0.05),
      head: std(o.headColor, o.headgear === "helmet" || o.headgear === "visor" ? 0.45 : 0.85, o.headgear === "helmet" ? 0.2 : 0),
      hair: std(o.headgear === "none" ? o.headColor : "#2a1e16", 0.9),
      eye: std("#1a1a1a", 0.3),
      glow: new THREE.MeshStandardMaterial({
        color: o.glow ?? o.accent,
        emissive: o.glow ?? "#000000",
        emissiveIntensity: o.glow ? 1.4 : 0,
        roughness: 0.3,
      }),
    };
    outfitMats.set(o.id, m);
  }
  return m;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = false;
  parent.add(me);
  return me;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

const THUMB = new THREE.BoxGeometry(0.025, 0.05, 0.022);

class Arm {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  hand: THREE.Mesh;
  constructor(parent: THREE.Object3D, m: Record<string, THREE.MeshStandardMaterial>) {
    this.upper = mesh(geo.armUpper, m.top, parent);
    this.lower = mesh(geo.armLower, m.top, parent);
    this.hand = mesh(geo.hand, m.accent, parent);
    mesh(THUMB, m.accent, this.hand, 0.015, 0.01, 0.035);
  }
  setMaterials(m: Record<string, THREE.MeshStandardMaterial>) {
    this.upper.material = m.top;
    this.lower.material = m.top;
    this.hand.material = m.accent;
    (this.hand.children[0] as THREE.Mesh).material = m.accent;
  }
  /** Two-bone reach from shoulder S to hand H; the elbow bends toward `bend`. */
  reach(S: THREE.Vector3, H: THREE.Vector3, bend: THREE.Vector3) {
    const L1 = 0.3;
    const L2 = 0.29;
    const d = Math.min(S.distanceTo(H), L1 + L2 - 0.001);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    tmpDir.subVectors(H, S).normalize();
    const E = tmpA.copy(S).addScaledVector(tmpDir, a);
    const side = tmpB.copy(bend).addScaledVector(tmpDir, -bend.dot(tmpDir)).normalize();
    E.addScaledVector(side, h);
    place(this.upper, S, E);
    place(this.lower, E, H);
    this.hand.position.copy(H);
  }
}

function place(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const len = a.distanceTo(b);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  tmpDir.subVectors(b, a).normalize();
  m.quaternion.setFromUnitVectors(UP, tmpDir);
  // Capsule geometry is length 1 (+ caps); squash to the segment length.
  m.scale.set(1, Math.max(0.2, len - 0.06), 1);
}

export class Character {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private headG = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private arms: [Arm, Arm];
  private held = new THREE.Group();
  private gun: GunModel | null = null;
  private heldKey = "";
  private walk = 0;
  private outfitId = "";
  private m: Record<string, THREE.MeshStandardMaterial>;
  private parts: { mesh: THREE.Mesh; slot: string }[] = [];
  private headgear = new THREE.Group();

  constructor(outfit: string, private wrap = "factory") {
    const o = outfitOf(outfit);
    this.m = materials(o);
    this.outfitId = o.id;
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.95;
    const reg = (me: THREE.Mesh, slot: string) => (this.parts.push({ mesh: me, slot }), me);

    reg(mesh(geo.pelvis, this.m.bottom, this.hips, 0, 0, 0), "bottom");
    reg(mesh(geo.belt, this.m.accent, this.hips, 0, 0.06, 0), "accent");
    reg(mesh(geo.holster, this.m.accent, this.hips, 0, -0.04, 0.19), "accent");
    this.hips.add(this.torso);
    this.torso.position.y = 0.08;
    // Torso: waist capsule + a broader chest, shoulders rounded by deltoids.
    reg(mesh(geo.torso, this.m.top, this.torso, 0, 0.22, 0), "top").scale.set(0.78, 1, 1.02);
    reg(mesh(geo.chest, this.m.top, this.torso, 0.005, 0.36, 0), "top").scale.set(0.62, 0.62, 1.02);
    reg(mesh(geo.shoulder, this.m.top, this.torso, 0, 0.43, 0.19), "top");
    reg(mesh(geo.shoulder, this.m.top, this.torso, 0, 0.43, -0.19), "top");
    reg(mesh(geo.collar, this.m.top, this.torso, 0, 0.5, 0), "top");
    // Chest rig: plate carrier with three mag pouches.
    reg(mesh(geo.vest, this.m.accent, this.torso, 0.012, 0.3, 0), "accent").scale.set(0.9, 0.85, 0.92);
    for (const z of [-0.08, 0, 0.08]) reg(mesh(geo.pouch, this.m.accent, this.torso, 0.15, 0.2, z), "accent");
    reg(mesh(geo.stripe, this.m.glow, this.torso, 0.012, 0.37, 0), "glow").scale.set(0.9, 1, 0.92);
    reg(mesh(geo.pack, this.m.accent, this.torso, -0.19, 0.3, 0), "accent").scale.set(0.9, 0.9, 0.9);
    reg(mesh(geo.neck, this.m.skin, this.torso, 0, 0.53, 0), "skin");
    this.torso.add(this.headG);
    this.headG.position.y = 0.67;
    // Head: cranium + jaw, nose, ears, eyes, brows.
    reg(mesh(geo.head, this.m.skin, this.headG), "skin").scale.set(1.02, 1.08, 0.9);
    reg(mesh(geo.jaw, this.m.skin, this.headG, 0.03, -0.055, 0), "skin").scale.set(1, 0.85, 1.05);
    reg(mesh(geo.nose, this.m.skin, this.headG, 0.12, -0.005, 0), "skin");
    reg(mesh(geo.ear, this.m.skin, this.headG, -0.005, 0, 0.105), "skin").scale.set(0.7, 1.2, 0.45);
    reg(mesh(geo.ear, this.m.skin, this.headG, -0.005, 0, -0.105), "skin").scale.set(0.7, 1.2, 0.45);
    mesh(geo.eye, this.m.eye, this.headG, 0.1, 0.025, 0.04);
    mesh(geo.eye, this.m.eye, this.headG, 0.1, 0.025, -0.04);
    reg(mesh(geo.brow, this.m.hair, this.headG, 0.104, 0.052, 0.04), "hair");
    reg(mesh(geo.brow, this.m.hair, this.headG, 0.104, 0.052, -0.04), "hair");
    this.headG.add(this.headgear);
    this.buildHeadgear(o);

    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0, -0.04, side * 0.1);
      this.hips.add(hip);
      reg(mesh(geo.thigh, this.m.bottom, hip, 0, -0.21, 0), "bottom");
      reg(mesh(geo.pocket, this.m.bottom, hip, 0, -0.22, side * 0.085), "bottom");
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      reg(mesh(geo.kneeJ, this.m.bottom, knee, 0, 0, 0), "bottom");
      reg(mesh(geo.kneePad, this.m.accent, knee, 0.055, -0.01, 0), "accent");
      reg(mesh(geo.calf, this.m.bottom, knee, 0, -0.21, 0), "bottom");
      reg(mesh(geo.boot, this.m.boots, knee, 0.04, -0.44, 0), "boots").scale.set(1, 1, 0.92);
      reg(mesh(geo.toe, this.m.boots, knee, 0.15, -0.475, 0), "boots").scale.set(1, 0.9, 0.95);
      reg(mesh(geo.sole, this.m.eye, knee, 0.045, -0.495, 0), "eye");
      this.legs.push({ hip, knee });
    }
    this.arms = [new Arm(this.torso, this.m), new Arm(this.torso, this.m)];
    this.torso.add(this.held);
  }

  private buildHeadgear(o: Outfit) {
    this.headgear.clear();
    const m = this.m;
    switch (o.headgear) {
      case "none":
        mesh(geo.hair, m.hair, this.headgear, -0.01, 0.02, 0);
        break;
      case "cap":
        mesh(geo.cap, m.head, this.headgear, 0, 0.02, 0);
        mesh(geo.brim, m.head, this.headgear, 0.12, 0.03, 0);
        break;
      case "beanie":
        mesh(geo.cap, m.head, this.headgear, 0, 0.03, 0).scale.set(1, 1.25, 1);
        break;
      case "helmet":
        mesh(geo.helmet, m.head, this.headgear, 0, 0.01, 0);
        break;
      case "hood":
        mesh(geo.hood, m.head, this.headgear, -0.02, 0, 0);
        break;
      case "visor":
        mesh(geo.helmet, m.head, this.headgear, 0, 0.01, 0);
        mesh(geo.visor, m.glow, this.headgear, 0.11, 0.01, 0);
        break;
    }
    this.headgear.traverse((c) => (c.castShadow = true));
  }

  setOutfit(id: string) {
    const o = outfitOf(id);
    if (o.id === this.outfitId) return;
    this.outfitId = o.id;
    this.m = materials(o);
    for (const p of this.parts) p.mesh.material = this.m[p.slot];
    this.arms.forEach((a) => a.setMaterials(this.m));
    this.buildHeadgear(o);
  }

  setWrap(wrap: string) {
    if (wrap === this.wrap) return;
    this.wrap = wrap;
    this.heldKey = "";
  }

  setItem(item: Item | null) {
    const key = item ? (item.type === "weapon" ? `${item.kind}.${item.rarity}.${this.wrap}.${item.era ?? ""}` : item.kind) : "";
    if (key === this.heldKey) return;
    this.heldKey = key;
    this.held.clear();
    this.gun = null;
    if (!item) return;
    if (item.type === "weapon") {
      this.gun = buildGun(item.kind, item.rarity, this.wrap, item.era);
      this.held.add(this.gun.group);
    } else {
      const c = buildConsumable(item.kind);
      c.position.set(0.03, 0.02, 0);
      this.held.add(c);
    }
  }

  /** Muzzle position in world space (for flashes / tracers). */
  muzzleWorld(out: THREE.Vector3) {
    if (!this.gun) return out.set(0, 1.4, 0).applyMatrix4(this.root.matrixWorld);
    return this.gun.muzzle.getWorldPosition(out);
  }

  update(p: PoseState, dt: number) {
    // Death: fall backwards, then sink.
    if (!p.alive) {
      const k = Math.min(1, p.deadAgo / 0.55);
      const ease = 1 - (1 - k) * (1 - k);
      this.body.rotation.z = (Math.PI / 2) * ease;
      this.body.position.y = -Math.max(0, p.deadAgo - 1) * 0.3;
      this.legs.forEach((l) => (l.hip.rotation.z = 0));
      return;
    }
    const stance = p.stance ?? 0;
    const prone = stance === 2;
    // Prone: the whole body lies face down along the facing direction, propped on the elbows.
    this.body.rotation.z = prone ? -Math.PI / 2 : 0;
    this.body.position.set(prone ? -0.9 : 0, prone ? 0.16 : 0, 0);

    const moving = Math.min(1, p.speed / 3.4);
    this.walk += dt * (4 + 6 * moving) * (moving > 0.05 ? 1 : 0) * (stance ? 0.6 : 1);
    const s = Math.sin(this.walk);
    const swing = (stance === 1 ? 0.25 : prone ? 0.15 : 0.55) * moving;
    const crouch = stance === 1 ? 1 : 0;
    this.legs[0].hip.rotation.z = s * swing + crouch * 1.35;
    this.legs[1].hip.rotation.z = -s * swing + crouch * 0.6;
    this.legs[0].knee.rotation.z = -Math.max(0, -s) * swing * 1.3 - crouch * 2.1;
    this.legs[1].knee.rotation.z = -Math.max(0, s) * swing * 1.3 - crouch * 1.9;
    this.hips.position.y = (crouch ? 0.52 : 0.95) - Math.abs(Math.cos(this.walk)) * 0.035 * moving;
    this.torso.rotation.z = prone ? 0.32 : -0.08 * moving - crouch * 0.18 - Math.max(0, 1 - p.hurtAgo / 0.2) * 0.12;
    this.torso.rotation.y = s * 0.06 * moving;

    // Weapon hold: aimed at shoulder height, or low-ready while running.
    const recoil = Math.max(0, 1 - p.firedAgo / 0.08);
    const aim = p.aiming || p.firedAgo < 0.6 || prone ? 1 : 0;
    const hx = (prone ? 0.02 : 0.18) - recoil * 0.05;
    const hy = prone ? 0.58 : aim ? 0.36 : 0.2;
    this.held.position.set(hx, hy + recoil * 0.015, 0.1);
    // Prone: point the gun along the spine (level with the ground).
    this.held.rotation.z = prone ? Math.PI / 2 - 0.32 + recoil * 0.08 : aim ? recoil * 0.12 : -0.35;
    this.held.rotation.y = aim ? 0 : 0.25;

    const shoulderR = tmpA.set(0.02, 0.44, 0.19);
    const shoulderL = new THREE.Vector3(0.02, 0.44, -0.19);
    this.held.updateMatrix();
    if (this.gun) {
      const grip = this.gun.grip.clone().applyMatrix4(this.held.matrix);
      const fore = this.gun.fore.clone().applyMatrix4(this.held.matrix);
      this.arms[0].reach(shoulderR.clone(), grip, new THREE.Vector3(-0.3, -1, 0.6));
      this.arms[1].reach(shoulderL, fore, new THREE.Vector3(-0.2, -1, -0.8));
    } else {
      const hand = new THREE.Vector3(0.3, p.using ? 0.4 : 0.12, 0.14);
      this.held.position.copy(hand);
      this.held.rotation.set(0, 0, 0);
      this.arms[0].reach(shoulderR.clone(), hand, new THREE.Vector3(-0.3, -1, 0.6));
      const idle = new THREE.Vector3(-0.02 - s * 0.12 * moving, 0.0, -0.24);
      this.arms[1].reach(shoulderL, idle, new THREE.Vector3(0.4, -0.2, -1));
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}
