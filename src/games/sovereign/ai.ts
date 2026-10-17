/**
 * The other 180 nations: each runs its economy (taxes, building, the market), keeps an army
 * that fits its means and its fears, makes friends and pacts, joins alliances, picks wars it
 * can win, fights them city by city, and makes peace when it's beaten or tired.
 */
import { ITEMS, UNITS, buildingCost, developCost, type BuildingId, type UnitKind } from "./data";
import { build, canBuild, canDeclare, canTrain, declareWar, develop, improveRelations, joinAlliance, justify, makePeace, order, peaceAcceptable, propose, train, warScore, wouldAccept } from "./actions";
import { atWar, autoTrade, buy, buyPrice } from "./economy";
import { embarked } from "./military";
import { nextId, power, rand, relation, unitCount, type City, type Nation, type State } from "./state";
import type { World } from "./world";

const WAR_CAP = { easy: 3, normal: 6, hard: 10 };

export function aiDay(s: State, world: World) {
  for (const n of s.nations) {
    if (!n.alive || n.id === s.player) continue;
    const t = (s.day + n.id) % 7;
    if (t === 0) economyThink(s, world, n);
    if (t === 3) militaryThink(s, world, n);
    if ((s.day + n.id) % 23 === 0) diplomacyThink(s, world, n);
    if ((s.day + n.id) % 2 === 0 && inWar(s, n.id)) warThink(s, world, n);
    if ((s.day + n.id) % 30 === 0) peaceThink(s, world, n);
    if (n.justify.some((j) => j.days === 0) && (s.day + n.id) % 5 === 0) declareReady(s, n);
    if (s.day >= n.ai.warNext) {
      n.ai.warNext = s.day + 45 + Math.floor(rand(s) * 60);
      aggressionThink(s, world, n);
    }
  }
}

const inWar = (s: State, n: number) => s.wars.some((w) => w.attackers.includes(n) || w.defenders.includes(n));
const mine = (s: State, n: number) => s.cities.filter((c) => c.owner === n);

/* ------------------------------------------------------------------ economy */

function economyThink(s: State, world: World, n: Nation) {
  autoTrade(s, n, true);
  // Buy what the factories and power stations run short of (a month's worth).
  for (const k of ITEMS) {
    const use = (n.last.used[k] ?? 0) - (n.last.produced[k] ?? 0);
    if (use <= 0.05 || n.stock[k] > use * 20) continue;
    const q = use * 30 - n.stock[k];
    if (q > 0 && buyPrice(s, k) * q < n.money * 0.25) buy(s, n, k, q);
  }
  // Taxes: steady the state first, then the books.
  if (n.money < 0) n.tax = Math.min(0.36, n.tax + 0.02);
  else if (n.stability < 42) n.tax = Math.max(0.1, n.tax - 0.02);
  else if (n.money > n.last.income * 200 && n.tax > 0.18) n.tax -= 0.01;
  else if (n.tax < 0.2 && n.stability > 60) n.tax += 0.01;
  if (inWar(s, n.id) && n.economy === "civilian" && n.stability > 45) n.economy = "partial";
  if (!inWar(s, n.id) && n.economy !== "civilian") n.economy = "civilian";

  const cities = mine(s, n.id).filter((c) => !c.build);
  if (!cities.length) return;
  const reserve = Math.max(40, n.last.income * 25);
  let budget = n.money - reserve;
  const tries = Math.min(10, 1 + Math.floor(Math.max(0, n.money - reserve) / 1500) + (n.last.gdp > 300 ? 2 : n.last.gdp > 60 ? 1 : 0));
  for (let k = 0; k < tries && budget > 0; k++) {
    const plan = pickBuild(s, world, n, cities);
    if (!plan) break;
    const cost = plan.b === "develop" ? developCost(plan.c.dev) : buildingCost(plan.b, plan.c.buildings[plan.b] ?? 0);
    if (cost > budget) break;
    const why = plan.b === "develop" ? develop(s, n.id, plan.c.id) : build(s, world, n.id, plan.c.id, plan.b);
    if (why) break;
    budget -= cost;
    cities.splice(cities.indexOf(plan.c), 1);
  }
}

