import * as THREE from "three";

/**
 * Melbourne's sky: a scattering model that's cheap enough for a phone. Blue overhead deepening
 * away from the sun, a pale hazy horizon that burns orange and pink round the sun at either end of
 * the day, a Mie glow and a hot disc, then two layers of cloud on top: fat cumulus, lit from the
 * sun's side with a silver edge and shaded underneath, and high cirrus streaks. At night a moon,
 * stars, and the city's sodium glow along the horizon. Output is linear HDR (the sun blooms).
 */

const VS = `varying vec3 vDir;
void main(){
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;

const FS = `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uTime; uniform float uNight; uniform float uCloud; uniform float uRain; uniform float uSunH;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= 0.5; } return v; }
float fbm3(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 3; i++){ v += a * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= 0.5; } return v; }
float hg(float c, float g){ float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5) * 0.0796; }

vec3 skyCol(vec3 d, vec3 sd){
  float h = max(d.y, 0.0);
  float c = dot(d, sd);
  // Rayleigh: deeper blue up high and away from the sun; a bright milky band at the horizon.
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
  col *= 1.0 - 0.18 * (1.0 - c) * 0.5 * smoothstep(0.1, 0.9, h);
  col = mix(col, uHorizon * 1.12, exp(-h * 18.0) * 0.6);
  // Sunrise and sunset: warm the horizon round the sun, a pink belt opposite.
  float low = smoothstep(0.35, -0.05, uSunH) * (1.0 - uNight * 0.7);
  float az = max(c, 0.0);
  col = mix(col, vec3(1.0, 0.45, 0.18) * 1.4, low * pow(az, 3.0) * exp(-h * 6.0) * 0.85);
  col = mix(col, vec3(0.86, 0.55, 0.62), low * pow(max(-c, 0.0), 2.0) * exp(-h * 9.0) * 0.35);
  // Mie: the glow round the sun, wide and forward.
  col += uSunColor * (hg(c, 0.76) * 0.9 + hg(c, 0.25) * 0.15) * (1.0 - uNight) * (1.0 - uRain * 0.7);
  return col;
}

void main(){
  vec3 d = normalize(vDir);
  vec3 sd = normalize(uSunDir);
  float c = dot(d, sd);
  vec3 col = skyCol(d, sd);
  float h = d.y;
  // Below the horizon: the haze continues (the fog meets it).
  if (h < 0.0) col = mix(col, uHorizon * 0.92, clamp(-h * 6.0, 0.0, 1.0));
  // The sun disc (HDR, it blooms).
  float disc = smoothstep(0.99985, 0.99993, c);
  col += uSunColor * disc * 40.0 * (1.0 - uNight) * (1.0 - uCloud * 0.8);
  // The moon, opposite-ish, with a few maria.
  vec3 md = normalize(vec3(-sd.x, abs(sd.y) * 0.8 + 0.25, -sd.z));
  float mc = dot(d, md);
  if (uNight > 0.01 && mc > 0.9992) {
    vec2 mp = vec2(dot(d, normalize(cross(md, vec3(0.0, 1.0, 0.0)))), d.y - md.y) * 900.0;
    float maria = 0.75 + 0.25 * vn(mp * 0.35);
    col += vec3(1.0, 0.97, 0.9) * maria * smoothstep(0.9992, 0.9995, mc) * 2.2 * uNight;
  }
  col += vec3(0.6, 0.66, 0.85) * pow(max(mc, 0.0), 120.0) * 0.25 * uNight;
  if (h > 0.0) {
    // Stars on a clear night, twinkling.
    vec2 sp = d.xz / (h + 0.3) * 110.0;
    float star = step(0.9972, h21(floor(sp))) * smoothstep(0.06, 0.4, h) * uNight * (0.55 + 0.45 * sin(uTime * 2.3 + h21(floor(sp) + 3.1) * 40.0));
    col += vec3(star) * (1.0 - uCloud) * 1.4;
    // High cirrus: long, thin, combed by the wind.
    vec2 cu = d.xz / (h + 0.06) * 0.7 + vec2(uTime * 0.002, 0.0);
    float ci = fbm3(cu * vec2(0.6, 3.5)) * smoothstep(0.02, 0.2, h);
    ci = smoothstep(0.52, 0.85, ci) * 0.55 * (1.0 - uRain);
    vec3 ciCol = mix(vec3(1.0), uSunColor, 0.35) * (1.0 - uNight * 0.92) + uHorizon * 0.15;
    col = mix(col, ciCol, ci);
    // Cumulus on a plane: density from noise, light from a step toward the sun.
    vec2 uv = d.xz / (h + 0.08) * 1.25 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(uv);
    float cov = mix(0.62, 0.32, uCloud);
    float dens = smoothstep(cov, cov + 0.22, n);
    if (dens > 0.001) {
      float toward = fbm(uv + sd.xz * 0.18);
      float shade = clamp(1.0 - (toward - n) * 3.5, 0.25, 1.15);
      vec3 sunLit = uSunColor * (0.55 + hg(c, 0.6) * 2.6) * shade;
      vec3 amb = mix(uHorizon, uZenith, 0.5) * 0.85;
      vec3 cl = amb * (0.55 + 0.45 * dens) + sunLit * (1.0 - dens * 0.45);
      // Silver lining where the cloud is thin and the sun's behind it.
      cl += uSunColor * pow(max(c, 0.0), 12.0) * (1.0 - dens) * 1.6;
      // Rain cloud: heavy and grey.
      cl = mix(cl, vec3(0.32, 0.35, 0.4) * (0.6 + 0.4 * shade), uRain * 0.85);
      cl = mix(cl, uZenith * 0.35 + vec3(0.03, 0.03, 0.04), uNight * 0.9);
      // The city lights the cloud base orange at night.
      cl += vec3(0.35, 0.18, 0.06) * uNight * dens * exp(-h * 3.0) * 0.5;
      float a = dens * smoothstep(0.0, 0.08, h);
      col = mix(col, cl, a);
    }
  }
  // Sodium glow over the city on the horizon at night.
  col += vec3(0.45, 0.24, 0.1) * exp(-abs(h) * 14.0) * uNight * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;

export type SkyMesh = THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

export function makeMelbSky(): SkyMesh {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        uZenith: { value: new THREE.Color("#3f86d6") },
        uHorizon: { value: new THREE.Color("#bcd7ef") },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
        uSunColor: { value: new THREE.Color("#fff3dc") },
        uTime: { value: 0 },
        uNight: { value: 0 },
        uCloud: { value: 0.2 },
        uRain: { value: 0 },
        uSunH: { value: 0.5 },
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
