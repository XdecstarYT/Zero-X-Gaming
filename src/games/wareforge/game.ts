/**
 * WareForge's controller: owns the simulation state, the 3D stage, the clock and speed, the
 * selection and build tool, saving, and the score. The React UI reads it through
 * subscribe/getVersion and calls its methods.
 */
import type { GameSettings } from "../types";
import { Sound } from "./audio";
import {
  BELT, BREAKROOM, CHARGER, FENCE, FLOOR, FREEZER, GAME_SECS_PER_REAL, ITEMS, MACHINES, OFFICE, PREFS_KEY, RACK, SAVE_KEY, SITES, SPEEDS,
  type DoorType, type IndustryId, type ItemId, type MachineType, type ManagerId, type StoreKind, type UpgradeId,
} from "./data";
import * as E from "./estate";
import { BuildWorld, type BuildCursor } from "./render/build";
import { StoreWorld } from "./render/shop";
import { Stage } from "./render/stage";
import type { Ghost, Quality } from "./render/world";
import * as sim from "./sim";
import type { Focus, State, StructKind } from "./sim";

export interface Tool {
  kind: StructKind | "remove" | "move";
  type?: MachineType;
  /** Racks: the side they're picked from. Machines: mirrored or not. Conveyors: the way they run. */
  rot: number;
  /** Moving: the struct being moved. */
  id?: number;
}

export type Sheet = null | "site" | "orders" | "buy" | "build" | "fleet" | "upgrades" | "goals" | "company" | "menu" | "alerts" | "help" | "bank" | "estate";
/** What's on screen: the warehouse, one of your building sites, or inside one of your stores. */
export type View = { k: "site" } | { k: "prop"; id: number } | { k: "store"; id: number };
export type EstateTab = "portfolio" | "land" | "market";
/** On a building site: plan a part (one cell, a rectangle, or the outline of one), take one out, or lend a hand. */
export type EstateTool = E.PartKind | "walls" | "erase" | "lay";
/** The building site's own panel. */
export type SitePanel = null | "plan" | "site" | "units" | "money";
export type CompanyTab = "overview" | "map" | "industries" | "production" | "market" | "stores" | "managers";

/** What a tutorial step counts from (taken when the step starts). */
interface TipBase {
  orders: number;
  pos: number;
  structs: number;
}

/** The first-shift tips: one at a time, each done when the player has tried it. */
export const TIPS: { icon: string; text: string; done: (s: State, g: Game, b: TipBase) => boolean }[] = [
  { icon: "💰", text: "Your cash is always at the top. Tap it to open the bank: see where the money goes, and borrow if you run short.", done: (_s, g) => g.sheet === "bank" },
  { icon: "📦", text: "Open Orders and accept an offer: forklifts pick the pallets to a door and a truck takes them away.", done: (s, _g, b) => s.orders.filter((o) => o.state !== "offer" && o.state !== "declined").length > b.orders },
  { icon: "🛒", text: "Short of something? Buy brings pallets in by truck. Frozen goods need freezer racks.", done: (s, _g, b) => s.pos.length > b.pos },
  { icon: "🏗️", text: "Build racks for more room, and machines that turn materials into goods that sell for more.", done: (s, _g, b) => s.structs.length > b.structs },
  { icon: "⏩", text: "Speed up time at the top, and finish today's missions (in Goals) for bonus cash.", done: (_s, g) => g.speed > 1 },
];

