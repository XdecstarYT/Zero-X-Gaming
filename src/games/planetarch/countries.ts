/**
 * What each country starts with: how it's governed, its parliament and when it next votes, its
 * debt, jobs and prices, how it makes its electricity, what it digs up, and its parties. Around
 * seventy countries are written out; the rest get sensible values from their size, wealth and
 * region. Figures are rounded approximations of the mid-2020s. All people are fictional.
 */
import type { Family } from "./data";

export type Form = "presidential" | "semi" | "parliamentary" | "const_monarchy" | "abs_monarchy" | "one_party" | "theocracy" | "junta";
export type ElectoralSystem = "fptp" | "two_round" | "dhondt" | "sainte_lague" | "mixed" | "appointed";

export interface Facts {
  form: Form;
  /** Titles: head of state, head of government. */
  hos: string;
  hog?: string;
  /** Lower house name and seats. */
  lower: [string, number];
  /** Upper house name, seats, and how it's renewed. */
  upper?: [string, number, "all" | "thirds" | "halves" | "regions" | "appointed"];
  system: ElectoralSystem;
  /** Next lower-house election (YYYY-MM), next head-of-state election, next upper-house renewal. */
  next?: string;
  nextHos?: string;
  nextUpper?: string;
  /** Government debt % GDP, unemployment %, inflation %, credit rating. */
  debt: number;
  unemp: number;
  infl: number;
  rating: string;
  currency: string;
  /** 2025 GDP, $bn (overrides the map's older estimate). */
  gdp?: number;
  /** Electricity generated, TWh a year, and the mix (coal, gas, oil, nuclear, hydro, wind, solar, geothermal, biomass) in %. */
  twh?: number;
  mix?: [number, number, number, number, number, number, number, number, number];
  /** Military spending % GDP. */
  mil: number;
  /** How religious (0…1), how free (0…1). */
  relig: number;
  free: number;
  /** Parties: family and vote share; * marks the governing coalition. */
  parties?: string;
  /** Monarchy: the royal house's name. */
  house?: string;
}

const F = (form: Form, hos: string, hog: string | undefined, lower: [string, number], upper: Facts["upper"], system: ElectoralSystem, next: string | undefined, nextHos: string | undefined, nextUpper: string | undefined, debt: number, unemp: number, infl: number, rating: string, currency: string, gdp: number | undefined, twh: number | undefined, mix: Facts["mix"], mil: number, relig: number, free: number, parties?: string, house?: string): Facts => ({
  form, hos, hog, lower, upper, system, next, nextHos, nextUpper, debt, unemp, infl, rating, currency, gdp, twh, mix, mil, relig, free, parties, house,
});

