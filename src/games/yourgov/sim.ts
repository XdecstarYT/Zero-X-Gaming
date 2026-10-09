/**
 * YourGov's rules: a federation of states and counties, six parties, a House, a Senate, a
 * President and governors. One turn is a week. You lead a party: hold events to win voters,
 * write bills and steer them through committee, the House, the Senate and the President's
 * desk, vote, keep your promises and win elections, counted county by county.
 *
 * Pure and deterministic: all randomness comes from the state's own seeded stream.
 */
import { createRng } from "../engine/rng";
import { COMMITTEES, EVENT, FIRST, GROUP_COMMITTEE, LAST, LAW, LAW_GROUPS, LAWS, PARTIES, PARTY, START_YEAR, WEEKS, type Effects, type LawDef, type LawGroup, type PartyId, type Pos } from "./data";
import { makeCountry, type Country } from "./map";

export const PARTY_IDS = PARTIES.map((p) => p.id);
export const HOUSE_SEATS = 100;
export const COMMITTEE_SIZE = 9;
/** Weeks a bill spends at each stage. */
export const STAGE_WEEKS = 1;
/** General elections: every four years in week 45; midterms (the House) two years later. */
export const ELECTION_WEEK = 45;
export const BUDGET_WEEK = 40;
export const CAREER_YEARS = 20;
/** Starting popularity: two big parties, a centre squeezed between them, and the smaller ones. */
export const BASE_SWING: Record<PartyId, number> = { lab: 0.05, com: 0.35, ctr: -0.15, lib: 0.25, her: 0.35, grn: -0.05 };

export interface Politician {
  id: number;
  first: string;
  last: string;
  party: PartyId;
  age: number;
  face: number;
  state: number;
  charisma: number;
  /** The player. */
  you?: boolean;
}

export type Stage = "committee" | "house" | "senate" | "president" | "passed" | "failed";
export interface Tally {
  yes: number;
  no: number;
  abstain: number;
  /** How each member voted (politician id → 1 yes, 0 abstain, -1 no). */
  by: Record<number, number>;
}
export interface Bill {
  id: number;
  law: string;
  option: number;
  /** "budget" bills approve the year's budget instead of changing a law. */
  budget?: boolean;
  proposer: number;
  party: PartyId;
  stage: Stage;
  /** Week it reaches a vote at its current stage. */
  voteAt: number;
  committee: number[];
  /** The player's vote at the current stage (if they sit there). */
  yourVote: number | null;
  /** Parties lobbied for this bill (extra support, current stage). */
  lobbied: PartyId[];
  last: { stage: Stage; tally: Tally; passed: boolean } | null;
}

export interface Mission {
  id: number;
  kind: "election" | "promise" | "members" | "seats" | "laws";
  law?: string;
  /** For a promise: lower (-1) or raise (+1) the option index. */
  dir?: number;
  target?: number;
  start?: number;
  deadline: number;
  reward: number;
  done?: boolean;
  failed?: boolean;
}

export interface NewsItem {
  week: number;
  kind: "election" | "law" | "death" | "mayor" | "economy" | "scandal" | "mission" | "event" | "budget" | "party";
  text: string;
  tone: 1 | 0 | -1;
}

export interface ElectionRun {
  kind: "general" | "midterm";
  week: number;
  /** Per section, per party (PARTY_IDS order) vote share, flattened. */
  shares: number[];
  turnout: number[];
  /** Order the counties report in. */
  order: number[];
  /** National vote share per party. */
  national: Record<PartyId, number>;
  houseSeats: Record<PartyId, number>;
  senateSeats: Record<PartyId, number>;
  president: { party: PartyId; name: string; share: number; runoff: boolean } | null;
  governors: Record<PartyId, number>;
  prevHouse: Record<PartyId, number>;
}

export interface PartyState {
  funds: number;
  members: number;
  unity: number;
  /** National popularity offset (utility). */
  swing: number;
  leader: number;
  relations: Record<PartyId, number>;
}

export interface Stats {
  happiness: number;
  /** GDP, $ trillions. */
  gdp: number;
  growth: number;
  /** Yearly budget balance, $ billions. */
  budget: number;
  debt: number;
  unemployment: number;
  /** Approval of the government (the President). */
  approval: number;
}

/** One week's snapshot, for the trend charts. */
export interface HistoryPoint {
  w: number;
  /** National poll per party (PARTY_IDS order). */
  poll: number[];
  approval: number;
  happiness: number;
  growth: number;
  unemployment: number;
}

export interface GameState {
  v: 2;
  seed: number;
  week: number;
  rolls: number;
  you: number;
  party: PartyId;
  homeState: number;
  parties: Record<PartyId, PartyState>;
  /** Campaign boost per party per state (decays weekly). */
  campaign: Record<PartyId, number[]>;
  /** What you've learned from polls: state → week polled. */
  polled: Record<number, number>;
  laws: Record<string, number>;
  stats: Stats;
  politicians: Politician[];
  nextId: number;
  house: number[];
  senate: number[];
  president: number;
  governors: number[];
  mayors: { section: number; holder: number }[];
  bills: Bill[];
  nextBill: number;
  news: NewsItem[];
  missions: Mission[];
  nextMission: number;
  election: ElectionRun | null;
  lastElection: ElectionRun | null;
  budgetPassed: number;
  lawsPassed: number;
  electionsWon: number;
  score: number;
  /** Events you've held this turn (each at most once a turn). */
  usedEvents: string[];
  over: boolean;
  /** Laws the player has drafted (they work like any other law). */
  custom: LawDef[];
  nextLaw: number;
  /** Weekly snapshots, newest last (capped). */
  history: HistoryPoint[];
}

// ------------------------------------------------------------------ helpers

const countries = new Map<number, Country>();
/** The (cached) country for a seed. */
export function country(seed: number) {
  let c = countries.get(seed);
  if (!c) {
    c = makeCountry(seed);
    countries.set(seed, c);
  }
  return c;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a: Pos, b: Pos) => Math.hypot(a.e - b.e, a.s - b.s);

/** A fresh random stream for this roll (the state remembers how many it has used). */
function roll(s: GameState) {
  return createRng(s.seed * 7919 + ++s.rolls * 104729);
}

