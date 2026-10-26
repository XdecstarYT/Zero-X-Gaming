import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FACADE_UNIFORMS } from "@/games/heatwave/render/facade";
import { GRADE, makeSky, SkyEnvironment, skyFor, type SkyMesh } from "@/nextx/look";
import { Rig } from "@/nextx/rig";
import { MAP_HALF } from "../data";
import type { Building, State } from "../state";
import { buildChunk, chunkOf, heightOf } from "./chunks";
import { countryTexture, grainTexture, GroundPainter, groundMaterial, hillRing, macroTexture, rippleTexture, riverMesh } from "./ground";
import { Overlay } from "./overlay";
import { buildRoads, type RoadMeshes } from "./roadmesh";
import { Traffic } from "./traffic";

/**
 * XCity in 3D. A NextX stage: the sky and its light, the painted ground and the river, the roads,
 * the buildings in chunks that rebuild a few at a time when the city changes, traffic and trams,
 * the planner's overlays, an orbiting camera, and a post chain on fast machines.
 */

export type Quality = "low" | "medium" | "high";

export function pickQuality(): Quality {
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (coarse) return cores >= 8 ? "medium" : "low";
  return cores >= 8 ? "high" : "medium";
}

const SUN_H = 0.52;

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 1, 40000);
  readonly rig: Rig;
  readonly overlay = new Overlay();
  private sky: SkyMesh;
  private env: SkyEnvironment;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private sunDir = new THREE.Vector3();
  private painter: GroundPainter;
  private ground: THREE.Mesh;
  private river: THREE.Mesh | null = null;
  private roads: RoadMeshes | null = null;
  private roadSig = "";
  private chunks = new Map<number, { group: THREE.Group; dispose(): void }>();
  private chunkSig = new Map<number, string>();
  private stamp = new Map<number, number>();
  private edgeSigs = new Map<number, { sig: string; box: number[] }>();
  private distSigs = new Map<number, { sig: string; box: number[] }>();
  private queue: number[] = [];
  private traffic: Traffic;
  private grain = grainTexture();
  private ripple = rippleTexture();
  private composer: EffectComposer | null = null;
  private lastRev = -1;
  private lastZrev = -1;
  private paintAt = 0;
  private paintDirty = true;
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;
  private ray = new THREE.Raycaster();
  private pr: number;
  private prMin: number;
  private prMax: number;
  private ema = 16.7;
  private slow = 0;
  private fast = 0;
  /** Whether everything has been built at least once (for the loading screen). */
  ready = false;

  constructor(
    private canvas: HTMLCanvasElement,
    readonly quality: Quality,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "high", powerPreference: "high-performance", stencil: false, logarithmicDepthBuffer: false });
    const dpr = window.devicePixelRatio || 1;
    this.prMax = quality === "low" ? 1 : Math.min(2, dpr);
    this.prMin = quality === "low" ? 0.7 : 1;
    this.pr = quality === "medium" ? Math.min(1.5, this.prMax) : this.prMax;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // The sky, its light, and the haze.
    this.sky = makeSky();
    this.sky.scale.setScalar(30000);
    this.scene.add(this.sky);
    const L = skyFor(SUN_H);
    const u = this.sky.material.uniforms;
    u.uZenith.value.copy(L.zenith);
    u.uHorizon.value.copy(L.horizon);
    u.uSunColor.value.copy(L.sun);
    if (u.uCloud) u.uCloud.value = 0.25;
    const az = 0.9;
    this.sunDir.set(Math.cos(az) * Math.sqrt(1 - SUN_H * SUN_H), SUN_H, Math.sin(az) * Math.sqrt(1 - SUN_H * SUN_H)).normalize();
    u.uSunDir.value.copy(this.sunDir);
    // Aerial perspective: the far side of town and the farms beyond fade into a pale blue haze.
    this.scene.fog = new THREE.Fog(L.horizon.clone().lerp(new THREE.Color("#c4d0da"), 0.55), 900, 7000);
    this.sun = new THREE.DirectionalLight(L.sun, L.sunI * 0.95);
    this.sun.castShadow = quality !== "low";
    const sm = quality === "high" ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(L.zenith, new THREE.Color("#6b7a4a"), L.hemiI * 0.9);
    this.scene.add(this.hemi);
    this.env = new SkyEnvironment(this.renderer, this.sky, 64);
    this.scene.environment = this.env.update("day");
    this.scene.environmentIntensity = 0.55;
    FACADE_UNIFORMS.uDay.value = 1;
    FACADE_UNIFORMS.uNight.value = 0;
    // The ground and the country round it.
    this.painter = new GroundPainter(quality === "high" ? 4096 : quality === "medium" ? 2048 : 1024);
    const gg = new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2, 1, 1).rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(gg, groundMaterial(this.painter.tex, this.grain, macroTexture()));
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const ct = countryTexture();
    // The countryside is a frame round the map (nothing overlaps the map, so nothing can flicker).
    const frame = new THREE.Shape();
    const F = MAP_HALF * 12;
    frame.moveTo(-F, -F).lineTo(F, -F).lineTo(F, F).lineTo(-F, F).closePath();
    const hole = new THREE.Path();
    hole.moveTo(-MAP_HALF, -MAP_HALF).lineTo(-MAP_HALF, MAP_HALF).lineTo(MAP_HALF, MAP_HALF).lineTo(MAP_HALF, -MAP_HALF).closePath();
    frame.holes.push(hole);
    const fg = new THREE.ShapeGeometry(frame).rotateX(-Math.PI / 2);
    // World-space UVs so the patchwork tiles every 3.2 km.
    const fp = fg.getAttribute("position");
    const fuv = new Float32Array(fp.count * 2);
    for (let i = 0; i < fp.count; i++) {
      fuv[i * 2] = fp.getX(i) / (MAP_HALF * 2);
      fuv[i * 2 + 1] = fp.getZ(i) / (MAP_HALF * 2);
    }
    fg.setAttribute("uv", new THREE.BufferAttribute(fuv, 2));
    const outer = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ct, roughness: 1 }));
    outer.receiveShadow = true;
    this.scene.add(outer);
    this.scene.add(hillRing(14000));
    this.traffic = new Traffic(quality);
    this.scene.add(this.traffic.group, this.overlay.group);
    this.rig = new Rig(
      { minDist: 32, maxDist: 4200, minPitch: 0.3, maxPitch: 1.48, bounds: { x0: -MAP_HALF - 100, z0: -MAP_HALF - 100, x1: MAP_HALF + 100, z1: MAP_HALF + 100 } },
      { target: new THREE.Vector3(0, 0, 200), dist: 820, yaw: 0.55, pitch: 0.82 },
    );
    if (quality === "high") {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      try {
        const ao = new GTAOPass(this.scene, this.camera, 256, 256);
        ao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.8, thickness: 2.5, scale: 1.0, samples: 12 });
        ao.blendIntensity = 0.75;
        const size = ao.setSize.bind(ao);
        ao.setSize = (w: number, h: number) => size(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
        this.composer.addPass(ao);
      } catch {
        // No ambient occlusion on this browser.
      }
      this.composer.addPass(new OutputPass());
      const grade = new ShaderPass(GRADE);
      grade.uniforms.uSat.value = 0.96;
      grade.uniforms.uContrast.value = 1.06;
      grade.uniforms.uWarm.value = 0.025;
      grade.uniforms.uVignette.value = 0.3;
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

  /** Catch up with the city: roads, chunks that changed, the painted ground. */
  sync(s: State, now: number) {
    if (!this.river) {
      this.river = riverMesh(s, this.ripple);
      this.scene.add(this.river);
    }
    this.traffic.sync(s);
    if (s.rev === this.lastRev && s.zrev === this.lastZrev) return;
    const zoneChanged = s.zrev !== this.lastZrev;
    this.lastRev = s.rev;
    this.lastZrev = s.zrev;
    this.paintDirty = true;
    // Roads.
    const rsig = s.edges.map((e) => (e ? `${e.id}:${e.kind[0]}${e.bike ? 1 : 0}${e.tram ? 1 : 0}${Math.round(e.len)}` : "")).join(",") + `|${s.nodes.length}`;
    const roadsChanged = rsig !== this.roadSig;
    if (roadsChanged) {
      this.roadSig = rsig;
      if (this.roads) {
        this.scene.remove(this.roads.group);
        this.roads.dispose();
      }
      this.roads = buildRoads(s, this.grain, this.quality);
      this.scene.add(this.roads.group);
    }
    // Which chunks have changed: their buildings, or (for trees) a road or district over them.
    const touch = (box: number[]) => {
      const i0 = Math.max(0, Math.floor((box[0] + MAP_HALF) / 200));
      const i1 = Math.min(NC - 1, Math.floor((box[2] + MAP_HALF) / 200));
      const j0 = Math.max(0, Math.floor((box[1] + MAP_HALF) / 200));
      const j1 = Math.min(NC - 1, Math.floor((box[3] + MAP_HALF) / 200));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.stamp.set(i * NC + j, (this.stamp.get(i * NC + j) ?? 0) + 1);
    };
    const diff = (store: Map<number, { sig: string; box: number[] }>, items: ({ id: number; sig: string; pts: number[]; pad: number } | null)[]) => {
      const live = new Set<number>();
      for (const it of items) {
        if (!it) continue;
        live.add(it.id);
        const old = store.get(it.id);
        if (old?.sig === it.sig) continue;
        const box = boxOf(it.pts, it.pad);
        if (old) touch(old.box);
        touch(box);
        store.set(it.id, { sig: it.sig, box });
      }
      for (const [id, old] of store)
        if (!live.has(id)) {
          touch(old.box);
          store.delete(id);
        }
    };
    const NC = Math.ceil((MAP_HALF * 2) / 200);
    if (roadsChanged) diff(this.edgeSigs, s.edges.map((e) => (e ? { id: e.id, sig: `${e.kind}${e.len.toFixed(1)}${e.pts[0]}`, pts: e.pts, pad: 40 } : null)));
    if (zoneChanged) diff(this.distSigs, s.districts.map((d) => (d ? { id: d.id, sig: `${d.use}${d.crop}${d.poly.join(",")}`, pts: d.poly, pad: 10 } : null)));
    const sig = new Map<number, string>();
    for (const b of s.buildings) {
      if (!b) continue;
      const c = chunkOf(b.x, b.z);
      sig.set(c, (sig.get(c) ?? "") + `${b.id}${b.done ? "d" : Math.floor(b.progress * 5)}${b.roof[0]},`);
    }
    for (let id = 0; id < NC * NC; id++) {
      const k = `${sig.get(id) ?? ""}#${this.stamp.get(id) ?? 0}`;
      if (k !== this.chunkSig.get(id)) {
        this.chunkSig.set(id, k);
        if (!this.queue.includes(id)) this.queue.push(id);
      }
    }
    void now;
  }

  /** Rebuild a few dirty chunks, nearest the camera first. */
  private work(s: State, budgetMs: number) {
    if (!this.queue.length) {
      this.ready = true;
      return;
    }
    const t = this.rig.cur.target;
    this.queue.sort((a, b) => dist2(a, t) - dist2(b, t));
    const start = performance.now();
    while (this.queue.length && performance.now() - start < budgetMs) {
      const id = this.queue.shift()!;
      const old = this.chunks.get(id);
      if (old) {
        this.scene.remove(old.group);
        old.dispose();
      }
      const c = buildChunk(s, id, this.quality);
      this.chunks.set(id, c);
      this.scene.add(c.group);
    }
    if (!this.queue.length) this.ready = true;
  }

  /** Build everything now (for the first frame). */
  buildAll(s: State) {
    this.sync(s, performance.now());
    this.work(s, 1e9);
    this.painter.paint(s);
    this.paintDirty = false;
  }

  /** Fraction of the city built so far (for a loading bar). */
  get progress() {
    const NC = Math.ceil((MAP_HALF * 2) / 200);
    return 1 - this.queue.length / (NC * NC);
  }

  frame(s: State, dt: number, now: number) {
    this.sync(s, now);
    this.work(s, this.ready ? 6 : 40);
    if (this.paintDirty && now - this.paintAt > 800) {
      this.painter.paint(s);
      this.paintDirty = false;
      this.paintAt = now;
    }
    this.govern(dt * 1000);
    this.rig.step(dt, this.camera);
    const d = this.rig.cur.dist;
    this.camera.near = Math.max(0.5, d * 0.05);
    this.camera.far = 40000;
    this.camera.updateProjectionMatrix();
    this.sky.position.copy(this.camera.position);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = 260 + d * 0.42;
    fog.far = 3600 + d * 2.3;
    // The sun's shadow follows what's in view.
    const T = this.rig.cur.target;
    const S = Math.max(70, Math.min(1100, d * 0.85));
    const sc = this.sun.shadow.camera;
    sc.left = -S;
    sc.right = S;
    sc.top = S;
    sc.bottom = -S;
    sc.near = 10;
    sc.far = 4000;
    sc.updateProjectionMatrix();
    // Snap to shadow texels so edges don't crawl as the camera moves.
    const texel = (S * 2) / this.sun.shadow.mapSize.x;
    const tx = Math.round(T.x / texel) * texel;
    const tz = Math.round(T.z / texel) * texel;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 1500, this.sunDir.y * 1500, tz + this.sunDir.z * 1500);
    FACADE_UNIFORMS.uTime.value = now / 1000;
    const rip = this.ripple;
    rip.offset.set((now / 1000) * 0.01, (now / 1000) * 0.006);
    this.traffic.update(s, dt, s.congestion);
    this.overlay.update(dt);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Step the pixel ratio from how long frames take. */
  private govern(ms: number) {
    if (ms > 1000) return;
    this.ema += (ms - this.ema) * 0.06;
    if (this.ema > 26) {
      this.slow += ms;
      this.fast = 0;
    } else if (this.ema < 17.5) {
      this.fast += ms;
      this.slow = 0;
    } else this.slow = this.fast = 0;
    if (this.slow > 1500 && this.pr > this.prMin) {
      this.setPixelRatio(this.pr - 0.25);
      this.ema = 20;
      this.slow = 0;
    } else if (this.fast > 8000 && this.pr < this.prMax) {
      this.setPixelRatio(this.pr + 0.25);
      this.fast = 0;
    }
  }

  private setPixelRatio(pr: number) {
    this.pr = Math.max(this.prMin, Math.min(this.prMax, pr));
    this.renderer.setPixelRatio(this.pr);
    this.composer?.setPixelRatio(this.pr);
    this.resize();
  }

  /** The point on the ground under a screen position (CSS pixels in the canvas). */
  groundAt(sx: number, sy: number): { x: number; z: number } | null {
    this.ray.setFromCamera(new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1), this.camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    if (d.y >= -1e-4) return null;
    const t = -o.y / d.y;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }

  /** The building under a screen position, if any: walls first, then its footprint on the ground. */
  buildingAt(s: State, sx: number, sy: number): Building | null {
    this.ray.setFromCamera(new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1), this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const c of this.chunks.values()) for (const m of c.group.children) if (m.userData.pick) meshes.push(m);
    const hit = this.ray.intersectObjects(meshes, false)[0];
    const p = hit ? { x: hit.point.x, z: hit.point.z } : this.groundAt(sx, sy);
    if (!p) return null;
    let best: Building | null = null;
    let bd = hit ? 6 : 1.5;
    for (const b of s.buildings) {
      if (!b) continue;
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const u = Math.abs(dx * b.ux + dz * b.uz) - b.hw;
      const v = Math.abs(-dx * b.uz + dz * b.ux) - b.hd;
      const d = Math.max(u, v, 0);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  /** Where a map point lands on screen (for labels), or null if behind. */
  toScreen(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  /** Fly the camera to a building or a point. */
  focus(x: number, z: number, dist?: number) {
    const d = dist ?? Math.min(this.rig.goal.dist, 380);
    // On a tall screen the panels cover the bottom: aim past the thing so it sits in the top half.
    const lift = this.h > this.w * 1.2 ? d * 0.32 : 0;
    const yaw = this.rig.goal.yaw;
    this.rig.fly({ target: new THREE.Vector3(x + Math.sin(yaw) * lift, 0, z + Math.cos(yaw) * lift), dist: d });
  }

  heightOf(b: Building) {
    return heightOf(b);
  }

  dispose() {
    this.ro.disconnect();
    for (const c of this.chunks.values()) c.dispose();
    this.roads?.dispose();
    this.traffic.dispose();
    this.overlay.dispose();
    this.env.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

function dist2(id: number, t: THREE.Vector3) {
  const NC = Math.ceil((MAP_HALF * 2) / 200);
  const x = -MAP_HALF + (Math.floor(id / NC) + 0.5) * 200;
  const z = -MAP_HALF + ((id % NC) + 0.5) * 200;
  return (x - t.x) ** 2 + (z - t.z) ** 2;
}

function boxOf(p: number[], pad: number) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    z0 = Math.min(z0, p[i + 1]);
    z1 = Math.max(z1, p[i + 1]);
  }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}
