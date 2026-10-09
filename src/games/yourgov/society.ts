/**
 * The country beyond the economy: eight society indices (crime, health, schools, the
 * environment, housing, inequality, infrastructure and trust in politics) that follow the
 * laws, the policies you deliver and the economy; five industries and the trade balance; house
 * prices; protest movements that form when a group feels ignored; the seasons; and the big
 * sporting moments.
 *
 * Works on sim.ts's state and seeded stream; nothing at the top level uses another module's
 * values (sim.ts imports this file and this file imports sim.ts).
 */
import { LAW, WEEKS, type PartyId } from "./data";
import * as P from "./politics";
import * as G from "./sim";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// ------------------------------------------------------------------ the indices

export type SocKey = "crime" | "health" | "education" | "environment" | "housing" | "inequality" | "infrastructure" | "trust";
export const SOC: { id: SocKey; name: string; icon: string; low?: boolean; about: string }[] = [
  { id: "crime", name: "Crime", icon: "🚔", low: true, about: "Police, prisons, guns and jobs." },
  { id: "health", name: "Health", icon: "🏥", about: "Hospitals, waiting lists and how people live." },
  { id: "education", name: "Schools", icon: "📚", about: "Schools, universities and skills." },
  { id: "environment", name: "Environment", icon: "🌿", about: "Clean air, rivers and the climate." },
  { id: "housing", name: "Housing", icon: "🏘️", about: "Can people afford a home?" },
  { id: "inequality", name: "Inequality", icon: "⚖️", low: true, about: "The gap between rich and poor." },
  { id: "infrastructure", name: "Infrastructure", icon: "🌉", about: "Roads, rail, broadband and power." },
  { id: "trust", name: "Trust in politics", icon: "🤝", about: "Promises kept, honest government." },
];
export const SOC_KEYS = SOC.map((x) => x.id);

/** What each law's options do to the indices (absolute, so countries start in different places). */
const LAW_SOC: Record<string, Partial<Record<SocKey, number[]>>> = {
  police: { crime: [8, 0, -7] },
  prisonReform: { crime: [-3, 0, -1], trust: [0, 0, 1] },
  gunPolicy: { crime: [-4, 0, 6] },
  drugPolicy: { crime: [2, -1, -2], health: [0, 2, 1] },
  healthcare: { health: [-10, 0, 10], inequality: [5, 0, -4] },
  sugarTax: { health: [0, 2, 4] },
  pensions: { inequality: [5, 0, -4] },
  education: { education: [-10, 0, 10], inequality: [4, 0, -3] },
  welfare: { inequality: [8, 0, -10], crime: [3, 0, -2] },
  minimumWage: { inequality: [6, 3, 0, -3, -6] },
  incomeTax: { inequality: [6, 4, 2, 0, -2, -4, -6] },
  wealthTax: { inequality: [0, -4, -8] },
  energy: { environment: [-10, 0, 10] },
  carbonTax: { environment: [0, 5, 10] },
  animalWelfare: { environment: [-3, 0, 4] },
  transport: { environment: [-2, 0, 5], infrastructure: [-6, 0, 6] },
  stimulus: { infrastructure: [0, 10, 2] },
  housing: { housing: [-8, 0, 10] },
  rentControl: { housing: [0, 6, 8] },
  speech: { trust: [-10, 0, 2] },
  campaignFinance: { trust: [6, 0, -8] },
  termLimits: { trust: [2, 0, -5] },
  publicBroadcaster: { trust: [-3, 0, 2] },
  dataPrivacy: { trust: [-3, 0, 3] },
  compulsoryVoting: { trust: [0, 2] },
  nationalService: { crime: [0, -1, -2] },
  aiRules: { trust: [-2, 0, 1] },
};

