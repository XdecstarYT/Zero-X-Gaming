import * as THREE from "three";
import { ADMINS, EVENTS, RESEARCH_ORDER, FLOORS, H, OBJECTS, PAVEMENT_Z, ROLES, ROOMS, SAVE_KEY, SAVE_VERSION, SCENARIOS, W, WALL_COST, DOOR_COST, type ObjectId, type ResearchId, type Role, type RoomId, type ScenarioId } from "./data";
import { megaWing, starterHospital } from "./plan";
import { AgentView } from "./render/agents";
import { BuildingView } from "./render/buildingView";
import { Engine } from "./render/engine";
import { GHOST_BAD, GHOST_OK, makeObject, ObjectView, placeModel } from "./render/objects";
import { levelOf, Sim } from "./sim";

const MEDALS_KEY = "zx-lifeline-medals";
import type { Category, Panel, Store, Tool } from "./store";
import { footprint, idx, inside } from "./world";

/** A few synthesised sounds: clicks, a build thunk, a cash chime, the siren. */
class Sound {
  private ctx: AudioContext | null = null;
  enabled = true;
  volume = 0.6;
  private get c() {
    if (!this.ctx && typeof AudioContext !== "undefined") this.ctx = new AudioContext();
    return this.ctx;
  }
  unlock() {
    void this.c?.resume();
  }
  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
    const c = this.c;
    if (!c || !this.enabled || c.state !== "running") return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, c.currentTime + dur);
    g.gain.setValueAtTime(gain * this.volume, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  }
  click() {
    this.tone(880, 0.05, "triangle", 0.08);
  }
  place() {
    this.tone(180, 0.12, "sine", 0.18, -60);
  }
  error() {
    this.tone(160, 0.18, "square", 0.05);
  }
  chime() {
    this.tone(880, 0.25, "sine", 0.1);
    setTimeout(() => this.tone(1320, 0.3, "sine", 0.08), 120);
  }
  siren() {
    for (let i = 0; i < 4; i++) setTimeout(() => this.tone(i % 2 ? 660 : 880, 0.28, "sawtooth", 0.025), i * 300);
  }
  dispose() {
    void this.ctx?.close();
  }
}

export interface GameHooks {
  progress: (score: number) => void;
  final: (score: number) => void;
}

/**
 * The controller: owns the sim, the 3D views and the input, publishes a HUD snapshot to
 * the store a few times a second, and saves to this device.
 */
export class Game {
  sim = new Sim(1);
  engine: Engine | null = null;
  private building: BuildingView | null = null;
  private objects: ObjectView | null = null;
  private agents: AgentView | null = null;
  private preview = new THREE.Group();
  private ghost: { key: string; g: THREE.Group } | null = null;
  readonly sound = new Sound();
  private raf = 0;
  private last = performance.now();
  private hudAcc = 0;
  private dirtAcc = 0;
  private saveAcc = 0;
  private paused = false;
  private disposers: (() => void)[] = [];
  private drag: { x: number; z: number; button: number; sx: number; sy: number; lx: number; ly: number; moved: boolean } | null = null;
  private hover: { x: number; z: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; a: number; mx: number; my: number } | null = null;
  private time = 0;
  private lastAmb = 0;
  activeMs = 0;

  constructor(
    readonly store: Store,
    private hooks: GameHooks,
    private quality: "low" | "high",
  ) {}

  // -------------------------------------------------------------- lifecycle

  mount(host: HTMLElement) {
    if (this.engine) return;
    try {
      this.engine = new Engine(host, this.quality);
    } catch (e) {
      console.warn("Lifeline: WebGL unavailable", e);
      return;
    }
    this.building = new BuildingView();
    this.objects = new ObjectView();
    this.agents = new AgentView();
    this.engine.scene.add(this.building.group, this.objects.group, this.agents.group, this.preview);
    const ro = new ResizeObserver(() => this.engine?.resize());
    ro.observe(host);
    this.disposers.push(() => ro.disconnect());
    this.attachInput(this.engine.renderer.domElement);
    let medals = {};
    try {
      medals = JSON.parse(localStorage.getItem(MEDALS_KEY) ?? "{}") ?? {};
    } catch {
      medals = {};
    }
    this.store.setState({ hasSave: !!localStorage.getItem(SAVE_KEY), medals });
    // The menu backdrop: a working hospital, running.
    this.demo();
    this.loop();
  }

