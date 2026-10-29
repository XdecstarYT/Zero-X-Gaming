/**
 * Society: people age, are born, die and move; public services are only as good as their
 * scarcest input (staff, who take years to train; facilities, which take years to build;
 * supplies, which come off the world market); each social group's satisfaction is the sum of
 * named causes; unhappy, organised groups strike and protest; housing, crime, epidemics,
 * disasters and the climate follow from the rest.
 */
import { DISASTERS, DISEASES, GOOD_INDEX, GROUPS, GROUP_INDEX, LAW, LAWS, MEASURES, SERVICES, SERVICE_IDS, SECTORS, type DisasterId, type GroupId, type ServiceId } from "./data";
import type { D } from "./econ";
import { costLevel, groupStrike, retireAge, servedShares } from "./econ";
import type { Atlas } from "./atlas";
import type { Nation, Part, Protest, Strike, World } from "./state";
import { clamp, ease, rngNext } from "./util";
import { news } from "./news";

const G = GROUP_INDEX;

/* ------------------------------------------------------------------ demography */

/** Deaths per person per year in each five-year band, for a life expectancy. */
function mortality(band: number, lifeExp: number) {
  const age = band * 5 + 2.5;
  const k = Math.exp((80 - lifeExp) / 9);
  return Math.min(0.6, (0.0005 + 0.00004 * Math.exp(age / 9.5)) * k * (band === 0 ? 3 : 1));
}

export function demographyMonth(w: World, n: Nation) {
  const c = n.cohorts;
  // Health care and the epidemic shift life expectancy.
  const hq = n.services.health.quality;
  n.lifeExp = ease(n.lifeExp, clamp(55 + 28 * Math.sqrt(clamp((n.gdp / Math.max(1, n.pop)) * 1e9 / 60000, 0, 1)) + (hq - 0.75) * 8 - n.crime * 30, 45, 88), 24);
  let deaths = 0;
  for (let i = 0; i < 17; i++) {
    const d = (c[i] * mortality(i, n.lifeExp)) / 12;
    c[i] -= d;
    deaths += d;
  }
  // Ageing: a sixtieth of each band moves up each month.
  for (let i = 16; i > 0; i--) {
    const move = c[i - 1] / 60;
    c[i - 1] -= move;
    if (i < 16) c[i] += move;
    else c[16] += move;
  }
  // Births: fertility answers to child benefit, rents, and schooling.
  let women = 0;
  for (let i = 3; i < 10; i++) women += c[i] * 0.5;
  const fert = n.fertility * clamp(1 + n.spend.childBenefit * 1.2 - (n.housing.rent - 1) * 0.3, 0.6, 1.4);
  const births = (women * fert) / 35 / 12;
  c[0] += births;
  n.pop = c.reduce((a, b) => a + b, 0);
  return { births, deaths };
}

/* ------------------------------------------------------------------ public services */

/** What a country expects of its services (rises with wealth). */
export function expectation(n: Nation) {
  const dev = clamp((Math.log10(Math.max(400, (n.gdp / Math.max(1, n.pop)) * 1e9)) - 2.7) / 1.9, 0, 1);
  return 0.25 + 0.75 * dev;
}

export function servicesDay(w: World, d: D, n: Nation) {
  const ex = expectation(n);
  const day = w.day;
  for (const sd of SERVICES) {
    const sv = n.services[sd.id];
    const need = (n.pop / 1000) * sd.norm * ex;
    // Attrition: retirement, plus more when pay lags what they'd get elsewhere.
    const payGap = sd.pay - sv.pay;
    const quit = (0.035 + clamp(payGap, 0, 1) * 0.12 + (sd.id === "health" || sd.id === "education" ? n.migOut[2] / Math.max(1, n.pop) * 40 : 0)) / 365;
    sv.staff -= sv.staff * quit;
    // Hiring: graduates, plus qualified people drawn in by pay (and from abroad, if the law allows).
    const grads = (sv.pipeline[0] ?? 0) / 365;
    const market = sv.staff * clamp(0.005 + (sv.pay - sd.pay) * 0.05, 0, 0.04) / 365;
    const abroad = n.laws.immigration === "points" || n.laws.immigration === "open" ? sv.staff * 0.008 / 365 : 0;
    const vacancies = Math.max(0, need * 1.05 - sv.staff);
    const hires = Math.min(vacancies, grads + market + abroad);
    sv.staff += hires;
    // Unfilled graduates find other work.
    // Facilities being built.
    for (let i = sv.building.length - 1; i >= 0; i--) {
      if (sv.building[i][1] <= day) {
        sv.facilities += sv.building[i][0];
        sv.building.splice(i, 1);
      }
    }
    // Supplies: what the budget buys, if the market has it.
    let sup = 1;
    for (const [good] of sd.supplies) sup = Math.min(sup, d.slow[n.id][GOOD_INDEX[good]]);
    const supplyR = clamp(sup * sv.supply, 0, 1.2);
    const strike = groupStrike(w, n, sd.group);
    sv.strike = strike;
    const vaccinating = sd.id === "health" && Object.values(n.vaccine).some((v) => v >= 1) && (w.epidemics[n.id]?.length ?? 0) > 0 ? 0.88 : 1;
    const staffR = clamp((sv.staff * (1 - strike) * vaccinating) / Math.max(1, need), 0, 1.2);
    const facR = clamp((sv.facilities * sd.per) / Math.max(1, n.pop * ex), 0, 1.2);
    let load = 1;
    if (sd.id === "health") {
      // An epidemic fills hospital beds.
      let sick = 0;
      for (const e of w.epidemics[n.id] ?? []) sick += e.i * (DISEASES.find((x) => x.id === e.disease)?.hosp ?? 0.05);
      load = clamp(1 - sick / Math.max(1, sv.facilities), 0.1, 1);
    }
    if (sd.id === "prisons") load = clamp(1 / Math.max(0.5, n.crime / 0.04 * (1 + (LAW.cannabis.options.find((o) => o.id === n.laws.cannabis)?.fx?.prisons ?? 0))), 0.3, 1.2);
    const q = Math.min(staffR, facR * load, supplyR, 1);
    sv.quality = ease(sv.quality, q, 5);
    const lim = Math.min(staffR, facR * load, supplyR);
    sv.limit = lim >= 0.98 ? "" : lim === staffR ? (strike > 0.05 ? `Staff on strike (${Math.round(strike * 100)}%)` : `Short of staff (${Math.round((1 - staffR) * need).toLocaleString()} posts)`) : lim === supplyR ? "Short of supplies" : `Short of ${sd.facility}`;
  }
}

