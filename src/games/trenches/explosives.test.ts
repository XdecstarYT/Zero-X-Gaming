import { describe, expect, it } from "vitest";
import { GROUND, SOLID, type GameMap } from "../neon-siege/map";
import { blastDamage, GRENADE_BLAST, GRENADE_FUSE, planBarrage, powerFor, stepGrenade, throwGrenade, TRENCH_FLOOR } from "./explosives";

function field(w = 60, h = 20): GameMap {
  return {
    name: "test",
    width: w,
    height: h,
    cells: new Uint8Array(w * h),
    ground: new Uint8Array(w * h).fill(GROUND.dirt),
    buildings: [],
    spawns: [],
    lootSpots: [],
    chests: [],
    windows: [],
  };
}

function fly(map: GameMap, power = 1, x = 5.5, angle = 0) {
  const g = throwGrenade("g", "me", x, 10.5, angle, 0, power);
  for (let t = 0; t < GRENADE_FUSE; t += 1 / 60) stepGrenade(g, map, 1 / 60);
  return g;
}

describe("grenades", () => {
  it("fly about 20 m at full power, and powerFor aims shorter throws", () => {
    const far = fly(field());
    expect(far.x - 5.5).toBeGreaterThan(17);
    expect(far.x - 5.5).toBeLessThan(30);
    expect(far.z).toBeCloseTo(0, 1);
    const near = fly(field(), powerFor(10));
    expect(near.x - 5.5).toBeGreaterThan(8);
    expect(near.x - 5.5).toBeLessThan(15);
  });

  it("bounce off walls and drop into trenches", () => {
    const walled = field();
    // A wall 2.5 m away: the grenade is still below its top and bounces back.
    for (let y = 0; y < 20; y++) walled.cells[y * 60 + 8] = SOLID.brick;
    expect(fly(walled).x).toBeLessThan(8);

    const trench = field();
    for (let y = 0; y < 20; y++) for (let x = 13; x < 17; x++) trench.ground[y * 60 + x] = GROUND.trench;
    const g = fly(trench, powerFor(9));
    expect(g.x).toBeGreaterThanOrEqual(13);
    expect(g.x).toBeLessThan(17.5);
    expect(g.z).toBeCloseTo(TRENCH_FLOOR, 1);
  });

  it("but fly over barbed wire and low rubble", () => {
    const m = field();
    for (let y = 0; y < 20; y++) m.cells[y * 60 + 10] = SOLID.wire;
    expect(fly(m).x).toBeGreaterThan(20);
  });
});

describe("blasts", () => {
  const b = { x: 10.5, y: 10.5, ...GRENADE_BLAST };
  it("fall off with distance and stop at the radius", () => {
    const m = field();
    const close = blastDamage(b, m, { x: 11, y: 10.5 });
    const mid = blastDamage(b, m, { x: 13.5, y: 10.5 });
    expect(close).toBeGreaterThan(130);
    expect(mid).toBeLessThan(close);
    expect(mid).toBeGreaterThan(0);
    expect(blastDamage(b, m, { x: 10.5 + GRENADE_BLAST.radius, y: 10.5 })).toBe(0);
  });

  it("trenches, stance and walls soak it up", () => {
    const m = field();
    const open = blastDamage(b, m, { x: 13.5, y: 10.5 });
    expect(blastDamage(b, m, { x: 13.5, y: 10.5, stance: 2 })).toBeLessThan(open * 0.6);
    const trench = field();
    trench.ground[10 * 60 + 13] = GROUND.trench;
    expect(blastDamage(b, trench, { x: 13.5, y: 10.5 })).toBeLessThan(open * 0.3);
    const wall = field();
    wall.cells[10 * 60 + 12] = SOLID.concrete;
    expect(blastDamage(b, wall, { x: 13.5, y: 10.5 })).toBeLessThan(open * 0.2);
  });

  it("plans barrages that walk around the target over several seconds", () => {
    let i = 0;
    const rand = () => ((i++ * 0.37) % 1);
    const plan = planBarrage(50, 30, 8, rand);
    expect(plan).toHaveLength(8);
    for (const p of plan) expect(Math.hypot(p.x - 50, p.y - 30)).toBeLessThanOrEqual(10);
    expect(plan[7].delay).toBeGreaterThan(plan[0].delay + 3);
  });
});
