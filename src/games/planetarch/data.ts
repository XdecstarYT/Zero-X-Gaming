/**
 * Planetarch's rules as data: thirty sectors and the 105 goods they make (with what each needs
 * to make them), eighteen social groups, the laws, the constitution's choices, public services,
 * benefits, power plants, equipment, the 209 technologies, the international organisations and
 * the straits that trade passes through. Everything the simulation reads but never changes.
 */

export const GAME_SLUG = "planetarch";
export const SAVE_KEY = "zx-planetarch-save";
export const PREFS_KEY = "zx-planetarch-prefs";
/** Day 0 of a new world. */
export const START = Date.UTC(2027, 0, 1);
export const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ sectors and goods */

export const SECTOR_IDS = [
  "crops", "livestock", "forestry", "coal", "oilgas", "metals_mining", "quarrying", "food", "textiles", "wood",
  "refining", "chemicals", "pharma", "steel", "materials", "machinery", "electronics", "electrical", "vehicles", "aerospace",
  "defence", "power", "construction", "retail", "transport", "telecom", "finance", "realestate", "tourism", "services",
] as const;
export type SectorId = (typeof SECTOR_IDS)[number];

export type GroupId =
  | "farmers" | "miners" | "factory" | "builders" | "transport" | "service" | "hospitality" | "clerks" | "professionals"
  | "health" | "teachers" | "civil" | "soldiers" | "smallbiz" | "investors" | "students" | "retirees" | "unemployed";

export type VatCat = "food" | "energy" | "standard" | "luxury" | "exempt";

export interface SectorDef {
  id: SectorId;
  name: string;
  icon: string;
  /** Who works in it. */
  group: GroupId;
  /** Value added per $ of output. */
  va: number;
  /** Electricity per $bn of output, TWh (before the country's own efficiency). */
  elec: number;
  /** Goods used up per $ of output. */
  inputs: [string, number][];
  /** Share of its output that can cross a border (0 = local only). */
  trade: number;
  /** $ of capital per $ of yearly output. */
  capex: number;
  /** Mostly at sea (ports matter). */
  heavy?: boolean;
}

export interface GoodDef {
  id: string;
  name: string;
  sector: SectorId;
  /** Share of the sector's output. */
  share: number;
  /** Share of household spending. */
  hh: number;
  vat: VatCat;
  /** Fuel for power plants or engines, food, medicine: shortages hurt more. */
  tag?: "fuel" | "food" | "med" | "arms" | "tech" | "metal";
}

const S = (id: SectorId, name: string, icon: string, group: GroupId, va: number, elec: number, trade: number, capex: number, inputs: [string, number][], heavy?: boolean): SectorDef => ({ id, name, icon, group, va, elec, trade, capex, inputs, heavy });

export const SECTORS: SectorDef[] = [
  S("crops", "Crops", "🌾", "farmers", 0.55, 0.05, 0.5, 2.2, [["fertiliser", 0.06], ["diesel", 0.04], ["farm_machinery", 0.03], ["chemicals_basic", 0.02]]),
  S("livestock", "Livestock & fishing", "🐄", "farmers", 0.45, 0.05, 0.4, 2, [["maize", 0.1], ["soybeans", 0.07], ["wheat", 0.03], ["medicines", 0.01], ["diesel", 0.03]]),
  S("forestry", "Forestry", "🌲", "farmers", 0.6, 0.03, 0.5, 1.8, [["diesel", 0.05], ["industrial_machinery", 0.03]]),
  S("coal", "Coal mining", "⛏️", "miners", 0.55, 0.12, 0.6, 2.5, [["diesel", 0.05], ["industrial_machinery", 0.05], ["steel_g", 0.02]], true),
  S("oilgas", "Oil & gas", "🛢️", "miners", 0.7, 0.06, 0.85, 3.5, [["industrial_machinery", 0.05], ["steel_g", 0.04], ["diesel", 0.02], ["shipping", 0.03]], true),
  S("metals_mining", "Metal mining", "🪨", "miners", 0.6, 0.15, 0.8, 3, [["diesel", 0.06], ["industrial_machinery", 0.05], ["chemicals_basic", 0.03], ["shipping", 0.03]], true),
  S("quarrying", "Quarrying & minerals", "🏔️", "miners", 0.5, 0.08, 0.4, 2, [["diesel", 0.06], ["industrial_machinery", 0.03]]),
  S("food", "Food & drink", "🥫", "factory", 0.3, 0.06, 0.4, 1.5, [["wheat", 0.08], ["rice", 0.05], ["maize", 0.04], ["soybeans", 0.03], ["fruit_veg", 0.06], ["meat", 0.1], ["dairy", 0.08], ["fish", 0.03], ["veg_oil", 0.03], ["coffee_cocoa", 0.03], ["paper", 0.02], ["plastics", 0.03]]),
  S("textiles", "Textiles & clothing", "👕", "factory", 0.35, 0.08, 0.85, 1.4, [["cotton", 0.12], ["plastics", 0.05], ["chemicals_basic", 0.03], ["textiles_g", 0.05]], true),
  S("wood", "Wood & paper", "🪵", "factory", 0.35, 0.12, 0.6, 1.6, [["timber", 0.2], ["pulp", 0.1], ["chemicals_basic", 0.03]]),
  S("refining", "Refining", "🏭", "factory", 0.15, 0.1, 0.8, 2.5, [["crude", 0.65], ["natgas", 0.03]], true),
  S("chemicals", "Chemicals", "⚗️", "factory", 0.3, 0.25, 0.8, 2.2, [["natgas", 0.14], ["crude", 0.08], ["potash", 0.04], ["hydrogen", 0.02]], true),
  S("pharma", "Pharmaceuticals", "💊", "professionals", 0.5, 0.06, 0.9, 2, [["chemicals_basic", 0.12], ["plastics", 0.04]]),
  S("steel", "Steel & metals", "🔩", "factory", 0.25, 0.45, 0.75, 2.6, [["iron_ore", 0.2], ["coking_coal", 0.1], ["bauxite", 0.08], ["copper_ore", 0.1], ["nickel_ore", 0.03], ["uranium_ore", 0.02]], true),
  S("materials", "Building materials", "🧱", "factory", 0.35, 0.2, 0.3, 2, [["sand_gravel", 0.15], ["thermal_coal", 0.03], ["natgas", 0.04]]),
  S("machinery", "Machinery", "⚙️", "factory", 0.35, 0.08, 0.85, 1.8, [["steel_g", 0.2], ["copper", 0.03], ["semiconductors", 0.03]], true),
  S("electronics", "Electronics", "💻", "factory", 0.3, 0.1, 0.95, 2.4, [["semiconductors", 0.15], ["rare_earths", 0.02], ["lithium", 0.03], ["copper", 0.04], ["plastics", 0.04], ["chemicals_basic", 0.03], ["glass", 0.02]], true),
  S("electrical", "Electrical equipment", "🔌", "factory", 0.32, 0.08, 0.85, 1.8, [["copper", 0.12], ["steel_g", 0.1], ["aluminium", 0.04], ["semiconductors", 0.03]], true),
  S("vehicles", "Vehicles", "🚗", "factory", 0.25, 0.07, 0.85, 2, [["steel_g", 0.15], ["aluminium", 0.05], ["semiconductors", 0.05], ["batteries", 0.06], ["plastics", 0.04], ["glass", 0.02], ["textiles_g", 0.01]], true),
  S("aerospace", "Aerospace & shipbuilding", "✈️", "professionals", 0.35, 0.06, 0.9, 2.4, [["aluminium", 0.12], ["steel_g", 0.06], ["semiconductors", 0.06], ["industrial_machinery", 0.04]], true),
  S("defence", "Defence industry", "🛡️", "factory", 0.35, 0.06, 0.6, 2.4, [["steel_g", 0.12], ["semiconductors", 0.06], ["chemicals_basic", 0.05], ["aluminium", 0.04], ["industrial_machinery", 0.03]]),
  S("power", "Electricity & water", "⚡", "miners", 0.45, 0.04, 0, 5, [["industrial_machinery", 0.02], ["turbines", 0.03], ["solar_panels", 0.02], ["cables", 0.03], ["batteries", 0.01]]),
  S("construction", "Construction", "🏗️", "builders", 0.4, 0.03, 0, 0.6, [["cement", 0.1], ["steel_g", 0.08], ["bricks", 0.05], ["glass", 0.03], ["sawn_wood", 0.05], ["diesel", 0.02], ["industrial_machinery", 0.02], ["paints", 0.02]]),
  S("retail", "Retail & wholesale", "🛒", "service", 0.55, 0.04, 0, 0.8, [["freight", 0.05], ["shipping", 0.02], ["plastics", 0.01], ["paper", 0.01]]),
  S("transport", "Transport & logistics", "🚚", "transport", 0.45, 0.03, 0.35, 2.2, [["diesel", 0.15], ["jet_fuel", 0.1], ["fuel_oil", 0.05], ["trucks", 0.03], ["petrol", 0.02], ["aircraft", 0.03], ["ships", 0.02]], true),
  S("telecom", "Telecoms & IT", "📡", "professionals", 0.6, 0.06, 0.4, 2, [["computers", 0.05], ["semiconductors", 0.03], ["phones", 0.02], ["satellites", 0.02], ["cloud", 0.03]]),
  S("finance", "Finance & insurance", "🏦", "professionals", 0.65, 0.01, 0.3, 0.5, [["software", 0.05], ["computers", 0.02], ["cloud", 0.03]]),
  S("realestate", "Real estate", "🏠", "smallbiz", 0.8, 0.01, 0, 6, [["housing_build", 0.05]]),
  S("tourism", "Hospitality & tourism", "🏨", "hospitality", 0.5, 0.04, 0.3, 1.5, [["processed_food", 0.1], ["beverages", 0.08], ["passenger", 0.03]]),
  S("services", "Business & personal services", "💼", "clerks", 0.65, 0.02, 0.15, 0.6, [["software", 0.04], ["computers", 0.02], ["paper", 0.01], ["cloud", 0.02]]),
];
export const SECTOR = Object.fromEntries(SECTORS.map((s) => [s.id, s])) as Record<SectorId, SectorDef>;

const G = (id: string, name: string, sector: SectorId, share: number, hh: number, vat: VatCat, tag?: GoodDef["tag"]): GoodDef => ({ id, name, sector, share, hh, vat, tag });

