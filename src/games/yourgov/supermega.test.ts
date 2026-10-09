import { describe, expect, it } from "vitest";
import { WEEKS } from "./data";
import * as K from "./career";
import * as I from "./institutions";
import * as Mk from "./markets";
import * as Md from "./media";
import * as P from "./politics";
import * as G from "./sim";

function inPower(seed = 9, party = "grn") {
  const s = G.newGame(seed, party);
  s.gov = { parties: [s.party], head: s.you, since: s.week };
  if (G.sys(s).exec === "presidential") s.president = s.you;
  P.newGovernment(s);
  return s;
}

describe("YourGov markets", () => {
  it("start sensible and move with the economy", () => {
    const s = G.newGame(11, "ctr");
    expect(s.mk.inflation).toBeGreaterThan(0);
    expect(Mk.RATINGS[s.mk.rating]).toBeTruthy();
    for (let i = 0; i < WEEKS * 2; i++) {
      G.endTurn(s);
      if (s.election) G.closeElection(s);
      if (s.talks) G.chooseGovernment(s, 0);
    }
    expect(s.mk.hist.length).toBeGreaterThan(50);
    expect(s.mk.rate).toBeGreaterThanOrEqual(0);
    expect(s.mk.index).toBeGreaterThan(0);
  });

  it("only a government that controls the central bank sets rates", () => {
    const s = inPower();
    s.laws.centralBank = 1;
    expect(Mk.setRate(s, 5)).toMatch(/independent/);
    s.laws.centralBank = 0;
    expect(Mk.setRate(s, 5)).toBeNull();
    expect(s.mk.rate).toBe(5);
    expect(Mk.setRate(s, 4)).toMatch(/weeks/);
    // Dear money slows growth and costs the budget.
    expect(Mk.marketFx(s).growth).toBeLessThan(0);
    expect(Mk.marketFx(s).budget).toBeLessThan(0);
  });

  it("an oil shock pushes prices up", () => {
    const s = G.newGame(11, "ctr");
    const before = s.mk.inflation;
    s.crisis = { id: "oil", week: s.week, region: 0, partner: "x", mine: false, govChoice: 0 };
    for (let i = 0; i < 12; i++) Mk.marketsWeek(s);
    expect(s.mk.inflation).toBeGreaterThan(before);
  });
});

describe("YourGov institutions", () => {
  it("the whips: a free vote lets each wing vote its conscience, a three-line whip holds the line", () => {
    const s = G.newGame(9, "grn");
    const b = G.writeBill(s, "carbonTax", 2)!;
    b.stage = "house";
    for (const f of s.factions) f.mood = 10;
    const count = (w: I.Whip) => {
      b.whip = w;
      let n = 0;
      for (let k = 0; k < 6; k++) n += G.tally(s, b).rebels ?? 0;
      return n;
    };
    const three = count("three");
    const free = count("free");
    expect(free).toBeGreaterThanOrEqual(three);
    expect(I.setWhip(s, b.id, "three")).toBe(true);
  });

  it("the court: a bench of nine, vacancies filled, laws challenged and ruled on", () => {
    const s = G.newGame(9, "grn");
    expect(s.court.judges).toHaveLength(I.COURT_SIZE);
    // A challenge to a rights law is ruled on when it's due.
    const law = "marriage";
    const from = s.laws[law];
    const to = from === 2 ? 1 : 2;
    s.laws[law] = to;
    s.court.cases.push({ id: 99, law, from, to, week: s.week, by: "Test", mine: true });
    const yes = I.upholds(s, s.court.cases[0]);
    I.courtWeek(s);
    expect(s.court.cases).toHaveLength(0);
    expect(s.laws[law]).toBe(yes * 2 > s.court.judges.length ? to : from);
    // A vacancy under someone else's government is filled at once.
    s.court.next = s.week;
    I.courtWeek(s);
    if (s.gov.head !== s.you) expect(s.court.judges).toHaveLength(I.COURT_SIZE);
  });

  it("as head of government you pick the nominee", () => {
    const s = inPower();
    s.court.next = s.week;
    I.courtWeek(s);
    expect(s.court.nominees).toHaveLength(3);
    const r = I.nominate(s, 1);
    expect(r.ok).toBe(true);
    if (r.confirmed) expect(s.court.judges).toHaveLength(I.COURT_SIZE);
  });

  it("the party conference: motions from the wings, a speech, pledges", () => {
    const s = G.newGame(9, "grn");
    while (G.weekOf(s.week) !== I.CONFERENCE_WEEK - 1) s.week++;
    I.institutionsWeek(s);
    expect(s.conference).toBeTruthy();
    const n = s.conference!.motions.length;
    const unity = s.parties.grn.unity;
    expect(I.holdConference(s, "unity", s.conference!.motions.map(() => true))).toBeTruthy();
    expect(s.conference).toBeNull();
    expect(s.parties.grn.unity).toBeGreaterThan(unity);
    expect(s.missions.filter((m) => m.pledge).length).toBeGreaterThanOrEqual(Math.min(1, n));
  });
});

