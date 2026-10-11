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
  | "copper" | "cells"
  | "frame" | "shell" | "panel" | "board" | "motor" | "battery"
  | "bicycle" | "chair" | "helmet" | "phone" | "toolkit" | "ebike" | "drone" | "laptop"
  | "icecream" | "vaccine" | "seafood"
  // The industry update: food and drink, fashion, automotive, pharma and beauty.
  | "wheat" | "milk" | "sugar" | "fruit" | "cocoa" | "flour" | "bread" | "cake" | "cheese" | "juice" | "chocolate"
  | "cotton" | "dye" | "leather" | "cloth" | "tshirt" | "jeans" | "sneakers" | "jacket"
  | "aluminium" | "glass" | "body" | "engine" | "tyres" | "car"
  | "chemicals" | "herbs" | "compound" | "medicine" | "cosmetics" | "perfume"
  // The tycoon update: a new product in every trade.
  | "ecar" | "pizza" | "handbag" | "vitamins" | "sofa"
  // The build update: mining, and the materials buildings are made of.
  | "ore" | "coal" | "stone" | "clay" | "sand" | "goldore" | "gravel"
  | "bricks" | "rooftiles" | "cement" | "concrete" | "beams" | "goldbar" | "jewellery";

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
  /** Frozen: must be kept in a freezer rack, or it spoils. */
  frozen?: boolean;
}

export const ITEMS: Record<ItemId, Item> = {
  steel: { id: "steel", name: "Steel coil", sku: "STL", tier: "raw", price: 260, units: 4, kg: 220, load: "#9aa4b1", icon: "⚙️" },
  plastic: { id: "plastic", name: "Plastic pellets", sku: "PLA", tier: "raw", price: 180, units: 40, kg: 25, load: "#f1f3f6", icon: "🧪" },
  wood: { id: "wood", name: "Timber", sku: "TMB", tier: "raw", price: 150, units: 24, kg: 30, load: "#d9a86c", icon: "🪵" },
  fabric: { id: "fabric", name: "Fabric rolls", sku: "FAB", tier: "raw", price: 200, units: 30, kg: 18, load: "#c9b8e8", icon: "🧵" },
  electronics: { id: "electronics", name: "Electronic parts", sku: "ELC", tier: "raw", price: 520, units: 60, kg: 6, load: "#cfd6de", icon: "🔌" },
  rubber: { id: "rubber", name: "Rubber", sku: "RUB", tier: "raw", price: 170, units: 36, kg: 20, load: "#4a4d55", icon: "⚫" },
  copper: { id: "copper", name: "Copper wire", sku: "CPR", tier: "raw", price: 320, units: 12, kg: 40, load: "#c97b4a", icon: "🧶" },
  cells: { id: "cells", name: "Battery cells", sku: "CEL", tier: "raw", price: 640, units: 400, kg: 0.5, load: "#5fb08a", icon: "🔋" },
  frame: { id: "frame", name: "Steel frame", sku: "FRM", tier: "part", price: 520, units: 20, kg: 14, load: "#b9c2cc", icon: "🔩" },
  shell: { id: "shell", name: "Moulded shell", sku: "SHL", tier: "part", price: 400, units: 60, kg: 2, load: "#d8b98b", icon: "🥚" },
  panel: { id: "panel", name: "Wood panel", sku: "PNL", tier: "part", price: 340, units: 30, kg: 12, load: "#e2b77d", icon: "🟫" },
  board: { id: "board", name: "Circuit board", sku: "PCB", tier: "part", price: 1000, units: 120, kg: 1, load: "#d4bc8e", icon: "🟩" },
  motor: { id: "motor", name: "Electric motor", sku: "MTR", tier: "part", price: 760, units: 30, kg: 3, load: "#c8a77a", icon: "🌀" },
  battery: { id: "battery", name: "Battery pack", sku: "BAT", tier: "part", price: 1380, units: 24, kg: 4, load: "#cfb487", icon: "🔋" },
  bicycle: { id: "bicycle", name: "City bicycle", sku: "BIK", tier: "goods", price: 1180, units: 12, kg: 15, load: "#5d8cf0", icon: "🚲" },
  chair: { id: "chair", name: "Office chair", sku: "CHR", tier: "goods", price: 840, units: 16, kg: 13, load: "#6d95f2", icon: "🪑" },
  helmet: { id: "helmet", name: "PPE Safety Helmet", sku: "HLM", tier: "goods", price: 800, units: 82, kg: 0.7, load: "#4f86ee", icon: "⛑️" },
  phone: { id: "phone", name: "Smartphone", sku: "PHN", tier: "goods", price: 2350, units: 200, kg: 0.4, load: "#3f74e6", icon: "📱" },
  toolkit: { id: "toolkit", name: "Tool kit", sku: "TLK", tier: "goods", price: 1080, units: 40, kg: 6, load: "#6a9df5", icon: "🧰" },
  ebike: { id: "ebike", name: "E-bike", sku: "EBK", tier: "goods", price: 3300, units: 8, kg: 24, load: "#7b6cf2", icon: "🛵" },
  drone: { id: "drone", name: "Camera drone", sku: "DRN", tier: "goods", price: 3000, units: 30, kg: 1.4, load: "#8a6ff0", icon: "🚁" },
  laptop: { id: "laptop", name: "Laptop", sku: "LPT", tier: "goods", price: 3900, units: 50, kg: 2.2, load: "#6a5ce6", icon: "💻" },
  icecream: { id: "icecream", name: "Ice cream", sku: "ICE", tier: "goods", price: 1400, units: 240, kg: 1, load: "#f7b6d2", icon: "🍦", frozen: true },
  vaccine: { id: "vaccine", name: "Vaccines", sku: "VAX", tier: "goods", price: 5200, units: 2000, kg: 0.05, load: "#bfe3f7", icon: "💉", frozen: true },
  seafood: { id: "seafood", name: "Frozen seafood", sku: "SEA", tier: "goods", price: 1900, units: 60, kg: 8, load: "#a9d6e5", icon: "🦐", frozen: true },
  // Food and drink.
  wheat: { id: "wheat", name: "Wheat", sku: "WHT", tier: "raw", price: 220, units: 40, kg: 25, load: "#e8c66a", icon: "🌾" },
  milk: { id: "milk", name: "Milk", sku: "MLK", tier: "raw", price: 280, units: 48, kg: 20, load: "#f4f6fb", icon: "🥛" },
  sugar: { id: "sugar", name: "Sugar", sku: "SUG", tier: "raw", price: 140, units: 50, kg: 20, load: "#fbf7ea", icon: "🍬" },
  fruit: { id: "fruit", name: "Fresh fruit", sku: "FRT", tier: "raw", price: 180, units: 60, kg: 12, load: "#f08a3c", icon: "🍎" },
  cocoa: { id: "cocoa", name: "Cocoa beans", sku: "COC", tier: "raw", price: 300, units: 30, kg: 25, load: "#7a4a2b", icon: "🫘" },
  flour: { id: "flour", name: "Flour", sku: "FLR", tier: "part", price: 420, units: 40, kg: 25, load: "#f3ead8", icon: "🥣" },
  bread: { id: "bread", name: "Bread", sku: "BRD", tier: "goods", price: 650, units: 240, kg: 0.6, load: "#d99a52", icon: "🍞" },
  cake: { id: "cake", name: "Cakes", sku: "CAK", tier: "goods", price: 1500, units: 120, kg: 1, load: "#f2a7c3", icon: "🎂" },
  cheese: { id: "cheese", name: "Cheese", sku: "CHS", tier: "goods", price: 900, units: 160, kg: 1, load: "#f5cf4f", icon: "🧀" },
  juice: { id: "juice", name: "Fruit juice", sku: "JCE", tier: "goods", price: 900, units: 300, kg: 1.1, load: "#f7a43b", icon: "🧃" },
  chocolate: { id: "chocolate", name: "Chocolate", sku: "CHO", tier: "goods", price: 1650, units: 600, kg: 0.2, load: "#8a5a3c", icon: "🍫" },
  // Fashion.
  cotton: { id: "cotton", name: "Raw cotton", sku: "CTN", tier: "raw", price: 220, units: 20, kg: 25, load: "#f6f3ec", icon: "☁️" },
  dye: { id: "dye", name: "Dyes", sku: "DYE", tier: "raw", price: 260, units: 40, kg: 10, load: "#6d5be0", icon: "🎨" },
  leather: { id: "leather", name: "Leather hides", sku: "LTH", tier: "raw", price: 420, units: 20, kg: 6, load: "#a2673f", icon: "🟫" },
  cloth: { id: "cloth", name: "Woven cloth", sku: "CLT", tier: "part", price: 480, units: 30, kg: 12, load: "#7aa3e8", icon: "🪡" },
  tshirt: { id: "tshirt", name: "T-shirts", sku: "TSH", tier: "goods", price: 950, units: 300, kg: 0.2, load: "#4fb3f0", icon: "👕" },
  jeans: { id: "jeans", name: "Jeans", sku: "JNS", tier: "goods", price: 1450, units: 120, kg: 0.7, load: "#3b5ea8", icon: "👖" },
  sneakers: { id: "sneakers", name: "Sneakers", sku: "SNK", tier: "goods", price: 1600, units: 60, kg: 1, load: "#eef1f6", icon: "👟" },
  jacket: { id: "jacket", name: "Leather jackets", sku: "JKT", tier: "goods", price: 2100, units: 40, kg: 1.5, load: "#5a3a2a", icon: "🧥" },
  // Automotive.
  aluminium: { id: "aluminium", name: "Aluminium ingots", sku: "ALU", tier: "raw", price: 900, units: 10, kg: 50, load: "#c9d1db", icon: "🔳" },
  glass: { id: "glass", name: "Glass sheets", sku: "GLS", tier: "raw", price: 400, units: 20, kg: 30, load: "#bfe4ef", icon: "🪟" },
  body: { id: "body", name: "Car body", sku: "BDY", tier: "part", price: 2000, units: 1, kg: 380, load: "#d64545", icon: "🚙" },
  engine: { id: "engine", name: "Engine", sku: "ENG", tier: "part", price: 2200, units: 2, kg: 160, load: "#5c6370", icon: "⛽" },
  tyres: { id: "tyres", name: "Tyres", sku: "TYR", tier: "part", price: 380, units: 16, kg: 11, load: "#2a2d33", icon: "🛞" },
  car: { id: "car", name: "Cars", sku: "CAR", tier: "goods", price: 9_000, units: 1, kg: 1300, load: "#e04848", icon: "🚗" },
  // Pharma and beauty.
  chemicals: { id: "chemicals", name: "Chemicals", sku: "CHM", tier: "raw", price: 900, units: 8, kg: 200, load: "#9ee0c8", icon: "⚗️" },
  herbs: { id: "herbs", name: "Herbs", sku: "HRB", tier: "raw", price: 600, units: 40, kg: 5, load: "#7dbf6a", icon: "🌿" },
  compound: { id: "compound", name: "Active compound", sku: "API", tier: "part", price: 1900, units: 20, kg: 25, load: "#e2f0ff", icon: "🧫" },
  medicine: { id: "medicine", name: "Medicines", sku: "MED", tier: "goods", price: 3600, units: 4000, kg: 0.03, load: "#f7f9fc", icon: "💊" },
  cosmetics: { id: "cosmetics", name: "Cosmetics", sku: "COS", tier: "goods", price: 2600, units: 600, kg: 0.15, load: "#f5b6d6", icon: "💄" },
  perfume: { id: "perfume", name: "Perfume", sku: "PRF", tier: "goods", price: 2400, units: 400, kg: 0.2, load: "#e9c9ff", icon: "🌸" },
  // New in the tycoon update.
  ecar: { id: "ecar", name: "Electric cars", sku: "EVC", tier: "goods", price: 9_800, units: 1, kg: 1700, load: "#3ccf9a", icon: "🔌" },
  pizza: { id: "pizza", name: "Frozen pizza", sku: "PIZ", tier: "goods", price: 1900, units: 300, kg: 0.5, load: "#f2b25c", icon: "🍕", frozen: true },
  handbag: { id: "handbag", name: "Handbags", sku: "BAG", tier: "goods", price: 1800, units: 60, kg: 0.9, load: "#b0603c", icon: "👜" },
  vitamins: { id: "vitamins", name: "Vitamins", sku: "VIT", tier: "goods", price: 2200, units: 2000, kg: 0.08, load: "#ffd86b", icon: "🍊" },
  sofa: { id: "sofa", name: "Sofas", sku: "SOF", tier: "goods", price: 1900, units: 4, kg: 45, load: "#8a7bd8", icon: "🛋️" },
  // Mining: dug from the ground, or bought by the tonne.
  ore: { id: "ore", name: "Iron ore", sku: "ORE", tier: "raw", price: 120, units: 1, kg: 1000, load: "#8a5a44", icon: "🪨" },
  coal: { id: "coal", name: "Coal", sku: "COL", tier: "raw", price: 90, units: 1, kg: 1000, load: "#2b2d33", icon: "⬛" },
  stone: { id: "stone", name: "Limestone", sku: "LST", tier: "raw", price: 80, units: 1, kg: 1000, load: "#d9d3c4", icon: "🏔️" },
  clay: { id: "clay", name: "Clay", sku: "CLY", tier: "raw", price: 70, units: 1, kg: 1000, load: "#c0703f", icon: "🟠" },
  sand: { id: "sand", name: "Sand", sku: "SND", tier: "raw", price: 60, units: 1, kg: 1000, load: "#e9d49a", icon: "⏳" },
  goldore: { id: "goldore", name: "Gold ore", sku: "AUO", tier: "raw", price: 900, units: 1, kg: 800, load: "#b8963c", icon: "🌟" },
  gravel: { id: "gravel", name: "Crushed stone", sku: "AGG", tier: "part", price: 170, units: 1, kg: 1000, load: "#a7a49c", icon: "🔘" },
  // Building materials: sold to builders, and used on your own building sites.
  bricks: { id: "bricks", name: "Bricks", sku: "BRK", tier: "goods", price: 520, units: 750, kg: 2.5, load: "#b5502f", icon: "🧱" },
  rooftiles: { id: "rooftiles", name: "Roof tiles", sku: "TIL", tier: "goods", price: 480, units: 240, kg: 4, load: "#8c3b2a", icon: "🟥" },
  cement: { id: "cement", name: "Cement", sku: "CEM", tier: "goods", price: 560, units: 40, kg: 25, load: "#b9bcc2", icon: "🪣" },
  concrete: { id: "concrete", name: "Concrete blocks", sku: "CON", tier: "goods", price: 1200, units: 60, kg: 18, load: "#9ea3ab", icon: "⬜" },
  beams: { id: "beams", name: "Steel beams", sku: "BEM", tier: "goods", price: 1100, units: 6, kg: 150, load: "#6e7a8c", icon: "📏" },
  goldbar: { id: "goldbar", name: "Gold bars", sku: "BAR", tier: "goods", price: 3200, units: 20, kg: 1, load: "#e8c04a", icon: "🥇" },
  jewellery: { id: "jewellery", name: "Gold jewellery", sku: "JWL", tier: "goods", price: 5400, units: 200, kg: 0.05, load: "#f2d77c", icon: "💍" },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const RAW: ItemId[] = ITEM_IDS.filter((i) => ITEMS[i].tier === "raw");
export const GOODS: ItemId[] = ITEM_IDS.filter((i) => ITEMS[i].tier === "goods");
export const PARTS: ItemId[] = ITEM_IDS.filter((i) => ITEMS[i].tier === "part");
/** The high-tech goods: premium customers order them, the Robot Cell makes them. */
export const HIGH_TECH: ItemId[] = ["ebike", "drone", "laptop"];
/** Frozen goods: the cold chain carries them, freezer racks keep them. */
export const FROZEN: ItemId[] = ITEM_IDS.filter((i) => ITEMS[i].frozen);
/** How long a frozen pallet lasts out of a freezer (game seconds) before it spoils. */
export const THAW_SECS = 150 * 60;

/** What a pallet costs to buy: raw at list price, parts and finished goods from the wholesaler at a markup over making them. */
export const buyPrice = (item: ItemId) => Math.round(ITEMS[item].price * (ITEMS[item].tier === "raw" ? 1 : 0.8));

/* ------------------------------------------------------------------ machines */

export type MachineType =
  | "press" | "saw" | "smt" | "assembly" | "winder" | "packline" | "robot"
  | "mill" | "oven" | "dairy" | "bottler" | "loom" | "sewing" | "shoes" | "bodyshop" | "engines" | "tyreplant" | "carline" | "reactor" | "tablet" | "filler"
  | "quarry" | "mineshaft" | "crusher" | "furnace" | "kiln" | "cementworks" | "goldsmith";

/** How a machine looks on the floor. */
export type MachineStyle = "press" | "saw" | "smt" | "cell" | "oven" | "tank" | "loom" | "line" | "pit" | "shaft" | "crusher" | "furnace" | "kiln";

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
  style: MachineStyle;
}

