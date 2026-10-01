/**
 * The clubs, in three tiers: the National League (18 clubs at the real home
 * grounds of the elite competition, with our own nicknames and no logos), the
 * State League (8) and the Local League (8). Players can rename and recolour
 * any club on their device (the club editor), like an option file in a
 * licensed sports game; those edits are applied over these defaults.
 */

export interface Club {
  id: string;
  name: string;
  short: string;
  guernsey: string;
  hoop: string;
  shorts: string;
  number: string;
}

const c = (id: string, name: string, short: string, guernsey: string, hoop: string, shorts: string, number = "#ffffff"): Club => ({ id, name, short, guernsey, hoop, shorts, number });

/** The National League: eighteen clubs. */
export const NATIONAL: Club[] = [
  c("adelaide", "Adelaide Kestrels", "ADE", "#0f1f4b", "#e21937", "#0f1f4b", "#ffd200"),
  c("brisbane", "Brisbane Cyclones", "BRI", "#7a0033", "#fdbe57", "#0055a3"),
  c("carlton", "Carlton Kingfishers", "CAR", "#031a3f", "#f2f2f2", "#f2f2f2"),
  c("collingwood", "Collingwood Ravens", "COL", "#111111", "#f2f2f2", "#111111"),
  c("essendon", "Essendon Thunder", "ESS", "#111111", "#cc2031", "#111111"),
  c("fremantle", "Fremantle Anchors", "FRE", "#2a0d54", "#f2f2f2", "#2a0d54"),
  c("geelong", "Geelong Sharks", "GEE", "#1c3c63", "#f2f2f2", "#f2f2f2", "#1c3c63"),
  c("goldcoast", "Gold Coast Surfers", "GCS", "#d71920", "#f6bd16", "#d71920"),
  c("westsydney", "Western Sydney Flames", "WSY", "#f47920", "#4a4f55", "#4a4f55"),
  c("hawthorn", "Hawthorn Falcons", "HAW", "#4d2004", "#fbbf15", "#4d2004"),
  c("melbourne", "Melbourne Monarchs", "MEL", "#0f1131", "#cc2031", "#0f1131"),
  c("northmelb", "North Melbourne Stallions", "NME", "#013b9f", "#f2f2f2", "#f2f2f2", "#013b9f"),
  c("portadelaide", "Port Adelaide Mariners", "PTA", "#008aab", "#111111", "#111111"),
  c("richmond", "Richmond Panthers", "RIC", "#111111", "#fed102", "#111111", "#fed102"),
  c("stkilda", "St Kilda Knights", "STK", "#ed0f05", "#111111", "#111111"),
  c("sydney", "Sydney Herons", "SYD", "#ed171f", "#f2f2f2", "#f2f2f2", "#ed171f"),
  c("perth", "Perth Albatross", "PER", "#062ee2", "#ffd700", "#062ee2"),
  c("footscray", "Footscray Terriers", "FOO", "#0039a6", "#e21937", "#f2f2f2"),
];

/** The State League: eight clubs one step below. */
export const STATE: Club[] = [
  c("hawks", "Harbour Hawks", "HAR", "#a3122c", "#f2c230", "#15171d"),
  c("sharks", "Coastline Sharks", "COA", "#0d7580", "#101418", "#f2f2f2"),
  c("rams", "Ironbark Rams", "IRO", "#1a2d68", "#ececec", "#1a2d68"),
  c("kings", "Riverton Kings", "RIV", "#47206f", "#e0b422", "#f2f2f2", "#e0b422"),
  c("pelicans", "Westport Pelicans", "WES", "#0b3d6b", "#f2c230", "#0b3d6b", "#f2c230"),
  c("stingrays", "Bayside Stingrays", "BAY", "#f97316", "#1e3a8a", "#1e3a8a"),
  c("foxes", "Redgum Foxes", "RED", "#b91c1c", "#fafaf9", "#fafaf9", "#111827"),
  c("wolves", "Highland Wolves", "HIG", "#334155", "#a3e635", "#111827", "#a3e635"),
];