export const yearOf = (week: number) => START_YEAR + Math.floor(week / WEEKS);
export const weekOf = (week: number) => (week % WEEKS) + 1;
export const dateLabel = (week: number) => `${yearOf(week)}.${String(weekOf(week)).padStart(2, "0")}`;
export const fullName = (p: Politician) => `${p.first} ${p.last}`;
export const pol = (s: GameState, id: number) => s.politicians.find((p) => p.id === id);
/** A law by id: one of the built-in ones or one the player drafted. */
export const lawOf = (s: GameState, id: string): LawDef | undefined => LAW[id] ?? s.custom.find((l) => l.id === id);
/** Every law on the books, built-in first. */
export const allLaws = (s: GameState): LawDef[] => (s.custom.length ? [...LAWS, ...s.custom] : LAWS);

function newPolitician(s: GameState, party: PartyId, state: number, r = roll(s)): Politician {
  const p: Politician = { id: s.nextId++, first: r.pick(FIRST), last: r.pick(LAST), party, age: r.int(32, 70), face: Math.floor(r.next() * 1e6), state, charisma: r.int(3, 9) };
  s.politicians.push(p);
  return p;
}

/** The lawmaker a party sends to an office (an existing one from that state if there is one free). */
function recruit(s: GameState, party: PartyId, state: number, taken: Set<number>) {
  const free = s.politicians.find((p) => p.party === party && p.state === state && !taken.has(p.id) && !p.you);
  const p = free ?? newPolitician(s, party, state);
  taken.add(p.id);
  return p.id;
}

// ------------------------------------------------------------------ voters

/** How much a county likes each party (utility), before the softmax. */
export function utilities(s: GameState, section: number) {
  const c = country(s.seed);
  const sec = c.sections[section];
  const pres = pol(s, s.president)?.party;
  return PARTY_IDS.map((id) => {
    const p = PARTY[id];
    const ps = s.parties[id];
    let u = -2.4 * dist(sec.lean, p.pos) + ps.swing + (s.campaign[id][sec.state] ?? 0) * 0.06 + Math.log(1 + ps.members / 200_000) * 0.15;
    if (id === pres) u += ((s.stats.approval - 50) / 50) * 0.45;
    return u;
  });
}

/** Vote shares in a county (PARTY_IDS order). */
export function sharesIn(s: GameState, section: number, noise?: () => number) {
  const u = utilities(s, section).map((x) => x * 2.6 + (noise ? (noise() - 0.5) * 0.5 : 0));
  const m = Math.max(...u);
  const e = u.map((x) => Math.exp(x - m));
  const t = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / t);
}

/** National poll: vote share per party. */
export function nationalPoll(s: GameState) {
  const c = country(s.seed);
  const tot = PARTY_IDS.map(() => 0);
  for (const sec of c.sections) sharesIn(s, sec.id).forEach((v, i) => (tot[i] += v * sec.pop));
  const sum = tot.reduce((a, b) => a + b, 0);
  return Object.fromEntries(PARTY_IDS.map((id, i) => [id, tot[i] / sum])) as Record<PartyId, number>;
}

/** Poll in one state. */
export function statePoll(s: GameState, state: number) {
  const c = country(s.seed);
  const tot = PARTY_IDS.map(() => 0);
  for (const id of c.states[state].sections) sharesIn(s, id).forEach((v, i) => (tot[i] += v * c.sections[id].pop));
  const sum = tot.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(PARTY_IDS.map((id, i) => [id, tot[i] / sum])) as Record<PartyId, number>;
}

// ------------------------------------------------------------------ setup

export function newGame(seed: number, party: PartyId, homeState?: number): GameState {
  const c = country(seed);
  const s: GameState = {
    v: 2,
    seed,
    week: 0,
    rolls: 0,
    you: -1,
    party,
    homeState: homeState ?? c.sections[c.capital].state,
    parties: Object.fromEntries(
      PARTIES.map((p) => [
        p.id,
        { funds: 40 + (p.id === party ? 20 : 0), members: 150_000 + Math.round(((p.id.charCodeAt(0) * 7919) % 100) * 3000), unity: 70, swing: BASE_SWING[p.id], leader: -1, relations: Object.fromEntries(PARTIES.map((q) => [q.id, q.id === p.id ? 100 : Math.round(40 - 45 * dist(p.pos, q.pos))])) as Record<PartyId, number> },
      ]),
    ) as Record<PartyId, PartyState>,
    campaign: Object.fromEntries(PARTY_IDS.map((id) => [id, c.states.map(() => 0)])) as Record<PartyId, number[]>,
    polled: {},
    laws: Object.fromEntries(LAWS.map((l) => [l.id, l.start])),
    stats: { happiness: 20, gdp: 18, growth: 1.8, budget: -40, debt: 9000, unemployment: 6, approval: 48 },
    politicians: [],
    nextId: 1,
    house: [],
    senate: [],
    president: -1,
    governors: [],
    mayors: [],
    bills: [],
    nextBill: 1,
    news: [],
    missions: [],
    nextMission: 1,
    election: null,
    lastElection: null,
    budgetPassed: 0,
    lawsPassed: 0,
    electionsWon: 0,
    score: 0,
    usedEvents: [],
    over: false,
    custom: [],
    nextLaw: 1,
    history: [],
  };
  // You, and every party's leader.
  const r = roll(s);
  const you = newPolitician(s, party, s.homeState, r);
  you.you = true;
  you.age = 46;
  s.you = you.id;
  for (const p of PARTIES) s.parties[p.id].leader = p.id === party ? you.id : newPolitician(s, p.id, r.int(0, c.states.length - 1), r).id;
  // The country as it stands: run an election quietly to fill every office.
  const run = runElection(s, "general");
  applyElection(s, run, true);
  s.lastElection = run;
  s.week = 1;
  s.missions = [];
  addMission(s, { kind: "election", deadline: nextElectionWeek(s), reward: 400 });
  addPromise(s);
  addMission(s, { kind: "members", target: Math.round(s.parties[party].members * 1.3), deadline: s.week + 40, reward: 120 });
  news(s, "party", `${fullName(you)} is elected secretary of ${PARTY[party].name}`, 1);
  record(s);
  return s;
}

function addMission(s: GameState, m: Omit<Mission, "id">) {
  s.missions.push({ id: s.nextMission++, ...m });
}

