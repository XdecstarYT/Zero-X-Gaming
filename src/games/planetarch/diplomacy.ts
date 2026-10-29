/**
 * The world stage: relations that drift with what countries do to each other, treaties that
 * have to be accepted, sanctions, tariff disputes, the organisations and their votes (the
 * Security Council's vetoes, the EU's qualified majority, OPEC's quotas, the IMF's tranches,
 * IAEA inspections), crises that escalate move by move, intelligence networks and operations,
 * coups, and the Cablegram: messages to other countries' leaders and to party leaders at home,
 * answered in a day or three.
 */
import { EU_CANDIDATES, GOOD_INDEX, ORGS, P5, type OrgId } from "./data";
import type { Atlas } from "./atlas";
import type { D } from "./econ";
import type { Cable, Crisis, Nation, Resolution, Treaty, World } from "./state";
import { clamp, rngNext } from "./util";
import { news } from "./news";
import { forecast, partiesOf } from "./politics";

/* ------------------------------------------------------------------ relations */

export function rel(w: World, a: number, b: number) {
  return w.nations[a].rel[b] ?? 0;
}
export function nudge(w: World, a: number, b: number, v: number) {
  if (a === b || a < 0 || b < 0) return;
  const x = clamp((w.nations[a].rel[b] ?? 0) + v, -100, 100);
  w.nations[a].rel[b] = x;
  w.nations[b].rel[a] = x;
}

/** Monthly: relations ease toward what interests and ties suggest. */
export function relationsMonth(w: World) {
  const N = w.nations.length;
  for (let i = 0; i < N; i++) {
    const a = w.nations[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < N; j++) {
      const b = w.nations[j];
      if (!b.alive) continue;
      let pull = 0;
      if (a.orgs.includes("eu") && b.orgs.includes("eu")) pull += 0.3;
      if (a.orgs.includes("nato") && b.orgs.includes("nato")) pull += 0.2;
      const cur = a.rel[j];
      // Slow memory: drift a little toward neutral-plus-ties.
      const target = 10 + pull * 100;
      const v = cur + (target - cur) * 0.004;
      a.rel[j] = b.rel[i] = v;
    }
  }
  for (const t of w.treaties) {
    const v = t.kind === "defence" ? 0.6 : t.kind === "aid" || t.kind === "milaid" ? 0.5 : 0.2;
    nudge(w, t.a, t.b, v);
  }
  for (const s of w.sanctions) nudge(w, s.by, s.on, -0.4 * s.level);
  for (const x of w.wars) {
    if (x.over) continue;
    for (const p of x.attackers) for (const q of x.defenders) nudge(w, p, q, -1);
  }
}

/* ------------------------------------------------------------------ treaties */

export const TREATY_INFO: Record<Treaty["kind"], { name: string; icon: string; text: string }> = {
  defence: { name: "Defence pact", icon: "🛡️", text: "Each promises to come to the other's aid if attacked. Each still decides when the time comes." },
  guarantee: { name: "Security guarantee", icon: "🤝", text: "One side guarantees the other's independence." },
  nonaggression: { name: "Non-aggression pact", icon: "🕊️", text: "Neither will attack the other." },
  access: { name: "Military access", icon: "🚪", text: "Forces may cross each other's territory." },
  intel: { name: "Intelligence sharing", icon: "🛰️", text: "Pool networks: both see what either learns." },
  base: { name: "Military base", icon: "🏴", text: "A base on the other's soil: faster deployment, rent paid." },
  milaid: { name: "Military aid", icon: "📦", text: "Weapons and ammunition each year." },
  aid: { name: "Civilian aid", icon: "💶", text: "Budget support each year." },
  trade: { name: "Trade agreement", icon: "🚢", text: "No tariffs between the two." },
  research: { name: "Research co-operation", icon: "🔬", text: "Share a third of each other's research." },
  ceasefire: { name: "Ceasefire", icon: "🏳️", text: "Fighting stops along the line; the war isn't over." },
  armistice: { name: "Armistice", icon: "📜", text: "The war ends; the line stays." },
  charter: { name: "Lunar charter", icon: "🌙", text: "Rules for the Moon." },
  energy: { name: "Power interconnector", icon: "🔌", text: "A cable that lets each sell spare electricity to the other." },
};

