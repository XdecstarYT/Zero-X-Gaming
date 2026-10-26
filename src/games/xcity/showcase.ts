import * as act from "./actions";
import { advance, prepare } from "./sim";
import type { State } from "./state";
import { districtRect, newCity } from "./world";

/**
 * A city some years on, for the NextX app's backdrop: suburbs in each street pattern, a main
 * street upzoned, an office quarter and a tram down the avenue. Built a year at a time so the
 * page stays responsive (`tick` is awaited between years).
 */
export async function showcaseCity(tick: () => Promise<void> = async () => {}, years = 9): Promise<State> {
  const s = prepare(newCity(11));
  s.money = 400_000_000;
  const zone = (x0: number, z0: number, x1: number, z1: number, p: "grid" | "curvy" | "culdesac" | "superblock", use: "homes" | "jobs" | "mixed", band: number) => {
    const r = districtRect(x0, z0, x1, z1);
    act.layOut(s, r.obb, r.poly, p, use, band);
  };
  zone(380, 260, 1100, 900, "grid", "homes", 2);
  zone(-1100, 260, -380, 900, "curvy", "homes", 1);
  zone(-700, 1050, 0, 1500, "culdesac", "homes", 1);
  zone(1150, -400, 1550, 180, "grid", "jobs", 2);
  zone(-360, -380, 360, -10, "grid", "mixed", 2);
  for (let y = 0; y < years; y++) {
    advance(s, 12);
    s.money = Math.max(s.money, 100_000_000);
    if (y === 2) {
      const valley = s.edges.find((e) => e?.name === "Valley Road" && Math.abs(e.pts[0]) < 400);
      if (valley) act.upgradeRoad(s, valley.id, { kind: "avenue", tram: true, bike: true });
      act.upzone(s, districtRect(-340, 20, 340, 380).poly);
    }
    if (y === 4) act.upzone(s, districtRect(-360, -380, 360, -10).poly);
    if (y === 5) act.upzone(s, districtRect(1150, -400, 1550, 180).poly);
    // Say yes to what the developers pitch.
    for (const a of [...s.apps]) act.decide(s, a.id, true);
    await tick();
  }
  return s;
}

/** A new world from its settings: a village, or a small town a couple of years on. */
export function newWorld(ws: import("./poltypes").WorldSettings): State {
  const s = prepare(newCity(ws.seed));
  s.name = ws.name.trim().slice(0, 24) || "XCity";
  s.pace = ws.pace === "relaxed" ? 0.7 : ws.pace === "booming" ? 1.45 : 1;
  if (ws.start === "town") {
    s.money = 400_000_000;
    const zone = (x0: number, z0: number, x1: number, z1: number, p: "grid" | "curvy", use: "homes" | "jobs", band: number) => {
      const r = districtRect(x0, z0, x1, z1);
      act.layOut(s, r.obb, r.poly, p, use, band);
    };
    zone(380, 260, 900, 760, "grid", "homes", 2);
    zone(-900, 260, -380, 760, "curvy", "homes", 1);
    zone(1150, -300, 1500, 150, "grid", "jobs", 2);
    advance(s, 24);
    for (const a of [...s.apps]) act.decide(s, a.id, false);
    s.month = 0;
    s.t = 0;
    s.history = [];
    s.news = [];
    s.budget = { ...s.budget, builds: 0 };
  }
  s.money = ws.money === "tight" ? 12_000_000 : ws.money === "rich" ? 80_000_000 : 30_000_000;
  return s;
}
