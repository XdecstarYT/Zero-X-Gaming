/**
 * The campaign machine: a polling centre in the YouGov mould (voting intention by voter group
 * and by region, leader ratings, the issues that matter, seat projections), campaign staff,
 * the manifesto, the budget, Question Time, party scandals, moving the party on the compass,
 * election-night speeches and the career's achievements.
 *
 * Like politics.ts it works on sim.ts's state and its seeded stream. Nothing at the top level
 * uses another module's values (sim.ts, politics.ts and this file import each other).
 */
import { WEEKS, type Effects, type PartyId, type Pos } from "./data";
import * as K from "./career";
import * as P from "./politics";
import * as G from "./sim";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a: Pos, b: Pos) => Math.hypot(a.e - b.e, a.s - b.s);

/** Count something that happened (for the achievements). */
export function note(s: G.GameState, key: string, n = 1) {
  s.counters ??= {};
  s.counters[key] = (s.counters[key] ?? 0) + n;
}

// ------------------------------------------------------------------ the polling centre

/** Voting intention in every region at once (one pass over the counties). */
export function regionPolls(s: G.GameState): Record<PartyId, number>[] {
  const c = G.country(s);
  const ids = G.ids(s);
  const tot = c.states.map(() => new Array<number>(ids.length).fill(0));
  for (const sec of c.sections) G.sharesIn(s, sec.id).forEach((v, i) => (tot[sec.state][i] += v * sec.pop));
  return tot.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0) || 1;
    return Object.fromEntries(ids.map((id, i) => [id, row[i] / sum]));
  });
}

export interface LeaderRating {
  party: PartyId;
  leader: number;
  fav: number;
  unfav: number;
}

/** How each party leader is seen: favourable, unfavourable (the rest don't know them). */
export function leaderRatings(s: G.GameState, poll = G.nationalPoll(s)): LeaderRating[] {
  return G.running(s)
    .filter((id) => !G.party(s, id).others)
    .map((id) => {
      const ps = s.parties[id];
      const p = G.pol(s, ps.leader);
      const known = clamp(0.38 + (poll[id] ?? 0) * 1.4 + (s.gov.parties.includes(id) ? 0.12 : 0), 0.3, 0.96);
      let lean = ((p?.charisma ?? 5) - 6) * 0.05 + (ps.unity - 60) / 320;
      if (G.pol(s, s.gov.head)?.party === id || G.pol(s, s.president)?.party === id) lean += (s.stats.approval - 50) / 110;
      if (id === s.party) lean += P.pressLift(s) / 90;
      const fav = known * clamp(0.47 + lean, 0.08, 0.92);
      return { party: id, leader: ps.leader, fav, unfav: known - fav };
    })
    .sort((a, b) => b.fav - b.unfav - (a.fav - a.unfav));
}

export const ISSUES = [
  { id: "economy", name: "The economy", icon: "📈", group: "business" },
  { id: "cost", name: "Cost of living", icon: "🛒", group: "workers" },
  { id: "health", name: "Health", icon: "🏥", group: "retirees" },
  { id: "housing", name: "Housing", icon: "🏘️", group: "young" },
  { id: "immigration", name: "Immigration", icon: "🛂", group: "workers" },
  { id: "climate", name: "Climate", icon: "🌍", group: "green" },
  { id: "crime", name: "Crime", icon: "🚔", group: "retirees" },
  { id: "values", name: "Family & values", icon: "⛪", group: "faith" },
];
/** Crises that put an issue at the top of the news. */
const CRISIS_ISSUE: Record<string, string> = { pandemic: "health", housing: "housing", refugees: "immigration", wildfire: "climate", flood: "climate", storm: "climate", drought: "climate", oil: "cost", protest: "cost", bank: "economy", factory: "economy", strike: "economy", corruption: "crime", teachers: "values" };

/** The most important issues facing the country, as shares that add up to one. */
export function issues(s: G.GameState): Record<string, number> {
  const st = s.stats;
  const e = s.sc.economy;
  const law = (id: string) => s.laws[id] ?? 1;
  const raw: Record<string, number> = {
    economy: 14 + Math.max(0, e.growth - st.growth) * 10 + Math.max(0, st.unemployment - e.unemployment) * 5,
    cost: 13 + Math.max(0, e.happiness - st.happiness) * 1.2 + Math.max(0, -(s.budgetFx?.happiness ?? 0)) * 4 + Math.max(0, (s.mk?.inflation ?? 2) - 2.5) * 6,
    health: 11 + (law("healthcare") === 0 ? 5 : 0),
    housing: 8 + (law("housing") === 0 ? 5 : 0),
    immigration: 7 + (law("immigration") === 2 ? 7 : 0),
    climate: 6 + (law("energy") === 0 ? 4 : 0) + Math.max(0, s.goodwill?.green ?? 0) / 12,
    crime: 6 + (law("police") === 0 ? 5 : 0),
    values: 4 + (law("marriage") === 2 ? 3 : 0),
  };
  const hot = s.crisis ? CRISIS_ISSUE[s.crisis.id] : undefined;
  if (hot) raw[hot] += 16;
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / sum]));
}

