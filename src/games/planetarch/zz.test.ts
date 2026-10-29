import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { realWorld } from "../sovereign/testworld";
import { buildAtlas } from "./atlas";
import { newWorld } from "./setup";
import { PROF, Sim, saveWorld } from "./sim";
import { GOODS, SECTORS } from "./data";
test("run", () => {
  const a = buildAtlas(realWorld());
  const { world, d } = newWorld(a, { iso: "GBR" });
  const sim = new Sim(world, a, d);
  const out: string[] = [];
  const show = (tag: string) => {
    out.push(`--- ${tag} day ${world.day}`);
    for (const iso of ["USA", "GBR", "CHN", "SAU", "UKR", "RUS", "IND", "NGA", "DEU", "JPN", "BRA"]) {
      const n = world.nations.find((x) => x.iso === iso)!;
      const b = sim.d.budget[n.id];
      out.push(`${iso} gdp ${n.gdp.toFixed(0)} g ${(n.growth * 100).toFixed(1)} un ${(n.unemp * 100).toFixed(1)} inf ${(n.inflation * 100).toFixed(1)} pr ${n.price.toFixed(3)} bal ${(b.balance / n.gdp * 100).toFixed(1)} debt ${(n.debt / n.gdp * 100).toFixed(0)} rate ${(n.policyRate*100).toFixed(1)} rat ${n.rating} appr ${n.approval.toFixed(0)} stab ${n.stability.toFixed(0)} elec ${sim.d.elec[n.id].served.toFixed(2)} pop ${(n.pop/1e6).toFixed(1)} fx ${n.fx.toFixed(2)}`);
    }
    const g = world.nations.find((x) => x.iso === "GBR")!;
    out.push("GBR appr parts " + g.approvalParts.slice(0, 8).map((p) => `${p.label}:${p.v.toFixed(1)}`).join(" "));
    out.push("GBR sectors " + g.sectors.map((s, i) => `${SECTORS[i].id}:${s.orders.toFixed(2)}/${(s.out/s.cap).toFixed(2)}${s.limit ? "(" + s.limit + ")" : ""}`).join(" "));
    out.push("prices " + world.prices.map((p, i) => [p, i] as const).filter(([p]) => p > 1.5 || p < 0.6).map(([p, i]) => `${GOODS[i].id}:${p.toFixed(2)}`).join(" "));
    out.push("GBR groups " + g.groups.map((x) => x.sat.toFixed(0)).join(" "));
    const war = world.wars[0];
    out.push(world.wars.filter((x) => !x.over).map((x) => `WAR ${x.name} cf ${x.ceasefire} sc ${x.score.toFixed(1)}`).join(" | "));
    out.push(`war ${war.name} over ${war.over} score ${war.score.toFixed(1)} dead ${JSON.stringify(war.dead)} front ${Object.keys(world.front).length} theatres ${war.theatres.map((t) => t.name + ":" + t.len + ":" + t.dir.join("/")).join(", ")}`);
  };
  show("start");
  const t0 = Date.now();
  const F = "/tmp/claude-0/-home-user-Zero-X-Gaming/76570e0e-fe89-592b-9c89-54acf6cd0bc4/scratchpad/run.txt";
  try {
    for (let i = 0; i < 365 * 2; i++) {
      sim.step();
      const bad = world.nations.find((n) => !isFinite(n.gdp) || !isFinite(n.price));
      if (bad) {
        out.push(`NaN at day ${world.day} in ${bad.iso}: gdp ${bad.gdp} price ${bad.price} fx ${bad.fx} sectors ${bad.sectors.map((x) => [x.out, x.price, x.cap].join("/")).slice(0, 5).join(" ")}`);
        break;
      }
      if (i === 1 || i === 10 || i === 30 || i === 60 || i === 120 || i === 180 || i === 364) show(`d${i}`);
    }
  } finally {
    writeFileSync(F, out.join("\n"));
  }
  const ms = (Date.now() - t0) / 730;
  show("end");
  out.push(JSON.stringify(Object.fromEntries(Object.entries(PROF).map(([k, v]) => [k, +(v / 730).toFixed(2)]))));
  out.push(`ms/day ${ms.toFixed(1)} save ${(saveWorld(world).length / 1e6).toFixed(2)}MB news ${world.news.length}`);
  out.push(world.news.slice(-40).map((x) => `${x.day}: ${x.text}`).join("\n"));
  writeFileSync("/tmp/claude-0/-home-user-Zero-X-Gaming/76570e0e-fe89-592b-9c89-54acf6cd0bc4/scratchpad/run.txt", out.join("\n"));
}, 600000);
