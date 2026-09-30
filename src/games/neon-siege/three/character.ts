import * as THREE from "three";
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
}

const geo = {
  head: new THREE.SphereGeometry(0.115, 20, 16),
  eye: new THREE.SphereGeometry(0.014, 8, 6),
  neck: new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10),
  torso: new THREE.CapsuleGeometry(0.16, 0.32, 6, 14),
  vest: new THREE.BoxGeometry(0.3, 0.36, 0.38),
  pelvis: new THREE.BoxGeometry(0.22, 0.14, 0.32),
  belt: new THREE.BoxGeometry(0.24, 0.04, 0.34),
  limbUpper: new THREE.CapsuleGeometry(0.06, 0.3, 4, 10),
  limbLower: new THREE.CapsuleGeometry(0.052, 0.3, 4, 10),
  armUpper: new THREE.CapsuleGeometry(0.048, 1, 4, 10),
  armLower: new THREE.CapsuleGeometry(0.042, 1, 4, 10),
  hand: new THREE.BoxGeometry(0.07, 0.085, 0.05),
  boot: new THREE.BoxGeometry(0.26, 0.1, 0.12),
  pack: new THREE.BoxGeometry(0.14, 0.3, 0.28),
  cap: new THREE.SphereGeometry(0.122, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.BoxGeometry(0.12, 0.012, 0.2),
  helmet: new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI / 1.8),
  hood: new THREE.SphereGeometry(0.14, 20, 14, 0, Math.PI * 2, 0, Math.PI / 1.5),
  visor: new THREE.BoxGeometry(0.05, 0.05, 0.2),
  hair: new THREE.SphereGeometry(0.119, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4),
  stripe: new THREE.BoxGeometry(0.305, 0.03, 0.385),
};

const outfitMats = new Map<string, Record<string, THREE.MeshStandardMaterial>>();
function materials(o: Outfit) {
  let m = outfitMats.get(o.id);
  if (!m) {
    const std = (color: string, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    m = {
      skin: std(o.skin, 0.6),
      top: std(o.top, 0.85),
      bottom: std(o.bottom, 0.9),
      accent: std(o.accent, 0.7, 0.1),
      boots: std(o.boots, 0.6, 0.05),
      head: std(o.headColor, o.headgear === "helmet" ? 0.4 : 0.85, o.headgear === "helmet" ? 0.3 : 0),
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

class Arm {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  hand: THREE.Mesh;
  constructor(parent: THREE.Object3D, m: Record<string, THREE.MeshStandardMaterial>) {
    this.upper = mesh(geo.armUpper, m.top, parent);
    this.lower = mesh(geo.armLower, m.top, parent);
    this.hand = mesh(geo.hand, m.accent, parent);
  }
  setMaterials(m: Record<string, THREE.MeshStandardMaterial>) {
    this.upper.material = m.top;
    this.lower.material = m.top;
    this.hand.material = m.accent;
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
    this.hips.add(this.torso);
    this.torso.position.y = 0.08;
    reg(mesh(geo.torso, this.m.top, this.torso, 0, 0.24, 0), "top").scale.set(0.85, 1, 1.1);
    reg(mesh(geo.vest, this.m.accent, this.torso, 0.01, 0.27, 0), "accent");
    reg(mesh(geo.stripe, this.m.glow, this.torso, 0.01, 0.34, 0), "glow");
    reg(mesh(geo.pack, this.m.accent, this.torso, -0.2, 0.28, 0), "accent");
    reg(mesh(geo.neck, this.m.skin, this.torso, 0, 0.5, 0), "skin");
    this.torso.add(this.headG);
    this.headG.position.y = 0.64;
    reg(mesh(geo.head, this.m.skin, this.headG), "skin").scale.set(1, 1.08, 0.95);
    mesh(geo.eye, this.m.eye, this.headG, 0.1, 0.02, 0.04);
    mesh(geo.eye, this.m.eye, this.headG, 0.1, 0.02, -0.04);
    this.headG.add(this.headgear);
    this.buildHeadgear(o);

    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0, -0.04, side * 0.1);
      this.hips.add(hip);
      reg(mesh(geo.limbUpper, this.m.bottom, hip, 0, -0.2, 0), "bottom");
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      reg(mesh(geo.limbLower, this.m.bottom, knee, 0, -0.2, 0), "bottom");
      reg(mesh(geo.boot, this.m.boots, knee, 0.05, -0.44, 0), "boots");
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
        mesh(geo.hair, m.head, this.headgear, -0.01, 0.02, 0);
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
    const key = item ? (item.type === "weapon" ? `${item.kind}.${item.rarity}.${this.wrap}` : item.kind) : "";
    if (key === this.heldKey) return;
    this.heldKey = key;
    this.held.clear();
    this.gun = null;
    if (!item) return;
    if (item.type === "weapon") {
      this.gun = buildGun(item.kind, item.rarity, this.wrap);
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
    this.body.rotation.z = 0;
    this.body.position.y = 0;

    const moving = Math.min(1, p.speed / 3.4);
    this.walk += dt * (4 + 6 * moving) * (moving > 0.05 ? 1 : 0);
    const s = Math.sin(this.walk);
    const swing = 0.55 * moving;
    this.legs[0].hip.rotation.z = s * swing;
    this.legs[1].hip.rotation.z = -s * swing;
    this.legs[0].knee.rotation.z = -Math.max(0, -s) * swing * 1.3;
    this.legs[1].knee.rotation.z = -Math.max(0, s) * swing * 1.3;
    this.hips.position.y = 0.95 - Math.abs(Math.cos(this.walk)) * 0.035 * moving;
    this.torso.rotation.z = -0.08 * moving - Math.max(0, 1 - p.hurtAgo / 0.2) * 0.12;
    this.torso.rotation.y = s * 0.06 * moving;

    // Weapon hold: aimed at shoulder height, or low-ready while running.
    const recoil = Math.max(0, 1 - p.firedAgo / 0.08);
    const aim = p.aiming || p.firedAgo < 0.6 ? 1 : 0;
    const hx = 0.18 - recoil * 0.05;
    const hy = aim ? 0.36 : 0.2;
    this.held.position.set(hx, hy + recoil * 0.015, 0.1);
    this.held.rotation.z = aim ? recoil * 0.12 : -0.35;
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
