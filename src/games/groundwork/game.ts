import * as THREE from "three";
import * as co from "./company";
import { BONDS, GAME_SLUG, JOBS, KINDS, PREFS_KEY, SAVE_KEY, type Bond, type Job, type Kind, type PavePattern, type RoofCover, type RoofStyle } from "./data";
import { assess, inspect, jobById, progress, type Check, type Report } from "./jobs";
import * as m from "./model";
import { pickQuality, View, type Quality } from "./render/view";
import * as plans from "./plans";
import { showcaseHouse } from "./showcase";

/**
 * Groundwork's controller: the site, the tools (lay a piece, run a wall, pour a footing or a slab,
 * frame a stud wall, lay a floor, roof it, knock something out, measure), the camera gestures,
 * the ghost that shows what a tap would lay, the confirm step before anything big goes in, the
 * career's jobs and the inspector, autosave and the score.
 */

export type Screen = "title" | "play" | "hq";
export type Tool = "look" | "plan" | "lay" | "wall" | "footing" | "slab" | "frame" | "floor" | "roof" | "pave" | "fence" | "paint" | "match" | "copy" | "demolish" | "measure";
export type Panel = null | "job" | "report" | "jobs" | "help" | "changelog" | "settings" | "piece" | "tally" | "property";
export type HqTab = "overview" | "contracts" | "property" | "crew" | "bank";

/** Which company site you're on: a contract, or your own block. */
export type Ctx = { kind: "contract"; id: number } | { kind: "property"; id: number } | null;

export const CO_KEY = `${SAVE_KEY}-co`;
export const siteKey = (c: NonNullable<Ctx>) => `${SAVE_KEY}-${c.kind === "contract" ? "c" : "p"}${c.id}`;

export const TWO_POINT: Tool[] = ["wall", "footing", "slab", "frame", "floor", "roof", "pave", "fence", "measure"];

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

