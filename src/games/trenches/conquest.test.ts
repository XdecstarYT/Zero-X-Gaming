import { describe, expect, it } from "vitest";
import { findPath } from "../neon-siege/path";
import { GROUND, SOLID } from "../neon-siege/map";
import { battlefield, generateBattlefield } from "./battlefield";
import { FRONT_IDS, FRONTS } from "./fronts";
import { BLEED_SECONDS, CAPTURE_SECONDS, createConquest, onDeath, START_TICKETS, stepConquest, type Soldier } from "./conquest";

const flags = battlefield().flags;
const run = (s: ReturnType<typeof createConquest>, soldiers: Soldier[], seconds: number) => {
  const events = [];
  for (let t = 0; t < seconds; t += 0.05) events.push(...stepConquest(s, soldiers, 0.05));
  return events;
};

describe("battlefields", () => {
  it.each(FRONT_IDS)("%s is large, mirrored, walled, has trenches, and every flag is reachable from both bases", (id) => {
    const { map, bases, flags: fl } = generateBattlefield(id);
    const W = map.width;
    const H = map.height;
    expect([W, H]).toEqual([FRONTS[id].width, FRONTS[id].height]);
    expect(W).toBeGreaterThanOrEqual(150);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const m = (H - 1 - y) * W + (W - 1 - x);
        expect(map.cells[i]).toBe(map.cells[m]);
        expect(map.ground[i]).toBe(map.ground[m]);
      }
    for (let x = 0; x < W; x++) expect(map.cells[x]).toBe(SOLID.perimeter);
    const trenchCells = map.ground.filter((g) => g === GROUND.trench).length;
    expect(trenchCells).toBeGreaterThan(H * 6);
    expect(fl.map((f) => f.id)).toEqual(["A", "B", "C", "D", "E"]);
    expect(bases[0].length).toBeGreaterThan(20);
    for (const base of bases)
      for (const f of fl) expect(findPath(map, base[0].x, base[0].y, f.x, f.y), `flag ${f.id}`).not.toBeNull();
    expect(map.front?.id).toBe(id);
  });

  it("gives every match its own ground layer (digging never leaks into the next battle)", () => {
    const a = battlefield("somme");
    const b = battlefield("somme");
    expect(a.map.ground).not.toBe(b.map.ground);
    expect(a.map.cells).toBe(b.map.cells);
    a.map.ground[5000] = GROUND.trench;
    a.map.dug!.push(5000);
    expect(b.map.dug).toEqual([]);
  });
});

describe("conquest", () => {
  it("captures a flag faster with more soldiers, and contested flags freeze", () => {
    const s = createConquest(flags);
    const A = flags[0];
    const one: Soldier[] = [{ x: A.x, y: A.y, team: 1, alive: true }];
    const ev = run(s, one, CAPTURE_SECONDS + 0.2);
    expect(ev).toContainEqual({ type: "captured", flag: "A", team: 1 });
    expect(s.flags[0].owner).toBe(1);

    const s2 = createConquest(flags);
    const three: Soldier[] = [0, 1, 2].map(() => ({ x: A.x, y: A.y, team: 2 as const, alive: true }));
    run(s2, three, CAPTURE_SECONDS / 3 + 0.2);
    expect(s2.flags[0].owner).toBe(2);

    const s3 = createConquest(flags);
    run(s3, [...one, ...three], 10);
    expect(s3.flags[0].p).toBe(0);
    expect(s3.flags[0].present).toEqual([1, 3]);
  });

  it("neutralises before recapturing", () => {
    const s = createConquest(flags);
    const A = flags[0];
    run(s, [{ x: A.x, y: A.y, team: 1, alive: true }], CAPTURE_SECONDS + 0.2);
    const ev = run(s, [{ x: A.x, y: A.y, team: 2, alive: true }], CAPTURE_SECONDS + 0.2);
    expect(ev.map((e) => e.type)).toContain("neutralized");
    expect(s.flags[0].owner).toBe(0);
    run(s, [{ x: A.x, y: A.y, team: 2, alive: true }], CAPTURE_SECONDS + 0.2);
    expect(s.flags[0].owner).toBe(2);
  });

  it("bleeds the side with fewer flags, costs tickets per death, and ends", () => {
    const s = createConquest(flags, 5);
    s.flags[0].owner = 1;
    s.flags[0].p = -1;
    s.flags[1].owner = 1;
    s.flags[1].p = -1;
    run(s, [], BLEED_SECONDS * 2 + 0.1);
    expect(s.tickets).toEqual([5, 3]);
    expect(onDeath(s, 2)).toEqual([]);
    expect(s.tickets[1]).toBe(2);
    onDeath(s, 2);
    expect(onDeath(s, 2)).toEqual([{ type: "ended", winner: 1 }]);
    expect(s.winner).toBe(1);
    expect(createConquest(flags).tickets).toEqual([START_TICKETS, START_TICKETS]);
  });
});
