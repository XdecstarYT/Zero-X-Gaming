/**
 * A new world: every country on the map with its economy (sectors sized from GDP, resources and
 * what it's known for), its people (age bands, eighteen groups), public services, power plants,
 * taxes and spending, laws and constitution, parties and parliament, armed forces and research;
 * then the relations, alliances, sanctions and wars it starts with, and a calibration pass so the
 * world market balances on day one.
 */
import { CLAIMS, FACTS, SEPARATISTS, defaultFacts, defaultParties, parseParties, type Facts, type Form } from "./countries";
import {
  BRICS, CONST, CONSTITUTION, CSTO, EQUIP_IDS, EU, EUROZONE, FAMILIES, GCC, GOODS, GROUPS, LAWS, MERCOSUR, NATO, NON_NPT, OPEC, OPEC_PLUS, ASEAN, PLANT_TYPES, PORTFOLIOS, SECTORS, SECTOR_GOODS,
  PLANTS, SERVICES, SERVICE_IDS, TECHS, TECH_FIELDS, UNSC_ELECTED, USMCA, type EquipId, type Family, type OrgId, type PlantType, type ServiceId, type TechField,
} from "./data";
import { FLAGS, madeUpFlag } from "./flags";
import { cultureOf, personName } from "./names";
import type { Atlas } from "./atlas";
import { cellXY, toLonLat } from "./atlas";
import { START_IDEOLOGY } from "../sovereign/data";
import { PRODUCERS } from "../sovereign/data";
import { calibrate, labourDay, newDerived, refreshCaches, resetFlows, type D } from "./econ";
import { occupiedShares } from "./war";
import type { Actor, Chamber, Election, GroupState, Military, Nation, Party, Person, Politics, SectorState, ServiceState, TaxPolicy, Theatre, War, World } from "./state";
import { clamp, dayFor, lerp, mulberry } from "./util";

/* ------------------------------------------------------------------ profiles */

const RICH_VA = [0.006, 0.004, 0.002, 0.002, 0.008, 0.004, 0.002, 0.022, 0.004, 0.006, 0.006, 0.016, 0.012, 0.008, 0.006, 0.02, 0.018, 0.01, 0.018, 0.006, 0.005, 0.02, 0.06, 0.11, 0.05, 0.055, 0.085, 0.14, 0.03, 0.265];
const POOR_VA = [0.13, 0.06, 0.015, 0.006, 0.01, 0.012, 0.008, 0.05, 0.03, 0.01, 0.008, 0.008, 0.003, 0.008, 0.012, 0.004, 0.004, 0.003, 0.004, 0.001, 0.002, 0.018, 0.06, 0.15, 0.05, 0.025, 0.035, 0.09, 0.03, 0.17];
/** Workers per $ of value added, relative. */
const INTENSITY = [4, 3.5, 2.5, 1.5, 0.3, 0.8, 1.5, 1.2, 2.5, 1.5, 0.3, 0.5, 0.5, 0.7, 1, 0.9, 0.8, 0.9, 0.8, 0.7, 0.8, 0.4, 1.8, 1.8, 1.2, 0.5, 0.5, 0.3, 2, 1.3];

/** What some countries are known for: sector → multiplier on its share. */
const SPECIAL: Record<string, Partial<Record<string, number>>> = {
  CHN: { steel: 3, electronics: 3, machinery: 2.5, textiles: 2.5, vehicles: 1.8, chemicals: 2, materials: 3, electrical: 3, construction: 1.4 },
  USA: { aerospace: 2.5, defence: 3, pharma: 1.6, telecom: 1.4, finance: 1.3, oilgas: 1 },
  DEU: { vehicles: 3, machinery: 3, chemicals: 2, electrical: 1.8, pharma: 1.3 },
  JPN: { vehicles: 2.8, machinery: 2.2, electronics: 1.8, steel: 1.6, electrical: 1.6 },
  KOR: { electronics: 4, vehicles: 2.5, steel: 2, aerospace: 2, chemicals: 1.6, refining: 2 },
  TWN: { electronics: 8, machinery: 1.5, chemicals: 1.4 },
  VNM: { electronics: 4, textiles: 4, food: 1.4 },
  MYS: { electronics: 4, refining: 2, chemicals: 1.5 },
  THA: { vehicles: 2.5, electronics: 2, food: 1.6, tourism: 2.2 },
  IND: { pharma: 2.5, textiles: 2, services: 1.3, telecom: 1.6, steel: 1.4 },
  BGD: { textiles: 8 },
  KHM: { textiles: 6, tourism: 2 },
  PAK: { textiles: 4 },
  TUR: { textiles: 2.5, vehicles: 1.6, steel: 1.6, tourism: 1.8, construction: 1.3 },
  MEX: { vehicles: 3.5, electronics: 2, electrical: 2 },
  CHE: { pharma: 6, finance: 2.4, machinery: 1.6 },
  IRL: { pharma: 6, telecom: 3, finance: 2 },
  BEL: { pharma: 3, chemicals: 2.5 },
  DNK: { pharma: 3, power: 1.4, transport: 1.8 },
  NLD: { chemicals: 2.5, refining: 2, transport: 1.6, finance: 1.3, crops: 1.5 },
  GBR: { finance: 2, aerospace: 2, pharma: 1.6, defence: 1.6, services: 1.2 },
  FRA: { aerospace: 3, defence: 1.8, pharma: 1.4, tourism: 1.5, food: 1.3 },
  ITA: { machinery: 2, textiles: 2, food: 1.5, tourism: 1.7, vehicles: 1.3 },
  ESP: { tourism: 2.8, vehicles: 1.5, food: 1.4 },
  GRC: { tourism: 3.5, transport: 2.5 },
  HRV: { tourism: 4 },
  PRT: { tourism: 2.5, textiles: 1.5 },
  MDV: { tourism: 8 },
  EGY: { tourism: 1.8, transport: 1.5 },
  ARE: { tourism: 2, transport: 2.5, finance: 1.8, refining: 1.5 },
  SGP: { finance: 3, transport: 3, electronics: 3, refining: 3, chemicals: 2 },
  LUX: { finance: 5 },
  ISR: { telecom: 3, defence: 3, electronics: 2 },
  SWE: { machinery: 2, vehicles: 1.8, wood: 3, telecom: 1.8, defence: 1.6 },
  FIN: { wood: 4, electronics: 2, machinery: 1.8 },
  CAN: { crops: 2, wood: 2, metals_mining: 1, vehicles: 1.4 },
  AUS: { crops: 2, livestock: 2, finance: 1.3 },
  NZL: { livestock: 6, tourism: 1.8 },
  BRA: { crops: 3, livestock: 3, food: 1.5, aerospace: 1.2 },
  ARG: { crops: 3.5, livestock: 2.5, food: 1.6 },
  URY: { livestock: 3, crops: 2 },
  UKR: { crops: 4, steel: 2, defence: 3 },
  RUS: { defence: 4, steel: 1.6, chemicals: 1.4 },
  POL: { machinery: 1.4, vehicles: 1.6, food: 1.5, furniture: 1 },
  CZE: { vehicles: 3, machinery: 2 },
  SVK: { vehicles: 5 },
  HUN: { vehicles: 3, electronics: 2 },
  ROU: { vehicles: 2 },
  IDN: { crops: 1.6, textiles: 2, food: 1.4 },
  PHL: { electronics: 3, services: 1.8 },
  CIV: { crops: 2 },
  GHA: { crops: 1.6 },
  ETH: { crops: 1.4 },
  KEN: { crops: 1.6, tourism: 1.4 },
  MAR: { textiles: 2, tourism: 1.8, vehicles: 1.6 },
  PRK: { defence: 6 },
};

/** Coal mined, million tonnes a year. */
const COAL: Record<string, number> = { CHN: 4700, IND: 1050, IDN: 800, USA: 500, AUS: 450, RUS: 430, ZAF: 230, KAZ: 115, POL: 100, COL: 60, DEU: 100, TUR: 90, MNG: 80, VNM: 50, CAN: 45, UKR: 25, CZE: 30, SRB: 35, MOZ: 15, BGR: 25, BIH: 15, PAK: 15, LAO: 20, PHL: 15, MEX: 8, BWA: 2, ZWE: 5, GRC: 10, THA: 15 };
/** Oil, million barrels a day. */
const OIL: Record<string, number> = { USA: 13.2, SAU: 9.5, RUS: 9.4, CAN: 5, IRQ: 4.3, CHN: 4.2, IRN: 3.3, ARE: 3.4, BRA: 3.4, KWT: 2.5, MEX: 1.6, KAZ: 1.9, NOR: 1.8, QAT: 1.3, NGA: 1.4, DZA: 1, LBY: 1.2, AGO: 1.1, OMN: 1, GBR: 0.7, COL: 0.8, AZE: 0.6, VEN: 0.9, ECU: 0.45, EGY: 0.55, IDN: 0.6, MYS: 0.55, ARG: 0.75, IND: 0.6, GUY: 0.6, TKM: 0.2, SDN: 0.06, SSD: 0.15, COG: 0.27, GNQ: 0.08, GAB: 0.2, TTO: 0.06, BRN: 0.1, YEM: 0.06, SYR: 0.08, THA: 0.2, AUS: 0.35, VNM: 0.2, TCD: 0.12, CMR: 0.06, BHR: 0.2, PER: 0.04, TUN: 0.03, ROU: 0.07, UZB: 0.05 };
/** Gas, billion cubic metres a year. */
const GAS: Record<string, number> = { USA: 1000, RUS: 600, IRN: 250, CHN: 240, CAN: 190, QAT: 180, AUS: 155, NOR: 120, SAU: 115, DZA: 100, TKM: 80, MYS: 70, EGY: 60, IDN: 60, ARE: 55, UZB: 47, NGA: 45, AZE: 37, ARG: 45, OMN: 40, MEX: 25, KAZ: 26, ISR: 25, GBR: 30, NLD: 15, TTO: 25, MOZ: 8, PAK: 30, BGD: 22, THA: 25, IND: 35, IRQ: 10, KWT: 15, BHR: 18, BRN: 11, LBY: 10, PER: 13, BOL: 13, VEN: 25, ROU: 9, UKR: 18, ITA: 3 };

/** Goods mix multipliers by country. */
const GMIX: Record<string, Record<string, number>> = {};
function gm(isos: string[], good: string, k: number) {
  for (const iso of isos) (GMIX[iso] ??= {})[good] = k;
}
gm(["RUS", "CAN", "AUS", "UKR", "ARG", "USA", "FRA", "DEU", "KAZ", "POL", "ROU", "TUR", "GBR"], "wheat", 3);
gm(["CHN", "IND", "IDN", "BGD", "VNM", "THA", "MMR", "PHL", "JPN", "PAK", "KHM", "LAO", "NPL", "LKA", "KOR"], "rice", 3);
gm(["BRA", "USA", "ARG", "PRY", "URY", "CAN"], "soybeans", 4);
gm(["USA", "CHN", "BRA", "ARG", "UKR", "MEX", "ZAF", "IND"], "maize", 2.5);
gm(["BRA", "VNM", "COL", "ETH", "CIV", "GHA", "IDN", "HND", "UGA", "PER", "CMR", "NGA", "ECU"], "coffee_cocoa", 6);
gm(["IND", "CHN", "USA", "BRA", "PAK", "UZB", "TUR", "BFA", "MLI", "BEN", "TKM"], "cotton", 4);
gm(["NOR", "CHL", "VNM", "IDN", "PER", "ISL", "MRT", "FRO", "THA", "JPN"], "fish", 3);
gm(["QAT", "AUS", "USA", "RUS", "MYS", "NGA", "DZA", "IDN", "PNG", "OMN", "TTO", "MOZ"], "lng", 4);
gm(["AUS", "CHL", "CHN", "ARG", "ZWE", "BOL"], "lithium", 6);
gm(["CHN", "USA", "MMR", "AUS", "VNM"], "rare_earths", 5);
gm(["IDN", "PHL", "COD", "RUS", "AUS", "CAN", "NCL"], "nickel_ore", 5);
gm(["RUS", "FRA", "USA", "CHN", "GBR", "NLD", "DEU", "KAZ"], "nuclear_fuel", 6);
gm(["TWN", "KOR", "JPN", "USA", "CHN", "NLD", "SGP", "MYS", "ISR", "DEU"], "semiconductors", 3);
gm(["CHN", "VNM", "KOR", "IND"], "phones", 2);
gm(["CHN", "KOR", "JPN", "USA", "POL", "HUN", "DEU"], "batteries", 2.5);
gm(["CHN", "VNM", "MYS", "IND", "USA", "KOR"], "solar_panels", 3);
gm(["CHN", "USA", "NOR", "DEU", "KOR"], "ev", 2.5);
gm(["USA", "FRA", "GBR", "DEU", "BRA", "CAN", "CHN", "ESP"], "aircraft", 3);
gm(["CHN", "KOR", "JPN", "ITA", "FIN", "DEU", "FRA"], "ships", 3);
gm(["CUB", "DOM", "ITA", "CHN"], "tobacco", 1.5);
gm(["USA", "RUS", "CHN", "FRA", "DEU", "GBR", "ISR", "KOR", "TUR", "UKR", "ITA", "SWE", "IND", "IRN", "PRK"], "missiles", 2);
gm(["USA", "CHN", "TUR", "ISR", "IRN", "UKR", "RUS"], "drones", 3);
gm(["CAN", "BRA", "SWE", "FIN", "RUS", "USA", "IDN", "CHL", "NZL"], "pulp", 2);
gm(["MAR", "CHN", "USA", "RUS", "JOR", "SAU", "CAN", "BLR"], "potash", 3);

