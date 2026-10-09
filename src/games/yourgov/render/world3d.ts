/**
 * The country in 3D: the terrain under a real sky, the sea with its shallows and surf,
 * drifting clouds and their shadows, cities of instanced buildings, and the politics painted
 * onto the land county by county (with crisp county and state borders at any zoom).
 *
 * The overlay is a palette lookup: every surface pixel knows its county (a label texture), and
 * a 1-row palette texture says what colour each county is today. Recolouring the whole map
 * (an election count frame, a new poll) only rewrites that one small row.
 */
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { MAP_H, MAP_W, type Country } from "../map";
import { Rig } from "./rig";
import type { TerrainBundle } from "./loadTerrain";

const W = MAP_W;
const H = MAP_H;
/** Direction the sunlight comes from (toward the sun), matching the baked shading. */
const SUN = new THREE.Vector3(-0.55, 0.62, -0.55).normalize();
export const PAL = 2048;

/** A map label: a region's name or a city's, with how much it matters and how wide it is. */
interface LabelEl {
  el: HTMLElement;
  p: THREE.Vector3;
  kind: "state" | "city";
  id: number;
  size: number;
  w: number;
}

export interface WorldOverlay {
  /** Per county: r, g, b (sRGB 0–255) and strength 0–255. */
  colors: Uint8Array;
  selectedState: number;
  hoverCounty: number;
}

const srgbToLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export class WorldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.5, 6000);
  readonly rig: Rig;
  private sun = new THREE.DirectionalLight(0xfff3e0, 3.6);
  private terrainMat: THREE.MeshStandardMaterial | null = null;
  private water: THREE.Mesh | null = null;
  private clouds: THREE.Mesh | null = null;
  private uniforms = {
    tLabel: { value: null as THREE.Texture | null },
    uLabelSize: { value: new THREE.Vector2(1, 1) },
    tPal: { value: null as THREE.Texture | null },
    tStateOf: { value: null as THREE.Texture | null },
    uOverlay: { value: 1 },
    uSel: { value: -1 },
    uHover: { value: -1 },
    tCloud: { value: null as THREE.Texture | null },
    uCloudOff: { value: new THREE.Vector2() },
    uCloudShadow: { value: 0.32 },
  };
  private palData = new Uint8Array(PAL * 4);
  private palTex: THREE.DataTexture;
  private heights: Float32Array | null = null;
  private gw = 0;
  private gh = 0;
  private step = 1;
  private labelData: Uint8Array | null = null;
  private tw = 0;
  private th = 0;
  private borders: TerrainBundle["terrain"]["borders"] | null = null;
  private countyLines: THREE.LineSegments | null = null;
  private stateRibbons: THREE.Mesh[] = [];
  private selRibbon: THREE.Mesh | null = null;
  private selFor = -2;
  private ribbonWidth = { value: 1 };
  private overlayBase = 1;
  private labelEls: LabelEl[] = [];
  private time = 0;
  ready = false;
  cloudsOn = true;
  bordersOn = true;

  constructor(
    private country: Country,
    private quality: "high" | "low",
    readonly labelRoot: HTMLElement | null,
  ) {
    this.rig = new Rig(
      { minDist: 18, maxDist: 560, minPitch: 0.42, maxPitch: 1.45, bounds: { x0: -W / 2 - 20, z0: -H / 2 - 20, x1: W / 2 + 20, z1: H / 2 + 20 } },
      { target: new THREE.Vector3(0, 0, 18), dist: 470, yaw: 0, pitch: 0.95 },
    );
    this.palTex = new THREE.DataTexture(this.palData, PAL, 1, THREE.RGBAFormat);
    this.palTex.needsUpdate = true;
    this.uniforms.tPal.value = this.palTex;
    const stateOf = new Uint8Array(PAL);
    country.sections.forEach((s) => (stateOf[s.id] = s.state));
    const st = new THREE.DataTexture(stateOf, PAL, 1, THREE.RedFormat);
    st.needsUpdate = true;
    this.uniforms.tStateOf.value = st;
    this.buildSky();
  }

  // ------------------------------------------------------------------ sky, light, sea

  private buildSky() {
    const sky = new Sky();
    sky.scale.setScalar(5000);
    const u = sky.material.uniforms;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.25;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(SUN).multiplyScalar(1000);
    this.scene.add(sky);
    // A hazy horizon: the far sea fades into the sky's own colour.
    const horizon = new THREE.Color(0.66, 0.76, 0.86);
    this.scene.fog = new THREE.FogExp2(horizon, 0.0005);
    this.scene.background = horizon;
    this.sun.position.copy(SUN).multiplyScalar(500);
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x5b4a33, 0.5));
    if (this.quality === "high") {
      this.sun.castShadow = true;
      const s = this.sun.shadow;
      s.mapSize.set(4096, 4096);
      const cam = s.camera as THREE.OrthographicCamera;
      cam.left = -300;
      cam.right = 300;
      cam.top = 300;
      cam.bottom = -300;
      cam.near = 50;
      cam.far = 1200;
      s.bias = -0.0004;
      s.normalBias = 0.35;
    }
  }

  /** Bake the sky into an environment map (reflections and soft fill light). */
  bakeEnvironment(renderer: THREE.WebGLRenderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const sky = new Sky();
    sky.scale.setScalar(100);
    sky.material.uniforms.sunPosition.value.copy(SUN).multiplyScalar(100);
    sky.material.uniforms.turbidity.value = 3.2;
    sky.material.uniforms.rayleigh.value = 1.25;
    envScene.add(sky);
    const rt = pm.fromScene(envScene, 0, 0.1, 300);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.4;
    pm.dispose();
  }

  // ------------------------------------------------------------------ the land

  /** Build the meshes once the terrain has arrived. */
  setTerrain(b: TerrainBundle, maxAnisotropy: number) {
    const t = b.terrain;
    this.heights = t.heights;
    this.gw = t.gw;
    this.gh = t.gh;
    this.step = t.step;
    this.labelData = t.labels;
    this.tw = t.tw;
    this.th = t.th;

    // Surface texture: the painted ground, with rivers and highways drawn on top.
    const cv = document.createElement("canvas");
    cv.width = t.tw;
    cv.height = t.th;
    const g = cv.getContext("2d")!;
    g.putImageData(new ImageData(new Uint8ClampedArray(t.albedo.buffer as ArrayBuffer, t.albedo.byteOffset, t.albedo.length), t.tw, t.th), 0, 0);
    const T = t.tw / W;
    g.lineCap = "round";
    g.lineJoin = "round";
    // Rivers widen downstream; drawn in short overlapping runs so the width can grow.
    for (const r of t.rivers) {
      for (let k = 1; k < r.length; k++) {
        const f = k / r.length;
        g.strokeStyle = `rgba(${Math.round(52 - f * 14)},${Math.round(84 - f * 10)},${Math.round(96 + f * 4)},0.92)`;
        g.lineWidth = (0.14 + f * 0.62) * T;
        g.beginPath();
        g.moveTo(r[k - 1].x * T, r[k - 1].y * T);
        g.lineTo(r[k].x * T, r[k].y * T);
        g.stroke();
      }
    }
    for (const road of t.roads) {
      for (const [col, w] of [
        ["rgba(70,68,64,0.55)", 0.42],
        ["rgba(205,198,184,0.95)", 0.22],
      ] as const) {
        g.strokeStyle = col;
        g.lineWidth = w * T;
        g.beginPath();
        g.moveTo(road[0].x * T, road[0].y * T);
        for (let k = 1; k < road.length - 1; k++) g.quadraticCurveTo(road[k].x * T, road[k].y * T, (road[k].x + road[k + 1].x) * 0.5 * T, (road[k].y + road[k + 1].y) * 0.5 * T);
        g.lineTo(road[road.length - 1].x * T, road[road.length - 1].y * T);
        g.stroke();
      }
    }
    const albedo = new THREE.CanvasTexture(cv);
    albedo.colorSpace = THREE.SRGBColorSpace;
    albedo.flipY = false;
    albedo.anisotropy = maxAnisotropy;
    albedo.generateMipmaps = true;
    albedo.minFilter = THREE.LinearMipmapLinearFilter;

    const lab = new THREE.DataTexture(t.labels, t.tw, t.th, THREE.RGFormat);
    lab.magFilter = THREE.NearestFilter;
    lab.minFilter = THREE.NearestFilter;
    lab.needsUpdate = true;
    this.uniforms.tLabel.value = lab;
    this.uniforms.uLabelSize.value.set(t.tw, t.th);

    // The terrain mesh, its UVs running with the map (row 0 is the north edge).
    const geo = new THREE.PlaneGeometry(W, H, t.gw - 1, t.gh - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let j = 0; j < t.gh; j++)
      for (let i = 0; i < t.gw; i++) {
        const k = j * t.gw + i;
        pos.setY(k, t.heights[k]);
        uv.setXY(k, i / (t.gw - 1), j / (t.gh - 1));
      }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: albedo, roughness: 0.93, metalness: 0, envMapIntensity: 0.45 });
    this.patchTerrain(mat);
    this.terrainMat = mat;
    const land = new THREE.Mesh(geo, mat);
    land.receiveShadow = this.quality === "high";
    land.castShadow = this.quality === "high";
    this.scene.add(land);

    // Clouds.
    const ct = new THREE.DataTexture(b.clouds, Math.sqrt(b.clouds.length), Math.sqrt(b.clouds.length), THREE.RedFormat);
    ct.wrapS = THREE.RepeatWrapping;
    ct.wrapT = THREE.RepeatWrapping;
    ct.magFilter = THREE.LinearFilter;
    ct.minFilter = THREE.LinearFilter;
    ct.needsUpdate = true;
    this.uniforms.tCloud.value = ct;

    this.buildSea(t);
    this.buildClouds(ct);
    this.buildCities(t);
    this.buildBorders(t);
    this.buildLabels();
    this.ready = true;
  }

  /** Paint the politics onto the ground: palette colour, borders, selection, cloud shadows. */
  private patchTerrain(mat: THREE.MeshStandardMaterial) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vYG;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvYG = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vYG;
