/**
 * War on the map's grid. Every land cell belongs to someone; at war, the front is the line of
 * cells touching the enemy. Each day both sides press along each theatre's stretch of front
 * with what they've put there (by priority and directive: hold, limited or major offensive),
 * the ground (mountains and cities favour the defender), supply (cells cut off from home
 * weaken and surrender), air superiority and ammunition. Cities change hands with the cells
 * around them; occupied cities stop producing for their owner, and their people may resist or
 * flee. Strikes hit power plants, factories and ports; blockades cut sea trade; peace can
 * annex, freeze or restore. And the bomb, for those who have it.
 */
import { EQUIP, EQUIP_IDS, GOOD_INDEX, LAW, SERVICE_IDS, TECHS, type EquipId } from "./data";
import { defenceCost } from "./econ";
import type { Atlas } from "./atlas";
import { cellNeighbours } from "./atlas";
import type { D } from "./econ";
import type { Directive, Doctrine, Nation, PeaceTerm, Theatre, War, World } from "./state";
import { clamp, rngNext } from "./util";
import { news } from "./news";
import { nudge, rel } from "./diplomacy";
import { makeTheatres } from "./setup";

const NB: number[] = [];

/** Who controls a grid cell now. */
export function cellOwner(w: World, a: Atlas, cell: number): number {
  const f = w.front[cell];
  if (f !== undefined) return f;
  const c = a.cellCity[cell];
  return c < 0 ? -1 : w.owner[c];
}

export function sideOf(war: War, n: number): 0 | 1 | -1 {
  return war.attackers.includes(n) ? 0 : war.defenders.includes(n) ? 1 : war.actor !== undefined && n === 1000 + war.actor ? 0 : -1;
}

/* ------------------------------------------------------------------ strength */

export function landPower(n: Nation): number {
  let s = 0;
  for (const e of EQUIP_IDS) s += n.mil.equip[e] * EQUIP[e].land;
  return s * techMilitary(n, "land");
}
export function airPower(n: Nation): number {
  let s = 0;
  for (const e of EQUIP_IDS) s += n.mil.equip[e] * EQUIP[e].air;
  return s * techMilitary(n, "air");
}
export function seaPower(n: Nation): number {
  let s = 0;
  for (const e of EQUIP_IDS) s += n.mil.equip[e] * EQUIP[e].sea;
  return s * techMilitary(n, "naval");
}
function techMilitary(n: Nation, f: string) {
  let c = 0;
  for (const i of n.research.known) if (TECHS[i]?.field === f) c++;
  return 1 + c * 0.06;
}

/** A side's land force committed to this war (the rest guards home). */
function sideForce(w: World, war: War, side: 0 | 1): number {
  let s = 0;
  const list = side === 0 ? war.attackers : war.defenders;
  for (const id of list) {
    const n = w.nations[id];
    const commit = clamp(0.35 + n.mil.mobilised * 0.6 + (id === list[0] ? 0.2 : -0.1), 0.15, 0.95);
    s += landPower(n) * commit * (n.mil.ammo > 0 ? 1 : 0.45) * clamp(n.mil.loyalty / 70, 0.5, 1.15);
  }
  if (side === 0 && war.actor !== undefined) s += w.actors[war.actor].strength * 12;
  return s;
}

/* ------------------------------------------------------------------ declaring */

export const GROUNDS = [
  { id: "claim", name: "Our claim to their territory", legit: 15 },
  { id: "defend", name: "Defending an ally", legit: 70 },
  { id: "atrocity", name: "Stopping atrocities", legit: 55 },
  { id: "preempt", name: "Pre-empting an attack", legit: 30 },
  { id: "unsc", name: "Security Council mandate", legit: 90 },
  { id: "none", name: "No stated reason", legit: 2 },
] as const;

export function declareWar(w: World, a: Atlas, d: D, by: number, target: number, grounds: string, legit: number): War {
  const A = w.nations[by];
  const T = w.nations[target];
  const war: War = {
    id: w.ids++,
    name: `${A.name}–${T.name} war`,
    attackers: [by],
    defenders: [target],
    start: w.day,
    grounds,
    legit,
    claims: A.claims.filter((c) => w.owner[c] === target),
    theatres: [],
    air: 0.5,
    sea: 0.5,
    score: 0,
    dead: { [by]: 0, [target]: 0 },
    civilians: {},
    refugees: 0,
    doctrine: ["military", "military"],
    ceasefire: 0,
    over: false,
  };
  w.wars.push(war);
  // The front: border cells between the two.
  seedFront(w, a, war);
  makeTheatres(w, a, war);
  for (const t of war.theatres) t.dir = ["major", "hold"];
  // The world reacts.
  for (const n of w.nations) {
    if (n.id === by || n.id === target || !n.alive) continue;
    const s = (rel(w, n.id, target) - rel(w, n.id, by)) / 100 + (50 - legit) / 100;
    nudge(w, n.id, by, -clamp(s * 15, -5, 20));
  }
  news(w, by, `WAR: ${A.name} attacks ${T.name}`, "war", true);
  // Allies weigh in (not automatically).
  callAllies(w, war);
  void d;
  return war;
}

