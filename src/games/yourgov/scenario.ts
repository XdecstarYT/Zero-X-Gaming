/**
 * A scenario is everything about the country you play: its map, its parties, its political
 * system (how the legislature is elected, the head of government, the upper house, the
 * calendar, the titles), its economy and the laws in force. The built-in ones are Avalon
 * (made up) and twelve real countries (countries.ts); players can make their own in the
 * studios and share them as a code.
 */
import { LAWS, type Pos } from "./data";
import { cleanName, SHAPES, type MapSpec } from "./map";
import type { Culture } from "./names";

export interface PartyDef {
  id: string;
  name: string;
  short: string;
  color: string;
  pos: Pos;
  ideology: string;
  /** Starting national vote share (0–1). */
  base: number;
  /** Starting vote share in particular regions (by region key). */
  regional?: Record<string, number>;
  /** Stands only in these regions (regional parties). */
  only?: string[];
  /** Parties it won't govern with. */
  refuses?: string[];
  /** An alliance it always fights elections and governs with (shared candidates in districts). */
  bloc?: string;
  /** Doesn't contest elections (crossbenchers, independent appointees). */
  noRun?: boolean;
  /** A group of smaller parties and independents: no candidate for President, never leads a government. */
  others?: boolean;
}

export type LowerSystem = "fptp" | "two-round" | "irv" | "pr" | "mmp" | "parallel";
export type UpperKind = "none" | "elected" | "indirect" | "council" | "appointed";
export type ExecKind = "presidential" | "parliamentary" | "semi";

export const LOWER_SYSTEMS: { id: LowerSystem; name: string; about: string }[] = [
  { id: "fptp", name: "First past the post", about: "One member per district; most votes wins." },
  { id: "two-round", name: "Two-round", about: "Districts; without a majority, the top two meet in a run-off." },
  { id: "irv", name: "Preferential (instant run-off)", about: "Districts; voters rank candidates and the last is eliminated until someone has half." },
  { id: "parallel", name: "Parallel (mixed)", about: "Some members from districts, the rest from party lists, counted separately." },
  { id: "mmp", name: "Mixed-member proportional", about: "District members, topped up from lists so seats match the party vote." },
  { id: "pr", name: "Proportional (party lists)", about: "Seats by share of the vote in each region." },
];
export const UPPER_KINDS: { id: UpperKind; name: string; about: string }[] = [
  { id: "none", name: "None (unicameral)", about: "One chamber passes the laws." },
  { id: "elected", name: "Elected", about: "Elected region by region, often in staggered classes." },
  { id: "indirect", name: "Indirectly elected", about: "Chosen by local and regional politicians, following the vote slowly." },
  { id: "council", name: "Council of the regions", about: "Each region's government casts its votes as a block." },
  { id: "appointed", name: "Appointed", about: "Members appointed for life; the government fills vacancies." },
];
export const EXEC_KINDS: { id: ExecKind; name: string; about: string }[] = [
  { id: "presidential", name: "Presidential", about: "An elected President leads the government, signs or vetoes laws." },
  { id: "parliamentary", name: "Parliamentary", about: "The government needs the confidence of the lower house; coalitions form after elections." },
  { id: "semi", name: "Semi-presidential", about: "An elected President, and a Prime Minister answerable to the legislature." },
];

