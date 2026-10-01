import { describe, expect, it } from "vitest";
import { BUILDINGS, TROOPS } from "./data";
import { Battle, simulateRaid, trophyDelta } from "./battle";
import { generateBase, raiderArmy, villageBase } from "./bases";
import { build, capacity, collect, emptyArmy, finishNow, fits, housing, keepLevel, newVillage, tick, train, upgrade } from "./village";

const T0 = Date.UTC(2026, 9, 1);
const MIN = 60_000;

describe("the village", () => {
  it("starts with a Keep, collectors, storages, army buildings, two builders and some troops", () => {
    const v = newVillage(1, T0);
    expect(keepLevel(v)).toBe(1);
    expect(v.buildings.filter((b) => b.type === "builderHut")).toHaveLength(2);
    expect(capacity(v).gold).toBe(1000 + 3000);
    expect(housing(v)).toEqual({ cap: 20, used: 16 });
  });

  it("collectors fill over time, up to their capacity, and collecting respects storage", () => {
    const v = newVillage(1, T0);
    tick(v, T0 + 5 * MIN);
    const mine = v.buildings.find((b) => b.type === "goldMine")!;
    expect(mine.stored).toBeCloseTo(200, 0);
    tick(v, T0 + 600 * MIN);
    expect(mine.stored).toBe(600);
    const before = v.gold;
    const got = collect(v, T0 + 600 * MIN);
    expect(got.gold).toBe(600);
    expect(v.gold).toBe(before + 600);
  });

  it("building takes a builder and time; finishing early costs crystals", () => {
    const v = newVillage(2, T0);
    expect(build(v, "archerTower", 2, 2, T0)).toEqual({ ok: true });
    const tower = v.buildings.at(-1)!;
    expect(tower.level).toBe(0);
    expect(build(v, "cannon", 6, 2, T0)).toEqual({ ok: false, why: "Upgrade your Keep to build more Cannons" });
    tick(v, T0 + 31_000);
    expect(tower.level).toBe(1);
    // Two upgrades use both builders; a third has to wait.
    v.gold = v.mana = 4000;
    expect(upgrade(v, tower.id, T0 + 40_000).ok).toBe(false); // needs keep 2
    const mine = v.buildings.find((b) => b.type === "goldMine")!;
    const well = v.buildings.find((b) => b.type === "manaWell")!;
    const cannon = v.buildings.find((b) => b.type === "cannon")!;
    expect(upgrade(v, mine.id, T0 + 40_000).ok).toBe(true);
    expect(upgrade(v, well.id, T0 + 40_000).ok).toBe(true);
    expect(upgrade(v, cannon.id, T0 + 40_000)).toEqual({ ok: false, why: "All builders are busy" });
    const crystals = v.crystals;
    expect(finishNow(v, mine.id, T0 + 40_000).ok).toBe(true);
    expect(v.crystals).toBe(crystals - 1);
    expect(mine.level).toBe(2);
    expect(fits(v.buildings, "keep", 18, 18)).toBe(false);
  });

  it("training uses mana and camp space, and takes time", () => {
    const v = newVillage(3, T0);
    expect(train(v, "ranger", T0)).toEqual({ ok: false, why: "Needs Barracks level 2" });
    for (let i = 0; i < 4; i++) expect(train(v, "brawler", T0)).toEqual({ ok: true });
    expect(train(v, "brawler", T0)).toEqual({ ok: false, why: "Your camps are full" });
    tick(v, T0 + 6_000);
    expect(v.army.brawler).toBe(11);
    tick(v, T0 + 60_000);
    expect(v.army.brawler).toBe(14);
  });
});

describe("raids", () => {
  it("generated bases are valid and get bigger with trophies", () => {
    for (const t of [0, 600, 1500, 2600]) {
      const b = generateBase(t, 42 + t);
      expect(b.buildings.filter((x) => x.type === "keep")).toHaveLength(1);
      for (const x of b.buildings) expect(x.level).toBeGreaterThanOrEqual(1);
      expect(b.buildings.some((x) => x.type === "wall")).toBe(true);
      expect(b.buildings.some((x) => BUILDINGS[x.type].category === "defense")).toBe(true);
    }
    expect(generateBase(2600, 1).buildings.length).toBeGreaterThan(generateBase(0, 1).buildings.length);
  });

  it("troops can't be dropped right next to buildings", () => {
    const b = new Battle(generateBase(0, 5), { ...emptyArmy(), brawler: 5 }, emptyArmy(), 1);
    expect(b.canDeploy(-2, -2)).toBe(true);
    expect(b.canDeploy(19, 19)).toBe(false);
    expect(b.deploy("brawler", 19, 19)).toBe(false);
    expect(b.deploy("brawler", -2, -2)).toBe(true);
    expect(b.left.brawler).toBe(4);
  });

  it("a big army flattens a starter base: three stars and loot", () => {
    const base = generateBase(0, 9);
    const b = simulateRaid(base, { ...emptyArmy(), brawler: 40, ranger: 30, brute: 4 }, 3);
    expect(b.ended).toBe(true);
    expect(b.destruction).toBeGreaterThanOrEqual(80);
    expect(b.stars).toBeGreaterThanOrEqual(2);
    expect(b.loot.gold).toBeGreaterThan(0);
    expect(b.result().used.brawler).toBe(40);
  });

  it("a handful of brawlers against a strong base gets nowhere: defenses fire and troops die", () => {
    const base = generateBase(2600, 4);
    const b = simulateRaid(base, { ...emptyArmy(), brawler: 6 }, 7);
    expect(b.stars).toBe(0);
    expect(b.destruction).toBeLessThan(30);
  });

  it("fliers hop the walls; only anti-air hurts them", () => {
    const base = generateBase(0, 11);
    const b = simulateRaid(base, { ...emptyArmy(), drake: 2 }, 2);
    expect(b.destruction).toBeGreaterThan(50);
  });

  it("an AI raid on your village takes loot from you", () => {
    const v = newVillage(5, T0);
    v.gold = 3500;
    const base = villageBase(v, T0);
    const b = simulateRaid(base, raiderArmy(3, 1), 1);
    const r = b.result();
    expect(r.destruction).toBeGreaterThan(0);
    expect(r.gold + r.mana).toBeGreaterThan(0);
  });

  it("trophies: wins scale with stars, losses cost", () => {
    expect(trophyDelta(3, 1000, 1000)).toBeGreaterThan(trophyDelta(1, 1000, 1000));
    expect(trophyDelta(0, 1000, 1000)).toBeLessThan(0);
    expect(trophyDelta(3, 1000, 1200)).toBeGreaterThan(trophyDelta(3, 1000, 800));
  });

  it("every troop is defined sensibly", () => {
    for (const t of Object.values(TROOPS)) {
      expect(t.hp).toBeGreaterThan(0);
      expect(t.speed).toBeGreaterThan(0);
    }
  });
});
