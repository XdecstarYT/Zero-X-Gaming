import { describe, expect, it } from "vitest";
import * as pol from "./politics";
import { advance, load, save } from "./sim";
import { newWorld, showcaseCity } from "./showcase";
import { pointInPoly } from "./geom";
import type { WorldSettings } from "./poltypes";

const WS: WorldSettings = { name: "Testville", seed: 5, start: "village", pace: "normal", money: "normal", politics: true };
const mine = { ...pol.PARTY_PRESETS[0], leader: "Sam Planner" };

function world(settings = {}) {
  const s = newWorld(WS);
  const p = pol.newPolitics(s, { ...pol.defaultPolSettings(), ...settings }, mine, 0);
  return { s, p };
}

describe("a new political world", () => {
  it("splits the map into electorates held by the AI parties, ten weeks out", () => {
    const { s, p } = world();
    expect(p.electorates.length).toBe(pol.seatsFor(s));
    expect(p.electorates.length).toBeGreaterThanOrEqual(3);
    expect(p.electorates.every((e) => e.poly.length >= 6 && e.voters > 0)).toBe(true);
    // Every point of the map is in exactly the nearest electorate.
    expect(pol.electorateAt(p, 0, 200)).toBe(0);
    expect(p.electorates.every((e) => e.holder > 0)).toBe(true);
    expect(p.role).toBe("candidate");
    expect(p.campaign).toBe(true);
    expect(p.government).toBeGreaterThan(0);
    expect(pol.canPlan(s)).toBe(false);
    expect(p.electorates[0].candidates[0]).toBe("Sam Planner");
    const share = pol.cityShare(p);
    expect(share.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(p.federal.seats.reduce((a, b) => a + b, 0)).toBe(101);
  });
});

describe("electorates drawn from the city", () => {
  it("gets more seats as the city grows", () => {
    const s = newWorld(WS);
    const village = pol.seatsFor(s);
    expect(village).toBeGreaterThanOrEqual(3);
    expect(village).toBeLessThanOrEqual(5);
    const pop = s.stats.pop;
    s.stats.pop = pop * 4;
    expect(pol.seatsFor(s)).toBeGreaterThan(village);
    s.stats.pop = pop * 40;
    expect(pol.seatsFor(s)).toBe(16);
    s.stats.pop = pop;
    expect(pol.seatsFor(s, "more")).toBeGreaterThan(pol.seatsFor(s, "fewer"));
  });

  it("tiles the map with seats of about as many voters each, small in town and big in the country", async () => {
    const s = await showcaseCity(async () => {}, 6);
    const k = pol.seatsFor(s);
    const seats = pol.drawSeats(s, k);
    expect(seats.length).toBe(k);
    // Every point on the map is in exactly one seat.
    for (let x = -1500; x <= 1500; x += 150)
      for (let z = -1500; z <= 1500; z += 150) expect(seats.filter((e) => pointInPoly(x + 0.37, z + 0.61, e.poly)).length).toBe(1);
    const load = seats.map(() => 0);
    for (const q of pol.voterPoints(s)) load[seats.findIndex((e) => pointInPoly(q.x, q.z, e.poly))] += q.w;
    const avg = load.reduce((a, b) => a + b, 0) / k;
    for (const v of load) expect(Math.abs(v - avg) / avg).toBeLessThan(0.2);
    // The seat round the town is first, and smaller than the biggest country seat.
    expect(pointInPoly(0, 200, seats[0].poly)).toBe(true);
    const area = (poly: number[]) => {
      let a = 0;
      for (let i = 0; i < poly.length; i += 2) a += poly[i] * poly[(i + 3) % poly.length] - poly[(i + 2) % poly.length] * poly[i + 1];
      return Math.abs(a / 2);
    };
    expect(area(seats[0].poly)).toBeLessThan(Math.max(...seats.map((e) => area(e.poly))));
  });

  it("is left alone while the city stays the same, and redrawn for the election once it grows", async () => {
    const { s, p } = world();
    expect(pol.redistribute(s, p)).toBe(false);
    pol.promise(s, "park", 0);
    const before = p.electorates.length;
    const names = p.electorates.map((e) => e.name);
    // The city grows (a grown city under the same politics), and the next campaign comes round.
    const g = await showcaseCity(async () => {}, 6);
    g.pol = p;
    p.campaign = false;
    p.role = "opposition";
    p.campaignFrom = g.month;
    pol.monthPol(g);
    expect(p.campaign).toBe(true);
    expect(p.electorates.length).toBe(pol.seatsFor(g));
    expect(p.electorates.length).toBeGreaterThan(before);
    expect(p.redraw).toMatchObject({ from: before, to: p.electorates.length });
    expect(p.redraws).toBe(2);
    // Names stay where seats carry on, new seats get new names, and none repeat.
    expect(new Set(p.electorates.map((e) => e.name)).size).toBe(p.electorates.length);
    expect(p.electorates.some((e) => names.includes(e.name))).toBe(true);
    expect(p.redraw!.fresh.length).toBeGreaterThan(0);
    // Every seat is held notionally, and you stand in exactly one.
    expect(p.electorates.every((e) => e.holder >= 0 && e.holder < p.parties.length && e.candidates.every(Boolean))).toBe(true);
    expect(p.electorates.filter((e) => e.candidates[p.player] === p.parties[p.player].leader).length).toBe(1);
    expect(p.electorates[p.seat].candidates[p.player]).toBe(p.parties[p.player].leader);
    expect(p.promises[0].electorate).toBeLessThan(p.electorates.length);
    expect(pol.electorateAt(p, 0, 200)).toBe(0);
    // And the election is fought on the new map.
    for (let w = 0; w < 10 && !p.night; w++) pol.endWeek(g);
    expect(p.night!.rows.length).toBe(p.electorates.length);
  });

  it("puts you in the seat that fits where you want to stand", () => {
    const s = newWorld({ ...WS, start: "town" });
    const country = pol.newPolitics(s, pol.defaultPolSettings(), mine, "country");
    const farmers = country.electorates[country.seat].groups.farmers;
    expect(Math.max(...country.electorates.map((e) => e.groups.farmers))).toBe(farmers);
    const town = pol.newPolitics(s, pol.defaultPolSettings(), mine, "town");
    expect(town.seat).toBe(0);
  });
});

describe("the campaign", () => {
  it("campaigns, promises, lobbies and debates, then the election decides who governs", () => {
    const { s, p } = world({ difficulty: "easy" });
    const before = p.electorates[0].support[0];
    expect(pol.campaign(s, "rally", 0).ok).toBe(true);
    expect(p.electorates[0].support[0]).toBeGreaterThan(before);
    expect(pol.promise(s, "homes").ok).toBe(true);
    expect(pol.promise(s, "homes").ok).toBe(false);
    // Out of time this week.
    expect(pol.campaign(s, "doorknock", 1).ok).toBe(true);
    expect(pol.campaign(s, "rally", 1)).toMatchObject({ ok: false });
    let result = null;
    for (let w = 0; w < 10 && !result; w++) {
      pol.lobbyGroup(s, "renters");
      pol.lobbyGroup(s, "young");
      pol.campaign(s, "doorknock", 0);
      if (p.debate && !p.debate.asked) expect(pol.answerDebate(s, 1).ok).toBe(true);
      result = pol.endWeek(s);
    }
    expect(result).not.toBeNull();
    expect(p.night).toBe(result);
    expect(result!.rows.length).toBe(p.electorates.length);
    expect(result!.seats.reduce((a, b) => a + b, 0)).toBe(p.electorates.length);
    expect(p.endorse.renters).toBe(0);
    expect(p.campaign).toBe(false);
    expect(["govern", "opposition", "out"]).toContain(p.role);
    expect(p.government).toBe(result!.winner);
    expect(pol.canPlan(s)).toBe(p.government === 0);
    expect(p.electionAt).toBe(s.month + 36);
  });
});

describe("opposition and government", () => {
  it("lets another party run the city by its own lights while you protest and lobby", () => {
    const { s, p } = world();
    p.campaign = false;
    p.role = "opposition";
    p.government = p.parties.findIndex((x) => x.name === "Heritage Alliance");
    p.electorates[p.seat].holder = 0;
    p.campaignFrom = s.month + 100;
    s.rentIndex = 1.6;
    // A pro-building act for the protest to target.
    advance(s, 3);
    p.log.unshift({ id: 999, month: s.month, text: "approved a tower", axis: "housing", dir: 1, building: -1, protested: false });
    p.ap = 4;
    const r = pol.protest(s, 999);
    expect(r.ok).toBe(true);
    expect(pol.protest(s, 999).ok).toBe(false);
    p.ap = 4;
    expect(pol.lobbyGovernment(s, "taxCut").ok).toBe(true);
  });

  it("an AI government that likes building zones new homes when they're wanted", () => {
    const { s, p } = world();
    p.campaign = false;
    p.role = "opposition";
    p.government = p.parties.findIndex((x) => x.name === "Workers & Tenants");
    p.campaignFrom = s.month + 100;
    const districts = s.districts.filter(Boolean).length;
    for (let i = 0; i < 24; i++) advance(s, 1);
    expect(s.districts.filter(Boolean).length).toBeGreaterThan(districts);
    expect(p.log.length).toBeGreaterThan(0);
  });
});

describe("the federal parliament", () => {
  it("sits, votes on bills, takes questions and passes laws that change the city", () => {
    const { s, p } = world();
    p.campaign = false;
    p.role = "opposition";
    p.electorates[p.seat].holder = 0;
    p.campaignFrom = s.month + 100;
    p.federal.nextSitting = s.month + 1;
    advance(s, 1);
    expect(p.federal.sitting).toBe(true);
    expect(pol.askQuestion(s, "housing").ok).toBe(true);
    expect(pol.askQuestion(s, "housing").ok).toBe(false);
    // Give our party a majority and bring in the Transit Fund: trams cost half.
    p.federal.seats = p.parties.map((_, i) => (i === 0 ? 60 : 10));
    const r = pol.proposeBill(s, "transitFund");
    expect(r.ok).toBe(true);
    expect(p.federal.laws.transitFund).toBe(true);
    expect(pol.law(s, "transitFund")).toBe(true);
    for (const b of p.federal.bills.filter((b) => b.status === "pending")) expect(pol.vote(s, b.id, "no").ok).toBe(true);
    advance(s, 1);
    expect(p.federal.sitting).toBe(false);
  });
});

describe("promises", () => {
  it("are judged at the next election: kept ones build trust, broken ones cost it", () => {
    const { s, p } = world();
    pol.promise(s, "taxCut");
    const t0 = p.trust;
    p.role = "govern";
    p.government = 0;
    s.month += 1;
    pol.election(s);
    expect(p.promises[0].status).toBe("broken");
    expect(p.trust).toBeLessThan(t0);
    // Saved and loaded, the politics carry on.
    const back = load(save(s))!;
    expect(back.pol!.results.length).toBe(1);
    expect(back.pol!.electorates.length).toBe(p.electorates.length);
  });
});
