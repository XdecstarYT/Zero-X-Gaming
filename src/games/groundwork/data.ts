/**
 * Groundwork's catalogue: every piece you can build with, at its real size (metres), how it's
 * laid (in mortar or not, on the ground or not), what it needs under it, what it costs and how
 * long it takes, and the finishes it comes in. Masonry is metric-imperial UK size: a brick is
 * 215 × 102.5 × 65 mm and with its 10 mm joint takes a 225 × 112.5 × 75 mm space, so everything
 * else (blocks, openings, lintels) is sized to fit the same quarter-brick grid.
 */

export const GAME_SLUG = "groundwork";
export const SAVE_KEY = "zx-groundwork-save";
export const PREFS_KEY = "zx-groundwork-prefs";

/** The mortar joint, and the module of one brick with its joints. */
export const JOINT = 0.01;
export const COURSE = 0.075;
/** The placement grid: a quarter brick. */
export const GRID = 0.05625;
/** The site: a 30 m square plot, the street along its south side. */
export const SITE = 15;
/** Brick to brick at the end of a working day (7 till 4, nine hours). */
export const DAY_MINUTES = 540;

export type Family = "masonry" | "concrete" | "timber" | "steel" | "opening" | "roof";

export type Kind =
  | "brick"
  | "bat"
  | "closer"
  | "block"
  | "halfblock"
  | "stone"
  | "halfstone"
  | "glassblock"
  | "footing"
  | "slab"
  | "lintel"
  | "plate"
  | "stud"
  | "joist"
  | "board"
  | "post"
  | "steel"
  | "window"
  | "door"
  | "rafter"
  | "batten"
  | "tile"
  | "ridge"
  | "fascia"
  | "sheet";

export interface Variant {
  name: string;
  color: string;
}

export interface Size {
  name: string;
  s: [number, number, number];
}

/** How a piece must be held up. */
export type Support =
  /** At least 30% of its bed rests on something that bears. */
  | "bed"
  /** Both its ends rest on something that bears (a lintel, a joist, a beam). */
  | "span"
  /** It touches something that bears (a floorboard across joists). */
  | "touch"
  /** Generated with a roof, held by the frame. */
  | "none";

export interface KindInfo {
  name: string;
  family: Family;
  icon: string;
  /** [length along its own x, height, depth along its own z]. */
  size: [number, number, number];
  /** Laid in mortar: a 10 mm joint all round, so its module is its size plus a joint. */
  mortar?: boolean;
  /** May stand on the bare ground. */
  ground?: boolean;
  /** Carries what's laid on it. */
  bears: boolean;
  support: Support;
  /** Dollars per piece, or per metre (`per: "m"`, along its length) or square metre (`"m2"`). */
  cost: number;
  per?: "m" | "m2";
  /** Labour, in minutes per piece (or per metre / square metre). */
  minutes: number;
  variants: Variant[];
  sizes?: Size[];
  /** Which dimension a drag sets (a footing's length, a joist's span). */
  stretch?: "L" | "LD" | "H";
  blurb: string;
  /** In the materials tray (roof parts come with the roof tool). */
  tray: boolean;
}

const BRICKS: Variant[] = [
  { name: "Red common", color: "#9a4b37" },
  { name: "Red multi", color: "#8a4635" },
  { name: "London stock", color: "#c49a62" },
  { name: "Buff", color: "#b5895a" },
  { name: "Brown", color: "#6f4433" },
  { name: "Blue engineering", color: "#454a54" },
  { name: "Cream", color: "#d6c4a0" },
  { name: "Painted white", color: "#e8e4dc" },
];

const BLOCKS: Variant[] = [
  { name: "Dense concrete", color: "#8f9092" },
  { name: "Aerated (white)", color: "#d9d7d1" },
  { name: "Charcoal", color: "#55585c" },
];

const STONES: Variant[] = [
  { name: "Sandstone", color: "#c9ad7c" },
  { name: "Limestone", color: "#d6d0bd" },
  { name: "Bluestone", color: "#5d636a" },
];

const TIMBER: Variant[] = [
  { name: "Pine", color: "#d2ad78" },
  { name: "Treated (green)", color: "#9fa676" },
  { name: "Hardwood", color: "#8a5a3a" },
  { name: "Painted white", color: "#ece9e2" },
];

