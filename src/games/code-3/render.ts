import * as THREE from "three";
import { mergeGeometries as mergeRaw } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Merge geometries whether or not they're indexed. */
function mergeGeometries(list: THREE.BufferGeometry[]) {
  const out = mergeRaw(list.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!out) throw new Error("Code 3: couldn't merge geometry");
  return out;
}

/** Bake static objects into one mesh per material (parked cars: thousands of draw calls → a few). */
function bakeStatic(roots: THREE.Object3D[]) {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible || Array.isArray(m.material)) return;
      const mat = m.material as THREE.Material;
      if ((mat as THREE.MeshBasicMaterial).blending === THREE.AdditiveBlending) return;
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
      (byMat.get(mat) ?? byMat.set(mat, []).get(mat)!).push(g);
    });
  }
  const out: THREE.Mesh[] = [];
  for (const [mat, list] of byMat) {
    const merged = mergeRaw(list);
    if (merged) out.push(new THREE.Mesh(merged, mat));
  }
  return out;
}
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { HALF_ROAD, HALF_STREET, LINES, lightFor, nodePos, onSidewalk, SIZE, type Building, type City, type PropKind } from "./city";
import { buildCar, buildPed, glowTexture, posePed, type CarModel, type PedModel, type Pose } from "./models";
import type { Code3Sim, Ped, SimEvent, Weather } from "./sim";
import { asphaltDetail, cloudTexture, concrete, facade, paintGround, radialTexture, signTexture } from "./textures";
import { forward, right, signalOf, speedOf } from "./vehicles";
import type { Deployable } from "./sim";

export type Quality = "high" | "low";
export type CamView = "chase" | "far" | "hood";

/** Camera control handed in by the game each frame. */
export interface CamState {
  /** On foot: aim yaw / pitch. In the car: orbit offset from behind (0 = straight behind). */
  yaw: number;
  pitch: number;
  orbit: number;
  view: CamView;
  aiming: boolean;
}

const KERB = 0.15;
/** World streaming chunk size (m): two blocks. */
const CHUNK = 144;

/** Cinematic grade: filmic contrast, slight teal/orange split, vignette, grain. */
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, night: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float night; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      // A touch of chromatic fringing toward the edges.
      float ca = dot(d, d) * 0.004;
      vec3 c = vec3(texture2D(tDiffuse, uv + d * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * ca).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Split tone: cool shadows, warm highlights (stronger at night: sodium lamps vs blue dark).
      vec3 shadowTint = mix(vec3(0.96, 1.0, 1.04), vec3(0.9, 0.97, 1.1), night);
      vec3 highTint = vec3(1.04, 1.0, 0.95);
      c *= mix(shadowTint, highTint, smoothstep(0.1, 0.8, l));
      // Gentle S-curve contrast and saturation.
      c = mix(vec3(l), c, 1.08);
      c = c * c * (3.0 - 2.0 * c) * 0.18 + c * 0.82;
      // Vignette and grain.
      c *= 1.0 - dot(d, d) * 0.55;
      c += (rand(uv * 700.0 + time) - 0.5) * 0.025;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** Sky dome: gradient + sun/moon disc; also rendered into the reflection map. */
function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color("#3a6fb0") },
      horizon: { value: new THREE.Color("#bcd3ea") },
      bottom: { value: new THREE.Color("#2a2a2c") },
      sunDir: { value: new THREE.Vector3(0.3, 0.6, 0.2) },
      sunColor: { value: new THREE.Color("#fff3d0") },
      sunSize: { value: 0.9995 },
      glow: { value: 0.4 },
    },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize; uniform float glow;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
        float s = dot(d, normalize(sunDir));
        c += sunColor * glow * pow(max(s, 0.0), 8.0) * 0.6;
        c += sunColor * smoothstep(sunSize, sunSize + 0.0004, s) * 6.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

let stripeTex: THREE.Texture | null = null;
/** Red/white chevron stripes for barriers. */
function stripeTexture() {
  if (stripeTex) return stripeTex;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f2f2f2";
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = "#d1202a";
  for (let x = -32; x < 160; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 32);
    g.fill();
  }
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.wrapS = THREE.RepeatWrapping;
  stripeTex.repeat.set(4, 1);
  return stripeTex;
}

function textPanel(a: string, b: string, bg: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 192;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f5f5f0";
  g.fillRect(0, 0, 256, 192);
  g.fillStyle = bg;
  g.fillRect(8, 8, 240, 176);
  g.fillStyle = "#ffffff";
  g.font = "bold 44px Arial";
  g.textAlign = "center";
  g.fillText(a, 128, 84);
  g.font = "bold 34px Arial";
  g.fillText(b, 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Walls (UV'd in facade tiles) and a flat roof for a list of buildings. */
function buildingGeometry(list: Building[]) {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const roofPos: number[] = [];
  const roofIdx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], w: number, h: number) => {
    const base = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    nor.push(...n, ...n, ...n, ...n);
    uv.push(0, 0, w / 16, 0, w / 16, h / 14, 0, h / 14);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const b of list) {
    const x0 = b.x - b.hw;
    const x1 = b.x + b.hw;
    const z0 = b.z - b.hd;
    const z1 = b.z + b.hd;
    const h = b.h;
    quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1], x1 - x0, h);
    quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0], z1 - z0, h);
    quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1], x1 - x0, h);
    quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], z1 - z0, h);
    if (b.kind !== "house") {
      const base = roofPos.length / 3;
      roofPos.push(x0, h, z0, x0, h, z1, x1, h, z1, x1, h, z0);
      roofIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  walls.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  walls.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  walls.setIndex(idx);
  walls.computeTangents?.();
  const roofs = new THREE.BufferGeometry();
  roofs.setAttribute("position", new THREE.Float32BufferAttribute(roofPos, 3));
  roofs.setIndex(roofIdx);
  roofs.computeVertexNormals();
  return { walls, roofs };
}

