/**
 * Hometown's economy: the goods, jobs and recipes, and LocalTown, an
 * in-memory copy of the server's rules (supabase/migrations/*_hometown*.sql).
 *
 * Online, the database is the authority and every action is an RPC. LocalTown
 * plays the same rules in the browser for the practice town (no account, or
 * `?town=local`) and for the unit tests, so the two must stay in step: same
 * prices, cooldowns, escrow and tax.
 */

export const ITEMS = ["wheat", "logs", "ore", "flour", "planks", "steel", "bread", "furniture", "tools"] as const;
export type ItemId = (typeof ITEMS)[number];

export const ITEM_INFO: Record<ItemId, { name: string; icon: string; base: number }> = {
  wheat: { name: "Wheat", icon: "🌾", base: 6 },
  logs: { name: "Logs", icon: "🪵", base: 6 },
  ore: { name: "Ore", icon: "🪨", base: 9 },
  flour: { name: "Flour", icon: "🥡", base: 12 },
  planks: { name: "Planks", icon: "🪚", base: 12 },
  steel: { name: "Steel", icon: "🔩", base: 35 },
  bread: { name: "Bread", icon: "🍞", base: 10 },
  furniture: { name: "Furniture", icon: "🛋", base: 60 },
  tools: { name: "Tools", icon: "🛠", base: 30 },
};

export type Job = "farm" | "forest" | "mine" | "public";
export const JOBS: Record<Job, { name: string; place: string; gives: ItemId | null; qty: number }> = {
  farm: { name: "Farm shift", place: "Greenacre Farm", gives: "wheat", qty: 3 },
  forest: { name: "Logging shift", place: "Tall Pines Yard", gives: "logs", qty: 3 },
  mine: { name: "Mine shift", place: "Copperhill Mine", gives: "ore", qty: 2 },
  public: { name: "Public works", place: "City Hall", gives: null, qty: 0 },
};

export type BusinessKind = "mill" | "bakery" | "sawmill" | "workshop" | "foundry" | "smithy";
export const RECIPES: Record<BusinessKind, { name: string; icon: string; inputs: Partial<Record<ItemId, number>>; output: ItemId; qty: number }> = {
  mill: { name: "Mill", icon: "🌾", inputs: { wheat: 3 }, output: "flour", qty: 2 },
  bakery: { name: "Bakery", icon: "🥖", inputs: { flour: 2 }, output: "bread", qty: 3 },
  sawmill: { name: "Sawmill", icon: "🪚", inputs: { logs: 3 }, output: "planks", qty: 2 },
  workshop: { name: "Workshop", icon: "🛋", inputs: { planks: 4 }, output: "furniture", qty: 1 },
  foundry: { name: "Foundry", icon: "🔥", inputs: { ore: 3 }, output: "steel", qty: 1 },
  smithy: { name: "Smithy", icon: "🛠", inputs: { steel: 1, planks: 1 }, output: "tools", qty: 2 },
};

export const RULES = {
  startCash: 1500,
  shiftPay: 10,
  shiftEnergy: 15,
  shiftCooldownMs: 20_000,
  produceEnergy: 5,
  produceCooldownMs: 15_000,
  maxBatches: 5,
  eatEnergy: 35,
  /** One energy point every two minutes. */
  energyMsPerPoint: 120_000,
  businessCost: 800,
  /** The Town Bank: interest a day on savings, paid by the treasury. */
  savingsRate: 0.02,
  /** The allowance (the public wage) comes once every this long. */
  allowanceMs: 20 * 3600_000,
  shopCost: 200,
  filingFee: 100,
  maxPlots: 3,
  maxOrders: 10,
  electionMs: 6 * 3600_000,
  taxRange: [0, 0.2] as const,
  wageRange: [20, 200] as const,
};

export const NPLOTS = 48;
export const plotPrice = (i: number) => 900 + (i % 6) * 250 + (i % 12 < 6 ? 300 : 0);

// ------------------------------------------------------------------ types

export interface Order {
  id: number;
  item: ItemId;
  side: "buy" | "sell";
  price: number;
  qty: number;
}

