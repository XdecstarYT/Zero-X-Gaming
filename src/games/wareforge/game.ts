/**
 * WareForge's controller: owns the simulation state, the 3D stage, the clock and speed, the
 * selection and build tool, saving, and the score. The React UI reads it through
 * subscribe/getVersion and calls its methods.
 */
import { GAME_SECS_PER_REAL, MACHINES, PREFS_KEY, SAVE_KEY, SITES, SPEEDS, type DoorType, type ItemId, type MachineType, type UpgradeId } from "./data";
import { Stage } from "./render/stage";
import type { Ghost, Quality } from "./render/world";
import * as sim from "./sim";
import type { Focus, State, StructKind } from "./sim";

export interface Tool {
  kind: StructKind | "remove";
  type?: MachineType;
  rot: number;
}

export type Sheet = null | "site" | "orders" | "buy" | "build" | "fleet" | "upgrades" | "goals" | "stats" | "menu" | "alerts" | "help";

export interface Prefs {
  gfx: Quality | "auto";
  sound: boolean;
  /** Follow the clock through day and night, or keep it daytime. */
  daylight: "cycle" | "day";
  /** Show the row of figures under the top bar (phones can hide it for more view). */
  kpis?: boolean;
}

export interface Hooks {
  progress: (score: number) => void;
  final: (score: number) => void;
}