const ISO_RES: Record<string, Record<string, number>> = {};
for (const [res, list] of Object.entries(PRODUCERS)) {
  for (const [iso, wgt] of list) (ISO_RES[iso] ??= {})[res] = wgt;
}
const RES_GOOD: Record<string, string> = { iron: "iron_ore", copper: "copper_ore", aluminium: "bauxite", gold: "gold", uranium: "uranium_ore", diamond: "gold", titanium: "nickel_ore", chromium: "nickel_ore", tungsten: "rare_earths" };
for (const [iso, res] of Object.entries(ISO_RES)) for (const [r, wgt] of Object.entries(res)) if (RES_GOOD[r]) gm([iso], RES_GOOD[r], 1 + wgt * 0.6);

/** World production value per year, $bn, of metal mining, split by producers. */
const WORLD_OUT = { metals_mining: 1300 };

/** Army size, thousands (where the formula would be far off). */
const PERSONNEL: Record<string, number> = {
  CHN: 2035, IND: 1455, USA: 1328, RUS: 1500, UKR: 900, PRK: 1280, PAK: 654, KOR: 500, IRN: 610, VNM: 450, EGY: 440, TUR: 355, MMR: 300, IDN: 400, THA: 360, BRA: 366, COL: 293, ERI: 200, ETH: 162,
  SAU: 257, ISR: 170, FRA: 203, GBR: 144, DEU: 182, JPN: 247, ITA: 165, POL: 216, TWN: 169, MEX: 277, DZA: 139, MAR: 196, IRQ: 193, SYR: 100, AUS: 59, CAN: 68, ESP: 122, GRC: 132, SDN: 120, BLR: 48,
};
/** Arsenals that the formula would get badly wrong. */
const ARSENAL: Record<string, Partial<Record<EquipId, number>>> = {
  USA: { tank: 4600, ifv: 6000, artillery: 1200, mlrs: 600, sam: 60, fighter: 1800, bomber: 140, drone: 15000, helicopter: 900, airlift: 600, frigate: 92, submarine: 66, carrier: 11, cruise: 4000, ballistic: 400 },
  CHN: { tank: 5000, ifv: 7000, artillery: 4000, mlrs: 1800, sam: 150, fighter: 1600, bomber: 220, drone: 20000, helicopter: 900, airlift: 300, frigate: 140, submarine: 60, carrier: 3, cruise: 3000, ballistic: 2000 },
  RUS: { tank: 3000, ifv: 6000, artillery: 4500, mlrs: 1200, sam: 120, fighter: 900, bomber: 120, drone: 60000, helicopter: 700, airlift: 200, frigate: 45, submarine: 58, carrier: 1, cruise: 1500, ballistic: 1200 },
  UKR: { tank: 1100, ifv: 3000, artillery: 2000, mlrs: 400, sam: 40, fighter: 80, drone: 200000, helicopter: 60, airlift: 20, frigate: 1, cruise: 300, ballistic: 50 },
  IND: { tank: 4600, ifv: 2500, artillery: 3000, mlrs: 300, sam: 60, fighter: 600, bomber: 0, drone: 3000, helicopter: 300, airlift: 250, frigate: 30, submarine: 18, carrier: 2, cruise: 600, ballistic: 300 },
  GBR: { tank: 220, ifv: 600, artillery: 150, mlrs: 40, sam: 10, fighter: 140, drone: 500, helicopter: 60, airlift: 50, frigate: 15, submarine: 10, carrier: 2, cruise: 300, ballistic: 48 },
  FRA: { tank: 220, ifv: 650, artillery: 200, mlrs: 15, sam: 14, fighter: 230, drone: 600, helicopter: 80, airlift: 60, frigate: 20, submarine: 9, carrier: 1, cruise: 400, ballistic: 64 },
  DEU: { tank: 300, ifv: 700, artillery: 120, mlrs: 40, sam: 12, fighter: 140, drone: 300, helicopter: 60, airlift: 50, frigate: 11, submarine: 6, cruise: 200 },
  JPN: { tank: 500, ifv: 1000, artillery: 400, mlrs: 50, sam: 30, fighter: 330, drone: 300, helicopter: 120, airlift: 60, frigate: 50, submarine: 22, carrier: 2, cruise: 200 },
  KOR: { tank: 2200, ifv: 3000, artillery: 5600, mlrs: 220, sam: 30, fighter: 400, drone: 1000, helicopter: 150, airlift: 40, frigate: 25, submarine: 19, cruise: 600, ballistic: 300 },
  PRK: { tank: 4000, ifv: 2500, artillery: 8000, mlrs: 5000, sam: 40, fighter: 400, bomber: 80, drone: 500, helicopter: 200, airlift: 200, frigate: 5, submarine: 70, cruise: 200, ballistic: 1000 },
  ISR: { tank: 1300, ifv: 1500, artillery: 600, mlrs: 100, sam: 30, fighter: 340, drone: 3000, helicopter: 100, airlift: 30, frigate: 7, submarine: 5, cruise: 500, ballistic: 100 },
  TUR: { tank: 2200, ifv: 3000, artillery: 1200, mlrs: 200, sam: 20, fighter: 280, drone: 5000, helicopter: 100, airlift: 50, frigate: 16, submarine: 12, carrier: 1, cruise: 300, ballistic: 100 },
  IRN: { tank: 1500, ifv: 1200, artillery: 2000, mlrs: 1500, sam: 40, fighter: 180, bomber: 10, drone: 30000, helicopter: 50, airlift: 50, frigate: 8, submarine: 19, cruise: 1000, ballistic: 3000 },
  PAK: { tank: 2500, ifv: 2000, artillery: 1500, mlrs: 200, sam: 20, fighter: 380, drone: 1000, helicopter: 50, airlift: 30, frigate: 9, submarine: 8, cruise: 300, ballistic: 300 },
  TWN: { tank: 1000, ifv: 1500, artillery: 1200, mlrs: 200, sam: 40, fighter: 280, drone: 1000, helicopter: 100, airlift: 30, frigate: 26, submarine: 2, cruise: 400, ballistic: 100 },
  EGY: { tank: 2700, ifv: 4000, artillery: 2000, mlrs: 600, sam: 30, fighter: 250, drone: 200, helicopter: 90, airlift: 50, frigate: 12, submarine: 8, carrier: 2, cruise: 100 },
  SAU: { tank: 1000, ifv: 3000, artillery: 600, mlrs: 100, sam: 30, fighter: 280, drone: 300, helicopter: 100, airlift: 50, frigate: 10, cruise: 200, ballistic: 100 },
};
const NUKES: Record<string, number> = { USA: 3700, RUS: 4300, CHN: 600, FRA: 290, GBR: 225, IND: 180, PAK: 170, ISR: 90, PRK: 50 };
/** FX reserves and sovereign funds, $bn. */
const RESERVES: Record<string, [number, number]> = {
  CHN: [3300, 1350], JPN: [1250, 0], CHE: [900, 0], IND: [680, 0], RUS: [620, 130], TWN: [590, 0], SAU: [450, 950], KOR: [410, 0], HKG: [420, 0], SGP: [370, 1000], BRA: [340, 0], DEU: [300, 0], USA: [240, 0],
  MEX: [235, 0], THA: [240, 0], GBR: [190, 0], FRA: [250, 0], IDN: [150, 0], ITA: [230, 0], ISR: [215, 0], POL: [230, 0], CZE: [150, 0], TUR: [150, 0], ARE: [230, 1700], KWT: [50, 950], QAT: [55, 520], NOR: [80, 1900], AUS: [60, 200], CAN: [120, 0],
  MYS: [120, 0], VNM: [80, 0], PHL: [105, 0], DZA: [70, 0], KAZ: [45, 70], IRN: [100, 0], LBY: [80, 70], IRQ: [100, 0], NGA: [40, 0], EGY: [45, 0], ARG: [35, 0], UKR: [45, 0], AZE: [15, 60], OMN: [18, 50], BHR: [5, 20], BWA: [5, 4], CHL: [45, 15], PER: [80, 0], COL: [60, 0], ZAF: [65, 0],
};

/* ------------------------------------------------------------------ helpers */

const ORDER: Record<Form, number> = { presidential: 0, semi: 1, parliamentary: 2, const_monarchy: 3, abs_monarchy: 4, one_party: 5, theocracy: 6, junta: 7 };
void ORDER;