export const FACTS: Record<string, Facts> = {
  USA: F("presidential", "President", undefined, ["House of Representatives", 435], ["Senate", 100, "thirds"], "fptp", "2028-11", "2028-11", "2028-11", 122, 4.2, 2.8, "AA+", "US dollar", 30300, 4400, [16, 43, 0.5, 18, 6, 10, 6, 0.4, 1], 3.4, 0.55, 0.85, "conservative:49*,soc_dem:47,liberal:2,green:1,far_left:1"),
  CAN: F("parliamentary", "King", "Prime Minister", ["House of Commons", 343], ["Senate", 105, "appointed"], "fptp", "2029-10", undefined, undefined, 107, 6.9, 2.2, "AAA", "Canadian dollar", 2250, 640, [5, 15, 1, 13, 60, 7, 1, 0, 1], 1.4, 0.4, 0.92, "liberal:44*,conservative:41,left:6,regional:6,green:2,nationalist:1"),
  MEX: F("presidential", "President", undefined, ["Chamber of Deputies", 500], ["Senate", 128, "all"], "mixed", "2027-06", "2030-06", "2030-06", 50, 2.7, 3.8, "BBB", "peso", 1850, 345, [4, 60, 8, 4, 7, 6, 7, 1.5, 1], 0.7, 0.75, 0.6, "left:54*,conservative:28,centre:10,green:5,liberal:3"),
  BRA: F("presidential", "President", undefined, ["Chamber of Deputies", 513], ["Senate", 81, "thirds"], "dhondt", "2030-10", "2030-10", "2030-10", 78, 6.2, 4.8, "BB", "real", 2300, 720, [2, 6, 2, 2, 55, 15, 10, 0, 8], 1.1, 0.8, 0.7, "left:30*,conservative:28,centre:18,christian:10,liberal:8,far_right:6"),
  ARG: F("presidential", "President", undefined, ["Chamber of Deputies", 257], ["Senate", 72, "thirds"], "dhondt", "2027-10", "2027-10", "2027-10", 85, 7.2, 30, "CCC", "peso", 640, 145, [1, 60, 3, 6, 18, 9, 2, 0, 1], 0.5, 0.65, 0.75, "liberal:41*,left:34,conservative:15,centre:6,far_left:4"),
  CHL: F("presidential", "President", undefined, ["Chamber of Deputies", 155], ["Senate", 50, "halves"], "dhondt", "2029-11", "2029-11", "2029-11", 42, 8.5, 4, "A", "peso", 340, 85, [17, 15, 2, 0, 23, 13, 25, 0.5, 5], 1.8, 0.6, 0.85, "conservative:40*,far_right:15,left:28,soc_dem:12,green:5"),
  COL: F("presidential", "President", undefined, ["Chamber of Representatives", 188], ["Senate", 108, "all"], "dhondt", "2030-03", "2030-05", "2030-03", 60, 9.5, 5, "BB+", "peso", 430, 85, [8, 14, 1, 0, 70, 1, 5, 0, 1], 3.1, 0.75, 0.65, "conservative:34*,left:32,liberal:16,centre:12,green:6"),
  PER: F("presidential", "President", undefined, ["Chamber of Deputies", 130], ["Senate", 60, "all"], "dhondt", "2031-04", "2031-04", "2031-04", 33, 6.5, 2.5, "BBB", "sol", 300, 62, [1, 38, 1, 0, 55, 2, 2, 0, 1], 1.1, 0.8, 0.6),
  VEN: F("presidential", "President", undefined, ["National Assembly", 285], undefined, "mixed", "2030-05", "2030-07", undefined, 150, 9, 180, "D", "bolívar", 100, 90, [0, 25, 10, 0, 65, 0, 0, 0, 0], 0.5, 0.75, 0.2, "ruling:68*,liberal:20,centre:12"),
  CUB: F("one_party", "President", "Prime Minister", ["National Assembly", 470], undefined, "appointed", undefined, undefined, undefined, 130, 2, 30, "D", "peso", 60, 16, [0, 15, 80, 0, 1, 0, 3, 0, 1], 3, 0.5, 0.1, "ruling:100*"),
  GBR: F("const_monarchy", "King", "Prime Minister", ["House of Commons", 650], ["House of Lords", 800, "appointed"], "fptp", "2029-08", undefined, undefined, 100, 4.8, 3.2, "AA", "pound", 3800, 290, [1, 30, 0.5, 14, 2, 30, 5, 0, 12], 2.4, 0.35, 0.92, "soc_dem:34*,nationalist:24,conservative:20,liberal:12,green:7,regional:3", "Windsor-Ashcombe"),
  IRL: F("parliamentary", "President", "Taoiseach", ["Dáil", 174], ["Seanad", 60, "all"], "sainte_lague", "2029-11", "2032-10", "2029-11", 40, 4.4, 2, "AA", "euro", 600, 32, [0, 48, 1, 0, 3, 36, 4, 0, 4], 0.25, 0.6, 0.95, "centre:22*,conservative:21*,left:19,soc_dem:5,green:3,far_left:3,regional:5"),
  FRA: F("semi", "President", "Prime Minister", ["National Assembly", 577], ["Senate", 348, "halves"], "two_round", "2029-06", "2027-04", "2029-09", 113, 7.5, 1.5, "AA-", "euro", 3300, 540, [0, 3, 1, 68, 12, 9, 5, 0, 2], 2.1, 0.3, 0.9, "nationalist:33,centre:22*,left:28,conservative:9*,green:5,far_left:3"),
  DEU: F("parliamentary", "President", "Chancellor", ["Bundestag", 630], ["Bundesrat", 69, "regions"], "mixed", "2029-03", undefined, undefined, 63, 6.3, 2.2, "AAA", "euro", 4900, 500, [22, 15, 1, 0, 4, 31, 14, 0, 9], 2.1, 0.4, 0.95, "christian:29*,far_right:21,soc_dem:16*,green:12,left:9,liberal:4,centre:5"),
  ITA: F("parliamentary", "President", "Prime Minister", ["Chamber of Deputies", 400], ["Senate", 200, "all"], "mixed", "2027-09", undefined, "2027-09", 135, 6.1, 1.5, "BBB+", "euro", 2450, 270, [2, 45, 3, 0, 19, 8, 13, 2, 7], 1.6, 0.6, 0.88, "nationalist:30*,soc_dem:23,centre:11,conservative:9*,far_right:9*,green:7,left:6,liberal:5"),
  ESP: F("const_monarchy", "King", "Prime Minister", ["Congress of Deputies", 350], ["Senate", 266, "all"], "dhondt", "2027-08", undefined, "2027-08", 102, 10.5, 2.5, "A", "euro", 1850, 270, [1, 17, 2, 20, 13, 23, 20, 0, 2], 1.3, 0.5, 0.9, "soc_dem:31*,conservative:33,far_right:14,left:12*,regional:10", "Borbón-Valdecasas"),
  PRT: F("semi", "President", "Prime Minister", ["Assembly of the Republic", 230], undefined, "dhondt", "2029-05", "2031-01", undefined, 95, 6.4, 2.2, "A", "euro", 320, 52, [0, 20, 2, 0, 25, 28, 17, 0.5, 7], 1.6, 0.6, 0.93, "conservative:32*,soc_dem:23,far_right:23,liberal:6,left:6,green:4"),
  NLD: F("const_monarchy", "King", "Prime Minister", ["House of Representatives", 150], ["Senate", 75, "regions"], "dhondt", "2029-10", undefined, undefined, 44, 3.8, 3, "AAA", "euro", 1250, 120, [6, 35, 1, 3, 0, 30, 20, 0, 5], 2, 0.3, 0.95, "liberal:17*,soc_dem:15*,far_right:17,conservative:12*,christian:12,centre:10,green:6,far_left:5,agrarian:6", "Oranje-Vliet"),
  BEL: F("const_monarchy", "King", "Prime Minister", ["Chamber of Representatives", 150], ["Senate", 60, "regions"], "dhondt", "2029-06", undefined, undefined, 105, 5.8, 3, "AA-", "euro", 690, 85, [0, 25, 0, 40, 1, 18, 12, 0, 4], 1.3, 0.4, 0.93, "nationalist:17*,far_right:14,liberal:15*,soc_dem:17*,christian:12*,green:10,far_left:10,regional:5", "Saxe-Laeken"),
  CHE: F("parliamentary", "Federal Council", "Federal Council", ["National Council", 200], ["Council of States", 46, "all"], "dhondt", "2027-10", undefined, "2027-10", 37, 2.8, 0.5, "AAA", "franc", 1000, 70, [0, 1, 0, 32, 58, 0, 7, 0, 2], 0.7, 0.4, 0.97, "nationalist:28*,soc_dem:18*,liberal:14*,christian:14*,green:10,centre:8,agrarian:8"),
  AUT: F("parliamentary", "President", "Chancellor", ["National Council", 183], ["Federal Council", 60, "regions"], "dhondt", "2029-09", "2028-10", undefined, 81, 5.5, 3.5, "AA", "euro", 540, 72, [0, 15, 1, 0, 60, 13, 8, 0, 5], 1, 0.5, 0.93, "far_right:29,christian:26*,soc_dem:21*,liberal:9*,green:8,agrarian:7"),
  SWE: F("const_monarchy", "King", "Prime Minister", ["Riksdag", 349], undefined, "sainte_lague", "2030-09", undefined, undefined, 33, 8.6, 2, "AAA", "krona", 620, 165, [0, 0, 0, 30, 40, 23, 1, 0, 6], 2.4, 0.2, 0.97, "soc_dem:33,nationalist:20*,conservative:19*,left:8,green:6,christian:6*,liberal:4*,centre:4", "Vasaborg"),
  NOR: F("const_monarchy", "King", "Prime Minister", ["Storting", 169], undefined, "sainte_lague", "2029-09", undefined, undefined, 43, 4, 3, "AAA", "krone", 500, 155, [0, 1, 0, 0, 89, 10, 0, 0, 0], 2.2, 0.3, 0.98, "soc_dem:28*,nationalist:24,conservative:15,left:12,centre:6,green:5,liberal:4,agrarian:6", "Glücksholm"),
  DNK: F("const_monarchy", "King", "Prime Minister", ["Folketing", 179], undefined, "dhondt", "2026-10", undefined, undefined, 30, 5, 2, "AAA", "krone", 440, 35, [6, 4, 0, 0, 0, 58, 13, 0, 19], 2.4, 0.3, 0.98, "soc_dem:27*,liberal:13*,centre:9*,left:12,conservative:8,nationalist:14,green:7,far_left:5,agrarian:5", "Glücksborg"),
  FIN: F("parliamentary", "President", "Prime Minister", ["Eduskunta", 200], undefined, "dhondt", "2027-04", "2030-01", undefined, 82, 9.5, 1.5, "AA+", "euro", 310, 80, [3, 3, 0, 42, 18, 25, 2, 0, 7], 2.4, 0.3, 0.98, "conservative:21*,nationalist:20*,soc_dem:20,centre:11,left:8,green:7,liberal:4*,christian:4*"),
  ISL: F("parliamentary", "President", "Prime Minister", ["Althing", 63], undefined, "dhondt", "2028-11", "2028-06", undefined, 60, 3.5, 4, "A+", "króna", 34, 20, [0, 0, 0, 0, 70, 0, 0, 30, 0], 0, 0.3, 0.98),
  POL: F("parliamentary", "President", "Prime Minister", ["Sejm", 460], ["Senate", 100, "all"], "dhondt", "2027-10", "2030-05", "2027-10", 57, 3, 3.5, "A-", "złoty", 950, 165, [57, 10, 1, 0, 1, 15, 12, 0, 5], 4.4, 0.7, 0.85, "centre:31*,nationalist:35,liberal:7*,christian:12*,left:8*,far_right:7"),
  CZE: F("parliamentary", "President", "Prime Minister", ["Chamber of Deputies", 200], ["Senate", 81, "thirds"], "dhondt", "2029-10", "2028-01", "2028-10", 43, 2.8, 2.5, "AA-", "koruna", 380, 75, [33, 7, 0, 40, 3, 1, 5, 0, 10], 2.1, 0.2, 0.9, "nationalist:35*,conservative:23,centre:11,liberal:9,far_right:8*,agrarian:7*,left:4"),
  SVK: F("parliamentary", "President", "Prime Minister", ["National Council", 150], undefined, "dhondt", "2027-09", "2029-03", undefined, 59, 5.5, 4, "A", "euro", 150, 30, [3, 12, 1, 62, 15, 0, 3, 0, 4], 2, 0.6, 0.8),
  HUN: F("parliamentary", "President", "Prime Minister", ["National Assembly", 199], undefined, "mixed", "2030-04", undefined, undefined, 74, 4.5, 4.5, "BBB", "forint", 230, 36, [5, 20, 0, 45, 1, 2, 25, 0, 2], 2.1, 0.5, 0.65),
  ROU: F("semi", "President", "Prime Minister", ["Chamber of Deputies", 331], ["Senate", 136, "all"], "dhondt", "2028-12", "2030-05", "2028-12", 57, 5.6, 7, "BBB-", "leu", 420, 55, [12, 15, 1, 19, 28, 12, 11, 0, 2], 2.3, 0.85, 0.8),
  BGR: F("parliamentary", "President", "Prime Minister", ["National Assembly", 240], undefined, "dhondt", "2028-10", "2026-11", undefined, 25, 3.8, 3.5, "BBB+", "euro", 115, 40, [33, 6, 0, 37, 8, 4, 11, 0, 1], 2.2, 0.6, 0.75),
  GRC: F("parliamentary", "President", "Prime Minister", ["Hellenic Parliament", 300], undefined, "mixed", "2027-06", "2030-03", undefined, 150, 9, 2.8, "BBB", "euro", 270, 55, [5, 38, 8, 0, 8, 22, 19, 0, 0], 3.1, 0.8, 0.88),
  HRV: F("parliamentary", "President", "Prime Minister", ["Sabor", 151], undefined, "dhondt", "2028-04", "2029-12", undefined, 58, 5, 4, "A-", "euro", 95, 15, [0, 20, 0, 0, 50, 15, 5, 1, 9], 1.8, 0.8, 0.85),
  SRB: F("parliamentary", "President", "Prime Minister", ["National Assembly", 250], undefined, "dhondt", "2027-12", "2027-04", undefined, 48, 8.5, 4.5, "BBB-", "dinar", 85, 37, [65, 3, 0, 0, 28, 3, 1, 0, 0], 2.3, 0.8, 0.55),
  UKR: F("semi", "President", "Prime Minister", ["Verkhovna Rada", 450], undefined, "mixed", undefined, undefined, undefined, 95, 12, 12, "CC", "hryvnia", 200, 100, [15, 8, 1, 55, 8, 2, 8, 0, 3], 26, 0.7, 0.6, "centre:43*,conservative:14,liberal:12,soc_dem:10,regional:8,nationalist:8,left:5"),
  BLR: F("presidential", "President", "Prime Minister", ["House of Representatives", 110], ["Council of the Republic", 64, "appointed"], "fptp", "2029-02", "2030-01", undefined, 40, 3.5, 6, "CCC", "rouble", 75, 40, [0, 60, 2, 37, 0, 0, 1, 0, 0], 1.2, 0.6, 0.15, "ruling:90*,centre:10"),
  RUS: F("presidential", "President", "Prime Minister", ["State Duma", 450], ["Federation Council", 178, "regions"], "mixed", "2031-09", "2030-03", undefined, 20, 2.6, 8, "CCC", "rouble", 2100, 1180, [17, 43, 1, 19, 18, 0.5, 0.5, 0, 1], 7, 0.5, 0.15, "ruling:72*,far_left:10,nationalist:8,centre:5,liberal:5"),
  TUR: F("presidential", "President", undefined, ["Grand National Assembly", 600], undefined, "dhondt", "2028-05", "2028-05", undefined, 26, 8.5, 33, "BB-", "lira", 1450, 340, [35, 18, 0, 0, 20, 11, 9, 3, 2], 1.9, 0.75, 0.4, "islamist:35*,soc_dem:28,nationalist:10*,regional:9,centre:8,far_right:5,liberal:5"),
  ISR: F("parliamentary", "President", "Prime Minister", ["Knesset", 120], undefined, "dhondt", "2026-10", undefined, undefined, 68, 3, 2.8, "A", "shekel", 580, 75, [15, 68, 0, 0, 0, 0, 16, 0, 1], 6, 0.6, 0.75, "conservative:24*,centre:20,islamist:16*,nationalist:12*,liberal:10,soc_dem:6,regional:8,far_right:4*"),
  IRN: F("theocracy", "Supreme Leader", "President", ["Islamic Consultative Assembly", 290], undefined, "two_round", "2028-03", "2028-06", undefined, 35, 8, 40, "CCC", "rial", 400, 370, [0, 85, 8, 2, 5, 0, 0, 0, 0], 2.5, 0.85, 0.15, "islamist:70*,conservative:20,liberal:10"),
  SAU: F("abs_monarchy", "King", "Prime Minister", ["Consultative Assembly", 150], undefined, "appointed", undefined, undefined, undefined, 30, 3.5, 2, "A+", "riyal", 1100, 420, [0, 63, 36, 0, 0, 0, 1, 0, 0], 7, 0.9, 0.08, undefined, "Al Naseer"),
  ARE: F("abs_monarchy", "President", "Prime Minister", ["Federal National Council", 40], undefined, "appointed", undefined, undefined, undefined, 30, 2.5, 2, "AA", "dirham", 570, 165, [0, 76, 0, 22, 0, 0, 2, 0, 0], 5, 0.7, 0.15, undefined, "Al Hamdan"),
  QAT: F("abs_monarchy", "Emir", "Prime Minister", ["Consultative Assembly", 45], undefined, "appointed", undefined, undefined, undefined, 42, 0.2, 2, "AA", "riyal", 220, 55, [0, 99, 0, 0, 0, 0, 1, 0, 0], 4, 0.85, 0.15, undefined, "Al Tharwa"),
  KWT: F("abs_monarchy", "Emir", "Prime Minister", ["National Assembly", 50], undefined, "appointed", undefined, undefined, undefined, 8, 2, 3, "A+", "dinar", 160, 80, [0, 65, 34, 0, 0, 0, 1, 0, 0], 5, 0.85, 0.25, undefined, "Al Sabbah"),
  OMN: F("abs_monarchy", "Sultan", "Sultan", ["Consultative Assembly", 90], undefined, "appointed", undefined, undefined, undefined, 35, 3, 1, "BBB-", "rial", 105, 42, [0, 95, 2, 0, 0, 0, 3, 0, 0], 6, 0.85, 0.2, undefined, "Al Busaidan"),
  IRQ: F("parliamentary", "President", "Prime Minister", ["Council of Representatives", 329], undefined, "sainte_lague", "2029-11", undefined, undefined, 45, 15, 3.5, "B-", "dinar", 270, 120, [0, 60, 33, 0, 4, 0, 3, 0, 0], 3, 0.9, 0.35, "islamist:45*,regional:20*,conservative:20,nationalist:15"),
  EGY: F("presidential", "President", "Prime Minister", ["House of Representatives", 596], ["Senate", 300, "all"], "mixed", "2030-11", "2030-12", "2030-08", 90, 6.5, 20, "B", "pound", 350, 220, [0, 77, 10, 0, 6, 3, 4, 0, 0], 1.2, 0.9, 0.2, "ruling:75*,liberal:10,islamist:15"),
  DZA: F("presidential", "President", "Prime Minister", ["People's National Assembly", 407], ["Council of the Nation", 174, "halves"], "dhondt", "2026-06", "2029-09", undefined, 50, 11, 4, "B", "dinar", 270, 90, [0, 98, 1, 0, 0, 0, 1, 0, 0], 8, 0.9, 0.25, "ruling:55*,islamist:20,centre:15,liberal:10"),
  MAR: F("const_monarchy", "King", "Head of Government", ["House of Representatives", 395], ["House of Councillors", 120, "all"], "dhondt", "2026-09", undefined, undefined, 70, 13, 2, "BB+", "dirham", 165, 45, [60, 10, 4, 0, 3, 14, 6, 0, 3], 3.5, 0.9, 0.4, "liberal:28*,conservative:22*,islamist:15,soc_dem:12,centre:23*", "Alaouid-Sabri"),
  NGA: F("presidential", "President", undefined, ["House of Representatives", 360], ["Senate", 109, "all"], "fptp", "2027-02", "2027-02", "2027-02", 40, 5, 22, "B-", "naira", 250, 40, [0, 78, 0, 0, 21, 0, 1, 0, 0], 0.6, 0.9, 0.45, "conservative:52*,soc_dem:30,left:12,regional:6"),
  ZAF: F("parliamentary", "President", "President", ["National Assembly", 400], ["National Council of Provinces", 90, "regions"], "dhondt", "2029-05", undefined, undefined, 76, 32, 4, "BB-", "rand", 430, 230, [82, 2, 0, 4, 1, 6, 5, 0, 0], 0.8, 0.75, 0.75, "soc_dem:40*,liberal:22*,left:15,far_left:10,regional:7*,conservative:6"),
  KEN: F("presidential", "President", undefined, ["National Assembly", 349], ["Senate", 67, "all"], "fptp", "2027-08", "2027-08", "2027-08", 68, 5.7, 5, "B-", "shilling", 130, 13, [0, 0, 10, 0, 22, 18, 3, 45, 2], 1.1, 0.9, 0.55),
  ETH: F("parliamentary", "President", "Prime Minister", ["House of Peoples' Representatives", 547], ["House of Federation", 153, "regions"], "fptp", "2026-06", undefined, undefined, 40, 3.5, 18, "CCC", "birr", 140, 16, [0, 0, 0, 0, 96, 3, 0, 1, 0], 1, 0.9, 0.25, "ruling:85*,regional:15"),
  IND: F("parliamentary", "President", "Prime Minister", ["Lok Sabha", 543], ["Rajya Sabha", 245, "thirds"], "fptp", "2029-05", undefined, "2028-04", 82, 4.9, 3.5, "BBB", "rupee", 4100, 2000, [74, 2, 0, 3, 8, 5, 7, 0, 1], 2.3, 0.85, 0.6, "nationalist:37*,soc_dem:21,regional:24*,left:4,centre:14"),
  PAK: F("parliamentary", "President", "Prime Minister", ["National Assembly", 336], ["Senate", 96, "halves"], "fptp", "2029-02", undefined, "2027-03", 75, 7, 6, "CCC+", "rupee", 380, 140, [17, 30, 6, 18, 27, 2, 1, 0, 1], 2.8, 0.95, 0.35, "conservative:35*,islamist:15,soc_dem:20*,regional:15,centre:15"),
  BGD: F("parliamentary", "President", "Prime Minister", ["Jatiya Sangsad", 350], undefined, "fptp", "2031-02", undefined, undefined, 40, 4.5, 9, "B+", "taka", 470, 95, [12, 63, 20, 0, 1, 0, 2, 0, 0], 1, 0.9, 0.4),
  LKA: F("presidential", "President", "Prime Minister", ["Parliament", 225], undefined, "dhondt", "2029-11", "2029-09", undefined, 100, 4.5, 2, "CCC+", "rupee", 100, 17, [35, 0, 15, 0, 35, 8, 5, 0, 2], 1.8, 0.9, 0.6),
  CHN: F("one_party", "President", "Premier", ["National People's Congress", 2977], undefined, "appointed", undefined, undefined, undefined, 90, 5, 0.5, "A+", "yuan", 19500, 10000, [58, 3, 0, 5, 13, 10, 9, 0, 2], 1.6, 0.2, 0.1, "ruling:100*"),
  TWN: F("semi", "President", "Premier", ["Legislative Yuan", 113], undefined, "mixed", "2028-01", "2028-01", undefined, 28, 3.4, 2, "AA", "dollar", 850, 290, [39, 45, 1, 4, 2, 3, 6, 0, 1], 2.5, 0.4, 0.92, "conservative:45,soc_dem:40*,centre:15"),
  JPN: F("parliamentary", "Emperor", "Prime Minister", ["House of Representatives", 465], ["House of Councillors", 248, "halves"], "mixed", "2030-02", undefined, "2028-07", 235, 2.5, 2.5, "A+", "yen", 4200, 1000, [28, 32, 4, 9, 8, 1, 11, 0.3, 5], 1.4, 0.3, 0.92, "conservative:39*,soc_dem:18,nationalist:14*,liberal:10,christian:7,far_left:6,centre:6", "Yamato"),
  KOR: F("presidential", "President", "Prime Minister", ["National Assembly", 300], undefined, "mixed", "2028-04", "2030-06", undefined, 50, 2.8, 2, "AA", "won", 1800, 600, [30, 28, 1, 31, 1, 1, 6, 0, 2], 2.6, 0.4, 0.85, "soc_dem:57*,conservative:36,liberal:4,left:3"),
  PRK: F("one_party", "Chairman", "Premier", ["Supreme People's Assembly", 687], undefined, "appointed", undefined, undefined, undefined, 100, 3, 10, "D", "won", 25, 25, [40, 0, 0, 0, 60, 0, 0, 0, 0], 25, 0.1, 0.02, "ruling:100*"),
  VNM: F("one_party", "President", "Prime Minister", ["National Assembly", 500], undefined, "appointed", "2031-03", undefined, undefined, 35, 2.2, 3.5, "BB+", "đồng", 500, 300, [50, 8, 0, 0, 30, 3, 9, 0, 0], 2.2, 0.3, 0.15, "ruling:100*"),
  THA: F("const_monarchy", "King", "Prime Minister", ["House of Representatives", 500], ["Senate", 200, "appointed"], "mixed", "2027-03", undefined, undefined, 64, 1, 0.5, "BBB+", "baht", 550, 200, [16, 60, 0, 0, 3, 2, 3, 0, 16], 1.3, 0.8, 0.5, "liberal:38,conservative:30*,nationalist:18*,soc_dem:14", "Chakravan"),
  MYS: F("const_monarchy", "King", "Prime Minister", ["Dewan Rakyat", 222], ["Dewan Negara", 70, "appointed"], "fptp", "2027-12", undefined, undefined, 64, 3.1, 1.5, "A-", "ringgit", 450, 190, [45, 40, 1, 0, 17, 0, 2, 0, 1], 1, 0.85, 0.65),
  SGP: F("parliamentary", "President", "Prime Minister", ["Parliament", 97], undefined, "fptp", "2030-05", "2029-09", undefined, 170, 2, 1.5, "AAA", "dollar", 560, 58, [1, 94, 1, 0, 0, 0, 3, 0, 1], 2.8, 0.6, 0.65),
  IDN: F("presidential", "President", undefined, ["People's Representative Council", 580], ["Regional Representative Council", 152, "all"], "sainte_lague", "2029-02", "2029-02", "2029-02", 40, 4.8, 2, "BBB", "rupiah", 1450, 350, [62, 15, 2, 0, 7, 0, 1, 5, 7], 0.8, 0.95, 0.6, "nationalist:30*,soc_dem:17,conservative:15*,islamist:20*,centre:18*"),
  PHL: F("presidential", "President", undefined, ["House of Representatives", 316], ["Senate", 24, "halves"], "fptp", "2028-05", "2028-05", "2028-05", 60, 4, 2.5, "BBB+", "peso", 500, 120, [62, 14, 2, 0, 8, 1, 2, 10, 1], 1.3, 0.9, 0.55),
  AUS: F("const_monarchy", "King", "Prime Minister", ["House of Representatives", 150], ["Senate", 76, "halves"], "two_round", "2028-05", undefined, "2028-05", 50, 4.2, 3, "AAA", "Australian dollar", 1800, 275, [46, 17, 2, 0, 6, 13, 16, 0, 1], 2.1, 0.4, 0.95, "soc_dem:35*,conservative:32,green:12,nationalist:7,centre:8,agrarian:6", "Windsor-Ashcombe"),
  NZL: F("const_monarchy", "King", "Prime Minister", ["House of Representatives", 123], undefined, "mixed", "2026-11", undefined, undefined, 45, 5.2, 2.5, "AA+", "NZ dollar", 260, 44, [3, 10, 0, 0, 57, 6, 2, 19, 1], 1.1, 0.35, 0.98, "conservative:38*,soc_dem:27,green:12,nationalist:8*,liberal:9*,regional:6", "Windsor-Ashcombe"),
  KAZ: F("presidential", "President", "Prime Minister", ["Mazhilis", 98], ["Senate", 50, "halves"], "dhondt", "2028-03", "2029-11", undefined, 25, 4.7, 9, "BBB-", "tenge", 300, 115, [64, 20, 0, 0, 8, 4, 3, 0, 0], 1, 0.6, 0.25, "ruling:85*,centre:15"),
  UZB: F("presidential", "President", "Prime Minister", ["Legislative Chamber", 150], ["Senate", 100, "regions"], "mixed", "2029-10", "2030-07", undefined, 35, 5.5, 9, "BB", "som", 115, 80, [4, 85, 0, 0, 9, 0, 2, 0, 0], 2, 0.7, 0.15),
  AZE: F("presidential", "President", "Prime Minister", ["National Assembly", 125], undefined, "fptp", "2029-09", "2031-02", undefined, 20, 5.5, 3, "BB+", "manat", 75, 30, [0, 90, 1, 0, 7, 0, 2, 0, 0], 4.6, 0.7, 0.1),
  GEO: F("parliamentary", "President", "Prime Minister", ["Parliament", 150], undefined, "dhondt", "2028-10", "2029-12", undefined, 38, 14, 3, "BB", "lari", 34, 14, [0, 22, 0, 0, 77, 1, 0, 0, 0], 1.7, 0.85, 0.5),
  ARM: F("parliamentary", "President", "Prime Minister", ["National Assembly", 101], undefined, "dhondt", "2026-06", undefined, undefined, 50, 13, 2, "BB-", "dram", 26, 9, [0, 40, 0, 31, 27, 0, 2, 0, 0], 4.5, 0.85, 0.6),
  AFG: F("theocracy", "Supreme Leader", "Prime Minister", ["Leadership Council", 30], undefined, "appointed", undefined, undefined, undefined, 7, 15, 2, "D", "afghani", 17, 1.5, [0, 0, 5, 0, 85, 0, 10, 0, 0], 3, 0.98, 0.02, "ruling:100*"),
  SYR: F("presidential", "President", "Prime Minister", ["People's Assembly", 210], undefined, "appointed", undefined, undefined, undefined, 90, 20, 40, "D", "pound", 20, 18, [0, 60, 35, 0, 5, 0, 0, 0, 0], 4, 0.85, 0.15),
  JOR: F("const_monarchy", "King", "Prime Minister", ["House of Representatives", 138], ["Senate", 69, "appointed"], "mixed", "2028-09", undefined, undefined, 90, 21, 2, "BB-", "dinar", 55, 22, [0, 70, 3, 0, 0, 2, 25, 0, 0], 4.5, 0.9, 0.35, undefined, "Al Hashem"),
  LBN: F("parliamentary", "President", "Prime Minister", ["Parliament", 128], undefined, "mixed", "2030-05", undefined, undefined, 160, 11, 30, "D", "pound", 20, 12, [0, 0, 85, 0, 5, 0, 10, 0, 0], 3, 0.85, 0.45),
  YEM: F("presidential", "Chairman", "Prime Minister", ["House of Representatives", 301], undefined, "appointed", undefined, undefined, undefined, 80, 30, 30, "D", "rial", 16, 5, [0, 10, 80, 0, 0, 0, 10, 0, 0], 4, 0.95, 0.05),
  SDN: F("junta", "Chairman of the Sovereignty Council", "Prime Minister", ["Transitional Legislative Council", 300], undefined, "appointed", undefined, undefined, undefined, 250, 40, 120, "D", "pound", 40, 14, [0, 0, 30, 0, 65, 0, 5, 0, 0], 6, 0.95, 0.05),
  MLI: F("junta", "President of the Transition", "Prime Minister", ["National Transitional Council", 147], undefined, "appointed", undefined, undefined, undefined, 55, 8, 3, "CCC", "CFA franc", 22, 3, [0, 0, 50, 0, 40, 0, 10, 0, 0], 4, 0.95, 0.1),
  BFA: F("junta", "President of the Transition", "Prime Minister", ["Transitional Legislative Assembly", 71], undefined, "appointed", undefined, undefined, undefined, 60, 5, 3, "CCC", "CFA franc", 22, 2, [0, 0, 80, 0, 5, 0, 15, 0, 0], 4, 0.95, 0.1),
  NER: F("junta", "President of the Transition", "Prime Minister", ["Consultative Council", 70], undefined, "appointed", undefined, undefined, undefined, 50, 3, 4, "CCC", "CFA franc", 18, 1, [50, 0, 40, 0, 0, 0, 10, 0, 0], 3, 0.95, 0.1),
  MMR: F("junta", "Chairman of the State Council", "Prime Minister", ["Pyidaungsu Hluttaw", 664], undefined, "fptp", undefined, undefined, undefined, 60, 4, 25, "D", "kyat", 65, 22, [5, 40, 0, 0, 55, 0, 0, 0, 0], 3.5, 0.9, 0.1),
};

