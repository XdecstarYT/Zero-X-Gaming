import { createRng } from "../engine/rng";

/**
 * The Boundary Blitz league: eight invented T20 franchises with their own
 * colours and squads. Names, clubs and players are all made up.
 */

export type Role = "bat" | "keeper" | "allround" | "pace" | "spin";
export type BowlStyle = "pace" | "spin";

export interface Player {
  name: string;
  role: Role;
  /** 0–100. */
  bat: number;
  bowl: number;
  style: BowlStyle;
  /** Fielding / catching, 0–100. */
  field: number;
}

export interface Team {
  id: string;
  name: string;
  short: string;
  shirt: string;
  trim: string;
  /** Overall feel for the menus (1–5). */
  rating: number;
  players: Player[];
}

const FIRST = ["Arjun", "Callum", "Dev", "Eli", "Faisal", "Gus", "Hari", "Isaac", "Jai", "Kane", "Liam", "Marco", "Nathan", "Omar", "Priya", "Quinn", "Rohan", "Sam", "Tariq", "Usman", "Vik", "Will", "Xander", "Yash", "Zane", "Ben", "Kiran", "Noah", "Ravi", "Theo", "Ash", "Mitch", "Shan", "Jonty", "Lachie", "Imran"];
const LAST = ["Abbott", "Bhatia", "Carver", "Dhillon", "Ellis", "Fernando", "Gill", "Hughes", "Iqbal", "Jaffer", "Khan", "Lowe", "Mehta", "Norris", "O'Brien", "Patel", "Quayle", "Rahman", "Silva", "Thorpe", "Underwood", "Varma", "Walsh", "Yadav", "Zaidi", "Brooks", "Chandra", "Doyle", "Fraser", "Hale", "Joshi", "Kerr", "Malik", "Perera", "Reid", "Stokes"];

const SHAPE: [Role, number, number, BowlStyle][] = [
  ["bat", 82, 10, "pace"],
  ["bat", 80, 15, "spin"],
  ["bat", 85, 8, "pace"],
  ["bat", 78, 30, "spin"],
  ["allround", 70, 62, "pace"],
  ["keeper", 68, 0, "pace"],
  ["allround", 62, 68, "spin"],
  ["pace", 35, 80, "pace"],
  ["spin", 30, 78, "spin"],
  ["pace", 22, 82, "pace"],
  ["pace", 18, 84, "pace"],
];

function squad(seed: number, level: number): Player[] {
  const r = createRng(seed);
  const used = new Set<string>();
  return SHAPE.map(([role, bat, bowl, style]) => {
    let name = "";
    for (let k = 0; k < 20 && (!name || used.has(name)); k++) name = `${FIRST[Math.floor(r.next() * FIRST.length)]} ${LAST[Math.floor(r.next() * LAST.length)]}`;
    used.add(name);
    const j = () => Math.round((r.next() - 0.5) * 12);
    return {
      name,
      role,
      bat: Math.max(10, Math.min(99, bat + j() + level)),
      bowl: bowl ? Math.max(10, Math.min(99, bowl + j() + level)) : 0,
      style,
      field: Math.max(40, Math.min(99, 70 + j() + level)),
    };
  });
}

const T = (id: string, name: string, short: string, shirt: string, trim: string, rating: number, seed: number): Team => ({ id, name, short, shirt, trim, rating, players: squad(seed, (rating - 3) * 3) });

export const TEAMS: Team[] = [
  T("legends", "Zero X Legends", "ZXL", "#0e7490", "#22d3ee", 4, 11),
  T("cyclones", "Coastal Cyclones", "CYC", "#0369a1", "#7dd3fc", 4, 23),
  T("blaze", "Ember City Blaze", "BLZ", "#c2410c", "#fdba74", 4, 37),
  T("comets", "Capital Comets", "COM", "#6d28d9", "#d8b4fe", 3, 41),
  T("falcons", "Desert Falcons", "FAL", "#a16207", "#fde047", 5, 53),
  T("mariners", "Monsoon Mariners", "MAR", "#0f766e", "#5eead4", 3, 67),
  T("wolves", "Highland Wolves", "WLV", "#334155", "#cbd5e1", 2, 71),
  T("rhinos", "Riverside Rhinos", "RHI", "#b91c1c", "#fca5a5", 3, 89),
];

export const teamById = (id: string) => TEAMS.find((t) => t.id === id) ?? TEAMS[0];

/** Batting order is the squad order; bowlers are the five best bowlers. */
export function bowlers(t: Team) {
  return t.players
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.bowl >= 25)
    .sort((a, b) => b.p.bowl - a.p.bowl)
    .slice(0, 5)
    .map((x) => x.i);
}
