import * as THREE from "three";
import { BONES, buildPed, posePed, type PedModel, type Pose } from "../code-3/people3d";
import { TreeKit } from "../code-3/scenery";
import { grassBladesTexture, setTextureDetail } from "../neon-siege/three/textures";
import { blobTexture, glowTexture, grassDetail } from "../aussie-rules/textures";
import { SportsPipeline, canvasTexture, noise2 } from "../sports-kit/pipeline";
import type { Detail, TimeOfDay } from "../sports-kit/look";
import { ellipseK, fbm, heightAt, lieInfo, normalAt, type Ellipse, type Hole, type Lie } from "./course";
import { BALL_R, BallPhysics, CUP_R, GolfSim, type GolfEvent, type V3 } from "./sim";

const HAND_R = BONES.indexOf("handR");
const up = new THREE.Vector3(0, 1, 0);

/** Lie colours (sRGB 0–255): base and the mowing stripe. */
const PAINT: Record<"links" | "parkland", Record<Lie, [number[], number[]]>> = {
  parkland: {
    tee: [[92, 146, 52], [106, 160, 60]],
    fairway: [[86, 142, 48], [104, 160, 60]],
    green: [[78, 152, 62], [90, 164, 72]],
    fringe: [[72, 132, 48], [80, 140, 52]],
    rough: [[60, 104, 36], [64, 108, 38]],
    deep: [[50, 84, 30], [54, 88, 32]],
    bunker: [[226, 210, 168], [226, 210, 168]],
    water: [[54, 66, 46], [54, 66, 46]],
    ob: [[48, 78, 30], [50, 80, 30]],
  },
  links: {
    tee: [[110, 146, 62], [124, 158, 70]],
    fairway: [[112, 146, 60], [126, 158, 68]],
    green: [[92, 150, 66], [102, 160, 72]],
    fringe: [[100, 140, 60], [106, 146, 62]],
    rough: [[118, 124, 62], [122, 128, 64]],
    deep: [[164, 150, 92], [170, 156, 96]],
    bunker: [[206, 186, 142], [206, 186, 142]],
    water: [[60, 70, 54], [60, 70, 54]],
    ob: [[150, 140, 86], [150, 140, 86]],
  },
};

export interface LieMap {
  canvas: HTMLCanvasElement;
  x0: number;
  z0: number;
  /** Metres per pixel. */
  res: number;
}

/** The hole painted from above: every pixel's lie, mowing stripes, wear and noise. */
export function paintLie(h: Hole, res: number): LieMap {
  const b = h.bounds;
  const w = Math.ceil((b.x1 - b.x0) / res);
  const hh = Math.ceil((b.z1 - b.z0) / res);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = hh;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, hh);
  const pal = PAINT[h.style];
  const n1 = noise2(32, h.seed % 997);
  const n2 = noise2(8, (h.seed % 991) + 3);
  for (let j = 0; j < hh; j++) {
    const z = b.z0 + (j + 0.5) * res;
    for (let i = 0; i < w; i++) {
      const x = b.x0 + (i + 0.5) * res;
      const { lie, d, at } = lieInfo(h, x, z);
      let stripe = 0;
      if (lie === "fairway" || lie === "tee") stripe = Math.floor(at / 9) % 2;
      else if (lie === "green") stripe = (Math.floor((x - h.green.x) / 3) + Math.floor((z - h.green.z) / 3)) % 2 ? 1 : 0;
      let [r, gg, bb] = pal[lie][Math.abs(stripe)];
      // A links falls away to the beach.
      if (h.sea && x * h.sea > h.fairwayW * 0.5 + 48 && lie !== "water") [r, gg, bb] = [214, 196, 152];
      const u = (x - b.x0) / 160;
      const v = (z - b.z0) / 160;
      const k = (n1(u, v) - 0.5) * 0.22 + (n2(u * 9, v * 9) - 0.5) * 0.1;
      // The first cut: a lighter edge just off the fairway.
      const edge = lie === "rough" && d < h.fairwayW * 0.5 + 6 ? 0.06 : 0;
      const f = 1 + k + edge;
      const o = (j * w + i) * 4;
      img.data[o] = Math.min(255, r * f);
      img.data[o + 1] = Math.min(255, gg * f);
      img.data[o + 2] = Math.min(255, bb * f);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, x0: b.x0, z0: b.z0, res };
}

/** An ellipse lying on a height (water). */
function ellipseGeometry(e: Ellipse, y: number, seg = 56) {
  const pos = [0, y, 0];
  const c = Math.cos(e.rot);
  const s = Math.sin(e.rot);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const U = Math.cos(a) * e.rx * 1.02;
    const V = Math.sin(a) * e.rz * 1.02;
    pos.push(c * U + s * V, y, -s * U + c * V);
  }
  const idx: number[] = [];
  for (let i = 1; i <= seg; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.translate(e.x, 0, e.z);
  return g;
}

