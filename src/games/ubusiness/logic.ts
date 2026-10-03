import { createRng, type Rng } from "../engine/rng";

/**
 * UBusiness: run a store. The rules, as plain data and functions (no three.js),
 * so they can be tested: products and licences, fixtures, the stockroom and
 * deliveries, prices and what customers will pay, staff, the till and change,
 * the day's books, levels, and the difference between the Lite and Ultimate
 * editions. All money is in whole cents.
 */

export type Tier = "lite" | "ultimate";

// -------------------------------------------------------------- categories

export type Category = "grocery" | "snacks" | "household" | "fresh" | "pharmacy" | "toys" | "fashion" | "electronics";

export interface CategoryInfo {
  name: string;
  /** Licence fee (cents). Grocery comes with the store. */
  licence: number;
  /** Store level needed to buy the licence. */
  level: number;
  /** Ultimate edition only. */
  ultimate: boolean;
  icon: string;
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  grocery: { name: "Grocery", licence: 0, level: 1, ultimate: false, icon: "🥫" },
  snacks: { name: "Snacks & Drinks", licence: 40_000, level: 1, ultimate: false, icon: "🥤" },
  household: { name: "Household", licence: 90_000, level: 2, ultimate: false, icon: "🧻" },
  fresh: { name: "Fresh & Dairy", licence: 150_000, level: 3, ultimate: false, icon: "🍎" },
  pharmacy: { name: "Health & Beauty", licence: 300_000, level: 4, ultimate: true, icon: "💊" },
  toys: { name: "Toys & Games", licence: 400_000, level: 5, ultimate: true, icon: "🧸" },
  fashion: { name: "Fashion", licence: 600_000, level: 6, ultimate: true, icon: "👕" },
  electronics: { name: "Electronics", licence: 900_000, level: 7, ultimate: true, icon: "🎧" },
};
export const CATEGORY_IDS = Object.keys(CATEGORIES) as Category[];

// ---------------------------------------------------------------- products

export type FixtureKind = "shelf" | "fridge" | "produce" | "rack" | "display" | "checkout" | "selfCheckout" | "plant" | "promo";
export type Shape = "box" | "bottle" | "can" | "bag" | "jar" | "fruit" | "carton" | "device" | "garment" | "toy" | "roll";

export interface Product {
  name: string;
  brand: string;
  cat: Category;
  /** What it's sold from. */
  fixture: "shelf" | "fridge" | "produce" | "rack" | "display";
  /** Wholesale cost per unit (cents). */
  cost: number;
  /** What it usually sells for (cents): customers judge your price against this. */
  market: number;
  /** Units in a delivery box. */
  box: number;
  /** Units one shelf slot holds. */
  slot: number;
  shape: Shape;
  /** Packaging colours. */
  color: string;
  accent: string;
  /** Size of one unit (m): w, h, d. */
  size: [number, number, number];
  /** How often it's on someone's list (1 = average). */
  demand: number;
}

const P = (name: string, brand: string, cat: Category, fixture: Product["fixture"], cost: number, market: number, box: number, slot: number, shape: Shape, color: string, accent: string, size: [number, number, number], demand = 1): Product => ({ name, brand, cat, fixture, cost, market, box, slot, shape, color, accent, size, demand });