export const MACHINES: Record<MachineType, MachineDef> = {
  press: {
    type: "press", name: "Stamping Press", w: 4, d: 2, cost: 12_000, upkeep: 30, color: "#5b7cf6", style: "press",
    blurb: "Presses steel into frames and moulds pellets into shells.",
    recipes: [
      { inputs: ["steel"], output: "frame", secs: 8 * MIN },
      { inputs: ["plastic"], output: "shell", secs: 6 * MIN },
    ],
  },
  saw: {
    type: "saw", name: "CNC Saw", w: 3, d: 2, cost: 8_000, upkeep: 20, color: "#f59e3b", style: "saw",
    blurb: "Cuts timber into panels.",
    recipes: [{ inputs: ["wood"], output: "panel", secs: 6 * MIN }],
  },
  smt: {
    type: "smt", name: "SMT Line", w: 5, d: 2, cost: 22_000, upkeep: 45, color: "#22b8a6", style: "smt",
    blurb: "Places components on boards, fast and precise.",
    recipes: [{ inputs: ["electronics"], output: "board", secs: 10 * MIN }],
  },
  assembly: {
    type: "assembly", name: "Assembly Cell", w: 4, d: 3, cost: 15_000, upkeep: 35, color: "#a46bf5", style: "cell",
    blurb: "Puts parts together into finished goods, sofas included.",
    recipes: [
      { inputs: ["frame", "rubber"], output: "bicycle", secs: 12 * MIN },
      { inputs: ["panel", "fabric"], output: "chair", secs: 9 * MIN },
      { inputs: ["shell", "fabric"], output: "helmet", secs: 8 * MIN },
      { inputs: ["board", "shell"], output: "phone", secs: 14 * MIN },
      { inputs: ["frame", "panel"], output: "toolkit", secs: 10 * MIN },
      { inputs: ["frame", "fabric", "panel"], output: "sofa", secs: 12 * MIN },
    ],
  },
  winder: {
    type: "winder", name: "Motor Winder", w: 3, d: 2, cost: 14_000, upkeep: 30, color: "#e0773c", style: "cell",
    blurb: "Winds copper into electric motors.",
    recipes: [{ inputs: ["copper"], output: "motor", secs: 9 * MIN }],
  },
  packline: {
    type: "packline", name: "Cell Pack Line", w: 4, d: 2, cost: 18_000, upkeep: 40, color: "#2fae7e", style: "cell",
    blurb: "Welds cells into battery packs.",
    recipes: [{ inputs: ["cells"], output: "battery", secs: 10 * MIN }],
  },
  robot: {
    type: "robot", name: "Robot Cell", w: 5, d: 3, cost: 32_000, upkeep: 60, color: "#ef4f8b", style: "cell",
    blurb: "Three robot arms build the high-tech goods.",
    recipes: [
      { inputs: ["frame", "motor", "battery"], output: "ebike", secs: 14 * MIN },
      { inputs: ["motor", "board", "shell"], output: "drone", secs: 12 * MIN },
      { inputs: ["board", "battery", "shell"], output: "laptop", secs: 15 * MIN },
    ],
  },
  // Food and drink.
  mill: {
    type: "mill", name: "Flour Mill", w: 3, d: 2, cost: 9_000, upkeep: 20, color: "#d9a441", style: "tank",
    blurb: "Grinds wheat into flour.",
    recipes: [{ inputs: ["wheat"], output: "flour", secs: 5 * MIN }],
  },
  oven: {
    type: "oven", name: "Bakery Oven", w: 4, d: 3, cost: 14_000, upkeep: 35, color: "#e0773c", style: "oven",
    blurb: "Bakes bread, cakes with sugar and milk, and pizza (frozen) with cheese.",
    recipes: [
      { inputs: ["flour"], output: "bread", secs: 6 * MIN },
      { inputs: ["flour", "sugar", "milk"], output: "cake", secs: 9 * MIN },
      { inputs: ["flour", "cheese"], output: "pizza", secs: 8 * MIN },
    ],
  },
  dairy: {
    type: "dairy", name: "Dairy & Chocolate Works", w: 4, d: 3, cost: 16_000, upkeep: 35, color: "#7fb7e8", style: "tank",
    blurb: "Turns milk into cheese and ice cream (frozen), and cocoa, milk and sugar into chocolate.",
    recipes: [
      { inputs: ["milk"], output: "cheese", secs: 10 * MIN },
      { inputs: ["cocoa", "milk", "sugar"], output: "chocolate", secs: 11 * MIN },
      { inputs: ["milk", "sugar"], output: "icecream", secs: 9 * MIN },
    ],
  },
  bottler: {
    type: "bottler", name: "Juice Bottling Line", w: 4, d: 2, cost: 12_000, upkeep: 30, color: "#f2a33a", style: "tank",
    blurb: "Presses fruit, sweetens it and bottles the juice.",
    recipes: [{ inputs: ["fruit", "sugar"], output: "juice", secs: 7 * MIN }],
  },
  // Fashion.
  loom: {
    type: "loom", name: "Weaving Loom", w: 3, d: 2, cost: 11_000, upkeep: 25, color: "#6d7cf0", style: "loom",
    blurb: "Weaves cotton and dye into cloth.",
    recipes: [{ inputs: ["cotton", "dye"], output: "cloth", secs: 7 * MIN }],
  },
  sewing: {
    type: "sewing", name: "Sewing Line", w: 4, d: 2, cost: 13_000, upkeep: 30, color: "#e66aa0", style: "loom",
    blurb: "Sews T-shirts, jeans (with fabric lining), leather jackets and handbags.",
    recipes: [
      { inputs: ["cloth"], output: "tshirt", secs: 6 * MIN },
      { inputs: ["cloth", "fabric"], output: "jeans", secs: 8 * MIN },
      { inputs: ["leather", "cloth"], output: "jacket", secs: 11 * MIN },
      { inputs: ["leather", "fabric"], output: "handbag", secs: 9 * MIN },
    ],
  },
  shoes: {
    type: "shoes", name: "Shoe Line", w: 4, d: 2, cost: 15_000, upkeep: 30, color: "#4bb38a", style: "loom",
    blurb: "Stitches leather and rubber soles into sneakers.",
    recipes: [{ inputs: ["leather", "rubber"], output: "sneakers", secs: 9 * MIN }],
  },
  // Automotive.
  bodyshop: {
    type: "bodyshop", name: "Body Shop", w: 5, d: 2, cost: 38_000, upkeep: 70, color: "#d64545", style: "press",
    blurb: "Presses and welds steel and aluminium into car bodies.",
    recipes: [{ inputs: ["steel", "aluminium"], output: "body", secs: 14 * MIN }],
  },
  engines: {
    type: "engines", name: "Engine Plant", w: 5, d: 2, cost: 42_000, upkeep: 75, color: "#5b6b86", style: "line",
    blurb: "Machines aluminium and copper into engines.",
    recipes: [{ inputs: ["aluminium", "copper"], output: "engine", secs: 16 * MIN }],
  },
  tyreplant: {
    type: "tyreplant", name: "Tyre Plant", w: 3, d: 2, cost: 16_000, upkeep: 30, color: "#3a3f4c", style: "oven",
    blurb: "Moulds and cures rubber into tyres.",
    recipes: [{ inputs: ["rubber"], output: "tyres", secs: 6 * MIN }],
  },
  carline: {
    type: "carline", name: "Car Assembly Line", w: 6, d: 4, cost: 75_000, upkeep: 120, color: "#2f6fe4", style: "line",
    blurb: "Robots marry a body, an engine, tyres and glass: out rolls a car. With a motor and a battery pack instead, an electric car.",
    recipes: [
      { inputs: ["body", "engine", "tyres", "glass"], output: "car", secs: 22 * MIN },
      { inputs: ["body", "motor", "battery", "tyres"], output: "ecar", secs: 24 * MIN },
    ],
  },
  // Pharma and beauty.
  reactor: {
    type: "reactor", name: "Chemical Reactor", w: 3, d: 2, cost: 24_000, upkeep: 45, color: "#3fb6a8", style: "tank",
    blurb: "Synthesises the active compound from chemicals.",
    recipes: [{ inputs: ["chemicals"], output: "compound", secs: 11 * MIN }],
  },
  tablet: {
    type: "tablet", name: "Tablet Press", w: 4, d: 2, cost: 26_000, upkeep: 45, color: "#7c8cf5", style: "smt",
    blurb: "Presses the compound (or herbs, for vitamins) into tablets and seals them in blister packs.",
    recipes: [
      { inputs: ["compound", "plastic"], output: "medicine", secs: 10 * MIN },
      { inputs: ["herbs", "plastic"], output: "vitamins", secs: 8 * MIN },
    ],
  },
  filler: {
    type: "filler", name: "Filling Line", w: 4, d: 2, cost: 20_000, upkeep: 35, color: "#e08ac9", style: "tank",
    blurb: "Fills glass bottles with cosmetics and perfume.",
    recipes: [
      { inputs: ["compound", "glass"], output: "cosmetics", secs: 9 * MIN },
      { inputs: ["herbs", "glass"], output: "perfume", secs: 8 * MIN },
    ],
  },
  // Mining and building materials. The quarry and the mine shaft dig from the ground: no inputs.
  quarry: {
    type: "quarry", name: "Quarry Face", w: 5, d: 3, cost: 30_000, upkeep: 55, color: "#b08a5a", style: "pit",
    blurb: "An excavator works a stepped rock face: limestone, clay or sand, straight from the ground.",
    recipes: [
      { inputs: [], output: "stone", secs: 10 * MIN },
      { inputs: [], output: "clay", secs: 10 * MIN },
      { inputs: [], output: "sand", secs: 8 * MIN },
    ],
  },
  mineshaft: {
    type: "mineshaft", name: "Mine Shaft", w: 4, d: 4, cost: 48_000, upkeep: 80, color: "#c0392b", style: "shaft",
    blurb: "A headframe over a deep shaft: the winding wheel brings up iron ore, coal or, slowly, gold ore.",
    recipes: [
      { inputs: [], output: "ore", secs: 12 * MIN },
      { inputs: [], output: "coal", secs: 10 * MIN },
      { inputs: [], output: "goldore", secs: 30 * MIN },
    ],
  },
  crusher: {
    type: "crusher", name: "Jaw Crusher", w: 3, d: 2, cost: 12_000, upkeep: 25, color: "#e0a03c", style: "crusher",
    blurb: "Breaks limestone into crushed stone for concrete.",
    recipes: [{ inputs: ["stone"], output: "gravel", secs: 4 * MIN }],
  },
  furnace: {
    type: "furnace", name: "Steelworks", w: 4, d: 3, cost: 40_000, upkeep: 70, color: "#5b6b86", style: "furnace",
    blurb: "A blast furnace: smelts iron ore with coal into steel, rolls steel into beams, and refines gold ore into bars.",
    recipes: [
      { inputs: ["ore", "coal"], output: "steel", secs: 9 * MIN },
      { inputs: ["steel", "coal"], output: "beams", secs: 8 * MIN },
      { inputs: ["goldore", "coal"], output: "goldbar", secs: 14 * MIN },
    ],
  },
  kiln: {
    type: "kiln", name: "Brick Kiln", w: 4, d: 2, cost: 18_000, upkeep: 35, color: "#b5502f", style: "kiln",
    blurb: "Fires clay with coal into bricks, clay and sand into roof tiles, and sand into glass.",
    recipes: [
      { inputs: ["clay", "coal"], output: "bricks", secs: 8 * MIN },
      { inputs: ["clay", "sand"], output: "rooftiles", secs: 8 * MIN },
      { inputs: ["sand", "coal"], output: "glass", secs: 9 * MIN },
    ],
  },
  cementworks: {
    type: "cementworks", name: "Cement Works", w: 4, d: 3, cost: 26_000, upkeep: 45, color: "#9ea3ab", style: "tank",
    blurb: "Burns limestone and clay into cement, then mixes cement, crushed stone and sand into concrete blocks.",
    recipes: [
      { inputs: ["stone", "clay"], output: "cement", secs: 9 * MIN },
      { inputs: ["cement", "gravel", "sand"], output: "concrete", secs: 10 * MIN },
    ],
  },
  goldsmith: {
    type: "goldsmith", name: "Goldsmith's Bench", w: 3, d: 2, cost: 22_000, upkeep: 30, color: "#c9a227", style: "cell",
    blurb: "Casts and polishes gold bars into rings, chains and bracelets.",
    recipes: [{ inputs: ["goldbar"], output: "jewellery", secs: 12 * MIN }],
  },
};
/** A machine that digs from the ground (every recipe needs nothing in): no input buffer. */
export const isExtractor = (t: MachineType) => MACHINES[t].recipes.every((r) => r.inputs.length === 0);
export const MACHINE_TYPES = Object.keys(MACHINES) as MachineType[];