/* ------------------------------------------------------------------ defaults */

const REGIONAL_MIX: Record<string, Facts["mix"]> = {
  Africa: [10, 25, 25, 0, 30, 2, 4, 2, 2],
  Asia: [35, 30, 10, 2, 15, 2, 4, 1, 1],
  Europe: [15, 20, 2, 15, 20, 15, 8, 0, 5],
  "North America": [5, 35, 20, 0, 30, 4, 4, 1, 1],
  "South America": [3, 20, 10, 0, 55, 6, 4, 0, 2],
  Oceania: [5, 15, 40, 0, 30, 2, 6, 1, 1],
};

/** Facts for a country that isn't written out, from what the map knows. */
export function defaultFacts(iso: string, continent: string, gdpPerHead: number, regime: string | undefined): Facts {
  const rich = gdpPerHead > 25000;
  const mid = gdpPerHead > 6000;
  const form: Form = regime === "communism" ? "one_party" : regime === "theocracy" ? "theocracy" : regime === "monarchy" ? "abs_monarchy" : regime === "authoritarian" ? "presidential" : continent === "Europe" ? "parliamentary" : "presidential";
  const free = regime === "authoritarian" || regime === "communism" || regime === "theocracy" || regime === "monarchy" ? 0.15 : rich ? 0.9 : mid ? 0.65 : 0.45;
  const hos = form === "abs_monarchy" ? "King" : form === "one_party" ? "General Secretary" : form === "theocracy" ? "Supreme Leader" : "President";
  const rating = rich ? "AA" : mid ? "BB+" : "B-";
  return {
    form,
    hos,
    hog: form === "parliamentary" ? "Prime Minister" : undefined,
    lower: [form === "abs_monarchy" ? "Consultative Council" : "National Assembly", 0],
    system: free < 0.3 ? "appointed" : continent === "Europe" || continent === "South America" ? "dhondt" : "fptp",
    debt: rich ? 60 : mid ? 55 : 50,
    unemp: rich ? 5 : mid ? 7 : 9,
    infl: rich ? 2.5 : mid ? 4 : 7,
    rating,
    currency: "",
    mix: REGIONAL_MIX[continent] ?? REGIONAL_MIX.Asia,
    mil: free < 0.3 ? 3 : 1.5,
    relig: rich ? 0.4 : 0.85,
    free,
  };
}

