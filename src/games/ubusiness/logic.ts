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

export type Category = "grocery" | "snacks" | "household" | "fresh" | "frozen" | "bakery" | "pharmacy" | "toys" | "fashion" | "electronics";

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
  frozen: { name: "Frozen", licence: 120_000, level: 3, ultimate: false, icon: "🧊" },
  bakery: { name: "Bakery", licence: 250_000, level: 4, ultimate: true, icon: "🥐" },
  pharmacy: { name: "Health & Beauty", licence: 300_000, level: 4, ultimate: true, icon: "💊" },
  toys: { name: "Toys & Games", licence: 400_000, level: 5, ultimate: true, icon: "🧸" },
  fashion: { name: "Fashion", licence: 600_000, level: 6, ultimate: true, icon: "👕" },
  electronics: { name: "Electronics", licence: 900_000, level: 7, ultimate: true, icon: "🎧" },
};
export const CATEGORY_IDS = Object.keys(CATEGORIES) as Category[];

// ---------------------------------------------------------------- products

export type FixtureKind = "shelf" | "fridge" | "freezer" | "bakery" | "produce" | "rack" | "display" | "checkout" | "selfCheckout" | "coffee" | "plant" | "promo";
/** Fixtures that hold stock. */
export type StockFixture = "shelf" | "fridge" | "freezer" | "bakery" | "produce" | "rack" | "display";
export type Shape = "box" | "bottle" | "can" | "bag" | "jar" | "fruit" | "carton" | "device" | "garment" | "toy" | "roll";

export interface Product {
  name: string;
  brand: string;
  cat: Category;
  /** What it's sold from. */
  fixture: StockFixture;
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
  /** Share of the stock that goes off overnight (fresh food); none for everything else. */
  spoil?: number;
}

const P = (name: string, brand: string, cat: Category, fixture: Product["fixture"], cost: number, market: number, box: number, slot: number, shape: Shape, color: string, accent: string, size: [number, number, number], demand = 1, spoil?: number): Product => ({ name, brand, cat, fixture, cost, market, box, slot, shape, color, accent, size, demand, ...(spoil ? { spoil } : {}) });

export const PRODUCTS = {
  // Grocery
  bread: P("Sourdough Loaf", "Hearthstone", "grocery", "shelf", 180, 449, 12, 12, "bag", "#d6a565", "#7c2d12", [0.26, 0.12, 0.12], 1.6, 0.15),
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
  apples: P("Red Apples", "Orchard Hill", "fresh", "produce", 35, 99, 40, 60, "fruit", "#dc2626", "#16a34a", [0.08, 0.08, 0.08], 1.5, 0.1),
  bananas: P("Bananas", "Sunvale", "fresh", "produce", 30, 89, 40, 60, "fruit", "#facc15", "#65a30d", [0.18, 0.04, 0.04], 1.5, 0.15),
  tomatoes: P("Vine Tomatoes", "Orchard Hill", "fresh", "produce", 40, 119, 40, 60, "fruit", "#ef4444", "#15803d", [0.07, 0.07, 0.07], 1, 0.12),
  milk: P("Whole Milk 2L", "Northfield Dairy", "fresh", "fridge", 140, 349, 12, 12, "carton", "#f8fafc", "#2563eb", [0.1, 0.26, 0.1], 1.6, 0.08),
  cheese: P("Aged Cheddar", "Northfield Dairy", "fresh", "fridge", 260, 649, 16, 20, "box", "#fbbf24", "#1e3a8a", [0.12, 0.05, 0.08], 1, 0.03),
  yoghurt: P("Greek Yoghurt", "Alpwood", "fresh", "fridge", 120, 329, 16, 20, "jar", "#f5f5f4", "#7c3aed", [0.1, 0.09, 0.1], 1, 0.06),
  eggs: P("Free Range Eggs 12", "Henhouse", "fresh", "fridge", 210, 549, 12, 12, "carton", "#fef3c7", "#a16207", [0.3, 0.07, 0.11], 1.3, 0.04),
  juice: P("Orange Juice 1L", "Sunvale", "fresh", "fridge", 150, 399, 12, 14, "carton", "#f97316", "#16a34a", [0.08, 0.22, 0.06], 1, 0.06),
  // Frozen
  icecream: P("Vanilla Ice Cream 2L", "Polar Scoop", "frozen", "freezer", 280, 699, 8, 10, "jar", "#fef3c7", "#db2777", [0.16, 0.12, 0.16], 1.1),
  pizza: P("Margherita Pizza", "Forno Rosso", "frozen", "freezer", 230, 599, 10, 10, "box", "#dc2626", "#fef3c7", [0.3, 0.04, 0.28], 1.1),
  peas: P("Garden Peas 1kg", "Frostvale", "frozen", "freezer", 110, 299, 16, 18, "bag", "#16a34a", "#f5f5f4", [0.18, 0.24, 0.05], 0.8),
  fishfingers: P("Fish Fingers 20", "Captain Gale", "frozen", "freezer", 190, 499, 12, 14, "box", "#1d4ed8", "#f97316", [0.2, 0.05, 0.12], 0.8),
  icepops: P("Ice Pops 10-pack", "Polar Scoop", "frozen", "freezer", 120, 349, 16, 18, "box", "#06b6d4", "#f43f5e", [0.18, 0.04, 0.12], 0.9),
  // Bakery: baked fresh, gone stale by morning.
  croissant: P("Butter Croissant", "Hearthstone", "bakery", "bakery", 45, 229, 24, 24, "fruit", "#d97706", "#fde68a", [0.14, 0.06, 0.08], 1.3, 0.5),
  muffin: P("Blueberry Muffin", "Hearthstone", "bakery", "bakery", 55, 279, 24, 24, "can", "#7c3aed", "#fde68a", [0.08, 0.08, 0.08], 1.1, 0.5),
  donut: P("Glazed Donut", "Ring Bros", "bakery", "bakery", 35, 189, 24, 30, "fruit", "#f9a8d4", "#fef3c7", [0.1, 0.04, 0.1], 1.2, 0.5),
  baguette: P("French Baguette", "Hearthstone", "bakery", "bakery", 60, 299, 20, 16, "bag", "#d6a565", "#7c2d12", [0.5, 0.06, 0.07], 1, 0.5),
  cake: P("Chocolate Cake", "Hearthstone", "bakery", "bakery", 600, 1899, 4, 4, "can", "#451a03", "#fef3c7", [0.24, 0.12, 0.24], 0.4, 0.2),
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
  freezer: { name: "Freezer", price: 140_000, w: 2, d: 0.8, slots: 4, power: 2_400, level: 3 },
  bakery: { name: "Bakery Case", price: 160_000, w: 1.8, d: 0.9, slots: 3, power: 900, level: 4, ultimate: true },
  produce: { name: "Produce Stand", price: 60_000, w: 2, d: 1.1, slots: 4, power: 0, level: 3 },
  rack: { name: "Clothing Rail", price: 50_000, w: 1.6, d: 0.6, slots: 2, power: 0, level: 6, ultimate: true },
  display: { name: "Tech Display", price: 150_000, w: 1.6, d: 0.9, slots: 3, power: 600, level: 7, ultimate: true },
  checkout: { name: "Checkout Counter", price: 90_000, w: 2.2, d: 0.9, slots: 0, power: 300, level: 1 },
  selfCheckout: { name: "Self-Checkout", price: 200_000, w: 0.9, d: 0.7, slots: 0, power: 400, level: 4, ultimate: true },
  coffee: { name: "Coffee Bar", price: 150_000, w: 1.6, d: 0.8, slots: 0, power: 500, level: 2, appeal: 1 },
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
  /** Products on special at once (more with promo stands, up to this). */
  specials: number;
}

