/**
 * The customisation update. Policies you write and announce, then deliver (or drop, or break);
 * executive orders, events and crises of your own design; your party's brand (name, colour,
 * slogan, logo); your leader's profile (name, nickname, background, catchphrase, look); the
 * names of ministries, offices, houses, the country and its regions; national holidays; a
 * speech writer; and bills you name and amend.
 *
 * Everything the player makes is checked and kept within limits: the more a thing does, the
 * more it costs or the riskier it is.
 *
 * Works on sim.ts's state and seeded stream; nothing at the top level uses another module's
 * values (sim.ts imports this file and this file imports sim.ts).
 */
import type { EventDef } from "./data";
import * as C from "./campaign";
import * as K from "./career";
import * as P from "./politics";
import * as S from "./society";
import * as G from "./sim";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const num = (v: unknown, lo: number, hi: number) => clamp(Number(v) || 0, lo, hi);

/** Plain text: no control characters or angle brackets, single spaces, at most `max` characters. */
export const clean = (t: unknown, max: number) =>
  [...String(t ?? "")]
    .filter((ch) => ch >= " " && ch !== "\u007f" && ch !== "<" && ch !== ">")
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
/** An icon: the first emoji (or symbol) of what was typed. */
export const iconOf = (t: unknown, fallback: string) => {
  const ch = [...String(t ?? "").trim()].slice(0, 2).join("").trim();
  return ch && !/[<>]/.test(ch) ? ch : fallback;
};
const cleanGroups = (g: unknown, lo: number, hi: number, max: number) => {
  const out: Record<string, number> = {};
  if (!g || typeof g !== "object") return out;
  for (const [k, v] of Object.entries(g as Record<string, unknown>)) {
    if (!P.GROUP[k]) continue;
    const n = Math.round(num(v, lo, hi));
    if (n) out[k] = n;
    if (Object.keys(out).length >= max) break;
  }
  return out;
};

// ------------------------------------------------------------------ policies

export type PolicyArea = "economy" | "health" | "education" | "environment" | "crime" | "housing" | "welfare" | "defence" | "culture" | "tech";
export const AREAS: { id: PolicyArea; name: string; icon: string }[] = [
  { id: "economy", name: "Economy", icon: "📈" },
  { id: "health", name: "Health", icon: "🏥" },
  { id: "education", name: "Education", icon: "📚" },
  { id: "environment", name: "Environment", icon: "🌿" },
  { id: "crime", name: "Crime", icon: "🚔" },
  { id: "housing", name: "Housing", icon: "🏘️" },
  { id: "welfare", name: "Welfare", icon: "🤲" },
  { id: "defence", name: "Defence", icon: "🛡️" },
  { id: "culture", name: "Culture", icon: "🎭" },
  { id: "tech", name: "Technology", icon: "💻" },
];

export interface PolicyDraft {
  name: string;
  icon: string;
  about: string;
  area: PolicyArea;
  /** Running cost, billions a year at Avalon's scale (negative raises money). */
  cost: number;
  happiness: number;
  growth: number;
  unemployment: number;
  /** How much better it makes the area's society index (negative: worse). */
  impact: number;
  /** Voter groups it's for (+) and against (-). */
  groups: Record<string, number>;
  /** Weeks to deliver it in. */
  weeks: number;
}

export interface Policy extends Omit<PolicyDraft, "weeks"> {
  id: number;
  status: "announced" | "delivered" | "scrapped" | "broken";
  week: number;
  deadline: number;
  done?: number;
}

export const POLICY_LIMITS = { cost: [-30, 60], happiness: [-3, 4], growth: [-0.3, 0.3], unemployment: [-0.8, 0.8], impact: [-10, 10], weeks: [13, 104] } as const;
export const POLICY_MAX = 6;
export const DELIVERED_MAX = 12;
export const ANNOUNCE_COST = 0.5;

/** How much a policy does (benefits), and how much it is allowed to do for its cost. */
export function policyBalance(d: Pick<PolicyDraft, "cost" | "happiness" | "growth" | "unemployment" | "impact" | "groups">) {
  const fans = Object.values(d.groups ?? {}).reduce((a, v) => a + Math.max(0, v), 0);
  const does = d.happiness / 4 + d.growth / 0.3 - d.unemployment / 0.8 + d.impact / 10 + fans / 6;
  const allowed = 0.5 + d.cost / 15;
  return { does: Math.round(does * 1000) / 1000, allowed: Math.round(allowed * 1000) / 1000 };
}

/** Check a policy. Returns it tidied, or why it can't be. */
export function checkPolicy(d: PolicyDraft): Omit<PolicyDraft, "weeks"> & { weeks: number } | string {
  const name = clean(d.name, 40);
  if (name.length < 3) return "Give the policy a name (at least 3 letters).";
  if (!AREAS.some((a) => a.id === d.area)) return "Pick an area.";
  const L = POLICY_LIMITS;
  const out = {
    name,
    icon: iconOf(d.icon, AREAS.find((a) => a.id === d.area)!.icon),
    about: clean(d.about, 120),
    area: d.area,
    cost: Math.round(num(d.cost, L.cost[0], L.cost[1])),
    happiness: Math.round(num(d.happiness, L.happiness[0], L.happiness[1]) * 10) / 10,
    growth: Math.round(num(d.growth, L.growth[0], L.growth[1]) * 100) / 100,
    unemployment: Math.round(num(d.unemployment, L.unemployment[0], L.unemployment[1]) * 10) / 10,
    impact: S.areaSoc(d.area) ? Math.round(num(d.impact, L.impact[0], L.impact[1])) : 0,
    groups: cleanGroups(d.groups, -2, 2, 4),
    weeks: Math.round(num(d.weeks, L.weeks[0], L.weeks[1])),
  };
  const fans = Object.values(out.groups).reduce((a, v) => a + Math.max(0, v), 0);
  if (fans > 3) return "A policy can be for three groups' worth at most.";
  const b = policyBalance(out);
  if (b.does > b.allowed + 1e-9) return "It does too much for what it costs: raise the cost or tone it down.";
  return out;
}

