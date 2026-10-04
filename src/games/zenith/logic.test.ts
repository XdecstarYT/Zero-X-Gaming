import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import {
  BRIDGE_COST,
  bulldoze,
  connected,
  demand,
  ENTRANCE,
  HIGH_DENSITY_AT,
  idx,
  loadCity,
  maps,
  MILESTONES,
  N,
  newCity,
  placeRoad,
  placeService,
  ROAD_COST,
  roadCost,
  roadPath,
  score,
  simDay,
  START_MONEY,
  stats,
  tileAt,
  zoneRect,
  type City,
} from "./logic";

/** A strip of town: a road east from the highway, zones either side, power and water. */
function starter(seed = 5): City {
  const c = newCity("Test", seed);
  const y = ENTRANCE.y;
  placeRoad(c, 4, y, 20, y);
  placeRoad(c, 12, y - 6, 12, y + 6);
  zoneRect(c, 5, y - 2, 11, y - 1, "R");
  zoneRect(c, 13, y - 2, 20, y - 1, "R");
  zoneRect(c, 5, y + 1, 11, y + 2, "C");
  zoneRect(c, 13, y + 1, 20, y + 2, "I");
  const coal = placeService(c, "coal", 13, y + 4);
  const tower = placeService(c, "tower", 11, y - 4);
  if (!coal.ok || !tower.ok) throw new Error("starter town didn't build");
  return c;
}

describe("Zenith: the map", () => {
  it("starts with a river, woods, money and the highway in from the west", () => {
    const c = newCity("Riverton", 3);
    expect(c.tiles).toHaveLength(N * N);
    expect(c.tiles.some((t) => t.water)).toBe(true);
    expect(c.tiles.filter((t) => t.tree).length).toBeGreaterThan(80);
    expect(tileAt(c, ENTRANCE.x, ENTRANCE.y)?.highway).toBe(true);
    expect(c.money).toBe(START_MONEY);
    // Every row has river somewhere east of the middle.
    for (let y = 0; y < N; y++) expect(c.tiles.slice(y * N, y * N + N).some((t) => t.water)).toBe(true);
  });

  it("draws roads as an L, charges by the tile (bridges cost more) and refuses to go through buildings", () => {
    expect(roadPath(2, 2, 5, 4)).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 3 },
      { x: 5, y: 4 },
    ]);
    const c = newCity("T", 1);
    const y = ENTRANCE.y;
    const r = roadCost(c, 5, y, 9, y);
    expect(r).toEqual({ ok: true, cost: 5 * ROAD_COST });
    // Across the river: bridges.
    const water = c.tiles.findIndex((t) => t.water);
    const wx = water % N;
    const wy = Math.floor(water / N);
    const across = roadCost(c, wx - 1, wy, wx + 4, wy);
    expect(across.ok && across.cost! > 5 * ROAD_COST + BRIDGE_COST - ROAD_COST).toBe(true);
    placeRoad(c, 4, y, 9, y);
    placeService(c, "police", 6, y + 1);
    expect(roadCost(c, 6, y + 3, 6, y + 1)).toEqual({ ok: false, why: "Something's in the way: bulldoze it first" });
  });

  it("zones only near roads; high density waits for Town; the highway can't be bulldozed", () => {
    const c = newCity("T", 1);
    const y = ENTRANCE.y;
    placeRoad(c, 4, y, 12, y);
    const r = zoneRect(c, 4, y - 6, 12, y - 1, "R");
    expect(r.ok && r.tiles).toBe(9 * 2);
    expect(tileAt(c, 6, y - 5)?.zone).toBeNull();
    expect(zoneRect(c, 4, y + 1, 8, y + 1, "R", "high")).toEqual({
      ok: false,
      why: `High density comes with ${MILESTONES[HIGH_DENSITY_AT].name}`,
    });
    expect(bulldoze(c, 0, y)).toEqual({ ok: false, why: "That's the highway" });
    expect(bulldoze(c, 6, y).ok).toBe(true);
    expect(tileAt(c, 6, y)?.road).toBe(false);
  });

  it("services need a road beside them, the milestone, and the money; pumps need the river", () => {
    const c = newCity("T", 1);
    const y = ENTRANCE.y;
    expect(placeService(c, "fire", 10, y + 5)).toEqual({ ok: false, why: "Needs a road beside it" });
    placeRoad(c, 4, y, 12, y);
    expect(placeService(c, "fire", 10, y + 1).ok).toBe(true);
    expect(placeService(c, "hospital", 8, y + 1)).toEqual({ ok: false, why: "Unlocks at Town" });
    c.milestone = 4;
    expect(placeService(c, "pump", 8, y + 1)).toEqual({ ok: false, why: "Must be on the riverbank" });
    expect(placeService(c, "park", 20, 3).ok).toBe(true);
  });
});

