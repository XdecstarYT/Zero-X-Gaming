import { describe, expect, it } from "vitest";
import { DAY, HOUR, MACHINES, MIN, isExtractor } from "./data";
import * as E from "./estate";
import * as sim from "./sim";

/** A fresh game with deep pockets and one plot bought. */
function withPlot(plot = "bo1", seed = 5) {
  const s = sim.newGame("wh01", seed);
  s.cash = 5_000_000;
  expect(E.buyPlot(s, plot)).toBeNull();
  return { s, p: s.estate.props[0] };
}

/** Every material the rest of the plan needs, put straight on site. */
function stockUp(p: E.Property) {
  for (const [item, n] of Object.entries(E.materialsLeft(p))) p.stock[item as keyof typeof p.stock] = Math.ceil(n as number) + 1;
}

/** A 4×4 room on the ground: foundations, walls round it with a door at the front, and a roof. */
function room(s: sim.State, id: number, door = true, roof = true) {
  E.planRect(s, id, "found", 0, 0, 3, 3, 0);
  E.planRect(s, id, "wall", 0, 0, 3, 3, 0, true);
  if (door) expect(E.plan(s, id, "door", 1, 3, 0)).toBeNull();
  if (roof) E.planRect(s, id, "roof", 0, 0, 3, 3, 1);
}

describe("WareForge real estate: planning", () => {
  it("buys land at the city's price, once, and only with the cash for it", () => {
    const s = sim.newGame("wh01", 1);
    const plot = E.plotDef("ny1");
    const price = E.plotPrice(s, plot);
    expect(price).toBeGreaterThan(E.plotPrice(s, E.plotDef("al1")));
    s.cash = price - 1;
    expect(E.buyPlot(s, "ny1")).toMatch(/cash/);
    s.cash = price + 10;
    expect(E.buyPlot(s, "ny1")).toBeNull();
    expect(s.cash).toBe(10);
    expect(E.buyPlot(s, "ny1")).toMatch(/own it/);
    expect(s.estate.props[0].land).toBe(price);
    expect(sim.worth(s)).toBeGreaterThan(price * 0.9);
  });

  it("plans by the rules: foundations first, walls on a floor, slabs held up by walls, windows outside, the zoning's height", () => {
    const { s, p } = withPlot("ha1");
    const id = p.id;
    expect(E.plan(s, id, "wall", 2, 2, 0)).toMatch(/floor/);
    expect(E.plan(s, id, "slab", 2, 2, 0)).toMatch(/foundations/);
    expect(E.plan(s, id, "found", 2, 2, 1)).toMatch(/ground|Nothing below/);
    expect(E.planRect(s, id, "found", 0, 0, 6, 5, 0).placed).toBe(42);
    // Nothing to stand on yet upstairs: no wall below within reach.
    expect(E.plan(s, id, "slab", 3, 3, 1)).toMatch(/wall/);
    expect(E.plan(s, id, "wall", 0, 2, 0)).toBeNull();
    expect(E.plan(s, id, "slab", 3, 2, 1)).toBeNull();
    expect(E.plan(s, id, "slab", 4, 2, 1)).toMatch(/wall/);
    // Windows only on the outside.
    expect(E.plan(s, id, "window", 3, 3, 0)).toMatch(/outside/);
    expect(E.plan(s, id, "window", 6, 3, 0)).toBeNull();
    // A different part replaces a planned one; the same one is already there.
    expect(E.plan(s, id, "wall", 6, 3, 0)).toBeNull();
    expect(E.plan(s, id, "wall", 6, 3, 0)).toMatch(/Already planned/);
    // Hartford is zoned for three storeys: stairs need a storey above them, roofs can go on top.
    expect(E.plan(s, id, "wall", 0, 0, 3)).toMatch(/Zoned for 3/);
    // Taking away a wall that holds something up isn't allowed (the one at the far side is within 6 m too, so it goes first).
    expect(E.unplan(s, id, 6, 3, 0)).toBeNull();
    expect(E.unplan(s, id, 0, 2, 0)).toMatch(/fall/);
    expect(E.unplan(s, id, 3, 2, 1)).toBeNull();
    expect(E.unplan(s, id, 0, 2, 0)).toBeNull();
  });

  it("a room is a unit when it's walled in, roofed over, and has a door in", () => {
    const { s, p } = withPlot("ha1");
    room(s, p.id);
    const lay = E.units(p, true);
    expect(lay.units).toHaveLength(1);
    expect(lay.units[0]).toMatchObject({ type: "flat", cells: 4, area: 16, levels: [0] });
    // No door, no roof, a gap in the wall: not a unit, and the plan says why.
    const b = withPlot("ha1", 6);
    room(b.s, b.p.id, false);
    expect(E.units(b.p, true).units).toHaveLength(0);
    expect(E.units(b.p, true).problems[0]).toMatch(/door/);
    const c = withPlot("ha1", 7);
    room(c.s, c.p.id, true, false);
    expect(E.units(c.p, true).problems[0]).toMatch(/roof/);
    expect(E.unplan(c.s, c.p.id, 3, 1, 0)).toBeNull();
    expect(E.units(c.p, true).problems[0]).toMatch(/walled/);
    // Built parts only, until they're up.
    expect(E.units(p).units).toHaveLength(0);
  });

  it("every ready-made design gives lettable units on every plot it's allowed on", () => {
    const s = sim.newGame("wh01", 2);
    s.cash = 1e9;
    for (const plot of E.PLOTS)
      for (const tpl of Object.keys(E.TEMPLATES) as E.Template[]) {
        if (!E.TEMPLATES[tpl].zones.includes(plot.zone)) continue;
        s.estate.props = [];
        E.buyPlot(s, plot.id);
        const p = s.estate.props[0];
        expect(E.applyTemplate(s, p.id, tpl, 3)).toBeNull();
        const lay = E.units(p, true);
        expect(lay.problems, `${plot.id} ${tpl}`).toEqual([]);
        expect(lay.units.length, `${plot.id} ${tpl}`).toBeGreaterThan(0);
        if (tpl === "house") expect(lay.units.map((u) => u.type)).toEqual(["house"]);
        if (tpl === "apartments") expect(lay.halls).toBe(1);
        if (tpl === "terrace") expect(lay.units.every((u) => u.type === "house" && u.levels.length === 3)).toBe(true);
      }
    // Not in the wrong zone.
    s.estate.props = [];
    E.buyPlot(s, "ph1");
    expect(E.applyTemplate(s, s.estate.props[0].id, "house", 2)).toMatch(/zone/);
  });

  it("copies a storey up and roofs it over", () => {
    const { s, p } = withPlot("bo1");
    E.planRect(s, p.id, "found", 0, 0, 7, 5, 0);
    E.planRect(s, p.id, "wall", 0, 0, 7, 5, 0, true);
    E.plan(s, p.id, "door", 3, 5, 0);
    E.plan(s, p.id, "stairs", 1, 1, 0);
    const up = E.copyUp(s, p.id, 1);
    expect(up.placed).toBeGreaterThan(40);
    expect(E.floorAt(p, 4, 3, 1)?.k).toBe("slab");
    expect(E.fillAt(p, 0, 3, 1)?.k).toBe("wall");
    expect(E.roofOver(s, p.id).placed).toBe(48);
    expect(E.units(p, true).units.map((u) => u.type)).toEqual(["house"]);
  });
});

