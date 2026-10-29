/**
 * What you need to know: the agenda (deadlines coming, problems getting worse, things you're
 * watching), the monthly report (what changed and why), and each minister's advice on their
 * portfolio, in plain words with the numbers behind it.
 */
import { GOODS, GROUPS, PORTFOLIOS, SECTORS, SERVICES, type PortfolioId } from "./data";
import type { Atlas } from "./atlas";
import type { D } from "./econ";
import { defenceCost } from "./econ";
import type { Nation, Part, World } from "./state";
import { fmtDate, money, pct, people } from "./util";
import { forecast } from "./politics";
import { warSupport } from "./war";

export interface AgendaItem {
  id: string;
  kind: "deadline" | "problem" | "watch";
  icon: string;
  title: string;
  text: string;
  /** Day due (deadlines). */
  due?: number;
  /** 0 info … 3 urgent. */
  level: number;
  /** Where to go to act on it. */
  go: string;
  ref?: number;
}

export function agenda(w: World, a: Atlas, d: D, n: Nation): AgendaItem[] {
  const out: AgendaItem[] = [];
  const day = w.day;
  // Deadlines.
  for (const st of w.strikes) {
    if (st.nation !== n.id || st.settled) continue;
    const g = GROUPS.find((x) => x.id === st.group)!;
    out.push(st.started ? { id: `strike${st.group}`, kind: "problem", icon: "🪧", title: `${g.name} on strike`, text: `${Math.round(st.share * 100)}% out for ${day - st.started} days, demanding ${st.demand}%.`, level: 3, go: "people:unions" } : { id: `strike${st.group}`, kind: "deadline", icon: "✊", title: `${g.name}: ${st.demand}% or a strike`, text: `The union walks out on ${fmtDate(st.deadline)} unless there's a deal.`, due: st.deadline, level: 2, go: "people:unions" });
  }
  for (const b of n.pol.bills) {
    if (["passed", "failed", "vetoed", "struck"].includes(b.stage)) continue;
    const f = forecast(w, n, b, n.pol.lower);
    out.push({ id: `bill${b.id}`, kind: "deadline", icon: "🧾", title: b.title, text: `Vote ${fmtDate(b.vote)}: forecast ${Math.round(f.yes)} for, ${Math.round(f.no)} against (needs ${f.need}).`, due: b.vote, level: f.yes >= f.need ? 1 : 2, go: "regime:parliament", ref: b.id });
  }
  const e = n.pol.elections[0];
  if (e && e.day - day < 365) out.push({ id: "election", kind: "deadline", icon: "🗳️", title: `${e.kind === "hos" ? `${n.hos} election` : e.kind === "upper" ? `${n.pol.upper?.name ?? "Upper house"} renewal${e.share && e.share < 1 ? ` (${Math.round(e.share * 100)}%)` : ""}` : `${n.pol.lower.name} election`}${e.early ? " (early)" : ""}`, text: `${fmtDate(e.day, true)}: ${Math.max(0, e.day - day)} days.`, due: e.day, level: e.day - day < 60 ? 2 : 1, go: "regime:party" });
  if (n.imf && n.imf.tranches > 0) out.push({ id: "imf", kind: "deadline", icon: "🏦", title: "IMF review", text: `Next tranche ${fmtDate(n.imf.next)} if the deficit is under ${n.imf.target * 100}% (now ${pct(-d.budget[n.id].balance / Math.max(1, n.gdp))}).`, due: n.imf.next, level: -d.budget[n.id].balance / Math.max(1, n.gdp) > n.imf.target ? 2 : 1, go: "budget" });
  for (const c of w.crises) {
    if (c.over || (c.a !== n.id && c.b !== n.id)) continue;
    out.push({ id: `crisis${c.id}`, kind: "deadline", icon: "⚠️", title: c.title, text: `Tension ${Math.round(c.tension)}/100. Deadline ${fmtDate(c.deadline)}.`, due: c.deadline, level: c.tension > 70 ? 3 : 2, go: "diplomacy:crises", ref: c.id });
  }
  for (const r of w.resolutions) {
    if (r.passed !== undefined) continue;
    if (r.target === n.id || r.by === n.id || n.orgs.includes(r.org as never) || r.org === "ga") out.push({ id: `res${r.id}`, kind: "deadline", icon: "🗳️", title: r.title, text: `${r.org.toUpperCase()} vote ${fmtDate(r.vote)}.`, due: r.vote, level: r.target === n.id ? 3 : 1, go: "diplomacy:orgs", ref: r.id });
  }
  if (n.leaving.eu !== undefined) out.push({ id: "brexit", kind: "deadline", icon: "🇪🇺", title: "Leaving the EU", text: `On ${fmtDate(n.leaving.eu, true)}.`, due: n.leaving.eu, level: 1, go: "diplomacy:orgs" });
  for (const p of w.protests) {
    if (p.nation !== n.id || p.over) continue;
    out.push({ id: `protest${p.id}`, kind: "problem", icon: "📣", title: `Protest in ${a.map.cities[p.city].name}`, text: `${people(p.size)} ${GROUPS.find((g) => g.id === p.group)?.name.toLowerCase()} over ${p.cause}.${p.response ? ` Police: ${p.response}.` : " No response yet."}`, level: p.response ? 1 : 3, go: "people:protests", ref: p.id });
  }
  // Problems getting worse.
  const el = d.elec[n.id];
  if (el.served < 0.98) out.push({ id: "power", kind: "problem", icon: "⚡", title: "Power cuts", text: `${pct(1 - el.served, 0)} of demand unmet. ${el.fuelShort || "Not enough capacity."}`, level: 3, go: "energy" });
  if (n.inflation > 0.06) out.push({ id: "inflation", kind: "problem", icon: "🏷️", title: `Inflation ${pct(n.inflation)}`, text: topCause(n.approvalParts, "Prices"), level: n.inflation > 0.15 ? 3 : 2, go: "economy" });
  if (n.unemp > 0.09) out.push({ id: "unemp", kind: "problem", icon: "👷", title: `Unemployment ${pct(n.unemp)}`, text: weakest(n), level: 2, go: "economy" });
  for (const s of SERVICES) {
    const sv = n.services[s.id];
    if (sv.quality < 0.7) out.push({ id: `svc${s.id}`, kind: "problem", icon: s.icon, title: `${s.name} struggling (${Math.round(sv.quality * 100)}%)`, text: sv.limit || "Below standard.", level: sv.quality < 0.5 ? 3 : 2, go: "services" });
  }
  if (!n.market && n.defaulted <= day) out.push({ id: "market", kind: "problem", icon: "📉", title: "Shut out of the bond markets", text: `Rated ${["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+", "B", "B-", "CCC+", "CCC", "CC", "C", "D"][n.rating]}: reserves, the IMF or the printing press.`, level: 3, go: "budget" });
  if (d.access[n.id] < 0.9) out.push({ id: "access", kind: "problem", icon: "🚢", title: `Trade ${pct(1 - d.access[n.id], 0)} cut off`, text: d.accessWhy[n.id], level: 2, go: "economy:trade" });
  const short = shortages(d, n);
  if (short.length) out.push({ id: "short", kind: "problem", icon: "📦", title: "Shortages", text: short.slice(0, 4).join(", "), level: 2, go: "economy:goods" });
  for (const x of w.wars) {
    if (x.over || (!x.attackers.includes(n.id) && !x.defenders.includes(n.id))) continue;
    const sup = warSupport(w, x, n.id);
    out.push({ id: `war${x.id}`, kind: "problem", icon: "⚔️", title: x.name, text: `War support ${Math.round(sup)}%. Ammunition ${Math.round(n.mil.ammo)} days. ${x.ceasefire > day ? "Ceasefire holds." : ""}`, level: sup < 30 || n.mil.ammo < 10 ? 3 : 2, go: "defence:war", ref: x.id });
  }
  if (n.mil.coupRisk > 30) out.push({ id: "coup", kind: "problem", icon: "🎖️", title: "Unrest in the army", text: `Loyalty ${Math.round(n.mil.loyalty)}. Coup risk ${Math.round(n.mil.coupRisk)}.`, level: 3, go: "defence:army" });
  for (const ep of w.epidemics[n.id] ?? []) if (ep.detected) out.push({ id: `epi${ep.disease}`, kind: "problem", icon: "🦠", title: `${ep.disease} outbreak`, text: `${people(ep.i)} infected, ${people(ep.d)} dead. Vaccine ${Math.round((n.vaccine[ep.disease] ?? 0) * 100)}%.`, level: 3, go: "services:health" });
  if (n.approval < 35) out.push({ id: "approval", kind: "problem", icon: "📊", title: `Approval ${Math.round(n.approval)}%`, text: topCause(n.approvalParts), level: 2, go: "people" });
  // Watched.
  for (const id of w.watch) {
    const m = w.nations[id];
    if (!m) continue;
    const ne = m.pol.elections[0];
    out.push({ id: `watch${id}`, kind: "watch", icon: "👁️", title: m.name, text: `Approval ${Math.round(m.approval)}%, stability ${Math.round(m.stability)}.${ne ? ` Votes ${fmtDate(ne.day, true)}.` : ""}`, level: 0, go: `nation:${id}`, ref: id });
  }
  return out.sort((x, y) => y.level - x.level || (x.due ?? 1e9) - (y.due ?? 1e9));
}

