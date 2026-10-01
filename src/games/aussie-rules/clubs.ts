/** The competition's eight clubs (invented), shared by the match, the season and Live Sports. */

export interface Club {
  id: string;
  name: string;
  short: string;
  guernsey: string;
  hoop: string;
  shorts: string;
  number: string;
}

export const HOME: Club = { id: "hawks", name: "Harbour Hawks", short: "HAR", guernsey: "#a3122c", hoop: "#f2c230", shorts: "#15171d", number: "#ffffff" };
export const RIVALS: Club[] = [
  { id: "sharks", name: "Coastline Sharks", short: "COA", guernsey: "#0d7580", hoop: "#101418", shorts: "#f2f2f2", number: "#ffffff" },
  { id: "rams", name: "Ironbark Rams", short: "IRO", guernsey: "#1a2d68", hoop: "#ececec", shorts: "#1a2d68", number: "#ffffff" },
  { id: "kings", name: "Riverton Kings", short: "RIV", guernsey: "#47206f", hoop: "#e0b422", shorts: "#f2f2f2", number: "#e0b422" },
];
/** The whole competition: eight clubs. */
export const CLUBS: Club[] = [
  HOME,
  ...RIVALS,
  { id: "pelicans", name: "Westport Pelicans", short: "WES", guernsey: "#0b3d6b", hoop: "#f2c230", shorts: "#0b3d6b", number: "#f2c230" },
  { id: "stingrays", name: "Bayside Stingrays", short: "BAY", guernsey: "#f97316", hoop: "#1e3a8a", shorts: "#1e3a8a", number: "#ffffff" },
  { id: "foxes", name: "Redgum Foxes", short: "RED", guernsey: "#b91c1c", hoop: "#fafaf9", shorts: "#fafaf9", number: "#111827" },
  { id: "wolves", name: "Highland Wolves", short: "HIG", guernsey: "#334155", hoop: "#a3e635", shorts: "#111827", number: "#a3e635" },
];
export const clubById = (id: string) => CLUBS.find((c) => c.id === id) ?? HOME;
