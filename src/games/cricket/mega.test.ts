import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import { advance, caps, newLeague, nextFixture, quickInnings, recordPlayed, ROUNDS, simMine, table } from "./league";
import { CricketSim, emptyInput, PITCH, type SimEvent } from "./sim";
import { TEAMS, teamById } from "./teams";

const match = (seed: number, overs = 5, drs = true) => new CricketSim({ teams: [TEAMS[0], TEAMS[1]], human: -1, batFirst: 0, overs, difficulty: "pro", mode: "match", seed, drs });

/** Play a whole match headlessly, keeping every event. */
function playOut(sim: CricketSim) {
  const seen: SimEvent[] = [];
  const inp = emptyInput();
  inp.next = true;
  sim.autopilot = true;
  for (let i = 0; i < 2_000_000 && sim.phase !== "done"; i++) {
    sim.step(1 / 60, inp);
    seen.push(...sim.events);
    sim.events.length = 0;
  }
  return seen;
}

describe("powerplay", () => {
  it("covers the first 30% of the overs, in whole overs", () => {
    expect(match(1, 20).ppBalls).toBe(36);
    expect(match(1, 5).ppBalls).toBe(12);
    expect(match(1, 2).ppBalls).toBe(6);
  });

  it("keeps all but two fielders inside the circle", () => {
    const sim = match(2, 20);
    expect(sim.powerplay).toBe(true);
    for (const set of ["attack", "balanced", "defend"] as const) {
      sim.placeField(set);
      const out = sim.fielders.filter((f) => f.role === "field" && Math.hypot(f.x, f.z - PITCH / 2) > 27);
      expect(out.length).toBeLessThanOrEqual(2);
    }
  });

  it("announces the start and the end", () => {
    const sim = match(3, 2);
    const ev = playOut(sim);
    expect(ev.filter((e) => e.kind === "powerplay" && e.on).length).toBe(2);
    expect(ev.some((e) => e.kind === "powerplay" && !e.on)).toBe(true);
  });
});

describe("DRS and the wagon wheel", () => {
  it("reviews LBWs over a run of matches without losing count", () => {
    let offers = 0;
    let reviews = 0;
    let verdicts = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const sim = match(seed * 13, 5);
      const ev = playOut(sim);
      offers += ev.filter((e) => e.kind === "drs" && e.stage === "offer").length;
      reviews += ev.filter((e) => e.kind === "drs" && e.stage === "review").length;
      verdicts += ev.filter((e) => e.kind === "drs" && e.stage === "verdict").length;
      expect(sim.drs).toBeNull();
      for (const r of sim.reviews) expect(r).toBeGreaterThanOrEqual(0);
      // Every scoring shot is on the wagon wheel.
      for (const inn of sim.innings) {
        const fromShots = inn.shots.reduce((a, s) => a + s.runs, 0);
        expect(fromShots).toBeLessThanOrEqual(inn.runs);
        expect(inn.shots.length).toBeGreaterThan(0);
      }
    }
    expect(offers).toBeGreaterThan(0);
    expect(verdicts).toBe(reviews);
  });

  it("a review goes upstairs and gets a verdict", () => {
    // Find a decision on its way upstairs (the AI sides send theirs up straight away).
    for (let seed = 1; seed < 60; seed++) {
      const sim = match(seed, 5);
      sim.autopilot = true;
      const inp = emptyInput();
      inp.next = true;
      for (let i = 0; i < 400_000 && sim.phase !== "done" && sim.phase !== "review"; i++) {
        sim.step(1 / 60, inp);
        sim.events.length = 0;
      }
      if (sim.phase !== "review" || !sim.drs) continue;
      const c = sim.drs;
      sim.startReview();
      expect(sim.drs?.stage).toBe("review");
      const before = sim.inn.wkts;
      const ev: SimEvent[] = [];
      for (let i = 0; i < 600 && sim.phase === "review"; i++) {
        sim.step(1 / 60, inp);
        ev.push(...sim.events);
        sim.events.length = 0;
      }
      const v = ev.find((e) => e.kind === "drs" && e.stage === "verdict");
      expect(v).toBeTruthy();
      expect(sim.inn.wkts - before).toBe(c.truth ? 1 : 0);
      expect(c.path.length).toBeGreaterThan(5);
      expect(c.projected.length).toBeGreaterThan(1);
      return;
    }
    // Reviews are offered on close calls only; one is expected well before this.
    throw new Error("no review was offered");
  });

  it("is off online", () => {
    const sim = new CricketSim({ teams: [TEAMS[0], TEAMS[1]], human: 0, batFirst: 0, overs: 2, difficulty: "pro", mode: "match", seed: 1, versus: true });
    expect(sim.drsOn).toBe(false);
  });
});

describe("Blitz League", () => {
  it("draws seven rounds where everyone plays everyone once", () => {
    const L = newLeague({ team: TEAMS[0].id, overs: 5, seed: 7 });
    expect(L.fixtures).toHaveLength((TEAMS.length * (TEAMS.length - 1)) / 2);
    for (const t of TEAMS) {
      const mine = L.fixtures.filter((f) => f.a === t.id || f.b === t.id);
      expect(mine).toHaveLength(ROUNDS);
      expect(new Set(mine.map((f) => f.round)).size).toBe(ROUNDS);
    }
  });

  it("quick-sims T20 innings in a sensible range", () => {
    const r = createRng(3);
    const totals: number[] = [];
    for (let i = 0; i < 40; i++) totals.push(quickInnings(r, TEAMS[i % 8], TEAMS[(i + 3) % 8], 20).runs);
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(avg).toBeGreaterThan(120);
    expect(avg).toBeLessThan(220);
  });

  it("runs a whole season to a champion with caps", () => {
    const L = newLeague({ team: TEAMS[2].id, overs: 20, seed: 11 });
    for (let i = 0; i < 30 && L.stage !== "done"; i++) {
      if (nextFixture(L)) simMine(L);
      else advance(L);
    }
    expect(L.stage).toBe("done");
    expect(TEAMS.some((t) => t.id === L.champion)).toBe(true);
    const t = table(L);
    expect(t.reduce((a, r) => a + r.pts, 0)).toBe(L.fixtures.length * 2);
    expect(t.every((r) => r.p === ROUNDS)).toBe(true);
    expect(L.playoffs.map((f) => f.key)).toEqual(["SF1", "SF2", "F"]);
    // The semi-finalists were the top four.
    expect(new Set([L.playoffs[0].a, L.playoffs[0].b, L.playoffs[1].a, L.playoffs[1].b])).toEqual(new Set(t.slice(0, 4).map((r) => r.id)));
    const c = caps(L);
    expect(c.orange[0].runs).toBeGreaterThan(150);
    expect(c.purple[0].wkts).toBeGreaterThan(5);
  });

  it("records a match played in the stadium", () => {
    const L = newLeague({ team: TEAMS[0].id, overs: 2, seed: 5 });
    const f = nextFixture(L)!;
    const opp = teamById(f.a === L.team ? f.b : f.a);
    const sim = new CricketSim({ teams: [teamById(L.team), opp], human: 0, batFirst: 0, overs: 2, difficulty: "pro", mode: "match", seed: 9 });
    sim.simulateToEnd();
    recordPlayed(L, f, sim);
    advance(L);
    expect(f.result).toBeTruthy();
    expect(L.round).toBe(1);
    expect(L.fixtures.filter((x) => x.round === 0).every((x) => x.result)).toBe(true);
    const row = table(L).find((r) => r.id === L.team)!;
    expect(row.p).toBe(1);
  });
});
