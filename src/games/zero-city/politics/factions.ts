/**
 * Your party's factions (Statecraft, 1.0): moderates, progressives and traditionalists. Every
 * politician belongs to one. Each faction wants the government near its spot on the compass,
 * ministers of its own and a pet law. Leave one unhappy long enough, while it's strong, and its
 * most ambitious member challenges you for the leadership.
 */
import { hash } from "../core/rng";
import { LAW_POSITION, governmentPosition, isMinister, type Position } from "./mandate";
import { overall, POLICY_IDS, shares, type PoliticsState, type PolicyId } from "./politics";
import type { Stats } from "../sim/sim";
import { clamp, isHour, rollOf } from "./util";

export const FACTION_IDS = ["moderates", "progressives", "traditionalists"] as const;
export type FactionId = (typeof FACTION_IDS)[number];
export const FACTION_POS: Record<FactionId, Position> = { moderates: [0, 0], progressives: [-0.5, -0.6], traditionalists: [0.4, 0.6] };
export const FACTION_COLOR: Record<FactionId, string> = { moderates: "#94a3b8", progressives: "#34d399", traditionalists: "#f59e0b" };
export const CONCEDE_CAPITAL = 10;

export interface Challenge {
  faction: FactionId;
  /** The challenger (a roster politician id). */
  by: number;
  at: number;
}
export interface FactionState {
  /** Each politician's faction. */
  of: Record<number, FactionId>;
  /** 0–100. */
  sat: Record<FactionId, number>;
  challenge: Challenge | null;
  lastChallenge: number;
  /** A challenger who won: now deputy leader, with real sway. */
  deputy: number | null;
  survived: number;
}

export function newFactions(): FactionState {
  return { of: {}, sat: { moderates: 60, progressives: 55, traditionalists: 55 }, challenge: null, lastChallenge: -1e9, deputy: null, survived: 0 };
}

const dist = (a: Position, b: Position) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** A politician's faction (assigned once, from their id and the city's seed). */
export function factionOf(s: PoliticsState, id: number): FactionId {
  const f = s.x.factions;
  if (!f.of[id]) {
    const v = hash(s.seed, id, 7);
    f.of[id] = v < 0.45 ? "moderates" : v < 0.73 ? "progressives" : "traditionalists";
  }
  return f.of[id];
}