/** Mark both nations' border cells as part of the live front map. */
function seedFront(w: World, a: Atlas, war: War) {
  const sides = new Set([...war.attackers, ...war.defenders]);
  for (const n of sides) {
    for (const c of a.nationCities[n] ?? []) {
      if (w.owner[c] !== n) continue;
      for (const cell of a.cityCells[c]) {
        for (const q of cellNeighbours(a, cell, NB)) {
          const o = cellOwner(w, a, q);
          if (o >= 0 && o !== n && sides.has(o)) {
            w.front[cell] = w.front[cell] ?? n;
            break;
          }
        }
      }
    }
  }
}

/** Allies decide whether to join: treaty, relations, risk and opinion. */
export function callAllies(w: World, war: War) {
  const target = war.defenders[0];
  const aggressor = war.attackers[0];
  for (const n of w.nations) {
    if (!n.alive || war.attackers.includes(n.id) || war.defenders.includes(n.id) || n.id === w.actor.nation) continue;
    const pact = w.treaties.some((t) => (t.kind === "defence" || t.kind === "guarantee") && ((t.a === n.id && t.b === target) || (t.b === n.id && t.a === target)));
    const nato = n.orgs.includes("nato") && w.nations[target].orgs.includes("nato") && !w.nations[aggressor].orgs.includes("nato");
    if (!pact && !nato) continue;
    const risk = landPower(w.nations[aggressor]) / Math.max(1, landPower(n)) + (w.nations[aggressor].mil.nukes > 0 ? 1.2 : 0);
    const want = rel(w, n.id, target) / 60 - rel(w, n.id, aggressor) / 120 + (nato ? 0.6 : 0.3) - risk * 0.25 + war.legit / 200;
    if (want > 0.4) {
      war.defenders.push(n.id);
      news(w, n.id, `${n.name} enters the war on ${w.nations[target].name}'s side`, "war", true);
    } else if (want > 0) {
      w.treaties.push({ id: w.ids++, kind: "milaid", a: n.id, b: target, since: w.day, amount: n.gdp * 0.002 });
      news(w, n.id, `${n.name} stays out but sends weapons to ${w.nations[target].name}`, "war", true);
    }
  }
}

/** What each minister thinks of going to war, and why. */
export function ministersOnWar(w: World, by: number, target: number, legit: number): { role: string; for: boolean; why: string }[] {
  const A = w.nations[by];
  const T = w.nations[target];
  const ratio = landPower(A) / Math.max(1, landPower(T));
  const out: { role: string; for: boolean; why: string }[] = [];
  out.push({ role: "Defence", for: ratio > 1.4, why: ratio > 1.4 ? `We outnumber them ${ratio.toFixed(1)} to 1 on land.` : `They're as strong as us on land (${ratio.toFixed(1)} : 1). It would be a long war.` });
  const sanctionsRisk = w.nations.filter((n) => rel(w, n.id, target) > 30 && n.gdp > 500).length;
  out.push({ role: "Foreign affairs", for: legit > 50, why: legit > 50 ? "We'd have the world with us." : `${sanctionsRisk} major economies are friendly with them: expect sanctions.` });
  const ammo = A.mil.ammo;
  out.push({ role: "Finance", for: A.debt / Math.max(1, A.gdp) < 0.7 && ammo > 30, why: A.debt / Math.max(1, A.gdp) < 0.7 ? `We can borrow for it; ${Math.round(ammo)} days of ammunition in stock.` : "The debt is already high; war means printing or austerity." });
  if (T.mil.nukes > 0) out.push({ role: "Chief of staff", for: false, why: `They have ${T.mil.nukes} nuclear warheads.` });
  return out;
}

/* ------------------------------------------------------------------ the daily battle */

const DIR_MULT: Record<Directive, { atk: number; def: number; loss: number; ammo: number }> = {
  hold: { atk: 0, def: 1.25, loss: 0.3, ammo: 0.3 },
  limited: { atk: 0.75, def: 1, loss: 0.7, ammo: 0.7 },
  major: { atk: 1.35, def: 0.85, loss: 1.6, ammo: 1.5 },
};

