import { BANDS, BIKE_COST, CIVICS, ROADS, TRAM_COST, USES, type CivicKind, type Parking, type Pattern, type RoadKind, type Rules, type Use } from "./data";
import { planStats, zoning, type PlanStats } from "./design";
import { nearestOn, polyLength, type OBB, type Pts } from "./geom";
import { patternRoads } from "./patterns";
import { addLoss, addRoad, demolish, fillLots, inWater, lotObb, lotRow, nearestEdge, nearestNode, noLoss, onMap, refreshConn, removeEdge, removeLot, roadClears, roadCost, roadHalf, type Loss } from "./roads";
import { places, startBuilding, submit } from "./sim";
import { distToPoly, obbSamples } from "./geom";
import { ix, news, type Application, type Plan, type State } from "./state";
import { addDistrict, assignDistricts } from "./world";

/**
 * Everything the planner can do: lay and upgrade roads, zone districts (and lay out their
 * streets), upzone, design and commission buildings, place civic buildings, and decide on the
 * developers' applications. Each returns a reason when it can't be done.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; why: string };

const fail = (why: string) => ({ ok: false as const, why });

export function unlocked(s: State, what: { pop: number }) {
  return s.stats.pop >= what.pop;
}

export function canRoad(s: State, kind: RoadKind) {
  return s.stats.pop >= ROADS[kind].unlock;
}

export const canTram = (s: State) => s.stats.pop >= ROADS.avenue.unlock;

export function canBand(s: State, band: number) {
  return s.stats.pop >= BANDS[band].unlock;
}

/* ------------------------------------------------------------------ roads */

export function roadQuote(s: State, pts: Pts, kind: RoadKind) {
  return { cost: roadCost(s, pts, kind), loss: roadClears(s, pts, kind), length: polyLength(pts) };
}

export function buildRoad(s: State, pts: Pts, kind: RoadKind, name?: string): Result<{ cost: number; loss: Loss; edges: number[] }> {
  if (!canRoad(s, kind)) return fail(`${ROADS[kind].name}s unlock at ${ROADS[kind].unlock.toLocaleString()} people`);
  const cost = roadCost(s, pts, kind);
  if (cost > s.money) return fail("Not enough money");
  const r = addRoad(s, pts, kind, name);
  if (typeof r === "string") return fail(r);
  if (!r.edges.length) return fail("Already a road there");
  s.money -= cost;
  s.budget.builds += cost;
  if (r.loss.homes) s.mood -= r.loss.homes / 12;
  return { ok: true, cost, loss: r.loss, edges: r.edges };
}

/** Widen or narrow a road, or add bike lanes or a tram line. */
export function upgradeRoad(s: State, id: number, change: { kind?: RoadKind; bike?: boolean; tram?: boolean }): Result<{ cost: number; loss: Loss }> {
  const e = s.edges[id];
  if (!e) return fail("No road there");
  const kind = change.kind ?? e.kind;
  const tram = change.tram ?? e.tram;
  const bike = change.bike ?? e.bike;
  if (!canRoad(s, kind)) return fail(`${ROADS[kind].name}s unlock at ${ROADS[kind].unlock.toLocaleString()} people`);
  if (tram && kind !== "avenue") return fail("Trams need an avenue");
  if (tram && !canTram(s)) return fail(`Trams unlock at ${ROADS.avenue.unlock.toLocaleString()} people`);
  if (bike && kind === "lane") return fail("Lanes are too narrow for bike lanes");
  let cost = 0;
  if (kind !== e.kind) cost += roadCost(s, e.pts, kind) - (ROADS[kind].cost < ROADS[e.kind].cost ? roadCost(s, e.pts, kind) * 0.8 : roadCost(s, e.pts, e.kind) * 0.6);
  if (bike && !e.bike) cost += e.len * BIKE_COST;
  if (tram && !e.tram) cost += e.len * TRAM_COST;
  cost = Math.max(0, Math.round(cost));
  if (cost > s.money) return fail("Not enough money");
  const loss = noLoss();
  if (kind !== e.kind) {
    const wider = roadHalf(kind) > roadHalf(e.kind);
    e.kind = kind;
    if (wider) {
      // Knock back whatever the wider road now runs over.
      const I = ix(s);
      const near = I.lots.query(Math.min(...xs(e.pts)) - 40, Math.min(...zs(e.pts)) - 40, Math.max(...xs(e.pts)) + 40, Math.max(...zs(e.pts)) + 40);
      for (const lid of near) {
        const l = s.lots[lid];
        if (!l) continue;
        const sm = obbSamples(lotObb(l));
        for (let k = 0; k < sm.length; k += 2)
          if (distToPoly(e.pts, sm[k], sm[k + 1]) < roadHalf(kind) + 0.3) {
            addLoss(loss, removeLot(s, lid));
            break;
          }
      }
    }
    fillLots(s, [id, ...s.nodes[e.a]!.edges, ...s.nodes[e.b]!.edges]);
  }
  e.bike = bike && kind !== "lane";
  e.tram = tram;
  s.money -= cost;
  s.budget.builds += cost;
  if (loss.homes) s.mood -= loss.homes / 12;
  s.rev++;
  return { ok: true, cost, loss };
}

