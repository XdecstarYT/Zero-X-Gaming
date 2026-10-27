import type { Job, Need } from "./data";
import type { Assessment, Report } from "./jobs";

/**
 * Your building company: cash, a reputation, a crew, a bank and a calendar. Clients post jobs to
 * a contracts board; you price each one and tender against rival builders, and the cheapest
 * credible bid wins (a good reputation lets you charge more and still win). A won contract pays a
 * deposit up front and the rest when the inspector signs it off, less a defects retention held for
 * four weeks and damages for every day it runs late. Or develop property: buy a block of land in
 * one of six suburbs, build on it, and sell it at auction or rent it out. What it's worth comes
 * from what you actually built on it, and the market moves week by week.
 */

export const START_CASH = 60_000;
/** Land, per square metre, in an average suburb at par. */
export const LAND_RATE = 380;
/** A finished house, per square metre of floor, in an average suburb. */
export const BUILD_RATE = 2100;
/** What a day of one builder's labour is worth when pricing a job. */
export const LABOUR_RATE = 65 * 9;
export const MAX_ACTIVE = 3;
export const MAX_PROPERTIES = 6;
export const MAX_CREW = 8;

export interface Suburb {
  id: string;
  name: string;
  factor: number;
  blurb: string;
}

export const SUBURBS: Suburb[] = [
  { id: "ironbark", name: "Ironbark Flats", factor: 0.72, blurb: "Wide blocks on the edge of town: cheap land, modest rents." },
  { id: "saltmarsh", name: "Saltmarsh", factor: 0.86, blurb: "A quiet bayside suburb on the way up." },
  { id: "wattle", name: "Wattle Grove", factor: 1, blurb: "Leafy streets, good schools and families." },
  { id: "kestrel", name: "Kestrel Park", factor: 1.18, blurb: "Close to the station and the shops." },
  { id: "bellevue", name: "Bellevue Rise", factor: 1.38, blurb: "On the hill with views: buyers pay for a good finish." },
  { id: "harbour", name: "Harbour Heights", factor: 1.7, blurb: "The dearest streets in the city." },
];

export const suburb = (id: string) => SUBURBS.find((s) => s.id === id) ?? SUBURBS[2];

export type Role = "labourer" | "bricklayer" | "carpenter" | "foreman";

export const ROLES: Record<Role, { name: string; icon: string; wage: number; speed: number; blurb: string }> = {
  labourer: { name: "Labourer", icon: "🦺", wage: 260, speed: 0.35, blurb: "Mixes the mortar, carries the bricks, cleans up." },
  bricklayer: { name: "Bricklayer", icon: "🧱", wage: 420, speed: 0.7, blurb: "Lays brick, block and stone." },
  carpenter: { name: "Carpenter", icon: "🪚", wage: 400, speed: 0.6, blurb: "Frames, floors, stairs and roofs." },
  foreman: { name: "Site foreman", icon: "📋", wage: 520, speed: 0.45, blurb: "Runs the site: everyone works a bit faster, and clients notice." },
};

export interface Worker {
  id: number;
  name: string;
  role: Role;
  /** 1 to 3. */
  skill: number;
  wage: number;
}

export interface Contract {
  id: number;
  tpl: string;
  title: string;
  client: string;
  icon: string;
  suburb: string;
  brief: string;
  needs: Need[];
  zone: [number, number, number, number];
  /** Materials, as your estimator prices them. */
  est: number;
  /** One builder's labour, in minutes. */
  labour: number;
  /** A fair price: materials and labour with a margin. */
  fair: number;
  /** The most the client will pay. */
  max: number;
  /** Working days on site. */
  days: number;
  /** Damages per day late. */
  ld: number;
  rivals: number;
  posted: number;
  expires: number;
  /** Reputation needed to be asked to tender. */
  rep: number;
}

export interface Active {
  id: number;
  c: Contract;
  price: number;
  deposit: number;
  started: number;
}

export interface Listing {
  id: number;
  suburb: string;
  /** The block's buildable area (the pegged-out zone), and the whole block's land in m². */
  w: number;
  d: number;
  land: number;
  price: number;
  expires: number;
}

export type PropStatus = "building" | "vacant" | "rented";