export const PRODUCTS = {
  // Grocery
  bread: P("Sourdough Loaf", "Hearthstone", "grocery", "shelf", 180, 449, 12, 12, "bag", "#d6a565", "#7c2d12", [0.26, 0.12, 0.12], 1.6),
  pasta: P("Spaghetti 500g", "Bellarosa", "grocery", "shelf", 90, 249, 20, 24, "box", "#1d4ed8", "#facc15", [0.07, 0.26, 0.04], 1.1),
  rice: P("Long Grain Rice 1kg", "Paddyfield", "grocery", "shelf", 140, 349, 16, 16, "bag", "#f5f5f4", "#15803d", [0.14, 0.22, 0.06], 0.9),
  cereal: P("Honey Oat Crunch", "Morning Field", "grocery", "shelf", 210, 549, 12, 12, "box", "#f59e0b", "#b91c1c", [0.19, 0.28, 0.07], 1.2),
  soup: P("Tomato Soup", "Kettle & Co", "grocery", "shelf", 70, 199, 24, 30, "can", "#dc2626", "#fef3c7", [0.075, 0.11, 0.075], 1),
  coffee: P("Ground Coffee 250g", "Darkroast", "grocery", "shelf", 380, 899, 12, 14, "bag", "#292524", "#d97706", [0.1, 0.2, 0.07], 1),
  peanut: P("Smooth Peanut Butter", "Nutcrest", "grocery", "shelf", 160, 429, 12, 20, "jar", "#a16207", "#fde68a", [0.09, 0.12, 0.09], 0.8),
  oil: P("Olive Oil 750ml", "Verdolio", "grocery", "shelf", 420, 999, 12, 12, "bottle", "#4d7c0f", "#fef9c3", [0.07, 0.3, 0.07], 0.7),
  // Snacks & drinks
  chips: P("Sea Salt Crisps", "Crispwell", "snacks", "shelf", 110, 329, 20, 16, "bag", "#2563eb", "#facc15", [0.2, 0.28, 0.08], 1.5),
  choc: P("Milk Chocolate Bar", "Velvetine", "snacks", "shelf", 60, 199, 40, 40, "box", "#6b21a8", "#f5f5f4", [0.16, 0.02, 0.07], 1.4),
  cola: P("Cola 2L", "Fizzo", "snacks", "shelf", 110, 299, 8, 12, "bottle", "#b91c1c", "#f5f5f4", [0.11, 0.33, 0.11], 1.4),
  water: P("Spring Water 6-pack", "Clearpeak", "snacks", "shelf", 160, 449, 6, 8, "box", "#7dd3fc", "#0369a1", [0.2, 0.24, 0.13], 1.1),
  energy: P("Volt Energy Drink", "Zapp", "snacks", "shelf", 90, 279, 24, 30, "can", "#16a34a", "#000000", [0.066, 0.16, 0.066], 1),
  cookies: P("Choc Chip Cookies", "Grandma Bea's", "snacks", "shelf", 120, 349, 16, 18, "box", "#92400e", "#fef3c7", [0.2, 0.06, 0.08], 1.1),
  gummies: P("Fruit Gummies", "Wobbles", "snacks", "shelf", 70, 229, 24, 24, "bag", "#ec4899", "#fde047", [0.15, 0.2, 0.04], 0.9),
  // Household
  loo: P("Toilet Roll 12-pack", "Cloudsoft", "household", "shelf", 380, 899, 6, 6, "roll", "#f8fafc", "#38bdf8", [0.3, 0.25, 0.2], 1.2),
  detergent: P("Laundry Liquid 2L", "Brightwash", "household", "shelf", 450, 1099, 8, 8, "bottle", "#f97316", "#1e3a8a", [0.15, 0.28, 0.1], 0.8),
  dishsoap: P("Dish Soap", "Sparkle", "household", "shelf", 110, 299, 18, 20, "bottle", "#22c55e", "#f5f5f4", [0.07, 0.24, 0.05], 0.9),
  towels: P("Paper Towels 4-pack", "Cloudsoft", "household", "shelf", 260, 649, 8, 8, "roll", "#e0f2fe", "#0ea5e9", [0.26, 0.28, 0.13], 0.8),
  sponges: P("Scrub Sponges 5-pack", "Sparkle", "household", "shelf", 90, 279, 20, 24, "box", "#facc15", "#16a34a", [0.15, 0.1, 0.05], 0.6),
  // Fresh & dairy
  apples: P("Red Apples", "Orchard Hill", "fresh", "produce", 35, 99, 40, 60, "fruit", "#dc2626", "#16a34a", [0.08, 0.08, 0.08], 1.5),
  bananas: P("Bananas", "Sunvale", "fresh", "produce", 30, 89, 40, 60, "fruit", "#facc15", "#65a30d", [0.18, 0.04, 0.04], 1.5),
  tomatoes: P("Vine Tomatoes", "Orchard Hill", "fresh", "produce", 40, 119, 40, 60, "fruit", "#ef4444", "#15803d", [0.07, 0.07, 0.07], 1),
  milk: P("Whole Milk 2L", "Northfield Dairy", "fresh", "fridge", 140, 349, 12, 12, "carton", "#f8fafc", "#2563eb", [0.1, 0.26, 0.1], 1.6),
  cheese: P("Aged Cheddar", "Northfield Dairy", "fresh", "fridge", 260, 649, 16, 20, "box", "#fbbf24", "#1e3a8a", [0.12, 0.05, 0.08], 1),
  yoghurt: P("Greek Yoghurt", "Alpwood", "fresh", "fridge", 120, 329, 16, 20, "jar", "#f5f5f4", "#7c3aed", [0.1, 0.09, 0.1], 1),
  eggs: P("Free Range Eggs 12", "Henhouse", "fresh", "fridge", 210, 549, 12, 12, "carton", "#fef3c7", "#a16207", [0.3, 0.07, 0.11], 1.3),
  juice: P("Orange Juice 1L", "Sunvale", "fresh", "fridge", 150, 399, 12, 14, "carton", "#f97316", "#16a34a", [0.08, 0.22, 0.06], 1),
  // Health & beauty
  vitamins: P("Daily Multivitamin", "Kindcare", "pharmacy", "shelf", 420, 1199, 12, 16, "jar", "#f5f5f4", "#0d9488", [0.07, 0.12, 0.07], 0.8),
  painrelief: P("Pain Relief Tablets", "Kindcare", "pharmacy", "shelf", 150, 549, 20, 24, "box", "#f5f5f4", "#dc2626", [0.1, 0.06, 0.03], 0.9),
  bandages: P("Plasters 40-pack", "Mendwell", "pharmacy", "shelf", 110, 399, 20, 24, "box", "#fde68a", "#2563eb", [0.1, 0.08, 0.03], 0.6),
  toothpaste: P("Whitening Toothpaste", "Pearlbright", "pharmacy", "shelf", 120, 399, 24, 24, "box", "#f5f5f4", "#0284c7", [0.2, 0.05, 0.05], 1),
  shampoo: P("Argan Shampoo", "Silkroot", "pharmacy", "shelf", 260, 799, 12, 14, "bottle", "#7c3aed", "#fef3c7", [0.08, 0.24, 0.05], 0.9),
  // Toys & games
  plush: P("Cuddle Bear", "Snugglebuds", "toys", "shelf", 600, 1999, 6, 6, "toy", "#a16207", "#fde68a", [0.22, 0.3, 0.18], 0.6),
  blocks: P("Builder Bricks Set", "Brickly", "toys", "shelf", 1500, 3999, 6, 6, "box", "#dc2626", "#facc15", [0.38, 0.26, 0.08], 0.5),
  boardgame: P("Family Board Game", "Meeple Hall", "toys", "shelf", 1200, 2999, 6, 6, "box", "#1d4ed8", "#f5f5f4", [0.3, 0.3, 0.07], 0.4),
  toycar: P("Racer RC Car", "Zoomer", "toys", "shelf", 1400, 3499, 6, 8, "box", "#f97316", "#111827", [0.3, 0.14, 0.15], 0.4),
  // Fashion
  tee: P("Cotton Tee", "Threadline", "fashion", "rack", 500, 1999, 10, 10, "garment", "#f5f5f4", "#111827", [0.5, 0.7, 0.04], 0.7),
  jeans: P("Slim Jeans", "Threadline", "fashion", "rack", 1500, 4999, 8, 8, "garment", "#1e3a8a", "#78350f", [0.45, 1, 0.04], 0.5),
  hoodie: P("Zip Hoodie", "Northpeak", "fashion", "rack", 1800, 5499, 8, 8, "garment", "#4b5563", "#f97316", [0.55, 0.72, 0.05], 0.5),
  sneakers: P("Court Sneakers", "Strideon", "fashion", "rack", 2500, 7999, 6, 6, "box", "#f5f5f4", "#dc2626", [0.33, 0.13, 0.2], 0.4),
  // Electronics
  earbuds: P("Wireless Earbuds", "Voltix", "electronics", "display", 2200, 5999, 6, 8, "box", "#f5f5f4", "#111827", [0.1, 0.13, 0.05], 0.5),
  headphones: P("Studio Headphones", "Voltix", "electronics", "display", 6000, 14999, 4, 4, "device", "#111827", "#ef4444", [0.2, 0.22, 0.09], 0.3),
  phone: P("Nova Smartphone", "Lumen", "electronics", "display", 28000, 64999, 4, 4, "device", "#0f172a", "#38bdf8", [0.08, 0.16, 0.01], 0.2),
  console: P("Game Console", "Pixelforge", "electronics", "display", 30000, 49999, 2, 3, "box", "#111827", "#22d3ee", [0.4, 0.1, 0.3], 0.15),
  speaker: P("Smart Speaker", "Lumen", "electronics", "display", 3500, 8999, 4, 6, "device", "#334155", "#a3e635", [0.12, 0.17, 0.12], 0.3),
} satisfies Record<string, Product>;
export type ProductId = keyof typeof PRODUCTS;
export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];
export const product = (id: ProductId): Product => PRODUCTS[id];

// ---------------------------------------------------------------- fixtures

export interface FixtureDef {
  name: string;
  price: number;
  /** Footprint (m) before rotation: w along x, d along z. */
  w: number;
  d: number;
  /** Product slots (0 for checkouts and decor). */
  slots: number;
  /** Electricity per day (cents). */
  power: number;
  /** Store level needed to buy. */
  level: number;
  ultimate?: boolean;
  /** Raises the store's appeal (decor, promo stands). */
  appeal?: number;
}

