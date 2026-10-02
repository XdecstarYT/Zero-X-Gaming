import { describe, expect, it } from "vitest";
import { COURSES, heightAt, holesOf, lieAt, type Hole } from "./course";
import { BallPhysics, CLUBS, GolfSim, PUTTER, callFor, puttSpeed, shotParams, stableford, yardage } from "./sim";

const flatGreen = (): Hole => {
  const h = holesOf(COURSES[1])[0];
  return { ...h, trees: [] };
};

describe("courses", () => {
  it("build the same holes every time, each a playable hole", () => {
    for (const c of COURSES) {
      const hs = holesOf(c);
      expect(hs.map((h) => h.par)).toEqual(c.pars);
      expect(hs.reduce((a, h) => a + h.par, 0)).toBe(36);
      for (const h of hs) {
        expect(lieAt(h, h.tee.x, h.tee.z + 0.5)).toBe("tee");
        expect(lieAt(h, h.pin.x, h.pin.z)).toBe("green");
        const range = h.par === 3 ? [120, 210] : h.par === 4 ? [290, 420] : [430, 540];
        expect(h.length).toBeGreaterThan(range[0]);
        expect(h.length).toBeLessThan(range[1]);
        expect(Number.isFinite(heightAt(h, h.pin.x, h.pin.z))).toBe(true);
      }
    }
  });

  it("has fairway in the landing zone of a par 4", () => {
    const h = holesOf(COURSES[0]).find((x) => x.par === 4)!;
    const p = h.path[Math.round(h.path.length * 0.5)];
    expect(["fairway", "bunker"]).toContain(lieAt(h, p.x, p.z));
  });
});

describe("ball flight", () => {
  it("the yardage book runs driver longest to lob wedge shortest", () => {
    const carries = CLUBS.slice(0, PUTTER).map((c) => yardage(c).carry);
    for (let i = 1; i < carries.length; i++) expect(carries[i]).toBeLessThan(carries[i - 1]);
    expect(carries[0]).toBeGreaterThan(210);
    expect(carries[0]).toBeLessThan(260);
    expect(yardage(CLUBS[6]).carry).toBeGreaterThan(130); // 7 iron
    expect(yardage(CLUBS[6]).carry).toBeLessThan(165);
    expect(yardage(CLUBS[0], 0.5).carry).toBeLessThan(yardage(CLUBS[0]).carry * 0.65);
  });

  const fly = (tilt: number, wind = { x: 0, z: 0 }) => {
    const h = { ...holesOf(COURSES[0])[0], trees: [], ponds: [], bunkers: [], sea: 0, hills: 0 };
    const ph = new BallPhysics(h, 1);
    ph.wind = wind;
    ph.place(0, 0);
    const s = shotParams(CLUBS[6], 1, 0, "fairway");
    ph.launch(s.speed, 0, s.launch, s.spin, tilt);
    for (let i = 0; i < 3000 && ph.ball.state !== "rest"; i++) ph.step(1 / 60);
    return ph;
  };

  it("curves with a tilted spin axis: + right (−x from behind), − left", () => {
    const straight = fly(0).ball.p.x;
    const slice = fly(0.4).ball.p.x;
    const hook = fly(-0.4).ball.p.x;
    expect(Math.abs(straight)).toBeLessThan(1.5);
    expect(slice).toBeLessThan(-8);
    expect(hook).toBeGreaterThan(8);
  });

  it("goes further downwind and shorter into it", () => {
    const calm = fly(0).landed!.z;
    const down = fly(0, { x: 0, z: 8 }).landed!.z;
    const into = fly(0, { x: 0, z: -8 }).landed!.z;
    expect(down).toBeGreaterThan(calm + 5);
    expect(into).toBeLessThan(calm - 8);
  });

  it("putts roll about as far as the meter says on a flat green, and drop in the cup", () => {
    const h = flatGreen();
    const flat: Hole = { ...h, slope: { x: 0, z: 0 }, hills: 0 };
    // Down the green's middle, aimed at the pin from 5 m.
    const ph = new BallPhysics(flat, 2);
    const from = { x: flat.pin.x, z: flat.pin.z - 3 };
    ph.place(from.x, from.z);
    ph.roll(puttSpeed(3.3), Math.atan2(flat.pin.x - ph.ball.p.x, flat.pin.z - ph.ball.p.z));
    for (let i = 0; i < 2000 && ph.ball.state !== "rest"; i++) ph.step(1 / 60);
    expect(ph.ball.holed).toBe(true);
    // Too firm and it skids over.
    const ph2 = new BallPhysics(flat, 2);
    ph2.place(from.x, from.z);
    ph2.roll(puttSpeed(14), Math.atan2(flat.pin.x - ph2.ball.p.x, flat.pin.z - ph2.ball.p.z));
    for (let i = 0; i < 2000 && ph2.ball.state !== "rest"; i++) ph2.step(1 / 60);
    expect(ph2.ball.holed).toBe(false);
  });
});