/** New year: trainees move a year closer; new places start. */
export function servicesYear(n: Nation) {
  for (const sd of SERVICES) {
    const sv = n.services[sd.id];
    sv.pipeline.shift();
    while (sv.pipeline.length < Math.ceil(sd.train) - 1) sv.pipeline.push(0);
    sv.pipeline.push(sv.places);
  }
}

/** Build facilities: costs now, ready after construction. */
export function buildFacilities(w: World, n: Nation, id: ServiceId, amount: number): number {
  const sd = SERVICES.find((s) => s.id === id)!;
  const cost = amount * sd.build * 0.001 * costLevel(n);
  const days = id === "health" ? 900 : id === "education" ? 540 : id === "prisons" ? 720 : 400;
  n.services[id].building.push([amount, w.day + days]);
  n.debt += cost;
  return cost;
}

/* ------------------------------------------------------------------ satisfaction */

const RENTERS: Record<GroupId, number> = { farmers: 0.2, miners: 0.35, factory: 0.45, builders: 0.5, transport: 0.45, service: 0.65, hospitality: 0.7, clerks: 0.45, professionals: 0.3, health: 0.35, teachers: 0.3, civil: 0.3, soldiers: 0.5, smallbiz: 0.2, investors: 0.05, students: 0.9, retirees: 0.15, unemployed: 0.75 };

