/**
 * Clanforge's rules as data: every building and troop, their levels, costs,
 * build and training times, and what the Keep's level unlocks. All names and
 * numbers are our own.
 */

export type Resource = "gold" | "mana";
export type Category = "economy" | "defense" | "army" | "wall" | "core";

export type BuildingType =
  | "keep"
  | "goldMine"
  | "manaWell"
  | "goldVault"
  | "manaVat"
  | "barracks"
  | "camp"
  | "builderHut"
  | "clanHall"
  | "cannon"
  | "archerTower"
  | "mortar"
  | "spire"
  | "airLance"
  | "wall";

export interface LevelStats {
  hp: number;
  cost: number;
  /** Seconds to build / upgrade to this level. */
  time: number;
  /** Keep level needed. */
  keep: number;
  /** Production per minute (collectors), capacity (storage, collectors' own store, camps' housing, clan hall's housing). */
  rate?: number;
  capacity?: number;
  /** Defenses: damage per shot and shots per second. */
  damage?: number;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  blurb: string;
  category: Category;
  size: number;
  resource: Resource;
  levels: LevelStats[];
  /** How many you may have at each Keep level (index = keep level - 1). */
  max: number[];
  /** Defenses. */
  range?: number;
  minRange?: number;
  rate?: number;
  splash?: number;
  targets?: "ground" | "air" | "both";
  /** Loot fraction an attacker can take from this building's store. */
  loot?: number;
}

