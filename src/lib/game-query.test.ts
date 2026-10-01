import { describe, expect, it } from "vitest";
import { isGameSort, isNewRelease, queryGames } from "./game-query";
import { GAMES } from "./catalog";

const slugs = (gs: { slug: string }[]) => gs.map((g) => g.slug);

describe("queryGames", () => {
  it("returns everything sorted by plays by default", () => {
    const res = queryGames(GAMES, {});
    expect(res).toHaveLength(GAMES.length);
    for (let i = 1; i < res.length; i++) expect(res[i - 1].plays).toBeGreaterThanOrEqual(res[i].plays);
  });

  it("filters by category", () => {
    expect(slugs(queryGames(GAMES, { category: "shooter" })).sort()).toEqual(["neon-siege", "trenches"]);
    expect(queryGames(GAMES, { category: "puzzle" })).toEqual([]);
  });

  it("searches title, tagline and tags case-insensitively", () => {
    expect(slugs(queryGames(GAMES, { search: "  TRENCHES " }))).toEqual(["trenches"]);
    expect(slugs(queryGames(GAMES, { search: "battle royale" }))).toEqual(["neon-siege"]);
    expect(slugs(queryGames(GAMES, { search: "conquest" }))).toEqual(["trenches"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(queryGames(GAMES, { search: "zzz-nothing" })).toEqual([]);
  });

  it("sorts newest first", () => {
    expect(slugs(queryGames(GAMES, { sort: "new" }))[0]).toBe("ace-rally");
  });

  it("sorts by rating", () => {
    const rated = GAMES.map((g, i) => ({ ...g, rating: i === 1 ? 4.8 : 3.1 }));
    expect(slugs(queryGames(rated, { sort: "top" }))[0]).toBe(GAMES[1].slug);
  });

  it("does not mutate the input", () => {
    const before = slugs(GAMES);
    queryGames(GAMES, { sort: "new" });
    expect(slugs(GAMES)).toEqual(before);
  });
});

describe("isGameSort", () => {
  it("accepts known sorts only", () => {
    expect(isGameSort("top")).toBe(true);
    expect(isGameSort("oldest")).toBe(false);
    expect(isGameSort(undefined)).toBe(false);
  });
});

describe("isNewRelease", () => {
  it("flags games within 14 days of the newest release", () => {
    const catalog = [{ releasedAt: "2026-09-30" }, { releasedAt: "2026-09-16" }, { releasedAt: "2026-09-15" }];
    expect(isNewRelease(catalog[0], catalog)).toBe(true);
    expect(isNewRelease(catalog[1], catalog)).toBe(true);
    expect(isNewRelease(catalog[2], catalog)).toBe(false);
  });
});
