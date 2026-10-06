import { describe, expect, it } from "vitest";
import { LAW, PARTIES } from "./data";
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
    expect(G.required(b)).toBeCloseTo(2 / 3);
    expect(G.carries(b, { yes: 60, no: 40, abstain: 0, by: {} })).toBe(false);
    expect(G.carries(b, { yes: 70, no: 30, abstain: 0, by: {} })).toBe(true);
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
    console.log("score", s.score, "laws", Object.entries(s.laws).filter(([k, v]) => LAW[k].start !== v).length, "won", s.electionsWon, "pres", G.pol(s, s.president)?.party, JSON.stringify(G.houseBy(s)));
  }, 60_000);

  it("saves and loads", () => {
    const s = G.newGame(4, "lib");
    G.endTurn(s);
    const back = G.load(G.save(s))!;
    expect(back.week).toBe(s.week);
    expect(G.load("nonsense")).toBeNull();
  });
});
