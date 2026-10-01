import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import { BALL_R, contact, CricketSim, emptyInput, KINDS, launch, PITCH, predict, ropeDist, runTime, SWING_LAG, type CricketInput } from "./sim";
import { bowlers, TEAMS } from "./teams";

const match = (seed: number, over: Partial<ConstructorParameters<typeof CricketSim>[0]> = {}) =>
  new CricketSim({ teams: [TEAMS[0], TEAMS[1]], human: 0, batFirst: 0, overs: 20, difficulty: "pro", mode: "match", seed, ...over });

/** Step a sim; `drive` can change the input each frame. */
function run(sim: CricketSim, frames: number, drive?: (inp: CricketInput) => void) {
  const inp = emptyInput();
  const events: string[] = [];
  for (let i = 0; i < frames && sim.phase !== "done"; i++) {
    inp.shot = null;
    inp.bowl = false;
    inp.run = false;
    drive?.(inp);
    sim.step(1 / 60, inp);
    for (const e of sim.events) events.push(e.kind);
    sim.events.length = 0;
  }
  return events;
}

describe("teams", () => {
  it("has eight squads of eleven with five bowlers each", () => {
    expect(TEAMS).toHaveLength(8);
    for (const t of TEAMS) {
      expect(t.players).toHaveLength(11);
      expect(new Set(t.players.map((p) => p.name)).size).toBe(11);
      expect(bowlers(t)).toHaveLength(5);
      expect(t.players.filter((p) => p.role === "keeper")).toHaveLength(1);
    }
  });
});

describe("ball physics", () => {
  it("launches a delivery that pitches where it was aimed", () => {
    for (const kind of ["stock", "yorker", "bouncer", "legbreak"] as const) {
      const d = { kind, speed: KINDS[kind].speed, px: -0.3, pz: KINDS[kind].len, swing: KINDS[kind].swing, turn: 0, e: KINDS[kind].e, noBall: false };
      const p = { x: 0.6, y: 2.2, z: PITCH - 0.6 };
      const v = launch(p, d);
      // Integrate with gravity and swing only (what launch solves for).
      const dt = 1 / 2000;
      for (let i = 0; i < 4000 && p.y > BALL_R; i++) {
        v.x += d.swing * dt;
        v.y -= 9.81 * dt;
        p.x += v.x * dt;
        p.y += v.y * dt;
        p.z += v.z * dt;
      }
      expect(Math.abs(p.z - d.pz)).toBeLessThan(0.08);
      expect(Math.abs(p.x - d.px)).toBeLessThan(0.05);
    }
  });

  it("a big lofted hit clears the rope; a ground shot doesn't", () => {
    const six = predict({ x: 0, y: 0.8, z: 1.8 }, { x: 0, y: Math.sin(0.55) * 40, z: Math.cos(0.55) * 40 });
    expect(six.rope?.air).toBe(true);
    const ground = predict({ x: 0, y: 0.5, z: 1.8 }, { x: 0, y: -1, z: 22 });
    expect(ground.rope).toBeNull();
    const last = ground.samples[ground.samples.length - 1];
    expect(ropeDist(last.x, last.z)).toBeLessThan(1);
  });

  it("times shots: perfect is hit hard where aimed, way off misses, poor timing edges more", () => {
    const base = { xc: -0.2, yc: 0.6, len: 4, ballSpeed: 36, movement: 0, aim: -30, shot: "ground" as const, skill: 0.8 };
    const perfect = contact(createRng(3), { ...base, dt: 0 });
    expect(perfect.type).toBe("hit");
    expect(perfect.speed).toBeGreaterThan(30);
    expect(Math.abs(perfect.dir - -30)).toBeLessThan(20);
    expect(contact(createRng(3), { ...base, dt: 0.2 }).type).toBe("miss");
    let edges = [0, 0];
    for (let s = 0; s < 400; s++) {
      if (contact(createRng(s), { ...base, dt: 0 }).type === "edge") edges[0]++;
      if (contact(createRng(s), { ...base, dt: 0.11 }).type === "edge") edges[1]++;
    }
    expect(edges[1]).toBeGreaterThan(edges[0] * 4);
    edges = [0, 0];
    // Early goes to leg, late to off.
    expect(contact(createRng(9), { ...base, dt: -0.06 }).dir).toBeGreaterThan(contact(createRng(9), { ...base, dt: 0.06 }).dir);
  });

  it("running between the wickets takes longer for each run", () => {
    expect(runTime(1)).toBeGreaterThan(2.8);
    expect(runTime(2)).toBeGreaterThan(runTime(1) * 1.9);
  });
});

