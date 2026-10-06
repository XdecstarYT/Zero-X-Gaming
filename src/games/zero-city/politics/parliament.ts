/**
 * The city parliament (the 0.8 politics update): five parties share fifteen seats. You lead
 * the Civic party. Laws pass by a majority of seats, so you lobby, build coalitions, appoint
 * ministers and spend political capital, and when the chamber says no you can take a law
 * to the people in a referendum. Pure and deterministic, like the rest of Mayor mode.
 */
import { rng } from "../core/rng";
import type { Stats } from "../sim/sim";
import {
  CHAMBER,
  FACTIONS,
  MAJORITY,
  MINISTRIES,
  ministerPool,
  overall,
  PARTIES,
  PARTY_BASE,
  POLICIES,
  POLICY_IDS,
  shares,
  TERM_MINUTES,
  type ElectionResult,
  type Faction,
  type Ministry,
  type PartyId,
  type PoliticsState,
  type PolicyId,
} from "./politics";

/** Political capital costs. */
export const COST = { lobby: 12, invite: 20, appoint: 5, reshuffle: 8, dismiss: 3, referendum: 30 } as const;
export const REFERENDUM_CASH = 4_000;
export const RALLY_CASH = 3_000;
export const AD_CASH = 8_000;
export const MAX_ADS = 3;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function roll(s: PoliticsState) {
  s.rolls++;
  return rng(s.seed * 6151 + s.rolls * 92821);
}

/** How a party feels about a law (or its repeal), −1…1. Your own party backs you. */
export function partyStance(party: PartyId, law: PolicyId, enable: boolean) {
  if (party === "civic") return 1;
  const base = PARTY_BASE[party];
  let sum = 0;
  let w = 0;
  for (const [f, k] of Object.entries(base)) {
    sum += (POLICIES[law].stance[f as Faction] ?? 0) * (k ?? 0);
    w += k ?? 0;
  }
  return (w ? sum / w : 0) * (enable ? 1 : -1);
}

/** How the voters a party speaks for feel about you (0–100). */
function baseApproval(s: PoliticsState, party: PartyId) {
  if (party === "civic") return 100;
  let sum = 0;
  let w = 0;
  for (const [f, k] of Object.entries(PARTY_BASE[party])) {
    sum += s.approval[f as Faction] * (k ?? 0);
    w += k ?? 0;
  }
  return w ? sum / w : 50;
}

export interface PartyVote {
  party: PartyId;
  seats: number;
  /** Seats voting yes (a party can split). */
  yes: number;
}
export interface ParlVote {
  law: PolicyId;
  enable: boolean;
  votes: PartyVote[];
  yes: number;
  no: number;
  passed: boolean;
}

/** Seats in the governing coalition (yours and your partners'). */
export function govSeats(s: PoliticsState) {
  return s.parl.seats.civic + s.parl.coalition.reduce((n, p) => n + s.parl.seats[p], 0);
}

function partyScore(s: PoliticsState, party: PartyId, law: PolicyId, enable: boolean, lobbied: boolean) {
  if (party === "civic") return 99;
  const p = s.parl;
  let score = partyStance(party, law, enable) * 55 + p.relations[party] * 0.3 + (baseApproval(s, party) - 50) * 0.25;
  if (p.coalition.includes(party)) score += 18;
  if (lobbied) score += 30;
  if (enable && p.demands[party] === law) score += 45;
  if (enable && s.cash < 0 && POLICIES[law].cost > 0) score -= 15;
  return score;
}

/** How the chamber would vote right now (no surprises): the bill panel's forecast. */
export function forecast(s: PoliticsState, law: PolicyId, enable: boolean, lobbied: PartyId[] = []): ParlVote {
  return tally(law, enable, PARTIES.map((party) => ({ party, seats: s.parl.seats[party], yes: Math.round(s.parl.seats[party] * sigmoid(partyScore(s, party, law, enable, lobbied.includes(party)) / 10)) })));
}

function tally(law: PolicyId, enable: boolean, votes: PartyVote[]): ParlVote {
  const yes = votes.reduce((n, v) => n + v.yes, 0);
  const total = votes.reduce((n, v) => n + v.seats, 0);
  return { law, enable, votes, yes, no: total - yes, passed: yes >= MAJORITY };
}

/** Put a law (or its repeal) on the floor. */
export function draftBill(s: PoliticsState, law: PolicyId, enable: boolean) {
  s.parl.bill = { law, enable, lobbied: [] };
}

