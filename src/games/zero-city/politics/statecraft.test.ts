import { describe, expect, it } from "vitest";
import type { Stats } from "../sim/sim";
import * as B from "./budget";
import * as C from "./crises";
import * as D from "./decrees";
import * as F from "./factions";
import * as L from "./legacy";
import * as Lo from "./lobbies";
import * as M from "./mandate";
import * as Me from "./media";
import * as O from "./opposition";
import { ledger, net, newPolitics, normalisePolitics, simPolicy, targets, TERM_MINUTES, type CityFacts, type PoliticsState } from "./politics";
import { statecraftHour } from "./statecraft";

const START = 8 * 60;
const DAY = 24 * 60;

function stats(o: Partial<Stats> = {}): Stats {
  return {
    population: 3_000,
    jobs: 1_600,
    workers: 1_500,
    unemployed: 60,
    demand: { R: 0.3, C: 0.2, I: 0.2, M: 0.25 },
    buildings: 300,
    cars: 100,
    peds: 50,
    congestion: 0.15,
    power: true,
    water: true,
    staff: 60,
    coverage: { police: 0.85, fire: 0.85, clinic: 0.8, school: 0.8, park: 0.7 },
    pollution: 0.04,
    cJobs: 900,
    iJobs: 700,
    tourists: 0,
    fires: 0,
    roadCondition: 1,
    roadworks: 0,
    poorRoads: 0,
    ...o,
  };
}
const facts = (o: Partial<CityFacts> = {}): CityFacts => ({ roadKm: 6, services: { police: 1, fire: 1, clinic: 1, school: 1, power: 1, water: 1, park: 2 }, lines: 2, residents: 3_000, cJobs: 900, iJobs: 700, ...o });

function town(): M.LotPoint[] {
  const pts: M.LotPoint[] = [];
  for (let i = 0; i < 40; i++) pts.push({ x: -600 + (i % 8) * 20, z: Math.floor(i / 8) * 20, pop: 40, zone: "R", tier: 2 });
  for (let i = 0; i < 30; i++) pts.push({ x: (i % 6) * 20, z: Math.floor(i / 6) * 20, pop: 60, zone: "C", tier: 3 });
  for (let i = 0; i < 30; i++) pts.push({ x: 600 + (i % 6) * 20, z: Math.floor(i / 6) * 20, pop: 50, zone: "I", tier: 2 });
  return pts;
}
function mapped(seed = 3): PoliticsState {
  const s = newPolitics(seed, START);
  s.m.districts = M.makeDistricts(seed, town());
  s.m.dstats = M.districtStats(s.m.districts, town());
  return s;
}

