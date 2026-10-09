/**
 * Twelve real countries, as they stood going into 2026: their parties (with approximate vote
 * shares nationally and region by region, from their most recent national elections), how
 * their legislatures are elected, their heads of government, their upper houses, election
 * calendars, titles, economies and some of the laws in force.
 *
 * The numbers are rounded and simplified for a game; the politicians you meet in YourGov are
 * all made up.
 */
import type { Culture } from "./names";
import type { Economy, PartyDef, Scenario, SystemDef } from "./scenario";

/** Turn a table of shares by region into each party's `regional` map. */
function byRegion(parties: PartyDef[], table: Record<string, Record<string, number>>) {
  for (const [region, row] of Object.entries(table))
    for (const [id, share] of Object.entries(row)) {
      const p = parties.find((x) => x.id === id);
      if (p) (p.regional ??= {})[region] = share;
    }
  return parties;
}

const P = (id: string, name: string, short: string, color: string, e: number, s: number, ideology: string, base: number, more: Partial<PartyDef> = {}): PartyDef => ({ id, name, short, color, pos: { e, s }, ideology, base, ...more });

interface Preset {
  code: string;
  name: string;
  about: string;
  culture: Culture;
  pops: Record<string, number>;
  counties?: number;
  parties: PartyDef[];
  system: SystemDef;
  economy: Economy;
  laws: Record<string, number>;
  start?: Scenario["start"];
}

const scenario = (p: Preset): Scenario => ({
  v: 1,
  id: p.code,
  name: p.name,
  about: p.about,
  flag: p.code,
  culture: p.culture,
  startYear: 2026,
  map: { kind: "real", code: p.code, counties: p.counties ?? 1000, pops: p.pops },
  parties: p.parties,
  system: p.system,
  economy: p.economy,
  laws: p.laws,
  start: p.start,
});

// ------------------------------------------------------------------ United States

const US_MARGIN: Record<string, number> = {
  alabama: -30.5, alaska: -13.1, arizona: -5.5, arkansas: -30.6, california: 20.2, colorado: 11, connecticut: 14.5, delaware: 14.7, "district-of-columbia": 83.8, florida: -13.1, georgia: -2.2, hawaii: 23.1, idaho: -36.5, illinois: 10.9, indiana: -19, iowa: -13.2, kansas: -16.1, kentucky: -30.5, louisiana: -22, maine: 6.9, maryland: 28.5, massachusetts: 25.2, michigan: -1.4, minnesota: 4.2, mississippi: -22.9, missouri: -18.4, montana: -19.9, nebraska: -20.5, nevada: -3.1, "new-hampshire": 2.8, "new-jersey": 5.9, "new-mexico": 6, "new-york": 12.6, "north-carolina": -3.2, "north-dakota": -36.5, ohio: -11.2, oklahoma: -34.3, oregon: 14.3, pennsylvania: -1.7, "rhode-island": 13.8, "south-carolina": -17.8, "south-dakota": -29.2, tennessee: -29.7, texas: -13.7, utah: -21.6, vermont: 32.3, virginia: 5.8, washington: 18.2, "west-virginia": -41.9, wisconsin: -0.9, wyoming: -45.8,
};

function unitedStates(): Scenario {
  const parties = [
    P("dem", "Democratic Party", "DEM", "#2f6fd6", -0.35, -0.45, "Liberalism", 0.483),
    P("rep", "Republican Party", "GOP", "#d93a3a", 0.5, 0.55, "Conservatism", 0.5),
    P("lbt", "Libertarian Party", "LIB", "#f2c230", 0.85, -0.55, "Libertarianism", 0.01),
    P("grn", "Green Party", "GRN", "#33a852", -0.75, -0.7, "Green politics", 0.008),
  ];
  const table: Record<string, Record<string, number>> = {};
  for (const [k, m] of Object.entries(US_MARGIN)) table[k] = { dem: 0.98 * (0.5 + m / 200), rep: 0.98 * (0.5 - m / 200) };
  byRegion(parties, table);
  return scenario({
    code: "us",
    name: "United States",
    about: "Fifty states and DC. A President, the House, a Senate in thirds, the Electoral College.",
    culture: "en",
    pops: { alabama: 5.16, alaska: 0.74, arizona: 7.58, arkansas: 3.09, california: 39.43, colorado: 5.96, connecticut: 3.68, delaware: 1.05, "district-of-columbia": 0.7, florida: 23.37, georgia: 11.18, hawaii: 1.45, idaho: 2.0, illinois: 12.71, indiana: 6.92, iowa: 3.24, kansas: 2.97, kentucky: 4.59, louisiana: 4.6, maine: 1.41, maryland: 6.26, massachusetts: 7.14, michigan: 10.14, minnesota: 5.79, mississippi: 2.94, missouri: 6.25, montana: 1.14, nebraska: 2.01, nevada: 3.27, "new-hampshire": 1.41, "new-jersey": 9.5, "new-mexico": 2.13, "new-york": 19.87, "north-carolina": 11.05, "north-dakota": 0.8, ohio: 11.88, oklahoma: 4.1, oregon: 4.27, pennsylvania: 13.08, "rhode-island": 1.11, "south-carolina": 5.48, "south-dakota": 0.92, tennessee: 7.23, texas: 31.29, utah: 3.5, vermont: 0.65, virginia: 8.81, washington: 7.96, "west-virginia": 1.77, wisconsin: 5.96, wyoming: 0.59 },
    counties: 1100,
    parties,
    system: {
      exec: "presidential",
      lower: { name: "House of Representatives", short: "House", member: "Representative", seats: 435, system: "fptp", threshold: 0, listShare: 0.5, term: 2, next: 2026, week: 45, fixed: { "district-of-columbia": 0 } },
      upper: { kind: "elected", name: "Senate", short: "Senate", member: "Senator", perRegion: 2, regionSeats: { "district-of-columbia": 0 }, seats: 0, national: 0, method: "plurality", classes: 3, term: 2, next: 2026, week: 45, power: "equal" },
      pres: { term: 4, next: 2028, week: 45, runoff: false, college: true },
      override: 2 / 3,
      regionTerm: 4,
      titles: { head: "President", president: "President", leader: "Party Chair", region: "state", regions: "states", regionHead: "Governor", regionHeads: { "district-of-columbia": "Mayor" }, assent: "the President's signature", election: "General election", midterm: "Midterm elections" },
    },
    economy: { cur: "$", gdp: 29, growth: 2, budget: -1800, debt: 36000, unemployment: 4.2, approval: 44, happiness: 18 },
    laws: { capitalGains: 2, minimumWage: 1, trade: 0, gunPolicy: 2, deathPenalty: 1, marriage: 2, speech: 2, military: 2, campaignFinance: 2, energy: 0, termLimits: 1 },
    start: {
      pres: "rep",
      lower: { rep: 220, dem: 215 },
      upper: { rep: 53, dem: 47 },
      regions: Object.fromEntries(
        [
          ...["alabama", "alaska", "arkansas", "florida", "georgia", "idaho", "indiana", "iowa", "louisiana", "mississippi", "missouri", "montana", "nebraska", "nevada", "new-hampshire", "north-dakota", "ohio", "oklahoma", "south-carolina", "south-dakota", "tennessee", "texas", "utah", "vermont", "west-virginia", "wyoming"].map((k) => [k, "rep"]),
          ...["arizona", "california", "colorado", "connecticut", "delaware", "hawaii", "illinois", "kansas", "kentucky", "maine", "maryland", "massachusetts", "michigan", "minnesota", "new-jersey", "new-mexico", "new-york", "north-carolina", "oregon", "pennsylvania", "rhode-island", "virginia", "washington", "wisconsin", "district-of-columbia"].map((k) => [k, "dem"]),
        ],
      ),
    },
  });
}

// ------------------------------------------------------------------ United Kingdom

