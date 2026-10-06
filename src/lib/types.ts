export type GameCategory = "arcade" | "puzzle" | "runner" | "trivia" | "shooter" | "sim" | "sports" | "strategy";

export type GameStatus = "live" | "coming_soon";

export interface GameControl {
  keys: string[];
  action: string;
}

export interface Game {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  category: GameCategory;
  tags: string[];
  status: GameStatus;
  /** Two accent colours used to render the generated cover art. */
  palette: [string, string];
  rating: number;
  ratingCount: number;
  plays: number;
  /** ISO date string. */
  releasedAt: string;
  controls: GameControl[];
  touchControls: string;
  /** Preferred phone orientation in immersive mode. */
  orientation?: "landscape" | "any";
  /** A one-time unlock needed to play (Sports+ games need the Sports+ pass; UBusiness needs an edition). */
  pass?: "sports-plus" | "ubusiness" | "zlink";
  /** A game on its way out: the date it closes, and where to go instead. */
  retiring?: { on: string; successor?: string; note: string };
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  level: number;
  score: number;
  userId?: string;
  isCurrentUser?: boolean;
}

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  tier: "bronze" | "silver" | "gold" | "neon";
}

export interface PlayerSummary {
  username: string;
  xp: number;
  streakDays: number;
  badges: BadgeDef[];
  gamesPlayed: number;
  totalScore: number;
}

export interface RecentPlay {
  slug: string;
  lastPlayedAt: string;
  bestScore: number;
}