describe("Statecraft: the budget", () => {
  it("standard spending costs nothing extra; generous departments cost money and please their groups", () => {
    const s = newPolitics(1, START);
    const base = net(ledger(s, facts()));
    expect(B.deptCost(s.x.budget.levels, 3_000)).toBe(0);
    s.x.budget.levels.housing = 4;
    const l = ledger(s, facts());
    expect(l.upkeep.departments).toBe(Math.round(2 * 450 * (1 + 3_000 / 5_000)));
    expect(net(l)).toBeLessThan(base);
    const before = targets(newPolitics(1, START), stats(), l, 2).families;
    expect(targets(s, stats(), l, 2).families).toBeGreaterThan(before);
    // Transport funding slows road wear; safety cuts mean more fires.
    s.x.budget.levels.transport = 4;
    s.x.budget.levels.safety = 0;
    expect(simPolicy(s).wearMul!).toBeLessThan(1);
    expect(simPolicy(s).fireMul!).toBeGreaterThan(1);
  });

  it("Budget Day comes every two days; a budget that passes takes effect, two defeats cost dearly", () => {
    const s = newPolitics(2, START);
    expect(B.budgetHour(s, START + B.CYCLE)).toEqual([{ t: "budgetDay" }]);
    expect(B.setDraft(s, "culture", 3)).toBe(true);
    // With a majority of your own, it sails through.
    s.parl.seats = { civic: 9, labour: 2, enterprise: 2, green: 1, heritage: 1 };
    const ok = B.presentBudget(s, START + B.CYCLE + 60, 3_000)!;
    expect(ok.t).toBe("budgetPassed");
    expect(s.x.budget.levels.culture).toBe(3);
    expect(s.x.budget.due).toBe(false);
    // Next time, a thin chamber that hates the spending throws it out twice.
    s.parl.seats = { civic: 3, labour: 3, enterprise: 5, green: 2, heritage: 2 };
    for (const p of ["labour", "enterprise", "green", "heritage"] as const) s.parl.relations[p] = -100;
    s.cash = -5_000;
    B.budgetHour(s, s.x.budget.nextDay);
    for (const k of ["finance", "transport", "environment", "housing", "safety", "culture"] as const) B.setDraft(s, k, 4);
    const cap = (s.parl.capital = 50);
    const f1 = B.presentBudget(s, s.x.budget.nextDay + 60, 3_000)!;
    expect(f1).toMatchObject({ t: "budgetFailed", twice: false });
    const f2 = B.presentBudget(s, s.x.budget.nextDay + 120, 3_000)!;
    expect(f2).toMatchObject({ t: "budgetFailed", twice: true });
    expect(s.parl.capital).toBe(cap - 6 - 6 - 10);
    expect(s.x.budget.levels.culture).toBe(3);
  });

  it("a Budget Day ignored lapses: the old budget rolls over and you lose capital", () => {
    const s = newPolitics(3, START);
    B.budgetHour(s, START + B.CYCLE);
    const cap = s.parl.capital;
    expect(B.budgetHour(s, START + B.CYCLE + B.WINDOW)).toEqual([{ t: "budgetLapsed" }]);
    expect(s.parl.capital).toBe(cap - 8);
  });
});

describe("Statecraft: decrees", () => {
  it("decrees cost capital, skip the chamber, last a while and come back after a cooldown", () => {
    const s = newPolitics(4, START);
    s.parl.capital = 60;
    const rel = s.parl.relations.labour;
    expect(D.issue(s, "carFree", START, 0)).toBe(true);
    expect(s.parl.capital).toBe(50);
    expect(s.parl.relations.labour).toBe(rel - 3);
    expect(simPolicy(s).carShare).toBeCloseTo(0.7);
    expect(D.issue(s, "carFree", START + 60, 0)).toBe(false);
    const greens = s.mood.greens;
    D.decreeHour(s, START + 60);
    expect(s.mood.greens).toBeGreaterThan(greens);
    expect(D.decreeHour(s, START + 25 * 60)).toEqual([{ t: "decreeEnded", id: "carFree" }]);
    expect(simPolicy(s).carShare).toBeCloseTo(1);
    expect(D.canIssue(s, "carFree", START + 71 * 60)).toBe(false);
    expect(D.canIssue(s, "carFree", START + 72 * 60)).toBe(true);
  });

  it("a hiring freeze cuts upkeep; a tax amnesty brings half a day's taxes forward", () => {
    const s = newPolitics(5, START);
    s.parl.capital = 80;
    const before = ledger(s, facts()).upkeep.services;
    D.issue(s, "hiringFreeze", START, 0);
    expect(ledger(s, facts()).upkeep.services).toBeLessThan(before);
    const cash = s.cash;
    D.issue(s, "taxAmnesty", START, 10_000);
    expect(s.cash).toBe(cash + 5_000);
  });
});