export const MRP_COST = 1.5;
export const mrpCost = (s: G.GameState) => Math.round(MRP_COST * (1 - 0.15 * staffSkill(s, "pollster")) * 100) / 100;

/** Commission a seat projection from today's polls (it's kept until the next one). */
export function commissionMrp(s: G.GameState): string | null {
  const ps = s.parties[s.party];
  const cost = mrpCost(s);
  if (ps.funds < cost) return "Not enough party funds.";
  ps.funds -= cost;
  s.mrp = { week: s.week, ...G.projectSeats(s) };
  note(s, "mrp");
  return null;
}

// ------------------------------------------------------------------ campaign staff

export const ROLES = [
  { id: "manager", name: "Campaign manager", icon: "🧭", about: "Every event does more" },
  { id: "pollster", name: "Pollster", icon: "📊", about: "Cheaper polls and seat projections" },
  { id: "press", name: "Press secretary", icon: "🎙️", about: "Fewer backfires, kinder coverage, softer scandals" },
  { id: "finance", name: "Finance director", icon: "💼", about: "Fundraisers raise more; donors tire more slowly" },
  { id: "field", name: "Field director", icon: "🚪", about: "More members from every event" },
  { id: "speech", name: "Speechwriter", icon: "✍️", about: "Better debates and Question Time" },
];

export interface StaffMember {
  name: string;
  /** 1–5 stars. */
  skill: number;
  /** Millions a week. */
  salary: number;
}

/** How good the person in a role is (0 if it's empty). */
export const staffSkill = (s: G.GameState, role: string) => s.staff?.[role]?.skill ?? 0;
export const salaryFor = (skill: number) => Math.round((0.04 + skill * 0.035) * 100) / 100;
/** The weekly wage bill. */
export const payroll = (s: G.GameState) => Object.values(s.staff ?? {}).reduce((a, x) => a + x.salary, 0);
export const HIRE_REFRESH = 10;

function freshHires(s: G.GameState) {
  const r = G.roll(s);
  const names = G.namePool(s);
  s.hires = Object.fromEntries(
    ROLES.map((role) => [
      role.id,
      Array.from({ length: 3 }, () => {
        const skill = 1 + Math.floor(r.next() * r.next() * 5.99);
        return { name: `${r.pick(names.first)} ${r.pick(names.last)}`, skill, salary: salaryFor(skill) };
      }).sort((a, b) => b.skill - a.skill),
    ]),
  );
  s.hiresWeek = s.week;
}

export function hire(s: G.GameState, role: string, i: number): string | null {
  const c = s.hires[role]?.[i];
  if (!c) return "Nobody to hire.";
  if (s.parties[s.party].funds < c.salary * 4) return "You need a month's wages in the bank.";
  const before = s.staff[role];
  s.staff[role] = c;
  s.hires[role] = s.hires[role].filter((_, j) => j !== i);
  if (before) s.hires[role].push(before);
  G.news(s, "party", `${c.name} joins the ${G.party(s, s.party).short} as ${ROLES.find((x) => x.id === role)?.name.toLowerCase()}`, 1);
  return null;
}

export function fire(s: G.GameState, role: string) {
  if (!s.staff[role]) return false;
  delete s.staff[role];
  return true;
}

// ------------------------------------------------------------------ the manifesto

export interface Pledge {
  law: string;
  dir: number;
}
export const MANIFESTO_MAX = 4;
export const MANIFESTO_COST = 1;
/** You can publish one from this far out. */
export const MANIFESTO_WINDOW = 30;

/** The election the manifesto is for (a lower-house or presidential one). */
export function manifestoElection(s: G.GameState) {
  const ws = [s.cal.lower, s.cal.pres].filter((w) => w >= s.week);
  return ws.length ? Math.min(...ws) : -1;
}

export const manifestoOpen = (s: G.GameState) => {
  const w = manifestoElection(s);
  return w > 0 && w - s.week <= MANIFESTO_WINDOW && (!s.manifesto || s.manifesto.week !== w);
};