export interface TownMe {
  id: string;
  name: string;
  cash: number;
  /** In the Town Bank (older servers leave it out). */
  savings?: number;
  allowanceAt?: string | null;
  energy: number;
  workedAt: string | null;
  look: Record<string, unknown>;
  inventory: Partial<Record<ItemId, number>>;
  orders: Order[];
  voted: string | null;
}

export interface PlotInfo {
  id: number;
  owner: string | null;
  ownerName: string | null;
  price: number;
  salePrice: number | null;
  at: string;
  business: { id: number; kind: BusinessKind; name: string; total: number; producedAt: string | null } | null;
  shop: { name: string; items: { item: ItemId; price: number; qty: number }[] } | null;
}

export interface Candidate {
  id: string;
  name: string;
  slogan: string;
  salesTax: number;
  publicWage: number;
  votes: number;
}

export interface TownSnapshot {
  now: string;
  state: { mayor: string | null; mayorName: string | null; salesTax: number; publicWage: number; treasury: number };
  citizens: number;
  rich: { name: string; cash: number }[];
  plots: PlotInfo[];
  book: { item: ItemId; side: "buy" | "sell"; price: number; qty: number }[];
  last: Partial<Record<ItemId, number>>;
  trades: { item: ItemId; price: number; qty: number; via: string; at: string }[];
  election: { id: number; endsAt: string; candidates: Candidate[] };
  news: { at: string; kind: string; text: string }[];
}

/** Best bid and ask for an item from the snapshot's aggregated book. */
export function quote(snap: TownSnapshot, item: ItemId) {
  let bid = 0;
  let ask = 0;
  for (const o of snap.book) {
    if (o.item !== item) continue;
    if (o.side === "buy") bid = Math.max(bid, o.price);
    else ask = ask ? Math.min(ask, o.price) : o.price;
  }
  return { bid, ask, last: snap.last[item] ?? 0 };
}

/** What you're worth: cash, goods at the last price (or their base) and your land. */
export function netWorth(me: TownMe, snap: TownSnapshot | null) {
  let n = me.cash + (me.savings ?? 0);
  for (const [k, q] of Object.entries(me.inventory)) n += (q ?? 0) * (snap?.last[k as ItemId] ?? ITEM_INFO[k as ItemId].base);
  for (const o of me.orders) if (o.side === "buy") n += o.price * o.qty;
  else n += o.qty * (snap?.last[o.item] ?? ITEM_INFO[o.item].base);
  if (snap) for (const p of snap.plots) if (p.owner === me.id) n += p.price + (p.business ? RULES.businessCost : 0);
  return n;
}

// -------------------------------------------------------------- LocalTown

interface Citizen {
  id: string;
  name: string;
  cash: number;
  energy: number;
  energyAt: number;
  workedAt: number | null;
  look: Record<string, unknown>;
  inv: Partial<Record<ItemId, number>>;
  savings: number;
  savedAt: number;
  allowanceAt: number | null;
}

interface LocalOrder extends Order {
  user: string;
  open: boolean;
}

interface LocalPlot {
  id: number;
  owner: string | null;
  price: number;
  salePrice: number | null;
  build: unknown;
  walls: number;
  items: number;
  at: number;
}

const fail = (msg: string): never => {
  throw new Error(msg);
};

/**
 * The server's rules, in memory. Each method takes the acting citizen's id
 * (the server reads it from the session) and throws the same messages.
 */
export class LocalTown {
  now: () => number;
  private citizens = new Map<string, Citizen>();
  private orders: LocalOrder[] = [];
  private nextOrder = 1;
  private nextBiz = 1;
  private plots: LocalPlot[] = [];
  /** plot → business id */
  private bizAt = new Map<number, number>();
  private businesses = new Map<number, { id: number; owner: string; kind: BusinessKind; name: string; total: number; producedAt: number | null }>();
  private shops = new Map<number, { owner: string; name: string; items: Map<ItemId, { price: number; qty: number }> }>();
  private trades: { item: ItemId; price: number; qty: number; via: string; at: number }[] = [];
  private news: { at: number; kind: string; text: string }[] = [];
  private state = { mayor: null as string | null, salesTax: 0.05, publicWage: 60, treasury: 5000 };
  private election = { id: 1, endsAt: 0, candidates: [] as { id: string; slogan: string; salesTax: number; publicWage: number; at: number }[], votes: new Map<string, string>() };

