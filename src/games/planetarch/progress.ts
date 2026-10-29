/**
 * Beyond the map: research across nineteen fields (programmes, licences bought from those who
 * know, co-operation, and diffusion as more of the world learns), the Moon (sites, crews,
 * governors, charters, helium-3 for fusion), territories (autonomy, referendums, independence,
 * cities bought and sold), tourism and the Olympics, and your nation's name and flag.
 */
import { MOON_SITES, TECHS, TECH_FIELDS, TECH_INDEX, type TechField } from "./data";
import type { Atlas } from "./atlas";
import type { D } from "./econ";
import { refreshCaches } from "./econ";
import type { Nation, World } from "./state";
import { clamp, rngNext, yearOf } from "./util";
import { news } from "./news";
import { nudge } from "./diplomacy";
import { madeUpFlag } from "./flags";

/* ------------------------------------------------------------------ research */

export function knows(n: Nation, id: string) {
  return n.research.known.includes(TECH_INDEX[id]);
}
export function fieldLevel(n: Nation, f: TechField) {
  let c = 0;
  for (const i of n.research.known) if (TECHS[i]?.field === f) c++;
  return c;
}
/** The next tech in a field, or null when it's done. */
export function nextTech(n: Nation, f: TechField) {
  return TECHS.find((t) => t.field === f && !n.research.known.includes(TECH_INDEX[t.id])) ?? null;
}

/** Share of the world's GDP that already knows a tech (makes it cheaper to follow); refreshed monthly. */
const DIFF: { day: number; v: Float32Array } = { day: -999, v: new Float32Array(TECHS.length) };
export function diffusion(w: World, techIdx: number) {
  if (w.day - DIFF.day >= 30 || w.day < DIFF.day) {
    DIFF.day = w.day;
    let tot = 0;
    DIFF.v.fill(0);
    for (const n of w.nations) {
      if (!n.alive) continue;
      tot += n.gdp;
      for (const k of n.research.known) DIFF.v[k] += n.gdp;
    }
    if (tot > 0) for (let i = 0; i < DIFF.v.length; i++) DIFF.v[i] /= tot;
  }
  return DIFF.v[techIdx] ?? 0;
}
export function diffusionSlow(w: World, techIdx: number) {
  let k = 0;
  let tot = 0;
  for (const n of w.nations) {
    if (!n.alive) continue;
    tot += n.gdp;
    if (n.research.known.includes(techIdx)) k += n.gdp;
  }
  return tot ? k / tot : 0;
}

/** Research points a day from the budget, scholars and co-operation. */
export function researchPoints(w: World, n: Nation) {
  const budget = n.spend.research;
  const brains = n.services.education.quality * 0.6 + 0.4;
  const professionals = n.groups[8].pop / Math.max(1, n.pop);
  let rp = (budget * 2.2 + n.gdp * 0.0004) * brains * (0.6 + professionals * 12);
  for (const t of w.treaties) if (t.kind === "research" && (t.a === n.id || t.b === n.id)) rp *= 1.15;
  return rp / 365;
}

export function researchDay(w: World, n: Nation) {
  const rp = researchPoints(w, n);
  for (const f of TECH_FIELDS) {
    n.research.rp[f] += rp * n.research.alloc[f];
    const t = nextTech(n, f);
    if (!t) continue;
    const cost = t.cost * (1 - 0.6 * diffusion(w, TECH_INDEX[t.id]));
    if (n.research.rp[f] >= cost) {
      n.research.rp[f] -= cost;
      n.research.known.push(TECH_INDEX[t.id]);
      if (n.id === w.actor.nation || t.level >= 9) news(w, n.id, `${n.name} masters ${t.name}`, "science", n.id === w.actor.nation);
    }
  }
}