/** A promise to voters: move a law one way within a deadline. */
function addPromise(s: GameState) {
  const r = roll(s);
  const pos = PARTY[s.party].pos;
  // Promise what your voters want: a law where some other option sits closer to your party.
  const choices = allLaws(s).filter((l) => !l.constitutional && !s.missions.some((m) => m.law === l.id && !m.done && !m.failed)).flatMap((l) => {
    const cur = s.laws[l.id];
    return [-1, 1]
      .filter((d) => l.options[cur + d] && dist(l.options[cur + d].pos, pos) < dist(l.options[cur].pos, pos) - 0.05)
      .map((d) => ({ l, d }));
  });
  if (!choices.length) return;
  const { l, d } = r.pick(choices);
  addMission(s, { kind: "promise", law: l.id, dir: d, start: s.laws[l.id], deadline: s.week + r.int(40, 90), reward: 150 });
}

export function missionText(m: Mission, s: GameState) {
  if (m.kind === "election") return "Win the general election";
  if (m.kind === "members") return `Grow the party to ${(m.target! / 1000).toFixed(0)}k members`;
  if (m.kind === "seats") return `Win ${m.target} seats in the House`;
  if (m.kind === "laws") return `Pass ${m.target} laws`;
  const l = lawOf(s, m.law!);
  if (!l) return "Keep a promise (the law was repealed)";
  const isRate = l.options[0].label.endsWith("%");
  return isRate ? `Promise to ${m.dir! < 0 ? "lower" : "raise"} ${l.name.toLowerCase()}` : `Promise to change ${l.name.toLowerCase()} to ${l.options[(m.start ?? s.laws[l.id]) + m.dir!]?.label ?? "…"}`;
}

export function nextElectionWeek(s: GameState) {
  // General every 4 years from the start year, midterm 2 years after.
  const y = yearOf(s.week);
  for (let k = 0; k < 6; k++) {
    const yy = y + k;
    const w = (yy - START_YEAR) * WEEKS + ELECTION_WEEK - 1;
    if (w >= s.week && (yy - START_YEAR) % 2 === 0) return w;
  }
  return s.week + WEEKS * 2;
}
export const electionKind = (week: number): "general" | "midterm" => ((yearOf(week) - START_YEAR) % 4 === 0 ? "general" : "midterm");

// ------------------------------------------------------------------ elections

function dhondt(votes: number[], seats: number) {
  const out = votes.map(() => 0);
  for (let k = 0; k < seats; k++) {
    let best = 0;
    for (let i = 1; i < votes.length; i++) if (votes[i] / (out[i] + 1) > votes[best] / (out[best] + 1)) best = i;
    out[best]++;
  }
  return out;
}

/** Seats per state for the House: largest remainder, at least one each. */
export function apportion(s: GameState) {
  const c = country(s.seed);
  const n = c.states.length;
  const base = c.states.map(() => 1);
  const rest = HOUSE_SEATS - n;
  const quota = c.states.map((st) => (st.pop / c.pop) * rest);
  quota.forEach((q, i) => (base[i] += Math.floor(q)));
  const left = HOUSE_SEATS - base.reduce((a, b) => a + b, 0);
  quota
    .map((q, i) => ({ i, r: q - Math.floor(q) }))
    .sort((a, b) => b.r - a.r)
    .slice(0, left)
    .forEach(({ i }) => base[i]++);
  return base;
}

/** Count an election (doesn't change offices; see applyElection). */
export function runElection(s: GameState, kind: "general" | "midterm"): ElectionRun {
  const c = country(s.seed);
  const r = roll(s);
  const P = PARTY_IDS.length;
  const shares: number[] = [];
  const turnout: number[] = [];
  const stateVotes = c.states.map(() => PARTY_IDS.map(() => 0));
  const nat = PARTY_IDS.map(() => 0);
  const secWinners: number[] = [];
  for (const sec of c.sections) {
    const sh = sharesIn(s, sec.id, r.next);
    const t = clamp(0.52 + (s.stats.happiness - 20) * -0.004 + (r.next() - 0.5) * 0.2 + (kind === "general" ? 0.08 : -0.04), 0.3, 0.9);
    turnout.push(t);
    let w = 0;
    sh.forEach((v, i) => {
      shares.push(v);
      const votes = v * sec.pop * t;
      stateVotes[sec.state][i] += votes;
      nat[i] += votes;
      if (v > sh[w]) w = i;
    });
    secWinners.push(w);
  }
  const natSum = nat.reduce((a, b) => a + b, 0);
  const national = Object.fromEntries(PARTY_IDS.map((id, i) => [id, nat[i] / natSum])) as Record<PartyId, number>;
  // House: majoritarian districts (counties chunked by population) or proportional by state.
  const per = apportion(s);
  const house = PARTY_IDS.map(() => 0);
  const prop = s.laws.electoralSystem === 1;
  c.states.forEach((st, k) => {
    if (prop) {
      dhondt(stateVotes[k], per[k]).forEach((n, i) => (house[i] += n));
      return;
    }
    const secs = [...st.sections].sort((a, b) => c.sections[a].cx + c.sections[a].cy * 0.6 - (c.sections[b].cx + c.sections[b].cy * 0.6));
    const target = st.pop / per[k];
    let acc = PARTY_IDS.map(() => 0);
    let popAcc = 0;
    let made = 0;
    secs.forEach((id, j) => {
      const sec = c.sections[id];
      for (let i = 0; i < P; i++) acc[i] += shares[id * P + i] * sec.pop;
      popAcc += sec.pop;
      if ((popAcc >= target && made < per[k] - 1) || j === secs.length - 1) {
        let w = 0;
        acc.forEach((v, i) => (v > acc[w] ? (w = i) : 0));
        house[w]++;
        made++;
        acc = PARTY_IDS.map(() => 0);
        popAcc = 0;
      }
    });
    // Any seats left over (tiny states) go to the state's winner.
    while (made < per[k]) {
      let w = 0;
      stateVotes[k].forEach((v, i) => (v > stateVotes[k][w] ? (w = i) : 0));
      house[w]++;
      made++;
    }
  });
  // Senate: two per state; both to a landslide winner, otherwise one each to the top two.
  const senate = PARTY_IDS.map(() => 0);
  const governors = PARTY_IDS.map(() => 0);
  c.states.forEach((_, k) => {
    const order = PARTY_IDS.map((_, i) => i).sort((a, b) => stateVotes[k][b] - stateVotes[k][a]);
    senate[order[0]]++;
    senate[stateVotes[k][order[0]] > 2 * stateVotes[k][order[1]] ? order[0] : order[1]]++;
    governors[order[0]]++;
  });
  let president: ElectionRun["president"] = null;
  if (kind === "general") {
    const order = PARTY_IDS.map((_, i) => i).sort((a, b) => nat[b] - nat[a]);
    let win = order[0];
    let share = nat[win] / natSum;
    const runoff = share < 0.5;
    if (runoff) {
      // Run-off: everyone else's voters go to whichever finalist sits closer to their party.
      const [a, b] = [order[0], order[1]];
      let va = nat[a];
      let vb = nat[b];
      order.slice(2).forEach((i) => {
        const pi = PARTY[PARTY_IDS[i]].pos;
        if (dist(pi, PARTY[PARTY_IDS[a]].pos) <= dist(pi, PARTY[PARTY_IDS[b]].pos)) va += nat[i];
        else vb += nat[i];
      });
      win = va >= vb ? a : b;
      share = Math.max(va, vb) / (va + vb);
    }
    const leader = pol(s, s.parties[PARTY_IDS[win]].leader);
    president = { party: PARTY_IDS[win], name: leader ? fullName(leader) : PARTY[PARTY_IDS[win]].name, share, runoff };
  }
  // Counties report in a sweeping, slightly random order (east to west, like returns coming in).
  const order = c.sections.map((sec) => sec.id).sort((a, b) => c.sections[b].cx + r.next() * 120 - (c.sections[a].cx + r.next() * 120));
  const prevHouse = Object.fromEntries(PARTY_IDS.map((id) => [id, s.house.filter((h) => pol(s, h)?.party === id).length])) as Record<PartyId, number>;
  void secWinners;
  return {
    kind,
    week: s.week,
    shares,
    turnout,
    order,
    national,
    houseSeats: Object.fromEntries(PARTY_IDS.map((id, i) => [id, house[i]])) as Record<PartyId, number>,
    senateSeats: Object.fromEntries(PARTY_IDS.map((id, i) => [id, senate[i]])) as Record<PartyId, number>,
    president,
    governors: Object.fromEntries(PARTY_IDS.map((id, i) => [id, governors[i]])) as Record<PartyId, number>,
    prevHouse,
  };
}

