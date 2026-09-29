import { beforeEach, describe, expect, it } from "vitest";
import { useLibrary } from "./library";

describe("library store", () => {
  beforeEach(() => useLibrary.setState({ favorites: [], recent: [] }));

  it("toggles favorites", () => {
    useLibrary.getState().toggleFavorite("orbit");
    expect(useLibrary.getState().favorites).toEqual(["orbit"]);
    useLibrary.getState().toggleFavorite("orbit");
    expect(useLibrary.getState().favorites).toEqual([]);
  });

  it("moves replayed games to the front and keeps the best score", () => {
    const { recordPlay } = useLibrary.getState();
    recordPlay("orbit", 500);
    recordPlay("zero-dash", 10);
    recordPlay("orbit", 200);
    const { recent } = useLibrary.getState();
    expect(recent.map((r) => r.slug)).toEqual(["orbit", "zero-dash"]);
    expect(recent[0].bestScore).toBe(500);
  });

  it("caps the recent list", () => {
    for (let i = 0; i < 20; i++) useLibrary.getState().recordPlay(`g${i}`);
    expect(useLibrary.getState().recent).toHaveLength(12);
    expect(useLibrary.getState().recent[0].slug).toBe("g19");
  });
});