/** Work a party's members before the vote. */
export function lobby(s: PoliticsState, party: PartyId) {
  const b = s.parl.bill;
  if (!b || party === "civic" || b.lobbied.includes(party) || s.parl.capital < COST.lobby) return false;
  s.parl.capital -= COST.lobby;
  b.lobbied.push(party);
  return true;
}

/** Call the vote. A law that passes takes effect at once; parties remember how it went. */
export function callVote(s: PoliticsState): ParlVote | null {
  const b = s.parl.bill;
  if (!b) return null;
  const r = roll(s);
  const votes = PARTIES.map((party) => {
    const score = partyScore(s, party, b.law, b.enable, b.lobbied.includes(party)) + (party === "civic" ? 0 : (r.next() - 0.5) * 16);
    return { party, seats: s.parl.seats[party], yes: Math.round(s.parl.seats[party] * sigmoid(score / 10)) };
  });
  const v = tally(b.law, b.enable, votes);
  applyOutcome(s, b.law, b.enable, v.passed);
  s.parl.bill = null;
  return v;
}

function applyOutcome(s: PoliticsState, law: PolicyId, enable: boolean, passed: boolean) {
  const p = s.parl;
  if (passed) {
    s.policies = enable ? [...new Set([...s.policies, law])] : s.policies.filter((x) => x !== law);
    p.failed = null;
    for (const party of PARTIES) {
      if (party === "civic") continue;
      const st = partyStance(party, law, enable);
      // Partners swallow laws they hate (grudgingly); a demand met is a promise kept.
      p.relations[party] = clamp(p.relations[party] + st * (p.coalition.includes(party) ? 10 : 6), -100, 100);
      if (enable && p.demands[party] === law) {
        p.relations[party] = clamp(p.relations[party] + 15, -100, 100);
        delete p.demands[party];
      }
    }
  } else {
    p.failed = { law, enable };
    p.capital = Math.max(0, p.capital - 4);
  }
}

/** Take the law the chamber threw out to the people. Once a term; costs capital and money. */
export function referendum(s: PoliticsState, st: Pick<Stats, "jobs" | "cJobs" | "iJobs" | "coverage">) {
  const p = s.parl;
  const f = p.failed;
  if (!f || p.referendum === s.term || p.capital < COST.referendum || s.cash - REFERENDUM_CASH < -25_000) return null;
  p.capital -= COST.referendum;
  s.cash -= REFERENDUM_CASH;
  p.referendum = s.term;
  const sh = shares(st);
  const r = roll(s);
  let support = 0;
  for (const g of FACTIONS) {
    const want = (POLICIES[f.law].stance[g] ?? 0) * (f.enable ? 1 : -1);
    support += sh[g] * sigmoid(want * 3 + (s.approval[g] - 50) / 30);
  }
  support = clamp(support + (r.next() - 0.5) * 0.06, 0, 1);
  const passed = support > 0.5;
  if (passed) {
    s.policies = f.enable ? [...new Set([...s.policies, f.law])] : s.policies.filter((x) => x !== f.law);
    // Going over the chamber's head stings the parties that voted no.
    for (const party of PARTIES) if (party !== "civic" && partyStance(party, f.law, f.enable) < 0) p.relations[party] = clamp(p.relations[party] - 6, -100, 100);
  }
  p.failed = null;
  return { law: f.law, enable: f.enable, support, passed };
}

/** The law a party most wants that isn't in force (its price for joining you). */
export function wish(s: PoliticsState, party: PartyId): PolicyId | null {
  let best: PolicyId | null = null;
  let bv = 0.15;
  for (const id of POLICY_IDS) {
    if (s.policies.includes(id)) continue;
    const v = partyStance(party, id, true);
    if (v > bv) {
      bv = v;
      best = id;
    }
  }
  return best;
}

/** Ask a party into government. They say yes if they like you enough (and want in). */
export function invite(s: PoliticsState, party: PartyId) {
  const p = s.parl;
  if (party === "civic" || p.coalition.includes(party) || p.capital < COST.invite) return null;
  p.capital -= COST.invite;
  const r = roll(s);
  const chance = clamp(0.25 + p.relations[party] / 120 + (baseApproval(s, party) - 50) / 150, 0.03, 1);
  const yes = r.next() < chance;
  if (yes) {
    p.coalition = [...p.coalition, party];
    p.relations[party] = clamp(p.relations[party] + 10, -100, 100);
    const w = wish(s, party);
    if (w) p.demands[party] = w;
  } else p.relations[party] = clamp(p.relations[party] - 3, -100, 100);
  return { yes, chance };
}