/** Fill the offices from a counted election. */
export function applyElection(s: GameState, e: ElectionRun, quiet = false) {
  const c = country(s.seed);
  const per = apportion(s);
  const taken = new Set<number>();
  if (e.president) taken.add(s.parties[e.president.party].leader);
  // House: each party's seats spread over states by where it's strongest; you take your party's first seat.
  const house: number[] = [];
  const stShare = c.states.map((st) => {
    const tot = PARTY_IDS.map(() => 0);
    for (const id of st.sections) PARTY_IDS.forEach((_, i) => (tot[i] += e.shares[id * PARTY_IDS.length + i] * c.sections[id].pop));
    return tot;
  });
  const youHold = (e.houseSeats[s.party] ?? 0) > 0;
  for (const id of PARTY_IDS) {
    let n = e.houseSeats[id];
    if (id === s.party && youHold) {
      house.push(s.you);
      taken.add(s.you);
      n--;
    }
    const weights = c.states.map((_, k) => ({ k, w: stShare[k][PARTY_IDS.indexOf(id)] * per[k] }));
    weights.sort((a, b) => b.w - a.w);
    for (let j = 0; j < n; j++) house.push(recruit(s, id, weights[j % weights.length].k, taken));
  }
  s.house = house;
  if (e.kind === "general" || quiet) {
    const senate: number[] = [];
    const govs: number[] = [];
    c.states.forEach((_, k) => {
      const order = PARTY_IDS.map((_, i) => i).sort((a, b) => stShare[k][b] - stShare[k][a]);
      const second = stShare[k][order[0]] > 2 * stShare[k][order[1]] ? order[0] : order[1];
      senate.push(recruit(s, PARTY_IDS[order[0]], k, taken), recruit(s, PARTY_IDS[second], k, taken));
      govs.push(recruit(s, PARTY_IDS[order[0]], k, taken));
    });
    s.senate = senate;
    s.governors = govs;
    if (e.president) s.president = s.parties[e.president.party].leader;
    // Mayors of the big cities.
    s.mayors = c.sections
      .filter((sec) => sec.city)
      .map((sec) => {
        let w = 0;
        PARTY_IDS.forEach((_, i) => (e.shares[sec.id * PARTY_IDS.length + i] > e.shares[sec.id * PARTY_IDS.length + w] ? (w = i) : 0));
        return { section: sec.id, holder: recruit(s, PARTY_IDS[w], sec.state, taken) };
      });
  }
  if (quiet) return;
  const mine = e.houseSeats[s.party];
  news(s, "election", `${e.kind === "general" ? "General" : "Midterm"} election: ${PARTY[s.party].name} win ${mine} of ${HOUSE_SEATS} House seats`, mine >= e.prevHouse[s.party] ? 1 : -1);
  if (e.president) {
    const youWon = e.president.party === s.party;
    news(s, "election", `${e.president.name} (${PARTY[e.president.party].short}) is elected President with ${Math.round(e.president.share * 100)}%${e.president.runoff ? " in the run-off" : ""}`, youWon ? 1 : -1);
    if (youWon) {
      s.electionsWon++;
      s.score += 500;
      s.stats.approval = 55;
    }
  }
  s.score += mine * 5;
  for (const m of s.missions) {
    if (m.done || m.failed) continue;
    if (m.kind === "election" && e.kind === "general") {
      if (e.president?.party === s.party) complete(s, m);
      else fail(s, m);
    }
    if (m.kind === "seats" && mine >= (m.target ?? 0)) complete(s, m);
  }
  if (!s.missions.some((m) => m.kind === "election" && !m.done && !m.failed)) addMission(s, { kind: "election", deadline: nextElectionWeekAfter(s, e.week), reward: 400 });
  if (!s.missions.some((m) => m.kind === "seats" && !m.done && !m.failed)) addMission(s, { kind: "seats", target: Math.min(60, mine + 6), deadline: nextElectionWeekAfter(s, e.week), reward: 150 });
}

function nextElectionWeekAfter(s: GameState, week: number) {
  for (let y = yearOf(week) + 1; y < yearOf(week) + 8; y++) if ((y - START_YEAR) % 4 === 0) return (y - START_YEAR) * WEEKS + ELECTION_WEEK - 1;
  return week + WEEKS * 4;
}

function complete(s: GameState, m: Mission) {
  m.done = true;
  s.score += m.reward;
  s.parties[s.party].swing += 0.04;
  news(s, "mission", `Mission complete: ${missionText(m, s)}`, 1);
}
function fail(s: GameState, m: Mission) {
  m.failed = true;
  if (m.kind === "promise") s.parties[s.party].swing -= 0.08;
  news(s, "mission", `Mission failed: ${missionText(m, s)}`, -1);
}