function unitedKingdom(): Scenario {
  const gb = ["north-east", "north-west", "yorkshire-and-the-humber", "east-midlands", "west-midlands", "east-of-england", "london", "south-east", "south-west", "wales", "scotland"];
  const parties = byRegion(
    [
      P("lab", "Labour Party", "LAB", "#e4003b", -0.35, -0.2, "Social democracy", 0.337, { only: gb }),
      P("con", "Conservative Party", "CON", "#0087dc", 0.45, 0.35, "Conservatism", 0.237, { only: gb }),
      P("ref", "Reform UK", "REF", "#12b6cf", 0.45, 0.8, "Right-wing populism", 0.143, { only: gb, refuses: ["lab", "ld", "grn", "snp", "pc", "sf"] }),
      P("ld", "Liberal Democrats", "LD", "#faa61a", 0, -0.5, "Liberalism", 0.122, { only: gb, refuses: ["ref"] }),
      P("grn", "Green Party", "GRN", "#02a95b", -0.65, -0.75, "Green politics", 0.067, { only: gb, refuses: ["ref", "con"] }),
      P("snp", "Scottish National Party", "SNP", "#e8d23a", -0.3, -0.35, "Scottish independence", 0.025, { only: ["scotland"], refuses: ["con", "ref"] }),
      P("pc", "Plaid Cymru", "PC", "#005b54", -0.35, -0.3, "Welsh independence", 0.007, { only: ["wales"], refuses: ["con", "ref"] }),
      P("sf", "Sinn Féin", "SF", "#326760", -0.45, -0.1, "Irish republicanism", 0.007, { only: ["northern-ireland"] }),
      P("dup", "Democratic Unionist Party", "DUP", "#d46a4c", 0.2, 0.75, "Unionism", 0.006, { only: ["northern-ireland"] }),
      P("cb", "Crossbench and independents", "XB", "#9aa0a8", 0, 0, "Non-party members", 0, { noRun: true }),
    ],
    {
      "north-east": { lab: 0.4, con: 0.17, ref: 0.21, ld: 0.06, grn: 0.06 },
      "north-west": { lab: 0.41, con: 0.2, ref: 0.15, ld: 0.08, grn: 0.06 },
      "yorkshire-and-the-humber": { lab: 0.37, con: 0.21, ref: 0.17, ld: 0.08, grn: 0.07 },
      "east-midlands": { lab: 0.35, con: 0.28, ref: 0.17, ld: 0.07, grn: 0.06 },
      "west-midlands": { lab: 0.36, con: 0.27, ref: 0.17, ld: 0.07, grn: 0.07 },
      "east-of-england": { lab: 0.27, con: 0.3, ref: 0.17, ld: 0.13, grn: 0.07 },
      london: { lab: 0.43, con: 0.2, ref: 0.09, ld: 0.11, grn: 0.1 },
      "south-east": { lab: 0.23, con: 0.3, ref: 0.14, ld: 0.2, grn: 0.08 },
      "south-west": { lab: 0.23, con: 0.29, ref: 0.15, ld: 0.21, grn: 0.08 },
      wales: { lab: 0.37, con: 0.18, ref: 0.17, ld: 0.07, grn: 0.05, pc: 0.15 },
      scotland: { lab: 0.35, con: 0.13, ref: 0.07, ld: 0.1, grn: 0.04, snp: 0.3 },
      "northern-ireland": { sf: 0.27, dup: 0.22 },
    },
  );
  return scenario({
    code: "gb",
    name: "United Kingdom",
    about: "Westminster: 650 seats won first past the post, the Lords, devolved nations.",
    culture: "en",
    pops: { "north-east": 2.68, "north-west": 7.52, "yorkshire-and-the-humber": 5.54, "east-midlands": 4.94, "west-midlands": 6.02, "east-of-england": 6.4, london: 8.87, "south-east": 9.38, "south-west": 5.76, wales: 3.13, scotland: 5.45, "northern-ireland": 1.91 },
    counties: 1150,
    parties,
    system: {
      exec: "parliamentary",
      lower: { name: "House of Commons", short: "Commons", member: "MP", seats: 650, system: "fptp", threshold: 0, listShare: 0.5, term: 5, next: 2029, week: 18, fixed: { scotland: 57, wales: 32, "northern-ireland": 18 } },
      upper: { kind: "appointed", name: "House of Lords", short: "Lords", member: "Peer", perRegion: 0, seats: 780, national: 0, method: "pr", classes: 1, term: 5, next: 2029, week: 18, power: "weak", makeup: { con: 272, lab: 214, ld: 77, cb: 212, grn: 2, dup: 3 } },
      pres: null,
      override: 0.5,
      regionTerm: 4,
      layout: "westminster",
      titles: { head: "Prime Minister", president: "Monarch", leader: "Leader", region: "nation or region", regions: "nations and regions", regionHead: "Mayor", regionHeads: { scotland: "First Minister", wales: "First Minister", "northern-ireland": "First Minister" }, assent: "Royal Assent", election: "General election", midterm: "General election" },
    },
    economy: { cur: "£", gdp: 2.9, growth: 1.1, budget: -130, debt: 2800, unemployment: 4.8, approval: 30, happiness: 16 },
    laws: { corporateTax: 4, salesTax: 4, capitalGains: 2, healthcare: 2, gunPolicy: 0, church: 0, carbonTax: 1, termLimits: 2 },
    start: { gov: ["lab"], lower: { lab: 411, con: 121, ld: 72, snp: 9, sf: 7, ref: 5, dup: 5, grn: 4, pc: 4, cb: 12 } },
  });
}

// ------------------------------------------------------------------ Canada

function canada(): Scenario {
  const parties = byRegion(
    [
      P("lib", "Liberal Party", "LPC", "#d71920", -0.15, -0.4, "Liberalism", 0.438),
      P("cpc", "Conservative Party", "CPC", "#1a4782", 0.5, 0.4, "Conservatism", 0.413, { refuses: ["ndp", "bq"] }),
      P("ndp", "New Democratic Party", "NDP", "#f37021", -0.55, -0.45, "Social democracy", 0.063, { refuses: ["cpc"] }),
      P("bq", "Bloc Québécois", "BQ", "#33b2cc", -0.2, -0.2, "Quebec sovereignty", 0.063, { only: ["quebec"] }),
      P("gpc", "Green Party", "GPC", "#3d9b35", -0.55, -0.7, "Green politics", 0.012),
      P("isg", "Independent Senators", "ISG", "#9aa0a8", 0, 0, "Non-partisan senators", 0, { noRun: true }),
    ],
    {
      alberta: { lib: 0.28, cpc: 0.64, ndp: 0.05 },
      saskatchewan: { lib: 0.26, cpc: 0.65, ndp: 0.07 },
      manitoba: { lib: 0.41, cpc: 0.46, ndp: 0.12 },
      "british-columbia": { lib: 0.42, cpc: 0.41, ndp: 0.13, gpc: 0.03 },
      ontario: { lib: 0.49, cpc: 0.44, ndp: 0.05 },
      quebec: { lib: 0.43, cpc: 0.23, ndp: 0.04, bq: 0.28 },
      "new-brunswick": { lib: 0.55, cpc: 0.38, ndp: 0.03 },
      "nova-scotia": { lib: 0.57, cpc: 0.36, ndp: 0.05 },
      "prince-edward-island": { lib: 0.6, cpc: 0.34, ndp: 0.02 },
      "newfoundland-and-labrador": { lib: 0.54, cpc: 0.39, ndp: 0.06 },
      yukon: { lib: 0.53, cpc: 0.37, ndp: 0.07 },
      "northwest-territories": { lib: 0.54, cpc: 0.32, ndp: 0.12 },
      nunavut: { lib: 0.38, cpc: 0.25, ndp: 0.37 },
    },
  );
  return scenario({
    code: "ca",
    name: "Canada",
    about: "Ten provinces and three territories. 343 seats, an appointed Senate, a Prime Minister.",
    culture: "en",
    pops: { ontario: 16.1, quebec: 9.0, "british-columbia": 5.7, alberta: 4.9, manitoba: 1.5, saskatchewan: 1.24, "nova-scotia": 1.08, "new-brunswick": 0.85, "newfoundland-and-labrador": 0.54, "prince-edward-island": 0.18, "northwest-territories": 0.045, yukon: 0.047, nunavut: 0.041 },
    parties,
    system: {
      exec: "parliamentary",
      lower: { name: "House of Commons", short: "Commons", member: "MP", seats: 343, system: "fptp", threshold: 0, listShare: 0.5, term: 4, next: 2029, week: 42, fixed: { "prince-edward-island": 4, yukon: 1, nunavut: 1, "northwest-territories": 1, "new-brunswick": 10, "newfoundland-and-labrador": 7 } },
      upper: { kind: "appointed", name: "Senate", short: "Senate", member: "Senator", perRegion: 0, seats: 105, national: 0, method: "pr", classes: 1, term: 4, next: 2029, week: 42, power: "weak", makeup: { isg: 93, cpc: 12 }, nonpartisan: true },
      pres: null,
      override: 0.5,
      regionTerm: 4,
      layout: "westminster",
      titles: { head: "Prime Minister", president: "Monarch", leader: "Leader", region: "province", regions: "provinces and territories", regionHead: "Premier", assent: "Royal Assent", election: "Federal election", midterm: "Federal election" },
    },
    economy: { cur: "C$", gdp: 3.1, growth: 1.2, budget: -45, debt: 1250, unemployment: 6.9, approval: 48, happiness: 19 },
    laws: { incomeTax: 4, corporateTax: 4, salesTax: 3, capitalGains: 2, minimumWage: 3, healthcare: 2, drugPolicy: 2, carbonTax: 1, termLimits: 2 },
    start: { gov: ["lib"], lower: { lib: 169, cpc: 144, bq: 22, ndp: 7, gpc: 1 } },
  });
}

// ------------------------------------------------------------------ Australia

