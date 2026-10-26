import { BANDS, CIVICS, DEVELOPERS, LOT_W, MILESTONES, MONTHS, ROADS, STYLES, TRAM_UPKEEP, type Roof, type Use } from "./data";
import { defaultStyle, formFor, placeBuilding, planStats, valueOf, zoning, type PlanStats } from "./design";
import { clamp, distToPoly, Hash } from "./geom";
import { householdSize, lotRow, refreshConn, riverDist } from "./roads";
import { emptyBudget, emptyStats, news, rand, type Application, type BUse, type Building, type Lot, type Plan, type State } from "./state";
import { assignDistricts } from "./world";

/**
 * The city month by month: who wants to live and work here, what rents do, what developers build
 * (and what they ask permission for), how people get about, what they think of you, and the books.
 */

/** Things other modules hang off the month (politics, so the city never has to import it). */
export const hooks: { month?: (s: State) => void } = {};

const lawOn = (s: State, k: string) => !!(s.pol?.federal.laws as Record<string, boolean> | undefined)?.[k];

/* ------------------------------------------------------------------ stats */

const farmCache = new WeakMap<State, { zrev: number; ha: number }>();

/** Hectares of farmland (the topmost district at each point is farms). */
export function farmHectares(s: State) {
  const c = farmCache.get(s);
  if (c && c.zrev === s.zrev) return c.ha;
  let n = 0;
  const step = 50;
  const ds = s.districts.filter(Boolean);
  for (let x = -1575; x < 1600; x += step)
    for (let z = -1575; z < 1600; z += step) {
      for (let i = ds.length - 1; i >= 0; i--) {
        const d = ds[i]!;
        if (pointIn(d.poly, x, z)) {
          if (d.use === "farms") n++;
          break;
        }
      }
    }
  const ha = (n * step * step) / 10000;
  farmCache.set(s, { zrev: s.zrev, ha });
  return ha;
}

function pointIn(poly: number[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    if (poly[i + 1] > z !== poly[j + 1] > z && x < ((poly[j] - poly[i]) * (z - poly[i + 1])) / (poly[j + 1] - poly[i + 1]) + poly[i]) inside = !inside;
  }
  return inside;
}

/** Households the region would like to see living here. */
export function wantedHouseholds(s: State) {
  return s.regionPull + s.stats.jobs * 0.62;
}

export function computeStats(s: State) {
  const st = emptyStats();
  let people = 0;
  for (const b of s.buildings) {
    if (!b) continue;
    if (!b.done) {
      st.building++;
      continue;
    }
    st.homes += b.homes;
    people += b.homes * householdSize(b);
    if (b.use === "shops" || b.use === "mixed") st.shopJobs += b.jobs;
    else if (b.use === "jobs") st.officeJobs += b.jobs;
    else if (b.use === "industry") st.industryJobs += b.jobs;
    else if (b.use === "civic") st.civicJobs += b.jobs;
    else if (b.use === "farm") st.farmJobs += b.jobs;
    st.value += valueOf(s, b);
  }
  st.farmJobs += Math.round(farmHectares(s) / 9);
  st.jobs = st.shopJobs + st.officeJobs + st.industryJobs + st.civicJobs + st.farmJobs;
  s.households = Math.min(s.households, st.homes);
  st.households = s.households;
  st.pop = Math.round(st.homes ? (s.households * people) / st.homes : 0);
  s.stats = st;
  st.homeDemand = Math.round(wantedHouseholds(s) - st.homes);
  st.jobDemand = Math.round(st.pop * 0.52 - st.jobs);
  st.shopDemand = Math.round(st.pop * 0.065 - st.shopJobs);
  return st;
}

/* ------------------------------------------------------------------ places */

export interface Places {
  stops: { x: number; z: number }[];
  bike: Hash;
  civic: { x: number; z: number; r: number; kind: string }[];
  centre: { x: number; z: number };
}