/* ------------------------------------------------------------------ industries */

export type IndustryId = "goods" | "tech" | "food" | "fashion" | "pharma" | "auto" | "mining";

export interface Industry {
  id: IndustryId;
  name: string;
  icon: string;
  color: string;
  /** The licence (general goods and electronics come with every site). */
  cost: number;
  blurb: string;
  machines: MachineType[];
  /** What customers in this trade order. */
  goods: ItemId[];
  /** Materials and parts its suppliers sell. */
  inputs: ItemId[];
}

export const INDUSTRIES: Industry[] = [
  {
    id: "goods", name: "General goods", icon: "📦", color: "#2f6fe4", cost: 0,
    blurb: "Bicycles, office chairs, safety helmets and tool kits: pressed, cut and assembled.",
    machines: ["press", "saw", "assembly"], goods: ["bicycle", "chair", "helmet", "toolkit", "sofa"],
    inputs: ["steel", "plastic", "wood", "fabric", "rubber", "frame", "shell", "panel"],
  },
  {
    id: "tech", name: "Electronics & e-mobility", icon: "📱", color: "#7c5cf0", cost: 0,
    blurb: "Smartphones, then e-bikes, drones and laptops for premium accounts.",
    machines: ["smt", "winder", "packline", "robot"], goods: ["phone", "ebike", "drone", "laptop"],
    inputs: ["electronics", "copper", "cells", "board", "motor", "battery"],
  },
  {
    id: "food", name: "Food & drink", icon: "🍞", color: "#e0a03c", cost: 18_000,
    blurb: "Mill flour, bake bread, cakes and pizza, make cheese, chocolate and ice cream, press and bottle juice. Cheap to start, quick to sell (frozen lines need the cold chain).",
    machines: ["mill", "oven", "dairy", "bottler"], goods: ["bread", "cake", "cheese", "juice", "chocolate", "pizza", "icecream"],
    inputs: ["wheat", "milk", "sugar", "fruit", "cocoa", "flour"],
  },
  {
    id: "fashion", name: "Fashion", icon: "👕", color: "#e66aa0", cost: 22_000,
    blurb: "Weave cloth and sew T-shirts, jeans and leather jackets; stitch sneakers. Boutiques love it.",
    machines: ["loom", "sewing", "shoes"], goods: ["tshirt", "jeans", "sneakers", "jacket", "handbag"],
    inputs: ["cotton", "dye", "leather", "cloth"],
  },
  {
    id: "pharma", name: "Pharma & beauty", icon: "💊", color: "#3fb6a8", cost: 40_000,
    blurb: "Synthesise the active compound, press medicines, fill cosmetics and perfume. High value, high margin.",
    machines: ["reactor", "tablet", "filler"], goods: ["medicine", "cosmetics", "perfume", "vitamins"],
    inputs: ["chemicals", "herbs", "glass", "compound"],
  },
  {
    id: "auto", name: "Automotive", icon: "🚗", color: "#d64545", cost: 65_000,
    blurb: "Body shop, engine plant and tyre plant feed a car assembly line. Each car sells for $9,000, an electric one (with a motor and battery pack) $9,800.",
    machines: ["bodyshop", "engines", "tyreplant", "carline"], goods: ["car", "ecar"],
    inputs: ["aluminium", "glass", "body", "engine", "tyres"],
  },
  {
    id: "mining", name: "Mining & materials", icon: "⛏️", color: "#a0703c", cost: 45_000,
    blurb: "Dig your own limestone, clay, sand, ore, coal and gold; fire bricks and roof tiles, burn cement, cast concrete, roll steel beams and refine gold. Builders buy it all, and your own building sites run on it.",
    machines: ["quarry", "mineshaft", "crusher", "furnace", "kiln", "cementworks", "goldsmith"], goods: ["bricks", "rooftiles", "cement", "concrete", "beams", "goldbar", "jewellery"],
    inputs: ["ore", "coal", "stone", "clay", "sand", "goldore", "gravel"],
  },
];
export const industry = (id: IndustryId) => INDUSTRIES.find((x) => x.id === id)!;
/** The industry a machine belongs to. */
export const machineIndustry = (t: MachineType) => INDUSTRIES.find((x) => x.machines.includes(t))?.id ?? "goods";
/** The industry whose customers order a finished good (or whose suppliers sell a material), if it isn't general. */
export const itemIndustry = (item: ItemId): IndustryId | null => INDUSTRIES.find((x) => x.goods.includes(item) || x.inputs.includes(item))?.id ?? null;
/** Pallets of an industry's goods you must make to reach levels 2 and 3 (customers pay 5% and 12% more). */
export const INDUSTRY_LEVELS = [25, 80];