function australia(): Scenario {
  const parties = byRegion(
    [
      P("alp", "Australian Labor Party", "ALP", "#e13940", -0.3, -0.25, "Social democracy", 0.346),
      P("lib", "Liberal Party", "LIB", "#1c4f9c", 0.45, 0.25, "Liberal conservatism", 0.275, { bloc: "coalition" }),
      P("nat", "National Party", "NAT", "#006644", 0.3, 0.55, "Agrarianism", 0.04, { bloc: "coalition", only: ["new-south-wales", "victoria", "western-australia", "queensland"] }),
      P("grn", "Australian Greens", "GRN", "#10c25b", -0.65, -0.75, "Green politics", 0.122, { refuses: ["lib", "nat", "onp"] }),
      P("onp", "One Nation", "ONP", "#f36c21", 0.3, 0.85, "Right-wing populism", 0.064, { refuses: ["alp", "grn"] }),
      P("ind", "Independents and minor parties", "IND", "#00a19c", -0.05, -0.45, "Independents", 0.12, { others: true }),
    ],
    {
      "new-south-wales": { alp: 0.35, lib: 0.25, nat: 0.08, grn: 0.11 },
      victoria: { alp: 0.33, lib: 0.27, nat: 0.06, grn: 0.13 },
      queensland: { alp: 0.3, lib: 0.35, grn: 0.1, onp: 0.08 },
      "western-australia": { alp: 0.37, lib: 0.29, nat: 0.04, onp: 0.06 },
      "south-australia": { alp: 0.4, lib: 0.27, grn: 0.11 },
      tasmania: { alp: 0.38, lib: 0.25, grn: 0.16 },
      "australian-capital-territory": { alp: 0.43, lib: 0.25, grn: 0.19 },
      "northern-territory": { alp: 0.37, lib: 0.3, grn: 0.11 },
    },
  );
  return scenario({
    code: "au",
    name: "Australia",
    about: "Preferential voting for the House, a powerful elected Senate, compulsory voting.",
    culture: "en",
    pops: { "new-south-wales": 8.5, victoria: 7.0, queensland: 5.6, "western-australia": 3.0, "south-australia": 1.9, tasmania: 0.58, "australian-capital-territory": 0.47, "northern-territory": 0.25 },
    counties: 800,
    parties,
    system: {
      exec: "parliamentary",
      lower: { name: "House of Representatives", short: "House", member: "MP", seats: 150, system: "irv", threshold: 0, listShare: 0.5, term: 3, next: 2028, week: 18, fixed: { tasmania: 5, "australian-capital-territory": 3, "northern-territory": 2 } },
      upper: { kind: "elected", name: "Senate", short: "Senate", member: "Senator", perRegion: 12, regionSeats: { "australian-capital-territory": 2, "northern-territory": 2 }, seats: 0, national: 0, method: "pr", classes: 2, term: 3, next: 2028, week: 18, power: "equal" },
      pres: null,
      override: 0.5,
      compulsory: true,
      regionTerm: 4,
      layout: "westminster",
      titles: { head: "Prime Minister", president: "Monarch", leader: "Leader", region: "state", regions: "states and territories", regionHead: "Premier", regionHeads: { "australian-capital-territory": "Chief Minister", "northern-territory": "Chief Minister" }, assent: "Royal Assent", election: "Federal election", midterm: "Federal election" },
    },
    economy: { cur: "A$", gdp: 2.7, growth: 1.6, budget: -30, debt: 940, unemployment: 4.2, approval: 50, happiness: 21 },
    laws: { incomeTax: 4, corporateTax: 5, salesTax: 3, capitalGains: 2, minimumWage: 4, healthcare: 2, gunPolicy: 0, termLimits: 2 },
    start: {
      gov: ["alp"],
      lower: { alp: 94, lib: 25, nat: 18, grn: 1, ind: 12 },
      upper: { alp: 29, lib: 21, nat: 6, grn: 11, onp: 4, ind: 5 },
      regions: { "new-south-wales": "alp", victoria: "alp", queensland: "lib", "western-australia": "alp", "south-australia": "alp", tasmania: "lib", "australian-capital-territory": "alp", "northern-territory": "lib" },
    },
  });
}

// ------------------------------------------------------------------ Germany

function germany(): Scenario {
  const parties = byRegion(
    [
      P("cdu", "CDU/CSU", "UNION", "#2f2f36", 0.35, 0.35, "Christian democracy", 0.285, { refuses: ["afd", "lnk"] }),
      P("afd", "Alternative for Germany", "AfD", "#009ee0", 0.35, 0.85, "Right-wing populism", 0.208, { refuses: ["lnk", "grn"] }),
      P("spd", "Social Democratic Party", "SPD", "#e3000f", -0.3, -0.2, "Social democracy", 0.164, { refuses: ["afd"] }),
      P("grn", "Alliance 90/The Greens", "GRÜNE", "#46962b", -0.35, -0.7, "Green politics", 0.116, { refuses: ["afd", "bsw"] }),
      P("lnk", "The Left", "LINKE", "#be3075", -0.75, -0.5, "Democratic socialism", 0.088, { refuses: ["afd", "cdu", "fdp"] }),
      P("bsw", "Sahra Wagenknecht Alliance", "BSW", "#7d254f", -0.5, 0.35, "Left-wing populism", 0.05, { refuses: ["afd", "grn"] }),
      P("fdp", "Free Democratic Party", "FDP", "#f5d000", 0.7, -0.35, "Classical liberalism", 0.043, { refuses: ["afd", "lnk", "bsw"] }),
    ],
    {
      bavaria: { cdu: 0.373, afd: 0.19, spd: 0.118, grn: 0.12, lnk: 0.054, fdp: 0.043, bsw: 0.04 },
      "baden-wurttemberg": { cdu: 0.318, afd: 0.198, spd: 0.14, grn: 0.136, lnk: 0.067, fdp: 0.056 },
      saxony: { afd: 0.375, cdu: 0.197, lnk: 0.113, spd: 0.085, bsw: 0.093, grn: 0.066 },
      thuringia: { afd: 0.386, cdu: 0.182, lnk: 0.153, bsw: 0.09, spd: 0.081 },
      "saxony-anhalt": { afd: 0.372, cdu: 0.194, lnk: 0.107, spd: 0.113, bsw: 0.08 },
      brandenburg: { afd: 0.32, cdu: 0.181, spd: 0.149, lnk: 0.108, bsw: 0.107 },
      "mecklenburg-western-pomerania": { afd: 0.35, cdu: 0.176, spd: 0.127, lnk: 0.13, bsw: 0.1 },
      berlin: { lnk: 0.199, cdu: 0.183, afd: 0.152, grn: 0.168, spd: 0.151, bsw: 0.066 },
      hamburg: { spd: 0.227, cdu: 0.204, grn: 0.192, lnk: 0.14, afd: 0.109 },
      "free-hanseatic-bremen": { spd: 0.25, cdu: 0.207, grn: 0.17, lnk: 0.15, afd: 0.15 },
      "north-rhine-westphalia": { cdu: 0.3, spd: 0.201, afd: 0.168, grn: 0.121, lnk: 0.076 },
      "lower-saxony": { cdu: 0.28, spd: 0.224, afd: 0.181, grn: 0.117, lnk: 0.071 },
      hesse: { cdu: 0.292, afd: 0.179, spd: 0.166, grn: 0.124, lnk: 0.076 },
      saarland: { cdu: 0.29, spd: 0.225, afd: 0.216, lnk: 0.06 },
      "rhineland-palatinate": { cdu: 0.31, afd: 0.2, spd: 0.17, grn: 0.09 },
      "schleswig-holstein": { cdu: 0.292, spd: 0.177, afd: 0.162, grn: 0.143, lnk: 0.075 },
    },
  );
  return scenario({
    code: "de",
    name: "Germany",
    about: "Sixteen Länder. A Bundestag by mixed-member proportional vote, the Bundesrat, a Chancellor.",
    culture: "de",
    pops: { "north-rhine-westphalia": 18.1, bavaria: 13.4, "baden-wurttemberg": 11.3, "lower-saxony": 8.1, hesse: 6.4, saxony: 4.1, "rhineland-palatinate": 4.2, berlin: 3.9, "schleswig-holstein": 2.97, brandenburg: 2.57, "saxony-anhalt": 2.15, thuringia: 2.1, hamburg: 1.9, "mecklenburg-western-pomerania": 1.6, saarland: 0.99, "free-hanseatic-bremen": 0.68 },
    parties,
    system: {
      exec: "parliamentary",
      lower: { name: "Bundestag", short: "Bundestag", member: "MdB", seats: 630, system: "mmp", threshold: 0.05, listShare: 0.525, term: 4, next: 2029, week: 9 },
      upper: { kind: "council", name: "Bundesrat", short: "Bundesrat", member: "Bundesrat member", perRegion: 0, regionSeats: { "baden-wurttemberg": 6, bavaria: 6, berlin: 4, brandenburg: 4, "free-hanseatic-bremen": 3, hamburg: 3, hesse: 5, "mecklenburg-western-pomerania": 3, "lower-saxony": 6, "north-rhine-westphalia": 6, "rhineland-palatinate": 4, saarland: 3, saxony: 4, "saxony-anhalt": 4, "schleswig-holstein": 4, thuringia: 4 }, seats: 0, national: 0, method: "plurality", classes: 1, term: 4, next: 2029, week: 9, power: "weak" },
      pres: null,
      override: 0.5,
      regionTerm: 5,
      titles: { head: "Chancellor", president: "Federal President", leader: "Chair", region: "state", regions: "states", regionHead: "Minister-President", regionHeads: { berlin: "Governing Mayor", hamburg: "First Mayor", "free-hanseatic-bremen": "Mayor" }, assent: "the Federal President's signature", election: "Federal election", midterm: "Federal election" },
    },
    economy: { cur: "€", gdp: 4.4, growth: 0.2, budget: -90, debt: 2700, unemployment: 3.6, approval: 30, happiness: 16 },
    laws: { incomeTax: 4, corporateTax: 5, salesTax: 4, capitalGains: 2, healthcare: 2, education: 2, unions: 2, drugPolicy: 1, carbonTax: 1, termLimits: 2 },
    start: {
      gov: ["cdu", "spd"],
      lower: { cdu: 208, afd: 152, spd: 121, grn: 85, lnk: 64 },
      regions: { "baden-wurttemberg": "grn", bavaria: "cdu", berlin: "cdu", brandenburg: "spd", "free-hanseatic-bremen": "spd", hamburg: "spd", hesse: "cdu", "mecklenburg-western-pomerania": "spd", "lower-saxony": "spd", "north-rhine-westphalia": "cdu", "rhineland-palatinate": "spd", saarland: "spd", saxony: "cdu", "saxony-anhalt": "cdu", "schleswig-holstein": "cdu", thuringia: "cdu" },
    },
  });
}