/** Industries: their weight in the economy at the start, and what the laws do to them (points of growth a year). */
export type SectorKey = "agriculture" | "manufacturing" | "services" | "tech" | "energy";
export const SECTORS: { id: SectorKey; name: string; icon: string; share: number }[] = [
  { id: "agriculture", name: "Farming", icon: "🌾", share: 0.04 },
  { id: "manufacturing", name: "Manufacturing", icon: "🏭", share: 0.17 },
  { id: "services", name: "Services", icon: "🏦", share: 0.62 },
  { id: "tech", name: "Technology", icon: "💻", share: 0.1 },
  { id: "energy", name: "Energy", icon: "⚡", share: 0.07 },
];
const LAW_SECTOR: Record<string, Partial<Record<SectorKey, number[]>>> = {
  trade: { agriculture: [1, 0, -1], manufacturing: [1.5, 0, -1], services: [-0.5, 0, 1] },
  subsidies: { manufacturing: [-1, 0, 1.5], agriculture: [-1, 0, 1] },
  energy: { energy: [1.5, 0, -1], manufacturing: [0.5, 0, -0.5] },
  carbonTax: { energy: [0, -0.5, -1.5], manufacturing: [0, -0.3, -0.8] },
  aiRules: { tech: [1, 0, -1.5] },
  dataPrivacy: { tech: [0.5, 0, -0.5] },
  education: { tech: [-1, 0, 1] },
  immigration: { services: [-0.5, 0, 0.5], agriculture: [-1, 0, 0.5] },
  fourDayWeek: { services: [0, -0.2, -0.6], manufacturing: [0, -0.2, -0.6] },
  corporateTax: { tech: [0.75, 0.5, 0.25, 0, -0.25, -0.5, -0.75], manufacturing: [0.45, 0.3, 0.15, 0, -0.15, -0.3, -0.45] },
  animalWelfare: { agriculture: [0.5, 0, -0.5] },
};
/** Crises that hit an industry when they break (a one-off change to its output, as a share). */
const CRISIS_SECTOR: Record<string, Partial<Record<SectorKey, number>>> = { oil: { energy: 0.05, manufacturing: -0.02 }, drought: { agriculture: -0.08 }, factory: { manufacturing: -0.02 }, techhq: { tech: 0.03 }, bank: { services: -0.03 }, cyber: { tech: -0.02 }, heatwave: { agriculture: -0.03 }, crash: { services: -0.04, tech: -0.05 } };
/** Crises that knock an index (natural units). */
const CRISIS_SOC: Record<string, Partial<Record<SocKey, number>>> = { pandemic: { health: -8 }, flood: { infrastructure: -4, housing: -2 }, storm: { infrastructure: -5 }, wildfire: { environment: -5 }, corruption: { trust: -6 }, housing: { housing: -5 }, bridge: { infrastructure: -6, trust: -2 }, quake: { infrastructure: -8, housing: -3 }, spill: { environment: -7 }, heatwave: { health: -3 }, nurses: { health: -3 }, dataLeak: { trust: -4 } };

export interface Protest {
  id: number;
  def: string;
  /** 0–100: how big it has grown. */
  size: number;
  week: number;
  /** The change it demands, and where the law stood when it began. */
  law: string;
  dir: number;
  from: number;
  /** Last week you met it, policed it or marched with it. */
  acted: number;
}

export interface Sport {
  name: string;
  year: number;
  /** 0 out in the groups … 4 lost the final, 5 champions. */
  stage: number;
  revealed: boolean;
  watched: boolean;
}

export interface SocPoint {
  w: number;
  v: number[];
}

export interface Society {
  idx: Record<SocKey, number>;
  idx0: Record<SocKey, number>;
  /** One-off shocks to the targets (crises, orders), fading over a year or so. */
  bonus: Record<SocKey, number>;
  /** Industries' output, 100 at the start. */
  sectors: Record<SectorKey, number>;
  /** Trade balance, % of GDP. */
  trade: number;
  /** House prices, 100 at the start. */
  homes: number;
  /** The laws as they were at the start (industries move with changes from here). */
  law0: Record<string, number>;
  protests: Protest[];
  nextProtest: number;
  nextId: number;
  sport: Sport | null;
  hist: SocPoint[];
  econ0: { unemployment: number; happiness: number; growth: number; approval: number };
}

const zero = (): Record<SocKey, number> => Object.fromEntries(SOC_KEYS.map((k) => [k, 0])) as Record<SocKey, number>;