function topCause(parts: Part[], prefer?: string): string {
  const neg = parts.filter((p) => p.v < 0).sort((x, y) => x.v - y.v);
  const p = (prefer && neg.find((x) => x.label === prefer)) || neg[0];
  return p ? `Biggest drag: ${p.label.toLowerCase()} (${p.v.toFixed(1)}).` : "";
}
function weakest(n: Nation) {
  const s = n.sectors.map((x, i) => [x, i] as const).filter(([x]) => x.limitBy > 0.1).sort((x, y) => y[0].limitBy - x[0].limitBy)[0];
  return s ? `${SECTORS[s[1]].name}: ${s[0].limit.toLowerCase()}.` : "Weak demand.";
}
export function shortages(d: D, n: Nation): string[] {
  const out: [number, string][] = [];
  const av = d.avail[n.id];
  const D2 = d.demand[n.id];
  for (let g = 0; g < GOODS.length; g++) if (av[g] < 0.9 && D2[g] > n.gdp * 0.0005) out.push([av[g], `${GOODS[g].name} ${Math.round(av[g] * 100)}%`]);
  return out.sort((x, y) => x[0] - y[0]).map((x) => x[1]);
}

/* ------------------------------------------------------------------ the monthly report */

export interface Snapshot {
  day: number;
  gdp: number;
  growth: number;
  unemp: number;
  inflation: number;
  approval: number;
  stability: number;
  debt: number;
  balance: number;
  served: number;
  parts: Part[];
}
export function snapshot(w: World, d: D, n: Nation): Snapshot {
  return { day: w.day, gdp: n.gdp, growth: n.growth, unemp: n.unemp, inflation: n.inflation, approval: n.approval, stability: n.stability, debt: n.debt, balance: d.budget[n.id].balance, served: d.elec[n.id].served, parts: n.approvalParts.slice(0, 8) };
}

