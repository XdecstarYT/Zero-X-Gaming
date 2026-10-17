/**
 * Sovereign's rules as data: resources and goods, buildings, units, ideologies, laws, formable
 * nations, events, and the real-world facts the map starts from (who governs how, who mines what).
 */

export const GAME_SLUG = "sovereign";
export const SAVE_KEY = "zx-sovereign-save";
export const PREFS_KEY = "zx-sovereign-prefs";

/* ------------------------------------------------------------------ resources and goods */

export const RESOURCES = ["oil", "iron", "copper", "aluminium", "gold", "diamond", "uranium", "phosphate", "chromium", "titanium", "tungsten"] as const;
export const GOODS = ["steel", "electronics", "motorParts", "consumerGoods", "fertilizer"] as const;
export type ResourceId = (typeof RESOURCES)[number];
export type GoodId = (typeof GOODS)[number];
export type ItemId = ResourceId | GoodId;
export const ITEMS: readonly ItemId[] = [...RESOURCES, ...GOODS];

export const ITEM_INFO: Record<ItemId, { name: string; icon: string; price: number }> = {
  oil: { name: "Oil", icon: "🛢️", price: 2.2 },
  iron: { name: "Iron", icon: "⛓️", price: 1.6 },
  copper: { name: "Copper", icon: "🟠", price: 3 },
  aluminium: { name: "Aluminium", icon: "🥫", price: 3.2 },
  gold: { name: "Gold", icon: "🪙", price: 18 },
  diamond: { name: "Diamond", icon: "💎", price: 26 },
  uranium: { name: "Uranium", icon: "☢️", price: 22 },
  phosphate: { name: "Phosphate", icon: "🧪", price: 1.6 },
  chromium: { name: "Chromium", icon: "🔩", price: 5 },
  titanium: { name: "Titanium", icon: "🛩️", price: 8 },
  tungsten: { name: "Tungsten", icon: "⚙️", price: 7 },
  steel: { name: "Steel", icon: "🏗️", price: 6 },
  electronics: { name: "Electronics", icon: "💡", price: 16 },
  motorParts: { name: "Motor parts", icon: "🔧", price: 13 },
  consumerGoods: { name: "Consumer goods", icon: "🛍️", price: 4.5 },
  fertilizer: { name: "Fertilizer", icon: "🌾", price: 4 },
};

/* ------------------------------------------------------------------ buildings */

export type BuildingId =
  | "mine"
  | "civilian"
  | "steel"
  | "electronics"
  | "motor"
  | "fertilizer"
  | "arms"
  | "shipyard"
  | "oilPower"
  | "nuclearPower"
  | "renewable"
  | "port"
  | "airport"
  | "fort"
  | "silo";

