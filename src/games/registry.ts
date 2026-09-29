import type { GameFactory } from "./types";

/**
 * Lazy loaders, one chunk per game, so the hub never ships game code.
 * Adding a game = a folder exporting a default GameFactory + one line here.
 */
export const GAME_LOADERS: Record<string, () => Promise<{ default: GameFactory }>> = {
  "zero-dash": () => import("./zero-dash"),
  "grid-lock": () => import("./grid-lock"),
  orbit: () => import("./orbit"),
  "blitz-trivia": () => import("./blitz-trivia"),
  "neon-siege": () => import("./neon-siege/entry"),
};

export function hasGame(slug: string) {
  return slug in GAME_LOADERS;
}
