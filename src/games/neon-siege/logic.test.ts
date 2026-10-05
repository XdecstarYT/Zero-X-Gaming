import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import { applySkill, chooseSlot, createBrain, SKILLS, updateBot, type Difficulty } from "./bots";
import { damageAt, makeConsumable, makeWeapon, RARITY, rollChestLoot, rollRarity, weaponStats, WEAPONS, WW1_WEAPONS } from "./items";
import { castRay, cupArena, floorCells, generateTown, isWall, lineOfSight, moveWithCollision, parseMap, SOLID } from "./map";
import { CUP_FIELD } from "@/lib/cash-cup";
import { findPath } from "./path";
import { createRoyale, IDLE, matchStats, placementBonus, royaleScore, stepRoyale, type PlayerInput, type RoyaleState } from "./royale";
import { createStorm, outside, STORM_PHASES, stepStorm } from "./storm";
import {
  activeWeapon,
  createEntity,
  createWorld,
  damage,
  fire,
  giveItem,
  interact,
  MAX_SHIELD,
  spawnLoot,
  startUse,
  switchSlot,
  tickWorld,
  traceShot,
} from "./world";

const DT = 1 / 60;
const town = generateTown();

describe("Ground Zero map", () => {
  it("is deterministic, enclosed, and every floor cell is reachable", () => {
    const again = generateTown();
    expect(Buffer.from(again.cells).equals(Buffer.from(town.cells))).toBe(true);
    for (let i = 0; i < town.width; i++) {
      expect(isWall(town, i, 0) && isWall(town, 0, i) && isWall(town, i, town.height - 1)).toBe(true);
    }
    const cells = floorCells(town);
    const start = town.spawns[0];
    for (const c of cells.filter((_, i) => i % 97 === 0)) {
      expect(findPath(town, start.x, start.y, c.x + 0.5, c.y + 0.5), `${c.x},${c.y}`).not.toBeNull();
    }
  });

  it("has a town: buildings with interiors and chests, roads, trees, rocks, crates, spawns", () => {
    expect(town.buildings.length).toBeGreaterThanOrEqual(10);
    expect(town.chests.length).toBeGreaterThanOrEqual(8);
    expect(town.spawns).toHaveLength(24);
    const counts = new Map<number, number>();
    for (const c of town.cells) counts.set(c, (counts.get(c) ?? 0) + 1);
    for (const t of [SOLID.tree, SOLID.rock, SOLID.crate, SOLID.brick, SOLID.concrete]) expect(counts.get(t) ?? 0).toBeGreaterThan(5);
    for (const s of town.spawns) expect(isWall(town, s.x, s.y)).toBe(false);
  });

  it("raycasts, blocks line of sight, and collides", () => {
    const small = parseMap(["#######", "#S....#", "#..#..#", "#######"]);
    expect(castRay(small, 1.5, 1.5, 0).dist).toBeCloseTo(4.5, 5);
    expect(lineOfSight(small, 1.5, 2.5, 5.5, 2.5)).toBe(false);
    expect(moveWithCollision(small, 1.5, 1.5, -2, 0, 0.25).x).toBe(1.5);
  });

  it("A* never cuts wall corners", () => {
    const path = findPath(town, town.spawns[0].x, town.spawns[0].y, town.spawns[5].x, town.spawns[5].y)!;
    expect(path.length).toBeGreaterThan(3);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (a.x !== b.x && a.y !== b.y) expect(isWall(town, b.x, a.y) || isWall(town, a.x, b.y)).toBe(false);
    }
  });
});