// ------------------------------------------------------------------ bills and votes

export function lawEffects(s: GameState) {
  const fx: Required<Effects> = { happiness: 0, growth: 0, budget: 0, unemployment: 0 };
  for (const l of allLaws(s)) {
    const o = l.options[s.laws[l.id] ?? l.start]?.fx ?? {};
    fx.happiness += o.happiness ?? 0;
    fx.growth += o.growth ?? 0;
    fx.budget += o.budget ?? 0;
    fx.unemployment += o.unemployment ?? 0;
  }
  return fx;
}

/** How much a party wants a bill: positive for, negative against. */
export function partyStance(s: GameState, party: PartyId, b: Bill) {
  const pos = PARTY[party].pos;
  if (b.budget) {
    const pres = pol(s, s.president)?.party;
    const rel = pres ? s.parties[party].relations[pres] : 0;
    return (party === pres ? 0.8 : 0) + rel / 120 + (s.stats.happiness - 20) / 60 - 0.05;
  }
  const l = lawOf(s, b.law);
  if (!l) return -1;
  const cur = l.options[s.laws[l.id]].pos;
  const nxt = l.options[b.option].pos;
  let u = (dist(cur, pos) - dist(nxt, pos)) * 1.4;
  u += (s.parties[party].relations[b.party] ?? 0) / 400;
  if (party === b.party) u += 0.3;
  if (b.lobbied.includes(party)) u += 0.3;
  return u;
}

/** The members who vote at a bill's current stage. */
export function voters(s: GameState, b: Bill) {
  if (b.stage === "committee") return b.committee;
  if (b.stage === "house") return s.house;
  if (b.stage === "senate") return s.senate;
  if (b.stage === "president") return [s.president];
  return [];
}

export const youVoteOn = (s: GameState, b: Bill) => voters(s, b).includes(s.you);

/** The share of votes needed (ordinary half, constitutional two thirds). */
export const required = (s: GameState, b: Bill) => (!b.budget && lawOf(s, b.law)?.constitutional ? 2 / 3 : 0.5);

/** Count the votes at the current stage (with the player's own vote if they sit there). */
export function tally(s: GameState, b: Bill, r = roll(s)): Tally {
  const by: Record<number, number> = {};
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const id of voters(s, b)) {
    const p = pol(s, id);
    if (!p) continue;
    let v: number;
    if (id === s.you && b.yourVote !== null) v = b.yourVote;
    else {
      const unity = s.parties[p.party].unity / 100;
      const u = partyStance(s, p.party, b) + (r.next() - 0.5) * (1.2 - unity);
      v = u > 0.08 ? 1 : u < -0.08 ? -1 : 0;
    }
    by[id] = v;
    if (v > 0) yes++;
    else if (v < 0) no++;
    else abstain++;
  }
  return { yes, no, abstain, by };
}

/** Does a stage's vote carry? */
export const carries = (s: GameState, b: Bill, t: Tally) => (b.stage === "president" ? t.yes > 0 || t.abstain > 0 : t.yes > (t.yes + t.no) * required(s, b) && t.yes > 0);

function committeeFor(s: GameState, law: string) {
  // Committee members: drawn from the House in proportion to party strength; you sit on half of them.
  const r = roll(s);
  const pool = [...s.house];
  const out: number[] = [];
  const youSit = s.house.includes(s.you) && (lawOf(s, law)?.committee ?? 1) % 2 === 1;
  if (youSit) out.push(s.you);
  while (out.length < COMMITTEE_SIZE && pool.length) {
    const i = Math.floor(r.next() * pool.length);
    const id = pool.splice(i, 1)[0];
    if (id !== s.you) out.push(id);
  }
  return out;
}

/** Put a bill forward. Returns null if that bill is already in the pipeline or changes nothing. */
export function proposeBill(s: GameState, law: string, option: number, proposer = s.you): Bill | null {
  const l = lawOf(s, law);
  if (!l || option === s.laws[law] || !l.options[option]) return null;
  if (s.bills.some((b) => b.law === law && b.stage !== "passed" && b.stage !== "failed")) return null;
  const p = pol(s, proposer);
  if (!p) return null;
  const b: Bill = { id: s.nextBill++, law, option, proposer, party: p.party, stage: "committee", voteAt: s.week + STAGE_WEEKS, committee: committeeFor(s, law), yourVote: null, lobbied: [], last: null };
  s.bills.push(b);
  if (proposer === s.you) s.score += 5;
  return b;
}

export const BILL_COST = 0.5;
export const LOBBY_COST = 1.5;

/** Write a bill (costs a little party money). */
export function writeBill(s: GameState, law: string, option: number) {
  const ps = s.parties[s.party];
  if (ps.funds < BILL_COST) return null;
  const b = proposeBill(s, law, option);
  if (b) ps.funds -= BILL_COST;
  return b;
}

export function castVote(s: GameState, billId: number, v: -1 | 0 | 1) {
  const b = s.bills.find((x) => x.id === billId);
  if (!b || !youVoteOn(s, b)) return false;
  b.yourVote = v;
  return true;
}

/** Spend party money to win a party round on a bill at its current stage. */
export function lobby(s: GameState, billId: number, party: PartyId) {
  const b = s.bills.find((x) => x.id === billId);
  const ps = s.parties[s.party];
  if (!b || b.lobbied.includes(party) || ps.funds < LOBBY_COST || party === s.party) return false;
  ps.funds -= LOBBY_COST;
  b.lobbied.push(party);
  s.parties[party].relations[s.party] = clamp(s.parties[party].relations[s.party] + 2, -100, 100);
  return true;
}

const NEXT: Record<Stage, Stage> = { committee: "house", house: "senate", senate: "president", president: "passed", passed: "passed", failed: "failed" };