/** Each group's satisfaction, as a sum of named causes. */
export function groupsDay(w: World, d: D, n: Nation, days = 1) {
  const sh = servedShares(d, n);
  const war = atWar(w, n.id);
  const draft = LAW.conscription.options.find((o) => o.id === n.laws.conscription)?.fx?.draft ?? 0;
  const relig = n.relig - 0.5;
  const sv = n.services;
  const epidemicDead = (w.epidemics[n.id] ?? []).reduce((a, e) => a + e.d, 0) / Math.max(1, n.pop);
  const disaster = w.disasters.filter((x) => x.nation === n.id && w.day - x.day < 180).reduce((a, x) => a + x.dead, 0) / Math.max(1, n.pop);
  for (let i = 0; i < 18; i++) {
    const gd = GROUPS[i];
    const gs = n.groups[i];
    const parts: Part[] = [];
    const add = (label: string, v: number) => {
      if (Math.abs(v) >= 0.05) parts.push({ label, v });
    };
    // Income: better or worse off than a year ago, after prices.
    const real = gs.post / Math.max(0.05, n.price);
    if (!gs.ref) gs.ref = real;
    gs.ref = ease(gs.ref, real, 365 / days);
    add("Income", clamp(40 * Math.log(Math.max(1e-6, real) / Math.max(1e-6, gs.ref)), -22, 15));
    // Jobs.
    const working = i < 13;
    if (working) add("Jobs", clamp(-(n.unemp - 0.05) * 110, -18, 4));
    if (gd.id === "unemployed") add("Out of work", -12 - clamp((n.unemp - 0.05) * 60, 0, 10) + n.spend.uiRate * 10);
    if (gd.id === "students") add("Jobs for graduates", clamp(-(n.unemp - 0.05) * 80, -14, 3));
    // Prices.
    add("Prices", clamp(-(n.inflation - 0.025) * 140, -24, 3) * (gd.id === "investors" ? 0.4 : 1));
    // Power cuts.
    if (sh.home < 0.99) add("Power cuts", -(1 - sh.home) * 45);
    // Services.
    add("Health care", (sv.health.quality - 0.8) * (gd.id === "retirees" ? 26 : 16));
    if (gd.id === "students" || gd.id === "teachers" || working) add("Schools", (sv.education.quality - 0.8) * (gd.id === "students" ? 18 : 9));
    add("Safety", (sv.police.quality - 0.8) * 7 * (0.5 + gd.v[4]) - (n.crime - 0.03) * 120 * (0.5 + gd.v[4] * 0.5));
    // Housing.
    add("Rents", -(n.housing.rent - 1) * 35 * RENTERS[gd.id] - (n.housing.mortgage - 0.05) * 60 * (1 - RENTERS[gd.id]) * 0.5);
    // Laws: how each sits with what this group values.
    let law = 0;
    for (const L of LAWS) {
      const opt = L.options.find((o) => o.id === n.laws[L.id]);
      if (!opt?.v) continue;
      for (const [k, v] of Object.entries(opt.v)) {
        const dim = +k;
        const gv = gd.v[dim] + (dim === 0 ? relig * 0.8 : 0);
        law += gv * (v as number) * 1.5;
      }
    }
    add("Laws", clamp(law, -22, 18));
    // Taxes.
    const rate = gs.pre > 0 ? 1 - gs.post / gs.pre : 0;
    add("Taxes", clamp(-(rate - 0.22) * 35, -14, 6));
    // Benefits and pay.
    if (gd.id === "retirees") add("Pensions", (n.spend.pensionRate - 0.45) * 40 + (n.spend.minPension - 0.2) * 20 + (retireAge(n) - 65) * -0.6);
    if (working && gd.id !== "soldiers") add("Retirement age", -(retireAge(n) - 64) * 1.2 * (0.5 + gd.v[1] * 0.5));
    const svc = SERVICES.find((s) => s.group === gd.id);
    if (svc) {
      let ratio = 0;
      let k = 0;
      for (const s of SERVICES) if (s.group === gd.id) ((ratio += n.services[s.id].pay / s.pay), k++);
      add("Pay", clamp((ratio / k - 1) * 45, -20, 12));
      add("Workload", clamp((n.services[svc.id].quality - 0.85) * 20, -10, 3));
    }
    if (gd.id === "soldiers") add("Pay & bonuses", n.mil.bonus * 60 - (n.spend.defence < n.gdp * 0.01 ? 6 : 0));
    if (gs.premium !== 1) add("Pay deal", clamp((gs.premium - 1) * 80, -10, 10));
    if (gs.strike > 0) add("On strike", -6);
    // War and the draft.
    if (war) {
      const dead = warDead(w, n.id) / Math.max(1, n.pop);
      add("War losses", -clamp(dead * 8000, 0, 25) * (gd.v[3] > 0.5 ? 0.7 : 1));
      if (draft > 0 && (gd.id === "students" || gd.id === "service" || gd.id === "factory")) add("Conscription", -draft * 8);
    }
    if (gs.repressed > 0) add("Crackdowns", -gs.repressed);
    if (epidemicDead > 1e-5) add("Epidemic", -clamp(epidemicDead * 20000, 0, 18));
    if (disaster > 1e-6) add("Disasters", -clamp(disaster * 100000, 0, 12));
    // Pride: sport, culture, a capital that's ours.
    if (n.olympics && n.olympics.host > 0 && w.day < n.olympics.host + 60 && w.day > n.olympics.host - 30) add("Olympics", 6);
    add("Culture & sport", clamp(((n.spend.culture / Math.max(1, n.gdp)) - 0.003) * 900, -3, 4));
    const capOcc = n.capital >= 0 && w.control[n.capital] !== n.id;
    if (capOcc) add("Capital occupied", -15);
    // Freedom matters to those who value liberty.
    if (n.free < 0.4) add("Freedom", -(0.4 - n.free) * 20 * Math.max(0, gd.v[2]));
    const target = clamp(50 + parts.reduce((a, p) => a + p.v, 0), 0, 100);
    gs.sat = ease(gs.sat, target, 8 / days);
    gs.parts = parts.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    // Militancy: anger with somewhere to go.
    const union = gs.union * (LAW.unions.options.find((o) => o.id === n.laws.unions)?.fx?.union ?? 1);
    const tMil = clamp((48 - gs.sat) * 2.2 * (0.4 + union) + gs.repressed * 1.5, 0, 100);
    gs.mil = ease(gs.mil, tMil, 30 / days);
    gs.repressed = Math.max(0, gs.repressed - 0.03 * days);
  }
}

export function atWar(w: World, id: number) {
  return w.wars.some((x) => !x.over && x.ceasefire <= w.day && (x.attackers.includes(id) || x.defenders.includes(id)));
}
function warDead(w: World, id: number) {
  let s = 0;
  for (const x of w.wars) if (!x.over) s += (x.dead[id] ?? 0) * (w.day - x.start < 730 ? 1 : 0.5);
  return s;
}

/** Approval and stability, from the groups and the state of things. */
export function approvalDay(w: World, d: D, n: Nation) {
  let tot = 0;
  let sum = 0;
  const byCause = new Map<string, number>();
  for (let i = 0; i < 18; i++) {
    const gs = n.groups[i];
    const wgt = gs.pop * (GROUPS[i].id === "students" ? 0.7 : GROUPS[i].id === "retirees" ? 1.25 : 1);
    tot += wgt;
    sum += wgt * gs.sat;
    for (const p of gs.parts) byCause.set(p.label, (byCause.get(p.label) ?? 0) + p.v * wgt);
  }
  n.approval = tot > 0 ? sum / tot : 50;
  n.approvalParts = [...byCause.entries()].map(([label, v]) => ({ label, v: v / Math.max(1, tot) })).filter((p) => Math.abs(p.v) >= 0.1).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  // Stability.
  const parts: Part[] = [];
  const add = (label: string, v: number) => {
    if (Math.abs(v) >= 0.1) parts.push({ label, v });
  };
  const free = n.free;
  add(free > 0.6 ? "Elected government" : "Grip of the regime", free > 0.6 ? 12 : 6 + n.mil.loyalty * 0.06);
  add("Approval", (n.approval - 50) * 0.45);
  let mil = 0;
  for (const g of n.groups) mil += g.mil * g.pop;
  mil /= Math.max(1, n.groups.reduce((a, g) => a + g.pop, 0));
  add("Militancy", -mil * 0.35);
  const protests = w.protests.filter((p) => p.nation === n.id && !p.over).reduce((a, p) => a + p.size, 0) / Math.max(1, n.pop);
  add("Protests", -clamp(protests * 3000, 0, 20));
  const strikes = w.strikes.filter((s) => s.nation === n.id && s.started > 0 && !s.settled).length;
  add("Strikes", -strikes * 3);
  if (atWar(w, n.id)) add("War", -6);
  add("Occupied territory", -d.occupied[n.id] * 40);
  let sep = 0;
  for (const c of d.c.cities[n.id] ?? []) sep = Math.max(sep, w.separatism[c]);
  add("Separatism", -sep * 6);
  if (n.inflation > 0.2) add("Runaway prices", -clamp((n.inflation - 0.2) * 20, 0, 15));
  if (n.defaulted > w.day) add("Default", -8);
  if (n.unemp > 0.12) add("Mass unemployment", -(n.unemp - 0.12) * 60);
  add("Army's loyalty", (n.mil.loyalty - 65) * 0.12);
  if (w.actors.some((a) => a.alive && a.nation === n.id && a.strength > 20)) add("Armed groups", -6);
  const target = clamp(50 + parts.reduce((a, p) => a + p.v, 0), 0, 100);
  n.stability = ease(n.stability, target, 10);
  n.stabilityParts = parts.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
}

