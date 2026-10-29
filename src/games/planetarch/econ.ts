/**
 * The economy, day by day, for every country with the same rules:
 *
 *   power plants burn fuel bought on the world market → electricity, and what's short is rationed
 *   → each sector makes as much as its orders call for, held back by workers (strikes, shortages),
 *     electricity and the goods it needs (diesel, steel, chips…) → the goods go to households,
 *     other sectors, the state and investment; what's left over is exported, what's missing imported
 *   → one world market per good clears supply and demand: prices move, and blockades, closed
 *     straits and sanctions cut a country's access
 *   → wages, profits, pensions and benefits become each social group's income; taxes come off;
 *     what people spend becomes tomorrow's demand; the budget, the debt, rates and inflation follow.
 *
 * Every limit is recorded with its cause, so a shortage of coal shows up as "Coal plants short of
 * fuel" in Energy, as "Electricity −12%" on the steel works and as lower tax in the Budget.
 */
import { EQUIP, GOODS, GOOD_INDEX, GROUP_INDEX, LOCAL_GOOD, PLANTS, SECTORS, SECTOR_GOODS, SECTOR_INDEX, SERVICES, SERVICE_IDS, STRAITS, TECHS, type GroupId, type SectorId, type TechField, type VatCat } from "./data";
import { RATINGS } from "./countries";
import type { Atlas } from "./atlas";
import type { Derived, Nation, Part, World } from "./state";
import { clamp, ease } from "./util";

const NG = GOODS.length;
const NS = SECTORS.length;
/** Labour's share of value added. */
export const LABOUR_SHARE = 0.55;
/** $bn of electricity per TWh at base prices ($100/MWh). */
export const ELEC_BN = 0.1;
const POWER = SECTOR_INDEX.power;
const ELEC_G = GOOD_INDEX.electricity;

/* ------------------------------------------------------------------ derived */

export interface Caches {
  partners: [number, number][][];
  plantsBy: number[][];
  coastal: number[];
  cities: number[][];
  /** Sum over sectors of electricity intensity × output (for scaling). */
  inputsOf: [number, number][][];
  /** Electricity price index by nation. */
  elecPrice: number[];
  /** Goods each sector buys, flattened: [good index, coefficient]. */
}

export function newDerived(w: World): Derived & { c: Caches } {
  const N = w.nations.length;
  const arr = () => Array.from({ length: N }, () => new Float64Array(NG));
  return {
    supply: arr(),
    demand: arr(),
    imports: arr(),
    exports: arr(),
    avail: Array.from({ length: N }, () => new Float64Array(NG).fill(1)),
    /** Availability smoothed over a few weeks: stocks and stockpiles buffer short dips. */
    slow: Array.from({ length: N }, () => new Float64Array(NG).fill(1)),
    elec: Array.from({ length: N }, () => ({ demand: 0, gen: 0, imported: 0, served: 1, price: 1, byType: {}, fuelShort: "" })),
    budget: Array.from({ length: N }, () => ({ rev: [], exp: [], revenue: 0, spending: 0, balance: 0 })),
    fill: new Float64Array(NG).fill(1),
    sell: new Float64Array(NG).fill(1),
    access: new Array(N).fill(1),
    accessX: new Array(N).fill(1),
    accessWhy: new Array(N).fill(""),
    trade: Array.from({ length: N }, () => ({ x: 0, m: 0 })),
    occupied: new Array(N).fill(0),
    c: { partners: [], plantsBy: [], coastal: [], cities: [], inputsOf: SECTORS.map((s) => s.inputs.map(([g, k]) => [GOOD_INDEX[g], k] as [number, number])), elecPrice: new Array(N).fill(1) },
  };
}
export type D = ReturnType<typeof newDerived>;

/** Rebuild the lookups that change rarely (plants, partners, who owns which city). */
export function refreshCaches(w: World, a: Atlas, d: D) {
  const N = w.nations.length;
  const c = d.c;
  c.cities = Array.from({ length: N }, () => []);
  w.owner.forEach((o, i) => {
    if (o >= 0 && o < N) c.cities[o].push(i);
  });
  c.plantsBy = Array.from({ length: N }, () => []);
  w.plants.forEach((p, i) => c.plantsBy[p.nation]?.push(i));
  c.coastal = c.cities.map((cs) => {
    if (!cs.length) return 0;
    let pop = 0;
    let coast = 0;
    for (const ci of cs) {
      pop += a.map.cities[ci].pop;
      if (a.map.cities[ci].coastal) coast += a.map.cities[ci].pop;
    }
    return pop ? clamp(0.25 + (coast / pop) * 0.75, 0, 1) : 0;
  });
  // Trade partners: bigger and nearer trade more.
  const cap = w.nations.map((n) => (n.capital >= 0 ? a.map.cities[n.capital] : null));
  c.partners = w.nations.map((n, i) => {
    const ci = cap[i];
    if (!ci || !n.alive) return [];
    const list: [number, number][] = [];
    w.nations.forEach((m, j) => {
      const cj = cap[j];
      if (j === i || !cj || !m.alive) return;
      const dx = Math.min(Math.abs(ci.x - cj.x), a.map.w - Math.abs(ci.x - cj.x));
      const dist = Math.hypot(dx, ci.y - cj.y) + 40;
      list.push([j, m.gdp / Math.pow(dist, 0.9)]);
    });
    list.sort((p, q) => q[1] - p[1]);
    const top = list.slice(0, 24);
    const tot = top.reduce((s, p) => s + p[1], 0) || 1;
    return top.map(([j, v]) => [j, v / tot] as [number, number]);
  });
}

/* ------------------------------------------------------------------ prices */

/** What a good costs in a country, relative to the start (world price, currency, tariff). */
export function importPrice(w: World, n: Nation, g: number) {
  const t = n.tax.tariffs[GOODS[g].id] ?? n.tax.tariff;
  return w.prices[g] * n.fx * (1 + t - (n.tax.tariff0 ?? 0));
}

/** Price index of a good for a country's buyers. */
export function localPrice(w: World, d: D, n: Nation, g: number) {
  if (g === ELEC_G) return d.c.elecPrice[n.id] ?? 1;
  const s = SECTOR_INDEX[GOODS[g].sector];
  const dom = n.sectors[s].price;
  if (LOCAL_GOOD[g]) return dom;
  const D = d.demand[n.id][g];
  const m = D > 0 ? clamp(d.imports[n.id][g] / D, 0, 1) : 0;
  return dom * (1 - m) + importPrice(w, n, g) * m;
}

/* ------------------------------------------------------------------ energy */