describe("rounds", () => {
  it("scores holes like golfers do", () => {
    expect(callFor(1, 3)).toBe("Hole in one!");
    expect(callFor(3, 5)).toBe("Eagle!");
    expect(callFor(3, 4)).toBe("Birdie");
    expect(callFor(6, 4)).toBe("Double bogey");
    expect(stableford(4, 4)).toBe(2);
    expect(stableford(3, 4)).toBe(3);
    expect(stableford(7, 4)).toBe(0);
  });

  it("the caddie picks the driver off a par 5 tee and the putter on the green", () => {
    const sim = new GolfSim({ course: COURSES[0], mode: "stroke", holes: 9, start: 2, difficulty: "pro", seed: 5 });
    expect(sim.hole.par).toBe(5);
    expect(sim.clubDef.name).toBe("Driver");
    sim.phys.place(sim.hole.pin.x + 3, sim.hole.pin.z);
    sim.strokes = 2;
    (sim as unknown as { ready: () => void }).ready();
    expect(sim.lie).toBe("green");
    expect(sim.putting).toBe(true);
  });

  it("a three-press swing hits the ball", () => {
    const sim = new GolfSim({ course: COURSES[1], mode: "stroke", holes: 3, difficulty: "amateur", seed: 9 });
    const none = { aim: 0, club: 0, press: false };
    sim.step(1 / 60, { ...none, press: true });
    expect(sim.phase).toBe("swing");
    for (let i = 0; i < 300 && sim.meter.value < 0.9; i++) sim.step(1 / 60, none);
    sim.step(1 / 60, { ...none, press: true });
    expect(sim.meter.stage).toBe(2);
    for (let i = 0; i < 300 && sim.meter.value > 0.01; i++) sim.step(1 / 60, none);
    sim.step(1 / 60, { ...none, press: true });
    expect(sim.meter.stage).toBe(3);
    for (let i = 0; i < 120 && sim.phase === "swing"; i++) sim.step(1 / 60, none);
    expect(sim.phase).toBe("flight");
    expect(sim.strokes).toBe(1);
    for (let i = 0; i < 2000 && sim.phase === "flight"; i++) sim.step(1 / 60, none);
    expect(sim.lastShot!.carry).toBeGreaterThan(150);
  });

  it("water costs a shot and a drop outside it", () => {
    const course = COURSES[1];
    const idx = holesOf(course).findIndex((h) => h.ponds.length > 0);
    expect(idx).toBeGreaterThanOrEqual(0);
    const sim = new GolfSim({ course, mode: "stroke", holes: 1, start: idx, difficulty: "pro", seed: 3 });
    const pond = sim.hole.ponds[0];
    // Drop it straight in from above.
    sim.strokes = 1;
    sim.phys.place(pond.x, pond.z);
    sim.phys.ball.p.y += 5;
    sim.phys.launch(1, 0, -Math.PI / 2, 0, 0);
    sim.phase = "flight";
    for (let i = 0; i < 600 && sim.phase === "flight"; i++) sim.step(1 / 60, { aim: 0, club: 0, press: false });
    expect(sim.strokes).toBe(2);
    expect(sim.events.some((e) => e.kind === "penalty")).toBe(true);
    expect(lieAt(sim.hole, sim.ball.p.x, sim.ball.p.z)).not.toBe("water");
  });

  it("the autopilot plays nine holes in a believable score", { timeout: 120_000 }, () => {
    for (const course of COURSES) {
      const sim = new GolfSim({ course, mode: "stroke", holes: 9, difficulty: "pro", seed: 11 });
      sim.simulateToEnd();
      expect(sim.phase).toBe("over");
      expect(sim.field[0].card).toHaveLength(9);
      const total = sim.field[0].card.reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(27);
      expect(total).toBeLessThan(60);
      expect(sim.score()).toBeGreaterThan(0);
      expect(sim.standings()).toHaveLength(12);
    }
  });

  it("closest to the pin hits five balls at a par 3", () => {
    const sim = new GolfSim({ course: COURSES[0], mode: "ctp", holes: 1, difficulty: "pro", seed: 2 });
    expect(sim.hole.par).toBe(3);
    sim.simulateToEnd();
    expect(sim.phase).toBe("over");
    expect(sim.ctp).toHaveLength(5);
    expect(sim.score()).toBeGreaterThan(0);
  });
});
