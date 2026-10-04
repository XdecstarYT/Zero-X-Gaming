import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import {
  accessPoint,
  advance,
  buyFixture,
  buyLicence,
  canPlace,
  CATEGORY_IDS,
  EDITIONS,
  endDay,
  expand,
  fixtureRect,
  footfall,
  hire,
  levelOf,
  loadStore,
  makeChange,
  maxPay,
  newStore,
  order,
  PRODUCT_IDS,
  PRODUCTS,
  restock,
  ringUp,
  runCampaign,
  score,
  setPrice,
  shoppingList,
  tender,
  walkGrid,
  walkPath,
  willBuy,
  OPEN,
  CLOSE,
  assign,
  sellFixture,
  storeValue,
  claimGoals,
  clean,
  demandOf,
  eventFor,
  goalText,
  makeMess,
  messPenalty,
  MESS_MAX,
  setAuto,
  unitCost,
  buyUpgrade,
  cardShare,
  catchThief,
  checkMilestones,
  guardCatch,
  MILESTONES,
  priceOf,
  rating,
  repayLoan,
  RIVAL_DAY,
  rivalPull,
  shelfPrice,
  spoil,
  takeLoan,
  theftChance,
  theftLoss,
  toggleSpecial,
  writeReview,
  bulkDiscount,
  closeOf,
  coffeeChance,
  COFFEE,
  criticVerdict,
  orderCost,
  pickShopper,
  pricePromise,
  scanPerItem,
  sellCoffee,
  SHOPPER_TYPES,
  train,
  trainCost,
  wageOf,
  type ShopperKind,
  type Store,
} from "./logic";

const opened = (tier: "lite" | "ultimate" = "lite") => {
  const s = newStore(tier, "Test Mart", 3);
  s.minute = OPEN;
  return s;
};

describe("UBusiness: the store", () => {
  it("opens as a corner shop: a till, two stocked shelves, the grocery licence and $3,000", () => {
    const s = newStore("lite");
    expect(s.cash).toBe(300_000);
    expect(s.fixtures.map((f) => f.kind)).toEqual(["checkout", "shelf", "shelf"]);
    expect(s.licences).toEqual(["grocery"]);
    expect(s.fixtures[1].slots[0]).toEqual({ product: "bread", qty: 12 });
    expect(s.storage.bread).toBe(12);
  });

  it("every product has sane numbers and a home", () => {
    expect(PRODUCT_IDS.length).toBeGreaterThanOrEqual(45);
    for (const id of PRODUCT_IDS) {
      const p = PRODUCTS[id];
      expect(p.market, id).toBeGreaterThan(p.cost);
      expect(p.box, id).toBeGreaterThan(0);
      expect(CATEGORY_IDS).toContain(p.cat);
    }
    for (const c of CATEGORY_IDS) expect(PRODUCT_IDS.some((id) => PRODUCTS[id].cat === c), c).toBe(true);
  });
});

