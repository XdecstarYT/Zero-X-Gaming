/**
 * The controller: loads the world, owns the simulation and the map, runs the clock at the
 * chosen speed, turns taps, drags, pinches and clicks into selections and orders, saves as you
 * go, and tells the React interface when to redraw.
 */
import { PREFS_KEY, SAVE_KEY, UNITS, type ItemId } from "./data";
import * as act from "./actions";
import { launch } from "./military";
import { MapView } from "./render";
import { advance, answer, load, save, score, startGame } from "./sim";
import { type State } from "./state";
import { cityAt, loadWorld, type World } from "./world";

export type Screen = "loading" | "title" | "pick" | "play";
export type PanelId = "nation" | "economy" | "military" | "diplomacy" | "politics" | "world";
export type Targeting = null | { kind: "missile" | "nuke" };

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "good" | "bad";
}

const SPEEDS = [0, 0.5, 1, 2, 4, 8];

export class Game {
  world: World | null = null;
  s: State | null = null;
  /** The world as it stands on day one (the title and the country picker show it). */
  preview: State | null = null;
  view: MapView | null = null;
  screen: Screen = "loading";
  loadError = false;
  paused = false;
  /** Index into SPEEDS. */
  speed = 2;
  panel: PanelId | null = null;
  /** A foreign (or any) nation being looked at. */
  inspect: number | null = null;
  city: number | null = null;
  targeting: Targeting = null;
  toasts: Toast[] = [];
  /** Country picker: the nation under consideration. */
  pick: number | null = null;
  difficulty: State["difficulty"] = "normal";
  version = 0;
  activeMs = 0;
  private listeners = new Set<() => void>();
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private last = 0;
  private uiT = 0;
  private saveDay = 0;
  private finalSent = false;
  private toastId = 0;

