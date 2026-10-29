import { describe, expect, it } from "vitest";
import * as co from "./company";
import { JOBS } from "./data";
import { inspect } from "./jobs";
import * as m from "./model";
import { PLANS, planForBrief, placeNew, siteCheck, stages, estimate, type Placed } from "./plans";

const buildAll = (p: Placed) => {
  const s = m.newSite("free");
  let skipped = 0;
  const why: string[] = [];
  for (const st of stages(p)) {
    const r = m.commit(s, st.make(s), true);
    skipped += r.skipped;
    if (r.skipped) why.push(`${st.name}: ${r.skipped} (${r.why})`);
  }
  return { s, skipped, why };
};

describe("plans", () => {
  it("every plan goes up in full, facing any way, with nothing refused", { timeout: 120_000 }, () => {
    for (const info of PLANS)
      for (const front of [0, 1, 2, 3]) {
        const p = { ...placeNew(info.id, 0, 0), front };
        const { s, why } = buildAll(p);
        expect(why, `${info.id} facing ${front}`).toEqual([]);
        expect(s.pieces.length).toBeGreaterThan(10);
      }
  });

  it("the biggest and smallest of each size go up too", { timeout: 120_000 }, () => {
    for (const info of PLANS)
      for (const k of [0, 1]) {
        const p = { ...placeNew(info.id, 0, 0), w: info.w[k], d: info.d[k] };
        expect(buildAll(p).why, `${info.id} ${k ? "max" : "min"}`).toEqual([]);
      }
  });

  it("won't go over something already built, or off the site", () => {
    const s = m.newSite("free");
    const p = placeNew("garage", 0, 0);
    expect(siteCheck(s, p)).toBeNull();
    m.commit(s, stages(p)[0].make(s));
    m.commit(s, stages(p)[1].make(s));
    expect(siteCheck(s, p)).not.toBeNull();
    expect(siteCheck(m.newSite("free"), { ...p, cx: 14 })).not.toBeNull();
    const e = estimate(m.newSite("free"), placeNew("cottage", 0, 0));
    expect(e.cost).toBeGreaterThan(5000);
    expect(e.skipped).toBe(0);
  });

  it("building to the brief passes the inspector, for every career job and every kind of contract", { timeout: 120_000 }, () => {
    const briefs = JOBS.map((j) => ({ name: j.id, needs: j.needs, zone: j.zone }));
    const c = co.newCompany("T", 4);
    c.rep = 100;
    const seen = new Set<string>();
    for (let i = 0; i < 400 && seen.size < 11; i++) {
      const x = co.makeContract(c);
      if (seen.has(x.tpl)) continue;
      seen.add(x.tpl);
      briefs.push({ name: x.tpl, needs: x.needs, zone: x.zone });
    }
    expect(seen.size).toBe(11);
    for (const b of briefs) {
      const p = planForBrief(b.needs, b.zone);
      expect(p, b.name).toBeTruthy();
      const { s, why } = buildAll(p!);
      expect(why, b.name).toEqual([]);
      const job = { id: b.name, title: b.name, client: "", brief: "", zone: b.zone, budget: 1e9, fee: 1, days: 999, needs: b.needs, icon: "" };
      const r = inspect(s, job);
      expect(r.checks.filter((x) => !x.ok).map((x) => `${b.name}: ${x.label}: ${x.detail}`)).toEqual([]);
    }
  });
});
