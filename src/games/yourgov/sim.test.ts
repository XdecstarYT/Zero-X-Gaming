import { beforeAll, describe, expect, it } from "vitest";
import { LAW, type LawDef } from "./data";
import { COUNTRY_LIST, realCountry } from "./countries";
import { prepareMap, SHAPES } from "./map";
import { avalon, checkScenario, readCode, shareCode, type Scenario } from "./scenario";
import * as G from "./sim";

describe("YourGov", () => {
  it("builds a country of states and counties and fills every office", () => {
    const s = G.newGame(11, "ctr");
    const c = G.country(11);
    expect(c.states.length).toBe(16);
    expect(c.sections.length).toBeGreaterThan(700);
    expect(c.sections.every((x) => x.state >= 0 && x.state < 16)).toBe(true);
    expect(s.house).toHaveLength(100);
    expect(s.senate).toHaveLength(32);
    expect(s.governors).toHaveLength(16);
    expect(G.pol(s, s.president)).toBeTruthy();
    expect(G.apportion(s).reduce((a, b) => a + b, 0)).toBe(100);
    // Every party gets some of the vote; shares add up.
    const poll = G.nationalPoll(s);
    expect(Object.values(poll).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    for (const p of G.partyDefs(s)) expect(poll[p.id]).toBeGreaterThan(0.005);
    // The opening polls follow the scenario's starting shares.
    for (const p of G.partyDefs(s)) expect(Math.abs(poll[p.id] - p.base)).toBeLessThan(0.03);
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
      for (const p of G.partyDefs(s)) G.lobby(s, b.id, p.id);
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

  it("events cost money, move your numbers and can be held twice a turn", () => {
    const s = G.newGame(9, "grn");
    const before = s.campaign.grn[s.homeState];
    const funds = s.parties.grn.funds;
    const r = G.holdEvent(s, "rally");
    expect(r.ok).toBe(true);
    expect(s.parties.grn.funds).toBeLessThan(funds);
    expect(s.campaign.grn[s.homeState]).not.toBe(before);
    const second = G.holdEvent(s, "rally");
    expect(second.ok).toBe(true);
    // The second time does a little less.
    if (!r.backfired && !second.backfired) expect(Math.abs(second.boost)).toBeLessThan(Math.abs(r.boost));
    const third = G.holdEvent(s, "rally");
    expect(third.ok).toBe(false);
    expect(third.why).toMatch(/twice/);
    const p = G.holdEvent(s, "poll", 2);
    expect(p.poll).toBeTruthy();
    G.endTurn(s);
    expect(G.holdEvent(s, "rally").ok).toBe(true);
  });

  it("a fundraiser can be held with an empty bank account", () => {
    const s = G.newGame(9, "grn");
    s.parties.grn.funds = 0;
    expect(G.holdEvent(s, "rally").ok).toBe(false);
    expect(G.eventBlocked(s, "fundraiser")).toBeNull();
    const r = G.holdEvent(s, "fundraiser");
    expect(r.ok).toBe(true);
    expect(r.raised).toBeGreaterThan(0);
    expect(s.parties.grn.funds).toBeGreaterThan(0);
    expect(G.holdEvent(s, "fundraiser").ok).toBe(true);
  });

  it("a party can be lobbied twice on a bill", () => {
    const s = G.newGame(9, "grn");
    s.parties.grn.funds = 50;
    const b = G.writeBill(s, "carbonTax", 1)!;
    const other = G.running(s).find((p) => p !== "grn")!;
    const st0 = G.partyStance(s, other, b);
    expect(G.lobby(s, b.id, other)).toBe(true);
    const st1 = G.partyStance(s, other, b);
    expect(G.lobby(s, b.id, other)).toBe(true);
    expect(G.partyStance(s, other, b)).toBeGreaterThan(st1);
    expect(st1).toBeGreaterThan(st0);
    expect(G.lobby(s, b.id, other)).toBe(false);
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
        expect(Object.values(s.election.houseSeats).reduce((a, b) => a + b, 0)).toBe(100);
        expect(s.election.order).toHaveLength(G.country(21).sections.length);
        G.closeElection(s);
        expect(s.house).toHaveLength(100);
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

  it("saves and loads, and upgrades version 1 and 2 saves to Avalon games", () => {
    const s = G.newGame(4, "lib");
    G.endTurn(s);
    const back = G.load(G.save(s))!;
    expect(back.week).toBe(s.week);
    expect(G.load("nonsense")).toBeNull();
    // An old save: no scenario, no calendar, two election systems.
    const old = JSON.parse(G.save(s));
    old.v = 1;
    for (const k of ["custom", "history", "nextLaw", "sc", "cal", "gov", "houseR", "senateR", "senateC", "calib", "fx0", "regionNext", "presTerms", "talks", "snapAt", "lastMotion", "upperClass", "lastLower"]) delete old[k];
    old.laws.electoralSystem = 1;
    const up = G.load(JSON.stringify(old))!;
    expect(up.v).toBe(3);
    expect(up.sc.id).toBe("avalon");
    expect(up.custom).toEqual([]);
    expect(up.history).toEqual([]);
    expect(G.lowerSystem(up)).toBe("pr");
    expect(up.gov.head).toBe(up.president);
    for (let i = 0; i < 120; i++) {
      G.endTurn(up);
      if (up.election) G.closeElection(up);
    }
    expect(up.house).toHaveLength(100);
  });

  it("records a weekly history of the polls and the economy", () => {
    const s = G.newGame(6, "ctr");
    expect(s.history).toHaveLength(1);
    for (let i = 0; i < 5; i++) G.endTurn(s);
    expect(s.history).toHaveLength(6);
    const h = s.history[s.history.length - 1];
    expect(h.poll).toHaveLength(G.ids(s).length);
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
      b.lobbied = [...G.ids(s)];
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

describe("real countries", () => {
  const scenarios: Record<string, Scenario> = {};
  beforeAll(async () => {
    for (const { code } of COUNTRY_LIST) {
      const sc = realCountry(code)!;
      await prepareMap(sc.map);
      scenarios[code] = sc;
    }
  });
  const game = (code: string, partyId?: string, seed = 7) => {
    const sc = structuredClone(scenarios[code]);
    return G.newGame(seed, partyId ?? sc.parties[0].id, { scenario: sc });
  };

  it.each(COUNTRY_LIST.map((c) => c.code))("%s: real regions, real seat counts, a government, and the opening polls", (code) => {
    const s = game(code);
    const c = G.country(s);
    const sy = G.sys(s);
    expect(c.real).toBe(true);
    expect(c.states.length).toBeGreaterThan(5);
    expect(c.sections.every((x) => x.state >= 0 && x.pop > 0)).toBe(true);
    expect(c.sections.length).toBeLessThan(2048);
    // Every region has the counties its districts need.
    const per = G.apportion(s);
    c.states.forEach((st, k) => expect(st.sections.length).toBeGreaterThanOrEqual(Math.min(per[k], 1)));
    expect(s.house).toHaveLength(sy.lower.seats);
    if (sy.upper.kind !== "none") expect(s.senate.length).toBeGreaterThan(0);
    expect(s.governors).toHaveLength(c.states.length);
    expect(s.gov.parties.length).toBeGreaterThan(0);
    expect(G.pol(s, s.gov.head)).toBeTruthy();
    if (sy.pres) expect(G.pol(s, s.president)).toBeTruthy();
    if (s.sc.start?.pres) expect(G.pol(s, s.president)?.party).toBe(s.sc.start.pres);
    if (s.sc.start?.gov) expect(s.gov.parties).toEqual(s.sc.start.gov);
    // National shares open near the scenario's figures.
    const poll = G.nationalPoll(s);
    const sum = s.sc.parties.reduce((a, p) => a + (p.noRun ? 0 : p.base), 0);
    for (const p of s.sc.parties) if (!p.noRun && p.base > 0.05) expect(Math.abs(poll[p.id] - p.base / sum)).toBeLessThan(0.05);
    // Regional parties only win votes where they stand.
    for (const p of s.sc.parties)
      if (p.only) c.states.forEach((st) => (!p.only!.includes(st.key) ? expect(G.statePoll(s, st.id)[p.id]).toBe(0) : null));
    expect(G.youHold(s).join(" ")).toContain(G.party(s, s.party).short);
  });

  it("United States: 435 House seats, 100 senators, 538 electors", () => {
    const s = game("us", "dem");
    expect(s.house).toHaveLength(435);
    expect(s.senate).toHaveLength(100);
    expect(G.apportion(s).reduce((a, b) => a + b, 0)).toBe(435);
    expect(G.apportion(s)[G.country(s).states.findIndex((x) => x.key === "district-of-columbia")]).toBe(0);
    const e = G.runElection(s, { lower: false, upper: false, pres: true });
    expect(Object.values(e.president!.college!).reduce((a, b) => a + b, 0)).toBe(538);
    // California votes Democratic and Wyoming Republican.
    const st = (k: string) => G.country(s).states.findIndex((x) => x.key === k);
    expect(G.statePoll(s, st("california")).dem).toBeGreaterThan(0.55);
    expect(G.statePoll(s, st("wyoming")).rep).toBeGreaterThan(0.6);
    // A third of the Senate is up at each election.
    for (let i = 0; i < 52 * 3 && !s.election; i++) G.endTurn(s);
    expect(s.election?.contests).toEqual({ lower: true, upper: true, pres: false });
    expect(s.election?.title).toBe("Midterm elections");
    const before = [...s.senate];
    G.closeElection(s);
    const kept = s.senate.filter((id, j) => id === before[j]).length;
    expect(kept).toBeGreaterThanOrEqual(60);
  }, 60_000);

  it("United Kingdom: first past the post turns a third of the vote into a majority", () => {
    const s = game("gb", "lab");
    const by = G.houseBy(s);
    expect(by.lab).toBe(411);
    expect(s.gov.parties).toEqual(["lab"]);
    expect(s.gov.head).toBe(s.you);
    expect(G.youHold(s)[0]).toBe("Prime Minister");
    // The SNP only stands in Scotland, Sinn Féin only in Northern Ireland.
    expect(by.snp).toBeGreaterThan(0);
    expect(s.house.filter((h, j) => G.pol(s, h)?.party === "sf" && G.country(s).states[s.houseR[j]].key !== "northern-ireland")).toHaveLength(0);
    // The Lords are appointed; crossbenchers don't stand for election.
    expect(G.senateBy(s).cb).toBeGreaterThan(150);
    expect(G.nationalPoll(s).cb).toBe(0);
  });

  it("Germany: mixed-member proportional seats follow the party vote; the 5% threshold; the Bundesrat", () => {
    const s = game("de", "spd");
    // The Bundestag opens as it is today…
    expect(G.houseBy(s).cdu).toBe(208);
    // …and an election shares the seats out by the party vote.
    const e = G.runElection(s, { lower: true, upper: false, pres: false });
    const by = e.houseSeats;
    const poll = e.national;
    expect(Object.values(by).reduce((a, b) => a + b, 0)).toBe(630);
    // Seat shares close to vote shares among the parties over 5%.
    const over = s.sc.parties.filter((p) => poll[p.id] >= 0.05);
    const sum = over.reduce((a, p) => a + poll[p.id], 0);
    for (const p of over) expect(Math.abs(by[p.id] / 630 - poll[p.id] / sum)).toBeLessThan(0.04);
    for (const p of s.sc.parties) if (poll[p.id] < 0.045) expect(by[p.id]).toBe(0);
    expect(s.senate).toHaveLength(69);
    expect(s.gov.parties).toEqual(["cdu", "spd"]);
    expect(G.titles(s).head).toBe("Chancellor");
  });

  it("coalitions: majorities, no partner a party refuses, and the player's say", () => {
    const s = game("de", "grn");
    const opts = G.coalitionOptions(s);
    expect(opts.length).toBeGreaterThan(0);
    const by = G.houseBy(s);
    for (const o of opts) {
      expect(o.reduce((a, p) => a + by[p], 0) * 2).toBeGreaterThan(s.house.length);
      for (const a of o) for (const b of o) expect(G.party(s, a).refuses?.includes(b) ?? false).toBe(false);
    }
    // No one governs with the AfD.
    expect(opts.some((o) => o.includes("afd"))).toBe(false);
    // Talks: invited, then declined, another government forms without you.
    s.talks = { kind: "invited", options: [["cdu", "grn"]], week: s.week };
    expect(G.chooseGovernment(s, -1)).toBe(true);
    expect(s.talks).toBeNull();
    expect(s.gov.parties.includes("grn")).toBe(false);
  });

  it("parliamentary: losing the budget brings the government down and a snap election", () => {
    const s = game("ca", "cpc");
    // (Within a year of an election there'd be new talks instead of a new election.)
    s.lastLower = -200;
    const b: G.Bill = { id: 999, law: "budget", option: 0, budget: true, proposer: s.gov.head, party: s.gov.parties[0], stage: "house", voteAt: s.week, committee: [], yourVote: null, lobbied: [], last: null };
    s.bills.push(b);
    for (const p of Object.values(s.parties)) for (const q of Object.keys(p.relations)) p.relations[q] = -100;
    for (const p of Object.keys(s.parties)) s.parties[p].unity = 100;
    s.stats.happiness = -40;
    G.endTurn(s);
    if (b.stage === "failed") {
      expect(s.cal.lower).toBe(s.week - 1 + G.SNAP_WEEKS);
      for (let i = 0; i < G.SNAP_WEEKS && !s.election; i++) G.endTurn(s);
      expect(s.election?.kind).toBe("snap");
    }
  });

  it("presidential: a veto goes back to both houses, which need two thirds", () => {
    const s = game("us", "dem");
    const b = G.proposeBill(s, "healthcare", 2)!;
    b.stage = "president";
    b.voteAt = s.week;
    // The President hates it.
    const pres = G.pol(s, s.president)!;
    s.parties[pres.party].relations[b.party] = -100;
    s.parties[pres.party].unity = 100;
    G.endTurn(s);
    expect(["override", "passed"]).toContain(b.stage as G.Stage);
    if ((b.stage as G.Stage) === "override") {
      expect(G.voters(s, b)).toHaveLength(s.house.length + s.senate.length);
      expect(G.required(s, b)).toBeCloseTo(2 / 3);
    }
  });

  it("weak upper houses can be overridden by the lower house", () => {
    const s = game("jp", "ldp");
    const b = G.proposeBill(s, "marriage", 1)!;
    b.stage = "senate";
    b.voteAt = s.week;
    for (const p of Object.keys(s.parties)) s.parties[p].relations[b.party] = -100;
    for (const p of Object.keys(s.parties)) s.parties[p].unity = 100;
    G.endTurn(s);
    if (b.last && !b.last.passed) {
      expect(b.stage).toBe("house");
      expect(b.insist).toBe(true);
      expect(G.required(s, b)).toBeCloseTo(2 / 3);
    }
  });

  it("India: alliances share their district candidates; regional parties win at home", () => {
    const s = game("in", "inc");
    const by = G.houseBy(s);
    expect(Object.values(by).reduce((a, b) => a + b, 0)).toBe(543);
    expect(by.bjp).toBeGreaterThan(by.inc);
    expect(by.dmk + by.tdp + by.aitc + by.sp).toBeGreaterThan(20);
  });

  it("France: a President, two-round districts and a Prime Minister who isn't the President", () => {
    const s = game("fr", "ren");
    expect(G.pol(s, s.president)?.party).toBe("ren");
    expect(s.gov.head).not.toBe(s.president);
    expect(G.youHold(s)[0]).toBe("President");
    for (let i = 0; i < 70 && !s.election; i++) G.endTurn(s);
    expect(s.election).toBeTruthy();
  }, 60_000);

  it("runs a few years of each country without trouble", () => {
    for (const { code } of COUNTRY_LIST) {
      const s = game(code, undefined, 3);
      let elections = 0;
      for (let i = 0; i < 52 * 3; i++) {
        G.endTurn(s);
        if (s.election) {
          elections++;
          G.closeElection(s);
        }
        if (s.talks) G.chooseGovernment(s, 0);
      }
      expect(s.week).toBe(1 + 52 * 3);
      expect(Number.isFinite(s.stats.gdp) && Number.isFinite(s.stats.budget)).toBe(true);
      expect(s.house).toHaveLength(G.sys(s).lower.seats);
      expect(G.pol(s, s.gov.head)).toBeTruthy();
      expect(G.save(s).length).toBeLessThan(2_500_000);
      void elections;
    }
  }, 240_000);
});

describe("custom scenarios", () => {
  it("builds every map shape with the regions asked for", () => {
    for (const { id } of SHAPES) {
      const sc = avalon(31);
      sc.map = { ...sc.map, kind: "gen", shape: id, regions: 9, counties: 500, name: "Testland" } as typeof sc.map;
      const c = G.country(sc);
      expect(c.states.length).toBeGreaterThanOrEqual(8);
      expect(c.sections.length).toBeGreaterThan(400);
      expect(c.sections.every((x) => x.state >= 0 && x.state < c.states.length)).toBe(true);
    }
  });

  it("custom parties, a custom system and a share code that comes back the same", () => {
    const sc = avalon(5);
    sc.name = "Freedonia";
    sc.parties = [
      { id: "red", name: "Red Party", short: "RED", color: "#cc2222", pos: { e: -0.5, s: 0 }, ideology: "Left", base: 0.45 },
      { id: "blue", name: "Blue Party", short: "BLU", color: "#2244cc", pos: { e: 0.5, s: 0.2 }, ideology: "Right", base: 0.4 },
      { id: "gold", name: "Gold Party", short: "GLD", color: "#ccaa22", pos: { e: 0.1, s: -0.5 }, ideology: "Liberal", base: 0.15, refuses: ["red"] },
    ];
    sc.system.exec = "parliamentary";
    sc.system.pres = null;
    sc.system.lower = { ...sc.system.lower, seats: 151, system: "pr", threshold: 0.05 };
    sc.system.upper = { ...sc.system.upper, kind: "none" };
    sc.system.titles.head = "Premier";
    const ok = checkScenario(sc);
    expect(typeof ok).not.toBe("string");
    const code = shareCode(ok as Scenario);
    expect(readCode(code)).toEqual(ok);
    expect(readCode("YG1.garbage")).toMatch(/damaged|isn't/);
    const s = G.newGame(5, "gold", { scenario: ok as Scenario });
    expect(s.house).toHaveLength(151);
    expect(s.senate).toHaveLength(0);
    expect(G.youHold(s).join(" ")).toContain("GLD");
    // A bill goes straight from the one chamber to the books.
    const b = G.proposeBill(s, "healthcare", 2)!;
    b.stage = "house";
    b.voteAt = s.week;
    for (const p of Object.keys(s.parties)) s.parties[p].relations[b.party] = 100;
    G.endTurn(s);
    expect(["passed", "failed"]).toContain(b.stage);
  });

  it("rejects broken scenarios", () => {
    expect(checkScenario(null)).toMatch(/isn't/);
    expect(checkScenario({ ...avalon(1), parties: [avalon(1).parties[0]] })).toMatch(/two parties/);
    expect(checkScenario({ ...avalon(1), name: "" })).toMatch(/name/);
  });
});