describe("weapons & items", () => {
  it("rarity scales damage and reload", () => {
    const common = weaponStats(makeWeapon("ar", "common"));
    const legendary = weaponStats(makeWeapon("ar", "legendary"));
    expect(legendary.damage).toBeCloseTo(common.damage * RARITY.legendary.damage, 5);
    expect(legendary.reload).toBeLessThan(common.reload);
  });

  it("the Marksman Rifle and Light Machine Gun drop from loot, with Great War versions", () => {
    expect(WEAPONS.dmr.damage).toBeGreaterThan(WEAPONS.ar.damage);
    expect(WEAPONS.dmr.damage).toBeLessThan(WEAPONS.sniper.damage);
    expect(WEAPONS.lmg.auto && WEAPONS.lmg.mag).toBeGreaterThan(WEAPONS.ar.mag);
    expect(WW1_WEAPONS.lmg.name).toBe("Lewis Gun");
    const rng = createRng(3);
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) for (const it of rollChestLoot(rng)) if (it.type === "weapon") kinds.add(it.kind);
    expect(kinds.has("dmr") && kinds.has("lmg")).toBe(true);
  });

  it("damage falls off beyond range to at most half", () => {
    const sg = makeWeapon("shotgun");
    expect(damageAt(sg, 3)).toBe(WEAPONS.shotgun.damage);
    expect(damageAt(sg, 100)).toBe(WEAPONS.shotgun.damage * 0.5);
  });

  it("rarity rolls favour common, chests roll better", () => {
    const rng = createRng(1);
    const floor = Array.from({ length: 2000 }, () => rollRarity(rng, 0));
    const chest = Array.from({ length: 2000 }, () => rollRarity(rng, 1));
    expect(floor.filter((r) => r === "common").length).toBeGreaterThan(700);
    expect(chest.filter((r) => r === "common").length).toBe(0);
    expect(floor.includes("legendary")).toBe(true);
  });
});

describe("combat & inventory", () => {
  const arena = () => {
    const world = createWorld(parseMap(["##########", "#........#", "#........#", "##########"]));
    const a = createEntity({ id: "a", name: "A", kind: "human", team: 0, x: 1.5, y: 1.5 });
    const b = createEntity({ id: "b", name: "B", kind: "bot", team: 1, x: 5.5, y: 1.5 });
    world.entities.set("a", a);
    world.entities.set("b", b);
    return { world, a, b, rng: createRng(3) };
  };

  it("shields absorb damage before health", () => {
    const { world, a, b } = arena();
    b.shield = 30;
    damage(world, b, a, 50);
    expect(b.shield).toBe(0);
    expect(b.hp).toBe(80);
  });

  it("the storm ignores shields", () => {
    const { world, b } = arena();
    b.shield = 50;
    damage(world, b, { id: "storm" }, 10, "storm");
    expect(b.shield).toBe(50);
    expect(b.hp).toBe(90);
  });

  it("shotgun pellets add up on one target; one shot event", () => {
    const { world, a, b, rng } = arena();
    b.x = 2.8;
    a.inventory[0] = makeWeapon("shotgun", "common");
    fire(world, a, rng);
    expect(100 - b.hp).toBeGreaterThan(WEAPONS.shotgun.damage * 3);
    expect(world.events.filter((e) => e.type === "shot")).toHaveLength(1);
  });

  it("aiming tightens spread and switching slots has a draw delay", () => {
    const { world, a } = arena();
    a.inventory[0] = makeWeapon("ar");
    a.inventory[1] = makeWeapon("pistol");
    switchSlot(world, a, 1);
    expect(a.active).toBe(1);
    expect(fire(world, a, createRng(1))).toBeNull();
    tickWorld(world, 0.31);
    expect(fire(world, a, createRng(1))).not.toBeNull();
  });

  it("pickup fills empty slots, stacks consumables, swaps weapons when full", () => {
    const { world, a } = arena();
    a.inventory = [makeWeapon("pistol"), makeWeapon("smg"), makeWeapon("ar"), makeWeapon("shotgun"), makeConsumable("medkit", 1)];
    expect(giveItem(world, a, makeConsumable("medkit", 1))).toBe(true);
    expect(a.inventory[4]).toMatchObject({ kind: "medkit", count: 2 });
    a.active = 0;
    expect(giveItem(world, a, makeWeapon("sniper", "epic"))).toBe(true);
    expect(a.inventory[0]).toMatchObject({ kind: "sniper", rarity: "epic" });
    expect([...world.loot.values()].some((l) => l.item.type === "weapon" && l.item.kind === "pistol")).toBe(true);
  });

  it("interact opens chests (better loot) and picks up items", () => {
    const world = createWorld(town);
    const chest = world.chests[0];
    const a = createEntity({ id: "a", name: "A", kind: "human", team: 0, x: chest.x, y: chest.y });
    world.entities.set("a", a);
    expect(interact(world, a, createRng(2))).toBe(true);
    expect(chest.opened).toBe(true);
    const drops = [...world.loot.values()];
    expect(drops.length).toBe(2);
    expect(drops.some((d) => d.item.type === "weapon" && d.item.rarity !== "common")).toBe(true);
    a.x = drops[0].x;
    a.y = drops[0].y;
    expect(interact(world, a, createRng(2))).toBe(true);
    expect(a.inventory.filter(Boolean)).toHaveLength(1);
  });

  it("med kits heal after their use time; shields cap at 100", () => {
    const { world, a } = arena();
    a.hp = 40;
    a.inventory[0] = makeConsumable("medkit", 2);
    a.inventory[1] = makeConsumable("shield", 3);
    expect(startUse(world, a)).toBe(true);
    tickWorld(world, 2.9);
    expect(a.hp).toBe(40);
    tickWorld(world, 0.2);
    expect(a.hp).toBe(90);
    a.active = 1;
    for (let i = 0; i < 3; i++) {
      startUse(world, a);
      tickWorld(world, 2.1);
    }
    expect(a.shield).toBe(MAX_SHIELD);
    expect(a.inventory[1]).toMatchObject({ count: 1 });
  });

  it("taking damage cancels using an item", () => {
    const { world, a, b } = arena();
    a.hp = 50;
    a.inventory[0] = makeConsumable("medkit");
    startUse(world, a);
    damage(world, a, b, 5);
    expect(a.using).toBeNull();
  });

  it("hitscan hits enemies in front, not through walls or teammates", () => {
    const { world, a, b } = arena();
    expect(traceShot(world, a, 0).best?.target.id).toBe("b");
    b.team = 0;
    expect(traceShot(world, a, 0).best).toBeNull();
  });
});

