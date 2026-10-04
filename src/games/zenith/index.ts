import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import type { Detail } from "../sports-kit/look";
import { BTN, button, el, hero, howTo, primaryButton, ResolutionGovernor } from "../sports-kit/ui";
import {
  bulldoze,
  canService,
  connected,
  dateOf,
  demand,
  HIGH_DENSITY_AT,
  idx,
  inMap,
  loadCity,
  maps,
  MILESTONES,
  money,
  N,
  nearRoad,
  newCity,
  OCCUPANTS,
  placeRoad,
  placeService,
  roadCost,
  roadPath,
  SAVE_KEY,
  score,
  served,
  SERVICE_IDS,
  SERVICES,
  simDay,
  stats,
  tileAt,
  xy,
  zoneRect,
  type City,
  type Density,
  type Maps,
  type ServiceKind,
  type Stats,
  type Zone,
} from "./logic";
import { Vector3 } from "three";
import { CityView, type Overlay } from "./render";

/**
 * Zenith, the ZLink+ city builder: lay roads off the highway, paint zones,
 * keep the lights on and the taps running, and watch a photoreal city grow
 * under a moving sun. Saves on this device; bank your population as a score
 * whenever you like.
 */

type Tool =
  | { kind: "road" }
  | { kind: "zone"; zone: Zone | null; density: Density }
  | { kind: "service"; svc: ServiceKind }
  | { kind: "bulldoze" };

type Tray = "roads" | "zones" | "power" | "water" | "services" | "parks" | "views" | null;
type Clock = "cycle" | "day" | "dusk" | "night";

interface Prefs {
  gfx?: Detail;
  clock?: Clock;
}

const PREFS = "zx-zenith-prefs";
const SKY = "#38bdf8";
const MINT = "#34d399";
/** Real seconds per city day at 1×. */
const DAY_SECONDS = 1.6;
const SPEEDS = [0, 1, 2, 4];
const ZONE_NAME: Record<Zone, string> = { R: "Residential", C: "Commercial", I: "Industrial" };
const ZONE_HUE: Record<Zone, string> = { R: "#4ade80", C: "#60a5fa", I: "#facc15" };
const OVERLAYS: { id: Overlay; name: string; icon: string }[] = [
  { id: "none", name: "Off", icon: "🏙️" },
  { id: "power", name: "Power & water", icon: "⚡" },
  { id: "value", name: "Land value", icon: "💎" },
  { id: "pollution", name: "Pollution", icon: "☁️" },
  { id: "police", name: "Police", icon: "🚓" },
  { id: "fire", name: "Fire", icon: "🚒" },
  { id: "health", name: "Health", icon: "⚕️" },
  { id: "school", name: "Education", icon: "🏫" },
];
const GROUP_OF: Record<Exclude<Tray, "roads" | "zones" | "views" | null>, ServiceKind[]> = {
  power: SERVICE_IDS.filter((k) => SERVICES[k].group === "power"),
  water: SERVICE_IDS.filter((k) => SERVICES[k].group === "water"),
  services: SERVICE_IDS.filter((k) => ["safety", "health", "education"].includes(SERVICES[k].group)),
  parks: SERVICE_IDS.filter((k) => SERVICES[k].group === "parks"),
};
const CHIP = "pointer-events-auto rounded-lg border border-white/10 bg-slate-950/80 text-white shadow-lg backdrop-blur";

