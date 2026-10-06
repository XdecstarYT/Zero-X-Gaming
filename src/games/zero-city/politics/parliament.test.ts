import { describe, expect, it } from "vitest";
import type { Stats } from "../sim/sim";
import { adBlitz, afterElection, appoint, callVote, COST, debate, draftBill, dropPartner, forecast, govSeats, invite, lobby, parlHour, partyStance, rally, referendum, resolveScandal } from "./parliament";
import { CHAMBER, election, ledger, MAJORITY, newPolitics, normalisePolitics, PARTIES, simPolicy, type CityFacts } from "./politics";

const START = 8 * 60;
const stats = (o: Partial<Stats> = {}): Stats => ({
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
  tourists: 0,
  fires: 0,
  roadCondition: 1,
  roadworks: 0,
  poorRoads: 0,
  ...o,
});
const facts: CityFacts = { roadKm: 6, services: { police: 1, park: 2 }, lines: 2, residents: 2_000, cJobs: 600, iJobs: 400 };

describe("parliament", () => {
  it("parties back what their voters want; the chamber has fifteen seats", () => {
    const s = newPolitics(1, START);
    expect(PARTIES.reduce((n, p) => n + s.parl.seats[p], 0)).toBe(CHAMBER);
    expect(partyStance("green", "cleanAir", true)).toBeGreaterThan(0.5);
    expect(partyStance("enterprise", "cleanAir", true)).toBeLessThan(0);
    expect(partyStance("enterprise", "cleanAir", false)).toBeGreaterThan(0);
    expect(partyStance("civic", "landTax", true)).toBe(1);
  });

  it("a bill passes with a majority of seats; lobbying swings a party; failures can go to a referendum", () => {
    const s = newPolitics(2, START);
    // A law only Labour's voters like, before and after lobbying everyone.
    const before = forecast(s, "socialHousing", true);
    draftBill(s, "socialHousing", true);
    s.parl.capital = 100;
    for (const p of ["labour", "green", "heritage", "enterprise"] as const) expect(lobby(s, p)).toBe(true);
    expect(s.parl.capital).toBe(100 - 4 * COST.lobby);
    // Not twice.
    expect(lobby(s, "labour")).toBe(false);
    const after = forecast(s, "socialHousing", true, s.parl.bill!.lobbied);
    expect(after.yes).toBeGreaterThanOrEqual(before.yes);
    const v = callVote(s)!;
    expect(v.yes + v.no).toBe(CHAMBER);
    expect(v.passed).toBe(v.yes >= MAJORITY);
    expect(s.policies.includes("socialHousing")).toBe(v.passed);
    // Something the chamber hates: it fails, and the people get a say.
    const t = newPolitics(3, START);
    t.parl.seats = { civic: 2, labour: 1, enterprise: 9, green: 1, heritage: 2 };
    t.parl.capital = 100;
    draftBill(t, "landTax", true);
    const f = callVote(t)!;
    expect(f.passed).toBe(false);
    expect(t.parl.failed).toEqual({ law: "landTax", enable: true });
    const r = referendum(t, stats())!;
    expect(r).toBeTruthy();
    expect(t.policies.includes("landTax")).toBe(r.passed);
    // Once a term.
    t.parl.failed = { law: "cctv", enable: true };
    expect(referendum(t, stats())).toBeNull();
  });

  it("coalitions: partners join if they like you, bring a demand, vote with you, and walk out if they sour", () => {
    const s = newPolitics(4, START);
    s.parl.capital = 100;
    s.parl.relations.green = 90;
    s.approval.greens = 90;
    const r = invite(s, "green");
    expect(r?.yes).toBe(true);
    expect(s.parl.coalition).toContain("green");
    expect(s.parl.demands.green).toBeTruthy();
    expect(govSeats(s)).toBe(s.parl.seats.civic + s.parl.seats.green);
    // Their demand gets a big push from them.
    const d = s.parl.demands.green!;
    expect(forecast(s, d, true).votes.find((v) => v.party === "green")!.yes).toBe(s.parl.seats.green);
    // Sour the partnership: they leave.
    s.parl.relations.green = -40;
    s.approval.greens = 5;
    const ev = parlHour(s, START + 60, stats());
    expect(ev.some((e) => e.t === "partnerLeft" && e.party === "green")).toBe(true);
    expect(s.parl.coalition).not.toContain("green");
  });

  it("ministers: only from government parties; skill helps their department; scandals need an answer", () => {
    const s = newPolitics(5, START);
    s.parl.capital = 100;
    const fromLabour = s.parl.pool.find((m) => m.party === "labour")!;
    expect(appoint(s, "finance", fromLabour.id)).toBe(false);
    const fin = [...s.parl.pool].filter((m) => m.party === "civic").sort((a, b) => b.skill - a.skill)[0];
    const plain = ledger(s, facts).income.R;
    expect(appoint(s, "finance", fin.id)).toBe(true);
    expect(ledger(s, facts).income.R).toBeGreaterThan(plain);
    const tr = s.parl.pool.find((m) => m.party === "civic")!;
    appoint(s, "transport", tr.id);
    expect(simPolicy(s).wearMul!).toBeLessThan(1);
    s.parl.scandal = "finance";
    const mood = s.mood.workers;
    expect(resolveScandal(s, false)).toBe(true);
    expect(s.mood.workers).toBe(mood - 3);
    s.parl.scandal = "finance";
    resolveScandal(s, true);
    expect(s.parl.ministers.finance).toBeNull();
  });

  it("the campaign: rallies once per group, a few ads, one debate; only in the last day", () => {
    const s = newPolitics(6, START);
    expect(rally(s, "workers")).toBe(false);
    s.challenger = "Avery Lane";
    expect(rally(s, "workers")).toBe(true);
    expect(rally(s, "workers")).toBe(false);
    expect(adBlitz(s)).toBe(true);
    expect(debate(s)).not.toBeNull();
    expect(debate(s)).toBeNull();
  });

  it("elections reseat the chamber, and a narrow loss can be saved by a coalition", () => {
    const s = newPolitics(7, START);
    const st = stats();
    const r = afterElection(s, election(s, st, facts), st);
    expect(PARTIES.reduce((n, p) => n + r.seats![p], 0)).toBe(CHAMBER);
    // Lost the vote, but the biggest party with willing partners: still mayor.
    const t = newPolitics(8, START);
    for (const g of ["workers", "business", "families", "greens", "seniors"] as const) t.approval[g] = 47;
    t.parl.relations = { civic: 100, labour: 60, enterprise: 60, green: 60, heritage: 60 };
    const lost = election(t, st, facts);
    expect(lost.won).toBe(false);
    const res = afterElection(t, lost, st);
    if (res.seats!.civic >= Math.max(res.seats!.labour, res.seats!.enterprise, res.seats!.green, res.seats!.heritage)) {
      expect(res.rescued).toBe(true);
      expect(t.status).toBe("office");
      expect(govSeats(t)).toBeGreaterThanOrEqual(MAJORITY);
    } else expect(t.status).toBe("ousted");
  });

  it("old saves get a parliament; dropping a partner takes their ministers", () => {
    const n = normalisePolitics({ cash: 1 } as never, START);
    expect(n.parl.seats.civic).toBeGreaterThan(0);
    const s = newPolitics(9, START);
    s.parl.capital = 100;
    s.parl.coalition = ["labour"];
    const lab = s.parl.pool.find((m) => m.party === "labour")!;
    expect(appoint(s, "housing", lab.id)).toBe(true);
    dropPartner(s, "labour");
    expect(s.parl.ministers.housing).toBeNull();
  });
});