/** Where an index is heading (natural units: a higher crime number is more crime). */
export function socTarget(s: G.GameState, k: SocKey) {
  let v = 50;
  for (const [law, row] of Object.entries(LAW_SOC)) {
    const arr = row[k];
    if (!arr) continue;
    const o = s.laws[law] ?? LAW[law]?.start ?? 0;
    v += arr[o] ?? 0;
  }
  const so = s.soc;
  if (!so) return v;
  const st = s.stats;
  const e0 = so.econ0;
  if (k === "crime") v += (st.unemployment - e0.unemployment) * 1.5 - (st.happiness - e0.happiness) * 0.1;
  else if (k === "environment") v -= (st.growth - e0.growth) * 1.5;
  else if (k === "housing") v -= (so.homes - 100) * 0.25;
  else if (k === "inequality") v += (st.unemployment - e0.unemployment) * 1.2;
  else if (k === "trust") v += (st.approval - e0.approval) * 0.15;
  v += so.bonus[k] ?? 0;
  v += policyPull(s, k);
  return clamp(v, 2, 98);
}

/** Delivered policies, treaties and the government's priority pulling an index (natural units). */
function policyPull(s: G.GameState, k: SocKey) {
  const low = !!SOC.find((x) => x.id === k)?.low;
  let good = 0;
  for (const p of s.studio?.policies ?? []) if (p.status === "delivered" && areaSoc(p.area) === k) good += p.impact;
  good += s.wd ? treatySoc(s, k) : 0;
  if (s.ox && s.gov.head === s.you) {
    if (s.ox.priority === "security" && k === "crime") good += 4;
    if (s.ox.priority === "environment" && k === "environment") good += 5;
    if (s.ox.priority === "reform" && k === "trust") good += 5;
    if (s.ox.priority === "services" && (k === "health" || k === "education")) good += 2;
  }
  return low ? -good : good;
}

/** The index a policy area moves. */
const AREA_SOC: Record<string, SocKey> = { health: "health", education: "education", environment: "environment", crime: "crime", housing: "housing", welfare: "inequality", tech: "infrastructure", culture: "trust" };
export const areaSoc = (area: string): SocKey | null => AREA_SOC[area] ?? null;

function treatySoc(s: G.GameState, k: SocKey) {
  const t = s.wd.treaties;
  let v = 0;
  if (t.climate !== undefined && k === "environment") v += 5;
  if (t.extradition !== undefined && k === "crime") v += 3;
  return v;
}

/** How good an index is, 0–100 (crime and inequality are turned round). */
export const goodness = (k: SocKey, v: number) => (SOC.find((x) => x.id === k)?.low ? 100 - v : v);

/** Years people can expect to live. */
export const lifeExpectancy = (s: G.GameState) => Math.round((70 + (s.soc?.idx.health ?? 50) * 0.13 + (100 - (s.soc?.idx.inequality ?? 50)) * 0.04 - (s.soc?.idx.crime ?? 50) * 0.01) * 10) / 10;

/** What society does to the economy each week (folded into sim.ts's economy). */
export function societyFx(s: G.GameState) {
  const so = s.soc;
  if (!so) return { happiness: 0, growth: 0 };
  let happy = 0;
  for (const k of SOC_KEYS) happy += (goodness(k, so.idx[k]) - goodness(k, so.idx0[k])) * 0.02;
  const growth = (goodness("education", so.idx.education) - goodness("education", so.idx0.education)) * 0.004 + (so.idx.infrastructure - so.idx0.infrastructure) * 0.004;
  return { happiness: clamp(happy, -3, 3), growth: clamp(growth, -0.25, 0.25) };
}

/** Knock (or lift) an index: natural units, fading over a year or so. */
export function shift(s: G.GameState, k: SocKey, v: number) {
  if (!s.soc) return;
  s.soc.bonus[k] = clamp((s.soc.bonus[k] ?? 0) + v, -30, 30);
}

/** The same in "good" units (+ is better whichever way the index runs). */
export function improve(s: G.GameState, k: SocKey, good: number) {
  shift(s, k, SOC.find((x) => x.id === k)?.low ? -good : good);
}

// ------------------------------------------------------------------ industries

function sectorGrowth(s: G.GameState, k: SectorKey) {
  let v = 0;
  for (const [law, row] of Object.entries(LAW_SECTOR)) {
    const arr = row[k];
    if (!arr) continue;
    const now = s.laws[law] ?? 0;
    const then = s.soc.law0[law] ?? now;
    v += (arr[now] ?? 0) - (arr[then] ?? 0);
  }
  const cycle = s.wd?.cycle ?? 0;
  if (k === "manufacturing" || k === "energy") v += cycle * 1;
  if (k === "tech") v += cycle * 0.5;
  return v;
}

