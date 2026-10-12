import { HeatAudio } from "./audio";
import { LEADS, PREFS_KEY, SAVE_KEY, STATIONS, VEHICLES, WEAPONS, type StationId } from "./data";
import { missionDef, missionStart, nextStory, STORY } from "./missions";
import * as sim from "./sim";
import { player, playerCar, playerPos, type State } from "./state";
import { HeatwaveView } from "./render/view";
import type { Quality } from "./render/city";
import { carToEnter } from "./vehicles";
import { route, type Poi } from "./world";

/**
 * The controller: owns the simulation and the 3D view, runs the clock, turns keys, the mouse and
 * touches into the simulation's input, plays the sounds, and tells the React HUD when to redraw.
 */

export type Screen = "title" | "play";
export type Panel = null | "phone" | "shop";
export type PhoneTab = "map" | "missions" | "stats" | "settings" | "leads";

export interface Prefs {
  quality: "auto" | Quality;
  volume: number;
  music: number;
  sens: number;
  invert: boolean;
  aimAssist: boolean;
  touchLayout: "right" | "left";
  mph: boolean;
}

const DEFAULT_PREFS: Prefs = { quality: "auto", volume: 0.8, music: 0.55, sens: 1, invert: false, aimAssist: true, touchLayout: "right", mph: true };

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "good" | "bad" | "money";
}

export interface Banner {
  id: number;
  title: string;
  sub: string;
  kind: "pass" | "fail" | "hospitalised" | "arrested" | "mission" | "info";
  until: number;
}

export interface Line {
  who: string;
  text: string;
  until: number;
}

export interface TouchState {
  mx: number;
  my: number;
  fire: boolean;
  aim: boolean;
  sprint: boolean;
  gas: boolean;
  brake: boolean;
  handbrake: boolean;
}

export class Game {
  s: State | null = null;
  view: HeatwaveView | null = null;
  screen: Screen = "title";
  panel: Panel = null;
  tab: PhoneTab = "map";
  shop: Poi | null = null;
  prefs: Prefs = { ...DEFAULT_PREFS };
  paused = false;
  toasts: Toast[] = [];
  banner: Banner | null = null;
  line: Line | null = null;
  coarse = false;
  canvas: HTMLCanvasElement | null = null;
  readonly audio: HeatAudio;
  /** React subscribes to this. */
  version = 0;
  private listeners = new Set<() => void>();
  private raf = 0;
  private last = 0;
  private acc = 0;
  activeMs = 0;
  /** Input. */
  private keys = new Set<string>();
  private edges = new Set<string>();
  private mouse = { left: false, right: false };
  touch: TouchState = { mx: 0, my: 0, fire: false, aim: false, sprint: false, gas: false, brake: false, handbrake: false };
  touchAimToggle = false;
  private look = { dx: 0, dy: 0 };
  private bumpT = 0;
  private saveT = 0;
  private frameAvg = 1 / 60;
  private scaleT = 0;
  private finalSent = false;
  /** The score of the game you went back to the title from (reported if you leave from there). */
  private banked: number | null = null;
  private toastId = 1;
  radioShown = 0;
  onScore: (n: number) => void = () => {};
  onFinal: (n: number) => void = () => {};

  constructor(sound: boolean, volume: number) {
    this.coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    try {
      const p = localStorage.getItem(PREFS_KEY);
      if (p) this.prefs = { ...DEFAULT_PREFS, ...JSON.parse(p) };
    } catch {
      // ignore
    }
    this.audio = new HeatAudio(sound, volume * this.prefs.volume, this.prefs.music);
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  /* -------------------------------------------------------------- lifecycle */

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", this.onWheel, { passive: true });
    document.addEventListener("pointerlockchange", this.onLock);
    this.raf = requestAnimationFrame(this.frame);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLock);
    this.canvas?.removeEventListener("mousedown", this.onMouseDown);
    this.canvas?.removeEventListener("wheel", this.onWheel);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  dispose() {
    this.submitFinal();
    this.persist();
    this.view?.dispose();
    this.view = null;
    this.audio.dispose();
  }