/** A party list when the facts don't give one. */
export function defaultParties(free: number, relig: number, continent: string): [Family, number, boolean][] {
  if (free < 0.3) return [["ruling", 80, true], ["centre", 12, false], ["liberal", 8, false]];
  const out: [Family, number, boolean][] = [
    ["soc_dem", 26, false],
    ["conservative", 28, true],
    ["liberal", 12, false],
    [relig > 0.7 ? (continent === "Africa" || continent === "Asia" ? "islamist" : "christian") : "green", 10, false],
    ["nationalist", 12, false],
    ["left", 7, false],
    [continent === "Africa" || continent === "Asia" ? "regional" : "centre", 5, false],
  ];
  return out;
}

/** Parse a facts party string ("soc_dem:34*,liberal:12"). */
export function parseParties(s: string): [Family, number, boolean][] {
  return s.split(",").map((p) => {
    const [f, rest] = p.split(":");
    return [f as Family, parseFloat(rest), rest.endsWith("*")];
  });
}

/** Rating ladder, best first. */
export const RATINGS = ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+", "B", "B-", "CCC+", "CCC", "CC", "C", "D"];

/** Claims at the start: who claims whose city (by city name). */
export const CLAIMS: [string, string, string[]][] = [
  ["RUS", "UKR", ["Donetsk", "Kharkiv", "Odessa", "Dnipro"]],
  ["UKR", "RUS", ["Sevastapol"]],
  ["CHN", "TWN", ["Taipei", "Kaohsiung", "Taichung", "Hsinchu", "Chiayi", "Hualien", "Taitung"]],
  ["PAK", "IND", ["Srinagar"]],
  ["IND", "PAK", ["Muzaffarabad", "Gilgit"]],
  ["VEN", "GUY", ["Georgetown"]],
  ["ARG", "GBR", ["Stanley"]],
  ["MAR", "ESH", ["Laayoune", "Dakhla"]],
  ["AZE", "ARM", []],
  ["SRB", "KOS", ["Pristina"]],
  ["ETH", "ERI", ["Assab"]],
  ["CHN", "IND", ["Itanagar"]],
  ["KOR", "PRK", ["Pyongyang"]],
  ["PRK", "KOR", ["Seoul"]],
];