describe("Statecraft: lobbies", () => {
  it("laws they like warm them up; meetings help once a day", () => {
    const s = newPolitics(6, START);
    const cold = Lo.lobbyTarget(s, "ecology");
    s.policies = ["cleanAir", "solarRoofs"];
    expect(Lo.lobbyTarget(s, "ecology")).toBe(cold + 24);
    s.parl.capital = 20;
    expect(Lo.meet(s, "ecology", START)).toBe(true);
    expect(Lo.meet(s, "ecology", START + 60)).toBe(false);
    expect(s.x.lobbies.rec.ecology.relation).toBe(18);
  });

  it("a demand met pays; a donation buys goodwill, angers the rival and leaves a trail the papers can find", () => {
    const s = newPolitics(7, START);
    const st = stats();
    s.x.lobbies.rec.unions.ask = { kind: "demand", law: "freeTransit", until: START + 1e5 };
    s.policies = ["freeTransit"];
    const funds = s.m.funds;
    const ev = Lo.lobbyHour(s, START + 60, 9, { workers: 0.3, business: 0.15, families: 0.25, greens: 0.15, seniors: 0.15 });
    expect(ev.some((e) => e.t === "lobbyMet")).toBe(true);
    expect(s.m.funds).toBe(funds + 2_000);
    s.x.lobbies.rec.commerce.ask = { kind: "offer", amount: 12_000, until: START + 1e5 };
    const unions = s.x.lobbies.rec.unions.relation;
    expect(Lo.acceptOffer(s, "commerce")).toBe(12_000);
    expect(s.x.lobbies.rec.unions.relation).toBe(unions - 8);
    expect(s.x.lobbies.exposure).toBe(30);
    s.x.lobbies.exposure = 100;
    let leaked = false;
    for (let d = 0; d < 20 && !leaked; d++) leaked = Lo.lobbyHour(s, START + d * DAY, 21, { workers: 0.3, business: 0.15, families: 0.25, greens: 0.15, seniors: 0.15 }).some((e) => e.t === "leak");
    expect(leaked).toBe(true);
    expect(s.x.lobbies.leaked).toBe(true);
    void st;
  });

  it("friends endorse you when the campaign opens; enemies campaign against you", () => {
    const s = newPolitics(8, START);
    s.x.lobbies.rec.unions.relation = 60;
    s.x.lobbies.rec.commerce.relation = -60;
    s.challenger = "Avery Lane";
    const w = s.mood.workers;
    const b = s.mood.business;
    const ev = Lo.lobbyHour(s, START, 9, { workers: 0.3, business: 0.15, families: 0.25, greens: 0.15, seniors: 0.15 });
    expect(ev.find((e) => e.t === "endorse")).toMatchObject({ for: ["unions"], against: ["commerce"] });
    expect(s.mood.workers).toBeGreaterThan(w + 4);
    expect(s.mood.business).toBeLessThan(b);
  });
});

describe("Statecraft: the press", () => {
  it("a press conference: three questions, once a day; answers move groups and outlets", () => {
    const s = newPolitics(9, START);
    const p = Me.startPress(s, stats({ congestion: 0.5 }), START)!;
    expect(p.qs).toHaveLength(3);
    expect(Me.startPress(s, stats(), START + 60)).toBeNull();
    const before = { ...s.x.media.rel };
    expect(Me.answerPress(s, 0)!.done).toBe(false);
    Me.answerPress(s, 1);
    expect(Me.answerPress(s, 2)!.done).toBe(true);
    expect(s.x.media.pressHeld).toBe(1);
    expect(s.x.media.rel).not.toEqual(before);
    // An exclusive pleases one outlet and irritates its rival.
    expect(Me.interview(s, "clarion", START)).toBe(true);
    expect(s.x.media.rel.clarion).toBeGreaterThan(before.clarion);
    expect(Me.interview(s, "ledger", START + 60)).toBe(false);
  });

  it("the outlets drift toward how close they are to you, and their readers hear about it", () => {
    const s = newPolitics(10, START);
    s.m.platform = [-0.6, -0.2];
    for (let h = 0; h < 200; h++) Me.mediaHour(s, stats());
    expect(s.x.media.rel.clarion).toBeGreaterThan(s.x.media.rel.ledger);
  });

  it("the TV debate: three rounds against the biggest rival, scored by the audience", () => {
    const s = newPolitics(11, START);
    expect(Me.startDebate(s, stats())).toBeNull();
    s.challenger = "Avery Lane";
    const d = Me.startDebate(s, stats())!;
    expect(d.qs).toHaveLength(3);
    Me.debateAnswer(s, stats(), 0);
    Me.debateAnswer(s, stats(), 1);
    const r = Me.debateAnswer(s, stats(), 2)!;
    expect(r.done).toBe(true);
    expect(s.parl.campaign.debated).toBe(true);
    expect(Me.startDebate(s, stats())).toBeNull();
  });
});

