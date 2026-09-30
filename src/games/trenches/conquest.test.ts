import { describe, expect, it } from "vitest";
import { findPath } from "../neon-siege/path";
import { GROUND, SOLID } from "../neon-siege/map";
import { battlefield, generateBattlefield } from "./battlefield";
import { FRONT_IDS, FRONTS } from "./fronts";
import {
  BLEED_SECONDS,
  BREAKTHROUGH_TICKETS,
  CAPTURE_SECONDS,
  createConquest,
  isLive,
  onDeath,
  SECTOR_REINFORCEMENTS,
  START_TICKETS,
  stepConquest,
  type Soldier,
} from "./conquest";

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

describe("breakthrough", () => {
  it("defenders start holding everything; only the live sector can be taken", () => {
    const s = createConquest(flags, undefined, "breakthrough");
    expect(s.flags.map((f) => f.owner)).toEqual([2, 2, 2, 2, 2]);
    expect(isLive(s, 0) && isLive(s, 1) && !isLive(s, 2)).toBe(true);
    // Attackers standing on C (sector 2) get nowhere.
    run(s, [{ x: flags[2].x, y: flags[2].y, team: 1, alive: true }], CAPTURE_SECONDS * 3);
    expect(s.flags[2].owner).toBe(2);
  });

  it("taking a sector brings reinforcements and opens the next; the last one wins", () => {
    const s = createConquest(flags, undefined, "breakthrough");
    const on = (i: number): Soldier[] => [0, 1, 2].map(() => ({ x: flags[i].x, y: flags[i].y, team: 1 as const, alive: true }));
    run(s, [...on(0), ...on(1)], CAPTURE_SECONDS * 2 + 1);
    expect(s.sector).toBe(1);
    expect(s.tickets[0]).toBe(BREAKTHROUGH_TICKETS + SECTOR_REINFORCEMENTS);
    run(s, on(2), CAPTURE_SECONDS * 2 + 1);
    expect(s.sector).toBe(2);
    const ev = run(s, [...on(3), ...on(4)], CAPTURE_SECONDS * 2 + 1);
    expect(ev).toContainEqual({ type: "ended", winner: 1 });
    expect(s.winner).toBe(1);
  });

  it("only attackers pay tickets for deaths; running out loses", () => {
    const s = createConquest(flags, undefined, "breakthrough");
    onDeath(s, 2);
    expect(s.tickets[0]).toBe(BREAKTHROUGH_TICKETS);
    s.tickets[0] = 1;
    expect(onDeath(s, 1)).toEqual([{ type: "ended", winner: 2 }]);
  });
});
