import { describe, expect, it } from "vitest";
import { paletteItems, searchPalette } from "./palette";

describe("command palette search", () => {
  it("lists everything for an empty query, with the owner page only for the owner", () => {
    expect(searchPalette(paletteItems(), "").length).toBe(paletteItems().length);
    expect(paletteItems().some((i) => i.href === "/owner")).toBe(false);
    expect(paletteItems(true).some((i) => i.href === "/owner")).toBe(true);
  });

  it("puts title matches ahead of tag matches", () => {
    const r = searchPalette(paletteItems(), "lif");
    expect(r.slice(0, 2).map((i) => i.label).sort()).toEqual(["Life", "Lifeline"]);
    expect(searchPalette(paletteItems(), "linkw")[0].label).toBe("Linkwave");
  });

  it("finds games by their tags", () => {
    expect(searchPalette(paletteItems(), "golf").map((i) => i.href)).toContain("/games/fairway");
  });

  it("finds nothing for nonsense", () => {
    expect(searchPalette(paletteItems(), "zzqqx")).toEqual([]);
  });
});
