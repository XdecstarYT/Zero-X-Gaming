import { describe, expect, it } from "vitest";
import { LEADS, START_MONEY } from "./data";
import { startMission } from "./missions";
import { raise } from "./police";
import * as sim from "./sim";
import { player, playerCar, type State } from "./state";
import { light } from "./traffic";
import { seat } from "./vehicles";
import { districtAt, generate, groundY, isWater, route, streetHalf } from "./world";

/** Step the simulation (no input) for up to `secs`, stopping early when `until` holds. */
function run(s: State, secs: number, until?: () => boolean) {
  for (let i = 0; i < secs * 60; i++) {
    sim.step(s, sim.NO_INPUT, 1 / 60);
    if (until?.()) return true;
  }
  return false;
}

describe("Heatwave: Melbourne", () => {
  const city = generate(7);

  it("is the same city every time from the same seed", () => {
    const again = generate(7);
    expect(again.buildings.length).toBe(city.buildings.length);
    expect(again.buildings.slice(0, 50).map((b) => [b.x, b.z, b.h])).toEqual(city.buildings.slice(0, 50).map((b) => [b.x, b.z, b.h]));
  });

  it("has every district, a road network, and the places a story needs, all on dry land", () => {
    const seen = new Set(city.buildings.map((b) => districtAt(b.x, b.z)));
    for (const d of ["cbd", "southbank", "docklands", "docks", "carlton", "fitzroy", "richmond", "southmelb", "port", "southyarra", "toorak", "stkilda"]) expect(seen).toContain(d);
    expect(city.roads.segs.length).toBeGreaterThan(100);
    for (const id of ["safe-nina", "safe-dex", "hospital", "police-hq", "gun-rich", "clothes-chapel", "respray-port", "store-1", "chop", "mansion"]) {
      const p = city.pois.find((x) => x.id === id);
      expect(p, id).toBeDefined();
      expect(isWater(p!.x, p!.z), id).toBe(false);
      expect(groundY(p!.x, p!.z), id).toBeGreaterThan(-0.2);
    }
  });

  it("keeps buildings off the streets", () => {
    const bad: string[] = [];
    for (const b of city.buildings)
      for (const s of city.roads.segs) {
        const A = city.roads.nodes[s.a];
        const B = city.roads.nodes[s.b];
        const h = streetHalf(s) - 0.5;
        const x0 = Math.min(A.x, B.x) - (s.axis === "ns" ? h : 0);
        const x1 = Math.max(A.x, B.x) + (s.axis === "ns" ? h : 0);
        const z0 = Math.min(A.z, B.z) - (s.axis === "ew" ? h : 0);
        const z1 = Math.max(A.z, B.z) + (s.axis === "ew" ? h : 0);
        if (b.x + b.hw > x0 && b.x - b.hw < x1 && b.z + b.hd > z0 && b.z - b.hd < z1) bad.push(`${b.kind} ${Math.round(b.x)},${Math.round(b.z)} on ${s.name}`);
      }
    expect(bad).toEqual([]);
  });

  it("routes by road from Swanson Dock to St Kilda", () => {
    const path = route(city, -1380, -200, -110, 1300);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(3);
  });
});