/** Regions that want to go their own way (city names). */
export const SEPARATISTS: [string, string, number][] = [
  ["ESP", "Barcelona", 0.45], ["GBR", "Glasgow", 0.48], ["GBR", "Belfast", 0.4], ["CAN", "Montreal", 0.36], ["BEL", "Antwerp", 0.3], ["ITA", "Venice", 0.2],
  ["IRQ", "Erbil", 0.85], ["TUR", "Diyarbakir", 0.45], ["IRN", "Tabriz", 0.2], ["CHN", "Urumqi", 0.6], ["CHN", "Lhasa", 0.7], ["IND", "Srinagar", 0.6],
  ["RUS", "Grozny", 0.35], ["ETH", "Mekele", 0.65], ["NGA", "Enugu", 0.4], ["COD", "Lubumbashi", 0.3], ["IDN", "Jayapura", 0.6], ["PHL", "Cotabato", 0.4],
  ["MMR", "Myitkyina", 0.6], ["MLI", "Gao", 0.55], ["SOM", "Hargeysa", 0.8], ["FRA", "Ajaccio", 0.25], ["FRA", "Noumea", 0.45], ["DNK", "Nuuk", 0.6],
  ["PNG", "Arawa", 0.8], ["SDN", "Niyala", 0.5], ["LBY", "Benghazi", 0.35], ["UKR", "Simferopol", 0.2], ["GEO", "Sukhumi", 0.8], ["MDA", "Tiraspol", 0.7],
];