/* ------------------------------------------------------------------ stores */

export type StoreKind = "discount" | "gadget" | "bikes" | "grocery" | "fashion" | "pharmacy" | "cars" | "builders" | "jeweller";

export interface StoreDef {
  kind: StoreKind;
  name: string;
  icon: string;
  ind: IndustryId;
  goods: ItemId[];
  /** To open one in an average city (bigger cities cost more and sell more). */
  cost: number;
  color: string;
}
export const STORES: Record<StoreKind, StoreDef> = {
  discount: { kind: "discount", name: "Discount store", icon: "🏬", ind: "goods", goods: ["helmet", "chair", "toolkit", "bicycle", "sofa"], cost: 20_000, color: "#2f6fe4" },
  gadget: { kind: "gadget", name: "Gadget store", icon: "📱", ind: "tech", goods: ["phone", "laptop", "drone"], cost: 30_000, color: "#7c5cf0" },
  bikes: { kind: "bikes", name: "Bike shop", icon: "🚲", ind: "tech", goods: ["bicycle", "ebike", "helmet"], cost: 22_000, color: "#1f9d74" },
  grocery: { kind: "grocery", name: "Supermarket", icon: "🛒", ind: "food", goods: ["bread", "cake", "cheese", "juice", "chocolate", "icecream", "pizza", "seafood"], cost: 26_000, color: "#e0a03c" },
  fashion: { kind: "fashion", name: "Fashion boutique", icon: "👗", ind: "fashion", goods: ["tshirt", "jeans", "sneakers", "jacket", "handbag"], cost: 24_000, color: "#e66aa0" },
  pharmacy: { kind: "pharmacy", name: "Pharmacy", icon: "💊", ind: "pharma", goods: ["medicine", "cosmetics", "perfume", "vitamins", "vaccine"], cost: 30_000, color: "#3fb6a8" },
  cars: { kind: "cars", name: "Car dealership", icon: "🚗", ind: "auto", goods: ["car", "ecar"], cost: 60_000, color: "#d64545" },
  builders: { kind: "builders", name: "Builders' merchant", icon: "🧱", ind: "mining", goods: ["bricks", "rooftiles", "cement", "concrete", "beams"], cost: 28_000, color: "#a0703c" },
  jeweller: { kind: "jeweller", name: "Jeweller", icon: "💍", ind: "mining", goods: ["jewellery", "goldbar"], cost: 45_000, color: "#c9a227" },
};
export const STORE_KINDS = Object.keys(STORES) as StoreKind[];
/** Shoppers pay this much over the wholesale price; staff are paid by the hour while the store's open. */
export const RETAIL_MARKUP = 1.5;
export const STORE_WAGE = 22;
export const MAX_STORES = 12;
/** Stores trade from 08:00 to 22:00. */
export const STORE_HOURS: [number, number] = [8, 22];

/* ------------------------------------------------------------------ rivals and tenders */