const STRUCT_NAME: Record<StructKind, string> = {
  rack: RACK.name, floor: FLOOR.name, charger: CHARGER.name, freezer: FREEZER.name, machine: "Machine", belt: BELT.name, office: OFFICE.name, breakroom: BREAKROOM.name, fence: FENCE.name,
};

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
  /** The camera rides along with this (a truck or a forklift). */
  following: Focus | null = null;
  /** Photo mode: the interface hides. */
  photo = false;
  /** The Company panel's page. */
  companyTab: CompanyTab = "overview";
  /** The city the Stores page starts on (picked on the map). */
  storeCity = "New York";
  view: View = { k: "site" };
  estateTab: EstateTab = "portfolio";
  /** On a site: the tool in hand, the storey it works on, the first corner of a rectangle, the cell tapped, the panel open. */
  etool: EstateTool | null = null;
  anchor: { x: number; z: number } | null = null;
  esel: { x: number; z: number; l: number } | null = null;
  panel: SitePanel = null;
  private build: BuildWorld | null = null;
  private shop: StoreWorld | null = null;
  private cursor: BuildCursor | null = null;
  readonly sound = new Sound();
  private tipBase: TipBase = { orders: 0, pos: 0, structs: 0 };
  private tipAt = -1;
  private heardFx = 0;
  private heardAlert = 0;
  private heardTruck = 0;
  private stage: Stage | null = null;
  private ghost: Ghost | null = null;
  private version = 0;
  private listeners = new Set<() => void>();
  private uiClock = 0;
  private saveClock = 0;
  private toastId = 0;
  private finalSent = false;

  constructor(
    private hooks: Hooks,
    private settings?: Pick<GameSettings, "sound" | "volume">,
  ) {
    this.applySound();
  }

  private applySound() {
    this.sound.enabled = this.prefs.sound && (this.settings?.sound ?? true);
    this.sound.volume = Math.max(0, Math.min(1, this.settings?.volume ?? 1));
  }

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

  /** Auto: phones and lighter machines get medium (sharp, with shadows), big screens high, weak devices low. */
  quality(): Quality {
    if (this.prefs.gfx !== "auto") return this.prefs.gfx;
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return "low";
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    return small || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) ? "medium" : "high";
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
      this.listen(s);
      this.stepTips(s);
    }
    if (this.following && this.stage && this.screen === "play" && !this.stage.world.follow(s, this.following)) this.following = null;
    const v = this.screen === "play" ? this.view : ({ k: "site" } as View);
    const prop = v.k === "prop" ? E.prop(s, v.id) : undefined;
    const store = v.k === "store" ? s.stores.find((x) => x.id === v.id) : undefined;
    // A site sold, or a store closed for good, while you were looking at it.
    if ((v.k === "prop" && !prop) || (v.k === "store" && !store)) this.leaveView();
    if (prop && this.build) {
      this.build.sync(s, prop, dt, { editing: !!this.etool, daylight: this.prefs.daylight });
      this.build.setCursor(this.etool ? this.cursor : null);
      this.build.select(this.etool ? null : this.esel);
    } else if (store && this.shop) this.shop.sync(s, store, dt, { daylight: this.prefs.daylight });
    else
      this.stage?.world.sync(s, dt, this.screen === "play" ? this.sel : null, this.tool ? this.ghost : null, {
        daylight: this.screen === "title" ? "day" : this.prefs.daylight,
        speed: this.screen === "play" && !this.hold && !this.paused ? this.speed : 0,
      });
    if (this.screen !== "play") return;
    this.uiClock += dt;
    if (this.uiClock > 0.25) {
      this.uiClock = 0;
      this.bump();
      if (!s.sandbox) this.hooks.progress(sim.score(s));
      if (s.seasonOver && !this.finalSent) this.submitFinal();
    }
    this.saveClock += dt;
    if (this.saveClock > 20) {
      this.saveClock = 0;
      this.save();
    }
  }

  /** Sounds for what just happened: money in and out, trucks at the gate, trouble, goals. */
  private listen(s: State) {
    const fx = s.fx[s.fx.length - 1];
    if (fx && fx.id > this.heardFx) {
      const fresh = s.fx.filter((f) => f.id > this.heardFx);
      this.heardFx = fx.id;
      if (fresh.some((f) => f.text === "Mission" || f.text === "Goal")) this.sound.play("chime");
      else if (fresh.some((f) => f.amount > 0)) this.sound.play("cash");
      else if (fresh.some((f) => f.amount <= -1000)) this.sound.play("spend");
    }
    const a = s.alerts[s.alerts.length - 1];
    if (a && a.id > this.heardAlert) {
      if (s.alerts.some((x) => x.id > this.heardAlert && x.kind === "bad")) this.sound.play("alarm");
      this.heardAlert = a.id;
    }
    for (const t of s.trucks)
      if (!t.rail && t.state === "arriving" && t.id > this.heardTruck) {
        this.heardTruck = t.id;
        this.sound.play("horn");
      }
  }

  private stepTips(s: State) {
    if (s.tipsOff || s.tip >= TIPS.length) return;
    if (this.tipAt !== s.tip) {
      this.tipAt = s.tip;
      this.tipBase = { orders: s.orders.filter((o) => o.state !== "offer" && o.state !== "declined").length, pos: s.pos.length, structs: s.structs.length };
    }
    if (TIPS[s.tip].done(s, this, this.tipBase)) {
      s.tip++;
      this.sound.play("click");
    }
  }

  private click(nx: number, ny: number) {
    if (this.screen !== "play" || !this.stage || !this.s) return;
    if (this.view.k === "prop") return this.siteClick(nx, ny);
    if (this.view.k === "store") return;
    const w = this.stage.world;
    if (this.tool) {
      const g = w.groundAt(nx, ny);
      if (!g) return;
      if (this.tool.kind === "remove") {
        const f = w.pick(nx, ny);
        if (f?.k === "struct") this.result(sim.remove(this.s, f.id), "Removed (half the cost back)");
        return;
      }
      if (this.tool.kind === "move" && this.tool.id === undefined) {
        // First pick up what's to be moved.
        const f = w.pick(nx, ny);
        if (f?.k === "struct") this.startMove(f.id);
        return;
      }
      const p = this.placement(g.x, g.z);
      if (this.tool.kind === "move") {
        if (!this.result(sim.move(this.s, this.tool.id!, p.x, p.z, p.rot), "Moved")) return;
        const n = sim.structAt(this.s, p.x, p.z);
        this.tool = null;
        this.ghost = null;
        this.sel = n ? { k: "struct", id: n.id } : null;
        this.bump();
        return;
      }
      this.result(sim.place(this.s, p), `${p.kind === "machine" ? MACHINES[p.type!].name : STRUCT_NAME[p.kind]} built`);
      this.hover(nx, ny);
      return;
    }
    this.sel = w.pick(nx, ny);
    this.bump();
  }

  /** What the tool would build (or where it would put what it's moving) at a point on the floor. */
  private placement(gx: number, gz: number): sim.Placement {
    const t = this.tool!;
    const moving = t.kind === "move" ? this.s?.structs[t.id!] : undefined;
    const kind = (moving ? moving.kind : t.kind) as StructKind;
    const type = moving ? moving.m?.type : t.type;
    const fp = sim.footprint({ kind, type, x: 0, z: 0 });
    return { kind, type, rot: t.rot, x: Math.round(gx - fp.w / 2), z: Math.round(gz - fp.d / 2) };
  }

  private hover(nx: number, ny: number) {
    if (this.view.k === "prop") return this.siteHover(nx, ny);
    if (!this.tool || this.tool.kind === "remove" || (this.tool.kind === "move" && this.tool.id === undefined) || !this.stage || !this.s) {
      this.ghost = null;
      return;
    }
    const g = this.stage.world.groundAt(nx, ny);
    if (!g) return;
    const p = this.placement(g.x, g.z);
    const fp = sim.footprint(p);
    let ok: boolean;
    if (this.tool.kind === "move") {
      // Try it with the thing lifted out of its old spot.
      const t = this.s.structs[this.tool.id!];
      const was = t.dead;
      t.dead = true;
      this.s.rev = (this.s.rev ?? 0) + 1;
      ok = !sim.placeError(this.s, p);
      t.dead = was;
      this.s.rev++;
    } else ok = !sim.placeError(this.s, p);
    // The arrow: which side a rack is picked from, the way a conveyor runs, the end goods leave a machine.
    const arrow = p.kind === "rack" || p.kind === "freezer" ? (p.rot ? 3 : 1) : p.kind === "belt" ? p.rot! : p.kind === "machine" ? (p.rot ? 2 : 0) : undefined;
    this.ghost = { x: p.x, z: p.z, w: fp.w, d: fp.d, ok, arrow };
  }

  /* ---------------------------------------------------------------- flow */

  /** Start a site; a sandbox has money no object and no score. */
  newGame(site: string, sandbox = false) {
    this.s = sim.newGame(site, (Date.now() % 100000) + 1, { sandbox });
    this.finalSent = sandbox;
    this.start();
  }

  continueGame() {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      const s = json ? sim.deserialize(json) : null;
      if (!s) return this.say("That save couldn't be read", "bad");
      this.s = s;
      this.finalSent = s.seasonOver || !!s.sandbox;
      this.start();
    } catch {
      this.say("That save couldn't be read", "bad");
    }
  }

  private start() {
    this.leaveView();
    this.screen = "play";
    this.sel = null;
    this.tool = null;
    this.sheet = null;
    this.speed = 1;
    this.hold = false;
    this.seenAlert = this.s!.alerts.length ? this.s!.alerts[this.s!.alerts.length - 1].id - 1 : 0;
    this.following = null;
    this.photo = false;
    this.tipAt = -1;
    this.heardFx = this.s!.fx.length ? this.s!.fx[this.s!.fx.length - 1].id : 0;
    this.heardAlert = this.s!.alerts.length ? this.s!.alerts[this.s!.alerts.length - 1].id : 0;
    this.heardTruck = this.s!.trucks.reduce((m, t) => (t.state !== "transit" ? Math.max(m, t.id) : m), 0);
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
    this.leaveView();
    this.save();
    if (this.s?.seasonOver || this.s?.bankrupt) this.submitFinal();
    this.screen = "title";
    this.s = null;
    this.following = null;
    this.photo = false;
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
    this.applySound();
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
  /** One button for phones: 1× → 2× → 4× → 8× → 1×. */
  cycleSpeed() {
    const i = SPEEDS.indexOf(this.speed as (typeof SPEEDS)[number]);
    this.setSpeed(this.hold ? Math.max(0, i) : (i + 1) % SPEEDS.length);
  }

  /* ---------------------------------------------------------------- UI state */

  select(f: Focus | null, fly = false) {
    this.sel = f;
    if (!f || (this.following && (f.k !== this.following.k || f.id !== this.following.id))) this.following = null;
    if (f && fly && this.s) this.stage?.world.focusOn(this.s, f);
    this.bump();
  }

  /** The Company panel at one of its pages. */
  openCompany(tab: CompanyTab, storeCity?: string) {
    this.companyTab = tab;
    if (storeCity) this.storeCity = storeCity;
    this.sheet = "company";
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
  /** R, or the turn button: conveyors run round four ways; racks face the other side; machines mirror. */
  rotateTool() {
    const t = this.tool;
    if (t) {
      const kind = t.kind === "move" ? this.s?.structs[t.id!]?.kind : t.kind;
      this.tool = { ...t, rot: kind === "belt" ? (t.rot + 1) % 4 : t.rot ? 0 : 1 };
    }
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
  buy(item: ItemId, n: number, rail = false, air = false) {
    if (!this.s) return;
    const po = sim.buy(this.s, item, n, false, rail, air);
    if (po) this.say(`${po.code}: ${po.n} pallets ordered from ${po.supplier}${air ? ", flying in" : rail ? " by rail" : ""}`, "good");
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
  /** Pick something up to put it down somewhere else (empty things only; free). */
  startMove(id: number) {
    const s = this.s;
    const t = s?.structs[id];
    if (!s || !t) return;
    const err = sim.removeError(s, id);
    if (err) return this.say(err, "bad");
    this.setTool({ kind: "move", id, rot: t.rot });
  }
  /** Mirror a machine (materials in at the other end), turn a conveyor, or turn a rack round, where it stands. */
  turn(id: number) {
    const t = this.s?.structs[id];
    if (!this.s || !t) return;
    const rot = t.kind === "belt" ? (t.rot + 1) % 4 : t.rot ? 0 : 1;
    if (!this.result(sim.move(this.s, id, t.x, t.z, rot), t.kind === "machine" ? "Mirrored" : t.kind === "belt" ? "Conveyor turned" : "Turned round")) return;
    const n = sim.structAt(this.s, t.x, t.z);
    this.sel = n ? { k: "struct", id: n.id } : null;
    this.bump();
  }

  /* ---------------------------------------------------------------- industries, stores, managers */

  buyLicence(id: IndustryId) {
    if (this.s) this.result(sim.buyLicence(this.s, id), "Licence granted");
  }
  openStore(kind: StoreKind, city: string) {
    if (this.s) this.result(sim.openStore(this.s, kind, city), "Store opened");
  }
  closeStore(id: number) {
    if (this.s) this.result(sim.closeStore(this.s, id), "Store closed");
  }
  upgradeStore(id: number) {
    if (this.s) this.result(sim.upgradeStore(this.s, id), "Store enlarged");
  }
  setStore(id: number, p: Parameters<typeof sim.setStore>[2]) {
    if (this.s) sim.setStore(this.s, id, p);
    this.bump();
  }
  restock(id: number, lines: { item: ItemId; n: number }[]) {
    if (this.s) this.result(sim.restock(this.s, id, lines), "Restock booked: the forklifts are picking it");
  }
  runCampaign(id: IndustryId) {
    if (this.s) this.result(sim.runCampaign(this.s, id), "Campaign running");
  }
  bidTender(id: number, bid: number) {
    if (this.s) this.result(sim.bidTender(this.s, id, bid), bid > 0 ? `Bid in at ${Math.round(bid * 100)}% of list` : "Bid withdrawn");
  }
  hire(id: ManagerId) {
    if (this.s) sim.hire(this.s, id);
    this.bump();
  }
  /** Reorder every working machine's raw materials automatically when they run low. */
  autoSupply() {
    const s = this.s;
    if (!s) return;
    const items = new Set<ItemId>();
    for (const t of s.structs) if (!t.dead && t.m) for (const i of MACHINES[t.m.type].recipes[t.m.recipe].inputs) if (ITEMS[i].tier === "raw") items.add(i);
    for (const i of items) if (!s.auto[i]) sim.setAuto(s, i, 4, 6);
    this.say(items.size ? `Auto-ordering ${[...items].map((i) => ITEMS[i].name.toLowerCase()).join(", ")}` : "No raw materials to order", items.size ? "good" : "info");
  }

  /* ---------------------------------------------------------------- money, fleet, camera */

  /** Money moves show as a pop by the cash on the top bar, so only a refusal needs a message. */
  borrow(amount: number) {
    if (!this.s) return;
    const err = sim.borrow(this.s, amount);
    if (err) this.say(err, "bad");
    this.bump();
  }
  repay(amount: number | "all") {
    if (!this.s) return;
    const err = sim.repay(this.s, amount === "all" ? Math.min(this.s.loan, Math.floor(this.s.cash)) : amount);
    if (err) this.say(err, "bad");
    this.bump();
  }
  buyOwnTruck() {
    if (this.s) this.result(sim.buyOwnTruck(this.s), "Truck bought: it carries your next shipment");
  }
  upgradeMachine(id: number) {
    if (this.s) this.result(sim.upgradeMachine(this.s, id), "Upgraded to Mk II");
  }
  dismissReport() {
    if (this.s) this.s.report = null;
    this.bump();
  }
  nextTip() {
    if (this.s) this.s.tip++;
    this.bump();
  }
  hideTips() {
    if (this.s) this.s.tipsOff = true;
    this.bump();
  }
  /** Tips back on start again from the first. */
  toggleTips() {
    const s = this.s;
    if (!s) return;
    s.tipsOff = !s.tipsOff;
    if (!s.tipsOff && s.tip >= TIPS.length) s.tip = 0;
    this.bump();
  }
  /** Ride along with a truck or a forklift (again to stop). */
  toggleFollow(f: Focus) {
    const same = this.following && this.following.k === f.k && this.following.id === f.id;
    this.following = same ? null : f;
    if (!same && this.s) this.stage?.world.rig.fly({ dist: Math.min(this.stage.world.rig.goal.dist, 26) });
    this.bump();
  }
  togglePhoto() {
    this.photo = !this.photo;
    if (this.photo) {
      this.sheet = null;
      this.sel = null;
    }
    this.bump();
  }

  /* ---------------------------------------------------------------- views: building sites and stores */

  /** Go to one of your building sites, in 3D. */
  openProperty(id: number) {
    if (!this.s || !this.stage || !E.prop(this.s, id)) return;
    this.shop?.dispose();
    this.shop = null;
    this.build ??= new BuildWorld(this.stage.quality);
    this.stage.setView(this.build);
    this.view = { k: "prop", id };
    this.sheet = null;
    this.sel = null;
    this.tool = null;
    this.etool = null;
    this.anchor = null;
    this.esel = null;
    this.panel = null;
    const p = E.prop(this.s, id)!;
    this.build.viewLevel = 99;
    this.build.editLevel = 0;
    this.build.frame(p);
    this.bump();
  }

  /** Walk round one of your stores, in 3D. */
  visitStore(id: number) {
    if (!this.s || !this.stage || !this.s.stores.some((x) => x.id === id)) return;
    this.build?.dispose();
    this.build = null;
    this.shop?.dispose();
    this.shop = new StoreWorld(this.stage.quality);
    this.stage.setView(this.shop);
    this.view = { k: "store", id };
    this.sheet = null;
    this.sel = null;
    this.tool = null;
    this.bump();
  }

  /** Back to the warehouse. */
  leaveView() {
    if (this.view.k === "site" && !this.build && !this.shop) return;
    this.stage?.setView(null);
    this.build?.dispose();
    this.shop?.dispose();
    this.build = null;
    this.shop = null;
    this.view = { k: "site" };
    this.etool = null;
    this.anchor = null;
    this.esel = null;
    this.panel = null;
    this.cursor = null;
    this.bump();
  }

  openEstate(tab: EstateTab) {
    this.estateTab = tab;
    this.sheet = "estate";
    this.bump();
  }

  /** The storey being built on (and the storeys shown: everything up to it, or all of them). */
  get editLevel() {
    return this.build?.editLevel ?? 0;
  }
  get viewLevel() {
    return this.build?.viewLevel ?? 99;
  }
  setEditLevel(l: number) {
    if (!this.build || !this.s || this.view.k !== "prop") return;
    const p = E.prop(this.s, this.view.id);
    const top = p ? p.storeys : 8;
    this.build.editLevel = Math.max(0, Math.min(top, l));
    if (this.build.viewLevel !== 99) this.build.viewLevel = this.build.editLevel;
    this.anchor = null;
    this.bump();
  }
  /** Show every storey, or cut the building away above the one being built on. */
  toggleCutaway() {
    if (!this.build) return;
    this.build.viewLevel = this.build.viewLevel === 99 ? this.build.editLevel : 99;
    this.bump();
  }

  setEstateTool(t: EstateTool | null) {
    this.etool = t;
    this.anchor = null;
    this.esel = null;
    this.cursor = null;
    if (t) this.panel = null;
    this.bump();
  }

  setPanel(p: SitePanel) {
    this.panel = this.panel === p ? null : p;
    if (this.panel) this.etool = null;
    this.bump();
  }

  /** Tools that work on a rectangle: floors and roofs fill it, walls go round it. */
  private rectTool(t: EstateTool) {
    return t === "found" || t === "slab" || t === "roof" || t === "walls";
  }

  /** The part a tool puts down on a storey (a floor is a foundation on the ground, a slab above). */
  private toolPart(t: EstateTool): E.PartKind | null {
    if (t === "walls") return "wall";
    if (t === "erase" || t === "lay") return null;
    if ((t === "found" || t === "slab") && this.editLevel > 0) return "slab";
    if (t === "found" || t === "slab") return "found";
    return t;
  }

  private siteHover(nx: number, ny: number) {
    if (!this.etool || !this.build || !this.s || this.view.k !== "prop") return;
    const c = this.build.cellAt(nx, ny);
    if (!c) {
      this.cursor = null;
      return;
    }
    const l = this.editLevel;
    const part = this.toolPart(this.etool);
    const a = this.anchor ?? c;
    const fill = part ? E.PARTS[part].layer === "fill" : this.etool !== "erase";
    const ok = part ? !E.planError(this.s, this.view.id, part, c.x, c.z, l) || !!this.anchor : true;
    this.cursor = { x0: a.x, z0: a.z, x1: c.x, z1: c.z, l, fill, ok };
  }

  private siteClick(nx: number, ny: number) {
    const s = this.s;
    if (!s || !this.build || this.view.k !== "prop") return;
    const id = this.view.id;
    const c = this.build.cellAt(nx, ny);
    if (!c) {
      this.anchor = null;
      this.esel = null;
      this.bump();
      return;
    }
    const l = this.editLevel;
    const t = this.etool;
    if (!t) {
      // No tool: look at what's here.
      this.esel = { x: c.x, z: c.z, l };
      this.bump();
      return;
    }
    if (t === "erase") return void this.result(E.unplan(s, id, c.x, c.z, l), "Taken out");
    if (t === "lay") return void this.result(E.layCourse(s, id, c.x, c.z, l), "A course of bricks laid");
    const part = this.toolPart(t)!;
    if (this.rectTool(t)) {
      if (!this.anchor) {
        // First corner: one tap more for the far corner (or the same cell again for just this one).
        this.anchor = c;
        this.siteHover(nx, ny);
        this.bump();
        return;
      }
      const r = E.planRect(s, id, part, this.anchor.x, this.anchor.z, c.x, c.z, l, t === "walls");
      this.anchor = null;
      this.cursor = null;
      if (r.placed) this.say(`${r.placed} ${E.PARTS[part].name.toLowerCase()}${r.placed === 1 ? "" : "s"} planned${r.error ? ` (${r.error.toLowerCase()} for some)` : ""}`, "good");
      else this.say(r.error ?? "Nothing to plan there", "bad");
      this.bump();
      return;
    }
    this.result(E.plan(s, id, part, c.x, c.z, l), `${E.PARTS[part].name} planned`);
  }

  /** Run an estate action on the open site (or any property by id), with a message either way. */
  private est(err: string | null, ok: string) {
    this.result(err, ok);
  }
  get siteId() {
    return this.view.k === "prop" ? this.view.id : -1;
  }
  buyPlot(plot: string) {
    if (!this.s) return;
    if (this.result(E.buyPlot(this.s, plot), "Land bought")) {
      const p = this.s.estate.props[this.s.estate.props.length - 1];
      this.openProperty(p.id);
      this.panel = "plan";
      this.bump();
    }
  }
  /** Lend a hand on the wall tapped: a course of bricks. */
  layCourse(x: number, z: number, l: number) {
    if (this.s && this.view.k === "prop") this.est(E.layCourse(this.s, this.view.id, x, z, l), "A course of bricks laid");
  }
  unplanAt(x: number, z: number, l: number) {
    if (this.s && this.view.k === "prop") this.est(E.unplan(this.s, this.view.id, x, z, l), "Taken out");
  }
  buyListing(id: number) {
    if (this.s) this.est(E.buyListing(this.s, id), "Property bought");
  }
  applyTemplate(id: number, tpl: E.Template, storeys: number) {
    if (this.s) this.est(E.applyTemplate(this.s, id, tpl, storeys), `Plans drawn up: ${E.TEMPLATES[tpl].name.toLowerCase()}`);
  }
  clearPlan(id: number) {
    if (!this.s) return;
    E.clearPlan(this.s, id);
    this.say("Plans cleared (anything started stays)", "info");
  }
  copyUp(id: number) {
    if (!this.s) return;
    const l = Math.max(1, this.editLevel);
    const r = E.copyUp(this.s, id, l);
    if (r.placed) this.say(`Storey ${l + 1}: ${r.placed} parts copied up from below`, "good");
    else this.say(r.error ?? "Nothing to copy", "bad");
  }
  roofOver(id: number) {
    if (!this.s) return;
    const r = E.roofOver(this.s, id);
    if (r.placed) this.say(`${r.placed} roof sections planned`, "good");
    else this.say(r.error ?? "Every top floor has a roof", "bad");
  }
  applyPermit(id: number) {
    if (this.s) this.est(E.applyPermit(this.s, id), "Planning application in: a decision in a few hours");
  }
  applyVariance(id: number) {
    if (this.s) this.est(E.applyVariance(this.s, id), "Height variance applied for");
  }
  hireCrew(id: number, trade: E.Trade, gangs: number, tier: number) {
    if (this.s) this.est(E.hireCrew(this.s, id, trade, gangs, tier), gangs ? `${E.TRADES[trade].name}: ${gangs} gang${gangs === 1 ? "" : "s"} on site` : `${E.TRADES[trade].name} let go`);
  }
  sendToSite(id: number, lines: { item: ItemId; n: number }[]) {
    if (this.s) this.est(E.sendToSite(this.s, id, lines), "Materials on their way from the warehouse");
  }
  orderToSite(id: number, item: ItemId, n: number) {
    if (this.s) this.est(E.orderToSite(this.s, id, item, n), `${n} × ${ITEMS[item].name} ordered to site`);
  }
  setSite(id: number, o: Parameters<typeof E.setSite>[2]) {
    if (!this.s) return;
    E.setSite(this.s, id, o);
    this.bump();
  }
  setRent(id: number, level: number) {
    if (!this.s) return;
    E.setRent(this.s, id, level);
    this.bump();
  }
  fixRequest(id: number, i: number) {
    if (this.s) this.est(E.fixRequest(this.s, id, i), "Fixed");
  }
  evict(id: number, unit: string) {
    if (this.s) this.est(E.evict(this.s, id, unit), "Tenant evicted");
  }
  refurbish(id: number) {
    if (this.s) this.est(E.refurbish(this.s, id), "Refurbished: good as new");
  }
  borrowOn(id: number, amount: number) {
    if (this.s) this.est(E.borrowOn(this.s, id, amount), "Mortgage taken out");
  }
  repayOn(id: number, amount: number) {
    if (this.s) this.est(E.repayOn(this.s, id, amount), "Mortgage paid down");
  }
  listForSale(id: number, ask: number | null) {
    if (this.s) this.est(E.listForSale(this.s, id, ask), ask === null ? "Taken off the market" : "On the market");
  }
  acceptOffer(id: number) {
    if (this.s) this.est(E.acceptOffer(this.s, id), "Sold");
  }
  quickSell(id: number) {
    if (this.s) this.est(E.quickSell(this.s, id), "Sold");
  }

  sites = SITES;

  dispose() {
    this.save();
    this.detach();
    this.sound.dispose();
    this.listeners.clear();
  }
}
