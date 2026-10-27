import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { GRADE, makeSky, SkyEnvironment, skyFor, type SkyMesh } from "@/nextx/look";
import { Rig } from "@/nextx/rig";
import { JOINT, KINDS, SITE, type Job } from "../data";
import { box, cure, dims, near, type Hit, type Piece, type Spec, type State } from "../model";
import { materials, type Mats } from "./materials";
import { isScaled, modelFor, mortarGeometry, type Model } from "./models";
import { buildSite, type SiteView } from "./site";

/**
 * Groundwork in 3D: a sunny afternoon over the plot, real shadows down to the joints between
 * bricks, ambient occlusion and a colour grade on fast machines; every piece drawn by instancing
 * (a brick with its own bed of mortar, which goes from wet to dry as it goes off), the new ones
 * settling into place as they're laid; a see-through ghost of what you're about to lay; the
 * job's pegs and string lines; and picking against the pieces themselves.
 */

export type Quality = "low" | "medium" | "high";

export function pickQuality(): Quality {
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (coarse) return cores >= 8 ? "medium" : "low";
  return cores >= 8 ? "high" : "medium";
}

const SUN_H = 0.62;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, "YXZ");
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

interface Batch {
  mesh: THREE.InstancedMesh;
  model: Model;
  ids: number[];
}

/** All the pieces, instanced by shape, and the mortar under the masonry. */
class Pieces {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private mortar: THREE.InstancedMesh;
  private mortarIds: number[] = [];
  private where = new Map<number, { b: Batch; i: number }>();
  private anim: { id: number; t0: number }[] = [];
  private known = new Set<number>();
  private first = true;
  private lastCure = 0;

  constructor(
    private M: Mats,
    private shadows: boolean,
  ) {
    this.mortar = new THREE.InstancedMesh(mortarGeometry(), M.mortar, 16);
    this.mortar.castShadow = false;
    this.mortar.receiveShadow = true;
    this.mortar.count = 0;
    this.group.add(this.mortar);
  }

  private batch(key: string, model: Model, n: number) {
    let b = this.batches.get(key);
    if (!b || b.mesh.instanceMatrix.count < n) {
      const cap = Math.max(16, Math.ceil(n * 1.5));
      if (b) {
        this.group.remove(b.mesh);
        b.mesh.dispose();
      }
      const mesh = new THREE.InstancedMesh(model.geo, model.mat, cap);
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = true;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      b = { mesh, model, ids: [] };
      this.batches.set(key, b);
    }
    return b;
  }

  /** A piece's matrix (dropped `lift` metres above where it'll sit). */
  private matrix(p: Piece, model: Model, lift = 0) {
    const [L, H, D] = dims(p);
    tmpE.set(p.p ?? 0, (p.r * Math.PI) / 2, 0, "YXZ");
    tmpQ.setFromEuler(tmpE);
    if (model.scaled) tmpS.set(L, H, D);
    else tmpS.set(1, 1, 1);
    return tmpM.compose(tmpV.set(p.x, p.y + lift, p.z), tmpQ, tmpS);
  }

  private color(p: Piece) {
    const I = KINDS[p.k];
    const base = I.variants[p.v]?.color ?? I.variants[0].color;
    tmpC.set(base);
    const h = hash(p.id);
    // Every brick (and tile, and board) a little different.
    const spread = I.family === "masonry" ? 0.2 : I.family === "roof" ? 0.14 : I.family === "timber" ? 0.12 : 0.05;
    const k = 1 + (h - 0.5) * spread;
    const warm = (hash(p.id + 7) - 0.5) * spread * 0.4;
    return tmpC.setRGB(tmpC.r * k * (1 + warm), tmpC.g * k, tmpC.b * k * (1 - warm));
  }

