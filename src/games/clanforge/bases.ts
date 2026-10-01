import { createRng } from "../engine/rng";
import { BUILDINGS, GRID, TROOPS, type BuildingType, type TroopType } from "./data";
import type { Base, BaseBuilding } from "./battle";
import { emptyArmy, fits, keepLevel, lootable, type Army, type Village } from "./village";

/**
 * Opponents: AI villages generated from a seed and a trophy count, laid out
 * the way players build: the Keep in the middle, defenses and storages in a
 * walled core, a second ring of defenses, collectors and army buildings
 * outside. Plus your own village as a base (for raids on you), and the armies
 * raiders bring.
 */

const CHIEFS = ["Ironjaw", "Mossbeard", "Red Wren", "Old Tomas", "Ash-Eye", "Gilda Stone", "Hollow Pete", "Brannoc", "The Tinker", "Sable Rook", "Mirelda", "Captain Fen", "Dusk Harrow", "Pikewood", "Juniper Vale", "Grim Okra"];
const PLACES = ["Hollow", "Marsh", "Crag", "Ford", "Hill", "Reach", "Fen", "Hold", "Tor", "Glen"];

export function baseName(seed: number) {
  const r = createRng(seed);
  return `${CHIEFS[Math.floor(r.next() * CHIEFS.length)]} of ${["Bram", "Kettle", "Wyn", "Stour", "Ember", "Lark", "Thorn"][Math.floor(r.next() * 7)]}${PLACES[Math.floor(r.next() * PLACES.length)].toLowerCase()}`;
}

/** A Keep level for a trophy count. */
export const keepForTrophies = (t: number) => Math.max(1, Math.min(6, 1 + Math.floor(t / 450)));

export function generateBase(trophies: number, seed: number): Base {
  const r = createRng(seed);
  const keep = Math.max(1, Math.min(6, keepForTrophies(trophies) + (r.next() < 0.25 ? -1 : r.next() < 0.15 ? 1 : 0)));
  const list: BaseBuilding[] = [];
  let id = 1;
  const lvlFor = (t: BuildingType) => {
    const levels = BUILDINGS[t].levels;
    let max = 0;
    for (let i = 0; i < levels.length; i++) if (levels[i].keep <= keep) max = i + 1;
    if (t === "keep") return keep;
    return Math.max(1, max - (r.next() < 0.5 ? 0 : 1));
  };
  const place = (t: BuildingType, x: number, y: number) => {
    if (!fits(list, t, x, y)) return false;
    list.push({ id: id++, type: t, x, y, level: lvlFor(t) });
    return true;
  };
  const C = 18;
  place("keep", C, C);
  const count = (t: BuildingType) => BUILDINGS[t].max[keep - 1] ?? 0;
  // Spots in rings around the Keep.
  const ring = (radius: number, n: number, phase: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = phase + (i / n) * Math.PI * 2;
      return { x: Math.round(C + 2 + Math.cos(a) * radius - 1.5), y: Math.round(C + 2 + Math.sin(a) * radius - 1.5) };
    });
  const tryRing = (t: BuildingType, rings: number[]) => {
    for (const rad of rings)
      for (const s of ring(rad, 14, r.next() * 6.28)) {
        if (place(t, s.x, s.y)) return true;
      }
    for (let k = 0; k < 200; k++) if (place(t, 2 + Math.floor(r.next() * (GRID - 6)), 2 + Math.floor(r.next() * (GRID - 6)))) return true;
    return false;
  };
  const inner: BuildingType[] = ["goldVault", "manaVat", "mortar", "spire", "airLance"];
  const middle: BuildingType[] = ["cannon", "archerTower"];
  const outer: BuildingType[] = ["goldMine", "manaWell", "barracks", "camp", "builderHut", "clanHall"];
  for (const t of inner) for (let i = 0; i < count(t); i++) tryRing(t, [4.5, 5.5]);
  for (const t of middle) for (let i = 0; i < count(t); i++) tryRing(t, [7.5, 6.5, 9]);
  // Walls: a square round the core, with a gap or two when the walls run short.
  const walls = count("wall");
  const half = keep >= 3 ? 9 : 7;
  let used = 0;
  const gap = Math.floor(r.next() * 4);
  for (let side = 0; side < 4 && used < walls; side++)
    for (let k = -half; k <= half && used < walls; k++) {
      if (keep <= 2 && side === gap && Math.abs(k) < 2) continue;
      const [x, y] = [
        [C + 2 + k, C + 2 - half],
        [C + 2 + half, C + 2 + k],
        [C + 2 - k, C + 2 + half],
        [C + 2 - half, C + 2 - k],
      ][side];
      if (place("wall", x, y)) used++;
    }
  for (const t of outer) for (let i = 0; i < count(t); i++) tryRing(t, [13, 15, 17]);
  // Loot: storages part full, collectors with a few hours' work in them.
  const fill = 0.25 + r.next() * 0.55;
  for (const b of list) {
    const def = BUILDINGS[b.type];
    if (!def.loot) continue;
    const st = def.levels[b.level - 1];
    if (b.type === "goldMine") b.gold = Math.floor((st.capacity ?? 0) * (0.3 + r.next() * 0.7) * def.loot);
    else if (b.type === "manaWell") b.mana = Math.floor((st.capacity ?? 0) * (0.3 + r.next() * 0.7) * def.loot);
    else if (b.type === "goldVault") b.gold = Math.floor((st.capacity ?? 0) * fill * def.loot);
    else if (b.type === "manaVat") b.mana = Math.floor((st.capacity ?? 0) * fill * def.loot);
    else if (b.type === "keep") {
      b.gold = Math.floor((st.capacity ?? 0) * fill * def.loot);
      b.mana = Math.floor((st.capacity ?? 0) * fill * def.loot);
    }
  }
  return { name: baseName(seed), trophies: Math.max(0, Math.round(trophies + (r.next() - 0.5) * 120)), keep, buildings: list };
}

/** Your village as a base to be raided. */
export function villageBase(v: Village, now: number): Base {
  const loot = lootable(v, now);
  return {
    name: v.name,
    trophies: v.trophies,
    keep: keepLevel(v),
    buildings: v.buildings.filter((b) => b.level > 0).map((b) => ({ id: b.id, type: b.type, level: b.level, x: b.x, y: b.y, gold: loot.get(b.id)?.gold ?? 0, mana: loot.get(b.id)?.mana ?? 0 })),
  };
}

/** An AI raider's army for a Keep level. */
export function raiderArmy(keep: number, seed: number): Army {
  const r = createRng(seed);
  const a = emptyArmy();
  let room = 20 + keep * 15;
  const pool: TroopType[] = (["brawler", "ranger", "raider", "brute", "sapper", "drake"] as TroopType[]).filter((t) => TROOPS[t].barracks <= keep);
  for (let i = 0; i < 200 && room > 0; i++) {
    const t = pool[Math.floor(r.next() * pool.length)];
    if (TROOPS[t].housing <= room && (t !== "drake" || a.drake < 2)) {
      a[t]++;
      room -= TROOPS[t].housing;
    }
  }
  return a;
}

