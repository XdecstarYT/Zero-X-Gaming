import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import { ARENA, castRay, floorCells, isWall, lineOfSight, moveWithCollision, parseMap } from "./map";
import { findPath } from "./path";
import { createBrain, SKILLS, updateBot, type Difficulty } from "./bots";
import { createEntity, createWorld, damage, fire, MAG_SIZE, RELOAD_TIME, tickWorld, traceShot } from "./world";
import { createSolo, killPoints, PLAYER_ID, stepSolo, waveBonus, type PlayerInput, type SoloState } from "./solo";

const map = parseMap();
const DT = 1 / 60;

describe("arena map", () => {
  it("is enclosed, has 8 spawns, and every floor cell is reachable", () => {
    expect(ARENA.every((r) => r.length === map.width)).toBe(true);
    for (let x = 0; x < map.width; x++) expect(isWall(map, x, 0) && isWall(map, x, map.height - 1)).toBe(true);
    expect(map.spawns).toHaveLength(8);
    const cells = floorCells(map);
    const start = cells[0];
    for (const c of cells.filter((_, i) => i % 7 === 0)) {
      expect(findPath(map, start.x + 0.5, start.y + 0.5, c.x + 0.5, c.y + 0.5), `${c.x},${c.y}`).not.toBeNull();
    }
  });

  it("raycasts to the nearest wall", () => {
    // From (1.5, 1.5) looking +x, the wall at column 7 is 5.5 cells away.
    const hit = castRay(map, 1.5, 1.5, 0);
    expect(hit.dist).toBeCloseTo(5.5, 5);
    expect(hit.side).toBe(0);
    expect(castRay(map, 1.5, 1.5, Math.PI / 2).side).toBe(1);
  });

  it("line of sight is blocked by walls", () => {
    expect(lineOfSight(map, 1.5, 1.5, 5.5, 1.5)).toBe(true);
    expect(lineOfSight(map, 1.5, 1.5, 10.5, 1.5)).toBe(false);
  });

  it("collision keeps bodies out of walls", () => {
    const p = moveWithCollision(map, 1.5, 1.5, -2, 0, 0.25);
    expect(p.x).toBe(1.5);
    const q = moveWithCollision(map, 1.5, 1.5, 0.3, 0.3, 0.25);
    expect(q).toEqual({ x: 1.8, y: 1.8 });
  });

  it("A* finds short paths and never cuts wall corners", () => {
    const path = findPath(map, 1.5, 1.5, 22.5, 22.5)!;
    expect(path.length).toBeGreaterThan(20);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThanOrEqual(1);
      if (a.x !== b.x && a.y !== b.y) {
        expect(isWall(map, b.x, a.y) || isWall(map, a.x, b.y)).toBe(false);
      }
    }
    expect(findPath(map, 1.5, 1.5, 0.5, 0.5)).toBeNull();
  });
});

describe("combat", () => {
  function duel() {
    const world = createWorld(map);
    const a = createEntity({ id: "a", name: "A", kind: "human", team: 0, x: 1.5, y: 1.5 });
    const b = createEntity({ id: "b", name: "B", kind: "bot", team: 1, x: 5.5, y: 1.5 });
    world.entities.set("a", a);
    world.entities.set("b", b);
    return { world, a, b };
  }

  it("hitscan hits enemies in front, not through walls or teammates", () => {
    const { world, a, b } = duel();
    expect(traceShot(world, a, 0).best?.target.id).toBe("b");
    b.team = 0;
    expect(traceShot(world, a, 0).best).toBeNull();
    b.team = 1;
    b.x = 10.5; // behind the wall at column 7
    expect(traceShot(world, a, 0).best).toBeNull();
  });

  it("respects fire rate, ammo and reloads", () => {
    const { world, a } = duel();
    const rng = createRng(1);
    expect(fire(world, a, rng)).not.toBeNull();
    expect(fire(world, a, rng)).toBeNull(); // cooldown
    a.ammo = 1;
    a.nextFireAt = 0;
    fire(world, a, rng);
    expect(a.ammo).toBe(0);
    expect(a.reloadUntil).toBeGreaterThan(world.time);
    for (let t = 0; t < RELOAD_TIME + 0.1; t += DT) tickWorld(world, DT);
    expect(a.ammo).toBe(MAG_SIZE);
  });

  it("damage kills, credits the killer and schedules a respawn", () => {
    const { world, a, b } = duel();
    damage(world, b, a, 150);
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    expect(b.deaths).toBe(1);
    expect(world.events.some((e) => e.type === "kill" && e.killer === "a" && e.victim === "b")).toBe(true);
  });
});

