/**
 * WareForge data: the goods, the machines that make them, the sites you can run, the carriers,
 * suppliers and customers you trade with, upgrades and goals. Everything the simulation reads
 * and nothing it writes.
 */
export const GAME_SLUG = "wareforge";
export const SAVE_KEY = "zx-wareforge-save";
export const PREFS_KEY = "zx-wareforge-prefs";

/** Game seconds that pass per real second at 1× speed (a game hour is two real minutes). */
export const GAME_SECS_PER_REAL = 30;
export const SPEEDS = [1, 2, 4, 8] as const;
/** The season: five days, then the score is final (play carries on). */
export const SEASON_DAYS = 5;
export const DAY = 86_400;
export const HOUR = 3_600;
export const MIN = 60;

/* ------------------------------------------------------------------ goods */

export type ItemId =
  | "steel" | "plastic" | "wood" | "fabric" | "electronics" | "rubber"
  | "frame" | "shell" | "panel" | "board"
  | "bicycle" | "chair" | "helmet" | "phone" | "toolkit";

export type Tier = "raw" | "part" | "goods";

export interface Item {
  id: ItemId;
  name: string;
  /** Short SKU code shown on pallets. */
  sku: string;
  tier: Tier;
  /** What a pallet sells for (customers pay around this; buying finished or part goods costs more than making them). */
  price: number;
  /** Units on a pallet and what one weighs (kg), for the inspector. */
  units: number;
  kg: number;
  /** The colour of the load (cardboard, wrap, coil…). */
  load: string;
  icon: string;
}

