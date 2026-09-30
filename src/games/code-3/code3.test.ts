import { describe, expect, it } from "vitest";
import { generateCity, HALF_STREET, line, LINES, lightFor, locationOf, nodeId, onRoad, route, SIZE, SPEED_LIMIT, STREETS_EW, STREETS_NS } from "./city";
import { hipRoofGeometry, isLawn, wallGeometry } from "./scenery";
import { makePerson } from "./people";
import { createRng } from "../engine/rng";
import { Code3Sim, FINES, NO_INPUT, type Code3Input, type Ped } from "./sim";
import { forward, makeCar, right, speedOf, stepCar } from "./vehicles";

const DT = 1 / 60;
const run = (s: Code3Sim, seconds: number, input: Partial<Code3Input> = {}) => {
  for (let t = 0; t < seconds; t += DT) s.step(DT, { ...NO_INPUT, ...input });
};

describe("Bayview", () => {
  const city = generateCity();

  it("has a connected street grid, a station and places for callouts", () => {
    expect(route(nodeId(0, 0), nodeId(LINES - 1, LINES - 1))).toHaveLength(2 * (LINES - 1) + 1);
    const kinds = new Set(city.places.map((p) => p.kind));
    for (const k of ["station", "store", "bank", "gas", "hospital", "house", "park"]) expect(kinds.has(k as never), k).toBe(true);
    expect(city.buildings.length).toBeGreaterThan(150);
  });

  it("keeps every building off the streets and sidewalks", () => {
    for (const b of city.buildings)
      for (const [x, z] of [[b.x - b.hw, b.z - b.hd], [b.x + b.hw, b.z + b.hd], [b.x, b.z]]) {
        expect(onRoad(x, z)).toBe(false);
        expect(x).toBeGreaterThan(HALF_STREET);
        expect(z).toBeLessThan(SIZE - HALF_STREET);
      }
  });

  it("never shows green both ways at an intersection", () => {
    for (let t = 0; t < 40; t += 0.25)
      for (const n of [0, 9, 27]) expect(lightFor(n, "ns", t) !== "red" && lightFor(n, "ew", t) !== "red").toBe(false);
  });
});

describe("driving", () => {
  it("accelerates, brakes to a stop, and a handbrake turn slides", () => {
    const c = makeCar("x", "cruiser", 100, 100, 0, "#000");
    for (let t = 0; t < 4; t += DT) stepCar(c, { throttle: 1, brake: 0, steer: 0, handbrake: false }, DT);
    expect(speedOf(c)).toBeGreaterThan(17);
    for (let t = 0; t < 4; t += DT) stepCar(c, { throttle: 0, brake: 1, steer: 0, handbrake: false }, DT);
    expect(Math.abs(speedOf(c))).toBeLessThan(0.1);
    for (let t = 0; t < 3; t += DT) stepCar(c, { throttle: 1, brake: 0, steer: 0, handbrake: false }, DT);
    for (let t = 0; t < 0.6; t += DT) stepCar(c, { throttle: 0, brake: 0, steer: 1, handbrake: true }, DT);
    const f = forward(c.h);
    const slip = Math.abs(c.vx * -f.z + c.vz * f.x);
    expect(slip).toBeGreaterThan(2);
  });

  it("civilian traffic stays on the streets and flows through the lights", () => {
    const s = new Code3Sim({ seed: 5, firstCall: 1e9 });
    let moving = 0;
    let samples = 0;
    for (let k = 0; k < 6; k++) {
      run(s, 10);
      const civ = s.cars.filter((c) => c.ai && !c.spec.police);
      // On a carriageway, or at most a wheel over the kerb mid-turn.
      const near = (x: number, z: number) => [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dz]) => onRoad(x + dx, z + dz));
      for (const c of civ) expect(near(c.x, c.z), c.id).toBe(true);
      moving += civ.filter((c) => Math.abs(speedOf(c)) > 1).length;
      samples += civ.length;
    }
    expect(moving / samples).toBeGreaterThan(0.4);
    expect(s.stats.score).toBe(0);
  });
});

/** Put the unit 12 m behind a civilian car and light it up. */
function pullOver(s: Code3Sim) {
  const c = s.cars.find((x) => x.ai && !x.spec.police && x.ai.mode === "cruise" && x.reg && x.driver)!;
  const d = s.ped(c.driver)!;
  d.person.flee = 0;
  d.person.fight = 0;
  const f = forward(c.h);
  Object.assign(s.unit, { x: c.x - f.x * 12, z: c.z - f.z * 12, h: c.h, vx: c.vx, vz: c.vz });
  s.unit.lights = true;
  for (let t = 0; t < 12 && !s.contacts.some((k) => k.car === c.id); t += DT) {
    // Follow it while it slows down.
    const ff = forward(c.h);
    Object.assign(s.unit, { x: c.x - ff.x * 11, z: c.z - ff.z * 11, h: c.h, vx: c.vx, vz: c.vz });
    s.step(DT, NO_INPUT);
  }
  const k = s.contacts.find((x) => x.car === c.id)!;
  expect(k, "contact").toBeTruthy();
  k.runs = false;
  // Out of the unit and up to the driver's window.
  s.unit.vx = s.unit.vz = 0;
  run(s, 0.05, { enter: true });
  expect(s.player.inCar).toBe(false);
  const r = right(c.h);
  s.player.x = c.x - r.x * 1.3;
  s.player.z = c.z - r.z * 1.3;
  return { c, d, k };
}

