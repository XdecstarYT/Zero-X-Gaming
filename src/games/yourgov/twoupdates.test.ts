import { describe, expect, it } from "vitest";
import { WEEKS } from "./data";
import * as Gr from "./grassroots";
import * as O from "./office";
import * as P from "./politics";
import * as S from "./society";
import * as St from "./studio";
import * as W from "./world";
import * as G from "./sim";

function inPower(seed = 9, party = "grn") {
  const s = G.newGame(seed, party);
  s.gov = { parties: [s.party], head: s.you, since: s.week };
  if (G.sys(s).exec === "presidential") s.president = s.you;
  P.newGovernment(s);
  return s;
}

function weeks(s: G.GameState, n: number) {
  for (let i = 0; i < n; i++) {
    G.endTurn(s);
    if (s.election) G.closeElection(s);
    if (s.talks) G.chooseGovernment(s, 0);
    if (s.over) break;
  }
}

const tpl = (name: string) => ({ ...St.TEMPLATES.find((t) => t.name === name)!, weeks: 30 });

describe("YourGov: the customisation update", () => {
  it("old saves gain the new state and laws", () => {
    const s = G.newGame(5, "ctr");
    const raw = JSON.parse(G.save(s)) as Record<string, unknown> & { laws: Record<string, number> };
    for (const k of ["studio", "soc", "wd", "gr", "ox", "laws0"]) delete raw[k];
    delete raw.laws.wealthTax;
    delete raw.laws.parliamentTerm;
    const back = G.load(JSON.stringify(raw))!;
    expect(back.studio.policies).toEqual([]);
    expect(back.soc.idx.health).toBeGreaterThan(0);
    expect(back.wd.cycle).toBe(0);
    expect(back.gr.energy).toBe(100);
    expect(back.ox.priority).toBe("none");
    expect(back.laws.wealthTax).toBe(0);
    expect(back.laws.parliamentTerm).toBe(G.sys(back).lower.term - 2);
    weeks(back, 3);
  });

  it("every policy template is within the rules, and over-ambitious policies are not", () => {
    for (const t of St.TEMPLATES) expect(typeof St.checkPolicy({ ...t, weeks: 52 }), t.name).toBe("object");
    expect(St.checkPolicy({ ...tpl("Free school meals"), cost: 0 })).toMatch(/too much/);
    expect(St.checkPolicy({ ...tpl("Free school meals"), name: "x" })).toMatch(/name/);
    expect(St.checkPolicy({ ...tpl("Free school meals"), groups: { young: 2, workers: 2 }, cost: 60 })).toMatch(/three groups/);
  });

  it("announce, deliver and drop policies; broken promises hurt", () => {
    const s = G.newGame(9, "grn");
    const before = s.goodwill.young;
    const p = St.announcePolicy(s, tpl("Free school meals")) as St.Policy;
    expect(p.status).toBe("announced");
    expect(s.goodwill.young).toBeGreaterThan(before);
    // In opposition you can't deliver it.
    if (!G.inGovernment(s)) expect(St.deliverPolicy(s, p.id)).toMatch(/government/);
    s.gov = { parties: [s.party], head: s.you, since: s.week };
    expect(St.deliverPolicy(s, p.id)).toBeNull();
    expect(p.status).toBe("delivered");
    expect(St.studioFx(s).happiness).toBeGreaterThan(0);
    expect(St.studioFx(s).budget).toBeLessThan(0);
    // A U-turn on another.
    const q = St.announcePolicy(s, tpl("Rural broadband")) as St.Policy;
    expect(St.scrapPolicy(s, q.id)).toBeNull();
    expect(q.status).toBe("scrapped");
    expect(s.counters.uTurns).toBe(1);
    // One that runs out of time.
    const r = St.announcePolicy(s, { ...tpl("Youth clubs"), weeks: 13 }) as St.Policy;
    weeks(s, 14);
    expect(r.status).toBe("broken");
  });

  it("orders of your own: stronger ones are riskier, and they work like the built-in ones", () => {
    const s = inPower();
    const mild = St.checkOrder(s, { name: "Mild order", approval: 1, cooldown: 52 }) as St.MyOrder;
    const bold = St.checkOrder(s, { name: "Bold order", approval: 4, happiness: 2, growth: 0.3, cooldown: 8 }) as St.MyOrder;
    expect(bold.risk!).toBeGreaterThan(mild.risk!);
    const o = St.saveOrder(s, { name: "Free bus travel", budget: -4, goodwill: { young: 5 }, cooldown: 26 }) as St.MyOrder;
    expect(P.orderOf(s, o.id)?.name).toBe("Free bus travel");
    const r = P.issueOrder(s, o.id);
    expect(r.ok).toBe(true);
    expect(P.issueOrder(s, o.id).ok).toBe(false);
    expect(St.deleteOrder(s, o.id)).toBe(true);
  });

  it("events of your own can be held and planned, and cost about what they do", () => {
    const s = G.newGame(9, "grn");
    const cheap = St.eventPrice({ scope: "state", boost: 1, money: 0, members: 0, unity: 0, goodwill: 0, risk: 0 });
    const dear = St.eventPrice({ scope: "national", boost: 3, money: 0, members: 0, unity: 0, goodwill: 0, risk: 0 });
    expect(dear).toBeGreaterThan(cheap);
    expect(St.checkEvent(s, { name: "Nothing", icon: "", desc: "", scope: "state", boost: 0, money: 0, members: 0, unity: 0, goodwill: 0, risk: 0 })).toMatch(/something/);
    const ev = St.saveEvent(s, { name: "Pub quiz night", icon: "🍻", desc: "", scope: "state", boost: 3, money: 0, members: 300, unity: 0, group: "workers", goodwill: 3, risk: 0.1 }) as unknown as { id: string };
    expect(G.eventOf(s, ev.id)?.kind).toBe("mine");
    expect(G.holdEvent(s, ev.id, 0).ok).toBe(true);
    expect(s.counters.myEvents).toBe(1);
    expect(typeof P.schedule(s, ev.id, s.week + 2, 1)).toBe("object");
    expect(St.deleteEvent(s, ev.id)).toBe(true);
    expect(s.plan.some((p) => p.event === ev.id)).toBe(false);
  });

  it("crises of your own must cost something, and join the pool", () => {
    const s = inPower();
    expect(St.checkCrisis(s, { title: "Free money", options: [{ label: "Take it", approval: 6, happiness: 3 }, { label: "Leave it" }] })).toMatch(/upside/);
    const c = St.saveCrisis(s, { title: "Alien landing in the capital", icon: "👽", text: "They come in peace. Probably.", options: [{ label: "Welcome them", approval: 3, budget: -10 }, { label: "Call the army", approval: 1, foreign: -10 }] }) as P.CrisisDef;
    expect(typeof c).toBe("object");
    s.studio.crisisRate = 2;
    let seen = false;
    for (let i = 0; i < 400 && !seen; i++) {
      s.crisis = null;
      s.nextCrisis = s.week;
      P.politicsWeek(s);
      if ((s.crisis as P.CrisisState | null)?.id === c.id) seen = true;
    }
    expect(seen).toBe(true);
    expect(P.crisisOf(s, c.id).title).toBe("Alien landing in the capital");
    expect(P.answerCrisis(s, 0)).toBe(true);
  });

  it("rebrands the party, but not into a rival's colours", () => {
    const s = G.newGame(9, "grn");
    const other = G.partyDefs(s).find((p) => p.id !== s.party)!;
    const me = G.party(s, s.party);
    expect(St.rebrand(s, { name: "New Dawn", short: "ND", color: other.color, slogan: "", logo: "", ideology: me.ideology })).toMatch(/close/);
    expect(St.rebrand(s, { name: "New Dawn", short: "ND", color: "#123456", slogan: "A fresh start", logo: "🌅", ideology: me.ideology })).toBeNull();
    expect(G.party(s, s.party).name).toBe("New Dawn");
    expect(s.studio.slogan).toBe("A fresh start");
    expect(St.rebrand(s, { name: "Newer Dawn", short: "NND", color: "#123456", slogan: "", logo: "", ideology: me.ideology })).toMatch(/weeks ago/);
  });

  it("your leader: a new name, a background (once), a catchphrase", () => {
    const s = G.newGame(9, "grn");
    expect(St.editLeader(s, { first: "Ada", last: "Quill", nick: "The Quill", catchphrase: "Forward together", background: "teacher" })).toBeNull();
    expect(G.fullName(G.pol(s, s.you)!)).toBe("Ada Quill");
    expect(s.goodwill.young).toBeGreaterThanOrEqual(6);
    expect(St.editLeader(s, { first: "Ada", last: "Quill", nick: "", catchphrase: "", background: "farmer" })).toMatch(/once/);
    // Saying your catchphrase helps a speech.
    const a = St.speechScore(structuredClone(s), { themes: ["economy"], tone: "sober", length: "medium", line: "Forward together, always" });
    const b = St.speechScore(structuredClone(s), { themes: ["economy"], tone: "sober", length: "medium", line: "Something else" });
    expect(a.points).toBeGreaterThan(b.points);
  });

  it("renames ministries, offices, the country and its regions", () => {
    const s = inPower();
    St.rename(s, { country: "New Avalon", head: "Chief Minister", ministries: { finance: "Treasurer" }, regions: { 0: "Northshire" } });
    expect(s.sc.name).toBe("New Avalon");
    expect(G.titles(s).head).toBe("Chief Minister");
    expect(P.ministerTitle(s, "finance")).toBe("Treasurer");
    expect(G.country(s).states[0].name).toBe("Northshire");
    // It survives a save and load.
    const back = G.load(G.save(s))!;
    expect(G.country(back).states[0].name).toBe("Northshire");
    St.rename(back, { regions: { 0: "" } });
    expect(G.country(back).states[0].name).not.toBe("Northshire");
  });

  it("national holidays: the head of government makes them, and the country enjoys them", () => {
    const s = G.newGame(9, "grn");
    expect(St.addHoliday(s, { name: "Founders' Day", icon: "🎆", week: 10 })).toMatch(/Only/);
    s.gov = { parties: [s.party], head: s.you, since: s.week };
    const w = G.weekOf(s.week + 1);
    expect(St.addHoliday(s, { name: "Founders' Day", icon: "🎆", week: w })).toBeNull();
    expect(St.addHoliday(s, { name: "Second Day", icon: "", week: w })).toMatch(/already/);
    weeks(s, 1);
    expect(s.news.some((n) => n.text.includes("Founders' Day"))).toBe(true);
  });

  it("names and amends your own bills", () => {
    const s = G.newGame(9, "grn");
    const b = G.writeBill(s, "carbonTax", 1)!;
    expect(St.nameBill(s, b.id, "The Clean Air Act")).toBeNull();
    expect(b.title).toBe("The Clean Air Act");
    expect(St.amendBill(s, b.id, 2)).toBeNull();
    expect(b.option).toBe(2);
    expect(St.amendBill(s, b.id, s.laws.carbonTax)).toMatch(/another/);
  });

  it("custom laws can say which voter groups care", () => {
    const s = G.newGame(9, "grn");
    s.parties[s.party].funds = 50;
    const law = G.draftLaw(s, { name: "Bike lanes", group: "Services", start: 0, likes: { green: 1, rural: -1, nobody: 1 }, options: [{ label: "None", pos: { e: 0, s: 0 }, fx: {} }, { label: "Everywhere", pos: { e: -0.2, s: -0.3 }, fx: { happiness: 1 } }] });
    expect(typeof law).toBe("object");
    expect((law as { likes: Record<string, number> }).likes).toEqual({ green: 1, rural: -1 });
    const g0 = s.goodwill.green;
    P.lawChanged(s, (law as { id: string }).id, 0, 1, true, true);
    expect(s.goodwill.green).toBeGreaterThan(g0);
  });

  it("the constitution: changing the term law changes the term", () => {
    const s = G.newGame(9, "grn");
    s.laws.parliamentTerm = 1;
    weeks(s, 1);
    expect(G.sys(s).lower.term).toBe(3);
  });
});

