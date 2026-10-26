import { BANDS, BASE_RENT, BUILD_COST, BUILDING_FIRST, BUILDING_LAST, CIVICS, HOME_AREA, LOT_D, LOT_W, ROOFS, STYLES, USES, VALUE_YEARS, type CivicKind, type Rules, type Style, type Use } from "./data";
import { clamp } from "./geom";
import { addLoss, buildingLoss, lotFront, noLoss, type Loss } from "./roads";
import { pick, rand, type BUse, type Building, type District, type Form, type Lot, type Plan, type State } from "./state";

/**
 * Buildings: what a plan becomes (its form, footprint, homes and jobs), what it costs, what it's
 * worth, how good it is, and how it sits against the zoning. Developers, their applications and
 * the city's own designs all go through here.
 */

/** The zoning on a lot: the district's use, height band and rules (or none). */
export function zoning(s: State, lot: Lot): { district: District | null; use: Use | null; min: number; max: number; rules: Rules | null } {
  const d = lot.district >= 0 ? s.districts[lot.district] : null;
  if (!d) return { district: null, use: null, min: 0, max: 0, rules: null };
  const b = BANDS[d.band];
  return { district: d, use: d.use, min: b.min, max: d.use === "farms" || d.use === "parks" ? 0 : b.max, rules: d.rules };
}

export function formFor(use: BUse, storeys: number, lots: number): Form {
  if (use === "civic") return "civic";
  if (use === "farm") return "farmhouse";
  if (use === "shops") return storeys <= 3 ? "shop" : "office";
  if (use === "jobs") return storeys <= 2 && lots <= 2 ? "shop" : "office";
  if (use === "industry") return "workshop";
  if (storeys <= 2 && lots <= 1 && use === "homes") return "house";
  if (storeys <= 4) return use === "mixed" ? "walkup" : "townhouse";
  if (storeys <= 7) return "walkup";
  if (storeys <= 12) return "midrise";
  if (storeys <= 24) return "highrise";
  return "tower";
}

export interface Footprint {
  x: number;
  z: number;
  ux: number;
  uz: number;
  hw: number;
  hd: number;
  fx: number;
  fz: number;
}

/** Where on its lots a building stands: set back from the street by its form. */
export function footprint(s: State, lots: number[], form: Form): Footprint {
  const ls = lots.map((i) => s.lots[i]!);
  let x = 0;
  let z = 0;
  for (const l of ls) {
    x += l.x;
    z += l.z;
  }
  x /= ls.length;
  z /= ls.length;
  const l0 = ls[0];
  const f = lotFront(l0);
  const W = (LOT_W * ls.length) / 2;
  const D = LOT_D / 2;
  // [half width, half depth, front setback]
  const dims: Record<Form, [number, number, number]> = {
    house: [Math.min(W - 2.2, 5.6), 6.2, 7],
    farmhouse: [Math.min(W - 2.2, 6.2), 6.8, 7],
    townhouse: [W - 0.3, 6.5, 3.5],
    walkup: [W - 0.6, 9.5, 1.5],
    midrise: [W - 0.8, 10.5, 1.5],
    highrise: [W - 1, 11, 2],
    tower: [Math.min(W - 1.5, 15), Math.min(D - 2, 13), 2],
    shop: [W - 0.3, 8.5, 0.6],
    office: [W - 0.8, 11, 1],
    workshop: [W - 0.8, 11, 4],
    civic: [W - 1.5, 10, 3],
  };
  const [hw, hd, set] = dims[form];
  // Push the building toward the front of the lot by the setback.
  const back = D - set - hd;
  return { x: x - f.x * back, z: z - f.z * back, ux: l0.ux, uz: l0.uz, hw: Math.max(2, hw), hd: Math.max(2, hd), fx: f.x, fz: f.z };
}