function constitutionFor(iso: string, f: Facts, upper: boolean): Record<string, string> {
  const c: Record<string, string> = {};
  for (const def of CONSTITUTION) c[def.id] = def.options[0].id;
  const free = f.free;
  const form = f.form;
  c.form = form;
  const monarchy = form === "const_monarchy" || form === "abs_monarchy";
  c.hos_select = form === "presidential" || form === "semi" ? "direct" : form === "parliamentary" ? (iso === "CHE" ? "council" : "parliament") : monarchy ? "hereditary" : form === "one_party" ? "party" : "council";
  c.hog = form === "presidential" || form === "junta" ? "same" : form === "semi" || form === "abs_monarchy" || form === "one_party" || form === "theocracy" ? "pm_hos" : "pm_parl";
  c.hos_term = monarchy || form === "theocracy" ? "life" : ({ USA: "4", BRA: "4", ARG: "4", COL: "4", CHL: "4", RUS: "6", MEX: "6", FRA: "5", KOR: "5", IDN: "5", TUR: "5", IRN: "4", PHL: "6", KAZ: "7" } as Record<string, string>)[iso] ?? "5";
  c.term_limit = monarchy || form === "one_party" || form === "theocracy" || form === "junta" ? "none" : ({ USA: "two", MEX: "one", KOR: "one", PHL: "one", CHL: "two_consec", FRA: "two_consec", RUS: "two_consec", BRA: "two_consec", ARG: "two_consec", COL: "one" } as Record<string, string>)[iso] ?? "two";
  c.vp = ["USA", "BRA", "IDN", "ARG", "PHL", "NGA", "KEN", "COL", "PER", "ECU"].includes(iso) ? "running_mate" : form === "presidential" ? "appointed" : "none";
  c.lower_system = f.system;
  c.threshold = f.system === "fptp" || f.system === "two_round" || f.system === "appointed" ? "0" : ({ DEU: "5", POL: "5", TUR: "5", CZE: "5", NZL: "5", ISR: "3", ESP: "3", NLD: "0", ITA: "3", UKR: "5", RUS: "5" } as Record<string, string>)[iso] ?? "3";
  c.lower_term = ({ USA: "2", AUS: "3", NZL: "3", MEX: "3", PHL: "3" } as Record<string, string>)[iso] ?? (free > 0.5 ? "4" : "5");
  if (["GBR", "FRA", "ITA", "IND", "IRL", "CAN", "RUS", "ZAF", "CHN", "PAK", "SGP", "MYS", "EGY", "ISR", "GRC", "NGA", "VNM"].includes(iso)) c.lower_term = "5";
  const size = f.lower[1];
  c.lower_size = size < 220 ? "small" : size < 480 ? "medium" : "large";
  c.upper = !upper || !f.upper ? "none" : f.upper[2] === "all" ? "elected" : f.upper[2];
  c.upper_powers = ["USA", "ITA", "AUS", "CHE", "MEX", "BRA", "ARG", "CHL", "COL", "PHL", "NGA", "ROU"].includes(iso) ? "equal" : "delay";
  c.veto = form === "presidential" ? "qualified" : form === "semi" ? "suspensive" : form === "abs_monarchy" || form === "one_party" || form === "junta" || form === "theocracy" ? "absolute" : "none";
  c.review = free < 0.3 ? "none" : ({ USA: "supreme", FRA: "council", GBR: "none", NLD: "none", JPN: "supreme", IND: "supreme", CAN: "supreme", AUS: "supreme", BRA: "supreme", MEX: "supreme" } as Record<string, string>)[iso] ?? "court";
  c.judges = free < 0.3 ? "executive" : ({ USA: "executive", DEU: "supermajority", ITA: "supermajority", ESP: "supermajority" } as Record<string, string>)[iso] ?? "council";
  c.emergency = form === "junta" ? "indefinite" : free < 0.3 ? "broad" : "limited";
  c.dissolution = form === "presidential" ? "none" : form === "semi" ? "president" : ({ DEU: "after_nc", ITA: "president", ISR: "pm", NOR: "none" } as Record<string, string>)[iso] ?? (monarchy || form === "parliamentary" ? "pm" : "none");
  c.no_confidence = form === "presidential" || free < 0.3 ? "none" : ["DEU", "ESP", "BEL", "POL", "HUN", "SVN", "ISR"].includes(iso) ? "constructive" : "simple";
  c.succession = monarchy ? "heir" : c.vp === "running_mate" ? "vp" : form === "semi" ? "speaker" : form === "one_party" || form === "theocracy" || form === "junta" ? "council" : form === "presidential" ? "vp" : "interim";
  c.royal_rule = ({ SAU: "elective", KWT: "elective", ARE: "elective", ESP: "agnatic", JPN: "agnatic", THA: "agnatic", MAR: "agnatic", JOR: "agnatic", QAT: "agnatic", OMN: "elective", BRN: "agnatic", SWZ: "elective" } as Record<string, string>)[iso] ?? "absolute";
  c.regency = "council";
  c.decrees = form === "abs_monarchy" || form === "junta" || form === "one_party" || form === "theocracy" ? "rule" : form === "presidential" ? "orders" : form === "semi" ? "delegated" : "none";
  c.referendums = free < 0.3 ? "none" : ["CHE", "ITA", "IRL", "URY", "TWN"].includes(iso) ? "binding" : "advisory";
  c.amend = ["USA", "IRL", "AUS", "JPN", "CHE", "DNK", "KOR"].includes(iso) ? "referendum" : free < 0.3 ? "simple" : "two_thirds";
  c.federal = ["USA", "DEU", "BRA", "IND", "AUS", "CAN", "MEX", "ARG", "RUS", "NGA", "CHE", "AUT", "BEL", "MYS", "ETH", "PAK", "ARE", "BIH", "IRQ", "SOM", "SSD", "VEN", "NPL"].includes(iso) ? "federal" : ["ESP", "GBR", "ITA", "FRA", "IDN", "ZAF", "KEN", "PHL", "UKR", "CHN"].includes(iso) ? "devolved" : "unitary";
  c.voting_age = ["AUT", "ARG", "BRA", "ECU", "MLT", "NIC", "CUB"].includes(iso) ? "16" : ["SGP", "KWT", "OMN", "LBN"].includes(iso) ? "21" : "18";
  c.compulsory = ["AUS", "BEL", "BRA", "ARG", "LUX", "URY", "PER", "ECU", "BOL", "SGP", "TUR", "PRY"].includes(iso) ? "yes" : "no";
  c.party_bans = form === "one_party" ? "single" : ["DEU", "TUR", "KOR", "ESP", "UKR"].includes(iso) || free < 0.3 ? "extremist" : "none";
  c.central_bank = ["CHN", "VEN", "IRN", "PRK", "CUB", "TUR", "ARG", "LAO", "SYR", "MMR", "ERI", "TKM", "SDN", "ETH"].includes(iso) ? "government" : "independent";
  c.military = form === "junta" ? "supreme" : ["THA", "EGY", "PAK", "DZA"].includes(iso) ? "autonomous" : "civilian";
  c.rights = free >= 0.7 ? "full" : free >= 0.3 ? "limited" : "none";
  c.finance = iso === "USA" ? "unlimited" : ["DEU", "SWE", "NOR", "AUT", "ESP", "FRA", "CAN", "AUS"].includes(iso) ? "public" : "capped";
  c.recall = ["TWN", "VEN", "ECU", "BOL", "PER"].includes(iso) ? "yes" : "no";
  c.timing = form === "presidential" || ["NOR", "SWE", "USA", "DEU"].includes(iso) ? "fixed" : "flexible";
  return c;
}

function lawsFor(iso: string, n: { continent: string; sub: string }, f: Facts, rich: boolean, form: Form): Record<string, string> {
  const L: Record<string, string> = {};
  const has = (list: string[]) => list.includes(iso);
  const eu = EU.includes(iso);
  const auth = f.free < 0.3;
  const muslim = ["SAU", "IRN", "AFG", "PAK", "IRQ", "YEM", "SDN", "LBY", "EGY", "DZA", "MAR", "TUN", "JOR", "SYR", "KWT", "QAT", "ARE", "OMN", "BHR", "MRT", "SOM", "SOL", "NER", "MLI", "TCD", "SEN", "GIN", "IDN", "MYS", "BGD", "MDV", "BRN", "TUR", "AZE", "UZB", "TJK", "TKM", "KGZ", "KAZ", "ALB", "KOS", "ESH", "DJI", "COM", "GMB", "BFA"].includes(iso);
  const nordic = has(["SWE", "NOR", "DNK", "FIN", "ISL"]);
  const latam = n.continent === "South America" || n.sub === "Central America" || n.sub === "Caribbean" || iso === "MEX";
  L.min_wage = rich ? (has(["USA"]) ? "low" : nordic || has(["CHE", "ITA", "AUT"]) ? "none" : "mid") : f.free > 0.5 ? "low" : has(["SAU", "QAT", "ARE", "KWT", "BHR", "OMN"]) ? "none" : "low";
  L.hours = has(["FRA"]) ? "35" : rich || eu ? "40" : has(["KOR", "JPN", "USA", "CAN", "AUS", "NZL", "CHN", "RUS"]) ? (iso === "KOR" ? "44" : "40") : "48";
  L.leave = eu || nordic || has(["GBR", "CHE", "NOR", "AUS", "NZL", "RUS", "BRA"]) ? (has(["FRA", "SWE", "DNK", "AUT", "FIN"]) ? "6" : "4") : iso === "USA" ? "0" : "2";
  L.retirement = has(["DEU", "ITA", "USA", "AUS", "DNK", "ISL", "NOR", "ESP", "NLD", "GRC", "BEL", "IRL", "GBR", "ISR"]) ? "67" : has(["FRA", "CHN", "KOR", "IND", "SAU", "IDN", "VNM"]) ? "62" : rich ? "65" : f.free < 0.3 || n.continent === "Africa" ? "60" : "65";
  L.unions = has(["CHN", "PRK", "SAU", "ARE", "QAT", "KWT", "OMN", "BHR", "CUB", "VNM", "LAO", "TKM", "ERI"]) ? "banned" : auth ? "restricted" : nordic || has(["AUT", "BEL", "DEU", "NLD", "ITA"]) ? "sectoral" : "protected";
  L.strikes = L.unions === "banned" ? "banned" : auth ? "banned" : has(["GBR", "USA", "ITA", "ESP", "FRA", "PRT", "GRC"]) ? "minimum" : "free";
  L.abortion = has(["GBR", "NLD", "CAN", "AUS", "NZL", "CHN", "IND", "JPN", "COL", "SWE", "ISL"]) ? "24" : has(["MLT", "AND", "SLV", "NIC", "DOM", "HND", "HTI", "MDG", "SEN", "PHL", "LAO", "PSE", "SUR", "EGY", "IRQ", "MRT"]) ? "banned" : eu || has(["RUS", "UKR", "NOR", "CHE", "USA", "ARG", "MEX", "URY", "CUB", "ZAF", "TUN", "TUR", "KAZ", "VNM", "KOR", "TWN", "THA", "BLR", "GEO", "SRB"]) ? "12" : "life";
  if (iso === "POL") L.abortion = "life";
  L.death_penalty = has(["IRN", "SAU", "PRK", "SGP", "VNM", "CHN", "EGY", "IRQ", "PAK", "SYR", "YEM", "SOM", "AFG", "KWT", "BGD"]) ? "broad" : has(["USA", "JPN", "IND", "TWN", "KOR", "BLR", "THA", "MYS", "IDN", "ARE", "QAT", "JOR", "LBN", "LBY", "SDN", "SSD", "NGA", "UGA", "ETH", "TZA", "ZWE", "BWA", "CUB", "GUY", "JAM", "TTO", "BHR", "OMN", "PSE", "MAR", "DZA", "TUN", "KEN", "ZMB", "MWI", "CMR", "GHA", "MLI", "NER", "LAO", "MMR", "BTN", "LKA", "BRN"]) ? "murder" : has(["ISR", "BRA", "CHL", "PER", "SLV", "KAZ"]) ? "war" : "abolished";
  L.cannabis = has(["CAN", "URY", "MLT", "THA"]) ? "regulated" : has(["DEU", "NLD", "PRT", "ESP", "CZE", "LUX", "COL", "MEX", "ZAF", "CHE", "JAM", "BEL"]) ? "decrim" : has(["USA", "AUS", "ISR", "ITA", "GBR", "ARG", "CHL", "PER", "ECU", "BRA", "DNK", "NOR", "FIN", "IRL", "GRC", "POL", "MKD", "NZL", "LSO", "ZWE", "KOR"]) ? "medical" : "prohibition";
  L.religion = has(["IRN", "SAU", "AFG", "PAK", "MDV", "YEM", "MRT", "BRN", "QAT", "KWT", "OMN", "BHR", "ARE", "LBY", "SOM"]) ? "state" : has(["GBR", "DNK", "NOR", "ISL", "GRC", "ARG", "CRI", "MLT", "MCO", "MAR", "JOR", "EGY", "MYS", "BGD", "DZA", "TUN", "IRQ", "ISR", "THA", "KHM", "LKA", "BTN", "ARM", "GEO"]) ? "established" : has(["FRA", "TUR", "CHN", "PRK", "VNM", "CUB", "LAO", "MEX", "AZE", "KAZ", "TJK", "UZB", "TKM"]) ? "laicite" : "secular";
  L.same_sex = has(["NLD", "BEL", "ESP", "CAN", "ZAF", "NOR", "SWE", "PRT", "ISL", "ARG", "DNK", "BRA", "FRA", "URY", "NZL", "GBR", "LUX", "USA", "IRL", "COL", "FIN", "MLT", "DEU", "AUS", "AUT", "TWN", "ECU", "CRI", "CHL", "CHE", "SVN", "CUB", "MEX", "AND", "EST", "GRC", "THA", "LIE"]) ? "marriage" : has(["ITA", "HRV", "CZE", "HUN", "CYP", "BOL", "LVA", "MNE", "SVK", "POL", "LTU", "JPN"]) ? (has(["POL", "SVK", "LTU", "JPN"]) ? "none" : "unions") : muslim || has(["NGA", "UGA", "KEN", "TZA", "ETH", "GHA", "CMR", "ZMB", "MWI", "SSD", "ERI", "LBR", "SLE", "TGO", "BDI", "ZWE", "NAM", "JAM", "GUY", "PNG", "SLB", "LKA", "MMR", "AFG"]) ? "banned" : "none";
  L.immigration = has(["CAN", "AUS", "NZL", "GBR", "SGP", "CHE"]) ? "points" : has(["JPN", "KOR", "HUN", "POL", "CHN", "PRK", "ISR"]) ? "strict" : has(["SAU", "ARE", "QAT", "KWT", "BHR", "OMN"]) ? "quota" : rich || eu ? "quota" : "quota";
  L.asylum = eu || has(["CAN", "NOR", "CHE", "GBR", "ISL", "NZL", "BRA", "ARG", "MEX", "TUR", "UGA", "KEN", "ETH"]) ? "standard" : has(["AUS", "USA", "JPN", "KOR", "HUN", "ISR"]) ? "restrictive" : auth ? "restrictive" : "standard";
  if (iso === "DEU" || iso === "SWE") L.asylum = "standard";
  L.citizenship = latam || has(["USA", "CAN"]) ? "soil" : has(["GBR", "FRA", "NLD", "BEL", "PRT", "SWE", "IRL", "AUS", "NZL", "DEU", "FIN"]) ? "5" : n.continent === "Asia" || has(["CHE", "AUT", "ITA", "ESP"]) ? "blood" : "10";
  L.guns = has(["USA", "YEM", "SRB", "MNE", "CHE", "FIN", "PAK", "CZE"]) ? "permissive" : has(["JPN", "GBR", "CHN", "KOR", "SGP", "TWN", "AUS", "MYS", "IDN"]) ? "banned" : rich ? "strict" : "licensed";
  if (iso === "AUS" || iso === "GBR") L.guns = "strict";
  L.press = f.free >= 0.8 ? "free" : f.free >= 0.5 ? "regulated" : f.free >= 0.2 ? "censored" : "state";
  L.internet = has(["CHN", "PRK", "IRN", "TKM", "ERI"]) ? "national" : auth || has(["RUS", "VNM", "TUR", "SAU", "ARE", "PAK", "EGY", "BLR"]) ? "filtered" : "open";
  L.surveillance = auth || has(["CHN", "RUS", "IRN", "PRK", "BLR", "VNM", "SAU", "ARE", "EGY"]) ? "total" : has(["USA", "GBR", "AUS", "CAN", "NZL", "FRA", "ISR", "IND", "SGP"]) ? "metadata" : "warrant";
  L.police = auth ? "expansive" : has(["NLD", "DNK", "NOR", "SWE", "FIN", "ISL", "NZL", "IRL"]) ? "restrained" : "standard";
  L.conscription = has(["PRK", "ISR", "ERI"]) ? "all" : has(["NOR", "SWE"]) ? "all" : has(["KOR", "TWN", "FIN", "EST", "CHE", "TUR", "RUS", "UKR", "IRN", "EGY", "SGP", "CUB", "VNM", "GRC", "CYP", "AUT", "DNK", "LTU", "LVA", "SYR", "BLR", "THA", "KAZ", "UZB", "ARM", "AZE", "GEO", "MDA", "CHN", "MAR", "DZA", "COL", "BRA", "MEX", "BOL"]) ? "men" : "none";
  if (iso === "LVA" || iso === "DNK") L.conscription = "selective";
  L.tuition = nordic || has(["DEU", "AUT", "CZE", "POL", "SVN", "SVK", "ARG", "URY", "CUB", "BRA", "MEX", "TUR", "GRC", "IRL", "EST", "LUX"]) ? "free" : has(["USA", "GBR", "AUS", "JPN", "KOR", "CHL", "CAN", "NZL", "SGP", "TWN", "CHN", "IND", "PHL"]) ? "full" : "low";
  L.healthcare = iso === "USA" ? "private" : rich || eu || has(["CUB", "THA", "BRA", "CRI", "URY", "TUR", "RUS", "CHN", "LKA", "MYS", "KAZ", "UKR", "BLR", "ARG", "MEX"]) ? (has(["CHE", "NLD", "DEU", "JPN", "ISR", "CHN", "MEX", "BEL", "FRA", "AUT"]) ? "mandate" : "universal") : "private";
  L.euthanasia = has(["NLD", "BEL", "CAN", "LUX", "COL"]) ? "broad" : has(["CHE", "AUS", "NZL", "ESP", "PRT", "AUT", "DEU"]) ? "terminal" : "banned";
  L.alcohol = has(["SAU", "IRN", "AFG", "KWT", "LBY", "YEM", "SDN", "BRN", "MRT", "SOM", "PAK", "BGD", "MDV"]) ? "prohibition" : nordic ? "restricted" : rich || eu ? "taxed" : muslim ? "restricted" : "permissive";
  L.carbon = has(["SWE", "CHE", "LIE", "URY"]) ? "150" : eu || has(["GBR", "CAN", "NOR", "ISL"]) ? "75" : has(["CHN", "KOR", "NZL", "JPN", "MEX", "CHL", "COL", "ZAF", "ARG", "SGP", "KAZ"]) ? "25" : "0";
  L.rent_control = has(["DEU", "FRA", "NLD", "ESP", "SWE", "AUT", "DNK", "CHE", "PRT", "CZE", "IRL", "ITA"]) ? "soft" : "none";
  L.mortgage_cap = "none";
  L.capital_controls = has(["CHN", "IRN", "VEN", "PRK", "CUB", "ARG", "ETH", "NGA", "MMR", "SYR", "LBN", "TKM", "UZB", "ERI"]) ? "full" : has(["RUS", "EGY", "IND", "VNM", "BLR", "SDN"]) ? "outflow" : "none";
  if (form === "one_party" || form === "theocracy") L.press = "state";
  for (const law of LAWS) if (!L[law.id]) L[law.id] = law.options[0].id;
  return L;
}

