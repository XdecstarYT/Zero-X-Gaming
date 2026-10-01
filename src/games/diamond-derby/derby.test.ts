import { describe, expect, it } from "vitest";
import { carry, DerbySim, fenceAt, flyPitch, FT, OUTS_PER_ROUND, PITCHES, ZONE, type DerbyEvent, type DerbyInput } from "./sim";

const DT = 1 / 60;
const IDLE: DerbyInput = { aimZ: 0, aimY: 0.8, swing: false };
const run = (sim: DerbySim, seconds: number, input: (s: DerbySim) => DerbyInput = () => IDLE) => {
  const events: DerbyEvent[] = [];
  for (let t = 0; t < seconds && sim.phase !== "over"; t += DT) {
    sim.step(DT, input(sim));
    events.push(...sim.events);
    sim.events.length = 0;
  }
  return events;
};

describe("ballpark physics", () => {
  it("carries like a real ball: 105 mph at 28° is a ~420 ft homer, 80 mph isn't", () => {
    expect(carry(105, 28)).toBeGreaterThan(395);
    expect(carry(105, 28)).toBeLessThan(450);
    expect(carry(80, 28)).toBeLessThan(330);
    expect(carry(105, 5)).toBeLessThan(carry(105, 28));
  });

  it("fences are 330 ft down the lines and 400 to centre", () => {
    expect(fenceAt(0) / FT).toBeCloseTo(400);
    expect(fenceAt(Math.PI / 4) / FT).toBeCloseTo(330);
  });

  it("every pitch type can be thrown for a strike", () => {
    for (const type of Object.keys(PITCHES) as (keyof typeof PITCHES)[]) {
      const sim = new DerbySim({ seed: 7, difficulty: "pro" });
      (sim as unknown as { nextPitchType: string }).nextPitchType = type;
      (sim as unknown as { release: () => void }).release();
      const p = sim.pitch!;
      expect(p.type).toBe(type);
      const end = flyPitch({ ...p });
      expect(Math.abs(end.z - p.plate.z)).toBeLessThan(0.02);
      expect(end.t).toBeGreaterThan(0.35);
      expect(end.t).toBeLessThan(0.65);
    }
  });
});

describe("the derby", () => {
  it("autopilot plays a whole derby: homers, outs, rounds and a finish", () => {
    let homers = 0;
    for (const seed of [1, 2, 3]) {
      const sim = new DerbySim({ seed, difficulty: "pro", autopilot: true });
      const events = run(sim, 1500);
      expect(sim.phase).toBe("over");
      homers += events.filter((e) => e.kind === "homer").length;
      expect(events.filter((e) => e.kind === "round").length).toBeGreaterThanOrEqual(1);
      expect(events.some((e) => e.kind === "over")).toBe(true);
      expect(Number.isFinite(sim.score())).toBe(true);
      expect(sim.score()).toBeLessThanOrEqual(20000);
    }
    expect(homers).toBeGreaterThan(5);
  });

  it("taking strikes costs outs; never swinging loses the round", () => {
    const sim = new DerbySim({ seed: 4, difficulty: "rookie" });
    const events = run(sim, 400);
    expect(events.filter((e) => e.kind === "take").length).toBeGreaterThanOrEqual(OUTS_PER_ROUND);
    expect(events.some((e) => e.kind === "homer")).toBe(false);
    expect(sim.phase).toBe("over");
    expect(sim.champion).toBe(false);
  });

  it("a perfectly timed swing on the ball is barrelled", () => {
    const sim = new DerbySim({ seed: 5, difficulty: "pro" });
    let contact: DerbyEvent | undefined;
    for (let i = 0; i < 2000 && !contact; i++) {
      const p = sim.pitch;
      const swing = !!p && sim.phase === "pitch" && p.strike && p.t >= p.plate.t - 0.15 - DT / 2;
      sim.step(DT, { aimZ: p?.plate.z ?? 0, aimY: (p?.plate.y ?? 0.8) - 0.03, swing });
      contact = sim.events.find((e) => e.kind === "contact");
      sim.events.length = 0;
    }
    expect(contact).toBeDefined();
    if (contact?.kind === "contact") expect(contact.ev).toBeGreaterThan(95);
  });

  it("aim stays near the zone", () => {
    const sim = new DerbySim({ seed: 1, difficulty: "pro" });
    sim.step(DT, { aimZ: 9, aimY: -9, swing: false });
    expect(sim.aim.z).toBeLessThanOrEqual(ZONE.half * 1.6);
    expect(sim.aim.y).toBeGreaterThanOrEqual(ZONE.lo - 0.25);
  });
});
