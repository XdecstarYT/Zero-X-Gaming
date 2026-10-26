/**
 * The controller: owns the city and the 3D view, runs the clock, turns taps, drags, pinches and
 * clicks into the planner's tools (roads, zoning, upzoning, designing, transit, civic, bulldozing),
 * saves as you go, and tells the React interface when to redraw.
 */
import * as THREE from "three";
import * as act from "./actions";
import { BANDS, MONTH_SECONDS, PREFS_KEY, ROADS, SAVE_KEY, USES, type CivicKind, type Pattern, type RoadKind, type Rules, type Use } from "./data";
import { footprint, planStats, zoning } from "./design";
import { districtRect } from "./world";
import { bbox, inObb, nearestOn, smooth, type Pts } from "./geom";
import { patternQuote } from "./actions";
import { lotObb, lotRow, nearestEdge, roadClears, roadCost, roadHalf } from "./roads";
import { advance, load, prepare, save, score } from "./sim";
import { ix, type Application, type Building, type Plan, type State } from "./state";
import { newCity } from "./world";
import * as pol from "./politics";
import { newWorld } from "./showcase";
import type { Ask, CampaignKind } from "./politics";
import type { Axis, BillKind, GroupId, PolSettings, PromiseKind, WorldSettings } from "./poltypes";
import { View, pickQuality, type Quality } from "./render/view";
import { heightOf } from "./render/chunks";

export type Screen = "title" | "setup" | "play";
export type TitlePanel = null | "changelog" | "settings";
export type SetupStep = "politics" | "world" | "party";
export type PolTab = "campaign" | "promises" | "groups" | "opposition" | "parliament" | "polls";
export type Tool = "inspect" | "road" | "zone" | "upzone" | "design" | "transit" | "civic" | "bulldoze";
export type Panel = null | "city" | "agenda" | "district" | "building" | "design" | "help" | "politics";
export type TransitTool = "bike" | "tram" | "avenue" | "street";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "good" | "bad" | "tip";
  app?: number;
}

export interface Pending {
  kind: "zone" | "upzone";
  poly: Pts;
  obb: { x: number; z: number; ux: number; uz: number; hw: number; hd: number };
  cost: number;
  lines: Pts[];
  homes: number;
}

export const SPEEDS = [0, 1, 2, 4];

export class Game {
  s: State | null = null;
  view: View | null = null;
  screen: Screen = "title";
  quality: Quality = "medium";
  speed = 1;
  paused = false;
  tool: Tool = "inspect";
  panel: Panel = null;
  roadKind: RoadKind = "street";
  curve = false;
  zoneUse: Use = "homes";
  zoneBand = 1;
  pattern: Pattern | "none" = "grid";
  zoneRules: Rules = { parking: 1, corner: true, affordable: 0, merge: true };
  /** Angle of the zoning rectangle (snapped to the road it starts near). */
  zoneAngle = 0;
  transitTool: TransitTool = "bike";
  civicKind: CivicKind = "park";
  selBuilding = -1;
  selDistrict = -1;
  selEdge = -1;
  /** The building design open in the designer. */
  design: Plan | null = null;
  /** Application being looked at (its ghost on the map). */
  viewingApp = -1;
  pending: Pending | null = null;
  /** A road being drawn: the points tapped so far, and the live end. */
  roadPts: { x: number; z: number }[] = [];
  roadEnd: { x: number; z: number } | null = null;
  roadQuote: { cost: number; homes: number; ok: string | null } | null = null;
  toasts: Toast[] = [];
  version = 0;
  activeMs = 0;
  loading = 0;
  private listeners = new Set<() => void>();
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private last = 0;
  private uiT = 0;
  private saveT = 0;
  private toastId = 0;
  private finalSent = false;
  private newsSeen = 0;

