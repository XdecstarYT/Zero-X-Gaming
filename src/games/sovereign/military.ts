/**
 * War on the map: armies and fleets move along their paths, aircraft fly to their zones, units in
 * reach of an enemy fight it out, cities hold out with their militia and forts until a siege
 * takes them, missiles and warheads land, and the training queues turn out new units.
 */
import { BUILDINGS, ECONOMY_LAWS, LAND_UNITS, UNITS, type UnitKind } from "./data";
import { addRelation, clamp, nextId, rand, say, seaSpotNear, spawn, unitCount, type Army, type City, type State } from "./state";
import { cityAt, kmBetween, kmPerPx, type World } from "./world";

export const TICK = 0.25;

/** Land units on the water are embarked: slow and easy prey. */
export const embarked = (world: World, a: Army) => UNITS[a.kind].domain === "land" && cityAt(world, a.x, a.y) < 0;

/** Who's at war with whom, as a flat matrix (rebuilt when wars change). */
export function warMatrix(s: State) {
  const N = s.nations.length;
  const m = new Uint8Array(N * N);
  for (const w of s.wars)
    for (const a of w.attackers)
      for (const d of w.defenders) {
        m[a * N + d] = 1;
        m[d * N + a] = 1;
      }
  return m;
}

function domainOf(world: World, a: Army): "land" | "sea" | "air" {
  const d = UNITS[a.kind].domain;
  if (d === "air") return "air";
  if (d === "sea" || embarked(world, a)) return "sea";
  return "land";
}

