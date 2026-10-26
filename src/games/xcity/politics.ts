import * as act from "./actions";
import { FIRST_NAMES, MAP_HALF } from "./data";
import { districtRect, districtAt } from "./world";
import { clamp, pointInPoly, rng, type Pts } from "./geom";
import { inWater } from "./roads";
import { advance, farmHectares, hooks, places } from "./sim";
import { news, rand, type State } from "./state";
import type { Axis, Bill, BillKind, ElectionResult, Electorate, GroupId, Party, Pol, PolSettings, Position, PromiseKind, PromiseRec, Role, SeatPref, SeatSize } from "./poltypes";

/**
 * XCity's politics. The city is split into electorates; parties stand candidates in each, and
 * voters (renters, homeowners, families, young people, retirees, business and farmers, each with
 * their own views on housing, transport, tax and the environment) vote for whoever is closest to
 * them, nudged by the campaign, endorsements, promises and how the government has done. Win the
 * most seats and you run the city; lose and another party does, by its own ideology, while you
 * protest, lobby and promise from opposition. Every electorate also sends its member to the
 * federal parliament, where bills that reach into the city are voted on.
 */

/* ------------------------------------------------------------------ the views */

export const AXES: Axis[] = ["housing", "transit", "tax", "green"];

export const AXIS_INFO: Record<Axis, { name: string; lo: string; hi: string; icon: string }> = {
  housing: { name: "Housing", lo: "Protect neighbourhoods", hi: "Build more homes", icon: "🏘️" },
  transit: { name: "Transport", lo: "Cars first", hi: "Transit first", icon: "🚋" },
  tax: { name: "Tax", lo: "Low tax", hi: "Spend more", icon: "💰" },
  green: { name: "Environment", lo: "Growth first", hi: "Green city", icon: "🌿" },
};

export const GROUP_ORDER: GroupId[] = ["renters", "owners", "families", "young", "retirees", "business", "farmers"];

export const GROUPS: Record<GroupId, { name: string; icon: string; pref: Position; weight: Position; lobby: string }> = {
  renters: { name: "Renters", icon: "🔑", pref: { housing: 0.85, transit: 0.4, tax: 0.3, green: 0.2 }, weight: { housing: 2, transit: 1, tax: 1, green: 0.5 }, lobby: "Tenants' Union" },
  owners: { name: "Homeowners", icon: "🏡", pref: { housing: -0.6, transit: -0.3, tax: -0.6, green: 0.1 }, weight: { housing: 2, transit: 0.8, tax: 1.5, green: 0.5 }, lobby: "Residents' Association" },
  families: { name: "Families", icon: "👨‍👩‍👧", pref: { housing: 0.2, transit: 0, tax: 0, green: 0.4 }, weight: { housing: 1, transit: 0.8, tax: 1, green: 1 }, lobby: "Parents & Schools Council" },
  young: { name: "Young people", icon: "🎒", pref: { housing: 0.9, transit: 0.8, tax: 0.3, green: 0.7 }, weight: { housing: 1.5, transit: 1.2, tax: 0.5, green: 1 }, lobby: "Students' Guild" },
  retirees: { name: "Retirees", icon: "👵", pref: { housing: -0.6, transit: -0.1, tax: -0.4, green: 0.2 }, weight: { housing: 1.5, transit: 0.6, tax: 1.2, green: 0.6 }, lobby: "Seniors' League" },
  business: { name: "Business", icon: "💼", pref: { housing: 0.5, transit: 0.1, tax: -0.85, green: -0.4 }, weight: { housing: 1, transit: 0.6, tax: 2, green: 0.8 }, lobby: "Chamber of Commerce" },
  farmers: { name: "Farmers", icon: "🚜", pref: { housing: -0.5, transit: -0.6, tax: -0.5, green: -0.1 }, weight: { housing: 1.5, transit: 1, tax: 1, green: 0.6 }, lobby: "Farmers' Federation" },
};

/** Groups whose interests pull against each other: courting one cools the other. */
const RIVALS: Partial<Record<GroupId, GroupId[]>> = {
  renters: ["owners"],
  owners: ["renters", "young"],
  young: ["retirees"],
  retirees: ["young"],
  business: ["renters"],
  farmers: ["young"],
};

export type PartyDraft = Omit<Party, "id" | "ai" | "national">;

export const PARTY_PRESETS: (PartyDraft & { national: number; blurb: string })[] = [
  { name: "Homes for All", short: "HFA", color: "#1fb5a0", icon: "🏠", leader: "Alex Rowe", pos: { housing: 0.8, transit: 0.6, tax: 0.2, green: 0.3 }, national: 0.1, blurb: "Build more homes, everywhere, now." },
  { name: "Heritage Alliance", short: "HER", color: "#3557a8", icon: "🏛️", leader: "Margaret Hale", pos: { housing: -0.7, transit: -0.4, tax: -0.5, green: 0.1 }, national: 0.3, blurb: "Keep our neighbourhoods as they are." },
  { name: "Workers & Tenants", short: "WTP", color: "#d0453b", icon: "✊", leader: "Danny Okafor", pos: { housing: 0.45, transit: 0.4, tax: 0.7, green: 0.2 }, national: 0.29, blurb: "Fair rents, good services, public housing." },
  { name: "Liberty & Enterprise", short: "LIB", color: "#e0a020", icon: "💼", leader: "Victor Strand", pos: { housing: 0.3, transit: -0.5, tax: -0.85, green: -0.5 }, national: 0.18, blurb: "Low taxes and let the market build." },
  { name: "Green Future", short: "GRN", color: "#3c9a46", icon: "🌿", leader: "Isla Brennan", pos: { housing: -0.1, transit: 0.9, tax: 0.4, green: 0.9 }, national: 0.12, blurb: "Trams, trees and a liveable city." },
  { name: "Country First", short: "CTY", color: "#8a6a3a", icon: "🌾", leader: "Hamish Doyle", pos: { housing: -0.45, transit: -0.7, tax: -0.4, green: -0.1 }, national: 0.08, blurb: "Stand up for the farms and the bush." },
];

const SURNAMES = ["Hale", "Okafor", "Strand", "Brennan", "Doyle", "Nguyen", "Patel", "Kowalski", "Murphy", "Santos", "Lindqvist", "Ahmed", "Fischer", "Rossi", "Tanaka", "O'Neill", "Moreau", "Haddad", "Kaur", "Walsh", "Novak", "Silva", "Byrne", "Mensah"];
export const ELECTORATE_NAMES = [
  "Millbrook", "Riverside", "Valley", "Ridgeway", "Orchard Vale", "Eastbrook", "Westbrook", "Kingsford", "Hillcrest", "Southgate", "Northfield", "Ashworth",
  "Bellmont", "Clearwater", "Fernhill", "Greystone", "Harbourne", "Larkspur", "Marlow", "Oakhurst", "Pinecrest", "Redfern Park", "Stonebridge", "Thornbury",
];

export function defaultPolSettings(): PolSettings {
  return { system: "preferential", termYears: 3, campaignWeeks: 10, seats: "normal", aiParties: 3, federalSeats: 101, difficulty: "normal" };
}

/* ------------------------------------------------------------------ promises and bills */

export const PROMISES: Record<PromiseKind, { label: (n: number, place: string) => string; icon: string; effects: Partial<Record<GroupId, number>>; local?: boolean; blurb: string }> = {
  homes: { label: (n) => `Build ${n.toLocaleString()} homes this term`, icon: "🏗️", effects: { renters: 9, young: 9, business: 4, owners: -3, retirees: -2 }, blurb: "Kept if that many homes are finished by the next election." },
  tram: { label: () => "Build a tram line", icon: "🚋", effects: { young: 7, renters: 4, families: 2, farmers: -3, owners: -1 }, blurb: "Kept if there's at least a kilometre of tram track." },
  bikes: { label: () => "5 km of new bike lanes", icon: "🚲", effects: { young: 6, families: 3, business: -1 }, blurb: "Kept if 5 km of bike lanes are painted." },
  taxCut: { label: () => "Cut property tax", icon: "✂️", effects: { owners: 7, business: 7, retirees: 4, farmers: 3, young: -2 }, blurb: "Kept if the rate is at least 0.2 points lower." },
  heights: { label: () => "No towers in our neighbourhoods", icon: "🚫", effects: { owners: 8, retirees: 8, renters: -6, young: -6, business: -3 }, blurb: "Kept if nothing over 12 storeys goes up." },
  schools: { label: () => "Open a new school", icon: "🏫", effects: { families: 9, retirees: 1, young: 2 }, blurb: "Kept if another school opens." },
  park: { label: (_n, place) => `A new park in ${place}`, icon: "🌳", effects: { families: 4, retirees: 3, young: 2 }, local: true, blurb: "Kept if a park opens there." },
  parking: { label: () => "Scrap parking minimums", icon: "🅿️", effects: { young: 6, renters: 3, business: 2, owners: -4, retirees: -3 }, blurb: "Kept if no district requires parking." },
  rents: { label: () => "Bring rents down", icon: "📉", effects: { renters: 10, young: 7, families: 3, owners: -2 }, blurb: "Kept if rents are lower at the next election." },
  farms: { label: () => "Protect the farms", icon: "🌾", effects: { farmers: 12, retirees: 3, young: -2, renters: -2 }, blurb: "Kept if nine tenths of the farmland is still farmed." },
};

