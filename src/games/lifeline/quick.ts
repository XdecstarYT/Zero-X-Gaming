/**
 * Quick rooms: ready-made rooms placed in one click. Each is a small building (or an
 * outdoor zone) with its walls, doors, floor, room paint and furniture, all laid down as
 * ordinary jobs for the workmen. Layouts are written facing south (doors on the bottom
 * edge, z = d - 1) and turned in quarter steps when placed.
 */
import { DOOR_COST, FLOORS, OBJECTS, WALL_COST, type FloorId, type ObjectId, type RoomId } from "./data";
import { footprint } from "./world";

export type QuickId =
  | "frontDesk"
  | "waiting"
  | "gp"
  | "pharmacy"
  | "ward"
  | "radiology"
  | "emergency"
  | "ed"
  | "triage"
  | "theatre"
  | "icu"
  | "maternity"
  | "psychiatry"
  | "mri"
  | "research"
  | "staffRoom"
  | "cafe"
  | "toilets"
  | "janitor"
  | "office"
  | "garden"
  | "helipad"
  | "ambulanceBay"
  | "deliveries";

type Rect = [number, number, number, number];

export interface QuickDef {
  name: string;
  desc: string;
  group: "Emergency" | "Clinical" | "Public" | "Support" | "Outdoor";
  /** Size in cells, walls included (before turning). */
  w: number;
  d: number;
  /** A zone outside: no foundation or walls. */
  outdoor?: boolean;
  /** Floor for the building, or paving outside (null: leave the grass). */
  floor: FloorId | null;
  /** Inner walls, as rectangles of cells. */
  walls?: Rect[];
  doors: [number, number][];
  rooms: [RoomId, ...Rect][];
  /** Furniture: kind, x, z, rotation. */
  items: [ObjectId, number, number, number][];
}