const lv = (rows: [number, number, number, number, Partial<LevelStats>?][]): LevelStats[] => rows.map(([hp, cost, time, keep, extra]) => ({ hp, cost, time, keep, ...(extra ?? {}) }));

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  keep: {
    type: "keep",
    name: "Keep",
    blurb: "The heart of your village. Upgrade it to unlock new buildings and levels. Holds a little of each resource.",
    category: "core",
    size: 4,
    resource: "gold",
    loot: 0.3,
    max: [1, 1, 1, 1, 1, 1],
    levels: lv([
      [1500, 0, 0, 1, { capacity: 1000 }],
      [1900, 1000, 60, 1, { capacity: 2500 }],
      [2400, 4000, 300, 2, { capacity: 5000 }],
      [3000, 15000, 900, 3, { capacity: 10000 }],
      [3800, 50000, 2700, 4, { capacity: 20000 }],
      [4700, 150000, 7200, 5, { capacity: 40000 }],
    ]),
  },
  goldMine: {
    type: "goldMine",
    name: "Gold Mine",
    blurb: "Digs gold. Collect it before raiders do.",
    category: "economy",
    size: 3,
    resource: "mana",
    loot: 0.5,
    max: [1, 2, 3, 4, 5, 6],
    levels: lv([
      [400, 150, 10, 1, { rate: 40, capacity: 600 }],
      [450, 400, 60, 1, { rate: 70, capacity: 1500 }],
      [500, 1200, 240, 2, { rate: 110, capacity: 3000 }],
      [560, 4000, 900, 3, { rate: 160, capacity: 6000 }],
      [620, 12000, 2400, 4, { rate: 220, capacity: 10000 }],
      [700, 35000, 5400, 5, { rate: 300, capacity: 16000 }],
    ]),
  },
  manaWell: {
    type: "manaWell",
    name: "Mana Well",
    blurb: "Draws mana from the ground. Mana trains your army.",
    category: "economy",
    size: 3,
    resource: "gold",
    loot: 0.5,
    max: [1, 2, 3, 4, 5, 6],
    levels: lv([
      [400, 150, 10, 1, { rate: 40, capacity: 600 }],
      [450, 400, 60, 1, { rate: 70, capacity: 1500 }],
      [500, 1200, 240, 2, { rate: 110, capacity: 3000 }],
      [560, 4000, 900, 3, { rate: 160, capacity: 6000 }],
      [620, 12000, 2400, 4, { rate: 220, capacity: 10000 }],
      [700, 35000, 5400, 5, { rate: 300, capacity: 16000 }],
    ]),
  },
  goldVault: {
    type: "goldVault",
    name: "Gold Vault",
    blurb: "Stores gold. More vaults, more room to save for big upgrades.",
    category: "economy",
    size: 3,
    resource: "mana",
    loot: 0.2,
    max: [1, 1, 2, 2, 3, 4],
    levels: lv([
      [600, 300, 15, 1, { capacity: 3000 }],
      [750, 1500, 120, 2, { capacity: 8000 }],
      [900, 5000, 600, 3, { capacity: 20000 }],
      [1100, 15000, 1800, 4, { capacity: 50000 }],
      [1300, 40000, 3600, 5, { capacity: 100000 }],
    ]),
  },
  manaVat: {
    type: "manaVat",
    name: "Mana Vat",
    blurb: "Stores mana.",
    category: "economy",
    size: 3,
    resource: "gold",
    loot: 0.2,
    max: [1, 1, 2, 2, 3, 4],
    levels: lv([
      [600, 300, 15, 1, { capacity: 3000 }],
      [750, 1500, 120, 2, { capacity: 8000 }],
      [900, 5000, 600, 3, { capacity: 20000 }],
      [1100, 15000, 1800, 4, { capacity: 50000 }],
      [1300, 40000, 3600, 5, { capacity: 100000 }],
    ]),
  },
  barracks: {
    type: "barracks",
    name: "Barracks",
    blurb: "Trains troops. Each level unlocks a new troop.",
    category: "army",
    size: 3,
    resource: "mana",
    max: [1, 1, 2, 2, 3, 3],
    levels: lv([
      [350, 200, 10, 1],
      [400, 1000, 120, 1],
      [450, 4000, 600, 2],
      [520, 12000, 1800, 3],
      [600, 30000, 3600, 4],
      [700, 80000, 7200, 5],
    ]),
  },
  camp: {
    type: "camp",
    name: "War Camp",
    blurb: "Houses your army. More camps, bigger raids.",
    category: "army",
    size: 4,
    resource: "mana",
    max: [1, 2, 2, 3, 3, 4],
    levels: lv([
      [250, 250, 15, 1, { capacity: 20 }],
      [300, 2000, 300, 2, { capacity: 30 }],
      [350, 10000, 1200, 3, { capacity: 35 }],
      [400, 40000, 3600, 4, { capacity: 40 }],
      [450, 100000, 7200, 5, { capacity: 45 }],
    ]),
  },
  builderHut: {
    type: "builderHut",
    name: "Builder's Hut",
    blurb: "Each hut is one builder: one upgrade at a time per builder.",
    category: "core",
    size: 2,
    resource: "gold",
    max: [2, 2, 3, 3, 4, 5],
    levels: lv([[250, 0, 0, 1]]),
  },
  clanHall: {
    type: "clanHall",
    name: "Clan Hall",
    blurb: "Your clan sends troops here. Bring them on a raid as reinforcements.",
    category: "army",
    size: 3,
    resource: "gold",
    max: [0, 0, 1, 1, 1, 1],
    levels: lv([
      [1000, 10000, 600, 3, { capacity: 10 }],
      [1400, 40000, 2400, 4, { capacity: 15 }],
      [1800, 120000, 6000, 5, { capacity: 20 }],
    ]),
  },
  cannon: {
    type: "cannon",
    name: "Cannon",
    blurb: "Heavy shots at ground troops. Can't hit fliers.",
    category: "defense",
    size: 3,
    resource: "gold",
    range: 9,
    rate: 0.8,
    targets: "ground",
    max: [2, 2, 3, 4, 5, 6],
    levels: lv([
      [420, 250, 10, 1, { damage: 11 }],
      [470, 1000, 120, 1, { damage: 15 }],
      [520, 4000, 600, 2, { damage: 20 }],
      [570, 12000, 1800, 3, { damage: 26 }],
      [630, 30000, 3600, 4, { damage: 34 }],
      [700, 75000, 7200, 5, { damage: 44 }],
    ]),
  },
  archerTower: {
    type: "archerTower",
    name: "Archer Tower",
    blurb: "Long range, quick arrows, hits ground and air.",
    category: "defense",
    size: 3,
    resource: "gold",
    range: 10,
    rate: 1.0,
    targets: "both",
    max: [1, 2, 2, 3, 4, 5],
    levels: lv([
      [380, 1000, 30, 1, { damage: 9 }],
      [420, 2000, 180, 2, { damage: 12 }],
      [470, 6000, 900, 2, { damage: 16 }],
      [520, 15000, 2400, 3, { damage: 21 }],
      [580, 40000, 5400, 4, { damage: 27 }],
      [650, 90000, 9000, 5, { damage: 34 }],
    ]),
  },
  mortar: {
    type: "mortar",
    name: "Mortar",
    blurb: "Lobs shells that smash groups. Blind up close.",
    category: "defense",
    size: 3,
    resource: "gold",
    range: 11,
    minRange: 4,
    rate: 0.2,
    splash: 1.6,
    targets: "ground",
    max: [0, 0, 1, 1, 2, 3],
    levels: lv([
      [400, 8000, 600, 3, { damage: 26 }],
      [450, 20000, 1800, 4, { damage: 34 }],
      [500, 50000, 4200, 5, { damage: 44 }],
    ]),
  },
  spire: {
    type: "spire",
    name: "Storm Spire",
    blurb: "Arcs of lightning that jump through a crowd, ground or air.",
    category: "defense",
    size: 3,
    resource: "gold",
    range: 7,
    rate: 0.65,
    splash: 1.2,
    targets: "both",
    max: [0, 0, 0, 1, 2, 2],
    levels: lv([
      [600, 25000, 1800, 4, { damage: 16 }],
      [660, 60000, 4800, 5, { damage: 21 }],
      [720, 120000, 9000, 6, { damage: 27 }],
    ]),
  },
  airLance: {
    type: "airLance",
    name: "Air Lance",
    blurb: "Fires bolts at anything flying. Deadly to drakes.",
    category: "defense",
    size: 3,
    resource: "gold",
    range: 10,
    rate: 1.0,
    targets: "air",
    max: [0, 0, 0, 1, 1, 2],
    levels: lv([
      [700, 22000, 1800, 4, { damage: 80 }],
      [780, 55000, 4800, 5, { damage: 105 }],
      [860, 110000, 9000, 6, { damage: 135 }],
    ]),
  },
  wall: {
    type: "wall",
    name: "Wall",
    blurb: "Keeps raiders out (until they break through).",
    category: "wall",
    size: 1,
    resource: "gold",
    max: [25, 50, 75, 100, 125, 150],
    levels: lv([
      [300, 50, 0, 1],
      [550, 1000, 0, 2],
      [900, 5000, 0, 3],
      [1400, 15000, 0, 4],
      [2000, 40000, 0, 5],
    ]),
  },
};

