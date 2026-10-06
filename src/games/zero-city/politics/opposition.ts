/**
 * The opposition (Statecraft, 1.0). Every other party has a leader and its own agenda. They
 * table their own bills (which pass without you if they can find a majority), work the districts
 * where they're strong, and in the campaign they run attack ads. You can back their bills, fight
 * them with your members, or spend capital to talk them into withdrawing.
 */
import { rng } from "../core/rng";
import type { Mp } from "./mandate";
import { MAJORITY, PARTIES, POLICIES, POLICY_IDS, type Faction, type PartyId, type PoliticsState, type PolicyId } from "./politics";
import { partyStance } from "./parliament";
import { clamp, isHour, rollOf, sigmoid } from "./util";

export type Opp = Exclude<PartyId, "civic">;
export const OPP: Opp[] = ["labour", "enterprise", "green", "heritage"];
export const STYLES = ["fierce", "pragmatic", "populist"] as const;
export type Style = (typeof STYLES)[number];
export const NEGOTIATE_CAPITAL = 10;
export const MAX_BILLS = 3;

export interface Leader {
  name: string;
  face: number;
  charisma: number;
  style: Style;
}
export type Stance = "free" | "support" | "oppose";
export interface OppBill {
  id: number;
  party: Opp;
  law: PolicyId;
  enable: boolean;
  voteAt: number;
  /** How you tell your members to vote. */
  stance: Stance;
}
export interface OppState {
  leaders: Record<Opp, Leader>;
  /** Each party's ground game per district (0–100). */
  effort: Record<Opp, Record<number, number>>;
  bills: OppBill[];
  nextBill: number;
  nextId: number;
  defeated: number;
  /** Bills of theirs that passed. */
  lost: number;
  attacks: number;
}

const FIRST = ["Alma", "Bruno", "Carys", "Dmitri", "Edda", "Fergus", "Hana", "Idris", "Juno", "Kasper", "Lorna", "Matteo", "Niamh", "Orla", "Piet", "Rhea", "Silas", "Thea", "Uma", "Viggo"];
const LAST = ["Achterberg", "Blackwood", "Calloway", "Dunmore", "Esposito", "Farrow", "Gallagher", "Hartmann", "Ingram", "Kessler", "Lindgren", "Marchetti", "Northcott", "Ogilvy", "Pemberton", "Rourke", "Stroud", "Tremaine", "Vance", "Winslow"];

export function newOpposition(seed: number, minutes: number): OppState {
  const r = rng(seed * 2909 + 11);
  const leaders = {} as Record<Opp, Leader>;
  for (const p of OPP) leaders[p] = { name: `${r.pick(FIRST)} ${r.pick(LAST)}`, face: Math.floor(r.next() * 1e6), charisma: r.int(4, 9), style: r.pick(STYLES) };
  return { leaders, effort: { labour: {}, enterprise: {}, green: {}, heritage: {} }, bills: [], nextBill: minutes + 18 * 60, nextId: 1, defeated: 0, lost: 0, attacks: 0 };
}

/** Their ground game in a district, as approval points off yours (the strongest rival counts). */
export function oppPressure(s: PoliticsState, district: number) {
  const o = s.x?.opp;
  if (!o) return 0;
  let best = 0;
  for (const p of OPP) best = Math.max(best, o.effort[p][district] ?? 0);
  return best * 0.07;
}

/** The law a party most wants changed: a favourite not in force, or a hated one that is. */
function agenda(s: PoliticsState, party: Opp): { law: PolicyId; enable: boolean } | null {
  let best: { law: PolicyId; enable: boolean } | null = null;
  let bv = 0.2;
  for (const id of POLICY_IDS) {
    const on = s.policies.includes(id);
    const v = partyStance(party, id, !on);
    if (v > bv) {
      bv = v;
      best = { law: id, enable: !on };
    }
  }
  return best;
}

/** How a member of yours would vote with no instruction: with their district. */
function districtLean(s: PoliticsState, mp: Mp, law: PolicyId, enable: boolean) {
  const mix = s.m.dstats.find((d) => d.id === mp.district)?.mix;
  if (!mix) return 0;
  let v = 0;
  for (const g of Object.keys(mix) as Faction[]) v += mix[g] * (POLICIES[law].stance[g] ?? 0);
  return v * (enable ? 1 : -1);
}

/** How the chamber would vote on an opposition bill right now. */
export function oppForecast(s: PoliticsState, b: OppBill) {
  const votes = PARTIES.map((party) => {
    const seats = s.parl.seats[party];
    if (party === "civic") {
      const mine = s.m.mps.filter((x) => x.party === "civic");
      let yes = 0;
      for (const mp of mine) {
        const lean = districtLean(s, mp, b.law, b.enable);
        const loyal = s.m.roster.find((p) => p.id === mp.pol)?.loyalty ?? 70;
        if (b.stance === "support") yes += lean < -0.25 && loyal < 40 ? 0 : 1;
        else if (b.stance === "oppose") yes += lean > 0.2 && loyal < 50 && !s.m.whip ? 1 : 0;
        else yes += lean > 0 ? 1 : 0;
      }
      return { party, seats, yes: Math.min(seats, yes) };
    }
    if (party === b.party) return { party, seats, yes: seats };
    let score = partyStance(party, b.law, b.enable) * 55 + 4;
    // Your partners lean your way.
    if (s.parl.coalition.includes(party)) score += b.stance === "oppose" ? -22 : b.stance === "support" ? 22 : 0;
    return { party, seats, yes: Math.round(seats * sigmoid(score / 10)) };
  });
  const yes = votes.reduce((n, v) => n + v.yes, 0);
  const total = votes.reduce((n, v) => n + v.seats, 0);
  return { votes, yes, no: total - yes, passed: yes >= MAJORITY };
}