/** Send a partner back to the opposition. */
export function dropPartner(s: PoliticsState, party: PartyId) {
  const p = s.parl;
  if (!p.coalition.includes(party)) return false;
  p.coalition = p.coalition.filter((x) => x !== party);
  delete p.demands[party];
  p.relations[party] = clamp(p.relations[party] - 20, -100, 100);
  // Their ministers walk out with them.
  for (const m of MINISTRIES) if (p.ministers[m]?.party === party) p.ministers[m] = null;
  return true;
}

/** Appoint someone from your party or a partner's to a department. */
export function appoint(s: PoliticsState, ministry: Ministry, id: number) {
  const p = s.parl;
  const who = p.pool.find((m) => m.id === id);
  if (!who || (who.party !== "civic" && !p.coalition.includes(who.party))) return false;
  const cost = p.ministers[ministry] ? COST.reshuffle : COST.appoint;
  if (p.capital < cost) return false;
  p.capital -= cost;
  const old = p.ministers[ministry];
  if (old) p.pool = [...p.pool, old];
  p.pool = p.pool.filter((m) => m.id !== id);
  p.ministers[ministry] = who;
  if (who.party !== "civic") p.relations[who.party] = clamp(p.relations[who.party] + 8, -100, 100);
  return true;
}

export function dismiss(s: PoliticsState, ministry: Ministry) {
  const p = s.parl;
  const m = p.ministers[ministry];
  if (!m || p.capital < COST.dismiss) return false;
  p.capital -= COST.dismiss;
  p.ministers[ministry] = null;
  p.pool = [...p.pool, m];
  if (m.party !== "civic") p.relations[m.party] = clamp(p.relations[m.party] - 8, -100, 100);
  if (p.scandal === ministry) p.scandal = null;
  return true;
}

/** A minister in the papers: sack them, or stand by them and take the hit. */
export function resolveScandal(s: PoliticsState, sack: boolean) {
  const p = s.parl;
  const m = p.scandal ? p.ministers[p.scandal] : null;
  if (!p.scandal || !m) {
    p.scandal = null;
    return false;
  }
  if (sack) {
    p.ministers[p.scandal] = null;
    if (m.party !== "civic") p.relations[m.party] = clamp(p.relations[m.party] - 10, -100, 100);
  } else {
    for (const g of FACTIONS) s.mood[g] -= 3;
    m.loyalty = Math.min(100, m.loyalty + 15);
  }
  p.scandal = null;
  return true;
}

// -------------------------------------------------------------- campaign

/** The campaign runs through the last day of the term (once a challenger is named). */
export const campaignOpen = (s: PoliticsState) => !!s.challenger && s.status === "office";

export function rally(s: PoliticsState, g: Faction) {
  const c = s.parl.campaign;
  if (!campaignOpen(s) || c.rallies.includes(g) || s.cash - RALLY_CASH < -25_000) return false;
  s.cash -= RALLY_CASH;
  c.rallies.push(g);
  s.mood[g] += 6;
  return true;
}

export function adBlitz(s: PoliticsState) {
  const c = s.parl.campaign;
  if (!campaignOpen(s) || c.ads >= MAX_ADS || s.cash - AD_CASH < -25_000) return false;
  s.cash -= AD_CASH;
  c.ads++;
  for (const g of FACTIONS) s.mood[g] += 2.5;
  return true;
}

/** The televised debate: a good night lifts everyone; a bad one doesn't. */
export function debate(s: PoliticsState) {
  const c = s.parl.campaign;
  if (!campaignOpen(s) || c.debated) return null;
  c.debated = true;
  const r = roll(s);
  const won = r.next() < clamp(0.3 + (overall(s.approval, { workers: 0.2, business: 0.2, families: 0.2, greens: 0.2, seniors: 0.2 }) - 40) / 80, 0.15, 0.85);
  for (const g of FACTIONS) s.mood[g] += won ? 4 : -2;
  return won;
}

// ------------------------------------------------------------- the clock

export type ParlEvent = { t: "partnerLeft"; party: PartyId } | { t: "scandal"; ministry: Ministry; name: string } | { t: "capital"; n: number };