/* ------------------------------------------------------------------ unions, strikes, protests */

const UNIONISED: GroupId[] = ["miners", "factory", "builders", "transport", "health", "teachers", "civil", "service", "hospitality", "clerks"];

/** Unions organise; angry ones make demands with a deadline. */
export function unionsWeek(w: World, n: Nation) {
  const strikeLaw = LAW.strikes.options.find((o) => o.id === n.laws.strikes)?.fx?.strike ?? 1;
  for (const id of UNIONISED) {
    const gi = G[id];
    const gs = n.groups[gi];
    if (w.strikes.some((s) => s.nation === n.id && s.group === id && !s.settled)) continue;
    if (gs.mil < 42 || gs.union < 0.12 || strikeLaw === 0) continue;
    if (rngNext(w) > 0.06 * (gs.mil / 50)) continue;
    const demand = Math.round(clamp(n.inflation * 100 + (50 - gs.sat) / 4, 3, 25));
    const services = SERVICES.filter((s) => s.group === id).map((s) => s.id);
    const st: Strike = { group: id, nation: n.id, demand, deadline: w.day + 14, started: 0, share: clamp(gs.union * (0.4 + gs.mil / 120), 0.05, 0.6) * strikeLaw, services };
    w.strikes.push(st);
    if (n.id === w.actor.nation) news(w, n.id, `${GROUPS[gi].name}' unions demand ${demand}% more pay, or they strike in two weeks`, "home", true);
  }
}

/** Strikes start at the deadline; strikers lose pay; long strikes fade. */
export function strikesDay(w: World, n: Nation) {
  for (const st of w.strikes) {
    if (st.nation !== n.id || st.settled) continue;
    const gs = n.groups[G[st.group]];
    if (!st.started && w.day >= st.deadline) {
      st.started = w.day;
      gs.strike = 1;
      gs.strikeShare = st.share;
      news(w, n.id, `${GROUPS[G[st.group]].name} walk out: ${Math.round(st.share * 100)}% on strike`, "home", n.id === w.actor.nation);
    }
    if (st.started) {
      gs.strike = w.day - st.started + 1;
      gs.strikeShare = st.share * clamp(1 - (w.day - st.started) / 120, 0.2, 1);
      if (gs.mil < 25 || w.day - st.started > 150) settleStrike(w, n, st, "fizzled");
    }
  }
}

export type StrikeResponse = "accept" | "half" | "refuse" | "requisition" | "ban";

/** Answer a union. Returns what happened. */
export function answerStrike(w: World, n: Nation, st: Strike, how: StrikeResponse): string {
  const gs = n.groups[G[st.group]];
  const pub = SERVICES.filter((s) => s.group === st.group);
  const raise = (pctRise: number) => {
    if (pub.length) for (const s of pub) n.services[s.id].pay *= 1 + pctRise / 100;
    else gs.premium *= 1 + pctRise / 100;
  };
  if (how === "accept") {
    raise(st.demand);
    gs.mil *= 0.5;
    gs.sat = Math.min(100, gs.sat + 6);
    settleStrike(w, n, st, `Deal: ${st.demand}% rise`);
    return `Agreed ${st.demand}%: the union calls it off.`;
  }
  if (how === "half") {
    const half = Math.round(st.demand / 2);
    const takes = rngNext(w) < clamp(1.1 - gs.mil / 80, 0.15, 0.9);
    if (takes) {
      raise(half);
      gs.mil *= 0.7;
      settleStrike(w, n, st, `Compromise: ${half}%`);
      return `They took ${half}%.`;
    }
    st.demand = Math.round(st.demand * 0.8);
    gs.mil += 4;
    return `They turned down ${half}%: their demand is now ${st.demand}%.`;
  }
  if (how === "requisition") {
    st.share *= 0.45;
    gs.strikeShare = Math.min(gs.strikeShare, st.share);
    gs.mil += 8;
    gs.repressed += 3;
    return "Essential staff ordered back: fewer out, angrier.";
  }
  if (how === "ban") {
    gs.repressed += 10;
    gs.mil += 12;
    if (n.free > 0.5) n.groups.forEach((g, i) => GROUPS[i].v[2] > 0.3 && (g.repressed += 2));
    if (rngNext(w) < 0.5) {
      settleStrike(w, n, st, "Banned");
      return "The strike is banned and broken, for now.";
    }
    st.share *= 0.6;
    return "They defy the ban.";
  }
  gs.mil += 5;
  if (!st.started) st.deadline = w.day;
  return "No deal: they're out.";
}

