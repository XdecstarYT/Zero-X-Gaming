/**
 * Heatwave's fixed data: vehicles, weapons, the two leads, clothes, shops and prices.
 * Everything here is original to Heatwave.
 */

export const GAME_SLUG = "heatwave";
export const SAVE_KEY = "zx-heatwave-save";
export const PREFS_KEY = "zx-heatwave-prefs";

/* ------------------------------------------------------------------ vehicles */

/** The body each vehicle borrows from the shared car kit (Code 3's models), or a model of its own. */
export type Body = "sedan" | "suv" | "van" | "pickup" | "sports" | "cruiser" | "interceptor" | "pursuit" | "transport" | "ambulance" | "bike" | "boat" | "airboat" | "heli";

export type VehicleKind =
  | "brisa"
  | "aria"
  | "taxi"
  | "trek"
  | "ranger"
  | "cargo"
  | "vanta"
  | "stallion"
  | "furia"
  | "police"
  | "policeSuv"
  | "swat"
  | "ambulance"
  | "armored"
  | "bike"
  | "speedboat"
  | "airboat"
  | "heli";

export interface VehicleSpec {
  name: string;
  body: Body;
  /** Scale on the shared body (a compact is a small sedan). */
  scale: number;
  len: number;
  wid: number;
  /** Top speed (m/s), acceleration and braking (m/s²), lateral grip (1/s), mass (t). */
  top: number;
  accel: number;
  brake: number;
  grip: number;
  mass: number;
  /** Steering lock (rad) and wheelbase (m). */
  lock: number;
  base: number;
  hp: number;
  seats: number;
  water?: boolean;
  air?: boolean;
  police?: boolean;
  /** What a chop shop pays for one in good nick. */
  value: number;
  colors?: string[];
}