  get hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  quality(): Quality {
    if (this.prefs.quality !== "auto") return this.prefs.quality;
    if (this.coarse) return "low";
    const cores = navigator.hardwareConcurrency || 4;
    return cores >= 8 ? "high" : "medium";
  }

  newGame() {
    this.s = sim.newGame(7);
    this.startPlay();
    this.say("Port Solano. Find the yellow marker to start the story.", "info");
  }

  continueGame() {
    let s: State | null = null;
    try {
      const json = localStorage.getItem(SAVE_KEY);
      s = json ? sim.load(json) : null;
    } catch {
      s = null;
    }
    if (!s) {
      this.say("That save couldn't be read", "bad");
      return;
    }
    this.s = s;
    this.startPlay();
  }

  private startPlay() {
    const s = this.s!;
    s.settings.aimAssist = this.prefs.aimAssist;
    s.density = this.quality() === "low" ? { cars: 18, peds: 22 } : this.quality() === "medium" ? { cars: 26, peds: 30 } : { cars: 32, peds: 38 };
    this.view?.dispose();
    this.view = new HeatwaveView(this.canvas!, s, this.quality());
    const r = this.canvas!.getBoundingClientRect();
    this.view.resize(Math.max(1, r.width), Math.max(1, r.height), window.devicePixelRatio || 1);
    const p = player(s);
    // A three-quarter view of the lead, turned to wherever there's room for the camera.
    this.view.rig.frame(s, p.x, p.y, p.z, [p.h + 2.5, p.h - 2.5, p.h + Math.PI / 2, p.h - Math.PI / 2, p.h, p.h + Math.PI]);
    // Standing at a door when you arrive doesn't walk you in.
    this.lastPoi = sim.atPoi(s, 1.6);
    this.screen = "play";
    this.panel = null;
    this.finalSent = false;
    this.audio.unlock();
    this.audio.station(s.radio);
    this.bump();
  }

  resize(w: number, h: number) {
    this.view?.resize(w, h, window.devicePixelRatio || 1);
  }

