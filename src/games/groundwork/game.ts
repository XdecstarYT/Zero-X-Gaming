import * as THREE from "three";
import { BONDS, GAME_SLUG, JOBS, KINDS, PREFS_KEY, SAVE_KEY, type Bond, type Job, type Kind, type RoofCover, type RoofStyle } from "./data";
import { inspect, jobById, progress, type Check, type Report } from "./jobs";
import * as m from "./model";
import { pickQuality, View, type Quality } from "./render/view";
import { showcaseHouse } from "./showcase";

/**
 * Groundwork's controller: the site, the tools (lay a piece, run a wall, pour a footing or a slab,
 * frame a stud wall, lay a floor, roof it, knock something out, measure), the camera gestures,
 * the ghost that shows what a tap would lay, the confirm step before anything big goes in, the
 * career's jobs and the inspector, autosave and the score.
 */

export type Screen = "title" | "play";
export type Tool = "look" | "lay" | "wall" | "footing" | "slab" | "frame" | "floor" | "roof" | "demolish" | "measure";
export type Panel = null | "job" | "report" | "jobs" | "help" | "changelog" | "settings" | "piece" | "tally";

export const TWO_POINT: Tool[] = ["wall", "footing", "slab", "frame", "floor", "roof", "measure"];

export interface Toast {
  id: number;
  text: string;
  kind: "good" | "bad" | "tip";
  t: number;
}

export interface Pending {
  label: string;
  specs: m.Spec[];
  group: boolean;
}

interface Prefs {
  quality?: Quality;
  stars: Record<string, number>;
  earned: number;
  laid: number;
}

const WALL_KINDS: Kind[] = ["brick", "block", "stone", "glassblock"];