describe("matches", () => {
  it("plays out a whole T20 with believable numbers", () => {
    let runs = 0;
    let wkts = 0;
    for (let s = 1; s <= 6; s++) {
      const sim = match(s, { human: -1 });
      sim.simulateToEnd();
      expect(sim.phase).toBe("done");
      expect(sim.innings).toHaveLength(2);
      expect(sim.resultText).toMatch(/won by|tied/);
      for (const inn of sim.innings) {
        expect(inn.balls).toBeLessThanOrEqual(120);
        expect(inn.wkts).toBeLessThanOrEqual(10);
        const sum = inn.cards.reduce((a, c) => a + c.runs, 0) + inn.extras;
        expect(sum).toBe(inn.runs);
        runs += inn.runs;
        wkts += inn.wkts;
      }
      // The chase stops once the target is passed.
      const [a, b] = sim.innings;
      if (b.runs > a.runs) expect(b.runs - a.runs).toBeLessThanOrEqual(6);
    }
    expect(runs / 12).toBeGreaterThan(120);
    expect(runs / 12).toBeLessThan(230);
    expect(wkts / 12).toBeGreaterThan(3);
  });

  it("is deterministic for a seed", () => {
    const a = match(77, { human: -1, overs: 5 });
    const b = match(77, { human: -1, overs: 5 });
    a.simulateToEnd();
    b.simulateToEnd();
    expect(a.innings.map((i) => `${i.runs}/${i.wkts}`)).toEqual(b.innings.map((i) => `${i.runs}/${i.wkts}`));
  });

  it("a super over is one over, two wickets, chasing a target", () => {
    const sim = new CricketSim({ teams: [TEAMS[2], TEAMS[3]], human: 0, batFirst: 0, overs: 1, difficulty: "pro", mode: "superover", seed: 5, target: 15 });
    sim.simulateToEnd();
    expect(sim.innings).toHaveLength(1);
    const inn = sim.innings[0];
    expect(inn.balls <= 6 && inn.wkts <= 2).toBe(true);
    expect(sim.won).toBe(inn.runs >= 15);
  });
});

describe("you at the crease", () => {
  it("timing your shots well scores runs in the nets", () => {
    const sim = new CricketSim({ teams: [TEAMS[0], TEAMS[5]], human: 0, batFirst: 0, overs: 3, difficulty: "rookie", mode: "nets", seed: 11 });
    let pressed = false;
    run(sim, 60 * 400, (inp) => {
      if (sim.phase !== "delivery") pressed = false;
      // Press when the ball is one swing away from the bat.
      if (sim.phase === "delivery" && !pressed && sim.ball.z - sim.contactZ <= -sim.vel.z * SWING_LAG + 0.2) {
        inp.shot = "ground";
        pressed = true;
      }
      inp.aim = -20;
    });
    expect(sim.phase).toBe("done");
    expect(sim.innings[0].balls).toBe(18);
    expect(sim.humanRuns).toBeGreaterThan(10);
    expect(sim.score()).toBeGreaterThan(0);
  });

  it("never pressing means no runs off the bat", () => {
    const sim = new CricketSim({ teams: [TEAMS[0], TEAMS[5]], human: 0, batFirst: 0, overs: 1, difficulty: "pro", mode: "nets", seed: 2 });
    run(sim, 60 * 200);
    expect(sim.humanRuns).toBe(0);
  });
});

describe("you with the ball", () => {
  it("bowls where you aim with a good release, and oversteps past the meter", () => {
    const sim = match(4, { human: 1, batFirst: 0 });
    expect(sim.humanBowls).toBe(true);
    const good = sim.humanDelivery("yorker", { x: -0.1, z: 1.4 }, 0.84);
    expect(Math.hypot(good.px + 0.1, good.pz - 1.4)).toBeLessThan(0.05);
    expect(good.noBall).toBe(false);
    expect(sim.humanDelivery("stock", { x: -0.1, z: 6 }, 0.99).noBall).toBe(true);
    const wild = sim.humanDelivery("stock", { x: -0.1, z: 6 }, 0.3);
    expect(Math.hypot(wild.px + 0.1, wild.pz - 6)).toBeGreaterThan(0.1);
  });

  it("waits for you to run in, then the meter releases the ball", () => {
    const sim = match(6, { human: 1, batFirst: 0 });
    let frame = 0;
    const events = run(sim, 60 * 3, (inp) => {
      frame++;
      inp.kind = "yorker";
      inp.target = { x: -0.1, z: 1.4 };
      if (frame === 60) inp.bowl = true;
      if (sim.phase === "runup" && sim.meter > 0.83 && sim.meterLocked === null) inp.bowl = true;
    });
    expect(events).toContain("runup");
    expect(events).toContain("release");
    expect(sim.meterLocked).not.toBeNull();
    expect(Math.abs((sim.meterLocked ?? 0) - 0.84)).toBeLessThan(0.05);
  });
});