describe("Statecraft: the opposition", () => {
  it("they table bills that pass without you if they can; how you whip your members decides close ones", () => {
    const s = mapped();
    M.mandateHour(s, START, stats(), town);
    s.x.opp.nextBill = START;
    const ev = O.oppHour(s, START + 60, 9, () => null);
    const bill = ev.find((e) => e.t === "oppBill");
    expect(bill).toBeTruthy();
    const b = s.x.opp.bills[0];
    expect(b.voteAt).toBe(START + 60 + 8 * 60);
    // Oppose with a big party behind you: it falls. Support it: it passes.
    s.parl.seats = { civic: 8, labour: 2, enterprise: 2, green: 2, heritage: 1 };
    O.setStance(s, b.id, "oppose");
    const no = O.oppForecast(s, b);
    O.setStance(s, b.id, "support");
    const yes = O.oppForecast(s, b);
    expect(yes.yes).toBeGreaterThan(no.yes);
    expect(yes.passed).toBe(true);
    const policiesBefore = [...s.policies];
    const v = O.oppHour(s, b.voteAt, 17, () => null).find((e) => e.t === "oppVote");
    expect(v && v.t === "oppVote" && v.passed).toBe(true);
    expect(s.policies).not.toEqual(policiesBefore);
    expect(s.x.opp.bills).toHaveLength(0);
  });

  it("they work districts where they're strong, attack you in the campaign, and can be talked round", () => {
    const s = mapped();
    const d = s.m.districts[0].id;
    for (let h = 0; h < 30; h++) O.oppHour(s, START + h * 60, h, () => ({ civic: 0.4, labour: 0.4, enterprise: 0.1, green: 0.05, heritage: 0.05 }));
    expect(s.x.opp.effort.labour[d]).toBeGreaterThan(0);
    expect(O.oppPressure(s, d)).toBeGreaterThan(0);
    s.challenger = "X";
    const mood = s.mood.families;
    expect(O.oppHour(s, START, 19, () => null).some((e) => e.t === "attack")).toBe(true);
    expect(s.mood.families).toBeLessThan(mood);
    s.x.opp.bills = [{ id: 99, party: "labour", law: "rentCap", enable: true, voteAt: START + 1e5, stance: "free" }];
    s.parl.capital = 100;
    let gone = false;
    for (let i = 0; i < 6 && !gone; i++) gone = O.negotiate(s, 99) === true;
    expect(gone).toBe(true);
  });
});

