import { describe, expect, it } from "vitest";
import { START_CASH } from "./data";
import { starterHospital } from "./plan";
import { Sim } from "./sim";
import { BUILT, idx, PLANNED, World } from "./world";

/** Run the sim for `hours` game hours at 4× in 0.1 s steps. */
function run(s: Sim, hours: number) {
  const end = s.minutes + hours * 60;
  while (s.minutes < end) s.step(0.1, 4);
}

function staffed(s: Sim) {
  s.hire("receptionist");
  s.hire("doctor");
  s.hire("nurse");
  s.hire("nurse");
  s.hire("janitor");
}

describe("the building", () => {
  it("foundations become floors and walls once workmen carry the delivered materials in", () => {
    const s = new Sim(1);
    expect(s.foundation(10, 10, 17, 15)).toBe(true);
    expect(s.cash).toBeLessThan(START_CASH);
    expect(s.world.wall[idx(10, 10)]).toBe(PLANNED);
    expect(s.jobs.size).toBeGreaterThan(40);
    // No workmen: nothing happens but a truck drops crates.
    run(s, 2);
    expect(s.crates.size).toBeGreaterThan(0);
    expect(s.world.wall[idx(10, 10)]).toBe(PLANNED);
    s.hire("workman");
    s.hire("workman");
    s.hire("workman");
    run(s, 30);
    expect(s.jobs.size).toBe(0);
    expect(s.world.wall[idx(10, 10)]).toBe(BUILT);
    expect(s.world.floor[idx(12, 12)]).toBeGreaterThan(0);
  });

  it("rooms need their objects, enough floor, walls and a door; equipment needs power", () => {
    const s = new Sim(2);
    s.foundation(10, 10, 16, 15);
    s.paintRoom(11, 11, 15, 14, "gp");
    s.instantBuild();
    s.step(0.1, 1);
    let gp = s.world.roomsOf("gp")[0];
    expect(gp.valid).toBe(false);
    expect(gp.issues.join()).toMatch(/desk/);
    expect(gp.issues.join()).toMatch(/door/);
    s.door(idx(13, 15));
    s.placeObject("desk", 11, 11, 0);
    s.placeObject("chair", 11, 12, 0);
    s.placeObject("examBed", 13, 13, 0);
    s.instantBuild();
    s.step(0.1, 1);
    gp = s.world.roomsOf("gp")[0];
    expect(gp.issues).toEqual([]);
    expect(gp.valid).toBe(true);
    // Radiology without a generator: not enough power.
    s.foundation(20, 10, 26, 15);
    s.door(idx(23, 15));
    s.paintRoom(21, 11, 25, 14, "radiology");
    s.placeObject("xray", 21, 11, 0);
    s.placeObject("leadScreen", 24, 13, 0);
    s.instantBuild();
    s.step(0.1, 1);
    expect(s.world.roomsOf("radiology")[0].issues.join()).toMatch(/power/);
    s.placeObject("generator", 30, 10, 0);
    s.instantBuild();
    s.step(0.1, 1);
    expect(s.world.roomsOf("radiology")[0].valid).toBe(true);
  });

  it("walls block people; doors let them through", () => {
    const w = new World();
    for (let z = 0; z < 20; z++) w.wall[idx(10, z)] = BUILT;
    expect(w.path(idx(5, 5), idx(15, 5))).not.toBeNull(); // round the end of the wall
    for (let z = 0; z <= 44; z++) w.wall[idx(10, z)] = BUILT;
    expect(w.path(idx(5, 5), idx(15, 5))).toBeNull();
    w.door[idx(10, 5)] = BUILT;
    const p = w.path(idx(5, 5), idx(15, 5))!;
    expect(p).toContain(idx(10, 5));
  });
});

