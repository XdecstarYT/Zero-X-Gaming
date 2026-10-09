/**
 * The campaign machine and the floor of the house: battleground regions you can target,
 * candidates you pick for them, membership fees, a campaign strategy, get-out-the-vote drives,
 * bus tours, your own energy (and holidays, and health scares), newspaper endorsements and the
 * rivals' manifestos; then, in parliament, a shadow cabinet, opposition days, poaching members
 * (and losing your own), filibusters, fast-tracked and co-sponsored bills.
 *
 * Works on sim.ts's state and seeded stream; nothing at the top level uses another module's
 * values (sim.ts imports this file and this file imports sim.ts).
 */
import type { EventDef, PartyId, Pos } from "./data";
import * as C from "./campaign";
import * as K from "./career";
import * as P from "./politics";
import * as G from "./sim";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a: Pos, b: Pos) => Math.hypot(a.e - b.e, a.s - b.s);

export type Strategy = "balanced" | "ground" | "air" | "digital";
export const STRATEGIES: { id: Strategy; name: string; about: string }[] = [
  { id: "balanced", name: "Balanced", about: "A bit of everything." },
  { id: "ground", name: "Ground game", about: "Regional events do 15% more; national ones 10% less." },
  { id: "air", name: "Air war", about: "National events and adverts do 20% more; regional ones 10% less." },
  { id: "digital", name: "Digital first", about: "Online ads, podcasts and posts do 30% more; the rest 5% less." },
];

export type CandidateKind = "local" | "star" | "loyalist" | "outsider";
export const CANDIDATES: { id: CandidateKind; name: string; icon: string; cost: number; about: string }[] = [
  { id: "local", name: "Local hero", icon: "🏡", cost: 0.5, about: "Born and raised here. A steady lift." },
  { id: "star", name: "Star candidate", icon: "⭐", cost: 2, about: "A famous face: the biggest lift, at a price." },
  { id: "loyalist", name: "Party loyalist", icon: "🎖️", cost: 0.3, about: "A small lift, and the party likes it." },
  { id: "outsider", name: "Outsider", icon: "🎲", cost: 0.8, about: "Could be brilliant. Could be a disaster." },
];
const CANDIDATE_LIFT: Record<CandidateKind, number> = { local: 0.05, star: 0.09, loyalist: 0.025, outsider: 0 };

export const FEES = [
  { name: "Low", about: "Members join faster; less money.", members: 0.0004, funds: -0.0000012 },
  { name: "Standard", about: "As things are.", members: 0, funds: 0 },
  { name: "High", about: "More money; members drift away.", members: -0.0004, funds: 0.0000014 },
];

export const MAX_TARGETS = 5;
export const TARGET_COST = 0.25;
export const GOTV_COST = 3;
export const TOUR_COST = 2.5;
export const TOUR_GAP = 6;
export const HOLIDAY_GAP = 13;
export const POACH_COST = 2;
export const POACH_GAP = 6;
export const OPPDAY_GAP = 8;
export const FAST_GAP = 8;

export interface Grassroots {
  targets: number[];
  candidates: Record<number, { kind: CandidateKind; lift: number }>;
  fee: number;
  strategy: Strategy;
  /** The election week a get-out-the-vote drive is booked for. */
  gotv: number;
  /** Your energy, 0–100. */
  energy: number;
  /** Resting (a holiday, or doctor's orders) up to and including this week. */
  restUntil: number;
  holidayAt: number;
  tourAt: number;
  poachAt: number;
  oppDayAt: number;
  fastAt: number;
  /** Your shadow cabinet in opposition: portfolio → politician. */
  shadow: Record<string, number>;
  /** Who each outlet backed at the last election. */
  endorse: Record<string, PartyId>;
  endorseWeek: number;
  /** The rivals' manifestos: what each would change. */
  manifestos: Record<PartyId, { law: string; dir: number }[]>;
  manifestoWeek: number;
}

export function initGrassroots(s: G.GameState) {
  s.gr ??= { targets: [], candidates: {}, fee: 1, strategy: "balanced", gotv: -1, energy: 100, restUntil: -1, holidayAt: -HOLIDAY_GAP, tourAt: -TOUR_GAP, poachAt: -POACH_GAP, oppDayAt: -OPPDAY_GAP, fastAt: -FAST_GAP, shadow: {}, endorse: {}, endorseWeek: -1, manifestos: {}, manifestoWeek: -1 };
}