/** A policy's running cost for this country (billions a year). */
export const policyCost = (s: G.GameState, p: Pick<Policy, "cost" | "area">) => p.cost * (s.sc.economy.gdp / 18) * (priorityArea(s, p.area) && p.cost > 0 ? 0.8 : 1);
const priorityArea = (s: G.GameState, area: PolicyArea) => s.gov.head === s.you && ({ economy: "economy", crime: "security", environment: "environment" } as Record<string, string>)[area] === s.ox?.priority;

export const TEMPLATES: (Omit<PolicyDraft, "weeks"> & { weeks?: number })[] = [
  { name: "Free school meals", icon: "🍎", about: "A hot lunch for every child.", area: "education", cost: 6, happiness: 0.6, growth: 0, unemployment: 0, impact: 4, groups: { workers: 1, young: 1 } },
  { name: "20,000 more police", icon: "👮", about: "Bobbies back on the beat.", area: "crime", cost: 5, happiness: 0.2, growth: 0, unemployment: 0, impact: 6, groups: { retirees: 1 } },
  { name: "Build 500,000 homes", icon: "🏗️", about: "The biggest building programme in fifty years.", area: "housing", cost: 20, happiness: 0, growth: 0.1, unemployment: -0.2, impact: 8, groups: { young: 2, rural: -1 } },
  { name: "Free childcare", icon: "🧸", about: "Thirty free hours a week from age one.", area: "welfare", cost: 14, happiness: 0.8, growth: 0, unemployment: -0.2, impact: 0, groups: { workers: 1, professionals: 1 } },
  { name: "Green energy grants", icon: "☀️", about: "Solar panels and heat pumps for every home.", area: "environment", cost: 8, happiness: 0, growth: 0, unemployment: 0, impact: 6, groups: { green: 2, rural: -1 } },
  { name: "Small business tax cut", icon: "🏪", about: "Lower taxes for firms with under fifty staff.", area: "economy", cost: 6, happiness: 0, growth: 0.12, unemployment: 0, impact: 0, groups: { business: 2 } },
  { name: "Digital skills for all", icon: "🧑‍💻", about: "Free coding and computer courses.", area: "tech", cost: 7, happiness: 0, growth: 0.05, unemployment: -0.1, impact: 3, groups: { young: 1, professionals: 1 } },
  { name: "Cut waiting lists", icon: "⏱️", about: "Evening and weekend operations.", area: "health", cost: 11, happiness: 1, growth: 0, unemployment: 0, impact: 6, groups: { retirees: 2 } },
  { name: "Pension triple lock", icon: "🔒", about: "Pensions rise with prices, wages or 2.5%.", area: "welfare", cost: 12, happiness: 0.8, growth: 0, unemployment: 0, impact: 0, groups: { retirees: 2, young: -1 } },
  { name: "Rural broadband", icon: "📶", about: "Fast internet in every village.", area: "tech", cost: 7, happiness: 0, growth: 0.05, unemployment: 0, impact: 4, groups: { rural: 2 } },
  { name: "Arts and culture fund", icon: "🎭", about: "Theatres, galleries and festivals.", area: "culture", cost: 3, happiness: 0.5, growth: 0, unemployment: 0, impact: 0, groups: { professionals: 1, young: 1 } },
  { name: "Veterans' support", icon: "🎖️", about: "Homes, jobs and care for veterans.", area: "defence", cost: 3, happiness: 0.2, growth: 0, unemployment: 0, impact: 0, groups: { retirees: 1, rural: 1 } },
  { name: "Clean rivers plan", icon: "🏞️", about: "No more sewage in rivers and seas.", area: "environment", cost: 4, happiness: 0, growth: 0, unemployment: 0, impact: 4, groups: { green: 1, rural: 1 } },
  { name: "Means-test benefits", icon: "✂️", about: "Help only for those who need it.", area: "welfare", cost: -10, happiness: -0.6, growth: 0, unemployment: 0, impact: -3, groups: { business: 1, workers: -2 } },
  { name: "Sell state assets", icon: "🏷️", about: "Sell off state shares to pay down debt.", area: "economy", cost: -4, happiness: -0.4, growth: 0.03, unemployment: 0, impact: 0, groups: { business: 1, workers: -2 } },
  { name: "Youth clubs", icon: "🏀", about: "Somewhere to go after school.", area: "crime", cost: 3, happiness: 0, growth: 0, unemployment: 0, impact: 3, groups: { young: 1, faith: 1 } },
  { name: "Electric car grants", icon: "🔌", about: "Money off a new electric car.", area: "environment", cost: 6, happiness: 0, growth: 0, unemployment: 0, impact: 4, groups: { green: 1, professionals: 1, rural: -1 } },
  { name: "National ID cards", icon: "🪪", about: "One card for every citizen.", area: "crime", cost: 4, happiness: 0, growth: 0, unemployment: 0, impact: 3, groups: { retirees: 1, young: -2, professionals: -1 } },
];

const youName = (s: G.GameState) => G.fullName(G.pol(s, s.you)!);
const groupsMove = (s: G.GameState, groups: Record<string, number>, k: number) => {
  for (const [g, v] of Object.entries(groups)) P.courtGroup(s, g, v * k);
};