describe("WareForge real estate: building", () => {
  it("waits for the permit, then lays the walls brick by brick from materials on site", () => {
    const { s, p } = withPlot("ha1");
    room(s, p.id);
    expect(E.applyPermit(s, p.id)).toBeNull();
    expect(p.permit).toBe("pending");
    E.hireCrew(s, p.id, "concrete", 1, 0);
    E.hireCrew(s, p.id, "brick", 1, 0);
    // Crews get paid while they wait; nothing gets built.
    s.time = 8 * HOUR;
    const paid = s.ledger.estate;
    sim.tick(s, 30 * MIN);
    expect(s.ledger.estate).toBeGreaterThan(paid);
    expect(p.parts.every((x) => x.prog === 0 && !x.done)).toBe(true);
    for (let i = 0; i < 12 && p.permit !== "granted"; i++) sim.tick(s, HOUR);
    expect(p.permit).toBe("granted");
    // No materials: the crew is short.
    s.time = Math.ceil(s.time / DAY) * DAY + 8 * HOUR;
    sim.tick(s, 10 * MIN);
    expect(p.short).toContain("concrete");
    stockUp(p);
    const concrete = p.stock.concrete!;
    sim.tick(s, 60 * MIN);
    expect(p.stock.concrete!).toBeLessThan(concrete);
    expect(p.parts.filter((x) => x.k === "found" && x.done).length).toBeGreaterThan(0);
    // Walls only go up on finished floors, a few bricks a minute.
    for (let i = 0; i < 6 * 60 && !p.parts.some((x) => x.k === "wall" && x.prog > 0); i++) sim.tick(s, MIN);
    const wall = p.parts.find((x) => x.k === "wall" && x.prog > 0)!;
    expect(E.floorAt(p, wall.x, wall.z, 0)?.done).toBe(true);
    const before = p.bricks;
    sim.tick(s, 10 * MIN);
    expect(p.bricks - before).toBeGreaterThanOrEqual(50);
    expect(p.bricks - before).toBeLessThanOrEqual(70);
    // Lend a hand: a course laid by the boss.
    const laid = p.bricks;
    const w2 = p.parts.find((x) => x.k === "wall" && !x.done && E.workable(p, x) && x.prog < 0.5)!;
    expect(E.layCourse(s, p.id, w2.x, w2.z, 0)).toBeNull();
    expect(p.bricks - laid).toBe(25);
  });

  it("sends materials from the warehouse by truck, and orders them straight to site", () => {
    const s = sim.newGame("wh31", 4);
    s.cash = 1e6;
    E.buyPlot(s, "pi1");
    const p = s.estate.props[0];
    // The opening shipment has the bricks; the cement's spare.
    expect(E.sendToSite(s, p.id, [{ item: "bricks", n: 3 }])).toMatch(/spare/);
    expect(E.sendToSite(s, p.id, [{ item: "cement", n: 30 }])).toMatch(/12 pallets/);
    expect(E.sendToSite(s, p.id, [{ item: "cement", n: 2 }])).toBeNull();
    const o = s.orders.find((x) => x.site === p.id)!;
    expect(o.value).toBe(0);
    expect(E.siteIncoming(s, p.id).cement).toBe(2);
    expect(E.orderToSite(s, p.id, "concrete", 4)).toBeNull();
    for (let i = 0; i < 24 && (p.stock.cement ?? 0) < 2; i++) sim.tick(s, HOUR);
    expect(p.stock.cement).toBe(2);
    expect(p.stock.concrete).toBe(4);
    expect(o.state).toBe("delivered");
    expect(s.stats.failed).toBe(0);
  });

  it("builds a block to the end: inspections, a certificate, tenants and rent; the value beats the land", () => {
    const { s, p } = withPlot("bo1", 11);
    expect(E.applyTemplate(s, p.id, "apartments", 3)).toBeNull();
    expect(E.applyPermit(s, p.id)).toBeNull();
    for (const t of E.TRADE_IDS) E.hireCrew(s, p.id, t, 4, 2);
    stockUp(p);
    for (let h = 0; h < 24 * 8 && !p.cert; h++) sim.tick(s, HOUR);
    expect(p.cert).toBe(true);
    expect(p.parts.every((x) => x.done)).toBe(true);
    expect(p.passed).toEqual(expect.arrayContaining(["foundation", "frame-0", "final"]));
    expect(p.bricks).toBeGreaterThan(10_000);
    expect(s.goals.bricks10k).toBe(true);
    expect(s.goals.topping).toBe(true);
    expect(s.goals.keys).toBe(true);
    // Let it.
    const rentIn = s.ledger.rentIn;
    for (let h = 0; h < 48; h++) sim.tick(s, HOUR);
    expect(Object.keys(p.tenants).length).toBeGreaterThan(0);
    expect(s.ledger.rentIn).toBeGreaterThan(rentIn);
    expect(E.value(s, p)).toBeGreaterThan(E.landValue(s, E.plotDef("bo1")) + p.spent * 0.4);
    // Rents too high: nobody comes, and tenants grow unhappy.
    E.setRent(s, p.id, 1.5);
    expect(p.rentLevel).toBe(1.5);
  });

  it("a failed inspection sends the worst work back to be redone", () => {
    const { s, p } = withPlot("ha1", 13);
    room(s, p.id);
    p.permit = "granted";
    for (const x of p.parts) {
      x.done = true;
      x.stage = E.PARTS[x.k].stages.length;
      x.q = 0.65;
    }
    p.inspections.push({ kind: "final", level: 0, at: s.time });
    let failed = false;
    for (let i = 0; i < 20 && !failed; i++) {
      p.inspections = [{ kind: "final", level: 0, at: s.time }];
      sim.tick(s, MIN);
      failed = p.parts.some((x) => !x.done);
    }
    expect(failed).toBe(true);
  });
});

