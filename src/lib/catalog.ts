/**
 * Static catalog: game copy, controls, categories and badge definitions.
 * Rich presentation data lives in code; the authoritative rows the server
 * enforces against live in Supabase (`games`, `achievements`). Keep slugs
 * and ids in sync with supabase/migrations.
 */
import type { BadgeDef, Game, GameCategory, PlayerSummary } from "./types";

export const CATEGORIES: { id: GameCategory; label: string }[] = [{ id: "shooter", label: "Shooter" }];

export const GAMES: Game[] = [
  {
    slug: "neon-siege",
    title: "Neon Siege",
    tagline: "Drop in. Loot up. Be the last one standing.",
    description:
      "A battle royale shooter in a fully 3D town. Drop in with 15 AI fighters, loot weapons from common to legendary, crack open chests, outrun the closing storm and fight for the win. Season 1: Ground Zero brings a free 30-tier battle pass with outfits, weapon wraps and banners, plus online deathmatch rooms with friends.",
    category: "shooter",
    tags: ["battle royale", "fps", "3d", "multiplayer", "bots"],
    status: "live",
    palette: ["#ffb321", "#4d6334"],
    rating: 0,
    ratingCount: 0,
    plays: 0,
    releasedAt: "2026-09-29",
    controls: [
      { keys: ["W", "A", "S", "D"], action: "Move / strafe" },
      { keys: ["Mouse"], action: "Look (click the game to lock the pointer)" },
      { keys: ["Click", "Space"], action: "Fire / use item" },
      { keys: ["Right-click", "Z"], action: "Aim down sights" },
      { keys: ["E"], action: "Pick up loot / open chest" },
      { keys: ["1–5", "Wheel"], action: "Switch hotbar slot" },
      { keys: ["R"], action: "Reload" },
      { keys: ["←", "→"], action: "Turn (keyboard only)" },
      { keys: ["Tab"], action: "Scoreboard (online)" },
      { keys: ["Esc", "P"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls:
      "Left thumb drags a virtual stick to move, right thumb drags to look. Hold FIRE to shoot, R to reload.",
  },
  {
    slug: "trenches",
    title: "Trenches",
    tagline: "Hold the line. Take the flags. Bleed their tickets dry.",
    description:
      "A 3D war shooter across a muddy, shell-cratered front: zigzag trenches, sandbag parapets, barbed wire, pillboxes and a ruined farmhouse under an overcast, smoke-filled sky. Create or join a multiplayer lobby, pick a side (Iron Legion or Crimson Front) and a class, ready up and load in together. Conquest: capture and hold three flags to drain the enemy's 150 tickets. Empty slots fill with AI soldiers, or jump into a quick battle vs bots.",
    category: "shooter",
    tags: ["war", "fps", "3d", "multiplayer", "lobbies", "conquest", "bots"],
    status: "live",
    palette: ["#c9a24a", "#6b6a45"],
    rating: 0,
    ratingCount: 0,
    plays: 0,
    releasedAt: "2026-09-30",
    controls: [
      { keys: ["W", "A", "S", "D"], action: "Move / strafe" },
      { keys: ["Mouse"], action: "Look (click the game to lock the pointer)" },
      { keys: ["Click", "Space"], action: "Fire / use item" },
      { keys: ["Right-click", "Z"], action: "Aim down sights" },
      { keys: ["1–5", "Wheel"], action: "Switch weapon / item" },
      { keys: ["R"], action: "Reload" },
      { keys: ["Tab"], action: "Scoreboard" },
      { keys: ["Esc", "P"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls:
      "Left thumb drags a virtual stick to move, right thumb drags to look. Hold FIRE to shoot, R to reload.",
  },
];

export const FEATURED_SLUG = "trenches";

export function getGame(slug: string): Game | undefined {
  return GAMES.find((g) => g.slug === slug);
}

export const BADGES: BadgeDef[] = [
  { id: "first-run", name: "First Run", description: "Finish your first game.", tier: "bronze" },
  { id: "streak-7", name: "On Fire", description: "Log in 7 days in a row.", tier: "silver" },
  { id: "top-10", name: "Top Ten", description: "Place top 10 on any daily board.", tier: "gold" },
  { id: "all-rounder", name: "All-Rounder", description: "Legacy: scored in every launch game.", tier: "neon" },
];

/** Placeholder player shown until auth lands in Phase 2. */
export const MOCK_PLAYER: PlayerSummary = {
  username: "Guest",
  xp: 0,
  streakDays: 0,
  badges: [],
  gamesPlayed: 0,
  totalScore: 0,
};