describe("Statecraft: factions", () => {
  it("every politician belongs to a faction; a faction far from the government sours, then challenges you", () => {
    const s = newPolitics(12, START);
    for (const p of s.m.roster) s.x.factions.of[p.id] = "progressives";
    s.m.platform = [0.9, 0.9];
    for (let h = 0; h < 300; h++) F.factionHour(s, START + h * 60, 5, stats());
    expect(s.x.factions.sat.progressives).toBeLessThan(28);
    const ev = F.factionHour(s, START + 400 * 60, 20, stats());
    expect(ev.find((e) => e.t === "challenge")).toBeTruthy();
    // Concede: the platform moves their way and the challenge ends.
    s.parl.capital = 50;
    expect(F.concede(s)).toBe(true);
    expect(s.m.platform[0]).toBeLessThan(0.9);
    expect(s.x.factions.challenge).toBeNull();
  });

  it("a party ballot: loyal politicians carry you; lose it and the platform lurches", () => {
    const s = newPolitics(13, START);
    s.x.factions.challenge = { faction: "traditionalists", by: s.m.roster[0].id, at: START };
    for (const p of s.m.roster) p.loyalty = 100;
    const won = F.fight(s, START)!;
    expect(won.won).toBe(true);
    expect(s.x.factions.survived).toBe(1);
    s.x.factions.challenge = { faction: "traditionalists", by: s.m.roster[0].id, at: START };
    for (const p of s.m.roster) {
      p.loyalty = 0;
      s.x.factions.of[p.id] = "traditionalists";
    }
    for (const g of ["workers", "business", "families", "greens", "seniors"] as const) s.approval[g] = 10;
    const lost = F.fight(s, START)!;
    expect(lost.won).toBe(false);
    expect(s.x.factions.deputy).toBe(s.m.roster[0].id);
    expect(s.m.platform[1]).toBeGreaterThan(0.3);
  });
});

describe("Statecraft: crises", () => {
  it("a general strike: angry workers threaten it, refusing starts it, factories stop paying, and a deal ends it", () => {
    const s = mapped();
    s.approval.workers = 20;
    let ev: C.CrisisEvent[] = [];
    for (let d = 0; d < 10 && !s.x.crises.active; d++) ev = C.crisisHour(s, START + d * DAY, 10, stats());
    expect(s.x.crises.active?.id).toBe("strike");
    expect(ev[0].t).toBe("crisis");
    const iBefore = ledger(s, facts()).income.I;
    expect(C.respond(s, 2, START)!.t).toBe("crisisStage");
    expect(s.x.crises.active!.stage).toBe("strike");
    expect(ledger(s, facts()).income.I).toBeLessThan(iBefore * 0.5);
    const end = C.respond(s, 0, START + 60)!;
    expect(end).toEqual({ t: "crisisOver", id: "strike", outcome: "settled" });
    expect(s.x.crises.resolved).toBe(1);
  });

  it("a debt crunch: an emergency tax rise lifts every rate; ignoring it costs capital", () => {
    const s = mapped();
    s.cash = -20_000;
    C.crisisHour(s, START, 10, stats());
    expect(s.x.crises.active?.id).toBe("crunch");
    C.respond(s, 0, START);
    expect(s.taxes.R).toBeCloseTo(0.12);
    s.x.crises.last = {};
    C.crisisHour(s, START + 4 * DAY, 10, stats());
    const cap = (s.parl.capital = 40);
    const ev = C.crisisHour(s, START + 6 * DAY, 3, stats());
    expect(ev[0]).toEqual({ t: "crisisOver", id: "crunch", outcome: "default" });
    expect(s.parl.capital).toBe(cap - 10);
  });

  it("a leak turns into a corruption probe; a flood hits one district", () => {
    const s = mapped();
    s.x.lobbies.leaked = true;
    C.crisisHour(s, START, 10, stats());
    expect(s.x.crises.active?.id).toBe("probe");
    expect(s.x.lobbies.leaked).toBe(false);
    // The scapegoat: a minister goes.
    s.parl.ministers.finance = { id: 1, name: "X", party: "labour", skill: 3, loyalty: 50 };
    expect(C.respond(s, 2, START)).toEqual({ t: "crisisOver", id: "probe", outcome: "scapegoat" });
    expect(s.parl.ministers.finance).toBeNull();
    const d = s.m.districts[0].id;
    s.x.crises.active = { id: "flood", stage: "flood", until: START + 600, district: d, group: null };
    s.m.effort[d] = 40;
    C.crisisHour(s, START + 700, 3, stats());
    expect(s.m.effort[d]).toBe(20);
  });
});