export interface PlanStats {
  form: Form;
  homes: number;
  affordableHomes: number;
  jobs: number;
  people: number;
  floor: number;
  cost: number;
  value: number;
  land: number;
  /** What the city pays to have it built (negative: what it earns selling the plot). */
  net: number;
  /** Developer's profit margin on cost. */
  margin: number;
  months: number;
  quality: number;
  rent: number;
  tax: number;
  zoned: number;
  over: number;
  /** The clout an over-height design costs. */
  clout: number;
  loss: Loss;
  /** "Wanted", "Some demand" or "Not wanted". */
  demand: "wanted" | "some" | "none";
}

export function heightCost(storeys: number) {
  return 1 + Math.max(0, storeys - 4) * 0.018 + Math.max(0, storeys - 20) * 0.012;
}

/** Rent for one home of `size` m² on this lot at today's market, a month. Bigger homes cost less a metre. */
export function rentAt(s: State, lot: Lot, quality = 3, size = HOME_AREA) {
  return BASE_RENT * Math.pow(size / HOME_AREA, 0.85) * s.rentIndex * lot.loc * (1 + (quality - 3) * 0.05);
}

/** Rent for a square metre of shop, office or workshop floor, a year. */
export function floorRentAt(s: State, lot: Lot, use: BUse) {
  const st = s.stats;
  if (use === "industry") return 150 * (0.75 + 0.25 * lot.loc) * clamp(1 + st.jobDemand / Math.max(300, st.jobs + 100), 0.6, 1.6);
  if (use === "jobs") return 290 * lot.loc * (0.7 + 0.3 * s.rentIndex) * clamp(1 + st.jobDemand / Math.max(300, st.jobs + 100), 0.55, 1.7);
  return 250 * lot.loc * (0.7 + 0.3 * s.rentIndex) * clamp(1 + st.shopDemand / Math.max(60, st.shopJobs + 40), 0.55, 1.7);
}

/** Floor given to homes and to jobs, and the size of each home. */
export function floors(use: BUse, form: Form, area: number, storeys: number, homes: number) {
  const total = area * storeys;
  const jobFloor = use === "mixed" ? area : use === "shops" || use === "jobs" || use === "industry" ? total : 0;
  const homeFloor = homes ? (use === "mixed" ? area * (storeys - 1) : total) * (form === "house" || form === "farmhouse" ? 0.9 : 0.8) : 0;
  return { jobFloor, homeFloor, size: homes ? homeFloor / homes : HOME_AREA };
}

interface EconIn {
  use: BUse;
  form: Form;
  area: number;
  storeys: number;
  homes: number;
  quality: number;
  affordable: number;
  /** Rent premium from the roof and bay windows. */
  extra: number;
}

/** Monthly rent per home and the sale value, at today's market. */
export function econ(s: State, lot: Lot, e: EconIn) {
  const f = floors(e.use, e.form, e.area, e.storeys, e.homes);
  const rent = e.homes ? rentAt(s, lot, e.quality, f.size) * (1 + e.extra) : 0;
  const cheap = Math.round((e.homes * e.affordable) / 100);
  let value = (e.homes - cheap * 0.45) * rent * 12 * VALUE_YEARS;
  if (f.jobFloor && e.use !== "civic" && e.use !== "farm") value += f.jobFloor * 0.85 * floorRentAt(s, lot, e.use) * 11;
  if (e.use === "farm") value += 350_000;
  return { rent, value, size: f.size };
}

/** What a building is worth to sell today. */
export function valueOf(s: State, b: Building) {
  const lot = s.lots[b.lots[0]];
  if (!lot || !b.done || b.use === "civic") return 0;
  return econ(s, lot, { use: b.use, form: b.form, area: b.hw * b.hd * 4, storeys: b.storeys, homes: b.homes, quality: b.quality, affordable: b.affordable, extra: ROOFS[b.roof].rent + (b.bay ? 0.01 : 0) }).value;
}