export interface BuildingDef {
  id: BuildingId;
  name: string;
  icon: string;
  /** Cost of the first level ($M); each level after costs more. */
  cost: number;
  max: number;
  days: number;
  /** Power used per level (or made, if negative). */
  power: number;
  blurb: string;
  /** Per level per day. */
  input?: Partial<Record<ItemId, number>>;
  output?: Partial<Record<ItemId, number>>;
  needs?: "coast" | "deposit" | "uranium" | "nuclear";
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  mine: { id: "mine", name: "Mine", icon: "⛏️", cost: 60, max: 5, days: 10, power: 1, needs: "deposit", blurb: "Digs out the city's deposits: more the richer they are." },
  civilian: { id: "civilian", name: "Consumer factory", icon: "🏭", cost: 120, max: 5, days: 14, power: 2, output: { consumerGoods: 2 }, blurb: "Makes consumer goods your people buy. Short of them, they get restless." },
  steel: { id: "steel", name: "Steel mill", icon: "🏗️", cost: 150, max: 5, days: 16, power: 3, input: { iron: 2, chromium: 0.1 }, output: { steel: 1.2 }, blurb: "Iron (and a little chromium) into steel for tanks, ships and shipyards." },
  electronics: { id: "electronics", name: "Electronics plant", icon: "💡", cost: 200, max: 5, days: 18, power: 3, input: { copper: 1, gold: 0.2 }, output: { electronics: 1 }, blurb: "Copper and a little gold into electronics: aircraft, ships and air defence need them." },
  motor: { id: "motor", name: "Motor works", icon: "🔧", cost: 180, max: 5, days: 18, power: 2, input: { steel: 1, aluminium: 1 }, output: { motorParts: 1 }, blurb: "Steel and aluminium into motor parts for tanks and artillery." },
  fertilizer: { id: "fertilizer", name: "Fertilizer plant", icon: "🌾", cost: 100, max: 3, days: 12, power: 1, input: { phosphate: 1 }, output: { fertilizer: 1.5 }, blurb: "Phosphate into fertilizer: farms feed more, cities grow faster." },
  arms: { id: "arms", name: "Arms factory", icon: "🛠️", cost: 250, max: 5, days: 20, power: 3, blurb: "Builds tanks, artillery, air defence and aircraft. Each level trains units faster." },
  shipyard: { id: "shipyard", name: "Shipyard", icon: "⚓", cost: 300, max: 3, days: 24, power: 2, needs: "coast", blurb: "Builds warships at a port. Each level builds them faster." },
  oilPower: { id: "oilPower", name: "Oil power station", icon: "🔥", cost: 110, max: 5, days: 12, power: -12, input: { oil: 0.5 }, blurb: "Burns oil for 12 power a level." },
  nuclearPower: { id: "nuclearPower", name: "Nuclear power station", icon: "⚛️", cost: 600, max: 3, days: 40, power: -45, input: { uranium: 0.06 }, blurb: "45 power a level on a trickle of uranium." },
  renewable: { id: "renewable", name: "Wind and solar farm", icon: "🌬️", cost: 170, max: 5, days: 14, power: -6, blurb: "6 power a level, no fuel." },
  port: { id: "port", name: "Port", icon: "🚢", cost: 90, max: 3, days: 12, power: 1, needs: "coast", blurb: "Trade by sea (+income) and a base for your fleet." },
  airport: { id: "airport", name: "Air base", icon: "🛫", cost: 120, max: 3, days: 14, power: 1, blurb: "Bases aircraft. Each level holds more squadrons." },
  fort: { id: "fort", name: "Fortifications", icon: "🏰", cost: 80, max: 3, days: 15, power: 0, blurb: "Bunkers and lines: defenders here fight much harder." },
  silo: { id: "silo", name: "Missile silo", icon: "🚀", cost: 900, max: 1, days: 45, power: 2, blurb: "Launches missiles (and warheads, with a nuclear programme)." },
};
export const BUILDING_ORDER: BuildingId[] = ["mine", "civilian", "steel", "electronics", "motor", "fertilizer", "oilPower", "renewable", "nuclearPower", "arms", "shipyard", "port", "airport", "fort", "silo"];

export function buildingCost(id: BuildingId, level: number) {
  return Math.round(BUILDINGS[id].cost * (1 + level * 0.55));
}
export const developCost = (dev: number) => Math.round(45 * (dev + 1) ** 1.7);
export const MAX_DEV = 10;

/* ------------------------------------------------------------------ units */

export type UnitKind = "infantry" | "tank" | "artillery" | "antiair" | "fighter" | "bomber" | "destroyer" | "submarine" | "battleship" | "carrier" | "missile" | "nuke";
export type Domain = "land" | "sea" | "air" | "strike";

export interface UnitDef {
  kind: UnitKind;
  name: string;
  icon: string;
  domain: Domain;
  cost: number;
  manpower: number;
  items?: Partial<Record<ItemId, number>>;
  days: number;
  upkeep: number;
  /** Oil a day while it exists. */
  oil?: number;
  hp: number;
  /** Damage a day against land, sea and air targets. */
  atk: { land: number; sea: number; air: number };
  def: number;
  /** km a day. */
  speed: number;
  /** Strike range in km (aircraft from base, ships' guns, missiles). */
  range?: number;
  needs?: BuildingId;
  blurb: string;
}