function pickBuild(s: State, world: World, n: Nation, cities: City[]): { c: City; b: BuildingId | "develop" } | null {
  const can = (c: City, b: BuildingId) => !canBuild(s, world, n.id, c.id, b);
  const big = cities.slice().sort((a, b) => b.base * b.dev - a.base * a.dev);
  // 1. Power, if the grid's short.
  if (n.last.powerUse > n.last.power * 0.92) {
    const kind: BuildingId = n.last.gdp > 80 ? "renewable" : "oilPower";
    const c = big.find((x) => can(x, kind)) ?? big.find((x) => can(x, "oilPower"));
    if (c) return { c, b: can(c, kind) ? kind : "oilPower" };
  }
  // 2. Shops empty.
  if (n.last.consumer < 0.92) {
    const c = big.find((x) => can(x, "civilian"));
    if (c) return { c, b: "civilian" };
  }
  // 3. Mines on good deposits.
  const dig = cities.filter((c) => c.deposits.length && can(c, "mine") && (c.buildings.mine ?? 0) < 2 + Math.max(...c.deposits.map((d) => d.rich)) / 2).sort((a, b) => b.deposits.reduce((x, d) => x + d.rich, 0) - a.deposits.reduce((x, d) => x + d.rich, 0));
  if (dig.length && rand(s) < 0.6) return { c: dig[0], b: "mine" };
  // 4. Turn raw stock into goods.
  if (n.stock.iron > 40) {
    const c = big.find((x) => can(x, "steel"));
    if (c) return { c, b: "steel" };
  }
  if (n.stock.copper > 25 && n.stock.gold > 4) {
    const c = big.find((x) => can(x, "electronics"));
    if (c) return { c, b: "electronics" };
  }
  if (n.stock.steel > 30 && n.stock.aluminium > 20) {
    const c = big.find((x) => can(x, "motor"));
    if (c) return { c, b: "motor" };
  }
  // 5. Arms for the ambitious and the threatened.
  const arms = cities.reduce((a, c) => a + (c.buildings.arms ?? 0), 0);
  if ((n.ai.aggression > 0.4 || inWar(s, n.id)) && arms < 1 + n.last.gdp / 80) {
    const c = big.find((x) => can(x, "arms"));
    if (c) return { c, b: "arms" };
  }
  // 6. Grow the cities.
  const dev = big.filter((c) => !canDevelopQuick(s, n, c)).slice(0, 4);
  if (dev.length && rand(s) < 0.7) return { c: dev[Math.floor(rand(s) * dev.length)], b: "develop" };
  // 7. Ports, air bases, forts on threatened borders.
  if (rand(s) < 0.3) {
    const c = big.find((x) => world.cities[x.id].coastal && can(x, "port") && !(x.buildings.port ?? 0));
    if (c) return { c, b: "port" };
  }
  if (inWar(s, n.id)) {
    const front = cities.filter((c) => world.cities[c.id].near.some((o) => atWar(s, n.id, s.cities[o].owner)) && can(c, "fort"));
    if (front.length) return { c: front[0], b: "fort" };
  }
  const c = big.find((x) => can(x, "civilian"));
  return c && rand(s) < 0.4 ? { c, b: "civilian" } : null;
}
function canDevelopQuick(s: State, n: Nation, c: City) {
  return c.build || c.dev >= 10 || n.money < developCost(c.dev) ? "no" : null;
}

/* ------------------------------------------------------------------ the army */

