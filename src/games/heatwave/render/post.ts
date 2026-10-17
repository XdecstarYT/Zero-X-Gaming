import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Quality } from "./city";

/**
 * The frame after the scene: everything renders linear and HDR into a (multisampled) target with
 * depth, then
 *  1. the atmosphere: height fog that thickens toward the ground and lights up toward the sun,
 *     shafts of light through the towers, heat shimmer off the road on a hot day, and (on high)
 *     ambient occlusion from the depth buffer;
 *  2. bloom (medium and high);
 *  3. the film: filmic tone mapping, a teal-and-amber grade, contrast, vignette, a touch of lens
 *     fringing and grain, and dithering into sRGB.
 * Low does the film pass only (fog is three's own), so even phones get the grade.
 */

const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const ATMOS_FS = `
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform float uNear; uniform float uFar;
uniform mat4 uProjInv; uniform mat4 uViewInv;
uniform vec3 uCam; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uFogColor;
uniform float uDensity; uniform float uFalloff; uniform float uNight;
uniform vec2 uSunUv; uniform float uRays; uniform float uHaze; uniform float uTime; uniform float uAO;
uniform vec2 uTexel;
varying vec2 vUv;

vec3 worldAt(vec2 uv, float depth) {
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 v = uProjInv * ndc;
  v /= v.w;
  return (uViewInv * v).xyz;
}
float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }

void main() {
  vec2 uv = vUv;
  float depth = texture2D(tDepth, uv).x;
  bool sky = depth >= 0.99999;
  vec3 P = worldAt(uv, depth);
  vec3 rd = P - uCam;
  float dist = sky ? 3000.0 : length(rd);
  rd /= max(length(rd), 1e-4);
  // Heat shimmer: low over the ground, far off, on a hot clear day.
  if (uHaze > 0.0 && !sky) {
    float k = uHaze * smoothstep(60.0, 380.0, dist) * smoothstep(14.0, 0.0, P.y);
    uv.x += sin(uv.y * 380.0 + uTime * 7.0) * 0.0011 * k;
    uv.y += sin(uv.x * 260.0 - uTime * 5.0) * 0.0006 * k;
  }
  vec3 col = texture2D(tColor, uv).rgb;
#ifdef USE_AO
  if (!sky && dist < 160.0) {
    // A ring of depth taps round the pixel, a metre and a bit out in the world.
    float z0 = viewZ(vUv);
    float r = clamp(1.4 / z0, 0.002, 0.04);
    float occ = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 2.39996 + fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5) * 6.28;
      vec2 o = vec2(cos(a), sin(a)) * r * (0.35 + float(i) / 8.0) * vec2(uTexel.y / uTexel.x, 1.0);
      float dz = z0 - viewZ(vUv + o);
      occ += smoothstep(0.08, 0.6, dz) * (1.0 - smoothstep(1.6, 3.2, dz));
    }
    col *= 1.0 - uAO * occ / 8.0 * (1.0 - smoothstep(60.0, 160.0, dist));
  }
#endif
  // Height fog (integrated along the ray), coloured by the sky and lit toward the sun.
  float sunAmt = pow(max(dot(rd, normalize(uSunDir)), 0.0), 8.0);
  vec3 fogCol = uFogColor + uSunColor * sunAmt * 0.25 * (1.0 - uNight);
  float dy = rd.y;
  float base = uDensity * exp(-uFalloff * max(uCam.y, 0.0));
  float L = min(dist, 2400.0);
  float fogAmt = abs(dy) > 1e-3 ? base * (1.0 - exp(-uFalloff * dy * L)) / (uFalloff * dy) : base * L;
  float f = 1.0 - exp(-max(fogAmt, 0.0));
  if (sky) f *= smoothstep(0.25, 0.0, rd.y) * 0.6;
  col = mix(col, fogCol, clamp(f, 0.0, 1.0));
  // Light shafts: march toward the sun on screen, counting sky that gets through.
  if (uRays > 0.0) {
    vec2 delta = (uSunUv - vUv) / float(RAY_STEPS) * 0.85;
    vec2 p = vUv;
    float w = 1.0;
    float acc = 0.0;
    for (int i = 0; i < RAY_STEPS; i++) {
      p += delta;
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) break;
      acc += step(0.99999, texture2D(tDepth, p).x) * w;
      w *= 0.94;
    }
    acc /= float(RAY_STEPS) * 0.45;
    float fall = 1.0 - smoothstep(0.0, 0.9, length((uSunUv - vUv) * vec2(uTexel.y / uTexel.x, 1.0)));
    col += uSunColor * acc * fall * uRays;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const FILM_FS = `
