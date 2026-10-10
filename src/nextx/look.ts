/**
 * NextX Engine · the look. A sky dome with a sun disc, a soft halo, drifting clouds and stars at
 * night; the colours of the sky and the light from dawn to dark, keyed on the sun's height; and a
 * colour grade with a vignette for the end of a post chain. Grown from Zero City's sky so every
 * NextX title shares one light. WareForge uses it.
 */
import * as THREE from "three";

const SKY_VS = `varying vec3 vDir;
void main(){
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;

const SKY_FS = `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uSunSize; uniform float uTime; uniform float uNight; uniform float uCloud;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  // A bright, hazy horizon band fading up into a deeper zenith; the ground below the horizon.
  vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5)) : mix(uHorizon, uGround, clamp(-h * 4.0, 0.0, 1.0));
  col = mix(col, uHorizon * 1.06, exp(-max(h, 0.0) * 14.0) * 0.5);
  vec3 sd = normalize(uSunDir);
  float s = max(dot(d, sd), 0.0);
  // Sun disc, a soft halo and a wide forward glow.
  col += uSunColor * (pow(s, 900.0 / uSunSize) * 3.0 + pow(s, 24.0) * 0.28 + pow(s, 4.0) * 0.1);
  if (h > 0.0) {
    // Stars on a clear night.
    vec2 sp = d.xz / (h + 0.35) * 90.0;
    float star = step(0.9965, h21(floor(sp))) * smoothstep(0.05, 0.35, h) * uNight * (0.6 + 0.4 * sin(uTime * 2.0 + h21(floor(sp) + 3.1) * 40.0));
    col += vec3(star) * (1.0 - uCloud * 0.8);
    // Soft drifting cumulus, lit from the sun's side.
    vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv);
    float cov = smoothstep(0.56 - uCloud * 0.3, 0.8 - uCloud * 0.2, n) * smoothstep(0.0, 0.12, h);
    float lit = 0.75 + 0.35 * fbm(uv + sd.xz * 0.35);
    vec3 cloud = mix(uHorizon, vec3(1.0), 0.65 - uCloud * 0.35) * lit + uSunColor * pow(s, 6.0) * 0.4;
    cloud = mix(cloud, uZenith * 0.5 + uHorizon * 0.15, uNight * 0.85);
    col = mix(col, cloud, cov * (0.85 + uCloud * 0.15));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export type SkyMesh = THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

/** The sky dome. Keep it centred on the camera; it always draws behind everything. */
export function makeSky(): SkyMesh {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      uniforms: {
        uZenith: { value: new THREE.Color("#3f86d6") },
        uHorizon: { value: new THREE.Color("#bcd7ef") },
        uGround: { value: new THREE.Color("#55644a") },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
        uSunColor: { value: new THREE.Color("#fff3dc") },
        uSunSize: { value: 1 },
        uTime: { value: 0 },
        uNight: { value: 0 },
        /** 0 fair weather … 1 overcast. */
        uCloud: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

export interface SkyLight {
  zenith: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  /** Sun (or moon) and hemisphere intensities. */
  sunI: number;
  hemiI: number;
}

/** Keys on the sun's height (sine of its elevation): night, dusk, golden hour, day. */
const KEYS: [number, string, string, string, number, number][] = [
  [-1, "#04060d", "#121829", "#7d8fc8", 0.32, 0.22],
  [-0.12, "#0b1020", "#262a44", "#8090c8", 0.3, 0.24],
  [-0.02, "#33466f", "#e58a5f", "#ff7a3c", 0.7, 0.36],
  [0.1, "#4e7fbf", "#f1c08c", "#ffb46a", 2.1, 0.55],
  [0.32, "#3f86d6", "#bcd7ef", "#fff1d8", 3.0, 0.72],
  [1, "#3b82d4", "#c4dbef", "#fff4e0", 3.1, 0.75],
];
const ca = new THREE.Color();
const cb = new THREE.Color();

/** The sky's colours and the light for a sun at this height (sine of the elevation, −1 … 1). */
export function skyFor(sunHeight: number, out: SkyLight = { zenith: new THREE.Color(), horizon: new THREE.Color(), sun: new THREE.Color(), sunI: 0, hemiI: 0 }): SkyLight {
  const x = Math.max(-1, Math.min(1, sunHeight));
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= x) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
  const s = t * t * (3 - 2 * t);
  out.zenith.copy(ca.set(a[1])).lerp(cb.set(b[1]), s);
  out.horizon.copy(ca.set(a[2])).lerp(cb.set(b[2]), s);
  out.sun.copy(ca.set(a[3])).lerp(cb.set(b[3]), s);
  out.sunI = a[4] + (b[4] - a[4]) * s;
  out.hemiI = a[5] + (b[5] - a[5]) * s;
  return out;
}

/** Image-based light from the sky, recaptured when the light has moved on. */
export class SkyEnvironment {
  private pmrem: THREE.PMREMGenerator;
  private scene = new THREE.Scene();
  private rt: THREE.WebGLRenderTarget | null = null;
  private key = "";

  constructor(
    renderer: THREE.WebGLRenderer,
    sky: SkyMesh,
    private size = 64,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    const copy = new THREE.Mesh(sky.geometry, sky.material);
    copy.scale.setScalar(50);
    this.scene.add(copy);
  }

  /** Recapture if `key` changed (a rounded time of day, say); returns the texture to light with. */
  update(key: string): THREE.Texture | null {
    if (key !== this.key) {
      this.key = key;
      // The sky is smooth, so a small capture lights and reflects as well as a big one.
      const rt = this.pmrem.fromScene(this.scene, 0.04, 0.1, 100, { size: this.size });
      this.rt?.dispose();
      this.rt = rt;
    }
    return this.rt?.texture ?? null;
  }

  dispose() {
    this.rt?.dispose();
    this.pmrem.dispose();
  }
}

/** Colour grade (saturation, contrast, a warm or cool cast) and a vignette, after tone mapping. */
export const GRADE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSat: { value: 1.08 },
    uContrast: { value: 1.05 },
    uWarm: { value: 0.02 },
    uVignette: { value: 0.36 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
uniform sampler2D tDiffuse; uniform float uSat; uniform float uContrast; uniform float uWarm; uniform float uVignette;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  c *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.3, 1.0 - uWarm);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * uVignette;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
};