/** Announce a policy: it's a promise now. */
export function announcePolicy(s: G.GameState, d: PolicyDraft): Policy | string {
  const st = s.studio;
  if (st.policies.filter((p) => p.status === "announced").length >= POLICY_MAX) return `You have ${POLICY_MAX} policies waiting already: deliver or drop one first.`;
  const ps = s.parties[s.party];
  if (ps.funds < ANNOUNCE_COST) return "Not enough party funds for the launch.";
  const c = checkPolicy(d);
  if (typeof c === "string") return c;
  if (st.policies.some((p) => p.name.toLowerCase() === c.name.toLowerCase() && (p.status === "announced" || p.status === "delivered"))) return "You've already got a policy with that name.";
  ps.funds -= ANNOUNCE_COST;
  const { weeks, ...rest } = c;
  const p: Policy = { ...rest, id: st.nextPolicy++, status: "announced", week: s.week, deadline: s.week + weeks };
  st.policies.unshift(p);
  if (st.policies.length > 40) st.policies.length = 40;
  groupsMove(s, p.groups, 2);
  const camp = s.campaign[s.party];
  for (let i = 0; i < camp.length; i++) camp[i] = clamp(camp[i] + 0.8, -20, 40);
  P.pressEvent(s, 1);
  G.news(s, "party", `${p.icon} ${youName(s)} announces a new policy: ${p.name}`, 1);
  return p;
}

/** Why you can't deliver a policy now (or null). */
export function deliverBlocked(s: G.GameState, p: Policy): string | null {
  if (p.status !== "announced") return "That policy isn't waiting to be delivered.";
  if (!G.inGovernment(s)) return "You need to be in government to deliver it.";
  if (s.studio.policies.filter((x) => x.status === "delivered").length >= DELIVERED_MAX) return `You're running ${DELIVERED_MAX} programmes already: end one first.`;
  if (s.gov.parties[0] !== s.party && (s.partners[s.party] ?? 60) < 35) return `The ${G.party(s, s.gov.parties[0]).short} won't agree to it.`;
  return null;
}

export function deliverPolicy(s: G.GameState, id: number): string | null {
  const p = s.studio.policies.find((x) => x.id === id);
  if (!p) return "Unknown policy.";
  const why = deliverBlocked(s, p);
  if (why) return why;
  p.status = "delivered";
  p.done = s.week;
  groupsMove(s, p.groups, 4);
  s.stats.approval = clamp(s.stats.approval + 1.5, 5, 95);
  S.improve(s, "trust", 3);
  s.score += 40;
  C.note(s, "policiesDelivered");
  K.mark(s, p.icon, `Delivered: ${p.name}`);
  G.news(s, "government", `${p.icon} Promise kept: ${p.name} is delivered`, 1);
  return null;
}

/** Drop a policy: a U-turn if it was only announced, the end of a programme if it was running. */
export function scrapPolicy(s: G.GameState, id: number): string | null {
  const p = s.studio.policies.find((x) => x.id === id);
  if (!p || (p.status !== "announced" && p.status !== "delivered")) return "Nothing to drop.";
  const was = p.status;
  p.status = "scrapped";
  if (was === "announced") {
    groupsMove(s, p.groups, -3);
    if (G.inGovernment(s)) s.stats.approval = clamp(s.stats.approval - 1.5, 5, 95);
    S.improve(s, "trust", -4);
    P.pressEvent(s, -2);
    C.note(s, "uTurns");
    G.news(s, "party", `U-turn: ${youName(s)} drops ${p.name}`, -1);
  } else {
    groupsMove(s, p.groups, -2);
    G.news(s, "government", `${p.name} comes to an end`, 0);
  }
  return null;
}

// ------------------------------------------------------------------ executive orders of your own

export interface MyOrder extends Omit<P.OrderDef, "goodwill"> {
  goodwill: Record<string, number>;
  custom: true;
}
export const ORDER_LIMITS = { approval: [-3, 4], happiness: [-2, 2], budget: [-30, 20], growth: [-0.3, 0.3], unemployment: [-0.5, 0.5], cooldown: [8, 104] } as const;
export const MY_ORDERS_MAX = 8;

/** How likely the courts are to block an order (stronger orders, bigger risk). */
export function orderRisk(o: Pick<MyOrder, "approval" | "happiness" | "budget" | "growth" | "unemployment" | "goodwill" | "cooldown">) {
  const fans = Object.values(o.goodwill ?? {}).reduce((a, v) => a + Math.max(0, v), 0);
  const power = (o.approval ?? 0) / 4 + (o.happiness ?? 0) / 2 + (o.growth ?? 0) / 0.3 - (o.unemployment ?? 0) / 0.5 + Math.max(0, o.budget ?? 0) / 20 + fans / 12;
  const paid = Math.max(0, -(o.budget ?? 0)) / 20 + o.cooldown / 52;
  return Math.round(clamp(0.05 + Math.max(0, power - paid) * 0.25, 0.05, 0.6) * 100) / 100;
}

export function checkOrder(s: G.GameState, d: Partial<MyOrder>, id?: string): MyOrder | string {
  const name = clean(d.name, 36);
  if (name.length < 3) return "Give the order a name.";
  const L = ORDER_LIMITS;
  const o: MyOrder = {
    id: id ?? `my-order-${s.studio.nextId++}`,
    name,
    icon: iconOf(d.icon, "🖋️"),
    desc: clean(d.desc, 100) || "An order of your own.",
    cooldown: Math.round(num(d.cooldown ?? 26, L.cooldown[0], L.cooldown[1])),
    approval: Math.round(num(d.approval, L.approval[0], L.approval[1]) * 10) / 10,
    happiness: Math.round(num(d.happiness, L.happiness[0], L.happiness[1]) * 10) / 10,
    budget: Math.round(num(d.budget, L.budget[0], L.budget[1])),
    growth: Math.round(num(d.growth, L.growth[0], L.growth[1]) * 100) / 100,
    unemployment: Math.round(num(d.unemployment, L.unemployment[0], L.unemployment[1]) * 10) / 10,
    goodwill: cleanGroups(d.goodwill, -6, 6, 3),
    custom: true,
  };
  o.risk = orderRisk(o);
  return o;
}

