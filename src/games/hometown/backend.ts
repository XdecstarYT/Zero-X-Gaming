import type { BusinessKind, ItemId, Job, TownMe, TownSnapshot } from "./economy";
import { ITEMS, LocalTown } from "./economy";

/**
 * Where the town lives. Online it's the Supabase database (every action an
 * RPC the server checks); offline it's a LocalTown in this tab, with a few
 * neighbours trading so the market isn't empty.
 */
export interface TownBackend {
  readonly online: boolean;
  /** Your citizen id (the account id online). */
  readonly userId: string;
  join(look: Record<string, unknown>): Promise<TownMe>;
  me(): Promise<TownMe>;
  snapshot(): Promise<TownSnapshot>;
  builds(since?: string): Promise<{ id: number; build: unknown; at: string }[]>;
  work(job: Job): Promise<{ item?: ItemId; qty?: number; cash: number }>;
  eat(): Promise<number>;
  buyPlot(plot: number): Promise<void>;
  listPlot(plot: number, price: number | null): Promise<void>;
  saveBuild(plot: number, build: { walls: unknown[]; items: unknown[] }): Promise<void>;
  foundBusiness(plot: number, kind: BusinessKind, name: string): Promise<number>;
  produce(business: number, batches: number): Promise<{ item: ItemId; qty: number }>;
  placeOrder(item: ItemId, side: "buy" | "sell", price: number, qty: number): Promise<{ filled: number; resting: number }>;
  cancelOrder(order: number): Promise<void>;
  openShop(plot: number, name: string): Promise<void>;
  stockShop(plot: number, item: ItemId, price: number, qty: number): Promise<number>;
  buyShop(plot: number, item: ItemId, qty: number, price: number): Promise<void>;
  run(slogan: string, salesTax: number, publicWage: number): Promise<void>;
  vote(candidate: string): Promise<void>;
  setPolicy(salesTax: number, publicWage: number): Promise<void>;
}

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** The live town: thin wrappers over the town_* RPCs. */
export class SupabaseBackend implements TownBackend {
  readonly online = true;
  constructor(
    private rpcFn: Rpc,
    readonly userId: string,
  ) {}

  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.rpcFn(fn, args);
    if (error) throw new Error(cleanError(error.message));
    return data as T;
  }

  join = (look: Record<string, unknown>) => this.rpc<TownMe>("town_join", { p_look: look });
  me = () => this.rpc<TownMe>("town_me");
  snapshot = () => this.rpc<TownSnapshot>("town_snapshot");
  builds = (since?: string) => this.rpc<{ id: number; build: unknown; at: string }[]>("town_builds", { p_since: since ?? null });
  work = (job: Job) => this.rpc<{ item?: ItemId; qty?: number; cash: number }>("town_work", { p_job: job });
  eat = () => this.rpc<number>("town_eat");
  buyPlot = (plot: number) => this.rpc<void>("town_buy_plot", { p_plot: plot });
  listPlot = (plot: number, price: number | null) => this.rpc<void>("town_list_plot", { p_plot: plot, p_price: price });
  saveBuild = (plot: number, build: { walls: unknown[]; items: unknown[] }) => this.rpc<void>("town_save_build", { p_plot: plot, p_build: build });
  foundBusiness = (plot: number, kind: BusinessKind, name: string) => this.rpc<number>("town_found_business", { p_plot: plot, p_kind: kind, p_name: name });
  produce = (business: number, batches: number) => this.rpc<{ item: ItemId; qty: number }>("town_produce", { p_business: business, p_batches: batches });
  placeOrder = (item: ItemId, side: "buy" | "sell", price: number, qty: number) => this.rpc<{ filled: number; resting: number }>("town_place_order", { p_item: item, p_side: side, p_price: price, p_qty: qty });
  cancelOrder = (order: number) => this.rpc<void>("town_cancel_order", { p_order: order });
  openShop = (plot: number, name: string) => this.rpc<void>("town_open_shop", { p_plot: plot, p_name: name });
  stockShop = (plot: number, item: ItemId, price: number, qty: number) => this.rpc<number>("town_stock_shop", { p_plot: plot, p_item: item, p_price: price, p_qty: qty });
  buyShop = (plot: number, item: ItemId, qty: number, price: number) => this.rpc<void>("town_buy_shop", { p_plot: plot, p_item: item, p_qty: qty, p_price: price });
  run = (slogan: string, salesTax: number, publicWage: number) => this.rpc<void>("town_run", { p_slogan: slogan, p_sales_tax: salesTax, p_public_wage: publicWage });
  vote = (candidate: string) => this.rpc<void>("town_vote", { p_candidate: candidate });
  setPolicy = (salesTax: number, publicWage: number) => this.rpc<void>("town_set_policy", { p_sales_tax: salesTax, p_public_wage: publicWage });
}

/** Postgres errors arrive as plain messages; tidy the odd technical one. */
export function cleanError(msg: string) {
  if (/permission denied|JWT|not authenticated/i.test(msg)) return "Sign in to play Hometown";
  if (/violates check constraint/i.test(msg)) return "That isn't allowed";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Can't reach the town right now. Check your connection.";
  return msg;
}

const NEIGHBOURS = ["Maple Jones", "Rosa Quill", "Ted Harrow", "Ivy Banks", "Sol Okafor", "Nina Park"];

/**
 * The practice town in this tab. Neighbours work, trade and run for mayor on
 * a timer so there's a market to play against.
 */