  constructor(now: () => number = Date.now) {
    this.now = now;
    for (let i = 0; i < NPLOTS; i++) this.plots.push({ id: i, owner: null, price: plotPrice(i), salePrice: null, build: null, walls: 0, items: 0, at: 0 });
    this.election.endsAt = now() + RULES.electionMs;
  }

  // ------------------------------------------------------------ helpers

  private c(id: string) {
    return this.citizens.get(id) ?? fail("Move to town first");
  }
  private inv(id: string, item: ItemId, d: number) {
    const c = this.c(id);
    const have = c.inv[item] ?? 0;
    if (have + d < 0) fail(`Not enough ${item}`);
    c.inv[item] = have + d;
  }
  private cash(id: string, d: number) {
    const c = this.c(id);
    if (c.cash + d < 0) fail("Not enough cash");
    c.cash += d;
  }
  private treasury(d: number) {
    if (this.state.treasury + d < 0) fail("The town treasury is empty");
    this.state.treasury += d;
  }
  private energy(id: string) {
    const c = this.c(id);
    const gained = Math.floor((this.now() - c.energyAt) / RULES.energyMsPerPoint);
    const e = Math.min(100, c.energy + gained);
    c.energyAt = e >= 100 ? this.now() : c.energyAt + (e - c.energy) * RULES.energyMsPerPoint;
    c.energy = e;
    return e;
  }
  private spend(id: string, n: number) {
    const e = this.energy(id);
    if (e < n) fail("Too tired: eat something or rest");
    const c = this.c(id);
    if (e >= 100) c.energyAt = this.now();
    c.energy = e - n;
  }
  private say(kind: string, text: string) {
    this.news.unshift({ at: this.now(), kind, text: text.slice(0, 200) });
    this.news.length = Math.min(this.news.length, 50);
  }
  private nameOf(id: string | null) {
    return (id && this.citizens.get(id)?.name) || "Someone";
  }
  private tick() {
    const el = this.election;
    if (el.endsAt > this.now()) return;
    const tally = el.candidates.map((c) => ({ c, votes: [...el.votes.values()].filter((v) => v === c.id).length })).sort((a, b) => b.votes - a.votes || a.c.at - b.c.at);
    const win = tally[0];
    if (win) {
      Object.assign(this.state, { mayor: win.c.id, salesTax: win.c.salesTax, publicWage: win.c.publicWage });
      this.say("election", `${this.nameOf(win.c.id)} is elected mayor with ${win.votes} of ${el.votes.size} votes`);
    } else this.say("election", "Nobody stood for mayor; the old council stays on");
    this.election = { id: el.id + 1, endsAt: this.now() + RULES.electionMs, candidates: [], votes: new Map() };
  }

  // ------------------------------------------------------------ citizens

  join(id: string, name: string, look: Record<string, unknown> = {}) {
    this.tick();
    if (!this.citizens.has(id)) {
      this.citizens.set(id, { id, name: name.slice(0, 20), cash: RULES.startCash, energy: 100, energyAt: this.now(), workedAt: null, look, inv: { bread: 3 }, savings: 0, savedAt: this.now(), allowanceAt: null });
      this.say("arrival", `${name} moved to town`);
    } else if (Object.keys(look).length) this.c(id).look = look;
    return this.me(id);
  }

  /** Pay the interest owed since the last look (from the treasury, as far as it goes). */
  private interest(id: string) {
    const c = this.c(id);
    const owed = Math.floor((c.savings * RULES.savingsRate * (this.now() - c.savedAt)) / 86_400_000);
    if (owed > 0) {
      const paid = Math.min(owed, this.state.treasury);
      this.state.treasury -= paid;
      c.savings += paid;
      c.savedAt = this.now();
    } else if (!c.savings) c.savedAt = this.now();
    return c.savings;
  }

