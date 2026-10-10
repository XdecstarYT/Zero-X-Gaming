/**
 * The WebGL renderer, the render loop and the input (drag to pan, right-drag / ctrl / alt or
 * two-finger twist to turn, wheel or pinch to zoom, click to pick) for WareForge's world.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GRADE } from "@/nextx/look";
import { World, type Quality } from "./world";

export interface StageEvents {
  /** Every frame, before drawing (real seconds). */
  frame: (dt: number) => void;
  /** A click or tap without a drag: screen point in normalised device coordinates. */
  click?: (nx: number, ny: number) => void;
  /** The pointer moved over the world (for the build ghost). */
  hover?: (nx: number, ny: number) => void;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly world: World;
  /** Turn slowly (radians a second), for the title screen. */
  spin = 0;
  private raf = 0;
  private last = performance.now();
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;
  private off: (() => void)[] = [];
  private disposed = false;
  /**
   * High quality runs a post chain: the scene into a multisampled buffer, ambient occlusion
   * (contact shadows under and between things), a bloom on lamps and lights (stronger at night),
   * tone mapping and the NextX colour grade.
   */
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private ao: GTAOPass | null = null;
  /**
   * Adaptive resolution: the pixel ratio steps down while frames run slow and creeps back up when
   * there's headroom, so a busy warehouse stays smooth on a phone instead of stuttering.
   */
  private pr: number;
  private prMin: number;
  private prMax: number;
  private ema = 16.7;
  private slow = 0;
  private fast = 0;
  private raisedAt = -1e9;
  private frames = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    readonly quality: Quality,
    private events: StageEvents,
  ) {
    // Medium (phones) draws straight to the screen with the browser's multisampling; high
    // multisamples its own buffer for the post chain; low skips both.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "medium", powerPreference: "high-performance", stencil: false });
    const dpr = window.devicePixelRatio || 1;
    // Phones start at 1.5× (sharp, and well under half the pixels of 2.5–3×), and earn more if they can.
    this.prMax = quality === "low" ? 1 : Math.min(2, dpr);
    this.prMin = quality === "low" ? 0.75 : Math.min(1, this.prMax);
    this.pr = quality === "medium" ? Math.min(1.5, this.prMax) : this.prMax;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Medium redraws the sun's shadow map every other frame: things move slowly, nobody can tell.
    this.renderer.shadowMap.autoUpdate = quality === "high";
    this.world = new World(quality);
    this.world.bakeEnvironment(this.renderer);
    if (quality === "high") {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.world.scene, this.world.camera));
      try {
        const ao = new GTAOPass(this.world.scene, this.world.camera, 256, 256);
        ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: 12 });
        ao.blendIntensity = 0.85;
        // Ambient occlusion is soft: half resolution looks the same at a quarter of the cost.
        const size = ao.setSize.bind(ao);
        ao.setSize = (w: number, h: number) => size(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
        this.ao = ao;
        this.composer.addPass(this.ao);
      } catch {
        this.ao = null;
      }
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.5, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.composer.addPass(new ShaderPass(GRADE));
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.bind();
    this.raf = requestAnimationFrame(this.frame);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.w, this.h, false);
    this.composer?.setSize(this.w, this.h);
    this.world.resize(this.w, this.h);
  }

  /** Step the pixel ratio from how long frames are taking (milliseconds between them). */
  private govern(ms: number, now: number) {
    // A hidden tab or a one-off stall says nothing about the steady frame rate.
    if (ms > 1000) return;
    this.ema += (ms - this.ema) * 0.06;
    if (this.ema > 24) {
      this.slow += ms;
      this.fast = 0;
    } else if (this.ema < 17.6) {
      this.fast += ms;
      this.slow = 0;
    } else this.slow = this.fast = 0;
    if (this.slow > 1500 && this.pr > this.prMin) {
      // Slowed down soon after stepping up: that step was one too many, don't try it again.
      if (now - this.raisedAt < 12_000) this.prMax = this.pr - 0.25;
      this.setPixelRatio(this.pr - 0.25);
      this.ema = 20;
      this.slow = 0;
    } else if (this.fast > 6000 && this.pr < this.prMax) {
      this.setPixelRatio(this.pr + 0.25);
      this.raisedAt = now;
      this.fast = 0;
    }
  }

  private setPixelRatio(pr: number) {
    this.pr = Math.max(this.prMin, Math.min(this.prMax, pr));
    this.renderer.setPixelRatio(this.pr);
    this.composer?.setPixelRatio(this.pr);
    this.resize();
  }

  /** The pixel ratio the governor has settled on (for the graphics menu). */
  get pixelRatio() {
    return this.pr;
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const ms = now - this.last;
    const dt = Math.min(0.1, ms / 1000);
    this.last = now;
    if (document.hidden) return;
    this.govern(ms, now);
    if (!this.renderer.shadowMap.autoUpdate && this.frames++ % 2 === 0) this.renderer.shadowMap.needsUpdate = true;
    if (this.spin) this.world.rig.goal.yaw += this.spin * dt;
    this.events.frame(dt);
    this.world.update(dt);
    const night = this.world.nightness;
    // Without the glow pass (medium, low) nights are lifted a little more, so the lit hall reads.
    this.renderer.toneMappingExposure = 1.0 + night * (this.composer ? 0.25 : 0.45);
    if (this.composer && this.bloom) {
      // Only real lights glow: by day the sunlit floor is bright, so the threshold sits high.
      this.bloom.strength = 0.1 + night * 0.4;
      this.bloom.threshold = 1.6 - night * 0.75;
      this.composer.render(dt);
    } else this.renderer.render(this.world.scene, this.world.camera);
  };

  private ndc(e: { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }

  private bind() {
    const c = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; moved: boolean; rotate: boolean } | null = null;
    let pinch: { d: number; a: number; y: number } | null = null;
    const rig = () => this.world.rig;
    const down = (e: PointerEvent) => {
      c.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false, rotate: e.button === 2 || e.button === 1 || e.ctrlKey || e.altKey };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), y: (a.y + b.y) / 2 };
        drag = null;
      }
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) {
        const n = this.ndc(e);
        this.events.hover?.(n.x, n.y);
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const my = (a.y + b.y) / 2;
        rig().zoom(pinch.d / Math.max(1, d));
        rig().rotate(-(ang - pinch.a) * 160, (my - pinch.y) * 0.8);
        pinch = { d, a: ang, y: my };
        return;
      }
      if (drag) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
        if (drag.moved) {
          if (drag.rotate) rig().rotate(dx, dy);
          else rig().pan(dx, dy, this.h, this.world.camera.fov);
        } else if (e.pointerType !== "mouse") {
          const n = this.ndc(e);
          this.events.hover?.(n.x, n.y);
        }
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && !drag.moved && e.button === 0 && pointers.size === 0) {
        const n = this.ndc(e);
        this.events.click?.(n.x, n.y);
      }
      if (pointers.size === 0) drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = Math.exp(e.deltaY * 0.0012);
      const n = this.ndc(e);
      rig().zoom(f, f < 1 ? this.world.groundAt(n.x, n.y) : null);
    };
    const menu = (e: Event) => e.preventDefault();
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", wheel, { passive: false });
    c.addEventListener("contextmenu", menu);
    this.off.push(() => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("wheel", wheel);
      c.removeEventListener("contextmenu", menu);
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.off.forEach((f) => f());
    this.world.dispose();
    this.ao?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
