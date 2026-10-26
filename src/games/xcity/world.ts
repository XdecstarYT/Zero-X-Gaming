import { DEFAULT_RULES, MAP_HALF, START_CLOUT, START_MONEY, type Crop, type Rules, type Use } from "./data";
import { placeBuilding, zoning } from "./design";
import { bbox, obbCorners, pointInPoly, rng, smooth, type Pts } from "./geom";
import { addRoad, lotRow, refreshConn } from "./roads";
import { emptyBudget, emptyStats, type District, type Lot, type State } from "./state";

/**
 * Districts (painted areas with a use, a height band and rules, later ones on top) and the city
 * you start with: a farming village at a crossroads by the river, fields all round.
 */

export function addDistrict(s: State, poly: Pts, use: Use, band: number, opts: { name?: string; rules?: Rules; crop?: Crop } = {}): District {
  const d: District = {
    id: s.districts.length,
    name: opts.name ?? districtName(s, use),
    poly: poly.slice(),
    use,
    band,
    rules: { ...(opts.rules ?? DEFAULT_RULES) },
    crop: opts.crop,
    created: s.month,
  };
  s.districts.push(d);
  assignDistricts(s);
  s.zrev++;
  s.rev++;
  return d;
}

const NAMES: Record<Use, string[]> = {
  homes: ["Maple Heights", "Linden Park", "Ashgrove", "Westfield", "Brookside", "Fairhaven", "Elm Hollow", "Larkfield", "Rosedale", "Kingsmead", "Hazelwood", "Southbank"],
  mixed: ["Main Street", "High Street", "Market Row", "Station Quarter", "Old Town", "Midtown"],
  shops: ["Market Square", "Shopping Row", "The Arcade", "Bazaar Lane"],
  jobs: ["Midtown", "The Exchange", "Commerce Park", "Downtown", "Central"],
  industry: ["Millworks", "Rail Yards", "Foundry Row", "Depot Flats"],
  farms: ["Home Farm", "North Fields", "Orchard Vale", "Long Acre", "Brook Farm"],
  parks: ["Riverside Park", "The Commons", "Green Hill", "Meadow Park"],
};

export function districtName(s: State, use: Use) {
  const list = NAMES[use];
  const used = new Set(s.districts.filter(Boolean).map((d) => d!.name));
  const free = list.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor((s.districts.length * 7) % free.length)];
  return `${list[s.districts.length % list.length]} ${s.districts.length}`;
}

/** Each lot takes the topmost district its centre is in. */
export function assignDistricts(s: State, lots?: Lot[]) {
  const ds = s.districts.filter(Boolean).map((d) => ({ d: d!, b: bbox(d!.poly) }));
  for (const l of lots ?? s.lots) {
    if (!l) continue;
    l.district = -1;
    for (let i = ds.length - 1; i >= 0; i--) {
      const { d, b } = ds[i];
      if (l.x < b.x0 || l.x > b.x1 || l.z < b.z0 || l.z > b.z1) continue;
      if (pointInPoly(l.x, l.z, d.poly)) {
        l.district = d.id;
        break;
      }
    }
  }
}

/** The district at a point (topmost), or null. */
export function districtAt(s: State, x: number, z: number) {
  for (let i = s.districts.length - 1; i >= 0; i--) {
    const d = s.districts[i];
    if (d && pointInPoly(x, z, d.poly)) return d;
  }
  return null;
}

export const rect = (x0: number, z0: number, x1: number, z1: number): Pts => [x0, z0, x1, z0, x1, z1, x0, z1];

/* ------------------------------------------------------------------ a new city */

export function blankState(seed: number): State {
  const R = rng(seed);
  const river = smooth([-1700, -760, -1150, -650 - R() * 60, -620, -735, -120, -560 - R() * 50, 380, -650, 900, -520 - R() * 60, 1700, -610], 12);
  return {
    v: 1,
    seed,
    rseed: (seed * 2654435761) >>> 0,
    name: "XCity",
    month: 0,
    t: 0,
    money: START_MONEY,
    clout: START_CLOUT,
    taxRate: 0.8,
    nodes: [],
    edges: [],
    lots: [],
    buildings: [],
    districts: [],
    apps: [],
    nextApp: 1,
    river,
    riverHalf: 42,
    households: 0,
    rentIndex: 1,
    regionPull: 160,
    approval: 62,
    mood: 0,
    modes: { car: 0.9, bike: 0.03, transit: 0, walk: 0.07 },
    congestion: 0,
    history: [],
    news: [],
    milestone: 0,
    stats: emptyStats(),
    budget: emptyBudget(),
    homesBuilt: 0,
    usedNames: {},
    rev: 1,
    zrev: 1,
    over: false,
  };
}