export const UNITS: Record<UnitKind, UnitDef> = {
  infantry: { kind: "infantry", name: "Infantry", icon: "🪖", domain: "land", cost: 30, manpower: 2000, days: 5, upkeep: 0.25, hp: 100, atk: { land: 10, sea: 0, air: 1 }, def: 1.3, speed: 90, blurb: "Cheap and steady. Holds ground, takes cities." },
  tank: { kind: "tank", name: "Tanks", icon: "🛡️", domain: "land", cost: 140, manpower: 800, items: { steel: 4, motorParts: 2 }, days: 10, upkeep: 0.9, oil: 0.15, hp: 180, atk: { land: 34, sea: 0, air: 0 }, def: 1.1, speed: 160, needs: "arms", blurb: "Fast and hard-hitting: breaks lines and runs down infantry." },
  artillery: { kind: "artillery", name: "Artillery", icon: "💥", domain: "land", cost: 90, manpower: 900, items: { steel: 2, motorParts: 1, tungsten: 0.5 }, days: 8, upkeep: 0.5, hp: 80, atk: { land: 30, sea: 4, air: 0 }, def: 0.7, speed: 80, needs: "arms", blurb: "Shells whatever its line is fighting. Weak if caught alone." },
  antiair: { kind: "antiair", name: "Air defence", icon: "📡", domain: "land", cost: 100, manpower: 600, items: { steel: 1.5, electronics: 1.5 }, days: 8, upkeep: 0.5, hp: 90, atk: { land: 3, sea: 0, air: 34 }, def: 0.9, speed: 90, needs: "arms", blurb: "Shoots down aircraft over the army or city it guards." },
  fighter: { kind: "fighter", name: "Fighters", icon: "✈️", domain: "air", cost: 200, manpower: 200, items: { aluminium: 3, electronics: 2, titanium: 1 }, days: 12, upkeep: 1.6, oil: 0.25, hp: 90, atk: { land: 6, sea: 4, air: 40 }, def: 1, speed: 2600, range: 1400, needs: "arms", blurb: "Wins the air over a patrol zone: friendly armies there fight better, enemy bombers die." },
  bomber: { kind: "bomber", name: "Bombers", icon: "🛩️", domain: "air", cost: 300, manpower: 300, items: { aluminium: 4, electronics: 2, titanium: 1 }, days: 15, upkeep: 2.4, oil: 0.4, hp: 110, atk: { land: 46, sea: 26, air: 4 }, def: 0.8, speed: 2100, range: 2200, needs: "arms", blurb: "Bombs armies, fleets and a city's buildings in its zone." },
  destroyer: { kind: "destroyer", name: "Destroyers", icon: "🚤", domain: "sea", cost: 240, manpower: 300, items: { steel: 6, electronics: 2 }, days: 16, upkeep: 1.6, oil: 0.25, hp: 180, atk: { land: 8, sea: 26, air: 14 }, def: 1, speed: 700, range: 60, needs: "shipyard", blurb: "Fast escorts: hunt submarines and guard the convoys." },
  submarine: { kind: "submarine", name: "Submarines", icon: "🐟", domain: "sea", cost: 220, manpower: 150, items: { steel: 5, electronics: 2 }, days: 16, upkeep: 1.3, oil: 0.15, hp: 120, atk: { land: 0, sea: 40, air: 0 }, def: 0.8, speed: 520, needs: "shipyard", blurb: "Sinks ships and troops at sea. Blockades enemy ports." },
  battleship: { kind: "battleship", name: "Battleships", icon: "⛴️", domain: "sea", cost: 900, manpower: 1500, items: { steel: 22, electronics: 4 }, days: 34, upkeep: 6, oil: 0.8, hp: 620, atk: { land: 34, sea: 58, air: 10 }, def: 1.4, speed: 520, range: 140, needs: "shipyard", blurb: "Huge guns that also shell coastal armies and cities." },
  carrier: { kind: "carrier", name: "Aircraft carrier", icon: "🛳️", domain: "sea", cost: 1800, manpower: 3000, items: { steel: 26, electronics: 8, aluminium: 6 }, days: 45, upkeep: 11, oil: 1, hp: 700, atk: { land: 30, sea: 42, air: 36 }, def: 1.1, speed: 560, range: 900, needs: "shipyard", blurb: "A floating air base: its air wing strikes anything within 900 km." },
  missile: { kind: "missile", name: "Cruise missile", icon: "🎯", domain: "strike", cost: 220, manpower: 0, items: { electronics: 3, aluminium: 2, tungsten: 1 }, days: 10, upkeep: 0.1, hp: 1, atk: { land: 160, sea: 160, air: 0 }, def: 0, speed: 0, range: 3000, needs: "silo", blurb: "One shot from a silo: wrecks an army or a building anywhere within 3,000 km." },
  nuke: { kind: "nuke", name: "Nuclear warhead", icon: "☢️", domain: "strike", cost: 4000, manpower: 0, items: { uranium: 12, electronics: 6 }, days: 60, upkeep: 2, hp: 1, atk: { land: 4000, sea: 4000, air: 0 }, def: 0, speed: 0, range: 12000, needs: "silo", blurb: "Ends a city. Every nation on Earth will remember who used it." },
};
export const LAND_UNITS: UnitKind[] = ["infantry", "tank", "artillery", "antiair"];
export const SEA_UNITS: UnitKind[] = ["destroyer", "submarine", "battleship", "carrier"];
export const AIR_UNITS: UnitKind[] = ["fighter", "bomber"];
export const STRIKE_UNITS: UnitKind[] = ["missile", "nuke"];