export const VEHICLES: Record<VehicleKind, VehicleSpec> = {
  brisa: { name: "Brisa", body: "sedan", scale: 0.88, len: 4.0, wid: 1.65, top: 38, accel: 6, brake: 11, grip: 9, mass: 1.1, lock: 0.62, base: 2.4, hp: 800, seats: 4, value: 1200 },
  aria: { name: "Norden Aria", body: "sedan", scale: 1, len: 4.6, wid: 1.85, top: 43, accel: 6.8, brake: 11.5, grip: 9.2, mass: 1.5, lock: 0.58, base: 2.75, hp: 1000, seats: 4, value: 2000 },
  taxi: { name: "Sunline Cab", body: "sedan", scale: 1, len: 4.6, wid: 1.85, top: 42, accel: 6.5, brake: 11, grip: 9, mass: 1.5, lock: 0.58, base: 2.75, hp: 1000, seats: 4, value: 1500, colors: ["#f2c230"] },
  trek: { name: "Halvor Trek", body: "suv", scale: 1, len: 4.9, wid: 2, top: 41, accel: 6.3, brake: 10.5, grip: 8.3, mass: 2.1, lock: 0.56, base: 2.9, hp: 1250, seats: 4, value: 2600 },
  ranger: { name: "Mesa Ranger", body: "pickup", scale: 1, len: 5.5, wid: 2, top: 41, accel: 6.2, brake: 10, grip: 7.8, mass: 2.3, lock: 0.55, base: 3.2, hp: 1300, seats: 2, value: 2300 },
  cargo: { name: "Orrin Cargo", body: "van", scale: 1, len: 5.3, wid: 2.05, top: 35, accel: 4.8, brake: 9, grip: 7.2, mass: 2.6, lock: 0.55, base: 3.2, hp: 1400, seats: 2, value: 1800 },
  vanta: { name: "Vanta GT", body: "sports", scale: 1, len: 4.4, wid: 1.9, top: 61, accel: 10.5, brake: 13.5, grip: 10.8, mass: 1.35, lock: 0.58, base: 2.6, hp: 900, seats: 2, value: 9000, colors: ["#d81e2b", "#f2c230", "#e8e8e6", "#1c1f24", "#1f66d6", "#f08a5d"] },
  stallion: { name: "Castell Stallion", body: "pursuit", scale: 1, len: 4.7, wid: 1.95, top: 56, accel: 9.5, brake: 12, grip: 9.6, mass: 1.6, lock: 0.56, base: 2.8, hp: 1050, seats: 2, value: 6500, colors: ["#7a1d1d", "#1d3f7a", "#1c1f24", "#f2b134", "#2f5a3a", "#e8e8e6"] },
  furia: { name: "Furia RS", body: "pursuit", scale: 0.96, len: 4.5, wid: 1.95, top: 72, accel: 12.5, brake: 15, grip: 12, mass: 1.4, lock: 0.56, base: 2.65, hp: 850, seats: 2, value: 22000, colors: ["#e14b6a", "#3fd0c9", "#f2c230", "#e8e8e6", "#7a5cc4"] },
  police: { name: "SPD Cruiser", body: "cruiser", scale: 1, len: 5, wid: 1.9, top: 54, accel: 8.6, brake: 12.5, grip: 10.2, mass: 1.8, lock: 0.57, base: 2.9, hp: 1300, seats: 4, police: true, value: 0 },
  policeSuv: { name: "SPD Interceptor", body: "interceptor", scale: 1, len: 5.05, wid: 2, top: 55, accel: 9, brake: 12.5, grip: 10, mass: 2.2, lock: 0.56, base: 3, hp: 1500, seats: 4, police: true, value: 0 },
  swat: { name: "SPD Tactical", body: "transport", scale: 1, len: 5.9, wid: 2.1, top: 42, accel: 6, brake: 9.5, grip: 7.6, mass: 3.2, lock: 0.52, base: 3.6, hp: 2600, seats: 4, police: true, value: 0 },
  ambulance: { name: "Ambulance", body: "ambulance", scale: 1, len: 6.2, wid: 2.2, top: 42, accel: 5.4, brake: 9, grip: 7, mass: 3.2, lock: 0.52, base: 3.8, hp: 1800, seats: 2, value: 0 },
  armored: { name: "Securitas Armoured Van", body: "van", scale: 1.05, len: 5.6, wid: 2.15, top: 34, accel: 4.2, brake: 8.5, grip: 7, mass: 4.2, lock: 0.5, base: 3.4, hp: 4200, seats: 2, value: 0, colors: ["#3d4a3f"] },
  bike: { name: "Rapido 600", body: "bike", scale: 1, len: 2.1, wid: 0.8, top: 58, accel: 11, brake: 13, grip: 11, mass: 0.35, lock: 0.5, base: 1.45, hp: 500, seats: 2, value: 3000, colors: ["#d81e2b", "#1c1f24", "#f2c230", "#1f66d6", "#e8e8e6"] },
  speedboat: { name: "Squall Speedboat", body: "boat", scale: 1, len: 7, wid: 2.4, top: 30, accel: 6, brake: 4, grip: 2.2, mass: 1.8, lock: 0.5, base: 4, hp: 1400, seats: 4, water: true, value: 0, colors: ["#e8e8e6", "#1f66d6", "#d81e2b"] },
  airboat: { name: "Gator Airboat", body: "airboat", scale: 1, len: 4.6, wid: 2.2, top: 24, accel: 6, brake: 3, grip: 1.6, mass: 0.9, lock: 0.6, base: 2.6, hp: 900, seats: 2, water: true, value: 0, colors: ["#4d5a3a"] },
  heli: { name: "SPD Air One", body: "heli", scale: 1, len: 11, wid: 2.4, top: 40, accel: 8, brake: 8, grip: 4, mass: 2.5, lock: 0, base: 0, hp: 1800, seats: 2, air: true, police: true, value: 0 },
};

/** Ordinary traffic, by district feel (weighted lists). */
export const TRAFFIC: VehicleKind[] = ["aria", "aria", "aria", "brisa", "brisa", "trek", "trek", "ranger", "cargo", "taxi", "taxi", "stallion", "vanta", "bike"];
export const RICH_TRAFFIC: VehicleKind[] = ["vanta", "vanta", "furia", "trek", "trek", "stallion", "aria", "bike"];
export const GLADES_TRAFFIC: VehicleKind[] = ["ranger", "ranger", "ranger", "cargo", "brisa", "trek"];
export const PAINT = ["#1c1f24", "#e8e8e6", "#8a8f96", "#7a1d1d", "#1d3f7a", "#2f5a3a", "#c9b27a", "#b8c4cf", "#3a3a44", "#d0662b", "#6b2d6b", "#3fa7a0", "#e14b6a", "#f2b134"];

