import { WORLD } from "./config";
import { rng } from "./core/rng";
import type { Building } from "./sim/sim";
import { buildingSpec, tierCap } from "./world/buildingSpec";
import { City } from "./world/city";
import type { Zone } from "./world/lots";

/**
 * The main menu's backdrop: a finished little island city on Crescent Isle,
 * built in code (roads on the dry land, zoned, with buildings already up and
 * taller toward the middle).
 */
export function demoCity() {
  const c = new City("crescent-isle", "Demo");
  const t = c.terrain;
  const r = rng(77);
  // Where the island is: centre of the dry land.
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (let z = 0; z < WORLD; z += 32)
    for (let x = 0; x < WORLD; x += 32)
      if (!t.isWater(x, z)) {
        sx += x;
        sz += z;
        n++;
      }
  const cx = sx / Math.max(1, n);
  const cz = sz / Math.max(1, n);
  const step = 88;
  const lines: number[][] = [];
  const runs = (ax: number, az: number, dx: number, dz: number, len: number) => {
    let start = -1;
    for (let s = 0; s <= len; s += 8) {
      const x = ax + dx * s;
      const z = az + dz * s;
      const ok = !t.isWater(x, z) && t.slopeAt(x, z) < 0.25 && !t.isWater(x + dz * 30, z + dx * 30) && !t.isWater(x - dz * 30, z - dx * 30);
      if (ok && start < 0) start = s;
      if ((!ok || s + 8 > len) && start >= 0) {
        const end = ok ? s : s - 8;
        if (end - start > 70) lines.push([ax + dx * start, az + dz * start, ax + dx * end, az + dz * end]);
        start = -1;
      }
    }
  };
  for (let k = -6; k <= 6; k++) {
    runs(cx - 700, cz + k * step, 1, 0, 1400);
    runs(cx + k * step, cz - 700, 0, 1, 1400);
  }
  lines.forEach((l, i) => c.addRoad(l, i % 4 === 0 ? "avenue" : "street", { record: false }));
  const zones: Zone[] = ["R", "R", "C", "M", "R", "C", "I"];
  let k = 0;
  for (const e of [...c.roads.edges.values()]) {
    if (e.type === "highway") continue;
    for (const side of [1, -1]) c.paint(e.id, side, 0, 1e6, { zone: zones[k++ % zones.length], width: 2, depth: 3, mixed: true }, false);
  }
  const buildings: Building[] = [];
  for (const l of c.lots.lots.values()) {
    const d = Math.hypot(l.cx - cx, l.cz - cz);
    const want = d < 160 ? 4 : d < 300 ? 3 : d < 470 ? 2 : 1;
    const tier = Math.min(tierCap(l.zone, l.w, l.d), want + (r.next() < 0.2 ? -1 : 0), l.zone === "I" ? 2 : 4);
    if (r.next() < 0.06) continue;
    const seed = Math.floor(r.next() * 1e9);
    const spec = buildingSpec(l.zone, Math.max(1, tier), l.w, l.d, seed);
    buildings.push({ lot: l.id, zone: l.zone, tier: Math.max(1, tier), seed, progress: 1, residents: spec.residents, capRes: spec.residents, capJobs: spec.jobs, workers: spec.jobs, age: 999, style: spec.style });
  }
  return { city: c, buildings, centre: { x: cx, z: cz } };
}
