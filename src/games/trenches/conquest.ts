import type { Flag, Team } from "./battlefield";

/**
 * Conquest rules (pure). Each flag has a tug-of-war value p in [-1, 1]: team 1
 * pulls it to -1, team 2 to +1. Reaching an end captures it; crossing 0
 * neutralises it. Contested flags (both teams present) freeze. Holding more
 * flags drains the enemy's tickets; every death costs a ticket.
 */

export const START_TICKETS = 150;
export const CAPTURE_SECONDS = 8;
/** Seconds between ticket bleeds when a team holds the majority (faster with all 3). */
export const BLEED_SECONDS = 3;
export const MATCH_SECONDS = 15 * 60;

export interface FlagState {
  id: Flag["id"];
  x: number;
  y: number;
  r: number;
  p: number;
  owner: 0 | Team;
  /** Teams present this tick (for HUD "capturing" / "contested"). */
  present: [number, number];
}

export interface ConquestState {
  tickets: [number, number];
  flags: FlagState[];
  bleedAcc: number;
  time: number;
  winner: 0 | Team | null;
}

export type ConquestEvent =
  | { type: "captured"; flag: Flag["id"]; team: Team }
  | { type: "neutralized"; flag: Flag["id"]; by: Team }
  | { type: "ended"; winner: 0 | Team };

export function createConquest(flags: Flag[], tickets = START_TICKETS): ConquestState {
  return {
    tickets: [tickets, tickets],
    flags: flags.map((f) => ({ ...f, p: 0, owner: 0, present: [0, 0] })),
    bleedAcc: 0,
    time: 0,
    winner: null,
  };
}

export interface Soldier {
  x: number;
  y: number;
  team: Team;
  alive: boolean;
}

/** Advance flags, bleed and the clock. Pure apart from mutating `s`. */
export function stepConquest(s: ConquestState, soldiers: Soldier[], dt: number): ConquestEvent[] {
  const events: ConquestEvent[] = [];
  if (s.winner !== null) return events;
  s.time += dt;

  for (const f of s.flags) {
    const n: [number, number] = [0, 0];
    for (const u of soldiers) if (u.alive && Math.hypot(u.x - f.x, u.y - f.y) <= f.r) n[u.team - 1]++;
    f.present = n;
    let dir = 0;
    if (n[0] > 0 && n[1] === 0) dir = -Math.min(3, n[0]);
    else if (n[1] > 0 && n[0] === 0) dir = Math.min(3, n[1]);
    else if (n[0] === 0 && n[1] === 0) {
      // Unattended flags settle back toward their owner (or neutral).
      const rest = f.owner === 1 ? -1 : f.owner === 2 ? 1 : 0;
      dir = Math.sign(rest - f.p) * 0.25;
      if (Math.abs(rest - f.p) < 0.01) dir = 0;
    }
    const before = f.p;
    f.p = Math.max(-1, Math.min(1, f.p + (dir * dt) / CAPTURE_SECONDS));
    if (f.owner !== 0 && Math.sign(f.p) !== Math.sign(before) && Math.sign(before) !== 0) {
      events.push({ type: "neutralized", flag: f.id, by: f.owner === 1 ? 2 : 1 });
      f.owner = 0;
    }
    if (f.owner === 0 && f.p <= -1) {
      f.owner = 1;
      events.push({ type: "captured", flag: f.id, team: 1 });
    } else if (f.owner === 0 && f.p >= 1) {
      f.owner = 2;
      events.push({ type: "captured", flag: f.id, team: 2 });
    }
  }

  // Ticket bleed for the side holding more flags.
  const held = [s.flags.filter((f) => f.owner === 1).length, s.flags.filter((f) => f.owner === 2).length];
  if (held[0] !== held[1]) {
    const leader = held[0] > held[1] ? 0 : 1;
    const rate = Math.max(held[0], held[1]) === s.flags.length ? 2 : 1;
    s.bleedAcc += dt * rate;
    while (s.bleedAcc >= BLEED_SECONDS) {
      s.bleedAcc -= BLEED_SECONDS;
      s.tickets[1 - leader] = Math.max(0, s.tickets[1 - leader] - 1);
    }
  } else s.bleedAcc = 0;

  return [...events, ...checkEnd(s)];
}

/** A soldier of `team` died: their side loses a ticket. */
export function onDeath(s: ConquestState, team: Team): ConquestEvent[] {
  if (s.winner !== null) return [];
  s.tickets[team - 1] = Math.max(0, s.tickets[team - 1] - 1);
  return checkEnd(s);
}

function checkEnd(s: ConquestState): ConquestEvent[] {
  if (s.winner !== null) return [];
  const [a, b] = s.tickets;
  let winner: 0 | Team | null = null;
  if (a <= 0 && b <= 0) winner = 0;
  else if (a <= 0) winner = 2;
  else if (b <= 0) winner = 1;
  else if (s.time >= MATCH_SECONDS) winner = a === b ? 0 : a > b ? 1 : 2;
  if (winner === null) return [];
  s.winner = winner;
  return [{ type: "ended", winner }];
}

/** Spawn choices for a team: its base plus every flag it owns. */
export function spawnOptions(s: ConquestState, team: Team) {
  return s.flags.filter((f) => f.owner === team);
}