export function warDay(w: World, a: Atlas, d: D, war: War) {
  if (war.over) return;
  if (war.ceasefire > w.day) return;
  const g = a.map.grid;
  // Front cells by theatre.
  const front: { cell: number; side: 0 | 1; enemy: number; th: number }[] = [];
  const thLen = new Array(war.theatres.length).fill(0);
  for (const [k, ctl] of Object.entries(w.front)) {
    const cell = +k;
    const s = sideOf(war, ctl);
    if (s < 0) continue;
    for (const q of cellNeighbours(a, cell, NB)) {
      const o = cellOwner(w, a, q);
      if (o < 0) continue;
      const so = sideOf(war, o);
      if (so >= 0 && so !== s) {
        const th = theatreOf(war, a, cell);
        front.push({ cell, side: s as 0 | 1, enemy: q, th });
        if (s === 1) thLen[th]++;
        break;
      }
    }
  }
  // Defending cells next to attacker cells that aren't in the front map yet.
  for (const f of front) if (w.front[f.enemy] === undefined) w.front[f.enemy] = cellOwner(w, a, f.enemy);
  war.theatres.forEach((t, i) => (t.len = thLen[i]));
  if (!front.length) {
    war.score += war.actor !== undefined ? 0 : -0.02;
    return;
  }
  // Forces, spread over the theatres by priority.
  const F = [sideForce(w, war, 0), sideForce(w, war, 1)];
  const air = airBalance(w, war);
  war.air = air;
  const priTot = [0, 1].map((s) => war.theatres.reduce((acc, t) => acc + t.pri[s] * Math.max(1, t.len), 0) || 1);
  const density = (s: 0 | 1, th: number) => {
    const t = war.theatres[th];
    return t ? (F[s] * t.pri[s]) / priTot[s] : F[s] / Math.max(1, front.length);
  };
  let flips = 0;
  const loss = [0, 0];
  const cutOff = supplyCut(w, a, war);
  for (const f of front) {
    if (f.side !== 0 && f.side !== 1) continue;
    const t = war.theatres[f.th];
    const atkSide = f.side;
    const defSide = (1 - atkSide) as 0 | 1;
    const dir = t ? t.dir[atkSide] : "limited";
    const m = DIR_MULT[dir];
    if (m.atk <= 0) continue;
    const ddir = t ? t.dir[defSide] : "hold";
    const att = density(atkSide, f.th) * m.atk * (atkSide === 0 ? 0.6 + air : 1.6 - air) * (cutOff.has(f.cell) ? 0.3 : 1);
    const terrain = terrainAt(a, f.enemy);
    // Lines that have held for months are dug in: trenches, mines, bunkers.
    const dug = war.dug ?? (war.dug = {});
    const held = w.day - (dug[f.enemy] ?? w.day - 200);
    const fort = 1 + clamp(held / 150, 0, 1) * 0.9;
    const def = density(defSide, f.th) * DIR_MULT[ddir].def * terrain * fort * (defSide === 0 ? 0.6 + air : 1.6 - air) * (cutOff.has(f.enemy) ? 0.25 : 1);
    const ratio = att / Math.max(1e-6, def);
    const p = clamp((ratio - 1.1) * 0.02, 0, 0.05) + (cutOff.has(f.enemy) ? 0.04 : 0);
    if (rngNext(w) < p) {
      const winner = w.front[f.cell] ?? cellOwner(w, a, f.cell);
      w.front[f.enemy] = winner;
      dug[f.enemy] = w.day;
      flips++;
    }
    loss[atkSide] += m.loss;
    loss[defSide] += m.loss * 0.6;
  }
  // Casualties, kit and shells: heavier where the fighting is.
  const cells = Math.max(1, front.length);
  const kill = (ids: number[], k: number) => {
    const share = 1 / Math.max(1, ids.length);
    for (const id of ids) {
      const n = w.nations[id];
      const dead = Math.round(k * cells * 0.75 * share * (0.6 + rngNext(w) * 0.8));
      war.dead[id] = (war.dead[id] ?? 0) + dead;
      n.mil.personnel = Math.max(0, n.mil.personnel - dead * 1.6);
      n.mil.equip.infantry = Math.max(0, Math.round(n.mil.personnel / 700));
      const lose = (e: EquipId, per: number) => (n.mil.equip[e] = Math.max(0, n.mil.equip[e] - Math.round(k * cells * per * share * (rngNext(w) + 0.5))));
      lose("tank", 0.012);
      lose("ifv", 0.02);
      lose("artillery", 0.012);
      lose("drone", 2.5);
      n.mil.ammo = Math.max(0, n.mil.ammo - clamp(0.15 + k * 0.25, 0, 1));
    }
  };
  kill(war.attackers, loss[0] / cells + 0.15);
  kill(war.defenders, loss[1] / cells + 0.15);
  // Cities change hands with their cells.
  if (flips) updateCities(w, a, d, war);
  // Score: ground taken and the toll.
  const occD = war.defenders.reduce((s2, id) => Math.max(s2, d.occupied[id]), 0);
  const occA = war.attackers.reduce((s2, id) => Math.max(s2, d.occupied[id]), 0);
  const deadA = war.attackers.reduce((s2, id) => s2 + (war.dead[id] ?? 0), 1);
  const deadD = war.defenders.reduce((s2, id) => s2 + (war.dead[id] ?? 0), 1);
  war.score = clamp(300 * (occD - occA) + 12 * Math.log(deadD / deadA), -100, 100);
  void g;
}

function theatreOf(war: War, a: Atlas, cell: number): number {
  if (!war.theatres.length) return 0;
  const [x, y] = [(cell % a.map.grid.w) * a.map.grid.cell, Math.floor(cell / a.map.grid.w) * a.map.grid.cell];
  let best = 0;
  let bd = Infinity;
  war.theatres.forEach((t, i) => {
    const c = a.map.cities[t.city];
    const dd = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (dd < bd) ((bd = dd), (best = i));
  });
  return best;
}