export function saveOrder(s: G.GameState, d: Partial<MyOrder>, id?: string): MyOrder | string {
  const list = s.studio.orders;
  const i = id ? list.findIndex((x) => x.id === id) : -1;
  if (i < 0 && list.length >= MY_ORDERS_MAX) return `You can keep ${MY_ORDERS_MAX} orders of your own.`;
  const o = checkOrder(s, d, i >= 0 ? id : undefined);
  if (typeof o === "string") return o;
  if (i >= 0) list[i] = o;
  else list.push(o);
  return o;
}
export function deleteOrder(s: G.GameState, id: string) {
  const n = s.studio.orders.length;
  s.studio.orders = s.studio.orders.filter((o) => o.id !== id);
  return s.studio.orders.length < n;
}

export const ORDER_TEMPLATES: Partial<MyOrder>[] = [
  { name: "Free bus travel for under-21s", icon: "🚌", desc: "Every young person rides free.", budget: -4, goodwill: { young: 5 }, cooldown: 52 },
  { name: "Four-day week for civil servants", icon: "🗓️", desc: "A pilot in the public sector.", happiness: 0.5, growth: -0.05, goodwill: { workers: 3, business: -2 }, cooldown: 52 },
  { name: "Ban on new coal mines", icon: "⛏️", desc: "No new coal, ever.", growth: -0.05, goodwill: { green: 5, rural: -3 }, cooldown: 52 },
  { name: "Emergency food vouchers", icon: "🥫", desc: "Help for families who can't make ends meet.", budget: -6, happiness: 0.8, goodwill: { workers: 3 }, cooldown: 26 },
];

// ------------------------------------------------------------------ events of your own

export const MY_EVENTS_MAX = 12;
export interface EventDraft {
  name: string;
  icon: string;
  desc: string;
  scope: "state" | "national" | "self";
  boost: number;
  money: number;
  members: number;
  unity: number;
  group?: string;
  goodwill: number;
  risk: number;
}
export const EVENT_LIMITS = { boostState: 6, boostNational: 3, money: 6, members: 4000, unity: [-5, 10], goodwill: 6, risk: 0.4 } as const;

/** What an event of your own costs: about what the same thing costs among the built-in events, a little more. */
export function eventPrice(d: Pick<EventDraft, "scope" | "boost" | "money" | "members" | "unity" | "goodwill" | "risk">) {
  const v = d.boost * (d.scope === "national" ? 1.6 : d.scope === "state" ? 0.28 : 0) + d.members / 2500 + Math.max(0, d.unity) * 0.15 + d.goodwill * 0.09;
  const cost = v * (1 - d.risk * 1.5) + d.money * 0.35;
  return Math.round(Math.max(0.1, cost) * 100) / 100;
}

export function checkEvent(s: G.GameState, d: EventDraft, id?: string): EventDef | string {
  const name = clean(d.name, 32);
  if (name.length < 3) return "Give the event a name.";
  const scope = d.scope === "national" || d.scope === "self" ? d.scope : "state";
  const L = EVENT_LIMITS;
  const group = d.group && P.GROUP[d.group] ? d.group : undefined;
  const x = {
    scope,
    boost: scope === "self" ? 0 : Math.round(num(d.boost, 0, scope === "national" ? L.boostNational : L.boostState) * 10) / 10,
    money: Math.round(num(d.money, 0, L.money) * 10) / 10,
    members: Math.round(num(d.members, 0, L.members) / 100) * 100,
    unity: Math.round(num(d.unity, L.unity[0], L.unity[1])),
    goodwill: group ? Math.round(num(d.goodwill, 0, L.goodwill)) : 0,
    risk: Math.round(num(d.risk, 0, L.risk) * 100) / 100,
  } as const;
  if (!x.boost && !x.money && !x.members && !x.unity && !x.goodwill) return "Make it do something.";
  const ev: EventDef = { id: id ?? `my-event-${s.studio.nextId++}`, kind: "mine", name, icon: iconOf(d.icon, "✨"), desc: clean(d.desc, 100) || "An event of your own.", cost: eventPrice(x), scope: x.scope, boost: x.boost };
  if (x.money) {
    ev.money = x.money;
    ev.fund = true;
  }
  if (x.members) ev.members = x.members;
  if (x.unity) ev.unity = x.unity;
  if (group && x.goodwill) {
    ev.group = group;
    ev.goodwill = x.goodwill;
  }
  if (x.risk) ev.risk = x.risk;
  return ev;
}

export function saveEvent(s: G.GameState, d: EventDraft, id?: string): EventDef | string {
  const list = s.studio.events;
  const i = id ? list.findIndex((x) => x.id === id) : -1;
  if (i < 0 && list.length >= MY_EVENTS_MAX) return `You can keep ${MY_EVENTS_MAX} events of your own.`;
  const ev = checkEvent(s, d, i >= 0 ? id : undefined);
  if (typeof ev === "string") return ev;
  if (i >= 0) list[i] = ev;
  else list.push(ev);
  return ev;
}
export function deleteEvent(s: G.GameState, id: string) {
  const n = s.studio.events.length;
  s.studio.events = s.studio.events.filter((e) => e.id !== id);
  s.plan = s.plan.filter((p) => p.event !== id);
  return s.studio.events.length < n;
}