/** Run the grid for a day: what plants can make with the fuel they can get. */
export function energyDay(w: World, d: D, n: Nation) {
  const e = d.elec[n.id];
  const fuelAvail = d.slow[n.id];
  let ind = 0;
  for (let s = 0; s < NS; s++) if (s !== POWER) ind += n.sectors[s].out * SECTORS[s].elec;
  ind *= n.elecEff;
  const home = n.elecHome * (n.pop / Math.max(1, n.cohorts.reduce((a, b) => a + b, 0)));
  const demand = ind + home;
  const strike = groupStrike(w, n, "miners");
  const byType: Record<string, number> = {};
  let gen = 0;
  let shortFuel = "";
  let shortWorst = 1;
  for (const pi of d.c.plantsBy[n.id] ?? []) {
    const p = w.plants[pi];
    if (p.ready > w.day || p.damage >= 1) continue;
    if (w.control[p.city] !== n.id) continue;
    const def = PLANTS[p.type];
    if (def.type === "storage") continue;
    let fuelOk = 1;
    if (def.fuel) {
      if (def.fuel[0] === "helium3") fuelOk = (w.moon.he3[n.id] ?? 0) > 0 ? 1 : 0;
      else fuelOk = fuelAvail[GOOD_INDEX[def.fuel[0]]];
      if (fuelOk < shortWorst) {
        shortWorst = fuelOk;
        shortFuel = def.name;
      }
    }
    let cf = def.cf;
    if (p.type === "wind" || p.type === "solar") cf *= 1 + Math.min(0.15, storageGw(w, d, n) / Math.max(1, totalGw(w, d, n, p.type)));
    const g = p.gw * 8.76 * cf * (1 - p.damage) * fuelOk * (1 - strike * 0.6);
    byType[p.type] = (byType[p.type] ?? 0) + g;
    gen += g;
  }
  // Short? Borrow from neighbours with spare.
  let imported = 0;
  if (gen < demand && n.interconnect > 0) imported = Math.min(demand - gen, n.interconnect * 8.76 * 0.6);
  const supply = gen + imported;
  const served = demand > 0 ? clamp(supply / demand, 0, 1) : 1;
  e.demand = demand;
  e.gen = gen;
  e.imported = imported;
  e.served = served;
  e.byType = byType;
  e.fuelShort = shortWorst < 0.97 ? `${shortFuel}s short of fuel (${Math.round(shortWorst * 100)}%)` : "";
  // Price: fuel costs move it; shortages push it up; subsidies hold it down.
  let fuelCost = 0;
  for (const [t, g] of Object.entries(byType)) {
    const def = PLANTS[t as keyof typeof PLANTS];
    if (def.fuel && def.fuel[0] !== "helium3") fuelCost += g * def.fuel[1] * w.prices[GOOD_INDEX[def.fuel[0]]] * n.fx;
  }
  const raw = 0.55 + (gen > 0 ? (fuelCost / gen / ELEC_BN) * 0.45 * 2.2 : 0.45);
  if (!n.elecBase) n.elecBase = raw;
  const base = raw / n.elecBase;
  const subsidy = n.gdp > 0 ? clamp(n.spend.energySubsidy / Math.max(0.01, demand * ELEC_BN), 0, 0.6) : 0;
  d.c.elecPrice[n.id] = ease(d.c.elecPrice[n.id] ?? 1, Math.max(0.2, base * (1 + 2.5 * (1 - served)) * (1 - subsidy)), 6);
  e.price = d.c.elecPrice[n.id];
  // Power sector's output follows what it generates.
  const ps = n.sectors[POWER];
  ps.out = (gen * ELEC_BN) / 0.85;
  ps.limit = served < 0.97 ? (e.fuelShort || "Not enough power plants") : "";
  ps.limitBy = 1 - served;
}

function storageGw(w: World, d: D, n: Nation) {
  let s = 0;
  for (const pi of d.c.plantsBy[n.id] ?? []) if (w.plants[pi].type === "storage" && w.plants[pi].ready <= w.day) s += w.plants[pi].gw;
  return s;
}
function totalGw(w: World, d: D, n: Nation, type: string) {
  let s = 0;
  for (const pi of d.c.plantsBy[n.id] ?? []) if (w.plants[pi].type === type && w.plants[pi].ready <= w.day) s += w.plants[pi].gw;
  return s;
}

/** Electricity served to industry and to homes, by the load-shedding rule. */
export function servedShares(d: D, n: Nation): { ind: number; home: number } {
  const e = d.elec[n.id];
  if (e.served >= 0.999) return { ind: 1, home: 1 };
  const home = n.elecHome;
  const ind = Math.max(0.0001, e.demand - home);
  const supply = e.served * e.demand;
  if (n.loadShed === "industry") return { ind: clamp((supply - home) / ind, 0, 1), home: clamp(supply / home, 0, 1) };
  if (n.loadShed === "homes") return { ind: clamp(supply / ind, 0, 1), home: clamp((supply - ind) / home, 0, 1) };
  return { ind: e.served, home: e.served };
}

/* ------------------------------------------------------------------ production */

/** Share of a group on strike today. */
export function groupStrike(w: World, n: Nation, g: GroupId): number {
  const gi = GROUP_IDX[g];
  const st = n.groups[gi];
  return st && st.strike > 0 ? st.strikeShare : 0;
}
const GROUP_IDX: Record<string, number> = GROUP_INDEX;

/** Tech multiplier on a sector's productivity. */
export function techMult(n: Nation, s: SectorId): number {
  return n.productivity * (TECH_SECTOR[s] ? 1 + techLevel(n, TECH_SECTOR[s]!) * 0.012 : 1);
}
const TECH_SECTOR: Partial<Record<SectorId, TechField>> = {
  crops: "agriculture", livestock: "agriculture", power: "energy", steel: "materials", chemicals: "materials", materials: "materials", machinery: "industry", vehicles: "industry", electrical: "industry",
  electronics: "computing", telecom: "comms", pharma: "biotech", transport: "transport", construction: "construction", aerospace: "space", finance: "finance", services: "ai", defence: "land",
};
/** How many techs a country knows in a field. */
export function techLevel(n: Nation, f: TechField): number {
  let c = 0;
  for (const i of n.research.known) if (TECHS[i]?.field === f) c++;
  return c;
}