  /** The Town Bank: deposit (positive) or withdraw (negative). */
  bank(id: string, amount: number) {
    if (!amount || !Number.isFinite(amount) || Math.abs(amount) > 100_000_000) fail("How much?");
    const bal = this.interest(id);
    if (amount < 0 && bal + amount < 0) fail("You don't have that much saved");
    this.cash(id, -amount);
    const c = this.c(id);
    c.savings += amount;
    c.savedAt = this.now();
    return { savings: c.savings };
  }

  /** The allowance: the public wage from the treasury, once every 20 hours. */
  allowance(id: string) {
    const c = this.c(id);
    if (c.allowanceAt && c.allowanceAt > this.now() - RULES.allowanceMs) {
      const left = c.allowanceAt + RULES.allowanceMs - this.now();
      fail(`Your allowance comes again in ${Math.floor(left / 3600_000)}h ${String(Math.floor((left % 3600_000) / 60_000)).padStart(2, "0")}m`);
    }
    const pay = this.state.publicWage;
    this.treasury(-pay);
    this.cash(id, pay);
    c.allowanceAt = this.now();
    return pay;
  }

  me(id: string): TownMe {
    const c = this.c(id);
    const e = this.energy(id);
    const savings = this.interest(id);
    const inventory: Partial<Record<ItemId, number>> = {};
    for (const [k, q] of Object.entries(c.inv)) if (q) inventory[k as ItemId] = q;
    return {
      id,
      name: c.name,
      cash: c.cash,
      savings,
      allowanceAt: c.allowanceAt ? new Date(c.allowanceAt).toISOString() : null,
      energy: e,
      workedAt: c.workedAt ? new Date(c.workedAt).toISOString() : null,
      look: c.look,
      inventory,
      orders: this.orders.filter((o) => o.open && o.user === id).map(({ id: oid, item, side, price, qty }) => ({ id: oid, item, side, price, qty })),
      voted: this.election.votes.get(id) ?? null,
    };
  }

  work(id: string, job: Job) {
    const c = this.c(id);
    if (c.workedAt && c.workedAt > this.now() - RULES.shiftCooldownMs) fail("Still catching your breath from the last shift");
    if (!JOBS[job]) fail("No such job");
    this.spend(id, RULES.shiftEnergy);
    if (job === "public") {
      const w = this.state.publicWage;
      this.treasury(-w);
      this.cash(id, w);
      c.workedAt = this.now();
      return { cash: w } as { item?: ItemId; qty?: number; cash: number };
    }
    const j = JOBS[job];
    let n = j.qty;
    if ((c.inv.tools ?? 0) > 0) {
      n += 2;
      if (Math.random() < 0.2) this.inv(id, "tools", -1);
    }
    this.inv(id, j.gives!, n);
    this.cash(id, RULES.shiftPay);
    c.workedAt = this.now();
    return { item: j.gives!, qty: n, cash: RULES.shiftPay };
  }

  eat(id: string) {
    this.inv(id, "bread", -1);
    const e = Math.min(100, this.energy(id) + RULES.eatEnergy);
    Object.assign(this.c(id), { energy: e, energyAt: this.now() });
    return e;
  }

  // --------------------------------------------------------------- land

  buyPlot(id: string, plot: number) {
    const p = this.plots[plot] ?? fail("No such plot");
    if (p.owner === id) fail("You already own it");
    if (this.plots.filter((x) => x.owner === id).length >= RULES.maxPlots) fail("Three plots is the limit");
    if (!p.owner) {
      this.cash(id, -p.price);
      this.treasury(p.price);
    } else if (p.salePrice != null) {
      const tax = Math.floor(p.salePrice * this.state.salesTax);
      this.cash(id, -p.salePrice);
      this.cash(p.owner, p.salePrice - tax);
      this.treasury(tax);
      // The house, the business and the shop all go with the land.
      const bid = this.bizAt.get(plot);
      if (bid) this.businesses.get(bid)!.owner = id;
      const s = this.shops.get(plot);
      if (s) s.owner = id;
    } else fail("That plot is not for sale");
    Object.assign(p, { owner: id, salePrice: null, at: this.now() });
    this.say("property", `${this.nameOf(id)} bought lot ${plot + 1}`);
  }

