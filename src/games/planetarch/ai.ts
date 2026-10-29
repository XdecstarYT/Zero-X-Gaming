/**
 * The other governments. Each month every country the player isn't running looks at its own
 * agenda and acts the way a cautious government would: keeps the deficit in check, pays its
 * nurses when they quit, builds power plants when the lights go out, settles strikes it can
 * afford, polices protests by its nature, sets its armies' directives by the odds, and makes or
 * refuses peace by how the war is going. Governing parties put bills to their parliaments.
 */
import { LAWS, PLANTS, SERVICES, type PlantType } from "./data";
import type { Atlas } from "./atlas";
import type { D } from "./econ";
import { refreshCaches } from "./econ";
import type { Nation, War, World } from "./state";
import { clamp, rngNext } from "./util";
import { answerProtest, answerStrike, atWar } from "./society";
import { forecast, propose, rulesByDecree, partiesOf, stanceOn } from "./politics";
import { landPower, makePeace, peaceAppeal, setDirective, sideOf, warSupport } from "./war";
import { fieldLevel } from "./progress";
import { news } from "./news";

/** Daily: answer strikes at their deadline and protests on their first day. */
export function aiDay(w: World, d: D, n: Nation) {
  if (n.id === w.actor.nation && w.actor.role === "government") return;
  for (const st of w.strikes) {
    if (st.nation !== n.id || st.settled || st.started || w.day < st.deadline - 1) continue;
    const def = -d.budget[n.id].balance / Math.max(1, n.gdp);
    const how = n.free < 0.3 ? "ban" : def > 0.06 ? (rngNext(w) < 0.5 ? "half" : "refuse") : st.demand <= 6 ? "accept" : "half";
    answerStrike(w, n, st, how);
  }
  for (const p of w.protests) {
    if (p.nation !== n.id || p.over || p.response) continue;
    const how = n.free > 0.7 ? (p.size > n.pop * 0.002 ? "contain" : "facilitate") : n.free > 0.35 ? "contain" : p.size > n.pop * 0.003 ? "crackdown" : "disperse";
    answerProtest(w, n, p, how);
  }
}

/** Monthly: budget, services, energy, laws, war. */
export function aiMonth(w: World, a: Atlas, d: D, n: Nation) {
  const playing = n.id === w.actor.nation && w.actor.role === "government";
  if (!playing) {
    budget(w, d, n);
    services(n);
    energy(w, a, d, n);
    if (rngNext(w) < 0.08) lawBill(w, n);
  }
  wars(w, a, d, n, playing);
}

function budget(w: World, d: D, n: Nation) {
  const b = d.budget[n.id];
  const def = -b.balance / Math.max(1, n.gdp);
  const target = n.market ? 0.03 : 0.01;
  const t = n.tax;
  const s = n.spend;
  if (def > target + 0.01) {
    // Cut a little and raise a little.
    s.transfers *= 0.97;
    s.infrastructure *= 0.98;
    if (def > target + 0.03) t.vat.standard = clamp(t.vat.standard + 0.005, 0, 0.27);
    if (def > target + 0.05) t.brackets = t.brackets.map(([x, r]) => [x, clamp(r + 0.005, 0, 0.6)] as [number, number]);
  } else if (def < target - 0.02 && n.approval < 55) {
    s.transfers += n.gdp * 0.002;
    s.infrastructure += n.gdp * 0.001;
  }
  if (!n.market && n.fxReserves < n.gdp * 0.02 && !n.imf && n.orgs.includes("imf")) {
    n.imf = { tranches: 4, next: w.day + 90, target: 0.03, amount: n.gdp * 0.0075 };
    n.fxReserves += n.gdp * 0.0075;
    news(w, n.id, `${n.name} turns to the IMF`, "economy", n.gdp > 300);
  }
  // Defence: keep the envelope near what upkeep needs, more at war.
  const want = atWar(w, n.id) ? n.gdp * 0.06 : n.spend.defence;
  s.defence = s.defence + (want - s.defence) * 0.1;
  if (n.policyRate > 0.4) n.policyRate = 0.4;
}

function services(n: Nation) {
  for (const sd of SERVICES) {
    const sv = n.services[sd.id];
    if (sv.limit.startsWith("Short of staff")) {
      sv.places *= 1.04;
      sv.pay = Math.min(sd.pay * 1.25, sv.pay * 1.01);
    }
    if (sv.limit === "Short of supplies") sv.supply = Math.min(1.5, sv.supply * 1.05);
  }
}

