import type { Game, GameCategory } from "./types";

export type GameSort = "popular" | "new" | "top";

export const SORT_OPTIONS: { id: GameSort; label: string }[] = [
  { id: "popular", label: "Most popular" },
  { id: "new", label: "Newest" },
  { id: "top", label: "Top rated" },
];

export interface GameQuery {
  search?: string;
  category?: GameCategory | "all";
  sort?: GameSort;
}

function sortGames(games: Game[], sort: GameSort): Game[] {
  const copy = [...games];
  switch (sort) {
    case "new":
      return copy.sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
    case "top":
      return copy.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
    case "popular":
    default:
      return copy.sort((a, b) => b.plays - a.plays);
  }
}

export function queryGames(games: Game[], { search = "", category = "all", sort = "popular" }: GameQuery): Game[] {
  const needle = search.trim().toLowerCase();
  const filtered = games.filter((g) => {
    if (category !== "all" && g.category !== category) return false;
    if (!needle) return true;
    return (
      g.title.toLowerCase().includes(needle) ||
      g.tagline.toLowerCase().includes(needle) ||
      g.tags.some((t) => t.includes(needle))
    );
  });
  return sortGames(filtered, sort);
}

export function isGameSort(v: unknown): v is GameSort {
  return v === "popular" || v === "new" || v === "top";
}

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * "New" = released within 14 days of the catalog's newest release.
 * Anchoring to the catalog (not the clock) keeps SSR and client output identical.
 */
export function isNewRelease(game: Pick<Game, "releasedAt">, catalog: Pick<Game, "releasedAt">[]): boolean {
  const newest = Math.max(...catalog.map((g) => Date.parse(g.releasedAt)));
  return newest - Date.parse(game.releasedAt) <= NEW_WINDOW_MS;
}
