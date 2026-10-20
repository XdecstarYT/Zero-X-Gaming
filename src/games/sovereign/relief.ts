/**
 * NextX Engine · the world in 3D. The real relief raised from the elevation data and lit by the
 * sun, the nations laid over it in their colours, a sea that catches the light, drifting clouds
 * that cast their shadows, and haze toward the horizon. Zoomed out it looks straight down on the
 * whole world; as you zoom in, the camera tilts toward the horizon. The map's interface (cities,
 * armies, names) is drawn on top through `project`.
 */
import * as THREE from "three";
import type { Camera } from "./render";
import type { World } from "./world";

/** Map px of lift for the highest peak (8,800 m): a strong exaggeration so mountains read. */
const PEAK = 20;
const FOV = 38;

const VS = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vH;
void main() {
  vUv = uv;
  vNormal = normalize(normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vH = position.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FS = /* glsl */ `
uniform sampler2D tTerrain;
uniform sampler2D tPol;
uniform sampler2D tCloud;
uniform vec3 uSun;
uniform float uTime;
uniform float uCloud;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec2 uMap;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vH;
void main() {
  vec3 base = texture2D(tTerrain, vUv).rgb;
  vec3 n = normalize(vNormal);
  float ndl = dot(n, uSun);
  // The painted relief already has its shading: the real slope adds depth on top.
  vec3 col = base * mix(1.0, 0.62 + 0.62 * max(ndl, 0.0), 0.7);
  float land = step(0.05, vH);
  if (land < 0.5) {
    // The sea: a slow swell that catches the sun.
    vec3 v = normalize(cameraPosition - vWorld);
    float sw = sin(vWorld.x * 0.55 + uTime * 0.9) * sin(vWorld.z * 0.43 - uTime * 0.7) + sin((vWorld.x + vWorld.z) * 0.21 + uTime * 0.5);
    // Fade the swell out where a pixel spans a wave, or it shimmers into stripes.
    sw *= 1.0 - smoothstep(0.2, 0.9, fwidth(vWorld.x) + fwidth(vWorld.z));
    vec3 sn = normalize(vec3(sw * 0.06, 1.0, sw * 0.05));
    float spec = pow(max(dot(reflect(-uSun, sn), v), 0.0), 60.0);
    col += vec3(1.0, 0.95, 0.85) * spec * 0.35 + vec3(0.02, 0.04, 0.06) * sw;
  }
  vec4 pol = texture2D(tPol, vUv);
  col = mix(col, pol.rgb, pol.a);
  // Cloud shadows, offset from the clouds as if the sun were in the south-east.
  vec2 cu = vUv * vec2(2.0, 1.0) + vec2(uTime * 0.0035 + 0.012, -0.01);
  float shadow = texture2D(tCloud, cu).a;
  col *= 1.0 - shadow * 0.28 * uCloud;
  float d = length(cameraPosition - vWorld);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const CLOUD_FS = /* glsl */ `
uniform sampler2D tCloud;
uniform float uTime;
uniform float uCloud;
varying vec2 vUv;
void main() {
  float a = texture2D(tCloud, vUv * vec2(2.0, 1.0) + vec2(uTime * 0.0035, 0.0)).a;
  gl_FragColor = vec4(vec3(1.0), a * 0.8 * uCloud);
  #include <colorspace_fragment>
}`;
const CLOUD_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Soft clouds that wrap round the world (east to west), as an alpha texture. */
function cloudTexture() {
  const W = 512;
  const H = 256;
  const lat = new Float32Array(64 * 32);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const noise = (x: number, y: number, p: number) => {
    // Value noise on a lattice of p × p/2 that wraps in x.
    const px = p;
    const py = p / 2;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const at = (a: number, b: number) => lat[(((b % py) + py) % py) * 64 + (((a % px) + px) % px)];
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    return at(xi, yi) * (1 - u) * (1 - v) + at(xi + 1, yi) * u * (1 - v) + at(xi, yi + 1) * (1 - u) * v + at(xi + 1, yi + 1) * u * v;
  };
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let f = 0;
      let amp = 0.55;
      let p = 8;
      for (let o = 0; o < 4; o++) {
        f += noise((x / W) * p, (y / H) * (p / 2), p) * amp;
        amp *= 0.5;
        p *= 2;
      }
      const a = Math.max(0, Math.min(1, (f - 0.5) * 3.2));
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export class Relief {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);
  private mat: THREE.ShaderMaterial;
  private clouds: THREE.Mesh;
  private terrain: THREE.Mesh | null = null;
  private polTex: THREE.CanvasTexture;
  private heights: Uint8Array | null = null;
  private hw = 0;
  private hh = 0;
  private ray = new THREE.Raycaster();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private w = 1;
  private h = 1;
  ready = false;
  /** How tilted the camera is now (0 straight down). */
  pitch = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly world: World,
    layer: HTMLCanvasElement,
    readonly small: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.up.set(0, 0, -1);
    this.scene.background = new THREE.Color("#a9c8e6");
    this.polTex = new THREE.CanvasTexture(layer);
    this.polTex.colorSpace = THREE.SRGBColorSpace;
    this.polTex.anisotropy = 4;
    const cloud = cloudTexture();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        tTerrain: { value: null },
        tPol: { value: this.polTex },
        tCloud: { value: cloud },
        uSun: { value: new THREE.Vector3(-0.45, 0.75, 0.48).normalize() },
        uTime: { value: 0 },
        uCloud: { value: 1 },
        uFog: { value: new THREE.Color("#a9c8e6") },
        uFogNear: { value: 3000 },
        uFogFar: { value: 9000 },
        uMap: { value: new THREE.Vector2(world.w, world.h) },
      },
    });
    // The sea runs on past the edges of the map.
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(world.w * 7, world.h * 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color("#1d4a7d") }));
    sea.position.set(world.w / 2, -0.4, world.h / 2);
    this.scene.add(sea);
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(world.w, world.h).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, uniforms: { tCloud: { value: cloud }, uTime: this.mat.uniforms.uTime, uCloud: { value: 1 } } }),
    );
    this.clouds.position.set(world.w / 2, PEAK + 6, world.h / 2);
    this.clouds.renderOrder = 2;
    this.scene.add(this.clouds);
  }

  /** Load the relief and the painted terrain. */
  async load() {
    const [heightImg, terrain] = await Promise.all([
      loadImage("/sovereign/height.png"),
      new THREE.TextureLoader().loadAsync(this.small ? "/sovereign/terrain-s.webp" : "/sovereign/terrain.webp"),
    ]);
    terrain.colorSpace = THREE.SRGBColorSpace;
    terrain.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.mat.uniforms.tTerrain.value = terrain;
    const c = document.createElement("canvas");
    c.width = heightImg.width;
    c.height = heightImg.height;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(heightImg, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    this.hw = c.width;
    this.hh = c.height;
    this.heights = new Uint8Array(this.hw * this.hh);
    for (let i = 0; i < this.heights.length; i++) this.heights[i] = data[i * 4];
    // The land, raised (lighter on phones).
    const sx = this.small ? 360 : 640;
    const sy = Math.round((sx * this.world.h) / this.world.w);
    const geo = new THREE.PlaneGeometry(this.world.w, this.world.h, sx, sy).rotateX(-Math.PI / 2);
    geo.translate(this.world.w / 2, 0, this.world.h / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, this.mat);
    this.scene.add(this.terrain);
    this.ready = true;
  }

  /** Height of the land (map px of lift) at a map point. */
  heightAt(x: number, y: number) {
    const hd = this.heights;
    if (!hd) return 0;
    const gx = Math.max(0, Math.min(this.hw - 1.001, x / 4 - 0.5));
    const gy = Math.max(0, Math.min(this.hh - 1.001, y / 4 - 0.5));
    const xi = Math.floor(gx);
    const yi = Math.floor(gy);
    const fx = gx - xi;
    const fy = gy - yi;
    const at = (a: number, b: number) => {
      const v = hd[b * this.hw + a] / 255;
      return v * v * PEAK + (v > 0 ? 0.15 : 0);
    };
    return at(xi, yi) * (1 - fx) * (1 - fy) + at(xi + 1, yi) * fx * (1 - fy) + at(xi, yi + 1) * (1 - fx) * fy + at(xi + 1, yi + 1) * fx * fy;
  }

  setSize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(dpr, this.small ? 1.5 : 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
  }

  /** Put the camera over the map's camera: straight down when far, tilting as it comes in. */
  place(cam: Camera) {
    const t = Math.max(0, Math.min(1, (Math.log(cam.zoom) - Math.log(0.55)) / (Math.log(3.2) - Math.log(0.55))));
    this.pitch = t * t * (3 - 2 * t) * 0.92;
    const d = this.h / (2 * cam.zoom * Math.tan((FOV * Math.PI) / 360));
    const ground = this.heightAt(cam.x, cam.y);
    this.camera.position.set(cam.x, ground + d * Math.cos(this.pitch), cam.y + d * Math.sin(this.pitch));
    this.camera.lookAt(cam.x, ground, cam.y);
    this.camera.near = Math.max(0.5, d * 0.02);
    this.camera.far = d * 30 + 6000;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const u = this.mat.uniforms;
    u.uFogNear.value = d * 1.4;
    u.uFogFar.value = d * 4.5 + 400;
    // Clouds thin out as you come down to the ground.
    const cloud = Math.max(0, Math.min(1, 1.25 - cam.zoom * 0.55));
    u.uCloud.value = 0.35 + cloud * 0.65;
    (this.clouds.material as THREE.ShaderMaterial).uniforms.uCloud.value = cloud;
    this.clouds.visible = cloud > 0.02;
  }

  /** Map point (and lift above the ground) → screen px, with the local scale (screen px per map px). */
  project(x: number, y: number, lift = 0) {
    const gy = this.heightAt(x, y) + lift;
    this.v.set(x, gy, y).project(this.camera);
    const sx = ((this.v.x + 1) / 2) * this.w;
    const sy = ((1 - this.v.y) / 2) * this.h;
    const behind = this.v.z > 1;
    // Scale: how far one map px east moves on screen.
    this.v2.set(x + 1, gy, y).project(this.camera);
    const k = Math.hypot(((this.v2.x - this.v.x) / 2) * this.w, ((this.v2.y - this.v.y) / 2) * this.h);
    return { x: sx, y: sy, k, behind };
  }

  /** Screen px → map point on the ground (sea level; close enough to tap on). */
  unproject(sx: number, sy: number) {
    this.ray.setFromCamera(new THREE.Vector2((sx / this.w) * 2 - 1, 1 - (sy / this.h) * 2), this.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, this.v);
    if (!hit) {
      // Above the horizon: the farthest point of the map that way.
      const dir = this.ray.ray.direction;
      return { x: this.camera.position.x + dir.x * 6000, y: this.camera.position.z + dir.z * 6000 };
    }
    return { x: hit.x, y: hit.z };
  }

  /** The political layer was redrawn. */
  layerChanged() {
    this.polTex.needsUpdate = true;
  }

  render(t: number) {
    this.mat.uniforms.uTime.value = t;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
    this.polTex.dispose();
    (this.mat.uniforms.tTerrain.value as THREE.Texture | null)?.dispose();
    (this.mat.uniforms.tCloud.value as THREE.Texture).dispose();
    this.renderer.dispose();
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });
}

/** Can this device draw the world in 3D? */
export function canRelief() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}
