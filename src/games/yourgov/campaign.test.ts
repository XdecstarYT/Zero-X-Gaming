import { describe, expect, it } from "vitest";
import { WEEKS } from "./data";
import * as C from "./campaign";
import * as P from "./politics";
import * as G from "./sim";

function inPower(seed = 9, party = "grn") {
  const s = G.newGame(seed, party);
  s.gov = { parties: [s.party], head: s.you, since: s.week };
  if (G.sys(s).exec === "presidential") s.president = s.you;
  P.newGovernment(s);
  return s;
}

describe("YourGov campaign", () => {
  it("the polling centre: regions, leaders, issues", () => {
    const s = G.newGame(11, "ctr");
    const rp = C.regionPolls(s);
    expect(rp).toHaveLength(G.country(s).states.length);
    for (const r of rp) expect(Object.values(r).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    // The regions add up to the national poll.
    const k = 3;
    const direct = G.statePoll(s, k);
    for (const id of G.ids(s)) expect(rp[k][id]).toBeCloseTo(direct[id], 6);
    const lr = C.leaderRatings(s);
    expect(lr.length).toBeGreaterThan(2);
    for (const x of lr) expect(x.fav + x.unfav).toBeLessThanOrEqual(1);
    const is = C.issues(s);
    expect(Object.values(is).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("a seat projection costs money and changes nothing else", () => {
    const s = G.newGame(11, "ctr");
    const before = JSON.stringify({ ...s, parties: undefined, mrp: undefined, counters: undefined });
    const funds = s.parties.ctr.funds;
    expect(C.commissionMrp(s)).toBeNull();
    expect(s.parties.ctr.funds).toBeLessThan(funds);
    expect(Object.values(s.mrp!.lower).reduce((a, b) => a + b, 0)).toBe(s.house.length);
    expect(JSON.stringify({ ...s, parties: undefined, mrp: undefined, counters: undefined })).toBe(before);
    // Avalon has a President: the projection covers the race too.
    expect(s.mrp!.pres?.party).toBeTruthy();
  });

  it("campaign staff: hire, pay, and their effect on fundraising", () => {
    const s = G.newGame(9, "grn");
    expect(Object.keys(s.hires).sort()).toEqual(C.ROLES.map((r) => r.id).sort());
    s.parties.grn.funds = 50;
    const best = s.hires.finance[0];
    expect(C.hire(s, "finance", 0)).toBeNull();
    expect(s.staff.finance).toEqual(best);
    expect(C.payroll(s)).toBeCloseTo(best.salary);
    const funds = s.parties.grn.funds;
    C.campaignWeek(s);
    expect(s.parties.grn.funds).toBeCloseTo(funds - best.salary, 5);
    // Unpaid staff walk out.
    s.parties.grn.funds = -5;
    C.campaignWeek(s);
    expect(s.staff.finance).toBeUndefined();
  });

  it("the manifesto: only before an election, pledges become promises in government", () => {
    const s = G.newGame(9, "grn");
    const w = C.manifestoElection(s);
    s.week = w - C.MANIFESTO_WINDOW - 5;
    expect(C.publishManifesto(s, [{ law: "carbonTax", dir: 1 }])).toMatch(/weeks before/);
    s.week = w - 10;
    s.parties.grn.funds = 20;
    const green = s.goodwill.green;
    expect(C.publishManifesto(s, [{ law: "carbonTax", dir: 1 }, { law: "transport", dir: 1 }])).toBeNull();
    expect(s.goodwill.green).toBeGreaterThan(green);
    expect(C.publishManifesto(s, [{ law: "carbonTax", dir: 1 }])).toMatch(/already/);
    // Win power and the pledges are promises.
    s.gov = { parties: [s.party], head: s.you, since: s.week };
    C.campaignAfterElection(s, { week: w, contests: { lower: true, upper: false, pres: true }, houseSeats: {}, prevHouse: {} } as unknown as G.ElectionRun);
    const pledges = s.missions.filter((m) => m.pledge);
    expect(pledges.map((m) => m.law).sort()).toEqual(["carbonTax", "transport"]);
    expect(G.missionText(pledges[0], s)).toMatch(/Manifesto pledge/);
  });

  it("the budget: the head of government writes it, parties vote by ideology, it moves the economy", () => {
    const s = inPower();
    const big = Object.fromEntries(C.BUDGET_AREAS.map((a) => [a.id, a.id === "tax" ? 2 : 2]));
    expect(C.draftBudget(s, big)).toBeNull();
    const fx = C.budgetEffects(s.budgetDraft!.plan);
    expect(fx.happiness).toBeGreaterThan(0);
    // The left likes a big-spending budget more than the right does.
    const ps = G.partyDefs(s).filter((p) => !p.noRun);
    const left = ps.reduce((a, b) => (b.pos.e < a.pos.e ? b : a));
    const right = ps.reduce((a, b) => (b.pos.e > a.pos.e ? b : a));
    expect(C.budgetLean(s, s.budgetDraft!.plan, left.id)).toBeGreaterThan(C.budgetLean(s, s.budgetDraft!.plan, right.id));
    // Budget day: the bill carries your plan; when it passes, its effects run for the year.
    while (G.weekOf(s.week) !== G.BUDGET_WEEK) {
      if (s.election) G.closeElection(s);
      if (s.talks) G.chooseGovernment(s, 0);
      s.gov = { parties: [s.party], head: s.you, since: s.gov.since };
      G.endTurn(s);
    }
    if (s.election) return;
    const plan = { ...s.budgetDraft!.plan };
    G.endTurn(s);
    const bill = s.bills.find((b) => b.budget);
    if (s.budgetDraft?.year === G.yearOf(s) && bill) expect(bill.plan).toEqual(plan);
    expect(C.budgetPassed(s, plan, true)).toMatch(/more for/);
    expect(s.budgetFx.happiness).toBeCloseTo(fx.happiness);
  });

  it("someone else's government writes its own budget", () => {
    const s = G.newGame(9, "grn");
    const plan = C.aiBudget(s, s.gov.parties[0]);
    for (const v of Object.values(plan)) expect(Math.abs(v)).toBeLessThanOrEqual(2);
  });

  it("Question Time comes round and is answered", () => {
    const s = inPower();
    while (G.weekOf(s.week) % C.QT_EVERY !== 0) s.week++;
    C.campaignWeek(s);
    expect(s.qt?.role).toBe("answer");
    const pts = C.answerQT(s, "record")!;
    expect(typeof pts).toBe("number");
    expect(s.qt).toBeNull();
    expect(s.news[0].text).toMatch(/Questions|briefing|hearing/);
  });

  it("party scandals wait on a decision and are settled at the end of the week", () => {
    const s = G.newGame(9, "grn");
    s.scandal = { id: "expenses", week: s.week, who: s.house.find((id) => G.pol(s, id)?.party === "grn" && id !== s.you) ?? -1 };
    const swing = s.parties.grn.swing;
    expect(C.answerScandal(s, 1)).toBeTruthy();
    expect(s.parties.grn.swing).toBeLessThan(swing);
    s.scandal = { id: "donor", week: s.week, who: -1 };
    s.week++;
    C.settleCampaign(s);
    expect(s.scandal).toBeNull();
  });

  it("moving the party: once every six months, not too far, factions react", () => {
    const s = G.newGame(9, "grn");
    s.parties.grn.funds = 50;
    const e = G.party(s, "grn").pos.e;
    expect(C.moveParty(s, "right")).toBeNull();
    expect(G.party(s, "grn").pos.e).toBeCloseTo(Math.min(1, e + C.MOVE_STEP));
    expect(C.moveParty(s, "right")).toMatch(/weeks/);
    for (let i = 0; i < 6; i++) {
      s.week += C.MOVE_GAP;
      C.moveParty(s, "right");
    }
    expect(G.party(s, "grn").pos.e - s.pos0.e).toBeLessThanOrEqual(C.MOVE_MAX + 1e-6);
  });

  it("an election-night speech, once", () => {
    const s = G.newGame(9, "grn");
    s.week = s.cal.lower - 1;
    G.endTurn(s);
    expect(s.election).toBeTruthy();
    const list = C.electionWon(s, s.election!) ? C.SPEECHES.win : C.SPEECHES.lose;
    expect(C.electionSpeech(s, list[0].id)).toBe(true);
    expect(C.electionSpeech(s, list[1].id)).toBe(false);
  });

  it("achievements unlock once and add to the score", () => {
    const s = G.newGame(9, "grn");
    s.lawsPassed = 1;
    const score = s.score;
    const got = C.checkAchievements(s);
    expect(got.map((a) => a.id)).toContain("firstLaw");
    expect(s.score).toBeGreaterThan(score);
    expect(C.checkAchievements(s).map((a) => a.id)).not.toContain("firstLaw");
  });

  it("older saves get the campaign state, and a long career still runs the same every time", () => {
    const s = G.newGame(4, "lib");
    const raw = JSON.parse(G.save(s)) as Record<string, unknown>;
    for (const k of ["staff", "hires", "budgetFx", "achievements", "counters", "pos0", "qt", "scandal"]) delete raw[k];
    const back = G.load(JSON.stringify(raw))!;
    expect(back.budgetFx).toBeTruthy();
    expect(Object.keys(back.hires).length).toBe(C.ROLES.length);
    const run = () => {
      const g = G.newGame(33, "lab");
      g.parties.lab.funds = 60;
      C.hire(g, "manager", 0);
      for (let i = 0; i < WEEKS * 5 && !g.over; i++) {
        if (g.qt) C.answerQT(g, "heart");
        if (g.scandal) C.answerScandal(g, 0);
        if (g.debate) P.debateAnswer(g, "facts");
        if (C.budgetDue(g)) C.draftBudget(g, { health: 1, tax: 1 });
        G.holdEvent(g, "fundraiser");
        G.endTurn(g);
        if (g.election) G.closeElection(g);
        if (g.talks) G.chooseGovernment(g, 0);
      }
      return g;
    };
    const a = run();
    const b = run();
    expect(a.score).toBe(b.score);
    expect(a.achievements).toEqual(b.achievements);
    expect(Object.keys(a.achievements).length).toBeGreaterThan(0);
  });
});