/** Mountains and cities favour the defender. */
function terrainAt(a: Atlas, cell: number) {
  const h = a.height ? a.height[cell] ?? 0 : 0;
  const c = a.cellCity[cell];
  const city = c >= 0 && a.cityCells[c].length < 6 ? 1.25 : 1;
  return (1 + h * 1.4) * city;
}

/** Air superiority for the attackers (0…1). */
function airBalance(w: World, war: War) {
  const A = war.attackers.reduce((s, id) => s + airPower(w.nations[id]), 0);
  const D = war.defenders.reduce((s, id) => s + airPower(w.nations[id]), 0);
  return A + D > 0 ? clamp(A / (A + D), 0.05, 0.95) : 0.5;
}

/** Cells cut off from their side's territory (encircled). Checked every few days. */
const CUT = new Map<number, { day: number; cells: Set<number> }>();
function supplyCut(w: World, a: Atlas, war: War): Set<number> {
  const c = CUT.get(war.id);
  if (c && w.day - c.day < 5) return c.cells;
  const cells = new Set<number>();
  // Cells in the live front map, by controller; flood from cells that are the controller's own land.
  const byCtl = new Map<number, number[]>();
  for (const [k, v] of Object.entries(w.front)) {
    if (sideOf(war, v) < 0) continue;
    const list = byCtl.get(v) ?? [];
    list.push(+k);
    byCtl.set(v, list);
  }
  for (const [ctl, list] of byCtl) {
    const set = new Set(list);
    const seen = new Set<number>();
    const queue: number[] = [];
    // Sources: cells with a neighbour of the controller's own (non-front) land, or its own owned cells.
    for (const cell of list) {
      const city = a.cellCity[cell];
      if (city >= 0 && w.owner[city] === ctl) {
        queue.push(cell);
        seen.add(cell);
      } else {
        for (const q of cellNeighbours(a, cell, NB)) {
          if (w.front[q] === undefined && cellOwner(w, a, q) === ctl) {
            queue.push(cell);
            seen.add(cell);
            break;
          }
        }
      }
    }
    while (queue.length) {
      const cell = queue.pop()!;
      for (const q of cellNeighbours(a, cell, NB)) {
        if (!set.has(q) || seen.has(q)) continue;
        seen.add(q);
        queue.push(q);
      }
    }
    for (const cell of list) if (!seen.has(cell)) cells.add(cell);
  }
  CUT.set(war.id, { day: w.day, cells });
  return cells;
}

/** A city belongs to whoever holds its centre cell. */
function updateCities(w: World, a: Atlas, d: D, war: War) {
  const involved = new Set([...war.attackers, ...war.defenders]);
  for (const n of involved) {
    for (const c of d.c.cities[n] ?? []) {
      const city = a.map.cities[c];
      const g = a.map.grid;
      const cell = Math.floor(city.y / g.cell) * g.w + Math.floor(city.x / g.cell);
      const ctl = cellOwner(w, a, cell);
      if (ctl >= 0 && ctl !== w.control[c] && (involved.has(ctl) || ctl >= 1000)) {
        const before = w.control[c];
        w.control[c] = ctl;
        const ownerName = w.nations[w.owner[c]]?.name;
        const ctlName = ctl >= 1000 ? w.actors[ctl - 1000]?.name : w.nations[ctl]?.name;
        news(w, ctl < 1000 ? ctl : w.owner[c], `${ctl === w.owner[c] ? `${ownerName} retakes` : `${ctlName} takes`} ${city.name}`, "war", true);
        // Civilians flee a city that falls.
        const fled = city.pop * (ctl === w.owner[c] ? 0.02 : 0.15);
        war.refugees += fled;
        war.civilians[w.owner[c]] = (war.civilians[w.owner[c]] ?? 0) + Math.round(city.pop * 0.0004);
        w.damage[c] = clamp(w.damage[c] + 0.25, 0, 1);
        void before;
      }
    }
  }
  occupiedShares(w, a, d);
}

/** Share of each nation's people living under someone else's control. */
export function occupiedShares(w: World, a: Atlas, d: D) {
  const occ = new Array(w.nations.length).fill(0);
  const tot = new Array(w.nations.length).fill(0);
  a.map.cities.forEach((c, i) => {
    const o = w.owner[i];
    if (o < 0 || o >= w.nations.length) return;
    tot[o] += c.pop;
    if (w.control[i] !== o) occ[o] += c.pop;
  });
  for (let i = 0; i < occ.length; i++) {
    d.occupied[i] = tot[i] > 0 ? occ[i] / tot[i] : 0;
    OCC[i] = d.occupied[i];
  }
}

/* ------------------------------------------------------------------ directives, strikes, landings */