// ------------------------------------------------------------------ battlegrounds and targets

export interface Battleground {
  region: number;
  /** Your share minus the best rival's. */
  margin: number;
  leader: PartyId;
}

/** Regions where the race is close (within six points), closest first. */
export function battlegrounds(s: G.GameState): Battleground[] {
  const polls = C.regionPolls(s);
  const out: Battleground[] = [];
  polls.forEach((poll, k) => {
    const me = poll[s.party] ?? 0;
    if (me <= 0) return;
    let best: PartyId = s.party;
    let bv = -1;
    for (const [id, v] of Object.entries(poll))
      if (id !== s.party && v > bv) {
        bv = v;
        best = id;
      }
    const margin = me - bv;
    if (Math.abs(margin) < 0.06) out.push({ region: k, margin, leader: margin >= 0 ? s.party : best });
  });
  return out.sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin));
}

/** Target a region (or stop): every week the party spends a little there. */
export function toggleTarget(s: G.GameState, region: number): string | null {
  const g = s.gr;
  if (!G.country(s).states[region]) return "Unknown region.";
  if (g.targets.includes(region)) {
    g.targets = g.targets.filter((r) => r !== region);
    return null;
  }
  if (g.targets.length >= MAX_TARGETS) return `You can target ${MAX_TARGETS} regions at once.`;
  g.targets.push(region);
  return null;
}

/** Pick your candidate in a region (for the next election). */
export function pickCandidate(s: G.GameState, region: number, kind: CandidateKind): string | null {
  const c = CANDIDATES.find((x) => x.id === kind);
  if (!c || !G.country(s).states[region]) return "Unknown candidate.";
  if (s.gr.candidates[region]) return "You've already picked a candidate there for this election.";
  const ps = s.parties[s.party];
  if (ps.funds < c.cost) return "Not enough party funds.";
  ps.funds -= c.cost;
  const r = G.roll(s);
  const lift = kind === "outsider" ? -0.04 + r.next() * 0.16 : CANDIDATE_LIFT[kind];
  s.gr.candidates[region] = { kind, lift };
  if (kind === "loyalist") ps.unity = clamp(ps.unity + 2, 0, 100);
  G.news(s, "party", `The ${G.party(s, s.party).short} pick a ${c.name.toLowerCase()} in ${G.country(s).states[region].name}`, 0);
  return null;
}

/** The extra pull your party has in a region (candidates, and a get-out-the-vote drive on the day). */
export function grassBonus(s: G.GameState, region: number) {
  const g = s.gr;
  if (!g) return 0;
  return (g.candidates[region]?.lift ?? 0) + (g.gotv === s.week ? 0.06 : 0) + (g.targets.includes(region) ? 0.01 : 0);
}

export function setFee(s: G.GameState, fee: number) {
  s.gr.fee = clamp(Math.round(fee), 0, FEES.length - 1);
}
export function setStrategy(s: G.GameState, st: Strategy) {
  if (STRATEGIES.some((x) => x.id === st)) s.gr.strategy = st;
}

const DIGITAL = new Set(["onlineAds", "podcast"]);
/** How much the campaign strategy (and how tired you are) changes what an event does. */
export function eventK(s: G.GameState, ev: EventDef) {
  const g = s.gr;
  if (!g) return 1;
  let k = 1;
  if (g.strategy === "ground") k = ev.scope === "state" ? 1.15 : ev.scope === "national" ? 0.9 : 1;
  else if (g.strategy === "air") k = ev.scope === "national" ? 1.2 : ev.scope === "state" ? 0.9 : 1;
  else if (g.strategy === "digital") k = DIGITAL.has(ev.id) ? 1.3 : 0.95;
  return k * (g.energy >= 30 ? 1 : 0.6 + g.energy / 75);
}
/** Social posts under a digital-first strategy. */
export const postK = (s: G.GameState) => (s.gr?.strategy === "digital" ? 1.3 : 1);

/** An event tires you out (regional ones most). */
export function spendEnergy(s: G.GameState, ev: EventDef) {
  if (!s.gr) return;
  s.gr.energy = clamp(s.gr.energy - (ev.scope === "state" ? 4 : ev.scope === "national" ? 3 : 1), 0, 100);
}

export const resting = (s: G.GameState) => (s.gr?.restUntil ?? -1) >= s.week;