  /* -------------------------------------------------------------- the loop */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    const s = this.s;
    const v = this.view;
    if (!s || !v || this.screen !== "play") return;
    const running = !this.paused && !this.panel && !v.rig.swooping;
    if (running) {
      this.activeMs += dt * 1000;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= 1 / 60 && steps < 6) {
        sim.step(s, this.input(), 1 / 60);
        this.edges.clear();
        this.acc -= 1 / 60;
        steps++;
      }
      if (steps === 6) this.acc = 0;
      this.handleEvents(s);
    } else s.events.length = 0;
    // Adaptive resolution (before drawing: resizing the canvas clears it).
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    this.scaleT -= dt;
    if (this.scaleT <= 0) {
      this.scaleT = 2;
      const target = this.coarse ? 1 / 45 : 1 / 50;
      if (this.frameAvg > target * 1.15 && v.scale > 0.6) v.setScale(Math.max(0.6, v.scale - 0.1));
      else if (this.frameAvg < target * 0.75 && v.scale < 1) v.setScale(Math.min(1, v.scale + 0.1));
    }
    // Look.
    const k = 0.0024 * this.prefs.sens;
    v.rig.look(this.look.dx * k, this.look.dy * k * (this.prefs.invert ? -1 : 1), now / 1000);
    this.look.dx = this.look.dy = 0;
    // Touch steering of the camera (right side drags arrive as look deltas too).
    v.frame(s, running ? dt : 0, { goals: this.markers(s) }, now / 1000, this.aiming(s));
    if (this.canvas) this.canvas.style.filter = s.down ? "grayscale(0.85) contrast(1.1)" : "";
    this.audio.update(s, v.rig.camera, dt);
    // HUD redraws ~10 times a second; banners and lines expire.
    this.bumpT -= dt;
    if (this.bumpT <= 0) {
      this.bumpT = 0.1;
      const t = now / 1000;
      if (this.banner && t > this.banner.until) this.banner = null;
      if (this.line && t > this.line.until) this.line = null;
      this.toasts = this.toasts.filter((x) => x.id > this.toastId - 4);
      this.onScore(sim.score(s));
      this.bump();
    }
    // Autosave now and then (not mid-mission).
    this.saveT += dt;
    if (this.saveT > 90 && !s.story.run && !s.down && s.wanted.level === 0) {
      this.saveT = 0;
      this.persist();
    }
  };

  /** Merge keys, mouse and touch into the simulation's input. */
  private input(): sim.Input {
    const s = this.s!;
    const v = this.view!;
    const k = this.keys;
    const t = this.touch;
    const car = playerCar(s);
    const kx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const ky = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const mx = Math.max(-1, Math.min(1, kx + t.mx));
    const my = Math.max(-1, Math.min(1, ky + t.my));
    const aim = this.mouse.right || t.aim || this.touchAimToggle;
    const fire = this.mouse.left || t.fire || k.has("KeyJ");
    let throttle = 0;
    let steer = 0;
    if (car) {
      throttle = ky + (t.gas ? 1 : 0) - (t.brake ? 1 : 0);
      if (!t.gas && !t.brake && Math.abs(t.my) > 0.2 && !this.coarse) throttle += t.my;
      steer = -kx - t.mx;
    }
    return {
      mx,
      my,
      yaw: v.rig.heading,
      pitch: v.rig.aimPitch,
      sprint: k.has("ShiftLeft") || k.has("ShiftRight") || t.sprint,
      jump: this.edges.has("Space") && !car,
      aim,
      fire,
      enter: this.edges.has("KeyF") || this.edges.has("KeyE") || this.edges.has("enter"),
      reload: this.edges.has("KeyR"),
      next: this.edges.has("next") || this.edges.has("BracketRight"),
      prev: this.edges.has("prev") || this.edges.has("BracketLeft"),
      throttle: Math.max(-1, Math.min(1, throttle)),
      steer: Math.max(-1, Math.min(1, steer)),
      handbrake: (car && k.has("Space")) || t.handbrake,
      horn: k.has("KeyH"),
      autoAim: this.coarse || (this.prefs.aimAssist && aim),
    };
  }

  aiming(s: State) {
    const p = player(s);
    return !!p && p.aiming && p.car < 0;
  }

  /** Objective markers: the mission's goal, or the start of the next story mission, or the waypoint. */
  markers(s: State) {
    const out: { x: number; z: number; r: number }[] = [];
    const r = s.story.run;
    if (r?.goal) out.push(r.goal);
    else if (!r) {
      const m = nextStory(s);
      if (m && m.lead === s.chars[s.active].id) {
        const st = missionStart(s, m);
        out.push({ x: st.x, z: st.z, r: 1.4 });
      }
    }
    if (s.waypoint && !out.length) out.push({ ...s.waypoint, r: 3 });
    return out;
  }

  /** The route the GPS draws on the map: to the goal, or the waypoint. */
  gps(s: State) {
    const m = this.markers(s)[0] ?? (s.waypoint ? { ...s.waypoint, r: 3 } : null);
    if (!m) return null;
    const pos = playerPos(s);
    if (Math.hypot(m.x - pos.x, m.z - pos.z) < 25) return null;
    const key = `${Math.round(pos.x / 12)},${Math.round(pos.z / 12)}>${Math.round(m.x)},${Math.round(m.z)}`;
    if (key !== this.routeKey) {
      this.routeKey = key;
      this.routePts = route(s.city, pos.x, pos.z, m.x, m.z);
    }
    return this.routePts;
  }
  private routeKey = "";
  private routePts: { x: number; z: number }[] = [];

  /* -------------------------------------------------------------- events: sound, toasts, banners */

  private handleEvents(s: State) {
    const now = performance.now() / 1000;
    const pos = playerPos(s);
    for (const e of s.events) {
      const d = e.x !== undefined ? Math.hypot(e.x - pos.x, (e.z ?? 0) - pos.z) : 0;
      switch (e.kind) {
        case "shot":
          this.audio.shot(e.who ?? "pistol", d);
          break;
        case "boom":
          this.audio.boom(d);
          break;
        case "crash":
          if (d < 60) this.audio.crash(e.n ?? 0.3, d);
          break;
        case "punch":
          this.audio.punch(d);
          break;
        case "glass":
          this.audio.glass(d);
          break;
        case "horn":
          this.audio.horn();
          break;
        case "hit":
          if (e.who === "player") this.audio.hurt();
          break;
        case "wanted":
          this.say(`Wanted: ${"★".repeat(e.n ?? 1)}`, "bad");
          this.audio.sting("wanted");
          break;
        case "lost":
          this.say("You lost the police", "good");
          this.audio.sting("lost");
          break;
        case "hospitalised":
          this.banner = { id: this.toastId++, title: "Hospitalised", sub: "You were taken to the hospital", kind: "hospitalised", until: now + 4.5 };
          this.audio.sting("fail");
          break;
        case "arrested":
          this.banner = { id: this.toastId++, title: "Arrested", sub: "You were taken in", kind: "arrested", until: now + 4 };
          this.audio.sting("fail");
          break;
        case "mission":
          this.banner = { id: this.toastId++, title: e.text ?? "", sub: missionDef(s.story.run?.id ?? "")?.from ?? "", kind: "mission", until: now + 3 };
          this.audio.sting("start");
          break;
        case "pass":
          this.banner = { id: this.toastId++, title: "Mission passed", sub: `${e.text}${e.n ? ` · +$${e.n.toLocaleString("en-US")}` : ""}`, kind: "pass", until: now + 5 };
          this.audio.sting("pass");
          this.persist();
          if (STORY.every((m) => s.story.done.includes(m.id))) this.submitFinal();
          break;
        case "fail":
          this.banner = { id: this.toastId++, title: "Mission failed", sub: e.text ?? "", kind: "fail", until: now + 4.5 };
          this.audio.sting("fail");
          break;
        case "unlock":
          this.say(e.text ?? "", "info");
          break;
        case "dialog":
          this.line = { who: e.who ?? "", text: e.text ?? "", until: now + Math.max(2.8, (e.text?.length ?? 20) * 0.055) };
          break;
        case "pickup":
          this.say(e.text ?? "", "good");
          this.audio.pickup();
          break;
        case "money":
          if (e.text) this.say(`${e.text}: ${e.n! >= 0 ? "+" : "−"}$${Math.abs(e.n ?? 0).toLocaleString("en-US")}`, "money");
          break;
        case "toast":
          if (e.text) this.say(e.text, "info");
          break;
      }
    }
    s.events.length = 0;
    // Shops: walking into one opens it.
    const at = sim.atPoi(s, 1.6);
    if (at && at !== this.lastPoi && !s.story.run && !s.down) {
      this.lastPoi = at;
      if (at.kind === "gunshop" || at.kind === "clothes" || at.kind === "respray" || at.kind === "safehouse") this.openShop(at);
    } else if (!at) this.lastPoi = null;
  }
  private lastPoi: Poi | null = null;

  say(text: string, kind: Toast["kind"] = "info") {
    if (!text) return;
    this.toasts = [...this.toasts.slice(-3), { id: this.toastId++, text, kind }];
    this.bump();
  }

  /* -------------------------------------------------------------- panels */

  openPhone(tab: PhoneTab = this.tab) {
    if (!this.s || this.s.down) return;
    this.panel = "phone";
    this.tab = tab;
    this.unlockPointer();
    this.audio.click();
    this.bump();
  }

  closePanel() {
    this.panel = null;
    this.shop = null;
    this.bump();
  }

  setTab(t: PhoneTab) {
    this.tab = t;
    this.audio.click();
    this.bump();
  }

  openShop(p: Poi) {
    if (p.kind === "safehouse") {
      // Your own place: it saves when you walk in.
      const mine = LEADS[this.s!.chars[this.s!.active].id].home === p.id;
      if (!mine) return;
      this.s!.story.savedAt = p.id;
      this.persist();
      this.say("Game saved", "good");
    }
    this.shop = p;
    this.panel = "shop";
    this.unlockPointer();
    this.bump();
  }

  /** Run a shop action; say what happened. */
  act(fn: () => string | null, ok: string) {
    const err = fn();
    if (err) this.say(err, "bad");
    else {
      this.say(ok, "good");
      this.audio.cash();
    }
    this.bump();
  }

  setWaypoint(x: number, z: number) {
    if (!this.s) return;
    this.s.waypoint = this.s.waypoint && Math.hypot(this.s.waypoint.x - x, this.s.waypoint.z - z) < 30 ? null : { x, z };
    this.audio.click();
    this.bump();
  }

  switchLead() {
    const s = this.s;
    if (!s || !this.view) return;
    const from = playerPos(s);
    const err = sim.switchLead(s);
    if (err) {
      this.say(err, "bad");
      return;
    }
    const to = playerPos(s);
    this.view.rig.swoop(from, to);
    this.view.rig.yaw = player(s).h;
    this.closePanel();
    this.say(`Now playing as ${LEADS[s.chars[s.active].id].full}`, "info");
  }

  sleep() {
    const s = this.s;
    if (!s) return;
    // Sleep through to 8 in the morning (tomorrow's, if it's evening) or to 8 in the evening.
    if (s.clock >= 20 * 60) s.day++;
    s.clock = s.clock < 8 * 60 || s.clock >= 20 * 60 ? 8 * 60 : 20 * 60;
    const p = player(s);
    p.hp = 100;
    this.persist();
    this.say(`Slept until ${s.clock === 8 * 60 ? "8 in the morning" : "8 in the evening"}. Game saved.`, "good");
    this.closePanel();
  }

  setRadio(id: StationId) {
    if (!this.s) return;
    this.s.radio = id;
    this.audio.station(id);
    this.radioShown = performance.now();
    this.bump();
  }

  cycleRadio() {
    if (!this.s) return;
    const i = STATIONS.findIndex((x) => x.id === this.s!.radio);
    this.setRadio(STATIONS[(i + 1) % STATIONS.length].id);
  }

  setPrefs(p: Partial<Prefs>) {
    const q = this.prefs.quality;
    this.prefs = { ...this.prefs, ...p };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      // ignore
    }
    if (this.s) this.s.settings.aimAssist = this.prefs.aimAssist;
    this.audio.setLevels(this.prefs.volume, this.prefs.music);
    if (p.quality && p.quality !== q && this.s && this.screen === "play") this.startPlay();
    this.bump();
  }

  persist() {
    if (!this.s || this.s.down) return;
    try {
      localStorage.setItem(SAVE_KEY, sim.save(this.s));
    } catch {
      // ignore
    }
  }

  /**
   * The final score goes in when the story's done or you leave the game (not when you go back to the
   * title: that only saves, and the platform would otherwise call it game over).
   */
  submitFinal() {
    const n = this.s ? sim.score(this.s) : this.banked;
    if (this.finalSent || n === null) return;
    this.finalSent = true;
    this.onFinal(n);
  }

  quitToTitle() {
    this.persist();
    if (this.s) this.banked = sim.score(this.s);
    this.view?.dispose();
    this.view = null;
    this.s = null;
    this.screen = "title";
    this.panel = null;
    this.audio.station("off");
    this.bump();
  }

  /** What pressing the action key would do here (for the prompt). */
  prompt(): string | null {
    const s = this.s;
    if (!s || s.down) return null;
    const p = player(s);
    if (!p) return null;
    const car = playerCar(s);
    const key = this.coarse ? "" : "F · ";
    if (car) return null;
    const c = carToEnter(s, p);
    if (c) {
      const spec = VEHICLES[c.kind];
      const drv = s.peds.find((q) => q.id === c.seats[0]);
      return `${key}${drv && drv.state === "ok" ? "Jack" : c.own ? "Get in" : c.locked ? "Break into" : "Steal"} the ${spec.name}`;
    }
    const at = sim.atPoi(s, 3);
    if (at?.kind === "store" && !s.story.run) return (s.story.robbed[at.id] ?? -1e9) > s.t - 600 ? "This Quik Stop was robbed recently" : "Aim a gun at the clerk to hold up the store";
    return null;
  }

  /* -------------------------------------------------------------- keys, mouse */

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    if (this.screen !== "play") return;
    if (e.code === "Escape" || e.code === "KeyP") {
      if (this.panel) this.closePanel();
      else if (e.code === "KeyP" || !document.pointerLockElement) this.openPhone("map");
      return;
    }
    if (e.code === "Tab" || e.code === "KeyM") {
      e.preventDefault();
      if (this.panel === "phone") this.closePanel();
      else this.openPhone(e.code === "KeyM" ? "map" : "missions");
      return;
    }
    if (this.panel) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (!this.keys.has(e.code)) this.edges.add(e.code);
    this.keys.add(e.code);
    if (e.code === "KeyQ") this.edges.add("prev");
    if (e.code === "KeyX" || e.code === "Digit1") this.edges.add("next");
    if (e.code === "Period" || e.code === "KeyN") this.cycleRadio();
    if (e.code === "KeyC") this.switchLead();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clearInput = () => {
    this.keys.clear();
    this.mouse.left = this.mouse.right = false;
    this.touch = { mx: 0, my: 0, fire: false, aim: false, sprint: false, gas: false, brake: false, handbrake: false };
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.screen !== "play" || this.panel || this.coarse) return;
    if (document.pointerLockElement !== this.canvas) {
      this.lockPointer();
      return;
    }
    if (e.button === 0) this.mouse.left = true;
    if (e.button === 2) this.mouse.right = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouse.left = false;
    if (e.button === 2) this.mouse.right = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    this.look.dx += e.movementX;
    this.look.dy += e.movementY;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.screen !== "play" || this.panel) return;
    this.edges.add(e.deltaY > 0 ? "next" : "prev");
  };

  /** Touch: a drag on the right of the screen looks round. */
  touchLook(dx: number, dy: number) {
    this.look.dx += dx * 1.6;
    this.look.dy += dy * 1.6;
  }

  /** Touch: the move stick (−1 … 1 each way). */
  touchStick(mx: number, my: number) {
    this.touch.mx = mx;
    this.touch.my = my;
  }

  /** Touch: a button held down (fire, aim, run, gas, brake, drift). */
  touchHold(k: "fire" | "aim" | "sprint" | "gas" | "brake" | "handbrake", on: boolean) {
    this.touch[k] = on;
  }

  /** Touch: the Aim button stays on until it's tapped again. */
  toggleAim() {
    this.touchAimToggle = !this.touchAimToggle;
    this.bump();
  }

  press(edge: "enter" | "next" | "prev" | "jump" | "reload" | "Space") {
    this.edges.add(edge === "jump" ? "Space" : edge === "reload" ? "KeyR" : edge);
  }

  lockPointer() {
    if (this.coarse || !this.canvas) return;
    try {
      const r = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      r?.catch?.(() => {});
    } catch {
      // keyboard still works
    }
  }

  unlockPointer() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private onLock = () => {
    // Losing the mouse mid-game (Esc) opens the phone like a pause menu.
    if (document.pointerLockElement !== this.canvas && this.screen === "play" && !this.panel && !this.coarse) this.openPhone("map");
  };

  /* -------------------------------------------------------------- read-outs for the HUD */

  hud() {
    const s = this.s!;
    const p = player(s);
    const car = playerCar(s);
    const w = WEAPONS[p.weapon];
    const r = s.story.run;
    const m = r ? missionDef(r.id) : null;
    return {
      money: s.money,
      wanted: s.wanted.level,
      seen: s.wanted.seen,
      hp: Math.max(0, p.hp),
      armor: p.armor,
      weapon: w,
      weaponId: p.weapon,
      clip: p.clip,
      ammo: p.ammo[p.weapon] ?? 0,
      reloading: p.reloadT > 0,
      car: car ? { name: VEHICLES[car.kind].name, speed: Math.abs(Math.hypot(car.vx, car.vz)), hp: car.hp / VEHICLES[car.kind].hp, kind: car.kind } : null,
      where: sim.whereAmI(s),
      clock: s.clock,
      day: s.day,
      objective: r?.text ?? "",
      mission: m?.name ?? "",
      timer: r && r.timer > 0 && /\d+ s|…|\.\.\./.test(r.text) ? r.timer : 0,
      lead: LEADS[s.chars[s.active].id],
      radio: STATIONS.find((x) => x.id === s.radio)!,
      next: nextStory(s),
      storyDone: s.story.done.length,
      storyTotal: STORY.length,
    };
  }
}
