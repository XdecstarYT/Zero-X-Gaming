/**
 * One WebGL renderer for YourGov's two 3D views (the country and the chamber), the render
 * loop, and the pointer, wheel and touch input that drives the active view's camera.
 */
import * as THREE from "three";
import type { Country } from "../map";
import { ChamberView } from "./chamber3d";
import { loadTerrain } from "./loadTerrain";
import { WorldView } from "./world3d";

export type Quality = "high" | "low";

export interface StageEvents {
  /** A click (not a drag) on the map: the county under it, or -1. */
  onPickCounty?: (county: number) => void;
  /** The county under the pointer changed. */
  onHoverCounty?: (county: number, x: number, y: number) => void;
  /** The terrain finished building. */
  onReady?: () => void;
}

export class Stage3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly world: WorldView;
  readonly chamber: ChamberView;
  active: "map" | "chamber" = "map";
  paused = false;
  /** Asked every frame: is the game paused (by the platform's pause button)? */
  isPaused: () => boolean = () => false;
  /** Turn the camera slowly (radians a second), for the title screen. */
  spin = 0;
  /** Draw state labels and the like (hidden during the count). */
  labels = { selected: -1, hidden: false };
  private raf = 0;
  private last = performance.now();
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;
  private disposed = false;
  private off: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    country: Country,
    readonly quality: Quality,
    labelRoot: HTMLElement | null,
    private events: StageEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", alpha: false });
    this.renderer.setPixelRatio(quality === "high" ? Math.min(2, window.devicePixelRatio || 1) : 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = quality === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.world = new WorldView(country, quality, labelRoot);
    this.world.bakeEnvironment(this.renderer);
    this.chamber = new ChamberView(quality);
    this.chamber.bakeEnvironment(this.renderer);
    loadTerrain(country, quality).then((b) => {
      if (this.disposed) return;
      this.world.setTerrain(b, this.renderer.capabilities.getMaxAnisotropy());
      this.events.onReady?.();
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.bindInput();
    this.raf = requestAnimationFrame(this.frame);
  }

  private get view() {
    return this.active === "map" ? this.world : this.chamber;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.w, this.h, false);
    this.world.resize(this.w, this.h);
    this.chamber.resize(this.w, this.h);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.paused || this.isPaused() || document.hidden) return;
    if (this.spin) this.view.rig.goal.yaw += this.spin * dt;
    if (this.active === "map") {
      if (!this.world.ready) {
        // Until the land arrives, show the sky and the sea.
        this.world.update(dt, this.w, this.h, { selected: -1, hidden: true });
      } else this.world.update(dt, this.w, this.h, this.labels);
      this.renderer.render(this.world.scene, this.world.camera);
    } else {
      this.chamber.update(dt);
      this.renderer.render(this.chamber.scene, this.chamber.camera);
    }
  };

  setActive(v: "map" | "chamber") {
    this.active = v;
    this.world.rig.moved = true;
    if (this.world.labelRoot) this.world.labelRoot.style.display = v === "map" ? "" : "none";
  }

  // ------------------------------------------------------------------ input

  private ndc(e: { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1, px: e.clientX - r.left, py: e.clientY - r.top };
  }

  private bindInput() {
    const c = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; moved: boolean; rotate: boolean } | null = null;
    let pinch: { d: number; a: number; y: number } | null = null;
    let hoverAt = 0;
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
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
      const rig = this.view.rig;
      const cam = this.view.camera;
      if (p) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (pinch && pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const my = (a.y + b.y) / 2;
          rig.zoom(pinch.d / Math.max(1, d));
          rig.rotate(-(ang - pinch.a) * 160, (my - pinch.y) * 0.8);
          pinch = { d, a: ang, y: my };
          return;
        }
        if (drag) {
          if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
          if (drag.moved) {
            if (drag.rotate || this.active === "chamber") rig.rotate(dx, dy);
            else rig.pan(dx, dy, this.h, cam.fov);
          }
        }
        return;
      }
      // Hover: which county is under the pointer (at most every 60 ms).
      if (this.active === "map" && this.world.ready && this.events.onHoverCounty && e.timeStamp - hoverAt > 60) {
        hoverAt = e.timeStamp;
        const n = this.ndc(e);
        this.events.onHoverCounty(this.world.countyAt(n.x, n.y), n.px, n.py);
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && !drag.moved && this.active === "map" && this.world.ready && e.button === 0) {
        const n = this.ndc(e);
        this.events.onPickCounty?.(this.world.countyAt(n.x, n.y));
      }
      if (pointers.size === 0) drag = null;
    };
    const leave = () => this.events.onHoverCounty?.(-1, 0, 0);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = Math.exp(e.deltaY * 0.0012);
      if (this.active === "map") {
        const n = this.ndc(e);
        this.world.rig.zoom(f, f < 1 ? this.world.groundAt(n.x, n.y) : null);
      } else this.chamber.rig.zoom(f);
    };
    const menu = (e: Event) => e.preventDefault();
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", leave);
    c.addEventListener("wheel", wheel, { passive: false });
    c.addEventListener("contextmenu", menu);
    this.off.push(() => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("pointerleave", leave);
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
    this.chamber.dispose();
    this.renderer.dispose();
  }
}