describe("WareForge real estate: money and the market", () => {
  it("mortgages up to 60% of the value, and a sale pays it off", () => {
    const { s, p } = withPlot("ny1");
    const limit = E.mortgageLimit(s, p);
    expect(limit).toBeGreaterThan(0);
    expect(E.borrowOn(s, p.id, limit + 5_000)).toMatch(/lend/);
    const cash = s.cash;
    expect(E.borrowOn(s, p.id, limit)).toBeNull();
    expect(s.cash).toBe(cash + limit);
    sim.tick(s, 2 * HOUR);
    expect(s.ledger.interest).toBeGreaterThan(0);
    const before = s.cash;
    const v = E.value(s, p);
    expect(E.quickSell(s, p.id)).toBeNull();
    expect(s.estate.props).toHaveLength(0);
    expect(s.cash - before).toBeCloseTo(Math.round(v * E.QUICK_SALE * (1 - E.SALE_FEE)) - limit, -1);
  });

  it("buyers make offers on a listing; a finished building can be bought off the market with its tenants", () => {
    const { s, p } = withPlot("bo2");
    E.listForSale(s, p.id, E.value(s, p));
    for (let h = 0; h < 200 && !p.sale?.offer; h++) sim.tick(s, HOUR);
    expect(p.sale?.offer).toBeGreaterThan(0);
    expect(E.acceptOffer(s, p.id)).toBeNull();
    expect(s.stats.propsSold).toBe(1);
    // Listings come up.
    for (let h = 0; h < 24 * 6 && !s.estate.listings.length; h++) sim.tick(s, HOUR);
    const l = s.estate.listings[0];
    expect(l).toBeDefined();
    expect(E.buyListing(s, l.id)).toBeNull();
    const bought = s.estate.props.find((x) => x.plot === l.plot)!;
    expect(bought.cert).toBe(true);
    expect(bought.parts.every((x) => x.done)).toBe(true);
    expect(E.units(bought).units.length).toBeGreaterThan(0);
  });

  it("a fire burns parts out unless the building's insured", () => {
    const s = sim.newGame("wh01", 21);
    s.cash = 1e7;
    for (let h = 0; h < 24 * 6 && !s.estate.listings.length; h++) sim.tick(s, HOUR);
    E.buyListing(s, s.estate.listings[0].id);
    const p = s.estate.props[0];
    const done = p.parts.filter((x) => x.done).length;
    p.insured = true;
    E.fire(s, p);
    expect(p.parts.filter((x) => x.done).length).toBe(done);
    p.insured = false;
    const c = p.condition;
    E.fire(s, p);
    expect(p.parts.filter((x) => x.done).length).toBeLessThan(done);
    expect(p.condition).toBeLessThan(c);
    // The crews will have to rebuild them: they're half-done, materials already on site.
    expect(p.parts.filter((x) => !x.done).every((x) => x.paid && x.prog > 0)).toBe(true);
  });

  it("saves and loads with the estate, and old saves start with none", () => {
    const { s, p } = withPlot("bo1");
    E.applyTemplate(s, p.id, "terrace", 2);
    const back = sim.deserialize(sim.serialize(s))!;
    expect(back.estate.props[0].parts.length).toBe(p.parts.length);
    expect(E.units(back.estate.props[0], true).units.length).toBe(E.units(p, true).units.length);
    const old = JSON.parse(sim.serialize(sim.newGame("wh01", 1)));
    delete old.estate;
    delete old.ledger.estate;
    delete old.stats.bricks;
    const o = sim.deserialize(JSON.stringify(old))!;
    expect(o.estate.props).toEqual([]);
    expect(o.stats.bricks).toBe(0);
    expect(Number.isFinite(sim.worth(o))).toBe(true);
  });
});

describe("WareForge mining", () => {
  it("quarries and mines dig from the ground with no input buffer; kilns fire bricks", () => {
    expect(isExtractor("quarry")).toBe(true);
    expect(isExtractor("kiln")).toBe(false);
    const s = sim.newGame("wh31", 8);
    const q = s.structs.find((t) => t.m?.type === "quarry")!;
    expect(q.slots.every((id) => s.slots[id].kind === "out")).toBe(true);
    expect(sim.cutOff(s)).toEqual([]);
    for (let h = 0; h < 12; h++) sim.tick(s, HOUR);
    expect(s.stats.mined).toBeGreaterThan(5);
    expect(s.stats.madeItems.bricks ?? 0).toBeGreaterThan(0);
    expect(MACHINES.mineshaft.recipes.map((r) => r.output)).toEqual(["ore", "coal", "goldore"]);
  });
});
