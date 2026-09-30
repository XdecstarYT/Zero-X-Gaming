import type { Rng } from "../engine/rng";

/**
 * Weapons, rarities and consumables. Stats are per shot; damage is split across
 * pellets for shotguns. Values are tuned for 100 HP + up to 100 shield.
 */

export type WeaponKind = "pistol" | "smg" | "ar" | "shotgun" | "sniper";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type ConsumableKind = "medkit" | "shield";

export interface WeaponDef {
  kind: WeaponKind;
  name: string;
  /** Damage per pellet. */
  damage: number;
  pellets: number;
  /** Seconds between shots. */
  interval: number;
  /** Hold-to-fire. */
  auto: boolean;
  mag: number;
  reload: number;
  /** Hip-fire spread (radians, half-angle). */
  spread: number;
  /** Aim-down-sights spread. */
  adsSpread: number;
  /** Full damage up to this distance (cells), then falls off to 50%. */
  range: number;
  /** Camera zoom when aiming. */
  zoom: number;
  /** Move speed multiplier while holding it. */
  mobility: number;
  /** How much bots/players value it for mid-range fights (loot choice). */
  tier: number;
}

export const WEAPONS: Record<WeaponKind, WeaponDef> = {
  pistol: {
    kind: "pistol",
    name: "Service Pistol",
    damage: 24,
    pellets: 1,
    interval: 0.22,
    auto: false,
    mag: 12,
    reload: 1.3,
    spread: 0.02,
    adsSpread: 0.01,
    range: 16,
    zoom: 1.15,
    mobility: 1.05,
    tier: 1,
  },
  smg: {
    kind: "smg",
    name: "Compact SMG",
    damage: 15,
    pellets: 1,
    interval: 0.075,
    auto: true,
    mag: 30,
    reload: 1.9,
    spread: 0.045,
    adsSpread: 0.025,
    range: 12,
    zoom: 1.2,
    mobility: 1.0,
    tier: 2,
  },
  ar: {
    kind: "ar",
    name: "Assault Rifle",
    damage: 28,
    pellets: 1,
    interval: 0.13,
    auto: true,
    mag: 30,
    reload: 2.2,
    spread: 0.028,
    adsSpread: 0.008,
    range: 24,
    zoom: 1.45,
    mobility: 0.95,
    tier: 3,
  },
  shotgun: {
    kind: "shotgun",
    name: "Pump Shotgun",
    damage: 10,
    pellets: 9,
    interval: 0.85,
    auto: false,
    mag: 5,
    reload: 3.4,
    spread: 0.11,
    adsSpread: 0.085,
    range: 6,
    zoom: 1.1,
    mobility: 0.95,
    tier: 2.5,
  },
  sniper: {
    kind: "sniper",
    name: "Bolt-Action Sniper",
    damage: 105,
    pellets: 1,
    interval: 1.4,
    auto: false,
    mag: 4,
    reload: 3.0,
    spread: 0.06,
    adsSpread: 0.001,
    range: 60,
    zoom: 3.5,
    mobility: 0.88,
    tier: 3,
  },
};

export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export const RARITY: Record<Rarity, { label: string; color: string; damage: number; reload: number }> = {
  common: { label: "Common", color: "#b8bcc6", damage: 1.0, reload: 1.0 },
  uncommon: { label: "Uncommon", color: "#4fd26b", damage: 1.05, reload: 0.95 },
  rare: { label: "Rare", color: "#3c9bff", damage: 1.1, reload: 0.9 },
  epic: { label: "Epic", color: "#b25cff", damage: 1.16, reload: 0.85 },
  legendary: { label: "Legendary", color: "#ffb321", damage: 1.22, reload: 0.8 },
};

export const CONSUMABLES: Record<ConsumableKind, { name: string; amount: number; useTime: number; max: number; stack: number }> = {
  medkit: { name: "Med Kit", amount: 50, useTime: 3, max: 100, stack: 3 },
  shield: { name: "Shield Potion", amount: 50, useTime: 2, max: 100, stack: 3 },
};

export interface WeaponItem {
  type: "weapon";
  kind: WeaponKind;
  rarity: Rarity;
  ammo: number;
}

export interface ConsumableItem {
  type: "consumable";
  kind: ConsumableKind;
  count: number;
}

export type Item = WeaponItem | ConsumableItem;

export const SLOTS = 5;

export function makeWeapon(kind: WeaponKind, rarity: Rarity = "common"): WeaponItem {
  return { type: "weapon", kind, rarity, ammo: WEAPONS[kind].mag };
}

export function makeConsumable(kind: ConsumableKind, count = 1): ConsumableItem {
  return { type: "consumable", kind, count };
}

/** Effective stats for a weapon item (rarity applied). */
export function weaponStats(w: WeaponItem) {
  const def = WEAPONS[w.kind];
  const r = RARITY[w.rarity];
  return { ...def, damage: def.damage * r.damage, reload: def.reload * r.reload };
}

/** Damage per pellet at a distance, with falloff beyond the weapon's range (min 50%). */
export function damageAt(w: WeaponItem, dist: number) {
  const s = weaponStats(w);
  if (dist <= s.range) return s.damage;
  return s.damage * Math.max(0.5, 1 - (dist - s.range) / s.range);
}

/** Loot value: used to decide what's worth picking up / swapping. */
export function itemValue(item: Item): number {
  if (item.type === "consumable") return 2 + item.count * 0.2;
  return WEAPONS[item.kind].tier * 2 + RARITIES.indexOf(item.rarity) * 1.2;
}

export function itemLabel(item: Item): string {
  if (item.type === "consumable") return `${CONSUMABLES[item.kind].name}${item.count > 1 ? ` ×${item.count}` : ""}`;
  return `${RARITY[item.rarity].label} ${WEAPONS[item.kind].name}`;
}

/** Floor loot table: weapons skew common, consumables ~35%. */
export function rollFloorLoot(rng: Rng): Item {
  if (rng.next() < 0.35) return makeConsumable(rng.next() < 0.5 ? "medkit" : "shield");
  return makeWeapon(rollKind(rng), rollRarity(rng, 0));
}

/** Chest loot: a better weapon plus a consumable. */
export function rollChestLoot(rng: Rng): Item[] {
  return [makeWeapon(rollKind(rng), rollRarity(rng, 1)), makeConsumable(rng.next() < 0.5 ? "medkit" : "shield", rng.int(1, 2))];
}

function rollKind(rng: Rng): WeaponKind {
  const r = rng.next();
  if (r < 0.26) return "ar";
  if (r < 0.46) return "shotgun";
  if (r < 0.66) return "smg";
  if (r < 0.84) return "pistol";
  return "sniper";
}

/** `bonus` shifts the roll up (chests roll one tier better on average). */
export function rollRarity(rng: Rng, bonus: number): Rarity {
  const weights = [44, 30, 16, 7, 3];
  let roll = rng.next() * 100;
  let i = 0;
  while (i < weights.length - 1 && roll >= weights[i]) roll -= weights[i++];
  return RARITIES[Math.min(RARITIES.length - 1, i + bonus)];
}
