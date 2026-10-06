import { describe, expect, it } from "vitest";
import { en } from "./i18n/en";
import { formatClock, formatPlaytime, isRtl, LANGS, translate } from "./i18n";
import { applyPreset, changeSetting, defaultSettings, matchingPreset, normaliseSettings, PRESETS } from "./settings";
import { BASE_MAPS, MAPS, gatewayPath, generateTerrain } from "./world/maps";
import { City } from "./world/city";
import { halfWidth } from "./world/roads";
import { sampleAt } from "./core/geom";
import { tierCap, buildingSpec } from "./world/buildingSpec";
import { buildingParts } from "./render/buildingKit";

describe("i18n", () => {
  it("every language has every string, in its own script", () => {
    const keys = Object.keys(en);
    for (const l of LANGS) {
      for (const k of keys) expect(l.table[k as keyof typeof en], `${l.id}:${k}`).toBeTruthy();
      // Placeholders survive translation.
      for (const k of keys) {
        const want = (en[k as keyof typeof en].match(/\{\w+\}/g) ?? []).sort().join();
        const got = (l.table[k as keyof typeof en].match(/\{\w+\}/g) ?? []).sort().join();
        expect(got, `${l.id}:${k}`).toBe(want);
      }
    }
    expect(LANGS.map((l) => l.table.langName)).toEqual(["English", "中文", "हिन्दी", "Español", "Français", "العربية", "বাংলা", "Deutsch"]);
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
  });

  it("formats the clock, play time and placeholders", () => {
    expect(formatClock("en", 9 * 60 + 2)).toBe("9:02 AM");
    expect(formatClock("en", 21 * 60 + 30)).toBe("9:30 PM");
    expect(formatClock("de", 21 * 60 + 30)).toBe("21:30");
    expect(formatPlaytime("en", 8 * 3600 + 11 * 60)).toBe("8h 11m");
    expect(translate("en", "peopleLine", { pop: "4,427", time: "8h 11m", ago: "just now" })).toBe("4,427 people · 8h 11m played · just now");
  });
});

describe("settings", () => {
  it("presets set concrete values; touching one control switches to CUSTOM; matching values switch back", () => {
    const s = defaultSettings(false);
    expect(s.preset).toBe("high");
    expect(defaultSettings(true).preset).toBe("low");
    const low = applyPreset(s, "low");
    expect(low.shadows).toBe("off");
    expect(low.renderScale).toBe(PRESETS.low.renderScale);
    const custom = changeSetting(low, "bloom", true);
    expect(custom.preset).toBe("custom");
    expect(matchingPreset(changeSetting(custom, "bloom", false))).toBe("low");
    // Non-graphics settings don't touch the preset.
    expect(changeSetting(low, "language", "fr").preset).toBe("low");
    expect(normaliseSettings({ renderScale: 60, nonsense: 1 } as never, false, "en").renderScale).toBe(60);
  });
});

describe("maps", () => {
  it("ten base maps and three Riviera maps, each the same every time, with the highway coming in to dry land", () => {
    expect(MAPS).toHaveLength(13);
    expect(BASE_MAPS).toHaveLength(10);
    expect(MAPS.filter((m) => m.dlc).map((m) => m.look)).toEqual(["riviera", "riviera", "riviera"]);
    expect(MAPS[0].id).toBe("broad-plains");
    for (const m of MAPS) {
      const a = generateTerrain(m);
      const b = generateTerrain(m);
      expect(a.h[12345]).toBe(b.h[12345]);
      const g = gatewayPath(m, a);
      expect(a.isWater(g.b.x, g.b.z), m.id).toBe(false);
    }
  });

  it("water shares match the terrain tags", () => {
    const water = (id: string) => {
      const t = generateTerrain(MAPS.find((m) => m.id === id)!);
      let n = 0;
      for (const h of t.h) if (h < 0) n++;
      return n / t.h.length;
    };
    expect(water("broad-plains")).toBeLessThan(0.02);
    expect(water("crossriver")).toBeGreaterThan(0.04);
    expect(water("crescent-isle")).toBeGreaterThan(0.4);
    expect(water("stepping-stones")).toBeGreaterThan(0.5);
  });

  it("Crossriver and Stepping Stones: roads over water become bridges (raised decks)", () => {
    for (const id of ["crossriver", "stepping-stones"]) {
      const c = new City(id, "Bridge test");
      // Find a straight line from dry land, over water, to dry land.
      let found: number[] | null = null;
      for (let z = 100; z < 1950 && !found; z += 40)
        for (let x = 100; x < 1900 && !found; x += 40) {
          const pts = id === "crossriver" ? [x, z, x, z + 360] : [x, z, x + 360, z];
          const [ax, az, bx, bz] = pts;
          if (c.terrain.isWater(ax, az) || c.terrain.isWater(bx, bz)) continue;
          let wet = 0;
          for (let k = 1; k < 18; k++) if (c.terrain.isWater(ax + ((bx - ax) * k) / 18, az + ((bz - az) * k) / 18)) wet++;
          if (wet >= 3) found = pts;
        }
      expect(found, id).toBeTruthy();
      const r = c.addRoad(found!, "street");
      expect(r.created.length).toBeGreaterThan(0);
      const e = r.created[0];
      const ys = c.profiles.get(e.id)!;
      expect(Math.max(...ys), id).toBeGreaterThan(3.5);
      // The deck stays above the water all the way.
      for (const y of ys) expect(y).toBeGreaterThan(0.4);
    }
  });
});