/* ------------------------------------------------------------------ ideologies and laws */

export type IdeologyId = "democracy" | "socialism" | "communism" | "monarchy" | "theocracy" | "authoritarian";
export interface IdeologyDef {
  id: IdeologyId;
  name: string;
  icon: string;
  color: string;
  stability: number;
  gdp: number;
  factory: number;
  manpower: number;
  /** Justifying a war takes this times as long. */
  justify: number;
  exhaustion: number;
  /** How much a tax rise hurts stability. */
  taxPain: number;
  blurb: string;
}
export const IDEOLOGIES: Record<IdeologyId, IdeologyDef> = {
  democracy: { id: "democracy", name: "Democracy", icon: "🗳️", color: "#4f8cff", stability: 70, gdp: 1.06, factory: 1, manpower: 0.9, justify: 1.6, exhaustion: 1.35, taxPain: 1.2, blurb: "Rich and stable, but slow to go to war and quick to tire of it. Elections every four years." },
  socialism: { id: "socialism", name: "Socialism", icon: "🌹", color: "#ff5d73", stability: 64, gdp: 0.98, factory: 1.06, manpower: 1, justify: 1.3, exhaustion: 1.1, taxPain: 0.8, blurb: "Higher taxes go down easier and factories run better." },
  communism: { id: "communism", name: "Communism", icon: "☭", color: "#d61f26", stability: 58, gdp: 0.9, factory: 1.18, manpower: 1.25, justify: 1, exhaustion: 0.9, taxPain: 0.6, blurb: "A planned economy: factories and armies first, the shops second." },
  monarchy: { id: "monarchy", name: "Monarchy", icon: "👑", color: "#b98bff", stability: 66, gdp: 1, factory: 1, manpower: 1.05, justify: 1, exhaustion: 1, taxPain: 1, blurb: "The crown gives steady rule and a loyal army." },
  theocracy: { id: "theocracy", name: "Theocracy", icon: "🕌", color: "#2eb872", stability: 62, gdp: 0.94, factory: 0.95, manpower: 1.3, justify: 0.85, exhaustion: 0.75, taxPain: 0.9, blurb: "Faith fills the ranks and steels them for long wars." },
  authoritarian: { id: "authoritarian", name: "Authoritarian", icon: "🦅", color: "#8a6a4a", stability: 55, gdp: 0.96, factory: 1.05, manpower: 1.35, justify: 0.6, exhaustion: 0.7, taxPain: 0.7, blurb: "One party, one voice: wars are justified fast and fought long." },
};
export const IDEOLOGY_ORDER: IdeologyId[] = ["democracy", "socialism", "communism", "monarchy", "theocracy", "authoritarian"];

