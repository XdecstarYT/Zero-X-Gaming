import { describe, expect, it } from "vitest";
import { findPath } from "../neon-siege/path";
import { battlefield, BF_H, BF_W, generateBattlefield } from "./battlefield";
import { BLEED_SECONDS, CAPTURE_SECONDS, createConquest, onDeath, START_TICKETS, stepConquest, type Soldier } from "./conquest";

const flags = battlefield().flags;
const run = (s: ReturnType<typeof createConquest>, soldiers: Soldier[], seconds: number) => {
  const events = [];
  for (let t = 0; t < seconds; t += 0.05) events.push(...stepConquest(s, soldiers, 0.05));
  return events;
};

describe("battlefield", () => {
  it("is mirrored, walled, and every flag is reachable from both bases", () => {
    const { map, bases } = generateBattlefield();
    expect(map.width).toBe(BF_W);
    expect(map.height).toBe(BF_H);
    for (let y = 0; y < BF_H; y++)
      for (let x = 0; x < BF_W; x++)
        expect(map.cells[y * BF_W + x]).toBe(map.cells[(BF_H - 1 - y) * BF_W + (BF_W - 1 - x)]);
    expect(bases[0].length).toBeGreaterThan(8);
    for (const base of bases)
      for (const f of flags) expect(findPath(map, base[0].x, base[0].y, f.x, f.y, 20000), `flag ${f.id}`).not.toBeNull();
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
