import * as THREE from "three";
import { W } from "../data";
import type { EmergencyState, Person } from "../sim";

/**
 * Emergency effects: flames and smoke over burning cells, and a pulsing ring with a
 * blue beacon over a Code Blue patient.
 */
export class EmergencyFX {
  group = new THREE.Group();
  private flameGeo = new THREE.ConeGeometry(0.22, 0.9, 7).translate(0, 0.45, 0);
  private smokeGeo = new THREE.SphereGeometry(0.3, 8, 6);
  private flameMats = [
    new THREE.MeshBasicMaterial({ color: "#fb923c", transparent: true, opacity: 0.9, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.85, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.85, depthWrite: false }),
  ];
  private smokeMat = new THREE.MeshBasicMaterial({ color: "#3f3f46", transparent: true, opacity: 0.35, depthWrite: false });
  private flames = new Map<number, THREE.Group>();
  private light = new THREE.PointLight("#fb923c", 0, 9, 1.6);
  private ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#3b82f6", transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  private beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), new THREE.MeshBasicMaterial({ color: "#60a5fa" }));

  constructor() {
    this.light.position.y = 1.6;
    this.ring.renderOrder = 11;
    this.group.add(this.light, this.ring, this.beacon);
    this.ring.visible = this.beacon.visible = false;
  }

  private flame(cell: number) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(this.flameGeo, this.flameMats[i]);
      m.position.set((i - 1) * 0.22, 0.05, ((i * 7) % 3) * 0.15 - 0.15);
      g.add(m);
    }
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Mesh(this.smokeGeo, this.smokeMat);
      s.userData.smoke = i;
      g.add(s);
    }
    g.position.set((cell % W) + 0.5, 0.03, Math.floor(cell / W) + 0.5);
    g.userData.seed = (cell * 0.618) % 1;
    this.group.add(g);
    this.flames.set(cell, g);
    return g;
  }

  update(e: EmergencyState | null, people: Map<number, Person>, t: number) {
    const fire = e?.kind === "fire" ? e.fire : {};
    for (const [c, g] of this.flames)
      if (!(c in fire)) {
        this.group.remove(g);
        this.flames.delete(c);
      }
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (const [k, heat] of Object.entries(fire)) {
      const c = Number(k);
      const g = this.flames.get(c) ?? this.flame(c);
      const seed = g.userData.seed as number;
      g.children.forEach((m, i) => {
        if (m.userData.smoke !== undefined) {
          const ph = (t * 0.5 + seed + m.userData.smoke * 0.5) % 1;
          m.position.set(Math.sin(t + i) * 0.15, 1 + ph * 2.4, 0);
          m.scale.setScalar(0.6 + ph * 1.4);
          return;
        }
        const f = 0.55 + heat * 0.9 + Math.sin(t * 11 + seed * 20 + i * 2.1) * 0.18;
        m.scale.set(0.8 + heat * 0.5, f, 0.8 + heat * 0.5);
      });
      sx += g.position.x;
      sz += g.position.z;
      n++;
    }
    this.light.intensity = n ? 6 + Math.sin(t * 13) * 1.5 : 0;
    if (n) this.light.position.set(sx / n, 1.6, sz / n);
    // Code Blue.
    const p = e?.kind === "codeBlue" ? people.get(e.patient) : null;
    this.ring.visible = this.beacon.visible = !!p;
    if (p) {
      const k = (t * 1.6) % 1;
      this.ring.position.set(p.x, 0.06, p.z);
      this.ring.scale.setScalar(0.8 + k * 1.2);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      this.beacon.position.set(p.x, 2.2 + Math.sin(t * 4) * 0.15, p.z);
      this.beacon.rotation.y = t * 3;
    }
  }
}