export function setDirective(war: War, side: 0 | 1, theatre: number, dir: Directive) {
  const t = war.theatres[theatre];
  if (t) t.dir[side] = dir;
}
export function setPriority(war: War, side: 0 | 1, theatre: number, pri: number) {
  const t = war.theatres[theatre];
  if (t) t.pri[side] = clamp(pri, 0, 3);
}
export function setDoctrine(war: War, side: 0 | 1, doc: Doctrine) {
  war.doctrine[side] = doc;
}

export type StrikeTarget = "power" | "industry" | "ports" | "military" | "cities";

/** An air and missile strike on a target type in an enemy country. Returns a summary. */
export function strike(w: World, a: Atlas, d: D, war: War, by: number, target: number, kind: StrikeTarget, missiles: number): string {
  const me = w.nations[by];
  const them = w.nations[target];
  const have = me.mil.equip.cruise + me.mil.equip.ballistic * 2 + me.mil.equip.drone * 0.003;
  const use = Math.min(missiles, have);
  if (use <= 0) return "Nothing left to fire.";
  // Spend cruise first, then ballistic, then drones.
  let left = use;
  const spend = (e: EquipId, per: number) => {
    const n = Math.min(me.mil.equip[e], Math.ceil(left / per));
    me.mil.equip[e] -= n;
    left -= n * per;
  };
  spend("cruise", 1);
  if (left > 0) spend("ballistic", 2);
  if (left > 0) spend("drone", 0.003);
  const intercept = clamp(airPower(them) / Math.max(1, airPower(them) + use * 2), 0.1, 0.92);
  const hits = use * (1 - intercept);
  let out = `${Math.round(use)} strikes, ${Math.round(intercept * 100)}% intercepted. `;
  const side = sideOf(war, by) as 0 | 1;
  if (kind === "power") {
    const plants = w.plants.filter((p) => p.nation === target && p.damage < 1 && p.ready <= w.day && p.type !== "storage").sort((x, y) => y.gw - x.gw);
    let k = hits;
    let hitCount = 0;
    for (const p of plants) {
      if (k <= 0) break;
      const dmg = Math.min(1 - p.damage, k / Math.max(1, p.gw * 3));
      p.damage += dmg;
      k -= dmg * p.gw * 3;
      hitCount++;
    }
    out += `${hitCount} power plants hit.`;
  } else if (kind === "industry") {
    const dmg = clamp(hits / Math.max(1, them.gdp) * 0.8, 0, 0.3);
    for (const s of them.sectors) s.damage = clamp(s.damage + dmg * (s.workers > 0 ? 1 : 0), 0, 0.9);
    out += `Industry ${Math.round(dmg * 100)}% knocked out.`;
  } else if (kind === "ports") {
    w.blockades[target] = w.blockades[target] ?? by;
    out += "Ports damaged: sea trade disrupted.";
  } else if (kind === "military") {
    const k = clamp(hits / 400, 0, 0.12);
    for (const e of ["sam", "fighter", "artillery", "mlrs", "tank"] as EquipId[]) them.mil.equip[e] = Math.round(them.mil.equip[e] * (1 - k));
    them.mil.ammo = Math.max(0, them.mil.ammo * (1 - k));
    out += `Air defences and depots hit (−${Math.round(k * 100)}%).`;
  } else {
    const dead = Math.round(hits * 12);
    war.civilians[target] = (war.civilians[target] ?? 0) + dead;
    war.legit = Math.max(0, war.legit - 4);
    for (const n of w.nations) if (n.free > 0.6 && n.id !== by) nudge(w, n.id, by, -2);
    out += `${dead} civilians killed. The world condemns it.`;
  }
  void side;
  void d;
  void a;
  return out;
}

/** An amphibious landing at an enemy coastal city. */
export function landing(w: World, a: Atlas, d: D, war: War, by: number, city: number): string {
  const me = w.nations[by];
  const target = w.owner[city];
  if (!a.map.cities[city].coastal) return "Not a coastal city.";
  const sea = seaPower(me) / Math.max(1, seaPower(me) + seaPower(w.nations[target]));
  if (sea < 0.6) return `You need control of the sea (you have ${Math.round(sea * 100)}%).`;
  const chance = clamp((sea - 0.5) * 1.5 + (landPower(me) / Math.max(1, landPower(w.nations[target]))) * 0.2, 0.05, 0.85);
  me.mil.personnel = Math.max(0, me.mil.personnel - 2000);
  if (rngNext(w) < chance) {
    for (const cell of a.cityCells[city]) w.front[cell] = by;
    w.control[city] = by;
    occupiedShares(w, a, d);
    news(w, by, `${me.name} lands at ${a.map.cities[city].name}`, "war", true);
    return `Beachhead taken at ${a.map.cities[city].name}.`;
  }
  war.dead[by] = (war.dead[by] ?? 0) + 1500;
  return "The landing was thrown back into the sea.";
}

/** Blockade the enemy's sea trade (needs sea control). */
export function blockade(w: World, war: War, by: number, target: number): string {
  const sea = seaPower(w.nations[by]) / Math.max(1, seaPower(w.nations[by]) + seaPower(w.nations[target]));
  if (sea < 0.55) return `Not enough ships (sea control ${Math.round(sea * 100)}%).`;
  w.blockades[target] = by;
  news(w, by, `${w.nations[by].name} blockades ${w.nations[target].name}'s ports`, "war", true);
  void war;
  return "Blockade in force.";
}

