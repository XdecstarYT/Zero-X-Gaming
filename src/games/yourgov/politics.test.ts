import { describe, expect, it } from "vitest";
import { WEEKS } from "./data";
import * as P from "./politics";
import * as G from "./sim";

/** A game where the player's party governs alone with the player at its head. */
function inPower(seed = 9, party = "grn") {
  const s = G.newGame(seed, party);
  s.gov = { parties: [s.party], head: s.you, since: s.week };
  if (G.sys(s).exec === "presidential") s.president = s.you;
  P.newGovernment(s);
  return s;
}

describe("YourGov politics", () => {
  it("sets up the wider politics with a new game", () => {
    const s = G.newGame(11, "ctr");
    expect(s.factions).toHaveLength(3);
    expect(s.factions.reduce((a, f) => a + f.strength, 0)).toBe(100);
    expect(Object.keys(s.goodwill).sort()).toEqual(P.GROUPS.map((g) => g.id).sort());
    expect(Object.keys(s.cabinet).length).toBe(P.PORTFOLIOS.length);
    expect(s.foreign.length).toBeGreaterThan(0);
    expect(s.plan).toEqual([]);
    // Every minister sits for a governing party.
    for (const id of Object.values(s.cabinet)) expect(s.gov.parties).toContain(G.pol(s, id)!.party);
  });

  it("older saves get the new politics when they load", () => {
    const s = G.newGame(4, "lib");
    const raw = JSON.parse(G.save(s)) as Record<string, unknown>;
    for (const k of ["plan", "goodwill", "lobbies", "factions", "cabinet", "foreign", "press", "boosts", "tradeGrowth", "crisis", "debate"]) delete raw[k];
    const back = G.load(JSON.stringify(raw))!;
    expect(back.factions).toHaveLength(3);
    expect(back.boosts).toEqual({ growth: 0, happiness: 0 });
    expect(Object.keys(back.cabinet).length).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) G.endTurn(back);
    expect(back.week).toBeGreaterThan(s.week);
  });

  it("the planner books events for later weeks and holds them when the week comes", () => {
    const s = G.newGame(9, "grn");
    expect(typeof P.schedule(s, "rally", s.week)).toBe("string");
    expect(typeof P.schedule(s, "rally", s.week + P.PLAN_AHEAD + 1)).toBe("string");
    const item = P.schedule(s, "rally", s.week + 2, 3);
    expect(typeof item).toBe("object");
    P.schedule(s, "rally", s.week + 2, 4);
    expect(typeof P.schedule(s, "rally", s.week + 2, 5)).toBe("string");
    const id = (P.schedule(s, "tvAd", s.week + 3) as P.PlanItem).id;
    expect(P.unschedule(s, id)).toBe(true);
    const before = s.campaign.grn[3];
    G.endTurn(s);
    expect(s.plan).toHaveLength(2);
    G.endTurn(s);
    expect(s.plan).toHaveLength(0);
    expect(s.usedEvents.filter((e) => e === "rally")).toHaveLength(2);
    expect(s.campaign.grn[3]).not.toBeCloseTo(before);
  });

  it("winning over a voter group lifts your polls where they live", () => {
    const s = G.newGame(9, "grn");
    const before = G.nationalPoll(s).grn;
    s.goodwill.young = 60;
    s.goodwill.professionals = 60;
    expect(G.nationalPoll(s).grn).toBeGreaterThan(before);
    // Courting one group costs a little with its rival.
    P.courtGroup(s, "workers", 10);
    expect(s.goodwill.workers).toBeGreaterThan(0);
    expect(s.goodwill.business).toBeLessThan(0);
    const poll = P.groupPoll(s, "young");
    expect(Object.values(poll).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("voter-group events build goodwill, and fundraisers bring in money", () => {
    const s = G.newGame(9, "grn");
    expect(G.holdEvent(s, "campus").ok).toBe(true);
    expect(s.goodwill.young).toBeGreaterThan(0);
    const funds = s.parties.grn.funds;
    G.holdEvent(s, "smallDonors");
    expect(s.parties.grn.funds).toBeGreaterThan(funds);
  });

  it("the groups remember the laws you pass", () => {
    const s = G.newGame(9, "grn");
    P.lawChanged(s, "pensions", 1, 2, true, false);
    expect(s.goodwill.retirees).toBeGreaterThan(0);
    P.lawChanged(s, "minimumWage", 2, 1, true, false);
    expect(s.goodwill.workers).toBeLessThan(0);
  });

  it("a party at war with itself challenges its leader", () => {
    const s = G.newGame(9, "grn");
    for (const f of s.factions) f.mood = 0;
    s.parties.grn.unity = 10;
    for (let i = 0; i < 12 && !s.challenge; i++) {
      for (const f of s.factions) f.mood = 0;
      P.politicsWeek(s);
    }
    expect(s.challenge).toBeTruthy();
    for (const f of s.factions) f.mood = 0;
    const r = P.answerChallenge(s, "vote")!;
    expect(r.survived).toBe(false);
    expect(s.ousted).toBe(true);
    expect(s.over).toBe(true);
  });

  it("a happy party keeps its leader, and conceding ends a challenge", () => {
    const s = G.newGame(9, "grn");
    s.challenge = { week: s.week, faction: "left" };
    for (const f of s.factions) f.mood = 90;
    expect(P.answerChallenge(s, "vote")!.survived).toBe(true);
    s.challenge = { week: s.week, faction: "left" };
    expect(P.answerChallenge(s, "concede")!.survived).toBe(true);
    expect(s.challenge).toBeNull();
    expect(s.over).toBe(false);
  });

  it("debates are answered question by question and settle the night", () => {
    const s = G.newGame(9, "grn");
    s.debate = { week: s.week, rival: G.running(s).find((p) => p !== "grn")!, topics: ["economy", "health", "jobs"], answers: [] };
    expect(P.debateAnswer(s, "facts")!.done).toBeNull();
    P.debateAnswer(s, "heart");
    const last = P.debateAnswer(s, "attack")!;
    expect(last.done).toBeTruthy();
    expect(s.debate).toBeNull();
    expect(s.news[0].text).toMatch(/Debate night/);
  });

  it("a TV debate is set up before a national election", () => {
    const s = G.newGame(9, "grn");
    const next = G.nextElection(s);
    s.week = next.week - 3;
    P.politicsWeek(s);
    if (next.kind !== "upper") expect(s.debate).toBeTruthy();
  });

  it("crises come up and wait on a decision", () => {
    const s = inPower();
    s.nextCrisis = s.week;
    P.politicsWeek(s);
    expect(s.crisis).toBeTruthy();
    expect(s.crisis!.mine).toBe(true);
    const debt = s.stats.debt;
    const def = P.CRISIS[s.crisis!.id];
    const pick = def.options.findIndex((o) => (o.budget ?? 0) < 0);
    expect(P.answerCrisis(s, Math.max(0, pick))).toBe(true);
    expect(s.crisis).toBeNull();
    if (pick >= 0) expect(s.stats.debt).toBeGreaterThan(debt);
  });

  it("in opposition you back or attack the government's handling", () => {
    const s = G.newGame(9, "grn");
    if (s.gov.head === s.you) return;
    s.nextCrisis = s.week;
    P.politicsWeek(s);
    expect(s.crisis!.mine).toBe(false);
    expect(P.answerCrisis(s, 1)).toBe(true);
    expect(s.news[0].text).toMatch(/attack/);
  });

  it("an unanswered crisis is settled at the end of the week", () => {
    const s = inPower();
    s.nextCrisis = s.week;
    P.politicsWeek(s);
    G.endTurn(s);
    expect(s.crisis === null || s.crisis.week === s.week - 1).toBe(true);
  });

  it("only the head of government appoints ministers, and the cabinet matters", () => {
    const s = G.newGame(9, "grn");
    const pf = P.PORTFOLIOS[0].id;
    if (s.gov.head !== s.you) expect(P.appoint(s, pf, P.candidates(s)[0]?.id ?? -1)).toBe(false);
    const t = inPower();
    const pool = P.candidates(t).sort((a, b) => P.skill(b) - P.skill(a));
    expect(pool.length).toBeGreaterThan(0);
    expect(P.appoint(t, "finance", pool[0].id)).toBe(true);
    expect(t.cabinet.finance).toBe(pool[0].id);
    const good = P.cabinetFx(t).growth;
    delete t.cabinet.finance;
    expect(P.cabinetFx(t).growth).toBeLessThan(good);
  });

  it("executive actions work once, then wait out their cooldown", () => {
    const s = inPower();
    const appr = s.stats.approval;
    const r = P.issueOrder(s, "address");
    expect(r.ok).toBe(true);
    expect(s.stats.approval).toBeGreaterThanOrEqual(appr);
    const again = P.issueOrder(s, "address");
    expect(again.ok).toBe(false);
    expect(again.why).toMatch(/weeks/);
    const opp = G.newGame(9, "grn");
    if (opp.gov.head !== opp.you) expect(P.issueOrder(opp, "address").ok).toBe(false);
  });

  it("referendums change the law if the people say yes, once a year", () => {
    const s = inPower();
    s.parties.grn.funds = 40;
    const law = "carbonTax";
    const r = P.callReferendum(s, law, 2);
    expect(typeof r).toBe("object");
    const res = r as { yes: number; passed: boolean };
    if (res.passed) expect(s.laws[law]).toBe(2);
    else expect(s.laws[law]).not.toBe(2);
    expect(typeof P.callReferendum(s, "transport", 2)).toBe("string");
    s.week += WEEKS;
    expect(typeof P.callReferendum(s, "transport", 2)).toBe("object");
  });

  it("diplomacy: visits warm relations, trade deals need friends", () => {
    const s = inPower();
    const f = s.foreign[0];
    const rel = f.rel;
    expect(P.diplomacy(s, f.name, "visit").ok).toBe(true);
    expect(f.rel).toBeGreaterThan(rel);
    expect(P.diplomacy(s, f.name, "visit").ok).toBe(false);
    const cold = s.foreign.find((x) => x.rel < 35);
    if (cold) expect(P.diplomacy(s, cold.name, "deal").why).toMatch(/warm/);
  });

  it("coalition deals are tracked and a junior partner can walk out", () => {
    const s = G.newGame(9, "grn");
    const other = G.running(s).find((p) => p !== s.party)!;
    s.gov = { parties: [other, s.party], head: G.pol(s, s.parties[other].leader)!.id, since: s.week };
    P.newGovernment(s);
    expect(s.deals.every((d) => d.forYou)).toBe(true);
    expect(P.leaveGovernment(s)).toBe(true);
    expect(s.gov.parties).not.toContain(s.party);
    for (const id of Object.values(s.cabinet)) expect(G.pol(s, id)!.party).not.toBe(s.party);
  });

  it("a whole career runs with the wider politics, deterministically", () => {
    const run = () => {
      const s = G.newGame(33, "lab");
      for (let i = 0; i < WEEKS * 6 && !s.over; i++) {
        if (i % 5 === 0) G.holdEvent(s, "fundraiser");
        if (i % 7 === 0) G.holdEvent(s, "campus", i % G.country(s).states.length);
        if (s.debate) P.debateAnswer(s, "facts");
        if (s.crisis) P.answerCrisis(s, 0);
        G.endTurn(s);
        if (s.election) G.closeElection(s);
        if (s.talks) G.chooseGovernment(s, 0);
      }
      return s;
    };
    const a = run();
    const b = run();
    expect(a.score).toBe(b.score);
    expect(a.goodwill).toEqual(b.goodwill);
    const poll = G.nationalPoll(a);
    for (const v of Object.values(poll)) expect(Number.isFinite(v)).toBe(true);
    for (const v of Object.values(a.goodwill)) expect(v).toBeLessThanOrEqual(60);
  }, 60_000);
});
