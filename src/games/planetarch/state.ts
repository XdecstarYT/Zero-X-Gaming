/**
 * Planetarch's world state: what's saved. Every nation runs the same model as yours, so the
 * types are shared; the day-to-day figures the simulation works out from them (production,
 * trade, the budget's lines) live in `Derived` and are rebuilt after a load.
 */
import type { Culture } from "./names";
import type { DisasterId, EquipId, Family, GroupId, MeasureId, OrgId, PlantType, PortfolioId, PromiseId, ServiceId, TechField, VatCat } from "./data";
import type { ElectoralSystem, Form } from "./countries";

/** A labelled contribution to a number, so the UI can say where it comes from. */
export interface Part {
  label: string;
  v: number;
}

export interface Person {
  id: number;
  name: string;
  female: boolean;
  /** Birth day (days since the start; negative before). */
  born: number;
  nation: number;
  party: number;
  /** 0…1. */
  skill: number;
  loyalty: number;
  /** 1 = healthy. */
  health: number;
  alive: boolean;
  /** Royal family: parent's id. */
  parent?: number;
  royal?: boolean;
  role?: string;
}

export interface SectorState {
  /** Capacity, $bn of output a year at base prices. */
  cap: number;
  /** Output, $bn a year. */
  out: number;
  /** What firms planned to make (before shortages held them back). */
  plan: number;
  /** Orders as a share of output (above 1: they'd sell more). */
  orders: number;
  /** Workers employed. */
  workers: number;
  /** Workers needed per $bn of output. */
  lab: number;
  /** Price index (1 at the start). */
  price: number;
  /** Ownership: state share, co-operative share (the rest is private). */
  state: number;
  coop: number;
  /** Damage from war and disasters (share of capacity out). */
  damage: number;
  /** Government investment programme, $bn a year. */
  program: number;
  /** What held output back yesterday, and by how much. */
  limit: string;
  limitBy: number;
  /** Profit, $bn a year. */
  profit: number;
  /** Pay per worker, $ a year (sticky: set by bargaining and the labour market, not by this week's orders). */
  wage: number;
}

export interface GroupState {
  pop: number;
  /** Per head, $ a year: before tax and after. */
  pre: number;
  post: number;
  /** Wealth per head, $. */
  wealth: number;
  /** Satisfaction 0…100 and its parts. */
  sat: number;
  parts: Part[];
  /** Militancy 0…100. */
  mil: number;
  /** A year-long memory of real income per head (for "better or worse off"). */
  ref: number;
  /** Union membership share. */
  union: number;
  /** Days left on strike (0 = working). */
  strike: number;
  /** Share of the group out. */
  strikeShare: number;
  /** Anger from crackdowns, fading. */
  repressed: number;
  /** Pay won in bargaining (multiplier on the group's wages). */
  premium: number;
}

export interface ServiceState {
  staff: number;
  /** Pay as a multiple of the average wage. */
  pay: number;
  /** Trainees, by years until they qualify (index 0 qualifies this year). */
  pipeline: number[];
  /** New training places funded a year. */
  places: number;
  /** Total facilities (beds, places, courtrooms…). */
  facilities: number;
  /** Facilities being built: [amount, day ready]. */
  building: [number, number][];
  /** Supplies budget multiplier (1 = enough at the start). */
  supply: number;
  /** Quality 0…1 and what limits it. */
  quality: number;
  limit: string;
  /** Staff on strike share. */
  strike: number;
}

export interface Plant {
  id: number;
  nation: number;
  city: number;
  type: PlantType;
  gw: number;
  /** 0 = working; share knocked out. */
  damage: number;
  /** Day finished (in the future = under construction). */
  ready: number;
  state: boolean;
}

export interface TaxPolicy {
  /** Income tax: [threshold as a multiple of the average income, marginal rate]. */
  brackets: [number, number][];
  socialEmployee: number;
  socialEmployer: number;
  corporate: number;
  vat: Record<VatCat, number>;
  /** Default tariff, and per-good overrides (by good id). */
  tariff: number;
  /** The default tariff at the start (prices are measured against it). */
  tariff0: number;
  tariffs: Record<string, number>;
  /** Extra tariffs on a country (by nation id). */
  surcharge: Record<number, number>;
  royalty: number;
  wealth: number;
}

