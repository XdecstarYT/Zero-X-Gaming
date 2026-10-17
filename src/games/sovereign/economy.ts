/**
 * A day of every nation's economy: power, mines and factories, GDP and taxes, upkeep and fuel,
 * consumer goods, the world market, growth, building work, unrest and stability.
 */
import { BUILDINGS, CONSCRIPTION, ECONOMY_LAWS, IDEOLOGIES, ITEM_INFO, ITEMS, MAX_DEV, UNITS, type BuildingId, type ItemId } from "./data";
import { clamp, devFactor, manpowerMax, rand, say, type City, type Nation, type State } from "./state";
import type { World } from "./world";

const POWER_BUILDINGS: BuildingId[] = ["oilPower", "nuclearPower", "renewable"];

/** Consumer goods a city of this size buys a day. */
export const consumerDemand = (c: City) => (c.pop / 1e6) * 0.12 + 0.05;

export function atWar(s: State, a: number, b: number) {
  for (const w of s.wars) {
    if ((w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a))) return true;
  }
  return false;
}
export function inAnyWar(s: State, n: number) {
  return s.wars.some((w) => w.attackers.includes(n) || w.defenders.includes(n));
}

/** A city's GDP today ($M a day). */
export function cityGdp(s: State, c: City, n: Nation, consumer = n.last.consumer) {
  const id = IDEOLOGIES[n.ideology];
  let g = c.base * devFactor(c.dev) * id.gdp * CONSCRIPTION[n.conscription].gdp * ECONOMY_LAWS[n.economy].gdp;
  g *= 1 - c.damage * 0.8;
  if (c.owner !== c.core) g *= 0.55;
  if (c.unrest > 60) g *= 1 - (c.unrest - 60) / 100;
  g *= 1 + 0.05 * (c.buildings.civilian ?? 0) + 0.06 * (c.buildings.port ?? 0);
  g *= 0.88 + 0.12 * consumer;
  for (const m of n.mods) g *= 1 + m.gdp;
  return g;
}

