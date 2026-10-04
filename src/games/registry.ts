import type { GameFactory } from "./types";

/**
 * Lazy loaders, one chunk per game, so the hub never ships game code.
 * Adding a game = a folder exporting a default GameFactory + one line here.
 */
export const GAME_LOADERS: Record<string, () => Promise<{ default: GameFactory }>> = {
  "neon-siege": () => import("./neon-siege/entry"),
  trenches: () => import("./trenches/entry"),
  "code-3": () => import("./code-3/index"),
  "aussie-rules": () => import("./aussie-rules/index"),
  "diamond-derby": () => import("./diamond-derby/index"),
  "ace-rally": () => import("./ace-rally/index"),
  clanforge: () => import("./clanforge/index"),
  "boundary-blitz": () => import("./cricket/index"),
  life: () => import("./life/index"),
  fairway: () => import("./fairway/index"),
  hometown: () => import("./hometown/index"),
  ubusiness: () => import("./ubusiness/index"),
  linkwave: () => import("./linkwave/index"),
  zenith: () => import("./zenith/index"),
};

export function hasGame(slug: string) {
  return slug in GAME_LOADERS;
}