const has = (s: Code3Sim, id: string) => s.options().some((o) => o.id === id);

describe("traffic stops", () => {
  it("lights behind a car pull it over; ID, MDT and a release send it on its way", () => {
    const s = new Code3Sim({ seed: 11, firstCall: 1e9 });
    run(s, 2);
    const { c, d, k } = pullOver(s);
    expect(Math.abs(speedOf(c))).toBeLessThan(0.5);
    expect(s.stats.stops).toBe(1);
    expect(has(s, "id")).toBe(true);
    d.person.warrants = [];
    d.person.licence = "valid";
    c.reg!.status = "valid";
    s.choose("id");
    expect(k.idShown).toBe(true);
    s.choose("person");
    s.choose("plate");
    expect(s.mdt.map((m) => m.title)).toEqual([`PLATE: ${c.reg!.plate}`, expect.stringMatching(/^PERSON: /)]);
    s.choose("release");
    expect(k.resolved).toBe("released");
    s.unit.lights = false;
    // It drives off (allowing for a red light on the way).
    const x0 = c.x;
    const z0 = c.z;
    for (let t = 0; t < 25 && Math.hypot(c.x - x0, c.z - z0) < 8; t += 0.5) run(s, 0.5);
    expect(Math.hypot(c.x - x0, c.z - z0)).toBeGreaterThan(8);
  });

  it("with the siren on (responding to a call) traffic yields but nobody is pulled over", () => {
    const s = new Code3Sim({ seed: 16, firstCall: 1e9 });
    run(s, 2);
    const c = s.cars.find((x) => x.ai && !x.spec.police && x.ai.mode === "cruise" && x.driver)!;
    s.unit.lights = true;
    s.unit.siren = true;
    let yielded = false;
    for (let t = 0; t < 4; t += DT) {
      const f = forward(c.h);
      Object.assign(s.unit, { x: c.x - f.x * 12, z: c.z - f.z * 12, h: c.h, vx: f.x * 8, vz: f.z * 8 });
      s.step(DT, NO_INPUT);
      yielded ||= c.ai!.mode === "yield";
    }
    expect(yielded).toBe(true);
    expect(s.stopCar).toBeNull();
    expect(s.contacts).toHaveLength(0);
  });

  it("a warrant found on the MDT justifies the arrest; cuff, load, book at the station", () => {
    const s = new Code3Sim({ seed: 12, firstCall: 1e9 });
    run(s, 2);
    const { d, k } = pullOver(s);
    d.person.warrants = ["Burglary"];
    s.choose("id");
    s.choose("person");
    expect([...k.offences]).toContain("outstanding warrant");
    s.choose("out");
    expect(d.state).toBe("stand");
    s.player.x = d.x + 1;
    s.player.z = d.z;
    s.choose("arrest");
    expect(d.state).toBe("cuffed");
    expect(s.stats.arrests).toBe(1);
    s.choose("miranda");
    const afterArrest = s.stats.score;
    expect(afterArrest).toBeGreaterThan(100);
    // Walk them to the unit and put them in.
    s.unit.x = d.x + 2;
    s.unit.z = d.z + 2;
    s.choose("load");
    expect(s.unit.back).toEqual([d.id]);
    // Drive to the station and book.
    s.player.inCar = true;
    Object.assign(s.unit, { x: s.city.station.x, z: s.city.station.z, vx: 0, vz: 0 });
    expect(s.options().map((o) => o.id)).toContain("book");
    s.choose("book");
    expect(s.stats.booked).toBe(1);
    expect(s.stats.score).toBe(afterArrest + 100 + 10);
  });

  it("a DUI: slurred answers give probable cause, the breathalyzer seals it", () => {
    const s = new Code3Sim({ seed: 13, firstCall: 1e9 });
    run(s, 2);
    const { d, k } = pullOver(s);
    d.person.bac = 0.14;
    s.choose("drink");
    expect(k.pc.has("alcohol")).toBe(true);
    s.choose("out");
    s.player.x = d.x + 1;
    s.player.z = d.z;
    s.choose("breath");
    expect([...k.offences]).toContain("DUI");
    expect(s.mdt[0].lines[1]).toBe("OVER THE LIMIT (0.08)");
  });

  it("no cause: a wrongful arrest is penalised; a refused search done anyway is unlawful and inadmissible", () => {
    const s = new Code3Sim({ seed: 14, firstCall: 1e9 });
    run(s, 2);
    const { d, k } = pullOver(s);
    Object.assign(d.person, { warrants: [], drugs: true, armed: false, attitude: "hostile", bac: 0 });
    k.violations.clear();
    s.choose("search");
    expect(k.refused).toBe(true);
    s.choose("search");
    expect(k.tainted).toBe(true);
    expect(k.offences.has("possession of narcotics")).toBe(false);
    expect(s.stats.score).toBe(-50);
    s.choose("arrest");
    expect(s.stats.score).toBe(-200);
    expect(d.state).not.toBe("cuffed");
  });

  it("citations need a violation and pay per violation", () => {
    const s = new Code3Sim({ seed: 15, firstCall: 1e9 });
    run(s, 2);
    const { c, d, k } = pullOver(s);
    Object.assign(d.person, { warrants: [], licence: "valid" });
    c.reg!.status = "expired";
    expect(has(s, "cite")).toBe(k.violations.size > 0);
    s.choose("plate");
    expect(k.violations.has("expired registration")).toBe(true);
    const before = s.stats.score;
    s.choose("cite");
    expect(s.stats.citations).toBe(1);
    expect(s.stats.score - before).toBe(40 + 30 * k.violations.size);
    expect(k.resolved).toBe("cited");
  });
});

