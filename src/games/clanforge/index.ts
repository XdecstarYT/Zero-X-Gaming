import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import type { Detail } from "../sports-kit/look";
import { BTN, button, card, choice, el, hero, howTo, primaryButton, ResolutionGovernor, stat } from "../sports-kit/ui";
import { ClanAudio } from "./audio";
import { Battle, simulateRaid, trophyDelta, type Base } from "./battle";
import { baseName, generateBase, raiderArmy, villageBase } from "./bases";
import { BUILDINGS, BATTLE_SECONDS, finishCost, GRID, leagueFor, searchCost, TROOPS, type BuildingType, type TroopType } from "./data";
import { ClanView, type ShownBuilding } from "./render";
import {
  applyDefense,
  applyRaid,
  barracksLevel,
  build,
  builders,
  busyBuilders,
  capacity,
  clanCapacity,
  collect,
  countOf,
  finishNow,
  finishTraining,
  fits,
  housing,
  keepLevel,
  maxOf,
  move,
  newVillage,
  parseVillage,
  requestClan,
  tick,
  train,
  untrain,
  upgrade,
  type ActionResult,
  type Building,
  type DefenseLog,
  type Village,
} from "./village";

const SAVE_KEY = "zx-clanforge";
const PREFS_KEY = "zx-clanforge-prefs";
const GOLD = "#facc15";
const MANA = "#c084fc";
const CRYSTAL = "#22d3ee";
const ACCENT = "#d97706";
const TROOP_ORDER: TroopType[] = ["brawler", "ranger", "raider", "brute", "sapper", "drake"];
const SHOP: { tab: string; types: BuildingType[] }[] = [
  { tab: "Economy", types: ["goldMine", "manaWell", "goldVault", "manaVat", "builderHut"] },
  { tab: "Defense", types: ["cannon", "archerTower", "mortar", "spire", "airLance"] },
  { tab: "Army", types: ["barracks", "camp", "clanHall"] },
  { tab: "Walls", types: ["wall"] },
];

type Mode = "menu" | "village" | "scout" | "battle" | "results";

const fmtTime = (s: number) => {
  s = Math.max(0, Math.ceil(s));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60 ? `${s % 60}s` : ""}`.trim();
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m ? `${m}m` : ""}`.trim();
};
const fmtNum = (n: number) => Math.floor(n).toLocaleString("en-US");
const dot = (color: string) => Object.assign(el("span", "inline-block h-2.5 w-2.5 shrink-0 rounded-full"), { style: `background:${color}` });
const priceTag = (res: "gold" | "mana" | "crystals", n: number) => el("span", "inline-flex items-center gap-1", dot(res === "gold" ? GOLD : res === "mana" ? MANA : CRYSTAL), fmtNum(n));