/* ------------------------------------------------------------------ weapons */

export type WeaponId = "fists" | "bat" | "pistol" | "smg" | "shotgun" | "rifle" | "grenade";

export interface WeaponSpec {
  name: string;
  icon: string;
  melee?: boolean;
  thrown?: boolean;
  /** Damage per hit (per pellet for the shotgun). */
  dmg: number;
  pellets: number;
  range: number;
  /** Shots a second. */
  rate: number;
  clip: number;
  reload: number;
  /** Spread (rad) when firing from the hip / aimed. */
  spread: number;
  auto: boolean;
  price: number;
  /** A box of ammo: how many rounds, and the price. */
  ammo: [number, number];
  /** How far the noise carries (m): who hears it and runs, and who calls it in. */
  noise: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  fists: { name: "Fists", icon: "✊", melee: true, dmg: 9, pellets: 1, range: 1.7, rate: 2.6, clip: 0, reload: 0, spread: 0, auto: false, price: 0, ammo: [0, 0], noise: 8 },
  bat: { name: "Baseball Bat", icon: "🏏", melee: true, dmg: 28, pellets: 1, range: 2.2, rate: 1.5, clip: 0, reload: 0, spread: 0, auto: false, price: 120, ammo: [0, 0], noise: 10 },
  pistol: { name: "Pistol", icon: "🔫", dmg: 26, pellets: 1, range: 60, rate: 4, clip: 12, reload: 1.2, spread: 0.035, auto: false, price: 450, ammo: [48, 60], noise: 70 },
  smg: { name: "SMG", icon: "🔫", dmg: 17, pellets: 1, range: 50, rate: 11, clip: 30, reload: 1.6, spread: 0.065, auto: true, price: 1600, ammo: [90, 140], noise: 80 },
  shotgun: { name: "Pump Shotgun", icon: "🔫", dmg: 15, pellets: 8, range: 26, rate: 1.15, clip: 8, reload: 2.2, spread: 0.11, auto: false, price: 1250, ammo: [24, 110], noise: 90 },
  rifle: { name: "Carbine Rifle", icon: "🔫", dmg: 31, pellets: 1, range: 95, rate: 8, clip: 30, reload: 1.9, spread: 0.03, auto: true, price: 3600, ammo: [90, 220], noise: 100 },
  grenade: { name: "Grenade", icon: "💣", thrown: true, dmg: 160, pellets: 1, range: 24, rate: 1, clip: 1, reload: 0.6, spread: 0, auto: false, price: 220, ammo: [3, 600], noise: 120 },
};

export const WEAPON_ORDER: WeaponId[] = ["fists", "bat", "pistol", "smg", "shotgun", "rifle", "grenade"];
export const ARMOR_PRICE = 250;

/* ------------------------------------------------------------------ the leads */

export type CharId = "nina" | "dex";

export interface Lead {
  id: CharId;
  name: string;
  full: string;
  blurb: string;
  /** Shared people-kit look (Code 3's articulated people). */
  skin: string;
  hair: string;
  female: boolean;
  hairStyle: "short" | "long" | "ponytail" | "buzz" | "bald";
  beard: boolean;
  /** Each lead's special: Nina drives, Dex shoots and soaks up damage. */
  perk: string;
  /** Where they start (a safehouse). */
  home: string;
  /** Their signature ride (parked outside home). */
  ride: VehicleKind;
  rideColor: string;
}

export const LEADS: Record<CharId, Lead> = {
  nina: {
    id: "nina",
    name: "Nina",
    full: "Nina Cruz",
    blurb: "Grew up on the Strand, drove getaway for her cousin at nineteen. Never been caught, never stopped looking over her shoulder.",
    skin: "#c8916a",
    hair: "#24170f",
    female: true,
    hairStyle: "ponytail",
    beard: false,
    perk: "Wheelwoman: her cars grip harder, and she shakes off the police faster in a car.",
    home: "safe-nina",
    ride: "stallion",
    rideColor: "#7a1d1d",
  },
  dex: {
    id: "dex",
    name: "Dex",
    full: "Dex Holloway",
    blurb: "Twelve years humping containers at the Harbor, laid off with a bad back and a worse temper. Owes money to the wrong man.",
    skin: "#e2b48f",
    hair: "#6b4a2e",
    female: false,
    hairStyle: "short",
    beard: true,
    perk: "Bruiser: hits harder, takes less damage, and steadier with a gun.",
    home: "safe-dex",
    ride: "ranger",
    rideColor: "#2f5a3a",
  },
};

