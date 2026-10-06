import * as THREE from "three";
import { hash } from "../core/rng";
import { merge, paint } from "./terrainView";

/** What politics puts in the streets right now (rebuilt when it changes, animated every frame). */
export interface PoliticsScene {
  crowds: { x: number; z: number; n: number; colors: string[]; placards: string[]; radius: number }[];
  floods: { x: number; z: number; r: number }[];
  fireworks: { x: number; z: number; colors: string[]; rate: number }[];
  billboards: { x: number; z: number; color: string; ang: number }[];
  bunting: { x: number; z: number; r: number }[];
}

export const EMPTY_SCENE: PoliticsScene = { crowds: [], floods: [], fireworks: [], billboards: [], bunting: [] };

const MAX_PEOPLE = 600;
const MAX_SPARKS = 1400;

function person() {
  return merge([
    paint(new THREE.BoxGeometry(0.34, 0.85, 0.22).translate(0, 0.43, 0), "#2c3440"),
    paint(new THREE.BoxGeometry(0.44, 0.62, 0.26).translate(0, 1.16, 0), "#ffffff"),
    paint(new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.6, 0), "#d9a77f"),
  ]);
}

function placard() {
  return merge([paint(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4).translate(0.3, 1.75, 0), "#7a5a3a"), paint(new THREE.BoxGeometry(0.06, 0.55, 0.8).translate(0.3, 2.45, 0), "#ffffff")]);
}

function billboard() {
  return merge([
    paint(new THREE.BoxGeometry(0.25, 6, 0.25).translate(-3.2, 3, 0), "#4a4f55"),
    paint(new THREE.BoxGeometry(0.25, 6, 0.25).translate(3.2, 3, 0), "#4a4f55"),
    paint(new THREE.BoxGeometry(8, 3.6, 0.2).translate(0, 6.6, 0), "#ffffff"),
    paint(new THREE.BoxGeometry(8.2, 0.5, 0.24).translate(0, 5.0, 0), "#f4f4f0"),
    paint(new THREE.BoxGeometry(2.4, 2.4, 0.24).translate(-2.4, 6.8, 0), "#f4f4f0"),
  ]);
}

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  color: THREE.Color;
}

/** Protests, strikes, floods, festivals, campaign billboards and election-night fireworks in the 3D city. */
export class PoliticsView {
  readonly group = new THREE.Group();
  private people: THREE.InstancedMesh;
  private signs: THREE.InstancedMesh;
  private boards: THREE.InstancedMesh;
  private sparks: THREE.InstancedMesh;
  private flagMesh: THREE.InstancedMesh;
  private water: THREE.Mesh[] = [];
  private key = "";
  private scene: PoliticsScene = EMPTY_SCENE;
  private bodies: { x: number; z: number; y: number; ang: number; phase: number; sign: boolean }[] = [];
  private list: Spark[] = [];
  private nextBurst: number[] = [];
  private mtx = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private Y = new THREE.Vector3(0, 1, 0);

