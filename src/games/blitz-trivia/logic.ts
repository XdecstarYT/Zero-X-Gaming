import { createRng, type Rng } from "../engine/rng";
import { BANK, type TriviaCategory } from "./questions";

/**
 * Blitz Trivia rules: 60 seconds on the clock. Correct answers score
 * 100 + 25 × current streak (streak bonus capped at 8). Wrong answers break
 * the streak and cost 5 seconds. Pure and seeded; rendered by ./index.ts.
 */

export const ROUND_SECONDS = 60;
export const WRONG_PENALTY_S = 5;
export const BASE_POINTS = 100;
export const STREAK_BONUS = 25;
export const MAX_STREAK_BONUS_STEPS = 8;

export type CategoryChoice = TriviaCategory | "mixed";

export interface Question {
  category: TriviaCategory;
  prompt: string;
  choices: string[];
  answer: number;
}

export interface TriviaState {
  deck: Question[];
  index: number;
  timeLeft: number;
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  answered: number;
  over: boolean;
}

export interface AnswerResult {
  correct: boolean;
  points: number;
  answer: number;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(category: CategoryChoice, rng: Rng): Question[] {
  const cats = category === "mixed" ? (Object.keys(BANK) as TriviaCategory[]) : [category];
  const rows = cats.flatMap((c) => BANK[c].map((row) => ({ c, row })));
  return shuffle(rows, rng).map(({ c, row }) => {
    const [prompt, right, ...wrong] = row;
    const choices = shuffle([right, ...wrong], rng);
    return { category: c, prompt, choices, answer: choices.indexOf(right) };
  });
}

export function createTrivia(category: CategoryChoice, seed = Date.now()): TriviaState {
  return {
    deck: buildDeck(category, createRng(seed)),
    index: 0,
    timeLeft: ROUND_SECONDS,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answered: 0,
    over: false,
  };
}

export function current(s: TriviaState): Question | undefined {
  return s.deck[s.index];
}

export function pointsFor(streak: number) {
  return BASE_POINTS + STREAK_BONUS * Math.min(streak, MAX_STREAK_BONUS_STEPS);
}

export function answer(s: TriviaState, choice: number): AnswerResult | null {
  const q = current(s);
  if (s.over || !q) return null;
  s.answered++;
  let points = 0;
  const correct = choice === q.answer;
  if (correct) {
    points = pointsFor(s.streak);
    s.score += points;
    s.streak++;
    s.correct++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else {
    s.streak = 0;
    s.timeLeft = Math.max(0, s.timeLeft - WRONG_PENALTY_S);
  }
  s.index++;
  if (s.timeLeft <= 0 || s.index >= s.deck.length) s.over = true;
  return { correct, points, answer: q.answer };
}

export function tick(s: TriviaState, dt: number) {
  if (s.over) return;
  s.timeLeft = Math.max(0, s.timeLeft - dt);
  if (s.timeLeft <= 0) s.over = true;
}
