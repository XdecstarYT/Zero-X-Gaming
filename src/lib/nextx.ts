/**
 * NextX: Zero X's next-generation game production label. Its own app (/nextx) shows the titles
 * made to the NextX standard: photoreal 3D worlds, deep simulations, phone-first interfaces.
 */
export const NEXTX_SLUGS = ["yourgov", "zero-city"] as const;
export type NextXSlug = (typeof NEXTX_SLUGS)[number];

export const isNextX = (slug: string) => (NEXTX_SLUGS as readonly string[]).includes(slug);

export interface NextXTitle {
  slug: NextXSlug;
  /** A short line for the label's library. */
  pitch: string;
  /** The look of its card. */
  accent: string;
  accent2: string;
  stats: { v: string; k: string }[];
  features: string[];
}

export const NEXTX_TITLES: NextXTitle[] = [
  {
    slug: "yourgov",
    pitch: "Lead a party, write the laws and win a country, county by county, on a photoreal 3D map.",
    accent: "#3d6fd8",
    accent2: "#ffd60a",
    stats: [
      { v: "13", k: "Countries" },
      { v: "45+", k: "Laws" },
      { v: "48", k: "Achievements" },
    ],
    features: [
      "Twelve real countries and their real political systems",
      "Write your own laws, policies, orders, events and crises",
      "A living society, economy, markets and world",
      "Elections counted county by county",
    ],
  },
  {
    slug: "zero-city",
    pitch: "Draw roads, paint zones and run a living 3D city, then govern it as mayor.",
    accent: "#22e5ff",
    accent2: "#f5a25a",
    stats: [
      { v: "10", k: "Maps" },
      { v: "8", k: "Road tools" },
      { v: "16", k: "Politics pages" },
    ],
    features: [
      "Roads, bridges, roundabouts and real traffic",
      "Cities that grow from a hamlet to a megalopolis",
      "Mayor mode with a parliament, budget and elections",
      "Eight languages and a liquid-glass interface",
    ],
  },
];

/** What every NextX title is held to. */
export const NEXTX_STANDARD = [
  { icon: "◆", title: "Photoreal 3D", body: "Worlds lit like the real thing, running in the browser with nothing to download." },
  { icon: "◈", title: "Deep simulation", body: "Systems that talk to each other: every choice ripples through the whole game." },
  { icon: "▣", title: "Phone first", body: "Built for a thumb before a mouse: every panel scrolls, every button is in reach." },
  { icon: "✦", title: "Always updating", body: "Mega updates, not patches: hundreds of features at a time." },
];
