import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import {
  addItem, addOpening, cameraMove, addWall, buildCost, buildFor, changeDue, checkItem, clockText, customerTotal, decayNeeds, driveStep, emptyBuild, freshNeeds, moodOf, newCustomer, newDelivery, newOrder, orderMatches, paintFloor,
  PLACES, PLOTS, PLOT_D, PLOT_W, removeAt, ROADS, serveScore, spawnFor, starterBuild, sunAt, toLocal, toWorld, townSolid, applyFurniture,
} from "./world";

const overlaps = (a: { x: number; z: number; w: number; d: number }, b: { x: number; z: number; w: number; d: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

describe("the town", () => {
  it("lays out shops, roads and plots without overlaps", () => {
    expect(PLOTS.length).toBeGreaterThanOrEqual(40);
    for (const p of PLOTS) {
      for (const q of PLOTS) if (p !== q) expect(overlaps(p, q)).toBe(false);
      for (const r of ROADS) expect(overlaps(p, r)).toBe(false);
      for (const s of PLACES) expect(overlaps(p, s)).toBe(false);
    }
    for (const s of PLACES) for (const r of ROADS) expect(overlaps(s, r)).toBe(false);
    // Spawns are on the street side, outside buildings.
    for (const p of PLOTS) {
      const s = spawnFor(p.id);
      expect(townSolid(s.x, s.z)).toBe(false);
    }
  });

  it("maps plot-local coordinates to the world and back", () => {
    for (const p of [PLOTS[0], PLOTS.find((x) => x.front !== PLOTS[0].front)!]) {
      const w = toWorld(p, 3, 7);
      expect(w.x).toBeGreaterThanOrEqual(p.x);
      expect(w.x).toBeLessThanOrEqual(p.x + p.w);
      const l = toLocal(p, w.x, w.z);
      expect(l.x).toBeCloseTo(3);
      expect(l.z).toBeCloseTo(7);
      // The local front (the street) is the edge next to the road.
      const front = toWorld(p, PLOT_W / 2, PLOT_D);
      const s = spawnFor(p.id);
      expect(Math.abs(front.z - s.z)).toBeLessThan(2);
    }
  });
});

describe("building", () => {
  it("places walls, openings, floors and furniture by the rules, with costs and refunds", () => {
    const b = emptyBuild();
    expect(addWall(b, { x1: 2, z1: 2, x2: 8, z2: 2 })).toEqual({ ok: true, cost: 360 });
    expect(addWall(b, { x1: 4, z1: 2, x2: 6, z2: 2 }).ok).toBe(false);
    expect(addWall(b, { x1: 2, z1: 2, x2: 5, z2: 5 }).ok).toBe(false);
    expect(addWall(b, { x1: -1, z1: 0, x2: 3, z2: 0 }).ok).toBe(false);
    expect(addOpening(b, 5, 2.1, "door").ok).toBe(true);
    expect(addOpening(b, 5.2, 2.1, "window").ok).toBe(false);
    expect(addOpening(b, 12, 12, "window").ok).toBe(false);
    expect(checkItem(b, { type: "sofa", x: 5, z: 4, rot: 0 })).toMatchObject({ ok: false, why: /floor/ });
    for (let x = 2; x < 8; x++) for (let z = 2; z < 7; z++) paintFloor(b, x, z, "wood");
    expect(addItem(b, { type: "sofa", x: 5, z: 4, rot: 0 }).ok).toBe(true);
    expect(addItem(b, { type: "tv", x: 5, z: 4, rot: 0 }).ok).toBe(false);
    expect(addItem(b, { type: "tv", x: 5, z: 2, rot: 0 })).toMatchObject({ ok: false, why: /wall/ });
    expect(addItem(b, { type: "bbq", x: 15, z: 20, rot: 1 }).ok).toBe(true);
    const cost = buildCost(b);
    expect(cost).toBeGreaterThan(1400 + 700 + 360);
    expect(removeAt(b, 5, 4)).toBe(Math.round(1400 * 0.7));
    expect(b.items.some((i) => i.type === "sofa")).toBe(false);
  });

  it("ready-made houses are valid and furnished with something for every need", () => {
    for (let i = 0; i < 6; i++) {
      const b = starterBuild(i * 31, i % 3);
      expect(b.walls.length).toBeGreaterThan(6);
      expect(b.walls.some((w) => w.open.some((o) => o.kind === "door"))).toBe(true);
      const types = new Set(b.items.map((x) => x.type));
      for (const t of ["bed", "fridge", "shower", "sofa", "tv"]) expect(types.has(t as never)).toBe(true);
    }
    expect(buildFor(3, {})).toEqual(buildFor(3, {}));
    const mine = emptyBuild();
    expect(buildFor(3, { 3: mine })).toBe(mine);
  });
});

describe("needs and the clock", () => {
  it("needs run down and furniture fills them", () => {
    const n = freshNeeds();
    decayNeeds(n, 600);
    expect(moodOf(n)).toBeLessThan(50);
    applyFurniture(n, "bed", 480);
    expect(n.energy).toBeGreaterThan(90);
    applyFurniture(n, "fridge", 30);
    expect(n.hunger).toBeGreaterThan(50);
  });
  it("tells the time and the sun", () => {
    expect(clockText(0)).toBe("12:00 am");
    expect(clockText(13 * 60 + 5)).toBe("1:05 pm");
    expect(sunAt(12 * 60)).toBeCloseTo(1);
    expect(sunAt(0)).toBeCloseTo(-1);
  });
});

describe("shifts", () => {
  it("cashier: totals, change and scoring", () => {
    const c = newCustomer(createRng(4));
    expect(c.paid).toBeGreaterThanOrEqual(customerTotal(c));
    c.scanned = c.scanned.map(() => true);
    expect(serveScore(c, changeDue(c), 5)).toBeGreaterThan(serveScore(c, changeDue(c) + 1, 5));
    expect(serveScore(c, changeDue(c), 2)).toBeGreaterThan(serveScore(c, changeDue(c), 30));
  });
  it("barista orders and deliveries", () => {
    const o = newOrder(createRng(2));
    expect(orderMatches(o, { size: o.size, drink: o.drink, milk: o.milk })).toBe(true);
    expect(orderMatches(o, { size: o.size === "Small" ? "Large" : "Small", drink: o.drink, milk: o.milk })).toBe(false);
    const d = newDelivery(createRng(3));
    expect(d.limit).toBeGreaterThan(30);
    expect(townSolid(d.x, d.z)).toBe(false);
  });
  it("cars drive and stop at buildings", () => {
    const c = { x: -150, z: 0, heading: Math.PI / 2, speed: 0 };
    for (let i = 0; i < 300; i++) driveStep(c, 1, 0, 1 / 60, townSolid);
    expect(c.speed).toBeGreaterThan(10);
    expect(c.x).toBeGreaterThan(-130);
    expect(Math.abs(c.z)).toBeLessThan(0.01);
    c.heading = Math.PI;
    let hit = false;
    for (let i = 0; i < 600 && !hit; i++) hit = driveStep(c, 1, 0, 1 / 60, townSolid);
    expect(hit).toBe(true);
  });
});

describe("collisions", () => {
  it("walls block, doors don't, furniture blocks, and you can use what you're next to", async () => {
    const { colliders, blocked, walk, usableNear, toWorld, PLOTS: plots } = await import("./world");
    const b = starterBuild(5, 1);
    const p = plots[0];
    const c = colliders((id) => (id === p.id ? b : emptyBuild()));
    // The front door: walk through it from the yard into the house.
    const front = b.walls.find((w) => w.open.some((o) => o.kind === "door") && w.z1 === w.z2 && w.z1 > 10)!;
    const door = front.open.find((o) => o.kind === "door")!;
    const out = toWorld(p, front.x1 + door.at, front.z1 + 1.5);
    const inn = toWorld(p, front.x1 + door.at, front.z1 - 1.5);
    expect(blocked(c, out.x, out.z)).toBe(false);
    const pos = { ...out };
    for (let i = 0; i < 60; i++) walk(c, pos, (inn.x - out.x) / 60, (inn.z - out.z) / 60);
    expect(Math.hypot(pos.x - inn.x, pos.z - inn.z)).toBeLessThan(0.2);
    // A solid stretch of the same wall blocks.
    const solid = toWorld(p, front.x1 + 0.3, front.z1);
    expect(blocked(c, solid.x, solid.z)).toBe(true);
    // Next to the bed you can sleep.
    const bed = b.items.find((i) => i.type === "bed")!;
    const near = toWorld(p, bed.x + 1.2, bed.z);
    expect(usableNear(b, p, near.x, near.z)?.type).toBe("bed");
  });
});

describe("walking with the stick", () => {
  /** Where the camera sees things: its forward and screen-right in world space. */
  const axes = (yaw: number) => ({ fwd: [-Math.sin(yaw), -Math.cos(yaw)], right: [Math.cos(yaw), -Math.sin(yaw)] });
  const dot = (a: { dx: number; dz: number }, b: number[]) => a.dx * b[0] + a.dz * b[1];

  it("goes where you push, whichever way the camera faces", () => {
    for (const yaw of [0, 0.7, Math.PI / 2, Math.PI, -2.3]) {
      const { fwd, right } = axes(yaw);
      expect(dot(cameraMove(yaw, 0, -1)!, fwd)).toBeCloseTo(1); // up: away from the camera
      expect(dot(cameraMove(yaw, 0, 1)!, fwd)).toBeCloseTo(-1); // down: towards it
      expect(dot(cameraMove(yaw, 1, 0)!, right)).toBeCloseTo(1); // right: screen-right
      expect(dot(cameraMove(yaw, -1, 0)!, right)).toBeCloseTo(-1); // left: screen-left
      const diag = cameraMove(yaw, 1, -1)!; // up-right: halfway between
      expect(dot(diag, fwd)).toBeCloseTo(Math.SQRT1_2);
      expect(dot(diag, right)).toBeCloseTo(Math.SQRT1_2);
    }
    expect(cameraMove(1, 0, 0)).toBeNull();
  });

  it("screen-right is really to the right of the view (camera behind, looking ahead)", () => {
    // Camera at +z looking towards -z (yaw 0): the right of the screen is +x.
    const m = cameraMove(0, 1, 0)!;
    expect(m.dx).toBeCloseTo(1);
    expect(m.dz).toBeCloseTo(0);
  });
});