/** Book a get-out-the-vote drive for the next national election (within six weeks). */
export function runGotv(s: G.GameState): string | null {
  const next = G.nextElection(s);
  if (next.kind === "upper" || next.week - s.week > 6) return "Get-out-the-vote drives run in the last six weeks before a national election.";
  if (s.gr.gotv === next.week) return "It's booked already.";
  const cost = GOTV_COST + s.gr.targets.length * 0.5;
  const ps = s.parties[s.party];
  if (ps.funds < cost) return "Not enough party funds.";
  ps.funds -= cost;
  s.gr.gotv = next.week;
  ps.members += 500;
  C.note(s, "gotv");
  G.news(s, "election", `The ${G.party(s, s.party).short} launch a get-out-the-vote drive`, 1);
  return null;
}

/** A bus tour through three regions in a week. */
export function busTour(s: G.GameState, regions: number[]): string | null {
  const g = s.gr;
  const list = [...new Set(regions)].filter((r) => G.country(s).states[r]);
  if (list.length !== 3) return "Pick three regions for the tour.";
  if (s.week - g.tourAt < TOUR_GAP) return `The bus is back on the road in ${TOUR_GAP - (s.week - g.tourAt)} weeks.`;
  if (resting(s)) return "You're resting this week.";
  const ps = s.parties[s.party];
  if (ps.funds < TOUR_COST) return "Not enough party funds.";
  ps.funds -= TOUR_COST;
  g.tourAt = s.week;
  g.energy = clamp(g.energy - 12, 0, 100);
  const k = g.energy >= 30 ? 1 : 0.6 + g.energy / 75;
  const camp = s.campaign[s.party];
  for (const r of list) camp[r] = clamp(camp[r] + 3 * k, -20, 40);
  ps.members += 500;
  const names = list.map((r) => G.country(s).states[r].name);
  G.news(s, "event", `The ${G.party(s, s.party).short} battle bus rolls through ${names.join(", ")}`, 1);
  return null;
}

/** Take a week off: you're back next week with full energy. */
export function takeHoliday(s: G.GameState): string | null {
  const g = s.gr;
  if (resting(s)) return "You're already resting.";
  if (s.week - g.holidayAt < HOLIDAY_GAP) return `You had a holiday ${s.week - g.holidayAt} weeks ago.`;
  if (G.nextElection(s).week - s.week <= 3) return "Not with an election this close!";
  g.holidayAt = s.week;
  g.restUntil = s.week;
  if (s.crisis || (s.soc?.protests.length ?? 0) > 0) {
    s.stats.approval = clamp(s.stats.approval - (s.gov.head === s.you ? 1.5 : 0.5), 5, 95);
    P.pressEvent(s, -2);
    G.news(s, "event", `${G.fullName(G.pol(s, s.you)!)} is pictured on the beach while the country is in trouble`, -1);
  } else G.news(s, "event", `${G.fullName(G.pol(s, s.you)!)} takes a week off`, 0);
  return null;
}

// ------------------------------------------------------------------ the shadow cabinet

/** Your party's members who could shadow a ministry. */
export function shadowPool(s: G.GameState) {
  const ids = new Set([...s.house, ...s.senate]);
  return s.politicians.filter((p) => ids.has(p.id) && p.party === s.party && p.id !== s.you);
}

export function appointShadow(s: G.GameState, portfolio: string, id: number): string | null {
  if (G.inGovernment(s)) return "You're in government: you have a real cabinet.";
  if (!P.PORTFOLIOS.some((p) => p.id === portfolio)) return "Unknown portfolio.";
  if (!shadowPool(s).some((p) => p.id === id)) return "They can't shadow that post.";
  for (const [k, v] of Object.entries(s.gr.shadow)) if (v === id) delete s.gr.shadow[k];
  s.gr.shadow[portfolio] = id;
  return null;
}

/** How ready your team looks, 3–9 (an empty post counts as 3). */
export function shadowReadiness(s: G.GameState) {
  if (!s.gr) return 3;
  const pool = new Set(shadowPool(s).map((p) => p.id));
  const sk = P.PORTFOLIOS.map((pf) => {
    const id = s.gr.shadow[pf.id];
    return id !== undefined && pool.has(id) ? P.skill(G.pol(s, id)) : 3;
  });
  return sk.reduce((a, b) => a + b, 0) / sk.length;
}
/** What a good shadow team adds to Question Time and debates. */
export const shadowEdge = (s: G.GameState) => (G.inGovernment(s) ? 0 : (shadowReadiness(s) - 5) * 0.15);