/** Five-year age bands for a country of a given wealth (oldest societies are richest). */
function cohortsFor(pop: number, perHead: number, iso: string): { cohorts: number[]; fertility: number; lifeExp: number } {
  let a = clamp((Math.log10(Math.max(300, perHead)) - 2.8) / 1.9, 0, 1);
  if (["JPN", "ITA", "KOR", "DEU", "GRC", "PRT", "ESP", "BGR", "HRV", "FIN", "TWN", "HKG", "SVN", "LTU", "LVA"].includes(iso)) a = Math.min(1, a + 0.15);
  if (["ISR"].includes(iso)) a = Math.max(0, a - 0.25);
  if (["SAU", "ARE", "QAT", "KWT", "OMN", "BHR", "BRN"].includes(iso)) a = Math.max(0, a - 0.55);
  if (["CHN", "THA", "CUB", "RUS", "UKR", "BLR"].includes(iso)) a = Math.min(1, a + 0.1);
  const w: number[] = [];
  for (let i = 0; i < 17; i++) {
    const young = Math.pow(0.86, i) * (i >= 12 ? Math.exp(-0.3 * (i - 12)) : 1);
    const old = i < 13 ? 1 - 0.008 * i : Math.exp(-0.32 * (i - 12));
    w.push(lerp(young, old * 0.95, a) * (i === 16 ? lerp(0.6, 2.2, a) : 1));
  }
  const tot = w.reduce((s, v) => s + v, 0);
  return { cohorts: w.map((v) => (v / tot) * pop), fertility: lerp(4.6, 1.45, a) * (["KOR", "TWN", "CHN", "JPN", "ITA", "ESP", "UKR"].includes(iso) ? 0.75 : 1), lifeExp: lerp(62, 83, a) };
}

/* ------------------------------------------------------------------ the world */

export interface NewWorldOptions {
  seed?: number;
  /** Who you play (ISO code) and as what. */
  iso?: string;
  role?: "government" | "opposition";
}