export const EDITIONS: Record<Tier, Edition> = {
  lite: { name: "UBusiness Lite", categories: ["grocery", "snacks", "household", "fresh", "frozen"], sizes: 3, staff: 1, speeds: [1, 2], marketing: false, express: false, photoMode: false, customSign: false, specials: 1 },
  ultimate: { name: "UBusiness Ultimate", categories: CATEGORY_IDS, sizes: 6, staff: 6, speeds: [1, 2, 3], marketing: true, express: true, photoMode: true, customSign: true, specials: 3 },
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
  guard: { name: "Security guard", wage: 11_000, does: "Stops shoplifters at the door" },
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
  halloween: { name: "Halloween", icon: "🎃", text: "Trick-or-treaters everywhere: sweets, snacks and toys fly out.", footfall: 1.3, boost: { gummies: 3, choc: 2.4, snacks: 1.5, toys: 1.6, icepops: 1.4 } },
  coldsnap: { name: "Cold snap", icon: "🥶", text: "Freezing out: soup and coffee sell, nobody wants ice cream.", footfall: 0.9, boost: { soup: 2.2, coffee: 1.8, bakery: 1.4, icecream: 0.3, icepops: 0.3 } },
  bigmatch: { name: "Big match day", icon: "🏉", text: "The grand final's on tonight: crisps, drinks and pizza for the party.", footfall: 1.2, boost: { chips: 2.4, cola: 2, energy: 1.6, pizza: 2.2, water: 1.4 } },
  holidays: { name: "School holidays", icon: "🎒", text: "Kids are off school: toys, treats and ice pops.", footfall: 1.15, boost: { toys: 2, icepops: 2, icecream: 1.6, gummies: 1.6, donut: 1.5 } },
} satisfies Record<string, DayEvent>;
export type EventId = keyof typeof EVENTS;

/**
 * Today's event: none on day 1, then about half the days have one (the same
 * for a given store and day). In the last week of October, Halloween turns up
 * far more often.
 */
export function eventFor(seed: number, day: number, date?: Date): EventId | null {
  if (day <= 1) return null;
  const r = createRng(seed * 31 + day * 977);
  if (date && date.getMonth() === 9 && date.getDate() >= 24 && r.next() < 0.5) return "halloween";
  if (r.next() < 0.45) return null;
  const ids = Object.keys(EVENTS) as EventId[];
  return ids[Math.floor(r.next() * ids.length)];
}

// ---------------------------------------------------------------- upgrades

export interface UpgradeDef {
  name: string;
  icon: string;
  price: number;
  level: number;
  ultimate?: boolean;
  text: string;
}

