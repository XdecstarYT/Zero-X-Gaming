import * as THREE from "three";
import { LOT_UNIT, WATER_LEVEL } from "./config";
import { chaikin, cubic, cumulative, polyLength, quadratic, sampleAt, snapAngle, type P } from "./core/geom";
import type { Game } from "./game";
import { RoadView } from "./render/roadView";
import { theme } from "./theme";
import type { Tab } from "./store";
import { halfWidth, ROAD_TYPES, carriageway, defaultLanes, type REdge } from "./world/roads";
import { SERVICE_SPEC, sideNormal, type Zone } from "./world/lots";

type V3 = THREE.Vector3;

/**
 * Pointer and keyboard input in the city: the active tool gets the left
 * button (or one finger); otherwise the camera does. Right/middle drag
 * orbits; two fingers pinch, twist and tilt.
 */
export class Tools {
  private pts: V3[] = [];
  private dragging = false;
  private downAt: { x: number; y: number; t: number } | null = null;
  private moved = false;
  private orbiting: { x: number; y: number } | null = null;
  private panning: { x: number; y: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; a: number; mx: number; my: number } | null = null;
  private hover: V3 | null = null;
  private dragStroke: P[] = [];
  private brushOn = false;
  private brushAcc = 0;
  private selectedService = -1;
  private movingService: { id: number; dx: number; dz: number } | null = null;
  private shift = false;
  private lastFrame = 0;
  private upgradeSeen = new Set<number>();

  constructor(private g: Game) {}

  get st() {
    return this.g.store.getState();
  }
  private get city() {
    return this.g.city;
  }

