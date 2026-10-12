import * as THREE from "three";
import { VEHICLES } from "../data";
import { fwdSpeed, player, playerCar, speedOf, type State } from "../state";
import { solidsNear, WATER_Y, type Solid } from "../world";

/**
 * The third-person camera: behind and above you on foot (over the right shoulder when aiming),
 * a chase camera in a vehicle that swings back behind you after you look round, kept out of the
 * walls; a swoop up and over the city when you switch leads; a slow orbit when it's all over.
 */

const scratch: Solid[] = [];

export class CamRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Where the camera looks (heading) and how far down (pitch > 0 looks down). */
  yaw = 0;
  pitch = 0.22;
  private lookAt = 0;
  private dist = 4.6;
  private tgt = new THREE.Vector3();
  private sw: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private orbit = 0;
  private fov = 60;
  /** The car you were last in (getting in swings the camera round behind it). */
  private lastCar = -1;
  private settle = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.15, 2200);
  }

  /** Mouse / touch look (radians). */
  look(dx: number, dy: number, t: number) {
    this.yaw += dx;
    this.pitch = Math.max(-0.9, Math.min(1.25, this.pitch + dy));
    if (Math.abs(dx) + Math.abs(dy) > 1e-4) this.lookAt = t;
  }

  /** The aim pitch (for shooting up at a helicopter or down off a roof). */
  get aimPitch() {
    return -this.pitch * 0.85 + 0.08;
  }

  /** Start the swoop between two places (switching leads). */
  swoop(from: { x: number; z: number }, to: { x: number; z: number }) {
    this.sw = { from: new THREE.Vector3(from.x, 0, from.z), to: new THREE.Vector3(to.x, 0, to.z), t: 0 };
  }
  get swooping() {
    return !!this.sw;
  }

  update(s: State, dt: number, now: number, aiming: boolean) {
    const p = player(s);
    if (!p) return;
    const car = playerCar(s);
    const cam = this.camera;
    if (this.sw) {
      // Up, across, and down.
      const w = this.sw;
      w.t += dt;
      const T = 2.4;
      const k = Math.min(1, w.t / T);
      const up = Math.sin(Math.min(1, k * 1.15) * Math.PI) * 420 + 20;
      const across = smooth(Math.max(0, Math.min(1, (k - 0.25) / 0.5)));
      const x = w.from.x + (w.to.x - w.from.x) * across;
      const z = w.from.z + (w.to.z - w.from.z) * across;
      cam.position.set(x - 30, up, z + 30);
      cam.lookAt(x, 0, z);
      if (k >= 1) this.sw = null;
      return;
    }
    let tx = p.x;
    let ty = (p.swim ? WATER_Y : p.y) + 1.55;
    let tz = p.z;
    let want = aiming ? 2.3 : 4.6;
    let fov = aiming ? 50 : 62;
    if (car && car.id !== this.lastCar) this.settle = 1.1;
    this.lastCar = car ? car.id : -1;
    this.settle = Math.max(0, this.settle - dt);
    if (car) {
      const spec = VEHICLES[car.kind];
      const sp = speedOf(car);
      tx = car.x;
      tz = car.z;
      ty = car.y + (spec.air ? 1 : spec.body === "bike" ? 1.3 : 1.45 + spec.len * 0.06);
      want = 4.2 + spec.len * 0.75 + Math.min(4, sp * 0.06);
      fov = 60 + Math.min(14, sp * 0.22);
      // Swing back behind the car when you're not looking round (and it's moving).
      if (now - this.lookAt > 1.4 && (Math.abs(fwdSpeed(car)) > 2 || this.settle > 0)) {
        const back = fwdSpeed(car) < -2 ? car.h + Math.PI : car.h;
        const d = Math.atan2(Math.sin(back - this.yaw), Math.cos(back - this.yaw));
        this.yaw += d * Math.min(1, dt * (this.settle > 0 ? 4 : 2.6));
        this.pitch += (0.2 - this.pitch) * Math.min(1, dt * 1.5);
      }
    }
    if (s.down) {
      // It's over: a slow orbit, rising.
      this.orbit += dt * 0.35;
      this.yaw += dt * 0.35;
      want = 6 + Math.min(10, this.orbit * 3);
      this.pitch += (0.55 - this.pitch) * Math.min(1, dt);
    } else this.orbit = 0;
    this.tgt.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * (car ? 14 : 18)));
    if (this.tgt.distanceTo(new THREE.Vector3(tx, ty, tz)) > 25) this.tgt.set(tx, ty, tz);
    this.dist += (want - this.dist) * Math.min(1, dt * 6);
    const cp = Math.cos(this.pitch);
    const dx = -Math.cos(this.yaw) * cp;
    const dy = Math.sin(this.pitch);
    const dz = -Math.sin(this.yaw) * cp;
    // Over the right shoulder.
    const sh = aiming && !car ? 0.6 : 0;
    const rx = -Math.sin(this.yaw) * sh;
    const rz = Math.cos(this.yaw) * sh;
    const ox = this.tgt.x + rx;
    const oz = this.tgt.z + rz;
    const d = this.clear(s, ox, this.tgt.y, oz, dx, dy, dz, this.dist);
    cam.position.set(ox + dx * d, Math.max(0.35 + (p.swim ? WATER_Y : 0), this.tgt.y + dy * d), oz + dz * d);
    cam.lookAt(ox - dx * 2, this.tgt.y - dy * 2 + (car ? 0.4 : 0.05), oz - dz * 2);
    this.fov += (fov - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  /** Pull the camera in so a wall doesn't come between it and you. */
  private clear(s: State, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, d: number) {
    let best = d;
    for (const w of solidsNear(s.city, ox + dx * d * 0.5, oz + dz * d * 0.5, d * 0.5 + 4, scratch)) {
      if (w.round) continue;
      let t0 = 0;
      let t1 = d;
      const slab = (p: number, v: number, lo: number, hi: number) => {
        if (Math.abs(v) < 1e-9) return p >= lo && p <= hi;
        let a = (lo - p) / v;
        let b = (hi - p) / v;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        return t0 <= t1;
      };
      if (!slab(ox, dx, w.x - w.hw - 0.2, w.x + w.hw + 0.2) || !slab(oz, dz, w.z - w.hd - 0.2, w.z + w.hd + 0.2) || !slab(oy, dy, -10, w.h + 0.3)) continue;
      best = Math.min(best, Math.max(0.6, t0 - 0.25));
    }
    return best;
  }

  /** Face the camera somewhere with room behind it: the first of these headings with a clear view. */
  frame(s: State, x: number, y: number, z: number, yaws: number[]) {
    const cp = Math.cos(this.pitch);
    let best = yaws[0];
    let room = -1;
    for (const yaw of yaws) {
      const d = this.clear(s, x, y + 1.55, z, -Math.cos(yaw) * cp, Math.sin(this.pitch), -Math.sin(yaw) * cp, 4.6);
      if (d > room + 0.5) {
        room = d;
        best = yaw;
      }
      if (d >= 4.5) break;
    }
    this.yaw = best;
    this.dist = Math.min(4.6, room);
  }

  /** The camera's ground heading (what "forward" means for movement). */
  get heading() {
    return this.yaw;
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}

function smooth(x: number) {
  return x * x * (3 - 2 * x);
}