export function economyDay(s: State, world: World) {
  const N = s.nations.length;
  const owned: City[][] = Array.from({ length: N }, () => []);
  for (const c of s.cities) owned[c.owner].push(c);
  const upkeep = new Float64Array(N);
  const oilNeed = new Float64Array(N);
  for (const a of s.armies) {
    const d = UNITS[a.kind];
    const k = a.hp / d.hp;
    upkeep[a.owner] += d.upkeep * k;
    oilNeed[a.owner] += (d.oil ?? 0) * k;
  }

  for (const n of s.nations) {
    if (!n.alive) continue;
    const cities = owned[n.id];
    const id = IDEOLOGIES[n.ideology];
    const produced: Partial<Record<ItemId, number>> = {};
    const used: Partial<Record<ItemId, number>> = {};
    const take = (k: ItemId, want: number) => {
      const got = Math.min(want, Math.max(0, n.stock[k]));
      n.stock[k] -= got;
      used[k] = (used[k] ?? 0) + got;
      return got;
    };
    const give = (k: ItemId, v: number) => {
      n.stock[k] += v;
      produced[k] = (produced[k] ?? 0) + v;
    };

    // Power: what's built, then whether there's fuel for it.
    let use = 0;
    let made = 0;
    for (const c of cities)
      for (const b of Object.keys(c.buildings) as BuildingId[]) {
        const lv = c.buildings[b] ?? 0;
        if (!lv) continue;
        const def = BUILDINGS[b];
        if (def.power > 0) use += def.power * lv;
        else if (POWER_BUILDINGS.includes(b)) {
          let k = 1;
          for (const [item, q] of Object.entries(def.input ?? {}) as [ItemId, number][]) k = Math.min(k, take(item, q * lv) / (q * lv));
          made += -def.power * lv * k * (1 - c.damage * 0.7);
        }
      }
    const pr = use ? Math.min(1, made / use) : 1;
    const work = id.factory * pr;

    // Mines.
    for (const c of cities) {
      const lv = c.buildings.mine ?? 0;
      if (!lv) continue;
      const k = work * (1 - c.damage * 0.7) * (c.owner === c.core ? 1 : 0.6) * (c.unrest > 70 ? 0.6 : 1);
      for (const d of c.deposits) give(d.res, d.rich * lv * 0.7 * k);
    }
    // Factories, in chain order: steel feeds motor works.
    for (const b of ["steel", "electronics", "motor", "fertilizer", "civilian"] as BuildingId[]) {
      const def = BUILDINGS[b];
      for (const c of cities) {
        const lv = c.buildings[b] ?? 0;
        if (!lv) continue;
        const k = lv * work * (1 - c.damage * 0.7) * (c.owner === c.core ? 1 : 0.6);
        let f = 1;
        for (const [item, q] of Object.entries(def.input ?? {}) as [ItemId, number][]) f = Math.min(f, n.stock[item] / (q * k || 1));
        f = clamp(f, 0, 1);
        // Chromium only sweetens steel: the mill still runs without it.
        if (b === "steel") f = Math.min(1, n.stock.iron / (2 * k || 1));
        for (const [item, q] of Object.entries(def.input ?? {}) as [ItemId, number][]) take(item, q * k * f);
        for (const [item, q] of Object.entries(def.output ?? {}) as [ItemId, number][]) give(item, q * k * f * (b === "steel" && n.stock.chromium <= 0 ? 0.75 : 1));
      }
    }

    // People buy consumer goods (and farms take fertilizer).
    const demand = cities.reduce((a, c) => a + consumerDemand(c), 0);
    const got = take("consumerGoods", demand);
    const consumer = demand ? got / demand : 1;
    const fert = take("fertilizer", cities.reduce((a, c) => a + c.pop / 1e6, 0) * 0.02);

    // Units burn oil; short, they fight worse (see military).
    const oil = take("oil", oilNeed[n.id]);
    const fuel = oilNeed[n.id] ? oil / oilNeed[n.id] : 1;

    // GDP and taxes.
    let gdp = 0;
    for (const c of cities) {
      c.gdp = cityGdp(s, c, n, consumer);
      gdp += c.gdp;
    }
    const efficiency = 0.6 + 0.4 * (n.stability / 100);
    const tax = gdp * n.tax * efficiency;
    const partners = n.trade.filter((t) => s.nations[t]?.alive).length;
    const trade = gdp * n.tax * 0.025 * Math.min(5, partners);
    const interest = n.money < 0 ? -n.money * 0.002 : 0;
    const spend = upkeep[n.id] + interest;
    n.money += tax + trade - spend;
    n.last = { income: tax + trade - spend, tax, trade, upkeep: spend, gdp, power: made, powerUse: use, consumer, produced, used };
    n.fuel = fuel;

    // Manpower refills over about half a year.
    const mpMax = manpowerMax(s, n.id);
    n.manpower = Math.min(mpMax, n.manpower + mpMax / 180);

    // Growth: a little a day, faster with food and calm, capped by development.
    const fertK = Math.min(1, fert / Math.max(0.001, cities.reduce((a, c) => a + c.pop / 1e6, 0) * 0.02));
    for (const c of cities) {
      const g = (0.000035 + 0.00003 * fertK) * (0.5 + n.stability / 100) * (c.dev >= 6 ? 0.7 : 1);
      c.pop *= 1 + g;
      c.damage = Math.max(0, c.damage - 0.002 - 0.0004 * c.dev);
      // Unrest: occupation, a shaky state and empty shops; troops in town calm it.
      const target = (c.owner !== c.core ? 45 : 0) + Math.max(0, 55 - n.stability) * 0.9 + (1 - consumer) * 20;
      c.unrest += (target - c.unrest) * 0.03;
      buildDay(s, world, n, c);
    }

    stabilityDay(s, world, n, consumer);
    if (n.nuclearDays > 0 && --n.nuclearDays === 0) {
      n.nuclear = true;
      say(s, `${n.name} has completed a nuclear programme.`, "world", [n.id]);
    }
    if (n.transition && --n.transition.days <= 0) {
      const to = n.transition.to;
      n.transition = null;
      n.ideology = to;
      say(s, `${n.name} is now a ${IDEOLOGIES[to].name.toLowerCase()}.`, "world", [n.id]);
    }
    for (const j of n.justify) if (j.days > 0) j.days--;
    n.justify = n.justify.filter((j) => j.days > 0 || s.day - j.ready < 365);
    for (const j of n.justify) if (j.days === 0 && !j.ready) j.ready = s.day;
    for (const m of n.mods) m.days--;
    n.mods = n.mods.filter((m) => m.days > 0);
  }
  marketDay(s);
}

function buildDay(s: State, world: World, n: Nation, c: City) {
  const b = c.build;
  if (!b) return;
  b.days -= 1 + c.dev * 0.04;
  if (b.days > 0) return;
  c.build = null;
  const name = world.cities[c.id].name;
  if (b.id === "develop") {
    c.dev = Math.min(MAX_DEV, c.dev + 1);
    if (n.id === s.player) say(s, `${name} has developed to level ${c.dev}.`, "good", [n.id]);
  } else {
    c.buildings[b.id] = Math.min(BUILDINGS[b.id].max, (c.buildings[b.id] ?? 0) + 1);
    if (n.id === s.player) say(s, `${BUILDINGS[b.id].name} in ${name} is finished (level ${c.buildings[b.id]}).`, "good", [n.id]);
  }
}

