/**
 * Statecraft (1.0): the budget, decrees, lobbies, the press, the opposition, your party's
 * factions, crises and your legacy, run hour by hour alongside the rest of Mayor mode.
 */
import type { Stats } from "../sim/sim";
import { budgetHour, newBudget, type BudgetEvent, type BudgetState } from "./budget";
import { crisisHour, newCrises, type CrisisEvent, type CrisisState } from "./crises";
import { decreeHour, newDecrees, type DecreeEvent, type DecreeState } from "./decrees";
import { factionHour, newFactions, type FactionEvent, type FactionState } from "./factions";
import { legacyCheck, newLegacy, RECORD_KEYS, type LegacyState } from "./legacy";
import { LOBBY_IDS, lobbyHour, newLobbies, type LobbyEvent, type LobbyState } from "./lobbies";
import { projection } from "./mandate";
import { mediaHour, newMedia, OUTLET_IDS, type MediaState } from "./media";
import { newOpposition, OPP, oppHour, type OppEvent, type OppState } from "./opposition";
import { overall, PARTIES, shares, type PartyId, type PoliticsState } from "./politics";

export interface StatecraftState {
  budget: BudgetState;
  decrees: DecreeState;
  lobbies: LobbyState;
  media: MediaState;
  opp: OppState;
  factions: FactionState;
  crises: CrisisState;
  legacy: LegacyState;
  /** The last game hour run. */
  hour: number;
}

export function newStatecraft(seed: number, minutes: number): StatecraftState {
  return {
    budget: newBudget(minutes),
    decrees: newDecrees(),
    lobbies: newLobbies(),
    media: newMedia(),
    opp: newOpposition(seed, minutes),
    factions: newFactions(),
    crises: newCrises(),
    legacy: newLegacy(),
    hour: Math.floor(minutes / 60),
  };
}

/** Fill in what an older save is missing. */
export function normaliseStatecraft(seed: number, minutes: number, raw: Partial<StatecraftState> | undefined): StatecraftState {
  const base = newStatecraft(seed, minutes);
  if (!raw) return base;
  const out = { ...base, ...raw } as StatecraftState;
  out.budget = { ...base.budget, ...raw.budget, levels: { ...base.budget.levels, ...raw.budget?.levels } };
  out.decrees = { ...base.decrees, ...raw.decrees };
  out.lobbies = { ...base.lobbies, ...raw.lobbies, rec: { ...base.lobbies.rec, ...raw.lobbies?.rec } };
  for (const id of LOBBY_IDS) out.lobbies.rec[id] = { ...base.lobbies.rec[id], ...out.lobbies.rec[id] };
  out.media = { ...base.media, ...raw.media, rel: { ...base.media.rel, ...raw.media?.rel } };
  for (const id of OUTLET_IDS) out.media.rel[id] ??= 0;
  out.opp = { ...base.opp, ...raw.opp, leaders: { ...base.opp.leaders, ...raw.opp?.leaders }, effort: { ...base.opp.effort, ...raw.opp?.effort } };
  for (const p of OPP) out.opp.effort[p] ??= {};
  out.factions = { ...base.factions, ...raw.factions, sat: { ...base.factions.sat, ...raw.factions?.sat } };
  out.crises = { ...base.crises, ...raw.crises };
  out.legacy = { ...base.legacy, ...raw.legacy, rec: { ...base.legacy.rec, ...raw.legacy?.rec } };
  for (const k of RECORD_KEYS) out.legacy.rec[k] ??= 0;
  return out;
}

export type StatecraftEvent = BudgetEvent | DecreeEvent | LobbyEvent | OppEvent | FactionEvent | CrisisEvent | { t: "achievement"; id: string };

/** Run the hours since last time. */
export function statecraftHour(s: PoliticsState, minutes: number, st: Stats): StatecraftEvent[] {
  const x = s.x;
  const out: StatecraftEvent[] = [];
  const hour = Math.floor(minutes / 60);
  if (s.status !== "office" || hour <= x.hour) {
    x.hour = Math.max(x.hour, hour);
    return out;
  }
  const sh = shares(st);
  const from = Math.max(x.hour, hour - 24);
  // Each district's vote, worked out once (the opposition decides where to campaign from it).
  const proj = new Map(projection(s).map((r) => [r.id, r.share]));
  const shareIn = (d: number): Record<PartyId, number> | null => proj.get(d) ?? null;
  for (let h = from + 1; h <= hour; h++) {
    const m = h * 60;
    out.push(...decreeHour(s, m));
    mediaHour(s, st);
    out.push(...lobbyHour(s, m, h, sh));
    out.push(...oppHour(s, m, h, shareIn));
    out.push(...factionHour(s, m, h, st));
    out.push(...crisisHour(s, m, h, st));
    out.push(...budgetHour(s, m));
    if (s.status !== "office") break;
  }
  x.hour = Math.max(x.hour, hour);
  const poll = s.m.partyPolls[s.m.partyPolls.length - 1]?.v;
  const leading = !!poll && PARTIES.every((p) => p === "civic" || poll.civic >= poll[p]);
  for (const id of legacyCheck(s, minutes, overall(s.approval, sh), leading)) out.push({ t: "achievement", id });
  return out;
}