// ------------------------------------------------------------------ France

function france(): Scenario {
  const parties = byRegion(
    [
      P("rn", "National Rally", "RN", "#0d378a", 0.1, 0.8, "Nationalism", 0.33, { refuses: ["lfi", "ps", "eco", "ren"] }),
      P("lfi", "France Unbowed", "LFI", "#cc2443", -0.8, -0.45, "Democratic socialism", 0.11, { bloc: "nfp", refuses: ["rn", "lr", "ren"] }),
      P("ps", "Socialist Party", "PS", "#ff8080", -0.35, -0.35, "Social democracy", 0.09, { bloc: "nfp", refuses: ["rn"] }),
      P("eco", "The Ecologists", "ECO", "#00a650", -0.45, -0.7, "Green politics", 0.055, { bloc: "nfp", refuses: ["rn"] }),
      P("ren", "Renaissance", "REN", "#f5a623", 0.3, -0.3, "Liberalism", 0.21, { refuses: ["rn", "lfi"] }),
      P("lr", "The Republicans", "LR", "#0066cc", 0.5, 0.45, "Gaullism", 0.1, { refuses: ["lfi", "rn"] }),
    ],
    {
      "hauts-de-france": { rn: 0.42, ren: 0.18 },
      "grand-est": { rn: 0.4, ren: 0.19 },
      "provence-alpes-cote-d-azur": { rn: 0.4, ren: 0.19, lr: 0.11 },
      occitanie: { rn: 0.37, lfi: 0.15 },
      "bourgogne-franche-comte": { rn: 0.38 },
      "centre-val-de-loire": { rn: 0.37 },
      normandie: { rn: 0.37 },
      "auvergne-rhone-alpes": { rn: 0.31, lr: 0.12 },
      "nouvelle-aquitaine": { rn: 0.33 },
      "ile-de-france": { rn: 0.19, lfi: 0.2, ps: 0.11, eco: 0.07, ren: 0.25 },
      bretagne: { rn: 0.25, ren: 0.27, ps: 0.13 },
      "pays-de-la-loire": { rn: 0.27, ren: 0.27 },
      corse: { rn: 0.35, lr: 0.15 },
    },
  );
  return scenario({
    code: "fr",
    name: "France",
    about: "Thirteen regions. An elected President, two-round legislative elections, a Prime Minister.",
    culture: "fr",
    pops: { "ile-de-france": 12.3, "auvergne-rhone-alpes": 8.1, "hauts-de-france": 6.0, "nouvelle-aquitaine": 6.1, occitanie: 6.1, "grand-est": 5.6, "provence-alpes-cote-d-azur": 5.1, "pays-de-la-loire": 3.9, bretagne: 3.4, normandie: 3.3, "bourgogne-franche-comte": 2.8, "centre-val-de-loire": 2.6, corse: 0.35 },
    counties: 1100,
    parties,
    system: {
      exec: "semi",
      lower: { name: "National Assembly", short: "Assembly", member: "Deputy", seats: 577, system: "two-round", threshold: 0, listShare: 0.5, term: 5, next: 2029, week: 25 },
      upper: { kind: "indirect", name: "Senate", short: "Senate", member: "Senator", perRegion: 0, seats: 348, national: 0, method: "pr", classes: 2, term: 3, next: 2026, week: 39, power: "weak", makeup: { lr: 130, ren: 116, ps: 64, eco: 16, lfi: 18, rn: 4 } },
      pres: { term: 5, next: 2027, week: 16, runoff: true, college: false },
      override: 0.5,
      regionTerm: 6,
      titles: { head: "Prime Minister", president: "President", leader: "Leader", region: "region", regions: "regions", regionHead: "Regional President", assent: "the President's promulgation", election: "Legislative election", midterm: "Legislative election" },
    },
    economy: { cur: "€", gdp: 2.95, growth: 0.8, budget: -165, debt: 3350, unemployment: 7.5, approval: 25, happiness: 14 },
    laws: { incomeTax: 4, corporateTax: 4, salesTax: 4, capitalGains: 3, healthcare: 2, education: 2, pensions: 2, church: 2, unions: 2, carbonTax: 1, termLimits: 1 },
    start: { pres: "ren", gov: ["ren", "lr"], lower: { rn: 142, lfi: 88, ps: 66, eco: 38, ren: 166, lr: 77 } },
  });
}

// ------------------------------------------------------------------ Spain