export function hasTreaty(w: World, a: number, b: number, kind: Treaty["kind"]) {
  return w.treaties.some((t) => t.kind === kind && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
}

/** Would `to` accept this treaty from `from`? Score and reason. */
export function treatyAppeal(w: World, from: number, to: number, kind: Treaty["kind"], amount = 0): [number, string] {
  const A = w.nations[from];
  const B = w.nations[to];
  const r = rel(w, from, to);
  let s = r / 100;
  const why: string[] = [];
  if (r < -20) why.push("they distrust you");
  const regime = Math.abs(A.free - B.free) < 0.3 ? 0.15 : -0.15;
  s += regime;
  const enemies = w.wars.filter((x) => !x.over && (x.attackers.includes(from) || x.defenders.includes(from)));
  if (kind === "defence" || kind === "guarantee") {
    s -= enemies.length * 0.4;
    if (enemies.length) why.push("you're at war: they'd be dragged in");
    if (A.gdp > B.gdp * 3) s += 0.2;
    s -= 0.3;
  }
  if (kind === "aid" || kind === "milaid") s += from === to ? 0 : 0.6;
  if (kind === "base") s += B.gdp < A.gdp * 0.3 ? 0.2 : -0.4;
  if (kind === "trade") s += 0.25 - (B.tax.tariff - 0.05);
  if (kind === "research") s += 0.2;
  if (kind === "nonaggression") s += 0.3;
  if (kind === "energy") s += 0.3;
  if (B.orgs.includes("nato") && (A.iso === "RUS" || A.iso === "CHN") && (kind === "defence" || kind === "base" || kind === "access")) {
    s -= 1;
    why.push("their allies wouldn't stand for it");
  }
  void amount;
  if (s > 0.25 && !why.length) why.push("good relations");
  return [s, why.join("; ")];
}

export function signTreaty(w: World, a: number, b: number, kind: Treaty["kind"], amount?: number): Treaty {
  const t: Treaty = { id: w.ids++, kind, a, b, since: w.day, amount };
  w.treaties.push(t);
  nudge(w, a, b, 6);
  if (kind === "energy") {
    w.nations[a].interconnect += 0.5;
    w.nations[b].interconnect += 0.5;
  }
  if (kind === "trade") {
    w.nations[a].tax.surcharge[b] = 0;
    w.nations[b].tax.surcharge[a] = 0;
  }
  news(w, a, `${TREATY_INFO[kind].name} signed: ${w.nations[a].name} and ${w.nations[b].name}`, "world", a === w.actor.nation || b === w.actor.nation);
  return t;
}

export function cancelTreaty(w: World, t: Treaty) {
  w.treaties = w.treaties.filter((x) => x !== t);
  nudge(w, t.a, t.b, -15);
  news(w, t.a, `${w.nations[t.a].name} ends its ${TREATY_INFO[t.kind].name.toLowerCase()} with ${w.nations[t.b].name}`, "world", t.a === w.actor.nation || t.b === w.actor.nation);
}

/** Military aid arrives as kit and shells, not cash. */
export function aidMonth(w: World) {
  for (const t of w.treaties) {
    if (t.kind !== "milaid" || !t.amount) continue;
    const to = w.nations[t.b];
    const per = t.amount / 12;
    to.mil.ammo += per * 8;
    to.mil.equip.artillery += Math.round(per * 4);
    to.mil.equip.drone += Math.round(per * 800);
    to.mil.equip.ifv += Math.round(per * 3);
    if (per > 0.3) to.mil.equip.sam += 1;
  }
}

/* ------------------------------------------------------------------ sanctions and tariffs */

export function sanction(w: World, by: number, on: number, level: 1 | 2 | 3) {
  const s = w.sanctions.find((x) => x.by === by && x.on === on);
  if (s) s.level = level;
  else w.sanctions.push({ by, on, level, since: w.day });
  nudge(w, by, on, -10 * level);
  news(w, by, `${w.nations[by].name} imposes ${["", "targeted", "sectoral", "full"][level]} sanctions on ${w.nations[on].name}`, "world", by === w.actor.nation || on === w.actor.nation);
}
export function liftSanctions(w: World, by: number, on: number) {
  w.sanctions = w.sanctions.filter((x) => !(x.by === by && x.on === on));
  nudge(w, by, on, 8);
}

/** Tariff disputes: hit a partner and they may hit back. */
export function tradeMonth(w: World, d: D) {
  for (const n of w.nations) {
    if (!n.alive) continue;
    for (const [js, k] of Object.entries(n.tax.surcharge)) {
      const j = +js;
      if (!k) continue;
      const m = w.nations[j];
      nudge(w, n.id, j, -k * 4);
      if (j !== w.actor.nation && (m.tax.surcharge[n.id] ?? 0) < k * 0.8 && rngNext(w) < 0.35) {
        m.tax.surcharge[n.id] = Math.round(k * 0.9 * 100) / 100;
        news(w, j, `${m.name} retaliates against ${n.name}'s tariffs with its own ${Math.round(k * 90)}% surcharge`, "economy", n.id === w.actor.nation);
      }
    }
  }
  void d;
}

/* ------------------------------------------------------------------ organisations */

export function members(w: World, org: OrgId) {
  return w.nations.filter((n) => n.alive && n.orgs.includes(org));
}
export function onSecurityCouncil(w: World, id: number) {
  return P5.includes(w.nations[id].iso) || w.unsc.some((s) => s[0] === id);
}

/** Put a resolution to a vote in 7 days. */
export function proposeResolution(w: World, org: Resolution["org"], kind: Resolution["kind"], target: number, by: number, title: string, value?: number): Resolution {
  const r: Resolution = { id: w.ids++, org, kind, target, by, vote: w.day + 7, votes: {}, title, value };
  w.resolutions.push(r);
  news(w, by, `${orgName(org)}: vote on "${title}" in a week`, "world", by === w.actor.nation || target === w.actor.nation);
  return r;
}
function orgName(o: Resolution["org"]) {
  return o === "ga" ? "UN General Assembly" : o === "unsc" ? "Security Council" : ORGS[o as OrgId]?.name ?? o;
}

/** How a member would vote. */
export function voteOn(w: World, r: Resolution, voter: number): "yes" | "no" | "abstain" | "veto" {
  if (voter === r.target) return r.org === "unsc" && P5.includes(w.nations[voter].iso) ? "veto" : "no";
  const toTarget = rel(w, voter, r.target);
  const toBy = rel(w, voter, r.by);
  let s = 0;
  if (r.kind === "sanctions" || r.kind === "condemn" || r.kind === "force") s = -toTarget / 60 + toBy / 120;
  else if (r.kind === "ceasefire" || r.kind === "peacekeeping") s = 0.5 + toBy / 200;
  else if (r.kind === "accession") s = toTarget / 50 + (w.nations[r.target].laws.death_penalty === "abolished" ? 0.2 : -1);
  else if (r.kind === "quota") s = 0.3;
  else if (r.kind === "tariff") s = 0.1;
  else if (r.kind === "article5") s = toTarget / 50 - 0.2;
  else s = 0.2;
  const p5 = r.org === "unsc" && P5.includes(w.nations[voter].iso);
  if (p5 && s < -0.7) return "veto";
  return s > 0.15 ? "yes" : s < -0.15 ? "no" : "abstain";
}

export function resolutionsDay(w: World, d: D) {
  for (const r of w.resolutions) {
    if (r.passed !== undefined || w.day < r.vote) continue;
    const voters = r.org === "unsc" ? w.nations.filter((n) => onSecurityCouncil(w, n.id)) : r.org === "ga" ? w.nations.filter((n) => n.alive) : members(w, r.org as OrgId);
    let yes = 0;
    let yesPop = 0;
    let totPop = 0;
    let veto = false;
    for (const v of voters) {
      const vote = r.votes[v.id] ?? voteOn(w, r, v.id);
      r.votes[v.id] = vote;
      totPop += v.pop;
      if (vote === "yes") {
        yes++;
        yesPop += v.pop;
      }
      if (vote === "veto") veto = true;
    }
    if (r.org === "unsc") r.passed = !veto && yes >= 9;
    else if (r.org === "eu") r.passed = r.kind === "accession" || r.kind === "sanctions" ? yes === voters.length - (voters.some((v) => v.id === r.target) ? 1 : 0) : yes >= voters.length * 0.55 && yesPop >= totPop * 0.65;
    else r.passed = yes > voters.length / 2;
    news(w, r.by, `${orgName(r.org)} ${r.passed ? "adopts" : "rejects"} "${r.title}" (${yes} of ${voters.length} for${veto ? ", vetoed" : ""})`, "world", true);
    if (r.passed) enact(w, r);
  }
  w.resolutions = w.resolutions.filter((r) => r.passed === undefined || w.day - r.vote < 120);
  void d;
}

function enact(w: World, r: Resolution) {
  const T = w.nations[r.target];
  if (r.kind === "sanctions") {
    const by = r.org === "unsc" || r.org === "ga" ? w.nations.filter((n) => n.alive && n.id !== r.target && rel(w, n.id, r.target) < 30) : members(w, r.org as OrgId);
    for (const n of by) if (n.id !== r.target) sanction(w, n.id, r.target, r.org === "unsc" ? 3 : 2);
  }
  if (r.kind === "condemn") for (const n of w.nations) nudge(w, n.id, r.target, -3);
  if (r.kind === "ceasefire") {
    for (const x of w.wars) if (!x.over && (x.attackers.includes(r.target) || x.defenders.includes(r.target))) x.legit = Math.max(0, x.legit - 10);
  }
  if (r.kind === "accession" && r.org === "eu") {
    if (!T.orgs.includes("eu")) T.orgs.push("eu");
    delete T.applying.eu;
    news(w, T.id, `${T.name} joins the European Union`, "world", true);
  }
  if (r.kind === "euro") {
    if (!T.orgs.includes("euro")) T.orgs.push("euro");
    T.fx = 1;
  }
  if (r.kind === "quota") w.opec.price = clamp(w.opec.price, 0.5, 2);
}

/** Apply to join an organisation (or leave). Returns a message. */
export function applyToOrg(w: World, n: Nation, org: OrgId): string {
  if (n.orgs.includes(org)) return "Already a member";
  if (org === "eu") {
    if (n.continent !== "Europe") return "Only European countries can join";
    if (n.laws.death_penalty !== "abolished") return "Abolish the death penalty first";
    if (n.free < 0.6) return "Free elections and a free press are conditions";
    n.applying.eu = w.day;
    return EU_CANDIDATES.includes(n.iso) ? "Accession talks open: the 35 chapters take time" : "Application lodged: candidate status will be decided";
  }
  if (org === "euro") {
    if (!n.orgs.includes("eu")) return "Only EU members can adopt the euro";
    n.applying.euro = w.day;
    return "Convergence check: deficit under 3%, debt under 60% (or falling), inflation near the average";
  }
  if (org === "nato") {
    if (!["Europe", "North America"].includes(n.continent)) return "NATO only admits European and North Atlantic states";
    n.applying.nato = w.day;
    return "Membership Action Plan begun: every member must agree";
  }
  if (org === "opec") {
    if (n.sectors[4].out < 20) return "You don't produce enough oil";
    n.orgs.push("opec");
    return "Welcome to OPEC+: you'll be given a quota";
  }
  n.orgs.push(org);
  return `Joined ${ORGS[org].name}`;
}

export function leaveOrg(w: World, n: Nation, org: OrgId): string {
  if (!n.orgs.includes(org)) return "Not a member";
  if (org === "eu") {
    n.leaving.eu = w.day + 730;
    news(w, n.id, `${n.name} gives notice to leave the EU: two years of talks begin`, "world", true);
    return "Notice given: you'll leave in two years (the euro too)";
  }
  n.orgs = n.orgs.filter((o) => o !== org);
  return `Left ${ORGS[org].name}`;
}

/** Monthly: accession talks, euro convergence, exits, NATO votes. */
export function orgsMonth(w: World, d: D) {
  for (const n of w.nations) {
    if (!n.alive) continue;
    if (n.leaving.eu !== undefined && w.day >= n.leaving.eu) {
      n.orgs = n.orgs.filter((o) => o !== "eu" && o !== "euro");
      delete n.leaving.eu;
      n.fx = 1;
      news(w, n.id, `${n.name} leaves the European Union`, "world", true);
    }
    if (n.applying.eu !== undefined && w.day - n.applying.eu > 365 * 3 && !w.resolutions.some((r) => r.kind === "accession" && r.target === n.id && r.passed === undefined)) {
      proposeResolution(w, "eu", "accession", n.id, n.id, `Admit ${n.name}`);
      n.applying.eu = w.day;
    }
    if (n.applying.euro !== undefined && w.day - n.applying.euro > 365) {
      const def = -d.budget[n.id].balance / Math.max(1, n.gdp);
      const ok = def < 0.03 && (n.debt / Math.max(1, n.gdp) < 0.6 || n.growth > 0) && n.inflation < 0.035;
      if (ok) {
        n.orgs.push("euro");
        n.fx = 1;
        news(w, n.id, `${n.name} adopts the euro`, "economy", true);
      } else news(w, n.id, `${n.name} misses the euro criteria this year`, "economy", n.id === w.actor.nation);
      delete n.applying.euro;
      if (!ok) n.applying.euro = w.day;
    }
    if (n.applying.nato !== undefined && w.day - n.applying.nato > 365) {
      const allies = members(w, "nato");
      const blocker = allies.find((m) => rel(w, m.id, n.id) < 10);
      if (!blocker) {
        n.orgs.push("nato");
        news(w, n.id, `${n.name} joins NATO`, "world", true);
      } else news(w, n.id, `${blocker.name} blocks ${n.name}'s NATO membership`, "world", n.id === w.actor.nation);
      delete n.applying.nato;
    }
  }
}

/** OPEC+: a meeting each month sets quotas; cheats and price wars. */
export function opecMonth(w: World, d: D) {
  if (w.day < w.opec.next) return;
  w.opec.next = w.day + 30;
  const crude = GOOD_INDEX.crude;
  const price = w.prices[crude];
  const mem = members(w, "opec");
  if (price < 0.85 && !w.opec.war) {
    for (const n of mem) n.quota = clamp(n.quota - 0.04, 0.6, 1);
    news(w, mem[0]?.id ?? 0, "OPEC+ cuts output to lift the oil price", "economy");
  } else if (price > 1.3) for (const n of mem) n.quota = clamp(n.quota + 0.03, 0.6, 1);
  // A price war if the cartel's discipline breaks.
  const sau = w.nations.find((n) => n.iso === "SAU");
  if (sau && !w.opec.war && price < 0.7 && rngNext(w) < 0.25) {
    w.opec.war = true;
    for (const n of mem) n.quota = 1;
    news(w, sau.id, "Price war: Saudi Arabia opens the taps", "economy", true);
  } else if (w.opec.war && rngNext(w) < 0.15) {
    w.opec.war = false;
    news(w, sau?.id ?? 0, "OPEC+ makes peace and restores quotas", "economy", true);
  }
  // Quotas cap the oil sector's capacity.
  for (const n of mem) {
    const s = n.sectors[4];
    const allowed = s.cap * n.quota;
    if (s.out > allowed) s.out = allowed;
  }
  void d;
}

/** Ask the IMF for a programme. */
export function requestImf(w: World, n: Nation): string {
  if (n.imf && n.imf.tranches > 0) return "Already in a programme";
  if (!n.orgs.includes("imf")) return "Not an IMF member";
  const amount = n.gdp * 0.03;
  n.imf = { tranches: 4, next: w.day + 90, target: 0.03, amount: amount / 4 };
  n.fxReserves += amount / 4;
  news(w, n.id, `IMF agrees a $${amount.toFixed(0)}bn programme with ${n.name}: deficit must fall under 3%`, "economy", true);
  return `Programme agreed: $${(amount / 4).toFixed(1)}bn now, three more tranches if the deficit falls under 3%`;
}

export function imfDay(w: World, d: D, n: Nation) {
  const p = n.imf;
  if (!p || p.tranches <= 0 || w.day < p.next) return;
  const def = -d.budget[n.id].balance / Math.max(1, n.gdp);
  p.next = w.day + 90;
  if (def <= p.target + 0.01) {
    p.tranches--;
    n.fxReserves += p.amount;
    news(w, n.id, `IMF releases a tranche to ${n.name}`, "economy", n.id === w.actor.nation);
  } else news(w, n.id, `IMF withholds ${n.name}'s tranche: deficit ${Math.round(def * 1000) / 10}% (target ${p.target * 100}%)`, "economy", n.id === w.actor.nation);
}

/** Default on the debt: a haircut, and the markets shut for years. */
export function defaultOnDebt(w: World, n: Nation) {
  const cut = n.debt * 0.45;
  n.debt -= cut;
  n.defaulted = w.day + 365 * 3;
  n.rating = 20;
  n.market = false;
  n.banks.capital -= 0.08;
  n.banks.npl += 0.1;
  for (const m of w.nations) if (m.gdp > n.gdp * 2) nudge(w, m.id, n.id, -8);
  news(w, n.id, `${n.name} defaults: $${cut.toFixed(0)}bn written off; locked out of markets`, "economy", true);
}

/** IAEA inspectors: undeclared programmes are found sooner or later. */
export function iaeaMonth(w: World) {
  for (const n of w.nations) {
    if (!n.alive || !n.orgs.includes("iaea")) continue;
    if (n.mil.program <= 0 || n.mil.nukes > 0) continue;
    if (n.mil.program > 30 && rngNext(w) < 0.05 + n.mil.program / 1500) {
      news(w, n.id, `IAEA reports ${n.name} enriching uranium beyond civilian needs`, "world", true);
      if (!w.crises.some((c) => !c.over && c.b === n.id && c.cause === "nuclear")) {
        const usa = w.nations.find((m) => m.iso === "USA");
        if (usa) startCrisis(w, usa.id, n.id, "nuclear", `${n.name}'s nuclear programme`);
      }
    }
  }
}

/* ------------------------------------------------------------------ crises */

export const CRISIS_MOVES = [
  { id: "redline", name: "Draw a red line", icon: "🟥", tension: 8, text: "Commit publicly. Credible if you have the force; costly to back down from." },
  { id: "mobilise", name: "Mobilise reserves", icon: "🪖", tension: 12, text: "Call up reservists: costs money and workers, shows resolve." },
  { id: "ships", name: "Send ships", icon: "🚢", tension: 10, text: "A naval group off their coast." },
  { id: "patrols", name: "Step up patrols", icon: "✈️", tension: 5, text: "Air and border patrols. Risk of incidents." },
  { id: "restrict", name: "Restrict shipping", icon: "⚓", tension: 15, text: "Search or turn back their cargo: their sea trade suffers." },
  { id: "pressure", name: "Economic pressure", icon: "💸", tension: 6, text: "Targeted sanctions and tariffs." },
  { id: "settle", name: "Propose a settlement", icon: "🤝", tension: -15, text: "Offer terms both can live with." },
  { id: "mediation", name: "Ask for mediation", icon: "⚖️", tension: -10, text: "A third country brokers talks." },
  { id: "concede", name: "Concede", icon: "🏳️", tension: -40, text: "Give them what they want. Ends it; you look weak." },
  { id: "withdraw", name: "Stand down", icon: "↩️", tension: -20, text: "Pull back forces. Less tension, less leverage." },
] as const;
export type CrisisMove = (typeof CRISIS_MOVES)[number]["id"];

export function startCrisis(w: World, a: number, b: number, cause: Crisis["cause"], title: string): Crisis {
  const c: Crisis = { id: w.ids++, a, b, title, cause, tension: 30, moves: [], deadline: w.day + 45, mediator: -1, redline: {}, mobilised: {}, restricted: false, over: false };
  w.crises.push(c);
  news(w, a, `Crisis: ${title}`, "world", a === w.actor.nation || b === w.actor.nation);
  return c;
}

export function crisisMove(w: World, c: Crisis, side: number, move: CrisisMove): string {
  const def = CRISIS_MOVES.find((m) => m.id === move)!;
  c.moves.push({ side, move, day: w.day });
  c.tension = clamp(c.tension + def.tension, 0, 100);
  const other = side === c.a ? c.b : c.a;
  const me = w.nations[side];
  if (move === "redline") c.redline[side] = true;
  if (move === "mobilise") {
    c.mobilised[side] = (c.mobilised[side] ?? 0) + 0.1;
    me.mil.mobilised = clamp(me.mil.mobilised + 0.1, 0, 1);
  }
  if (move === "restrict") {
    c.restricted = true;
    w.blockades[other] = side;
  }
  if (move === "pressure") sanction(w, side, other, 1);
  if (move === "mediation") {
    const med = w.nations.filter((n) => n.alive && n.id !== c.a && n.id !== c.b && rel(w, n.id, c.a) > 0 && rel(w, n.id, c.b) > 0).sort((x, y) => y.gdp - x.gdp)[0];
    c.mediator = med?.id ?? -1;
    if (med) c.deadline = Math.max(c.deadline, w.day + 30);
  }
  if (move === "concede") {
    endCrisis(w, c, `${me.name} concedes`);
    for (const n of w.nations) if (rel(w, n.id, side) > 30) nudge(w, n.id, side, -3);
    if (c.redline[side]) me.stability -= 6;
  }
  if (move === "withdraw") {
    c.mobilised[side] = 0;
    if (c.restricted && w.blockades[other] === side) {
      delete w.blockades[other];
      c.restricted = false;
    }
  }
  if (move === "settle") {
    const accept = rngNext(w) < clamp(0.25 + (100 - c.tension) / 160 + (c.mediator >= 0 ? 0.2 : 0) + rel(w, side, other) / 300, 0.05, 0.9);
    if (accept) endCrisis(w, c, "Settled by agreement");
    else return `${w.nations[other].name} rejects the terms.`;
  }
  return `${def.name}: tension ${Math.round(c.tension)}.`;
}

export function endCrisis(w: World, c: Crisis, outcome: string) {
  c.over = true;
  c.outcome = outcome;
  if (c.restricted) {
    for (const [k, v] of Object.entries(w.blockades)) if (v === c.a || v === c.b) delete w.blockades[+k];
  }
  news(w, c.a, `Crisis over: ${c.title}. ${outcome}`, "world", c.a === w.actor.nation || c.b === w.actor.nation);
}

/** AI answers, tension drifts, deadlines bite. */
export function crisesDay(w: World) {
  for (const c of w.crises) {
    if (c.over) continue;
    c.tension = clamp(c.tension - 0.15 + (c.redline[c.a] && c.redline[c.b] ? 0.3 : 0), 0, 100);
    for (const side of [c.a, c.b]) {
      if (side === w.actor.nation) continue;
      if (rngNext(w) > 0.06) continue;
      const me = w.nations[side];
      const other = w.nations[side === c.a ? c.b : c.a];
      const power = (me.mil.equip.infantry + me.gdp / 50) / Math.max(1, other.mil.equip.infantry + other.gdp / 50);
      let move: CrisisMove = "patrols";
      if (c.tension > 75) move = power > 1.3 ? "redline" : rngNext(w) < 0.5 ? "mediation" : "settle";
      else if (power > 1.5) move = rngNext(w) < 0.4 ? "mobilise" : "ships";
      else if (power < 0.6) move = rngNext(w) < 0.3 ? "concede" : "settle";
      else move = rngNext(w) < 0.5 ? "pressure" : "settle";
      crisisMove(w, c, side, move);
      if (c.over) break;
    }
    if (!c.over && w.day > c.deadline) {
      if (c.tension < 40) endCrisis(w, c, "It faded away");
      else c.deadline = w.day + 30;
    }
  }
  w.crises = w.crises.filter((c) => !c.over || w.day - c.deadline < 180);
}

/* ------------------------------------------------------------------ intelligence */

export const OPS = [
  { id: "secrets", name: "Steal secrets", icon: "🗂️", need: 25, risk: 0.15, text: "Learn their plans: their nuclear programme, war plans, a technology." },
  { id: "tech", name: "Steal a technology", icon: "🧬", need: 45, risk: 0.3, text: "Copy something they know that you don't." },
  { id: "sabotage", name: "Sabotage a power plant", icon: "💥", need: 55, risk: 0.45, text: "Knock out one of their plants for months." },
  { id: "port", name: "Sabotage a port", icon: "⚓", need: 50, risk: 0.4, text: "Cut their sea trade for a while." },
  { id: "infiltrate", name: "Infiltrate an armed group", icon: "🕵️", need: 30, risk: 0.25, text: "Get inside a terrorist or rebel group based there." },
  { id: "capture", name: "Capture a group's leader", icon: "🎯", need: 60, risk: 0.35, text: "Needs deep infiltration. Cripples the group." },
  { id: "coup", name: "Fund a coup", icon: "🎖️", need: 70, risk: 0.6, text: "Money and promises to their officers. If it works, a friendlier regime." },
  { id: "election", name: "Meddle in an election", icon: "🗳️", need: 40, risk: 0.5, text: "Boost the party friendliest to you before their next vote." },
] as const;
export type OpId = (typeof OPS)[number]["id"];

/** Networks grow with spending, against the target's counter-intelligence. */
export function intelDay(w: World, n: Nation) {
  const budget = n.spend.intelligence / Math.max(0.01, n.gdp);
  const targets = Object.keys(n.intel.net).map(Number);
  for (const t of targets) {
    const enemy = w.nations[t];
    const grow = (budget * 6000) / Math.max(1, targets.length) / Math.max(10, enemy.intel.counter);
    n.intel.net[t] = clamp(n.intel.net[t] + grow - 0.01, 0, 100);
  }
  n.intel.counter = clamp(n.intel.counter + (budget * 300 - (n.intel.counter - 30) * 0.002) * 0.05, 5, 100);
}

/** Run an operation. Returns what happened. */
export function runOp(w: World, a: Atlas, d: D, by: number, target: number, op: OpId, arg = -1): string {
  const me = w.nations[by];
  const them = w.nations[target];
  const def = OPS.find((o) => o.id === op)!;
  const net = me.intel.net[target] ?? 0;
  if (net < def.need) return `Your network there is too weak (${Math.round(net)} of ${def.need} needed)`;
  const success = rngNext(w) < clamp(0.3 + (net - def.need) / 60, 0.1, 0.95);
  const caught = rngNext(w) < def.risk * (them.intel.counter / 60);
  if (caught) {
    them.intel.evidence.push([by, def.name, w.day, false]);
    me.intel.net[target] = net * 0.5;
  }
  let out = "";
  if (!success) out = "It failed.";
  else if (op === "secrets") {
    const s = them.mil.program > 0 && them.mil.nukes === 0 ? `${them.name}'s nuclear programme is ${Math.round(them.mil.program)}% of the way to a bomb` : them.mil.mobilised > 0.2 ? `${them.name} has mobilised ${Math.round(them.mil.mobilised * 100)}% of its reserves` : `${them.name}'s army loyalty stands at ${Math.round(them.mil.loyalty)}`;
    me.intel.secrets.push([s, w.day]);
    out = s;
  } else if (op === "tech") {
    const steal = them.research.known.find((k) => !me.research.known.includes(k));
    if (steal !== undefined) {
      me.research.known.push(steal);
      out = "Blueprints copied.";
    } else out = "They know nothing you don't.";
  } else if (op === "sabotage") {
    const plants = w.plants.filter((p) => p.nation === target && p.damage < 1 && p.type !== "storage" && p.ready <= w.day);
    const p = arg >= 0 ? w.plants[arg] : plants.sort((x, y) => y.gw - x.gw)[0];
    if (p) {
      p.damage = Math.min(1, p.damage + 0.7);
      out = `${a.map.cities[p.city].name}'s ${p.type} plant is down.`;
      news(w, target, `Explosion knocks out a power plant in ${a.map.cities[p.city].name}`, "home", target === w.actor.nation);
    }
  } else if (op === "port") {
    w.blockades[target] = w.blockades[target] ?? by;
    setTimeout0(w, () => delete w.blockades[target]);
    out = "Their main port is out of action.";
  } else if (op === "infiltrate") {
    const act = w.actors.find((x) => x.alive && x.nation === target);
    if (act) {
      act.infiltrated[by] = clamp((act.infiltrated[by] ?? 0) + 30, 0, 100);
      out = `Agents inside the ${act.name}.`;
    } else out = "No armed group there.";
  } else if (op === "capture") {
    const act = w.actors.find((x) => x.alive && x.nation === target && (x.infiltrated[by] ?? 0) >= 50);
    if (act) {
      act.strength *= 0.45;
      out = `${act.leader} of the ${act.name} captured.`;
      news(w, target, `${act.leader}, leader of the ${act.name}, captured`, "world", true);
    } else out = "Infiltrate a group to half or more first.";
  } else if (op === "coup") {
    const chance = clamp((80 - them.mil.loyalty) / 100 + (50 - them.stability) / 150, 0.03, 0.6);
    if (rngNext(w) < chance) {
      coup(w, them, by);
      out = "The officers moved. It worked.";
    } else {
      them.mil.loyalty = Math.min(100, them.mil.loyalty + 5);
      out = "The plotters lost their nerve.";
    }
  } else if (op === "election") {
    const friend = partiesOf(w, them).sort((x, y) => Math.abs(x.v[3] - me.free) - Math.abs(y.v[3] - me.free))[0];
    if (friend) friend.national += 0.25;
    out = friend ? `Quietly boosting the ${friend.name}.` : "No one to back.";
  }
  if (caught) {
    out += ` But ${them.name} caught your agents.`;
    nudge(w, by, target, -12);
  }
  void d;
  return out;
}
/** Effects that wear off (a sabotaged port): kept as a scheduled cleanup on the world. */
const CLEANUPS = new Map<World, [number, () => void][]>();
function setTimeout0(w: World, fn: () => void) {
  const list = CLEANUPS.get(w) ?? [];
  list.push([w.day + 60, fn]);
  CLEANUPS.set(w, list);
}
export function cleanupsDay(w: World) {
  const list = CLEANUPS.get(w);
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--)
    if (w.day >= list[i][0]) {
      list[i][1]();
      list.splice(i, 1);
    }
}