export function newWorld(atlas: Atlas, opts: NewWorldOptions = {}): { world: World; d: D } {
  const map = atlas.map;
  const seed = opts.seed ?? 20270101;
  const r = mulberry(seed);
  const N = map.nations.length;
  const C = map.cities.length;
  const people: Person[] = [];
  const parties: Party[] = [];
  let pid = 0;
  const person = (nation: number, culture: ReturnType<typeof cultureOf>, age: number, role: string, partyId = -1, female = r() < 0.32): number => {
    const p: Person = { id: people.length, name: personName(culture, female, r), female, born: -Math.round(age * 365.25), nation, party: partyId, skill: 0.35 + r() * 0.6, loyalty: 0.4 + r() * 0.6, health: 0.75 + r() * 0.25, alive: true, role };
    people.push(p);
    return p.id;
  };

  const world: World = {
    version: 1,
    seed,
    rng: seed ^ 0x9e3779b9,
    day: 0,
    nations: [],
    owner: map.cities.map((c) => c.nation),
    control: map.cities.map((c) => c.nation),
    autonomy: new Array(C).fill(0),
    separatism: new Array(C).fill(0),
    damage: new Array(C).fill(0),
    revolt: new Array(C).fill(0),
    occupation: new Array(C).fill("administer"),
    facilities: new Array(C * 6).fill(0),
    plants: [],
    parties,
    people,
    prices: new Array(GOODS.length).fill(1),
    other: new Array(GOODS.length).fill(0),
    wars: [],
    crises: [],
    treaties: [],
    sanctions: [],
    actors: [],
    resolutions: [],
    strikes: [],
    protests: [],
    epidemics: {},
    disasters: [],
    straits: {},
    blockades: {},
    climate: { co2: 427, temp: 1.45, soot: 0 },
    moon: { sites: {}, charter: {}, he3: {} },
    unsc: [],
    opec: { price: 1, war: false, next: 30 },
    news: [],
    reports: [],
    cables: [],
    watch: [],
    actor: { nation: 0, party: -1, role: opts.role ?? "government" },
    front: {},
    olympics: { 2028: -1, 2032: -1, 2036: -1 },
    ids: 1,
    mods: { theme: "glass", channel: "Planet News 24", units: "metric", names: "english" },
    score: 0,
  };

  for (let i = 0; i < N; i++) {
    const m = map.nations[i];
    const regime = START_IDEOLOGY[m.iso];
    const ne = m.gdp / 1000;
    const pop0 = m.pop * 1.04 * (m.iso === "UKR" ? 0.8 : m.iso === "SYR" ? 1.15 : 1);
    const perHead0 = (ne * 1.3 * 1e9) / Math.max(1, pop0);
    const f = FACTS[m.iso] ?? defaultFacts(m.iso, m.continent, perHead0, regime);
    const gdp = f.gdp ?? Math.max(0.3, ne * 1.3);
    const pop = pop0;
    const perHead = (gdp * 1e9) / Math.max(1, pop);
    const rich = perHead > 25000;
    const dev = clamp((Math.log10(Math.max(400, perHead)) - 2.7) / 1.9, 0, 1);
    const culture = cultureOf(m.iso, m.continent);
    const cities = atlas.nationCities[i];
    const capital = cities.find((c) => map.cities[c].capital) ?? cities[0] ?? -1;
    const { cohorts, fertility, lifeExp } = cohortsFor(pop, perHead, m.iso);
    const facts: Facts = { ...f, lower: [f.lower[0], f.lower[1] || clamp(Math.round(Math.cbrt(pop) * 0.9), 40, 600)] };

    // Sectors.
    const share = RICH_VA.map((v, s) => lerp(POOR_VA[s], v, dev) * (SPECIAL[m.iso]?.[SECTORS[s].id] ?? 1));
    const govShare = lerp(0.07, 0.12, dev);
    const privVA = gdp * (1 - govShare);
    // Extractive sectors sized from world output.
    const oilOut = (OIL[m.iso] ?? 0) * 25.5 + (GAS[m.iso] ?? 0) * 0.25;
    const metalW = ["iron", "copper", "aluminium", "gold", "uranium", "diamond", "titanium", "chromium", "tungsten"].reduce((s, k) => s + (ISO_RES[m.iso]?.[k] ?? 0), 0);
    const metalTot = Object.values(ISO_RES).reduce((s, v) => s + ["iron", "copper", "aluminium", "gold", "uranium", "diamond", "titanium", "chromium", "tungsten"].reduce((a, k) => a + (v[k] ?? 0), 0), 0);
    const ext: Record<string, number> = {
      oilgas: oilOut * SECTORS[4].va,
      coal: (COAL[m.iso] ?? 0) * 0.1 * SECTORS[3].va,
      metals_mining: metalW > 0 ? ((WORLD_OUT.metals_mining * metalW) / metalTot) * SECTORS[5].va : 0,
    };
    let fixed = 0;
    for (const [k, v] of Object.entries(ext)) {
      const s = SECTORS.findIndex((x) => x.id === k);
      const capped = Math.min(v, privVA * 0.55);
      ext[k] = capped;
      if (capped > 0) {
        fixed += capped;
        share[s] = 0;
      } else share[s] *= 0.25;
    }
    const tot = share.reduce((a, b) => a + b, 0);
    const vaS = share.map((v, s) => (ext[SECTORS[s].id] ? ext[SECTORS[s].id] : ((privVA - fixed) * v) / tot));
    // Employment.
    const ret = 65;
    let wa = 0;
    for (let k = 3; k < 13; k++) wa += cohorts[k];
    void ret;
    const unemp = f.unemp / 100;
    // Public services.
    const services = {} as Record<ServiceId, ServiceState>;
    for (const sd of SERVICES) {
      const staff = (pop / 1000) * sd.norm * lerp(0.25, 1, dev) * (m.iso === "USA" && sd.id === "police" ? 1.1 : 1);
      const pipeline = Array.from({ length: Math.ceil(sd.train) }, () => (staff * 0.04) / Math.max(1, sd.train));
      const fac = (pop / sd.per) * lerp(0.3, 1, dev);
      services[sd.id] = { staff, pay: sd.pay, pipeline, places: staff * 0.04, facilities: fac, building: [], supply: 1, quality: 0.8, limit: "", strike: 0 };
    }
    const milPersonnel = (PERSONNEL[m.iso] ?? clamp(pop * 0.0028 * (f.mil / 1.8), 500, 5e6)) * (PERSONNEL[m.iso] ? 1000 : 1);
    const labourGuess = wa * 0.72 * 0.85;
    const staffTot = Object.values(services).reduce((a, s) => a + s.staff, 0);
    const sectorWorkers = Math.max(labourGuess * 0.3, labourGuess * (1 - unemp) - staffTot - milPersonnel - labourGuess * 0.075);
    const agriBoost = 1 + 3 * (1 - dev);
    const intens = vaS.map((v, s) => v * INTENSITY[s] * (s <= 2 ? agriBoost : 1));
    const itot = intens.reduce((a, b) => a + b, 0);
    const sectors: SectorState[] = SECTORS.map((def, s) => {
      const out = Math.max(0.0005, vaS[s] / def.va);
      const workers = (sectorWorkers * intens[s]) / itot;
      return { cap: out * 1.15, out, plan: out, orders: 1, workers, lab: workers / out, price: 1, state: 0, coop: 0, damage: 0, program: 0, limit: "", limitBy: 0, profit: 0, wage: 0 };
    });
    // State ownership where it's usual.
    const stateOil = ["SAU", "IRN", "IRQ", "KWT", "ARE", "QAT", "VEN", "MEX", "DZA", "LBY", "NGA", "AGO", "RUS", "NOR", "MYS", "CHN", "OMN", "BRA", "KAZ", "AZE", "EGY", "IDN", "COL"];
    if (stateOil.includes(m.iso)) sectors[4].state = m.iso === "NOR" || m.iso === "BRA" || m.iso === "COL" ? 0.6 : 0.9;
    if (["CHN", "VNM", "PRK", "CUB", "LAO"].includes(m.iso)) for (const s of sectors) s.state = Math.max(s.state, m.iso === "CHN" ? 0.35 : 0.6);
    if (["FRA", "RUS", "CHN", "IND", "KOR", "MEX", "ZAF", "EGY", "ARG", "BRA"].includes(m.iso)) sectors[21].state = 0.6;
    if (["RUS", "CHN", "IND", "TUR", "ISR", "FRA", "EGY", "IRN", "PRK", "PAK", "UKR"].includes(m.iso)) sectors[20].state = 0.5;
    // Goods mix.
    const gmix = GOODS.map((g) => g.share * (GMIX[m.iso]?.[g.id] ?? 1));
    SECTOR_GOODS.forEach((list) => {
      const t = list.reduce((a, g) => a + gmix[g], 0);
      for (const g of list) gmix[g] /= t || 1;
    });
    if (!GMIX[m.iso]?.nuclear_fuel) {
      // Most countries buy their reactor fuel.
      const list = SECTOR_GOODS[13];
      const nf = GOODS.findIndex((g) => g.id === "nuclear_fuel");
      gmix[nf] = 0.002;
      const t = list.reduce((a, g) => a + gmix[g], 0);
      for (const g of list) gmix[g] /= t;
    }
    // Electricity.
    const twh = f.twh ?? Math.max(0.2, (pop * (300 + perHead * 0.22)) / 1e9);
    const mix = f.mix ?? [15, 30, 20, 0, 25, 3, 5, 0, 2];
    // Taxes.
    const vatStd = EU.includes(m.iso) ? 0.21 : m.iso === "USA" ? 0.065 : ["SAU", "ARE", "BHR", "OMN"].includes(m.iso) ? (m.iso === "SAU" ? 0.15 : 0.05) : ["QAT", "KWT"].includes(m.iso) ? 0 : lerp(0.12, 0.16, dev);
    const tax: TaxPolicy = {
      brackets: rich ? [[0, 0], [0.4, 0.2], [1, 0.32], [2.2, 0.42], [6, 0.47]] : dev > 0.4 ? [[0, 0], [0.6, 0.12], [1.5, 0.22], [4, 0.32]] : [[0, 0], [1.2, 0.1], [4, 0.2], [12, 0.3]],
      socialEmployee: lerp(0.02, 0.07, dev),
      socialEmployer: lerp(0.03, ["FRA", "DEU", "ITA", "AUT", "BEL", "SWE", "ESP", "CZE", "SVK"].includes(m.iso) ? 0.2 : 0.1, dev),
      corporate: m.iso === "IRL" ? 0.125 : ["ARE", "BHR", "QAT"].includes(m.iso) ? 0.09 : lerp(0.27, 0.23, dev),
      vat: { food: vatStd * 0.45, energy: vatStd * 0.7, standard: vatStd, luxury: vatStd * 1.15, exempt: 0 },
      tariff: EU.includes(m.iso) ? 0.04 : rich ? 0.03 : lerp(0.14, 0.06, dev),
      tariff0: 0,
      tariffs: {},
      surcharge: {},
      royalty: stateOil.includes(m.iso) ? (["NOR", "BRA", "COL", "MEX", "IDN", "CHN", "EGY", "MYS"].includes(m.iso) ? 0.25 : 0.45) : 0.08,
      wealth: ["NOR", "CHE", "ESP", "COL", "ARG"].includes(m.iso) ? 0.008 : 0,
    };
    if (m.iso === "USA") {
      tax.tariff = 0.15;
      tax.tariff0 = 0.15;
      tax.brackets = [[0, 0], [0.4, 0.15], [1, 0.25], [2.5, 0.34], [8, 0.42]];
    }
    if (["SAU", "ARE", "QAT", "KWT", "BHR", "OMN", "BRN"].includes(m.iso)) tax.brackets = [[0, 0]];
    tax.tariff0 = tax.tariff;
    const res = RESERVES[m.iso] ?? [gdp * (rich ? 0.05 : 0.12), 0];
    const ratingIdx = Math.max(0, ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+", "B", "B-", "CCC+", "CCC", "CC", "C", "D"].indexOf(f.rating));
    const nation: Nation = {
      id: i,
      iso: m.iso,
      name: m.name,
      formal: formalName(m.name, f.form),
      continent: m.continent,
      sub: m.sub,
      culture,
      alive: true,
      flag: FLAGS[m.iso] ?? madeUpFlag(m.name),
      color: NATION_COLORS[m.c9 % NATION_COLORS.length],
      form: f.form,
      hos: f.hos,
      hog: f.hog ?? f.hos,
      leader: -1,
      hogLeader: -1,
      heir: -1,
      regent: -1,
      ministers: {} as Nation["ministers"],
      house: f.house,
      gdp,
      gdpReal: gdp,
      gdpHist: [],
      growth: 0.02,
      productivity: 1,
      sectors,
      gmix,
      dm: [],
      elecEff: 1,
      elecHome: twh * 0.3,
      elecBase: 0,
      reserve: {},
      releaseReserve: true,
      loadShed: "industry",
      interconnect: EU.includes(m.iso) || ["NOR", "CHE", "GBR"].includes(m.iso) ? twh * 0.015 : 0,
      prospect: {},
      workers: 0,
      labour: 0,
      unemp,
      avgWage: 0,
      price: 1,
      priceHist: [1],
      inflation: f.infl / 100,
      fx: 1,
      debt: (gdp * f.debt) / 100,
      debtRate: m.iso === "UKR" ? 0.025 : [0.025, 0.028, 0.03, 0.032, 0.034, 0.036, 0.038, 0.042, 0.046, 0.05, 0.058, 0.065, 0.072, 0.085, 0.1, 0.12, 0.14, 0.17, 0.22, 0.3, 0.4][ratingIdx],
      fxReserves: res[0],
      swf: res[1],
      rating: ratingIdx,
      yield: 0.04,
      market: ratingIdx < 17,
      defaulted: ["VEN", "LBN", "LKA"].includes(m.iso) ? 365 * 2 : 0,
      imf: ["ARG", "EGY", "PAK", "UKR", "LKA", "GHA", "ZMB", "KEN"].includes(m.iso) ? { tranches: 4, next: 60 + Math.floor(r() * 60), target: 0.04, amount: gdp * 0.01 } : null,
      cbIndependent: true,
      policyRate: clamp(f.infl / 100 + (rich ? 0.012 : 0.03), 0.0, 0.5),
      printing: 0,
      banks: { capital: 0.15, npl: rich ? 0.02 : 0.06, nationalised: false, liquidity: 0 },
      exchangeOpen: true,
      tax,
      spend: { infrastructure: gdp * lerp(0.02, 0.03, dev), transfers: 0, socialHousing: gdp * (rich ? 0.003 : 0.001), research: gdp * lerp(0.002, 0.008, dev) * (["ISR", "KOR", "TWN", "USA", "JPN", "DEU", "SWE", "CHE", "CHN"].includes(m.iso) ? 1.6 : 1), culture: gdp * 0.003, defence: (gdp * f.mil) / 100, intelligence: gdp * 0.0012, aid: rich ? gdp * 0.0025 : 0, energySubsidy: ["IRN", "SAU", "VEN", "DZA", "EGY", "IDN", "NGA", "KWT", "LBY", "TKM"].includes(m.iso) ? gdp * 0.03 : 0, prevention: gdp * 0.0008, pensionRate: lerp(0.2, rich ? 0.55 : 0.45, dev), minPension: lerp(0.08, 0.3, dev), childBenefit: lerp(0, 0.05, dev), uiRate: lerp(0.1, 0.6, dev) },
      draft: null,
      quota: 1,
      pop,
      cohorts,
      fertility,
      lifeExp,
      groups: GROUPS.map((g) => ({ pop: 0, pre: 0, post: 0, wealth: perHead * lerp(1, 4, dev) * (g.pay ** 1.5), sat: 55, parts: [], mil: 10, ref: 0, union: g.union * (f.free > 0.3 ? 1 : 0.2) * (EU.includes(m.iso) ? 1.2 : 1), strike: 0, strikeShare: 0, repressed: 0, premium: 1 }) as GroupState),
      services,
      housing: { rent: 1, price: 1, social: ["AUT", "NLD", "DNK", "FRA", "SWE", "GBR", "FIN", "SGP", "HKG"].includes(m.iso) ? (m.iso === "SGP" ? 0.75 : 0.18) : rich ? 0.06 : 0.03, mortgage: 0.05, owners: m.iso === "DEU" || m.iso === "CHE" ? 0.48 : rich ? 0.65 : 0.7, built: 0 },
      crime: lerp(0.06, 0.03, dev) * (["MEX", "BRA", "ZAF", "COL", "VEN", "HND", "SLV", "JAM", "HTI", "NGA"].includes(m.iso) ? 2 : 1),
      laws: lawsFor(m.iso, m, f, rich, f.form),
      migIn: [0, 0, 0],
      migOut: [0, 0, 0],
      diaspora: pop * lerp(0.08, 0.04, dev),
      measures: { surveillance: rich, masks: false, distancing: false, schools: false, lockdown: false, travel: false },
      vaccine: {},
      approval: 50,
      approvalParts: [],
      stability: 60,
      stabilityParts: [],
      relig: f.relig,
      free: f.free,
      emissions: 0,
      tourists: 0,
      olympics: null,
      pol: null as unknown as Politics,
      rel: new Array(N).fill(0),
      orgs: [],
      applying: {},
      leaving: {},
      mil: null as unknown as Military,
      intel: { net: {}, counter: lerp(20, 60, dev) * (f.free < 0.3 ? 1.3 : 1), secrets: [], evidence: [] },
      research: { known: [], rp: Object.fromEntries(TECH_FIELDS.map((t) => [t, 0])) as Record<TechField, number>, alloc: Object.fromEntries(TECH_FIELDS.map((t) => [t, 1 / TECH_FIELDS.length])) as Record<TechField, number>, target: Object.fromEntries(TECH_FIELDS.map((t) => [t, -1])) as Record<TechField, number> },
      claims: [],
      capital,
      score: 0,
    };
    for (const fuel of ["crude", "natgas", "thermal_coal", "nuclear_fuel"]) nation.reserve[fuel] = 0;
    nation.cbIndependent = constitutionFor(m.iso, facts, !!f.upper).central_bank === "independent";
    if (["VEN", "ARG", "TUR", "IRN", "LBN", "SDN", "ZWE"].includes(m.iso)) nation.fx = 1.5;
    world.nations.push(nation);

    // Plants.
    const types: PlantType[] = ["coal", "gas", "oil", "nuclear", "hydro", "wind", "solar", "geothermal", "biomass"];
    types.forEach((t, k) => {
      const tw = (twh * mix[k]) / 100;
      if (tw < 0.05) return;
      const cf = PLANTS[t].cf;
      const gw = tw / (8.76 * cf);
      const count = Math.max(1, Math.min(cities.length, Math.ceil(gw / 30), 6));
      const pool = [...cities].sort((a, b) => map.cities[b].pop - map.cities[a].pop);
      for (let j = 0; j < count; j++) {
        let city = pool[Math.min(pool.length - 1, (j * 2 + (t === "hydro" || t === "wind" ? 1 : 0) + (t === "nuclear" ? 1 : 0)) % Math.max(1, pool.length))];
        if (t === "wind") city = pool.find((c, q) => q >= j && map.cities[c].coastal) ?? city;
        if (city === undefined) continue;
        world.plants.push({ id: world.plants.length, nation: i, city, type: t, gw: gw / count, damage: 0, ready: -1, state: sectors[21].state > 0.3 });
      }
    });
    // Battery storage where there's sun and wind.
    if (mix[5] + mix[6] > 15 && capital >= 0) world.plants.push({ id: world.plants.length, nation: i, city: capital, type: "storage", gw: twh * 0.002, damage: 0, ready: -1, state: false });
    void PLANT_TYPES;

    // Facilities per city by population.
    const cityPop = cities.reduce((a, c) => a + map.cities[c].pop, 0) || 1;
    for (const c of cities) {
      const k = map.cities[c].pop / cityPop;
      SERVICE_IDS.forEach((s, si) => (world.facilities[c * 6 + si] = services[s].facilities * k));
    }

    // People: the leaders and the cabinet.
    const monarchy = f.form === "const_monarchy" || f.form === "abs_monarchy";
    nation.leader = person(i, culture, 50 + r() * 22, nation.hos);
    if (monarchy) {
      people[nation.leader].royal = true;
      const heir = person(i, culture, Math.max(8, ageOf(people[nation.leader].born) - 26 - r() * 10), "Heir", -1, r() < 0.4);
      people[heir].royal = true;
      people[heir].parent = nation.leader;
      nation.heir = heir;
      const second = person(i, culture, Math.max(4, ageOf(people[heir].born) - 3), "Royal", -1);
      people[second].royal = true;
      people[second].parent = nation.leader;
    }
    nation.hogLeader = nation.hog !== nation.hos && !(f.form === "presidential") ? person(i, culture, 45 + r() * 20, nation.hog) : nation.leader;
    for (const p of PORTFOLIOS) nation.ministers[p.id] = person(i, culture, 38 + r() * 28, `Minister of ${p.name}`);

    // Politics.
    const partyList = f.parties ? parseParties(f.parties) : defaultParties(f.free, f.relig, m.continent);
    const ids: number[] = [];
    const usedNames = new Set<string>();
    for (const [fam, share, inGov] of partyList) {
      const words = FAMILIES[fam].words;
      let name = words.find((w) => !usedNames.has(w)) ?? `${words[0]} ${ids.length}`;
      const home = fam === "regional" && cities.length > 1 ? cities[Math.min(cities.length - 1, 1 + Math.floor(r() * (cities.length - 1)))] : undefined;
      if (home !== undefined) name = `${map.cities[home].name} ${name.split(" ").pop()}`;
      usedNames.add(name);
      const v = FAMILIES[fam].v.map((x) => clamp(x + (r() - 0.5) * 0.25, -1, 1)) as Party["v"];
      const party: Party = {
        id: parties.length,
        nation: i,
        name,
        short: name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 4),
        family: fam,
        color: FAMILIES[fam].color,
        v,
        leader: -1,
        funds: gdp * 0.002 * share,
        activists: (pop * 0.0004 * share) / 100,
        whip: lerp(0.75, 0.95, r()),
        cred: 0.6,
        campaign: {},
        national: 0,
        promises: [],
        poll: share / 100,
        alive: true,
        home,
      };
      parties.push(party);
      party.leader = person(i, culture, 42 + r() * 25, `Leader of the ${name}`, party.id);
      ids.push(party.id);
      void pid;
      void inGov;
    }
    const shares = partyList.map((p) => p[1]);
    const lowerSize = facts.lower[1];
    const lower: Chamber = { name: facts.lower[0], size: lowerSize, seats: allocate(ids, shares, lowerSize, f.system) };
    const upper: Chamber | null = f.upper ? { name: f.upper[0], size: f.upper[1], seats: allocate(ids, shares.map((s, k) => s * (1 + (r() - 0.5) * 0.3) * (k === 0 ? 1.05 : 1)), f.upper[1], f.upper[2] === "appointed" ? "fptp" : f.system) } : null;
    let gov = ids.filter((_, k) => partyList[k][2]);
    if (!gov.length) gov = [ids[shares.indexOf(Math.max(...shares))]];
    const hosParty = f.form === "presidential" || f.form === "semi" ? gov[0] : -1;
    // Who leads the government: the leading governing party's leader.
    const lead = parties[gov[0]];
    if (f.form === "presidential") {
      people[nation.leader].party = lead.id;
      lead.leader = nation.leader;
    } else if (f.form !== "abs_monarchy" && f.form !== "const_monarchy" && f.form !== "junta" && f.form !== "theocracy") {
      if (nation.hogLeader !== nation.leader) {
        people[nation.hogLeader].party = lead.id;
        lead.leader = nation.hogLeader;
      } else {
        people[nation.leader].party = lead.id;
        lead.leader = nation.leader;
      }
      if (f.form === "semi" || f.form === "parliamentary") people[nation.leader].party = f.form === "semi" ? lead.id : -1;
    } else if (f.form === "const_monarchy") {
      people[nation.hogLeader].party = lead.id;
      lead.leader = nation.hogLeader;
    }
    for (const p of PORTFOLIOS) people[nation.ministers[p.id]].party = gov[Math.floor(r() * gov.length)];
    const constitution = constitutionFor(m.iso, facts, !!f.upper);
    nation.pol = { lower, upper, gov, hosParty, elections: electionsFor(f, facts, r), results: [], bills: [], constitution, pending: {}, since: -Math.round(r() * 700), talks: 0, emergency: 0 };

    // Military.
    const B = (gdp * f.mil) / 100;
    const equip = Object.fromEntries(EQUIP_IDS.map((e) => [e, 0])) as Record<EquipId, number>;
    const coastal = cities.some((c) => map.cities[c].coastal);
    const base: Record<EquipId, number> = {
      infantry: milPersonnel / 700,
      tank: 30 + B * 6,
      ifv: B * 18,
      artillery: B * 10,
      mlrs: B * 2,
      sam: B * 0.4,
      fighter: B * 1.6,
      bomber: B > 60 ? B * 0.05 : 0,
      drone: B * 60,
      helicopter: B * 1,
      airlift: B * 0.2,
      frigate: coastal ? B * 0.15 : 0,
      submarine: coastal && B > 8 ? B * 0.04 : 0,
      carrier: 0,
      cruise: B * 4,
      ballistic: B > 10 ? B * 1 : 0,
    };
    for (const e of EQUIP_IDS) equip[e] = Math.round(ARSENAL[m.iso]?.[e] ?? base[e]);
    equip.infantry = Math.round(milPersonnel / 700);
    const junta = f.form === "junta";
    nation.mil = {
      equip,
      orders: [],
      ammo: m.iso === "UKR" || m.iso === "RUS" ? 45 : lerp(20, 60, dev),
      personnel: milPersonnel,
      mobilised: m.iso === "UKR" ? 0.6 : m.iso === "RUS" ? 0.35 : 0,
      loyalty: junta ? 85 : f.free > 0.6 ? 80 : 68 + r() * 15,
      bonus: 0,
      nukes: NUKES[m.iso] ?? 0,
      program: NUKES[m.iso] ? 100 : m.iso === "IRN" ? 55 : 0,
      doctrine: m.iso === "CHN" || m.iso === "IND" ? "nfu" : m.iso === "RUS" || m.iso === "PAK" || m.iso === "PRK" ? "first" : "ambiguity",
      alert: m.iso === "RUS" || m.iso === "PRK" ? 1 : 0,
      firstStrike: m.iso === "PRK" ? "losing" : "existential",
      coupRisk: 0,
    };

    // Research: what it knows.
    const known: number[] = [];
    const lvl = (fld: TechField) => {
      let L = Math.round(lerp(0, 5, dev) + (r() - 0.5));
      if (["USA", "CHN"].includes(m.iso)) L += ["ai", "computing", "space", "missiles", "air", "naval"].includes(fld) ? 3 : 2;
      else if (["JPN", "KOR", "DEU", "GBR", "FRA", "TWN", "ISR", "CHE", "NLD", "SWE"].includes(m.iso)) L += 1;
      if (fld === "nuclear" && NUKES[m.iso]) L = Math.max(L, 5);
      if (fld === "nuclear" && !NUKES[m.iso]) L = Math.min(L, m.iso === "IRN" ? 2 : 1);
      if (fld === "space" && !["USA", "CHN", "RUS", "IND", "JPN", "FRA", "DEU", "GBR", "ITA", "KOR", "ISR", "IRN", "ARE"].includes(m.iso)) L = Math.min(L, 1);
      if (fld === "energy" && L >= 10) L = 9;
      if (fld === "space" && L > 4) L = m.iso === "USA" || m.iso === "CHN" ? 5 : 4;
      return clamp(L, 0, 9);
    };
    TECH_FIELDS.forEach((fld) => {
      const L = lvl(fld);
      for (let k = 0; k < L; k++) known.push(TECHS.findIndex((t) => t.field === fld && t.level === k));
    });
    nation.research.known = known;
  }

  // Orgs.
  const isoId = (iso: string) => atlas.iso.get(iso) ?? -1;
  const join = (list: string[], org: OrgId) => list.forEach((iso) => isoId(iso) >= 0 && world.nations[isoId(iso)].orgs.push(org));
  for (const n of world.nations) n.orgs.push("un");
  join(EU, "eu");
  join(EUROZONE, "euro");
  join(NATO, "nato");
  join([...OPEC, ...OPEC_PLUS], "opec");
  join(ASEAN, "asean");
  join(USMCA, "usmca");
  join(MERCOSUR, "mercosur");
  join(BRICS, "brics");
  join(GCC, "gcc");
  join(CSTO, "csto");
  for (const n of world.nations) {
    if (n.continent === "Africa" && !["MAR", "ESH", "SOL"].includes(n.iso)) n.orgs.push("au");
    if (n.continent === "Africa" && !["ERI", "ESH", "SOL"].includes(n.iso)) n.orgs.push("afcfta");
    if (!["PRK", "CUB", "TWN", "KOS", "CYN", "SOL", "ESH"].includes(n.iso)) n.orgs.push("imf");
    if (!NON_NPT.includes(n.iso)) n.orgs.push("iaea");
    if (n.iso === "MAR") n.orgs.push("au");
  }
  world.unsc = UNSC_ELECTED.map(([iso, y]) => [isoId(iso), y] as [number, number]).filter((p) => p[0] >= 0);

  // Relations.
  relationsFor(world, r);
  treatiesFor(world, isoId);

  // Separatism and claims.
  for (const [iso, city, v] of SEPARATISTS) {
    const c = atlas.byName.get(city);
    if (c !== undefined && world.owner[c] === isoId(iso)) world.separatism[c] = v;
  }
  for (const [by, on, cs] of CLAIMS) {
    const b = isoId(by);
    if (b < 0) continue;
    for (const name of cs) {
      const c = atlas.byName.get(name);
      if (c !== undefined && world.owner[c] === isoId(on)) world.nations[b].claims.push(c);
    }
  }

  // Wars and armed groups at the start.
  startingConflicts(world, atlas, isoId, r);

  // The player.
  const me = isoId(opts.iso ?? "GBR");
  world.actor.nation = me >= 0 ? me : 0;
  const myGov = world.nations[world.actor.nation].pol.gov[0];
  const parts = world.parties.filter((p) => p.nation === world.actor.nation);
  world.actor.party = world.actor.role === "opposition" ? (parts.filter((p) => !world.nations[world.actor.nation].pol.gov.includes(p.id)).sort((a, b) => b.poll - a.poll)[0]?.id ?? myGov) : myGov;

  // Work out the flows and balance the world market.
  const d = newDerived(world);
  resetFlows();
  refreshCaches(world, atlas, d);
  // Countries already partly occupied: their GDP figure is for what they hold.
  occupiedShares(world, atlas, d);
  for (const n of world.nations) {
    const occ = d.occupied[n.id];
    if (occ > 0 && occ < 0.9) for (const s of n.sectors) s.cap /= 1 - occ;
    fitEmployment(world, n);
    calibrateElectricity(world, d, n);
  }
  calibrate(world, d);
  // Taxes: scale rates so revenue starts near what the country really collects.
  for (const n of world.nations) {
    const b = d.budget[n.id];
    const k = clamp(revenueTarget(n) / Math.max(0.01, b.revenue / n.gdp), 0.35, 2.2);
    n.tax.brackets = n.tax.brackets.map(([t, rate]) => [t, clamp(rate * k, 0, 0.6)] as [number, number]);
    n.tax.socialEmployee = clamp(n.tax.socialEmployee * k, 0, 0.25);
    n.tax.socialEmployer = clamp(n.tax.socialEmployer * k, 0, 0.3);
    n.tax.corporate = clamp(n.tax.corporate * Math.sqrt(k), 0.05, 0.4);
  }
  calibrate(world, d);
  for (const n of world.nations) {
    n.gdpHist = [n.gdpReal];
    n.priceHist = [n.price];
    for (const fuel of ["crude", "natgas", "thermal_coal", "nuclear_fuel"]) {
      const gi = GOODS.findIndex((g) => g.id === fuel);
      const days = n.orgs.includes("nato") || ["JPN", "KOR", "CHN", "IND", "AUS", "CHE", "NZL"].includes(n.iso) ? 90 : 20;
      n.reserve[fuel] = (d.demand[n.id][gi] * days) / 365;
    }
    for (const g of n.groups) g.ref = g.post;
    // What's left over goes in transfers we don't itemise (housing benefit, disability, farm support…), so the
    // budget starts near its usual deficit.
    const b = d.budget[n.id];
    const target = -n.gdp * (n.rating < 4 ? 0.025 : 0.035);
    n.spend.transfers = Math.max(0, b.balance - target);
  }
  return { world, d };
}