/** Tram stops (at junctions on tram lines, no two within 250 m). */
export function tramStops(s: State) {
  const out: { x: number; z: number }[] = [];
  for (const n of s.nodes) {
    if (!n || !n.edges.some((e) => s.edges[e]?.tram)) continue;
    if (out.some((p) => Math.hypot(p.x - n.x, p.z - n.z) < 250)) continue;
    out.push({ x: n.x, z: n.z });
  }
  // Long stretches get stops part way along too.
  for (const e of s.edges) {
    if (!e?.tram || e.len < 500) continue;
    const k = Math.floor(e.len / 400);
    for (let i = 1; i <= k; i++) {
      const p = pointOn(e.pts, (i * e.len) / (k + 1));
      if (!out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 250)) out.push(p);
    }
  }
  return out;
}

function pointOn(pts: number[], d: number) {
  let acc = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const l = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (acc + l >= d) {
      const t = l ? (d - acc) / l : 0;
      return { x: pts[i - 2] + (pts[i] - pts[i - 2]) * t, z: pts[i - 1] + (pts[i + 1] - pts[i - 1]) * t };
    }
    acc += l;
  }
  return { x: pts[pts.length - 2], z: pts[pts.length - 1] };
}

export function places(s: State): Places {
  const bike = new Hash(150);
  for (const e of s.edges) if (e?.bike) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < e.pts.length; k += 2) {
      x0 = Math.min(x0, e.pts[k]);
      x1 = Math.max(x1, e.pts[k]);
      z0 = Math.min(z0, e.pts[k + 1]);
      z1 = Math.max(z1, e.pts[k + 1]);
    }
    bike.add(e.id, x0, z0, x1, z1);
  }
  const civic: Places["civic"] = [];
  let cx = 0;
  let cz = 0;
  let w = 0;
  for (const b of s.buildings) {
    if (!b?.done) continue;
    if (b.use === "civic") civic.push({ x: b.x, z: b.z, r: CIVICS[b.civic ?? "park"].radius, kind: b.civic ?? "park" });
    if (b.use !== "farm" && b.jobs) {
      cx += b.x * b.jobs;
      cz += b.z * b.jobs;
      w += b.jobs;
    }
  }
  // Parkland districts count as parks.
  for (const d of s.districts) if (d?.use === "parks") {
    let x = 0, z = 0;
    for (let i = 0; i < d.poly.length; i += 2) {
      x += d.poly[i];
      z += d.poly[i + 1];
    }
    civic.push({ x: (x * 2) / d.poly.length, z: (z * 2) / d.poly.length, r: 550, kind: "park" });
  }
  return { stops: tramStops(s), bike, civic, centre: w ? { x: cx / w, z: cz / w } : { x: 0, z: 200 } };
}

export function nearBike(s: State, P: Places, x: number, z: number, r = 300) {
  for (const id of P.bike.query(x - r, z - r, x + r, z + r)) {
    const e = s.edges[id];
    if (e && distToPoly(e.pts, x, z) < r) return true;
  }
  return false;
}

export const nearStop = (P: Places, x: number, z: number, r = 450) => P.stops.some((p) => Math.hypot(p.x - x, p.z - z) < r);

/** How good a spot each lot is: central, near a tram, near parks and civic places, by the river. */
export function locate(s: State, P = places(s)) {
  for (const l of s.lots) {
    if (!l) continue;
    const d = Math.hypot(l.x - P.centre.x, l.z - P.centre.z);
    let loc = clamp(1.3 - d / 2600, 0.72, 1.3);
    if (nearStop(P, l.x, l.z)) loc += 0.16;
    const kinds = new Set<string>();
    for (const c of P.civic) if (!kinds.has(c.kind) && Math.hypot(c.x - l.x, c.z - l.z) < c.r) kinds.add(c.kind);
    loc += kinds.size * 0.04 + (kinds.has("park") ? 0.03 : 0);
    if (riverDist(s, l.x, l.z, s.riverHalf + 141) < s.riverHalf + 140) loc += 0.08;
    const e = s.edges[l.edge];
    if (e?.kind === "avenue" && !e.tram) loc -= 0.03;
    if (e?.kind === "lane") loc -= 0.08;
    l.loc = clamp(loc, 0.6, 1.8);
  }
}

