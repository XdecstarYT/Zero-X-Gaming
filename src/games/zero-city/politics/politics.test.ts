import { describe, expect, it } from "vitest";
import type { Stats } from "../sim/sim";
import {
  advance,
  canAfford,
  CREDIT,
  decide,
  ledger,
  makePromise,
  net,
  newPolitics,
  normalisePolitics,
  overall,
  propose,
  setTax,
  shares,
  simPolicy,
  START_CASH,
  TERM_MINUTES,
  townHall,
  type CityFacts,
  type PoliticsState,
} from "./politics";

const START = 8 * 60;

function stats(o: Partial<Stats> = {}): Stats {
  return {
    population: 2_000,
    jobs: 1_100,
    workers: 1_000,
    unemployed: 40,
    demand: { R: 0.3, C: 0.2, I: 0.2, M: 0.25 },
    buildings: 200,
    cars: 100,
    peds: 50,
    congestion: 0.15,
    power: true,
    water: true,
    staff: 60,
    coverage: { police: 0.85, fire: 0.85, clinic: 0.8, school: 0.8, park: 0.7 },
    pollution: 0.04,
    cJobs: 600,
    iJobs: 400,
    ...o,
  };
}
const facts = (o: Partial<CityFacts> = {}): CityFacts => ({ roadKm: 6, services: { police: 1, fire: 1, clinic: 1, school: 1, power: 1, water: 1, park: 2 }, lines: 2, residents: 2_000, cJobs: 600, iJobs: 400, ...o });

/** Play a whole term hour by hour, answering every dilemma with `pick`. */
function playTerm(s: PoliticsState, st: Stats, f: CityFacts, pick: "a" | "b" | null = "a") {
  const events = [];
  for (let m = s.termStart + 60; m <= s.termStart + TERM_MINUTES + 60 && s.status === "office"; m += 60) {
    const ev = advance(s, m, st, f);
    events.push(...ev);
    if (pick && s.dilemma) decide(s, pick);
    if (ev.some((e) => e.t === "election")) break;
  }
  return events;
}

describe("politics", () => {
  it("taxes and policies steer the sim: dear taxes cool demand, heritage caps height, free buses thin traffic", () => {
    const s = newPolitics(1, START);
    expect(simPolicy(s).bias.R).toBeCloseTo(0);
    setTax(s, "R", 0.18);
    expect(simPolicy(s).bias.R).toBeLessThan(-0.1);
    setTax(s, "C", 0.5);
    expect(s.taxes.C).toBe(0.2);
    s.policies = ["heritage", "freeTransit", "bikeLanes"];
    const p = simPolicy(s);
    expect(p.maxTier).toBe(3);
    expect(p.carShare).toBeCloseTo(0.675);
  });

  it("the budget: taxes in, upkeep out, a healthy city of 2,000 runs a surplus", () => {
    const s = newPolitics(1, START);
    const l = ledger(s, facts());
    expect(l.income.R).toBe(Math.round(2_000 * 0.1 * 26));
    expect(l.upkeep.services).toBe(500 + 500 + 700 + 800 + 900 + 400 + 2 * 80);
    expect(net(l)).toBeGreaterThan(0);
    // Twice the tax, about twice the income.
    setTax(s, "R", 0.2);
    expect(ledger(s, facts()).income.R).toBe(Math.round(2_000 * 0.2 * 26));
  });

  it("a well-run city re-elects its mayor; the council is reseated by vote share", () => {
    const s = newPolitics(3, START);
    const ev = playTerm(s, stats(), facts());
    expect(ev.some((e) => e.t === "campaign")).toBe(true);
    expect(ev.some((e) => e.t === "dilemma")).toBe(true);
    const el = ev.find((e) => e.t === "election");
    expect(el && el.t === "election" && el.result.won).toBe(true);
    expect(s.term).toBe(2);
    expect(s.council).toHaveLength(7);
    expect(net(s.ledger)).toBeGreaterThan(1_000);
    expect(s.polls.length).toBeGreaterThan(3);
  });

  it("a city with no jobs, no services, crushing taxes and an empty treasury throws the mayor out", () => {
    const s = newPolitics(4, START);
    setTax(s, "R", 0.2);
    setTax(s, "C", 0.2);
    setTax(s, "I", 0.2);
    s.cash = -20_000;
    const bad = stats({ unemployed: 600, congestion: 0.7, coverage: { police: 0, fire: 0, clinic: 0, school: 0, park: 0 }, pollution: 0.4, demand: { R: -0.6, C: -0.3, I: -0.3, M: -0.4 } });
    const ev = playTerm(s, bad, facts({ services: { power: 1 }, lines: 0 }), "b");
    const el = ev.find((e) => e.t === "election");
    expect(el && el.t === "election" && el.result.won).toBe(false);
    expect(s.status).toBe("ousted");
    // Nothing more happens out of office.
    expect(advance(s, s.termStart + TERM_MINUTES * 2, bad, facts())).toEqual([]);
  });

  it("the council passes what its members' voters like and blocks what they hate", () => {
    const s = newPolitics(5, START);
    s.council = ["greens", "greens", "greens", "families", "families", "workers", "business"];
    expect(propose(s, "cleanAir", true).passed).toBe(true);
    expect(s.policies).toContain("cleanAir");
    s.council = ["business", "business", "business", "business", "seniors", "seniors", "workers"];
    const r = propose(s, "rentCap", true);
    expect(r.passed).toBe(false);
    expect(r.votes).toHaveLength(7);
    expect(s.policies).not.toContain("rentCap");
    // Repeal goes through the council too.
    expect(propose(s, "cleanAir", false).passed).toBe(true);
    expect(s.policies).not.toContain("cleanAir");
  });

  it("dilemmas cost money and move feelings; town halls cheer people up once a day", () => {
    const s = newPolitics(6, START);
    s.dilemma = "stadium";
    const before = s.cash;
    decide(s, "a");
    expect(s.cash).toBe(before - 12_000);
    expect(s.mood.business).toBe(10);
    expect(s.mood.greens).toBe(-6);
    expect(s.dilemma).toBeNull();
    expect(townHall(s, START)).toBe(true);
    expect(townHall(s, START + 60)).toBe(false);
    expect(s.mood.workers).toBe(4 + 6);
  });

  it("a kept promise wins votes; a broken one costs more", () => {
    const run = (unemployed: number) => {
      const s = newPolitics(7, START);
      makePromise(s, "jobs", 2_000, 2);
      const ev = playTerm(s, stats({ unemployed }), facts(), null);
      const el = ev.find((e) => e.t === "election");
      return el && el.t === "election" ? el.result.byFaction.workers : 0;
    };
    // Same city either way except unemployment just under / over the promise line.
    expect(run(50)).toBeGreaterThan(run(70) + 0.05);
  });

  it("the treasury has a credit line, and old saves fill in", () => {
    const s = newPolitics(8, START);
    expect(canAfford(s, START_CASH + CREDIT)).toBe(true);
    expect(canAfford(s, START_CASH + CREDIT + 1)).toBe(false);
    const n = normalisePolitics({ cash: 5, taxes: { R: 0.05 } as never }, START);
    expect(n.cash).toBe(5);
    expect(n.taxes).toEqual({ R: 0.05, C: 0.1, I: 0.1 });
    const sh = shares(stats());
    expect(Object.values(sh).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(overall(s.approval, sh)).toBeCloseTo(58);
  });
});