function loadVillage(): Village | null {
  try {
    return parseVillage(JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

function statLines(type: BuildingType, level: number): string[] {
  const def = BUILDINGS[type];
  const st = def.levels[Math.max(0, level - 1)];
  const out = [`${fmtNum(st.hp)} hit points`];
  if (st.rate) out.push(`${fmtNum(st.rate * 60)} ${type === "goldMine" ? "gold" : "mana"} an hour, holds ${fmtNum(st.capacity ?? 0)}`);
  else if (type === "camp") out.push(`Houses ${st.capacity} troops`);
  else if (type === "clanHall") out.push(`Holds ${st.capacity} reinforcements`);
  else if (st.capacity && type !== "barracks") out.push(`Stores ${fmtNum(st.capacity)}${type === "keep" ? " of each" : ""}`);
  if (st.damage) out.push(`${st.damage} damage a shot · range ${def.range}${def.minRange ? ` (not within ${def.minRange})` : ""} · ${def.targets === "both" ? "ground & air" : def.targets}`);
  if (type === "barracks") {
    const t = TROOP_ORDER.filter((x) => TROOPS[x].barracks === level).map((x) => TROOPS[x].name);
    if (t.length) out.push(`Unlocks the ${t.join(", ")}`);
  }
  return out;
}

/**
 * Clanforge: build a village on a valley floor, upgrade it with your builders,
 * fill your stores from mines and wells, train an army and raid AI villages
 * for loot and trophies, while their raiders hit you back while you're away.
 */
class ClanforgeGame implements GameModule {
  readonly slug = "clanforge";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private ui: HTMLDivElement | null = null;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private audio!: ClanAudio;
  private view: ClanView | null = null;
  private res = new ResolutionGovernor();
  private coarse = false;
  private gfx: Detail = "high";
  private test = false;
  private skew = 0;
  private lastFrame = 0;
  private hudAt = 0;
  private saveAt = 0;

  private mode: Mode = "menu";
  private v!: Village;
  private selected = -1;
  private placing: { type: BuildingType; x: number; y: number; moving?: number } | null = null;
  private base: Base | null = null;
  private battle: Battle | null = null;
  private troop: TroopType | "clan" | null = null;
  private searchSeed = 0;
  private zoneDirty = false;

  // HUD refs.
  private refs: Record<string, HTMLElement> = {};
  private modal: HTMLDivElement | null = null;
  private modalRefresh: (() => void) | null = null;
  private toastEl: HTMLDivElement | null = null;
  private toastTimer = 0;

  // Input.
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  private gesture: "none" | "pan" | "deploy" | "ghost" | "pinch" = "none";
  private moved = false;
  private pinchD = 0;
  private deployAt = 0;
  private keys = new Set<string>();

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as { gfx?: Detail } | null;
      this.gfx = p?.gfx ?? (this.coarse ? "low" : "high");
    } catch {
      this.gfx = this.coarse ? "low" : "high";
    }
    this.test = new URLSearchParams(window.location.search).has("clanforge");
    this.host = el("div", "absolute inset-0 overflow-hidden bg-[#0b1208] select-none");
    this.host.style.touchAction = "none";
    opts.root.appendChild(this.host);
    this.menu = el("div", "absolute inset-0 z-30 flex overflow-auto bg-[#0b1208]/95 p-3 pb-14 text-white");
    opts.root.appendChild(this.menu);
    this.audio = new ClanAudio(opts.settings.sound, opts.settings.volume, 0);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
      1000 / 60,
    );
    this.host.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    this.host.addEventListener("wheel", this.onWheel, { passive: false });
    this.host.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
  }

  start() {
    this.loop.pause();
    this.teardown();
    this.showMenu();
  }

  pause() {
    this.loop.pause();
    this.clearInput();
    this.audio.suspend();
    if (this.v && this.mode !== "menu") this.save();
  }

  resume() {
    if (this.mode === "menu" || !this.view) return;
    this.audio.resume();
    this.lastFrame = performance.now();
    this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    if (this.v && this.mode !== "menu" && this.mode !== "battle") this.save();
    this.host.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    this.teardown();
    this.menu.remove();
    this.host.remove();
    this.audio.destroy();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  private now() {
    return Date.now() + this.skew;
  }

  private save() {
    if (this.test && !this.v) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.v));
    } catch {
      // Storage blocked: progress lasts until the tab closes.
    }
  }

  // ------------------------------------------------------------------ menu

  private showMenu() {
    this.mode = "menu";
    this.menu.hidden = false;
    const saved = loadVillage();
    const go = primaryButton(saved ? "Enter your village" : "Found your village", ACCENT, () => this.enter());
    go.setAttribute("data-testid", "cf-start");
    const reset = button("Start over", `${BTN} text-xs`, () => {
      if (!confirm("Start a brand new village? Your current one will be gone for good.")) return;
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {
        // Nothing saved anyway.
      }
      this.showMenu();
    });
    this.menu.replaceChildren(
      el(
        "div",
        "m-auto flex w-full max-w-2xl flex-col items-center gap-3",
        hero("Strategy", "CLANFORGE", "Build · Train · Raid · Defend", "radial-gradient(circle at 20% 0%, #d97706 0, transparent 55%), radial-gradient(circle at 80% 100%, #7c3aed 0, transparent 55%), linear-gradient(#1f3d17, #0b1208)"),
        card(
          saved ? saved.name : "Your village",
          saved
            ? el(
                "div",
                "grid grid-cols-2 gap-2 sm:grid-cols-4",
                stat("Keep", `Level ${keepLevel(saved)}`),
                stat("Trophies", saved.trophies),
                stat("League", leagueFor(saved.trophies)),
                stat("Raids won", `${saved.stats.wins}/${saved.stats.raids}`),
              )
            : el("p", "text-sm", "A Keep, a mine, a well and two builders on an empty valley floor. The rest is up to you."),
          ...(saved ? [reset] : []),
        ),
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
        go,
        howTo([
          ["Build", "Open the Shop, pick a building, drag the ghost where you want it and press Place. Each build or upgrade needs a free builder and takes time; crystals finish it now."],
          ["Resources", "Mines dig gold and wells draw mana: tap them to collect. Vaults and vats raise how much you can hold. Gold pays for buildings; mana trains troops and some upgrades."],
          ["Keep", "Upgrading the Keep unlocks more buildings, new defenses and higher levels for everything."],
          ["Army", "Train troops at the Barracks (higher levels unlock more types). War Camps house them. A Clan Hall lets you ask your clan for reinforcements."],
          ["Raid", "Attack searches for an AI village. Drop troops from the green edge (not on the red), knock out 50% for a star, the Keep for another and everything for three. Loot what you destroy."],
          ["Defend", "While you're away, raiders attack. Walls, defenses in range of each other and storages tucked inside keep your loot safe. A bad defense earns a shield."],
          ["Controls", this.coarse ? "Drag to pan · pinch to zoom · tap to select or deploy, hold and drag to deploy a stream" : "Drag to pan · wheel to zoom · click to select or deploy, hold and drag to deploy a stream · WASD pans"],
        ]),
      ),
    );
  }

  private enter() {
    this.audio.unlock();
    this.menu.hidden = true;
    this.teardown();
    const now = this.now();
    const saved = loadVillage();
    this.v = saved ?? newVillage((Date.now() & 0x7fffffff) ^ 0x5eed, now);
    const away = saved ? this.defendWhileAway(now) : [];
    tick(this.v, now);
    this.save();
    try {
      this.view = new ClanView(this.host, this.gfx);
    } catch {
      this.showMenu();
      this.menu.prepend(el("p", "w-full rounded bg-red-900/60 p-2 text-center text-sm", "3D graphics aren't available on this device (WebGL is off)."));
      return;
    }
    this.view.canvas.setAttribute("data-testid", "cf-canvas");
    if (this.test) this.installHooks();
    this.toVillage();
    if (away.length) this.showAway(away);
    this.lastFrame = performance.now();
    this.loop.start();
  }

  private teardown() {
    this.closeModal();
    this.ui?.remove();
    this.ui = null;
    this.refs = {};
    this.view?.destroy();
    this.view = null;
    this.battle = null;
    this.base = null;
    this.placing = null;
    this.selected = -1;
    this.host.querySelector("[data-results]")?.remove();
  }

  /** Raiders hit you while you were gone: one raid per three unshielded hours, at most three. */
  private defendWhileAway(now: number) {
    const v = this.v;
    const out: DefenseLog[] = [];
    let t = Math.max(v.lastSeen, v.shieldUntil);
    const gap = 3 * 3600_000;
    while (t + gap <= now && out.length < 3) {
      t += gap;
      tick(v, t);
      const seed = (v.seed ^ Math.floor(t / 1000)) >>> 0;
      const attackerTrophies = Math.max(0, v.trophies + ((seed % 160) - 80));
      const keep = Math.max(1, Math.min(6, keepLevel(v) + (seed % 3 === 0 ? 1 : 0)));
      const b = simulateRaid(villageBase(v, t), raiderArmy(keep, seed), seed);
      const r = b.result();
      const log: DefenseLog = { at: t, attacker: baseName(seed), stars: r.stars, destruction: r.destruction, gold: r.gold, mana: r.mana, trophies: -trophyDelta(r.stars, attackerTrophies, v.trophies) };
      applyDefense(v, log, r.taken, t);
      out.push(log);
      if (v.shieldUntil > t) t = v.shieldUntil;
    }
    return out;
  }

  // -------------------------------------------------------------- village

  private toVillage() {
    this.mode = "village";
    this.battle = null;
    this.base = null;
    this.troop = null;
    this.view?.clearBattle();
    this.view?.showGrid(false);
    this.buildVillageUi();
    this.emitter.progress(this.v.trophies, performance.now(), 0);
  }

  private buildVillageUi() {
    this.closeModal();
    this.ui?.remove();
    this.refs = {};
    const v = this.v;
    const bar = (key: string, color: string, label: string) => {
      const fill = el("div", "h-full rounded-full");
      fill.style.background = color;
      const txt = el("span", "relative z-[1] px-2 text-xs font-black tabular-nums");
      this.refs[`${key}Fill`] = fill;
      this.refs[`${key}Txt`] = txt;
      fill.classList.add("absolute", "inset-y-0", "left-0");
      fill.style.width = "0%";
      const box = el("div", "relative flex h-6 w-40 items-center overflow-hidden rounded-full border-2 border-black/40 bg-black/55 sm:w-48", fill, txt);
      return el("div", "flex items-center justify-end gap-1.5", el("span", "text-[10px] font-bold uppercase tracking-wider text-white/70", label), box);
    };
    const trophies = el("span", "font-black tabular-nums");
    const league = el("span", "text-[10px] font-bold uppercase tracking-wider text-white/60");
    const shield = el("span", "text-[10px] font-bold text-sky-300");
    const buildersTxt = el("span", "font-black tabular-nums");
    const crystals = el("span", "font-black tabular-nums");
    Object.assign(this.refs, { trophies, league, shield, builders: buildersTxt, crystals });
    trophies.setAttribute("data-testid", "cf-trophies");
    crystals.setAttribute("data-testid", "cf-crystals");
    const topLeft = el(
      "div",
      "pointer-events-auto flex flex-col gap-1 rounded-xl bg-black/55 px-3 py-2 text-white backdrop-blur-sm",
      el("span", "text-xs font-bold text-white/90", v.name),
      el("span", "flex items-center gap-1.5 text-sm", el("span", "text-[#facc15]", "🏆"), trophies, league),
      shield,
    );
    const gold = bar("gold", GOLD, "Gold");
    const mana = bar("mana", MANA, "Mana");
    this.refs.goldTxt.setAttribute("data-testid", "cf-gold");
    this.refs.manaTxt.setAttribute("data-testid", "cf-mana");
    const topRight = el("div", "pointer-events-auto flex flex-col items-end gap-1 rounded-xl bg-black/55 px-3 py-2 text-white backdrop-blur-sm", gold, mana, el("span", "flex items-center gap-1.5 text-sm", dot(CRYSTAL), crystals, el("span", "text-[10px] uppercase tracking-wider text-white/60", "crystals")));
    const topMid = el("div", "pointer-events-auto mx-auto hidden items-center gap-2 rounded-xl bg-black/55 px-3 py-1.5 text-sm text-white sm:flex", el("span", "text-[10px] font-bold uppercase tracking-wider text-white/60", "Builders"), buildersTxt);
    const small = (label: string, testid: string, fn: () => void) => {
      const b = button(label, "pointer-events-auto rounded-xl border-2 border-white/25 bg-black/60 px-3 py-2 text-xs font-black uppercase tracking-wider text-white hover:border-[#facc15] sm:px-4 sm:text-sm", () => {
        this.audio.click();
        fn();
      });
      b.setAttribute("data-testid", testid);
      return b;
    };
    const attack = button("⚔ Attack!", "pointer-events-auto rounded-2xl border-4 border-[#7c2d12] px-5 py-3 font-display text-lg font-black uppercase tracking-wider text-white shadow-lg hover:brightness-110 sm:px-7 sm:text-xl", () => this.search(true));
    attack.style.background = "linear-gradient(#f59e0b, #b45309)";
    attack.setAttribute("data-testid", "cf-attack");
    const buildersMobile = el("span", "pointer-events-auto rounded-xl bg-black/55 px-2 py-1 text-xs text-white sm:hidden");
    this.refs.buildersMobile = buildersMobile;
    const bottom = el(
      "div",
      "absolute bottom-2 left-2 right-14 flex items-end justify-between gap-2",
      el("div", "flex flex-col items-start gap-2", buildersMobile, attack),
      el("div", "flex flex-wrap justify-end gap-2", small("Shop", "cf-shop", () => this.openShop()), small("Army", "cf-army", () => this.openArmy()), small("Log", "cf-log", () => this.openLog())),
    );
    const panel = el("div", "pointer-events-auto absolute inset-x-2 bottom-[4.75rem] mx-auto max-w-md");
    panel.setAttribute("data-testid", "cf-panel");
    this.refs.panel = panel;
    const toast = el("div", "pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-sm font-bold text-white opacity-0 transition-opacity");
    toast.setAttribute("role", "status");
    this.toastEl = toast;
    this.ui = el("div", "pointer-events-none absolute inset-0 z-10", el("div", "absolute inset-x-2 top-2 flex items-start justify-between gap-2", topLeft, topMid, topRight), panel, bottom, toast);
    this.ui.setAttribute("data-testid", "cf-hud");
    this.host.appendChild(this.ui);
    this.refreshHud();
    this.renderPanel();
  }

  private refreshHud() {
    if (this.mode !== "village" || !this.ui) {
      if (this.mode === "battle" || this.mode === "scout") this.refreshBattleHud();
      return;
    }
    const v = this.v;
    const now = this.now();
    const cap = capacity(v);
    const r = this.refs;
    r.goldFill.style.width = `${Math.min(100, (v.gold / Math.max(1, cap.gold)) * 100)}%`;
    r.manaFill.style.width = `${Math.min(100, (v.mana / Math.max(1, cap.mana)) * 100)}%`;
    r.goldTxt.textContent = `${fmtNum(v.gold)} / ${fmtNum(cap.gold)}`;
    r.manaTxt.textContent = `${fmtNum(v.mana)} / ${fmtNum(cap.mana)}`;
    r.crystals.textContent = fmtNum(v.crystals);
    r.trophies.textContent = String(v.trophies);
    r.league.textContent = leagueFor(v.trophies);
    r.shield.textContent = v.shieldUntil > now ? `🛡 Shield ${fmtTime((v.shieldUntil - now) / 1000)}` : "";
    const b = `${builders(v) - busyBuilders(v, now)}/${builders(v)}`;
    r.builders.textContent = b;
    r.buildersMobile.textContent = `Builders ${b}`;
    if (this.selected >= 0 || this.placing) this.renderPanel(true);
    this.modalRefresh?.();
  }

  private toast(msg: string, bad = false) {
    const t = this.toastEl;
    if (!t) return;
    t.textContent = msg;
    t.style.background = bad ? "rgba(127,29,29,0.9)" : "rgba(0,0,0,0.8)";
    t.style.opacity = "1";
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.style.opacity = "0"), 2200);
    if (bad) this.audio.nope();
  }

  private act(r: ActionResult, ok?: string) {
    if (!r.ok) this.toast(r.why, true);
    else {
      if (ok) this.toast(ok);
      this.save();
    }
    this.refreshHud();
    this.renderPanel();
    return r.ok;
  }

  /** The panel above the bottom bar: the selected building, or placement. */
  private renderPanel(liveOnly = false) {
    const panel = this.refs.panel;
    if (!panel) return;
    const v = this.v;
    const now = this.now();
    if (this.placing) {
      if (liveOnly) return;
      const p = this.placing;
      const def = BUILDINGS[p.type];
      const ok = fits(v.buildings, p.type, p.x, p.y, p.moving ?? -1);
      const place = button(p.moving !== undefined ? "Move here" : "Place", `${BTN} border-[#22c55e]`, () => this.confirmPlace());
      place.setAttribute("data-testid", "cf-place");
      place.disabled = !ok;
      if (!ok) place.style.opacity = "0.5";
      const cancel = button("Cancel", BTN, () => {
        this.placing = null;
        this.view?.setGhost(null);
        this.view?.showGrid(false);
        this.renderPanel();
      });
      cancel.setAttribute("data-testid", "cf-cancel");
      panel.replaceChildren(
        el(
          "div",
          "flex items-center justify-between gap-2 rounded-xl bg-black/70 p-2 text-white backdrop-blur-sm",
          el("div", "text-xs", el("p", "font-bold", def.name), el("p", "text-white/60", this.coarse ? "Drag the ghost or tap a spot" : "Drag the ghost or click a spot")),
          el("div", "flex gap-2", cancel, place),
        ),
      );
      return;
    }
    const b = v.buildings.find((x) => x.id === this.selected);
    if (!b) {
      panel.replaceChildren();
      return;
    }
    if (liveOnly) {
      const timer = this.refs.timer;
      if (timer && b.busyUntil) timer.textContent = `${b.level ? "Upgrading" : "Building"} · ${fmtTime((b.busyUntil - now) / 1000)} left`;
      else if (timer && timer.textContent) this.renderPanel();
      const st = this.refs.stored;
      if (st && b.stored !== undefined) st.textContent = `${fmtNum(b.stored)} waiting`;
      return;
    }
    const def = BUILDINGS[b.type];
    const next = def.levels[b.level];
    const actions: HTMLElement[] = [];
    if (b.busyUntil) {
      const cost = finishCost((b.busyUntil - now) / 1000);
      const f = button("", `${BTN} flex items-center gap-1.5`, () => this.act(finishNow(v, b.id, this.now()), `${def.name} finished`) && this.audio.build());
      f.append("Finish now ", priceTag("crystals", cost));
      f.setAttribute("data-testid", "cf-finish");
      actions.push(f);
    } else if (next) {
      const u = button("", `${BTN} flex items-center gap-1.5 border-[#facc15]/70`, () => {
        if (this.act(upgrade(v, b.id, this.now()), `Upgrading ${def.name}`)) this.audio.build();
      });
      u.append(`Upgrade to ${b.level + 1} `, priceTag(def.resource, next.cost), el("span", "text-[10px] text-white/60", fmtTime(next.time)));
      u.setAttribute("data-testid", "cf-upgrade");
      if (next.keep > keepLevel(v) && b.type !== "keep") {
        u.disabled = true;
        u.style.opacity = "0.5";
        u.title = `Needs Keep level ${next.keep}`;
      }
      actions.push(u);
    }
    if (b.stored !== undefined && b.stored >= 1) {
      const c = button("Collect", BTN, () => this.collectOne(b));
      c.setAttribute("data-testid", "cf-collect");
      actions.push(c);
    }
    if (b.type === "barracks" || b.type === "camp") actions.push(button("Train", BTN, () => this.openArmy()));
    if (b.type === "clanHall") actions.push(button("Request", BTN, () => this.act(requestClan(v, this.now()), "Request sent to your clan")));
    const mv = button("Move", BTN, () => {
      this.placing = { type: b.type, x: b.x, y: b.y, moving: b.id };
      this.selected = -1;
      this.view?.showGrid(true);
      this.renderPanel();
    });
    mv.setAttribute("data-testid", "cf-move");
    actions.push(mv);
    const timer = el("p", "text-xs font-bold text-amber-300", b.busyUntil ? `${b.level ? "Upgrading" : "Building"} · ${fmtTime((b.busyUntil - now) / 1000)} left` : "");
    const stored = el("p", "text-xs text-white/70", b.stored !== undefined ? `${fmtNum(b.stored)} waiting` : "");
    this.refs.timer = timer;
    this.refs.stored = stored;
    panel.replaceChildren(
      el(
        "div",
        "flex flex-col gap-2 rounded-xl bg-black/75 p-3 text-white backdrop-blur-sm",
        el("div", "flex items-baseline justify-between gap-2", el("p", "font-display text-lg font-black", def.name), el("p", "text-xs font-bold uppercase tracking-wider text-[#facc15]", b.level ? `Level ${b.level}` : "Under construction")),
        el("p", "text-xs text-white/70", def.blurb),
        el("ul", "text-xs text-white/85", ...statLines(b.type, Math.max(1, b.level)).map((l) => el("li", "", `• ${l}`))),
        timer,
        stored,
        el("div", "flex flex-wrap gap-2", ...actions),
      ),
    );
  }

  private collectOne(b: Building) {
    const got = collect(this.v, this.now(), b.id);
    if (got.gold || got.mana) {
      if (got.gold) this.audio.coins();
      else this.audio.mana();
      this.toast(`+${fmtNum(got.gold || got.mana)} ${got.gold ? "gold" : "mana"}`);
      this.save();
    } else this.toast(b.type === "goldMine" ? "Your vaults are full" : "Your vats are full", true);
    this.refreshHud();
    this.renderPanel();
  }

  private startPlacing(type: BuildingType) {
    const v = this.v;
    const size = BUILDINGS[type].size;
    // A free spot near where you're looking.
    const f = this.view!.focus;
    const cx = Math.round(f.x + GRID / 2 - size / 2);
    const cy = Math.round(f.z + GRID / 2 - size / 2);
    let spot = { x: Math.max(0, Math.min(GRID - size, cx)), y: Math.max(0, Math.min(GRID - size, cy)) };
    search: for (let r = 0; r < GRID; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (fits(v.buildings, type, x, y)) {
            spot = { x, y };
            break search;
          }
        }
    this.placing = { type, ...spot };
    this.selected = -1;
    this.view?.showGrid(true);
    this.renderPanel();
  }

  private confirmPlace() {
    const p = this.placing;
    if (!p) return;
    const v = this.v;
    if (p.moving !== undefined) {
      if (this.act(move(v, p.moving, p.x, p.y))) {
        this.selected = p.moving;
        this.placing = null;
        this.view?.setGhost(null);
        this.view?.showGrid(false);
        this.renderPanel();
      }
      return;
    }
    const r = build(v, p.type, p.x, p.y, this.now());
    if (!r.ok) return this.act(r);
    this.audio.build();
    this.save();
    if (p.type === "wall" && countOf(v, "wall") < maxOf(v, "wall") && v.gold >= BUILDINGS.wall.levels[0].cost) {
      // Keep laying walls: the next one goes alongside.
      const nx = fits(v.buildings, "wall", p.x + 1, p.y) ? { x: p.x + 1, y: p.y } : fits(v.buildings, "wall", p.x, p.y + 1) ? { x: p.x, y: p.y + 1 } : null;
      if (nx) {
        this.placing = { type: "wall", ...nx };
        this.refreshHud();
        this.renderPanel();
        return;
      }
    }
    this.selected = v.buildings[v.buildings.length - 1].id;
    this.placing = null;
    this.view?.setGhost(null);
    this.view?.showGrid(false);
    this.refreshHud();
    this.renderPanel();
  }

  // --------------------------------------------------------------- modals

  private openModal(title: string, testid: string, body: (box: HTMLElement) => void, refresh?: () => void) {
    this.closeModal();
    const box = el("div", "flex flex-col gap-3");
    const close = button("✕", "rounded-md px-2 py-1 text-lg text-white/70 hover:text-white", () => this.closeModal());
    close.setAttribute("aria-label", "Close");
    close.setAttribute("data-testid", "cf-close");
    const m = el(
      "div",
      "pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-black/50 p-3",
      el("div", "flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-white/15 bg-[#14200f]/95 text-white shadow-2xl", el("div", "flex items-center justify-between border-b border-white/10 px-4 py-2", el("h2", "font-display text-xl font-black uppercase tracking-wider", title), close), el("div", "overflow-auto p-4", box)),
    );
    m.setAttribute("data-testid", testid);
    m.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (e.target === m) this.closeModal();
    });
    body(box);
    this.modal = m;
    this.modalRefresh = refresh ?? null;
    this.host.appendChild(m);
  }

  private closeModal() {
    this.modal?.remove();
    this.modal = null;
    this.modalRefresh = null;
  }

  private openShop(tab = 0) {
    const v = this.v;
    this.openModal("Shop", "cf-shop-panel", (box) => {
      const tabs = el("div", "flex flex-wrap gap-2", ...SHOP.map((s, i) => {
        const b = button(s.tab, `${BTN} ${i === tab ? "border-[#facc15]" : ""}`, () => this.openShop(i));
        b.setAttribute("aria-pressed", String(i === tab));
        return b;
      }));
      const keep = keepLevel(v);
      const items = SHOP[tab].types.map((t) => {
        const def = BUILDINGS[t];
        const have = countOf(v, t);
        const max = maxOf(v, t);
        const unlockAt = def.max.findIndex((n) => n > have) + 1;
        const hut = t === "builderHut";
        const price = hut ? 250 * (have - 1) : def.levels[0].cost;
        const res = hut ? "crystals" : def.resource;
        const afford = (hut ? v.crystals : v[def.resource]) >= price;
        const can = have < max;
        const b = button("", `${BTN} flex flex-col items-start gap-1 text-left ${can ? "" : "opacity-50"}`, () => {
          if (!can) return this.toast(unlockAt ? `Upgrade your Keep to level ${unlockAt}` : "You have them all", true);
          if (!afford) return this.toast(`Not enough ${res}`, true);
          this.closeModal();
          this.startPlacing(t);
        });
        b.setAttribute("data-testid", `cf-buy-${t}`);
        b.append(
          el("span", "flex w-full items-baseline justify-between gap-2", el("span", "font-bold", def.name), el("span", "text-[10px] text-white/60", `${have}/${max}`)),
          el("span", "text-[11px] font-normal text-white/65", def.blurb),
          el("span", `flex items-center gap-2 text-xs ${afford ? "" : "text-red-300"}`, priceTag(res, price), def.levels[0].time ? el("span", "text-white/50", fmtTime(def.levels[0].time)) : ""),
          can ? "" : el("span", "text-[10px] font-bold uppercase text-amber-300", unlockAt > 0 ? `Keep ${unlockAt} for more` : "All built"),
        );
        return b;
      });
      box.append(tabs, el("div", "grid gap-2 sm:grid-cols-2", ...items), el("p", "text-[11px] text-white/50", `Keep level ${keep}. Upgrade the Keep to unlock more.`));
    });
  }

  private openArmy() {
    const v = this.v;
    const counts = new Map<TroopType, HTMLElement>();
    const status = el("div", "flex flex-wrap items-center gap-3 text-sm");
    const queueTxt = el("p", "text-xs text-white/70");
    const clanTxt = el("p", "text-xs text-white/70");
    const finishBtn = button("", `${BTN} text-xs`, () => this.act(finishTraining(v, this.now()), "Training finished"));
    finishBtn.setAttribute("data-testid", "cf-finish-training");
    const refresh = () => {
      tick(v, this.now());
      const h = housing(v);
      status.replaceChildren(el("span", "font-bold", `Camps ${h.used}/${h.cap}`), el("span", "text-white/60", `Barracks level ${barracksLevel(v)}`), priceTag("mana", v.mana));
      for (const t of TROOP_ORDER) {
        const q = v.queue.filter((x) => x.type === t).length;
        counts.get(t)!.textContent = `${v.army[t]} ready${q ? ` · ${q} training` : ""}`;
      }
      const last = v.queue[v.queue.length - 1];
      queueTxt.textContent = last ? `Training: done in ${fmtTime((last.done - this.now()) / 1000)}` : "Nothing training.";
      finishBtn.hidden = !last;
      finishBtn.replaceChildren("Finish now ", ...(last ? [priceTag("crystals", finishCost((last.done - this.now()) / 1000))] : []));
      const cap = clanCapacity(v);
      const inClan = TROOP_ORDER.reduce((a, t) => a + v.clan[t] * TROOPS[t].housing, 0);
      clanTxt.textContent = !cap ? "Build a Clan Hall (Keep 3) to get reinforcements." : v.clanReady ? `Your clan is sending troops: ${fmtTime((v.clanReady - this.now()) / 1000)}` : `Clan Hall: ${inClan}/${cap} · ${TROOP_ORDER.filter((t) => v.clan[t]).map((t) => `${v.clan[t]} ${TROOPS[t].name}`).join(", ") || "empty"}`;
    };
    this.openModal(
      "Army",
      "cf-army-panel",
      (box) => {
        const cards = TROOP_ORDER.map((t) => {
          const d = TROOPS[t];
          const locked = barracksLevel(v) < d.barracks;
          const count = el("span", "text-[11px] font-bold text-[#facc15]");
          counts.set(t, count);
          const add = button("+ Train", `${BTN} text-xs`, () => {
            if (this.act(train(v, t, this.now()))) this.audio.click();
            refresh();
          });
          add.setAttribute("data-testid", `cf-train-${t}`);
          const sub = button("−", `${BTN} text-xs`, () => {
            untrain(v, t, this.now());
            this.save();
            refresh();
          });
          sub.setAttribute("aria-label", `Cancel one ${d.name}`);
          if (locked) add.disabled = sub.disabled = true;
          const swatch = el("span", "grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg font-black text-black/70", d.name[0]);
          swatch.style.background = d.color;
          return el(
            "div",
            `flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2 ${locked ? "opacity-50" : ""}`,
            swatch,
            el(
              "div",
              "flex min-w-0 flex-1 flex-col gap-1",
              el("span", "flex items-baseline justify-between gap-2", el("span", "font-bold", d.name), count),
              el("span", "text-[11px] text-white/65", d.blurb),
              el("span", "flex flex-wrap items-center gap-2 text-[11px] text-white/60", priceTag("mana", d.cost), `${d.housing} space`, fmtTime(d.time), locked ? el("span", "font-bold text-amber-300", `Barracks ${d.barracks}`) : ""),
              el("span", "flex gap-2", add, sub),
            ),
          );
        });
        const req = button("Request reinforcements", `${BTN} text-xs`, () => {
          this.act(requestClan(v, this.now()), "Request sent to your clan");
          refresh();
        });
        req.setAttribute("data-testid", "cf-request");
        box.append(status, el("div", "grid gap-2 sm:grid-cols-2", ...cards), el("div", "flex flex-wrap items-center gap-3", queueTxt, finishBtn), card("Clan", clanTxt, req));
        refresh();
      },
      refresh,
    );
  }

  private openLog() {
    const v = this.v;
    this.openModal("Defense log", "cf-log-panel", (box) => {
      const s = v.stats;
      box.append(
        el("div", "grid grid-cols-2 gap-2 sm:grid-cols-4", stat("Raids", s.raids), stat("Won", s.wins), stat("Stars", s.stars), stat("Looted", fmtNum(s.goldLooted + s.manaLooted))),
        v.log.length ? el("ul", "flex flex-col gap-2", ...v.log.map((d) => this.logRow(d))) : el("p", "text-sm text-white/70", "Nobody has attacked you yet."),
      );
    });
  }

  private logRow(d: DefenseLog) {
    const ago = (this.now() - d.at) / 1000;
    return el(
      "li",
      "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm",
      el("span", "", el("span", "font-bold", d.attacker), el("span", "text-white/50", ` · ${fmtTime(ago)} ago`)),
      el("span", "text-[#facc15]", "★".repeat(d.stars) + "☆".repeat(3 - d.stars)),
      el("span", "text-white/70", `${d.destruction}%`),
      el("span", "flex items-center gap-2 text-xs", priceTag("gold", d.gold), priceTag("mana", d.mana)),
      el("span", `text-xs font-bold ${d.trophies >= 0 ? "text-green-400" : "text-red-400"}`, `${d.trophies >= 0 ? "+" : ""}${d.trophies} 🏆`),
    );
  }

  private showAway(list: DefenseLog[]) {
    this.openModal("While you were away", "cf-away", (box) => {
      box.append(el("p", "text-sm text-white/75", `${list.length === 1 ? "A raider" : `${list.length} raiders`} hit your village.`), el("ul", "flex flex-col gap-2", ...list.map((d) => this.logRow(d))));
      const ok = button("Back to work", `${BTN} self-center`, () => this.closeModal());
      box.append(ok);
    });
  }

  // ---------------------------------------------------------------- raids

  private armySize() {
    return TROOP_ORDER.reduce((a, t) => a + this.v.army[t], 0);
  }

  /** Find a village to raid (costs a little gold). */
  private search(first: boolean) {
    const v = this.v;
    if (first && !this.armySize()) {
      this.toast("Train some troops first", true);
      this.openArmy();
      return;
    }
    const cost = searchCost(keepLevel(v));
    if (v.gold < cost) {
      this.toast(`Searching costs ${cost} gold`, true);
      return;
    }
    v.gold -= cost;
    this.save();
    this.closeModal();
    this.placing = null;
    this.selected = -1;
    this.view?.setGhost(null);
    this.searchSeed = (this.searchSeed * 1103515245 + 12345 + (this.test ? 0 : Date.now())) & 0x7fffffff;
    this.base = generateBase(v.trophies, this.searchSeed || 1);
    tick(v, this.now());
    this.battle = new Battle(this.base, v.army, v.clan, this.searchSeed + 7);
    this.mode = "scout";
    this.troop = TROOP_ORDER.find((t) => v.army[t] > 0) ?? null;
    this.view!.focus.set(0, 0, 0);
    this.view!.showDeployZone(this.battle);
    this.buildBattleUi();
  }

  private buildBattleUi() {
    this.ui?.remove();
    const b = this.battle!;
    const base = this.base!;
    const r = (this.refs = {} as Record<string, HTMLElement>);
    r.timer = el("span", "font-display text-2xl font-black tabular-nums");
    r.timer.setAttribute("data-testid", "cf-timer");
    r.pct = el("span", "font-display text-2xl font-black tabular-nums");
    r.pct.setAttribute("data-testid", "cf-destruction");
    r.stars = el("span", "text-2xl text-[#facc15]");
    r.stars.setAttribute("data-testid", "cf-stars");
    r.lootG = el("span", "");
    r.lootM = el("span", "");
    r.label = el("span", "text-[10px] font-bold uppercase tracking-wider text-white/60");
    const topLeft = el(
      "div",
      "pointer-events-auto flex flex-col gap-1 rounded-xl bg-black/60 px-3 py-2 text-white backdrop-blur-sm",
      el("span", "font-bold", base.name),
      el("span", "text-xs text-white/70", `🏆 ${base.trophies} · Keep ${base.keep} · win +${trophyDelta(3, this.v.trophies, base.trophies)} / lose ${trophyDelta(0, this.v.trophies, base.trophies)}`),
      r.label,
      el("span", "flex items-center gap-3 text-sm font-bold", el("span", "flex items-center gap-1", dot(GOLD), r.lootG), el("span", "flex items-center gap-1", dot(MANA), r.lootM)),
    );
    const topRight = el("div", "pointer-events-auto flex flex-col items-end gap-0.5 rounded-xl bg-black/60 px-3 py-2 text-white backdrop-blur-sm", r.timer, el("span", "flex items-center gap-2", r.stars, r.pct));
    const troops = el("div", "pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-xl bg-black/60 p-1.5");
    const mk = (key: TroopType | "clan", label: string, color: string) => {
      const n = el("span", "text-[10px] font-black");
      const btn = button("", "relative flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border-2 text-white", () => {
        this.troop = key;
        this.audio.click();
        this.refreshBattleHud();
      });
      btn.append(el("span", "text-[11px] font-black leading-tight", label), n);
      btn.style.background = `${color}cc`;
      btn.setAttribute("data-testid", `cf-troop-${key}`);
      r[`troop-${key}`] = btn;
      r[`count-${key}`] = n;
      return btn;
    };
    for (const t of TROOP_ORDER) if (b.left[t] > 0) troops.append(mk(t, TROOPS[t].name, TROOPS[t].color));
    if (TROOP_ORDER.some((t) => b.clan[t] > 0)) troops.append(mk("clan", "Clan", "#0ea5e9"));
    const next = button("", "pointer-events-auto rounded-xl border-2 border-white/30 bg-black/60 px-4 py-2 text-sm font-black uppercase text-white hover:border-[#facc15]", () => this.search(false));
    next.append("Next ", priceTag("gold", searchCost(keepLevel(this.v))));
    next.setAttribute("data-testid", "cf-next");
    r.next = next;
    const end = button("End battle", "pointer-events-auto rounded-xl border-2 border-red-300/60 bg-red-700/80 px-4 py-2 text-sm font-black uppercase text-white", () => {
      if (!this.battle) return;
      if (!this.battle.started) return this.toVillage();
      this.battle.surrender();
    });
    end.setAttribute("data-testid", "cf-end");
    r.end = end;
    const hint = el("p", "pointer-events-none rounded-lg bg-black/50 px-3 py-1 text-center text-xs text-white/80", this.coarse ? "Pick a troop, then tap or drag on the green to deploy" : "Pick a troop (1–7), then click or drag on the green to deploy");
    r.hint = hint;
    const toast = el("div", "pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-sm font-bold text-white opacity-0 transition-opacity");
    this.toastEl = toast;
    this.ui = el(
      "div",
      "pointer-events-none absolute inset-0 z-10",
      el("div", "absolute inset-x-2 top-2 flex items-start justify-between gap-2", topLeft, topRight),
      el("div", "absolute inset-x-2 bottom-2 flex flex-col items-center gap-2", hint, el("div", "flex w-full items-end justify-between gap-2 pr-12", el("div", "flex flex-col gap-2", next, end), troops)),
      toast,
    );
    this.ui.setAttribute("data-testid", "cf-battle-hud");
    this.host.appendChild(this.ui);
    this.refreshBattleHud();
  }

  private refreshBattleHud() {
    const b = this.battle;
    const r = this.refs;
    if (!b || !r.timer) return;
    const left = b.started ? BATTLE_SECONDS - b.time : BATTLE_SECONDS;
    r.timer.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    r.pct.textContent = `${b.destruction}%`;
    r.stars.textContent = "★".repeat(b.stars) + "☆".repeat(3 - b.stars);
    const avail = b.available;
    const loot = b.loot;
    r.label.textContent = b.started ? "Loot taken" : "Available loot";
    r.lootG.textContent = fmtNum(b.started ? loot.gold : avail.gold);
    r.lootM.textContent = fmtNum(b.started ? loot.mana : avail.mana);
    r.next.hidden = b.started;
    r.end.textContent = b.started ? "Surrender" : "Go home";
    r.hint.hidden = b.started && b.remaining === 0;
    for (const t of [...TROOP_ORDER, "clan" as const]) {
      const btn = r[`troop-${t}`];
      if (!btn) continue;
      const n = t === "clan" ? (b.clanDeployed ? 0 : 1) : b.left[t];
      r[`count-${t}`].textContent = t === "clan" ? (n ? "ready" : "used") : `×${n}`;
      btn.style.opacity = n ? "1" : "0.35";
      btn.style.borderColor = this.troop === t ? "#facc15" : "rgba(255,255,255,0.2)";
      btn.setAttribute("aria-pressed", String(this.troop === t));
    }
  }

  private deployAtScreen(cx: number, cy: number) {
    const b = this.battle;
    if (!b || !this.view || b.ended || !this.troop) return false;
    const rect = this.host.getBoundingClientRect();
    const p = this.view.tileAt(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    if (!p) return false;
    let ok: boolean;
    if (this.troop === "clan") ok = b.deployClan(p.x, p.y);
    else ok = b.deploy(this.troop, p.x, p.y);
    if (!ok) {
      if (!b.canDeploy(Math.floor(p.x), Math.floor(p.y))) this.toast("Can't deploy on the red", true);
      return false;
    }
    if (this.mode === "scout") this.startBattle();
    // Out of this troop: pick the next one that's left.
    if (this.troop !== "clan" && b.left[this.troop] <= 0) this.troop = TROOP_ORDER.find((t) => b.left[t] > 0) ?? (b.clanDeployed || !TROOP_ORDER.some((t) => b.clan[t]) ? null : "clan");
    else if (this.troop === "clan") this.troop = TROOP_ORDER.find((t) => b.left[t] > 0) ?? null;
    this.refreshBattleHud();
    return true;
  }

  private startBattle() {
    this.mode = "battle";
    this.audio.horn();
  }

  private finishBattle() {
    const b = this.battle!;
    const base = this.base!;
    const v = this.v;
    this.mode = "results";
    const res = b.result();
    const trophies = trophyDelta(res.stars, v.trophies, base.trophies);
    const got = applyRaid(v, { stars: res.stars, gold: res.gold, mana: res.mana, trophies, used: res.used, usedClan: res.usedClan }, this.now());
    this.save();
    this.audio.victory(res.stars);
    this.emitter.progress(v.trophies, performance.now(), 0);
    const usedList = TROOP_ORDER.filter((t) => res.used[t]).map((t) => `${res.used[t]} ${TROOPS[t].name}${res.used[t] > 1 ? "s" : ""}`);
    const home = primaryButton("Return home", ACCENT, () => {
      box.remove();
      this.toVillage();
    });
    home.setAttribute("data-testid", "cf-home");
    const post = button("Post trophies & finish", `${BTN} mt-1`, () => {
      box.remove();
      this.loop.pause();
      this.mode = "menu";
      this.emitter.emit({ kind: "final", score: v.trophies, durationMs: this.loop.activeMs, ranked: !this.test });
    });
    post.setAttribute("data-testid", "cf-post");
    const box = el(
      "div",
      "absolute inset-0 z-20 grid place-items-center overflow-auto bg-black/70 p-4 text-white",
      el(
        "div",
        "w-full max-w-lg rounded-2xl border-2 border-white/15 bg-[#14200f] p-5 text-center",
        el("p", "text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", `Raid on ${base.name}`),
        el("p", "mt-1 font-display text-4xl font-black uppercase", res.stars ? "Victory!" : "Defeat"),
        el("p", "mt-1 text-5xl tracking-widest text-[#facc15]", "★".repeat(res.stars) + "☆".repeat(3 - res.stars)),
        el("div", "mt-4 grid grid-cols-2 gap-2 text-left sm:grid-cols-4", stat("Destruction", `${res.destruction}%`), stat("Gold", `+${fmtNum(got.gold)}`), stat("Mana", `+${fmtNum(got.mana)}`), stat("Trophies", `${trophies >= 0 ? "+" : ""}${trophies}`)),
        el("p", "mt-3 text-xs text-white/60", usedList.length ? `Troops used: ${usedList.join(", ")}${res.usedClan ? " and your clan's" : ""}` : "No troops used."),
        el("p", "mt-1 text-xs text-white/60", `${v.trophies} trophies · ${leagueFor(v.trophies)} league${res.stars ? ` · +${res.stars} crystals` : ""}`),
        el("div", "mt-4 flex flex-col items-center gap-2", home, post),
      ),
    );
    box.dataset.results = "";
    box.setAttribute("data-testid", "cf-results");
    this.host.appendChild(box);
  }

  // ----------------------------------------------------------------- loop

  private shownVillage(): ShownBuilding[] {
    return this.v.buildings
      .filter((b) => b.id !== this.placing?.moving)
      .map((b) => {
        const st = BUILDINGS[b.type].levels[Math.max(0, b.level - 1)];
        const ready = b.stored !== undefined && !b.busyUntil && b.stored >= Math.max(5, (st.capacity ?? 0) * 0.05) ? (b.type === "goldMine" ? "gold" : "mana") : null;
        return { id: b.id, type: b.type, level: b.level, x: b.x, y: b.y, busy: !!b.busyUntil, ready };
      });
  }

  private update(dt: number) {
    if (!this.view) return;
    const pan = 40 * dt * 8;
    const k = (...c: string[]) => c.some((x) => this.keys.has(x));
    const px = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
    const py = (k("KeyS", "ArrowDown") ? 1 : 0) - (k("KeyW", "ArrowUp") ? 1 : 0);
    if (px || py) this.view.pan(-px * pan, -py * pan, this.host.clientHeight);
    const b = this.battle;
    if (b && (this.mode === "battle" || this.mode === "scout")) {
      b.step(dt);
      for (const e of b.events) {
        this.audio.onEvent(e);
        if (e.kind === "boom") this.view.boom(e.x, e.y, e.r);
        if (e.kind === "destroyed") this.zoneDirty = true;
      }
      b.events.length = 0;
      // Hold to deploy a stream.
      if (this.gesture === "deploy" && this.pointers.size === 1) {
        this.deployAt -= dt;
        if (this.deployAt <= 0) {
          const p = [...this.pointers.values()][0];
          this.deployAtScreen(p.x, p.y);
          this.deployAt = 0.12;
        }
      }
      if (b.ended && this.mode === "battle") this.finishBattle();
    }
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const view = this.view;
    if (!view) return;
    this.res.tick(dt, now, (k) => view.setResolution(k));
    if (this.mode === "village" || this.mode === "menu") {
      if (now - this.saveAt > 500) {
        tick(this.v, this.now());
        this.saveAt = now;
      }
      view.syncBuildings(this.shownVillage(), this.selected);
      const p = this.placing;
      view.setGhost(p ? { type: p.type, x: p.x, y: p.y, ok: fits(this.v.buildings, p.type, p.x, p.y, p.moving ?? -1) } : null);
    } else if (this.battle) {
      const b = this.battle;
      view.syncBuildings(b.targets.map((t) => ({ id: t.id, type: t.type, level: t.level, x: t.x, y: t.y, destroyed: t.destroyed, hp: t.hp / t.maxHp, aim: t.aim, fired: t.fired })));
      view.syncUnits(b.units, dt);
      view.syncProjectiles(b.projectiles);
      if (this.zoneDirty) {
        view.showDeployZone(b);
        this.zoneDirty = false;
      }
    }
    view.render(dt);
    if (now - this.hudAt > 250) {
      this.hudAt = now;
      this.refreshHud();
      if (this.mode === "village") this.emitter.progress(this.v.trophies, now);
    }
  }

  // ---------------------------------------------------------------- input

  private tileFromEvent(cx: number, cy: number) {
    const rect = this.host.getBoundingClientRect();
    return this.view?.tileAt(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1) ?? null;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.view || e.target !== this.view.canvas || this.mode === "menu" || this.mode === "results") return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    this.audio.unlock();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    this.moved = false;
    if (this.pointers.size === 2) {
      const [a, c] = [...this.pointers.values()];
      this.pinchD = Math.hypot(a.x - c.x, a.y - c.y);
      this.gesture = "pinch";
      return;
    }
    const tile = this.tileFromEvent(e.clientX, e.clientY);
    this.gesture = "pan";
    if ((this.mode === "scout" || this.mode === "battle") && this.troop && tile && this.battle?.canDeploy(Math.floor(tile.x), Math.floor(tile.y))) {
      this.gesture = "deploy";
      this.deployAtScreen(e.clientX, e.clientY);
      this.deployAt = 0.3;
    } else if (this.mode === "village" && this.placing && tile) {
      const p = this.placing;
      const size = BUILDINGS[p.type].size;
      if (tile.x >= p.x - 0.5 && tile.x < p.x + size + 0.5 && tile.y >= p.y - 0.5 && tile.y < p.y + size + 0.5) this.gesture = "ghost";
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.view) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) this.moved = true;
    if (this.gesture === "pinch" && this.pointers.size === 2) {
      const [a, c] = [...this.pointers.values()];
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      if (this.pinchD > 0 && d > 0) this.view.zoom(this.pinchD / d);
      this.pinchD = d;
      return;
    }
    if (this.gesture === "pan" && this.moved) this.view.pan(dx, dy, this.host.clientHeight);
    else if (this.gesture === "ghost" && this.placing) {
      const t = this.tileFromEvent(e.clientX, e.clientY);
      if (!t) return;
      const size = BUILDINGS[this.placing.type].size;
      const nx = Math.max(0, Math.min(GRID - size, Math.floor(t.x - size / 2 + 0.5)));
      const ny = Math.max(0, Math.min(GRID - size, Math.floor(t.y - size / 2 + 0.5)));
      if (nx !== this.placing.x || ny !== this.placing.y) {
        this.placing.x = nx;
        this.placing.y = ny;
        this.renderPanel();
      }
    } else if (this.gesture === "deploy" && this.moved) {
      // Dragging lays a line of troops.
      if (Math.hypot(dx, dy) > 0 && this.deployAt > 0.06) this.deployAt = Math.min(this.deployAt, 0.06);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (this.pointers.size === 0) this.gesture = "none";
    else if (g === "pinch") {
      this.gesture = "pan";
      for (const q of this.pointers.values()) {
        q.sx = q.x;
        q.sy = q.y;
      }
      this.moved = true;
    }
    if (g !== "pan" || this.moved || !this.view) return;
    // A tap.
    const t = this.tileFromEvent(e.clientX, e.clientY);
    if (!t) return;
    if (this.mode === "village") this.tapVillage(t.x, t.y);
    else if ((this.mode === "scout" || this.mode === "battle") && !this.troop) this.toast("No troops left to deploy");
    else if (this.mode === "scout" || this.mode === "battle") this.toast("Can't deploy on the red", true);
  };

  private tapVillage(x: number, y: number) {
    const v = this.v;
    if (this.placing) {
      const size = BUILDINGS[this.placing.type].size;
      this.placing.x = Math.max(0, Math.min(GRID - size, Math.floor(x - size / 2 + 0.5)));
      this.placing.y = Math.max(0, Math.min(GRID - size, Math.floor(y - size / 2 + 0.5)));
      this.renderPanel();
      return;
    }
    const hit = v.buildings.find((b) => {
      const s = BUILDINGS[b.type].size;
      return x >= b.x && x < b.x + s && y >= b.y && y < b.y + s;
    });
    if (!hit) {
      this.selected = -1;
      this.renderPanel();
      return;
    }
    this.audio.click();
    // Tapping a full-ish collector collects it straight away.
    const st = BUILDINGS[hit.type].levels[Math.max(0, hit.level - 1)];
    if (hit.stored !== undefined && hit.stored >= Math.max(5, (st.capacity ?? 0) * 0.05) && this.selected !== hit.id) {
      this.selected = hit.id;
      this.collectOne(hit);
      return;
    }
    this.selected = hit.id;
    this.renderPanel();
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.view || this.mode === "menu") return;
    e.preventDefault();
    this.view.zoom(Math.exp(e.deltaY * 0.0012));
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.view || this.mode === "menu" || !this.loop.isRunning) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (e.code === "Equal" || e.code === "NumpadAdd") this.view.zoom(0.85);
    if (e.code === "Minus" || e.code === "NumpadSubtract") this.view.zoom(1.18);
    if ((this.mode === "battle" || this.mode === "scout") && /^Digit[1-7]$/.test(e.code)) {
      const b = this.battle!;
      const list: (TroopType | "clan")[] = [...TROOP_ORDER.filter((t) => b.left[t] > 0 || b.used[t] > 0), ...(TROOP_ORDER.some((t) => b.clan[t]) ? ["clan" as const] : [])];
      const pick = list[Number(e.code.slice(5)) - 1];
      if (pick) {
        this.troop = pick;
        this.refreshBattleHud();
      }
    }
    if (this.mode === "village" && e.code === "Enter" && this.placing) this.confirmPlace();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private clearInput = () => {
    this.keys.clear();
    this.pointers.clear();
    this.gesture = "none";
  };

  // ----------------------------------------------------------------- tests

  private installHooks() {
    const w = window as unknown as Record<string, unknown>;
    w.__clan = {
      village: () => this.v,
      mode: () => this.mode,
      battle: () => this.battle,
      /** Move the clock on (ms). */
      advance: (ms: number) => {
        this.skew += ms;
        tick(this.v, this.now());
        this.refreshHud();
      },
      /** Let the AI fight your raid to the end. */
      autoBattle: () => {
        const b = this.battle;
        if (!b) return;
        if (this.mode === "scout") this.startBattle();
        let w2 = 0;
        for (let i = 0; i < BATTLE_SECONDS * 60 && !b.ended; i++) {
          if (i % 30 === 0 && b.remaining > 0 && w2 < 40) b.autoDeploy(w2++);
          this.update(1 / 60);
        }
        if (!b.ended) b.surrender();
        this.update(1 / 60);
      },
      give: (gold: number, mana: number, crystals = 0) => {
        this.v.gold += gold;
        this.v.mana += mana;
        this.v.crystals += crystals;
        this.refreshHud();
      },
    };
  }
}

const factory: GameFactory = () => new ClanforgeGame();
export default factory;
