import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import { createRng, type Rng } from "../engine/rng";
import type { Pose } from "../code-3/people3d";
import type { Detail } from "../sports-kit/look";
import { BTN, button, el, hero, howTo, primaryButton, ResolutionGovernor } from "../sports-kit/ui";
import { ubusinessTier } from "@/lib/season-client";
import {
  accessPoint,
  assign,
  buyFixture,
  buyLicence,
  canPlace,
  capacity,
  CATEGORIES,
  CATEGORY_IDS,
  clock,
  CLOSE,
  EDITIONS,
  endDay,
  expand,
  FACING,
  FIXTURE_IDS,
  FIXTURES,
  fire,
  footfall,
  hire,
  levelOf,
  LEVELS,
  loadStore,
  MARKETING,
  money,
  moveFixture,
  newStore,
  NOTES,
  OPEN,
  order,
  pick,
  priceOf,
  PRODUCT_IDS,
  PRODUCTS,
  rename,
  restock,
  ringUp,
  runCampaign,
  SAVE_KEY,
  score,
  sellFixture,
  setPrice,
  shoppingList,
  SIZES,
  sizeOf,
  STAFF,
  stockroomOf,
  storeValue,
  tender,
  walkGrid,
  walkPath,
  willBuy,
  leaveMood,
  advance,
  doorOf,
  type Campaign,
  type DayReport,
  type Fixture,
  type FixtureKind,
  type ProductId,
  type StaffRole,
  type Store,
  type Tier,
} from "./logic";
import { StoreView, type Person } from "./render";

/**
 * UBusiness: the game around the rules. Shoppers walk in off the street, find
 * what's on their list, judge your prices, queue at a till and pay; you (or
 * your cashiers) scan and take card or count out change. Between customers you
 * order stock, fill shelves, set prices, build, hire and grow. Each evening
 * the books close and a new day starts.
 */

type Stage = "enter" | "walk" | "browse" | "toQueue" | "queue" | "scan" | "pay" | "leave";

interface Shopper {
  id: number;
  seed: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  pose: Pose;
  path: { x: number; z: number }[];
  list: ProductId[];
  basket: { product: ProductId; price: number }[];
  stage: Stage;
  /** What they're walking to: a shelf slot or a till. */
  goal?: { fixture: number; slot?: number; product?: ProductId };
  timer: number;
  patience: number;
  mood: number;
  till?: number;
  card: boolean;
  /** At the till: how many items have gone through the scanner. */
  scanned: number;
  self?: boolean;
  bubble?: string;
  /** Cash handed over at the till. */
  paid?: number;
}

interface Prefs {
  gfx?: Detail;
  speed?: number;
}

const PREFS = "zx-ubusiness-prefs";
const TEAL = "#0f766e";
const AMBER = "#f59e0b";
const PANEL = "pointer-events-auto absolute inset-x-2 bottom-16 top-14 z-20 mx-auto flex max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/92 text-white shadow-2xl backdrop-blur";

class UBusinessGame implements GameModule {
  readonly slug = "ubusiness";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private view: StoreView | null = null;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private res = new ResolutionGovernor();
  private prefs: Prefs = {};
  private coarse = false;
  private tier: Tier | null = null;
  private mode: "menu" | "store" = "menu";
  private s!: Store;
  private rng: Rng = createRng(7);
  private shoppers: Shopper[] = [];
  private nextShopper = 1;
  private spawnAcc = 0;
  private grid = { key: "", g: null as ReturnType<typeof walkGrid> | null };
  private speed = 1;
  private paused = false;
  private open = false;
  private lastFrame = 0;
  private saveTimer = 0;
  private report: DayReport | null = null;
  private building: { kind: FixtureKind; rot: number; move?: number } | null = null;
  private cursor: { x: number; z: number } | null = null;
  private selected: number | null = null;
  private test = false;

  // DOM.
  private hud: HTMLDivElement | null = null;
  private refs: Record<string, HTMLElement> = {};
  private panel: HTMLDivElement | null = null;
  private panelRender: (() => void) | null = null;
  private toastEl: HTMLDivElement | null = null;
  private toastTimer = 0;
  private changeGiven: number[] = [];

