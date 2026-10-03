import type { FurnitureDef } from "./world";

/**
 * The builder's catalogue: 100 pieces in three categories (Furniture, Decor,
 * Outdoor), on top of the original 26. Each is plain data: its footprint and
 * price, what it does when used, and its shape as a list of simple parts
 * (boxes, cylinders, balls, cushions, cones) that `models.ts` turns into
 * meshes. No three.js here, so the rules (`world.ts`) can read it too.
 *
 * Parts are centred on the item, front facing +z, `y` measured from the floor
 * (the bottom of a box or cylinder, the centre of a ball).
 */

export type BuildCategory = "Furniture" | "Decor" | "Outdoor";
export const CATEGORIES: BuildCategory[] = ["Furniture", "Decor", "Outdoor"];

type Flag = "g" | "x";
/** Box: w h d at (x, y, z). */
type BoxSpec = ["b", number, number, number, number, number, number, string, Flag?];
/** Cylinder: radius, height at (x, y, z). */
type CylSpec = ["c", number, number, number, number, number, string, Flag?];
/** Ball: radius at its centre (x, y, z). */
type BallSpec = ["s", number, number, number, number, string, Flag?];
/** Cushion: a rounded slab, w h d at (x, y, z). */
type SoftSpec = ["k", number, number, number, number, number, number, string];
/** Cone: base radius, height at (x, y, z). */
type ConeSpec = ["n", number, number, number, number, number, string];
export type PartSpec = BoxSpec | CylSpec | BallSpec | SoftSpec | ConeSpec;

export interface CatalogItem extends FurnitureDef {
  cat: BuildCategory;
  parts: PartSpec[];
}

const B = (w: number, h: number, d: number, x: number, y: number, z: number, c: string, f?: Flag): BoxSpec => ["b", w, h, d, x, y, z, c, f];
const C = (r: number, h: number, x: number, y: number, z: number, c: string, f?: Flag): CylSpec => ["c", r, h, x, y, z, c, f];
const S = (r: number, x: number, y: number, z: number, c: string, f?: Flag): BallSpec => ["s", r, x, y, z, c, f];
const K = (w: number, h: number, d: number, x: number, y: number, z: number, c: string): SoftSpec => ["k", w, h, d, x, y, z, c];
const N = (r: number, h: number, x: number, y: number, z: number, c: string): ConeSpec => ["n", r, h, x, y, z, c];
/** Four legs under a w × d top. */
const legs = (w: number, d: number, h: number, c: string, r = 0.025): CylSpec[] =>
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([a, b]) => C(r, h, a * (w / 2 - 0.05), 0, b * (d / 2 - 0.05), c));
/** A tree: trunk and a few clumps of leaves. */
const tree = (trunk: number, crown: number, leaf: string, leaf2: string): PartSpec[] => [
  C(0.12, trunk, 0, 0, 0, "#5b3a1e"),
  S(crown, 0, trunk + crown * 0.6, 0, leaf),
  S(crown * 0.75, crown * 0.5, trunk + crown * 0.3, 0.1, leaf2),
  S(crown * 0.7, -crown * 0.45, trunk + crown * 0.35, -0.1, leaf2),
  S(crown * 0.6, 0, trunk + crown * 1.1, 0, leaf),
];

type Room = FurnitureDef["room"];
const item = (cat: BuildCategory, room: Room, name: string, price: number, size: [number, number, number], color: string, parts: PartSpec[], more: Partial<FurnitureDef> = {}): CatalogItem => ({
  cat,
  room,
  name,
  price,
  w: size[0],
  d: size[1],
  h: size[2],
  color,
  parts,
  ...more,
});
const F = (room: Room, name: string, price: number, size: [number, number, number], color: string, parts: PartSpec[], more?: Partial<FurnitureDef>) => item("Furniture", room, name, price, size, color, parts, more);
const D = (name: string, price: number, size: [number, number, number], color: string, parts: PartSpec[], more?: Partial<FurnitureDef>) => item("Decor", "Decor", name, price, size, color, parts, more);
const O = (name: string, price: number, size: [number, number, number], color: string, parts: PartSpec[], more?: Partial<FurnitureDef>) => item("Outdoor", "Outdoor", name, price, size, color, parts, more);

const WOOD = "#8b5a2b";
const DARK = "#5b3a1e";
const OAK = "#a16207";
const STEEL = "#9ca3af";
const WHITE = "#f5f5f4";
const BLACK = "#18181b";

