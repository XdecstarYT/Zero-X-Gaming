import { describe, expect, it } from "vitest";
import { LEADS, START_MONEY } from "./data";
import { startMission } from "./missions";
import { raise } from "./police";
import * as sim from "./sim";
import { player, playerCar, type State } from "./state";
import { light } from "./traffic";
import { seat } from "./vehicles";
import { loadRealMap } from "./testmap";
import { districtAt, generate, groundY, insideSolid, isWater, nearestRoad, route, solidsNear } from "./world";

loadRealMap();

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
    expect(city.roads.segs.length).toBeGreaterThan(5000);
    expect(city.buildings.length).toBeGreaterThan(10000);
    for (const id of ["safe-nina", "safe-dex", "hospital", "police-hq", "bank", "gun-rich", "clothes-chapel", "respray-port", "store-1", "store-3", "chop", "marina", "mansion"]) {
      const p = city.pois.find((x) => x.id === id);
      expect(p, id).toBeDefined();
      expect(isWater(p!.x, p!.z), id).toBe(false);
      expect(groundY(p!.x, p!.z), id).toBeGreaterThan(-0.2);
    }
  });

  it("keeps buildings off the streets: no road runs through a solid building", () => {
    const bad: string[] = [];
    const near: ReturnType<typeof solidsNear> = [];
    for (const sg of city.roads.segs) {
      if (sg.cls === "lane" || sg.bridge || sg.len < 8) continue;
      const A = city.roads.nodes[sg.a];
      for (const f of [0.35, 0.65]) {
        const x = A.x + sg.dx * sg.len * f;
        const z = A.z + sg.dz * sg.len * f;
        for (const w of solidsNear(city, x, z, 2, near)) if (!w.round && w.h > 3 && insideSolid(w, x, z)) bad.push(`${sg.name || sg.cls} at ${Math.round(x)},${Math.round(z)}`);
      }
    }
    // The real footprints are trimmed back from every carriageway; a few arcades over a road are allowed.
    expect(bad.length).toBeLessThan(city.roads.segs.length * 0.002);
  });

  it("routes by road from Appleton Dock to St Kilda", () => {
    const path = route(city, -3350, -995, 560, 4909);
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
      for (const n of lit.slice(0, 40)) expect(light(s, n, 0) === "green" && light(s, n, 1) === "green").toBe(false);
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
    // Steering right turns right: clockwise on the map (x east, z south), so the heading rises.
    const h0 = c.h;
    for (let i = 0; i < 40; i++) sim.step(s, { ...sim.NO_INPUT, throttle: 0.5, steer: 1 }, 1 / 60);
    expect(c.h).toBeGreaterThan(h0 + 0.1);
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

  it("plays the first story mission through: pick Dex up at Appleton Dock and take him home", { timeout: 120_000 }, () => {
    const s = sim.newGame(7);
    expect(startMission(s, "sunburn")).toBe(true);
    // The call, then the car.
    expect(run(s, 15, () => s.story.run!.text.startsWith("Get in your car"))).toBe(true);
    const car = s.cars.find((x) => x.tag === "ride-nina")!;
    seat(s, player(s), car, 0);
    expect(run(s, 2, () => s.story.run!.text.includes("Appleton Dock gate"))).toBe(true);
    const put = (x: number, z: number) => {
      car.x = x;
      car.z = z;
      car.vx = car.vz = 0;
    };
    put(-3350.5, -995.5);
    // Dex gets in, they talk, then home to Port Melbourne.
    expect(run(s, 20, () => s.story.run!.text.includes("cottage"))).toBe(true);
    expect(car.seats.filter((id) => id >= 0).length).toBe(2);
    const home = s.city.pois.find((x) => x.id === "safe-dex")!;
    put(home.x, home.z);
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
    // Trams keep to the left of the road's centre line.
    let left = 0;
    let along = 0;
    for (const c of trams) {
      const r = nearestRoad(s.city, c.x, c.z);
      if (!r || r.d > 6 || r.d < 0.5) continue;
      const cos = Math.cos(c.h) * r.seg.dx + Math.sin(c.h) * r.seg.dz;
      if (Math.abs(cos) < 0.95) continue;
      along++;
      const fx = Math.sign(cos) * r.seg.dx;
      const fz = Math.sign(cos) * r.seg.dz;
      if ((c.x - r.x) * fz - (c.z - r.z) * fx > 0) left++;
    }
    expect(along).toBeGreaterThan(5);
    expect(left / along).toBeGreaterThan(0.8);
  });

  it("lets you ride a tram as a passenger, or take the cab and drive it", { timeout: 60_000 }, () => {
    const s = sim.newGame(7);
    const tram = s.cars.find((c) => c.tram && c.kind === "tram")!;
    const p = player(s);
    const board = (along: number) => {
      tram.tram!.v = 0;
      tram.tram!.dwell = 5;
      const fx = Math.cos(tram.h);
      const fz = Math.sin(tram.h);
      // Stand beside it on the kerb side.
      p.x = tram.x + fx * along + fz * 2.4;
      p.z = tram.z + fz * along - fx * 2.4;
      sim.step(s, { ...sim.NO_INPUT, enter: true }, 1 / 60);
    };
    board(0);
    expect(playerCar(s)).toBe(tram);
    expect(tram.seats[0]).not.toBe(s.player);
    const s0 = tram.tram!.s;
    run(s, 20);
    expect(playerCar(s)).toBe(tram);
    expect(Math.abs(tram.tram!.s - s0)).toBeGreaterThan(5);
    // Off, then on at the front: the cab.
    sim.step(s, { ...sim.NO_INPUT, enter: true }, 1 / 60);
    expect(playerCar(s)).toBeFalsy();
    board(14);
    expect(tram.seats[0]).toBe(s.player);
    const s1 = tram.tram!.s;
    for (let i = 0; i < 240; i++) sim.step(s, { ...sim.NO_INPUT, throttle: 1 }, 1 / 60);
    expect(tram.tram!.v).toBeGreaterThan(3);
    expect(tram.tram!.s).not.toBe(s1);
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
