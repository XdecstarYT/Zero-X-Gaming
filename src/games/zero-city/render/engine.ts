import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import type { Settings } from "../settings";

/** Shared shader uniforms: night (0 day – 1 night) drives window lights; time animates water. */
export const shared = {
  uNight: { value: 0 },
  uTime: { value: 0 },
};

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position,1.)).xyz - cameraPosition); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.); gl_Position.z = gl_Position.w; }`;
const SKY_FS = `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uGround, clamp(-h * 4.0, 0.0, 1.0));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 900.0 / uSunSize) * 3.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12);
  gl_FragColor = vec4(col, 1.0);
}`;

/** Colours of the sky, sun and ambient light through the day. Hours → [zenith, horizon, sun, sun intensity, hemi intensity]. */
const KEYS: [number, string, string, string, number, number][] = [
  [0, "#05070f", "#141a2c", "#6b7fb8", 0.18, 0.18],
  [5, "#0b1020", "#2a2a40", "#7d84b8", 0.12, 0.22],
  [6, "#3c5a8c", "#f2a86a", "#ff9a4a", 1.4, 0.45],
  [7.5, "#4f86c4", "#f6c690", "#ffc27a", 2.4, 0.6],
  [10, "#4a8ed8", "#bcd8f0", "#fff3dc", 3.0, 0.75],
  [15, "#4a8ed8", "#c4dbef", "#fff1d6", 3.0, 0.75],
  [17.5, "#5b86bf", "#f3c58e", "#ffb46a", 2.5, 0.62],
  [18.6, "#3a4f80", "#f08a5a", "#ff7a3c", 1.3, 0.45],
  [19.6, "#141c36", "#3a2e48", "#8090c8", 0.2, 0.25],
  [24, "#05070f", "#141a2c", "#6b7fb8", 0.18, 0.18],
];

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 1, 3000);
  readonly sun = new THREE.DirectionalLight("#fff3dc", 3);
  readonly hemi = new THREE.HemisphereLight("#cfe3ff", "#5b6b3a", 0.7);
  readonly fog = new THREE.Fog("#c4dbef", 600, 2600);
  readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private composer: EffectComposer | null = null;
  private passes: { smaa?: SMAAPass; bloom?: UnrealBloomPass; ao?: GTAOPass } = {};
  private settings: Settings | null = null;
  private size = { w: 1, h: 1 };
  private shadowHalf = 200;
  /** Where the camera is looking (the shadow box follows it). */
  focus = new THREE.Vector3();
  night = 0;

  constructor(readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false, preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none";
    canvas.setAttribute("aria-label", "City view");
    host.appendChild(canvas);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color("#c4dbef");
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VS,
        fragmentShader: SKY_FS,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGround: { value: new THREE.Color("#3d4a3a") },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color() },
          uSunSize: { value: 1 },
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.resize();
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  /** Apply graphics settings live (no restart). */
  apply(s: Settings) {
    const prev = this.settings;
    this.settings = s;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(Math.max(0.5, dpr * (s.renderScale / 100)));
    const far = 700 + 2100 * (s.viewDistance / 100);
    this.camera.far = far + 400;
    this.camera.updateProjectionMatrix();
    this.fog.near = far * 0.35;
    this.fog.far = far;
    this.sky.scale.setScalar(far);
    const shadows = s.shadows !== "off";
    this.sun.castShadow = shadows;
    if (shadows) {
      const size = s.shadows === "sharp" ? 4096 : 2048;
      if (this.sun.shadow.mapSize.x !== size) {
        this.sun.shadow.mapSize.set(size, size);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
      const type = s.shadows === "sharp" ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      if (this.renderer.shadowMap.type !== type) {
        this.renderer.shadowMap.type = type;
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
    const wantComposer = s.aa || s.bloom || s.ao;
    if (wantComposer && !this.composer) this.buildComposer();
    if (this.composer) {
      if (this.passes.smaa) this.passes.smaa.enabled = s.aa;
      if (this.passes.bloom) this.passes.bloom.enabled = s.bloom;
      if (s.ao && !this.passes.ao) this.addAO();
      if (this.passes.ao) this.passes.ao.enabled = s.ao;
    }
    if (prev && prev.shadows !== s.shadows) this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  private buildComposer() {
    const { w, h } = this.size;
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    const c = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.55, 0.92);
    c.addPass(bloom);
    c.addPass(new OutputPass());
    const smaa = new SMAAPass();
    c.addPass(smaa);
    this.passes = { smaa, bloom };
    this.composer = c;
  }

  private addAO() {
    if (!this.composer) return;
    const { w, h } = this.size;
    const ao = new GTAOPass(this.scene, this.camera, w, h);
    ao.updateGtaoMaterial({ radius: 4, distanceExponent: 1.5, thickness: 2, scale: 1 });
    ao.blendIntensity = 0.8;
    this.composer.insertPass(ao, 1);
    this.passes.ao = ao;
  }

  /** Sun, sky, fog and lights for a time of day (minutes since midnight). */
  setTime(minutes: number) {
    const hour = ((minutes / 60) % 24 + 24) % 24;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = (hour - a[0]) / Math.max(0.001, b[0] - a[0]);
    const mix = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), t);
    const zenith = mix(a[1], b[1]);
    const horizon = mix(a[2], b[2]);
    const sunCol = mix(a[3], b[3]);
    const sunI = a[4] + (b[4] - a[4]) * t;
    const hemiI = a[5] + (b[5] - a[5]) * t;
    // Sun path: rises in the east (+x), sets in the west, highest at 12:15.
    const day = (hour - 6) / 12.6;
    const up = day > 0 && day < 1;
    const elev = up ? Math.sin(day * Math.PI) * 0.95 : -0.3;
    const az = up ? Math.PI * (1 - day) : 0;
    const dir = up ? new THREE.Vector3(Math.cos(az) * Math.cos(elev), Math.max(0.08, Math.sin(elev)), 0.45 + Math.sin(az) * 0.25).normalize() : new THREE.Vector3(-0.4, 0.75, 0.5).normalize();
    this.sun.color.copy(sunCol);
    this.sun.intensity = sunI;
    this.hemi.intensity = hemiI;
    this.hemi.color.copy(zenith).lerp(new THREE.Color("#ffffff"), 0.45);
    this.sunDir.copy(dir);
    const u = this.sky.material.uniforms;
    u.uZenith.value.copy(zenith);
    u.uHorizon.value.copy(horizon);
    u.uSunDir.value.copy(up ? dir : new THREE.Vector3(0, -1, 0));
    u.uSunColor.value.copy(sunCol).multiplyScalar(up ? 1 : 0.15);
    u.uSunSize.value = up ? 1 + (1 - Math.min(1, elev * 3)) * 1.5 : 1;
    this.fog.color.copy(horizon).lerp(zenith, 0.25);
    (this.scene.background as THREE.Color).copy(this.fog.color);
    this.night = up ? Math.min(1, Math.max(0, 1 - elev / 0.16)) : 1;
    shared.uNight.value = this.night;
    this.renderer.toneMappingExposure = 1.0 + this.night * 0.35;
  }

  private sunDir = new THREE.Vector3(0.5, 0.8, 0.3);

  /** Keep the shadow box over what the camera sees, snapped to texels so it doesn't shimmer. */
  private placeShadow(dist: number) {
    const half = Math.min(520, Math.max(70, dist * 0.95));
    if (Math.abs(half - this.shadowHalf) > this.shadowHalf * 0.15) {
      this.shadowHalf = half;
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -half;
      c.right = c.top = half;
      c.near = 1;
      c.far = 2400;
      c.updateProjectionMatrix();
    }
    const texel = (this.shadowHalf * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(this.focus.x / texel) * texel;
    const fz = Math.round(this.focus.z / texel) * texel;
    this.sun.target.position.set(fx, this.focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 900, this.focus.y + this.sunDir.y * 900, fz + this.sunDir.z * 900);
  }

  render(dist: number) {
    this.sky.position.copy(this.camera.position);
    this.placeShadow(dist);
    if (this.composer && this.settings && (this.settings.aa || this.settings.bloom || this.settings.ao)) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** A small JPEG of the current view (for save thumbnails). */
  snapshot(width = 320, height = 180) {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const g = c.getContext("2d")!;
    const sr = src.width / src.height;
    const dr = width / height;
    let sw = src.width;
    let sh = src.height;
    if (sr > dr) sw = sh * dr;
    else sh = sw / dr;
    g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, width, height);
    try {
      return c.toDataURL("image/jpeg", 0.72);
    } catch {
      return undefined;
    }
  }

  dispose() {
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