export interface SpendPolicy {
  /** $bn a year for each service's running costs (pay + supplies) is derived; this is the extra: */
  infrastructure: number;
  /** Other transfers and subsidies to households. */
  transfers: number;
  socialHousing: number;
  research: number;
  culture: number;
  defence: number;
  intelligence: number;
  aid: number;
  energySubsidy: number;
  prevention: number;
  /** Benefits. */
  pensionRate: number;
  minPension: number;
  childBenefit: number;
  uiRate: number;
}

export interface Budget {
  rev: Part[];
  exp: Part[];
  revenue: number;
  spending: number;
  balance: number;
}

export interface Housing {
  rent: number;
  price: number;
  social: number;
  mortgage: number;
  owners: number;
  built: number;
}

export interface Epidemic {
  disease: string;
  /** Infected, recovered, dead, vaccinated. */
  i: number;
  r: number;
  d: number;
  v: number;
  day: number;
  detected: boolean;
}

export interface Bill {
  id: number;
  title: string;
  /** What it changes. */
  changes: Change[];
  by: number;
  /** Day the vote happens. */
  vote: number;
  stage: "debate" | "upper" | "executive" | "review" | "passed" | "failed" | "vetoed" | "struck";
  /** Concessions bought, by party: extra support. */
  sway: Record<number, number>;
  result?: { yes: number; no: number; abstain: number };
  /** Opposition bill. */
  opposition?: boolean;
  kind: "law" | "budget" | "constitution" | "confidence" | "war" | "treaty" | "other";
  note?: string;
}

export type Change =
  | { k: "law"; id: string; to: string }
  | { k: "const"; id: string; to: string }
  | { k: "tax"; tax: TaxPolicy }
  | { k: "spend"; spend: SpendPolicy }
  | { k: "service"; id: ServiceId; pay?: number; places?: number; supply?: number }
  | { k: "confidence"; party: number }
  | { k: "war"; target: number; grounds: string }
  | { k: "treaty"; treaty: number }
  | { k: "org"; org: OrgId; join: boolean };

export interface Election {
  day: number;
  kind: "lower" | "upper" | "hos" | "referendum";
  /** Share of the upper house renewed. */
  share?: number;
  question?: string;
  city?: number;
  early?: boolean;
}

export interface ElectionResult {
  day: number;
  kind: Election["kind"];
  votes: Record<number, number>;
  seats: Record<number, number>;
  turnout: number;
  /** Province winners: city → party. */
  cities: Record<number, number>;
  winner?: number;
  /** Referendum yes share. */
  yes?: number;
  runoff?: [number, number, number];
}

export interface Party {
  id: number;
  nation: number;
  name: string;
  short: string;
  family: Family;
  color: string;
  v: [number, number, number, number, number, number];
  leader: number;
  /** $ millions. */
  funds: number;
  activists: number;
  /** Discipline 0…1: how many follow the line. */
  whip: number;
  /** Credibility 0…1: voters' trust in its promises. */
  cred: number;
  /** Campaign boost by province (fades). */
  campaign: Record<number, number>;
  national: number;
  promises: { id: PromiseId; base: number; made: number }[];
  /** Latest polling share. */
  poll: number;
  alive: boolean;
  /** Regional parties: their home city. */
  home?: number;
}

export interface Chamber {
  name: string;
  size: number;
  seats: Record<number, number>;
}

export interface Politics {
  lower: Chamber;
  upper: Chamber | null;
  /** Parties in government; the leading one first. */
  gov: number[];
  /** The head of state's party (cohabitation when it isn't in the government). */
  hosParty: number;
  elections: Election[];
  results: ElectionResult[];
  bills: Bill[];
  /** Constitution in force, and changes waiting for the next election. */
  constitution: Record<string, string>;
  pending: Record<string, string>;
  /** Day the government formed. */
  since: number;
  /** Days of coalition talks left (0 = formed). */
  talks: number;
  /** Emergency rule until this day. */
  emergency: number;
}

export interface Treaty {
  id: number;
  kind: "defence" | "guarantee" | "nonaggression" | "access" | "intel" | "base" | "milaid" | "aid" | "trade" | "research" | "ceasefire" | "armistice" | "charter" | "energy";
  a: number;
  b: number;
  since: number;
  /** Aid: $bn a year from a to b. */
  amount?: number;
}

