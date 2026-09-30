import type { GameFactory } from "./types";

/**
 * Lazy loaders, one chunk per game, so the hub never ships game code.
 * Adding a game = a folder exporting a default GameFactory + one line here.
 */
export const GAME_LOADERS: Record<string, () => Promise<{ default: GameFactory }>> = {
  "neon-siege": () => import("./neon-siege/entry"),
  trenches: () => import("./trenches/entry"),
  "code-3": () => import("./code-3/index"),
};

export function hasGame(slug: string) {
  return slug in GAME_LOADERS;
}