export const CATALOG = {
  // ------------------------------------------------------------ Furniture (34)
  coffeeTable: F("Living", "Coffee Table", 260, [1.2, 0.6, 0.45], WOOD, [B(1.2, 0.05, 0.6, 0, 0.4, 0, WOOD), B(1.1, 0.03, 0.5, 0, 0.12, 0, DARK), ...legs(1.2, 0.6, 0.4, DARK, 0.03)]),
  sideTable: F("Living", "Side Table", 110, [0.5, 0.5, 0.55], WOOD, [C(0.25, 0.04, 0, 0.51, 0, WOOD), C(0.03, 0.51, 0, 0, 0, DARK), C(0.18, 0.03, 0, 0, 0, DARK)]),
  roundTable: F("Kitchen", "Round Dining Table", 520, [1.2, 1.2, 0.76], WOOD, [C(0.6, 0.04, 0, 0.72, 0, WOOD), C(0.06, 0.72, 0, 0, 0, DARK), C(0.32, 0.04, 0, 0, 0, DARK)]),
  barStool: F("Kitchen", "Bar Stool", 120, [0.42, 0.42, 0.78], STEEL, [C(0.19, 0.06, 0, 0.72, 0, "#27272a"), C(0.025, 0.72, 0, 0, 0, STEEL, "g"), C(0.18, 0.02, 0, 0, 0, STEEL, "g"), C(0.15, 0.015, 0, 0.3, 0, STEEL, "g")]),
  kitchenIsland: F("Kitchen", "Kitchen Island", 1300, [2, 1, 0.92], WHITE, [B(1.9, 0.88, 0.9, 0, 0, 0, WHITE), B(2, 0.04, 1, 0, 0.88, 0, "#57534e", "g"), B(0.5, 0.02, 0.4, 0.4, 0.92, 0, "#a1a1aa", "g")]),
  pantry: F("Kitchen", "Pantry Cupboard", 640, [1, 0.6, 2.1], WHITE, [B(1, 2.1, 0.6, 0, 0, 0, "#e7e5e4"), B(0.01, 2, 0.01, 0, 0.05, 0.3, "#a8a29e"), B(0.03, 0.3, 0.03, -0.08, 1, 0.31, STEEL, "g"), B(0.03, 0.3, 0.03, 0.08, 1, 0.31, STEEL, "g")]),
  doubleFridge: F("Kitchen", "Double Fridge", 2200, [1.1, 0.75, 1.9], "#d4d4d8", [B(1.1, 1.9, 0.75, 0, 0, 0, "#d4d4d8", "g"), B(0.01, 1.85, 0.02, 0, 0.03, 0.375, "#71717a"), B(0.03, 0.8, 0.04, -0.06, 0.6, 0.39, STEEL, "g"), B(0.03, 0.8, 0.04, 0.06, 0.6, 0.39, STEEL, "g"), B(0.25, 0.3, 0.01, -0.28, 1.2, 0.38, "#1e293b", "x")], { need: "hunger", rate: 2.6, action: "Raid the fridge" }),
  microwave: F("Kitchen", "Microwave Bench", 380, [0.8, 0.6, 1.2], WHITE, [B(0.8, 0.88, 0.6, 0, 0, 0, WHITE), B(0.8, 0.04, 0.6, 0, 0.88, 0, "#57534e"), B(0.55, 0.3, 0.38, 0, 0.92, -0.05, BLACK, "g"), B(0.36, 0.22, 0.01, -0.05, 0.96, 0.14, "#1e293b", "x")], { need: "hunger", rate: 1.2, action: "Heat something up" }),
  coffeeMachine: F("Kitchen", "Coffee Bar", 900, [1, 0.6, 1.3], "#44403c", [B(1, 0.88, 0.6, 0, 0, 0, "#44403c"), B(1, 0.04, 0.6, 0, 0.88, 0, "#d6d3d1"), B(0.4, 0.38, 0.35, 0, 0.92, -0.08, "#a8a29e", "g"), C(0.04, 0.08, 0, 0.92, 0.12, WHITE)], { need: "energy", rate: 0.6, action: "Make a coffee" }),
  dishwasher: F("Kitchen", "Dishwasher", 700, [0.6, 0.6, 0.88], STEEL, [B(0.6, 0.88, 0.6, 0, 0, 0, "#d4d4d8", "g"), B(0.5, 0.03, 0.03, 0, 0.78, 0.31, BLACK)]),
  washer: F("Bathroom", "Washing Machine", 800, [0.6, 0.6, 0.86], WHITE, [B(0.6, 0.86, 0.6, 0, 0, 0, WHITE, "g"), C(0.2, 0.02, 0, 0.4, 0.3, "#94a3b8", "x"), B(0.5, 0.08, 0.02, 0, 0.74, 0.3, "#cbd5e1")]),
  dryer: F("Bathroom", "Clothes Dryer", 650, [0.6, 0.6, 0.86], "#e5e7eb", [B(0.6, 0.86, 0.6, 0, 0, 0, "#e5e7eb", "g"), C(0.2, 0.02, 0, 0.4, 0.3, "#475569", "x"), B(0.5, 0.08, 0.02, 0, 0.74, 0.3, "#cbd5e1")]),
  bathVanity: F("Bathroom", "Double Vanity", 950, [1.6, 0.55, 1.9], WOOD, [B(1.6, 0.82, 0.55, 0, 0, 0, OAK), B(1.6, 0.08, 0.55, 0, 0.82, 0, WHITE, "g"), C(0.16, 0.02, -0.4, 0.9, 0.02, "#e2e8f0", "g"), C(0.16, 0.02, 0.4, 0.9, 0.02, "#e2e8f0", "g"), B(1.5, 0.8, 0.02, 0, 1.1, -0.27, "#cbd5e1", "x")]),
  kingBed: F("Bedroom", "King Bed", 1800, [2.1, 2.3, 1.2], "#e2e8f0", [B(2, 0.3, 2.2, 0, 0, 0, DARK), K(1.94, 0.24, 2.1, 0, 0.3, 0.02, "#f8fafc"), K(1.98, 0.07, 1.4, 0, 0.5, 0.38, "#c7d2fe"), K(0.8, 0.14, 0.4, -0.48, 0.52, -0.78, "#ffffff"), K(0.8, 0.14, 0.4, 0.48, 0.52, -0.78, "#ffffff"), B(2.1, 1.2, 0.1, 0, 0, -1.1, "#3f2a10")], { need: "energy", rate: 0.62, action: "Sleep" }),
  bunkBed: F("Bedroom", "Bunk Bed", 900, [1, 2, 1.8], "#60a5fa", [B(1, 0.2, 2, 0, 0.2, 0, WOOD), K(0.94, 0.16, 1.9, 0, 0.4, 0, "#93c5fd"), B(1, 0.2, 2, 0, 1.2, 0, WOOD), K(0.94, 0.16, 1.9, 0, 1.4, 0, "#fca5a5"), ...legs(1, 2, 1.8, DARK, 0.04), B(0.04, 1.2, 0.3, 0.48, 0.4, 0.8, DARK)], { need: "energy", rate: 0.4, action: "Sleep" }),
  crib: F("Bedroom", "Crib", 400, [0.75, 1.3, 1], WHITE, [B(0.75, 0.1, 1.3, 0, 0.35, 0, WHITE), K(0.7, 0.1, 1.25, 0, 0.45, 0, "#fde68a"), ...[-0.6, -0.3, 0, 0.3, 0.6].flatMap((z) => [C(0.015, 0.6, -0.36, 0.35, z, WHITE), C(0.015, 0.6, 0.36, 0.35, z, WHITE)]), B(0.75, 0.04, 1.3, 0, 0.95, 0, WHITE), ...legs(0.75, 1.3, 0.35, WHITE, 0.03)]),
  dresser: F("Bedroom", "Dresser", 520, [1.3, 0.5, 0.9], OAK, [B(1.3, 0.9, 0.5, 0, 0, 0, OAK), ...[0.15, 0.42, 0.69].flatMap((y) => [B(1.24, 0.005, 0.01, 0, y + 0.22, 0.25, DARK), B(0.18, 0.03, 0.03, 0, y + 0.1, 0.26, STEEL, "g")])]),
  vanityTable: F("Bedroom", "Makeup Vanity", 480, [1, 0.45, 1.5], WHITE, [B(1, 0.05, 0.45, 0, 0.72, 0, WHITE), ...legs(1, 0.45, 0.72, WHITE), C(0.32, 0.02, 0, 1.12, -0.2, "#cbd5e1", "x"), B(0.7, 0.7, 0.03, 0, 0.77, -0.21, "#e2e8f0", "x")]),
  toyChest: F("Bedroom", "Toy Chest", 160, [0.9, 0.5, 0.5], "#f59e0b", [B(0.9, 0.45, 0.5, 0, 0, 0, "#f59e0b"), B(0.92, 0.06, 0.52, 0, 0.45, 0, "#dc2626"), S(0.08, -0.2, 0.55, 0, "#3b82f6"), S(0.06, 0.15, 0.55, 0.05, "#22c55e")], { need: "fun", rate: 0.5, action: "Play" }),
  sectional: F("Living", "Corner Sofa", 2600, [2.8, 2, 0.85], "#64748b", [B(2.8, 0.2, 0.95, 0, 0.08, -0.52, "#1f2937"), K(2.5, 0.22, 0.7, 0, 0.28, -0.42, "#64748b"), B(2.8, 0.5, 0.22, 0, 0.28, -0.89, "#64748b"), B(0.95, 0.2, 1.05, 0.92, 0.08, 0.47, "#1f2937"), K(0.75, 0.22, 1, 0.92, 0.28, 0.47, "#64748b"), B(0.2, 0.35, 2, 1.3, 0.28, 0, "#64748b")], { need: "fun", rate: 0.75, action: "Lounge" }),
  loveseat: F("Living", "Loveseat", 900, [1.5, 0.9, 0.85], "#be123c", [B(1.5, 0.2, 0.9, 0, 0.08, 0, "#4c0519"), K(1.2, 0.2, 0.65, 0, 0.28, 0.1, "#be123c"), B(1.5, 0.48, 0.2, 0, 0.28, -0.35, "#be123c"), B(0.15, 0.32, 0.9, -0.675, 0.28, 0, "#be123c"), B(0.15, 0.32, 0.9, 0.675, 0.28, 0, "#be123c")], { need: "fun", rate: 0.5, action: "Relax" }),
  recliner: F("Living", "Recliner", 850, [0.95, 1.1, 1], "#78350f", [B(0.95, 0.35, 1.1, 0, 0.05, 0, "#78350f"), K(0.65, 0.16, 0.8, 0, 0.4, 0.1, "#92400e"), B(0.95, 0.6, 0.2, 0, 0.4, -0.45, "#78350f"), B(0.15, 0.25, 1, -0.4, 0.4, 0, "#78350f"), B(0.15, 0.25, 1, 0.4, 0.4, 0, "#78350f")], { need: "energy", rate: 0.3, action: "Put your feet up" }),
  beanbag: F("Living", "Beanbag", 140, [0.9, 0.9, 0.8], "#7c3aed", [K(0.85, 0.35, 0.85, 0, 0, 0, "#7c3aed"), S(0.28, 0, 0.5, -0.15, "#6d28d9")], { need: "fun", rate: 0.35, action: "Flop down" }),
  rockingChair: F("Living", "Rocking Chair", 340, [0.6, 0.9, 1.05], WOOD, [B(0.55, 0.05, 0.5, 0, 0.42, 0, WOOD), B(0.55, 0.6, 0.04, 0, 0.45, -0.25, WOOD), B(0.04, 0.04, 0.9, -0.26, 0, 0, DARK), B(0.04, 0.04, 0.9, 0.26, 0, 0, DARK), ...legs(0.55, 0.5, 0.42, DARK, 0.02)], { need: "fun", rate: 0.3, action: "Rock" }),
  mediaWall: F("Living", "Big Screen TV", 3200, [2.4, 0.5, 1.8], BLACK, [B(2.4, 0.45, 0.48, 0, 0, 0, "#292524"), B(2.2, 1.2, 0.05, 0, 0.55, -0.12, "#0a0a0a", "g"), B(2.14, 1.14, 0.01, 0, 0.58, -0.09, "#1e3a8a", "x"), B(0.12, 0.9, 0.12, -1.12, 0.45, 0, BLACK), B(0.12, 0.9, 0.12, 1.12, 0.45, 0, BLACK)], { need: "fun", rate: 2, action: "Movie night" }),
  arcade: F("Living", "Arcade Cabinet", 1500, [0.7, 0.8, 1.8], "#4c1d95", [B(0.7, 1.8, 0.8, 0, 0, -0.05, "#4c1d95"), B(0.6, 0.45, 0.02, 0, 1.15, 0.36, "#22d3ee", "x"), B(0.7, 0.06, 0.3, 0, 0.95, 0.4, BLACK), S(0.03, -0.12, 1.03, 0.45, "#ef4444"), S(0.025, 0.1, 1.02, 0.45, "#facc15"), B(0.66, 0.15, 0.02, 0, 1.62, 0.36, "#f472b6", "x")], { need: "fun", rate: 1.8, action: "Play arcade" }),
  poolTable: F("Living", "Pool Table", 2800, [2.4, 1.4, 0.82], "#166534", [B(2.4, 0.12, 1.4, 0, 0.7, 0, DARK), B(2.2, 0.02, 1.2, 0, 0.82, 0, "#15803d"), ...legs(2.4, 1.4, 0.7, DARK, 0.07), S(0.03, 0.4, 0.86, 0.1, WHITE), S(0.03, -0.5, 0.86, -0.1, "#dc2626"), S(0.03, -0.55, 0.86, 0.05, "#facc15")], { need: "fun", rate: 1.5, action: "Shoot pool" }),
  gamingDesk: F("Office", "Gaming Setup", 2400, [1.6, 0.8, 1.3], BLACK, [B(1.6, 0.04, 0.8, 0, 0.72, 0, BLACK), ...legs(1.6, 0.8, 0.72, "#dc2626"), ...[-0.42, 0.42].flatMap((x) => [B(0.62, 0.36, 0.03, x, 0.95, -0.25, "#0a0a0a", "g"), B(0.58, 0.32, 0.01, x, 0.97, -0.23, "#7c3aed", "x")]), B(0.5, 0.02, 0.16, 0, 0.76, 0.1, "#27272a"), B(0.2, 0.4, 0.4, 0.62, 0, -0.1, "#27272a")], { need: "fun", rate: 1.6, action: "Game all night" }),
  officeChair: F("Office", "Office Chair", 260, [0.6, 0.6, 1.15], BLACK, [C(0.28, 0.04, 0, 0.05, 0, "#27272a"), C(0.03, 0.42, 0, 0.05, 0, STEEL, "g"), K(0.5, 0.08, 0.48, 0, 0.47, 0, BLACK), B(0.46, 0.55, 0.06, 0, 0.6, -0.22, BLACK)]),
  filingCabinet: F("Office", "Filing Cabinet", 220, [0.5, 0.6, 1.3], "#94a3b8", [B(0.5, 1.3, 0.6, 0, 0, 0, "#94a3b8", "g"), ...[0.15, 0.55, 0.95].map((y) => B(0.18, 0.03, 0.03, 0, y + 0.2, 0.31, "#475569", "g"))]),
  consoleTable: F("Living", "Hall Table", 300, [1.2, 0.35, 0.8], OAK, [B(1.2, 0.04, 0.35, 0, 0.76, 0, OAK), B(1.1, 0.03, 0.3, 0, 0.2, 0, OAK), ...legs(1.2, 0.35, 0.76, DARK, 0.02), S(0.08, 0.35, 0.88, 0, "#94a3b8")]),
  bench: F("Living", "Entry Bench", 200, [1.2, 0.4, 0.48], WOOD, [B(1.2, 0.05, 0.4, 0, 0.43, 0, WOOD), K(1.1, 0.06, 0.36, 0, 0.48, 0, "#cbd5e1"), ...legs(1.2, 0.4, 0.43, DARK, 0.025)]),
  workbench: F("Office", "Workbench", 450, [1.8, 0.7, 1.6], "#78716c", [B(1.8, 0.06, 0.7, 0, 0.86, 0, "#a8a29e"), ...legs(1.8, 0.7, 0.86, "#57534e", 0.04), B(1.8, 0.7, 0.03, 0, 0.92, -0.33, "#d6d3d1"), B(0.4, 0.06, 0.06, -0.4, 1.3, -0.3, "#dc2626"), B(0.3, 0.05, 0.05, 0.3, 1.1, -0.3, STEEL, "g")], { need: "fun", rate: 0.6, action: "Tinker" }),
  treadmill: F("Office", "Treadmill", 1200, [0.8, 1.8, 1.4], BLACK, [B(0.8, 0.15, 1.8, 0, 0, 0, BLACK), B(0.6, 0.02, 1.5, 0, 0.15, 0.1, "#3f3f46"), B(0.05, 1.2, 0.05, -0.35, 0.15, -0.8, STEEL), B(0.05, 1.2, 0.05, 0.35, 0.15, -0.8, STEEL), B(0.75, 0.25, 0.15, 0, 1.25, -0.8, "#27272a"), B(0.3, 0.15, 0.01, 0, 1.3, -0.72, "#22d3ee", "x")], { need: "fun", rate: 0.7, action: "Work out" }),

  // ---------------------------------------------------------------- Decor (33)
  tableLamp: D("Table Lamp", 70, [0.35, 0.35, 0.6], "#fef3c7", [C(0.12, 0.03, 0, 0, 0, "#78716c"), C(0.02, 0.35, 0, 0.03, 0, "#78716c"), C(0.15, 0.22, 0, 0.38, 0, "#fef3c7")]),
  arcLamp: D("Arc Floor Lamp", 260, [0.5, 1.1, 2], STEEL, [B(0.35, 0.04, 0.35, 0, 0, -0.4, BLACK), C(0.015, 1.8, 0, 0.04, -0.4, STEEL, "g"), B(0.03, 0.03, 0.9, 0, 1.84, 0.05, STEEL, "g"), N(0.2, 0.18, 0, 1.68, 0.45, "#fde68a")]),
  chandelier: D("Chandelier", 900, [0.9, 0.9, 3], "#fbbf24", [C(0.01, 0.6, 0, 2.4, 0, "#a16207"), C(0.4, 0.03, 0, 2.35, 0, "#ca8a04", "g"), ...[0, 1, 2, 3, 4, 5].map((k): PartSpec => S(0.06, Math.cos(k * 1.047) * 0.38, 2.45, Math.sin(k * 1.047) * 0.38, "#fef9c3", "x")), S(0.1, 0, 2.22, 0, "#fde68a", "x")], { anywhere: true }),
  candles: D("Candle Cluster", 40, [0.4, 0.4, 0.4], "#fef3c7", [C(0.05, 0.3, -0.1, 0, 0, "#fef3c7"), C(0.05, 0.22, 0.08, 0, 0.06, "#fef3c7"), C(0.05, 0.15, 0.05, 0, -0.1, "#fde68a"), S(0.02, -0.1, 0.33, 0, "#f97316"), S(0.02, 0.08, 0.25, 0.06, "#f97316"), S(0.02, 0.05, 0.18, -0.1, "#f97316")]),
  lavaLamp: D("Lava Lamp", 60, [0.25, 0.25, 0.55], "#ec4899", [N(0.11, 0.15, 0, 0, 0, "#71717a"), C(0.07, 0.3, 0, 0.15, 0, "#f472b6", "x"), S(0.04, 0, 0.25, 0, "#be185d"), N(0.06, 0.1, 0, 0.45, 0, "#71717a")]),
  neonSign: D("Neon Sign", 350, [1.2, 0.2, 1.6], "#f0abfc", [B(1.2, 0.6, 0.04, 0, 1, -0.08, "#18181b"), B(0.9, 0.06, 0.03, 0, 1.4, -0.04, "#f0abfc", "x"), B(0.9, 0.06, 0.03, 0, 1.15, -0.04, "#67e8f9", "x"), B(0.06, 0.3, 0.03, -0.45, 1.15, -0.04, "#f0abfc", "x"), C(0.015, 1, 0, 0, 0, "#3f3f46")], { need: "fun", rate: 0.2, action: "Admire it" }),
  painting: D("Painting", 300, [1, 0.3, 1.5], "#2563eb", [B(0.9, 0.7, 0.04, 0, 0.75, 0, "#a16207"), B(0.8, 0.6, 0.02, 0, 0.8, 0.02, "#2563eb"), S(0.12, 0.2, 1.2, 0.04, "#facc15"), B(0.8, 0.2, 0.025, 0, 0.8, 0.025, "#15803d"), B(0.04, 0.9, 0.04, -0.25, 0, -0.1, DARK), B(0.04, 0.9, 0.04, 0.25, 0, -0.1, DARK)], { need: "fun", rate: 0.2, action: "Admire it" }),
  standingMirror: D("Standing Mirror", 240, [0.6, 0.4, 1.7], "#e2e8f0", [B(0.55, 1.6, 0.04, 0, 0.08, 0, OAK), B(0.47, 1.5, 0.01, 0, 0.13, 0.025, "#e2e8f0", "x"), B(0.5, 0.06, 0.35, 0, 0, -0.1, OAK)]),
  grandfatherClock: D("Grandfather Clock", 1300, [0.55, 0.35, 2.1], DARK, [B(0.5, 2.1, 0.33, 0, 0, 0, "#3f2a10"), C(0.18, 0.02, 0, 1.75, 0.17, "#fef3c7"), B(0.3, 0.9, 0.01, 0, 0.5, 0.17, "#ca8a04", "x"), S(0.06, 0, 0.6, 0.15, "#ca8a04", "g")]),
  vase: D("Flower Vase", 60, [0.3, 0.3, 0.7], "#1d4ed8", [C(0.1, 0.35, 0, 0, 0, "#1d4ed8", "g"), S(0.06, -0.05, 0.5, 0, "#f43f5e"), S(0.05, 0.06, 0.55, 0.03, "#fde047"), S(0.05, 0, 0.6, -0.04, "#f9a8d4"), C(0.008, 0.25, 0, 0.35, 0, "#15803d")]),
  monstera: D("Monstera", 150, [0.8, 0.8, 1.5], "#15803d", [C(0.22, 0.4, 0, 0, 0, WHITE), S(0.35, 0, 0.8, 0, "#15803d"), S(0.28, 0.25, 1.05, 0.1, "#166534"), S(0.25, -0.22, 1.15, -0.05, "#16a34a"), S(0.2, 0.05, 1.3, 0, "#15803d")], { anywhere: true }),
  cactus: D("Cactus", 50, [0.4, 0.4, 1], "#65a30d", [C(0.14, 0.2, 0, 0, 0, "#c2410c"), C(0.08, 0.7, 0, 0.2, 0, "#65a30d"), C(0.05, 0.25, 0.12, 0.45, 0, "#65a30d"), C(0.05, 0.2, -0.12, 0.55, 0, "#65a30d"), S(0.08, 0, 0.9, 0, "#65a30d")], { anywhere: true }),
  bonsai: D("Bonsai", 220, [0.5, 0.35, 0.6], "#166534", [B(0.45, 0.1, 0.3, 0, 0, 0, "#57534e"), C(0.03, 0.25, 0, 0.1, 0, "#5b3a1e"), S(0.15, 0.05, 0.4, 0, "#166534"), S(0.1, -0.12, 0.35, 0.02, "#15803d")]),
  fern: D("Fern", 70, [0.5, 0.5, 0.8], "#22c55e", [C(0.16, 0.3, 0, 0, 0, "#78716c"), ...[0, 1, 2, 3, 4, 5].map((k): PartSpec => S(0.14, Math.cos(k) * 0.12, 0.45 + (k % 2) * 0.08, Math.sin(k) * 0.12, k % 2 ? "#22c55e" : "#16a34a"))], { anywhere: true }),
  roundRug: D("Round Rug", 180, [2, 2, 0.02], "#0f766e", [C(1, 0.015, 0, 0.005, 0, "#0f766e"), C(0.7, 0.017, 0, 0.005, 0, "#14b8a6"), C(0.3, 0.019, 0, 0.005, 0, "#99f6e4")], { flat: true }),
  runnerRug: D("Hall Runner", 120, [0.8, 3, 0.02], "#7f1d1d", [B(0.8, 0.015, 3, 0, 0.005, 0, "#7f1d1d"), B(0.6, 0.017, 2.8, 0, 0.005, 0, "#b91c1c")], { flat: true }),
  bathMat: D("Bath Mat", 30, [0.8, 0.5, 0.02], "#bae6fd", [B(0.8, 0.02, 0.5, 0, 0.005, 0, "#bae6fd")], { flat: true }),
  floorCushions: D("Floor Cushions", 90, [1, 1, 0.3], "#f59e0b", [K(0.55, 0.15, 0.55, -0.2, 0, -0.2, "#f59e0b"), K(0.55, 0.15, 0.55, 0.22, 0, 0.15, "#ef4444"), K(0.45, 0.12, 0.45, 0, 0.15, 0, "#a855f7")], { need: "fun", rate: 0.2, action: "Sit cross-legged" }),
  globe: D("Globe", 110, [0.4, 0.4, 0.9], "#2563eb", [C(0.12, 0.03, 0, 0, 0, "#a16207"), C(0.02, 0.5, 0, 0.03, 0, "#a16207"), S(0.2, 0, 0.7, 0, "#2563eb"), S(0.12, 0.08, 0.76, 0.1, "#15803d")]),
  aquarium: D("Aquarium", 1100, [1.2, 0.45, 1.3], "#0ea5e9", [B(1.2, 0.7, 0.45, 0, 0, 0, BLACK), B(1.2, 0.55, 0.45, 0, 0.7, 0, "#38bdf8", "x"), S(0.04, -0.2, 0.95, 0, "#f97316"), S(0.035, 0.25, 0.85, 0.05, "#facc15"), B(1.2, 0.05, 0.45, 0, 1.25, 0, BLACK)], { need: "fun", rate: 0.5, action: "Watch the fish" }),
  birdcage: D("Birdcage", 160, [0.5, 0.5, 1.6], "#ca8a04", [C(0.02, 1, 0, 0, 0, "#ca8a04"), C(0.2, 0.02, 0, 1, 0, "#ca8a04", "g"), C(0.2, 0.45, 0, 1.02, 0, "#fde68a", "x"), N(0.21, 0.15, 0, 1.47, 0, "#ca8a04"), S(0.05, 0, 1.15, 0, "#22c55e")], { need: "fun", rate: 0.3, action: "Chat to the bird" }),
  bust: D("Marble Bust", 1200, [0.5, 0.5, 1.6], "#e7e5e4", [B(0.4, 1, 0.4, 0, 0, 0, "#d6d3d1"), B(0.35, 0.2, 0.25, 0, 1, 0, "#e7e5e4"), S(0.14, 0, 1.35, 0, "#e7e5e4")]),
  trophyCase: D("Trophy Cabinet", 700, [1.2, 0.45, 1.9], OAK, [B(1.2, 1.9, 0.45, 0, 0, 0, OAK), B(1.1, 1.7, 0.01, 0, 0.1, 0.225, "#cbd5e1", "x"), ...[0.6, 1.2].map((y) => B(1.1, 0.02, 0.4, 0, y, 0, OAK)), N(0.06, 0.2, -0.3, 0.62, 0, "#facc15"), N(0.06, 0.2, 0.2, 1.22, 0, "#d4d4d8"), C(0.05, 0.15, 0.3, 0.62, 0, "#ca8a04")]),
  recordPlayer: D("Record Player", 450, [0.6, 0.45, 0.85], WOOD, [B(0.6, 0.65, 0.45, 0, 0, 0, DARK), B(0.55, 0.1, 0.4, 0, 0.65, 0, WOOD), C(0.15, 0.01, -0.05, 0.75, 0, BLACK), B(0.02, 0.01, 0.2, 0.18, 0.77, 0, STEEL, "g")], { need: "fun", rate: 0.9, action: "Play a record" }),
  guitar: D("Guitar on Stand", 600, [0.45, 0.4, 1.1], "#b45309", [B(0.3, 0.05, 0.3, 0, 0, 0, BLACK), S(0.17, 0, 0.32, 0, "#b45309"), S(0.13, 0, 0.55, 0, "#b45309"), B(0.05, 0.45, 0.03, 0, 0.62, 0, DARK), B(0.08, 0.1, 0.03, 0, 1.05, 0, DARK)], { need: "fun", rate: 1.1, action: "Strum" }),
  drumKit: D("Drum Kit", 1400, [1.6, 1.2, 1.1], "#dc2626", [C(0.28, 0.4, 0, 0.1, 0.1, "#dc2626"), C(0.18, 0.2, -0.45, 0.45, 0.25, "#dc2626"), C(0.18, 0.2, 0.45, 0.45, 0.25, "#dc2626"), C(0.22, 0.01, -0.7, 0.95, -0.1, "#ca8a04", "g"), C(0.01, 0.95, -0.7, 0, -0.1, STEEL), C(0.2, 0.01, 0.7, 0.9, -0.1, "#ca8a04", "g"), C(0.01, 0.9, 0.7, 0, -0.1, STEEL), C(0.15, 0.06, 0, 0, -0.45, BLACK)], { need: "fun", rate: 1.4, action: "Drum solo" }),
  easel: D("Art Easel", 180, [0.7, 0.6, 1.7], WOOD, [B(0.04, 1.7, 0.04, -0.25, 0, 0, WOOD), B(0.04, 1.7, 0.04, 0.25, 0, 0, WOOD), B(0.04, 1.6, 0.04, 0, 0, -0.25, WOOD), B(0.6, 0.5, 0.03, 0, 0.9, 0.04, WHITE), B(0.3, 0.2, 0.031, -0.05, 1.05, 0.045, "#38bdf8")], { need: "fun", rate: 0.8, action: "Paint" }),
  fireplace: D("Fireplace", 2500, [1.6, 0.6, 1.3], "#78716c", [B(1.6, 1.2, 0.6, 0, 0, 0, "#78716c"), B(0.9, 0.6, 0.05, 0, 0.1, 0.28, "#1c1917"), S(0.15, -0.1, 0.25, 0.2, "#f97316"), S(0.12, 0.12, 0.22, 0.2, "#fb923c"), B(1.8, 0.08, 0.7, 0, 1.2, 0, "#57534e")], { need: "energy", rate: 0.2, action: "Warm up" }),
  roomDivider: D("Room Divider", 210, [1.5, 0.2, 1.7], "#fef3c7", [B(0.48, 1.7, 0.03, -0.5, 0, 0, "#fef3c7"), B(0.48, 1.7, 0.03, 0, 0, 0.06, "#fef3c7"), B(0.48, 1.7, 0.03, 0.5, 0, 0, "#fef3c7")]),
  coatRack: D("Coat Rack", 80, [0.5, 0.5, 1.8], DARK, [C(0.2, 0.03, 0, 0, 0, DARK), C(0.025, 1.75, 0, 0.03, 0, DARK), S(0.12, 0.08, 1.5, 0.05, "#1e3a8a"), S(0.1, -0.08, 1.55, -0.03, "#7f1d1d")]),
  speakers: D("Tower Speakers", 800, [1.4, 0.35, 1.1], BLACK, [B(0.3, 1.1, 0.3, -0.55, 0, 0, BLACK), B(0.3, 1.1, 0.3, 0.55, 0, 0, BLACK), C(0.08, 0.01, -0.55, 0.7, 0.15, "#52525b"), C(0.08, 0.01, 0.55, 0.7, 0.15, "#52525b"), C(0.12, 0.01, -0.55, 0.3, 0.15, "#52525b"), C(0.12, 0.01, 0.55, 0.3, 0.15, "#52525b")], { need: "fun", rate: 0.8, action: "Turn it up" }),
  floorVase: D("Tall Floor Vase", 140, [0.4, 0.4, 1.3], "#0f766e", [C(0.16, 0.8, 0, 0, 0, "#0f766e", "g"), C(0.1, 0.15, 0, 0.8, 0, "#0f766e", "g"), C(0.008, 0.45, -0.04, 0.9, 0, "#a16207"), C(0.008, 0.4, 0.05, 0.9, 0.02, "#a16207"), S(0.05, -0.04, 1.36, 0, "#fef3c7"), S(0.05, 0.05, 1.3, 0.02, "#fef3c7")]),
  festiveTree: D("Festive Tree", 250, [1.1, 1.1, 2.1], "#14532d", [C(0.3, 0.2, 0, 0, 0, "#b91c1c"), N(0.55, 0.8, 0, 0.3, 0, "#14532d"), N(0.42, 0.7, 0, 0.8, 0, "#166534"), N(0.28, 0.6, 0, 1.3, 0, "#14532d"), S(0.08, 0, 1.95, 0, "#facc15"), S(0.04, 0.3, 0.6, 0.25, "#ef4444"), S(0.04, -0.25, 1, 0.2, "#3b82f6"), S(0.04, 0.15, 1.4, 0.15, "#f59e0b")], { anywhere: true }),

  // -------------------------------------------------------------- Outdoor (33)
  picketFence: O("Picket Fence", 60, [2, 0.1, 1], WHITE, [B(2, 0.06, 0.04, 0, 0.3, 0, WHITE), B(2, 0.06, 0.04, 0, 0.75, 0, WHITE), ...[-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].flatMap((x): PartSpec[] => [B(0.09, 0.9, 0.03, x, 0, 0.03, WHITE), N(0.065, 0.1, x, 0.9, 0.03, WHITE)])]),
  timberFence: O("Timber Fence", 90, [2, 0.1, 1.8], "#78350f", [...[-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map((x) => B(0.29, 1.8, 0.03, x, 0, 0.02, "#92400e")), B(2, 0.1, 0.05, 0, 0.4, -0.03, "#78350f"), B(2, 0.1, 0.05, 0, 1.4, -0.03, "#78350f")]),
  hedge: O("Hedge", 80, [2, 0.7, 1.2], "#166534", [B(2, 1.1, 0.7, 0, 0, 0, "#166534"), S(0.4, -0.6, 1.05, 0, "#15803d"), S(0.4, 0.1, 1.08, 0, "#166534"), S(0.35, 0.7, 1.03, 0, "#15803d")]),
  shrub: O("Round Shrub", 45, [0.9, 0.9, 0.9], "#15803d", [S(0.45, 0, 0.42, 0, "#15803d"), S(0.3, 0.2, 0.6, 0.1, "#16a34a")]),
  flowerBed: O("Flower Bed", 120, [2, 0.8, 0.5], "#a16207", [B(2, 0.3, 0.8, 0, 0, 0, "#78350f"), B(1.9, 0.02, 0.7, 0, 0.3, 0, "#3f2a10"), ...[-0.8, -0.4, 0, 0.4, 0.8].flatMap((x, i): PartSpec[] => [C(0.01, 0.15, x, 0.3, 0, "#15803d"), S(0.08, x, 0.47, 0, ["#f43f5e", "#facc15", "#a855f7", "#fb923c", "#f9a8d4"][i])])]),
  planter: O("Stone Planter", 90, [0.7, 0.7, 1.1], "#a8a29e", [B(0.6, 0.55, 0.6, 0, 0, 0, "#a8a29e"), S(0.35, 0, 0.8, 0, "#16a34a"), S(0.08, 0.15, 1, 0.2, "#f472b6")]),
  oakTree: O("Oak Tree", 400, [3.4, 3.4, 5], "#166534", tree(2.2, 1.5, "#166534", "#15803d")),
  pineTree: O("Pine Tree", 350, [2.4, 2.4, 6], "#14532d", [C(0.14, 1.2, 0, 0, 0, "#5b3a1e"), N(1.2, 1.8, 0, 1.2, 0, "#14532d"), N(0.95, 1.6, 0, 2.3, 0, "#166534"), N(0.65, 1.5, 0, 3.4, 0, "#14532d"), N(0.35, 1, 0, 4.6, 0, "#166534")]),
  palmTree: O("Palm Tree", 500, [2.4, 2.4, 5], "#15803d", [C(0.13, 4, 0, 0, 0, "#a16207"), ...[0, 1, 2, 3, 4, 5].map((k): PartSpec => B(1.6, 0.04, 0.35, Math.cos(k * 1.047) * 0.7, 4, Math.sin(k * 1.047) * 0.7, "#15803d")), S(0.18, 0, 3.95, 0, "#78350f")]),
  cherryTree: O("Blossom Tree", 600, [3, 3, 4.5], "#f9a8d4", tree(2, 1.4, "#f9a8d4", "#fbcfe8")),
  parkBench: O("Garden Bench", 250, [1.6, 0.6, 0.85], WOOD, [...[-0.15, 0, 0.15].map((z) => B(1.6, 0.04, 0.12, 0, 0.45, z, WOOD)), B(1.6, 0.3, 0.04, 0, 0.55, -0.27, WOOD), B(0.06, 0.45, 0.5, -0.7, 0, 0, BLACK), B(0.06, 0.45, 0.5, 0.7, 0, 0, BLACK)], { need: "fun", rate: 0.25, action: "Sit a while" }),
  picnicTable: O("Picnic Table", 420, [1.8, 1.6, 0.76], WOOD, [B(1.8, 0.05, 0.75, 0, 0.72, 0, WOOD), B(1.8, 0.05, 0.3, 0, 0.42, -0.62, WOOD), B(1.8, 0.05, 0.3, 0, 0.42, 0.62, WOOD), B(0.08, 0.72, 1.5, -0.7, 0, 0, DARK), B(0.08, 0.72, 1.5, 0.7, 0, 0, DARK)], { need: "hunger", rate: 0.8, action: "Have a picnic" }),
  patioSet: O("Patio Umbrella Set", 700, [2.2, 2.2, 2.4], "#0ea5e9", [C(0.5, 0.04, 0, 0.72, 0, WHITE), C(0.03, 2.3, 0, 0, 0, STEEL), N(1.1, 0.4, 0, 2.05, 0, "#0ea5e9"), ...[0, 1.57, 3.14, 4.71].map((a): PartSpec => K(0.45, 0.45, 0.45, Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85, WHITE))], { need: "hunger", rate: 0.6, action: "Dine al fresco" }),
  sunLounger: O("Sun Lounger", 300, [0.7, 2, 0.6], WHITE, [B(0.7, 0.1, 1.4, 0, 0.3, 0.3, WHITE), K(0.6, 0.08, 1.3, 0, 0.4, 0.3, "#fde68a"), B(0.7, 0.6, 0.1, 0, 0.3, -0.55, WHITE), ...legs(0.7, 1.4, 0.3, STEEL, 0.02)], { need: "energy", rate: 0.3, action: "Sunbathe" }),
  hammock: O("Hammock", 280, [3.2, 1, 1.6], "#f59e0b", [C(0.08, 1.6, -1.5, 0, 0, "#5b3a1e"), C(0.08, 1.6, 1.5, 0, 0, "#5b3a1e"), K(2.4, 0.08, 0.8, 0, 0.75, 0, "#f59e0b"), B(0.35, 0.02, 0.02, -1.3, 1.2, 0, "#78350f"), B(0.35, 0.02, 0.02, 1.3, 1.2, 0, "#78350f")], { need: "energy", rate: 0.45, action: "Nap in the hammock" }),
  firePit: O("Fire Pit", 450, [1.2, 1.2, 0.5], "#57534e", [C(0.6, 0.3, 0, 0, 0, "#57534e"), C(0.45, 0.02, 0, 0.3, 0, "#1c1917"), S(0.15, -0.05, 0.38, 0, "#f97316"), S(0.11, 0.1, 0.36, 0.05, "#facc15")], { need: "fun", rate: 0.7, action: "Toast marshmallows" }),
  swingSet: O("Swing Set", 650, [3, 1.6, 2.2], "#dc2626", [B(0.08, 2.2, 0.08, -1.4, 0, -0.6, "#dc2626"), B(0.08, 2.2, 0.08, -1.4, 0, 0.6, "#dc2626"), B(0.08, 2.2, 0.08, 1.4, 0, -0.6, "#dc2626"), B(0.08, 2.2, 0.08, 1.4, 0, 0.6, "#dc2626"), B(3, 0.08, 0.08, 0, 2.15, 0, "#dc2626"), ...[-0.6, 0.6].flatMap((x): PartSpec[] => [C(0.01, 1.6, x - 0.2, 0.55, 0, STEEL), C(0.01, 1.6, x + 0.2, 0.55, 0, STEEL), B(0.5, 0.04, 0.2, x, 0.5, 0, "#facc15")])], { need: "fun", rate: 1.2, action: "Swing" }),
  slide: O("Playground Slide", 550, [0.8, 2.8, 1.8], "#2563eb", [B(0.8, 1.6, 0.8, 0, 0, -1, "#1d4ed8"), B(0.6, 0.06, 2.2, 0, 0.8, 0.3, "#facc15"), B(0.06, 0.25, 2.2, -0.3, 0.86, 0.3, "#facc15"), B(0.06, 0.25, 2.2, 0.3, 0.86, 0.3, "#facc15")], { need: "fun", rate: 1.2, action: "Go down the slide" }),
  trampoline: O("Trampoline", 800, [3, 3, 0.8], "#1d4ed8", [C(1.5, 0.08, 0, 0.6, 0, "#1d4ed8"), C(1.3, 0.09, 0, 0.6, 0, BLACK), ...[0, 1.57, 3.14, 4.71].map((a): PartSpec => C(0.04, 0.6, Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4, STEEL))], { need: "fun", rate: 1.6, action: "Bounce" }),
  basketballHoop: O("Basketball Hoop", 500, [1.2, 1, 3.2], "#f97316", [B(0.6, 0.15, 0.8, 0, 0, -0.1, BLACK), C(0.06, 3, 0, 0.15, -0.35, STEEL, "g"), B(1.2, 0.8, 0.05, 0, 2.6, -0.3, WHITE), C(0.23, 0.02, 0, 2.75, 0, "#f97316"), S(0.12, 0.3, 0.12, 0.3, "#ea580c")], { need: "fun", rate: 1.4, action: "Shoot hoops" }),
  gazebo: O("Gazebo", 4200, [3.6, 3.6, 3.2], WHITE, [B(3.6, 0.15, 3.6, 0, 0, 0, "#d6d3d1"), ...[-1.65, 1.65].flatMap((x): PartSpec[] => [-1.65, 1.65].map((z) => C(0.08, 2.4, x, 0.15, z, WHITE))), N(2.1, 0.8, 0, 2.55, 0, "#7f1d1d"), B(3.4, 0.1, 0.1, 0, 2.5, -1.65, WHITE), B(3.4, 0.1, 0.1, 0, 2.5, 1.65, WHITE)], { need: "fun", rate: 0.5, action: "Take in the view" }),
  shed: O("Garden Shed", 2000, [2.4, 2, 2.4], "#65a30d", [B(2.4, 2, 2, 0, 0, 0, "#4d7c0f"), B(0.8, 1.8, 0.03, 0, 0, 1.01, "#3f6212"), B(2.6, 0.08, 2.3, 0, 2, 0, "#3f2a10"), B(0.4, 0.4, 0.03, 0.75, 1, 1.01, "#bae6fd", "x")]),
  lampPost: O("Garden Lamp Post", 220, [0.4, 0.4, 2.6], BLACK, [C(0.12, 0.08, 0, 0, 0, BLACK), C(0.04, 2.3, 0, 0.08, 0, BLACK), B(0.25, 0.3, 0.25, 0, 2.3, 0, "#fef3c7", "x"), N(0.2, 0.15, 0, 2.6, 0, BLACK)]),
  fountain: O("Garden Fountain", 1800, [2, 2, 1.6], "#a8a29e", [C(1, 0.4, 0, 0, 0, "#a8a29e"), C(0.9, 0.02, 0, 0.36, 0, "#38bdf8", "x"), C(0.12, 0.9, 0, 0.4, 0, "#a8a29e"), C(0.45, 0.12, 0, 1.25, 0, "#a8a29e"), C(0.38, 0.02, 0, 1.36, 0, "#7dd3fc", "x"), S(0.1, 0, 1.5, 0, "#bae6fd", "x")], { need: "fun", rate: 0.3, action: "Toss a coin" }),
  birdbath: O("Birdbath", 160, [0.6, 0.6, 0.9], "#d6d3d1", [C(0.18, 0.08, 0, 0, 0, "#d6d3d1"), C(0.07, 0.7, 0, 0.08, 0, "#d6d3d1"), C(0.3, 0.1, 0, 0.78, 0, "#d6d3d1"), C(0.25, 0.02, 0, 0.86, 0, "#7dd3fc", "x")]),
  well: O("Wishing Well", 900, [1.4, 1.4, 2.2], "#78716c", [C(0.7, 0.8, 0, 0, 0, "#78716c"), C(0.55, 0.02, 0, 0.75, 0, "#0c4a6e", "x"), B(0.08, 1.4, 0.08, -0.6, 0.8, 0, DARK), B(0.08, 1.4, 0.08, 0.6, 0.8, 0, DARK), N(1, 0.5, 0, 1.7, 0, "#7f1d1d")], { need: "fun", rate: 0.3, action: "Make a wish" }),
  veggiePatch: O("Vegetable Patch", 150, [2, 1.2, 0.5], "#3f2a10", [B(2, 0.2, 1.2, 0, 0, 0, "#3f2a10"), ...[-0.7, -0.25, 0.25, 0.7].flatMap((x, i): PartSpec[] => [-0.3, 0.3].map((z) => S(0.12, x, 0.3, z, ["#16a34a", "#dc2626", "#f97316", "#65a30d"][i])))], { need: "hunger", rate: 0.5, action: "Pick some veggies" }),
  doghouse: O("Dog Kennel", 300, [1, 1.2, 1.1], "#b45309", [B(1, 0.7, 1.2, 0, 0, 0, "#b45309"), B(0.4, 0.45, 0.02, 0, 0, 0.61, "#1c1917"), N(0.65, 0.4, 0, 0.7, 0, "#7f1d1d")]),
  boulders: O("Rock Garden", 140, [2, 1.5, 0.9], "#78716c", [S(0.45, -0.5, 0.42, 0, "#78716c"), S(0.32, 0.3, 0.22, 0.2, "#a8a29e"), S(0.25, 0.65, 0.18, -0.3, "#57534e"), S(0.15, -0.05, 0.12, 0.5, "#a8a29e")]),
  deck: O("Timber Deck", 600, [4, 3, 0.15], "#a16207", [B(4, 0.12, 3, 0, 0, 0, "#78350f"), ...[-1.25, -0.75, -0.25, 0.25, 0.75, 1.25].map((z) => B(4, 0.03, 0.45, 0, 0.12, z, "#a16207"))], { flat: true }),
  steppingStones: O("Stepping Stones", 80, [0.8, 3, 0.05], "#a8a29e", [C(0.3, 0.04, 0.1, 0, -1.1, "#a8a29e"), C(0.28, 0.04, -0.1, 0, -0.35, "#d6d3d1"), C(0.3, 0.04, 0.12, 0, 0.4, "#a8a29e"), C(0.27, 0.04, -0.05, 0, 1.15, "#d6d3d1")], { flat: true }),
  gnome: O("Garden Gnome", 35, [0.35, 0.35, 0.55], "#dc2626", [C(0.12, 0.22, 0, 0, 0, "#2563eb"), S(0.1, 0, 0.3, 0, "#fcd34d"), S(0.09, 0, 0.24, 0.05, WHITE), N(0.11, 0.22, 0, 0.36, 0, "#dc2626")]),
  outdoorShower: O("Outdoor Shower", 700, [1, 1, 2.3], "#a16207", [B(1, 0.08, 1, 0, 0, 0, "#a16207"), C(0.03, 2.2, -0.4, 0.08, -0.4, STEEL, "g"), B(0.4, 0.03, 0.03, -0.2, 2.25, -0.4, STEEL, "g"), C(0.1, 0.02, 0, 2.2, -0.4, STEEL, "g")], { need: "hygiene", rate: 2.4, action: "Rinse off" }),
} satisfies Record<string, CatalogItem>;

export type CatalogId = keyof typeof CATALOG;