export function militaryTick(s: State, world: World, dt: number) {
  const N = s.nations.length;
  const war = warMatrix(s);
  const enemy = (a: number, b: number) => war[a * N + b] === 1;

  // ---- movement
  for (const a of s.armies) {
    const def = UNITS[a.kind];
    a.fighting = Math.max(0, a.fighting - dt);
    if (def.domain === "air") {
      const base = world.cities[a.base];
      const tgt = a.order ? { x: a.order.x, y: a.order.y } : base ? { x: base.x, y: base.y } : null;
      if (!tgt) continue;
      const d = Math.hypot(tgt.x - a.x, tgt.y - a.y);
      const step = (def.speed * dt) / kmPerPx(world, a.y);
      if (d <= step) {
        a.x = tgt.x;
        a.y = tgt.y;
      } else {
        a.x += ((tgt.x - a.x) / d) * step;
        a.y += ((tgt.y - a.y) / d) * step;
      }
      continue;
    }
    if (!a.path.length) {
      if (a.order?.kind === "move") a.order = null;
      if (def.domain === "land") a.dig = Math.min(1, a.dig + dt * 0.05);
      continue;
    }
    a.dig = 0;
    let speed = def.speed;
    const n = s.nations[a.owner];
    if ((def.oil ?? 0) > 0 && n.fuel < 1) speed *= 0.4 + 0.6 * n.fuel;
    if (embarked(world, a)) speed *= 0.6;
    // Moving through a fight is slow.
    if (a.fighting > 0) speed *= 0.35;
    let left = (speed * dt) / kmPerPx(world, a.y);
    while (left > 0 && a.path.length) {
      const tx = a.path[0];
      const ty = a.path[1];
      const d = Math.hypot(tx - a.x, ty - a.y);
      if (d <= left) {
        a.x = tx;
        a.y = ty;
        a.path.splice(0, 2);
        left -= d;
      } else {
        a.x += ((tx - a.x) / d) * left;
        a.y += ((ty - a.y) / d) * left;
        left = 0;
      }
    }
  }

  // ---- combat
  const B = 16;
  const bw = Math.ceil(world.w / B);
  const buckets = new Map<number, number[]>();
  s.armies.forEach((a, i) => {
    if (UNITS[a.kind].domain === "strike") return;
    const k = Math.floor(a.y / B) * bw + Math.floor(a.x / B);
    let l = buckets.get(k);
    if (!l) buckets.set(k, (l = []));
    l.push(i);
  });
  const near = (x: number, y: number, r: number, out: number[]) => {
    out.length = 0;
    const x0 = Math.floor((x - r) / B);
    const x1 = Math.floor((x + r) / B);
    const y0 = Math.floor((y - r) / B);
    const y1 = Math.floor((y + r) / B);
    for (let by = y0; by <= y1; by++)
      for (let bx = x0; bx <= x1; bx++) {
        const l = buckets.get(by * bw + bx);
        if (l) for (const i of l) out.push(i);
      }
    return out;
  };
  const dmg = new Float64Array(s.armies.length);
  const dom = s.armies.map((a) => domainOf(world, a));
  const tmp: number[] = [];
  const foes: number[] = [];
  // Fighters over a spot give their side the air.
  const airCover = (owner: number, x: number, y: number) => {
    near(x, y, 16, tmp);
    let mine = 0;
    let theirs = 0;
    for (const j of tmp) {
      const b = s.armies[j];
      if (b.kind !== "fighter" || Math.hypot(b.x - x, b.y - y) > 16) continue;
      if (b.owner === owner || (s.nations[owner].alliance >= 0 && s.nations[b.owner].alliance === s.nations[owner].alliance)) mine += unitCount(b);
      else if (enemy(owner, b.owner)) theirs += unitCount(b);
    }
    return mine > theirs * 1.2 ? 1.2 : theirs > mine * 1.2 ? 0.85 : 1;
  };
  const fortAt = (a: Army) => {
    const ci = cityAt(world, a.x, a.y);
    if (ci < 0) return 0;
    const c = s.cities[ci];
    const wc = world.cities[ci];
    if (c.owner !== a.owner || Math.hypot(wc.x - a.x, wc.y - a.y) > 5) return 0;
    return (c.buildings.fort ?? 0) * 0.35;
  };
  for (let i = 0; i < s.armies.length; i++) {
    const a = s.armies[i];
    const def = UNITS[a.kind];
    if (def.domain === "strike") continue;
    // Aircraft only fight once they're over their zone.
    if (def.domain === "air" && (!a.order || Math.hypot(a.order.x - a.x, a.order.y - a.y) > 2)) continue;
    const reachLand = def.domain === "air" ? 12 : a.kind === "artillery" ? 10 : def.domain === "sea" ? (def.range ? Math.min(40, def.range / kmPerPx(world, a.y)) : 0) : 5;
    const reachSea = def.domain === "air" ? 12 : def.domain === "sea" ? Math.max(8, def.kind === "carrier" ? 40 : 0) : 3;
    const reachAir = a.kind === "antiair" ? 12 : def.domain === "air" ? 14 : def.domain === "sea" ? 10 : 0;
    const reach = Math.max(reachLand, reachSea, reachAir);
    if (!reach) continue;
    near(a.x, a.y, reach, tmp);
    foes.length = 0;
    let total = 0;
    for (const j of tmp) {
      const b = s.armies[j];
      if (!enemy(a.owner, b.owner)) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const bd = dom[j];
      const r = bd === "land" ? reachLand : bd === "sea" ? reachSea : reachAir;
      if (d > r) continue;
      if (UNITS[b.kind].domain === "air" && (!b.order || Math.hypot(b.order.x - b.x, b.order.y - b.y) > 2)) continue;
      const atk = def.atk[bd];
      if (!atk) continue;
      foes.push(j);
      total += unitCount(b);
    }
    if (!foes.length) continue;
    a.fighting = 1;
    const n = s.nations[a.owner];
    let k = unitCount(a) * dt * (0.75 + 0.5 * (n.stability / 100));
    if ((def.oil ?? 0) > 0) k *= 0.5 + 0.5 * n.fuel;
    if (dom[i] === "land") k *= airCover(a.owner, a.x, a.y);
    if (dom[i] === "sea" && def.domain === "land") k *= 0.2;
    for (const j of foes) {
      const b = s.armies[j];
      const share = unitCount(b) / total;
      const bdef = UNITS[b.kind].def * (dom[j] === "sea" && UNITS[b.kind].domain === "land" ? 0.45 : 1);
      dmg[j] += (def.atk[dom[j]] * k * share) / (bdef * (1 + b.dig * 0.5 + fortAt(b)));
      b.fighting = 1;
    }
  }

  // ---- cities: militia fight back, sieges take them
  const sieges = new Map<number, Map<number, number>>();
  for (let i = 0; i < s.armies.length; i++) {
    const a = s.armies[i];
    if (dom[i] !== "land") continue;
    const ci = cityAt(world, a.x, a.y);
    if (ci < 0) continue;
    const c = s.cities[ci];
    if (c.owner === a.owner || !enemy(a.owner, c.owner)) continue;
    const wc = world.cities[ci];
    if (Math.hypot(wc.x - a.x, wc.y - a.y) > 6) continue;
    // Defenders in town stop the siege.
    near(wc.x, wc.y, 6, tmp);
    let held = false;
    for (const j of tmp) {
      const b = s.armies[j];
      if (dom[j] === "land" && enemy(b.owner, a.owner) && Math.hypot(b.x - wc.x, b.y - wc.y) <= 6) held = true;
    }
    if (held) continue;
    let m = sieges.get(ci);
    if (!m) sieges.set(ci, (m = new Map()));
    m.set(i, unitCount(a) * (UNITS[a.kind].atk.land / 10));
  }
  for (const [ci, m] of sieges) {
    const c = s.cities[ci];
    const fort = c.buildings.fort ?? 0;
    const popM = c.pop / 1e6;
    let force = 0;
    let lead = -1;
    let best = 0;
    for (const [i, f] of m) {
      force += f;
      if (f > best) {
        best = f;
        lead = i;
      }
    }
    const militia = (2 + Math.sqrt(popM) * 4) * (1 + fort * 0.6);
    for (const [i, f] of m) dmg[i] += (militia * dt * (f / force)) / UNITS[s.armies[i].kind].def;
    const by = s.armies[lead].owner;
    if (!c.capture || c.capture.by !== by) c.capture = { by, progress: 0 };
    c.capture.progress += (force * 7 * dt) / (1 + fort * 0.7 + popM ** 0.3 * 0.4);
    if (c.capture.progress >= 100) capture(s, world, c, by);
  }
  // Sieges lifted fade.
  for (const c of s.cities) if (c.capture && !sieges.has(c.id)) {
    c.capture.progress -= dt * 10;
    if (c.capture.progress <= 0) c.capture = null;
  }

  // ---- losses
  let lost = false;
  for (let i = 0; i < s.armies.length; i++) {
    if (!dmg[i]) continue;
    const a = s.armies[i];
    const before = unitCount(a);
    a.hp -= dmg[i];
    const gone = before - Math.max(0, unitCount(a));
    const men = gone * UNITS[a.kind].manpower * 0.6;
    const n = s.nations[a.owner];
    n.deaths += men;
    n.exhaustion = clamp(n.exhaustion + men / Math.max(20000, n.manpower + 200000) * 8, 0, 100);
    for (const w of s.wars) {
      if (w.attackers.includes(a.owner)) w.lossA += men;
      else if (w.defenders.includes(a.owner)) w.lossD += men;
    }
    if (a.hp <= 0.5) lost = true;
  }
  if (lost) {
    for (const a of s.armies) if (a.hp <= 0.5 && a.owner === s.player) say(s, `Your ${UNITS[a.kind].name.toLowerCase()} have been destroyed.`, "bad", [a.owner]);
    s.armies = s.armies.filter((a) => a.hp > 0.5);
  }

  // ---- strikes in flight
  for (const st of s.strikes) {
    st.t += dt / (st.kind === "nuke" ? 0.6 : 0.4);
    if (st.t >= 1) impact(s, world, st);
  }
  s.strikes = s.strikes.filter((st) => st.t < 1);
}