export const FIXTURES: Record<FixtureKind, FixtureDef> = {
  shelf: { name: "Shelf Unit", price: 35_000, w: 2, d: 0.6, slots: 4, power: 0, level: 1 },
  fridge: { name: "Glass Fridge", price: 120_000, w: 2, d: 0.8, slots: 4, power: 1_800, level: 3 },
  produce: { name: "Produce Stand", price: 60_000, w: 2, d: 1.1, slots: 4, power: 0, level: 3 },
  rack: { name: "Clothing Rail", price: 50_000, w: 1.6, d: 0.6, slots: 2, power: 0, level: 6, ultimate: true },
  display: { name: "Tech Display", price: 150_000, w: 1.6, d: 0.9, slots: 3, power: 600, level: 7, ultimate: true },
  checkout: { name: "Checkout Counter", price: 90_000, w: 2.2, d: 0.9, slots: 0, power: 300, level: 1 },
  selfCheckout: { name: "Self-Checkout", price: 200_000, w: 0.9, d: 0.7, slots: 0, power: 400, level: 4, ultimate: true },
  plant: { name: "Potted Palm", price: 8_000, w: 0.6, d: 0.6, slots: 0, power: 0, level: 1, appeal: 1 },
  promo: { name: "Promo Stand", price: 25_000, w: 1, d: 0.6, slots: 0, power: 200, level: 2, appeal: 3 },
};
export const FIXTURE_IDS = Object.keys(FIXTURES) as FixtureKind[];

// ----------------------------------------------------------------- editions

export interface Edition {
  name: string;
  categories: Category[];
  /** How many store sizes you can grow to. */
  sizes: number;
  staff: number;
  speeds: number[];
  marketing: boolean;
  express: boolean;
  photoMode: boolean;
  customSign: boolean;
}

export const EDITIONS: Record<Tier, Edition> = {
  lite: { name: "UBusiness Lite", categories: ["grocery", "snacks", "household", "fresh"], sizes: 3, staff: 1, speeds: [1, 2], marketing: false, express: false, photoMode: false, customSign: false },
  ultimate: { name: "UBusiness Ultimate", categories: CATEGORY_IDS, sizes: 6, staff: 6, speeds: [1, 2, 3], marketing: true, express: true, photoMode: true, customSign: true },
};

/** Fixtures this edition can place. */
export const allowedFixture = (tier: Tier, kind: FixtureKind) => tier === "ultimate" || !FIXTURES[kind].ultimate;

// -------------------------------------------------------------------- store

export const SIZES = [
  { name: "Corner Shop", w: 12, d: 10, rent: 15_000, price: 0 },
  { name: "Neighbourhood Store", w: 14, d: 12, rent: 25_000, price: 400_000 },
  { name: "Mini Market", w: 17, d: 13, rent: 40_000, price: 900_000 },
  { name: "Supermarket", w: 20, d: 15, rent: 65_000, price: 1_800_000 },
  { name: "Superstore", w: 24, d: 17, rent: 90_000, price: 3_200_000 },
  { name: "Megastore", w: 28, d: 20, rent: 130_000, price: 5_500_000 },
];

export const STAFF = {
  cashier: { name: "Cashier", wage: 12_000, does: "Runs a checkout" },
  stocker: { name: "Stocker", wage: 10_000, does: "Refills shelves from the stockroom" },
  cleaner: { name: "Cleaner", wage: 8_000, does: "Mops spills and picks up litter" },
} as const;
export type StaffRole = keyof typeof STAFF;

export const MARKETING = {
  flyers: { name: "Leaflet drop", price: 30_000, boost: 0.3, days: 1 },
  radio: { name: "Radio spot", price: 150_000, boost: 0.7, days: 2 },
  billboard: { name: "Billboard", price: 400_000, boost: 1, days: 4 },
} as const;
export type Campaign = keyof typeof MARKETING;

/** Something different about each day (after the first). */
export interface DayEvent {
  name: string;
  icon: string;
  text: string;
  /** Footfall multiplier. */
  footfall?: number;
  /** Demand multipliers by category or product. */
  boost?: Partial<Record<Category | ProductId, number>>;
  /** Wholesale cost multiplier. */
  cost?: number;
  /** Delivery time in game minutes. */
  delivery?: number;
}

export const EVENTS = {
  heatwave: { name: "Heatwave", icon: "☀️", text: "Cold drinks, water and ice cream fly off the shelves.", boost: { cola: 2.2, water: 2.4, energy: 1.8, juice: 1.8, yoghurt: 1.5 }, footfall: 1.05 },
  rain: { name: "Rainy day", icon: "🌧", text: "Fewer people out, but the ones who come in stock up on comfort food.", footfall: 0.75, boost: { soup: 2, coffee: 1.6, choc: 1.5, cookies: 1.5 } },
  payday: { name: "Payday", icon: "💸", text: "Everyone's been paid: more shoppers, and the big-ticket things sell.", footfall: 1.35, boost: { electronics: 1.8, fashion: 1.6, toys: 1.4 } },
  festival: { name: "Street festival", icon: "🎪", text: "Crowds in town: snacks, drinks and toys are in demand.", footfall: 1.25, boost: { snacks: 1.6, toys: 1.8 } },
  health: { name: "Health week", icon: "🩺", text: "The town's on a health kick: fruit, vitamins and toothpaste.", boost: { fresh: 1.4, pharmacy: 1.9 } },
  supplier: { name: "Wholesale sale", icon: "🏷", text: "The wholesaler is 15% off today. Stock up!", cost: 0.85 },
  strike: { name: "Delivery strike", icon: "🚚", text: "Deliveries take three times as long today.", delivery: 90 },
} satisfies Record<string, DayEvent>;
export type EventId = keyof typeof EVENTS;

/** Today's event: none on day 1, then about half the days have one (the same for a given store and day). */
export function eventFor(seed: number, day: number): EventId | null {
  if (day <= 1) return null;
  const r = createRng(seed * 31 + day * 977);
  if (r.next() < 0.45) return null;
  const ids = Object.keys(EVENTS) as EventId[];
  return ids[Math.floor(r.next() * ids.length)];
}

export type GoalKind = "serve" | "revenue" | "sell" | "happy" | "clean";
export interface Goal {
  kind: GoalKind;
  target: number;
  cat?: Category;
  reward: number;
  xp: number;
  done: boolean;
}

export interface Mess {
  id: number;
  kind: "spill" | "litter";
  x: number;
  z: number;
}

/** Most mess the floor can collect before you notice. */
export const MESS_MAX = 12;

/** Opening hours in game minutes after midnight. */
export const OPEN = 8 * 60;
export const CLOSE = 20 * 60;
export const DELIVERY_MIN = 30;
export const EXPRESS_MIN = 5;
/** Levels by lifetime XP. */
export const LEVELS = [0, 400, 1_200, 3_000, 6_000, 10_000, 16_000, 25_000, 38_000, 55_000];

