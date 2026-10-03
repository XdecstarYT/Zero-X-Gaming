import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import type { Detail } from "../sports-kit/look";
import { BTN, button, el, hero, howTo, primaryButton, ResolutionGovernor } from "../sports-kit/ui";
import { LifeView, type Look } from "../life/render";
import type { Pose } from "../code-3/people3d";
import {
  addItem,
  addOpening,
  addWall,
  checkItem,
  checkWall,
  colliders,
  emptyBuild,
  FURNITURE,
  furnitureDef,
  paintFloor,
  PLACES,
  placeById,
  PLOT_D,
  PLOT_W,
  PLOTS,
  removeAt,
  ROADS,
  spawnFor,
  starterBuild,
  toLocal,
  toWorld,
  walk,
  type Build,
  type Colliders,
  type FloorMat,
  type FurnitureType,
  type Place,
} from "../life/world";
import { BroadcastChannelTransport, randomId } from "../neon-siege/net";
import { SupabaseTransport } from "../neon-siege/net-supabase";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { LocalBackend, SupabaseBackend, type TownBackend } from "./backend";
import { ITEM_INFO, ITEMS, JOBS, netWorth, quote, RECIPES, RULES, type BusinessKind, type ItemId, type Job, type PlotInfo, type TownMe, type TownSnapshot } from "./economy";
import { TownPresence, type TownMsg, type WireLook } from "./presence";

const PREFS_KEY = "zx-town-prefs";
const AMBER = "#f59e0b";
const SKINS = ["#f1c9a5", "#e0ac84", "#c68c5d", "#8d5a3b", "#5a3a28"];
const HAIRS = ["#1f140d", "#4a2f1b", "#a16207", "#d6b37a", "#7f1d1d", "#111111"];
const SHIRTS = ["#1e3a8a", "#065f46", "#7c2d12", "#f5f5f4", "#6d28d9", "#be123c", "#0f172a"];
const INPUT = "h-9 w-full rounded-md border-2 border-white/15 bg-black/40 px-2 text-sm text-white focus:border-amber-400 focus:outline-none";

type Role = "land" | "farm" | "forest" | "mine" | "hall" | "exchange" | "gazette" | "bank";
/** Main Street, repurposed: Life's shops become the town's job sites and offices. */
const SITES: Partial<Record<string, { role: Role; name: string; sign: string }>> = {
  realty: { role: "land", name: "Town Land Office", sign: "LAND OFFICE" },
  freshmart: { role: "farm", name: "Greenacre Farm Co-op", sign: "GREENACRE FARM CO-OP" },
  furniture: { role: "forest", name: "Tall Pines Timber Yard", sign: "TALL PINES TIMBER" },
  garage: { role: "mine", name: "Copperhill Mine", sign: "COPPERHILL MINE" },
  cityhall: { role: "hall", name: "City Hall", sign: "CITY HALL" },
  office: { role: "exchange", name: "Town Exchange", sign: "TOWN EXCHANGE" },
  cafe: { role: "gazette", name: "The Hometown Gazette", sign: "THE GAZETTE" },
  carlot: { role: "bank", name: "Town Bank", sign: "TOWN BANK" },
};

/** Emotes: a pose held for a few seconds, seen by everyone nearby. */
const EMOTES: { id: string; label: string; pose: Pose; key: string }[] = [
  { id: "wave", label: "👋 Wave", pose: "handsup", key: "Digit1" },
  { id: "cheer", label: "🎉 Cheer", pose: "celebrate", key: "Digit2" },
  { id: "point", label: "👉 Point", pose: "point", key: "Digit3" },
  { id: "phone", label: "📱 Phone", pose: "phone", key: "Digit4" },
  { id: "talk", label: "💬 Chat", pose: "talk", key: "Digit5" },
];
const JOB_OF: Partial<Record<Role, Job>> = { farm: "farm", forest: "forest", mine: "mine" };

type Tool = "wall" | "door" | "window" | "floor" | "item" | "delete";
type PhoneTab = "bag" | "market" | "news";

interface Prefs {
  gfx?: Detail;
  look?: WireLook;
}

const lookOf = (l: WireLook, seed: number): Look => ({ sex: l.sex, skin: SKINS[l.skin % SKINS.length], hair: HAIRS[l.hair % HAIRS.length], shirt: SHIRTS[l.shirt % SHIRTS.length], pants: "#1f2937", seed });
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 997;
const cash = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const plotName = (id: number) => `${PLOTS[id].number} ${PLOTS[id].street}`;
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

/**
 * Hometown: one shared, persistent online town. Everyone signed in lives in
 * the same Harbour City: work shifts for raw goods, buy land and build a
 * house, found a business that turns goods into products, trade on the
 * town's order-book exchange or in your own shop, and vote (or run) for mayor,
 * who sets the sales tax and the public wage. The database is the authority
 * for every coin and crate; this client just shows it and asks.
 */
class HometownGame implements GameModule {
  readonly slug = "hometown";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private view: LifeView | null = null;
  private res = new ResolutionGovernor();
  private coarse = false;
  private test = false;
  private localOnly = false;
  private prefs: Prefs = {};
  private lastFrame = 0;
  private authOff: (() => void) | null = null;

  // The town.
  private mode: "menu" | "town" = "menu";
  private backend: TownBackend | null = null;
  private presence: TownPresence | null = null;
  private meInfo: TownMe | null = null;
  private snap: TownSnapshot | null = null;
  private builds = new Map<number, Build>();
  private buildsAt = "";
  private col: Colliders | null = null;
  private refreshTimer = 0;
  private refreshSoon = 0;
  private refreshing = false;
  private busy = false;
  private me = { x: 0, z: 0, heading: 0, speed: 0, pose: "stand" as Pose };
  private prompt = "";
  private act: (() => void) | null = null;
  private marker: { x: number; z: number; color: string } | null = null;
  private phoneTab: PhoneTab = "bag";
  private emote: { pose: Pose; t: number } | null = null;
  private mapT = 0;
  private marketItem: ItemId = "wheat";

  // Build mode.
  private building = false;
  private buildPlot = -1;
  private tool: Tool = "wall";
  private item: FurnitureType = "sofa";
  private rot = 0;
  private floor: FloorMat = "wood";
  private wallStart: { x: number; z: number } | null = null;
  private cursor: { x: number; z: number } | null = null;
  private saving: Promise<void> = Promise.resolve();

  // DOM.
  private hud: HTMLDivElement | null = null;
  private refs: Record<string, HTMLElement> = {};
  private panel: HTMLDivElement | null = null;
  private panelRender: (() => void) | null = null;
  private toastEl: HTMLDivElement | null = null;
  private toastTimer = 0;