/** Publish your manifesto: the groups that like each pledge warm to you; your factions judge it. */
export function publishManifesto(s: G.GameState, pledges: Pledge[]): string | null {
  const w = manifestoElection(s);
  if (!manifestoOpen(s)) return w > 0 && s.manifesto?.week === w ? "You've already published one for this election." : `You can publish a manifesto in the ${MANIFESTO_WINDOW} weeks before an election.`;
  const clean = pledges.filter((p, i) => {
    const l = G.lawOf(s, p.law);
    return l && !l.constitutional && (p.dir === 1 || p.dir === -1) && l.options[s.laws[p.law] + p.dir] && pledges.findIndex((x) => x.law === p.law) === i;
  });
  if (!clean.length) return "Pick at least one pledge.";
  if (clean.length > MANIFESTO_MAX) return `${MANIFESTO_MAX} pledges at most.`;
  const ps = s.parties[s.party];
  if (ps.funds < MANIFESTO_COST) return "Not enough party funds.";
  ps.funds -= MANIFESTO_COST;
  s.manifesto = { week: w, pledges: clean };
  for (const p of clean) {
    for (const g of P.GROUPS) if (g.likes[p.law]) P.courtGroup(s, g.id, g.likes[p.law] * p.dir * 4);
    const l = G.lawOf(s, p.law)!;
    const from = l.options[s.laws[p.law]].pos;
    const to = l.options[s.laws[p.law] + p.dir].pos;
    for (const f of s.factions) f.mood = clamp(f.mood + (dist(from, f.pos) - dist(to, f.pos)) * 14, 0, 100);
  }
  ps.swing += 0.01;
  P.pressEvent(s, 2);
  G.news(s, "party", `The ${G.party(s, s.party).name} publish their manifesto: ${clean.map((p) => G.lawOf(s, p.law)!.name.toLowerCase()).join(", ")}`, 1);
  return null;
}

// ------------------------------------------------------------------ the budget

export interface BudgetArea {
  id: string;
  name: string;
  icon: string;
  /** The voter group that cares most (a tax rise annoys it instead). */
  group: string;
  /** Per step up, per year. */
  fx: Effects & { approval?: number };
  /** -1: the left likes more of it; +1: the right does. */
  lean: number;
}

export const BUDGET_AREAS: BudgetArea[] = [
  { id: "health", name: "Health", icon: "🏥", group: "retirees", fx: { happiness: 0.5, budget: -7 }, lean: -1 },
  { id: "education", name: "Schools & universities", icon: "📚", group: "young", fx: { growth: 0.05, happiness: 0.15, budget: -5 }, lean: -1 },
  { id: "welfare", name: "Welfare & pensions", icon: "🤲", group: "workers", fx: { happiness: 0.45, budget: -9 }, lean: -1 },
  { id: "defence", name: "Defence & police", icon: "🛡️", group: "rural", fx: { approval: 0.6, budget: -6 }, lean: 1 },
  { id: "infrastructure", name: "Infrastructure", icon: "🏗️", group: "business", fx: { growth: 0.08, unemployment: -0.12, budget: -7 }, lean: -0.4 },
  { id: "green", name: "Climate & energy", icon: "🌿", group: "green", fx: { happiness: 0.1, growth: 0.01, budget: -4 }, lean: -1 },
  { id: "tax", name: "Taxes", icon: "🧾", group: "business", fx: { budget: 12, happiness: -0.35, growth: -0.05 }, lean: -1 },
];
export const BUDGET_STEPS = ["Big cut", "Cut", "Hold", "Raise", "Big rise"];
export type BudgetPlan = Record<string, number>;
export const neutralPlan = (): BudgetPlan => Object.fromEntries(BUDGET_AREAS.map((a) => [a.id, 0]));

/** What a budget does to the country in a year. */
export function budgetEffects(plan: BudgetPlan) {
  const fx = { happiness: 0, growth: 0, budget: 0, unemployment: 0, approval: 0 };
  for (const a of BUDGET_AREAS) {
    const k = plan[a.id] ?? 0;
    fx.happiness += (a.fx.happiness ?? 0) * k;
    fx.growth += (a.fx.growth ?? 0) * k;
    fx.budget += (a.fx.budget ?? 0) * k;
    fx.unemployment += (a.fx.unemployment ?? 0) * k;
    fx.approval += (a.fx.approval ?? 0) * k;
  }
  return fx;
}

/** How much a party likes a budget (added to its stance on the vote). */
export function budgetLean(s: G.GameState, plan: BudgetPlan | undefined, partyId: PartyId) {
  return budgetLeanAt(plan, G.party(s, partyId).pos);
}

/** How much someone standing at a place on the compass likes a budget. */
export function budgetLeanAt(plan: BudgetPlan | undefined, p: Pos) {
  if (!plan) return 0;
  let u = 0;
  for (const a of BUDGET_AREAS) u += (plan[a.id] ?? 0) * a.lean * p.e * 0.12;
  // The right worries about deficits.
  u += budgetEffects(plan).budget * Math.max(0, p.e) * 0.004;
  return u;
}