export function productionDay(w: World, d: D, n: Nation) {
  const avail = d.slow[n.id];
  const sh = servedShares(d, n);
  const occ = d.occupied[n.id];
  // Spare workers to hire from.
  let spare = Math.max(0, n.labour - n.workers);
  for (let s = 0; s < NS; s++) {
    if (s === POWER) continue;
    const st = n.sectors[s];
    const def = SECTORS[s];
    const capEff = st.cap * (1 - st.damage) * (1 - occ) * techMult(n, def.id) / n.productivity;
    // Firms move toward what they can sell.
    const want = Math.min(capEff, Math.max(capEff * 0.05, (st.plan || st.out) * (1 + 0.05 * clamp(st.orders - 1, -1, 1))));
    st.plan = want;
    // Workers: hire toward need, limited by who's free.
    const need = want * st.lab;
    if (need > st.workers) {
      const hire = Math.min(need - st.workers, spare * 0.02 + need * 0.002);
      st.workers += hire;
      spare -= hire;
    } else st.workers -= Math.min(st.workers - need, st.workers * 0.004);
    const strike = groupStrike(w, n, def.group);
    const active = st.workers * (1 - strike);
    const labR = need > 0 ? clamp(active / need, 0, 1) : 1;
    const elecR = def.elec > 0.05 ? clamp(sh.ind, 0, 1) : clamp(0.5 + sh.ind * 0.5, 0, 1);
    let inR = 1;
    let inWhy = "";
    for (const [g, k] of d.c.inputsOf[s]) {
      const r = 1 - (1 - avail[g]) * Math.min(1, k / 0.05) * 0.7;
      if (r < inR) {
        inR = r;
        inWhy = GOODS[g].name;
      }
    }
    const r = Math.min(labR, elecR, inR);
    st.out = want * r;
    if (r < 0.98) {
      if (r === labR) st.limit = strike > 0.05 ? `Strike (${Math.round(strike * 100)}% out)` : "Not enough workers";
      else if (r === elecR) st.limit = "Power cuts";
      else st.limit = `Short of ${inWhy.toLowerCase()}`;
      st.limitBy = 1 - r;
    } else if (want < capEff * 0.8) {
      st.limit = "Weak orders";
      st.limitBy = 1 - want / Math.max(1e-6, capEff);
    } else {
      st.limit = "";
      st.limitBy = 0;
    }
  }
}

/* ------------------------------------------------------------------ demand */

const HH_TOTAL = GOODS.reduce((s, g) => s + g.hh, 0);
const INVEST_GOODS: [number, number][] = [["industrial_machinery", 0.3], ["commercial_build", 0.35], ["computers", 0.06], ["trucks", 0.06], ["software", 0.06], ["cables", 0.07], ["turbines", 0.05], ["tools", 0.05]].map(([g, k]) => [GOOD_INDEX[g as string], k as number]);

/** Household spending, $bn a year (set by `incomes`). */
export function demandDay(w: World, d: D, n: Nation, consumption: number, invest: number, gov: Float64Array) {
  const D = d.demand[n.id];
  const P = d.supply[n.id];
  D.fill(0);
  P.fill(0);
  // Production into goods.
  for (let s = 0; s < NS; s++) {
    const out = n.sectors[s].out;
    for (const g of SECTOR_GOODS[s]) P[g] += out * n.gmix[g];
  }
  // Households.
  const sh = servedShares(d, n);
  for (let g = 0; g < NG; g++) {
    const hh = GOODS[g].hh;
    if (hh > 0) D[g] += ((consumption * hh) / HH_TOTAL / Math.max(0.2, localPrice(w, d, n, g))) * (g === ELEC_G ? sh.home : 1);
  }
  // Firms' inputs.
  for (let s = 0; s < NS; s++) {
    const out = n.sectors[s].out;
    if (out <= 0) continue;
    for (const [g, k] of d.c.inputsOf[s]) D[g] += out * k;
  }
  // Investment and the state.
  for (const [g, k] of INVEST_GOODS) D[g] += invest * k;
  for (let g = 0; g < NG; g++) D[g] += gov[g] + w.other[g] * n.gdp;
  // Power plants' fuel.
  const e = d.elec[n.id];
  for (const [t, gen] of Object.entries(e.byType)) {
    const def = PLANTS[t as keyof typeof PLANTS];
    if (!def.fuel || def.fuel[0] === "helium3") continue;
    const fi = GOOD_INDEX[def.fuel[0]];
    // What they'd burn at full output, so a shortage shows as unmet demand.
    D[fi] += (gen / Math.max(0.05, d.slow[n.id][fi])) * def.fuel[1];
  }
  for (let g = 0; g < NG; g++) {
    // Dear goods are used more sparingly (households already pay by price above).
    const el = LOCAL_GOOD[g] ? 1 : Math.pow(Math.max(0.2, w.prices[g]), -0.35);
    D[g] *= n.dm[g] * el;
  }
  // Electricity is made where it's used.
  D[ELEC_G] = e.demand * ELEC_BN;
  P[ELEC_G] = (e.gen + e.imported) * ELEC_BN;
}

/* ------------------------------------------------------------------ trade */

/** How open a country's trade is today, and why not: [imports, exports, why]. */
export function accessOf(w: World, d: D, n: Nation): [number, number, string] {
  let xcut = 0;
  let cut = 0;
  const why: string[] = [];
  const sea = d.c.coastal[n.id] ?? 0.5;
  const by = w.blockades[n.id];
  if (by !== undefined) {
    const k = sea * 0.85;
    cut += k;
    xcut += k;
    why.push(`blockade by ${w.nations[by].name} (−${Math.round(k * 100)}%)`);
  }
  for (const st of STRAITS) {
    if (w.straits[st.id] === undefined) continue;
    const u = st.users[n.iso];
    if (u) {
      cut += u * sea;
      xcut += u * sea;
      why.push(`${st.name} closed (−${Math.round(u * sea * 100)}%)`);
    }
  }
  let sanc = 0;
  for (const s of w.sanctions) {
    if (s.on !== n.id) continue;
    const p = d.c.partners[n.id]?.find((q) => q[0] === s.by);
    // Trade finds other routes as the years pass.
    const years = Math.max(0, (w.day - s.since) / 365);
    sanc += (p ? p[1] : 0.01) * (s.level / 3) * 0.55 / (1 + years / 2);
  }
  if (sanc > 0.005) {
    cut += sanc;
    // Sanctioned exporters still find buyers elsewhere, at a discount.
    xcut += sanc * 0.35;
    why.push(`sanctions (−${Math.round(sanc * 100)}%)`);
  }
  return [clamp(1 - cut, 0.05, 1), clamp(1 - xcut, 0.05, 1), why.join(", ")];
}