function advanceBill(s: GameState, b: Bill) {
  const t = tally(s, b);
  const ok = carries(s, b, t);
  b.last = { stage: b.stage, tally: t, passed: ok };
  const mine = b.party === s.party;
  if (!ok) {
    b.stage = "failed";
    if (b.budget) {
      s.stats.approval -= 6;
      s.stats.happiness -= 1;
      news(s, "budget", `The House rejects the budget, ${t.yes} to ${t.no}`, -1);
    } else news(s, "law", `${lawOf(s, b.law)?.name ?? "A bill"}: the bill falls ${b.last.stage === "president" ? "to a presidential veto" : `in the ${stageName(b.last.stage)}`}`, mine ? -1 : 0);
    return;
  }
  // Budgets only need the House.
  b.stage = b.budget ? "passed" : NEXT[b.stage];
  b.voteAt = s.week + STAGE_WEEKS;
  b.yourVote = null;
  b.lobbied = [];
  if (b.stage === "passed") {
    if (b.budget) {
      s.budgetPassed++;
      s.stats.approval += 2;
      news(s, "budget", `The House approves the budget, ${t.yes} to ${t.no}`, 1);
      return;
    }
    s.laws[b.law] = b.option;
    const l = lawOf(s, b.law)!;
    news(s, "law", `${l.name} becomes law: ${l.options[b.option].label}`, mine ? 1 : 0);
    if (mine) {
      s.lawsPassed++;
      s.score += 40;
    }
    // Voters notice: parties that pushed it gain where it suits voters.
    for (const m of s.missions) if (!m.done && !m.failed && m.kind === "promise" && m.law === b.law && Math.sign(s.laws[b.law] - (m.start ?? 0)) === m.dir) complete(s, m);
    for (const m of s.missions) if (!m.done && !m.failed && m.kind === "laws" && s.lawsPassed >= (m.target ?? 0)) complete(s, m);
  }
}

export const stageName = (st: Stage) => ({ committee: "committee", house: "House", senate: "Senate", president: "President's desk", passed: "law", failed: "failed" })[st];

// ------------------------------------------------------------------ events

export interface EventResult {
  ok: boolean;
  boost: number;
  backfired: boolean;
  poll?: Record<PartyId, number>;
}

/** Hold an event (a rally, an advert, a fundraiser…), in a state where it needs one. */
export function holdEvent(s: GameState, id: string, state = s.homeState, target?: PartyId): EventResult {
  const ev = EVENT[id];
  const ps = s.parties[s.party];
  if (!ev || ps.funds < ev.cost || s.usedEvents.includes(id) || s.over) return { ok: false, boost: 0, backfired: false };
  const r = roll(s);
  ps.funds -= ev.cost;
  s.usedEvents.push(id);
  const you = pol(s, s.you)!;
  const backfired = !!ev.risk && r.next() < ev.risk;
  const k = (backfired ? -0.8 : 1) * (0.7 + you.charisma / 15);
  const boost = ev.boost * k;
  const camp = s.campaign[s.party];
  if (ev.scope === "state") camp[state] = clamp(camp[state] + boost, -20, 40);
  else if (ev.scope === "national") for (let i = 0; i < camp.length; i++) camp[i] = clamp(camp[i] + boost * 0.6, -20, 40);
  if (ev.money) ps.funds += ev.money * (0.8 + r.next() * 0.4);
  if (ev.members) ps.members += Math.round(ev.members * (0.7 + r.next() * 0.6));
  if (ev.unity) ps.unity = clamp(ps.unity + ev.unity, 0, 100);
  if (ev.attack) {
    // Hit the strongest rival (or the one you chose).
    const poll = nationalPoll(s);
    const rival = target ?? PARTY_IDS.filter((p) => p !== s.party).sort((a, b) => poll[b] - poll[a])[0];
    if (backfired) s.parties[s.party].swing -= 0.05;
    else s.parties[rival].swing -= ev.attack * 0.02;
    s.parties[rival].relations[s.party] = clamp(s.parties[rival].relations[s.party] - 8, -100, 100);
    news(s, "scandal", backfired ? `${PARTY[s.party].name}'s attack on ${PARTY[rival].name} backfires` : `${PARTY[rival].name} reel from ${PARTY[s.party].short} attacks`, backfired ? -1 : 1);
  }
  let poll: Record<PartyId, number> | undefined;
  if (ev.poll) {
    s.polled[state] = s.week;
    poll = statePoll(s, state);
  }
  if (backfired && !ev.attack) news(s, "event", `${ev.name} goes badly for ${fullName(you)}`, -1);
  return { ok: true, boost, backfired, poll };
}

// ------------------------------------------------------------------ the turn

function news(s: GameState, kind: NewsItem["kind"], text: string, tone: 1 | 0 | -1) {
  s.news.unshift({ week: s.week, kind, text, tone });
  if (s.news.length > 80) s.news.length = 80;
}

/** AI parties: campaign where it counts, now and then put a bill forward. */
function aiTurn(s: GameState) {
  const c = country(s.seed);
  const r = roll(s);
  const near = nextElectionWeek(s) - s.week < 26;
  for (const id of PARTY_IDS) {
    if (id === s.party) continue;
    const ps = s.parties[id];
    // Campaigning: more as an election nears, in the biggest states.
    const n = near ? 3 : 1;
    for (let k = 0; k < n && ps.funds > 1; k++) {
      const st = c.states[Math.floor(r.next() * c.states.length)];
      s.campaign[id][st.id] = clamp(s.campaign[id][st.id] + 2 + r.next() * 3, -20, 40);
      ps.funds -= 0.6;
    }
    // Bills: the biggest parties write the most.
    const seats = s.house.filter((h) => pol(s, h)?.party === id).length;
    if (r.next() < 0.04 + seats / 600) {
      const pos = PARTY[id].pos;
      const cand = allLaws(s).flatMap((l) => {
        const cur = s.laws[l.id];
        return [cur - 1, cur + 1].filter((o) => l.options[o] && dist(l.options[o].pos, pos) < dist(l.options[cur].pos, pos) - 0.08).map((o) => ({ l, o }));
      });
      if (cand.length) {
        const { l, o } = r.pick(cand);
        const member = s.house.find((h) => pol(s, h)?.party === id) ?? ps.leader;
        const b = proposeBill(s, l.id, o, member);
        if (b) news(s, "law", `${PARTY[id].name} introduce a bill: ${l.name} → ${l.options[o].label}`, 0);
      }
    }
    // Relations drift back toward what their ideologies suggest.
    for (const q of PARTY_IDS) {
      if (q === id) continue;
      const base = 40 - 45 * dist(PARTY[id].pos, PARTY[q].pos);
      ps.relations[q] += (base - ps.relations[q]) * 0.02;
    }
  }
}