/** Planar world-space UVs (u = x / tile, v = z / tile). */
function planarUV(g: THREE.BufferGeometry, tile: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / tile + p.getY(i) / tile;
    uv[i * 2 + 1] = p.getZ(i) / tile;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

interface Fx {
  obj: THREE.Object3D;
  until: number;
}

const up = new THREE.Vector3(0, 1, 0);
const M_GLASS = new THREE.MeshPhysicalMaterial({ color: "#0b1016", metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.85 });

export class Code3View {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1400);
  private composer: EffectComposer | null = null;
  private grade: ShaderPass | null = null;
  private hemi = new THREE.HemisphereLight("#bcd4ff", "#3a3228", 0.6);
  private sun = new THREE.DirectionalLight("#ffffff", 1);
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envKey = "";
  private sky: THREE.Mesh;
  private skyMat = skyMaterial();
  private stars: THREE.Points;
  private moon: THREE.Sprite;
  private clouds: THREE.Mesh;
  private cars = new Map<string, CarModel>();
  private peds = new Map<string, PedModel & { key: string }>();
  private officer: PedModel;
  private windowMats: THREE.MeshStandardMaterial[] = [];
  private glassMats: THREE.MeshStandardMaterial[] = [];
  private lampMat = new THREE.MeshStandardMaterial({ color: "#fff4d0", emissive: "#ffc98a", emissiveIntensity: 0 });
  private pools: THREE.InstancedMesh;
  private lampSpots: { x: number; z: number; ry: number }[] = [];
  private lampLights: THREE.PointLight[] = [];
  private lampAt = 0;
  private signals: { mats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]; parity: number; axis: "ns" | "ew" }[] = [];
  private signMats: THREE.MeshBasicMaterial[] = [];
  private groundMat: THREE.MeshStandardMaterial;
  private walkMat: THREE.MeshStandardMaterial;
  private puddles: THREE.InstancedMesh;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private beams: THREE.SpotLight[] = [];
  private bar: [THREE.PointLight, THREE.PointLight];
  private marker: THREE.Group;
  private spikes: THREE.Mesh;
  private skids: THREE.InstancedMesh;
  private skidN = 0;
  private skidAt = new Map<string, number>();
  private fx: Fx[] = [];
  private blood = new Map<string, THREE.Mesh>();
  private smokeGeo = new THREE.SphereGeometry(0.5, 8, 6);
  private smokeMat = new THREE.MeshBasicMaterial({ color: "#4b4b4b", transparent: true, opacity: 0.35, depthWrite: false });
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private night = 1;
  private officerStep = 0;
  private ro: ResizeObserver;
  private resolved = false;
  private readonly weather: Weather;
  private deployMeshes = new Map<string, THREE.Group>();
  private coneGeo = mergeGeometries([new THREE.ConeGeometry(0.17, 0.62, 12).translate(0, 0.33, 0), new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.02, 0)]);
  private coneMat = new THREE.MeshStandardMaterial({ color: "#ff5a0a", roughness: 0.5, emissive: "#ff3a00", emissiveIntensity: 0.05 });
  private heli: THREE.Group;
  private rotor: THREE.Mesh;
  private searchlight: THREE.SpotLight;
  private torch: THREE.SpotLight;
  // Streaming.
  private CN = 1;
  private chunkData: { buildings: Building[]; trees: City["trees"]; props: City["props"]; parked: City["parked"] }[] = [];
  private chunks = new Map<number, THREE.Group>();
  private loadRadius = 300;
  private facadeMats = new Map<string, THREE.MeshStandardMaterial>();
  private kindsCache: Record<PropKind, { geo: THREE.BufferGeometry; mat: THREE.Material }> | null = null;
  private mats = {
    roof: new THREE.MeshStandardMaterial({ color: "#4a4a48", roughness: 1 }),
    houseRoof: new THREE.MeshStandardMaterial({ color: "#4f3a31", roughness: 0.85, flatShading: true }),
    kit: new THREE.MeshStandardMaterial({ color: "#8f9295", roughness: 0.6, metalness: 0.4 }),
    parapet: new THREE.MeshStandardMaterial({ color: "#6d6a64", roughness: 0.9 }),
    awning: new THREE.MeshStandardMaterial({ color: "#7a1f24", roughness: 0.8, side: THREE.DoubleSide }),
    trunk: new THREE.MeshStandardMaterial({ color: "#4b3526", roughness: 1 }),
    crown: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, flatShading: true }),
    shelterGlass: new THREE.MeshPhysicalMaterial({ color: "#9fb4c4", transparent: true, opacity: 0.3, roughness: 0.05 }),
  };
  private treeGeo = (() => {
    const crown = mergeGeometries([
      new THREE.IcosahedronGeometry(1.7, 1).translate(0, 4.2, 0),
      new THREE.IcosahedronGeometry(1.3, 1).translate(0.9, 3.7, 0.4),
      new THREE.IcosahedronGeometry(1.25, 1).translate(-0.7, 3.8, -0.6),
      new THREE.IcosahedronGeometry(1.1, 1).translate(0.1, 5.2, -0.2),
    ]);
    const pos = crown.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = 1 + Math.sin(pos.getX(i) * 7.1) * Math.cos(pos.getZ(i) * 6.3) * 0.08;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    crown.computeVertexNormals();
    const trunk = new THREE.CylinderGeometry(0.14, 0.24, 3, 7).translate(0, 1.5, 0);
    crown.userData.shared = trunk.userData.shared = true;
    return { crown, trunk };
  })();

  constructor(
    private host: HTMLElement,
    private sim: Code3Sim,
    private quality: Quality,
  ) {
    const high = quality === "high";
    this.weather = sim.weather;
    this.renderer = new THREE.WebGLRenderer({ antialias: !high, powerPreference: "high-performance", stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.5 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "absolute inset-0 h-full w-full";
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    const city = sim.city;
    this.scene.fog = new THREE.Fog("#0b1020", 60, 380);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = high;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -80;
    sc.right = sc.top = 80;
    sc.far = 500;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;

    // Sky dome, stars, moon, clouds (follow the camera).
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.skyMat);
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat));
    const starPos = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(950);
      starPos.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#e8eeff", fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.set(70, 70, 1);
    this.scene.add(this.moon);
    const ct = cloudTexture();
    ct.repeat.set(3, 1);
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2.1),
      new THREE.MeshBasicMaterial({ map: ct, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false, opacity: 0.5 }),
    );
    this.clouds.renderOrder = -1;
    this.clouds.visible = high;
    this.scene.add(this.clouds);

    // Ground: the painted plan, with tiled asphalt micro-detail on a second UV set.
    const groundGeo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1).rotateX(-Math.PI / 2).translate(SIZE / 2, 0, SIZE / 2);
    const uv0 = groundGeo.attributes.uv as THREE.BufferAttribute;
    const uv1 = new Float32Array(uv0.count * 2);
    for (let i = 0; i < uv0.count; i++) {
      uv1[i * 2] = uv0.getX(i) * (SIZE / 4);
      uv1[i * 2 + 1] = uv0.getY(i) * (SIZE / 4);
    }
    groundGeo.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
    const detail = asphaltDetail();
    detail.normal.channel = 1;
    detail.rough.channel = 1;
    this.groundMat = high
      ? new THREE.MeshStandardMaterial({ map: paintGround(city), normalMap: detail.normal, roughnessMap: detail.rough, roughness: 0.95, normalScale: new THREE.Vector2(0.6, 0.6) })
      : new THREE.MeshStandardMaterial({ map: paintGround(city), roughness: 0.95 });
    const ground = new THREE.Mesh(groundGeo, this.groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE * 4, SIZE * 4).rotateX(-Math.PI / 2).translate(SIZE / 2, -0.05, SIZE / 2),
      new THREE.MeshStandardMaterial({ color: "#39452f", roughness: 1 }),
    );
    this.scene.add(outer);

    // Raised sidewalks with kerbs.
    const cc = concrete();
    this.walkMat = new THREE.MeshStandardMaterial({ map: cc.map, normalMap: cc.normal, roughness: 0.9 });
    const walks: THREE.BufferGeometry[] = [];
    for (const b of city.blocks) {
      const w = HALF_STREET - HALF_ROAD;
      const x0 = b.x0 - w;
      const x1 = b.x1 + w;
      const z0 = b.z0 - w;
      const z1 = b.z1 + w;
      walks.push(new THREE.BoxGeometry(x1 - x0, KERB, w).translate((x0 + x1) / 2, KERB / 2, z0 + w / 2));
      walks.push(new THREE.BoxGeometry(x1 - x0, KERB, w).translate((x0 + x1) / 2, KERB / 2, z1 - w / 2));
      walks.push(new THREE.BoxGeometry(w, KERB, z1 - z0 - 2 * w).translate(x0 + w / 2, KERB / 2, (z0 + z1) / 2));
      walks.push(new THREE.BoxGeometry(w, KERB, z1 - z0 - 2 * w).translate(x1 - w / 2, KERB / 2, (z0 + z1) / 2));
    }
    const walk = new THREE.Mesh(planarUV(mergeGeometries(walks), 2), this.walkMat);
    walk.receiveShadow = true;
    this.scene.add(walk);

    // The city is streamed in chunks (buildings, rooftops, signs, trees, street
    // furniture, parked cars) around the camera; far chunks are freed.
    this.CN = Math.ceil(SIZE / CHUNK);
    this.chunkData = Array.from({ length: this.CN * this.CN }, () => ({ buildings: [] as Building[], trees: [] as City["trees"], props: [] as City["props"], parked: [] as City["parked"] }));
    const at = (x: number, z: number) => this.chunkData[Math.min(this.CN - 1, Math.floor(z / CHUNK)) * this.CN + Math.min(this.CN - 1, Math.floor(x / CHUNK))];
    for (const b of city.buildings) if (b.kind !== "parked") at(b.x, b.z).buildings.push(b);
    for (const t of city.trees) at(t.x, t.z).trees.push(t);
    for (const p of city.props) at(p.x, p.z).props.push(p);
    for (const p of city.parked) at(p.x, p.z).parked.push(p);
    this.loadRadius = high ? 360 : 250;
    this.lampSpots = this.buildStreetFurniture(city);
    this.pools = this.buildPools(this.lampSpots);
    this.buildManholes(city);
    this.streamChunks(true);
    for (let i = 0; i < (high ? 6 : 0); i++) {
      const l = new THREE.PointLight("#ffc98a", 0, 26, 1.5);
      this.lampLights.push(l);
      this.scene.add(l);
    }

    // Puddles (rain only).
    const puddleCount = 160;
    this.puddles = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#07090c", roughness: 0.02, metalness: 0.2, envMapIntensity: 2 }),
      puddleCount,
    );
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < puddleCount; i++) {
      const L = city.lines[i % city.lines.length];
      const v = ((i * 97.3) % (SIZE - 20)) + 10;
      const acr = ((i * 13) % 7) - 3.5;
      const vertical = i % 2 === 0;
      const s = 0.6 + ((i * 7) % 10) / 6;
      m4.compose(new THREE.Vector3(vertical ? L + acr : v, 0.012, vertical ? v : L + acr), new THREE.Quaternion(), new THREE.Vector3(s * 1.6, 1, s));
      this.puddles.setMatrixAt(i, m4);
    }
    this.puddles.visible = this.weather === "rain";
    this.puddles.receiveShadow = true;
    this.scene.add(this.puddles);

    // Rain streaks around the camera.
    const drops = high ? 2600 : 700;
    this.rainPos = new Float32Array(drops * 6);
    for (let i = 0; i < drops; i++) this.resetDrop(i, true);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: "#aebbd0", transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = this.weather === "rain";
    this.scene.add(this.rain);

    // Skid marks.
    this.skids = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.6, 0.26).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#050505", transparent: true, opacity: 0.45, depthWrite: false }),
      900,
    );
    this.skids.count = 0;
    this.skids.renderOrder = 1;
    this.scene.add(this.skids);

    // Spike strip.
    this.spikes = new THREE.Mesh(
      mergeGeometries([new THREE.BoxGeometry(6, 0.04, 0.35).translate(0, 0.03, 0), ...Array.from({ length: 24 }, (_, k) => new THREE.ConeGeometry(0.03, 0.08, 4).translate(-2.9 + k * 0.25, 0.09, (k % 2) * 0.12 - 0.06))]),
      new THREE.MeshStandardMaterial({ color: "#2a2c30", metalness: 0.8, roughness: 0.4 }),
    );
    this.spikes.visible = false;
    this.scene.add(this.spikes);

    // The officer on foot.
    this.officer = buildPed({ skin: "#d8a47f", shirt: "#1f2b44", pants: "#1a2233", officer: true });
    this.scene.add(this.officer.group);
    this.torch = new THREE.SpotLight("#fff6e0", 0, 30, 0.35, 0.5, 1.2);
    this.torch.position.set(0.3, 1.4, 0.2);
    this.torch.target.position.set(10, 0.2, 0);
    this.officer.group.add(this.torch, this.torch.target);

    // Air-1.
    const heliMat = new THREE.MeshStandardMaterial({ color: "#1b2536", metalness: 0.5, roughness: 0.4 });
    this.heli = new THREE.Group();
    this.heli.add(
      new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12).scale(1.6, 1, 1), heliMat),
      new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5, 8).rotateZ(Math.PI / 2).translate(-4, 0.3, 0), heliMat),
      new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1).translate(-6.4, 0.8, 0.2), heliMat),
      new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(3, 0.08, 0.08).translate(0, -1.3, 0.8), new THREE.BoxGeometry(3, 0.08, 0.08).translate(0, -1.3, -0.8)]), heliMat),
      new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).translate(1.2, 0.2, 0), M_GLASS),
    );
    this.rotor = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(9, 0.05, 0.3), new THREE.BoxGeometry(0.3, 0.05, 9)]).translate(0, 1.3, 0), heliMat);
    this.heli.add(this.rotor);
    this.searchlight = new THREE.SpotLight("#eef4ff", 0, 140, 0.16, 0.4, 1);
    this.searchlight.position.set(1.5, -1.2, 0);
    this.heli.add(this.searchlight, this.searchlight.target);
    this.scene.add(this.searchlight.target);
    this.heli.visible = false;
    this.scene.add(this.heli);

    // Unit headlights and light-bar lights.
    for (const side of [-1, 1]) {
      const s = new THREE.SpotLight("#fff1d6", 0, 70, 0.48, 0.55, 1.3);
      s.position.set(2.4, 0.8, side * 0.6);
      s.target.position.set(22, 0, side * 1.2);
      s.castShadow = false;
      this.beams.push(s);
    }
    this.bar = [new THREE.PointLight("#ff2030", 0, 28, 1.5), new THREE.PointLight("#2050ff", 0, 28, 1.5)];

    // GPS marker.
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 4, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffd21f", transparent: true, opacity: 0.5, depthWrite: false }),
    );
    ring.position.y = KERB + 0.03;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: "#ffd21f" }));
    arrow.position.y = 6;
    this.marker.add(ring, arrow);
    this.scene.add(this.marker);

    if (high) {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const ao = new GTAOPass(this.scene, this.camera, w, h);
      ao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1.4, thickness: 1.4, scale: 1.2 });
      ao.blendIntensity = 0.85;
      this.composer.addPass(ao);
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.45, 0.55, 0.88));
      this.composer.addPass(new OutputPass());
      this.grade = new ShaderPass(GRADE_SHADER);
      this.composer.addPass(this.grade);
      this.composer.addPass(new SMAAPass());
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  /** Render-resolution scale (1 = full) for adaptive performance on phones. */
  setResolution(k: number) {
    const base = Math.min(window.devicePixelRatio || 1, this.quality === "high" ? 1.5 : 1);
    this.renderer.setPixelRatio(base * k);
    this.composer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25) * k);
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private resetDrop(i: number, anywhere: boolean) {
    const c = this.camPos;
    const x = c.x + (Math.random() - 0.5) * 60;
    const z = c.z + (Math.random() - 0.5) * 60;
    const y = anywhere ? Math.random() * 30 : 25 + Math.random() * 8;
    this.rainPos.set([x, y, z, x + 0.05, y + 0.7, z + 0.02], i * 6);
  }

  // ------------------------------------------------------------ city build

  // ---------------------------------------------------------------- chunks

  private streamChunks(all = false) {
    const f = this.sim.officer;
    const need: { i: number; d: number }[] = [];
    for (let i = 0; i < this.CN * this.CN; i++) {
      const cx = (i % this.CN) * CHUNK + CHUNK / 2;
      const cz = Math.floor(i / this.CN) * CHUNK + CHUNK / 2;
      const d = Math.max(0, Math.hypot(cx - f.x, cz - f.z) - CHUNK * 0.71);
      const loaded = this.chunks.get(i);
      if (d < this.loadRadius && !loaded) need.push({ i, d });
      else if (loaded && d > this.loadRadius + 90) this.unloadChunk(i);
    }
    need.sort((a, b) => a.d - b.d);
    // One chunk per frame while playing (no hitches); everything nearby up front.
    for (const n of all ? need : need.slice(0, 1)) this.loadChunk(n.i);
  }

  private loadChunk(i: number) {
    const g = new THREE.Group();
    g.name = `chunk-${i}`;
    const data = this.chunkData[i];
    this.buildBuildings(g, data.buildings, data.trees);
    this.buildProps(g, data.props);
    if (data.parked.length) {
      const parked = data.parked.map((p) => {
        const m = buildCar(p.kind, p.color, "", "low");
        m.group.position.set(p.x, 0, p.z);
        m.group.rotation.y = -p.h;
        m.beam.visible = false;
        // Parked: lamps off.
        (m.heads.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
        m.tail.emissiveIntensity = 0.05;
        return m.group;
      });
      for (const mesh of bakeStatic(parked)) {
        mesh.castShadow = this.quality === "high";
        mesh.receiveShadow = true;
        g.add(mesh);
      }
    }
    this.chunks.set(i, g);
    this.scene.add(g);
  }

  private unloadChunk(i: number) {
    const g = this.chunks.get(i);
    if (!g) return;
    this.chunks.delete(i);
    g.removeFromParent();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!m.geometry.userData.shared) m.geometry.dispose();
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) (m as unknown as THREE.InstancedMesh).dispose();
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.userData?.chunkOwned) {
        this.signMats = this.signMats.filter((x) => x !== mat);
        mat.map?.dispose();
        mat.dispose();
      }
    });
  }

  /** Loaded chunk count (for tests / debugging). */
  get loadedChunks() {
    return this.chunks.size;
  }

  private facadeMat(key: string) {
    let mat = this.facadeMats.get(key);
    if (!mat) {
      let seed = 1;
      for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) % 1000;
      const tex = facade(key, seed);
      mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.lit,
        emissive: "#ffffff",
        emissiveIntensity: this.night * 1.4,
        roughnessMap: tex.rough,
        roughness: 1,
        normalMap: this.quality === "high" ? tex.normal : null,
        normalScale: new THREE.Vector2(0.8, 0.8),
        metalness: key.startsWith("tower") ? 0.25 : 0.05,
        envMapIntensity: 1.3,
      });
      this.facadeMats.set(key, mat);
      this.windowMats.push(mat);
    }
    return mat;
  }

  private buildBuildings(target: THREE.Object3D, buildings: Building[], trees: City["trees"]) {
    const groups = new Map<string, Building[]>();
    for (const b of buildings) {
      const key = b.kind === "tower" || b.kind === "office" ? `${b.kind}${b.style}` : b.kind;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(b);
    }
    const roofs: THREE.BufferGeometry[] = [];
    for (const [key, list] of groups) {
      // Towers get a setback crown (visual only).
      const crowns = key.startsWith("tower")
        ? list.filter((b) => b.h > 55).map((b) => ({ ...b, hw: b.hw * 0.7, hd: b.hd * 0.7, h: b.h + 9 }))
        : [];
      const { walls, roofs: r } = buildingGeometry([...list, ...crowns]);
      roofs.push(r);
      const mesh = new THREE.Mesh(walls, this.facadeMat(key));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      target.add(mesh);
    }
    if (roofs.length) {
      const roofMesh = new THREE.Mesh(mergeGeometries(roofs), this.mats.roof);
      roofMesh.receiveShadow = true;
      target.add(roofMesh);
    }

    // Pitched roofs; parapets, AC units, water tanks; shop awnings.
    const houseRoofs: THREE.BufferGeometry[] = [];
    const roofKit: THREE.BufferGeometry[] = [];
    const parapets: THREE.BufferGeometry[] = [];
    const awnings: THREE.BufferGeometry[] = [];
    for (const b of buildings) {
      if (b.kind === "house") {
        const g = new THREE.CylinderGeometry(0.01, b.hd * 1.18, 3, 4, 1).rotateY(Math.PI / 4);
        g.scale(b.hw / b.hd, 1, 1);
        houseRoofs.push(g.translate(b.x, b.h + 1.5, b.z));
        // Porch and chimney.
        roofKit.push(new THREE.BoxGeometry(0.8, 2, 0.8).translate(b.x + b.hw * 0.5, b.h + 2, b.z + b.hd * 0.3));
        continue;
      }
      if (b.kind === "tower" || b.kind === "office" || b.kind === "hospital" || b.kind === "station" || b.kind === "warehouse") {
        const pt = 0.35;
        const ph = b.kind === "warehouse" ? 0.5 : 0.9;
        parapets.push(new THREE.BoxGeometry(b.hw * 2, ph, pt).translate(b.x, b.h + ph / 2, b.z - b.hd + pt / 2));
        parapets.push(new THREE.BoxGeometry(b.hw * 2, ph, pt).translate(b.x, b.h + ph / 2, b.z + b.hd - pt / 2));
        parapets.push(new THREE.BoxGeometry(pt, ph, b.hd * 2).translate(b.x - b.hw + pt / 2, b.h + ph / 2, b.z));
        parapets.push(new THREE.BoxGeometry(pt, ph, b.hd * 2).translate(b.x + b.hw - pt / 2, b.h + ph / 2, b.z));
      }
      if (b.kind === "tower" || b.kind === "office" || b.kind === "hospital") {
        roofKit.push(new THREE.BoxGeometry(3, 1.6, 2.2).translate(b.x + b.hw * 0.4, b.h + 0.8, b.z - b.hd * 0.3));
        roofKit.push(new THREE.BoxGeometry(2, 1.2, 2).translate(b.x - b.hw * 0.35, b.h + 0.6, b.z + b.hd * 0.35));
        if (b.kind === "office" && b.h > 14) {
          roofKit.push(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 14).translate(b.x - b.hw * 0.3, b.h + 3.2, b.z - b.hd * 0.3));
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
            roofKit.push(new THREE.CylinderGeometry(0.08, 0.08, 1.9, 5).translate(b.x - b.hw * 0.3 + dx, b.h + 0.95, b.z - b.hd * 0.3 + dz));
        }
        if (b.kind === "tower") roofKit.push(new THREE.CylinderGeometry(0.1, 0.12, 12, 6).translate(b.x, b.h + (b.h > 55 ? 15 : 6), b.z));
      }
      if (b.kind === "store" || (b.kind === "office" && b.style % 2 === 0)) {
        // Awning over the street-side ground floor (north face).
        const aw = new THREE.BoxGeometry(b.hw * 1.8, 0.08, 1.6).rotateX(-0.35).translate(b.x, 3.3, b.z - b.hd - 0.7);
        awnings.push(aw);
      }
    }
    if (houseRoofs.length) {
      const m = new THREE.Mesh(mergeGeometries(houseRoofs), this.mats.houseRoof);
      m.castShadow = true;
      target.add(m);
    }
    if (roofKit.length) target.add(new THREE.Mesh(mergeGeometries(roofKit), this.mats.kit));
    if (parapets.length) {
      const pm = new THREE.Mesh(mergeGeometries(parapets), this.mats.parapet);
      pm.castShadow = true;
      target.add(pm);
    }
    if (awnings.length) {
      const am = new THREE.Mesh(mergeGeometries(awnings), this.mats.awning);
      am.castShadow = true;
      target.add(am);
    }

    // Signs (lit at night).
    for (const b of buildings) {
      if (!b.sign) continue;
      const colors: Record<string, [string, string]> = {
        station: ["#12305e", "#ffffff"],
        hospital: ["#ffffff", "#c8102e"],
        store: ["#b3141b", "#ffe14d"],
      };
      const [bg, fg] = colors[b.kind] ?? ["#2a2a2a", "#f5e6b8"];
      const w = Math.min(b.hw * 1.7, 14);
      const mat = new THREE.MeshBasicMaterial({ map: signTexture(b.sign, bg, fg) });
      mat.userData.chunkOwned = true;
      mat.color.setScalar(0.55 + this.night * 0.9);
      this.signMats.push(mat);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.19), mat);
      sign.position.set(b.x, Math.min(b.h - 0.8, b.kind === "store" ? 4.2 : b.h - 1.5), b.z - b.hd - 0.08);
      sign.rotation.y = Math.PI;
      target.add(sign);
    }
    if (!trees.length) return;

    // Trees: trunk + three-lobed crowns, varied tints.
    const n = trees.length;
    const trunk = new THREE.InstancedMesh(this.treeGeo.trunk, this.mats.trunk, n);
    const crown = new THREE.InstancedMesh(this.treeGeo.crown, this.mats.crown, n);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const q = new THREE.Quaternion();
    trees.forEach((t, k) => {
      q.setFromAxisAngle(up, k * 1.7);
      m4.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      trunk.setMatrixAt(k, m4);
      crown.setMatrixAt(k, m4);
      crown.setColorAt(k, col.set(["#3f6a2f", "#557f36", "#2f5a2a", "#4a6d2c", "#61803a"][k % 5]));
    });
    crown.castShadow = true;
    trunk.castShadow = true;
    target.add(trunk, crown);
  }

  private buildStreetFurniture(city: City) {
    const spots: { x: number; z: number; ry: number }[] = [];
    for (const L of city.lines)
      for (let v = 14; v < SIZE - 10; v += 24) {
        if (city.lines.some((M) => Math.abs(v - M) < HALF_STREET + 3)) continue;
        spots.push({ x: L - HALF_ROAD - 0.6, z: v, ry: 0 });
        spots.push({ x: L + HALF_ROAD + 0.6, z: v + 12, ry: Math.PI });
        spots.push({ x: v, z: L - HALF_ROAD - 0.6, ry: -Math.PI / 2 });
        spots.push({ x: v + 12, z: L + HALF_ROAD + 0.6, ry: Math.PI / 2 });
      }
    const metal = new THREE.MeshStandardMaterial({ color: "#3c4046", metalness: 0.7, roughness: 0.45 });
    const poleGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.09, 0.14, 8, 8).translate(0, 4 + KERB, 0),
      new THREE.CylinderGeometry(0.2, 0.22, 0.5, 8).translate(0, 0.25 + KERB, 0),
      new THREE.CylinderGeometry(0.05, 0.06, 2.3, 6).rotateZ(Math.PI / 2 - 0.12).translate(1.1, 7.9 + KERB, 0),
    ]);
    const headGeo = mergeGeometries([new THREE.CapsuleGeometry(0.2, 0.55, 4, 8).rotateZ(Math.PI / 2).scale(1, 0.55, 1).translate(2.2, 8.05 + KERB, 0)]);
    const pole = new THREE.InstancedMesh(poleGeo, metal, spots.length);
    const head = new THREE.InstancedMesh(headGeo, this.lampMat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    spots.forEach((s, k) => {
      q.setFromAxisAngle(up, s.ry);
      m4.compose(new THREE.Vector3(s.x, 0, s.z), q, one);
      pole.setMatrixAt(k, m4);
      head.setMatrixAt(k, m4);
    });
    pole.castShadow = true;
    this.scene.add(pole, head);

    // Traffic signals: mast arm over the road from the far-right corner, a head for each approach.
    const groups: Record<string, THREE.Matrix4[]> = {};
    const poles: THREE.Matrix4[] = [];
    for (let j = 0; j < LINES; j++)
      for (let i = 0; i < LINES; i++) {
        const p = nodePos(j * LINES + i);
        const parity = (i + j) % 2;
        const heads: { x: number; z: number; face: number; axis: "ns" | "ew" }[] = [
          { x: p.x + 5.4, z: p.z - 5.4, face: 0, axis: "ns" },
          { x: p.x - 5.4, z: p.z + 5.4, face: Math.PI, axis: "ns" },
          { x: p.x + 5.4, z: p.z + 5.4, face: -Math.PI / 2, axis: "ew" },
          { x: p.x - 5.4, z: p.z - 5.4, face: Math.PI / 2, axis: "ew" },
        ];
        for (const h of heads) {
          const m = new THREE.Matrix4().compose(new THREE.Vector3(h.x, 0, h.z), new THREE.Quaternion().setFromAxisAngle(up, h.face), one);
          poles.push(m);
          (groups[`${parity}${h.axis}`] ??= []).push(m);
        }
      }
    // In the head's frame the approaching traffic is at +z; the arm reaches over the lane at -x.
    const polesMesh = new THREE.InstancedMesh(
      mergeGeometries([
        new THREE.CylinderGeometry(0.12, 0.16, 6.4, 8).translate(0, 3.2 + KERB, 0),
        new THREE.CylinderGeometry(0.07, 0.08, 4.2, 6).rotateZ(Math.PI / 2).translate(-2.1, 6.1 + KERB, 0),
        new THREE.BoxGeometry(0.36, 1.1, 0.3).translate(-3.3, 5.35 + KERB, 0.02),
        new THREE.BoxGeometry(0.6, 1.3, 0.04).translate(-3.3, 5.35 + KERB, -0.14),
      ]),
      new THREE.MeshStandardMaterial({ color: "#2b2d30", roughness: 0.55, metalness: 0.5 }),
      poles.length,
    );
    poles.forEach((m, k) => polesMesh.setMatrixAt(k, m));
    polesMesh.castShadow = true;
    this.scene.add(polesMesh);
    const lamp = (y: number) => new THREE.SphereGeometry(0.12, 10, 8).translate(-3.3, y + KERB, 0.19);
    for (const key of Object.keys(groups)) {
      const list = groups[key];
      const mats = [
        new THREE.MeshStandardMaterial({ color: "#300", emissive: "#ff2a1a" }),
        new THREE.MeshStandardMaterial({ color: "#320", emissive: "#ffb000" }),
        new THREE.MeshStandardMaterial({ color: "#030", emissive: "#20ff6a" }),
      ] as [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
      [5.72, 5.36, 5.0].forEach((y, c) => {
        const im = new THREE.InstancedMesh(lamp(y), mats[c], list.length);
        list.forEach((m, k) => im.setMatrixAt(k, m));
        this.scene.add(im);
      });
      this.signals.push({ mats, parity: Number(key[0]), axis: key.slice(1) as "ns" | "ew" });
    }
    return spots;
  }

  /** Pools of lamplight on the pavement (night only). */
  private buildPools(spots: { x: number; z: number; ry: number }[]) {
    const tex = radialTexture("rgba(255,200,140,0.5)", "rgba(255,200,140,0)");
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), mat, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach((s, k) => {
      m4.makeTranslation(s.x + Math.cos(-s.ry) * 2.2, 0.04, s.z + Math.sin(-s.ry) * 2.2);
      pools.setMatrixAt(k, m4);
    });
    pools.renderOrder = 1;
    this.scene.add(pools);
    return pools;
  }

  /** Street furniture kinds: shared geometry + material, built once. */
  private propKinds(): Record<PropKind, { geo: THREE.BufferGeometry; mat: THREE.Material }> {
    if (this.kindsCache) return this.kindsCache;
    const kinds: Record<PropKind, { geo: THREE.BufferGeometry; mat: THREE.Material }> = {
      hydrant: {
        geo: mergeGeometries([
          new THREE.CylinderGeometry(0.13, 0.16, 0.6, 12).translate(0, 0.3, 0),
          new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.6, 0),
          new THREE.CylinderGeometry(0.05, 0.05, 0.36, 8).rotateZ(Math.PI / 2).translate(0, 0.42, 0),
        ]),
        mat: new THREE.MeshStandardMaterial({ color: "#b3261e", roughness: 0.5, metalness: 0.3 }),
      },
      bin: {
        geo: mergeGeometries([new THREE.CylinderGeometry(0.3, 0.26, 0.95, 14, 1, true).translate(0, 0.475, 0), new THREE.CylinderGeometry(0.33, 0.33, 0.06, 14).translate(0, 0.97, 0)]),
        mat: new THREE.MeshStandardMaterial({ color: "#2e4a36", roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }),
      },
      bench: {
        geo: mergeGeometries([
          new THREE.BoxGeometry(0.45, 0.06, 1.8).translate(0, 0.45, 0),
          new THREE.BoxGeometry(0.06, 0.45, 1.8).translate(0.22, 0.72, 0),
          new THREE.BoxGeometry(0.4, 0.45, 0.06).translate(0, 0.22, 0.8),
          new THREE.BoxGeometry(0.4, 0.45, 0.06).translate(0, 0.22, -0.8),
        ]),
        mat: new THREE.MeshStandardMaterial({ color: "#5b3f2a", roughness: 0.8 }),
      },
      news: {
        geo: new THREE.BoxGeometry(0.5, 1.05, 0.45).translate(0, 0.52, 0),
        mat: new THREE.MeshStandardMaterial({ color: "#1f4fa0", roughness: 0.45, metalness: 0.3 }),
      },
      meter: {
        geo: mergeGeometries([new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6).translate(0, 0.6, 0), new THREE.BoxGeometry(0.18, 0.3, 0.14).translate(0, 1.32, 0)]),
        mat: new THREE.MeshStandardMaterial({ color: "#5d6166", roughness: 0.4, metalness: 0.8 }),
      },
      mailbox: {
        geo: mergeGeometries([new THREE.BoxGeometry(0.5, 0.85, 0.45).translate(0, 0.62, 0), new THREE.CylinderGeometry(0.25, 0.25, 0.45, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.05, 0)]),
        mat: new THREE.MeshStandardMaterial({ color: "#1d3f86", roughness: 0.4, metalness: 0.4 }),
      },
      shelter: {
        geo: mergeGeometries([
          new THREE.BoxGeometry(1.6, 0.08, 3.6).translate(0.1, 2.4, 0),
          new THREE.BoxGeometry(0.06, 2.4, 0.06).translate(-0.6, 1.2, 1.7),
          new THREE.BoxGeometry(0.06, 2.4, 0.06).translate(-0.6, 1.2, -1.7),
          new THREE.BoxGeometry(0.06, 2.4, 0.06).translate(0.7, 1.2, 1.7),
          new THREE.BoxGeometry(0.06, 2.4, 0.06).translate(0.7, 1.2, -1.7),
          new THREE.BoxGeometry(0.4, 0.06, 2.4).translate(0.4, 0.45, 0),
        ]),
        mat: new THREE.MeshStandardMaterial({ color: "#6f757c", roughness: 0.35, metalness: 0.8 }),
      },
    };
    for (const k of Object.values(kinds)) k.geo.userData.shared = true;
    this.kindsCache = kinds;
    return kinds;
  }

  private buildProps(target: THREE.Object3D, props: City["props"]) {
    const kinds = this.propKinds();
    const byKind = new Map<PropKind, THREE.Matrix4[]>();
    const q = new THREE.Quaternion();
    for (const p of props) {
      q.setFromAxisAngle(up, -p.h);
      (byKind.get(p.kind) ?? byKind.set(p.kind, []).get(p.kind)!).push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, KERB, p.z), q, new THREE.Vector3(1, 1, 1)));
    }
    for (const [kind, list] of byKind) {
      const k = kinds[kind];
      const im = new THREE.InstancedMesh(k.geo, k.mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = this.quality === "high";
      target.add(im);
      if (kind === "shelter") {
        // Glass back panels.
        const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 2, 3.4).translate(-0.6, 1.3, 0), this.mats.shelterGlass, list.length);
        list.forEach((m, i) => glass.setMatrixAt(i, m));
        target.add(glass);
      }
    }
  }

  private buildManholes(city: City) {
    // Manhole covers on the roads.
    const mh: THREE.Matrix4[] = [];
    for (const L of city.lines)
      for (let v = 30; v < SIZE; v += 72) {
        mh.push(new THREE.Matrix4().makeTranslation(L + 2, 0.01, v), new THREE.Matrix4().makeTranslation(v + 20, 0.01, L - 2));
      }
    const man = new THREE.InstancedMesh(new THREE.CircleGeometry(0.45, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#2a2a2a", roughness: 0.4, metalness: 0.7 }), mh.length);
    mh.forEach((m, i) => man.setMatrixAt(i, m));
    this.scene.add(man);
  }

  // ---------------------------------------------------------------- frame

  render(cam: CamState, frameDt: number) {
    const sim = this.sim;
    const t = sim.time;
    this.timeOfDay();
    this.streamChunks();
    this.syncCars(t, frameDt);
    this.syncPeds(cam);
    this.syncFx(sim.events, t);
    this.updateCamera(cam, frameDt);
    this.updateSignals(t);
    this.updateLamps();
    this.updateWeather(frameDt);
    this.syncDeploy(t);
    this.syncAir(t, frameDt);
    const wp = sim.waypoint();
    this.marker.visible = !!wp;
    if (wp) {
      this.marker.position.set(wp.x, 0, wp.z);
      const k = 1 + Math.sin(performance.now() / 300) * 0.08;
      this.marker.children[0].scale.set(k, 1, k);
      this.marker.children[1].position.y = 6 + Math.sin(performance.now() / 400) * 0.5;
      this.marker.children[1].rotation.y += frameDt * 2;
    }
    const sp = sim.spikes;
    this.spikes.visible = !!sp;
    if (sp) {
      this.spikes.position.set(sp.x, 0, sp.z);
      this.spikes.rotation.y = -sp.h;
    }
    const focus = sim.officer;
    this.sun.target.position.set(focus.x, 0, focus.z);
    const sd = this.skyMat.uniforms.sunDir.value as THREE.Vector3;
    this.sun.position.set(focus.x + sd.x * 200, Math.max(40, sd.y * 200), focus.z + sd.z * 200);
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.clouds.position.copy(this.camera.position);
    this.clouds.rotation.y += frameDt * 0.002;
    if (this.grade) {
      this.grade.uniforms.time.value = t;
      this.grade.uniforms.night.value = this.night;
    }
    if (this.composer) this.composer.render(frameDt);
    else this.renderer.render(this.scene, this.camera);
    this.resolved = true;
  }

  private timeOfDay() {
    const hour = this.sim.clock() / 60;
    const n = hour >= 20.5 || hour < 5 ? 1 : hour >= 18.5 ? (hour - 18.5) / 2 : hour < 7 ? 1 - (hour - 5) / 2 : 0;
    this.night = Math.max(0, Math.min(1, n));
    const day = 1 - this.night;
    const w = this.weather;
    const gloom = w === "rain" ? 0.7 : w === "overcast" ? 0.5 : w === "fog" ? 0.55 : 0;
    // Sun path: rises in the east (+x) at 6, sets west at 18.
    const a = ((hour - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(a), Math.max(-0.2, Math.sin(a)), 0.35).normalize();
    const dusk = Math.max(0, 1 - Math.abs(sunDir.y) * 4) * day;
    const u = this.skyMat.uniforms;
    const top = new THREE.Color("#2f67b3").lerp(new THREE.Color("#02040b"), this.night).lerp(new THREE.Color("#5d636b").multiplyScalar(day + 0.15), gloom);
    const hor = new THREE.Color("#b9d2ea").lerp(new THREE.Color("#10182a"), this.night).lerp(new THREE.Color("#e39a5c"), dusk * (1 - gloom) * 0.8);
    hor.lerp(new THREE.Color("#8a9097").multiplyScalar(day + 0.2), gloom);
    // City glow on the night horizon.
    if (this.night > 0.5) hor.lerp(new THREE.Color("#3a2b22"), 0.35 * this.night);
    (u.top.value as THREE.Color).copy(top);
    (u.horizon.value as THREE.Color).copy(hor);
    (u.bottom.value as THREE.Color).copy(new THREE.Color("#2b2a28").multiplyScalar(0.2 + day * 0.6));
    (u.sunDir.value as THREE.Vector3).copy(this.night > 0.5 ? new THREE.Vector3(-0.4, 0.55, -0.5).normalize() : sunDir);
    (u.sunColor.value as THREE.Color).set(this.night > 0.5 ? "#9fb0d8" : dusk > 0.3 ? "#ffb070" : "#fff3d0");
    u.sunSize.value = this.night > 0.5 ? 0.99985 : 0.9996;
    u.glow.value = (1 - gloom) * (this.night > 0.5 ? 0.15 : 0.5);
    this.scene.background = null;

    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(hor).multiplyScalar(this.night > 0.5 ? 0.8 : 1);
    fog.near = w === "fog" ? 4 : 40;
    fog.far = w === "fog" ? 95 : w === "rain" ? 230 : w === "overcast" ? 330 : 280 + day * 260;
    fog.far = Math.min(fog.far, this.loadRadius - 10);
    this.hemi.intensity = (0.18 + day * 1.3) * (1 - gloom * 0.2);
    this.hemi.color.set(this.night > 0.5 ? "#51638f" : "#cfe2ff");
    this.hemi.groundColor.set(this.night > 0.5 ? "#2b2118" : "#4a4032");
    this.sun.intensity = (0.08 + day * 2.6 * (1 - dusk * 0.4)) * (1 - gloom * 0.75);
    this.sun.color.copy(u.sunColor.value as THREE.Color);
    this.renderer.toneMappingExposure = 1.05 - this.night * 0.05;
    for (const m of this.windowMats) m.emissiveIntensity = this.night * 1.4 + gloom * 0.25 * day;
    for (const m of this.signMats) m.color.setScalar(0.55 + (this.night + gloom * 0.3) * 0.9);
    this.lampMat.emissiveIntensity = this.night * 4 + gloom * 0.6;
    (this.pools.material as THREE.MeshBasicMaterial).opacity = this.night;
    this.pools.visible = this.night > 0.05;
    (this.stars.material as THREE.PointsMaterial).opacity = this.night * (1 - gloom);
    this.moon.visible = this.night > 0.5 && gloom < 0.6;
    const md = u.sunDir.value as THREE.Vector3;
    this.moon.position.copy(this.camera.position).addScaledVector(md, 900);
    const cm = this.clouds.material as THREE.MeshBasicMaterial;
    cm.opacity = gloom > 0 ? 0.95 : 0.45;
    cm.color.set(this.night > 0.5 ? "#2a3040" : gloom > 0 ? "#9aa0a8" : "#ffffff");
    // Wet streets.
    const wet = w === "rain";
    this.groundMat.roughness = wet ? 0.38 : 0.95;
    this.groundMat.color.setScalar(wet ? 0.72 : 1);
    this.groundMat.envMapIntensity = wet ? 1.6 : 0.6;
    this.walkMat.roughness = wet ? 0.5 : 0.9;
    this.walkMat.color.setScalar(wet ? 0.75 : 1);

    // Reflections: re-render the sky into a PMREM when it changes enough.
    const key = `${Math.round(this.night * 12)}|${Math.round(dusk * 6)}|${w}`;
    if (key !== this.envKey) {
      this.envKey = key;
      this.envRT?.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0.03);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.35 + day * 0.65;
    }
  }

  private updateSignals(t: number) {
    for (const s of this.signals) {
      const st = lightFor(s.parity, s.axis, t);
      s.mats[0].emissiveIntensity = st === "red" ? 4 : 0.04;
      s.mats[1].emissiveIntensity = st === "amber" ? 4 : 0.04;
      s.mats[2].emissiveIntensity = st === "green" ? 4 : 0.04;
    }
  }

  /** Real lights on the few street lamps nearest the camera. */
  private updateLamps() {
    const now = performance.now();
    if (now - this.lampAt < 250) return;
    this.lampAt = now;
    const c = this.camPos;
    const near = this.lampSpots
      .map((s) => ({ s, d: (s.x - c.x) ** 2 + (s.z - c.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lampLights.length);
    this.lampLights.forEach((l, i) => {
      const s = near[i]?.s;
      l.intensity = s ? this.night * 60 : 0;
      if (s) l.position.set(s.x + Math.cos(-s.ry) * 2.2, 7.6, s.z + Math.sin(-s.ry) * 2.2);
    });
  }

  private updateWeather(dt: number) {
    if (!this.rain.visible) return;
    const n = this.rainPos.length / 6;
    const fall = 22 * dt;
    const c = this.camPos;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      this.rainPos[o + 1] -= fall;
      this.rainPos[o + 4] -= fall;
      if (this.rainPos[o + 1] < 0 || Math.abs(this.rainPos[o] - c.x) > 32 || Math.abs(this.rainPos[o + 2] - c.z) > 32) this.resetDrop(i, false);
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private syncCars(t: number, dt: number) {
    const sim = this.sim;
    const live = new Set<string>();
    const o = sim.officer;
    const phase = Math.floor(t * 7) % 4;
    const strobe = Math.floor(t * 18) % 2 === 0;
    const nightGlow = Math.max(this.night, this.weather === "rain" || this.weather === "fog" ? 0.6 : 0);
    const high = this.quality === "high";
    for (const c of sim.cars) {
      live.add(c.id);
      let m = this.cars.get(c.id);
      if (!m) {
        m = buildCar(c.kind, c.color, c.reg?.plate ?? (c.spec.police ? "1A12" : ""), high ? "high" : "low");
        this.cars.set(c.id, m);
        this.scene.add(m.group);
        if (c === sim.unit) {
          for (const b of this.beams) m.group.add(b, b.target);
          this.bar[0].position.set(0, 2.1, -0.5);
          this.bar[1].position.set(0, 2.1, 0.5);
          m.group.add(...this.bar);
        }
      }
      const d = Math.hypot(c.x - o.x, c.z - o.z);
      m.group.visible = d < 300;
      if (!m.group.visible) continue;
      const vf = speedOf(c);
      m.group.position.set(c.x, 0, c.z);
      m.group.rotation.set(0, -c.h, 0);
      // Body roll in turns, pitch under braking.
      m.group.rotation.x = Math.max(-0.05, Math.min(0.05, -c.steer * vf * 0.0022));
      m.group.rotation.z = c.braking && vf > 2 ? -0.018 : c.throttle > 0.5 && vf < 12 ? 0.012 : 0;
      // Wheels spin and the fronts steer.
      const steerAngle = -c.steer * 0.5 / (1 + Math.abs(vf) / 16);
      m.wheels.forEach((w, i) => {
        w.rotation.y = i < 2 ? steerAngle : 0;
        (w.children[0] as THREE.Object3D).rotation.z = -c.wheel;
      });
      // Lamps.
      m.tail.emissiveIntensity = c.braking ? 3 : 0.3 + nightGlow * 0.9;
      (m.heads.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + nightGlow * 3;
      (m.reverse.material as THREE.MeshStandardMaterial).emissiveIntensity = vf < -0.5 ? 2 : 0;
      const sig = signalOf(c);
      const blink = Math.floor(t * 2.6) % 2 === 0;
      m.amberL.emissiveIntensity = (sig === -1 || sig === 2) && blink ? 5 : 0.1;
      m.amberR.emissiveIntensity = (sig === 1 || sig === 2) && blink ? 5 : 0.1;
      for (const g of m.headGlow) (g.material as THREE.SpriteMaterial).opacity = nightGlow * 0.9;
      for (const g of m.tailGlow) (g.material as THREE.SpriteMaterial).opacity = c.braking ? 0.9 : nightGlow * 0.45;
      (m.beam.material as THREE.MeshBasicMaterial).opacity = nightGlow * 0.55;
      m.beam.visible = nightGlow > 0.05 && c.health > 0;
      if (m.red && m.blue) {
        const on = c.lights;
        const r = on && phase < 2 && strobe;
        const b = on && phase >= 2 && strobe;
        m.red.emissiveIntensity = r ? 8 : on ? 0.4 : 0;
        m.blue.emissiveIntensity = b ? 8 : on ? 0.4 : 0;
        for (const g of m.redGlow ?? []) (g.material as THREE.SpriteMaterial).opacity = r ? 1 : 0;
        for (const g of m.blueGlow ?? []) (g.material as THREE.SpriteMaterial).opacity = b ? 1 : 0;
      }
      if (c === sim.unit) {
        for (const b of this.beams) b.intensity = nightGlow * 90;
        this.bar[0].intensity = c.lights && phase < 2 ? 30 : 0;
        this.bar[1].intensity = c.lights && phase >= 2 ? 30 : 0;
      }
      // Wrecked: smoke from the bonnet.
      if (c.health < 30) {
        if (!m.smoke) {
          m.smoke = new THREE.Mesh(this.smokeGeo, this.smokeMat);
          m.group.add(m.smoke);
        }
        const k = (t * 0.8) % 1;
        m.smoke.position.set(c.spec.len * 0.35, 1 + k * 2.2, 0);
        m.smoke.scale.setScalar(0.6 + k * 1.6);
      } else if (m.smoke) {
        m.smoke.removeFromParent();
        m.smoke = undefined;
      }
      // Skid marks when sliding or braking hard.
      const r = right(c.h);
      const lat = Math.abs(c.vx * r.x + c.vz * r.z);
      if ((lat > 2.2 || (c.braking && Math.abs(vf) > 12)) && d < 120) {
        const last = this.skidAt.get(c.id) ?? 0;
        if (t - last > 0.035) {
          this.skidAt.set(c.id, t);
          const f = forward(c.h);
          for (const side of [-1, 1]) {
            const x = c.x - f.x * c.spec.len * 0.32 + r.x * side * (c.spec.wid / 2 - 0.15);
            const z = c.z - f.z * c.spec.len * 0.32 + r.z * side * (c.spec.wid / 2 - 0.15);
            const mm = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.015, z), new THREE.Quaternion().setFromAxisAngle(up, -Math.atan2(c.vz, c.vx)), new THREE.Vector3(1, 1, 1));
            this.skids.setMatrixAt(this.skidN % 900, mm);
            this.skidN++;
          }
          this.skids.count = Math.min(900, this.skidN);
          this.skids.instanceMatrix.needsUpdate = true;
        }
      }
    }
    for (const [id, m] of this.cars)
      if (!live.has(id)) {
        m.group.removeFromParent();
        this.cars.delete(id);
      }
    void dt;
  }

  private pose(p: Ped): Pose {
    switch (p.state) {
      case "handsup":
        return "handsup";
      case "cuffed":
      case "escort":
        return "cuffed";
      case "down":
        return "down";
      case "dead":
        return "dead";
      case "attack":
        return p.drawn ? "aim" : "walk";
      case "stand":
      case "talk":
        return "stand";
      default:
        return "walk";
    }
  }

  private syncPeds(cam: CamState) {
    const sim = this.sim;
    const live = new Set<string>();
    const o = sim.officer;
    const t = sim.time;
    const HAIR = ["#1d140e", "#3b2618", "#6b4a2b", "#a8844f", "#0d0d0d", "#8a8a8a"];
    for (const p of sim.peds) {
      if (p.state === "driving" || p.state === "incar" || p.state === "gone") continue;
      if (Math.hypot(p.x - o.x, p.z - o.z) > 130) continue;
      live.add(p.id);
      const key = `${p.skin}${p.shirt}${p.pants}${p.role === "officer"}`;
      let m = this.peds.get(p.id);
      if (!m || m.key !== key) {
        m?.group.removeFromParent();
        const n = p.id.length + p.id.charCodeAt(p.id.length - 1);
        m = Object.assign(buildPed({ skin: p.skin, shirt: p.shirt, pants: p.pants, officer: p.role === "officer", hair: HAIR[n % HAIR.length], long: n % 3 === 0 }), { key });
        this.peds.set(p.id, m);
        this.scene.add(m.group);
      }
      m.group.position.set(p.x, onSidewalk(p.x, p.z) ? KERB : 0, p.z);
      m.group.rotation.set(0, -p.h, 0);
      posePed(m, this.pose(p), p.step, p.state === "walk" ? 1.4 : p.speed, t + p.x);
      m.gun.visible = p.drawn;
      if (p.state === "dead" && !this.blood.has(p.id)) {
        const b = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#3a0505", roughness: 0.1, transparent: true, opacity: 0.85, depthWrite: false }));
        b.position.set(p.x, (onSidewalk(p.x, p.z) ? KERB : 0) + 0.02, p.z);
        this.scene.add(b);
        this.blood.set(p.id, b);
      }
    }
    for (const [id, m] of this.peds)
      if (!live.has(id)) {
        m.group.removeFromParent();
        this.peds.delete(id);
      }
    for (const [id, b] of this.blood)
      if (!sim.peds.some((p) => p.id === id)) {
        b.removeFromParent();
        this.blood.delete(id);
      }
    const pl = sim.player;
    const om = this.officer;
    om.group.visible = !pl.inCar;
    if (!pl.inCar) {
      om.group.position.set(pl.x, onSidewalk(pl.x, pl.z) ? KERB : 0, pl.z);
      om.group.rotation.set(0, -pl.h, 0);
      const moving = pl.moving ? (pl.sprinting ? 6.5 : 3.2) : 0;
      this.officerStep += moving / 60;
      posePed(om, cam.aiming ? "aim" : "walk", this.officerStep, moving, t);
      this.torch.intensity = sim.flashlight ? 60 : 0;
      om.gun.visible = pl.weapon === "pistol" && cam.aiming;
      om.taser.visible = pl.weapon === "taser" && cam.aiming;
    }
  }

  private syncFx(events: SimEvent[], t: number) {
    const o = this.sim.officer;
    for (const e of events) {
      if (e.type === "shot" || e.type === "taser") {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(e.x, 1.4, e.z), new THREE.Vector3(e.tx, 1.25, e.tz)]);
        const color = e.type === "taser" ? "#ffe35a" : e.by === "ped" ? "#ff9a5a" : "#fff0b0";
        const lineObj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        this.scene.add(lineObj);
        this.fx.push({ obj: lineObj, until: t + (e.type === "taser" ? 0.5 : 0.06) });
        const flash = new THREE.PointLight(e.type === "taser" ? "#8fb4ff" : "#ffb35a", 25, 12, 2);
        flash.position.set(e.x, 1.5, e.z);
        this.scene.add(flash);
        this.fx.push({ obj: flash, until: t + 0.05 });
        if (Math.hypot(e.x - o.x, e.z - o.z) < 25) this.shake = Math.max(this.shake, e.type === "shot" ? 0.12 : 0.05);
      } else if (e.type === "crash" && e.player) this.shake = Math.max(this.shake, Math.min(0.6, e.speed / 25));
      else if (e.type === "hurt") this.shake = Math.max(this.shake, 0.2);
    }
    this.fx = this.fx.filter((f) => {
      if (t < f.until) return true;
      f.obj.removeFromParent();
      if (f.obj instanceof THREE.Line) f.obj.geometry.dispose();
      return false;
    });
  }

  private updateCamera(cam: CamState, dt: number) {
    const sim = this.sim;
    const pl = sim.player;
    const k = Math.min(1, dt * 6);
    // Bumper cam hides the unit's body (its headlight and light-bar lights stay on).
    const unitModel = this.cars.get(sim.unit.id);
    const hide = pl.inCar && cam.view === "hood";
    if (unitModel) for (const ch of unitModel.group.children) if (!(ch instanceof THREE.Light) && ch.type !== "Object3D") ch.visible = !hide;
    if (pl.inCar) {
      const u = sim.unit;
      const v = Math.abs(speedOf(u));
      const f0 = forward(u.h);
      if (cam.view === "hood") {
        // Bumper cam: just ahead of the grille, the car itself hidden.
        const want = new THREE.Vector3(u.x + f0.x * (u.spec.len / 2 + 0.3), 0.95, u.z + f0.z * (u.spec.len / 2 + 0.3));
        this.camPos.copy(want);
        const fl = forward(u.h + cam.orbit);
        this.camLook.set(u.x + fl.x * 30, 1.1, u.z + fl.z * 30);
        this.camera.fov += (70 - this.camera.fov) * k;
      } else {
        const far = cam.view === "far";
        const back = (far ? 11 : 7) + v * 0.08;
        const h = u.h + cam.orbit;
        const f = forward(h);
        const want = new THREE.Vector3(u.x - f.x * back, (far ? 4.4 : 2.7) + v * 0.02, u.z - f.z * back);
        this.camPos.lerp(want, this.resolved ? k : 1);
        const look = new THREE.Vector3(u.x + f.x * 4, 1.2, u.z + f.z * 4);
        this.camLook.lerp(look, this.resolved ? Math.min(1, dt * 10) : 1);
        this.camera.fov += (62 + Math.min(14, v * 0.35) - this.camera.fov) * k;
      }
    } else {
      const f = forward(cam.yaw);
      const r = { x: -f.z, z: f.x };
      const dist = cam.aiming ? 1.9 : cam.view === "far" ? 5 : 3.2;
      const side = cam.aiming ? 0.7 : 0.55;
      const cy = Math.cos(cam.pitch);
      const base = onSidewalk(pl.x, pl.z) ? KERB : 0;
      const bob = pl.moving ? Math.sin(this.officerStep * 4.4) * (pl.sprinting ? 0.05 : 0.025) : 0;
      const want = new THREE.Vector3(pl.x - f.x * dist * cy + r.x * side, base + 1.72 + bob - Math.sin(cam.pitch) * dist, pl.z - f.z * dist * cy + r.z * side);
      this.camPos.lerp(want, this.resolved ? Math.min(1, dt * 14) : 1);
      const look = new THREE.Vector3(pl.x + f.x * 20 * cy + r.x * side, base + 1.6 + Math.sin(cam.pitch) * 20, pl.z + f.z * 20 * cy + r.z * side);
      this.camLook.lerp(look, this.resolved ? Math.min(1, dt * 18) : 1);
      this.camera.fov += ((cam.aiming ? 46 : 64) - this.camera.fov) * Math.min(1, dt * 10);
    }
    this.camera.position.copy(this.camPos);
    this.camera.position.y = Math.max(0.6, this.camera.position.y);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.max(0, 1 - dt * 6);
    }
    this.camera.lookAt(this.camLook);
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------- deployables

  private buildDeploy(d: Deployable) {
    const g = new THREE.Group();
    const cone = (x: number, z: number) => {
      const c = new THREE.Mesh(this.coneGeo, this.coneMat);
      c.position.set(x, 0, z);
      c.castShadow = true;
      g.add(c);
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ff3a1a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      flare.scale.set(1.4, 1.4, 1);
      flare.position.set(x, 0.3, z);
      flare.userData.flare = true;
      g.add(flare);
    };
    const striped = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.6 });
    if (d.kind === "checkpoint") {
      // Cones down the centre line, a sawhorse at the stop line, a sign on the approach.
      const r = { x: -d.dz, z: d.dx };
      const cx = d.x - r.x * 2;
      const cz = d.z - r.z * 2;
      for (let a = -14; a <= 6; a += 3) cone(cx + d.dx * a - r.x * 0.2, cz + d.dz * a - r.z * 0.2);
      const saw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 0.08), striped);
      saw.position.set(d.x + r.x * 1.9 + d.dx * 1.5, 1, d.z + r.z * 1.9 + d.dz * 1.5);
      saw.rotation.y = -Math.atan2(r.z, r.x);
      g.add(saw);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: textPanel("POLICE", "CHECKPOINT", "#12305e"), side: THREE.DoubleSide }));
      sign.position.set(d.x + r.x * 2.9 - d.dx * 16, 1.2, d.z + r.z * 2.9 - d.dz * 16);
      sign.rotation.y = -Math.atan2(-d.dz, -d.dx) + Math.PI / 2;
      g.add(sign);
    } else if (d.kind === "roadblock") {
      const across = d.hw! > d.hd! ? { x: 1, z: 0 } : { x: 0, z: 1 };
      const len = Math.max(d.hw!, d.hd!) * 2;
      for (const off of [-0.25, 0.25]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 0.1), striped);
        bar.position.set(d.x + (across.x ? 0 : off), 0.9, d.z + (across.z ? 0 : off));
        bar.rotation.y = across.x ? 0 : Math.PI / 2;
        bar.castShadow = true;
        g.add(bar);
        for (const e of [-len / 2 + 0.3, len / 2 - 0.3]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.5), this.mats.kit);
          leg.position.set(d.x + across.x * e + (across.x ? 0 : off), 0.55, d.z + across.z * e + (across.z ? 0 : off));
          g.add(leg);
        }
      }
      for (const e of [-3, -1, 1, 3]) cone(d.x + across.x * e - (across.x ? 0 : 1.2), d.z + across.z * e - (across.z ? 0 : 1.2));
    } else for (const p of d.points ?? []) cone(p.x, p.z);
    return g;
  }

  private syncDeploy(t: number) {
    const live = new Set<string>();
    for (const d of this.sim.deploy) {
      live.add(d.id);
      let g = this.deployMeshes.get(d.id);
      if (!g) {
        g = this.buildDeploy(d);
        this.deployMeshes.set(d.id, g);
        this.scene.add(g);
      }
      const flick = 0.75 + Math.sin(t * 17 + d.x) * 0.25;
      g.traverse((o) => {
        if (o.userData.flare) ((o as THREE.Sprite).material as THREE.SpriteMaterial).opacity = this.night * flick;
      });
    }
    for (const [id, g] of this.deployMeshes)
      if (!live.has(id)) {
        g.removeFromParent();
        this.deployMeshes.delete(id);
      }
  }

  private syncAir(t: number, dt: number) {
    const a = this.sim.air;
    this.heli.visible = !!a;
    if (!a) {
      this.searchlight.intensity = 0;
      return;
    }
    const orbit = t * 0.35;
    this.heli.position.set(a.x + Math.cos(orbit) * 26, 48, a.z + Math.sin(orbit) * 26);
    this.heli.rotation.y = -orbit - Math.PI / 2;
    this.heli.rotation.z = 0.08;
    this.rotor.rotation.y += dt * 40;
    const tgt = this.sim.car(a.target) ?? this.sim.ped(a.target);
    if (tgt) this.searchlight.target.position.set(tgt.x, 0, tgt.z);
    this.searchlight.intensity = Math.max(0.3, this.night) * 400;
  }

  destroy() {
    this.ro.disconnect();
    this.composer?.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.canvas.remove();
  }
}