/** The budget a party would write if it were in charge. */
export function aiBudget(s: G.GameState, partyId: PartyId): BudgetPlan {
  const r = G.roll(s);
  const e = G.party(s, partyId).pos.e;
  return Object.fromEntries(BUDGET_AREAS.map((a) => [a.id, clamp(Math.round(a.lean * e * 2.2 + (r.next() - 0.5) * 0.8), -2, 2)]));
}

/** As head of government, set this year's budget before it goes to the vote. */
export function draftBudget(s: G.GameState, plan: BudgetPlan): string | null {
  if (s.gov.head !== s.you) return `Only the ${G.titles(s).head} writes the budget.`;
  const clean = Object.fromEntries(BUDGET_AREAS.map((a) => [a.id, clamp(Math.round(plan[a.id] ?? 0), -2, 2)]));
  s.budgetDraft = { year: G.yearOf(s), plan: clean };
  return null;
}

/** The budget is due within this many weeks: time to write it. */
export const budgetDue = (s: G.GameState) => s.gov.head === s.you && G.weekOf(s.week) >= G.BUDGET_WEEK - 4 && G.weekOf(s.week) < G.BUDGET_WEEK && s.budgetDraft?.year !== G.yearOf(s);

/** The budget passed: its effects run for the year, and the groups it touches react. */
export function budgetPassed(s: G.GameState, plan: BudgetPlan | undefined, byYou: boolean) {
  const p = plan ?? neutralPlan();
  s.budgetFx = budgetEffects(p);
  if (byYou) {
    note(s, "budgets");
    K.mark(s, "💷", "Passed your own budget");
    for (const a of BUDGET_AREAS) {
      const k = p[a.id] ?? 0;
      if (k) P.courtGroup(s, a.group, (a.id === "tax" ? -k : k) * (k > 0 ? 3 : 4));
    }
  }
  const ups = BUDGET_AREAS.filter((a) => (p[a.id] ?? 0) > 0 && a.id !== "tax").map((a) => a.name.toLowerCase());
  const downs = BUDGET_AREAS.filter((a) => (p[a.id] ?? 0) < 0 && a.id !== "tax").map((a) => a.name.toLowerCase());
  const tax = p.tax ?? 0;
  const parts = [ups.length ? `more for ${ups.join(", ")}` : "", downs.length ? `cuts to ${downs.join(", ")}` : "", tax > 0 ? "higher taxes" : tax < 0 ? "tax cuts" : ""].filter(Boolean);
  return parts.length ? parts.join("; ") : "no big changes";
}

// ------------------------------------------------------------------ Question Time

export type QTRole = "ask" | "answer";
export interface QTState {
  week: number;
  topic: string;
  role: QTRole;
  rival: PartyId;
}
export const QT_EVERY = 3;
export const QT_STYLES: Record<QTRole, { id: string; name: string; about: string }[]> = {
  answer: [
    { id: "record", name: "Stand on your record", about: "Safe and steady." },
    { id: "attack", name: "Turn it on them", about: "Brilliant or a disaster." },
    { id: "heart", name: "Tell a story", about: "Charisma counts." },
    { id: "dodge", name: "Dodge the question", about: "Nobody's impressed, nobody's hurt." },
  ],
  ask: [
    { id: "record", name: "A forensic question", about: "Pin them down on the detail." },
    { id: "attack", name: "Go for the jugular", about: "Brilliant or a disaster." },
    { id: "heart", name: "A voter's story", about: "Charisma counts." },
  ],
};

/** The name of the weekly clash in this country. */
export const qtName = (s: G.GameState) => (G.sys(s).exec === "presidential" ? (s.president === s.you ? "Press briefing" : "Oversight hearing") : `${G.titles(s).head}'s Questions`);

function maybeQuestionTime(s: G.GameState) {
  if (s.qt || s.election || s.talks || G.weekOf(s.week) % QT_EVERY !== 0) return;
  const head = s.gov.head === s.you;
  const opp = !G.inGovernment(s) && (G.houseBy(s)[s.party] ?? 0) > 0;
  if (!head && !opp) return;
  const r = G.roll(s);
  const rival = head ? (G.running(s).filter((p) => !s.gov.parties.includes(p) && !G.party(s, p).others).sort((a, b) => (G.houseBy(s)[b] ?? 0) - (G.houseBy(s)[a] ?? 0))[0] ?? s.party) : s.gov.parties[0];
  s.qt = { week: s.week, topic: r.pick(P.DEBATE_TOPICS).id, role: head ? "answer" : "ask", rival };
}