export function settleStrike(w: World, n: Nation, st: Strike, how: string) {
  st.settled = how;
  const gs = n.groups[G[st.group]];
  gs.strike = 0;
  gs.strikeShare = 0;
}

/** Angry groups take to the streets. */
export function protestsDay(w: World, a: Atlas, n: Nation) {
  for (let i = 0; i < 18; i++) {
    const gs = n.groups[i];
    if (gs.mil < 55) continue;
    if (w.protests.some((p) => p.nation === n.id && !p.over && p.group === GROUPS[i].id)) continue;
    if (rngNext(w) > (gs.mil - 50) / 2500) continue;
    const cities = a.nationCities[n.id].filter((c) => w.control[c] === n.id);
    const city = GROUPS[i].urban < 0.3 ? cities[Math.floor(rngNext(w) * cities.length)] ?? n.capital : n.capital >= 0 ? n.capital : cities[0];
    if (city === undefined || city < 0) continue;
    const top = gs.parts.filter((p) => p.v < 0).sort((x, y) => x.v - y.v)[0];
    const p: Protest = { id: w.ids++, nation: n.id, city, group: GROUPS[i].id, size: gs.pop * (gs.mil / 100) * 0.05, cause: top ? top.label.toLowerCase() : "the government", day: w.day, over: false, dead: 0 };
    w.protests.push(p);
    news(w, n.id, `${Math.round(p.size).toLocaleString()} ${GROUPS[i].name.toLowerCase()} protest in ${a.map.cities[city].name} over ${p.cause}`, "home", n.id === w.actor.nation);
  }
  for (const p of w.protests) {
    if (p.nation !== n.id || p.over) continue;
    const gs = n.groups[G[p.group]];
    p.size *= p.response === "facilitate" ? 0.985 : p.response === "contain" ? 0.99 : p.response ? 0.96 : 1.01;
    if (w.day - p.day > 40 || p.size < 500 || gs.mil < 35) p.over = true;
  }
}

export type ProtestResponse = NonNullable<Protest["response"]>;

/** Police the protest. Returns what happened. */
export function answerProtest(w: World, n: Nation, p: Protest, how: ProtestResponse): string {
  const gs = n.groups[G[p.group]];
  const police = n.services.police.quality;
  p.response = how;
  if (how === "facilitate") {
    gs.mil *= 0.9;
    gs.sat += 2;
    return "Marshalled and listened to: tempers cool.";
  }
  if (how === "contain") {
    if (police < 0.5) {
      p.size *= 1.2;
      return "Too few police to hold the lines: it spreads.";
    }
    return "Kept to its route.";
  }
  const libertyAnger = (k: number) => n.groups.forEach((g, i) => (g.repressed += Math.max(0, GROUPS[i].v[2]) * k));
  if (how === "disperse") {
    p.size *= 0.5;
    gs.repressed += 6;
    libertyAnger(1);
    return police < 0.5 ? "Tear gas and chaos: it scatters, and they'll be back." : "Dispersed.";
  }
  if (how === "crackdown") {
    const dead = Math.round(p.size * 0.0005 + rngNext(w) * 20);
    p.dead += dead;
    p.size *= 0.25;
    gs.repressed += 18;
    gs.mil *= 0.7;
    libertyAnger(5);
    n.stability -= 4;
    for (const m of w.nations) if (m.free > 0.6 && m.id !== n.id) m.rel[n.id] = n.rel[m.id] = Math.max(-100, n.rel[m.id] - 6);
    news(w, n.id, `${dead} killed as police open fire on protesters`, "home", true);
    return `${dead} dead. The square is cleared; the world is watching.`;
  }
  // The army.
  if (n.mil.loyalty < 50 || rngNext(w) > n.mil.loyalty / 100) {
    n.mil.loyalty -= 15;
    n.mil.coupRisk += 25;
    news(w, n.id, "Soldiers refuse to fire on the crowds", "home", true);
    return "The army refused. Officers are talking among themselves.";
  }
  const dead = Math.round(p.size * 0.002 + rngNext(w) * 80);
  p.dead += dead;
  p.over = true;
  gs.repressed += 30;
  libertyAnger(10);
  n.stability -= 8;
  for (const m of w.nations) if (m.free > 0.6 && m.id !== n.id) m.rel[n.id] = n.rel[m.id] = Math.max(-100, n.rel[m.id] - 15);
  news(w, n.id, `Army crushes protests: ${dead} dead`, "home", true);
  return `The army cleared the streets. ${dead} dead.`;
}

/* ------------------------------------------------------------------ housing and crime */