/** Clear the world market for every tradable good. */
export function clearMarkets(w: World, d: D) {
  const N = w.nations.length;
  for (let i = 0; i < N; i++) {
    const n = w.nations[i];
    if (!n.alive) continue;
    const [acc, accX, why] = accessOf(w, d, n);
    d.access[i] = acc;
    d.accessX[i] = accX;
    d.accessWhy[i] = why;
  }
  for (let g = 0; g < NG; g++) {
    if (LOCAL_GOOD[g]) {
      d.fill[g] = 1;
      d.sell[g] = 1;
      for (let i = 0; i < N; i++) {
        d.imports[i][g] = 0;
        d.exports[i][g] = 0;
        const D = d.demand[i][g];
        const P = d.supply[i][g];
        d.avail[i][g] = D > 1e-9 ? clamp(P / D, 0, 1) : 1;
        d.slow[i][g] += (d.avail[i][g] - d.slow[i][g]) / 8;
      }
      continue;
    }
    let S = 0;
    let R = 0;
    for (let i = 0; i < N; i++) {
      if (!w.nations[i].alive) continue;
      const net = d.supply[i][g] - d.demand[i][g];
      if (net > 0) S += net * d.accessX[i];
      else R += -net * d.access[i] * tariffDamp(w.nations[i], g);
    }
    const fill = R > 1e-9 ? Math.min(1, S / R) : 1;
    const sell = S > 1e-9 ? Math.min(1, R / S) : 1;
    d.fill[g] = fill;
    d.sell[g] = sell;
    // Prices: a short market rises, a glutted one falls (slowly).
    const ratio = S > 1e-9 ? R / S : R > 0 ? 3 : 1;
    w.prices[g] = clamp(w.prices[g] * (1 + 0.004 * clamp(ratio - 1, -0.6, 2)) + (1 - w.prices[g]) * 0.0004, 0.2, 8);
    for (let i = 0; i < N; i++) {
      const n = w.nations[i];
      const D = d.demand[i][g];
      const P = d.supply[i][g];
      const net = P - D;
      let m = 0;
      let x = 0;
      if (net < 0) m = -net * d.access[i] * tariffDamp(n, g) * fill;
      else x = net * d.accessX[i] * sell;
      // Strategic reserves cover a shortfall of fuel.
      let draw = 0;
      const id = GOODS[g].id;
      if (net < 0 && n.releaseReserve && n.reserve[id] !== undefined && n.reserve[id] > 0) {
        const gap = -net - m;
        draw = Math.min(gap, n.reserve[id] * 365 * 0.02);
        n.reserve[id] = Math.max(0, n.reserve[id] - draw / 365);
      }
      d.imports[i][g] = m + draw;
      d.exports[i][g] = x;
      // Against what buyers still want once tariffs have put some off.
      const want = net < 0 ? P + -net * tariffDamp(n, g) : D;
      d.avail[i][g] = want > 1e-9 ? clamp((Math.min(P, D) + m + draw) / want, 0, 1) : 1;
      d.slow[i][g] += (d.avail[i][g] - d.slow[i][g]) / 15;
    }
  }
}

/** Tariffs make people buy a little less abroad. */
function tariffDamp(n: Nation, g: number) {
  const t = (n.tax.tariffs[GOODS[g].id] ?? n.tax.tariff) - (n.tax.tariff0 ?? 0);
  return clamp(1 - t * 0.6, 0.2, 1);
}

/** Sector orders after the market: domestic sales, exports sold, and unmet demand. */
export function ordersDay(w: World, d: D, n: Nation) {
  const D = d.demand[n.id];
  const P = d.supply[n.id];
  const X = d.exports[n.id];
  const M = d.imports[n.id];
  let xv = 0;
  let mv = 0;
  for (let s = 0; s < NS; s++) {
    if (s === POWER) continue;
    let prod = 0;
    let sold = 0;
    for (const g of SECTOR_GOODS[s]) {
      prod += P[g];
      const dom = Math.min(P[g], D[g]);
      const unmet = Math.max(0, D[g] - P[g] - M[g]);
      // Tariffs on imports send some demand to home producers.
      sold += dom + X[g] + unmet;
      xv += X[g] * w.prices[g];
      mv += M[g] * w.prices[g] * n.fx;
    }
    const st = n.sectors[s];
    const ratio = prod > 1e-9 ? clamp(sold / prod, 0.2, 2.5) : 1.2;
    st.orders = ease(st.orders, ratio, 4);
    // Firms shift what they make toward what sells.
    const list = SECTOR_GOODS[s];
    if (list.length > 1 && prod > 1e-9) {
      let tot = 0;
      for (const g of list) {
        const pg = P[g];
        const sg = pg > 1e-12 ? (Math.min(pg, D[g]) + X[g] + Math.max(0, D[g] - pg - M[g])) / pg : 1.5;
        n.gmix[g] *= 1 + 0.01 * clamp(sg - ratio, -0.5, 0.5);
        n.gmix[g] = Math.max(n.gmix[g], 1e-4);
        tot += n.gmix[g];
      }
      for (const g of list) n.gmix[g] /= tot;
    }
  }
  d.trade[n.id].x = xv;
  d.trade[n.id].m = mv;
}

/* ------------------------------------------------------------------ incomes, taxes, the budget */

/** Income tax on an income (as a multiple of the average) under a bracket schedule. */
export function incomeTax(brackets: [number, number][], x: number): number {
  let t = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [lo, rate] = brackets[i];
    const hi = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
    if (x <= lo) break;
    t += (Math.min(x, hi) - lo) * rate;
  }
  return t;
}

const VAT_GOODS: Record<VatCat, number[]> = { food: [], energy: [], standard: [], luxury: [], exempt: [] };
GOODS.forEach((g, i) => VAT_GOODS[g.vat].push(i));

export interface Flows {
  consumption: number;
  invest: number;
  gov: Float64Array;
}
const flows = new Map<number, Flows>();
let calibrating = false;
export function flowsOf(n: Nation): Flows {
  let f = flows.get(n.id);
  if (!f) {
    f = { consumption: n.gdp * 0.6, invest: n.gdp * 0.08, gov: new Float64Array(NG) };
    flows.set(n.id, f);
  }
  return f;
}
export function resetFlows() {
  flows.clear();
}

const G = GROUP_INDEX;
/** Who the soldiers, the public servants, the retired, the students and the jobless are, today. */
export function labourDay(w: World, n: Nation) {
  const ret = retireAge(n);
  let wa = 0;
  let students = 0;
  let retirees = 0;
  let children = 0;
  for (let i = 0; i < 17; i++) {
    const c = n.cohorts[i];
    const lo = i * 5;
    const hi = lo + 5;
    if (hi <= 15) children += c;
    else if (lo >= ret) retirees += c;
    else if (hi > ret) {
      const f = (ret - lo) / 5;
      wa += c * f;
      retirees += c * (1 - f);
    } else wa += c;
    if (lo >= 15 && lo < 25) students += c * enrolment(n) * (lo === 15 ? 0.6 : 0.5);
  }
  const part = n.free > 0.5 ? 0.76 : 0.7;
  n.labour = Math.max(0, (wa - students) * part);
  let staff = 0;
  for (const s of SERVICE_IDS) staff += n.services[s].staff;
  const owners = n.labour * (n.gdp / n.pop > 0.02 ? 0.06 : 0.08);
  const investors = n.labour * 0.015;
  let sectorWorkers = 0;
  for (const st of n.sectors) sectorWorkers += st.workers;
  n.workers = sectorWorkers + staff + n.mil.personnel + owners + investors;
  const jobless = Math.max(0, n.labour - n.workers);
  n.unemp = n.labour > 0 ? jobless / n.labour : 0;
  // Group sizes.
  const pops = new Array(18).fill(0);
  n.sectors.forEach((st, s) => (pops[G[SECTORS[s].group]] += st.workers));
  for (const s of SERVICES) pops[G[s.group]] += n.services[s.id].staff;
  pops[G.soldiers] = n.mil.personnel;
  pops[G.smallbiz] = owners;
  pops[G.investors] = investors;
  pops[G.students] = students;
  pops[G.retirees] = retirees;
  pops[G.unemployed] = jobless;
  for (let i = 0; i < 18; i++) n.groups[i].pop = pops[i];
  return { children, retirees, jobless, staff, students };
}

