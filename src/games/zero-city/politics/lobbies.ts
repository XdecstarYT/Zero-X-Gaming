/**
 * Interest groups (Statecraft, 1.0): six organisations that speak for the city's voters. Each
 * likes some laws and hates others, makes demands (pass this law) and offers (a donation for the
 * party, with strings). Take too much money and the papers find out. At election time the ones
 * that like you endorse you; the ones that don't campaign against you.
 */
import { FACTIONS, POLICIES, type Faction, type PoliticsState, type PolicyId } from "./politics";
import { clamp, isHour, rollOf } from "./util";

export const LOBBY_IDS = ["unions", "commerce", "parents", "ecology", "pensioners", "builders"] as const;
export type LobbyId = (typeof LOBBY_IDS)[number];

export interface LobbyDef {
  /** The voters it speaks for. */
  groups: Partial<Record<Faction, number>>;
  likes: PolicyId[];
  hates: PolicyId[];
  /** A rival that resents you taking this one's money. */
  rival?: LobbyId;
  color: string;
}
export const LOBBIES: Record<LobbyId, LobbyDef> = {
  unions: { groups: { workers: 1 }, likes: ["freeTransit", "nightBuses", "socialHousing", "rentCap"], hates: ["zoningReform", "auditOffice", "congestionCharge"], rival: "commerce", color: "#ef4444" },
  commerce: { groups: { business: 1 }, likes: ["smallBiz", "tourism", "zoningReform", "auditOffice", "nightlife"], hates: ["landTax", "rentCap", "congestionCharge", "cleanAir"], rival: "unions", color: "#3b82f6" },
  parents: { groups: { families: 1 }, likes: ["libraries", "treePlanting", "watch", "fireCode"], hates: ["nightlife"], color: "#f472b6" },
  ecology: { groups: { greens: 1 }, likes: ["cleanAir", "solarRoofs", "bikeLanes", "greenBelt", "recycling", "congestionCharge"], hates: ["roadFund", "zoningReform"], rival: "builders", color: "#22c55e" },
  pensioners: { groups: { seniors: 1 }, likes: ["heritage", "cctv", "watch", "libraries"], hates: ["nightlife", "festivalFund", "zoningReform"], color: "#a855f7" },
  builders: { groups: { business: 0.6, workers: 0.4 }, likes: ["zoningReform", "roadFund", "socialHousing"], hates: ["greenBelt", "heritage", "rentCap"], rival: "ecology", color: "#f59e0b" },
};

export const MEET_CAPITAL = 4;
export const ASK_HOURS = 36;

export type Ask = { kind: "demand"; law: PolicyId; until: number } | { kind: "offer"; amount: number; until: number };
export interface LobbyRec {
  /** How it feels about you, −100…100. */
  relation: number;
  /** How much weight it carries (0–100), from how many of its people live here. */
  power: number;
  ask: Ask | null;
  metAt: number;
}
export interface LobbyState {
  rec: Record<LobbyId, LobbyRec>;
  /** How much the papers could dig up about donations (0–100). */
  exposure: number;
  /** Term of the last endorsements. */
  endorsed: number;
  /** A leak that's waiting to turn into an investigation. */
  leaked: boolean;
  donations: number;
}

export function newLobbies(): LobbyState {
  const rec = {} as Record<LobbyId, LobbyRec>;
  for (const id of LOBBY_IDS) rec[id] = { relation: 10, power: 50, ask: null, metAt: -1e9 };
  return { rec, exposure: 0, endorsed: 0, leaked: false, donations: 0 };
}

/** How the lobby's people feel about you (their approval, weighted). */
function baseFeel(s: PoliticsState, id: LobbyId) {
  let v = 0;
  let w = 0;
  for (const [g, k] of Object.entries(LOBBIES[id].groups)) {
    v += s.approval[g as Faction] * (k ?? 0);
    w += k ?? 0;
  }
  return w ? v / w : 50;
}

/** Where its feeling toward you is heading: its people's approval and the laws in force. */
export function lobbyTarget(s: PoliticsState, id: LobbyId) {
  const d = LOBBIES[id];
  let t = (baseFeel(s, id) - 50) * 0.6;
  for (const law of d.likes) if (s.policies.includes(law)) t += 12;
  for (const law of d.hates) if (s.policies.includes(law)) t -= 12;
  return clamp(t, -100, 100);
}

export function meet(s: PoliticsState, id: LobbyId, minutes: number) {
  const r = s.x.lobbies.rec[id];
  if (s.parl.capital < MEET_CAPITAL || minutes - r.metAt < 24 * 60) return false;
  s.parl.capital -= MEET_CAPITAL;
  r.metAt = minutes;
  r.relation = clamp(r.relation + 8, -100, 100);
  return true;
}