function energy(w: World, a: Atlas, d: D, n: Nation) {
  const e = d.elec[n.id];
  const building = w.plants.some((p) => p.nation === n.id && p.ready > w.day);
  if (building || e.demand <= 0) return;
  const margin = e.gen / Math.max(1, e.demand);
  if (margin > 1.02) return;
  const gap = Math.max(e.demand * 0.06, e.demand - e.gen);
  const rich = n.gdp / Math.max(1, n.pop) > 2e-5;
  const coal = n.sectors[3].out > 1;
  const gas = n.sectors[4].out > 2;
  const type: PlantType = rich ? (rngNext(w) < 0.5 ? "solar" : "wind") : coal ? "coal" : gas ? "gas" : "solar";
  const def = PLANTS[type];
  const gw = gap / (8.76 * def.cf);
  const city = n.capital >= 0 ? n.capital : a.nationCities[n.id][0];
  if (city === undefined) return;
  w.plants.push({ id: w.plants.length, nation: n.id, city, type, gw, damage: 0, ready: w.day + def.days, state: true });
  n.debt += gw * def.cost;
  refreshCaches(w, a, d);
}

/** Governing parties sometimes push a law they believe in. */
function lawBill(w: World, n: Nation) {
  const lead = w.parties[n.pol.gov[0]];
  if (!lead) return;
  let best: { id: string; to: string; s: number } | null = null;
  for (const L of LAWS) {
    for (const o of L.options) {
      if (o.id === n.laws[L.id]) continue;
      const s = stanceOn(w, n, lead, { k: "law", id: L.id, to: o.id });
      if (!best || s > best.s) best = { id: L.id, to: o.id, s };
    }
  }
  if (!best || best.s < 0.35) return;
  const L = LAWS.find((x) => x.id === best!.id)!;
  const opt = L.options.find((o) => o.id === best!.to)!;
  const bill = propose(w, n, `${L.name}: ${opt.name}`, [{ k: "law", id: L.id, to: opt.id }], "law", lead.id);
  if (!rulesByDecree(n)) {
    const f = forecast(w, n, bill, n.pol.lower);
    if (f.yes < f.need * 0.9) bill.stage = "failed";
  }
}

function wars(w: World, a: Atlas, d: D, n: Nation, playing: boolean) {
  for (const war of w.wars) {
    if (war.over) continue;
    const side = sideOf(war, n.id);
    if (side < 0) continue;
    const leader = (side === 0 ? war.attackers : war.defenders)[0] === n.id;
    if (!leader) continue;
    if (!playing) directives(w, war, side as 0 | 1);
    if (war.actor !== undefined) continue;
    // Peace: offered by whoever is losing, accepted by whoever likes the terms.
    const other = (1 - side) as 0 | 1;
    const otherLeader = (other === 0 ? war.attackers : war.defenders)[0];
    if (!playing && warSupport(w, war, n.id) < 22 && !war.offer && w.day - war.start > 120) {
      war.offer = { from: side as 0 | 1, terms: side === 0 ? "white" : "ceasefire", day: w.day };
    }
    if (war.offer && war.offer.from === other && !(otherLeader === w.actor.nation && n.id === w.actor.nation) && !playing) {
      if (peaceAppeal(w, war, side as 0 | 1, war.offer.terms) > 0.2) makePeace(w, a, d, war, war.offer.terms);
      else war.offer = undefined;
    }
  }
}

/** Set each theatre's directive by the local odds. */
export function directives(w: World, war: War, side: 0 | 1) {
  const mine = (side === 0 ? war.attackers : war.defenders).reduce((s, id) => s + landPower(w.nations[id]), 0);
  const theirs = (side === 0 ? war.defenders : war.attackers).reduce((s, id) => s + landPower(w.nations[id]), 0) + (side === 1 && war.actor !== undefined ? w.actors[war.actor].strength * 12 : 0);
  const ratio = mine / Math.max(1, theirs);
  const lead = w.nations[(side === 0 ? war.attackers : war.defenders)[0]];
  war.theatres.forEach((t, i) => {
    const dir = lead.mil.ammo < 8 ? "hold" : side === 0 ? (ratio > 1.3 ? (i === 0 ? "major" : "limited") : "limited") : ratio > 1.5 ? "limited" : "hold";
    setDirective(war, side, i, dir);
  });
}

/** Opposition parties in AI countries call no-confidence votes when governments are weak. */
export function oppositionMonth(w: World, n: Nation) {
  if (n.free < 0.4 || n.pol.constitution.no_confidence === "none" || n.pol.constitution.hog === "same") return;
  if (n.approval > 33 || rngNext(w) > 0.15) return;
  const opp = partiesOf(w, n).filter((p) => !n.pol.gov.includes(p.id)).sort((x, y) => (n.pol.lower.seats[y.id] ?? 0) - (n.pol.lower.seats[x.id] ?? 0))[0];
  if (!opp || opp.id === w.actor.party) return;
  propose(w, n, `No confidence in the government`, [{ k: "confidence", party: opp.id }], "confidence", opp.id, true);
}

export { fieldLevel };
