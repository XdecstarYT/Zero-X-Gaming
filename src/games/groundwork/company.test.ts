import { describe, expect, it } from "vitest";
import * as co from "./company";
import { COURSE, JOINT } from "./data";
import { assess, inspect } from "./jobs";
import * as m from "./model";
import { showcaseHouse } from "./showcase";

describe("the company", () => {
  it("opens with cash, a full contracts board, land for sale and builders to hire", () => {
    const c = co.newCompany("Test Builders", 7);
    expect(c.cash).toBe(co.START_CASH);
    expect(c.board.length).toBe(6);
    expect(c.listings.length).toBe(4);
    expect(c.hires.length).toBe(3);
    // A starter block a new firm can buy with a loan, whatever the luck of the draw.
    for (let seed = 1; seed < 60; seed++) {
      const n = co.newCompany("S", seed);
      expect(Math.min(...n.listings.map((l) => l.price + co.duty(l.price)))).toBeLessThanOrEqual(n.cash + co.loanLimit(n));
    }
    const cheapest = Math.min(...c.listings.map((l) => l.price + co.duty(l.price)));
    expect(cheapest).toBeLessThanOrEqual(c.cash + co.loanLimit(c));
    // A new firm is only asked to tender for small jobs.
    expect(c.board.every((x) => x.rep <= c.rep + 8)).toBe(true);
    // And it saves and loads.
    expect(co.loadCompany(JSON.stringify(c))?.name).toBe("Test Builders");
  });

  it("wins a tender priced under the rivals and loses one priced over the client's budget", () => {
    const c = co.newCompany("A", 11);
    const job = c.board[0];
    expect(co.winChance(c, job, job.fair * 0.7)).toBe(1);
    expect(co.winChance(c, job, job.max + 1)).toBe(0);
    expect(co.winChance(c, job, job.fair)).toBeGreaterThan(co.winChance(c, job, job.fair * 1.2));
    const cash = c.cash;
    const won = co.tender(c, job.id, Math.round(job.fair * 0.7));
    expect(won.won).toBe(true);
    expect(c.active.length).toBe(1);
    expect(c.cash).toBeGreaterThan(cash);
    const next = c.board[0];
    const lost = co.tender(c, next.id, next.max + 1000);
    expect(lost.won).toBe(false);
    expect(c.stats.lost).toBe(1);
  });

  it("settles a finished contract: the balance less damages and retention, which comes back in four weeks", () => {
    const c = co.newCompany("B", 3);
    const job = c.board[0];
    co.tender(c, job.id, Math.round(job.fair * 0.75));
    const a = c.active[0];
    const report = { job: co.contractJob(a), checks: [], passed: true, stars: 4.5, pay: 0, spent: 0, days: a.c.days + 2 };
    const before = c.cash;
    const r = co.settle(c, a.id, report)!;
    expect(r.damages).toBe(a.c.ld * 2);
    expect(c.cash - before).toBe(r.paid);
    expect(r.paid).toBe(a.price - a.deposit - r.damages + r.bonus - r.retention);
    expect(c.active.length).toBe(0);
    const held = c.cash;
    co.advance(c, 35, false);
    expect(c.held.length).toBe(0);
    expect(c.cash).toBeGreaterThanOrEqual(held + r.retention - 5000);
  });

  it("buys land, values a finished house on it, and sells it or rents it out", () => {
    const c = co.newCompany("C", 5);
    c.cash = 400_000;
    const l = c.listings[0];
    const p = co.buy(c, l.id) as co.Property;
    expect(typeof p).toBe("object");
    expect(c.cash).toBe(400_000 - l.price - co.duty(l.price));
    const empty = co.valuation(c, p);
    expect(empty.building).toBe(0);
    // Put the show home up on it.
    const s = showcaseHouse(m.newSite("property", null, 1e6));
    co.survey(p, assess(s, [-6, -5, 6, 5]), s.spent);
    expect(p.a?.finished).toBe(true);
    expect(p.status).toBe("vacant");
    const v = co.valuation(c, p);
    expect(v.building).toBeGreaterThan(50_000);
    expect(v.rent).toBeGreaterThan(100);
    expect(co.rentOut(c, p.id)).toBe(true);
    const cash = c.cash;
    co.advance(c, 7 - (c.day % 7), false);
    expect(c.cash).not.toBe(cash);
    expect(c.stats.rentIncome).toBeGreaterThan(0);
    const sold = co.sell(c, p.id)!;
    expect(sold.hammer).toBeGreaterThan(v.total * 0.9);
    expect(c.props.length).toBe(0);
  });

  it("hires a crew that speeds the work and costs wages, and borrows against property", () => {
    const c = co.newCompany("D", 9);
    expect(co.crewSpeed(c)).toBe(1);
    co.hire(c, c.hires[0].id);
    expect(co.crewSpeed(c)).toBeGreaterThan(1.2);
    const cash = c.cash;
    co.advance(c, 2, true);
    expect(c.cash).toBeLessThanOrEqual(cash - co.wages(c) * 2);
    const room = co.loanLimit(c);
    expect(co.borrow(c, 1e9)).toBe(room);
    expect(co.borrow(c, 1)).toBe(0);
    expect(co.repay(c, 5000)).toBe(5000);
  });

  it("a contract's brief is something the inspector can pass", () => {
    const c = co.newCompany("E", 2);
    c.rep = 70;
    let job = c.board.find((x) => x.tpl === "bungalow");
    for (let i = 0; !job && i < 200; i++) {
      c.board = [co.makeContract(c)];
      job = c.board.find((x) => x.tpl === "bungalow");
    }
    expect(job).toBeTruthy();
    co.tender(c, job!.id, Math.round(job!.fair * 0.7));
    const a = c.active[0];
    // A house that's big enough for any bungalow brief.
    const s = m.newSite("contract", null, 1e6);
    const lo = { x: -5.4, z: -4.05 };
    const hi = { x: 5.4, z: 4.05 };
    m.commit(s, m.slabRect({ x: lo.x - 0.225, z: lo.z - 0.225 }, { x: hi.x + 0.225, z: hi.z + 0.225 }));
    const y0 = 0.15 + JOINT;
    m.commit(s, [
      { k: "door", x: -1.35, y: y0, z: lo.z + 0.05625, r: 0, v: 0 },
      { k: "door", x: 2.7, y: y0, z: hi.z - 0.05625, r: 2, v: 0 },
    ]);
    m.commit(s, m.wallRect(s, lo, hi, y0, { kind: "brick", bond: "stretcher", courses: 12, v: 0 }));
    const sill = y0 + 12 * COURSE;
    for (const [x, z, r] of [[-3, lo.z, 0], [1.8, lo.z, 0], [-2.5, hi.z, 2], [0, hi.z, 2]] as const) m.commit(s, [{ k: "window", x, y: sill, z: z + (r ? -0.05625 : 0.05625), r, v: 0 }]);
    m.commit(s, m.wallRect(s, lo, hi, y0, { kind: "brick", bond: "stretcher", courses: 34, from: 12, v: 0, lintels: true }));
    m.commit(s, m.roofGen(s, lo, hi, y0 + 34 * COURSE - JOINT, { style: "gable", pitch: 30, cover: "tile", v: 0 }), true);
    const j = { ...co.contractJob(a), zone: [-7, -6, 7, 6] as [number, number, number, number] };
    const rep = inspect(s, j);
    const failed = rep.checks.filter((x) => !x.ok && x.label !== "On budget" && x.label !== "On time");
    expect(failed.map((f) => `${f.label}: ${f.detail}`)).toEqual([]);
  });
});
