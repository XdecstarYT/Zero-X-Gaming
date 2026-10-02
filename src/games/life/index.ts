import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import { createRng } from "../engine/rng";
import type { Detail } from "../sports-kit/look";
import { BTN, button, card, choice, el, hero, howTo, primaryButton, ResolutionGovernor } from "../sports-kit/ui";
import { CARS, careerById } from "./careers";
import { ageUp, buyCar, bump, choose, continueAs, doActivity, fullName, isAdult, lifeScore, money, moveTo, newLife, parseLife, recordDay, salary, say, type Life, type Sex } from "./life";
import { LifeScreen } from "./lifeui";
import { LifeView, type Look } from "./render";
import type { Pose } from "../code-3/people3d";
import {
  addItem,
  addOpening,
  addWall,
  blocked,
  buildFor,
  changeDue,
  checkItem,
  checkWall,
  clockText,
  colliders,
  customerTotal,
  dayOf,
  decayNeeds,
  deliveryTip,
  driveStep,
  emptyBuild,
  FAMILY_PLOT,
  freshNeeds,
  FURNITURE,
  furnitureDef,
  moodline,
  moodOf,
  NEEDS,
  newCustomer,
  newDelivery,
  newOrder,
  ORDER_OPTIONS,
  orderMatches,
  paintFloor,
  PLACES,
  placeById,
  PLOT_D,
  PLOT_W,
  PLOTS,
  removeAt,
  serveScore,
  shiftPay,
  spawnFor,
  starterBuild,
  toLocal,
  toWorld,
  townSolid,
  usableNear,
  applyFurniture,
  walk,
  type Build,
  type Car,
  type Colliders,
  type FloorMat,
  type FurnitureType,
  type Item,
  type Needs,
  type Order,
  type Place,
} from "./world";

const SAVE_KEY = "zx-life-save";
const PREFS_KEY = "zx-life-prefs";
const GREEN = "#10b981";
const SKINS = ["#f1c9a5", "#e0ac84", "#c68c5d", "#8d5a3b", "#5a3a28"];
const HAIRS = ["#1f140d", "#4a2f1b", "#a16207", "#d6b37a", "#7f1d1d", "#111111"];
const SHIRTS = ["#1e3a8a", "#065f46", "#7c2d12", "#f5f5f4", "#6d28d9", "#be123c", "#0f172a"];

interface Save {
  life: Life;
  needs: Needs;
  minutes: number;
  look: { skin: number; hair: number; shirt: number };
}

type Tool = "walk" | "wall" | "door" | "window" | "floor" | "item" | "delete";
type Shift =
  | { kind: "cashier"; served: number; score: number; c: ReturnType<typeof newCustomer>; t0: number }
  | { kind: "barista"; served: number; score: number; o: Order; pick: Partial<Omit<Order, "name">>; t0: number }
  | { kind: "delivery"; done: number; tips: number; target: ReturnType<typeof newDelivery>; left: number; hasPizza: boolean };

const lookFor = (l: Life, s: Save["look"]): Look => ({ sex: l.me.sex, skin: SKINS[s.skin % SKINS.length], hair: HAIRS[s.hair % HAIRS.length], shirt: SHIRTS[s.shirt % SHIRTS.length], pants: "#1f2937", seed: l.seed % 997 });

/**
 * Life: the flagship. A whole life in Harbour City, year by year on your
 * phone (school, work, love, money, events, generations) and day by day in a
 * photoreal 3D town: walk around, keep your needs up, work real shifts, buy
 * a plot, build your house wall by wall and furnish it.
 */
class LifeGame implements GameModule {
  readonly slug = "life";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private screen: LifeScreen | null = null;
  private view: LifeView | null = null;
  private res = new ResolutionGovernor();
  private coarse = false;
  private gfx: Detail = "high";
  private test = false;
  private save: Save | null = null;
  private lastFrame = 0;

  // The 3D day.
  private mode: "menu" | "life" | "world" = "menu";
  private needs: Needs = freshNeeds();
  private minutes = 7 * 60;
  private me = { x: 0, z: 0, heading: 0, speed: 0, pose: "stand" as Pose, act: 0 };
  private using: { item: Item; plot: number } | null = null;
  private car: Car | null = null;
  private carModel = "";
  private driving = false;
  private col: Colliders | null = null;
  private earned = 0;
  private shiftScore: number | undefined;
  private built = false;
  private shift: Shift | null = null;
  private prompt = "";
  private act: (() => void) | null = null;

  // Build mode.
  private building = false;
  private tool: Tool = "walk";
  private item: FurnitureType = "sofa";
  private rot = 0;
  private floor: FloorMat = "wood";
  private wallStart: { x: number; z: number } | null = null;
  private cursor: { x: number; z: number } | null = null;

  // DOM.
  private hud: HTMLDivElement | null = null;
  private refs: Record<string, HTMLElement> = {};
  private panel: HTMLDivElement | null = null;
  private toastEl: HTMLDivElement | null = null;
  private toastTimer = 0;