/** Starting governments (everyone else starts a democracy). */
export const START_IDEOLOGY: Record<string, IdeologyId> = {
  CHN: "communism", PRK: "communism", VNM: "communism", LAO: "communism", CUB: "communism",
  IRN: "theocracy", AFG: "theocracy",
  SAU: "monarchy", ARE: "monarchy", QAT: "monarchy", OMN: "monarchy", KWT: "monarchy", BHR: "monarchy", BRN: "monarchy", SWZ: "monarchy", MAR: "monarchy", JOR: "monarchy", BTN: "monarchy",
  VEN: "socialism", NIC: "socialism", BOL: "socialism",
  RUS: "authoritarian", BLR: "authoritarian", AZE: "authoritarian", KAZ: "authoritarian", TKM: "authoritarian", UZB: "authoritarian", TJK: "authoritarian", EGY: "authoritarian", SYR: "authoritarian", ERI: "authoritarian", MMR: "authoritarian", MLI: "authoritarian", BFA: "authoritarian", NER: "authoritarian", GIN: "authoritarian", SDN: "authoritarian", TCD: "authoritarian", RWA: "authoritarian", CMR: "authoritarian", GNQ: "authoritarian", COG: "authoritarian", DZA: "authoritarian", KHM: "authoritarian", THA: "monarchy", UGA: "authoritarian", ZWE: "authoritarian", LBY: "authoritarian", YEM: "authoritarian", SSD: "authoritarian", ETH: "authoritarian", IRQ: "democracy",
};

/** Nations that start with a working nuclear programme (and a few warheads). */
export const START_NUCLEAR: Record<string, number> = { USA: 3, RUS: 3, CHN: 2, GBR: 1, FRA: 1, IND: 1, PAK: 1, PRK: 1, ISR: 1 };

export type TaxLaw = number;
export type ConscriptionId = "volunteer" | "limited" | "extensive" | "total";
export const CONSCRIPTION: Record<ConscriptionId, { name: string; share: number; gdp: number; stability: number }> = {
  volunteer: { name: "Volunteer army", share: 0.01, gdp: 1, stability: 0 },
  limited: { name: "Limited conscription", share: 0.025, gdp: 0.99, stability: -2 },
  extensive: { name: "Extensive conscription", share: 0.05, gdp: 0.95, stability: -6 },
  total: { name: "Total mobilisation", share: 0.1, gdp: 0.85, stability: -14 },
};
export type EconomyLawId = "civilian" | "partial" | "war";
export const ECONOMY_LAWS: Record<EconomyLawId, { name: string; gdp: number; military: number; stability: number; blurb: string }> = {
  civilian: { name: "Civilian economy", gdp: 1, military: 1, stability: 0, blurb: "Peacetime: full GDP, normal training times." },
  partial: { name: "Partial mobilisation", gdp: 0.96, military: 1.3, stability: -3, blurb: "Some factories switch to the war: units train 30% faster." },
  war: { name: "War economy", gdp: 0.88, military: 1.7, stability: -8, blurb: "Everything for the front: units train 70% faster, the shops go short." },
};

/* ------------------------------------------------------------------ formable nations */