function militaryThink(s: State, world: World, n: Nation) {
  const cities = mine(s, n.id);
  if (!cities.length) return;
  let land = 0;
  let sea = 0;
  let air = 0;
  for (const a of s.armies) {
    if (a.owner !== n.id) continue;
    const d = UNITS[a.kind].domain;
    if (d === "land") land += unitCount(a);
    else if (d === "sea") sea += unitCount(a);
    else if (d === "air") air += unitCount(a);
  }
  const war = inWar(s, n.id);
  const threatened = n.justify.length > 0 || s.nations.some((o) => o.alive && o.justify.some((j) => j.target === n.id));
  // A share of the tax take goes on the forces: more when threatened, most at war.
  const gross = n.last.tax + n.last.trade;
  const share = (war ? 0.75 : threatened ? 0.5 : 0.3 + n.ai.aggression * 0.2) * (s.difficulty === "hard" ? 1.2 : s.difficulty === "easy" ? 0.8 : 1);
  let upkeep = 0;
  for (const a of s.armies) if (a.owner === n.id) upkeep += UNITS[a.kind].upkeep * unitCount(a);
  if (upkeep >= gross * share || n.money < 60) return;
  const want = land + Math.ceil((gross * share - upkeep) / 0.3);
  let budget = n.money * (war ? 0.6 : 0.4);
  // Train at the cities nearest trouble: the border, or the capital.
  const border = cities.filter((c) => world.cities[c.id].near.some((o) => s.cities[o].owner !== n.id));
  const spots = (border.length ? border : cities).sort((a, b) => a.queue.length - b.queue.length);
  const mix: UnitKind[] = ["infantry", "infantry", "tank", "infantry", "artillery", "antiair", "tank", "infantry"];
  const most = Math.min(40, 4 + Math.floor(n.last.gdp / 100));
  for (let k = 0; k < most && budget > 30 && land < want; k++) {
    let kind = mix[(s.day + k + n.id) % mix.length];
    const c = spots[k % spots.length];
    if (canTrain(s, world, n.id, c.id, kind)) kind = "infantry";
    const where = canTrain(s, world, n.id, c.id, kind) ? cities.find((x) => !canTrain(s, world, n.id, x.id, kind)) : c;
    if (!where || train(s, world, n.id, where.id, kind)) continue;
    budget -= UNITS[kind].cost;
    land++;
  }
  // A fleet and an air force for the rich.
  if (n.last.gdp > 120 && sea < n.last.gdp / 90 && budget > 300) {
    const yard = cities.find((c) => !canTrain(s, world, n.id, c.id, "destroyer"));
    if (yard) train(s, world, n.id, yard.id, rand(s) < 0.5 ? "destroyer" : "submarine");
  }
  if (n.last.gdp > 60 && air < n.last.gdp / 50 && budget > 250) {
    const kind: UnitKind = rand(s) < 0.65 ? "fighter" : "bomber";
    const base = cities.find((c) => !canTrain(s, world, n.id, c.id, kind));
    if (base) train(s, world, n.id, base.id, kind);
  }
}

/* ------------------------------------------------------------------ friends */