/* ------------------------------------------------------------------ orders */

export function orderEquipment(w: World, n: Nation, e: EquipId, batches = 1): string {
  const def = EQUIP[e];
  const amount = def.batch * batches;
  const cost = (amount * def.cost) / 1000;
  const capacity = n.sectors[20].cap;
  const days = Math.round(def.days * clamp(20 / Math.max(1, capacity), 0.4, 3));
  n.mil.orders.push([e, amount, w.day + days]);
  n.debt += cost;
  return `${amount.toLocaleString()} ${def.name.toLowerCase()} ordered for $${cost.toFixed(1)}bn: ready in ${Math.round(days / 30)} months`;
}

/** Deliveries; ammunition made by the defence industry; mobilised reserves. */
export function militaryDay(w: World, n: Nation, d: D) {
  for (let i = n.mil.orders.length - 1; i >= 0; i--) {
    const [e, amount, day] = n.mil.orders[i];
    if (day <= w.day) {
      n.mil.equip[e] += amount;
      n.mil.orders.splice(i, 1);
      if (n.id === w.actor.nation) news(w, n.id, `Delivered: ${amount.toLocaleString()} ${EQUIP[e].name.toLowerCase()}`, "war");
    }
  }
  // Procurement: what the defence budget buys after pay and upkeep, if the market can supply it.
  const cost = defenceCost(n);
  const proc = Math.max(0, n.spend.defence - cost.required) * 0.4;
  const av = d.slow[n.id];
  for (const [e, good, share] of PROCURE) {
    const k = av[GOOD_INDEX[good]];
    const units = ((proc * share * k) / 365 / (EQUIP[e].cost / 1000)) * 0.25;
    n.mil.equip[e] += units;
  }
  // Kit wears out.
  for (const e of EQUIP_IDS) if (e !== "infantry") n.mil.equip[e] *= 1 - 0.05 / 365;
  // Ammunition from the defence industry and the shells it can buy.
  const shells = (proc * 0.25 * av[GOOD_INDEX.ammunition]) / 365;
  n.mil.ammo = Math.min(365, n.mil.ammo + shells * 0.15 + n.sectors[20].out * 0.0015);
  // At war, conscription and mobilisation refill the ranks.
  const draft = LAW.conscription.options.find((o) => o.id === n.laws.conscription)?.fx?.draft ?? 0;
  if (n.mil.mobilised > 0 || atWarAny(w, n.id)) n.mil.personnel += n.pop * 0.000006 * (0.3 + n.mil.mobilised * 2 + draft * 0.5);
  n.mil.equip.infantry = Math.round(n.mil.personnel / 700);
}
const PROCURE: [EquipId, string, number][] = [["tank", "armour", 0.07], ["ifv", "armour", 0.08], ["artillery", "artillery", 0.06], ["mlrs", "artillery", 0.03], ["sam", "missiles", 0.05], ["cruise", "missiles", 0.06], ["ballistic", "missiles", 0.02], ["drone", "drones", 0.06], ["fighter", "combat_aircraft", 0.12], ["helicopter", "combat_aircraft", 0.04], ["frigate", "warships", 0.06], ["submarine", "warships", 0.04]];
function atWarAny(w: World, id: number) {
  return w.wars.some((x) => !x.over && (x.attackers.includes(id) || x.defenders.includes(id)));
}

/* ------------------------------------------------------------------ occupation */

export function occupationDay(w: World, a: Atlas, d: D) {
  for (let c = 0; c < w.control.length; c++) {
    const ctl = w.control[c];
    const own = w.owner[c];
    if (ctl === own || ctl >= 1000 || ctl < 0) continue;
    const pol = w.occupation[c];
    const target = pol === "administer" ? 0.25 : pol === "repress" ? 0.15 + Math.min(0.5, (w.day % 365) / 900) : 0.05;
    w.revolt[c] = clamp(w.revolt[c] + (target - w.revolt[c]) * 0.01, 0, 1);
    // Partisans retake ground where revolt runs high.
    if (w.revolt[c] > 0.5 && rngNext(w) < 0.002) {
      w.control[c] = own;
      for (const cell of a.cityCells[c]) w.front[cell] = own;
      news(w, own, `Partisans drive the occupiers out of ${a.map.cities[c].name}`, "war", true);
      occupiedShares(w, a, d);
    }
  }
}

export function setOccupation(w: World, city: number, pol: "administer" | "repress" | "expel") {
  w.occupation[city] = pol;
  const ctl = w.control[city];
  if (pol === "expel") {
    for (const n of w.nations) if (n.id !== ctl) nudge(w, n.id, ctl, -10);
    for (const x of w.wars) if (!x.over && x.attackers.includes(ctl)) x.refugees += w.nations[w.owner[city]] ? 200000 : 0;
    news(w, ctl, `${w.nations[ctl]?.name} expels the population of an occupied city`, "war", true);
  }
}

