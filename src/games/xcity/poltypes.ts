import type { Pts } from "./geom";

/**
 * The shapes of XCity's politics (kept apart from the engine so the city's state can carry them
 * without importing it): parties and their positions, voter groups, electorates, promises, the
 * federal parliament and its bills, and the settings a world is made with.
 */

export type Axis = "housing" | "transit" | "tax" | "green";
export type GroupId = "renters" | "owners" | "families" | "young" | "retirees" | "business" | "farmers";
export type Position = Record<Axis, number>;

export interface Party {
  id: number;
  name: string;
  short: string;
  color: string;
  icon: string;
  leader: string;
  /** Each axis from -1 to 1 (see AXIS_INFO). */
  pos: Position;
  ai: boolean;
  /** Share of the vote it gets in the rest of the country (0..1). */
  national: number;
}

export interface Electorate {
  id: number;
  name: string;
  x: number;
  z: number;
  poly: Pts;
  /** Party holding the seat (-1 before the first election). */
  holder: number;
  /** The member's name. */
  mp: string;
  /** Each party's candidate here. */
  candidates: string[];
  /** Current support for each party (sums to 1). */
  support: number[];
  /** Campaign presence of each party (decays week by week). */
  effort: number[];
  /** Share of each voter group. */
  groups: Record<GroupId, number>;
  voters: number;
  last: { votes: number[]; winner: number; margin: number } | null;
}

export type PromiseKind = "homes" | "tram" | "bikes" | "taxCut" | "heights" | "schools" | "park" | "parking" | "rents" | "farms";

export interface PromiseRec {
  id: number;
  kind: PromiseKind;
  label: string;
  party: number;
  made: number;
  /** What to measure it against (homes built when made, tax rate, farmland…). */
  base: number;
  /** For promises about one electorate. */
  electorate: number;
  status: "open" | "kept" | "broken";
}

export type BillKind = "housingAccord" | "transitFund" | "parkingReform" | "rateCap" | "greenBelt" | "firstHome";

export interface Bill {
  id: number;
  kind: BillKind;
  /** True if it repeals the law instead. */
  repeal: boolean;
  /** Who brought it: a party, or the government (-1). */
  by: number;
  month: number;
  status: "pending" | "passed" | "failed";
  yes: number;
  no: number;
  myVote: "yes" | "no" | "abstain" | null;
}

export interface Federal {
  /** Seats by party after the last election. */
  seats: number[];
  government: number;
  nextSitting: number;
  /** A sitting is on (bills to vote on, a question to ask). */
  sitting: boolean;
  bills: Bill[];
  history: Bill[];
  laws: Partial<Record<BillKind, boolean>>;
  asked: boolean;
  proposed: boolean;
}

export interface GovtAct {
  id: number;
  month: number;
  text: string;
  /** Which way it leans (for who'll march against it). */
  axis: Axis;
  dir: 1 | -1;
  building: number;
  protested: boolean;
}

export interface ElectionResult {
  month: number;
  seats: number[];
  winner: number;
  /** Did you win your own seat? */
  mine: boolean;
  federal: number[];
  federalWinner: number;
  /** Promises kept and broken this term (yours). */
  kept: number;
  broken: number;
  rows: { electorate: number; votes: number[]; winner: number; margin: number; was: number }[];
}

export type Role = "candidate" | "govern" | "opposition" | "out";

export interface PolSettings {
  system: "fptp" | "preferential";
  termYears: number;
  campaignWeeks: number;
  electorates: number;
  aiParties: number;
  federalSeats: number;
  difficulty: "easy" | "normal" | "hard";
}

export interface Pol {
  settings: PolSettings;
  parties: Party[];
  player: number;
  /** The electorate you stand in. */
  seat: number;
  electorates: Electorate[];
  role: Role;
  /** The party governing the city. */
  government: number;
  campaign: boolean;
  week: number;
  electionAt: number;
  campaignFrom: number;
  /** Action points: what you can still do this week (or month, between campaigns). */
  ap: number;
  apMax: number;
  funds: number;
  /** How far voters trust your word (0..100). */
  trust: number;
  promises: PromiseRec[];
  lobby: Record<GroupId, number>;
  /** Which party each group has endorsed (-1 for none). */
  endorse: Record<GroupId, number>;
  /** Lasting goodwill (or ill will) of each group toward each party, from promises, protests and debates. */
  bonus: Record<GroupId, number>[];
  polls: { month: number; week: number; share: number[] }[];
  federal: Federal;
  results: ElectionResult[];
  /** The last result, until the election-night screen is closed. */
  night: ElectionResult | null;
  log: GovtAct[];
  /** A debate this week, waiting for your answer. */
  debate: { topic: Axis; asked: boolean } | null;
  nextId: number;
}

export interface WorldSettings {
  name: string;
  seed: number;
  start: "village" | "town";
  pace: "relaxed" | "normal" | "booming";
  money: "tight" | "normal" | "rich";
  politics: boolean;
}