describe("Lite and Ultimate", () => {
  it("Lite sells five departments; Ultimate sells all ten", () => {
    expect(EDITIONS.lite.categories).toEqual(["grocery", "snacks", "household", "fresh", "frozen"]);
    expect(EDITIONS.ultimate.categories).toHaveLength(10);
    const s = opened("lite");
    s.xp = 100_000;
    s.cash = 10_000_000;
    expect(buyLicence(s, "snacks").ok).toBe(true);
    expect(buyLicence(s, "electronics")).toEqual({ ok: false, why: "Ultimate edition only" });
    const u = opened("ultimate");
    u.xp = 100_000;
    u.cash = 10_000_000;
    expect(buyLicence(u, "electronics").ok).toBe(true);
  });

  it("Lite tops out at a Mini Market, one member of staff, no marketing or express delivery", () => {
    const s = opened("lite");
    s.cash = 100_000_000;
    expect(expand(s).ok).toBe(true);
    expect(expand(s).ok).toBe(true);
    expect(expand(s)).toEqual({ ok: false, why: "Bigger stores need Ultimate" });
    expect(hire(s, "cashier").ok).toBe(true);
    expect(hire(s, "stocker").ok).toBe(false);
    expect(runCampaign(s, "flyers").ok).toBe(false);
    expect(order(s, "bread", 1, true).ok).toBe(false);
    s.xp = 100_000;
    expect(buyFixture(s, "selfCheckout", 10, 4, 0)).toEqual({ ok: false, why: "Ultimate edition only" });

    const u = opened("ultimate");
    u.cash = 100_000_000;
    for (let i = 0; i < 5; i++) expect(expand(u).ok).toBe(true);
    expect(expand(u).ok).toBe(false);
    for (let i = 0; i < 6; i++) expect(hire(u, i % 2 ? "stocker" : "cashier").ok).toBe(true);
    expect(hire(u, "cashier").ok).toBe(false);
    expect(runCampaign(u, "radio").ok).toBe(true);
  });

  it("licences and fixtures wait for the level", () => {
    const s = opened("ultimate");
    s.cash = 10_000_000;
    expect(buyLicence(s, "fresh")).toEqual({ ok: false, why: "Reach level 3 first" });
    expect(buyFixture(s, "fridge", 9, 4, 0)).toEqual({ ok: false, why: "Reach level 3 first" });
    s.xp = 1_200;
    expect(levelOf(s.xp)).toBe(3);
    expect(buyLicence(s, "fresh").ok).toBe(true);
  });
});

describe("stock", () => {
  it("orders cost the wholesale price and arrive in the stockroom after the delivery time", () => {
    const s = opened();
    const before = s.cash;
    expect(order(s, "pasta", 2).ok).toBe(true);
    expect(s.cash).toBe(before - PRODUCTS.pasta.cost * PRODUCTS.pasta.box * 2);
    const had = s.storage.pasta ?? 0;
    advance(s, 20);
    expect(s.storage.pasta).toBe(had);
    advance(s, 15);
    expect(s.storage.pasta).toBe(had + 40);
  });

  it("you can only order and shelve what you're licensed for, on the right fixture", () => {
    const s = opened();
    expect(order(s, "chips", 1)).toEqual({ ok: false, why: "You need the licence first" });
    expect(assign(s, s.fixtures[1].id, 2, "milk").ok).toBe(false);
    // Swapping a slot sends its stock back to the stockroom.
    const rice = s.storage.rice ?? 0;
    expect(assign(s, s.fixtures[1].id, 2, "soup").ok).toBe(true);
    expect(s.storage.rice).toBe(rice + 16);
    s.storage.soup = 100;
    expect(restock(s, s.fixtures[1].id)).toBe(30);
    expect(s.storage.soup).toBe(70);
  });

  it("fixtures need room, an aisle and a clear entrance", () => {
    const s = opened();
    s.cash = 10_000_000;
    expect(canPlace(s, { kind: "shelf", x: 6, z: 1, rot: 0 }).ok).toBe(false);
    expect(canPlace(s, { kind: "shelf", x: 6, z: 5.5, rot: 0 }).ok).toBe(false);
    expect(canPlace(s, { kind: "shelf", x: 30, z: 5, rot: 0 }).ok).toBe(false);
    const r = buyFixture(s, "shelf", 9.5, 6.3, 1);
    expect(r.ok).toBe(true);
    // Selling refunds 60% and keeps the stock.
    const cash = s.cash;
    expect(sellFixture(s, r.id!).ok).toBe(true);
    expect(s.cash).toBe(cash + 21_000);
    expect(sellFixture(s, s.fixtures[0].id)).toEqual({ ok: false, why: "Keep at least one checkout" });
  });

  it("shoppers stand in front of a fixture, cashiers behind the counter", () => {
    const s = opened();
    const till = s.fixtures[0];
    const front = accessPoint(till);
    const back = accessPoint(till, true);
    expect(front.z).toBeLessThan(till.z);
    expect(back.z).toBeGreaterThan(till.z);
    const r = fixtureRect({ ...till, rot: 1 });
    expect(r.w).toBeCloseTo(0.9);
  });
});