class Zenith implements GameModule {
  readonly slug = "zenith";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private hud!: HTMLDivElement;
  private view: CityView | null = null;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private res = new ResolutionGovernor();
  private prefs: Prefs = {};
  private coarse = false;
  private mode: "menu" | "city" = "menu";
  private c!: City;
  private m!: Maps;
  private s!: Stats;
  private tool: Tool | null = null;
  private tray: Tray = null;
  private overlay: Overlay = "none";
  private speed = 1;
  private simAcc = 0;
  private clockT = 0.36;
  private lastFrame = 0;
  private saveTimer = 0;
  private photo = false;
  private dirty = true;
  // Input.
  private keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: {
    id: number;
    x: number;
    y: number;
    moved: number;
    button: number;
    shift: boolean;
    anchor: { x: number; y: number } | null;
  } | null = null;
  private gesture: { dist: number; angle: number; mid: { x: number; y: number } } | null = null;
  private hover: { x: number; y: number } | null = null;
  // HUD parts.
  private ui: Record<string, HTMLElement> = {};
  private toastTimer = 0;
  private ac: AudioContext | null = null;
  private paintTray: (() => void) | null = null;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    try {
      this.prefs = (JSON.parse(localStorage.getItem(PREFS) ?? "null") as Prefs | null) ?? {};
    } catch {
      this.prefs = {};
    }
    this.host = el("div", "absolute inset-0 overflow-hidden bg-slate-950 select-none");
    this.host.style.touchAction = "none";
    opts.root.appendChild(this.host);
    this.hud = el("div", "pointer-events-none absolute inset-0 z-20 text-white");
    this.hud.hidden = true;
    opts.root.appendChild(this.hud);
    this.menu = el("div", "absolute inset-0 z-30 flex overflow-auto bg-slate-950/95 p-3 pb-14 text-white");
    opts.root.appendChild(this.menu);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
      1000 / 30,
    );
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    this.host.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    this.host.addEventListener("pointerleave", this.onLeave);
    this.host.addEventListener("wheel", this.onWheel, { passive: false });
    this.host.addEventListener("contextmenu", (e) => e.preventDefault());
    this.hooks();
  }

  start() {
    this.loop.pause();
    this.showMenu();
  }

  pause() {
    this.loop.pause();
    this.clearInput();
    this.save();
  }

  resume() {
    if (this.mode !== "city") return;
    this.lastFrame = performance.now();
    this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    this.save();
    window.clearTimeout(this.toastTimer);
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.view?.destroy();
    this.host.remove();
    this.hud.remove();
    this.menu.remove();
    this.emitter.clear();
    void this.ac?.close();
    delete (window as unknown as Record<string, unknown>).__zenith;
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  private savePrefs() {
    try {
      localStorage.setItem(PREFS, JSON.stringify(this.prefs));
    } catch {
      // Not remembered.
    }
  }

  private save() {
    if (this.mode !== "city" || !this.c) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.c));
    } catch {
      // Storage full or blocked: the city still plays.
    }
  }

  // ------------------------------------------------------------------ menu

  private showMenu(note?: string) {
    this.mode = "menu";
    this.loop.pause();
    this.menu.hidden = false;
    this.hud.hidden = true;
    let saved: City | null = null;
    try {
      saved = loadCity(localStorage.getItem(SAVE_KEY));
    } catch {
      saved = null;
    }
    const name = el(
      "input",
      "w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-white",
    ) as HTMLInputElement;
    name.placeholder = "Name your city";
    name.maxLength = 24;
    name.value = "Zenith";
    name.setAttribute("data-testid", "zn-name");
    const box = el(
      "div",
      "m-auto flex w-full max-w-3xl flex-col gap-4",
      hero(
        "ZLink+ exclusive · city builder",
        "Zenith",
        "Roads, zones, power, water and a skyline that's all yours, under a real sun.",
        "linear-gradient(135deg,#0c4a6e,#0f172a 55%,#065f46)",
      ),
    );
    if (note) box.append(el("p", "rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200", note));
    const gfx = el("div", "flex flex-wrap items-center gap-1.5 text-xs", el("span", "w-16 text-white/60", "Graphics"));
    for (const g of ["low", "high", "ultra"] as Detail[]) {
      const on = (this.prefs.gfx ?? (this.coarse ? "low" : "high")) === g;
      const b = button(
        g,
        `rounded-full border-2 px-3 py-1 font-bold capitalize ${on ? "border-sky-400" : "border-white/20"}`,
        () => {
          this.prefs.gfx = g;
          this.savePrefs();
          this.showMenu();
        },
      );
      b.setAttribute("aria-pressed", String(on));
      gfx.append(b);
    }
    const play = el("div", "flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4");
    if (saved) {
      const s = stats(saved);
      const cont = primaryButton(`Continue ${saved.name}`, SKY, () => this.openCity(saved!));
      cont.setAttribute("data-testid", "zn-continue");
      play.append(
        el(
          "p",
          "text-sm text-white/70",
          `${s.population.toLocaleString()} people · ${money(saved.money)} · ${MILESTONES[saved.milestone].name} · ${dateOf(saved.day)}`,
        ),
        cont,
      );
    }
    const fresh = button(
      saved ? "Found a new city (replaces your save)" : "Found your city",
      `${saved ? BTN : "rounded-md px-6 py-3 font-display text-base font-black uppercase tracking-[0.2em] text-slate-950"} w-full`,
      () => {
        this.openCity(newCity(name.value.trim() || "Zenith", Math.floor(Math.random() * 1e9)));
      },
    );
    if (!saved) fresh.style.background = SKY;
    fresh.setAttribute("data-testid", "zn-new");
    play.append(el("label", "flex flex-col gap-1 text-xs text-white/60", "City name", name), fresh, gfx);
    box.append(
      el(
        "div",
        "grid gap-4 md:grid-cols-2",
        play,
        el(
          "div",
          "flex flex-col gap-2 rounded-2xl border border-sky-400/30 bg-sky-500/5 p-4 text-sm",
          el("p", "font-display font-black uppercase tracking-wide text-sky-300", "Your city"),
          ...[
            "A 576 m square of river valley, woods and a highway in",
            "Homes, shops and industry in low and high density, three levels each",
            "Coal, wind and solar power; water towers and riverside pumps",
            "Police, fire, clinics, hospitals, schools, parks and plazas",
            "Land value, pollution and coverage views",
            "Five milestones from Hamlet to Metropolis, each with a grant",
            "Day and night, streetlights, traffic, smoke from the chimneys",
          ].map((t) => el("p", "text-white/75", `• ${t}`)),
        ),
      ),
      howTo([
        ["Roads", "Pick 🛣 Roads and drag from the highway (or any road) to lay one. Bridges cost more."],
        [
          "Zones",
          "Pick 🏘 Zones, then drag a rectangle beside a road: green homes, blue shops, yellow industry. Buildings move in on their own.",
        ],
        [
          "Utilities",
          "Every building needs power and water. Build a power plant and a water tower beside a road early.",
        ],
        [
          "Grow",
          "The demand bars show what people want. Services and parks raise land value, and valuable land levels buildings up.",
        ],
        ["Money", "Taxes come in and upkeep goes out every day. Set tax rates in 💰 Budget."],
        [
          "Camera",
          "Drag to pan, right-drag (or two fingers) to rotate, wheel or pinch to zoom. WASD and Q/E work too.",
        ],
        ["Score", "Your population is your score: bank it from 🏛 City whenever you like."],
      ]),
    );
    this.menu.replaceChildren(box);
  }

  private openCity(c: City) {
    this.c = c;
    if (!this.view) {
      try {
        this.view = new CityView(this.host, this.prefs.gfx ?? (this.coarse ? "low" : "high"));
      } catch {
        return this.showMenu("3D graphics aren't available on this device (WebGL is off).");
      }
      this.view.canvas.setAttribute("data-testid", "zn-canvas");
      this.view.canvas.setAttribute("aria-label", "Your city. Use the toolbar to build.");
    }
    this.mode = "city";
    this.menu.hidden = true;
    this.hud.hidden = false;
    this.tool = null;
    this.tray = null;
    this.overlay = "none";
    this.speed = 1;
    this.simAcc = 0;
    this.photo = false;
    this.refresh();
    this.buildHud();
    this.save();
    this.lastFrame = performance.now();
    this.loop.start();
    this.toast(
      c.day === 1 ? "Welcome to the valley. Run a road off the highway to begin." : `Welcome back to ${c.name}.`,
    );
  }

  // ------------------------------------------------------------------ sim

  /** Recompute the city's numbers and bring the 3D view in line. */
  private refresh() {
    this.m = maps(this.c);
    this.s = stats(this.c, this.m);
    this.view?.sync(this.c);
    if (this.overlay !== "none") this.view?.setOverlay(this.overlay, this.c, this.m, (i) => this.powered(i));
    this.dirty = true;
    this.emitter.progress(this.s.population, performance.now(), 500);
  }

  private powered(i: number) {
    const sv = served(this.c, i, this.s);
    return sv.power && sv.water && !!this.m.access[i];
  }

  private update(dt: number) {
    if (this.mode !== "city") return;
    this.panKeys(dt);
    this.clockT =
      this.prefs.clock && this.prefs.clock !== "cycle"
        ? { day: 0.45, dusk: 0.8, night: 0.97 }[this.prefs.clock]
        : (this.clockT + dt / 240) % 1;
    if (this.speed && !this.photo) {
      this.simAcc += dt * SPEEDS[this.speed];
      if (this.simAcc >= DAY_SECONDS) {
        this.simAcc = 0;
        this.day();
      }
    }
    this.saveTimer += dt;
    if (this.saveTimer > 10) {
      this.saveTimer = 0;
      this.save();
    }
  }

  private day() {
    const before = this.c.money;
    const rep = simDay(this.c);
    this.refresh();
    if (rep.milestone) {
      this.toast(
        `🎉 ${this.c.name} is now a ${rep.milestone}! Grant: ${money(MILESTONES[this.c.milestone].reward)}. New buildings unlocked.`,
        6,
      );
      this.chime([523, 659, 784, 1047]);
    }
    if (rep.abandoned)
      this.toast(
        `⚠️ ${rep.abandoned} building${rep.abandoned > 1 ? "s" : ""} emptied out: they had no power, water or road for too long.`,
      );
    if (before >= 0 && this.c.money < 0)
      this.toast("🔻 The city is in debt. Raise taxes or cut services in 💰 Budget.", 5);
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.mode !== "city" || !this.view) return;
    this.res.tick(dt, now, (k) => this.view?.pipe.setResolution(k));
    const traffic = Math.min(240, this.s.population / 10 + (this.s.jobsC + this.s.jobsI) / 16 + 4);
    this.view.frame(dt, this.clockT, traffic);
    if (this.dirty) {
      this.dirty = false;
      this.paintHud();
    }
  }

  // ------------------------------------------------------------------ hud

  private buildHud() {
    const ui = this.ui;
    // Top: the city at a glance.
    ui.name = el("p", "truncate font-display text-sm font-black uppercase tracking-wide sm:text-base");
    ui.milestone = el("p", "text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300");
    ui.pop = el("span", "font-black");
    ui.money = el("span", "font-black");
    ui.net = el("span", "text-[10px]");
    ui.date = el("span", "text-white/70");
    ui.happy = el("span", "");
    const demandBars = el(
      "div",
      "flex items-end gap-1",
      ...(["R", "C", "I"] as Zone[]).map((z) => {
        const bar = el("div", "w-full rounded-sm transition-all");
        bar.style.background = ZONE_HUE[z];
        ui[`d${z}`] = bar;
        return el(
          "div",
          "flex w-3 flex-col items-center gap-0.5",
          el("div", "relative flex h-7 w-full items-end overflow-hidden rounded-sm bg-white/10", bar),
          el("span", "text-[9px] font-bold text-white/70", z),
        );
      }),
    );
    demandBars.setAttribute("title", "Demand: residential, commercial, industrial");
    demandBars.setAttribute("aria-label", "Demand for homes, shops and industry");
    const speeds = el("div", "flex gap-1");
    ["⏸", "▶", "▶▶", "▶▶▶"].forEach((label, k) => {
      const b = button(label, "min-w-9 rounded-md border border-white/15 px-2 py-1 text-xs font-black", () =>
        this.setSpeed(k),
      );
      b.setAttribute("aria-label", k ? `Speed ${SPEEDS[k]}×` : "Pause the city");
      b.setAttribute("data-testid", `zn-speed-${k}`);
      ui[`s${k}`] = b;
      speeds.append(b);
    });
    const top = el(
      "div",
      `${CHIP} absolute left-2 right-2 top-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs sm:right-auto sm:max-w-[min(100%,860px)]`,
      el("div", "min-w-0 max-w-40", ui.name, ui.milestone),
      el(
        "div",
        "flex flex-col",
        el("span", "text-[10px] uppercase tracking-wider text-white/50", "Population"),
        ui.pop,
      ),
      el(
        "div",
        "flex flex-col",
        el("span", "text-[10px] uppercase tracking-wider text-white/50", "Funds"),
        el("span", "flex items-baseline gap-1", ui.money, ui.net),
      ),
      el(
        "div",
        "hidden flex-col md:flex",
        el("span", "text-[10px] uppercase tracking-wider text-white/50", "Date"),
        ui.date,
      ),
      el(
        "div",
        "hidden flex-col sm:flex",
        el("span", "text-[10px] uppercase tracking-wider text-white/50", "Happiness"),
        ui.happy,
      ),
      demandBars,
      speeds,
    );
    top.setAttribute("data-testid", "zn-hud");
    ui.pop.setAttribute("data-testid", "zn-pop");
    ui.money.setAttribute("data-testid", "zn-money");

    // The advisor line and toasts.
    ui.advice = el(
      "p",
      "pointer-events-none absolute left-2 top-[4.6rem] max-w-sm rounded-md bg-slate-950/70 px-2 py-1 text-[11px] text-sky-100 sm:top-16",
    );
    ui.toast = el(
      "div",
      "pointer-events-none absolute left-1/2 top-24 w-[min(92%,30rem)] -translate-x-1/2 rounded-lg bg-slate-900/90 px-3 py-2 text-center text-sm font-semibold opacity-0 shadow-xl transition-opacity",
    );
    ui.toast.setAttribute("role", "status");
    ui.toast.setAttribute("data-testid", "zn-toast");
    ui.tip = el(
      "div",
      "pointer-events-none absolute z-10 hidden rounded bg-black/80 px-2 py-0.5 text-[11px] font-bold",
    );

    // Bottom: the toolbar and its trays.
    ui.tray = el(
      "div",
      `${CHIP} absolute bottom-[4.2rem] left-1/2 hidden max-w-[calc(100%-1rem)] -translate-x-1/2 gap-1 overflow-x-auto p-1.5`,
    );
    ui.tray.setAttribute("data-testid", "zn-tray");
    // Leaves room on the right for the stage's pause button.
    const bar = el("div", `${CHIP} flex max-w-full gap-0.5 overflow-x-auto p-1`);
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Build tools");
    const tools: [string, string, () => void][] = [
      ["roads", "🛣️ Roads", () => this.openTray("roads")],
      ["zones", "🏘️ Zones", () => this.openTray("zones")],
      ["power", "⚡ Power", () => this.openTray("power")],
      ["water", "💧 Water", () => this.openTray("water")],
      ["services", "🚒 Services", () => this.openTray("services")],
      ["parks", "🌳 Parks", () => this.openTray("parks")],
      ["bulldoze", "🚜 Bulldoze", () => this.setTool(this.tool?.kind === "bulldoze" ? null : { kind: "bulldoze" })],
      ["views", "🗺️ Views", () => this.openTray("views")],
      ["budget", "💰 Budget", () => this.budgetPanel()],
      ["city", "🏛️ City", () => this.cityPanel()],
      ["photo", "📷", () => this.setPhoto(true)],
    ];
    for (const [id, label, fn] of tools) {
      const [icon, ...words] = label.split(" ");
      const b = button(
        "",
        "flex shrink-0 flex-col items-center rounded-md border border-transparent px-2 py-1 text-[10px] font-bold leading-tight hover:bg-white/10 sm:text-[11px]",
        fn,
      );
      b.append(el("span", "text-base leading-none sm:text-lg", icon), el("span", "", words.join(" ") || "Photo"));
      b.setAttribute("data-testid", `zn-tool-${id}`);
      if (id === "photo") b.setAttribute("aria-label", "Photo mode");
      ui[`t${id}`] = b;
      bar.append(b);
    }
    ui.panel = el(
      "div",
      "pointer-events-auto absolute inset-x-2 bottom-[4.4rem] top-[4.6rem] z-10 mx-auto hidden max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/92 shadow-2xl backdrop-blur sm:top-16",
    );
    ui.exitPhoto = button(
      "Exit photo mode",
      `${CHIP} absolute bottom-3 right-3 hidden px-3 py-2 text-xs font-bold`,
      () => this.setPhoto(false),
    );
    const dock = el("div", "pointer-events-none absolute bottom-2 left-2 right-14 flex justify-center", bar);
    this.hud.replaceChildren(top, ui.advice, ui.toast, ui.tip, ui.tray, ui.panel, dock, ui.exitPhoto);
    this.paintHud();
  }

  private paintHud() {
    const { ui, c, s } = this;
    if (!ui.name) return;
    ui.name.textContent = c.name;
    ui.milestone.textContent = MILESTONES[c.milestone].name;
    ui.pop.textContent = s.population.toLocaleString();
    ui.money.textContent = money(c.money);
    ui.money.className = `font-black ${c.money < 0 ? "text-red-300" : ""}`;
    const net = s.income - s.upkeep;
    ui.net.textContent = `${net >= 0 ? "+" : ""}${money(net)}/day`;
    ui.net.className = `text-[10px] ${net >= 0 ? "text-emerald-300" : "text-red-300"}`;
    ui.date.textContent = dateOf(c.day);
    ui.happy.textContent = `${s.happiness >= 70 ? "😀" : s.happiness >= 45 ? "🙂" : "😟"} ${s.happiness}%`;
    const d = demand(c, s);
    for (const z of ["R", "C", "I"] as Zone[]) {
      const bar = ui[`d${z}`];
      bar.style.height = `${Math.max(4, Math.round(Math.max(0, d[z]) * 100))}%`;
      bar.style.opacity = d[z] > 0 ? "1" : "0.35";
    }
    SPEEDS.forEach((_, k) => {
      const b = ui[`s${k}`];
      b.setAttribute("aria-pressed", String(this.speed === k));
      b.style.background = this.speed === k ? SKY : "";
      b.style.color = this.speed === k ? "#0f172a" : "";
    });
    for (const id of ["roads", "zones", "power", "water", "services", "parks", "views", "bulldoze"]) {
      const on = this.tray === id || (id === "bulldoze" && this.tool?.kind === "bulldoze");
      ui[`t${id}`].style.borderColor = on ? SKY : "transparent";
      ui[`t${id}`].setAttribute("aria-pressed", String(on));
    }
    ui.advice.textContent = this.advice();
    if (this.ui.panel.dataset.kind && !this.ui.panel.classList.contains("hidden")) this.repaintPanel();
  }

  /** What the city needs most, in a sentence. */
  private advice() {
    const { c, s } = this;
    const roads = c.tiles.filter((t) => t.road && !t.highway).length;
    const zoned = c.tiles.filter((t) => t.zone).length;
    if (this.tool) return this.toolHint();
    if (!roads) return "💡 Drag a road off the highway on the left with 🛣️ Roads.";
    if (!zoned) return "💡 Zone some land beside your roads with 🏘️ Zones.";
    if (!s.powerSupply) return "💡 Nothing grows without power: build a plant from ⚡ Power, next to a road.";
    if (!s.waterSupply) return "💡 And water: put a water tower from 💧 Water beside a road.";
    if (s.powerUse > s.powerSupply) return "⚡ Blackouts! Power use is above supply. Build more power.";
    if (s.waterUse > s.waterSupply) return "💧 The taps are running dry. Build more water.";
    const linked = connected(c);
    const unlinked = c.tiles.some((t, i) => t.road && !t.highway && !linked.has(i));
    if (unlinked) return "🛣️ Some roads don't reach the highway, so nobody can get there.";
    const d = demand(c, s);
    if (s.happiness < 40) return "😟 People are unhappy: add police, fire, health, schools and parks.";
    const top = (["R", "C", "I"] as Zone[]).sort((a, b) => d[b] - d[a])[0];
    if (d[top] > 0.5) return `📈 High demand for ${ZONE_NAME[top].toLowerCase()} zoning.`;
    if (c.milestone + 1 < MILESTONES.length)
      return `🏁 Next milestone: ${MILESTONES[c.milestone + 1].name} at ${MILESTONES[c.milestone + 1].pop.toLocaleString()} people.`;
    return "🌆 A metropolis. Keep building upwards.";
  }

  private toolHint() {
    const t = this.tool!;
    if (t.kind === "road") return `🛣️ Drag to lay a road · $25 a tile, bridges $150 · Esc to stop`;
    if (t.kind === "bulldoze") return "🚜 Click or drag to clear · Esc to stop";
    if (t.kind === "zone")
      return t.zone
        ? `🏘️ Drag a rectangle to zone ${t.density} density ${ZONE_NAME[t.zone].toLowerCase()} (within 2 tiles of a road)`
        : "🏘️ Drag to remove zoning";
    const d = SERVICES[t.svc];
    return `${d.icon} ${d.name}: ${money(d.cost)} · ${money(d.upkeep)}/day · click a tile${t.svc === "pump" ? " on the riverbank" : t.svc === "park" || t.svc === "wind" ? "" : " beside a road"}`;
  }

  private toast(text: string, secs = 3.5) {
    const t = this.ui.toast;
    if (!t) return;
    t.textContent = text;
    t.classList.remove("opacity-0");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.add("opacity-0"), secs * 1000);
  }

  private setSpeed(k: number) {
    this.speed = k;
    this.dirty = true;
  }

  private setPhoto(on: boolean) {
    this.photo = on;
    if (this.view) this.view.photo = on;
    for (const n of Array.from(this.hud.children) as HTMLElement[])
      if (n !== this.ui.exitPhoto && n !== this.ui.toast) n.style.visibility = on ? "hidden" : "";
    this.ui.exitPhoto.classList.toggle("hidden", !on);
    if (on) {
      this.setTool(null);
      this.closePanel();
    }
  }

  // --------------------------------------------------------------- trays

  private openTray(t: Exclude<Tray, null>) {
    this.closePanel();
    if (this.tray === t) {
      this.tray = null;
      this.ui.tray.classList.add("hidden");
      this.ui.tray.classList.remove("flex");
      this.setTool(null);
      return;
    }
    this.tray = t;
    const tray = this.ui.tray;
    tray.classList.remove("hidden");
    tray.classList.add("flex");
    const item = (
      id: string,
      icon: string,
      title: string,
      sub: string,
      on: boolean,
      lock: string | null,
      fn: () => void,
    ) => {
      const b = button(
        "",
        `flex w-28 shrink-0 flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 text-center ${on ? "border-sky-400 bg-sky-500/15" : "border-white/10 hover:border-white/40"} ${lock ? "opacity-50" : ""}`,
        () => {
          if (lock) return this.toast(lock);
          fn();
        },
      );
      b.append(
        el("span", "text-xl leading-none", icon),
        el("span", "text-[11px] font-bold leading-tight", title),
        el("span", "text-[10px] text-white/60", lock ?? sub),
      );
      b.setAttribute("data-testid", `zn-item-${id}`);
      b.setAttribute("aria-pressed", String(on));
      return b;
    };
    const paint = () => {
      const tool = this.tool;
      const items: HTMLElement[] = [];
      if (t === "roads")
        items.push(
          item("road", "🛣️", "Two-lane road", "$25 / tile", tool?.kind === "road", null, () =>
            this.setTool({ kind: "road" }),
          ),
        );
      else if (t === "zones") {
        for (const z of ["R", "C", "I"] as Zone[])
          for (const dn of (z === "I" ? ["low"] : ["low", "high"]) as Density[]) {
            const lock =
              dn === "high" && this.c.milestone < HIGH_DENSITY_AT ? `At ${MILESTONES[HIGH_DENSITY_AT].name}` : null;
            items.push(
              item(
                `zone-${z}-${dn}`,
                z === "R" ? (dn === "high" ? "🏢" : "🏠") : z === "C" ? (dn === "high" ? "🏬" : "🏪") : "🏭",
                `${ZONE_NAME[z]}`,
                z === "I" ? "industry" : `${dn} density`,
                tool?.kind === "zone" && tool.zone === z && tool.density === dn,
                lock,
                () => this.setTool({ kind: "zone", zone: z, density: dn }),
              ),
            );
          }
        items.push(
          item("zone-clear", "🧽", "De-zone", "clear zoning", tool?.kind === "zone" && !tool.zone, null, () =>
            this.setTool({ kind: "zone", zone: null, density: "low" }),
          ),
        );
      } else if (t === "views") {
        for (const o of OVERLAYS)
          items.push(
            item(`view-${o.id}`, o.icon, o.name, "", this.overlay === o.id, null, () => {
              this.overlay = o.id;
              this.view?.setOverlay(o.id, this.c, this.m, (i) => this.powered(i));
              paint();
            }),
          );
        const clocks: Clock[] = ["cycle", "day", "dusk", "night"];
        const ck = this.prefs.clock ?? "cycle";
        items.push(
          item(
            "clock",
            ck === "night" ? "🌙" : ck === "dusk" ? "🌇" : ck === "day" ? "☀️" : "🕓",
            "Time of day",
            ck === "cycle" ? "day & night" : ck,
            false,
            null,
            () => {
              this.prefs.clock = clocks[(clocks.indexOf(ck) + 1) % clocks.length];
              this.savePrefs();
              paint();
            },
          ),
        );
      } else
        for (const k of GROUP_OF[t]) {
          const d = SERVICES[k];
          items.push(
            item(
              k,
              d.icon,
              d.name,
              `${money(d.cost)}`,
              tool?.kind === "service" && tool.svc === k,
              this.c.milestone < d.unlock ? `At ${MILESTONES[d.unlock].name}` : null,
              () => this.setTool({ kind: "service", svc: k }),
            ),
          );
        }
      tray.replaceChildren(...items);
    };
    this.paintTray = paint;
    paint();
    // Picking a tray picks its first tool.
    if (t === "roads") this.setTool({ kind: "road" });
    else this.setTool(null);
    this.dirty = true;
  }

  private setTool(tool: Tool | null) {
    this.tool = tool;
    this.view?.setGhost(null);
    if (this.tray) this.paintTray?.();
    if (tool?.kind === "bulldoze" && this.tray) {
      this.tray = null;
      this.ui.tray.classList.add("hidden");
      this.ui.tray.classList.remove("flex");
    }
    this.dirty = true;
  }

  // -------------------------------------------------------------- panels

  private openPanel(title: string, kind: string, fill: (box: HTMLElement) => void) {
    const p = this.ui.panel;
    if (p.dataset.kind === kind && !p.classList.contains("hidden")) return this.closePanel();
    this.tray = null;
    this.ui.tray.classList.add("hidden");
    this.ui.tray.classList.remove("flex");
    this.setTool(null);
    p.dataset.kind = kind;
    p.classList.remove("hidden");
    p.classList.add("flex");
    const body = el("div", "flex flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm");
    const close = button("✕", "rounded-md px-2 py-1 text-white/70 hover:bg-white/10", () => this.closePanel());
    close.setAttribute("aria-label", "Close");
    p.replaceChildren(
      el(
        "div",
        "flex items-center justify-between border-b border-white/10 px-3 py-2",
        el("h2", "font-display text-sm font-black uppercase tracking-wider text-sky-300", title),
        close,
      ),
      body,
    );
    this.fillPanel = () => {
      body.replaceChildren();
      fill(body);
    };
    this.fillPanel();
    this.panelAt = performance.now();
  }

  private fillPanel: (() => void) | null = null;
  private panelAt = 0;

  private repaintPanel() {
    // Live panels refresh with the city, but not while you're dragging a slider.
    if (this.ui.panel.dataset.kind === "budget") return;
    if (performance.now() - this.panelAt > 500) this.fillPanel?.();
  }

  private closePanel() {
    const p = this.ui.panel;
    if (!p) return;
    p.classList.add("hidden");
    p.classList.remove("flex");
    delete p.dataset.kind;
    this.fillPanel = null;
  }

  private budgetPanel() {
    this.openPanel("Budget", "budget", (box) => {
      const line = (k: string, v: string, cls = "") =>
        el(
          "div",
          "flex justify-between rounded bg-white/5 px-2 py-1",
          el("span", "text-white/70", k),
          el("span", `font-bold ${cls}`, v),
        );
      const totals = el("div", "flex flex-col gap-1");
      const paintTotals = () => {
        const st = stats(this.c, this.m);
        totals.replaceChildren(
          line("Tax income", `${money(st.income)}/day`, "text-emerald-300"),
          line("Upkeep (services and roads)", `${money(st.upkeep)}/day`, "text-red-300"),
          line(
            "Net",
            `${money(st.income - st.upkeep)}/day`,
            st.income >= st.upkeep ? "text-emerald-300" : "text-red-300",
          ),
        );
      };
      box.append(
        el(
          "p",
          "text-xs text-white/60",
          "Higher taxes bring in more but cool demand and make people less happy. 9% is neutral.",
        ),
      );
      for (const z of ["R", "C", "I"] as Zone[]) {
        const val = el("span", "w-10 text-right font-bold", `${Math.round(this.c.tax[z] * 100)}%`);
        const r = el("input", "flex-1 accent-sky-400") as HTMLInputElement;
        r.type = "range";
        r.min = "0";
        r.max = "20";
        r.step = "1";
        r.value = String(Math.round(this.c.tax[z] * 100));
        r.setAttribute("aria-label", `${ZONE_NAME[z]} tax`);
        r.setAttribute("data-testid", `zn-tax-${z}`);
        r.addEventListener("input", () => {
          this.c.tax[z] = Number(r.value) / 100;
          val.textContent = `${r.value}%`;
          this.s = stats(this.c, this.m);
          paintTotals();
          this.paintHud();
        });
        const sw = el("span", "h-3 w-3 rounded-sm");
        sw.style.background = ZONE_HUE[z];
        box.append(el("label", "flex items-center gap-2", sw, el("span", "w-24", ZONE_NAME[z]), r, val));
      }
      paintTotals();
      box.append(totals);
      const rows: [string, number][] = [];
      for (const k of SERVICE_IDS) {
        const n = this.c.tiles.filter((t) => t.svc === k).length;
        if (n) rows.push([`${SERVICES[k].icon} ${SERVICES[k].name} ×${n}`, n * SERVICES[k].upkeep]);
      }
      const roads = this.c.tiles.filter((t) => t.road).length;
      rows.push([`🛣️ Roads ×${roads}`, roads * 0.15]);
      box.append(
        el("p", "mt-1 text-[11px] font-bold uppercase tracking-wider text-white/50", "Upkeep"),
        ...rows.map(([k, v]) => line(k, `${money(v)}/day`)),
      );
    });
  }

  private cityPanel() {
    this.openPanel(this.c.name, "city", (box) => {
      const { c, s } = this;
      const cell = (k: string, v: string) =>
        el(
          "div",
          "rounded bg-white/5 px-2 py-1.5",
          el("p", "text-[10px] uppercase tracking-wider text-white/50", k),
          el("p", "text-base font-black", v),
        );
      box.append(
        el(
          "div",
          "grid grid-cols-2 gap-1.5 sm:grid-cols-3",
          cell("Population", s.population.toLocaleString()),
          cell("Jobs", (s.jobsC + s.jobsI).toLocaleString()),
          cell("Buildings", s.buildings.toLocaleString()),
          cell("Power", `${s.powerUse.toLocaleString()} / ${s.powerSupply.toLocaleString()} MW`),
          cell("Water", `${s.waterUse.toLocaleString()} / ${s.waterSupply.toLocaleString()} m³`),
          cell("Happiness", `${s.happiness}%`),
        ),
      );
      // Milestones.
      const ms = el("div", "flex flex-col gap-1");
      MILESTONES.forEach((m, i) => {
        const done = c.milestone >= i;
        const next = i === c.milestone + 1;
        const row = el(
          "div",
          `flex items-center gap-2 rounded px-2 py-1 ${done ? "bg-emerald-500/10" : "bg-white/5"}`,
          el("span", "w-5", done ? "✓" : next ? "▸" : "·"),
          el("span", "flex-1 font-bold", m.name),
          el(
            "span",
            "text-xs text-white/60",
            i ? `${m.pop.toLocaleString()} people · ${money(m.reward)} grant` : "Start",
          ),
        );
        ms.append(row);
        if (next) {
          const bar = el(
            "div",
            "h-1.5 overflow-hidden rounded-full bg-white/10",
            Object.assign(el("div", "h-full rounded-full bg-sky-400"), {
              style: `width:${Math.min(100, (s.population / m.pop) * 100)}%`,
            }),
          );
          ms.append(bar);
        }
      });
      box.append(el("p", "mt-1 text-[11px] font-bold uppercase tracking-wider text-white/50", "Milestones"), ms);
      // Growth chart.
      if (c.history.length > 1)
        box.append(
          el("p", "mt-1 text-[11px] font-bold uppercase tracking-wider text-white/50", "Population by week"),
          this.chart(c.history.map((h) => h.pop)),
        );
      const bank = primaryButton(`Bank ${s.population.toLocaleString()} as my score`, MINT, () => {
        this.save();
        this.emitter.emit({
          kind: "final",
          score: score(c),
          durationMs: Math.min(2 * 3600_000 - 1000, Math.max(this.loop.activeMs, 60_000)),
        });
      });
      bank.style.color = "#022c22";
      bank.setAttribute("data-testid", "zn-bank");
      const menu = button("Save and back to the menu", `${BTN} w-full`, () => {
        this.save();
        this.closePanel();
        this.showMenu();
      });
      box.append(
        el("p", "text-xs text-white/60", "Your population is your score. Bank it any time; the city keeps going."),
        bank,
        menu,
      );
    });
  }

  private chart(values: number[]) {
    const w = 300;
    const h = 70;
    const max = Math.max(1, ...values);
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 4 - (v / max) * (h - 8)}`).join(" ");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("class", "h-20 w-full rounded bg-white/5");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `Population over the last ${values.length} weeks, from ${values[0].toLocaleString()} to ${values[values.length - 1].toLocaleString()}`,
    );
    svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="${SKY}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    return svg;
  }

  /** What's on a tile (click with no tool). */
  private tilePanel(x: number, y: number) {
    const t = tileAt(this.c, x, y);
    if (!t) return;
    const i = idx(x, y);
    const title = t.svc
      ? SERVICES[t.svc].name
      : t.bld && t.zone
        ? `${t.bld.abandoned ? "Empty " : ""}${ZONE_NAME[t.zone]} · level ${t.bld.level}`
        : t.road
          ? t.highway
            ? "Highway"
            : "Road"
          : t.water
            ? "River"
            : t.zone
              ? `${ZONE_NAME[t.zone]} zone`
              : t.tree
                ? "Woodland"
                : "Open land";
    this.openPanel(title, `tile${i}`, (box) => {
      const tt = this.c.tiles[i];
      const sv = served(this.c, i, this.s);
      const row = (k: string, v: string) =>
        el(
          "div",
          "flex justify-between rounded bg-white/5 px-2 py-1",
          el("span", "text-white/70", k),
          el("span", "font-bold", v),
        );
      if (tt.svc) {
        const d = SERVICES[tt.svc];
        box.append(row("Upkeep", `${money(d.upkeep)}/day`));
        if (d.power) box.append(row("Power", `${d.power} MW`));
        if (d.water) box.append(row("Water", `${d.water} m³`));
        if (d.radius) box.append(row("Reach", `${d.radius} tiles`));
      }
      if (tt.bld && tt.zone) {
        const n = OCCUPANTS[tt.zone][tt.density][tt.bld.level - 1];
        box.append(
          row(tt.zone === "R" ? "Residents" : "Jobs", tt.bld.abandoned ? "0" : String(n)),
          row("Power", sv.power ? "✓" : "✗ none"),
          row("Water", sv.water ? "✓" : "✗ none"),
          row("Road access", this.m.access[i] ? "✓" : "✗ none"),
        );
      }
      if (!tt.water)
        box.append(
          row("Land value", `${Math.round(this.m.value[i] * 100)}%`),
          row("Pollution", `${Math.round(this.m.pollution[i] * 100)}%`),
        );
      if (tt.zone || tt.bld)
        box.append(
          row(
            "Covered by",
            (["police", "fire", "health", "school"] as const).filter((k) => this.m.cover[k][i]).join(", ") ||
              "nothing yet",
          ),
        );
      if (tt.bld && !tt.bld.abandoned && tt.bld.level < 3)
        box.append(
          el(
            "p",
            "text-xs text-white/60",
            `Levels up when land value reaches ${Math.round([0, 42, 68][tt.bld.level])}%: services and parks nearby help, pollution hurts.`,
          ),
        );
    });
  }

  // --------------------------------------------------------------- tools

  private ghostTiles(a: { x: number; y: number }, b: { x: number; y: number }) {
    const t = this.tool!;
    if (t.kind === "road") return roadPath(a.x, a.y, b.x, b.y).filter((p) => inMap(p.x, p.y));
    if (t.kind === "service") return [b];
    const out: { x: number; y: number }[] = [];
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++)
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
        const tt = tileAt(this.c, x, y)!;
        if (t.kind === "zone" && (tt.water || tt.road || tt.svc || !nearRoad(this.c, x, y))) continue;
        if (t.kind === "bulldoze" && (tt.highway || (!tt.road && !tt.svc && !tt.bld && !tt.zone && !tt.tree))) continue;
        out.push({ x, y });
      }
    return out;
  }

  private preview(a: { x: number; y: number } | null, b: { x: number; y: number }, sx: number, sy: number) {
    const t = this.tool;
    if (!t || !this.view) return;
    const from = a ?? b;
    const tiles = this.ghostTiles(from, b);
    let ok = true;
    let label = "";
    if (t.kind === "road") {
      const r = roadCost(this.c, from.x, from.y, b.x, b.y);
      ok = r.ok && (r.cost ?? 0) <= this.c.money;
      label = r.ok ? money(r.cost ?? 0) : r.why;
    } else if (t.kind === "service") {
      const r = canService(this.c, t.svc, b.x, b.y);
      ok = r.ok;
      label = r.ok ? money(r.cost ?? 0) : r.why;
    } else if (t.kind === "zone") label = a ? `${tiles.length} tiles` : "";
    else label = a ? `Clear ${tiles.length}` : "";
    this.view.setGhost({ tiles, ok, kind: t.kind, zone: t.kind === "zone" ? t.zone : undefined });
    const tip = this.ui.tip;
    tip.classList.toggle("hidden", !label);
    tip.textContent = label;
    tip.style.color = ok ? "#e0f2fe" : "#fca5a5";
    const r = this.host.getBoundingClientRect();
    tip.style.left = `${sx - r.left + 14}px`;
    tip.style.top = `${sy - r.top + 14}px`;
  }

  private commit(a: { x: number; y: number }, b: { x: number; y: number }) {
    const t = this.tool;
    if (!t) return;
    const c = this.c;
    let msg = "";
    let fail = "";
    if (t.kind === "road") {
      const r = placeRoad(c, a.x, a.y, b.x, b.y);
      if (r.ok) msg = (r.cost ?? 0) ? `Road laid · ${money(r.cost ?? 0)}` : "";
      else fail = r.why;
    } else if (t.kind === "zone") {
      const r = zoneRect(c, a.x, a.y, b.x, b.y, t.zone, t.density);
      if (!r.ok) fail = r.why;
      else if (!r.tiles) fail = t.zone ? "Zones must be within two tiles of a road" : "";
    } else if (t.kind === "service") {
      const r = placeService(c, t.svc, b.x, b.y);
      if (r.ok) msg = `${SERVICES[t.svc].name} built · ${money(r.cost ?? 0)}`;
      else fail = r.why;
    } else {
      let n = 0;
      for (const p of this.ghostTiles(a, b)) if (bulldoze(c, p.x, p.y).ok) n++;
      if (!n) fail = "Nothing to clear there";
    }
    if (fail) {
      this.toast(`✗ ${fail}`);
      this.blip(180);
      return;
    }
    if (msg) this.toast(msg, 2);
    this.blip(t.kind === "bulldoze" ? 140 : 620);
    this.refresh();
  }

  // --------------------------------------------------------------- input

  private ndc(x: number, y: number) {
    const r = this.host.getBoundingClientRect();
    return { nx: ((x - r.left) / r.width) * 2 - 1, ny: -(((y - r.top) / r.height) * 2 - 1) };
  }

  private tileAtScreen(x: number, y: number) {
    if (!this.view) return null;
    const { nx, ny } = this.ndc(x, y);
    return this.view.pick(nx, ny);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.mode !== "city" || !this.view) return;
    this.host.setPointerCapture?.(e.pointerId);
    this.view.canvas.focus({ preventScroll: true });
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      // Two fingers: a camera gesture; drop any tool drag.
      this.drag = null;
      this.view.setGhost(null);
      this.gesture = this.measure();
      return;
    }
    const anchor = e.button === 0 && !e.shiftKey && this.tool ? this.tileAtScreen(e.clientX, e.clientY) : null;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, button: e.button, shift: e.shiftKey, anchor };
    if (anchor) this.preview(anchor, anchor, e.clientX, e.clientY);
  };

  private measure() {
    const [a, b] = [...this.pointers.values()];
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.mode !== "city" || !this.view) return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.gesture && this.pointers.size >= 2) {
      const g = this.measure();
      this.view.dist = clamp(this.view.dist * (this.gesture.dist / Math.max(1, g.dist)), 40, 620);
      this.view.yaw += g.angle - this.gesture.angle;
      this.pan(g.mid.x - this.gesture.mid.x, g.mid.y - this.gesture.mid.y);
      this.gesture = g;
      return;
    }
    const d = this.drag;
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.anchor) {
        const b = this.tileAtScreen(e.clientX, e.clientY);
        if (b) {
          this.hover = b;
          this.preview(d.anchor, b, e.clientX, e.clientY);
        }
        return;
      }
      d.x = e.clientX;
      d.y = e.clientY;
      if (d.button === 2) {
        this.view.yaw -= dx * 0.005;
        this.view.pitch = clamp(this.view.pitch + dy * 0.004, 0.22, 1.45);
      } else this.pan(dx, dy);
      return;
    }
    // Hovering: show the cursor and what the tool would do here.
    if (e.target !== this.view.canvas) return;
    const p = this.tileAtScreen(e.clientX, e.clientY);
    this.hover = p;
    this.view.setCursor(p);
    if (this.tool && p) this.preview(null, p, e.clientX, e.clientY);
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.gesture = null;
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (!this.view || this.mode !== "city") return;
    if (d.anchor) {
      const b = this.tileAtScreen(e.clientX, e.clientY) ?? this.hover ?? d.anchor;
      this.view.setGhost(null);
      this.ui.tip.classList.add("hidden");
      this.commit(d.anchor, b);
      return;
    }
    // A click (not a drag) with no tool: what's here?
    if (d.moved < 6 && d.button === 0 && !this.tool) {
      const p = this.tileAtScreen(e.clientX, e.clientY);
      if (p) this.tilePanel(p.x, p.y);
    }
  };

  private onLeave = () => {
    this.view?.setCursor(null);
    if (!this.drag) {
      this.view?.setGhost(null);
      this.ui.tip?.classList.add("hidden");
    }
  };

  private pan(dx: number, dy: number) {
    const v = this.view!;
    const k = v.dist * 0.0022;
    const sy = Math.sin(v.yaw);
    const cy = Math.cos(v.yaw);
    // Screen right is (-cos, sin) on the ground; screen up is forward (sin, cos).
    v.target.x += (cy * dx + sy * dy) * k;
    v.target.z += (-sy * dx + cy * dy) * k;
  }

  private panKeys(dt: number) {
    const v = this.view;
    if (!v || !this.keys.size) return;
    const k = this.keys;
    const step = 520 * dt;
    let dx = 0;
    let dy = 0;
    if (k.has("KeyA") || k.has("ArrowLeft")) dx += step;
    if (k.has("KeyD") || k.has("ArrowRight")) dx -= step;
    if (k.has("KeyW") || k.has("ArrowUp")) dy += step;
    if (k.has("KeyS") || k.has("ArrowDown")) dy -= step;
    if (dx || dy) this.pan(dx, dy);
    if (k.has("KeyQ")) v.yaw += dt * 1.4;
    if (k.has("KeyE")) v.yaw -= dt * 1.4;
    if (k.has("KeyR")) v.dist = clamp(v.dist * (1 - dt * 1.5), 40, 620);
    if (k.has("KeyF")) v.dist = clamp(v.dist * (1 + dt * 1.5), 40, 620);
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.view || this.mode !== "city") return;
    e.preventDefault();
    this.view.dist = clamp(this.view.dist * Math.exp(e.deltaY * 0.0012), 40, 620);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== "city") return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    // Esc steps out of a tool, tray, panel or photo mode first (and only pauses when there's nothing to close).
    if (e.code === "Escape" && (this.photo || this.tool || this.tray || this.fillPanel)) e.stopPropagation();
    this.keys.add(e.code);
    if (e.code === "Escape") {
      if (this.photo) this.setPhoto(false);
      else if (this.tool || this.tray) {
        this.tray = null;
        this.ui.tray.classList.add("hidden");
        this.ui.tray.classList.remove("flex");
        this.setTool(null);
      } else this.closePanel();
    } else if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      this.setSpeed(this.speed ? 0 : 1);
    } else if (e.code === "Digit1") this.openTray("roads");
    else if (e.code === "Digit2") this.openTray("zones");
    else if (e.code === "KeyB") this.setTool(this.tool?.kind === "bulldoze" ? null : { kind: "bulldoze" });
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private clearInput = () => {
    this.keys.clear();
    this.pointers.clear();
    this.drag = null;
    this.gesture = null;
  };

  // --------------------------------------------------------------- sound

  private blip(freq: number) {
    this.chime([freq], 0.05);
  }

  private chime(freqs: number[], gap = 0.12) {
    const set = this.opts.settings;
    if (!set.sound) return;
    try {
      this.ac ??= new AudioContext();
      const ac = this.ac;
      freqs.forEach((f, i) => {
        const t = ac.currentTime + i * gap;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.05 * set.volume, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + 0.3);
      });
    } catch {
      // No audio.
    }
  }

  // --------------------------------------------------------------- tests

  private hooks() {
    const after = <T>(r: T) => {
      this.refresh();
      return r;
    };
    (window as unknown as Record<string, unknown>).__zenith = {
      state: () =>
        this.c && {
          mode: this.mode,
          name: this.c.name,
          day: this.c.day,
          money: Math.round(this.c.money),
          population: this.s.population,
          buildings: this.s.buildings,
          milestone: this.c.milestone,
          roads: this.c.tiles.filter((t) => t.road).length,
          zoned: this.c.tiles.filter((t) => t.zone).length,
          services: this.c.tiles.filter((t) => t.svc).map((t) => t.svc),
          tool: this.tool,
          speed: this.speed,
        },
      road: (ax: number, ay: number, bx: number, by: number) => after(placeRoad(this.c, ax, ay, bx, by)),
      zone: (ax: number, ay: number, bx: number, by: number, z: Zone | null, d: Density = "low") =>
        after(zoneRect(this.c, ax, ay, bx, by, z, d)),
      service: (k: ServiceKind, x: number, y: number) => after(placeService(this.c, k, x, y)),
      /** Run the city for n days. */
      days: (n: number) => {
        for (let i = 0; i < n; i++) simDay(this.c);
        this.refresh();
        return this.s.population;
      },
      setMoney: (v: number) => {
        this.c.money = v;
        this.dirty = true;
      },
      /** Where a tile's centre is on screen (for real pointer tests). */
      screenOf: (x: number, y: number) => {
        const v = this.view;
        if (!v) return null;
        const p = new Vector3((x + 0.5) * 12 - (N * 12) / 2, 0, (y + 0.5) * 12 - (N * 12) / 2);
        p.project(v.pipe.camera);
        const r = this.host.getBoundingClientRect();
        return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
      },
      /** Look at a tile from straight-ish above (tests and screenshots). */
      look: (x: number, y: number, dist = 200, yaw = -0.6, pitch = 0.78) => {
        const v = this.view;
        if (!v) return;
        v.target.set((x + 0.5) * 12 - (N * 12) / 2, 0, (y + 0.5) * 12 - (N * 12) / 2);
        Object.assign(v, { dist, yaw, pitch });
        v.snap();
      },
      setClock: (k: Clock) => {
        this.prefs.clock = k;
      },
      xy,
    };
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const factory: GameFactory = () => new Zenith();
export default factory;
