import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import { BANK } from "./questions";
import { answer, buildDeck, createTrivia, current, pointsFor, ROUND_SECONDS, tick, WRONG_PENALTY_S } from "./logic";

describe("question bank", () => {
  it("has 4 unique choices per question and no duplicate prompts", () => {
    const prompts = new Set<string>();
    for (const rows of Object.values(BANK)) {
      expect(rows.length).toBeGreaterThanOrEqual(15);
      for (const [prompt, ...choices] of rows) {
        expect(new Set(choices).size).toBe(4);
        expect(prompts.has(prompt)).toBe(false);
        prompts.add(prompt);
      }
    }
  });

  it("shuffles choices but tracks the right answer", () => {
    for (const q of buildDeck("mixed", createRng(9))) {
      const row = BANK[q.category].find((r) => r[0] === q.prompt)!;
      expect(q.choices[q.answer]).toBe(row[1]);
    }
  });

  it("filters by category", () => {
    const deck = buildDeck("space", createRng(1));
    expect(deck.every((q) => q.category === "space")).toBe(true);
    expect(deck).toHaveLength(BANK.space.length);
  });
});

describe("blitz trivia round", () => {
  it("rewards streaks, caps the bonus, and resets on a miss", () => {
    expect(pointsFor(0)).toBe(100);
    expect(pointsFor(3)).toBe(175);
    expect(pointsFor(50)).toBe(300);
    const s = createTrivia("math", 1);
    expect(answer(s, current(s)!.answer)?.points).toBe(100);
    expect(answer(s, current(s)!.answer)?.points).toBe(125);
    const wrong = (current(s)!.answer + 1) % 4;
    expect(answer(s, wrong)).toMatchObject({ correct: false, points: 0 });
    expect(s.streak).toBe(0);
    expect(s.timeLeft).toBe(ROUND_SECONDS - WRONG_PENALTY_S);
    expect(s.score).toBe(225);
  });

  it("ends when time runs out or the deck is exhausted", () => {
    const a = createTrivia("mixed", 2);
    tick(a, ROUND_SECONDS + 1);
    expect(a.over).toBe(true);
    expect(answer(a, 0)).toBeNull();

    const b = createTrivia("tech", 3);
    while (!b.over) answer(b, current(b)!.answer);
    expect(b.correct).toBe(BANK.tech.length);
  });

  it("the theoretical max stays under the server limits (50,000 max, 1,000/s)", () => {
    const s = createTrivia("mixed", 4);
    while (!s.over) answer(s, current(s)!.answer);
    expect(s.score).toBeLessThan(50_000);
    // Even at an inhuman 0.5s per answer, the rate stays below 1,000/s.
    expect(s.score / (s.answered * 0.5)).toBeLessThan(1000);
  });
});
