import { describe, expect, it } from "vitest";
import type { Stats } from "../sim/sim";
import * as M from "./mandate";
import { callVote, draftBill, forecast, afterElection } from "./parliament";
import { CHAMBER, newPolitics, normalisePolitics, PARTIES, TERM_MINUTES, type ElectionResult, type PoliticsState } from "./politics";

const START = 8 * 60;

function stats(o: Partial<Stats> = {}): Stats {
  return {
    population: 3_000,
    jobs: 1_600,
    workers: 1_500,
    unemployed: 60,
    demand: { R: 0.3, C: 0.2, I: 0.2, M: 0.25 },
    buildings: 300,
    cars: 100,
    peds: 50,
    congestion: 0.15,
    power: true,
    water: true,
    staff: 60,
    coverage: { police: 0.85, fire: 0.85, clinic: 0.8, school: 0.8, park: 0.7 },
    pollution: 0.04,
    cJobs: 900,
    iJobs: 700,
    tourists: 0,
    fires: 0,
    roadCondition: 1,
    roadworks: 0,
    poorRoads: 0,
    ...o,
  };
}

/** A town in three neighbourhoods: homes to the west, shops in the middle, industry to the east. */
function town(): M.LotPoint[] {
  const pts: M.LotPoint[] = [];
  for (let i = 0; i < 40; i++) pts.push({ x: -600 + (i % 8) * 20, z: Math.floor(i / 8) * 20, pop: 40, zone: "R", tier: 2 });
  for (let i = 0; i < 30; i++) pts.push({ x: (i % 6) * 20, z: Math.floor(i / 6) * 20, pop: 60, zone: "C", tier: 3 });
  for (let i = 0; i < 30; i++) pts.push({ x: 600 + (i % 6) * 20, z: Math.floor(i / 6) * 20, pop: 50, zone: "I", tier: 2 });
  return pts;
}

/** A politics state with the town mapped into districts. */
function mapped(seed = 3): PoliticsState {
  const s = newPolitics(seed, START);
  s.m.districts = M.makeDistricts(seed, town());
  s.m.dstats = M.districtStats(s.m.districts, town());
  return s;
}

