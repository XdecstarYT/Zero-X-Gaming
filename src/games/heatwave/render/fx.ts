import * as THREE from "three";
import { TOKENS } from "../missions";
import type { State } from "../state";
import { WATER_Y } from "../world";

/**
 * Effects: tracer streaks and muzzle flashes, explosions (a fireball, a flash of light, a column
 * of smoke), rain round the camera in a storm, the yellow mission marker and route beacon,
 * spinning pickups and the hidden sun tokens.
 */

export class Fx {
  readonly root = new THREE.Group();
  private tracer: THREE.LineSegments;
  private flashes: THREE.Sprite[] = [];
  private booms: { s: THREE.Sprite; smoke: THREE.Sprite[]; light: THREE.PointLight; key: string }[] = [];
  private rain: THREE.LineSegments;
  private marker: THREE.Group;
  private beacon: THREE.Mesh;
  private pickups = new Map<number, THREE.Object3D>();
  private tokens: THREE.Mesh[] = [];
  private grenades: THREE.Mesh[] = [];
  private t = 0;

  constructor(
    private scene: THREE.Scene,
    private glow: THREE.Texture,
    private puffTex: THREE.Texture,
    quality: "low" | "medium" | "high",
  ) {
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(400 * 6), 3));
    this.tracer = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: "#ffe2a0", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracer.frustumCulled = false;
    this.root.add(this.tracer);
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#ffcf7a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.visible = false;
      this.root.add(sp);
      this.flashes.push(sp);
    }
    // Rain: streaks in a box that follows the camera.
    const N = quality === "low" ? 700 : 1800;
    const rp = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 60;
      const y = Math.random() * 30;
      const z = (Math.random() - 0.5) * 60;
      rp.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: "#c8d6e8", transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.root.add(this.rain);
    // The objective marker: a glowing cylinder and a floating arrow.
    this.marker = new THREE.Group();
    const cylM = new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.2, 32, 1, true), cylM);
    c.position.y = 1.1;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.y = 0.08;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: "#ffd23f", emissive: "#ffb000", emissiveIntensity: 0.8 }));
    arrow.position.y = 3.4;
    this.marker.add(c, ring, arrow);
    this.marker.visible = false;
    this.root.add(this.marker);
    // A tall beacon over a far objective.
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beacon.position.y = 60;
    this.beacon.visible = false;
    this.root.add(this.beacon);
    const tokenGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20).rotateX(Math.PI / 2);
    const tokenMat = new THREE.MeshStandardMaterial({ color: "#ffcc33", emissive: "#ff9900", emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 });
    for (const t of TOKENS) {
      const m = new THREE.Mesh(tokenGeo, tokenMat);
      m.position.set(t.x, 1.2, t.z);
      m.visible = false;
      this.root.add(m);
      this.tokens.push(m);
    }
    scene.add(this.root);
  }

  update(s: State, cam: THREE.Camera, dt: number, markers: { x: number; z: number; r: number }[]) {
    this.t += dt;
    // Tracers.
    const pos = this.tracer.geometry.attributes.position as THREE.BufferAttribute;
    let n = 0;
    for (const t of s.tracers) {
      if (n >= 400) break;
      const k = Math.min(1, t.t / 0.08);
      const ax = t.ax + (t.bx - t.ax) * k * 0.6;
      const ay = t.ay + (t.by - t.ay) * k * 0.6;
      const az = t.az + (t.bz - t.az) * k * 0.6;
      pos.setXYZ(n * 2, ax, ay, az);
      pos.setXYZ(n * 2 + 1, t.bx, t.by, t.bz);
      n++;
    }
    this.tracer.geometry.setDrawRange(0, n * 2);
    pos.needsUpdate = true;
    // Muzzle flashes at whoever just fired.
    let f = 0;
    for (const p of s.peds) {
      if (p.fireT <= 0.03 || f >= this.flashes.length) continue;
      if (p.weapon === "fists" || p.weapon === "bat" || p.weapon === "grenade") continue;
      const sp = this.flashes[f++];
      sp.visible = true;
      const y = p.car >= 0 ? 1.3 : p.y + 1.4;
      sp.position.set(p.x + Math.cos(p.aimH) * 0.75, y, p.z + Math.sin(p.aimH) * 0.75);
      sp.scale.setScalar(0.7 + Math.random() * 0.5);
    }
    for (; f < this.flashes.length; f++) this.flashes[f].visible = false;
    // Explosions.
    for (const b of s.booms) {
      const key = `${b.x.toFixed(1)}:${b.z.toFixed(1)}`;
      let v = this.booms.find((x) => x.key === key);
      if (!v) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: "#ffb347", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        const smoke = Array.from({ length: 6 }, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, color: "#2a2a2a", transparent: true, depthWrite: false })));
        const light = new THREE.PointLight("#ffa040", 0, 40, 2);
        v = { s: sp, smoke, light, key };
        this.root.add(sp, light, ...smoke);
        this.booms.push(v);
      }
      const k = b.t;
      v.s.position.set(b.x, b.y + 1 + k * 2, b.z);
      v.s.scale.setScalar(b.r * (0.6 + Math.min(1, k * 4) * 1.4));
      v.s.material.opacity = Math.max(0, 1 - k * 1.6);
      v.light.position.set(b.x, b.y + 2, b.z);
      v.light.intensity = Math.max(0, 1 - k * 2) * 600;
      v.smoke.forEach((sm, i) => {
        const a = (i / 6) * Math.PI * 2;
        sm.position.set(b.x + Math.cos(a) * k * 2, b.y + 1 + k * (3 + i * 0.6), b.z + Math.sin(a) * k * 2);
        sm.scale.setScalar(b.r * (0.5 + k * 0.8));
        sm.material.opacity = Math.max(0, 0.7 - k * 0.3) * Math.min(1, k * 5);
      });
    }
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const v = this.booms[i];
      if (s.booms.some((b) => `${b.x.toFixed(1)}:${b.z.toFixed(1)}` === v.key)) continue;
      this.root.remove(v.s, v.light, ...v.smoke);
      v.s.material.dispose();
      for (const sm of v.smoke) sm.material.dispose();
      this.booms.splice(i, 1);
    }
    // Grenades in flight.
    while (this.grenades.length < s.grenades.length) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: "#3d4530" }));
      this.root.add(m);
      this.grenades.push(m);
    }
    this.grenades.forEach((m, i) => {
      const g = s.grenades[i];
      m.visible = !!g;
      if (g) m.position.set(g.x, g.y, g.z);
    });
    // Rain.
    const rain = s.weather.rain;
    this.rain.visible = rain > 0.05;
    if (this.rain.visible) {
      this.rain.position.set(cam.position.x, cam.position.y - 12 - ((this.t * 24) % 1) * 0.7, cam.position.z);
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.35 * rain;
      this.rain.position.y -= (this.t * 22) % 30;
      if (this.rain.position.y < cam.position.y - 30) this.rain.position.y += 30;
    }
    // Objective markers: the nearest goal gets the cylinder, a far one a beacon.
    this.marker.visible = false;
    this.beacon.visible = false;
    if (markers.length) {
      const m = markers[0];
      const d = Math.hypot(m.x - cam.position.x, m.z - cam.position.z);
      const r = Math.max(1.2, m.r || 1.2);
      this.marker.visible = d < 200;
      this.marker.position.set(m.x, 0, m.z);
      this.marker.scale.set(Math.min(r, 6), 1, Math.min(r, 6));
      this.marker.children[2].position.y = 3.4 + Math.sin(this.t * 3) * 0.25;
      this.marker.children[2].rotation.y += dt * 2;
      this.beacon.visible = d > 60;
      this.beacon.position.set(m.x, 60, m.z);
    }
    // Pickups.
    const live = new Set<number>();
    for (const k of s.pickups) {
      if (k.takenAt >= 0 && (k.respawn <= 0 || s.t - k.takenAt < k.respawn)) continue;
      if (Math.hypot(k.x - cam.position.x, k.z - cam.position.z) > 120) continue;
      live.add(k.id);
      let o = this.pickups.get(k.id);
      if (!o) {
        o = pickupModel(k.kind);
        this.pickups.set(k.id, o);
        this.root.add(o);
      }
      const water = k.kind === "package";
      o.position.set(k.x, (water ? WATER_Y + 0.2 : 0.5) + Math.sin(this.t * 2.4 + k.id) * 0.12, k.z);
      o.rotation.y += dt * 1.8;
    }
    for (const [id, o] of this.pickups)
      if (!live.has(id)) {
        this.root.remove(o);
        this.pickups.delete(id);
      }
    // Sun tokens (only the ones not yet found, only close by).
    this.tokens.forEach((m, i) => {
      const found = s.story.tokens.includes(i);
      const d = Math.hypot(m.position.x - cam.position.x, m.position.z - cam.position.z);
      m.visible = !found && d < 90;
      if (m.visible) {
        m.rotation.y += dt * 2;
        m.position.y = 1.2 + Math.sin(this.t * 2 + i) * 0.15;
      }
    });
  }

  dispose() {
    this.scene.remove(this.root);
  }
}

function pickupModel(kind: string) {
  const g = new THREE.Group();
  const col = kind === "cash" ? "#3ddc84" : kind === "armor" ? "#4b8fd6" : kind === "health" ? "#ff5a5f" : kind === "package" ? "#c9a24a" : "#ffd23f";
  const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.4 });
  if (kind === "cash") {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.26), mat));
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.26), mat);
    b.position.y = 0.13;
    b.rotation.y = 0.4;
    g.add(b);
  } else if (kind === "health") {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), mat), new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), mat));
  } else if (kind === "armor") {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.16), mat));
  } else if (kind === "package") {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), mat));
  } else {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.12), mat), new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.1), mat));
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.position.y = -0.45;
  g.add(ring);
  return g;
}
