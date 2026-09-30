/**
 * Static catalog: game copy, controls, categories and badge definitions.
 * Rich presentation data lives in code; the authoritative rows the server
 * enforces against live in Supabase (`games`, `achievements`). Keep slugs
 * and ids in sync with supabase/migrations.
 */
import type { BadgeDef, Game, GameCategory, PlayerSummary } from "./types";

export const CATEGORIES: { id: GameCategory; label: string }[] = [
  { id: "runner", label: "Runner" },
  { id: "puzzle", label: "Puzzle" },
  { id: "arcade", label: "Arcade" },
  { id: "trivia", label: "Trivia" },
  { id: "shooter", label: "Shooter" },
];

export const GAMES: Game[] = [
  {
    slug: "zero-dash",
    title: "Zero Dash",
    tagline: "One button. Zero mercy.",
    description:
      "Sprint through a collapsing neon grid. Tap to jump, hold to jump higher, and chain perfect landings to build your multiplier. How far can you go before the grid runs out?",
    category: "runner",
    tags: ["endless", "one-button", "reflex"],
    status: "live",
    palette: ["#22e5ff", "#8b5cff"],
    rating: 4.7,
    ratingCount: 1284,
    plays: 48210,
    releasedAt: "2026-09-01",
    controls: [
      { keys: ["Space", "↑", "W"], action: "Jump (hold for higher)" },
      { keys: ["P", "Esc"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls: "Tap anywhere to jump. Press and hold for a higher jump.",
  },
  {
    slug: "grid-lock",
    title: "Grid Lock",
    tagline: "Slide. Match. Unlock.",
    description:
      "Slide whole rows and columns of glowing tiles to line up three or more. Every match powers the lock; clear the board before the circuit overloads.",
    category: "puzzle",
    tags: ["match-3", "strategy", "relaxed"],
    status: "live",
    palette: ["#ff2bd6", "#ffcb3d"],
    rating: 4.5,
    ratingCount: 862,
    plays: 31077,
    releasedAt: "2026-09-12",
    controls: [
      { keys: ["Arrows", "WASD"], action: "Move cursor" },
      { keys: ["Shift + Arrow"], action: "Slide row / column" },
      { keys: ["P", "Esc"], action: "Pause" },
    ],
    touchControls: "Swipe along a row or column to slide it one step. Lines of 3+ clear; misses cost 3 seconds.",
  },
  {
    slug: "orbit",
    title: "Orbit",
    tagline: "Bend gravity. Grab the stars.",
    description:
      "Pilot a tiny probe through shifting gravity wells. Slingshot around planets, collect energy shards, and dodge debris as the system gets more crowded.",
    category: "arcade",
    tags: ["dodge", "physics", "collect"],
    status: "live",
    palette: ["#3dffa2", "#22e5ff"],
    rating: 4.6,
    ratingCount: 973,
    plays: 39544,
    releasedAt: "2026-09-20",
    controls: [
      { keys: ["←", "→", "A", "D"], action: "Steer" },
      { keys: ["Space"], action: "Boost (uses energy)" },
      { keys: ["P", "Esc"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls: "Touch and drag: the probe turns toward your finger. Put a second finger down to boost.",
  },
  {
    slug: "blitz-trivia",
    title: "Blitz Trivia",
    tagline: "60 seconds. How much do you know?",
    description:
      "Race the clock through rapid-fire questions across science, games, geography, and more. Streaks multiply your score, while wrong answers cost you time.",
    category: "trivia",
    tags: ["quiz", "timed", "knowledge"],
    status: "live",
    palette: ["#ffcb3d", "#ff4d6d"],
    rating: 4.4,
    ratingCount: 655,
    plays: 22890,
    releasedAt: "2026-09-26",
    controls: [
      { keys: ["1", "2", "3", "4"], action: "Pick an answer" },
      { keys: ["Tab", "Enter"], action: "Choose with focus" },
      { keys: ["P", "Esc"], action: "Pause" },
    ],
    touchControls: "Tap an answer.",
  },
  {
    slug: "neon-siege",
    title: "Neon Siege",
    tagline: "Hold the grid. Outgun the drones.",
    description:
      "A retro-futuristic arena shooter. Survive escalating waves of AI drones that patrol, flank, take cover and hunt you down, or jump into an online room and battle other players, with bots filling any empty slots.",
    category: "shooter",
    tags: ["fps", "multiplayer", "bots", "arena"],
    status: "live",
    palette: ["#ff2bd6", "#22e5ff"],
    rating: 0,
    ratingCount: 0,
    plays: 0,
    releasedAt: "2026-09-29",
    controls: [
      { keys: ["W", "A", "S", "D"], action: "Move / strafe" },
      { keys: ["Mouse"], action: "Look (click the arena to lock the pointer)" },
      { keys: ["Click", "Space"], action: "Fire" },
      { keys: ["R"], action: "Reload" },
      { keys: ["←", "→", "Q", "E"], action: "Turn (keyboard only)" },
      { keys: ["Tab"], action: "Scoreboard (online)" },
      { keys: ["Esc", "P"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls:
      "Left thumb drags a virtual stick to move, right thumb drags to look. Hold FIRE to shoot, R to reload.",
  },
];

export const FEATURED_SLUG = "zero-dash";

export function getGame(slug: string): Game | undefined {
  return GAMES.find((g) => g.slug === slug);
}

export const BADGES: BadgeDef[] = [
  { id: "first-run", name: "First Run", description: "Finish your first game.", tier: "bronze" },
  { id: "streak-7", name: "On Fire", description: "Log in 7 days in a row.", tier: "silver" },
  { id: "top-10", name: "Top Ten", description: "Place top 10 on any daily board.", tier: "gold" },
  { id: "all-rounder", name: "All-Rounder", description: "Score in every launch game.", tier: "neon" },
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