/** 105 goods. A sector's shares add up to 1. */
export const GOODS: GoodDef[] = [
  G("wheat", "Wheat", "crops", 0.2, 0.01, "food", "food"),
  G("rice", "Rice", "crops", 0.18, 0.02, "food", "food"),
  G("maize", "Maize", "crops", 0.16, 0.004, "food", "food"),
  G("soybeans", "Soybeans", "crops", 0.12, 0.002, "food", "food"),
  G("fruit_veg", "Fruit & vegetables", "crops", 0.24, 0.03, "food", "food"),
  G("coffee_cocoa", "Coffee & cocoa", "crops", 0.05, 0.005, "food"),
  G("cotton", "Cotton", "crops", 0.05, 0, "standard"),
  G("meat", "Meat", "livestock", 0.55, 0.03, "food", "food"),
  G("dairy", "Dairy", "livestock", 0.3, 0.02, "food", "food"),
  G("fish", "Fish", "livestock", 0.15, 0.01, "food", "food"),
  G("timber", "Timber", "forestry", 0.7, 0, "standard"),
  G("pulp", "Pulp", "forestry", 0.3, 0, "standard"),
  G("thermal_coal", "Thermal coal", "coal", 0.7, 0.002, "energy", "fuel"),
  G("coking_coal", "Coking coal", "coal", 0.3, 0, "standard"),
  G("crude", "Crude oil", "oilgas", 0.6, 0, "energy", "fuel"),
  G("natgas", "Natural gas", "oilgas", 0.3, 0.01, "energy", "fuel"),
  G("lng", "LNG", "oilgas", 0.1, 0.002, "energy", "fuel"),
  G("iron_ore", "Iron ore", "metals_mining", 0.3, 0, "standard", "metal"),
  G("copper_ore", "Copper ore", "metals_mining", 0.22, 0, "standard", "metal"),
  G("bauxite", "Bauxite", "metals_mining", 0.08, 0, "standard", "metal"),
  G("lithium", "Lithium", "metals_mining", 0.06, 0, "standard", "metal"),
  G("rare_earths", "Rare earths", "metals_mining", 0.04, 0, "standard", "metal"),
  G("gold", "Gold", "metals_mining", 0.18, 0.002, "luxury", "metal"),
  G("uranium_ore", "Uranium ore", "metals_mining", 0.04, 0, "standard", "fuel"),
  G("nickel_ore", "Nickel & cobalt", "metals_mining", 0.08, 0, "standard", "metal"),
  G("sand_gravel", "Sand & gravel", "quarrying", 0.65, 0, "standard"),
  G("potash", "Potash & phosphate", "quarrying", 0.35, 0, "standard"),
  G("processed_food", "Processed food", "food", 0.5, 0.08, "food", "food"),
  G("beverages", "Beverages", "food", 0.22, 0.03, "standard"),
  G("sugar", "Sugar", "food", 0.08, 0.005, "food", "food"),
  G("tobacco", "Tobacco", "food", 0.08, 0.01, "luxury"),
  G("veg_oil", "Vegetable oils", "food", 0.12, 0.005, "food", "food"),
  G("textiles_g", "Textiles", "textiles", 0.35, 0.005, "standard"),
  G("clothing", "Clothing", "textiles", 0.45, 0.03, "standard"),
  G("footwear", "Footwear", "textiles", 0.2, 0.01, "standard"),
  G("sawn_wood", "Sawn wood", "wood", 0.35, 0, "standard"),
  G("paper", "Paper", "wood", 0.35, 0.002, "standard"),
  G("furniture", "Furniture", "wood", 0.3, 0.01, "standard"),
  G("petrol", "Petrol", "refining", 0.38, 0.03, "energy", "fuel"),
  G("diesel", "Diesel", "refining", 0.34, 0.01, "energy", "fuel"),
  G("jet_fuel", "Jet fuel", "refining", 0.13, 0, "energy", "fuel"),
  G("fuel_oil", "Heavy fuel oil", "refining", 0.15, 0, "energy", "fuel"),
  G("chemicals_basic", "Basic chemicals", "chemicals", 0.38, 0, "standard"),
  G("fertiliser", "Fertilisers", "chemicals", 0.2, 0, "standard"),
  G("plastics", "Plastics", "chemicals", 0.3, 0, "standard"),
  G("paints", "Paints & coatings", "chemicals", 0.07, 0.002, "standard"),
  G("hydrogen", "Hydrogen", "chemicals", 0.05, 0, "energy", "fuel"),
  G("medicines", "Medicines", "pharma", 0.6, 0.02, "exempt", "med"),
  G("vaccines", "Vaccines", "pharma", 0.1, 0, "exempt", "med"),
  G("med_supplies", "Medical supplies", "pharma", 0.18, 0.002, "exempt", "med"),
  G("med_devices", "Medical devices", "pharma", 0.12, 0, "exempt", "med"),
  G("steel_g", "Steel", "steel", 0.55, 0, "standard", "metal"),
  G("aluminium", "Aluminium", "steel", 0.2, 0, "standard", "metal"),
  G("copper", "Refined copper", "steel", 0.2, 0, "standard", "metal"),
  G("nuclear_fuel", "Nuclear fuel", "steel", 0.05, 0, "energy", "fuel"),
  G("cement", "Cement", "materials", 0.45, 0, "standard"),
  G("glass", "Glass", "materials", 0.25, 0, "standard"),
  G("bricks", "Bricks & tiles", "materials", 0.3, 0, "standard"),
  G("industrial_machinery", "Industrial machinery", "machinery", 0.6, 0, "standard", "tech"),
  G("farm_machinery", "Farm machinery", "machinery", 0.2, 0, "standard"),
  G("tools", "Tools", "machinery", 0.2, 0.003, "standard"),
  G("semiconductors", "Semiconductors", "electronics", 0.3, 0, "standard", "tech"),
  G("computers", "Computers", "electronics", 0.22, 0.01, "standard", "tech"),
  G("phones", "Phones", "electronics", 0.22, 0.015, "standard", "tech"),
  G("batteries", "Batteries", "electronics", 0.14, 0, "standard", "tech"),
  G("solar_panels", "Solar panels", "electronics", 0.12, 0, "standard", "tech"),
  G("turbines", "Turbines & generators", "electrical", 0.3, 0, "standard", "tech"),
  G("cables", "Transformers & cables", "electrical", 0.3, 0, "standard"),
  G("appliances", "Appliances", "electrical", 0.4, 0.01, "standard"),
  G("cars", "Cars", "vehicles", 0.55, 0.03, "luxury"),
  G("ev", "Electric cars", "vehicles", 0.2, 0.005, "standard", "tech"),
  G("trucks", "Trucks & buses", "vehicles", 0.25, 0, "standard"),
  G("aircraft", "Aircraft", "aerospace", 0.5, 0, "standard", "tech"),
  G("ships", "Ships", "aerospace", 0.35, 0, "standard"),
  G("satellites", "Satellites", "aerospace", 0.15, 0, "standard", "tech"),
  G("ammunition", "Ammunition", "defence", 0.22, 0, "exempt", "arms"),
  G("small_arms", "Small arms", "defence", 0.08, 0, "exempt", "arms"),
  G("armour", "Armoured vehicles", "defence", 0.16, 0, "exempt", "arms"),
  G("artillery", "Artillery", "defence", 0.08, 0, "exempt", "arms"),
  G("missiles", "Missiles", "defence", 0.14, 0, "exempt", "arms"),
  G("drones", "Drones", "defence", 0.08, 0, "exempt", "arms"),
  G("combat_aircraft", "Combat aircraft", "defence", 0.14, 0, "exempt", "arms"),
  G("warships", "Warships", "defence", 0.1, 0, "exempt", "arms"),
  G("electricity", "Electricity", "power", 0.85, 0.025, "energy"),
  G("water", "Water", "power", 0.15, 0.005, "exempt"),
  G("housing_build", "Housebuilding", "construction", 0.4, 0, "standard"),
  G("infrastructure", "Infrastructure", "construction", 0.35, 0, "standard"),
  G("commercial_build", "Commercial building", "construction", 0.25, 0, "standard"),
  G("retail_g", "Shops & wholesale", "retail", 1, 0.06, "standard"),
  G("freight", "Freight", "transport", 0.4, 0, "standard"),
  G("passenger", "Passenger transport", "transport", 0.3, 0.03, "standard"),
  G("shipping", "Shipping", "transport", 0.18, 0, "standard"),
  G("air_travel", "Air travel", "transport", 0.12, 0.01, "standard"),
  G("telecoms", "Telecoms", "telecom", 0.45, 0.02, "standard"),
  G("software", "Software", "telecom", 0.35, 0.005, "standard", "tech"),
  G("cloud", "Cloud & data", "telecom", 0.2, 0, "standard", "tech"),
  G("banking", "Banking", "finance", 0.65, 0.03, "exempt"),
  G("insurance", "Insurance", "finance", 0.35, 0.02, "exempt"),
  G("rents", "Rents & housing", "realestate", 1, 0.15, "exempt"),
  G("hotels", "Hotels & restaurants", "tourism", 0.75, 0.05, "standard"),
  G("tourism_g", "Holidays", "tourism", 0.25, 0.01, "luxury"),
  G("consulting", "Business services", "services", 0.5, 0, "standard"),
  G("personal", "Personal services", "services", 0.32, 0.04, "standard"),
  G("culture", "Culture, sport & entertainment", "services", 0.18, 0.02, "standard"),
];
export const GOOD_INDEX: Record<string, number> = Object.fromEntries(GOODS.map((g, i) => [g.id, i]));
export const SECTOR_INDEX: Record<SectorId, number> = Object.fromEntries(SECTOR_IDS.map((s, i) => [s, i])) as Record<SectorId, number>;
/** Goods of each sector (indexes). */
export const SECTOR_GOODS: number[][] = SECTOR_IDS.map((s) => GOODS.flatMap((g, i) => (g.sector === s ? [i] : [])));
/** Goods that only exist where they're made. */
export const LOCAL_GOOD = GOODS.map((g) => SECTOR[g.sector].trade === 0 || g.id === "electricity");

/* ------------------------------------------------------------------ social groups */

export interface GroupDef {
  id: GroupId;
  name: string;
  icon: string;
  /** Share of the adult population in a rich country and in a poor one. */
  rich: number;
  poor: number;
  /** Skill: 0 low, 1 middle, 2 high. */
  skill: 0 | 1 | 2;
  /** Values: tradition (religion, family), labour (worker protection), liberty, nation (borders), security, state (public spending). −1…1. */
  v: [number, number, number, number, number, number];
  /** Joins unions. */
  union: number;
  /** Lives in cities. */
  urban: number;
  /** Income compared with the average. */
  pay: number;
}