/** Buy a licence from a country that knows the tech. */
export function buyLicence(w: World, buyer: Nation, seller: Nation, techIdx: number): string {
  if (!seller.research.known.includes(techIdx)) return `${seller.name} doesn't have it`;
  if (buyer.research.known.includes(techIdx)) return "You already have it";
  if ((seller.rel[buyer.id] ?? 0) < 0) return `${seller.name} won't sell to you`;
  const t = TECHS[techIdx];
  if (["nuclear", "missiles"].includes(t.field) && t.level >= 2 && (seller.rel[buyer.id] ?? 0) < 60) return "Weapons technology is only shared with close allies";
  const price = t.cost * 0.08 * clamp(seller.gdp / 2000, 0.5, 3);
  buyer.debt += price;
  seller.debt = Math.max(0, seller.debt - price);
  buyer.research.known.push(techIdx);
  nudge(w, buyer.id, seller.id, 3);
  return `Licence bought: ${t.name} for $${price.toFixed(1)}bn`;
}

/* ------------------------------------------------------------------ the Moon */

export function moonReady(n: Nation) {
  return fieldLevel(n, "space") >= 5;
}

export function claimMoonSite(w: World, n: Nation, site: string): string {
  if (!moonReady(n)) return "You need lunar landers and outposts (Space level 5)";
  if (w.moon.sites[site]) return "Taken";
  const cost = 25 * clamp(1 - fieldLevel(n, "space") * 0.05, 0.4, 1);
  n.debt += cost;
  const gov = w.people.length;
  w.people.push({ id: gov, name: `Commander ${String.fromCharCode(65 + Math.floor(rngNext(w) * 26))}. ${["Okoro", "Lindqvist", "Tanaka", "Moreau", "Iyer", "Zhao", "Silva", "Kowalski"][Math.floor(rngNext(w) * 8)]}`, female: rngNext(w) < 0.5, born: w.day - 16000, nation: n.id, party: -1, skill: 0.7, loyalty: 0.8, health: 1, alive: true, role: "Lunar governor" });
  w.moon.sites[site] = { owner: n.id, crew: 4, governor: gov, he3: 0, since: w.day };
  news(w, n.id, `${n.name} sets up a base at ${MOON_SITES.find((s) => s.id === site)?.name}`, "science", true);
  return `Outpost founded for $${cost.toFixed(0)}bn`;
}

export function moonDay(w: World) {
  for (const [id, s] of Object.entries(w.moon.sites)) {
    const n = w.nations[s.owner];
    const def = MOON_SITES.find((x) => x.id === id)!;
    if (!n?.alive) continue;
    if (fieldLevel(n, "space") >= 8) {
      const got = (def.he3 * s.crew) / 4 / 365;
      s.he3 += got;
      w.moon.he3[n.id] = (w.moon.he3[n.id] ?? 0) + got;
    }
    if (s.crew < 40 && rngNext(w) < 0.003) s.crew += 2;
  }
  // Fusion plants burn helium-3.
  for (const p of w.plants) {
    if (p.type !== "fusion" || p.ready > w.day) continue;
    w.moon.he3[p.nation] = Math.max(0, (w.moon.he3[p.nation] ?? 0) - p.gw * 0.00002);
  }
}

export function signCharter(w: World, n: Nation, charter: string) {
  w.moon.charter[n.id] = charter;
  return "Signed";
}

/* ------------------------------------------------------------------ territories */

export function setAutonomy(w: World, city: number, level: number) {
  w.autonomy[city] = clamp(level, 0, 3);
  w.separatism[city] = clamp(w.separatism[city] - (level > 0 ? 0.08 * level : -0.05), 0, 1);
}

/** Hold an independence referendum in a city's territory. */
export function referendum(w: World, a: Atlas, d: D, n: Nation, city: number): string {
  const yes = clamp(w.separatism[city] + (50 - n.approval) / 200 + (rngNext(w) - 0.5) * 0.12 - w.autonomy[city] * 0.04, 0.02, 0.98);
  const name = a.map.cities[city].name;
  if (yes > 0.5) {
    independence(w, a, d, n, city);
    return `${Math.round(yes * 100)}% vote to leave: ${name} is independent.`;
  }
  w.separatism[city] = clamp(w.separatism[city] - 0.15, 0, 1);
  news(w, n.id, `${name} votes to stay in ${n.name} (${Math.round(yes * 100)}% for independence)`, "politics", true);
  return `${Math.round((1 - yes) * 100)}% vote to stay.`;
}