export interface ChamberNames {
  name: string;
  short: string;
  member: string;
}
export interface LowerDef extends ChamberNames {
  seats: number;
  system: LowerSystem;
  /** Share of the national vote a party needs for list seats. */
  threshold: number;
  /** Mixed systems: the share of seats from lists. */
  listShare: number;
  /** Years between elections. */
  term: number;
  /** Year of the next election. */
  next: number;
  /** Week of the year it's held. */
  week: number;
  /** Fixed seats for some regions (the rest are shared out by population). */
  fixed?: Record<string, number>;
}
export interface UpperDef extends ChamberNames {
  kind: UpperKind;
  /** Seats per region, or (0) seats shared out by population. */
  perRegion: number;
  /** Seats for particular regions. */
  regionSeats?: Record<string, number>;
  /** Total seats when shared out by population, or of an appointed house. */
  seats: number;
  /** National list seats on top. */
  national: number;
  method: "plurality" | "pr" | "limited";
  /** Seats come up in this many classes (2 = halves, 3 = thirds). */
  classes: number;
  term: number;
  next: number;
  week: number;
  /** "weak": the lower house can override it. */
  power: "equal" | "weak";
  /** Appointed or indirectly chosen houses: who sits there today. */
  makeup?: Record<string, number>;
  /** Appointees are independents, not the government's picks. */
  nonpartisan?: boolean;
}
export interface PresDef {
  term: number;
  next: number;
  week: number;
  /** Two-round election. */
  runoff: boolean;
  /** Chosen by an electoral college of the regions (winner takes each region). */
  college: boolean;
}
export interface Titles {
  /** Head of government. */
  head: string;
  /** The directly elected President (presidential and semi-presidential systems). */
  president: string;
  /** Leader of a party. */
  leader: string;
  region: string;
  regions: string;
  regionHead: string;
  regionHeads?: Record<string, string>;
  /** What makes a bill law at the end ("Royal Assent"). */
  assent: string;
  election: string;
  midterm: string;
}
export interface SystemDef {
  exec: ExecKind;
  lower: LowerDef;
  upper: UpperDef;
  pres: PresDef | null;
  /** Presidential: the share of both chambers that overrides a veto. Weak upper houses: the lower house's share that overrides them. */
  override: number;
  /** Voting is compulsory (high turnout). */
  compulsory?: boolean;
  /** Years between regional (governor) elections, staggered. */
  regionTerm: number;
  /** How the chamber is laid out: a horseshoe, or benches facing each other (Westminster). */
  layout?: "hemicycle" | "westminster";
  titles: Titles;
}
export interface Economy {
  /** Currency sign. */
  cur: string;
  /** GDP, trillions. */
  gdp: number;
  growth: number;
  /** Yearly budget balance, billions. */
  budget: number;
  debt: number;
  unemployment: number;
  approval: number;
  happiness: number;
}
export interface Scenario {
  v: 1;
  id: string;
  name: string;
  /** One line about it. */
  about?: string;
  /** Flag to show (a preset's code). */
  flag?: string;
  culture: Culture;
  startYear: number;
  map: MapSpec;
  parties: PartyDef[];
  system: SystemDef;
  economy: Economy;
  /** Starting option for laws (by law id). */
  laws: Record<string, number>;
  /** Who holds office at the start (else it follows the opening election). */
  start?: {
    pres?: string;
    gov?: string[];
    /** Seats each party holds in the lower and upper houses today. */
    lower?: Record<string, number>;
    upper?: Record<string, number>;
    /** The party governing each region today. */
    regions?: Record<string, string>;
  };
}

// ------------------------------------------------------------------ Avalon

export const AVALON_PARTIES: PartyDef[] = [
  { id: "lab", name: "People's Labour", short: "PL", color: "#e0453a", pos: { e: -0.65, s: -0.1 }, ideology: "Socialism", base: 0.12 },
  { id: "com", name: "Commonwealth Party", short: "CP", color: "#3d6fd8", pos: { e: -0.25, s: -0.35 }, ideology: "Social democracy", base: 0.3 },
  { id: "ctr", name: "Centre Forward", short: "CF", color: "#f2f2f2", pos: { e: 0.05, s: 0 }, ideology: "Centrism", base: 0.155 },
  { id: "lib", name: "Liberty Alliance", short: "LA", color: "#f0b429", pos: { e: 0.6, s: -0.45 }, ideology: "Libertarianism", base: 0.085 },
  { id: "her", name: "Heritage Union", short: "HU", color: "#9b4fd6", pos: { e: 0.45, s: 0.6 }, ideology: "Conservatism", base: 0.18 },
  { id: "grn", name: "Green Front", short: "GF", color: "#34b25a", pos: { e: -0.4, s: -0.65 }, ideology: "Environmentalism", base: 0.155 },
];