describe("zoning and lots", () => {
  function street() {
    const c = new City("broad-plains", "Lots");
    const end = [...c.roads.edges.values()][0];
    const x = end.pts[end.pts.length - 2];
    const z = end.pts[end.pts.length - 1];
    const [e] = c.addRoad([x, z, x + 200, z], "street").created;
    return { c, e: c.roads.edges.get(e.id)!, x, z };
  }

  it("LINE cuts lots from the frontage by the steppers; MIRROR does both sides; ERASE clears them", () => {
    const { c, e } = street();
    const r = c.paint(e.id, 1, 0, 1e6, { zone: "R", width: 2, depth: 3, mixed: false }, true);
    const lots = [...c.lots.lots.values()];
    expect(r.created.length).toBeGreaterThan(14);
    expect(new Set(lots.map((l) => l.side))).toEqual(new Set([1, -1]));
    for (const l of lots) {
      expect(l.w).toBeCloseTo(16 - 0.6, 1);
      expect(l.d).toBeLessThanOrEqual(24);
    }
    // Rezone one side.
    const rz = c.paint(e.id, 1, 0, 1e6, { zone: "C", width: 2, depth: 3, mixed: false }, false);
    expect(rz.rezoned.length).toBeGreaterThan(5);
    expect(c.erase(e.id, -1, 0, 1e6, false).length).toBeGreaterThan(5);
    expect([...c.lots.lots.values()].every((l) => l.side === 1 && l.zone === "C")).toBe(true);
  });

  it("AREA zones the frontages inside a rectangle; lots never sit on a road", () => {
    const { c, x, z } = street();
    c.addRoad([x + 100, z - 120, x + 100, z + 120], "avenue");
    for (const r of c.lots.rangesInRect({ x: x - 10, z: z - 140 }, { x: x + 210, z: z + 140 }, 24)) c.paint(r.edge, r.side, r.s0, r.s1, { zone: "M", width: 2, depth: 3, mixed: true }, false);
    expect(c.lots.lots.size).toBeGreaterThan(20);
    expect(c.lots.clashing()).toEqual([]);
  });

  it("undo and redo step through road and zone actions", () => {
    const { c, e } = street();
    const edges = c.roads.edges.size;
    c.record();
    c.paint(e.id, 1, 0, 1e6, { zone: "R", width: 2, depth: 3, mixed: false }, false);
    const lots = c.lots.lots.size;
    expect(c.undo()).toBe(true);
    expect(c.lots.lots.size).toBe(0);
    expect(c.redo()).toBe(true);
    expect(c.lots.lots.size).toBe(lots);
    expect(c.undo()).toBe(true);
    expect(c.undo()).toBe(true);
    expect(c.roads.edges.size).toBeLessThan(edges);
  });

  it("money spent building is part of each undo step (Mayor mode refunds on undo)", () => {
    const { c, x, z } = street();
    const before = c.spent;
    c.record();
    c.addRoad([x + 50, z - 80, x + 50, z + 80], "avenue", { record: false });
    c.spent += 3_520;
    expect(c.undo()).toBe(true);
    expect(c.spent).toBe(before);
    expect(c.redo()).toBe(true);
    expect(c.spent).toBe(before + 3_520);
    const d = new City(c.map.id, c.name, JSON.parse(JSON.stringify(c.toJSON(null))));
    expect(d.spent).toBe(before + 3_520);
  });

  it("loading an older save folds junctions crammed together into one, keeping the city whole", () => {
    const { c, e, x, z } = street();
    c.paint(e.id, 1, 0, 1e6, { zone: "R", width: 2, depth: 3, mixed: true }, false);
    c.addRoad([x + 60, z - 60, x + 60, z + 60], "street");
    // A second crossing 9 m along, laid the old way.
    const near = c.roads.nearestEdge({ x: x + 69, z }, 2)!;
    const { node, parts } = c.roads.splitEdge(near.edge.id, near.s);
    c.lots.reattach(near.edge.id, parts.map((p) => p.id));
    const top = c.roads.addNode(node.x, node.z - 60);
    c.roads.addEdge(top.id, node.id, [top.x, top.z, node.x, node.z], "street", "Old Street");
    const json = JSON.parse(JSON.stringify(c.toJSON(null)));
    const d = new City(json.mapId, json.name, json);
    expect(d.roads.edges.size).toBe(c.roads.edges.size - 1);
    for (const ed of d.roads.edges.values()) {
      expect(d.roads.nodes.has(ed.a) && d.roads.nodes.has(ed.b)).toBe(true);
      expect(d.profiles.get(ed.id)?.length).toBe(ed.pts.length / 2);
    }
    for (const l of d.lots.lots.values()) expect(d.roads.edges.has(l.edge)).toBe(true);
    expect(d.lots.lots.size).toBeGreaterThan(0);
  });

  it("a city survives a save round trip", () => {
    const { c, e } = street();
    c.paint(e.id, 1, 0, 1e6, { zone: "I", width: 2, depth: 3, mixed: true }, true);
    c.addStop(e.id, 50, 1);
    const json = JSON.parse(JSON.stringify(c.toJSON(null)));
    const d = new City(json.mapId, json.name, json);
    expect(d.roads.edges.size).toBe(c.roads.edges.size);
    expect(d.lots.lots.size).toBe(c.lots.lots.size);
    expect(d.stops).toHaveLength(1);
    expect(d.terrain.h[5000]).toBeCloseTo(c.terrain.h[5000], 1);
  });
});

