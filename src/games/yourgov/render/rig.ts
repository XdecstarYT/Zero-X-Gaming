import * as THREE from "three";

export interface RigLimits {
  minDist: number;
  maxDist: number;
  /** Pitch: radians above the horizon. */
  minPitch: number;
  maxPitch: number;
  /** Keep the target inside this box (x/z), if given. */
  bounds?: { x0: number; z0: number; x1: number; z1: number };
  /** Limit the yaw to [min, max] radians, if given. */
  yaw?: [number, number];
}

/**
 * An orbiting camera with damping: a target on the ground, a distance, a yaw and a pitch.
 * Input moves the goal; the camera eases toward it every frame.
 */
export class Rig {
  readonly goal = { target: new THREE.Vector3(), dist: 300, yaw: 0, pitch: 0.9 };
  readonly cur = { target: new THREE.Vector3(), dist: 300, yaw: 0, pitch: 0.9 };
  /** Set when anything moved this frame (so the labels know to follow). */
  moved = true;

  constructor(
    public limits: RigLimits,
    start: { target: THREE.Vector3; dist: number; yaw: number; pitch: number },
  ) {
    this.jump(start);
  }

  /** Put the camera somewhere at once. */
  jump(p: { target: THREE.Vector3; dist: number; yaw: number; pitch: number }) {
    this.fly(p);
    this.cur.target.copy(this.goal.target);
    this.cur.dist = this.goal.dist;
    this.cur.yaw = this.goal.yaw;
    this.cur.pitch = this.goal.pitch;
    this.moved = true;
  }

  /** Glide to a view. */
  fly(p: Partial<{ target: THREE.Vector3; dist: number; yaw: number; pitch: number }>) {
    if (p.target) this.goal.target.copy(p.target);
    if (p.dist !== undefined) this.goal.dist = p.dist;
    if (p.yaw !== undefined) this.goal.yaw = p.yaw;
    if (p.pitch !== undefined) this.goal.pitch = p.pitch;
    this.clamp();
  }

  private clamp() {
    const L = this.limits;
    const g = this.goal;
    g.dist = Math.min(L.maxDist, Math.max(L.minDist, g.dist));
    g.pitch = Math.min(L.maxPitch, Math.max(L.minPitch, g.pitch));
    if (L.yaw) g.yaw = Math.min(L.yaw[1], Math.max(L.yaw[0], g.yaw));
    if (L.bounds) {
      g.target.x = Math.min(L.bounds.x1, Math.max(L.bounds.x0, g.target.x));
      g.target.z = Math.min(L.bounds.z1, Math.max(L.bounds.z0, g.target.z));
    }
  }

  /** Drag the ground under the pointer by a screen delta (pixels). */
  pan(dx: number, dy: number, viewH: number, fov: number) {
    const k = (2 * this.cur.dist * Math.tan((fov * Math.PI) / 360)) / Math.max(1, viewH);
    const yaw = this.cur.yaw;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const kf = k / Math.max(0.35, Math.sin(this.cur.pitch));
    this.goal.target.x += -right.x * dx * k + fwd.x * dy * kf;
    this.goal.target.z += -right.z * dx * k + fwd.z * dy * kf;
    this.clamp();
  }

  rotate(dx: number, dy: number) {
    this.goal.yaw -= dx * 0.006;
    this.goal.pitch += dy * 0.005;
    this.clamp();
  }

  /** Zoom by a factor (<1 is in), toward a point on the ground if given. */
  zoom(f: number, focus?: THREE.Vector3 | null) {
    const before = this.goal.dist;
    this.goal.dist *= f;
    this.clamp();
    const real = this.goal.dist / before;
    if (focus) {
      this.goal.target.x += (focus.x - this.goal.target.x) * (1 - real);
      this.goal.target.z += (focus.z - this.goal.target.z) * (1 - real);
      this.clamp();
    }
  }

  /** Ease toward the goal (frame-rate independent) and place the camera. */
  step(dt: number, camera: THREE.PerspectiveCamera) {
    const a = 1 - Math.exp(-dt * 7);
    const c = this.cur;
    const g = this.goal;
    const before = c.target.x + c.target.z * 1.3 + c.dist * 1.7 + c.yaw * 3.1 + c.pitch * 5.3;
    c.target.lerp(g.target, a);
    c.dist += (g.dist - c.dist) * a;
    c.yaw += (g.yaw - c.yaw) * a;
    c.pitch += (g.pitch - c.pitch) * a;
    const after = c.target.x + c.target.z * 1.3 + c.dist * 1.7 + c.yaw * 3.1 + c.pitch * 5.3;
    this.moved = this.moved || Math.abs(after - before) > 1e-4;
    const cp = Math.cos(c.pitch);
    camera.position.set(c.target.x + Math.sin(c.yaw) * cp * c.dist, c.target.y + Math.sin(c.pitch) * c.dist, c.target.z + Math.cos(c.yaw) * cp * c.dist);
    camera.lookAt(c.target);
  }
}
