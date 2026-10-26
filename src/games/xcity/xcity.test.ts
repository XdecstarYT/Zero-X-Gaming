import { describe, expect, it } from "vitest";
import * as act from "./actions";
import { planStats } from "./design";
import { addRoad, lotRow } from "./roads";
import { advance, bestPlan, load, prepare, save, score, submit } from "./sim";
import { blankState, districtRect, newCity, rect } from "./world";
import { addDistrict } from "./world";

const fresh = () => prepare(newCity(1));

describe("the road network", () => {
  it("splits the roads a new road crosses and lines it with lots", () => {
    const s = blankState(3);
    const a = addRoad(s, [-400, 0, 400, 0], "street", "First");
    expect(typeof a).not.toBe("string");
    const b = addRoad(s, [0, -300, 0, 300], "street", "Second");
    if (typeof b === "string") throw new Error(b);
    // The crossing makes a junction with four roads.
    const hub = s.nodes.find((n) => n && Math.hypot(n.x, n.z) < 1)!;
    expect(hub.edges.length).toBe(4);
    expect(s.edges.filter(Boolean).length).toBe(4);
    // Lots on both sides, none on the road.
    const lots = s.lots.filter(Boolean);
    expect(lots.length).toBeGreaterThan(60);
    expect(lots.some((l) => l!.side === 1) && lots.some((l) => l!.side === -1)).toBe(true);
    // A road on top of another is refused.
    expect(addRoad(s, [-300, 2, 300, 2], "street")).toBe("Too close to another road");
  });

  it("snaps a road's end onto a nearby junction", () => {
    const s = blankState(4);
    addRoad(s, [-200, 0, 200, 0], "street");
    const r = addRoad(s, [205, 6, 205, 300], "street");
    if (typeof r === "string") throw new Error(r);
    const end = s.nodes.find((n) => n && Math.abs(n.x - 200) < 0.01 && Math.abs(n.z) < 0.01)!;
    expect(end.edges.length).toBe(2);
  });
});

describe("the farming village", () => {
  it("starts with a crossroads, houses, shops, farms and a school", () => {
    const s = fresh();
    expect(s.stats.pop).toBeGreaterThan(300);
    expect(s.buildings.some((b) => b?.form === "house")).toBe(true);
    expect(s.buildings.some((b) => b?.form === "farmhouse")).toBe(true);
    expect(s.buildings.some((b) => b?.civic === "school")).toBe(true);
    expect(s.edges.every((e) => !e || e.conn)).toBe(true);
    expect(s.districts.some((d) => d?.use === "farms" && d.crop === "orchard")).toBe(true);
  });
});

describe("zoning and street patterns", () => {
  it("lays out each pattern, zones it, and the developers build", () => {
    const s = fresh();
    for (const [i, pattern] of (["grid", "curvy", "culdesac", "superblock"] as const).entries()) {
      const x0 = -1500 + i * 760;
      const r = districtRect(x0, 300, x0 + 640, 940);
      const res = act.layOut(s, r.obb, r.poly, pattern, "homes", 1);
      if (!res.ok) throw new Error(res.why);
      expect(res.roads).toBeGreaterThan(3);
      expect(s.districts[res.district]!.pattern).toBe(pattern);
    }
    // Superblocks have a park at the heart.
    expect(s.districts.some((d) => d?.use === "parks" && d.name.endsWith("Green"))).toBe(true);
    // Every new lot is reachable from outside.
    expect(s.lots.every((l) => !l || s.edges[l.edge]!.conn)).toBe(true);
    const homes = s.stats.homes;
    advance(s, 12);
    expect(s.stats.homes).toBeGreaterThan(homes + 100);
    expect(s.stats.pop).toBeGreaterThan(1000);
  });

  it("upzones an area one band up and the rules carry over", () => {
    const s = fresh();
    s.stats.pop = 5000;
    const r = districtRect(-340, 20, 340, 380);
    const res = act.upzone(s, r.poly);
    if (!res.ok) throw new Error(res.why);
    expect(res.band).toBe(2);
    const d = s.districts[res.id]!;
    expect(d.name).toMatch(/upzoned/);
    // Too tall too soon: high-rise is locked in a small town.
    s.stats.pop = 700;
    const d2 = act.updateDistrict(s, d.id, { band: 4 });
    expect(d2.ok).toBe(false);
  });
});