const loadPrefs = (): Prefs => {
  try {
    return { gfx: "auto", sound: true, daylight: "cycle", ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return { gfx: "auto", sound: true, daylight: "cycle" };
  }
};

export class Game {
  s: State | null = null;
  /** The world shown behind the title screen. */
  private demo: State = sim.newGame("wh01", 41);
  screen: "title" | "play" = "title";
  sel: Focus | null = null;
  tool: Tool | null = null;
  sheet: Sheet = null;
  speed = 1;
  /** Paused by the player (the platform's pause is separate). */
  hold = false;
  /** Paused by the platform. */
  paused = false;
  prefs: Prefs = loadPrefs();
  toast: { id: number; text: string; kind: "good" | "bad" | "info" } | null = null;
  /** The newest alert the player has seen. */
  seenAlert = 0;
  activeMs = 0;
  private stage: Stage | null = null;
  private ghost: Ghost | null = null;
  private version = 0;
  private listeners = new Set<() => void>();
  private uiClock = 0;
  private saveClock = 0;
  private toastId = 0;
  private finalSent = false;

  constructor(private hooks: Hooks) {}

  /* ---------------------------------------------------------------- React glue */

  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => void this.listeners.delete(f);
  };
  getVersion = () => this.version;
  bump() {
    this.version++;
    this.listeners.forEach((f) => f());
  }

  get state(): State {
    return this.s ?? this.demo;
  }

  get hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------------- the stage */

  quality(): Quality {
    if (this.prefs.gfx !== "auto") return this.prefs.gfx;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    const nav = navigator as Navigator & { deviceMemory?: number };
    return small || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) ? "low" : "high";
  }

  attach(canvas: HTMLCanvasElement) {
    this.stage?.dispose();
    try {
      this.stage = new Stage(canvas, this.quality(), {
        frame: (dt) => this.frame(dt),
        click: (x, y) => this.click(x, y),
        hover: (x, y) => this.hover(x, y),
      });
    } catch {
      this.stage = null;
      this.say("3D isn't available on this device", "bad");
    }
    if (this.stage && this.screen === "title") this.stage.spin = 0.05;
  }

  detach() {
    this.stage?.dispose();
    this.stage = null;
  }

  private frame(dt: number) {
    const s = this.state;
    const live = this.screen === "play" && !this.paused && !this.hold && !s.bankrupt;
    if (this.screen === "title") sim.tick(this.demo, dt * GAME_SECS_PER_REAL * 2);
    else if (live) {
      sim.tick(s, dt * GAME_SECS_PER_REAL * this.speed);
      this.activeMs += dt * 1000;
    }
    this.stage?.world.sync(s, dt, this.screen === "play" ? this.sel : null, this.tool ? this.ghost : null, {
      daylight: this.screen === "title" ? "day" : this.prefs.daylight,
      speed: this.screen === "play" && !this.hold && !this.paused ? this.speed : 0,
    });
    if (this.screen !== "play") return;
    this.uiClock += dt;
    if (this.uiClock > 0.25) {
      this.uiClock = 0;
      this.bump();
      this.hooks.progress(sim.score(s));
      if (s.seasonOver && !this.finalSent) this.submitFinal();
    }
    this.saveClock += dt;
    if (this.saveClock > 20) {
      this.saveClock = 0;
      this.save();
    }
  }

  private click(nx: number, ny: number) {
    if (this.screen !== "play" || !this.stage || !this.s) return;
    const w = this.stage.world;
    if (this.tool) {
      const g = w.groundAt(nx, ny);
      if (!g) return;
      if (this.tool.kind === "remove") {
        const f = w.pick(nx, ny);
        if (f?.k === "struct") this.result(sim.remove(this.s, f.id), "Removed (half the cost back)");
        return;
      }
      const p = this.placement(g.x, g.z);
      this.result(sim.place(this.s, p), `${p.kind === "machine" ? MACHINES[p.type!].name : p.kind === "rack" ? "Rack" : "Floor block"} built`);
      this.hover(nx, ny);
      return;
    }
    this.sel = w.pick(nx, ny);
    this.bump();
  }

  private placement(gx: number, gz: number): sim.Placement {
    const t = this.tool!;
    const fp = sim.footprint({ kind: t.kind as StructKind, type: t.type, x: 0, z: 0 });
    return { kind: t.kind as StructKind, type: t.type, rot: t.rot, x: Math.round(gx - fp.w / 2), z: Math.round(gz - fp.d / 2) };
  }

  private hover(nx: number, ny: number) {
    if (!this.tool || this.tool.kind === "remove" || !this.stage || !this.s) {
      this.ghost = null;
      return;
    }
    const g = this.stage.world.groundAt(nx, ny);
    if (!g) return;
    const p = this.placement(g.x, g.z);
    const fp = sim.footprint(p);
    this.ghost = { x: p.x, z: p.z, w: fp.w, d: fp.d, ok: !sim.placeError(this.s, p), rot: p.rot, rack: p.kind === "rack" };
  }

  /* ---------------------------------------------------------------- flow */

  newGame(site: string) {
    this.s = sim.newGame(site, (Date.now() % 100000) + 1);
    this.start();
  }

  continueGame() {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      const s = json ? sim.deserialize(json) : null;
      if (!s) return this.say("That save couldn't be read", "bad");
      this.s = s;
      this.finalSent = s.seasonOver;
      this.start();
    } catch {
      this.say("That save couldn't be read", "bad");
    }
  }

  private start() {
    this.screen = "play";
    this.sel = null;
    this.tool = null;
    this.sheet = null;
    this.speed = 1;
    this.hold = false;
    this.seenAlert = this.s!.alerts.length ? this.s!.alerts[this.s!.alerts.length - 1].id - 1 : 0;
    if (this.stage) {
      this.stage.spin = 0;
      const w = sim.width(this.s!);
      const wide = w > 30;
      this.stage.world.rig.fly({ dist: (window.innerWidth < window.innerHeight ? 64 : 54) * (w > 50 ? 1.45 : 1), yaw: 0.42, pitch: 0.9 });
      this.stage.world.rig.goal.target.set(wide ? Math.min(w / 2 + 1, 30) : w / 2 + 1, 0, 17);
    }
    this.save();
    this.bump();
  }

  quit() {
    this.save();
    if (this.s?.seasonOver || this.s?.bankrupt) this.submitFinal();
    this.screen = "title";
    this.s = null;
    this.sel = null;
    this.tool = null;
    this.sheet = null;
    if (this.stage) this.stage.spin = 0.05;
    this.bump();
  }

  save() {
    if (!this.s) return;
    try {
      localStorage.setItem(SAVE_KEY, sim.serialize(this.s));
    } catch {
      /* storage full or blocked */
    }
  }

  /** Report the final score once a season (or a bankrupt run) is over. */
  submitFinal() {
    if (!this.s || this.finalSent || !(this.s.seasonOver || this.s.bankrupt)) return;
    this.finalSent = true;
    this.hooks.final(sim.score(this.s));
  }

  /** Carry on past the end of the season. */
  keepGoing() {
    if (this.s) this.s.goals.__seen = true;
    this.bump();
  }

  setPrefs(p: Partial<Prefs>) {
    this.prefs = { ...this.prefs, ...p };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      /* ignore */
    }
    this.bump();
  }

  setSpeed(i: number) {
    this.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i))];
    this.hold = false;
    this.bump();
  }
  togglePause() {
    this.hold = !this.hold;
    this.bump();
  }

  /* ---------------------------------------------------------------- UI state */

  select(f: Focus | null, fly = false) {
    this.sel = f;
    if (f && fly && this.s) this.stage?.world.focusOn(this.s, f);
    this.bump();
  }

  open(sheet: Sheet) {
    this.sheet = this.sheet === sheet ? null : sheet;
    if (sheet === "alerts" && this.s?.alerts.length) this.seenAlert = this.s.alerts[this.s.alerts.length - 1].id;
    this.bump();
  }

  setTool(t: Tool | null) {
    this.tool = t;
    this.ghost = null;
    if (t) this.sel = null;
    this.bump();
  }
  rotateTool() {
    if (this.tool) this.tool = { ...this.tool, rot: this.tool.rot ? 0 : 1 };
    this.bump();
  }

  say(text: string, kind: "good" | "bad" | "info" = "info") {
    this.toast = { id: ++this.toastId, text, kind };
    this.bump();
  }

  private result(err: string | null, ok: string) {
    if (err) this.say(err, "bad");
    else this.say(ok, "good");
    this.bump();
    return !err;
  }

  /* ---------------------------------------------------------------- actions */

  accept(id: number) {
    if (this.s) this.result(sim.accept(this.s, id), "Order confirmed: a truck is booked");
  }
  decline(id: number) {
    if (this.s) sim.decline(this.s, id);
    this.bump();
  }
  cancel(id: number) {
    if (this.s) sim.cancel(this.s, id);
    this.bump();
  }
  callTruck(id: number) {
    if (this.s) this.result(sim.callTruck(this.s, id), "Truck called: here within 15 minutes ($150)");
  }
  buy(item: ItemId, n: number, rail = false) {
    if (!this.s) return;
    const po = sim.buy(this.s, item, n, false, rail);
    if (po) this.say(`${po.code}: ${po.n} pallets ordered from ${po.supplier}${rail ? " by rail" : ""}`, "good");
    else this.say("Not enough cash", "bad");
  }
  acceptContract(id: number) {
    if (this.s) this.result(sim.acceptContract(this.s, id), "Contract signed: the shipments are booked");
  }
  declineContract(id: number) {
    if (this.s) sim.declineContract(this.s, id);
    this.bump();
  }
  setAuto(item: ItemId, min: number, qty: number) {
    if (this.s) sim.setAuto(this.s, item, min, qty);
    this.bump();
  }
  buyForklift() {
    if (this.s) this.result(sim.buyForklift(this.s), "Forklift bought");
  }
  buyUpgrade(id: UpgradeId) {
    if (this.s) this.result(sim.buyUpgrade(this.s, id), "Upgrade done");
  }
  setRecipe(id: number, r: number) {
    if (this.s) this.result(sim.setRecipe(this.s, id, r), "Recipe changed");
  }
  toggleMachine(id: number) {
    if (this.s) sim.toggleMachine(this.s, id);
    this.bump();
  }
  repair(id: number) {
    if (this.s) this.result(sim.repair(this.s, id), "Engineers on the way");
  }
  service(id: number) {
    if (this.s) this.result(sim.service(this.s, id), "Servicing");
  }
  setDoor(i: number, t: DoorType) {
    if (this.s) this.result(sim.setDoorType(this.s, i, t), "Door changed");
  }
  removeStruct(id: number) {
    if (this.s && this.result(sim.remove(this.s, id), "Removed (half the cost back)")) this.sel = null;
  }
  /** Rotate a rack to pick from the other side (only when empty). */
  flipRack(id: number) {
    const s = this.s;
    if (!s) return;
    const t = s.structs[id];
    if (!t || t.kind !== "rack") return;
    const err = sim.removeError(s, id);
    if (err) return this.say(err, "bad");
    t.dead = true;
    const p: sim.Placement = { kind: "rack", x: t.x, z: t.z, rot: t.rot ? 0 : 1 };
    const e2 = sim.placeError(s, p);
    t.dead = false;
    if (e2) return this.say(e2, "bad");
    t.rot = p.rot!;
    this.say("Rack turned round", "good");
  }

  sites = SITES;

  dispose() {
    this.save();
    this.detach();
    this.listeners.clear();
  }
}