const GR = (id: GroupId, name: string, icon: string, rich: number, poor: number, skill: 0 | 1 | 2, v: GroupDef["v"], union: number, urban: number, pay: number): GroupDef => ({ id, name, icon, rich, poor, skill, v, union, urban, pay });

export const GROUPS: GroupDef[] = [
  GR("farmers", "Farmers & farmhands", "🌾", 0.02, 0.3, 0, [0.6, 0.2, -0.1, 0.5, 0.3, 0.2], 0.2, 0.1, 0.6),
  GR("miners", "Miners & energy workers", "⛏️", 0.012, 0.02, 1, [0.3, 0.8, -0.1, 0.4, 0.3, 0.3], 0.6, 0.35, 1.25),
  GR("factory", "Factory workers", "🏭", 0.09, 0.08, 1, [0.2, 0.8, 0, 0.4, 0.3, 0.4], 0.45, 0.7, 0.95),
  GR("builders", "Construction workers", "🏗️", 0.05, 0.05, 0, [0.3, 0.6, 0, 0.4, 0.3, 0.2], 0.35, 0.7, 0.9),
  GR("transport", "Transport & logistics workers", "🚚", 0.04, 0.04, 1, [0.2, 0.7, 0, 0.3, 0.3, 0.3], 0.55, 0.75, 1),
  GR("service", "Shop & service workers", "🛍️", 0.12, 0.08, 0, [0, 0.6, 0.2, 0.1, 0.2, 0.4], 0.2, 0.85, 0.7),
  GR("hospitality", "Hospitality & tourism workers", "🍽️", 0.04, 0.03, 0, [-0.1, 0.5, 0.3, 0, 0.1, 0.3], 0.15, 0.85, 0.65),
  GR("clerks", "Office clerks", "🗂️", 0.1, 0.04, 1, [0, 0.4, 0.3, 0.1, 0.3, 0.3], 0.25, 0.9, 1),
  GR("professionals", "Professionals", "💼", 0.09, 0.02, 2, [-0.3, 0, 0.6, -0.2, 0.2, 0], 0.15, 0.95, 1.8),
  GR("health", "Health & care staff", "🩺", 0.05, 0.01, 2, [-0.1, 0.6, 0.3, -0.1, 0.2, 0.8], 0.55, 0.85, 1.15),
  GR("teachers", "Teachers & academics", "🎓", 0.04, 0.015, 2, [-0.3, 0.6, 0.5, -0.3, 0, 0.8], 0.6, 0.8, 1.05),
  GR("civil", "Civil servants & police", "🏛️", 0.05, 0.02, 1, [0.2, 0.5, -0.1, 0.3, 0.7, 0.7], 0.5, 0.85, 1.1),
  GR("soldiers", "Soldiers & officers", "🎖️", 0.008, 0.01, 1, [0.5, 0.2, -0.3, 0.8, 0.9, 0.3], 0, 0.5, 1),
  GR("smallbiz", "Small business owners", "🏪", 0.06, 0.06, 1, [0.3, -0.6, 0.4, 0.3, 0.5, -0.6], 0.02, 0.7, 1.4),
  GR("investors", "Executives & investors", "📈", 0.015, 0.005, 2, [0, -0.9, 0.5, 0, 0.4, -0.8], 0, 0.95, 6),
  GR("students", "Students", "📚", 0.05, 0.05, 1, [-0.6, 0.4, 0.8, -0.4, -0.3, 0.6], 0.1, 0.9, 0.3),
  GR("retirees", "Retirees", "👴", 0.21, 0.07, 1, [0.6, 0.3, -0.2, 0.5, 0.7, 0.5], 0.1, 0.6, 0.65),
  GR("unemployed", "Unemployed & informal", "🪧", 0.05, 0.15, 0, [0.1, 0.7, 0.1, 0.3, 0.1, 0.8], 0.05, 0.6, 0.3),
];
export const GROUP_INDEX = Object.fromEntries(GROUPS.map((g, i) => [g.id, i])) as Record<GroupId, number>;
export const VALUES = ["Tradition", "Worker protection", "Liberty", "Borders", "Security", "Public spending"] as const;

/* ------------------------------------------------------------------ laws */

export interface LawOption {
  id: string;
  name: string;
  /** Effect on the six values (how groups who care feel). */
  v?: Partial<Record<0 | 1 | 2 | 3 | 4 | 5, number>>;
  /** Mechanical effects read by the simulation. */
  fx?: Record<string, number>;
  /** EU members and candidates can't have it. */
  euBar?: boolean;
  /** Courts may strike it down where rights are entrenched. */
  rights?: boolean;
  note?: string;
}
export interface LawDef {
  id: string;
  name: string;
  icon: string;
  area: "work" | "social" | "rights" | "security" | "migration" | "economy" | "housing";
  options: LawOption[];
}

const L = (id: string, name: string, icon: string, area: LawDef["area"], options: LawOption[]): LawDef => ({ id, name, icon, area, options });

