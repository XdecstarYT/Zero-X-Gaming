import { createRng } from "../engine/rng";

/**
 * Every club's list: eighteen made-up players in position order (full back
 * to the ruck), the same every time, so a season's medal count and leading
 * goalkicker can follow real names. The women's competition has its own.
 */

const MEN = ["Jack", "Tom", "Lachie", "Josh", "Will", "Sam", "Harry", "Max", "Ollie", "Charlie", "Jye", "Zac", "Riley", "Callum", "Noah", "Darcy", "Toby", "Isaac", "Mitch", "Hayden", "Cooper", "Jordan", "Nick", "Bailey", "Kane", "Luke", "Jake", "Ben", "Dylan", "Ryan"];
const WOMEN = ["Ella", "Grace", "Sophie", "Chloe", "Mia", "Zoe", "Ruby", "Jess", "Maddy", "Emma", "Isla", "Tayla", "Kate", "Lily", "Georgia", "Hannah", "Abbey", "Tilly", "Amy", "Brooke", "Erin", "Libby", "Sarah", "Bree", "Jasmine", "Molly", "Olivia", "Ash", "Kiara", "Lauren"];
const LAST = [
  "Kelly", "Walsh", "Brennan", "Doyle", "Murphy", "Fitzgerald", "McCarthy", "Ryan", "O'Connor", "Gallagher", "Hogan", "Quinn", "Nolan", "Farrell", "Burke", "Daly", "Moloney", "Byrne", "Cotter", "Sheehan",
  "Petrakis", "Nikolaidis", "Rossi", "Bianchi", "Conti", "Marino", "Novak", "Kovac", "Horvat", "Nguyen", "Tran", "Wilson", "Thompson", "Harris", "Mitchell", "Clarke", "Bennett", "Fraser", "Gibbs", "Hardy",
  "Lockyer", "Pickett", "Whitfield", "Sandford", "Ashcroft", "Barrett", "Calder", "Dunstan", "Elliott", "Fairbairn", "Gorman", "Hollis", "Ingram", "Jeffs", "Kerrigan", "Lever", "Merritt", "Naughton", "Oakley", "Prior",
  "Rankine", "Sheargold", "Tunstall", "Upton", "Vardy", "Wheatley", "Yeo", "Ziebell", "Ablett", "Bontempelli", "Crisp", "Docherty", "Espie", "Fyfe", "Grundy", "Heeney", "Iles", "Jansen", "Kemp", "Lamb",
];

export interface RosterPlayer {
  first: string;
  last: string;
}

const cache = new Map<string, RosterPlayer[]>();

/** A club's eighteen, in position order. */
export function rosterFor(club: string, women = false): RosterPlayer[] {
  const key = `${club}:${women ? "w" : "m"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const seed = [...key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 2166136261);
  const r = createRng(seed);
  const firsts = women ? WOMEN : MEN;
  const used = new Set<string>();
  const list: RosterPlayer[] = [];
  for (let i = 0; i < 18; i++) {
    let last = LAST[Math.floor(r.next() * LAST.length)];
    for (let k = 0; k < 40 && used.has(last); k++) last = LAST[Math.floor(r.next() * LAST.length)];
    used.add(last);
    list.push({ first: firsts[Math.floor(r.next() * firsts.length)], last });
  }
  cache.set(key, list);
  return list;
}

/** Surnames in position order, for the match engine. */
export const rosterNames = (club: string, women = false) => rosterFor(club, women).map((p) => p.last);

/** "Jack Kelly" from a club and surname. */
export function fullName(club: string, last: string, women = false) {
  const p = rosterFor(club, women).find((x) => x.last === last);
  return p ? `${p.first} ${p.last}` : last;
}

/** Position weights (by role index) for goals and votes in simulated games. */
export const GOAL_WEIGHT = [0.05, 0.05, 0.05, 0.1, 0.15, 0.15, 0.8, 0.5, 0.5, 2.2, 1.5, 1.5, 4, 2.5, 2.5, 0.8, 0.9, 0.6];
export const VOTE_WEIGHT = [0.7, 0.5, 0.5, 0.9, 0.8, 0.8, 2.6, 1.6, 1.6, 1.4, 1.1, 1.1, 1.6, 0.9, 0.9, 2.8, 2.5, 1.8];