/** A city's territory becomes a new country. */
export function independence(w: World, a: Atlas, d: D, from: Nation, city: number) {
  const c = a.map.cities[city];
  const id = w.nations.length;
  const base: Nation = structuredClone(from);
  const share = c.pop / Math.max(1, from.pop);
  base.id = id;
  base.iso = `X${id}`;
  base.name = c.name;
  base.formal = `Republic of ${c.name}`;
  base.flag = madeUpFlag(c.name);
  base.capital = city;
  base.pop = from.pop * share;
  base.cohorts = from.cohorts.map((v) => v * share);
  base.sectors = from.sectors.map((s) => ({ ...s, cap: s.cap * share, out: s.out * share, plan: s.plan * share, workers: s.workers * share }));
  base.groups = from.groups.map((g) => ({ ...g, pop: g.pop * share }));
  base.debt = from.debt * share;
  base.fxReserves = 0;
  base.swf = 0;
  base.orgs = ["un"];
  base.rel = new Array(w.nations.length + 1).fill(0);
  base.claims = [];
  base.pol = { ...structuredClone(from.pol), gov: [], elections: [{ day: w.day + 120, kind: "lower" }], results: [], bills: [] };
  base.mil = { ...structuredClone(from.mil), personnel: from.mil.personnel * share * 0.3, nukes: 0 };
  for (const k of Object.keys(base.mil.equip)) base.mil.equip[k as keyof typeof base.mil.equip] = Math.round(base.mil.equip[k as keyof typeof base.mil.equip] * share * 0.3);
  for (const s of from.sectors) {
    s.cap *= 1 - share;
    s.workers *= 1 - share;
  }
  from.cohorts = from.cohorts.map((v) => v * (1 - share));
  from.pop *= 1 - share;
  from.debt *= 1 - share;
  for (const n of w.nations) n.rel.push(n.id === from.id ? -20 : 10);
  base.rel[from.id] = -20;
  w.nations.push(base);
  w.owner[city] = id;
  w.control[city] = id;
  w.separatism[city] = 0;
  for (const cell of a.cityCells[city]) delete w.front[cell];
  for (const p of w.plants) if (p.city === city) p.nation = id;
  // A party list for the new state.
  for (const p of w.parties.filter((x) => x.nation === from.id && x.alive).slice(0, 4)) {
    const q = { ...structuredClone(p), id: w.parties.length, nation: id, poll: p.poll };
    w.parties.push(q);
  }
  base.pol.gov = [w.parties.length - 1];
  base.pol.lower = { name: "Assembly", size: 60, seats: { [w.parties.length - 1]: 60 } };
  base.pol.upper = null;
  news(w, id, `${c.name} declares independence from ${from.name}`, "world", true);
  growDerived(d, w);
  refreshCaches(w, a, d);
}

/** Make room in the day-to-day figures for a new country. */
export function growDerived(d: D, w: World) {
  while (d.supply.length < w.nations.length) {
    const n = 105;
    d.supply.push(new Float64Array(n));
    d.demand.push(new Float64Array(n));
    d.imports.push(new Float64Array(n));
    d.exports.push(new Float64Array(n));
    d.avail.push(new Float64Array(n).fill(1));
    d.slow.push(new Float64Array(n).fill(1));
    d.elec.push({ demand: 0, gen: 0, imported: 0, served: 1, price: 1, byType: {}, fuelShort: "" });
    d.budget.push({ rev: [], exp: [], revenue: 0, spending: 0, balance: 0 });
    d.access.push(1);
    d.accessX.push(1);
    d.accessWhy.push("");
    d.trade.push({ x: 0, m: 0 });
    d.occupied.push(0);
    d.c.elecPrice.push(1);
  }
}

/** Sell a city's territory to another country. */
export function transferCity(w: World, a: Atlas, d: D, from: Nation, to: Nation, city: number, price: number) {
  w.owner[city] = to.id;
  w.control[city] = to.id;
  for (const cell of a.cityCells[city]) delete w.front[cell];
  for (const p of w.plants) if (p.city === city) p.nation = to.id;
  const share = a.map.cities[city].pop / Math.max(1, from.pop);
  for (let i = 0; i < from.sectors.length; i++) {
    const moved = from.sectors[i].cap * share;
    from.sectors[i].cap -= moved;
    to.sectors[i].cap += moved;
  }
  const people = from.cohorts.map((v) => v * share);
  from.cohorts = from.cohorts.map((v, i) => v - people[i]);
  to.cohorts = to.cohorts.map((v, i) => v + people[i]);
  from.debt = Math.max(0, from.debt - price);
  to.debt += price;
  news(w, to.id, `${to.name} buys ${a.map.cities[city].name} from ${from.name} for $${price.toFixed(0)}bn`, "world", true);
  refreshCaches(w, a, d);
}