/* ------------------------------------------------------------------ getting about */

export function transport(s: State, P: Places) {
  let car = 0;
  let bike = 0;
  let transit = 0;
  let walk = 0;
  let hh = 0;
  for (const b of s.buildings) {
    if (!b?.done || !b.homes) continue;
    const share = s.stats.homes ? (b.homes * s.households) / s.stats.homes : 0;
    let m = { car: 0.82, bike: 0.03, transit: 0, walk: 0.05 + (b.storeys >= 4 ? 0.06 : 0) + (b.use === "mixed" ? 0.06 : 0) };
    if (nearStop(P, b.x, b.z)) m.transit = 0.3 + (b.storeys >= 6 ? 0.08 : 0);
    if (nearBike(s, P, b.x, b.z)) m.bike = 0.15;
    if (b.parking === 2) m.car += 0.12;
    if (b.parking === 0) m.car -= 0.12;
    const t = m.car + m.bike + m.transit + m.walk;
    m = { car: m.car / t, bike: m.bike / t, transit: m.transit / t, walk: m.walk / t };
    car += m.car * share;
    bike += m.bike * share;
    transit += m.transit * share;
    walk += m.walk * share;
    hh += share;
  }
  if (hh > 0) s.modes = { car: car / hh, bike: bike / hh, transit: transit / hh, walk: walk / hh };
  // Peak car trips against road capacity.
  let cap = 0;
  for (const e of s.edges) if (e) cap += (e.len / 1000) * ROADS[e.kind].lanes * 2 * (e.kind === "lane" ? 260 : 520);
  const trips = s.households * 1.15 * s.modes.car * 0.4;
  s.congestion = clamp(trips / Math.max(1, cap) - 0.55, 0, 1.6);
}

/* ------------------------------------------------------------------ developers */

const ROOF_ODDS: Roof[] = ["plain", "plain", "plain", "plain", "plain", "plain", "green", "terrace", "solar", "solar"];

/** The best thing a developer could build on a lot, within `max` storeys (or null). */
export function bestPlan(s: State, lot: Lot, max: number): { plan: Plan; st: PlanStats } | null {
  const z = zoning(s, lot);
  if (!z.use || z.use === "farms" || z.use === "parks" || !z.rules) return null;
  const rules = z.rules;
  let use: BUse = z.use as Exclude<Use, "farms" | "parks">;
  const e = s.edges[lot.edge]!;
  const corner = lot.s < LOT_W * 1.6 || lot.s > e.len - LOT_W * 1.6;
  if (use === "homes" && rules.corner && corner && s.stats.shopDemand > 15 && rand(s) < 0.35) use = "shops";
  const lo = z.min;
  const hi = Math.max(lo, max);
  const n = rules.merge && hi >= 4 && use !== "shops" ? 1 + Math.floor(rand(s) * 4) : 1;
  const row = lotRow(s, lot.id, n).filter((id) => {
    const l = s.lots[id]!;
    if (l.district !== lot.district) return false;
    const b = l.bld >= 0 ? s.buildings[l.bld] : null;
    return !b || (b.done && !b.city && b.use !== "civic" && s.month - b.started > 36);
  });
  const lots = row[0] === lot.id ? row : [lot.id];
  const r = rand(s);
  const tries = new Set([hi, Math.round((lo + hi) / 2), lo, Math.round(lo + (hi - lo) * 0.75)]);
  let best: { plan: Plan; st: PlanStats; profit: number } | null = null;
  for (const storeys of tries) {
    if (storeys < 1) continue;
    const useHere: BUse = use === "mixed" && storeys < 2 ? "shops" : use;
    const form = formFor(useHere, storeys, lots.length);
    let style = defaultStyle(form, useHere, r);
    if (STYLES[style].max < storeys) style = storeys > 20 ? (r < 0.5 ? "glass" : "concrete") : "brick";
    const plan: Plan = {
      use: useHere,
      storeys,
      style,
      roof: form === "house" || form === "townhouse" ? "plain" : ROOF_ODDS[Math.floor(rand(s) * ROOF_ODDS.length)],
      bay: style === "brick" && rand(s) < 0.35,
      color: "",
      parking: lawOn(s, "parkingReform") ? 0 : rules.parking,
      affordable: useHere === "homes" || useHere === "mixed" ? rules.affordable : 0,
      name: "",
      lots,
    };
    const st = planStats(s, plan);
    const profit = st.value - st.cost - st.land;
    if (!best || profit > best.profit) best = { plan, st, profit };
  }
  return best ? { plan: best.plan, st: best.st } : null;
}