/** One-time improvements to the premises. */
export const UPGRADES = {
  doors: { name: "Automatic doors", icon: "🚪", price: 40_000, level: 1, text: "Shoppers will wait 15% longer at the till." },
  music: { name: "Sound system", icon: "🎵", price: 60_000, level: 1, text: "Background music makes the place nicer (+2 appeal)." },
  tap: { name: "Tap-to-pay terminals", icon: "💳", price: 90_000, level: 2, text: "Most shoppers pay by card: less change to count." },
  led: { name: "LED lighting", icon: "💡", price: 120_000, level: 2, text: "The power bill drops by 30%." },
  cctv: { name: "CCTV cameras", icon: "📹", price: 180_000, level: 3, text: "Half as many shoplifters try their luck." },
  aircon: { name: "Air conditioning", icon: "❄️", price: 250_000, level: 3, text: "Happier shoppers, and 15% more come in during a heatwave." },
  bay: { name: "Loading bay", icon: "🚛", price: 200_000, level: 4, text: "Deliveries arrive twice as fast." },
  app: { name: "Loyalty app", icon: "📱", price: 350_000, level: 5, ultimate: true, text: "Regulars: 10% more shoppers, and your reputation grows faster." },
  late: { name: "Late-night licence", icon: "🌙", price: 300_000, level: 4, text: "Stay open until 10pm for the after-work crowd (wages and power go up 15%)." },
} satisfies Record<string, UpgradeDef>;
export type UpgradeId = keyof typeof UPGRADES;
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

// -------------------------------------------------------------------- loans

export const LOANS = {
  small: { name: "Small business loan", amount: 500_000, days: 10, rate: 0.1, ultimate: false },
  growth: { name: "Growth loan", amount: 2_000_000, days: 20, rate: 0.15, ultimate: true },
} as const;
export type LoanKind = keyof typeof LOANS;

// -------------------------------------------------------------------- rival

/** The day a rival opens across the street. */
export const RIVAL_DAY = 6;
export const RIVAL_NAME = "Bargain Barn";

// ------------------------------------------------------------------ reviews

export type Reason = "great" | "soldout" | "pricey" | "queue" | "mess" | "short" | "ok";
export interface Review {
  day: number;
  stars: number;
  text: string;
  who: string;
}

const REVIEW_LINES: Record<Reason, string[]> = {
  great: ["Everything I needed, friendly till, in and out. Love it.", "My new favourite shop. Spotless and well stocked.", "Great prices and the shelves are always full!", "Lovely little store. Will be back tomorrow."],
  soldout: ["Half my list was sold out.", "Empty shelves again. Restock please!", "Came for one thing and they didn't have it."],
  pricey: ["Way too expensive. I'll shop elsewhere.", "Nice shop but the prices made me wince.", "Daylight robbery on the basics."],
  queue: ["Waited forever at the till and gave up.", "One till open and a queue to the door.", "Need more staff on the checkouts."],
  mess: ["Sticky floor and litter in the aisles.", "Someone please mop aisle two.", "Grubby. Put me right off."],
  short: ["They short-changed me!", "Check your change here, folks."],
  ok: ["Fine. Got what I needed.", "Does the job.", "Not bad, not amazing."],
};
const REVIEWERS = ["Pat", "Lee", "Mel", "Chris", "Dana", "Kim", "Nico", "Ash", "Sky", "Jo", "Bea", "Ravi", "Tess", "Omar", "Ivy"];

// --------------------------------------------------------------- milestones

export interface Lifetime {
  customers: number;
  revenue: number;
  items: number;
  days: number;
  caught: number;
  /** Best day's takings. */
  bestDay: number;
}

export interface Milestone {
  id: string;
  name: string;
  text: string;
  reward: number;
  done: (s: Store) => boolean;
}

/** Trophies: each pays out once, the moment you earn it. */
export const MILESTONES: Milestone[] = [
  { id: "first", name: "Open for business", text: "Serve your first shopper", reward: 5_000, done: (s) => life(s).customers >= 1 },
  { id: "hundred", name: "Regulars", text: "Serve 100 shoppers", reward: 20_000, done: (s) => life(s).customers >= 100 },
  { id: "thousand", name: "Local legend", text: "Serve 1,000 shoppers", reward: 150_000, done: (s) => life(s).customers >= 1_000 },
  { id: "day1k", name: "Four figures", text: "Take $1,000 in a day", reward: 20_000, done: (s) => Math.max(life(s).bestDay, s.today.revenue) >= 100_000 },
  { id: "day5k", name: "Big day", text: "Take $5,000 in a day", reward: 80_000, done: (s) => Math.max(life(s).bestDay, s.today.revenue) >= 500_000 },
  { id: "week", name: "One week in", text: "Trade for 7 days", reward: 30_000, done: (s) => life(s).days >= 7 },
  { id: "month", name: "Established", text: "Trade for 30 days", reward: 200_000, done: (s) => life(s).days >= 30 },
  { id: "depts3", name: "Something for everyone", text: "Sell from 3 departments", reward: 25_000, done: (s) => s.licences.length >= 3 },
  { id: "depts6", name: "Department store", text: "Sell from 6 departments", reward: 120_000, done: (s) => s.licences.length >= 6 },
  { id: "grow", name: "Moving up", text: "Move to bigger premises", reward: 40_000, done: (s) => s.size >= 1 },
  { id: "super", name: "Supermarket sweep", text: "Become a Supermarket", reward: 250_000, done: (s) => s.size >= 3 },
  { id: "team", name: "Team player", text: "Have 3 staff", reward: 30_000, done: (s) => s.staff.length >= 3 },
  { id: "stars", name: "Five-star service", text: "Reach a 4.5★ reputation", reward: 100_000, done: (s) => s.reputation >= 4.5 },
  { id: "catch", name: "Not on my watch", text: "Catch a shoplifter", reward: 15_000, done: (s) => life(s).caught >= 1 },
  { id: "fitout", name: "Fitted out", text: "Buy 4 store upgrades", reward: 60_000, done: (s) => (s.upgrades ?? []).length >= 4 },
  { id: "million", name: "Millionaire", text: "Build a business worth $1,000,000", reward: 500_000, done: (s) => storeValue(s) >= 100_000_000 },
];

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
  /** Skill, 1 to 5: experience raises it to 3, training to 5. */
  level?: number;
  /** Days worked. */
  days?: number;
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
  /** Shoplifters caught, and what got away (cents, at shelf price). */
  caught?: number;
  stolen?: number;
  /** Coffees sold at the coffee bar. */
  coffees?: number;
  /** The food critic has been in today. */
  critic?: boolean;
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
  /** Fresh food thrown out overnight (cents at cost). */
  waste?: number;
  /** Loan repayment taken this evening. */
  loan?: number;
  /** The rival opened across the street tonight. */
  rivalOpened?: boolean;
  /** Staff who got better with experience tonight. */
  promoted?: string[];
  /** Every seventh evening: the week in review. */
  week?: WeekReview;
}