/** Each industry's share of the economy now. */
export function sectorShares(s: G.GameState) {
  const tot = SECTORS.reduce((a, x) => a + x.share * (s.soc.sectors[x.id] ?? 100), 0) || 1;
  return Object.fromEntries(SECTORS.map((x) => [x.id, (x.share * (s.soc.sectors[x.id] ?? 100)) / tot])) as Record<SectorKey, number>;
}

/** Points of growth a year the industries add (a strong tech sector lifts everyone). */
export function sectorFx(s: G.GameState) {
  if (!s.soc) return 0;
  const sh = sectorShares(s);
  return clamp(SECTORS.reduce((a, x) => a + sh[x.id] * sectorGrowth(s, x.id), 0) * 0.3, -0.3, 0.3);
}

// ------------------------------------------------------------------ protests

export interface ProtestDef {
  id: string;
  name: string;
  icon: string;
  group: string;
  law: string;
  dir: number;
  /** When it's likely: an index past a point, or rising prices. */
  when: (s: G.GameState) => boolean;
}
export const PROTESTS: ProtestDef[] = [
  { id: "climate", name: "Climate strike", icon: "🌍", group: "green", law: "carbonTax", dir: 1, when: (s) => s.soc.idx.environment < 48 },
  { id: "farmers", name: "Farmers' tractor blockade", icon: "🚜", group: "rural", law: "subsidies", dir: 1, when: (s) => (s.soc.sectors.agriculture ?? 100) < 98 || s.laws.carbonTax >= 1 },
  { id: "tenants", name: "Tenants' march", icon: "🏘️", group: "young", law: "rentControl", dir: 1, when: (s) => s.soc.idx.housing < 46 },
  { id: "fuel", name: "Fuel price protest", icon: "⛽", group: "workers", law: "carbonTax", dir: -1, when: (s) => (s.mk?.inflation ?? 2) > 4 || s.laws.carbonTax >= 1 },
  { id: "students", name: "Students against fees", icon: "🎓", group: "young", law: "education", dir: 1, when: (s) => s.soc.idx.education < 48 },
  { id: "pensioners", name: "Pensioners' rally", icon: "🧓", group: "retirees", law: "pensions", dir: 1, when: (s) => s.laws.pensions === 0 || s.laws.retirementAge === 2 },
  { id: "nurses", name: "Save our hospitals march", icon: "🏥", group: "retirees", law: "healthcare", dir: 1, when: (s) => s.soc.idx.health < 46 },
  { id: "order", name: "Law and order march", icon: "🚨", group: "faith", law: "police", dir: 1, when: (s) => s.soc.idx.crime > 55 },
  { id: "taxes", name: "Tax revolt", icon: "🧾", group: "business", law: "incomeTax", dir: -1, when: (s) => (s.laws.incomeTax ?? 3) >= 4 || s.laws.wealthTax >= 1 },
  { id: "pay", name: "Strike for fair pay", icon: "✊", group: "workers", law: "minimumWage", dir: 1, when: (s) => s.soc.idx.inequality > 54 },
];
export const PROTEST: Record<string, ProtestDef> = Object.fromEntries(PROTESTS.map((p) => [p.id, p]));
export const PROTEST_MAX = 2;

/** The government's party (the one that answers for a protest). */
const govParty = (s: G.GameState): PartyId | undefined => s.gov.parties[0];

function maybeProtest(s: G.GameState) {
  const so = s.soc;
  if (s.week < so.nextProtest || so.protests.length >= PROTEST_MAX) return;
  const r = G.roll(s);
  const live = new Set(so.protests.map((p) => p.def));
  const ripe = PROTESTS.filter((d) => !live.has(d.id) && d.when(s) && G.lawOf(s, d.law)?.options[(s.laws[d.law] ?? 0) + d.dir]);
  if (!ripe.length || r.next() > 0.12) return;
  const d = r.pick(ripe);
  so.protests.push({ id: so.nextId++, def: d.id, size: 20 + r.int(0, 15), week: s.week, law: d.law, dir: d.dir, from: s.laws[d.law] ?? 0, acted: -1 });
  so.nextProtest = s.week + 10 + r.int(0, 10);
  G.news(s, "event", `${d.icon} ${d.name}: thousands take to the streets`, s.gov.parties.includes(s.party) ? -1 : 0);
}