  // Input.
  private keys = new Set<string>();
  private stick: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  private orbit: { id: number; x: number; y: number } | null = null;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    try {
      this.prefs = (JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Prefs | null) ?? {};
    } catch {
      this.prefs = {};
    }
    const q = new URLSearchParams(window.location.search);
    this.test = q.has("town");
    this.localOnly = q.get("town") === "local";
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
    const sb = getSupabaseBrowser();
    if (sb) {
      const { data } = sb.auth.onAuthStateChange(() => {
        if (this.mode === "menu") void this.showMenu();
      });
      this.authOff = () => data.subscription.unsubscribe();
    }
    this.hooks();
  }

  start() {
    this.loop.pause();
    this.leaveTown();
    void this.showMenu();
  }

  pause() {
    this.loop.pause();
    this.clearInput();
  }

  resume() {
    if (this.mode !== "town") return;
    this.lastFrame = performance.now();
    this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    this.leaveTown();
    this.authOff?.();
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
    delete (window as unknown as Record<string, unknown>).__town;
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  private savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      // Blocked storage: the look just isn't remembered.
    }
  }

  // ---------------------------------------------------------------- menu

  private async signedInUser() {
    if (this.localOnly) return null;
    const sb = getSupabaseBrowser();
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getSession();
      return data.session?.user ?? null;
    } catch {
      return null;
    }
  }

  private async showMenu(note?: string) {
    this.mode = "menu";
    this.menu.hidden = false;
    const user = await this.signedInUser();
    if (this.mode !== "menu") return;
    const look: WireLook = { sex: "F", skin: 1, hair: 0, shirt: 0, ...this.prefs.look };
    const swatches = (label: string, list: string[], key: "skin" | "hair" | "shirt") => {
      const row = el("div", "flex flex-wrap items-center gap-1.5", el("span", "w-12 text-xs text-white/60", label));
      const paint = () =>
        row.querySelectorAll("button").forEach((b, i) => {
          (b as HTMLButtonElement).style.outline = i === look[key] ? "2px solid #fbbf24" : "none";
        });
      list.forEach((c, i) => {
        const b = button("", "h-7 w-7 rounded-full border-2 border-white/30", () => ((look[key] = i), paint()));
        b.style.background = c;
        b.setAttribute("aria-label", `${label} ${i + 1}`);
        row.append(b);
      });
      paint();
      return row;
    };
    const sexRow = el("div", "flex items-center gap-1.5", el("span", "w-12 text-xs text-white/60", "Body"));
    const sexBtns = (["F", "M"] as const).map((s) => {
      const paint = () =>
        sexBtns.forEach((x, i) => {
          const on = (i === 0 ? "F" : "M") === look.sex;
          x.classList.toggle("border-amber-400", on);
          x.classList.toggle("border-white/20", !on);
        });
      const b = button(s === "F" ? "Female" : "Male", "rounded-full border-2 px-3 py-1 text-xs font-bold", () => {
        look.sex = s;
        paint();
      });
      b.classList.add(s === look.sex ? "border-amber-400" : "border-white/20");
      return b;
    });
    sexRow.append(...sexBtns);
    const go = (online: boolean) => {
      this.prefs.look = { ...look };
      this.savePrefs();
      void this.enterTown(online, user?.id ?? null);
    };
    const live = user
      ? primaryButton("Move to town", AMBER, () => go(true))
      : el(
          "div",
          "rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100",
          this.localOnly || !getSupabaseBrowser() ? "The live town needs an online connection to Zero X." : "Sign in (top right) to move into the live town with everyone else. Your citizen, cash, goods, land and house are saved on the server.",
        );
    if (user) live.setAttribute("data-testid", "town-live");
    const practice = button("Practice town (offline)", `${BTN} w-full`, () => go(false));
    practice.setAttribute("data-testid", "town-practice");
    const gfx = el("div", "flex items-center gap-1.5 text-xs", el("span", "w-12 text-white/60", "Graphics"));
    for (const g of ["low", "high"] as Detail[]) {
      const b = button(g, `rounded-full border-2 px-3 py-1 font-bold capitalize ${(this.prefs.gfx ?? (this.coarse ? "low" : "high")) === g ? "border-amber-400" : "border-white/20"}`, () => {
        this.prefs.gfx = g;
        this.savePrefs();
        void this.showMenu();
      });
      gfx.append(b);
    }
    const box = el(
      "div",
      "m-auto flex w-full max-w-3xl flex-col gap-4",
      hero("Online · persistent · player-run", "Hometown", "One town, everyone in it. Work, build, trade, open a shop, run a business and run for mayor. Every coin and crate is real and shared.", "linear-gradient(135deg,#78350f,#0f172a 60%,#064e3b)"),
    );
    if (note) box.append(el("p", "rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200", note));
    box.append(
      el(
        "div",
        "grid gap-4 md:grid-cols-2",
        el("div", "flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4", el("h2", "text-lg font-black", "Your citizen"), sexRow, swatches("Skin", SKINS, "skin"), swatches("Hair", HAIRS, "hair"), swatches("Shirt", SHIRTS, "shirt"), gfx),
        el("div", "flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4", el("h2", "text-lg font-black", user ? `Welcome back, ${this.opts.playerName ?? "citizen"}` : "Play"), live, practice, el("p", "text-xs text-white/50", "The practice town runs in this tab with a few neighbours trading. Nothing there is saved.")),
      ),
      howTo([
        ["Work", "Shifts at the farm, timber yard and mine pay a little cash and raw goods. Public works at City Hall pay the wage the mayor sets."],
        ["Produce", "Buy a lot and found a business on it: a mill turns wheat into flour, a bakery flour into bread, a sawmill logs into planks, and so on."],
        ["Trade", "Post buy and sell orders at the Town Exchange (or from your phone). Orders match at the best price, and the seller pays the sales tax to the town."],
        ["Shops", "Open a shop on your lot, stock the shelves at your own prices, and anyone walking by can buy."],
        ["Build", "Walls take a plank each and furniture comes from the workshop. Your house is there for everyone who walks past."],
        ["Govern", "Elections every six hours at City Hall. The mayor sets the sales tax and the public wage, paid from the treasury."],
      ]),
    );
    this.menu.replaceChildren(box);
  }

  // --------------------------------------------------------------- town

  private async enterTown(online: boolean, userId: string | null) {
    const name = (this.opts.playerName ?? "Guest").slice(0, 20);
    let backend: TownBackend;
    if (online && userId) {
      const sb = getSupabaseBrowser();
      if (!sb) return this.showMenu("Online play isn't configured.");
      // Through the client (rpc needs its `this`); the town_* functions aren't in the generated types.
      const untyped = sb as unknown as { rpc: (f: string, a?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
      const rpc = (fn: string, args?: Record<string, unknown>) => untyped.rpc(fn, args);
      backend = new SupabaseBackend(rpc, userId);
    } else backend = new LocalBackend("me", name === "Guest" ? "You" : name);
    this.menu.replaceChildren(el("div", "m-auto text-center text-lg font-bold text-white/80", online ? "Moving to town…" : "Opening the practice town…"));
    try {
      this.meInfo = await backend.join({ ...this.prefs.look });
      this.snap = await backend.snapshot();
    } catch (e) {
      return this.showMenu((e as Error).message);
    }
    this.backend = backend;
    const look = lookOf(this.prefs.look ?? { sex: "F", skin: 1, hair: 0, shirt: 0 }, hash(this.meInfo.id));
    if (!this.view) {
      try {
        const signs: Record<string, string> = {};
        for (const [id, s] of Object.entries(SITES)) signs[id] = s!.sign;
        this.view = new LifeView(this.host, this.prefs.gfx ?? (this.coarse ? "low" : "high"), look, { signs, npcs: 4 });
      } catch {
        this.backend = null;
        return this.showMenu("3D graphics aren't available on this device (WebGL is off).");
      }
      this.view.canvas.setAttribute("data-testid", "town-canvas");
    } else this.view.setLook(look);
    this.builds.clear();
    this.saved.clear();
    this.prefab.clear();
    this.buildsAt = "";
    for (const p of PLOTS) this.view.setBuild(p, emptyBuild());
    await this.loadBuilds();
    this.col = colliders((id) => this.buildOf(id));
    // Step out of City Hall, or your own front door.
    const mine = this.snap.plots.find((p) => p.owner === this.meInfo!.id);
    const hall = placeById("cityhall")!;
    const at = mine ? spawnFor(mine.id) : { x: hall.door.x, z: hall.door.z + 2, heading: 0 };
    this.me = { x: at.x, z: at.z, heading: at.heading, speed: 0, pose: "stand" };
    this.view.yaw = Math.PI * 0.85;
    // Neighbours: the live room online, other tabs in the practice town.
    const transport = online ? new SupabaseTransport<TownMsg>("MAIN", name, this.meInfo.id, "town") : new BroadcastChannelTransport<TownMsg>("MAIN", name, randomId(), "town-local");
    this.presence = new TownPresence(transport, name);
    this.presence.onDirty = () => (this.refreshSoon = Math.max(this.refreshSoon, 0.8));
    this.presence.onChat = () => this.renderChat();
    this.presence.connect().catch(() => this.toast("Couldn't reach the street: you won't see other players for now."));
    this.mode = "town";
    this.menu.hidden = true;
    this.buildHud();
    this.applySnapshot();
    this.lastFrame = performance.now();
    this.loop.start();
    this.toast(online ? `Welcome to Hometown, ${this.meInfo.name}. ${this.snap.citizens} citizens.` : "The practice town: nothing here is saved.");
  }

  private leaveTown() {
    if (this.mode !== "town") return;
    this.loop.pause();
    this.closePanel();
    this.setBuilding(false);
    this.presence?.close();
    this.presence = null;
    this.backend = null;
    this.mode = "menu";
    if (this.hud) this.hud.hidden = true;
  }

  /** A lot's house: what its owner built, a stand-in storefront for a business or shop, or bare grass. */
  private buildOf(plot: number) {
    return this.builds.get(plot) ?? (this.prefab.has(plot) ? starterBuild(2000 + plot * 13, 0) : emptyBuild());
  }
  private prefab = new Set<number>();

  private async loadBuilds() {
    if (!this.backend || !this.view) return;
    const list = await this.backend.builds(this.buildsAt || undefined);
    let changed = false;
    for (const b of list) {
      const build = b.build as Build;
      if (!build || !Array.isArray(build.walls)) continue;
      // Our own edits in flight win over an older copy from the server.
      if (this.building && b.id === this.buildPlot) continue;
      this.builds.set(b.id, build);
      this.saved.set(b.id, { walls: build.walls.length, items: build.items.length });
      this.view.setBuild(PLOTS[b.id], build);
      if (b.at > this.buildsAt) this.buildsAt = b.at;
      changed = true;
    }
    if (changed) this.col = colliders((id) => this.buildOf(id));
  }

  /** Pull the town and you again (after an action, a ping from a neighbour, or on a timer). */
  private async refresh() {
    if (!this.backend || this.refreshing) return;
    this.refreshing = true;
    try {
      const [me, snap] = await Promise.all([this.backend.me(), this.backend.snapshot()]);
      if (!this.backend) return;
      this.meInfo = me;
      this.snap = snap;
      await this.loadBuilds();
      this.applySnapshot();
    } catch {
      // Offline for a moment: try again on the next tick.
    } finally {
      this.refreshing = false;
    }
  }

  private applySnapshot() {
    const s = this.snap;
    if (!s || !this.view) return;
    let rebuilt = false;
    for (const p of s.plots) {
      const pl = PLOTS[p.id];
      const pre = !this.builds.has(p.id) && !!(p.business || p.shop) && !(this.building && this.buildPlot === p.id);
      if (pre !== this.prefab.has(p.id)) {
        if (pre) this.prefab.add(p.id);
        else this.prefab.delete(p.id);
        if (!this.builds.has(p.id)) this.view.setBuild(pl, this.buildOf(p.id));
        rebuilt = true;
      }
      if (p.shop) this.view.setPlotSign(pl, `🛒 ${p.shop.name}`, "#86efac");
      else if (p.business) this.view.setPlotSign(pl, `${RECIPES[p.business.kind].icon} ${p.business.name}`, "#fcd34d");
      else if (p.salePrice != null) this.view.setPlotSign(pl, `For sale ${cash(p.salePrice)}`, "#fca5a5");
      else if (p.owner) this.view.setPlotSign(pl, p.owner === this.meInfo?.id ? "🏠 Your lot" : `${p.ownerName}'s`, "#ffffff");
      else this.view.setPlotSign(pl, null);
    }
    if (rebuilt) this.col = colliders((id) => this.buildOf(id));
    this.panelRender?.();
    this.refreshHud();
  }

  /** Run a town action: busy guard, the server's answer as a toast, then refresh. */
  private async run<T>(fn: (b: TownBackend) => Promise<T>, ok?: (r: T) => string) {
    if (!this.backend || this.busy) return;
    this.busy = true;
    try {
      const r = await fn(this.backend);
      if (ok) this.toast(ok(r));
      this.presence?.dirty();
    } catch (e) {
      this.toast((e as Error).message);
    } finally {
      this.busy = false;
    }
    await this.refresh();
  }

  // ------------------------------------------------------------------ HUD

  private buildHud() {
    this.hud?.remove();
    const r: Record<string, HTMLElement> = {};
    r.cash = el("span", "font-black tabular-nums text-amber-300");
    r.cash.setAttribute("data-testid", "town-cash");
    r.energy = el("div", "h-full rounded-full bg-emerald-400");
    r.energyText = el("span", "w-8 text-right text-[11px] tabular-nums text-white/70");
    r.who = el("span", "text-[11px] text-white/70");
    r.bag = el("div", "flex flex-wrap gap-1 text-[11px]");
    r.bag.setAttribute("data-testid", "town-bag");
    r.online = el("span", "text-[11px] text-white/60");
    r.prompt = el("div", "pointer-events-auto absolute bottom-24 left-1/2 hidden -translate-x-1/2 cursor-pointer rounded-full bg-black/70 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-sm");
    r.prompt.setAttribute("data-testid", "town-prompt");
    r.prompt.addEventListener("click", () => this.act?.());
    const btn = (label: string, testid: string, fn: () => void) => {
      const b = button(label, "pointer-events-auto rounded-xl border-2 border-white/25 bg-black/60 px-3 py-2 text-xs font-black uppercase tracking-wider text-white hover:border-amber-400", fn);
      b.setAttribute("data-testid", testid);
      return b;
    };
    r.buildBtn = btn("Build", "town-build", () => this.setBuilding(!this.building));
    const phone = btn("📱 Phone", "town-phone", () => this.phone(this.phoneTab));
    const chat = btn("💬", "town-chat-open", () => this.focusChat());
    chat.setAttribute("aria-label", "Chat");
    const leave = btn("Leave", "town-leave", () => {
      this.leaveTown();
      void this.showMenu();
    });
    const buttons = el("div", "absolute bottom-3 right-14 flex flex-wrap justify-end gap-2", r.buildBtn, chat, phone, leave);
    const top = el(
      "div",
      "absolute left-2 top-2 flex max-w-[60%] flex-col gap-1 rounded-xl bg-black/55 px-3 py-2 text-white backdrop-blur-sm",
      el("div", "flex items-center gap-3 text-sm", r.cash, r.who),
      el("div", "flex items-center gap-1.5 text-xs", el("span", "", "⚡"), el("div", "h-2 w-24 overflow-hidden rounded-full bg-white/15", r.energy), r.energyText),
      r.bag,
    );
    r.map = el("canvas", "mt-1 block h-[120px] w-[160px] rounded-lg");
    (r.map as HTMLCanvasElement).width = 320;
    (r.map as HTMLCanvasElement).height = 240;
    r.map.setAttribute("data-testid", "town-minimap");
    r.map.setAttribute("aria-label", "Town map: you are the yellow arrow");
    const right = el("div", "absolute right-2 top-2 flex flex-col items-end rounded-xl bg-black/55 px-3 py-2 text-right text-white backdrop-blur-sm", r.online, r.map);
    const emotes = (r.emotes = el(
      "div",
      `absolute ${this.coarse ? "bottom-40 right-2" : "bottom-16 right-14"} flex flex-wrap justify-end gap-1`,
      ...EMOTES.map((e) => {
        const b = button(e.label, "pointer-events-auto rounded-full border border-white/20 bg-black/55 px-2 py-1 text-[11px] font-bold text-white hover:border-amber-400", () => this.doEmote(e.pose));
        b.setAttribute("data-testid", `town-emote-${e.id}`);
        b.title = `${e.label.slice(3)} (${e.key.slice(5)})`;
        return b;
      }),
    ));
    const toast = el("div", "pointer-events-none absolute left-1/2 top-16 max-w-[80%] -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-center text-sm font-bold text-white opacity-0 transition-opacity");
    toast.setAttribute("role", "status");
    toast.setAttribute("data-testid", "town-toast");
    this.toastEl = toast;
    r.buildPanel = el("div", "pointer-events-auto absolute bottom-3 left-2 right-36 hidden max-h-[45%] overflow-y-auto rounded-xl bg-black/75 p-2 text-white backdrop-blur-sm");
    r.buildPanel.setAttribute("data-testid", "town-build-panel");
    // Chat: the last few lines, and a box to type in.
    r.chatLog = el("div", "flex flex-col gap-0.5 text-xs");
    r.chatLog.setAttribute("data-testid", "town-chat");
    const input = el("input", "pointer-events-auto h-8 w-full rounded-md border border-white/20 bg-black/60 px-2 text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none") as HTMLInputElement;
    input.placeholder = "Say something (Enter)";
    input.maxLength = 120;
    input.setAttribute("aria-label", "Chat message");
    input.setAttribute("data-testid", "town-chat-input");
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const err = this.presence?.say(input.value);
        if (err) this.toast(err);
        input.value = "";
        input.blur();
      }
      if (e.key === "Escape") input.blur();
    });
    r.chatInput = input;
    const chatBox = el("div", `absolute left-2 flex w-72 max-w-[60%] flex-col gap-1 ${this.coarse ? "bottom-40" : "bottom-3"}`, r.chatLog, input);
    r.stick = el("div", "absolute bottom-6 left-6 hidden h-28 w-28 rounded-full border-2 border-white/30 bg-black/25");
    r.knob = el("div", "absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60");
    r.stick.append(r.knob);
    if (this.coarse) r.stick.classList.remove("hidden");
    this.hud = el("div", "pointer-events-none absolute inset-0 z-10", top, right, r.prompt, chatBox, r.buildPanel, emotes, buttons, r.stick, toast);
    this.hud.setAttribute("data-testid", "town-hud");
    this.refs = r;
    this.host.appendChild(this.hud);
    this.renderChat();
  }

  private focusChat() {
    (this.refs.chatInput as HTMLInputElement | undefined)?.focus();
  }

  private renderChat() {
    const log = this.refs.chatLog;
    if (!log || !this.presence) return;
    log.replaceChildren(
      ...this.presence.chat.slice(-6).map((c) => {
        const line = el("div", "w-fit max-w-full rounded bg-black/55 px-2 py-0.5 text-white", el("b", c.me ? "text-amber-300" : "text-sky-300", `${c.name}: `));
        line.append(c.text);
        return line;
      }),
    );
  }

  private refreshHud() {
    const r = this.refs;
    const me = this.meInfo;
    if (!r.cash || !me) return;
    r.cash.textContent = cash(me.cash);
    r.who.textContent = `${me.name}${this.snap?.state.mayor === me.id ? " · Mayor" : ""}`;
    r.energy.style.width = `${me.energy}%`;
    r.energy.style.background = me.energy > 50 ? "#34d399" : me.energy > 20 ? "#fbbf24" : "#f87171";
    r.energyText.textContent = `${me.energy}`;
    const bagKey = JSON.stringify(me.inventory);
    if (r.bag.dataset.key !== bagKey) {
      r.bag.dataset.key = bagKey;
      r.bag.replaceChildren(...ITEMS.filter((i) => me.inventory[i]).map((i) => el("span", "rounded bg-white/10 px-1.5 py-0.5", `${ITEM_INFO[i].icon} ${me.inventory[i]}`)));
    }
    const n = (this.presence?.others.size ?? 0) + 1;
    r.online.textContent = `${this.backend?.online ? "🟢 Live" : "🟡 Practice"} · ${n} here${this.snap ? ` · ${this.snap.citizens} citizens` : ""}`;
    r.prompt.textContent = this.prompt;
    r.prompt.classList.toggle("hidden", !this.prompt);
    r.buildBtn.hidden = !this.building && this.ownLotHere() < 0;
  }

  private toast(t: string) {
    const t2 = this.toastEl;
    if (!t2 || this.mode !== "town") return;
    t2.textContent = t;
    t2.style.opacity = "1";
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t2.style.opacity = "0"), 2800);
  }

  // --------------------------------------------------------------- panels

  /** A modal panel; `body` is re-run whenever the town refreshes. */
  private openPanel(title: string, testid: string, body: (box: HTMLElement) => void) {
    this.closePanel();
    const box = el("div", "flex flex-col gap-2");
    const close = button("✕", "rounded-md px-2 py-1 text-lg text-white/70 hover:text-white", () => this.closePanel());
    close.setAttribute("aria-label", "Close");
    close.setAttribute("data-testid", "town-close");
    const head = el("h2", "text-lg font-black", title);
    const p = el(
      "div",
      "pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-black/45 p-3",
      el("div", "flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900/95 text-white shadow-2xl", el("div", "flex items-center justify-between border-b border-white/10 px-4 py-2", head, close), el("div", "overflow-auto p-4", box)),
    );
    p.setAttribute("data-testid", testid);
    p.addEventListener("pointerdown", (e) => e.stopPropagation());
    p.addEventListener("keydown", (e) => e.stopPropagation());
    const draw = () => {
      // Keep what's being typed: don't redraw under a focused field.
      const a = document.activeElement;
      if (a && p.contains(a) && (a.tagName === "INPUT" || a.tagName === "SELECT" || a.tagName === "TEXTAREA")) return;
      box.replaceChildren();
      body(box);
    };
    draw();
    this.panel = p;
    this.panelRender = draw;
    this.host.appendChild(p);
  }

  private closePanel() {
    this.panel?.remove();
    this.panel = null;
    this.panelRender = null;
  }

  private opt(label: string, sub: string, fn: () => void, testid?: string, disabled = false) {
    const b = button("", `${BTN} flex w-full items-center justify-between gap-2 text-left`, fn);
    b.append(el("span", "font-bold", label), el("span", "text-xs font-normal text-white/60", sub));
    if (testid) b.setAttribute("data-testid", testid);
    b.disabled = disabled || this.busy;
    if (b.disabled) b.style.opacity = "0.45";
    return b;
  }

  private small(label: string, fn: () => void, testid?: string, tone = "border-white/20") {
    const b = button(label, `rounded-lg border-2 ${tone} px-2.5 py-1 text-xs font-bold hover:border-amber-400`, fn);
    if (testid) b.setAttribute("data-testid", testid);
    return b;
  }

  private field(type: string, value: string | number, label: string, testid: string, extra: Partial<HTMLInputElement> = {}) {
    const i = el("input", INPUT) as HTMLInputElement;
    i.type = type;
    i.value = String(value);
    i.setAttribute("aria-label", label);
    i.setAttribute("data-testid", testid);
    Object.assign(i, extra);
    return i;
  }

  private select<T extends string>(options: [T, string][], value: T, label: string, testid: string) {
    const s = el("select", INPUT) as HTMLSelectElement;
    for (const [v, t] of options) {
      const o = el("option", "", t) as HTMLOptionElement;
      o.value = v;
      s.append(o);
    }
    s.value = value;
    s.setAttribute("aria-label", label);
    s.setAttribute("data-testid", testid);
    return s;
  }

  private section(title: string, ...body: Node[]) {
    return el("div", "flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3", el("h3", "text-xs font-black uppercase tracking-wider text-white/60", title), ...body);
  }

  private cooldown(iso: string | null, ms: number) {
    if (!iso) return 0;
    return Math.max(0, Math.ceil((Date.parse(iso) + ms - Date.now()) / 1000));
  }

  /** Walking into a building on Main Street. */
  private enterSite(p: Place) {
    const site = SITES[p.id];
    if (!site) return this.toast(`${p.name} is closed today.`);
    const job = JOB_OF[site.role];
    if (job) return this.jobPanel(site.name, job);
    if (site.role === "hall") return this.hallPanel();
    if (site.role === "exchange") return this.phone("market");
    if (site.role === "gazette") return this.phone("news");
    if (site.role === "land") return this.landPanel();
    if (site.role === "bank") return this.bankPanel();
  }

  private jobPanel(title: string, job: Job) {
    this.openPanel(title, `town-site-${job}`, (box) => {
      const me = this.meInfo!;
      const j = JOBS[job];
      const wait = this.cooldown(me.workedAt, RULES.shiftCooldownMs);
      const pay = job === "public" ? `${cash(this.snap?.state.publicWage ?? 0)} from the treasury` : `+${j.qty}${me.inventory.tools ? "+2 (tools)" : ""} ${ITEM_INFO[j.gives!].name.toLowerCase()} · ${cash(RULES.shiftPay)}`;
      box.append(
        this.opt(wait ? `Back to work in ${wait}s` : `Work a ${j.name.toLowerCase()}`, `${pay} · −${RULES.shiftEnergy} energy`, () =>
          void this.run((b) => b.work(job), (r) => (r.item ? `+${r.qty} ${ITEM_INFO[r.item].name.toLowerCase()} and ${cash(r.cash)}` : `Paid ${cash(r.cash)}`)), `town-work-${job}`, wait > 0 || me.energy < RULES.shiftEnergy),
        el("p", "text-xs text-white/60", me.energy < RULES.shiftEnergy ? "You're worn out. Eat some bread (from your phone) or rest a while: energy comes back a point every two minutes." : "Raw goods sell on the exchange, or feed a business: see your phone."),
      );
      if (job === "public") box.append(el("p", "text-xs text-white/60", `Treasury: ${cash(this.snap?.state.treasury ?? 0)}`));
    });
  }

  private hallPanel() {
    this.openPanel("City Hall", "town-hall", (box) => {
      const s = this.snap!;
      const me = this.meInfo!;
      const el2 = s.election;
      const left = Math.max(0, Date.parse(el2.endsAt) - Date.now());
      const h = Math.floor(left / 3600_000);
      const m = Math.floor((left % 3600_000) / 60_000);
      box.append(
        this.section(
          "The town",
          el("p", "text-sm", s.state.mayorName ? `Mayor ${s.state.mayorName}` : "No mayor yet: the council keeps the lights on."),
          el("p", "text-sm text-white/70", `Sales tax ${(s.state.salesTax * 100).toFixed(1)}% · Public wage ${cash(s.state.publicWage)} a shift · Treasury ${cash(s.state.treasury)}`),
        ),
      );
      const wait = this.cooldown(me.workedAt, RULES.shiftCooldownMs);
      box.append(this.opt(wait ? `Back to work in ${wait}s` : "Public works shift", `${cash(s.state.publicWage)} from the treasury · −${RULES.shiftEnergy} energy`, () => void this.run((b) => b.work("public"), (r) => `Paid ${cash(r.cash)} by the town`), "town-work-public", wait > 0 || me.energy < RULES.shiftEnergy));
      const due = me.allowanceAt ? Date.parse(me.allowanceAt) + RULES.allowanceMs - Date.now() : 0;
      box.append(this.opt(due > 0 ? `Allowance again in ${Math.floor(due / 3600_000)}h ${Math.floor((due % 3600_000) / 60_000)}m` : "Collect your allowance", `${cash(s.state.publicWage)} from the treasury, every 20 hours`, () => void this.run((b) => b.allowance(), (n) => `+${cash(n)} allowance`), "town-allowance", due > 0));
      const ballot = this.section(`Election · polls close in ${h}h ${m}m`);
      ballot.setAttribute("data-testid", "town-ballot");
      if (!el2.candidates.length) ballot.append(el("p", "text-sm text-white/60", "Nobody's standing yet. Be the first."));
      for (const c of el2.candidates) {
        const mine = me.voted === c.id;
        const row = el(
          "div",
          "flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2",
          el("div", "min-w-0", el("p", "font-bold", `${c.name} · ${c.votes} vote${c.votes === 1 ? "" : "s"}`), el("p", "truncate text-xs text-white/70", `“${c.slogan}” · tax ${(c.salesTax * 100).toFixed(1)}% · wage ${cash(c.publicWage)}`)),
          mine ? el("span", "text-xs font-bold text-amber-300", "Your vote") : this.small("Vote", () => void this.run((b) => b.vote(c.id), () => `You voted for ${c.name}`), `town-vote-${c.name}`),
        );
        ballot.append(row);
      }
      box.append(ballot);
      if (!el2.candidates.some((c) => c.id === me.id)) {
        const slogan = this.field("text", "", "Slogan", "town-slogan", { maxLength: 80, placeholder: "Your slogan" });
        const tax = this.field("number", 5, "Sales tax percent", "town-run-tax", { min: "0", max: "20", step: "0.5" });
        const wage = this.field("number", 60, "Public wage", "town-run-wage", { min: "20", max: "200" });
        box.append(
          this.section(
            `Run for mayor (${cash(RULES.filingFee)} filing fee)`,
            slogan,
            el("div", "grid grid-cols-2 gap-2", el("label", "text-xs text-white/60", "Sales tax %", tax), el("label", "text-xs text-white/60", "Public wage", wage)),
            this.opt("Put your name on the ballot", "Platform takes effect if you win", () => void this.run((b) => b.run(slogan.value, Number(tax.value) / 100, Math.round(Number(wage.value))), () => "You're on the ballot. Go get votes."), "town-run"),
          ),
        );
      }
      if (s.state.mayor === me.id) {
        const tax = this.field("number", +(s.state.salesTax * 100).toFixed(1), "Sales tax percent", "town-policy-tax", { min: "0", max: "20", step: "0.5" });
        const wage = this.field("number", s.state.publicWage, "Public wage", "town-policy-wage", { min: "20", max: "200" });
        box.append(this.section("Mayor's office", el("div", "grid grid-cols-2 gap-2", el("label", "text-xs text-white/60", "Sales tax %", tax), el("label", "text-xs text-white/60", "Public wage", wage)), this.opt("Set the policy", "Announced in the Gazette", () => void this.run((b) => b.setPolicy(Number(tax.value) / 100, Math.round(Number(wage.value))), () => "Policy set."), "town-policy")));
      }
    });
  }

  private landPanel() {
    this.openPanel("Town Land Office", "town-land", (box) => {
      const s = this.snap!;
      const me = this.meInfo!;
      const mine = s.plots.filter((p) => p.owner === me.id);
      box.append(el("p", "text-sm text-white/70", `You own ${mine.length} of ${RULES.maxPlots} lots. Walk onto a lot to buy it, or pick one here and follow the marker.`));
      const forSale = s.plots.filter((p) => !p.owner || p.salePrice != null).sort((a, b) => (a.salePrice ?? a.price) - (b.salePrice ?? b.price));
      for (const p of forSale.slice(0, 18)) {
        const price = p.owner ? p.salePrice! : p.price;
        box.append(
          el(
            "div",
            "flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-1.5 text-sm",
            el("span", "", `${plotName(p.id)}${p.owner ? ` · ${p.ownerName}${p.business ? ` · ${p.business.name}` : ""}` : ""}`),
            el("span", "flex items-center gap-2", el("b", "text-amber-300", cash(price)), this.small("Show me", () => this.showPlot(p.id), `town-show-${p.id}`), this.small("Buy", () => void this.run((b) => b.buyPlot(p.id), () => `${plotName(p.id)} is yours.`), `town-buy-lot-${p.id}`)),
          ),
        );
      }
    });
  }

  /** The Town Bank: savings that earn interest from the treasury. */
  private bankPanel() {
    this.openPanel("Town Bank", "town-bank", (box) => {
      const me = this.meInfo!;
      const saved = me.savings ?? 0;
      const amount = this.field("number", Math.min(me.cash, 500), "Amount", "town-bank-amount", { min: "1" });
      const go = (sign: 1 | -1) => () => {
        const n = Math.round(Number(amount.value));
        if (!(n > 0)) return this.toast("How much?");
        void this.run((b) => b.bank(sign * n), (r) => `Savings: ${cash(r.savings)}`);
      };
      box.append(
        el("div", "grid grid-cols-2 gap-2", el("div", "rounded-lg bg-white/5 p-3", el("p", "text-[10px] uppercase tracking-wider text-white/50", "Cash"), el("p", "font-display text-2xl font-black text-amber-300", cash(me.cash))), el("div", "rounded-lg bg-white/5 p-3", el("p", "text-[10px] uppercase tracking-wider text-white/50", "Savings"), el("p", "font-display text-2xl font-black text-emerald-300", cash(saved)))),
        el("p", "text-sm text-white/70", `Savings earn ${RULES.savingsRate * 100}% a day, paid by the town treasury (${cash(this.snap?.state.treasury ?? 0)} in it). Cash in your pocket earns nothing.`),
        el("label", "text-xs text-white/60", "Amount", amount),
        el("div", "grid grid-cols-2 gap-2", this.small("Deposit", go(1), "town-deposit", "border-emerald-400/60"), this.small("Withdraw", go(-1), "town-withdraw", "border-amber-400/60")),
        el("div", "flex flex-wrap gap-2", this.small("Deposit all my cash", () => me.cash > 0 && void this.run((b) => b.bank(me.cash), (r) => `Savings: ${cash(r.savings)}`)), this.small("Take it all out", () => saved > 0 && void this.run((b) => b.bank(-saved), () => `Withdrew ${cash(saved)}`))),
      );
    });
  }

  private showPlot(id: number) {
    const w = spawnFor(id);
    this.marker = { x: w.x, z: w.z, color: AMBER };
    this.closePanel();
    this.toast(`${plotName(id)}: follow the marker.`);
  }

  /** Standing on a lot: yours to run, or someone else's to visit. */
  private lotPanel(id: number) {
    this.openPanel(plotName(id), `town-lot-${id}`, (box) => {
      const s = this.snap!;
      const me = this.meInfo!;
      const p = s.plots[id];
      if (!p.owner) {
        box.append(el("p", "text-sm text-white/70", "An empty lot, owned by the town."), this.opt(`Buy this lot`, `${cash(p.price)} to the treasury`, () => void this.run((b) => b.buyPlot(id), () => `${plotName(id)} is yours. Build, open a business or a shop.`), "town-buy-lot", me.cash < p.price));
        return;
      }
      if (p.owner !== me.id) return this.visitLot(box, p);
      this.ownLot(box, p);
    });
  }

  private visitLot(box: HTMLElement, p: PlotInfo) {
    const me = this.meInfo!;
    box.append(el("p", "text-sm text-white/70", `${p.ownerName}'s lot${p.business ? ` · ${p.business.name} (${RECIPES[p.business.kind].name.toLowerCase()}, ${p.business.total} made)` : ""}`));
    if (p.shop) {
      const shelf = this.section(`🛒 ${p.shop.name}`);
      shelf.setAttribute("data-testid", "town-shelf");
      if (!p.shop.items.length) shelf.append(el("p", "text-sm text-white/60", "The shelves are empty."));
      for (const it of p.shop.items) {
        const info = ITEM_INFO[it.item];
        shelf.append(
          el(
            "div",
            "flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-1.5 text-sm",
            el("span", "", `${info.icon} ${info.name} · ${it.qty} left`),
            el("span", "flex items-center gap-2", el("b", "text-amber-300", cash(it.price)), this.small("Buy 1", () => void this.run((b) => b.buyShop(p.id, it.item, 1, it.price), () => `Bought ${info.name.toLowerCase()} for ${cash(it.price)}`), `town-shop-buy-${it.item}`)),
          ),
        );
      }
      box.append(shelf);
    }
    if (p.salePrice != null) box.append(this.opt("Buy this lot (with everything on it)", `${cash(p.salePrice)} to ${p.ownerName}`, () => void this.run((b) => b.buyPlot(p.id), () => `${plotName(p.id)} is yours.`), "town-buy-lot", me.cash < p.salePrice));
  }

  private ownLot(box: HTMLElement, p: PlotInfo) {
    const me = this.meInfo!;
    const inv = me.inventory;
    box.append(this.opt("Build your house", `${inv.planks ?? 0} planks · ${inv.furniture ?? 0} furniture in your bag`, () => this.setBuilding(true, p.id), "town-build-here"));
    // The business.
    if (!p.business) {
      const kind = this.select(Object.entries(RECIPES).map(([k, r]) => [k as BusinessKind, `${r.icon} ${r.name}: ${Object.entries(r.inputs).map(([i, q]) => `${q} ${i}`).join(" + ")} → ${r.qty} ${r.output}`]), "mill", "Business type", "town-biz-kind");
      const name = this.field("text", `${me.name}'s`, "Business name", "town-biz-name", { maxLength: 30 });
      box.append(this.section(`Found a business (${cash(RULES.businessCost)})`, kind, name, this.opt("Open for business", "Make products from raw goods", () => void this.run((b) => b.foundBusiness(p.id, kind.value as BusinessKind, name.value), () => "Open for business."), "town-found", me.cash < RULES.businessCost)));
    } else {
      const biz = p.business;
      const r = RECIPES[biz.kind];
      const wait = this.cooldown(biz.producedAt, RULES.produceCooldownMs);
      const fits = Math.min(RULES.maxBatches, ...Object.entries(r.inputs).map(([i, q]) => Math.floor((inv[i as ItemId] ?? 0) / q!)), Math.floor(me.energy / RULES.produceEnergy));
      const recipe = `${Object.entries(r.inputs).map(([i, q]) => `${q} ${ITEM_INFO[i as ItemId].name.toLowerCase()}`).join(" + ")} → ${r.qty} ${ITEM_INFO[r.output].name.toLowerCase()}`;
      const sec = this.section(`${r.icon} ${biz.name} · ${biz.total} made`, el("p", "text-xs text-white/60", `Each batch: ${recipe}, ${RULES.produceEnergy} energy.`));
      for (const n of [1, Math.max(1, fits)].filter((v, i, a) => a.indexOf(v) === i))
        sec.append(this.opt(wait ? `Machines busy for ${wait}s` : `Run ${n} batch${n > 1 ? "es" : ""}`, `+${r.qty * n} ${ITEM_INFO[r.output].name.toLowerCase()}`, () => void this.run((b) => b.produce(biz.id, n), (x) => `Made ${x.qty} ${ITEM_INFO[x.item].name.toLowerCase()}`), n === 1 ? "town-produce" : "town-produce-max", wait > 0 || fits < n));
      box.append(sec);
    }
    // The shop.
    if (!p.shop) {
      const name = this.field("text", `${me.name}'s Store`, "Shop name", "town-shop-name", { maxLength: 30 });
      box.append(this.section(`Open a shop (${cash(RULES.shopCost)})`, name, this.opt("Open the shop", "Sell from your shelves to anyone passing", () => void this.run((b) => b.openShop(p.id, name.value), () => "Your shop is open."), "town-open-shop", me.cash < RULES.shopCost)));
    } else {
      const have = ITEMS.filter((i) => inv[i]);
      const sec = this.section(`🛒 ${p.shop.name}`);
      for (const it of p.shop.items)
        sec.append(el("div", "flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-1.5 text-sm", el("span", "", `${ITEM_INFO[it.item].icon} ${ITEM_INFO[it.item].name} · ${it.qty} at ${cash(it.price)}`), this.small("Take 1 back", () => void this.run((b) => b.stockShop(p.id, it.item, it.price, -1), () => "Back in your bag."), `town-unstock-${it.item}`)));
      if (have.length) {
        const item = this.select(have.map((i) => [i, `${ITEM_INFO[i].icon} ${ITEM_INFO[i].name} (${inv[i]})`]), have[0], "Item to stock", "town-stock-item");
        const price = this.field("number", Math.round((this.snap?.last[have[0]] ?? ITEM_INFO[have[0]].base) * 1.2), "Shelf price", "town-stock-price", { min: "1" });
        const qty = this.field("number", 1, "Quantity", "town-stock-qty", { min: "1" });
        sec.append(el("div", "grid grid-cols-3 gap-2", item, price, qty), this.opt("Put on the shelf", "Customers pay you, minus the sales tax", () => void this.run((b) => b.stockShop(p.id, item.value as ItemId, Math.round(Number(price.value)), Math.round(Number(qty.value))), (n) => `${n} on the shelf.`), "town-stock"));
      } else sec.append(el("p", "text-xs text-white/60", "Nothing in your bag to sell."));
      box.append(sec);
    }
    // Selling up.
    const ask = this.field("number", p.salePrice ?? Math.round(p.price * 1.3 + (p.business ? RULES.businessCost : 0)), "Asking price", "town-sell-price", { min: "1" });
    box.append(
      this.section(
        p.salePrice != null ? `Listed for ${cash(p.salePrice)}` : "Sell the lot",
        el("p", "text-xs text-white/60", "The house, business and shop go with the land."),
        ask,
        el("div", "flex gap-2", this.small(p.salePrice != null ? "Change price" : "List for sale", () => void this.run((b) => b.listPlot(p.id, Math.round(Number(ask.value))), () => "Listed."), "town-list-lot"), ...(p.salePrice != null ? [this.small("Take it off the market", () => void this.run((b) => b.listPlot(p.id, null), () => "Off the market."), "town-unlist-lot")] : [])),
      ),
    );
  }

  // ---------------------------------------------------------------- phone

  private phone(tab: PhoneTab) {
    this.phoneTab = tab;
    this.openPanel("📱 Hometown", `town-phone-${tab}`, (box) => {
      const tabs = el(
        "div",
        "flex gap-1",
        ...(
          [
            ["bag", "Bag"],
            ["market", "Market"],
            ["news", "Gazette"],
          ] as [PhoneTab, string][]
        ).map(([t, label]) => {
          const b = this.small(label, () => this.phone(t), `town-tab-${t}`, t === this.phoneTab ? "border-amber-400 bg-amber-500/20" : "border-white/20");
          return b;
        }),
      );
      box.append(tabs);
      if (tab === "bag") this.bagTab(box);
      else if (tab === "market") this.marketTab(box);
      else this.newsTab(box);
    });
  }

  private bagTab(box: HTMLElement) {
    const me = this.meInfo!;
    const s = this.snap;
    box.append(el("p", "text-sm", `${cash(me.cash)} cash · ${cash(me.savings ?? 0)} in the bank · worth ${cash(netWorth(me, s))} · ⚡ ${me.energy}`));
    const goods = ITEMS.filter((i) => me.inventory[i]);
    if (!goods.length) box.append(el("p", "text-sm text-white/60", "Your bag is empty. Work a shift at the farm, timber yard or mine on Main Street."));
    for (const i of goods) {
      const q = s ? quote(s, i) : { bid: 0, ask: 0, last: 0 };
      box.append(
        el(
          "div",
          "flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-1.5 text-sm",
          el("span", "", `${ITEM_INFO[i].icon} ${ITEM_INFO[i].name} × ${me.inventory[i]}`),
          el("span", "flex items-center gap-2 text-xs text-white/60", q.last ? `last ${cash(q.last)}` : "", i === "bread" ? this.small("Eat", () => void this.run((b) => b.eat(), (e) => `Energy ${e}`), "town-eat") : this.small("Sell", () => ((this.marketItem = i), this.phone("market")), `town-sell-${i}`)),
        ),
      );
    }
    if (s) {
      const lots = s.plots.filter((p) => p.owner === me.id);
      if (lots.length) box.append(this.section("Your lots", ...lots.map((p) => el("div", "flex items-center justify-between text-sm", el("span", "", `${plotName(p.id)}${p.business ? ` · ${p.business.name}` : ""}${p.shop ? ` · ${p.shop.name}` : ""}`), this.small("Show me", () => this.showPlot(p.id))))));
    }
  }

  private marketTab(box: HTMLElement) {
    const s = this.snap!;
    const me = this.meInfo!;
    const it = this.marketItem;
    const q = quote(s, it);
    box.append(
      el(
        "div",
        "flex flex-wrap gap-1",
        ...ITEMS.map((i) => this.small(`${ITEM_INFO[i].icon} ${ITEM_INFO[i].name}`, () => ((this.marketItem = i), this.phone("market")), `town-item-${i}`, i === it ? "border-amber-400 bg-amber-500/20" : "border-white/20")),
      ),
    );
    const asks = s.book.filter((o) => o.item === it && o.side === "sell").sort((a, b) => a.price - b.price).slice(0, 5);
    const bids = s.book.filter((o) => o.item === it && o.side === "buy").sort((a, b) => b.price - a.price).slice(0, 5);
    const col = (title: string, rows: typeof asks, tone: string) => el("div", "flex flex-col gap-0.5", el("p", "text-xs font-bold text-white/60", title), ...(rows.length ? rows.map((o) => el("p", `text-sm tabular-nums ${tone}`, `${o.qty} @ ${cash(o.price)}`)) : [el("p", "text-xs text-white/40", "none")]));
    const book = el("div", "grid grid-cols-2 gap-3 rounded-xl bg-black/30 p-3", col("Selling (asks)", asks, "text-red-300"), col("Buying (bids)", bids, "text-emerald-300"));
    book.setAttribute("data-testid", "town-book");
    box.append(el("p", "text-sm", `${ITEM_INFO[it].icon} ${ITEM_INFO[it].name}: last ${q.last ? cash(q.last) : "—"} · you have ${me.inventory[it] ?? 0}`), book);
    const price = this.field("number", q.ask || q.last || ITEM_INFO[it].base, "Price each", "town-order-price", { min: "1" });
    const qty = this.field("number", 1, "Quantity", "town-order-qty", { min: "1" });
    const order = (side: "buy" | "sell") => void this.run((b) => b.placeOrder(it, side, Math.round(Number(price.value)), Math.round(Number(qty.value))), (r) => (r.filled ? `${side === "buy" ? "Bought" : "Sold"} ${r.filled}${r.resting ? `, ${r.resting} waiting on the book` : ""}` : "Your order is on the book."));
    box.append(
      el("div", "grid grid-cols-2 gap-2", el("label", "text-xs text-white/60", "Price each", price), el("label", "text-xs text-white/60", "Quantity", qty)),
      el("div", "grid grid-cols-2 gap-2", this.small("Buy", () => order("buy"), "town-order-buy", "border-emerald-400/60"), this.small("Sell", () => order("sell"), "town-order-sell", "border-red-400/60")),
      el("p", "text-[11px] text-white/50", `Orders match the best price on the other side and wait on the book otherwise. Buying holds the cash, selling holds the goods, until it fills or you cancel. Sellers pay ${(s.state.salesTax * 100).toFixed(1)}% sales tax.`),
    );
    if (me.orders.length)
      box.append(
        this.section(
          "Your orders",
          ...me.orders.map((o) => el("div", "flex items-center justify-between text-sm", el("span", "", `${o.side === "buy" ? "Buy" : "Sell"} ${o.qty} ${ITEM_INFO[o.item].name.toLowerCase()} @ ${cash(o.price)}`), this.small("Cancel", () => void this.run((b) => b.cancelOrder(o.id), () => "Cancelled; escrow returned."), `town-cancel-${o.id}`))),
        ),
      );
    const recent = s.trades.filter((t) => t.item === it).slice(0, 5);
    if (recent.length) box.append(this.section("Recent trades", ...recent.map((t) => el("p", "text-xs text-white/70", `${t.qty} @ ${cash(t.price)} · ${t.via} · ${ago(t.at)}`))));
  }

  private newsTab(box: HTMLElement) {
    const s = this.snap!;
    box.append(
      this.section("Richest citizens", ...s.rich.map((r, i) => el("p", "text-sm", `${i + 1}. ${r.name} · ${cash(r.cash)}`))),
      this.section("The Gazette", ...(s.news.length ? s.news.map((n) => el("p", "text-sm text-white/80", `${n.text} · ${ago(n.at)}`)) : [el("p", "text-sm text-white/60", "A quiet day in Hometown.")])),
    );
  }

  // ---------------------------------------------------------------- build

  /** Which of your lots you're standing on (or -1). */
  private ownLotHere() {
    const me = this.meInfo;
    if (!me || !this.snap) return -1;
    for (const p of PLOTS) {
      const l = toLocal(p, this.me.x, this.me.z);
      if (l.x >= -1 && l.x <= PLOT_W + 1 && l.z >= -1 && l.z <= PLOT_D + 2 && this.snap.plots[p.id]?.owner === me.id) return p.id;
    }
    return -1;
  }

  private setBuilding(on: boolean, plot = this.ownLotHere()) {
    if (on && plot < 0) return this.toast("Stand on a lot you own to build.");
    this.closePanel();
    this.building = on;
    this.buildPlot = on ? plot : -1;
    this.wallStart = null;
    if (on && this.view) {
      const p = PLOTS[plot];
      if (this.prefab.delete(plot)) {
        this.view.setBuild(p, this.buildOf(plot));
        this.col = colliders((id) => this.buildOf(id));
      }
      const c = toWorld(p, PLOT_W / 2, PLOT_D / 2);
      this.view.buildFocus.set(c.x, 0, c.z);
      this.view.buildDist = 34;
      this.view.yaw = p.front === "south" ? 0 : Math.PI;
    }
    this.view?.setGhost(null, null);
    if (!on) this.applySnapshot();
    const panel = this.refs.buildPanel;
    if (!panel) return;
    panel.classList.toggle("hidden", !on);
    // The emote bar would sit over the build tools.
    this.refs.emotes?.classList.toggle("hidden", on);
    if (on) this.renderBuildPanel();
  }

  private renderBuildPanel() {
    const panel = this.refs.buildPanel;
    if (!panel || !this.building) return;
    const inv = this.meInfo?.inventory ?? {};
    const tools: [Tool, string][] = [
      ["wall", "🧱 Wall"],
      ["door", "🚪 Door"],
      ["window", "🪟 Window"],
      ["floor", "▦ Floor"],
      ["item", "🛋 Furniture"],
      ["delete", "🗑 Remove"],
    ];
    const head = el(
      "div",
      "flex flex-wrap items-center gap-1",
      ...tools.map(([t, label]) => {
        const b = button(label, `rounded-lg border-2 px-2 py-1 text-xs font-bold ${this.tool === t ? "border-amber-400 bg-amber-500/20" : "border-white/20"}`, () => {
          this.tool = t;
          this.wallStart = null;
          this.renderBuildPanel();
        });
        b.setAttribute("data-testid", `town-tool-${t}`);
        return b;
      }),
      el("span", "flex-1"),
      button("Done", "rounded-lg bg-amber-500 px-3 py-1 text-xs font-black text-white", () => this.setBuilding(false)),
    );
    const sub = el("div", "mt-2 flex flex-wrap gap-1");
    if (this.tool === "floor")
      for (const m of ["wood", "tile", "carpet", "marble", "concrete"] as FloorMat[])
        sub.append(button(m, `rounded-full border-2 px-2 py-0.5 text-xs capitalize ${this.floor === m ? "border-amber-400" : "border-white/20"}`, () => ((this.floor = m), this.renderBuildPanel())));
    if (this.tool === "item")
      for (const t of Object.keys(FURNITURE) as FurnitureType[]) {
        const b = button(furnitureDef(t).name, `rounded-lg border-2 px-2 py-1 text-[11px] font-bold ${this.item === t ? "border-amber-400 bg-amber-500/15" : "border-white/15"}`, () => ((this.item = t), this.renderBuildPanel()));
        b.setAttribute("data-testid", `town-item-${t}`);
        sub.append(b);
      }
    const hint = this.coarse ? "Tap to place · drag to look" : this.tool === "wall" ? "Click a corner, then the other end · right-drag to look · wheel zoom" : this.tool === "item" ? "Click to place · R rotates · right-drag to look" : "Click · right-drag to look · wheel zoom";
    panel.replaceChildren(head, sub, el("p", "mt-1 text-[11px] text-white/60", `${hint} · walls take a plank (${inv.planks ?? 0}), furniture a piece from the workshop (${inv.furniture ?? 0}); doors, windows and floors are free`));
  }

  private buildPreview() {
    if (this.buildPlot < 0 || !this.view) return;
    const plot = PLOTS[this.buildPlot];
    const c = this.cursor;
    if (!c) return this.view.setGhost(null, null);
    const l = toLocal(plot, c.x, c.z);
    const b = this.builds.get(plot.id) ?? emptyBuild();
    if (this.tool === "wall") {
      const sx = Math.round(l.x);
      const sz = Math.round(l.z);
      if (!this.wallStart) return this.view.setGhost(plot, { kind: "wall", x1: sx, z1: sz, x2: sx, z2: sz, ok: true });
      const end = this.wallEnd(l.x, l.z);
      this.view.setGhost(plot, { kind: "wall", x1: this.wallStart.x, z1: this.wallStart.z, x2: end.x2, z2: end.z2, ok: checkWall(b, end).ok });
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
    if (this.buildPlot < 0) return;
    const plot = PLOTS[this.buildPlot];
    const l = toLocal(plot, wx, wz);
    // Your own plan: the stand-in storefront isn't yours to build on.
    const before = this.builds.get(plot.id) ?? emptyBuild();
    const b = structuredClone(before);
    const inv = this.meInfo?.inventory ?? {};
    let r: { ok: true } | { ok: false; why: string };
    switch (this.tool) {
      case "wall": {
        if (!this.wallStart) {
          this.wallStart = { x: Math.round(l.x), z: Math.round(l.z) };
          return;
        }
        const end = this.wallEnd(l.x, l.z);
        r = addWall(b, end);
        if (r.ok) this.wallStart = { x: end.x2, z: end.z2 };
        break;
      }
      case "door":
      case "window":
        r = addOpening(b, l.x, l.z, this.tool);
        break;
      case "floor":
        r = paintFloor(b, l.x, l.z, this.floor);
        break;
      case "item":
        r = addItem(b, { type: this.item, x: Math.round(l.x * 4) / 4, z: Math.round(l.z * 4) / 4, rot: this.rot });
        break;
      case "delete":
        r = removeAt(b, l.x, l.z) ? { ok: true } : { ok: false, why: "Nothing there." };
        break;
    }
    if (!r.ok) return this.toast(r.why);
    // What the server will charge: a plank per new wall, a piece of furniture per new item.
    const saved = this.saved.get(plot.id) ?? { walls: 0, items: 0 };
    const planks = Math.max(0, b.walls.length - saved.walls);
    const furniture = Math.max(0, b.items.length - saved.items);
    if (planks > (inv.planks ?? 0)) return this.toast("You need a plank for that wall. Make them at a sawmill or buy them at the exchange.");
    if (furniture > (inv.furniture ?? 0)) return this.toast("You need a piece of furniture. Make it at a workshop or buy it at the exchange.");
    this.applyBuild(plot.id, b);
    this.saving = this.saving.then(async () => {
      if (!this.backend) return;
      try {
        await this.backend.saveBuild(plot.id, b);
        this.saved.set(plot.id, { walls: Math.max(saved.walls, b.walls.length), items: Math.max(saved.items, b.items.length) });
        this.presence?.dirty();
        const me = await this.backend.me();
        this.meInfo = me;
        this.renderBuildPanel();
      } catch (e) {
        this.toast((e as Error).message);
        this.applyBuild(plot.id, before);
      }
    });
  }

  /** What the server has counted on each lot (it charges for growth past these). */
  private saved = new Map<number, { walls: number; items: number }>();

  private applyBuild(plot: number, b: Build) {
    this.builds.set(plot, b);
    this.view?.setBuild(PLOTS[plot], b);
    this.col = colliders((id) => this.buildOf(id));
  }

  // ----------------------------------------------------------------- loop

  private update(dt: number) {
    if (this.mode !== "town" || !this.view || !this.col) return;
    // Keep the town fresh: a slow poll, sooner when a neighbour pings.
    if (this.backend instanceof LocalBackend && this.backend.live(dt)) this.refreshSoon = this.refreshSoon || 0.1;
    this.refreshTimer += dt;
    if (this.refreshSoon > 0) {
      this.refreshSoon -= dt;
      if (this.refreshSoon <= 0) {
        this.refreshSoon = 0;
        this.refreshTimer = 0;
        void this.refresh();
      }
    }
    if (this.refreshTimer > (this.backend?.online ? 8 : 4)) {
      this.refreshTimer = 0;
      void this.refresh();
    }
    const k = (...c: string[]) => c.some((x) => this.keys.has(x));
    let mx = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
    let mz = (k("KeyS", "ArrowDown") ? 1 : 0) - (k("KeyW", "ArrowUp") ? 1 : 0);
    if (this.stick) {
      mx = Math.max(-1, Math.min(1, (this.stick.x - this.stick.x0) / 45));
      mz = Math.max(-1, Math.min(1, (this.stick.y - this.stick.y0) / 45));
    }
    if (this.building) {
      const yaw = this.view.yaw;
      const s = 16 * dt;
      this.view.buildFocus.x += (Math.cos(yaw) * mx + Math.sin(yaw) * mz) * s;
      this.view.buildFocus.z += (-Math.sin(yaw) * mx + Math.cos(yaw) * mz) * s;
    } else if ((mx || mz) && !this.panel) {
      const run = k("ShiftLeft", "ShiftRight") || Math.hypot(mx, mz) > 0.95 ? 4.8 : 2.3;
      const yaw = this.view.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      let dx = fx * -mz + -fz * -mx;
      let dz = fz * -mz + fx * -mx;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      walk(this.col, this.me, dx * run * dt, dz * run * dt);
      let d = Math.atan2(dx, dz) - this.me.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.me.heading += d * Math.min(1, dt * 12);
      this.me.speed = run;
      this.me.pose = "walk";
    } else {
      this.me.speed = 0;
      this.me.pose = this.emote ? this.emote.pose : "stand";
    }
    if (this.emote && (this.emote.t -= dt) <= 0) this.emote = null;
    if ((mx || mz) && this.emote) this.emote = null;
    if (this.marker && Math.hypot(this.marker.x - this.me.x, this.marker.z - this.me.z) < 3) this.marker = null;
    this.presence?.update(this.me, this.prefs.look ?? { sex: "F", skin: 1, hair: 0, shirt: 0 });
    this.findPrompt();
    if (this.building) this.buildPreview();
  }

  private doEmote(pose: Pose) {
    if (this.building) return;
    this.emote = { pose, t: 3.5 };
  }

  /** The minimap: roads, buildings, lots (yours gold, owned white, for sale green), neighbours and you. */
  private drawMap() {
    const c = this.refs.map as HTMLCanvasElement | undefined;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const W = c.width;
    const H = c.height;
    const x0 = -245;
    const z0 = -110;
    const sx = W / 490;
    const sz = H / 300;
    const X = (x: number) => (x - x0) * sx;
    const Z = (z: number) => (z - z0) * sz;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#1f3b1f";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#1e3a5f";
    g.fillRect(0, 0, W, Z(-84));
    g.fillStyle = "#6b7280";
    for (const r of ROADS) g.fillRect(X(r.x), Z(r.z), Math.max(2, r.w * sx), Math.max(2, r.d * sz));
    for (const p of PLACES) {
      g.fillStyle = SITES[p.id] ? "#fbbf24" : "#9ca3af";
      g.fillRect(X(p.x), Z(p.z), p.w * sx, p.d * sz);
    }
    for (const p of PLOTS) {
      const info = this.snap?.plots[p.id];
      g.fillStyle = info?.owner === this.meInfo?.id ? "#f59e0b" : info?.owner ? "#e5e7eb" : info?.salePrice != null || !info?.owner ? "#166534" : "#e5e7eb";
      g.fillRect(X(p.x) + 1, Z(p.z) + 1, p.w * sx - 2, p.d * sz - 2);
    }
    g.fillStyle = "#38bdf8";
    for (const o of this.presence?.others.values() ?? []) {
      g.beginPath();
      g.arc(X(o.x), Z(o.z), 4, 0, Math.PI * 2);
      g.fill();
    }
    if (this.marker) {
      g.strokeStyle = "#f59e0b";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(X(this.marker.x), Z(this.marker.z), 7, 0, Math.PI * 2);
      g.stroke();
    }
    // You: an arrow the way you face.
    g.save();
    g.translate(X(this.me.x), Z(this.me.z));
    g.rotate(-this.me.heading + Math.PI);
    g.fillStyle = "#facc15";
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 7);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.restore();
  }

  private findPrompt() {
    this.prompt = "";
    this.act = null;
    if (this.building || this.panel) return;
    const me = this.me;
    for (const p of PLACES)
      if (Math.hypot(p.door.x - me.x, p.door.z - me.z) < 3) {
        const site = SITES[p.id];
        this.prompt = `E · ${site ? site.name : `${p.name} (closed)`}`;
        this.act = () => this.enterSite(p);
        return;
      }
    for (const p of PLOTS) {
      const l = toLocal(p, me.x, me.z);
      if (l.x < 0 || l.x > PLOT_W || l.z < 0 || l.z > PLOT_D + 1.5) continue;
      const info = this.snap?.plots[p.id];
      if (!info) return;
      const what = !info.owner ? `For sale · ${cash(info.price)}` : info.owner === this.meInfo?.id ? "Your lot" : info.shop ? info.shop.name : info.salePrice != null ? `For sale · ${cash(info.salePrice)}` : `${info.ownerName}'s lot`;
      this.prompt = `E · ${plotName(p.id)} · ${what}`;
      this.act = () => this.lotPanel(p.id);
      return;
    }
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.mode !== "town" || !this.view) return;
    this.res.tick(dt, now, (k) => this.view?.setResolution(k));
    // Everyone shares one clock: a full day every real hour (noon in tests).
    const minutes = this.test ? 720 : ((Date.now() / 60_000) * 24) % 1440;
    const lot = this.building ? this.buildPlot : this.ownLotHere();
    const people = [...(this.presence?.others.values() ?? [])].map((o) => ({ id: o.id, name: o.name, x: o.x, z: o.z, heading: o.heading, speed: o.speed, pose: o.pose, look: lookOf(o.look, hash(o.id)) }));
    this.view.syncPeople(people, dt);
    // Lot signs for the town's empty lots nearby, so you can see what's for sale.
    if (this.snap)
      for (const p of PLOTS) {
        const info = this.snap.plots[p.id];
        if (info.owner) continue;
        const near = Math.hypot(p.x + PLOT_W / 2 - this.me.x, p.z + PLOT_D / 2 - this.me.z) < 40;
        this.view.setPlotSign(p, near ? `Lot ${cash(info.price)}` : null, "#e5e7eb");
      }
    this.view.render(
      dt,
      {
        mode: this.building ? "build" : "walk",
        minutes,
        me: { ...this.me, act: 0, visible: true },
        car: null,
        open: lot >= 0 ? lot : null,
        marker: this.marker,
        use: null,
      },
      this.building ? PLOTS[this.buildPlot] : null,
    );
    this.refreshHud();
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 0.25;
      this.drawMap();
    }
    if (this.meInfo) this.emitter.progress(Math.round(netWorth(this.meInfo, this.snap)), now, 1000);
  }

  // ---------------------------------------------------------------- input

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== "town" || !this.loop.isRunning) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "KeyE") this.act?.();
    if (e.code === "KeyB") this.setBuilding(!this.building);
    if (e.code === "KeyM") this.phone(this.phoneTab);
    if (e.code === "KeyR" && this.building) this.rot = (this.rot + 1) % 4;
    const em = EMOTES.find((x) => x.key === e.code);
    if (em) this.doEmote(em.pose);
    if (e.code === "Enter" || e.code === "KeyT") {
      e.preventDefault();
      this.keys.clear();
      this.focusChat();
    }
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
    if (this.mode !== "town" || !this.view || e.target !== this.view.canvas) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
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
    if (this.mode !== "town" || !this.view) return;
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
    if (this.mode !== "town" || !this.view) return;
    e.preventDefault();
    if (this.building) this.view.buildDist = Math.max(10, Math.min(70, this.view.buildDist * Math.exp(e.deltaY * 0.001)));
    else this.view.dist = Math.max(3, Math.min(16, this.view.dist * Math.exp(e.deltaY * 0.001)));
  };

  // ---------------------------------------------------------------- tests

  private hooks() {
    (window as unknown as Record<string, unknown>).__town = {
      state: () => ({ mode: this.mode, me: this.me, info: this.meInfo, prompt: this.prompt, building: this.building, others: this.presence?.others.size ?? 0, online: this.backend?.online ?? null }),
      snap: () => this.snap,
      goTo: (x: number, z: number) => Object.assign(this.me, { x, z }),
      door: (id: string) => placeById(id)?.door,
      lot: (id: number) => spawnFor(id),
      lotCentre: (id: number) => toWorld(PLOTS[id], PLOT_W / 2, PLOT_D - 3),
      act: () => this.act?.(),
      refresh: () => this.refresh(),
      /** Practice town only: hand yourself goods or cash. */
      give: (item: ItemId | "cash", n: number) => {
        if (this.backend instanceof LocalBackend) this.backend.town.grant(this.backend.userId, item, n);
        return this.refresh();
      },
      build: (lx: number, lz: number) => {
        const p = PLOTS[this.buildPlot];
        const w = toWorld(p, lx, lz);
        this.buildClick(w.x, w.z);
        return this.saving;
      },
      setTool: (t: Tool) => {
        this.tool = t;
        this.wallStart = null;
        this.renderBuildPanel();
      },
      builds: (id: number) => this.builds.get(id),
      prefab: () => [...this.prefab],
    };
  }
}

const factory: GameFactory = () => new HometownGame();
export default factory;