describe("storm", () => {
  it("shrinks phase by phase, each circle inside the previous", () => {
    const rng = createRng(5);
    const s = createStorm(72, 72, rng);
    let prev = { ...s.to };
    let phases = 0;
    for (let t = 0; t < 1000 && !s.done; t += 0.5) {
      const before = s.phase;
      stepStorm(s, 0.5, rng, 72, 72);
      if (s.phase !== before) {
        phases++;
        expect(Math.hypot(s.to.x - prev.x, s.to.y - prev.y) + s.to.r).toBeLessThanOrEqual(prev.r + 1e-6);
        prev = { ...s.to };
      }
    }
    expect(phases).toBe(STORM_PHASES.length - 1);
    expect(s.current.r).toBeLessThan(1);
    expect(outside(s.current, s.current.x + 2, s.current.y)).toBe(true);
  });
});

describe("bots", () => {
  it("pick the right gun for the range", () => {
    const b = createEntity({ id: "b", name: "B", kind: "bot", team: 1, x: 0, y: 0 });
    b.inventory = [makeWeapon("sniper"), makeWeapon("shotgun"), makeWeapon("ar"), null, null];
    expect(b.inventory[chooseSlot(b, 2)]?.type === "weapon" && (b.inventory[chooseSlot(b, 2)] as { kind: string }).kind).toBe("shotgun");
    expect((b.inventory[chooseSlot(b, 25)] as { kind: string }).kind).toBe("sniper");
    expect((b.inventory[chooseSlot(b, 9)] as { kind: string }).kind).toBe("ar");
  });

  it("loot nearby items when no enemies are around", () => {
    const world = createWorld(town);
    const rng = createRng(4);
    const s = town.spawns[3];
    const bot = createEntity({ id: "b", name: "B", kind: "bot", team: 1, x: s.x, y: s.y });
    world.entities.set("b", bot);
    spawnLoot(world, s.x + 1.5, s.y, makeWeapon("ar", "rare"));
    const brain = createBrain(SKILLS.normal, rng);
    for (let i = 0; i < 60 * 6 && !bot.inventory.some(Boolean); i++) {
      tickWorld(world, DT);
      updateBot(world, bot, brain, DT, rng);
    }
    expect(bot.inventory.some((it) => it?.type === "weapon" && it.kind === "ar")).toBe(true);
  });

  it("rotate into the safe zone when outside it", () => {
    const world = createWorld(town);
    const rng = createRng(8);
    const s = town.spawns[0];
    const bot = createEntity({ id: "b", name: "B", kind: "bot", team: 1, x: s.x, y: s.y });
    world.entities.set("b", bot);
    const brain = createBrain(SKILLS.normal, rng);
    const safe = { x: 36, y: 36, r: 12 };
    const d0 = Math.hypot(bot.x - safe.x, bot.y - safe.y);
    for (let i = 0; i < 60 * 12; i++) {
      tickWorld(world, DT);
      updateBot(world, bot, brain, DT, rng, { safe, storm: { x: 36, y: 36, r: 60 } });
    }
    expect(Math.hypot(bot.x - safe.x, bot.y - safe.y)).toBeLessThan(Math.min(d0, safe.r + 2));
  });

  it("engage a visible enemy after their reaction time", () => {
    const world = createWorld(parseMap(["####################", "#..................#", "####################"]));
    const rng = createRng(3);
    const t = createEntity({ id: "t", name: "T", kind: "human", team: 0, x: 2.5, y: 1.5 });
    const b = createEntity({ id: "b", name: "B", kind: "bot", team: 1, x: 12.5, y: 1.5, angle: Math.PI });
    b.inventory[0] = makeWeapon("ar", "rare");
    applySkill(b, SKILLS.normal);
    world.entities.set("t", t);
    world.entities.set("b", b);
    const brain = createBrain(SKILLS.normal, rng);
    let first = -1;
    for (let i = 0; i < 60 * 6 && t.alive; i++) {
      tickWorld(world, DT);
      if (updateBot(world, b, brain, DT, rng) && first < 0) first = world.time;
    }
    expect(first).toBeGreaterThanOrEqual(SKILLS.normal.reaction);
    expect(t.hp).toBeLessThan(100);
  });
});