describe("shoppers", () => {
  it("pay up to a little over the market price, more at a well-liked store", () => {
    const s = opened();
    const rng = createRng(9);
    const n = 400;
    let at = 0;
    let over = 0;
    for (let i = 0; i < n; i++) {
      s.prices.bread = PRODUCTS.bread.market;
      if (willBuy(s, "bread", rng)) at++;
      s.prices.bread = Math.round(PRODUCTS.bread.market * 1.6);
      if (willBuy(s, "bread", rng)) over++;
    }
    expect(at / n).toBeGreaterThan(0.85);
    expect(over / n).toBe(0);
    s.reputation = 5;
    const hi = Array.from({ length: 200 }, () => maxPay(s, "bread", rng)).reduce((a, b) => a + b, 0);
    s.reputation = 0;
    const lo = Array.from({ length: 200 }, () => maxPay(s, "bread", rng)).reduce((a, b) => a + b, 0);
    expect(hi).toBeGreaterThan(lo * 1.1);
  });

  it("lists only what you're licensed to sell, and come in more at lunch, after work and with a campaign", () => {
    const s = opened("ultimate");
    const rng = createRng(4);
    for (let i = 0; i < 50; i++) for (const id of shoppingList(s, rng)) expect(PRODUCTS[id].cat).toBe("grocery");
    expect(footfall(s, OPEN - 1)).toBe(0);
    expect(footfall(s, CLOSE)).toBe(0);
    expect(footfall(s, 17.5 * 60)).toBeGreaterThan(footfall(s, 9 * 60));
    const quiet = footfall(s, 12 * 60);
    s.cash = 10_000_000;
    runCampaign(s, "billboard");
    expect(footfall(s, 12 * 60)).toBeGreaterThan(quiet * 1.9);
  });
});

describe("the till", () => {
  it("customers hand over the next note up, and change comes in the fewest notes and coins", () => {
    const rng = createRng(2);
    for (let i = 0; i < 100; i++) {
      const total = 50 + Math.floor(rng.next() * 9000);
      expect(tender(total, rng)).toBeGreaterThanOrEqual(total);
    }
    expect(makeChange(1_385)).toEqual([1_000, 200, 100, 50, 20, 10, 5]);
    expect(makeChange(0)).toEqual([]);
  });

  it("a sale books revenue, the cost of goods and anything the till got wrong", () => {
    const s = opened();
    const cash = s.cash;
    ringUp(s, [
      { product: "bread", price: 449 },
      { product: "soup", price: 199 },
    ], 50);
    expect(s.cash).toBe(cash + 648 - 50);
    expect(s.today).toMatchObject({ revenue: 648, cogs: 250, customers: 1, items: 2, tillError: 50 });
  });
});