  private demo() {
    const s = new Sim(7);
    starterHospital(s, { build: true, full: true });
    s.cash = 1_000_000;
    megaWing(s, { build: true });
    s.research.done = [...RESEARCH_ORDER];
    s.world.touch();
    for (const r of ["receptionist", "receptionist", "doctor", "doctor", "doctor", "doctor", "doctor", "doctor", "nurse", "nurse", "nurse", "nurse", "midwife", "psychiatrist", "janitor", "janitor", "workman"] as Role[]) s.hire(r);
    s.minutes = 10 * 60;
    for (let i = 0; i < 600; i++) s.step(0.1, 4);
    // A helicopter on its way in, for the show.
    (s as unknown as { callHelicopter: () => void }).callHelicopter();
    s.messages = [];
    this.sim = s;
    this.engine?.setView({ x: 36, z: 26, dist: 66, yaw: 0.5, pitch: 0.82 }, true);
  }

  newGame(kind: "empty" | "starter" | ScenarioId) {
    const s = new Sim(Math.floor(Math.random() * 1e9));
    s.hire("workman");
    s.hire("workman");
    const sc = kind === "empty" || kind === "starter" ? null : SCENARIOS[kind];
    const start = sc ? sc.start : kind;
    if (start === "starter" || start === "full") {
      starterHospital(s, { build: true, full: start === "full" });
      s.cash = 25_000;
    }
    if (start === "full") for (const r of ["receptionist", "doctor", "doctor", "doctor", "nurse", "nurse", "janitor"] as Role[]) s.hire(r);
    if (sc) s.startScenario(kind as ScenarioId);
    s.messages = [];
    this.sim = s;
    this.enter();
    this.toast(sc ? `${sc.name}: ${sc.blurb} Goal: ${sc.goals[0]} / ${sc.goals[1]} / ${sc.goals[2]} in ${sc.days} days.` : kind === "starter" ? "Here's a small hospital to start from. Hire a receptionist, a doctor and a nurse." : "An empty plot and two workmen. Lay a foundation to begin.", "info");
  }

  setResearch(id: ResearchId) {
    if (this.sim.setResearch(id)) this.sound.click();
    this.publish();
  }

  toggleFollow() {
    this.store.setState({ follow: !this.store.getState().follow });
  }

  /** Close the scenario card and play on. */
  dismissResult() {
    this.store.setState({ result: false });
  }

  continueGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const j = JSON.parse(raw);
      if (j.v !== SAVE_VERSION) throw new Error("old save");
      this.sim = Sim.from(j.sim);
      this.enter();
      if (j.view) this.engine?.setView(j.view, true);
    } catch (e) {
      console.warn("Lifeline: couldn't read the save", e);
      localStorage.removeItem(SAVE_KEY);
      this.store.setState({ hasSave: false });
    }
  }

  private enter() {
    this.store.setState({ screen: "game", tool: null, category: null, panel: null, selected: null, speed: 1, toasts: [], result: false, follow: false });
    this.engine?.setView({ x: W / 2, z: H / 2 + 6, dist: 62, yaw: 0, pitch: 0.95 }, true);
    this.publish();
  }

  save() {
    if (this.store.getState().screen !== "game") return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, sim: this.sim.toJSON(), view: this.engine?.state }));
      this.store.setState({ hasSave: true });
    } catch (e) {
      console.warn("Lifeline: save failed", e);
    }
  }

  toMenu() {
    this.save();
    this.store.setState({ screen: "menu", tool: null, category: null, panel: null, selected: null });
    this.clearPreview();
    this.demo();
  }

  /** Bank the number of lives saved as this run's score. */
  bank() {
    this.save();
    this.hooks.final(this.sim.stats.treated);
  }

  pause() {
    this.paused = true;
    this.save();
  }
  resume() {
    this.paused = false;
    this.last = performance.now();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.save();
    for (const d of this.disposers) d();
    this.engine?.dispose();
    this.sound.dispose();
  }

  // ------------------------------------------------------------------ loop

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const e = this.engine;
    if (!e || this.paused) return;
    const st = this.store.getState();
    const inGame = st.screen === "game";
    const speed = inGame ? st.speed : 1;
    if (inGame && speed > 0) this.activeMs += dt * 1000;
    const before = this.sim.vehicles.filter((v) => v.kind === "ambulance").length;
    this.sim.step(dt, speed);
    if (inGame && this.sim.vehicles.filter((v) => v.kind === "ambulance").length > before && now - this.lastAmb > 4000) {
      this.lastAmb = now;
      this.sound.siren();
    }
    this.time += dt;
    e.update(dt);
    e.setHour(this.sim.hour);
    this.building!.roomsVisible = !inGame || st.rooms;
    this.building!.sync(this.sim.world);
    this.building!.setNight(e.night);
    this.objects!.sync(this.sim.world.objects);
    this.objects!.update(this.time);
    this.dirtAcc += dt;
    const dirtNow = this.dirtAcc > 0.5;
    if (dirtNow) this.dirtAcc = 0;
    this.building!.update(this.sim.world, this.sim.people.values(), dt, dirtNow);
    this.agents!.selected = st.selected?.kind === "person" ? st.selected.id : -1;
    // Follow cam: keep the selected person in the middle of the view.
    if (inGame && st.follow && st.selected?.kind === "person") {
      const p = this.sim.people.get(st.selected.id);
      if (p) e.setView({ ...e.state, x: p.at ? p.at.x : p.x, z: p.at ? p.at.z : p.z });
      else this.store.setState({ follow: false });
    }
    this.agents!.update(this.sim.people, this.sim.crates, this.sim.vehicles, this.time, e.night);
    if (!inGame) e.rotate(dt * 0.05);
    e.render();
    this.hudAcc += dt;
    if (inGame && this.hudAcc > 0.25) {
      this.hudAcc = 0;
      this.publish();
      this.hooks.progress(this.sim.stats.treated);
    }
    this.saveAcc += dt;
    if (inGame && this.saveAcc > 60) {
      this.saveAcc = 0;
      this.save();
    }
  };

  /** Push a snapshot of the hospital to the HUD. */
  publish() {
    const s = this.sim;
    const prev = this.store.getState().scenario;
    if (s.scenario && s.scenario.finished && prev && !prev.finished) {
      const medals = { ...this.store.getState().medals };
      medals[s.scenario.id] = Math.max(medals[s.scenario.id] ?? 0, s.scenario.medal);
      try {
        localStorage.setItem(MEDALS_KEY, JSON.stringify(medals));
      } catch {
        /* storage full or blocked: the medal still shows this session */
      }
      this.store.setState({ medals, result: true, speed: 0 });
      if (s.scenario.medal) this.sound.chime();
    }
    for (const m of s.messages.splice(0)) {
      this.toast(m.text, m.kind);
      if (m.kind === "good") this.sound.chime();
    }
    const unlocked: Partial<Record<Role | RoomId, boolean>> = {};
    for (const r of Object.keys(ROLES) as Role[]) unlocked[r] = s.unlocked(r);
    for (const r of Object.keys(ROOMS) as RoomId[]) unlocked[r] = s.roomUnlocked(r);
    this.store.setState({
      cash: s.cash,
      minutes: s.minutes,
      rep: s.rep,
      hygiene: s.hygiene,
      power: s.power,
      stats: { ...s.stats },
      notices: s.notices,
      grants: { ...s.grants },
      staff: [...s.people.values()].filter((p) => p.kind === "staff").map((p) => ({ id: p.id, role: p.role!, name: p.name, energy: p.energy, onDuty: p.onDuty, state: p.state, level: levelOf(p.xp) })),
      research: { current: s.research.current, points: s.research.points, done: [...s.research.done], open: s.researchOpen(), labs: s.world.roomsOf("research").filter((r) => r.valid).length },
      scenario: s.scenario ? { id: s.scenario.id, score: s.scenarioScore(), medal: s.scenario.medal, finished: s.scenario.finished, hoursLeft: Math.max(0, (s.scenario.endsAt - s.minutes) / 60) } : null,
      patients: [...s.people.values()].filter((p) => p.kind === "patient" && p.state !== "dead" && p.state !== "leaving").length,
      jobs: s.jobs.size,
      loan: s.loan,
      unlocked,
      events: s.events.filter((e) => e.until > s.minutes).map((e) => EVENTS[e.id].name),
    });
  }

  toast(text: string, kind: "info" | "good" | "bad" = "info") {
    const id = Math.random();
    this.store.setState((st) => ({ toasts: [...st.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => this.store.setState((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })), 5000);
  }

  // ---------------------------------------------------------------- actions

  setSpeed(v: number) {
    this.store.setState({ speed: v });
    this.sound.click();
  }

  setTool(tool: Tool | null) {
    this.store.setState({ tool, selected: null });
    this.clearPreview();
    this.drag = null;
  }

  openCategory(c: Category) {
    const cur = this.store.getState().category;
    this.store.setState({ category: cur === c ? null : c, panel: null });
    if (cur === c) this.setTool(null);
    this.sound.click();
  }

  openPanel(p: Panel) {
    const cur = this.store.getState().panel;
    this.store.setState({ panel: cur === p ? null : p, category: null });
    this.setTool(null);
    this.sound.click();
  }

  hire(role: Role) {
    const p = this.sim.hire(role);
    if (p) this.sound.click();
    else this.sound.error();
    this.publish();
  }

  fire(id: number) {
    if (this.sim.fire(id)) this.sound.click();
    this.store.setState({ selected: null });
    this.publish();
  }

  loan() {
    if (this.sim.takeLoan()) this.sound.chime();
    this.publish();
  }

  toggleCutaway() {
    const on = !this.store.getState().cutaway;
    this.store.setState({ cutaway: on });
    this.building?.setCutaway(on);
  }

  toggleRooms() {
    this.store.setState({ rooms: !this.store.getState().rooms });
    this.sim.world.touch();
  }

  rotateTool() {
    const t = this.store.getState().tool;
    if (t?.kind === "object") this.store.setState({ tool: { ...t, rot: (t.rot + 1) % 4 } });
  }

  // ------------------------------------------------------------------ input

  private attachInput(canvas: HTMLCanvasElement) {
    const down = (e: PointerEvent) => this.onDown(e);
    const move = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.engine?.zoom(Math.exp(e.deltaY * 0.0012));
    };
    const ctx = (e: Event) => e.preventDefault();
    const key = (e: KeyboardEvent, isDown: boolean) => this.onKey(e, isDown);
    const kd = (e: KeyboardEvent) => key(e, true);
    const ku = (e: KeyboardEvent) => key(e, false);
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextmenu", ctx);
    window.addEventListener("keydown", kd, true);
    window.addEventListener("keyup", ku);
    this.disposers.push(() => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", ctx);
      window.removeEventListener("keydown", kd, true);
      window.removeEventListener("keyup", ku);
    });
  }

  private onKey(e: KeyboardEvent, isDown: boolean) {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const eng = this.engine;
    if (!eng) return;
    if (!isDown) {
      eng.keys.delete(e.code);
      return;
    }
    if (this.store.getState().screen !== "game") return;
    const st = this.store.getState();
    if (e.code === "Escape") {
      // Put the tool down, then close panels; the platform pauses only when there's nothing to close.
      if (st.tool || st.category || st.panel || st.selected) {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (st.tool) this.setTool(null);
        else this.store.setState({ category: null, panel: null, selected: null });
      }
      return;
    }
    if (e.code === "KeyR") return this.rotateTool();
    if (e.code === "KeyC") return this.toggleCutaway();
    if (e.code === "Space") {
      e.preventDefault();
      return this.setSpeed(st.speed ? 0 : 1);
    }
    if (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3") return this.setSpeed([1, 2, 4][Number(e.code.slice(5)) - 1]);
    if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Equal", "Minus"].includes(e.code)) {
      eng.keys.add(e.code);
      if (e.code.startsWith("Arrow")) e.preventDefault();
    }
  }

  private cellAt(cx: number, cy: number) {
    const p = this.engine?.ground(cx, cy);
    if (!p) return null;
    return { x: Math.floor(p.x), z: Math.floor(p.z), fx: p.x, fz: p.z };
  }

  private onDown(e: PointerEvent) {
    this.sound.unlock();
    if (this.store.getState().screen !== "game") return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.drag = null;
      return;
    }
    const c = this.cellAt(e.clientX, e.clientY);
    this.drag = { x: c?.x ?? 0, z: c?.z ?? 0, button: e.button, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
  }

  private onMove(e: PointerEvent) {
    const eng = this.engine;
    if (!eng || this.store.getState().screen !== "game") return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      eng.zoom(this.pinch.d / Math.max(10, d));
      eng.rotate(-(ang - this.pinch.a));
      eng.panScreen(mx - this.pinch.mx, my - this.pinch.my);
      this.pinch = { d, a: ang, mx, my };
      return;
    }
    const d = this.drag;
    const tool = this.store.getState().tool;
    if (d) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
      const dx = e.clientX - d.lx;
      const dy = e.clientY - d.ly;
      d.lx = e.clientX;
      d.ly = e.clientY;
      if (d.button === 2) {
        eng.rotate(dx * 0.006);
        eng.tilt(dy * 0.005);
        return;
      }
      // With no tool (or the middle button, or a touch drag), dragging pans.
      if (d.button === 1 || (!tool && d.button === 0)) {
        eng.panScreen(dx, dy);
        return;
      }
    }
    if (e.target !== eng.renderer.domElement && !d) return;
    const c = this.cellAt(e.clientX, e.clientY);
    this.hover = c ? { x: c.x, z: c.z } : null;
    this.updatePreview(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    this.drag = null;
    if (!d || this.store.getState().screen !== "game") return;
    if (d.button !== 0) return;
    const tool = this.store.getState().tool;
    const c = this.cellAt(e.clientX, e.clientY);
    if (!tool) {
      if (!d.moved && c) this.select(c.fx, c.fz);
      return;
    }
    if (!c) return;
    this.apply(tool, d.x, d.z, c.x, c.z);
    this.updatePreview(e.clientX, e.clientY);
  }

  /** Click with no tool: a person, else a room. */
  private select(x: number, z: number) {
    const id = this.agents?.pick(x, z, this.sim.people) ?? -1;
    if (id >= 0) {
      this.store.setState({ selected: { kind: "person", id }, panel: null });
      this.sound.click();
      return;
    }
    const cell = inside(Math.floor(x), Math.floor(z)) ? idx(Math.floor(x), Math.floor(z)) : -1;
    const room = cell >= 0 ? this.sim.world.roomOf[cell] : 0;
    this.store.setState({ selected: room ? { kind: "room", id: room } : null });
    if (room) this.sound.click();
  }

  /** Straight wall lines snap to the longer axis of the drag. */
  private wallCells(x0: number, z0: number, x1: number, z1: number) {
    const cells: number[] = [];
    if (Math.abs(x1 - x0) >= Math.abs(z1 - z0)) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cells.push(idx(x, z0));
    else for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) cells.push(idx(x0, z));
    return cells.filter((c) => c >= 0 && c < W * H && Math.floor(c / W) < PAVEMENT_Z);
  }

  private apply(tool: Tool, x0: number, z0: number, x1: number, z1: number) {
    const s = this.sim;
    let ok = false;
    switch (tool.kind) {
      case "foundation":
        ok = s.foundation(x0, z0, x1, z1, tool.floor);
        break;
      case "floor":
        ok = s.floor(x0, z0, x1, z1, tool.floor);
        break;
      case "wall":
        ok = s.walls(this.wallCells(x0, z0, x1, z1));
        break;
      case "door":
        ok = inside(x1, z1) && s.door(idx(x1, z1));
        break;
      case "room":
        ok = s.paintRoom(x0, z0, x1, z1, tool.room);
        break;
      case "object": {
        const f = footprint(tool.obj, tool.rot);
        const ox = x1 - Math.floor((f.w - 1) / 2);
        const oz = z1 - Math.floor((f.d - 1) / 2);
        ok = !!s.placeObject(tool.obj, ox, oz, tool.rot);
        break;
      }
      case "demolish":
        ok = s.demolish(x0, z0, x1, z1);
        break;
    }
    if (ok) this.sound.place();
    else {
      this.sound.error();
      if (s.cash < 0) this.toast("Not enough money.", "bad");
    }
    this.publish();
  }

  // --------------------------------------------------------------- previews

  private clearPreview() {
    this.preview.clear();
    this.ghost = null;
    this.store.setState({ cursor: null });
  }

  private updatePreview(clientX: number, clientY: number) {
    const tool = this.store.getState().tool;
    const h = this.hover;
    if (!tool || !h) return this.clearPreview();
    const d = this.drag && this.drag.button === 0 ? this.drag : null;
    const x0 = d ? d.x : h.x;
    const z0 = d ? d.z : h.z;
    const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
    let text = "";
    let bad = false;
    if (tool.kind === "object") {
      const f = footprint(tool.obj, tool.rot);
      const ox = h.x - Math.floor((f.w - 1) / 2);
      const oz = h.z - Math.floor((f.d - 1) / 2);
      const ok = this.sim.world.canPlace(tool.obj, ox, oz, tool.rot) && this.sim.canAfford(OBJECTS[tool.obj].cost);
      const key = `${tool.obj}:${ok}`;
      if (!this.ghost || this.ghost.key !== key) {
        this.preview.clear();
        const g = makeObject(tool.obj, ok ? GHOST_OK : GHOST_BAD);
        this.ghost = { key, g };
        this.preview.add(g);
      }
      placeModel(this.ghost.g, { kind: tool.obj, x: ox, z: oz, rot: tool.rot });
      text = `${OBJECTS[tool.obj].name} · ${money(OBJECTS[tool.obj].cost)}`;
      bad = !ok;
    } else {
      this.ghost = null;
      this.preview.clear();
      let cells: number[];
      if (tool.kind === "wall") cells = this.wallCells(x0, z0, h.x, h.z);
      else if (tool.kind === "door") cells = inside(h.x, h.z) ? [idx(h.x, h.z)] : [];
      else {
        cells = [];
        for (let z = Math.min(z0, h.z); z <= Math.max(z0, h.z); z++) for (let x = Math.min(x0, h.x); x <= Math.max(x0, h.x); x++) if (inside(x, z)) cells.push(idx(x, z));
      }
      const color = tool.kind === "demolish" ? "#f87171" : tool.kind === "room" ? (tool.room ? ROOMS[tool.room].color : "#94a3b8") : "#38bdf8";
      const height = tool.kind === "wall" || tool.kind === "door" ? (this.store.getState().cutaway ? 0.75 : 2.7) : 0.08;
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false }), Math.max(1, cells.length));
      const m = new THREE.Matrix4();
      cells.forEach((c, i) => mesh.setMatrixAt(i, m.makeScale(0.98, height, 0.98).setPosition((c % W) + 0.5, 0.03, Math.floor(c / W) + 0.5)));
      mesh.count = cells.length;
      mesh.renderOrder = 10;
      this.preview.add(mesh);
      const xs = Math.abs(h.x - x0) + 1;
      const zs = Math.abs(h.z - z0) + 1;
      if (tool.kind === "foundation") {
        const cost = this.sim.foundationCost(x0, z0, h.x, h.z, tool.floor);
        text = `${xs} × ${zs} · ${money(cost)}`;
        bad = !this.sim.canAfford(cost);
      } else if (tool.kind === "floor") {
        const cost = this.sim.floorCost(x0, z0, h.x, h.z, tool.floor);
        text = `${FLOORS[tool.floor].name} · ${money(cost)}`;
      } else if (tool.kind === "wall") text = `${cells.length} m · ${money(cells.length * WALL_COST)}`;
      else if (tool.kind === "door") text = `Door · ${money(DOOR_COST)}`;
      else if (tool.kind === "room") text = `${tool.room ? ROOMS[tool.room].name : "Erase rooms"} · ${xs * zs} m²`;
      else text = "Demolish";
    }
    const r = this.engine?.renderer.domElement.getBoundingClientRect();
    this.store.setState({ cursor: { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0), text, bad } });
  }

  // ------------------------------------------------------------ test hooks

  /** Screen position of a cell centre (tests). */
  screenOf(x: number, z: number) {
    return this.engine?.screen(x + 0.5, 0, z + 0.5) ?? null;
  }
  look(x: number, z: number, dist = 40, pitch = 1.2, yaw = 0) {
    this.engine?.setView({ x, z, dist, yaw, pitch }, true);
  }
  debugState() {
    const s = this.sim;
    return {
      screen: this.store.getState().screen,
      cash: Math.round(s.cash),
      jobs: s.jobs.size,
      crates: s.crates.size,
      staff: [...s.people.values()].filter((p) => p.kind === "staff").length,
      patients: [...s.people.values()].filter((p) => p.kind === "patient").length,
      treated: s.stats.treated,
      rooms: s.world.rooms.map((r) => ({ type: r.type, valid: r.valid })),
      walls: Array.from(s.world.wall).filter((w) => w === 1).length,
      objects: s.world.objects.size,
      minutes: Math.round(s.minutes),
    };
  }
  /** Tests: run the hospital fast. */
  fastForward(hours: number) {
    const end = this.sim.minutes + hours * 60;
    while (this.sim.minutes < end) this.sim.step(0.1, 4);
    this.publish();
  }
  /** Tests: finish all construction now. */
  buildNow() {
    this.sim.instantBuild();
  }
}

export const ROLE_LIST = Object.keys(ROLES) as Role[];
export const STAFF_ROLES = ROLE_LIST.filter((r) => !ADMINS.includes(r));
export const OBJECT_LIST = Object.keys(OBJECTS) as ObjectId[];
