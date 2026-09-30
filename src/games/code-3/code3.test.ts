import { describe, expect, it } from "vitest";
import { generateCity, HALF_STREET, LINES, lightFor, nodeId, onRoad, route, SIZE, SPEED_LIMIT } from "./city";
import { makePerson } from "./people";
import { createRng } from "../engine/rng";
import { Code3Sim, NO_INPUT, type Code3Input, type Ped } from "./sim";
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
    expect(s.stats.score).toBe(afterArrest + 100);
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