function protestsWeek(s: G.GameState) {
  const so = s.soc;
  const mine = s.gov.parties.includes(s.party);
  for (const p of [...so.protests]) {
    const d = PROTEST[p.def];
    // Won: the law moved the way they wanted (moved the other way, they come back angrier).
    const l = G.lawOf(s, p.law);
    const at = s.laws[p.law] ?? 0;
    const moved = Math.sign(at - p.from);
    if (!d || !l || moved === p.dir) {
      so.protests = so.protests.filter((x) => x !== p);
      if (d) G.news(s, "event", `${d.name}: the protesters go home with what they wanted`, 0);
      continue;
    }
    if (moved === -p.dir) {
      p.from = at;
      p.size = clamp(p.size + 15, 0, 100);
      G.news(s, "event", `${d.name}: anger grows after the change to ${l.name.toLowerCase()}`, -1);
    }
    const emergency = (s.ox?.emergency ?? -1) >= s.week;
    p.size = clamp(p.size + (s.week - p.acted > 2 ? 1.5 : 0) - (emergency ? 4 : 0), 0, 100);
    if (p.size <= 0 || s.week - p.week > 30) {
      so.protests = so.protests.filter((x) => x !== p);
      G.news(s, "event", `${d.name} fizzles out`, mine ? 1 : 0);
      continue;
    }
    // A big protest wears on the government, and on its standing with the group.
    if (govParty(s)) s.stats.approval = clamp(s.stats.approval - p.size * 0.0025, 5, 95);
    if (mine) s.goodwill[d.group] = clamp((s.goodwill[d.group] ?? 0) - p.size * 0.01, -40, 60);
  }
}

export type ProtestAction = "meet" | "police" | "concede" | "join";

/** Answer a protest. Returns why you can't, or null. */
export function answerProtest(s: G.GameState, id: number, a: ProtestAction): string | null {
  const p = s.soc.protests.find((x) => x.id === id);
  if (!p) return "That protest is over.";
  const d = PROTEST[p.def];
  const ps = s.parties[s.party];
  const mine = s.gov.parties.includes(s.party);
  const head = s.gov.head === s.you;
  const why = a === "meet" && ps.funds < 0.3 ? "Not enough party funds." : a === "police" && !head ? `Only the ${G.titles(s).head} can send in the police.` : a === "concede" && !mine ? "Only a party in government can promise them that." : a === "join" && mine ? "You can't march against your own government." : null;
  if (why) return why;
  if (p.acted === s.week) return "You've already answered it this week.";
  const r = G.roll(s);
  if (a === "meet") {
    ps.funds -= 0.3;
    p.size = clamp(p.size - (mine ? 12 : 6), 0, 100);
    P.courtGroup(s, d.group, 3);
    G.news(s, "event", `${G.fullName(G.pol(s, s.you)!)} meets the organisers of the ${d.name.toLowerCase()}`, 1);
  } else if (a === "police") {
    p.size = clamp(p.size - 25, 0, 100);
    P.courtGroup(s, "retirees", 2);
    P.courtGroup(s, "young", -4);
    if (r.next() < 0.18) {
      s.stats.approval = clamp(s.stats.approval - 3, 5, 95);
      shift(s, "trust", -3);
      P.pressEvent(s, -4);
      G.news(s, "event", `Clashes at the ${d.name.toLowerCase()}: police are accused of heavy-handedness`, -1);
    } else G.news(s, "event", `Police clear the ${d.name.toLowerCase()}`, 0);
  } else if (a === "concede") {
    G.addPledge(s, p.law, p.dir);
    P.courtGroup(s, d.group, 8);
    s.soc.protests = s.soc.protests.filter((x) => x !== p);
    noteEnd(s);
    G.news(s, "event", `The government gives way to the ${d.name.toLowerCase()} and promises a change to ${G.lawOf(s, p.law)?.name.toLowerCase()}`, 0);
    return null;
  } else if (a === "join") {
    P.courtGroup(s, d.group, 6);
    ps.swing += 0.008;
    P.pressEvent(s, -1);
    p.size = clamp(p.size + 6, 0, 100);
    G.news(s, "event", `${G.fullName(G.pol(s, s.you)!)} joins the ${d.name.toLowerCase()}`, 1);
  }
  p.acted = s.week;
  if (p.size <= 0) {
    s.soc.protests = s.soc.protests.filter((x) => x !== p);
    noteEnd(s);
  }
  return null;
}