export interface Sanction {
  by: number;
  on: number;
  level: 1 | 2 | 3;
  since: number;
}

export interface Crisis {
  id: number;
  a: number;
  b: number;
  title: string;
  cause: "claim" | "incident" | "maritime" | "ultimatum" | "nuclear" | "coup";
  tension: number;
  /** Each side's posture: what they've done. */
  moves: { side: number; move: string; day: number }[];
  deadline: number;
  mediator: number;
  /** Red lines drawn, by side. */
  redline: Record<number, boolean>;
  mobilised: Record<number, number>;
  restricted: boolean;
  over: boolean;
  outcome?: string;
}

export interface Theatre {
  id: number;
  name: string;
  /** City the theatre's named after. */
  city: number;
  /** Directive and priority, by side (0 attackers, 1 defenders). */
  dir: [Directive, Directive];
  pri: [number, number];
  /** Front cells (grid indexes) at the last count. */
  len: number;
}
export type Directive = "hold" | "limited" | "major";

export interface War {
  id: number;
  name: string;
  attackers: number[];
  defenders: number[];
  start: number;
  grounds: string;
  /** Legitimacy 0…100 (how the world sees it). */
  legit: number;
  claims: number[];
  theatres: Theatre[];
  /** Air superiority for the attackers 0…1, sea control for the attackers 0…1. */
  air: number;
  sea: number;
  /** −100…100 from the attackers' view. */
  score: number;
  /** Losses: nation → military dead. */
  dead: Record<number, number>;
  civilians: Record<number, number>;
  refugees: number;
  /** Targeting doctrine by side. */
  doctrine: [Doctrine, Doctrine];
  ceasefire: number;
  over: boolean;
  /** Non-state side: actor id. */
  actor?: number;
  /** Day each front cell last changed hands (for entrenchment). */
  dug?: Record<number, number>;
  /** Peace offers waiting: from side. */
  offer?: { from: 0 | 1; terms: PeaceTerm; day: number };
}
export type Doctrine = "military" | "infrastructure" | "total";
export type PeaceTerm = "white" | "ceasefire" | "armistice" | "annex" | "status";

export interface Actor {
  id: number;
  name: string;
  kind: "rebels" | "terrorists" | "militia" | "cartel";
  nation: number;
  strength: number;
  funding: number;
  leader: string;
  /** Your intelligence infiltration of it 0…100. */
  infiltrated: Record<number, number>;
  alive: boolean;
}

export interface Resolution {
  id: number;
  org: "unsc" | "ga" | "eu" | "opec" | "nato";
  title: string;
  kind: "sanctions" | "condemn" | "ceasefire" | "peacekeeping" | "force" | "accession" | "quota" | "tariff" | "article5" | "euro" | "exit";
  target: number;
  by: number;
  vote: number;
  votes: Record<number, "yes" | "no" | "abstain" | "veto">;
  passed?: boolean;
  value?: number;
}

export interface Cable {
  id: number;
  from: number;
  to: number;
  /** A party leader (domestic) or a foreign leader. */
  toParty?: number;
  kind: string;
  text: string;
  day: number;
  reply?: { day: number; accept: boolean; text: string };
  /** For a bill, a treaty, etc. */
  ref?: number;
  offer?: string;
}

export interface Strike {
  group: GroupId;
  nation: number;
  /** Pay rise demanded %. */
  demand: number;
  /** Day the strike starts if there's no deal. */
  deadline: number;
  /** Day it started (0 = not yet). */
  started: number;
  share: number;
  services: ServiceId[];
  settled?: string;
}

export interface Protest {
  id: number;
  nation: number;
  city: number;
  group: GroupId;
  size: number;
  cause: string;
  day: number;
  response?: "facilitate" | "contain" | "disperse" | "crackdown" | "army";
  over: boolean;
  dead: number;
}

export interface NewsItem {
  day: number;
  nation: number;
  text: string;
  kind: "world" | "home" | "war" | "economy" | "politics" | "disaster" | "science";
  big?: boolean;
}

export interface Report {
  day: number;
  title: string;
  lines: string[];
}