/** Take the money (into party funds). It buys goodwill, angers the rival, and leaves a trail. */
export function acceptOffer(s: PoliticsState, id: LobbyId) {
  const st = s.x.lobbies;
  const r = st.rec[id];
  if (r.ask?.kind !== "offer") return 0;
  const amount = r.ask.amount;
  s.m.funds += amount;
  r.relation = clamp(r.relation + 10, -100, 100);
  const rival = LOBBIES[id].rival;
  if (rival) st.rec[rival].relation = clamp(st.rec[rival].relation - 8, -100, 100);
  st.exposure = clamp(st.exposure + amount / 400, 0, 100);
  st.donations += amount;
  r.ask = null;
  return amount;
}

export function declineAsk(s: PoliticsState, id: LobbyId) {
  const r = s.x.lobbies.rec[id];
  if (!r.ask) return false;
  r.relation = clamp(r.relation - (r.ask.kind === "demand" ? 8 : 3), -100, 100);
  r.ask = null;
  return true;
}

export type LobbyEvent =
  | { t: "lobbyAsk"; id: LobbyId; ask: Ask }
  | { t: "lobbyMet"; id: LobbyId; law: PolicyId }
  | { t: "lobbySnubbed"; id: LobbyId; law: PolicyId }
  | { t: "leak"; amount: number }
  | { t: "endorse"; for: LobbyId[]; against: LobbyId[] };

export function lobbyHour(s: PoliticsState, minutes: number, h: number, shares: Record<Faction, number>): LobbyEvent[] {
  const st = s.x.lobbies;
  const out: LobbyEvent[] = [];
  for (const id of LOBBY_IDS) {
    const r = st.rec[id];
    r.relation = clamp(r.relation + (lobbyTarget(s, id) - r.relation) * 0.02, -100, 100);
    let p = 0;
    for (const [g, k] of Object.entries(LOBBIES[id].groups)) p += (shares[g as Faction] ?? 0) * (k ?? 0);
    r.power = clamp(Math.round(p * 400), 5, 100);
    // Demands met (or not) and asks running out.
    const a = r.ask;
    if (a?.kind === "demand" && s.policies.includes(a.law)) {
      r.relation = clamp(r.relation + 20, -100, 100);
      s.m.funds += 2_000;
      r.ask = null;
      out.push({ t: "lobbyMet", id, law: a.law });
    } else if (a && minutes >= a.until) {
      if (a.kind === "demand") {
        r.relation = clamp(r.relation - 15, -100, 100);
        out.push({ t: "lobbySnubbed", id, law: a.law });
      }
      r.ask = null;
    }
  }
  // Each afternoon a group or two comes knocking.
  if (isHour(h, 13)) {
    const rr = rollOf(s, 3373);
    for (const id of LOBBY_IDS) {
      const r = st.rec[id];
      if (r.ask || rr.next() > 0.35) continue;
      const wanted = LOBBIES[id].likes.filter((law) => !s.policies.includes(law));
      const ask: Ask = wanted.length && rr.next() < 0.6 ? { kind: "demand", law: wanted[Math.floor(rr.next() * wanted.length)], until: minutes + ASK_HOURS * 60 } : { kind: "offer", amount: Math.round((1_500 + r.power * 80) / 100) * 100, until: minutes + ASK_HOURS * 60 };
      r.ask = ask;
      out.push({ t: "lobbyAsk", id, ask });
    }
  }
  // Late at night the papers dig through the donations.
  if (isHour(h, 21) && st.exposure > 20) {
    const rr = rollOf(s, 7121);
    if (rr.next() < st.exposure / 250) {
      const amount = Math.round(st.donations);
      for (const g of FACTIONS) s.mood[g] -= 2.5;
      st.exposure = Math.max(0, st.exposure - 30);
      st.leaked = true;
      out.push({ t: "leak", amount });
    }
  }
  // When the campaign opens, the groups pick sides.
  if (s.challenger && st.endorsed !== s.term) {
    st.endorsed = s.term;
    const yes: LobbyId[] = [];
    const no: LobbyId[] = [];
    for (const id of LOBBY_IDS) {
      const r = st.rec[id];
      for (const [g, k] of Object.entries(LOBBIES[id].groups)) {
        if (r.relation >= 35) s.mood[g as Faction] += (4 + r.power / 25) * (k ?? 0);
        else if (r.relation <= -35) s.mood[g as Faction] -= 3 * (k ?? 0);
      }
      if (r.relation >= 35) yes.push(id);
      else if (r.relation <= -35) no.push(id);
    }
    out.push({ t: "endorse", for: yes, against: no });
  }
  return out;
}

/** The law a lobby cares most about, for the UI. */
export const lobbyCares = (id: LobbyId) => [...LOBBIES[id].likes, ...LOBBIES[id].hates].filter((l) => POLICIES[l]);
