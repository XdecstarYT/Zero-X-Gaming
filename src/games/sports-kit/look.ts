import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

/**
 * The Sports+ look, shared by every sports game: a sharpening filmic grade,
 * a physically based sky by day and a light-polluted dome at night.
 */

export type TimeOfDay = "day" | "twilight" | "night";
export type Detail = "low" | "high" | "ultra";

/** Contrast-adaptive sharpening, a filmic S-curve, warm highlights, vignette. */
export const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, sharpen: { value: 0.6 }, warm: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 texel; uniform float sharpen; uniform float warm; varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      vec3 n = texture2D(tDiffuse, uv + vec2(0.0, texel.y)).rgb;
      vec3 s = texture2D(tDiffuse, uv - vec2(0.0, texel.y)).rgb;
      vec3 e = texture2D(tDiffuse, uv + vec2(texel.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, uv - vec2(texel.x, 0.0)).rgb;
      vec3 mn = min(c, min(min(n, s), min(e, w)));
      vec3 mx = max(c, max(max(n, s), max(e, w)));
      vec3 amp = clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0);
      vec3 wgt = -sqrt(amp) * mix(0.125, 0.2, sharpen);
      c = clamp((c + (n + s + e + w) * wgt) / (1.0 + 4.0 * wgt), 0.0, 1.0);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(vec3(0.97, 1.0, 1.03), vec3(1.03 + warm * 0.04, 1.0, 0.96 - warm * 0.04), smoothstep(0.1, 0.8, l));
      c = mix(vec3(l), c, 1.06);
      c = c * c * (3.0 - 2.0 * c) * 0.16 + c * 0.84;
      vec2 d = uv - 0.5;
      c *= 1.0 - dot(d, d) * 0.42;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** Preetham sky with clouds; `skyGain` sets its brightness against the exposure. */
export function physicalSky() {
  const sky = new Sky();
  const mat = sky.material as THREE.ShaderMaterial;
  mat.uniforms.skyGain = { value: 0.075 };
  mat.fragmentShader = mat.fragmentShader
    .replace("uniform float time;", "uniform float time;\nuniform float skyGain;")
    .replace("gl_FragColor = vec4( texColor, 1.0 );", "gl_FragColor = vec4( texColor * skyGain, 1.0 );");
  return sky;
}

/** Night dome: deep blue to a light-polluted horizon glow. */
export function nightDome() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `varying vec3 vDir; void main(){
        float h = max(vDir.y, 0.0);
        vec3 c = mix(vec3(0.16, 0.13, 0.12), vec3(0.012, 0.018, 0.04), pow(h, 0.35));
        gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
}