export interface Rival {
  name: string;
  color: string;
  /** How keenly they price (lower bids). */
  edge: number;
}
export const RIVALS: Rival[] = [
  { name: "Apex Logistics", color: "#e0773c", edge: 0.97 },
  { name: "Ironclad Industries", color: "#5b6b86", edge: 1.0 },
  { name: "Nova Retail Group", color: "#d64fa0", edge: 1.03 },
];
/** Tender bids, as a share of the list price. */
export const BID_RANGE: [number, number] = [0.8, 1.25];

/* ------------------------------------------------------------------ managers */

export type ManagerId = "sales" | "supply" | "retail" | "plant";
export interface ManagerDef {
  id: ManagerId;
  name: string;
  icon: string;
  /** Salary per game hour. */
  wage: number;
  body: string;
}
export const MANAGERS: ManagerDef[] = [
  { id: "sales", name: "Sales manager", icon: "🤝", wage: 35, body: "Accepts the offers you have the stock for, most valuable first." },
  { id: "supply", name: "Supply manager", icon: "📋", wage: 35, body: "Keeps every machine's materials coming: orders them before they run out (parts too, if nothing here makes them)." },
  { id: "retail", name: "Retail manager", icon: "🏪", wage: 30, body: "Restocks every store from the warehouse when its shelves run low." },
  { id: "plant", name: "Plant engineer", icon: "👷", wage: 30, body: "Services machines before they wear out, and calls in repairs the moment one breaks." },
];

/* ------------------------------------------------------------------ storage */

export const RACK = { cost: 600, w: 2, d: 1, levels: 2, name: "Pallet rack", blurb: "Two bays, two levels: four pallets. Picked from the front." };
export const FLOOR = { cost: 150, w: 2, d: 2, name: "Floor block", blurb: "A marked 2×2 block for four pallets, picked from any side." };
export const FREEZER = { cost: 2_400, w: 2, d: 1, levels: 2, name: "Freezer rack", blurb: "An insulated rack at −20 °C for four frozen pallets. Frozen goods out of the cold spoil." };
/** Your own trucks (with the Transport depot): no carrier fee, back after each run. */
export const OWN_TRUCK_COST = 28_000;
export const OWN_TRUCK_WAGE = 45; // per game hour
export const MAX_OWN_TRUCKS = 6;
/** Carriers charge a share of each shipment's value. */
export const CARRIER_FEE = 0.06;
/** The bank: credit up to half your net worth, interest per game day. */
export const LOAN_RATE = 0.03;
export const CHARGER = { cost: 2_500, w: 2, d: 1, name: "Charging bay", blurb: "Two chargers. Forklifts drive in when their batteries run low." };
/** Facilities for the people who work here (no pallets): a break room makes drivers quicker, an office brings in more customers, a safety fence shapes the floor. */
export const OFFICE = { cost: 9_000, w: 3, d: 2, name: "Sales office", blurb: "Glass walls, desks and a sales team: customers order 8% more (two count)." };
export const BREAKROOM = { cost: 4_000, w: 2, d: 2, name: "Break room", blurb: "Coffee, a fridge and a sofa: forklift drivers work 5% quicker (three count)." };
export const FENCE = { cost: 40, w: 1, d: 1, name: "Safety fence", blurb: "A yellow barrier, a tile at a time: mark walkways, guard machines and lay out your own aisles. Forklifts go round it." };
/** Air freight: stock flies in four times as fast, for a surcharge and a fee a delivery. */
export const AIR = { surcharge: 1.25, fee: 400, lead: 0.25 };
/** An ad campaign for one trade: more orders for its goods, for a while. */
export const CAMPAIGN = { cost: 6_000, hours: 12 };