export function housingMonth(w: World, n: Nation) {
  const h = n.housing;
  const cap = LAW.rent_control.options.find((o) => o.id === n.laws.rent_control)?.fx?.rentCap ?? 0;
  const resetCap = LAW.mortgage_cap.options.find((o) => o.id === n.laws.mortgage_cap)?.fx?.mortCap ?? 99;
  const income = n.growth + n.inflation;
  const popGrowth = (n.migIn[0] + n.migIn[1] + n.migIn[2] - n.migOut[0] - n.migOut[1] - n.migOut[2]) / Math.max(1, n.pop);
  const building = n.sectors[SECTORS.findIndex((s) => s.id === "construction")].orders - 1;
  const social = n.spend.socialHousing / Math.max(1, n.gdp);
  const pressure = income * 0.9 + popGrowth * 8 - building * 0.05 - social * 6 - (h.mortgage - 0.05) * 0.8;
  let rentRise = pressure / 12;
  if (cap >= 1) rentRise = Math.min(rentRise, 0);
  else if (cap > 0) rentRise = Math.min(rentRise, n.inflation / 12);
  h.rent = Math.max(0.4, h.rent * (1 + rentRise));
  // Rent control holds rents but slows new building.
  h.built = ease(h.built, clamp(0.01 + pressure * 0.2 - cap * 0.004 + social * 1.5, 0, 0.04), 6);
  h.social = clamp(h.social + social * 0.05, 0, 0.8);
  const target = clamp(n.policyRate + 0.018, 0.01, 0.4);
  h.mortgage = h.mortgage + clamp(target - h.mortgage, -0.01, Math.min(resetCap / 100 / 12, 0.02));
  h.price = Math.max(0.3, h.price * (1 + rentRise + (0.05 - h.mortgage) * 0.01));
}

export function crimeMonth(w: World, n: Nation) {
  const ineq = n.groups[G.investors].post / Math.max(100, n.groups[G.unemployed].post);
  const fx = (law: string) => LAW[law].options.find((o) => o.id === n.laws[law])?.fx ?? {};
  const policing = fx("police").policing ?? 1;
  const base = 0.02 + clamp(Math.log10(Math.max(1, ineq)) * 0.008, 0, 0.03) + n.unemp * 0.12 + (fx("guns").crime ?? 0) * 0.3 + (fx("death_penalty").crime ?? 0) * 0.1 + (fx("alcohol").crime ?? 0) * 0.3 + (fx("surveillance").crime ?? 0) * 0.3;
  const target = clamp(base * (1.6 - n.services.police.quality * policing * 0.6) * (1.3 - n.services.justice.quality * 0.3) * (n.services.prisons.quality < 0.6 ? 1.15 : 1), 0.003, 0.2);
  n.crime = ease(n.crime, target, 8);
}

/* ------------------------------------------------------------------ migration */

/** Once a month: who leaves, who arrives, by skill. */
export function migrationMonth(w: World, d: D, n: Nation) {
  const wage = n.avgWage;
  const war = atWar(w, n.id) ? 1 : 0;
  const push = clamp((n.unemp - 0.05) * 3 + (50 - n.stability) / 100 + war * 0.8 + d.occupied[n.id], 0, 3);
  const out: [number, number, number] = [0, 0, 0];
  // Rich, safe, open places pull; the skilled move most easily.
  const rich = 60000;
  const gap = clamp(Math.log(rich / Math.max(500, wage)), 0, 3);
  const working = n.labour;
  out[0] = (working * 0.5 * (gap * 0.0006 + push * 0.0012)) / 12;
  out[1] = (working * 0.35 * (gap * 0.0008 + push * 0.001)) / 12;
  out[2] = (working * 0.15 * (gap * 0.002 + push * 0.001 + clamp(0.9 - n.services.health.pay / 1.15, 0, 0.5) * 0.004)) / 12;
  // Arrivals: by the law, the jobs, the pay.
  const fx = LAW.immigration.options.find((o) => o.id === n.laws.immigration)?.fx ?? {};
  const imm = fx.imm ?? 1;
  const skill = fx.immSkill ?? 1;
  const pull = clamp(Math.log(Math.max(500, wage) / 8000), 0, 3) * clamp(1.2 - n.unemp * 5, 0.1, 1.2) * (n.stability / 70);
  const inflow: [number, number, number] = [(n.pop * 0.0007 * imm * pull) / 12, (n.pop * 0.0005 * imm * pull) / 12, (n.pop * 0.0003 * imm * pull * skill) / 12];
  // Refugees from wars next door.
  const asylum = LAW.asylum.options.find((o) => o.id === n.laws.asylum)?.fx?.asylum ?? 1;
  for (const x of w.wars) {
    if (x.over) continue;
    for (const v of [...x.defenders, ...x.attackers]) {
      if (v === n.id || w.nations[v].continent !== n.continent) continue;
      if (w.nations[v].rel[n.id] < -50) continue;
      inflow[0] += ((x.refugees / 365) * 0.002 * asylum * clamp(n.gdp / 2000, 0.05, 2)) / 12;
    }
  }
  n.migOut = out.map((v) => v * 12) as typeof n.migOut;
  n.migIn = inflow.map((v) => v * 12) as typeof n.migIn;
  // People: leavers from working age, arrivals into it.
  const net = inflow[0] + inflow[1] + inflow[2] - out[0] - out[1] - out[2];
  for (let i = 4; i < 8; i++) n.cohorts[i] = Math.max(0, n.cohorts[i] + net / 4);
  n.pop = n.cohorts.reduce((a, b) => a + b, 0);
  n.diaspora += out[0] + out[1] + out[2];
  // Skilled staff leaving thins the services.
  n.services.health.staff = Math.max(0, n.services.health.staff - out[2] * 0.04 + inflow[2] * 0.03);
  n.services.education.staff = Math.max(0, n.services.education.staff - out[2] * 0.03);
}

/* ------------------------------------------------------------------ epidemics */