/** Publish evidence of a foreign operation: they pay for it in reputation. */
export function publishEvidence(w: World, n: Nation, k: number): string {
  const e = n.intel.evidence[k];
  if (!e || e[3]) return "Nothing to publish";
  e[3] = true;
  const culprit = e[0];
  for (const m of w.nations) if (m.id !== culprit) nudge(w, m.id, culprit, -4);
  nudge(w, n.id, culprit, -10);
  n.approval += 1.5;
  news(w, n.id, `${n.name} publishes proof that ${w.nations[culprit].name} ran "${e[1]}" against it`, "world", true);
  return `Published: the world now knows ${w.nations[culprit].name} was behind it.`;
}

/* ------------------------------------------------------------------ coups */

export function coupMonth(w: World, n: Nation) {
  const m = n.mil;
  const autonomous = n.pol.constitution.military !== "civilian" ? 10 : 0;
  m.coupRisk = clamp(m.coupRisk * 0.8 + Math.max(0, 55 - m.loyalty) * 0.6 + Math.max(0, 35 - n.stability) * 0.4 + autonomous, 0, 100);
  m.loyalty = clamp(m.loyalty + (60 + (n.groups[12].sat - 50) * 0.5 + m.bonus * 80 - m.loyalty) * 0.05, 0, 100);
  if (n.id === w.actor.nation) return;
  if (m.coupRisk > 45 && rngNext(w) < (m.coupRisk - 40) / 600) coup(w, n, -1);
}