const xs = (p: Pts) => p.filter((_, i) => i % 2 === 0);
const zs = (p: Pts) => p.filter((_, i) => i % 2 === 1);

export function bulldozeRoad(s: State, id: number): Result<{ loss: Loss }> {
  const e = s.edges[id];
  if (!e) return fail("No road there");
  const loss = removeEdge(s, id);
  if (loss.homes) s.mood -= loss.homes / 10;
  return { ok: true, loss };
}

export function bulldozeBuilding(s: State, id: number): Result<{ cost: number; loss: Loss }> {
  const b = s.buildings[id];
  if (!b) return fail("Nothing there");
  const cost = b.use === "civic" ? 20_000 : Math.round(b.hw * b.hd * 4 * b.storeys * 140 + (b.done ? b.homes * 9_000 + b.jobs * 3_000 : 0));
  if (cost > s.money) return fail("Not enough money");
  const loss = demolish(s, id);
  s.money -= cost;
  s.budget.builds += cost;
  if (loss.homes) s.mood -= loss.homes / 10;
  return { ok: true, cost, loss };
}

/* ------------------------------------------------------------------ districts */

export function zoneDistrict(s: State, poly: Pts, use: Use, band: number, rules?: Rules, name?: string): Result<{ id: number }> {
  if (poly.length < 6) return fail("Draw a bigger area");
  band = USES[use].bands.includes(band) ? band : USES[use].bands[0];
  if (!canBand(s, band)) return fail(`${BANDS[band].form} unlock at ${BANDS[band].unlock.toLocaleString()} people`);
  const d = addDistrict(s, poly, use, band, { rules, name });
  return { ok: true, id: d.id };
}

export function updateDistrict(s: State, id: number, patch: Partial<{ use: Use; band: number; rules: Partial<Rules>; name: string }>): Result {
  const d = s.districts[id];
  if (!d) return fail("No district");
  if (patch.use) {
    d.use = patch.use;
    if (!USES[d.use].bands.includes(d.band)) d.band = USES[d.use].bands[0];
  }
  if (patch.band !== undefined) {
    if (!USES[d.use].bands.includes(patch.band)) return fail(`${USES[d.use].name} can't be zoned ${BANDS[patch.band].label}`);
    if (!canBand(s, patch.band)) return fail(`${BANDS[patch.band].form} unlock at ${BANDS[patch.band].unlock.toLocaleString()} people`);
    d.band = patch.band;
  }
  if (patch.rules) d.rules = { ...d.rules, ...patch.rules };
  if (patch.name) d.name = patch.name.slice(0, 32);
  s.zrev++;
  s.rev++;
  return { ok: true };
}

export function removeDistrict(s: State, id: number): Result {
  if (!s.districts[id]) return fail("No district");
  s.districts[id] = null;
  assignDistricts(s);
  s.zrev++;
  s.rev++;
  return { ok: true };
}