describe("buildings", () => {
  it("tiers climb from houses to towers, and the kit varies by seed", () => {
    expect(buildingSpec("R", 1, 15, 23, 1).style).toBe("house");
    expect(buildingSpec("R", 2, 15, 23, 1).style).toBe("walkup");
    expect(buildingSpec("R", 4, 15, 23, 1).floors).toBeGreaterThanOrEqual(12);
    expect(tierCap("R", 7, 7)).toBe(2);
    expect(tierCap("I", 31, 39)).toBe(3);
    const a = buildingParts("R", 4, 15.4, 23.4, 11, 1, [0, 0, 0, 0]).parts;
    const b = buildingParts("R", 4, 15.4, 23.4, 12, 1, [0, 0, 0, 0]).parts;
    expect(a.length).toBeGreaterThan(8);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    // Industry in oil country gets tanks.
    const oil = buildingParts("I", 3, 23.4, 31.4, 5, 1, [0, 0, 0, 2]).parts;
    expect(oil.some((p) => p.k === "cyl")).toBe(true);
  });
});

describe("liquid glass", () => {
  it("the lens map is flat in the middle and bends inward at the rim", async () => {
    const { displacementMap } = await import("./ui/glass");
    const w = 100, h = 60;
    const m = displacementMap(w, h, 12, 16);
    const px = (x: number, y: number) => [m[(y * w + x) * 4], m[(y * w + x) * 4 + 1]];
    expect(px(50, 30)).toEqual([128, 128]);
    // Right rim: red below 128 (sample from further left, i.e. inside); left rim the opposite.
    expect(px(99, 30)[0]).toBeLessThan(40);
    expect(px(0, 30)[0]).toBeGreaterThan(216);
    // Bottom rim moves green the same way.
    expect(px(50, 59)[1]).toBeLessThan(40);
  });

  it("stored settings keep a valid glass mode", () => {
    expect(normaliseSettings({ glass: "neon" } as never, false, "en").glass).toBe("liquid");
    expect(normaliseSettings({ glass: "solid" }, false, "en").glass).toBe("solid");
    expect(defaultSettings(true).glass).toBe("frosted");
  });
});