describe("the books", () => {
  it("end of day pays rent, wages and power, books XP and opens the next morning", () => {
    const s = opened();
    s.cash = 1_000_000;
    hire(s, "cashier");
    ringUp(s, [{ product: "bread", price: 449 }]);
    const r = endDay(s);
    expect(r.rent).toBe(15_000);
    expect(r.wages).toBe(12_000);
    expect(r.power).toBe(300);
    // Some of the fresh bread goes stale overnight: that's in the profit too.
    expect(r.waste).toBeGreaterThan(0);
    expect(r.profit).toBe(449 - 180 - 15_000 - 12_000 - 300 - r.waste!);
    expect(s.cash).toBe(1_000_000 + 449 - 15_000 - 12_000 - 300);
    expect(s.day).toBe(2);
    expect(s.minute).toBe(OPEN - 30);
    expect(s.today.revenue).toBe(0);
    expect(r.xp).toBeGreaterThan(0);
  });

  it("the score is the business's value, which counts stock and fixtures, not just cash", () => {
    const s = opened();
    const v = storeValue(s);
    expect(v).toBeGreaterThan(s.cash);
    expect(score(s)).toBe(Math.floor(v / 10_000));
    order(s, "pasta", 4);
    advance(s, 40);
    // Buying stock (below the bulk deal) moves cash into stock: the value barely changes.
    expect(Math.abs(storeValue(s) - v)).toBeLessThan(10);
  });

  it("saves round-trip, and a broken save is refused", () => {
    const s = opened();
    setPrice(s, "bread", 500);
    const back = loadStore(JSON.stringify(s), "lite") as Store;
    expect(back.prices.bread).toBe(500);
    expect(loadStore("{nope", "lite")).toBeNull();
    expect(loadStore(JSON.stringify({ version: 9 }), "lite")).toBeNull();
    // An Ultimate save opened in Lite keeps to Lite's limits.
    const u = opened("ultimate");
    u.cash = 100_000_000;
    for (let i = 0; i < 5; i++) expand(u);
    for (let i = 0; i < 4; i++) hire(u, "stocker");
    const l = loadStore(JSON.stringify(u), "lite")!;
    expect(l.size).toBe(2);
    expect(l.staff).toHaveLength(1);
  });
});

describe("walking", () => {
  it("finds a way round the shelves from the door to the till", () => {
    const s = opened();
    const g = walkGrid(s);
    const path = walkPath(g, { x: 6, z: 0.3 }, accessPoint(s.fixtures[2]));
    expect(path.length).toBeGreaterThan(1);
    // No point on the way is inside a fixture.
    for (const p of path.slice(0, -1)) {
      const i = Math.floor(p.x * 2);
      const j = Math.floor(p.z * 2);
      expect(g.solid[j * g.cw + i]).toBe(0);
    }
  });
});