/** A conveyor tile: carries a pallet to the next tile (game seconds a tile), from a machine's output to the next machine's input or to an end where forklifts collect. */
export const BELT = { cost: 300, w: 1, d: 1, secs: 20, name: "Conveyor", blurb: "Carries pallets from a machine's output into the next machine, or to an end where forklifts collect them. Forklifts can't cross it." };
/** Battery used per tile driven and per pallet handled; charge per game second. */
export const BATTERY_PER_TILE = 0.0011;
export const BATTERY_PER_LIFT = 0.003;
export const CHARGE_RATE = 1 / (40 * 60);
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
export const GRID_W = 80;
export const GRID_H = 34;
export const BACK_Z = 2; // first row inside
export const AISLE_Z = [15, 16]; // the main aisle, kept clear
export const STAGE_Z = [17, 18]; // staging lanes behind each door
export const APRON_Z = 19; // clear apron along the dock wall
export const DOCK_Z = 20; // the dock wall
export const ROAD_Z = 30;
export const doorX0 = (i: number) => 3 + i * 4;
export const MAX_DOORS = 18;
/** Inside width before and after the expansion. */
export const WIDTH_BASE = 26;
export const WIDTH_FULL = 42;
export const WIDTH_MEGA = 78;
/** The rail siding behind the building: doors in the back wall, the track beyond. */
export const RAIL_DOORS = [9, 17];
export const RAIL_Z = -1.2;
export const RAIL_CAP = 16;

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
  /** The first and second expansions, and the rail siding, already done. */
  mega?: boolean;
  rail?: boolean;
  /** Where the charging bay starts (x, z). */
  charger: [number, number];
  /** What's round the site. */
  theme: "river" | "fields" | "works" | "harbor" | "summit" | "snow" | "quarry";
  /** The cold chain already in place. */
  cold?: boolean;
  /** Freezer racks at the start (origins). */
  freezers?: [number, number][];
  /** Conveyors at the start: tile and direction (0 east, 1 south toward the docks, 2 west, 3 north). */
  belts?: [number, number, number][];
  /** Industry licences that come with the site. */
  industries?: IndustryId[];
  /** Open plan: there's no fixed aisle, so you can build anywhere on the floor short of the dock lanes. */
  openPlan?: boolean;
  /** How busy customers are here (orders per game hour, by day). */
  demand: number;
  goodsMix: ItemId[];
  difficulty: "Easy" | "Normal" | "Hard" | "Expert";
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
    demand: 2.2, goodsMix: ["helmet", "chair", "bicycle", "toolkit", "phone"], charger: [21, 13], theme: "river",
  },
  {
    id: "wh04", code: "WH-04", name: "Southfield Cross-Dock", difficulty: "Normal",
    blurb: "A long cross-dock with doors along the whole wall and demanding retail customers. Turn trucks round fast.",
    cash: 45_000, rent: 150, doors: ["out", "out", "out", "in", "in", "in", "flex", "flex"], forklifts: 3, expanded: true,
    racks: [...rackRow(3, 3, 41), ...rackRow(7, 3, 21)],
    machines: [],
    stock: { chair: 4, helmet: 4, toolkit: 3, bicycle: 2 },
    demand: 3.4, goodsMix: ["chair", "helmet", "toolkit", "bicycle", "phone"], charger: [37, 13], theme: "fields",
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
    demand: 1.8, goodsMix: ["helmet", "bicycle", "chair", "toolkit", "phone"], charger: [3, 13], theme: "works",
  },
  {
    id: "wh09", code: "WH-09", name: "Harbor Gate", difficulty: "Hard",
    blurb: "A port warehouse by the container cranes, with its own rail siding. Big volumes, tight windows and electric goods coming in by sea.",
    cash: 90_000, rent: 240, doors: ["out", "out", "out", "in", "in", "flex", "flex"], forklifts: 4, expanded: true, rail: true,
    racks: [...rackRow(4, 3, 41), ...rackRow(8, 3, 21), ...rackRow(8, 23, 41), ...rackRow(12, 23, 41)],
    machines: [{ type: "winder", x: 5, z: 11, recipe: 0 }],
    stock: { ebike: 3, drone: 3, toolkit: 4, helmet: 4, copper: 3, cells: 2 },
    demand: 3.0, goodsMix: ["ebike", "drone", "toolkit", "helmet", "chair", "laptop"], charger: [14, 13], theme: "harbor",
  },
  {
    id: "wh12", code: "WH-12", name: "Summit Mega DC", difficulty: "Expert",
    blurb: "The mega distribution and manufacturing centre: a hall nearly eighty bays long, fourteen doors, rail, six forklifts and a full production line. Run all of it.",
    cash: 160_000, rent: 460, doors: ["out", "out", "out", "out", "out", "in", "in", "in", "in", "flex", "flex", "out", "in", "flex"], forklifts: 6, expanded: true, mega: true, rail: true,
    racks: [...rackRow(4, 3, 41), ...rackRow(8, 3, 25), ...rackRow(12, 3, 25), ...rackRow(4, 45, 75)],
    machines: [
      { type: "press", x: 28, z: 8, recipe: 0 },
      { type: "winder", x: 34, z: 8, recipe: 0 },
      { type: "packline", x: 46, z: 8, recipe: 0 },
      { type: "smt", x: 52, z: 8, recipe: 0 },
      { type: "robot", x: 60, z: 8, recipe: 0 },
      { type: "assembly", x: 68, z: 8, recipe: 2 },
    ],
    stock: { steel: 4, copper: 4, cells: 4, electronics: 3, plastic: 4, fabric: 4, ebike: 2, laptop: 2, chair: 4, bicycle: 4 },
    demand: 5.5, goodsMix: ["ebike", "laptop", "drone", "bicycle", "chair", "helmet", "phone", "toolkit"], charger: [41, 13], theme: "summit",
  },
  {
    id: "wh15", code: "WH-15", name: "Polar Cold Store", difficulty: "Hard",
    blurb: "A cold store in the snow: freezer racks, ice cream, seafood and vaccines that spoil if they warm up. Keep the cold chain unbroken.",
    cash: 85_000, rent: 230, doors: ["out", "out", "in", "in", "flex", "flex"], forklifts: 3, expanded: true, cold: true,
    racks: [...rackRow(3, 21, 41), ...rackRow(7, 21, 41)],
    freezers: [...rackRow(3, 3, 19), ...rackRow(7, 3, 19), ...rackRow(11, 3, 19)],
    machines: [],
    stock: { icecream: 6, seafood: 5, vaccine: 2, helmet: 3, toolkit: 3 },
    demand: 2.8, goodsMix: ["icecream", "seafood", "vaccine", "helmet", "toolkit", "chair"], charger: [24, 13], theme: "snow",
  },
  {
    id: "wh20", code: "WH-20", name: "Greenfield Plot", difficulty: "Normal",
    blurb: "An empty shell on a new business park: no racks, no machines, nothing but a clean floor, three doors and the bank's goodwill. Build your own factory from scratch.",
    cash: 150_000, rent: 120, doors: ["out", "in", "flex"], forklifts: 2, expanded: true,
    racks: [], machines: [], stock: {},
    demand: 2.0, goodsMix: ["helmet", "chair", "toolkit", "bicycle"], charger: [3, 13], theme: "fields",
  },
  {
    id: "wh21", code: "WH-21", name: "Harvest Bakery Works", difficulty: "Normal",
    blurb: "A food factory in the fields: a flour mill feeding the oven on a conveyor, a juice line and a dairy. Grocers want bread, cakes, cheese and juice every day.",
    cash: 80_000, rent: 150, doors: ["out", "out", "in", "flex", "flex"], forklifts: 3, expanded: true, industries: ["food"],
    racks: [...rackRow(3, 3, 41), ...rackRow(12, 21, 41)],
    machines: [
      { type: "mill", x: 4, z: 8, recipe: 0 },
      { type: "oven", x: 8, z: 8, recipe: 0 },
      { type: "bottler", x: 21, z: 7, recipe: 0 },
      { type: "dairy", x: 28, z: 7, recipe: 0 },
    ],
    belts: [[7, 8, 0]],
    stock: { wheat: 4, sugar: 3, milk: 3, fruit: 3, bread: 4, juice: 3, cheese: 2 },
    demand: 2.6, goodsMix: ["bread", "juice", "cheese", "cake", "chocolate"], charger: [3, 13], theme: "fields",
  },
  {
    id: "wh22", code: "WH-22", name: "Atelier Row", difficulty: "Normal",
    blurb: "A fashion house in an old mill: a loom, a sewing line and a shoe line, with boutiques waiting for T-shirts, jeans and sneakers.",
    cash: 85_000, rent: 160, doors: ["out", "out", "in", "flex", "flex"], forklifts: 3, expanded: true, industries: ["fashion"],
    racks: [...rackRow(3, 3, 41)],
    machines: [
      { type: "loom", x: 4, z: 8, recipe: 0 },
      { type: "sewing", x: 8, z: 8, recipe: 0 },
      { type: "shoes", x: 20, z: 8, recipe: 0 },
    ],
    belts: [[7, 8, 0]],
    stock: { cotton: 4, dye: 4, leather: 3, rubber: 3, fabric: 2, tshirt: 4, sneakers: 2 },
    demand: 2.5, goodsMix: ["tshirt", "jeans", "sneakers", "jacket"], charger: [36, 13], theme: "works",
  },
  {
    id: "wh23", code: "WH-23", name: "Clearwater Labs", difficulty: "Hard",
    blurb: "A clean-room pharma plant by the river: a reactor feeds the tablet press and the filling line. Pharmacies and beauty brands pay well, and on time.",
    cash: 110_000, rent: 210, doors: ["out", "out", "in", "flex"], forklifts: 3, expanded: true, industries: ["pharma"],
    racks: [...rackRow(3, 3, 41)],
    machines: [
      { type: "reactor", x: 4, z: 8, recipe: 0 },
      { type: "tablet", x: 8, z: 8, recipe: 0 },
      { type: "filler", x: 20, z: 8, recipe: 1 },
    ],
    belts: [[7, 8, 0]],
    stock: { chemicals: 3, plastic: 3, herbs: 3, glass: 4, medicine: 2, perfume: 2 },
    demand: 2.2, goodsMix: ["medicine", "cosmetics", "perfume", "vaccine"], charger: [36, 13], theme: "river",
  },
  {
    id: "wh24", code: "WH-24", name: "Motor City Plant", difficulty: "Expert",
    blurb: "A car plant: a body shop, an engine plant and a tyre plant around a car assembly line, rail in the back and dealers who want cars yesterday. Each one sells for $9,000.",
    cash: 240_000, rent: 380, doors: ["out", "out", "out", "in", "in", "in", "flex", "flex", "in", "flex"], forklifts: 5, expanded: true, mega: true, rail: true, industries: ["auto"],
    racks: [...rackRow(4, 45, 75), ...rackRow(8, 45, 75), ...rackRow(12, 45, 75)],
    machines: [
      { type: "bodyshop", x: 4, z: 5, recipe: 0 },
      { type: "engines", x: 4, z: 9, recipe: 0 },
      { type: "tyreplant", x: 4, z: 12, recipe: 0 },
      { type: "carline", x: 14, z: 7, recipe: 0 },
    ],
    // Bodies and engines ride conveyors into the line; forklifts bring the tyres and glass.
    belts: [[9, 5, 0], [10, 5, 0], [11, 5, 0], [12, 5, 0], [13, 5, 1], [13, 6, 1], [13, 7, 0], [9, 9, 0], [10, 9, 0], [11, 9, 0], [12, 9, 0], [13, 9, 0]],
    stock: { steel: 4, aluminium: 6, copper: 3, rubber: 4, glass: 4, body: 1, engine: 1, tyres: 2, car: 1 },
    demand: 1.8, goodsMix: ["car", "ebike", "bicycle"], charger: [41, 13], theme: "works",
  },
  {
    id: "wh30", code: "WH-30", name: "Freeport Estate", difficulty: "Normal",
    blurb: "The free-build map: the whole 78-bay hall, open plan and empty. There's no fixed aisle, so build wherever you like (lay your own aisles with racks and safety fences), on a real budget, with a real score.",
    cash: 220_000, rent: 210, doors: ["out", "in", "flex", "flex"], forklifts: 2, expanded: true, mega: true, openPlan: true,
    racks: [], machines: [], stock: {},
    demand: 2.2, goodsMix: ["helmet", "chair", "toolkit", "bicycle", "sofa"], charger: [3, 13], theme: "summit",
  },
  {
    id: "wh31", code: "WH-31", name: "Ironridge Quarry", difficulty: "Hard",
    blurb: "A pit in the hills: a quarry face and a mine shaft dig clay and ore onto conveyors into a brick kiln and a steelworks, with a crusher and a cement works beside them. Builders want bricks, cement and beams, and your own building sites need them too.",
    cash: 120_000, rent: 200, doors: ["out", "out", "in", "flex", "flex"], forklifts: 3, expanded: true, industries: ["mining"],
    racks: [...rackRow(3, 31, 41), ...rackRow(7, 31, 41), ...rackRow(11, 31, 41)],
    machines: [
      { type: "quarry", x: 3, z: 3, recipe: 1 },
      { type: "mineshaft", x: 3, z: 8, recipe: 0 },
      { type: "kiln", x: 14, z: 3, recipe: 0 },
      { type: "furnace", x: 14, z: 8, recipe: 0 },
      { type: "crusher", x: 24, z: 3, recipe: 0 },
      { type: "cementworks", x: 24, z: 8, recipe: 0 },
    ],
    // Clay rides from the quarry into the kiln, ore from the shaft into the steelworks; forklifts bring the coal.
    belts: [[8, 3, 0], [9, 3, 0], [10, 3, 0], [11, 3, 0], [12, 3, 0], [13, 3, 0], [7, 9, 0], [8, 9, 0], [9, 9, 0], [10, 9, 0], [11, 9, 0], [12, 9, 0], [13, 9, 0]],
    stock: { coal: 6, stone: 3, clay: 2, bricks: 4, cement: 3, beams: 1 },
    demand: 2.4, goodsMix: ["bricks", "cement", "rooftiles", "concrete", "beams", "toolkit"], charger: [3, 13], theme: "quarry",
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
  // Your own fleet (never picked at random).
  { name: "WareForge Fleet", color: "#2f6fe4", stripe: "#f6c21c" },
];
/** The livery your own trucks wear. */
export const OWN_CARRIER = CARRIERS.length - 1;