/** A normal map of soft ripples for the water. */
function rippleNormals() {
  const n = noise2(12, 41);
  const n2 = noise2(30, 42);
  const t = canvasTexture(
    256,
    256,
    (g) => {
      const img = g.createImageData(256, 256);
      const H = (x: number, y: number) => n(x / 256, y / 256) * 0.7 + n2(x / 256, y / 256) * 0.3;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const dx = (H(x + 1, y) - H(x - 1, y)) * 6;
          const dy = (H(x, y + 1) - H(x, y - 1)) * 6;
          const l = Math.hypot(dx, dy, 1);
          const o = (y * 256 + x) * 4;
          img.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
          img.data[o + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
          img.data[o + 2] = (1 / l) * 255;
          img.data[o + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    },
    true,
  );
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Golf clubs: driver, iron, putter (shaft down the hand's -y, face toward the target). */
function clubModel(kind: "wood" | "iron" | "putter") {
  const g = new THREE.Group();
  const L = kind === "wood" ? 1.08 : kind === "iron" ? 0.94 : 0.84;
  const steel = new THREE.MeshStandardMaterial({ color: "#c9ced6", metalness: 0.95, roughness: 0.22 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.26, 8), new THREE.MeshStandardMaterial({ color: "#1d1d1f", roughness: 0.8 }));
  grip.position.y = -0.06;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0045, L, 6), steel);
  shaft.position.y = -L / 2;
  g.add(grip, shaft);
  let head: THREE.Mesh;
  if (kind === "wood") {
    head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), new THREE.MeshStandardMaterial({ color: "#16181d", metalness: 0.6, roughness: 0.25 }));
    head.scale.set(1.05, 0.62, 1.9);
    head.position.set(0.0, -L - 0.01, 0.06);
  } else if (kind === "iron") {
    head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.085), steel);
    head.position.set(0, -L - 0.01, 0.045);
  } else {
    head = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.026, 0.11), steel);
    head.position.set(0, -L - 0.005, 0.05);
  }
  head.castShadow = true;
  g.add(head);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

interface Spectator {
  m: PedModel;
  cheer: number;
  t: number;
}

/**
 * The 3D course: the hole's terrain painted with its lies, trees, water,
 * the green with its pin and flag, the golfer with a bag's worth of clubs, the
 * ball with a TV-style tracer, and a director that cuts between the shot
 * views.
 */
export class FairwayView {
  private pipe: SportsPipeline;
  readonly canvas: HTMLCanvasElement;
  private holeGroup = new THREE.Group();
  private holeShown: Hole | null = null;
  private trees: TreeKit;
  private detailTex: THREE.Texture;
  private water: THREE.MeshStandardMaterial;
  private bladeMat: THREE.MeshStandardMaterial | null = null;
  lie: LieMap | null = null;
  private golfer: PedModel;
  private clubs: Record<"wood" | "iron" | "putter", THREE.Group>;
  private ball: THREE.Mesh;
  private ballGlow: THREE.Sprite;
  private ballShadow: THREE.Mesh;
  private tracer: THREE.Line;
  private tracerPts: Float32Array;
  private tracerN = 0;
  private ring: THREE.Mesh;
  private aimLine: THREE.Line;
  private flag: THREE.Mesh;
  private flagGroup = new THREE.Group();
  private slopeArrows: THREE.InstancedMesh | null = null;
  private spectators: Spectator[] = [];
  private t = 0;
  // Director.
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shotT = 0;
  private landCam: THREE.Vector3 | null = null;
  private predicted: { land: V3; rest: V3 } | null = null;
  private intro = 0;
  private cut = true;
  private lastAimPos = "";
  private lastAim = 0;
  private splashes: { s: THREE.Sprite; t: number }[] = [];
  private puffMat: THREE.SpriteMaterial;
  private splashMat: THREE.SpriteMaterial;

