import * as THREE from "three";
import { WORLD } from "../config";
import type { Terrain } from "../world/terrain";

/**
 * The city camera: hovers over a target point and tilts from a top-down
 * planning view (86°) down to street level (7°). Keys pan and rotate, the
 * wheel zooms toward the cursor, right/middle drag orbits; on touch one
 * finger pans (when no tool is out), two fingers pinch, twist and tilt.
 */
export class CameraRig {
  target = new THREE.Vector3(WORLD / 2, 0, WORLD / 2);
  dist = 420;
  yaw = Math.PI * 0.25;
  pitch = 0.95;
  private want = { x: WORLD / 2, z: WORLD / 2, dist: 420, yaw: Math.PI * 0.25, pitch: 0.95 };
  keys = new Set<string>();
  smooth = true;
  /** Seconds left of an automatic orbit (menu backdrop). */
  orbit = 0;

  static MIN_DIST = 16;
  static MAX_DIST = 1700;

  constructor(
    private cam: THREE.PerspectiveCamera,
    private terrain: () => Terrain | null,
  ) {}

  get state() {
    return { x: this.want.x, z: this.want.z, dist: this.want.dist, yaw: this.want.yaw, pitch: this.want.pitch };
  }

  set(s: { x: number; z: number; dist: number; yaw: number; pitch: number }, snap = false) {
    this.want = { ...s };
    this.clampWant();
    if (snap) {
      this.target.set(this.want.x, this.target.y, this.want.z);
      this.dist = this.want.dist;
      this.yaw = this.want.yaw;
      this.pitch = this.want.pitch;
    }
  }

  private clampWant() {
    const w = this.want;
    w.dist = Math.min(CameraRig.MAX_DIST, Math.max(CameraRig.MIN_DIST, w.dist));
    // Low angles only up close: the street view is for watching, not planning.
    const minPitch = w.dist < 120 ? 0.12 : w.dist < 400 ? 0.3 : 0.5;
    w.pitch = Math.min(1.5, Math.max(minPitch, w.pitch));
    w.x = Math.min(WORLD + 200, Math.max(-200, w.x));
    w.z = Math.min(WORLD + 200, Math.max(-200, w.z));
  }

  pan(dx: number, dz: number) {
    this.want.x += dx;
    this.want.z += dz;
    this.clampWant();
  }

  /** Pan by a screen-space drag (pixels), scaled to the zoom. */
  panScreen(px: number, py: number, h: number) {
    const k = (this.want.dist / Math.max(200, h)) * 1.15;
    const fx = Math.sin(this.want.yaw);
    const fz = Math.cos(this.want.yaw);
    // Screen right = (cos yaw, -sin yaw); screen up = -(sin yaw, cos yaw) in x/z.
    this.pan((-px * fz - py * fx) * k, (px * fx - py * fz) * k);
  }

  rotate(d: number) {
    this.want.yaw += d;
  }

  tilt(d: number) {
    this.want.pitch += d;
    this.clampWant();
  }

  /** Zoom by a factor, keeping the world point under the cursor still. */
  zoom(factor: number, toward?: THREE.Vector3) {
    const before = this.want.dist;
    this.want.dist *= factor;
    this.clampWant();
    if (toward) {
      const k = 1 - this.want.dist / before;
      this.pan((toward.x - this.want.x) * k, (toward.z - this.want.z) * k);
    }
  }

  update(dt: number) {
    const sp = this.want.dist * 0.9 * dt;
    const k = this.keys;
    let mx = 0;
    let mz = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) mz -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) mz += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    if (mx || mz) {
      const fx = Math.sin(this.want.yaw);
      const fz = Math.cos(this.want.yaw);
      this.pan((mx * fz + mz * fx) * sp, (-mx * fx + mz * fz) * sp);
    }
    if (k.has("KeyQ")) this.rotate(-1.4 * dt);
    if (k.has("KeyE")) this.rotate(1.4 * dt);
    if (k.has("KeyR") || k.has("Equal") || k.has("NumpadAdd")) this.zoom(Math.exp(-1.4 * dt));
    if (k.has("KeyF") || k.has("Minus") || k.has("NumpadSubtract")) this.zoom(Math.exp(1.4 * dt));
    if (this.orbit > 0) {
      this.orbit -= dt;
      this.want.yaw += dt * 0.04;
    }
    const a = this.smooth ? 1 - Math.exp(-dt * 10) : 1;
    this.target.x += (this.want.x - this.target.x) * a;
    this.target.z += (this.want.z - this.target.z) * a;
    this.dist += (this.want.dist - this.dist) * a;
    this.yaw += (this.want.yaw - this.yaw) * a;
    this.pitch += (this.want.pitch - this.pitch) * a;
    const t = this.terrain();
    const gy = t ? t.surfaceAt(this.target.x, this.target.z) : 0;
    this.target.y += (gy - this.target.y) * Math.min(1, a * 1.5);
    const cp = Math.cos(this.pitch);
    const pos = new THREE.Vector3(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    if (t) pos.y = Math.max(pos.y, t.surfaceAt(pos.x, pos.z) + 2.5);
    this.cam.position.copy(pos);
    this.cam.lookAt(this.target.x, this.target.y + Math.min(6, this.dist * 0.02), this.target.z);
  }

  /** Height above the ground (drives the city hum). */
  height() {
    return Math.sin(this.pitch) * this.dist;
  }
}