export function epidemicsDay(w: World, d: D, n: Nation) {
  const list = w.epidemics[n.id];
  if (!list?.length) return;
  let cut = 0;
  for (const m of MEASURES) if (n.measures[m.id]) cut += m.cut;
  cut = clamp(cut, 0, 0.85);
  for (let k = list.length - 1; k >= 0; k--) {
    const e = list[k];
    const dz = DISEASES.find((x) => x.id === e.disease)!;
    const S = Math.max(0, n.pop - e.i - e.r - e.d - e.v);
    const beta = dz.beta * (1 - cut) * (0.6 + n.relig * 0) * (1 + (1 - n.services.health.quality) * 0.2);
    const newI = Math.min(S, (beta * e.i * S) / Math.max(1, n.pop));
    const rec = e.i / dz.days;
    const care = n.services.health.quality;
    const cfr = dz.cfr[0] + (dz.cfr[1] - dz.cfr[0]) * (1 - care);
    const dead = rec * cfr;
    e.i = Math.max(0, e.i + newI - rec);
    e.r += rec - dead;
    e.d += dead;
    // Deaths fall mostly on the old.
    n.cohorts[14] = Math.max(0, n.cohorts[14] - dead * 0.3);
    n.cohorts[15] = Math.max(0, n.cohorts[15] - dead * 0.3);
    n.cohorts[16] = Math.max(0, n.cohorts[16] - dead * 0.4);
    if (!e.detected && e.i > (n.measures.surveillance ? 800 : 25000)) {
      e.detected = true;
      news(w, n.id, `Outbreak of ${dz.name} confirmed: ${Math.round(e.i).toLocaleString()} cases`, "disaster", true);
    }
    // Vaccination: uses health staff.
    if ((n.vaccine[e.disease] ?? 0) >= 1) e.v = Math.min(n.pop - e.d, e.v + n.services.health.staff * 0.3 * n.services.health.quality);
    // Spread abroad.
    const travel = n.measures.travel ? 0.15 : 1;
    if (e.i > 2000) {
      for (const [j, wt] of d.c.partners[n.id] ?? []) {
        const m = w.nations[j];
        const theirs = (w.epidemics[j] ??= []);
        if (theirs.some((x) => x.disease === e.disease)) continue;
        const p = e.i * wt * 1e-7 * travel * (m.measures.travel ? 0.15 : 1);
        if (rngNext(w) < p) theirs.push({ disease: e.disease, i: 20, r: 0, d: 0, v: 0, day: w.day, detected: false });
      }
    }
    if (e.i < 5 && w.day - e.day > 30) list.splice(k, 1);
  }
}

/** Measures cost the economy: hospitality, culture and schools first. */
export function measuresCost(n: Nation) {
  let c = 0;
  for (const m of MEASURES) if (n.measures[m.id]) c += m.cost;
  return c;
}

/** Research toward a vaccine (daily). */
export function vaccineDay(w: World, n: Nation) {
  const list = w.epidemics[n.id];
  if (!list?.length) return;
  for (const e of list) {
    if (!e.detected) continue;
    const dz = DISEASES.find((x) => x.id === e.disease)!;
    if (!dz.vaccine) {
      n.vaccine[e.disease] = 1;
      continue;
    }
    const rp = (n.spend.research * 0.15 + n.gdp * 0.00005) * (1 + techCount(n, "medicine") * 0.15 + techCount(n, "biotech") * 0.1);
    n.vaccine[e.disease] = Math.min(1, (n.vaccine[e.disease] ?? 0) + rp / dz.vaccine / 365);
  }
}
import { TECHS } from "./data";
function techCount(n: Nation, f: string) {
  let c = 0;
  for (const i of n.research.known) if (TECHS[i]?.field === f) c++;
  return c;
}

/** A new outbreak somewhere (a few a decade). */
export function maybeOutbreak(w: World, a: Atlas) {
  if (rngNext(w) > 0.35 / 365) return;
  const pool = w.nations.filter((n) => n.alive && n.pop > 5e6);
  const n = pool[Math.floor(rngNext(w) * pool.length)];
  if (!n) return;
  const dz = DISEASES[Math.floor(rngNext(w) * DISEASES.length)];
  (w.epidemics[n.id] ??= []).push({ disease: dz.id, i: 50, r: 0, d: 0, v: 0, day: w.day, detected: false });
  void a;
}

/* ------------------------------------------------------------------ disasters */

const QUAKE = ["JPN", "IDN", "TUR", "IRN", "CHL", "PER", "MEX", "NPL", "PAK", "CHN", "ITA", "GRC", "NZL", "PHL", "USA", "AFG", "ECU", "GTM", "TWN", "MMR", "IND"];
const CYCLONE = ["BGD", "IND", "PHL", "CHN", "JPN", "USA", "MEX", "CUB", "HTI", "DOM", "MOZ", "MDG", "VNM", "MMR", "AUS", "TWN", "KOR", "PAK", "OMN", "FJI", "VUT", "JAM", "BHS", "HND", "NIC"];
const FIRE = ["AUS", "USA", "CAN", "GRC", "PRT", "ESP", "TUR", "RUS", "BRA", "BOL", "CHL", "ITA", "FRA", "DZA", "ISR"];
const FLOOD = ["BGD", "PAK", "IND", "CHN", "NGA", "DEU", "BRA", "IDN", "VNM", "THA", "LBY", "SSD", "SOM", "KEN", "ITA", "ESP", "GBR", "ZAF", "MOZ", "NPL"];
const DROUGHT = ["ETH", "SOM", "KEN", "SDN", "NER", "MLI", "TCD", "AFG", "IRN", "SYR", "IRQ", "AUS", "ZAF", "MDG", "ZWE", "ZMB", "BRA", "ARG", "MAR", "ESP", "USA", "MEX"];