export const PROMISE_ORDER: PromiseKind[] = ["homes", "rents", "tram", "bikes", "parking", "schools", "park", "taxCut", "heights", "farms"];

export const BILLS: Record<BillKind, { title: string; blurb: string; vec: Position }> = {
  housingAccord: { title: "National Housing Accord", blurb: "The Commonwealth pays cities $25,000 for every new home they finish.", vec: { housing: 1, transit: 0, tax: 0.5, green: 0 } },
  transitFund: { title: "Transit Fund Act", blurb: "The Commonwealth pays half the cost of new tram lines.", vec: { housing: 0, transit: 1, tax: 0.4, green: 0.4 } },
  parkingReform: { title: "End Parking Minimums Act", blurb: "No council may require car parks in new buildings.", vec: { housing: 0.8, transit: 0.6, tax: 0, green: 0.3 } },
  rateCap: { title: "Council Rates Cap", blurb: "Property tax is capped at 1% of value a year.", vec: { housing: 0, transit: 0, tax: -1, green: 0 } },
  greenBelt: { title: "Green Belt Act", blurb: "Farmland is protected: farm income rises and building on it costs a quarter more.", vec: { housing: -0.7, transit: 0, tax: 0, green: 0.8 } },
  firstHome: { title: "First Home Buyers Grant", blurb: "Grants for first home buyers: more people want to buy in, and rents rise.", vec: { housing: 0.2, transit: 0, tax: 0.3, green: -0.2 } },
};

export const BILL_ORDER: BillKind[] = ["housingAccord", "transitFund", "parkingReform", "rateCap", "greenBelt", "firstHome"];

/* ------------------------------------------------------------------ helpers */

const R = (s: State) => rand(s);
const name = (s: State) => `${FIRST_NAMES[Math.floor(R(s) * FIRST_NAMES.length)]} ${SURNAMES[Math.floor(R(s) * SURNAMES.length)]}`;

export function law(s: State, k: BillKind) {
  return !!s.pol?.federal.laws[k];
}

/** Can the player use the planning tools (sandbox, or their party runs the city)? */
export function canPlan(s: State) {
  return !s.pol || s.pol.government === s.pol.player;
}

export function playerParty(p: Pol) {
  return p.parties[p.player];
}

/** How far a voter group is from a party, 0 (agree on everything) to 1. */
export function distance(g: GroupId, pos: Position) {
  const G = GROUPS[g];
  let d = 0;
  let w = 0;
  for (const a of AXES) {
    d += G.weight[a] * Math.abs(G.pref[a] - pos[a]);
    w += G.weight[a];
  }
  return d / (2 * w);
}

function emptyGroups(v = 0): Record<GroupId, number> {
  return { renters: v, owners: v, families: v, young: v, retirees: v, business: v, farmers: v };
}

/* ------------------------------------------------------------------ electorates */

/** Clip a convex polygon to the half-plane a·p ≤ b. */
function clipHalf(poly: Pts, ax: number, az: number, b: number): Pts {
  const out: Pts = [];
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = poly[i * 2];
    const z0 = poly[i * 2 + 1];
    const x1 = poly[((i + 1) % n) * 2];
    const z1 = poly[((i + 1) % n) * 2 + 1];
    const d0 = ax * x0 + az * z0 - b;
    const d1 = ax * x1 + az * z1 - b;
    if (d0 <= 0) out.push(x0, z0);
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1);
      out.push(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    }
  }
  return out;
}

/** Where the voters are: every finished home, and the people on the farmland beyond the town. */
export function voterPoints(s: State) {
  const pts: { x: number; z: number; w: number }[] = [];
  const occ = s.stats.homes ? s.households / s.stats.homes : 1;
  for (const b of s.buildings) if (b?.done && b.homes) pts.push({ x: b.x, z: b.z, w: b.homes * occ * 1.7 });
  const ds = s.districts.filter(Boolean);
  for (let x = -1550; x < 1600; x += 100)
    for (let z = -1550; z < 1600; z += 100)
      for (let i = ds.length - 1; i >= 0; i--) {
        const d = ds[i]!;
        if (!pointInPoly(x, z, d.poly)) continue;
        if (d.use === "farms") pts.push({ x, z, w: 0.6 });
        break;
      }
  return pts;
}

const SEAT_SHIFT: Record<SeatSize, number> = { fewer: -1, normal: 0, more: 2 };

/** How many seats the Electoral Commission gives a city this size: a village gets 4, a big city up to 16. */
export function seatsFor(s: State, size: SeatSize = "normal") {
  const people = Math.max(1, s.stats.pop);
  return clamp(Math.round(3 + 2.2 * Math.log2(Math.max(1, people / 500))) + SEAT_SHIFT[size], 3, 16);
}