/** Fit sector jobs so unemployment starts where it really is. */
function fitEmployment(w: World, n: Nation) {
  const target = n.unemp;
  labourDay(w, n);
  const sectorWorkers = n.sectors.reduce((a, s) => a + s.workers, 0);
  const others = n.workers - sectorWorkers;
  const want = Math.max(n.labour * 0.2, n.labour * (1 - target) - others);
  const k = want / Math.max(1, sectorWorkers);
  for (const s of n.sectors) {
    s.workers *= k;
    s.lab *= k;
  }
  labourDay(w, n);
}

/** Tax take as a share of GDP to start from. */
function revenueTarget(n: Nation) {
  const T: Record<string, number> = { USA: 0.31, GBR: 0.39, FRA: 0.5, DEU: 0.46, ITA: 0.47, ESP: 0.42, JPN: 0.37, CAN: 0.4, AUS: 0.35, KOR: 0.3, CHN: 0.26, IND: 0.2, BRA: 0.36, RUS: 0.34, MEX: 0.24, IDN: 0.15, NGA: 0.1, PAK: 0.13, EGY: 0.2, SAU: 0.3, IRN: 0.12, TUR: 0.3, CHE: 0.33, IRL: 0.24, SGP: 0.18, ARE: 0.28 };
  if (T[n.iso]) return T[n.iso];
  const perHead = (n.gdp / Math.max(1, n.pop)) * 1e9;
  if (EU.includes(n.iso) || ["NOR", "ISL"].includes(n.iso)) return 0.43;
  return clamp(0.12 + Math.log10(Math.max(500, perHead)) * 0.05 - 0.12, 0.1, 0.38);
}