export function monthlyReport(w: World, d: D, n: Nation, prev: Snapshot | null): string[] {
  const now = snapshot(w, d, n);
  const lines: string[] = [];
  if (!prev) return [`Approval ${Math.round(now.approval)}%, stability ${Math.round(now.stability)}.`];
  const dA = now.approval - prev.approval;
  const moved = now.parts
    .map((p) => [p.label, p.v - (prev.parts.find((q) => q.label === p.label)?.v ?? 0)] as const)
    .filter((x) => Math.abs(x[1]) > 0.3)
    .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
    .slice(0, 3);
  lines.push(`Approval ${Math.round(now.approval)}% (${dA >= 0 ? "+" : ""}${dA.toFixed(1)})${moved.length ? `: ${moved.map(([l, v]) => `${l.toLowerCase()} ${v >= 0 ? "+" : ""}${v.toFixed(1)}`).join(", ")}` : ""}.`);
  lines.push(`Growth ${pct(now.growth)} a year, unemployment ${pct(now.unemp)} (${now.unemp > prev.unemp ? "up" : "down"} from ${pct(prev.unemp)}), inflation ${pct(now.inflation)}.`);
  lines.push(`Budget ${now.balance >= 0 ? "surplus" : "deficit"} ${money(Math.abs(now.balance))} a year (${pct(Math.abs(now.balance) / Math.max(1, now.gdp))} of GDP); debt ${money(now.debt)} (${pct(now.debt / Math.max(1, now.gdp), 0)}).`);
  if (now.served < 0.99 || prev.served < 0.99) lines.push(`Electricity: ${pct(now.served, 0)} of demand met${d.elec[n.id].fuelShort ? ` (${d.elec[n.id].fuelShort})` : ""}.`);
  const held = n.sectors.map((s, i) => [s, i] as const).filter(([s]) => s.limitBy > 0.08).sort((x, y) => y[0].limitBy * y[0].out - x[0].limitBy * x[0].out).slice(0, 2);
  for (const [s, i] of held) lines.push(`${SECTORS[i].name} held back ${pct(s.limitBy, 0)}: ${s.limit.toLowerCase()}.`);
  return lines;
}