export class LocalBackend implements TownBackend {
  readonly online = false;
  readonly town: LocalTown;
  private timer = 0;
  private n = 0;

  constructor(
    readonly userId = "me",
    private name = "You",
    opts: { neighbours?: boolean; now?: () => number } = {},
  ) {
    this.town = new LocalTown(opts.now);
    if (opts.neighbours !== false) this.seed();
  }

  private seed() {
    const t = this.town;
    NEIGHBOURS.forEach((n, i) => {
      const id = `npc${i}`;
      t.join(id, n);
      t.grant(id, "cash", 2000);
      for (const it of ITEMS) t.grant(id, it, 4 + ((i * 7 + it.length) % 9));
    });
    // A standing market: everyone posts a bid and an ask around the base price.
    const base: Record<string, number> = { wheat: 6, logs: 6, ore: 9, flour: 12, planks: 12, steel: 35, bread: 10, furniture: 60, tools: 30 };
    NEIGHBOURS.forEach((_, i) => {
      for (const it of ITEMS) {
        if ((i + it.length) % 3 === 0) continue;
        const b = base[it];
        try {
          t.placeOrder(`npc${i}`, it, "sell", Math.round(b * (1.15 + (i % 3) * 0.1)), 2 + (i % 3));
          t.placeOrder(`npc${i}`, it, "buy", Math.max(1, Math.round(b * (0.85 - (i % 3) * 0.08))), 2 + ((i + 1) % 3));
        } catch {
          // Out of orders or goods: skip.
        }
      }
    });
    t.buyPlot("npc0", 7);
    t.openShop("npc0", 7, "Maple's Corner Store");
    t.stockShop("npc0", 7, "bread", 9, 4);
    t.stockShop("npc0", 7, "tools", 28, 2);
    t.buyPlot("npc1", 20);
    t.foundBusiness("npc1", 20, "bakery", "Quill Bakery");
    t.run("npc2", "Lower taxes, busier streets", 0.03, 50);
    t.run("npc3", "Better wages for public works", 0.08, 110);
  }

  /** A neighbour does something every few seconds of play. */
  live(dt: number) {
    this.timer += dt;
    if (this.timer < 6) return false;
    this.timer = 0;
    const t = this.town;
    const i = this.n++ % NEIGHBOURS.length;
    const id = `npc${i}`;
    const it = ITEMS[(this.n * 5) % ITEMS.length];
    const s = t.snapshot();
    const last = s.last[it] ?? { wheat: 6, logs: 6, ore: 9, flour: 12, planks: 12, steel: 35, bread: 10, furniture: 60, tools: 30 }[it];
    try {
      if (this.n % 2) t.placeOrder(id, it, "sell", Math.max(1, Math.round(last * 1.1)), 1);
      else t.placeOrder(id, it, "buy", Math.max(1, Math.round(last * 0.92)), 1);
    } catch {
      // A neighbour out of cash, goods or order slots just waits.
    }
    if (this.n % 7 === 0) {
      const cand = s.election.candidates[(this.n / 7) % Math.max(1, s.election.candidates.length) | 0];
      if (cand) {
        try {
          t.vote(id, cand.id);
        } catch {
          /* ignore */
        }
      }
    }
    return true;
  }

  private act<T>(fn: () => T): Promise<T> {
    try {
      return Promise.resolve(fn());
    } catch (e) {
      return Promise.reject(e);
    }
  }

  join = (look: Record<string, unknown>) => this.act(() => this.town.join(this.userId, this.name, look));
  me = () => this.act(() => this.town.me(this.userId));
  snapshot = () => this.act(() => this.town.snapshot());
  builds = (since?: string) => this.act(() => this.town.builds(since ? Date.parse(since) : undefined));
  work = (job: Job) => this.act(() => this.town.work(this.userId, job));
  eat = () => this.act(() => this.town.eat(this.userId));
  buyPlot = (plot: number) => this.act(() => this.town.buyPlot(this.userId, plot));
  listPlot = (plot: number, price: number | null) => this.act(() => this.town.listPlot(this.userId, plot, price));
  saveBuild = (plot: number, build: { walls: unknown[]; items: unknown[] }) => this.act(() => void this.town.saveBuild(this.userId, plot, build));
  foundBusiness = (plot: number, kind: BusinessKind, name: string) => this.act(() => this.town.foundBusiness(this.userId, plot, kind, name));
  produce = (business: number, batches: number) => this.act(() => this.town.produce(this.userId, business, batches));
  placeOrder = (item: ItemId, side: "buy" | "sell", price: number, qty: number) => this.act(() => this.town.placeOrder(this.userId, item, side, price, qty));
  cancelOrder = (order: number) => this.act(() => this.town.cancelOrder(this.userId, order));
  openShop = (plot: number, name: string) => this.act(() => this.town.openShop(this.userId, plot, name));
  stockShop = (plot: number, item: ItemId, price: number, qty: number) => this.act(() => this.town.stockShop(this.userId, plot, item, price, qty));
  buyShop = (plot: number, item: ItemId, qty: number, price: number) => this.act(() => this.town.buyShop(this.userId, plot, item, qty, price));
  run = (slogan: string, salesTax: number, publicWage: number) => this.act(() => this.town.run(this.userId, slogan, salesTax, publicWage));
  vote = (candidate: string) => this.act(() => this.town.vote(this.userId, candidate));
  setPolicy = (salesTax: number, publicWage: number) => this.act(() => this.town.setPolicy(this.userId, salesTax, publicWage));
}