export const AVALON_SYSTEM: SystemDef = {
  exec: "presidential",
  lower: { name: "House of Representatives", short: "House", member: "Representative", seats: 100, system: "fptp", threshold: 0.03, listShare: 0.5, term: 2, next: 2046, week: 45 },
  upper: { name: "Senate", short: "Senate", member: "Senator", kind: "elected", perRegion: 2, seats: 0, national: 0, method: "plurality", classes: 1, term: 4, next: 2046, week: 45, power: "equal" },
  pres: { term: 4, next: 2046, week: 45, runoff: true, college: false },
  override: 2 / 3,
  regionTerm: 4,
  titles: { head: "President", president: "President", leader: "Secretary", region: "state", regions: "states", regionHead: "Governor", assent: "the President's signature", election: "General election", midterm: "Midterm election" },
};

export function avalon(seed: number): Scenario {
  return {
    v: 1,
    id: "avalon",
    name: "Avalon",
    about: "The Federation of Avalon: a made-up country of sixteen states, new every game.",
    flag: "avalon",
    culture: "en",
    startYear: 2046,
    map: { kind: "gen", seed, name: "Avalon", shape: "continent", regions: 16, counties: 950, mountains: 0.5, lakes: 0.5, cities: 24 },
    parties: AVALON_PARTIES.map((p) => ({ ...p })),
    system: structuredClone(AVALON_SYSTEM),
    economy: { cur: "$", gdp: 18, growth: 1.8, budget: -40, debt: 9000, unemployment: 6, approval: 48, happiness: 20 },
    laws: {},
  };
}

// ------------------------------------------------------------------ checking

export const MAX_PARTIES = 12;
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const keyMap = (o: unknown, lo: number, hi: number): Record<string, number> | undefined => {
  if (!o || typeof o !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>).slice(0, 80)) {
    const key = cleanName(k, 48);
    if (key) out[key] = num(v, lo, hi, lo);
  }
  return out;
};
const slug = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 8);

/** Tidy a party someone made in the Party Studio (or read from a share code). */
export function checkParty(p: Partial<PartyDef>, taken: string[] = []): PartyDef | string {
  const name = cleanName(p.name, 40);
  if (name.length < 2) return "Give the party a name.";
  const short = cleanName(p.short, 6) || name.slice(0, 3).toUpperCase();
  const color = HEX.test(String(p.color)) ? String(p.color).toLowerCase() : "#888888";
  let id = cleanName(p.id, 12).replace(/[^a-z0-9-]/gi, "").toLowerCase() || slug(short) || "party";
  for (let k = 2; taken.includes(id); k++) id = `${id.replace(/\d+$/, "")}${k}`;
  return {
    id,
    name,
    short,
    color,
    pos: { e: num(p.pos?.e, -1, 1, 0), s: num(p.pos?.s, -1, 1, 0) },
    ideology: cleanName(p.ideology, 32) || "Independent",
    base: num(p.base, 0, 0.9, 0.1),
    regional: keyMap(p.regional, 0, 1),
    only: Array.isArray(p.only) ? p.only.map((x) => cleanName(x, 48)).filter(Boolean).slice(0, 60) : undefined,
    refuses: Array.isArray(p.refuses) ? p.refuses.map((x) => cleanName(x, 12)).filter(Boolean).slice(0, MAX_PARTIES) : undefined,
    bloc: cleanName(p.bloc, 12) || undefined,
    noRun: p.noRun ? true : undefined,
    others: p.others ? true : undefined,
  };
}