  listPlot(id: string, plot: number, price: number | null) {
    const p = this.plots[plot];
    if (!p || p.owner !== id) fail("Not your plot");
    p.salePrice = price;
    p.at = this.now();
  }

  saveBuild(id: string, plot: number, build: { walls: unknown[]; items: unknown[] }) {
    const p = this.plots[plot];
    if (!p || p.owner !== id) fail("Not your plot");
    const w = build.walls.length;
    const it = build.items.length;
    if (w > 120 || it > 80) fail("That house plan is too big");
    if (w > p.walls) this.inv(id, "planks", -(w - p.walls));
    if (it > p.items) this.inv(id, "furniture", -(it - p.items));
    Object.assign(p, { build: structuredClone(build), walls: w, items: it, at: this.now() });
    return { walls: w, items: it };
  }

  builds(since?: number) {
    return this.plots.filter((p) => p.build && (!since || p.at > since)).map((p) => ({ id: p.id, build: p.build, at: new Date(p.at).toISOString() }));
  }

  // ---------------------------------------------------------- businesses

  foundBusiness(id: string, plot: number, kind: BusinessKind, name: string) {
    if (this.plots[plot]?.owner !== id) fail("You need to own the plot");
    if (this.bizAt.has(plot)) fail("There is already a business here");
    if (!RECIPES[kind]) fail("No such business");
    this.cash(id, -RULES.businessCost);
    this.treasury(RULES.businessCost);
    const bid = this.nextBiz++;
    this.businesses.set(bid, { id: bid, owner: id, kind, name: name.trim(), total: 0, producedAt: null });
    this.bizAt.set(plot, bid);
    this.say("business", `${this.nameOf(id)} opened ${name.trim()} (${kind})`);
    return bid;
  }

  produce(id: string, business: number, batches = 1) {
    const b = this.businesses.get(business);
    if (!b || b.owner !== id) fail("Not your business");
    if (b!.producedAt && b!.producedAt > this.now() - RULES.produceCooldownMs) fail("The machines are still running");
    const n = Math.max(1, Math.min(RULES.maxBatches, batches));
    const r = RECIPES[b!.kind];
    this.spend(id, RULES.produceEnergy * n);
    // Check every input first, so a failed batch takes nothing.
    for (const [k, q] of Object.entries(r.inputs)) if ((this.c(id).inv[k as ItemId] ?? 0) < q! * n) fail(`Not enough ${k}`);
    for (const [k, q] of Object.entries(r.inputs)) this.inv(id, k as ItemId, -q! * n);
    this.inv(id, r.output, r.qty * n);
    b!.producedAt = this.now();
    b!.total += r.qty * n;
    return { item: r.output, qty: r.qty * n };
  }

  // -------------------------------------------------------------- market

  placeOrder(id: string, item: ItemId, side: "buy" | "sell", price: number, qty: number) {
    if (!ITEMS.includes(item)) fail("No such item");
    if (side !== "buy" && side !== "sell") fail("Buy or sell");
    if (!(price >= 1 && price <= 100000 && qty >= 1 && qty <= 1000) || !Number.isInteger(price) || !Number.isInteger(qty)) fail("Price 1 to 100000, quantity 1 to 1000");
    if (this.orders.filter((o) => o.open && o.user === id).length >= RULES.maxOrders) fail("Ten open orders is the limit");
    if (side === "buy") this.cash(id, -price * qty);
    else this.inv(id, item, -qty);
    const book = this.orders
      .filter((o) => o.open && o.item === item && o.side !== side && o.user !== id && (side === "buy" ? o.price <= price : o.price >= price))
      .sort((a, b) => (side === "buy" ? a.price - b.price : b.price - a.price) || a.id - b.id);
    let left = qty;
    let filled = 0;
    for (const o of book) {
      if (!left) break;
      const n = Math.min(left, o.qty);
      const gross = o.price * n;
      const tax = Math.floor(gross * this.state.salesTax);
      if (side === "buy") {
        this.cash(id, (price - o.price) * n);
        this.inv(id, item, n);
        this.cash(o.user, gross - tax);
      } else {
        this.inv(o.user, item, n);
        this.cash(id, gross - tax);
      }
      this.treasury(tax);
      this.trades.unshift({ item, price: o.price, qty: n, via: "market", at: this.now() });
      if (n === o.qty) o.open = false;
      else o.qty -= n;
      left -= n;
      filled += n;
    }
    let order: number | null = null;
    if (left > 0) {
      order = this.nextOrder++;
      this.orders.push({ id: order, user: id, item, side, price, qty: left, open: true });
    }
    return { filled, resting: left, order };
  }