export interface Slot {
  product: ProductId | null;
  qty: number;
}

export interface Fixture {
  id: number;
  kind: FixtureKind;
  /** Centre (m) inside the store: x across, z from the front windows back. */
  x: number;
  z: number;
  /** Quarter turns; 0 faces the front of the store (-z). */
  rot: number;
  slots: Slot[];
}

export interface Staff {
  id: number;
  role: StaffRole;
  name: string;
  /** The checkout a cashier works (fixture id). */
  post?: number;
}

export interface Order {
  product: ProductId;
  units: number;
  /** Game minute (from the start of day 1) it arrives. */
  at: number;
}

export interface DayStats {
  revenue: number;
  cogs: number;
  customers: number;
  /** Customers who left without what they came for, or gave up queueing. */
  unhappy: number;
  items: number;
  /** Sold per product. */
  sold: Partial<Record<ProductId, number>>;
  /** Wrong change given (cents; negative if you short-changed). */
  tillError: number;
  /** Spills and litter cleaned up. */
  cleaned?: number;
}

export interface DayReport extends DayStats {
  day: number;
  rent: number;
  wages: number;
  power: number;
  profit: number;
  xp: number;
  reputation: number;
  /** Goal rewards paid today. */
  goals?: number;
  /** Spent on standing orders for tomorrow. */
  autoOrders?: number;
  event?: EventId | null;
}

export interface Store {
  version: 1;
  tier: Tier;
  name: string;
  sign: string;
  day: number;
  /** Minutes since midnight. */
  minute: number;
  cash: number;
  xp: number;
  reputation: number;
  size: number;
  licences: Category[];
  prices: Partial<Record<ProductId, number>>;
  storage: Partial<Record<ProductId, number>>;
  orders: Order[];
  fixtures: Fixture[];
  staff: Staff[];
  campaign: { kind: Campaign; until: number } | null;
  today: DayStats;
  history: DayReport[];
  nextId: number;
  seed: number;
  /** Today's event. */
  event?: EventId | null;
  goals?: Goal[];
  mess?: Mess[];
  /** Standing orders (Ultimate): keep this many boxes in the stockroom, topped up each morning. */
  auto?: Partial<Record<ProductId, number>>;
}

const freshStats = (): DayStats => ({ revenue: 0, cogs: 0, customers: 0, unhappy: 0, items: 0, sold: {}, tillError: 0, cleaned: 0 });

/** The default shelf price: the market price. */
export const defaultPrice = (id: ProductId) => PRODUCTS[id].market;
export const priceOf = (s: Store, id: ProductId) => s.prices[id] ?? defaultPrice(id);
export const levelOf = (xp: number) => LEVELS.filter((x) => xp >= x).length;
export const sizeOf = (s: Store) => SIZES[s.size];
export const absMinute = (s: Store) => (s.day - 1) * 1440 + s.minute;
export const isOpen = (s: Store) => s.minute >= OPEN && s.minute < CLOSE;

const NAMES = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Jamie", "Taylor", "Robin", "Quinn", "Avery", "Drew"];

/** A new store: a corner shop with two shelves, a till, the grocery licence and some starter stock. */
export function newStore(tier: Tier, name = "Corner Store", seed = 1): Store {
  const s: Store = {
    version: 1,
    tier,
    name: name.slice(0, 24) || "Corner Store",
    sign: "#0f766e",
    day: 1,
    minute: OPEN - 30,
    cash: 300_000,
    xp: 0,
    reputation: 2.5,
    size: 0,
    licences: ["grocery"],
    prices: {},
    storage: { bread: 24, pasta: 40, soup: 48, cereal: 24, rice: 32, coffee: 24, peanut: 24, oil: 24 },
    orders: [],
    fixtures: [],
    staff: [],
    campaign: null,
    today: freshStats(),
    history: [],
    nextId: 1,
    seed,
  };
  place(s, "checkout", 2.2, 2.4, 0, true);
  place(s, "shelf", 6, 5, 0, true);
  place(s, "shelf", 6, 7.6, 2, true);
  (["bread", "pasta", "rice", "cereal"] as ProductId[]).forEach((id, i) => assign(s, s.fixtures[1].id, i, id));
  (["soup", "coffee", "peanut", "oil"] as ProductId[]).forEach((id, i) => assign(s, s.fixtures[2].id, i, id));
  for (const f of s.fixtures) restock(s, f.id);
  s.event = null;
  s.goals = makeGoals(s);
  s.mess = [];
  s.auto = {};
  return s;
}

// ------------------------------------------------------------------ actions

export type Result = { ok: true } | { ok: false; why: string };
const no = (why: string): Result => ({ ok: false, why });
const yes: Result = { ok: true };

const spend = (s: Store, cents: number): Result => {
  if (s.cash < cents) return no("Not enough cash");
  s.cash -= cents;
  return yes;
};

/** Buy a licence to sell a category. */
export function buyLicence(s: Store, cat: Category): Result {
  const c = CATEGORIES[cat];
  if (s.licences.includes(cat)) return no("You already sell that");
  if (!EDITIONS[s.tier].categories.includes(cat)) return no("Ultimate edition only");
  if (levelOf(s.xp) < c.level) return no(`Reach level ${c.level} first`);
  const r = spend(s, c.licence);
  if (r.ok) s.licences.push(cat);
  return r;
}

/** Order boxes from the wholesaler; they arrive in the stockroom later (now if closed). */
export function order(s: Store, id: ProductId, boxes: number, express = false): Result {
  const p = PRODUCTS[id];
  if (!s.licences.includes(p.cat)) return no("You need the licence first");
  if (express && !EDITIONS[s.tier].express) return no("Express delivery is Ultimate only");
  if (!(boxes >= 1 && boxes <= 50)) return no("1 to 50 boxes");
  const units = p.box * Math.floor(boxes);
  const fee = express ? Math.ceil(p.cost * units * 0.1) : 0;
  const r = spend(s, unitCost(s, id) * units + fee);
  if (!r.ok) return r;
  const wait = express ? EXPRESS_MIN : (eventOf(s)?.delivery ?? DELIVERY_MIN);
  s.orders.push({ product: id, units, at: isOpen(s) ? absMinute(s) + wait : absMinute(s) });
  deliver(s);
  return yes;
}

/** Orders that have arrived go into the stockroom. Returns what arrived. */
export function deliver(s: Store): Order[] {
  const now = absMinute(s);
  const due = s.orders.filter((o) => o.at <= now);
  s.orders = s.orders.filter((o) => o.at > now);
  for (const o of due) s.storage[o.product] = (s.storage[o.product] ?? 0) + o.units;
  return due;
}

export const fixtureRect = (f: { kind: FixtureKind; x: number; z: number; rot: number }) => {
  const d = FIXTURES[f.kind];
  const turned = f.rot % 2 === 1;
  const w = turned ? d.d : d.w;
  const dd = turned ? d.w : d.d;
  return { x: f.x - w / 2, z: f.z - dd / 2, w, d: dd };
};