// ------------------------------------------------------------------ crises of your own

export const MY_CRISES_MAX = 10;
export const CRISIS_RATES = [
  { name: "Never", share: 0 },
  { name: "Sometimes", share: 0.15 },
  { name: "Often", share: 0.35 },
];
export const CRISIS_LIMITS = { approval: [-6, 6], happiness: [-3, 3], budget: [-40, 10], growth: [-0.5, 0.5], foreign: [-15, 15], goodwill: [-8, 8] } as const;

export function checkCrisis(s: G.GameState, d: Partial<P.CrisisDef>, id?: string): P.CrisisDef | string {
  const title = clean(d.title, 60);
  if (title.length < 4) return "Give the crisis a headline.";
  const opts = Array.isArray(d.options) ? d.options.slice(0, 3) : [];
  if (opts.length < 2) return "A crisis needs two or three choices.";
  const L = CRISIS_LIMITS;
  const options = opts.map((o) => ({
    label: clean(o.label, 48),
    approval: Math.round(num(o.approval, L.approval[0], L.approval[1])),
    happiness: Math.round(num(o.happiness, L.happiness[0], L.happiness[1]) * 10) / 10,
    budget: Math.round(num(o.budget, L.budget[0], L.budget[1])),
    growth: Math.round(num(o.growth, L.growth[0], L.growth[1]) * 100) / 100,
    foreign: Math.round(num(o.foreign, L.foreign[0], L.foreign[1])),
    goodwill: cleanGroups(o.goodwill, L.goodwill[0], L.goodwill[1], 2),
  }));
  if (options.some((o) => !o.label)) return "Every choice needs a name.";
  // A crisis is hard by definition: no option may be all upside.
  for (const o of options) {
    const up = Math.max(0, o.approval) / 3 + Math.max(0, o.happiness) / 1.5 + Math.max(0, o.growth) / 0.25 + Math.max(0, o.budget) / 5;
    const down = Math.max(0, -o.approval) / 3 + Math.max(0, -o.happiness) / 1.5 + Math.max(0, -o.growth) / 0.25 + Math.max(0, -o.budget) / 10 + Object.values(o.goodwill).reduce((a, v) => a + Math.max(0, -v), 0) / 6 + Math.max(0, -o.foreign) / 10;
    if (up > down + 1.01) return `"${o.label}" is all upside: a real crisis has a cost to every choice.`;
  }
  return { id: id ?? `my-crisis-${s.studio.nextId++}`, icon: iconOf(d.icon, "⚠️"), title, text: clean(d.text, 200) || title, options };
}

export function saveCrisis(s: G.GameState, d: Partial<P.CrisisDef>, id?: string): P.CrisisDef | string {
  const list = s.studio.crises;
  const i = id ? list.findIndex((x) => x.id === id) : -1;
  if (i < 0 && list.length >= MY_CRISES_MAX) return `You can keep ${MY_CRISES_MAX} crises of your own.`;
  const c = checkCrisis(s, d, i >= 0 ? id : undefined);
  if (typeof c === "string") return c;
  if (i >= 0) list[i] = c;
  else list.push(c);
  return c;
}
export function deleteCrisis(s: G.GameState, id: string) {
  if (s.crisis?.id === id) return false;
  const n = s.studio.crises.length;
  s.studio.crises = s.studio.crises.filter((c) => c.id !== id);
  return s.studio.crises.length < n;
}

// ------------------------------------------------------------------ the party's brand

export const REBRAND_COST = 3;
export const REBRAND_GAP = 26;
export interface Brand {
  name: string;
  short: string;
  color: string;
  slogan: string;
  logo: string;
  ideology: string;
}

