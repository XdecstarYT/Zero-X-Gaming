/**
 * Politics: who votes for whom and why (each group weighs the parties against what it values,
 * and the government against how things are going), elections by every system the constitution
 * allows (with results city by city for election night), coalitions and cohabitation, bills
 * with vote forecasts and party lines, the executive's veto, the courts, no-confidence motions,
 * your party's money, activists, campaigns and promises, and leaders who age, die and are
 * succeeded.
 */
import { CONST, CONSTITUTION, FAMILIES, GROUPS, LAW, LAWS, PROMISES, type PromiseId } from "./data";
import type { Atlas } from "./atlas";
import type { D } from "./econ";
import type { Bill, Change, Chamber, Election, ElectionResult, Nation, Party, Person, World } from "./state";
import { allocate } from "./setup";
import { ageOf, clamp, dayFor, rngNext, yearOf } from "./util";
import { news } from "./news";
import { personName } from "./names";

/* ------------------------------------------------------------------ support */

export function partiesOf(w: World, n: Nation): Party[] {
  return w.parties.filter((p) => p.nation === n.id && p.alive);
}

function dist(a: readonly number[], b: readonly number[]) {
  let s = 0;
  const W = [1, 1.2, 0.9, 1, 0.8, 1.2];
  for (let i = 0; i < 6; i++) s += W[i] * (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** A group's values in this country (more traditional where religion matters more). */
function groupValues(n: Nation, gi: number): number[] {
  const v = [...GROUPS[gi].v];
  v[0] = clamp(v[0] + (n.relig - 0.5) * 0.9, -1, 1);
  return v;
}

export interface Support {
  /** National vote share by party id. */
  shares: Record<number, number>;
  /** Per group, per party. */
  byGroup: Record<number, number>[];
  turnout: number;
}

/** How each group would vote today. */
export function support(w: World, n: Nation, city = -1, a?: Atlas): Support {
  const ps = partiesOf(w, n);
  const gov = n.pol.gov;
  const shares: Record<number, number> = {};
  const byGroup: Record<number, number>[] = [];
  let tot = 0;
  let turnoutSum = 0;
  let popSum = 0;
  const compulsory = n.pol.constitution.compulsory === "yes";
  const urban = city >= 0 && a ? a.urban[city] : 0.6;
  for (let gi = 0; gi < 18; gi++) {
    const gs = n.groups[gi];
    const gv = groupValues(n, gi);
    const u: number[] = [];
    let best = -Infinity;
    for (const p of ps) {
      let x = -dist(gv, p.v) * 2.1;
      const inGov = gov.includes(p.id);
      x += inGov ? (gs.sat - 50) / 11 : (50 - gs.sat) / 30;
      x += p.national + (city >= 0 ? p.campaign[city] ?? 0 : avgCampaign(p)) * 0.5;
      x += (p.cred - 0.5) * 0.6 + (w.people[p.leader]?.skill ?? 0.5) * 0.5;
      if (p.family === "regional") x += city >= 0 ? (p.home === city ? 2.2 : -1.2) : -0.6;
      if (p.family === "agrarian") x += (1 - urban) * 0.8 - 0.3;
      if (p.family === "ruling" && n.free < 0.4) x += 2.5;
      u.push(x);
      best = Math.max(best, x);
    }
    const ex = u.map((x) => Math.exp((x - best) * 1.6));
    const s = ex.reduce((a2, b) => a2 + b, 0);
    const row: Record<number, number> = {};
    ps.forEach((p, k) => (row[p.id] = ex[k] / s));
    byGroup.push(row);
    const gd = GROUPS[gi];
    let wgt = gs.pop * (city >= 0 ? (gd.urban * urban + (1 - gd.urban) * (1 - urban)) * 2 : 1);
    const turnout = compulsory ? 0.9 : clamp(0.62 + (gd.id === "retirees" ? 0.2 : gd.id === "students" || gd.id === "unemployed" ? -0.18 : gd.id === "investors" || gd.id === "professionals" ? 0.12 : 0) + (gs.mil - 30) / 300, 0.25, 0.95);
    wgt *= turnout;
    turnoutSum += turnout * gs.pop;
    popSum += gs.pop;
    for (const p of ps) shares[p.id] = (shares[p.id] ?? 0) + row[p.id] * wgt;
    tot += wgt;
  }
  for (const k of Object.keys(shares)) shares[+k] /= tot || 1;
  return { shares, byGroup, turnout: popSum ? turnoutSum / popSum : 0.6 };
}
function avgCampaign(p: Party) {
  const v = Object.values(p.campaign);
  return v.length ? v.reduce((a, b) => a + b, 0) / Math.max(4, v.length) : 0;
}

/** Weekly polls. */
export function pollsWeek(w: World, n: Nation) {
  if (n.free < 0.3) return;
  const s = support(w, n);
  for (const p of partiesOf(w, n)) p.poll = s.shares[p.id] ?? 0;
  // Campaign effects fade.
  for (const p of partiesOf(w, n)) {
    p.national *= 0.96;
    for (const k of Object.keys(p.campaign)) {
      p.campaign[+k] *= 0.93;
      if (Math.abs(p.campaign[+k]) < 0.01) delete p.campaign[+k];
    }
  }
}

/* ------------------------------------------------------------------ elections */

const LOWER_SIZE: Record<string, number> = { small: 150, medium: 350, large: 600 };

export function runElection(w: World, a: Atlas, d: D, n: Nation, e: Election): ElectionResult {
  const c = n.pol.constitution;
  const ps = partiesOf(w, n);
  const cities = (d.c.cities[n.id] ?? []).filter((ci) => w.control[ci] === n.id);
  const nat = support(w, n);
  const res: ElectionResult = { day: w.day, kind: e.kind, votes: { ...nat.shares }, seats: {}, turnout: nat.turnout, cities: {} };
  const noise = () => (rngNext(w) - 0.5) * 0.04;
  // City by city (for the map, and for winner-takes-all systems).
  const cityShares = new Map<number, Record<number, number>>();
  for (const ci of cities) {
    const s = support(w, n, ci, a).shares;
    for (const k of Object.keys(s)) s[+k] = Math.max(0, s[+k] + noise());
    cityShares.set(ci, s);
    let best = -1;
    let bv = -1;
    for (const [k, v] of Object.entries(s)) if (v > bv) ((bv = v), (best = +k));
    res.cities[ci] = best;
  }
  if (e.kind === "referendum") {
    const yes = clamp(0.5 + (e.city !== undefined && e.city >= 0 ? w.separatism[e.city] - 0.5 : (n.approval - 50) / 100) + noise() * 3, 0.02, 0.98);
    res.yes = yes;
    return res;
  }
  if (e.kind === "hos") {
    // Leaders of the main parties stand; a runoff if no one has half.
    const ranked = Object.entries(nat.shares).sort((x, y) => y[1] - x[1]);
    let winner = +ranked[0][0];
    if (c.hos_select === "college") {
      const ev: Record<number, number> = {};
      for (const ci of cities) ev[res.cities[ci]] = (ev[res.cities[ci]] ?? 0) + a.map.cities[ci].pop;
      winner = +Object.entries(ev).sort((x, y) => y[1] - x[1])[0][0];
    } else if (ranked[0][1] < 0.5 && ranked.length > 1) {
      const A = +ranked[0][0];
      const B = +ranked[1][0];
      let sa = ranked[0][1];
      let sb = ranked[1][1];
      const pa = w.parties[A];
      const pb = w.parties[B];
      for (const [k, v] of ranked.slice(2)) {
        const p = w.parties[+k];
        if (dist(p.v, pa.v) < dist(p.v, pb.v)) sa += v * 0.8;
        else sb += v * 0.8;
      }
      res.runoff = [A, B, sa / (sa + sb)];
      winner = sa >= sb ? A : B;
    }
    res.winner = winner;
    const wp = w.parties[winner];
    n.leader = wp.leader;
    w.people[wp.leader].role = n.hos;
    n.pol.hosParty = winner;
    if (c.hog === "same") {
      n.hogLeader = wp.leader;
      n.pol.gov = [winner];
    }
    news(w, n.id, `${w.people[wp.leader].name} (${wp.name}) is elected ${n.hos.toLowerCase()} of ${n.name}`, "politics", true);
    scheduleNext(w, n, e);
    return res;
  }
  // Legislature.
  const ch = e.kind === "upper" ? n.pol.upper : n.pol.lower;
  if (!ch) return res;
  if (e.kind === "lower") ch.size = n.pol.pending.lower_size ? LOWER_SIZE[n.pol.pending.lower_size] : ch.size;
  const system = e.kind === "lower" ? c.lower_system : c.lower_system === "appointed" ? "appointed" : "fptp";
  const share = e.share ?? 1;
  const elect = Math.max(1, Math.round(ch.size * share));
  const threshold = +(c.threshold ?? "0") / 100;
  let seats: Record<number, number> = {};
  if (system === "fptp" || system === "two_round" || system === "mixed") {
    const fp: Record<number, number> = {};
    const fptpSeats = system === "mixed" ? Math.round(elect / 2) : elect;
    const totPop = cities.reduce((s2, ci) => s2 + a.map.cities[ci].pop, 0) || 1;
    let given = 0;
    cities.forEach((ci, k) => {
      const nSeats = k === cities.length - 1 ? fptpSeats - given : Math.round((fptpSeats * a.map.cities[ci].pop) / totPop);
      given += nSeats;
      const s = cityShares.get(ci)!;
      for (let q = 0; q < nSeats; q++) {
        let best = -1;
        let bv = -Infinity;
        for (const [pk, v] of Object.entries(s)) {
          const x = v + (rngNext(w) - 0.5) * 0.12;
          if (x > bv) ((bv = x), (best = +pk));
        }
        if (system === "two_round" && bv < 0.5) {
          const top = Object.entries(s).sort((x, y) => y[1] - x[1]).slice(0, 2);
          if (top.length === 2) best = rngNext(w) < top[0][1] / (top[0][1] + top[1][1]) + 0.08 ? +top[0][0] : +top[1][0];
        }
        if (best >= 0) fp[best] = (fp[best] ?? 0) + 1;
      }
    });
    seats = fp;
    if (system === "mixed") {
      const listSeats = elect - fptpSeats;
      const ok = ps.filter((p) => (nat.shares[p.id] ?? 0) >= threshold);
      const pr = allocate(ok.map((p) => p.id), ok.map((p) => nat.shares[p.id]), listSeats, "dhondt");
      for (const [k, v] of Object.entries(pr)) seats[+k] = (seats[+k] ?? 0) + v;
    }
  } else if (system === "appointed") {
    seats = allocate(ps.map((p) => p.id), ps.map((p) => nat.shares[p.id] ?? 0), elect, "appointed");
  } else {
    let ok = ps.filter((p) => (nat.shares[p.id] ?? 0) >= threshold);
    if (!ok.length) ok = ps;
    seats = allocate(ok.map((p) => p.id), ok.map((p) => nat.shares[p.id] ?? 0), elect, "dhondt");
  }
  // Partial renewal: only this share of the chamber changes.
  if (share < 1) {
    const kept: Record<number, number> = {};
    const total = Object.values(ch.seats).reduce((s2, v) => s2 + v, 0) || 1;
    for (const [k, v] of Object.entries(ch.seats)) kept[+k] = Math.round(v * (1 - share));
    for (const [k, v] of Object.entries(seats)) kept[+k] = (kept[+k] ?? 0) + v;
    void total;
    ch.seats = kept;
  } else ch.seats = seats;
  res.seats = { ...ch.seats };
  // Reforms waiting for this election now apply.
  if (e.kind === "lower") {
    for (const [k, v] of Object.entries(n.pol.pending)) n.pol.constitution[k] = v;
    n.pol.pending = {};
    if (c.hog !== "same") formGovernment(w, n);
  }
  scheduleNext(w, n, e);
  const leader = Object.entries(ch.seats).sort((x, y) => y[1] - x[1])[0];
  if (leader) news(w, n.id, `${n.name} votes: ${w.parties[+leader[0]].name} first with ${leader[1]} of ${ch.size} seats in the ${ch.name}`, "politics", n.id === w.actor.nation || n.gdp > 1500);
  // Promises are judged at the next election.
  for (const p of ps) judgePromises(w, n, p);
  return res;
}

function scheduleNext(w: World, n: Nation, e: Election) {
  const c = n.pol.constitution;
  n.pol.elections = n.pol.elections.filter((x) => x !== e);
  let years = 4;
  if (e.kind === "lower") years = +(c.lower_term ?? "4");
  else if (e.kind === "hos") years = c.hos_term === "life" ? 0 : +(c.hos_term ?? "5");
  else if (e.kind === "upper") years = e.share && e.share < 1 ? Math.max(2, Math.round(+(c.lower_term ?? "4") * (e.share < 0.4 ? 0.5 : 1))) : +(c.lower_term ?? "4");
  if (e.kind === "referendum" || years <= 0) return;
  if (e.kind === "upper" && e.share && e.share < 0.4) years = 2;
  n.pol.elections.push({ day: e.day + Math.round(years * 365.25), kind: e.kind, share: e.share });
  n.pol.elections.sort((a2, b) => a2.day - b.day);
}

/** Majority-seeking coalition talks. */
export function formGovernment(w: World, n: Nation) {
  const ch = n.pol.lower;
  const need = Math.floor(ch.size / 2) + 1;
  const ranked = Object.entries(ch.seats).map(([k, v]) => [+k, v] as [number, number]).filter((x) => x[1] > 0 && w.parties[x[0]]).sort((x, y) => y[1] - x[1]);
  if (!ranked.length) return;
  const lead = ranked[0][0];
  const coalition = [lead];
  let seats = ranked[0][1];
  const L = w.parties[lead];
  const partners = ranked.slice(1).sort((x, y) => dist(w.parties[x[0]].v, L.v) - dist(w.parties[y[0]].v, L.v));
  for (const [p, s] of partners) {
    if (seats >= need) break;
    if (w.parties[p].family === "far_right" && !["nationalist", "conservative"].includes(L.family)) continue;
    if (w.parties[p].family === "far_left" && !["left", "soc_dem", "green"].includes(L.family)) continue;
    coalition.push(p);
    seats += s;
  }
  const prev = n.pol.gov.join(",");
  n.pol.gov = coalition;
  n.pol.since = w.day;
  n.pol.talks = coalition.length > 1 ? 5 + Math.round(rngNext(w) * 30) : 0;
  const pm = L.leader;
  n.hogLeader = pm;
  w.people[pm].role = n.hog;
  if (n.form === "parliamentary" || n.form === "const_monarchy") {
    if (n.pol.constitution.hos_select !== "direct") void 0;
  }
  if (prev !== coalition.join(",")) news(w, n.id, `${w.people[pm].name} forms a government in ${n.name}${coalition.length > 1 ? ` with ${coalition.slice(1).map((p) => w.parties[p].name).join(" and ")}` : ""}${seats < need ? " (minority)" : ""}`, "politics", n.id === w.actor.nation);
  reshuffle(w, n);
}

/** Give coalition partners ministries in proportion. */
export function reshuffle(w: World, n: Nation) {
  const gov = n.pol.gov;
  const ports = Object.keys(n.ministers);
  ports.forEach((pt, i) => {
    const party = gov[i % gov.length] ?? -1;
    const id = n.ministers[pt as keyof Nation["ministers"]];
    const p = w.people[id];
    if (p && p.party !== party && party >= 0) p.party = party;
  });
}

/** Is there cohabitation: a head of state from outside the government? */
export function cohabitation(n: Nation) {
  return n.pol.hosParty >= 0 && n.form === "semi" && !n.pol.gov.includes(n.pol.hosParty);
}

/** Seats held by the governing parties. */
export function govSeats(n: Nation, ch: Chamber | null = n.pol.lower) {
  if (!ch) return 0;
  return n.pol.gov.reduce((s, p) => s + (ch.seats[p] ?? 0), 0);
}

/* ------------------------------------------------------------------ bills */

/** How much a party likes a change (−1…1). */
export function stanceOn(w: World, n: Nation, p: Party, ch: Change): number {
  switch (ch.k) {
    case "law": {
      const L = LAW[ch.id];
      const from = L.options.find((o) => o.id === n.laws[ch.id]);
      const to = L.options.find((o) => o.id === ch.to);
      let s = 0;
      for (let k = 0; k < 6; k++) s += p.v[k] * (((to?.v as Record<number, number>)?.[k] ?? 0) - ((from?.v as Record<number, number>)?.[k] ?? 0));
      return clamp(s * 0.9, -1, 1);
    }
    case "const": {
      const small = (p.poll ?? 0) < 0.15;
      if (ch.id === "lower_system") return ch.to === "fptp" ? (small ? -0.8 : 0.4) : ch.to === "appointed" ? -1 : small ? 0.7 : -0.2;
      if (ch.id === "threshold") return small ? -(+ch.to) / 10 : +ch.to / 20;
      if (ch.id === "emergency" || ch.id === "decrees") return ["indefinite", "rule", "broad", "orders"].includes(ch.to) ? -0.6 - p.v[2] * 0.4 : 0.2;
      if (ch.id === "term_limit") return ch.to === "none" ? -0.7 : 0.2;
      if (ch.id === "form") return ch.to === "abs_monarchy" || ch.to === "junta" || ch.to === "one_party" ? -1 : -0.3;
      return (rngNext(w) - 0.5) * 0.4;
    }
    case "tax": {
      const cur = n.tax;
      const t = ch.tax;
      const up = (t.brackets.reduce((s, b) => s + b[1], 0) - cur.brackets.reduce((s, b) => s + b[1], 0)) + (t.vat.standard - cur.vat.standard) * 3 + (t.corporate - cur.corporate) * 2 + (t.socialEmployee - cur.socialEmployee) * 3;
      return clamp(up * (p.v[5] - 0.1) * 4 - Math.abs(up) * 0.5, -1, 1);
    }
    case "spend": {
      const cur = n.spend;
      const s = ch.spend;
      const more = (s.pensionRate - cur.pensionRate) * 3 + (s.uiRate - cur.uiRate) * 2 + (s.childBenefit - cur.childBenefit) * 4 + ((s.socialHousing + s.infrastructure + s.research + s.culture + s.transfers) - (cur.socialHousing + cur.infrastructure + cur.research + cur.culture + cur.transfers)) / Math.max(1, n.gdp) * 30;
      const def = (s.defence - cur.defence) / Math.max(1, n.gdp) * 40 * (p.v[4] - 0.2);
      return clamp(more * p.v[5] + def, -1, 1);
    }
    case "service":
      return clamp(p.v[5] * 0.6, -1, 1);
    case "confidence":
      return n.pol.gov.includes(p.id) ? -1 : 0.6;
    case "war": {
      const leg = (w.wars.find((x) => x.defenders.includes(ch.target))?.legit ?? 40) / 100;
      return clamp(p.v[3] * 0.5 + p.v[4] * 0.5 - 0.6 + leg, -1, 1);
    }
    case "treaty":
    case "org":
      return 0.2 + p.v[2] * 0.2 - p.v[3] * 0.3;
  }
}

export interface Forecast {
  /** Per party: seats, line, and expected yes/no/abstain. */
  parties: { id: number; seats: number; line: "yes" | "no" | "free"; yes: number; no: number; abstain: number }[];
  yes: number;
  no: number;
  abstain: number;
  need: number;
}

/** Vote forecast for a bill in a chamber. */
export function forecast(w: World, n: Nation, bill: Bill, ch: Chamber): Forecast {
  const out: Forecast = { parties: [], yes: 0, no: 0, abstain: 0, need: 0 };
  const gov = n.pol.gov;
  for (const [ks, seats] of Object.entries(ch.seats)) {
    const id = +ks;
    if (!seats) continue;
    const p = w.parties[id];
    let s = bill.changes.reduce((a2, c) => a2 + stanceOn(w, n, p, c), 0) / Math.max(1, bill.changes.length);
    const govBill = gov.includes(bill.by);
    if (bill.kind !== "confidence") s += gov.includes(id) ? (govBill ? 0.55 : -0.2) : govBill ? -0.3 : bill.by === id ? 0.8 : -0.05;
    s += bill.sway[id] ?? 0;
    // Your party votes how you tell it.
    const forced = id === w.actor.party && bill.sway[-1 - id] !== undefined ? bill.sway[-1 - id] : null;
    const line: "yes" | "no" | "free" = forced !== null ? (forced > 0 ? "yes" : forced < 0 ? "no" : "free") : s > 0.08 ? "yes" : s < -0.08 ? "no" : "free";
    const whip = p.whip;
    let yes: number;
    let no: number;
    if (line === "yes") {
      yes = seats * (whip + (1 - whip) * clamp(0.5 + s, 0, 1));
      no = seats - yes;
    } else if (line === "no") {
      no = seats * (whip + (1 - whip) * clamp(0.5 - s, 0, 1));
      yes = seats - no;
    } else {
      yes = seats * clamp(0.5 + s * 2, 0, 1);
      no = seats - yes;
    }
    const abstain = Math.min(yes, no) * 0.15;
    yes -= abstain / 2;
    no -= abstain / 2;
    out.parties.push({ id, seats, line, yes, no, abstain });
    out.yes += yes;
    out.no += no;
    out.abstain += abstain;
  }
  out.need = needFor(n, bill, ch);
  return out;
}

function needFor(n: Nation, bill: Bill, ch: Chamber) {
  if (bill.kind === "constitution" && n.pol.constitution.amend !== "simple") return Math.ceil((ch.size * 2) / 3);
  return Math.floor(ch.size / 2) + 1;
}

/** Put a bill to parliament (or decree it, where the constitution lets the ruler). */
export function propose(w: World, n: Nation, title: string, changes: Change[], kind: Bill["kind"], by: number, opposition = false): Bill {
  const debate = kind === "constitution" ? 21 : kind === "budget" ? 10 : 7;
  const bill: Bill = { id: w.ids++, title, changes, by, vote: w.day + debate, stage: "debate", sway: {}, kind, opposition };
  if (rulesByDecree(n) && !opposition) {
    applyBill(w, n, bill);
    bill.stage = "passed";
    bill.note = "By decree";
    n.pol.bills.push(bill);
    return bill;
  }
  n.pol.bills.push(bill);
  if (n.id === w.actor.nation) news(w, n.id, `Bill: ${title} (vote ${debate} days)`, "politics");
  return bill;
}

/** Rulers who don't need parliament. */
export function rulesByDecree(n: Nation) {
  const c = n.pol.constitution;
  return c.decrees === "rule" || n.form === "abs_monarchy" || n.form === "junta" || n.form === "one_party" || n.pol.emergency > 0;
}

/** Advance bills: votes, the upper house, the executive, the courts. */
export function billsDay(w: World, n: Nation) {
  const c = n.pol.constitution;
  for (const b of n.pol.bills) {
    if (b.stage === "passed" || b.stage === "failed" || b.stage === "vetoed" || b.stage === "struck") continue;
    if (w.day < b.vote) continue;
    if (b.stage === "debate") {
      const f = forecast(w, n, b, n.pol.lower);
      const yes = Math.round(f.yes);
      const no = Math.round(f.no);
      b.result = { yes, no, abstain: Math.round(f.abstain) };
      if (yes >= f.need) {
        b.stage = n.pol.upper && c.upper_powers !== "advisory" && b.kind !== "confidence" ? "upper" : "executive";
        b.vote = w.day + (b.stage === "upper" ? 7 : 1);
      } else {
        b.stage = "failed";
        news(w, n.id, `${n.pol.lower.name} rejects "${b.title}" ${yes}–${no}`, "politics", n.id === w.actor.nation);
        if (b.kind === "confidence") void 0;
      }
      if (b.kind === "confidence" && b.stage !== "failed") {
        b.stage = "passed";
        news(w, n.id, `Government of ${n.name} falls in a no-confidence vote, ${yes}–${no}`, "politics", true);
        governmentFalls(w, n, b);
      }
      continue;
    }
    if (b.stage === "upper" && n.pol.upper) {
      const f = forecast(w, n, b, n.pol.upper);
      if (f.yes >= f.need || c.upper_powers === "delay") {
        if (f.yes < f.need && c.upper_powers === "delay" && !b.note) {
          b.note = "Delayed by the upper house";
          b.vote = w.day + 30;
          continue;
        }
        b.stage = "executive";
        b.vote = w.day + 1;
      } else {
        b.stage = "failed";
        news(w, n.id, `${n.pol.upper.name} blocks "${b.title}"`, "politics", n.id === w.actor.nation);
      }
      continue;
    }
    if (b.stage === "executive") {
      // The head of state may veto a bill from outside their camp.
      const hosP = n.pol.hosParty >= 0 ? w.parties[n.pol.hosParty] : null;
      const veto = c.veto ?? "none";
      const playerIsHos = n.id === w.actor.nation && w.actor.role === "government" && n.pol.hosParty === w.actor.party;
      if (veto !== "none" && hosP && !playerIsHos && !b.note?.startsWith("Override")) {
        const s = b.changes.reduce((a2, ch) => a2 + stanceOn(w, n, hosP, ch), 0) / Math.max(1, b.changes.length);
        if (s < -0.25 && b.by !== hosP.id) {
          b.stage = "vetoed";
          news(w, n.id, `${n.hos} vetoes "${b.title}"`, "politics", n.id === w.actor.nation);
          if (veto !== "absolute") {
            const f = forecast(w, n, b, n.pol.lower);
            const need = veto === "qualified" ? (n.pol.lower.size * 2) / 3 : n.pol.lower.size / 2;
            if (f.yes > need) {
              b.stage = "review";
              b.note = "Override: veto overturned";
              b.vote = w.day + 1;
            }
          }
          continue;
        }
      }
      b.stage = "review";
      b.vote = w.day + (c.review === "council" ? 10 : 1);
      continue;
    }
    if (b.stage === "review") {
      const struck = courtStrikes(w, n, b);
      if (struck) {
        b.stage = "struck";
        b.note = struck;
        news(w, n.id, `Court strikes down "${b.title}": ${struck}`, "politics", n.id === w.actor.nation);
        continue;
      }
      if (b.kind === "constitution" && c.amend === "referendum") {
        const yes = clamp(0.5 + (n.approval - 50) / 120 + (rngNext(w) - 0.5) * 0.2, 0.05, 0.95);
        if (yes < 0.5) {
          b.stage = "failed";
          b.note = `Referendum: ${Math.round(yes * 100)}% yes`;
          news(w, n.id, `Voters reject "${b.title}" (${Math.round(yes * 100)}% yes)`, "politics", true);
          continue;
        }
        b.note = `Referendum: ${Math.round(yes * 100)}% yes`;
      }
      applyBill(w, n, b);
      b.stage = "passed";
      news(w, n.id, `Passed: ${b.title}`, "politics", n.id === w.actor.nation);
    }
  }
  if (n.pol.bills.length > 60) n.pol.bills.splice(0, n.pol.bills.length - 60);
}

/** Judges strike down laws that break entrenched rights. */
function courtStrikes(w: World, n: Nation, b: Bill): string | null {
  const c = n.pol.constitution;
  if (c.review === "none" || c.rights !== "full") return null;
  for (const ch of b.changes) {
    if (ch.k === "law") {
      const opt = LAW[ch.id].options.find((o) => o.id === ch.to);
      if (opt?.rights && rngNext(w) < 0.75) return `${LAW[ch.id].name}: ${opt.name.toLowerCase()} breaks the bill of rights`;
    }
    if (ch.k === "const" && (ch.id === "rights" && ch.to === "none") && b.kind !== "constitution") return "rights can only be removed by amendment";
  }
  return null;
}

/** Make a passed bill law. */
export function applyBill(w: World, n: Nation, b: Bill) {
  for (const ch of b.changes) applyChange(w, n, ch);
}

export function applyChange(w: World, n: Nation, ch: Change) {
  switch (ch.k) {
    case "law":
      n.laws[ch.id] = ch.to;
      break;
    case "const": {
      const def = CONST[ch.id];
      if (def?.nextElection) n.pol.pending[ch.id] = ch.to;
      else n.pol.constitution[ch.id] = ch.to;
      if (ch.id === "central_bank") n.cbIndependent = ch.to === "independent";
      break;
    }
    case "tax":
      n.tax = structuredClone(ch.tax);
      break;
    case "spend":
      n.spend = { ...ch.spend };
      break;
    case "service": {
      const sv = n.services[ch.id];
      if (ch.pay !== undefined) sv.pay = ch.pay;
      if (ch.places !== undefined) sv.places = ch.places;
      if (ch.supply !== undefined) sv.supply = ch.supply;
      break;
    }
    default:
      break;
  }
}

function governmentFalls(w: World, n: Nation, b: Bill) {
  const c = n.pol.constitution;
  const by = b.changes.find((x) => x.k === "confidence") as { k: "confidence"; party: number } | undefined;
  if (c.dissolution !== "none" && (c.no_confidence !== "constructive" || !by)) {
    callElection(w, n, 40);
    return;
  }
  // Constructive: the motion's party tries to form a government.
  if (by) {
    const ch = n.pol.lower;
    const L = w.parties[by.party];
    const coalition = [L.id];
    let seats = ch.seats[L.id] ?? 0;
    const need = Math.floor(ch.size / 2) + 1;
    const others = Object.keys(ch.seats).map(Number).filter((p) => p !== L.id && !n.pol.gov.includes(p)).sort((x, y) => dist(w.parties[x].v, L.v) - dist(w.parties[y].v, L.v));
    for (const p of others) {
      if (seats >= need) break;
      coalition.push(p);
      seats += ch.seats[p] ?? 0;
    }
    n.pol.gov = coalition;
    n.hogLeader = L.leader;
    n.pol.since = w.day;
    reshuffle(w, n);
  }
}

/** An early election in `days`. */
export function callElection(w: World, n: Nation, days = 40) {
  n.pol.elections = n.pol.elections.filter((e) => e.kind !== "lower");
  n.pol.elections.push({ day: w.day + days, kind: "lower", early: true });
  n.pol.elections.sort((a2, b) => a2.day - b.day);
  news(w, n.id, `Early election called in ${n.name}`, "politics", n.id === w.actor.nation);
}

/** Can a no-confidence motion be tabled? */
export function canNoConfidence(n: Nation) {
  return n.pol.constitution.no_confidence !== "none" && n.pol.constitution.hog !== "same";
}

/* ------------------------------------------------------------------ elections due */

export function electionsDay(w: World, a: Atlas, d: D, n: Nation): ElectionResult | null {
  const e = n.pol.elections[0];
  if (!e || e.day > w.day) return null;
  const res = runElection(w, a, d, n, e);
  n.pol.results.push(res);
  if (n.pol.results.length > 12) n.pol.results.shift();
  return res;
}

/* ------------------------------------------------------------------ your party */

export function fundsDay(w: World, n: Nation) {
  for (const p of partiesOf(w, n)) {
    const pub = n.pol.constitution.finance === "public" ? n.gdp * 0.000002 * p.poll * 1000 : 0;
    const donations = n.gdp * 0.0000005 * 1000 * p.poll * (p.family === "conservative" || p.family === "liberal" ? 1.4 : 1) * (n.pol.constitution.finance === "unlimited" ? 2 : 1);
    const members = p.activists * 0.00002;
    p.funds += (pub + donations + members) / 365;
  }
}

export type CampaignAction = "rally" | "ads" | "fundraise" | "recruit" | "canvass";

/** A campaign action by a party. Returns what it did. */
export function campaign(w: World, a: Atlas, n: Nation, p: Party, act: CampaignAction, city = -1): string {
  const scale = Math.max(0.2, n.gdp / 1000);
  if (act === "fundraise") {
    const got = scale * (0.5 + p.poll * 6) * (0.6 + rngNext(w) * 0.8);
    p.funds += got;
    p.cred = Math.max(0, p.cred - 0.005);
    return `Raised $${got.toFixed(1)}m from donors`;
  }
  if (act === "recruit") {
    const cost = scale * 0.6;
    if (p.funds < cost) return "Not enough money";
    p.funds -= cost;
    const got = Math.round(n.pop * 0.00003 * (0.5 + p.poll * 3));
    p.activists += got;
    return `${got.toLocaleString()} new activists`;
  }
  if (act === "ads") {
    const cost = scale * 2;
    if (p.funds < cost) return "Not enough money";
    p.funds -= cost;
    p.national += 0.12;
    return "National ad campaign running";
  }
  if (act === "rally" || act === "canvass") {
    const c = city >= 0 ? city : n.capital;
    const need = act === "rally" ? n.pop * 0.00001 : n.pop * 0.00002;
    if (p.activists < need) return "Not enough activists";
    if (act === "rally") p.funds -= scale * 0.3;
    p.campaign[c] = (p.campaign[c] ?? 0) + (act === "rally" ? 0.45 : 0.3) * (0.6 + (w.people[p.leader]?.skill ?? 0.5));
    for (const nb of a.map.cities[c].near) if (w.owner[nb] === n.id) p.campaign[nb] = (p.campaign[nb] ?? 0) + 0.12;
    return `${act === "rally" ? "Rally" : "Door-knocking"} in ${a.map.cities[c].name}`;
  }
  return "";
}

/** The measure a promise is judged by, now. */
export function promiseValue(w: World, d: D, n: Nation, id: PromiseId): number {
  switch (id) {
    case "unemployment":
      return n.unemp;
    case "inflation":
      return n.inflation;
    case "deficit":
      return -d.budget[n.id].balance / Math.max(1, n.gdp);
    case "growth":
      return n.growth;
    case "health":
      return n.services.health.quality;
    case "homes":
      return n.housing.rent;
    case "tax":
      return d.budget[n.id].revenue / Math.max(1, n.gdp);
    case "power":
      return d.elec[n.id].served;
    case "emissions":
      return n.emissions;
    case "peace":
      return w.wars.some((x) => !x.over && (x.attackers.includes(n.id) || x.defenders.includes(n.id))) ? 1 : 0;
    case "crime":
      return n.crime;
    case "migration":
      return n.migIn[0] + n.migIn[1] + n.migIn[2] - n.migOut[0] - n.migOut[1] - n.migOut[2];
  }
}

/** Is a promise kept? */
export function promiseKept(id: PromiseId, base: number, now: number): boolean {
  switch (id) {
    case "unemployment":
      return now < 0.05;
    case "inflation":
      return now < 0.03;
    case "deficit":
      return now <= 0.005;
    case "growth":
      return now > 0.025;
    case "health":
      return now > 0.95;
    case "homes":
      return now <= base * 0.95;
    case "tax":
      return now <= base + 0.005;
    case "power":
      return now > 0.995;
    case "emissions":
      return now <= base * 0.9;
    case "peace":
      return now === 0;
    case "crime":
      return now <= base * 0.9;
    case "migration":
      return Math.abs(now) <= Math.abs(base) * 0.5;
  }
}

export function makePromise(w: World, d: D, n: Nation, p: Party, id: PromiseId): string {
  if (p.promises.length >= 3) return "Three promises at most";
  if (p.promises.some((x) => x.id === id)) return "Already promised";
  p.promises.push({ id, base: promiseValue(w, d, n, id), made: w.day });
  p.national += 0.06 * p.cred;
  return `Promised: ${PROMISES.find((x) => x.id === id)!.name}`;
}

function judgePromises(w: World, n: Nation, p: Party) {
  if (!p.promises.length) return;
  if (!n.pol.gov.includes(p.id)) return;
  // Judged on the record at the election.
  const dd = derivedFor(w);
  if (!dd) return;
  let kept = 0;
  for (const pr of p.promises) if (promiseKept(pr.id, pr.base, promiseValue(w, dd, n, pr.id))) kept++;
  const broken = p.promises.length - kept;
  p.cred = clamp(p.cred + kept * 0.08 - broken * 0.14, 0.05, 1);
  if (n.id === w.actor.nation) news(w, n.id, `${p.name} kept ${kept} of ${p.promises.length} promises: credibility ${Math.round(p.cred * 100)}%`, "politics", true);
  p.promises = [];
}
let DERIVED: D | null = null;
export function setDerived(d: D) {
  DERIVED = d;
}
function derivedFor(w: World) {
  void w;
  return DERIVED;
}

/* ------------------------------------------------------------------ people */

/** Leaders age; some die; the constitution says who takes over. */
export function peopleMonth(w: World, n: Nation) {
  const ids = [n.leader, n.hogLeader, n.heir, n.regent].filter((x) => x >= 0);
  for (const id of new Set(ids)) {
    const p = w.people[id];
    if (!p?.alive) continue;
    const age = ageOf(p.born, w.day);
    const pDie = (0.004 * Math.exp((age - 60) / 8.5)) / Math.max(0.3, p.health) / 12;
    p.health = clamp(p.health - (age > 70 ? 0.002 : 0.0005) + (rngNext(w) - 0.5) * 0.01, 0.1, 1);
    if (rngNext(w) < pDie) die(w, n, p);
  }
  // Regents hand over at 18.
  if (n.regent >= 0 && n.leader >= 0 && ageOf(w.people[n.leader].born, w.day) >= 18) {
    news(w, n.id, `${w.people[n.leader].name} comes of age and rules in their own right`, "politics", n.id === w.actor.nation);
    n.regent = -1;
  }
}

export function die(w: World, n: Nation, p: Person) {
  p.alive = false;
  news(w, n.id, `${p.name}, ${p.role ?? ""} of ${n.name}, has died aged ${Math.floor(ageOf(p.born, w.day))}`, "politics", true);
  if (p.id === n.leader) succession(w, n);
  if (p.id === n.hogLeader && n.hogLeader !== n.leader) {
    const party = w.parties.find((x) => x.leader === p.id);
    const next = newLeader(w, n, party);
    n.hogLeader = next;
  }
  if (p.id === n.heir) n.heir = -1;
  for (const party of w.parties) if (party.leader === p.id) party.leader = newLeader(w, n, party);
}

function newLeader(w: World, n: Nation, party?: Party): number {
  const id = w.people.length;
  w.people.push({ id, name: personName(n.culture, rngNext(w) < 0.35, () => rngNext(w)), female: false, born: w.day - Math.round((45 + rngNext(w) * 20) * 365), nation: n.id, party: party?.id ?? -1, skill: 0.4 + rngNext(w) * 0.5, loyalty: 0.6, health: 0.9, alive: true, role: party ? `Leader of the ${party.name}` : "" });
  if (party) party.leader = id;
  return id;
}

/** Who takes over when the head of state goes. */
export function succession(w: World, n: Nation) {
  const c = n.pol.constitution;
  if (c.succession === "heir" || n.form === "abs_monarchy" || n.form === "const_monarchy") {
    let heir = n.heir >= 0 && w.people[n.heir]?.alive ? n.heir : -1;
    if (heir < 0) {
      const kids = w.people.filter((q) => q.royal && q.alive && q.nation === n.id && q.id !== n.leader);
      heir = kids.sort((x, y) => x.born - y.born)[0]?.id ?? -1;
    }
    if (heir < 0) heir = newLeader(w, n);
    n.leader = heir;
    w.people[heir].role = n.hos;
    w.people[heir].royal = true;
    n.heir = -1;
    const age = ageOf(w.people[heir].born, w.day);
    if (age < 18) {
      n.regent = newLeader(w, n);
      w.people[n.regent].role = "Regent";
      news(w, n.id, `${w.people[heir].name}, aged ${Math.floor(age)}, is the new ${n.hos.toLowerCase()}; a regent will rule until they're 18`, "politics", true);
    } else news(w, n.id, `${w.people[heir].name} succeeds to the throne of ${n.name}`, "politics", true);
    // A new heir: the eldest of the new monarch's children, if any.
    const child = w.people.find((q) => q.parent === heir && q.alive);
    n.heir = child ? child.id : -1;
    if (n.heir < 0 && age > 25) {
      const k = newLeader(w, n);
      w.people[k].born = w.day - Math.round((age - 27) * 365);
      w.people[k].royal = true;
      w.people[k].parent = heir;
      w.people[k].role = "Heir";
      n.heir = k;
    }
    if (n.hogLeader === -1 || n.form === "abs_monarchy") n.hogLeader = n.leader;
    return;
  }
  // Republics.
  const gov = w.parties[n.pol.hosParty >= 0 ? n.pol.hosParty : n.pol.gov[0]];
  const next = newLeader(w, n, undefined);
  w.people[next].party = gov?.id ?? -1;
  w.people[next].role = n.hos;
  n.leader = next;
  if (c.hog === "same") n.hogLeader = next;
  if (gov) gov.leader = next;
  if (c.succession === "interim" || c.succession === "speaker") n.pol.elections.push({ day: w.day + 90, kind: "hos" });
  n.pol.elections.sort((a2, b) => a2.day - b.day);
  news(w, n.id, `${w.people[next].name} becomes ${n.hos.toLowerCase()} of ${n.name}`, "politics", true);
}

/** A leadership contest in a party: does the challenger win? */
export function challenge(w: World, n: Nation, party: Party, skill: number): boolean {
  const incumbent = w.people[party.leader];
  const unrest = clamp((0.3 - party.poll) * 2 + (n.pol.gov.includes(party.id) ? (50 - n.approval) / 50 : 0.2), -0.5, 1);
  const chance = clamp(0.25 + unrest * 0.4 + (skill - (incumbent?.skill ?? 0.5)) * 0.6, 0.05, 0.9);
  return rngNext(w) < chance;
}

/** Schedule what a constitution change to elections means (e.g. a new upper house). */
export function upperFromConstitution(w: World, n: Nation) {
  const c = n.pol.constitution;
  if (c.upper === "none") {
    n.pol.upper = null;
    n.pol.elections = n.pol.elections.filter((e) => e.kind !== "upper");
    return;
  }
  if (!n.pol.upper) {
    const size = Math.max(30, Math.round(n.pol.lower.size / 4));
    n.pol.upper = { name: "Senate", size, seats: { ...scaleSeats(n.pol.lower.seats, size) } };
  }
  if (c.upper === "thirds" || c.upper === "halves" || c.upper === "elected") {
    if (!n.pol.elections.some((e) => e.kind === "upper")) n.pol.elections.push({ day: w.day + 365, kind: "upper", share: c.upper === "thirds" ? 1 / 3 : c.upper === "halves" ? 0.5 : 1 });
  }
}
function scaleSeats(seats: Record<number, number>, size: number) {
  const tot = Object.values(seats).reduce((a2, b) => a2 + b, 0) || 1;
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(seats)) out[+k] = Math.round((v / tot) * size);
  return out;
}

/** The year of the next election of a kind. */
export function nextElection(n: Nation, kind: Election["kind"]) {
  return n.pol.elections.find((e) => e.kind === kind);
}

export { dayFor, yearOf, CONSTITUTION, FAMILIES, LAWS };