const CONCRETE: Variant[] = [{ name: "Concrete", color: "#a9a8a2" }];

const FRAMES: Variant[] = [
  { name: "White uPVC", color: "#f1f1ee" },
  { name: "Black aluminium", color: "#26282b" },
  { name: "Timber", color: "#8b5d3a" },
  { name: "Sage green", color: "#6f8466" },
];

const DOORS: Variant[] = [
  { name: "Pillar-box red", color: "#9c1f1c" },
  { name: "Navy", color: "#1f2d4a" },
  { name: "Racing green", color: "#1f4a32" },
  { name: "Oak", color: "#8a6038" },
  { name: "White", color: "#eeece6" },
  { name: "Charcoal", color: "#33363a" },
];

const TILES: Variant[] = [
  { name: "Terracotta", color: "#a65638" },
  { name: "Concrete grey", color: "#5e6064" },
  { name: "Slate", color: "#3a3f46" },
  { name: "Brown", color: "#6a4434" },
];

const SHEETS: Variant[] = [
  { name: "Galvanised", color: "#a9adb0" },
  { name: "Charcoal", color: "#3b3e42" },
  { name: "Heritage green", color: "#3f5a46" },
  { name: "Red", color: "#8a2e26" },
];

const STEEL: Variant[] = [
  { name: "Red oxide", color: "#7a3324" },
  { name: "Galvanised", color: "#a4a8ab" },
  { name: "Black", color: "#2b2d30" },
];