describe("YourGov: the mega super update", () => {
  it("society follows the laws", () => {
    const s = G.newGame(9, "grn");
    const h0 = S.socTarget(s, "health");
    s.laws.healthcare = 2;
    expect(S.socTarget(s, "health")).toBeGreaterThan(h0);
    for (let i = 0; i < 60; i++) S.societyWeek(s);
    expect(s.soc.idx.health).toBeGreaterThan(s.soc.idx0.health);
    expect(S.lifeExpectancy(s)).toBeGreaterThan(70);
    expect(S.societyFx(s).happiness).toBeGreaterThan(0);
  });

  it("protests form, and can be met, policed or given what they want", () => {
    const s = inPower();
    s.soc.protests.push({ id: 99, def: "climate", size: 30, week: s.week, law: "carbonTax", dir: 1, from: s.laws.carbonTax, acted: -1 });
    expect(S.answerProtest(s, 99, "meet")).toBeNull();
    expect(S.answerProtest(s, 99, "meet")).toMatch(/already/);
    expect(s.soc.protests[0].size).toBeLessThan(30);
    expect(S.answerProtest(s, 99, "join")).toMatch(/own government/);
    s.week++;
    expect(S.answerProtest(s, 99, "concede")).toBeNull();
    expect(s.soc.protests.length).toBe(0);
    expect(s.missions.some((m) => m.law === "carbonTax" && m.pledge)).toBe(true);
  });

  it("seasons turn round in the southern hemisphere", () => {
    const s = G.newGame(9, "grn");
    s.week = 30;
    expect(S.season(s)).toBe("summer");
    const south = { ...s, sc: { ...s.sc, map: { kind: "real", code: "au" } } } as unknown as G.GameState;
    expect(S.season(south)).toBe("winter");
  });

  it("the world: treaties, aid, sanctions and summits", () => {
    const s = inPower();
    for (const f of s.foreign) f.rel = 40;
    expect(W.signTreaty(s, "tradeBloc")).toBeNull();
    expect(W.signTreaty(s, "tradeBloc")).toMatch(/already/);
    expect(W.worldFx(s).growth).toBeGreaterThan(0);
    expect(W.setAid(s, 3)).toBeNull();
    expect(W.worldFx(s).budget).toBeLessThan(0);
    const f = s.foreign[0];
    expect(W.sanction(s, f.name, true)).toBeNull();
    expect(f.sanctioned).toBe(true);
    expect(W.sanction(s, f.name, false)).toBeNull();
    s.wd.summit = { kind: "world", week: s.week };
    expect(W.answerSummit(s, 0)).toBe(true);
    expect(s.wd.led).toBe(1);
    expect(W.withdrawTreaty(s, "tradeBloc")).toBeNull();
  });

  it("the campaign machine: targets, candidates, strategy, energy and holidays", () => {
    const s = G.newGame(9, "grn");
    s.parties[s.party].funds = 100;
    expect(Array.isArray(Gr.battlegrounds(s))).toBe(true);
    for (let k = 0; k < Gr.MAX_TARGETS; k++) expect(Gr.toggleTarget(s, k)).toBeNull();
    expect(Gr.toggleTarget(s, Gr.MAX_TARGETS)).toMatch(/at once/);
    expect(Gr.pickCandidate(s, 0, "star")).toBeNull();
    expect(Gr.pickCandidate(s, 0, "local")).toMatch(/already/);
    expect(Gr.grassBonus(s, 0)).toBeGreaterThan(0.05);
    Gr.setStrategy(s, "ground");
    expect(Gr.eventK(s, { scope: "state" } as never)).toBeGreaterThan(1);
    // Events tire you; a holiday stops them.
    for (let i = 0; i < 10; i++) Gr.spendEnergy(s, { scope: "state" } as never);
    expect(s.gr.energy).toBe(60);
    expect(Gr.takeHoliday(s)).toBeNull();
    expect(G.holdEvent(s, "speech").ok).toBe(false);
    expect(Gr.busTour(s, [0, 1, 2])).toMatch(/resting/);
  });

  it("a bus tour, and a get-out-the-vote drive in the last six weeks", () => {
    const s = G.newGame(9, "grn");
    s.parties[s.party].funds = 100;
    expect(Gr.busTour(s, [0, 1])).toMatch(/three/);
    expect(Gr.busTour(s, [0, 1, 2])).toBeNull();
    expect(Gr.busTour(s, [0, 1, 2])).toMatch(/weeks/);
    if (G.nextElection(s).week - s.week > 6) expect(Gr.runGotv(s)).toMatch(/six weeks/);
  });

  it("parliament: shadow cabinet, opposition days, poaching, filibusters, fast-tracks and co-sponsors", () => {
    const s = G.newGame(9, "grn");
    s.parties[s.party].funds = 100;
    if (!G.inGovernment(s)) {
      const pool = Gr.shadowPool(s);
      if (pool.length) {
        expect(Gr.appointShadow(s, "finance", pool[0].id)).toBeNull();
        expect(Gr.shadowReadiness(s)).toBeGreaterThan(3);
      }
      const r = Gr.oppositionDay(s, "carbonTax", 1);
      expect(typeof r).toBe("object");
      expect(Gr.oppositionDay(s, "carbonTax", 1)).toMatch(/weeks/);
    }
    const rival = G.running(s).find((p) => p !== s.party && G.houseBy(s)[p] > 3)!;
    expect(Gr.poach(s, rival).ok).toBe(true);
    expect(Gr.poach(s, rival).ok).toBe(false);
    // Co-sponsors need friends.
    const b = G.writeBill(s, "carbonTax", 1)!;
    const friend = G.running(s).find((p) => p !== s.party)!;
    s.parties[friend].relations[s.party] = 50;
    expect(Gr.cosponsor(s, b.id, friend)).toBeNull();
    expect(G.partyStance(s, friend, b)).toBeGreaterThan(-5);
    // Fast-tracking is for the head of government.
    expect(Gr.fastTrack(s, b.id)).toMatch(/Only/);
    s.gov = { parties: [s.party], head: s.you, since: s.week };
    expect(Gr.fastTrack(s, b.id)).toBeNull();
    expect(b.stage).toBe("house");
  });

  it("running the government: priority, State of the Nation, honours, inquiries, emergencies, reshuffle", () => {
    const s = inPower();
    expect(O.setPriority(s, "economy")).toBeNull();
    expect(O.officeFx(s).growth).toBeGreaterThan(0);
    expect(O.setPriority(s, "services")).toMatch(/weeks/);
    expect(O.honours(s, "heroes")).toBeNull();
    expect(O.honours(s, "loyalists")).toMatch(/a year/);
    expect(O.startInquiry(s, "lobbying")).toBeNull();
    weeks(s, O.INQUIRY_WEEKS + 1);
    expect(s.ox.inquiry).toBeNull();
    if (s.gov.head === s.you) {
      expect(O.declareEmergency(s)).toMatch(/no emergency|already|soon/);
      O.reshuffle(s);
      expect(Object.keys(s.cabinet).length).toBeGreaterThan(0);
    }
  });

  it("the State of the Nation falls due for the head of government", () => {
    const s = inPower();
    while (G.weekOf(s.week) !== O.SOTN_WEEK - 1) s.week++;
    s.ox.sotnYear = -1;
    O.officeWeek(s);
    s.week++;
    O.officeWeek(s);
    expect(s.ox.sotn).not.toBeNull();
    const r = O.giveSotn(s, { themes: ["economy"], tone: "hopeful", length: "short", line: "Better days" })!;
    expect(r.quote).toBe("Better days");
    expect(s.ox.sotn).toBeNull();
  });

  it("a long career with everything running stays sane", { timeout: 120_000 }, () => {
    const s = inPower(21, "ctr");
    s.parties[s.party].funds = 200;
    St.announcePolicy(s, tpl("Cut waiting lists"));
    Gr.setStrategy(s, "digital");
    for (let y = 0; y < 5 * WEEKS && !s.over; y++) {
      G.endTurn(s);
      if (s.election) G.closeElection(s);
      if (s.talks) G.chooseGovernment(s, 0);
      if (y % 9 === 0) G.holdEvent(s, "phoneBank", y % G.country(s).states.length);
      if (y % 13 === 0) for (const p of s.soc.protests) S.answerProtest(s, p.id, G.inGovernment(s) ? "meet" : "join");
    }
    const nums = [s.stats.happiness, s.stats.growth, s.stats.approval, s.stats.debt, s.wd.cycle, s.soc.trade, s.soc.homes, ...Object.values(s.soc.idx), ...Object.values(s.soc.sectors)];
    for (const v of nums) expect(Number.isFinite(v)).toBe(true);
    for (const v of Object.values(s.soc.idx)) expect(v).toBeGreaterThanOrEqual(0);
    expect(s.soc.hist.length).toBeGreaterThan(10);
  });
});