/* ------------------------------------------------------------------ ministers */

export function advice(w: World, d: D, n: Nation, p: PortfolioId): string[] {
  const out: string[] = [];
  const b = d.budget[n.id];
  const gdp = Math.max(1, n.gdp);
  switch (p) {
    case "finance": {
      const def = -b.balance / gdp;
      out.push(`We're running a ${def > 0 ? "deficit" : "surplus"} of ${pct(Math.abs(def))} of GDP; debt is ${pct(n.debt / gdp, 0)} and costs us ${money(n.debt * n.debtRate)} a year in interest.`);
      if (def > 0.05) out.push(n.market ? `Markets charge us ${pct(n.yield)}. Another year like this and the rating slips.` : "We can't borrow. Cut, tax, go to the IMF, or print — each has a price.");
      const top = b.rev[0];
      if (top) out.push(`Our biggest tax is ${top.label.toLowerCase()} (${money(top.v)}).`);
      break;
    }
    case "economy": {
      out.push(`Growth is ${pct(n.growth)}; unemployment ${pct(n.unemp)}.`);
      const held = n.sectors.map((s, i) => [s, i] as const).filter(([s]) => s.limitBy > 0.05).sort((x, y) => y[0].limitBy * y[0].out - x[0].limitBy * x[0].out)[0];
      if (held) out.push(`${SECTORS[held[1]].name} is ${pct(held[0].limitBy, 0)} below what it could make: ${held[0].limit.toLowerCase()}.`);
      const short = shortages(d, n);
      if (short.length) out.push(`We're short of ${short.slice(0, 3).join(", ").toLowerCase()}.`);
      if (d.access[n.id] < 0.95) out.push(`${pct(1 - d.access[n.id], 0)} of our trade is blocked: ${d.accessWhy[n.id]}.`);
      break;
    }
    case "energy": {
      const e = d.elec[n.id];
      out.push(`We use ${Math.round(e.demand)} TWh a year and make ${Math.round(e.gen)}${e.imported > 0.5 ? `, importing ${Math.round(e.imported)}` : ""}.`);
      if (e.fuelShort) out.push(`${e.fuelShort}. Release the strategic reserve or find another supplier.`);
      if (e.served < 0.98) out.push("We're rationing power. New plants take a year (solar) to nine (nuclear); batteries and interconnectors are quickest.");
      const res = Object.entries(n.reserve).filter(([, v]) => v > 0);
      if (res.length) out.push(`Strategic reserves: ${res.map(([k, v]) => `${GOODS.find((g) => g.id === k)?.name} ${Math.round((v / Math.max(1e-6, d.demand[n.id][GOODS.findIndex((g) => g.id === k)])) * 365)} days`).join(", ")}.`);
      break;
    }
    case "labour": {
      const angry = n.groups.map((g, i) => [g, i] as const).filter(([g]) => g.mil > 40).sort((x, y) => y[0].mil - x[0].mil);
      if (angry.length) out.push(`${GROUPS[angry[0][1]].name} are the angriest (militancy ${Math.round(angry[0][0].mil)}): ${angry[0][0].parts.filter((q) => q.v < 0).slice(0, 2).map((q) => q.label.toLowerCase()).join(" and ")}.`);
      else out.push("Industrial relations are calm.");
      out.push(`Minimum wage law: ${n.laws.min_wage}; working week: ${n.laws.hours} hours; retirement at ${n.laws.retirement}.`);
      break;
    }
    case "health": {
      const h = n.services.health;
      out.push(`Hospitals are at ${Math.round(h.quality * 100)}%${h.limit ? `: ${h.limit.toLowerCase()}` : ""}.`);
      if (h.limit.startsWith("Short of staff")) out.push(`Money alone won't fix it: new doctors and nurses take ${SERVICES[0].train} years to train. Fund more places now, raise pay to keep the ones we have, or recruit abroad.`);
      if (h.limit.startsWith("Short of hospital")) out.push("We need beds: building takes over two years.");
      if (h.limit === "Short of supplies") out.push("We can't get enough medicines: they're short on the world market or we're not paying for them.");
      break;
    }
    case "education": {
      const e = n.services.education;
      out.push(`Schools are at ${Math.round(e.quality * 100)}%${e.limit ? `: ${e.limit.toLowerCase()}` : ""}.`);
      out.push(`Research budget ${money(n.spend.research)} a year.`);
      break;
    }
    case "interior": {
      out.push(`Crime ${pct(n.crime)}; police at ${Math.round(n.services.police.quality * 100)}%.`);
      const pr = w.protests.filter((x) => x.nation === n.id && !x.over);
      if (pr.length) out.push(`${pr.length} protest${pr.length > 1 ? "s" : ""} going on. Heavy-handed policing angers everyone who values liberty.`);
      break;
    }
    case "justice":
      out.push(`Courts at ${Math.round(n.services.justice.quality * 100)}%, prisons at ${Math.round(n.services.prisons.quality * 100)}%${n.services.prisons.limit ? ` (${n.services.prisons.limit.toLowerCase()})` : ""}.`);
      if (n.laws.cannabis === "prohibition") out.push("Prohibition fills the prisons; decriminalising would free up cells.");
      break;
    case "housing":
      out.push(`Rents are ${n.housing.rent > 1 ? "up" : "down"} ${pct(Math.abs(n.housing.rent - 1))} since we took office; mortgages at ${pct(n.housing.mortgage)}.`);
      if (n.laws.rent_control === "strict") out.push("The rent freeze is holding rents but builders are walking away.");
      break;
    case "foreign": {
      const worst = n.rel.map((r, i) => [r, i] as const).filter(([, i]) => i !== n.id && w.nations[i]?.alive).sort((x, y) => x[0] - y[0])[0];
      const best = n.rel.map((r, i) => [r, i] as const).filter(([, i]) => i !== n.id && w.nations[i]?.alive).sort((x, y) => y[0] - x[0])[0];
      if (best) out.push(`Closest friend: ${w.nations[best[1]].name} (${Math.round(best[0])}).`);
      if (worst) out.push(`Worst relations: ${w.nations[worst[1]].name} (${Math.round(worst[0])}).`);
      const sanc = w.sanctions.filter((s) => s.on === n.id).length;
      if (sanc) out.push(`${sanc} countries sanction us.`);
      break;
    }
    case "defence": {
      const c = defenceCost(n);
      out.push(`${people(n.mil.personnel)} under arms; ${Math.round(n.mil.ammo)} days of ammunition. Army loyalty ${Math.round(n.mil.loyalty)}.`);
      out.push(`Pay and upkeep cost ${money(c.required)}; the budget is ${money(n.spend.defence)}, leaving ${money(Math.max(0, n.spend.defence - c.required))} for new kit.`);
      if (n.mil.orders.length) out.push(`${n.mil.orders.length} orders in production.`);
      break;
    }
    case "environment":
      out.push(`We emit ${Math.round(n.emissions)} Mt of CO2 a year. The world is ${w.climate.temp.toFixed(2)}°C warmer than before industry.`);
      out.push(`Carbon price: $${n.laws.carbon}/t.`);
      break;
  }
  return out;
}

export function portfolioName(p: PortfolioId) {
  return PORTFOLIOS.find((x) => x.id === p)?.name ?? p;
}
