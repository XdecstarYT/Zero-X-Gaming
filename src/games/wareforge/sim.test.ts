import { describe, expect, it } from "vitest";
import { CARRIER_FEE, CUSTOMERS, DAY, GOODS, HOUR, INDUSTRIES, ITEMS, MACHINES, MIN, OWN_CARRIER, SITES, STORES, THAW_SECS } from "./data";
import * as sim from "./sim";

const run = (s: sim.State, secs: number) => sim.tick(s, secs);

describe("WareForge simulation", () => {
  it("starts every site with doors, racks, stock, forklifts, a booked shipment and a truck on its way", () => {
    for (const d of SITES) {
      const s = sim.newGame(d.id, 3);
      expect(s.doors.length).toBe(d.doors.length);
      expect(s.forks.length).toBe(d.forklifts);
      expect(sim.score(s)).toBe(0);
      // Every bay, machine and charger can be reached (or is served by a conveyor).
      expect(sim.cutOff(s).map(({ t }) => `${d.id} ${t.kind} ${t.x},${t.z}`)).toEqual([]);
      if (!d.racks.length) continue;
      expect(s.orders.some((o) => o.code === "SHP-78442" && o.state === "confirmed")).toBe(true);
      expect(s.trucks.some((t) => t.dir === "in")).toBe(true);
      expect(sim.stock(s)).toBeGreaterThan(0);
    }
  });

  it("is deterministic for a seed", () => {
    const a = sim.newGame("wh01", 9);
    const b = sim.newGame("wh01", 9);
    run(a, 3 * HOUR);
    run(b, 3 * HOUR);
    expect(sim.serialize(a)).toBe(sim.serialize(b));
  });

  it("unloads the inbound truck into the racks and ships the first order on time", () => {
    const s = sim.newGame("wh01", 5);
    const first = s.orders.find((o) => o.code === "SHP-78442")!;
    let sawLoading = false;
    for (let t = 0; t < 6 * HOUR && first.state !== "delivered"; t += MIN) {
      run(s, MIN);
      if (sim.trackStage(s, first) === 2) sawLoading = true;
    }
    expect(s.stats.unloaded).toBeGreaterThanOrEqual(1);
    expect(sawLoading).toBe(true);
    expect(first.state).toBe("delivered");
    expect(first.onTime).toBe(true);
    expect(s.stats.revenue).toBeGreaterThan(0);
    expect(s.goals.unload && s.goals.ship1).toBe(true);
  });

  it("finds a path round racks and keeps every bay reachable", () => {
    const s = sim.newGame("wh01", 1);
    const p = sim.route(s, 2.5, 15.5, 20, 4);
    const [x, z] = p[p.length - 1];
    expect([Math.floor(x), Math.floor(z)]).toEqual([20, 4]);
    const g = sim.grid(s);
    // Every leg runs along free tiles.
    let px = 2.5;
    let pz = 15.5;
    for (const [qx, qz] of p) {
      const n = Math.round(Math.abs(qx - px) + Math.abs(qz - pz));
      for (let i = 0; i <= n; i++) {
        const tx = Math.floor(px + ((qx - px) * i) / Math.max(1, n));
        const tz = Math.floor(pz + ((qz - pz) * i) / Math.max(1, n));
        expect(g[tz * 80 + tx]).toBe(0);
      }
      px = qx;
      pz = qz;
    }
    // Walling in a rack's face is refused.
    expect(sim.placeError(s, { kind: "floor", x: 3, z: 4 })).toMatch(/block|reach/);
    expect(sim.placeError(s, { kind: "rack", x: 3, z: 15 })).toMatch(/aisle/);
    expect(sim.placeError(s, { kind: "rack", x: 3, z: 3 })).toMatch(/already/);
  });

  it("builds, buys and removes with the money it costs", () => {
    const s = sim.newGame("wh01", 2);
    const cash = s.cash;
    expect(sim.place(s, { kind: "rack", x: 15, z: 11 })).toBeNull();
    expect(s.cash).toBe(cash - 600);
    const id = s.structs.length - 1;
    expect(sim.remove(s, id)).toBeNull();
    expect(s.cash).toBe(cash - 300);
    expect(sim.buyForklift(s)).toBeNull();
    expect(s.forks.length).toBe(3);
    const po = sim.buy(s, "steel", 4)!;
    expect(po.n).toBe(4);
    expect(sim.incoming(s, "steel")).toBe(4);
  });

  it("feeds machines, makes goods and wears them", () => {
    const s = sim.newGame("wh07", 4);
    sim.buy(s, "plastic", 8);
    sim.buy(s, "fabric", 8);
    run(s, 10 * HOUR);
    expect(s.stats.made).toBeGreaterThan(2);
    expect(s.stats.madeGoods).toBeGreaterThan(0);
    const m = s.structs.find((t) => t.m)!.m!;
    expect(m.wear).toBeGreaterThan(0);
  });

  it("charges a penalty for a cancelled order and puts its pallets back", () => {
    const s = sim.newGame("wh01", 6);
    const o = s.orders.find((x) => x.code === "SHP-78442")!;
    run(s, 40 * MIN);
    const cash = s.cash;
    sim.cancel(s, o.id);
    expect(o.state).toBe("failed");
    expect(s.cash).toBeCloseTo(cash - Math.round(o.value * 0.2), 0);
    expect(Object.values(s.pallets).some((p) => p.order === o.id)).toBe(false);
  });

  it("upgrades: high-bay racking adds a level, expansion makes room for doors", () => {
    const s = sim.newGame("wh01", 8);
    s.cash = 1e6;
    const bays = s.slots.filter((x) => x.kind === "store").length;
    expect(sim.buyUpgrade(s, "highbay")).toBeNull();
    expect(s.slots.filter((x) => x.kind === "store").length).toBe(bays * 1.5);
    expect(sim.buyUpgrade(s, "door")).toBeNull();
    expect(sim.buyUpgrade(s, "door")).toMatch(/Expand/);
    expect(sim.buyUpgrade(s, "expand")).toBeNull();
    expect(sim.buyUpgrade(s, "door")).toBeNull();
    expect(sim.buyUpgrade(s, "fast2")).toBe("Needs Fast forklifts I");
  });

  it("ends the season after five days and survives a save", () => {
    const s = sim.newGame("wh01", 10);
    for (let h = 0; h < 5 * 24; h++) {
      for (const o of s.orders) if (o.state === "offer" && o.lines.every((l) => sim.availableCount(s, l.item) >= l.n)) sim.accept(s, o.id);
      for (const it of ["helmet", "chair", "bicycle", "toolkit", "phone"] as const) if (sim.stock(s, it) + sim.incoming(s, it) < 6) sim.buy(s, it, 8);
      run(s, HOUR);
    }
    expect(s.seasonOver).toBe(true);
    expect(s.stats.delivered).toBeGreaterThan(40);
    expect(sim.score(s)).toBeGreaterThan(2000);
    const back = sim.deserialize(sim.serialize(s))!;
    expect(sim.worth(back)).toBe(sim.worth(s));
    run(back, HOUR);
    expect(sim.search(back, "PAL").length).toBeGreaterThan(0);
    expect(ITEMS.helmet.name).toBe("PPE Safety Helmet");
  });
});