export const fmt = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}k` : Math.round(n).toLocaleString());
export const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    return { quality: p.quality, stars: p.stars ?? {}, earned: p.earned ?? 0, laid: p.laid ?? 0 };
  } catch {
    return { stars: {}, earned: 0, laid: 0 };
  }
}

export class Game {
  screen: Screen = "title";
  s: m.State | null = null;
  view: View | null = null;
  tool: Tool = "lay";
  panel: Panel = null;
  kind: Kind = "brick";
  /** The finish picked for each kind, and the size for kinds that come in sizes. */
  variant: Partial<Record<Kind, number>> = {};
  sizeIx: Partial<Record<Kind, number>> = {};
  r = 0;
  wall = { kind: "brick" as Kind, bond: "stretcher" as Bond, courses: 12, rect: false };
  footRect = false;
  frameH = 2.4;
  roof = { style: "gable" as RoofStyle, pitch: 30, cover: "tile" as RoofCover, v: 0, gables: true };
  demolishGroup = false;
  anchor: { x: number; y: number; z: number } | null = null;
  pending: Pending | null = null;
  measure: number | null = null;
  selected: m.Piece | null = null;
  report: Report | null = null;
  toasts: Toast[] = [];
  prefs = readPrefs();
  quality: Quality = "medium";
  version = 0;
  loading = 0;
  /** What the pointer's over (for the hint, and the ghost). */
  hoverWhy: string | null = null;
  hoverCut = false;
  private listeners = new Set<() => void>();
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private last = 0;
  private toastId = 1;
  private saveAt = 0;
  private dirty = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private down: { x: number; y: number; t: number; button: number } | null = null;
  private moved = false;
  private pinch = 0;
  private hover: { nx: number; ny: number } | null = null;
  private previewAt = 0;
  private lastTap = 0;
  activeMs = 0;
  private finalSent = false;
  /** Pieces laid and jobs handed over this session: a final score goes in once there's real work to show. */
  private sessionLaid = 0;
  private handed = false;

  constructor(private report_: { progress(n: number): void; final(n: number): void }) {
    this.quality = this.prefs.quality ?? pickQuality();
  }

  /* -------------------------------------------------------------- store */

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  toast(text: string, kind: Toast["kind"] = "tip") {
    const t = { id: this.toastId++, text, kind, t: performance.now() };
    this.toasts = [...this.toasts.slice(-2), t];
    this.bump();
  }

  /* -------------------------------------------------------------- the view */

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.view = new View(canvas, this.quality);
    // The title screen looks at the show home.
    this.s ??= showcaseHouse();
    this.view.rig.jump({ target: new THREE.Vector3(0, 1.6, 0), dist: 19, yaw: 0.65, pitch: 0.28 });
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    if (c) {
      c.removeEventListener("pointerdown", this.onDown);
      c.removeEventListener("pointermove", this.onMove);
      c.removeEventListener("pointerup", this.onUp);
      c.removeEventListener("pointercancel", this.onUp);
      c.removeEventListener("pointerleave", this.onLeave);
      c.removeEventListener("wheel", this.onWheel);
    }
    window.removeEventListener("keydown", this.onKey);
    this.view?.dispose();
    this.view = null;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const v = this.view;
    if (!v || !this.s || document.hidden) return;
    if (this.screen === "title") v.rig.goal.yaw += dt * 0.05;
    else this.activeMs += dt * 1000;
    v.frame(this.s, dt, now);
    if (this.loading < 1 && v.ready) {
      this.loading = 1;
      this.bump();
    }
    if (this.hover && now - this.previewAt > 70) {
      this.previewAt = now;
      this.preview(this.hover.nx, this.hover.ny);
    }
    if (this.toasts.length && now - this.toasts[0].t > 4200) {
      this.toasts = this.toasts.filter((t) => now - t.t < 4200);
      this.bump();
    }
    if (this.dirty && now - this.saveAt > 2500) {
      this.dirty = false;
      this.saveAt = now;
      this.persist();
    }
  };

  /* -------------------------------------------------------------- modes */

  get hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  get job(): Job | null {
    return this.s?.mode === "career" ? jobById(this.s.job) : null;
  }

  private start(s: m.State) {
    this.s = s;
    this.screen = "play";
    this.panel = s.mode === "career" ? "job" : null;
    this.tool = "lay";
    this.anchor = null;
    this.pending = null;
    this.report = null;
    this.view?.setJob(this.job);
    this.view?.rig.fly({ target: new THREE.Vector3(0, 0.6, 2), dist: 17, yaw: 0.55, pitch: 0.55 });
    this.loading = this.view?.ready ? 1 : 0;
    this.bump();
  }

  /** Free build on an empty plot (or carry on with the last one). */
  freeBuild(fresh = false) {
    if (!fresh) {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        const s = raw ? m.load(raw) : null;
        if (s && s.mode === "free") return this.start(s);
      } catch {
        // Start fresh.
      }
    }
    this.start(m.newSite("free"));
    this.toast("An empty plot. Pick a brick and tap the ground to lay it, or use Wall to lay a run.", "tip");
    this.dirty = true;
  }

  /** Put up the show home on the free-build plot. */
  showHome() {
    if (!this.s) return;
    showcaseHouse(this.s);
    this.toast("The show home: a brick bungalow on a slab, under a tiled roof.", "good");
    this.dirty = true;
    this.bump();
  }

  /** Start (or resume) a career job. */
  startJob(id: string) {
    const j = jobById(id);
    if (!j) return;
    try {
      const raw = localStorage.getItem(`${SAVE_KEY}-job`);
      const s = raw ? m.load(raw) : null;
      if (s && s.job === id) return this.start(s);
    } catch {
      // Start fresh.
    }
    this.start(m.newSite("career", id, Math.round(j.budget * 1.5)));
    this.toast(`${j.client}: ${j.title.toLowerCase()}. The pink string line marks where it goes.`, "tip");
    this.dirty = true;
  }

  unlocked(i: number) {
    return i === 0 || (this.prefs.stars[JOBS[i - 1].id] ?? 0) > 0;
  }

  quit() {
    this.persist();
    this.screen = "title";
    this.panel = null;
    this.pending = null;
    this.anchor = null;
    this.view?.ghost.hide();
    this.view?.marks.setTape(null, null);
    this.view?.marks.setAnchor(null);
    this.view?.setJob(null);
    this.s = showcaseHouse();
    this.view?.rig.fly({ target: new THREE.Vector3(0, 1.6, 0), dist: 19, yaw: 0.65, pitch: 0.28 });
    this.submitFinal();
    this.bump();
  }

  /** Post the final score, once a session, when there's something to show for it. */
  submitFinal() {
    if (this.finalSent || (this.sessionLaid < 250 && !this.handed)) return;
    this.finalSent = true;
    this.report_.final(this.score);
  }

  get score() {
    const stars = Object.values(this.prefs.stars).reduce((a, b) => a + b, 0);
    return Math.min(2_000_000, Math.round(stars * 1000 + this.prefs.laid));
  }

  persist() {
    const s = this.s;
    if (!s || this.screen !== "play") return;
    try {
      localStorage.setItem(s.mode === "free" ? SAVE_KEY : `${SAVE_KEY}-job`, m.save(s));
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      // Storage full or blocked: carry on.
    }
  }

  setQuality(q: Quality) {
    this.prefs.quality = q;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      // Fine.
    }
    this.toast("Graphics will change when you next open Groundwork.", "tip");
  }

  /* -------------------------------------------------------------- picking tools and materials */

  setTool(t: Tool) {
    this.tool = t;
    this.anchor = null;
    this.pending = null;
    this.measure = null;
    this.view?.ghost.hide();
    this.view?.marks.setAnchor(null);
    this.view?.marks.setTape(null, null);
    if (t === "wall" && !WALL_KINDS.includes(this.wall.kind)) this.wall.kind = "brick";
    this.bump();
  }

  setKind(k: Kind) {
    this.kind = k;
    if (WALL_KINDS.includes(k)) this.wall.kind = k;
    if (this.tool !== "lay") this.tool = "lay";
    this.bump();
  }

  variantOf(k: Kind) {
    return this.variant[k] ?? 0;
  }

  setVariant(v: number, k: Kind = this.tool === "wall" ? this.wall.kind : this.kind) {
    this.variant[k] = v;
    if (k === "brick") this.variant.bat = v;
    this.bump();
  }

  sizeOf(k: Kind): [number, number, number] | undefined {
    const sizes = KINDS[k].sizes;
    if (!sizes) return undefined;
    return sizes[this.sizeIx[k] ?? (k === "window" ? 1 : 0)].s;
  }

  setSize(i: number) {
    this.sizeIx[this.kind] = i;
    this.bump();
  }

  rotate() {
    this.r = (this.r + 1) % 4;
    this.bump();
  }

  setWall(p: Partial<Game["wall"]>) {
    this.wall = { ...this.wall, ...p };
    this.refreshPending();
    this.bump();
  }

  setRoof(p: Partial<Game["roof"]>) {
    this.roof = { ...this.roof, ...p };
    this.refreshPending();
    this.bump();
  }

  setFrameH(h: number) {
    this.frameH = h;
    this.refreshPending();
    this.bump();
  }

  setDemolishGroup(b: boolean) {
    this.demolishGroup = b;
    this.bump();
  }

  setFootRect(b: boolean) {
    this.footRect = b;
    this.refreshPending();
    this.bump();
  }

  /* -------------------------------------------------------------- the build */

  /** What a two-point tool would lay from its anchor to a point. */
  private run(b: { x: number; z: number }): m.Spec[] {
    const s = this.s!;
    const a = this.anchor!;
    switch (this.tool) {
      case "wall": {
        const o = { kind: this.wall.kind, bond: this.wall.bond, courses: this.wall.courses, v: this.variantOf(this.wall.kind), lintels: true };
        return this.wall.rect ? m.wallRect(s, a, b, a.y, o) : m.wallRun(s, a, b, a.y, o);
      }
      case "footing":
        return this.footRect ? m.footingRect(a, b) : m.footingRun(a, b);
      case "slab":
        return m.slabRect(a, b, a.y);
      case "frame":
        return m.frameRun(a, b, a.y, this.frameH, this.variantOf("stud"));
      case "floor":
        return m.floorRect(a, b, a.y, this.variantOf("board"));
      case "roof":
        return m.roofGen(s, a, b, a.y, { ...this.roof });
      default:
        return [];
    }
  }

  private lastEnd: { x: number; z: number } | null = null;

  private refreshPending() {
    if (!this.pending || !this.anchor || !this.lastEnd) return;
    const specs = this.run(this.lastEnd);
    this.pending = { ...this.pending, specs, label: this.describe(specs) };
    this.view?.ghost.show(specs, true);
  }

  /** "84 bricks, 6 bats" and what it'll cost. */
  describe(specs: m.Spec[]) {
    const by = new Map<Kind, number>();
    for (const p of specs) by.set(p.k, (by.get(p.k) ?? 0) + 1);
    const parts = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${n.toLocaleString()} ${KINDS[k].name.toLowerCase()}${n === 1 ? "" : "s"}`);
    return parts.join(", ");
  }

  quote(specs: m.Spec[]) {
    let cost = 0;
    let mins = 0;
    for (const p of specs) {
      cost += m.costOf(p);
      mins += m.minutesOf(p);
    }
    return { cost, mins };
  }

  /** The hit under a screen point, in normalised coordinates. */
  private hitAt(clientX: number, clientY: number) {
    const c = this.canvas!;
    const r = c.getBoundingClientRect();
    return { nx: ((clientX - r.left) / r.width) * 2 - 1, ny: -((clientY - r.top) / r.height) * 2 + 1 };
  }

  /** Update the ghost for where the pointer is. */
  private preview(nx: number, ny: number) {
    const v = this.view;
    const s = this.s;
    if (!v || !s || this.screen !== "play" || this.pending) return;
    this.hoverWhy = null;
    this.hoverCut = false;
    if (this.tool === "lay") {
      const hit = v.pick(s, nx, ny);
      const c = hit ? m.candidate(s, this.kind, hit, this.r, this.variantOf(this.kind), this.sizeOf(this.kind)) : null;
      if (!c) {
        v.ghost.hide();
        return;
      }
      let why = m.check(s, { ...c, id: -1, t: 0 });
      if (why === "Something's in the way" && KINDS[this.kind].family === "opening") {
        const inWay = m.within(s, m.box({ ...c, id: -1, t: 0 }));
        if (inWay.length && inWay.every((q) => KINDS[q.k].family === "masonry")) {
          why = null;
          this.hoverCut = true;
        }
      }
      this.hoverWhy = why;
      v.ghost.show([c], !why);
      return;
    }
    if (this.tool === "demolish" || this.tool === "look") {
      const hit = v.pick(s, nx, ny);
      const p = hit && hit.id >= 0 ? m.byId(s, hit.id) : null;
      v.ghost.outline(this.tool === "demolish" ? p : null);
      return;
    }
    if (TWO_POINT.includes(this.tool) && this.anchor) {
      const pt = v.pickPlane(nx, ny, this.tool === "footing" ? 0 : this.anchor.y);
      if (!pt) return;
      if (this.tool === "measure") {
        v.marks.setTape(new THREE.Vector3(this.anchor.x, this.anchor.y + 0.02, this.anchor.z), new THREE.Vector3(pt.x, this.anchor.y + 0.02, pt.z));
        this.measure = Math.hypot(pt.x - this.anchor.x, pt.z - this.anchor.z);
        this.bump();
        return;
      }
      v.ghost.show(this.run(pt), true);
    }
  }

  /** A tap on the site, with the current tool. */
  private tap(nx: number, ny: number) {
    const v = this.view;
    const s = this.s;
    if (!v || !s || this.screen !== "play" || this.pending) return;
    const hit = v.pick(s, nx, ny);
    if (!hit) return;
    const now = performance.now();
    // Double-tap: look at that spot.
    if (now - this.lastTap < 320 && this.tool === "look") {
      v.rig.fly({ target: new THREE.Vector3(hit.x, hit.y, hit.z), dist: Math.min(v.rig.goal.dist, 6) });
      this.lastTap = 0;
      return;
    }
    this.lastTap = now;
    switch (this.tool) {
      case "look": {
        this.selected = hit.id >= 0 ? m.byId(s, hit.id) : null;
        this.panel = this.selected ? "piece" : this.panel === "piece" ? null : this.panel;
        this.bump();
        return;
      }
      case "lay":
        return this.layAt(hit);
      case "demolish": {
        const p = hit.id >= 0 ? m.byId(s, hit.id) : null;
        if (!p) return;
        const ids = this.demolishGroup && p.g ? s.pieces.filter((q) => q.g === p.g).map((q) => q.id) : [p.id];
        const r = m.remove(s, ids);
        this.after();
        v.ghost.hide();
        this.toast(r.fell ? `Knocked out ${KINDS[p.k].name.toLowerCase()}${ids.length > 1 ? `s (${ids.length})` : ""}, and ${r.fell} more came down with it.` : `Knocked out ${ids.length > 1 ? `${ids.length} pieces` : `a ${KINDS[p.k].name.toLowerCase()}`}.`, r.fell ? "bad" : "tip");
        return;
      }
      default: {
        if (!TWO_POINT.includes(this.tool)) return;
        if (!this.anchor) {
          const mortar = this.tool === "wall";
          const y = this.tool === "footing" ? 0 : this.tool === "roof" ? (hit.id >= 0 ? m.box(m.byId(s, hit.id)!).y1 : 0) : m.baseAt(s, hit, mortar);
          this.anchor = { x: hit.x, y, z: hit.z };
          v.marks.setAnchor(this.anchor);
          this.bump();
          return;
        }
        const pt = v.pickPlane(nx, ny, this.tool === "footing" ? 0 : this.anchor.y) ?? { x: hit.x, y: hit.y, z: hit.z };
        if (this.tool === "measure") {
          const d = Math.hypot(pt.x - this.anchor.x, pt.z - this.anchor.z);
          const dy = Math.abs((hit.y ?? 0) - this.anchor.y);
          this.toast(`${d.toFixed(3)} m across${dy > 0.01 ? `, ${dy.toFixed(3)} m up` : ""} (${Math.round(d / 0.225)} bricks, ${Math.round(dy / 0.075)} courses)`, "tip");
          this.anchor = null;
          this.measure = null;
          v.marks.setAnchor(null);
          this.bump();
          return;
        }
        const specs = this.run(pt);
        this.lastEnd = pt;
        if (!specs.length) return;
        this.pending = { label: this.describe(specs), specs, group: this.tool === "roof" || this.tool === "wall" };
        v.ghost.show(specs, true);
        this.bump();
      }
    }
  }

  private layAt(hit: m.Hit) {
    const s = this.s!;
    const c = m.candidate(s, this.kind, hit, this.r, this.variantOf(this.kind), this.sizeOf(this.kind));
    if (!c) return;
    let r = m.commit(s, [c]);
    if (!r.added.length && r.why === "Something's in the way" && KINDS[this.kind].family === "opening") r = m.cutOpening(s, c);
    if (r.added.length) {
      this.prefs.laid += r.added.length;
      this.sessionLaid += r.added.length;
      this.after();
    } else this.toast(r.why ?? "It won't go there", "bad");
  }

  /** Lay what's waiting for a yes. */
  confirm() {
    const s = this.s;
    const p = this.pending;
    if (!s || !p) return;
    const r = m.commit(s, p.specs, p.group);
    this.pending = null;
    this.anchor = null;
    this.view?.ghost.hide();
    this.view?.marks.setAnchor(null);
    if (r.added.length) {
      this.prefs.laid += r.added.length;
      this.sessionLaid += r.added.length;
      const q = this.quote(r.added);
      this.toast(`Laid ${this.describe(r.added)}: ${money(q.cost)}, ${Math.round(q.mins / 60)} hours' work.${r.skipped ? ` ${r.skipped} couldn't go in (${r.why}).` : ""}`, r.skipped ? "tip" : "good");
      this.after();
    } else this.toast(r.why ?? "None of it would go in", "bad");
    this.bump();
  }

  cancel() {
    this.pending = null;
    this.anchor = null;
    this.measure = null;
    this.view?.ghost.hide();
    this.view?.marks.setAnchor(null);
    this.view?.marks.setTape(null, null);
    this.bump();
  }

  undo() {
    if (this.s && m.undo(this.s)) this.after();
  }

  redo() {
    if (this.s && m.redo(this.s)) this.after();
  }

  removeSelected() {
    const s = this.s;
    const p = this.selected;
    if (!s || !p) return;
    const r = m.remove(s, [p.id]);
    this.selected = null;
    this.panel = null;
    this.toast(r.fell ? `Taken out, and ${r.fell} more came down with it.` : "Taken out.", r.fell ? "bad" : "tip");
    this.after();
  }

  private after() {
    this.dirty = true;
    this.report_.progress(this.score);
    this.bump();
  }

  /* -------------------------------------------------------------- the job */

  /** Live progress on the brief. */
  get checks(): Check[] {
    const j = this.job;
    return j && this.s ? progress(this.s, j) : [];
  }

  callInspector() {
    const j = this.job;
    if (!j || !this.s) return;
    this.report = inspect(this.s, j);
    this.panel = "report";
    this.bump();
  }

  /** Hand the job over: bank the stars and the pay, and clear the site for the next. */
  handOver() {
    const r = this.report;
    if (!r || !r.passed) return;
    const best = this.prefs.stars[r.job.id] ?? 0;
    if (r.stars > best) this.prefs.stars[r.job.id] = r.stars;
    this.prefs.earned += r.pay;
    try {
      localStorage.removeItem(`${SAVE_KEY}-job`);
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      // Fine.
    }
    this.toast(`${r.job.client} paid ${money(r.pay)}. ${"★".repeat(Math.floor(r.stars))}${r.stars % 1 ? "½" : ""}`, "good");
    this.report_.progress(this.score);
    this.handed = true;
    this.submitFinal();
    this.report = null;
    this.screen = "title";
    this.panel = "jobs";
    this.s = showcaseHouse();
    this.view?.setJob(null);
    this.view?.ghost.hide();
    this.bump();
  }

  openPanel(p: Panel) {
    this.panel = this.panel === p ? null : p;
    this.bump();
  }

  focus() {
    const s = this.s;
    const v = this.view;
    if (!s || !v) return;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    let top = 0;
    for (const p of s.pieces) {
      const b = m.box(p);
      x0 = Math.min(x0, b.x0);
      z0 = Math.min(z0, b.z0);
      x1 = Math.max(x1, b.x1);
      z1 = Math.max(z1, b.z1);
      top = Math.max(top, b.y1);
    }
    if (!s.pieces.length) return v.rig.fly({ target: new THREE.Vector3(0, 0.5, 0), dist: 14 });
    const size = Math.max(x1 - x0, z1 - z0, top);
    v.rig.fly({ target: new THREE.Vector3((x0 + x1) / 2, top * 0.4, (z0 + z1) / 2), dist: Math.max(4, size * 1.6) });
  }

  /* -------------------------------------------------------------- input */

  private onDown = (e: PointerEvent) => {
    this.canvas?.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
      this.moved = false;
    } else {
      this.moved = true;
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private onMove = (e: PointerEvent) => {
    const v = this.view;
    if (!v) return;
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      // A mouse hovering: show what a click would do.
      if (e.pointerType === "mouse") this.hover = this.hitAt(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 7) this.moved = true;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0) v.rig.zoom(this.pinch / Math.max(1, d));
      this.pinch = d;
      v.rig.pan(dx / 2, dy / 2, v.height, v.camera.fov);
      return;
    }
    if (!this.moved) {
      if (e.pointerType === "mouse") this.hover = this.hitAt(e.clientX, e.clientY);
      return;
    }
    if (this.down?.button === 2 || this.down?.button === 1 || e.shiftKey) v.rig.pan(dx, dy, v.height, v.camera.fov);
    else v.rig.rotate(dx, dy);
  };

  private onUp = (e: PointerEvent) => {
    const wasTap = this.pointers.size === 1 && !this.moved && this.down && performance.now() - this.down.t < 600 && this.down.button === 0;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = 0;
    if (wasTap) {
      const h = this.hitAt(e.clientX, e.clientY);
      // A touch has no hover: show the ghost where it landed, then act.
      this.preview(h.nx, h.ny);
      this.tap(h.nx, h.ny);
      if (e.pointerType === "mouse") this.preview(h.nx, h.ny);
    }
    if (!this.pointers.size) this.down = null;
  };

  private onLeave = () => {
    this.hover = null;
    if (!this.pending && !this.anchor) this.view?.ghost.hide();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.view?.rig.zoom(Math.exp(e.deltaY * 0.0012));
  };

  private onKey = (e: KeyboardEvent) => {
    if (this.screen !== "play") return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const v = this.view;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === "y") return this.redo();
    if (k === "escape") return this.pending || this.anchor ? this.cancel() : this.openPanel(null);
    if (k === "enter" && this.pending) return this.confirm();
    if (k === "r") return this.rotate();
    if (!v) return;
    if (k === "q") v.rig.rotate(-40, 0);
    if (k === "e") v.rig.rotate(40, 0);
    const step = 40;
    if (k === "w" || k === "arrowup") v.rig.pan(0, step, v.height, v.camera.fov);
    if (k === "s" || k === "arrowdown") v.rig.pan(0, -step, v.height, v.camera.fov);
    if (k === "a" || k === "arrowleft") v.rig.pan(step, 0, v.height, v.camera.fov);
    if (k === "d" || k === "arrowright") v.rig.pan(-step, 0, v.height, v.camera.fov);
    if (k === "=" || k === "+") v.rig.zoom(0.85);
    if (k === "-") v.rig.zoom(1.18);
  };

  /** Raise or lower the camera's focus (to work on an upper course). */
  lift(dy: number) {
    const v = this.view;
    if (!v) return;
    const t = v.rig.goal.target.clone();
    t.y = Math.max(0, Math.min(12, t.y + dy));
    v.rig.fly({ target: t });
  }

  dispose() {
    this.persist();
    this.submitFinal();
    this.detach();
  }
}

export const bondName = (b: Bond) => BONDS[b].name;
export { GAME_SLUG };