export type TroopType = "brawler" | "ranger" | "raider" | "brute" | "sapper" | "drake";

export interface TroopDef {
  type: TroopType;
  name: string;
  blurb: string;
  housing: number;
  hp: number;
  /** Damage per second. */
  dps: number;
  speed: number;
  range: number;
  flying: boolean;
  /** What it goes for first. */
  prefers: "any" | "resources" | "defenses" | "walls";
  /** Damage multiplier against what it prefers. */
  bonus: number;
  /** Splash radius (drakes' breath, sappers' charge). */
  splash?: number;
  /** Mana to train, and seconds. */
  cost: number;
  time: number;
  /** Barracks level needed. */
  barracks: number;
  color: string;
}

export const TROOPS: Record<TroopType, TroopDef> = {
  brawler: { type: "brawler", name: "Brawler", blurb: "Tough melee fighter with a club. Goes for whatever's nearest.", housing: 1, hp: 60, dps: 10, speed: 2.0, range: 0.6, flying: false, prefers: "any", bonus: 1, cost: 25, time: 5, barracks: 1, color: "#e0a63a" },
  ranger: { type: "ranger", name: "Ranger", blurb: "Shoots over walls from range. Fragile.", housing: 1, hp: 26, dps: 9, speed: 2.4, range: 3.5, flying: false, prefers: "any", bonus: 1, cost: 50, time: 6, barracks: 2, color: "#3fa34d" },
  raider: { type: "raider", name: "Raider", blurb: "Fast and greedy: goes for gold and mana, doing double damage to them.", housing: 1, hp: 30, dps: 12, speed: 3.6, range: 0.6, flying: false, prefers: "resources", bonus: 2, cost: 40, time: 6, barracks: 3, color: "#7c3aed" },
  brute: { type: "brute", name: "Brute", blurb: "Huge and slow. Ignores everything but defenses.", housing: 5, hp: 420, dps: 14, speed: 1.4, range: 1, flying: false, prefers: "defenses", bonus: 1, cost: 250, time: 20, barracks: 4, color: "#b45309" },
  sapper: { type: "sapper", name: "Sapper", blurb: "Runs at walls with a powder keg. Blows a hole (and itself up).", housing: 2, hp: 20, dps: 0, speed: 3.0, range: 0.5, flying: false, prefers: "walls", bonus: 1, splash: 1.5, cost: 100, time: 10, barracks: 5, color: "#64748b" },
  drake: { type: "drake", name: "Drake", blurb: "A young dragon. Flies over walls and breathes fire on groups.", housing: 15, hp: 1400, dps: 70, speed: 1.9, range: 2.5, flying: true, prefers: "any", bonus: 1, splash: 1.2, cost: 2000, time: 60, barracks: 6, color: "#dc2626" },
};

export const SAPPER_DAMAGE = 900;

/** Village grid: 40 × 40 tiles; raids are deployed from the 3-tile border round it. */
export const GRID = 40;
export const DEPLOY = 3;

/** Crystals to finish a timer now (1 per 2 minutes left, minimum 1). */
export const finishCost = (secondsLeft: number) => Math.max(1, Math.ceil(secondsLeft / 120));

/** Raid search costs a little gold, scaling with the Keep. */
export const searchCost = (keep: number) => 50 * keep;

export const BATTLE_SECONDS = 180;

/** League names by trophies. */
export const LEAGUES = [
  { min: 0, name: "Unranked" },
  { min: 400, name: "Copper" },
  { min: 800, name: "Bronze" },
  { min: 1200, name: "Silver" },
  { min: 1600, name: "Gold" },
  { min: 2000, name: "Crystal" },
  { min: 2600, name: "Champion" },
  { min: 3200, name: "Legend" },
];
export const leagueFor = (t: number) => [...LEAGUES].reverse().find((l) => t >= l.min)!.name;