  /** Rebuild every batch from the site (fast enough to do on every change). */
  sync(s: State, now: number) {
    const by = new Map<string, Piece[]>();
    const fresh: number[] = [];
    for (const p of s.pieces) {
      const sz = dims(p);
      const key = isScaled(p.k) ? `${p.k}|u` : `${p.k}|${sz.map((v) => v.toFixed(4)).join(",")}`;
      let l = by.get(key);
      if (!l) by.set(key, (l = []));
      l.push(p);
      if (!this.known.has(p.id)) fresh.push(p.id);
    }
    this.known = new Set(s.pieces.map((p) => p.id));
    this.where.clear();
    for (const [key, b] of this.batches) if (!by.has(key)) b.mesh.count = 0;
    for (const [key, list] of by) {
      const model = modelFor(this.M, list[0].k, dims(list[0]));
      const b = this.batch(key, model, list.length);
      b.ids = [];
      list.forEach((p, i) => {
        b.mesh.setMatrixAt(i, this.matrix(p, model));
        b.mesh.setColorAt(i, this.color(p));
        b.ids.push(p.id);
        this.where.set(p.id, { b, i });
      });
      b.mesh.count = list.length;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
    this.syncMortar(s);
    // New pieces settle into place (a whole wall at once just appears, course by course).
    if (!this.first) {
      const take = fresh.slice(-400);
      take.forEach((id, k) => this.anim.push({ id, t0: now + Math.min(k, 200) * 6 }));
    }
    this.first = false;
  }

  private syncMortar(s: State) {
    const ms = s.pieces.filter((p) => KINDS[p.k].mortar && KINDS[p.k].family !== "opening");
    if (this.mortar.instanceMatrix.count < ms.length) {
      const cap = Math.ceil(ms.length * 1.5) + 16;
      this.group.remove(this.mortar);
      this.mortar.dispose();
      this.mortar = new THREE.InstancedMesh(mortarGeometry(), this.M.mortar, cap);
      this.mortar.receiveShadow = true;
      this.mortar.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      this.mortar.frustumCulled = false;
      this.group.add(this.mortar);
    }
    this.mortarIds = [];
    ms.forEach((p, i) => {
      const [L, H, D] = dims(p);
      tmpE.set(0, (p.r * Math.PI) / 2, 0, "YXZ");
      tmpQ.setFromEuler(tmpE);
      // The bed under it and half a perpend at each end, set back from the faces.
      tmpS.set(L + JOINT + 0.0004, H + JOINT, Math.max(0.01, D - 0.008));
      this.mortar.setMatrixAt(i, tmpM.compose(tmpV.set(p.x, p.y - JOINT, p.z), tmpQ, tmpS));
      this.mortar.setColorAt(i, this.mortarColor(s, p));
      this.mortarIds.push(p.id);
    });
    this.mortar.count = ms.length;
    this.mortar.instanceMatrix.needsUpdate = true;
    if (this.mortar.instanceColor) this.mortar.instanceColor.needsUpdate = true;
  }

  private mortarColor(s: State, p: Piece) {
    const c = cure(s, p);
    const h = hash(p.id + 3);
    // Wet mortar is dark and grey; it dries out pale.
    const v = 0.24 + c * 0.2 + (h - 0.5) * 0.04;
    return tmpC.setRGB(v * 1.0, v * 0.97, v * 0.9);
  }

  /** Mortar going off (only the wet joints change). */
  cure(s: State, now: number) {
    if (now - this.lastCure < 700) return;
    this.lastCure = now;
    let any = false;
    const pieces = new Map(s.pieces.map((p) => [p.id, p]));
    this.mortarIds.forEach((id, i) => {
      const p = pieces.get(id);
      if (!p || s.minutes - p.t > 260) return;
      this.mortar.setColorAt(i, this.mortarColor(s, p));
      any = true;
    });
    if (any && this.mortar.instanceColor) this.mortar.instanceColor.needsUpdate = true;
  }

  frame(s: State, now: number) {
    if (!this.anim.length) return;
    const byId = new Map<number, Piece>();
    const touched = new Set<Batch>();
    this.anim = this.anim.filter((a) => {
      const w = this.where.get(a.id);
      if (!w) return false;
      if (!byId.size) for (const p of s.pieces) byId.set(p.id, p);
      const p = byId.get(a.id);
      if (!p) return false;
      const t = Math.max(0, Math.min(1, (now - a.t0) / 260));
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      w.b.mesh.setMatrixAt(w.i, this.matrix(p, w.b.model, (1 - e) * 0.18));
      touched.add(w.b);
      return t < 1;
    });
    for (const b of touched) b.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** The see-through preview of what a tap would lay. */
class Ghost {
  readonly mesh: THREE.InstancedMesh;
  private okMat = new THREE.MeshStandardMaterial({ color: "#5fe08a", transparent: true, opacity: 0.42, roughness: 0.4, depthWrite: false, emissive: "#1f6a3a", emissiveIntensity: 0.5 });
  private badMat = new THREE.MeshStandardMaterial({ color: "#ff5a4f", transparent: true, opacity: 0.42, roughness: 0.4, depthWrite: false, emissive: "#6a1f1a", emissiveIntensity: 0.5 });
  private edges: THREE.LineSegments;
  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), this.okMat, 6000);
    this.mesh.count = 0;
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthTest: false }));
    this.edges.visible = false;
    this.edges.renderOrder = 6;
  }
  add(scene: THREE.Scene) {
    scene.add(this.mesh, this.edges);
  }
  show(specs: Spec[], ok: boolean) {
    this.mesh.material = ok ? this.okMat : this.badMat;
    const n = Math.min(specs.length, 6000);
    for (let i = 0; i < n; i++) {
      const p = specs[i];
      const [L, H, D] = p.s ?? KINDS[p.k].size;
      tmpE.set(p.p ?? 0, (p.r * Math.PI) / 2, 0, "YXZ");
      tmpQ.setFromEuler(tmpE);
      this.mesh.setMatrixAt(i, tmpM.compose(tmpV.set(p.x, p.y, p.z), tmpQ, tmpS.set(L + 0.002, H + 0.002, D + 0.002)));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    // Outline a single piece.
    if (n === 1) {
      const p = specs[0];
      const [L, H, D] = p.s ?? KINDS[p.k].size;
      this.edges.position.set(p.x, p.y, p.z);
      this.edges.rotation.set(p.p ?? 0, (p.r * Math.PI) / 2, 0, "YXZ");
      this.edges.scale.set(L, H, D);
      this.edges.visible = true;
    } else this.edges.visible = false;
  }
  /** Outline a piece already built (to knock it out). */
  outline(p: Piece | null) {
    this.mesh.count = 0;
    if (!p) {
      this.edges.visible = false;
      return;
    }
    const [L, H, D] = dims(p);
    this.edges.position.set(p.x, p.y, p.z);
    this.edges.rotation.set(p.p ?? 0, (p.r * Math.PI) / 2, 0, "YXZ");
    this.edges.scale.set(L + 0.01, H + 0.01, D + 0.01);
    this.edges.visible = true;
    (this.edges.material as THREE.LineBasicMaterial).color.set("#ff6a5f");
  }
  hide() {
    this.mesh.count = 0;
    this.edges.visible = false;
    (this.edges.material as THREE.LineBasicMaterial).color.set("#ffffff");
  }
}