/** The Local League: where every career starts. */
export const LOCAL: Club[] = [
  c("wattle", "Wattle Creek Wombats", "WAT", "#4d7c0f", "#facc15", "#1c1917"),
  c("yarrabend", "Yarra Bend Bulls", "YAR", "#7f1d1d", "#f5f5f4", "#1c1917"),
  c("dingoflat", "Dingo Flat Dingoes", "DIN", "#c2410c", "#1c1917", "#1c1917"),
  c("malleepark", "Mallee Park Emus", "MAL", "#57534e", "#fde68a", "#57534e"),
  c("redhill", "Red Hill Robins", "RHL", "#dc2626", "#1e40af", "#1e40af"),
  c("bluegum", "Bluegum Owls", "BLU", "#1e3a8a", "#e5e7eb", "#1e3a8a"),
  c("coalvalley", "Coal Valley Miners", "CVM", "#18181b", "#f59e0b", "#18181b", "#f59e0b"),
  c("stonypoint", "Stony Point Seagulls", "STP", "#f5f5f4", "#0284c7", "#0c4a6e", "#0c4a6e"),
];

export type LeagueId = "local" | "state" | "national";

export interface League {
  id: LeagueId;
  name: string;
  clubs: Club[];
  /** Home-and-away rounds by default, and the finals system. */
  rounds: number;
  finals: "top4" | "top8";
}

export const LEAGUES: Record<LeagueId, League> = {
  local: { id: "local", name: "Local League", clubs: LOCAL, rounds: 7, finals: "top4" },
  state: { id: "state", name: "State League", clubs: STATE, rounds: 14, finals: "top4" },
  national: { id: "national", name: "National League", clubs: NATIONAL, rounds: 23, finals: "top8" },
};

/** Every club in every league. */
export const ALL_CLUBS: Club[] = [...NATIONAL, ...STATE, ...LOCAL];
/** The clubs for exhibition matches and Live Sports: the National League. */
export const CLUBS = NATIONAL;
export const HOME = NATIONAL[0];
/** Kept for older callers: everyone in the National League except the first club. */
export const RIVALS = NATIONAL.slice(1);

export const clubById = (id: string) => ALL_CLUBS.find((x) => x.id === id) ?? HOME;
export const leagueOf = (id: string): LeagueId => (NATIONAL.some((x) => x.id === id) ? "national" : STATE.some((x) => x.id === id) ? "state" : "local");

// ------------------------------------------------------------ club editor

export const CLUB_EDITS_KEY = "zx-footy-clubs";
export type ClubEdit = Partial<Pick<Club, "name" | "short" | "guernsey" | "hoop" | "shorts" | "number">>;

const DEFAULTS = new Map(ALL_CLUBS.map((x) => [x.id, { ...x }]));
const HEX = /^#[0-9a-f]{6}$/i;

/** Clean an edit: trimmed names, a 2–4 letter code, valid colours only. */
export function sanitizeEdit(e: ClubEdit): ClubEdit {
  const out: ClubEdit = {};
  if (typeof e.name === "string" && e.name.trim()) out.name = e.name.trim().slice(0, 32);
  if (typeof e.short === "string" && /^[a-z]{2,4}$/i.test(e.short.trim())) out.short = e.short.trim().toUpperCase();
  for (const k of ["guernsey", "hoop", "shorts", "number"] as const) if (typeof e[k] === "string" && HEX.test(e[k]!)) out[k] = e[k];
  return out;
}

/** Apply saved edits over the defaults (in place, so every screen sees them). */
export function applyClubEdits(edits: Record<string, ClubEdit>) {
  for (const club of ALL_CLUBS) Object.assign(club, DEFAULTS.get(club.id), sanitizeEdit(edits[club.id] ?? {}));
}

/** Load this device's club edits. */
export function loadClubEdits(): Record<string, ClubEdit> {
  try {
    const raw = JSON.parse(localStorage.getItem(CLUB_EDITS_KEY) ?? "{}");
    const edits = raw && typeof raw === "object" ? (raw as Record<string, ClubEdit>) : {};
    applyClubEdits(edits);
    return edits;
  } catch {
    return {};
  }
}

export function saveClubEdits(edits: Record<string, ClubEdit>) {
  applyClubEdits(edits);
  try {
    localStorage.setItem(CLUB_EDITS_KEY, JSON.stringify(edits));
  } catch {
    // Storage blocked: edits last for this visit.
  }
}

export const defaultClub = (id: string) => DEFAULTS.get(id);