export interface Supplier {
  name: string;
  items: ItemId[];
  /** Lead time range in game minutes. */
  lead: [number, number];
  /** Price factor. */
  factor: number;
}
export const SUPPLIERS: Supplier[] = [
  { name: "Ironvale Steel", items: ["steel", "rubber", "copper"], lead: [40, 80], factor: 1 },
  { name: "Voltcell Energy", items: ["cells"], lead: [60, 120], factor: 1 },
  { name: "Polymer & Co.", items: ["plastic", "fabric"], lead: [30, 60], factor: 1 },
  { name: "Timberline", items: ["wood"], lead: [30, 60], factor: 1 },
  { name: "Circuitra", items: ["electronics"], lead: [60, 110], factor: 1 },
  { name: "Arctic Freight", items: FROZEN, lead: [50, 90], factor: 1 },
  { name: "Harvest Farms", items: ["wheat", "milk", "sugar", "fruit", "cocoa"], lead: [30, 70], factor: 1 },
  { name: "Cotton & Hide Co.", items: ["cotton", "dye", "leather"], lead: [40, 80], factor: 1 },
  { name: "Alutech Metals", items: ["aluminium", "glass"], lead: [50, 100], factor: 1 },
  { name: "Chemix Labs", items: ["chemicals", "herbs"], lead: [50, 100], factor: 1 },
  { name: "Bedrock Aggregates", items: ["stone", "clay", "sand", "gravel"], lead: [30, 60], factor: 1 },
  { name: "Deepseam Mining", items: ["ore", "coal", "goldore"], lead: [60, 110], factor: 1 },
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
  { name: "Homestead Furniture", likes: ["chair", "sofa"] },
  { name: "Volt Mobile", likes: ["phone"] },
  { name: "Fixit Hardware", likes: ["toolkit", "helmet"] },
  { name: "Brightmart", likes: ["chair", "toolkit", "bicycle", "phone"] },
  { name: "OfficeHub", likes: ["chair", "phone"] },
  { name: "Trailhead Outdoors", likes: ["bicycle", "helmet", "toolkit", "ebike"] },
  { name: "Voltway E-Bikes", likes: ["ebike", "bicycle"] },
  { name: "SkyLens Drones", likes: ["drone"] },
  { name: "Nimbus Computers", likes: ["laptop", "phone"] },
  { name: "MegaMart", likes: ["chair", "toolkit", "laptop", "drone", "ebike", "icecream", "bread", "juice", "tshirt", "sneakers"] },
  { name: "FreshCo Foods", likes: ["icecream", "seafood", "pizza"] },
  { name: "MedLine Pharma", likes: ["vaccine"] },
  { name: "Harbour Bistro Group", likes: ["seafood", "icecream", "cheese", "bread"] },
  { name: "GreenGrocer Markets", likes: ["bread", "cheese", "juice", "cake"] },
  { name: "CityBake Cafés", likes: ["bread", "cake", "chocolate"] },
  { name: "Sweet Tooth Co.", likes: ["chocolate", "cake", "icecream"] },
  { name: "Urban Threads", likes: ["tshirt", "jeans", "jacket", "handbag"] },
  { name: "StrideRun Sports", likes: ["sneakers", "tshirt", "bicycle"] },
  { name: "Northway Motors", likes: ["car", "ecar"] },
  { name: "Fleetline Rentals", likes: ["car", "ebike", "ecar"] },
  { name: "CarePlus Pharmacies", likes: ["medicine", "cosmetics", "vaccine", "vitamins"] },
  { name: "Glow Beauty", likes: ["cosmetics", "perfume", "handbag"] },
  { name: "Lounge & Co.", likes: ["sofa", "chair"] },
  { name: "Slice Brothers", likes: ["pizza", "cheese", "icecream"] },
  { name: "Greenline Wellness", likes: ["vitamins", "juice", "cosmetics"] },
  { name: "Summit Builders' Merchants", likes: ["bricks", "cement", "rooftiles", "concrete"] },
  { name: "Granite Developments", likes: ["beams", "concrete", "cement", "glass"] },
  { name: "Keystone Homes", likes: ["bricks", "rooftiles", "beams"] },
  { name: "Bullion Vault & Co.", likes: ["goldbar"] },
  { name: "Lustre Jewellers", likes: ["jewellery", "goldbar"] },
];

export interface City {
  name: string;
  /** Transit time in game minutes. */
  transit: number;
  /** How many shoppers (1 is an average city): stores sell more, and cost more, in big ones. */
  pop: number;
}
export const CITIES: City[] = [
  { name: "Philadelphia", transit: 70, pop: 1.25 },
  { name: "Baltimore", transit: 110, pop: 1 },
  { name: "Newark", transit: 90, pop: 0.9 },
  { name: "Boston", transit: 200, pop: 1.25 },
  { name: "Pittsburgh", transit: 210, pop: 0.95 },
  { name: "Hartford", transit: 150, pop: 0.75 },
  { name: "Richmond", transit: 180, pop: 0.85 },
  { name: "Albany", transit: 170, pop: 0.7 },
  { name: "Buffalo", transit: 260, pop: 0.8 },
  { name: "Cleveland", transit: 280, pop: 0.9 },
  { name: "New York", transit: 100, pop: 1.6 },
  { name: "Washington", transit: 150, pop: 1.15 },
  { name: "Providence", transit: 170, pop: 0.75 },
];
export const city = (name: string) => CITIES.find((c) => c.name === name) ?? CITIES[0];

/* ------------------------------------------------------------------ upgrades */