/* ------------------------------------------------------------------ war support and peace */

export function warSupport(w: World, war: War, id: number): number {
  const n = w.nations[id];
  const dead = (war.dead[id] ?? 0) / Math.max(1, n.pop);
  const side = sideOf(war, id);
  const score = side === 0 ? war.score : -war.score;
  // People defending their own country hold on far longer.
  const defending = side === 1 ? 32 : 0;
  const legit = side === 0 ? war.legit / 4 : 10;
  const years = (w.day - Math.max(war.start, -730)) / 365;
  return clamp(42 + defending + legit + score * 0.3 - dead * 4000 - (n.inflation > 0.15 ? 8 : 0) - years * 3 + (n.free < 0.3 ? 18 : 0) - d0(w, id) * 30, 0, 100);
}
/** Occupied share (cached on the war module's last count). */
function d0(w: World, id: number) {
  return OCC[id] ?? 0;
}
const OCC: number[] = [];

/** Would a side accept these terms? */
export function peaceAppeal(w: World, war: War, side: 0 | 1, term: PeaceTerm): number {
  const leader = (side === 0 ? war.attackers : war.defenders)[0];
  const sup = warSupport(w, war, leader);
  const score = side === 0 ? war.score : -war.score;
  const base = (60 - sup) / 50 - score / 50;
  const cost = term === "white" ? (side === 0 ? 0.3 : -0.2) : term === "ceasefire" ? 0 : term === "armistice" ? 0.1 : term === "annex" ? (side === 1 ? 1.2 : -0.6) : side === 1 ? 0.6 : -0.3;
  return base - cost;
}

export function makePeace(w: World, a: Atlas, d: D, war: War, term: PeaceTerm) {
  if (war.actor !== undefined || !war.attackers.length) return;
  const A = war.attackers[0];
  const D2 = war.defenders[0];
  if (term === "ceasefire") {
    war.ceasefire = w.day + 365 * 3;
    w.treaties.push({ id: w.ids++, kind: "ceasefire", a: A, b: D2, since: w.day });
    news(w, A, `Ceasefire in the ${war.name}`, "war", true);
    return;
  }
  war.over = true;
  if (term === "annex") {
    for (let c = 0; c < w.control.length; c++) {
      if (war.defenders.includes(w.owner[c]) && war.attackers.includes(w.control[c])) {
        w.owner[c] = w.control[c];
        for (const cell of a.cityCells[c]) delete w.front[cell];
      }
    }
    news(w, A, `${war.name} ends: ${w.nations[A].name} annexes the territory it holds`, "war", true);
  } else if (term === "white") {
    for (let c = 0; c < w.control.length; c++) if (war.defenders.includes(w.owner[c]) || war.attackers.includes(w.owner[c])) w.control[c] = w.owner[c];
    for (const [k, v] of Object.entries(w.front)) {
      const cell = +k;
      const city = a.cellCity[cell];
      if (city >= 0 && (war.attackers.includes(v) || war.defenders.includes(v))) delete w.front[cell];
    }
    news(w, A, `${war.name} ends with a return to the old borders`, "war", true);
  } else if (term === "status") {
    for (let c = 0; c < w.control.length; c++) if (war.defenders.includes(w.owner[c]) && war.attackers.includes(w.control[c])) w.autonomy[c] = 3;
    news(w, A, `${war.name} ends: occupied regions get a special status`, "war", true);
  } else {
    w.treaties.push({ id: w.ids++, kind: "armistice", a: A, b: D2, since: w.day });
    news(w, A, `Armistice ends the ${war.name}; the line becomes the border in all but name`, "war", true);
  }
  for (const [k, v] of Object.entries(w.blockades)) if (war.attackers.includes(v) || war.defenders.includes(v)) delete w.blockades[+k];
  occupiedShares(w, a, d);
}

/** Total defeat: a country with nothing left is gone; its people pass to the victor. */
export function capitulationCheck(w: World, a: Atlas, d: D, war: War) {
  if (war.actor !== undefined) {
    // An armed group fights on while it holds ground or has fighters.
    const act = w.actors[war.actor];
    const held = w.control.some((c) => c === 1000 + act.id);
    act.strength = Math.max(0, act.strength + act.funding * 0.02 - (held ? 0.005 : 0.03));
    if (!held && act.strength < 4) {
      act.alive = false;
      war.over = true;
      news(w, war.defenders[0], `The ${act.name} is defeated`, "war", true);
    }
    return;
  }
  for (const id of [...war.attackers, ...war.defenders]) {
    const n = w.nations[id];
    if (!n.alive) continue;
    if (d.occupied[id] > 0.97) {
      const victor = war.attackers.includes(id) ? war.defenders[0] : war.attackers[0];
      for (let c = 0; c < w.owner.length; c++) if (w.owner[c] === id) w.owner[c] = victor;
      n.alive = false;
      news(w, victor, `${n.name} has ceased to exist as an independent state`, "war", true);
      war.over = true;
    } else if (warSupport(w, war, id) < 8 && rngNext(w) < 0.02 && id !== w.actor.nation) {
      const side = sideOf(war, id) as 0 | 1;
      const term: PeaceTerm = side === 1 ? (war.claims.length ? "annex" : "armistice") : "white";
      makePeace(w, a, d, war, term);
      news(w, id, `${n.name} sues for peace`, "war", true);
      return;
    }
  }
}