/** The farming village you're hired to plan. */
export function newCity(seed = 1): State {
  const s = blankState(seed);
  const R = rng(seed + 17);
  const H = MAP_HALF;
  const road = (pts: Pts, kind: "lane" | "street" | "avenue", name: string) => addRoad(s, pts, kind, name);
  // The regional roads and the section lanes.
  road([-H, 200, H, 200], "street", "Valley Road");
  road([0, H, 0, -H], "street", "Mill Road");
  road([-800, H, -800, -440], "lane", "Westbrook Lane");
  road([800, H, 800, -420], "lane", "Eastbrook Lane");
  road([-H, 1000, H, 1000], "lane", "Long Acre Road");
  road([-H, -1150, H, -1150], "lane", "Ridge Road");
  road([-1200, -1150, -1200, -H], "lane", "Quarry Lane");
  road([1100, -1150, 1100, -H], "lane", "Pike Lane");
  // The village: two streets either side of Valley Road and four cross streets.
  road([-300, 60, 300, 60], "street", "Church Street");
  road([-300, 340, 300, 340], "street", "School Street");
  for (const [x, n] of [[-300, "Elm Street"], [-150, "Oak Street"], [150, "Cedar Street"], [300, "Ash Street"]] as const) road([x, 60, x, 340], "street", n);
  refreshConn(s);
  // Fields everywhere, then the village on top.
  addDistrict(s, rect(-H, -470, H, H), "farms", 0, { name: "Valley Farms", crop: "wheat" });
  addDistrict(s, rect(-H, -H, H, -790), "farms", 0, { name: "Ridge Farms", crop: "pasture" });
  addDistrict(s, rect(820, 220, H, 980), "farms", 0, { name: "Eastbrook Farm", crop: "corn" });
  addDistrict(s, rect(-H, 220, -820, 980), "farms", 0, { name: "Westbrook Farm", crop: "corn" });
  addDistrict(s, rect(380, 420, 780, 980), "farms", 0, { name: "Orchard Vale", crop: "orchard" });
  addDistrict(s, rect(-780, -440, -380, 180), "farms", 0, { name: "Brook Orchard", crop: "orchard" });
  addDistrict(s, rect(-1400, -1130, -300, -800), "farms", 0, { name: "North Pasture", crop: "pasture" });
  addDistrict(s, rect(-340, 20, 340, 380), "homes", 1, { name: "Old Town" });
  addDistrict(s, rect(-340, 150, 340, 250), "mixed", 2, { name: "Main Street", rules: { ...DEFAULT_RULES, parking: 0 } });
  addDistrict(s, rect(-120, -540, 120, -420), "parks", 0, { name: "Riverside Park" });
  // Fill the village: a school, houses, shops on Valley Road; farmsteads along the lanes.
  const done = { done: true };
  // The school, on a double lot on School Street.
  const school = s.lots.find((l) => l && l.bld < 0 && s.edges[l.edge]?.name === "School Street" && Math.abs(l.x) < 120 && lotRow(s, l.id, 2).length === 2 && lotRow(s, l.id, 2).every((i) => s.lots[i]!.bld < 0));
  if (school) placeBuilding(s, { use: "civic", civic: "school", storeys: 2, style: "brick", roof: "plain", bay: false, color: "", parking: 0, affordable: 0, name: "Valley School", lots: lotRow(s, school.id, 2) }, done);
  for (const l of s.lots) {
    if (!l || l.bld >= 0) continue;
    const z = zoning(s, l);
    if (z.district?.name === "Main Street") {
      if (Math.abs(l.x) < 260 && R() < 0.8) {
        const st = R() < 0.5 ? 2 : 1;
        const use = st === 2 ? "mixed" : "shops";
        placeBuilding(s, { use, storeys: st, style: R() < 0.6 ? "brick" : "painted", roof: "plain", bay: false, color: "", parking: 0, affordable: 0, name: "", lots: [l.id] }, done);
      }
    } else if (z.district?.name === "Old Town") {
      if (R() < 0.72) placeBuilding(s, { use: "homes", storeys: R() < 0.7 ? 1 : 2, style: R() < 0.6 ? "timber" : "brick", roof: "plain", bay: R() < 0.3, color: "", parking: 1, affordable: 0, name: "", lots: [l.id] }, done);
    } else if (z.use === "farms" && R() < 0.025) {
      placeBuilding(s, { use: "farm", storeys: 2, style: R() < 0.7 ? "timber" : "brick", roof: "plain", bay: false, color: "", parking: 0, affordable: 0, name: "", lots: [l.id] }, done);
    }
  }
  return s;
}

/** A district rectangle from two corners and an angle (radians). */
export function districtRect(x0: number, z0: number, x1: number, z1: number, angle = 0) {
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // Project the drag onto the rotated axes.
  const dx = x1 - x0;
  const dz = z1 - z0;
  const hw = Math.abs(dx * ux + dz * uz) / 2;
  const hd = Math.abs(-dx * uz + dz * ux) / 2;
  const o = { x: cx, z: cz, ux, uz, hw, hd };
  return { obb: o, poly: obbCorners(o) };
}