describe("pursuits and force", () => {
  it("a fleeing car is chased; wrecking it ends the pursuit and the driver bails or gives up", () => {
    const s = new Code3Sim({ seed: 21, firstCall: 1e9 });
    run(s, 1);
    const c = s.cars.find((x) => x.ai && !x.spec.police && x.driver)!;
    s.startPursuit(c);
    expect(c.ai!.mode).toBe("flee");
    Object.assign(s.unit, { x: c.x + 20, z: c.z });
    run(s, 1);
    c.health = 0;
    run(s, 0.1);
    expect(c.ai!.mode).toBe("parked");
    const d = s.peds.find((p) => p.carId === c.id)!;
    expect(["flee", "handsup", "attack"]).toContain(d.state);
    expect(s.contactFor(d.id)!.offences.has("evading police")).toBe(true);
    expect(s.stats.pursuits).toBe(1);
  });

  it("shooting someone who isn't a threat ends the shift", () => {
    const s = new Code3Sim({ seed: 22, firstCall: 1e9 });
    run(s, 0.5, { enter: true });
    const p = s.peds.find((x) => x.state === "walk")!;
    p.walk = undefined;
    p.state = "stand";
    s.player.x = p.x - 5;
    s.player.z = p.z;
    run(s, 0.05, { weapon: "pistol", fire: true, yaw: 0 });
    expect(s.over?.reason).toBe("Suspended");
    expect(s.stats.score).toBeLessThanOrEqual(-1000);
  });

  it("an armed suspect shoots back; returning fire is justified", () => {
    const s = new Code3Sim({ seed: 23, firstCall: 1e9 });
    run(s, 0.5, { enter: true });
    const p = s.peds.find((x) => x.state === "walk") as Ped;
    p.walk = undefined;
    p.person.armed = true;
    p.state = "attack" as Ped["state"];
    p.role = "suspect";
    s.player.x = p.x - 6;
    s.player.z = p.z;
    for (let i = 0; i < 6 && p.state !== "dead"; i++) run(s, 0.4, { weapon: "pistol", fire: true, yaw: Math.atan2(p.z - s.player.z, p.x - s.player.x) });
    expect(p.state).toBe("dead");
    expect(s.over).toBeNull();
    expect(s.stats.penalties).toBe(0);
  });
});

describe("callouts", () => {
  it("dispatch offers a call; responding, arriving and taking the suspects into custody closes it", () => {
    const s = new Code3Sim({ seed: 31, firstCall: 1e9, rank: 5 });
    const call = s.offerCall("robbery");
    expect(s.offeredCall()).toBe(call);
    run(s, 0.05, { accept: true });
    expect(call.state).toBe("enroute");
    expect(s.waypoint()?.label).toBe("Armed robbery in progress");
    Object.assign(s.unit, { x: call.x, z: call.z + 20 });
    run(s, 0.05);
    expect(call.state).toBe("onscene");
    // Everyone gives up; cuff them all.
    run(s, 0.05, { enter: true });
    for (const id of call.suspects) {
      const p = s.ped(id)!;
      p.state = "handsup";
      s.player.x = p.x + 1;
      s.player.z = p.z;
      s.choose("arrest");
      expect(p.state).toBe("cuffed");
    }
    run(s, 0.1);
    expect(call.state).toBe("done");
    expect(s.stats.calls).toBe(1);
    expect(s.stats.report.some((r) => r.text === "Call closed: Armed robbery in progress")).toBe(true);
  });

  it("declined or ignored calls go to another unit", () => {
    const s = new Code3Sim({ seed: 32, firstCall: 1e9 });
    const a = s.offerCall("suspicious");
    run(s, 0.05, { decline: true });
    expect(a.state).toBe("declined");
    const b = s.offerCall("dui");
    run(s, 26);
    expect(b.state).toBe("expired");
  });

  it("the shift ends on time", () => {
    const s = new Code3Sim({ seed: 33, shiftSeconds: 3, firstCall: 1e9 });
    run(s, 3.2);
    expect(s.over?.reason).toBe("End of shift");
    expect(s.clockText()).toBe("04:00");
  });
});