export type UpgradeId =
  | "fast1" | "fast2" | "levellers" | "crew" | "lean" | "slotting" | "highbay" | "scanner"
  | "express" | "buyer" | "door" | "expand" | "sales" | "night"
  | "mega" | "rail" | "agv" | "solar" | "wms" | "robotics" | "quality" | "insurance" | "training" | "crossdock" | "brand" | "premium" | "fastcharge"
  | "cold" | "depot" | "bank" | "academy" | "care" | "vip" | "reefer" | "autopilot"
  | "pos" | "fastbelt"
  | "intel" | "aircargo" | "ergonomics";

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
  { id: "mega", name: "Mega hall", cost: 75_000, icon: "🏟️", needs: "expand", body: "Take the whole block: the hall runs to 78 bays with room for eighteen doors." },
  { id: "rail", name: "Rail siding", cost: 40_000, icon: "🚆", body: "Lay track behind the building and open two rail doors: trains bring 16 pallets at a time, 10% cheaper." },
  { id: "fastcharge", name: "Fast chargers", cost: 6_000, icon: "🔌", body: "Charging bays fill a battery twice as fast." },
  { id: "agv", name: "AGV fleet", cost: 24_000, icon: "🤖", needs: "fast1", body: "Self-driving forklifts: wages drop 60%." },
  { id: "solar", name: "Solar roof", cost: 18_000, icon: "☀️", body: "Panels on the roof: rent and upkeep 25% lower." },
  { id: "wms", name: "Warehouse system", cost: 9_000, icon: "🖥️", body: "A WMS plans every trip: forklifts take the nearest job, and customers trust you more." },
  { id: "robotics", name: "Robotics", cost: 20_000, icon: "🦾", needs: "lean", body: "Assembly Cells and Robot Cells work 30% faster." },
  { id: "quality", name: "Quality lab", cost: 12_000, icon: "🔬", body: "Every pallet you make is inspected: customers pay 5% more for orders of goods you make." },
  { id: "insurance", name: "Insurance", cost: 8_000, icon: "🛡️", body: "Repairs are free and late deliveries lose only a quarter of the price." },
  { id: "training", name: "Driver training", cost: 5_000, icon: "🎓", body: "Drivers handle pallets 25% faster and use less battery." },
  { id: "crossdock", name: "Cross-docking", cost: 11_000, icon: "🔀", body: "Inbound pallets an order needs go straight onto its lane." },
  { id: "brand", name: "Brand campaign", cost: 14_000, icon: "📣", body: "Your name on every trailer: +10 reputation and more offers." },
  { id: "premium", name: "Premium customers", cost: 16_000, icon: "💎", body: "Win accounts that order e-bikes, drones and laptops (buy them wholesale or make them)." },
  { id: "cold", name: "Cold chain", cost: 15_000, icon: "❄️", body: "Freezer racks to build, and customers who order ice cream, seafood and vaccines." },
  { id: "reefer", name: "Reefer lanes", cost: 7_000, icon: "🧊", needs: "cold", body: "Chilled staging lanes: frozen pallets waiting at the doors warm up three times slower." },
  { id: "depot", name: "Transport depot", cost: 20_000, icon: "🚛", body: "Run your own trucks: no 6% carrier fee on the shipments they carry." },
  { id: "bank", name: "Bank partner", cost: 6_000, icon: "🏦", body: "A better relationship with the bank: half the interest and a bigger credit line." },
  { id: "academy", name: "Training academy", cost: 9_000, icon: "🏅", body: "Forklift drivers gain experience twice as fast." },
  { id: "care", name: "Customer care", cost: 8_000, icon: "💬", body: "A team for your accounts: customers become loyal twice as fast." },
  { id: "vip", name: "VIP accounts", cost: 12_000, icon: "👑", needs: "care", body: "More VIP orders: half again the price, tight deadlines, big reputation." },
  { id: "autopilot", name: "Autopilot purchasing", cost: 10_000, icon: "🧠", needs: "buyer", body: "Auto-replenish orders by rail when it's cheaper, and never lets cash fall below $5,000." },
  { id: "pos", name: "Point of sale", cost: 9_000, icon: "🧾", body: "Fast tills, loyalty cards and self-checkout: every store sells 15% more." },
  { id: "fastbelt", name: "Fast conveyors", cost: 8_000, icon: "⏩", body: "Conveyor belts run twice as fast." },
  { id: "intel", name: "Market research", cost: 12_000, icon: "🔍", body: "Know your rivals: see what they bid, and your bids win tenders 5% more easily." },
  { id: "aircargo", name: "Air cargo deal", cost: 9_000, icon: "✈️", body: "A standing deal with an airline: air freight costs 40% less." },
  { id: "ergonomics", name: "Ergonomics", cost: 7_000, icon: "🪑", needs: "training", body: "Better seats and shifts: every break room counts twice." },
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
  { id: "rail1", name: "All aboard", body: "Unload a train at the rail siding.", reward: 4_000 },
  { id: "charge", name: "Plugged in", body: "Recharge a forklift at a charging bay.", reward: 500 },
  { id: "contract", name: "Signed", body: "Complete a contract.", reward: 6_000 },
  { id: "ebike", name: "Electric", body: "Make an e-bike pallet.", reward: 6_000 },
  { id: "laptop", name: "Computing", body: "Make a laptop pallet.", reward: 8_000 },
  { id: "drone", name: "Lift-off", body: "Make a camera drone pallet.", reward: 7_000 },
  { id: "doors10", name: "Wall of doors", body: "Run ten dock doors.", reward: 5_000 },
  { id: "mega", name: "Mega", body: "Open the Mega hall.", reward: 10_000 },
  { id: "ship50", name: "Fifty out", body: "Deliver 50 orders.", reward: 15_000 },
  { id: "fleet8", name: "Armada", body: "Run eight forklifts.", reward: 6_000 },
  { id: "event", name: "Weathered", body: "Get through a storm, a strike or a power cut.", reward: 3_000 },
  { id: "worth1m", name: "Millionaire", body: "Reach $1,000,000 net worth.", reward: 0 },
  { id: "debtfree", name: "Debt free", body: "Borrow from the bank and pay it all back.", reward: 3_000 },
  { id: "coldship", name: "Cold chain", body: "Deliver an order of frozen goods.", reward: 4_000 },
  { id: "ownfleet", name: "Our own wheels", body: "Deliver an order with one of your own trucks.", reward: 4_000 },
  { id: "missions10", name: "Mission ready", body: "Complete 10 daily missions.", reward: 8_000 },
  { id: "gold", name: "Gold standard", body: "Make a customer Gold (10 on-time deliveries).", reward: 6_000 },
  { id: "vipship", name: "Red carpet", body: "Deliver a VIP order on time.", reward: 5_000 },
  { id: "mk2", name: "Mark II", body: "Upgrade a machine to Mk II.", reward: 3_000 },
  { id: "veteran", name: "Veteran driver", body: "Get a forklift driver to level 5.", reward: 4_000 },
  { id: "licence", name: "Diversified", body: "Get a licence for a new industry.", reward: 4_000 },
  { id: "bread", name: "Daily bread", body: "Bake a pallet of bread.", reward: 2_500 },
  { id: "runway", name: "Runway ready", body: "Make a pallet of sneakers or leather jackets.", reward: 5_000 },
  { id: "pharma", name: "Prescribed", body: "Make a pallet of medicines.", reward: 7_000 },
  { id: "car", name: "Off the line", body: "Build a car.", reward: 12_000 },
  { id: "belt", name: "On the belt", body: "Carry a pallet into a machine on a conveyor.", reward: 2_500 },
  { id: "store1", name: "Open for business", body: "Open your first store.", reward: 3_000 },
  { id: "retail10k", name: "Shopkeeper", body: "Sell $10,000 in your stores.", reward: 5_000 },
  { id: "stores5", name: "High-street chain", body: "Run five stores at once.", reward: 12_000 },
  { id: "manager", name: "Delegation", body: "Hire a manager.", reward: 2_000 },
  { id: "allind", name: "Conglomerate", body: "Hold every industry licence.", reward: 25_000 },
  { id: "tender", name: "Contract winner", body: "Win a tender against your rivals.", reward: 5_000 },
  { id: "leader", name: "Market leader", body: "Win more tenders than any rival (at least three).", reward: 15_000 },
  { id: "campaign", name: "On the billboards", body: "Run an ad campaign.", reward: 1_500 },
  { id: "air", name: "Air mail", body: "Fly stock in by air.", reward: 1_500 },
  { id: "ecar", name: "Plugged-in motors", body: "Build an electric car.", reward: 12_000 },
  { id: "pizza", name: "Deep freeze", body: "Make a pallet of frozen pizza or ice cream.", reward: 4_000 },
  { id: "staff", name: "Looking after people", body: "Build a break room and a sales office.", reward: 2_500 },
  { id: "builder", name: "Master builder", body: "Have 60 things built on one site at once.", reward: 8_000 },
  { id: "dig", name: "Dig deep", body: "Mine 40 pallets from the ground.", reward: 5_000 },
  { id: "goldbar", name: "Gold rush", body: "Refine a pallet of gold bars.", reward: 6_000 },
  { id: "plot", name: "Groundbreaker", body: "Buy a plot of land.", reward: 2_000 },
  { id: "permit", name: "Planning granted", body: "Get planning permission for a building.", reward: 1_500 },
  { id: "bricks10k", name: "Brick by brick", body: "Lay 10,000 bricks on your building sites.", reward: 6_000 },
  { id: "topping", name: "Topping out", body: "Finish a roof.", reward: 3_000 },
  { id: "keys", name: "Keys handed over", body: "Pass a building's final inspection.", reward: 8_000 },
  { id: "landlord", name: "Landlord", body: "Have five tenants at once.", reward: 6_000 },
  { id: "empire", name: "Property empire", body: "Own three properties at once.", reward: 12_000 },
  { id: "skyline", name: "Skyline", body: "Complete a building six storeys tall.", reward: 20_000 },
  { id: "flip", name: "Flipper", body: "Sell a property for more than it cost you.", reward: 5_000 },
];

/* ------------------------------------------------------------------ daily missions */

export type MissionKind = "ship" | "unload" | "make" | "revenue" | "ontime" | "moves" | "retail" | "bricks" | "rent";
export interface MissionDef {
  kind: MissionKind;
  /** Name with {n} for the target. */
  name: string;
  /** Target on day d. */
  target: (d: number) => number;
  reward: (d: number) => number;
  icon: string;
}
export const MISSIONS: MissionDef[] = [
  { kind: "ship", icon: "🚚", name: "Deliver {n} orders today", target: (d) => 3 + d, reward: (d) => 2_000 + d * 500 },
  { kind: "unload", icon: "📥", name: "Unload {n} trucks or trains today", target: (d) => 2 + Math.floor(d / 2), reward: (d) => 1_500 + d * 300 },
  { kind: "make", icon: "⚙️", name: "Make {n} pallets of goods today", target: (d) => 2 + d, reward: (d) => 2_500 + d * 500 },
  { kind: "revenue", icon: "💵", name: "Take ${n} in revenue today", target: (d) => 15_000 + d * 5_000, reward: (d) => 3_000 + d * 600 },
  { kind: "ontime", icon: "⏱", name: "Deliver {n} orders on time today", target: (d) => 2 + d, reward: (d) => 2_500 + d * 400 },
  { kind: "moves", icon: "🚜", name: "Move {n} pallets today", target: (d) => 40 + d * 15, reward: (d) => 1_500 + d * 300 },
  { kind: "retail", icon: "🏪", name: "Sell ${n} in your stores today", target: (d) => 2_500 + d * 1_500, reward: (d) => 2_500 + d * 500 },
  { kind: "bricks", icon: "🧱", name: "Lay {n} bricks today", target: (d) => 2_000 + d * 1_000, reward: (d) => 2_000 + d * 400 },
  { kind: "rent", icon: "🔑", name: "Collect ${n} in rent today", target: (d) => 1_500 + d * 1_000, reward: (d) => 2_000 + d * 400 },
];

/* ------------------------------------------------------------------ events */

export type EventKind = "storm" | "rush" | "strike" | "power" | "heat" | "boom" | "fashionweek" | "harvest" | "flu" | "motorshow";
export interface EventDef {
  kind: EventKind;
  name: string;
  body: string;
  icon: string;
  /** Game hours it lasts. */
  hours: [number, number];
  /** Only for businesses in this trade. */
  ind?: IndustryId;
}
export const EVENTS: EventDef[] = [
  { kind: "storm", name: "Storm", icon: "⛈️", hours: [3, 6], body: "Heavy weather on the highways: every truck runs an hour late." },
  { kind: "rush", name: "Shopping rush", icon: "🛍️", hours: [6, 12], body: "Customers are buying: twice the offers, and they pay 10% more." },
  { kind: "strike", name: "Supplier strike", icon: "✊", hours: [6, 12], body: "Suppliers are slow: deliveries take twice as long and cost 15% more." },
  { kind: "power", name: "Power cut", icon: "🔌", hours: [1, 2], body: "The grid is down: machines stop until the power comes back." },
  { kind: "heat", name: "Heatwave", icon: "🌡️", hours: [6, 10], body: "It's hot on the floor: forklift batteries drain 50% faster." },
  { kind: "boom", name: "Tech boom", icon: "🚀", hours: [8, 16], body: "Everyone wants gadgets: high-tech goods sell for 20% more." },
  { kind: "fashionweek", name: "Fashion week", icon: "👠", hours: [8, 14], ind: "fashion", body: "The catwalks are full: fashion sells for 25% more and boutiques order more." },
  { kind: "harvest", name: "Bumper harvest", icon: "🌾", hours: [10, 18], ind: "food", body: "A record crop: wheat, milk, sugar, fruit and cocoa cost 30% less." },
  { kind: "flu", name: "Flu season", icon: "🤧", hours: [10, 16], ind: "pharma", body: "Pharmacies are busy: medicines and vitamins sell for 20% more, and they order more." },
  { kind: "motorshow", name: "Motor show", icon: "🏎️", hours: [8, 14], ind: "auto", body: "New models on the stands: cars sell for 20% more." },
];