/* ------------------------------------------------------------------ clothes */

export interface Outfit {
  id: string;
  name: string;
  shirt: string;
  pants: string;
  top: "tee" | "long" | "tank" | "jacket" | "hoodie" | "suit";
  bottom: "trousers" | "shorts" | "skirt";
  hat: "none" | "cap" | "beanie";
  price: number;
  /** Only for one lead (or both if unset). */
  only?: CharId;
}

export const OUTFITS: Outfit[] = [
  { id: "nina-start", name: "Strand Casual", shirt: "#f3c1d2", pants: "#2b3a55", top: "tank", bottom: "trousers", hat: "none", price: 0, only: "nina" },
  { id: "dex-start", name: "Dockworker", shirt: "#c9853a", pants: "#3a3f47", top: "long", bottom: "trousers", hat: "cap", price: 0, only: "dex" },
  { id: "beach", name: "Beach Day", shirt: "#3fa7a0", pants: "#e8dcc0", top: "tee", bottom: "shorts", hat: "none", price: 180 },
  { id: "sunset", name: "Sunset Shirt", shirt: "#f08a5d", pants: "#e9e2d0", top: "tee", bottom: "trousers", hat: "none", price: 240 },
  { id: "night", name: "Night Out", shirt: "#1c1f24", pants: "#1c1f24", top: "jacket", bottom: "trousers", hat: "none", price: 650 },
  { id: "street", name: "Streetwear", shirt: "#7a5cc4", pants: "#2b2f36", top: "hoodie", bottom: "trousers", hat: "beanie", price: 320 },
  { id: "suit", name: "Sharp Suit", shirt: "#2b3442", pants: "#2b3442", top: "suit", bottom: "trousers", hat: "none", price: 1400 },
  { id: "white", name: "Linen Whites", shirt: "#f6f1e7", pants: "#f6f1e7", top: "long", bottom: "trousers", hat: "none", price: 900 },
  { id: "camo", name: "Swamp Camo", shirt: "#4d5a3a", pants: "#3d4530", top: "jacket", bottom: "trousers", hat: "cap", price: 420 },
  { id: "pink", name: "Flamingo", shirt: "#e14b6a", pants: "#f3c1d2", top: "tank", bottom: "skirt", hat: "none", price: 360, only: "nina" },
  { id: "heist", name: "Heist Black", shirt: "#141518", pants: "#141518", top: "long", bottom: "trousers", hat: "beanie", price: 800 },
];

/* ------------------------------------------------------------------ prices and rules */

export const START_MONEY = 500;
export const HOSPITAL_BILL = 300;
export const ARREST_FEE = 500;
export const RESPRAY_PRICE = 400;
/** A day is 24 real minutes: one game minute a second. */
export const MINUTE = 1;
export const DAY = 1440;

/** Police by wanted level: cars after you, whether they shoot, helicopters. */
export const HEAT: { cars: number; foot: boolean; shoot: boolean; heli: number; swat: number; search: number }[] = [
  { cars: 0, foot: false, shoot: false, heli: 0, swat: 0, search: 0 },
  { cars: 2, foot: true, shoot: false, heli: 0, swat: 0, search: 14 },
  { cars: 3, foot: true, shoot: true, heli: 0, swat: 0, search: 20 },
  { cars: 4, foot: true, shoot: true, heli: 1, swat: 0, search: 26 },
  { cars: 5, foot: true, shoot: true, heli: 1, swat: 1, search: 32 },
  { cars: 6, foot: true, shoot: true, heli: 2, swat: 2, search: 38 },
];

/** Radio stations: what plays in a car (synthesised; see audio.ts). */
export const STATIONS = [
  { id: "off", name: "Radio off", genre: "" },
  { id: "neon", name: "Neon 88", genre: "Synthwave" },
  { id: "calle", name: "Calle 104", genre: "Latin & reggaeton" },
  { id: "tide", name: "Low Tide FM", genre: "Chill & lo-fi" },
  { id: "bass", name: "Bass Coast", genre: "Hip-hop & trap" },
] as const;
export type StationId = (typeof STATIONS)[number]["id"];