/** Take part in Question Time. Returns the points (good above zero). */
export function answerQT(s: G.GameState, style: string) {
  const q = s.qt;
  if (!q) return null;
  s.qt = null;
  const r = G.roll(s);
  const ch = G.pol(s, s.you)?.charisma ?? 5;
  const sw = staffSkill(s, "speech") * 0.4;
  let pts = style === "record" ? 1 + r.next() * 3 : style === "attack" ? -5 + r.next() * 12 : style === "heart" ? (ch - 5) * 1.1 + (r.next() - 0.4) * 6 : -0.5 + r.next();
  if (style !== "dodge") pts += sw;
  pts = Math.round(pts * 10) / 10;
  const ps = s.parties[s.party];
  P.pressEvent(s, pts * 0.6);
  ps.swing += pts * 0.0025;
  if (pts > 2) ps.unity = clamp(ps.unity + 2, 0, 100);
  if (q.role === "ask" && pts > 0) s.parties[q.rival].swing -= pts * 0.0015;
  if (pts > 0) s.score += Math.round(pts * 3);
  if (pts >= 4) note(s, "qtWins");
  const topic = P.DEBATE_TOPICS.find((t) => t.id === q.topic)?.name ?? "the issues";
  G.news(s, "party", `${qtName(s)}: ${G.fullName(G.pol(s, s.you)!)} ${pts >= 4 ? "wins the exchange" : pts >= 1 ? "holds their own" : pts > -2 ? "has a quiet session" : "is mauled"} on ${topic}`, pts >= 1 ? 1 : pts <= -2 ? -1 : 0);
  return pts;
}

// ------------------------------------------------------------------ party scandals

export interface ScandalOption {
  label: string;
  about: string;
}
export const SCANDALS = [
  { id: "expenses", icon: "🧾", title: "An expenses row", text: "{who}, one of your lawmakers, claimed for a second home that turns out to be a holiday villa.", person: true },
  { id: "messages", icon: "📱", title: "Leaked messages", text: "Private messages in which {who} mocks voters are leaked to the press.", person: true },
  { id: "donor", icon: "💰", title: "A donor's past", text: "One of the party's biggest donors turns out to have ties to a firm accused of fraud.", person: false },
  { id: "posts", icon: "💬", title: "Old posts resurface", text: "Years-old posts by {who} resurface and cause outrage.", person: true },
  { id: "lobbying", icon: "🤝", title: "Cash for access", text: "{who} took paid work from a lobbying firm while voting on its clients' laws.", person: true },
];
export const SCANDAL_OPTIONS: ScandalOption[] = [
  { label: "Suspend them", about: "Swift and clean. Some of the party grumbles." },
  { label: "Stand by them", about: "The party rallies; the press doesn't let go." },
  { label: "Apologise", about: "Take the hit and move on." },
  { label: "Deny everything", about: "It might go away. It might get much worse." },
];
export interface ScandalState {
  id: string;
  week: number;
  who: number;
}

export const scandalText = (s: G.GameState, x: ScandalState, t: string) => t.replace(/\{who\}/g, G.pol(s, x.who) ? G.fullName(G.pol(s, x.who)!) : "a party official");

function maybeScandal(s: G.GameState) {
  if (s.scandal || s.week < s.nextScandal || s.election) return;
  const r = G.roll(s);
  const press = staffSkill(s, "press");
  const chance = 0.022 * (1 + Math.max(0, -P.pressLift(s)) / 20) * (1 - 0.08 * press);
  if (r.next() >= chance) return;
  const def = r.pick(SCANDALS);
  const mine = s.house.filter((id) => id !== s.you && G.pol(s, id)?.party === s.party);
  s.scandal = { id: def.id, week: s.week, who: def.person && mine.length ? r.pick(mine) : -1 };
  s.nextScandal = s.week + 14;
  G.news(s, "scandal", `${def.icon} ${def.title}: ${scandalText(s, s.scandal, def.text)}`, -1);
}

/** Respond to the scandal on the table. */
export function answerScandal(s: G.GameState, choice: number) {
  const x = s.scandal;
  if (!x) return null;
  s.scandal = null;
  const r = G.roll(s);
  const ps = s.parties[s.party];
  const soft = 1 - 0.08 * staffSkill(s, "press");
  let hit = 0;
  let worse = false;
  if (choice === 0) {
    hit = 0.012;
    ps.unity = clamp(ps.unity - 3, 0, 100);
    P.pressEvent(s, 2);
    if (x.id === "donor") ps.funds -= 3;
  } else if (choice === 1) {
    hit = 0.04;
    ps.unity = clamp(ps.unity + 3, 0, 100);
    P.pressEvent(s, -5);
  } else if (choice === 2) {
    hit = 0.02;
    P.pressEvent(s, 1);
  } else {
    worse = r.next() < 0.5;
    hit = worse ? 0.07 : 0;
    P.pressEvent(s, worse ? -8 : -1);
  }
  ps.swing -= hit * soft;
  const def = SCANDALS.find((d) => d.id === x.id)!;
  G.news(s, "scandal", choice === 3 ? (worse ? `${def.title}: the denial falls apart, and the story gets bigger` : `${def.title}: the story fades away`) : `${def.title}: the ${G.party(s, s.party).short} ${["suspend them", "stand firm", "apologise", ""][choice]}`, worse ? -1 : 0);
  return { worse };
}