const hexOk = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
const rgbOf = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const colourGap = (a: string, b: string) => {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** Rebrand the party. Returns why you can't, or null. */
export function rebrand(s: G.GameState, b: Brand): string | null {
  const st = s.studio;
  const me = G.party(s, s.party);
  const name = clean(b.name, 40);
  const short = clean(b.short, 6).toUpperCase();
  const color = String(b.color ?? "").toLowerCase();
  if (name.length < 3) return "The party needs a name.";
  if (short.length < 2) return "The short name needs 2 to 6 letters.";
  if (!hexOk(color)) return "Pick a colour.";
  for (const p of G.partyDefs(s)) {
    if (p.id === s.party) continue;
    if (p.name.toLowerCase() === name.toLowerCase() || p.short === short) return `The ${p.name} already use that name.`;
    if (colourGap(p.color, color) < 40) return `That colour is too close to the ${p.short}'s: voters would mix you up.`;
  }
  const big = name !== me.name || short !== me.short || color !== me.color.toLowerCase();
  const ideology = clean(b.ideology, 30) || me.ideology;
  if (big || ideology !== me.ideology) {
    if (s.week - st.brandAt < REBRAND_GAP) return `You rebranded ${s.week - st.brandAt} weeks ago: give the new look time.`;
    const ps = s.parties[s.party];
    if (ps.funds < REBRAND_COST) return "Not enough party funds for a rebrand.";
    ps.funds -= REBRAND_COST;
    st.brandAt = s.week;
    if (name !== me.name) ps.swing -= 0.01;
    if (ideology !== me.ideology) ps.unity = clamp(ps.unity - 4, 0, 100);
    ps.members = Math.round(ps.members * 1.02);
    P.pressEvent(s, 3);
    const old = me.name;
    me.name = name;
    me.short = short;
    me.color = color;
    me.ideology = ideology;
    C.note(s, "rebrands");
    K.mark(s, "🎨", `Rebranded the party as the ${name}`);
    G.news(s, "party", old === name ? `The ${name} unveil a new look` : `The ${old} relaunch as the ${name} (${short})`, 1);
  }
  st.slogan = clean(b.slogan, 60);
  st.logo = iconOf(b.logo, "");
  return null;
}

// ------------------------------------------------------------------ your leader

export const BACKGROUNDS: { id: string; name: string; icon: string; group: string; about: string }[] = [
  { id: "lawyer", name: "Lawyer", icon: "⚖️", group: "professionals", about: "Sharp at the dispatch box." },
  { id: "teacher", name: "Teacher", icon: "🍎", group: "young", about: "Young voters trust you." },
  { id: "soldier", name: "Soldier", icon: "🎖️", group: "retirees", about: "Calm in a crisis." },
  { id: "doctor", name: "Doctor", icon: "🩺", group: "retirees", about: "Health is your ground." },
  { id: "business", name: "Business owner", icon: "💼", group: "business", about: "Donors open their wallets." },
  { id: "union", name: "Union organiser", icon: "🛠️", group: "workers", about: "The movement is behind you." },
  { id: "farmer", name: "Farmer", icon: "🚜", group: "rural", about: "One of the countryside's own." },
  { id: "scientist", name: "Scientist", icon: "🔬", group: "green", about: "Facts first." },
  { id: "journalist", name: "Journalist", icon: "📰", group: "professionals", about: "You know how the press works." },
  { id: "pastor", name: "Faith leader", icon: "🕊️", group: "faith", about: "A moral voice." },
  { id: "athlete", name: "Athlete", icon: "🏅", group: "young", about: "A famous face, and charisma to spare." },
];

export interface LeaderDraft {
  first: string;
  last: string;
  nick: string;
  catchphrase: string;
  background?: string;
  /** A new look (a different face). */
  newLook?: boolean;
}

export function editLeader(s: G.GameState, d: LeaderDraft): string | null {
  const me = G.pol(s, s.you)!;
  const st = s.studio;
  const first = clean(d.first, 20);
  const last = clean(d.last, 24);
  if (first.length < 1 || last.length < 2) return "You need a first and a last name.";
  const bg = d.background && d.background !== st.background ? BACKGROUNDS.find((x) => x.id === d.background) : undefined;
  if (d.background && d.background !== st.background) {
    if (st.background) return "Your background is part of your story: it's set once.";
    if (!bg) return "Unknown background.";
  }
  const renamed = first !== me.first || last !== me.last;
  me.first = first;
  me.last = last;
  st.nick = clean(d.nick, 24);
  st.catchphrase = clean(d.catchphrase, 60);
  if (d.newLook) me.face = Math.floor(G.roll(s).next() * 1e6);
  if (bg) {
    st.background = bg.id;
    P.courtGroup(s, bg.group, 6);
    if (bg.id === "athlete") me.charisma = Math.min(10, me.charisma + 1);
    if (bg.id === "journalist") P.pressEvent(s, 3);
    if (bg.id === "union") s.parties[s.party].unity = clamp(s.parties[s.party].unity + 5, 0, 100);
  }
  if (renamed) G.news(s, "party", `The ${G.party(s, s.party).short} leader is now known as ${G.fullName(me)}`, 0);
  return null;
}
/** The background's natural constituency never falls far below friendly. */
const bgFloor = (s: G.GameState) => {
  const bg = BACKGROUNDS.find((x) => x.id === s.studio.background);
  if (bg && (s.goodwill[bg.group] ?? 0) < 4) s.goodwill[bg.group] = 4;
};
/** Fundraising, with a business owner at the top. */
export const fundK = (s: G.GameState) => (s.studio?.background === "business" ? 1.1 : 1);

// ------------------------------------------------------------------ names

export interface Names {
  country: string;
  head: string;
  leader: string;
  president: string;
  lower: string;
  lowerShort: string;
  upper: string;
  upperShort: string;
  ministries: Record<string, string>;
  regions: Record<number, string>;
}

/** Rename the country, its offices, houses, ministries and regions. */
export function rename(s: G.GameState, n: Partial<Names>): string | null {
  const sy = G.sys(s);
  const t = sy.titles;
  const set = (v: unknown, max: number, fallback: string) => clean(v, max) || fallback;
  if (n.country !== undefined) s.sc.name = set(n.country, 40, s.sc.name);
  if (n.head !== undefined) t.head = set(n.head, 30, t.head);
  if (n.leader !== undefined) t.leader = set(n.leader, 30, t.leader);
  if (n.president !== undefined && sy.pres) t.president = set(n.president, 30, t.president);
  if (n.lower !== undefined) sy.lower.name = set(n.lower, 40, sy.lower.name);
  if (n.lowerShort !== undefined) sy.lower.short = set(n.lowerShort, 14, sy.lower.short);
  if (n.upper !== undefined && sy.upper.kind !== "none") sy.upper.name = set(n.upper, 40, sy.upper.name);
  if (n.upperShort !== undefined && sy.upper.kind !== "none") sy.upper.short = set(n.upperShort, 14, sy.upper.short);
  if (n.ministries)
    for (const [k, v] of Object.entries(n.ministries)) {
      if (!P.PORTFOLIOS.some((p) => p.id === k)) continue;
      const name = clean(v, 40);
      if (name) s.studio.ministries[k] = name;
      else delete s.studio.ministries[k];
    }
  if (n.regions) {
    const c = G.country(s);
    for (const [k, v] of Object.entries(n.regions)) {
      const st = c.states[Number(k)];
      if (!st) continue;
      const name = clean(v, 30);
      if (name) s.studio.regions[Number(k)] = name;
      else delete s.studio.regions[Number(k)];
    }
    applyRegionNames(s);
  }
  return null;
}

/** The regions' own names (the map's are kept so a cleared rename goes back to them). */
const original = new WeakMap<object, string[]>();
export function applyRegionNames(s: G.GameState) {
  const c = G.country(s);
  let orig = original.get(c);
  if (!orig) original.set(c, (orig = c.states.map((x) => x.name)));
  c.states.forEach((x, k) => (x.name = s.studio?.regions?.[k] ?? orig![k]));
}

// ------------------------------------------------------------------ national holidays

export interface Holiday {
  name: string;
  icon: string;
  /** Week of the year, 1–52. */
  week: number;
}
export const HOLIDAYS_MAX = 3;

export function addHoliday(s: G.GameState, h: Holiday): string | null {
  if (s.gov.head !== s.you) return `Only the ${G.titles(s).head} can create a national holiday.`;
  if (s.studio.holidays.length >= HOLIDAYS_MAX) return `${HOLIDAYS_MAX} holidays of your own is plenty.`;
  const name = clean(h.name, 30);
  if (name.length < 3) return "Give the holiday a name.";
  const week = Math.round(num(h.week, 1, 52));
  if (s.studio.holidays.some((x) => x.week === week)) return "There's already a holiday that week.";
  s.studio.holidays.push({ name, icon: iconOf(h.icon, "🎉"), week });
  P.courtGroup(s, "business", -2);
  s.stats.approval = clamp(s.stats.approval + 1, 5, 95);
  C.note(s, "holidays");
  G.news(s, "government", `A new national holiday: ${name}, every year in week ${week}`, 1);
  return null;
}
export function removeHoliday(s: G.GameState, i: number) {
  if (!s.studio.holidays[i]) return false;
  s.studio.holidays.splice(i, 1);
  return true;
}

// ------------------------------------------------------------------ the speech writer

export const THEMES: { id: string; name: string; icon: string }[] = [
  { id: "economy", name: "The economy", icon: "📈" },
  { id: "cost", name: "Cost of living", icon: "🛒" },
  { id: "health", name: "Health", icon: "🏥" },
  { id: "housing", name: "Housing", icon: "🏘️" },
  { id: "climate", name: "Climate", icon: "🌍" },
  { id: "crime", name: "Crime", icon: "🚔" },
  { id: "immigration", name: "Immigration", icon: "🛂" },
  { id: "values", name: "Family & values", icon: "⛪" },
  { id: "unity", name: "Unity", icon: "🤝" },
  { id: "change", name: "Change", icon: "🔄" },
  { id: "security", name: "Security", icon: "🛡️" },
  { id: "future", name: "The future", icon: "🚀" },
];
export type Tone = "hopeful" | "fiery" | "sober" | "humble";
export const TONES: { id: Tone; name: string; about: string }[] = [
  { id: "hopeful", name: "Hopeful", about: "Lands when people feel good." },
  { id: "fiery", name: "Fiery", about: "Fires up the base before an election, or in opposition." },
  { id: "sober", name: "Sober", about: "What people want in hard times." },
  { id: "humble", name: "Humble", about: "Wins back trust after a broken promise." },
];
export type Length = "short" | "medium" | "long";
export interface SpeechDraft {
  themes: string[];
  tone: Tone;
  length: Length;
  line: string;
}
export const defaultSpeech = (): SpeechDraft => ({ themes: ["economy", "unity"], tone: "sober", length: "medium", line: "" });
export const SPEECH_GAP = 6;

/** How a speech goes down (points, about -3 to +4) and the line the papers quote. */
export function speechScore(s: G.GameState, d: SpeechDraft) {
  const iss = C.issues(s);
  const themes = [...new Set((d.themes ?? []).filter((t) => THEMES.some((x) => x.id === t)))].slice(0, 3);
  const head = s.gov.head === s.you;
  const gov = G.inGovernment(s);
  const crisis = !!s.crisis;
  const election = G.nextElection(s).week - s.week <= 12;
  const trust = s.soc?.idx.trust ?? 50;
  const hard = crisis || s.stats.growth < s.sc.economy.growth - 1;
  const t = (id: string) => {
    if (iss[id] !== undefined) return iss[id] * 10;
    if (id === "unity") return s.parties[s.party].unity < 50 ? 1.2 : 0.6;
    if (id === "change") return gov ? -0.5 : 1.5;
    if (id === "security") return crisis ? 1.5 : 0.3;
    return 0.8;
  };
  let pts = themes.length ? (themes.reduce((a, x) => a + t(x), 0) / themes.length) * 1.2 + (themes.length === 1 ? 0.5 : 0) - 1.4 : -1;
  const tone = d.tone;
  if (tone === "hopeful") pts += s.stats.approval > 45 || (!gov && !election) ? 1 : -0.5;
  else if (tone === "fiery") pts += election || !gov ? 1.5 : head && crisis ? -1 : 0;
  else if (tone === "sober") pts += hard ? 1.5 : 0;
  else if (tone === "humble") pts += trust < 42 || (s.counters.uTurns ?? 0) > 0 ? 2 : -0.5;
  const me = G.pol(s, s.you);
  pts += ((me?.charisma ?? 5) - 6) * 0.2;
  const line = clean(d.line, 90);
  const cp = s.studio?.catchphrase;
  if (cp && line.toLowerCase().includes(cp.toLowerCase())) pts += 0.5;
  const r = G.roll(s);
  if (d.length === "short") pts *= 0.8;
  else if (d.length === "long") pts = r.next() < 0.2 ? pts - 1.5 : pts * 1.25;
  pts = Math.round(clamp(pts, -3, 4) * 10) / 10;
  const quote = line || (themes.length ? `We will put ${THEMES.find((x) => x.id === themes[0])!.name.toLowerCase()} first` : "We will get on with the job");
  return { points: pts, quote };
}

/** Give a speech you wrote: an address to the nation in government, a major speech otherwise. */
export function giveSpeech(s: G.GameState, d: SpeechDraft): { points: number; quote: string } | string {
  if (s.week - s.studio.speechAt < SPEECH_GAP) return `Your next big speech can be in ${SPEECH_GAP - (s.week - s.studio.speechAt)} weeks.`;
  s.studio.speechAt = s.week;
  const r = speechScore(s, d);
  if (s.gov.head === s.you) s.stats.approval = clamp(s.stats.approval + r.points * 0.8, 5, 95);
  else {
    s.parties[s.party].swing += r.points * 0.004;
    const camp = s.campaign[s.party];
    for (let i = 0; i < camp.length; i++) camp[i] = clamp(camp[i] + Math.max(0, r.points) * 0.5, -20, 40);
  }
  P.pressEvent(s, r.points);
  C.note(s, "speeches");
  G.news(s, "party", `"${r.quote}": ${youName(s)}'s speech ${r.points >= 2 ? "brings the house down" : r.points >= 0.5 ? "goes down well" : r.points >= -0.5 ? "gets a mixed reception" : "falls flat"}`, r.points >= 0.5 ? 1 : r.points < -0.5 ? -1 : 0);
  return r;
}

// ------------------------------------------------------------------ bills: names and amendments

export const AMEND_COST = 0.3;

export function nameBill(s: G.GameState, billId: number, title: string): string | null {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || b.proposer !== s.you) return "Only bills you put forward.";
  const t = clean(title, 48);
  if (t && t.length < 3) return "A name needs at least 3 letters.";
  b.title = t || undefined;
  return null;
}