/** The law closest to a faction's heart that isn't in force. */
export function factionWish(s: PoliticsState, f: FactionId): PolicyId | null {
  let best: PolicyId | null = null;
  let bd = Infinity;
  for (const id of POLICY_IDS) {
    if (s.policies.includes(id)) continue;
    const d = dist(LAW_POSITION[id], FACTION_POS[f]);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

/** How much of the party (by politicians) each faction is. */
export function strength(s: PoliticsState): Record<FactionId, number> {
  const out: Record<FactionId, number> = { moderates: 0, progressives: 0, traditionalists: 0 };
  const n = Math.max(1, s.m.roster.length);
  for (const p of s.m.roster) out[factionOf(s, p.id)] += 1 / n;
  return out;
}

/** Where a faction's mood is heading. */
export function factionTarget(s: PoliticsState, f: FactionId, approval: number) {
  const pos = governmentPosition(s);
  const ministers = s.m.roster.filter((p) => factionOf(s, p.id) === f && isMinister(s, p.id)).length;
  const wish = factionWish(s, f);
  return clamp(72 - dist(pos, FACTION_POS[f]) * 45 + ministers * 6 + (approval - 50) * 0.4 - (wish ? 4 : -6), 0, 100);
}

export type FactionEvent = { t: "challenge"; faction: FactionId; name: string } | { t: "challengeLapsed"; faction: FactionId };

export function factionHour(s: PoliticsState, minutes: number, h: number, st: Stats): FactionEvent[] {
  const fs = s.x.factions;
  const out: FactionEvent[] = [];
  const approval = overall(s.approval, shares(st));
  for (const f of FACTION_IDS) fs.sat[f] = clamp(fs.sat[f] + (factionTarget(s, f, approval) - fs.sat[f]) * 0.025, 0, 100);
  // An unanswered challenge goes to a ballot on its own after a day.
  if (fs.challenge && minutes - fs.challenge.at > 24 * 60) {
    out.push({ t: "challengeLapsed", faction: fs.challenge.faction });
    fight(s, minutes);
  }
  if (isHour(h, 20) && !fs.challenge && s.status === "office" && minutes - fs.lastChallenge > 3 * 24 * 60) {
    const str = strength(s);
    const angry = FACTION_IDS.filter((f) => fs.sat[f] < 28 && str[f] >= 0.3).sort((a, b) => fs.sat[a] - fs.sat[b])[0];
    if (angry) {
      const members = s.m.roster.filter((p) => factionOf(s, p.id) === angry && !isMinister(s, p.id));
      const by = members.sort((a, b) => b.ambition - a.ambition)[0];
      if (by) {
        fs.challenge = { faction: angry, by: by.id, at: minutes };
        fs.lastChallenge = minutes;
        out.push({ t: "challenge", faction: angry, name: by.name });
      }
    }
  }
  return out;
}

/** Give the rebels what they want: the platform moves their way, and they stand down. */
export function concede(s: PoliticsState) {
  const fs = s.x.factions;
  const c = fs.challenge;
  if (!c || s.parl.capital < CONCEDE_CAPITAL) return false;
  s.parl.capital -= CONCEDE_CAPITAL;
  const to = FACTION_POS[c.faction];
  s.m.platform = [s.m.platform[0] + (to[0] - s.m.platform[0]) * 0.4, s.m.platform[1] + (to[1] - s.m.platform[1]) * 0.4];
  fs.sat[c.faction] = clamp(fs.sat[c.faction] + 30, 0, 100);
  fs.challenge = null;
  return true;
}

/** How the party ballot would go: each politician's loyalty, the rebels' faction against you, the members by approval. */
export function ballotForecast(s: PoliticsState) {
  const c = s.x.factions.challenge;
  if (!c) return 1;
  let mine = 0;
  let total = 0;
  for (const p of s.m.roster) {
    if (p.id === c.by) continue;
    const w = 1 + p.popularity / 100;
    const lean = p.loyalty / 100 - (factionOf(s, p.id) === c.faction ? 0.35 : 0) + (p.trait === "loyalist" ? 0.25 : 0);
    mine += clamp(lean, 0, 1) * w;
    total += w;
  }
  const approval = Object.values(s.approval).reduce((a, b) => a + b, 0) / 5;
  return clamp((total ? mine / total : 0.5) * 0.6 + (approval / 100) * 0.4, 0, 1);
}

/** Fight it out in a party ballot. Win and the rebels are humbled; lose and the challenger becomes deputy and drags the platform their way. */
export function fight(s: PoliticsState, minutes: number) {
  const fs = s.x.factions;
  const c = fs.challenge;
  if (!c) return null;
  const share = clamp(ballotForecast(s) + (rollOf(s, 9187).next() - 0.5) * 0.1, 0, 1);
  const won = share >= 0.5;
  const who = s.m.roster.find((p) => p.id === c.by);
  if (won) {
    if (who) who.loyalty = clamp(who.loyalty - 20, 0, 100);
    fs.sat[c.faction] = clamp(fs.sat[c.faction] - 10, 0, 100);
    s.parl.capital = clamp(s.parl.capital + 10, 0, 100);
    fs.survived++;
  } else {
    const to = FACTION_POS[c.faction];
    s.m.platform = [s.m.platform[0] + (to[0] - s.m.platform[0]) * 0.7, s.m.platform[1] + (to[1] - s.m.platform[1]) * 0.7];
    s.parl.capital = Math.max(0, s.parl.capital - 25);
    fs.deputy = c.by;
    fs.sat[c.faction] = clamp(fs.sat[c.faction] + 35, 0, 100);
    if (who) who.loyalty = clamp(who.loyalty + 30, 0, 100);
    for (const p of s.m.roster) if (factionOf(s, p.id) !== c.faction && isMinister(s, p.id)) p.loyalty = clamp(p.loyalty - 10, 0, 100);
  }
  fs.challenge = null;
  void minutes;
  return { won, share, faction: c.faction, name: who?.name ?? "" };
}