  constructor(private report: { progress: (n: number) => void; final: (n: number) => void }) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  get speeds() {
    return SPEEDS;
  }
  get hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  /* -------------------------------------------------------------- lifecycle */

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    this.raf = requestAnimationFrame(this.frame);
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { difficulty?: State["difficulty"] };
      if (p.difficulty) this.difficulty = p.difficulty;
    } catch {}
    loadWorld()
      .then((w) => {
        this.world = w;
        this.preview = startGame(w, "USA");
        const small = window.matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 700;
        this.view = new MapView(canvas, w, small);
        this.resize();
        this.view.focus(w.w * 0.52, w.h * 0.42, this.view.minZoom * 1.15);
        this.screen = "title";
        this.bump();
      })
      .catch(() => {
        this.loadError = true;
        this.bump();
      });
  }

  detach() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    const c = this.canvas;
    if (!c) return;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
  }

  resize() {
    if (!this.canvas || !this.view) return;
    const r = this.canvas.getBoundingClientRect();
    this.view.resize(Math.max(1, r.width), Math.max(1, r.height), window.devicePixelRatio || 1);
  }

  dispose() {
    this.persist();
    this.submitFinal();
  }

  /* -------------------------------------------------------------- starting */

  choose() {
    this.screen = "pick";
    this.pick = null;
    this.bump();
  }

  /** Look at a nation in the picker. */
  look(n: number) {
    if (!this.world || !this.view) return;
    this.pick = n;
    const cs = this.world.cities.filter((c) => c.nation === n);
    if (cs.length) {
      const cap = cs.find((c) => c.capital) ?? cs[0];
      this.view.focus(cap.x, cap.y, Math.max(this.view.cam.zoom, 0.9));
    }
    this.view.highlight = n;
    this.bump();
  }

  start(iso: string) {
    if (!this.world) return;
    this.s = startGame(this.world, iso, { difficulty: this.difficulty, seed: Math.floor(Math.random() * 1e9) });
    this.afterStart();
    this.toast(`You lead ${this.s.nations[this.s.player].name}. Tap your cities to build; tap your armies, then the map, to move them.`, "info");
  }

  continueGame() {
    if (!this.world) return;
    let s: State | null = null;
    try {
      s = load(localStorage.getItem(SAVE_KEY) ?? "");
    } catch {
      s = null;
    }
    if (!s || s.cities.length !== this.world.cities.length) {
      this.toast("That save couldn't be read", "bad");
      return;
    }
    this.s = s;
    this.afterStart();
  }

  private afterStart() {
    const s = this.s!;
    this.screen = "play";
    this.paused = false;
    this.speed = 2;
    this.panel = null;
    this.city = null;
    this.inspect = null;
    this.finalSent = false;
    this.saveDay = s.day;
    this.view!.selectedCity = -1;
    this.view!.highlight = -1;
    this.view!.selected.clear();
    const cap = this.world!.cities[s.nations[s.player].capital];
    this.view!.focus(cap.x, cap.y, 1.3);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ difficulty: this.difficulty }));
    } catch {}
    this.bump();
  }

  setDifficulty(d: State["difficulty"]) {
    this.difficulty = d;
    this.bump();
  }

  /* -------------------------------------------------------------- the loop */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    const v = this.view;
    if (!v) return;
    const s = this.s;
    if (s && this.screen === "play" && !this.paused && !s.over && this.speed > 0) {
      this.activeMs += dt * 1000;
      advance(s, this.world!, Math.min(0.6, dt * SPEEDS[this.speed]));
      if (s.day - this.saveDay >= 30) {
        this.saveDay = s.day;
        this.persist();
        this.report.progress(score(s));
      }
      if (s.over && !this.finalSent) this.submitFinal();
    }
    // Drop selections of units that are gone.
    if (s && v.selected.size) for (const id of [...v.selected]) if (!s.armies.some((a) => a.id === id)) v.selected.delete(id);
    v.draw(s ?? this.preview ?? EMPTY, dt);
    this.uiT += dt;
    if (this.uiT > 0.25) {
      this.uiT = 0;
      this.bump();
    }
  };

  setSpeed(i: number) {
    this.speed = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.bump();
  }
  togglePause() {
    this.speed = this.speed === 0 ? 2 : 0;
    this.bump();
  }

  /* -------------------------------------------------------------- input */

  private pointers = new Map<number, { x: number; y: number }>();
  private downAt: { x: number; y: number; t: number; button: number; shift: boolean } | null = null;
  private moved = false;
  private pinch = 0;

  private local(e: PointerEvent) {
    const r = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    if (!this.view) return;
    this.canvas!.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.downAt = { ...p, t: performance.now(), button: e.button, shift: e.shiftKey };
      this.moved = false;
    } else {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      this.downAt = null;
      this.view.box = null;
    }
  };

  private onMove = (e: PointerEvent) => {
    const v = this.view;
    if (!v || !this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    const prev = this.pointers.get(e.pointerId)!;
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0) v.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.pinch);
      this.pinch = d;
      this.moved = true;
      return;
    }
    const down = this.downAt;
    if (!down) return;
    if (Math.hypot(p.x - down.x, p.y - down.y) > 6) this.moved = true;
    if (!this.moved) return;
    // Shift-drag (or a right-drag) draws a selection box; otherwise drag pans.
    if (down.shift && this.screen === "play") {
      v.box = { x0: down.x, y0: down.y, x1: p.x, y1: p.y };
      return;
    }
    v.cam.x -= (p.x - prev.x) / v.cam.zoom;
    v.cam.y -= (p.y - prev.y) / v.cam.zoom;
    v.clampCam();
  };

  private onUp = (e: PointerEvent) => {
    const v = this.view;
    if (!v) return;
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    const down = this.downAt;
    if (this.pointers.size === 0) this.pinch = 0;
    if (!down) return;
    this.downAt = null;
    if (v.box) {
      this.boxSelect(v.box);
      v.box = null;
      return;
    }
    if (this.moved) return;
    this.tap(p.x, p.y, down.button === 2, down.shift);
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.view) return;
    e.preventDefault();
    const p = { x: e.offsetX, y: e.offsetY };
    this.view.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0016));
  };

  private onKey = (e: KeyboardEvent) => {
    if (this.screen !== "play" || (e.target as HTMLElement)?.tagName === "INPUT") return;
    if (e.key === " ") {
      e.preventDefault();
      this.togglePause();
    } else if (e.key >= "1" && e.key <= "5") this.setSpeed(Number(e.key));
    else if (e.key === "Escape") {
      this.clearSelection();
      this.panel = null;
      this.city = null;
      this.inspect = null;
      this.targeting = null;
      this.bump();
    } else if (e.key === "Delete") this.disband();
  };

  /** A tap or click on the map. */
  tap(sx: number, sy: number, right = false, shift = false) {
    const v = this.view!;
    const s = this.s;
    const world = this.world!;
    const m = v.toMap(sx, sy);
    if (this.screen === "pick") {
      const ci = cityAt(world, m.x, m.y);
      if (ci >= 0) this.look(world.cities[ci].nation);
      return;
    }
    if (!s || this.screen !== "play") return;
    if (this.targeting) {
      const why = launch(s, world, s.player, this.targeting.kind, m.x, m.y);
      if (why) this.toast(why, "bad");
      else this.toast(this.targeting.kind === "nuke" ? "Warhead launched." : "Missile away.", "info");
      this.targeting = null;
      this.bump();
      return;
    }
    const hits = v.armiesAt(s, sx, sy).filter((a) => a.owner === s.player);
    // Right click (or a tap with units selected, on empty map) gives orders.
    if (right || (v.selected.size && !hits.length && !shift)) {
      if (!v.selected.size) return;
      this.orderTo(m.x, m.y);
      return;
    }
    if (hits.length) {
      if (!shift) v.selected.clear();
      // Tapping a stack picks it; tapping again cycles through stacks in the same place.
      const already = hits.findIndex((a) => v.selected.has(a.id));
      const next = hits[(already + 1) % hits.length];
      if (shift && v.selected.has(next.id)) v.selected.delete(next.id);
      else v.selected.add(next.id);
      this.city = null;
      v.selectedCity = -1;
      this.bump();
      return;
    }
    const ci = v.cityAt(sx, sy);
    if (ci >= 0) {
      this.openCity(ci);
      return;
    }
    this.clearSelection();
  }

  private boxSelect(b: { x0: number; y0: number; x1: number; y1: number }) {
    const v = this.view!;
    const s = this.s!;
    v.selected.clear();
    const x0 = Math.min(b.x0, b.x1);
    const x1 = Math.max(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1);
    const y1 = Math.max(b.y0, b.y1);
    for (const a of s.armies) {
      if (a.owner !== s.player || UNITS[a.kind].domain === "strike") continue;
      const p = v.toScreen(a.x, a.y);
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) v.selected.add(a.id);
    }
    this.bump();
  }

  orderTo(x: number, y: number) {
    const s = this.s!;
    const v = this.view!;
    const ids = [...v.selected];
    const why = act.order(s, this.world!, s.player, ids, x, y);
    if (why) this.toast(why, "bad");
    else v.ping = { x, y, t: 0, color: "#ffe066" };
    this.bump();
  }

  clearSelection() {
    const v = this.view;
    if (!v) return;
    v.selected.clear();
    v.selectedCity = -1;
    this.city = null;
    this.bump();
  }

  /** Open a panel (or close it with null); it replaces any card. */
  openPanel(p: PanelId | null) {
    this.panel = p;
    this.city = null;
    this.inspect = null;
    if (this.view) this.view.selectedCity = -1;
    this.bump();
  }
  togglePanel(p: PanelId) {
    this.openPanel(this.panel === p ? null : p);
  }

  /** Look at a nation's card (your own opens the Nation panel). */
  inspectNation(id: number | null) {
    if (id !== null && this.s && id === this.s.player) return this.openPanel("nation");
    this.panel = null;
    this.city = null;
    this.inspect = id;
    if (this.view) this.view.selectedCity = -1;
    this.bump();
  }

  cancelTarget() {
    this.targeting = null;
    this.bump();
  }

  backToTitle() {
    this.screen = "title";
    if (this.view) this.view.highlight = -1;
    this.bump();
  }

  setMapMode(m: MapView["mode"]) {
    if (this.view) this.view.mode = m;
    this.bump();
  }

  toggleAuto(list: "autoSell" | "autoBuy", k: ItemId) {
    const n = this.s!.nations[this.s!.player];
    n[list] = n[list].includes(k) ? n[list].filter((x) => x !== k) : [...n[list], k];
    this.bump();
  }

  openCity(ci: number) {
    const v = this.view!;
    this.panel = null;
    v.selected.clear();
    v.selectedCity = ci;
    this.city = ci;
    this.inspect = null;
    this.bump();
  }

  selectArmies(ids: number[], fly = true) {
    const v = this.view!;
    this.panel = null;
    this.inspect = null;
    v.selected = new Set(ids);
    this.city = null;
    v.selectedCity = -1;
    const a = this.s!.armies.find((x) => x.id === ids[0]);
    if (a && fly) v.focus(a.x, a.y, Math.max(v.cam.zoom, 1.4));
    this.bump();
  }

  get selection() {
    const v = this.view;
    const s = this.s;
    if (!v || !s) return [];
    return s.armies.filter((a) => v.selected.has(a.id));
  }

  flyTo(x: number, y: number, zoom?: number) {
    this.view?.focus(x, y, zoom);
    this.bump();
  }

  /* -------------------------------------------------------------- actions (with feedback) */

  /** Run an action; show why if it didn't work. */
  run(why: string | null | undefined, ok?: string) {
    if (why) this.toast(why, "bad");
    else if (ok) this.toast(ok, "good");
    this.bump();
    return !why;
  }

  stop() {
    act.stop(this.s!, this.s!.player, [...this.view!.selected]);
    this.bump();
  }
  split() {
    const [a] = this.selection;
    if (a) this.run(act.split(this.s!, this.s!.player, a.id));
  }
  merge() {
    this.run(act.merge(this.s!, this.s!.player, [...this.view!.selected]), "Merged");
  }
  disband() {
    if (!this.view?.selected.size) return;
    this.run(act.disband(this.s!, this.s!.player, [...this.view.selected]), "Disbanded");
    this.view.selected.clear();
  }

  aim(kind: "missile" | "nuke") {
    this.targeting = { kind };
    this.panel = null;
    this.toast(kind === "nuke" ? "Tap a target city. This cannot be undone." : "Tap a target: an army or a city.", "info");
    this.bump();
  }

  reply(offerId: number, yes: boolean) {
    this.run(answer(this.s!, this.world!, offerId, yes));
  }

  toast(text: string, kind: Toast["kind"] = "info") {
    const id = ++this.toastId;
    this.toasts = [...this.toasts.slice(-3), { id, text, kind }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.bump();
    }, 4200);
    this.bump();
  }

  /* -------------------------------------------------------------- saving and the score */

  persist() {
    const s = this.s;
    if (!s || s.over) return;
    try {
      localStorage.setItem(SAVE_KEY, save(s));
    } catch {}
  }

  quitToTitle() {
    this.persist();
    this.submitFinal();
    this.s = null;
    this.screen = "title";
    this.panel = null;
    this.city = null;
    this.inspect = null;
    this.bump();
  }

  /** Give up: the game ends with today's score. */
  resign() {
    const s = this.s;
    if (!s || s.over) return;
    s.over = { reason: "You stepped down.", score: score(s) };
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    this.submitFinal();
    this.bump();
  }

  submitFinal() {
    const s = this.s;
    if (!s || this.finalSent) return;
    if (!s.over && s.day < 30) return;
    this.finalSent = true;
    this.report.final(s.over ? s.over.score || score(s) : score(s));
  }
}

const EMPTY: State = {
  version: 1,
  seed: 0,
  rng: 0,
  day: 0,
  player: -1,
  difficulty: "normal",
  nations: [],
  cities: [],
  armies: [],
  wars: [],
  alliances: [],
  rel: [],
  price: {} as State["price"],
  flow: {} as State["flow"],
  news: [],
  strikes: [],
  offers: [],
  nextId: 0,
  over: null,
  formed: {},
};
