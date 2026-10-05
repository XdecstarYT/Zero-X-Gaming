import * as THREE from "three";
import type { Lot } from "../world/lots";

const FLAMES = 7;
const PUFFS = 4;

/** Burning buildings: flickering flames on the roof line and a column of smoke. */
export class FireView {
  readonly group = new THREE.Group();
  private flames: THREE.InstancedMesh;
  private smoke: THREE.InstancedMesh;
  private light = new THREE.PointLight("#ff7a1a", 0, 120, 1.5);
  private list: { x: number; z: number; y: number; w: number; d: number; ang: number; seed: number; covered: boolean }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(max = 40) {
    this.flames = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.4, 7).translate(0, 1.2, 0), new THREE.MeshBasicMaterial({ color: "#ff8a1f", transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }), max * FLAMES);
    this.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: "#2a2a2e", transparent: true, opacity: 0.45, depthWrite: false }), max * PUFFS);
    this.flames.frustumCulled = this.smoke.frustumCulled = false;
    this.flames.count = this.smoke.count = 0;
    this.flames.renderOrder = 7;
    this.smoke.renderOrder = 7;
    const col = new THREE.Color();
    for (let i = 0; i < max * FLAMES; i++) this.flames.setColorAt(i, col.set(i % 3 === 0 ? "#ffd23f" : i % 3 === 1 ? "#ff6a00" : "#ff3d1f"));
    this.group.add(this.flames, this.smoke, this.light);
  }

  /** Which lots are burning (lot, building height). */
  set(fires: [number, number, number][], lot: (id: number) => Lot | undefined, height: (id: number) => number, ground: (x: number, z: number) => number) {
    const cap = this.flames.instanceMatrix.count / FLAMES;
    this.list = [];
    for (const [id, , covered] of fires) {
      const l = lot(id);
      if (!l || this.list.length >= cap) continue;
      this.list.push({ x: l.cx, z: l.cz, y: ground(l.cx, l.cz) + height(id), w: l.w * 0.45, d: l.d * 0.45, ang: l.ang, seed: (id * 0.6180339) % 1, covered: !!covered });
    }
  }

  update(t: number, night: number) {
    let fi = 0;
    let si = 0;
    let sx = 0;
    let sz = 0;
    let sy = 0;
    for (const f of this.list) {
      const c = Math.cos(f.ang);
      const s = Math.sin(f.ang);
      // Firefighters on it: smaller flames, more white smoke.
      const k = f.covered ? 0.7 : 1;
      for (let i = 0; i < FLAMES; i++) {
        const a = (i / FLAMES + f.seed) * Math.PI * 2;
        const u = Math.cos(a * 1.7) * f.w * 0.7;
        const w = Math.sin(a) * f.d * 0.7;
        const flick = 0.75 + 0.35 * Math.sin(t * 9 + i * 2.3 + f.seed * 30);
        this.v.set(f.x + u * c - w * s, f.y - 0.5, f.z + u * s + w * c);
        this.s.set(1.6 * k, 2.4 * flick * k + 0.6, 1.6 * k);
        this.flames.setMatrixAt(fi++, this.m.compose(this.v, this.q.identity(), this.s));
      }
      for (let i = 0; i < PUFFS; i++) {
        const ph = (t * 0.18 + i / PUFFS + f.seed) % 1;
        this.v.set(f.x + Math.sin(t * 0.5 + i) * 2 + ph * 6, f.y + 3 + ph * 26, f.z + ph * 3);
        this.s.setScalar(2.2 + ph * 6);
        this.smoke.setMatrixAt(si++, this.m.compose(this.v, this.q.identity(), this.s));
      }
      sx += f.x;
      sz += f.z;
      sy = Math.max(sy, f.y);
    }
    this.flames.count = fi;
    this.smoke.count = si;
    this.flames.instanceMatrix.needsUpdate = true;
    this.smoke.instanceMatrix.needsUpdate = true;
    const n = this.list.length;
    this.light.intensity = n ? (450 + 150 * Math.sin(t * 13)) * (0.3 + 0.7 * night) : 0;
    if (n) this.light.position.set(sx / n, sy + 6, sz / n);
  }

  dispose() {
    this.flames.dispose();
    this.smoke.dispose();
  }
}