function diplomacyThink(s: State, world: World, n: Nation) {
  const others = s.nations.filter((o) => o.alive && o.id !== n.id);
  // Warm up to a strong neighbour or a like-minded one.
  const neighbours = new Set<number>();
  for (const c of mine(s, n.id)) for (const o of world.cities[c.id].near) if (s.cities[o].owner !== n.id) neighbours.add(s.cities[o].owner);
  const friend = [...neighbours].map((i) => s.nations[i]).sort((a, b) => b.last.gdp - a.last.gdp)[0];
  if (friend && relation(s, n.id, friend.id) < 30 && n.money > n.last.income * 30 && rand(s) < 0.5) improveRelations(s, n.id, friend.id);
  // Pacts with neighbours they get on with.
  for (const i of neighbours) {
    if ((n.nap[i] ?? 0) > s.day || i === s.player) continue;
    // Pacts mostly with a stronger neighbour you'd rather not fight.
    if (!wouldAccept(s, n.id, i, "nap") && relation(s, n.id, i) > 40 && power(s, i) > power(s, n.id) * 1.3 && rand(s) < 0.15) propose(s, n.id, i, "nap");
  }
  // Trade with friends.
  if (n.trade.length < 4) {
    const t = others.filter((o) => o.id !== s.player && !n.trade.includes(o.id) && relation(s, n.id, o.id) > 25).sort((a, b) => b.last.gdp - a.last.gdp)[0];
    if (t && rand(s) < 0.4) propose(s, n.id, t.id, "trade");
  }
  // Alliances: join a friendly one nearby.
  if (n.alliance < 0 && rand(s) < 0.25) {
    for (const al of s.alliances) {
      if (al.leader === s.player) continue;
      if (!wouldAccept(s, n.id, al.leader, "alliance") && al.members.some((m) => neighbours.has(m) || relation(s, n.id, m) > 55)) {
        joinAlliance(s, n.id, al.id);
        break;
      }
    }
  }
  // Ask the player for things, now and then.
  if (rand(s) < 0.05 && relation(s, n.id, s.player) > 30) {
    const kind = relation(s, n.id, s.player) > 60 && n.alliance < 0 ? "alliance" : !(n.trade.includes(s.player)) ? "trade" : (n.nap[s.player] ?? 0) < s.day ? "nap" : null;
    if (kind && !s.offers.some((o) => o.from === n.id && o.kind === kind)) s.offers.push({ id: nextId(s), from: n.id, kind, day: s.day });
  }
}

/* ------------------------------------------------------------------ choosing a war */

/** Finish what's started: declare once the justification's ready. */
function declareReady(s: State, n: Nation) {
  if (n.overlord >= 0) return;
  for (const j of [...n.justify]) {
    if (j.days > 0 || canDeclare(s, n.id, j.target)) continue;
    // The bold go in even; the cautious want an edge.
    if (strengthRatio(s, n.id, j.target) > 0.9 + (1 - n.ai.aggression) * 0.35) declareWar(s, n.id, j.target);
  }
}

function aggressionThink(s: State, world: World, n: Nation) {
  if (n.overlord >= 0) return;
  if (inWar(s, n.id) || n.justify.length) return;
  const active = s.wars.filter((w) => w.attackers[0] !== s.player).length;
  if (active >= WAR_CAP[s.difficulty]) return;
  // Grace for the player's first months.
  const chance = n.ai.aggression * (s.difficulty === "hard" ? 0.8 : s.difficulty === "easy" ? 0.25 : 0.5);
  if (rand(s) > chance) return;
  const targets = new Set<number>();
  for (const c of mine(s, n.id)) for (const o of world.cities[c.id].near) if (s.cities[o].owner !== n.id) targets.add(s.cities[o].owner);
  let best = -1;
  let bestScore = 0;
  for (const t of targets) {
    if (t === s.player && s.day < 240) continue;
    const r = relation(s, n.id, t);
    if (r > (n.ai.aggression > 0.6 ? 45 : 25)) continue;
    if ((n.nap[t] ?? 0) > s.day) continue;
    const ratio = strengthRatio(s, n.id, t);
    if (ratio < 1.5) continue;
    const score = ratio - r / 50 + rand(s);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best >= 0) justify(s, n.id, best);
}

/** Our side's strength against theirs and everyone who'd defend them. */
function strengthRatio(s: State, n: number, t: number) {
  const me = power(s, n) + 1;
  let them = power(s, t) + 1;
  const al = s.alliances.find((a) => a.id === s.nations[t].alliance);
  if (al) for (const m of al.members) if (m !== t && m !== n) them += power(s, m) * 0.6;
  for (const o of s.nations) if (o.alive && o.overlord === t) them += power(s, o.id);
  return me / them;
}

/* ------------------------------------------------------------------ fighting */