  constructor(
    host: HTMLElement,
    private sim: GolfSim,
    readonly detail: Detail,
    tod: TimeOfDay,
  ) {
    setTextureDetail(detail === "low" ? "low" : "high");
    this.pipe = new SportsPipeline(host, detail, tod === "night" ? "twilight" : tod, { fov: 45, shadowSpan: 70, far: 4000 });
    this.canvas = this.pipe.canvas;
    const scene = this.pipe.scene;
    this.pipe.lights([], { fog: 0.0013, sunDir: tod === "day" ? new THREE.Vector3(0.35, 0.8, -0.45) : undefined });
    this.trees = new TreeKit(detail === "low" ? "low" : "high");
    this.detailTex = grassDetail(detail === "low" ? 128 : 256);
    this.detailTex.wrapS = this.detailTex.wrapT = THREE.RepeatWrapping;
    const ripples = rippleNormals();
    ripples.repeat.set(30, 30);
    this.water = new THREE.MeshStandardMaterial({ color: "#1f3f45", roughness: 0.06, metalness: 0.25, normalMap: ripples, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.92 });
    scene.add(this.holeGroup);

    // The golfer.
    this.golfer = buildPed({
      skin: "#d9a37c",
      shirt: "#1d4f91",
      pants: "#cfc6b4",
      seed: 77,
      outfit: { female: false, top: "tee", bottom: "trousers", hat: "cap", hair: "short", backpack: false, officer: false, beard: false },
      hatColor: "#f1f1ee",
      shoes: "#3a3530",
      accent: "#f1f1ee",
    });
    this.golfer.group.traverse((o) => (o.castShadow = true));
    this.clubs = { wood: clubModel("wood"), iron: clubModel("iron"), putter: clubModel("putter") };
    for (const c of Object.values(this.clubs)) this.golfer.bones[HAND_R].add(c);
    scene.add(this.golfer.group);

    // Ball, its glow when far away, its shadow and the tracer.
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.32 }));
    this.ball.castShadow = true;
    this.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffffff", depthWrite: false, sizeAttenuation: false, transparent: true }));
    this.ballGlow.scale.setScalar(0.012);
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture("rgba(0,0,0,0.6)"), transparent: true, depthWrite: false }));
    this.tracerPts = new Float32Array(900 * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(this.tracerPts, 3));
    tg.setDrawRange(0, 0);
    this.tracer = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.95, fog: false }));
    this.tracer.frustumCulled = false;
    scene.add(this.ball, this.ballGlow, this.ballShadow, this.tracer);

    // Aim: the landing ring and a dashed line.
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    this.ring.renderOrder = 2;
    const ag = new THREE.BufferGeometry();
    ag.setAttribute("position", new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    this.aimLine = new THREE.Line(ag, new THREE.LineDashedMaterial({ color: "#ffffff", dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.8, fog: false }));
    this.aimLine.frustumCulled = false;
    scene.add(this.ring, this.aimLine);

    // Pin and flag.
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 2.3, 8).translate(0, 1.15, 0), new THREE.MeshStandardMaterial({ color: "#f5f5f0", roughness: 0.4 }));
    stick.castShadow = true;
    const flagTex = canvasTexture(128, 96, (g) => {
      g.fillStyle = "#facc15";
      g.fillRect(0, 0, 128, 96);
      g.fillStyle = "#14532d";
      g.font = "bold 58px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("ZX", 64, 50);
    });
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.38, 10, 4).translate(0.275, 0, 0), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
    this.flag.position.y = 2.1;
    this.flag.castShadow = true;
    const cup = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#0c0d0a" }));
    cup.position.y = 0.004;
    const liner = new THREE.Mesh(new THREE.RingGeometry(CUP_R * 0.86, CUP_R, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#e8e8e2", roughness: 0.5 }));
    liner.position.y = 0.005;
    this.flagGroup.add(stick, this.flag, cup, liner);
    scene.add(this.flagGroup);

    this.puffMat = new THREE.SpriteMaterial({ map: glowTexture(), color: "#e9dcc0", transparent: true, depthWrite: false, opacity: 0.8 });
    this.splashMat = new THREE.SpriteMaterial({ map: glowTexture(), color: "#dff3ff", transparent: true, depthWrite: false, opacity: 0.9 });
    this.setHole(sim.hole);
  }

  setResolution(k: number) {
    this.pipe.setResolution(k);
  }

  /** Build (or rebuild, on a new hole) everything that belongs to the hole. */
  setHole(h: Hole) {
    if (this.holeShown === h) return;
    this.holeShown = h;
    this.clearHole();
    const low = this.detail === "low";
    const G = this.holeGroup;
    // The lie map and the terrain it's painted on.
    this.lie = paintLie(h, low ? 1 : 0.5);
    const lieTex = new THREE.CanvasTexture(this.lie.canvas);
    lieTex.colorSpace = THREE.SRGBColorSpace;
    lieTex.flipY = false;
    lieTex.anisotropy = 8;
    lieTex.wrapS = lieTex.wrapT = THREE.ClampToEdgeWrapping;
    const b = h.bounds;
    const step = low ? 2.5 : 1.5;
    const axis = (a0: number, a1: number) => {
      const out: number[] = [];
      for (let v = a0 - 600; v < a0; v += 40) out.push(v);
      for (let v = a0; v < a1; v += step) out.push(v);
      out.push(a1);
      for (let v = a1 + 40; v <= a1 + 600; v += 40) out.push(v);
      return out;
    };
    const xs = axis(b.x0, b.x1);
    const zs = axis(b.z0, b.z1);
    const pos = new Float32Array(xs.length * zs.length * 3);
    const uv = new Float32Array(xs.length * zs.length * 2);
    const W = b.x1 - b.x0;
    const D = b.z1 - b.z0;
    let k = 0;
    for (let j = 0; j < zs.length; j++)
      for (let i = 0; i < xs.length; i++, k++) {
        const x = xs[i];
        const z = zs[j];
        const inside = x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
        let y = heightAt(h, x, z);
        // Beyond the hole the land rolls up into hills (except down to the sea).
        const out = Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
        if (!inside && !(h.sea && x * h.sea > 0 && out > 0)) {
          const k = Math.min(1, Math.max(0, (out - 40) / 360));
          y += k * k * (3 - 2 * k) * (8 + 16 * (fbm(x / 170, z / 170, h.seed + 61, 3) * 0.5 + 0.5));
        }
        pos.set([x, y, z], k * 3);
        uv.set([(x - b.x0) / W, (z - b.z0) / D], k * 2);
      }
    const idx: number[] = [];
    for (let j = 0; j < zs.length - 1; j++)
      for (let i = 0; i < xs.length - 1; i++) {
        const a = j * xs.length + i;
        idx.push(a, a + xs.length, a + 1, a + 1, a + xs.length, a + xs.length + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: lieTex, roughness: 0.93 });
    const detail = this.detailTex;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail };
      sh.vertexShader = `varying vec2 vWorldXZ;\n${sh.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
      sh.fragmentShader = `uniform sampler2D detailMap;\nvarying vec2 vWorldXZ;\n${sh.fragmentShader}`.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec3 det = texture2D(detailMap, vWorldXZ * 0.42).rgb * 0.6 + texture2D(detailMap, vWorldXZ * 0.07).rgb * 0.4;
        diffuseColor.rgb *= clamp(det / 0.44, 0.6, 1.5);`,
      );
    };
    mat.customProgramCacheKey = () => "fairway-ground";
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    G.add(ground);

    // Water.
    for (const p of h.ponds) {
      const m = new THREE.Mesh(ellipseGeometry(p, p.level), this.water);
      m.receiveShadow = true;
      G.add(m);
    }
    if (h.sea) {
      let lvl = 0;
      for (let z = b.z0; z < b.z1; z += 20) lvl += heightAt(h, h.sea * (h.fairwayW * 0.5 + 62), z);
      lvl = lvl / Math.ceil((b.z1 - b.z0) / 20) - 0.4;
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), this.water);
      sea.position.set(h.sea * (h.fairwayW * 0.5 + 62 + 2000), lvl, (b.z0 + b.z1) / 2);
      G.add(sea);
    }

    // Trees, plus a far tree line on parkland.
    const spots = h.trees.map((t) => ({ x: t.x, z: t.z, y: heightAt(h, t.x, t.z) - 0.2, s: t.h / 6 }));
    if (h.style === "parkland") {
      let s = h.seed;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < (low ? 120 : 260); i++) {
        const side = r() < 0.5 ? -1 : 1;
        const x = side > 0 ? b.x1 + 10 + r() * 120 : b.x0 - 10 - r() * 120;
        const z = b.z0 - 40 + r() * (D + 120);
        spots.push({ x, z, y: heightAt(h, x, z) - 0.2, s: 1.8 + r() * 1.8 });
      }
    }
    this.trees.build(G, spots, !low);

    // Rough and dune grass (tufts).
    if (!low) {
      this.bladeMat ??= new THREE.MeshStandardMaterial({ map: grassBladesTexture(128), alphaTest: 0.4, roughness: 0.9 });
      const tuft = new THREE.BufferGeometry();
      const parts: number[] = [];
      const uvs: number[] = [];
      const nrm: number[] = [];
      for (let q = 0; q < 3; q++) {
        const a = (q / 3) * Math.PI;
        const cx = Math.cos(a) * 0.32;
        const cz = Math.sin(a) * 0.32;
        // Both windings, so the back is lit like the front (double-sided would flip the up normal).
        parts.push(-cx, 0, -cz, cx, 0, cz, cx, 0.42, cz, -cx, 0, -cz, cx, 0.42, cz, -cx, 0.42, -cz);
        parts.push(-cx, 0, -cz, cx, 0.42, cz, cx, 0, cz, -cx, 0, -cz, -cx, 0.42, -cz, cx, 0.42, cz);
        uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1);
        for (let v = 0; v < 12; v++) nrm.push(0, 1, 0);
      }
      tuft.setAttribute("position", new THREE.Float32BufferAttribute(parts, 3));
      tuft.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      tuft.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
      const want = this.detail === "ultra" ? 14000 : 7000;
      const inst = new THREE.InstancedMesh(tuft, this.bladeMat, want);
      let s = h.seed + 99;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const col = new THREE.Color();
      let n = 0;
      for (let tries = 0; tries < want * 6 && n < want; tries++) {
        const x = b.x0 + r() * W;
        const z = b.z0 + r() * D;
        const info = lieInfo(h, x, z);
        if (info.lie !== "rough" && info.lie !== "deep") continue;
        if (info.lie === "rough" && r() < 0.6) continue;
        const dune = h.style === "links" && info.lie === "deep";
        const sc = (dune ? 1.3 + r() * 1.0 : 0.6 + r() * 0.5) * (info.lie === "deep" ? 1.15 : 1);
        q.setFromAxisAngle(up, r() * Math.PI);
        m4.compose(new THREE.Vector3(x, heightAt(h, x, z) - 0.02, z), q, new THREE.Vector3(sc, sc * (0.8 + r() * 0.5), sc));
        inst.setMatrixAt(n, m4);
        if (dune) col.setRGB(1.9 + r() * 0.3, 1.65 + r() * 0.25, 0.95);
        else col.setRGB(1.05 + r() * 0.2, 1.2 + r() * 0.2, 0.85 + r() * 0.1);
        inst.setColorAt(n, col);
        n++;
      }
      inst.count = n;
      inst.receiveShadow = true;
      G.add(inst);
    }

    // Tee markers.
    const markerMat = new THREE.MeshStandardMaterial({ color: h.n % 2 ? "#1d4ed8" : "#e5e7eb", roughness: 0.4 });
    for (const sx of [-3, 3]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), markerMat);
      m.position.set(h.tee.x + sx, heightAt(h, h.tee.x + sx, h.tee.z + 1) + 0.08, h.tee.z + 1);
      m.castShadow = true;
      G.add(m);
    }

    // The pin.
    const py = heightAt(h, h.pin.x, h.pin.z);
    const [nx, ny, nz] = normalAt(h, h.pin.x, h.pin.z);
    this.flagGroup.position.set(h.pin.x, py, h.pin.z);
    this.flagGroup.children.slice(2).forEach((c) => c.quaternion.setFromUnitVectors(up, new THREE.Vector3(nx, ny, nz)));

    // Break arrows across the green.
    const ar: { x: number; z: number; dx: number; dz: number; k: number }[] = [];
    const gr = Math.max(h.green.rx, h.green.rz);
    for (let x = h.green.x - gr; x <= h.green.x + gr; x += 1.2)
      for (let z = h.green.z - gr; z <= h.green.z + gr; z += 1.2) {
        if (ellipseK(h.green, x, z) > 0.97) continue;
        const [ax, , az] = normalAt(h, x, z);
        ar.push({ x, z, dx: ax, dz: az, k: Math.hypot(ax, az) });
      }
    const cone = new THREE.ConeGeometry(0.045, 0.2, 3).rotateX(Math.PI / 2).scale(1, 0.2, 1);
    this.slopeArrows = new THREE.InstancedMesh(cone, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.4, depthWrite: false, fog: false }), ar.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    ar.forEach((a, i) => {
      q.setFromAxisAngle(up, Math.atan2(a.dx, a.dz));
      m4.compose(new THREE.Vector3(a.x, heightAt(h, a.x, a.z) + 0.03, a.z), q, new THREE.Vector3(1, 1, 1));
      this.slopeArrows!.setMatrixAt(i, m4);
      const t = Math.min(1, a.k / 0.035);
      col.setRGB(0.6 + t * 0.4, 1 - t * 0.6, 1 - t);
      this.slopeArrows!.setColorAt(i, col);
    });
    this.slopeArrows.visible = false;
    G.add(this.slopeArrows);

    // A gallery round the green and by the tee (High and up).
    this.spectators = [];
    if (!low) {
      const skins = ["#f1c9a5", "#e0ac84", "#c68c5d", "#8d5a3b", "#5a3a28"];
      const shirts = ["#1e3a8a", "#f97316", "#e5e7eb", "#14532d", "#7f1d1d", "#fde68a", "#0f766e", "#334155"];
      const spots2: V3[] = [];
      for (let a = 0; a < Math.PI * 2 && spots2.length < 14; a += 0.37) {
        const R = gr + 9 + (a * 7) % 3;
        const x = h.green.x + Math.cos(a) * R;
        const z = h.green.z + Math.sin(a) * R;
        const lie = lieInfo(h, x, z).lie;
        if (lie === "water" || lie === "bunker" || h.bunkers.some((bk) => ellipseK(bk, x, z) < 1.6)) continue;
        // Not in the way of the approach.
        const toTee = Math.atan2(h.path[h.path.length - 4].x - h.green.x, h.path[h.path.length - 4].z - h.green.z);
        if (Math.abs(Math.atan2(Math.sin(Math.atan2(x - h.green.x, z - h.green.z) - toTee), Math.cos(Math.atan2(x - h.green.x, z - h.green.z) - toTee))) < 0.6) continue;
        spots2.push({ x, y: heightAt(h, x, z), z });
      }
      spots2.push({ x: h.tee.x - 8, y: heightAt(h, h.tee.x - 8, -4), z: -4 }, { x: h.tee.x - 9, y: heightAt(h, h.tee.x - 9, -2), z: -2 }, { x: h.tee.x + 9, y: heightAt(h, h.tee.x + 9, -3), z: -3 });
      spots2.forEach((p, i) => {
        const m = buildPed({ skin: skins[i % skins.length], shirt: shirts[(i * 3) % shirts.length], pants: i % 3 ? "#d6cfc0" : "#1f2937", seed: h.seed + i * 13, lod: "low" });
        m.group.position.set(p.x, p.y, p.z);
        const face = i < spots2.length - 3 ? { x: h.pin.x, z: h.pin.z } : { x: h.tee.x, z: h.tee.z + 1 };
        m.group.rotation.y = Math.atan2(face.x - p.x, face.z - p.z) - Math.PI / 2;
        m.group.traverse((o) => (o.castShadow = true));
        G.add(m.group);
        this.spectators.push({ m, cheer: 0, t: i * 0.7 });
      });
    }
    this.intro = 0;
    this.cut = true;
  }

  private clearHole() {
    const G = this.holeGroup;
    G.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (mat === this.water || mat === this.bladeMat || (mat as THREE.MeshStandardMaterial).map === this.detailTex) continue;
        const std = mat as THREE.MeshStandardMaterial;
        // The ground's lie texture is per hole.
        if (std.map && std.map instanceof THREE.CanvasTexture && std.map.image === this.lie?.canvas) std.map.dispose();
      }
      if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
    });
    G.clear();
  }

  onEvent(e: GolfEvent) {
    const sim = this.sim;
    switch (e.kind) {
      case "hole":
        this.setHole(sim.hole);
        this.intro = 0.0001;
        break;
      case "strike": {
        this.tracerN = 0;
        this.shotT = 0;
        this.landCam = null;
        // Where's it going? Fly a copy ahead to place the landing camera.
        const ph = new BallPhysics(sim.hole, 3);
        ph.wind = { ...sim.wind };
        ph.ball = { ...sim.ball, p: { ...sim.ball.p }, v: { ...sim.ball.v } };
        let land: V3 | null = null;
        for (let i = 0; i < 1500 && ph.ball.state !== "rest"; i++) {
          ph.step(1 / 60);
          if (!land && ph.landed) land = { ...ph.landed };
        }
        this.predicted = { land: land ?? { ...ph.ball.p }, rest: { ...ph.ball.p } };
        break;
      }
      case "splash":
        this.burst(this.splashMat, 6, 1.6);
        break;
      case "bounce":
        if (e.lie === "bunker") this.burst(this.puffMat, 4, 0.9);
        break;
      case "holed":
        for (const s of this.spectators) s.cheer = e.strokes <= e.par ? 3 : 1;
        break;
      default:
        break;
    }
  }

  private burst(mat: THREE.SpriteMaterial, n: number, size: number) {
    const p = this.sim.ball.p;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(mat.clone());
      s.position.set(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.6);
      s.scale.setScalar(size * 0.3);
      this.pipe.scene.add(s);
      this.splashes.push({ s, t: 0 });
    }
  }

  /** Skip the hole fly-over. */
  skipIntro() {
    if (this.intro > 0) {
      this.intro = 0;
      this.cut = true;
    }
  }

  render(dt: number) {
    const sim = this.sim;
    const h = sim.hole;
    if (this.holeShown !== h) this.setHole(h);
    this.t += dt;
    this.shotT += dt;
    const b = sim.ball;
    const bp = b.p;

    // Ball, glow, shadow, tracer.
    this.ball.position.set(bp.x, bp.y, bp.z);
    this.ball.visible = !b.holed;
    const gy = heightAt(h, bp.x, bp.z);
    this.ballShadow.position.set(bp.x, gy + 0.01, bp.z);
    this.ballShadow.visible = !b.holed && bp.y - gy < 30;
    const camD = this.pipe.camera.position.distanceTo(this.ball.position);
    this.ballGlow.position.copy(this.ball.position);
    this.ballGlow.visible = !b.holed && camD > 25;
    if (b.state === "flight" && this.tracerN < 900) {
      const last = this.tracerN ? this.tracerN - 1 : -1;
      if (last < 0 || Math.hypot(this.tracerPts[last * 3] - bp.x, this.tracerPts[last * 3 + 1] - bp.y, this.tracerPts[last * 3 + 2] - bp.z) > 0.5) {
        this.tracerPts.set([bp.x, bp.y, bp.z], this.tracerN * 3);
        this.tracerN++;
        (this.tracer.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        this.tracer.geometry.setDrawRange(0, this.tracerN);
      }
    }
    this.tracer.visible = this.tracerN > 1 && (sim.phase === "flight" || sim.phase === "settle") && !sim.putting;

    // Aim: ring at the landing spot, dashed line out to it.
    const aiming = sim.phase === "aim" || (sim.phase === "swing" && sim.meter.stage < 3);
    const pv = sim.preview();
    const dir = new THREE.Vector3(Math.sin(sim.aim), 0, Math.cos(sim.aim));
    this.ring.visible = aiming && !sim.putting;
    this.aimLine.visible = aiming;
    if (aiming) {
      const ry = heightAt(h, pv.x, pv.z);
      this.ring.position.set(pv.x, ry + 0.08, pv.z);
      this.ring.scale.setScalar(Math.max(2, pv.carry * 0.035));
      const ap = this.aimLine.geometry.attributes.position as THREE.BufferAttribute;
      const len = sim.putting ? Math.min(pv.carry, 3.5) : pv.carry;
      for (let i = 0; i < 64; i++) {
        const t = (i / 63) * len;
        const x = bp.x + dir.x * t;
        const z = bp.z + dir.z * t;
        // Arc for full shots (a sketch of the flight), flat on the ground for putts.
        const arc = sim.putting ? 0.02 : Math.sin((i / 63) * Math.PI) * len * 0.07;
        ap.setXYZ(i, x, heightAt(h, x, z) + 0.05 + arc, z);
      }
      ap.needsUpdate = true;
      this.aimLine.computeLineDistances();
    }
    if (this.slopeArrows) this.slopeArrows.visible = sim.putting && (sim.phase === "aim" || sim.phase === "swing");

    // The golfer.
    const club = sim.clubDef;
    const kind = club.putter ? "putter" : sim.club <= 2 ? "wood" : "iron";
    for (const [k, g] of Object.entries(this.clubs)) g.visible = k === kind;
    const from = sim.phase === "aim" || sim.phase === "swing" ? bp : sim.from;
    const ha = sim.phase === "aim" || sim.phase === "swing" ? sim.aim : this.lastAim;
    if (sim.phase === "aim") this.lastAim = sim.aim;
    const stand = club.putter ? 0.5 : kind === "wood" ? 0.98 : club.wedge ? 0.78 : 0.86;
    let pose: Pose = club.putter ? "putt" : "address";
    let act = 0;
    let gx = from.x + Math.cos(ha) * stand;
    let gz = from.z - Math.sin(ha) * stand;
    let rot = ha + Math.PI;
    if (sim.phase === "swing" && sim.meter.stage === 3) {
      pose = club.putter ? "putt" : "golfSwing";
      act = sim.swingT;
    } else if (sim.phase === "flight" || sim.phase === "settle") {
      pose = club.putter ? "putt" : "golfSwing";
      act = club.putter ? Math.min(1, sim.swingT) : Math.min(0.95, sim.swingT);
    } else if (sim.phase === "holed" || sim.phase === "card" || sim.phase === "over") {
      const good = sim.strokes <= h.par;
      pose = good && sim.phase === "holed" ? "celebrate" : "stand";
      gx = h.pin.x + 1.6;
      gz = h.pin.z - 1.2;
      rot = Math.atan2(h.pin.x - gx, h.pin.z - gz) - Math.PI / 2;
      act = (this.t * 0.8) % 1;
    }
    this.golfer.group.position.set(gx, heightAt(h, gx, gz), gz);
    // Faces +x at rotation 0: turn so the target is on the golfer's left.
    this.golfer.group.rotation.y = rot;
    posePed(this.golfer, pose, 0, 0, this.t, dt, act);

    // Flag in the wind (out of the cup once the ball's close on the green).
    const w = sim.wind;
    const ws = Math.hypot(w.x, w.z);
    this.flagGroup.children[0].visible = this.flag.visible = !(sim.putting && sim.toPin < 1.5) || b.holed;
    this.flag.rotation.y = Math.atan2(-w.z, w.x);
    const fp = this.flag.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i);
      fp.setZ(i, Math.sin(this.t * (4 + ws * 0.6) - x * 9) * 0.05 * (x / 0.55) * (0.4 + Math.min(1, ws / 8)));
    }
    fp.needsUpdate = true;

    // The gallery.
    for (const s of this.spectators) {
      s.t += dt;
      if (s.cheer > 0) s.cheer -= dt;
      posePed(s.m, s.cheer > 0 ? "celebrate" : "stand", 0, 0, s.t, dt, (s.t * 1.3) % 1);
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const sp = this.splashes[i];
      sp.t += dt;
      sp.s.position.y += dt * (1.6 - sp.t * 3);
      sp.s.scale.multiplyScalar(1 + dt * 1.6);
      (sp.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.9 - sp.t * 0.9);
      if (sp.t > 1) {
        this.pipe.scene.remove(sp.s);
        sp.s.material.dispose();
        this.splashes.splice(i, 1);
      }
    }

    this.direct(dt, dir);
    (this.water.normalMap as THREE.Texture).offset.set(this.t * 0.004, this.t * 0.006);
    this.pipe.render();
  }

  /** The camera director. */
  private direct(dt: number, dir: THREE.Vector3) {
    const sim = this.sim;
    const h = sim.hole;
    const bp = sim.ball.p;
    const ball = new THREE.Vector3(bp.x, bp.y, bp.z);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    let rate = 3;
    const aimKey = `${sim.holeIdx}:${sim.strokes}:${sim.ctp.length}`;
    if (aimKey !== this.lastAimPos && sim.phase === "aim") {
      this.lastAimPos = aimKey;
      this.cut = true;
    }
    if (this.intro > 0) {
      // Fly-over: from high behind the tee down the hole to the green.
      this.intro += dt;
      const k = Math.min(1, this.intro / 4.5);
      const e = k * k * (3 - 2 * k);
      const g = new THREE.Vector3(h.green.x, h.greenY, h.green.z);
      const t0 = new THREE.Vector3(h.tee.x, h.teeY + 40, h.tee.z - 50);
      const t1 = new THREE.Vector3(h.green.x - (h.green.x - h.path[h.path.length - 8].x) * 1.4, h.greenY + 22, h.green.z - (h.green.z - h.path[h.path.length - 8].z) * 1.4);
      pos.lerpVectors(t0, t1, e);
      look.lerpVectors(new THREE.Vector3(h.path[Math.floor(h.path.length / 2)].x, h.teeY, h.path[Math.floor(h.path.length / 2)].z), g, e);
      rate = 100;
      if (k >= 1) {
        this.intro = 0;
        this.cut = true;
      }
    } else if (sim.phase === "aim" || sim.phase === "swing" || ((sim.phase === "flight" || sim.phase === "settle") && sim.putting)) {
      if (sim.putting) {
        const d = sim.phase === "aim" || sim.phase === "swing" ? dir : new THREE.Vector3(sim.ball.v.x, 0, sim.ball.v.z).normalize();
        if (!Number.isFinite(d.x) || d.lengthSq() < 0.5) d.copy(dir);
        const back = Math.min(4.5, 2.4 + sim.toPin * 0.12);
        pos.copy(ball).addScaledVector(dir, -back).addScaledVector(right, 0.8).addScaledVector(up, 0.85 + sim.toPin * 0.04);
        look.set(h.pin.x, heightAt(h, h.pin.x, h.pin.z), h.pin.z).lerp(ball, sim.toPin > 6 ? 0.55 : 0.2);
        rate = sim.phase === "flight" ? 2 : 6;
      } else {
        pos.copy(ball).addScaledVector(dir, -5.6).addScaledVector(right, 0.7).addScaledVector(up, 1.7);
        look.copy(ball).addScaledVector(dir, 30).addScaledVector(up, 1.2);
        rate = 6;
      }
    } else if (sim.phase === "flight" || sim.phase === "settle") {
      const pd = this.predicted;
      const far = this.shotT > 1.6 && pd && Math.hypot(pd.land.x - sim.from.x, pd.land.z - sim.from.z) > 35;
      if (!far) {
        // Behind the golfer, tracking the ball up.
        const fd = new THREE.Vector3(Math.sin(this.lastAim), 0, Math.cos(this.lastAim));
        const fr = new THREE.Vector3().crossVectors(fd, up).normalize();
        pos.set(sim.from.x, sim.from.y, sim.from.z).addScaledVector(fd, -6.5).addScaledVector(fr, 0.8).addScaledVector(up, 2);
        look.copy(ball);
        rate = 8;
      } else {
        if (!this.landCam && pd) {
          // A camera down by where it'll land, off to the side and back.
          const ld = new THREE.Vector3(pd.land.x - sim.from.x, 0, pd.land.z - sim.from.z).normalize();
          const side = new THREE.Vector3().crossVectors(ld, up).normalize();
          const c = new THREE.Vector3(pd.land.x, pd.land.y, pd.land.z).addScaledVector(ld, 26).addScaledVector(side, 14 * (sim.holeIdx % 2 ? 1 : -1));
          c.y = heightAt(h, c.x, c.z) + 7;
          this.landCam = c;
          this.cut = true;
        }
        pos.copy(this.landCam ?? pos);
        look.copy(ball);
        rate = 10;
        // Keep it in shot if it runs on a long way.
        if (this.landCam && this.landCam.distanceTo(ball) > 45) this.landCam.lerp(new THREE.Vector3(ball.x, this.landCam.y, ball.z), dt * 0.6);
      }
    } else {
      // On the card and at the hole: circle the pin.
      const a = this.t * 0.18;
      const p = new THREE.Vector3(h.pin.x, heightAt(h, h.pin.x, h.pin.z), h.pin.z);
      pos.set(p.x + Math.sin(a) * 9, p.y + 3.2, p.z + Math.cos(a) * 9);
      look.copy(p).addScaledVector(up, 0.6);
      rate = 4;
    }
    // Never under the ground.
    const minY = heightAt(h, pos.x, pos.z) + 0.5;
    if (pos.y < minY) pos.y = minY;
    if (this.cut) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.cut = false;
    } else {
      const k = 1 - Math.exp(-rate * dt);
      this.camPos.lerp(pos, k);
      this.camLook.lerp(look, Math.min(1, k * 2));
    }
    const cam = this.pipe.camera;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    const fx = (this.camLook.x + this.camPos.x) / 2;
    const fz = (this.camLook.z + this.camPos.z) / 2;
    this.pipe.follow(fx, fz);
  }

  destroy() {
    this.clearHole();
    this.pipe.destroy();
  }
}
