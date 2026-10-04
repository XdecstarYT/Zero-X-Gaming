import { describe, expect, it } from "vitest";
import { COLLECTIONS, SPOTLIGHT, collectionGames, spotlightGames } from "./spotlight";
import { GAMES } from "./catalog";

describe("home spotlight and collections", () => {
  it("every spotlight entry is a live game", () => {
    expect(spotlightGames()).toHaveLength(SPOTLIGHT.length);
    expect(spotlightGames()[0].game.slug).toBe("life");
  });

  it("skips games that aren't live", () => {
    const games = GAMES.map((g) => (g.slug === "life" ? { ...g, status: "coming_soon" as const } : g));
    expect(spotlightGames(games).map((s) => s.slug)).not.toContain("life");
  });

  it("every collection has at least two games, and ids are unique", () => {
    for (const c of COLLECTIONS) expect(collectionGames(c).length, c.id).toBeGreaterThanOrEqual(2);
    expect(new Set(COLLECTIONS.map((c) => c.id)).size).toBe(COLLECTIONS.length);
  });

  it("game day is exactly the Sports+ games", () => {
    const sports = COLLECTIONS.find((c) => c.id === "sports")!;
    expect(collectionGames(sports).every((g) => g.pass === "sports-plus")).toBe(true);
  });
});