describe("WareForge super mega update", () => {
  it("opens the Mega hall to 78 bays and 18 doors", () => {
    const s = sim.newGame("wh01", 21);
    s.cash = 1e7;
    expect(sim.buyUpgrade(s, "mega")).toBe("Needs Site expansion");
    expect(sim.buyUpgrade(s, "expand")).toBeNull();
    expect(sim.buyUpgrade(s, "mega")).toBeNull();
    expect(sim.width(s)).toBe(78);
    while (!sim.buyUpgrade(s, "door"));
    expect(s.doors.length).toBe(18);
    expect(sim.place(s, { kind: "rack", x: 70, z: 6 })).toBeNull();
  });

  it("brings trains to the rail siding and unloads them", () => {
    const s = sim.newGame("wh01", 22);
    s.cash = 1e6;
    expect(sim.buy(s, "helmet", 16, false, true)).toBeNull();
    expect(sim.buyUpgrade(s, "rail")).toBeNull();
    const po = sim.buy(s, "helmet", 16, false, true)!;
    expect(po.n).toBe(16);
    expect(sim.purchaseCost(s, "helmet", 16, true)).toBeLessThan(sim.purchaseCost(s, "helmet", 16));
    for (let i = 0; i < 8 * 60 && s.stats.trains < 1; i++) sim.tick(s, 60);
    expect(s.stats.trains).toBe(1);
    expect(s.goals.rail1).toBe(true);
    // Nothing may be built across the rail doors.
    expect(sim.placeError(s, { kind: "floor", x: 9, z: 2 })).toMatch(/rail/);
  });

  it("drains forklift batteries and recharges them at a charging bay", () => {
    const s = sim.newGame("wh01", 23);
    const f = s.forks[0];
    f.battery = 0.1;
    for (let i = 0; i < 3 * 60 && s.stats.charges < 1; i++) sim.tick(s, 60);
    expect(s.stats.charges).toBeGreaterThanOrEqual(1);
    const g = sim.newGame("wh01", 24);
    sim.tick(g, 4 * 3600);
    expect(g.forks.some((x) => x.battery < 1)).toBe(true);
  });

  it("runs contracts: a run of shipments with a bonus for all on time", () => {
    const s = sim.newGame("wh01", 25);
    const c = sim.offerContract(s);
    expect(sim.acceptContract(s, c.id)).toBeNull();
    expect(s.orders.filter((o) => o.contract === c.id).length).toBe(c.count);
    expect(s.orders.filter((o) => o.contract === c.id).every((o) => o.state === "confirmed")).toBe(true);
    // Far-off shipments don't hold a door yet.
    const last = s.orders.filter((o) => o.contract === c.id).sort((a, b) => b.due - a.due)[0];
    if (last.due - s.time > last.transit * 60 + 8 * 3600) expect(last.door).toBe(-1);
  });

  it("moves market prices daily and runs events with their effects", () => {
    const s = sim.newGame("wh01", 26);
    const cost = sim.purchaseCost(s, "steel", 4);
    sim.startEvent(s, "strike");
    expect(sim.purchaseCost(s, "steel", 4)).toBeGreaterThan(cost);
    sim.startEvent(s, "power");
    const w = sim.newGame("wh07", 26);
    sim.startEvent(w, "power");
    w.event!.until = w.time + 10 * 3600;
    sim.tick(w, 3 * 3600);
    expect(w.stats.made).toBe(0);
    run(s, 26 * 3600);
    expect(Object.values(s.market).some((v) => v !== 1)).toBe(true);
  });

  it("starts the new sites: Harbor Gate with rail, Summit with the Mega hall and a robot cell", () => {
    const h = sim.newGame("wh09", 27);
    expect(h.rail && h.expanded).toBe(true);
    const m = sim.newGame("wh12", 27);
    expect(m.mega && m.rail).toBe(true);
    expect(sim.width(m)).toBe(78);
    expect(m.structs.some((t) => t.m?.type === "robot")).toBe(true);
    expect(m.structs.some((t) => t.kind === "charger")).toBe(true);
  });

  it("loads a save from before the update", () => {
    const s = sim.newGame("wh01", 28);
    const old = JSON.parse(sim.serialize(s));
    delete old.mega;
    delete old.rail;
    delete old.market;
    delete old.contracts;
    delete old.event;
    for (const f of old.forks) delete f.battery;
    const back = sim.deserialize(JSON.stringify(old))!;
    expect(back.forks[0].battery).toBe(1);
    run(back, 3600);
  });
});

