import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { realWorld } from "../sovereign/testworld";
import { buildAtlas } from "./atlas";
import { newWorld } from "./setup";
import { Sim } from "./sim";
import { GOODS, SECTORS } from "./data";
import { flowsOf } from "./econ";
test("diag", () => {
  const a = buildAtlas(realWorld());
  const { world, d } = newWorld(a, { iso: "GBR" });
  const sim = new Sim(world, a, d);
  const out: string[] = [];
  const g = world.nations.find((x) => x.iso === "GBR")!;
  const wgdp = () => world.nations.reduce((s, n) => s + (n.alive ? n.gdpReal : 0), 0);
  const w0 = wgdp();
  for (let i = 0; i < 20; i++) {
    const f = flowsOf(g);
    const govT = f.gov.reduce((s, v) => s + v, 0);
    out.push(`day ${world.day} worldReal ${(wgdp() / w0).toFixed(4)} GBR C ${f.consumption.toFixed(0)} inv ${f.invest.toFixed(0)} gov ${govT.toFixed(0)} gdp ${g.gdp.toFixed(0)} un ${(g.unemp*100).toFixed(2)} wage ${g.avgWage.toFixed(0)}`);
    out.push("  orders " + g.sectors.map((s, k) => `${SECTORS[k].id}:${s.orders.toFixed(3)}`).join(" "));
    const fs = [...d.fill].map((v, k) => [v, k] as const).filter(([v]) => v < 0.995).map(([v, k]) => `${GOODS[k].id}:${v.toFixed(3)}`);
    const ss = [...d.sell].map((v, k) => [v, k] as const).filter(([v]) => v < 0.995).map(([v, k]) => `${GOODS[k].id}:${v.toFixed(3)}`);
    out.push("  fill<1 " + fs.join(" "));
    out.push("  sell<1 " + ss.join(" "));
    // local goods balance
    const loc = GOODS.map((gd, k) => [gd, k] as const).filter(([gd]) => ["construction", "retail", "realestate", "power", "services", "tourism", "transport", "telecom", "finance"].includes(gd.sector)).map(([gd, k]) => `${gd.id}:${(d.supply[g.id][k] / Math.max(1e-9, d.demand[g.id][k])).toFixed(3)}`);
    out.push("  P/D " + loc.join(" "));
    sim.step();
  }
  writeFileSync("/tmp/claude-0/-home-user-Zero-X-Gaming/76570e0e-fe89-592b-9c89-54acf6cd0bc4/scratchpad/diag.txt", out.join("\n"));
}, 600000);
