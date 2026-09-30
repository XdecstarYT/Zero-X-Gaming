import type { Rng } from "../engine/rng";

/**
 * Everyone you can stop in Bayview has a record: licence status, warrants,
 * what they're carrying and how they'll react. Vehicles have a registration.
 * The player only learns these through the stop (ID check, plate run,
 * questions, breathalyzer, search).
 */

export type Licence = "valid" | "suspended" | "expired" | "none";
export type Attitude = "polite" | "nervous" | "rude" | "hostile";

export interface Person {
  id: string;
  first: string;
  last: string;
  age: number;
  dob: string;
  licence: Licence;
  warrants: string[];
  /** Blood alcohol (0.08 is the limit). */
  bac: number;
  /** Carrying a concealed firearm. */
  armed: boolean;
  /** Carrying drugs. */
  drugs: boolean;
  attitude: Attitude;
  /** 0..1 chance to run when things go badly. */
  flee: number;
  /** 0..1 chance to fight (with a weapon if armed). */
  fight: number;
  /** Probation / parole note shown by the MDT. */
  note?: string;
}

export interface Registration {
  plate: string;
  owner: string;
  status: "valid" | "expired" | "stolen" | "uninsured";
  make: string;
}

const FIRST = [
  "James", "Maria", "Robert", "Linda", "Michael", "Sarah", "David", "Karen", "Daniel", "Ashley", "Jose", "Emily", "Kevin", "Jessica",
  "Brian", "Megan", "Tyrone", "Nicole", "Luis", "Amanda", "Travis", "Crystal", "Derek", "Tiffany", "Wade", "Rosa", "Cody", "Brandy",
  "Marcus", "Hannah", "Victor", "Chloe", "Dale", "Priya", "Omar", "Keisha", "Ray", "Leah", "Bobby", "Tanya",
];
const LAST = [
  "Smith", "Johnson", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Wilson", "Anderson", "Taylor", "Moore", "Jackson",
  "Martin", "Lee", "Thompson", "White", "Harris", "Clark", "Lewis", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Hill",
  "Green", "Baker", "Nguyen", "Patel", "Kowalski", "O'Brien", "Diaz", "Reyes", "Price", "Bennett", "Hayes", "Fox", "Stone", "Ward",
];
const WARRANTS = [
  "Failure to appear (traffic)",
  "Unpaid fines",
  "Probation violation",
  "Burglary",
  "Assault",
  "Grand theft auto",
  "Armed robbery",
  "Possession with intent",
];
export const MAKES = ["Norden Aria", "Kestrel LX", "Halvor Trek", "Mesa Ranger", "Castell Primo", "Vanta GT", "Orrin Cargo", "Brisa Coupe", "Tamsin 4x4"];

let seq = 0;

export interface PersonOpts {
  /** 0..1: how likely this person is to be up to something (callout suspects are high). */
  shady?: number;
  drunk?: boolean;
  armed?: boolean;
  hostile?: boolean;
}