function warThink(s: State, world: World, n: Nation) {
  const enemies = new Set<number>();
  for (const w of s.wars) {
    if (w.attackers.includes(n.id)) w.defenders.forEach((d) => enemies.add(d));
    else if (w.defenders.includes(n.id)) w.attackers.forEach((d) => enemies.add(d));
  }
  if (!enemies.size) return;
  const myCities = mine(s, n.id);
  // Targets: enemy cities next to ours (the front), else their nearest.
  const front = new Set<number>();
  for (const c of myCities) for (const o of world.cities[c.id].near) if (enemies.has(s.cities[o].owner)) front.add(o);
  let targets = [...front];
  if (!targets.length) {
    const cap = world.cities[n.capital];
    targets = s.cities.filter((c) => enemies.has(c.owner)).sort((a, b) => dist(world, a.id, cap) - dist(world, b.id, cap)).slice(0, 4).map((c) => c.id);
  }
  // Own cities under siege come first.
  const sieged = myCities.filter((c) => c.capture && enemies.has(c.capture.by)).map((c) => c.id);
  let paths = 0;
  const garrison = s.armies.find((a) => a.owner === n.id && UNITS[a.kind].domain === "land" && Math.hypot(a.x - world.cities[n.capital].x, a.y - world.cities[n.capital].y) < 4);
  for (const a of s.armies) {
    if (a.owner !== n.id || a.path.length || paths > 6) continue;
    const d = UNITS[a.kind].domain;
    if (d === "air") {
      const t = targets[Math.floor(rand(s) * targets.length)];
      if (t !== undefined && !a.order) order(s, world, n.id, [a.id], world.cities[t].x, world.cities[t].y);
      continue;
    }
    if (d !== "land" || a === garrison || embarked(world, a)) continue;
    const goal = sieged.length ? sieged[0] : pickTarget(s, world, a.x, a.y, targets);
    if (goal < 0) continue;
    const wc = world.cities[goal];
    if (Math.hypot(wc.x - a.x, wc.y - a.y) < 3) continue;
    paths++;
    order(s, world, n.id, [a.id], wc.x + (rand(s) - 0.5) * 2, wc.y + (rand(s) - 0.5) * 2);
  }
}

function dist(world: World, id: number, p: { x: number; y: number }) {
  const c = world.cities[id];
  return Math.hypot(c.x - p.x, c.y - p.y);
}
function pickTarget(s: State, world: World, x: number, y: number, targets: number[]) {
  let best = -1;
  let bd = Infinity;
  for (const t of targets) {
    const c = world.cities[t];
    // Prefer near, small and lightly held.
    const d = Math.hypot(c.x - x, c.y - y) * (1 + (s.cities[t].buildings.fort ?? 0) * 0.4) * (1 + Math.sqrt(s.cities[t].pop / 1e6) * 0.15);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ peace */

function peaceThink(s: State, world: World, n: Nation) {
  for (const w of [...s.wars]) {
    const leadA = w.attackers[0] === n.id;
    const leadD = w.defenders[0] === n.id;
    if (!leadA && !leadD) continue;
    const score = leadA ? warScore(s, w) : -warScore(s, w);
    const other = leadA ? w.defenders[0] : w.attackers[0];
    const age = s.day - w.start;
    // Winning big: take the surrender. Stalemate or losing and tired: settle.
    let terms: "status" | "return" | "subjugate" | null = null;
    if (score > 60) terms = "subjugate";
    else if (score > 20 && age > 160) terms = "status";
    else if (score < -30 || n.exhaustion > 60 || (age > 420 && Math.abs(score) < 15)) terms = score < -45 ? "return" : "status";
    if (!terms) continue;
    if (other === s.player) {
      if (!s.offers.some((o) => o.kind === "peace" && o.warId === w.id)) s.offers.push({ id: nextId(s), from: n.id, kind: "peace", warId: w.id, terms, day: s.day });
      continue;
    }
    if (!peaceAcceptable(s, w, n.id, terms)) makePeace(s, world, w.id, n.id, terms);
  }
}