export const KINDS: Record<Kind, KindInfo> = {
  brick: { name: "Brick", family: "masonry", icon: "🧱", size: [0.215, 0.065, 0.1025], mortar: true, ground: true, bears: true, support: "bed", cost: 1.05, minutes: 1.1, variants: BRICKS, blurb: "215 × 102.5 × 65 mm, laid in a 10 mm mortar joint.", tray: true },
  bat: { name: "Half bat", family: "masonry", icon: "◧", size: [0.1025, 0.065, 0.1025], mortar: true, ground: true, bears: true, support: "bed", cost: 0.7, minutes: 0.9, variants: BRICKS, blurb: "Half a brick, to finish a course and keep the bond.", tray: true },
  closer: { name: "Queen closer", family: "masonry", icon: "▯", size: [0.04625, 0.065, 0.1025], mortar: true, ground: true, bears: true, support: "bed", cost: 0.5, minutes: 0.8, variants: BRICKS, blurb: "A quarter brick, cut lengthways, to set up English and Flemish bond at a corner.", tray: false },
  block: { name: "Concrete block", family: "masonry", icon: "⬜", size: [0.44, 0.215, 0.1], mortar: true, ground: true, bears: true, support: "bed", cost: 3.6, minutes: 2.5, variants: BLOCKS, blurb: "440 × 215 × 100 mm: two bricks long, three courses high.", tray: true },
  halfblock: { name: "Half block", family: "masonry", icon: "▫", size: [0.215, 0.215, 0.1], mortar: true, ground: true, bears: true, support: "bed", cost: 2.1, minutes: 1.8, variants: BLOCKS, blurb: "Half a block, to finish a course.", tray: false },
  stone: { name: "Ashlar stone", family: "masonry", icon: "🪨", size: [0.44, 0.215, 0.1025], mortar: true, ground: true, bears: true, support: "bed", cost: 11, minutes: 5, variants: STONES, blurb: "Dressed stone, coursed to the brickwork.", tray: true },
  halfstone: { name: "Half stone", family: "masonry", icon: "▪", size: [0.215, 0.215, 0.1025], mortar: true, ground: true, bears: true, support: "bed", cost: 6, minutes: 3.5, variants: STONES, blurb: "Half an ashlar, to finish a course.", tray: false },
  glassblock: { name: "Glass block", family: "masonry", icon: "🔲", size: [0.215, 0.215, 0.1], mortar: true, ground: false, bears: true, support: "bed", cost: 14, minutes: 4, variants: [{ name: "Clear", color: "#cfe3ea" }, { name: "Frosted", color: "#e6eef0" }], blurb: "A light-letting block, three courses high.", tray: true },
  footing: { name: "Strip footing", family: "concrete", icon: "▬", size: [1.8, 0.225, 0.45], ground: true, bears: true, support: "bed", cost: 85, per: "m", minutes: 40, variants: CONCRETE, stretch: "L", blurb: "Concrete poured in a trench, 450 wide, for walls to stand on.", tray: true },
  slab: { name: "Concrete slab", family: "concrete", icon: "▭", size: [2.25, 0.15, 2.25], ground: true, bears: true, support: "bed", cost: 70, per: "m2", minutes: 30, variants: CONCRETE, stretch: "LD", blurb: "A 150 mm reinforced slab: a floor, a base, a pad.", tray: true },
  lintel: { name: "Lintel", family: "concrete", icon: "═", size: [1.34, 0.14, 0.1025], mortar: true, bears: true, support: "span", cost: 52, per: "m", minutes: 15, variants: CONCRETE, sizes: [{ name: "Small window", s: [1.115, 0.14, 0.1025] }, { name: "Door", s: [1.34, 0.14, 0.1025] }, { name: "Window", s: [1.565, 0.14, 0.1025] }, { name: "Wide window", s: [2.24, 0.14, 0.1025] }, { name: "Garage", s: [3.14, 0.215, 0.1025] }], blurb: "Precast concrete over an opening, bearing 225 mm each side.", tray: true },
  plate: { name: "Timber plate", family: "timber", icon: "▁", size: [2.4, 0.045, 0.09], ground: true, bears: true, support: "touch", cost: 6, per: "m", minutes: 3, variants: TIMBER, stretch: "L", blurb: "90 × 45 timber laid flat: the top or bottom of a frame.", tray: true },
  stud: { name: "Stud", family: "timber", icon: "┃", size: [0.045, 2.4, 0.09], ground: true, bears: true, support: "bed", cost: 6, per: "m", minutes: 6, variants: TIMBER, stretch: "H", blurb: "A 90 × 45 upright in a timber frame.", tray: true },
  joist: { name: "Joist", family: "timber", icon: "▀", size: [3.6, 0.19, 0.045], bears: true, support: "span", cost: 14, per: "m", minutes: 4, variants: TIMBER, stretch: "L", blurb: "190 × 45 on edge, spanning wall to wall to carry a floor.", tray: true },
  board: { name: "Floorboard", family: "timber", icon: "▤", size: [2.4, 0.022, 0.14], bears: true, support: "touch", cost: 7, per: "m", minutes: 2, variants: TIMBER, stretch: "L", blurb: "140 × 22 boards, nailed across joists.", tray: true },
  post: { name: "Post", family: "timber", icon: "▮", size: [0.09, 2.4, 0.09], ground: true, bears: true, support: "bed", cost: 11, per: "m", minutes: 20, variants: TIMBER, stretch: "H", blurb: "A 90 × 90 post for a pergola, a deck or a carport.", tray: true },
  steel: { name: "Steel beam", family: "steel", icon: "Ɪ", size: [3.6, 0.2, 0.1], bears: true, support: "span", cost: 120, per: "m", minutes: 30, variants: STEEL, stretch: "L", blurb: "A 200 mm universal beam, for wide spans.", tray: true },
  window: {
    name: "Window",
    family: "opening",
    icon: "🪟",
    size: [1.115, 1.19, 0.1025],
    mortar: true,
    bears: false,
    support: "bed",
    cost: 520,
    minutes: 75,
    variants: FRAMES,
    sizes: [
      { name: "Small", s: [0.665, 1.19, 0.1025] },
      { name: "Standard", s: [1.115, 1.19, 0.1025] },
      { name: "Wide", s: [1.79, 1.19, 0.1025] },
      { name: "Bathroom", s: [0.665, 0.59, 0.1025] },
      { name: "Tall", s: [0.89, 1.79, 0.1025] },
    ],
    blurb: "A double-glazed window, sized to the brickwork. Needs a lintel over it.",
    tray: true,
  },
  door: {
    name: "Door",
    family: "opening",
    icon: "🚪",
    size: [0.89, 2.09, 0.1025],
    mortar: true,
    ground: true,
    bears: false,
    support: "bed",
    cost: 680,
    minutes: 90,
    variants: DOORS,
    sizes: [
      { name: "Front door", s: [0.89, 2.09, 0.1025] },
      { name: "Double doors", s: [1.565, 2.09, 0.1025] },
      { name: "Garage door", s: [2.465, 2.09, 0.1025] },
    ],
    blurb: "A door in its frame, sized to the brickwork. Needs a lintel over it.",
    tray: true,
  },
  rafter: { name: "Rafter", family: "roof", icon: "⟋", size: [0.045, 0.14, 3], bears: true, support: "none", cost: 9, per: "m", minutes: 5, variants: TIMBER, blurb: "140 × 45 rafters at 600 mm, from the wall plate to the ridge.", tray: false },
  batten: { name: "Batten", family: "roof", icon: "≡", size: [3, 0.025, 0.05], bears: true, support: "none", cost: 2, per: "m", minutes: 1, variants: TIMBER, blurb: "50 × 25 battens across the rafters, for the tiles to hang on.", tray: false },
  tile: { name: "Roof tile", family: "roof", icon: "◭", size: [0.3, 0.018, 0.42], bears: false, support: "none", cost: 2.3, minutes: 0.6, variants: TILES, blurb: "An interlocking tile, hung on a batten.", tray: false },
  ridge: { name: "Ridge tile", family: "roof", icon: "⌃", size: [0.45, 0.13, 0.3], bears: false, support: "none", cost: 9, minutes: 2, variants: TILES, blurb: "A ridge tile, bedded along the top.", tray: false },
  fascia: { name: "Fascia", family: "roof", icon: "▔", size: [3, 0.19, 0.022], bears: false, support: "none", cost: 8, per: "m", minutes: 3, variants: TIMBER, blurb: "The board along the eaves and up the gables.", tray: false },
  sheet: { name: "Roof sheet", family: "roof", icon: "≋", size: [0.76, 0.02, 3], bears: false, support: "none", cost: 28, per: "m", minutes: 6, variants: SHEETS, blurb: "A corrugated steel sheet.", tray: false },
};