export interface FormableDef {
  id: string;
  name: string;
  color: string;
  /** Nations (ISO) that may form it. */
  by: string[];
  /** Cities you must own (by name; ones the map doesn't have are skipped). */
  cities: string[];
  ideology?: IdeologyId;
  blurb: string;
}
export const FORMABLES: FormableDef[] = [
  { id: "rome", name: "Roman Empire", color: "#9b1c31", by: ["ITA", "GRC", "TUR"], cities: ["Rome", "Milan", "Athens", "Istanbul", "Cairo", "Tunis", "Marseille", "Madrid"], blurb: "Mare Nostrum again: the Mediterranean ringed by one empire." },
  { id: "byzantium", name: "Byzantine Empire", color: "#7b2d8e", by: ["GRC", "TUR", "BGR"], cities: ["Istanbul", "Athens", "Sofia", "Ankara", "Thessaloniki"], blurb: "The empire of the east, ruled from the city on the Bosporus." },
  { id: "ottoman", name: "Ottoman Empire", color: "#2f6b3a", by: ["TUR"], cities: ["Istanbul", "Ankara", "Cairo", "Baghdad", "Damascus", "Jerusalem", "Sofia", "Athens"], blurb: "From the Danube to the Nile." },
  { id: "hre", name: "Holy Roman Empire", color: "#d4a017", by: ["DEU", "AUT", "CZE"], cities: ["Berlin", "Vienna", "Prague", "Munich", "Frankfurt", "Milan", "Amsterdam"], blurb: "Neither holy nor Roman, but one crown over the heart of Europe." },
  { id: "austria-hungary", name: "Austria-Hungary", color: "#e8d36a", by: ["AUT", "HUN"], cities: ["Vienna", "Budapest", "Prague", "Zagreb", "Ljubljana", "Bratislava"], blurb: "The Dual Monarchy on the Danube." },
  { id: "kalmar", name: "Kalmar Union", color: "#3b7dd8", by: ["DNK", "NOR", "SWE", "FIN", "ISL"], cities: ["Copenhagen", "Oslo", "Stockholm", "Helsinki", "Reykjavik"], blurb: "All the North under one crown." },
  { id: "commonwealth", name: "Polish–Lithuanian Commonwealth", color: "#c8363a", by: ["POL", "LTU"], cities: ["Warsaw", "Vilnius", "Minsk", "Kyiv", "Riga"], blurb: "The great republic of two nations." },
  { id: "ussr", name: "Soviet Union", color: "#b3001b", by: ["RUS", "UKR", "BLR", "KAZ"], cities: ["Moscow", "Kyiv", "Minsk", "Tbilisi", "Yerevan", "Baku", "Tashkent", "Riga", "Vilnius", "Tallinn", "Chisinau", "Bishkek", "Dushanbe", "Ashgabat"], ideology: "communism", blurb: "Fifteen republics, one union." },
  { id: "gran-colombia", name: "Gran Colombia", color: "#f2c230", by: ["COL", "VEN", "ECU", "PAN"], cities: ["Bogota", "Caracas", "Quito", "Panama City"], blurb: "Bolívar's dream, whole again." },
  { id: "central-america", name: "Federal Republic of Central America", color: "#2e86c1", by: ["GTM", "SLV", "HND", "NIC", "CRI"], cities: ["Guatemala", "San Salvador", "Tegucigalpa", "Managua", "San Jose"], blurb: "Five republics, one federation." },
  { id: "inca", name: "Inca Empire", color: "#e67e22", by: ["PER", "BOL", "ECU"], cities: ["Lima", "Quito", "La Paz", "Santiago", "Cusco"], blurb: "Tawantinsuyu, the four regions of the Andes." },
  { id: "mughal", name: "Mughal Empire", color: "#1e8449", by: ["IND", "PAK", "BGD"], cities: ["New Delhi", "Lahore", "Karachi", "Dhaka", "Kabul", "Mumbai"], blurb: "The subcontinent under one throne." },
  { id: "persia", name: "Persian Empire", color: "#16a085", by: ["IRN"], cities: ["Tehran", "Baghdad", "Kabul", "Baku", "Yerevan", "Tbilisi"], blurb: "The lands of Cyrus and the Shahs." },
  { id: "mongol", name: "Mongol Empire", color: "#5d6d7e", by: ["MNG"], cities: ["Ulaanbaatar", "Beijing", "Moscow", "Tehran", "Baghdad", "Kyiv", "Almaty"], blurb: "The largest land empire there ever was." },
  { id: "arab", name: "United Arab Republic", color: "#239b56", by: ["EGY", "SYR", "IRQ", "SAU", "JOR", "LBY", "DZA", "MAR", "TUN"], cities: ["Cairo", "Damascus", "Baghdad", "Riyadh", "Tripoli", "Amman", "Algiers", "Rabat"], blurb: "One Arab nation from the Atlantic to the Gulf." },
  { id: "mali", name: "Mali Empire", color: "#ca6f1e", by: ["MLI", "SEN", "GIN", "NER"], cities: ["Bamako", "Dakar", "Conakry", "Niamey"], blurb: "The empire of Mansa Musa." },
  { id: "qing", name: "Great Qing", color: "#f1c40f", by: ["CHN", "TWN"], cities: ["Beijing", "Shanghai", "Taipei", "Ulaanbaatar", "Urumqi", "Lhasa"], blurb: "China at its widest." },
  { id: "yugoslavia", name: "Yugoslavia", color: "#2c3e8f", by: ["SRB", "HRV", "BIH", "SVN", "MKD", "MNE"], cities: ["Belgrade", "Zagreb", "Sarajevo", "Ljubljana", "Skopje", "Podgorica"], blurb: "The South Slavs together again." },
  { id: "uk-ireland", name: "United Kingdom of Great Britain and Ireland", color: "#c0392b", by: ["GBR", "IRL"], cities: ["London", "Dublin", "Glasgow", "Belfast"], blurb: "Both islands under one parliament." },
  { id: "iberia", name: "Iberian Union", color: "#d35400", by: ["ESP", "PRT"], cities: ["Madrid", "Lisbon", "Barcelona", "Porto"], blurb: "The whole peninsula under one crown." },
  { id: "korea", name: "Unified Korea", color: "#5dade2", by: ["KOR", "PRK"], cities: ["Seoul", "Pyongyang"], blurb: "One Korea, north and south." },
  { id: "carolingia", name: "Carolingian Empire", color: "#8e44ad", by: ["FRA", "DEU", "BEL", "NLD"], cities: ["Paris", "Brussels", "Amsterdam", "Frankfurt", "Milan", "Rome"], blurb: "Charlemagne's Europe." },
  { id: "scandinavia", name: "Greater Scandinavia", color: "#2874a6", by: ["SWE", "NOR", "DNK"], cities: ["Stockholm", "Oslo", "Copenhagen"], blurb: "The three crowns become one." },
  { id: "baltic", name: "Baltic Federation", color: "#76d7c4", by: ["EST", "LVA", "LTU"], cities: ["Tallinn", "Riga", "Vilnius"], blurb: "Three small nations, one strong federation." },
  { id: "maghreb", name: "Greater Maghreb", color: "#a04000", by: ["MAR", "DZA", "TUN", "LBY", "MRT"], cities: ["Rabat", "Algiers", "Tunis", "Tripoli"], blurb: "The whole of North-West Africa united." },
  { id: "east-africa", name: "East African Federation", color: "#117864", by: ["KEN", "TZA", "UGA", "RWA", "BDI"], cities: ["Nairobi", "Dodoma", "Kampala", "Kigali"], blurb: "The great lakes and the coast as one." },
  { id: "australasia", name: "Australasia", color: "#1a5276", by: ["AUS", "NZL"], cities: ["Canberra", "Wellington", "Sydney", "Auckland"], blurb: "The two dominions federate." },
  { id: "rio-plata", name: "United Provinces of the Río de la Plata", color: "#85c1e9", by: ["ARG", "URY", "PRY"], cities: ["Buenos Aires", "Montevideo", "Asuncion"], blurb: "The river plate, one republic." },
];