/** On taking power: the shadow team moves into the real offices. */
export function shadowToCabinet(s: G.GameState) {
  if (!s.gr || s.gov.head !== s.you) return;
  for (const [pf, id] of Object.entries(s.gr.shadow)) if (P.candidates(s).some((p) => p.id === id)) P.appoint(s, pf, id);
  s.gr.shadow = {};
}

// ------------------------------------------------------------------ the floor of the house

/** An opposition day: put a motion to the lower house. Non-binding, but a win embarrasses the government. */
export function oppositionDay(s: G.GameState, law: string, option: number): { passed: boolean; yes: number; no: number } | string {
  if (G.inGovernment(s)) return "Opposition days belong to the opposition.";
  if (s.week - s.gr.oppDayAt < OPPDAY_GAP) return `Your next opposition day is in ${OPPDAY_GAP - (s.week - s.gr.oppDayAt)} weeks.`;
  const l = G.lawOf(s, law);
  if (!l || !l.options[option] || option === s.laws[law]) return "Pick a change to the law.";
  if (!s.house.some((id) => G.pol(s, id)?.party === s.party)) return "You need members in the lower house.";
  s.gr.oppDayAt = s.week;
  const b: G.Bill = { id: -1, law, option, proposer: s.you, party: s.party, stage: "house", voteAt: s.week, committee: [], yourVote: s.house.includes(s.you) ? 1 : null, lobbied: [], last: null };
  const t = G.tally(s, b);
  const passed = G.carries(s, b, t);
  const gp = s.gov.parties[0];
  if (passed) {
    s.stats.approval = clamp(s.stats.approval - 2, 5, 95);
    s.parties[s.party].swing += 0.01;
    P.pressEvent(s, 2);
    if (gp) s.parties[gp].relations[s.party] = clamp((s.parties[gp].relations[s.party] ?? 0) - 3, -100, 100);
    C.note(s, "oppDays");
  } else s.parties[s.party].swing += 0.002;
  G.news(s, "law", `Opposition day motion on ${l.name.toLowerCase()} (${l.options[option].label}): ${passed ? "carried, a blow to the government" : "defeated"}, ${t.yes} to ${t.no}`, passed ? 1 : 0);
  return { passed, yes: t.yes, no: t.no };
}

/** Try to win over a member of another party. */
export function poach(s: G.GameState, partyId: PartyId): { ok: boolean; won?: string; why?: string } {
  if (partyId === s.party || !s.parties[partyId]) return { ok: false, why: "Pick another party." };
  if (s.week - s.gr.poachAt < POACH_GAP) return { ok: false, why: `Your whips need ${POACH_GAP - (s.week - s.gr.poachAt)} more weeks.` };
  const ps = s.parties[s.party];
  if (ps.funds < POACH_COST) return { ok: false, why: "Not enough party funds." };
  const busy = new Set<number>([s.gov.head, s.president, s.parties[partyId].leader, ...Object.values(s.cabinet)]);
  const pool = s.house.map((id) => G.pol(s, id)).filter((p): p is G.Politician => !!p && p.party === partyId && !busy.has(p.id));
  if (!pool.length) return { ok: false, why: "None of their members would talk to you." };
  ps.funds -= POACH_COST;
  s.gr.poachAt = s.week;
  const r = G.roll(s);
  const them = s.parties[partyId];
  const chance = clamp(0.12 + (100 - them.unity) / 300 + Math.max(0, 0.6 - dist(G.party(s, partyId).pos, G.party(s, s.party).pos)) / 3 + (them.relations[s.party] ?? 0) / 400, 0.05, 0.6);
  const p = r.pick(pool);
  if (r.next() < chance) {
    p.party = s.party;
    them.relations[s.party] = clamp((them.relations[s.party] ?? 0) - 15, -100, 100);
    C.note(s, "defectors");
    K.mark(s, "🔀", `${G.fullName(p)} crossed the floor to join you`);
    G.news(s, "party", `${G.fullName(p)} crosses the floor from the ${G.party(s, partyId).short} to the ${G.party(s, s.party).short}`, 1);
    return { ok: true, won: G.fullName(p) };
  }
  them.relations[s.party] = clamp((them.relations[s.party] ?? 0) - 8, -100, 100);
  P.pressEvent(s, -1);
  G.news(s, "party", `The ${G.party(s, partyId).short} rebuff a ${G.party(s, s.party).short} attempt to poach one of their members`, -1);
  return { ok: true };
}

