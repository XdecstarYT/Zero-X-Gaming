import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { FORMABLES, UNITS } from "./data";
import { atWar } from "./economy";
import { advance, load, save, score, startGame } from "./sim";
import { relation, spawn, unitCount } from "./state";
import { realWorld } from "./testworld";
import { cityAt } from "./world";

const world = realWorld();
const nation = (s: ReturnType<typeof startGame>, iso: string) => s.nations.find((n) => n.iso === iso)!;
const cityNamed = (name: string, iso?: string) => world.cities.find((c) => c.name === name && (!iso || world.nations[c.nation].iso === iso))!;

describe("the world map", () => {
  it("has the real nations and cities, with land territories and capitals", () => {
    expect(world.nations.length).toBeGreaterThan(170);
    expect(world.cities.length).toBeGreaterThan(1100);
    for (const iso of ["USA", "CHN", "AUS", "SGP", "SSD", "EST"]) expect(world.nations.some((n) => n.iso === iso)).toBe(true);
    const canberra = cityNamed("Canberra");
    expect(canberra.capital).toBe(true);
    expect(world.nations[canberra.nation].iso).toBe("AUS");
    // A city's own spot is its own territory; the open ocean is nobody's.
    expect(cityAt(world, canberra.x, canberra.y)).toBe(canberra.id);
    expect(cityAt(world, 300, 1200)).toBe(-1);
    // Neighbours across a land border; coasts are known.
    expect(cityNamed("Paris").near.length).toBeGreaterThan(2);
    expect(cityNamed("Sydney").coastal).toBe(true);
  });
});

describe("a new game", () => {
  it("starts every nation with money, industry, deposits and forces", () => {
    const s = startGame(world, "AUS", { seed: 1 });
    expect(s.nations[s.player].iso).toBe("AUS");
    const us = nation(s, "USA");
    expect(us.money).toBeGreaterThan(nation(s, "EST").money);
    expect(us.last.gdp).toBeGreaterThan(0);
    expect(s.cities.some((c) => c.deposits.some((d) => d.res === "oil") && c.owner === nation(s, "SAU").id)).toBe(true);
    expect(s.armies.filter((a) => a.owner === us.id).length).toBeGreaterThan(5);
    expect(us.nukes).toBeGreaterThan(0);
    expect(nation(s, "CHN").ideology).toBe("communism");
    // The real alliances are there.
    expect(s.alliances.find((a) => a.name === "Atlantic Alliance")!.members).toContain(us.id);
  });

  it("earns, builds, develops and trains", () => {
    const s = startGame(world, "AUS", { seed: 2 });
    const me = s.nations[s.player];
    const cap = s.cities[me.capital];
    const before = me.money;
    advance(s, world, 3);
    expect(me.money).toBeGreaterThan(before);
    me.money = 100000;
    expect(act.build(s, world, s.player, cap.id, "civilian")).toBeNull();
    expect(act.build(s, world, s.player, cap.id, "steel")).toBe("Already building something here");
    const lv = cap.buildings.civilian ?? 0;
    advance(s, world, 30);
    expect(cap.buildings.civilian).toBe(lv + 1);
    const dev = cap.dev;
    expect(act.develop(s, s.player, cap.id)).toBeNull();
    advance(s, world, 60);
    expect(cap.dev).toBe(dev + 1);
    const inf = () => s.armies.filter((a) => a.owner === s.player && a.kind === "infantry").reduce((x, a) => x + unitCount(a), 0);
    const n0 = inf();
    expect(act.train(s, world, s.player, cap.id, "infantry")).toBeNull();
    advance(s, world, 8);
    expect(inf()).toBeCloseTo(n0 + 1, 3);
    // Ships need a shipyard.
    expect(act.canTrain(s, world, s.player, cap.id, "battleship")).toMatch(/shipyard|coast/);
  });

  it("moves armies over land they may enter, and ships them across the sea", () => {
    const s = startGame(world, "AUS", { seed: 3 });
    const syd = cityNamed("Sydney");
    const per = cityNamed("Perth");
    const a = spawn(s, s.player, "infantry", 2, syd.x, syd.y, -1);
    expect(act.order(s, world, s.player, [a.id], per.x, per.y)).toBeNull();
    expect(a.path.length).toBeGreaterThan(2);
    advance(s, world, 60);
    expect(Math.hypot(a.x - per.x, a.y - per.y)).toBeLessThan(2);
    // Into a country you're not at war with: no way.
    const jak = cityNamed("Jakarta");
    expect(act.order(s, world, s.player, [a.id], jak.x, jak.y)).toMatch(/access|war/);
  });
});