/* ------------------------------------------------------------------ real-world deposits */

/** Who mines what (weights roughly follow real output), by resource. */
export const PRODUCERS: Record<ResourceId, [string, number][]> = {
  oil: [["SAU", 10], ["RUS", 9], ["USA", 9], ["IRQ", 6], ["CAN", 6], ["IRN", 5], ["ARE", 5], ["KWT", 4], ["VEN", 5], ["NGA", 4], ["KAZ", 3], ["LBY", 3], ["DZA", 3], ["AGO", 3], ["MEX", 3], ["NOR", 3], ["BRA", 3], ["QAT", 2], ["CHN", 3], ["OMN", 2], ["AZE", 2], ["GAB", 1], ["COL", 2], ["ECU", 1], ["GBR", 1], ["EGY", 1], ["IDN", 1], ["MYS", 1], ["TKM", 1], ["SDN", 1], ["SSD", 1], ["COG", 1], ["GNQ", 1], ["TTO", 1], ["BRN", 1], ["YEM", 1], ["SYR", 1]],
  iron: [["AUS", 10], ["BRA", 8], ["CHN", 6], ["IND", 5], ["RUS", 4], ["UKR", 3], ["ZAF", 3], ["CAN", 3], ["KAZ", 2], ["SWE", 2], ["IRN", 2], ["USA", 2], ["MRT", 1], ["CHL", 1], ["PER", 1], ["MEX", 1], ["VEN", 1], ["LBR", 1], ["SLE", 1]],
  copper: [["CHL", 10], ["PER", 6], ["COD", 5], ["CHN", 4], ["USA", 3], ["AUS", 2], ["ZMB", 4], ["RUS", 2], ["MEX", 2], ["KAZ", 2], ["CAN", 2], ["IDN", 2], ["POL", 1], ["MNG", 1], ["IRN", 1], ["PNG", 1]],
  aluminium: [["AUS", 10], ["GIN", 8], ["CHN", 6], ["BRA", 4], ["IND", 3], ["IDN", 2], ["JAM", 2], ["RUS", 2], ["KAZ", 1], ["VNM", 1], ["SAU", 1], ["MYS", 1], ["GHA", 1], ["SUR", 1], ["GUY", 1]],
  gold: [["CHN", 4], ["AUS", 4], ["RUS", 4], ["USA", 3], ["CAN", 3], ["ZAF", 4], ["GHA", 3], ["PER", 2], ["MEX", 2], ["IDN", 2], ["UZB", 2], ["KAZ", 1], ["BRA", 1], ["PNG", 1], ["MLI", 2], ["BFA", 2], ["SDN", 1], ["TZA", 2], ["COL", 1], ["ARG", 1]],
  diamond: [["RUS", 6], ["BWA", 8], ["COD", 5], ["AUS", 3], ["CAN", 3], ["AGO", 3], ["ZAF", 3], ["NAM", 2], ["SLE", 2], ["LSO", 1], ["ZWE", 1], ["TZA", 1], ["GUY", 1], ["CAF", 1]],
  uranium: [["KAZ", 10], ["CAN", 6], ["AUS", 6], ["NAM", 4], ["NER", 4], ["RUS", 3], ["UZB", 2], ["CHN", 1], ["UKR", 1], ["USA", 1], ["ZAF", 1]],
  phosphate: [["MAR", 10], ["CHN", 6], ["USA", 4], ["RUS", 3], ["JOR", 3], ["SAU", 3], ["EGY", 2], ["TUN", 2], ["BRA", 2], ["VNM", 1], ["ISR", 1], ["PER", 1], ["SEN", 1], ["TGO", 1], ["DZA", 1], ["KAZ", 1], ["AUS", 1], ["IND", 1]],
  chromium: [["ZAF", 10], ["KAZ", 6], ["TUR", 4], ["IND", 4], ["FIN", 2], ["ZWE", 2], ["ALB", 1], ["IRN", 1], ["OMN", 1], ["BRA", 1], ["PAK", 1], ["RUS", 1]],
  titanium: [["CHN", 6], ["AUS", 6], ["ZAF", 5], ["MOZ", 4], ["CAN", 3], ["NOR", 2], ["UKR", 2], ["SEN", 1], ["KEN", 1], ["MDG", 2], ["IND", 2], ["VNM", 1], ["USA", 1], ["SLE", 1], ["KAZ", 1], ["RUS", 1]],
  tungsten: [["CHN", 10], ["VNM", 3], ["RUS", 3], ["BOL", 2], ["RWA", 2], ["AUT", 1], ["PRT", 1], ["KOR", 1], ["MNG", 1], ["ESP", 1], ["GBR", 1], ["COD", 1], ["PER", 1]],
};