describe("YourGov media and rivals", () => {
  it("posts: twice a week, followers grow, the feed fills", () => {
    const s = G.newGame(9, "grn");
    const f0 = s.social.followers;
    expect(Md.post(s, "policy").ok).toBe(true);
    expect(Md.post(s, "meme").ok).toBe(true);
    expect(Md.post(s, "personal").why).toMatch(/Twice/);
    expect(s.social.posts.length).toBe(2);
    G.endTurn(s);
    expect(Md.post(s, "policy").ok).toBe(true);
    expect(s.social.followers).toBeLessThanOrEqual(Md.followerCap(s));
    expect(s.social.followers).not.toBe(f0);
  });

  it("every rival leader has a trait, and technocrats are harder to beat in a debate", () => {
    const s = G.newGame(9, "grn");
    for (const id of G.running(s)) expect(Md.TRAITS.map((t) => t.id)).toContain(Md.traitOf(s, id));
    for (const id of G.running(s)) expect(Md.debateBar(s, id)).toBe(Md.traitOf(s, id) === "technocrat" ? 8 : 6);
  });
});

describe("YourGov careers", () => {
  it("difficulty and sandbox", () => {
    const easy = G.newGame(9, "grn", { mode: { difficulty: "easy", sandbox: false } });
    const hard = G.newGame(9, "grn", { mode: { difficulty: "hard", sandbox: false } });
    expect(easy.parties.grn.funds).toBeGreaterThan(hard.parties.grn.funds);
    expect(K.aiStrength(hard)).toBeGreaterThan(K.aiStrength(easy));
    expect(K.challengeAfter(hard)).toBeLessThan(K.challengeAfter(easy));
    const box = G.newGame(9, "grn", { mode: { difficulty: "normal", sandbox: true } });
    expect(K.challengeAfter(box)).toBe(Infinity);
    box.week = G.CAREER_YEARS * WEEKS + 5;
    G.endTurn(box);
    if (box.election) G.closeElection(box);
    expect(box.over).toBe(false);
  });

  it("knows when the week can be skipped", () => {
    const s = G.newGame(9, "grn");
    s.qt = null;
    s.crisis = null;
    expect(K.needsYou(s)).toBeNull();
    s.crisis = { id: "flood", week: s.week, region: 0, partner: "x", mine: false, govChoice: 0 };
    expect(K.needsYou(s)).toBe("A crisis");
  });

  it("a timeline, a legacy and a hall of fame", () => {
    const s = inPower();
    K.mark(s, "🏛️", "Became head");
    expect(s.timeline.at(-1)!.text).toBe("Became head");
    s.lawsPassed = 20;
    expect(K.legacy(s).title).toMatch(/reformer/i);
    const e = K.hallEntry(s);
    const { list, place } = K.addToHall([], e);
    expect(place).toBe(0);
    expect(list).toHaveLength(1);
  });

  it("a long career with everything on stays deterministic", () => {
    const run = () => {
      const s = G.newGame(41, "lab", { mode: { difficulty: "hard", sandbox: false } });
      for (let i = 0; i < WEEKS * 5 && !s.over; i++) {
        if (s.conference) I.holdConference(s, "vision", s.conference.motions.map((_, k) => k === 0));
        if (s.court.nominees && s.gov.head === s.you) I.nominate(s, 0);
        if (i % 4 === 0) Md.post(s, "attack");
        G.endTurn(s);
        if (s.election) G.closeElection(s);
        if (s.talks) G.chooseGovernment(s, 0);
      }
      return s;
    };
    const a = run();
    const b = run();
    expect(a.score).toBe(b.score);
    expect(a.mk).toEqual(b.mk);
    expect(a.social.followers).toBe(b.social.followers);
  }, 60_000);

  it("older saves get the new state", () => {
    const s = G.newGame(4, "lib");
    const raw = JSON.parse(G.save(s)) as Record<string, unknown>;
    for (const k of ["mk", "court", "social", "mode", "timeline", "conference", "courtSeen"]) delete raw[k];
    const back = G.load(JSON.stringify(raw))!;
    expect(back.mk).toBeTruthy();
    expect(back.court.judges).toHaveLength(I.COURT_SIZE);
    expect(back.mode.difficulty).toBe("normal");
    for (let i = 0; i < 5; i++) G.endTurn(back);
    expect(back.week).toBeGreaterThan(s.week);
  });
});