// ------------------------------------------------------------------ moving the party

export const MOVE_COST = 2;
export const MOVE_GAP = 26;
export const MOVE_STEP = 0.1;
export const MOVE_MAX = 0.45;
export type MoveDir = "left" | "right" | "liberal" | "conservative";
const DIRS: Record<MoveDir, Pos> = { left: { e: -1, s: 0 }, right: { e: 1, s: 0 }, liberal: { e: 0, s: -1 }, conservative: { e: 0, s: 1 } };

/** Move your party a step on the compass. Voters follow where you stand; your factions react. */
export function moveParty(s: G.GameState, dir: MoveDir): string | null {
  const ps = s.parties[s.party];
  if (s.week - s.lastMove < MOVE_GAP) return `You can move again in ${MOVE_GAP - (s.week - s.lastMove)} weeks.`;
  if (ps.funds < MOVE_COST) return "Not enough party funds.";
  const def = G.partyDefs(s).find((p) => p.id === s.party)!;
  const d = DIRS[dir];
  const next = { e: clamp(def.pos.e + d.e * MOVE_STEP, -1, 1), s: clamp(def.pos.s + d.s * MOVE_STEP, -1, 1) };
  if (dist(next, s.pos0) > MOVE_MAX + 1e-6) return "That's as far as the party will go.";
  ps.funds -= MOVE_COST;
  for (const f of s.factions) f.mood = clamp(f.mood + (dist(def.pos, f.pos) - dist(next, f.pos)) * 40, 0, 100);
  def.pos = next;
  ps.unity = clamp(ps.unity - 3, 0, 100);
  ps.swing -= 0.01;
  s.lastMove = s.week;
  G.news(s, "party", `The ${def.name} move ${dir === "left" ? "to the left" : dir === "right" ? "to the right" : dir === "liberal" ? "in a liberal direction" : "in a conservative direction"}`, 0);
  return null;
}

// ------------------------------------------------------------------ election night

export const SPEECHES = {
  win: [
    { id: "gracious", name: "Gracious in victory", about: "Thank the voters, praise your rivals.", unity: 2, press: 4, factions: 0 },
    { id: "triumph", name: "A triumphant rally", about: "Fire up the party faithful.", unity: 8, press: -2, factions: 4 },
    { id: "unite", name: "Unite the country", about: "Speak to those who voted against you.", unity: 0, press: 6, factions: -2 },
  ],
  lose: [
    { id: "concede", name: "Concede with grace", about: "Congratulate the winners.", unity: -2, press: 5, factions: 0 },
    { id: "fight", name: "Fight on", about: "Promise the party you'll be back.", unity: 6, press: -1, factions: 3 },
    { id: "blame", name: "Blame the media", about: "The faithful cheer; the papers don't.", unity: 4, press: -9, factions: 2 },
  ],
};

/** Did the count go your way? */
export function electionWon(s: G.GameState, e: G.ElectionRun) {
  if (e.president) return e.president.party === s.party;
  const seats = e.contests.lower ? e.houseSeats : e.senateSeats;
  const prev = e.contests.lower ? e.prevHouse : e.prevSenate;
  const most = Math.max(...Object.values(seats));
  return (seats[s.party] ?? 0) === most || (seats[s.party] ?? 0) > (prev[s.party] ?? 0) * 1.1;
}

/** Your speech on election night (once a night). */
export function electionSpeech(s: G.GameState, id: string) {
  const e = s.election;
  if (!e || s.speech === e.week) return false;
  const list = electionWon(s, e) ? SPEECHES.win : SPEECHES.lose;
  const sp = list.find((x) => x.id === id);
  if (!sp) return false;
  s.speech = e.week;
  const ps = s.parties[s.party];
  ps.unity = clamp(ps.unity + sp.unity, 0, 100);
  P.pressEvent(s, sp.press);
  for (const f of s.factions) f.mood = clamp(f.mood + sp.factions, 0, 100);
  G.news(s, "election", `${G.fullName(G.pol(s, s.you)!)}'s election-night speech: ${sp.name.toLowerCase()}`, sp.press >= 0 ? 1 : 0);
  return true;
}

