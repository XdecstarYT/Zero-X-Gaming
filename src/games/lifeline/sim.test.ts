import { describe, expect, it } from "vitest";
import { START_CASH } from "./data";
import { starterHospital } from "./plan";
import { QUICK_ORDER, QUICK_ROOMS } from "./quick";
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
    // Someone to fix the x-ray when it wears out.
    s.hire("workman");
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

// ------------------------------------------------------------ mega update

import { RESEARCH, RESEARCH_ORDER, SCENARIOS } from "./data";
import { megaWing } from "./plan";
import { levelOf } from "./sim";

function bigHospital(seed: number, researched = true) {
  const s = new Sim(seed);
  starterHospital(s, { build: true, full: true });
  s.cash = 1_000_000;
  megaWing(s, { build: true });
  if (researched) s.research.done = [...RESEARCH_ORDER];
  s.world.touch();
  for (const r of ["receptionist", "receptionist", "doctor", "doctor", "doctor", "doctor", "doctor", "doctor", "nurse", "nurse", "nurse", "nurse", "midwife", "psychiatrist", "janitor", "janitor", "workman"] as const) s.hire(r);
  return s;
}

describe("mega update", () => {
  it("research: a staffed lab finishes projects, which unlock rooms and staff", () => {
    const s = bigHospital(21, false);
    s.hire("doctor");
    run(s, 1);
    expect(s.hire("midwife")).toBeNull();
    expect(s.world.roomsOf("icu")[0].valid).toBe(false);
    expect(s.world.roomsOf("icu")[0].issues[0]).toMatch(/Research/);
    expect(s.setResearch("mri")).toBe(false); // needs Rapid diagnostics first
    expect(s.setResearch("intensiveCare")).toBe(true);
    run(s, 40);
    expect(s.research.done).toContain("intensiveCare");
    expect(s.world.roomsOf("icu")[0].valid).toBe(true);
    // The lab carries on with the next project by itself.
    run(s, 30);
    expect(s.research.done.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(RESEARCH)).toHaveLength(10);
  });

  it("new departments treat new conditions: births, therapy, MRI scans and intensive care", () => {
    const s = bigHospital(22);
    for (const r of s.world.rooms) expect(r.valid, `${r.type}: ${r.issues.join()}`).toBe(true);
    run(s, 96);
    expect(s.stats.births + s.stats.therapy + s.stats.mri + s.stats.icu).toBeGreaterThan(3);
    expect(s.stats.treated).toBeGreaterThan(40);
  });

  it("air ambulances land on the helipad with major trauma cases", () => {
    const s = bigHospital(23);
    run(s, 0.5);
    (s as unknown as { callHelicopter: () => void }).callHelicopter();
    // Radioed in first, then in the air when it's due.
    expect(s.incoming.map((c) => c.kind)).toEqual(["helicopter"]);
    s.incoming[0].eta = s.minutes;
    s.step(0.1, 1);
    expect(s.vehicles.some((v) => v.kind === "helicopter")).toBe(true);
    for (let i = 0; i < 300 && ![...s.people.values()].some((p) => p.air); i++) s.step(0.1, 1);
    const flown = [...s.people.values()].filter((p) => p.air);
    expect(flown.length).toBe(1);
    expect(flown[0].cond).toBe("majorTrauma");
    // Landed on the pad, not at the street.
    expect(flown[0].x).toBeGreaterThan(55);
  });

  it("machines wear out and break; workmen repair them", () => {
    const s = bigHospital(24);
    run(s, 0.2);
    const xray = [...s.world.objects.values()].find((o) => o.kind === "xray")!;
    xray.wear = 1;
    s.world.touch();
    s.step(0.1, 1);
    expect(s.world.roomsOf("radiology")[0].valid).toBe(false);
    expect(s.world.roomsOf("radiology")[0].issues.join()).toMatch(/broken/);
    run(s, 4);
    expect(xray.wear).toBeLessThan(0.5);
    expect(s.stats.repairs).toBeGreaterThan(0);
    expect(s.world.roomsOf("radiology")[0].valid).toBe(true);
  });

  it("staff gain experience and level up", () => {
    expect([0, 6, 24, 54, 96, 1000].map(levelOf)).toEqual([1, 2, 3, 4, 5, 5]);
    const s = bigHospital(25);
    run(s, 30);
    const best = Math.max(...[...s.people.values()].filter((p) => p.kind === "staff").map((p) => p.xp));
    expect(best).toBeGreaterThan(6);
  });

  it("scenarios: medals by goal, and they end on time", () => {
    const s = new Sim(26);
    s.startScenario("cityGeneral");
    expect(s.cash).toBe(SCENARIOS.cityGeneral.cash);
    s.stats.treated = SCENARIOS.cityGeneral.goals[1];
    run(s, 1);
    expect(s.scenario!.medal).toBe(2);
    expect(s.scenario!.finished).toBe(false);
    run(s, 24 * SCENARIOS.cityGeneral.days);
    expect(s.scenario!.finished).toBe(true);
    const t = Sim.from(JSON.parse(JSON.stringify(s.toJSON())));
    expect(t.scenario).toEqual(s.scenario);
  });

  it("weekly awards pay out for a clean, safe, busy week", () => {
    const s = new Sim(27);
    s.week = { treated: 90, deaths: 0, left: 2, hyg: 0.95 * 168, hours: 168 };
    const cash = s.cash;
    (s as unknown as { awards: () => void }).awards();
    expect(s.lastAwards.map((a) => a.name)).toHaveLength(4);
    expect(s.cash - cash).toBe(10_000 + 20_000 + 8_000 + 15_000);
    expect(s.week.treated).toBe(0);
  });
});

