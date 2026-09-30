import type { Rarity, WeaponKind } from "../neon-siege/items";
import type { Team } from "./battlefield";

/** Everything Trenches sends over a room (lobby + match share one channel). */

export type TrenchClass = "rifleman" | "assault" | "medic" | "marksman";

export const CLASSES: Record<TrenchClass, { name: string; blurb: string }> = {
  rifleman: { name: "Rifleman", blurb: "Assault rifle + pistol. Steady at every range." },
  assault: { name: "Assault", blurb: "SMG + shotgun. Clears trenches up close." },
  medic: { name: "Medic", blurb: "SMG + 3 med kits + a shield potion. Keeps the push alive." },
  marksman: { name: "Marksman", blurb: "Bolt-action sniper + pistol. Owns no-man's-land." },
};

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
}

export type TrenchMsg =
  | { t: "lobby"; s: LobbySnapshot }
  | { t: "req"; team?: Team; ready?: boolean; cls?: TrenchClass }
  | { t: "chat"; name: string; text: string }
  | { t: "state"; m: number; e: TEntState[]; bots?: boolean }
  | { t: "shot"; m: number; s: string; w: WeaponKind; fx: number; fy: number; tx: number; ty: number }
  | { t: "hit"; m: number; a: string; v: string; d: number; w: WeaponKind }
  | { t: "kill"; m: number; k: string; v: string; w: WeaponKind | "storm" }
  | { t: "cq"; m: number; tk: [number, number]; f: [number, number][]; time: number; win: number | null };

export const CHAT_MAX = 120;

/** Trim, collapse whitespace and cap chat text (rendered with textContent only). */
export function cleanChat(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX);
}
