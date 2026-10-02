import { describe, expect, it } from "vitest";
import { LocalBackend } from "./backend";
import { LocalTown, netWorth, quote, RULES } from "./economy";

/** A town with a hand-cranked clock. */
function fresh() {
  let t = 1_000_000;
  const town = new LocalTown(() => t);
  return { town, tick: (ms: number) => (t += ms) };
}

const money = (town: LocalTown, ...ids: string[]) => ids.reduce((a, id) => a + town.me(id).cash, 0) + town.treasuryNow;

describe("Hometown economy", () => {
  it("starts you with cash, bread and full energy", () => {
    const { town } = fresh();
    const me = town.join("a", "Alice");
    expect(me.cash).toBe(RULES.startCash);
    expect(me.inventory.bread).toBe(3);
    expect(me.energy).toBe(100);
  });

  it("works shifts on a cooldown, spends energy and regains it over time", () => {
    const { town, tick } = fresh();
    town.join("a", "Alice");
    expect(town.work("a", "farm")).toEqual({ item: "wheat", qty: 3, cash: RULES.shiftPay });
    expect(() => town.work("a", "farm")).toThrow(/catching your breath/);
    tick(RULES.shiftCooldownMs + 1);
    town.work("a", "mine");
    expect(town.me("a").inventory).toMatchObject({ wheat: 3, ore: 2 });
    expect(town.me("a").energy).toBe(100 - 2 * RULES.shiftEnergy);
    tick(RULES.energyMsPerPoint * 10);
    expect(town.me("a").energy).toBe(100 - 2 * RULES.shiftEnergy + 10);
    expect(town.eat("a")).toBe(100);
  });

  it("matches orders at the resting price with escrow, tax to the treasury, and conserves money", () => {
    const { town } = fresh();
    town.join("a", "Alice");
    town.join("b", "Bob");
    town.grant("a", "wheat", 5);
    const before = money(town, "a", "b");
    expect(town.placeOrder("a", "wheat", "sell", 10, 4)).toEqual({ filled: 0, resting: 4, order: 1 });
    expect(town.me("a").inventory.wheat).toBe(1);
    // Bob bids above the ask: he pays the ask, and the rest of his order rests.
    expect(town.placeOrder("b", "wheat", "buy", 12, 6)).toEqual({ filled: 4, resting: 2, order: 2 });
    expect(town.me("b").inventory.wheat).toBe(4);
    expect(town.me("b").cash).toBe(RULES.startCash - 40 - 24);
    expect(town.me("a").cash).toBe(RULES.startCash + 40 - 2);
    // Bob's resting bid (2 at 12) is held in escrow.
    expect(money(town, "a", "b")).toBe(before - 24);
    const s = town.snapshot();
    expect(quote(s, "wheat")).toEqual({ bid: 12, ask: 0, last: 10 });
    // Cancelling refunds the escrow.
    town.cancelOrder("b", 2);
    expect(town.me("b").cash).toBe(RULES.startCash - 40);
    expect(town.me("b").orders).toEqual([]);
    expect(money(town, "a", "b")).toBe(before);
    expect(() => town.cancelOrder("b", 2)).toThrow(/No such open order/);
  });

  it("never matches you with yourself and caps your open orders", () => {
    const { town } = fresh();
    town.join("a", "Alice");
    town.grant("a", "logs", 20);
    town.placeOrder("a", "logs", "sell", 5, 1);
    expect(town.placeOrder("a", "logs", "buy", 9, 1).filled).toBe(0);
    for (let i = 0; i < RULES.maxOrders - 2; i++) town.placeOrder("a", "logs", "sell", 50 + i, 1);
    expect(() => town.placeOrder("a", "logs", "sell", 99, 1)).toThrow(/Ten open orders/);
    expect(() => town.placeOrder("a", "logs", "sell", 0, 1)).toThrow(/Price/);
  });

  it("turns raw goods into products in a business, on a cooldown", () => {
    const { town, tick } = fresh();
    town.join("a", "Alice");
    town.grant("a", "cash", 2000);
    town.buyPlot("a", 3);
    const biz = town.foundBusiness("a", 3, "mill", "Alice Mill");
    town.grant("a", "wheat", 7);
    expect(town.produce("a", biz, 2)).toEqual({ item: "flour", qty: 4 });
    expect(() => town.produce("a", biz, 1)).toThrow(/still running/);
    tick(RULES.produceCooldownMs + 1);
    expect(() => town.produce("a", biz, 1)).toThrow(/Not enough wheat/);
    expect(town.me("a").inventory).toMatchObject({ wheat: 1, flour: 4 });
  });

  it("sells land with the business and the shop on it", () => {
    const { town } = fresh();
    town.join("a", "Alice");
    town.join("b", "Bob");
    town.grant("a", "cash", 5000);
    town.buyPlot("a", 0);
    town.foundBusiness("a", 0, "bakery", "Buns");
    town.openShop("a", 0, "Alice Goods");
    expect(() => town.buyPlot("b", 0)).toThrow(/not for sale/);
    town.listPlot("a", 0, 1000);
    town.buyPlot("b", 0);
    const p = town.snapshot().plots[0];
    expect(p.owner).toBe("b");
    expect(p.business?.name).toBe("Buns");
    expect(() => town.stockShop("a", 0, "bread", 5, 1)).toThrow(/Not your shop/);
    town.stockShop("b", 0, "bread", 5, 2);
  });

  it("runs shops: stock the shelves, customers buy, the seller pays the tax", () => {
    const { town } = fresh();
    town.join("a", "Alice");
    town.join("b", "Bob");
    town.grant("a", "cash", 2000);
    town.buyPlot("a", 5);
    town.openShop("a", 5, "Corner");
    town.stockShop("a", 5, "bread", 20, 3);
    expect(town.me("a").inventory.bread).toBeUndefined();
    const cash = town.me("a").cash;
    expect(() => town.buyShop("b", 5, "bread", 1, 15)).toThrow(/price just went up/);
    town.buyShop("b", 5, "bread", 2, 20);
    expect(town.me("b").inventory.bread).toBe(5);
    expect(town.me("a").cash).toBe(cash + 40 - 2);
    expect(() => town.buyShop("b", 5, "bread", 2, 20)).toThrow(/Not enough on the shelf/);
    expect(town.snapshot().plots[5].shop?.items).toEqual([{ item: "bread", price: 20, qty: 1 }]);
  });

  it("elects a mayor who sets the tax and the public wage", () => {
    const { town } = fresh();
    for (const id of ["a", "b", "c"]) town.join(id, id.toUpperCase());
    town.run("a", "Low taxes", 0.02, 40);
    town.run("b", "High wages", 0.1, 150);
    expect(() => town.run("a", "Again", 0.02, 40)).toThrow(/already on the ballot/);
    town.vote("a", "a");
    town.vote("b", "b");
    town.vote("c", "a");
    town.vote("c", "b");
    town.vote("c", "a");
    expect(() => town.setPolicy("a", 0.05, 60)).toThrow(/Only the mayor/);
    town.closePolls();
    const s = town.snapshot();
    expect(s.state).toMatchObject({ mayor: "a", salesTax: 0.02, publicWage: 40 });
    expect(s.election.candidates).toEqual([]);
    expect(s.news[0].text).toMatch(/A is elected mayor with 2 of 3 votes/);
    town.setPolicy("a", 0.04, 80);
    expect(town.work("b", "public").cash).toBe(80);
  });

  it("values your net worth with land, goods and escrow", () => {
    const { town } = fresh();
    town.join("a", "Alice");
    town.buyPlot("a", 1);
    const s = town.snapshot();
    const me = town.me("a");
    expect(netWorth(me, s)).toBe(me.cash + s.plots[1].price + 3 * 10);
  });
});

describe("the practice town", () => {
  it("has neighbours trading, a shop and a ballot", async () => {
    const b = new LocalBackend();
    await b.join({});
    const s = await b.snapshot();
    expect(s.citizens).toBe(7);
    expect(s.book.length).toBeGreaterThan(10);
    expect(s.plots[7].shop?.name).toMatch(/Corner Store/);
    expect(s.election.candidates).toHaveLength(2);
    const q = quote(s, "bread");
    const r = await b.placeOrder("bread", "buy", q.ask, 1);
    expect(r.filled).toBe(1);
    await expect(b.placeOrder("bread", "sell", 0, 1)).rejects.toThrow(/Price/);
    for (let i = 0; i < 10; i++) b.live(6);
    expect((await b.snapshot()).trades.length).toBeGreaterThan(0);
  });
});
