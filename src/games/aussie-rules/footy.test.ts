import { describe, expect, it } from "vitest";
import { A, B, boundaryAt, FootySim, GOAL_X, kickRange, MAX_KICK, NO_INPUT, outside, points, powerFor, RIVALS, type FootyInput, type SimEvent } from "./sim";

const DT = 1 / 60;
const make = (seed = 1, quarterSeconds = 60) => new FootySim({ seed, rival: RIVALS[0], difficulty: "pro", quarterSeconds });
const run = (sim: FootySim, seconds: number, input: Partial<FootyInput> = {}) => {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    sim.step(DT, { ...NO_INPUT, ...input });
    events.push(...sim.events);
    sim.events.length = 0;
  }
  return events;
};
/** Reach the sim's internals for set-piece tests. */
const internals = (sim: FootySim) => sim as unknown as { awardSet: (id: number, x: number, z: number, kind: string, reason: string) => void };

/** Start open play with the ball in the air. */
function airBall(sim: FootySim, b: Partial<FootySim["ball"]>) {
  sim.phase = "play";
  sim.stoppage = null;
  Object.assign(sim.ball, { state: "air", holder: -1, ruck: false, ...b });
}

describe("the ground", () => {
  it("is an oval, flat across the goal face", () => {
    expect(outside(0, 0)).toBe(false);
    expect(outside(A + 1, 20)).toBe(true);
    expect(outside(0, B + 1)).toBe(true);
    expect(outside(GOAL_X - 0.1, 0)).toBe(false);
    expect(outside(GOAL_X + 0.1, 0)).toBe(true);
    const b = boundaryAt(0, 80);
    expect(b.z).toBeCloseTo(B);
    expect(b.nz).toBeLessThan(0);
  });

  it("kicks carry like a drop punt: about 60 m flat out, and power inverts range", () => {
    expect(MAX_KICK).toBeGreaterThan(55);
    expect(MAX_KICK).toBeLessThan(70);
    for (const d of [20, 35, 50]) expect(kickRange(powerFor(d))).toBeCloseTo(d, 0);
  });
});

describe("the match", () => {
  it("plays four quarters to full time with sensible scores", () => {
    const sim = make(3, 90);
    sim.autopilot = true;
    const events = run(sim, 600);
    expect(sim.phase).toBe("over");
    expect(sim.byQuarter).toHaveLength(4);
    expect(events.filter((e) => e.kind === "siren")).toHaveLength(4);
    expect(events.some((e) => e.kind === "kick")).toBe(true);
    expect(events.some((e) => e.kind === "mark")).toBe(true);
    const total = points(sim.score[0]) + points(sim.score[1]);
    expect(total).toBeGreaterThan(0);
    expect(sim.matchScore()).toBeGreaterThanOrEqual(0);
    expect(sim.matchScore()).toBeLessThanOrEqual(20000);
    for (const p of sim.players) expect(Number.isFinite(p.x + p.z)).toBe(true);
  });

  it("changes ends every quarter", () => {
    const sim = make();
    const d = sim.dir(0);
    expect(sim.dir(1)).toBe(-d);
    sim.quarter = 2;
    expect(sim.dir(0)).toBe(-d);
  });

  it("fields 18 a side with every position matched up", () => {
    const sim = make();
    expect(sim.players.filter((p) => p.team === 0)).toHaveLength(18);
    for (const p of sim.players) expect(sim.opponent(p)?.team).not.toBe(p.team);
  });
});

describe("scoring", () => {
  it("a kick through the big sticks is a goal; touched on the way it's a behind", () => {
    const sim = make();
    const kicker = sim.players.find((p) => p.team === 0)!;
    const kick = { by: kicker.id, team: 0 as const, fromX: GOAL_X - 30, fromZ: 0, isKick: true, touched: false, bounced: false, target: -1, markable: true, shot: true, afterSiren: false };
    airBall(sim, { x: GOAL_X - 0.2, y: 5, z: 0.5, vx: 20, vy: 0, vz: 0, kick: { ...kick } });
    const ev = run(sim, DT * 2);
    expect(ev.some((e) => e.kind === "goal")).toBe(true);
    expect(sim.score[0]).toEqual({ goals: 1, behinds: 0 });

    const sim2 = make();
    airBall(sim2, { x: GOAL_X - 0.2, y: 5, z: 0.5, vx: 20, vy: 0, vz: 0, kick: { ...kick, touched: true } });
    run(sim2, DT * 2);
    expect(sim2.score[0]).toEqual({ goals: 0, behinds: 1 });
    // Then the full back kicks in from the goal square.
    expect(sim2.phase).toBe("set");
    expect(sim2.set?.kind).toBe("kickin");
    expect(sim2.players[sim2.set!.id].team).toBe(1);
  });

  it("between the goal and behind posts is a behind", () => {
    const sim = make();
    airBall(sim, { x: GOAL_X - 0.2, y: 3, z: 6, vx: 20, vy: 0, vz: 0, kick: { by: 0, team: 0, fromX: 40, fromZ: 0, isKick: true, touched: false, bounced: false, target: -1, markable: true, shot: true, afterSiren: false } });
    run(sim, DT * 2);
    expect(points(sim.score[0])).toBe(1);
  });
});