const nearest = (cs: { x: number; z: number }[], x: number, z: number) => {
  let best = 0;
  let bd = Infinity;
  for (let j = 0; j < cs.length; j++) {
    const d = (cs[j].x - x) ** 2 + (cs[j].z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
};

/** Which of these regions (they tile the map) a point is in. */
function regionAt(rs: { x: number; z: number; poly: Pts }[], x: number, z: number) {
  for (let j = 0; j < rs.length; j++) if (pointInPoly(x, z, rs[j].poly)) return j;
  return nearest(rs, x, z);
}

type Seat = { x: number; z: number; poly: Pts };

/**
 * Draw k seats round the voters by recursive bisection: cut the voters across their longest spread
 * (tilted a little, by the map's seed) at the point that leaves each side its share of the seats,
 * and carry on in each half. Every seat ends up with about as many voters, so the town's seats are
 * small and the farm seats big, and every boundary is a straight cut. The seat round the town
 * centre comes first.
 */
export function drawSeats(s: State, k: number): Seat[] {
  const pts = voterPoints(s);
  const Rn = rng(s.seed * 31 + k * 7 + 1);
  const H = MAP_HALF;
  const out: { poly: Pts; pts: typeof pts }[] = [];
  const split = (poly: Pts, ps: typeof pts, n: number) => {
    if (n <= 1 || ps.length < 2) {
      out.push({ poly, pts: ps });
      // Not enough voters to go round: share what's left of the region in strips.
      for (let i = 1; i < n; i++) out.push({ poly: [], pts: [] });
      return;
    }
    const W = ps.reduce((a, q) => a + q.w, 0);
    let mx = 0;
    let mz = 0;
    for (const q of ps) {
      mx += q.x * q.w;
      mz += q.z * q.w;
    }
    mx /= W;
    mz /= W;
    let xx = 0;
    let zz = 0;
    let xz = 0;
    for (const q of ps) {
      xx += q.w * (q.x - mx) ** 2;
      zz += q.w * (q.z - mz) ** 2;
      xz += q.w * (q.x - mx) * (q.z - mz);
    }
    const a = 0.5 * Math.atan2(2 * xz, xx - zz) + (Rn() - 0.5) * 0.5;
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    const n1 = Math.floor(n / 2);
    const goal = (W * n1) / n;
    const order = ps.map((q) => ({ q, t: q.x * ux + q.z * uz })).sort((p1, p2) => p1.t - p2.t);
    let acc = 0;
    let cut = order[0].t;
    for (let i = 0; i < order.length - 1; i++) {
      acc += order[i].q.w;
      if (acc >= goal) {
        cut = (order[i].t + order[i + 1].t) / 2;
        break;
      }
    }
    const lo = order.filter((o) => o.t < cut).map((o) => o.q);
    const hi = order.filter((o) => o.t >= cut).map((o) => o.q);
    split(clipHalf(poly, ux, uz, cut), lo, n1);
    split(clipHalf(poly, -ux, -uz, -cut), hi, n - n1);
  };
  if (pts.length >= k) split([-H, -H, H, -H, H, H, -H, H], pts, k);
  if (out.length !== k || out.some((r) => r.poly.length < 6)) {
    // Too few people to go on: a seat round the town and the rest in a ring (plain cells).
    const cs = [{ x: 0, z: 200 }];
    for (let i = 1; i < k; i++) {
      const ang = (i / (k - 1)) * Math.PI * 2;
      cs.push({ x: Math.cos(ang) * 900, z: 200 + Math.sin(ang) * 900 });
    }
    return cs.map((c, i) => ({ ...c, poly: cell(cs, i) }));
  }
  const seats: Seat[] = out.map((r) => {
    const W = r.pts.reduce((a, q) => a + q.w, 0);
    if (W > 0) return { x: r.pts.reduce((a, q) => a + q.x * q.w, 0) / W, z: r.pts.reduce((a, q) => a + q.z * q.w, 0) / W, poly: r.poly };
    let x = 0;
    let z = 0;
    for (let i = 0; i < r.poly.length; i += 2) {
      x += r.poly[i];
      z += r.poly[i + 1];
    }
    return { x: x / (r.poly.length / 2), z: z / (r.poly.length / 2), poly: r.poly };
  });
  const town = regionAt(seats, 0, 200);
  const order = seats.map((_, i) => i).sort((a, b) => {
    if (a === town) return -1;
    if (b === town) return 1;
    return Math.atan2(seats[a].z - 200, seats[a].x) - Math.atan2(seats[b].z - 200, seats[b].x);
  });
  return order.map((i) => seats[i]);
}

/** The plain nearest-seed cell of seed i (for a map with too few people to divide by them). */
function cell(cs: { x: number; z: number }[], i: number): Pts {
  const H = MAP_HALF;
  let poly: Pts = [-H, -H, H, -H, H, H, -H, H];
  const p = cs[i];
  cs.forEach((q, j) => {
    if (j === i) return;
    const ax = q.x - p.x;
    const az = q.z - p.z;
    poly = clipHalf(poly, ax, az, (q.x * q.x + q.z * q.z - p.x * p.x - p.z * p.z) / 2);
  });
  return poly;
}

function blankElectorate(id: number, c: Seat, parties: number, name: string): Electorate {
  return {
    id,
    name,
    x: c.x,
    z: c.z,
    poly: c.poly,
    holder: -1,
    mp: "",
    candidates: Array.from({ length: parties }, () => ""),
    support: Array.from({ length: parties }, () => 1 / parties),
    effort: Array.from({ length: parties }, () => 0),
    groups: emptyGroups(1 / 7),
    voters: 0,
    last: null,
  };
}

/** The first map: as many seats as the city has people for, named in turn. */
export function makeElectorates(s: State, n: number, parties: number): Electorate[] {
  const cs = drawSeats(s, n);
  return cs.map((c, i) => blankElectorate(i, c, parties, ELECTORATE_NAMES[i % ELECTORATE_NAMES.length]));
}

export function electorateAt(p: Pol, x: number, z: number) {
  return p.electorates[regionAt(p.electorates, x, z)]?.id ?? 0;
}

/** Does the map need redrawing: a different number of seats due, or seats more than a quarter off the average? */
export function redrawDue(s: State, p: Pol) {
  demographics(s, p);
  if (seatsFor(s, p.settings.seats) !== p.electorates.length) return true;
  const avg = p.electorates.reduce((a, e) => a + e.voters, 0) / p.electorates.length;
  return p.electorates.some((e) => Math.abs(e.voters - avg) > avg * 0.25);
}

/**
 * The Electoral Commission redraws the map for the coming election. Each new seat is notionally
 * held by whoever held the old seat most of its voters come from, keeps that seat's name and
 * member if it's the old seat's main successor, and takes over its campaign; your own seat moves
 * with you. Returns false if no redraw was due (or forced).
 */
export function redistribute(s: State, p: Pol, force = false): boolean {
  if (!force && !redrawDue(s, p)) return false;
  const P = p.parties.length;
  const old = p.electorates;
  const k = seatsFor(s, p.settings.seats);
  const cs = drawSeats(s, k);
  // Who goes where: voters from old seat o into new seat n.
  const flow = cs.map(() => old.map(() => 0));
  for (const q of voterPoints(s)) flow[regionAt(cs, q.x, q.z)][regionAt(old, q.x, q.z)] += q.w;
  // Each old seat's main successor.
  const heir = old.map((_, o) => {
    let best = -1;
    let bv = 0;
    flow.forEach((row, n) => {
      if (row[o] > bv) {
        bv = row[o];
        best = n;
      }
    });
    return best;
  });
  const used = new Set<string>();
  const fresh: string[] = [];
  const next: Electorate[] = cs.map((c, n) => {
    const row = flow[n];
    const from = row.indexOf(Math.max(...row));
    const src = old[from];
    const successor = heir[from] === n;
    let nm = successor ? src.name : "";
    if (!nm || used.has(nm)) {
      nm = ELECTORATE_NAMES.find((x) => !used.has(x) && !old.some((e) => e.name === x)) ?? ELECTORATE_NAMES.find((x) => !used.has(x)) ?? `Seat ${n + 1}`;
      fresh.push(nm);
    }
    used.add(nm);
    const e = blankElectorate(n, c, P, nm);
    const sum = row.reduce((a, b) => a + b, 0) || 1;
    e.holder = src.holder;
    e.effort = e.effort.map((_, i) => row.reduce((a, v, o) => a + v * (old[o].effort[i] ?? 0), 0) / sum);
    e.candidates = p.parties.map((_, i) => (successor ? src.candidates[i] : "") || name(s));
    e.mp = successor ? src.mp : e.candidates[e.holder] ?? "";
    if (successor) e.last = src.last;
    return e;
  });
  const seat = heir[p.seat] >= 0 ? heir[p.seat] : regionAt(cs, old[p.seat].x, old[p.seat].z);
  // Your candidacy moves with you (and the seat's old candidate for your party stands elsewhere).
  for (const e of next) if (e.candidates[p.player] === playerParty(p).leader && e.id !== seat) e.candidates[p.player] = name(s);
  next[seat].candidates[p.player] = playerParty(p).leader;
  if (next[seat].holder === p.player) next[seat].mp = playerParty(p).leader;
  for (const r of p.promises) if (r.electorate >= 0) r.electorate = heir[r.electorate] >= 0 ? heir[r.electorate] : 0;
  p.redraw = { month: s.month, from: old.length, to: next.length, fresh };
  p.redraws = (p.redraws ?? 1) + 1;
  p.electorates = next;
  p.seat = seat;
  demographics(s, p);
  poll(s, p);
  const more = next.length - old.length;
  news(
    s,
    more
      ? `The Electoral Commission has redrawn the map for the election: ${next.length} seats, ${more > 0 ? "up" : "down"} from ${old.length}${fresh.length ? ` (new: ${fresh.join(", ")})` : ""}.`
      : `The Electoral Commission has redrawn the boundaries so every seat has about as many voters.`,
    "tip",
  );
  return true;
}

/** The seat that fits where you'd like to stand. */
function seatFor(p: Pol, pref: SeatPref) {
  const es = p.electorates;
  if (pref === "town" || es.length < 2) return 0;
  if (pref === "country") return es.reduce((a, e) => (e.groups.farmers > es[a].groups.farmers ? e.id : a), 1);
  const sub = (e: Electorate) => e.groups.owners + e.groups.families - e.groups.farmers;
  return es.slice(1).reduce((a, e) => (sub(e) > sub(es[a]) ? e.id : a), 1);
}

/** Who lives in each electorate, from the buildings there and the farmland round it. */
export function demographics(s: State, p: Pol) {
  const tally = p.electorates.map(() => emptyGroups(0));
  const occ = s.stats.homes ? s.households / s.stats.homes : 1;
  for (const b of s.buildings) {
    if (!b?.done) continue;
    const t = tally[electorateAt(p, b.x, b.z)];
    const hh = b.homes * occ * 1.7;
    if (b.form === "farmhouse") {
      t.farmers += hh * 0.8;
      t.families += hh * 0.2;
    } else if (b.form === "house") {
      t.owners += hh * 0.4;
      t.families += hh * 0.3;
      t.retirees += hh * 0.15;
      t.renters += hh * 0.1;
      t.young += hh * 0.05;
    } else if (b.form === "townhouse") {
      t.owners += hh * 0.35;
      t.families += hh * 0.3;
      t.young += hh * 0.2;
      t.renters += hh * 0.15;
    } else if (b.homes) {
      const cheap = b.affordable / 100;
      t.renters += hh * (0.5 + cheap * 0.3);
      t.young += hh * (0.35 - cheap * 0.2);
      t.retirees += hh * 0.1;
      t.families += hh * 0.05;
    }
    if (b.use === "shops" || b.use === "jobs" || b.use === "mixed" || b.use === "industry") t.business += b.jobs * 0.08;
  }
  // Farm country: people on the land beyond the town.
  const ds = s.districts.filter(Boolean);
  for (let x = -1550; x < 1600; x += 100)
    for (let z = -1550; z < 1600; z += 100) {
      for (let i = ds.length - 1; i >= 0; i--) {
        const d = ds[i]!;
        if (!pointInPoly(x, z, d.poly)) continue;
        if (d.use === "farms") tally[electorateAt(p, x, z)].farmers += 0.6;
        break;
      }
    }
  p.electorates.forEach((e, i) => {
    const t = tally[i];
    t.owners += 50;
    t.retirees += 35;
    t.renters += 25;
    t.young += 20;
    t.families += 25;
    let sum = 0;
    for (const g of GROUP_ORDER) sum += t[g];
    for (const g of GROUP_ORDER) e.groups[g] = t[g] / sum;
    e.voters = Math.round(sum);
  });
}

/* ------------------------------------------------------------------ support */

const K = 4.5;

/** How strongly an electorate leans to each party (before turning into vote shares). */
function scores(s: State, p: Pol, e: Electorate, noise = 0) {
  return p.parties.map((party, i) => {
    let v = 0;
    for (const g of GROUP_ORDER) {
      const share = e.groups[g];
      if (!share) continue;
      v += share * (1 - distance(g, party.pos) + p.bonus[i][g] * 0.008 + (p.endorse[g] === i ? 0.08 : 0));
    }
    v += e.effort[i] * 0.12;
    if (e.holder === i) v += 0.02;
    if (p.government === i) v += (s.approval - 55) / 400;
    if (i === p.player) v += (p.trust - 50) / 420 + (e.id === p.seat ? 0.03 : 0);
    if (noise) v += (R(s) - 0.5) * noise;
    return v;
  });
}

function softmax(v: number[]) {
  const m = Math.max(...v);
  const ex = v.map((x) => Math.exp((x - m) * K));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((x) => x / sum);
}

/** Work out today's polling in every electorate, and city-wide. */
export function poll(s: State, p: Pol) {
  for (const e of p.electorates) e.support = softmax(scores(s, p, e));
  return cityShare(p);
}

export function cityShare(p: Pol) {
  const out = p.parties.map(() => 0);
  let total = 0;
  for (const e of p.electorates) {
    total += e.voters;
    e.support.forEach((v, i) => (out[i] += v * e.voters));
  }
  return out.map((v) => v / Math.max(1, total));
}

/** Seats each party would win today. */
export function projection(p: Pol) {
  const seats = p.parties.map(() => 0);
  for (const e of p.electorates) seats[e.support.indexOf(Math.max(...e.support))]++;
  return seats;
}

function record(s: State, p: Pol) {
  p.polls.push({ month: s.month, week: p.week, share: cityShare(p) });
  if (p.polls.length > 160) p.polls.shift();
}

/* ------------------------------------------------------------------ a new political world */

/** The city's voters by group (share of all), before there are any parties. */
function localGroups(s: State, k: number) {
  const tmp = { electorates: makeElectorates(s, k, 1) } as Pol;
  demographics(s, tmp);
  const out = emptyGroups(0);
  let total = 0;
  for (const e of tmp.electorates) {
    total += e.voters;
    for (const g of GROUP_ORDER) out[g] += e.groups[g] * e.voters;
  }
  for (const g of GROUP_ORDER) out[g] /= Math.max(1, total);
  return out;
}

export function newPolitics(s: State, settings: PolSettings, mine: PartyDraft, seat: number | SeatPref = "town", basedOn = -1): Pol {
  // Your rivals: the other presets (never the one you started your party from, nor a lookalike),
  // the big national parties and whoever speaks for the people here (a farm town gets its
  // country party, a renters' city its tenants' party).
  const field = PARTY_PRESETS.filter((x, i) => i !== basedOn && x.name !== mine.name && x.short !== mine.short.toUpperCase() && x.color.toLowerCase() !== mine.color.toLowerCase());
  const here = localGroups(s, seatsFor(s, settings.seats));
  const appeal = field.map(() => 0);
  for (const g of GROUP_ORDER) {
    let best = 0;
    field.forEach((x, i) => {
      if (distance(g, x.pos) < distance(g, field[best].pos)) best = i;
    });
    appeal[best] += here[g];
  }
  const ai = field
    .map((x, i) => ({ x, rank: x.national + appeal[i] }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, clamp(settings.aiParties, 1, 5))
    .map((r) => r.x)
    .sort((a, b) => b.national - a.national);
  const parties: Party[] = [{ ...mine, pos: { ...mine.pos }, id: 0, ai: false, national: 0.06 }, ...ai.map((x, i) => ({ name: x.name, short: x.short, color: x.color, icon: x.icon, leader: x.leader, pos: { ...x.pos }, id: i + 1, ai: true, national: x.national }))];
  const P = parties.length;
  const diff = settings.difficulty;
  const p: Pol = {
    settings: { ...settings },
    parties,
    player: 0,
    seat: 0,
    electorates: makeElectorates(s, seatsFor(s, settings.seats), P),
    role: "candidate",
    government: 1,
    campaign: true,
    week: 0,
    electionAt: s.month + Math.ceil(settings.campaignWeeks / 4),
    campaignFrom: s.month,
    ap: diff === "easy" ? 5 : diff === "hard" ? 3 : 4,
    apMax: diff === "easy" ? 5 : diff === "hard" ? 3 : 4,
    funds: diff === "easy" ? 2_500_000 : diff === "hard" ? 900_000 : 1_500_000,
    trust: 55,
    promises: [],
    lobby: emptyGroups(0),
    endorse: { renters: -1, owners: -1, families: -1, young: -1, retirees: -1, business: -1, farmers: -1 },
    bonus: parties.map(() => emptyGroups(0)),
    polls: [],
    federal: { seats: parties.map(() => 0), government: 1, nextSitting: s.month + 2, sitting: false, bills: [], history: [], laws: {}, asked: false, proposed: false },
    results: [],
    night: null,
    log: [],
    debate: null,
    redraws: 1,
    redraw: null,
    nextId: 1,
  };
  demographics(s, p);
  p.seat = typeof seat === "number" ? clamp(seat, 0, p.electorates.length - 1) : seatFor(p, seat);
  for (const e of p.electorates) {
    e.candidates = parties.map((party, i) => (i === p.player && e.id === p.seat ? party.leader : name(s)));
  }
  // Each group starts out leaning to the AI party closest to it.
  for (const g of GROUP_ORDER) {
    let best = -1;
    let bd = 0.2;
    parties.forEach((party, i) => {
      if (!party.ai) return;
      const d = distance(g, party.pos);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    p.endorse[g] = best;
  }
  demographics(s, p);
  // The seats as they stand: won by the AI parties at the last election, before you came along.
  const without = { ...p, player: -1 } as Pol;
  for (const e of p.electorates) {
    // Each seat swung its own way last time.
    const sc = scores(s, without, e, 0.12);
    sc[0] = -Infinity;
    const w = sc.indexOf(Math.max(...sc));
    e.holder = w;
    e.mp = e.candidates[w];
  }
  const held = parties.map((_, i) => p.electorates.filter((e) => e.holder === i).length);
  p.government = held.indexOf(Math.max(...held));
  const fed = nationalSeats(s, p, held, true);
  p.federal.seats = fed;
  p.federal.government = fed.indexOf(Math.max(...fed));
  poll(s, p);
  record(s, p);
  s.pol = p;
  news(s, `${settings.campaignWeeks} weeks to the election. ${parties[p.government].name} runs the city; ${mine.name} is standing in every seat.`, "tip");
  return p;
}

/* ------------------------------------------------------------------ the campaign */

export type CampaignKind = "doorknock" | "rally" | "ads" | "fundraise";

export const CAMPAIGN: Record<CampaignKind, { name: string; icon: string; ap: number; cost: number; blurb: string }> = {
  doorknock: { name: "Door-knock", icon: "🚪", ap: 1, cost: 0, blurb: "Volunteers on every doorstep in one electorate." },
  rally: { name: "Rally", icon: "📣", ap: 2, cost: 60_000, blurb: "A big rally: a strong push here and next door." },
  ads: { name: "Ad blitz", icon: "📺", ap: 1, cost: 150_000, blurb: "Ads across the whole city." },
  fundraise: { name: "Fundraiser", icon: "💵", ap: 1, cost: 0, blurb: "Dinners and donations. Business friends give more." },
};

export type Res = { ok: true; msg: string } | { ok: false; why: string };
const no = (why: string): Res => ({ ok: false, why });

function spend(p: Pol, ap: number, cost: number): string | null {
  if (p.ap < ap) return "No time left: end the week (or wait for next month)";
  if (p.funds < cost) return "Not enough party funds";
  p.ap -= ap;
  p.funds -= cost;
  return null;
}

function neighbours(p: Pol, e: Electorate, n = 2) {
  return p.electorates
    .filter((x) => x.id !== e.id)
    .sort((a, b) => (a.x - e.x) ** 2 + (a.z - e.z) ** 2 - ((b.x - e.x) ** 2 + (b.z - e.z) ** 2))
    .slice(0, n);
}

export function campaign(s: State, kind: CampaignKind, electorate = -1): Res {
  const p = s.pol;
  if (!p) return no("No politics in this world");
  const c = CAMPAIGN[kind];
  const e = p.electorates[electorate];
  if ((kind === "doorknock" || kind === "rally") && !e) return no("Pick an electorate");
  const why = spend(p, c.ap, c.cost);
  if (why) return no(why);
  const me = p.player;
  if (kind === "doorknock") e!.effort[me] += 0.55;
  else if (kind === "rally") {
    e!.effort[me] += 1.3;
    for (const n of neighbours(p, e!)) n.effort[me] += 0.35;
  } else if (kind === "ads") for (const x of p.electorates) x.effort[me] += 0.35;
  else {
    const raised = Math.round(70_000 + p.lobby.business * 1500 + GROUP_ORDER.filter((g) => p.endorse[g] === me).length * 40_000);
    p.funds += raised;
    poll(s, p);
    return { ok: true, msg: `Raised $${raised.toLocaleString()}.` };
  }
  poll(s, p);
  return { ok: true, msg: kind === "ads" ? "The ads are running city-wide." : `${c.name} in ${e!.name}.` };
}

/** Make a promise (kept or broken is judged at the next election). */
export function promise(s: State, kind: PromiseKind, electorate = -1): Res {
  const p = s.pol;
  if (!p) return no("No politics in this world");
  if (p.promises.some((x) => x.status === "open" && x.kind === kind && (kind !== "park" || x.electorate === electorate))) return no("You've already promised that");
  if (p.promises.filter((x) => x.status === "open").length >= 6) return no("Six promises is plenty; keep them first");
  const def = PROMISES[kind];
  if (def.local && !p.electorates[electorate]) return no("Pick an electorate");
  const why = spend(p, 1, 0);
  if (why) return no(why);
  const target = homesTarget(s);
  const base =
    kind === "homes"
      ? s.homesBuilt + target
      : kind === "bikes"
        ? km(s, "bike") + 5
        : kind === "taxCut"
          ? s.taxRate - 0.2
          : kind === "schools"
            ? s.buildings.filter((b) => b?.civic === "school").length
            : kind === "park"
              ? parksIn(s, p, electorate)
              : kind === "rents"
                ? s.rentIndex
                : kind === "farms"
                  ? farmHectares(s)
                  : 0;
  const rec: PromiseRec = { id: p.nextId++, kind, label: def.label(target, p.electorates[electorate]?.name ?? ""), party: p.player, made: s.month, base, electorate, status: "open" };
  p.promises.push(rec);
  const k = 0.5 + p.trust / 100;
  for (const [g, v] of Object.entries(def.effects) as [GroupId, number][]) p.bonus[p.player][g] += v * k;
  if (def.local) p.electorates[electorate].effort[p.player] += 0.4;
  poll(s, p);
  news(s, `${playerParty(p).leader} promises: ${rec.label}.`);
  return { ok: true, msg: `Promised: ${rec.label}.` };
}

export function homesTarget(s: State) {
  return Math.max(300, Math.round((s.stats.homes * 0.35) / 100) * 100);
}

function km(s: State, what: "bike" | "tram") {
  let m = 0;
  for (const e of s.edges) if (e && (what === "bike" ? e.bike : e.tram)) m += e.len;
  return m / 1000;
}

function parksIn(s: State, p: Pol, electorate: number) {
  let n = 0;
  for (const b of s.buildings) if (b && (b.civic === "park" || b.civic === "plaza") && electorateAt(p, b.x, b.z) === electorate) n++;
  for (const d of s.districts) if (d?.use === "parks") {
    let x = 0, z = 0;
    for (let i = 0; i < d.poly.length; i += 2) {
      x += d.poly[i];
      z += d.poly[i + 1];
    }
    if (electorateAt(p, (x * 2) / d.poly.length, (z * 2) / d.poly.length) === electorate) n++;
  }
  return n;
}

/** Was a promise kept? */
export function promiseKept(s: State, r: PromiseRec): boolean {
  const p = s.pol!;
  switch (r.kind) {
    case "homes":
      return s.homesBuilt >= r.base;
    case "tram":
      return km(s, "tram") >= 1;
    case "bikes":
      return km(s, "bike") >= r.base;
    case "taxCut":
      return s.taxRate <= r.base + 1e-6;
    case "heights":
      return !s.buildings.some((b) => b && b.started >= r.made && b.storeys > 12);
    case "schools":
      return s.buildings.filter((b) => b?.civic === "school" && b.done).length > r.base;
    case "park":
      return parksIn(s, p, r.electorate) > r.base;
    case "parking":
      return law(s, "parkingReform") || s.districts.every((d) => !d || (d.use !== "homes" && d.use !== "mixed") || d.rules.parking === 0);
    case "rents":
      return s.rentIndex < r.base - 0.05 || s.rentIndex <= 1;
    case "farms":
      return farmHectares(s) >= r.base * 0.9;
  }
}

/** Court an interest group: they may endorse you, and donate. */
export function lobbyGroup(s: State, g: GroupId): Res {
  const p = s.pol;
  if (!p) return no("No politics in this world");
  const why = spend(p, 1, 0);
  if (why) return no(why);
  const fit = 1 - distance(g, playerParty(p).pos) * 2;
  const gain = Math.round(8 + R(s) * 8 + fit * 8);
  p.lobby[g] = clamp(p.lobby[g] + gain, -100, 100);
  for (const r of RIVALS[g] ?? []) p.lobby[r] = clamp(p.lobby[r] - 5, -100, 100);
  let msg = `The ${GROUPS[g].lobby} warms to you (+${gain}).`;
  if (p.lobby[g] >= 60 && p.endorse[g] !== p.player) {
    p.endorse[g] = p.player;
    msg = `The ${GROUPS[g].lobby} endorses ${playerParty(p).name}!`;
    news(s, msg, "good");
  }
  poll(s, p);
  return { ok: true, msg };
}

/** A debate: answer on a topic, from one end to the other (-1, 0 or 1). */
export function answerDebate(s: State, stance: -1 | 0 | 1): Res {
  const p = s.pol;
  if (!p?.debate || p.debate.asked) return no("No debate on");
  const ax = p.debate.topic;
  p.debate.asked = true;
  for (const g of GROUP_ORDER) p.bonus[p.player][g] += 7 * (1 - Math.abs(GROUPS[g].pref[ax] - stance)) - 4;
  const flip = Math.abs(playerParty(p).pos[ax] - stance) > 1;
  if (flip) p.trust = clamp(p.trust - 6, 0, 100);
  else p.trust = clamp(p.trust + 2, 0, 100);
  poll(s, p);
  return { ok: true, msg: flip ? "A strong answer, but it isn't what your party stands for. Voters noticed." : "A solid performance in the debate." };
}

/* ------------------------------------------------------------------ opposition */

/** March against something the government did. */
export function protest(s: State, actId: number): Res {
  const p = s.pol;
  if (!p) return no("No politics in this world");
  if (p.government === p.player) return no("You can't protest against your own government");
  const a = p.log.find((x) => x.id === actId);
  if (!a) return no("Pick something to protest against");
  if (a.protested) return no("You've already marched against that");
  const why = spend(p, 2, 25_000);
  if (why) return no(why);
  a.protested = true;
  let crowd = 0;
  for (const g of GROUP_ORDER) {
    const against = -GROUPS[g].pref[a.axis] * a.dir;
    if (against > 0.1) {
      p.bonus[p.player][g] += 6 * against;
      p.bonus[p.government][g] -= 5 * against;
      crowd += against;
    } else if (against < -0.3) p.bonus[p.player][g] -= 2;
  }
  s.mood -= 1.2;
  const size = Math.round(300 + crowd * 900 + R(s) * 600);
  let msg = `${size.toLocaleString()} people marched against: ${a.text}`;
  const b = a.building >= 0 ? s.buildings[a.building] : null;
  if (b && !b.done && R(s) < 0.4) {
    act.bulldozeBuilding(s, b.id);
    msg += ` The government backed down and ${b.name} is cancelled.`;
    news(s, `After protests, ${p.parties[p.government].name} cancels ${b.name}.`, "good");
  } else news(s, `Protest: ${a.text}`, "info");
  poll(s, p);
  return { ok: true, msg };
}

export type Ask = "homes" | "tram" | "park" | "taxCut";

export const ASKS: Record<Ask, { name: string; axis: Axis; dir: 1 | -1; groups: GroupId[] }> = {
  homes: { name: "Zone more homes", axis: "housing", dir: 1, groups: ["renters", "young"] },
  tram: { name: "Build a tram line", axis: "transit", dir: 1, groups: ["young", "renters"] },
  park: { name: "Build a park", axis: "green", dir: 1, groups: ["families", "retirees"] },
  taxCut: { name: "Cut property tax", axis: "tax", dir: -1, groups: ["owners", "business"] },
};

/** Lobby City Hall to do something; the government may, if it suits them. */
export function lobbyGovernment(s: State, ask: Ask): Res {
  const p = s.pol;
  if (!p) return no("No politics in this world");
  if (p.government === p.player) return no("You run City Hall");
  const why = spend(p, 1, 0);
  if (why) return no(why);
  const a = ASKS[ask];
  const gov = p.parties[p.government];
  for (const g of a.groups) p.bonus[p.player][g] += 3;
  const chance = 0.2 + 0.4 * Math.max(0, gov.pos[a.axis] * a.dir);
  if (R(s) < chance && governDo(s, p, ask)) {
    poll(s, p);
    return { ok: true, msg: `City Hall listened: ${a.name.toLowerCase()}. Your supporters are pleased.` };
  }
  poll(s, p);
  return { ok: true, msg: `City Hall said no, but people heard you ask.` };
}

/* ------------------------------------------------------------------ AI government */

function logAct(s: State, p: Pol, text: string, axis: Axis, dir: 1 | -1, building = -1) {
  p.log.unshift({ id: p.nextId++, month: s.month, text, axis, dir, building, protested: false });
  if (p.log.length > 30) p.log.length = 30;
}

/** Do one of the things the government can be asked for. Returns whether it happened. */
function governDo(s: State, p: Pol, what: Ask): boolean {
  const gov = p.parties[p.government];
  if (what === "taxCut") {
    act.setTax(s, s.taxRate - 0.2);
    logAct(s, p, `${gov.short} cut property tax to ${s.taxRate.toFixed(1)}%`, "tax", -1);
    return true;
  }
  if (what === "tram") {
    const P = places(s);
    const e = s.edges
      .filter((x) => x && x.conn && x.kind !== "lane" && !x.tram)
      .sort((a, b) => dist2(a!.pts, P.centre) - dist2(b!.pts, P.centre))
      .slice(0, 4);
    let done = 0;
    for (const x of e) if (act.upgradeRoad(s, x!.id, { kind: "avenue", tram: true }).ok) done++;
    if (done) logAct(s, p, `${gov.short} laid tram tracks down ${e[0]!.name}`, "transit", 1);
    return done > 0;
  }
  if (what === "park") {
    const lot = s.lots.find((l) => l && l.bld < 0 && l.district >= 0 && s.districts[l.district]?.use === "homes");
    if (!lot) return false;
    const r = act.placeCivic(s, "park", lot.id);
    if (r.ok) logAct(s, p, `${gov.short} is building a park`, "green", 1, r.id);
    return r.ok;
  }
  // Homes: lay out a new neighbourhood on the edge of town.
  const P = places(s);
  const housing = gov.pos.housing;
  for (let k = 0; k < 14; k++) {
    const ang = R(s) * Math.PI * 2;
    const d = 500 + R(s) * 700;
    const cx = P.centre.x + Math.cos(ang) * d;
    const cz = P.centre.z + Math.sin(ang) * d;
    if (Math.abs(cx) > 1250 || Math.abs(cz) > 1250 || inWater(s, cx, cz, 150)) continue;
    const top = districtAt(s, cx, cz);
    if (top && top.use !== "farms") continue;
    const r = districtRect(cx - 320, cz - 250, cx + 320, cz + 250);
    const pattern = housing > 0.4 ? "grid" : housing > 0 ? "curvy" : "culdesac";
    const band = housing > 0.5 && s.stats.pop > 800 ? 3 : housing > 0.2 ? 2 : 1;
    const res = act.layOut(s, r.obb, r.poly, pattern, "homes", band);
    if (res.ok) {
      logAct(s, p, `${gov.short} zoned ${s.districts[res.district]!.name} for homes`, "housing", 1);
      return true;
    }
  }
  return false;
}

function dist2(pts: Pts, c: { x: number; z: number }) {
  return (pts[0] - c.x) ** 2 + (pts[1] - c.z) ** 2;
}

/** A party that isn't you runs the city by its own lights. */
export function aiGovern(s: State, p: Pol) {
  const gov = p.parties[p.government];
  const pos = gov.pos;
  // Tax drifts to where they like it.
  const want = clamp(0.75 + pos.tax * 0.35, 0.4, law(s, "rateCap") ? 1 : 1.8);
  if (Math.abs(s.taxRate - want) > 0.05) act.setTax(s, s.taxRate + Math.sign(want - s.taxRate) * 0.1);
  // Applications: builders' friends say yes.
  for (const a of [...s.apps]) {
    const yes = pos.housing > (a.lean === "no" ? 0.45 : -0.15);
    const before = s.buildings.length;
    act.decide(s, a.id, yes);
    if (yes) logAct(s, p, `${gov.short} approved ${a.plan.name} (${a.plan.storeys} storeys)`, "housing", 1, s.buildings.length > before ? s.buildings.length - 1 : -1);
    else logAct(s, p, `${gov.short} turned down ${a.plan.name}`, "housing", -1);
  }
  const money = s.money > 3_000_000;
  if (money && s.stats.homeDemand > 120 && R(s) < 0.18 + Math.max(0, pos.housing) * 0.3) governDo(s, p, "homes");
  if (money && s.rentIndex > 1.3 && pos.housing > 0.2 && R(s) < 0.2) {
    const d = s.districts.filter((x) => x && x.use === "homes" && x.band < 3).sort(() => R(s) - 0.5)[0];
    if (d) {
      const r = act.upzone(s, d.poly);
      if (r.ok) logAct(s, p, `${gov.short} upzoned ${d.name}`, "housing", 1);
    }
  }
  if (money && pos.transit > 0.3 && s.stats.pop > 1500 && km(s, "tram") < 1 && R(s) < 0.12) governDo(s, p, "tram");
  if (money && pos.transit > 0 && R(s) < 0.08) {
    const e = s.edges.find((x) => x && x.kind === "street" && !x.bike && x.conn);
    if (e && act.upgradeRoad(s, e.id, { bike: true }).ok) logAct(s, p, `${gov.short} painted bike lanes on ${e.name}`, "transit", 1);
  }
  if (money && pos.green > 0.2 && R(s) < 0.08) governDo(s, p, "park");
  if (money && pos.housing < -0.4 && s.rentIndex > 1.2 && R(s) < 0.05) logAct(s, p, `${gov.short} refused to rezone for more homes`, "housing", -1);
}

/* ------------------------------------------------------------------ the week and the month */

function aiCampaign(s: State, p: Pol) {
  const k = p.settings.difficulty === "hard" ? 1.4 : p.settings.difficulty === "easy" ? 0.65 : 1;
  p.parties.forEach((party, i) => {
    if (!party.ai) return;
    // Work the seats they could win or lose.
    const ranked = [...p.electorates].sort((a, b) => marginFor(a, i) - marginFor(b, i));
    for (const e of ranked.slice(0, 2)) e.effort[i] += (0.5 + R(s) * 0.4) * k;
    if (R(s) < 0.3 * k) for (const e of p.electorates) e.effort[i] += 0.2;
    // Now and then, a promise that suits them.
    if (R(s) < 0.12 * k) {
      const best = PROMISE_ORDER.map((kind) => ({ kind, v: fitPromise(party.pos, kind) })).sort((a, b) => b.v - a.v)[0];
      for (const [g, v] of Object.entries(PROMISES[best.kind].effects) as [GroupId, number][]) p.bonus[i][g] += v * 0.6;
    }
  });
}

/** How close a party is to winning (or losing) a seat: small means marginal. */
function marginFor(e: Electorate, i: number) {
  const s = [...e.support].sort((a, b) => b - a);
  const mine = e.support[i];
  return mine >= s[0] ? s[0] - s[1] : s[0] - mine;
}

function fitPromise(pos: Position, kind: PromiseKind) {
  let v = 0;
  for (const [g, w] of Object.entries(PROMISES[kind].effects) as [GroupId, number][]) v += w * (1 - distance(g, pos) * 2);
  return v;
}

/** End the campaign week: the rivals campaign, a week passes, and the polls move. */
export function endWeek(s: State): ElectionResult | null {
  const p = s.pol;
  if (!p || !p.campaign) return null;
  aiCampaign(s, p);
  for (const e of p.electorates) e.effort = e.effort.map((v) => v * 0.82);
  advance(s, 0.25);
  p.week++;
  p.ap = p.apMax;
  // A televised debate three weeks out.
  if (p.week === Math.max(1, p.settings.campaignWeeks - 3)) {
    p.debate = { topic: AXES[Math.floor(R(s) * AXES.length)], asked: false };
    news(s, `Tonight's debate is on ${AXIS_INFO[p.debate.topic].name.toLowerCase()}.`, "tip");
  }
  demographics(s, p);
  poll(s, p);
  record(s, p);
  if (p.week >= p.settings.campaignWeeks) return election(s);
  return null;
}

/** Monthly politics (runs from the city's month tick). */
export function monthPol(s: State) {
  const p = s.pol;
  if (!p) return;
  demographics(s, p);
  // Donations from the groups that back you.
  for (const g of GROUP_ORDER) if (p.lobby[g] > 30) p.funds += Math.round(p.lobby[g] * 600);
  for (const g of GROUP_ORDER) for (const b of p.bonus) b[g] *= 0.985;
  if (!p.campaign) {
    p.ap = Math.min(p.apMax, p.ap + 2);
    for (const e of p.electorates) e.effort = e.effort.map((v) => v * 0.6);
  }
  if (p.government !== p.player && p.role !== "candidate") aiGovern(s, p);
  else if (p.government !== p.player && p.role === "candidate" && s.month % 2 === 0) aiGovern(s, p);
  federalMonth(s, p);
  poll(s, p);
  if (!p.campaign) record(s, p);
  if (!p.campaign && s.month >= p.campaignFrom) {
    // The map is redrawn for the election if the city has outgrown it.
    p.redraw = null;
    redistribute(s, p);
    p.campaign = true;
    p.week = 0;
    p.ap = p.apMax;
    news(s, `The campaign is on: ${p.settings.campaignWeeks} weeks to election day.`, "tip");
  }
}

hooks.month = monthPol;

/* ------------------------------------------------------------------ election day */

function closest(p: Pol, from: number, among: number[]) {
  let best = among[0];
  let bd = Infinity;
  for (const j of among) {
    let d = 0;
    for (const a of AXES) d += Math.abs(p.parties[from].pos[a] - p.parties[j].pos[a]);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}

/** Seats in the rest of the country, plus the city's own. */
function nationalSeats(s: State, p: Pol, city: number[], first = false) {
  const rest = Math.max(0, p.settings.federalSeats - p.electorates.length);
  const cityVotes = cityShare(p);
  const share = p.parties.map((party, i) => {
    let v = party.national + (R(s) - 0.5) * 0.04;
    if (i === p.player && !first) v = 0.04 + cityVotes[i] * 0.45 + (p.trust - 50) / 1000;
    return Math.max(0.01, v);
  });
  const w = share.map((v) => Math.pow(v, 1.6));
  const sum = w.reduce((a, b) => a + b, 0);
  const seats = w.map((v) => Math.floor((v / sum) * rest));
  let left = rest - seats.reduce((a, b) => a + b, 0);
  const order = w.map((v, i) => ({ i, r: (v / sum) * rest - seats[i] })).sort((a, b) => b.r - a.r);
  for (let k = 0; left > 0; k++, left--) seats[order[k % order.length].i]++;
  return seats.map((v, i) => v + city[i]);
}

export function election(s: State): ElectionResult {
  const p = s.pol!;
  demographics(s, p);
  const P = p.parties.length;
  const rows: ElectionResult["rows"] = [];
  for (const e of p.electorates) {
    const share = softmax(scores(s, p, e, 0.05));
    let votes = share.map((v) => Math.round(v * e.voters));
    const was = e.holder;
    let winner = votes.indexOf(Math.max(...votes));
    let margin = 0;
    if (p.settings.system === "preferential") {
      // Count down to two, passing preferences to the nearest party left in.
      const v = [...votes];
      let alive = p.parties.map((_, i) => i);
      while (alive.length > 2 && Math.max(...alive.map((i) => v[i])) * 2 < alive.reduce((a, i) => a + v[i], 0)) {
        const low = alive.reduce((a, i) => (v[i] < v[a] ? i : a), alive[0]);
        alive = alive.filter((i) => i !== low);
        const to = closest(p, low, alive);
        const rest = alive.filter((i) => i !== to);
        v[to] += Math.round(v[low] * 0.75);
        if (rest.length) v[closest(p, low, rest)] += Math.round(v[low] * 0.25);
        v[low] = 0;
      }
      winner = alive.reduce((a, i) => (v[i] > v[a] ? i : a), alive[0]);
      const total = alive.reduce((a, i) => a + v[i], 0);
      const second = Math.max(...alive.filter((i) => i !== winner).map((i) => v[i]), 0);
      margin = (v[winner] - second) / Math.max(1, total);
      votes = v.map((x, i) => (alive.includes(i) ? x : votes[i]));
    } else {
      const sorted = [...votes].sort((a, b) => b - a);
      margin = (sorted[0] - sorted[1]) / Math.max(1, e.voters);
    }
    e.holder = winner;
    e.mp = e.candidates[winner];
    e.last = { votes, winner, margin };
    rows.push({ electorate: e.id, name: e.name, votes, winner, margin, was });
  }
  const seats = Array.from({ length: P }, (_, i) => p.electorates.filter((e) => e.holder === i).length);
  const top = Math.max(...seats);
  const tied = seats.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
  const share = cityShare(p);
  const winner = tied.includes(p.government) ? p.government : tied.reduce((a, i) => (share[i] > share[a] ? i : a), tied[0]);
  const mine = p.electorates[p.seat].holder === p.player;
  // Promises: kept or broken?
  let kept = 0;
  let broken = 0;
  for (const r of p.promises) {
    if (r.status !== "open" || r.made === s.month) continue;
    if (p.role === "candidate") continue;
    const ok = promiseKept(s, r);
    r.status = ok ? "kept" : "broken";
    if (ok) kept++;
    else {
      broken++;
      for (const [g, v] of Object.entries(PROMISES[r.kind].effects) as [GroupId, number][]) if (v > 0) p.bonus[p.player][g] -= v * 0.8;
    }
  }
  p.trust = clamp(p.trust + kept * 6 - broken * 10, 0, 100);
  // The federal result.
  const federal = nationalSeats(s, p, seats);
  const fedWinner = federal.indexOf(Math.max(...federal));
  const before = p.government;
  p.government = winner;
  p.federal.seats = federal;
  p.federal.government = fedWinner;
  p.federal.nextSitting = s.month + 2;
  p.federal.sitting = false;
  p.role = winner === p.player ? "govern" : mine ? "opposition" : "out";
  p.campaign = false;
  p.week = 0;
  p.debate = null;
  p.electionAt = s.month + p.settings.termYears * 12;
  p.campaignFrom = p.electionAt - Math.ceil(p.settings.campaignWeeks / 4.33);
  p.ap = p.apMax;
  p.log = [];
  const res: ElectionResult = { month: s.month, seats, winner, mine, federal, federalWinner: fedWinner, kept, broken, rows };
  p.results.push(res);
  p.night = res;
  const w = p.parties[winner];
  news(s, `${w.name} ${winner === before ? "holds" : "wins"} the city with ${seats[winner]} of ${p.electorates.length} seats.`, winner === p.player ? "good" : "bad");
  poll(s, p);
  record(s, p);
  return res;
}

/** Close the election-night screen. */
export function closeNight(s: State) {
  if (s.pol) s.pol.night = null;
}

/* ------------------------------------------------------------------ the federal parliament */

export function hasSeat(p: Pol) {
  return p.electorates[p.seat]?.holder === p.player;
}

function billSupport(pos: Position, b: Bill) {
  const v = BILLS[b.kind].vec;
  let d = 0;
  for (const a of AXES) d += pos[a] * v[a];
  return b.repeal ? -d : d;
}

function newBill(p: Pol, kind: BillKind, by: number, month: number): Bill {
  return { id: p.nextId++, kind, repeal: !!p.federal.laws[kind], by, month, status: "pending", yes: 0, no: 0, myVote: null };
}

function federalMonth(s: State, p: Pol) {
  const F = p.federal;
  if (F.sitting && s.month >= F.nextSitting + 1) {
    for (const b of F.bills) if (b.status === "pending") resolveBill(s, p, b);
    F.history.unshift(...F.bills);
    F.history.length = Math.min(F.history.length, 24);
    F.bills = [];
    F.sitting = false;
    F.nextSitting += 3;
  }
  if (!F.sitting && s.month >= F.nextSitting && !p.campaign) {
    F.sitting = true;
    F.asked = false;
    F.proposed = false;
    // The government brings the bill it likes most (passing it, or repealing one it doesn't).
    const gov = p.parties[F.government];
    const options = BILL_ORDER.map((k) => newBill(p, k, -1, s.month)).filter((b) => billSupport(gov.pos, b) > 0.25);
    options.sort((a, b) => billSupport(gov.pos, b) - billSupport(gov.pos, a));
    const pick = options[Math.floor(R(s) * Math.min(2, options.length))];
    if (pick) F.bills.push(pick);
    else p.nextId--;
    news(s, hasSeat(p) ? "Parliament is sitting. There's a bill to vote on." : "Parliament is sitting.", "tip");
  }
}

function resolveBill(s: State, p: Pol, b: Bill) {
  let yes = 0;
  let no2 = 0;
  p.parties.forEach((party, i) => {
    const seats = p.federal.seats[i];
    if (i === p.player) {
      const v = b.myVote ?? (hasSeat(p) ? "abstain" : billSupport(party.pos, b) > 0 ? "yes" : "no");
      if (v === "yes") yes += seats;
      else if (v === "no") no2 += seats;
      return;
    }
    if (billSupport(party.pos, b) > 0.05) yes += seats;
    else no2 += seats;
  });
  b.yes = yes;
  b.no = no2;
  b.status = yes > no2 ? "passed" : "failed";
  if (b.status === "passed") {
    p.federal.laws[b.kind] = !b.repeal;
    news(s, `${b.repeal ? "Repealed" : "Passed"}: the ${BILLS[b.kind].title}, ${yes} to ${no2}.`, "good");
  } else news(s, `Defeated: the ${BILLS[b.kind].title}${b.repeal ? " repeal" : ""}, ${yes} to ${no2}.`);
}

export function vote(s: State, billId: number, v: "yes" | "no" | "abstain"): Res {
  const p = s.pol;
  if (!p) return no("No politics in this world");
  if (!hasSeat(p)) return no("You need a seat in parliament to vote");
  const b = p.federal.bills.find((x) => x.id === billId);
  if (!b || b.status !== "pending") return no("That vote is over");
  b.myVote = v;
  // Crossing your own party's line costs trust; voting with your beliefs earns a little.
  const line = billSupport(playerParty(p).pos, b) > 0 ? "yes" : "no";
  if (v !== "abstain" && v !== line) p.trust = clamp(p.trust - 3, 0, 100);
  resolveBill(s, p, b);
  return { ok: true, msg: `${BILLS[b.kind].title}${b.repeal ? " (repeal)" : ""}: ${b.status} ${b.yes}–${b.no}.` };
}

/** Question Time: put a question to the government (or, in government, a friendly one to your minister). */
export function askQuestion(s: State, topic: Axis): Res {
  const p = s.pol;
  if (!p) return no("No politics in this world");
  if (!hasSeat(p)) return no("You need a seat in parliament");
  if (!p.federal.sitting) return no("Parliament isn't sitting");
  if (p.federal.asked) return no("You've had your question this sitting");
  p.federal.asked = true;
  const mine = playerParty(p).pos[topic];
  for (const g of GROUP_ORDER) p.bonus[p.player][g] += 3 * (1 - Math.abs(GROUPS[g].pref[topic] - mine)) - 1;
  const govIsMine = p.federal.government === p.player;
  if (!govIsMine) p.bonus[p.federal.government].renters -= 1;
  playerParty(p).national += 0.004;
  poll(s, p);
  return { ok: true, msg: govIsMine ? `A friendly question on ${AXIS_INFO[topic].name.toLowerCase()}; your minister shone.` : `You grilled the government on ${AXIS_INFO[topic].name.toLowerCase()}. It made the evening news.` };
}

/** A private member's bill: you bring a law to the floor and it's voted on at once. */
export function proposeBill(s: State, kind: BillKind): Res {
  const p = s.pol;
  if (!p) return no("No politics in this world");
  if (!hasSeat(p)) return no("You need a seat in parliament");
  if (!p.federal.sitting) return no("Parliament isn't sitting");
  if (p.federal.proposed) return no("One bill a sitting");
  p.federal.proposed = true;
  const b = newBill(p, kind, p.player, s.month);
  b.myVote = "yes";
  p.federal.bills.push(b);
  resolveBill(s, p, b);
  return { ok: true, msg: `Your ${BILLS[kind].title}${b.repeal ? " repeal" : ""} ${b.status}, ${b.yes} to ${b.no}.` };
}

export function partyName(p: Pol, i: number) {
  return p.parties[i]?.name ?? "Nobody";
}

/** Settings players can change for the next term (none mid-term, for now). */
export function roleText(p: Pol) {
  const party = playerParty(p);
  const gov = p.parties[p.government];
  const r: Role = p.role;
  if (r === "candidate") return `${party.leader} is standing for ${p.electorates[p.seat].name}. ${gov.name} runs the city.`;
  if (r === "govern") return `${party.name} runs the city${hasSeat(p) ? `, and you hold ${p.electorates[p.seat].name}` : ", though you lost your own seat"}.`;
  if (r === "opposition") return `${gov.name} runs the city. You lead the opposition from ${p.electorates[p.seat].name}.`;
  return `${gov.name} runs the city, and you lost ${p.electorates[p.seat].name}. You lead ${party.name} from outside parliament.`;
}

