import { describe, expect, it } from "vitest";
import { ACTIVITIES, ageUp, applyFor, buyCar, canDo, choose, continueAs, doActivity, enrolUni, EVENTS, haveBaby, interact, lifeScore, moveTo, newLife, partner, qualifies, recordDay, rel, rngFor, salary, type Life } from "./life";
import { CAREERS } from "./careers";

/** Live a whole life with a simple policy: study, work, settle down. */
function liveOut(l: Life, cap = 130) {
  for (let i = 0; i < cap && l.me.alive; i++) {
    while (l.pending.length) choose(l, 0);
    if (l.me.age >= 6 && l.me.age < 18) doActivity(l, "study");
    if (l.me.age === 18 && l.stats.smarts >= 45) enrolUni(l, l.stats.smarts >= 65 ? "engineering" : "education");
    if (l.me.age >= 18 && !l.job && l.school.stage !== "uni") {
      const c = CAREERS.find((x) => qualifies(l, x.id) === true && !x.partTime) ?? CAREERS.find((x) => qualifies(l, x.id) === true);
      if (c) applyFor(l, c.id);
    }
    if (l.me.age >= 20 && !partner(l)) doActivity(l, "date");
    doActivity(l, "gym");
    ageUp(l);
  }
  return l;
}

describe("Life", () => {
  it("is born with parents, a name and stats", () => {
    const l = newLife(42, { first: "Alex", last: "Rivers", sex: "F" });
    expect(l.me).toMatchObject({ first: "Alex", last: "Rivers", sex: "F", age: 0, alive: true });
    expect(rel(l, "mother")).toHaveLength(1);
    expect(rel(l, "father")).toHaveLength(1);
    for (const v of Object.values(l.stats)) expect(v).toBeGreaterThanOrEqual(0);
    expect(l.log[0].text).toContain("Alex Rivers");
  });

  it("goes to school, graduates and can enrol at university", () => {
    const l = newLife(7);
    l.stats.smarts = 80;
    for (let i = 0; i < 5; i++) ageUp(l);
    expect(l.school.stage).toBe("primary");
    for (let i = 0; i < 7; i++) ageUp(l);
    expect(l.school.stage).toBe("high");
    while (l.me.age < 18) ageUp(l);
    expect(l.degrees).toContain("high");
    expect(enrolUni(l, "engineering")).toContain("Harbour University");
    for (let i = 0; i < 4; i++) {
      l.school.grades = 80;
      ageUp(l);
    }
    expect(l.degrees).toContain("engineering");
  });

  it("jobs need qualifications, pay a salary and can promote", () => {
    const l = newLife(9);
    l.me.age = 22;
    l.stats.smarts = 90;
    expect(qualifies(l, "doctor")).toMatch(/degree/);
    l.degrees = ["high", "medicine"];
    expect(qualifies(l, "doctor")).toBe(true);
    let tries = 0;
    while (!l.job && tries++ < 20) applyFor(l, "doctor");
    expect(l.job?.career).toBe("doctor");
    expect(salary(l)).toBe(80000);
    const before = l.money;
    l.home = { plot: -1, owned: false, rent: 0 };
    ageUp(l);
    expect(l.money).toBeGreaterThan(before + 50000);
    l.job!.performance = 100;
    let promoted = false;
    for (let i = 0; i < 10 && !promoted; i++) {
      l.job!.performance = 100;
      ageUp(l);
      promoted = (l.job?.level ?? 0) > 0;
    }
    expect(promoted).toBe(true);
  });

  it("events offer choices that change the life", () => {
    const l = newLife(3);
    l.me.age = 30;
    l.pending = ["found-money"];
    const m = l.money;
    expect(choose(l, 1)).toContain("$120");
    expect(l.money).toBe(m + 120);
    expect(l.pending).toHaveLength(0);
    // Every event's text and choices run at a sensible age.
    let ran = 0;
    for (const e of EVENTS) {
      const setups = [false, true].map((married) => {
        const x = newLife(11);
        x.me.age = Math.min(e.max, Math.max(e.min, married ? 50 : 20));
        x.money = 100000;
        x.job = { career: "cashier", level: 0, performance: 50, years: 1 };
        x.cars = ["sedan"];
        x.home = { plot: 2, owned: false, rent: 10000 };
        x.prison = e.id.startsWith("prison") ? 3 : 0;
        x.relations.push({ npc: { id: 900, first: "Sam", last: "Lee", sex: "F", age: 30, looks: 60, smarts: 60, money: 0, job: "", alive: true }, kind: married ? "spouse" : "partner", closeness: 90 });
        if (married) x.relations.push({ npc: { id: 901, first: "Kim", last: "Lee", sex: "M", age: 25, looks: 60, smarts: 60, money: 0, job: "", alive: true }, kind: "child", closeness: 80 });
        return x;
      });
      const x = setups.find((y) => y.me.age <= e.max && (!e.when || e.when(y)));
      if (!x) continue;
      ran++;
      expect(e.text(x, rngFor(x)).length).toBeGreaterThan(5);
      for (let i = 0; i < e.choices.length; i++) {
        const y = structuredClone(x);
        y.pending = [e.id];
        expect(choose(y, i).length).toBeGreaterThan(3);
      }
    }
    expect(ran).toBeGreaterThan(EVENTS.length - 3);
  });

  it("activities have rules: age, money, once a year, prison", () => {
    const l = newLife(5);
    const gym = ACTIVITIES.find((a) => a.id === "gym")!;
    expect(canDo(l, gym)).toMatch(/12/);
    l.me.age = 20;
    l.money = 100;
    expect(canDo(l, gym)).toBe(true);
    doActivity(l, "gym");
    expect(canDo(l, gym)).toMatch(/Already/);
    l.prison = 2;
    expect(canDo(l, ACTIVITIES.find((a) => a.id === "burglary")!)).toMatch(/prison/);
  });

  it("love: dates, marriage, babies; money: houses and cars", () => {
    const l = newLife(21);
    l.me.age = 25;
    l.stats.looks = 100;
    l.money = 500000;
    for (let i = 0; i < 20 && !partner(l); i++) {
      l.doneThisYear = [];
      doActivity(l, "date");
    }
    const p = partner(l)!;
    expect(p).toBeTruthy();
    p.closeness = 100;
    for (let i = 0; i < 10 && partner(l)?.kind !== "spouse"; i++) interact(l, p.npc.id, "propose");
    expect(partner(l)?.kind).toBe("spouse");
    haveBaby(l, rngFor(l));
    expect(rel(l, "child")).toHaveLength(1);
    expect(moveTo(l, 3, 300000, true)).toContain("bought");
    expect(l.home).toMatchObject({ plot: 3, owned: true });
    expect(buyCar(l, "sedan")).toContain("Norden Aria");
    recordDay(l, { needs: 90, earned: 120, shiftScore: 80 });
    expect(l.totals.daysPlayed).toBe(1);
  });

  it("lives a whole life, ends in death and carries on as a child", () => {
    const l = liveOut(newLife(1234));
    expect(l.me.alive).toBe(false);
    expect(l.me.age).toBeGreaterThan(20);
    expect(l.me.age).toBeLessThan(125);
    expect(lifeScore(l)).toBeGreaterThan(0);
    // Make sure there's an heir and continue.
    if (!rel(l, "child").length) haveBaby(l, rngFor(l));
    const kid = rel(l, "child")[0];
    const next = continueAs(l, kid.npc.id);
    expect(next.generation).toBe(2);
    expect(next.me.first).toBe(kid.npc.first);
    expect(next.me.alive).toBe(true);
    expect(next.relations.some((r) => r.kind === "mother" || r.kind === "father")).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const a = liveOut(newLife(99));
    const b = liveOut(newLife(99));
    expect(a.me.age).toBe(b.me.age);
    expect(a.money).toBe(b.money);
    expect(a.log.length).toBe(b.log.length);
  });
});
