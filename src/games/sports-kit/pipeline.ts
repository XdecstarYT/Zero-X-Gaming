import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { GRADE_SHADER, nightDome, physicalSky, type Detail, type TimeOfDay } from "./look";

/**
 * The renderer every Sports+ game shares: ACES tone mapping, soft shadows, a
 * post chain (ambient occlusion on Ultra, bloom, SMAA, the sharpening grade),
 * adaptive resolution, and a sun / floodlight rig with sky reflections.
 */
export class SportsPipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private resScale = 1;
  private ro: ResizeObserver;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  readonly key = new THREE.DirectionalLight("#fff4e0", 2.6);
  readonly hemi = new THREE.HemisphereLight("#cfe2ff", "#3a4a2a", 1.0);
  readonly fills: THREE.DirectionalLight[] = [];
  private sunDir = new THREE.Vector3(0.45, 0.72, 0.52).normalize();
  /** Half-size of the shadow box around the action (m). */
  private shadowSpan: number;

  constructor(
    private host: HTMLElement,
    readonly detail: Detail,
    readonly tod: TimeOfDay,
    opts: { fov?: number; shadowSpan?: number; far?: number } = {},
  ) {
    const high = detail !== "low";
    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 40, 16 / 9, 0.1, opts.far ?? 2500);
    this.shadowSpan = opts.shadowSpan ?? 40;
    this.renderer = new THREE.WebGLRenderer({ antialias: !high, powerPreference: "high-performance", stencil: false });
    this.renderer.setPixelRatio(this.baseRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "absolute inset-0 h-full w-full";
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    if (high) {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.setPixelRatio(this.postRatio());
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      if (detail === "ultra") {
        const ao = new GTAOPass(this.scene, this.camera, w, h);
        ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1.1, scale: 1.1 });
        ao.blendIntensity = 0.8;
        this.composer.addPass(ao);
      }
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), tod === "night" ? 0.55 : 0.3, 0.5, tod === "night" ? 0.86 : 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.composer.addPass(new SMAAPass());
      this.grade = new ShaderPass(GRADE_SHADER);
      this.grade.uniforms.warm.value = tod === "twilight" ? 1 : 0;
      this.composer.addPass(this.grade);
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  private baseRatio() {
    return Math.min(window.devicePixelRatio || 1, this.detail === "ultra" ? 2 : this.detail === "high" ? 1.5 : 1.25);
  }
  private postRatio() {
    return this.baseRatio() * this.resScale;
  }

  setResolution(k: number) {
    this.resScale = k;
    this.renderer.setPixelRatio(this.baseRatio() * k);
    this.composer?.setPixelRatio(this.postRatio());
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    if (this.grade) (this.grade.uniforms.texel.value as THREE.Vector2).set(1 / (w * this.postRatio()), 1 / (h * this.postRatio()));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Day: the sun and a physical sky. Twilight: a low orange sun with the
   * floodlights coming on. Night: floodlit from `towers`, under a dark dome.
   */
  lights(towers: THREE.Vector3[], opts: { sunDir?: THREE.Vector3; fog?: number } = {}) {
    const { scene, key, hemi, tod } = this;
    const high = this.detail !== "low";
    key.castShadow = true;
    key.shadow.mapSize.set(high ? 4096 : 1024, high ? 4096 : 1024);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -this.shadowSpan;
    sc.right = sc.top = this.shadowSpan;
    sc.near = 1;
    sc.far = 400;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 2;
    scene.add(key, key.target, hemi);
    const skyScene = new THREE.Scene();
    if (tod === "night") {
      const dome = nightDome();
      scene.add(dome);
      skyScene.add(dome.clone());
      this.sunDir = new THREE.Vector3(0.22, 1, 0.3).normalize();
      key.color.set("#f3f5ff");
      key.intensity = 2.3;
      hemi.color.set("#4b5a7a");
      hemi.groundColor.set("#1c2414");
      hemi.intensity = 0.45;
      this.renderer.toneMappingExposure = 1.05;
      scene.fog = new THREE.FogExp2("#0b0d14", opts.fog ?? 0.0011);
      const sp = new Float32Array(1500 * 3);
      for (let i = 0; i < 1500; i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(850);
        sp.set([v.x, v.y, v.z], i * 3);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
      scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.6, fog: false })));
    } else {
      const sky = physicalSky();
      sky.scale.setScalar(1500);
      const u = (sky.material as THREE.ShaderMaterial).uniforms;
      this.sunDir = (opts.sunDir ?? (tod === "twilight" ? new THREE.Vector3(-0.8, 0.09, 0.45) : new THREE.Vector3(0.45, 0.72, 0.52))).clone().normalize();
      (u.sunPosition.value as THREE.Vector3).copy(this.sunDir);
      u.turbidity.value = tod === "twilight" ? 4.5 : 2.4;
      u.rayleigh.value = tod === "twilight" ? 2.8 : 1.4;
      u.mieCoefficient.value = 0.005;
      u.mieDirectionalG.value = 0.82;
      u.cloudCoverage.value = high ? (tod === "twilight" ? 0.45 : 0.3) : 0;
      u.cloudDensity.value = 0.5;
      u.cloudElevation.value = 0.55;
      u.skyGain.value = tod === "twilight" ? 0.1 : 0.075;
      scene.add(sky);
      const envSky = new THREE.Mesh(sky.geometry, sky.material);
      envSky.scale.setScalar(100);
      skyScene.add(envSky);
      key.color.set(tod === "twilight" ? "#ffb878" : "#fff3dc");
      key.intensity = tod === "twilight" ? 2.1 : 2.9;
      hemi.color.set(tod === "twilight" ? "#9fb0d8" : "#cfe2ff");
      hemi.groundColor.set("#3a4a2a");
      hemi.intensity = tod === "twilight" ? 1.0 : 1.15;
      this.renderer.toneMappingExposure = tod === "twilight" ? 1.25 : 0.95;
      scene.fog = new THREE.FogExp2(tod === "twilight" ? "#b89a8a" : "#c8d8ea", (opts.fog ?? 0.0011) * 0.55);
    }
    if (tod !== "day")
      for (const t of towers.slice(0, 4)) {
        const f = new THREE.DirectionalLight("#fff6e6", tod === "night" ? 0.55 : 0.35);
        f.position.copy(t);
        f.target.position.set(0, 0, 0);
        scene.add(f, f.target);
        this.fills.push(f);
      }
    skyScene.add(new THREE.Mesh(new THREE.CircleGeometry(90, 24).rotateX(-Math.PI / 2).translate(0, -4, 0), new THREE.MeshBasicMaterial({ color: tod === "night" ? "#0c120a" : "#2c3b22" })));
    this.envRT = this.pmrem.fromScene(skyScene, 0.04);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = tod === "night" ? 0.25 : 0.6;
  }

  /** Keep the key light's shadow box on the action (texel-snapped against shimmer). */
  follow(x: number, z: number) {
    const texel = (this.shadowSpan * 2) / this.key.shadow.mapSize.x;
    const sx = Math.round(x / texel) * texel;
    const sz = Math.round(z / texel) * texel;
    const d = this.sunDir;
    this.key.target.position.set(sx, 0, sz);
    this.key.position.set(sx + d.x * 150, d.y * 150, sz + d.z * 150);
    this.key.target.updateMatrixWorld();
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.ro.disconnect();
    this.composer?.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.canvas.remove();
  }
}

/** Canvas texture helper (sRGB, optional repeat). */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Seeded value noise in [0, 1] (tileable over `period`). */
export function noise2(period: number, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const g = Array.from({ length: period * period }, () => rnd());
  const at = (x: number, y: number) => g[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (u: number, v: number) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}