export function retireAge(n: Nation) {
  return +(n.laws.retirement ?? "65");
}
function enrolment(n: Nation) {
  return clamp(0.12 + (n.gdp / Math.max(1, n.pop)) * 1e9 * 0.000009, 0.12, 0.6);
}

/** Pay, profits, pensions and benefits into groups; taxes out; the budget. Returns spending flows. */
export function incomesDay(w: World, d: D, n: Nation) {
  const L = labourDay(w, n);
  const f = flowsOf(n);
  const b = d.budget[n.id];
  const price = n.price;
  // Value added and its split.
  const farmOwn = clamp(0.85 - ((n.gdp / Math.max(1, n.pop)) * 1e9) / 40000, 0.2, 0.85);
  let wages = 0;
  let profit = 0;
  let stateProfit = 0;
  const groupWage = new Array(18).fill(0);
  const groupProfit = new Array(18).fill(0);
  for (let s = 0; s < NS; s++) {
    const st = n.sectors[s];
    const def = SECTORS[s];
    const va = st.out * st.price * def.va;
    // Pay per worker is sticky: it follows what the job produces and prices, slowly.
    const fair = st.workers > 0 ? ((va * LABOUR_SHARE * (1 + st.coop * 0.15)) / st.workers) * 1e9 : 0;
    if (!st.wage || calibrating) st.wage = fair;
    else st.wage += (fair - st.wage) / 400 + st.wage * Math.max(-0.02, n.inflation) / 365 * 0.5;
    const wb = (st.workers * st.wage) / 1e9;
    const pr = va - wb;
    st.profit = pr;
    wages += wb;
    groupWage[G[def.group]] += wb;
    // State firms pay a dividend; the rest of what they make is reinvested.
    stateProfit += pr * st.state * (def.id === "oilgas" ? 0.8 : 0.3);
    const priv = pr * (1 - st.state - st.coop);
    groupWage[G[def.group]] += pr * st.coop * 0.6;
    // Smallholders keep their farms' profits; elsewhere profits are paid out (less what's reinvested).
    const own = s <= 2 ? farmOwn : 0;
    groupWage[G[def.group]] += priv * own * 0.7;
    const paid = priv * (1 - own) * 0.45;
    const small = def.id === "retail" || def.id === "realestate" || def.id === "tourism" || def.id === "services" || def.id === "construction" ? 0.4 : 0.15;
    groupProfit[G.smallbiz] += paid * small;
    groupProfit[G.investors] += paid * (0.6 - small);
    groupProfit[G.retirees] += paid * 0.22;
    groupProfit[G.professionals] += paid * 0.12;
    groupProfit[G.clerks] += paid * 0.06;
    profit += priv * (1 - own);
  }
  // The average wage (for public pay and benefits).
  const sectorWorkers = n.sectors.reduce((a, s) => a + s.workers, 0);
  const avgWage = sectorWorkers > 0 ? (wages * 1e9) / sectorWorkers : 1000;
  n.avgWage = ease(n.avgWage || avgWage, avgWage, 30);
  const aw = n.avgWage / 1e9;
  // The state's payroll and purchases.
  const gov = f.gov;
  gov.fill(0);
  const exp: Part[] = [];
  let staffPay = 0;
  for (const sd of SERVICES) {
    const sv = n.services[sd.id];
    const pay = sv.staff * sv.pay * aw;
    staffPay += pay;
    groupWage[G[sd.group]] += pay;
    let sup = 0;
    for (const [good, k] of sd.supplies) {
      const gi = GOOD_INDEX[good];
      const q = (sv.staff * k * 1e-6 * sv.supply * aw * 1e9) / 30000;
      gov[gi] += q;
      sup += q * localPrice(w, d, n, gi);
    }
    const training = sv.places * sd.train * aw * 0.5;
    const upkeep = sv.facilities * sd.build * 0.001 * 0.03 * costLevel(n);
    exp.push({ label: sd.name, v: pay + sup + training + upkeep });
  }
  const soldierPay = n.mil.personnel * aw * (1 + n.mil.bonus);
  groupWage[G.soldiers] += soldierPay;
  // Benefits.
  const sp = n.spend;
  const coverage = clamp(0.1 + (n.gdp / Math.max(1, n.pop)) * 1e9 * 0.00002, 0.1, 0.8);
  const pension = L.retirees * (sp.pensionRate * (0.3 + coverage * 0.7) + Math.max(0, sp.minPension - sp.pensionRate * 0.3)) * aw * 0.85;
  const ui = L.jobless * sp.uiRate * aw * coverage;
  const child = L.children * sp.childBenefit * aw;
  groupWage[G.retirees] += pension;
  // Other transfers, mostly to the less well off.
  const tr = sp.transfers;
  for (const [g, k] of TRANSFER_SPLIT) groupWage[g] += tr * k;
  groupWage[G.unemployed] += ui + L.jobless * aw * 0.25 * (1 - coverage);
  groupWage[G.students] += L.students * aw * 0.25;
  // Child benefit goes to working households in proportion.
  let working = 0;
  for (let i = 0; i < 16; i++) working += n.groups[i].pop;
  // Taxes on each group.
  const tx = n.tax;
  const rev: Part[] = [];
  let incomeTaxT = 0;
  let socialT = 0;
  let wealthT = 0;
  const avgIncome = (wages + staffPay + soldierPay + profit * 0.6 + pension + ui) / Math.max(1, n.labour + L.retirees);
  let consumption = 0;
  // Pay won in bargaining comes out of profits.
  for (let i = 0; i < 16; i++) {
    const prem = n.groups[i].premium;
    if (prem !== 1) {
      const extra = groupWage[i] * (prem - 1);
      groupWage[i] += extra;
      groupProfit[G.investors] -= extra * 0.6;
      groupProfit[G.smallbiz] -= extra * 0.4;
    }
  }
  for (let i = 0; i < 18; i++) {
    const gs = n.groups[i];
    const pop = Math.max(1, gs.pop);
    const childShare = i < 16 && working > 0 ? (child * gs.pop) / working : 0;
    const gross = Math.max(groupWage[i] * 0.5, groupWage[i] + groupProfit[i] + childShare);
    const per = gross / pop;
    const x = avgIncome > 0 ? per / avgIncome : 0;
    const it = incomeTax(tx.brackets, x) * avgIncome * pop * taxCompliance(n);
    const wageLike = i === G.retirees || i === G.unemployed || i === G.students ? 0 : groupWage[i];
    const soc = wageLike * tx.socialEmployee;
    const wt = gs.wealth * pop * 1e-9 * tx.wealth;
    incomeTaxT += it;
    socialT += soc;
    wealthT += wt;
    const net = gross - it - soc - wt;
    gs.pre = (gross / pop) * 1e9;
    gs.post = (net / pop) * 1e9;
    const mpc = i === G.investors ? 0.45 : i === G.professionals || i === G.smallbiz ? 0.75 : 0.93;
    const spend = net * mpc;
    consumption += spend;
    gs.wealth = Math.max(0, gs.wealth + ((net - spend) / pop) * 1e9 / 365 - gs.wealth * 0.0001);
  }
  // Interest rates hold back spending and investment.
  const realRate = n.policyRate - n.inflation;
  consumption *= clamp(1 - (realRate - 0.01) * 0.6, 0.75, 1.15);
  if (!n.exchangeOpen) consumption *= 0.97;
  f.consumption = calibrating ? consumption : ease(f.consumption, consumption, 45);
  // VAT.
  let vatT = 0;
  for (const cat of Object.keys(VAT_GOODS) as VatCat[]) {
    const r = tx.vat[cat];
    if (!r) continue;
    let share = 0;
    for (const gi of VAT_GOODS[cat]) share += GOODS[gi].hh;
    vatT += ((f.consumption * share) / HH_TOTAL) * (r / (1 + r)) * taxCompliance(n);
  }
  const employerT = wages * tx.socialEmployer;
  // Taxed on profit after depreciation and allowances.
  const corpT = Math.max(0, profit * 0.32 - employerT * 0.2) * tx.corporate * taxCompliance(n);
  let customs = 0;
  const M = d.imports[n.id];
  for (let g = 0; g < NG; g++) if (M[g] > 0) customs += M[g] * w.prices[g] * n.fx * (tx.tariffs[GOODS[g].id] ?? tx.tariff);
  const ext = n.sectors[SECTOR_INDEX.oilgas].out * n.sectors[SECTOR_INDEX.oilgas].price + n.sectors[SECTOR_INDEX.metals_mining].out + n.sectors[SECTOR_INDEX.coal].out;
  const royalty = ext * tx.royalty;
  const carbonPrice = +(n.laws.carbon ?? "0");
  const carbonT = (n.emissions * carbonPrice) / 1000;
  const sinFx = n.laws.alcohol === "taxed" ? 1 : n.laws.alcohol === "restricted" ? 0.7 : 0.2;
  const sinT = ((f.consumption * (GOODS[GOOD_INDEX.tobacco].hh + GOODS[GOOD_INDEX.beverages].hh)) / HH_TOTAL) * 0.35 * sinFx;
  const cannabisT = n.laws.cannabis === "regulated" ? n.gdp * 0.0006 : n.laws.cannabis === "monopoly" ? n.gdp * 0.001 : 0;
  const swfT = n.swf * 0.035;
  rev.push(
    { label: "Income tax", v: incomeTaxT },
    { label: "Social contributions", v: socialT + employerT },
    { label: "VAT", v: vatT },
    { label: "Corporate tax", v: corpT },
    { label: "Customs duties", v: customs },
    { label: "Resource royalties", v: royalty },
    { label: "State companies' profits", v: stateProfit },
  );
  if (carbonT > 0.001) rev.push({ label: "Carbon price", v: carbonT });
  if (sinT > 0.001) rev.push({ label: "Alcohol & tobacco duties", v: sinT });
  if (cannabisT > 0) rev.push({ label: "Cannabis tax", v: cannabisT });
  if (wealthT > 0.001) rev.push({ label: "Wealth tax", v: wealthT });
  if (swfT > 0.001) rev.push({ label: "Sovereign fund returns", v: swfT });
  let aidIn = 0;
  for (const t of w.treaties) if (t.kind === "aid" && t.b === n.id && t.amount) aidIn += t.amount;
  if (n.imf && n.imf.amount > 0) aidIn += 0;
  if (aidIn > 0) rev.push({ label: "Foreign aid received", v: aidIn });
  // The state's other spending.
  const def = defenceCost(n, aw);
  exp.push({ label: "Pensions", v: pension }, { label: "Unemployment benefits", v: ui }, { label: "Child benefits", v: child }, { label: "Defence", v: Math.max(def.required, sp.defence) });
  exp.push({ label: "Other transfers & subsidies", v: sp.transfers }, { label: "Infrastructure", v: sp.infrastructure }, { label: "Social housing", v: sp.socialHousing }, { label: "Research", v: sp.research }, { label: "Culture & sport", v: sp.culture }, { label: "Intelligence", v: sp.intelligence }, { label: "Foreign aid", v: sp.aid });
  if (sp.energySubsidy > 0) exp.push({ label: "Energy subsidies", v: sp.energySubsidy });
  if (sp.prevention > 0) exp.push({ label: "Disaster prevention", v: sp.prevention });
  const programs = n.sectors.reduce((a, s) => a + s.program, 0);
  if (programs > 0) exp.push({ label: "Industry programmes", v: programs });
  for (const t of w.treaties) if ((t.kind === "aid" || t.kind === "milaid") && t.a === n.id && t.amount) exp.push({ label: `Aid to ${w.nations[t.b].name}`, v: t.amount });
  exp.push({ label: "Debt interest", v: n.debt * n.debtRate });
  // Government purchases of goods.
  gov[GOOD_INDEX.infrastructure] += sp.infrastructure * 0.8;
  gov[GOOD_INDEX.housing_build] += sp.socialHousing * 0.8;
  gov[GOOD_INDEX.consulting] += sp.research * 0.3;
  gov[GOOD_INDEX.culture] += sp.culture * 0.6;
  const proc = Math.max(0, Math.max(def.required, sp.defence) - def.pay);
  gov[GOOD_INDEX.ammunition] += proc * 0.25;
  gov[GOOD_INDEX.armour] += proc * 0.15;
  gov[GOOD_INDEX.missiles] += proc * 0.15;
  gov[GOOD_INDEX.combat_aircraft] += proc * 0.15;
  gov[GOOD_INDEX.warships] += proc * 0.1;
  gov[GOOD_INDEX.drones] += proc * 0.05;
  gov[GOOD_INDEX.diesel] += proc * 0.08;
  gov[GOOD_INDEX.jet_fuel] += proc * 0.07;
  for (let i = 0; i < NS; i++) if (n.sectors[i].program > 0) gov[GOOD_INDEX.industrial_machinery] += n.sectors[i].program * 0.5;
  for (let g = 0; g < NG; g++) gov[g] /= Math.max(0.3, localPrice(w, d, n, g));
  // Totals.
  b.rev = rev.filter((p) => p.v > 0.0005).sort((p, q) => q.v - p.v);
  b.exp = exp.filter((p) => p.v > 0.0005).sort((p, q) => q.v - p.v);
  b.revenue = b.rev.reduce((a, p) => a + p.v, 0);
  b.spending = b.exp.reduce((a, p) => a + p.v, 0);
  b.balance = b.revenue - b.spending;
  // GDP.
  let nominal = staffPay + soldierPay;
  let real = (staffPay + soldierPay) / price;
  for (let s = 0; s < NS; s++) {
    nominal += n.sectors[s].out * n.sectors[s].price * SECTORS[s].va;
    real += n.sectors[s].out * SECTORS[s].va;
  }
  n.gdp = nominal;
  n.gdpReal = real;
  void price;
}