describe("Statecraft: legacy and the clock", () => {
  it("achievements add up to a title", () => {
    const s = newPolitics(14, START);
    expect(L.title(s.x.legacy)).toBe("rookie");
    L.bump(s, "lawsPassed", 10);
    L.bump(s, "electionsWon");
    const fresh = L.legacyCheck(s, START, 60, false);
    expect(fresh).toEqual(expect.arrayContaining(["firstLaw", "lawmaker", "secondTerm"]));
    expect(L.points(s.x.legacy)).toBe(5 + 15 + 20);
    expect(L.title(s.x.legacy)).toBe("wardBoss");
    expect(L.legacyCheck(s, START, 60, false)).toEqual([]);
    L.legacyCheck(s, START + 3 * DAY, 60, true);
    expect(s.x.legacy.rec.daysInOffice).toBe(3);
  });

  it("the whole of Statecraft runs hour by hour, and old saves fill in", () => {
    const s = mapped();
    M.mandateHour(s, START, stats(), town);
    const ev = statecraftHour(s, START + B.CYCLE + 60, stats());
    expect(ev.some((e) => e.t === "budgetDay")).toBe(true);
    expect(ev.some((e) => e.t === "oppBill")).toBe(true);
    expect(s.x.hour).toBe(Math.floor((START + B.CYCLE + 60) / 60));
    const old = newPolitics(15, START) as Partial<PoliticsState>;
    delete old.x;
    const n = normalisePolitics(old, START);
    expect(n.x.budget.levels.finance).toBe(2);
    expect(Object.keys(n.x.opp.leaders)).toHaveLength(4);
    expect(n.x.legacy.rec.lawsPassed).toBe(0);
    void TERM_MINUTES;
  });
});

describe("statecraft strings", () => {
  it("has English text for every name, question, crisis step and achievement", async () => {
    const { en } = await import("../i18n/en");
    const keys: string[] = [];
    for (let i = 0; i < B.LEVELS; i++) keys.push(`bg.level.${i}`);
    for (const m of Object.keys(B.UNIT)) keys.push(`bg.eff.${m}`);
    for (const id of D.DECREE_IDS) keys.push(`dc.${id}`, `dcd.${id}`);
    for (const id of Lo.LOBBY_IDS) keys.push(`lb.${id}`, `lbd.${id}`);
    for (const id of Me.OUTLET_IDS) keys.push(`out.${id}`, `outd.${id}`);
    for (const q of Me.QUESTION_IDS) keys.push(`q.${q}`, `q.${q}.a`, `q.${q}.b`, `q.${q}.c`);
    for (const s of O.STYLES) keys.push(`op.style.${s}`, `op.styled.${s}`);
    for (const id of F.FACTION_IDS) keys.push(`fc.${id}`, `fcd.${id}`);
    for (const id of L.ACHIEVEMENT_IDS) keys.push(`lg.a.${id}`, `lg.ad.${id}`);
    for (const x of L.TITLES) keys.push(`lg.title.${x.id}`);
    for (const k of L.RECORD_KEYS) keys.push(`lg.rec.${k}`);
    for (const id of C.CRISIS_IDS) {
      const def = C.CRISES[id];
      keys.push(`cr.${id}.t`);
      for (const [stage, st] of Object.entries(def.stages)) {
        keys.push(`cr.${id}.${stage}`);
        if (stage !== def.first) keys.push(`nw.cs.${id}.${stage}`);
        st.options.forEach((o, i) => keys.push(`cr.${id}.${stage}.${i}`, ...[o.outcome, o.altOutcome].filter(Boolean).map((x) => `nw.cr.${x}`)));
        if (st.timeout.outcome) keys.push(`nw.cr.${st.timeout.outcome}`);
      }
    }
    expect(keys.filter((k) => !(k in en))).toEqual([]);
  });
});