describe("WareForge mega super update", () => {
  /** The first offer the racks can fill (asking for new ones until there is one). */
  const fillable = (s: sim.State) => {
    for (let i = 0; i < 40; i++) {
      const o = s.orders.find((x) => x.state === "offer" && x.lines.every((l) => sim.availableCount(s, l.item) >= l.n));
      if (o) return o;
      sim.offer(s);
    }
    throw new Error("no fillable offer");
  };

  it("lends against the business, charges interest by the hour and takes repayments", () => {
    const s = sim.newGame("wh01", 31);
    const worth = sim.worth(s);
    const limit = sim.creditLimit(s);
    expect(limit).toBeGreaterThan(0);
    expect(limit % 5_000).toBe(0);
    expect(sim.borrow(s, limit + 5_000)).toMatch(/limit/);
    const cash = s.cash;
    expect(sim.borrow(s, 20_000)).toBeNull();
    expect(s.cash).toBe(cash + 20_000);
    expect(s.loan).toBe(20_000);
    expect(sim.creditLimit(s)).toBeLessThan(limit);
    // A loan isn't wealth: net worth counts the debt.
    expect(sim.worth(s)).toBe(worth);
    expect(s.fx[s.fx.length - 1]).toMatchObject({ amount: 20_000, text: "Loan" });
    run(s, 24 * HOUR);
    expect(s.ledger.interest).toBeCloseTo(20_000 * sim.loanRate(s), 0);
    expect(s.cashLog.length).toBe(24);
    expect(sim.repay(s, 5_000)).toBeNull();
    expect(s.loan).toBe(15_000);
    const keep = s.cash;
    s.cash = 100;
    expect(sim.repay(s, 15_000)).toMatch(/cash/);
    s.cash = keep;
    expect(sim.repay(s, 1e6)).toBeNull();
    expect(s.loan).toBe(0);
    expect(s.stats.repaid).toBe(20_000);
    expect(sim.repay(s, 10)).toMatch(/owed/);
    // A bank partner halves the rate.
    const rate = sim.loanRate(s);
    s.cash = 1e6;
    expect(sim.buyUpgrade(s, "bank")).toBeNull();
    expect(sim.loanRate(s)).toBeCloseTo(rate / 2);
  });

  it("pays carriers 6% of a shipment, but nothing when your own truck carries it", () => {
    const s = sim.newGame("wh01", 32);
    s.cash = 1e6;
    expect(sim.buyOwnTruck(s)).toMatch(/depot/);
    expect(sim.buyUpgrade(s, "depot")).toBeNull();
    expect(sim.buyOwnTruck(s)).toBeNull();
    expect(s.ownTrucks[0]).toMatchObject({ name: "WF-01", trips: 0 });
    const first = s.orders.find((o) => o.code === "SHP-78442")!;
    const mine = fillable(s);
    expect(sim.accept(s, mine.id)).toBeNull();
    const truck = s.trucks.find((t) => t.id === mine.truck)!;
    expect(mine.own).toBe(1);
    expect(truck).toMatchObject({ own: 1, carrier: OWN_CARRIER, plate: "WF-01" });
    expect(s.ownTrucks[0].free).toBe(sim.OUT_ON_JOB);
    // A save keeps it out on the job.
    const back = sim.deserialize(sim.serialize(s))!;
    expect(back.ownTrucks[0].free).toBe(sim.OUT_ON_JOB);
    for (let t = 0; t < 12 * HOUR && !(first.state === "delivered" && mine.state === "delivered"); t += MIN) run(s, MIN);
    expect(first.state).toBe("delivered");
    expect(mine.state).toBe("delivered");
    expect(s.ledger.carriers).toBe(Math.round(first.value * CARRIER_FEE));
    expect(s.stats.ownShipped).toBe(1);
    expect(s.ownTrucks[0].trips).toBe(1);
    expect(s.ownTrucks[0].free).toBeLessThan(sim.OUT_ON_JOB);
    expect(s.goals.ownfleet).toBe(true);
  });

  it("keeps frozen goods in freezer racks and spoils them out of the cold", () => {
    const s = sim.newGame("wh15", 33);
    expect(sim.up(s, "cold")).toBe(true);
    const frozen = () => Object.values(s.pallets).filter((p) => ITEMS[p.item].frozen);
    expect(frozen().length).toBeGreaterThan(0);
    // In the freezers (the rest are on the inbound truck).
    expect(frozen().every((p) => p.loc === "truck" || s.slots[p.ref].cold)).toBe(true);
    // The first shipment of ice cream waits at the door and still goes out frozen.
    run(s, 6 * HOUR);
    expect(s.stats.spoiled).toBe(0);
    expect(s.orders.find((o) => o.code === "SHP-78442")?.state).toBe("delivered");
    expect(s.stats.coldShipped).toBe(1);
    // The dock lanes are half speed, a sixth with reefer lanes; freezers stop it.
    const lane = s.slots.find((x) => x.kind === "stage")!;
    expect(sim.warmRate(s, lane)).toBe(0.5);
    s.cash = 1e6;
    expect(sim.buyUpgrade(s, "reefer")).toBeNull();
    expect(sim.warmRate(s, lane)).toBeCloseTo(1 / 6);
    // The freezers fail: everything left in the racks spoils after THAW_SECS.
    for (const sl of s.slots) sl.cold = false;
    const n = frozen().filter((p) => p.loc === "slot" && s.slots[p.ref].kind === "store").length;
    expect(n).toBeGreaterThan(0);
    run(s, THAW_SECS + 2 * MIN);
    expect(s.stats.spoiled).toBeGreaterThanOrEqual(n - 2);
    expect(s.ledger.spoilage).toBeGreaterThan(0);
  });

  it("sets three missions a day, pays them out and writes the day's report at midnight", () => {
    const s = sim.newGame("wh01", 34);
    expect(s.missions.length).toBe(3);
    expect(new Set(s.missions.map((m) => m.kind)).size).toBe(3);
    const cash = s.cash;
    const reward = s.missions.reduce((a, m) => a + m.reward, 0);
    Object.assign(s.today, { orders: 1e6, unloads: 1e6, made: 1e6, revenue: 1e9, onTime: 1e6, moves: 1e6 });
    run(s, MIN);
    expect(s.missions.every((m) => m.done)).toBe(true);
    expect(s.stats.missions).toBe(3);
    expect(s.cash).toBeGreaterThan(cash + reward - 500);
    expect(s.fx.some((f) => f.text === "Mission")).toBe(true);
    expect(s.report).toBeNull();
    run(s, 17 * HOUR);
    expect(s.report?.day).toBe(1);
    expect(s.report!.profit).toBe(Math.round(s.report!.revenue - s.report!.costs));
    expect(s.missions.every((m) => !m.done)).toBe(true);
  });

  it("makes customers loyal with on-time deliveries; loyal customers pay more, VIPs half again", () => {
    const a = sim.newGame("wh01", 35);
    const b = sim.newGame("wh01", 35);
    for (const c of CUSTOMERS) b.customers[c.name] = { onTime: 2, late: 0 };
    expect(sim.loyalty(b, CUSTOMERS[0].name)).toBe(1);
    const oa = sim.offer(a);
    const ob = sim.offer(b);
    expect(ob.customer).toBe(oa.customer);
    expect(ob.value / oa.value).toBeCloseTo(1.03, 2);
    b.customers.X = { onTime: 10, late: 3 };
    expect(sim.LOYALTY[sim.loyalty(b, "X")]).toBe("Gold");
    expect(sim.loyalty(b, "nobody")).toBe(0);
    // A VIP delivered on time: a big boost to the reputation.
    const s = sim.newGame("wh01", 36);
    const first = s.orders.find((o) => o.code === "SHP-78442")!;
    first.vip = true;
    const rep = s.rep;
    for (let t = 0; t < 8 * HOUR && first.state !== "delivered"; t += MIN) run(s, MIN);
    expect(first.onTime).toBe(true);
    expect(s.stats.vipOnTime).toBe(1);
    expect(s.rep).toBeGreaterThanOrEqual(rep + 6);
    expect(s.customers[first.customer].onTime).toBe(1);
  });

  it("rebuilds machines as a Mk II and levels up forklift drivers", () => {
    const s = sim.newGame("wh07", 37);
    const t = s.structs.find((x) => x.m)!;
    const cycle = sim.cycleSecs(s, t);
    const cash = s.cash;
    expect(sim.upgradeMachine(s, t.id)).toBeNull();
    expect(s.cash).toBe(cash - sim.mk2Cost(t));
    expect(sim.cycleSecs(s, t)).toBeCloseTo(cycle * 0.75);
    expect(sim.upgradeMachine(s, t.id)).toMatch(/Already/);
    run(s, MIN);
    expect(s.goals.mk2).toBe(true);
    const f = s.forks[0];
    expect(sim.forkLevel(s, f)).toBe(1);
    f.trips = 54;
    expect(sim.forkLevel(s, f)).toBe(3);
    s.cash = 1e6;
    expect(sim.buyUpgrade(s, "academy")).toBeNull();
    expect(sim.forkLevel(s, f)).toBe(4);
    f.trips = 1e4;
    expect(sim.forkLevel(s, f)).toBe(5);
  });

  it("opens the Polar Cold Store and loads a save from before the update", () => {
    const p = sim.newGame("wh15", 38);
    expect(p.structs.filter((t) => t.kind === "freezer").length).toBeGreaterThanOrEqual(6);
    expect(p.slots.filter((x) => x.cold).length).toBeGreaterThan(20);
    const s = sim.newGame("wh01", 39);
    run(s, HOUR);
    const old = JSON.parse(sim.serialize(s));
    for (const k of ["loan", "cashLog", "report", "missions", "customers", "ownTrucks", "fx", "tip"]) delete old[k];
    for (const k of ["carriers", "interest", "spoilage"]) delete old.ledger[k];
    for (const k of ["borrowed", "repaid", "coldShipped", "ownShipped", "missions", "vipOnTime", "spoiled"]) delete old.stats[k];
    const back = sim.deserialize(JSON.stringify(old))!;
    expect(back.loan).toBe(0);
    expect(back.missions.length).toBe(3);
    expect(back.tip).toBeGreaterThan(10);
    expect(back.ledger.interest).toBe(0);
    run(back, 2 * HOUR);
    expect(sim.cashTrend(back)).not.toBeNaN();
    expect(Number.isFinite(sim.worth(back))).toBe(true);
  });
});

