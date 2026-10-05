import { describe, expect, it } from "vitest";
import { City } from "../world/city";
import type { ServiceKind } from "../world/lots";
import { LANDMARK_UNLOCK, landmarkState, MILESTONES, milestoneAt, milestoneProgress } from "../world/milestones";
import { Sim } from "./sim";

/** A town on Broad Plains: an avenue off the highway with a grid of streets, zoned and serviced. */
function town(rows = 3, cols = 5, spacing = 96, extra: ServiceKind[] = []) {
  const c = new City("broad-plains", "Test");
  const gate = [...c.roads.edges.values()][0];
  const end = { x: gate.pts[gate.pts.length - 2], z: gate.pts[gate.pts.length - 1] };
  const x0 = end.x;
  const z0 = end.z;
  const x1 = x0 + cols * spacing;
  c.addRoad([x0, z0, x1, z0], "avenue");
  for (let k = 1; k <= cols; k++) {
    const x = x0 + k * spacing;
    c.addRoad([x, z0 - rows * spacing, x, z0 + rows * spacing], "street");
  }
  for (let r = 1; r <= rows; r++) {
    c.addRoad([x0 + spacing, z0 - r * spacing, x1, z0 - r * spacing], "street");
    c.addRoad([x0 + spacing, z0 + r * spacing, x1, z0 + r * spacing], "street");
  }
  const streets = [...c.roads.edges.values()].filter((e) => e.type === "street");
  expect(c.addService("power", streets[0].id, 1, 30)).toBeTruthy();
  expect(c.addService("water", streets[1].id, -1, 30)).toBeTruthy();
  expect(c.addService("school", streets[2].id, 1, 40)).toBeTruthy();
  expect(c.addService("park", streets[3].id, -1, 40)).toBeTruthy();
  // Extra civic buildings go wherever they first fit, spread along the streets.
  extra.forEach((kind, n) => {
    const tries = streets.flatMap((e, i) => [1, -1].flatMap((side) => [30, 48, 60].map((at) => [(i + n * 4) % streets.length, side, at] as const)));
    expect(tries.some(([i, side, at]) => !!c.addService(kind, streets[i].id, side, at)), kind).toBe(true);
  });
  const zones = ["R", "R", "C", "R", "I", "M"] as const;
  let k = 0;
  for (const e of [...c.roads.edges.values()]) {
    if (e.type === "highway") continue;
    const L = e.pts.length;
    void L;
    for (const side of [1, -1]) c.paint(e.id, side, 0, 1e6, { zone: zones[k++ % zones.length], width: 2, depth: 3, mixed: true }, false);
  }
  return c;
}

describe("simulation", () => {
  it("a zoned, connected town grows to thousands of people, with traffic and people on the streets", () => {
    const c = town();
    expect(c.lots.lots.size).toBeGreaterThan(120);
    const sim = new Sim();
    sim.setWorld(c.toSim());
    const t0 = performance.now();
    let firstBuilding = -1;
    let firstCar = -1;
    for (let i = 0; i < 6000; i++) {
      sim.step(0.1, 3);
      if (firstBuilding < 0 && sim.buildings.size > 0) firstBuilding = i * 0.3;
      if (firstCar < 0 && sim.carBuffer().length > 0) firstCar = i * 0.3;
    }
    const ms = performance.now() - t0;
    const st = sim.stats;
    console.log("pop", st.population, "jobs", st.jobs, "bld", st.buildings, "cars", st.cars, "peds", st.peds, "cong", st.congestion.toFixed(2), "demand", st.demand, "firstBuilding(s)", firstBuilding, "firstCar(s)", firstCar, "ms", Math.round(ms));
    const tiers = [0, 0, 0, 0, 0];
    for (const b of sim.buildings.values()) tiers[b.tier]++;
    console.log("tiers", tiers, "notices", sim.notices.map((n) => n.key));
    expect(firstBuilding).toBeLessThan(10);
    expect(firstCar).toBeLessThan(60);
    expect(st.population).toBeGreaterThan(1500);
    expect(st.cars).toBeGreaterThan(20);
    expect(st.peds).toBeGreaterThan(10);
    expect(tiers[2] + tiers[3]).toBeGreaterThan(0);
  }, 30_000);

  it("an unconnected neighbourhood doesn't grow", () => {
    const c = new City("broad-plains", "Island");
    c.addRoad([1400, 1400, 1600, 1400], "street");
    const e = [...c.roads.edges.values()].find((x) => x.type === "street")!;
    c.paint(e.id, 1, 0, 1e6, { zone: "R", width: 2, depth: 3, mixed: false }, true);
    const sim = new Sim();
    sim.setWorld(c.toSim());
    for (let i = 0; i < 300; i++) sim.step(0.1, 3);
    expect(sim.buildings.size).toBe(0);
    expect(sim.notices.map((n) => n.key)).toContain("n.unconnected");
  }, 30_000);

  it("an overloaded road queues up", () => {
    const c = new City("broad-plains", "Jam");
    const gate = [...c.roads.edges.values()][0];
    const end = { x: gate.pts[gate.pts.length - 2], z: gate.pts[gate.pts.length - 1] };
    // One long single-lane bottleneck street into a big district.
    c.addRoad([end.x, end.z, end.x + 300, end.z], "street");
    for (let k = 0; k < 4; k++) c.addRoad([end.x + 300 + k * 90, end.z - 300, end.x + 300 + k * 90, end.z + 300], "avenue");
    c.addRoad([end.x + 300, end.z - 300, end.x + 570, end.z - 300], "avenue");
    c.addRoad([end.x + 300, end.z + 300, end.x + 570, end.z + 300], "avenue");
    for (const e of [...c.roads.edges.values()]) if (e.type === "avenue") for (const side of [1, -1]) c.paint(e.id, side, 0, 1e6, { zone: side > 0 ? "R" : "C", width: 2, depth: 4, mixed: false }, false);
    const sim = new Sim();
    sim.setWorld(c.toSim());
    let maxQueue = 0;
    for (let i = 0; i < 4000; i++) {
      sim.step(0.1, 3);
      if (i > 2000) maxQueue = Math.max(maxQueue, sim.queued());
    }
    console.log("jam: pop", sim.stats.population, "cars", sim.stats.cars, "maxQueue", maxQueue);
    expect(maxQueue).toBeGreaterThan(5);
  }, 30_000);
});