export function qualityOf(plan: Pick<Plan, "style" | "roof" | "bay" | "parking">, form: Form) {
  let q = 2.4 + STYLES[plan.style].quality * 0.6 + ROOFS[plan.roof].quality + (plan.bay ? 0.4 : 0) + (plan.parking === 0 ? 0.15 : 0);
  if (form === "house") q += 0.3;
  return clamp(Math.round(q * 2) / 2, 1, 5);
}

/** Homes and jobs a plan holds. */
export function capacity(use: BUse, form: Form, area: number, storeys: number, lots: number, civic?: CivicKind) {
  let homes = 0;
  let jobs = 0;
  if (use === "civic") jobs = CIVICS[civic ?? "park"].jobs;
  else if (use === "farm") {
    homes = 1;
    jobs = 3;
  } else if (form === "house") homes = 1;
  else if (form === "townhouse" && use === "homes") homes = Math.max(1, Math.round(lots * 2 * (storeys >= 3 ? 1.5 : 1)));
  else if (use === "homes" || use === "mixed") {
    homes = Math.max(1, Math.floor((area * 0.8 * (use === "mixed" ? storeys - 1 : storeys)) / HOME_AREA));
    if (use === "mixed") jobs = Math.round(area / 55);
  } else if (use === "shops") jobs = Math.round((area * storeys) / 55);
  else if (use === "jobs") jobs = Math.round((area * storeys) / 24);
  else if (use === "industry") jobs = Math.round((area * storeys) / 80);
  return { homes, jobs };
}

/** Everything about a plan before it's built. */
export function planStats(s: State, plan: Plan): PlanStats {
  const lots = plan.lots.map((i) => s.lots[i]!).filter(Boolean);
  const n = lots.length;
  const lot = lots[0];
  const form = formFor(plan.use, plan.storeys, n);
  const fp = footprint(s, plan.lots, form);
  const area = fp.hw * 2 * fp.hd * 2;
  const st = plan.storeys;
  const floor = area * st;
  const cap = capacity(plan.use, form, area, st, n, plan.civic);
  const jobs = cap.jobs;
  let homes = cap.homes;
  // Parking: a surface spot or a garage space for each home (and every third job) it must have.
  const spaces = Math.ceil((homes + jobs / 3) * (plan.parking / 2));
  if (plan.parking === 2 && st > 2 && st <= 7) homes = Math.max(1, Math.floor(homes * 0.9));
  const affordableHomes = Math.round((homes * plan.affordable) / 100);
  const quality = qualityOf(plan, form);
  const style = STYLES[plan.style];
  const roof = ROOFS[plan.roof];
  let cost = floor * BUILD_COST * style.cost * heightCost(st) * (1 + roof.cost) * (plan.bay ? 1.015 : 1);
  if (form === "house" || form === "farmhouse") cost *= 0.85;
  if (plan.use === "industry") cost *= 0.55;
  cost += spaces * (st <= 3 ? 9_000 : 38_000);
  if (plan.use === "civic") cost = CIVICS[plan.civic ?? "park"].cost;
  // What's there now: bought out and knocked down.
  const loss = noLoss();
  let land = 0;
  const seen = new Set<number>();
  for (const l of lots) {
    land += 38_000 * l.loc * (0.7 + 0.3 * s.rentIndex);
    if (l.bld >= 0 && !seen.has(l.bld)) {
      seen.add(l.bld);
      const b = s.buildings[l.bld]!;
      addLoss(loss, buildingLoss(b));
      land += valueOf(s, b) * 1.05;
      cost += b.hw * b.hd * 4 * b.storeys * 120;
    }
  }
  const ec = lot ? econ(s, lot, { use: plan.use, form, area, storeys: st, homes, quality, affordable: plan.affordable, extra: roof.rent + (plan.bay ? 0.01 : 0) }) : { rent: 0, value: 0, size: 0 };
  const value = plan.use === "civic" ? 0 : ec.value;
  const z = lot ? zoning(s, lot) : null;
  const zoned = z?.max ?? 0;
  const over = plan.use === "civic" ? 0 : Math.max(0, st - zoned);
  const clout = (over > 0 ? 2 + Math.ceil(over / 3) : 0) + Math.floor(loss.homes / 20);
  const months = plan.use === "civic" ? 3 : Math.max(2, Math.round(2 + st * 0.55 + (form === "tower" ? 4 : 0)));
  const hh = form === "house" || form === "farmhouse" ? 2.7 : form === "townhouse" ? 2.4 : form === "walkup" ? 2.1 : 1.9;
  const want = (d: number, k: number) => (d > k * 0.5 ? "wanted" : d > 0 ? "some" : "none") as PlanStats["demand"];
  return {
    form,
    homes,
    affordableHomes,
    jobs,
    people: Math.round(homes * hh),
    floor,
    cost: Math.round(cost),
    value: Math.round(value),
    land: Math.round(land),
    net: Math.round(cost + land - value),
    margin: (value - cost - land) / Math.max(1, cost + land),
    months,
    quality,
    rent: Math.round(ec.rent),
    tax: Math.round((value * s.taxRate) / 100),
    zoned,
    over,
    clout,
    loss,
    demand: plan.use === "homes" || plan.use === "mixed" ? want(s.stats.homeDemand, homes) : plan.use === "shops" ? want(s.stats.shopDemand, jobs) : want(s.stats.jobDemand, jobs),
  };
}