describe("buildings", () => {
  it("designs a building: homes, cost, value, clout over the zoning, and what it clears", () => {
    const s = fresh();
    const lot = s.lots.find((l) => l && l.bld >= 0 && s.buildings[l.bld]!.form === "house" && lotRow(s, l.id, 3).length === 3)!;
    const plan = { ...act.draftPlan(s, lot.id, 3), storeys: 9, use: "homes" as const };
    const st = planStats(s, plan);
    expect(st.form).toBe("midrise");
    expect(st.homes).toBeGreaterThan(30);
    expect(st.over).toBe(7);
    expect(st.clout).toBeGreaterThan(2);
    expect(st.loss.homes).toBeGreaterThan(0);
    expect(st.cost).toBeGreaterThan(5_000_000);
    // Green roofs and bay windows make it nicer.
    expect(planStats(s, { ...plan, roof: "terrace", bay: true }).quality).toBeGreaterThan(st.quality);
    s.clout = 50;
    const res = act.commission(s, plan);
    if (!res.ok) throw new Error(res.why);
    const b = s.buildings[res.id]!;
    expect(b.done).toBe(false);
    advance(s, st.months + 1);
    expect(b.done).toBe(true);
  });

  it("places a school across two lots", () => {
    const s = fresh();
    const lot = s.lots.find((l) => l && l.bld < 0 && l.district >= 0 && s.districts[l.district]!.use === "homes" && lotRow(s, l.id, 4).length === 4 && lotRow(s, l.id, 4).every((i) => s.lots[i]!.bld < 0))!;
    const r = act.placeCivic(s, "school", lot.id);
    if (!r.ok) throw new Error(r.why);
    expect(s.buildings[r.id]!.lots.length).toBe(4);
  });
});

describe("applications", () => {
  it("approves, denies and haggles over a developer's plan", () => {
    const s = fresh();
    s.rentIndex = 1.8;
    const lot = s.lots.find((l) => l && l.bld >= 0 && s.buildings[l.bld]!.form === "house")!;
    const best = bestPlan(s, lot, 8)!;
    const app = submit(s, best.plan, best.st, 2);
    expect(app.homesLost).toBeGreaterThanOrEqual(1);
    expect(app.lean === "yes" || app.lean === "no").toBe(true);
    const c = act.changeTerms(s, app.id, "affordable");
    expect(c.ok).toBe(true);
    if (c.ok && !c.walked) {
      expect(s.apps[0].plan.affordable).toBe(20);
      expect(act.changeTerms(s, app.id, "parking").ok).toBe(false);
      const y = act.decide(s, app.id, true);
      expect(y.ok).toBe(true);
      expect(s.buildings[s.lots[lot.id]!.bld]!.done).toBe(false);
    }
    const free = s.lots.find((l) => l && l.bld < 0 && l.district >= 0 && s.districts[l.district]!.use === "homes")!;
    const app2 = submit(s, bestPlan(s, free, 4)!.plan, best.st, 2);
    expect(act.decide(s, app2.id, false).ok).toBe(true);
    expect(s.apps.length).toBe(0);
  });
});

describe("transport", () => {
  it("trams need an avenue; bike lanes and trams shift how people travel", () => {
    const s = fresh();
    const valley = s.edges.find((e) => e?.name === "Valley Road" && Math.abs(e.pts[0]) < 400)!;
    expect(act.upgradeRoad(s, valley.id, { tram: true }).ok).toBe(false);
    s.stats.pop = 5000;
    const w = act.upgradeRoad(s, valley.id, { kind: "avenue", tram: true, bike: true });
    if (!w.ok) throw new Error(w.why);
    expect(s.edges[valley.id]!.kind).toBe("avenue");
    advance(s, 2);
    expect(s.modes.transit).toBeGreaterThan(0);
    expect(s.modes.bike).toBeGreaterThan(0.03);
  });
});

describe("a long game", () => {
  it("grows, keeps its books and saves", () => {
    const s = fresh();
    const r = districtRect(380, 260, 1100, 900);
    act.layOut(s, r.obb, r.poly, "grid", "homes", 2);
    addDistrict(s, rect(1150, -400, 1550, 180), "jobs", 2);
    advance(s, 60);
    expect(s.stats.pop).toBeGreaterThan(2000);
    expect(Number.isFinite(s.money)).toBe(true);
    expect(s.history.length).toBe(60);
    expect(score(s)).toBeGreaterThan(s.stats.pop);
    const back = load(save(s))!;
    expect(back.stats.homes).toBe(s.stats.homes);
    advance(back, 3);
    expect(back.month).toBe(63);
  }, 60_000);
});
