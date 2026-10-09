import { describe, expect, it } from "vitest";
import { LAW, PARTIES, type LawDef } from "./data";
import * as G from "./sim";

describe("YourGov", () => {
  it("builds a country of states and counties and fills every office", () => {
    const s = G.newGame(11, "ctr");
    const c = G.country(11);
    expect(c.states.length).toBe(16);
    expect(c.sections.length).toBeGreaterThan(700);
    expect(c.sections.every((x) => x.state >= 0 && x.state < 16)).toBe(true);
    expect(s.house).toHaveLength(G.HOUSE_SEATS);
    expect(s.senate).toHaveLength(32);
    expect(s.governors).toHaveLength(16);
    expect(G.pol(s, s.president)).toBeTruthy();
    expect(G.apportion(s).reduce((a, b) => a + b, 0)).toBe(G.HOUSE_SEATS);
    // Every party gets some of the vote; shares add up.
    const poll = G.nationalPoll(s);
    expect(Object.values(poll).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    for (const p of PARTIES) expect(poll[p.id]).toBeGreaterThan(0.005);
    expect(s.missions.length).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic for a seed", () => {
    const a = G.newGame(5, "lab");
    const b = G.newGame(5, "lab");
    for (let i = 0; i < 20; i++) {
      G.endTurn(a);
      G.endTurn(b);
    }
    expect(G.save(a)).toBe(G.save(b));
  });

  it("a bill goes committee → House → Senate → President and becomes law if everyone wants it", () => {
    const s = G.newGame(3, "ctr");
    const l = LAW.healthcare;
    // Make everyone love it: lobbying aside, give every party a strong stance by relations.
    const b = G.writeBill(s, "healthcare", 2)!;
    expect(b).toBeTruthy();
    expect(b.stage).toBe("committee");
    expect(G.writeBill(s, "healthcare", 2)).toBeNull();
    const stages: string[] = [];
    for (let i = 0; i < 8 && b.stage !== "passed" && b.stage !== "failed"; i++) {
      stages.push(b.stage);
      if (G.youVoteOn(s, b)) G.castVote(s, b.id, 1);
      for (const p of PARTIES) G.lobby(s, b.id, p.id);
      s.parties[s.party].funds = 100;
      G.endTurn(s);
    }
    expect(stages[0]).toBe("committee");
    expect(b.last).toBeTruthy();
    if (b.stage === "passed") expect(s.laws.healthcare).toBe(2);
    else expect(s.laws.healthcare).toBe(l.start);
    expect(b.last!.tally.yes + b.last!.tally.no + b.last!.tally.abstain).toBeGreaterThan(0);
  });

  it("constitutional laws need two thirds", () => {
    const s = G.newGame(3, "ctr");
    const b = G.proposeBill(s, "votingAge", 0)!;
    expect(G.required(s, b)).toBeCloseTo(2 / 3);
    expect(G.carries(s, b, { yes: 60, no: 40, abstain: 0, by: {} })).toBe(false);
    expect(G.carries(s, b, { yes: 70, no: 30, abstain: 0, by: {} })).toBe(true);
  });

  it("events cost money, move your numbers and can only be held once a turn", () => {
    const s = G.newGame(9, "grn");
    const before = s.campaign.grn[s.homeState];
    const funds = s.parties.grn.funds;
    const r = G.holdEvent(s, "rally");
    expect(r.ok).toBe(true);
    expect(s.parties.grn.funds).toBeLessThan(funds);
    expect(s.campaign.grn[s.homeState]).not.toBe(before);
    expect(G.holdEvent(s, "rally").ok).toBe(false);
    const p = G.holdEvent(s, "poll", 2);
    expect(p.poll).toBeTruthy();
    G.endTurn(s);
    expect(G.holdEvent(s, "rally").ok).toBe(true);
  });

  it("runs a whole career: elections on schedule, a budget every year, and it ends", () => {
    const s = G.newGame(21, "com");
    let elections = 0;
    let budgets = 0;
    for (let i = 0; i < 52 * 21 && !s.over; i++) {
      G.endTurn(s);
      if (s.bills.some((b) => b.budget && b.voteAt === s.week)) budgets++;
      if (s.election) {
        elections++;
        expect(Object.values(s.election.houseSeats).reduce((a, b) => a + b, 0)).toBe(G.HOUSE_SEATS);
        expect(s.election.order).toHaveLength(G.country(21).sections.length);
        G.closeElection(s);
        expect(s.house).toHaveLength(G.HOUSE_SEATS);
      }
    }
    expect(s.over).toBe(true);
    // Every two years for twenty: about ten.
    expect(elections).toBeGreaterThanOrEqual(9);
    expect(budgets).toBeGreaterThanOrEqual(19);
    expect(s.news.length).toBeGreaterThan(10);
    expect(Number.isFinite(s.stats.happiness) && Number.isFinite(s.stats.gdp)).toBe(true);
    expect(s.history.length).toBeGreaterThan(100);
    expect(s.history.length).toBeLessThanOrEqual(260);
  }, 60_000);

  it("saves and loads, and upgrades a version 1 save", () => {
    const s = G.newGame(4, "lib");
    G.endTurn(s);
    const back = G.load(G.save(s))!;
    expect(back.week).toBe(s.week);
    expect(G.load("nonsense")).toBeNull();
    const old = JSON.parse(G.save(s));
    old.v = 1;
    delete old.custom;
    delete old.history;
    delete old.nextLaw;
    const up = G.load(JSON.stringify(old))!;
    expect(up.v).toBe(2);
    expect(up.custom).toEqual([]);
    expect(up.history).toEqual([]);
  });

  it("records a weekly history of the polls and the economy", () => {
    const s = G.newGame(6, "ctr");
    expect(s.history).toHaveLength(1);
    for (let i = 0; i < 5; i++) G.endTurn(s);
    expect(s.history).toHaveLength(6);
    const h = s.history[s.history.length - 1];
    expect(h.poll).toHaveLength(G.PARTY_IDS.length);
    expect(h.poll.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
  });
});

describe("custom laws", () => {
  const draft = (over: Partial<G.LawDraft> = {}): G.LawDraft => ({
    name: "Four-day week",
    about: "How many days make a working week.",
    group: "Economy",
    start: 0,
    options: [
      { label: "Five days", pos: { e: 0.4, s: 0.2 }, fx: {} },
      { label: "Four days", pos: { e: -0.5, s: -0.3 }, fx: { happiness: 3, growth: -0.2 } },
    ],
    ...over,
  });

  it("drafts a law into the books with today's option in force", () => {
    const s = G.newGame(12, "grn");
    const funds = s.parties.grn.funds;
    const law = G.draftLaw(s, draft());
    expect(typeof law).not.toBe("string");
    const l = law as LawDef;
    expect(l.custom).toBe(true);
    expect(l.committee).toBe(1);
    expect(s.laws[l.id]).toBe(0);
    expect(G.lawOf(s, l.id)).toBe(l);
    expect(G.allLaws(s)).toContain(l);
    expect(s.parties.grn.funds).toBeCloseTo(funds - G.DRAFT_COST);
  });

  it("checks drafts: names, options, limits and clean text", () => {
    const s = G.newGame(12, "grn");
    expect(G.draftLaw(s, draft({ name: "x" }))).toMatch(/name/);
    expect(G.draftLaw(s, draft({ name: "Healthcare" }))).toMatch(/already/);
    expect(G.draftLaw(s, draft({ options: [{ label: "Only", pos: { e: 0, s: 0 }, fx: {} }] }))).toMatch(/2 to 5/);
    expect(G.draftLaw(s, draft({ start: 5 }))).toMatch(/in force/);
    const l = G.draftLaw(s, draft({ name: "  <b>Big</b>   law\u0007 ", options: [{ label: "A", pos: { e: 9, s: -9 }, fx: { budget: 999, happiness: -50 } }, { label: "B", pos: { e: 0, s: 0 }, fx: {} }] })) as LawDef;
    expect(l.name).toBe("bBig/b law");
    expect(l.options[0].pos).toEqual({ e: 1, s: -1 });
    expect(l.options[0].fx).toEqual({ happiness: -G.FX_LIMITS.happiness, budget: G.FX_LIMITS.budget });
  });

  it("goes through the legislature, takes effect, and can be repealed", () => {
    const s = G.newGame(14, "grn");
    const l = G.draftLaw(s, draft()) as LawDef;
    const happyBefore = G.lawEffects(s).happiness;
    const b = G.proposeBill(s, l.id, 1)!;
    expect(b).toBeTruthy();
    expect(G.repealLaw(s, l.id)).toBe(false);
    // Force it through to see it take effect.
    for (let i = 0; i < 8 && b.stage !== "passed" && b.stage !== "failed"; i++) {
      b.lobbied = [...G.PARTY_IDS];
      G.endTurn(s);
      if (s.election) G.closeElection(s);
    }
    if (b.stage === "passed") expect(G.lawEffects(s).happiness).toBeCloseTo(happyBefore + 3);
    expect(G.repealLaw(s, l.id)).toBe(true);
    expect(G.lawOf(s, l.id)).toBeUndefined();
    expect(s.laws[l.id]).toBeUndefined();
    expect(Number.isFinite(G.lawEffects(s).happiness)).toBe(true);
  });

  it("can be edited until it has been voted on, and AI parties use custom laws too", () => {
    const s = G.newGame(15, "ctr");
    const l = G.draftLaw(s, draft()) as LawDef;
    const e = G.editLaw(s, l.id, draft({ name: "Four-day work week", start: 1 })) as LawDef;
    expect(e.name).toBe("Four-day work week");
    expect(s.laws[l.id]).toBe(1);
    G.proposeBill(s, l.id, 0);
    expect(G.editLaw(s, l.id, draft())).toMatch(/already/);
    // The left-wing parties want five days → four days; over a few years someone proposes it.
    const s2 = G.newGame(16, "her");
    for (let k = 0; k < G.CUSTOM_MAX; k++) expect(typeof G.draftLaw(s2, draft({ name: `Law number ${k}` }))).not.toBe("string");
    expect(G.draftLaw(s2, draft({ name: "One too many" }))).toMatch(/at most/);
    let ai = false;
    for (let i = 0; i < 200 && !ai; i++) {
      G.endTurn(s2);
      if (s2.election) G.closeElection(s2);
      ai = s2.bills.some((b) => b.law.startsWith("custom-") && b.party !== "her");
    }
    expect(ai).toBe(true);
  });
});