/** The army takes over. */
export function coup(w: World, n: Nation, backer: number) {
  n.form = "junta";
  n.pol.constitution.form = "junta";
  n.pol.constitution.decrees = "rule";
  n.pol.constitution.military = "supreme";
  n.free = Math.min(n.free, 0.15);
  n.laws.press = "censored";
  n.mil.loyalty = 85;
  n.mil.coupRisk = 0;
  n.hos = "Chairman of the military council";
  n.pol.elections = [];
  n.orgs = n.orgs.filter((o) => o !== "au" || backer >= 0);
  if (backer >= 0) nudge(w, n.id, backer, 40);
  news(w, n.id, `Military coup in ${n.name}`, "world", true);
}

/* ------------------------------------------------------------------ the Cablegram */

export const CABLE_KINDS: Record<string, { name: string; icon: string; foreign: boolean }> = {
  treaty: { name: "Propose a treaty", icon: "📜", foreign: true },
  aid: { name: "Ask for aid", icon: "🆘", foreign: true },
  sanctions: { name: "Ask them to sanction someone", icon: "🚫", foreign: true },
  vote: { name: "Ask for their vote", icon: "🗳️", foreign: true },
  mediate: { name: "Ask them to mediate", icon: "⚖️", foreign: true },
  warn: { name: "Warn them", icon: "⚠️", foreign: true },
  trade: { name: "Offer a trade deal", icon: "🚢", foreign: true },
  buy: { name: "Offer to buy a city", icon: "🏙️", foreign: true },
  bill: { name: "Ask for votes on a bill", icon: "🧾", foreign: false },
  coalition: { name: "Invite into government", icon: "🤝", foreign: false },
  motion: { name: "Back a no-confidence motion", icon: "✋", foreign: false },
};