describe("war and peace", () => {
  it("justifies, declares, takes a city and makes peace", () => {
    const s = startGame(world, "NZL", { seed: 4 });
    const me = s.player;
    const aus = nation(s, "AUS").id;
    // Alone against Australia (no alliance to call in).
    expect(act.declareWar(s, me, aus)).toBe("Justify a war first");
    expect(act.justify(s, me, aus)).toBeNull();
    advance(s, world, act.justifyDays(s, me, aus) + 1);
    expect(act.declareWar(s, me, aus)).toBeNull();
    expect(atWar(s, me, aus)).toBe(true);
    // A big army lands next to Hobart and takes it.
    const hob = cityNamed("Hobart");
    for (const a of s.armies) if (a.owner === aus && Math.hypot(a.x - hob.x, a.y - hob.y) < 30) a.hp = 0;
    s.armies = s.armies.filter((a) => a.hp > 0);
    spawn(s, me, "tank", 20, hob.x + 1, hob.y, -1);
    spawn(s, me, "infantry", 20, hob.x - 1, hob.y, -1);
    advance(s, world, 30);
    expect(s.cities[hob.id].owner).toBe(me);
    const w = s.wars.find((x) => x.attackers.includes(me))!;
    expect(act.warScore(s, w)).toBeGreaterThan(0);
    // Peace, keeping it.
    w.start -= 400;
    expect(act.makePeace(s, world, w.id, me, "status")).toBeNull();
    expect(atWar(s, me, aus)).toBe(false);
    expect(s.cities[hob.id].owner).toBe(me);
    expect(relation(s, me, aus)).toBeLessThan(0);
  });

  it("brings allies in on the defence", () => {
    const s = startGame(world, "RUS", { seed: 5 });
    const est = nation(s, "EST").id;
    s.nations[s.player].justify.push({ target: est, days: 0, total: 30, ready: s.day });
    expect(act.declareWar(s, s.player, est)).toBeNull();
    const w = s.wars[s.wars.length - 1];
    expect(w.defenders).toContain(nation(s, "USA").id);
    // And the attacker's own alliance only joins if it also dislikes the target.
    expect(w.attackers[0]).toBe(s.player);
  });
});

describe("politics", () => {
  it("changes government over two months and forms nations", () => {
    const s = startGame(world, "ITA", { seed: 6 });
    expect(act.changeGovernment(s, s.player, "monarchy")).toBeNull();
    advance(s, world, 61);
    expect(s.nations[s.player].ideology).toBe("monarchy");
    // The Roman Empire: hand Italy the cities it needs.
    const rome = FORMABLES.find((f) => f.id === "rome")!;
    expect(act.canForm(s, world, s.player, rome)).toMatch(/still need/);
    for (const c of act.formableCities(world, rome)) s.cities[c].owner = s.player;
    expect(act.form(s, world, s.player, "rome")).toBeNull();
    expect(s.nations[s.player].name).toBe("Roman Empire");
    expect(s.formed.rome).toBe(s.player);
  });

  it("taxes trade money for stability", () => {
    const s = startGame(world, "FRA", { seed: 7 });
    const me = s.nations[s.player];
    act.setTax(s, s.player, 0.5);
    advance(s, world, 60);
    expect(me.stability).toBeLessThan(55);
  });
});

describe("the whole world", () => {
  it("runs a year of AI nations without breaking, and saves and loads", () => {
    const s = startGame(world, "BRA", { seed: 8 });
    advance(s, world, 365);
    expect(s.nations.every((n) => Number.isFinite(n.money) && Number.isFinite(n.stability))).toBe(true);
    expect(s.armies.every((a) => Number.isFinite(a.x + a.y + a.hp))).toBe(true);
    expect(s.nations.filter((n) => n.alive).length).toBeGreaterThan(160);
    expect(score(s)).toBeGreaterThan(0);
    const back = load(save(s))!;
    expect(back.day).toBe(s.day);
    expect(back.cities.length).toBe(s.cities.length);
    advance(back, world, 5);
    expect(back.day).toBe(s.day + 5);
    // Units' stats are all sane.
    for (const u of Object.values(UNITS)) expect(u.cost).toBeGreaterThan(0);
  }, 120_000);
});