// ------------------------------------------------------------------ achievements

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  about: string;
  score: number;
  check: (s: G.GameState) => boolean;
}

const seatShare = (s: G.GameState) => (G.houseBy(s)[s.party] ?? 0) / Math.max(1, s.house.length);
export const ACHIEVEMENTS: Achievement[] = [
  { id: "firstLaw", name: "Lawmaker", icon: "📜", about: "Pass your first law", score: 50, check: (s) => s.lawsPassed >= 1 },
  { id: "tenLaws", name: "Statute book", icon: "📚", about: "Pass ten laws", score: 150, check: (s) => s.lawsPassed >= 10 },
  { id: "firstWin", name: "Victory night", icon: "🗳️", about: "Win an election", score: 150, check: (s) => s.electionsWon >= 1 },
  { id: "head", name: "Top job", icon: "🏛️", about: "Become head of government", score: 200, check: (s) => s.gov.head === s.you },
  { id: "president", name: "Commander", icon: "🦅", about: "Be elected President", score: 250, check: (s) => s.president === s.you },
  { id: "majority", name: "Majority", icon: "🧮", about: "Win half the lower house on your own", score: 200, check: (s) => seatShare(s) > 0.5 },
  { id: "landslide", name: "Landslide", icon: "🌊", about: "Hold two thirds of the lower house", score: 300, check: (s) => seatShare(s) >= 2 / 3 },
  { id: "coalition", name: "Coalition builder", icon: "🤝", about: "Lead a coalition government", score: 100, check: (s) => s.gov.parties[0] === s.party && s.gov.parties.length > 1 },
  { id: "debater", name: "Debate champion", icon: "🎙️", about: "Win a TV debate", score: 75, check: (s) => (s.counters.debatesWon ?? 0) >= 1 },
  { id: "qt", name: "Dispatch box", icon: "⚔️", about: "Win three Question Times", score: 75, check: (s) => (s.counters.qtWins ?? 0) >= 3 },
  { id: "survivor", name: "Survivor", icon: "🛡️", about: "Survive a leadership challenge", score: 100, check: (s) => (s.counters.challengesSurvived ?? 0) >= 1 },
  { id: "crises", name: "Steady hand", icon: "🧯", about: "Decide five crises in government", score: 120, check: (s) => (s.counters.crisesDecided ?? 0) >= 5 },
  { id: "referendum", name: "The people have spoken", icon: "✅", about: "Win a referendum", score: 100, check: (s) => (s.counters.referendumsWon ?? 0) >= 1 },
  { id: "trade", name: "Dealmaker", icon: "📦", about: "Sign a trade deal", score: 75, check: (s) => s.foreign.some((f) => f.deal) },
  { id: "diplomat", name: "Diplomat", icon: "🌐", about: "Be close allies with four countries", score: 75, check: (s) => s.foreign.filter((f) => f.rel >= 60).length >= 4 },
  { id: "budget", name: "Chancellor", icon: "💷", about: "Pass a budget you wrote", score: 100, check: (s) => (s.counters.budgets ?? 0) >= 1 },
  { id: "promises", name: "Promise keeper", icon: "🤞", about: "Keep five promises", score: 150, check: (s) => (s.counters.promisesKept ?? 0) >= 5 },
  { id: "members", name: "Mass movement", icon: "👥", about: "Grow the party by half", score: 100, check: (s) => s.parties[s.party].members >= (s.counters.members0 ?? Infinity) * 1.5 },
  { id: "warChest", name: "War chest", icon: "🏦", about: "Have 100 million in the bank", score: 100, check: (s) => s.parties[s.party].funds >= 100 },
  { id: "beloved", name: "Big tent", icon: "🎪", about: "Be liked by all eight voter groups", score: 150, check: (s) => P.GROUPS.every((g) => (s.goodwill[g.id] ?? 0) > 2) },
  { id: "press", name: "Press darling", icon: "📰", about: "Get much kinder coverage than usual", score: 75, check: (s) => P.pressLift(s) >= 10 },
  { id: "cabinet", name: "Dream team", icon: "⭐", about: "Lead a cabinet of eight five-star ministers", score: 100, check: (s) => s.gov.head === s.you && P.PORTFOLIOS.every((pf) => P.skill(G.pol(s, s.cabinet[pf.id] ?? -1)) >= 8) },
  { id: "staff", name: "Full house", icon: "🧑‍💼", about: "Hire all six campaign staff", score: 75, check: (s) => ROLES.every((r) => !!s.staff[r.id]) },
  { id: "mrp", name: "Numbers game", icon: "📊", about: "Commission a seat projection", score: 25, check: (s) => (s.counters.mrp ?? 0) >= 1 },
  { id: "regions", name: "Heartlands", icon: "🗺️", about: "Run half the regions", score: 150, check: (s) => s.governors.filter((id) => G.pol(s, id)?.party === s.party).length * 2 >= s.governors.length },
  { id: "year", name: "A year in power", icon: "📅", about: "Lead the government for a year", score: 150, check: (s) => s.gov.head === s.you && s.week - s.gov.since >= WEEKS },
  { id: "comeback", name: "Comeback", icon: "🔥", about: "Grow your seats by a fifth in one election", score: 150, check: (s) => (s.counters.comeback ?? 0) >= 1 },
  { id: "viral", name: "Gone viral", icon: "📱", about: "Have a post go viral", score: 50, check: (s) => (s.counters.viral ?? 0) >= 1 },
  { id: "judge", name: "Judge maker", icon: "⚖️", about: "Put a judge on the top court", score: 100, check: (s) => (s.counters.judges ?? 0) >= 1 },
  { id: "bull", name: "Bull market", icon: "🐂", about: "See the stock market up by half", score: 75, check: (s) => (s.mk?.index ?? 0) >= 1500 },
  { id: "aaa", name: "Triple A", icon: "🏅", about: "Lead a country rated AAA", score: 100, check: (s) => s.gov.head === s.you && s.mk?.rating === 0 },
  { id: "decade", name: "Old hand", icon: "🕰️", about: "Last ten years in politics", score: 100, check: (s) => s.week >= WEEKS * 10 },
];