function underConstruction(s: State) {
  let homes = 0;
  let jobs = 0;
  let shops = 0;
  for (const b of s.buildings) {
    if (!b || b.done) continue;
    homes += b.homes;
    if (b.use === "shops" || b.use === "mixed") shops += b.jobs;
    else jobs += b.jobs;
  }
  return { homes, jobs, shops };
}

/** Lots a developer might look at: zoned for something, on a connected road. */
function devLots(s: State) {
  const out: Lot[] = [];
  for (const l of s.lots) {
    if (!l || l.district < 0) continue;
    const d = s.districts[l.district];
    if (!d || d.use === "farms" || d.use === "parks") continue;
    if (!s.edges[l.edge]?.conn) continue;
    out.push(l);
  }
  return out;
}

export function startBuilding(s: State, plan: Plan, st: PlanStats, city = false): Building {
  for (const lid of plan.lots) {
    const l = s.lots[lid]!;
    if (l.bld >= 0) demolishFor(s, l.bld);
  }
  if (!city) s.money += Math.round(st.cost * 0.012);
  s.budget.fees += city ? 0 : Math.round(st.cost * 0.012);
  return placeBuilding(s, plan, { city });
}

function demolishFor(s: State, id: number) {
  const b = s.buildings[id];
  if (!b) return;
  for (const lid of b.lots) {
    const l = s.lots[lid];
    if (l && l.bld === id) l.bld = -1;
  }
  s.buildings[id] = null;
  s.rev++;
}