uniform sampler2D tLabel; uniform vec2 uLabelSize; uniform sampler2D tPal; uniform sampler2D tStateOf;
uniform float uOverlay; uniform float uSel; uniform float uHover;
uniform sampler2D tCloud; uniform vec2 uCloudOff; uniform float uCloudShadow;
float ygId(vec2 uv) {
  ivec2 p = clamp(ivec2(uv * uLabelSize), ivec2(0), ivec2(uLabelSize) - 1);
  vec4 t = texelFetch(tLabel, p, 0);
  return floor(t.r * 255.0 + 0.5) + floor(t.g * 255.0 + 0.5) * 256.0;
}
float ygState(float id) { return floor(texelFetch(tStateOf, ivec2(int(id), 0), 0).r * 255.0 + 0.5); }`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
{
  vec2 luv = vMapUv;
  float id = ygId(luv);
  float land = smoothstep(-0.25, 0.05, vYG.y);
  if (id < 65000.0 && land > 0.0) {
    vec4 pc = texelFetch(tPal, ivec2(int(id), 0), 0);
    float st = ygState(id);
    vec3 col = diffuseColor.rgb;
    // Tint, keeping the ground's light and shade so the land still reads through.
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 tint = pc.rgb * (0.42 + 1.5 * lum);
    col = mix(col, tint, pc.a * uOverlay * land);
    if (abs(st - uSel) < 0.5) col = col * 1.14 + vec3(0.02);
    if (abs(id - uHover) < 0.5) col = col * 1.12 + vec3(0.02);
    diffuseColor.rgb = col;
  }
  // Shadows of the clouds drifting overhead.
  vec2 cuv = (vYG.xz + vec2(${(SUN.x / SUN.y).toFixed(3)}, ${(SUN.z / SUN.y).toFixed(3)}) * 34.0) / 420.0 + uCloudOff;
  float cl = texture2D(tCloud, cuv).r;
  diffuseColor.rgb *= 1.0 - uCloudShadow * smoothstep(0.25, 0.85, cl);
}`,
        );
    };
  }

  private buildSea(t: TerrainBundle["terrain"]) {
    // Depth below the surface across the map (deep everywhere beyond it).
    const d = new Uint8Array(t.gw * t.gh);
    for (let k = 0; k < d.length; k++) d[k] = Math.round(Math.min(1, Math.max(0, -t.heights[k] / 12)) * 255);
    const depth = new THREE.DataTexture(d, t.gw, t.gh, THREE.RedFormat);
    depth.magFilter = THREE.LinearFilter;
    depth.minFilter = THREE.LinearFilter;
    depth.needsUpdate = true;
    const fog = this.scene.fog as THREE.FogExp2;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        tDepth: { value: depth },
        uTime: { value: 0 },
        uSun: { value: SUN.clone() },
        uSunCol: { value: new THREE.Color(1.0, 0.95, 0.85) },
        uSkyH: { value: new THREE.Color(0.62, 0.73, 0.84) },
        uSkyZ: { value: new THREE.Color(0.2, 0.42, 0.72) },
        uFog: { value: fog.color },
        uFogD: { value: fog.density },
      },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