describe("round two: events, demand, mess, goals, standing orders", () => {
  it("each day may bring an event, the same one for a given store and day; never on day 1", () => {
    expect(eventFor(5, 1)).toBeNull();
    expect(eventFor(5, 7)).toBe(eventFor(5, 7));
    const seen = new Set(Array.from({ length: 200 }, (_, d) => eventFor(11, d + 2)));
    expect(seen.has(null)).toBe(true);
    expect(seen.size).toBeGreaterThan(5);
  });

  it("a heatwave sells cold drinks, rain keeps people home, a wholesale sale cuts costs, a strike slows deliveries", () => {
    const s = opened("ultimate");
    s.licences.push("snacks");
    const cola = demandOf(s, "cola");
    const foot = footfall(s, 12 * 60);
    s.event = "heatwave";
    expect(demandOf(s, "cola")).toBeGreaterThan(cola * 2);
    s.event = "rain";
    expect(footfall(s, 12 * 60)).toBeLessThan(foot);
    s.event = "supplier";
    expect(unitCost(s, "bread")).toBe(Math.round(PRODUCTS.bread.cost * 0.85));
    const cash = s.cash;
    order(s, "bread", 1);
    expect(s.cash).toBe(cash - unitCost(s, "bread") * 12);
    s.event = "strike";
    const at = s.minute;
    order(s, "pasta", 1);
    expect(s.orders.at(-1)!.at).toBe((s.day - 1) * 1440 + at + 90);
  });

  it("bargains get on more lists; overpriced lines get skipped", () => {
    const s = opened();
    const usual = demandOf(s, "bread");
    setPrice(s, "bread", Math.round(PRODUCTS.bread.market * 0.7));
    expect(demandOf(s, "bread")).toBeGreaterThan(usual * 1.5);
    setPrice(s, "bread", Math.round(PRODUCTS.bread.market * 1.5));
    expect(demandOf(s, "bread")).toBeLessThan(usual * 0.6);
  });

  it("mess puts shoppers off until it's cleaned; cleaners do it for you", () => {
    const s = opened();
    const rng = createRng(1);
    const foot = footfall(s, 12 * 60);
    for (let i = 0; i < 5; i++) makeMess(s, 3, 3, rng);
    expect(messPenalty(s)).toBeCloseTo(0.15);
    expect(footfall(s, 12 * 60)).toBeLessThan(foot);
    for (let i = 0; i < 20; i++) makeMess(s, 3, 3, rng);
    expect(s.mess).toHaveLength(MESS_MAX);
    const xp = s.xp;
    expect(clean(s, s.mess![0].id)).toBe(true);
    expect(s.xp).toBe(xp + 2);
    expect(s.today.cleaned).toBe(1);
    expect(hire(s, "cleaner").ok).toBe(true);
    const left = s.mess!.length;
    advance(s, 15);
    expect(s.mess!.length).toBe(left - 2);
  });

  it("goals pay out when met; the 'happy' one is settled at closing", () => {
    const s = opened();
    s.goals = [
      { kind: "serve", target: 2, reward: 1_000, xp: 10, done: false },
      { kind: "happy", target: 1, reward: 2_000, xp: 10, done: false },
      { kind: "sell", target: 2, cat: "grocery", reward: 500, xp: 5, done: false },
    ];
    for (const g of s.goals) expect(goalText(g).length).toBeGreaterThan(5);
    ringUp(s, [{ product: "bread", price: 449 }]);
    expect(claimGoals(s)).toEqual([]);
    const cash = s.cash;
    ringUp(s, [{ product: "pasta", price: 249 }]);
    expect(claimGoals(s).map((g) => g.kind)).toEqual(["serve", "sell"]);
    expect(s.cash).toBe(cash + 249 + 1_500);
    // Nobody left unhappy: the last goal pays at closing, and it's in the books.
    const r = endDay(s);
    expect(r.goals).toBe(3_500);
    expect(s.goals).toHaveLength(3);
    expect(s.goals!.every((g) => !g.done)).toBe(true);
  });

  it("standing orders (Ultimate) top up the stockroom overnight, as far as the cash goes", () => {
    const l = opened("lite");
    expect(setAuto(l, "bread", 2).ok).toBe(false);
    const s = opened("ultimate");
    expect(setAuto(s, "bread", 3).ok).toBe(true);
    s.storage.bread = 5;
    const r = endDay(s);
    expect(s.storage.bread).toBeGreaterThanOrEqual(36);
    expect(r.autoOrders).toBeGreaterThan(0);
    setAuto(s, "bread", 0);
    expect(s.auto?.bread).toBeUndefined();
  });
});