describe("Heatwave: the simulation", () => {
  it("never shows green both ways at a lit junction", { timeout: 60_000 }, () => {
    const s = sim.newGame(7);
    const lit = s.city.roads.nodes.filter((n) => n.light);
    expect(lit.length).toBeGreaterThan(10);
    for (let t = 0; t < 30; t += 0.5) {
      s.t = t;
      for (const n of lit.slice(0, 20)) expect(light(s, n, "ns") === "green" && light(s, n, "ew") === "green").toBe(false);
    }
  });

  it("fills the streets with traffic and people, and a minute of it stays sane", { timeout: 120_000 }, () => {
    const s = sim.newGame(7);
    expect(s.money).toBe(START_MONEY);
    expect(s.chars[s.active].id).toBe("nina");
    run(s, 60);
    expect(s.cars.filter((c) => c.ai.mode === "traffic").length).toBeGreaterThan(5);
    expect(s.peds.length).toBeGreaterThan(20);
    for (const c of s.cars) expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.h)).toBe(true);
    for (const p of s.peds) expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(s.clock).toBeGreaterThan(9 * 60);
  });

  it("drives: the lead's own car pulls away under throttle", { timeout: 60_000 }, () => {
    const s = sim.newGame(7);
    const c = s.cars.find((x) => x.tag === "ride-nina")!;
    seat(s, player(s), c, 0);
    for (let i = 0; i < 180; i++) sim.step(s, { ...sim.NO_INPUT, throttle: 1 }, 1 / 60);
    expect(sim.speedOf(c)).toBeGreaterThan(15);
  });

  it("sends the police for a wanted lead, and a hospital stay costs the bill and the stars", { timeout: 120_000 }, () => {
    const s = sim.newGame(7);
    const p = player(s);
    raise(s, 2, p.x, p.z);
    expect(s.wanted.level).toBe(2);
    expect(run(s, 40, () => s.cars.some((c) => c.ai.mode === "police"))).toBe(true);
    s.down = { kind: "hospitalised", t: 0.05 };
    run(s, 0.5);
    const hosp = s.city.pois.find((x) => x.kind === "hospital")!;
    expect(Math.hypot(player(s).x - hosp.x, player(s).z - hosp.z)).toBeLessThan(3);
    expect(s.money).toBe(START_MONEY - 300);
    expect(s.wanted.level).toBe(0);
  });

  it("an arrest costs the fee and the guns", { timeout: 60_000 }, () => {
    const s = sim.newGame(7);
    sim.giveWeapon(s, "pistol", 48);
    expect(player(s).weapon).toBe("pistol");
    s.down = { kind: "arrested", t: 0.05 };
    run(s, 0.5);
    expect(s.money).toBe(0);
    expect(player(s).weapon).toBe("fists");
    expect(player(s).ammo.pistol).toBeUndefined();
  });

  it("plays the first story mission through: pick Dex up at Swanson Dock and take him home", { timeout: 120_000 }, () => {
    const s = sim.newGame(7);
    expect(startMission(s, "sunburn")).toBe(true);
    // The call, then the car.
    expect(run(s, 15, () => s.story.run!.text.startsWith("Get in your car"))).toBe(true);
    const car = s.cars.find((x) => x.tag === "ride-nina")!;
    seat(s, player(s), car, 0);
    expect(run(s, 2, () => s.story.run!.text.includes("Swanson Dock gate"))).toBe(true);
    const put = (x: number, z: number) => {
      car.x = x;
      car.z = z;
      car.vx = car.vz = 0;
    };
    put(-1290, -440);
    // Dex gets in, they talk, then home to Port Melbourne.
    expect(run(s, 20, () => s.story.run!.text.includes("cottage"))).toBe(true);
    expect(car.seats.filter((id) => id >= 0).length).toBe(2);
    put(-889, 652);
    expect(run(s, 15, () => !s.story.run)).toBe(true);
    expect(s.story.done).toContain("sunburn");
    expect(s.money).toBe(START_MONEY + 500);
    expect(sim.score(s)).toBeGreaterThanOrEqual(5000);
    expect(playerCar(s)).toBe(car);
  });

  it("saves and loads: money, the story, the clock and where you were", { timeout: 60_000 }, () => {
    const s = sim.newGame(7);
    s.money = 12_345;
    s.story.done.push("sunburn");
    s.clock = 17 * 60 + 30;
    s.day = 3;
    sim.giveWeapon(s, "smg", 90);
    const p = player(s);
    p.x += 6;
    const json = sim.save(s);
    const t = sim.load(json)!;
    expect(t).not.toBeNull();
    expect(t.money).toBe(12_345);
    expect(t.story.done).toEqual(["sunburn"]);
    expect(t.clock).toBe(17 * 60 + 30);
    expect(t.day).toBe(3);
    expect(player(t).ammo.smg).toBeGreaterThan(0);
    expect(Math.hypot(player(t).x - p.x, player(t).z - p.z)).toBeLessThan(1);
    expect(sim.load("not json")).toBeNull();
  });

  it("runs the trams: they move along their lines, stop at stops and keep to the left", { timeout: 120_000 }, () => {
    const s = sim.newGame(7);
    const trams = s.cars.filter((c) => c.tram);
    expect(trams.length).toBeGreaterThan(20);
    const start = trams.map((c) => c.tram!.s + c.tram!.dir * 1e5);
    let stopped = 0;
    for (let i = 0; i < 60 * 40; i++) {
      sim.step(s, sim.NO_INPUT, 1 / 60);
      if (i % 60 === 0) stopped += trams.filter((c) => c.tram!.dwell > 0).length;
    }
    expect(trams.filter((c, i) => c.tram!.s + c.tram!.dir * 1e5 !== start[i]).length).toBeGreaterThan(trams.length * 0.8);
    expect(stopped).toBeGreaterThan(0);
    // A tram heading north up Swanston St runs on the west side of the road (keep left).
    const t = trams.find((c) => Math.abs(c.x - 110) < 6 && Math.abs(Math.sin(c.h) + 1) < 0.05);
    if (t) expect(t.x).toBeLessThan(110);
  });

  it("switches leads, each with their own home and ride", { timeout: 60_000 }, () => {
    const s = sim.newGame(7);
    expect(sim.canSwitch(s)).toBeNull();
    sim.switchLead(s);
    expect(s.chars[s.active].id).toBe("dex");
    const home = s.city.pois.find((x) => x.id === LEADS.dex.home)!;
    expect(Math.hypot(player(s).x - home.x, player(s).z - home.z)).toBeLessThan(40);
  });
});