export interface MoonSite {
  owner: number;
  crew: number;
  governor: number;
  he3: number;
  since: number;
}

export interface Military {
  equip: Record<EquipId, number>;
  /** Equipment on order: [type, amount, day ready]. */
  orders: [EquipId, number, number][];
  /** Ammunition: days of heavy fighting in stock. */
  ammo: number;
  /** Active personnel, reserves called up. */
  personnel: number;
  mobilised: number;
  /** Loyalty 0…100. */
  loyalty: number;
  bonus: number;
  nukes: number;
  /** Programme progress 0…100 (100 = a working weapon). */
  program: number;
  doctrine: "nfu" | "ambiguity" | "first";
  alert: 0 | 1 | 2 | 3;
  /** AI rule for striking first (the player sets their own). */
  firstStrike: "never" | "existential" | "losing";
  coupRisk: number;
}

export interface Intel {
  /** Network strength in each country (by nation id). */
  net: Record<number, number>;
  counter: number;
  /** Secrets learned: text, day. */
  secrets: [string, number][];
  /** Evidence of foreign operations against you: nation, what, day, published. */
  evidence: [number, string, number, boolean][];
}

export interface Research {
  known: number[];
  /** Points banked per field. */
  rp: Record<TechField, number>;
  /** Share of the research budget per field (adds to 1). */
  alloc: Record<TechField, number>;
  /** Field to focus (gets the points first). */
  target: Record<TechField, number>;
}

export interface Nation {
  id: number;
  iso: string;
  name: string;
  /** What it's called in full (e.g. "Kingdom of …"). */
  formal: string;
  continent: string;
  sub: string;
  culture: Culture;
  alive: boolean;
  flag: string;
  color: string;
  form: Form;
  hos: string;
  hog: string;
  /** People. */
  leader: number;
  hogLeader: number;
  heir: number;
  regent: number;
  ministers: Record<PortfolioId, number>;
  house?: string;

  /* economy */
  gdp: number;
  gdpReal: number;
  /** Real GDP a year ago (rolling). */
  gdpHist: number[];
  growth: number;
  productivity: number;
  sectors: SectorState[];
  /** Goods mix within each sector (index by good). */
  gmix: number[];
  /** Demand multipliers that balance the world at the start. */
  dm: number[];
  /** Electricity: TWh per $bn of output at this country's efficiency. */
  elecEff: number;
  /** Households' electricity, TWh a year. */
  elecHome: number;
  /** The cost index of electricity at the start (its price is measured against it). */
  elecBase: number;
  /** Strategic reserves: fuel id → $bn in store. */
  reserve: Record<string, number>;
  /** Release reserves when short. */
  releaseReserve: boolean;
  /** Who's cut first in a shortage. */
  loadShed: "industry" | "homes" | "even";
  interconnect: number;
  /** Prospecting: progress, discovered bonus by sector. */
  prospect: Record<string, number>;
  workers: number;
  labour: number;
  unemp: number;
  avgWage: number;
  price: number;
  /** CPI a year ago (rolling monthly). */
  priceHist: number[];
  inflation: number;
  fx: number;
  /** Debt $bn, its average interest rate, FX reserves $bn, sovereign fund $bn. */
  debt: number;
  debtRate: number;
  fxReserves: number;
  swf: number;
  rating: number;
  yield: number;
  market: boolean;
  defaulted: number;
  imf: { tranches: number; next: number; target: number; amount: number } | null;
  cbIndependent: boolean;
  policyRate: number;
  printing: number;
  banks: { capital: number; npl: number; nationalised: boolean; liquidity: number };
  exchangeOpen: boolean;
  tax: TaxPolicy;
  spend: SpendPolicy;
  /** Budget being drafted (submitted as a bill in a democracy). */
  draft: { tax: TaxPolicy; spend: SpendPolicy } | null;
  /** OPEC quota share of capacity (1 = none). */
  quota: number;