  cancelOrder(id: string, order: number) {
    const o = this.orders.find((x) => x.id === order && x.user === id && x.open) ?? fail("No such open order");
    if (o.side === "buy") this.cash(id, o.price * o.qty);
    else this.inv(id, o.item, o.qty);
    o.open = false;
  }

  // --------------------------------------------------------------- shops

  openShop(id: string, plot: number, name: string) {
    if (this.plots[plot]?.owner !== id) fail("You need to own the plot");
    if (this.shops.has(plot)) fail("There is already a shop here");
    const n = name.trim();
    if (n.length < 2 || n.length > 30) fail("Shop names are 2 to 30 letters");
    this.cash(id, -RULES.shopCost);
    this.treasury(RULES.shopCost);
    this.shops.set(plot, { owner: id, name: n, items: new Map() });
    this.say("business", `${this.nameOf(id)} opened a shop: ${n}`);
  }

  stockShop(id: string, plot: number, item: ItemId, price: number, qty: number) {
    const s = this.shops.get(plot);
    if (!s || s.owner !== id) fail("Not your shop");
    if (!ITEMS.includes(item)) fail("No such item");
    if (!(price >= 1 && price <= 100000) || Math.abs(qty) > 1000) fail("Price 1 to 100000, quantity up to 1000");
    const shelf = s!.items.get(item) ?? { price, qty: 0 };
    if (shelf.qty + qty < 0) fail("Not that many on the shelf");
    this.inv(id, item, -qty);
    s!.items.set(item, { price, qty: shelf.qty + qty });
    return shelf.qty + qty;
  }

  buyShop(id: string, plot: number, item: ItemId, qty: number, maxPrice: number) {
    const s = this.shops.get(plot) ?? fail("No shop here");
    if (s.owner === id) fail("You own this shop");
    if (!(qty >= 1 && qty <= 1000)) fail("Buy 1 to 1000");
    const shelf = s.items.get(item);
    if (!shelf || shelf.qty < qty) fail("Not enough on the shelf");
    if (shelf!.price > maxPrice) fail("The price just went up");
    const gross = shelf!.price * qty;
    const tax = Math.floor(gross * this.state.salesTax);
    this.cash(id, -gross);
    this.cash(s.owner, gross - tax);
    this.treasury(tax);
    this.inv(id, item, qty);
    shelf!.qty -= qty;
    this.trades.unshift({ item, price: shelf!.price, qty, via: "shop", at: this.now() });
  }

  // ---------------------------------------------------------- City Hall

  run(id: string, slogan: string, salesTax: number, publicWage: number) {
    this.tick();
    const el = this.election;
    if (el.candidates.some((c) => c.id === id)) fail("You are already on the ballot");
    const s = slogan.trim();
    if (s.length < 3 || s.length > 80) fail("Slogans are 3 to 80 letters");
    if (!(salesTax >= RULES.taxRange[0] && salesTax <= RULES.taxRange[1] && publicWage >= RULES.wageRange[0] && publicWage <= RULES.wageRange[1])) fail("Tax 0 to 20 percent, wage 20 to 200");
    this.cash(id, -RULES.filingFee);
    this.treasury(RULES.filingFee);
    el.candidates.push({ id, slogan: s, salesTax: Math.round(salesTax * 1000) / 1000, publicWage, at: this.now() });
    this.say("election", `${this.nameOf(id)} is running for mayor: ${s}`);
  }

