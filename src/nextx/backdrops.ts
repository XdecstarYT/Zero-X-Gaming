/**
 * NextX Engine · Photoreal backdrops. The same renderers the NextX titles play on, running as a
 * living background: YourGov's country (photoreal terrain, a physical sky, a sea with surf,
 * drifting clouds) turning slowly in the sun, Zero City's island city (PBR buildings, roads,
 * image-based light, ACES tone mapping) orbiting at golden hour, and WareForge's warehouse yard
 * at work (trucks backing onto the doors, forklifts running the aisles), and Heatwave's Melbourne
 * at golden hour (the river, Flinders Street Station and the towers, trams under the wires).
 *
 * Load this module lazily: it pulls in three.js and both games' renderers.
 */
import { newGame as newPort, NO_INPUT, step as stepPort } from "@/games/heatwave/sim";
import { loadMap as loadHeatwaveMap } from "@/games/heatwave/mapdata";
import { prepareMelbourne, sliced } from "@/games/heatwave/prepare";
import { HeatwaveView } from "@/games/heatwave/render/view";
import { newGame as newWarehouse, tick as tickWarehouse } from "@/games/wareforge/sim";
import { Stage as WarehouseStage } from "@/games/wareforge/render/stage";
import { Stage3D } from "@/games/yourgov/render/stage";
import { canRelief } from "@/games/sovereign/relief";
import { MapView } from "@/games/sovereign/render";
import { advance as advanceWorld, startGame as startWorld } from "@/games/sovereign/sim";
import { loadWorld } from "@/games/sovereign/world";
import * as THREE from "three";
import { View as XCityView } from "@/games/xcity/render/view";
import { showcaseCity } from "@/games/xcity/showcase";
import { View as GroundworkView } from "@/games/groundwork/render/view";
import { showcaseHouse } from "@/games/groundwork/showcase";
import { advance as advanceCity } from "@/games/xcity/sim";
import { country } from "@/games/yourgov/sim";
import { demoCity } from "@/games/zero-city/demo";
import { WorldViews } from "@/games/zero-city/game";
import { CameraRig } from "@/games/zero-city/render/camera";
import { Engine } from "@/games/zero-city/render/engine";
import { defaultSettings } from "@/games/zero-city/settings";

export type BackdropKind = "country" | "city" | "warehouse" | "port" | "world" | "xcity" | "groundwork";
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

/** WareForge's Riverside Hub, working through its morning shift. */
function warehouseBackdrop(host: HTMLElement, quality: Quality, still: boolean): Backdrop {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  const state = newWarehouse("wh01", 41);
  // Get the shift going: the first truck in, forklifts at work.
  tickWarehouse(state, 20 * 60);
  let done: () => void = () => {};
  const ready = new Promise<void>((r) => (done = r));
  let first = true;
  const stage: WarehouseStage = new WarehouseStage(canvas, quality, {
    frame: (dt) => {
      if (!still) tickWarehouse(state, dt * 60);
      stage.world.sync(state, dt, null, null);
      if (first) {
        first = false;
        done();
      }
    },
  });
  stage.spin = still ? 0 : 0.04;
  stage.world.rig.jump({ target: stage.world.rig.goal.target.clone().set(14, 0, 18), dist: 62, yaw: 0.5, pitch: 0.82 });
  return {
    ready,
    dispose() {
      stage.dispose();
      canvas.remove();
    },
  };
}

/** Heatwave's Melbourne at golden hour: the Yarra, Flinders Street Station and the city towers, trams moving. */
function portBackdrop(host: HTMLElement, quality: Quality, still: boolean): Backdrop {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  let raf = 0;
  let gone = false;
  let stop = () => {};
  // The real map streams in first; then the city builds (and the streets round the camera load) a
  // slice at a time, so the page stays live.
  const build = async () => {
    await loadHeatwaveMap();
    if (gone) return;
    await prepareMelbourne(7);
    if (gone) return;
    const s = newPort(7);
    s.density = quality === "low" ? { cars: 14, peds: 16 } : { cars: 26, peds: 30 };
    s.clock = 18.1 * 60;
    const view = new HeatwaveView(canvas, s, quality === "low" ? "low" : "medium", { defer: true });
    // High over Birrarung Marr (clear of the towers), looking up the Yarra to the station and the city.
    const cinema = { x: 30, z: 170, dist: 360, height: 130, speed: still ? 0 : 0.02, a: -0.25 };
    view.cinema = cinema;
    stop = () => view.dispose();
    await sliced(view.warm(cinema.x, cinema.z));
    if (gone) return;
    const size = () => view.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), window.devicePixelRatio || 1);
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);
    stop = () => {
      ro.disconnect();
      view.dispose();
    };
    await new Promise<void>((done) => {
      let last = performance.now();
      let first = true;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (document.hidden) return;
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!still) stepPort(s, NO_INPUT, dt);
        s.clock = 18.1 * 60;
        view.city.update(cinema.x, cinema.z);
        view.frame(s, dt, { goals: [] }, now / 1000, false);
        if (first) {
          first = false;
          done();
        }
      };
      raf = requestAnimationFrame(loop);
    });
  };
  const ready = build();
  return {
    ready,
    dispose() {
      gone = true;
      cancelAnimationFrame(raf);
      stop();
      canvas.remove();
    },
  };
}