function noteEnd(s: G.GameState) {
  s.counters.protestsEnded = (s.counters.protestsEnded ?? 0) + 1;
}

// ------------------------------------------------------------------ seasons and sport

export type Season = "spring" | "summer" | "autumn" | "winter";
const SOUTH = new Set(["au", "br"]);
/** The season in a week (the southern hemisphere's are the other way round). */
export function season(s: G.GameState, week = s.week): Season {
  const w = G.weekOf(week);
  const north: Season = w >= 10 && w <= 22 ? "spring" : w >= 23 && w <= 35 ? "summer" : w >= 36 && w <= 48 ? "autumn" : "winter";
  if (!(s.sc.map.kind === "real" && SOUTH.has(s.sc.map.code))) return north;
  return ({ spring: "autumn", summer: "winter", autumn: "spring", winter: "summer" } as const)[north];
}
export const SEASON_ICON: Record<Season, string> = { spring: "🌱", summer: "☀️", autumn: "🍂", winter: "❄️" };
/** Crises the season makes likelier. */
export const SEASON_CRISES: Record<Season, string[]> = { spring: ["flood"], summer: ["wildfire", "drought", "heatwave"], autumn: ["storm"], winter: ["pandemic", "storm", "nurses"] };

const STAGES = ["out in the group stage", "out in the last sixteen", "out in the quarter-finals", "out in the semi-finals", "beaten in the final", "champions"];
export const stageText = (n: number) => STAGES[n] ?? STAGES[0];
export const SPORT_START = 25;
export const SPORT_FINAL = 28;

function sportWeek(s: G.GameState) {
  const so = s.soc;
  const y = G.yearOf(s);
  const w = G.weekOf(s.week);
  if (y % 2 !== 0) return;
  const name = y % 4 === 2 ? "World Cup" : "Olympic Games";
  if (w === SPORT_START - 1 && so.sport?.year !== y) {
    const r = G.roll(s).next();
    const odds = [0.25, 0.25, 0.2, 0.15, 0.08, 0.07];
    let acc = 0;
    let stage = 0;
    for (let i = 0; i < odds.length; i++) {
      acc += odds[i];
      if (r < acc) {
        stage = i;
        break;
      }
    }
    so.sport = { name, year: y, stage, revealed: false, watched: false };
    G.news(s, "event", `The ${name} begin: the whole country is watching`, 0);
  }
  const sp = so.sport;
  if (sp && sp.year === y && !sp.revealed && w === SPORT_FINAL) {
    sp.revealed = true;
    const lift = [-0.5, 0, 0.3, 0.6, 0.8, 2][sp.stage];
    s.boosts.happiness += lift;
    if (sp.watched && sp.stage === 0) s.parties[s.party].swing -= 0.005;
    G.news(s, "event", `${sp.name}: the national team are ${stageText(sp.stage)}`, sp.stage >= 3 ? 1 : sp.stage === 0 ? -1 : 0);
  }
}

/** During a tournament: watch a match with the fans. */
export function watchSport(s: G.GameState): string | null {
  const sp = s.soc.sport;
  const w = G.weekOf(s.week);
  if (!sp || sp.year !== G.yearOf(s) || sp.revealed || w < SPORT_START - 1 || w > SPORT_FINAL) return "There's no tournament on.";
  if (sp.watched) return "You've already been to a match.";
  const ps = s.parties[s.party];
  if (ps.funds < 0.3) return "Not enough party funds.";
  ps.funds -= 0.3;
  sp.watched = true;
  const camp = s.campaign[s.party];
  for (let i = 0; i < camp.length; i++) camp[i] = clamp(camp[i] + 1.2, -20, 40);
  G.news(s, "event", `${G.fullName(G.pol(s, s.you)!)} watches the ${sp.name} with fans`, 1);
  return null;
}