describe("terrain under roads", () => {
  it("on a steep hillside no ground pokes up through a new road, and the cutting is marked as verge", () => {
    const c = new City("stonecrest", "Hills");
    // The steepest dry 240 m line on the map.
    let best: number[] | null = null;
    let range = 0;
    for (let z = 200; z < 1850; z += 60)
      for (let x = 200; x < 1700; x += 60) {
        const ys = [0, 1, 2, 3, 4].map((k) => c.terrain.heightAt(x + k * 60, z));
        if (ys.some((y) => y < 2)) continue;
        const r = Math.max(...ys) - Math.min(...ys);
        if (r > range) {
          range = r;
          best = [x, z, x + 240, z];
        }
      }
    expect(range).toBeGreaterThan(10);
    const e = c.addRoad(best!, "avenue").created[0];
    const edge = c.roads.edges.get(e.id)!;
    let worst = -Infinity;
    for (let s = 6; s < 234; s += 2) {
      const x = best![0] + s;
      const z = best![1];
      const road = c.roadY(edge.id, s);
      // Every terrain vertex of the cells under the road (either triangle split) stays below it.
      for (const dz of [-6, -3, 0, 3, 6]) {
        const i = Math.floor(x / 8);
        const j = Math.floor((z + dz) / 8);
        for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) worst = Math.max(worst, c.terrain.at(i + a, j + b) - road);
      }
    }
    // A vertex up to one 8 m cell ahead sits on the road's own grade: allow for that.
    let grade = 0;
    for (let s = 6; s < 232; s += 2) grade = Math.max(grade, Math.abs(c.roadY(edge.id, s + 2) - c.roadY(edge.id, s)) / 2);
    expect(worst).toBeLessThan(0.3 + 8 * grade);
    // And the ground itself (between vertices) never rises through the road.
    expect(worstPoke(c)).toBeLessThan(0.05);
    const marked = (city: City) => {
      let k = 0;
      for (let i = 0; i < city.terrain.graded.length; i++) k += city.terrain.graded[i];
      return k;
    };
    expect(marked(c)).toBeGreaterThan(40);
    // Marks come back after a save round trip.
    const d = new City("stonecrest", "Hills", JSON.parse(JSON.stringify(c.toJSON(null))));
    expect(Math.abs(marked(d) - marked(c))).toBeLessThanOrEqual(Math.ceil(marked(c) * 0.02));
  });

  /** A steep dry line on Stonecrest (the same search as above). */
  function hillLine(c: City) {
    let best: number[] = [];
    let range = 0;
    for (let z = 200; z < 1850; z += 60)
      for (let x = 200; x < 1700; x += 60) {
        const ys = [0, 1, 2, 3, 4].map((k) => c.terrain.heightAt(x + k * 60, z));
        if (ys.some((y) => y < 2)) continue;
        const r = Math.max(...ys) - Math.min(...ys);
        if (r > range) {
          range = r;
          best = [x, z, x + 240, z];
        }
      }
    return best;
  }

  /** The surface height of whatever road is nearest a point. */
  const surface = (c: City, x: number, z: number) => {
    const near = c.roads.nearestEdge({ x, z, y: 0 } as never, 30)!;
    return c.roadY(near.edge.id, near.s);
  };

  /** The most any ground (bilinear, inside the asphalt) rises above its road surface, over all roads. */
  function worstPoke(c: City) {
    let worst = -Infinity;
    for (const e of c.roads.edges.values()) {
      if (e.type === "highway") continue;
      const cum = c.cumOf(e);
      const L = cum[cum.length - 1];
      const hw = halfWidth(e) * 0.9;
      for (let s = 2; s < L - 2; s += 2) {
        const p = sampleAt(e.pts, cum, s);
        const y = c.roadY(e.id, s);
        for (const o of [-hw, -hw / 2, 0, hw / 2, hw]) worst = Math.max(worst, c.terrain.heightAt(p.x - p.tz * o, p.z + p.tx * o) - y);
      }
    }
    return worst;
  }

  it("crossing and neighbouring roads on a hillside never leave ground poking through any of them", () => {
    const c = new City("stonecrest", "Hills");
    const [x0, z0, x1] = hillLine(c);
    c.addRoad([x0, z0, x1, z0], "avenue");
    // Streets across it, a parallel street close by, and a diagonal through all of them.
    for (const k of [0.3, 0.6]) c.addRoad([x0 + (x1 - x0) * k, z0 - 90, x0 + (x1 - x0) * k, z0 + 90], "street");
    c.addRoad([x0, z0 + 40, x1, z0 + 40], "street");
    c.addRoad([x0 + 20, z0 - 70, x1 - 20, z0 + 70], "street");
    expect(c.roads.edges.size).toBeGreaterThan(10);
    expect(worstPoke(c)).toBeLessThan(0.05);
  });

  it("roads keep their height when split by a crossing and over repeated save round trips", () => {
    const c = new City("stonecrest", "Hills");
    const [x0, z0, x1] = hillLine(c);
    c.addRoad([x0, z0, x1, z0], "avenue");
    // Away from the new junction (which levels the road within a few dozen metres of it).
    const xs = [x0 + 15, x0 + 30, x0 + 200, x0 + 225];
    const before = xs.map((x) => surface(c, x, z0));
    c.addRoad([x0 + 120, z0 - 90, x0 + 120, z0 + 90], "street");
    xs.forEach((x, i) => expect(Math.abs(surface(c, x, z0) - before[i])).toBeLessThan(0.05));
    let d = c;
    for (let k = 0; k < 3; k++) d = new City("stonecrest", "Hills", JSON.parse(JSON.stringify(d.toJSON(null))));
    xs.forEach((x, i) => expect(Math.abs(surface(d, x, z0) - before[i])).toBeLessThan(0.08));
    expect(worstPoke(d)).toBeLessThan(0.05);
  });
});