/** A city changes hands. */
export function capture(s: State, world: World, c: City, by: number) {
  const from = c.owner;
  const wc = world.cities[c.id];
  c.owner = by;
  c.capture = null;
  c.build = null;
  c.queue = [];
  c.damage = Math.min(0.9, c.damage + 0.25);
  c.unrest = c.core === by ? 10 : 65;
  for (const b of Object.keys(c.buildings) as (keyof typeof c.buildings)[]) if (rand(s) < 0.25 && c.buildings[b]) c.buildings[b] = c.buildings[b]! - 1;
  const loser = s.nations[from];
  const winner = s.nations[by];
  // Air units based there are lost with it; ships in port sail on.
  for (const a of s.armies) if (a.owner === from && a.base === c.id) a.hp = 0;
  s.armies = s.armies.filter((a) => a.hp > 0);
  if (by === s.player || from === s.player) say(s, `${winner.name} has taken ${wc.name} from ${loser.name}.`, by === s.player ? "good" : "bad", [by, from]);
  else if (wc.capital) say(s, `${winner.name} has taken ${wc.name}, the capital of ${loser.name}.`, "war", [by, from]);
  const left = s.cities.filter((x) => x.owner === from);
  if (!left.length) {
    eliminate(s, world, from, by);
    return;
  }
  if (loser.capital === c.id) {
    const next = left.slice().sort((a, b) => b.pop - a.pop)[0];
    loser.capital = next.id;
    loser.stability = Math.max(0, loser.stability - 12);
    loser.mods.push({ text: "Capital fallen", stability: -8, gdp: -0.05, days: 120 });
    // With the capital gone and most of the land lost, it gives up.
    const cores = s.cities.filter((x) => x.core === from);
    const held = cores.filter((x) => x.owner === from).length;
    if (held / Math.max(1, cores.length) < 0.5) capitulate(s, world, from, by);
  }
}