export interface Property {
  id: number;
  suburb: string;
  w: number;
  d: number;
  land: number;
  paid: number;
  bought: number;
  status: PropStatus;
  /** What's built on it (measured when you last left the site), and what's gone into it. */
  a: Assessment | null;
  spent: number;
  rent: number;
  tenant: string | null;
}

export interface LogLine {
  day: number;
  text: string;
  kind: "good" | "bad" | "tip" | "money";
}

export interface Company {
  v: 1;
  name: string;
  cash: number;
  rep: number;
  day: number;
  market: number;
  seed: number;
  nextId: number;
  crew: Worker[];
  hires: Worker[];
  board: Contract[];
  active: Active[];
  listings: Listing[];
  props: Property[];
  loan: number;
  /** Retentions waiting to be released. */
  held: { amount: number; day: number; title: string }[];
  log: LogLine[];
  history: { day: number; worth: number }[];
  stats: { contracts: number; lost: number; earned: number; sold: number; rentIncome: number; best: number };
}

/* ------------------------------------------------------------------ chance */

function rand(co: Company) {
  // Mulberry32, its state kept in the company so a save carries on the same way.
  let t = (co.seed = (co.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (co: Company, a: number, b: number) => a + (b - a) * rand(co);
const pick = <T,>(co: Company, xs: T[]) => xs[Math.floor(rand(co) * xs.length)];
const round = (n: number, to: number) => Math.round(n / to) * to;

const FIRST = ["Ava", "Noah", "Mia", "Leo", "Isla", "Jack", "Zara", "Theo", "Ruby", "Omar", "Priya", "Sam", "Nina", "Kai", "Ellie", "Tom", "Aisha", "Finn", "Lena", "Raj", "Grace", "Hugo", "Maya", "Ben"];
const LAST = ["Okafor", "Marsh", "Lindqvist", "Patel", "Romano", "Byrne", "Nguyen", "Kowalski", "Haddad", "Fraser", "Moreau", "Tanaka", "Santos", "Whitlock", "Abbott", "Kerr", "Delaney", "Osei", "Varga", "Holm"];
const FIRMS = ["Harlow Holdings", "Bayline Developments", "Greenfield Schools", "Northgate Church", "Coastal Rentals", "Riverbend Medical", "Summit Childcare", "Oakmere Council"];

function person(co: Company) {
  return `${pick(co, FIRST)} ${pick(co, LAST)}`;
}

function client(co: Company, big: boolean) {
  const r = rand(co);
  if (big && r < 0.3) return pick(co, FIRMS);
  if (r < 0.55) return `${pick(co, ["Mr", "Ms", "Dr", "Mrs"])} ${pick(co, LAST)}`;
  return `The ${pick(co, LAST)} family`;
}

/* ------------------------------------------------------------------ contracts */

interface Draft {
  title: string;
  icon: string;
  brief: string;
  needs: Need[];
  /** Half-width and half-depth of the zone. */
  hw: number;
  hd: number;
  est: number;
  labour: number;
}

/** A brick wall's materials and labour, per square metre of face (half a brick thick). */
const WALL_M2 = { cost: 62, labour: 65 };

const TEMPLATES: { id: string; rep: number; weight: number; big?: boolean; make: (co: Company) => Draft }[] = [
  {
    id: "wall",
    rep: 0,
    weight: 3,
    make: (co) => {
      const len = round(between(co, 4, 9), 0.45);
      const h = pick(co, [0.6, 0.9, 1.2]);
      const a = len * h;
      return { title: `A ${len.toFixed(1)} m garden wall`, icon: "🧱", brief: `A brick wall ${len.toFixed(2)} m long and ${Math.round(h * 1000)} mm high, well bonded.`, needs: [{ k: "wall", len, h }, { k: "bond", min: 0.85 }], hw: len / 2 + 1.2, hd: 1.6, est: a * WALL_M2.cost + len * 40, labour: a * WALL_M2.labour + 60 };
    },
  },
  {
    id: "planter",
    rep: 0,
    weight: 2,
    make: (co) => {
      const w = round(between(co, 1.8, 3.2), 0.45);
      const d = round(between(co, 0.9, 1.6), 0.45);
      const h = pick(co, [0.45, 0.6]);
      const a = 2 * (w + d) * h;
      return { title: "A raised planter", icon: "🌿", brief: `Brick walls round a bed at least ${w.toFixed(2)} by ${d.toFixed(2)} m, ${Math.round(h * 1000)} mm high.`, needs: [{ k: "enclosed", w, d, h }, { k: "bond", min: 0.85 }], hw: w / 2 + 1.2, hd: d / 2 + 1.2, est: a * WALL_M2.cost, labour: a * WALL_M2.labour + 30 };
    },
  },
  {
    id: "patio",
    rep: 0,
    weight: 3,
    make: (co) => {
      const area = Math.round(between(co, 8, 26));
      const side = Math.sqrt(area);
      return { title: `A ${area} m² paved patio`, icon: "▦", brief: `Clay pavers over at least ${area} m², in any pattern.`, needs: [{ k: "paved", area }], hw: side * 0.75 + 1, hd: side * 0.75 + 1, est: area * 46, labour: area * 16 };
    },
  },
  {
    id: "fence",
    rep: 0,
    weight: 2,
    make: (co) => {
      const len = Math.round(between(co, 8, 20));
      return { title: `${len} m of paling fence`, icon: "┇", brief: `A timber paling fence at least ${len} m long, on posts.`, needs: [{ k: "fence", len }, { k: "count", of: "post", n: Math.ceil(len / 2.4) + 1, label: "Posts" }], hw: len / 2 + 1, hd: 1.5, est: len * 46, labour: len * 32 };
    },
  },
  {
    id: "shed",
    rep: 12,
    weight: 2,
    make: (co) => {
      const area = Math.round(between(co, 5, 9));
      return { title: "A garden shed", icon: "🛖", brief: `A timber-framed shed on a slab of at least ${area} m², a dozen studs, a door, and a roof over it.`, needs: [{ k: "slab", area }, { k: "count", of: "stud", n: 12, label: "Studs in the frame" }, { k: "count", of: "door", n: 1, label: "A door" }, { k: "roof", cover: 0.85 }], hw: 4, hd: 4, est: 950 + area * 270, labour: 900 + area * 110 };
    },
  },
  {
    id: "deck",
    rep: 12,
    weight: 2,
    make: (co) => {
      const area = Math.round(between(co, 10, 24));
      const side = Math.sqrt(area);
      return { title: `A ${area} m² timber deck`, icon: "▤", brief: `Floorboards over joists, at least ${area} m² of deck, with stairs if it's off the ground.`, needs: [{ k: "deck", area }], hw: side * 0.75 + 1.2, hd: side * 0.75 + 1.2, est: area * 110, labour: area * 55 };
    },
  },
  {
    id: "carport",
    rep: 20,
    weight: 2,
    make: (co) => {
      const area = Math.round(between(co, 15, 22));
      return { title: "A carport", icon: "🚙", brief: `A slab of at least ${area} m² with four posts or more and a roof over it.`, needs: [{ k: "slab", area }, { k: "count", of: "post", n: 4, label: "Posts" }, { k: "roof", cover: 0.8 }], hw: 4, hd: 4.5, est: area * 150 + 400, labour: area * 70 + 600 };
    },
  },
  {
    id: "garage",
    rep: 30,
    weight: 2,
    big: true,
    make: (co) => {
      const w = round(between(co, 3, 3.6), 0.225);
      const d = round(between(co, 5.4, 6.3), 0.225);
      const a = 2 * (w + d) * 2.4;
      return { title: "A brick garage", icon: "🚗", brief: `Brick walls round at least ${w.toFixed(2)} × ${d.toFixed(2)} m, 2.4 m high, on footings, with a door, roofed over.`, needs: [{ k: "enclosed", w, d, h: 2.4 }, { k: "footings", min: 0.9 }, { k: "count", of: "door", n: 1, label: "A door" }, { k: "roof", cover: 0.9 }, { k: "bond", min: 0.85 }], hw: d / 2 + 1.5, hd: d / 2 + 1.5, est: a * WALL_M2.cost + w * d * 120 + 1800, labour: a * WALL_M2.labour + w * d * 60 };
    },
  },
  {
    id: "flat",
    rep: 45,
    weight: 2,
    big: true,
    make: (co) => {
      const w = round(between(co, 6, 7.2), 0.225);
      const d = round(between(co, 4.5, 5.4), 0.225);
      const a = 2 * (w + d) * 2.5;
      return { title: "A granny flat", icon: "🏘️", brief: `A small brick dwelling round at least ${w.toFixed(1)} × ${d.toFixed(1)} m, 2.5 m high, on footings and a slab, with two windows and a door, roofed.`, needs: [{ k: "enclosed", w, d, h: 2.5 }, { k: "footings", min: 0.9 }, { k: "slab", area: Math.floor(w * d * 0.9) }, { k: "count", of: "window", n: 2, label: "Windows" }, { k: "count", of: "door", n: 1, label: "A door" }, { k: "roof", cover: 0.9 }, { k: "bond", min: 0.85 }], hw: w / 2 + 1.5, hd: d / 2 + 1.5, est: a * WALL_M2.cost + w * d * 150 + 1700, labour: a * WALL_M2.labour + w * d * 70 + 300 };
    },
  },
  {
    id: "bungalow",
    rep: 60,
    weight: 2,
    big: true,
    make: (co) => {
      const w = round(between(co, 8, 10), 0.225);
      const d = round(between(co, 6, 7.4), 0.225);
      const a = 2 * (w + d) * 2.5;
      return { title: "A brick bungalow", icon: "🏠", brief: `A single-storey house round at least ${w.toFixed(1)} × ${d.toFixed(1)} m, 2.5 m high, on footings and a slab, four windows and two doors, under a roof.`, needs: [{ k: "enclosed", w, d, h: 2.5 }, { k: "footings", min: 0.9 }, { k: "slab", area: Math.floor(w * d * 0.9) }, { k: "count", of: "window", n: 4, label: "Windows" }, { k: "count", of: "door", n: 2, label: "Doors" }, { k: "roof", cover: 0.9 }, { k: "bond", min: 0.85 }], hw: w / 2 + 1.6, hd: d / 2 + 1.6, est: a * WALL_M2.cost + w * d * 150 + 3600, labour: a * WALL_M2.labour + w * d * 70 + 600 };
    },
  },
  {
    id: "two-storey",
    rep: 75,
    weight: 1,
    big: true,
    make: (co) => {
      const w = round(between(co, 7, 9), 0.225);
      const d = round(between(co, 6, 7), 0.225);
      const a = 2 * (w + d) * 5.1;
      return { title: "A two-storey house", icon: "🏡", brief: `A two-storey brick house round at least ${w.toFixed(1)} × ${d.toFixed(1)} m and 5.1 m high, on footings, six windows and a front door, under a roof.`, needs: [{ k: "enclosed", w, d, h: 5.1 }, { k: "footings", min: 0.9 }, { k: "count", of: "window", n: 6, label: "Windows" }, { k: "count", of: "door", n: 1, label: "A front door" }, { k: "roof", cover: 0.9 }, { k: "bond", min: 0.85 }], hw: w / 2 + 1.6, hd: d / 2 + 1.6, est: a * WALL_M2.cost + w * d * 200 + 5200, labour: a * WALL_M2.labour + w * d * 110 + 900 };
    },
  },
];

export const templateRep = (id: string) => TEMPLATES.find((t) => t.id === id)?.rep ?? 0;

/** A fresh job on the board: a client, a brief, and what it ought to cost. */
export function makeContract(co: Company): Contract {
  const open = TEMPLATES.filter((t) => t.rep <= co.rep + 8);
  const total = open.reduce((a, t) => a + t.weight, 0);
  let r = rand(co) * total;
  const t = open.find((x) => (r -= x.weight) < 0) ?? open[0];
  const d = t.make(co);
  const sub = pick(co, SUBURBS);
  const est = Math.round(d.est);
  const labour = Math.round(d.labour);
  const fair = round((est + (labour / 540) * LABOUR_RATE) * 1.35 * (0.9 + sub.factor * 0.1), 50);
  const max = round(fair * between(co, 1.15, 1.45), 50);
  // The deadline allows for a small crew on a big job.
  const days = Math.max(1, Math.ceil(labour / 540 / (labour > 2000 ? 1.8 : 1)) + (labour > 1500 ? 2 : 1));
  const hw = Math.min(14, d.hw);
  const hd = Math.min(14, d.hd);
  return {
    id: co.nextId++,
    tpl: t.id,
    title: d.title,
    client: client(co, !!t.big),
    icon: d.icon,
    suburb: sub.id,
    brief: d.brief,
    needs: d.needs,
    zone: [-hw, -hd, hw, hd],
    est,
    labour,
    fair,
    max,
    days,
    ld: Math.max(50, round(fair * 0.012, 10)),
    rivals: 2 + Math.floor(rand(co) * 3),
    posted: co.day,
    expires: co.day + 10 + Math.floor(rand(co) * 8),
    rep: t.rep,
  };
}

/** How the client weighs a bid: a builder with a name gets the benefit of the doubt. */
const effective = (co: Company, price: number) => price * (1 - Math.min(100, co.rep) / 500);

/** Rivals bid between these shares of the fair price. */
const RIVAL_LO = 0.85;
const RIVAL_HI = 1.3;

/** The chance a price wins the tender (0..1). */
export function winChance(co: Company, c: Contract, price: number) {
  if (price > c.max) return 0;
  const e = effective(co, price) / c.fair;
  const beatOne = Math.max(0, Math.min(1, (RIVAL_HI - e) / (RIVAL_HI - RIVAL_LO)));
  return beatOne ** c.rivals;
}

export interface TenderResult {
  won: boolean;
  rivals: number[];
  why: string;
  active?: Active;
}

/** Submit a price. The client opens the bids there and then. */
export function tender(co: Company, id: number, price: number): TenderResult {
  const c = co.board.find((x) => x.id === id);
  if (!c) return { won: false, rivals: [], why: "That job's gone" };
  if (co.active.length >= MAX_ACTIVE) return { won: false, rivals: [], why: `You can only run ${MAX_ACTIVE} jobs at once` };
  co.board = co.board.filter((x) => x.id !== id);
  const rivals = Array.from({ length: c.rivals }, () => round(c.fair * between(co, RIVAL_LO, RIVAL_HI), 50)).sort((a, b) => a - b);
  if (price > c.max) {
    co.stats.lost++;
    note(co, `${c.client} said your ${money(price)} for ${c.title.toLowerCase()} was more than they could spend.`, "bad");
    return { won: false, rivals, why: "Over the client's budget" };
  }
  const eff = effective(co, price);
  if (rivals.some((r) => r <= eff)) {
    co.stats.lost++;
    note(co, `Lost ${c.title.toLowerCase()} to a bid of ${money(rivals[0])}.`, "bad");
    return { won: false, rivals, why: `Another builder came in at ${money(rivals[0])}` };
  }
  const deposit = round(price * 0.1, 10);
  const a: Active = { id: c.id, c, price, deposit, started: co.day };
  co.active.push(a);
  co.cash += deposit;
  note(co, `Won ${c.title.toLowerCase()} for ${c.client} at ${money(price)}. Deposit of ${money(deposit)} in.`, "good");
  return { won: true, rivals, why: "Your bid won", active: a };
}

/** The contract as a brief for the inspector: the materials budget is your estimate plus a quarter. */
export function contractJob(a: Active): Job {
  const c = a.c;
  return { id: `c${a.id}`, title: c.title, client: c.client, brief: c.brief, zone: c.zone, budget: Math.round(c.est * 1.25), fee: a.price, days: c.days, needs: c.needs, icon: c.icon };
}

export interface Settlement {
  paid: number;
  damages: number;
  bonus: number;
  retention: number;
  rep: number;
}

/** Hand over a finished contract: the balance, less damages and the retention, and the reputation it earns. */
export function settle(co: Company, id: number, r: Report): Settlement | null {
  const a = co.active.find((x) => x.id === id);
  if (!a || !r.passed) return null;
  const late = Math.max(0, r.days - a.c.days);
  const damages = Math.min(a.price * 0.3, late * a.c.ld);
  const bonus = r.stars >= 4.5 ? round(a.price * 0.03, 10) : 0;
  const retention = round(a.price * 0.05, 10);
  const paid = Math.max(0, a.price - a.deposit - damages + bonus - retention);
  co.cash += paid;
  co.held.push({ amount: retention, day: co.day + 28, title: a.c.title });
  const dRep = Math.round((r.stars - 2.5) * 3 + (late ? -3 : 1));
  co.rep = Math.max(0, Math.min(100, co.rep + dRep));
  co.active = co.active.filter((x) => x.id !== id);
  co.stats.contracts++;
  co.stats.earned += paid + a.deposit;
  note(co, `${a.c.client} paid ${money(paid)} for ${a.c.title.toLowerCase()}${damages ? ` (less ${money(damages)} for ${late} days late)` : ""}. ${money(retention)} held for four weeks.`, "money");
  return { paid, damages, bonus, retention, rep: dRep };
}

/** Walk away from a contract: the deposit goes back, and word gets round. */
export function abandon(co: Company, id: number) {
  const a = co.active.find((x) => x.id === id);
  if (!a) return false;
  co.cash -= a.deposit;
  co.rep = Math.max(0, co.rep - 10);
  co.active = co.active.filter((x) => x.id !== id);
  note(co, `Walked off ${a.c.title.toLowerCase()}. ${a.c.client} won't be recommending you.`, "bad");
  return true;
}

/* ------------------------------------------------------------------ land and property */

const PLOTS = [
  { w: 10, d: 8, land: 420, name: "a compact block" },
  { w: 13, d: 10, land: 560, name: "a family block" },
  { w: 16, d: 12, land: 720, name: "a wide block" },
  { w: 20, d: 14, land: 900, name: "a large corner block" },
];

export function makeListing(co: Company): Listing {
  const s = pick(co, SUBURBS);
  const p = pick(co, PLOTS);
  return { id: co.nextId++, suburb: s.id, w: p.w, d: p.d, land: p.land, price: round(p.land * LAND_RATE * s.factor * co.market * between(co, 0.9, 1.1), 500), expires: co.day + 14 + Math.floor(rand(co) * 14) };
}

export const plotName = (l: { land: number }) => PLOTS.find((p) => p.land === l.land)?.name ?? "a block";
export const zoneOf = (p: { w: number; d: number }): [number, number, number, number] => [-p.w / 2, -p.d / 2, p.w / 2, p.d / 2];

/** Stamp duty on land. */
export const duty = (price: number) => Math.round(price * 0.04);

export function buy(co: Company, id: number): Property | string {
  const l = co.listings.find((x) => x.id === id);
  if (!l) return "That block's sold";
  if (co.props.length >= MAX_PROPERTIES) return `You can hold ${MAX_PROPERTIES} properties at once`;
  const cost = l.price + duty(l.price);
  if (co.cash < cost) return `You need ${money(cost)} with the stamp duty`;
  co.cash -= cost;
  co.listings = co.listings.filter((x) => x.id !== id);
  const p: Property = { id: l.id, suburb: l.suburb, w: l.w, d: l.d, land: l.land, paid: cost, bought: co.day, status: "building", a: null, spent: 0, rent: 0, tenant: null };
  co.props.push(p);
  note(co, `Bought ${plotName(l)} in ${suburb(l.suburb).name} for ${money(l.price)}.`, "money");
  return p;
}

export interface Valuation {
  land: number;
  building: number;
  total: number;
  rent: number;
}

/** What a property's worth today: the land at the market, and what's on it. */
export function valuation(co: Company, p: Property): Valuation {
  const s = suburb(p.suburb);
  const land = p.land * LAND_RATE * s.factor * co.market;
  const a = p.a;
  let building = 0;
  if (a?.finished) {
    const light = a.windows >= Math.max(1, a.floor / 16) ? 1 : 0.88;
    building = a.floor * BUILD_RATE * Math.sqrt(s.factor) * (0.72 + 0.36 * a.quality) * light * co.market;
    building += (a.garage ? 9000 : 0) + a.solar * 900 + a.paved * 70 + a.fence * 110 + a.deck * 260 + (a.gutters ? 1500 : 0);
  } else if (a) {
    // Half-built: worth some of what went into it, and the extras.
    building = p.spent * 0.45 + a.paved * 40 + a.fence * 60;
  }
  const total = Math.round(land + building);
  const rent = a?.finished ? Math.round((total * 0.045) / 52) : 0;
  return { land: Math.round(land), building: Math.round(building), total, rent };
}

/** Record what's been built on a property when you leave its site. */
export function survey(p: Property, a: Assessment, spent: number) {
  p.a = a;
  p.spent = spent;
  if (p.status === "building" && a.finished) p.status = "vacant";
}

/** Sell at auction: the hammer falls somewhere round the valuation; the agent takes 2%. */
export function sell(co: Company, id: number) {
  const p = co.props.find((x) => x.id === id);
  if (!p) return null;
  const v = valuation(co, p);
  const hammer = round(v.total * between(co, 0.94, 1.08), 500);
  const net = Math.round(hammer * 0.98);
  co.cash += net;
  co.props = co.props.filter((x) => x.id !== id);
  co.stats.sold++;
  const profit = net - p.paid - p.spent;
  co.stats.best = Math.max(co.stats.best, profit);
  note(co, `Sold your ${plotName(p)} in ${suburb(p.suburb).name} at auction for ${money(hammer)} (${profit >= 0 ? "a profit" : "a loss"} of ${money(Math.abs(profit))}).`, profit >= 0 ? "money" : "bad");
  return { hammer, net, profit };
}

export function rentOut(co: Company, id: number) {
  const p = co.props.find((x) => x.id === id);
  if (!p || !p.a?.finished || p.status === "rented") return false;
  const v = valuation(co, p);
  p.status = "rented";
  p.rent = round(v.rent * between(co, 0.95, 1.05), 5);
  p.tenant = person(co);
  note(co, `${p.tenant} signed a lease in ${suburb(p.suburb).name} at ${money(p.rent)} a week.`, "good");
  return true;
}

export function endLease(co: Company, id: number) {
  const p = co.props.find((x) => x.id === id);
  if (!p || p.status !== "rented") return false;
  p.status = "vacant";
  p.tenant = null;
  p.rent = 0;
  return true;
}

/* ------------------------------------------------------------------ crew and bank */

export function makeWorker(co: Company): Worker {
  const role = pick(co, ["labourer", "labourer", "bricklayer", "bricklayer", "carpenter", "foreman"] as Role[]);
  const skill = 1 + Math.floor(rand(co) * 3);
  return { id: co.nextId++, name: person(co), role, skill, wage: round(ROLES[role].wage * (0.85 + skill * 0.15), 5) };
}

/** How many builders' worth of work the crew gets through (you count as one). */
export function crewSpeed(co: Company) {
  const base = 1 + co.crew.reduce((a, w) => a + ROLES[w.role].speed * (0.8 + w.skill * 0.2), 0);
  const foreman = co.crew.some((w) => w.role === "foreman") ? 1.1 : 1;
  return Math.round(base * foreman * 100) / 100;
}

export const wages = (co: Company) => co.crew.reduce((a, w) => a + w.wage, 0);

export function hire(co: Company, id: number) {
  const w = co.hires.find((x) => x.id === id);
  if (!w || co.crew.length >= MAX_CREW) return false;
  co.hires = co.hires.filter((x) => x.id !== id);
  co.crew.push(w);
  note(co, `${w.name} joined as a ${ROLES[w.role].name.toLowerCase()}.`, "good");
  return true;
}

/** Let someone go, with a week's pay. */
export function fire(co: Company, id: number) {
  const w = co.crew.find((x) => x.id === id);
  if (!w) return false;
  co.cash -= w.wage * 5;
  co.crew = co.crew.filter((x) => x.id !== id);
  note(co, `${w.name} left with a week's pay.`, "tip");
  return true;
}

export const worth = (co: Company) => Math.round(co.cash + co.props.reduce((a, p) => a + valuation(co, p).total, 0) + co.held.reduce((a, h) => a + h.amount, 0) - co.loan);

/** The bank lends against your property, your name and a little on trust. */
export const loanLimit = (co: Company) => round(25_000 + co.rep * 400 + co.props.reduce((a, p) => a + valuation(co, p).total, 0) * 0.65, 1000);
export const RATE = 0.075;

export function borrow(co: Company, amount: number) {
  const room = loanLimit(co) - co.loan;
  const n = Math.min(amount, room);
  if (n <= 0) return 0;
  co.loan += n;
  co.cash += n;
  note(co, `Borrowed ${money(n)} at ${(RATE * 100).toFixed(1)}%.`, "money");
  return n;
}

export function repay(co: Company, amount: number) {
  const n = Math.min(amount, co.loan, Math.max(0, co.cash));
  if (n <= 0) return 0;
  co.loan -= n;
  co.cash -= n;
  return n;
}

/* ------------------------------------------------------------------ time */

/**
 * Time passes: wages for each day worked, and every seventh day the week's business: rent in,
 * interest out, the market moves, retentions come back, and the boards fill up again.
 */
export function advance(co: Company, days: number, worked: boolean) {
  for (let i = 0; i < days; i++) {
    if (worked) co.cash -= wages(co);
    co.day++;
    if (co.day % 7 === 0) week(co);
  }
}

function week(co: Company) {
  for (const p of co.props) {
    if (p.status !== "rented") continue;
    co.cash += p.rent;
    co.stats.rentIncome += p.rent;
    const r = rand(co);
    if (r < 0.03) {
      note(co, `${p.tenant} moved out of your place in ${suburb(p.suburb).name}.`, "tip");
      endLease(co, p.id);
    } else if (r < 0.08) {
      const fix = round(between(co, 250, 1600), 10);
      co.cash -= fix;
      note(co, `A repair at your rental in ${suburb(p.suburb).name}: ${money(fix)}.`, "bad");
    }
  }
  if (co.loan > 0) co.cash -= Math.round((co.loan * RATE) / 52);
  if (co.cash < 0) {
    co.cash -= Math.round(-co.cash * 0.003);
    note(co, "You're overdrawn: the bank's charging interest on it.", "bad");
  }
  // The market drifts, with a slight upward lean.
  co.market = Math.max(0.75, Math.min(1.45, co.market * Math.exp(between(co, -0.022, 0.026))));
  for (const h of co.held.filter((x) => x.day <= co.day)) {
    co.cash += h.amount;
    note(co, `Retention of ${money(h.amount)} released on ${h.title.toLowerCase()}.`, "money");
  }
  co.held = co.held.filter((x) => x.day > co.day);
  refill(co);
  co.history.push({ day: co.day, worth: worth(co) });
  if (co.history.length > 104) co.history.shift();
}

/** Keep the boards stocked: contracts, land for sale and builders looking for work. */
export function refill(co: Company) {
  co.board = co.board.filter((c) => c.expires > co.day);
  while (co.board.length < 6) co.board.push(makeContract(co));
  co.listings = co.listings.filter((l) => l.expires > co.day);
  while (co.listings.length < 4) co.listings.push(makeListing(co));
  if (co.day % 7 === 0 || co.hires.length < 3) {
    co.hires = [];
    while (co.hires.length < 3) co.hires.push(makeWorker(co));
  }
}

function note(co: Company, text: string, kind: LogLine["kind"]) {
  co.log.unshift({ day: co.day, text, kind });
  if (co.log.length > 60) co.log.pop();
}

export const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;

/* ------------------------------------------------------------------ the company */

export function newCompany(name: string, seed = Math.floor(Math.random() * 2 ** 31)): Company {
  const co: Company = {
    v: 1,
    name: name.trim() || "Groundwork & Co.",
    cash: START_CASH,
    rep: 20,
    day: 1,
    market: 1,
    seed,
    nextId: 1,
    crew: [],
    hires: [],
    board: [],
    active: [],
    listings: [],
    props: [],
    loan: 0,
    held: [],
    log: [],
    history: [],
    stats: { contracts: 0, lost: 0, earned: 0, sold: 0, rentIncome: 0, best: 0 },
  };
  refill(co);
  co.history.push({ day: 1, worth: worth(co) });
  note(co, `${co.name} opens for business with ${money(START_CASH)} in the bank.`, "tip");
  return co;
}

export function loadCompany(raw: string | null): Company | null {
  if (!raw) return null;
  try {
    const co = JSON.parse(raw) as Company;
    return co && co.v === 1 && Array.isArray(co.board) ? co : null;
  } catch {
    return null;
  }
}
