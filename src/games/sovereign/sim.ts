/**
 * The clock: each game day runs the economy, training, events, elections and the AI; the war on
 * the map runs four times a day. Plus saving, the score, and answering other nations' offers.
 */
import { EVENTS, IDEOLOGIES, BUILDINGS, type BuildingId } from "./data";
import { makePeace, propose } from "./actions";
import { aiDay } from "./ai";
import { autoBuy, autoTrade, economyDay } from "./economy";
import { TICK, militaryTick, trainingDay } from "./military";
import { citiesOf, newGame, pickOne, rand, say, type Nation, type Offer, type State } from "./state";
import type { World } from "./world";

/** A new game, with "yesterday's" figures filled in so the panels have numbers from the start. */
export function startGame(world: World, playerIso: string, opts: Parameters<typeof newGame>[2] = {}) {
  const s = newGame(world, playerIso, opts);
  economyDay(s, world);
  return s;
}

/** Advance by `days` of game time (fractions run the war; whole days run the rest). */
export function advance(s: State, world: World, days: number) {
  if (s.over) return;
  let left = days;
  while (left > 1e-9) {
    const before = Math.floor(s.day);
    const step = Math.min(TICK, left, Math.floor(s.day) + 1 - s.day || TICK);
    militaryTick(s, world, step);
    s.day += step;
    left -= step;
    if (Math.floor(s.day + 1e-9) > before) dayTick(s, world);
  }
}

export function dayTick(s: State, world: World) {
  s.day = Math.round(s.day);
  economyDay(s, world);
  trainingDay(s, world);
  tribute(s);
  const me = s.nations[s.player];
  if (me.alive) {
    autoTrade(s, me, false);
    autoBuy(s, me);
  }
  aiDay(s, world);
  for (const n of s.nations) if (n.alive) eventChance(s, world, n);
  elections(s);
  if (s.day % 30 === 0) driftRelations(s, world);
  s.offers = s.offers.filter((o) => s.day - o.day < 30 && (o.kind !== "peace" || s.wars.some((w) => w.id === o.warId)));
  if (!me.alive && !s.over) s.over = { reason: `${me.name} has fallen.`, score: score(s) };
}

/** Blocs and borders pull relations back toward where they "should" be, a little each month. */
const BLOC: Record<string, number> = { democracy: 0, socialism: 1, monarchy: 2, theocracy: 3, communism: 4, authoritarian: 4 };
function driftRelations(s: State, world: World) {
  const N = s.nations.length;
  const neighbour = new Uint8Array(N * N);
  for (const c of world.cities)
    for (const o of c.near) {
      const a = s.cities[c.id].owner;
      const b = s.cities[o].owner;
      if (a !== b) neighbour[a * N + b] = 1;
    }
  for (let a = 0; a < N; a++) {
    const na = s.nations[a];
    if (!na.alive) continue;
    for (let b = a + 1; b < N; b++) {
      const nb = s.nations[b];
      if (!nb.alive) continue;
      let base = 0;
      if (na.ideology === nb.ideology) base += 18;
      else if ((BLOC[na.ideology] === 0 && BLOC[nb.ideology] === 4) || (BLOC[na.ideology] === 4 && BLOC[nb.ideology] === 0)) base -= 14;
      if (na.alliance >= 0 && na.alliance === nb.alliance) base += 45;
      if (neighbour[a * N + b]) base -= 10;
      if (na.trade.includes(b)) base += 10;
      const r = s.rel[a * N + b];
      const v = r + (base - r) * 0.04;
      s.rel[a * N + b] = s.rel[b * N + a] = v;
    }
  }
}

/** Subjects send their overlord a share of their taxes. */
function tribute(s: State) {
  for (const n of s.nations) {
    if (!n.alive || n.overlord < 0) continue;
    const lord = s.nations[n.overlord];
    if (!lord?.alive) {
      n.overlord = -1;
      continue;
    }
    const t = Math.max(0, n.last.tax * 0.15);
    n.money -= t;
    lord.money += t;
  }
}