export function stabilityTarget(s: State, n: Nation, consumer = n.last.consumer) {
  const id = IDEOLOGIES[n.ideology];
  let t = id.stability;
  if (n.tax > 0.2) t -= (n.tax - 0.2) * 120 * id.taxPain;
  else t += (0.2 - n.tax) * 45;
  t += CONSCRIPTION[n.conscription].stability + ECONOMY_LAWS[n.economy].stability;
  t -= n.exhaustion * 0.4 * id.exhaustion;
  t -= (1 - consumer) * 16;
  const lost = s.cities.filter((c) => c.core === n.id && c.owner !== n.id).length;
  t -= Math.min(18, lost * 2);
  if (n.money < 0) t -= 14;
  if (n.transition) t -= 18;
  if (n.overlord >= 0) t -= 4;
  for (const m of n.mods) t += m.stability;
  return clamp(t, 0, 100);
}

function stabilityDay(s: State, world: World, n: Nation, consumer: number) {
  const t = stabilityTarget(s, n, consumer);
  n.stability += clamp(t - n.stability, -0.6, 0.45);
  n.stability = clamp(n.stability, 0, 100);
  const warring = s.wars.some((w) => w.attackers.includes(n.id) || w.defenders.includes(n.id));
  n.exhaustion = clamp(n.exhaustion + (warring ? 0.04 : -0.25), 0, 100);
  // Riots in a shaky state; occupied cities may rise and go home.
  if (n.stability < 30) {
    for (const c of s.cities) {
      if (c.owner !== n.id || c.unrest < 80) continue;
      if (rand(s) > 0.004 * (1 + (30 - n.stability) / 10)) continue;
      if (c.core !== n.id && s.nations[c.core]) {
        revolt(s, world, c);
      } else {
        c.damage = Math.min(0.8, c.damage + 0.15);
        if (n.id === s.player) say(s, `Riots in ${world.cities[c.id].name}: buildings burned, factories idle.`, "bad", [n.id]);
      }
    }
  }
}

/** An occupied city throws off its occupier and goes back to its own nation (reviving it if it must). */
export function revolt(s: State, world: World, c: City) {
  const name = world.cities[c.id].name;
  const from = c.owner;
  const to = c.core;
  const nat = s.nations[to];
  c.owner = to;
  c.capture = null;
  c.unrest = 20;
  if (!nat.alive) {
    nat.alive = true;
    nat.capital = c.id;
    nat.money = 50;
    nat.stability = 50;
    nat.alliance = -1;
    nat.overlord = -1;
    say(s, `${name} rises against ${s.nations[from].name}: ${nat.name} is free again!`, "world", [from, to]);
  } else say(s, `${name} has risen against ${s.nations[from].name} and returned to ${nat.name}.`, "bad", [from, to]);
  const wc = world.cities[c.id];
  for (const a of s.armies) if (a.owner === from && Math.hypot(a.x - wc.x, a.y - wc.y) < 4) a.hp *= 0.5;
}

/* ------------------------------------------------------------------ the world market */

export const buyPrice = (s: State, k: ItemId) => s.price[k] * 1.12;
export const sellPrice = (s: State, k: ItemId) => s.price[k] * 0.9;

export function buy(s: State, n: Nation, k: ItemId, q: number) {
  const cost = buyPrice(s, k) * q;
  if (q <= 0 || n.money < cost) return false;
  n.money -= cost;
  n.stock[k] += q;
  s.flow[k] += q;
  return true;
}
export function sell(s: State, n: Nation, k: ItemId, q: number) {
  q = Math.min(q, n.stock[k]);
  if (q <= 0) return 0;
  n.stock[k] -= q;
  const got = sellPrice(s, k) * q;
  n.money += got;
  s.flow[k] -= q;
  return got;
}

/** A reserve to keep: about a month of what you use. */
export const reserveOf = (n: Nation, k: ItemId) => 10 + (n.last.used[k] ?? 0) * 30;

/** Top up what the player asked to keep stocked. */
export function autoBuy(s: State, n: Nation) {
  for (const k of n.autoBuy) {
    const use = (n.last.used[k] ?? 0) - (n.last.produced[k] ?? 0);
    if (use <= 0.05 || n.stock[k] > use * 15) continue;
    const q = use * 30 - n.stock[k];
    if (q > 0 && buyPrice(s, k) * q < n.money * 0.5) buy(s, n, k, q);
  }
}

export function autoTrade(s: State, n: Nation, all: boolean) {
  for (const k of ITEMS) {
    if (!all && !n.autoSell.includes(k)) continue;
    const extra = n.stock[k] - reserveOf(n, k) * (all ? 1 : 1);
    if (extra > 1) sell(s, n, k, extra);
  }
}

function marketDay(s: State) {
  for (const k of ITEMS) {
    const base = ITEM_INFO[k].price;
    const f = s.flow[k];
    // Buying lifts the price, selling sinks it; it drifts back to normal.
    s.price[k] *= 1 + clamp(f / (Math.abs(f) + 40), -1, 1) * 0.03;
    s.price[k] += (base - s.price[k]) * 0.01;
    s.price[k] = clamp(s.price[k], base * 0.3, base * 4);
    s.flow[k] = 0;
  }
}