export interface WeekReview {
  week: number;
  revenue: number;
  profit: number;
  customers: number;
  best: ProductId | null;
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
  /** Products on special (20% off). */
  specials?: ProductId[];
  upgrades?: UpgradeId[];
  reviews?: Review[];
  /** Trophies earned (ids). */
  milestones?: string[];
  lifetime?: Lifetime;
  loan?: { kind: LoanKind; left: number; daily: number } | null;
  /** The day a price promise is running (it fights the rival for a day). */
  promise?: number;
  /** Newspaper write-ups from the food critic, newest first. */
  press?: Press[];
  rival?: { name: string; strength: number } | null;
}

const freshStats = (): DayStats => ({ revenue: 0, cogs: 0, customers: 0, unhappy: 0, items: 0, sold: {}, tillError: 0, cleaned: 0, caught: 0, stolen: 0 });
const freshLifetime = (): Lifetime => ({ customers: 0, revenue: 0, items: 0, days: 0, caught: 0, bestDay: 0 });
/** Lifetime totals (made up on the spot for an old save). */
export const life = (s: Store): Lifetime => (s.lifetime ??= freshLifetime());

/** The default shelf price: the market price. */
export const defaultPrice = (id: ProductId) => PRODUCTS[id].market;
export const priceOf = (s: Store, id: ProductId) => s.prices[id] ?? defaultPrice(id);
/** How much off a special is. */
export const SPECIAL_OFF = 0.2;
export const onSpecial = (s: Store, id: ProductId) => !!s.specials?.includes(id);
/** What it actually rings up at: your price, less the special discount. */
export const shelfPrice = (s: Store, id: ProductId) => (onSpecial(s, id) ? Math.round(priceOf(s, id) * (1 - SPECIAL_OFF)) : priceOf(s, id));
export const hasUpgrade = (s: Store, id: UpgradeId) => !!s.upgrades?.includes(id) && (s.tier === "ultimate" || !(UPGRADES[id] as UpgradeDef).ultimate);
export const levelOf = (xp: number) => LEVELS.filter((x) => xp >= x).length;
export const sizeOf = (s: Store) => SIZES[s.size];
export const absMinute = (s: Store) => (s.day - 1) * 1440 + s.minute;
/** Closing time: 8pm, or 10pm with the late-night licence. */
export const closeOf = (s: Store) => (hasUpgrade(s, "late") ? 22 * 60 : CLOSE);
export const isOpen = (s: Store) => s.minute >= OPEN && s.minute < closeOf(s);

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
  s.specials = [];
  s.upgrades = [];
  s.reviews = [];
  s.milestones = [];
  s.lifetime = freshLifetime();
  s.loan = null;
  s.rival = null;
  s.press = [];
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
  const r = spend(s, orderCost(s, id, Math.floor(boxes)) + fee);
  if (!r.ok) return r;
  const base = express ? EXPRESS_MIN : (eventOf(s)?.delivery ?? DELIVERY_MIN);
  const wait = hasUpgrade(s, "bay") ? Math.ceil(base / 2) : base;
  s.orders.push({ product: id, units, at: isOpen(s) ? absMinute(s) + wait : absMinute(s) });
  deliver(s);
  return yes;
}

/** The wholesaler's bulk deal: 8% off five boxes or more, 15% off ten or more. */
export const bulkDiscount = (boxes: number) => (boxes >= 10 ? 0.15 : boxes >= 5 ? 0.08 : 0);
/** What an order of boxes costs today, after the bulk deal. */
export const orderCost = (s: Store, id: ProductId, boxes: number) => Math.round(unitCost(s, id) * PRODUCTS[id].box * boxes * (1 - bulkDiscount(boxes)));

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

// -------------------------------------------------------------- staff skill

export const levelOfStaff = (st: Staff) => st.level ?? 1;
/** Experience takes a member of staff to level 3 (a level every five days worked); training goes to 5. */
export const STAFF_MAX = 5;
export const EXPERIENCE_MAX = 3;
/** Wages rise 10% a level. */
export const wageOf = (st: Staff) => Math.round(STAFF[st.role].wage * (1 + 0.1 * (levelOfStaff(st) - 1)));
export const trainCost = (st: Staff) => 25_000 * levelOfStaff(st);
/** The best skill among staff in a role (0 if nobody). */
export const skill = (s: Store, role: StaffRole) => s.staff.filter((st) => st.role === role).reduce((a, st) => Math.max(a, levelOfStaff(st)), 0);
/** How long a cashier takes per item (seconds of game time): quicker as they improve. */
export const scanPerItem = (level: number) => 0.5 * (1 - 0.12 * (Math.max(1, level) - 1));