/** Upzone an area: the zoning there goes up one band (as a new district on top). */
export function upzone(s: State, poly: Pts): Result<{ id: number; band: number }> {
  const counts = new Map<number, number>();
  const I = ix(s);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]);
    x1 = Math.max(x1, poly[i]);
    z0 = Math.min(z0, poly[i + 1]);
    z1 = Math.max(z1, poly[i + 1]);
  }
  for (const lid of I.lots.query(x0, z0, x1, z1)) {
    const l = s.lots[lid];
    if (!l || l.district < 0 || !inPoly(poly, l.x, l.z)) continue;
    counts.set(l.district, (counts.get(l.district) ?? 0) + 1);
  }
  let best = -1;
  let n = 0;
  for (const [d, c] of counts) if (c > n) [best, n] = [d, c];
  const src = s.districts[best];
  if (!src) return fail("Nothing zoned there to upzone");
  const bands = USES[src.use].bands;
  const next = bands.find((b) => b > src.band);
  if (next === undefined) return fail(`${src.name} is already as tall as ${USES[src.use].name.toLowerCase()} go`);
  if (!canBand(s, next)) return fail(`${BANDS[next].form} unlock at ${BANDS[next].unlock.toLocaleString()} people`);
  const d = addDistrict(s, poly, src.use, next, { rules: src.rules, name: `${src.name.replace(/ \(upzoned\)$/, "")} (upzoned)` });
  s.mood += 0.5;
  news(s, `${d.name}: now zoned ${BANDS[next].label}.`);
  return { ok: true, id: d.id, band: next };
}