/** Unlock anything newly earned. Returns what was. */
export function checkAchievements(s: G.GameState) {
  const out: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id] !== undefined) continue;
    if (!a.check(s)) continue;
    s.achievements[a.id] = s.week;
    s.score += a.score;
    out.push(a);
    K.mark(s, a.icon, `Achievement: ${a.name}`);
    G.news(s, "mission", `Achievement: ${a.name} (${a.about.toLowerCase()})`, 1);
  }
  return out;
}

// ------------------------------------------------------------------ setup and the week

export function initCampaign(s: G.GameState) {
  s.staff ??= {};
  s.hires ??= {};
  s.hiresWeek ??= -HIRE_REFRESH;
  s.manifesto ??= null;
  s.budgetDraft ??= null;
  s.budgetFx ??= { happiness: 0, growth: 0, budget: 0, unemployment: 0, approval: 0 };
  s.qt ??= null;
  s.scandal ??= null;
  s.nextScandal ??= s.week + 10;
  s.achievements ??= {};
  s.counters ??= {};
  s.counters.members0 ??= s.parties[s.party].members;
  s.mrp ??= null;
  s.pos0 ??= { ...G.party(s, s.party).pos };
  s.lastMove ??= -MOVE_GAP;
  s.speech ??= -1;
  if (!Object.keys(s.hires).length) freshHires(s);
}

/** The week on the campaign (after the wider politics, before the date moves on). */
export function campaignWeek(s: G.GameState) {
  const ps = s.parties[s.party];
  // Wages; staff walk out when the money runs dry.
  ps.funds -= payroll(s);
  if (ps.funds < 0) {
    const role = Object.keys(s.staff).sort((a, b) => s.staff[b].salary - s.staff[a].salary)[0];
    if (role) {
      G.news(s, "party", `Unpaid, ${s.staff[role].name} quits as ${ROLES.find((x) => x.id === role)?.name.toLowerCase()}`, -1);
      delete s.staff[role];
    }
  }
  if (s.week - s.hiresWeek >= HIRE_REFRESH) freshHires(s);
  maybeQuestionTime(s);
  maybeScandal(s);
  checkAchievements(s);
}

/** Anything left unanswered at the end of the week. */
export function settleCampaign(s: G.GameState) {
  if (s.qt && s.week > s.qt.week) s.qt = null;
  if (s.scandal && s.week > s.scandal.week) answerScandal(s, 2);
}

/** After an election: manifesto pledges become promises in government; big gains count. */
export function campaignAfterElection(s: G.GameState, e: G.ElectionRun) {
  if (e.contests.lower) {
    const before = e.prevHouse[s.party] ?? 0;
    if (before > 0 && (e.houseSeats[s.party] ?? 0) >= before * 1.2) note(s, "comeback");
  }
  const m = s.manifesto;
  if (m && m.week === e.week && (e.contests.lower || e.contests.pres)) {
    if (G.inGovernment(s)) {
      for (const p of m.pledges) {
        if (!G.lawOf(s, p.law)?.options[s.laws[p.law] + p.dir]) continue;
        G.addPledge(s, p.law, p.dir);
      }
      G.news(s, "mission", `Your manifesto pledges are now promises: deliver them within two years`, 0);
    }
  }
}
