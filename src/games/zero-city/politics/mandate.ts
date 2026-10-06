/**
 * Mandate (the 0.9 politics update): the deep layer of Mayor mode, run from its own side app.
 *
 * You lead the Civic Party. The city is cut into electoral districts that each send members to
 * the fifteen-seat chamber. Your party is an organisation: it has its own funds and members,
 * a headquarters you can grow, and a roster of politicians with talents and ambitions. Sitting
 * members vote with their district in mind and can rebel against you unless you whip them.
 * The papers report it all, polls track every party, opponents can move no confidence, and
 * elections are won district by district on the campaign trail.
 *
 * Pure and deterministic given the city's seed, like the rest of Mayor mode.
 */
import { rng } from "../core/rng";
import type { Stats } from "../sim/sim";
import type { Zone } from "../world/lots";
import { oppPressure } from "./opposition";
import { CHAMBER, FACTIONS, MAJORITY, MINISTRIES, PARTIES, PARTY_BASE, POLICIES, TERM_MINUTES, overall, shares, type ElectionResult, type Faction, type Minister, type Ministry, type Moods, type PartyId, type PoliticsState, type PolicyId } from "./politics";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const zeroMoods = (): Moods => ({ workers: 0, business: 0, families: 0, greens: 0, seniors: 0 });
const zeroParties = (): Record<PartyId, number> => ({ civic: 0, labour: 0, enterprise: 0, green: 0, heritage: 0 });

function roll(s: PoliticsState) {
  s.rolls++;
  return rng(s.seed * 4057 + s.rolls * 65537);
}

// ---------------------------------------------------------------- ideology

/** Two axes, each −1…1: economy (left … right) and society (progressive … traditional). */
export type Position = [number, number];

export const PARTY_IDEOLOGY: Record<Exclude<PartyId, "civic">, Position> = {
  labour: [-0.6, 0.1],
  enterprise: [0.7, 0.15],
  green: [-0.3, -0.7],
  heritage: [0.35, 0.75],
};
/** Where each group of voters sits. */
export const GROUP_IDEOLOGY: Record<Faction, Position> = {
  workers: [-0.6, 0.2],
  business: [0.7, 0],
  families: [0, 0.3],
  greens: [-0.3, -0.8],
  seniors: [0.3, 0.7],
};
/** Where each law sits. */
export const LAW_POSITION: Record<PolicyId, Position> = {
  freeTransit: [-0.5, -0.2],
  recycling: [-0.2, -0.4],
  heritage: [0.1, 0.7],
  smallBiz: [0.6, 0],
  nightlife: [0.2, -0.5],
  cleanAir: [-0.4, -0.4],
  bikeLanes: [-0.2, -0.5],
  tourism: [0.4, 0],
  watch: [0.1, 0.6],
  rentCap: [-0.8, -0.1],
  auditOffice: [0.5, 0.2],
  landTax: [-0.5, 0],
  roadFund: [0.2, 0.2],
  congestionCharge: [-0.3, -0.4],
  nightBuses: [-0.4, -0.2],
  solarRoofs: [-0.2, -0.5],
  treePlanting: [-0.1, -0.2],
  greenBelt: [-0.2, 0.3],
  socialHousing: [-0.7, -0.1],
  zoningReform: [0.6, -0.3],
  fireCode: [0, 0.3],
  cctv: [0.2, 0.8],
  festivalFund: [0, -0.3],
  libraries: [-0.2, 0.1],
};

const dist = (a: Position, b: Position) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Where your government really stands: your platform, pulled toward the laws you've passed. */
export function governmentPosition(s: PoliticsState): Position {
  const m = s.m;
  if (!s.policies.length) return m.platform;
  let e = 0;
  let so = 0;
  for (const id of s.policies) {
    e += LAW_POSITION[id][0];
    so += LAW_POSITION[id][1];
  }
  const n = s.policies.length;
  const w = Math.min(0.6, n * 0.08);
  return [clamp(m.platform[0] * (1 - w) + (e / n) * w, -1, 1), clamp(m.platform[1] * (1 - w) + (so / n) * w, -1, 1)];
}

/** How close a group feels to your platform, −1 (far) … 1 (right with you). */
export function affinity(platform: Position, g: Faction) {
  return 1 - dist(platform, GROUP_IDEOLOGY[g]);
}

// --------------------------------------------------------------- districts

export interface LotPoint {
  x: number;
  z: number;
  /** Residents plus jobs (0 for an empty plot). */
  pop: number;
  zone: Zone;
  tier: number;
}
export interface District {
  id: number;
  /** Index into DISTRICT_NAMES. */
  name: number;
  cx: number;
  cz: number;
  /** Seats it returns to the chamber. */
  seats: number;
}
export interface DistrictStats {
  id: number;
  pop: number;
  lots: number;
  /** Its voters by group (shares, summing to 1). */
  mix: Moods;
}
export const DISTRICT_NAMES = ["Old Town", "Northgate", "Ashby Heights", "Eastbrook", "Kingsmead", "Southfield", "Millbrook", "Westmere", "Hollins Park"] as const;

