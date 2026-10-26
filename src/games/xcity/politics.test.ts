import { describe, expect, it } from "vitest";
import * as pol from "./politics";
import { advance, load, save } from "./sim";
import { newWorld } from "./showcase";
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
    expect(p.electorates.length).toBe(6);
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
    expect(result!.rows.length).toBe(6);
    expect(result!.seats.reduce((a, b) => a + b, 0)).toBe(6);
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
    expect(back.pol!.electorates.length).toBe(6);
  });
});