export const LAWS: LawDef[] = [
  L("min_wage", "Minimum wage", "💵", "work", [
    { id: "none", name: "None", v: { 1: -1 }, fx: { minWage: 0 } },
    { id: "low", name: "Low (30% of median)", v: { 1: -0.3 }, fx: { minWage: 0.3 } },
    { id: "mid", name: "Moderate (45%)", v: { 1: 0.3 }, fx: { minWage: 0.45 } },
    { id: "high", name: "High (60%)", v: { 1: 0.9 }, fx: { minWage: 0.6 } },
  ]),
  L("hours", "Working hours", "⏱️", "work", [
    { id: "48", name: "48-hour week", v: { 1: -0.8 }, fx: { hours: 48 } },
    { id: "44", name: "44-hour week", v: { 1: -0.3 }, fx: { hours: 44 } },
    { id: "40", name: "40-hour week", v: { 1: 0.2 }, fx: { hours: 40 } },
    { id: "35", name: "35-hour week", v: { 1: 0.7 }, fx: { hours: 35 } },
    { id: "32", name: "Four-day week (32h)", v: { 1: 1, 2: 0.2 }, fx: { hours: 32 } },
  ]),
  L("leave", "Paid leave", "🏖️", "work", [
    { id: "0", name: "None required", v: { 1: -0.9 }, fx: { leave: 0 } },
    { id: "2", name: "2 weeks", v: { 1: -0.2 }, fx: { leave: 2 } },
    { id: "4", name: "4 weeks", v: { 1: 0.4 }, fx: { leave: 4 } },
    { id: "6", name: "6 weeks", v: { 1: 0.9 }, fx: { leave: 6 } },
  ]),
  L("retirement", "Retirement age", "👴", "work", [
    { id: "60", name: "60", v: { 1: 0.9, 5: 0.6 }, fx: { retire: 60 } },
    { id: "62", name: "62", v: { 1: 0.5, 5: 0.3 }, fx: { retire: 62 } },
    { id: "65", name: "65", v: { 1: 0 }, fx: { retire: 65 } },
    { id: "67", name: "67", v: { 1: -0.5, 5: -0.2 }, fx: { retire: 67 } },
    { id: "70", name: "70", v: { 1: -1, 5: -0.5 }, fx: { retire: 70 } },
  ]),
  L("unions", "Trade unions", "✊", "work", [
    { id: "banned", name: "Banned", v: { 1: -1, 2: -0.8 }, fx: { union: 0 }, rights: true, euBar: true },
    { id: "restricted", name: "Restricted", v: { 1: -0.5 }, fx: { union: 0.5 } },
    { id: "protected", name: "Protected", v: { 1: 0.4 }, fx: { union: 1 } },
    { id: "sectoral", name: "Sector-wide bargaining", v: { 1: 0.9 }, fx: { union: 1.3 } },
  ]),
  L("strikes", "Right to strike", "🪧", "work", [
    { id: "banned", name: "Strikes banned", v: { 1: -1, 2: -0.8, 4: 0.3 }, fx: { strike: 0 }, rights: true, euBar: true },
    { id: "minimum", name: "Minimum service in essential services", v: { 1: -0.2, 4: 0.2 }, fx: { strike: 0.6 } },
    { id: "free", name: "Free to strike", v: { 1: 0.6, 2: 0.3 }, fx: { strike: 1 } },
  ]),
  L("abortion", "Abortion", "⚕️", "social", [
    { id: "banned", name: "Banned", v: { 0: 1, 2: -0.9 } },
    { id: "life", name: "Only if the mother's life is at risk", v: { 0: 0.6, 2: -0.5 } },
    { id: "12", name: "On request up to 12 weeks", v: { 0: -0.4, 2: 0.5 } },
    { id: "24", name: "On request up to 24 weeks", v: { 0: -0.9, 2: 0.9 } },
  ]),
  L("death_penalty", "Death penalty", "⚖️", "security", [
    { id: "abolished", name: "Abolished", v: { 0: -0.3, 2: 0.5, 4: -0.4 } },
    { id: "war", name: "Only in wartime", v: { 4: -0.1 }, euBar: true },
    { id: "murder", name: "For murder and terrorism", v: { 0: 0.4, 2: -0.5, 4: 0.6 }, euBar: true, fx: { crime: -0.03 } },
    { id: "broad", name: "Broad (drugs, corruption, treason)", v: { 0: 0.6, 2: -1, 4: 0.9 }, euBar: true, rights: true, fx: { crime: -0.05 } },
  ]),
  L("cannabis", "Cannabis", "🌿", "social", [
    { id: "prohibition", name: "Prohibition", v: { 0: 0.6, 2: -0.6, 4: 0.4 }, fx: { prisons: 0.06 } },
    { id: "decrim", name: "Decriminalised", v: { 0: -0.1, 2: 0.3 }, fx: { prisons: 0.02 } },
    { id: "medical", name: "Medical only", v: { 0: 0.2, 2: 0.1 } },
    { id: "regulated", name: "Regulated market (taxed)", v: { 0: -0.6, 2: 0.8, 4: -0.2 }, fx: { cannabisTax: 1 } },
    { id: "monopoly", name: "State monopoly", v: { 0: -0.4, 2: 0.4, 5: 0.3 }, fx: { cannabisTax: 1.6 } },
  ]),
  L("religion", "Religion and the state", "⛪", "rights", [
    { id: "state", name: "State religion, enforced", v: { 0: 1, 2: -1 }, rights: true },
    { id: "established", name: "Established church", v: { 0: 0.5, 2: -0.2 } },
    { id: "secular", name: "Secular state", v: { 0: -0.2, 2: 0.4 } },
    { id: "laicite", name: "Strict secularism", v: { 0: -0.7, 2: 0.1 } },
  ]),
  L("same_sex", "Same-sex couples", "💍", "rights", [
    { id: "banned", name: "Criminalised", v: { 0: 1, 2: -1 }, rights: true, euBar: true },
    { id: "none", name: "No recognition", v: { 0: 0.5, 2: -0.5 } },
    { id: "unions", name: "Civil unions", v: { 0: 0, 2: 0.3 } },
    { id: "marriage", name: "Marriage equality", v: { 0: -0.6, 2: 0.9 } },
  ]),
  L("immigration", "Immigration limits", "🛂", "migration", [
    { id: "open", name: "Open (work visas on request)", v: { 3: -1, 2: 0.5 }, fx: { imm: 1.6 } },
    { id: "points", name: "Points-based", v: { 3: -0.1 }, fx: { imm: 1, immSkill: 1.5 } },
    { id: "quota", name: "Yearly quotas", v: { 3: 0.3 }, fx: { imm: 0.6 } },
    { id: "strict", name: "Strict (family and skilled only)", v: { 3: 0.7, 2: -0.2 }, fx: { imm: 0.3, immSkill: 1.3 } },
    { id: "closed", name: "Closed", v: { 3: 1, 2: -0.5 }, fx: { imm: 0.05 } },
  ]),
  L("asylum", "Asylum", "🕊️", "migration", [
    { id: "generous", name: "Generous (fast process, work rights)", v: { 3: -0.8, 2: 0.4 }, fx: { asylum: 1.5 } },
    { id: "standard", name: "Standard (convention)", v: { 3: -0.1 }, fx: { asylum: 1 } },
    { id: "restrictive", name: "Restrictive (detention, offshore)", v: { 3: 0.6, 2: -0.4 }, fx: { asylum: 0.4 } },
    { id: "suspended", name: "Suspended", v: { 3: 1, 2: -0.7 }, fx: { asylum: 0 }, euBar: true },
  ]),
  L("citizenship", "Citizenship", "🪪", "migration", [
    { id: "blood", name: "By descent only", v: { 3: 0.8 } },
    { id: "10", name: "Naturalisation after 10 years", v: { 3: 0.3 } },
    { id: "5", name: "Naturalisation after 5 years", v: { 3: -0.3 } },
    { id: "soil", name: "Birthright citizenship", v: { 3: -0.8 } },
  ]),
  L("guns", "Gun control", "🔫", "security", [
    { id: "permissive", name: "Permissive", v: { 2: 0.5, 4: -0.5, 0: 0.3 }, fx: { crime: 0.05 } },
    { id: "licensed", name: "Licensed", v: { 4: 0.1 } },
    { id: "strict", name: "Strict", v: { 2: -0.2, 4: 0.4 }, fx: { crime: -0.02 } },
    { id: "banned", name: "Banned for civilians", v: { 2: -0.6, 4: 0.6 }, fx: { crime: -0.03 } },
  ]),
  L("press", "Press freedom", "📰", "rights", [
    { id: "free", name: "Free press", v: { 2: 0.8 }, fx: { press: 1 } },
    { id: "regulated", name: "Regulated", v: { 2: 0, 4: 0.2 }, fx: { press: 0.6 } },
    { id: "censored", name: "Censored", v: { 2: -0.8, 4: 0.4 }, fx: { press: 0.25 }, rights: true, euBar: true },
    { id: "state", name: "State media only", v: { 2: -1, 4: 0.5 }, fx: { press: 0 }, rights: true, euBar: true },
  ]),
  L("internet", "Internet", "🌐", "rights", [
    { id: "open", name: "Open", v: { 2: 0.6 }, fx: { net: 1 } },
    { id: "filtered", name: "Filtered", v: { 2: -0.3, 4: 0.3, 0: 0.2 }, fx: { net: 0.8 } },
    { id: "national", name: "National intranet", v: { 2: -1, 4: 0.5 }, fx: { net: 0.4 }, rights: true },
  ]),
  L("surveillance", "Surveillance", "📹", "security", [
    { id: "warrant", name: "With a warrant only", v: { 2: 0.7, 4: -0.3 }, fx: { counter: 0.8 } },
    { id: "metadata", name: "Mass metadata", v: { 2: -0.3, 4: 0.4 }, fx: { counter: 1.1 } },
    { id: "total", name: "Total surveillance", v: { 2: -1, 4: 0.8 }, fx: { counter: 1.5, crime: -0.03 }, rights: true },
  ]),
  L("police", "Police powers", "🚓", "security", [
    { id: "restrained", name: "Restrained", v: { 2: 0.5, 4: -0.4 }, fx: { policing: 0.85 } },
    { id: "standard", name: "Standard", v: {}, fx: { policing: 1 } },
    { id: "expansive", name: "Expansive (stop and search, long custody)", v: { 2: -0.6, 4: 0.7 }, fx: { policing: 1.2, prisons: 0.05 } },
  ]),
  L("conscription", "Conscription", "🪖", "security", [
    { id: "none", name: "Volunteer army", v: { 2: 0.3 }, fx: { draft: 0 } },
    { id: "selective", name: "Selective service", v: { 4: 0.2 }, fx: { draft: 0.3 } },
    { id: "men", name: "Universal, men", v: { 4: 0.5, 2: -0.4, 0: 0.2 }, fx: { draft: 0.8 } },
    { id: "all", name: "Universal, everyone", v: { 4: 0.6, 2: -0.5 }, fx: { draft: 1 } },
  ]),
  L("tuition", "University fees", "🎓", "social", [
    { id: "free", name: "Free", v: { 5: 0.7 }, fx: { tuition: 0 } },
    { id: "low", name: "Low fees", v: { 5: 0.2 }, fx: { tuition: 0.4 } },
    { id: "full", name: "Full fees", v: { 5: -0.6 }, fx: { tuition: 1 } },
  ]),
  L("healthcare", "Healthcare access", "🏥", "social", [
    { id: "universal", name: "Universal public system", v: { 5: 0.8 }, fx: { pubHealth: 1 } },
    { id: "mandate", name: "Insurance mandate", v: { 5: 0.1 }, fx: { pubHealth: 0.6 } },
    { id: "private", name: "Mostly private", v: { 5: -0.7 }, fx: { pubHealth: 0.25 } },
  ]),
  L("euthanasia", "Assisted dying", "🕯️", "social", [
    { id: "banned", name: "Banned", v: { 0: 0.5 } },
    { id: "terminal", name: "For the terminally ill", v: { 0: -0.3, 2: 0.4 } },
    { id: "broad", name: "Broad", v: { 0: -0.8, 2: 0.6 } },
  ]),
  L("alcohol", "Alcohol & tobacco", "🍷", "social", [
    { id: "permissive", name: "Permissive", v: { 2: 0.4, 0: -0.2 } },
    { id: "taxed", name: "Heavily taxed", v: { 2: -0.1 }, fx: { sinTax: 1 } },
    { id: "restricted", name: "Restricted sales", v: { 2: -0.4, 0: 0.3 }, fx: { sinTax: 0.7 } },
    { id: "prohibition", name: "Prohibition", v: { 2: -0.9, 0: 0.8 }, fx: { sinTax: 0, crime: 0.04 } },
  ]),
  L("carbon", "Carbon price", "🌍", "economy", [
    { id: "0", name: "None", v: { 5: -0.2 }, fx: { carbon: 0 } },
    { id: "25", name: "$25 a tonne", v: {}, fx: { carbon: 25 } },
    { id: "75", name: "$75 a tonne", v: { 5: 0.2, 1: -0.1 }, fx: { carbon: 75 } },
    { id: "150", name: "$150 a tonne", v: { 5: 0.3, 1: -0.4 }, fx: { carbon: 150 } },
  ]),
  L("rent_control", "Rent control", "🏘️", "housing", [
    { id: "none", name: "None", v: { 1: -0.4 }, fx: { rentCap: 0 } },
    { id: "soft", name: "Rises capped at inflation", v: { 1: 0.3 }, fx: { rentCap: 0.5 } },
    { id: "strict", name: "Rents frozen", v: { 1: 0.8 }, fx: { rentCap: 1 } },
  ]),
  L("mortgage_cap", "Mortgage reset limit", "🏦", "housing", [
    { id: "none", name: "None (follows the market)", v: { 1: -0.2 }, fx: { mortCap: 99 } },
    { id: "2", name: "No more than +2 points a reset", v: { 1: 0.2 }, fx: { mortCap: 2 } },
    { id: "1", name: "No more than +1 point a reset", v: { 1: 0.5 }, fx: { mortCap: 1 } },
  ]),
  L("capital_controls", "Capital controls", "🔒", "economy", [
    { id: "none", name: "Free movement of capital", v: { 2: 0.3 }, fx: { capCtl: 0 } },
    { id: "outflow", name: "Limits on outflows", v: { 2: -0.2 }, fx: { capCtl: 0.6 }, euBar: true },
    { id: "full", name: "Full controls", v: { 2: -0.5 }, fx: { capCtl: 1 }, euBar: true },
  ]),
];
export const LAW = Object.fromEntries(LAWS.map((l) => [l.id, l])) as Record<string, LawDef>;

/* ------------------------------------------------------------------ the constitution */

export interface ConstOption {
  id: string;
  name: string;
  note?: string;
}
export interface ConstDef {
  id: string;
  name: string;
  area: "form" | "executive" | "legislature" | "elections" | "courts" | "emergency" | "crown" | "rights";
  /** Takes effect at the next election rather than at once. */
  nextElection?: boolean;
  options: ConstOption[];
}
const C = (id: string, name: string, area: ConstDef["area"], options: (string | [string, string, string?])[], nextElection?: boolean): ConstDef => ({
  id,
  name,
  area,
  nextElection,
  options: options.map((o) => (typeof o === "string" ? { id: o.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name: o } : { id: o[0], name: o[1], note: o[2] })),
});