  // Input.
  private keys = new Set<string>();
  private stick: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  private orbit: { id: number; x: number; y: number } | null = null;
  private jumpTo: ((x: number, z: number) => void) | null = null;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    try {
      this.gfx = (JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as { gfx?: Detail } | null)?.gfx ?? (this.coarse ? "low" : "high");
    } catch {
      this.gfx = this.coarse ? "low" : "high";
    }
    this.test = new URLSearchParams(window.location.search).has("life");
    this.host = el("div", "absolute inset-0 overflow-hidden bg-slate-950 select-none");
    this.host.style.touchAction = "none";
    opts.root.appendChild(this.host);
    this.menu = el("div", "absolute inset-0 z-30 flex overflow-auto bg-slate-950/95 p-3 pb-14 text-white");
    opts.root.appendChild(this.menu);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
      1000 / 60,
    );
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    this.host.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    this.host.addEventListener("wheel", this.onWheel, { passive: false });
    this.host.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  start() {
    this.loop.pause();
    this.leaveWorld(false);
    this.screen?.root.remove();
    this.screen = null;
    this.showMenu();
  }

  pause() {
    this.loop.pause();
    this.clearInput();
    this.persist();
  }

  resume() {
    if (this.mode !== "world") return;
    this.lastFrame = performance.now();
    this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    this.persist();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.view?.destroy();
    this.host.remove();
    this.menu.remove();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  // --------------------------------------------------------------- saves

  private load(): Save | null {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null") as Save | null;
      if (!s || !parseLife(s.life)) return null;
      return { ...s, needs: s.needs ?? freshNeeds(), minutes: s.minutes ?? 420, look: s.look ?? { skin: 0, hair: 0, shirt: 0 } };
    } catch {
      return null;
    }
  }

  private persist() {
    if (!this.save) return;
    this.save.needs = this.needs;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      // Storage full or blocked: this session still plays.
    }
  }

  private get life() {
    return this.save!.life;
  }

  // ---------------------------------------------------------------- menu

  private showMenu() {
    this.mode = "menu";
    this.menu.hidden = false;
    const saved = this.load();
    let sex: Sex = "F";
    const look = { skin: 1, hair: 0, shirt: 0 };
    const first = el("input", "h-10 w-full rounded-md border-2 border-white/15 bg-black/40 px-3 text-sm text-white focus:border-emerald-400 focus:outline-none");
    first.placeholder = "First name (or leave blank)";
    first.setAttribute("aria-label", "First name");
    first.maxLength = 20;
    const last = el("input", "h-10 w-full rounded-md border-2 border-white/15 bg-black/40 px-3 text-sm text-white focus:border-emerald-400 focus:outline-none");
    last.placeholder = "Last name";
    last.setAttribute("aria-label", "Last name");
    last.maxLength = 20;
    const swatches = (label: string, list: string[], key: keyof typeof look) => {
      const row = el("div", "flex flex-wrap gap-2");
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", label);
      const btns = list.map((c, i) => {
        const b = button("", "h-8 w-8 rounded-full border-2", () => {
          look[key] = i;
          btns.forEach((x, k) => (x.style.borderColor = k === i ? "#34d399" : "rgba(255,255,255,0.2)"));
        });
        b.style.background = c;
        b.style.borderColor = i === look[key] ? "#34d399" : "rgba(255,255,255,0.2)";
        b.setAttribute("aria-label", `${label} ${i + 1}`);
        return b;
      });
      row.append(...btns);
      return el("div", "flex flex-col gap-1", el("span", "text-[11px] font-bold uppercase tracking-wider text-white/60", label), row);
    };
    const born = primaryButton("Be born", GREEN, () => {
      const seed = (Date.now() & 0x7fffffff) ^ 0x1f3;
      const life = newLife(seed, { first: first.value.trim() || undefined, last: last.value.trim() || undefined, sex });
      this.save = { life, needs: freshNeeds(), minutes: 420, look: { ...look } };
      this.persist();
      this.openLife();
    });
    born.setAttribute("data-testid", "life-born");
    const cont = saved
      ? primaryButton(`Continue: ${fullName(saved.life.me)}, ${saved.life.me.age}${saved.life.me.alive ? "" : " (deceased)"}`, "#0f172a", () => {
          this.save = saved;
          this.needs = saved.needs;
          this.minutes = saved.minutes;
          this.openLife();
        })
      : null;
    cont?.setAttribute("data-testid", "life-continue");
    this.menu.replaceChildren(
      el(
        "div",
        "m-auto flex w-full max-w-2xl flex-col items-center gap-3",
        hero("The flagship", "LIFE", "Be born · Grow up · Build · Work · Love · Leave a legacy", "radial-gradient(circle at 20% 0%, #10b981 0, transparent 55%), radial-gradient(circle at 80% 100%, #f59e0b 0, transparent 55%), linear-gradient(#064e3b, #020617)"),
        ...(cont ? [cont] : []),
        card(
          "A new life",
          el("div", "grid gap-2 sm:grid-cols-2", first, last),
          choice(
            "Sex",
            [
              { value: "F" as Sex, title: "Girl", sub: "" },
              { value: "M" as Sex, title: "Boy", sub: "" },
            ],
            sex,
            (v) => (sex = v),
          ),
          el("div", "grid gap-3 sm:grid-cols-3", swatches("Skin", SKINS, "skin"), swatches("Hair", HAIRS, "hair"), swatches("Style", SHIRTS, "shirt")),
        ),
        born,
        card(
          "Graphics",
          choice(
            "Graphics",
            [
              { value: "ultra" as const, title: "Ultra", sub: "Ambient occlusion, soft shadows" },
              { value: "high" as const, title: "High", sub: "Shadows, bloom" },
              { value: "low" as const, title: "Low", sub: "Faster on phones" },
            ],
            this.gfx,
            (g) => {
              this.gfx = g;
              try {
                localStorage.setItem(PREFS_KEY, JSON.stringify({ gfx: g }));
              } catch {
                // Not remembered.
              }
            },
          ),
        ),
        howTo([
          ["Your life", "Every Age Up is a year: school, work, money, love, health and random events where you choose what happens. Use People, Do, Work and Assets to shape it. When you die, carry on as one of your kids."],
          ["Live today", "Step into Harbour City in 3D. Keep your needs up (hunger, energy, hygiene, fun) with what's in your house, walk to Main Street, work real shifts, shop, and drive if you own a car. End the day to bring it back into your year."],
          ["Your house", "At 18, buy or rent a plot at Harbour Realty. Own it and you can build: walls, doors, windows, floors and furniture, paid for with your own money."],
          ["Work", "Get a job on the Work tab. Cashier, barista and pizza delivery shifts are playable; other jobs are a day at the office. Good shifts raise your performance and promotions follow."],
          ["Controls", this.coarse ? "Left thumb walks, drag the right side to look. USE, CAR, BUILD and PHONE buttons." : "WASD walk (Shift to run) · drag to look · wheel zoom · E use / enter · F car · B build · M phone · Esc pause"],
        ]),
      ),
    );
  }

  // ---------------------------------------------------------- life screen

  private openLife(toast?: string) {
    this.menu.hidden = true;
    this.mode = "life";
    this.loop.pause();
    if (this.hud) this.hud.hidden = true;
    if (!this.screen) {
      this.screen = new LifeScreen(this.host, () => this.life, {
        changed: () => {
          this.persist();
          this.screen?.render();
          this.emitter.progress(lifeScore(this.life), performance.now());
        },
        ageUp: () => {
          const out = ageUp(this.life);
          this.needs = { ...this.needs, energy: Math.max(this.needs.energy, 70), hunger: Math.max(this.needs.hunger, 70) };
          this.persist();
          this.screen?.render();
          if (out.length) this.toast(out[out.length - 1]);
          this.emitter.progress(lifeScore(this.life), performance.now());
        },
        liveToday: () => void this.enterWorld(),
        newLife: () => {
          this.save = null;
          this.screen?.root.remove();
          this.screen = null;
          this.showMenu();
        },
        continueAs: (id) => {
          const next = continueAs(this.life, id);
          this.save = { ...this.save!, life: next, needs: freshNeeds(), minutes: 420 };
          this.persist();
          this.screen?.show("life");
          this.toast(`You're now ${fullName(next.me)}, age ${next.me.age}.`);
        },
        finish: () => {
          const score = lifeScore(this.life);
          this.emitter.emit({ kind: "final", score, durationMs: Math.max(this.loop.activeMs, 60_000), ranked: !this.test });
        },
        toast: (t) => this.toast(t),
      });
    }
    this.screen.show();
    if (toast) this.toast(toast);
    if (this.test) this.hooks();
  }

  // ---------------------------------------------------------------- world

  private homePlot() {
    const l = this.life;
    return l.home.plot >= 0 ? l.home.plot : FAMILY_PLOT;
  }
  private canBuild() {
    const l = this.life;
    return l.home.owned && l.home.plot >= 0;
  }
  private buildOf(plot: number): Build {
    const saved = this.life.builds[plot] as Build | undefined;
    if (saved) return saved;
    return buildFor(plot, {});
  }

  private enterWorld() {
    const l = this.life;
    if (l.me.age < 4 || l.prison > 0) return;
    if (this.screen) this.screen.hidden = true;
    this.mode = "world";
    this.earned = 0;
    this.shiftScore = undefined;
    this.built = false;
    this.shift = null;
    this.minutes = Math.floor(this.minutes / 1440) * 1440 + 7 * 60;
    const look = lookFor(l, this.save!.look);
    if (!this.view) {
      try {
        this.view = new LifeView(this.host, this.gfx, look);
      } catch {
        this.openLife("3D graphics aren't available on this device (WebGL is off).");
        return;
      }
      this.view.canvas.setAttribute("data-testid", "life-canvas");
      for (const p of PLOTS) this.view.setBuild(p, this.buildOf(p.id));
    } else {
      this.view.setLook(look);
      for (const p of PLOTS) if (this.life.builds[p.id]) this.view.setBuild(p, this.buildOf(p.id));
    }
    this.col = colliders((id) => this.buildOf(id));
    // Wake up at home, next to your bed.
    const home = PLOTS[this.homePlot()];
    const b = this.buildOf(home.id);
    const bed = b.items.find((i) => i.type === "bed" || i.type === "single");
    const at = bed ? toWorld(home, bed.x + 1.3, bed.z + 0.8) : spawnFor(home.id);
    this.me = { x: at.x, z: at.z, heading: 0, speed: 0, pose: "stand", act: 0 };
    if (bed && blocked(this.col, at.x, at.z)) Object.assign(this.me, spawnFor(home.id));
    this.view.yaw = Math.PI * 0.75;
    this.driving = false;
    const myCar = l.cars.length ? CARS.find((c) => c.id === l.cars[l.cars.length - 1]) : null;
    if (myCar) {
      const d = toWorld(home, PLOT_W / 2 + 3.5, PLOT_D - 4);
      this.car = { x: d.x, z: d.z, heading: home.front === "south" ? 0 : Math.PI, speed: 0 };
      this.carModel = myCar.kind;
      this.view.setCar(myCar.kind, myCar.color);
    } else {
      this.car = null;
      this.view.setCar(null);
    }
    this.buildHud();
    this.lastFrame = performance.now();
    this.loop.start();
    this.toast(`${clockText(this.minutes)}, day ${dayOf(this.minutes)}. ${moodline(this.needs)}.`);
  }

  private leaveWorld(record = true) {
    if (this.mode !== "world") return;
    this.loop.pause();
    this.closePanel();
    this.setBuilding(false);
    if (record && this.save) {
      recordDay(this.life, { needs: moodOf(this.needs), earned: this.earned, shiftScore: this.shiftScore, built: this.built });
      this.minutes = (Math.floor(this.minutes / 1440) + 1) * 1440 + 7 * 60;
      this.save.minutes = this.minutes;
      say(this.life, `A day in Harbour City: ${moodline(this.needs).toLowerCase()}${this.earned ? `, earned ${money(this.earned)}` : ""}.`);
      this.persist();
    }
    this.mode = "life";
    if (this.hud) this.hud.hidden = true;
  }

  private endDay() {
    const summary = `Day over. Mood ${moodOf(this.needs)}%${this.earned ? ` · earned ${money(this.earned)}` : ""}.`;
    this.leaveWorld(true);
    this.openLife(summary);
  }

  // ------------------------------------------------------------------ HUD

  private buildHud() {
    this.hud?.remove();
    const r: Record<string, HTMLElement> = {};
    r.clock = el("span", "font-black tabular-nums");
    r.clock.setAttribute("data-testid", "life-clock");
    r.cash = el("span", "font-bold tabular-nums text-emerald-300");
    r.cash.setAttribute("data-testid", "life-cash");
    r.mood = el("span", "text-[11px] text-white/80");
    const needIcon: Record<string, string> = { hunger: "🍔", energy: "⚡", hygiene: "🚿", fun: "🎮" };
    const needs = el("div", "flex flex-col gap-1");
    for (const n of NEEDS) {
      const fill = el("div", "h-full rounded-full");
      r[`need-${n}`] = fill;
      const row = el("div", "flex items-center gap-1.5 text-xs", el("span", "w-4", needIcon[n]), el("div", "h-2 w-24 overflow-hidden rounded-full bg-white/15", fill));
      row.setAttribute("data-testid", `life-need-${n}`);
      needs.append(row);
    }
    r.prompt = el("div", "pointer-events-auto absolute bottom-24 left-1/2 hidden -translate-x-1/2 cursor-pointer rounded-full bg-black/70 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-sm");
    r.prompt.setAttribute("data-testid", "life-prompt");
    r.prompt.addEventListener("click", () => this.act?.());
    r.shift = el("div", "absolute left-1/2 top-3 hidden -translate-x-1/2 rounded-xl bg-black/70 px-4 py-2 text-center text-sm font-bold text-white");
    r.shift.setAttribute("data-testid", "life-shift");
    const btn = (label: string, testid: string, fn: () => void) => {
      const b = button(label, "pointer-events-auto rounded-xl border-2 border-white/25 bg-black/60 px-3 py-2 text-xs font-black uppercase tracking-wider text-white hover:border-emerald-400", fn);
      b.setAttribute("data-testid", testid);
      return b;
    };
    r.buildBtn = btn("Build", "life-build", () => this.setBuilding(!this.building));
    r.carBtn = btn("Car", "life-car", () => this.toggleCar());
    const phone = btn("📱 Phone", "life-phone", () => this.endDay());
    phone.title = "End the day and go back to your life";
    const buttons = el("div", "absolute bottom-3 right-14 flex flex-wrap justify-end gap-2", r.carBtn, r.buildBtn, phone);
    const top = el(
      "div",
      "absolute left-2 top-2 flex flex-col gap-1 rounded-xl bg-black/55 px-3 py-2 text-white backdrop-blur-sm",
      el("div", "flex items-center gap-3 text-sm", r.clock, r.cash),
      el("span", "text-[11px] text-white/70", `${fullName(this.life.me)} · ${this.life.me.age}`),
      r.mood,
    );
    const right = el("div", "absolute right-2 top-2 rounded-xl bg-black/55 px-3 py-2 text-white backdrop-blur-sm", needs);
    const toast = el("div", "pointer-events-none absolute left-1/2 top-16 max-w-[80%] -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-center text-sm font-bold text-white opacity-0 transition-opacity");
    toast.setAttribute("role", "status");
    this.toastEl = toast;
    r.buildPanel = el("div", "pointer-events-auto absolute bottom-3 left-2 right-36 hidden max-h-[45%] overflow-y-auto rounded-xl bg-black/75 p-2 text-white backdrop-blur-sm");
    r.buildPanel.setAttribute("data-testid", "life-build-panel");
    // Touch stick.
    r.stick = el("div", "absolute bottom-6 left-6 hidden h-28 w-28 rounded-full border-2 border-white/30 bg-black/25");
    r.knob = el("div", "absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60");
    r.stick.append(r.knob);
    if (this.coarse) r.stick.classList.remove("hidden");
    this.hud = el("div", "pointer-events-none absolute inset-0 z-10", top, right, r.shift, r.prompt, r.buildPanel, buttons, r.stick, toast);
    this.hud.setAttribute("data-testid", "life-hud");
    this.refs = r;
    this.host.appendChild(this.hud);
  }

  private refreshHud() {
    const r = this.refs;
    if (!r.clock) return;
    r.clock.textContent = `${clockText(this.minutes)} · Day ${dayOf(this.minutes)}`;
    r.cash.textContent = money(this.life.money);
    r.mood.textContent = moodline(this.needs);
    for (const n of NEEDS) {
      const v = this.needs[n];
      r[`need-${n}`].style.width = `${v}%`;
      r[`need-${n}`].style.background = v > 60 ? "#34d399" : v > 30 ? "#fbbf24" : "#f87171";
    }
    r.prompt.textContent = this.prompt;
    r.prompt.classList.toggle("hidden", !this.prompt);
    r.buildBtn.hidden = !this.canBuild() || this.driving || !!this.shift;
    r.carBtn.hidden = !this.car;
    r.carBtn.textContent = this.driving ? "Get out" : "Drive";
    const s = this.shift;
    r.shift.classList.toggle("hidden", !s || s.kind !== "delivery");
    if (s?.kind === "delivery") r.shift.textContent = `${s.hasPizza ? `Deliver to ${PLOTS[s.target.plot].number} ${PLOTS[s.target.plot].street}` : "Pick up the pizza at Slice of Heaven"} · ${Math.max(0, Math.ceil(s.left))}s · ${s.done}/3 delivered`;
  }

  private toast(t: string) {
    const el2 = this.toastEl;
    if (!el2 || this.mode !== "world") {
      // On the phone, a small banner instead.
      const b = el("div", "pointer-events-none absolute left-1/2 top-4 z-40 max-w-sm -translate-x-1/2 rounded-xl bg-slate-900/90 px-4 py-2 text-center text-sm font-semibold text-white shadow-xl");
      b.textContent = t;
      b.setAttribute("role", "status");
      this.host.appendChild(b);
      setTimeout(() => b.remove(), 2600);
      return;
    }
    el2.textContent = t;
    el2.style.opacity = "1";
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (el2.style.opacity = "0"), 2600);
  }

  // --------------------------------------------------------------- panels

  private openPanel(title: string, testid: string, body: (box: HTMLElement) => void) {
    this.closePanel();
    const box = el("div", "flex flex-col gap-2");
    const close = button("✕", "rounded-md px-2 py-1 text-lg text-white/70 hover:text-white", () => this.closePanel());
    close.setAttribute("aria-label", "Close");
    close.setAttribute("data-testid", "life-close");
    const p = el(
      "div",
      "pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-black/45 p-3",
      el("div", "flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900/95 text-white shadow-2xl", el("div", "flex items-center justify-between border-b border-white/10 px-4 py-2", el("h2", "text-lg font-black", title), close), el("div", "overflow-auto p-4", box)),
    );
    p.setAttribute("data-testid", testid);
    p.addEventListener("pointerdown", (e) => e.stopPropagation());
    body(box);
    this.panel = p;
    this.host.appendChild(p);
  }

  private closePanel() {
    this.panel?.remove();
    this.panel = null;
  }

  private opt(label: string, sub: string, fn: () => void, testid?: string, disabled = false) {
    const b = button("", `${BTN} flex w-full items-center justify-between gap-2 text-left`, fn);
    b.append(el("span", "font-bold", label), el("span", "text-xs font-normal text-white/60", sub));
    if (testid) b.setAttribute("data-testid", testid);
    b.disabled = disabled;
    if (disabled) b.style.opacity = "0.45";
    return b;
  }

  /** Walking into a shop or workplace on Main Street. */
  private enterPlace(p: Place) {
    const l = this.life;
    const job = l.job ? careerById(l.job.career) : null;
    const worksHere = !!job && job.place === p.id;
    const buy = (cost: number, fn: () => void, msg: string) => () => {
      if (l.money < cost) return this.toast("You can't afford that.");
      l.money -= cost;
      fn();
      this.toast(msg);
      this.persist();
    };
    this.openPanel(p.name, `life-place-${p.id}`, (box) => {
      if (worksHere) box.append(this.opt(`Start your shift (${job!.ladder[l.job!.level]})`, `${money(shiftPay(salary(l)))} for the shift`, () => this.startShift(job!.shift), "life-work"));
      switch (p.id) {
        case "freshmart":
          box.append(this.opt("Buy groceries", "$25 · fills you up", buy(25, () => (this.needs.hunger = Math.min(100, this.needs.hunger + 45)), "Groceries: sorted.")));
          break;
        case "cafe":
          box.append(this.opt("Buy a coffee", "$6 · energy and a lift", buy(6, () => ((this.needs.energy = Math.min(100, this.needs.energy + 15)), (this.needs.fun = Math.min(100, this.needs.fun + 5))), "A flat white. Perfect.")));
          break;
        case "pizza":
          box.append(this.opt("Buy a pizza", "$18 · very filling", buy(18, () => (this.needs.hunger = Math.min(100, this.needs.hunger + 60)), "Pepperoni. No regrets.")));
          break;
        case "gym":
          box.append(this.opt("Work out", "$15 · healthier, but tiring", buy(15, () => ((this.needs.energy = Math.max(0, this.needs.energy - 20)), bump(l, "health", 1), (this.minutes += 60)), "Good session.")));
          break;
        case "hospital":
          box.append(this.opt("See a doctor", "Treats conditions", () => this.toast(doActivity(l, "doctor"))));
          break;
        case "realty":
          box.append(el("p", "text-sm text-white/75", isAdult(l) ? "Harbour Realty: every plot on Oak and Elm Street. Buy one (20% deposit) to build on it, or rent." : "Come back when you're 18."));
          if (isAdult(l))
            for (const plot of PLOTS) {
              if (plot.id === FAMILY_PLOT) continue;
              const mine = l.home.plot === plot.id;
              box.append(
                el(
                  "div",
                  "flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm",
                  el("span", "flex-1 font-bold", `${plot.number} ${plot.street}${mine ? " · your home" : ""}`),
                  button(`Buy ${money(plot.price)}`, `${BTN} text-xs`, () => this.move(plot.id, plot.price, true), ),
                  button(`Rent ${money(Math.round(plot.price * 0.045))}/yr`, `${BTN} text-xs`, () => this.move(plot.id, plot.price, false)),
                ),
              );
            }
          break;
        case "carlot":
          if (l.me.age < 16) box.append(el("p", "text-sm text-white/75", "You can buy a car at 16."));
          else
            for (const c of CARS)
              box.append(
                this.opt(c.name, money(c.price), () => {
                  this.toast(buyCar(l, c.id));
                  this.persist();
                  this.closePanel();
                  if (l.cars.includes(c.id)) {
                    this.car = { x: p.door.x, z: p.door.z + 6, heading: Math.PI / 2, speed: 0 };
                    this.carModel = c.kind;
                    this.view?.setCar(c.kind, c.color);
                  }
                }, `life-buycar-${c.id}`, l.money < c.price || l.cars.includes(c.id)),
              );
          break;
        case "furniture":
          box.append(el("p", "text-sm text-white/75", this.canBuild() ? "Head home and press Build: everything here is in your build catalogue." : "Own a home to furnish it. Harbour Realty is just down the street."));
          break;
        case "school":
          if (l.school.stage === "primary" || l.school.stage === "high")
            box.append(
              this.opt("Attend class", "6 hours · better grades", () => {
                l.school.grades = Math.min(100, l.school.grades + 3);
                bump(l, "smarts", 1);
                this.minutes += 360;
                decayNeeds(this.needs, 360);
                this.toast("You paid attention. Mostly.");
                this.closePanel();
              }, "life-class"),
            );
          break;
        case "cityhall":
          box.append(el("p", "text-sm text-white/75", "Job openings are on your phone's Work tab."));
          break;
      }
      if (!box.children.length) box.append(el("p", "text-sm text-white/75", worksHere ? "" : "Nothing for you here right now."));
    });
  }

  private move(plot: number, price: number, buy: boolean) {
    const t = moveTo(this.life, plot, price, buy);
    this.toast(t);
    this.persist();
    this.closePanel();
    this.col = colliders((id) => this.buildOf(id));
  }

  // ---------------------------------------------------------------- shifts

  private startShift(kind: string) {
    this.closePanel();
    const r = createRng((Date.now() & 0xffff) ^ this.life.seed);
    if (kind === "cashier") this.shift = { kind: "cashier", served: 0, score: 0, c: newCustomer(r), t0: performance.now() };
    else if (kind === "barista") this.shift = { kind: "barista", served: 0, score: 0, o: newOrder(r), pick: {}, t0: performance.now() };
    else if (kind === "delivery") {
      this.shift = { kind: "delivery", done: 0, tips: 0, target: newDelivery(r), left: 60, hasPizza: false };
      if (!this.car) {
        const shop = placeById("pizza")!;
        this.car = { x: shop.door.x, z: shop.door.z + 7, heading: Math.PI / 2, speed: 0 };
        this.carModel = "sedan";
        this.view?.setCar("sedan", "#b91c1c");
      }
      this.toast("Grab the pizza at the counter, then drive it there. Press E when you arrive.");
      this.shift.hasPizza = true;
      this.shift.left = this.shift.target.limit;
      return;
    } else {
      // A day at the office: eight hours go by.
      const mood = moodOf(this.needs);
      this.minutes += 480;
      decayNeeds(this.needs, 480, { fun: 1.3 });
      this.shiftScore = Math.round(30 + mood * 0.7);
      this.pay(this.shiftScore);
      this.toast(`Eight hours at work. ${this.shiftScore >= 70 ? "Your boss noticed." : "It was a long day."} +${money(shiftPay(salary(this.life)))}`);
      return;
    }
    this.shiftPanel();
  }

  private pay(score: number, tips = 0) {
    const base = shiftPay(salary(this.life));
    const amt = Math.round(base * (0.6 + score / 250)) + tips;
    this.life.money += amt;
    this.earned += amt;
    this.persist();
    return amt;
  }

  private finishShift() {
    const s = this.shift!;
    let msg = "";
    if (s.kind === "delivery") {
      this.shiftScore = Math.min(100, 40 + s.done * 20);
      const amt = this.pay(this.shiftScore, s.tips + s.done * 12);
      msg = `Shift over: ${s.done} delivered, ${money(amt)} with tips.`;
      if (!this.life.cars.length) {
        this.car = null;
        this.driving = false;
        this.view?.setCar(null);
      }
    } else {
      this.shiftScore = Math.round(s.score / Math.max(1, s.served));
      const amt = this.pay(this.shiftScore);
      msg = `Shift over: ${s.served} served, score ${this.shiftScore}. +${money(amt)}`;
      this.minutes += 240;
      decayNeeds(this.needs, 240);
    }
    this.shift = null;
    this.closePanel();
    this.toast(msg);
  }

  private shiftPanel() {
    const s = this.shift;
    if (!s || s.kind === "delivery") return;
    const r = createRng((performance.now() | 0) ^ 77);
    if (s.kind === "cashier") {
      const c = s.c;
      const scanned = c.scanned.every(Boolean);
      this.openPanel(`Fresh Mart · register 3 (${s.served + 1}/5)`, "life-cashier", (box) => {
        box.append(el("p", "text-sm text-white/80", `${c.name} puts ${c.items.length} items on the belt. Scan them all.`));
        const belt = el("div", "grid grid-cols-3 gap-2");
        c.items.forEach((it, i) => {
          const b = button("", `rounded-lg border-2 px-2 py-3 text-sm font-bold ${c.scanned[i] ? "border-emerald-400 bg-emerald-500/20" : "border-white/20 bg-white/5 hover:border-white/50"}`, () => {
            c.scanned[i] = true;
            this.shiftPanel();
          });
          b.append(el("span", "block h-3 w-full rounded", ""), `${it.name}`, el("span", "block text-[11px] font-normal text-white/60", `$${it.price.toFixed(2)}`));
          (b.firstChild as HTMLElement).style.background = it.color;
          b.setAttribute("data-testid", `life-item-${i}`);
          belt.append(b);
        });
        box.append(belt);
        if (scanned) {
          box.append(el("p", "mt-2 text-sm", `Total $${customerTotal(c).toFixed(2)} · they hand you $${c.paid}. Change?`));
          const due = changeDue(c);
          const opts = [due, due + 1, Math.max(0, due - 0.5), due + 5].map((x) => Math.round(x * 100) / 100);
          const shuffled = opts.sort((a, b) => ((a * 37) % 7) - ((b * 37) % 7));
          const row = el("div", "grid grid-cols-4 gap-2");
          shuffled.forEach((v) =>
            row.append(
              button(`$${v.toFixed(2)}`, `${BTN} text-center`, () => {
                const secs = (performance.now() - s.t0) / 1000;
                const pts = serveScore(c, v, secs);
                s.score += pts;
                s.served++;
                this.toast(Math.abs(v - due) < 0.01 ? `Correct! +${pts}` : `Wrong change. +${pts}`);
                if (s.served >= 5) return this.finishShift();
                s.c = newCustomer(r);
                s.t0 = performance.now();
                this.shiftPanel();
              }),
            ),
          );
          row.setAttribute("data-testid", "life-change");
          box.append(row);
        }
      });
    } else {
      const o = s.o;
      this.openPanel(`Bean There · order ${s.served + 1}/5`, "life-barista", (box) => {
        box.append(el("p", "rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900", `${o.name}: "${o.size} ${o.drink}${o.milk === "None" ? "" : `, ${o.milk.toLowerCase()} milk`}, please."`));
        for (const k of ["size", "drink", "milk"] as const) {
          const row = el("div", "flex flex-wrap gap-1");
          for (const v of ORDER_OPTIONS[k]) {
            const on = s.pick[k] === v;
            row.append(
              button(v, `rounded-full border-2 px-3 py-1 text-xs font-bold ${on ? "border-amber-400 bg-amber-500/25" : "border-white/20"}`, () => {
                (s.pick as Record<string, string>)[k] = v;
                this.shiftPanel();
              }),
            );
          }
          box.append(el("p", "mt-1 text-[11px] font-bold uppercase text-white/60", k), row);
        }
        const serve = primaryButton("Serve", "#b45309", () => {
          const p = s.pick;
          if (!p.size || !p.drink || !p.milk) return this.toast("Finish the order first.");
          const ok = orderMatches(o, p as Omit<Order, "name">);
          const secs = (performance.now() - s.t0) / 1000;
          const pts = ok ? Math.round(70 + Math.max(0, 25 - secs)) : 15;
          s.score += pts;
          s.served++;
          this.toast(ok ? `${o.name} loves it. +${pts}` : `Wrong order. ${o.name} is not impressed.`);
          if (s.served >= 5) return this.finishShift();
          s.o = newOrder(r);
          s.pick = {};
          s.t0 = performance.now();
          this.shiftPanel();
        });
        serve.setAttribute("data-testid", "life-serve");
        box.append(serve);
      });
    }
  }

  // ------------------------------------------------------------------ car

  private toggleCar() {
    if (!this.car) return;
    if (this.driving) {
      this.driving = false;
      const side = this.car.heading + Math.PI / 2;
      const x = this.car.x + Math.sin(side) * 1.8;
      const z = this.car.z + Math.cos(side) * 1.8;
      if (!blocked(this.col!, x, z)) Object.assign(this.me, { x, z });
      else Object.assign(this.me, { x: this.car.x, z: this.car.z + 2.5 });
      this.car.speed = 0;
      return;
    }
    if (this.life.me.age < 16) return this.toast("You're too young to drive.");
    if (Math.hypot(this.car.x - this.me.x, this.car.z - this.me.z) > 4) return this.toast("Walk over to your car first.");
    this.driving = true;
    this.using = null;
  }

  // ---------------------------------------------------------------- build

  private setBuilding(on: boolean) {
    if (on && !this.canBuild()) return this.toast("You need to own your home to build. Visit Harbour Realty.");
    this.building = on;
    this.wallStart = null;
    const plot = PLOTS[this.homePlot()];
    if (on && this.view) {
      const c = toWorld(plot, PLOT_W / 2, PLOT_D / 2);
      this.view.buildFocus.set(c.x, 0, c.z);
      this.view.buildDist = 34;
      this.view.yaw = plot.front === "south" ? 0 : Math.PI;
    }
    this.view?.setGhost(null, null);
    const panel = this.refs.buildPanel;
    if (!panel) return;
    panel.classList.toggle("hidden", !on);
    if (on) this.renderBuildPanel();
  }

  private renderBuildPanel() {
    const panel = this.refs.buildPanel;
    const tools: [Tool, string][] = [
      ["wall", "🧱 Wall"],
      ["door", "🚪 Door"],
      ["window", "🪟 Window"],
      ["floor", "▦ Floor"],
      ["item", "🛋 Furniture"],
      ["delete", "🗑 Delete"],
    ];
    const head = el(
      "div",
      "flex flex-wrap items-center gap-1",
      ...tools.map(([t, label]) => {
        const b = button(label, `rounded-lg border-2 px-2 py-1 text-xs font-bold ${this.tool === t ? "border-emerald-400 bg-emerald-500/20" : "border-white/20"}`, () => {
          this.tool = t;
          this.wallStart = null;
          this.renderBuildPanel();
        });
        b.setAttribute("data-testid", `life-tool-${t}`);
        return b;
      }),
      el("span", "flex-1"),
      button("Done", "rounded-lg bg-emerald-500 px-3 py-1 text-xs font-black text-white", () => this.setBuilding(false)),
    );
    const sub = el("div", "mt-2 flex flex-wrap gap-1");
    if (this.tool === "floor")
      for (const m of ["wood", "tile", "carpet", "marble", "concrete"] as FloorMat[])
        sub.append(button(m, `rounded-full border-2 px-2 py-0.5 text-xs capitalize ${this.floor === m ? "border-emerald-400" : "border-white/20"}`, () => ((this.floor = m), this.renderBuildPanel())));
    if (this.tool === "item")
      for (const t of Object.keys(FURNITURE) as FurnitureType[]) {
        const d = furnitureDef(t);
        const b = button("", `rounded-lg border-2 px-2 py-1 text-left text-[11px] ${this.item === t ? "border-emerald-400 bg-emerald-500/15" : "border-white/15"}`, () => ((this.item = t), this.renderBuildPanel()));
        b.append(el("span", "block font-bold", d.name), el("span", "block text-white/60", `${money(d.price)}${d.action ? ` · ${d.action}` : ""}`));
        b.setAttribute("data-testid", `life-item-${t}`);
        sub.append(b);
      }
    const hint = this.coarse ? "Tap to place · drag to look" : this.tool === "wall" ? "Click a corner, then the other end · right-drag to look · wheel zoom" : this.tool === "item" ? "Click to place · R rotates · right-drag to look" : "Click to use · right-drag to look · wheel zoom";
    panel.replaceChildren(head, sub, el("p", "mt-1 text-[11px] text-white/60", `${hint} · Balance ${money(this.life.money)}`));
  }

  /** The build ghost and what a click would do. */
  private buildPreview() {
    const plot = PLOTS[this.homePlot()];
    const c = this.cursor;
    if (!c || !this.view) return this.view?.setGhost(null, null);
    const l = toLocal(plot, c.x, c.z);
    const b = this.buildOf(plot.id);
    if (this.tool === "wall") {
      const sx = Math.round(l.x);
      const sz = Math.round(l.z);
      if (!this.wallStart) return this.view.setGhost(plot, { kind: "wall", x1: sx, z1: sz, x2: sx, z2: sz, ok: true });
      const end = this.wallEnd(l.x, l.z);
      const ok = checkWall(b, { ...this.wallStart, ...end } as never).ok;
      this.view.setGhost(plot, { kind: "wall", x1: this.wallStart.x, z1: this.wallStart.z, x2: end.x2, z2: end.z2, ok });
    } else if (this.tool === "item") {
      const x = Math.round(l.x * 4) / 4;
      const z = Math.round(l.z * 4) / 4;
      this.view.setGhost(plot, { kind: "item", type: this.item, x, z, rot: this.rot, ok: checkItem(b, { type: this.item, x, z, rot: this.rot }).ok });
    } else this.view.setGhost(plot, { kind: "cell", x: Math.floor(l.x), z: Math.floor(l.z), ok: l.x >= 0 && l.z >= 0 && l.x < PLOT_W && l.z < PLOT_D });
  }

  private wallEnd(x: number, z: number) {
    const s = this.wallStart!;
    const dx = Math.round(x) - s.x;
    const dz = Math.round(z) - s.z;
    return Math.abs(dx) >= Math.abs(dz) ? { x1: s.x, z1: s.z, x2: s.x + dx, z2: s.z } : { x1: s.x, z1: s.z, x2: s.x, z2: s.z + dz };
  }

  private buildClick(wx: number, wz: number) {
    const plot = PLOTS[this.homePlot()];
    const l = toLocal(plot, wx, wz);
    let b = this.life.builds[plot.id] as Build | undefined;
    if (!b) {
      // First edit: start from the house that's there.
      b = structuredClone(buildFor(plot.id, {}));
      this.life.builds[plot.id] = b;
    }
    const spend = (r: { ok: true; cost: number } | { ok: false; why: string }, before: Build) => {
      if (!r.ok) return this.toast(r.why);
      if (this.life.money < r.cost) {
        this.life.builds[plot.id] = before;
        return this.toast(`That costs ${money(r.cost)}.`);
      }
      this.life.money -= r.cost;
      this.built = true;
      this.commitBuild();
    };
    const snapshot = structuredClone(b);
    switch (this.tool) {
      case "wall": {
        if (!this.wallStart) {
          this.wallStart = { x: Math.round(l.x), z: Math.round(l.z) };
          return;
        }
        const end = this.wallEnd(l.x, l.z);
        const r = addWall(b, end);
        if (r.ok) this.wallStart = { x: end.x2, z: end.z2 };
        return spend(r, snapshot);
      }
      case "door":
      case "window":
        return spend(addOpening(b, l.x, l.z, this.tool), snapshot);
      case "floor":
        return spend(paintFloor(b, l.x, l.z, this.floor), snapshot);
      case "item": {
        const x = Math.round(l.x * 4) / 4;
        const z = Math.round(l.z * 4) / 4;
        return spend(addItem(b, { type: this.item, x, z, rot: this.rot }), snapshot);
      }
      case "delete": {
        const refund = removeAt(b, l.x, l.z);
        if (!refund) return this.toast("Nothing there.");
        this.life.money += refund;
        this.toast(`Removed. +${money(refund)}`);
        this.commitBuild();
        return;
      }
    }
  }

  private commitBuild() {
    const plot = PLOTS[this.homePlot()];
    this.view?.setBuild(plot, this.buildOf(plot.id));
    this.col = colliders((id) => this.buildOf(id));
    this.persist();
    this.renderBuildPanel();
  }

  // ----------------------------------------------------------------- loop

  private update(dt: number) {
    if (this.mode !== "world" || !this.view || !this.col) return;
    const sleeping = this.using && furnitureDef(this.using.item.type).need === "energy";
    const speedUp = sleeping ? 40 : 1;
    const mins = dt * speedUp;
    this.minutes += mins;
    if (!this.using) decayNeeds(this.needs, mins, { energy: this.me.speed > 3 ? 1.6 : 1 });
    else {
      decayNeeds(this.needs, mins, { [furnitureDef(this.using.item.type).need!]: 0 });
      applyFurniture(this.needs, this.using.item.type, mins);
      const need = furnitureDef(this.using.item.type).need!;
      if (this.needs[need] >= 99.5) {
        this.toast(sleeping ? `Good morning! It's ${clockText(this.minutes)}.` : "All done.");
        this.stopUsing();
      }
    }
    // Movement.
    const k = (...c: string[]) => c.some((x) => this.keys.has(x));
    let mx = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
    let mz = (k("KeyS", "ArrowDown") ? 1 : 0) - (k("KeyW", "ArrowUp") ? 1 : 0);
    if (this.stick) {
      mx = Math.max(-1, Math.min(1, (this.stick.x - this.stick.x0) / 45));
      mz = Math.max(-1, Math.min(1, (this.stick.y - this.stick.y0) / 45));
    }
    if (this.building) {
      // Pan the build camera.
      const yaw = this.view.yaw;
      const s = 16 * dt;
      this.view.buildFocus.x += (Math.cos(yaw) * mx + Math.sin(yaw) * mz) * s;
      this.view.buildFocus.z += (-Math.sin(yaw) * mx + Math.cos(yaw) * mz) * s;
    } else if (this.driving && this.car) {
      driveStep(this.car, -mz, -mx, dt, (x, z) => townSolid(x, z));
      this.me.x = this.car.x;
      this.me.z = this.car.z;
      this.view.yaw = this.car.heading + Math.PI;
    } else if ((mx || mz) && !this.panel) {
      if (this.using) this.stopUsing();
      const run = k("ShiftLeft", "ShiftRight") || Math.hypot(mx, mz) > 0.95 ? 4.6 : 2.2;
      const yaw = this.view.yaw;
      // Camera-relative: forward is away from the camera.
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = -fz;
      const rz = fx;
      let dx = fx * -mz + rx * -mx;
      let dz = fz * -mz + rz * -mx;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      walk(this.col, this.me, dx * run * dt, dz * run * dt);
      const want = Math.atan2(dx, dz);
      let d = want - this.me.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.me.heading += d * Math.min(1, dt * 12);
      this.me.speed = run;
      this.me.pose = "walk";
    } else if (!this.using) {
      this.me.speed = 0;
      this.me.pose = "stand";
    }
    // Delivery timer.
    if (this.shift?.kind === "delivery") {
      this.shift.left -= dt;
      if (this.shift.left <= 0 && this.shift.hasPizza) {
        this.shift.done = this.shift.done;
        this.toast("Too slow, the pizza's cold. No tip.");
        this.shift.left = 0;
      }
    }
    this.findPrompt();
    if (this.building) this.buildPreview();
  }

  private stopUsing() {
    this.using = null;
    this.me.pose = "stand";
    this.me.act = 0;
  }

  /** What's around you that you can do something with. */
  private findPrompt() {
    this.prompt = "";
    this.act = null;
    if (this.building || this.panel) return;
    const me = this.me;
    if (this.shift?.kind === "delivery" && this.shift.hasPizza) {
      const t = this.shift.target;
      if (Math.hypot(t.x - me.x, t.z - me.z) < 6) {
        this.prompt = "E · Deliver the pizza";
        this.act = () => this.deliver();
        return;
      }
    }
    if (this.driving) {
      this.prompt = this.coarse ? "" : "F · Get out";
      return;
    }
    for (const p of PLACES)
      if (Math.hypot(p.door.x - me.x, p.door.z - me.z) < 3) {
        this.prompt = `E · Enter ${p.name}`;
        this.act = () => this.enterPlace(p);
        return;
      }
    if (this.car && Math.hypot(this.car.x - me.x, this.car.z - me.z) < 3.5) {
      this.prompt = "F · Drive";
      this.act = () => this.toggleCar();
    }
    const plot = PLOTS[this.homePlot()];
    if (this.using) {
      this.prompt = "Move to stop";
      return;
    }
    const it = usableNear(this.buildOf(plot.id), plot, me.x, me.z);
    if (it) {
      const d = furnitureDef(it.type);
      this.prompt = `E · ${d.action}`;
      this.act = () => this.useFurniture(it);
    }
  }

  private useFurniture(it: Item) {
    const plot = PLOTS[this.homePlot()];
    const d = furnitureDef(it.type);
    this.using = { item: it, plot: plot.id };
    const w = toWorld(plot, it.x, it.z);
    const sleep = d.need === "energy";
    const sit = it.type === "sofa" || it.type === "armchair" || it.type === "desk" || it.type === "piano";
    if (sleep || sit) {
      Object.assign(this.me, { x: w.x, z: w.z });
      this.me.pose = sleep ? "sleep" : "sit";
    } else this.me.pose = "stand";
    // Face the furniture.
    this.me.heading = Math.atan2(w.x - this.me.x, w.z - this.me.z) || this.me.heading;
    this.me.speed = 0;
    this.toast(sleep ? "Zzz… (time flies while you sleep)" : `${d.action}…`);
  }

  private deliver() {
    const s = this.shift;
    if (s?.kind !== "delivery") return;
    const tip = deliveryTip(s.left);
    s.tips += tip;
    s.done++;
    this.toast(tip ? `Delivered! $${tip} tip.` : "Delivered. No tip.");
    if (s.done >= 3) return this.finishShift();
    const r = createRng((performance.now() | 0) ^ 99);
    s.target = newDelivery(r, s.target.plot);
    s.left = s.target.limit;
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.mode !== "world" || !this.view) return;
    this.res.tick(dt, now, (k) => this.view?.setResolution(k));
    const home = this.homePlot();
    const plot = PLOTS[home];
    const local = toLocal(plot, this.me.x, this.me.z);
    const inside = local.x > 0 && local.x < PLOT_W && local.z > 0 && local.z < PLOT_D - 6;
    let marker: { x: number; z: number; color: string } | null = null;
    if (this.shift?.kind === "delivery") marker = { x: this.shift.target.x, z: this.shift.target.z, color: "#f97316" };
    const use = this.using ? null : (() => {
      if (this.building || this.driving) return null;
      const it = usableNear(this.buildOf(home), plot, this.me.x, this.me.z);
      if (!it) return null;
      return toWorld(plot, it.x, it.z);
    })();
    this.view.render(
      dt,
      {
        mode: this.building ? "build" : this.driving ? "drive" : "walk",
        minutes: this.minutes,
        me: { ...this.me, visible: !this.driving, act: this.me.act },
        car: this.car ? { ...this.car, visible: true } : null,
        open: this.building || inside ? home : null,
        marker,
        use,
      },
      this.building ? plot : null,
    );
    this.refreshHud();
    this.emitter.progress(lifeScore(this.life), now);
  }

  // ---------------------------------------------------------------- input

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== "world" || !this.loop.isRunning) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "KeyE") this.act?.();
    if (e.code === "KeyF") this.toggleCar();
    if (e.code === "KeyB") this.setBuilding(!this.building);
    if (e.code === "KeyM") this.endDay();
    if (e.code === "KeyR" && this.building) this.rot = (this.rot + 1) % 4;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private clearInput = () => {
    this.keys.clear();
    this.stick = null;
    this.orbit = null;
  };

  private ndc(e: { clientX: number; clientY: number }) {
    const r = this.host.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.mode !== "world" || !this.view || e.target !== this.view.canvas) return;
    const rect = this.host.getBoundingClientRect();
    if (this.building && e.button === 0 && !(e.pointerType === "touch" && this.orbit)) {
      const g = this.view.groundAt(this.ndc(e).x, this.ndc(e).y);
      if (g) this.buildClick(g.x, g.z);
      if (e.pointerType !== "touch") return;
    }
    if (e.pointerType === "touch" && !this.building && e.clientX - rect.left < rect.width * 0.4 && !this.stick) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      return;
    }
    this.orbit = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.mode !== "world" || !this.view) return;
    if (this.building) {
      const g = this.view.groundAt(this.ndc(e).x, this.ndc(e).y);
      if (g) this.cursor = g;
    }
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
      const k = this.refs.knob;
      if (k) k.style.transform = `translate(calc(-50% + ${Math.max(-40, Math.min(40, e.clientX - this.stick.x0))}px), calc(-50% + ${Math.max(-40, Math.min(40, e.clientY - this.stick.y0))}px))`;
      return;
    }
    if (this.orbit && e.pointerId === this.orbit.id && (!this.building || e.buttons & 2 || e.pointerType === "touch")) {
      const dx = e.clientX - this.orbit.x;
      const dy = e.clientY - this.orbit.y;
      this.orbit.x = e.clientX;
      this.orbit.y = e.clientY;
      this.view.yaw -= dx * 0.006;
      this.view.pitch = Math.max(-0.1, Math.min(1.2, this.view.pitch + dy * 0.004));
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      if (this.refs.knob) this.refs.knob.style.transform = "";
    }
    if (this.orbit && e.pointerId === this.orbit.id) this.orbit = null;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.mode !== "world" || !this.view) return;
    e.preventDefault();
    if (this.building) this.view.buildDist = Math.max(10, Math.min(70, this.view.buildDist * Math.exp(e.deltaY * 0.001)));
    else this.view.dist = Math.max(3, Math.min(16, this.view.dist * Math.exp(e.deltaY * 0.001)));
  };

  // ---------------------------------------------------------------- tests

  private hooks() {
    const w = window as unknown as Record<string, unknown>;
    w.__life = {
      life: () => this.save?.life,
      world: () => ({ mode: this.mode, me: this.me, needs: this.needs, minutes: this.minutes, building: this.building, shift: this.shift, prompt: this.prompt, earned: this.earned }),
      /** Teleport (world). */
      goTo: (x: number, z: number) => Object.assign(this.me, { x, z }),
      placeDoor: (id: string) => placeById(id)?.door,
      homeDoorway: () => spawnFor(this.homePlot()),
      /** Skip ahead (years) with the default choices. */
      ageTo: (age: number) => {
        const l = this.life;
        while (l.me.alive && l.me.age < age) {
          while (l.pending.length) choose(l, 0);
          ageUp(l);
        }
        while (l.pending.length) choose(l, 0);
        this.persist();
        this.screen?.render();
      },
      give: (n: number) => {
        this.life.money += n;
        this.persist();
        this.screen?.render();
      },
      act: () => this.act?.(),
      buildAt: (lx: number, lz: number) => {
        const p = PLOTS[this.homePlot()];
        const w2 = toWorld(p, lx, lz);
        this.buildClick(w2.x, w2.z);
      },
      setTool: (t: Tool, item?: FurnitureType) => {
        this.tool = t;
        if (item) this.item = item;
        this.wallStart = null;
        this.renderBuildPanel();
      },
      emptyLot: () => {
        const p = this.homePlot();
        this.life.builds[p] = emptyBuild();
        this.commitBuild();
      },
      starter: () => starterBuild,
      die: () => {
        this.life.me.alive = false;
        this.life.me.cause = "old age";
        this.persist();
        this.screen?.render();
      },
    };
    this.jumpTo = (x, z) => Object.assign(this.me, { x, z });
    void this.jumpTo;
  }
}

const factory: GameFactory = () => new LifeGame();
export default factory;
