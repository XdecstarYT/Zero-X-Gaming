/**
 * NextX Engine · Photoreal backdrops. The same renderers the NextX titles play on, running as a
 * living background: YourGov's country (photoreal terrain, a physical sky, a sea with surf,
 * drifting clouds) turning slowly in the sun, and Zero City's island city (PBR buildings, roads,
 * image-based light, ACES tone mapping) orbiting at golden hour.
 *
 * Load this module lazily: it pulls in three.js and both games' renderers.
 */
import { Stage3D } from "@/games/yourgov/render/stage";
import { country } from "@/games/yourgov/sim";
import { demoCity } from "@/games/zero-city/demo";
import { WorldViews } from "@/games/zero-city/game";
import { CameraRig } from "@/games/zero-city/render/camera";
import { Engine } from "@/games/zero-city/render/engine";
import { defaultSettings } from "@/games/zero-city/settings";

export type BackdropKind = "country" | "city";
export type Quality = "high" | "low";

export interface Backdrop {
  /** Stop and free everything. */
  dispose(): void;
  /** Called once the first real frame (land, city) is up. */
  ready: Promise<void>;
}

/** A sensible quality for this device. */
export function pickQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  return small || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || (navigator.hardwareConcurrency ?? 8) <= 4 ? "low" : "high";
}

/** YourGov's country, turning in the sun. */
function countryBackdrop(host: HTMLElement, quality: Quality, still: boolean): Backdrop {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  let done: () => void = () => {};
  const ready = new Promise<void>((r) => (done = r));
  const stage = new Stage3D(canvas, country(20461), quality, null, { onReady: () => done() });
  stage.spin = still ? 0 : 0.03;
  stage.world.cloudsOn = quality === "high";
  stage.world.rig.jump({ target: stage.world.rig.goal.target.clone(), dist: 330, yaw: 0.4, pitch: 0.72 });
  return {
    ready,
    dispose() {
      stage.dispose();
      canvas.remove();
    },
  };
}

/** Zero City's island city, orbiting at golden hour. */
function cityBackdrop(host: HTMLElement, quality: Quality, still: boolean): Backdrop {
  const settings = defaultSettings(quality === "low");
  const engine = new Engine(host);
  engine.renderer.domElement.style.pointerEvents = "none";
  engine.renderer.domElement.setAttribute("aria-hidden", "true");
  engine.apply(settings);
  const demo = demoCity();
  const views = new WorldViews(demo.city, settings.shadows !== "off");
  views.buildings.setDensity(settings.buildingDensity / 100);
  views.terrain.buildAll();
  for (const b of demo.buildings) {
    const lot = demo.city.lots.lots.get(b.lot);
    if (lot) demo.city.clearTreesOnLot(lot);
  }
  views.trees.rebuild(demo.city.trees, demo.city.treeAlive, (x, z) => demo.city.terrain.surfaceAt(x, z), settings.shadows !== "off");
  views.roads.rebuildAll();
  for (const b of demo.buildings) {
    const lot = demo.city.lots.lots.get(b.lot);
    if (lot) views.buildings.setBuilding(lot, b);
  }
  views.overlays.mode = "off";
  demo.city.takeChanges();
  engine.scene.add(views.group);
  const rig = new CameraRig(engine.camera, () => demo.city.terrain);
  rig.set({ x: demo.centre.x, z: demo.centre.z, dist: 760, yaw: 0.6, pitch: 0.5 }, true);
  rig.orbit = still ? 0 : Infinity;
  const ro = new ResizeObserver(() => engine.resize());
  ro.observe(host);
  let raf = 0;
  let last = performance.now();
  let first = true;
  let done: () => void = () => {};
  const ready = new Promise<void>((r) => (done = r));
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    rig.update(dt);
    engine.focus.copy(rig.target);
    engine.setTime(17.75 * 60);
    views.terrain.update(rig.target.x, rig.target.z, 2200, now / 1000);
    views.roads.update(rig.dist);
    engine.render(rig.dist);
    if (first) {
      first = false;
      done();
    }
  };
  raf = requestAnimationFrame(loop);
  return {
    ready,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      engine.scene.remove(views.group);
      views.dispose();
      engine.dispose();
    },
  };
}

/** Mount a backdrop in `host` (which should be positioned). Throws if WebGL isn't available. */
export function mountBackdrop(kind: BackdropKind, host: HTMLElement, quality: Quality = pickQuality(), still = false): Backdrop {
  return kind === "country" ? countryBackdrop(host, quality, still) : cityBackdrop(host, quality, still);
}