describe("Mandate: districts", () => {
  it("cuts the city into named districts that share the fifteen seats by population, the same way every time", () => {
    const ds = M.makeDistricts(7, town());
    expect(ds.length).toBe(2);
    expect(ds.reduce((n, d) => n + d.seats, 0)).toBe(CHAMBER);
    expect(new Set(ds.map((d) => d.name)).size).toBe(ds.length);
    expect(ds.every((d) => d.seats >= 1)).toBe(true);
    expect(M.makeDistricts(7, town())).toEqual(ds);
    // A bigger town gets more districts; a hamlet gets none yet.
    const big = Array.from({ length: 900 }, (_, i) => ({ x: (i % 30) * 30, z: Math.floor(i / 30) * 30, pop: 20, zone: "R" as const, tier: 2 }));
    expect(M.makeDistricts(7, big).length).toBe(6);
    expect(M.makeDistricts(7, town().slice(0, 5))).toEqual([]);
    expect(M.makeDistricts(7, big).find((d) => d.name === 0)).toBeTruthy();
  });

  it("knows who lives where: industrial districts are workers', commercial ones business'", () => {
    const pts = town();
    const ds = [
      { id: 0, name: 0, cx: -560, cz: 40, seats: 5 },
      { id: 1, name: 1, cx: 50, cz: 40, seats: 5 },
      { id: 2, name: 2, cx: 650, cz: 40, seats: 5 },
    ];
    const st = M.districtStats(ds, pts);
    expect(st[2].mix.workers).toBeGreaterThan(0.6);
    expect(st[1].mix.business).toBeGreaterThan(0.5);
    expect(st[0].mix.families).toBeGreaterThan(0.25);
    for (const d of st) expect(Object.values(d.mix).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("apportions seats by largest remainder, with or without a floor", () => {
    expect(M.apportion([10, 5, 1], 15)).toEqual([9, 5, 1]);
    expect(M.apportion([10, 5, 1], 15).reduce((a, b) => a + b, 0)).toBe(15);
    expect(M.apportion([0.5, 0.3, 0.15, 0.04, 0.01], 5, false)).toEqual([3, 1, 1, 0, 0]);
  });
});

describe("Mandate: votes and polls", () => {
  it("a district votes by how its groups feel, and your ground game there moves it", () => {
    const mix = { workers: 0.6, business: 0.1, families: 0.1, greens: 0.1, seniors: 0.1 };
    const cold = M.supportIn({ workers: 30, business: 50, families: 50, greens: 50, seniors: 50 }, mix);
    const warm = M.supportIn({ workers: 70, business: 50, families: 50, greens: 50, seniors: 50 }, mix);
    expect(PARTIES.reduce((n, p) => n + cold[p], 0)).toBeCloseTo(1);
    expect(warm.civic).toBeGreaterThan(cold.civic + 0.2);
    expect(cold.labour).toBeGreaterThan(cold.enterprise);
    expect(M.supportIn({ workers: 50, business: 50, families: 50, greens: 50, seniors: 50 }, mix, 10).civic).toBeGreaterThan(M.supportIn({ workers: 50, business: 50, families: 50, greens: 50, seniors: 50 }, mix).civic);
  });

  it("the projection returns every district's seats; the city poll weighs districts by people", () => {
    const s = mapped();
    const pr = M.projection(s);
    expect(pr.length).toBe(s.m.districts.length);
    expect(pr.reduce((n, d) => n + PARTIES.reduce((k, p) => k + d.seats[p], 0), 0)).toBe(CHAMBER);
    const poll = M.cityPoll(s, stats());
    expect(PARTIES.reduce((n, p) => n + poll[p], 0)).toBeCloseTo(1);
  });

  it("members whose district hates a law rebel unless whipped; the whip costs capital and goodwill", () => {
    const s = mapped();
    // Put a disloyal member in the industrial (workers') district.
    const workersD = s.m.dstats.reduce((a, b) => (b.mix.workers > a.mix.workers ? b : a)).id;
    const mp = s.m.mps.find((x) => x.party === "civic")!;
    mp.district = workersD;
    const pol = s.m.roster.find((p) => p.id === mp.pol)!;
    pol.loyalty = 20;
    pol.trait = "firebrand";
    expect(M.rebels(s, "cleanAir", true).map((x) => x.id)).toEqual([mp.id]);
    draftBill(s, "cleanAir", true);
    expect(forecast(s, "cleanAir", true).votes.find((v) => v.party === "civic")!.yes).toBe(s.parl.seats.civic - 1);
    s.parl.capital = 50;
    expect(M.whip(s)).toBe(true);
    expect(s.parl.capital).toBe(40);
    expect(M.rebels(s, "cleanAir", true)).toEqual([]);
    expect(pol.loyalty).toBe(12);
    const v = callVote(s)!;
    expect(v.votes.find((x) => x.party === "civic")!.yes).toBe(s.parl.seats.civic);
    expect(s.m.whip).toBe(false);
    // The chamber diagram: each member's vote matches the party tallies.
    const mv = M.memberVotes(s, "cleanAir", true, { civic: 5, labour: 3, enterprise: 0, green: 2, heritage: 0 });
    expect(Object.values(mv).filter(Boolean).length).toBe(10);
  });
});

describe("Mandate: the party", () => {
  it("funds pay for recruits, training, headquarters, canvassing and offices, and run out", () => {
    const s = mapped();
    const d = s.m.districts[0].id;
    s.m.funds = 20_000;
    const n = s.m.roster.length;
    const p = M.recruit(s)!;
    expect(s.m.roster.length).toBe(n + 1);
    expect(M.train(s, p.id, "charisma")).toBe(true);
    expect(M.upgrade(s, "pollster")).toBe(true);
    expect(s.m.hq.pollster).toBe(1);
    expect(M.canvass(s, d)).toBe(true);
    expect(s.m.effort[d]).toBe(12);
    expect(M.openOffice(s, d)).toBe(false);
    expect(s.m.funds).toBe(20_000 - 3_000 - 2_000 - 6_000 - 1_500);
    // Ads only in the campaign.
    expect(M.districtAd(s, d)).toBe(false);
    s.challenger = "Avery Lane";
    s.m.funds = 50_000;
    expect(M.districtAd(s, d)).toBe(true);
    expect(M.openOffice(s, d)).toBe(true);
    expect(M.openOffice(s, d)).toBe(false);
    // Sitting members can't be thrown out; backbench hopefuls can.
    const mp = s.m.roster.find((x) => x.mp)!;
    expect(M.expel(s, mp.id)).toBe(false);
    expect(M.expel(s, p.id)).toBe(true);
  });

  it("the conference sets the platform once a term; voters near it warm to you", () => {
    const s = mapped();
    expect(M.conference(s, [-0.6, 0.2])).toBe(true);
    expect(M.conference(s, [0.6, 0.2])).toBe(false);
    expect(s.m.platform).toEqual([-0.6, 0.2]);
    expect(M.affinity(s.m.platform, "workers")).toBeGreaterThan(M.affinity(s.m.platform, "business"));
    s.policies = ["smallBiz", "zoningReform"];
    expect(M.governmentPosition(s)[0]).toBeGreaterThan(-0.6);
  });

  it("your own politicians can serve as ministers", () => {
    const s = mapped();
    const p = s.m.roster[0];
    p.competence = 9;
    expect(M.appointOwn(s, "finance", p.id, 5)).toBe(true);
    expect(s.parl.ministers.finance!.skill).toBe(5);
    expect(M.isMinister(s, p.id)).toBe(true);
    expect(M.expel(s, p.id)).toBe(false);
  });
});

describe("Mandate: the clock", () => {
  it("hour by hour: the map is drawn, money and members move, effort builds, and a poll comes out each morning", () => {
    const s = newPolitics(5, START);
    const before = s.m.funds;
    const ev = M.mandateHour(s, START + 26 * 60, stats(), town);
    expect(ev.some((e) => e.t === "redistricted")).toBe(true);
    expect(s.m.districts.length).toBeGreaterThan(0);
    expect(s.m.partyPolls.length).toBe(1);
    expect(s.m.funds).not.toBe(before);
    expect(s.m.news.length).toBeGreaterThan(1);
    const d = s.m.districts[0].id;
    M.assign(s, s.m.roster[0].id, d);
    M.mandateHour(s, START + 30 * 60, stats(), town);
    expect(s.m.effort[d]).toBeGreaterThan(0);
  });

  it("an ambitious, disloyal member crosses the floor and takes their seat with them", () => {
    const s = mapped();
    M.mandateHour(s, START, stats(), town);
    const mp = s.m.roster.find((p) => p.mp)!;
    mp.loyalty = 0;
    mp.ambition = 100;
    mp.trait = "schemer";
    const seats = s.parl.seats.civic;
    let left = false;
    for (let d = 1; d < 8 && !left; d++) left = M.mandateHour(s, START + d * 24 * 60, stats({ unemployed: 900 }), town).some((e) => e.t === "defected");
    expect(left).toBe(true);
    expect(s.parl.seats.civic).toBe(seats - 1);
    expect(s.m.mps.length).toBe(CHAMBER);
  });

  it("a minority government that loses the chamber's confidence faces a snap election", () => {
    const s = mapped();
    M.mandateHour(s, START, stats(), town);
    s.parl.seats = { civic: 4, labour: 4, enterprise: 4, green: 2, heritage: 1 };
    for (const g of ["workers", "business", "families", "greens", "seniors"] as const) s.approval[g] = 25;
    for (const p of PARTIES) s.parl.relations[p] = -40;
    const ev = M.mandateHour(s, START + 31 * 60, stats(), town);
    const nc = ev.find((e) => e.t === "noConfidence");
    expect(nc && nc.t === "noConfidence" && nc.passed).toBe(true);
    expect(s.termStart + TERM_MINUTES - (START + 31 * 60)).toBeLessThanOrEqual(12 * 60);
  });
});

describe("Mandate: elections", () => {
  it("district by district: the seats add up, the chamber is reseated, and your members come off the roster", () => {
    const s = mapped();
    const result: ElectionResult = { term: 1, share: 0.55, won: true, byFaction: { workers: 0.6, business: 0.4, families: 0.55, greens: 0.5, seniors: 0.5 }, challenger: "X", council: [] };
    const { results, seats } = M.electDistricts(s, result, stats());
    expect(PARTIES.reduce((n, p) => n + seats[p], 0)).toBe(CHAMBER);
    afterElection(s, result, stats(), seats);
    expect(s.parl.seats).toEqual(seats);
    M.afterVote(s, results, START + TERM_MINUTES);
    expect(s.m.mps.length).toBe(CHAMBER);
    expect(s.m.mps.filter((x) => x.party === "civic").every((x) => s.m.roster.some((p) => p.id === x.pol && p.mp))).toBe(true);
    expect(s.m.lastResults).toBe(results);
    expect(s.m.news[0].k).toBe("nw.won");
  });

  it("older saves get a party, a full chamber and no map yet", () => {
    const old = newPolitics(9, START) as Partial<PoliticsState>;
    delete old.m;
    const s = normalisePolitics(old, START);
    expect(s.m.mps.length).toBe(CHAMBER);
    expect(s.m.mps.filter((x) => x.party === "civic").length).toBe(s.parl.seats.civic);
    expect(s.m.districts).toEqual([]);
  });
});