describe("Zenith: the simulation", () => {
  it("roads connect from the highway; cut the road and the far side is cut off", () => {
    const c = starter();
    const y = ENTRANCE.y;
    expect(connected(c).has(idx(20, y))).toBe(true);
    bulldoze(c, 8, y);
    expect(connected(c).has(idx(20, y))).toBe(false);
    expect(connected(c).has(idx(6, y))).toBe(true);
  });

  it("an empty town wants homes; homes want shops and industry", () => {
    const c = newCity("T", 1);
    expect(demand(c).R).toBeGreaterThan(0.3);
    const s = { ...stats(c), population: 400, workers: 220, jobsC: 0, jobsI: 0 };
    const d = demand(c, s);
    expect(d.C).toBeGreaterThan(0.5);
    expect(d.I).toBeGreaterThan(0.5);
    expect(d.R).toBeLessThan(demand(c).R);
  });

  it("with roads, zones, power and water, the town grows; with services, buildings level up; money moves daily", () => {
    const c = starter(9);
    const y = ENTRANCE.y;
    for (const [k, x, yy] of [
      ["police", 11, y + 3],
      ["fire", 13, y - 3],
      ["clinic", 13, y - 4],
      ["park", 8, y - 3],
      ["park", 16, y - 3],
    ] as const)
      expect(placeService(c, k, x, yy).ok, k).toBe(true);
    const before = c.money;
    for (let d = 0; d < 90; d++) simDay(c, createRng(d + 1));
    const s = stats(c);
    expect(s.population).toBeGreaterThan(100);
    expect(s.jobsC + s.jobsI).toBeGreaterThan(20);
    expect(c.tiles.some((t) => t.bld && t.bld.level > 1)).toBe(true);
    expect(c.money).not.toBe(before);
    expect(c.day).toBe(91);
    expect(c.history.length).toBeGreaterThan(10);
    expect(score(c)).toBe(s.population);
  });

  it("no power, no growth; take the power away and buildings empty out", () => {
    const c = starter(9);
    bulldoze(c, 13, ENTRANCE.y + 4);
    for (let d = 0; d < 30; d++) simDay(c, createRng(d + 1));
    expect(stats(c).population).toBe(0);
    const g = starter(9);
    for (let d = 0; d < 60; d++) simDay(g, createRng(d + 1));
    const pop = stats(g).population;
    expect(pop).toBeGreaterThan(0);
    bulldoze(g, 13, ENTRANCE.y + 4);
    for (let d = 0; d < 25; d++) simDay(g, createRng(d + 100));
    expect(stats(g).population).toBeLessThan(pop * 0.2);
  });

  it("industry pollutes; parks and services raise land value", () => {
    const c = starter(9);
    const y = ENTRANCE.y;
    for (let d = 0; d < 60; d++) simDay(c, createRng(d + 1));
    const m = maps(c);
    expect(m.pollution[idx(16, y + 2)]).toBeGreaterThan(m.pollution[idx(6, y - 2)]);
    const v = m.value[idx(7, y - 2)];
    placeService(c, "park", 7, y - 3);
    expect(maps(c).value[idx(7, y - 2)]).toBeGreaterThan(v + 0.1);
  });

  it("reaching a population milestone pays out once", () => {
    const c = starter(9);
    const y = ENTRANCE.y;
    // Fill the zones straight away to cross 300.
    for (let x = 5; x <= 20; x++)
      for (const yy of [y - 2, y - 1]) {
        const t = tileAt(c, x, yy);
        if (t?.zone) t.bld = { level: 3, style: 1, age: 20, abandoned: false, short: 0 };
      }
    const cash = c.money;
    const r = simDay(c, createRng(1));
    expect(r.milestone).toBe("Village");
    expect(c.milestone).toBe(1);
    expect(c.money).toBeGreaterThan(cash + MILESTONES[1].reward - 500);
    expect(simDay(c, createRng(2)).milestone).toBeNull();
  });

  it("saves round-trip; a broken save is refused", () => {
    const c = starter();
    const back = loadCity(JSON.stringify(c))!;
    expect(back.tiles[idx(10, ENTRANCE.y)].road).toBe(true);
    expect(loadCity("{}")).toBeNull();
    expect(loadCity("nope")).toBeNull();
  });
});