/** Change what your own bill does before it's voted on (in committee or the lower house). */
export function amendBill(s: G.GameState, billId: number, option: number): string | null {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || b.proposer !== s.you || b.budget) return "Only bills you put forward.";
  if (b.stage !== "committee" && b.stage !== "house") return "It's too late to amend it.";
  const l = G.lawOf(s, b.law);
  if (!l?.options[option] || option === s.laws[b.law]) return "Pick another option.";
  if (option === b.option) return "That's what it does already.";
  const ps = s.parties[s.party];
  if (ps.funds < AMEND_COST) return "Not enough party funds.";
  ps.funds -= AMEND_COST;
  b.option = option;
  b.voteAt = Math.max(b.voteAt, s.week + 1);
  b.amended = true;
  G.news(s, "law", `${youName(s)} amends the bill on ${l.name.toLowerCase()}: it now proposes ${l.options[option].label}`, 0);
  return null;
}

// ------------------------------------------------------------------ setup and the week

export interface Studio {
  policies: Policy[];
  nextPolicy: number;
  orders: MyOrder[];
  events: EventDef[];
  crises: P.CrisisDef[];
  crisisRate: number;
  nextId: number;
  brandAt: number;
  slogan: string;
  logo: string;
  nick: string;
  catchphrase: string;
  background: string;
  ministries: Record<string, string>;
  regions: Record<number, string>;
  holidays: Holiday[];
  speechAt: number;
}

