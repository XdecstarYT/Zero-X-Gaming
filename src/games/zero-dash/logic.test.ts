import { describe, expect, it } from "vitest";
import {
  createDash,
  GROUND_Y,
  MAX_MULTIPLIER,
  multiplier,
  PLAYER_SIZE,
  PLAYER_X,
  score,
  step,
  type DashState,
} from "./logic";

const DT = 1 / 120;
const idle = { pressed: false, held: false };

function run(
  s: DashState,
  seconds: number,
  policy: (s: DashState) => { pressed: boolean; held: boolean } = () => idle,
) {
  for (let i = 0; i < seconds / DT && !s.dead; i++) step(s, DT, policy(s));
  return s;
}

/** Jumps late (tight) when the next obstacle is close; a decent player. */
const bot = (s: DashState) => {
  const next = s.obstacles.find((o) => o.x + o.w >= PLAYER_X);
  const gap = next ? next.x - (PLAYER_X + PLAYER_SIZE) : Infinity;
  const needHold = !!next && (next.h > 60 || next.w > 60);
  const trigger = Math.max(40, s.speed * 0.09);
  return { pressed: s.onGround && gap < trigger && gap > 0, held: needHold };
};

describe("zero dash", () => {
  it("is deterministic for a seed", () => {
    const a = run(createDash(42), 10, bot);
    const b = run(createDash(42), 10, bot);
    expect(score(a)).toBe(score(b));
    expect(a.distance).toBe(b.distance);
  });

  it("dies when the player never jumps", () => {
    const s = run(createDash(1), 30);
    expect(s.dead).toBe(true);
    expect(score(s)).toBeGreaterThan(0);
  });

  it("jumps from the ground and lands again", () => {
    const s = createDash(7);
    const events = step(s, DT, { pressed: true, held: false });
    expect(events).toContain("jump");
    expect(s.onGround).toBe(false);
    let landed = false;
    for (let i = 0; i < 240 && !landed; i++) landed = step(s, DT, idle).includes("land");
    expect(landed).toBe(true);
    expect(s.y).toBe(GROUND_Y - PLAYER_SIZE);
  });

  it("holding jump goes higher than tapping", () => {
    const peak = (held: boolean) => {
      const s = createDash(3);
      step(s, DT, { pressed: true, held });
      let top = s.y;
      for (let i = 0; i < 200; i++) {
        step(s, DT, { pressed: false, held });
        top = Math.min(top, s.y);
      }
      return GROUND_Y - PLAYER_SIZE - top;
    };
    expect(peak(true)).toBeGreaterThan(peak(false) * 1.3);
  });

  it("buffers a jump pressed just before landing", () => {
    const s = createDash(5);
    step(s, DT, { pressed: true, held: false });
    while (s.vy <= 0 || s.y < GROUND_Y - PLAYER_SIZE - 10) step(s, DT, idle);
    step(s, DT, { pressed: true, held: false }); // still airborne
    let rejumped = false;
    for (let i = 0; i < 12 && !rejumped; i++) rejumped = step(s, DT, idle).includes("jump");
    expect(rejumped).toBe(true);
  });

  it("caps the multiplier", () => {
    expect(multiplier({ combo: 0 })).toBe(1);
    expect(multiplier({ combo: 3 })).toBe(2);
    expect(multiplier({ combo: 999 })).toBe(MAX_MULTIPLIER);
  });

  it("a good player survives, and score rate stays under the server's plausibility limit (250/s)", () => {
    let worstRate = 0;
    let longest = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = createDash(seed);
      let t = 0;
      while (!s.dead && t < 180) {
        step(s, DT, bot(s));
        t += DT;
      }
      longest = Math.max(longest, t);
      if (t > 1) worstRate = Math.max(worstRate, score(s) / t);
    }
    expect(longest).toBeGreaterThan(20);
    expect(worstRate).toBeLessThan(250);
  });
});
