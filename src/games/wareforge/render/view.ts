/**
 * The scenes the stage can show: the warehouse (World), a building site in a city (BuildWorld) and
 * the inside of one of your stores (StoreWorld). Each has its own scene, camera and orbit rig; the
 * stage draws whichever is in front and sends it the pointer.
 */
import * as THREE from "three";
import { SkyEnvironment, makeSky, skyFor, type SkyLight, type SkyMesh } from "@/nextx/look";
import type { Rig } from "@/nextx/rig";
import { DAY, HOUR } from "../data";
import { lampMat, windowMat } from "./models";

export interface View3D {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: Rig;
  /** 0 by day … 1 at night (for exposure and bloom). */
  readonly nightness: number;
  bakeEnvironment(renderer: THREE.WebGLRenderer): void;
  update(dt: number): void;
  resize(w: number, h: number): void;
  /** Where a screen point (normalised device coordinates) meets the ground, or the plane at height y. */
  groundAt(nx: number, ny: number, y?: number): THREE.Vector3 | null;
  dispose(): void;
}

const WHITE = new THREE.Color(1, 1, 1);
const DOWN = new THREE.Vector3(0, -1, 0);

/** Sky, sun and sky light for an outdoor scene, following the game clock from dawn to dark. */
export class Daylight {
  readonly sky: SkyMesh;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  night = 0;
  private env: SkyEnvironment | null = null;
  private light: SkyLight = skyFor(1);
  private dir = new THREE.Vector3(0.3, 0.8, 0.5);
  private storm = new THREE.Color("#8d96aa");

  constructor(
    private scene: THREE.Scene,
    shadows: boolean,
    /** Half the width of the sun's shadow box. */
    reach: number,
  ) {
    scene.background = new THREE.Color("#bcd7ef");
    scene.fog = new THREE.Fog("#bcd7ef", 140, 420);
    this.sky = makeSky();
    this.sky.scale.setScalar(400);
    scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight("#dce9ff", "#8d8c78", 0.4);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff1d8", 3);
    scene.add(this.sun, this.sun.target);
    if (shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -reach;
      c.right = c.top = reach;
      c.near = 5;
      c.far = 260;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
    }
  }

  bake(renderer: THREE.WebGLRenderer) {
    this.env = new SkyEnvironment(renderer, this.sky, 64);
  }

  /** Light the scene for game time `t`, the sun's shadow box over `target`. */
  sync(t: number, target: THREE.Vector3, opts: { storm?: boolean; day?: boolean } = {}) {
    const h = opts.day ? 13 : (t % DAY) / HOUR;
    const el = Math.sin((Math.PI * (h - 5)) / 16);
    const L = skyFor(el, this.light);
    if (opts.storm) {
      L.zenith.lerp(this.storm, 0.7);
      L.horizon.lerp(this.storm, 0.55);
      L.sunI *= 0.45;
    }
    const day = Math.min(1, Math.max(0, el * 1.6 + 0.1));
    this.night = 1 - day;
    const az = (Math.PI * (h - 5)) / 16;
    const sunOn = el > -0.05;
    if (sunOn) this.dir.set(-Math.cos(az) * 70, 18 + Math.max(0, el) * 60, 40).normalize();
    else this.dir.set(-30, 60, 40).normalize();
    this.sun.position.set(target.x + this.dir.x * 90, this.dir.y * 90, target.z + this.dir.z * 90);
    this.sun.target.position.copy(target);
    this.sun.color.copy(L.sun);
    this.sun.intensity = L.sunI;
    this.hemi.intensity = L.hemiI * 0.55;
    this.hemi.color.copy(L.zenith).lerp(WHITE, 0.55);
    const u = this.sky.material.uniforms;
    u.uZenith.value.copy(L.zenith);
    u.uHorizon.value.copy(L.horizon);
    u.uSunDir.value.copy(sunOn ? this.dir : DOWN);
    u.uSunColor.value.copy(L.sun).multiplyScalar(sunOn ? 1 : 0.1);
    u.uSunSize.value = sunOn ? 1 + (1 - Math.min(1, Math.max(0, el) * 3)) * 1.5 : 1;
    u.uNight.value = this.night;
    u.uCloud.value = opts.storm ? 1 : 0.2;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(L.horizon).lerp(L.zenith, 0.18);
    (this.scene.background as THREE.Color).copy(fog.color);
    if (this.env) this.scene.environment = this.env.update(`${Math.round(el * 14)}|${opts.storm ? 1 : 0}`);
    this.scene.environmentIntensity = 0.75;
    const lamps = Math.max(0, Math.min(1, (0.75 - day) / 0.6));
    lampMat.emissiveIntensity = lamps * 1.5;
    windowMat.emissiveIntensity = lamps * 0.6;
    return lamps;
  }

  /** Keep the dome round the camera and its clouds drifting. */
  follow(camera: THREE.Camera, dt: number) {
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.uTime.value += dt;
  }

  dispose() {
    this.env?.dispose();
  }
}

/** Ray from a screen point to the horizontal plane at height y. */
export function planeHit(camera: THREE.Camera, nx: number, ny: number, y: number) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const out = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out) ? out : null;
}