  constructor(private groundAt: (x: number, z: number) => number) {
    const std = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.people = new THREE.InstancedMesh(person(), std, MAX_PEOPLE);
    this.signs = new THREE.InstancedMesh(placard(), std, MAX_PEOPLE);
    this.boards = new THREE.InstancedMesh(billboard(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: new THREE.Color("#222222") }), 64);
    this.sparks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAX_SPARKS);
    this.flagMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 3).rotateZ(Math.PI).rotateY(Math.PI / 6), std, 800);
    for (const m of [this.people, this.signs, this.boards, this.sparks, this.flagMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color());
      this.group.add(m);
    }
    this.people.castShadow = this.signs.castShadow = this.boards.castShadow = true;
  }

  /** Set what should be in the streets (cheap to call every frame; rebuilds only on change). */
  set(scene: PoliticsScene) {
    const key = JSON.stringify(scene);
    if (key === this.key) return;
    this.key = key;
    this.scene = scene;
    this.rebuild();
  }

  private rebuild() {
    const sc = this.scene;
    const col = new THREE.Color();
    // Crowds: people packed round a spot, some holding placards.
    this.bodies = [];
    let n = 0;
    let ns = 0;
    for (const [ci, c] of sc.crowds.entries()) {
      for (let k = 0; k < c.n && n < MAX_PEOPLE; k++) {
        const a = hash(ci * 977 + k, 3) * Math.PI * 2;
        const r = Math.sqrt(hash(k, ci * 13 + 7)) * c.radius;
        const x = c.x + Math.cos(a) * r;
        const z = c.z + Math.sin(a) * r;
        const sign = c.placards.length > 0 && hash(k, ci + 91) < 0.45;
        // Everyone faces the middle.
        this.bodies.push({ x, z, y: this.groundAt(x, z) + 0.05, ang: Math.atan2(c.z - z, c.x - x), phase: hash(k, ci) * 10, sign });
        this.people.setColorAt(n, col.set(c.colors[k % c.colors.length]));
        if (sign) this.signs.setColorAt(ns++, col.set(c.placards[k % c.placards.length]));
        n++;
      }
    }
    // Billboards on posts, facing the road.
    let b = 0;
    for (const bb of sc.billboards.slice(0, 64)) {
      this.q.setFromAxisAngle(this.Y, bb.ang);
      this.mtx.compose(new THREE.Vector3(bb.x, this.groundAt(bb.x, bb.z), bb.z), this.q, new THREE.Vector3(1, 1, 1));
      this.boards.setMatrixAt(b, this.mtx);
      this.boards.setColorAt(b, col.set(bb.color));
      b++;
    }
    this.boards.count = b;
    this.boards.instanceMatrix.needsUpdate = true;
    if (this.boards.instanceColor) this.boards.instanceColor.needsUpdate = true;
    // Bunting: rings of little pennants on strings, in festival colours.
    const fc = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#ec4899", "#ffffff"];
    let f = 0;
    for (const bt of sc.bunting)
      for (let ring = 0; ring < 3; ring++)
        for (let k = 0; k < 90 && f < 800; k++) {
          const a = (k / 90) * Math.PI * 2;
          const r = bt.r * (0.45 + ring * 0.28);
          const x = bt.x + Math.cos(a) * r;
          const z = bt.z + Math.sin(a) * r;
          const sag = Math.abs(Math.sin(a * 9)) * 1.2;
          this.q.setFromAxisAngle(this.Y, -a);
          this.mtx.compose(new THREE.Vector3(x, this.groundAt(x, z) + 6.5 - sag, z), this.q, new THREE.Vector3(1, 1, 1));
          this.flagMesh.setMatrixAt(f, this.mtx);
          this.flagMesh.setColorAt(f, col.set(fc[(k + ring) % fc.length]));
          f++;
        }
    this.flagMesh.count = f;
    this.flagMesh.instanceMatrix.needsUpdate = true;
    if (this.flagMesh.instanceColor) this.flagMesh.instanceColor.needsUpdate = true;
    // Flood water: a translucent sheet over the district, following the ground.
    for (const w of this.water) {
      this.group.remove(w);
      w.geometry.dispose();
      (w.material as THREE.Material).dispose();
    }
    this.water = [];
    for (const fl of sc.floods) {
      const g = new THREE.CircleGeometry(fl.r, 48).rotateX(-Math.PI / 2);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, this.groundAt(fl.x + pos.getX(i), fl.z + pos.getZ(i)) + 0.7);
      g.computeVertexNormals();
      // Muddy floodwater: dark and murky, with only a soft sheen of the sky on it.
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#4b5a4c", roughness: 0.22, metalness: 0, envMapIntensity: 0.5, transparent: true, opacity: 0.86, depthWrite: false }));
      m.position.set(fl.x, 0, fl.z);
      m.renderOrder = 3;
      this.water.push(m);
      this.group.add(m);
    }
    this.nextBurst = sc.fireworks.map(() => 0);
    this.list = [];
  }

  /** Animate: crowds bob and wave placards, fireworks burst and fall. */
  update(now: number, dt: number, night: number) {
    const t = now / 1000;
    let n = 0;
    let ns = 0;
    for (const p of this.bodies) {
      const hop = Math.max(0, Math.sin(t * 3.2 + p.phase)) * 0.18;
      this.q.setFromAxisAngle(this.Y, -p.ang + Math.PI / 2);
      this.mtx.compose(new THREE.Vector3(p.x, p.y + hop, p.z), this.q, new THREE.Vector3(1, 1, 1));
      this.people.setMatrixAt(n++, this.mtx);
      if (p.sign) {
        const wave = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(t * 2.4 + p.phase) * 0.12);
        this.mtx.compose(new THREE.Vector3(p.x, p.y + hop, p.z), this.q.clone().multiply(wave), new THREE.Vector3(1, 1, 1));
        this.signs.setMatrixAt(ns++, this.mtx);
      }
    }
    this.people.count = n;
    this.signs.count = ns;
    this.people.instanceMatrix.needsUpdate = true;
    this.signs.instanceMatrix.needsUpdate = true;
    if (this.people.instanceColor) this.people.instanceColor.needsUpdate = true;
    if (this.signs.instanceColor) this.signs.instanceColor.needsUpdate = true;
    for (const w of this.water) (w.material as THREE.MeshStandardMaterial).opacity = 0.84 + Math.sin(t * 0.8) * 0.04;
    // Fireworks: bursts from launch points (most at night; a few by day).
    this.scene.fireworks.forEach((fw, i) => {
      if (t < this.nextBurst[i]) return;
      this.nextBurst[i] = t + (night > 0.4 ? 0.5 : 2.5) / Math.max(0.2, fw.rate) * (0.6 + hash(Math.floor(t * 10), i) * 0.8);
      const cx = fw.x + (hash(t, i) - 0.5) * 60;
      const cz = fw.z + (hash(i, t) - 0.5) * 60;
      const cy = this.groundAt(fw.x, fw.z) + 70 + hash(t * 3, i) * 50;
      const color = new THREE.Color(fw.colors[Math.floor(hash(t * 7, i) * fw.colors.length) % fw.colors.length]);
      const count = 70;
      for (let k = 0; k < count && this.list.length < MAX_SPARKS; k++) {
        const u = hash(k, t) * 2 - 1;
        const a = hash(t, k) * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const sp = 16 + hash(k * 3, t) * 6;
        this.list.push({ x: cx, y: cy, z: cz, vx: Math.cos(a) * s * sp, vy: u * sp, vz: Math.sin(a) * s * sp, life: 1.6 + hash(k, i) * 0.6, color });
      }
    });
    let m = 0;
    const col = new THREE.Color();
    this.list = this.list.filter((p) => (p.life -= dt) > 0);
    for (const p of this.list) {
      p.vy -= 9 * dt;
      p.vx *= 1 - dt * 1.2;
      p.vz *= 1 - dt * 1.2;
      p.vy *= 1 - dt * 0.8;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = Math.min(1, p.life);
      this.mtx.compose(new THREE.Vector3(p.x, p.y, p.z), this.q.identity(), new THREE.Vector3(k, k, k));
      this.sparks.setMatrixAt(m, this.mtx);
      this.sparks.setColorAt(m, col.copy(p.color).multiplyScalar(1.5 + 2.5 * k));
      m++;
    }
    this.sparks.count = m;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  }

  /** Is a crowd under the ray? */
  pick(ray: THREE.Raycaster) {
    if (!this.people.count) return false;
    return ray.intersectObjects([this.people, this.signs], false).length > 0;
  }

  dispose() {
    for (const m of [this.people, this.signs, this.boards, this.sparks, this.flagMesh]) {
      m.geometry.dispose();
      m.dispose();
    }
    for (const w of this.water) w.geometry.dispose();
  }
}