/** Pegs and string lines round a job's zone, the tape for measuring, and the start of a run. */
class Marks {
  readonly group = new THREE.Group();
  private zone = new THREE.Group();
  private tape: THREE.Line;
  private anchor: THREE.Mesh;
  constructor() {
    this.group.add(this.zone);
    this.tape = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: "#ffd166", depthTest: false }));
    this.tape.visible = false;
    this.tape.renderOrder = 7;
    this.anchor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10).translate(0, 0.3, 0), new THREE.MeshStandardMaterial({ color: "#ffd166", emissive: "#664400" }));
    this.anchor.visible = false;
    this.group.add(this.tape, this.anchor);
  }
  setZone(j: Job | null) {
    this.zone.clear();
    if (!j) return;
    const [x0, z0, x1, z1] = j.zone;
    const peg = new THREE.MeshStandardMaterial({ color: "#c9a26e", roughness: 0.8 });
    const tip = new THREE.MeshStandardMaterial({ color: "#ff4fa3", emissive: "#5a0f35", roughness: 0.5 });
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.05).translate(0, 0.2, 0), peg);
      p.position.set(x, 0, z);
      p.castShadow = true;
      this.zone.add(p);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.055).translate(0, 0.46, 0), tip);
      t.position.set(x, 0, z);
      this.zone.add(t);
    }
    const pts = [new THREE.Vector3(x0, 0.4, z0), new THREE.Vector3(x1, 0.4, z0), new THREE.Vector3(x1, 0.4, z1), new THREE.Vector3(x0, 0.4, z1), new THREE.Vector3(x0, 0.4, z0)];
    this.zone.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#ff4fa3" })));
  }
  setTape(a: THREE.Vector3 | null, b: THREE.Vector3 | null) {
    if (!a || !b) {
      this.tape.visible = false;
      return;
    }
    this.tape.geometry.setFromPoints([a, b]);
    this.tape.visible = true;
  }
  setAnchor(p: { x: number; y: number; z: number } | null) {
    this.anchor.visible = !!p;
    if (p) this.anchor.position.set(p.x, p.y, p.z);
  }
}

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.05, 6000);
  readonly rig: Rig;
  readonly ghost = new Ghost();
  readonly marks = new Marks();
  private M: Mats;
  private pieces: Pieces;
  private site: SiteView;
  private sky: SkyMesh;
  private env: SkyEnvironment;
  private sun: THREE.DirectionalLight;
  private sunDir = new THREE.Vector3();
  private composer: EffectComposer | null = null;
  private lastRev = -1;
  private ro: ResizeObserver;
  private w = 1;
  private h = 1;
  private ray = new THREE.Raycaster();
  ready = false;

  constructor(
    private canvas: HTMLCanvasElement,
    readonly quality: Quality,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "high", powerPreference: "high-performance", stencil: false });
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(quality === "low" ? 1 : Math.min(quality === "high" ? 2 : 1.5, dpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.M = materials();
    // The sky, the sun and the light off the sky.
    this.sky = makeSky();
    this.sky.scale.setScalar(3000);
    this.scene.add(this.sky);
    const L = skyFor(SUN_H);
    const u = this.sky.material.uniforms;
    u.uZenith.value.copy(L.zenith);
    u.uHorizon.value.copy(L.horizon);
    u.uSunColor.value.copy(L.sun);
    if (u.uCloud) u.uCloud.value = 0.32;
    const az = 2.35;
    this.sunDir.set(Math.cos(az) * Math.sqrt(1 - SUN_H * SUN_H), SUN_H, Math.sin(az) * Math.sqrt(1 - SUN_H * SUN_H)).normalize();
    u.uSunDir.value.copy(this.sunDir);
    this.scene.fog = new THREE.Fog(L.horizon.clone().lerp(new THREE.Color("#d3dde6"), 0.5), 90, 900);
    this.sun = new THREE.DirectionalLight(L.sun, L.sunI * 1.05);
    this.sun.castShadow = true;
    const sm = quality === "high" ? 4096 : quality === "medium" ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.012;
    this.sun.shadow.radius = 2;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(L.zenith, new THREE.Color("#5e6a45"), L.hemiI * 0.75));
    this.env = new SkyEnvironment(this.renderer, this.sky, 128);
    this.scene.environment = this.env.update("day");
    this.scene.environmentIntensity = 0.6;
    this.site = buildSite(this.M, quality);
    this.scene.add(this.site.group);
    this.pieces = new Pieces(this.M, quality !== "low");
    this.scene.add(this.pieces.group, this.marks.group);
    this.ghost.add(this.scene);
    this.rig = new Rig(
      { minDist: 1.2, maxDist: 90, minPitch: 0.08, maxPitch: 1.5, bounds: { x0: -SITE - 6, z0: -SITE - 6, x1: SITE + 6, z1: SITE + 8 } },
      { target: new THREE.Vector3(0, 1, 0), dist: 26, yaw: 0.7, pitch: 0.45 },
    );
    if (quality === "high") {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      try {
        const ao = new GTAOPass(this.scene, this.camera, 256, 256);
        ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.6, thickness: 0.35, scale: 1.0, samples: 12 });
        ao.blendIntensity = 0.9;
        this.composer.addPass(ao);
      } catch {
        // No ambient occlusion here.
      }
      this.composer.addPass(new OutputPass());
      const grade = new ShaderPass(GRADE);
      grade.uniforms.uSat.value = 1.02;
      grade.uniforms.uContrast.value = 1.06;
      grade.uniforms.uWarm.value = 0.03;
      grade.uniforms.uVignette.value = 0.32;
      this.composer.addPass(grade);
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.w, this.h, false);
    this.composer?.setSize(this.w, this.h);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  get height() {
    return this.h;
  }

  setJob(j: Job | null) {
    this.marks.setZone(j);
  }

  frame(s: State, dt: number, now: number) {
    if (s.rev !== this.lastRev) {
      this.lastRev = s.rev;
      this.pieces.sync(s, now);
      this.site.update(s);
    }
    this.pieces.frame(s, now);
    this.pieces.cure(s, now);
    this.site.frame(now / 1000);
    this.rig.step(dt, this.camera);
    const d = this.rig.cur.dist;
    this.camera.near = Math.max(0.03, d * 0.01);
    this.camera.far = 6000;
    this.camera.updateProjectionMatrix();
    this.sky.position.copy(this.camera.position);
    // The sun's shadows cover what's in view, snapped to texels so edges don't crawl.
    const T = this.rig.cur.target;
    const S = Math.max(4, Math.min(48, d * 0.95));
    const sc = this.sun.shadow.camera;
    sc.left = -S;
    sc.right = S;
    sc.top = S;
    sc.bottom = -S;
    sc.near = 1;
    sc.far = 400;
    sc.updateProjectionMatrix();
    const texel = (S * 2) / this.sun.shadow.mapSize.x;
    const tx = Math.round(T.x / texel) * texel;
    const tz = Math.round(T.z / texel) * texel;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 150, this.sunDir.y * 150, tz + this.sunDir.z * 150);
    this.sun.shadow.normalBias = 0.004 + S * 0.0009;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.ready = true;
  }

  /** What's under a point on the screen (normalised -1..1): the piece and the face, or the ground. */
  pick(s: State, nx: number, ny: number): Hit | null {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const o = this.ray.ray.origin;
    const dir = this.ray.ray.direction;
    const tGround = dir.y < -1e-4 ? -o.y / dir.y : Infinity;
    let best: Hit | null = null;
    let bestT = Infinity;
    const seen = new Set<number>();
    const maxT = Math.min(tGround, 160);
    for (let t = 0; t < maxT && t < bestT + 1; t += 0.45) {
      const px = o.x + dir.x * t;
      const py = o.y + dir.y * t;
      const pz = o.z + dir.z * t;
      if (py > 16 && dir.y > 0) break;
      if (Math.abs(px) > SITE + 2 || Math.abs(pz) > SITE + 2) continue;
      for (const p of near(s, { x0: px - 0.5, x1: px + 0.5, z0: pz - 0.5, z1: pz + 0.5, y0: py - 0.6, y1: py + 0.6 }, 0)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        const hit = rayBox(o, dir, box(p));
        if (hit && hit.t < bestT) {
          bestT = hit.t;
          best = { x: o.x + dir.x * hit.t, y: o.y + dir.y * hit.t, z: o.z + dir.z * hit.t, nx: hit.n[0], ny: hit.n[1], nz: hit.n[2], id: p.id };
        }
      }
    }
    if (best) return best;
    if (tGround < Infinity) return { x: o.x + dir.x * tGround, y: 0, z: o.z + dir.z * tGround, nx: 0, ny: 1, nz: 0, id: -1 };
    return null;
  }

  /** A point on the ground (or at a height) under a screen point, for dragging out runs. */
  pickPlane(nx: number, ny: number, y: number) {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const o = this.ray.ray.origin;
    const dir = this.ray.ray.direction;
    if (Math.abs(dir.y) < 1e-4) return null;
    const t = (y - o.y) / dir.y;
    if (t < 0) return null;
    return { x: o.x + dir.x * t, y, z: o.z + dir.z * t };
  }

  dispose() {
    this.ro.disconnect();
    this.env.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

/** A ray against a box: where it enters, and through which face. */
function rayBox(o: THREE.Vector3, d: THREE.Vector3, b: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let n: [number, number, number] = [0, 1, 0];
  const axes: [number, number, number, number][] = [
    [o.x, d.x, b.x0, b.x1],
    [o.y, d.y, b.y0, b.y1],
    [o.z, d.z, b.z0, b.z1],
  ];
  for (let a = 0; a < 3; a++) {
    const [oo, dd, lo, hi] = axes[a];
    if (Math.abs(dd) < 1e-9) {
      if (oo < lo || oo > hi) return null;
      continue;
    }
    let t1 = (lo - oo) / dd;
    let t2 = (hi - oo) / dd;
    let sign = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      n = [0, 0, 0];
      n[a] = sign;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmin < 0) return null;
  return { t: tmin, n };
}