/** Sovereign's world in 3D: the real relief in the sun, the nations, and the AI playing on (wars and all), the camera drifting over it. */
function worldBackdrop(host: HTMLElement, quality: Quality, still: boolean): Backdrop {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  let raf = 0;
  let gone = false;
  let stop = () => {};
  const build = async () => {
    const world = await loadWorld();
    if (gone) return;
    const s = startWorld(world, "USA", { seed: 7 });
    const view = new MapView(canvas, world, quality === "low");
    if (canRelief()) view.setRelief(true);
    const size = () => view.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), window.devicePixelRatio || 1);
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);
    stop = () => {
      ro.disconnect();
      view.dispose();
    };
    // Over Europe, tilted toward the horizon, drifting east.
    const cam = { x: 2200, y: 640, zoom: 1.25 };
    view.focus(cam.x, cam.y, cam.zoom);
    // Wait for the relief (or give up on it) before the first frame.
    for (let i = 0; i < 100 && view.relief && !view.is3D; i++) await new Promise((r) => setTimeout(r, 50));
    if (gone) return;
    await new Promise<void>((done) => {
      let last = performance.now();
      let first = true;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (document.hidden) return;
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!still) {
          advanceWorld(s, world, dt * 3);
          cam.x += dt * 6;
          if (cam.x > 3600) cam.x = 1200;
          view.focus(cam.x, cam.y + Math.sin(now / 9000) * 40, cam.zoom);
        }
        view.draw(s, dt);
        if (first) {
          first = false;
          done();
        }
      };
      raf = requestAnimationFrame(loop);
    });
  };
  const ready = build();
  return {
    ready,
    dispose() {
      gone = true;
      cancelAnimationFrame(raf);
      stop();
      canvas.remove();
    },
  };
}

/** XCity: a grown city by the river, the camera circling slowly over it while it builds. */
function xcityBackdrop(host: HTMLElement, quality: Quality, still: boolean): Backdrop {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  let raf = 0;
  let gone = false;
  let stop = () => {};
  const build = async () => {
    const s = await showcaseCity(() => new Promise((r) => setTimeout(r, 0)));
    if (gone) return;
    const view = new XCityView(canvas, quality === "low" ? "low" : "medium");
    stop = () => view.dispose();
    view.rig.jump({ target: new THREE.Vector3(120, 0, 120), dist: 780, yaw: 0.7, pitch: 0.62 });
    view.buildAll(s);
    await new Promise<void>((done) => {
      let last = performance.now();
      let first = true;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (document.hidden) return;
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!still) {
          view.rig.goal.yaw += dt * 0.035;
          advanceCity(s, dt / 20);
        }
        view.frame(s, dt, now);
        if (first) {
          first = false;
          done();
        }
      };
      raf = requestAnimationFrame(loop);
    });
  };
  const ready = build();
  return {
    ready,
    dispose() {
      gone = true;
      cancelAnimationFrame(raf);
      stop();
      canvas.remove();
    },
  };
}

/** Groundwork: the show home on its plot, the camera walking slowly round it. */
function groundworkBackdrop(host: HTMLElement, quality: Quality, still: boolean): Backdrop {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  let raf = 0;
  let gone = false;
  let stop = () => {};
  const build = async () => {
    await new Promise((r) => setTimeout(r, 0));
    if (gone) return;
    const s = showcaseHouse();
    // Scenery only: phones get the light renderer (no grass, plain resolution).
    const view = new GroundworkView(canvas, quality === "high" ? "medium" : "low");
    stop = () => view.dispose();
    view.rig.jump({ target: new THREE.Vector3(0, 1.6, 0), dist: 19, yaw: 0.65, pitch: 0.26 });
    await new Promise<void>((done) => {
      let last = performance.now();
      let first = true;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        // A slow orbit doesn't need more than about 20 frames a second.
        if (document.hidden || (!first && now - last < 50)) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!still) view.rig.goal.yaw += dt * 0.04;
        view.frame(s, dt, now);
        if (first) {
          first = false;
          done();
        }
      };
      raf = requestAnimationFrame(loop);
    });
  };
  const ready = build();
  return {
    ready,
    dispose() {
      gone = true;
      cancelAnimationFrame(raf);
      stop();
      canvas.remove();
    },
  };
}

/** Mount a backdrop in `host` (which should be positioned). Throws if WebGL isn't available. */
export function mountBackdrop(kind: BackdropKind, host: HTMLElement, quality: Quality = pickQuality(), still = false): Backdrop {
  if (kind === "port") return portBackdrop(host, quality, still);
  if (kind === "world") return worldBackdrop(host, quality, still);
  if (kind === "xcity") return xcityBackdrop(host, quality, still);
  if (kind === "groundwork") return groundworkBackdrop(host, quality, still);
  if (kind === "warehouse") return warehouseBackdrop(host, quality, still);
  return kind === "country" ? countryBackdrop(host, quality, still) : cityBackdrop(host, quality, still);
}