/** Check and tidy a whole scenario. Returns it, or why it won't work. */
export function checkScenario(raw: unknown): Scenario | string {
  if (!raw || typeof raw !== "object") return "That isn't a scenario.";
  const sc = raw as Partial<Scenario>;
  const name = cleanName(sc.name, 40);
  if (name.length < 2) return "Give the country a name.";
  // The map.
  const m = sc.map as MapSpec | undefined;
  let map: MapSpec;
  if (m?.kind === "real") {
    if (typeof m.code !== "string" || !/^[a-z]{2}$/.test(m.code)) return "Unknown map.";
    map = { kind: "real", code: m.code, counties: Math.round(num(m.counties, 300, 1600, 1000)), pops: keyMap(m.pops, 0.001, 2000) ?? {}, min: keyMap(m.min, 0, 400) };
  } else if (m?.kind === "gen") {
    map = {
      kind: "gen",
      seed: Math.round(num(m.seed, 1, 1e9, 1)),
      name: cleanName(m.name, 32) || name,
      shape: pick(m.shape, SHAPES.map((x) => x.id), "continent"),
      regions: Math.round(num(m.regions, 3, 30, 16)),
      counties: Math.round(num(m.counties, 300, 1400, 950)),
      mountains: num(m.mountains, 0, 1, 0.5),
      lakes: num(m.lakes, 0, 1, 0.5),
      cities: Math.round(num(m.cities, 6, 40, 24)),
      names: Array.isArray(m.names) ? m.names.slice(0, 30).map((x) => cleanName(x, 24)) : undefined,
    };
  } else return "The scenario needs a map.";
  // Parties.
  if (!Array.isArray(sc.parties) || sc.parties.length < 2) return "A country needs at least two parties.";
  if (sc.parties.length > MAX_PARTIES) return `At most ${MAX_PARTIES} parties.`;
  const parties: PartyDef[] = [];
  for (const p of sc.parties) {
    const ok = checkParty(p, parties.map((x) => x.id));
    if (typeof ok === "string") return ok;
    parties.push(ok);
  }
  if (parties.filter((p) => !p.noRun).length < 2) return "At least two parties must stand in elections.";
  // The system.
  const s = (sc.system ?? {}) as Partial<SystemDef>;
  const lo = (s.lower ?? {}) as Partial<LowerDef>;
  const up = (s.upper ?? {}) as Partial<UpperDef>;
  const t = (s.titles ?? {}) as Partial<Titles>;
  const startYear = Math.round(num(sc.startYear, 1900, 2200, 2026));
  const exec = pick(s.exec, ["presidential", "parliamentary", "semi"] as const, "presidential");
  const kind = pick(up.kind, ["none", "elected", "indirect", "council", "appointed"] as const, "none");
  const titleOr = (v: unknown, d: string, max = 32) => cleanName(v, max) || d;
  const system: SystemDef = {
    exec,
    lower: {
      name: titleOr(lo.name, "Assembly", 40),
      short: titleOr(lo.short, "Assembly", 20),
      member: titleOr(lo.member, "Member", 24),
      seats: Math.round(num(lo.seats, 20, 800, 100)),
      system: pick(lo.system, LOWER_SYSTEMS.map((x) => x.id), "fptp"),
      threshold: num(lo.threshold, 0, 0.15, 0.03),
      listShare: num(lo.listShare, 0.1, 0.9, 0.5),
      term: Math.round(num(lo.term, 1, 7, 4)),
      next: Math.round(num(lo.next, startYear, startYear + 7, startYear + 1)),
      week: Math.round(num(lo.week, 2, 50, 45)),
      fixed: keyMap(lo.fixed, 0, 200),
    },
    upper: {
      kind,
      name: titleOr(up.name, "Senate", 40),
      short: titleOr(up.short, "Senate", 20),
      member: titleOr(up.member, "Senator", 24),
      perRegion: Math.round(num(up.perRegion, 0, 20, 2)),
      regionSeats: keyMap(up.regionSeats, 0, 60),
      seats: Math.round(num(up.seats, 0, 900, 0)),
      national: Math.round(num(up.national, 0, 200, 0)),
      method: pick(up.method, ["plurality", "pr", "limited"] as const, "plurality"),
      classes: Math.round(num(up.classes, 1, 3, 1)),
      term: Math.round(num(up.term, 1, 9, 4)),
      next: Math.round(num(up.next, startYear, startYear + 9, startYear + 1)),
      week: Math.round(num(up.week, 2, 50, 45)),
      power: pick(up.power, ["equal", "weak"] as const, "equal"),
      makeup: keyMap(up.makeup, 0, 900),
      nonpartisan: up.nonpartisan ? true : undefined,
    },
    pres: null,
    override: num(s.override, 0.5, 0.9, 2 / 3),
    compulsory: s.compulsory ? true : undefined,
    regionTerm: Math.round(num(s.regionTerm, 2, 7, 4)),
    layout: s.layout === "westminster" ? "westminster" : "hemicycle",
    titles: {
      head: titleOr(t.head, exec === "presidential" ? "President" : "Prime Minister"),
      president: titleOr(t.president, "President"),
      leader: titleOr(t.leader, "Leader"),
      region: titleOr(t.region, "region"),
      regions: titleOr(t.regions, "regions"),
      regionHead: titleOr(t.regionHead, "Governor"),
      regionHeads: s.titles?.regionHeads ? Object.fromEntries(Object.entries(s.titles.regionHeads).slice(0, 60).map(([k, v]) => [cleanName(k, 48), cleanName(v, 32)])) : undefined,
      assent: titleOr(t.assent, "the head of state's assent", 48),
      election: titleOr(t.election, "General election"),
      midterm: titleOr(t.midterm, "Midterm election"),
    },
  };
  if (exec !== "parliamentary") {
    const p = (s.pres ?? {}) as Partial<PresDef>;
    system.pres = { term: Math.round(num(p.term, 2, 8, 4)), next: Math.round(num(p.next, startYear, startYear + 8, startYear + 1)), week: Math.round(num(p.week, 2, 50, 45)), runoff: p.runoff !== false, college: !!p.college };
  }
  if (system.upper.kind === "appointed" && system.upper.seats < 10) system.upper.seats = Math.max(20, Math.round(system.lower.seats / 3));
  // A generated map needs more counties than districts.
  if (map.kind === "gen" && ["fptp", "two-round", "irv"].includes(system.lower.system)) map.counties = Math.min(1400, Math.max(map.counties, Math.ceil(system.lower.seats * 1.25)));
  // Economy.
  const e = (sc.economy ?? {}) as Partial<Economy>;
  const economy: Economy = {
    cur: cleanName(e.cur, 4) || "$",
    gdp: num(e.gdp, 0.01, 2000, 18),
    growth: num(e.growth, -5, 10, 1.8),
    budget: num(e.budget, -1e6, 1e6, -40),
    debt: num(e.debt, 0, 1e7, 9000),
    unemployment: num(e.unemployment, 1, 30, 6),
    approval: num(e.approval, 5, 95, 48),
    happiness: num(e.happiness, -20, 50, 20),
  };
  const laws: Record<string, number> = {};
  for (const l of LAWS) {
    const v = (sc.laws as Record<string, number> | undefined)?.[l.id];
    if (v !== undefined && Number.isInteger(v) && v >= 0 && v < l.options.length) laws[l.id] = v;
  }
  const ids = parties.map((p) => p.id);
  const seatsOf = (o: unknown) => {
    const m = keyMap(o, 0, 900);
    return m && Object.keys(m).every((k) => ids.includes(k)) ? m : undefined;
  };
  const start = sc.start
    ? {
        pres: ids.includes(String(sc.start.pres)) ? String(sc.start.pres) : undefined,
        gov: Array.isArray(sc.start.gov) ? sc.start.gov.filter((g) => ids.includes(g)) : undefined,
        lower: seatsOf(sc.start.lower),
        upper: seatsOf(sc.start.upper),
        regions: sc.start.regions ? Object.fromEntries(Object.entries(sc.start.regions).filter(([, v]) => ids.includes(v)).slice(0, 80)) : undefined,
      }
    : undefined;
  return {
    v: 1,
    id: cleanName(sc.id, 40).replace(/[^a-z0-9-]/gi, "") || "custom",
    name,
    about: cleanName(sc.about, 140) || undefined,
    flag: cleanName(sc.flag, 12) || undefined,
    culture: pick(sc.culture, ["en", "de", "fr", "es", "it", "ja", "hi", "pt"] as const, "en"),
    startYear,
    map,
    parties,
    system,
    economy,
    laws,
    start,
  };
}

// ------------------------------------------------------------------ share codes

const PREFIX = "YG1.";

/** A scenario as a code to paste somewhere (base64 of its JSON). */
export function shareCode(sc: Scenario) {
  const bytes = new TextEncoder().encode(JSON.stringify(sc));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Read a share code back (checked like anything a player typed). */
export function readCode(code: string): Scenario | string {
  const t = code.trim();
  if (!t.startsWith(PREFIX)) return "That isn't a YourGov scenario code.";
  try {
    const b64 = t.slice(PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return checkScenario(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return "That code is damaged.";
  }
}