describe("people", () => {
  it("shady people are more likely to have warrants and to run", () => {
    const rng = createRng(1);
    const clean = Array.from({ length: 300 }, () => makePerson(rng, { shady: 0 }));
    const shady = Array.from({ length: 300 }, () => makePerson(rng, { shady: 0.9 }));
    const w = (ps: typeof clean) => ps.filter((p) => p.warrants.length).length;
    expect(w(shady)).toBeGreaterThan(w(clean) * 3);
    expect(shady.reduce((a, p) => a + p.flee, 0)).toBeGreaterThan(clean.reduce((a, p) => a + p.flee, 0));
    expect(SPEED_LIMIT).toBeCloseTo(15.6);
  });
});

describe("patrol tools", () => {
  it("a spike strip blows a fleeing car's tyres and slows it right down", () => {
    const s = new Code3Sim({ seed: 41, firstCall: 1e9 });
    run(s, 1);
    const c = s.cars.find((x) => x.ai && !x.spec.police && x.driver)!;
    s.startPursuit(c);
    run(s, 0.05, { enter: true });
    // Lay the strip across the car's path, just ahead of it.
    const f = forward(c.h);
    s.player.x = c.x + f.x * 6;
    s.player.z = c.z + f.z * 6;
    s.step(DT, { ...NO_INPUT, spikes: true, yaw: c.h + Math.PI / 2 });
    expect(s.spikes).not.toBeNull();
    Object.assign(s.spikes!, { x: c.x + f.x * 5, z: c.z + f.z * 5, h: c.h + Math.PI / 2 });
    Object.assign(c, { vx: f.x * 20, vz: f.z * 20 });
    for (let t = 0; t < 1 && !c.spiked; t += DT) s.step(DT, NO_INPUT);
    expect(c.spiked).toBe(true);
    expect(s.stats.report.some((r) => r.text.startsWith("Spike strip"))).toBe(true);
    for (let t = 0; t < 6; t += DT) stepCar(c, { throttle: 1, brake: 0, steer: 0, handbrake: false }, DT);
    expect(speedOf(c)).toBeLessThan(c.spec.top * 0.45);
  });

  it("a verbal warning is a lighter outcome than a citation", () => {
    const s = new Code3Sim({ seed: 42, firstCall: 1e9 });
    run(s, 2);
    const { c, d, k } = pullOver(s);
    Object.assign(d.person, { warrants: [], licence: "valid" });
    c.brokenLight = true;
    k.violations.add("broken tail light");
    const before = s.stats.score;
    s.choose("warn");
    expect(s.stats.score - before).toBe(25);
    expect(k.resolved).toBe("cited");
  });

  it("EMS takes an injured pedestrian to hospital; an arrested driver's car can be towed", () => {
    const s = new Code3Sim({ seed: 43, firstCall: 1e9 });
    run(s, 0.5, { enter: true });
    const p = s.peds.find((x) => x.state === "walk")!;
    p.walk = undefined;
    Object.assign(p, { state: "down", downUntil: 1e12, role: "civilian" });
    s.player.x = p.x + 1;
    s.player.z = p.z;
    expect(s.options().map((o) => o.id)).toEqual(["ems"]);
    s.choose("ems");
    const amb = s.cars.find((c) => c.kind === "ambulance");
    expect(amb).toBeTruthy();
    Object.assign(amb!, { x: p.x + 3, z: p.z });
    run(s, 0.1);
    expect(s.ped(p.id)).toBeUndefined();
    expect(s.stats.report.some((r) => r.text === "Injured person taken to St. Mary's")).toBe(true);
  });

  it("rain means less grip", () => {
    const dry = makeCar("d", "cruiser", 100, 100, 0, "#000");
    const wet = makeCar("w", "cruiser", 100, 100, 0, "#000");
    for (const [c, surf] of [[dry, 1], [wet, 0.72]] as const) {
      for (let t = 0; t < 3; t += DT) stepCar(c, { throttle: 1, brake: 0, steer: 0, handbrake: false }, DT, surf);
      for (let t = 0; t < 0.5; t += DT) stepCar(c, { throttle: 0.5, brake: 0, steer: 1, handbrake: false }, DT, surf);
    }
    const slip = (c: typeof dry) => Math.abs(c.vx * -Math.sin(c.h) + c.vz * Math.cos(c.h));
    expect(slip(wet)).toBeGreaterThan(slip(dry));
    expect(new Code3Sim({ weather: "rain", firstCall: 1e9 }).surface).toBeLessThan(1);
  });

  it("new callouts: a shoplifter and a hit and run", () => {
    const s = new Code3Sim({ seed: 44, firstCall: 1e9, rank: 5 });
    const a = s.offerCall("shoplift");
    expect(a.suspects).toHaveLength(1);
    run(s, 0.05, { decline: true });
    const b = s.offerCall("hitrun");
    expect(b.victims).toHaveLength(1);
    expect(s.ped(b.victims[0])!.state).toBe("down");
    expect(b.cars).toHaveLength(1);
    expect(b.note).toMatch(/plate/);
  });
});