uniform sampler2D tColor; uniform float uExposure; uniform float uTime; uniform vec2 uTexel;
uniform float uSat; uniform float uContrast; uniform float uVignette; uniform float uGrain; uniform float uFringe;
uniform vec3 uShadow; uniform vec3 uHigh; uniform float uSplit;
varying vec2 vUv;
// ACES (Stephen Hill's fit), as three does it.
vec3 hwFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 hwAces(vec3 c) {
  const mat3 i = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 o = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= uExposure / 0.6;
  c = i * c;
  c = hwFit(c);
  c = o * c;
  return clamp(c, 0.0, 1.0);
}
vec3 hwSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 q = vUv - 0.5;
  // Lens fringing toward the corners.
  vec2 off = q * dot(q, q) * uFringe;
  vec3 c;
  c.r = texture2D(tColor, vUv + off).r;
  c.g = texture2D(tColor, vUv).g;
  c.b = texture2D(tColor, vUv - off).b;
  c = hwAces(c);
  // Grade: split toning (cool shadows, warm highlights), saturation, an S-curve.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(uShadow, uHigh, smoothstep(0.05, 0.75, l)) * uSplit + (1.0 - uSplit);
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  c *= 1.0 - dot(q, q) * uVignette;
  c = hwSRGB(clamp(c, 0.0, 1.0));
  float n = fract(sin(dot(vUv * 1000.0 + fract(uTime) * 61.7, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * uGrain;
  c += (fract(sin(dot(vUv, vec2(41.3, 289.1))) * 9871.2) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export interface AtmosParams {
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  fogColor: THREE.Color;
  density: number;
  night: number;
  haze: number;
  time: number;
  exposure: number;
}

export class Post {
  private scene: THREE.WebGLRenderTarget;
  private mid: THREE.WebGLRenderTarget | null = null;
  private atmos: FullScreenQuad | null = null;
  private film: FullScreenQuad;
  private bloom: UnrealBloomPass | null = null;
  private v = new THREE.Vector3();

  constructor(
    private renderer: THREE.WebGLRenderer,
    readonly quality: Quality,
  ) {
    const full = quality !== "low";
    this.scene = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: quality === "high" ? 4 : quality === "medium" ? 2 : 0,
      ...(full ? { depthTexture: new THREE.DepthTexture(1, 1) } : {}),
    });
    if (full) {
      this.mid = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
      this.atmos = new FullScreenQuad(
        new THREE.ShaderMaterial({
          vertexShader: QUAD_VS,
          fragmentShader: ATMOS_FS,
          defines: { RAY_STEPS: quality === "high" ? 28 : 14, ...(quality === "high" ? { USE_AO: "" } : {}) },
          uniforms: {
            tColor: { value: null },
            tDepth: { value: null },
            uNear: { value: 0.1 },
            uFar: { value: 1000 },
            uProjInv: { value: new THREE.Matrix4() },
            uViewInv: { value: new THREE.Matrix4() },
            uCam: { value: new THREE.Vector3() },
            uSunDir: { value: new THREE.Vector3() },
            uSunColor: { value: new THREE.Color() },
            uFogColor: { value: new THREE.Color() },
            uDensity: { value: 0.0016 },
            uFalloff: { value: 0.011 },
            uNight: { value: 0 },
            uSunUv: { value: new THREE.Vector2() },
            uRays: { value: 0 },
            uHaze: { value: 0 },
            uTime: { value: 0 },
            uAO: { value: 0.55 },
            uTexel: { value: new THREE.Vector2() },
          },
          depthTest: false,
          depthWrite: false,
        }),
      );
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.55, 1.15);
    }
    this.film = new FullScreenQuad(
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VS,
        fragmentShader: FILM_FS,
        uniforms: {
          tColor: { value: null },
          uExposure: { value: 1 },
          uTime: { value: 0 },
          uTexel: { value: new THREE.Vector2() },
          uSat: { value: 1.06 },
          uContrast: { value: 0.2 },
          uVignette: { value: 0.38 },
          uGrain: { value: 0.012 },
          uFringe: { value: 0.006 },
          uShadow: { value: new THREE.Vector3(0.96, 1.0, 1.04) },
          uHigh: { value: new THREE.Vector3(1.03, 1.0, 0.96) },
          uSplit: { value: 1 },
        },
        depthTest: false,
        depthWrite: false,
      }),
    );
  }

  setSize(w: number, h: number) {
    this.scene.setSize(w, h);
    this.mid?.setSize(w, h);
    // Bloom at half (high) or a quarter (medium) of the frame.
    const k = this.quality === "high" ? 0.5 : 0.25;
    this.bloom?.setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
    const t = new THREE.Vector2(1 / w, 1 / h);
    (this.film.material as THREE.ShaderMaterial).uniforms.uTexel.value.copy(t);
    if (this.atmos) (this.atmos.material as THREE.ShaderMaterial).uniforms.uTexel.value.copy(t);
  }

  /** Compile a scene's shaders for the target it's drawn into, in parallel where the GPU allows. */
  async compile(scene: THREE.Scene, cam: THREE.Camera) {
    const r = this.renderer;
    r.setRenderTarget(this.scene);
    const ready = r.compileAsync(scene, cam);
    r.setRenderTarget(null);
    await ready;
  }

  render(scene: THREE.Scene, cam: THREE.PerspectiveCamera, p: AtmosParams) {
    const r = this.renderer;
    r.setRenderTarget(this.scene);
    r.render(scene, cam);
    let src: THREE.WebGLRenderTarget = this.scene;
    if (this.atmos && this.mid) {
      const u = (this.atmos.material as THREE.ShaderMaterial).uniforms;
      u.tColor.value = this.scene.texture;
      u.tDepth.value = this.scene.depthTexture;
      u.uNear.value = cam.near;
      u.uFar.value = cam.far;
      u.uProjInv.value.copy(cam.projectionMatrixInverse);
      u.uViewInv.value.copy(cam.matrixWorld);
      u.uCam.value.copy(cam.position);
      u.uSunDir.value.copy(p.sunDir);
      u.uSunColor.value.copy(p.sunColor);
      u.uFogColor.value.copy(p.fogColor);
      u.uDensity.value = p.density;
      u.uNight.value = p.night;
      u.uHaze.value = p.haze;
      u.uTime.value = p.time;
      // Where the sun is on screen; shafts only when it's up and in front of us.
      this.v.copy(p.sunDir).multiplyScalar(1000).add(cam.position).project(cam);
      const facing = cam.getWorldDirection(new THREE.Vector3()).dot(p.sunDir);
      u.uSunUv.value.set(this.v.x * 0.5 + 0.5, this.v.y * 0.5 + 0.5);
      u.uRays.value = facing > 0.1 && p.sunDir.y > 0.02 ? 0.26 * Math.min(1, (facing - 0.1) * 2.5) * (1 - p.night) : 0;
      r.setRenderTarget(this.mid);
      this.atmos.render(r);
      src = this.mid;
      if (this.bloom) this.bloom.render(r, null as unknown as THREE.WebGLRenderTarget, this.mid, 0, false);
    }
    const f = (this.film.material as THREE.ShaderMaterial).uniforms;
    f.tColor.value = src.texture;
    f.uExposure.value = p.exposure;
    f.uTime.value = p.time;
    r.setRenderTarget(null);
    this.film.render(r);
  }

  set bloomStrength(v: number) {
    if (this.bloom) this.bloom.strength = v;
  }

  dispose() {
    this.scene.dispose();
    this.scene.depthTexture?.dispose();
    this.mid?.dispose();
    this.atmos?.dispose();
    (this.atmos?.material as THREE.Material | undefined)?.dispose();
    this.film.dispose();
    (this.film.material as THREE.Material).dispose();
    this.bloom?.dispose();
  }
}