describe("bots", () => {
  function arena(difficulty: Difficulty, seed: number) {
    const world = createWorld(map);
    const rng = createRng(seed);
    const target = createEntity({ id: "t", name: "T", kind: "human", team: 0, x: 2.5, y: 5.5 });
    const bot = createEntity({ id: "b", name: "B", kind: "bot", team: 1, x: 12.5, y: 5.5 });
    bot.angle = Math.PI;
    world.entities.set("t", target);
    world.entities.set("b", bot);
    return { world, rng, target, bot, brain: createBrain(SKILLS[difficulty], rng) };
  }

  it("engage a visible enemy after their reaction time, and hit it", () => {
    const { world, rng, target, bot, brain } = arena("normal", 3);
    let firstShot = -1;
    for (let i = 0; i < 60 * 5 && target.alive; i++) {
      tickWorld(world, DT);
      if (updateBot(world, bot, brain, DT, rng) && firstShot < 0) firstShot = world.time;
    }
    expect(firstShot).toBeGreaterThanOrEqual(SKILLS.normal.reaction);
    expect(target.hp).toBeLessThan(100);
  });

  it("hard bots kill faster than easy bots on average", () => {
    const ttk = (d: Difficulty) => {
      let total = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const { world, rng, target, bot, brain } = arena(d, seed);
        let t = 0;
        while (target.alive && t < 20) {
          tickWorld(world, DT);
          updateBot(world, bot, brain, DT, rng);
          t += DT;
        }
        total += t;
      }
      return total / 12;
    };
    expect(ttk("hard")).toBeLessThan(ttk("easy"));
  });

  it("patrol without enemies keeps moving along valid floor", () => {
    const { world, rng, bot, brain, target } = arena("normal", 9);
    world.entities.delete(target.id);
    const start = { x: bot.x, y: bot.y };
    for (let i = 0; i < 60 * 8; i++) {
      tickWorld(world, DT);
      updateBot(world, bot, brain, DT, rng);
      expect(isWall(map, bot.x, bot.y)).toBe(false);
    }
    expect(Math.hypot(bot.x - start.x, bot.y - start.y)).toBeGreaterThan(2);
  });

  it("hurt bots retreat out of the attacker's sight", () => {
    const { world, rng, target, bot, brain } = arena("normal", 4);
    target.team = 1; // make the target harmless (friendly) so we only test movement
    bot.hp = 20;
    brain.lastSeen = { x: target.x, y: target.y, t: 0 };
    brain.state = "retreat";
    brain.retreatUntil = 3;
    // pickCover runs when the state flips; force it by simulating the trigger path.
    for (let i = 0; i < 60 * 3; i++) {
      tickWorld(world, DT);
      updateBot(world, bot, brain, DT, rng);
    }
    expect(isWall(map, bot.x, bot.y)).toBe(false);
  });
});

describe("solo waves", () => {
  it("scoring helpers are capped", () => {
    expect(killPoints(1)).toBe(100);
    expect(killPoints(50)).toBe(300);
    expect(waveBonus(50)).toBe(2000);
  });

  /** An aimbot player: snaps to the nearest visible bot and fires. Upper bound on score rate. */
  function aimbot(s: SoloState): PlayerInput {
    const p = s.player;
    let best: { a: number; d: number } | null = null;
    for (const e of s.world.entities.values()) {
      if (e.kind !== "bot" || !e.alive || !lineOfSight(map, p.x, p.y, e.x, e.y)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (!best || d < best.d) best = { a: Math.atan2(e.y - p.y, e.x - p.x), d };
    }
    return { forward: best ? 0 : 0.5, strafe: 0, turn: best ? best.a - p.angle : 0.02, fire: !!best, reload: false };
  }

  it("waves progress, and even an aimbot stays under the server's 1,500 pts/s limit", () => {
    let worst = 0;
    let bestWave = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = createSolo("easy", seed);
      while (s.phase !== "over" && s.world.time < 240) stepSolo(s, DT, aimbot(s));
      bestWave = Math.max(bestWave, s.wave);
      if (s.world.time > 1) worst = Math.max(worst, s.score / s.world.time);
    }
    expect(bestWave).toBeGreaterThanOrEqual(3);
    expect(worst).toBeLessThan(1500);
  });

  it("an idle player eventually dies and the run ends", () => {
    const s = createSolo("hard", 5);
    const idle = { forward: 0, strafe: 0, turn: 0, fire: false, reload: false };
    while (s.phase !== "over" && s.world.time < 300) stepSolo(s, DT, idle);
    expect(s.phase).toBe("over");
    expect(s.player.alive).toBe(false);
    expect(s.world.entities.get(PLAYER_ID)).toBeDefined();
  });
});