describe("the big expansion", () => {
  it("frozen and bakery departments sell from their own fixtures", () => {
    const s = opened("ultimate");
    s.cash = 10_000_000;
    s.xp = 99_999;
    expect(buyLicence(s, "frozen").ok).toBe(true);
    expect(buyLicence(s, "bakery").ok).toBe(true);
    const fz = buyFixture(s, "freezer", 3, 7, 0);
    expect(fz.ok).toBe(true);
    expect(assign(s, fz.id!, 0, "icecream").ok).toBe(true);
    expect(assign(s, fz.id!, 1, "croissant").ok).toBe(false);
    const bk = buyFixture(s, "bakery", 9.5, 7, 0);
    expect(bk.ok).toBe(true);
    expect(assign(s, bk.id!, 0, "croissant").ok).toBe(true);
    // Bakery is Ultimate only; frozen comes with Lite.
    const lite = opened();
    lite.cash = 10_000_000;
    lite.xp = 99_999;
    expect(buyLicence(lite, "frozen").ok).toBe(true);
    expect(buyLicence(lite, "bakery")).toEqual({ ok: false, why: "Ultimate edition only" });
    expect(buyFixture(lite, "bakery", 9.5, 7, 0).ok).toBe(false);
  });

  it("fresh food goes off overnight; tins don't", () => {
    const s = opened("ultimate");
    s.storage = { bread: 100, soup: 100 };
    const waste = spoil(s);
    expect(s.storage.soup).toBe(100);
    expect(s.storage.bread).toBeLessThan(100);
    // 100 in the stockroom and 12 on the shelf: 15% of 112 is 16, taken from the stockroom first.
    expect(s.storage.bread).toBe(84);
    expect(s.fixtures[1].slots[0].qty).toBe(12);
    expect(waste).toBe(16 * PRODUCTS.bread.cost);
  });

  it("specials ring up 20% off, sell faster, and promo stands allow more", () => {
    const s = opened("ultimate");
    s.cash = 10_000_000;
    s.xp = 99_999;
    const before = demandOf(s, "pasta");
    expect(toggleSpecial(s, "pasta").ok).toBe(true);
    expect(shelfPrice(s, "pasta")).toBe(Math.round(priceOf(s, "pasta") * 0.8));
    expect(demandOf(s, "pasta")).toBeGreaterThan(before * 1.8);
    expect(toggleSpecial(s, "rice")).toEqual({ ok: false, why: "Build a promo stand for another special" });
    buyFixture(s, "promo", 10, 4, 0);
    expect(toggleSpecial(s, "rice").ok).toBe(true);
    expect(toggleSpecial(s, "pasta").ok).toBe(true);
    expect(s.specials).toEqual(["rice"]);
    // Lite: one at a time, promo stands or not.
    const lite = opened();
    toggleSpecial(lite, "pasta");
    expect(toggleSpecial(lite, "rice").ok).toBe(false);
  });

  it("upgrades cost money once and change the rules", () => {
    const s = opened("ultimate");
    s.cash = 10_000_000;
    s.xp = 99_999;
    expect(cardShare(s)).toBe(0.62);
    expect(buyUpgrade(s, "tap").ok).toBe(true);
    expect(buyUpgrade(s, "tap")).toEqual({ ok: false, why: "Already fitted" });
    expect(cardShare(s)).toBe(0.85);
    const pow = endDay(structuredClone(s)).power;
    buyUpgrade(s, "led");
    expect(endDay(structuredClone(s)).power).toBe(Math.round(pow * 0.7));
    expect(buyUpgrade(opened(), "app")).toEqual({ ok: false, why: "Ultimate edition only" });
    expect(buyUpgrade(opened(), "bay")).toEqual({ ok: false, why: "Reach level 4 first" });
  });

  it("guards and CCTV deal with shoplifters; a catch puts the goods back", () => {
    const s = opened("ultimate");
    s.day = 3;
    expect(theftChance(s)).toBeCloseTo(0.04);
    s.xp = 99_999;
    s.cash = 10_000_000;
    buyUpgrade(s, "cctv");
    expect(theftChance(s)).toBeCloseTo(0.02);
    expect(guardCatch(s)).toBe(0);
    hire(s, "guard");
    expect(guardCatch(s)).toBeCloseTo(0.85);
    const had = s.storage.pasta ?? 0;
    catchThief(s, [{ product: "pasta" }]);
    expect(s.storage.pasta).toBe(had + 1);
    expect(s.today.caught).toBe(1);
    theftLoss(s, [{ price: 249 }]);
    expect(s.today.stolen).toBe(249);
    expect(theftChance(opened())).toBe(0);
  });

  it("a loan is paid back a little each evening, and counts against the business's value", () => {
    const s = opened();
    const v = storeValue(s);
    expect(takeLoan(s, "small").ok).toBe(true);
    expect(s.cash).toBe(300_000 + 500_000);
    expect(storeValue(s)).toBe(v + 500_000 - 550_000);
    expect(takeLoan(s, "small").ok).toBe(false);
    expect(takeLoan(opened(), "growth")).toEqual({ ok: false, why: "Ultimate edition only" });
    const r = endDay(s);
    expect(r.loan).toBe(55_000);
    expect(s.loan!.left).toBe(495_000);
    expect(repayLoan(s).ok).toBe(true);
    expect(s.loan).toBeNull();
  });

  it("a rival opens on day 6 and takes more shoppers from a pricey store", () => {
    const s = opened();
    for (let d = 1; d < RIVAL_DAY - 1; d++) expect(endDay(s).rivalOpened).toBeFalsy();
    expect(endDay(s).rivalOpened).toBe(true);
    expect(s.rival?.name).toBe("Bargain Barn");
    const fair = rivalPull(s);
    expect(fair).toBeGreaterThan(0);
    for (const id of PRODUCT_IDS) s.prices[id] = Math.round(PRODUCTS[id].market * 1.3);
    expect(rivalPull(s)).toBeGreaterThan(fair * 1.5);
  });

  it("trophies pay out once", () => {
    const s = opened();
    const cash = s.cash;
    ringUp(s, [{ product: "bread", price: 449 }]);
    const got = checkMilestones(s).map((m) => m.id);
    expect(got).toContain("first");
    expect(s.cash).toBe(cash + 449 + 5_000);
    expect(checkMilestones(s)).toEqual([]);
    expect(MILESTONES.length).toBeGreaterThanOrEqual(15);
  });

  it("reviews follow the shopper's mood", () => {
    const s = opened();
    const rng = createRng(4);
    for (let i = 0; i < 60; i++) writeReview(s, 0.95, "great", rng);
    expect(rating(s)).toBeGreaterThanOrEqual(4.5);
    for (let i = 0; i < 80; i++) writeReview(s, 0.1, "pricey", rng);
    expect(rating(s)).toBeLessThan(2);
    expect(s.reviews!.length).toBeLessThanOrEqual(20);
  });

  it("Halloween turns up often in the last week of October", () => {
    const oct = new Date(2026, 9, 28);
    const n = Array.from({ length: 100 }, (_, d) => eventFor(9, d + 2, oct)).filter((e) => e === "halloween").length;
    expect(n).toBeGreaterThan(40);
    const june = new Date(2026, 5, 10);
    expect(Array.from({ length: 100 }, (_, d) => eventFor(9, d + 2, june)).filter((e) => e === "halloween").length).toBeLessThan(15);
  });

  it("an old save loads with the new systems switched on", () => {
    const s = opened();
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    for (const k of ["specials", "upgrades", "reviews", "milestones", "lifetime", "loan", "rival"]) delete old[k];
    const back = loadStore(JSON.stringify(old), "lite")!;
    expect(back.specials).toEqual([]);
    expect(back.lifetime).toMatchObject({ days: 0, customers: 0 });
    expect(back.loan).toBeNull();
  });
});