function developers(s: State) {
  const st = s.stats;
  const uc = underConstruction(s);
  let homesRoom = Math.max(0, st.homeDemand * 0.85 - uc.homes);
  let jobsRoom = Math.max(0, st.jobDemand * 0.85 - uc.jobs);
  let shopsRoom = Math.max(0, st.shopDemand * 0.9 - uc.shops);
  const lots = devLots(s);
  if (!lots.length) return;
  const tries = clamp(Math.round(8 + lots.length / 25), 8, 220);
  let started = 0;
  for (let k = 0; k < tries; k++) {
    const lot = lots[Math.floor(rand(s) * lots.length)];
    const b = lot.bld >= 0 ? s.buildings[lot.bld] : null;
    if (b && (!b.done || b.city || b.use === "civic" || b.use === "farm" || s.month - b.started < 36)) continue;
    const z = zoning(s, lot);
    if (b && b.storeys >= z.max && b.lots.length >= 2) continue;
    const want = z.use === "homes" || z.use === "mixed" ? homesRoom : z.use === "shops" ? shopsRoom : jobsRoom;
    if (want <= 0) continue;
    const best = bestPlan(s, lot, z.max);
    if (!best) continue;
    const { plan, st: ps } = best;
    // Not worth knocking something down for a little more.
    if (b && ps.homes + ps.jobs < (b.homes + b.jobs) * 1.6) continue;
    const add = plan.use === "homes" || plan.use === "mixed" ? ps.homes - ps.loss.homes : ps.jobs - ps.loss.jobs;
    if (add > want + 8) continue;
    // A bolder plan, over the zoning, goes to the agenda instead.
    if (s.apps.length < 3 && s.rentIndex > 1.15 && z.max >= 2 && rand(s) < 0.12 + (s.rentIndex - 1.15) * 0.3) {
      const bigger = bestPlan(s, lot, overAsk(z.max));
      if (bigger && bigger.plan.storeys > z.max && bigger.st.margin > Math.max(0.12, ps.margin + 0.04) && bigger.st.homes + bigger.st.jobs > (ps.homes + ps.jobs) * 1.3) {
        submit(s, bigger.plan, bigger.st, z.max);
        continue;
      }
    }
    if (ps.margin < (b ? 0.18 : 0.1)) continue;
    plan.name = "";
    startBuilding(s, plan, ps);
    if (plan.use === "homes" || plan.use === "mixed") homesRoom -= add;
    else if (plan.use === "shops") shopsRoom -= add;
    else jobsRoom -= add;
    started++;
    if (ps.homes >= 60 || ps.jobs >= 200) news(s, `Work starts on ${s.buildings[s.buildings.length - 1]!.name}: ${ps.homes ? `${ps.homes} homes` : `${ps.jobs} jobs`}, ${plan.storeys} storeys.`);
    if (started > 40) break;
  }
}

/** How high a developer dares ask above the zoning. */
function overAsk(max: number) {
  const b = BANDS.find((x) => x.max >= max + 1 && x.min > max - 1) ?? BANDS[BANDS.length - 1];
  return Math.max(max + 2, Math.min(b.max, max * 2 + 2));
}

/* ------------------------------------------------------------------ applications */

export function submit(s: State, plan: Plan, st: PlanStats, zoned: number) {
  const lot = s.lots[plan.lots[0]]!;
  const dev = DEVELOPERS[Math.floor(rand(s) * DEVELOPERS.length)];
  plan.name = plan.name || placeholderName(s, st.form);
  const covered = nearStop(places(s), lot.x, lot.z);
  const reasons: string[] = [];
  let no = 0;
  if (plan.storeys > zoned * 2 + 1) {
    no += 2;
    reasons.push(`${plan.storeys} storeys where ${zoned} are allowed`);
  } else if (plan.storeys > zoned) reasons.push(`${plan.storeys - zoned} storeys over the zoning`);
  if (st.loss.homes > 0) {
    no += st.loss.homes >= 8 ? 1.5 : 0.5;
    reasons.push(`removes ${st.loss.homes} existing home${st.loss.homes === 1 ? "" : "s"}`);
  }
  if (plan.parking === 2 && covered) {
    no += 0.5;
    reasons.push("full parking next to a tram");
  }
  if (s.stats.homeDemand > st.homes) {
    no -= 1.5;
    reasons.push("homes are badly needed");
  }
  if (plan.affordable > 0) no -= 0.5;
  const app: Application = {
    id: s.nextApp++,
    dev,
    plan,
    submitted: s.month,
    homes: st.homes,
    jobs: st.jobs,
    homesLost: st.loss.homes,
    jobsLost: st.loss.jobs,
    tax: st.tax,
    lean: no >= 1 ? "no" : "yes",
    reason: reasons.length ? reasons.join(", ") : "fits the area",
    zoned,
    changed: false,
    margin: st.margin,
  };
  s.apps.push(app);
  news(s, `New application: ${plan.name}, ${st.homes ? `${st.homes} homes` : `${st.jobs} jobs`}.`, "tip");
  return app;
}