export const ITEMS: Record<ItemId, Item> = {
  steel: { id: "steel", name: "Steel coil", sku: "STL", tier: "raw", price: 260, units: 4, kg: 220, load: "#9aa4b1", icon: "⚙️" },
  plastic: { id: "plastic", name: "Plastic pellets", sku: "PLA", tier: "raw", price: 180, units: 40, kg: 25, load: "#f1f3f6", icon: "🧪" },
  wood: { id: "wood", name: "Timber", sku: "TMB", tier: "raw", price: 150, units: 24, kg: 30, load: "#d9a86c", icon: "🪵" },
  fabric: { id: "fabric", name: "Fabric rolls", sku: "FAB", tier: "raw", price: 200, units: 30, kg: 18, load: "#c9b8e8", icon: "🧵" },
  electronics: { id: "electronics", name: "Electronic parts", sku: "ELC", tier: "raw", price: 520, units: 60, kg: 6, load: "#cfd6de", icon: "🔌" },
  rubber: { id: "rubber", name: "Rubber", sku: "RUB", tier: "raw", price: 170, units: 36, kg: 20, load: "#4a4d55", icon: "⚫" },
  frame: { id: "frame", name: "Steel frame", sku: "FRM", tier: "part", price: 520, units: 20, kg: 14, load: "#b9c2cc", icon: "🔩" },
  shell: { id: "shell", name: "Moulded shell", sku: "SHL", tier: "part", price: 400, units: 60, kg: 2, load: "#d8b98b", icon: "🥚" },
  panel: { id: "panel", name: "Wood panel", sku: "PNL", tier: "part", price: 340, units: 30, kg: 12, load: "#e2b77d", icon: "🟫" },
  board: { id: "board", name: "Circuit board", sku: "PCB", tier: "part", price: 1000, units: 120, kg: 1, load: "#d4bc8e", icon: "🟩" },
  bicycle: { id: "bicycle", name: "City bicycle", sku: "BIK", tier: "goods", price: 1180, units: 12, kg: 15, load: "#5d8cf0", icon: "🚲" },
  chair: { id: "chair", name: "Office chair", sku: "CHR", tier: "goods", price: 840, units: 16, kg: 13, load: "#6d95f2", icon: "🪑" },
  helmet: { id: "helmet", name: "PPE Safety Helmet", sku: "HLM", tier: "goods", price: 800, units: 82, kg: 0.7, load: "#4f86ee", icon: "⛑️" },
  phone: { id: "phone", name: "Smartphone", sku: "PHN", tier: "goods", price: 2350, units: 200, kg: 0.4, load: "#3f74e6", icon: "📱" },
  toolkit: { id: "toolkit", name: "Tool kit", sku: "TLK", tier: "goods", price: 1080, units: 40, kg: 6, load: "#6a9df5", icon: "🧰" },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const RAW: ItemId[] = ITEM_IDS.filter((i) => ITEMS[i].tier === "raw");
export const GOODS: ItemId[] = ITEM_IDS.filter((i) => ITEMS[i].tier === "goods");
export const PARTS: ItemId[] = ITEM_IDS.filter((i) => ITEMS[i].tier === "part");

/** What a pallet costs to buy: raw at list price, parts and finished goods from the wholesaler at a markup over making them. */
export const buyPrice = (item: ItemId) => Math.round(ITEMS[item].price * (ITEMS[item].tier === "raw" ? 1 : 0.8));

/* ------------------------------------------------------------------ machines */

export type MachineType = "press" | "saw" | "smt" | "assembly";

export interface Recipe {
  inputs: ItemId[];
  output: ItemId;
  /** Game seconds per pallet. */
  secs: number;
}

export interface MachineDef {
  type: MachineType;
  name: string;
  /** Footprint in tiles (width along x, depth along z). Inputs feed the left column, outputs leave the right. */
  w: number;
  d: number;
  cost: number;
  /** Running cost per game hour. */
  upkeep: number;
  recipes: Recipe[];
  color: string;
  blurb: string;
}

export const MACHINES: Record<MachineType, MachineDef> = {
  press: {
    type: "press", name: "Stamping Press", w: 4, d: 2, cost: 12_000, upkeep: 30, color: "#5b7cf6",
    blurb: "Presses steel into frames and moulds pellets into shells.",
    recipes: [
      { inputs: ["steel"], output: "frame", secs: 8 * MIN },
      { inputs: ["plastic"], output: "shell", secs: 6 * MIN },
    ],
  },
  saw: {
    type: "saw", name: "CNC Saw", w: 3, d: 2, cost: 8_000, upkeep: 20, color: "#f59e3b",
    blurb: "Cuts timber into panels.",
    recipes: [{ inputs: ["wood"], output: "panel", secs: 6 * MIN }],
  },
  smt: {
    type: "smt", name: "SMT Line", w: 5, d: 2, cost: 22_000, upkeep: 45, color: "#22b8a6",
    blurb: "Places components on boards, fast and precise.",
    recipes: [{ inputs: ["electronics"], output: "board", secs: 10 * MIN }],
  },
  assembly: {
    type: "assembly", name: "Assembly Cell", w: 4, d: 3, cost: 15_000, upkeep: 35, color: "#a46bf5",
    blurb: "Puts parts together into finished goods.",
    recipes: [
      { inputs: ["frame", "rubber"], output: "bicycle", secs: 12 * MIN },
      { inputs: ["panel", "fabric"], output: "chair", secs: 9 * MIN },
      { inputs: ["shell", "fabric"], output: "helmet", secs: 8 * MIN },
      { inputs: ["board", "shell"], output: "phone", secs: 14 * MIN },
      { inputs: ["frame", "panel"], output: "toolkit", secs: 10 * MIN },
    ],
  },
};
export const MACHINE_TYPES = Object.keys(MACHINES) as MachineType[];

/* ------------------------------------------------------------------ storage */

export const RACK = { cost: 600, w: 2, d: 1, levels: 2, name: "Pallet rack", blurb: "Two bays, two levels: four pallets. Picked from the front." };
export const FLOOR = { cost: 150, w: 2, d: 2, name: "Floor block", blurb: "A marked 2×2 block for four pallets, picked from any side." };
export const FORKLIFT_COST = 9_000;
export const FORKLIFT_WAGE = 40; // per game hour
export const MAX_FORKLIFTS = 10;
/** Fork speed in tiles per game second, and how long picking up or setting down takes. */
export const FORK_SPEED = 0.1;
export const FORK_HANDLE = 10;
/** Trucks: driving in, backing onto the door, pulling away (game seconds each). */
export const TRUCK_PHASE = 60;
/** Money for every game minute a truck waits over an hour on site. */
export const DETENTION_PER_MIN = 3;

/* ------------------------------------------------------------------ the site plan */

/** The grid: x along the dock wall, z from the back wall to the road. */
export const GRID_W = 44;
export const GRID_H = 34;
export const BACK_Z = 2; // first row inside
export const AISLE_Z = [15, 16]; // the main aisle, kept clear
export const STAGE_Z = [17, 18]; // staging lanes behind each door
export const APRON_Z = 19; // clear apron along the dock wall
export const DOCK_Z = 20; // the dock wall
export const ROAD_Z = 30;
export const doorX0 = (i: number) => 3 + i * 4;
export const MAX_DOORS = 10;
/** Inside width before and after the expansion. */
export const WIDTH_BASE = 26;
export const WIDTH_FULL = 42;

export type DoorType = "in" | "out" | "flex";

export interface SiteDef {
  id: string;
  code: string;
  name: string;
  blurb: string;
  cash: number;
  rent: number; // per game hour
  doors: DoorType[];
  forklifts: number;
  expanded: boolean;
  racks: [number, number][]; // rack origins (all facing the aisle)
  machines: { type: MachineType; x: number; z: number; recipe: number }[];
  stock: Partial<Record<ItemId, number>>;
  /** How busy customers are here (orders per game hour, by day). */
  demand: number;
  goodsMix: ItemId[];
  difficulty: "Easy" | "Normal" | "Hard";
}

const rackRow = (z: number, x0: number, x1: number) => {
  const out: [number, number][] = [];
  for (let x = x0; x + 1 <= x1; x += 2) out.push([x, z]);
  return out;
};

export const SITES: SiteDef[] = [
  {
    id: "wh01", code: "WH-01", name: "Riverside Hub", difficulty: "Easy",
    blurb: "A tidy distribution centre by the river. Racks full of stock, two forklifts and steady customers. Learn the dock.",
    cash: 60_000, rent: 110, doors: ["out", "out", "in", "in", "flex"], forklifts: 2, expanded: false,
    racks: [...rackRow(3, 3, 25), ...rackRow(7, 3, 13), ...rackRow(7, 15, 25), ...rackRow(11, 3, 13)],
    machines: [],
    stock: { helmet: 8, chair: 5, bicycle: 4, toolkit: 4, phone: 2, plastic: 3, fabric: 3 },
    demand: 2.2, goodsMix: ["helmet", "chair", "bicycle", "toolkit", "phone"],
  },
  {
    id: "wh04", code: "WH-04", name: "Southfield Cross-Dock", difficulty: "Normal",
    blurb: "A long cross-dock with doors along the whole wall and demanding retail customers. Turn trucks round fast.",
    cash: 45_000, rent: 150, doors: ["out", "out", "out", "in", "in", "in", "flex", "flex"], forklifts: 3, expanded: true,
    racks: [...rackRow(3, 3, 41), ...rackRow(7, 3, 21)],
    machines: [],
    stock: { chair: 4, helmet: 4, toolkit: 3, bicycle: 2 },
    demand: 3.4, goodsMix: ["chair", "helmet", "toolkit", "bicycle", "phone"],
  },
  {
    id: "wh07", code: "WH-07", name: "Northgate Works", difficulty: "Hard",
    blurb: "An old factory: a press and an assembly cell already on the floor. Buy materials, make goods, ship them.",
    cash: 70_000, rent: 190, doors: ["out", "in", "flex", "out"], forklifts: 2, expanded: false,
    racks: [...rackRow(3, 3, 25), ...rackRow(7, 3, 11)],
    machines: [
      { type: "press", x: 13, z: 8, recipe: 1 },
      { type: "assembly", x: 19, z: 8, recipe: 2 },
    ],
    stock: { plastic: 4, fabric: 4, steel: 2, rubber: 2 },
    demand: 1.8, goodsMix: ["helmet", "bicycle", "chair", "toolkit", "phone"],
  },
];
export const siteDef = (id: string) => SITES.find((s) => s.id === id) ?? SITES[0];

/* ------------------------------------------------------------------ trade partners */

export interface Carrier {
  name: string;
  color: string;
  stripe: string;
}
export const CARRIERS: Carrier[] = [
  { name: "Bluepeak", color: "#2f6fe4", stripe: "#9cc3ff" },
  { name: "Cargoviva", color: "#f0743a", stripe: "#ffd2b8" },
  { name: "Northline", color: "#1f9d74", stripe: "#a8ecd2" },
  { name: "Redfox Freight", color: "#d94848", stripe: "#ffc0c0" },
  { name: "Gullwing", color: "#7c5cf0", stripe: "#d6c9ff" },
];

export interface Supplier {
  name: string;
  items: ItemId[];
  /** Lead time range in game minutes. */
  lead: [number, number];
  /** Price factor. */
  factor: number;
}
export const SUPPLIERS: Supplier[] = [
  { name: "Ironvale Steel", items: ["steel", "rubber"], lead: [40, 80], factor: 1 },
  { name: "Polymer & Co.", items: ["plastic", "fabric"], lead: [30, 60], factor: 1 },
  { name: "Timberline", items: ["wood"], lead: [30, 60], factor: 1 },
  { name: "Circuitra", items: ["electronics"], lead: [60, 110], factor: 1 },
  { name: "Wholesale Direct", items: [...PARTS, ...GOODS], lead: [50, 100], factor: 1 },
];
export const supplierFor = (item: ItemId) => SUPPLIERS.find((s) => s.items.includes(item)) ?? SUPPLIERS[SUPPLIERS.length - 1];

export interface Customer {
  name: string;
  likes: ItemId[];
}
export const CUSTOMERS: Customer[] = [
  { name: "SafeWork PPE", likes: ["helmet"] },
  { name: "Cyclo Sports", likes: ["bicycle", "helmet"] },
  { name: "Homestead Furniture", likes: ["chair"] },
  { name: "Volt Mobile", likes: ["phone"] },
  { name: "Fixit Hardware", likes: ["toolkit", "helmet"] },
  { name: "Brightmart", likes: ["chair", "toolkit", "bicycle", "phone"] },
  { name: "OfficeHub", likes: ["chair", "phone"] },
  { name: "Trailhead Outdoors", likes: ["bicycle", "helmet", "toolkit"] },
];

export interface City {
  name: string;
  /** Transit time in game minutes. */
  transit: number;
}
export const CITIES: City[] = [
  { name: "Philadelphia", transit: 70 },
  { name: "Baltimore", transit: 110 },
  { name: "Newark", transit: 90 },
  { name: "Boston", transit: 200 },
  { name: "Pittsburgh", transit: 210 },
  { name: "Hartford", transit: 150 },
  { name: "Richmond", transit: 180 },
  { name: "Albany", transit: 170 },
  { name: "Buffalo", transit: 260 },
  { name: "Cleveland", transit: 280 },
];

/* ------------------------------------------------------------------ upgrades */

export type UpgradeId =
  | "fast1" | "fast2" | "levellers" | "crew" | "lean" | "slotting" | "highbay" | "scanner"
  | "express" | "buyer" | "door" | "expand" | "sales" | "night";

export interface Upgrade {
  id: UpgradeId;
  name: string;
  cost: number;
  body: string;
  needs?: UpgradeId;
  icon: string;
}

export const UPGRADES: Upgrade[] = [
  { id: "fast1", name: "Fast forklifts I", cost: 6_000, icon: "⚡", body: "New drive units: forklifts drive 20% faster." },
  { id: "fast2", name: "Fast forklifts II", cost: 14_000, icon: "⚡", needs: "fast1", body: "Lithium packs: forklifts drive 40% faster." },
  { id: "levellers", name: "Dock levellers", cost: 8_000, icon: "🛗", body: "Loading and unloading at the doors takes 40% less time." },
  { id: "scanner", name: "Barcode scanners", cost: 5_000, icon: "📟", body: "Picking up and setting down pallets is twice as quick." },
  { id: "slotting", name: "Smart slotting", cost: 7_000, icon: "🧭", body: "Put fast movers away near the doors and pick from the nearest slot." },
  { id: "highbay", name: "High-bay racking", cost: 12_000, icon: "🏗️", body: "Every rack gains a third level: six pallets a rack." },
  { id: "crew", name: "Maintenance crew", cost: 9_000, icon: "🔧", body: "Machines wear 40% slower and the crew repairs breakdowns by itself." },
  { id: "lean", name: "Lean production", cost: 11_000, icon: "📉", body: "Kaizen on every line: machine cycles 20% shorter." },
  { id: "express", name: "Express carriers", cost: 8_000, icon: "🚚", body: "Premium lanes: shipments reach customers 25% sooner." },
  { id: "buyer", name: "Purchasing desk", cost: 6_000, icon: "🤝", body: "A buyer who haggles: materials and stock cost 8% less." },
  { id: "sales", name: "Sales team", cost: 10_000, icon: "📈", body: "More orders, and customers pay 6% more." },
  { id: "night", name: "Night shift", cost: 7_000, icon: "🌙", body: "Customers order through the night as much as the day." },
  { id: "door", name: "Extra dock door", cost: 10_000, icon: "🚪", body: "Cut another door into the dock wall (you can buy this more than once)." },
  { id: "expand", name: "Site expansion", cost: 30_000, icon: "📐", body: "Take the building next door: the floor nearly doubles, with room for more doors." },
];
export const upgrade = (id: UpgradeId) => UPGRADES.find((u) => u.id === id)!;

/* ------------------------------------------------------------------ goals */

export interface GoalDef {
  id: string;
  name: string;
  body: string;
  reward: number;
}
export const GOALS: GoalDef[] = [
  { id: "unload", name: "First delivery in", body: "Unload an inbound truck.", reward: 1_000 },
  { id: "ship1", name: "Out the door", body: "Deliver your first order.", reward: 1_500 },
  { id: "ship10", name: "Regulars", body: "Deliver 10 orders.", reward: 5_000 },
  { id: "rush", name: "Against the clock", body: "Deliver a rush order on time.", reward: 3_000 },
  { id: "ontime", name: "Like clockwork", body: "Keep on-time delivery at 95% or better over 20 deliveries.", reward: 8_000 },
  { id: "machine", name: "Makers", body: "Build a production machine.", reward: 2_000 },
  { id: "made10", name: "Made here", body: "Manufacture 10 pallets of finished goods.", reward: 4_000 },
  { id: "phone", name: "High tech", body: "Make a pallet of smartphones.", reward: 5_000 },
  { id: "stock150", name: "Deep stock", body: "Hold 150 pallets at once.", reward: 3_000 },
  { id: "fleet4", name: "Fleet", body: "Run four forklifts.", reward: 2_000 },
  { id: "rev100", name: "Six figures", body: "Take $100,000 in revenue.", reward: 10_000 },
  { id: "worth250", name: "Tycoon", body: "Reach $250,000 net worth.", reward: 0 },
];