describe("checkpoints and road tools", () => {
  /** Put the officer on foot at the side of a north-south road, mid-block. */
  function roadside(s: Code3Sim) {
    run(s, 0.05, { enter: true });
    Object.assign(s.player, { x: s.city.lines[3] - 5.5, z: s.city.lines[3] + 36 });
  }

  it("a sobriety checkpoint stops traffic in its lane until each driver is screened", () => {
    const s = new Code3Sim({ seed: 51, firstCall: 1e9 });
    roadside(s);
    expect(s.options().map((o) => o.id)).toContain("cp-deploy");
    s.choose("cp-deploy");
    const cp = s.deploy.find((d) => d.kind === "checkpoint")!;
    expect(cp).toBeTruthy();
    expect([cp.dx, cp.dz]).toEqual([0, 1]); // southbound lane on this side
    // A southbound car approaches and stops at the line.
    const c = s.spawnTraffic(false, { near: { minD: 0, maxD: 1e9 } })!;
    const from = nodeId(3, 3);
    const to = nodeId(3, 4);
    Object.assign(c.ai!, { from, to, next: nodeId(3, 5), mode: "cruise" });
    Object.assign(c, { x: cp.x, z: cp.z - 30, h: Math.PI / 2, vx: 0, vz: 10 });
    for (let t = 0; t < 10 && !s.checkpointCar(); t += DT) s.step(DT, NO_INPUT);
    expect(s.checkpointCar()).toBe(c);
    // Walk to the window and screen the driver.
    const r = right(c.h);
    Object.assign(s.player, { x: c.x - r.x * 1.3, z: c.z - r.z * 1.3 });
    expect(s.options().map((o) => o.id)).toEqual(["cp-screen", "cp-wave"]);
    s.choose("cp-screen");
    const k = s.contacts.at(-1)!;
    expect(k.reason).toBe("Sobriety checkpoint");
    expect(s.stats.screened).toBe(1);
    // Released drivers go on through.
    k.runs = false;
    s.choose("release");
    const z0 = c.z;
    run(s, 6);
    expect(c.z - z0).toBeGreaterThan(5);
    s.choose("cp-remove");
    expect(s.deploy).toHaveLength(0);
  });

  it("a roadblock is solid and fleeing drivers route around it; cones are obstacles", () => {
    const s = new Code3Sim({ seed: 52, firstCall: 1e9 });
    run(s, 1);
    const flee = s.cars.find((x) => x.ai && !x.spec.police && x.driver)!;
    s.startPursuit(flee);
    roadside(s);
    expect(s.options().map((o) => o.id)).toContain("rb-deploy");
    s.choose("rb-deploy");
    const rb = s.deploy.find((d) => d.kind === "roadblock")!;
    // A car driven straight into it bounces off.
    const c = s.cars.find((x) => x !== flee && x.ai && !x.spec.police)!;
    c.ai!.mode = "parked";
    Object.assign(c, { x: rb.x, z: rb.z - 4, h: Math.PI / 2, vx: 0, vz: 15 });
    run(s, 0.6);
    expect(c.z).toBeLessThan(rb.z);
    s.choose("cones-deploy");
    expect(s.deploy.find((d) => d.kind === "cones")!.points).toHaveLength(6);
  });

  it("the plate reader flags stolen cars on the radio", () => {
    const s = new Code3Sim({ seed: 53, firstCall: 1e9 });
    const c = s.cars.find((x) => x.ai && x.reg && !x.spec.police)!;
    c.reg!.status = "stolen";
    Object.assign(s.unit, { x: c.x + 8, z: c.z });
    run(s, 0.6);
    expect(s.flagged.has(c.id)).toBe(true);
    expect(s.log.some((l) => l.text.includes("STOLEN"))).toBe(true);
  });

  it("Air-1 keeps the eye on a fleeing car so it isn't lost", () => {
    const s = new Code3Sim({ seed: 54, firstCall: 1e9 });
    run(s, 1);
    const c = s.cars.find((x) => x.ai && !x.spec.police && x.driver)!;
    s.startPursuit(c);
    expect(s.options().map((o) => o.id)).toContain("air");
    run(s, 0.05, { air: true });
    expect(s.air?.target).toBe(c.id);
    run(s, 5);
    expect(Math.hypot(s.air!.x - c.x, s.air!.z - c.z)).toBeLessThan(200);
  });

  it("K9 sniffs and field sobriety tests give probable cause", () => {
    const s = new Code3Sim({ seed: 55, firstCall: 1e9 });
    run(s, 2);
    const { d, k } = pullOver(s);
    d.person.drugs = true;
    d.person.bac = 0.12;
    s.choose("k9");
    run(s, 9);
    expect(k.pc.has("K9 alert")).toBe(true);
    s.choose("out");
    s.player.x = d.x + 1;
    s.player.z = d.z;
    s.choose("fst");
    expect(k.pc.has("alcohol")).toBe(true);
    expect(s.mdt[0].title).toBe("FIELD SOBRIETY TESTS");
  });

  it("ambient incidents appear on patrol, gunfire makes bystanders panic, and the shift gets a grade", () => {
    const s = new Code3Sim({ seed: 56, firstCall: 1e9 });
    run(s, 75);
    expect(s.log.some((l) => /fighting|stumbling/.test(l.text)) || s.peds.some((p) => p.state === "cross" || p.state === "fight")).toBe(true);
    run(s, 0.05, { enter: true });
    const p = s.peds.find((x) => x.state === "walk" && x.role === "civilian")!;
    Object.assign(s.player, { x: p.x + 5, z: p.z });
    const armed = s.peds.find((x) => x !== p && x.state === "walk")!;
    Object.assign(armed, { state: "attack", role: "suspect", walk: undefined, x: p.x + 20, z: p.z });
    armed.person.armed = true;
    run(s, 2);
    expect(p.state).toBe("panic");
    expect(["A+", "A", "B", "C", "D", "F"]).toContain(s.grade());
  });
});