/** 34 choices, 125 options. */
export const CONSTITUTION: ConstDef[] = [
  C("form", "Form of state", "form", [["presidential", "Presidential republic"], ["semi", "Semi-presidential republic"], ["parliamentary", "Parliamentary republic"], ["const_monarchy", "Constitutional monarchy"], ["abs_monarchy", "Absolute monarchy"], ["one_party", "One-party state"], ["theocracy", "Theocracy"], ["junta", "Military junta"]]),
  C("hos_select", "Head of state chosen by", "executive", [["direct", "Direct election"], ["parliament", "Parliament"], ["college", "Electoral college"], ["hereditary", "Inheritance"], ["party", "The ruling party"], ["council", "A ruling council"]]),
  C("hog", "Head of government", "executive", [["same", "The head of state"], ["pm_parl", "Prime minister chosen by parliament"], ["pm_hos", "Prime minister appointed by the head of state"]]),
  C("hos_term", "Head of state's term", "executive", [["4", "4 years"], ["5", "5 years"], ["6", "6 years"], ["7", "7 years"], ["life", "For life"]], true),
  C("term_limit", "Term limits", "executive", [["one", "One term"], ["two", "Two terms"], ["two_consec", "Two in a row"], ["none", "No limit"]]),
  C("vp", "Deputy", "executive", [["none", "None"], ["running_mate", "Elected running mate"], ["appointed", "Appointed"]]),
  C("lower_system", "Lower house elected by", "elections", [["fptp", "First past the post"], ["two_round", "Two-round system"], ["dhondt", "Party lists (D'Hondt)"], ["sainte_lague", "Party lists (Sainte-Laguë)"], ["mixed", "Mixed member proportional"], ["appointed", "Appointment"]], true),
  C("threshold", "Threshold for seats", "elections", [["0", "None"], ["3", "3%"], ["5", "5%"], ["10", "10%"]], true),
  C("lower_term", "Lower house term", "legislature", [["2", "2 years"], ["3", "3 years"], ["4", "4 years"], ["5", "5 years"]], true),
  C("lower_size", "Lower house size", "legislature", [["small", "Small (about 150)"], ["medium", "Medium (about 350)"], ["large", "Large (about 600)"]], true),
  C("upper", "Upper house", "legislature", [["none", "None"], ["elected", "Elected all at once"], ["thirds", "Elected, a third renewed each time"], ["halves", "Elected, half renewed each time"], ["regions", "Chosen by the regions"], ["appointed", "Appointed"]], true),
  C("upper_powers", "Upper house powers", "legislature", [["advisory", "Advisory"], ["delay", "Can delay bills"], ["equal", "Equal (both must pass)"]]),
  C("veto", "Executive veto", "executive", [["none", "None"], ["suspensive", "Suspensive (majority overrides)"], ["qualified", "Qualified (two-thirds override)"], ["absolute", "Absolute"]]),
  C("review", "Judicial review", "courts", [["none", "None"], ["supreme", "Supreme court"], ["council", "Constitutional council (before laws take effect)"], ["court", "Constitutional court"]]),
  C("judges", "Judges appointed by", "courts", [["executive", "The executive"], ["supermajority", "Parliament, by two-thirds"], ["council", "A judicial council"], ["election", "Election"]]),
  C("emergency", "Emergency powers", "emergency", [["none", "None"], ["limited", "30 days, parliament must approve"], ["broad", "Broad"], ["indefinite", "Indefinite"]]),
  C("dissolution", "Dissolving parliament", "legislature", [["none", "Not allowed"], ["pm", "The prime minister can"], ["president", "The president can"], ["after_nc", "Only after a no-confidence vote"]]),
  C("no_confidence", "No-confidence motions", "legislature", [["simple", "Simple majority"], ["constructive", "Constructive (must name a successor)"], ["none", "None"]]),
  C("succession", "If the leader dies or resigns", "executive", [["vp", "The deputy takes over"], ["speaker", "The speaker takes over"], ["interim", "An interim leader, then a vote"], ["heir", "The heir succeeds"], ["council", "A council chooses"]]),
  C("royal_rule", "Royal succession", "crown", [["agnatic", "Eldest son"], ["absolute", "Eldest child"], ["elective", "Chosen by a royal council"]]),
  C("regency", "If the heir is a child", "crown", [["council", "A regency council"], ["parent", "The surviving parent"], ["parliament", "Parliament names a regent"]]),
  C("decrees", "Decrees", "executive", [["none", "None"], ["delegated", "Only when parliament delegates"], ["orders", "Executive orders"], ["rule", "Rule by decree"]]),
  C("referendums", "Referendums", "elections", [["none", "None"], ["advisory", "Advisory"], ["binding", "Binding, and citizens can start them"]]),
  C("amend", "Amending the constitution", "form", [["simple", "Simple majority"], ["two_thirds", "Two-thirds of parliament"], ["referendum", "Two-thirds and a referendum"]]),
  C("federal", "Territorial organisation", "form", [["unitary", "Unitary"], ["devolved", "Devolved regions"], ["federal", "Federal"]]),
  C("voting_age", "Voting age", "elections", [["16", "16"], ["18", "18"], ["21", "21"]], true),
  C("compulsory", "Compulsory voting", "elections", [["no", "No"], ["yes", "Yes"]], true),
  C("party_bans", "Parties", "rights", [["none", "All parties allowed"], ["extremist", "Extremist parties can be banned"], ["single", "One party only"]]),
  C("central_bank", "Central bank", "executive", [["independent", "Independent"], ["government", "Run by the government"]]),
  C("military", "The armed forces answer to", "executive", [["civilian", "Civilian government"], ["autonomous", "Themselves, mostly"], ["supreme", "They are the government"]]),
  C("rights", "Bill of rights", "rights", [["full", "Full and entrenched"], ["limited", "Limited"], ["none", "None"]]),
  C("finance", "Campaign finance", "elections", [["unlimited", "Unlimited"], ["capped", "Capped spending"], ["public", "Public funding"]]),
  C("recall", "Recall elections", "elections", [["no", "No"], ["yes", "Yes"]]),
  C("timing", "Election dates", "elections", [["fixed", "Fixed"], ["flexible", "Flexible (the government chooses)"]]),
];
export const CONST = Object.fromEntries(CONSTITUTION.map((c) => [c.id, c])) as Record<string, ConstDef>;

/* ------------------------------------------------------------------ public services and benefits */

export const SERVICE_IDS = ["health", "education", "justice", "police", "prisons", "admin"] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];
export interface ServiceDef {
  id: ServiceId;
  name: string;
  icon: string;
  /** Staff needed per 1,000 people at a rich country's standard. */
  norm: number;
  /** Years to train a new member of staff. */
  train: number;
  /** Facilities: what they're called, and how many people one serves. */
  facility: string;
  per: number;
  /** $ cost of one facility, millions. */
  build: number;
  /** Supplies needed per member of staff per year ($ thousands of each good). */
  supplies: [string, number][];
  group: GroupId;
  /** Pay compared with the average wage. */
  pay: number;
}
export const SERVICES: ServiceDef[] = [
  { id: "health", name: "Health", icon: "🏥", norm: 14, train: 4, facility: "hospital beds", per: 300, build: 0.45, supplies: [["medicines", 40], ["med_supplies", 18], ["med_devices", 10], ["vaccines", 4]], group: "health", pay: 1.15 },
  { id: "education", name: "Education", icon: "🏫", norm: 16, train: 3, facility: "school places", per: 4.5, build: 0.03, supplies: [["computers", 2], ["paper", 1]], group: "teachers", pay: 1.05 },
  { id: "justice", name: "Justice", icon: "⚖️", norm: 0.9, train: 4, facility: "courtrooms", per: 30000, build: 4, supplies: [["software", 4], ["paper", 2]], group: "civil", pay: 1.6 },
  { id: "police", name: "Police", icon: "🚓", norm: 3.2, train: 1, facility: "stations", per: 25000, build: 6, supplies: [["cars", 6], ["small_arms", 1], ["petrol", 3]], group: "civil", pay: 1.05 },
  { id: "prisons", name: "Prisons", icon: "🔒", norm: 0.7, train: 0.5, facility: "cells", per: 900, build: 0.18, supplies: [["processed_food", 6]], group: "civil", pay: 0.95 },
  { id: "admin", name: "Administration", icon: "🏛️", norm: 12, train: 0.5, facility: "offices", per: 12000, build: 5, supplies: [["software", 3], ["paper", 1], ["computers", 1]], group: "civil", pay: 1 },
];
export const SERVICE = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<ServiceId, ServiceDef>;

/* ------------------------------------------------------------------ energy */

export const PLANT_TYPES = ["coal", "gas", "oil", "nuclear", "hydro", "wind", "solar", "geothermal", "biomass", "fusion", "storage"] as const;
export type PlantType = (typeof PLANT_TYPES)[number];
export interface PlantDef {
  type: PlantType;
  name: string;
  icon: string;
  /** Share of the year at full output. */
  cf: number;
  /** Fuel good and $bn of it per TWh. */
  fuel?: [string, number];
  /** t CO2 per MWh. */
  co2: number;
  /** $bn per GW to build. */
  cost: number;
  /** Days to build. */
  days: number;
  /** Tech needed (field, level). */
  tech?: [TechField, number];
  color: string;
}
export const PLANTS: Record<PlantType, PlantDef> = {
  coal: { type: "coal", name: "Coal plant", icon: "🏭", cf: 0.55, fuel: ["thermal_coal", 0.032], co2: 0.95, cost: 2, days: 1460, color: "#6b6b6b" },
  gas: { type: "gas", name: "Gas plant", icon: "🔥", cf: 0.5, fuel: ["natgas", 0.05], co2: 0.4, cost: 1, days: 900, color: "#ff9f43" },
  oil: { type: "oil", name: "Oil plant", icon: "🛢️", cf: 0.35, fuel: ["fuel_oil", 0.09], co2: 0.75, cost: 1.1, days: 900, color: "#8b5a2b" },
  nuclear: { type: "nuclear", name: "Nuclear plant", icon: "⚛️", cf: 0.9, fuel: ["nuclear_fuel", 0.006], co2: 0.01, cost: 7, days: 3285, tech: ["energy", 2], color: "#a55eea" },
  hydro: { type: "hydro", name: "Hydro dam", icon: "💧", cf: 0.42, co2: 0.01, cost: 3, days: 2190, color: "#2e86de" },
  wind: { type: "wind", name: "Wind farm", icon: "🌬️", cf: 0.33, co2: 0.01, cost: 1.4, days: 540, color: "#48dbfb" },
  solar: { type: "solar", name: "Solar farm", icon: "☀️", cf: 0.2, co2: 0.02, cost: 0.9, days: 365, color: "#feca57" },
  geothermal: { type: "geothermal", name: "Geothermal plant", icon: "🌋", cf: 0.8, co2: 0.04, cost: 4, days: 1460, tech: ["energy", 3], color: "#ee5253" },
  biomass: { type: "biomass", name: "Biomass plant", icon: "🌿", cf: 0.6, fuel: ["timber", 0.03], co2: 0.1, cost: 2.5, days: 1095, color: "#10ac84" },
  fusion: { type: "fusion", name: "Fusion reactor", icon: "✴️", cf: 0.9, fuel: ["helium3", 0.001], co2: 0, cost: 12, days: 2555, tech: ["energy", 10], color: "#f368e0" },
  storage: { type: "storage", name: "Grid batteries", icon: "🔋", cf: 0, co2: 0, cost: 0.8, days: 270, tech: ["energy", 1], color: "#1dd1a1" },
};
/** Fuels a country can keep in strategic reserve, with the days' use it starts with in a rich country. */
export const RESERVE_FUELS = ["crude", "natgas", "thermal_coal", "nuclear_fuel"] as const;