export const KIND_ORDER: Kind[] = ["brick", "bat", "block", "stone", "glassblock", "footing", "slab", "lintel", "window", "door", "plate", "stud", "joist", "board", "post", "steel"];

/** What a wall of each material lays to finish a course. */
export const HALF: Partial<Record<Kind, Kind>> = { brick: "bat", block: "halfblock", stone: "halfstone", glassblock: "glassblock" };

export type Bond = "stretcher" | "english" | "flemish" | "stack";

export const BONDS: Record<Bond, { name: string; blurb: string; thick: 1 | 2 }> = {
  stretcher: { name: "Stretcher", blurb: "Half a brick thick, each course offset half a brick: the most common bond.", thick: 1 },
  english: { name: "English", blurb: "One brick thick: a course of headers, then a course of stretchers. The strongest bond.", thick: 2 },
  flemish: { name: "Flemish", blurb: "One brick thick: headers and stretchers alternating along each course.", thick: 2 },
  stack: { name: "Stack", blurb: "Every joint in line. Decorative only: it has no strength of its own.", thick: 1 },
};

export type RoofStyle = "gable" | "skillion";
export type RoofCover = "tile" | "sheet";

/* ------------------------------------------------------------------ jobs */

export type Need =
  | { k: "wall"; len: number; h: number }
  | { k: "footings"; min: number }
  | { k: "bond"; min: number }
  | { k: "enclosed"; w: number; d: number; h: number }
  | { k: "roof"; cover: number }
  | { k: "count"; of: Kind | Family; n: number; label: string }
  | { k: "slab"; area: number }
  | { k: "height"; h: number };

export interface Job {
  id: string;
  title: string;
  client: string;
  brief: string;
  /** Where to build: [x0, z0, x1, z1], pegged out with a string line. */
  zone: [number, number, number, number];
  budget: number;
  fee: number;
  days: number;
  needs: Need[];
  icon: string;
}