/** Send someone on a course: one level up, for a fee. */
export function train(s: Store, id: number): Result {
  const st = s.staff.find((o) => o.id === id);
  if (!st) return no("No such person");
  if (levelOfStaff(st) >= STAFF_MAX) return no("They're already the best there is");
  const r = spend(s, trainCost(st));
  if (r.ok) st.level = levelOfStaff(st) + 1;
  return r;
}

// ------------------------------------------------------------- coffee bar

export const COFFEE = { price: 380, cost: 60 };
/** The chance a paying shopper grabs a coffee on the way out: 25% a bar, up to 45%. */
export const coffeeChance = (s: Store) => Math.min(0.45, 0.25 * s.fixtures.filter((f) => f.kind === "coffee").length);
/** Ring up a coffee. */
export function sellCoffee(s: Store) {
  s.cash += COFFEE.price;
  s.today.revenue += COFFEE.price;
  s.today.cogs += COFFEE.cost;
  s.today.coffees = (s.today.coffees ?? 0) + 1;
  life(s).revenue += COFFEE.price;
}

// ----------------------------------------------------------- price promise

/** A day-long price promise: we'll match the rival. It halves what they take from you today, and knocks them back a little. */
export const promiseCost = (s: Store) => 25_000 + s.size * 10_000;
export function pricePromise(s: Store): Result {
  if (!s.rival) return no("There's nobody to beat yet");
  if (s.promise === s.day) return no("Already running today");
  const r = spend(s, promiseCost(s));
  if (r.ok) s.promise = s.day;
  return r;
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

export const appeal = (s: Store) => s.fixtures.reduce((a, f) => a + (FIXTURES[f.kind].appeal ?? 0), 0) + (hasUpgrade(s, "music") ? 2 : 0);

/** Shoppers walking in per game hour at this time of day. */
export function footfall(s: Store, minute = s.minute) {
  if (minute < OPEN || minute >= closeOf(s)) return 0;
  const h = minute / 60;
  // Busy at lunch and after work.
  const curve = 0.6 + 0.5 * Math.exp(-((h - 12.5) ** 2) / 2) + 0.7 * Math.exp(-((h - 17.5) ** 2) / 2.5);
  const variety = Math.min(1.6, 0.4 + onShelf(s).size * 0.08);
  const level = 1 + levelOf(s.xp) * 0.12 + s.size * 0.2;
  const rep = 0.35 + s.reputation / 4;
  const ad = s.campaign && s.campaign.until > s.day - 1 ? 1 + MARKETING[s.campaign.kind].boost : 1;
  const decor = 1 + Math.min(0.3, appeal(s) * 0.02);
  const ev = (eventOf(s)?.footfall ?? 1) * (s.event === "heatwave" && hasUpgrade(s, "aircon") ? 1.15 : 1);
  const messy = 1 - messPenalty(s) * 0.6;
  const deals = 1 + (s.specials?.length ?? 0) * 0.04;
  const loyal = hasUpgrade(s, "app") ? 1.1 : 1;
  const rival = 1 - rivalPull(s);
  return 8 * curve * variety * level * rep * ad * decor * ev * messy * deals * loyal * rival;
}

/** Your average shelf price against the usual price (1 = the usual), across what's on the shelves. */
export function priceIndex(s: Store) {
  const ids = [...onShelf(s).keys()];
  if (!ids.length) return 1;
  return ids.reduce((a, id) => a + shelfPrice(s, id) / PRODUCTS[id].market, 0) / ids.length;
}

/** Share of shoppers the rival takes: more if you're dearer than usual, less if you're well liked. */
export function rivalPull(s: Store) {
  if (!s.rival) return 0;
  const price = Math.max(0.2, Math.min(1.5, 0.5 + (priceIndex(s) - 1) * 3));
  const liked = Math.max(0.5, 1.3 - s.reputation * 0.15);
  const promise = s.promise === s.day ? 0.5 : 1;
  return Math.min(0.6, s.rival.strength * price * liked * promise);
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
  const ratio = p.market / shelfPrice(s, id);
  const price = Math.max(0.45, Math.min(1.8, ratio ** 1.6));
  return p.demand * boost * price * (onSpecial(s, id) ? 1.5 : 1);
}

/** Most shoppers the floor holds at once. */
export const capacity = (s: Store) => 6 + s.size * 4;

// ------------------------------------------------------------ shopper types

export interface ShopperType {
  name: string;
  icon: string;
  /** How common (relative). */
  weight: number;
  /** Fewest and most things on their list. */
  items: [number, number];
  /** Queue patience, walking pace and what they'll pay, against an average shopper. */
  patience: number;
  pace: number;
  budget: number;
  /** Added to the share who pay by card. */
  card: number;
  /** Departments they go for. */
  likes: Partial<Record<Category, number>>;
}

export const SHOPPER_TYPES = {
  regular: { name: "Regular", icon: "🙂", weight: 50, items: [1, 6], patience: 1, pace: 1, budget: 1, card: 0, likes: {} },
  family: { name: "Family", icon: "👨‍👩‍👧", weight: 15, items: [4, 9], patience: 0.8, pace: 0.9, budget: 1, card: 0.1, likes: { fresh: 1.5, snacks: 1.4, frozen: 1.5, toys: 1.8, bakery: 1.3 } },
  pensioner: { name: "Pensioner", icon: "👵", weight: 12, items: [1, 4], patience: 1.5, pace: 0.7, budget: 0.95, card: -0.4, likes: { grocery: 1.4, pharmacy: 1.7, bakery: 1.4, fresh: 1.2 } },
  student: { name: "Student", icon: "🎒", weight: 15, items: [1, 3], patience: 0.9, pace: 1.15, budget: 0.9, card: 0.2, likes: { snacks: 2.2, frozen: 1.6, electronics: 1.4 } },
  foodie: { name: "Foodie", icon: "🧑‍🍳", weight: 7, items: [2, 5], patience: 1.1, pace: 1, budget: 1.15, card: 0.1, likes: { fresh: 2.2, bakery: 2.4, grocery: 1.2 } },
  critic: { name: "Food critic", icon: "🧐", weight: 1.5, items: [3, 6], patience: 0.9, pace: 0.9, budget: 1.05, card: 0.3, likes: { fresh: 1.3, bakery: 1.5 } },
} satisfies Record<string, ShopperType>;
export type ShopperKind = keyof typeof SHOPPER_TYPES;
const KINDS = Object.keys(SHOPPER_TYPES) as ShopperKind[];

/** Who walks in: the critic comes at most once a day, and not before day 3. */
export function pickShopper(s: Store, rng: Rng): ShopperKind {
  const ok = KINDS.filter((k) => k !== "critic" || (s.day >= 3 && !s.today.critic));
  const total = ok.reduce((a, k) => a + SHOPPER_TYPES[k].weight, 0);
  let r = rng.next() * total;
  for (const k of ok) {
    r -= SHOPPER_TYPES[k].weight;
    if (r <= 0) return k;
  }
  return "regular";
}

export interface Press {
  day: number;
  text: string;
  good: boolean;
}

/**
 * The critic's verdict, printed in tomorrow's paper: a glowing review is
 * worth a lot of reputation, a stinker costs it.
 */
export function criticVerdict(s: Store, mood: number): Press {
  const good = mood >= 0.7;
  const bad = mood < 0.45;
  const n = s.name;
  const text = good
    ? `"${n}: the best little shop in town." ★★★★★`
    : bad
      ? `"Avoid ${n}: empty shelves and a grumpy queue." ★`
      : `"${n} is fine. Just fine." ★★★`;
  s.reputation = Math.max(0, Math.min(5, s.reputation + (good ? 0.4 : bad ? -0.4 : 0.05)));
  const p: Press = { day: s.day, text, good };
  s.press = [p, ...(s.press ?? [])].slice(0, 10);
  return p;
}

/** A shopper's list: 1 to 6 things (more for a family) from what you're licensed to sell (some may not be on the shelves). */
export function shoppingList(s: Store, rng: Rng, kind: ShopperKind = "regular"): ProductId[] {
  const t: ShopperType = SHOPPER_TYPES[kind];
  const pool = PRODUCT_IDS.filter((id) => s.licences.includes(PRODUCTS[id].cat));
  if (!pool.length) return [];
  const weights = pool.map((id) => demandOf(s, id) * (t.likes[PRODUCTS[id].cat] ?? 1));
  const total = weights.reduce((a, w) => a + w, 0);
  const n = t.items[0] + Math.floor(rng.next() ** 1.4 * (t.items[1] - t.items[0] + 1));
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
export function maxPay(s: Store, id: ProductId, rng: Rng, kind: ShopperKind = "regular") {
  const m = PRODUCTS[id].market;
  return Math.round(m * (1.04 + s.reputation * 0.035) * (0.88 + rng.next() * 0.24) * SHOPPER_TYPES[kind].budget);
}

/** Will they take it at your price? */
export const willBuy = (s: Store, id: ProductId, rng: Rng, kind: ShopperKind = "regular") => shelfPrice(s, id) <= maxPay(s, id, rng, kind);

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
  const l = life(s);
  l.customers++;
  l.revenue += total;
  l.items += basket.length;
  return total;
}

/** A shopper leaves: happy if they found what they wanted at a fair price without a long wait. */
export function leaveMood(s: Store, mood: number) {
  if (mood < 0.45) s.today.unhappy++;
  const step = (mood - 0.6) * 0.04 * (hasUpgrade(s, "app") && mood > 0.6 ? 1.5 : 1);
  s.reputation = Math.max(0, Math.min(5, s.reputation + step));
}

/** How a shopper's mood starts (air conditioning helps). */
export const moodStart = (s: Store) => 0.75 + (hasUpgrade(s, "aircon") ? 0.05 : 0);
/** Share of shoppers who pay by card. */
export const cardShare = (s: Store, kind: ShopperKind = "regular") => Math.max(0.05, Math.min(0.97, (hasUpgrade(s, "tap") ? 0.85 : 0.62) + SHOPPER_TYPES[kind].card));
/** How long (game minutes of patience, roughly) a shopper will queue. */
export const patienceOf = (s: Store, rng: Rng, kind: ShopperKind = "regular") => (25 + rng.next() * 20) * (hasUpgrade(s, "doors") ? 1.15 : 1) * SHOPPER_TYPES[kind].patience;

/** Some shoppers leave with a review: the stars follow their mood, the words their reason. */
export function writeReview(s: Store, mood: number, reason: Reason, rng: Rng): Review | null {
  if (rng.next() > 0.3) return null;
  const stars = Math.max(1, Math.min(5, Math.round(mood * 5 + 0.4)));
  const lines = REVIEW_LINES[stars >= 4 && reason === "ok" ? "great" : reason];
  const r: Review = { day: s.day, stars, text: lines[Math.floor(rng.next() * lines.length)], who: REVIEWERS[Math.floor(rng.next() * REVIEWERS.length)] };
  s.reviews = [r, ...(s.reviews ?? [])].slice(0, 20);
  return r;
}

/** The average of the latest reviews, or null before there are any. */
export function rating(s: Store) {
  const r = s.reviews ?? [];
  return r.length ? r.reduce((a, x) => a + x.stars, 0) / r.length : null;
}

// --------------------------------------------------------------- shoplifters

/** The chance a shopper tries to walk out without paying. */
export const theftChance = (s: Store) => (s.day <= 1 ? 0 : 0.04 * (hasUpgrade(s, "cctv") ? 0.5 : 1));
/** The chance your guards stop a shoplifter at the door (each guard has a go). */
export const guardCatch = (s: Store) => 1 - s.staff.filter((st) => st.role === "guard").reduce((miss, st) => miss * (0.15 - 0.03 * (levelOfStaff(st) - 1)), 1);

/** Caught: the goods go back in the stockroom and the town hears about it. */
export function catchThief(s: Store, basket: { product: ProductId }[]) {
  for (const b of basket) s.storage[b.product] = (s.storage[b.product] ?? 0) + 1;
  s.today.caught = (s.today.caught ?? 0) + 1;
  life(s).caught++;
  s.xp += 5;
  s.reputation = Math.min(5, s.reputation + 0.03);
}

/** Got away: the goods are gone. */
export function theftLoss(s: Store, basket: { price: number }[]) {
  s.today.stolen = (s.today.stolen ?? 0) + basket.reduce((a, b) => a + b.price, 0);
}

// ------------------------------------------------------------------ specials

/** How many products can be on special at once: one, plus one per promo stand, up to the edition's limit. */
export const specialSlots = (s: Store) => Math.min(EDITIONS[s.tier].specials, 1 + s.fixtures.filter((f) => f.kind === "promo").length);

/** Put a product on special (20% off: it sells faster and brings people in) or take it off. */
export function toggleSpecial(s: Store, id: ProductId): Result {
  s.specials ??= [];
  if (s.specials.includes(id)) {
    s.specials = s.specials.filter((x) => x !== id);
    return yes;
  }
  if (!s.licences.includes(PRODUCTS[id].cat)) return no("You need the licence first");
  const n = specialSlots(s);
  if (s.specials.length >= n) return no(n < EDITIONS[s.tier].specials ? "Build a promo stand for another special" : `${n} special${n > 1 ? "s" : ""} at a time`);
  s.specials.push(id);
  return yes;
}

// ------------------------------------------------------------------ upgrades

export function buyUpgrade(s: Store, id: UpgradeId): Result {
  const u: UpgradeDef = UPGRADES[id];
  s.upgrades ??= [];
  if (s.upgrades.includes(id)) return no("Already fitted");
  if (u.ultimate && s.tier !== "ultimate") return no("Ultimate edition only");
  if (levelOf(s.xp) < u.level) return no(`Reach level ${u.level} first`);
  const r = spend(s, u.price);
  if (r.ok) s.upgrades.push(id);
  return r;
}

// --------------------------------------------------------------------- loans

export function takeLoan(s: Store, kind: LoanKind): Result {
  const l = LOANS[kind];
  if (s.loan) return no("Pay off your loan first");
  if (l.ultimate && s.tier !== "ultimate") return no("Ultimate edition only");
  const left = Math.round(l.amount * (1 + l.rate));
  s.cash += l.amount;
  s.loan = { kind, left, daily: Math.ceil(left / l.days) };
  return yes;
}

export function repayLoan(s: Store): Result {
  if (!s.loan) return no("No loan to pay off");
  const r = spend(s, s.loan.left);
  if (r.ok) s.loan = null;
  return r;
}

// ---------------------------------------------------------------- trophies

/** Award any trophies just earned: cash and 50 XP each. Returns them. */
export function checkMilestones(s: Store): Milestone[] {
  s.milestones ??= [];
  const out: Milestone[] = [];
  for (const m of MILESTONES) {
    if (s.milestones.includes(m.id) || !m.done(s)) continue;
    s.milestones.push(m.id);
    s.cash += m.reward;
    s.xp += 50;
    out.push(m);
  }
  return out;
}

/** Overnight, fresh food goes off: a share of every perishable line, stockroom first. Returns the cost thrown out. */
export function spoil(s: Store) {
  let cost = 0;
  for (const id of PRODUCT_IDS) {
    const p: Product = PRODUCTS[id];
    if (!p.spoil) continue;
    const onShelves = s.fixtures.reduce((a, f) => a + f.slots.reduce((b, sl) => b + (sl.product === id ? sl.qty : 0), 0), 0);
    let lose = Math.floor((onShelves + (s.storage[id] ?? 0)) * p.spoil);
    if (!lose) continue;
    cost += lose * p.cost;
    const fromStore = Math.min(lose, s.storage[id] ?? 0);
    if (fromStore) s.storage[id] = (s.storage[id] ?? 0) - fromStore;
    lose -= fromStore;
    for (const f of s.fixtures)
      for (const sl of f.slots)
        if (lose > 0 && sl.product === id) {
          const k = Math.min(lose, sl.qty);
          sl.qty -= k;
          lose -= k;
        }
  }
  return cost;
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
    const cost = orderCost(s, id, buy);
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
  const sweeps = s.staff.filter((o) => o.role === "cleaner").reduce((a, st) => a + 1 + levelOfStaff(st), 0);
  for (let i = 0; i < sweeps && s.mess?.length; i++) {
    s.mess.shift();
    s.today.cleaned = (s.today.cleaned ?? 0) + 1;
  }
  if (!s.staff.some((o) => o.role === "stocker")) return 0;
  let moved = 0;
  // A better stocker tops up sooner: below half at level 1, below 90% at level 5.
  const below = 0.5 + 0.1 * (skill(s, "stocker") - 1);
  for (const f of s.fixtures) if (f.slots.some((sl) => sl.product && sl.qty < PRODUCTS[sl.product].slot * below)) moved += restock(s, f.id);
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
export function endDay(s: Store, date?: Date): DayReport {
  claimGoals(s, true);
  const goalPay = (s.goals ?? []).filter((g) => g.done).reduce((a, g) => a + g.reward, 0);
  const t = s.today;
  const rent = sizeOf(s).rent;
  const late = hasUpgrade(s, "late") ? 1.15 : 1;
  const wages = Math.round(s.staff.reduce((a, st) => a + wageOf(st), 0) * late);
  const power = Math.round(s.fixtures.reduce((a, f) => a + FIXTURES[f.kind].power, 0) * (hasUpgrade(s, "led") ? 0.7 : 1) * late);
  s.cash -= rent + wages + power;
  const waste = spoil(s);
  let loan = 0;
  if (s.loan) {
    loan = Math.min(s.loan.daily, s.loan.left);
    s.cash -= loan;
    s.loan.left -= loan;
    if (s.loan.left <= 0) s.loan = null;
  }
  const profit = t.revenue - t.cogs - rent - wages - power - t.tillError - waste - (t.stolen ?? 0) + goalPay;
  const xp = Math.max(10, Math.round(t.revenue / 1000 + t.customers * 2 - t.unhappy * 3));
  s.xp += xp;
  const l = life(s);
  l.days++;
  l.bestDay = Math.max(l.bestDay, t.revenue);
  const report: DayReport = { ...t, sold: { ...t.sold }, day: s.day, rent, wages, power, profit, xp, reputation: s.reputation, goals: goalPay, event: s.event ?? null, waste, loan };
  // The rival opens on day 6 and grows, unless you fight back with marketing and service.
  if (!s.rival && s.day + 1 >= RIVAL_DAY) {
    s.rival = { name: RIVAL_NAME, strength: 0.15 };
    report.rivalOpened = true;
  } else if (s.rival) {
    const fight = (s.campaign && s.campaign.until >= s.day ? 0.06 : 0) + (s.reputation >= 4 ? 0.02 : 0) + (s.promise === s.day ? 0.03 : 0);
    s.rival.strength = Math.max(0.05, Math.min(0.45, s.rival.strength + 0.02 - fight));
  }
  // Experience: a level every five days worked, up to 3.
  const promoted: string[] = [];
  for (const st of s.staff) {
    st.days = (st.days ?? 0) + 1;
    if (st.days % 5 === 0 && levelOfStaff(st) < EXPERIENCE_MAX) {
      st.level = levelOfStaff(st) + 1;
      promoted.push(st.name);
    }
  }
  if (promoted.length) report.promoted = promoted;
  // Every seventh evening, the week in review.
  if (s.day % 7 === 0) {
    const days = [...s.history.slice(-6), report];
    const sold: Partial<Record<ProductId, number>> = {};
    for (const d of days) for (const [k, n] of Object.entries(d.sold)) sold[k as ProductId] = (sold[k as ProductId] ?? 0) + (n ?? 0);
    const best = (Object.entries(sold).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as ProductId | undefined) ?? null;
    report.week = { week: s.day / 7, revenue: days.reduce((a, d) => a + d.revenue, 0), profit: days.reduce((a, d) => a + d.profit, 0), customers: days.reduce((a, d) => a + d.customers, 0), best };
  }
  s.day++;
  s.minute = OPEN - 30;
  s.today = freshStats();
  if (s.campaign && s.campaign.until < s.day) s.campaign = null;
  // Overnight: the cleaners come in, standing orders arrive, and a new day brings its own event and goals.
  s.mess = [];
  s.event = eventFor(s.seed, s.day, date);
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
  for (const u of s.upgrades ?? []) v += Math.floor(UPGRADES[u].price * 0.5);
  // Debts come off.
  v -= s.loan?.left ?? 0;
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
    // Saves from before the big expansion.
    s.specials = (s.specials ?? []).filter((id) => id in PRODUCTS).slice(0, EDITIONS[tier].specials);
    s.upgrades = (s.upgrades ?? []).filter((id) => id in UPGRADES);
    s.reviews ??= [];
    s.milestones ??= [];
    s.lifetime ??= {
      ...freshLifetime(),
      days: s.history.length,
      customers: s.history.reduce((a, r) => a + r.customers, 0),
      revenue: s.history.reduce((a, r) => a + r.revenue, 0),
      bestDay: s.history.reduce((a, r) => Math.max(a, r.revenue), 0),
    };
    s.loan ??= null;
    s.rival ??= null;
    s.press ??= [];
    s.staff = s.staff.filter((st) => st.role in STAFF);
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