/** Better-known names for a few cities in Natural Earth's spelling. */
export const CITY_NAMES: Record<string, string> = { Kiev: "Kyiv", "Washington, D.C.": "Washington", Kobenhavn: "Copenhagen", Ndjamena: "N'Djamena", Sanaa: "Sana'a" };

/** Start a game in this year; one day of game time a second at normal speed. */
export const START_YEAR = 2026;

/* ------------------------------------------------------------------ events */

export interface EventDef {
  id: string;
  title: string;
  text: string;
  /** Chance per nation per year. */
  chance: number;
}
export const EVENTS: EventDef[] = [
  { id: "boom", title: "Economic boom", text: "Exports are up and the markets are buoyant: GDP rises 6%.", chance: 0.12 },
  { id: "recession", title: "Recession", text: "A downturn: GDP falls 5% and people grumble.", chance: 0.1 },
  { id: "oil", title: "Oil strike", text: "Prospectors have struck oil.", chance: 0.05 },
  { id: "gold", title: "Gold rush", text: "A new gold seam has been found.", chance: 0.04 },
  { id: "quake", title: "Earthquake", text: "An earthquake has hit a city: buildings damaged and lives lost.", chance: 0.05 },
  { id: "pandemic", title: "Epidemic", text: "Disease is spreading: the population falls and stability slips.", chance: 0.04 },
  { id: "scandal", title: "Government scandal", text: "Ministers caught out: stability falls.", chance: 0.1 },
  { id: "festival", title: "National celebration", text: "A great festival lifts the national mood.", chance: 0.1 },
  { id: "breakthrough", title: "Industrial breakthrough", text: "Engineers find a better process: a factory gets a free level.", chance: 0.06 },
  { id: "unrest", title: "Strikes and protests", text: "Workers walk out across the country.", chance: 0.08 },
];