  vote(id: string, candidate: string) {
    this.c(id);
    this.tick();
    if (!this.election.candidates.some((c) => c.id === candidate)) fail("They are not on the ballot");
    this.election.votes.set(id, candidate);
  }

  setPolicy(id: string, salesTax: number, publicWage: number) {
    if (this.state.mayor !== id) fail("Only the mayor can do that");
    if (!(salesTax >= RULES.taxRange[0] && salesTax <= RULES.taxRange[1] && publicWage >= RULES.wageRange[0] && publicWage <= RULES.wageRange[1])) fail("Tax 0 to 20 percent, wage 20 to 200");
    Object.assign(this.state, { salesTax: Math.round(salesTax * 1000) / 1000, publicWage });
    this.say("policy", `Mayor ${this.nameOf(id)} set the sales tax to ${Math.round(salesTax * 1000) / 10}% and the public wage to ${publicWage}`);
  }

  // ------------------------------------------------------------ the view

  snapshot(): TownSnapshot {
    this.tick();
    const iso = (t: number) => new Date(t).toISOString();
    const agg = new Map<string, { item: ItemId; side: "buy" | "sell"; price: number; qty: number }>();
    for (const o of this.orders) {
      if (!o.open) continue;
      const k = `${o.item}|${o.side}|${o.price}`;
      const a = agg.get(k) ?? { item: o.item, side: o.side, price: o.price, qty: 0 };
      a.qty += o.qty;
      agg.set(k, a);
    }
    const last: Partial<Record<ItemId, number>> = {};
    for (const t of [...this.trades].reverse()) last[t.item] = t.price;
    const people = [...this.citizens.values()];
    return {
      now: iso(this.now()),
      state: { ...this.state, mayorName: this.state.mayor ? this.nameOf(this.state.mayor) : null },
      citizens: people.length,
      rich: people.sort((a, b) => b.cash - a.cash).slice(0, 5).map((c) => ({ name: c.name, cash: c.cash })),
      plots: this.plots.map((p) => {
        const bid = this.bizAt.get(p.id);
        const b = bid ? this.businesses.get(bid)! : null;
        const s = this.shops.get(p.id);
        return {
          id: p.id,
          owner: p.owner,
          ownerName: p.owner ? this.nameOf(p.owner) : null,
          price: p.price,
          salePrice: p.salePrice,
          at: iso(p.at),
          business: b ? { id: b.id, kind: b.kind, name: b.name, total: b.total, producedAt: b.producedAt ? iso(b.producedAt) : null } : null,
          shop: s ? { name: s.name, items: [...s.items].filter(([, v]) => v.qty > 0).map(([item, v]) => ({ item, ...v })).sort((a, b) => a.item.localeCompare(b.item)) } : null,
        };
      }),
      book: [...agg.values()].sort((a, b) => a.item.localeCompare(b.item) || a.side.localeCompare(b.side) || a.price - b.price),
      last,
      trades: this.trades.slice(0, 20).map((t) => ({ ...t, at: iso(t.at) })),
      election: {
        id: this.election.id,
        endsAt: iso(this.election.endsAt),
        candidates: this.election.candidates.map((c) => ({ id: c.id, name: this.nameOf(c.id), slogan: c.slogan, salesTax: c.salesTax, publicWage: c.publicWage, votes: [...this.election.votes.values()].filter((v) => v === c.id).length })),
      },
      news: this.news.slice(0, 25).map((n) => ({ ...n, at: iso(n.at) })),
    };
  }

  /** Test/admin: hand someone goods or cash (the server has no such call). */
  grant(id: string, item: ItemId | "cash", n: number) {
    if (item === "cash") this.c(id).cash += n;
    else this.inv(id, item, n);
  }
  /** Test: close the polls now. */
  closePolls() {
    this.election.endsAt = this.now() - 1;
    this.tick();
  }
  get treasuryNow() {
    return this.state.treasury;
  }
}