  attach(canvas: HTMLCanvasElement) {
    const down = (e: PointerEvent) => this.onDown(e);
    const move = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e);
    const wheel = (e: WheelEvent) => this.onWheel(e);
    const ctx = (e: Event) => e.preventDefault();
    const key = (e: KeyboardEvent) => this.onKey(e, true);
    const keyUp = (e: KeyboardEvent) => this.onKey(e, false);
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextmenu", ctx);
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", keyUp, true);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", ctx);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", keyUp, true);
    };
  }

  reset() {
    this.pts = [];
    this.dragging = false;
    this.dragStroke = [];
    this.brushOn = false;
    this.movingService = null;
    this.selectedService = -1;
    this.upgradeSeen.clear();
    this.g.views?.overlays.clearGhosts();
    this.g.views?.overlays.setBrush(null, 0);
    if (this.g.views) this.g.views.overlays.ringTarget = null;
    this.g.store.setState({ cursorLabel: null, lineDraft: [] });
  }

  onTab(tab: Tab | null) {
    const hints: Partial<Record<Tab, Parameters<Game["t"]>[0]>> = { bulldoze: "hint.bulldoze", terrain: "hint.terrain", build: "hint.build", move: "hint.move", land: "hint.land" };
    this.g.store.setState({ hint: tab ? (hints[tab] ?? null) : null });
  }

  /** Cancel what's in progress; true if there was something to cancel. */
  cancel() {
    const st = this.st;
    if (this.pts.length || this.dragging || this.movingService || st.lineDraft.length) {
      this.reset();
      return true;
    }
    if (st.vehicle) {
      this.g.clearVehicle();
      return true;
    }
    if (st.inspect || this.selectedService >= 0) {
      this.selectedService = -1;
      if (this.g.views) this.g.views.overlays.ringTarget = null;
      this.g.store.setState({ inspect: null });
      return true;
    }
    if (st.tab) {
      this.g.selectTab(null);
      return true;
    }
    if (st.statsOpen || st.noticesOpen) {
      this.g.store.setState({ statsOpen: false, noticesOpen: false });
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------- keyboard

  private onKey(e: KeyboardEvent, down: boolean) {
    if (this.g.mode !== "game" || this.st.screen !== "game") return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    this.shift = e.shiftKey;
    const rig = this.g.rig;
    if (!down) {
      rig?.keys.delete(e.code);
      return;
    }
    if (this.st.overlay) return;
    if (e.code === "Escape") {
      // Esc steps out of a tool first; the platform only pauses when there's nothing to cancel.
      if (this.cancel()) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) this.g.redo();
      else this.g.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") {
      e.preventDefault();
      this.g.redo();
      return;
    }
    if (/^Digit[1-8]$/.test(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.g.tabByKey(Number(e.code.slice(5)));
      e.preventDefault();
      return;
    }
    if (this.st.tab === "move" && this.selectedService >= 0) {
      if (e.code === "KeyR") return this.rotateService();
      if (e.code === "Delete" || e.code === "Backspace") return this.deleteService();
    }
    if (e.code === "Enter" && this.st.tab === "transit" && this.st.transitMode === "line") return this.finishLine();
    if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Equal", "Minus", "NumpadAdd", "NumpadSubtract"].includes(e.code)) {
      if (e.code === "KeyR" && this.st.tab === "move") return;
      rig?.keys.add(e.code);
      if (e.code.startsWith("Arrow")) e.preventDefault();
    }
  }

  // --------------------------------------------------------------- pointer

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const at = this.g.groundAt(e.clientX, e.clientY) ?? undefined;
    this.g.rig?.zoom(Math.exp(e.deltaY * 0.0011), at);
  }

  private toolActive() {
    const st = this.st;
    return this.g.mode === "game" && st.screen === "game" && !st.overlay && st.tab !== null;
  }

  private onDown(e: PointerEvent) {
    this.g.audio.unlock();
    if (this.g.mode !== "game" || this.st.screen !== "game" || this.st.overlay) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (e.pointerType === "touch") {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        // Two fingers: camera only. Drop anything the first finger started.
        if (this.dragging || this.brushOn) this.reset();
        this.panning = null;
        this.pinch = this.pinchState();
        return;
      }
    }
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.moved = false;
    if (e.button === 2 || e.button === 1) {
      this.orbiting = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!this.toolActive()) {
      this.panning = { x: e.clientX, y: e.clientY };
      return;
    }
    const p = this.g.groundAt(e.clientX, e.clientY);
    if (!p) return;
    this.toolDown(p, e);
  }

  private pinchState() {
    const [a, b] = [...this.touches.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  private onMove(e: PointerEvent) {
    if (this.g.mode !== "game") return;
    const rig = this.g.rig;
    if (e.pointerType === "touch" && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2 && this.pinch && rig) {
        const now = this.pinchState();
        rig.zoom(this.pinch.d / Math.max(10, now.d));
        rig.rotate(-(now.a - this.pinch.a));
        const h = this.g.engine?.renderer.domElement.clientHeight ?? 600;
        const dy = now.my - this.pinch.my;
        // Both fingers sliding up/down together tilts; sideways pans.
        if (Math.abs(dy) > Math.abs(now.mx - this.pinch.mx) * 1.5 && Math.abs(now.d - this.pinch.d) < 12) rig.tilt(dy * 0.005);
        else rig.panScreen(now.mx - this.pinch.mx, now.my - this.pinch.my, h);
        this.pinch = now;
        return;
      }
    }
    if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) this.moved = true;
    if (this.orbiting && rig) {
      rig.rotate((e.clientX - this.orbiting.x) * 0.006);
      rig.tilt((e.clientY - this.orbiting.y) * 0.005);
      this.orbiting = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.panning && rig) {
      const h = this.g.engine?.renderer.domElement.clientHeight ?? 600;
      rig.panScreen(e.clientX - this.panning.x, e.clientY - this.panning.y, h);
      this.panning = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.st.screen !== "game" || this.st.overlay) return;
    // Only hover when the pointer is over the canvas.
    const canvas = this.g.engine?.renderer.domElement;
    if (!this.dragging && canvas && e.target !== canvas) return;
    const p = this.g.groundAt(e.clientX, e.clientY);
    this.hover = p;
    if (this.toolActive() && p) this.toolMove(p, e);
  }

  private onUp(e: PointerEvent) {
    if (this.g.mode !== "game") return;
    if (e.pointerType === "touch") {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
      if (this.touches.size === 1) {
        const [only] = [...this.touches.values()];
        if (!this.toolActive()) this.panning = { ...only };
        return;
      }
    }
    const wasTap = this.downAt && !this.moved && performance.now() - this.downAt.t < 450;
    if (this.orbiting) {
      this.orbiting = null;
      this.downAt = null;
      return;
    }
    if (this.panning) {
      this.panning = null;
      if (wasTap && !this.toolActive()) this.tap(e.clientX, e.clientY);
      this.downAt = null;
      return;
    }
    this.downAt = null;
    if (!this.toolActive()) return;
    const p = this.g.groundAt(e.clientX, e.clientY) ?? this.hover;
    if (p) this.toolUp(p, e, !!wasTap);
  }

  /** A tap with no tool: pick a vehicle, a building or a lot. */
  private tap(x: number, y: number) {
    const v = this.g.views;
    const city = this.city;
    if (!v || !city) return;
    const ray = this.g.raycaster(x, y);
    const car = v.agents.pick(ray);
    if (car >= 0) {
      void this.g.selectVehicle(car);
      this.g.audio.tick();
      return;
    }
    this.g.clearVehicle();
    const p = this.g.groundAt(x, y);
    if (!p) return;
    this.inspectAt(p, x, y);
  }

  private inspectAt(p: V3, sx: number, sy: number) {
    const city = this.city!;
    const owner = city.lots.ownerAt(p.x, p.z);
    if (owner > 0) {
      const lot = city.lots.lots.get(owner)!;
      const b = this.g.buildings.get(owner);
      this.g.store.setState({ inspect: { kind: "lot", id: owner, zone: lot.zone, tier: b?.tier ?? 0, residents: b?.residents ?? 0, jobs: b?.capJobs ?? 0, lv: this.g.landValue(owner), x: sx, y: sy } });
      if (this.g.views) {
        this.g.views.overlays.ringTarget = new THREE.Vector3(lot.cx, city.terrain.surfaceAt(lot.cx, lot.cz), lot.cz);
        this.g.views.overlays.ringSize = Math.max(lot.w, lot.d) * 0.7;
      }
      void this.g.refreshLandValues().then(() => {
        const cur = this.st.inspect;
        if (cur?.id === owner) this.g.store.setState({ inspect: { ...cur, lv: this.g.landValue(owner) } });
      });
    } else if (owner < 0) {
      const s = city.lots.services.get(-owner)!;
      this.g.store.setState({ inspect: { kind: "service", id: s.id, service: s.kind, x: sx, y: sy } });
      if (this.g.views) {
        this.g.views.overlays.ringTarget = new THREE.Vector3(s.cx, city.terrain.surfaceAt(s.cx, s.cz), s.cz);
        this.g.views.overlays.ringSize = Math.max(s.w, s.d) * 0.7;
      }
    } else {
      this.g.store.setState({ inspect: null });
      if (this.g.views) this.g.views.overlays.ringTarget = null;
    }
  }

  // ------------------------------------------------------------ dispatch

  private toolDown(p: V3, e: PointerEvent) {
    const st = this.st;
    switch (st.tab) {
      case "roads":
        return this.roadDown(p, e);
      case "zoning":
        this.dragging = true;
        this.dragStroke = [{ x: p.x, z: p.z }];
        this.pts = [p.clone()];
        return;
      case "bulldoze":
        this.dragging = true;
        this.pts = [p.clone()];
        return;
      case "terrain":
        this.brushOn = true;
        this.city?.record();
        this.brushAcc = 0;
        return;
      case "move":
        return this.moveDown(p);
      case "build":
      case "transit":
      case "land":
        return;
    }
  }

  private toolMove(p: V3, e: PointerEvent) {
    const st = this.st;
    switch (st.tab) {
      case "roads":
        return this.roadMove(p, e);
      case "zoning":
        if (this.dragging) this.dragStroke.push({ x: p.x, z: p.z });
        return this.zonePreview(p);
      case "bulldoze":
        return this.bulldozePreview(p);
      case "terrain":
        this.g.views?.overlays.setBrush(p, st.brush);
        return;
      case "build":
        return this.buildPreview(p);
      case "transit":
        return this.transitPreview(p);
      case "move":
        return this.moveMove(p);
      case "land":
        return;
    }
  }

  private toolUp(p: V3, e: PointerEvent, tap: boolean) {
    const st = this.st;
    switch (st.tab) {
      case "roads":
        return this.roadUp(p, e, tap);
      case "zoning":
        return this.zoneUp(p, tap);
      case "bulldoze":
        return this.bulldozeUp(p, tap);
      case "terrain":
        this.brushOn = false;
        if (this.city) {
          this.city.reseatRoadsNear(p.x, p.z, st.brush + 40);
          // Lots that slid under water go.
          for (const l of [...this.city.lots.lots.values()]) if (this.city.terrain.isWater(l.cx, l.cz)) this.city.removeLot(l.id);
          this.g.worldChanged();
        }
        return;
      case "build":
        if (tap) this.buildAt(p);
        return;
      case "transit":
        if (tap) this.transitAt(p);
        return;
      case "move":
        return this.moveUp(p);
      case "land":
        if (tap && e) this.inspectAt(p, e.clientX, e.clientY);
        return;
    }
  }

  /** Per-frame work: terrain brushing while held. */
  frame(now: number) {
    const dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    if (!this.brushOn || !this.hover || !this.city) return;
    const st = this.st;
    const t = this.city.terrain;
    const p = this.hover;
    const r = st.brush;
    const rate = 14 * dt;
    switch (st.terrainMode) {
      case "raise":
        t.brush(p.x, p.z, r, (h, w) => Math.min(140, h + rate * w));
        break;
      case "lower":
        t.brush(p.x, p.z, r, (h, w) => Math.max(-20, h - rate * w));
        break;
      case "smooth": {
        const avg = t.heightAt(p.x, p.z);
        t.brush(p.x, p.z, r, (h, w) => h + (avg - h) * Math.min(1, w * dt * 3));
        break;
      }
      case "water":
        t.brush(p.x, p.z, r, (h, w) => Math.max(WATER_LEVEL - 3.5, h - rate * 1.5 * w) * (w > 0.2 ? 1 : 1));
        break;
      case "trees":
      case "clear":
        this.brushAcc += dt;
        if (this.brushAcc > 0.12) {
          this.brushAcc = 0;
          this.city.treeBrush(p.x, p.z, r, st.terrainMode === "trees", Math.floor(now));
        }
        break;
    }
  }

  // ----------------------------------------------------------------- roads

  /** Snap a point to a nearby node or road (screen-scaled radius). */
  private snap(p: V3): { p: P; edge?: REdge; node?: number; tangent?: P } {
    const city = this.city!;
    const r = Math.max(6, (this.g.rig?.dist ?? 300) * 0.02);
    const n = city.roads.nearestNode(p, r);
    if (n) {
      const e = city.roads.nodeEdges(n.id)[0];
      let tangent: P | undefined;
      if (e) {
        const cum = cumulative(e.pts);
        const s = sampleAt(e.pts, cum, e.a === n.id ? 0 : cum[cum.length - 1]);
        tangent = { x: s.tx, z: s.tz };
      }
      return { p: { x: n.x, z: n.z }, node: n.id, tangent };
    }
    const near = city.roads.nearestEdge(p, r);
    if (near) {
      const cum = cumulative(near.edge.pts);
      const s = sampleAt(near.edge.pts, cum, near.s);
      return { p: { x: near.x, z: near.z }, edge: near.edge, tangent: { x: s.tx, z: s.tz } };
    }
    return { p: { x: p.x, z: p.z } };
  }

  /** Straight end point: 15° steps relative to the road we started from (or the world). */
  private snapEnd(a: { p: P; tangent?: P }, b: P) {
    const dx = b.x - a.p.x;
    const dz = b.z - a.p.z;
    const L = Math.hypot(dx, dz);
    if (this.shift || L < 1) return b;
    const base = a.tangent ? Math.atan2(a.tangent.z, a.tangent.x) : 0;
    const ang = base + snapAngle(Math.atan2(dz, dx) - base);
    const end = { x: a.p.x + Math.cos(ang) * L, z: a.p.z + Math.sin(ang) * L };
    const s = this.snap(new THREE.Vector3(b.x, 0, b.z));
    // A real node or road nearby wins over the angle.
    return s.node || s.edge ? s.p : end;
  }

  private roadDown(p: V3, e: PointerEvent) {
    const mode = this.st.drawMode;
    if (mode === "freeform" || this.shift) {
      this.dragging = true;
      const s = this.snap(p);
      this.dragStroke = [s.p];
      return;
    }
    if (mode === "upgrade") {
      this.dragging = true;
      this.city?.record();
      this.upgradeSeen.clear();
      this.upgradeAt(p);
      return;
    }
    void e;
  }

  private roadMove(p: V3, e: PointerEvent) {
    const st = this.st;
    const mode = st.drawMode;
    this.shift = e.shiftKey;
    if (this.dragging && (mode === "freeform" || this.dragStroke.length)) {
      const last = this.dragStroke[this.dragStroke.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 6) this.dragStroke.push({ x: p.x, z: p.z });
      this.showRoadGhost(this.freeformPts());
      return;
    }
    if (mode === "upgrade" && this.dragging) return this.upgradeAt(p);
    if (mode === "lanes" || mode === "oneway" || mode === "upgrade") return this.hoverEdge(p);
    if (mode === "roundabout") {
      if (this.pts.length === 1) this.showRoadGhost(this.roundaboutPts(this.pts[0], p).flat(), true);
      return;
    }
    if (!this.pts.length) {
      this.showSnapDot(p);
      return;
    }
    const pts = this.pathFor(p);
    if (pts) this.showRoadGhost(pts);
  }

  private roadUp(p: V3, e: PointerEvent, tap: boolean) {
    const st = this.st;
    const mode = st.drawMode;
    if (this.dragging && (mode === "freeform" || this.dragStroke.length > 1)) {
      this.dragging = false;
      const pts = this.freeformPts();
      this.dragStroke = [];
      if (pts.length >= 4 && polyLength(pts) > 8) this.commitRoad(pts);
      else this.g.views?.overlays.clearGhosts();
      return;
    }
    this.dragging = false;
    if (mode === "upgrade") {
      this.upgradeSeen.clear();
      return;
    }
    if (!tap) return;
    if (mode === "lanes" || mode === "oneway") {
      const near = this.city?.roads.nearestEdge(p, 12);
      if (near) {
        this.city!.editEdge(near.edge.id, mode === "lanes" ? { lanes: true } : { oneway: true });
        this.g.audio.click();
        this.g.worldChanged();
      }
      return;
    }
    if (mode === "roundabout") {
      if (!this.pts.length) {
        this.pts = [new THREE.Vector3(p.x, p.y, p.z)];
        return;
      }
      const arcs = this.roundaboutPts(this.pts[0], p);
      this.pts = [];
      this.g.views?.overlays.clearGhosts();
      if (!arcs.length) return;
      this.city!.record();
      const type = st.roadType;
      const lanes: [number, number] = [Math.max(1, Math.ceil(ROAD_TYPES[type].lanes / 2)), 0];
      const name = this.city!.roads.newName(type).replace(/ \w+$/, " Circle");
      for (const arc of arcs) this.city!.addRoad(arc, type, { record: false, name, lanes });
      this.afterRoad();
      return;
    }
    // Click-to-click modes.
    const need = mode === "curve" ? 3 : 2;
    const s = this.snap(p);
    const here = new THREE.Vector3(s.p.x, p.y, s.p.z);
    if (this.pts.length === 0) {
      this.pts = [here];
      this.startSnap = s;
      return;
    }
    if (mode === "curve" && this.pts.length === 1) {
      this.pts.push(here);
      return;
    }
    const pts = this.pathFor(p);
    if (!pts) return;
    if (this.commitRoad(pts)) {
      // Keep drawing from where this one ended.
      const end = new THREE.Vector3(pts[pts.length - 2], p.y, pts[pts.length - 1]);
      this.pts = [end];
      this.startSnap = this.snap(end);
    }
    void need;
    void e;
  }

  private startSnap: ReturnType<Tools["snap"]> | null = null;

  private freeformPts() {
    const raw = this.dragStroke.flatMap((q) => [q.x, q.z]);
    if (this.hover) raw.push(this.hover.x, this.hover.z);
    return raw.length >= 4 ? chaikin(raw, 2) : raw;
  }

  /** The candidate road from the clicked points to the cursor. */
  private pathFor(p: V3): number[] | null {
    const mode = this.st.drawMode;
    const a = this.startSnap ?? this.snap(this.pts[0]);
    if (mode === "straight") {
      const b = this.snapEnd(a, p);
      return [a.p.x, a.p.z, b.x, b.z];
    }
    if (mode === "curve") {
      if (this.pts.length < 2) {
        const b = this.snapEnd(a, p);
        return [a.p.x, a.p.z, b.x, b.z];
      }
      const c = this.pts[1];
      const b = this.snap(p).p;
      return quadratic(a.p, { x: c.x, z: c.z }, b);
    }
    if (mode === "scurve") {
      const b = this.snap(p).p;
      const L = Math.hypot(b.x - a.p.x, b.z - a.p.z);
      let h = a.tangent;
      if (!h) {
        const ang = Math.round(Math.atan2(b.z - a.p.z, b.x - a.p.x) / (Math.PI / 2)) * (Math.PI / 2);
        h = { x: Math.cos(ang), z: Math.sin(ang) };
      }
      // Face the tangent toward the end.
      if (h.x * (b.x - a.p.x) + h.z * (b.z - a.p.z) < 0) h = { x: -h.x, z: -h.z };
      return cubic(a.p, { x: a.p.x + h.x * L * 0.5, z: a.p.z + h.z * L * 0.5 }, { x: b.x - h.x * L * 0.5, z: b.z - h.z * L * 0.5 }, b);
    }
    return null;
  }

  private roundaboutPts(c: V3, p: V3): number[][] {
    const r = Math.min(70, Math.max(16, Math.hypot(p.x - c.x, p.z - c.z)));
    const arcs: number[][] = [];
    const n = 4;
    for (let k = 0; k < n; k++) {
      const arc: number[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = ((k + i / 8) / n) * Math.PI * 2;
        // Counter-clockwise seen from above (traffic keeps the island on its left).
        arc.push(c.x + Math.cos(t) * r, c.z - Math.sin(t) * r);
      }
      arcs.push(arc);
    }
    return arcs;
  }

  /** Is a new road valid? Not running along an existing one. */
  private roadOk(pts: number[]) {
    const city = this.city!;
    const L = polyLength(pts);
    if (L < 8) return false;
    const cum = cumulative(pts);
    const hw = halfWidth({ type: this.st.roadType, ...lanesOf(this.st.roadType) });
    let along = 0;
    let samples = 0;
    for (let s = 10; s < L - 10; s += 4) {
      samples++;
      const q = sampleAt(pts, cum, s);
      const near = city.roads.nearestEdge(q, hw + 4);
      if (!near) continue;
      const ec = cumulative(near.edge.pts);
      const t = sampleAt(near.edge.pts, ec, near.s);
      if (Math.abs(t.tx * q.tx + t.tz * q.tz) > 0.85) along++;
    }
    return samples === 0 || along / samples < 0.3;
  }

  private commitRoad(pts: number[]) {
    const city = this.city;
    if (!city) return false;
    if (!this.roadOk(pts)) {
      this.g.audio.error();
      return false;
    }
    city.addRoad(pts, this.st.roadType);
    this.g.views?.overlays.clearGhosts();
    this.g.store.setState({ cursorLabel: null });
    this.afterRoad();
    return true;
  }

  private afterRoad() {
    this.g.audio.click();
    this.g.worldChanged();
    void this.g.achieve("first-road");
  }

  private showRoadGhost(pts: number[], roundabout = false) {
    const v = this.g.views;
    const city = this.city;
    if (!v || !city || pts.length < 4) return;
    v.overlays.clearGhosts();
    const ok = roundabout || this.roadOk(pts);
    const ys: number[] = [];
    for (let i = 0; i < pts.length / 2; i++) ys.push(city.terrain.surfaceAt(pts[i * 2], pts[i * 2 + 1]));
    const width = carriageway({ type: this.st.roadType, ...lanesOf(this.st.roadType) }) + 2 * ROAD_TYPES[this.st.roadType].sidewalk;
    v.overlays.ghosts.add(RoadView.ghost(pts, ys, width, ok ? theme.accent : theme.danger));
    const end = new THREE.Vector3(pts[pts.length - 2], ys[ys.length - 1], pts[pts.length - 1]);
    const scr = this.g.toScreen(end);
    const len = Math.round(polyLength(pts));
    if (scr) this.g.store.setState({ cursorLabel: { x: scr.x, y: scr.y, text: this.g.t("metres", { n: len }), bad: !ok } });
  }

  private showSnapDot(p: V3) {
    const v = this.g.views;
    if (!v || !this.city) return;
    v.overlays.clearGhosts();
    const s = this.snap(p);
    const m = new THREE.Mesh(new THREE.CircleGeometry(s.node || s.edge ? 3 : 2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: s.node || s.edge ? theme.accent : "#ffffff", transparent: true, opacity: 0.85, depthTest: false }));
    m.position.set(s.p.x, this.city.terrain.surfaceAt(s.p.x, s.p.z) + 0.6, s.p.z);
    m.renderOrder = 9;
    v.overlays.ghosts.add(m);
    this.g.store.setState({ cursorLabel: null });
  }

  private hoverEdge(p: V3, color: string = theme.accent) {
    const v = this.g.views;
    const city = this.city;
    if (!v || !city) return null;
    v.overlays.clearGhosts();
    const near = city.roads.nearestEdge(p, 14);
    if (!near) return null;
    const e = near.edge;
    const ys = Array.from(city.profiles.get(e.id) ?? []);
    v.overlays.ghosts.add(RoadView.ghost(e.pts, ys.length ? ys : e.pts.filter((_, i) => i % 2 === 0).map(() => p.y), halfWidth(e) * 2 + 1, color));
    const scr = this.g.toScreen(new THREE.Vector3(near.x, p.y, near.z));
    if (scr) this.g.store.setState({ cursorLabel: { x: scr.x, y: scr.y, text: `${e.name} · ${this.g.t(ROAD_TYPES[e.type].label)} · ${e.lanesF}+${e.lanesB}` } });
    return near;
  }

  private upgradeAt(p: V3) {
    const near = this.hoverEdge(p);
    if (!near || this.upgradeSeen.has(near.edge.id)) return;
    this.upgradeSeen.add(near.edge.id);
    if (near.edge.type === this.st.roadType) return;
    this.city!.editEdge(near.edge.id, { type: this.st.roadType }, false);
    this.g.audio.click();
    this.g.worldChanged();
  }

  // ---------------------------------------------------------------- zoning

  /** Frontage ranges a LINE drag covers, per edge side. */
  private lineRanges(stroke: P[]) {
    const city = this.city!;
    const st = this.st;
    const depth = st.depth * LOT_UNIT;
    const ranges = new Map<string, { edge: number; side: number; s0: number; s1: number }>();
    const samples: P[] = [];
    for (let i = 0; i < stroke.length; i++) {
      const a = stroke[i];
      const b = stroke[i + 1] ?? a;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
      for (let k = 0; k < n; k++) samples.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    for (const q of samples) {
      const near = city.roads.nearestEdge(q, 60);
      if (!near || near.d > halfWidth(near.edge) + depth + 4) continue;
      const key = `${near.edge.id}:${near.side}`;
      const r = ranges.get(key);
      if (r) {
        r.s0 = Math.min(r.s0, near.s);
        r.s1 = Math.max(r.s1, near.s);
      } else ranges.set(key, { edge: near.edge.id, side: near.side, s0: near.s, s1: near.s });
    }
    return [...ranges.values()].map((r) => ({ ...r, s0: r.s0 - LOT_UNIT / 2, s1: r.s1 + LOT_UNIT / 2 }));
  }

  private zonePreview(p: V3) {
    const v = this.g.views;
    const city = this.city;
    if (!v || !city) return;
    const st = this.st;
    v.overlays.clearGhosts();
    const color = st.erase ? theme.danger : theme.zone[st.zone];
    const depth = st.depth * LOT_UNIT;
    if (st.zoneMode === "area" && this.dragging && this.pts.length) {
      const a = this.pts[0];
      const w = Math.abs(p.x - a.x);
      const d = Math.abs(p.z - a.z);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1, w), Math.max(1, d)).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthTest: false }));
      m.position.set((a.x + p.x) / 2, Math.max(a.y, p.y) + 1, (a.z + p.z) / 2);
      m.renderOrder = 8;
      v.overlays.ghosts.add(m);
      for (const r of city.lots.rangesInRect(a, p, depth)) this.frontageGhost(r.edge, r.side, r.s0, r.s1, depth, color);
      return;
    }
    if (st.zoneMode === "line" && this.dragging) {
      for (const r of this.lineRanges(this.dragStroke)) {
        this.frontageGhost(r.edge, r.side, r.s0, r.s1, depth, color);
        if (st.mirror) this.frontageGhost(r.edge, -r.side, r.s0, r.s1, depth, color);
      }
      return;
    }
    // Hover: one lot's footprint (SINGLE) or a marker on the frontage.
    const near = city.roads.nearestEdge(p, 60);
    if (!near || near.d > halfWidth(near.edge) + depth + 4) return;
    const w = st.width * LOT_UNIT;
    this.frontageGhost(near.edge.id, near.side, near.s - w / 2, near.s + w / 2, depth, color);
    if (st.mirror && st.zoneMode !== "single") this.frontageGhost(near.edge.id, -near.side, near.s - w / 2, near.s + w / 2, depth, color);
  }

  private frontageGhost(edgeId: number, side: number, s0: number, s1: number, depth: number, color: string) {
    const city = this.city!;
    const e = city.roads.edges.get(edgeId);
    if (!e) return;
    const cum = cumulative(e.pts);
    const L = cum[cum.length - 1];
    s0 = Math.max(0, s0);
    s1 = Math.min(L, s1);
    if (s1 - s0 < 1) return;
    const off0 = halfWidth(e) + 0.6;
    const pos: number[] = [];
    const idx: number[] = [];
    let i = 0;
    for (let s = s0; s <= s1 + 0.01; s += 2, i++) {
      const q = sampleAt(e.pts, cum, Math.min(s, s1));
      const [nx, nz] = sideNormal(q.tx, q.tz, side);
      const y = city.terrain.surfaceAt(q.x, q.z) + 0.6;
      pos.push(q.x + nx * off0, y, q.z + nz * off0, q.x + nx * (off0 + depth), y, q.z + nz * (off0 + depth));
      if (s > s0) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthTest: false }));
    m.renderOrder = 8;
    this.g.views!.overlays.ghosts.add(m);
  }

  private zoneUp(p: V3, tap: boolean) {
    const city = this.city;
    if (!city) return;
    const st = this.st;
    this.dragging = false;
    const opts = { zone: st.zone as Zone, width: st.width, depth: st.depth, mixed: st.mixed };
    let touched = 0;
    const apply = (edge: number, side: number, s0: number, s1: number, mirror: boolean) => {
      if (st.erase) {
        touched += city.erase(edge, side, s0, s1, mirror).length;
      } else {
        const r = city.paint(edge, side, s0, s1, opts, mirror);
        touched += r.created.length + r.rezoned.length;
        if (r.rezoned.length) this.g.sim?.demolish(r.rezoned);
      }
    };
    city.record();
    if (st.zoneMode === "single" || (tap && st.zoneMode !== "area")) {
      const near = city.roads.nearestEdge(p, 60);
      if (near && near.d <= halfWidth(near.edge) + st.depth * LOT_UNIT + 4) {
        const w = st.width * LOT_UNIT;
        apply(near.edge.id, near.side, near.s - w / 2, near.s + w / 2, st.zoneMode !== "single" && st.mirror);
      }
    } else if (st.zoneMode === "area" && this.pts.length) {
      for (const r of city.lots.rangesInRect(this.pts[0], p, st.depth * LOT_UNIT)) apply(r.edge, r.side, r.s0, r.s1, false);
    } else {
      this.dragStroke.push({ x: p.x, z: p.z });
      for (const r of this.lineRanges(this.dragStroke)) apply(r.edge, r.side, r.s0, r.s1, st.mirror);
    }
    this.pts = [];
    this.dragStroke = [];
    this.g.views?.overlays.clearGhosts();
    if (touched) {
      this.g.audio.swish();
      this.g.worldChanged();
      if (!st.erase) void this.g.achieve("first-zone");
    } else if (city.canUndo()) city.undo();
  }

  // -------------------------------------------------------------- bulldoze

  private bulldozePreview(p: V3) {
    const v = this.g.views;
    const city = this.city;
    if (!v || !city) return;
    v.overlays.clearGhosts();
    if (this.dragging && this.pts.length) {
      const a = this.pts[0];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1, Math.abs(p.x - a.x)), Math.max(1, Math.abs(p.z - a.z))).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: theme.danger, transparent: true, opacity: 0.28, depthTest: false }));
      m.position.set((a.x + p.x) / 2, Math.max(a.y, p.y) + 1.5, (a.z + p.z) / 2);
      m.renderOrder = 8;
      v.overlays.ghosts.add(m);
      return;
    }
    const target = this.bulldozeTarget(p);
    if (target?.kind === "edge") this.hoverEdge(p, theme.danger);
    else if (target) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(target.w + 1, 1.5, target.d + 1), new THREE.MeshBasicMaterial({ color: theme.danger, transparent: true, opacity: 0.35, depthTest: false }));
      m.position.set(target.x, city.terrain.surfaceAt(target.x, target.z) + 1, target.z);
      m.rotation.y = -target.ang;
      m.renderOrder = 8;
      v.overlays.ghosts.add(m);
    }
  }

  private bulldozeTarget(p: V3) {
    const city = this.city!;
    const mode = this.st.bulldozeMode;
    const owner = city.lots.ownerAt(p.x, p.z);
    if (owner > 0 && mode !== "roads") {
      const l = city.lots.lots.get(owner)!;
      if (mode === "buildings" && !this.g.buildings.has(owner)) return null;
      return { kind: "lot" as const, id: owner, x: l.cx, z: l.cz, w: l.w, d: l.d, ang: l.ang };
    }
    if (owner < 0 && mode === "all") {
      const s = city.lots.services.get(-owner)!;
      return { kind: "service" as const, id: s.id, x: s.cx, z: s.cz, w: s.w, d: s.d, ang: s.ang };
    }
    if (mode === "all" || mode === "roads") {
      const near = city.roads.nearestEdge(p, 12);
      if (near) return { kind: "edge" as const, id: near.edge.id, x: near.x, z: near.z, w: 0, d: 0, ang: 0 };
    }
    return null;
  }

  private bulldozeUp(p: V3, tap: boolean) {
    const city = this.city;
    if (!city) return;
    const mode = this.st.bulldozeMode;
    this.dragging = false;
    let did = 0;
    if (tap || !this.pts.length || Math.hypot(p.x - this.pts[0].x, p.z - this.pts[0].z) < 4) {
      const t = this.bulldozeTarget(p);
      if (t) {
        city.record();
        did++;
        if (t.kind === "edge") city.removeEdge(t.id, false);
        else if (t.kind === "service") {
          city.lots.removeService(t.id);
          city.changes.services = true;
          city.version++;
        } else if (mode === "buildings") this.g.sim?.demolish([t.id]);
        else city.removeLot(t.id);
      }
    } else {
      const a = this.pts[0];
      const x0 = Math.min(a.x, p.x);
      const x1 = Math.max(a.x, p.x);
      const z0 = Math.min(a.z, p.z);
      const z1 = Math.max(a.z, p.z);
      const inside = (x: number, z: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
      city.record();
      if (mode === "all" || mode === "zones" || mode === "buildings") {
        const hit = [...city.lots.lots.values()].filter((l) => inside(l.cx, l.cz)).map((l) => l.id);
        if (mode === "buildings") this.g.sim?.demolish(hit.filter((id) => this.g.buildings.has(id)));
        else for (const id of hit) city.removeLot(id);
        did += hit.length;
      }
      if (mode === "all") {
        for (const s of [...city.lots.services.values()])
          if (inside(s.cx, s.cz)) {
            city.lots.removeService(s.id);
            city.changes.services = true;
            did++;
          }
      }
      if (mode === "all" || mode === "roads") {
        for (const e of [...city.roads.edges.values()]) {
          if (!city.roads.edges.has(e.id)) continue;
          let all = true;
          for (let i = 0; i < e.pts.length; i += 2) if (!inside(e.pts[i], e.pts[i + 1])) all = false;
          const mid = sampleAt(e.pts, cumulative(e.pts), polyLength(e.pts) / 2);
          if (all || inside(mid.x, mid.z)) {
            city.removeEdge(e.id, false);
            did++;
          }
        }
      }
      city.version++;
    }
    this.pts = [];
    this.g.views?.overlays.clearGhosts();
    if (did) {
      this.g.audio.thud();
      this.g.worldChanged();
    } else if (city.canUndo()) city.undo();
  }

  // ----------------------------------------------------------------- build

  private buildSpot(p: V3) {
    const city = this.city!;
    const spec = SERVICE_SPEC[this.st.service];
    const near = city.roads.nearestEdge(p, 80);
    if (!near || near.d > halfWidth(near.edge) + spec.d + 6) return null;
    const f = city.lots.frame(near.edge, near.side, near.s, spec.w, spec.d);
    const ok = !!city.lots.fits(f.cx, f.cz, spec.w, spec.d, f.ang);
    return { ...f, ok, edge: near.edge.id, side: near.side, s: near.s, w: spec.w, d: spec.d };
  }

  private buildPreview(p: V3) {
    const v = this.g.views;
    if (!v || !this.city) return;
    v.overlays.clearGhosts();
    const spot = this.buildSpot(p);
    if (!spot) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(spot.w, 6, spot.d), new THREE.MeshBasicMaterial({ color: spot.ok ? theme.accent : theme.danger, transparent: true, opacity: 0.35, depthTest: false }));
    m.position.set(spot.cx, this.city.terrain.surfaceAt(spot.cx, spot.cz) + 3, spot.cz);
    m.rotation.y = -spot.ang;
    m.renderOrder = 8;
    v.overlays.ghosts.add(m);
  }

  private buildAt(p: V3) {
    const spot = this.buildSpot(p);
    if (!spot?.ok || !this.city) {
      this.g.audio.error();
      return;
    }
    const svc = this.city.addService(this.st.service, spot.edge, spot.side, spot.s);
    if (svc) {
      this.g.audio.thud();
      this.g.worldChanged();
    }
  }

  // --------------------------------------------------------------- transit

  private transitPreview(p: V3) {
    const v = this.g.views;
    const city = this.city;
    if (!v || !city) return;
    v.overlays.clearGhosts();
    const st = this.st;
    if (st.transitMode === "stop") {
      const near = city.roads.nearestEdge(p, 20);
      if (!near || ROAD_TYPES[near.edge.type].sidewalk === 0) return;
      const at = city.sidePoint(near.edge.id, near.s, near.side, -1);
      if (!at) return;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3, 16), new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.6, depthTest: false }));
      m.position.set(at.x, city.terrain.surfaceAt(at.x, at.z) + 1.5, at.z);
      m.renderOrder = 8;
      v.overlays.ghosts.add(m);
    } else if (st.transitMode === "line" && st.lineDraft.length) {
      const pts: THREE.Vector3[] = st.lineDraft.map((id) => city.stops.find((s) => s.id === id)).filter(Boolean).map((s) => new THREE.Vector3(s!.x, city.terrain.surfaceAt(s!.x, s!.z) + 3, s!.z));
      pts.push(new THREE.Vector3(p.x, p.y + 3, p.z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: theme.accent, depthTest: false }));
      line.renderOrder = 9;
      v.overlays.ghosts.add(line);
    }
  }

  private transitAt(p: V3) {
    const city = this.city;
    if (!city) return;
    const st = this.st;
    if (st.transitMode === "stop") {
      const near = city.roads.nearestEdge(p, 20);
      if (!near) return;
      const stop = city.addStop(near.edge.id, near.s, near.side);
      if (stop) {
        this.g.audio.click();
        this.g.worldChanged();
      } else this.g.audio.error();
      return;
    }
    if (st.transitMode === "line") {
      const stop = city.stops.reduce<{ id: number; d: number } | null>((best, s) => {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        return d < 25 && (!best || d < best.d) ? { id: s.id, d } : best;
      }, null);
      if (!stop) return;
      if (st.lineDraft.length >= 2 && stop.id === st.lineDraft[0]) return this.finishLine();
      if (st.lineDraft.includes(stop.id)) return;
      this.g.store.setState({ lineDraft: [...st.lineDraft, stop.id] });
      this.g.audio.tick();
    }
  }

  private finishLine() {
    const city = this.city;
    const draft = this.st.lineDraft;
    if (!city || draft.length < 2) return;
    city.addLine(draft);
    this.g.store.setState({ lineDraft: [] });
    this.g.views?.overlays.clearGhosts();
    this.g.audio.click();
    this.g.worldChanged();
  }

  // ------------------------------------------------------------------ move

  private moveDown(p: V3) {
    const city = this.city!;
    const owner = city.lots.ownerAt(p.x, p.z);
    const mode = this.st.moveMode;
    if (mode === "copy" && this.selectedService >= 0 && owner === 0) {
      const svc = city.lots.copyService(this.selectedService, p.x, p.z);
      if (svc) {
        city.changes.services = true;
        this.g.audio.thud();
        this.g.worldChanged();
      } else this.g.audio.error();
      return;
    }
    if (owner < 0) {
      this.selectedService = -owner;
      const s = city.lots.services.get(-owner)!;
      if (this.g.views) {
        this.g.views.overlays.ringTarget = new THREE.Vector3(s.cx, city.terrain.surfaceAt(s.cx, s.cz), s.cz);
        this.g.views.overlays.ringSize = Math.max(s.w, s.d) * 0.7;
      }
      if (mode === "rotate") return this.rotateService();
      if (mode === "delete") return this.deleteService();
      if (mode === "move" || mode === "select") this.movingService = { id: s.id, dx: s.cx - p.x, dz: s.cz - p.z };
      this.g.audio.tick();
    } else if (mode !== "copy") {
      this.selectedService = -1;
      if (this.g.views) this.g.views.overlays.ringTarget = null;
    }
  }

  private moveMove(p: V3) {
    const v = this.g.views;
    const city = this.city;
    if (!v || !city || !this.movingService) return;
    v.overlays.clearGhosts();
    const s = city.lots.services.get(this.movingService.id);
    if (!s) return;
    const cx = p.x + this.movingService.dx;
    const cz = p.z + this.movingService.dz;
    const ok = !!city.lots.fits(cx, cz, s.w, s.d, s.ang, -s.id);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, 5, s.d), new THREE.MeshBasicMaterial({ color: ok ? theme.accent : theme.danger, transparent: true, opacity: 0.4, depthTest: false }));
    m.position.set(cx, city.terrain.surfaceAt(cx, cz) + 2.5, cz);
    m.rotation.y = -s.ang;
    m.renderOrder = 8;
    v.overlays.ghosts.add(m);
  }

  private moveUp(p: V3) {
    const city = this.city;
    if (!city || !this.movingService) return;
    const m = this.movingService;
    this.movingService = null;
    this.g.views?.overlays.clearGhosts();
    const s = city.lots.services.get(m.id);
    if (!s) return;
    const cx = p.x + m.dx;
    const cz = p.z + m.dz;
    if (Math.hypot(cx - s.cx, cz - s.cz) < 1) return;
    if (city.lots.moveService(m.id, cx, cz, s.ang)) {
      city.flattenRect(cx, cz, s.w, s.d);
      city.changes.services = true;
      this.g.audio.thud();
      this.g.worldChanged();
      if (this.g.views) this.g.views.overlays.ringTarget = new THREE.Vector3(cx, city.terrain.surfaceAt(cx, cz), cz);
    } else this.g.audio.error();
  }

  private rotateService() {
    const city = this.city;
    if (!city || this.selectedService < 0) return;
    const s = city.lots.services.get(this.selectedService);
    if (!s) return;
    if (city.lots.moveService(s.id, s.cx, s.cz, s.ang + Math.PI / 2)) {
      city.changes.services = true;
      this.g.audio.click();
      this.g.worldChanged();
    } else this.g.audio.error();
  }

  private deleteService() {
    const city = this.city;
    if (!city || this.selectedService < 0) return;
    city.lots.removeService(this.selectedService);
    city.changes.services = true;
    this.selectedService = -1;
    if (this.g.views) this.g.views.overlays.ringTarget = null;
    this.g.audio.thud();
    this.g.worldChanged();
  }
}

function lanesOf(type: Parameters<typeof defaultLanes>[0]) {
  const [lanesF, lanesB] = defaultLanes(type);
  return { lanesF, lanesB };
}