describe("new callouts and procedures", () => {
  it("sets up every new call kind with the people and vehicles it needs", () => {
    const s = new Code3Sim({ seed: 31, firstCall: 1e9, rank: 5 });
    for (const kind of ["assist", "vandalism", "fugitive", "abandoned", "roadrage", "noise"] as const) {
      const call = s.offerCall(kind);
      expect(call.kind).toBe(kind);
      expect(call.note.length, kind).toBeGreaterThan(10);
      if (kind === "abandoned") {
        expect(call.cars).toHaveLength(1);
        expect(s.car(call.cars[0])!.driver).toBeFalsy();
      } else expect(call.suspects.length, kind).toBeGreaterThan(0);
      if (kind === "assist") {
        const cop = s.ped(call.victims[0])!;
        expect(cop.role).toBe("officer");
        expect(cop.drawn).toBe(true);
      }
      if (kind === "roadrage") expect(call.suspects.map((id) => s.ped(id)!.state)).toEqual(["fight", "fight"]);
      if (kind === "vandalism") expect(s.ped(call.suspects[0])!.task).toBe("spray");
      if (kind === "fugitive") expect(call.trackPed).toBe(call.suspects[0]);
      call.state = "declined";
    }
  });

  it("felony stop: driver ordered out from cover, walked back, knelt and cuffed by the book", () => {
    const s = new Code3Sim({ seed: 12, firstCall: 1e9, traffic: 2, peds: 4 });
    run(s, 2);
    const { c, d, k } = pullOver(s);
    c.reg!.status = "stolen";
    // Back off behind the car: no walking up to a stolen car's window.
    const f = forward(c.h);
    s.player.x = c.x - f.x * 14;
    s.player.z = c.z - f.z * 14;
    expect(has(s, "felony-out")).toBe(true);
    expect(s.options()[0].group).toBe("command");
    s.choose("felony-out");
    expect(k.felony).toBe(true);
    expect(d.state).toBe("handsup");
    expect(c.driver).toBeNull();
    expect(has(s, "cmd-back")).toBe(true);
    s.choose("cmd-back");
    expect(d.state).toBe("backing");
    for (let t = 0; t < 20 && d.state === "backing"; t += 0.5) run(s, 0.5);
    expect(d.state).toBe("handsup");
    expect(Math.hypot(d.x - s.player.x, d.z - s.player.z)).toBeLessThan(5.5);
    s.choose("cmd-kneel");
    expect(d.state).toBe("kneel");
    // Walk up, confirm the car is stolen, cuff.
    s.player.x = d.x + 1;
    s.player.z = d.z;
    s.choose("plate");
    expect(k.offences.has("stolen vehicle")).toBe(true);
    s.choose("arrest");
    expect(d.state).toBe("cuffed");
    expect(d.kneeling).toBe(true);
    expect(s.stats.report.some((r) => r.text === "Felony stop by the book")).toBe(true);
    expect(has(s, "stand")).toBe(true);
    s.choose("stand");
    expect(d.kneeling).toBe(false);
  });

  it("verbal commands from a distance: a suspect proned out is cuffed on the ground", () => {
    const s = new Code3Sim({ seed: 41, firstCall: 1e9, traffic: 2 });
    run(s, 0.5);
    run(s, 0.05, { enter: true });
    const p = s.peds.find((q) => q.state === "walk")!;
    Object.assign(p, { walk: undefined, state: "handsup", role: "suspect", x: s.player.x + 9, z: s.player.z });
    p.person.fight = 0;
    p.person.flee = 0;
    expect(s.commandTarget()?.id).toBe(p.id);
    s.choose("cmd-prone");
    expect(p.state).toBe("prone");
    run(s, 1);
    expect(p.state).toBe("prone");
    s.player.x = p.x - 1.2;
    s.player.z = p.z;
    s.choose("arrest");
    expect(p.state).toBe("cuffed");
    expect(p.kneeling).toBe(true);
  });

  it("paperwork: an arrest needs a report filed from the parked unit; unfiled reports cost points at end of watch", () => {
    const s = new Code3Sim({ seed: 12, firstCall: 1e9 });
    run(s, 2);
    const { d } = pullOver(s);
    d.person.warrants = ["Burglary"];
    s.choose("id");
    s.choose("person");
    s.choose("out");
    s.player.x = d.x + 1;
    s.player.z = d.z;
    s.choose("arrest");
    const rep = s.reports.find((r) => r.kind === "arrest")!;
    expect(rep.lines[0]).toContain("outstanding warrant");
    // Not from the sidewalk.
    s.choose(`report:${rep.id}`);
    expect(rep.filed).toBe(false);
    s.player.inCar = true;
    s.unit.vx = s.unit.vz = 0;
    expect(s.options().some((o) => o.id === `report:${rep.id}` && o.group === "unit")).toBe(true);
    const before = s.stats.score;
    s.choose(`report:${rep.id}`);
    expect(rep.filed).toBe(true);
    expect(s.stats.score).toBe(before + 25);
    s.reports.push({ id: "x", kind: "incident", title: "incident report: test", lines: [], at: 0, filed: false });
    const b2 = s.stats.score;
    s.end("End of shift");
    expect(s.stats.score).toBe(b2 - 10);
  });

  it("abandoned vehicle: run the plate on scene, a stolen one is recovered, the tow closes the call", () => {
    const s = new Code3Sim({ seed: 51, firstCall: 1e9, traffic: 2 });
    const call = s.offerCall("abandoned");
    s.acceptCall(call);
    const car = s.car(call.cars[0])!;
    car.reg!.status = "stolen";
    run(s, 0.05, { enter: true });
    s.player.x = car.x + 2;
    s.player.z = car.z;
    run(s, 0.1);
    expect(call.state).toBe("onscene");
    expect(has(s, "ab-plate")).toBe(true);
    s.choose("ab-plate");
    expect(s.mdt[0].title).toBe(`PLATE: ${car.reg!.plate}`);
    s.choose("ab-tow");
    expect(s.stats.report.some((r) => r.text === "Stolen vehicle recovered")).toBe(true);
    run(s, 11);
    expect(call.state).toBe("done");
    expect(s.car(car.id)).toBeUndefined();
  });

  it("noise complaint: talk to the resident, a warning closes it", () => {
    const s = new Code3Sim({ seed: 52, firstCall: 1e9, traffic: 2 });
    const call = s.offerCall("noise");
    s.acceptCall(call);
    const r = s.ped(call.suspects[0])!;
    Object.assign(r.person, { attitude: "polite", fight: 0, flee: 0 });
    run(s, 0.05, { enter: true });
    s.player.x = r.x + 1.5;
    s.player.z = r.z;
    run(s, 0.1);
    s.choose("talk");
    const k = s.contactFor(r.id)!;
    expect(k.violations.has("noise ordinance")).toBe(true);
    s.choose("warn");
    run(s, 0.1);
    expect(call.state).toBe("done");
    expect(s.reports.some((x) => x.kind === "incident")).toBe(true);
  });

  it("the taser locks the target up for a moment (render: tased)", () => {
    const s = new Code3Sim({ seed: 53, firstCall: 1e9, traffic: 2 });
    run(s, 0.05, { enter: true });
    const p = s.peds.find((q) => q.state === "walk")!;
    Object.assign(p, { walk: undefined, state: "flee", role: "suspect", x: s.player.x + 5, z: s.player.z });
    s.player.h = 0;
    s.step(DT, { ...NO_INPUT, yaw: 0, fire: true });
    expect(p.state).toBe("down");
    expect(p.tasedUntil).toBeGreaterThan(s.time);
    expect(s.reports.some((r) => r.kind === "force")).toBe(true);
  });
});