/** Separatism rises with neglect and falls with autonomy and good times. */
export function territoriesMonth(w: World, d: D) {
  for (let c = 0; c < w.separatism.length; c++) {
    const s = w.separatism[c];
    if (s <= 0) continue;
    const n = w.nations[w.owner[c]];
    if (!n) continue;
    w.separatism[c] = clamp(s + ((50 - n.approval) / 5000 - w.autonomy[c] * 0.002 + (n.free < 0.3 ? 0.002 : 0)), 0, 1);
  }
  void d;
}

/* ------------------------------------------------------------------ tourism and the Olympics */

export function tourismMonth(w: World, d: D, n: Nation) {
  const safe = clamp(1 - n.crime * 6 - (w.wars.some((x) => !x.over && (x.attackers.includes(n.id) || x.defenders.includes(n.id))) ? 0.6 : 0), 0.05, 1);
  const epidemic = (w.epidemics[n.id] ?? []).some((e) => e.detected) ? 0.6 : 1;
  const travel = n.measures.travel ? 0.15 : 1;
  const culture = 1 + (n.spend.culture / Math.max(1, n.gdp)) * 60;
  const olympic = n.olympics && Math.abs(w.day - n.olympics.host) < 60 ? 1.5 : 1;
  const tour = n.sectors[28];
  // Visitors fill hotels: their spending counts as orders for the sector.
  const k = safe * epidemic * travel * culture * olympic;
  tour.orders = tour.orders * 0.7 + tour.orders * 0.3 * clamp(k, 0.1, 1.5);
  n.tourists = (tour.out / Math.max(0.1, n.avgWage / 1e9)) * 0.00002 * k;
  void d;
}

const OLYMPIC_YEARS = [2028, 2032, 2036, 2040, 2044, 2048, 2052, 2056, 2060];
/** Bid for the next open Games. */
export function bidOlympics(w: World, n: Nation): string {
  const year = OLYMPIC_YEARS.find((y) => (w.olympics[y] ?? -1) < 0 && y - yearOf(w.day) >= 7);
  if (!year) return "No Games open for bids yet";
  if (n.olympics?.bid) return "Your bid is in";
  n.olympics = { bid: year, host: 0 };
  n.debt += n.gdp * 0.001;
  return `Bid lodged for ${year}: the IOC decides next year`;
}

export function olympicsYear(w: World) {
  for (const y of OLYMPIC_YEARS) {
    if ((w.olympics[y] ?? -1) >= 0 || y - yearOf(w.day) !== 7 - 1) continue;
    const bids = w.nations.filter((n) => n.alive && n.olympics?.bid === y);
    const pool = bids.length ? bids : w.nations.filter((n) => n.alive && n.gdp > 400 && n.stability > 55);
    const pickN = pool.sort((p, q) => q.gdp * q.stability * (0.6 + rngNext(w)) - p.gdp * p.stability * (0.6 + rngNext(w)))[0];
    if (!pickN) continue;
    w.olympics[y] = pickN.id;
    const host = Math.round((Date.UTC(y, 6, 25) - Date.UTC(2027, 0, 1)) / 86400000);
    pickN.olympics = { bid: y, host };
    pickN.spend.infrastructure += pickN.gdp * 0.002;
    news(w, pickN.id, `${pickN.name} will host the ${y} Olympic Games`, "world", true);
    for (const b of bids) if (b.id !== pickN.id) b.olympics = null;
  }
}

/* ------------------------------------------------------------------ your nation */

export function renameNation(n: Nation, name: string, formal?: string) {
  n.name = name.slice(0, 40);
  if (formal) n.formal = formal.slice(0, 60);
}

export { yearOf };