/** Which way each rotation faces: rot 0 faces the front windows (-z), each quarter turn goes clockwise from above. */
export const FACING = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/** Where a shopper stands to use a fixture (in front of it), or a cashier (behind the counter). */
export function accessPoint(f: Fixture, behind = false) {
  const off = FIXTURES[f.kind].d / 2 + 0.55;
  const [dx, dz] = FACING[((f.rot % 4) + 4) % 4];
  const k = behind ? -1 : 1;
  return { x: f.x + dx * off * k, z: f.z + dz * off * k };
}

/** The doorway (front wall, centre) and the stockroom door (back wall, right). */
export const doorOf = (s: Store) => ({ x: sizeOf(s).w / 2, z: 0 });
export const stockroomOf = (s: Store) => ({ x: sizeOf(s).w - 1.5, z: sizeOf(s).d });

/** Can a fixture go here? Inside the walls, clear of the door, others and walkways. */
export function canPlace(s: Store, f: { kind: FixtureKind; x: number; z: number; rot: number }, skip = -1): Result {
  const r = fixtureRect(f);
  const { w, d } = sizeOf(s);
  if (r.x < 0.2 || r.z < 0.2 || r.x + r.w > w - 0.2 || r.z + r.d > d - 0.2) return no("Keep it inside the walls");
  const door = doorOf(s);
  if (r.z < 2.2 && r.x < door.x + 1.6 && r.x + r.w > door.x - 1.6) return no("Keep the entrance clear");
  const back = stockroomOf(s);
  if (r.z + r.d > back.z - 1.6 && r.x + r.w > back.x - 1.2) return no("Keep the stockroom door clear");
  for (const o of s.fixtures) {
    if (o.id === skip) continue;
    const q = fixtureRect(o);
    // A walkway of 0.9 m between fixtures.
    if (r.x < q.x + q.w + 0.9 && q.x < r.x + r.w + 0.9 && r.z < q.z + q.d + 0.9 && q.z < r.z + r.d + 0.9) {
      const touching = r.x < q.x + q.w && q.x < r.x + r.w && r.z < q.z + q.d && q.z < r.z + r.d;
      if (touching) return no("Something's in the way");
      // Back-to-back shelves may touch; anything else needs an aisle.
      const backToBack = o.kind === f.kind && (o.kind === "shelf" || o.kind === "fridge") && (o.rot + 2) % 4 === f.rot % 4;
      if (!backToBack) return no("Leave an aisle (0.9 m)");
    }
  }
  return yes;
}

function place(s: Store, kind: FixtureKind, x: number, z: number, rot: number, free = false): Result & { id?: number } {
  const f = { kind, x, z, rot: ((rot % 4) + 4) % 4 };
  const ok = canPlace(s, f);
  if (!ok.ok) return ok;
  if (!free) {
    const r = spend(s, FIXTURES[kind].price);
    if (!r.ok) return r;
  }
  const id = s.nextId++;
  s.fixtures.push({ id, ...f, slots: Array.from({ length: FIXTURES[kind].slots }, () => ({ product: null, qty: 0 })) });
  return { ok: true, id };
}

/** Buy and place a fixture. */
export function buyFixture(s: Store, kind: FixtureKind, x: number, z: number, rot: number): Result & { id?: number } {
  const d = FIXTURES[kind];
  if (!allowedFixture(s.tier, kind)) return no("Ultimate edition only");
  if (levelOf(s.xp) < d.level) return no(`Reach level ${d.level} first`);
  return place(s, kind, x, z, rot);
}

/** Move a fixture you own. */
export function moveFixture(s: Store, id: number, x: number, z: number, rot: number): Result {
  const f = s.fixtures.find((o) => o.id === id);
  if (!f) return no("No such fixture");
  const ok = canPlace(s, { kind: f.kind, x, z, rot }, id);
  if (!ok.ok) return ok;
  Object.assign(f, { x, z, rot: ((rot % 4) + 4) % 4 });
  return yes;
}

/** Sell a fixture back for 60%; its stock goes to the stockroom. */
export function sellFixture(s: Store, id: number): Result {
  const i = s.fixtures.findIndex((o) => o.id === id);
  if (i < 0) return no("No such fixture");
  const f = s.fixtures[i];
  if (f.kind === "checkout" && s.fixtures.filter((o) => o.kind === "checkout").length === 1) return no("Keep at least one checkout");
  for (const sl of f.slots) if (sl.product && sl.qty) s.storage[sl.product] = (s.storage[sl.product] ?? 0) + sl.qty;
  s.fixtures.splice(i, 1);
  for (const st of s.staff) if (st.post === id) st.post = undefined;
  s.cash += Math.floor(FIXTURES[f.kind].price * 0.6);
  return yes;
}

/** Choose what a slot sells (it must suit the fixture). Stock already there goes back to the stockroom. */
export function assign(s: Store, fixtureId: number, slot: number, id: ProductId | null): Result {
  const f = s.fixtures.find((o) => o.id === fixtureId);
  const sl = f?.slots[slot];
  if (!f || !sl) return no("No such slot");
  if (id) {
    const p = PRODUCTS[id];
    if (p.fixture !== f.kind) return no(`That goes on a ${FIXTURES[p.fixture as FixtureKind].name}`);
    if (!s.licences.includes(p.cat)) return no("You need the licence first");
  }
  if (sl.product && sl.qty) s.storage[sl.product] = (s.storage[sl.product] ?? 0) + sl.qty;
  sl.product = id;
  sl.qty = 0;
  return yes;
}

/** Fill a fixture's slots from the stockroom. Returns units moved. */
export function restock(s: Store, fixtureId: number): number {
  const f = s.fixtures.find((o) => o.id === fixtureId);
  if (!f) return 0;
  let moved = 0;
  for (const sl of f.slots) {
    if (!sl.product) continue;
    const room = PRODUCTS[sl.product].slot - sl.qty;
    const take = Math.min(room, s.storage[sl.product] ?? 0);
    if (take <= 0) continue;
    sl.qty += take;
    s.storage[sl.product] = (s.storage[sl.product] ?? 0) - take;
    moved += take;
  }
  return moved;
}

export function setPrice(s: Store, id: ProductId, cents: number): Result {
  if (!(cents >= 1 && cents <= PRODUCTS[id].market * 5)) return no("That price won't fly");
  s.prices[id] = Math.round(cents);
  return yes;
}

export function hire(s: Store, role: StaffRole, rng: Rng = createRng(s.seed + s.nextId)): Result & { id?: number } {
  if (s.staff.length >= EDITIONS[s.tier].staff) return no(s.tier === "lite" ? "Lite edition: one member of staff" : "That's a full team");
  const id = s.nextId++;
  const st: Staff = { id, role, name: `${rng.pick(NAMES)} ${String.fromCharCode(65 + Math.floor(rng.next() * 26))}.` };
  if (role === "cashier") st.post = s.fixtures.find((f) => f.kind === "checkout" && !s.staff.some((o) => o.post === f.id))?.id;
  s.staff.push(st);
  return { ok: true, id };
}