/** Talk a bill out: it's delayed two weeks (twice at most). */
export function filibuster(s: G.GameState, billId: number): string | null {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || b.stage === "passed" || b.stage === "failed") return "That bill isn't before the legislature.";
  if (b.stage !== "house" && b.stage !== "senate") return "You can only talk a bill out on the floor of a house.";
  if (b.party === s.party) return "That's your own party's bill.";
  if (!G.youVoteOn(s, b)) return "You don't sit in that house.";
  const room = G.voters(s, b);
  const mine = room.filter((id) => G.pol(s, id)?.party === s.party).length;
  if (mine < room.length * 0.3) return "You need three in ten of the house behind you to talk it out.";
  if ((b.filibusters ?? 0) >= 2) return "You've talked it out twice already.";
  b.filibusters = (b.filibusters ?? 0) + 1;
  b.voteAt += 2;
  P.pressEvent(s, -1);
  const ps = s.parties[s.party];
  ps.unity = clamp(ps.unity + 2, 0, 100);
  s.parties[b.party].relations[s.party] = clamp((s.parties[b.party].relations[s.party] ?? 0) - 6, -100, 100);
  C.note(s, "filibusters");
  G.news(s, "law", `The ${G.party(s, s.party).short} talk out a bill for hours: the vote is pushed back two weeks`, 0);
  return null;
}

/** As head of government, rush one of your bills past its committee. */
export function fastTrack(s: G.GameState, billId: number): string | null {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || b.proposer !== s.you) return "Only your own bills.";
  if (s.gov.head !== s.you) return `Only the ${G.titles(s).head} can fast-track a bill.`;
  if (b.stage !== "committee") return "It's past the committee already.";
  if (s.week - s.gr.fastAt < FAST_GAP) return `You can fast-track again in ${FAST_GAP - (s.week - s.gr.fastAt)} weeks.`;
  s.gr.fastAt = s.week;
  b.stage = "house";
  b.voteAt = s.week + 1;
  const ps = s.parties[s.party];
  ps.unity = clamp(ps.unity - 2, 0, 100);
  G.news(s, "law", `The government fast-tracks its bill on ${G.lawOf(s, b.law)?.name.toLowerCase() ?? "the budget"}`, 0);
  return null;
}

/** Ask another party to put its name to your bill: they back it, and it costs you some goodwill with them. */
export function cosponsor(s: G.GameState, billId: number, partyId: PartyId): string | null {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || b.party !== s.party || b.budget) return "Only your party's bills.";
  if (b.stage === "passed" || b.stage === "failed") return "That bill is done.";
  if (b.cosponsor) return `The ${G.party(s, b.cosponsor).short} are co-sponsors already.`;
  if (partyId === s.party || !s.parties[partyId]) return "Pick another party.";
  const rel = s.parties[partyId].relations[s.party] ?? 0;
  if (rel < 25) return `The ${G.party(s, partyId).short} aren't friendly enough to put their name to it.`;
  b.cosponsor = partyId;
  s.parties[partyId].relations[s.party] = rel - 5;
  G.news(s, "law", `The ${G.party(s, partyId).short} co-sponsor the ${G.party(s, s.party).short} bill on ${G.lawOf(s, b.law)?.name.toLowerCase()}`, 1);
  return null;
}

// ------------------------------------------------------------------ the week

function nextNational(s: G.GameState) {
  const n = G.nextElection(s);
  return n.kind === "upper" ? null : n;
}

/** The newspapers back someone two weeks before a national election. */
function endorsements(s: G.GameState) {
  const poll = G.nationalPoll(s);
  const top = G.running(s)
    .filter((p) => !G.party(s, p).others)
    .sort((a, b) => poll[b] - poll[a])
    .slice(0, 4);
  s.gr.endorse = {};
  for (const o of P.OUTLETS) {
    const pick = (s.press[o.id] ?? 0) >= 15 ? s.party : [...top].sort((a, b) => dist(G.party(s, a).pos, o.pos) - dist(G.party(s, b).pos, o.pos))[0];
    if (!pick) continue;
    s.gr.endorse[o.id] = pick;
    s.parties[pick].swing += 0.006;
  }
  s.gr.endorseWeek = s.week;
  const mine = Object.values(s.gr.endorse).filter((p) => p === s.party).length;
  G.news(s, "election", mine ? `${mine} of the ${P.OUTLETS.length} big outlets endorse the ${G.party(s, s.party).name}` : `None of the big outlets endorse the ${G.party(s, s.party).short}`, mine ? 1 : -1);
}