function placeholderName(s: State, form: string) {
  const first = ["Hazel", "Summit", "Juniper", "Wren", "Marlow", "Rowan", "Kestrel", "Linden", "Briar", "Fairview"];
  const last = form === "tower" || form === "highrise" ? ["Heights", "Tower", "Point"] : form === "office" ? ["Exchange", "House", "Centre"] : ["Apartments", "Court", "Lofts"];
  return `${first[Math.floor(rand(s) * first.length)]} ${last[Math.floor(rand(s) * last.length)]}`;
}

/** Is the land still there for an application (nothing else built on it meanwhile)? */
function appValid(s: State, a: Application) {
  return a.plan.lots.every((id) => {
    const l = s.lots[id];
    if (!l) return false;
    const b = l.bld >= 0 ? s.buildings[l.bld] : null;
    return !b || (b.done && b.use !== "civic");
  });
}

/* ------------------------------------------------------------------ the month */

function approvalTarget(s: State, P: Places) {
  const st = s.stats;
  let a = 66;
  a -= Math.max(0, s.rentIndex - 1) * 26;
  a += Math.max(0, 1 - s.rentIndex) * 8;
  a -= s.congestion * 14;
  // Services: share of homes near a park and near a school.
  let park = 0;
  let school = 0;
  let homes = 0;
  for (const b of s.buildings) {
    if (!b?.done || !b.homes) continue;
    homes += b.homes;
    if (P.civic.some((c) => c.kind === "park" && Math.hypot(c.x - b.x, c.z - b.z) < c.r)) park += b.homes;
    if (P.civic.some((c) => c.kind === "school" && Math.hypot(c.x - b.x, c.z - b.z) < c.r)) school += b.homes;
  }
  if (homes) a += (park / homes) * 7 + (school / homes) * 7 - 4;
  const workers = st.pop * 0.52;
  if (workers > st.jobs * 1.15 && st.pop > 500) a -= Math.min(10, ((workers - st.jobs * 1.15) / workers) * 24);
  a -= Math.min(6, st.building / 12);
  a -= (s.taxRate - 0.8) * 14;
  a += s.mood;
  return clamp(a, 4, 97);
}