/** Nearest district to a point. */
export function districtOf(ds: District[], x: number, z: number) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < ds.length; i++) {
    const d = (ds[i].cx - x) ** 2 + (ds[i].cz - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Split `seats` between weights by largest remainder; with `floor`, at least one each where there's any weight. */
export function apportion(weights: number[], seats: number, floor = true) {
  const n = weights.length;
  if (!n) return [];
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const live = weights.map((w) => w > 0);
  const out = weights.map(() => 0);
  let left = seats;
  // A floor of one seat for every district that has anyone in it (when there are seats enough).
  if (floor && live.filter(Boolean).length <= seats)
    for (let i = 0; i < n; i++)
      if (live[i]) {
        out[i] = 1;
        left--;
      }
  const q = weights.map((w) => (w / total) * seats);
  for (let i = 0; i < n; i++) {
    const extra = Math.max(0, Math.floor(q[i]) - out[i]);
    const take = Math.min(extra, left);
    out[i] += take;
    left -= take;
  }
  // The rest go to whoever is furthest below their fair share (a floor seat counts toward it).
  while (left > 0) {
    let bi = -1;
    for (let i = 0; i < n; i++) if ((live[i] || !live.some(Boolean)) && (bi < 0 || q[i] - out[i] > q[bi] - out[bi])) bi = i;
    if (bi < 0) break;
    out[bi]++;
    left--;
  }
  return out;
}

/**
 * Cut the city into districts: k-means over its plots (weighted by people and jobs), started
 * from evenly spread seeds so the same city always gets the same map. The district nearest the
 * middle is the Old Town; the rest are named round the compass.
 */
export function makeDistricts(seed: number, points: LotPoint[]): District[] {
  if (points.length < 8) return [];
  const k = clamp(Math.round(Math.sqrt(points.length / 25)), 2, 7);
  const w = (p: LotPoint) => 1 + p.pop;
  // Farthest-point seeding from a seeded start.
  const r = rng(seed * 131 + points.length);
  const centres: { x: number; z: number }[] = [];
  const first = points[Math.floor(r.next() * points.length)];
  centres.push({ x: first.x, z: first.z });
  while (centres.length < k) {
    let best = points[0];
    let bd = -1;
    for (const p of points) {
      let d = Infinity;
      for (const c of centres) d = Math.min(d, (c.x - p.x) ** 2 + (c.z - p.z) ** 2);
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    centres.push({ x: best.x, z: best.z });
  }
  for (let it = 0; it < 12; it++) {
    const sx = centres.map(() => 0);
    const sz = centres.map(() => 0);
    const sw = centres.map(() => 0);
    for (const p of points) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < centres.length; i++) {
        const d = (centres[i].x - p.x) ** 2 + (centres[i].z - p.z) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      const ww = w(p);
      sx[bi] += p.x * ww;
      sz[bi] += p.z * ww;
      sw[bi] += ww;
    }
    for (let i = 0; i < centres.length; i++) if (sw[i] > 0) centres[i] = { x: sx[i] / sw[i], z: sz[i] / sw[i] };
  }
  // Names: the most central one is the Old Town; the others go round by bearing.
  let mx = 0;
  let mz = 0;
  for (const c of centres) {
    mx += c.x / centres.length;
    mz += c.z / centres.length;
  }
  const core = centres.reduce((bi, c, i) => (Math.hypot(c.x - mx, c.z - mz) < Math.hypot(centres[bi].x - mx, centres[bi].z - mz) ? i : bi), 0);
  const bearing = (c: { x: number; z: number }) => (Math.atan2(c.x - mx, -(c.z - mz)) + Math.PI * 2) % (Math.PI * 2);
  const others = centres.map((c, i) => ({ c, i })).filter((o) => o.i !== core).sort((a, b) => bearing(a.c) - bearing(b.c));
  const names = new Map<number, number>([[core, 0]]);
  const used = new Set<number>([0]);
  for (const o of others) {
    let slot = 1 + Math.floor((bearing(o.c) / (Math.PI * 2)) * 8);
    while (used.has(slot)) slot = (slot % 8) + 1;
    used.add(slot);
    names.set(o.i, slot);
  }
  const ds: District[] = centres.map((c, i) => ({ id: i, name: names.get(i)!, cx: Math.round(c.x), cz: Math.round(c.z), seats: 0 }));
  const st = districtStats(ds, points);
  const seats = apportion(
    st.map((d) => d.pop + d.lots * 0.5),
    CHAMBER,
  );
  ds.forEach((d, i) => (d.seats = seats[i]));
  return ds;
}

/** Who lives in each district: people and jobs, and its voters by group. */
export function districtStats(ds: District[], points: LotPoint[]): DistrictStats[] {
  const out = ds.map((d) => ({ id: d.id, pop: 0, lots: 0, raw: zeroMoods() }));
  for (const p of points) {
    const o = out[districtOf(ds, p.x, p.z)];
    o.lots++;
    o.pop += p.pop;
    const n = 1 + p.pop;
    const r = o.raw;
    // What kind of place it is says who votes there.
    if (p.zone === "R") {
      r.families += 0.8 * n;
      r.workers += (p.tier <= 2 ? 0.8 : 0.3) * n;
      r.seniors += (p.tier <= 2 ? 0.55 : 0.35) * n;
      r.business += (p.tier >= 4 ? 0.3 : 0.05) * n;
      r.greens += 0.25 * n;
    } else if (p.zone === "C") {
      r.business += 0.9 * n;
      r.workers += 0.3 * n;
      r.greens += 0.15 * n;
    } else if (p.zone === "I") {
      r.workers += 1 * n;
      r.business += 0.25 * n;
    } else {
      r.business += 0.5 * n;
      r.families += 0.4 * n;
      r.greens += 0.3 * n;
      r.workers += 0.3 * n;
    }
  }
  return out.map((o) => {
    const sum = FACTIONS.reduce((n, f) => n + o.raw[f], 0);
    const mix = zeroMoods();
    for (const f of FACTIONS) mix[f] = sum > 0 ? o.raw[f] / sum : 0.2;
    return { id: o.id, pop: Math.round(o.pop), lots: o.lots, mix };
  });
}

// ---------------------------------------------------------------- the party

export const TRAITS = ["orator", "wonk", "fixer", "firebrand", "loyalist", "schemer", "local", "media"] as const;
export type Trait = (typeof TRAITS)[number];
export const HQ = ["pollster", "press", "campaign", "thinkTank"] as const;
export type Hq = (typeof HQ)[number];
/** Party funds for each headquarters level (1, 2, 3). */
export const HQ_COST = [6_000, 14_000, 30_000];

export const RECRUIT_COST = 3_000;
export const TRAIN_COST = 2_000;
export const CANVASS_COST = 1_500;
export const OFFICE_COST = 8_000;
export const DISTRICT_AD_COST = 5_000;
export const MAX_DISTRICT_ADS = 3;
export const CONFERENCE_COST = 6_000;
export const GALA_COST = 0;
export const WHIP_CAPITAL = 10;
export const MAX_ROSTER = 16;
export const SALARY = 120;

export interface Politician {
  id: number;
  name: string;
  /** Seed for their portrait. */
  face: number;
  party: PartyId;
  /** 1–10. */
  charisma: number;
  competence: number;
  /** 0–100. */
  loyalty: number;
  ambition: number;
  popularity: number;
  trait: Trait;
  /** District they're working (−1: none). */
  district: number;
  /** Sitting member of the chamber. */
  mp: boolean;
}
/** A seat in the chamber. */
export interface Mp {
  id: number;
  name: string;
  face: number;
  party: PartyId;
  district: number;
  /** Your party's members are on the roster (their politician id); others are named here. */
  pol: number | null;
}
export interface News {
  m: number;
  k: string;
  v?: Record<string, string | number>;
  /** Good, bad or neutral for you (colours the headline). */
  tone?: 1 | -1 | 0;
}
export interface DistrictResult {
  id: number;
  share: Record<PartyId, number>;
  seats: Record<PartyId, number>;
  winner: PartyId;
}
export interface MandateState {
  /** Your party's platform, set at conference. */
  platform: Position;
  funds: number;
  members: number;
  hq: Record<Hq, number>;
  roster: Politician[];
  mps: Mp[];
  districts: District[];
  /** Cached district make-up, refreshed hourly. */
  dstats: DistrictStats[];
  /** Your ground game per district (0–100), built by canvassing and politicians working it. */
  effort: Record<number, number>;
  /** District ad buys this campaign. */
  ads: Record<number, number>;
  /** Districts with a local party office. */
  offices: number[];
  /** Daily polls: each party's citywide share. */
  partyPolls: { m: number; v: Record<PartyId, number> }[];
  news: News[];
  /** A three-line whip on the bill on the floor. */
  whip: boolean;
  /** The last no-confidence motion: when, and how many voted against you. */
  confidence: { m: number; against: number; passed: boolean } | null;
  lastResults: DistrictResult[] | null;
  /** Term of the last party conference (one per term). */
  conference: number;
  galaAt: number;
  nextId: number;
  hour: number;
  /** Plots counted when the map was last drawn (it's redrawn as the city doubles). */
  mapLots: number;
}

const FIRST = ["Ada", "Bram", "Cleo", "Dev", "Esme", "Felix", "Gita", "Hal", "Iris", "Jonas", "Kemi", "Luca", "Mara", "Nico", "Oona", "Pavel", "Rosa", "Soren", "Tess", "Ugo", "Vera", "Wren", "Yara", "Zane", "Aiko", "Bastian", "Chiara", "Dario", "Elif", "Farid", "Greta", "Hugo", "Ines", "Jamal", "Kofi", "Leila", "Milo", "Nadia", "Omar", "Priya"];
const LAST = ["Abbott", "Brandt", "Costa", "Duval", "Eze", "Fontaine", "Grieg", "Hale", "Ivanova", "Jensen", "Kaur", "Lindqvist", "Moreno", "Nakamura", "Osei", "Petrov", "Quigley", "Rasmussen", "Sato", "Toure", "Ulrich", "Varga", "Whitlock", "Yilmaz", "Adair", "Bellamy", "Castell", "Delacroix", "Ekwueme", "Ferreira", "Galloway", "Haddad", "Iqbal", "Jovanovic", "Kowalski", "Laurent", "Mbeki", "Novak", "Okafor", "Pires"];

function person(r: ReturnType<typeof rng>, id: number, party: PartyId): Politician {
  return {
    id,
    name: `${r.pick(FIRST)} ${r.pick(LAST)}`,
    face: Math.floor(r.next() * 1e6),
    party,
    charisma: r.int(2, 9),
    competence: r.int(2, 9),
    loyalty: r.int(40, 90),
    ambition: r.int(10, 90),
    popularity: r.int(25, 65),
    trait: r.pick(TRAITS),
    district: -1,
    mp: false,
  };
}

/** Fill the chamber with members to match the seats: yours from the roster, others by name. */
function seatChamber(m: MandateState, seats: Record<PartyId, number>, seed: number, perDistrict?: DistrictResult[]) {
  const r = rng(seed * 733 + m.nextId);
  for (const p of m.roster) p.mp = false;
  const old = m.mps;
  const mps: Mp[] = [];
  // Which district each seat belongs to: from the results if we have them, else spread round.
  const slots: { party: PartyId; district: number }[] = [];
  if (perDistrict) {
    for (const d of perDistrict) for (const party of PARTIES) for (let k = 0; k < d.seats[party]; k++) slots.push({ party, district: d.id });
  } else {
    const nd = Math.max(1, m.districts.length);
    let i = 0;
    for (const party of PARTIES) for (let k = 0; k < seats[party]; k++) slots.push({ party, district: m.districts.length ? m.districts[i++ % nd].id : -1 });
  }
  const free = [...m.roster].sort((a, b) => b.popularity + b.charisma * 3 - (a.popularity + a.charisma * 3));
  for (const sl of slots) {
    if (sl.party === "civic") {
      // The best-placed politician for the seat: one who worked the district, else the most popular.
      let pick = free.findIndex((p) => p.district === sl.district);
      if (pick < 0) pick = 0;
      const p = free.splice(pick, 1)[0];
      if (p) {
        p.mp = true;
        mps.push({ id: m.nextId++, name: p.name, face: p.face, party: "civic", district: sl.district, pol: p.id });
        continue;
      }
    }
    // Opposition members keep their seat where they can.
    const keep = old.findIndex((o) => o.party === sl.party && o.pol === null && o.district === sl.district);
    if (keep >= 0) {
      mps.push({ ...old[keep] });
      old.splice(keep, 1);
      continue;
    }
    const np = person(r, 0, sl.party);
    mps.push({ id: m.nextId++, name: np.name, face: np.face, party: sl.party, district: sl.district, pol: null });
  }
  m.mps = mps;
}

export function newMandate(seed: number, seats: Record<PartyId, number>): MandateState {
  const r = rng(seed * 977 + 3);
  const m: MandateState = {
    platform: [0, 0],
    funds: 20_000,
    members: 120,
    hq: { pollster: 0, press: 0, campaign: 0, thinkTank: 0 },
    roster: [],
    mps: [],
    districts: [],
    dstats: [],
    effort: {},
    ads: {},
    offices: [],
    partyPolls: [],
    news: [{ m: 0, k: "nw.welcome", tone: 0 }],
    whip: false,
    confidence: null,
    lastResults: null,
    conference: 0,
    galaAt: -1e9,
    nextId: 1,
    hour: -1,
    mapLots: 0,
  };
  for (let i = 0; i < 9; i++) m.roster.push(person(r, m.nextId++, "civic"));
  seatChamber(m, seats, seed);
  return m;
}

/** Fill in what an older save is missing (the chamber is seated from its seat counts). */
export function normaliseMandate(s: PoliticsState, raw: Partial<MandateState> | undefined): MandateState {
  const base = newMandate(s.seed, s.parl.seats);
  if (!raw) return base;
  const m = { ...base, ...raw, hq: { ...base.hq, ...raw.hq }, effort: { ...raw.effort }, ads: { ...raw.ads } } as MandateState;
  if (m.mps.length !== CHAMBER) seatChamber(m, s.parl.seats, s.seed);
  return m;
}

const say = (m: MandateState, n: News) => {
  m.news = [n, ...m.news].slice(0, 40);
};

// ---------------------------------------------------------- support & polls

/**
 * How a place would vote: each group backs you by how it feels (plus your work on the ground),
 * and the rest of its vote goes to the parties that speak for it.
 */
export function supportIn(feel: Moods, mix: Moods, boost = 0): Record<PartyId, number> {
  const v = zeroParties();
  for (const g of FACTIONS) {
    const mine = clamp(sigmoid((feel[g] - 50 + boost) / 9), 0.02, 0.98);
    v.civic += mix[g] * mine;
    let w = 0;
    for (const party of PARTIES) if (party !== "civic") w += PARTY_BASE[party][g] ?? 0;
    for (const party of PARTIES) if (party !== "civic") v[party] += (mix[g] * (1 - mine) * (PARTY_BASE[party][g] ?? 0)) / Math.max(1e-6, w);
  }
  const total = PARTIES.reduce((n, p) => n + v[p], 0) || 1;
  for (const p of PARTIES) v[p] /= total;
  return v;
}

/** Your ground game in a district as approval points (effort, an office, ads, members working it). */
export function boostIn(m: MandateState, id: number) {
  const workers = m.roster.filter((p) => p.district === id);
  return (m.effort[id] ?? 0) * 0.1 + (m.offices.includes(id) ? 2 : 0) + (m.ads[id] ?? 0) * 2.5 + workers.reduce((n, p) => n + p.popularity / 40, 0);
}

/** Each district's vote today, and the seats it would return. */
export function projection(s: PoliticsState, feel: Moods = s.approval): DistrictResult[] {
  const m = s.m;
  if (!m.districts.length) return [];
  return m.districts.map((d) => {
    const st = m.dstats.find((x) => x.id === d.id);
    // Your ground game there, less the strongest rival's.
    const share = supportIn(feel, st?.mix ?? { workers: 0.2, business: 0.2, families: 0.2, greens: 0.2, seniors: 0.2 }, boostIn(m, d.id) - oppPressure(s, d.id));
    const seats = zeroParties();
    const n = apportion(
      PARTIES.map((p) => share[p]),
      d.seats,
      false,
    );
    PARTIES.forEach((p, i) => (seats[p] = n[i]));
    // In a one-seat district the winner takes it.
    if (d.seats === 1) {
      for (const p of PARTIES) seats[p] = 0;
      seats[PARTIES.reduce((a, b) => (share[b] > share[a] ? b : a))] = 1;
    }
    const winner = PARTIES.reduce((a, b) => (share[b] > share[a] ? b : a));
    return { id: d.id, share, seats, winner };
  });
}

/** Citywide poll: each party's share, by district population (or the city's make-up before there are districts). */
export function cityPoll(s: PoliticsState, st: Pick<Stats, "jobs" | "cJobs" | "iJobs" | "coverage">): Record<PartyId, number> {
  const m = s.m;
  if (!m.districts.length) return supportIn(s.approval, shares(st));
  const out = zeroParties();
  const res = projection(s);
  let total = 0;
  for (const r of res) {
    const w = (m.dstats.find((x) => x.id === r.id)?.pop ?? 0) + 1;
    total += w;
    for (const p of PARTIES) out[p] += r.share[p] * w;
  }
  for (const p of PARTIES) out[p] /= total || 1;
  return out;
}

// ----------------------------------------------------------- the chamber

/** How the voters in a member's district feel about a law (−1…1). */
function districtStance(m: MandateState, district: number, law: PolicyId, enable: boolean) {
  const mix = m.dstats.find((d) => d.id === district)?.mix;
  if (!mix) return 0;
  let v = 0;
  for (const g of FACTIONS) v += mix[g] * (POLICIES[law].stance[g] ?? 0);
  return v * (enable ? 1 : -1);
}

/** Your members who'd vote against a law (their district hates it and they don't owe you enough). */
export function rebels(s: PoliticsState, law: PolicyId, enable: boolean): Mp[] {
  const m = s.m;
  if (m.whip) return [];
  return m.mps.filter((mp) => {
    if (mp.party !== "civic" || mp.pol === null) return false;
    const p = m.roster.find((x) => x.id === mp.pol);
    if (!p) return false;
    const st = districtStance(m, mp.district, law, enable);
    return st < -0.12 && -st * 100 + (60 - p.loyalty) + (p.trait === "loyalist" ? -25 : 0) + (p.trait === "firebrand" ? 10 : 0) > 22;
  });
}

/** A three-line whip: no rebels on this bill, but the would-be rebels resent it. */
export function whip(s: PoliticsState) {
  const b = s.parl.bill;
  if (!b || s.m.whip || s.parl.capital < WHIP_CAPITAL) return false;
  const would = rebels(s, b.law, b.enable);
  s.parl.capital -= WHIP_CAPITAL;
  s.m.whip = true;
  for (const mp of would) {
    const p = s.m.roster.find((x) => x.id === mp.pol);
    if (p) p.loyalty = clamp(p.loyalty - 8, 0, 100);
  }
  return true;
}

/** How each member votes on the bill (for the chamber diagram): yes/no per member id. */
export function memberVotes(s: PoliticsState, law: PolicyId, enable: boolean, partyYes: Record<PartyId, number>): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  const rebelIds = new Set(rebels(s, law, enable).map((x) => x.id));
  for (const party of PARTIES) {
    const members = s.m.mps.filter((x) => x.party === party);
    // Rebels first to vote no; then members in the districts that like it least.
    const order = [...members].sort((a, b) => Number(rebelIds.has(a.id)) - Number(rebelIds.has(b.id)) || districtStance(s.m, b.district, law, enable) - districtStance(s.m, a.district, law, enable));
    order.forEach((mp, i) => (out[mp.id] = i < partyYes[party]));
  }
  return out;
}

// ---------------------------------------------------------- party actions

export function recruit(s: PoliticsState) {
  const m = s.m;
  if (m.funds < RECRUIT_COST || m.roster.length >= MAX_ROSTER) return null;
  m.funds -= RECRUIT_COST;
  const p = person(roll(s), m.nextId++, "civic");
  m.roster.push(p);
  return p;
}

export function train(s: PoliticsState, id: number, skill: "charisma" | "competence") {
  const m = s.m;
  const p = m.roster.find((x) => x.id === id);
  if (!p || m.funds < TRAIN_COST || p[skill] >= 10) return false;
  m.funds -= TRAIN_COST;
  p[skill]++;
  p.loyalty = clamp(p.loyalty + 3, 0, 100);
  return true;
}

/** Throw someone out of the party (not a sitting member: their seat would go with them). */
export function expel(s: PoliticsState, id: number) {
  const m = s.m;
  const p = m.roster.find((x) => x.id === id);
  if (!p || p.mp || isMinister(s, id)) return false;
  m.roster = m.roster.filter((x) => x.id !== id);
  for (const o of m.roster) if (o.ambition > 60) o.loyalty = clamp(o.loyalty - 2, 0, 100);
  return true;
}

/** Send a politician to work a district (or back to headquarters with −1). */
export function assign(s: PoliticsState, id: number, district: number) {
  const p = s.m.roster.find((x) => x.id === id);
  if (!p) return false;
  p.district = district;
  return true;
}

export function upgrade(s: PoliticsState, h: Hq) {
  const m = s.m;
  const lvl = m.hq[h];
  if (lvl >= 3 || m.funds < HQ_COST[lvl]) return false;
  m.funds -= HQ_COST[lvl];
  m.hq[h] = lvl + 1;
  return true;
}

export function canvass(s: PoliticsState, district: number) {
  const m = s.m;
  if (m.funds < CANVASS_COST || !m.districts.some((d) => d.id === district)) return false;
  m.funds -= CANVASS_COST;
  m.effort[district] = clamp((m.effort[district] ?? 0) + 12 * (1 + 0.25 * m.hq.campaign), 0, 100);
  return true;
}

export function openOffice(s: PoliticsState, district: number) {
  const m = s.m;
  if (m.funds < OFFICE_COST || m.offices.includes(district) || !m.districts.some((d) => d.id === district)) return false;
  m.funds -= OFFICE_COST;
  m.offices = [...m.offices, district];
  return true;
}

/** Local adverts, in the campaign only. */
export function districtAd(s: PoliticsState, district: number) {
  const m = s.m;
  if (!s.challenger || m.funds < DISTRICT_AD_COST || (m.ads[district] ?? 0) >= MAX_DISTRICT_ADS) return false;
  m.funds -= DISTRICT_AD_COST;
  m.ads[district] = (m.ads[district] ?? 0) + 1;
  return true;
}

/** A fundraising dinner with the business crowd: money in, a few workers unimpressed. Once a day. */
export function gala(s: PoliticsState, minutes: number) {
  const m = s.m;
  if (minutes - m.galaAt < 24 * 60) return 0;
  m.galaAt = minutes;
  const raised = Math.round(2_000 + clamp(s.approval.business - 30, 0, 70) * 120 + m.members * 4);
  m.funds += raised;
  s.mood.workers -= 2;
  return raised;
}

/** The party conference: set the platform, and the party comes away a little more united. Once a term. */
export function conference(s: PoliticsState, platform: Position) {
  const m = s.m;
  if (m.conference === s.term || m.funds < CONFERENCE_COST) return false;
  m.funds -= CONFERENCE_COST;
  m.conference = s.term;
  const shift = dist(platform, m.platform);
  m.platform = [clamp(platform[0], -1, 1), clamp(platform[1], -1, 1)];
  for (const p of m.roster) p.loyalty = clamp(p.loyalty + 8, 0, 100);
  // A big lurch confuses people for a while.
  for (const g of FACTIONS) s.mood[g] -= shift * 3;
  return true;
}

/** Is this politician in the cabinet? */
export function isMinister(s: PoliticsState, id: number) {
  return MINISTRIES.some((k) => s.parl.ministers[k]?.id === id + ROSTER_ID);
}
/** Roster politicians serve in the cabinet under these ids (clear of the coalition pool's). */
export const ROSTER_ID = 100_000;

/** Appoint one of your own politicians as a minister. */
export function appointOwn(s: PoliticsState, ministry: Ministry, id: number, cost: number) {
  const p = s.m.roster.find((x) => x.id === id);
  if (!p || isMinister(s, id) || s.parl.capital < cost) return false;
  s.parl.capital -= cost;
  const old = s.parl.ministers[ministry];
  if (old && old.id < ROSTER_ID) s.parl.pool = [...s.parl.pool, old];
  // A policy wonk knows the department inside out.
  const min: Minister = { id: id + ROSTER_ID, name: p.name, party: "civic", skill: clamp(Math.ceil(p.competence / 2) + (p.trait === "wonk" ? 1 : 0), 1, 5), loyalty: p.loyalty };
  s.parl.ministers[ministry] = min;
  p.loyalty = clamp(p.loyalty + 6, 0, 100);
  return true;
}

/** The party's money per day: members' dues and business donors in; salaries, headquarters and offices out. */
export function fundsPerDay(s: PoliticsState) {
  const m = s.m;
  const dues = m.members * 1.5;
  const donors = clamp(s.approval.business - 35, 0, 65) * 14;
  const costs = m.roster.length * SALARY + (m.hq.pollster + m.hq.press + m.hq.campaign + m.hq.thinkTank) * 150 + m.offices.length * 120;
  return Math.round(dues + donors - costs);
}

// -------------------------------------------------------------- the clock

export type MandateEvent =
  | { t: "defected"; name: string; party: PartyId; seat: boolean }
  | { t: "noConfidence"; passed: boolean; against: number }
  | { t: "pollLead"; party: PartyId }
  | { t: "redistricted"; n: number };

/**
 * Run the hours since last time: party money and members, the ground game, ambition and
 * loyalty, the daily poll, motions of no confidence. `points` is asked for at most once.
 */
export function mandateHour(s: PoliticsState, minutes: number, st: Stats, points: () => LotPoint[]): MandateEvent[] {
  const m = s.m;
  const out: MandateEvent[] = [];
  const hour = Math.floor(minutes / 60);
  if (m.hour < 0) m.hour = hour - 1;
  if (s.status !== "office" || hour <= m.hour) {
    m.hour = Math.max(m.hour, hour);
    return out;
  }
  const pts = points();
  // Draw the map once there's a town, and again each time it doubles.
  if ((!m.districts.length && pts.length >= 8) || (m.districts.length && pts.length >= m.mapLots * 2 && pts.length > 40)) {
    m.districts = makeDistricts(s.seed, pts);
    m.mapLots = pts.length;
    if (m.districts.length) {
      for (const mp of m.mps) if (!m.districts.some((d) => d.id === mp.district)) mp.district = m.districts[mp.id % m.districts.length].id;
      for (const p of m.roster) if (p.district >= 0 && !m.districts.some((d) => d.id === p.district)) p.district = -1;
      m.offices = m.offices.filter((o) => m.districts.some((d) => d.id === o));
      out.push({ t: "redistricted", n: m.districts.length });
      say(m, { m: minutes, k: "nw.map", v: { n: m.districts.length }, tone: 0 });
    }
  }
  if (m.districts.length) m.dstats = districtStats(m.districts, pts);
  const from = Math.max(m.hour, hour - 24);
  const sh = shares(st);
  for (let h = from + 1; h <= hour; h++) {
    const approval = overall(s.approval, sh);
    // Money: members' dues and business donors in; salaries and the building out.
    m.funds += fundsPerDay(s) / 24;
    const target = 60 + st.population * 0.035 * (approval / 60) + m.hq.campaign * 40 + m.offices.length * 25;
    m.members = Math.max(10, m.members + (target - m.members) * 0.02);
    // The think tank keeps ideas (and capital) coming; fixers in the chamber work the corridors.
    const fixers = m.roster.filter((p) => p.mp && p.trait === "fixer").length;
    s.parl.capital = clamp(s.parl.capital + 0.08 * m.hq.thinkTank + 0.05 * fixers, 0, 100);
    // The ground game fades unless someone keeps at it.
    for (const d of m.districts) {
      const workers = m.roster.filter((p) => p.district === d.id);
      let e = (m.effort[d.id] ?? 0) * 0.99;
      for (const p of workers) e += (p.charisma * 0.12 + (p.trait === "local" ? 0.6 : 0) + (p.trait === "orator" ? 0.3 : 0)) * (1 + 0.25 * m.hq.campaign);
      if (m.offices.includes(d.id)) e += 0.3;
      m.effort[d.id] = clamp(e, 0, 100);
      for (const p of workers) p.popularity = clamp(p.popularity + 0.06 + (p.trait === "media" ? 0.04 : 0), 0, 100);
    }
    // Voters warm to a platform that speaks to them.
    for (const g of FACTIONS) s.mood[g] += affinity(m.platform, g) * 0.05;
    // Loyalty follows how the party's doing; ambition sours it.
    for (const p of m.roster) {
      const aim = 45 + (approval - 50) * 0.6 + (p.mp ? 8 : 0) + (isMinister(s, p.id) ? 12 : 0) - (p.ambition - 50) * 0.25 + (p.trait === "loyalist" ? 15 : 0) - (p.trait === "schemer" ? 10 : 0);
      p.loyalty = clamp(p.loyalty + (aim - p.loyalty) * 0.01, 0, 100);
      if (p.trait !== "media") p.popularity = clamp(p.popularity + (50 - p.popularity) * 0.002, 0, 100);
    }
    // Once a day: the defectors, the poll, the opposition's patience.
    if (h % 24 === 17) {
      const r = roll(s);
      const unhappy = m.roster.filter((p) => p.loyalty < 25 && p.ambition > 65 && !isMinister(s, p.id));
      if (unhappy.length && r.next() < 0.5) {
        const p = unhappy[Math.floor(r.next() * unhappy.length)];
        const to = PARTIES.filter((x) => x !== "civic").sort((a, b) => dist(PARTY_IDEOLOGY[a as Exclude<PartyId, "civic">], m.platform) - dist(PARTY_IDEOLOGY[b as Exclude<PartyId, "civic">], m.platform))[0];
        m.roster = m.roster.filter((x) => x.id !== p.id);
        const seat = m.mps.find((x) => x.pol === p.id);
        if (seat) {
          seat.party = to;
          seat.pol = null;
          s.parl.seats.civic--;
          s.parl.seats[to]++;
        }
        out.push({ t: "defected", name: p.name, party: to, seat: !!seat });
        say(m, { m: h * 60, k: "nw.defect", v: { name: p.name, party: to }, tone: -1 });
      }
    }
    if (h % 24 === 9) {
      const poll = cityPoll(s, st);
      const lead = PARTIES.reduce((a, b) => (poll[b] > poll[a] ? b : a));
      const prev = m.partyPolls[m.partyPolls.length - 1];
      const prevLead = prev ? PARTIES.reduce((a, b) => (prev.v[b] > prev.v[a] ? b : a)) : "civic";
      m.partyPolls = [...m.partyPolls.slice(-29), { m: h * 60, v: poll }];
      if (lead !== prevLead) {
        out.push({ t: "pollLead", party: lead });
        say(m, { m: h * 60, k: "nw.lead", v: { party: lead }, tone: lead === "civic" ? 1 : -1 });
      } else say(m, { m: h * 60, k: "nw.poll", v: { party: lead, n: Math.round(poll[lead] * 100) }, tone: 0 });
    }
    if (h % 24 === 15 && !s.challenger && s.status === "office") {
      const gov = s.parl.seats.civic + s.parl.coalition.reduce((n, p) => n + s.parl.seats[p], 0);
      const recent = m.confidence && h * 60 - m.confidence.m < 2 * 24 * 60;
      if (gov < MAJORITY && approval < 42 && !recent) {
        // The opposition moves no confidence: every party that's had enough votes for it.
        let against = 0;
        for (const party of PARTIES) if (party !== "civic" && !s.parl.coalition.includes(party) && s.parl.relations[party] < 25) against += s.parl.seats[party];
        against += m.mps.filter((x) => x.party === "civic" && (m.roster.find((p) => p.id === x.pol)?.loyalty ?? 100) < 20).length;
        const passed = against >= MAJORITY;
        m.confidence = { m: h * 60, against, passed };
        out.push({ t: "noConfidence", passed, against });
        say(m, { m: h * 60, k: passed ? "nw.ncLost" : "nw.ncWon", v: { n: against }, tone: passed ? -1 : 1 });
        // Lost: a snap election in half a day.
        if (passed) s.termStart = Math.min(s.termStart, h * 60 - TERM_MINUTES + 12 * 60);
      }
    }
  }
  m.hour = Math.max(m.hour, hour);
  return out;
}

// ---------------------------------------------------------------- elections

/**
 * Election day, district by district: each one votes by how its groups feel on the night (and
 * your ground game there), and returns its seats. With no districts yet the whole city is one.
 */
export function electDistricts(s: PoliticsState, result: ElectionResult, st: Pick<Stats, "jobs" | "cJobs" | "iJobs" | "coverage">) {
  const m = s.m;
  const feel = zeroMoods();
  // byFaction is each group's chance of backing you; turn it back into a feeling.
  for (const g of FACTIONS) {
    const p = clamp(result.byFaction[g], 0.02, 0.98);
    feel[g] = 50 + 9 * Math.log(p / (1 - p));
  }
  let res: DistrictResult[];
  if (m.districts.length) res = projection(s, feel);
  else {
    const share = supportIn(feel, shares(st));
    const seats = zeroParties();
    const n = apportion(
      PARTIES.map((p) => share[p]),
      CHAMBER,
      false,
    );
    PARTIES.forEach((p, i) => (seats[p] = n[i]));
    res = [{ id: -1, share, seats, winner: PARTIES.reduce((a, b) => (share[b] > share[a] ? b : a)) }];
  }
  const seats = zeroParties();
  for (const r of res) for (const p of PARTIES) seats[p] += r.seats[p];
  return { results: res, seats };
}

/** After the election: seat the new chamber, clear the campaign, and write it up. */
export function afterVote(s: PoliticsState, results: DistrictResult[], minutes: number) {
  const m = s.m;
  seatChamber(m, s.parl.seats, s.seed + s.term, results.length && results[0].id >= 0 ? results : undefined);
  m.lastResults = results;
  m.ads = {};
  for (const k of Object.keys(m.effort)) m.effort[Number(k)] *= 0.4;
  m.whip = false;
  // Members who won their seats are riding high.
  for (const p of m.roster) if (p.mp) p.popularity = clamp(p.popularity + 6, 0, 100);
  say(m, { m: minutes, k: s.status === "office" ? "nw.won" : "nw.lost", v: { n: s.parl.seats.civic }, tone: s.status === "office" ? 1 : -1 });
}

/** A headline for something that happened elsewhere in Mayor mode. */
export function report(s: PoliticsState, n: News) {
  say(s.m, n);
}