function calibrateElectricity(w: World, d: D, n: Nation) {
  let ind = 0;
  for (let s = 0; s < SECTORS.length; s++) if (SECTORS[s].id !== "power") ind += n.sectors[s].out * SECTORS[s].elec;
  let gen = 0;
  for (const p of w.plants) {
    if (p.nation !== n.id || p.type === "storage") continue;
    gen += p.gw * 8.76 * PLANTS[p.type].cf;
  }
  gen *= 0.985;
  n.elecHome = gen * 0.3;
  n.elecEff = ind > 0 ? (gen * 0.7) / ind : 1;
  void d;
}

const NATION_COLORS = ["#c0d6a3", "#e8c48a", "#d9a5a5", "#a9c4de", "#c9b1d8", "#e6dc98", "#a8d5c4", "#e0b3c9", "#bfc9a0"];

function formalName(name: string, form: Form) {
  if (form === "abs_monarchy" || form === "const_monarchy") return name.startsWith("United") ? name : name;
  return name;
}

/** Seats from vote shares: proportional systems divide fairly; winner-takes-all rewards the biggest. */
export function allocate(ids: number[], shares: number[], size: number, system: string): Record<number, number> {
  if (!ids.length) return {};
  const tot = shares.reduce((a, b) => a + b, 0) || 1;
  let w = shares.map((s) => s / tot);
  if (system === "fptp" || system === "two_round") {
    w = w.map((s) => Math.pow(s, 1.9));
  } else if (system === "mixed") {
    w = w.map((s) => Math.pow(s, 1.25));
  } else if (system === "appointed") {
    w = w.map((s) => Math.pow(s, 2.5));
  }
  const t2 = w.reduce((a, b) => a + b, 0) || 1;
  const seats: Record<number, number> = {};
  let left = size;
  const quota = w.map((s) => (s / t2) * size);
  ids.forEach((id, k) => {
    seats[id] = Math.floor(quota[k]);
    left -= seats[id];
  });
  const rem = quota.map((q, k) => [q - Math.floor(q), k] as [number, number]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < left; k++) seats[ids[rem[k % rem.length][1]]]++;
  return seats;
}

function electionsFor(f: Facts, facts: Facts, r: () => number): Election[] {
  const out: Election[] = [];
  if (f.free < 0.3 && f.form !== "presidential") return out;
  const yrs = f.form === "presidential" ? 4 : 4;
  const nextLower = f.next ? dayFor(f.next) : Math.round(120 + r() * 365 * yrs);
  if (f.system !== "appointed" && nextLower > 0) out.push({ day: nextLower, kind: "lower" });
  if (f.nextHos && (f.form === "presidential" || f.form === "semi")) out.push({ day: dayFor(f.nextHos), kind: "hos" });
  else if (!f.nextHos && f.form === "presidential" && f.system !== "appointed") out.push({ day: Math.round(200 + r() * 365 * 4), kind: "hos" });
  if (f.upper && f.upper[2] !== "appointed" && f.upper[2] !== "regions") {
    const share = f.upper[2] === "thirds" ? 1 / 3 : f.upper[2] === "halves" ? 0.5 : 1;
    const day = f.nextUpper ? dayFor(f.nextUpper) : f.upper[2] === "all" ? nextLower : Math.round(300 + r() * 700);
    if (day > 0) out.push({ day, kind: "upper", share });
  }
  void facts;
  return out.sort((a, b) => a.day - b.day);
}

const PAIRS: [string, string, number][] = [
  ["RUS", "UKR", -95], ["UKR", "BLR", -60], ["USA", "RUS", -60], ["GBR", "RUS", -65], ["POL", "RUS", -70], ["LTU", "RUS", -75], ["LVA", "RUS", -70], ["EST", "RUS", -70], ["FIN", "RUS", -55], ["DEU", "RUS", -45], ["FRA", "RUS", -50],
  ["SWE", "RUS", -55], ["CZE", "RUS", -45], ["CAN", "RUS", -50], ["JPN", "RUS", -35], ["AUS", "RUS", -40], ["USA", "CHN", -35], ["JPN", "CHN", -35], ["CHN", "TWN", -55], ["USA", "TWN", 55], ["JPN", "TWN", 40],
  ["IND", "PAK", -65], ["IND", "CHN", -25], ["ISR", "IRN", -95], ["USA", "IRN", -80], ["SAU", "IRN", -20], ["KOR", "PRK", -80], ["USA", "PRK", -90], ["JPN", "PRK", -80], ["ARM", "AZE", -45], ["GRC", "TUR", -10], ["CYP", "TUR", -45],
  ["VEN", "USA", -55], ["CUB", "USA", -50], ["RUS", "CHN", 55], ["RUS", "PRK", 60], ["RUS", "IRN", 45], ["RUS", "BLR", 85], ["CHN", "PRK", 40], ["CHN", "PAK", 70], ["USA", "ISR", 75], ["USA", "GBR", 80], ["USA", "JPN", 75],
  ["USA", "KOR", 70], ["USA", "AUS", 80], ["USA", "CAN", 50], ["USA", "MEX", 30], ["USA", "SAU", 45], ["IND", "RUS", 45], ["ETH", "ERI", -40], ["MAR", "DZA", -50], ["EGY", "ETH", -30], ["SRB", "KOS", -70], ["CHN", "PHL", -35],
  ["CHN", "VNM", -10], ["AFG", "PAK", -40], ["ISR", "SYR", -50], ["ISR", "LBN", -60], ["ISR", "YEM", -70], ["ISR", "IRQ", -50], ["RUS", "GEO", -50], ["RUS", "MDA", -40], ["UKR", "POL", 70], ["UKR", "GBR", 70], ["UKR", "USA", 45],
  ["UKR", "DEU", 60], ["UKR", "FRA", 60], ["UKR", "LTU", 80], ["UKR", "CAN", 65], ["UKR", "DNK", 70], ["UKR", "NLD", 65], ["UKR", "SWE", 65], ["UKR", "FIN", 65], ["UKR", "EST", 80], ["UKR", "LVA", 80], ["UKR", "CZE", 60], ["UKR", "HUN", -10],
  ["SDN", "ARE", -25], ["IND", "USA", 40], ["IND", "JPN", 50], ["CHN", "IRN", 40], ["TUR", "AZE", 80], ["PAK", "SAU", 70], ["IRN", "SYR", -20], ["KOR", "JPN", 25], ["AUS", "NZL", 85], ["GBR", "IRL", 45], ["FRA", "DEU", 75],
];

