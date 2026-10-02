/**
 * Sports+: the sports line-up. Entries marked `live` are out now; the rest
 * are coming, and players can ask to be notified (stored on their device).
 */

export type SportStatus = "In development" | "Prototype" | "Planned";

export interface SportsGame {
  id: string;
  title: string;
  sport: string;
  tagline: string;
  features: string[];
  status: SportStatus;
  /** Rough window, e.g. "Season 2". */
  eta: string;
  /** Primary and secondary colours for the card art. */
  palette: [string, string];
  /** Which pictogram the card art draws. */
  art: "ball" | "hoop" | "puck" | "racket" | "bat" | "glove" | "flag" | "helmet" | "stumps";
  /** Out now: the slug of the playable game (it leaves the coming-soon line-up). */
  live?: string;
}

export const SPORTS: SportsGame[] = [
  {
    id: "pitch-kings",
    title: "Pitch Kings",
    sport: "Football (soccer)",
    tagline: "Five-a-side street football with skill moves, volleys and last-minute winners.",
    features: ["5v5 online and vs bots", "Street, cage and stadium pitches", "Tricks, through balls and headers"],
    status: "In development",
    eta: "Season 2",
    palette: ["#22c55e", "#0b3d1f"],
    art: "ball",
  },
  {
    id: "hoops-x",
    title: "Hoops X",
    sport: "Basketball",
    tagline: "3-on-3 rooftop basketball: crossovers, alley-oops and a shot meter that rewards timing.",
    features: ["3v3 and 1v1 king of the court", "Dunk contest mode", "Unlockable courts and kits"],
    status: "Prototype",
    eta: "Season 2",
    palette: ["#f97316", "#431407"],
    art: "hoop",
  },
  {
    id: "gridiron-blitz",
    title: "Gridiron Blitz",
    sport: "American football",
    tagline: "7-on-7 arcade football with a simple playbook, big hits and 60-second drives.",
    features: ["Pick a play, read the defence", "Online 2v2 co-op drives", "Season mode with a bowl game"],
    status: "Planned",
    eta: "Season 3",
    palette: ["#a78bfa", "#1e1b4b"],
    art: "helmet",
  },
  {
    id: "slapshot",
    title: "Slapshot",
    sport: "Ice hockey",
    tagline: "3-on-3 hockey on real ice physics: one-timers, dekes and body checks.",
    features: ["Momentum-based skating", "Overtime sudden death", "Ranked playoffs"],
    status: "Planned",
    eta: "Season 3",
    palette: ["#38bdf8", "#0c2a3f"],
    art: "puck",
  },
  {
    id: "ace-rally",
    title: "Ace Rally",
    sport: "Tennis",
    tagline: "Toss, serve, rally: topspin, slice, lobs and drop shots on grass, clay and hard court.",
    features: ["Singles against touring pros", "Full scoring with tiebreaks", "Touch controls built for phones"],
    status: "Prototype",
    live: "ace-rally",
    eta: "Season 2",
    palette: ["#facc15", "#3f3a0c"],
    art: "racket",
  },
  {
    id: "diamond-derby",
    title: "Diamond Derby",
    sport: "Baseball",
    tagline: "Home run derby: read the pitch, time the swing, clear the fences.",
    features: ["Pitch types and zones", "Three rounds to the title", "Statcast readouts and fireworks"],
    status: "In development",
    live: "diamond-derby",
    eta: "Season 2",
    palette: ["#f43f5e", "#3f0a16"],
    art: "bat",
  },
  {
    id: "boundary-blitz",
    title: "Boundary Blitz",
    sport: "Cricket",
    tagline: "T20 under lights: time the drive, clear the rope, bowl the yorker.",
    features: ["Full T20s, super overs and the nets", "Bat with aim and timing, bowl with a meter", "Eight franchises, field settings, LBW and run-outs"],
    status: "In development",
    live: "boundary-blitz",
    eta: "Season 2",
    palette: ["#22d3ee", "#0b3d2e"],
    art: "stumps",
  },
  {
    id: "knockout",
    title: "Knockout",
    sport: "Boxing",
    tagline: "Stamina-based boxing: jabs, hooks, slips and counters. Last one standing.",
    features: ["Career mode from the local gym", "Online bouts", "Corner advice between rounds"],
    status: "Planned",
    eta: "Season 3",
    palette: ["#ef4444", "#1f0a0a"],
    art: "glove",
  },
  {
    id: "fairway",
    title: "Fairway",
    sport: "Golf",
    tagline: "Links and parkland golf: wind, lies, and greens that break the way they look.",
    features: ["Stroke play against a field of pros", "Closest-to-the-pin challenge", "Two nine-hole courses, real ball flight"],
    status: "In development",
    live: "fairway",
    eta: "Season 2",
    palette: ["#84cc16", "#1a2e05"],
    art: "flag",
  },
];

export const SPORTS_FOLLOW_KEY = "zx-sports-follow";

/** Still to come (the coming-soon line-up). */
export const UPCOMING = SPORTS.filter((s) => !s.live);