/* ------------------------------------------------------------------ technology */

export const TECH_FIELDS = [
  "agriculture", "energy", "materials", "industry", "computing", "ai", "biotech", "medicine", "transport", "construction",
  "space", "land", "air", "naval", "missiles", "nuclear", "climate", "finance", "comms",
] as const;
export type TechField = (typeof TECH_FIELDS)[number];
export const FIELD_INFO: Record<TechField, { name: string; icon: string }> = {
  agriculture: { name: "Agriculture", icon: "🌾" }, energy: { name: "Energy", icon: "⚡" }, materials: { name: "Materials", icon: "🧪" }, industry: { name: "Industry", icon: "🏭" },
  computing: { name: "Computing", icon: "💻" }, ai: { name: "Artificial intelligence", icon: "🤖" }, biotech: { name: "Biotechnology", icon: "🧬" }, medicine: { name: "Medicine", icon: "💉" },
  transport: { name: "Transport", icon: "🚄" }, construction: { name: "Construction", icon: "🏗️" }, space: { name: "Space", icon: "🚀" }, land: { name: "Land warfare", icon: "🪖" },
  air: { name: "Air power", icon: "✈️" }, naval: { name: "Naval power", icon: "⚓" }, missiles: { name: "Missiles", icon: "🎯" }, nuclear: { name: "Nuclear", icon: "☢️" },
  climate: { name: "Climate & environment", icon: "🌍" }, finance: { name: "Finance & government", icon: "🏛️" }, comms: { name: "Communications", icon: "📡" },
};
const TN: Record<TechField, string[]> = {
  agriculture: ["Precision irrigation", "Drought-hardy wheat", "Vertical farms", "Soil microbiome mapping", "Robot harvesters", "Nitrogen-fixing cereals", "Lab-grown meat", "Desert greenhouses", "Gene-edited rice", "Perennial grains", "Closed-loop food systems"],
  energy: ["Grid-scale batteries", "Third-generation reactors", "Enhanced geothermal", "Floating offshore wind", "Perovskite solar", "Small modular reactors", "Long-distance HVDC", "Green hydrogen at scale", "Fourth-generation reactors", "Fusion ignition", "Helium-3 fusion"],
  materials: ["Recycled rare earths", "Carbon-fibre lines", "Graphene sheets", "Self-healing concrete", "Solid-state electrolytes", "Metamaterials", "Room-temperature magnets", "Nanotube cables", "Programmable matter", "Diamond semiconductors", "Superconducting wire"],
  industry: ["Lights-out factories", "Additive manufacturing", "Digital twins", "Cobots", "Modular plants", "Bio-manufacturing", "Atomic-precision machining", "Zero-waste lines", "Molecular assembly", "Orbital foundries", "Autonomous supply chains"],
  computing: ["Exascale computing", "Chiplets", "2 nm chips", "Photonic interconnects", "Neuromorphic chips", "1 nm chips", "Error-corrected qubits", "Quantum advantage", "Quantum networks", "Optical computers", "Universal quantum computers"],
  ai: ["Language models", "Machine translation", "Autonomous logistics", "AI diagnosis", "Self-driving cars", "AI scientists", "Robot workers", "AI civil service", "General-purpose robots", "Recursive design", "Artificial general intelligence"],
  biotech: ["Gene sequencing at scale", "CRISPR therapies", "mRNA platforms", "Synthetic biology", "Organ printing", "Cell reprogramming", "Engineered microbes", "Biofoundries", "Regenerative medicine", "Ageing therapies", "Designer organisms"],
  medicine: ["Universal flu vaccine", "Rapid diagnostics", "Antibiotic successors", "Cancer immunotherapy", "Telemedicine", "Malaria vaccine", "Personalised drugs", "Nanomedicine", "Brain-computer interfaces", "Pandemic early warning", "One-week vaccines"],
  transport: ["Electric trucks", "High-speed rail", "Autonomous ships", "Hydrogen aircraft", "Maglev", "Electric air taxis", "Hyperloop", "Supersonic airliners", "Automated ports", "Global drone freight", "Suborbital travel"],
  construction: ["Prefab housing", "3D-printed houses", "Mass timber towers", "Earthquake-proof frames", "Flood-adaptive cities", "Robot bricklayers", "Smart grids in cities", "Arcologies", "Floating districts", "Self-building structures", "Lunar construction"],
  space: ["Reusable rockets", "Satellite constellations", "Space stations", "Lunar landers", "Lunar outposts", "In-situ resource use", "Lunar mining", "Helium-3 extraction", "Nuclear propulsion", "Lunar cities", "Mars missions"],
  land: ["Loitering munitions", "Active protection", "Networked infantry", "Robot vehicles", "Electronic warfare", "Next-generation tanks", "Exoskeletons", "Autonomous swarms", "Directed-energy air defence", "Hypersonic artillery", "Fully robotic brigades"],
  air: ["Fourth-generation upgrades", "Stealth fighters", "Loyal wingmen", "Long-range bombers", "Hypersonic interceptors", "Sixth-generation fighters", "Drone carriers", "Air-launched lasers", "Space planes", "Autonomous air wings", "Total air dominance"],
  naval: ["Modern frigates", "Quiet submarines", "Unmanned surface vessels", "Supercarriers", "Underwater drones", "Railguns", "Arsenal ships", "Laser point defence", "Seabed warfare", "Autonomous fleets", "Ocean denial"],
  missiles: ["Cruise missiles", "Ballistic missiles", "Missile defence", "Hypersonic glide", "Anti-ship ballistic missiles", "Multiple warheads", "Space-based sensors", "Boost-phase interception", "Fractional orbit", "Swarm missiles", "Space-based interceptors"],
  nuclear: ["Enrichment", "Reactor fuel cycle", "Weapon design", "Warhead miniaturisation", "Submarine deterrent", "Tactical warheads", "Neutron weapons", "Missile shields", "Pure fusion devices", "Second-strike certainty", "Total deterrence"],
  climate: ["Carbon capture", "Methane leak detection", "Reforestation drones", "Direct air capture", "Cloud brightening", "Ocean alkalinity", "Climate-proof crops", "Stratospheric aerosols", "Enhanced weathering", "Glacier stabilisation", "Planetary thermostat"],
  finance: ["Digital currency", "Real-time taxes", "Digital identity", "Smart contracts", "Fraud-detecting AI", "Open banking", "Algorithmic budgeting", "Predictive policing", "E-government", "Automated audits", "Transparent state"],
  comms: ["5G networks", "Fibre to every home", "Satellite internet", "6G networks", "Quantum encryption", "Deep-fake detection", "Low-orbit mesh", "Universal translation", "Mind-to-text", "Lunar relay network", "Interplanetary internet"],
};
export interface TechDef {
  id: string;
  field: TechField;
  level: number;
  name: string;
  /** Research points. */
  cost: number;
}
export const TECHS: TechDef[] = TECH_FIELDS.flatMap((f) => TN[f].map((name, level) => ({ id: `${f}_${level}`, field: f, level, name, cost: Math.round(40 * Math.pow(1.55, level)) })));
export const TECH_INDEX = Object.fromEntries(TECHS.map((t, i) => [t.id, i]));

/* ------------------------------------------------------------------ military */

export const EQUIP_IDS = ["infantry", "tank", "ifv", "artillery", "mlrs", "sam", "fighter", "bomber", "drone", "helicopter", "airlift", "frigate", "submarine", "carrier", "cruise", "ballistic"] as const;
export type EquipId = (typeof EQUIP_IDS)[number];
export interface EquipDef {
  id: EquipId;
  name: string;
  icon: string;
  /** $ millions each. */
  cost: number;
  /** Days for a batch. */
  days: number;
  /** Strength in each domain. */
  land: number;
  air: number;
  sea: number;
  /** One-shot strike weapon. */
  strike?: number;
  /** Defence good it's made from. */
  good: string;
  /** Tech field that improves it. */
  field: TechField;
  /** Units in a batch order. */
  batch: number;
}
export const EQUIP: Record<EquipId, EquipDef> = {
  infantry: { id: "infantry", name: "Infantry battalions", icon: "🪖", cost: 30, days: 120, land: 1, air: 0, sea: 0, good: "small_arms", field: "land", batch: 10 },
  tank: { id: "tank", name: "Main battle tanks", icon: "🛡️", cost: 8, days: 240, land: 0.08, air: 0, sea: 0, good: "armour", field: "land", batch: 50 },
  ifv: { id: "ifv", name: "Infantry fighting vehicles", icon: "🚙", cost: 4, days: 180, land: 0.04, air: 0, sea: 0, good: "armour", field: "land", batch: 50 },
  artillery: { id: "artillery", name: "Artillery", icon: "💥", cost: 4, days: 150, land: 0.06, air: 0, sea: 0, good: "artillery", field: "land", batch: 40 },
  mlrs: { id: "mlrs", name: "Rocket artillery", icon: "🎆", cost: 6, days: 180, land: 0.1, air: 0, sea: 0, good: "artillery", field: "missiles", batch: 20 },
  sam: { id: "sam", name: "Air defence batteries", icon: "📡", cost: 250, days: 365, land: 0, air: 2, sea: 0, good: "missiles", field: "missiles", batch: 4 },
  fighter: { id: "fighter", name: "Fighter jets", icon: "✈️", cost: 90, days: 720, land: 0.12, air: 1, sea: 0.05, good: "combat_aircraft", field: "air", batch: 12 },
  bomber: { id: "bomber", name: "Bombers", icon: "🛩️", cost: 500, days: 1095, land: 0.5, air: 0.2, sea: 0.2, good: "combat_aircraft", field: "air", batch: 4 },
  drone: { id: "drone", name: "Attack drones", icon: "🛸", cost: 0.05, days: 30, land: 0.004, air: 0, sea: 0, strike: 0.003, good: "drones", field: "ai", batch: 1000 },
  helicopter: { id: "helicopter", name: "Attack helicopters", icon: "🚁", cost: 35, days: 365, land: 0.15, air: 0.05, sea: 0.02, good: "combat_aircraft", field: "air", batch: 12 },
  airlift: { id: "airlift", name: "Transport aircraft", icon: "🛬", cost: 120, days: 730, land: 0.02, air: 0, sea: 0, good: "combat_aircraft", field: "air", batch: 4 },
  frigate: { id: "frigate", name: "Frigates & destroyers", icon: "🚢", cost: 900, days: 1460, land: 0.05, air: 0.5, sea: 3, good: "warships", field: "naval", batch: 2 },
  submarine: { id: "submarine", name: "Submarines", icon: "🐋", cost: 1800, days: 1825, land: 0.02, air: 0, sea: 5, good: "warships", field: "naval", batch: 1 },
  carrier: { id: "carrier", name: "Aircraft carriers", icon: "🛳️", cost: 9000, days: 2920, land: 1, air: 8, sea: 10, good: "warships", field: "naval", batch: 1 },
  cruise: { id: "cruise", name: "Cruise missiles", icon: "🎯", cost: 2, days: 120, land: 0, air: 0, sea: 0, strike: 1, good: "missiles", field: "missiles", batch: 50 },
  ballistic: { id: "ballistic", name: "Ballistic missiles", icon: "🚀", cost: 5, days: 180, land: 0, air: 0, sea: 0, strike: 2, good: "missiles", field: "missiles", batch: 20 },
};