describe("WareForge industry update", () => {
  it("licenses new industries: their machines, customers and trade levels", () => {
    const s = sim.newGame("wh01", 41);
    s.cash = 500_000;
    expect(sim.placeError(s, { kind: "machine", type: "oven", x: 3, z: 9 })).toMatch(/Food & drink licence/);
    expect(sim.buyLicence(s, "food")).toBeNull();
    expect(sim.licensed(s, "food")).toBe(true);
    expect(sim.buyLicence(s, "food")).toMatch(/Already/);
    expect(sim.placeError(s, { kind: "machine", type: "oven", x: 3, z: 9 })).not.toMatch(/licence/);
    // Grocers start ordering food.
    const before = s.orders.length;
    for (let i = 0; i < 200; i++) sim.offer(s);
    const food = INDUSTRIES.find((x) => x.id === "food")!.goods;
    expect(s.orders.slice(before).some((o) => o.lines.some((l) => food.includes(l.item)))).toBe(true);
    // Making goods in a trade raises its level, and customers pay more.
    expect(sim.industryLevel(s, "food")).toBe(1);
    s.stats.madeItems.bread = 30;
    expect(sim.industryLevel(s, "food")).toBe(2);
    expect(sim.tradeBonus(s, "bread")).toBeCloseTo(1.05);
    s.stats.madeItems.cake = 60;
    expect(sim.industryLevel(s, "food")).toBe(3);
    sim.tick(s, MIN);
    expect(s.goals.licence).toBe(true);
  });

  it("every new machine's recipes use real items, and every industry's goods can be made", () => {
    for (const ind of INDUSTRIES) {
      expect(ind.machines.length).toBeGreaterThan(0);
      for (const g of ind.goods) {
        expect(ITEMS[g].tier).toBe("goods");
        expect(Object.values(MACHINES).some((m) => m.recipes.some((r) => r.output === g))).toBe(true);
      }
      for (const t of ind.machines) for (const r of MACHINES[t].recipes) expect(r.inputs.length).toBeLessThanOrEqual(MACHINES[t].d);
    }
    expect(GOODS.length).toBeGreaterThan(20);
  });

  it("runs the bakery: the mill's flour rides the conveyor into the oven, and out comes bread", () => {
    const s = sim.newGame("wh21", 42);
    expect(sim.licensed(s, "food")).toBe(true);
    const belt = s.structs.find((t) => t.kind === "belt")!;
    expect(belt).toBeDefined();
    sim.setAuto(s, "wheat", 3, 6);
    run(s, 10 * HOUR);
    expect(s.stats.belted).toBeGreaterThan(0);
    expect(s.stats.madeItems.flour ?? 0).toBeGreaterThan(0);
    expect(s.stats.madeItems.bread ?? 0).toBeGreaterThan(0);
    expect(s.goals.belt).toBe(true);
    expect(s.goals.bread).toBe(true);
    const oven = s.structs.find((t) => t.m?.type === "oven")!;
    expect(oven.m!.util).toBeGreaterThan(0);
  });

  it("forklifts collect from the end of a conveyor, and conveyors don't need forklift access", () => {
    const s = sim.newGame("wh01", 43);
    s.cash = 500_000;
    // A press making shells with a conveyor running off its output end into open floor.
    expect(sim.place(s, { kind: "machine", type: "press", x: 4, z: 9 })).toBeNull();
    const press = s.structs[s.structs.length - 1];
    sim.setRecipe(s, press.id, 1);
    expect(sim.place(s, { kind: "belt", x: 8, z: 9, rot: 0 })).toBeNull();
    expect(sim.place(s, { kind: "belt", x: 9, z: 9, rot: 0 })).toBeNull();
    expect(sim.outBelts(s, press).length).toBe(1);
    sim.buy(s, "plastic", 6, true);
    run(s, 8 * HOUR);
    expect(s.stats.madeItems.shell ?? 0).toBeGreaterThan(0);
    // The shells went down the conveyor and the forklifts took them off the end.
    const onBelts = Object.values(s.pallets).filter((p) => p.loc === "slot" && s.slots[p.ref].kind === "belt").length;
    expect(sim.stock(s, "shell") - onBelts).toBeGreaterThan(0);
    // A conveyor can't go across the aisle.
    expect(sim.placeError(s, { kind: "belt", x: 6, z: 15, rot: 0 })).toMatch(/aisle/);
  });

  it("moves things: a rack to a new spot, a mirrored machine, a conveyor turned round", () => {
    const s = sim.newGame("wh20", 44);
    expect(s.structs.filter((t) => t.kind === "rack").length).toBe(0);
    expect(sim.place(s, { kind: "rack", x: 4, z: 4 })).toBeNull();
    const rack = s.structs[s.structs.length - 1];
    const cash = s.cash;
    expect(sim.move(s, rack.id, 10, 4)).toBeNull();
    expect(s.cash).toBe(cash);
    expect(rack.dead).toBe(true);
    expect(sim.structAt(s, 10, 4)?.kind).toBe("rack");
    expect(sim.structAt(s, 4, 4)).toBeNull();
    expect(sim.place(s, { kind: "machine", type: "saw", x: 5, z: 9 })).toBeNull();
    const saw = s.structs[s.structs.length - 1];
    const inX = () => s.slots[sim.structAt(s, 5, 9)!.slots[0]].x;
    expect(inX()).toBe(5);
    expect(sim.move(s, saw.id, 5, 9, 1)).toBeNull();
    expect(inX()).toBe(7);
    expect(sim.place(s, { kind: "belt", x: 12, z: 9, rot: 0 })).toBeNull();
    const b = sim.structAt(s, 12, 9)!;
    expect(sim.move(s, b.id, 12, 9, 2)).toBeNull();
    expect(sim.structAt(s, 12, 9)!.rot).toBe(2);
    // Not while it's holding something.
    const r2 = sim.structAt(s, 10, 4)!;
    const p = Object.values(s.pallets)[0];
    if (p) {
      s.slots[r2.slots[0]].pallet = p.id;
      expect(sim.move(s, r2.id, 14, 4)).toMatch(/Empty it/);
    }
  });

  it("opens stores: restocked by truck from the warehouse, they sell by the hour at your prices", () => {
    const s = sim.newGame("wh01", 45);
    s.cash = 500_000;
    expect(sim.openStore(s, "grocery", "Boston")).toMatch(/licence/);
    expect(sim.openStore(s, "discount", "New York")).toBeNull();
    expect(sim.openStore(s, "discount", "New York")).toMatch(/already/);
    const st = s.stores[0];
    expect(st.name).toBe("New York Discount store");
    // It sent for stock straight away (helmets, chairs and the rest from the racks).
    const rst = s.orders.find((o) => o.store === st.id)!;
    expect(rst).toBeDefined();
    expect(rst.value).toBe(0);
    run(s, 14 * HOUR);
    expect(s.stats.restocks).toBeGreaterThan(0);
    expect(s.ledger.retail).toBeGreaterThan(0);
    expect(st.total).toBeGreaterThan(0);
    expect(s.ledger.stores).toBeGreaterThan(0);
    expect(s.goals.store1).toBe(true);
    // Dearer shelves sell less.
    const sell = (price: number) => {
      const t = sim.newGame("wh01", 46);
      t.cash = 1e6;
      sim.openStore(t, "discount", "Philadelphia");
      const x = t.stores[0];
      x.auto = false;
      x.stock = { helmet: 50, chair: 50, toolkit: 50, bicycle: 50 };
      x.staff = 6;
      sim.setStore(t, x.id, { price });
      t.time = Math.floor(t.time / DAY) * DAY + 8 * HOUR;
      run(t, 6 * HOUR);
      return 200 - Object.values(x.stock).reduce((a, n) => a + (n ?? 0), 0);
    };
    expect(sell(0.8)).toBeGreaterThan(sell(1.4));
    expect(sim.upgradeStore(s, st.id)).toBeNull();
    expect(st.level).toBe(2);
    expect(sim.worth(s)).toBeGreaterThan(0);
  });

  it("restocks cost nothing to call off, and a store can be closed for half its fit-out back", () => {
    const s = sim.newGame("wh01", 47);
    s.cash = 500_000;
    sim.openStore(s, "bikes", "Newark");
    const st = s.stores[0];
    const o = s.orders.find((x) => x.store === st.id)!;
    const cash = s.cash;
    sim.cancel(s, o.id);
    expect(s.cash).toBe(cash);
    expect(s.stats.failed).toBe(0);
    st.auto = false;
    expect(sim.closeStore(s, st.id)).toBeNull();
    expect(s.stores.length).toBe(0);
    expect(s.cash).toBeGreaterThan(cash);
  });

  it("managers: sales accepts what's in stock, supply orders materials, the plant engineer fixes machines", () => {
    // The Riverside racks are full of goods: the sales manager takes orders for them.
    const w = sim.newGame("wh01", 48);
    expect(sim.hire(w, "sales")).toBeNull();
    run(w, 6 * HOUR);
    expect(w.orders.some((o) => o.state !== "offer" && o.state !== "declined" && o.code !== "SHP-78442")).toBe(true);
    // Northgate's machines need steel, plastic, fabric and rubber: the supply manager keeps them coming.
    const s = sim.newGame("wh07", 48);
    s.cash = 500_000;
    expect(sim.hire(s, "supply")).toBeNull();
    expect(sim.hire(s, "plant")).toBeNull();
    const machine = s.structs.find((t) => t.m)!;
    machine.m!.state = "broken";
    run(s, 6 * HOUR);
    expect(s.pos.length).toBeGreaterThan(1);
    expect(machine.m!.state).not.toBe("broken");
    expect(s.ledger.managers).toBeGreaterThan(0);
    expect(s.goals.manager).toBe(true);
    sim.hire(s, "supply");
    expect(s.managers.supply).toBe(false);
  });

  it("sandbox: money is no object, everything is open, and there's no score", () => {
    const s = sim.newGame("wh20", 49, { sandbox: true });
    expect(s.sandbox).toBe(true);
    const cash = s.cash;
    for (const ind of INDUSTRIES) expect(sim.licensed(s, ind.id)).toBe(true);
    expect(sim.place(s, { kind: "machine", type: "carline", x: 10, z: 5 })).toBeNull();
    expect(sim.buyUpgrade(s, "mega")).toMatch(/Needs/);
    expect(sim.buyUpgrade(s, "lean")).toBeNull();
    expect(sim.openStore(s, "cars", "New York")).toBeNull();
    expect(sim.borrow(s, 10_000)).toMatch(/sandbox/);
    run(s, 3 * HOUR);
    expect(s.cash).toBe(cash);
    expect(s.ledger.capex).toBeGreaterThan(0);
    expect(sim.score(s)).toBe(0);
  });

  it("builds a car at Motor City: bodies and engines ride conveyors into the assembly line", () => {
    const s = sim.newGame("wh24", 50);
    expect(sim.licensed(s, "auto")).toBe(true);
    for (const i of ["steel", "aluminium", "copper", "rubber", "glass"] as const) sim.setAuto(s, i, 3, 6);
    run(s, 16 * HOUR);
    expect(s.stats.madeItems.body ?? 0).toBeGreaterThan(0);
    expect(s.stats.madeItems.car ?? 0).toBeGreaterThan(0);
    expect(s.stats.belted).toBeGreaterThan(0);
  });

  it("loads a save from before the industry update", () => {
    const s = sim.newGame("wh01", 51);
    run(s, HOUR);
    const old = JSON.parse(sim.serialize(s));
    for (const k of ["lic", "stores", "managers"]) delete old[k];
    for (const k of ["retail", "stores", "managers"]) delete old.ledger[k];
    for (const k of ["retail", "restocks", "belted", "storesOpened"]) delete old.stats[k];
    delete old.today.retail;
    const back = sim.deserialize(JSON.stringify(old))!;
    expect(back.stores).toEqual([]);
    expect(back.lic).toEqual({});
    run(back, 3 * HOUR);
    expect(Number.isFinite(sim.worth(back))).toBe(true);
    expect(back.ledger.retail).toBe(0);
    expect(Object.keys(STORES).length).toBe(7);
  });
});

