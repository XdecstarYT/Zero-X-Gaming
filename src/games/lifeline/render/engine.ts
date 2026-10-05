import * as THREE from "three";
import { H, W } from "../data";

/** Sky, ambient and sun colours through the day (hour → colours). */
const DAY: { h: number; sky: string; hemi: string; sun: string; sunI: number; amb: number }[] = [
  { h: 0, sky: "#0b1530", hemi: "#283a6b", sun: "#6d7fc4", sunI: 0.15, amb: 0.35 },
  { h: 5, sky: "#1a2347", hemi: "#3b4a80", sun: "#ff9f6b", sunI: 0.2, amb: 0.4 },
  { h: 7, sky: "#f6b98a", hemi: "#d6c2b0", sun: "#ffc48a", sunI: 1.4, amb: 0.75 },
  { h: 10, sky: "#9fd3f5", hemi: "#e6f1ff", sun: "#fff4e0", sunI: 2.4, amb: 1 },
  { h: 16, sky: "#a7d5f2", hemi: "#e8f0ff", sun: "#fff0d6", sunI: 2.2, amb: 1 },
  { h: 19, sky: "#f08a5d", hemi: "#d9a98e", sun: "#ff9a5c", sunI: 1.2, amb: 0.7 },
  { h: 21, sky: "#25264f", hemi: "#3a3f78", sun: "#8f8fe0", sunI: 0.25, amb: 0.45 },
  { h: 24, sky: "#0b1530", hemi: "#283a6b", sun: "#6d7fc4", sunI: 0.15, amb: 0.35 },
];

function lerpDay(h: number) {
  let a = DAY[0];
  let b = DAY[1];
  for (let i = 0; i < DAY.length - 1; i++)
    if (h >= DAY[i].h && h <= DAY[i + 1].h) {
      a = DAY[i];
      b = DAY[i + 1];
      break;
    }
  const t = (h - a.h) / Math.max(0.001, b.h - a.h);
  const c = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  return { sky: c(a.sky, b.sky), hemi: c(a.hemi, b.hemi), sun: c(a.sun, b.sun), sunI: a.sunI + (b.sunI - a.sunI) * t, amb: a.amb + (b.amb - a.amb) * t };
}

/**
 * The scene, camera and lights. The camera orbits a target over the plot: drag to pan,
 * right-drag or Q/E to turn, wheel to zoom; it tilts from a near top-down plan view to a
 * low angle up close.
 */
export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.3, 400);
  hemi = new THREE.HemisphereLight("#e6f1ff", "#5b6b4a", 1);
  sun = new THREE.DirectionalLight("#fff4e0", 2.4);
  /** 0 by day, 1 at night: interiors light up. */
  night = 0;
  target = new THREE.Vector3(W / 2, 0, H / 2 + 4);
  dist = 62;
  yaw = 0;
  pitch = 0.95;
  private want = { x: W / 2, z: H / 2 + 4, dist: 62, yaw: 0, pitch: 0.95 };
  keys = new Set<string>();

  constructor(private host: HTMLElement, quality: "low" | "high") {
    this.renderer = new THREE.WebGLRenderer({ antialias: quality === "high", powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1.25));
    this.renderer.shadowMap.enabled = quality === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -W * 0.62;
    sc.right = W * 0.62;
    sc.top = H * 0.75;
    sc.bottom = -H * 0.75;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(W / 2, 0, H / 2);
    this.scene.fog = new THREE.Fog("#9fd3f5", 120, 260);
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setHour(h: number) {
    const d = lerpDay(h % 24);
    this.scene.background = d.sky;
    (this.scene.fog as THREE.Fog).color.copy(d.sky);
    this.hemi.color.copy(d.hemi);
    this.hemi.intensity = d.amb;
    this.sun.color.copy(d.sun);
    this.sun.intensity = d.sunI;
    // The sun swings east to west; at night the "sun" is a dim moon high in the south.
    const a = ((h - 6) / 12) * Math.PI;
    const day = h > 5.5 && h < 20.5;
    const x = day ? Math.cos(a) * -60 : -20;
    const y = day ? Math.max(12, Math.sin(a) * 70) : 60;
    this.sun.position.set(W / 2 + x, y, H / 2 - 40);
    this.night = h < 6 || h > 20 ? 1 : h < 7.5 ? (7.5 - h) / 1.5 : h > 18.5 ? (h - 18.5) / 1.5 : 0;
  }

  // ---------------------------------------------------------------- camera

  get state() {
    return { ...this.want };
  }
  setView(v: { x: number; z: number; dist: number; yaw: number; pitch: number }, snap = false) {
    this.want = { ...v };
    this.clamp();
    if (snap) {
      this.target.set(this.want.x, 0, this.want.z);
      this.dist = this.want.dist;
      this.yaw = this.want.yaw;
      this.pitch = this.want.pitch;
    }
  }
  private clamp() {
    const w = this.want;
    w.dist = Math.min(120, Math.max(8, w.dist));
    w.pitch = Math.min(1.45, Math.max(w.dist < 20 ? 0.35 : 0.55, w.pitch));
    w.x = Math.min(W + 6, Math.max(-6, w.x));
    w.z = Math.min(H + 4, Math.max(-6, w.z));
  }
  panScreen(px: number, py: number) {
    const k = (this.want.dist / Math.max(300, this.host.clientHeight)) * 1.2;
    const fx = Math.sin(this.want.yaw);
    const fz = Math.cos(this.want.yaw);
    this.want.x += (-px * fz - py * fx) * k;
    this.want.z += (px * fx - py * fz) * k;
    this.clamp();
  }
  rotate(d: number) {
    this.want.yaw += d;
  }
  tilt(d: number) {
    this.want.pitch += d;
    this.clamp();
  }
  zoom(f: number) {
    this.want.dist *= f;
    this.clamp();
  }

  update(dt: number) {
    const k = this.keys;
    const sp = this.want.dist * 0.9 * dt;
    const fx = Math.sin(this.want.yaw);
    const fz = Math.cos(this.want.yaw);
    let mx = 0;
    let mz = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) mz -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) mz += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    if (mx || mz) {
      this.want.x += (mx * fz + mz * fx) * sp;
      this.want.z += (-mx * fx + mz * fz) * sp;
    }
    if (k.has("KeyQ")) this.want.yaw -= dt * 1.6;
    if (k.has("KeyE")) this.want.yaw += dt * 1.6;
    if (k.has("Equal") || k.has("NumpadAdd")) this.want.dist *= 1 - dt * 1.5;
    if (k.has("Minus") || k.has("NumpadSubtract")) this.want.dist *= 1 + dt * 1.5;
    this.clamp();
    const s = 1 - Math.exp(-dt * 10);
    this.target.x += (this.want.x - this.target.x) * s;
    this.target.z += (this.want.z - this.target.z) * s;
    this.dist += (this.want.dist - this.dist) * s;
    this.yaw += (this.want.yaw - this.yaw) * s;
    this.pitch += (this.want.pitch - this.pitch) * s;
    const c = this.camera;
    const r = this.dist * Math.cos(this.pitch);
    c.position.set(this.target.x + Math.sin(this.yaw) * r, this.dist * Math.sin(this.pitch), this.target.z + Math.cos(this.yaw) * r);
    c.lookAt(this.target);
  }

  /** The ground point (y = 0) under a screen position. */
  ground(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (!(t > 0)) return null;
    return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
  }

  /** Screen position of a world point (relative to the canvas). */
  screen(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * r.width + r.left, y: ((1 - v.y) / 2) * r.height + r.top };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