/* ------------------------------------------------------------------ the world's institutions */

export const EU = ["AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE"];
export const EUROZONE = ["AUT", "BEL", "BGR", "HRV", "CYP", "EST", "FIN", "FRA", "DEU", "GRC", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "PRT", "SVK", "SVN", "ESP"];
export const EU_CANDIDATES = ["UKR", "MDA", "MNE", "ALB", "SRB", "MKD", "BIH", "GEO", "TUR"];
export const NATO = ["ALB", "BEL", "BGR", "CAN", "HRV", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "ISL", "ITA", "LVA", "LTU", "LUX", "MNE", "NLD", "MKD", "NOR", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE", "TUR", "GBR", "USA"];
export const P5 = ["USA", "RUS", "CHN", "GBR", "FRA"];
/** Elected members of the Security Council at the start, with the year their seat ends. */
export const UNSC_ELECTED: [string, number][] = [["BHR", 2027], ["COL", 2027], ["COD", 2027], ["LVA", 2027], ["LBR", 2027], ["DEU", 2028], ["AUT", 2028], ["PHL", 2028], ["KGZ", 2028], ["ZWE", 2028]];
export const OPEC = ["DZA", "COG", "GNQ", "GAB", "IRN", "IRQ", "KWT", "LBY", "NGA", "SAU", "ARE", "VEN"];
export const OPEC_PLUS = ["RUS", "KAZ", "MEX", "OMN", "AZE", "BHR", "BRN", "MYS", "SDN", "SSD"];
export const ASEAN = ["BRN", "KHM", "IDN", "LAO", "MYS", "MMR", "PHL", "SGP", "THA", "VNM", "TLS"];
export const USMCA = ["USA", "CAN", "MEX"];
export const MERCOSUR = ["ARG", "BRA", "PRY", "URY", "BOL"];
export const BRICS = ["BRA", "RUS", "IND", "CHN", "ZAF", "EGY", "ETH", "IRN", "ARE", "IDN"];
export const GCC = ["SAU", "ARE", "QAT", "KWT", "OMN", "BHR"];
export const CSTO = ["RUS", "BLR", "KAZ", "KGZ", "TJK", "ARM"];
/** NPT outsiders. */
export const NON_NPT = ["IND", "PAK", "ISR", "PRK", "SSD"];

export type OrgId = "un" | "unsc" | "eu" | "euro" | "nato" | "opec" | "asean" | "usmca" | "mercosur" | "afcfta" | "au" | "brics" | "gcc" | "csto" | "imf" | "iaea";
export const ORGS: Record<OrgId, { name: string; short: string; icon: string; kind: "global" | "bloc" | "alliance" | "cartel" | "finance"; trade?: boolean; text: string }> = {
  un: { name: "United Nations", short: "UN", icon: "🇺🇳", kind: "global", text: "Every country. The General Assembly votes on resolutions that bind no one but shape opinion." },
  unsc: { name: "UN Security Council", short: "UNSC", icon: "🛡️", kind: "global", text: "Five permanent members with a veto and ten elected for two years. Its resolutions can impose sanctions or authorise force." },
  eu: { name: "European Union", short: "EU", icon: "🇪🇺", kind: "bloc", trade: true, text: "A single market and customs union: one external tariff, collective sanctions, qualified-majority votes." },
  euro: { name: "Eurozone (ECB)", short: "Euro", icon: "💶", kind: "finance", text: "One currency and one interest rate, set by the European Central Bank for all members." },
  nato: { name: "NATO", short: "NATO", icon: "🛡️", kind: "alliance", text: "An attack on one is an attack on all (Article 5), though each member decides how to help." },
  opec: { name: "OPEC+", short: "OPEC", icon: "🛢️", kind: "cartel", text: "Oil producers who set output quotas to hold up the price, when they keep to them." },
  asean: { name: "ASEAN", short: "ASEAN", icon: "🌏", kind: "bloc", trade: true, text: "South-East Asia's free-trade area. Decisions by consensus." },
  usmca: { name: "USMCA", short: "USMCA", icon: "🌎", kind: "bloc", trade: true, text: "North American free trade, with rules of origin." },
  mercosur: { name: "Mercosur", short: "Mercosur", icon: "🌎", kind: "bloc", trade: true, text: "South America's customs union, with a common external tariff." },
  afcfta: { name: "African Continental FTA", short: "AfCFTA", icon: "🌍", kind: "bloc", trade: true, text: "Free trade across the African Union." },
  au: { name: "African Union", short: "AU", icon: "🌍", kind: "global", text: "Suspends members after coups; can send peacekeepers." },
  brics: { name: "BRICS", short: "BRICS", icon: "🌐", kind: "global", text: "Large emerging economies; a development bank and a common voice." },
  gcc: { name: "Gulf Cooperation Council", short: "GCC", icon: "🏜️", kind: "bloc", trade: true, text: "The Gulf monarchies' customs union and defence pact." },
  csto: { name: "CSTO", short: "CSTO", icon: "🛡️", kind: "alliance", text: "A defence pact around Russia." },
  imf: { name: "International Monetary Fund", short: "IMF", icon: "🏦", kind: "finance", text: "Lends to countries that can't borrow, in tranches, if they meet the conditions." },
  iaea: { name: "International Atomic Energy Agency", short: "IAEA", icon: "☢️", kind: "global", text: "Inspects nuclear programmes for treaty members." },
};

/* ------------------------------------------------------------------ straits */

export interface StraitDef {
  id: string;
  name: string;
  /** Lon, lat. */
  at: [number, number];
  /** Countries that depend on it, and the share of their sea trade that passes. */
  users: Record<string, number>;
  /** Who sits on it (can restrict it). */
  coast: string[];
}
export const STRAITS: StraitDef[] = [
  { id: "hormuz", name: "Strait of Hormuz", at: [56.4, 26.6], coast: ["IRN", "OMN"], users: { SAU: 0.6, KWT: 1, QAT: 1, ARE: 0.8, IRQ: 0.95, IRN: 0.9, BHR: 1, JPN: 0.25, KOR: 0.25, IND: 0.2, CHN: 0.12, PAK: 0.2 } },
  { id: "malacca", name: "Strait of Malacca", at: [101.5, 2.8], coast: ["MYS", "IDN", "SGP"], users: { CHN: 0.35, JPN: 0.3, KOR: 0.3, TWN: 0.3, SGP: 0.6, MYS: 0.4, IDN: 0.2, THA: 0.3, VNM: 0.25, PHL: 0.15, IND: 0.1 } },
  { id: "suez", name: "Suez Canal", at: [32.5, 30.5], coast: ["EGY"], users: { EGY: 0.3, ITA: 0.15, GRC: 0.2, NLD: 0.1, DEU: 0.08, FRA: 0.08, ESP: 0.08, GBR: 0.08, IND: 0.15, SAU: 0.15, ISR: 0.15, TUR: 0.12, CHN: 0.08, JPN: 0.05, KOR: 0.05, PAK: 0.1, ARE: 0.1 } },
  { id: "bab", name: "Bab el-Mandeb", at: [43.4, 12.6], coast: ["YEM", "DJI", "ERI"], users: { EGY: 0.3, SAU: 0.2, DJI: 0.8, ERI: 0.6, SDN: 0.3, ISR: 0.15, ITA: 0.12, GRC: 0.18, IND: 0.12, JOR: 0.3, ETH: 0.5 } },
  { id: "bosporus", name: "Turkish Straits", at: [29.0, 41.1], coast: ["TUR"], users: { UKR: 0.9, RUS: 0.25, GEO: 0.8, BGR: 0.4, ROU: 0.5, MDA: 0.6, KAZ: 0.15, AZE: 0.2 } },
  { id: "panama", name: "Panama Canal", at: [-79.7, 9.1], coast: ["PAN"], users: { PAN: 0.5, USA: 0.08, CHL: 0.15, PER: 0.2, ECU: 0.25, COL: 0.2, CHN: 0.05, JPN: 0.05, KOR: 0.05, CRI: 0.2, GTM: 0.15 } },
  { id: "gibraltar", name: "Strait of Gibraltar", at: [-5.6, 35.95], coast: ["ESP", "MAR", "GBR"], users: { ITA: 0.2, GRC: 0.15, DZA: 0.2, TUN: 0.4, LBY: 0.3, EGY: 0.1, ISR: 0.1, TUR: 0.15, MLT: 0.5, CYP: 0.4, LBN: 0.4, HRV: 0.3, SVN: 0.3 } },
  { id: "danish", name: "Danish Straits", at: [11.0, 55.6], coast: ["DNK", "SWE"], users: { RUS: 0.2, POL: 0.5, FIN: 0.7, EST: 0.8, LVA: 0.8, LTU: 0.7, SWE: 0.3, DEU: 0.1 } },
  { id: "taiwan", name: "Taiwan Strait", at: [119.8, 24.3], coast: ["CHN", "TWN"], users: { TWN: 0.5, JPN: 0.2, KOR: 0.25, CHN: 0.15, PHL: 0.1 } },
];

/* ------------------------------------------------------------------ hazards */

export interface DiseaseDef {
  id: string;
  name: string;
  /** Daily infections per infectious person with no measures. */
  beta: number;
  /** Days infectious. */
  days: number;
  /** Deaths per infection, with good care and with none. */
  cfr: [number, number];
  /** Share hospitalised. */
  hosp: number;
  /** Research points to a vaccine. */
  vaccine: number;
}
export const DISEASES: DiseaseDef[] = [
  { id: "flu", name: "Avian influenza H5", beta: 0.3, days: 5, cfr: [0.004, 0.03], hosp: 0.03, vaccine: 260 },
  { id: "corona", name: "Novel coronavirus", beta: 0.36, days: 7, cfr: [0.003, 0.02], hosp: 0.04, vaccine: 340 },
  { id: "cholera", name: "Cholera", beta: 0.24, days: 6, cfr: [0.005, 0.15], hosp: 0.1, vaccine: 120 },
  { id: "hemorrhagic", name: "Hemorrhagic fever", beta: 0.18, days: 9, cfr: [0.25, 0.6], hosp: 0.6, vaccine: 420 },
  { id: "measles", name: "Measles", beta: 0.6, days: 8, cfr: [0.001, 0.03], hosp: 0.05, vaccine: 0 },
  { id: "mpox", name: "Mpox", beta: 0.16, days: 14, cfr: [0.002, 0.05], hosp: 0.06, vaccine: 80 },
];
export const MEASURES = [
  { id: "surveillance", name: "Disease surveillance", text: "Catches outbreaks sooner. Costs a little and needs lab staff.", cut: 0, cost: 0.0002 },
  { id: "masks", name: "Masks indoors", text: "Cheap; cuts spread a little; mildly unpopular.", cut: 0.12, cost: 0 },
  { id: "distancing", name: "Distancing and limits on crowds", text: "Hurts hospitality and culture.", cut: 0.25, cost: 0.004 },
  { id: "schools", name: "Close schools", text: "Parents stay home: fewer workers, and learning lost.", cut: 0.15, cost: 0.006 },
  { id: "lockdown", name: "Lockdown", text: "Stops most spread; stops much of the economy too.", cut: 0.6, cost: 0.03 },
  { id: "travel", name: "Travel controls", text: "Fewer cases arriving from abroad; tourism collapses.", cut: 0.05, cost: 0.004 },
] as const;
export type MeasureId = (typeof MEASURES)[number]["id"];

export const DISASTERS = [
  { id: "wildfire", name: "Wildfire", icon: "🔥", damage: 0.02, deaths: 0.00002 },
  { id: "flood", name: "Flood", icon: "🌊", damage: 0.04, deaths: 0.00005 },
  { id: "cyclone", name: "Cyclone", icon: "🌀", damage: 0.07, deaths: 0.0001 },
  { id: "earthquake", name: "Earthquake", icon: "🫨", damage: 0.1, deaths: 0.0004 },
  { id: "tsunami", name: "Tsunami", icon: "🌊", damage: 0.12, deaths: 0.0008 },
  { id: "drought", name: "Drought", icon: "🏜️", damage: 0.03, deaths: 0.00001 },
] as const;
export type DisasterId = (typeof DISASTERS)[number]["id"];

/* ------------------------------------------------------------------ the Moon */

export const MOON_SITES = [
  { id: "shackleton", name: "Shackleton Crater rim", lat: -89.7, lon: 0, ice: 1, he3: 0.4, sun: 0.9 },
  { id: "malapert", name: "Malapert Massif", lat: -85.9, lon: 2.9, ice: 0.7, he3: 0.4, sun: 0.8 },
  { id: "peary", name: "Peary Crater", lat: 88.6, lon: 33, ice: 0.8, he3: 0.3, sun: 0.85 },
  { id: "tranquillitatis", name: "Mare Tranquillitatis", lat: 8.5, lon: 31.4, ice: 0.1, he3: 1, sun: 0.5 },
  { id: "aristarchus", name: "Aristarchus Plateau", lat: 24.7, lon: -47.5, ice: 0.1, he3: 0.7, sun: 0.5 },
  { id: "imbrium", name: "Mare Imbrium", lat: 32.8, lon: -15.6, ice: 0.05, he3: 0.8, sun: 0.5 },
  { id: "marius", name: "Marius Hills skylight", lat: 14.1, lon: -56.8, ice: 0.2, he3: 0.5, sun: 0.5 },
  { id: "procellarum", name: "Oceanus Procellarum", lat: 18.4, lon: -57.4, ice: 0.05, he3: 0.9, sun: 0.5 },
] as const;
export const MOON_CHARTERS = [
  { id: "open", name: "Open Moon Charter", text: "Anyone may mine; profits taxed for a common fund. Popular with countries without rockets." },
  { id: "accords", name: "Safety-zone Accords", text: "First come, first served, with safety zones around each site. Favoured by the space powers." },
  { id: "heritage", name: "Common Heritage Treaty", text: "No mining without a vote of all members. Slows everything down." },
] as const;

/* ------------------------------------------------------------------ parties */

export type Family = "far_left" | "left" | "green" | "soc_dem" | "liberal" | "centre" | "christian" | "conservative" | "nationalist" | "far_right" | "regional" | "agrarian" | "islamist" | "ruling";
/** Where each family stands on the six values (−1…1): what voters weigh them by. */
export const FAMILIES: Record<Family, { name: string; color: string; v: [number, number, number, number, number, number]; words: string[] }> = {
  far_left: { name: "Radical left", color: "#a4161a", v: [-0.7, 1, 0.4, -0.7, -0.5, 1], words: ["Workers' Front", "Left Unity", "Popular Front", "Communist Party"] },
  left: { name: "Left", color: "#e63946", v: [-0.5, 0.8, 0.5, -0.5, -0.3, 0.8], words: ["Left Alliance", "Socialist Party", "Labour Left", "People's Left"] },
  green: { name: "Greens", color: "#2a9d8f", v: [-0.6, 0.5, 0.7, -0.6, -0.4, 0.6], words: ["Green Party", "Ecologists", "Green Future", "The Greens"] },
  soc_dem: { name: "Social democrats", color: "#ef476f", v: [-0.3, 0.6, 0.4, -0.2, 0, 0.5], words: ["Social Democrats", "Labour Party", "Workers' Party", "Progressive Alliance"] },
  liberal: { name: "Liberals", color: "#ffb703", v: [-0.4, -0.3, 0.9, -0.3, 0, -0.3], words: ["Liberal Democrats", "Free Democrats", "Liberal Party", "Renewal"] },
  centre: { name: "Centrists", color: "#f4a261", v: [0, 0, 0.4, 0, 0.2, 0], words: ["Centre Party", "Civic Platform", "Together", "Forward"] },
  christian: { name: "Christian democrats", color: "#ff7b00", v: [0.6, 0.1, 0, 0.3, 0.4, 0.1], words: ["Christian Democrats", "People's Party", "Christian Union", "Family Party"] },
  conservative: { name: "Conservatives", color: "#1d4e89", v: [0.4, -0.5, 0.2, 0.4, 0.6, -0.5], words: ["Conservative Party", "National Party", "Republican Union", "Unity"] },
  nationalist: { name: "National conservatives", color: "#3d348b", v: [0.7, 0, -0.3, 0.9, 0.8, 0], words: ["National Rally", "Homeland", "Patriots", "Sovereignty"] },
  far_right: { name: "Far right", color: "#22223b", v: [0.9, -0.1, -0.6, 1, 1, -0.1], words: ["National Front", "Identity", "Order and Justice", "Reconquest"] },
  regional: { name: "Regionalists", color: "#9c6644", v: [0, 0.2, 0.4, -0.2, 0, 0.2], words: ["Regional League", "Autonomy Party", "Our Land", "Federalists"] },
  agrarian: { name: "Agrarians", color: "#588157", v: [0.5, 0.2, 0, 0.5, 0.3, 0.3], words: ["Farmers' Party", "Rural Union", "Countryside Alliance", "Peasant Party"] },
  islamist: { name: "Religious conservatives", color: "#2d6a4f", v: [1, 0.3, -0.6, 0.6, 0.6, 0.4], words: ["Justice and Development", "Faith and Unity", "Renaissance", "Virtue Party"] },
  ruling: { name: "Ruling party", color: "#7f1d1d", v: [0.3, 0.3, -0.9, 0.7, 1, 0.5], words: ["United Party", "National Front for Unity", "People's Congress", "Party of Order"] },
};

/* ------------------------------------------------------------------ ministries */

export const PORTFOLIOS = [
  { id: "finance", name: "Finance", icon: "💰" },
  { id: "economy", name: "Economy & industry", icon: "🏭" },
  { id: "energy", name: "Energy", icon: "⚡" },
  { id: "labour", name: "Labour", icon: "✊" },
  { id: "health", name: "Health", icon: "🏥" },
  { id: "education", name: "Education & research", icon: "🎓" },
  { id: "interior", name: "Interior", icon: "🚓" },
  { id: "justice", name: "Justice", icon: "⚖️" },
  { id: "housing", name: "Housing", icon: "🏘️" },
  { id: "foreign", name: "Foreign affairs", icon: "🌐" },
  { id: "defence", name: "Defence", icon: "🎖️" },
  { id: "environment", name: "Environment", icon: "🌍" },
] as const;
export type PortfolioId = (typeof PORTFOLIOS)[number]["id"];

/* ------------------------------------------------------------------ promises */

export const PROMISES = [
  { id: "unemployment", name: "Unemployment below 5%", icon: "👷" },
  { id: "inflation", name: "Inflation below 3%", icon: "🏷️" },
  { id: "deficit", name: "A balanced budget", icon: "⚖️" },
  { id: "growth", name: "Growth above 2.5%", icon: "📈" },
  { id: "health", name: "Hospitals fully staffed", icon: "🏥" },
  { id: "homes", name: "Rents down 5%", icon: "🏘️" },
  { id: "tax", name: "No new taxes", icon: "✋" },
  { id: "power", name: "No more blackouts", icon: "💡" },
  { id: "emissions", name: "Emissions down 10%", icon: "🌍" },
  { id: "peace", name: "Keep us out of war", icon: "🕊️" },
  { id: "crime", name: "Crime down 10%", icon: "🚓" },
  { id: "migration", name: "Net migration halved", icon: "🛂" },
] as const;
export type PromiseId = (typeof PROMISES)[number]["id"];