const TRANSFER_SPLIT: [number, number][] = [[GROUP_INDEX.retirees, 0.3], [GROUP_INDEX.unemployed, 0.2], [GROUP_INDEX.farmers, 0.1], [GROUP_INDEX.service, 0.1], [GROUP_INDEX.hospitality, 0.05], [GROUP_INDEX.students, 0.1], [GROUP_INDEX.builders, 0.05], [GROUP_INDEX.factory, 0.05], [GROUP_INDEX.clerks, 0.05]];

/** Local cost of building and upkeep, relative to a rich country. */
export function costLevel(n: Nation) {
  return clamp(n.avgWage / 55000, 0.06, 1.6);
}

/** What the armed forces cost just to keep: pay plus upkeep. */
export function defenceCost(n: Nation, aw = n.avgWage / 1e9) {
  const pay = n.mil.personnel * aw * (1 + n.mil.bonus);
  let value = 0;
  for (const [k, v] of Object.entries(n.mil.equip)) value += v * (EQUIP_COST[k] ?? 0);
  const upkeep = value * 0.001 * 0.12;
  return { pay: pay * 1.5, upkeep, required: pay * 1.5 + upkeep };
}
const EQUIP_COST: Record<string, number> = Object.fromEntries(Object.values(EQUIP).map((e) => [e.id, e.cost]));

