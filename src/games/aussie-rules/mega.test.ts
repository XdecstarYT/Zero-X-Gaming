import { describe, expect, it } from "vitest";
import { commentary } from "./commentary";
import { CLUBS, clubById, FootySim, GOAL_X, kickRange, MAX_KICK, MAX_TORP, NO_INPUT, powerFor, type KickStyle, type SimEvent } from "./sim";

const DT = 1 / 60;
const make = (seed = 1, extra: Partial<ConstructorParameters<typeof FootySim>[0]> = {}) =>
  new FootySim({ seed, rival: clubById("sharks"), difficulty: "pro", quarterSeconds: 60, ...extra });
const run = (sim: FootySim, seconds: number) => {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds && sim.phase !== "over"; t += DT) {
    sim.step(DT, NO_INPUT);
    events.push(...sim.events);
    sim.events.length = 0;
  }
  return events;
};
type Internals = { awardSet: (id: number, x: number, z: number, kind: string, reason: string) => void; startKick: (p: unknown, aim: number, power: number, target: number, shot: boolean, style: KickStyle) => void };

describe("the competition", () => {
  it("has eight clubs with their own colours, and you can play as any of them", () => {
    expect(CLUBS).toHaveLength(8);
    expect(new Set(CLUBS.map((c) => c.id)).size).toBe(8);
    expect(new Set(CLUBS.map((c) => c.short)).size).toBe(8);
    const sim = make(1, { home: clubById("wolves"), rival: clubById("foxes") });
    expect(sim.clubs.map((c) => c.name)).toEqual(["Highland Wolves", "Redgum Foxes"]);
  });
});

describe("kick styles", () => {
  it("the torpedo goes further than the drop punt", () => {
    expect(MAX_TORP).toBeGreaterThan(MAX_KICK + 8);
    expect(MAX_TORP).toBeGreaterThan(70);
    expect(kickRange(0.6, "torpedo")).toBeGreaterThan(kickRange(0.6));
    expect(kickRange(powerFor(40, "snap"), "snap")).toBeCloseTo(40, 0);
  });

  it("a snap from a tight angle curls back in toward the goals, and often goes through", () => {
    let goals = 0;
    let curled = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sim = make(seed);
      const d = sim.dir(0);
      const p = sim.players.find((q) => q.team === 0 && q.role === 12)!;
      // Clear the area, then take the ball 20 m out and 16 m wide of the goals.
      for (const q of sim.players) if (q !== p) q.x = -d * 30;
      const x = d * (GOAL_X - 20);
      (sim as unknown as Internals).awardSet(p.id, x, 16, "mark", "Mark");
      p.x = x;
      p.z = 16;
      sim.phase = "play";
      sim.set = null;
      (sim as unknown as Internals).startKick(p, Math.atan2(-16, d * 20), Math.min(1, powerFor(30, "snap") + 0.05), -1, true, "snap");
      let minZ = 99;
      const ev: SimEvent[] = [];
      for (let t = 0; t < 4 && sim.phase === "play"; t += DT) {
        sim.step(DT, NO_INPUT);
        ev.push(...sim.events);
        sim.events.length = 0;
        if (sim.ball.state === "air") minZ = Math.min(minZ, Math.abs(sim.ball.z));
      }
      if (ev.some((e) => e.kind === "kick" && e.style === "snap")) curled++;
      if (ev.some((e) => e.kind === "goal")) goals++;
      expect(minZ).toBeLessThan(6);
    }
    expect(curled).toBe(10);
    expect(goals).toBeGreaterThanOrEqual(4);
  });
});

describe("rain", () => {
  it("a wet ground skids: the ball rolls further", () => {
    const roll = (wet: boolean) => {
      const sim = make(3, { wet });
      sim.phase = "play";
      sim.stoppage = null;
      for (const q of sim.players) q.x = 70;
      Object.assign(sim.ball, { state: "ground", holder: -1, x: -20, y: 0.1, z: 0, vx: 9, vy: 0, vz: 0, kick: null, ruck: false });
      for (let i = 0; i < 60; i++) sim.step(DT, NO_INPUT);
      return sim.ball.x;
    };
    expect(roll(true)).toBeGreaterThan(roll(false) + 0.5);
  });
});

describe("player stats and votes", () => {
  it("every kick is someone's; the umpires give 3, 2 and 1 votes; commentary calls the goals", () => {
    const sim = make(9, { quarterSeconds: 45 });
    sim.autopilot = true;
    const events = run(sim, 600);
    expect(sim.phase).toBe("over");
    for (const t of [0, 1] as const) {
      const kicks = sim.players.filter((p) => p.team === t).reduce((a, p) => a + p.st.kicks, 0);
      expect(kicks).toBe(sim.stats[t].kicks);
      const goals = sim.players.filter((p) => p.team === t).reduce((a, p) => a + p.st.goals, 0);
      expect(goals).toBe(sim.score[t].goals);
    }
    const v = sim.votes();
    expect(v.map((x) => x.votes)).toEqual([3, 2, 1]);
    expect(v[0].rating).toBeGreaterThanOrEqual(v[2].rating);
    const goal = events.find((e) => e.kind === "goal");
    if (goal) expect(commentary(goal, sim)).toMatch(/goal|through|six|siren|monster/i);
    expect(commentary({ kind: "over" }, sim)).toMatch(/Full time/);
  });
});