function economy(s: GameState) {
  const fx = lawEffects(s);
  const st = s.stats;
  const r = roll(s);
  const targetHappy = 20 + fx.happiness - Math.max(0, st.unemployment - 5) * 0.8 + (st.growth - 1.5) * 1.5;
  st.happiness += (targetHappy - st.happiness) * 0.05 + (r.next() - 0.5) * 0.3;
  const targetGrowth = 1.8 + fx.growth - Math.max(0, st.debt / (st.gdp * 1000) - 0.8) * 1.5;
  st.growth += (targetGrowth - st.growth) * 0.04 + (r.next() - 0.5) * 0.08;
  st.unemployment = clamp(st.unemployment + (6 + fx.unemployment - st.growth * 0.6 - st.unemployment) * 0.04, 1.5, 25);
  st.budget = -40 + fx.budget + (st.growth - 1.8) * 25;
  st.debt = Math.max(0, st.debt - st.budget / WEEKS);
  st.gdp *= 1 + st.growth / 100 / WEEKS;
  // The government's approval follows how people feel.
  const targetApproval = 48 + (st.happiness - 20) * 1.6 + (st.growth - 1.5) * 4;
  st.approval = clamp(st.approval + (targetApproval - st.approval) * 0.03 + (r.next() - 0.5) * 0.6, 5, 95);
  st.happiness = clamp(st.happiness, -50, 60);
}

function events(s: GameState) {
  const r = roll(s);
  const c = country(s.seed);
  // Deaths in office: someone takes over.
  if (r.next() < 0.02) {
    const office = [...s.house, ...s.senate, ...s.governors].filter((id) => id !== s.you);
    const id = r.pick(office);
    const p = pol(s, id);
    if (p && p.age > 55) {
      const heir = newPolitician(s, p.party, p.state);
      for (const arr of [s.house, s.senate, s.governors]) {
        const i = arr.indexOf(id);
        if (i >= 0) arr[i] = heir.id;
      }
      news(s, "death", `${fullName(p)} (${p.age}) has passed away. ${fullName(heir)} assumes the role`, 0);
    }
  }
  // Mayoral races in the cities.
  if (r.next() < 0.05 && s.mayors.length) {
    const m = r.pick(s.mayors);
    const sh = sharesIn(s, m.section, r.next);
    let w = 0;
    sh.forEach((v, i) => (v > sh[w] ? (w = i) : 0));
    const p = newPolitician(s, PARTY_IDS[w], c.sections[m.section].state);
    m.holder = p.id;
    news(s, "mayor", `${c.sections[m.section].town} mayor election: ${fullName(p)} (${PARTY[p.party].short}) wins`, p.party === s.party ? 1 : 0);
  }
  // Scandals hit someone.
  if (r.next() < 0.025) {
    const id = r.pick(PARTY_IDS);
    s.parties[id].swing -= 0.06;
    news(s, "scandal", `Scandal: a ${PARTY[id].name} donor is under investigation`, id === s.party ? -1 : 0);
  }
  if (weekOf(s.week) === 1) news(s, "economy", `${yearOf(s.week) - 1} in review: growth ${s.stats.growth.toFixed(1)}%, unemployment ${s.stats.unemployment.toFixed(1)}%`, s.stats.growth > 1.5 ? 1 : -1);
}

/** Money and members, weekly. */
function finances(s: GameState) {
  for (const id of PARTY_IDS) {
    const ps = s.parties[id];
    const seats = s.house.filter((h) => pol(s, h)?.party === id).length + s.senate.filter((h) => pol(s, h)?.party === id).length;
    ps.funds += ps.members * 0.0000025 + seats * 0.03 - 0.25;
    ps.members = Math.max(1000, Math.round(ps.members * (1 + (s.campaign[id].reduce((a, b) => a + b, 0) / s.campaign[id].length) * 0.0004)));
    ps.unity = clamp(ps.unity + (70 - ps.unity) * 0.03, 0, 100);
    ps.swing *= 0.995;
  }
}

/** End the week: votes fall due, the world moves, elections when they come. */
export function endTurn(s: GameState) {
  if (s.over || s.election) return s;
  // Votes due this week.
  for (const b of s.bills) if (b.stage !== "passed" && b.stage !== "failed" && b.voteAt <= s.week) advanceBill(s, b);
  s.bills = s.bills.filter((b) => (b.stage !== "passed" && b.stage !== "failed") || s.week - b.voteAt < 4);
  aiTurn(s);
  economy(s);
  finances(s);
  events(s);
  record(s);
  for (const id of PARTY_IDS) s.campaign[id] = s.campaign[id].map((v) => v * 0.93);
  // Budget day.
  if (weekOf(s.week) === BUDGET_WEEK) {
    const pres = pol(s, s.president)!;
    const b: Bill = { id: s.nextBill++, law: "budget", option: 0, budget: true, proposer: pres.id, party: pres.party, stage: "house", voteAt: s.week + 1, committee: [], yourVote: null, lobbied: [], last: null };
    s.bills.push(b);
    news(s, "budget", `The budget for ${yearOf(s.week) + 1} goes to the House`, 0);
  }
  // Deadlines.
  for (const m of s.missions) {
    if (m.done || m.failed || m.deadline > s.week) continue;
    if (m.kind === "members" && s.parties[s.party].members >= (m.target ?? 0)) complete(s, m);
    else fail(s, m);
  }
  for (const m of s.missions) if (!m.done && !m.failed && m.kind === "members" && s.parties[s.party].members >= (m.target ?? 0)) complete(s, m);
  if (s.missions.filter((m) => m.kind === "promise" && !m.done && !m.failed).length < 2 && roll(s).next() < 0.1) addPromise(s);
  if (!s.missions.some((m) => m.kind === "laws" && !m.done && !m.failed)) addMission(s, { kind: "laws", target: s.lawsPassed + 2, deadline: s.week + 52, reward: 120 });
  s.missions = s.missions.filter((m) => (!m.done && !m.failed) || s.week - m.deadline < 6);
  s.usedEvents = [];
  s.week++;
  // Election day.
  if (weekOf(s.week) === ELECTION_WEEK && (yearOf(s.week) - START_YEAR) % 2 === 0) s.election = runElection(s, electionKind(s.week));
  if (yearOf(s.week) - START_YEAR >= CAREER_YEARS) s.over = true;
  return s;
}

/** The count has been shown: fill the offices. */
export function closeElection(s: GameState) {
  if (!s.election) return;
  applyElection(s, s.election);
  s.lastElection = s.election;
  s.election = null;
}

// ------------------------------------------------------------------ saving