function readKey(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

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
  roof = { style: "gable" as RoofStyle, pitch: 30, cover: "tile" as RoofCover, v: 0, gables: true, gutters: true, solar: 0 };
  pave = { pattern: "herring" as PavePattern };
  fenceH = 1.8;
  /** The piece picked to repaint, and whether its whole run goes with it. */
  paintTarget: m.Piece | null = null;
  paintGroup = true;
  /** What's been picked up to copy, and how far it's turned. */
  clip: m.Piece[] | null = null;
  copyTurns = 0;
  /** Plans: the one picked, where it's pegged out (waiting for a yes), what it'll take, and one going up stage by stage. */
  planId: plans.PlanId = "bungalow";
  planSize: Partial<Record<plans.PlanId, { w: number; d: number }>> = {};
  planLook = { front: 0, brick: 0, roof: 0, solar: false };
  draft: plans.Placed | null = null;
  draftWhy: string | null = null;
  quoteOf: { cost: number; days: number; pieces: number } | null = null;
  building: { p: plans.Placed; stages: plans.Stage[]; next: number } | null = null;
  private quoteTimer = 0;
  /** The company, the site you're on for it, and the office's open tab. */
  co: co.Company | null = co.loadCompany(readKey(CO_KEY));
  ctx: Ctx = null;
  hqTab: HqTab = "overview";
  /** The day count on this site already paid for in wages. */
  private siteDay = 1;
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
  private lastDraw = 0;
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
    // Behind the office the site is a still picture under frosted glass: redraw it once a second,
    // so the glass isn't re-blurred every frame.
    if (this.screen === "hq" && now - this.lastDraw < 1000) return;
    this.lastDraw = now;
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
    if (this.ctx?.kind === "contract") {
      const a = this.active;
      return a ? co.contractJob(a) : null;
    }
    return this.s?.mode === "career" ? jobById(this.s.job) : null;
  }

  /** The contract you're on, if it's a contract. */
  get active(): co.Active | null {
    const c = this.ctx;
    return c?.kind === "contract" ? (this.co?.active.find((a) => a.id === c.id) ?? null) : null;
  }

  /** Your block of land, if you're on it. */
  get property(): co.Property | null {
    const c = this.ctx;
    return c?.kind === "property" ? (this.co?.props.find((p) => p.id === c.id) ?? null) : null;
  }

  /** What's pegged out: a job's zone or your block. */
  get zoned() {
    const p = this.property;
    if (p) return { zone: co.zoneOf(p) };
    return this.job;
  }

  /** Your block's value as it stands. */
  get liveValuation() {
    const p = this.property;
    if (!p || !this.co || !this.s) return null;
    const probe = { ...p, a: assess(this.s, co.zoneOf(p)), spent: this.s.spent };
    return { a: probe.a, v: co.valuation(this.co, probe) };
  }

  private start(s: m.State, ctx: Ctx = null) {
    this.ctx = ctx;
    if (ctx && this.co) {
      s.money = this.co.cash;
      s.speed = co.crewSpeed(this.co);
      this.siteDay = m.dayOf(s.minutes);
    }
    this.s = s;
    this.screen = "play";
    this.panel = s.mode === "career" || ctx?.kind === "contract" ? "job" : ctx?.kind === "property" ? "property" : null;
    // A fresh site starts with the plans open: the easy way in.
    this.tool = s.pieces.length ? "lay" : "plan";
    this.anchor = null;
    this.pending = null;
    this.report = null;
    this.draft = null;
    this.building = null;
    this.view?.setJob(this.zoned);
    this.paintTarget = null;
    this.clip = null;
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
    if (this.ctx) return this.toOffice();
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
    const business = this.co ? Math.max(0, co.worth(this.co) - co.START_CASH) / 100 : 0;
    return Math.min(2_000_000, Math.round(stars * 1000 + this.prefs.laid + business));
  }

  persist() {
    const s = this.s;
    try {
      if (this.co) localStorage.setItem(CO_KEY, JSON.stringify(this.co));
      if (!s || this.screen !== "play") return;
      localStorage.setItem(this.ctx ? siteKey(this.ctx) : s.mode === "free" ? SAVE_KEY : `${SAVE_KEY}-job`, m.save(s));
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      this.toast("Couldn't save: storage is full. Sell a property or finish a contract to free some up.", "bad");
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
    if (t !== "paint") this.paintTarget = null;
    if (t !== "plan") {
      this.draft = null;
      this.building = null;
    }
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
    if (this.tool === "plan") return this.setPlan({ front: (this.planLook.front + 1) % 4 });
    if (this.tool === "copy" && this.clip) {
      this.copyTurns = (this.copyTurns + 1) % 4;
      if (this.pending && this.lastHit) {
        const specs = this.pasteAt(this.lastHit);
        this.pending = { ...this.pending, specs, label: this.describe(specs) };
        this.view?.ghost.show(specs, true);
      }
      this.bump();
      return;
    }
    this.r = (this.r + 1) % 4;
    this.bump();
  }

  private lastHit: m.Hit | null = null;

  /** Where the picked-up pieces would go for a tap: their corner on the spot, turned as asked, bedded on what's there. */
  private pasteAt(hit: m.Hit): m.Spec[] {
    const s = this.s!;
    const src = this.clip!;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    let y0 = Infinity;
    for (const p of src) {
      const b = m.box(p);
      x0 = Math.min(x0, b.x0);
      z0 = Math.min(z0, b.z0);
      x1 = Math.max(x1, b.x1);
      z1 = Math.max(z1, b.z1);
      y0 = Math.min(y0, p.y);
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const turned = m.copySpecs(src, 0, 0, 0, this.copyTurns, cx, cz);
    let tx0 = Infinity;
    let tz0 = Infinity;
    for (const p of turned) {
      const b = m.box({ ...p, id: -1, t: 0 });
      tx0 = Math.min(tx0, b.x0);
      tz0 = Math.min(tz0, b.z0);
    }
    const mortar = src.some((p) => KINDS[p.k].mortar);
    const base = m.baseAt(s, hit, mortar);
    const dx = m.snapG(hit.x) - tx0;
    const dz = m.snapG(hit.z) - tz0;
    return turned.map((p) => ({ ...p, x: p.x + dx, y: p.y + (base - y0), z: p.z + dz }));
  }

  /** Pick up a piece's kind, finish and size (the eyedropper). */
  private matchPiece(p: m.Piece) {
    const I = KINDS[p.k];
    const sizes = I.sizes;
    if (sizes && p.s) {
      const i = sizes.findIndex((z) => z.s.every((v, k) => Math.abs(v - p.s![k]) < 1e-4));
      if (i >= 0) this.sizeIx[p.k] = i;
    }
    this.variant[p.k] = p.v;
    if (I.family === "roof" || I.family === "fitting") {
      if (p.k === "tile" || p.k === "ridge") this.roof = { ...this.roof, cover: "tile", v: p.v };
      if (p.k === "sheet") this.roof = { ...this.roof, cover: "sheet", v: p.v };
      if (p.k === "membrane") this.roof = { ...this.roof, style: "flat", v: p.v };
      this.setTool("roof");
    } else if (I.family === "fence") {
      this.variant.paling = p.v;
      this.setTool("fence");
    } else if (I.tray) {
      this.r = p.r;
      this.setKind(p.k);
      if (WALL_KINDS.includes(p.k)) this.wall.kind = p.k;
    } else if (p.k === "closer" || p.k === "halfblock" || p.k === "halfstone") {
      const whole: Kind = p.k === "closer" ? "brick" : p.k === "halfblock" ? "block" : "stone";
      this.variant[whole] = p.v;
      this.setKind(whole);
    } else {
      this.toast(`${I.name}s come with their tool.`, "tip");
      return;
    }
    this.toast(`Matched: ${I.variants[p.v]?.name ?? ""} ${I.name.toLowerCase()}.`, "good");
  }

  /** Repaint the picked piece (and its run) in a finish. */
  paintWith(v: number) {
    const s = this.s;
    const p = this.paintTarget;
    if (!s || !p) return;
    const ids = this.paintGroup && p.g ? s.pieces.filter((q) => q.g === p.g && q.k === p.k).map((q) => q.id) : [p.id];
    const n = m.repaint(s, ids, v);
    if (n) {
      this.toast(`Refinished ${n} ${KINDS[p.k].name.toLowerCase()}${n === 1 ? "" : "s"} in ${KINDS[p.k].variants[v].name.toLowerCase()}.`, "good");
      this.after();
    } else this.toast(m.paid(s) && s.money < 1 ? "Out of money for paint" : "It's already that finish.", "tip");
  }

  setPaintGroup(b: boolean) {
    this.paintGroup = b;
    this.bump();
  }

  dropClip() {
    this.clip = null;
    this.copyTurns = 0;
    this.cancel();
  }

  setPave(p: PavePattern) {
    this.pave = { pattern: p };
    this.refreshPending();
    this.bump();
  }

  setFenceH(h: number) {
    this.fenceH = h;
    this.refreshPending();
    this.bump();
  }

  /* -------------------------------------------------------------- plans */

  planDims(id: plans.PlanId = this.planId) {
    const info = plans.planInfo(id);
    return this.planSize[id] ?? { w: info.w[2], d: info.d[2] };
  }

  pickPlan(id: plans.PlanId) {
    this.planId = id;
    if (this.draft) this.updateDraft({ id, ...this.planDims(id) });
    this.bump();
  }

  /** Change the picked plan's size or look (and the pegged-out one with it). */
  setPlan(p: Partial<{ w: number; d: number; front: number; brick: number; roof: number; solar: boolean }>) {
    const info = plans.planInfo(this.planId);
    const dims = this.planDims();
    const w = Math.max(info.w[0], Math.min(info.w[1], p.w ?? dims.w));
    const d = Math.max(info.d[0], Math.min(info.d[1], p.d ?? dims.d));
    this.planSize[this.planId] = { w, d };
    this.planLook = { front: p.front ?? this.planLook.front, brick: p.brick ?? this.planLook.brick, roof: p.roof ?? this.planLook.roof, solar: p.solar ?? this.planLook.solar };
    if (this.draft) this.updateDraft({ w, d, ...this.planLook });
    this.bump();
  }

  /** Peg the picked plan out where you tapped. */
  placePlan(x: number, z: number) {
    this.updateDraft({ ...plans.placeNew(this.planId, x, z), ...this.planDims(), ...this.planLook, cx: x, cz: z });
  }

  private updateDraft(p: Partial<plans.Placed>) {
    const s = this.s;
    if (!s) return;
    const d = { ...(this.draft ?? plans.placeNew(this.planId, 0, 0)), ...p } as plans.Placed;
    this.draft = d;
    this.draftWhy = plans.siteCheck(s, d);
    const z = this.zoned;
    if (!this.draftWhy && z) {
      const r = plans.rectOf(d);
      const [x0, z0, x1, z1] = z.zone;
      if (r.x0 < x0 - 0.3 || r.x1 > x1 + 0.3 || r.z0 < z0 - 0.3 || r.z1 > z1 + 0.3) this.draftWhy = "Outside the pegs: it won't count for the job";
    }
    this.view?.ghost.show(plans.footprint(d), !this.draftWhy || this.draftWhy.startsWith("Outside"));
    // What it'll take, worked out a moment later (it builds the whole thing on a copy).
    this.quoteOf = null;
    clearTimeout(this.quoteTimer);
    this.quoteTimer = window.setTimeout(() => {
      if (this.draft !== d || !this.s) return;
      const e = plans.estimate(this.s, d);
      this.quoteOf = { cost: e.cost, days: e.minutes / 540, pieces: e.pieces };
      this.bump();
    }, 250);
    this.bump();
  }

  /** Start building the pegged-out plan: stage by stage, or all of it now. */
  startPlan(all: boolean) {
    const d = this.draft;
    if (!d || (this.draftWhy && !this.draftWhy.startsWith("Outside"))) return;
    this.building = { p: d, stages: plans.stages(d), next: 0 };
    this.draft = null;
    this.view?.ghost.hide();
    const r = plans.rectOf(d);
    this.view?.rig.fly({ target: new THREE.Vector3((r.x0 + r.x1) / 2, 1, (r.z0 + r.z1) / 2), dist: Math.max(10, Math.max(r.W, r.D) * 2) });
    if (all) this.buildRest();
    else this.showNextStage();
    this.bump();
  }

  private showNextStage() {
    const b = this.building;
    const s = this.s;
    if (!b || !s) return;
    const st = b.stages[b.next];
    if (st) this.view?.ghost.show(st.make(s), true);
    else this.view?.ghost.hide();
  }

  /** Build the next stage of the plan. */
  buildStage() {
    const b = this.building;
    const s = this.s;
    if (!b || !s) return false;
    const st = b.stages[b.next];
    if (!st) return false;
    const r = m.commit(s, st.make(s), true);
    b.next++;
    if (r.added.length) {
      this.prefs.laid += r.added.length;
      this.sessionLaid += r.added.length;
    }
    if (r.why === "Out of money") {
      this.toast(`${st.name}: ran out of money after ${r.added.length.toLocaleString()} pieces.`, "bad");
      b.next--;
      this.after();
      return false;
    }
    if (b.next >= b.stages.length) {
      this.toast(`${plans.planInfo(b.p.id).name} finished: ${s.pieces.length.toLocaleString()} pieces on site.`, "good");
      this.building = null;
      this.view?.ghost.hide();
    } else this.showNextStage();
    this.after();
    return true;
  }

  /** Build every stage that's left. */
  buildRest() {
    let guard = 0;
    while (this.building && guard++ < 20) if (!this.buildStage()) break;
  }

  stopPlan() {
    this.building = null;
    this.draft = null;
    this.view?.ghost.hide();
    this.bump();
  }

  /** A plan sized to the job's brief, pegged out in its zone, ready to build. */
  buildToBrief() {
    const j = this.job;
    if (!j) return;
    const p = plans.planForBrief(j.needs, j.zone);
    if (!p) return this.toast("No ready plan for this one: build it by hand.", "tip");
    this.setTool("plan");
    this.planId = p.id;
    this.planSize[p.id] = { w: p.w, d: p.d };
    this.panel = null;
    this.updateDraft(p);
    this.view?.rig.fly({ target: new THREE.Vector3(p.cx, 1, p.cz), dist: 16 });
    this.toast(`A ${plans.planInfo(p.id).name.toLowerCase()} drawn up to the brief. Check the cost, then build it.`, "tip");
  }

  /** Down tools till tomorrow. */
  knockOff() {
    if (!this.s) return;
    m.knockOff(this.s);
    this.toast(`Knocked off. Day ${m.dayOf(this.s.minutes)}: the mortar's gone off overnight.`, "tip");
    this.after();
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
      case "pave":
        return m.paveRect(a, b, a.y, this.pave.pattern, this.variantOf("paver"));
      case "fence":
        return m.fenceRun(a, b, this.fenceH, this.variantOf("paling"));
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
    if (this.tool === "plan") return;
    if (this.tool === "lay") {
      const hit = v.pick(s, nx, ny);
      const into = hit && KINDS[this.kind].family === "opening" ? m.openingAt(s, hit, this.kind, this.sizeOf(this.kind), this.variantOf(this.kind)) : null;
      if (into) {
        this.hoverWhy = null;
        this.hoverCut = true;
        v.ghost.show([into], true);
        return;
      }
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
    if (this.tool === "copy" && this.clip) {
      const hit = v.pick(s, nx, ny);
      if (!hit) return v.ghost.hide();
      const specs = this.pasteAt(hit);
      v.ghost.show(specs, true);
      return;
    }
    if (this.tool === "demolish" || this.tool === "look" || this.tool === "paint" || this.tool === "match" || this.tool === "copy") {
      const hit = v.pick(s, nx, ny);
      const p = hit && hit.id >= 0 ? m.byId(s, hit.id) : null;
      v.ghost.outline(this.tool === "look" ? null : p);
      return;
    }
    if (TWO_POINT.includes(this.tool) && this.anchor) {
      const pt = v.pickPlane(nx, ny, this.tool === "footing" || this.tool === "fence" ? 0 : this.anchor.y);
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
      case "plan": {
        if (this.building) return;
        this.placePlan(hit.x, hit.z);
        return;
      }
      case "paint": {
        this.paintTarget = hit.id >= 0 ? m.byId(s, hit.id) : null;
        if (this.paintTarget && KINDS[this.paintTarget.k].variants.length < 2) {
          this.toast(`${KINDS[this.paintTarget.k].name}s only come in one finish.`, "tip");
          this.paintTarget = null;
        }
        this.bump();
        return;
      }
      case "match": {
        const p = hit.id >= 0 ? m.byId(s, hit.id) : null;
        if (p) this.matchPiece(p);
        return;
      }
      case "copy": {
        if (!this.clip) {
          const p = hit.id >= 0 ? m.byId(s, hit.id) : null;
          if (!p) return;
          this.clip = p.g ? s.pieces.filter((q) => q.g === p.g) : [p];
          this.copyTurns = 0;
          this.toast(`Picked up ${this.describe(this.clip)}. Tap where the copy goes; ↻ turns it.`, "tip");
          this.bump();
          return;
        }
        const specs = this.pasteAt(hit);
        this.lastHit = hit;
        this.pending = { label: this.describe(specs), specs, group: true };
        v.ghost.show(specs, true);
        this.bump();
        return;
      }
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
        // Roof: tap a building and the roof fits its walls.
        if (this.tool === "roof" && !this.anchor && hit.id >= 0) {
          const bl = m.buildingAt(s, hit.id);
          if (bl) {
            const specs = m.roofGen(s, { x: bl.x0, z: bl.z0 }, { x: bl.x1, z: bl.z1 }, bl.top, { ...this.roof });
            this.pending = { label: this.describe(specs), specs, group: true };
            v.ghost.show(specs, true);
            this.bump();
            return;
          }
        }
        if (!this.anchor) {
          const mortar = this.tool === "wall";
          const y = this.tool === "footing" || this.tool === "fence" ? 0 : this.tool === "roof" ? (hit.id >= 0 ? m.box(m.byId(s, hit.id)!).y1 : 0) : m.baseAt(s, hit, mortar);
          this.anchor = { x: hit.x, y, z: hit.z };
          v.marks.setAnchor(this.anchor);
          this.bump();
          return;
        }
        const pt = v.pickPlane(nx, ny, this.tool === "footing" || this.tool === "fence" ? 0 : this.anchor.y) ?? { x: hit.x, y: hit.y, z: hit.z };
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
        this.pending = { label: this.describe(specs), specs, group: this.tool === "roof" || this.tool === "wall" || this.tool === "pave" || this.tool === "fence" };
        v.ghost.show(specs, true);
        this.bump();
      }
    }
  }

  private layAt(hit: m.Hit) {
    const s = this.s!;
    // A window or door tapped onto a wall goes into it.
    const into = KINDS[this.kind].family === "opening" ? m.openingAt(s, hit, this.kind, this.sizeOf(this.kind), this.variantOf(this.kind)) : null;
    if (into) {
      const r = m.cutOpening(s, into);
      if (r.added.length) {
        this.prefs.laid += r.added.length;
        this.sessionLaid += r.added.length;
        this.after();
        return;
      }
    }
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
    if (this.draft) {
      this.draft = null;
      this.view?.ghost.hide();
    }
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
    this.syncCompany();
    this.dirty = true;
    this.report_.progress(this.score);
    this.bump();
  }

  /** On a company site the site's cash is the company's: pay the crew for every new day worked. */
  private syncCompany() {
    const s = this.s;
    const c = this.co;
    if (!s || !c || !this.ctx) return;
    c.cash = s.money;
    const d = m.dayOf(s.minutes);
    if (d > this.siteDay) {
      co.advance(c, d - this.siteDay, true);
      this.siteDay = d;
    }
    s.money = c.cash;
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
    if (this.ctx?.kind === "contract" && this.co) {
      const c = this.ctx;
      this.syncCompany();
      const st = co.settle(this.co, c.id, r);
      if (!st) return;
      this.handed = true;
      this.removeKey(siteKey(c));
      this.toast(`${r.job.client} paid ${money(st.paid)}. ${"★".repeat(Math.floor(r.stars))}${r.stars % 1 ? "½" : ""} Reputation ${st.rep >= 0 ? "+" : ""}${st.rep}.`, "good");
      this.report = null;
      // Off the site first, so nothing saves it back.
      this.screen = "hq";
      this.ctx = null;
      this.goOffice("contracts");
      this.submitFinal();
      return;
    }
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

  /* -------------------------------------------------------------- the company */

  private removeKey(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      // Fine.
    }
  }

  /** Open the office (starting the company if there isn't one: see `foundCompany`). */
  goOffice(tab: HqTab = this.hqTab) {
    this.persist();
    this.screen = "hq";
    this.hqTab = tab;
    this.panel = null;
    this.pending = null;
    this.anchor = null;
    this.ctx = null;
    this.view?.ghost.hide();
    this.view?.marks.setAnchor(null);
    this.view?.setJob(null);
    this.s = showcaseHouse();
    this.view?.rig.fly({ target: new THREE.Vector3(0, 1.6, 0), dist: 21, yaw: 2.4, pitch: 0.3 });
    if (this.co) co.refill(this.co);
    this.persist();
    this.bump();
  }

  foundCompany(name: string) {
    this.co = co.newCompany(name);
    this.toast(`${this.co.name} is open for business. Tender for a job, or buy a block and build.`, "good");
    this.persist();
    this.bump();
  }

  setHqTab(t: HqTab) {
    this.hqTab = t;
    this.bump();
  }

  /** Back from a site to the office: settle up and record what's on your block. */
  toOffice() {
    const s = this.s;
    const p = this.property;
    this.syncCompany();
    if (s && p) co.survey(p, assess(s, co.zoneOf(p)), s.spent);
    this.persist();
    this.goOffice(p ? "property" : this.ctx?.kind === "contract" ? "contracts" : this.hqTab);
  }

  /** Go to a contract's site or your block. */
  visit(ctx: NonNullable<Ctx>) {
    const c = this.co;
    if (!c) return;
    const raw = readKey(siteKey(ctx));
    const saved = raw ? m.load(raw) : null;
    const s = saved ?? m.newSite(ctx.kind === "contract" ? "contract" : "property", null, c.cash);
    s.mode = ctx.kind === "contract" ? "contract" : "property";
    this.start(s, ctx);
    const what = ctx.kind === "contract" ? this.active?.c.title : this.property ? `your block in ${co.suburb(this.property.suburb).name}` : "";
    if (!saved) this.toast(`On site: ${what?.toLowerCase()}. The pink string line marks the ${ctx.kind === "contract" ? "job" : "block"}.`, "tip");
    this.dirty = true;
  }

  /** Office actions, each saved straight away. */
  private act<T>(f: (c: co.Company) => T): T | undefined {
    const c = this.co;
    if (!c) return undefined;
    const r = f(c);
    this.persist();
    this.report_.progress(this.score);
    this.bump();
    return r;
  }

  tender(id: number, price: number) {
    const r = this.act((c) => co.tender(c, id, price));
    if (r) this.toast(r.won ? `You won it at ${money(price)}. Rivals bid ${r.rivals.map(money).join(", ")}.` : `Lost: ${r.why}.`, r.won ? "good" : "bad");
    return r;
  }

  abandonContract(id: number) {
    this.act((c) => co.abandon(c, id));
    this.removeKey(siteKey({ kind: "contract", id }));
  }

  buyLand(id: number) {
    const r = this.act((c) => co.buy(c, id));
    if (typeof r === "string") this.toast(r, "bad");
    else if (r) this.toast(`Bought. ${co.money(r.paid)} with the stamp duty.`, "good");
  }

  sellProperty(id: number) {
    const r = this.act((c) => co.sell(c, id));
    if (r) {
      this.removeKey(siteKey({ kind: "property", id }));
      this.toast(`Sold at auction for ${money(r.hammer)}: ${r.profit >= 0 ? "a profit" : "a loss"} of ${money(Math.abs(r.profit))}.`, r.profit >= 0 ? "good" : "bad");
    }
  }

  rentProperty(id: number) {
    this.act((c) => co.rentOut(c, id));
  }

  endLease(id: number) {
    this.act((c) => co.endLease(c, id));
  }

  hireWorker(id: number) {
    this.act((c) => co.hire(c, id));
  }

  fireWorker(id: number) {
    this.act((c) => co.fire(c, id));
  }

  borrow(n: number) {
    this.act((c) => co.borrow(c, n));
  }

  repay(n: number) {
    this.act((c) => co.repay(c, n));
  }

  /** Let a week go by at the office (no site work, no wages). */
  skipWeek() {
    this.act((c) => co.advance(c, 7, false));
    this.toast("A week goes by.", "tip");
  }

  /** Close the company down for good, and its sites with it. */
  windUp() {
    const c = this.co;
    if (!c) return;
    for (const a of c.active) this.removeKey(siteKey({ kind: "contract", id: a.id }));
    for (const p of c.props) this.removeKey(siteKey({ kind: "property", id: p.id }));
    this.removeKey(CO_KEY);
    this.co = null;
    this.bump();
  }

  renameCompany(name: string) {
    this.act((c) => (c.name = name.trim() || c.name));
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
    if (k === "escape") return this.pending || this.anchor || this.draft ? this.cancel() : this.openPanel(null);
    if (k === "enter" && this.pending) return this.confirm();
    if (k === "enter" && this.draft) return this.startPlan(false);
    if (k === "enter" && this.building) return void this.buildStage();
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