  // Input.
  private keys = new Set<string>();
  private drag: { id: number; x: number; y: number; moved: number; button: number } | null = null;
  private pinch = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    try {
      this.prefs = (JSON.parse(localStorage.getItem(PREFS) ?? "null") as Prefs | null) ?? {};
    } catch {
      this.prefs = {};
    }
    this.test = new URLSearchParams(window.location.search).has("ubiz");
    this.speed = this.prefs.speed ?? 1;
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
    this.hooks();
  }

  start() {
    this.loop.pause();
    void this.showMenu();
  }

  pause() {
    this.loop.pause();
    this.clearInput();
    this.save();
  }

  resume() {
    if (this.mode !== "store") return;
    this.lastFrame = performance.now();
    this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    this.save();
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
    delete (window as unknown as Record<string, unknown>).__ubiz;
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
    if (!this.tier || !this.s) return;
    try {
      localStorage.setItem(SAVE_KEY(this.tier), JSON.stringify(this.s));
    } catch {
      // Storage full or blocked: the day still plays.
    }
  }

  // ------------------------------------------------------------------ menu

  private async showMenu(note?: string) {
    this.mode = "menu";
    this.menu.hidden = false;
    this.menu.replaceChildren(el("div", "m-auto text-center text-lg font-bold text-white/80", "Checking your edition…"));
    let tier: Tier | null = null;
    try {
      tier = await ubusinessTier();
    } catch {
      try {
        const t = sessionStorage.getItem("zx-ubusiness-tier");
        tier = t === "ultimate" || t === "lite" ? t : null;
      } catch {
        tier = null;
      }
    }
    if (this.mode !== "menu") return;
    this.tier = tier;
    if (!tier) {
      this.menu.replaceChildren(
        el(
          "div",
          "m-auto flex max-w-md flex-col items-center gap-3 text-center",
          el("p", "font-display text-3xl font-black uppercase", "UBusiness"),
          el("p", "text-white/70", "Get Lite (5 coins) or Ultimate (30 coins, free with the battle pass) on the game page to open your store."),
        ),
      );
      return;
    }
    const ed = EDITIONS[tier];
    let saved: Store | null = null;
    try {
      saved = loadStore(localStorage.getItem(SAVE_KEY(tier)), tier);
    } catch {
      saved = null;
    }
    const name = el("input", "w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-white") as HTMLInputElement;
    name.placeholder = "Name your store";
    name.maxLength = 24;
    name.value = "Corner Store";
    name.setAttribute("data-testid", "ub-name");
    const go = (store: Store) => void this.openStore(store);
    const box = el(
      "div",
      "m-auto flex w-full max-w-3xl flex-col gap-4",
      hero(`${ed.name} · your own store`, "UBusiness", "Stock the shelves, set the prices, work the till, hire a team and grow a corner shop into a megastore.", "linear-gradient(135deg,#0f766e,#0f172a 55%,#b45309)"),
    );
    if (note) box.append(el("p", "rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200", note));
    const gfx = el("div", "flex items-center gap-1.5 text-xs", el("span", "w-16 text-white/60", "Graphics"));
    for (const g of ["low", "high", "ultra"] as Detail[]) {
      const b = button(g, `rounded-full border-2 px-3 py-1 font-bold capitalize ${(this.prefs.gfx ?? (this.coarse ? "low" : "high")) === g ? "border-amber-400" : "border-white/20"}`, () => {
        this.prefs.gfx = g;
        this.savePrefs();
        void this.showMenu();
      });
      gfx.append(b);
    }
    const play = el("div", "flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4");
    if (saved) {
      const cont = primaryButton(`Continue · ${saved.name} · Day ${saved.day}`, TEAL, () => go(saved!));
      cont.setAttribute("data-testid", "ub-continue");
      play.append(el("p", "text-sm text-white/70", `${money(saved.cash)} in the bank · ${SIZES[saved.size].name} · level ${levelOf(saved.xp)}`), cont);
    }
    const fresh = button(saved ? "Start a new store (replaces your save)" : "Open your first store", `${saved ? BTN : "rounded-md px-6 py-3 font-display text-base font-black uppercase tracking-[0.2em] text-white"} w-full`, () => {
      const s = newStore(tier!, name.value.trim() || "Corner Store", Math.floor(Math.random() * 1e9));
      go(s);
    });
    if (!saved) fresh.style.background = TEAL;
    fresh.setAttribute("data-testid", "ub-new");
    play.append(el("label", "text-xs text-white/60", "Store name", name), fresh, gfx);
    box.append(
      el(
        "div",
        "grid gap-4 md:grid-cols-2",
        play,
        el(
          "div",
          "flex flex-col gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 text-sm",
          el("p", "font-display font-black uppercase tracking-wide text-amber-300", ed.name),
          ...[
            `${ed.categories.length} departments: ${ed.categories.map((c) => CATEGORIES[c].name).join(", ")}`,
            `Grow to a ${SIZES[ed.sizes - 1].name}`,
            `${ed.staff === 1 ? "One member" : `Up to ${ed.staff}`} of staff`,
            ed.marketing ? "Marketing campaigns, express delivery, self-checkouts" : "Upgrade to Ultimate for every department, a megastore and a full team",
            ed.photoMode ? "Photo mode and 3× speed" : "",
          ]
            .filter(Boolean)
            .map((t) => el("p", "text-white/75", `• ${t}`)),
        ),
      ),
      howTo([
        ["Stock", "Order boxes from the wholesaler on 📦 Stock. They arrive in the stockroom; tap a shelf to choose what it sells and fill it."],
        ["Price", "Shoppers judge every price against what it usually costs. Charge too much and they walk away; a store they like can charge a little more."],
        ["Till", "When someone's waiting at your till, tap it (or press Space) to scan each item, then take the card or count out the change."],
        ["Grow", "Profit earns XP. New levels unlock departments (📜 Licences) and fixtures; bigger premises bring more shoppers."],
        ["Team", "Cashiers run a checkout for you; stockers keep the shelves full from the stockroom. Wages come out each evening."],
        ["Books", "At closing time rent, wages and power are paid. Bank your score from 📊 Books whenever you like."],
      ]),
    );
    this.menu.replaceChildren(box);
  }

  // ---------------------------------------------------------------- store

  private async openStore(store: Store) {
    this.s = store;
    this.rng = createRng(store.seed + store.day * 101);
    this.shoppers = [];
    this.report = null;
    this.open = false;
    this.paused = false;
    if (!this.view) {
      try {
        this.view = new StoreView(this.host, this.prefs.gfx ?? (this.coarse ? "low" : "high"));
      } catch {
        return this.showMenu("3D graphics aren't available on this device (WebGL is off).");
      }
      this.view.canvas.setAttribute("data-testid", "ub-canvas");
    }
    this.mode = "store";
    this.menu.hidden = true;
    this.buildHud();
    this.save();
    this.lastFrame = performance.now();
    this.loop.start();
    this.toast(`Welcome to ${this.s.name}. Get ready, then open the doors.`);
  }

  private walk() {
    const key = `${this.s.size}|${this.s.fixtures.map((f) => `${f.id},${f.x},${f.z},${f.rot}`).join(";")}`;
    if (this.grid.key !== key) this.grid = { key, g: walkGrid(this.s) };
    return this.grid.g!;
  }

  private route(from: { x: number; z: number }, to: { x: number; z: number }) {
    return walkPath(this.walk(), from, to);
  }

  /** Where the Nth person waits in a till's queue. */
  private queueSpot(f: Fixture, k: number) {
    const a = accessPoint(f);
    const [dx, dz] = FACING[f.rot % 4];
    // Line up along the counter, away from the wall it's against.
    let px: number = -dz;
    let pz: number = dx;
    if (f.x + px * 3 < 1 || f.x + px * 3 > sizeOf(this.s).w - 1 || f.z + pz * 3 < 1 || f.z + pz * 3 > sizeOf(this.s).d - 1) {
      px = -px;
      pz = -pz;
    }
    return { x: a.x + px * k * 0.75, z: a.z + pz * k * 0.75 };
  }

  private playerTill() {
    return this.s.fixtures.find((f) => f.kind === "checkout" && !this.s.staff.some((st) => st.post === f.id)) ?? null;
  }

  private queueAt(id: number) {
    return this.shoppers.filter((c) => c.till === id && (c.stage === "toQueue" || c.stage === "queue" || c.stage === "scan" || c.stage === "pay"));
  }

  /** Someone new walks in from the street with a list. */
  private spawn() {
    const door = doorOf(this.s);
    const seed = Math.floor(this.rng.next() * 1e6);
    const list = shoppingList(this.s, this.rng);
    if (!list.length) return;
    const c: Shopper = {
      id: this.nextShopper++,
      seed,
      x: door.x + (this.rng.next() - 0.5) * 6,
      z: -3,
      heading: 0,
      speed: 0,
      pose: "walk",
      path: [{ x: door.x, z: -0.6 }, { x: door.x, z: 1.2 }],
      list,
      basket: [],
      stage: "enter",
      timer: 0,
      patience: 25 + this.rng.next() * 20,
      mood: 0.75,
      card: this.rng.next() < 0.62,
      scanned: 0,
    };
    this.shoppers.push(c);
  }

  /** Walk a shopper along their path; true when they've arrived. */
  private stepWalk(c: Shopper, dt: number) {
    const p = c.path[0];
    if (!p) {
      c.speed = 0;
      return true;
    }
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    const v = 1.25 * dt;
    if (d <= v) {
      c.x = p.x;
      c.z = p.z;
      c.path.shift();
      return c.path.length === 0;
    }
    c.x += (dx / d) * v;
    c.z += (dz / d) * v;
    c.heading = Math.atan2(dx, dz);
    c.speed = 1.25;
    c.pose = "walk";
    return false;
  }

  /** The next thing on their list: walk to a shelf that has it, or note it's missing. */
  private nextItem(c: Shopper) {
    while (c.list.length) {
      const want = c.list.shift()!;
      const where: { f: Fixture; slot: number }[] = [];
      for (const f of this.s.fixtures) f.slots.forEach((sl, i) => sl.product === want && sl.qty > 0 && where.push({ f, slot: i }));
      if (!where.length) {
        c.mood -= this.s.fixtures.some((f) => f.slots.some((sl) => sl.product === want)) ? 0.16 : 0.08;
        c.bubble = `No ${PRODUCTS[want].name.split(" ")[0].toLowerCase()}?`;
        continue;
      }
      const spot = where[Math.floor(this.rng.next() * where.length)];
      c.goal = { fixture: spot.f.id, slot: spot.slot, product: want };
      c.path = this.route(c, accessPoint(spot.f));
      c.stage = "walk";
      return;
    }
    // Done shopping: to a till, or out if they've nothing.
    if (!c.basket.length) return this.leave(c);
    const selfs = this.s.fixtures.filter((f) => f.kind === "selfCheckout");
    const staffed = this.s.fixtures.filter((f) => f.kind === "checkout" && this.s.staff.some((st) => st.post === f.id));
    const mine = this.playerTill();
    const tills = [...staffed, ...(mine ? [mine] : [])];
    let till: Fixture | undefined;
    if (selfs.length && c.basket.length <= 6 && this.rng.next() < 0.55) {
      till = selfs.sort((a, b) => this.queueAt(a.id).length - this.queueAt(b.id).length)[0];
      c.self = true;
    } else till = tills.sort((a, b) => this.queueAt(a.id).length - this.queueAt(b.id).length)[0];
    if (!till) return this.leave(c);
    c.till = till.id;
    c.stage = "toQueue";
    c.path = this.route(c, this.queueSpot(till, this.queueAt(till.id).length - 1));
  }

  private leave(c: Shopper, unhappy = false) {
    if (unhappy) c.mood -= 0.3;
    // Anything left in the basket goes back to the stockroom.
    for (const b of c.basket) this.s.storage[b.product] = (this.s.storage[b.product] ?? 0) + 1;
    if (unhappy) c.basket = [];
    leaveMood(this.s, Math.max(0, Math.min(1, c.mood)));
    c.stage = "leave";
    c.till = undefined;
    const door = doorOf(this.s);
    c.path = [...this.route(c, { x: door.x, z: 1 }), { x: door.x, z: -1 }, { x: door.x + (this.rng.next() < 0.5 ? -8 : 8), z: -3.5 }];
  }

  /** The sale goes through: money in, mood up, off they go. */
  private complete(c: Shopper, tillError = 0) {
    const basket = c.basket;
    ringUp(this.s, basket, tillError);
    c.basket = [];
    c.mood += 0.1;
    this.leaveDone(c);
  }

  private leaveDone(c: Shopper) {
    leaveMood(this.s, Math.max(0, Math.min(1, c.mood)));
    c.stage = "leave";
    c.till = undefined;
    const door = doorOf(this.s);
    c.path = [...this.route(c, { x: door.x, z: 1 }), { x: door.x, z: -1 }, { x: door.x + (this.rng.next() < 0.5 ? -8 : 8), z: -3.5 }];
  }

  private updateShoppers(dt: number) {
    for (const c of this.shoppers) {
      c.timer -= dt;
      switch (c.stage) {
        case "enter":
          if (this.stepWalk(c, dt)) this.nextItem(c);
          break;
        case "walk":
          if (this.stepWalk(c, dt)) {
            c.stage = "browse";
            c.timer = 1.2 + this.rng.next();
            const f = this.s.fixtures.find((o) => o.id === c.goal?.fixture);
            if (f) c.heading = Math.atan2(f.x - c.x, f.z - c.z);
          }
          break;
        case "browse":
          c.pose = "search";
          c.speed = 0;
          if (c.timer <= 0 && !c.goal?.product) {
            c.goal = undefined;
            this.nextItem(c);
          } else if (c.timer <= 0 && c.goal?.product) {
            const id = c.goal.product;
            const f = this.s.fixtures.find((o) => o.id === c.goal!.fixture);
            const sl = f?.slots[c.goal.slot ?? 0];
            if (!f || !sl || sl.product !== id || sl.qty <= 0) {
              c.mood -= 0.15;
              c.bubble = "Sold out!";
            } else if (!willBuy(this.s, id, this.rng)) {
              c.mood -= 0.12;
              c.bubble = "Too pricey";
            } else if (pick(this.s, f.id, c.goal.slot ?? 0)) {
              c.basket.push({ product: id, price: priceOf(this.s, id) });
              if (this.rng.next() < 0.18 && c.basket.length < 8) c.list.push(id);
            }
            c.goal = undefined;
            this.nextItem(c);
          }
          break;
        case "toQueue": {
          const till = this.s.fixtures.find((f) => f.id === c.till);
          if (!till) {
            this.nextItem(c);
            break;
          }
          if (this.stepWalk(c, dt)) {
            c.stage = "queue";
            c.heading = Math.atan2(till.x - c.x, till.z - c.z);
          }
          break;
        }
        case "queue": {
          c.pose = "stand";
          c.speed = 0;
          const till = this.s.fixtures.find((f) => f.id === c.till);
          if (!till) {
            this.nextItem(c);
            break;
          }
          const q = this.queueAt(till.id).filter((o) => o.stage !== "toQueue");
          const k = q.indexOf(c);
          // Shuffle forward as the line moves.
          const spot = this.queueSpot(till, Math.max(0, k));
          if (Math.hypot(spot.x - c.x, spot.z - c.z) > 0.15) {
            c.path = [spot];
            this.stepWalk(c, dt);
          }
          c.patience -= dt / 60;
          if (c.patience <= 0) {
            c.bubble = "I've waited long enough";
            this.leave(c, true);
            break;
          }
          if (k === 0) {
            const staffed = this.s.staff.some((st) => st.post === till.id);
            if (staffed || till.kind === "selfCheckout") {
              c.stage = "scan";
              c.timer = c.basket.length * (till.kind === "selfCheckout" ? 0.9 : 0.5) + 1;
            }
            // The player's till waits for the player.
          }
          break;
        }
        case "scan":
          c.pose = "stand";
          if (c.timer <= 0) this.complete(c);
          break;
        case "leave":
          if (this.stepWalk(c, dt)) c.stage = "leave";
          break;
      }
      if (c.bubble && this.rng.next() < dt * 0.25) c.bubble = undefined;
    }
    this.shoppers = this.shoppers.filter((c) => !(c.stage === "leave" && c.path.length === 0));
  }

  // ------------------------------------------------------------------ loop

  private update(dt: number) {
    if (this.mode !== "store" || !this.s) return;
    if (this.paused || this.report || this.panelBlocks()) return;
    const gdt = dt * this.speed;
    const minutes = gdt * 2;
    if (this.open) {
      const arrived = advance(this.s, minutes);
      if (arrived.length) this.toast(`Delivery: ${arrived.map((o) => `${o.units} × ${PRODUCTS[o.product].name}`).join(", ")}`);
      this.spawnAcc += (footfall(this.s) / 60) * minutes;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.shoppers.length < capacity(this.s)) this.spawn();
      }
      if (this.s.minute >= CLOSE) {
        this.open = false;
        this.toast("Closing time: the doors are shut. Serve the last shoppers.");
        for (const c of this.shoppers) if (c.stage === "enter" || c.stage === "walk" || c.stage === "browse") c.list = [];
      }
    } else if (this.s.minute >= CLOSE && !this.shoppers.some((c) => c.stage !== "leave")) {
      this.closeDay();
    }
    this.updateShoppers(gdt);
    // The camera moves with WASD.
    if (this.view) {
      const k = (...c: string[]) => c.some((x) => this.keys.has(x));
      const mx = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
      const mz = (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0);
      // Camera-relative: forward is away from the camera, right is screen-right.
      const y = this.view.yaw;
      const [fx, fz] = [Math.sin(y), Math.cos(y)];
      const [rx, rz] = [-fz, fx];
      this.view.target.x += (fx * mz + rx * mx) * dt * 8;
      this.view.target.z += (fz * mz + rz * mx) * dt * 8;
    }
    this.saveTimer += dt;
    if (this.saveTimer > 10) {
      this.saveTimer = 0;
      this.save();
    }
    this.emitter.progress(score(this.s), performance.now(), 1000);
  }

  /** Panels that stop the clock (everything but the till, so the queue keeps moving). */
  private panelBlocks() {
    return !!this.panel && this.panel.dataset.kind !== "till" && this.panel.dataset.kind !== "fixture";
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.mode !== "store" || !this.view || !this.s) return;
    this.res.tick(dt, now, (k) => this.view?.pipe.setResolution(k));
    const people: Person[] = this.shoppers.map((c) => ({ id: `c${c.id}`, x: c.x, z: c.z, heading: c.heading, speed: c.speed, pose: c.pose, basket: c.basket.length > 0 || c.stage === "walk" || c.stage === "browse", seed: c.seed }));
    // The team: cashiers behind their tills, stockers about the floor, and you at your own till.
    this.s.staff.forEach((st, i) => {
      const post = this.s.fixtures.find((f) => f.id === st.post);
      if (st.role === "cashier" && post) {
        const a = accessPoint(post, true);
        people.push({ id: `s${st.id}`, x: a.x, z: a.z, heading: Math.atan2(post.x - a.x, post.z - a.z), speed: 0, pose: "stand", staff: true, seed: st.id });
      } else {
        const t = performance.now() / 1000 + i * 9;
        const f = this.s.fixtures[Math.floor(t / 12) % Math.max(1, this.s.fixtures.length)];
        const a = f ? accessPoint(f) : stockroomOf(this.s);
        people.push({ id: `s${st.id}`, x: a.x, z: a.z, heading: 0, speed: 0, pose: "search", staff: true, seed: st.id });
      }
    });
    const mine = this.playerTill();
    if (mine) {
      const a = accessPoint(mine, true);
      people.push({ id: "you", x: a.x, z: a.z, heading: Math.atan2(mine.x - a.x, mine.z - a.z), speed: 0, pose: this.panel?.dataset.kind === "till" ? "point" : "stand", staff: true, seed: 3 });
      const q = this.queueAt(mine.id);
      const c = q.find((o) => o.stage === "queue" && q.indexOf(o) === 0);
      this.view.setScreen(mine.id, c ? [`ITEMS ${c.scanned}/${c.basket.length}`, money(c.basket.slice(0, c.scanned).reduce((a, b) => a + b.price, 0))] : [this.s.name.toUpperCase().slice(0, 18), "NEXT PLEASE"]);
    }
    // Build mode ghost.
    if (this.building && this.cursor) {
      const x = Math.round(this.cursor.x * 4) / 4;
      const z = Math.round(this.cursor.z * 4) / 4;
      const ok = this.building.move ? canPlace(this.s, { kind: this.building.kind, x, z, rot: this.building.rot }, this.building.move).ok : canPlace(this.s, { kind: this.building.kind, x, z, rot: this.building.rot }).ok;
      this.view.setGhost(this.building.kind, { x, z, rot: this.building.rot, ok }, this.s);
    }
    this.view.frame(dt, this.s, people);
    this.refreshHud();
  }

  // ---------------------------------------------------------------- the day

  private openDoors() {
    if (this.open || this.report) return;
    if (this.s.minute >= CLOSE) return;
    this.s.minute = Math.max(this.s.minute, OPEN);
    this.open = true;
    this.toast("The doors are open!");
  }

  private closeDay() {
    if (this.report) return;
    this.shoppers = [];
    this.report = endDay(this.s);
    this.rng = createRng(this.s.seed + this.s.day * 101);
    this.save();
    this.showReport(this.report);
  }

  private showReport(r: DayReport) {
    this.openPanel(`Day ${r.day} · the books`, "report", (box) => {
      const row = (k: string, v: string, cls = "") => el("div", `flex justify-between border-b border-white/10 py-1 ${cls}`, el("span", "text-white/70", k), el("span", "font-bold tabular-nums", v));
      box.append(
        el(
          "div",
          "grid gap-1 text-sm",
          row("Shoppers served", String(r.customers)),
          row("Left unhappy", String(r.unhappy), r.unhappy ? "text-red-300" : ""),
          row("Items sold", String(r.items)),
          row("Takings", money(r.revenue)),
          row("Cost of goods", `−${money(r.cogs)}`),
          row("Rent", `−${money(r.rent)}`),
          row("Wages", `−${money(r.wages)}`),
          row("Power", `−${money(r.power)}`),
          ...(r.tillError ? [row("Till errors", `${r.tillError > 0 ? "−" : "+"}${money(Math.abs(r.tillError))}`, "text-amber-300")] : []),
          row("Profit", money(r.profit), r.profit >= 0 ? "text-emerald-300 text-base" : "text-red-300 text-base"),
          row("XP", `+${r.xp}`),
          row("Reputation", `${"★".repeat(Math.round(r.reputation))}${"☆".repeat(5 - Math.round(r.reputation))}`),
        ),
      );
      const best = Object.entries(r.sold).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
      if (best) box.append(el("p", "mt-2 text-xs text-white/60", `Best seller: ${PRODUCTS[best[0] as ProductId].name} (${best[1]})`));
      const next = primaryButton(`Open day ${this.s.day}`, TEAL, () => {
        this.report = null;
        this.closePanel();
        this.toast("A new day. Restock, then open the doors.");
      });
      next.setAttribute("data-testid", "ub-next-day");
      box.append(next);
    });
  }

  // ------------------------------------------------------------------- HUD

  private buildHud() {
    this.hud?.remove();
    const r: Record<string, HTMLElement> = {};
    r.name = el("span", "font-display text-sm font-black uppercase tracking-wide");
    r.time = el("span", "tabular-nums text-xs text-white/80");
    r.cash = el("span", "font-display text-lg font-black text-emerald-300 tabular-nums");
    r.cash.setAttribute("data-testid", "ub-cash");
    r.rep = el("span", "text-xs text-amber-300");
    r.level = el("span", "text-[11px] text-white/70");
    r.xp = el("div", "h-1.5 rounded-full bg-amber-400");
    const top = el(
      "div",
      "pointer-events-auto absolute left-2 right-2 top-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-black/60 px-3 py-1.5 text-white backdrop-blur-sm",
      el("div", "flex flex-col", r.name, r.time),
      r.cash,
      el("div", "flex flex-col", r.rep, el("div", "flex items-center gap-1", r.level, el("div", "h-1.5 w-16 overflow-hidden rounded-full bg-white/15", r.xp))),
    );
    r.open = button("Open the doors", "rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white", () => this.openDoors());
    r.open.setAttribute("data-testid", "ub-open");
    const speeds = el("div", "ml-auto flex items-center gap-1");
    const pauseBtn = button("⏸", "rounded-full border border-white/20 px-2 py-0.5 text-xs font-bold", () => {
      this.paused = !this.paused;
    });
    pauseBtn.setAttribute("data-testid", "ub-pause");
    speeds.append(r.open, pauseBtn);
    for (const sp of EDITIONS[this.s.tier].speeds) {
      const b = button(`${sp}×`, "rounded-full border border-white/20 px-2 py-0.5 text-xs font-bold", () => {
        this.speed = sp;
        this.paused = false;
        this.prefs.speed = sp;
        this.savePrefs();
      });
      b.dataset.speed = String(sp);
      b.setAttribute("data-testid", `ub-speed-${sp}`);
      speeds.append(b);
    }
    top.append(speeds);
    r.speeds = speeds;
    // The till alert.
    r.till = button("", "pointer-events-auto absolute left-1/2 top-16 hidden -translate-x-1/2 animate-pulse rounded-full bg-amber-500 px-4 py-2 text-sm font-black text-white shadow-lg", () => this.tillPanel());
    r.till.setAttribute("data-testid", "ub-till-alert");
    const tools: [string, string, () => void, boolean?][] = [
      ["📦 Stock", "stock", () => this.stockPanel()],
      ["🏷 Prices", "prices", () => this.pricesPanel()],
      ["🛒 Till", "till", () => this.tillPanel()],
      ["🧑‍💼 Staff", "staff", () => this.staffPanel()],
      ["🏗 Build", "build", () => this.buildPanel()],
      ["📜 Licences", "licences", () => this.licencePanel()],
      ["📣 Marketing", "marketing", () => this.marketingPanel(), !EDITIONS[this.s.tier].marketing],
      ["🏢 Store", "store", () => this.storePanel()],
      ["📊 Books", "books", () => this.booksPanel()],
      ["📷 Photo", "photo", () => this.photoMode(), !EDITIONS[this.s.tier].photoMode],
    ];
    const bar = el("div", "pointer-events-auto absolute inset-x-2 bottom-2 flex gap-1.5 overflow-x-auto rounded-xl bg-black/60 p-1.5 backdrop-blur-sm");
    for (const [label, id, fn, locked] of tools) {
      const b = button(label, `shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-bold text-white ${locked ? "opacity-50" : "hover:border-amber-400"}`, () => (locked ? this.toast("That's an Ultimate feature.") : fn()));
      b.setAttribute("data-testid", `ub-tool-${id}`);
      if (locked) b.title = "UBusiness Ultimate";
      bar.append(b);
    }
    r.bar = bar;
    r.top = top;
    const toast = el("div", "pointer-events-none absolute left-1/2 top-28 z-30 max-w-[86%] -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-center text-sm font-bold text-white opacity-0 transition-opacity");
    toast.setAttribute("role", "status");
    toast.setAttribute("data-testid", "ub-toast");
    this.toastEl = toast;
    r.build = el("div", "pointer-events-auto absolute bottom-16 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-xs font-bold text-white");
    r.build.setAttribute("data-testid", "ub-build-bar");
    this.hud = el("div", "pointer-events-none absolute inset-0 z-10", top, r.till, r.build, bar, toast);
    this.refs = r;
    this.host.appendChild(this.hud);
  }

  private refreshHud() {
    const r = this.refs;
    const s = this.s;
    if (!r.cash) return;
    r.name.textContent = `${s.name} · ${SIZES[s.size].name}`;
    r.time.textContent = `Day ${s.day} · ${clock(s.minute)} · ${this.open ? "OPEN" : s.minute >= CLOSE ? "CLOSED" : "Not open yet"} · ${this.shoppers.length} in store`;
    r.cash.textContent = money(s.cash);
    r.rep.textContent = `${"★".repeat(Math.round(s.reputation))}${"☆".repeat(5 - Math.round(s.reputation))}`;
    const lv = levelOf(s.xp);
    r.level.textContent = `Level ${lv}`;
    const lo = LEVELS[lv - 1] ?? 0;
    const hi = LEVELS[lv] ?? lo + 1;
    r.xp.style.width = `${Math.min(100, ((s.xp - lo) / Math.max(1, hi - lo)) * 100)}%`;
    r.open.classList.toggle("hidden", this.open || s.minute >= CLOSE || !!this.report);
    for (const b of r.speeds.querySelectorAll<HTMLElement>("[data-speed]")) b.classList.toggle("bg-amber-500", !this.paused && Number(b.dataset.speed) === this.speed);
    const mine = this.playerTill();
    const waiting = mine ? this.queueAt(mine.id).filter((c) => c.stage === "queue").length : 0;
    r.till.classList.toggle("hidden", !waiting || this.panel?.dataset.kind === "till");
    r.till.textContent = `🛒 ${waiting} waiting at your till · tap or Space`;
    const hide = this.view?.photo;
    for (const k of ["top", "bar"]) r[k].classList.toggle("hidden", !!hide);
  }

  private toast(t: string) {
    if (!this.toastEl) return;
    this.toastEl.textContent = t;
    this.toastEl.style.opacity = "1";
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl && (this.toastEl.style.opacity = "0"), 3200);
  }

  private openPanel(title: string, kind: string, fill: (box: HTMLElement) => void) {
    this.closePanel();
    const box = el("div", "flex flex-col gap-2 overflow-y-auto p-3");
    const close = button("✕", "rounded-full border border-white/20 px-2.5 py-1 text-sm", () => this.closePanel());
    close.setAttribute("data-testid", "ub-close");
    if (kind === "report") close.classList.add("hidden");
    const p = el("div", PANEL, el("div", "flex items-center justify-between border-b border-white/10 px-3 py-2", el("p", "font-display text-sm font-black uppercase tracking-wide", title), close), box) as HTMLDivElement;
    p.dataset.kind = kind;
    p.setAttribute("data-testid", `ub-panel-${kind}`);
    this.panel = p;
    this.panelRender = () => {
      box.replaceChildren();
      fill(box);
    };
    this.panelRender();
    this.host.appendChild(p);
  }

  private closePanel() {
    if (this.panel?.dataset.kind === "report") return;
    this.panel?.remove();
    this.panel = null;
    this.panelRender = null;
    this.selected = null;
    this.view?.setHighlight(null);
  }

  private rerender() {
    this.panelRender?.();
  }

  private act(r: { ok: boolean; why?: string }, ok?: string) {
    if (!r.ok) this.toast((r as { why: string }).why);
    else if (ok) this.toast(ok);
    this.rerender();
    this.save();
    return r.ok;
  }

  // ---------------------------------------------------------------- panels

  private stockPanel() {
    this.openPanel("Wholesaler · order stock", "stock", (box) => {
      const ed = EDITIONS[this.s.tier];
      box.append(el("p", "text-xs text-white/60", `Boxes arrive in the stockroom ${this.open ? "in 30 minutes" : "right away (you're closed)"}.${ed.express ? " Express: 5 minutes, +10%." : ""} You have ${money(this.s.cash)}.`));
      for (const cat of this.s.licences) {
        box.append(el("p", "mt-1 text-xs font-black uppercase tracking-wider text-amber-300", `${CATEGORIES[cat].icon} ${CATEGORIES[cat].name}`));
        for (const id of PRODUCT_IDS.filter((p) => PRODUCTS[p].cat === cat)) {
          const p = PRODUCTS[id];
          const have = this.s.storage[id] ?? 0;
          const shelf = this.s.fixtures.reduce((a, f) => a + f.slots.reduce((b, sl) => b + (sl.product === id ? sl.qty : 0), 0), 0);
          const row = el(
            "div",
            "flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-sm",
            el("span", "h-6 w-6 shrink-0 rounded", ""),
            el("div", "min-w-0 flex-1", el("p", "truncate font-bold", p.name), el("p", "text-[11px] text-white/60", `${p.brand} · box of ${p.box} · ${money(p.cost)} each · sells ~${money(p.market)} · stockroom ${have} · shelves ${shelf}`)),
          );
          (row.firstChild as HTMLElement).style.background = `linear-gradient(135deg, ${p.color}, ${p.accent})`;
          const buy = button(`+1 box ${money(p.cost * p.box)}`, "rounded-lg bg-emerald-600 px-2 py-1 text-xs font-black", () => this.act(order(this.s, id, 1), `Ordered ${p.box} × ${p.name}`));
          buy.setAttribute("data-testid", `ub-order-${id}`);
          row.append(buy);
          if (ed.express) row.append(button("⚡", "rounded-lg border border-amber-400/60 px-2 py-1 text-xs", () => this.act(order(this.s, id, 1, true), "Express delivery on its way")));
          box.append(row);
        }
      }
    });
  }

  private pricesPanel() {
    this.openPanel("Prices", "prices", (box) => {
      box.append(el("p", "text-xs text-white/60", "Shoppers compare your price with the usual one. At 5★ they'll pay about 20% over; at 1★ barely more than usual."));
      for (const id of PRODUCT_IDS.filter((p) => this.s.licences.includes(PRODUCTS[p].cat))) {
        const p = PRODUCTS[id];
        const price = priceOf(this.s, id);
        const margin = Math.round(((price - p.cost) / price) * 100);
        const vs = Math.round((price / p.market - 1) * 100);
        const row = el(
          "div",
          "flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-sm",
          el("div", "min-w-0 flex-1", el("p", "truncate font-bold", p.name), el("p", `text-[11px] ${vs > 15 ? "text-red-300" : vs < -5 ? "text-sky-300" : "text-white/60"}`, `Cost ${money(p.cost)} · usual ${money(p.market)} · ${vs >= 0 ? "+" : ""}${vs}% · margin ${margin}%`)),
        );
        const adj = (k: number) => () => this.act(setPrice(this.s, id, Math.max(p.cost, Math.round((price * k) / 10) * 10 - 1)));
        const minus = button("−5%", "rounded border border-white/20 px-1.5 py-0.5 text-xs", adj(0.95));
        const plus = button("+5%", "rounded border border-white/20 px-1.5 py-0.5 text-xs", adj(1.05));
        plus.setAttribute("data-testid", `ub-price-up-${id}`);
        const tag = el("span", "w-16 text-right font-display font-black tabular-nums", money(price));
        tag.setAttribute("data-testid", `ub-price-${id}`);
        row.append(minus, tag, plus, button("Usual", "rounded border border-white/20 px-1.5 py-0.5 text-xs", () => this.act(setPrice(this.s, id, p.market))));
        box.append(row);
      }
    });
  }

  private fixturePanel(id: number) {
    const f = this.s.fixtures.find((o) => o.id === id);
    if (!f) return;
    if (f.kind === "checkout" && !this.s.staff.some((st) => st.post === f.id)) return this.tillPanel();
    this.selected = id;
    this.view?.setHighlight(f);
    const def = FIXTURES[f.kind];
    this.openPanel(def.name, "fixture", (box) => {
      const fx = this.s.fixtures.find((o) => o.id === id);
      if (!fx) return this.closePanel();
      if (def.slots) {
        const options = PRODUCT_IDS.filter((p) => PRODUCTS[p].fixture === fx.kind && this.s.licences.includes(PRODUCTS[p].cat));
        fx.slots.forEach((sl, i) => {
          const sel = el("select", "min-w-0 flex-1 rounded border border-white/20 bg-black/40 px-2 py-1 text-sm text-white") as HTMLSelectElement;
          sel.append(new Option("— empty —", ""));
          for (const p of options) sel.append(new Option(`${PRODUCTS[p].name} (${this.s.storage[p] ?? 0} in stockroom)`, p, false, p === sl.product));
          sel.setAttribute("data-testid", `ub-slot-${i}`);
          sel.onchange = () => {
            this.act(assign(this.s, fx.id, i, (sel.value || null) as ProductId | null));
            restock(this.s, fx.id);
            this.rerender();
          };
          const cap = sl.product ? PRODUCTS[sl.product].slot : 0;
          const bar = el("div", "h-1.5 w-full overflow-hidden rounded-full bg-white/10", el("div", `h-full ${sl.qty / Math.max(1, cap) < 0.25 ? "bg-red-400" : "bg-emerald-400"}`));
          ((bar.firstChild as HTMLElement).style.width = `${cap ? (sl.qty / cap) * 100 : 0}%`);
          box.append(el("div", "flex flex-col gap-1 rounded-lg bg-white/5 p-2", el("div", "flex items-center gap-2 text-sm", el("span", "w-14 text-xs text-white/60", f.kind === "shelf" || f.kind === "fridge" ? `Shelf ${4 - i}` : `Slot ${i + 1}`), sel, el("span", "w-12 text-right text-xs tabular-nums", sl.product ? `${sl.qty}/${cap}` : "")), bar));
        });
        const fill = button("Fill from the stockroom", `${BTN} w-full`, () => {
          const n = restock(this.s, fx.id);
          this.act({ ok: true }, n ? `Put out ${n} items` : "Nothing in the stockroom for these shelves. Order some on 📦 Stock.");
        });
        fill.setAttribute("data-testid", "ub-restock");
        box.append(fill);
      } else if (fx.kind === "checkout") {
        const who = this.s.staff.find((st) => st.post === fx.id);
        box.append(el("p", "text-sm text-white/70", who ? `${who.name} is on this till.` : "Your till."));
      } else box.append(el("p", "text-sm text-white/70", def.appeal ? `Makes the store a nicer place to shop (+${def.appeal} appeal).` : ""));
      box.append(
        el(
          "div",
          "mt-1 flex flex-wrap gap-2",
          button("↻ Move / rotate", `${BTN}`, () => {
            this.closePanel();
            this.startBuild(fx.kind, fx.id, fx.rot);
          }),
          button(`Sell (${money(Math.floor(def.price * 0.6))})`, "rounded-md border border-red-400/60 px-3 py-2 text-sm font-bold text-red-200", () => {
            if (this.act(sellFixture(this.s, fx.id), "Sold")) this.closePanel();
          }),
        ),
      );
    });
  }

  private tillPanel() {
    const till = this.playerTill();
    if (!till) return this.toast("Your cashiers have every till covered.");
    this.changeGiven = [];
    this.openPanel("Your till", "till", (box) => {
      const q = this.queueAt(till.id).filter((c) => c.stage === "queue");
      const c = q[0];
      if (!c || this.queueAt(till.id).filter((o) => o.stage !== "toQueue").indexOf(c) !== 0) {
        box.append(el("p", "py-6 text-center text-white/60", "Nobody's waiting. The till alert pops up when someone is."));
        return;
      }
      const total = c.basket.reduce((a, b) => a + b.price, 0);
      const list = el("div", "grid grid-cols-2 gap-1 sm:grid-cols-3");
      c.basket.forEach((b, i) => {
        const done = i < c.scanned;
        const item = button("", `flex items-center gap-2 rounded-lg border px-2 py-1 text-left text-xs ${done ? "border-emerald-400/50 bg-emerald-500/10 text-white/60" : "border-white/20 hover:border-amber-400"}`, () => {
          if (done || i !== c.scanned) return;
          c.scanned++;
          this.beep();
          this.rerender();
        });
        const sw = el("span", "h-5 w-5 shrink-0 rounded");
        sw.style.background = `linear-gradient(135deg, ${PRODUCTS[b.product].color}, ${PRODUCTS[b.product].accent})`;
        item.append(sw, el("span", "min-w-0 flex-1 truncate", PRODUCTS[b.product].name), el("span", "tabular-nums", done ? money(b.price) : "scan"));
        item.setAttribute("data-testid", `ub-item-${i}`);
        list.append(item);
      });
      const scanned = c.basket.slice(0, c.scanned).reduce((a, b) => a + b.price, 0);
      box.append(
        el("p", "text-xs text-white/60", `${q.length} in the queue · patience ${"●".repeat(Math.max(0, Math.ceil(c.patience / 9)))}`),
        list,
        el("div", "flex items-center justify-between rounded-lg bg-black/40 px-3 py-2", el("span", "text-sm text-white/70", "Total"), el("span", "font-display text-2xl font-black tabular-nums text-emerald-300", money(scanned))),
      );
      if (c.scanned < c.basket.length) {
        const all = button("Scan next (Space)", `${BTN} w-full`, () => {
          c.scanned++;
          this.beep();
          this.rerender();
        });
        all.setAttribute("data-testid", "ub-scan");
        box.append(all);
        return;
      }
      if (c.card) {
        box.append(el("p", "text-center text-sm", "💳 They tap their card."));
        const ok = primaryButton(`Take ${money(total)} by card`, TEAL, () => this.finishSale(c, 0));
        ok.setAttribute("data-testid", "ub-card");
        box.append(ok);
        return;
      }
      // Cash: count out the change.
      const paid = (c.paid ??= tender(total, this.rng));
      const due = paid - total;
      const given = this.changeGiven.reduce((a, b) => a + b, 0);
      box.append(el("p", "text-center text-sm", `💵 They hand you ${money(paid)}. Change due: `, el("b", "text-amber-300", money(due))));
      const drawer = el("div", "grid grid-cols-6 gap-1");
      for (const n of NOTES) {
        const b = button(n >= 100 ? `$${n / 100}` : `${n}¢`, `rounded-md border px-1 py-2 text-xs font-black ${n >= 500 ? "border-emerald-400/50 bg-emerald-900/40" : "border-amber-300/50 bg-amber-900/30"}`, () => {
          this.changeGiven.push(n);
          this.rerender();
        });
        b.setAttribute("data-testid", `ub-note-${n}`);
        drawer.append(b);
      }
      box.append(
        drawer,
        el("div", "flex items-center justify-between text-sm", el("span", "text-white/70", `Giving ${money(given)}`), button("Undo", "rounded border border-white/20 px-2 py-0.5 text-xs", () => (this.changeGiven.pop(), this.rerender()))),
      );
      const give = primaryButton("Give change", given === due ? TEAL : AMBER, () => this.finishSale(c, given - due));
      give.setAttribute("data-testid", "ub-give-change");
      box.append(give);
    });
  }

  private finishSale(c: Shopper, error: number) {
    if (error !== 0) {
      c.mood -= error < 0 ? 0.3 : 0;
      this.toast(error > 0 ? `Gave ${money(error)} too much change` : `Short-changed them by ${money(-error)}!`);
    } else this.toast("Thank you, come again!");
    this.complete(c, Math.max(0, error));
    this.changeGiven = [];
    // Straight on to the next one.
    window.setTimeout(() => this.panel?.dataset.kind === "till" && this.rerender(), 50);
  }

  private beep() {
    try {
      const ctx = (this as unknown as { ac?: AudioContext }).ac ?? ((this as unknown as { ac?: AudioContext }).ac = new AudioContext());
      if (!this.opts.settings.sound) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 1760;
      g.gain.value = 0.05 * this.opts.settings.volume;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.08);
    } catch {
      // No sound.
    }
  }

  private staffPanel() {
    this.openPanel("Staff", "staff", (box) => {
      const ed = EDITIONS[this.s.tier];
      box.append(el("p", "text-xs text-white/60", `${this.s.staff.length} of ${ed.staff} · wages are paid each evening.`));
      for (const st of this.s.staff) {
        const post = this.s.fixtures.find((f) => f.id === st.post);
        box.append(el("div", "flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-sm", el("span", "flex-1", `${st.name} · ${STAFF[st.role].name}${st.role === "cashier" ? (post ? "" : " (no free till)") : ""}`), el("span", "text-xs text-white/60", `${money(STAFF[st.role].wage)}/day`), button("Let go", "rounded border border-red-400/50 px-2 py-0.5 text-xs text-red-200", () => this.act(fire(this.s, st.id)))));
      }
      for (const role of Object.keys(STAFF) as StaffRole[]) {
        const b = button(`Hire a ${STAFF[role].name.toLowerCase()} · ${money(STAFF[role].wage)}/day · ${STAFF[role].does}`, `${BTN} w-full text-left`, () => this.act(hire(this.s, role), `Hired a ${STAFF[role].name.toLowerCase()}`));
        b.setAttribute("data-testid", `ub-hire-${role}`);
        box.append(b);
      }
    });
  }

  private buildPanel() {
    this.openPanel("Build", "build", (box) => {
      const lv = levelOf(this.s.xp);
      box.append(el("p", "text-xs text-white/60", "Pick something, then click the floor to place it. R rotates, Esc cancels. Selling refunds 60%."));
      for (const kind of FIXTURE_IDS) {
        const d = FIXTURES[kind];
        const lockedTier = !!d.ultimate && this.s.tier !== "ultimate";
        const lockedLevel = lv < d.level;
        const b = button("", `flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${lockedTier || lockedLevel ? "border-white/10 opacity-50" : "border-white/20 hover:border-amber-400"}`, () => {
          if (lockedTier) return this.toast("Ultimate edition only");
          if (lockedLevel) return this.toast(`Reach level ${d.level} first`);
          this.closePanel();
          this.startBuild(kind);
        });
        b.append(el("span", "font-bold", d.name), el("span", "text-xs text-white/70", lockedTier ? "Ultimate" : lockedLevel ? `Level ${d.level}` : `${money(d.price)}${d.power ? ` · ${money(d.power)}/day power` : ""}`));
        b.setAttribute("data-testid", `ub-build-${kind}`);
        box.append(b);
      }
    });
  }

  private startBuild(kind: FixtureKind, move?: number, rot = 0) {
    this.building = { kind, rot, move };
    const bar = this.refs.build;
    bar.classList.remove("hidden");
    bar.classList.add("flex");
    bar.replaceChildren(
      el("span", "", `${move ? "Moving" : "Placing"}: ${FIXTURES[kind].name}`),
      button("↻ Rotate (R)", "rounded-full border border-white/30 px-2 py-0.5", () => this.building && (this.building.rot = (this.building.rot + 1) % 4)),
      button("Done (Esc)", "rounded-full bg-emerald-500 px-2 py-0.5", () => this.endBuild()),
    );
  }

  private endBuild() {
    this.building = null;
    this.view?.setGhost(null);
    this.refs.build?.classList.add("hidden");
    this.refs.build?.classList.remove("flex");
  }

  private placeAt(x: number, z: number) {
    const b = this.building;
    if (!b) return;
    const gx = Math.round(x * 4) / 4;
    const gz = Math.round(z * 4) / 4;
    if (b.move) {
      if (this.act(moveFixture(this.s, b.move, gx, gz, b.rot), "Moved")) this.endBuild();
      return;
    }
    const r = buyFixture(this.s, b.kind, gx, gz, b.rot);
    if (this.act(r, `${FIXTURES[b.kind].name} placed`) && r.ok && r.id && FIXTURES[b.kind].slots) {
      this.endBuild();
      this.fixturePanel(r.id);
    }
  }

  private licencePanel() {
    this.openPanel("Licences", "licences", (box) => {
      const lv = levelOf(this.s.xp);
      for (const c of CATEGORY_IDS) {
        const info = CATEGORIES[c];
        const owned = this.s.licences.includes(c);
        const tierLock = !EDITIONS[this.s.tier].categories.includes(c);
        const b = button("", `flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${owned ? "border-emerald-400/40 bg-emerald-500/10" : tierLock || lv < info.level ? "border-white/10 opacity-60" : "border-white/20 hover:border-amber-400"}`, () => {
          if (owned) return;
          this.act(buyLicence(this.s, c), `You can now sell ${info.name}. Order stock on 📦 Stock.`);
        });
        b.append(el("span", "font-bold", `${info.icon} ${info.name}`), el("span", "text-xs text-white/70", owned ? "✓ Licensed" : tierLock ? "Ultimate" : lv < info.level ? `Level ${info.level}` : money(info.licence)));
        b.setAttribute("data-testid", `ub-licence-${c}`);
        box.append(b);
      }
    });
  }

  private marketingPanel() {
    this.openPanel("Marketing", "marketing", (box) => {
      if (this.s.campaign) box.append(el("p", "rounded-lg bg-emerald-500/15 px-3 py-2 text-sm", `${MARKETING[this.s.campaign.kind].name} running until the end of day ${this.s.campaign.until}.`));
      for (const k of Object.keys(MARKETING) as Campaign[]) {
        const m = MARKETING[k];
        const b = button("", "flex w-full items-center justify-between rounded-lg border border-white/20 px-3 py-2 text-left text-sm hover:border-amber-400", () => this.act(runCampaign(this.s, k), `${m.name} booked: more shoppers on the way`));
        b.append(el("span", "font-bold", m.name), el("span", "text-xs text-white/70", `${money(m.price)} · +${Math.round(m.boost * 100)}% shoppers · ${m.days} day${m.days > 1 ? "s" : ""}`));
        box.append(b);
      }
    });
  }

  private storePanel() {
    this.openPanel("Your store", "store", (box) => {
      const s = this.s;
      const next = SIZES[s.size + 1];
      const name = el("input", "w-full rounded border border-white/20 bg-black/40 px-2 py-1 text-white") as HTMLInputElement;
      name.value = s.name;
      name.maxLength = 24;
      const colour = el("input", "h-8 w-14 rounded border border-white/20 bg-black/40") as HTMLInputElement;
      colour.type = "color";
      colour.value = s.sign;
      colour.disabled = !EDITIONS[s.tier].customSign;
      box.append(
        el("label", "text-xs text-white/60", "Name", name),
        el("div", "flex items-center gap-2 text-xs text-white/60", el("span", "", EDITIONS[s.tier].customSign ? "Sign colour" : "Sign colour (Ultimate)"), colour),
        button("Save", `${BTN}`, () => this.act(rename(s, name.value, EDITIONS[s.tier].customSign ? colour.value : undefined), "Store updated")),
        el("p", "mt-2 text-sm", `${SIZES[s.size].name} · ${sizeOf(s).w} × ${sizeOf(s).d} m · rent ${money(SIZES[s.size].rent)}/day`),
      );
      if (next && s.size + 1 < EDITIONS[s.tier].sizes) {
        const b = button(`Move up to a ${next.name} (${next.w} × ${next.d} m) · ${money(next.price)} · rent ${money(next.rent)}/day`, `${BTN} w-full`, () => this.act(expand(s), `Welcome to your ${next.name}!`));
        b.setAttribute("data-testid", "ub-expand");
        box.append(b);
      } else if (next) box.append(el("p", "text-xs text-amber-300", "Bigger premises come with UBusiness Ultimate."));
    });
  }

  private booksPanel() {
    this.openPanel("The books", "books", (box) => {
      const s = this.s;
      box.append(
        el("p", "text-sm", `Business value ${money(storeValue(s))} · score ${score(s).toLocaleString()}`),
        el("p", "text-xs text-white/60", `Today so far: ${s.today.customers} served, ${money(s.today.revenue)} taken, ${s.today.unhappy} left unhappy.`),
      );
      for (const r of [...s.history].reverse().slice(0, 10))
        box.append(el("div", "flex justify-between rounded bg-white/5 px-2 py-1 text-xs", el("span", "", `Day ${r.day}`), el("span", "", `${r.customers} shoppers`), el("span", r.profit >= 0 ? "text-emerald-300" : "text-red-300", money(r.profit))));
      const bank = primaryButton("Bank my score and finish for now", AMBER, () => {
        this.save();
        this.emitter.emit({ kind: "final", score: score(s), durationMs: Math.max(this.loop.activeMs, 60_000) });
      });
      bank.setAttribute("data-testid", "ub-bank");
      box.append(bank);
    });
  }

  private photoMode() {
    if (!this.view) return;
    this.view.photo = !this.view.photo;
    this.closePanel();
    this.toast(this.view.photo ? "Photo mode: tap anywhere to leave" : "");
  }

  // ----------------------------------------------------------------- input

  private ndc(e: { clientX: number; clientY: number }) {
    const r = this.host.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== "store") return;
    const t = e.target as HTMLElement;
    if (t?.tagName === "INPUT" || t?.tagName === "SELECT") return;
    this.keys.add(e.code);
    if (e.code === "KeyR" && this.building) this.building.rot = (this.building.rot + 1) % 4;
    if (e.code === "Escape") {
      if (this.building) this.endBuild();
      else if (this.view?.photo) this.photoMode();
      else this.closePanel();
    }
    if (e.code === "KeyB") this.buildPanel();
    if (e.code === "Space") {
      e.preventDefault();
      if (this.panel?.dataset.kind !== "till") this.tillPanel();
      else (this.panel.querySelector('[data-testid="ub-scan"]') as HTMLButtonElement | null)?.click();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clearInput = () => {
    this.keys.clear();
    this.drag = null;
    this.pinch.clear();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.mode !== "store" || !this.view || e.target !== this.view.canvas) return;
    if (this.view.photo) return this.photoMode();
    this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch.size === 2) {
      const [a, b] = [...this.pinch.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.drag = null;
      return;
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, button: e.button };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.mode !== "store" || !this.view) return;
    const p = this.pinch.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pinch.size === 2) {
        const [a, b] = [...this.pinch.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist) this.view.dist = Math.max(4, Math.min(34, this.view.dist * (this.pinchDist / d)));
        this.pinchDist = d;
        return;
      }
    }
    if (e.target === this.view.canvas || this.drag) {
      const n = this.ndc(e);
      const hit = this.view.pick(n.x, n.y);
      this.cursor = hit.ground;
      if (!this.building && !this.panel) this.view.setHighlight(hit.fixture ? (this.s.fixtures.find((f) => f.id === hit.fixture) ?? null) : null);
    }
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.drag.moved += Math.abs(dx) + Math.abs(dy);
    if (this.drag.button === 2 || e.shiftKey) {
      // Pan: the floor follows the pointer.
      const y = this.view.yaw;
      const [fx, fz] = [Math.sin(y), Math.cos(y)];
      const [rx, rz] = [-fz, fx];
      const k = this.view.dist * 0.0016;
      this.view.target.x += (-rx * dx + fx * dy) * k;
      this.view.target.z += (-rz * dx + fz * dy) * k;
    } else {
      this.view.yaw += dx * 0.006;
      this.view.pitch = Math.max(0.25, Math.min(1.45, this.view.pitch + dy * 0.004));
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pinch.delete(e.pointerId);
    if (this.pinch.size < 2) this.pinchDist = 0;
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.moved > 8 || !this.view) return;
    // A click: place, or use what's under the pointer.
    const n = this.ndc(e);
    const hit = this.view.pick(n.x, n.y);
    if (this.building && hit.ground) return this.placeAt(hit.ground.x, hit.ground.z);
    if (hit.fixture) this.fixturePanel(hit.fixture);
  };

  private onWheel = (e: WheelEvent) => {
    if (this.mode !== "store" || !this.view) return;
    e.preventDefault();
    this.view.dist = Math.max(4, Math.min(34, this.view.dist * Math.exp(e.deltaY * 0.001)));
  };

  // ----------------------------------------------------------------- tests

  private hooks() {
    (window as unknown as Record<string, unknown>).__ubiz = {
      state: () => ({
        mode: this.mode,
        tier: this.tier,
        open: this.open,
        day: this.s?.day,
        minute: this.s?.minute,
        cash: this.s?.cash,
        shoppers: this.shoppers.map((c) => ({ id: c.id, stage: c.stage, basket: c.basket.length, till: c.till })),
        today: this.s?.today,
        fixtures: this.s?.fixtures.map((f) => ({ id: f.id, kind: f.kind, x: f.x, z: f.z, rot: f.rot, slots: f.slots })),
        storage: this.s?.storage,
        report: this.report,
      }),
      /** Jump the clock (minutes after midnight). */
      setMinute: (m: number) => this.s && (this.s.minute = m),
      /** Bring a shopper in right away. */
      spawn: (n = 1) => {
        for (let i = 0; i < n; i++) this.spawn();
      },
      /** Run the clock and the shoppers faster (tests). */
      setSpeed: (n: number) => (this.speed = n),
      fixtureAt: (id: number) => {
        const f = this.s.fixtures.find((o) => o.id === id);
        return f ? accessPoint(f) : null;
      },
      openFixture: (id: number) => this.fixturePanel(id),
      place: (x: number, z: number) => this.placeAt(x, z),
      give: (cents: number) => this.s && (this.s.cash += cents),
      xp: (n: number) => this.s && (this.s.xp += n),
    };
  }
}

const factory: GameFactory = () => new UBusinessGame();
export default factory;
