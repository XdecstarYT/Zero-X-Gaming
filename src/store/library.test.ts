import { beforeEach, describe, expect, it } from "vitest";
import { useLibrary } from "./library";

describe("library store", () => {
  beforeEach(() => useLibrary.setState({ favorites: [], recent: [] }));

  it("toggles favorites", () => {
    useLibrary.getState().toggleFavorite("trenches");
    expect(useLibrary.getState().favorites).toEqual(["trenches"]);
    useLibrary.getState().toggleFavorite("trenches");
    expect(useLibrary.getState().favorites).toEqual([]);
  });

  it("moves replayed games to the front and keeps the best score", () => {
    const { recordPlay } = useLibrary.getState();
    recordPlay("trenches", 500);
    recordPlay("neon-siege", 10);
    recordPlay("trenches", 200);
    const { recent } = useLibrary.getState();
    expect(recent.map((r) => r.slug)).toEqual(["trenches", "neon-siege"]);
    expect(recent[0].bestScore).toBe(500);
  });

  it("caps the recent list", () => {
    for (let i = 0; i < 20; i++) useLibrary.getState().recordPlay(`g${i}`);
    expect(useLibrary.getState().recent).toHaveLength(12);
    expect(useLibrary.getState().recent[0].slug).toBe("g19");
  });
});