/** Tax collected as a share of what's owed (poorer, less free states collect less). */
export function taxCompliance(n: Nation) {
  const rich = (n.gdp / Math.max(1, n.pop)) * 1e9;
  return clamp(0.45 + rich / 60000 + n.services.admin.quality * 0.2, 0.45, 1);
}

/* ------------------------------------------------------------------ prices, money, debt */

/** Prices, inflation, interest and the debt, for a day. */
export function moneyDay(w: World, d: D, n: Nation, euroRate: number) {
  const b = d.budget[n.id];
  // Sector prices: orders pull them; costs push them; expectations carry them.
  const expect = clamp(n.inflation * 0.6 + (n.cbIndependent ? 0.02 * 0.4 : n.inflation * 0.4) + (n.printing / Math.max(1, n.gdp)) * 1.5, -0.03, 1.5);
  const e = d.elec[n.id];
  for (let s = 0; s < NS; s++) {
    const st = n.sectors[s];
    const def = SECTORS[s];
    let cost = 0;
    let tot = 0;
    for (const [g, k] of d.c.inputsOf[s]) {
      cost += k * (LOCAL_GOOD[g] ? n.sectors[SECTOR_INDEX[GOODS[g].sector]].price : importPrice(w, n, g));
      tot += k;
    }
    const inputIdx = tot > 0 ? cost / tot : 1;
    const elecIdx = def.elec > 0 ? e.price : 1;
    const target = (1 - def.va) * (inputIdx * 0.85 + elecIdx * 0.15) + def.va * n.price;
    const pull = 0.0012 * clamp(st.orders - 1, -0.5, 1);
    st.price = clamp(st.price * (1 + expect / 365 + pull) + (target - st.price) * 0.01, 0.05, 1e5);
  }
  // Consumer prices.
  let cpi = 0;
  let wsum = 0;
  for (let g = 0; g < NG; g++) {
    const hh = GOODS[g].hh;
    if (!hh) continue;
    cpi += hh * localPrice(w, d, n, g);
    wsum += hh;
  }
  n.price = cpi / wsum;
  // Interest: an independent bank follows the rule; the euro follows Frankfurt.
  if (n.orgs.includes("euro")) n.policyRate = euroRate;
  else if (n.cbIndependent) {
    const target = clamp(0.02 + n.inflation + 0.5 * (n.inflation - 0.02) - 0.5 * (n.unemp - naturalUnemp(n)), 0, 0.4);
    n.policyRate = ease(n.policyRate, target, 45);
  }
  // Currency: deficits on the current account and money printing weaken it.
  if (!n.orgs.includes("euro") && n.iso !== "USA") {
    const ca = (d.trade[n.id].x - d.trade[n.id].m) / Math.max(1, n.gdp);
    const drift = -ca * 0.0004 + (n.printing / Math.max(1, n.gdp)) * 0.004 + (n.inflation - 0.025) * 0.0002 - (n.policyRate - 0.04) * 0.0002;
    n.fx = clamp(n.fx * (1 + drift), 0.2, 50);
  }
  // FX reserves follow trade.
  n.fxReserves = Math.max(0, n.fxReserves + (d.trade[n.id].x - d.trade[n.id].m) * 0.05 / 365);
  // Borrowing: the deficit and the debt falling due.
  const need = -b.balance + n.debt / 7;
  const daily = need / 365;
  n.debtRate = ease(n.debtRate, n.yield, 365 * 4);
  if (n.defaulted > w.day) {
    // Shut out: the deficit has to be cut, printed or paid from reserves.
    const gap = Math.max(0, -b.balance) / 365;
    if (n.fxReserves > gap) n.fxReserves -= gap;
    else n.printing = ease(n.printing, Math.max(0, -b.balance), 30);
  } else if (n.market || daily <= 0) {
    n.debt = Math.max(0, n.debt - b.balance / 365);
  } else {
    // No market: reserves, then the IMF, then the printing press.
    const gap = Math.max(0, -b.balance) / 365;
    if (n.imf && n.imf.amount > 0) {
      const use = Math.min(gap, n.imf.amount);
      n.imf.amount -= use;
      n.debt += use;
    } else if (n.fxReserves > gap * 3) n.fxReserves -= gap;
    else if (!n.cbIndependent) n.printing = ease(n.printing, Math.max(0, -b.balance), 30);
    else n.debt += gap;
  }
  if (n.printing > 0) n.printing *= 0.999;
}

export function naturalUnemp(n: Nation) {
  return n.free > 0.7 ? 0.05 : 0.07;
}