export const QUICK_ROOMS: Record<QuickId, QuickDef> = {
  ed: {
    name: "Emergency department",
    desc: "Triage, a waiting area and a three-bed resus room with its own ambulance door.",
    group: "Emergency",
    w: 14,
    d: 10,
    floor: "lino",
    walls: [[5, 1, 5, 8]],
    doors: [
      [2, 9],
      [9, 9],
      [5, 4],
    ],
    rooms: [
      ["triage", 1, 1, 4, 3],
      ["waiting", 1, 4, 4, 8],
      ["emergency", 6, 1, 12, 8],
    ],
    items: [
      ["chair", 1, 1, 0],
      ["triageDesk", 1, 2, 0],
      ["seats", 1, 5, 0],
      ["seats", 1, 7, 0],
      ["traumaBed", 6, 1, 0],
      ["defib", 7, 1, 0],
      ["traumaBed", 8, 1, 0],
      ["monitor", 9, 1, 0],
      ["traumaBed", 10, 1, 0],
      ["sink", 12, 1, 0],
      ["extinguisher", 12, 8, 2],
    ],
  },
  emergency: {
    name: "Emergency room",
    desc: "Three trauma beds, a defibrillator and a sink.",
    group: "Emergency",
    w: 9,
    d: 7,
    floor: "lino",
    doors: [[4, 6]],
    rooms: [["emergency", 1, 1, 7, 5]],
    items: [
      ["traumaBed", 1, 1, 0],
      ["defib", 2, 1, 0],
      ["traumaBed", 3, 1, 0],
      ["traumaBed", 5, 1, 0],
      ["sink", 7, 1, 0],
      ["extinguisher", 7, 5, 2],
    ],
  },
  triage: {
    name: "Triage",
    desc: "A triage desk for a nurse. Ambulance cases are seen here first.",
    group: "Emergency",
    w: 5,
    d: 5,
    floor: "lino",
    doors: [[2, 4]],
    rooms: [["triage", 1, 1, 3, 3]],
    items: [
      ["chair", 1, 1, 0],
      ["triageDesk", 1, 2, 0],
    ],
  },
  ambulanceBay: {
    name: "Ambulance bay",
    desc: "Paved bay where ambulances hand over. Put it by the road.",
    group: "Emergency",
    w: 6,
    d: 3,
    outdoor: true,
    floor: "path",
    doors: [],
    rooms: [["ambulanceBay", 0, 0, 5, 2]],
    items: [],
  },
  helipad: {
    name: "Helipad",
    desc: "A helipad on a paved zone (needs the air ambulance research).",
    group: "Emergency",
    w: 6,
    d: 6,
    outdoor: true,
    floor: "path",
    doors: [],
    rooms: [["helipad", 0, 0, 5, 5]],
    items: [["helipad", 1, 1, 0]],
  },
  frontDesk: {
    name: "Reception & waiting",
    desc: "A reception desk, six seats and a TV, behind double doors.",
    group: "Public",
    w: 10,
    d: 8,
    floor: "lino",
    doors: [
      [2, 7],
      [3, 7],
    ],
    rooms: [
      ["reception", 1, 1, 4, 6],
      ["waiting", 5, 1, 8, 6],
    ],
    items: [
      ["chair", 2, 1, 0],
      ["receptionDesk", 1, 2, 0],
      ["plant", 4, 1, 0],
      ["seats", 5, 1, 0],
      ["tv", 8, 1, 0],
      ["seats", 5, 4, 0],
      ["plant", 8, 6, 2],
    ],
  },
  waiting: {
    name: "Waiting room",
    desc: "Six seats and a TV.",
    group: "Public",
    w: 7,
    d: 6,
    floor: "carpet",
    doors: [[4, 5]],
    rooms: [["waiting", 1, 1, 5, 4]],
    items: [
      ["seats", 1, 1, 0],
      ["seats", 1, 3, 0],
      ["tv", 5, 1, 0],
    ],
  },
  cafe: {
    name: "Café",
    desc: "A vending machine and two tables.",
    group: "Public",
    w: 6,
    d: 5,
    floor: "wood",
    doors: [[2, 4]],
    rooms: [["cafe", 1, 1, 4, 3]],
    items: [
      ["vending", 1, 1, 0],
      ["table", 4, 1, 0],
      ["table", 3, 2, 0],
    ],
  },
  toilets: {
    name: "Toilets",
    desc: "Two toilets and a sink.",
    group: "Public",
    w: 5,
    d: 5,
    floor: "tile",
    doors: [[2, 4]],
    rooms: [["toilets", 1, 1, 3, 3]],
    items: [
      ["toilet", 1, 1, 0],
      ["sink", 2, 1, 0],
      ["toilet", 3, 1, 0],
    ],
  },
  garden: {
    name: "Garden",
    desc: "Two benches and two trees.",
    group: "Outdoor",
    w: 6,
    d: 5,
    outdoor: true,
    floor: null,
    doors: [],
    rooms: [["garden", 0, 0, 5, 4]],
    items: [
      ["bench", 1, 1, 0],
      ["bench", 1, 3, 0],
      ["tree", 4, 1, 0],
      ["tree", 5, 3, 0],
    ],
  },
  deliveries: {
    name: "Deliveries zone",
    desc: "A paved drop-off for building materials. Put it by the road.",
    group: "Outdoor",
    w: 6,
    d: 3,
    outdoor: true,
    floor: "path",
    doors: [],
    rooms: [["deliveries", 0, 0, 5, 2]],
    items: [],
  },
  gp: {
    name: "Consulting room",
    desc: "Desk, chair and examination couch.",
    group: "Clinical",
    w: 6,
    d: 6,
    floor: "lino",
    doors: [[3, 5]],
    rooms: [["gp", 1, 1, 4, 4]],
    items: [
      ["chair", 1, 1, 0],
      ["desk", 1, 2, 0],
      ["examBed", 3, 1, 0],
      ["plant", 4, 4, 2],
    ],
  },
  pharmacy: {
    name: "Pharmacy",
    desc: "Counter and medicine cabinet.",
    group: "Clinical",
    w: 6,
    d: 5,
    floor: "lino",
    doors: [[2, 4]],
    rooms: [["pharmacy", 1, 1, 4, 3]],
    items: [
      ["medCabinet", 1, 1, 0],
      ["pharmacyCounter", 3, 1, 0],
    ],
  },
  ward: {
    name: "Ward",
    desc: "Four beds and two monitors.",
    group: "Clinical",
    w: 10,
    d: 7,
    floor: "lino",
    doors: [[4, 6]],
    rooms: [["ward", 1, 1, 8, 5]],
    items: [
      ["bed", 1, 1, 0],
      ["monitor", 2, 1, 0],
      ["bed", 3, 1, 0],
      ["bed", 5, 1, 0],
      ["monitor", 6, 1, 0],
      ["bed", 7, 1, 0],
    ],
  },
  radiology: {
    name: "Radiology",
    desc: "X-ray machine and lead screen.",
    group: "Clinical",
    w: 7,
    d: 6,
    floor: "tile",
    doors: [[3, 5]],
    rooms: [["radiology", 1, 1, 5, 4]],
    items: [
      ["xray", 1, 1, 0],
      ["leadScreen", 4, 1, 0],
    ],
  },
  theatre: {
    name: "Operating theatre",
    desc: "Table, lights, anaesthesia and a scrub sink.",
    group: "Clinical",
    w: 8,
    d: 7,
    floor: "tile",
    doors: [[3, 6]],
    rooms: [["theatre", 1, 1, 6, 5]],
    items: [
      ["surgicalLight", 2, 1, 0],
      ["anesthesia", 4, 1, 0],
      ["sink", 6, 1, 0],
      ["opTable", 3, 2, 0],
    ],
  },
  icu: {
    name: "Intensive care",
    desc: "Three ICU beds with ventilators.",
    group: "Clinical",
    w: 8,
    d: 6,
    floor: "tile",
    doors: [[3, 5]],
    rooms: [["icu", 1, 1, 6, 4]],
    items: [
      ["icuBed", 1, 1, 0],
      ["ventilator", 2, 1, 0],
      ["icuBed", 3, 1, 0],
      ["ventilator", 4, 1, 0],
      ["icuBed", 5, 1, 0],
      ["ventilator", 6, 1, 0],
    ],
  },
  maternity: {
    name: "Maternity",
    desc: "Two birthing beds, incubators and a sink.",
    group: "Clinical",
    w: 8,
    d: 6,
    floor: "lino",
    doors: [[3, 5]],
    rooms: [["maternity", 1, 1, 6, 4]],
    items: [
      ["birthingBed", 1, 1, 0],
      ["incubator", 2, 1, 0],
      ["birthingBed", 3, 1, 0],
      ["incubator", 4, 1, 0],
      ["sink", 6, 1, 0],
    ],
  },
  psychiatry: {
    name: "Psychiatry",
    desc: "Couch, armchair and a bookshelf.",
    group: "Clinical",
    w: 6,
    d: 5,
    floor: "carpet",
    doors: [[2, 4]],
    rooms: [["psychiatry", 1, 1, 4, 3]],
    items: [
      ["therapyCouch", 1, 1, 0],
      ["bookshelf", 3, 1, 0],
      ["armchair", 4, 3, 0],
    ],
  },
  mri: {
    name: "MRI suite",
    desc: "Scanner and console.",
    group: "Clinical",
    w: 8,
    d: 7,
    floor: "tile",
    doors: [[3, 6]],
    rooms: [["mri", 1, 1, 6, 5]],
    items: [
      ["mriScanner", 1, 1, 0],
      ["mriConsole", 4, 1, 0],
    ],
  },
  research: {
    name: "Research lab",
    desc: "Lab bench, microscope and bookshelf.",
    group: "Support",
    w: 7,
    d: 6,
    floor: "tile",
    doors: [[3, 5]],
    rooms: [["research", 1, 1, 5, 4]],
    items: [
      ["labBench", 1, 1, 0],
      ["microscope", 3, 1, 0],
      ["bookshelf", 4, 1, 0],
    ],
  },
  staffRoom: {
    name: "Staff room",
    desc: "Sofa, coffee machine and a plant.",
    group: "Support",
    w: 6,
    d: 5,
    floor: "carpet",
    doors: [[2, 4]],
    rooms: [["staffRoom", 1, 1, 4, 3]],
    items: [
      ["sofa", 1, 1, 0],
      ["plant", 3, 1, 0],
      ["coffee", 4, 1, 0],
    ],
  },
  janitor: {
    name: "Janitor's closet",
    desc: "Lockers for the janitors.",
    group: "Support",
    w: 4,
    d: 4,
    floor: "concrete",
    doors: [[1, 3]],
    rooms: [["janitor", 1, 1, 2, 2]],
    items: [["lockers", 1, 1, 0]],
  },
  office: {
    name: "Office",
    desc: "Desk, chair and filing cabinet for one administrator.",
    group: "Support",
    w: 5,
    d: 5,
    floor: "carpet",
    doors: [[2, 4]],
    rooms: [["office", 1, 1, 3, 3]],
    items: [
      ["chair", 1, 1, 0],
      ["desk", 1, 2, 0],
      ["filing", 3, 1, 0],
    ],
  },
};