function spain(): Scenario {
  const parties = byRegion(
    [
      P("pp", "People's Party", "PP", "#0056a8", 0.45, 0.4, "Conservatism", 0.331, { refuses: ["bildu", "sumar", "erc"] }),
      P("psoe", "Spanish Socialist Workers' Party", "PSOE", "#e30613", -0.3, -0.35, "Social democracy", 0.317, { refuses: ["vox"] }),
      P("vox", "Vox", "VOX", "#63be21", 0.4, 0.85, "Right-wing populism", 0.124, { refuses: ["psoe", "sumar", "erc", "junts", "bildu", "pnv", "bng"] }),
      P("sumar", "Sumar", "SUMAR", "#e5007d", -0.65, -0.65, "Left-wing", 0.123, { refuses: ["vox", "pp"] }),
      P("erc", "Republican Left of Catalonia", "ERC", "#ffb232", -0.4, -0.4, "Catalan independence", 0.019, { only: ["catalonia"] }),
      P("junts", "Junts per Catalunya", "JUNTS", "#00c3b2", 0.2, 0.1, "Catalan independence", 0.016, { only: ["catalonia"] }),
      P("bildu", "EH Bildu", "BILDU", "#a6c92a", -0.6, -0.4, "Basque independence", 0.014, { only: ["basque-country", "navarre"] }),
      P("pnv", "Basque Nationalist Party", "PNV", "#008000", 0.15, 0.2, "Basque nationalism", 0.011, { only: ["basque-country"] }),
      P("bng", "Galician Nationalist Bloc", "BNG", "#76b4e3", -0.5, -0.3, "Galician nationalism", 0.006, { only: ["galicia"] }),
      P("cc", "Canarian Coalition", "CC", "#ffd700", 0.1, 0.1, "Canarian nationalism", 0.005, { only: ["canary-islands"] }),
    ],
    {
      madrid: { pp: 0.4, psoe: 0.27, vox: 0.14, sumar: 0.14 },
      andalusia: { pp: 0.36, psoe: 0.32, vox: 0.15, sumar: 0.11 },
      catalonia: { psoe: 0.34, pp: 0.13, vox: 0.08, sumar: 0.14, erc: 0.13, junts: 0.11 },
      "basque-country": { psoe: 0.25, pp: 0.11, sumar: 0.12, vox: 0.03, bildu: 0.24, pnv: 0.24 },
      galicia: { pp: 0.44, psoe: 0.3, sumar: 0.1, vox: 0.05, bng: 0.1 },
      valencia: { pp: 0.36, psoe: 0.3, vox: 0.15, sumar: 0.15 },
      "castile-and-leon": { pp: 0.43, psoe: 0.3, vox: 0.16, sumar: 0.07 },
      "castilla-la-mancha": { pp: 0.4, psoe: 0.33, vox: 0.18, sumar: 0.06 },
      murcia: { pp: 0.41, psoe: 0.25, vox: 0.21, sumar: 0.09 },
      aragon: { pp: 0.37, psoe: 0.32, vox: 0.15, sumar: 0.1 },
      extremadura: { pp: 0.4, psoe: 0.38, vox: 0.14, sumar: 0.06 },
      "canary-islands": { pp: 0.32, psoe: 0.3, vox: 0.1, sumar: 0.1, cc: 0.11 },
      asturias: { pp: 0.35, psoe: 0.34, vox: 0.12, sumar: 0.14 },
      navarre: { psoe: 0.27, pp: 0.23, sumar: 0.12, vox: 0.06, bildu: 0.17 },
      cantabria: { pp: 0.43, psoe: 0.3, vox: 0.12, sumar: 0.08 },
      "la-rioja": { pp: 0.45, psoe: 0.33, vox: 0.11, sumar: 0.07 },
      "balearic-islands": { pp: 0.36, psoe: 0.31, vox: 0.14, sumar: 0.14 },
    },
  );
  return scenario({
    code: "es",
    name: "Spain",
    about: "Seventeen autonomous communities. Proportional Congress, a weaker Senate, coalition politics.",
    culture: "es",
    pops: { andalusia: 8.6, catalonia: 8.0, madrid: 7.0, valencia: 5.3, galicia: 2.7, "castile-and-leon": 2.4, "basque-country": 2.2, "canary-islands": 2.25, "castilla-la-mancha": 2.1, murcia: 1.57, aragon: 1.35, extremadura: 1.05, "balearic-islands": 1.23, asturias: 1.0, navarre: 0.68, cantabria: 0.59, "la-rioja": 0.32 },
    parties,
    system: {
      exec: "parliamentary",
      lower: { name: "Congress of Deputies", short: "Congress", member: "Deputy", seats: 350, system: "pr", threshold: 0.03, listShare: 0.5, term: 4, next: 2027, week: 30, fixed: { andalusia: 63, catalonia: 48, madrid: 37, valencia: 33, galicia: 23, "castile-and-leon": 31, "basque-country": 18, "canary-islands": 15, "castilla-la-mancha": 21, murcia: 10, aragon: 13, extremadura: 9, "balearic-islands": 8, asturias: 7, navarre: 5, cantabria: 5, "la-rioja": 4 } },
      upper: { kind: "elected", name: "Senate", short: "Senate", member: "Senator", perRegion: 0, regionSeats: { andalusia: 41, catalonia: 24, madrid: 11, valencia: 17, galicia: 19, "castile-and-leon": 39, "basque-country": 15, "canary-islands": 14, "castilla-la-mancha": 22, murcia: 6, aragon: 14, extremadura: 9, "balearic-islands": 7, asturias: 5, navarre: 5, cantabria: 5, "la-rioja": 5 }, seats: 0, national: 0, method: "limited", classes: 1, term: 4, next: 2027, week: 30, power: "weak" },
      pres: null,
      override: 0.5,
      regionTerm: 4,
      titles: { head: "Prime Minister", president: "Monarch", leader: "Leader", region: "community", regions: "communities", regionHead: "President", assent: "Royal Assent", election: "General election", midterm: "General election" },
    },
    economy: { cur: "€", gdp: 1.6, growth: 2.6, budget: -45, debt: 1650, unemployment: 10.5, approval: 38, happiness: 18 },
    laws: { incomeTax: 4, corporateTax: 4, salesTax: 4, capitalGains: 2, minimumWage: 1, healthcare: 2, drugPolicy: 1, termLimits: 2 },
    start: { gov: ["psoe", "sumar"], lower: { pp: 138, psoe: 121, vox: 33, sumar: 31, erc: 7, junts: 7, bildu: 6, pnv: 5, bng: 1, cc: 1 }, upper: { pp: 140, psoe: 88, erc: 7, junts: 4, pnv: 5, bildu: 4, vox: 3, cc: 2, sumar: 5 } },
  });
}

// ------------------------------------------------------------------ Italy

function italy(): Scenario {
  const parties = byRegion(
    [
      P("fdi", "Brothers of Italy", "FdI", "#1f3a8a", 0.3, 0.75, "National conservatism", 0.26, { bloc: "cdx", refuses: ["pd", "m5s", "avs"] }),
      P("pd", "Democratic Party", "PD", "#e3001b", -0.3, -0.35, "Social democracy", 0.19, { bloc: "csx", refuses: ["fdi", "lega"] }),
      P("m5s", "Five Star Movement", "M5S", "#f5c400", -0.3, -0.05, "Populism", 0.154, { refuses: ["fdi", "lega", "fi"] }),
      P("lega", "League", "LEGA", "#1e9e3a", 0.35, 0.8, "Right-wing populism", 0.088, { bloc: "cdx", refuses: ["pd", "avs"] }),
      P("fi", "Forza Italia", "FI", "#2aa5e0", 0.55, 0.3, "Liberal conservatism", 0.081, { bloc: "cdx", refuses: ["m5s", "avs"] }),
      P("az", "Action – Italia Viva", "AZ-IV", "#7b5cc8", 0.35, -0.35, "Liberalism", 0.078, { refuses: ["m5s", "lega"] }),
      P("avs", "Greens and Left Alliance", "AVS", "#0aa39a", -0.7, -0.7, "Eco-socialism", 0.036, { bloc: "csx", refuses: ["fdi", "lega", "fi"] }),
    ],
    {
      lombardy: { fdi: 0.28, pd: 0.19, lega: 0.13, m5s: 0.07, fi: 0.07, az: 0.1 },
      veneto: { fdi: 0.32, pd: 0.17, lega: 0.14, m5s: 0.05, fi: 0.06 },
      "emilia-romagna": { pd: 0.28, fdi: 0.25, m5s: 0.09, lega: 0.08 },
      tuscany: { pd: 0.28, fdi: 0.25, m5s: 0.1, lega: 0.07 },
      campania: { m5s: 0.34, fdi: 0.16, pd: 0.15, fi: 0.12 },
      sicily: { m5s: 0.27, fdi: 0.2, fi: 0.15, pd: 0.13 },
      apulia: { m5s: 0.28, fdi: 0.24, pd: 0.15, fi: 0.1 },
      calabria: { m5s: 0.29, fdi: 0.19, fi: 0.15, pd: 0.14 },
      lazio: { fdi: 0.31, pd: 0.2, m5s: 0.15 },
      "trentino-south-tyrol": { fdi: 0.2, pd: 0.15, lega: 0.08 },
    },
  );
  return scenario({
    code: "it",
    name: "Italy",
    about: "Twenty regions. A mixed electoral system, two equal chambers, coalitions of the right and left.",
    culture: "it",
    pops: { lombardy: 10.0, lazio: 5.7, campania: 5.6, sicily: 4.8, veneto: 4.85, "emilia-romagna": 4.45, piedmont: 4.25, apulia: 3.9, tuscany: 3.66, calabria: 1.84, sardinia: 1.57, liguria: 1.5, marche: 1.49, abruzzo: 1.27, "friuli-venezia-giulia": 1.19, "trentino-south-tyrol": 1.08, umbria: 0.86, basilicata: 0.53, molise: 0.29, "valle-d-aosta": 0.12 },
    counties: 900,
    parties,
    system: {
      exec: "parliamentary",
      lower: { name: "Chamber of Deputies", short: "Chamber", member: "Deputy", seats: 400, system: "parallel", threshold: 0.03, listShare: 0.63, term: 5, next: 2027, week: 38 },
      upper: { kind: "elected", name: "Senate of the Republic", short: "Senate", member: "Senator", perRegion: 0, seats: 200, national: 0, method: "pr", classes: 1, term: 5, next: 2027, week: 38, power: "equal" },
      pres: null,
      override: 0.5,
      regionTerm: 5,
      titles: { head: "Prime Minister", president: "President of the Republic", leader: "Leader", region: "region", regions: "regions", regionHead: "President", assent: "the President's promulgation", election: "General election", midterm: "General election" },
    },
    economy: { cur: "€", gdp: 2.2, growth: 0.6, budget: -70, debt: 3000, unemployment: 6, approval: 42, happiness: 16 },
    laws: { incomeTax: 5, corporateTax: 4, salesTax: 4, capitalGains: 3, minimumWage: 0, healthcare: 2, pensions: 2, marriage: 1, termLimits: 2 },
    start: { gov: ["fdi", "lega", "fi"], lower: { fdi: 119, pd: 71, lega: 66, m5s: 52, fi: 52, az: 28, avs: 12 }, upper: { fdi: 65, pd: 42, lega: 29, m5s: 28, fi: 20, az: 12, avs: 4 } },
  });
}