/** Keep this week's numbers for the trend charts (about five years of weeks). */
function record(s: GameState) {
  const poll = nationalPoll(s);
  s.history.push({ w: s.week, poll: PARTY_IDS.map((id) => Math.round(poll[id] * 10000) / 10000), approval: Math.round(s.stats.approval * 10) / 10, happiness: Math.round(s.stats.happiness * 10) / 10, growth: Math.round(s.stats.growth * 100) / 100, unemployment: Math.round(s.stats.unemployment * 10) / 10 });
  if (s.history.length > 260) s.history.splice(0, s.history.length - 260);
}

// ------------------------------------------------------------------ custom laws

export const CUSTOM_MAX = 10;
export const DRAFT_COST = 2;
/** How far a custom law's options may move each number (per year in force). */
export const FX_LIMITS: Required<Effects> = { happiness: 6, growth: 0.5, budget: 80, unemployment: 1.5 };

export interface LawDraft {
  name: string;
  about?: string;
  group: LawGroup;
  committee?: number;
  constitutional?: boolean;
  /** Index of the option that is in force today. */
  start: number;
  options: { label: string; pos: Pos; fx: Effects }[];
}

const cleanText = (t: unknown, max: number) =>
  [...String(t ?? "")]
    .filter((ch) => ch >= " " && ch !== "\u007f" && ch !== "<" && ch !== ">")
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Check and tidy a draft. Returns the law it would make, or why it can't be made. */
export function checkDraft(s: GameState, d: LawDraft, id = `custom-${s.nextLaw}`): LawDef | string {
  const name = cleanText(d.name, 40);
  if (name.length < 3) return "Give the law a name (at least 3 letters).";
  if (allLaws(s).some((l) => l.name.toLowerCase() === name.toLowerCase() && l.id !== id)) return "There's already a law with that name.";
  if (!LAW_GROUPS.includes(d.group)) return "Pick a category.";
  if (!Array.isArray(d.options) || d.options.length < 2 || d.options.length > 5) return "A law needs 2 to 5 options.";
  const options = d.options.map((o) => ({
    label: cleanText(o.label, 28),
    pos: { e: clamp(Number(o.pos?.e) || 0, -1, 1), s: clamp(Number(o.pos?.s) || 0, -1, 1) },
    fx: Object.fromEntries((Object.keys(FX_LIMITS) as (keyof Effects)[]).map((k) => [k, clamp(Number(o.fx?.[k]) || 0, -FX_LIMITS[k], FX_LIMITS[k])]).filter(([, v]) => v !== 0)) as Effects,
  }));
  if (options.some((o) => !o.label)) return "Every option needs a name.";
  if (new Set(options.map((o) => o.label.toLowerCase())).size !== options.length) return "Two options have the same name.";
  const start = Math.round(Number(d.start));
  if (!(start >= 0 && start < options.length)) return "Choose which option is in force today.";
  const committee = Math.round(Number(d.committee ?? GROUP_COMMITTEE[d.group]));
  return { id, name, about: cleanText(d.about, 120) || undefined, group: d.group, committee: committee >= 1 && committee <= COMMITTEES.length ? committee : GROUP_COMMITTEE[d.group], options, start, constitutional: !!d.constitutional, custom: true };
}

/** Write a new law into the books (with today's option in force). Costs party money. */
export function draftLaw(s: GameState, d: LawDraft): LawDef | string {
  if (s.custom.length >= CUSTOM_MAX) return `You can have at most ${CUSTOM_MAX} laws of your own.`;
  const ps = s.parties[s.party];
  if (ps.funds < DRAFT_COST) return "Not enough party funds.";
  const law = checkDraft(s, d);
  if (typeof law === "string") return law;
  s.nextLaw++;
  ps.funds -= DRAFT_COST;
  s.custom.push(law);
  s.laws[law.id] = law.start;
  s.score += 10;
  news(s, "law", `${fullName(pol(s, s.you)!)} drafts a new law: ${law.name}`, 1);
  return law;
}

/** Change a drafted law that has never been put to a vote. */
export function editLaw(s: GameState, id: string, d: LawDraft): LawDef | string {
  const i = s.custom.findIndex((l) => l.id === id);
  if (i < 0) return "That law isn't one of yours.";
  if (s.bills.some((b) => b.law === id)) return "That law has already been before the legislature.";
  const law = checkDraft(s, d, id);
  if (typeof law === "string") return law;
  s.custom[i] = law;
  s.laws[id] = law.start;
  return law;
}

/** Strike a drafted law from the books (not while a bill on it is going through). */
export function repealLaw(s: GameState, id: string) {
  const i = s.custom.findIndex((l) => l.id === id);
  if (i < 0 || s.bills.some((b) => b.law === id && b.stage !== "passed" && b.stage !== "failed")) return false;
  const [law] = s.custom.splice(i, 1);
  delete s.laws[id];
  s.bills = s.bills.filter((b) => b.law !== id);
  s.missions = s.missions.filter((m) => m.law !== id);
  news(s, "law", `${law.name} is struck from the books`, 0);
  return true;
}

export function save(s: GameState) {
  // The election's per-county arrays are big; keep only the last one.
  return JSON.stringify(s);
}

export function load(json: string | null): GameState | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as GameState | (Omit<GameState, "v"> & { v: 1 });
    if ((s.v !== 1 && s.v !== 2) || !s.parties || !s.laws) return null;
    // Version 1 saves had no custom laws or history.
    const out = s as GameState;
    out.v = 2;
    out.custom ??= [];
    out.nextLaw ??= 1;
    out.history ??= [];
    for (const l of allLaws(out)) out.laws[l.id] ??= l.start;
    return out;
  } catch {
    return null;
  }
}

export const committeeName = (law: LawDef) => COMMITTEES[law.committee - 1] ?? COMMITTEES[0];
export const houseBy = (s: GameState) => Object.fromEntries(PARTY_IDS.map((id) => [id, s.house.filter((h) => pol(s, h)?.party === id).length])) as Record<PartyId, number>;
export const senateBy = (s: GameState) => Object.fromEntries(PARTY_IDS.map((id) => [id, s.senate.filter((h) => pol(s, h)?.party === id).length])) as Record<PartyId, number>;
export const youHold = (s: GameState) => {
  const out: string[] = [`Secretary, ${PARTY[s.party].short}`];
  if (s.president === s.you) out.unshift("President");
  if (s.house.includes(s.you)) out.push("Representative");
  return out;
};