export function buildingName(s: State, form: Form) {
  const last = BUILDING_LAST[form] ?? BUILDING_LAST.walkup;
  return `${pick(s, BUILDING_FIRST)} ${pick(s, last)}`;
}

export function defaultStyle(form: Form, use: BUse, r: number): Style {
  if (form === "house" || form === "farmhouse") return r < 0.55 ? "timber" : r < 0.85 ? "brick" : "painted";
  if (form === "townhouse") return r < 0.6 ? "brick" : r < 0.85 ? "painted" : "stone";
  if (form === "tower" || (form === "office" && use === "jobs")) return r < 0.45 ? "glass" : r < 0.75 ? "concrete" : "stone";
  if (form === "highrise") return r < 0.35 ? "brick" : r < 0.6 ? "concrete" : r < 0.8 ? "glass" : "stone";
  if (form === "workshop") return r < 0.6 ? "brick" : "concrete";
  return r < 0.5 ? "brick" : r < 0.75 ? "painted" : r < 0.9 ? "stone" : "concrete";
}

/** Turn a plan into a building on its lots (under construction unless `done`). */
export function placeBuilding(s: State, plan: Plan, opts: { done?: boolean; city?: boolean } = {}): Building {
  const st = planStats(s, plan);
  const fp = footprint(s, plan.lots, st.form);
  const b: Building = {
    ...plan,
    lots: plan.lots.slice(),
    id: s.buildings.length,
    form: st.form,
    homes: st.homes,
    jobs: st.jobs,
    ...fp,
    done: !!opts.done,
    progress: opts.done ? 1 : 0,
    months: st.months,
    started: s.month,
    quality: st.quality,
    city: !!opts.city,
    seed: Math.floor(rand(s) * 1e6),
  };
  if (!b.color) b.color = defaultColor(b.style, b.seed);
  if (!b.name) b.name = b.form === "farmhouse" ? "Farmstead" : b.use === "civic" ? CIVICS[b.civic ?? "park"].name : buildingName(s, b.form);
  s.buildings.push(b);
  for (const lid of plan.lots) s.lots[lid]!.bld = b.id;
  s.rev++;
  return b;
}

export function useLabel(u: BUse) {
  return u === "civic" ? "Civic" : u === "farm" ? "Farm" : USES[u].name;
}

export function defaultColor(style: Style, seed: number) {
  const p = STYLES[style].colors;
  return p[Math.abs(seed) % p.length];
}