/** Run the chamber for the hours since last time: capital, moods between parties, partners walking out, scandals. */
export function parlHour(s: PoliticsState, minutes: number, st: Stats): ParlEvent[] {
  const p = s.parl;
  const out: ParlEvent[] = [];
  const hour = Math.floor(minutes / 60);
  if (p.hour < 0) p.hour = hour;
  if (s.status !== "office") {
    p.hour = hour;
    return out;
  }
  const from = Math.max(p.hour, hour - 24);
  const sh = shares(st);
  for (let h = from + 1; h <= hour; h++) {
    const approval = overall(s.approval, sh);
    const gov = govSeats(s);
    p.capital = clamp(p.capital + 0.35 + (approval - 50) * 0.015 + (gov >= MAJORITY ? 0.25 : 0), 0, 100);
    for (const party of PARTIES) {
      if (party === "civic") continue;
      const partner = p.coalition.includes(party);
      const target = (baseApproval(s, party) - 50) * 0.8 + (partner ? 15 : 0) - (partner && p.demands[party] ? 6 : 0);
      p.relations[party] = clamp(p.relations[party] + (target - p.relations[party]) * 0.015, -100, 100);
      if (partner && p.relations[party] < -25) {
        dropPartner(s, party);
        out.push({ t: "partnerLeft", party });
      }
    }
    // Once a day the papers dig: disloyal ministers get caught.
    if (h % 24 === 12 && !p.scandal) {
      const r = roll(s);
      for (const m of MINISTRIES) {
        const who = p.ministers[m];
        if (who && r.next() < ((100 - who.loyalty) / 100) * 0.12) {
          p.scandal = m;
          out.push({ t: "scandal", ministry: m, name: who.name });
          break;
        }
      }
    }
  }
  p.hour = Math.max(p.hour, hour);
  return out;
}

/**
 * After the vote: seats by vote share (largest remainder), partners who still like you stay
 * on, and if you lost the popular vote but lead the biggest party and can still put a
 * majority together, you keep office at the head of a coalition.
 */
export function afterElection(s: PoliticsState, result: ElectionResult, st: Stats) {
  const p = s.parl;
  const sh = shares(st);
  const votes: Record<PartyId, number> = { civic: 0, labour: 0, enterprise: 0, green: 0, heritage: 0 };
  for (const g of FACTIONS) {
    const mine = result.byFaction[g];
    votes.civic += sh[g] * mine;
    let w = 0;
    for (const party of PARTIES) if (party !== "civic") w += PARTY_BASE[party][g] ?? 0;
    for (const party of PARTIES) if (party !== "civic") votes[party] += (sh[g] * (1 - mine) * (PARTY_BASE[party][g] ?? 0)) / Math.max(1e-6, w);
  }
  const total = PARTIES.reduce((n, x) => n + votes[x], 0);
  const quota = PARTIES.map((party) => ({ party, q: (votes[party] / total) * CHAMBER }));
  const seats = Object.fromEntries(quota.map(({ party, q }) => [party, Math.floor(q)])) as Record<PartyId, number>;
  let left = CHAMBER - PARTIES.reduce((n, x) => n + seats[x], 0);
  for (const { party } of [...quota].sort((a, b) => (b.q % 1) - (a.q % 1))) {
    if (left <= 0) break;
    seats[party]++;
    left--;
  }
  p.seats = seats;
  result.seats = { ...seats };
  // Partners who've gone cold leave; the rest carry on.
  for (const party of [...p.coalition]) if (p.relations[party] < 0) dropPartner(s, party);
  if (!result.won) {
    const biggest = PARTIES.every((x) => x === "civic" || seats.civic >= seats[x]);
    const willing = PARTIES.filter((x) => x !== "civic" && p.relations[x] >= 20).sort((a, b) => seats[b] - seats[a]);
    let n = seats.civic;
    const take: PartyId[] = [];
    for (const x of willing) {
      if (n >= MAJORITY) break;
      n += seats[x];
      take.push(x);
    }
    if (biggest && n >= MAJORITY) {
      // A coalition government: you stay mayor.
      result.won = true;
      result.rescued = true;
      s.status = "office";
      s.term++;
      s.termStart += TERM_MINUTES;
      s.challenger = "";
      s.promise = null;
      p.coalition = [...new Set([...p.coalition, ...take])];
      for (const x of take) {
        const w = wish(s, x);
        if (w) p.demands[x] = w;
      }
    }
  }
  if (result.won) {
    p.capital = clamp(p.capital + 20, 0, 100);
    p.campaign = { rallies: [], ads: 0, debated: false };
    p.pool = [...ministerPool(s.seed, s.term, p.nextId)];
    p.nextId += p.pool.length;
    // Ministers whose party left government go.
    for (const m of MINISTRIES) {
      const who = p.ministers[m];
      if (who && who.party !== "civic" && !p.coalition.includes(who.party)) p.ministers[m] = null;
    }
  }
  return result;
}