export function initStudio(s: G.GameState) {
  s.studio ??= { policies: [], nextPolicy: 1, orders: [], events: [], crises: [], crisisRate: 1, nextId: 1, brandAt: -REBRAND_GAP, slogan: "", logo: "", nick: "", catchphrase: "", background: "", ministries: {}, regions: {}, holidays: [], speechAt: -SPEECH_GAP };
  if (Object.keys(s.studio.regions).length) applyRegionNames(s);
}

/** What delivered policies do to the economy each week (folded into sim.ts's economy). */
export function studioFx(s: G.GameState) {
  const fx = { happiness: 0, growth: 0, unemployment: 0, budget: 0 };
  for (const p of s.studio?.policies ?? []) {
    if (p.status !== "delivered") continue;
    fx.happiness += p.happiness;
    fx.growth += p.growth;
    fx.unemployment += p.unemployment;
    fx.budget -= p.cost * (priorityArea(s, p.area) && p.cost > 0 ? 0.8 : 1);
  }
  return fx;
}

/** The week for the things you made. */
export function studioWeek(s: G.GameState) {
  initStudio(s);
  const st = s.studio;
  // Promises with a deadline.
  for (const p of st.policies) {
    if (p.status !== "announced" || s.week < p.deadline) continue;
    p.status = "broken";
    groupsMove(s, p.groups, -4);
    if (G.inGovernment(s)) s.stats.approval = clamp(s.stats.approval - 2, 5, 95);
    S.improve(s, "trust", -6);
    C.note(s, "policiesBroken");
    K.mark(s, "💔", `Broke a promise: ${p.name}`);
    G.news(s, "party", `Broken promise: ${p.name} was never delivered`, -1);
  }
  // National holidays.
  for (const h of st.holidays)
    if (G.weekOf(s.week) === h.week) {
      s.boosts.happiness += 0.8;
      s.boosts.growth -= 0.02;
      G.news(s, "event", `${h.icon} Happy ${h.name}! The country takes the day off`, 1);
    }
  bgFloor(s);
}

/** An event by id: built in, or one of yours. */
export const myEvent = (s: G.GameState, id: string): EventDef | undefined => s.studio?.events.find((e) => e.id === id);
export const myOrder = (s: G.GameState, id: string): MyOrder | undefined => s.studio?.orders.find((o) => o.id === id);
export const myCrisis = (s: G.GameState, id: string): P.CrisisDef | undefined => s.studio?.crises.find((c) => c.id === id);