varying vec3 vW;
uniform sampler2D tDepth; uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSkyH; uniform vec3 uSkyZ; uniform vec3 uFog; uniform float uFogD;
float depthAt(vec2 xz) {
  vec2 uv = xz / vec2(${W.toFixed(1)}, ${H.toFixed(1)}) + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 12.0;
  return texture2D(tDepth, uv).r * 12.0;
}
vec2 wave(vec2 p, vec2 dir, float k, float sp, float a) { float ph = dot(p, dir) * k + uTime * sp; return dir * cos(ph) * a * k; }
void main() {
  float d = depthAt(vW.xz);
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  // Swell from a few directions, calmer with distance (no shimmer far away).
  vec2 g = wave(vW.xz, normalize(vec2(0.8, 0.6)), 0.9, 1.1, 0.05) + wave(vW.xz, normalize(vec2(-0.3, 0.95)), 1.7, 1.6, 0.03)
         + wave(vW.xz, normalize(vec2(0.95, -0.2)), 3.1, 2.3, 0.015) + wave(vW.xz, normalize(vec2(-0.7, -0.7)), 5.3, 3.1, 0.008);
  g *= 1.0 / (1.0 + dist * 0.006);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uSkyH, uSkyZ, pow(clamp(R.y, 0.0, 1.0), 0.45));
  float sd = max(dot(R, uSun), 0.0);
  vec3 spec = uSunCol * (pow(sd, 700.0) * 8.0 + pow(sd, 60.0) * 0.18);
  vec3 deep = vec3(0.008, 0.06, 0.11);
  vec3 shallow = vec3(0.035, 0.24, 0.27);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 4.0, d));
  vec3 col = mix(body, sky, fres) + spec;
  // A thin line of surf where it meets the shore, breaking unevenly along the beach.
  float shore = 1.0 - smoothstep(0.0, 0.12, d);
  float surf = shore * (0.45 + 0.55 * sin(vW.x * 1.7 + uTime * 0.9) * sin(vW.z * 1.3 - uTime * 0.7));
  col = mix(col, vec3(0.9, 0.93, 0.94), clamp(surf, 0.0, 1.0) * 0.4);
  float alpha = clamp(mix(0.62, 1.0, smoothstep(0.0, 2.5, d)) + fres * 0.4, 0.0, 1.0);
  float f = 1.0 - exp(-uFogD * uFogD * dist * dist);
  col = mix(col, uFog, f);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), mat);
    sea.renderOrder = 1;
    this.water = sea;
    this.scene.add(sea);
  }

  private buildClouds(ct: THREE.Texture) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { tCloud: { value: ct }, uOff: this.uniforms.uCloudOff, uOpacity: { value: 0.8 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
varying vec3 vW; uniform sampler2D tCloud; uniform vec2 uOff; uniform float uOpacity;
void main() {
  float c = texture2D(tCloud, vW.xz / 420.0 + uOff).r;
  float a = smoothstep(0.2, 0.9, c);
  // Fade out toward the edges of the layer and when the camera is close to it.
  float edge = 1.0 - smoothstep(330.0, 520.0, length(vW.xz * vec2(0.8, 1.1)));
  float near = smoothstep(40.0, 160.0, distance(cameraPosition, vW));
  vec3 col = mix(vec3(0.78, 0.81, 0.86), vec3(1.0), smoothstep(0.3, 1.0, c));
  gl_FragColor = vec4(col, a * uOpacity * edge * near);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1000).rotateX(-Math.PI / 2), mat);
    m.position.y = 34;
    m.renderOrder = 3;
    this.clouds = m;
    this.scene.add(m);
  }

  private buildCities(t: TerrainBundle["terrain"]) {
    const n = t.buildings.length;
    if (!n) return;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05, envMapIntensity: 0.6 });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tones = ["#8f8a83", "#7a7772", "#9b968e", "#6f7680", "#85796c", "#a39d93", "#5f646b", "#8c5e48"].map((h) => new THREE.Color(h));
    const c = new THREE.Color();
    t.buildings.forEach((b, i) => {
      const y = this.heightAt(b.x, b.y);
      m.compose(new THREE.Vector3(b.x - W / 2, y - 0.02, b.y - H / 2), q, new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
      c.copy(tones[Math.floor(b.tone * tones.length) % tones.length]);
      if (b.h > 0.6) c.lerp(new THREE.Color("#66788a"), 0.35);
      mesh.setColorAt(i, c);
    });
    mesh.castShadow = this.quality === "high";
    mesh.receiveShadow = this.quality === "high";
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  // ------------------------------------------------------------------ borders

  /** A polyline laid on the ground: subdivided so it follows the hills, lifted a little. */
  private drape(pts: Float32Array, start: number, count: number, lift: number) {
    const out: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      const ax = pts[(start + i) * 2];
      const ay = pts[(start + i) * 2 + 1];
      const bx = pts[(start + i + 1) * 2];
      const by = pts[(start + i + 1) * 2 + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.2));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const y = ay + ((by - ay) * k) / n;
        out.push(x - W / 2, Math.max(0, this.heightAt(x, y)) + lift, y - H / 2);
      }
    }
    return out;
  }

  /** A flat ribbon along draped polylines whose width (in world units) is set each frame. */
  private ribbon(lines: number[][], color: THREE.ColorRepresentation, opacity: number, widthScale: number, order: number) {
    const pos: number[] = [];
    const dir: number[] = [];
    const side: number[] = [];
    const idx: number[] = [];
    for (const l of lines) {
      const n = l.length / 3;
      if (n < 2) continue;
      const base = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const p = Math.max(0, i - 1);
        const q = Math.min(n - 1, i + 1);
        let dx = l[q * 3] - l[p * 3];
        let dz = l[q * 3 + 2] - l[p * 3 + 2];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L;
        dz /= L;
        for (const sd of [-1, 1]) {
          pos.push(l[i * 3], l[i * 3 + 1], l[i * 3 + 2]);
          dir.push(dx, dz);
          side.push(sd);
        }
        if (i < n - 1) {
          const a = base + i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("dir", new THREE.Float32BufferAttribute(dir, 2));
    geo.setAttribute("side", new THREE.Float32BufferAttribute(side, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uWidth: this.ribbonWidth, uScale: { value: widthScale }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: `attribute vec2 dir; attribute float side; uniform float uWidth; uniform float uScale;
void main(){ vec3 p = position; p.xz += vec2(-dir.y, dir.x) * side * uWidth * uScale; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; void main(){ gl_FragColor = vec4(uColor, uOpacity);
  #include <colorspace_fragment>
}`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order;
    m.frustumCulled = false;
    return m;
  }

  private buildBorders(t: TerrainBundle["terrain"]) {
    const b = t.borders;
    this.borders = b;
    const county: number[] = [];
    const states: number[][] = [];
    for (let i = 0; i < b.start.length; i++) {
      if (b.kind[i] === 2) continue;
      const d = this.drape(b.pts, b.start[i], b.count[i], 0.12);
      if (b.kind[i] === 1) states.push(d);
      else for (let k = 0; k < d.length / 3 - 1; k++) county.push(d[k * 3], d[k * 3 + 1], d[k * 3 + 2], d[k * 3 + 3], d[k * 3 + 4], d[k * 3 + 5]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(county, 3));
    this.countyLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.countyLines.renderOrder = 2;
    this.scene.add(this.countyLines);
    // State borders: a pale casing under a dark line.
    this.stateRibbons = [this.ribbon(states, 0xffffff, 0.35, 2.4, 2), this.ribbon(states, 0x15171c, 0.8, 1, 2)];
    for (const r of this.stateRibbons) this.scene.add(r);
  }

  /** Outline the selected state (its borders and its coast) in gold. */
  private outlineState(state: number) {
    if (state === this.selFor || !this.borders) return;
    this.selFor = state;
    if (this.selRibbon) {
      this.scene.remove(this.selRibbon);
      this.selRibbon.geometry.dispose();
      (this.selRibbon.material as THREE.Material).dispose();
      this.selRibbon = null;
    }
    if (state < 0) return;
    const b = this.borders;
    const sec = this.country.sections;
    const lines: number[][] = [];
    for (let i = 0; i < b.start.length; i++) {
      const ina = sec[b.a[i]]?.state === state;
      const inb = b.b[i] !== 65535 && sec[b.b[i]]?.state === state;
      if (ina !== inb) lines.push(this.drape(b.pts, b.start[i], b.count[i], 0.18));
    }
    this.selRibbon = this.ribbon(lines, 0xffd75e, 0.95, 1.6, 4);
    this.scene.add(this.selRibbon);
  }

  // ------------------------------------------------------------------ labels

  private buildLabels() {
    const root = this.labelRoot;
    if (!root) return;
    root.textContent = "";
    this.labelEls = [];
    this.sortedLabels = null;
    const c = this.country;
    for (const st of c.states) {
      const el = document.createElement("div");
      el.className = "yg-ml state";
      el.textContent = st.name;
      root.appendChild(el);
      const area = st.sections.reduce((a, id) => a + c.sections[id].area, 0);
      this.labelEls.push({ el, p: new THREE.Vector3(st.cx - W / 2, this.heightAt(st.cx, st.cy) + 1.5, st.cy - H / 2), kind: "state", id: st.id, size: Math.sqrt(area), w: st.name.length * 8.6 + 8 });
    }
    for (const sec of c.sections) {
      if (!sec.city && !c.states.some((s) => s.capital === sec.id)) continue;
      const el = document.createElement("div");
      el.className = `yg-ml city${sec.id === c.capital ? " capital" : ""}`;
      el.innerHTML = `<i></i><span></span>`;
      el.querySelector("span")!.textContent = sec.town;
      root.appendChild(el);
      this.labelEls.push({ el, p: new THREE.Vector3(sec.cx - W / 2, this.heightAt(sec.cx, sec.cy) + 0.6, sec.cy - H / 2), kind: "city", id: sec.id, size: sec.pop, w: sec.town.length * 7 + 16 });
    }
  }

  private v = new THREE.Vector3();
  private placed: number[] = [];
  private placeLabels(w: number, h: number, selected: number, hidden: boolean) {
    const d = this.rig.cur.dist;
    const showState = !hidden && d > 70;
    const showCity = !hidden && d < 300;
    // Big regions and big cities first; a label that would overlap one already placed waits
    // until the camera comes closer (small states, crowded coasts).
    if (!this.sortedLabels) this.sortedLabels = [...this.labelEls].sort((a, b) => (a.kind === b.kind ? b.size - a.size : a.kind === "state" ? -1 : 1));
    const placed = this.placed;
    placed.length = 0;
    for (const L of this.sortedLabels) {
      let on = L.kind === "state" ? showState && (L.id === selected || L.size > d * 0.045) : showCity && (d < 160 || this.country.sections[L.id].city);
      if (on) {
        this.v.copy(L.p).project(this.camera);
        on = !(this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1);
      }
      let x = 0;
      let y = 0;
      if (on) {
        x = (this.v.x * 0.5 + 0.5) * w;
        y = (-this.v.y * 0.5 + 0.5) * h;
        const hw = L.w / 2;
        for (let i = 0; i < placed.length && on; i += 4) if (Math.abs(placed[i] - x) < hw + placed[i + 2] && Math.abs(placed[i + 1] - y) < 8 + placed[i + 3]) on = L.id === selected && L.kind === "state";
        if (on) placed.push(x, y, hw, 8);
      }
      if (!on) {
        if (L.el.style.display !== "none") L.el.style.display = "none";
        continue;
      }
      L.el.style.display = "";
      L.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      if (L.kind === "state") L.el.classList.toggle("on", L.id === selected);
    }
  }
  private sortedLabels: LabelEl[] | null = null;

  // ------------------------------------------------------------------ queries

  /** Terrain height at a map point. */
  heightAt(x: number, y: number) {
    const hs = this.heights;
    if (!hs) return 0;
    const gx = Math.min(this.gw - 1.001, Math.max(0, x / this.step));
    const gy = Math.min(this.gh - 1.001, Math.max(0, y / this.step));
    const x0 = gx | 0;
    const y0 = gy | 0;
    const fx = gx - x0;
    const fy = gy - y0;
    const i = y0 * this.gw + x0;
    const a = hs[i] + (hs[i + 1] - hs[i]) * fx;
    const b = hs[i + this.gw] + (hs[i + this.gw + 1] - hs[i + this.gw]) * fx;
    return a + (b - a) * fy;
  }

  /** The point of land under a screen position (normalised device coords), or null. */
  groundAt(ndcX: number, ndcY: number): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    if (d.y >= -1e-4) return null;
    // March down from the top of the mountains to the ground (or the sea).
    let t = o.y > 24 ? (o.y - 24) / -d.y : 0;
    const p = new THREE.Vector3();
    let prev = t;
    for (let k = 0; k < 2000; k++) {
      p.copy(o).addScaledVector(d, t);
      const g = Math.max(0, this.heightAt(p.x + W / 2, p.z + H / 2));
      if (p.y <= g) {
        // Refine between the last two steps.
        let lo = prev;
        let hi = t;
        for (let r = 0; r < 12; r++) {
          const mid = (lo + hi) / 2;
          p.copy(o).addScaledVector(d, mid);
          if (p.y <= Math.max(0, this.heightAt(p.x + W / 2, p.z + H / 2))) hi = mid;
          else lo = mid;
        }
        p.copy(o).addScaledVector(d, hi);
        return p;
      }
      prev = t;
      t += Math.max(0.4, (p.y - g) * 0.5);
      if (t > 8000) break;
    }
    return null;
  }

  /** The county under a screen position, or -1. */
  countyAt(ndcX: number, ndcY: number) {
    const p = this.groundAt(ndcX, ndcY);
    if (!p || !this.labelData) return -1;
    const x = p.x + W / 2;
    const y = p.z + H / 2;
    if (x < 0 || y < 0 || x >= W || y >= H || this.heightAt(x, y) < 0) return -1;
    const px = Math.min(this.tw - 1, Math.floor((x / W) * this.tw));
    const py = Math.min(this.th - 1, Math.floor((y / H) * this.th));
    const o = (py * this.tw + px) * 2;
    const id = this.labelData[o] | (this.labelData[o + 1] << 8);
    return id === 65535 ? -1 : id;
  }

  /** Fly to a state (or back to the whole country; `aside` leaves room for a card on the right). */
  focusState(state: number | null, aside = false) {
    if (state === null) {
      this.rig.fly({ target: new THREE.Vector3(aside ? 95 : 0, 0, 18), dist: aside ? 500 : 430, pitch: 0.95, yaw: 0 });
      return;
    }
    const st = this.country.states[state];
    const spread = Math.sqrt(st.sections.reduce((a, id) => a + this.country.sections[id].area, 0));
    this.rig.fly({ target: new THREE.Vector3(st.cx - W / 2, 0, st.cy - H / 2 + 8), dist: Math.max(70, spread * 2.6), pitch: 0.9 });
  }

  // ------------------------------------------------------------------ per frame

  setOverlay(o: WorldOverlay, strength: number) {
    const src = o.colors;
    for (let i = 0; i < src.length / 4; i++) {
      this.palData[i * 4] = Math.round(srgbToLinear(src[i * 4]) * 255);
      this.palData[i * 4 + 1] = Math.round(srgbToLinear(src[i * 4 + 1]) * 255);
      this.palData[i * 4 + 2] = Math.round(srgbToLinear(src[i * 4 + 2]) * 255);
      this.palData[i * 4 + 3] = src[i * 4 + 3];
    }
    this.palTex.needsUpdate = true;
    this.uniforms.uSel.value = o.selectedState;
    this.uniforms.uHover.value = o.hoverCounty;
    this.overlayBase = strength;
    this.outlineState(o.selectedState);
  }

  update(dt: number, w: number, h: number, labels: { selected: number; hidden: boolean }) {
    this.time += dt;
    this.rig.step(dt, this.camera);
    const d = this.rig.cur.dist;
    // Lines a couple of pixels wide whatever the zoom; county lines fade out from afar.
    this.ribbonWidth.value = d * 0.0016;
    if (this.countyLines) (this.countyLines.material as THREE.LineBasicMaterial).opacity = THREE.MathUtils.clamp((420 - d) / 300, 0.12, 0.42) * (this.bordersOn ? 1 : 0);
    for (const r of this.stateRibbons) r.visible = this.bordersOn;
    // Up close the land shows through the colours; from afar the colours read clearly.
    this.uniforms.uOverlay.value = this.overlayBase * THREE.MathUtils.clamp(0.45 + (d - 60) / 330, 0.45, 1);
    this.uniforms.uCloudOff.value.set(this.time * 0.0016, this.time * 0.0007);
    if (this.water) (this.water.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    if (this.clouds) {
      this.clouds.visible = this.cloudsOn;
      (this.clouds.material as THREE.ShaderMaterial).uniforms.uOpacity.value = THREE.MathUtils.clamp((d - 150) / 320, 0, 0.5);
    }
    this.uniforms.uCloudShadow.value = this.cloudsOn ? 0.22 : 0;
    // The sun's shadow box follows the view a little (sharper shadows when zoomed in).
    if (this.sun.castShadow) {
      const tgt = this.rig.cur.target;
      this.sun.target.position.set(tgt.x * 0.5, 0, tgt.z * 0.5);
      this.sun.position.copy(this.sun.target.position).addScaledVector(SUN, 500);
    }
    if (this.rig.moved || labels.selected !== this.lastSel || labels.hidden !== this.lastHidden) {
      this.placeLabels(w, h, labels.selected, labels.hidden);
      this.rig.moved = false;
      this.lastSel = labels.selected;
      this.lastHidden = labels.hidden;
    }
  }
  private lastSel = -2;
  private lastHidden = false;

  resize(w: number, h: number) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.rig.moved = true;
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.terrainMat?.map?.dispose();
    this.palTex.dispose();
    this.uniforms.tLabel.value?.dispose();
    this.uniforms.tStateOf.value?.dispose();
    this.uniforms.tCloud.value?.dispose();
    this.scene.environment?.dispose();
    if (this.labelRoot) this.labelRoot.textContent = "";
  }
}