export function monthTick(s: State) {
  s.month++;
  s.budget = emptyBudget();
  refreshConn(s);
  assignDistricts(s);
  computeStats(s);
  const P = places(s);
  if (s.month % 3 === 0) locate(s, P);
  // Who moves in (or out).
  const target = Math.min(wantedHouseholds(s), s.stats.homes);
  const gap = target - s.households;
  s.households = Math.max(0, s.households + (gap > 0 ? Math.ceil(gap * 0.35 + 2) : Math.floor(gap * 0.2)));
  s.households = Math.min(s.households, s.stats.homes);
  // Rents follow the gap between the homes wanted and the homes there are.
  const want = wantedHouseholds(s);
  const rt = clamp(1 + (1.5 * (want - s.stats.homes)) / Math.max(80, s.stats.homes), 0.65, 3.4);
  const before = s.rentIndex;
  s.rentIndex += (rt - s.rentIndex) * 0.12;
  // The region keeps growing; more so if people like it here.
  const attract = clamp(0.4 + s.approval / 100 + s.modes.transit * 1.5 + (s.rentIndex < 1.3 ? 0.2 : 0), 0.3, 2);
  s.regionPull += (8 + s.regionPull * 0.014 * attract) * (s.pace ?? 1) * (lawOn(s, "firstHome") ? 1.15 : 1);
  transport(s, P);
  // Construction.
  let completed = 0;
  for (const b of s.buildings) {
    if (!b || b.done) continue;
    b.progress = Math.min(1, b.progress + 1 / b.months);
    if (b.progress >= 1) {
      b.done = true;
      completed += b.homes;
      s.homesBuilt += b.homes;
      s.rev++;
      if (b.homes >= 80 || b.storeys >= 15) news(s, `${b.name} opens: ${b.homes ? `${b.homes} homes` : `${b.jobs} jobs`}.`, "good");
    }
  }
  computeStats(s);
  developers(s);
  // Applications left too long are withdrawn.
  for (const a of [...s.apps]) {
    if (!appValid(s, a) || s.month - a.submitted > 3) {
      s.apps = s.apps.filter((x) => x !== a);
      news(s, `${a.dev} withdrew ${a.plan.name}.`);
      s.mood -= s.rentIndex > 1.3 ? 1 : 0;
    }
  }
  // Approval and clout.
  s.mood *= 0.85;
  s.approval += (approvalTarget(s, P) - s.approval) * 0.3;
  s.clout = Math.min(99, s.clout + (s.approval >= 45 ? 1 : 0) + (s.approval >= 65 ? 1 : 0) + Math.floor(completed / 80));
  // The books.
  const B = s.budget;
  B.tax = Math.round((s.stats.value * s.taxRate) / 100 / 12);
  B.farms = Math.round(s.stats.farmJobs * 220 * (lawOn(s, "greenBelt") ? 1.6 : 1));
  B.grants = lawOn(s, "housingAccord") ? completed * 25_000 : 0;
  if (lawOn(s, "rateCap") && s.taxRate > 1) s.taxRate = 1;
  for (const e of s.edges) {
    if (!e) continue;
    B.roads += e.len * (ROADS[e.kind].upkeep + (e.bike ? 0.1 : 0));
    if (e.tram) B.transit += e.len * TRAM_UPKEEP;
  }
  B.transit -= s.households * s.modes.transit * 2 * 22 * 1.2;
  for (const b of s.buildings) if (b?.done && b.use === "civic") B.civic += CIVICS[b.civic ?? "park"].upkeep;
  B.services = Math.round(s.stats.pop * 32);
  B.roads = Math.round(B.roads);
  B.transit = Math.round(B.transit);
  s.money += B.tax + B.farms + B.grants - B.roads - B.transit - B.civic - B.services;
  computeStats(s);
  // Milestones.
  while (s.milestone + 1 < MILESTONES.length && s.stats.pop >= MILESTONES[s.milestone + 1].pop) {
    s.milestone++;
    const m = MILESTONES[s.milestone];
    news(s, `${s.name} is now a ${m.name.toLowerCase()}. ${m.blurb}`, "good");
  }
  if (s.rentIndex > 1.3 && before <= 1.3) news(s, "Rents are climbing. Upzone, or approve more homes.", "tip");
  if (s.money < 0 && s.month % 3 === 0) news(s, "The city is in the red. Raise taxes or cut costs.", "bad");
  s.history.push({ month: s.month, pop: s.stats.pop, rent: Math.round(1350 * s.rentIndex), homes: s.stats.homes, approval: Math.round(s.approval), money: Math.round(s.money) });
  if (s.history.length > 240) s.history.shift();
  hooks.month?.(s);
}

/** Run the clock forward by a fraction of a month (or several). */
export function advance(s: State, months: number) {
  s.t += months;
  while (s.t >= 1) {
    s.t -= 1;
    monthTick(s);
  }
}

/** Prepare a state for play: indexes, stats and location values. */
export function prepare(s: State) {
  refreshConn(s);
  assignDistricts(s);
  computeStats(s);
  if (!s.households) s.households = s.stats.homes;
  computeStats(s);
  const P = places(s);
  locate(s, P);
  transport(s, P);
  computeStats(s);
  return s;
}

export function score(s: State) {
  return Math.max(0, Math.round(s.stats.pop + s.homesBuilt * 2));
}

export function save(s: State) {
  return JSON.stringify(s);
}

export function load(json: string): State | null {
  try {
    const s = JSON.parse(json) as State;
    if (s?.v !== 1 || !Array.isArray(s.lots)) return null;
    return prepare(s);
  } catch {
    return null;
  }
}

export const monthName = (m: number) => MONTHS[m % 12];
