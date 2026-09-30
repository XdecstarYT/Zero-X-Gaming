import type { Rarity, WeaponKind } from "../neon-siege/items";
import type { Team } from "./battlefield";
import type { FrontId } from "./fronts";

/** Everything Trenches sends over a room (lobby + match share one channel). */

export type TrenchClass = "rifleman" | "assault" | "medic" | "marksman" | "engineer";

export const CLASSES: Record<TrenchClass, { name: string; blurb: string }> = {
  rifleman: { name: "Rifleman", blurb: "Service rifle + revolver + field dressing. Steady at every range." },
  assault: { name: "Trench Raider", blurb: "SMG + trench shotgun. Clears trenches up close." },
  medic: { name: "Medic", blurb: "Carbine + 3 field dressings + steel body armour. Keeps the push alive." },
  marksman: { name: "Sniper", blurb: "Scoped rifle + revolver. Owns no-man's-land from a prone position." },
  engineer: { name: "Engineer", blurb: "Carbine + shotgun. Digs trenches three times as fast." },
};

export const CLASS_IDS = Object.keys(CLASSES) as TrenchClass[];

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
}

export type TrenchMsg =
  | { t: "lobby"; s: LobbySnapshot }
  | { t: "req"; team?: Team; ready?: boolean; cls?: TrenchClass }
  | { t: "chat"; name: string; text: string }
  | { t: "state"; m: number; e: TEntState[]; bots?: boolean }
  | { t: "shot"; m: number; s: string; w: WeaponKind; fx: number; fy: number; tx: number; ty: number }
  | { t: "hit"; m: number; a: string; v: string; d: number; w: WeaponKind }
  | { t: "kill"; m: number; k: string; v: string; w: WeaponKind | "storm" }
  | { t: "cq"; m: number; tk: [number, number]; f: [number, number][]; time: number; win: number | null }
  /** A soldier finished digging a trench cell. */
  | { t: "dig"; m: number; c: number }
  /** Host: every cell dug so far this battle (for late joiners). */
  | { t: "digs"; m: number; c: number[] };

export const CHAT_MAX = 120;

/** Trim, collapse whitespace and cap chat text (rendered with textContent only). */
export function cleanChat(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX);
}