function relationsFor(w: World, r: () => number) {
  const N = w.nations.length;
  const idx = new Map(w.nations.map((n) => [n.iso, n.id]));
  for (let i = 0; i < N; i++) {
    const a = w.nations[i];
    for (let j = i + 1; j < N; j++) {
      const b = w.nations[j];
      let v = 10 + (r() - 0.5) * 20;
      if (a.continent === b.continent) v += 8;
      if (a.sub === b.sub) v += 8;
      for (const o of ["eu", "nato", "asean", "gcc", "brics", "csto", "au", "mercosur", "usmca"] as OrgId[]) if (a.orgs.includes(o) && b.orgs.includes(o)) v += o === "eu" ? 30 : o === "nato" ? 22 : 10;
      const da = a.free > 0.6;
      const db = b.free > 0.6;
      v += da && db ? 10 : !da && !db ? 5 : -10;
      a.rel[j] = b.rel[i] = clamp(v, -100, 100);
    }
  }
  for (const [x, y, v] of PAIRS) {
    const i = idx.get(x);
    const j = idx.get(y);
    if (i === undefined || j === undefined) continue;
    w.nations[i].rel[j] = w.nations[j].rel[i] = v;
  }
}

function treatiesFor(w: World, isoId: (s: string) => number) {
  const add = (kind: World["treaties"][number]["kind"], a: string, b: string, amount?: number) => {
    const i = isoId(a);
    const j = isoId(b);
    if (i < 0 || j < 0) return;
    w.treaties.push({ id: w.ids++, kind, a: i, b: j, since: -365, amount });
  };
  for (const b of ["JPN", "KOR", "PHL", "AUS"]) add("defence", "USA", b);
  add("guarantee", "USA", "TWN");
  add("defence", "RUS", "BLR");
  add("defence", "CHN", "PRK");
  add("defence", "RUS", "PRK");
  add("defence", "SAU", "PAK");
  add("defence", "FRA", "GRC");
  add("defence", "TUR", "AZE");
  for (const b of ["JPN", "KOR", "DEU", "ITA", "GBR", "ESP", "BHR", "QAT", "DJI", "TUR", "POL"]) add("base", "USA", b);
  add("base", "CHN", "DJI");
  add("base", "FRA", "DJI");
  add("base", "FRA", "ARE");
  add("base", "GBR", "CYP");
  const five = ["USA", "GBR", "CAN", "AUS", "NZL"];
  for (let i = 0; i < five.length; i++) for (let j = i + 1; j < five.length; j++) add("intel", five[i], five[j]);
  const milaid: [string, number][] = [["USA", 12], ["DEU", 9], ["GBR", 4], ["FRA", 2.5], ["NLD", 3], ["DNK", 3], ["SWE", 2], ["NOR", 2], ["CAN", 2], ["POL", 1], ["FIN", 0.8], ["BEL", 1], ["CZE", 0.6], ["LTU", 0.3], ["EST", 0.3], ["ESP", 0.6], ["ITA", 0.8], ["JPN", 0.5], ["AUS", 0.4]];
  for (const [a, v] of milaid) add("milaid", a, "UKR", v);
  for (const [a, v] of [["DEU", 6], ["FRA", 3], ["ITA", 2], ["ESP", 1.5], ["JPN", 3], ["NLD", 2], ["SWE", 1], ["NOR", 2], ["CAN", 2], ["GBR", 2], ["POL", 1], ["BEL", 1], ["DNK", 1], ["AUT", 1], ["USA", 2]] as [string, number][]) add("aid", a, "UKR", v);
  add("milaid", "USA", "ISR", 3.8);
  add("milaid", "IRN", "RUS", 1);
  add("milaid", "PRK", "RUS", 2);
  add("milaid", "USA", "TWN", 1);
  // Sanctions.
  const sanc = (by: string[], on: string, level: 1 | 2 | 3) => {
    const o = isoId(on);
    if (o < 0) return;
    for (const b of by) {
      const i = isoId(b);
      if (i >= 0) w.sanctions.push({ by: i, on: o, level, since: -365 });
    }
  };
  sanc([...EU, "USA", "GBR", "CAN", "JPN", "AUS", "NOR", "CHE", "NZL", "KOR", "ISL"], "RUS", 3);
  sanc(["USA", "GBR", "CAN"], "IRN", 3);
  sanc([...EU], "IRN", 2);
  sanc(["USA", "KOR", "JPN", ...EU], "PRK", 3);
  sanc(["USA"], "CUB", 3);
  sanc(["USA"], "VEN", 2);
  sanc([...EU, "USA", "GBR", "CAN"], "BLR", 2);
  sanc(["USA", "GBR"], "MMR", 1);
}

/** The wars and armed groups the world starts with. */
function startingConflicts(w: World, a: Atlas, isoId: (s: string) => number, r: () => number) {
  const RUS = isoId("RUS");
  const UKR = isoId("UKR");
  if (RUS >= 0 && UKR >= 0) {
    // The occupied east and south: inside this outline (lon, lat).
    const zone: [number, number][] = [
      [38.3, 50.3], [37.7, 49.7], [38.0, 49.0], [37.6, 48.6], [37.1, 48.3], [36.6, 47.85], [36.0, 47.6], [35.3, 47.42], [34.7, 47.3], [34.1, 47.4], [33.4, 46.85], [32.5, 46.55],
      [31.9, 45.9], [33.0, 44.4], [35.6, 44.8], [37.5, 46.8], [38.3, 47.1], [39.8, 47.8], [40.2, 48.6], [40.0, 49.6], [38.9, 50.2],
    ];
    const inside = (lon: number, lat: number) => {
      let c = false;
      for (let i = 0, j = zone.length - 1; i < zone.length; j = i++) {
        const [xi, yi] = zone[i];
        const [xj, yj] = zone[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    for (const city of a.nationCities[UKR]) {
      for (const cell of a.cityCells[city]) {
        const [x, y] = cellXY(a, cell);
        const [lon, lat] = toLonLat(a, x, y);
        if (inside(lon, lat)) w.front[cell] = RUS;
      }
      const c = a.map.cities[city];
      const [lon, lat] = toLonLat(a, c.x, c.y);
      if (inside(lon, lat)) w.control[city] = RUS;
    }
    const war: War = {
      id: w.ids++,
      name: "Russia–Ukraine war",
      attackers: [RUS],
      defenders: [UKR],
      start: -1773,
      grounds: "Claims on eastern and southern Ukraine",
      legit: 12,
      claims: w.nations[RUS].claims.slice(),
      theatres: [],
      air: 0.55,
      sea: 0.35,
      score: 8,
      dead: { [RUS]: 250000, [UKR]: 120000 },
      civilians: { [UKR]: 14000 },
      refugees: 6_800_000,
      doctrine: ["infrastructure", "military"],
      ceasefire: 0,
      over: false,
    };
    w.wars.push(war);
    makeTheatres(w, a, war);
    for (const t of war.theatres) t.dir = [t.name.includes("Donetsk") || t.name.includes("Kharkiv") ? "major" : "limited", "hold"];
  }
  const actor = (iso: string, name: string, kind: Actor["kind"], strength: number, cities: string[], leader: string, war = false) => {
    const n = isoId(iso);
    if (n < 0) return;
    const act: Actor = { id: w.actors.length, name, kind, nation: n, strength, funding: strength * 0.01, leader, infiltrated: {}, alive: true };
    w.actors.push(act);
    for (const cn of cities) {
      const c = a.byName.get(cn);
      if (c !== undefined && w.owner[c] === n) {
        w.control[c] = 1000 + act.id;
        for (const cell of a.cityCells[c]) w.front[cell] = 1000 + act.id;
      }
    }
    if (war) {
      const wr: War = { id: w.ids++, name: `${w.nations[n].name}: war with the ${name}`, attackers: [], defenders: [n], actor: act.id, start: -700, grounds: "Civil war", legit: 50, claims: [], theatres: [], air: 0.2, sea: 0, score: 0, dead: { [n]: 30000 }, civilians: { [n]: 40000 }, refugees: 2_000_000, doctrine: ["total", "military"], ceasefire: 0, over: false };
      w.wars.push(wr);
    }
  };
  actor("SDN", "Rapid Support Forces", "militia", 55, ["Niyala", "El Fasher", "Geneina", "Muglad"], "General " + personName("ar", false, r).split(" ")[1], true);
  actor("YEM", "Ansar Allah", "rebels", 45, ["Sanaa", "Sana'a", "Al Hudaydah"], personName("ar", false, r), true);
  actor("MMR", "Resistance Alliance", "rebels", 40, ["Myitkyina", "Lashio"], personName("th", false, r), true);
  actor("COD", "M23 movement", "rebels", 30, ["Goma", "Bukavu"], personName("fr", false, r), true);
  actor("MLI", "Sahel jihadist coalition", "terrorists", 35, [], personName("ha", false, r));
  actor("NGA", "West African jihadists", "terrorists", 22, [], personName("ha", false, r));
  actor("SOM", "Al-Shabaab", "terrorists", 25, [], personName("ar", false, r));
  actor("PAK", "Pakistani Taliban", "terrorists", 20, [], personName("fa", false, r));
  actor("SYR", "Islamic State remnants", "terrorists", 12, [], personName("ar", false, r));
  actor("MEX", "The cartels", "cartel", 35, [], personName("es", false, r));
  actor("HTI", "Gang coalition", "cartel", 30, [], personName("fr", false, r));
  actor("COL", "ELN guerrillas", "rebels", 15, [], personName("es", false, r));
}

/** Cut a war's front into theatres, named after the defending city nearest each stretch. */
export function makeTheatres(w: World, a: Atlas, war: War) {
  const sideOf = (n: number) => (war.attackers.includes(n) ? 0 : war.defenders.includes(n) ? 1 : -1);
  const counts = new Map<number, number>();
  const nb: number[] = [];
  const g = a.map.grid;
  for (const [cellS, ctl] of Object.entries(w.front)) {
    const cell = +cellS;
    if (sideOf(ctl) !== 0) continue;
    for (const q of cellNeighboursFast(cell, g.w, g.h, nb)) {
      const c = a.cellCity[q];
      if (c < 0) continue;
      const ctl2 = w.front[q] ?? w.owner[c];
      if (sideOf(ctl2) === 1) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const list = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
  war.theatres = list.map(([city, len], i) => ({ id: i, name: `${a.map.cities[city].name} front`, city, dir: ["limited", "hold"], pri: [1, 1], len }) as Theatre);
  if (!war.theatres.length && war.defenders.length) {
    const cap = w.nations[war.defenders[0]].capital;
    if (cap >= 0) war.theatres.push({ id: 0, name: `${a.map.cities[cap].name} front`, city: cap, dir: ["limited", "hold"], pri: [1, 1], len: 1 });
  }
}
function cellNeighboursFast(cell: number, w: number, h: number, out: number[]) {
  out.length = 0;
  const x = cell % w;
  const y = (cell / w) | 0;
  out.push(y * w + ((x + 1) % w), y * w + ((x - 1 + w) % w));
  if (y > 0) out.push(cell - w);
  if (y < h - 1) out.push(cell + w);
  return out;
}

function ageOf(born: number) {
  return -born / 365.25;
}

/** For tests and the UI: a fresh party-of-one constitution check. */
export function constitutionIsComplete(c: Record<string, string>) {
  return CONSTITUTION.every((d) => CONST[d.id].options.some((o) => o.id === c[d.id]));
}