function eventChance(s: State, world: World, n: Nation) {
  for (const e of EVENTS) {
    if (rand(s) > e.chance / 365) continue;
    const cities = citiesOf(s, n.id);
    if (!cities.length) return;
    const c = pickOne(s, cities);
    const name = world.cities[c.id].name;
    let text = e.text;
    switch (e.id) {
      case "boom":
        n.mods.push({ text: e.title, stability: 3, gdp: 0.06, days: 180 });
        break;
      case "recession":
        n.mods.push({ text: e.title, stability: -4, gdp: -0.05, days: 180 });
        break;
      case "oil":
        c.deposits.push({ res: "oil", rich: 2 });
        text = `Prospectors have struck oil near ${name}.`;
        break;
      case "gold":
        c.deposits.push({ res: "gold", rich: 2 });
        text = `A gold seam has been found near ${name}.`;
        break;
      case "quake": {
        c.damage = Math.min(0.9, c.damage + 0.3);
        c.pop *= 0.995;
        text = `An earthquake has struck ${name}.`;
        break;
      }
      case "pandemic":
        for (const x of cities) x.pop *= 0.99;
        n.mods.push({ text: e.title, stability: -5, gdp: -0.03, days: 120 });
        break;
      case "scandal":
        n.mods.push({ text: e.title, stability: -6, gdp: 0, days: 90 });
        break;
      case "festival":
        n.mods.push({ text: e.title, stability: 5, gdp: 0.01, days: 60 });
        break;
      case "breakthrough": {
        const b = (["civilian", "steel", "electronics", "motor"] as BuildingId[]).find((k) => (c.buildings[k] ?? 0) > 0 && (c.buildings[k] ?? 0) < BUILDINGS[k].max);
        if (!b) continue;
        c.buildings[b] = (c.buildings[b] ?? 0) + 1;
        text = `Engineers in ${name} find a better process: the ${BUILDINGS[b].name.toLowerCase()} gets a free level.`;
        break;
      }
      case "unrest":
        n.mods.push({ text: e.title, stability: -5, gdp: -0.02, days: 45 });
        break;
    }
    // The player hears about their own; the world hears about the big ones.
    if (n.id === s.player) say(s, `${e.title}: ${text}`, e.chance && ["recession", "quake", "pandemic", "scandal", "unrest"].includes(e.id) ? "bad" : "good", [n.id]);
    else if (n.last.gdp > 400) say(s, `${n.name}: ${e.title.toLowerCase()}.`, "world", [n.id]);
  }
}

/** Democracies vote every four years (the player's government can lose). */
function elections(s: State) {
  if (s.day % 365 !== 300) return;
  for (const n of s.nations) {
    if (!n.alive || n.ideology !== "democracy" || ((s.day / 365) | 0) % 4 !== (n.id % 4)) continue;
    const win = rand(s) < 0.35 + n.stability / 140;
    n.mods.push(win ? { text: "Re-elected", stability: 5, gdp: 0.01, days: 180 } : { text: "New government", stability: -6, gdp: -0.01, days: 120 });
    if (n.id === s.player) say(s, win ? "Election night: your government is re-elected with a fresh mandate." : "Election night: your party loses seats and the new parliament is restless.", win ? "good" : "bad", [n.id]);
  }
}

/* ------------------------------------------------------------------ the player's inbox */

export function answer(s: State, world: World, offerId: number, yes: boolean) {
  const o = s.offers.find((x) => x.id === offerId);
  if (!o) return "Gone";
  s.offers = s.offers.filter((x) => x !== o);
  if (!yes) {
    s.rel[o.from * s.nations.length + s.player] -= 4;
    s.rel[s.player * s.nations.length + o.from] -= 4;
    return null;
  }
  return accept(s, world, o);
}
function accept(s: State, world: World, o: Offer) {
  // Peace is settled leader to leader: the AI that offered it leads its side.
  if (o.kind === "peace" && o.warId !== undefined) return makePeace(s, world, o.warId, o.from, o.terms ?? "status");
  if (o.kind === "alliance" || o.kind === "trade" || o.kind === "nap" || o.kind === "access") return propose(s, o.from, s.player, o.kind);
  return null;
}

/* ------------------------------------------------------------------ score and saving */

/** Your nation's worth: GDP a year ($B), plus land, plus anything you've formed. */
export function score(s: State) {
  const n = s.nations[s.player];
  const cities = citiesOf(s, s.player);
  const gdp = cities.reduce((a, c) => a + c.gdp, 0) * 365 / 1000;
  return Math.round(gdp * 10 + cities.length * 25 + (n.formed ? 500 : 0));
}

export function save(s: State) {
  return JSON.stringify(s);
}
export function load(json: string): State | null {
  try {
    const s = JSON.parse(json) as State;
    if (s.version !== 1 || !Array.isArray(s.nations)) return null;
    s.offers ??= [];
    return s;
  } catch {
    return null;
  }
}

export const ideologyName = (n: Nation) => IDEOLOGIES[n.ideology].name;