/** Once a month: inflation, growth, the rating and the yield. */
export function monthlyMoney(w: World, d: D, n: Nation) {
  n.priceHist.push(n.price);
  if (n.priceHist.length > 13) n.priceHist.shift();
  // A year on a year; until there's a year of data, the annualised rate since the start (damped).
  const h = n.priceHist;
  const raw = h.length > 12 ? h[h.length - 1] / h[0] - 1 : (h[h.length - 1] / h[0]) ** (12 / Math.max(3, h.length - 1)) - 1;
  n.inflation = clamp(h.length > 12 ? raw : n.inflation * 0.5 + raw * 0.5, -0.2, 20);
  n.gdpHist.push(n.gdpReal);
  if (n.gdpHist.length > 13) n.gdpHist.shift();
  const gh = n.gdpHist;
  if (gh.length > 12) n.growth = gh[gh.length - 1] / gh[0] - 1;
  else if (gh.length > 1) n.growth = clamp(n.growth * 0.5 + ((gh[gh.length - 1] / gh[0]) ** (12 / Math.max(3, gh.length - 1)) - 1) * 0.5, -0.5, 0.5);
  const b = d.budget[n.id];
  const debtGdp = n.debt / Math.max(1, n.gdp);
  const deficit = -b.balance / Math.max(1, n.gdp);
  // The rating: debt, deficit, reserves, growth, stability, history.
  let risk = 0;
  risk += clamp((debtGdp - 0.6) * 4, -2, 8);
  risk += clamp(deficit * 60, -2, 6);
  risk += clamp((0.15 - n.fxReserves / Math.max(1, d.trade[n.id].m)) * 6, -1, 3);
  risk += clamp(-n.growth * 40, -1.5, 4);
  risk += clamp((50 - n.stability) / 12, -1.5, 4);
  risk += clamp((n.inflation - 0.04) * 15, -0.5, 4);
  if (n.defaulted > w.day - 365 * 5) risk += 6;
  if (wealthy(n)) risk -= 4;
  if (n.iso === "USA") risk -= 3;
  if (n.orgs.includes("euro")) risk -= 1;
  const target = clamp(Math.round(4 + risk), 0, RATINGS.length - 1);
  n.rating = target > n.rating ? Math.min(target, n.rating + 1) : target < n.rating - 1 ? n.rating - 1 : n.rating;
  const base = n.orgs.includes("euro") ? euroBase(w) : Math.max(0.02, n.policyRate);
  const premium = [0, 0.001, 0.002, 0.003, 0.005, 0.007, 0.009, 0.012, 0.016, 0.02, 0.026, 0.033, 0.042, 0.055, 0.07, 0.09, 0.12, 0.16, 0.22, 0.3, 0.5][n.rating];
  n.yield = base + 0.01 + premium + (n.orgs.includes("euro") ? 0 : Math.max(0, n.inflation - 0.03) * 0.5);
  n.market = n.rating < 17 && n.defaulted <= w.day;
  // Banks: unemployment and defaults rot their books.
  const bk = n.banks;
  bk.npl = ease(bk.npl, clamp(0.02 + Math.max(0, n.unemp - 0.05) * 0.6 + Math.max(0, -n.growth) * 0.4 + (n.defaulted > w.day ? 0.15 : 0) + Math.max(0, 1 - n.housing.price) * 0.2, 0, 0.6), 6);
  bk.capital = ease(bk.capital, clamp(0.16 - bk.npl * 0.5 + bk.liquidity * 0.02, -0.1, 0.25), 4);
  bk.liquidity = Math.max(0, bk.liquidity * 0.9);
}
function wealthy(n: Nation) {
  return (n.gdp / Math.max(1, n.pop)) * 1e9 > 40000;
}
function euroBase(w: World) {
  return w.nations.find((m) => m.iso === "DEU")?.policyRate ?? 0.025;
}

/** The ECB sets one rate for the euro, from the eurozone's average inflation and jobs. */
export function euroRate(w: World): number {
  let gdp = 0;
  let infl = 0;
  let un = 0;
  for (const n of w.nations) {
    if (!n.alive || !n.orgs.includes("euro")) continue;
    gdp += n.gdp;
    infl += n.inflation * n.gdp;
    un += n.unemp * n.gdp;
  }
  if (gdp <= 0) return 0.025;
  infl /= gdp;
  un /= gdp;
  return clamp(0.02 + infl + 0.5 * (infl - 0.02) - 0.5 * (un - 0.065), 0, 0.2);
}

/* ------------------------------------------------------------------ investment */

/** Firms add capacity when orders run ahead and money's cheap; the state's programmes add more. */
export function investDay(w: World, d: D, n: Nation): number {
  let spend = 0;
  const real = n.policyRate - n.inflation;
  const rateF = clamp(1 - (real - 0.01) * 4, 0.2, 1.6);
  const credit = n.banks.capital < 0.06 ? 0.4 : n.banks.capital < 0.09 ? 0.75 : 1;
  for (let s = 0; s < NS; s++) {
    const st = n.sectors[s];
    const def = SECTORS[s];
    const util = st.cap > 0 ? st.out / st.cap : 0;
    let g = 0;
    if (st.orders > 1.02 && util > 0.8) g = (st.orders - 1) * 0.1 * rateF * credit * (1 - st.coop * 0.3) * (1 - st.state * 0.2);
    g = clamp(g, 0, 0.25) - 0.035 * (util < 0.7 ? 1.6 : 1);
    if (s === POWER) g = 0;
    const add = (st.cap * g) / 365;
    const prog = st.program / def.capex / 365;
    st.cap = Math.max(0.001, st.cap + add + prog);
    // Gross investment: replacing what wears out, plus growth.
    if (s !== POWER) spend += st.cap * def.capex * (0.035 + Math.max(0, g)) * (util > 0.5 ? 1 : 0.5);
    // Repairs.
    if (st.damage > 0) st.damage = Math.max(0, st.damage - 0.0015);
  }
  return spend;
}

/* ------------------------------------------------------------------ calibration */

/** At the start: scale demand so each good's world market (and each local market) balances. */
export function calibrate(w: World, d: D) {
  const N = w.nations.length;
  for (const n of w.nations) n.dm = new Array(NG).fill(1);
  calibrating = true;
  const caps = w.nations.map((n) => n.sectors.map((s) => s.cap));
  // Several passes so incomes, spending and the scaling settle together.
  for (let pass = 0; pass < 5; pass++) {
    for (const n of w.nations) {
      if (!n.alive) continue;
      energyDay(w, d, n);
      incomesDay(w, d, n);
      const f = flowsOf(n);
      const inv = investDay(w, d, n);
      demandDay(w, d, n, f.consumption, inv, f.gov);
    }
    for (let g = 0; g < NG; g++) {
      if (LOCAL_GOOD[g]) {
        for (let i = 0; i < N; i++) {
          const D = d.demand[i][g];
          const P = d.supply[i][g];
          if (D > 1e-9 && P > 0) w.nations[i].dm[g] *= clamp(P / D, 0.05, 20);
        }
        continue;
      }
      let S = 0;
      let R = 0;
      let G = 0;
      for (let i = 0; i < N; i++) {
        S += d.supply[i][g];
        R += d.demand[i][g];
        G += w.nations[i].alive ? w.nations[i].gdp : 0;
      }
      // Goods nobody in the model buys still sell somewhere: give them a share of final demand.
      if (R < S * 0.2 && G > 0) w.other[g] += (S - R) / G;
      const k = R > S * 0.2 && S > 0 ? clamp(S / R, 0.05, 20) : 1;
      for (let i = 0; i < N; i++) w.nations[i].dm[g] *= k;
    }
  }
  // Fresh availability; capacity as it was (the passes above mustn't age it).
  for (let i = 0; i < N; i++) {
    d.avail[i].fill(1);
    d.slow[i].fill(1);
    w.nations[i].sectors.forEach((s, k) => (s.cap = caps[i][k]));
  }
  calibrating = false;
}