// ------------------------------------------------------------------ Japan

function japan(): Scenario {
  const parties = byRegion(
    [
      P("ldp", "Liberal Democratic Party", "LDP", "#3ca324", 0.35, 0.45, "Conservatism", 0.267, { refuses: ["jcp", "reiwa"] }),
      P("cdp", "Constitutional Democratic Party", "CDP", "#184589", -0.3, -0.4, "Liberalism", 0.212, { refuses: ["sanseito"] }),
      P("dpfp", "Democratic Party for the People", "DPFP", "#f8bc00", 0.15, -0.05, "Centrism", 0.113),
      P("komeito", "Komeito", "KMT", "#e74c8c", -0.05, 0.1, "Buddhist democracy", 0.109, { refuses: ["jcp", "sanseito"] }),
      P("ishin", "Japan Innovation Party", "ISHIN", "#b5c800", 0.55, 0.15, "Reformism", 0.094, { refuses: ["jcp", "reiwa"] }),
      P("reiwa", "Reiwa Shinsengumi", "REIWA", "#9b1c6f", -0.75, -0.3, "Left-wing populism", 0.07, { refuses: ["ldp", "ishin"] }),
      P("jcp", "Japanese Communist Party", "JCP", "#db001c", -0.85, -0.45, "Communism", 0.062, { refuses: ["ldp", "komeito", "ishin", "sanseito"] }),
      P("sanseito", "Sanseitō", "SANSEI", "#ff6a00", 0.25, 0.85, "Right-wing populism", 0.034, { refuses: ["cdp", "jcp"] }),
    ],
    {
      "osaka-prefecture": { ishin: 0.33, ldp: 0.18, komeito: 0.12, cdp: 0.12 },
      "hyogo-prefecture": { ishin: 0.18, ldp: 0.24 },
      "kyoto-prefecture": { ishin: 0.15, ldp: 0.24, jcp: 0.1 },
      hokkaido: { cdp: 0.3, ldp: 0.25 },
      "okinawa-prefecture": { ldp: 0.22, cdp: 0.18, jcp: 0.12, reiwa: 0.1 },
      tokyo: { ldp: 0.24, cdp: 0.2, dpfp: 0.13, reiwa: 0.09 },
      "aichi-prefecture": { dpfp: 0.17, ldp: 0.25 },
      "shimane-prefecture": { ldp: 0.38 },
      "tottori-prefecture": { ldp: 0.38 },
      "yamaguchi-prefecture": { ldp: 0.37 },
    },
  );
  return scenario({
    code: "jp",
    name: "Japan",
    about: "Forty-seven prefectures. A parallel system for the House of Representatives, half the Councillors every three years.",
    culture: "ja",
    pops: { tokyo: 14.1, "kanagawa-prefecture": 9.2, "osaka-prefecture": 8.8, "aichi-prefecture": 7.5, "saitama-prefecture": 7.3, "chiba-prefecture": 6.3, "hyogo-prefecture": 5.4, hokkaido: 5.1, "fukuoka-prefecture": 5.1, "shizuoka-prefecture": 3.6, "ibaraki-prefecture": 2.8, "hiroshima-prefecture": 2.7, "kyoto-prefecture": 2.5, "niigata-prefecture": 2.1, "miyagi-prefecture": 2.3, "nagano-prefecture": 2.0, "gifu-prefecture": 1.9, "gunma-prefecture": 1.9, "tochigi-prefecture": 1.9, "okayama-prefecture": 1.8, "fukushima-prefecture": 1.8, "mie-prefecture": 1.7, "kumamoto-prefecture": 1.7, "kagoshima-prefecture": 1.55, "okinawa-prefecture": 1.47, "shiga-prefecture": 1.4, "yamaguchi-prefecture": 1.3, "ehime-prefecture": 1.3, "nara-prefecture": 1.3, "nagasaki-prefecture": 1.27, "aomori-prefecture": 1.2, "iwate-prefecture": 1.17, "oita-prefecture": 1.1, "ishikawa-prefecture": 1.1, "miyazaki-prefecture": 1.05, "yamagata-prefecture": 1.03, "toyama-prefecture": 1.0, "akita-prefecture": 0.93, "kagawa-prefecture": 0.93, "wakayama-prefecture": 0.9, "yamanashi-prefecture": 0.8, "saga-prefecture": 0.8, "fukui-prefecture": 0.75, "tokushima-prefecture": 0.7, "kochi-prefecture": 0.68, "shimane-prefecture": 0.65, "tottori-prefecture": 0.54 },
    parties,
    system: {
      exec: "parliamentary",
      lower: { name: "House of Representatives", short: "House", member: "Representative", seats: 465, system: "parallel", threshold: 0.02, listShare: 0.38, term: 4, next: 2028, week: 43 },
      upper: { kind: "elected", name: "House of Councillors", short: "Councillors", member: "Councillor", perRegion: 0, seats: 148, national: 100, method: "pr", classes: 2, term: 3, next: 2028, week: 29, power: "weak" },
      pres: null,
      override: 2 / 3,
      regionTerm: 4,
      titles: { head: "Prime Minister", president: "Emperor", leader: "Leader", region: "prefecture", regions: "prefectures", regionHead: "Governor", assent: "promulgation by the Emperor", election: "General election", midterm: "House of Councillors election" },
    },
    economy: { cur: "¥", gdp: 610, growth: 0.8, budget: -25000, debt: 1300000, unemployment: 2.5, approval: 35, happiness: 15 },
    laws: { corporateTax: 5, salesTax: 3, capitalGains: 2, healthcare: 2, gunPolicy: 0, deathPenalty: 1, marriage: 0, termLimits: 2 },
    start: { lower: { ldp: 199, cdp: 152, dpfp: 28, komeito: 24, ishin: 38, reiwa: 9, jcp: 8, sanseito: 7 } },
  });
}

// ------------------------------------------------------------------ India

