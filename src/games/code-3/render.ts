import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { HALF_ROAD, HALF_STREET, LINES, lightFor, line, nodePos, SIZE, type Building, type City } from "./city";
import { buildCar, buildPed, posePed, type CarModel, type PedModel, type Pose } from "./models";
import type { Code3Sim, Ped, SimEvent } from "./sim";
import { forward, speedOf, type Car } from "./vehicles";

export type Quality = "high" | "low";

/** Camera control handed in by the game each frame. */
export interface CamState {
  /** On foot: aim yaw / pitch. In the car: orbit offset from behind (0 = straight behind). */
  yaw: number;
  pitch: number;
  orbit: number;
  far: boolean;
  aiming: boolean;
}

const PX = 4; // ground texture pixels per metre

/** Tile of facade: 4 bays × 4 floors (16 m × 14 m). */
function facade(kind: string, seed: number) {
  const W = 256;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const lit = document.createElement("canvas");
  lit.width = W;
  lit.height = H;
  const g = c.getContext("2d")!;
  const e = lit.getContext("2d")!;
  e.fillStyle = "#000";
  e.fillRect(0, 0, W, H);
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const base: Record<string, [string, string]> = {
    tower0: ["#5d6f82", "#2b3a4a"],
    tower1: ["#7d8894", "#1f2a36"],
    tower2: ["#9aa3ab", "#26323f"],
    tower3: ["#4a5866", "#1a2530"],
    office0: ["#9c7358", "#2a2622"],
    office1: ["#b4a58e", "#2b2b2b"],
    office2: ["#8f8575", "#24262a"],
    office3: ["#a0aca4", "#262a2c"],
    house: ["#e7dfcc", "#3b3a36"],
    warehouse: ["#8a877e", "#3a3a38"],
    store: ["#d8d2c4", "#2a3440"],
    station: ["#c7c1b3", "#22303f"],
    hospital: ["#eef0f2", "#5b7a92"],
  };
  const [wall, glass] = base[kind] ?? base.office0;
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  // Wall grain.
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
    g.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  const bays = 4;
  const floors = 4;
  const bw = W / bays;
  const fh = H / floors;
  for (let f = 0; f < floors; f++)
    for (let b = 0; b < bays; b++) {
      const x = b * bw;
      const y = f * fh;
      if (kind.startsWith("tower")) {
        // Curtain wall: glass with mullions.
        g.fillStyle = glass;
        g.fillRect(x + 3, y + 6, bw - 6, fh - 12);
        g.fillStyle = "rgba(255,255,255,0.08)";
        g.fillRect(x + 3, y + 6, (bw - 6) * 0.35, fh - 12);
      } else if (kind === "warehouse") {
        if (f === floors - 1) {
          g.fillStyle = "#6d6a62";
          g.fillRect(x + 8, y + 10, bw - 16, fh - 10);
          for (let s = 0; s < 8; s++) {
            g.fillStyle = "rgba(0,0,0,0.25)";
            g.fillRect(x + 8, y + 14 + s * 6, bw - 16, 1);
          }
        } else if (f === 0) {
          g.fillStyle = glass;
          g.fillRect(x + 12, y + 20, bw - 24, 14);
        }
        continue;
      } else if (kind === "store" && f === floors - 1) {
        g.fillStyle = glass;
        g.fillRect(x + 2, y + 8, bw - 4, fh - 8);
      } else {
        g.fillStyle = glass;
        g.fillRect(x + 14, y + 14, bw - 28, fh - 26);
        g.fillStyle = "rgba(255,255,255,0.12)";
        g.fillRect(x + 14, y + 14, bw - 28, 3);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(x + 12, y + fh - 12, bw - 24, 3);
      }
      // Lit at night?
      if (rnd() < (kind === "house" ? 0.45 : 0.35)) {
        const warm = rnd() < 0.7;
        e.fillStyle = warm ? "#ffcf8a" : "#cfe6ff";
        if (kind.startsWith("tower")) e.fillRect(x + 3, y + 6, bw - 6, fh - 12);
        else if (kind === "store" && f === floors - 1) e.fillRect(x + 2, y + 8, bw - 4, fh - 8);
        else e.fillRect(x + 14, y + 14, bw - 28, fh - 26);
      }
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  const te = new THREE.CanvasTexture(lit);
  te.colorSpace = THREE.SRGBColorSpace;
  te.wrapS = te.wrapT = THREE.RepeatWrapping;
  return { map: t, lit: te };
}

function paintGround(city: City) {
  const S = Math.ceil(SIZE * PX);
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  const m = (v: number) => v * PX;
  const colors: Record<string, string> = {
    downtown: "#8a8984",
    midtown: "#7d7b74",
    suburbs: "#4f6b3b",
    park: "#4c7438",
    industrial: "#6a6862",
    station: "#343538",
  };
  g.fillStyle = "#6f6d67";
  g.fillRect(0, 0, S, S);
  for (const b of city.blocks) {
    g.fillStyle = colors[b.district];
    g.fillRect(m(b.x0), m(b.z0), m(b.x1 - b.x0), m(b.z1 - b.z0));
    if (b.district === "suburbs" || b.district === "park") {
      // Mottled grass.
      for (let k = 0; k < 400; k++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? "30,50,20" : "120,140,80"},0.12)`;
        g.beginPath();
        g.arc(m(b.x0 + Math.random() * (b.x1 - b.x0)), m(b.z0 + Math.random() * (b.z1 - b.z0)), m(0.5 + Math.random() * 1.5), 0, Math.PI * 2);
        g.fill();
      }
    }
    if (b.district === "suburbs") {
      // Driveways.
      g.fillStyle = "#8d8a82";
      for (let a = 0; a < 3; a++) {
        const lw = (b.x1 - b.x0) / 3;
        g.fillRect(m(b.x0 + lw * (a + 0.5) + 3), m(b.z0), m(2.6), m(7));
        g.fillRect(m(b.x0 + lw * (a + 0.5) + 3), m(b.z1 - 7), m(2.6), m(7));
      }
    }
    if (b.district === "station") {
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.lineWidth = m(0.15);
      for (let k = 0; k < 16; k++) {
        const x = b.x0 + 4 + k * 3.1;
        g.beginPath();
        g.moveTo(m(x), m(b.z0 + 4));
        g.lineTo(m(x), m(b.z0 + 9));
        g.stroke();
      }
    }
  }
  // Sidewalks then carriageways.
  for (const L of city.lines) {
    g.fillStyle = "#a19e96";
    g.fillRect(m(L - HALF_STREET), 0, m(HALF_STREET * 2), S);
    g.fillRect(0, m(L - HALF_STREET), S, m(HALF_STREET * 2));
  }
  // Sidewalk slabs.
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 1;
  for (const L of city.lines)
    for (let v = 0; v < SIZE; v += 2) {
      g.beginPath();
      g.moveTo(m(L - HALF_STREET), m(v));
      g.lineTo(m(L - HALF_ROAD), m(v));
      g.moveTo(m(L + HALF_ROAD), m(v));
      g.lineTo(m(L + HALF_STREET), m(v));
      g.moveTo(m(v), m(L - HALF_STREET));
      g.lineTo(m(v), m(L - HALF_ROAD));
      g.moveTo(m(v), m(L + HALF_ROAD));
      g.lineTo(m(v), m(L + HALF_STREET));
      g.stroke();
    }
  for (const L of city.lines) {
    g.fillStyle = "#2d2f33";
    g.fillRect(m(L - HALF_ROAD), 0, m(HALF_ROAD * 2), S);
    g.fillRect(0, m(L - HALF_ROAD), S, m(HALF_ROAD * 2));
  }
  // Asphalt grain and patches.
  for (let k = 0; k < 60000; k++) {
    const shade = Math.random() < 0.5 ? "0,0,0" : "255,255,255";
    g.fillStyle = `rgba(${shade},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  // Kerbs.
  g.fillStyle = "#c9c6bd";
  for (const L of city.lines) {
    for (const off of [-HALF_ROAD, HALF_ROAD]) {
      g.fillRect(m(L + off) - 1, 0, 2, S);
      g.fillRect(0, m(L + off) - 1, S, 2);
    }
  }
  // Markings, away from the intersections.
  const inX = (v: number) => city.lines.some((L) => Math.abs(v - L) < HALF_STREET + 0.5);
  for (const L of city.lines) {
    for (let v = 0; v < SIZE; v += 0.5) {
      if (inX(v)) continue;
      // Double yellow centre line.
      g.fillStyle = "#e2b83a";
      g.fillRect(m(L - 0.3), m(v), m(0.18), m(0.5));
      g.fillRect(m(L + 0.12), m(v), m(0.18), m(0.5));
      g.fillRect(m(v), m(L - 0.3), m(0.5), m(0.18));
      g.fillRect(m(v), m(L + 0.12), m(0.5), m(0.18));
    }
  }
  // Crosswalks and stop lines at every intersection approach.
  g.fillStyle = "#e9e9e4";
  for (let j = 0; j < LINES; j++)
    for (let i = 0; i < LINES; i++) {
      const X = line(i);
      const Z = line(j);
      for (let s = -HALF_ROAD + 0.4; s < HALF_ROAD - 0.3; s += 1) {
        for (const d of [-1, 1]) {
          // Zebra across the N/S arms and E/W arms.
          g.fillRect(m(X + s), m(Z + d * (HALF_STREET - 0.4) - 1.2), m(0.5), m(2.4));
          g.fillRect(m(X + d * (HALF_STREET - 0.4) - 1.2), m(Z + s), m(2.4), m(0.5));
        }
      }
      // Stop lines on the right-hand lane of each approach.
      g.fillRect(m(X - HALF_ROAD), m(Z - HALF_STREET - 2.2), m(HALF_ROAD), m(0.4));
      g.fillRect(m(X), m(Z + HALF_STREET + 1.8), m(HALF_ROAD), m(0.4));
      g.fillRect(m(X - HALF_STREET - 2.2), m(Z), m(0.4), m(HALF_ROAD));
      g.fillRect(m(X + HALF_STREET + 1.8), m(Z - HALF_ROAD), m(0.4), m(HALF_ROAD));
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
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
    // North (-z), east, south, west faces, counter-clockwise from outside.
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
  const roofs = new THREE.BufferGeometry();
  roofs.setAttribute("position", new THREE.Float32BufferAttribute(roofPos, 3));
  roofs.setIndex(roofIdx);
  roofs.computeVertexNormals();
  return { walls, roofs };
}

function signTexture(text: string, bg: string, fg: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = fg;
  g.font = "bold 58px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 52, 490);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function radialTexture(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Fx {
  obj: THREE.Object3D;
  until: number;
}

export class Code3View {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  private composer: EffectComposer | null = null;
  private hemi = new THREE.HemisphereLight("#bcd4ff", "#3a3228", 0.6);
  private sun = new THREE.DirectionalLight("#ffffff", 1);
  private cars = new Map<string, CarModel>();
  private peds = new Map<string, PedModel & { key: string }>();
  private officer: PedModel;
  private windowMats: THREE.MeshStandardMaterial[] = [];
  private lampMat = new THREE.MeshStandardMaterial({ color: "#fff4d0", emissive: "#ffd79a", emissiveIntensity: 0 });
  private pools: THREE.InstancedMesh;
  private signals: { mats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]; parity: number; axis: "ns" | "ew" }[] = [];
  private beams: THREE.SpotLight[] = [];
  private bar: [THREE.PointLight, THREE.PointLight];
  private marker: THREE.Group;
  private fx: Fx[] = [];
  private blood = new Map<string, THREE.Mesh>();
  private smokeGeo = new THREE.SphereGeometry(0.5, 8, 6);
  private smokeMat = new THREE.MeshBasicMaterial({ color: "#4b4b4b", transparent: true, opacity: 0.35, depthWrite: false });
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private night = 1;
  private officerStep = 0;
  private ro: ResizeObserver;
  private resolved = false;

  constructor(
    private host: HTMLElement,
    private sim: Code3Sim,
    private quality: Quality,
  ) {
    const high = quality === "high";
    this.renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: "high-performance", stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.75 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "absolute inset-0 h-full w-full";
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);

    const city = sim.city;
    this.scene.fog = new THREE.Fog("#0b1020", 60, 380);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = high;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.far = 400;
    this.sun.shadow.bias = -0.0005;

    // Ground: city painted to one texture, plus a big plain beyond the edge.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2).translate(SIZE / 2, 0, SIZE / 2),
      new THREE.MeshStandardMaterial({ map: paintGround(city), roughness: 0.92 }),
    );
    ground.receiveShadow = true;
    this.scene.add(ground);
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE * 4, SIZE * 4).rotateX(-Math.PI / 2).translate(SIZE / 2, -0.05, SIZE / 2),
      new THREE.MeshStandardMaterial({ color: "#39452f", roughness: 1 }),
    );
    this.scene.add(outer);

    this.buildBuildings(city);
    this.pools = this.buildPools(this.buildStreetFurniture(city));

    // The officer on foot.
    this.officer = buildPed({ skin: "#d8a47f", shirt: "#1f2b44", pants: "#1a2233", officer: true });
    this.scene.add(this.officer.group);

    // Unit headlights and light bar lights.
    for (const side of [-1, 1]) {
      const s = new THREE.SpotLight("#fff1d6", 0, 60, 0.5, 0.5, 1.4);
      s.position.set(2.4, 0.8, side * 0.6);
      s.target.position.set(20, 0, side * 1.5);
      this.beams.push(s);
    }
    this.bar = [new THREE.PointLight("#ff2030", 0, 26, 1.6), new THREE.PointLight("#2050ff", 0, 26, 1.6)];

    // GPS marker.
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 4, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffd21f", transparent: true, opacity: 0.55, depthWrite: false }),
    );
    ring.position.y = 0.06;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: "#ffd21f" }));
    arrow.position.y = 6;
    this.marker.add(ring, arrow);
    this.scene.add(this.marker);

    if (high) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.45, 0.9));
      this.composer.addPass(new OutputPass());
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
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

  private buildBuildings(city: City) {
    const groups = new Map<string, Building[]>();
    for (const b of city.buildings) {
      const key = b.kind === "tower" || b.kind === "office" ? `${b.kind}${b.style}` : b.kind;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(b);
    }
    let seed = 1;
    const roofs: THREE.BufferGeometry[] = [];
    for (const [key, list] of groups) {
      const tex = facade(key, seed++);
      const { walls, roofs: r } = buildingGeometry(list);
      roofs.push(r);
      const mat = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.lit, emissive: "#ffffff", emissiveIntensity: 1, roughness: 0.82, metalness: key.startsWith("tower") ? 0.35 : 0 });
      this.windowMats.push(mat);
      const mesh = new THREE.Mesh(walls, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    const roofMesh = new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ color: "#4a4a48", roughness: 1 }));
    roofMesh.receiveShadow = true;
    this.scene.add(roofMesh);

    // Pitched roofs on houses; AC units on towers.
    const houseRoofs: THREE.BufferGeometry[] = [];
    const ac: THREE.BufferGeometry[] = [];
    for (const b of city.buildings) {
      if (b.kind === "house") {
        const g = new THREE.CylinderGeometry(0.01, b.hd * 1.15, 3, 4, 1).rotateY(Math.PI / 4);
        g.scale(b.hw / b.hd, 1, 1);
        houseRoofs.push(g.translate(b.x, b.h + 1.5, b.z));
      } else if (b.kind === "tower" || b.kind === "office" || b.kind === "hospital") {
        ac.push(new THREE.BoxGeometry(3, 1.6, 2.2).translate(b.x + b.hw * 0.4, b.h + 0.8, b.z - b.hd * 0.3));
        ac.push(new THREE.BoxGeometry(2, 1.2, 2).translate(b.x - b.hw * 0.35, b.h + 0.6, b.z + b.hd * 0.35));
      }
    }
    if (houseRoofs.length) {
      const m = new THREE.Mesh(mergeGeometries(houseRoofs), new THREE.MeshStandardMaterial({ color: "#5a3f35", roughness: 0.9, flatShading: true }));
      m.castShadow = true;
      this.scene.add(m);
    }
    if (ac.length) this.scene.add(new THREE.Mesh(mergeGeometries(ac), new THREE.MeshStandardMaterial({ color: "#9a9c9e", roughness: 0.7 })));

    // Signs.
    for (const b of city.buildings) {
      if (!b.sign) continue;
      const colors: Record<string, [string, string]> = {
        station: ["#12305e", "#ffffff"],
        hospital: ["#ffffff", "#c8102e"],
        store: ["#b3141b", "#ffe14d"],
      };
      const [bg, fg] = colors[b.kind] ?? ["#2a2a2a", "#f5e6b8"];
      const w = Math.min(b.hw * 1.7, 14);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.19), new THREE.MeshBasicMaterial({ map: signTexture(b.sign, bg, fg), toneMapped: false }));
      sign.position.set(b.x, Math.min(b.h - 0.8, b.kind === "store" ? 3.9 : b.h - 1.5), b.z - b.hd - 0.06);
      sign.rotation.y = Math.PI;
      this.scene.add(sign);
    }

    // Trees.
    const n = city.trees.length;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ color: "#4b3526" }), n);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.9, 1).translate(0, 3.8, 0), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, flatShading: true }), n);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    city.trees.forEach((t, k) => {
      m4.makeScale(t.s, t.s, t.s).setPosition(t.x, 0, t.z);
      trunk.setMatrixAt(k, m4);
      crown.setMatrixAt(k, m4);
      crown.setColorAt(k, col.set(k % 3 === 0 ? "#3f6a2f" : k % 3 === 1 ? "#557f36" : "#2f5a2a"));
    });
    crown.castShadow = true;
    this.scene.add(trunk, crown);
  }

  private buildStreetFurniture(city: City) {
    // Street lights along both kerbs, away from intersections.
    const spots: { x: number; z: number; ry: number }[] = [];
    for (const L of city.lines)
      for (let v = 14; v < SIZE - 10; v += 24) {
        if (city.lines.some((M) => Math.abs(v - M) < HALF_STREET + 3)) continue;
        spots.push({ x: L - HALF_ROAD - 1.2, z: v, ry: 0 });
        spots.push({ x: L + HALF_ROAD + 1.2, z: v + 12, ry: Math.PI });
        spots.push({ x: v, z: L - HALF_ROAD - 1.2, ry: -Math.PI / 2 });
        spots.push({ x: v + 12, z: L + HALF_ROAD + 1.2, ry: Math.PI / 2 });
      }
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 7.5, 6).translate(0, 3.75, 0), new THREE.MeshStandardMaterial({ color: "#3c4046", metalness: 0.6, roughness: 0.5 }), spots.length);
    const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.08, 0.1).translate(0.9, 7.4, 0), pole.material, spots.length);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.14, 0.3).translate(1.7, 7.3, 0), this.lampMat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    spots.forEach((s, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry);
      m4.compose(new THREE.Vector3(s.x, 0, s.z), q, one);
      pole.setMatrixAt(k, m4);
      arm.setMatrixAt(k, m4);
      head.setMatrixAt(k, m4);
    });
    this.scene.add(pole, arm, head);

    // Traffic signals: one head per approach on the far-right corner.
    const groups: Record<string, THREE.Matrix4[]> = {};
    const poles: THREE.Matrix4[] = [];
    for (let j = 0; j < LINES; j++)
      for (let i = 0; i < LINES; i++) {
        const p = nodePos(j * LINES + i);
        const parity = (i + j) % 2;
        const heads: { x: number; z: number; face: number; axis: "ns" | "ew" }[] = [
          { x: p.x + 5.2, z: p.z - 5.2, face: 0, axis: "ns" }, // northbound traffic looks at it (faces south: +z)
          { x: p.x - 5.2, z: p.z + 5.2, face: Math.PI, axis: "ns" },
          { x: p.x + 5.2, z: p.z + 5.2, face: -Math.PI / 2, axis: "ew" },
          { x: p.x - 5.2, z: p.z - 5.2, face: Math.PI / 2, axis: "ew" },
        ];
        for (const h of heads) {
          const m = new THREE.Matrix4().compose(new THREE.Vector3(h.x, 0, h.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.face), one);
          poles.push(m);
          (groups[`${parity}${h.axis}`] ??= []).push(m);
        }
      }
    const polesMesh = new THREE.InstancedMesh(
      mergeGeometries([new THREE.CylinderGeometry(0.1, 0.12, 5, 6).translate(0, 2.5, 0), new THREE.BoxGeometry(0.34, 1.05, 0.3).translate(0, 4.4, 0.18)]),
      new THREE.MeshStandardMaterial({ color: "#2b2d30", roughness: 0.6 }),
      poles.length,
    );
    poles.forEach((m, k) => polesMesh.setMatrixAt(k, m));
    this.scene.add(polesMesh);
    const lamp = (y: number) => new THREE.SphereGeometry(0.1, 8, 6).translate(0, y, 0.34);
    for (const key of Object.keys(groups)) {
      const list = groups[key];
      const mats = [
        new THREE.MeshStandardMaterial({ color: "#300", emissive: "#ff2a1a" }),
        new THREE.MeshStandardMaterial({ color: "#320", emissive: "#ffb000" }),
        new THREE.MeshStandardMaterial({ color: "#030", emissive: "#20ff6a" }),
      ] as [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
      [4.72, 4.4, 4.08].forEach((y, c) => {
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
    const tex = radialTexture("rgba(255,214,150,0.55)", "rgba(255,214,150,0)");
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2), mat, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach((s, k) => {
      const dx = Math.cos(-s.ry) * 1.7;
      const dz = Math.sin(-s.ry) * 1.7;
      m4.makeTranslation(s.x + dx, 0.04, s.z + dz);
      pools.setMatrixAt(k, m4);
    });
    this.scene.add(pools);
    return pools;
  }

  // ---------------------------------------------------------------- frame

  render(cam: CamState, frameDt: number) {
    const sim = this.sim;
    const t = sim.time;
    this.timeOfDay();
    this.syncCars(t);
    this.syncPeds(cam);
    this.syncFx(sim.events, t, frameDt);
    this.updateCamera(cam, frameDt);
    this.updateSignals(t);
    const wp = sim.waypoint();
    this.marker.visible = !!wp;
    if (wp) {
      this.marker.position.set(wp.x, 0, wp.z);
      const k = 1 + Math.sin(performance.now() / 300) * 0.08;
      this.marker.children[0].scale.set(k, 1, k);
      this.marker.children[1].position.y = 6 + Math.sin(performance.now() / 400) * 0.5;
      this.marker.children[1].rotation.y += frameDt * 2;
    }
    // Shadows follow the camera.
    const focus = sim.officer;
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.position.set(focus.x + 60, 120, focus.z + 40);
    if (this.composer) this.composer.render(frameDt);
    else this.renderer.render(this.scene, this.camera);
    this.resolved = true;
  }

  private timeOfDay() {
    const hour = this.sim.clock() / 60;
    // 0 at noon .. 1 at midnight, with dusk/dawn ramps.
    const n = hour >= 20.5 || hour < 5 ? 1 : hour >= 18.5 ? (hour - 18.5) / 2 : hour < 7 ? 1 - (hour - 5) / 2 : 0;
    this.night = Math.max(0, Math.min(1, n));
    const day = 1 - this.night;
    const sky = new THREE.Color("#8ec5ff").lerp(new THREE.Color("#070b18"), this.night);
    if (hour >= 18 && hour < 21) sky.lerp(new THREE.Color("#e0864f"), 0.25 * Math.sin(((hour - 18) / 3) * Math.PI));
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);
    (this.scene.fog as THREE.Fog).far = 260 + day * 200;
    this.hemi.intensity = 0.25 + day * 0.9;
    this.hemi.color.set(this.night > 0.5 ? "#6d82b8" : "#cfe2ff");
    this.sun.intensity = 0.12 + day * 2.2;
    this.sun.color.set(this.night > 0.5 ? "#9fb4ff" : "#fff1dc");
    this.renderer.toneMappingExposure = 0.8 + this.night * 0.1;
    for (const m of this.windowMats) m.emissiveIntensity = this.night * 1.3;
    this.lampMat.emissiveIntensity = this.night * 3;
    (this.pools.material as THREE.MeshBasicMaterial).opacity = this.night;
    this.pools.visible = this.night > 0.05;
  }

  private updateSignals(t: number) {
    for (const s of this.signals) {
      const node = s.parity; // node 0 has parity 0, node 1 parity 1 (same cycle offset rules)
      const st = lightFor(node, s.axis, t);
      s.mats[0].emissiveIntensity = st === "red" ? 3 : 0.05;
      s.mats[1].emissiveIntensity = st === "amber" ? 3 : 0.05;
      s.mats[2].emissiveIntensity = st === "green" ? 3 : 0.05;
    }
  }

  private syncCars(t: number) {
    const sim = this.sim;
    const live = new Set<string>();
    const o = sim.officer;
    const flash = Math.floor(t * 7) % 4;
    const strobe = Math.floor(t * 18) % 2 === 0;
    for (const c of sim.cars) {
      live.add(c.id);
      let m = this.cars.get(c.id);
      if (!m) {
        m = buildCar(c.kind, c.color);
        this.cars.set(c.id, m);
        this.scene.add(m.group);
        if (c === sim.unit) {
          for (const b of this.beams) {
            m.group.add(b, b.target);
          }
          this.bar[0].position.set(0, 2.1, -0.5);
          this.bar[1].position.set(0, 2.1, 0.5);
          m.group.add(...this.bar);
        }
      }
      const d = Math.hypot(c.x - o.x, c.z - o.z);
      m.group.visible = d < 260;
      if (!m.group.visible) continue;
      m.group.position.set(c.x, 0, c.z);
      m.group.rotation.set(0, -c.h, 0);
      // Body roll in hard turns.
      const vf = speedOf(c);
      m.group.rotation.x = Math.max(-0.05, Math.min(0.05, -c.steer * vf * 0.002));
      m.tail.emissiveIntensity = c.braking ? 2.4 : 0.35 + this.night * 0.6;
      (m.heads.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + this.night * 2.5;
      if (m.red && m.blue) {
        const on = c.lights;
        m.red.emissiveIntensity = on && (flash < 2 ? strobe : false) ? 6 : 0;
        m.blue.emissiveIntensity = on && (flash >= 2 ? strobe : false) ? 6 : 0;
      }
      if (c === sim.unit) {
        for (const b of this.beams) b.intensity = this.night * 60;
        this.bar[0].intensity = c.lights && flash < 2 ? 18 : 0;
        this.bar[1].intensity = c.lights && flash >= 2 ? 18 : 0;
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
    }
    for (const [id, m] of this.cars)
      if (!live.has(id)) {
        m.group.removeFromParent();
        this.cars.delete(id);
      }
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
    for (const p of sim.peds) {
      if (p.state === "driving" || p.state === "incar" || p.state === "gone") continue;
      if (Math.hypot(p.x - o.x, p.z - o.z) > 120) continue;
      live.add(p.id);
      const key = `${p.skin}${p.shirt}${p.pants}${p.role === "officer"}`;
      let m = this.peds.get(p.id);
      if (!m || m.key !== key) {
        m?.group.removeFromParent();
        m = Object.assign(buildPed({ skin: p.skin, shirt: p.shirt, pants: p.pants, officer: p.role === "officer" }), { key });
        this.peds.set(p.id, m);
        this.scene.add(m.group);
      }
      m.group.position.set(p.x, 0, p.z);
      m.group.rotation.set(0, -p.h, 0);
      posePed(m, this.pose(p), p.step, p.state === "walk" ? 1.4 : p.speed);
      m.gun.visible = p.drawn;
      if (p.state === "dead" && !this.blood.has(p.id)) {
        const b = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#4a0707", transparent: true, opacity: 0.8, depthWrite: false }));
        b.position.set(p.x, 0.03, p.z);
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
    // The officer.
    const pl = sim.player;
    const om = this.officer;
    om.group.visible = !pl.inCar;
    if (!pl.inCar) {
      om.group.position.set(pl.x, 0, pl.z);
      om.group.rotation.set(0, -pl.h, 0);
      const moving = pl.moving ? (pl.sprinting ? 6.5 : 3.2) : 0;
      this.officerStep += moving / 60;
      posePed(om, cam.aiming ? "aim" : "walk", this.officerStep, moving);
      om.gun.visible = pl.weapon === "pistol" && cam.aiming;
      om.taser.visible = pl.weapon === "taser" && cam.aiming;
    }
  }

  private syncFx(events: SimEvent[], t: number, dt: number) {
    void dt;
    for (const e of events) {
      if (e.type === "shot" || e.type === "taser") {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(e.x, 1.4, e.z), new THREE.Vector3(e.tx, 1.25, e.tz)]);
        const color = e.type === "taser" ? "#ffe35a" : e.by === "ped" ? "#ff9a5a" : "#fff0b0";
        const lineObj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        this.scene.add(lineObj);
        this.fx.push({ obj: lineObj, until: t + (e.type === "taser" ? 0.5 : 0.07) });
        const flash = new THREE.PointLight(e.type === "taser" ? "#8fb4ff" : "#ffb35a", 12, 10, 2);
        flash.position.set(e.x, 1.5, e.z);
        this.scene.add(flash);
        this.fx.push({ obj: flash, until: t + 0.05 });
      }
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
    if (pl.inCar) {
      const u = sim.unit;
      const v = Math.abs(speedOf(u));
      const back = (cam.far ? 11 : 7.2) + v * 0.08;
      const h = u.h + cam.orbit;
      const f = forward(h);
      const want = new THREE.Vector3(u.x - f.x * back, (cam.far ? 4.4 : 2.9) + v * 0.02, u.z - f.z * back);
      this.camPos.lerp(want, this.resolved ? k : 1);
      const look = new THREE.Vector3(u.x + f.x * 4, 1.2, u.z + f.z * 4);
      this.camLook.lerp(look, this.resolved ? Math.min(1, dt * 10) : 1);
      this.camera.fov += ((62 + Math.min(14, v * 0.35)) - this.camera.fov) * k;
    } else {
      const f = forward(cam.yaw);
      const r = { x: -f.z, z: f.x };
      const dist = cam.aiming ? 2 : cam.far ? 5 : 3.3;
      const side = cam.aiming ? 0.75 : 0.55;
      const cy = Math.cos(cam.pitch);
      const want = new THREE.Vector3(pl.x - f.x * dist * cy + r.x * side, 1.75 - Math.sin(cam.pitch) * dist, pl.z - f.z * dist * cy + r.z * side);
      this.camPos.lerp(want, this.resolved ? Math.min(1, dt * 14) : 1);
      const look = new THREE.Vector3(pl.x + f.x * 20 * cy + r.x * side, 1.6 + Math.sin(cam.pitch) * 20, pl.z + f.z * 20 * cy + r.z * side);
      this.camLook.lerp(look, this.resolved ? Math.min(1, dt * 18) : 1);
      this.camera.fov += ((cam.aiming ? 48 : 64) - this.camera.fov) * Math.min(1, dt * 10);
    }
    // Keep the camera out of buildings (pull it in toward the target).
    this.camera.position.copy(this.camPos);
    this.camera.position.y = Math.max(0.6, this.camera.position.y);
    this.camera.lookAt(this.camLook);
    this.camera.updateProjectionMatrix();
  }

  destroy() {
    this.ro.disconnect();
    this.composer?.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.canvas.remove();
  }
}

export const CAR_VISUAL_RANGE = 260;
export type { Car };
