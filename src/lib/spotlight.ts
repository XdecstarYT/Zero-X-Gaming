import type { Game } from "./types";
import { GAMES } from "./catalog";

/** The home page's rotating spotlight: a kicker and a one-line pitch for each. */
export const SPOTLIGHT: { slug: string; kicker: string; pitch: string }[] = [
  { slug: "life", kicker: "Flagship", pitch: "Grow up, get a job, fall in love and build the house, in a photoreal 3D town." },
  { slug: "ubusiness", kicker: "New", pitch: "Run a corner store: stock the shelves, work the till, set the prices, grow it into a superstore." },
  { slug: "hometown", kicker: "Online", pitch: "One shared town: open a shop, play the market, run for mayor. Townsfolk keep it going overnight." },
  { slug: "trenches", kicker: "Multiplayer", pitch: "Dig in on the Great War fronts. Go over the top with your squad, or hold the line." },
  { slug: "neon-siege", kicker: "Battle royale", pitch: "Drop into the city, loot up and outlast the storm." },
  { slug: "code-3", kicker: "Open world", pitch: "Patrol the city, run plates, chase suspects and write the report." },
];

export interface Collection {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  /** Picks the games in it. */
  has: (g: Game) => boolean;
}

/** "Browse by vibe": hand-picked groupings; a game can be in more than one. */
export const COLLECTIONS: Collection[] = [
  { id: "build", title: "Build something", emoji: "🏗️", blurb: "Houses, bases and businesses.", has: (g) => g.tags.some((t) => ["building", "base building", "management"].includes(t)) },
  { id: "together", title: "Play together", emoji: "🤝", blurb: "Lobbies, squads and a shared town.", has: (g) => g.tags.some((t) => ["multiplayer", "online", "lobbies"].includes(t)) },
  { id: "sports", title: "Game day", emoji: "🏟️", blurb: "Every Sports+ game.", has: (g) => g.pass === "sports-plus" },
  { id: "action", title: "All action", emoji: "💥", blurb: "Shooters, chases and raids.", has: (g) => g.category === "shooter" || g.tags.some((t) => ["pursuits", "raids", "fps"].includes(t)) },
  { id: "chill", title: "Take it slow", emoji: "☕", blurb: "Sims to sink an evening into.", has: (g) => g.category === "sim" || g.tags.includes("life sim") },
];

export function spotlightGames(games: Game[] = GAMES) {
  return SPOTLIGHT.flatMap((s) => {
    const game = games.find((g) => g.slug === s.slug && g.status === "live");
    return game ? [{ ...s, game }] : [];
  });
}

export function collectionGames(c: Collection, games: Game[] = GAMES) {
  return games.filter((g) => g.status === "live" && c.has(g));
}