/** A nation gives up its wars and becomes a subject of the one who took its capital. */
export function capitulate(s: State, world: World, n: number, to: number) {
  const nat = s.nations[n];
  for (const w of s.wars) {
    w.attackers = w.attackers.filter((x) => x !== n);
    w.defenders = w.defenders.filter((x) => x !== n);
  }
  endEmptyWars(s);
  nat.overlord = to;
  leaveAlliance(s, n);
  nat.justify = [];
  say(s, `${nat.name} has capitulated to ${s.nations[to].name}.`, "war", [n, to]);
  void world;
}

export function leaveAlliance(s: State, n: number) {
  const nat = s.nations[n];
  const al = s.alliances.find((a) => a.id === nat.alliance);
  nat.alliance = -1;
  if (!al) return;
  al.members = al.members.filter((m) => m !== n);
  if (al.leader === n) al.leader = al.members[0] ?? -1;
  if (!al.members.length) s.alliances = s.alliances.filter((a) => a !== al);
}

export function endEmptyWars(s: State) {
  const done = s.wars.filter((w) => !w.attackers.length || !w.defenders.length);
  for (const w of done) say(s, `The ${w.name} is over.`, "peace", [...w.attackers, ...w.defenders]);
  s.wars = s.wars.filter((w) => w.attackers.length && w.defenders.length);
}

/** A nation with no cities left is gone. */
export function eliminate(s: State, world: World, n: number, by: number) {
  const nat = s.nations[n];
  nat.alive = false;
  s.armies = s.armies.filter((a) => a.owner !== n);
  for (const w of s.wars) {
    w.attackers = w.attackers.filter((x) => x !== n);
    w.defenders = w.defenders.filter((x) => x !== n);
  }
  endEmptyWars(s);
  leaveAlliance(s, n);
  for (const o of s.nations) if (o.overlord === n) o.overlord = -1;
  say(s, `${nat.name} has been conquered by ${s.nations[by].name}.`, "war", [n, by]);
  if (n === s.player && !s.over) s.over = { reason: `${nat.name} has fallen.`, score: 0 };
  void world;
}

function impact(s: State, world: World, st: State["strikes"][number]) {
  const nuke = st.kind === "nuke";
  const R = nuke ? 14 : 5;
  for (const a of s.armies) {
    if (UNITS[a.kind].domain === "air" && !nuke) continue;
    const d = Math.hypot(a.x - st.x, a.y - st.y);
    if (d > R || a.owner === st.owner) continue;
    a.hp -= nuke ? a.hp * 0.92 : (UNITS.missile.atk.land / UNITS[a.kind].def) * (1 - d / (R * 1.4));
  }
  s.armies = s.armies.filter((a) => a.hp > 0.5);
  const ci = cityAt(world, st.x, st.y);
  const c = ci >= 0 ? s.cities[ci] : null;
  const wc = ci >= 0 ? world.cities[ci] : null;
  if (c && wc && Math.hypot(wc.x - st.x, wc.y - st.y) < (nuke ? 10 : 5)) {
    if (nuke) {
      c.pop *= 0.35;
      c.dev = Math.max(1, c.dev - 3);
      for (const b of Object.keys(c.buildings) as (keyof typeof c.buildings)[]) c.buildings[b] = Math.max(0, (c.buildings[b] ?? 0) - 2);
      c.damage = 0.95;
      c.unrest = 100;
      const victim = s.nations[c.owner];
      victim.stability = Math.max(0, victim.stability - 25);
      say(s, `A nuclear warhead from ${s.nations[st.owner].name} has destroyed ${wc.name}.`, "world", [st.owner, c.owner]);
    } else {
      const have = (Object.keys(c.buildings) as (keyof typeof c.buildings)[]).filter((b) => (c.buildings[b] ?? 0) > 0);
      if (have.length) {
        const b = have[Math.floor(rand(s) * have.length)];
        c.buildings[b] = (c.buildings[b] ?? 1) - 1;
        if (c.owner === s.player || st.owner === s.player) say(s, `A missile has hit ${wc.name}: ${BUILDINGS[b].name.toLowerCase()} damaged.`, "war", [st.owner, c.owner]);
      }
      c.damage = Math.min(0.9, c.damage + 0.2);
    }
  }
}