function inPoly(poly: Pts, x: number, z: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    if (poly[i + 1] > z !== poly[j + 1] > z && x < ((poly[j] - poly[i]) * (z - poly[i + 1])) / (poly[j + 1] - poly[i + 1]) + poly[i]) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------ street patterns */

export function patternQuote(s: State, r: OBB, pattern: Pattern) {
  const out = patternRoads(r, pattern, { avenue: canRoad(s, "avenue"), seed: s.month * 31 + Math.round(r.x + r.z), land: (x, z) => !inWater(s, x, z, 6) && onMap(x, z, 2) });
  let cost = 0;
  let length = 0;
  for (const p of out.roads) {
    cost += roadCost(s, p.pts, p.kind);
    length += polyLength(p.pts);
  }
  return { ...out, cost, length };
}

/** Lay out a neighbourhood's streets in a rectangle, zone it, and link it to the network. */
export function layOut(s: State, r: OBB, poly: Pts, pattern: Pattern, use: Use, band: number, rules?: Rules): Result<{ cost: number; roads: number; loss: Loss; district: number }> {
  band = USES[use].bands.includes(band) ? band : USES[use].bands[0];
  if (!canBand(s, band)) return fail(`${BANDS[band].form} unlock at ${BANDS[band].unlock.toLocaleString()} people`);
  if (r.hw < 60 || r.hd < 60) return fail("Draw a bigger area");
  const q = patternQuote(s, r, pattern);
  if (q.cost > s.money) return fail(`Not enough money (it costs $${Math.round(q.cost / 1000).toLocaleString()}k)`);
  let cost = 0;
  let roads = 0;
  const loss = noLoss();
  const made: number[] = [];
  for (const p of q.roads) {
    const pts = reachOut(s, p.pts);
    const res = addRoad(s, pts, p.kind);
    if (typeof res === "string") continue;
    cost += roadCost(s, pts, p.kind);
    roads++;
    made.push(...res.edges);
    addLoss(loss, res.loss);
  }
  if (!roads) return fail("No room for streets there");
  // Link a stranded neighbourhood to the nearest point on a connected road.
  refreshConn(s);
  if (!made.some((id) => s.edges[id]?.conn)) {
    const mine = new Set(made);
    let best: { x: number; z: number; tx: number; tz: number; d: number } | null = null;
    for (const id of made) {
      const e = s.edges[id];
      if (!e) continue;
      for (const nid of [e.a, e.b]) {
        const n = s.nodes[nid]!;
        for (const o of s.edges) {
          if (!o || !o.conn || mine.has(o.id)) continue;
          const r = nearestOn(o.pts, n.x, n.z);
          if (!best || r.d < best.d) best = { x: n.x, z: n.z, tx: r.x, tz: r.z, d: r.d };
        }
      }
    }
    if (best && best.d < 900) {
      const link = [best.x, best.z, best.tx, best.tz];
      const res = addRoad(s, link, "street");
      if (typeof res !== "string") cost += roadCost(s, link, "street");
    }
  }
  s.money -= cost;
  s.budget.builds += cost;
  const d = addDistrict(s, poly, use, band, { rules });
  d.pattern = pattern;
  for (const park of q.parks) addDistrict(s, park, "parks", 0, { name: `${d.name} Green` });
  if (loss.homes) s.mood -= loss.homes / 12;
  return { ok: true, cost: Math.round(cost), roads, loss, district: d.id };
}

/** Stretch a pattern road's loose ends to meet a road just beyond them. */
function reachOut(s: State, pts: Pts): Pts {
  const out = pts.slice();
  for (const end of [0, 1]) {
    const k = end ? out.length - 2 : 0;
    const x = out[k];
    const z = out[k + 1];
    if (nearestNode(s, x, z, 10)) continue;
    const e = nearestEdge(s, x, z, 45);
    if (!e || e.d < 10) continue;
    // Only reach forward, roughly along the road's own line.
    const j = end ? out.length - 4 : 2;
    const dx = x - out[j];
    const dz = z - out[j + 1];
    const l = Math.hypot(dx, dz) || 1;
    if (((e.x - x) * dx + (e.z - z) * dz) / (l * e.d) < 0.7) continue;
    if (end) out.push(e.x, e.z);
    else out.unshift(e.x, e.z);
  }
  return out;
}

/* ------------------------------------------------------------------ buildings */

export interface DesignCheck {
  st: PlanStats;
  why: string | null;
}

/** Can this design go up, and what would it take? */
export function checkDesign(s: State, plan: Plan): DesignCheck {
  const st = planStats(s, plan);
  let why: string | null = null;
  for (const id of plan.lots) {
    const l = s.lots[id];
    if (!l) why = "That lot is gone";
    else if (l.bld >= 0) {
      const b = s.buildings[l.bld]!;
      if (!b.done) why = `${b.name} is still being built`;
      else if (b.use === "civic") why = `${b.name} can't be knocked down for this`;
    }
  }
  if (!why && st.net > s.money) why = "Not enough money";
  if (!why && st.clout > s.clout) why = `Needs ✦${st.clout} clout`;
  return { st, why };
}

/** The city builds its own design (a developer partner builds it; the city covers the gap). */
export function commission(s: State, plan: Plan): Result<{ id: number; st: PlanStats }> {
  const { st, why } = checkDesign(s, plan);
  if (why) return fail(why);
  s.money -= st.net;
  s.budget.builds += Math.max(0, st.net);
  s.clout -= st.clout;
  const b = startBuilding(s, plan, st, true);
  s.mood += st.homes / 60 - st.loss.homes / 14 - st.over / 4;
  news(s, `Work starts on ${b.name}${st.over ? `, ${st.over} storeys over the zoning` : ""}.`);
  return { ok: true, id: b.id, st };
}

/** Place a civic building on a lot (and its neighbours if it needs more). */
export function placeCivic(s: State, kind: CivicKind, lotId: number): Result<{ id: number }> {
  const info = CIVICS[kind];
  const row = lotRow(s, lotId, info.lots);
  if (row.length < info.lots) return fail(`Needs ${info.lots} lots in a row`);
  const plan: Plan = { use: "civic", civic: kind, storeys: kind === "school" || kind === "clinic" ? 2 : kind === "library" ? 2 : 1, style: "brick", roof: "plain", bay: false, color: "", parking: 0, affordable: 0, name: info.name, lots: row };
  const { st, why } = checkDesign(s, plan);
  if (why) return fail(why);
  s.money -= st.net;
  s.budget.builds += st.net;
  const b = startBuilding(s, plan, st, true);
  s.mood += 0.6;
  return { ok: true, id: b.id };
}

/** A starting design for a lot: what the zoning would allow, in the area's style. */
export function draftPlan(s: State, lotId: number, n = 1): Plan {
  const l = s.lots[lotId]!;
  const z = zoning(s, l);
  const use = z.use === "jobs" ? "jobs" : z.use === "shops" ? "shops" : z.use === "industry" ? "industry" : z.use === "mixed" ? "mixed" : "homes";
  const storeys = Math.max(use === "mixed" ? 2 : 1, z.max || 4);
  return { use, storeys, style: storeys > 12 ? "concrete" : "brick", roof: "plain", bay: false, color: "", parking: (z.rules?.parking ?? 1) as Parking, affordable: z.rules?.affordable ?? 0, name: "", lots: lotRow(s, lotId, n) };
}

/* ------------------------------------------------------------------ applications */

export function decide(s: State, id: number, yes: boolean): Result<{ msg: string }> {
  const a = s.apps.find((x) => x.id === id);
  if (!a) return fail("That application is gone");
  s.apps = s.apps.filter((x) => x !== a);
  if (!yes) {
    s.mood += (a.lean === "no" ? 0.6 : -0.4) - Math.max(0, s.rentIndex - 1.1) * (a.homes / 30);
    news(s, `You turned down ${a.plan.name}.`);
    return { ok: true, msg: `${a.plan.name} denied.` };
  }
  const st = planStats(s, a.plan);
  const blocked = a.plan.lots.some((lid) => {
    const l = s.lots[lid];
    const b = l && l.bld >= 0 ? s.buildings[l.bld] : null;
    return !l || (b && (!b.done || b.use === "civic"));
  });
  if (blocked) return fail("Something else is being built there now");
  startBuilding(s, a.plan, st);
  s.mood += a.homes / 45 - a.homesLost / 12 - (a.lean === "no" ? 0.8 : 0);
  if (a.lean === "yes") s.clout = Math.min(99, s.clout + 1);
  news(s, `Approved: ${a.plan.name}, ${a.homes ? `${a.homes} homes` : `${a.jobs} jobs`}.`, "good");
  return { ok: true, msg: `${a.plan.name} approved.` };
}

export type Term = "shorter" | "affordable" | "parking" | "shops";

export const TERMS: Record<Term, string> = {
  shorter: "A quarter fewer storeys",
  affordable: "One in five homes affordable",
  parking: "Less parking",
  shops: "Shops on the ground floor",
};

/** Ask for different terms. The developer agrees if it still pays, or walks away. */
export function changeTerms(s: State, id: number, term: Term): Result<{ msg: string; walked: boolean; app?: Application }> {
  const a = s.apps.find((x) => x.id === id);
  if (!a) return fail("That application is gone");
  if (a.changed) return fail("They won't negotiate twice");
  const plan = { ...a.plan };
  if (term === "shorter") plan.storeys = Math.max(a.zoned, Math.round(plan.storeys * 0.75));
  if (term === "affordable") plan.affordable = Math.max(plan.affordable, 20);
  if (term === "parking") plan.parking = Math.max(0, plan.parking - 1) as Parking;
  if (term === "shops") plan.use = plan.use === "homes" ? "mixed" : plan.use;
  const st = planStats(s, plan);
  if (st.margin < 0.05) {
    s.apps = s.apps.filter((x) => x !== a);
    news(s, `${a.dev} walked away from ${a.plan.name}.`, "bad");
    return { ok: true, msg: `${a.dev} walked away. It doesn't pay for them any more.`, walked: true };
  }
  const re = submit(s, plan, st, a.zoned);
  s.apps = s.apps.filter((x) => x !== a && x !== re);
  re.id = a.id;
  re.submitted = a.submitted;
  re.changed = true;
  re.dev = a.dev;
  s.apps.push(re);
  s.news.shift();
  return { ok: true, msg: `${a.dev} agreed to the new terms.`, walked: false, app: re };
}

export function setTax(s: State, rate: number) {
  s.taxRate = Math.max(0.3, Math.min(2.5, Math.round(rate * 10) / 10));
}

/** Snap a point to the nearest junction, for drawing roads. */
export function snapPoint(s: State, x: number, z: number) {
  const n = nearestNode(s, x, z, 14);
  return n ? { x: n.x, z: n.z, node: n.id } : { x, z, node: -1 };
}

export { places };
