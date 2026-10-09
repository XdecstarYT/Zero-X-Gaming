/**
 * The money side of the country: inflation, interest rates (set by an independent central
 * bank, by the government, or by nobody, as the central-bank law says), a stock market index
 * and the country's credit rating. They feed back into growth, happiness and the budget.
 *
 * Works on sim.ts's state and seeded stream; nothing at the top level uses another module's
 * values (sim.ts imports this file and this file imports sim.ts).
 */
import { WEEKS } from "./data";
import * as G from "./sim";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const RATINGS = ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "B", "CCC"];
export const NEUTRAL_RATE = 2.5;
export const TARGET_INFLATION = 2;
/** Weeks between rate decisions you make yourself. */
export const RATE_GAP = 4;

export interface MarketPoint {
  w: number;
  inflation: number;
  rate: number;
  index: number;
}

export interface Markets {
  inflation: number;
  /** The central bank's rate, %. */
  rate: number;
  /** Where the economy started (changes are measured from here). */
  inflation0: number;
  rate0: number;
  /** The stock market index. */
  index: number;
  /** Index into RATINGS (0 is best). */
  rating: number;
  rating0: number;
  score0: number;
  ratingWeek: number;
  /** A price shock (an oil crisis…) working its way through. */
  shock: number;
  /** The rate the government has set (when it sets them), and when. */
  setAt: number;
  hist: MarketPoint[];
}

/** Who sets interest rates: the central-bank law's option (0 the government, 1 an independent bank, 2 nobody). */
export const rateSetter = (s: G.GameState) => s.laws.centralBank ?? 1;
export const canSetRate = (s: G.GameState) => rateSetter(s) === 0 && s.gov.head === s.you;

const debtRatio = (s: G.GameState) => s.stats.debt / Math.max(1, s.stats.gdp * 1000);
const deficitRatio = (s: G.GameState) => Math.max(0, -s.stats.budget) / Math.max(1, s.stats.gdp * 1000);
/** How worried lenders are (higher is worse). */
const riskScore = (s: G.GameState) => debtRatio(s) * 1.2 + deficitRatio(s) * 15;

export function initMarkets(s: G.GameState) {
  if (s.mk) return;
  const score = riskScore(s);
  const rating = clamp(Math.round(score * 0.9 - 0.5), 0, 6);
  const inflation = 2.2;
  s.mk = { inflation, rate: NEUTRAL_RATE, inflation0: inflation, rate0: NEUTRAL_RATE, index: 1000, rating, rating0: rating, score0: score, ratingWeek: s.week, shock: 0, setAt: -RATE_GAP, hist: [] };
}

/** What markets do to the economy this week (used by sim.ts's economy). */
export function marketFx(s: G.GameState) {
  const m = s.mk;
  if (!m) return { growth: 0, happiness: 0, budget: 0 };
  return {
    // Dear money slows things down.
    growth: -(m.rate - m.rate0) * 0.12,
    // Rising prices hurt.
    happiness: -Math.max(0, m.inflation - Math.max(3, m.inflation0)) * 0.8,
    // Interest on the debt (billions a year).
    budget: -(m.rate - m.rate0) * s.stats.debt * 0.0015,
  };
}

/** Crises that hit prices or the markets when they break. */
const CRISIS_SHOCK: Record<string, { inflation?: number; index?: number }> = { oil: { inflation: 1.8, index: -0.04 }, bank: { index: -0.1 }, pandemic: { inflation: -0.4, index: -0.06 }, drought: { inflation: 0.6 }, strike: { index: -0.015 }, cyber: { index: -0.02 }, techhq: { index: 0.03 }, storm: { inflation: 0.2 }, crash: { index: -0.2 }, foodPrices: { inflation: 1 }, quake: { index: -0.03 }, heatwave: { inflation: 0.2 } };