  constructor(private report: { progress: (n: number) => void; final: (n: number) => void }) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  bump() {
    this.version++;
    for (const l of this.listeners) l();
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
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { quality?: Quality; autosave?: boolean };
      this.quality = p.quality ?? pickQuality();
      if (p.autosave === false) this.autosave = false;
    } catch {
      this.quality = pickQuality();
    }
    this.view = new View(canvas, this.quality);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    // The title shows the village, turning slowly.
    this.s = prepare(newCity(1));
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    const c = this.canvas;
    if (c) {
      c.removeEventListener("pointerdown", this.onDown);
      c.removeEventListener("pointermove", this.onMove);
      c.removeEventListener("pointerup", this.onUp);
      c.removeEventListener("pointercancel", this.onUp);
      c.removeEventListener("wheel", this.onWheel);
    }
    this.view?.dispose();
    this.view = null;
  }

  dispose() {
    this.persist();
    this.submitFinal();
  }

  /* -------------------------------------------------------------- menus and the new-world setup */

  titlePanel: TitlePanel = null;
  step: SetupStep = "politics";
  draft = {
    pol: pol.defaultPolSettings(),
    world: { name: "XCity", seed: Math.floor(Math.random() * 1e6), start: "village", pace: "normal", money: "normal", politics: true } as WorldSettings,
    party: { ...pol.PARTY_PRESETS[0], pos: { ...pol.PARTY_PRESETS[0].pos } } as pol.PartyDraft,
    seat: 0,
    /** The preset the party was started from (it won't also stand against you). */
    basedOn: 0,
  };
  autosave = true;

  openTitlePanel(p: TitlePanel) {
    this.titlePanel = this.titlePanel === p ? null : p;
    this.bump();
  }

  /** Start setting up a new world (politics, then the world, then your party). */
  startSetup() {
    this.screen = "setup";
    this.step = "politics";
    this.titlePanel = null;
    this.draft.world = { ...this.draft.world, seed: Math.floor(Math.random() * 1e6) };
    this.bump();
  }

  setStep(step: SetupStep) {
    this.step = step;
    this.bump();
  }

  editSetup(patch: { pol?: Partial<PolSettings>; world?: Partial<WorldSettings>; party?: Partial<pol.PartyDraft>; seat?: number }) {
    const d = this.draft;
    if (patch.pol) d.pol = { ...d.pol, ...patch.pol };
    if (patch.world) d.world = { ...d.world, ...patch.world };
    if (patch.party) d.party = { ...d.party, ...patch.party, pos: { ...d.party.pos, ...(patch.party.pos ?? {}) } };
    if (patch.seat !== undefined) d.seat = patch.seat;
    d.seat = Math.min(d.seat, d.pol.electorates - 1);
    this.bump();
  }

  /** Start the party from one of the presets. */
  usePreset(i: number) {
    const x = pol.PARTY_PRESETS[i];
    this.draft.party = { name: x.name, short: x.short, color: x.color, icon: x.icon, leader: this.draft.party.leader || x.leader, pos: { ...x.pos } };
    this.draft.basedOn = i;
    this.bump();
  }

  /** Build the world from the setup and begin (ten weeks out from the election, with politics on). */
  beginWorld() {
    const d = this.draft;
    const s = newWorld(d.world);
    const party = { ...d.party, name: d.party.name.trim() || "My Party", short: (d.party.short.trim() || d.party.name.slice(0, 3)).toUpperCase().slice(0, 4), leader: d.party.leader.trim() || "You" };
    if (d.world.politics) pol.newPolitics(s, d.pol, party, d.seat, d.basedOn);
    this.s = s;
    this.start();
    if (s.pol) {
      this.panel = "politics";
      this.polTab = "campaign";
      this.toast(`${party.leader}, the campaign starts now: ${d.pol.campaignWeeks} weeks to win ${s.pol.electorates[s.pol.seat].name}, and the city.`, "tip");
      this.refreshOverlay();
    } else this.toast("You've been hired to plan it all. Zone some homes: tap Zone and drag over the fields.", "tip");
    this.bump();
  }

  newGame(seed = Math.floor(Math.random() * 1e6)) {
    this.draft.world = { ...this.draft.world, seed, politics: false };
    this.beginWorld();
  }

  continueGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const s = raw ? load(raw) : null;
      if (!s) {
        this.toast("That save couldn't be read.", "bad");
        return;
      }
      this.s = s;
      this.start();
    } catch {
      this.toast("That save couldn't be read.", "bad");
    }
  }

  private start() {
    this.screen = "play";
    this.finalSent = false;
    this.tool = "inspect";
    this.panel = null;
    this.speed = 1;
    this.paused = false;
    this.newsSeen = this.s!.news.length ? this.s!.news[0].month * 1000 + this.s!.news.length : 0;
    this.view?.rig.fly({ target: new THREE.Vector3(0, 0, 200), dist: 620, pitch: 0.8 });
    this.bump();
  }

  quitToTitle() {
    this.persist();
    this.submitFinal();
    this.screen = "title";
    this.panel = null;
    this.tool = "inspect";
    this.clearDrafts();
    this.bump();
  }

  setQuality(q: Quality) {
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, quality: q }));
    } catch {}
    this.toast("Graphics change after a reload.");
  }

  /* -------------------------------------------------------------- the loop */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const s = this.s;
    const v = this.view;
    if (!s || !v) return;
    if (document.hidden) return;
    // During a campaign the clock moves a week at a time, when you end the week.
    if (this.screen === "play" && !this.paused && this.speed > 0 && !s.pol?.campaign && !s.pol?.night) {
      const before = s.month;
      advance(s, (dt * SPEEDS[this.speed]) / MONTH_SECONDS);
      this.activeMs += dt * 1000;
      if (s.month !== before) this.onMonth();
      if (s.pol?.campaign) {
        this.panel = "politics";
        this.polTab = "campaign";
        this.toast(`The campaign is on: ${s.pol.settings.campaignWeeks} weeks to election day.`, "tip");
        this.refreshOverlay();
      }
    } else if (this.screen === "title") {
      v.rig.goal.yaw += dt * 0.04;
    }
    v.frame(s, dt, now);
    if (!v.ready) {
      const p = v.progress;
      if (Math.abs(p - this.loading) > 0.02) {
        this.loading = p;
        this.bump();
      }
    } else if (this.loading < 1) {
      this.loading = 1;
      this.bump();
    }
    this.uiT += dt;
    if (this.uiT > 0.5) {
      this.uiT = 0;
      this.bump();
    }
    this.saveT += dt;
    if (this.saveT > 45 && this.screen === "play" && this.autosave) {
      this.saveT = 0;
      this.persist();
    }
  };

  private onMonth() {
    const s = this.s!;
    // Fresh news as toasts (applications get a Review button).
    const fresh = s.news.filter((n) => n.month === s.month).slice(0, 3);
    for (const n of fresh.reverse()) {
      const app = n.text.startsWith("New application") ? s.apps[s.apps.length - 1]?.id : undefined;
      this.toast(n.text, n.kind, app);
    }
    this.report.progress(score(s));
    this.refreshGhost();
    const P = s.pol;
    if (P?.federal.sitting && !this.sittingSeen && pol.hasSeat(P)) {
      this.sittingSeen = true;
      this.toast("Parliament is sitting: there's a vote, and Question Time.", "tip");
    }
    if (P && !P.federal.sitting) this.sittingSeen = false;
  }

  private sittingSeen = false;

  /* -------------------------------------------------------------- input */

  private pointers = new Map<number, { x: number; y: number }>();
  private downAt: { x: number; y: number; t: number; button: number; world: { x: number; z: number } | null } | null = null;
  private moved = false;
  private pinch = 0;
  private twist = 0;
  private dragging = false;

  private local(e: PointerEvent | WheelEvent) {
    const r = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Tools that draw with a one-finger drag (two fingers still move the camera). */
  private get drawsOnDrag() {
    return this.screen === "play" && (this.tool === "zone" || this.tool === "upzone" || this.tool === "road");
  }

  private onDown = (e: PointerEvent) => {
    const v = this.view;
    if (!v) return;
    this.canvas!.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.downAt = { ...p, t: performance.now(), button: e.button, world: v.groundAt(p.x, p.y) };
      this.moved = false;
      this.dragging = false;
    } else {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      this.twist = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.dragging) this.cancelDrag();
      this.downAt = null;
    }
  };

  private onMove = (e: PointerEvent) => {
    const v = this.view;
    if (!v) return;
    const p = this.local(e);
    if (!this.pointers.has(e.pointerId)) {
      // Hovering with a mouse: the road being drawn follows it.
      if (this.tool === "road" && this.roadPts.length && e.pointerType === "mouse") this.setRoadEnd(v.groundAt(p.x, p.y));
      return;
    }
    const prev = this.pointers.get(e.pointerId)!;
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.pinch > 0) {
        const g = v.groundAt((a.x + b.x) / 2, (a.y + b.y) / 2);
        v.rig.zoom(this.pinch / d, g ? new THREE.Vector3(g.x, 0, g.z) : null);
        v.rig.goal.yaw -= ang - this.twist;
        // Two fingers moving together pan (or tilt, if they move up and down together).
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const pm = { x: (prev.x + (e.pointerId === [...this.pointers.keys()][0] ? b.x : a.x)) / 2, y: (prev.y + (e.pointerId === [...this.pointers.keys()][0] ? b.y : a.y)) / 2 };
        v.rig.pan(mid.x - pm.x, mid.y - pm.y, v.renderer.domElement.clientHeight, v.camera.fov);
      }
      this.pinch = d;
      this.twist = ang;
      this.moved = true;
      return;
    }
    const down = this.downAt;
    if (!down) return;
    if (Math.hypot(p.x - down.x, p.y - down.y) > 7) this.moved = true;
    if (!this.moved) return;
    if (down.button === 2 || (down.button === 0 && e.altKey)) {
      v.rig.rotate(p.x - prev.x, p.y - prev.y);
      return;
    }
    if (this.drawsOnDrag && down.world) {
      this.dragging = true;
      const w = v.groundAt(p.x, p.y);
      if (!w) return;
      if (this.tool === "road") {
        if (!this.roadPts.length) this.roadPts = [this.snap(down.world)];
        this.setRoadEnd(w);
      } else this.dragArea(down.world, w);
      return;
    }
    v.rig.pan(p.x - prev.x, p.y - prev.y, v.renderer.domElement.clientHeight, v.camera.fov);
  };

  private onUp = (e: PointerEvent) => {
    const v = this.view;
    if (!v) return;
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.pinch = 0;
    const down = this.downAt;
    if (!down) return;
    this.downAt = null;
    if (this.dragging) {
      this.dragging = false;
      if (this.tool === "road") this.commitRoad();
      else this.endArea();
      return;
    }
    if (this.moved) return;
    this.tap(p.x, p.y, down.button === 2);
  };

  private onWheel = (e: WheelEvent) => {
    const v = this.view;
    if (!v) return;
    e.preventDefault();
    const p = this.local(e);
    const g = v.groundAt(p.x, p.y);
    v.rig.zoom(Math.exp(e.deltaY * 0.0012), g ? new THREE.Vector3(g.x, 0, g.z) : null);
  };

  private onKey = (e: KeyboardEvent) => {
    if (this.screen !== "play" || (e.target as HTMLElement)?.tagName === "INPUT") return;
    const v = this.view;
    if (e.key === " ") {
      e.preventDefault();
      this.togglePause();
    } else if (e.key >= "1" && e.key <= "3") this.setSpeed(Number(e.key));
    else if (e.key === "Escape") this.escape();
    else if (v && (e.key === "q" || e.key === "e")) v.rig.goal.yaw += e.key === "q" ? 0.2 : -0.2;
    else if (v && ["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      const k = { w: [0, 60], ArrowUp: [0, 60], s: [0, -60], ArrowDown: [0, -60], a: [60, 0], ArrowLeft: [60, 0], d: [-60, 0], ArrowRight: [-60, 0] }[e.key]!;
      v.rig.pan(k[0], k[1], v.renderer.domElement.clientHeight, v.camera.fov);
    }
  };

  escape() {
    this.clearDrafts();
    this.panel = null;
    this.design = null;
    this.selBuilding = -1;
    this.selDistrict = -1;
    this.selEdge = -1;
    this.viewingApp = -1;
    this.refreshOverlay();
    this.bump();
  }

  /* -------------------------------------------------------------- tools */

  setTool(t: Tool) {
    if (t !== "inspect" && this.s && !pol.canPlan(this.s)) {
      this.toast(`${this.s.pol!.parties[this.s.pol!.government].name} runs the city. Win an election to plan it.`, "bad");
      return;
    }
    this.clearDrafts();
    this.tool = t;
    this.design = null;
    if (this.panel === "design" || this.panel === "building") this.panel = null;
    this.selBuilding = -1;
    this.refreshOverlay();
    this.bump();
  }

  private clearDrafts() {
    this.roadPts = [];
    this.roadEnd = null;
    this.roadQuote = null;
    this.pending = null;
    this.view?.overlay.draftRoad(null, 0, true);
    this.view?.overlay.draftArea(null, "#fff");
  }

  private cancelDrag() {
    this.dragging = false;
    this.clearDrafts();
  }

  /** Snap a point to a junction, or onto a road, when close. */
  private snap(p: { x: number; z: number }) {
    const s = this.s!;
    const r = act.snapPoint(s, p.x, p.z);
    if (r.node >= 0) return { x: r.x, z: r.z };
    const e = nearestEdge(s, p.x, p.z, 10);
    return e ? { x: e.x, z: e.z } : p;
  }

  private roadLine(): Pts {
    const pts = [...this.roadPts, ...(this.roadEnd ? [this.roadEnd] : [])];
    const flat = pts.flatMap((p) => [p.x, p.z]);
    return this.curve && pts.length >= 3 ? smooth(flat, 8) : flat;
  }

  private setRoadEnd(w: { x: number; z: number } | null) {
    if (!w || !this.s) return;
    let end = this.snap(w);
    // Hold straight lines straight: snap to 15° steps from the start.
    const a = this.roadPts[this.roadPts.length - 1];
    if (a && !this.curve) {
      const ang = Math.atan2(end.z - a.z, end.x - a.x);
      const step = Math.PI / 12;
      const sn = Math.round(ang / step) * step;
      if (Math.abs(sn - ang) < 0.05) {
        const l = Math.hypot(end.x - a.x, end.z - a.z);
        end = { x: a.x + Math.cos(sn) * l, z: a.z + Math.sin(sn) * l };
      }
    }
    this.roadEnd = end;
    const line = this.roadLine();
    if (line.length >= 4) {
      const cost = roadCost(this.s, line, this.roadKind);
      const why = this.s.money < cost ? "Not enough money" : act.canRoad(this.s, this.roadKind) ? null : `Unlocks at ${ROADS[this.roadKind].unlock.toLocaleString()} people`;
      this.roadQuote = { cost, homes: roadClears(this.s, line, this.roadKind).homes, ok: why };
      this.view?.overlay.draftRoad(line, roadHalf(this.roadKind) * 2, !why);
    }
    this.bump();
  }

  /** Lay the road drawn so far. */
  commitRoad() {
    const s = this.s;
    if (!s) return;
    const line = this.roadLine();
    if (line.length < 4) return;
    const r = act.buildRoad(s, line, this.roadKind);
    if (!r.ok) this.toast(r.why, "bad");
    else this.toast(`Built for $${fmt(r.cost)}${r.loss.homes ? `. ${r.loss.homes} homes knocked down.` : "."}`, r.loss.homes ? "bad" : "good");
    this.clearDrafts();
    this.bump();
  }

  private dragArea(a: { x: number; z: number }, b: { x: number; z: number }) {
    const s = this.s!;
    if (!this.dragging || !this.pending || this.pending.poly.length === 0) {
      // Line the rectangle up with the nearest road where the drag starts.
      const e = nearestEdge(s, a.x, a.z, 120);
      if (e) {
        const ed = s.edges[e.id]!;
        const q = nearestOn(ed.pts, a.x, a.z);
        const i = q.seg * 2;
        this.zoneAngle = Math.atan2(ed.pts[i + 3] - ed.pts[i + 1], ed.pts[i + 2] - ed.pts[i]);
      } else this.zoneAngle = 0;
    }
    const r = districtRect(a.x, a.z, b.x, b.z, this.zoneAngle);
    const col = this.tool === "upzone" ? "#f5b52e" : USES[this.zoneUse].color;
    let lines: Pts[] = [];
    let cost = 0;
    if (this.tool === "zone" && this.pattern !== "none" && r.obb.hw > 40 && r.obb.hd > 40) {
      const q = patternQuote(s, r.obb, this.pattern);
      lines = q.roads.map((x) => x.pts);
      cost = q.cost;
    }
    this.pending = { kind: this.tool === "upzone" ? "upzone" : "zone", poly: r.poly, obb: r.obb, cost, lines, homes: 0 };
    this.view?.overlay.draftArea(r.poly, col, lines);
    this.bump();
  }

  private endArea() {
    if (!this.pending) return;
    if (this.pending.obb.hw < 15 || this.pending.obb.hd < 15) {
      this.clearDrafts();
      this.bump();
      return;
    }
    // Keep it on the map until the planner confirms.
    this.bump();
  }

  /** Confirm the zoning (and street pattern) or upzone being drawn. */
  confirmArea() {
    const s = this.s;
    const p = this.pending;
    if (!s || !p) return;
    if (p.kind === "upzone") {
      const r = act.upzone(s, p.poly);
      if (!r.ok) this.toast(r.why, "bad");
      else this.toast(`Upzoned to ${BANDS[r.band].label}. Developers will notice.`, "good");
    } else if (this.pattern !== "none") {
      const r = act.layOut(s, p.obb, p.poly, this.pattern, this.zoneUse, this.zoneBand, this.zoneRules);
      if (!r.ok) this.toast(r.why, "bad");
      else {
        this.toast(`${r.roads} streets laid for $${fmt(r.cost)} and the area zoned.`, "good");
        this.selDistrict = r.district;
      }
    } else {
      const r = act.zoneDistrict(s, p.poly, this.zoneUse, this.zoneBand, this.zoneRules);
      if (!r.ok) this.toast(r.why, "bad");
      else {
        this.toast(`Zoned for ${USES[this.zoneUse].name.toLowerCase()}, ${BANDS[this.zoneBand].label}.`, "good");
        this.selDistrict = r.id;
      }
    }
    this.clearDrafts();
    this.refreshOverlay();
    this.bump();
  }

  cancelArea() {
    this.clearDrafts();
    this.bump();
  }

  /** A tap (or click) on the map. */
  tap(sx: number, sy: number, right = false) {
    const s = this.s;
    const v = this.view;
    if (!s || !v || this.screen !== "play") return;
    const w = v.groundAt(sx, sy);
    if (right) {
      this.escape();
      return;
    }
    switch (this.tool) {
      case "road": {
        if (!w) return;
        const p = this.snap(w);
        if (!this.roadPts.length) {
          this.roadPts = [p];
          this.roadEnd = null;
          this.toast(this.curve ? "Tap a bend, then the end." : "Now tap where it ends.");
        } else if (this.curve && this.roadPts.length === 1) {
          this.roadPts.push(p);
          this.setRoadEnd(p);
        } else {
          this.roadEnd = p;
          this.commitRoad();
        }
        this.bump();
        return;
      }
      case "design": {
        const lot = this.lotAt(w);
        if (lot < 0) return this.toast("Tap a plot beside a road.");
        this.openDesigner(lot);
        return;
      }
      case "civic": {
        const lot = this.lotAt(w);
        if (lot < 0) return this.toast("Tap a plot beside a road.");
        const r = act.placeCivic(s, this.civicKind, lot);
        if (!r.ok) this.toast(r.why, "bad");
        else this.toast("Work has started.", "good");
        this.bump();
        return;
      }
      case "transit": {
        if (!w) return;
        const e = nearestEdge(s, w.x, w.z, 18);
        if (!e) return this.toast("Tap a road.");
        const ed = s.edges[e.id]!;
        const ch = this.transitTool === "bike" ? { bike: !ed.bike } : this.transitTool === "tram" ? { tram: !ed.tram, kind: "avenue" as RoadKind } : this.transitTool === "avenue" ? { kind: "avenue" as RoadKind } : { kind: "street" as RoadKind, tram: false };
        const r = act.upgradeRoad(s, e.id, ch);
        if (!r.ok) this.toast(r.why, "bad");
        else this.toast(`${ed.name}: done for $${fmt(r.cost)}${r.loss.homes ? `, ${r.loss.homes} homes lost` : ""}.`, "good");
        this.bump();
        return;
      }
      case "bulldoze": {
        const b = v.buildingAt(s, sx, sy);
        if (b) {
          const r = act.bulldozeBuilding(s, b.id);
          if (!r.ok) this.toast(r.why, "bad");
          else this.toast(`${b.name} knocked down for $${fmt(r.cost)}.`);
          this.bump();
          return;
        }
        if (!w) return;
        const e = nearestEdge(s, w.x, w.z, 12);
        if (e) {
          const r = act.bulldozeRoad(s, e.id);
          if (r.ok) this.toast(`Road removed${r.loss.homes ? `, ${r.loss.homes} homes lost` : ""}.`);
        }
        this.bump();
        return;
      }
      case "zone":
      case "upzone":
        return;
      default: {
        if (s.pol && this.panel === "politics" && w) {
          this.selElectorate = pol.electorateAt(s.pol, w.x, w.z);
          this.refreshOverlay();
          this.bump();
          return;
        }
        const b = v.buildingAt(s, sx, sy);
        if (b) {
          this.selBuilding = b.id;
          this.panel = "building";
          this.refreshOverlay();
          this.bump();
          return;
        }
        if (w) {
          const lot = this.lotAt(w);
          const l = lot >= 0 ? s.lots[lot]! : null;
          const d = l && l.district >= 0 ? l.district : districtAtPoint(s, w.x, w.z);
          if (d >= 0) {
            this.selDistrict = d;
            this.selBuilding = -1;
            this.panel = "district";
            this.refreshOverlay();
            this.bump();
            return;
          }
        }
        this.escape();
      }
    }
  }

  /** The lot under a ground point (or -1). */
  lotAt(w: { x: number; z: number } | null) {
    const s = this.s;
    if (!s || !w) return -1;
    for (const id of ix(s).lots.query(w.x - 1, w.z - 1, w.x + 1, w.z + 1)) {
      const l = s.lots[id];
      if (l && inObb(lotObb(l), w.x, w.z, 0.5)) return id;
    }
    return -1;
  }

  /* -------------------------------------------------------------- the designer */

  openDesigner(lot: number, lots = 1) {
    const s = this.s!;
    const l = s.lots[lot]!;
    const z = zoning(s, l);
    const b = l.bld >= 0 ? s.buildings[l.bld] : null;
    const n = b ? Math.max(lots, b.lots.length) : z.max >= 8 ? 3 : z.max >= 4 ? 2 : lots;
    const plan = act.draftPlan(s, b ? b.lots[0] : lot, n);
    if (plan.storeys < 4 && plan.lots.length > 1) plan.storeys = 4;
    plan.name = b?.city ? b.name : "";
    this.design = plan;
    this.panel = "design";
    this.selBuilding = -1;
    this.refreshGhost();
    this.view?.focus(l.x, l.z, 260);
    this.bump();
  }

  /** Change the design being drawn up. */
  editDesign(patch: Partial<Plan> & { width?: number }) {
    const s = this.s;
    if (!s || !this.design) return;
    const d = { ...this.design, ...patch };
    if (patch.width !== undefined) {
      const row = lotRow(s, this.design.lots[0], Math.max(1, Math.min(4, patch.width)));
      d.lots = row;
    }
    if (d.storeys > 4 && d.style === "timber") d.style = "brick";
    d.storeys = Math.max(1, Math.min(60, d.storeys));
    delete (d as { width?: number }).width;
    this.design = d;
    this.refreshGhost();
    this.bump();
  }

  designStats() {
    return this.s && this.design ? act.checkDesign(this.s, this.design) : null;
  }

  build() {
    const s = this.s;
    if (!s || !this.design) return;
    const plan = { ...this.design, name: this.design.name || "" };
    const r = act.commission(s, plan);
    if (!r.ok) return this.toast(r.why, "bad");
    this.toast(`${s.buildings[r.id]!.name}: built in about ${r.st.months} months.`, "good");
    this.design = null;
    this.panel = null;
    this.refreshGhost();
    this.bump();
  }

  closeDesigner() {
    this.design = null;
    if (this.panel === "design") this.panel = null;
    this.refreshGhost();
    this.bump();
  }

  /* -------------------------------------------------------------- applications */

  review(id: number) {
    this.panel = "agenda";
    this.viewApp(id);
  }

  viewApp(id: number) {
    const s = this.s;
    if (!s) return;
    const a = s.apps.find((x) => x.id === id);
    this.viewingApp = a ? id : -1;
    if (a) {
      const l = s.lots[a.plan.lots[0]];
      if (l) this.view?.focus(l.x, l.z, 420);
    }
    this.refreshGhost();
    this.bump();
  }

  decide(id: number, yes: boolean) {
    const s = this.s;
    if (!s) return;
    const r = act.decide(s, id, yes);
    this.toast(r.ok ? r.msg : r.why, r.ok ? (yes ? "good" : "info") : "bad");
    if (this.viewingApp === id) this.viewingApp = -1;
    this.refreshGhost();
    this.bump();
  }

  terms(id: number, t: act.Term) {
    const s = this.s;
    if (!s) return;
    const r = act.changeTerms(s, id, t);
    this.toast(r.ok ? r.msg : r.why, r.ok ? (r.walked ? "bad" : "good") : "bad");
    this.refreshGhost();
    this.bump();
  }

  /** Show the volume of whatever's being proposed: the design open, or an application. */
  refreshGhost() {
    const v = this.view;
    const s = this.s;
    if (!v || !s) return;
    let plan: Plan | null = this.design;
    let col = "#5fd1ff";
    if (!plan && this.viewingApp >= 0) {
      const a = s.apps.find((x) => x.id === this.viewingApp);
      plan = a?.plan ?? null;
      col = "#f5b52e";
      if (!a) this.viewingApp = -1;
    }
    if (!plan || plan.lots.some((id) => !s.lots[id])) {
      v.overlay.ghost(null);
      return;
    }
    const st = planStats(s, plan);
    const fp = footprint(s, plan.lots, st.form);
    v.overlay.ghost({ ...fp, h: heightOf({ form: st.form, use: plan.use, storeys: plan.storeys }), color: col });
  }

  /** Update the district tints and the selection outline. */
  refreshOverlay() {
    const v = this.view;
    const s = this.s;
    if (!v || !s) return;
    const zoning = this.tool === "zone" || this.tool === "upzone";
    v.overlay.districts(s, zoning, this.panel === "district" ? this.selDistrict : -1);
    v.overlay.electorates(s.pol && (this.panel === "politics" || s.pol.night) ? s.pol : null, this.selElectorate);
    const b = this.selBuilding >= 0 ? s.buildings[this.selBuilding] : null;
    v.overlay.select(b ? { x: b.x, z: b.z, ux: b.ux, uz: b.uz, hw: b.hw, hd: b.hd, h: heightOf(b) } : null);
  }

  /* -------------------------------------------------------------- districts */

  editDistrict(patch: Parameters<typeof act.updateDistrict>[2]) {
    const s = this.s;
    if (!s || this.selDistrict < 0) return;
    const r = act.updateDistrict(s, this.selDistrict, patch);
    if (!r.ok) this.toast(r.why, "bad");
    this.refreshOverlay();
    this.bump();
  }

  removeDistrict() {
    const s = this.s;
    if (!s || this.selDistrict < 0) return;
    act.removeDistrict(s, this.selDistrict);
    this.selDistrict = -1;
    this.panel = null;
    this.refreshOverlay();
    this.bump();
  }

  /** Use a district's zoning for the next area drawn. */
  copyDistrict(id: number) {
    const d = this.s?.districts[id];
    if (!d) return;
    this.zoneUse = d.use;
    this.zoneBand = d.band;
    this.zoneRules = { ...d.rules };
    this.pattern = d.pattern ?? "none";
    this.panel = null;
    this.setTool("zone");
    this.toast(`Copied ${d.name}. Drag to zone another area like it.`, "tip");
  }

  setZone(patch: Partial<{ use: Use; band: number; pattern: Pattern | "none"; rules: Partial<Rules> }>) {
    if (patch.use) {
      this.zoneUse = patch.use;
      if (!USES[patch.use].bands.includes(this.zoneBand)) this.zoneBand = USES[patch.use].bands[0];
    }
    if (patch.band !== undefined) this.zoneBand = patch.band;
    if (patch.pattern) this.pattern = patch.pattern;
    if (patch.rules) this.zoneRules = { ...this.zoneRules, ...patch.rules };
    this.bump();
  }

  /* -------------------------------------------------------------- politics */

  polTab: PolTab = "campaign";
  selElectorate = -1;

  selectElectorate(id: number) {
    this.selElectorate = this.selElectorate === id ? -1 : id;
    const e = this.s?.pol?.electorates[id];
    if (e && this.selElectorate === id) this.view?.focus(e.x, e.z, 1500);
    this.refreshOverlay();
    this.bump();
  }

  setAutosave(on: boolean) {
    this.autosave = on;
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, autosave: on }));
    } catch {}
    this.bump();
  }

  deleteSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    this.toast("Saved world deleted.");
    this.bump();
  }

  setPolTab(t: PolTab) {
    this.polTab = t;
    this.panel = "politics";
    this.refreshOverlay();
    this.bump();
  }

  private polRes(r: pol.Res) {
    this.toast(r.ok ? r.msg : r.why, r.ok ? "good" : "bad");
    this.refreshOverlay();
    this.bump();
  }

  endWeek() {
    const s = this.s;
    if (!s?.pol?.campaign) return;
    const before = s.month;
    const r = pol.endWeek(s);
    if (s.month !== before) this.onMonth();
    if (r) this.toast("The polls have closed. Election night!", "tip");
    this.refreshOverlay();
    this.bump();
  }

  campaign(kind: CampaignKind, e = this.selElectorate) {
    if (this.s) this.polRes(pol.campaign(this.s, kind, e));
  }

  promise(kind: PromiseKind, e = this.selElectorate) {
    if (this.s) this.polRes(pol.promise(this.s, kind, e));
  }

  lobby(g: GroupId) {
    if (this.s) this.polRes(pol.lobbyGroup(this.s, g));
  }

  debate(stance: -1 | 0 | 1) {
    if (this.s) this.polRes(pol.answerDebate(this.s, stance));
  }

  protest(id: number) {
    if (this.s) this.polRes(pol.protest(this.s, id));
  }

  askCityHall(a: Ask) {
    if (this.s) this.polRes(pol.lobbyGovernment(this.s, a));
  }

  voteBill(id: number, v: "yes" | "no" | "abstain") {
    if (this.s) this.polRes(pol.vote(this.s, id, v));
  }

  question(topic: Axis) {
    if (this.s) this.polRes(pol.askQuestion(this.s, topic));
  }

  propose(kind: BillKind) {
    if (this.s) this.polRes(pol.proposeBill(this.s, kind));
  }

  closeNight() {
    const s = this.s;
    if (!s?.pol) return;
    const P = s.pol;
    pol.closeNight(s);
    if (P.role === "govern") this.toast("You run the city now. The planning tools are yours: zone, upzone, design, build.", "good");
    else if (P.role === "opposition") this.toast("Another party runs the city. Hold them to account: protest, lobby and get ready for next time.", "info");
    else this.toast("You lost your seat. Your party fights on from outside parliament.", "bad");
    this.panel = null;
    this.tool = "inspect";
    this.refreshOverlay();
    this.bump();
  }

  /* -------------------------------------------------------------- misc */

  setRoadKind(k: RoadKind) {
    this.roadKind = k;
    this.clearDrafts();
    this.bump();
  }

  toggleCurve() {
    this.curve = !this.curve;
    this.clearDrafts();
    this.bump();
  }

  setTransitTool(t: TransitTool) {
    this.transitTool = t;
    this.bump();
  }

  setCivic(k: CivicKind) {
    this.civicKind = k;
    this.bump();
  }

  showDistrict(id: number) {
    this.selDistrict = id;
    this.panel = "district";
    this.refreshOverlay();
    this.bump();
  }

  setSpeed(i: number) {
    this.speed = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.paused = this.speed === 0;
    this.bump();
  }

  togglePause() {
    this.paused = !this.paused;
    if (!this.paused && this.speed === 0) this.speed = 1;
    this.bump();
  }

  openPanel(p: Panel) {
    this.panel = this.panel === p ? null : p;
    if (p !== "agenda") this.viewingApp = -1;
    this.refreshGhost();
    this.refreshOverlay();
    this.bump();
  }

  setTax(rate: number) {
    if (!this.s) return;
    act.setTax(this.s, rate);
    this.bump();
  }

  flyTo(x: number, z: number, dist?: number) {
    this.view?.focus(x, z, dist);
  }

  toast(text: string, kind: Toast["kind"] = "info", app?: number) {
    const id = ++this.toastId;
    this.toasts = [...this.toasts.slice(-3), { id, text, kind, app }];
    setTimeout(
      () => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
        this.bump();
      },
      app ? 9000 : 4500,
    );
    this.bump();
  }

  dismiss(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.bump();
  }

  persist() {
    const s = this.s;
    if (!s || this.screen !== "play") return;
    try {
      localStorage.setItem(SAVE_KEY, save(s));
    } catch {}
  }

  submitFinal() {
    const s = this.s;
    if (!s || this.finalSent || this.screen !== "play" || s.month < 6) return;
    this.finalSent = true;
    this.report.final(score(s));
  }

  get selectedBuilding(): Building | null {
    return this.s && this.selBuilding >= 0 ? this.s.buildings[this.selBuilding] : null;
  }

  get app(): Application | null {
    return this.s?.apps.find((a) => a.id === this.viewingApp) ?? null;
  }

  get newsCount() {
    return this.newsSeen;
  }
}

function districtAtPoint(s: State, x: number, z: number) {
  for (let i = s.districts.length - 1; i >= 0; i--) {
    const d = s.districts[i];
    if (!d) continue;
    const b = bbox(d.poly);
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    let inside = false;
    const p = d.poly;
    for (let a = 0, j = p.length - 2; a < p.length; j = a, a += 2) if (p[a + 1] > z !== p[j + 1] > z && x < ((p[j] - p[a]) * (z - p[a + 1])) / (p[j + 1] - p[a + 1]) + p[a]) inside = !inside;
    if (inside) return d.id;
  }
  return -1;
}

export function fmt(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e3)}k`;
  return `${sign}${Math.round(a).toLocaleString()}`;
}