  /* society */
  pop: number;
  /** 17 five-year age bands, the last 80+. */
  cohorts: number[];
  fertility: number;
  lifeExp: number;
  groups: GroupState[];
  services: Record<ServiceId, ServiceState>;
  housing: Housing;
  crime: number;
  laws: Record<string, string>;
  /** Migration this year: in and out, by skill. */
  migIn: [number, number, number];
  migOut: [number, number, number];
  /** People from here living abroad. */
  diaspora: number;
  measures: Record<MeasureId, boolean>;
  vaccine: Record<string, number>;
  approval: number;
  approvalParts: Part[];
  stability: number;
  stabilityParts: Part[];
  /** Cultural values: how traditional, how free. */
  relig: number;
  free: number;
  emissions: number;
  /** Tourist arrivals a year (millions), culture spend points, Olympic bid state. */
  tourists: number;
  olympics: { bid: number; host: number } | null;

  /* politics & the world */
  pol: Politics;
  rel: number[];
  orgs: OrgId[];
  /** Applying to join (org → day applied). */
  applying: Partial<Record<OrgId, number>>;
  /** Leaving (org → day it takes effect). */
  leaving: Partial<Record<OrgId, number>>;
  mil: Military;
  intel: Intel;
  research: Research;
  /** Claims on other countries' cities. */
  claims: number[];
  /** Colonies/overseas. */
  capital: number;
  /** Score (legacy). */
  score: number;
}

export interface World {
  version: number;
  seed: number;
  rng: number;
  day: number;
  nations: Nation[];
  /** City → owner, and who controls it now (differs under occupation; ≥1000 = non-state actor 1000+id). */
  owner: number[];
  control: number[];
  /** City → autonomy 0…3, separatism 0…1, damage 0…1, revolt 0…1, occupation policy. */
  autonomy: number[];
  separatism: number[];
  damage: number[];
  revolt: number[];
  occupation: ("administer" | "repress" | "expel")[];
  /** City → facilities by service (6 per city), in units of the service. */
  facilities: number[];
  plants: Plant[];
  parties: Party[];
  people: Person[];
  /** World prices by good (1 = start). */
  prices: number[];
  /** Other final demand per $bn of GDP, by good (uses the model doesn't itemise). */
  other: number[];
  wars: War[];
  crises: Crisis[];
  treaties: Treaty[];
  sanctions: Sanction[];
  actors: Actor[];
  resolutions: Resolution[];
  strikes: Strike[];
  protests: Protest[];
  epidemics: Record<number, Epidemic[]>;
  disasters: { day: number; nation: number; city: number; kind: DisasterId; dead: number; damage: number; rebuilt: number }[];
  /** Straits closed (id → by nation). */
  straits: Record<string, number>;
  /** Blockades: blockaded nation → by nation. */
  blockades: Record<number, number>;
  climate: { co2: number; temp: number; soot: number };
  moon: { sites: Record<string, MoonSite>; charter: Record<number, string>; he3: Record<number, number> };
  unsc: [number, number][];
  opec: { price: number; war: boolean; next: number };
  news: NewsItem[];
  reports: Report[];
  cables: Cable[];
  /** Watched: nations or crises the player follows. */
  watch: number[];
  /** Who you are. */
  actor: { nation: number; party: number; role: "government" | "opposition" };
  /** War front: grid cell → controlling nation (−1 sea), only kept where it differs from the owner. */
  front: Record<number, number>;
  /** Olympics: year → host nation. */
  olympics: Record<number, number>;
  ids: number;
  /** Mods: presentation choices. */
  mods: { theme: string; channel: string; units: "metric" | "imperial"; names: "local" | "english" };
  score: number;
}

/** Things worked out each day and not saved. */
export interface Derived {
  supply: Float64Array[];
  demand: Float64Array[];
  imports: Float64Array[];
  exports: Float64Array[];
  avail: Float64Array[];
  slow: Float64Array[];
  /** Electricity: TWh a year demanded, generated, imported; served share. */
  elec: { demand: number; gen: number; imported: number; served: number; price: number; byType: Record<string, number>; fuelShort: string }[];
  budget: Budget[];
  /** World market fill rate by good (imports filled), export sell rate. */
  fill: Float64Array;
  sell: Float64Array;
  /** Trade access per nation (1 = open seas, no sanctions). */
  access: number[];
  /** Exports find buyers more easily than imports find sellers under sanctions. */
  accessX: number[];
  /** Why access is down. */
  accessWhy: string[];
  /** Exports and imports $bn a year. */
  trade: { x: number; m: number }[];
  /** Occupied share of each nation's people. */
  occupied: number[];
}