describe("round three: shoppers, staff, coffee, bulk, late nights, the promise, the week", () => {
  it("shoppers come in types: families fill a basket, students go for snacks, the critic comes once a day from day 3", () => {
    const s = opened("ultimate");
    s.licences = ["grocery", "snacks", "household", "fresh"];
    const rng = createRng(8);
    const avg = (k: ShopperKind) => Array.from({ length: 300 }, () => shoppingList(s, rng, k).length).reduce((a, b) => a + b, 0) / 300;
    expect(avg("family")).toBeGreaterThan(avg("student") * 1.8);
    const snacky = (k: ShopperKind) => Array.from({ length: 300 }, () => shoppingList(s, rng, k)).flat().filter((id) => PRODUCTS[id].cat === "snacks").length;
    expect(snacky("student")).toBeGreaterThan(snacky("pensioner"));
    const kinds = new Set(Array.from({ length: 2000 }, () => pickShopper(s, rng)));
    expect(kinds.has("critic")).toBe(false);
    s.day = 3;
    expect(new Set(Array.from({ length: 4000 }, () => pickShopper(s, rng))).has("critic")).toBe(true);
    s.today.critic = true;
    expect(new Set(Array.from({ length: 2000 }, () => pickShopper(s, rng))).has("critic")).toBe(false);
    expect(maxPay(s, "bread", createRng(1), "foodie")).toBeGreaterThan(maxPay(s, "bread", createRng(1), "student"));
    expect(Object.keys(SHOPPER_TYPES)).toHaveLength(6);
  });

  it("the critic's write-up moves the reputation a long way", () => {
    const s = opened();
    const rep = s.reputation;
    expect(criticVerdict(s, 0.9).good).toBe(true);
    expect(s.reputation).toBeCloseTo(rep + 0.4);
    criticVerdict(s, 0.1);
    expect(s.reputation).toBeCloseTo(rep);
    expect(s.press).toHaveLength(2);
    expect(s.press![0].good).toBe(false);
  });

  it("staff improve with experience to level 3, training takes them to 5; better costs more", () => {
    const s = opened("ultimate");
    s.cash = 10_000_000;
    hire(s, "cashier");
    const st = s.staff[0];
    for (let d = 0; d < 5; d++) endDay(s);
    expect(st.level).toBe(2);
    for (let d = 0; d < 20; d++) endDay(s);
    expect(st.level).toBe(3);
    const cost = trainCost(st);
    const cash = s.cash;
    expect(train(s, st.id).ok).toBe(true);
    expect(s.cash).toBe(cash - cost);
    train(s, st.id);
    expect(st.level).toBe(5);
    expect(train(s, st.id).ok).toBe(false);
    expect(wageOf(st)).toBe(Math.round(12_000 * 1.4));
    expect(scanPerItem(5)).toBeLessThan(scanPerItem(1) * 0.6);
  });

  it("a coffee bar sells coffee to a share of shoppers", () => {
    const s = opened();
    s.cash = 10_000_000;
    s.xp = 99_999;
    expect(coffeeChance(s)).toBe(0);
    buyFixture(s, "coffee", 10, 4, 0);
    expect(coffeeChance(s)).toBe(0.25);
    const before = s.today.revenue;
    sellCoffee(s);
    expect(s.today.revenue).toBe(before + COFFEE.price);
    expect(s.today.coffees).toBe(1);
  });

  it("bulk orders are cheaper per box", () => {
    const s = opened();
    expect(bulkDiscount(1)).toBe(0);
    expect(bulkDiscount(5)).toBe(0.08);
    expect(bulkDiscount(12)).toBe(0.15);
    const one = orderCost(s, "pasta", 1);
    expect(orderCost(s, "pasta", 10)).toBe(Math.round(one * 10 * 0.85));
    const cash = s.cash;
    order(s, "pasta", 5);
    expect(s.cash).toBe(cash - orderCost(s, "pasta", 5));
  });

  it("the late-night licence keeps the doors open until 10pm, for a bit more in wages and power", () => {
    const s = opened();
    s.cash = 10_000_000;
    s.xp = 99_999;
    expect(closeOf(s)).toBe(CLOSE);
    expect(footfall(s, 21 * 60)).toBe(0);
    buyUpgrade(s, "late");
    expect(closeOf(s)).toBe(22 * 60);
    expect(footfall(s, 21 * 60)).toBeGreaterThan(0);
    hire(s, "cashier");
    expect(endDay(s).wages).toBe(Math.round(12_000 * 1.15));
  });

  it("a price promise halves what the rival takes today", () => {
    const s = opened();
    expect(pricePromise(s).ok).toBe(false);
    s.rival = { name: "Bargain Barn", strength: 0.3 };
    const pull = rivalPull(s);
    expect(pricePromise(s).ok).toBe(true);
    expect(rivalPull(s)).toBeCloseTo(pull / 2);
    expect(pricePromise(s).ok).toBe(false);
  });

  it("every seventh evening brings the week in review", () => {
    const s = opened();
    let week;
    for (let d = 1; d <= 7; d++) {
      ringUp(s, [{ product: "bread", price: 449 }]);
      const r = endDay(s);
      if (d < 7) expect(r.week).toBeUndefined();
      else week = r.week;
    }
    expect(week).toMatchObject({ week: 1, customers: 7, revenue: 7 * 449, best: "bread" });
  });
});
