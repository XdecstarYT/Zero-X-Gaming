/** The touring pros at the Zero X Open (invented). */

export interface Rival {
  id: string;
  name: string;
  country: string;
  style: string;
  /** 0–1: goes for the lines; trades safety for winners. */
  aggression: number;
  /** Prefers slice and drop shots. */
  touch: number;
}

export const RIVALS: Record<"men" | "women", Rival[]> = {
  men: [
    { id: "ruiz", name: "Mateo Ruiz", country: "ESP", style: "Clay-court grinder", aggression: 0.3, touch: 0.2 },
    { id: "lindqvist", name: "Erik Lindqvist", country: "SWE", style: "Big server, first-strike", aggression: 0.75, touch: 0.1 },
    { id: "okoye", name: "Daniel Okoye", country: "NGA", style: "All-court artist", aggression: 0.5, touch: 0.55 },
  ],
  women: [
    { id: "varga", name: "Anika Varga", country: "HUN", style: "Relentless baseliner", aggression: 0.45, touch: 0.15 },
    { id: "tanaka", name: "Rin Tanaka", country: "JPN", style: "Counter-puncher", aggression: 0.25, touch: 0.45 },
    { id: "moreau", name: "Camille Moreau", country: "FRA", style: "Power and pace", aggression: 0.8, touch: 0.2 },
  ],
};
