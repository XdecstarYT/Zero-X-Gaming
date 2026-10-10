import { describe, expect, it } from "vitest";
import { CARRIER_FEE, CUSTOMERS, HOUR, ITEMS, MIN, OWN_CARRIER, SITES, THAW_SECS } from "./data";
import * as sim from "./sim";

const run = (s: sim.State, secs: number) => sim.tick(s, secs);

describe("WareForge simulation", () => {
  it("starts every site with doors, racks, stock, forklifts, a booked shipment and a truck on its way", () => {
    for (const d of SITES) {
      const s = sim.newGame(d.id, 3);
      expect(s.doors.length).toBe(d.doors.length);
      expect(s.forks.length).toBe(d.forklifts);
      expect(s.orders.some((o) => o.code === "SHP-78442" && o.state === "confirmed")).toBe(true);
      expect(s.trucks.some((t) => t.dir === "in")).toBe(true);
      expect(sim.stock(s)).toBeGreaterThan(0);
      expect(sim.score(s)).toBe(0);
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
