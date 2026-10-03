import { describe, expect, it } from "vitest";
import { adoptPet, ageUp, buyProperty, choose, doActivity, investValue, newLife, petCare, PROPERTIES, sellProperty, tradeShares, type Life } from "./life";

function grownUp(seed = 4): Life {
  const l = newLife(seed, { first: "Sam", last: "Lee", sex: "F" });
  while (l.me.age < 18) {
    while (l.pending.length) choose(l, 0);
    ageUp(l);
  }
  while (l.pending.length) choose(l, 0);
  l.money = 500_000;
  return l;
}

describe("Life: the mega update", () => {
  it("invests in shares that move with the market, and sells them", () => {
    const l = grownUp();
    expect(tradeShares(l, 100_000)).toMatch(/invested/);
    expect(l.money).toBe(400_000);
    for (let i = 0; i < 10; i++) {
      while (l.pending.length) choose(l, 0);
      // Keep them healthy: this is about the money.
      l.stats.health = 100;
      l.conditions = [];
      ageUp(l);
    }
    expect(l.me.alive).toBe(true);
    expect(l.invest!.history).toHaveLength(10);
    expect(l.invest!.shares).not.toBe(100_000);
    const before = l.money;
    const shares = l.invest!.shares;
    tradeShares(l, -shares);
    expect(l.money).toBe(before + shares);
    expect(l.invest!.shares).toBe(0);
  });

  it("buys rental property with 20% down; the rent pays off the loan, then pays you", () => {
    const l = grownUp(9);
    const p = PROPERTIES[0];
    buyProperty(l, 0);
    expect(l.money).toBe(500_000 - p.price * 0.2);
    expect(l.invest!.property[0].debt).toBe(p.price * 0.8);
    expect(investValue(l)).toBe(p.price * 0.2);
    while (l.pending.length) choose(l, 0);
    ageUp(l);
    expect(l.invest!.property[0].debt).toBe(p.price * 0.8 - p.rent);
    const worth = l.invest!.property[0].value - l.invest!.property[0].debt;
    const cash = l.money;
    sellProperty(l, 0);
    expect(l.money).toBe(cash + worth);
  });

  it("adopts pets that bond with you, and posts online for followers", () => {
    const l = grownUp(12);
    expect(adoptPet(l, "dog")).toMatch(/brought home a dog/);
    expect(petCare(l, 0, "play")).toMatch(/playing with/);
    expect(petCare(l, 0, "play")).toMatch(/Already done/);
    expect(l.pets![0].bond).toBe(72);
    expect(doActivity(l, "post")).toMatch(/followers|VIRAL/);
    expect(l.followers).toBeGreaterThan(0);
    expect(doActivity(l, "trip-bali")).toMatch(/Bali/);
    expect(l.travels).toEqual(["Bali"]);
  });
});