export function setStance(s: PoliticsState, id: number, stance: Stance) {
  const b = s.x.opp.bills.find((x) => x.id === id);
  if (!b) return false;
  b.stance = stance;
  return true;
}

/** Try to talk them out of it. */
export function negotiate(s: PoliticsState, id: number) {
  const o = s.x.opp;
  const b = o.bills.find((x) => x.id === id);
  if (!b || s.parl.capital < NEGOTIATE_CAPITAL) return null;
  s.parl.capital -= NEGOTIATE_CAPITAL;
  const r = rollOf(s, 8831);
  const chance = s.parl.relations[b.party] >= 0 ? 0.7 : 0.35;
  const ok = r.next() < chance;
  if (ok) {
    o.bills = o.bills.filter((x) => x.id !== id);
    s.parl.relations[b.party] = clamp(s.parl.relations[b.party] + 4, -100, 100);
  } else s.parl.relations[b.party] = clamp(s.parl.relations[b.party] - 2, -100, 100);
  return ok;
}

export type OppEvent =
  | { t: "oppBill"; bill: OppBill }
  | { t: "oppVote"; bill: OppBill; passed: boolean; yes: number; no: number }
  | { t: "attack"; party: Opp };

export function oppHour(s: PoliticsState, minutes: number, h: number, shareIn: (d: number) => Record<PartyId, number> | null): OppEvent[] {
  const o = s.x.opp;
  const out: OppEvent[] = [];
  const campaign = !!s.challenger;
  // The ground game: each party works the districts where it has a chance.
  for (const p of OPP) {
    const lead = o.leaders[p];
    for (const d of s.m.districts) {
      const sh = shareIn(d.id)?.[p] ?? 0;
      let e = (o.effort[p][d.id] ?? 0) * 0.99;
      if (sh >= 0.12) e += (s.parl.seats[p] * 0.06 + lead.charisma * 0.02) * (campaign ? 2 : 1) * (lead.style === "populist" ? 1.2 : 1);
      o.effort[p][d.id] = clamp(e, 0, 100);
    }
  }
  // Votes that are due.
  for (const b of [...o.bills]) {
    if (minutes < b.voteAt) continue;
    const f = oppForecast(s, b);
    if (f.passed) {
      s.policies = b.enable ? [...new Set([...s.policies, b.law])] : s.policies.filter((x) => x !== b.law);
      o.lost++;
      if (b.stance === "support") s.parl.relations[b.party] = clamp(s.parl.relations[b.party] + 10, -100, 100);
    } else {
      o.defeated++;
      if (b.stance === "oppose") s.parl.relations[b.party] = clamp(s.parl.relations[b.party] - 8, -100, 100);
    }
    o.bills = o.bills.filter((x) => x.id !== b.id);
    out.push({ t: "oppVote", bill: b, passed: f.passed, yes: f.yes, no: f.no });
  }
  // New bills, every half day or so.
  if (minutes >= o.nextBill && s.status === "office") {
    const r = rollOf(s, 6043);
    o.nextBill = minutes + (14 + r.next() * 8) * 60;
    if (o.bills.length < MAX_BILLS) {
      const pool = OPP.filter((p) => !s.parl.coalition.includes(p) && s.parl.seats[p] > 0);
      const total = pool.reduce((n, p) => n + s.parl.seats[p], 0);
      let pick = r.next() * total;
      const party = pool.find((p) => (pick -= s.parl.seats[p]) < 0) ?? pool[0];
      const a = party ? agenda(s, party) : null;
      if (party && a && !o.bills.some((x) => x.law === a.law)) {
        const bill: OppBill = { id: o.nextId++, party, law: a.law, enable: a.enable, voteAt: minutes + 8 * 60, stance: "free" };
        o.bills = [...o.bills, bill];
        out.push({ t: "oppBill", bill });
      }
    }
  }
  // Attack ads, once a day in the campaign.
  if (campaign && isHour(h, 19)) {
    const party = OPP.reduce((a, b) => (s.parl.seats[b] > s.parl.seats[a] ? b : a));
    const soften = 1 - 0.25 * s.m.hq.press;
    const hit = (o.leaders[party].style === "fierce" ? 2 : 1.5) * soften;
    for (const g of Object.keys(s.mood) as Faction[]) s.mood[g] -= hit;
    o.attacks++;
    out.push({ t: "attack", party });
  }
  return out;
}
