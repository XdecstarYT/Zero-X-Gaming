import type { DamageSource } from "../neon-siege/world";
import type { Rarity, WeaponKind } from "../neon-siege/items";
import type { Team } from "./battlefield";
import type { GameMode } from "./conquest";
import type { FrontId } from "./fronts";

/** Everything Trenches sends over a room (lobby + match share one channel). */

export type TrenchClass = "rifleman" | "assault" | "medic" | "marksman" | "engineer";

export const CLASSES: Record<TrenchClass, { name: string; blurb: string; perk: string }> = {
  rifleman: { name: "Rifleman", blurb: "Lee-Enfield + Webley. Steady at every range.", perk: "Perk: +1 grenade" },
  assault: { name: "Trench Raider", blurb: "MP18 + trench gun. Clears trenches up close.", perk: "Perk: sprints 50% longer" },
  medic: { name: "Medic", blurb: "MP18 + field dressings + body armour. Keeps the push alive.", perk: "Perk: heals slowly over time" },
  marksman: { name: "Sniper", blurb: "Scoped Lee-Enfield. Owns no-man's-land from a prone position.", perk: "Perk: support calls recharge 40% faster" },
  engineer: { name: "Engineer", blurb: "MP18 + trench gun. Builds the line.", perk: "Perk: digs 3× as fast" },
};

export const CLASS_IDS = Object.keys(CLASSES) as TrenchClass[];

/** What a soldier carries: chosen per class in the menu (bots use the class defaults). */
export type Primary = "ar" | "sniper" | "smg" | "shotgun";
export type Secondary = "pistol" | "none";
export type Gadget = "grenades" | "medkits" | "armour" | "spade";

export interface Loadout {
  primary: Primary;
  secondary: Secondary;
  gadget: Gadget;
}

export const PRIMARIES: Record<Primary, string> = {
  ar: "Lee-Enfield Rifle",
  sniper: "Scoped Lee-Enfield",
  smg: "Bergmann MP18",
  shotgun: "M1897 Trench Gun",
};
export const SECONDARIES: Record<Secondary, string> = { pistol: "Webley Revolver", none: "None (move 5% faster)" };
export const GADGETS: Record<Gadget, { name: string; blurb: string }> = {
  grenades: { name: "Grenade bag", blurb: "+2 Mills bombs" },
  medkits: { name: "Field dressings", blurb: "+2 dressings" },
  armour: { name: "Body armour", blurb: "Steel plate: soaks 50 damage" },
  spade: { name: "Entrenching tool", blurb: "Dig twice as fast" },
};

export const DEFAULT_LOADOUTS: Record<TrenchClass, Loadout> = {
  rifleman: { primary: "ar", secondary: "pistol", gadget: "grenades" },
  assault: { primary: "smg", secondary: "none", gadget: "grenades" },
  medic: { primary: "smg", secondary: "pistol", gadget: "medkits" },
  marksman: { primary: "sniper", secondary: "pistol", gadget: "armour" },
  engineer: { primary: "shotgun", secondary: "pistol", gadget: "spade" },
};

export function isLoadout(v: unknown): v is Loadout {
  const l = v as Loadout;
  return !!l && l.primary in PRIMARIES && l.secondary in SECONDARIES && l.gadget in GADGETS;
}

/** Support calls: artillery on where you're looking, a supply drop at your feet, a recon flare. */
export type SupportKind = "artillery" | "supply" | "recon";

export interface LobbyPlayer {
  id: string;
  name: string;
  team: Team;
  ready: boolean;
  cls: TrenchClass;
}

export interface LobbySnapshot {
  code: string;
  name: string;
  hostId: string;
  phase: "lobby" | "match";
  /** Fighters per match (humans + bots). */
  max: number;
  bots: boolean;
  /** The battlefield. */
  front: FrontId;
  /** Conquest or Breakthrough (older lobbies: Conquest). */
  mode?: GameMode;
  players: LobbyPlayer[];
  seed: number;
  /** Increments every time the host starts a match. */
  matchId: number;
}

export interface TEntState {
  id: string;
  n: string;
  k: "human" | "bot";
  tm: Team;
  x: number;
  y: number;
  a: number;
  hp: number;
  sh: number;
  al: boolean;
  ki: number;
  de: number;
  w: WeaponKind | null;
  r: Rarity | null;
  ad: boolean;
  sp: number;
  /** Stance: 0 standing, 1 crouched, 2 prone. */
  st?: 0 | 1 | 2;
  /** Frontline: redeploys left. */
  rl?: number;
}

export type TrenchMsg =
  | { t: "lobby"; s: LobbySnapshot }
  | { t: "req"; team?: Team; ready?: boolean; cls?: TrenchClass }
  | { t: "chat"; name: string; text: string }
  | { t: "state"; m: number; e: TEntState[]; bots?: boolean }
  | { t: "shot"; m: number; s: string; w: WeaponKind; fx: number; fy: number; tx: number; ty: number }
  | { t: "hit"; m: number; a: string; v: string; d: number; w: WeaponKind }
  | { t: "kill"; m: number; k: string; v: string; w: DamageSource }
  | { t: "cq"; m: number; tk: [number, number]; f: [number, number][]; time: number; win: number | null; sc?: number }
  /** A grenade left someone's hand (every client simulates it). */
  | { t: "nade"; m: number; id: string; o: string; x: number; y: number; a: number; p: number }
  /** An artillery barrage, shells as [x, y, seconds from now] (host's, or a player's call-in `o`). */
  | { t: "arty"; m: number; s: [number, number, number][]; o?: string }
  /** A supply crate dropped for a team. */
  | { t: "supply"; m: number; id: string; x: number; y: number; tm: Team }
  /** A recon flare: the team sees enemies near (x, y) on the map for `d` seconds. */
  | { t: "recon"; m: number; x: number; y: number; tm: Team; d: number }
  /** A soldier finished digging a trench cell. */
  | { t: "dig"; m: number; c: number }
  /** Host: every cell dug so far this battle (for late joiners). */
  | { t: "digs"; m: number; c: number[] };

export const CHAT_MAX = 120;

/** Trim, collapse whitespace and cap chat text (rendered with textContent only). */
export function cleanChat(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX);
}