describe("patients", () => {
  it("a staffed starter hospital checks people in, treats them and gets paid", () => {
    const s = new Sim(3);
    starterHospital(s, { build: true });
    staffed(s);
    const cash = s.cash;
    run(s, 30);
    expect(s.world.rooms.filter((r) => r.valid).map((r) => r.type).sort()).toEqual(expect.arrayContaining(["gp", "pharmacy", "reception", "ward", "waiting"]));
    expect(s.stats.treated).toBeGreaterThan(4);
    expect(s.stats.meds).toBeGreaterThan(0);
    expect(s.stats.income).toBeGreaterThan(cash * 0.02);
    expect(s.grants.opening).toBe("done");
  });

  it("patients who need a room the hospital doesn't have wait, give up or die, and the notices say why", () => {
    const s = new Sim(4);
    starterHospital(s, { build: true });
    staffed(s);
    run(s, 40);
    // Fractures and pneumonia need radiology, which the small hospital lacks.
    expect(s.stats.left + s.stats.deaths).toBeGreaterThan(0);
    s.updateNotices();
    const all = s.notices.map((n) => n.text).join(" | ");
    expect(all).toMatch(/radiology|operating theatre|emergency/);
  });

  it("a full hospital with radiology, an emergency room and power takes ambulances and scans patients", () => {
    const s = new Sim(5);
    starterHospital(s, { build: true, full: true });
    staffed(s);
    s.hire("doctor");
    s.hire("doctor");
    s.hire("receptionist");
    run(s, 72);
    expect(s.power.ok).toBe(true);
    expect(s.world.roomsOf("radiology")[0].valid).toBe(true);
    expect(s.world.roomsOf("emergency")[0].valid).toBe(true);
    expect(s.stats.scans).toBeGreaterThan(0);
    expect(s.stats.er).toBeGreaterThan(0);
    expect(s.stats.treated).toBeGreaterThan(15);
  });
});

describe("running the place", () => {
  it("bureaucracy: the director opens more grants, the chief of medicine unlocks surgeons", () => {
    const s = new Sim(6);
    expect(s.hire("surgeon")).toBeNull();
    expect(s.hire("accountant")).toBeNull();
    starterHospital(s, { build: true });
    s.foundation(40, 4, 46, 10);
    s.door(idx(43, 10));
    s.paintRoom(41, 5, 45, 9, "office");
    s.placeObject("desk", 41, 6, 0);
    s.placeObject("chair", 41, 5, 0);
    s.placeObject("filing", 45, 5, 0);
    s.instantBuild();
    s.hire("director");
    run(s, 4);
    expect(s.adminActive("director")).toBe(true);
    expect(s.grants.pharmacy).toBe("open");
    expect(s.hire("chief")).not.toBeNull();
    // One office each: the chief has nowhere to sit yet.
    run(s, 2);
    expect(s.adminActive("chief")).toBe(false);
  });

  it("wages are paid every hour and a demolished plan is refunded", () => {
    const s = new Sim(7);
    s.hire("doctor");
    const before = s.cash;
    run(s, 24);
    expect(before - s.cash).toBeCloseTo(420, -2);
    const c = s.cash;
    s.foundation(10, 10, 14, 14);
    expect(s.cash).toBeLessThan(c);
    s.demolish(10, 10, 14, 14);
    expect(s.cash).toBeCloseTo(c, 0);
    expect(s.jobs.size).toBe(0);
  });

  it("dirty floors bring an outbreak warning; janitors clean them", () => {
    const s = new Sim(8);
    starterHospital(s, { build: true });
    for (let i = 0; i < s.world.dirt.length; i++) if (s.world.found[i]) s.world.dirt[i] = 0.5;
    run(s, 1);
    expect(s.hygiene).toBeLessThan(0.5);
    s.updateNotices();
    expect(s.notices.some((n) => /Hygiene/.test(n.text))).toBe(true);
    for (let i = 0; i < 4; i++) s.hire("janitor");
    run(s, 24);
    expect(s.hygiene).toBeGreaterThan(0.6);
  });

  it("a hospital survives a save round trip", () => {
    const s = new Sim(9);
    starterHospital(s, { build: true });
    staffed(s);
    s.foundation(40, 4, 46, 10);
    run(s, 6);
    const j = JSON.parse(JSON.stringify(s.toJSON()));
    const t = Sim.from(j);
    expect(t.cash).toBe(s.cash);
    expect(t.people.size).toBe(s.people.size);
    expect(t.jobs.size).toBe(s.jobs.size);
    expect(t.world.objects.size).toBe(s.world.objects.size);
    expect(Array.from(t.world.wall)).toEqual(Array.from(s.world.wall));
    run(t, 6);
    expect(t.minutes).toBeGreaterThan(s.minutes);
  });
});