export function disastersDay(w: World, a: Atlas, d: D) {
  const warm = 1 + Math.max(0, w.climate.temp - 1.2) * 0.4;
  for (const n of w.nations) {
    if (!n.alive) continue;
    let kind: DisasterId | null = null;
    const r = rngNext(w);
    const iso = n.iso;
    if (QUAKE.includes(iso) && r < 0.25 / 365) kind = rngNext(w) < 0.1 && a.nationCities[n.id].some((c) => a.map.cities[c].coastal) ? "tsunami" : "earthquake";
    else if (CYCLONE.includes(iso) && r < (0.6 * warm) / 365) kind = "cyclone";
    else if (FIRE.includes(iso) && r < (0.5 * warm) / 365) kind = "wildfire";
    else if (FLOOD.includes(iso) && r < (0.5 * warm) / 365) kind = "flood";
    else if (DROUGHT.includes(iso) && r < (0.25 * warm) / 365) kind = "drought";
    if (!kind) continue;
    const cities = a.nationCities[n.id].filter((c) => w.owner[c] === n.id);
    if (!cities.length) continue;
    const city = cities[Math.floor(rngNext(w) * cities.length)];
    disaster(w, a, d, n, city, kind);
  }
}

export function disaster(w: World, a: Atlas, d: D, n: Nation, city: number, kind: DisasterId) {
  const def = DISASTERS.find((x) => x.id === kind)!;
  const prevention = clamp((n.spend.prevention / Math.max(1, n.gdp)) * 600, 0, 0.6);
  const sev = (0.4 + rngNext(w) * 1.2) * (1 - prevention);
  const cp = a.map.cities[city].pop;
  const share = cp / Math.max(1, n.pop);
  const dead = Math.round(cp * def.deaths * sev * (1.6 - n.services.health.quality) * 8);
  const dmg = def.damage * sev;
  w.damage[city] = clamp(w.damage[city] + dmg, 0, 1);
  for (const s of n.sectors) s.damage = clamp(s.damage + dmg * share * (kind === "drought" ? 0 : 1), 0, 0.9);
  if (kind === "drought") {
    n.sectors[0].damage = clamp(n.sectors[0].damage + dmg * 2, 0, 0.6);
    n.sectors[1].damage = clamp(n.sectors[1].damage + dmg, 0, 0.6);
  }
  for (let s = 0; s < 6; s++) {
    const lost = w.facilities[city * 6 + s] * dmg;
    w.facilities[city * 6 + s] -= lost;
    n.services[SERVICE_IDS[s]].facilities = Math.max(0, n.services[SERVICE_IDS[s]].facilities - lost);
  }
  n.cohorts.forEach((c, i) => (n.cohorts[i] = Math.max(0, c - (dead * c) / Math.max(1, n.pop))));
  const cost = n.gdp * dmg * share * 3;
  w.disasters.push({ day: w.day, nation: n.id, city, kind, dead, damage: cost, rebuilt: 0 });
  if (w.disasters.length > 200) w.disasters.shift();
  news(w, n.id, `${def.icon} ${def.name} hits ${a.map.cities[city].name}: ${dead.toLocaleString()} dead, ${cost >= 1 ? `$${cost.toFixed(1)}bn` : `$${Math.round(cost * 1000)}m`} of damage`, "disaster", n.id === w.actor.nation || dead > 500);
  void d;
}

/* ------------------------------------------------------------------ climate */

/** Emissions this year, Mt CO2: power plants plus industry, farming and transport. */
export function emissionsOf(w: World, d: D, n: Nation): number {
  const e = d.elec[n.id];
  let mt = 0;
  for (const [t, gen] of Object.entries(e.byType)) mt += gen * ({ coal: 0.95, gas: 0.4, oil: 0.75, biomass: 0.1, geothermal: 0.04 } as Record<string, number>)[t] || 0;
  const F: Record<string, number> = { steel: 2.2, materials: 3, chemicals: 0.9, refining: 1, transport: 1.4, crops: 0.6, livestock: 2, coal: 0.4, oilgas: 0.5, metals_mining: 0.3, construction: 0.15, food: 0.1, vehicles: 0.08 };
  const carbon = +(n.laws.carbon ?? "0");
  let climateTech = 0;
  for (const i of n.research.known) if (TECHS[i]?.field === "climate") climateTech++;
  const k = clamp(1 - carbon / 500 - climateTech * 0.03, 0.3, 1);
  n.sectors.forEach((s, i) => (mt += s.out * (F[SECTORS[i].id] ?? 0.02) * k));
  mt += n.pop * 0.0000004 * clamp(n.avgWage / 30000, 0.1, 2);
  return mt;
}

export function climateYear(w: World, d: D) {
  let tot = 0;
  for (const n of w.nations) if (n.alive) tot += (n.emissions = emissionsOf(w, d, n));
  // About half stays in the air; 7.8 Gt is 1 ppm.
  w.climate.co2 += (tot * 0.5) / 7800;
  const eq = 3 * Math.log2(w.climate.co2 / 280);
  w.climate.temp += (eq - w.climate.temp) / 35 - w.climate.soot * 0.25;
  w.climate.soot *= 0.75;
  // Heat shrinks harvests.
  const loss = Math.max(0, w.climate.temp - 1.5) * 0.02 + w.climate.soot * 0.15;
  for (const n of w.nations) {
    n.sectors[0].damage = clamp(n.sectors[0].damage + loss * (Math.abs(n.capital >= 0 ? 1 : 1)), 0, 0.8);
  }
}