// ------------------------------------------------------------------ setup and the week

export function initSociety(s: G.GameState) {
  if (s.soc) {
    s.soc.protests ??= [];
    return;
  }
  const st = s.stats;
  s.soc = {
    idx: zero(),
    idx0: zero(),
    bonus: zero(),
    sectors: Object.fromEntries(SECTORS.map((x) => [x.id, 100])) as Record<SectorKey, number>,
    trade: 0,
    homes: 100,
    law0: { ...s.laws },
    protests: [],
    nextProtest: s.week + 10,
    nextId: 1,
    sport: null,
    hist: [],
    econ0: { unemployment: st.unemployment, happiness: st.happiness, growth: st.growth, approval: st.approval },
  };
  for (const k of SOC_KEYS) {
    const v = socTarget(s, k);
    s.soc.idx[k] = v;
    s.soc.idx0[k] = v;
  }
  s.soc.trade = tradeTarget(s);
}

function tradeTarget(s: G.GameState) {
  const so = s.soc;
  const deals = s.foreign?.filter((f) => f.deal).length ?? 0;
  const sanctions = s.foreign?.filter((f) => f.sanctioned).length ?? 0;
  return clamp([1.5, 0, -1][s.laws.trade ?? 1] + ((so?.sectors.manufacturing ?? 100) - 100) * 0.03 + deals * 0.3 - sanctions * 0.2 + (s.wd?.cycle ?? 0) * 0.8, -8, 8);
}

/** The week in society (after the economy and the markets). */
export function societyWeek(s: G.GameState) {
  initSociety(s);
  const so = s.soc;
  const st = s.stats;
  // A crisis that broke this week.
  if (s.crisis && s.crisis.week === s.week) {
    for (const [k, v] of Object.entries(CRISIS_SOC[s.crisis.id] ?? {})) shift(s, k as SocKey, v);
    for (const [k, v] of Object.entries(CRISIS_SECTOR[s.crisis.id] ?? {})) so.sectors[k as SectorKey] *= 1 + v;
  }
  // House prices: growth and cheap money push them up; building and controls hold them back.
  const rate = s.mk?.rate ?? 2.5;
  const hp = st.growth + 2 - (rate - 2.5) * 1.2 - ((s.laws.housing ?? 1) - 1) * 1.5 - (s.laws.rentControl ?? 0) * 0.8 + ((s.laws.immigration ?? 1) - 1) * 0.5;
  so.homes = clamp(so.homes * (1 + hp / 100 / WEEKS), 40, 400);
  for (const k of SOC_KEYS) {
    so.idx[k] = clamp(so.idx[k] + (socTarget(s, k) - so.idx[k]) * 0.03, 0, 100);
    so.bonus[k] *= 0.985;
  }
  for (const x of SECTORS) so.sectors[x.id] = clamp(so.sectors[x.id] * (1 + (st.growth + sectorGrowth(s, x.id)) / 100 / WEEKS), 20, 2000);
  so.trade += (tradeTarget(s) - so.trade) * 0.05;
  maybeProtest(s);
  protestsWeek(s);
  sportWeek(s);
  if (G.weekOf(s.week) % 4 === 0) {
    so.hist.push({ w: s.week, v: SOC_KEYS.map((k) => Math.round(so.idx[k] * 10) / 10) });
    if (so.hist.length > 130) so.hist.splice(0, so.hist.length - 130);
  }
  // The seasons: a little lift in summer, a little gloom in winter.
  const se = season(s);
  if (se === "summer") s.boosts.happiness += 0.01;
  else if (se === "winter") s.boosts.happiness -= 0.01;
}

/** Society's take on the issues voters care about (added to campaign.ts's raw weights). */
export function issuePull(s: G.GameState): Record<string, number> {
  const i = s.soc?.idx;
  if (!i) return {};
  return {
    crime: Math.max(0, i.crime - 50) * 0.2,
    health: Math.max(0, 50 - i.health) * 0.2,
    housing: Math.max(0, 50 - i.housing) * 0.2,
    climate: Math.max(0, 50 - i.environment) * 0.15,
    cost: Math.max(0, i.inequality - 55) * 0.1,
  };
}