/** Launch a missile or warhead from your nearest silo. */
export function launch(s: State, world: World, n: number, kind: "missile" | "nuke", x: number, y: number) {
  const nat = s.nations[n];
  if (kind === "missile" ? nat.missiles < 1 : nat.nukes < 1) return "None ready";
  const range = UNITS[kind].range ?? 0;
  const silos = s.cities.filter((c) => c.owner === n && (c.buildings.silo ?? 0) > 0);
  let best: City | null = null;
  let bd = Infinity;
  for (const c of silos) {
    const wc = world.cities[c.id];
    const d = kmBetween(world, wc.x, wc.y, x, y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  if (!best) return "You need a missile silo";
  if (bd > range) return `Out of range (${Math.round(bd)} km; ${range} km max)`;
  const ci = cityAt(world, x, y);
  const target = ci >= 0 ? s.cities[ci].owner : -1;
  if (target >= 0 && target !== n) {
    const war = warMatrix(s);
    if (!war[n * s.nations.length + target]) return "You're not at war with them";
  }
  if (kind === "missile") nat.missiles--;
  else nat.nukes--;
  const wc = world.cities[best.id];
  s.strikes.push({ id: nextId(s), kind, from: best.id, x0: wc.x, y0: wc.y, x, y, t: 0, owner: n });
  if (kind === "nuke") {
    // The world will remember.
    for (const o of s.nations) if (o.id !== n && o.alive) addRelation(s, n, o.id, -45);
    nat.stability = Math.max(0, nat.stability - 12);
    nat.mods.push({ text: "Used nuclear weapons", stability: -10, gdp: -0.04, days: 365 });
    say(s, `${nat.name} has launched a nuclear warhead!`, "world", [n, target]);
  }
  return null;
}

/* ------------------------------------------------------------------ training */

export function trainingSpeed(s: State, c: City, kind: UnitKind) {
  const n = s.nations[c.owner];
  const d = UNITS[kind];
  const lvl = d.needs === "shipyard" ? (c.buildings.shipyard ?? 0) : d.needs === "arms" ? (c.buildings.arms ?? 0) : 1;
  return ECONOMY_LAWS[n.economy].military * (1 + 0.25 * Math.max(0, lvl - 1)) * (0.6 + 0.4 * (n.stability / 100));
}

export function trainingDay(s: State, world: World) {
  for (const c of s.cities) {
    const q = c.queue[0];
    if (!q) continue;
    q.days -= trainingSpeed(s, c, q.kind);
    if (q.days > 0) continue;
    c.queue.shift();
    const wc = world.cities[c.id];
    const n = s.nations[c.owner];
    const d = UNITS[q.kind];
    if (d.domain === "strike") {
      if (q.kind === "nuke") n.nukes++;
      else n.missiles++;
    } else if (d.domain === "sea") {
      const p = seaSpotNear(world, wc.x, wc.y);
      if (p) spawn(s, c.owner, q.kind, 1, p[0], p[1], -1);
    } else if (d.domain === "air") spawn(s, c.owner, q.kind, 1, wc.x, wc.y, c.id);
    else spawn(s, c.owner, q.kind, 1, wc.x + (rand(s) - 0.5) * 2, wc.y + (rand(s) - 0.5) * 2, -1);
    if (c.owner === s.player && c.queue.length === 0) say(s, `${d.name} ready in ${wc.name}.`, "good", [c.owner]);
  }
  // Aircraft whose base fell look for another.
  for (const a of s.armies) {
    if (UNITS[a.kind].domain !== "air") continue;
    const b = s.cities[a.base];
    if (b && b.owner === a.owner && (b.buildings.airport ?? 0) > 0) continue;
    const bases = s.cities.filter((c) => c.owner === a.owner && (c.buildings.airport ?? 0) > 0);
    if (!bases.length) {
      a.hp = 0;
      continue;
    }
    a.base = bases.sort((x, y) => Math.hypot(world.cities[x.id].x - a.x, world.cities[x.id].y - a.y) - Math.hypot(world.cities[y.id].x - a.x, world.cities[y.id].y - a.y))[0].id;
    a.order = null;
  }
  s.armies = s.armies.filter((a) => a.hp > 0);
}

export const isLand = (k: UnitKind) => LAND_UNITS.includes(k);