export function makePerson(rng: Rng, o: PersonOpts = {}): Person {
  const shady = o.shady ?? 0.15;
  const age = rng.int(18, 72);
  const year = 2026 - age;
  const warrants: string[] = [];
  if (rng.next() < shady * 0.7) warrants.push(rng.pick(WARRANTS));
  if (rng.next() < shady * 0.2) warrants.push(rng.pick(WARRANTS));
  const lic = rng.next();
  const licence: Licence = lic < 0.78 - shady * 0.3 ? "valid" : lic < 0.88 ? "suspended" : lic < 0.95 ? "expired" : "none";
  const bac = o.drunk ? rng.range(0.09, 0.22) : rng.next() < 0.1 ? rng.range(0.02, 0.07) : rng.next() < shady * 0.25 ? rng.range(0.08, 0.16) : 0;
  const armed = o.armed ?? rng.next() < shady * 0.3;
  const att = rng.next();
  const attitude: Attitude = o.hostile ? "hostile" : att < 0.5 - shady * 0.3 ? "polite" : att < 0.8 ? "nervous" : att < 0.95 ? "rude" : "hostile";
  return {
    id: `p${++seq}`,
    first: rng.pick(FIRST),
    last: rng.pick(LAST),
    age,
    dob: `${String(rng.int(1, 12)).padStart(2, "0")}/${String(rng.int(1, 28)).padStart(2, "0")}/${year}`,
    licence,
    warrants,
    bac: Math.round(bac * 1000) / 1000,
    armed,
    drugs: rng.next() < shady * 0.35,
    attitude,
    flee: Math.min(0.95, 0.04 + shady * 0.5 + (warrants.length ? 0.25 : 0) + (attitude === "hostile" ? 0.2 : 0)),
    fight: o.hostile ? 0.9 : Math.min(0.8, (attitude === "hostile" ? 0.35 : attitude === "rude" ? 0.08 : 0.01) + (armed ? 0.15 : 0)),
    note: rng.next() < shady * 0.2 ? rng.pick(["On parole", "On probation", "Known gang affiliate", "Prior DUI"]) : undefined,
  };
}

export function fullName(p: Person) {
  return `${p.first} ${p.last}`;
}

export function makePlate(rng: Rng) {
  const L = "ABCDEFGHJKLMNPRSTUVWXYZ";
  return `${rng.int(1, 9)}${L[rng.int(0, L.length - 1)]}${L[rng.int(0, L.length - 1)]}${L[rng.int(0, L.length - 1)]}${rng.int(100, 999)}`;
}

export function makeRegistration(rng: Rng, driver: Person, o: { stolen?: boolean; shady?: number } = {}): Registration {
  const shady = o.shady ?? 0.15;
  const r = rng.next();
  const status: Registration["status"] = o.stolen ? "stolen" : r < 0.85 - shady * 0.2 ? "valid" : r < 0.94 ? "expired" : "uninsured";
  const owner = status === "stolen" || rng.next() < 0.15 ? `${rng.pick(FIRST)} ${rng.pick(LAST)}` : fullName(driver);
  return { plate: makePlate(rng), owner, status, make: rng.pick(MAKES) };
}

/** Things that give you a legal reason to cite, known once discovered. */
export type Violation =
  | "speeding"
  | "red light"
  | "broken tail light"
  | "expired registration"
  | "no insurance"
  | "suspended licence"
  | "expired licence"
  | "no licence"
  | "reckless driving";

/** Things that justify an arrest. */
export type Offence =
  | "outstanding warrant"
  | "DUI"
  | "possession of narcotics"
  | "unlawful carry of a firearm"
  | "stolen vehicle"
  | "evading police"
  | "resisting arrest"
  | "assault on an officer"
  | "armed robbery"
  | "discharging a firearm"
  | "domestic assault"
  | "shoplifting"
  | "driving while suspended";

/** What a driver says when asked a question, by attitude. */
export const LINES_WHY: Record<Attitude, string[]> = {
  polite: ["No officer, I'm not sure. Was I going too fast?", "Sorry officer, is something wrong?"],
  nervous: ["I... no. I really don't know.", "Is this about the car? It's my cousin's car."],
  rude: ["You tell me. Don't you have real criminals to catch?", "Nope. Can we speed this up?"],
  hostile: ["I don't have to tell you anything.", "Get out of my face, pig."],
};
export const LINES_DRINK = {
  sober: ["No sir, I don't drink.", "Not a drop, I'm driving."],
  some: ["Just one beer with dinner.", "A couple of glasses of wine, hours ago."],
  drunk: ["*slurring* I'm fine, I'm totally fine...", "Only like... two. Or five."],
};
export const LINES_ILLEGAL = {
  clean: ["No, nothing. You can look if you want.", "Nothing illegal, officer."],
  dirty: ["Why? What did you hear?", "Nah... nothing. Why are you asking?", "I know my rights."],
};
