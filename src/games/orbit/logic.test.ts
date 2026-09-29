import { describe, expect, it } from "vitest";
import { createOrbit, delta, H, maxDebris, multiplier, score, SPAWN_SHIELD_S, step, W, type OrbitState } from "./logic";

const DT = 1 / 120;
const none = { turn: 0, targetHeading: null, boost: false };

/** Steers toward the nearest shard, dodging planets it's about to hit. */
function bot(s: OrbitState) {
  const p = s.probe;
  const target = s.shards.map((sh) => ({ sh, ...delta(p.x, p.y, sh.x, sh.y) })).sort((a, b) => a.d - b.d)[0];
  let heading = Math.atan2(target.dy, target.dx);
  for (const pl of s.planets) {
    const d = Math.hypot(pl.x - p.x, pl.y - p.y);
    if (d < pl.r + 70) heading = Math.atan2(p.y - pl.y, p.x - pl.x);
  }
  return { turn: 0, targetHeading: heading, boost: true };
}

describe("orbit", () => {
  it("is deterministic for a seed", () => {
    const a = createOrbit(11);
    const b = createOrbit(11);
    for (let i = 0; i < 1200; i++) {
      step(a, DT, bot(a));
      step(b, DT, bot(b));
    }
    expect(score(a)).toBe(score(b));
    expect(a.probe.x).toBeCloseTo(b.probe.x, 6);
  });

  it("places planets away from the spawn point", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = createOrbit(seed);
      expect(s.planets.length).toBeGreaterThanOrEqual(1);
      for (const p of s.planets) expect(Math.hypot(p.x - 120, p.y - H / 2)).toBeGreaterThan(200);
    }
  });

  it("wraps around the screen edges", () => {
    const s = createOrbit(2);
    s.planets = [];
    s.probe.x = W - 1;
    s.probe.vx = 400;
    step(s, 0.05, none);
    expect(s.probe.x).toBeLessThan(40);
  });

  it("planets pull the probe in, and touching one ends the run", () => {
    const s = createOrbit(4);
    s.debris = [];
    s.t = SPAWN_SHIELD_S + 0.01;
    const pl = s.planets[0];
    s.probe = { ...s.probe, x: pl.x + pl.r + 60, y: pl.y, vx: 0, vy: 0, heading: Math.PI };
    let events: string[] = [];
    for (let i = 0; i < 600 && !s.dead; i++) events = step(s, DT, { turn: 0, targetHeading: Math.PI, boost: false });
    expect(s.dead).toBe(true);
    expect(events).toContain("hit");
  });

  it("collecting shards scores and chains the multiplier", () => {
    const s = createOrbit(5);
    s.debris = [];
    const sh = s.shards[0];
    s.probe.x = sh.x;
    s.probe.y = sh.y;
    expect(step(s, DT, none)).toContain("shard");
    const next = s.shards[0];
    s.probe.x = next.x;
    s.probe.y = next.y;
    expect(step(s, DT, none)).toContain("combo");
    expect(multiplier(s)).toBe(2);
  });

  it("a spawn shield protects the first seconds of a run", () => {
    const s = createOrbit(8);
    const pl = s.planets[0];
    s.probe = { ...s.probe, x: pl.x + pl.r + 30, y: pl.y, vx: -300, vy: 0, heading: Math.PI };
    for (let i = 0; i < 120; i++) step(s, DT, { turn: 0, targetHeading: Math.PI, boost: true });
    expect(s.dead).toBe(false);
    expect(s.debris).toHaveLength(0);
    expect(Math.hypot(s.probe.x - pl.x, s.probe.y - pl.y)).toBeGreaterThanOrEqual(pl.r);
  });

  it("debris ramps up over time", () => {
    expect(maxDebris(0)).toBe(2);
    expect(maxDebris(60)).toBe(7);
    expect(maxDebris(1000)).toBe(10);
  });

  it("an aggressive bot stays under the server's 300 points/second limit", () => {
    let worst = 0;
    let longest = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const s = createOrbit(seed);
      while (!s.dead && s.t < 180) step(s, DT, bot(s));
      longest = Math.max(longest, s.t);
      if (s.t > 2) worst = Math.max(worst, score(s) / s.t);
    }
    expect(longest).toBeGreaterThan(10);
    expect(worst).toBeLessThan(300);
  });
});