export const QUICK_ORDER = Object.keys(QUICK_ROOMS) as QuickId[];
export const QUICK_GROUPS = ["Emergency", "Clinical", "Public", "Support", "Outdoor"] as const;

export interface QuickLayout {
  /** The whole footprint (inclusive). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  walls: Rect[];
  doors: { x: number; z: number }[];
  rooms: { room: RoomId; x0: number; z0: number; x1: number; z1: number }[];
  items: { kind: ObjectId; x: number; z: number; rot: number }[];
}

/** Size of a quick room once turned. */
export function quickSize(id: QuickId, rot: number) {
  const q = QUICK_ROOMS[id];
  return rot % 2 === 0 ? { w: q.w, d: q.d } : { w: q.d, d: q.w };
}

/**
 * Where everything goes with the footprint's corner at (x, z), turned `rot` quarter turns
 * (the same turns as objects: 1 faces the doors west).
 */
export function layoutQuick(id: QuickId, x: number, z: number, rot: number): QuickLayout {
  const q = QUICK_ROOMS[id];
  const r = ((rot % 4) + 4) % 4;
  // One quarter turn in a box W×D: (lx, lz) → (D - 1 - lz, lx), and the box becomes D×W.
  const turnPt = (px: number, pz: number) => {
    let W = q.w;
    let D = q.d;
    let a = px;
    let b = pz;
    for (let i = 0; i < r; i++) {
      [a, b] = [D - 1 - b, a];
      [W, D] = [D, W];
    }
    return { x: x + a, z: z + b };
  };
  const turnRect = (x0: number, z0: number, x1: number, z1: number): Rect => {
    const a = turnPt(x0, z0);
    const b = turnPt(x1, z1);
    return [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)];
  };
  const size = quickSize(id, r);
  return {
    x0: x,
    z0: z,
    x1: x + size.w - 1,
    z1: z + size.d - 1,
    walls: (q.walls ?? []).map((w) => turnRect(...w)),
    doors: q.doors.map(([dx, dz]) => turnPt(dx, dz)),
    rooms: q.rooms.map(([room, ...rc]) => {
      const [x0, z0, x1, z1] = turnRect(...rc);
      return { room, x0, z0, x1, z1 };
    }),
    items: q.items.map(([kind, ox, oz, orot]) => {
      const f = footprint(kind, orot);
      const [x0, z0] = turnRect(ox, oz, ox + f.w - 1, oz + f.d - 1);
      return { kind, x: x0, z: z0, rot: (orot + r) % 4 };
    }),
  };
}

/** What a quick room costs on open ground (sharing walls makes it a little cheaper). */
export function quickCost(id: QuickId) {
  const q = QUICK_ROOMS[id];
  let n = q.items.reduce((s, [k]) => s + OBJECTS[k].cost, 0);
  if (q.outdoor) return n + (q.floor ? q.w * q.d * FLOORS[q.floor].cost : 0);
  n += q.w * q.d * FLOORS[q.floor ?? "lino"].cost + (2 * (q.w + q.d) - 4) * WALL_COST + q.doors.length * DOOR_COST;
  for (const [x0, z0, x1, z1] of q.walls ?? []) n += (x1 - x0 + 1) * (z1 - z0 + 1) * WALL_COST;
  return n;
}