/** The rival parties publish manifestos eight weeks out. */
function rivalManifestos(s: G.GameState) {
  s.gr.manifestos = {};
  for (const id of G.running(s)) {
    if (id === s.party || G.party(s, id).others) continue;
    const pos = G.party(s, id).pos;
    const wants = G.allLaws(s)
      .filter((l) => !l.constitutional)
      .flatMap((l) => {
        const cur = s.laws[l.id];
        return [-1, 1].filter((d) => l.options[cur + d]).map((d) => ({ law: l.id, dir: d, gain: dist(l.options[cur].pos, pos) - dist(l.options[cur + d].pos, pos) }));
      })
      .filter((x) => x.gain > 0.08)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 3)
      .map(({ law, dir }) => ({ law, dir }));
    s.gr.manifestos[id] = wants;
  }
  s.gr.manifestoWeek = s.week;
}

/** The week on the ground (after the campaign's week). */
export function grassrootsWeek(s: G.GameState) {
  initGrassroots(s);
  const g = s.gr;
  const ps = s.parties[s.party];
  const r = G.roll(s);
  // Targeted regions.
  const camp = s.campaign[s.party];
  for (const k of g.targets) {
    if (ps.funds < TARGET_COST) break;
    ps.funds -= TARGET_COST;
    camp[k] = clamp(camp[k] + 1.2, -20, 40);
  }
  // Membership fees.
  const f = FEES[g.fee] ?? FEES[1];
  ps.members = Math.max(1000, Math.round(ps.members * (1 + f.members)));
  ps.funds += ps.members * f.funds;
  // Energy: back to full after a rest; a burnt-out leader may be sent home by the doctors.
  if (g.restUntil === s.week) g.energy = 100;
  else g.energy = clamp(g.energy + 14, 0, 100);
  if (g.energy < 26 && !resting(s) && r.next() < 0.3) {
    g.restUntil = s.week + 2;
    s.stats.approval = clamp(s.stats.approval - (s.gov.head === s.you ? 1 : 0), 5, 95);
    G.news(s, "party", `Health scare: doctors order ${G.fullName(G.pol(s, s.you)!)} to rest for two weeks`, -1);
  }
  // Your own members cross the floor when the party is at war with itself.
  if (ps.unity < 30 && r.next() < 0.025) {
    const busy = new Set<number>([s.you, ...Object.values(s.cabinet)]);
    const mine = s.house.map((id) => G.pol(s, id)).filter((p): p is G.Politician => !!p && p.party === s.party && !busy.has(p.id));
    const others = G.running(s).filter((p) => p !== s.party && !G.party(s, p).others);
    if (mine.length && others.length) {
      const p = r.pick(mine);
      const to = others.sort((a, b) => dist(G.party(s, a).pos, G.party(s, s.party).pos) - dist(G.party(s, b).pos, G.party(s, s.party).pos))[0];
      p.party = to;
      K.mark(s, "🚪", `${G.fullName(p)} defected to the ${G.party(s, to).short}`);
      G.news(s, "party", `${G.fullName(p)} quits the ${G.party(s, s.party).short} for the ${G.party(s, to).short}, blaming the infighting`, -1);
    }
  }
  // Election season.
  const n = nextNational(s);
  if (n && n.week - s.week === 8 && g.manifestoWeek !== s.week) rivalManifestos(s);
  if (n && n.week - s.week === 2 && g.endorseWeek !== s.week) endorsements(s);
  // Shadow ministers who've left the house (or the party) lose their posts.
  if (Object.keys(g.shadow).length) {
    const pool = new Set(shadowPool(s).map((p) => p.id));
    for (const [k, v] of Object.entries(g.shadow)) if (!pool.has(v)) delete g.shadow[k];
  }
}

/** After an election: candidates are spent, the drive is over. */
export function grassAfterElection(s: G.GameState, e: G.ElectionRun) {
  if (!s.gr) return;
  if (e.contests.lower) s.gr.candidates = {};
  if (e.contests.lower || e.contests.pres) s.gr.gotv = -1;
}
