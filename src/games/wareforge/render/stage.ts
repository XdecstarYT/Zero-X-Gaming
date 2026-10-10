/**
 * The WebGL renderer, the render loop and the input (drag to pan, right-drag / ctrl / alt or
 * two-finger twist to turn, wheel or pinch to zoom, click to pick) for WareForge's world.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
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
  /** High quality: a soft bloom on lamps and lights, stronger at night. */
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    readonly quality: Quality,
    private events: StageEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "high", powerPreference: "high-performance" });
    this.renderer.setPixelRatio(quality === "high" ? Math.min(2, window.devicePixelRatio || 1) : 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = quality === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.world = new World(quality);
    this.world.bakeEnvironment(this.renderer);
    if (quality === "high") {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.world.scene, this.world.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.5, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
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

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) return;
    if (this.spin) this.world.rig.goal.yaw += this.spin * dt;
    this.events.frame(dt);
    this.world.update(dt);
    const night = this.world.nightness;
    this.renderer.toneMappingExposure = 1.08 + night * 0.12;
    if (this.composer && this.bloom) {
      // Only real lights glow: by day the sunlit floor is bright, so the threshold sits high.
      this.bloom.strength = 0.08 + night * 0.37;
      this.bloom.threshold = 1.7 - night * 0.8;
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
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