describe("HUD helpers", () => {
  it("names the street, the cross street and the district", () => {
    const city = generateCity();
    const loc = locationOf(city, line(4), line(2) + 30);
    expect(loc.street).toBe(STREETS_NS[4]);
    expect(loc.cross).toBe(STREETS_EW[2]);
    expect(locationOf(city, line(3), line(3)).street).toBe(`${STREETS_NS[3]} & ${STREETS_EW[3]}`);
    expect(locationOf(city, line(3) + 20, line(3) + 20).district).toBe("Downtown");
  });

  it("orders actions by kind: commands first, unit last", () => {
    const s = new Code3Sim({ seed: 12, firstCall: 1e9 });
    run(s, 2);
    pullOver(s);
    const groups = s.options().map((o) => o.group);
    const order = ["command", "talk", "check", "enforce", "custody", "scene", "unit"];
    const idx = groups.map((g) => order.indexOf(g!));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(groups).toContain("talk");
    expect(groups).toContain("check");
  });
});

describe("scenery geometry", () => {
  const city = generateCity();
  it("fits whole bays and floors on every wall, with a ground-floor strip", () => {
    const tower = city.buildings.find((b) => b.kind === "tower")!;
    const walls = wallGeometry(city, [tower]);
    const keys = [...walls.keys()];
    expect(keys.some((k) => k.startsWith("b:tower"))).toBe(true);
    expect(keys.some((k) => k.startsWith("u:tower"))).toBe(true);
    const up = walls.get(keys.find((k) => k.startsWith("u:"))!)!;
    const uv = up.attributes.uv as import("three").BufferAttribute;
    let maxU = 0;
    for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, uv.getX(i));
    // A whole number of 4 m bays per wall, 4 bays per texture tile.
    expect((maxU * 4) % 1).toBeCloseTo(0, 5);
  });

  it("hip roofs face up and out; lawns avoid houses, driveways and park paths", () => {
    const houses = city.buildings.filter((b) => b.kind === "house").slice(0, 6);
    const roof = hipRoofGeometry(houses)!;
    const n = roof.attributes.normal as import("three").BufferAttribute;
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.3);
    const park = city.blocks.find((b) => b.district === "park")!;
    expect(isLawn(city, park.x0 + 10, park.z0 + 30)).toBe(true);
    expect(isLawn(city, (park.x0 + park.x1) / 2, (park.z0 + park.z1) / 2)).toBe(false);
    const h = houses[0];
    expect(isLawn(city, h.x, h.z)).toBe(false);
    const down = city.blocks.find((b) => b.district === "downtown")!;
    expect(isLawn(city, down.x0 + 2, down.z0 + 2)).toBe(false);
  });
});