function india(): Scenario {
  const parties = byRegion(
    [
      P("bjp", "Bharatiya Janata Party", "BJP", "#ff9933", 0.35, 0.65, "Hindu nationalism", 0.367, { bloc: "nda", refuses: ["inc", "cpim", "sp", "aitc", "dmk"] }),
      P("inc", "Indian National Congress", "INC", "#19aaed", -0.2, -0.3, "Social liberalism", 0.212, { bloc: "india", refuses: ["bjp"] }),
      P("sp", "Samajwadi Party", "SP", "#e8442e", -0.35, -0.05, "Socialism", 0.046, { bloc: "india", only: ["uttar-pradesh", "madhya-pradesh", "uttarakhand"], refuses: ["bjp"] }),
      P("aitc", "All India Trinamool Congress", "AITC", "#20c646", -0.2, -0.15, "Populism", 0.044, { only: ["west-bengal", "assam", "tripura", "meghalaya"], refuses: ["bjp", "cpim"] }),
      P("dmk", "Dravida Munnetra Kazhagam", "DMK", "#7a1d1d", -0.3, -0.4, "Dravidian politics", 0.018, { bloc: "india", only: ["tamil-nadu", "puducherry"], refuses: ["bjp"] }),
      P("tdp", "Telugu Desam Party", "TDP", "#e8c31b", 0.2, 0.1, "Regionalism", 0.02, { bloc: "nda", only: ["andhra-pradesh", "telangana"] }),
      P("ysrcp", "YSR Congress Party", "YSRCP", "#1569c7", -0.1, 0.05, "Regionalism", 0.022, { only: ["andhra-pradesh"] }),
      P("jdu", "Janata Dal (United)", "JDU", "#006b3c", -0.05, 0.05, "Socialism", 0.0125, { bloc: "nda", only: ["bihar", "jharkhand"] }),
      P("cpim", "Communist Party of India (Marxist)", "CPIM", "#a3001b", -0.85, -0.3, "Communism", 0.018, { only: ["kerala", "west-bengal", "tamil-nadu", "tripura", "rajasthan"], refuses: ["bjp", "aitc"] }),
      P("aap", "Aam Aadmi Party", "AAP", "#0072b0", -0.25, -0.1, "Anti-corruption", 0.011, { only: ["delhi", "punjab", "goa", "gujarat", "haryana"], refuses: ["bjp"] }),
      P("oth", "Other regional parties", "OTH", "#8d8f94", 0, 0.05, "Regional parties and independents", 0.2, { others: true }),
    ],
    {
      "uttar-pradesh": { bjp: 0.413, sp: 0.337, inc: 0.095, oth: 0.13 },
      maharashtra: { bjp: 0.26, inc: 0.17, oth: 0.52 },
      "west-bengal": { aitc: 0.458, bjp: 0.386, cpim: 0.057, inc: 0.047 },
      bihar: { bjp: 0.205, jdu: 0.185, inc: 0.09, oth: 0.45 },
      "tamil-nadu": { dmk: 0.269, bjp: 0.112, inc: 0.105, cpim: 0.02, oth: 0.45 },
      "madhya-pradesh": { bjp: 0.594, inc: 0.326 },
      karnataka: { bjp: 0.461, inc: 0.455 },
      gujarat: { bjp: 0.617, inc: 0.312, aap: 0.026 },
      "andhra-pradesh": { tdp: 0.378, ysrcp: 0.398, bjp: 0.112, inc: 0.03 },
      rajasthan: { bjp: 0.497, inc: 0.379, cpim: 0.02 },
      odisha: { bjp: 0.455, inc: 0.126, oth: 0.39 },
      kerala: { inc: 0.35, cpim: 0.25, bjp: 0.17, oth: 0.2 },
      telangana: { inc: 0.405, bjp: 0.353, tdp: 0.02, oth: 0.2 },
      assam: { bjp: 0.37, inc: 0.371, aitc: 0.02 },
      jharkhand: { bjp: 0.446, inc: 0.193, jdu: 0.02 },
      punjab: { inc: 0.261, aap: 0.261, bjp: 0.185 },
      chhattisgarh: { bjp: 0.52, inc: 0.41 },
      haryana: { bjp: 0.462, inc: 0.437, aap: 0.04 },
      delhi: { bjp: 0.542, aap: 0.243, inc: 0.189 },
      "jammu-and-kashmir": { bjp: 0.24, inc: 0.19, oth: 0.5 },
      uttarakhand: { bjp: 0.56, inc: 0.33 },
      "himachal-pradesh": { bjp: 0.56, inc: 0.41 },
      goa: { bjp: 0.51, inc: 0.45 },
      tripura: { bjp: 0.7, cpim: 0.15 },
      puducherry: { inc: 0.53, bjp: 0.37, dmk: 0.05 },
    },
  );
  return scenario({
    code: "in",
    name: "India",
    about: "Twenty-eight states and eight territories. The Lok Sabha, the Rajya Sabha, alliances and regional parties.",
    culture: "hi",
    pops: { "uttar-pradesh": 241, maharashtra: 127, bihar: 128, "west-bengal": 100, "madhya-pradesh": 87, "tamil-nadu": 77, rajasthan: 81, karnataka: 68, gujarat: 72, "andhra-pradesh": 53, odisha: 46, telangana: 38, kerala: 36, jharkhand: 40, assam: 36, punjab: 31, chhattisgarh: 30, haryana: 30, delhi: 22, "jammu-and-kashmir": 13.6, uttarakhand: 11.6, "himachal-pradesh": 7.5, tripura: 4.1, meghalaya: 3.4, manipur: 3.2, nagaland: 2.2, goa: 1.6, "arunachal-pradesh": 1.6, puducherry: 1.6, mizoram: 1.25, chandigarh: 1.2, sikkim: 0.7, "andaman-and-nicobar": 0.4, "dadra-and-nagar-haveli-and-daman-and-diu": 1.0, ladakh: 0.3, lakshadweep: 0.07 },
    counties: 1150,
    parties,
    system: {
      exec: "parliamentary",
      lower: { name: "Lok Sabha", short: "Lok Sabha", member: "MP", seats: 543, system: "fptp", threshold: 0, listShare: 0.5, term: 5, next: 2029, week: 18, fixed: { "uttar-pradesh": 80, maharashtra: 48, "west-bengal": 42, bihar: 40, "tamil-nadu": 39, "madhya-pradesh": 29, karnataka: 28, gujarat: 26, "andhra-pradesh": 25, rajasthan: 25, odisha: 21, kerala: 20, telangana: 17, assam: 14, jharkhand: 14, punjab: 13, chhattisgarh: 11, haryana: 10, delhi: 7, "jammu-and-kashmir": 5, uttarakhand: 5, "himachal-pradesh": 4, "arunachal-pradesh": 2, goa: 2, manipur: 2, meghalaya: 2, tripura: 2, "dadra-and-nagar-haveli-and-daman-and-diu": 2, mizoram: 1, nagaland: 1, sikkim: 1, "andaman-and-nicobar": 1, chandigarh: 1, lakshadweep: 1, ladakh: 1, puducherry: 1 } },
      upper: { kind: "indirect", name: "Rajya Sabha", short: "Rajya Sabha", member: "MP", perRegion: 0, regionSeats: { "uttar-pradesh": 31, maharashtra: 19, "tamil-nadu": 18, "west-bengal": 16, bihar: 16, karnataka: 12, "andhra-pradesh": 11, gujarat: 11, "madhya-pradesh": 11, odisha: 10, rajasthan: 10, kerala: 9, telangana: 7, assam: 7, punjab: 7, jharkhand: 6, chhattisgarh: 5, haryana: 5, delhi: 3, "jammu-and-kashmir": 4, uttarakhand: 3, "himachal-pradesh": 3, "arunachal-pradesh": 1, goa: 1, manipur: 1, meghalaya: 1, mizoram: 1, nagaland: 1, sikkim: 1, tripura: 1, puducherry: 1 }, seats: 0, national: 0, method: "pr", classes: 3, term: 2, next: 2026, week: 13, power: "weak" },
      pres: null,
      override: 0.5,
      regionTerm: 5,
      titles: { head: "Prime Minister", president: "President", leader: "President", region: "state", regions: "states and territories", regionHead: "Chief Minister", regionHeads: { ladakh: "Lieutenant Governor", lakshadweep: "Administrator", "andaman-and-nicobar": "Lieutenant Governor", chandigarh: "Administrator", "dadra-and-nagar-haveli-and-daman-and-diu": "Administrator" }, assent: "the President's assent", election: "General election", midterm: "General election" },
    },
    economy: { cur: "₹", gdp: 330, growth: 6.5, budget: -16000, debt: 190000, unemployment: 7.5, approval: 60, happiness: 20 },
    laws: { incomeTax: 2, corporateTax: 4, salesTax: 4, capitalGains: 1, minimumWage: 1, deathPenalty: 1, marriage: 0, termLimits: 2 },
    start: { gov: ["bjp", "tdp", "jdu"], lower: { bjp: 240, inc: 99, sp: 37, aitc: 29, dmk: 22, tdp: 16, jdu: 12, ysrcp: 4, cpim: 4, aap: 3, oth: 77 } },
  });
}

// ------------------------------------------------------------------ Brazil