describe("WareForge tycoon update", () => {
  it("Freeport Estate is open plan: build on the aisle (not the dock lanes) in a normal, scored game", () => {
    const s = sim.newGame("wh30", 60);
    expect(s.sandbox).toBeUndefined();
    expect(sim.openPlan(s)).toBe(true);
    expect(sim.width(s)).toBe(78);
    expect(s.structs.filter((t) => t.kind === "rack").length).toBe(0);
    const cash = s.cash;
    // On the old aisle rows: fine here, not at Riverside.
    expect(sim.place(s, { kind: "rack", x: 20, z: 15 })).toBeNull();
    expect(s.cash).toBeLessThan(cash);
    expect(sim.placeError(sim.newGame("wh01", 60), { kind: "rack", x: 20, z: 15 })).toMatch(/aisle/);
    // But never the dock lanes, and still nothing left out of reach.
    expect(sim.placeError(s, { kind: "rack", x: 20, z: 17 })).toMatch(/dock lanes/);
    expect(sim.cutOff(s)).toEqual([]);
    // A forklift with its parking spot built over parks on the nearest clear tile.
    for (let x = 2; x < 12; x += 2) sim.place(s, { kind: "rack", x, z: 15 });
    for (let x = 2; x < 12; x++) sim.place(s, { kind: "fence", x, z: 16 });
    sim.tick(s, 20 * MIN);
    const g = sim.grid(s);
    for (const f of s.forks) if (f.phase === "idle") expect(g[Math.floor(f.z) * 80 + Math.floor(f.x)]).toBe(0);
    expect(sim.score(s)).toBeGreaterThanOrEqual(0);
  });

  it("facilities: break rooms make drivers quicker, offices bring more customers, fences shape the floor", () => {
    const s = sim.newGame("wh30", 61);
    const speed0 = sim.breakBonus(s);
    expect(sim.place(s, { kind: "breakroom", x: 4, z: 3 })).toBeNull();
    expect(sim.breakBonus(s)).toBeCloseTo(speed0 * 1.05);
    s.cash = 1e6;
    sim.buyUpgrade(s, "training");
    sim.buyUpgrade(s, "ergonomics");
    expect(sim.breakBonus(s)).toBeCloseTo(1.1);
    expect(sim.place(s, { kind: "office", x: 8, z: 3 })).toBeNull();
    expect(sim.built(s, "office")).toBe(1);
    expect(sim.place(s, { kind: "fence", x: 14, z: 3 })).toBeNull();
    expect(sim.grid(s)[3 * 80 + 14]).toBe(1);
    sim.tick(s, MIN);
    expect(s.goals.staff).toBe(true);
    // Offices: more offers over a day than without.
    const offers = (office: boolean) => {
      const t = sim.newGame("wh30", 62);
      if (office) {
        t.cash = 1e6;
        sim.place(t, { kind: "office", x: 8, z: 3 });
        sim.place(t, { kind: "office", x: 12, z: 3 });
      }
      let n = 0;
      for (let h = 0; h < 24; h++) {
        sim.tick(t, HOUR);
        n += t.orders.filter((o) => o.state === "offer").length;
        for (const o of t.orders) if (o.state === "offer") o.state = "declined";
      }
      return n;
    };
    expect(offers(true)).toBeGreaterThan(offers(false));
  });

  it("new products: electric cars, frozen pizza and ice cream, handbags, vitamins and sofas all have a recipe and buyers", () => {
    for (const i of ["ecar", "pizza", "icecream", "handbag", "vitamins", "sofa"] as const) {
      expect(Object.values(MACHINES).some((m) => m.recipes.some((r) => r.output === i))).toBe(true);
      expect(CUSTOMERS.some((c) => c.likes.includes(i))).toBe(true);
    }
    // The dairy makes ice cream from milk and sugar.
    const s = sim.newGame("wh21", 63);
    s.cash = 1e6;
    const dairy = s.structs.find((t) => t.m?.type === "dairy")!;
    expect(sim.setRecipe(s, dairy.id, 2)).toBeNull();
    sim.buyUpgrade(s, "cold");
    sim.setAuto(s, "milk", 3, 6);
    sim.setAuto(s, "sugar", 3, 6);
    sim.tick(s, 8 * HOUR);
    expect(s.stats.madeItems.icecream ?? 0).toBeGreaterThan(0);
    sim.tick(s, MIN);
    expect(s.goals.pizza).toBe(true);
  });

  it("tenders: bid keenly and win a contract at your price; bid high and a rival takes it", () => {
    const s = sim.newGame("wh01", 64);
    const t = sim.offerTender(s);
    expect(t.state).toBe("open");
    expect(sim.bidTender(s, t.id, 0.8)).toBeNull();
    expect(t.bid).toBe(0.8);
    sim.tick(s, 5 * HOUR);
    expect(t.state).toBe("won");
    expect(s.stats.tendersWon).toBe(1);
    const c = s.contracts.find((x) => x.customer === t.customer && x.item === t.item && x.state === "active")!;
    expect(c.orders.length).toBe(t.count);
    const o = s.orders.find((x) => x.id === c.orders[0])!;
    expect(o.value).toBe(Math.round(t.list * t.n * 0.8));
    expect(s.goals.tender).toBe(true);
    const t2 = sim.offerTender(s);
    sim.bidTender(s, t2.id, 1.25);
    sim.tick(s, 5 * HOUR);
    expect(t2.state).toBe("lost");
    expect(s.rivals.reduce((a, r) => a + r.won, 0)).toBeGreaterThanOrEqual(1);
    expect(sim.bidTender(s, t2.id, 0.9)).toMatch(/closed/);
  });

  it("the win chance shown for a bid matches how often it wins", () => {
    const s = sim.newGame("wh01", 70);
    expect(sim.winChance(s, 0.8)).toBeGreaterThan(sim.winChance(s, 0.95));
    expect(sim.winChance(s, 0.95)).toBeGreaterThan(sim.winChance(s, 1.1));
    expect(sim.winChance(s, 1.25)).toBe(0);
    const bid = 0.88;
    const p = sim.winChance(s, bid);
    expect(p).toBeGreaterThan(0.1);
    expect(p).toBeLessThan(0.9);
    let won = 0;
    const runs = 300;
    for (let i = 0; i < runs; i++) {
      const g = sim.newGame("wh01", 1000 + i);
      const t = sim.offerTender(g);
      sim.bidTender(g, t.id, bid);
      t.closes = g.time;
      sim.tick(g, HOUR);
      if (t.state === "won") won++;
    }
    expect(Math.abs(won / runs - p)).toBeLessThan(0.1);
    // Market research makes the same bid likelier to win.
    s.cash = 1e6;
    sim.buyUpgrade(s, "intel");
    expect(sim.winChance(s, bid)).toBeGreaterThan(p);
  });

  it("ad campaigns bring offers for their trade; industry events only come to businesses in the trade", () => {
    const s = sim.newGame("wh01", 65);
    s.cash = 1e6;
    expect(sim.runCampaign(s, "food")).toMatch(/licence/);
    sim.buyLicence(s, "food");
    expect(sim.runCampaign(s, "food")).toBeNull();
    expect(sim.runCampaign(s, "food")).toMatch(/still running/);
    expect(sim.activeCampaigns(s)).toEqual(["food"]);
    const food = INDUSTRIES.find((x) => x.id === "food")!.goods;
    const before = s.orders.length;
    for (let i = 0; i < 100; i++) sim.offer(s);
    const share = s.orders.slice(before).filter((o) => o.lines.some((l) => food.includes(l.item))).length;
    expect(share).toBeGreaterThan(50);
    sim.tick(s, 13 * HOUR);
    expect(sim.activeCampaigns(s)).toEqual([]);
    // Fashion week never comes to a business without the fashion licence.
    const t = sim.newGame("wh01", 66);
    for (let h = 0; h < 10 * 24; h++) {
      sim.tick(t, HOUR);
      expect(t.event?.kind === "fashionweek" || t.event?.kind === "flu" || t.event?.kind === "motorshow").toBe(false);
    }
  }, 30_000);

  it("air freight flies stock in four times as fast, for more", () => {
    const s = sim.newGame("wh01", 67);
    expect(sim.purchaseCost(s, "steel", 6, false, true)).toBeGreaterThan(sim.purchaseCost(s, "steel", 6));
    const air = sim.buy(s, "steel", 6, false, false, true)!;
    const road = sim.buy(s, "steel", 6)!;
    const eta = (po: sim.PO) => s.trucks.find((t) => t.id === po.truck)!.eta - s.time;
    expect(air.air).toBe(true);
    expect(eta(air)).toBeLessThan(eta(road));
    s.cash = 1e6;
    const dear = sim.purchaseCost(s, "steel", 6, false, true);
    sim.buyUpgrade(s, "aircargo");
    expect(sim.purchaseCost(s, "steel", 6, false, true)).toBeLessThan(dear);
    sim.tick(s, MIN);
    expect(s.goals.air).toBe(true);
  });

  it("loads a save from before the tycoon update", () => {
    const s = sim.newGame("wh01", 68);
    sim.tick(s, HOUR);
    const old = JSON.parse(sim.serialize(s));
    for (const k of ["campaigns", "rivals", "tenders"]) delete old[k];
    for (const k of ["tendersWon", "campaigns", "airDrops"]) delete old.stats[k];
    const back = sim.deserialize(JSON.stringify(old))!;
    expect(back.rivals.length).toBe(3);
    expect(back.tenders).toEqual([]);
    sim.tick(back, 2 * DAY);
    expect(Number.isFinite(sim.worth(back))).toBe(true);
  });
});