describe("rules", () => {
  it("out on the full is a free kick to the other side", () => {
    const sim = make();
    airBall(sim, { x: 10, y: 2, z: B - 0.1, vx: 0, vy: 0, vz: 15, kick: { by: 0, team: 0, fromX: 10, fromZ: 20, isKick: true, touched: false, bounced: false, target: -1, markable: true, shot: false, afterSiren: false } });
    const ev = run(sim, DT * 3);
    expect(ev.some((e) => e.kind === "free" && e.reason === "Out on the full")).toBe(true);
    expect(sim.phase).toBe("set");
    expect(sim.players[sim.set!.id].team).toBe(1);
  });

  it("only kicks of 15 m or more can be marked", () => {
    let marks = 0;
    let shortMarks = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (const from of [30, 8]) {
        const sim = make(seed);
        const p = sim.players.find((q) => q.team === 0 && q.role === 12)!;
        // Clear space around the catcher.
        for (const q of sim.players) if (q !== p && Math.hypot(q.x - 30, q.z - 40) < 6) q.x -= 20;
        p.x = 30;
        p.z = 40;
        airBall(sim, { x: 30.2, y: 1.6, z: 40, vx: 0.1, vy: -2, vz: 0, kick: { by: 1, team: 0, fromX: 30 - from, fromZ: 40, isKick: true, touched: false, bounced: false, target: p.id, markable: true, shot: false, afterSiren: false } });
        const ev = run(sim, DT * 4);
        const m = ev.some((e) => e.kind === "mark");
        if (from >= 15 && m) marks++;
        if (from < 15 && m) shortMarks++;
      }
    }
    expect(marks).toBeGreaterThan(6);
    expect(shortMarks).toBe(0);
  });

  it("holding the ball: tackled after prior opportunity is a free kick to the tackler", () => {
    const sim = make();
    const you = sim.you;
    const tackler = sim.players.find((p) => p.team === 1)!;
    sim.phase = "play";
    sim.stoppage = null;
    Object.assign(sim.ball, { state: "held", holder: you.id, kick: null, ruck: false });
    tackler.x = you.x + 0.5;
    tackler.z = you.z;
    sim.tackle = { by: tackler.id, on: you.id, t: 0, prior: true };
    const ev = run(sim, 0.8);
    expect(ev.some((e) => e.kind === "free" && e.reason === "Holding the ball")).toBe(true);
    expect(sim.set?.id).toBe(tackler.id);
  });

  it("in play you kick by holding and releasing: further for a longer hold", () => {
    const ranges: number[] = [];
    for (const hold of [0.25, 0.9]) {
      const sim = make(5);
      const you = sim.you;
      sim.phase = "play";
      sim.stoppage = null;
      Object.assign(sim.ball, { state: "held", holder: you.id, kick: null, ruck: false });
      run(sim, hold, { kick: true });
      expect(sim.charge).toBeGreaterThan(0);
      const ev = run(sim, 0.4);
      const k = ev.find((e) => e.kind === "kick");
      expect(k).toBeTruthy();
      ranges.push(k && k.kind === "kick" ? k.power : 0);
    }
    expect(ranges[1]).toBeGreaterThan(ranges[0]);
  });

  it("a set shot goes through the meter: line up, hold for power, tap for accuracy", () => {
    const sim = make(5);
    const you = sim.you;
    internals(sim).awardSet(you.id, 0, 0, "mark", "Mark");
    run(sim, 0.5);
    expect(sim.set?.stage).toBe("aim");
    run(sim, 0.6, { kick: true });
    expect(sim.set?.stage).toBe("runup");
    expect(sim.set!.power).toBeGreaterThan(0.4);
    run(sim, DT * 2);
    expect(sim.set?.stage).toBe("accuracy");
    run(sim, 0.2);
    const ev = run(sim, 0.5, { kick: true });
    expect(ev.some((e) => e.kind === "kick" && e.shot)).toBe(true);
    expect(sim.phase).toBe("play");
  });

  it("a mark before the siren still gets its kick after it", () => {
    const sim = make(7, 60);
    const p = sim.players.find((q) => q.team === 1)!;
    internals(sim).awardSet(p.id, 0, 0, "mark", "Mark");
    sim.clock = 0.05;
    const ev = run(sim, 0.2);
    expect(ev.some((e) => e.kind === "siren")).toBe(true);
    expect(sim.phase).toBe("set");
    run(sim, 15);
    expect(sim.byQuarter).toHaveLength(1);
  });
});