/* ------------------------------------------------------------------ the bomb */

export function nuclearProgramDay(w: World, n: Nation) {
  if (n.mil.program <= 0 || n.mil.program >= 100) return;
  let nuke = 0;
  for (const i of n.research.known) if (TECHS[i]?.field === "nuclear") nuke++;
  n.mil.program = Math.min(100, n.mil.program + (0.01 + nuke * 0.006) * (n.spend.research / Math.max(1, n.gdp) * 200));
  if (n.mil.program >= 100 && n.mil.nukes === 0) {
    n.mil.nukes = 3;
    news(w, n.id, `${n.name} tests a nuclear weapon`, "world", true);
    for (const m of w.nations) if (m.id !== n.id) nudge(w, m.id, n.id, -20);
  }
}

export function startProgram(n: Nation) {
  if (n.mil.program <= 0) n.mil.program = 1;
}

/** Nuclear strike on a city. Returns the toll; soot cools the planet. */
export function nuke(w: World, a: Atlas, d: D, by: number, city: number, warheads = 1): string {
  const me = w.nations[by];
  if (me.mil.nukes < warheads) return "Not enough warheads.";
  me.mil.nukes -= warheads;
  const c = a.map.cities[city];
  const target = w.owner[city];
  const T = w.nations[target];
  const dead = Math.round(Math.min(c.pop * 0.6, c.pop * 0.25 * warheads + 50000 * warheads));
  T.cohorts.forEach((v, i) => (T.cohorts[i] = Math.max(0, v - (dead * v) / Math.max(1, T.pop))));
  T.pop = T.cohorts.reduce((x, y) => x + y, 0);
  w.damage[city] = 1;
  for (let s = 0; s < 6; s++) {
    T.services[SERVICE_IDS[s]].facilities = Math.max(0, T.services[SERVICE_IDS[s]].facilities - w.facilities[city * 6 + s]);
    w.facilities[city * 6 + s] = 0;
  }
  const share = c.pop / Math.max(1, T.pop);
  for (const s of T.sectors) s.damage = clamp(s.damage + share * 1.5, 0, 0.95);
  for (const p of w.plants) if (p.city === city) p.damage = 1;
  w.climate.soot += warheads * (c.pop > 1e6 ? 0.04 : 0.01);
  for (const n of w.nations) if (n.id !== by) nudge(w, n.id, by, -60);
  me.stability -= 10;
  news(w, by, `☢️ ${me.name} strikes ${c.name} with nuclear weapons: ${dead.toLocaleString()} dead`, "war", true);
  // Retaliation: AI follows its doctrine.
  if (target !== w.actor.nation && T.mil.nukes > 0 && T.mil.doctrine !== "nfu" ? true : T.mil.nukes > 0 && target !== w.actor.nation) {
    const back = a.nationCities[by].filter((ci) => w.owner[ci] === by).sort((x, y) => a.map.cities[y].pop - a.map.cities[x].pop)[0];
    if (back !== undefined) {
      T.mil.nukes = Math.max(0, T.mil.nukes - 1);
      const dead2 = Math.round(a.map.cities[back].pop * 0.3);
      me.cohorts.forEach((v, i) => (me.cohorts[i] = Math.max(0, v - (dead2 * v) / Math.max(1, me.pop))));
      w.damage[back] = 1;
      w.climate.soot += 0.04;
      news(w, target, `☢️ ${T.name} retaliates on ${a.map.cities[back].name}`, "war", true);
    }
  }
  void d;
  return `${dead.toLocaleString()} dead in ${c.name}.`;
}

/** The AI's rule for striking first. */
export function aiFirstStrike(w: World, a: Atlas, d: D, n: Nation) {
  if (n.mil.nukes <= 0 || n.id === w.actor.nation || n.mil.doctrine === "nfu") return;
  for (const war of w.wars) {
    if (war.over) continue;
    const side = sideOf(war, n.id);
    if (side < 0) continue;
    const capLost = n.capital >= 0 && w.control[n.capital] !== n.id;
    const existential = capLost || d.occupied[n.id] > 0.4;
    const losing = (side === 0 ? war.score : -war.score) < -50;
    const go = n.mil.firstStrike === "existential" ? existential : n.mil.firstStrike === "losing" ? existential || losing : false;
    if (go && rngNext(w) < 0.02) {
      const enemy = (side === 0 ? war.defenders : war.attackers)[0];
      const city = a.nationCities[enemy].filter((c) => w.owner[c] === enemy).sort((x, y) => a.map.cities[y].pop - a.map.cities[x].pop)[0];
      if (city !== undefined) nuke(w, a, d, n.id, city, 1);
    }
  }
}

export { declareWar as startWar };
export type { Theatre };