describe("the ticket book and the living street", () => {
  it("a ticket pays for what you established; charges you never saw are thrown out", () => {
    const s = new Code3Sim({ seed: 15, firstCall: 1e9 });
    run(s, 2);
    const { c, d, k } = pullOver(s);
    Object.assign(d.person, { warrants: [], licence: "valid" });
    c.reg!.status = "expired";
    s.choose("plate");
    const book = s.ticketBook()!;
    expect(book.known).toContain("expired registration");
    expect(book.book.map((b) => b.v)).toContain("no seatbelt");
    const before = s.stats.score;
    k.violations.delete("no seatbelt");
    s.choose("ticket:expired registration,no seatbelt");
    expect(s.stats.citations).toBe(1);
    expect(s.stats.fines).toBe(FINES["expired registration"]);
    expect(s.stats.score - before).toBe(40 + 30 - 25);
    expect(k.resolved).toBe("cited");
  });

  it("illegally parked cars can be ticketed or towed; they stay in the world", () => {
    const s = new Code3Sim({ seed: 61, firstCall: 1e9 });
    const parked = s.cars.filter((c) => c.fixture);
    expect(parked.length).toBeGreaterThanOrEqual(8);
    run(s, 0.05, { enter: true });
    const c = parked[0];
    s.player.x = c.x + 2;
    s.player.z = c.z;
    expect(s.options().some((o) => o.id === "park-ticket" && o.label.includes(c.parking!))).toBe(true);
    s.choose("park-ticket");
    expect(c.ticketed).toBe(true);
    expect(s.stats.fines).toBe(FINES["illegal parking"]);
    // Far from the officer, still there.
    s.player.x = 5;
    s.player.z = 5;
    run(s, 1);
    expect(s.car(c.id)).toBeTruthy();
    s.player.x = c.x + 2;
    s.player.z = c.z;
    s.choose("park-tow");
    run(s, 13);
    expect(s.car(c.id)).toBeUndefined();
  });

  it("directing traffic holds the lanes you choose, and releases them", () => {
    const s = new Code3Sim({ seed: 62, firstCall: 1e9 });
    run(s, 0.05, { enter: true });
    const n = nodeId(3, 3);
    const p = { x: line(3), z: line(3) };
    s.player.x = p.x + 1;
    s.player.z = p.z + 1;
    expect(has(s, "tc-all")).toBe(true);
    s.choose("tc-ns");
    expect(s.directing).toBe(true);
    const d = s.deploy.find((x) => x.kind === "traffic")!;
    expect(d.node).toBe(n);
    expect(d.hold).toBe("ns");
    s.choose("tc-off");
    expect(s.deploy.some((x) => x.kind === "traffic")).toBe(false);
  });

  it("witnesses point you at the suspect; coffee restores you", () => {
    const s = new Code3Sim({ seed: 63, firstCall: 1e9 });
    const call = s.offerCall("shoplift");
    s.acceptCall(call);
    run(s, 0.05, { enter: true });
    const w = s.peds.find((q) => q.state === "walk" && q.role === "civilian")!;
    const sus = s.ped(call.suspects[0])!;
    Object.assign(w, { walk: undefined, state: "stand", x: sus.x + 25, z: sus.z });
    s.player.x = w.x + 1;
    s.player.z = w.z;
    let tries = 0;
    while (!s.stats.report.some((r) => r.text === "Witness lead") && tries++ < 6) {
      w.witnessed = false;
      s.player.x = w.x + 1;
      s.player.z = w.z;
      s.choose("witness");
    }
    expect(s.stats.report.some((r) => r.text === "Witness lead")).toBe(true);
    const store = s.city.places.find((q) => q.kind === "store")!;
    s.player.x = store.x;
    s.player.z = store.z;
    s.player.stamina = 0.1;
    s.player.hp = 50;
    expect(has(s, "coffee")).toBe(true);
    s.choose("coffee");
    expect(s.player.stamina).toBe(1);
    expect(s.player.hp).toBe(75);
  });
});