export const JOBS: Job[] = [
  {
    id: "garden-wall",
    title: "A garden wall",
    client: "Mrs Okafor, No. 14",
    icon: "🧱",
    brief: "A brick garden wall along the back of the lawn: at least 4.5 m long and 900 mm high (twelve courses), on a proper footing, in a good stretcher bond.",
    zone: [-4, -3, 4, 1],
    budget: 1100,
    fee: 1800,
    days: 2,
    needs: [
      { k: "wall", len: 4.5, h: 0.9 },
      { k: "footings", min: 0.9 },
      { k: "bond", min: 0.9 },
    ],
  },
  {
    id: "raised-bed",
    title: "A raised garden bed",
    client: "The Hendersons",
    icon: "🌱",
    brief: "A brick planter for the vegetable patch: four walls round a space at least 2 m by 1 m, at least six courses (450 mm) high.",
    zone: [-3, -2, 3, 2],
    budget: 700,
    fee: 1200,
    days: 1,
    needs: [
      { k: "enclosed", w: 2, d: 1, h: 0.45 },
      { k: "bond", min: 0.85 },
    ],
  },
  {
    id: "shed",
    title: "A garden shed",
    client: "Mr Novak",
    icon: "🛖",
    brief: "A timber-framed shed on a concrete slab: a slab of at least 5 m², a frame of at least a dozen studs, a door, and a roof that covers it.",
    zone: [-4, -4, 4, 4],
    budget: 3200,
    fee: 5200,
    days: 4,
    needs: [
      { k: "slab", area: 5 },
      { k: "count", of: "stud", n: 12, label: "Studs in the frame" },
      { k: "count", of: "door", n: 1, label: "A door" },
      { k: "roof", cover: 0.85 },
    ],
  },
  {
    id: "garage",
    title: "A single garage",
    client: "Dr Lindqvist",
    icon: "🚗",
    brief: "A brick garage: walls on all four sides round at least 3 m by 5.4 m, at least 2.4 m high, on footings, with a garage door (or a door), and roofed over.",
    zone: [-5, -6, 5, 6],
    budget: 12500,
    fee: 19500,
    days: 10,
    needs: [
      { k: "enclosed", w: 3, d: 5.4, h: 2.4 },
      { k: "footings", min: 0.9 },
      { k: "count", of: "door", n: 1, label: "A door" },
      { k: "roof", cover: 0.9 },
      { k: "bond", min: 0.85 },
    ],
  },
  {
    id: "bungalow",
    title: "A brick bungalow",
    client: "The Santos family",
    icon: "🏠",
    brief: "A single-storey house: brick walls round at least 8 m by 6 m, at least 2.5 m high, on footings and a slab, with at least four windows and two doors, under a tiled roof.",
    zone: [-7, -6, 7, 6],
    budget: 52000,
    fee: 84000,
    days: 30,
    needs: [
      { k: "enclosed", w: 8, d: 6, h: 2.5 },
      { k: "footings", min: 0.9 },
      { k: "slab", area: 40 },
      { k: "count", of: "window", n: 4, label: "Windows" },
      { k: "count", of: "door", n: 2, label: "Doors" },
      { k: "roof", cover: 0.9 },
      { k: "bond", min: 0.85 },
    ],
  },
  {
    id: "townhouse",
    title: "A two-storey house",
    client: "Ms Haddad",
    icon: "🏡",
    brief: "A two-storey brick house: walls round at least 7 m by 6 m and at least 5.1 m high, on footings, with at least six windows and a front door, under a roof.",
    zone: [-7, -6, 7, 6],
    budget: 98000,
    fee: 156000,
    days: 50,
    needs: [
      { k: "enclosed", w: 7, d: 6, h: 5.1 },
      { k: "footings", min: 0.9 },
      { k: "count", of: "window", n: 6, label: "Windows" },
      { k: "count", of: "door", n: 1, label: "A front door" },
      { k: "roof", cover: 0.9 },
      { k: "bond", min: 0.85 },
    ],
  },
];

export const CHANGELOG: { version: string; date: string; title: string; items: string[] }[] = [
  {
    version: "1.0",
    date: "October 2026",
    title: "Groundwork opens",
    items: [
      "Build anything from scratch, brick by brick: real 215 mm bricks in 10 mm mortar joints, half bats and closers, concrete blocks, ashlar stone and glass blocks.",
      "Wall tool: lay a run course by course in stretcher, English, Flemish or stack bond, or a bonded rectangle with proper corners; lintels go in over openings.",
      "Footings and slabs poured in concrete, timber frames, joists and floorboards, steel beams, windows and doors sized to the brickwork.",
      "Roofs framed from rafters and battens and hung tile by tile, with ridge tiles, fascias and a brick gable.",
      "Everything must be held up: knock out the bottom of a wall and what's above it comes down.",
      "Career: six jobs from a garden wall to a two-storey house, each with a budget, a deadline and an inspector.",
    ],
  },
];
