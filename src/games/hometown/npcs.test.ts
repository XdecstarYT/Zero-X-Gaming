import { describe, expect, it } from "vitest";
import { townSolid } from "../life/world";
import { MAX_NPCS, npcAt, npcChatter, npcCount, townsfolk } from "./npcs";

describe("the townsfolk", () => {
  it("are twelve at most, and make way for real players", () => {
    expect(townsfolk("main")).toHaveLength(MAX_NPCS);
    expect(npcCount(0)).toBe(12);
    expect(npcCount(5)).toBe(7);
    expect(npcCount(30)).toBe(0);
  });

  it("stand in the same spot for every player on a server (the clock decides, not the network)", () => {
    const a = townsfolk("main");
    const b = townsfolk("main");
    for (const t of [0, 123.4, 99999]) expect(a.map((p) => npcAt(p, t))).toEqual(b.map((p) => npcAt(p, t)));
    // Another server lays them out differently.
    expect(townsfolk("harbour").map((p) => p.ax)).not.toEqual(a.map((p) => p.ax));
  });

  it("walk the footpaths, never through buildings, and face the way they walk", () => {
    for (const p of townsfolk("main")) {
      for (let t = 0; t < 400; t += 3.7) {
        const s = npcAt(p, t);
        expect(townSolid(s.x, s.z)).toBe(false);
        if (s.pose === "walk") {
          const n = npcAt(p, t + 0.1);
          if (n.pose === "walk" && n.heading === s.heading) {
            expect(Math.sin(s.heading) * (n.x - s.x) + Math.cos(s.heading) * (n.z - s.z)).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("say the same thing to everyone at the same time, and nothing when none are out", () => {
    expect(npcChatter("main", 1000, 12)).toEqual(npcChatter("main", 1001, 12));
    expect(npcChatter("main", 1000, 0)).toBeNull();
    expect(npcChatter("main", 1000, 12)!.id).not.toBe(npcChatter("main", 1100, 12)!.id);
  });
});