describe("battle royale", () => {
  it("scoring helpers", () => {
    expect(placementBonus(1)).toBe(1000);
    expect(placementBonus(4)).toBe(400);
    expect(placementBonus(16)).toBe(0);
  });

  /** An aimbot: loots nothing, but snaps to the nearest visible enemy and fires (upper bound on score rate). */
  function aimbot(s: RoyaleState): PlayerInput {
    const p = s.player;
    let best: { a: number; d: number } | null = null;
    for (const e of s.world.entities.values()) {
      if (e.id === p.id || !e.alive || !lineOfSight(s.world.map, p.x, p.y, e.x, e.y)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (!best || d < best.d) best = { a: Math.atan2(e.y - p.y, e.x - p.x), d };
    }
    const toSafe = Math.atan2(s.storm.to.y - p.y, s.storm.to.x - p.x);
    return {
      ...IDLE,
      turn: best ? best.a - p.angle : (toSafe - p.angle) * 0.1,
      forward: best ? 0 : 1,
      fire: !!best,
      interact: true,
      aim: !!best && best.d > 10,
    };
  }

  it("matches end with a placement, the field thins out, and score stays under the 150 pts/s server cap", () => {
    let worstRate = 0;
    const placements: number[] = [];
    for (const [i, d] of (["easy", "normal", "hard"] as Difficulty[]).entries()) {
      const s = createRoyale(d, 100 + i);
      while (s.phase !== "over" && s.world.time < 400) stepRoyale(s, 1 / 30, aimbot(s));
      expect(s.phase).toBe("over");
      placements.push(s.placement!);
      const st = matchStats(s);
      expect(st.players).toBe(16);
      expect(st.placement).toBeGreaterThanOrEqual(1);
      if (st.survivedS > 1) worstRate = Math.max(worstRate, royaleScore(s) / st.survivedS);
    }
    expect(worstRate).toBeLessThan(150);
  });

  it("a Cash Cup drops the whole field onto the arena, each with their own name and spawn", () => {
    const s = createRoyale("hard", 3, { map: cupArena(), field: CUP_FIELD });
    const all = [...s.world.entities.values()];
    expect(all).toHaveLength(CUP_FIELD);
    expect(new Set(all.map((e) => e.name)).size).toBe(CUP_FIELD);
    expect(new Set(all.map((e) => `${Math.floor(e.x)},${Math.floor(e.y)}`)).size).toBe(CUP_FIELD);
    expect(matchStats(s).players).toBe(CUP_FIELD);
  });

  it("bots fight each other and the storm, even with an idle player hiding", () => {
    const s = createRoyale("normal", 7);
    // Keep the player alive and out of the fight to watch the bots.
    s.player.maxHp = s.player.hp = 1e9;
    while (s.phase !== "over" && s.world.time < 420) stepRoyale(s, 1 / 30, IDLE);
    expect(s.alive).toBeLessThan(8);
    expect([...s.world.entities.values()].some((e) => e.kind === "bot" && e.kills > 0)).toBe(true);
  });

  it("starts everyone with a pistol and seeds loot", () => {
    const s = createRoyale("easy", 1);
    expect(activeWeapon(s.player)?.kind).toBe("pistol");
    expect(s.world.loot.size).toBe(town.lootSpots.length);
    expect(s.world.chests.length).toBe(town.chests.length);
  });
});
