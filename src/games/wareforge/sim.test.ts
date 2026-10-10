import { describe, expect, it } from "vitest";
import { HOUR, ITEMS, MIN, SITES } from "./data";
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
        expect(g[tz * 44 + tx]).toBe(0);
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
