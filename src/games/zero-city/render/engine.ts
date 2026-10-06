import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { Settings } from "../settings";

/** Shared shader uniforms: night (0 day – 1 night) drives window lights; time animates water. */
export const shared = {
  uNight: { value: 0 },
  uTime: { value: 0 },
};

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position,1.)).xyz - cameraPosition); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.); gl_Position.z = gl_Position.w; }`;
const SKY_FS = `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize; uniform float uTime; uniform float uNight;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  // Sky: a bright, hazy horizon band fading into a deeper zenith.
  vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.48)) : mix(uHorizon, uGround, clamp(-h * 4.0, 0.0, 1.0));
  col = mix(col, uHorizon * 1.08, exp(-max(h, 0.0) * 14.0) * 0.55);
  vec3 sd = normalize(uSunDir);
  float s = max(dot(d, sd), 0.0);
  // Sun disc, a soft Mie halo and a wide forward glow.
  col += uSunColor * (pow(s, 900.0 / uSunSize) * 3.0 + pow(s, 24.0) * 0.28 + pow(s, 4.0) * 0.12);
  // Soft drifting cumulus, lit by the sun from one side.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv);
    float cov = smoothstep(0.5, 0.78, n) * smoothstep(0.0, 0.12, h);
    float lit = 0.75 + 0.35 * fbm(uv + sd.xz * 0.35);
    vec3 cloud = mix(uHorizon, vec3(1.0), 0.65) * lit + uSunColor * pow(s, 6.0) * 0.4;
    cloud = mix(cloud, uZenith * 0.5 + uHorizon * 0.15, uNight * 0.85);
    col = mix(col, cloud, cov * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/** Colour grade, vignette and an optional tilt-shift depth of field (after tone mapping). */
const GRADE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uDof: { value: 0 },
    uFocusY: { value: 0.5 },
    uSat: { value: 1.06 },
    uWarm: { value: 0.025 },
    uContrast: { value: 1.06 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uDof; uniform float uFocusY; uniform float uSat; uniform float uWarm; uniform float uContrast;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (uDof > 0.0) {
    float b = smoothstep(0.16, 0.62, abs(vUv.y - uFocusY)) * uDof;
    if (b > 0.04) {
      vec2 px = b * 2.6 / uRes;
      vec3 acc = c;
      acc += texture2D(tDiffuse, vUv + vec2(0.53, 0.12) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(-0.38, 0.62) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(-0.71, -0.27) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(0.22, -0.84) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(0.96, 0.31) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(-0.05, 1.0) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(-1.0, 0.18) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(0.66, -0.66) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(-0.6, -0.9) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(0.85, 0.85) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(-0.9, 0.75) * px).rgb;
      acc += texture2D(tDiffuse, vUv + vec2(0.35, 0.45) * px).rgb;
      c = acc / 13.0;
    }
  }
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  c *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.3, 1.0 - uWarm);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.42;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
};

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
  private passes: { smaa?: SMAAPass; bloom?: UnrealBloomPass; ao?: GTAOPass; grade?: ShaderPass } = {};
  /** Image-based light and reflections, rendered from the sky now and then. */
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envHour = -99;
  private envNight = -1;
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
          uTime: shared.uTime,
          uNight: shared.uNight,
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const envSky = new THREE.Mesh(this.sky.geometry, this.sky.material);
    envSky.scale.setScalar(50);
    this.envScene.add(envSky);
    this.resize();
  }

  /** Re-render the environment light from the sky when the time of day has moved on. */
  private updateEnv(hour: number) {
    // Hours between now and the last capture, round the clock.
    const dh = Math.abs(((hour - this.envHour + 36) % 24) - 12);
    if (dh < 0.5 && Math.abs(this.night - this.envNight) < 0.08) return;
    this.envHour = hour;
    this.envNight = this.night;
    // The sky is smooth, so a small capture lights and reflects just as well, for a fraction of the cost.
    const rt = this.pmrem.fromScene(this.envScene, 0.035, 0.1, 100, { size: 64 });
    this.envRT?.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
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
    const pr = this.renderer.getPixelRatio();
    this.passes.grade?.uniforms.uRes.value.set(w * pr, h * pr);
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
    const wantComposer = s.aa || s.bloom || s.ao || s.dof;
    if (wantComposer && !this.composer) this.buildComposer();
    if (this.composer) {
      if (this.passes.smaa) this.passes.smaa.enabled = s.aa;
      if (this.passes.bloom) this.passes.bloom.enabled = s.bloom;
      if (s.ao && !this.passes.ao) this.addAO();
      if (this.passes.ao) this.passes.ao.enabled = s.ao;
    }
    // Ambient from the sky: richer with the full pipeline, a touch flatter on low.
    this.scene.environmentIntensity = s.aa || s.bloom ? 0.62 : 0.5;
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
    const grade = new ShaderPass(GRADE);
    c.addPass(grade);
    const smaa = new SMAAPass();
    c.addPass(smaa);
    this.passes = { smaa, bloom, grade };
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
    // The sky's environment light does most of the ambient now; the hemisphere fills in.
    this.hemi.intensity = hemiI * 0.55;
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
    this.updateEnv(hour);
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
    const g = this.passes.grade;
    if (g) {
      // Tilt-shift: focus on the screen row the camera looks at; stronger the closer it is.
      const f = this.focus.clone().project(this.camera);
      g.uniforms.uFocusY.value = Math.min(0.85, Math.max(0.15, f.y * 0.5 + 0.5));
      g.uniforms.uDof.value = this.settings?.dof ? Math.min(1.3, Math.max(0.35, 1.5 - dist / 450)) : 0;
      g.uniforms.uSat.value = 1.06 - this.night * 0.12;
    }
    if (this.composer && this.settings && (this.settings.aa || this.settings.bloom || this.settings.ao || this.settings.dof)) this.composer.render();
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
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