/** Grow a town for a while (game minutes ≈ steps × 0.3). */
function grown(c: City, steps = 1500) {
  const sim = new Sim();
  sim.settings = { ...sim.settings, fires: false };
  sim.setWorld(c.toSim());
  for (let i = 0; i < steps; i++) sim.step(0.1, 3);
  return sim;
}

describe("the Metropolis update", () => {
  it("milestones go by the best population, and unlock landmarks once each", () => {
    expect(milestoneAt(0)).toBe(0);
    expect(MILESTONES[milestoneAt(1_226)].id).toBe("town");
    expect(MILESTONES[milestoneAt(60_000)].id).toBe("megalopolis");
    expect(milestoneProgress(2_000)).toBeCloseTo(0.5, 2);
    expect(landmarkState("hospital", 500, new Set())).toBe("locked");
    expect(landmarkState("hospital", MILESTONES[LANDMARK_UNLOCK.hospital].pop, new Set())).toBe("ready");
    expect(landmarkState("hospital", 100_000, new Set(["hospital"]))).toBe("built");
  });

  it("an uncovered building that catches fire burns down; a fire station puts fires out", () => {
    const c = town();
    const sim = grown(c);
    const b = [...sim.buildings.values()].find((x) => x.progress >= 1)!;
    expect(b).toBeTruthy();
    expect(sim.ignite(b.lot)).toBe(true);
    expect(sim.drainEvents().map((e) => e.key)).toEqual(["ev.fireNoStation"]);
    expect(sim.fireList().length).toBe(1);
    for (let i = 0; i < 400 && sim.fires.size; i++) sim.step(0.1, 3);
    // Gone (the empty plot may already be growing something new).
    expect(sim.buildings.get(b.lot)).not.toBe(b);
    expect(sim.drainEvents().map((e) => e.key)).toContain("ev.burnt");

    // Fire stations everywhere: the crew gets there in time.
    const c2 = town(3, 5, 96, ["fire", "fire", "fire"]);
    const sim2 = grown(c2);
    const b2 = [...sim2.buildings.values()].find((x) => x.progress >= 1 && ((sim2.coverage().get(x.lot) ?? 0) & 2))!;
    expect(b2).toBeTruthy();
    sim2.drainEvents();
    sim2.ignite(b2.lot);
    for (let i = 0; i < 400 && sim2.fires.size; i++) sim2.step(0.1, 3);
    expect(sim2.buildings.get(b2.lot)).toBe(b2);
    expect(sim2.drainEvents().map((e) => e.key)).toEqual(["ev.fire", "ev.fireOut"]);
  }, 60_000);

  it("landmarks reach far, raise land value and bring tourists", () => {
    const base = town();
    const before = grown(base, 600);
    const lvBefore = [...before.landValues().values()].reduce((a, b) => a + b, 0);
    // Only the park draws visitors, and few while the town is small.
    expect(before.stats.tourists).toBeLessThan(12);

    const c = town(3, 5, 96, ["museum", "hospital"]);
    const sim = grown(c, 600);
    expect(sim.stats.tourists).toBeGreaterThan(100);
    const lvAfter = [...sim.landValues().values()].reduce((a, b) => a + b, 0);
    expect(lvAfter).toBeGreaterThan(lvBefore);
    // The hospital counts as clinic cover far beyond a clinic's reach.
    const clinicCovered = [...sim.coverage().values()].filter((m) => m & 4).length;
    expect(clinicCovered).toBeGreaterThan(sim.coverage().size * 0.5);
  }, 60_000);
});