describe("quick rooms and the emergency department", () => {
  it("every quick room builds into working rooms, whichever way it's turned", () => {
    for (const id of QUICK_ORDER)
      for (let rot = 0; rot < 4; rot++) {
        const s = new Sim(3);
        s.cash = 1_000_000;
        s.research.done = [...RESEARCH_ORDER];
        s.adminActive = () => true;
        const plan = s.quickPlan(id, 10, 10, rot);
        expect(plan.ok, `${id} ${rot}: ${plan.reason}`).toBe(true);
        expect(s.placeQuickRoom(id, 10, 10, rot)).toBe(true);
        expect(s.world.objects.size, `${id} ${rot}`).toBe(QUICK_ROOMS[id].items.length);
        s.placeObject("generator", 1, 1, 0);
        s.instantBuild();
        s.step(0.1, 1);
        for (const r of plan.layout.rooms) {
          const key = s.world.roomOf[idx(Math.floor((r.x0 + r.x1) / 2), Math.floor((r.z0 + r.z1) / 2))];
          const room = s.world.rooms.find((x) => x.id === key);
          expect(room?.type, `${id} ${rot}`).toBe(r.room);
          expect(room?.issues, `${id} ${rot} ${r.room}`).toEqual([]);
        }
      }
  });

  it("quick rooms share walls with what's there, but not floor space, and cost what they say", () => {
    const s = new Sim(4);
    s.cash = 200_000;
    starterHospital(s, { build: true });
    // Sharing the main block's east wall (x = 33).
    const before = s.cash;
    const plan = s.quickPlan("gp", 33, 14, 0);
    expect(plan.ok).toBe(true);
    expect(s.placeQuickRoom("gp", 33, 14, 0)).toBe(true);
    expect(before - s.cash).toBe(plan.cost);
    // Inside the hospital: no.
    expect(s.quickPlan("office", 20, 28, 0).ok).toBe(false);
    // Locked rooms say why.
    expect(s.quickPlan("icu", 40, 2, 0).reason).toMatch(/Research/);
  });

  it("ambulances are radioed in with their condition and arrive on time, at the ambulance bay", () => {
    const s = bigHospital(31);
    s.placeQuickRoom("ambulanceBay", 20, 41, 0);
    s.instantBuild();
    (s as unknown as { callAmbulance: () => void }).callAmbulance();
    expect(s.incoming.length).toBe(1);
    const call = s.incoming[0];
    expect(call.eta).toBeGreaterThan(s.minutes);
    expect(["allergy", "burns", "heartAttack", "stroke", "prematureLabour", "sepsis"]).toContain(call.cond);
    while (s.minutes < call.eta + 30) s.step(0.1, 4);
    expect(s.incoming.length).toBe(0);
    const p = [...s.people.values()].find((q) => q.ambulance && q.cond === call.cond);
    expect(p).toBeTruthy();
  });

  it("a staffed triage room sees ambulance cases first and they wait in order of need", () => {
    const s = bigHospital(32);
    expect(s.placeQuickRoom("triage", 4, 4, 0)).toBe(true);
    s.instantBuild();
    s.hire("nurse");
    s.hire("nurse");
    s.step(0.1, 1);
    for (let i = 0; i < 4; i++) (s as unknown as { callAmbulance: (a: boolean, e: number) => void }).callAmbulance(false, 2 + i);
    run(s, 8);
    expect(s.stats.triaged).toBeGreaterThan(0);
    expect(s.stats.er).toBeGreaterThan(0);
  });

  it("Code Blue: the nearest doctor or nurse runs to the patient", () => {
    const s = bigHospital(33);
    s.minutes = 9 * 60;
    run(s, 3);
    expect(s.triggerEmergency("codeBlue")).toBe(true);
    expect(s.emergency?.kind).toBe("codeBlue");
    const pt = s.people.get(s.emergency!.patient)!;
    expect(pt.arrest).toBeGreaterThan(0);
    run(s, 1);
    expect(s.emergency).toBeNull();
    expect(s.stats.codeSaved + s.stats.codeLost).toBe(1);
  });

  it("fires close the room and wreck things until workmen put them out", () => {
    const s = bigHospital(34);
    s.hire("workman");
    s.hire("workman");
    run(s, 1);
    expect(s.triggerEmergency("fire")).toBe(true);
    const room = s.roomByKey(s.emergency!.room)!;
    expect(s.burning(room)).toBe(true);
    // Burning while the crew gets there.
    s.step(0.1, 1);
    let hours = 0;
    while (s.emergency && hours < 6) {
      run(s, 0.5);
      hours += 0.5;
    }
    expect(s.emergency).toBeNull();
    expect(s.stats.fires).toBe(1);
  });

  it("a major incident sends a wave of critical patients, then pays for the ones saved", () => {
    const s = bigHospital(35);
    s.minutes = 9 * 60;
    run(s, 1);
    expect(s.triggerEmergency("majorIncident")).toBe(true);
    const total = s.emergency!.total;
    expect(total).toBeGreaterThanOrEqual(5);
    expect(s.incoming.filter((c) => c.incident).length).toBe(total);
    // Only one emergency at a time.
    expect(s.triggerEmergency("fire")).toBe(false);
    run(s, 19);
    expect(s.emergency).toBeNull();
    expect(s.stats.incidents).toBe(1);
  });

  it("radio calls and emergencies survive a save", () => {
    const s = bigHospital(36);
    run(s, 1);
    s.triggerEmergency("fire");
    (s as unknown as { callAmbulance: () => void }).callAmbulance();
    const t = Sim.from(JSON.parse(JSON.stringify(s.toJSON())));
    expect(t.incoming.length).toBe(s.incoming.length);
    expect(t.emergency?.kind).toBe("fire");
    expect(Object.keys(t.emergency!.fire).length).toBeGreaterThan(0);
  });
});