export function fire(s: Store, id: number): Result {
  const i = s.staff.findIndex((o) => o.id === id);
  if (i < 0) return no("No such person");
  s.staff.splice(i, 1);
  return yes;
}

/** Grow into the next size of premises. */
export function expand(s: Store): Result {
  const next = SIZES[s.size + 1];
  if (!next || s.size + 1 >= EDITIONS[s.tier].sizes) return no(s.tier === "lite" ? "Bigger stores need Ultimate" : "You're the biggest store in town");
  const r = spend(s, next.price);
  if (r.ok) s.size++;
  return r;
}

export function runCampaign(s: Store, kind: Campaign): Result {
  if (!EDITIONS[s.tier].marketing) return no("Marketing is Ultimate only");
  if (s.campaign && s.campaign.until > s.day) return no("A campaign is already running");
  const m = MARKETING[kind];
  const r = spend(s, m.price);
  if (r.ok) s.campaign = { kind, until: s.day + m.days };
  return r;
}

export function rename(s: Store, name: string, sign?: string): Result {
  const n = name.replace(/[^\p{L}\p{N} '&.-]/gu, "").trim().slice(0, 24);
  if (n.length < 2) return no("Give it a name");
  s.name = n;
  if (sign) {
    if (!EDITIONS[s.tier].customSign) return no("Custom signs are Ultimate only");
    if (/^#[0-9a-f]{6}$/i.test(sign)) s.sign = sign;
  }
  return yes;
}

// --------------------------------------------------------------- customers

/** What's on the shelves right now, by product. */
export function onShelf(s: Store): Map<ProductId, { fixture: number; slot: number; qty: number }[]> {
  const m = new Map<ProductId, { fixture: number; slot: number; qty: number }[]>();
  for (const f of s.fixtures)
    f.slots.forEach((sl, i) => {
      if (!sl.product) return;
      const list = m.get(sl.product) ?? [];
      list.push({ fixture: f.id, slot: i, qty: sl.qty });
      m.set(sl.product, list);
    });
  return m;
}

export const appeal = (s: Store) => s.fixtures.reduce((a, f) => a + (FIXTURES[f.kind].appeal ?? 0), 0);

/** Shoppers walking in per game hour at this time of day. */
export function footfall(s: Store, minute = s.minute) {
  if (minute < OPEN || minute >= CLOSE) return 0;
  const h = minute / 60;
  // Busy at lunch and after work.
  const curve = 0.6 + 0.5 * Math.exp(-((h - 12.5) ** 2) / 2) + 0.7 * Math.exp(-((h - 17.5) ** 2) / 2.5);
  const variety = Math.min(1.6, 0.4 + onShelf(s).size * 0.08);
  const level = 1 + levelOf(s.xp) * 0.12 + s.size * 0.2;
  const rep = 0.35 + s.reputation / 4;
  const ad = s.campaign && s.campaign.until > s.day - 1 ? 1 + MARKETING[s.campaign.kind].boost : 1;
  const decor = 1 + Math.min(0.3, appeal(s) * 0.02);
  const ev = eventOf(s)?.footfall ?? 1;
  const messy = 1 - messPenalty(s) * 0.6;
  return 8 * curve * variety * level * rep * ad * decor * ev * messy;
}

export const eventOf = (s: Store): DayEvent | null => (s.event ? EVENTS[s.event] : null);

/** What a unit costs from the wholesaler today. */
export const unitCost = (s: Store, id: ProductId) => Math.round(PRODUCTS[id].cost * (eventOf(s)?.cost ?? 1));

/**
 * How likely a product is to be on someone's list: its usual demand, today's
 * event, and your price (a bargain gets noticed, an overpriced line gets skipped).
 */
export function demandOf(s: Store, id: ProductId) {
  const p = PRODUCTS[id];
  const ev = eventOf(s)?.boost as Partial<Record<string, number>> | undefined;
  const boost = (ev?.[id] ?? 1) * (ev?.[p.cat] ?? 1);
  const ratio = p.market / priceOf(s, id);
  const price = Math.max(0.45, Math.min(1.8, ratio ** 1.6));
  return p.demand * boost * price;
}

/** Most shoppers the floor holds at once. */
export const capacity = (s: Store) => 6 + s.size * 4;

/** A shopper's list: 1 to 6 things from what you're licensed to sell (some may not be on the shelves). */
export function shoppingList(s: Store, rng: Rng): ProductId[] {
  const pool = PRODUCT_IDS.filter((id) => s.licences.includes(PRODUCTS[id].cat));
  if (!pool.length) return [];
  const weights = pool.map((id) => demandOf(s, id));
  const total = weights.reduce((a, w) => a + w, 0);
  const n = 1 + Math.floor(rng.next() ** 1.4 * 6);
  const list: ProductId[] = [];
  for (let i = 0; i < n; i++) {
    let r = rng.next() * total;
    for (const [k, id] of pool.entries()) {
      r -= weights[k];
      if (r <= 0) {
        if (!list.includes(id)) list.push(id);
        break;
      }
    }
  }
  return list;
}

/** The most a shopper will pay for something: around the market price, more at a well-liked store. */
export function maxPay(s: Store, id: ProductId, rng: Rng) {
  const m = PRODUCTS[id].market;
  return Math.round(m * (1.04 + s.reputation * 0.035) * (0.88 + rng.next() * 0.24));
}

/** Will they take it at your price? */
export const willBuy = (s: Store, id: ProductId, rng: Rng) => priceOf(s, id) <= maxPay(s, id, rng);

/** Take one unit off a shelf slot. */
export function pick(s: Store, fixtureId: number, slot: number): boolean {
  const sl = s.fixtures.find((f) => f.id === fixtureId)?.slots[slot];
  if (!sl || !sl.product || sl.qty <= 0) return false;
  sl.qty--;
  return true;
}

/** Ring up a basket: takes the money, books the cost of goods and the XP. */
export function ringUp(s: Store, basket: { product: ProductId; price: number }[], tillError = 0) {
  let total = 0;
  for (const b of basket) {
    total += b.price;
    s.today.cogs += PRODUCTS[b.product].cost;
    s.today.sold[b.product] = (s.today.sold[b.product] ?? 0) + 1;
  }
  s.cash += total - tillError;
  s.today.revenue += total;
  s.today.items += basket.length;
  s.today.tillError += tillError;
  s.today.customers++;
  return total;
}

/** A shopper leaves: happy if they found what they wanted at a fair price without a long wait. */
export function leaveMood(s: Store, mood: number) {
  if (mood < 0.45) s.today.unhappy++;
  s.reputation = Math.max(0, Math.min(5, s.reputation + (mood - 0.6) * 0.04));
}

// --------------------------------------------------------------------- mess

/** How much a messy floor takes off every shopper's mood (0 to 0.3). */
export const messPenalty = (s: Store) => Math.min(0.3, (s.mess?.length ?? 0) * 0.03);

/** A shopper drops something, or knocks something over. */
export function makeMess(s: Store, x: number, z: number, rng: Rng): Mess | null {
  s.mess ??= [];
  if (s.mess.length >= MESS_MAX) return null;
  const m: Mess = { id: s.nextId++, kind: rng.next() < 0.45 ? "spill" : "litter", x, z };
  s.mess.push(m);
  return m;
}

/** Mop it up: a little XP, and towards today's goal. */
export function clean(s: Store, id: number): boolean {
  const i = s.mess?.findIndex((m) => m.id === id) ?? -1;
  if (i < 0) return false;
  s.mess!.splice(i, 1);
  s.today.cleaned = (s.today.cleaned ?? 0) + 1;
  s.xp += 2;
  return true;
}

// -------------------------------------------------------------------- goals

/** Three goals for the day, scaled to your level and what you sell. */
export function makeGoals(s: Store): Goal[] {
  const rng = createRng(s.seed * 7 + s.day * 131);
  const lv = levelOf(s.xp);
  const kinds: GoalKind[] = ["serve", "revenue", "sell", "happy", "clean"];
  const pickFrom = [...kinds];
  const out: Goal[] = [];
  while (out.length < 3 && pickFrom.length) {
    const kind = pickFrom.splice(Math.floor(rng.next() * pickFrom.length), 1)[0];
    switch (kind) {
      case "serve": {
        const t = 8 + lv * 4 + s.size * 4;
        out.push({ kind, target: t, reward: t * 400, xp: 30, done: false });
        break;
      }
      case "revenue": {
        const t = (150 + lv * 120 + s.size * 150) * 100;
        out.push({ kind, target: t, reward: Math.round(t * 0.12), xp: 40, done: false });
        break;
      }
      case "sell": {
        const cat = s.licences[Math.floor(rng.next() * s.licences.length)];
        const t = 6 + lv * 2;
        out.push({ kind, target: t, cat, reward: 6_000 + lv * 1_000, xp: 25, done: false });
        break;
      }
      case "happy":
        out.push({ kind, target: Math.max(1, 3 - Math.floor(lv / 3)), reward: 8_000 + lv * 1_500, xp: 35, done: false });
        break;
      case "clean":
        out.push({ kind, target: 3 + Math.floor(lv / 2), reward: 4_000 + lv * 800, xp: 20, done: false });
        break;
    }
  }
  return out;
}

/** How far along a goal is. ("Happy" counts unhappy shoppers: it's met if you end the day at or under the target.) */
export function goalProgress(s: Store, g: Goal) {
  const t = s.today;
  switch (g.kind) {
    case "serve":
      return t.customers;
    case "revenue":
      return t.revenue;
    case "sell":
      return Object.entries(t.sold).reduce((a, [id, n]) => a + (PRODUCTS[id as ProductId].cat === g.cat ? (n ?? 0) : 0), 0);
    case "happy":
      return t.unhappy;
    case "clean":
      return t.cleaned ?? 0;
  }
}

export function goalText(g: Goal) {
  switch (g.kind) {
    case "serve":
      return `Serve ${g.target} shoppers`;
    case "revenue":
      return `Take ${money(g.target)}`;
    case "sell":
      return `Sell ${g.target} ${CATEGORIES[g.cat!].name.toLowerCase()} items`;
    case "happy":
      return `No more than ${g.target} unhappy shopper${g.target === 1 ? "" : "s"} all day`;
    case "clean":
      return `Clean up ${g.target} messes`;
  }
}

/** Pay out goals that are met. `closing` settles the end-of-day ones. Returns those just completed. */
export function claimGoals(s: Store, closing = false): Goal[] {
  const out: Goal[] = [];
  for (const g of s.goals ?? []) {
    if (g.done) continue;
    const p = goalProgress(s, g);
    const met = g.kind === "happy" ? closing && p <= g.target : p >= g.target;
    if (!met) continue;
    g.done = true;
    s.cash += g.reward;
    s.xp += g.xp;
    out.push(g);
  }
  return out;
}

// ----------------------------------------------------------- standing orders

/** Ultimate: keep `boxes` boxes of a product in the stockroom, topped up every morning (0 stops it). */
export function setAuto(s: Store, id: ProductId, boxes: number): Result {
  if (!EDITIONS[s.tier].express) return no("Standing orders are Ultimate only");
  if (!s.licences.includes(PRODUCTS[id].cat)) return no("You need the licence first");
  s.auto ??= {};
  const n = Math.max(0, Math.min(10, Math.floor(boxes)));
  if (n) s.auto[id] = n;
  else delete s.auto[id];
  return yes;
}

/** Top the stockroom up to the standing orders, as far as the cash goes. Returns what it cost. */
export function runAuto(s: Store) {
  let spent = 0;
  for (const [k, boxes] of Object.entries(s.auto ?? {})) {
    const id = k as ProductId;
    const p = PRODUCTS[id];
    const want = (boxes ?? 0) * p.box - (s.storage[id] ?? 0);
    if (want <= 0) continue;
    const buy = Math.ceil(want / p.box);
    const cost = buy * p.box * unitCost(s, id);
    if (cost > s.cash) continue;
    s.cash -= cost;
    spent += cost;
    s.storage[id] = (s.storage[id] ?? 0) + buy * p.box;
  }
  return spent;
}

// ----------------------------------------------------------------- the till

/** Cash denominations, largest first (cents). */
export const NOTES = [10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50, 20, 10, 5, 1];

/** What a cash customer hands over: the next note up (or a bit more). */
export function tender(total: number, rng: Rng) {
  const notes = [500, 1_000, 2_000, 5_000, 10_000];
  const up = notes.find((n) => n >= total);
  if (!up) return Math.ceil(total / 10_000) * 10_000;
  if (rng.next() < 0.3 && up < 10_000) return notes[notes.indexOf(up) + 1] ?? up;
  if (rng.next() < 0.25) return Math.ceil(total / 100) * 100;
  return up;
}

/** The fewest notes and coins that make `cents`. */
export function makeChange(cents: number): number[] {
  const out: number[] = [];
  let left = cents;
  for (const n of NOTES)
    while (left >= n) {
      out.push(n);
      left -= n;
    }
  return out;
}

// --------------------------------------------------------------------- time

/** Staff at work: stockers top up any slot below half from the stockroom. */
export function staffWork(s: Store) {
  const cleaners = s.staff.filter((o) => o.role === "cleaner").length;
  for (let i = 0; i < cleaners * 2 && s.mess?.length; i++) {
    s.mess.shift();
    s.today.cleaned = (s.today.cleaned ?? 0) + 1;
  }
  if (!s.staff.some((o) => o.role === "stocker")) return 0;
  let moved = 0;
  for (const f of s.fixtures) if (f.slots.some((sl) => sl.product && sl.qty < PRODUCTS[sl.product].slot / 2)) moved += restock(s, f.id);
  return moved;
}

/** Advance the clock. Deliveries arrive; stockers work every 15 minutes. Returns the deliveries. */
export function advance(s: Store, minutes: number): Order[] {
  const before = s.minute;
  s.minute = Math.min(1440 - 1, s.minute + minutes);
  if (Math.floor(s.minute / 15) !== Math.floor(before / 15)) staffWork(s);
  return deliver(s);
}

/** Close the books: rent, wages and power are paid, XP and the level move, a new day starts at 7:30. */
export function endDay(s: Store): DayReport {
  claimGoals(s, true);
  const goalPay = (s.goals ?? []).filter((g) => g.done).reduce((a, g) => a + g.reward, 0);
  const t = s.today;
  const rent = sizeOf(s).rent;
  const wages = s.staff.reduce((a, st) => a + STAFF[st.role].wage, 0);
  const power = s.fixtures.reduce((a, f) => a + FIXTURES[f.kind].power, 0);
  s.cash -= rent + wages + power;
  const profit = t.revenue - t.cogs - rent - wages - power - t.tillError + goalPay;
  const xp = Math.max(10, Math.round(t.revenue / 1000 + t.customers * 2 - t.unhappy * 3));
  s.xp += xp;
  const report: DayReport = { ...t, sold: { ...t.sold }, day: s.day, rent, wages, power, profit, xp, reputation: s.reputation, goals: goalPay, event: s.event ?? null };
  s.day++;
  s.minute = OPEN - 30;
  s.today = freshStats();
  if (s.campaign && s.campaign.until < s.day) s.campaign = null;
  // Overnight: the cleaners come in, standing orders arrive, and a new day brings its own event and goals.
  s.mess = [];
  s.event = eventFor(s.seed, s.day);
  report.autoOrders = runAuto(s);
  s.goals = makeGoals(s);
  s.history = [...s.history, report].slice(-30);
  deliver(s);
  return report;
}

/** What the business is worth: cash, stock at cost, fixtures at resale and the premises. */
export function storeValue(s: Store) {
  let v = s.cash;
  for (const [id, n] of Object.entries(s.storage)) v += PRODUCTS[id as ProductId].cost * (n ?? 0);
  for (const f of s.fixtures) {
    v += Math.floor(FIXTURES[f.kind].price * 0.6);
    for (const sl of f.slots) if (sl.product) v += PRODUCTS[sl.product].cost * sl.qty;
  }
  for (let i = 1; i <= s.size; i++) v += Math.floor(SIZES[i].price * 0.5);
  for (const c of s.licences) v += Math.floor(CATEGORIES[c].licence * 0.5);
  return v;
}

/** The leaderboard score: the business's value in dollars, over a hundred. */
export const score = (s: Store) => Math.max(0, Math.floor(storeValue(s) / 10_000));

// ---------------------------------------------------------------- walking

/** A walk grid of 0.5 m cells: true where fixtures (plus a little clearance) stand. */
export function walkGrid(s: Store) {
  const { w, d } = sizeOf(s);
  const cw = Math.round(w * 2);
  const cd = Math.round(d * 2);
  const solid = new Uint8Array(cw * cd);
  for (const f of s.fixtures) {
    const r = fixtureRect(f);
    for (let i = Math.floor(r.x * 2); i < Math.ceil((r.x + r.w) * 2); i++)
      for (let j = Math.floor(r.z * 2); j < Math.ceil((r.z + r.d) * 2); j++) if (i >= 0 && j >= 0 && i < cw && j < cd) solid[j * cw + i] = 1;
  }
  return { cw, cd, solid };
}

/** Shortest walk (cell centres) between two points, or a straight line if there's no way. */
export function walkPath(grid: ReturnType<typeof walkGrid>, from: { x: number; z: number }, to: { x: number; z: number }) {
  const { cw, cd, solid } = grid;
  const cell = (p: { x: number; z: number }) => {
    const i = Math.max(0, Math.min(cw - 1, Math.floor(p.x * 2)));
    const j = Math.max(0, Math.min(cd - 1, Math.floor(p.z * 2)));
    return j * cw + i;
  };
  const start = cell(from);
  const goal = cell(to);
  const prev = new Int32Array(cw * cd).fill(-1);
  prev[start] = start;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === goal) break;
    const i = c % cw;
    const j = (c - i) / cw;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cw || nj >= cd) continue;
      const n = nj * cw + ni;
      if (prev[n] !== -1 || (solid[n] && n !== goal)) continue;
      // No cutting corners past a fixture.
      if (di && dj && (solid[j * cw + ni] || solid[nj * cw + i])) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  if (prev[goal] === -1) return [to];
  const cells: number[] = [];
  for (let c = goal; c !== start; c = prev[c]) cells.push(c);
  cells.reverse();
  // Keep only the turns.
  const pts: { x: number; z: number }[] = [];
  let lastDir = "";
  cells.forEach((c, k) => {
    const i = c % cw;
    const j = (c - i) / cw;
    const n = cells[k + 1];
    const dir = n === undefined ? "end" : `${(n % cw) - i},${(n - (n % cw)) / cw - j}`;
    if (dir !== lastDir) pts.push({ x: (i + 0.5) / 2, z: (j + 0.5) / 2 });
    lastDir = dir;
  });
  pts.push(to);
  return pts;
}

// --------------------------------------------------------------------- save

export const SAVE_KEY = (tier: Tier) => `zx-ubusiness-${tier}`;

/** A store from storage, checked; null if it's missing or broken. */
export function loadStore(raw: string | null, tier: Tier): Store | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Store;
    if (s?.version !== 1 || !Array.isArray(s.fixtures) || typeof s.cash !== "number") return null;
    s.tier = tier;
    // Anything this edition can't sell or place stays put but can't be added to.
    s.size = Math.min(s.size, EDITIONS[tier].sizes - 1);
    s.staff = s.staff.slice(0, EDITIONS[tier].staff);
    s.fixtures = s.fixtures.filter((f) => f.kind in FIXTURES);
    for (const f of s.fixtures) f.slots = f.slots.map((sl) => (sl.product && !(sl.product in PRODUCTS) ? { product: null, qty: 0 } : sl));
    // Saves from before events, goals, mess and standing orders.
    s.mess ??= [];
    s.auto ??= {};
    if (s.event && !(s.event in EVENTS)) s.event = null;
    s.goals ??= makeGoals(s);
    if (tier === "lite") s.auto = {};
    return s;
  } catch {
    return null;
  }
}

/** Money as the till shows it. */
export const money = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const clock = (minute: number) => {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
