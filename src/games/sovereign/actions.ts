/**
 * Everything a nation can do, for the player and the AI alike. Each returns null on success or
 * a short reason it can't be done.
 */
import {
  BUILDINGS,
  FORMABLES,
  IDEOLOGIES,
  MAX_DEV,
  UNITS,
  buildingCost,
  developCost,
  type BuildingId,
  type ConscriptionId,
  type EconomyLawId,
  type FormableDef,
  type IdeologyId,
  type ItemId,
  type UnitKind,
} from "./data";
import { atWar } from "./economy";
import { capitulate, endEmptyWars, leaveAlliance } from "./military";
import { findPath, passable } from "./path";
import { addRelation, clamp, nextId, relation, say, type Army, type City, type Nation, type State, type War } from "./state";
import { kmBetween, type World } from "./world";

const fmt = (m: number) => (m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${Math.round(m)}M`);

/* ------------------------------------------------------------------ building */

export function canBuild(s: State, world: World, n: number, cityId: number, b: BuildingId) {
  const c = s.cities[cityId];
  if (c.owner !== n) return "Not your city";
  if (c.build) return "Already building something here";
  const def = BUILDINGS[b];
  const lv = c.buildings[b] ?? 0;
  if (lv >= def.max) return "Fully built";
  if (def.needs === "coast" && !world.cities[cityId].coastal) return "Needs a coast";
  if (def.needs === "deposit" && !c.deposits.length) return "No deposits here";
  if (s.nations[n].money < buildingCost(b, lv)) return `Needs ${fmt(buildingCost(b, lv))}`;
  return null;
}

export function build(s: State, world: World, n: number, cityId: number, b: BuildingId) {
  const why = canBuild(s, world, n, cityId, b);
  if (why) return why;
  const c = s.cities[cityId];
  const cost = buildingCost(b, c.buildings[b] ?? 0);
  s.nations[n].money -= cost;
  c.build = { id: b, days: BUILDINGS[b].days, total: BUILDINGS[b].days };
  return null;
}

export function canDevelop(s: State, n: number, cityId: number) {
  const c = s.cities[cityId];
  if (c.owner !== n) return "Not your city";
  if (c.build) return "Already building something here";
  if (c.dev >= MAX_DEV) return "Fully developed";
  if (s.nations[n].money < developCost(c.dev)) return `Needs ${fmt(developCost(c.dev))}`;
  return null;
}

export function develop(s: State, n: number, cityId: number) {
  const why = canDevelop(s, n, cityId);
  if (why) return why;
  const c = s.cities[cityId];
  s.nations[n].money -= developCost(c.dev);
  c.build = { id: "develop", days: 18 + c.dev * 3, total: 18 + c.dev * 3 };
  return null;
}

/** Stop work: half the money back. */
export function cancelBuild(s: State, n: number, cityId: number) {
  const c = s.cities[cityId];
  if (c.owner !== n || !c.build) return "Nothing to cancel";
  const cost = c.build.id === "develop" ? developCost(c.dev) : buildingCost(c.build.id, c.buildings[c.build.id] ?? 0);
  s.nations[n].money += cost * 0.5 * (c.build.days / c.build.total);
  c.build = null;
  return null;
}

/* ------------------------------------------------------------------ training */

export function canTrain(s: State, world: World, n: number, cityId: number, kind: UnitKind) {
  const c = s.cities[cityId];
  const nat = s.nations[n];
  const d = UNITS[kind];
  if (c.owner !== n) return "Not your city";
  if (c.queue.length >= 6) return "Training queue full";
  if (d.needs && !(c.buildings[d.needs] ?? 0)) return `Needs a ${BUILDINGS[d.needs].name.toLowerCase()} here`;
  if (d.domain === "air" && !(c.buildings.airport ?? 0)) return "Needs an air base here";
  if (d.domain === "sea" && !world.cities[cityId].coastal) return "Needs a coast";
  if (kind === "nuke" && !nat.nuclear) return "Needs a nuclear programme";
  if (nat.money < d.cost) return `Needs ${fmt(d.cost)}`;
  if (nat.manpower < d.manpower) return "Not enough manpower";
  for (const [k, q] of Object.entries(d.items ?? {}) as [ItemId, number][]) if (nat.stock[k] < q) return `Needs ${q} ${k === "motorParts" ? "motor parts" : k}`;
  if (d.domain === "air") {
    const based = s.armies.filter((a) => a.base === cityId && a.owner === n).reduce((a, b) => a + b.hp / UNITS[b.kind].hp, 0);
    if (based + 1 > (c.buildings.airport ?? 0) * 8) return "Air base full: build it up";
  }
  return null;
}

export function train(s: State, world: World, n: number, cityId: number, kind: UnitKind) {
  const why = canTrain(s, world, n, cityId, kind);
  if (why) return why;
  const nat = s.nations[n];
  const d = UNITS[kind];
  nat.money -= d.cost;
  nat.manpower -= d.manpower;
  for (const [k, q] of Object.entries(d.items ?? {}) as [ItemId, number][]) nat.stock[k] -= q;
  s.cities[cityId].queue.push({ kind, days: d.days, total: d.days });
  return null;
}

/* ------------------------------------------------------------------ orders */

/** Send units somewhere: land and sea units find a path; aircraft fly a patrol or strike there. */
export function order(s: State, world: World, n: number, ids: number[], x: number, y: number) {
  const ok = passable(s, n, (a, b) => atWar(s, a, b));
  let moved = 0;
  let why: string | null = null;
  for (const id of ids) {
    const a = s.armies.find((x) => x.id === id);
    if (!a || a.owner !== n) continue;
    const d = UNITS[a.kind];
    if (d.domain === "strike") continue;
    if (d.domain === "air") {
      const base = world.cities[a.base];
      if (base && kmBetween(world, base.x, base.y, x, y) > (d.range ?? 0)) {
        why = `Out of range of the base (${d.range} km)`;
        continue;
      }
      a.order = { kind: a.kind === "bomber" ? "strike" : "patrol", x, y };
      moved++;
      continue;
    }
    const path = findPath(s, world, a.x, a.y, x, y, d.domain === "sea" ? "sea" : "land", ok);
    if (!path) {
      why = d.domain === "sea" ? "Ships can't get there" : "No way there: you need military access, an alliance or a war";
      continue;
    }
    a.path = path;
    a.order = { kind: "move", x, y };
    moved++;
  }
  return moved ? null : (why ?? "Nothing to move");
}

export function stop(s: State, n: number, ids: number[]) {
  for (const a of s.armies) if (ids.includes(a.id) && a.owner === n) {
    a.path = [];
    a.order = null;
  }
}

/** Split a stack in two. */
export function split(s: State, n: number, id: number) {
  const a = s.armies.find((x) => x.id === id);
  if (!a || a.owner !== n) return "Not yours";
  const per = UNITS[a.kind].hp;
  if (a.hp < per * 1.5) return "Too small to split";
  const half = Math.floor(a.hp / per / 2) * per;
  a.hp -= half;
  const b: Army = { ...a, id: nextId(s), hp: half, path: [], order: null, x: a.x + 0.8, y: a.y + 0.8 };
  s.armies.push(b);
  return null;
}

/** Merge stacks of the same kind that stand together. */
export function merge(s: State, n: number, ids: number[]) {
  const list = s.armies.filter((a) => ids.includes(a.id) && a.owner === n);
  let merged = 0;
  for (const a of list) {
    if (a.hp <= 0) continue;
    for (const b of list) {
      if (b === a || b.hp <= 0 || b.kind !== a.kind || Math.hypot(a.x - b.x, a.y - b.y) > 4) continue;
      a.hp += b.hp;
      b.hp = 0;
      merged++;
    }
  }
  s.armies = s.armies.filter((a) => a.hp > 0);
  return merged ? null : "Stand them together first (same kind)";
}

export function disband(s: State, n: number, ids: number[]) {
  const nat = s.nations[n];
  for (const a of s.armies) if (ids.includes(a.id) && a.owner === n) {
    nat.manpower += (a.hp / UNITS[a.kind].hp) * UNITS[a.kind].manpower * 0.7;
    a.hp = 0;
  }
  s.armies = s.armies.filter((a) => a.hp > 0);
  return null;
}

/* ------------------------------------------------------------------ laws and government */

export function setTax(s: State, n: number, tax: number) {
  s.nations[n].tax = clamp(Math.round(tax * 100) / 100, 0.05, 0.6);
}
export function setConscription(s: State, n: number, c: ConscriptionId) {
  s.nations[n].conscription = c;
}
export function setEconomy(s: State, n: number, e: EconomyLawId) {
  s.nations[n].economy = e;
}

/** Change government: two months of upheaval. */
export function changeGovernment(s: State, n: number, to: IdeologyId) {
  const nat = s.nations[n];
  if (nat.ideology === to) return "That's your government already";
  if (nat.transition) return "Already changing government";
  if (nat.stability < 25) return "Too unstable to reform (25% stability needed)";
  nat.transition = { to, days: 60 };
  nat.stability = Math.max(0, nat.stability - 10);
  for (const o of s.nations) {
    if (!o.alive || o.id === n) continue;
    if (o.ideology === to) addRelation(s, n, o.id, 12);
    else if (o.ideology === nat.ideology) addRelation(s, n, o.id, -10);
  }
  say(s, `${nat.name} is becoming a ${IDEOLOGIES[to].name.toLowerCase()}.`, "world", [n]);
  return null;
}

export const NUCLEAR_COST = 9000;
export function startNuclear(s: State, n: number) {
  const nat = s.nations[n];
  if (nat.nuclear) return "You already have one";
  if (nat.nuclearDays > 0) return "Already under way";
  if (nat.money < NUCLEAR_COST) return `Needs ${fmt(NUCLEAR_COST)}`;
  if (nat.stock.uranium < 30) return "Needs 30 uranium";
  nat.money -= NUCLEAR_COST;
  nat.stock.uranium -= 30;
  nat.nuclearDays = 540;
  for (const o of s.nations) if (o.alive && o.id !== n) addRelation(s, n, o.id, -8);
  say(s, `${nat.name} has started a nuclear weapons programme.`, "world", [n]);
  return null;
}

/* ------------------------------------------------------------------ diplomacy */

export const RELATIONS_COST = 40;

export function improveRelations(s: State, n: number, t: number) {
  const nat = s.nations[n];
  if ((nat.cooldown[t] ?? 0) > s.day) return `Again in ${nat.cooldown[t] - s.day} days`;
  if (atWar(s, n, t)) return "You're at war";
  const cost = RELATIONS_COST + nat.last.gdp * 0.5;
  if (nat.money < cost) return `Needs ${fmt(cost)}`;
  nat.money -= cost;
  addRelation(s, n, t, 12);
  nat.cooldown[t] = s.day + 30;
  return null;
}

export function denounce(s: State, n: number, t: number) {
  addRelation(s, n, t, -25);
  s.nations[n].mods.push({ text: "Rallied against a rival", stability: 3, gdp: 0, days: 60 });
  say(s, `${s.nations[n].name} has denounced ${s.nations[t].name}.`, "world", [n, t]);
  return null;
}

export type Proposal = "nap" | "access" | "trade" | "alliance" | "puppet";

/** Would an AI nation say yes? (and why not) */
export function wouldAccept(s: State, from: number, to: number, kind: Proposal): string | null {
  const r = relation(s, from, to);
  const a = s.nations[from];
  const b = s.nations[to];
  if (atWar(s, from, to)) return "You're at war";
  if (kind === "nap") return r >= 0 ? null : "They don't trust you (relations below 0)";
  if (kind === "trade") return r >= 10 ? null : "Relations need to be 10 or better";
  if (kind === "access") return r >= 35 || (a.alliance >= 0 && a.alliance === b.alliance) ? null : "Relations need to be 35 or better";
  if (kind === "alliance") {
    if (b.alliance >= 0 && b.alliance !== a.alliance) return "They're in another alliance";
    const same = a.ideology === b.ideology ? 15 : 0;
    return r + same >= 50 ? null : "Relations need to be 50 or better (35 with a like government)";
  }
  if (kind === "puppet") return "They'd never agree in peacetime";
  return null;
}

export function propose(s: State, n: number, t: number, kind: Proposal) {
  const why = t === s.player ? null : wouldAccept(s, n, t, kind);
  if (why) return why;
  const a = s.nations[n];
  const b = s.nations[t];
  if (kind === "nap") {
    a.nap[t] = b.nap[n] = s.day + 730;
    say(s, `${a.name} and ${b.name} have signed a non-aggression pact.`, "peace", [n, t]);
  } else if (kind === "trade") {
    if (!a.trade.includes(t)) a.trade.push(t);
    if (!b.trade.includes(n)) b.trade.push(n);
    addRelation(s, n, t, 5);
    say(s, `${a.name} and ${b.name} have agreed a trade deal.`, "good", [n, t]);
  } else if (kind === "access") {
    if (!a.access.includes(t)) a.access.push(t);
    say(s, `${b.name} gives ${a.name} military access.`, "info", [n, t]);
  } else if (kind === "alliance") {
    let al = s.alliances.find((x) => x.id === a.alliance);
    if (!al) {
      al = { id: nextId(s), name: `${a.name} Pact`, leader: n, members: [n], color: a.color };
      s.alliances.push(al);
      a.alliance = al.id;
    }
    if (b.alliance >= 0) leaveAlliance(s, t);
    al.members.push(t);
    b.alliance = al.id;
    addRelation(s, n, t, 15);
    say(s, `${b.name} has joined the ${al.name}.`, "good", [n, t]);
  }
  return null;
}

export function createAlliance(s: State, n: number, name: string) {
  const a = s.nations[n];
  if (a.alliance >= 0) leaveAlliance(s, n);
  const al = { id: nextId(s), name: name.trim().slice(0, 40) || `${a.name} Pact`, leader: n, members: [n], color: a.color };
  s.alliances.push(al);
  a.alliance = al.id;
  say(s, `${a.name} has founded the ${al.name}.`, "world", [n]);
  return null;
}

/** Ask to join an alliance; its leader decides. */
export function joinAlliance(s: State, n: number, id: number) {
  const al = s.alliances.find((x) => x.id === id);
  if (!al) return "No such alliance";
  if (s.nations[n].alliance === id) return "You're in it";
  const why = al.leader === s.player ? null : wouldAccept(s, n, al.leader, "alliance");
  if (why) return why;
  if (s.nations[n].alliance >= 0) leaveAlliance(s, n);
  al.members.push(n);
  s.nations[n].alliance = id;
  for (const m of al.members) if (m !== n) addRelation(s, n, m, 10);
  say(s, `${s.nations[n].name} has joined the ${al.name}.`, "good", [n, al.leader]);
  return null;
}

export function cancelTreaty(s: State, n: number, t: number, kind: "nap" | "trade" | "access") {
  const a = s.nations[n];
  const b = s.nations[t];
  if (kind === "nap") {
    delete a.nap[t];
    delete b.nap[n];
  } else if (kind === "trade") {
    a.trade = a.trade.filter((x) => x !== t);
    b.trade = b.trade.filter((x) => x !== n);
  } else a.access = a.access.filter((x) => x !== t);
  addRelation(s, n, t, -10);
  return null;
}

/* ------------------------------------------------------------------ war */

export function justifyDays(s: State, n: number, t: number) {
  const nat = s.nations[n];
  const size = s.cities.filter((c) => c.owner === t).length;
  return Math.round(clamp((22 + size * 0.7 + (s.nations[t].ideology === "democracy" ? 8 : 0)) * IDEOLOGIES[nat.ideology].justify, 14, 140));
}

export function canJustify(s: State, n: number, t: number) {
  const a = s.nations[n];
  const b = s.nations[t];
  if (n === t || !b.alive) return "Not a target";
  if (atWar(s, n, t)) return "Already at war";
  if (a.alliance >= 0 && a.alliance === b.alliance) return "They're your ally";
  if (a.overlord === t || b.overlord === n) return "They're your overlord or subject";
  if (a.overlord >= 0) return "Your overlord decides your wars";
  if ((a.nap[t] ?? 0) > s.day) return "You have a non-aggression pact (cancel it first)";
  if (a.justify.some((j) => j.target === t)) return "Already justified or under way";
  return null;
}

export function justify(s: State, n: number, t: number) {
  const why = canJustify(s, n, t);
  if (why) return why;
  const days = justifyDays(s, n, t);
  s.nations[n].justify.push({ target: t, days, total: days, ready: 0 });
  s.nations[n].stability = Math.max(0, s.nations[n].stability - 2);
  addRelation(s, n, t, -25);
  for (const o of s.nations) if (o.alive && o.alliance >= 0 && o.alliance === s.nations[t].alliance && o.id !== t) addRelation(s, n, o.id, -6);
  if (t === s.player) say(s, `${s.nations[n].name} is justifying a war against you!`, "war", [n, t]);
  return null;
}

export function canDeclare(s: State, n: number, t: number) {
  if (atWar(s, n, t)) return "Already at war";
  const j = s.nations[n].justify.find((x) => x.target === t);
  if (!j) return "Justify a war first";
  if (j.days > 0) return `Justified in ${j.days} days`;
  if ((s.nations[n].nap[t] ?? 0) > s.day) return "You have a non-aggression pact";
  return null;
}

/** Everyone who'd come with a nation into a war: its subjects (and for defenders, its whole alliance). */
function sideOf(s: State, n: number, defending: boolean, against: number) {
  const out = new Set<number>([n]);
  for (const o of s.nations) if (o.alive && o.overlord === n) out.add(o.id);
  const al = s.alliances.find((x) => x.id === s.nations[n].alliance);
  if (al)
    for (const m of al.members) {
      if (m === against || s.nations[m].alliance === s.nations[against].alliance) continue;
      // Allies always defend; on the attack they come if they also dislike the target.
      if (defending || (m !== s.player && relation(s, m, against) < -10) ) out.add(m);
    }
  return [...out];
}

export function declareWar(s: State, n: number, t: number) {
  const why = canDeclare(s, n, t);
  if (why) return why;
  const a = s.nations[n];
  const b = s.nations[t];
  a.justify = a.justify.filter((x) => x.target !== t);
  const defenders = sideOf(s, t, true, n);
  const attackers = sideOf(s, n, false, t).filter((x) => !defenders.includes(x));
  const w: War = { id: nextId(s), name: `${a.name}–${b.name} War`, attackers, defenders, start: s.day, lossA: 0, lossD: 0 };
  s.wars.push(w);
  for (const x of attackers) for (const y of defenders) addRelation(s, x, y, -50);
  // Pacts and trade end.
  for (const x of attackers)
    for (const y of defenders) {
      cancelTreaty(s, x, y, "trade");
      delete s.nations[x].nap[y];
      delete s.nations[y].nap[x];
    }
  const joined = [...attackers.filter((x) => x !== n), ...defenders.filter((x) => x !== t)].map((x) => s.nations[x].name);
  say(s, `${a.name} has declared war on ${b.name}!${joined.length ? ` Joining: ${joined.slice(0, 6).join(", ")}${joined.length > 6 ? "…" : ""}.` : ""}`, "war", [...attackers, ...defenders]);
  return null;
}

/** Join a war an ally (or your overlord) is fighting. */
export function joinWar(s: State, n: number, warId: number, side: "attackers" | "defenders") {
  const w = s.wars.find((x) => x.id === warId);
  if (!w) return "No such war";
  if (w.attackers.includes(n) || w.defenders.includes(n)) return "You're in it";
  const other = side === "attackers" ? w.defenders : w.attackers;
  if (other.some((x) => s.nations[x].alliance >= 0 && s.nations[x].alliance === s.nations[n].alliance)) return "Your allies are on the other side";
  w[side].push(n);
  for (const o of other) addRelation(s, n, o, -50);
  say(s, `${s.nations[n].name} has joined the ${w.name}.`, "war", [n]);
  return null;
}

/** How the war is going for its attackers, -100..100: land taken, and blood. */
export function warScore(s: State, w: War) {
  let took = 0;
  let lost = 0;
  for (const c of s.cities) {
    const v = Math.sqrt(c.pop / 1e5) + 1;
    if (w.defenders.includes(c.core) && w.attackers.includes(c.owner)) took += v;
    if (w.attackers.includes(c.core) && w.defenders.includes(c.owner)) lost += v;
  }
  const totalD = s.cities.filter((c) => w.defenders.includes(c.core)).reduce((a, c) => a + Math.sqrt(c.pop / 1e5) + 1, 0) || 1;
  const totalA = s.cities.filter((c) => w.attackers.includes(c.core)).reduce((a, c) => a + Math.sqrt(c.pop / 1e5) + 1, 0) || 1;
  const land = (took / totalD - lost / totalA) * 140;
  const blood = ((w.lossD - w.lossA) / Math.max(20000, w.lossA + w.lossD)) * 30;
  return clamp(land + blood, -100, 100);
}

export type PeaceTerms = "status" | "return" | "subjugate";

/** Would the other side take these terms? (from the point of view of `n`'s side) */
export function peaceAcceptable(s: State, w: War, n: number, terms: PeaceTerms) {
  const attacker = w.attackers.includes(n);
  const mine = attacker ? warScore(s, w) : -warScore(s, w);
  const other = attacker ? w.defenders[0] : w.attackers[0];
  const age = s.day - w.start;
  const tired = s.nations[other].exhaustion;
  if (terms === "return") return mine < 25 || tired > 55 || age > 600 ? null : "They're winning: they won't give anything back";
  if (terms === "status") return mine > 15 || (age > 120 && mine > -10) || tired > 45 ? null : mine < -10 ? "They're winning and want more" : "They'll fight on for now (try again later)";
  // Subjugation: only for a beaten enemy.
  const capital = s.nations[other].capital;
  const capLost = s.cities[capital] && s.cities[capital].owner !== other;
  return mine > 55 || (capLost && mine > 30) ? null : "They aren't beaten enough to submit";
}

export function makePeace(s: State, world: World, warId: number, n: number, terms: PeaceTerms) {
  const w = s.wars.find((x) => x.id === warId);
  if (!w) return "No such war";
  const lead = w.attackers[0] === n || w.defenders[0] === n;
  if (!lead) return "Only the war leaders can make peace";
  const attacker = w.attackers.includes(n);
  const other = attacker ? w.defenders[0] : w.attackers[0];
  if (other !== s.player) {
    const why = peaceAcceptable(s, w, n, terms);
    if (why) return why;
  }
  const mySide = attacker ? w.attackers : w.defenders;
  const theirSide = attacker ? w.defenders : w.attackers;
  if (terms === "return") {
    for (const c of s.cities) {
      if (mySide.includes(c.owner) && theirSide.includes(c.core)) c.owner = c.core;
      else if (theirSide.includes(c.owner) && mySide.includes(c.core)) c.owner = c.core;
    }
  }
  s.wars = s.wars.filter((x) => x !== w);
  if (terms === "subjugate") capitulate(s, world, other, n);
  for (const x of w.attackers) for (const y of w.defenders) addRelation(s, x, y, 25);
  say(s, `Peace: the ${w.name} is over${terms === "return" ? " (everything goes back)" : terms === "subjugate" ? `, and ${s.nations[other].name} submits to ${s.nations[n].name}` : ""}.`, "peace", [...w.attackers, ...w.defenders]);
  endEmptyWars(s);
  // Armies left on land they may no longer enter go home.
  sendHome(s, world, [...w.attackers, ...w.defenders]);
  return null;
}

function sendHome(s: State, world: World, nations: number[]) {
  for (const a of s.armies) {
    if (!nations.includes(a.owner) || UNITS[a.kind].domain !== "land") continue;
    const ci = world.cities.length ? cityIdAt(world, a.x, a.y) : -1;
    if (ci < 0) continue;
    const owner = s.cities[ci].owner;
    const me = s.nations[a.owner];
    if (owner === a.owner || (me.alliance >= 0 && s.nations[owner].alliance === me.alliance) || me.access.includes(owner)) continue;
    const cap = world.cities[me.capital];
    if (cap) {
      a.x = cap.x;
      a.y = cap.y;
      a.path = [];
      a.order = null;
    }
  }
}
function cityIdAt(world: World, x: number, y: number) {
  const g = world.grid;
  const gx = Math.max(0, Math.min(g.w - 1, Math.floor(x / g.cell)));
  const gy = Math.max(0, Math.min(g.h - 1, Math.floor(y / g.cell)));
  return g.data[gy * g.w + gx] - 1;
}

/** Let a subject go (or give it its independence). */
export function release(s: State, n: number, sub: number) {
  if (s.nations[sub].overlord !== n) return "Not your subject";
  s.nations[sub].overlord = -1;
  addRelation(s, n, sub, 20);
  say(s, `${s.nations[n].name} has granted ${s.nations[sub].name} independence.`, "peace", [n, sub]);
  return null;
}

/** Bring back a nation you've conquered, on its old land you hold, as your subject. */
export function liberate(s: State, world: World, n: number, t: number) {
  const nat = s.nations[t];
  if (nat.alive) return "It's still standing";
  const land = s.cities.filter((c) => c.core === t && c.owner === n);
  if (!land.length) return "You hold none of its land";
  for (const c of land) c.owner = t;
  nat.alive = true;
  nat.overlord = n;
  nat.capital = (land.find((c) => world.cities[c.id].capital) ?? land[0]).id;
  nat.money = 100;
  nat.stability = 55;
  nat.manpower = 0;
  nat.justify = [];
  nat.alliance = -1;
  addRelation(s, n, t, 40);
  say(s, `${s.nations[n].name} has restored ${nat.name} as its subject.`, "peace", [n, t]);
  return null;
}

/* ------------------------------------------------------------------ formables */

/** The map's cities for a formable (by name; the right one if names repeat). */
export function formableCities(world: World, f: FormableDef) {
  const out: number[] = [];
  for (const name of f.cities) {
    const all = world.cities.filter((c) => c.name === name);
    if (!all.length) continue;
    const pref = all.find((c) => f.by.includes(world.nations[c.nation].iso)) ?? all.sort((a, b) => b.pop - a.pop)[0];
    out.push(pref.id);
  }
  return out;
}

export function formableFor(s: State, n: number) {
  const nat = s.nations[n];
  return FORMABLES.filter((f) => f.by.includes(nat.iso) && s.formed[f.id] === undefined && nat.formed !== f.id);
}

export function canForm(s: State, world: World, n: number, f: FormableDef) {
  const nat = s.nations[n];
  if (!f.by.includes(nat.iso)) return "Your nation can't form this";
  if (s.formed[f.id] !== undefined) return "Already formed";
  if (f.ideology && nat.ideology !== f.ideology) return `Must be a ${IDEOLOGIES[f.ideology].name.toLowerCase()}`;
  const need = formableCities(world, f);
  const missing = need.filter((c) => s.cities[c].owner !== n);
  if (missing.length) return `You still need ${missing.map((c) => world.cities[c].name).join(", ")}`;
  if (nat.overlord >= 0) return "Subjects can't";
  return null;
}

export function form(s: State, world: World, n: number, id: string) {
  const f = FORMABLES.find((x) => x.id === id);
  if (!f) return "No such nation";
  const why = canForm(s, world, n, f);
  if (why) return why;
  const nat = s.nations[n];
  const old = nat.name;
  nat.name = f.name;
  nat.color = f.color;
  nat.formed = f.id;
  s.formed[f.id] = n;
  // Its lands are yours by right now.
  for (const c of formableCities(world, f)) s.cities[c].core = n;
  for (const c of s.cities) if (c.owner === n) c.core = n;
  nat.mods.push({ text: `Formed the ${f.name}`, stability: 12, gdp: 0.05, days: 365 });
  for (const o of s.nations) if (o.alive && o.id !== n) addRelation(s, n, o.id, -6);
  say(s, `${old} has proclaimed the ${f.name}!`, "world", [n]);
  return null;
}

export const allianceOf = (s: State, n: Nation) => s.alliances.find((a) => a.id === n.alliance) ?? null;
export const cityOwnerName = (s: State, c: City) => s.nations[c.owner].name;