export function sendCable(w: World, c: Omit<Cable, "id" | "day">): Cable {
  const cable: Cable = { ...c, id: w.ids++, day: w.day };
  w.cables.push(cable);
  if (w.cables.length > 120) w.cables.shift();
  return cable;
}

/** Replies arrive one to three days later. */
export function cablesDay(w: World, a: Atlas, d: D, apply: (c: Cable, accept: boolean) => void) {
  for (const c of w.cables) {
    if (c.reply || w.day - c.day < 1 + (c.id % 3)) continue;
    const from = w.nations[c.from];
    let accept = false;
    let text = "";
    if (c.toParty !== undefined) {
      const p = w.parties[c.toParty];
      const n = w.nations[p.nation];
      if (c.kind === "bill") {
        const bill = n.pol.bills.find((b) => b.id === c.ref);
        const offer = c.offer === "ministry" ? 0.45 : c.offer === "amend" ? 0.3 : c.offer === "funds" ? 0.2 : 0.1;
        const fc = bill ? forecast(w, n, bill, n.pol.lower).parties.find((x) => x.id === p.id) : undefined;
        const lean = fc ? (fc.yes - fc.no) / Math.max(1, fc.seats) : 0;
        accept = lean + offer > 0.05;
        text = accept ? `We'll back it${c.offer ? ` (${offerName(c.offer)})` : ""}.` : "We can't support this bill.";
        if (accept && bill) bill.sway[p.id] = (bill.sway[p.id] ?? 0) + offer + 0.3;
      } else if (c.kind === "coalition") {
        const close = 1 - Math.min(1, Math.abs(p.v[5] - (w.parties[w.actor.party]?.v[5] ?? 0)) + Math.abs(p.v[0] - (w.parties[w.actor.party]?.v[0] ?? 0)) * 0.5);
        accept = close + (c.offer === "ministry" ? 0.3 : 0) > 0.55;
        text = accept ? "We'll join you." : "Our members wouldn't wear it.";
      } else if (c.kind === "motion") {
        accept = !n.pol.gov.includes(p.id) && rngNext(w) < 0.6;
        text = accept ? "We'll vote with you." : "Not this time.";
      }
    } else {
      const to = w.nations[c.to];
      const r = rel(w, c.from, c.to);
      if (c.kind === "treaty") {
        const [s, why] = treatyAppeal(w, c.from, c.to, (c.offer as Treaty["kind"]) ?? "nonaggression");
        accept = s > 0.2;
        text = accept ? `Agreed. (${why || "a sensible step"})` : `We must decline: ${why || "the time isn't right"}.`;
      } else if (c.kind === "aid") {
        accept = r > 30 && to.gdp > from.gdp && rngNext(w) < 0.6;
        text = accept ? "We'll send help." : "We can't spare it.";
      } else if (c.kind === "sanctions") {
        const target = c.ref ?? -1;
        accept = target >= 0 && rel(w, c.to, target) < 0 && r > 20;
        text = accept ? `We'll sanction ${w.nations[target]?.name}.` : "Sanctions would hurt us more.";
      } else if (c.kind === "vote") {
        accept = r > 15;
        text = accept ? "You'll have our vote." : "We'll vote our own way.";
      } else if (c.kind === "mediate") {
        accept = r > 0;
        text = accept ? "We'll host the talks." : "We'd rather stay out of it.";
      } else if (c.kind === "warn") {
        accept = from.mil.equip.infantry > to.mil.equip.infantry * 1.5;
        text = accept ? "Message received." : "We don't take orders.";
        nudge(w, c.from, c.to, -4);
      } else if (c.kind === "trade") {
        accept = r > -10 && rngNext(w) < 0.7;
        text = accept ? "Tariffs off between us." : "Our industries need their protection.";
      } else if (c.kind === "buy") {
        const city = c.ref ?? -1;
        const price = +(c.offer ?? "0");
        const worth = city >= 0 ? (a.map.cities[city].pop / Math.max(1, to.pop)) * to.gdp * 3 : Infinity;
        accept = city >= 0 && !a.map.cities[city].capital && price >= worth && r > 20 && w.separatism[city] < 0.6;
        text = accept ? `${a.map.cities[city].name} is yours for $${price}bn.` : `${city >= 0 ? a.map.cities[city].name : "It"} is not for sale at that price.`;
      }
    }
    c.reply = { day: w.day, accept, text };
    apply(c, accept);
    void d;
  }
}
function offerName(o: string) {
  return o === "ministry" ? "for a ministry" : o === "amend" ? "with our amendment" : o === "funds" ? "for the project in our region" : o;
}
