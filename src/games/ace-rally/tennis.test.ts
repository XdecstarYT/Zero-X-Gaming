import { describe, expect, it } from "vitest";
import { flight, HALF_L, netHeight, NO_INPUT, RIVALS, SINGLES, solveShot, TennisSim, type TennisEvent, type TennisInput } from "./sim";

const DT = 1 / 60;
const make = (seed = 1, format: "tiebreak" | "set" = "tiebreak") =>
  new TennisSim({ seed, difficulty: "pro", surface: "hard", format, rival: RIVALS.men[0] });
const run = (sim: TennisSim, seconds: number, input: (s: TennisSim) => TennisInput = () => NO_INPUT) => {
  const events: TennisEvent[] = [];
  for (let t = 0; t < seconds && sim.phase !== "over"; t += DT) {
    sim.step(DT, input(sim));
    events.push(...sim.events);
    sim.events.length = 0;
  }
  return events;
};

describe("ball flight", () => {
  it("the net sags to 0.914 m in the middle", () => {
    expect(netHeight(0)).toBeCloseTo(0.914);
    expect(netHeight(6.4)).toBeCloseTo(1.07, 1);
  });

  it("a topspin drive from the baseline lands on target and clears the net", () => {
    const b = solveShot({ x: -12, y: 1, z: 0 }, 9, 2, 32, 0.85, 0.45);
    const f = flight(b);
    expect(f.x).toBeCloseTo(9, 0);
    expect(f.z).toBeCloseTo(2, 0);
    expect(f.clear).toBeGreaterThan(0.3);
    expect(Math.hypot(b.vx, b.vy, b.vz) * 3.6).toBeGreaterThan(90);
  });

  it("topspin dips: the same pace and angle lands shorter than slice", () => {
    const base = { x: -12, y: 1, z: 0, vx: 28, vy: 4, vz: 0 };
    expect(flight({ ...base, spin: 0.9 }).x).toBeLessThan(flight({ ...base, spin: -0.7 }).x);
  });

  it("a big serve lands in the box", () => {
    const b = solveShot({ x: -12, y: 2.8, z: 0.9 }, 5.4, -2.6, 52, 0.25, 0.04);
    const f = flight(b);
    expect(f.x).toBeGreaterThan(0);
    expect(f.x).toBeLessThan(6.4);
    expect(Math.abs(f.z)).toBeLessThan(SINGLES);
    expect(f.clear).toBeGreaterThan(0);
  });

  it("a lob goes high", () => {
    const b = solveShot({ x: -10, y: 1, z: 0 }, HALF_L - 1.5, 0, 19, 0.4, 3, true);
    expect(b.vy / Math.hypot(b.vx, b.vz)).toBeGreaterThan(0.6);
  });
});

describe("the match", () => {
  it("AI against AI plays a match tiebreak out with rallies, points and a winner", () => {
    for (const seed of [1, 2, 3]) {
      const sim = make(seed);
      sim.autopilot = true;
      const events = run(sim, 900);
      expect(sim.phase).toBe("over");
      expect(sim.score.winner).toBeGreaterThanOrEqual(0);
      const hits = events.filter((e) => e.kind === "hit");
      expect(hits.length).toBeGreaterThan(20);
      const points = events.filter((e) => e.kind === "point");
      expect(points.length).toBeGreaterThanOrEqual(10);
      // Real rallies happen, not just aces and errors.
      expect(Math.max(...points.map((p) => (p.kind === "point" ? p.rally : 0)))).toBeGreaterThanOrEqual(3);
      expect(Number.isFinite(sim.matchScore())).toBe(true);
    }
  });

  it("if you never swing, you lose every point you don't serve an ace on", () => {
    const sim = make(4);
    const events = run(sim, 600, (s) => ({ ...NO_INPUT, serve: s.phase === "serve" || (s.phase === "toss" && s.tossT > 0.5) }));
    expect(sim.phase).toBe("over");
    expect(sim.score.winner).toBe(1);
    expect(events.some((e) => e.kind === "hit" && e.who === 0 && e.shot !== "serve")).toBe(false);
  });

  it("a well-timed swing with the assist on gets the ball back", () => {
    const sim = new TennisSim({ seed: 5, difficulty: "rookie", surface: "hard", format: "tiebreak", rival: RIVALS.men[0], autoRun: true });
    let returned = 0;
    run(sim, 300, (s) => {
      const b = s.ball;
      const near = s.phase === "rally" && b.vx < 0 && b.x < -6 && s.last === 1;
      const ev = { ...NO_INPUT, serve: s.phase === "serve" || (s.phase === "toss" && s.tossT > 0.5), shot: near && !s.players[0].armed ? ("topspin" as const) : null };
      return ev;
    }).forEach((e) => {
      if (e.kind === "hit" && e.who === 0 && e.shot !== "serve") returned++;
    });
    expect(returned).toBeGreaterThan(5);
  });
});