function brazil(): Scenario {
  const parties = byRegion(
    [
      P("pl", "Liberal Party", "PL", "#0b3d91", 0.45, 0.75, "Right-wing populism", 0.166, { bloc: "right", refuses: ["pt", "psol", "psb"] }),
      P("pt", "Workers' Party", "PT", "#d0021b", -0.55, -0.3, "Social democracy", 0.15, { bloc: "left", refuses: ["pl"] }),
      P("uniao", "Brazil Union", "UNIÃO", "#2d8fd5", 0.45, 0.35, "Liberal conservatism", 0.093),
      P("psd", "Social Democratic Party", "PSD", "#f2a900", 0.2, 0.1, "Centrism", 0.084),
      P("pp", "Progressistas", "PP", "#6b5bd6", 0.45, 0.45, "Conservatism", 0.08, { bloc: "right", refuses: ["psol"] }),
      P("rep", "Republicans", "REP", "#00838f", 0.3, 0.75, "Christian right", 0.076, { bloc: "right", refuses: ["psol"] }),
      P("mdb", "Brazilian Democratic Movement", "MDB", "#2e9e4f", 0.15, 0.1, "Centrism", 0.072),
      P("psb", "Brazilian Socialist Party", "PSB", "#ef6c8a", -0.4, -0.25, "Social democracy", 0.04, { bloc: "left", refuses: ["pl"] }),
      P("psol", "Socialism and Liberty Party", "PSOL", "#8e24aa", -0.85, -0.7, "Democratic socialism", 0.039, { bloc: "left", refuses: ["pl", "pp", "rep", "uniao"] }),
      P("oth", "Other parties", "OTH", "#8d8f94", 0, 0.1, "Smaller parties", 0.18, { others: true }),
    ],
    {
      "sao-paulo": { pl: 0.2, pt: 0.14, psol: 0.07, rep: 0.09 },
      "rio-de-janeiro": { pl: 0.23, pt: 0.1, psol: 0.07 },
      "santa-catarina": { pl: 0.3, pt: 0.1 },
      parana: { pl: 0.22, pt: 0.11, psd: 0.12 },
      "rio-grande-do-sul": { pl: 0.18, pt: 0.17 },
      "distrito-federal": { pl: 0.3, pt: 0.12 },
      "mato-grosso": { pl: 0.3, uniao: 0.15 },
      rondonia: { pl: 0.3, uniao: 0.12 },
      roraima: { pl: 0.3 },
      bahia: { pt: 0.27, uniao: 0.15, pl: 0.08 },
      pernambuco: { pt: 0.2, psb: 0.12, pl: 0.1 },
      ceara: { pt: 0.2, pl: 0.12 },
      piaui: { pt: 0.28, pp: 0.15 },
      maranhao: { pt: 0.2, psb: 0.08 },
      "minas-gerais": { pl: 0.18, pt: 0.14, psd: 0.12 },
    },
  );
  return scenario({
    code: "br",
    name: "Brazil",
    about: "Twenty-six states and the Federal District. A President in two rounds, open-list deputies, three senators a state.",
    culture: "pt",
    pops: { "sao-paulo": 44.4, "minas-gerais": 20.5, "rio-de-janeiro": 16.1, bahia: 14.1, parana: 11.4, "rio-grande-do-sul": 10.9, pernambuco: 9.1, ceara: 8.8, para: 8.1, "santa-catarina": 7.6, goias: 7.1, maranhao: 6.8, paraiba: 4.0, amazonas: 3.9, "espirito-santo": 3.8, "mato-grosso": 3.7, "rio-grande-do-norte": 3.3, piaui: 3.3, alagoas: 3.1, "distrito-federal": 2.8, "mato-grosso-do-sul": 2.8, sergipe: 2.2, rondonia: 1.6, tocantins: 1.5, acre: 0.83, amapa: 0.73, roraima: 0.64 },
    parties,
    system: {
      exec: "presidential",
      lower: { name: "Chamber of Deputies", short: "Chamber", member: "Deputy", seats: 513, system: "pr", threshold: 0.02, listShare: 0.5, term: 4, next: 2026, week: 40, fixed: { "sao-paulo": 70, "minas-gerais": 53, "rio-de-janeiro": 46, bahia: 39, "rio-grande-do-sul": 31, parana: 30, pernambuco: 25, ceara: 22, maranhao: 18, goias: 17, para: 17, "santa-catarina": 16, paraiba: 12, "espirito-santo": 10, piaui: 10, alagoas: 9, acre: 8, amazonas: 8, amapa: 8, "distrito-federal": 8, "mato-grosso-do-sul": 8, "mato-grosso": 8, "rio-grande-do-norte": 8, rondonia: 8, roraima: 8, sergipe: 8, tocantins: 8 } },
      upper: { kind: "elected", name: "Federal Senate", short: "Senate", member: "Senator", perRegion: 3, seats: 0, national: 0, method: "plurality", classes: 2, term: 4, next: 2026, week: 40, power: "equal" },
      pres: { term: 4, next: 2026, week: 40, runoff: true, college: false },
      override: 0.5,
      regionTerm: 4,
      titles: { head: "President", president: "President", leader: "President", region: "state", regions: "states", regionHead: "Governor", assent: "the President's sanction", election: "General election", midterm: "General election" },
    },
    economy: { cur: "R$", gdp: 11.7, growth: 2.3, budget: -900, debt: 9000, unemployment: 6.2, approval: 45, happiness: 19 },
    laws: { corporateTax: 6, salesTax: 4, minimumWage: 1, healthcare: 2, education: 2, drugPolicy: 1, termLimits: 1 },
    start: { pres: "pt", lower: { pl: 99, pt: 80, uniao: 59, pp: 47, mdb: 42, psd: 42, rep: 41, psb: 14, psol: 14, oth: 75 }, upper: { psd: 15, pl: 14, mdb: 11, pt: 9, uniao: 7, pp: 7, rep: 4, psb: 4, oth: 10 } },
  });
}

// ------------------------------------------------------------------ Mexico

function mexico(): Scenario {
  const parties = byRegion(
    [
      P("morena", "Morena", "MORENA", "#a0271a", -0.45, 0.05, "Left-wing populism", 0.425, { bloc: "shh", refuses: ["pan", "pri"] }),
      P("pan", "National Action Party", "PAN", "#0059a8", 0.5, 0.55, "Christian democracy", 0.176, { bloc: "fcm", refuses: ["morena", "pt"] }),
      P("pri", "Institutional Revolutionary Party", "PRI", "#00843d", 0.15, 0.25, "Centrism", 0.116, { bloc: "fcm", refuses: ["morena", "pt"] }),
      P("mc", "Citizens' Movement", "MC", "#ff8300", 0.05, -0.45, "Social democracy", 0.113, { refuses: ["morena", "pri"] }),
      P("pvem", "Green Ecologist Party", "PVEM", "#9ccc3c", 0.1, 0.1, "Green conservatism", 0.087, { bloc: "shh" }),
      P("pt", "Labor Party", "PT", "#e8b723", -0.7, 0, "Socialism", 0.057, { bloc: "shh", refuses: ["pan", "pri"] }),
    ],
    {
      "mexico-city": { morena: 0.45, pan: 0.2, mc: 0.1 },
      tabasco: { morena: 0.6 },
      chiapas: { morena: 0.55 },
      oaxaca: { morena: 0.55 },
      veracruz: { morena: 0.5 },
      guanajuato: { pan: 0.3, morena: 0.33 },
      queretaro: { pan: 0.3, morena: 0.35 },
      aguascalientes: { pan: 0.32, morena: 0.32 },
      chihuahua: { pan: 0.25, morena: 0.38 },
      jalisco: { mc: 0.3, morena: 0.35, pan: 0.15 },
      "nuevo-leon": { mc: 0.3, morena: 0.33, pri: 0.12 },
      coahuila: { pri: 0.25, morena: 0.38 },
    },
  );
  return scenario({
    code: "mx",
    name: "Mexico",
    about: "Thirty-one states and Mexico City. A six-year President, a parallel Chamber, a Senate of three per state.",
    culture: "es",
    pops: { "state-of-mexico": 17.0, "mexico-city": 9.2, jalisco: 8.3, veracruz: 8.1, puebla: 6.6, guanajuato: 6.2, "nuevo-leon": 5.8, chiapas: 5.5, michoacan: 4.75, oaxaca: 4.1, chihuahua: 3.7, guerrero: 3.5, "baja-california": 3.8, tamaulipas: 3.5, coahuila: 3.1, sinaloa: 3.0, hidalgo: 3.1, sonora: 2.9, "san-luis-potosi": 2.8, tabasco: 2.4, yucatan: 2.3, queretaro: 2.4, morelos: 2.0, durango: 1.8, zacatecas: 1.6, "quintana-roo": 1.9, aguascalientes: 1.4, tlaxcala: 1.3, nayarit: 1.2, campeche: 0.93, colima: 0.73, "baja-california-sur": 0.8 },
    parties,
    system: {
      exec: "presidential",
      lower: { name: "Chamber of Deputies", short: "Chamber", member: "Deputy", seats: 500, system: "parallel", threshold: 0.03, listShare: 0.4, term: 3, next: 2027, week: 22 },
      upper: { kind: "elected", name: "Senate", short: "Senate", member: "Senator", perRegion: 3, seats: 0, national: 32, method: "limited", classes: 1, term: 6, next: 2030, week: 22, power: "equal" },
      pres: { term: 6, next: 2030, week: 22, runoff: false, college: false },
      override: 2 / 3,
      regionTerm: 6,
      titles: { head: "President", president: "President", leader: "President", region: "state", regions: "states", regionHead: "Governor", regionHeads: { "mexico-city": "Head of Government" }, assent: "the President's promulgation", election: "General election", midterm: "Midterm elections" },
    },
    economy: { cur: "MX$", gdp: 34, growth: 0.5, budget: -1000, debt: 17500, unemployment: 2.7, approval: 70, happiness: 22 },
    laws: { incomeTax: 4, corporateTax: 5, salesTax: 4, minimumWage: 1, gunPolicy: 0, church: 2, drugPolicy: 1, trade: 2, energy: 0, termLimits: 0 },
    start: { pres: "morena", lower: { morena: 255, pvem: 62, pt: 49, pan: 72, pri: 35, mc: 27 }, upper: { morena: 67, pvem: 14, pt: 6, pan: 22, pri: 13, mc: 6 } },
  });
}

const BUILDERS: Record<string, () => Scenario> = { us: unitedStates, gb: unitedKingdom, ca: canada, au: australia, de: germany, fr: france, es: spain, it: italy, jp: japan, in: india, br: brazil, mx: mexico };

/** The real countries, in the order the title screen lists them. */
export const COUNTRY_LIST: { code: string; name: string }[] = [
  { code: "us", name: "United States" },
  { code: "gb", name: "United Kingdom" },
  { code: "ca", name: "Canada" },
  { code: "au", name: "Australia" },
  { code: "de", name: "Germany" },
  { code: "fr", name: "France" },
  { code: "es", name: "Spain" },
  { code: "it", name: "Italy" },
  { code: "jp", name: "Japan" },
  { code: "in", name: "India" },
  { code: "br", name: "Brazil" },
  { code: "mx", name: "Mexico" },
];

/** A fresh copy of a real country's scenario. */
export function realCountry(code: string): Scenario | null {
  const b = BUILDERS[code];
  return b ? b() : null;
}