/** The markets' week (after the economy has moved). */
export function marketsWeek(s: G.GameState) {
  initMarkets(s);
  const m = s.mk;
  const st = s.stats;
  const e = s.sc.economy;
  const r = G.roll(s);
  // A crisis that broke this week.
  if (s.crisis && s.crisis.week === s.week) {
    const sh = CRISIS_SHOCK[s.crisis.id];
    if (sh?.inflation) m.shock += sh.inflation;
    if (sh?.index) m.index *= 1 + sh.index;
  }
  m.shock *= 0.95;
  // Inflation: the economy running hot, deficits, shocks, and dear money pulling it back.
  const setter = rateSetter(s);
  const target = TARGET_INFLATION + (st.growth - e.growth) * 0.7 + Math.max(0, deficitRatio(s) * 100 - 3) * 0.15 + m.shock - (m.rate - NEUTRAL_RATE) * 0.5 + (setter === 2 ? 1 : 0) + (m.inflation0 - TARGET_INFLATION);
  m.inflation = clamp(m.inflation + (target - m.inflation) * 0.06 + (r.next() - 0.5) * 0.06, -2, 25);
  // Interest rates.
  const prev = m.rate;
  const taylor = NEUTRAL_RATE + 1.5 * (m.inflation - TARGET_INFLATION) + 0.5 * (st.growth - e.growth);
  if (setter === 1) m.rate += (clamp(taylor, 0, 15) - m.rate) * 0.08;
  else if (setter === 0 && s.gov.head !== s.you) m.rate += (clamp(taylor - 0.75, 0, 15) - m.rate) * 0.08;
  else if (setter === 2) m.rate = clamp(m.rate + (r.next() - 0.45) * 0.2, 0, 20);
  m.rate = Math.round(m.rate * 100) / 100;
  // The stock market: growth, cheaper money, a little noise.
  const ret = (st.growth / 100 + 0.055) / WEEKS - (m.rate - prev) * 0.03 + (r.next() - 0.5) * 0.024;
  m.index = Math.max(50, m.index * (1 + ret));
  // The credit rating follows the debt and the deficit, a notch at a time.
  const want = clamp(m.rating0 + Math.round((riskScore(s) - m.score0) * 3), 0, RATINGS.length - 1);
  if (want !== m.rating && s.week - m.ratingWeek >= 12) {
    const down = want > m.rating;
    m.rating += down ? 1 : -1;
    m.ratingWeek = s.week;
    if (down) {
      st.approval = clamp(st.approval - 2, 5, 95);
      for (const p of s.gov.parties) s.parties[p].swing -= 0.01;
    }
    G.news(s, "economy", `Credit rating ${down ? "cut" : "raised"} to ${RATINGS[m.rating]}`, down ? -1 : 1);
  }
  m.hist.push({ w: s.week, inflation: Math.round(m.inflation * 100) / 100, rate: m.rate, index: Math.round(m.index) });
  if (m.hist.length > 260) m.hist.splice(0, m.hist.length - 260);
  if (m.inflation > 6 && G.weekOf(s.week) % 13 === 0) G.news(s, "economy", `Prices are rising ${m.inflation.toFixed(1)}% a year`, -1);
}

/** As head of a government that sets interest rates, set them (every few weeks at most). */
export function setRate(s: G.GameState, rate: number): string | null {
  const m = s.mk;
  if (!canSetRate(s)) return rateSetter(s) === 1 ? "The central bank is independent: it sets rates." : `Only the ${G.titles(s).head} can set rates.`;
  if (s.week - m.setAt < RATE_GAP) return `You can change rates again in ${RATE_GAP - (s.week - m.setAt)} weeks.`;
  const v = clamp(Math.round(rate * 4) / 4, 0, 15);
  if (v === m.rate) return "That's the rate already.";
  const up = v > m.rate;
  m.rate = v;
  m.setAt = s.week;
  G.news(s, "economy", `The government ${up ? "raises" : "cuts"} interest rates to ${v.toFixed(2)}%`, up ? 0 : 1);
  return null;
}
