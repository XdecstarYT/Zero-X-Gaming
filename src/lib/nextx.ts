/**
 * NextX: Zero X's next-generation game production label. Its own app (/nextx) shows the titles
 * made to the NextX standard: photoreal 3D worlds, deep simulations, phone-first interfaces.
 */
export const NEXTX_SLUGS = ["heatwave", "wareforge", "yourgov", "zero-city"] as const;
export type NextXSlug = (typeof NEXTX_SLUGS)[number];

export const isNextX = (slug: string) => (NEXTX_SLUGS as readonly string[]).includes(slug);

/**
 * Where a game is played. NextX titles run inside the NextX app (they're still ZLink+ games,
 * unlocked by the membership); everything else has its page under /games.
 */
export const gameHref = (slug: string) => (isNextX(slug) ? `/nextx/play/${slug}` : `/games/${slug}`);

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
    slug: "heatwave",
    pitch: "An open-world crime story in a sun-baked island city: two leads, any car, the police on your tail.",
    accent: "#ff4fa3",
    accent2: "#ffb347",
    stats: [
      { v: "12", k: "Story missions" },
      { v: "18", k: "Vehicles" },
      { v: "9", k: "Districts" },
    ],
    features: [
      "Port Solano: beaches, towers, a harbor, swamps and island mansions, sunrise to neon night",
      "Steal any car, bike or boat; traffic that stops at the lights; police chases up to five stars",
      "Nina and Dex: switch between two leads through twelve story missions",
      "Phone first: touch controls, a turning minimap with GPS, four radio stations",
    ],
  },
  {
    slug: "wareforge",
    pitch: "Run a warehouse, a factory, a quarry and a chain of stores in 3D, then put up buildings brick by brick and let them.",
    accent: "#2f6fe4",
    accent2: "#f6c21c",
    stats: [
      { v: "13", k: "Sites" },
      { v: "75", k: "Goods" },
      { v: "28", k: "Machines" },
    ],
    features: [
      "Real estate and construction: plan it storey by storey, watch it go up brick by brick, let it",
      "Mining: quarry, mineshaft, kiln and steelworks make your own bricks, cement and beams",
      "Walk into your stores in 3D, and an open-plan hall you can build anywhere",
      "A live map of every shipment, tenders against rivals and ad campaigns",
      "Six industries, your own factory and stores in 13 cities, run from one panel",
      "Smooth on phones: NextX Engine graphics with an adaptive resolution",
    ],
  },
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

/** The NextX Engine: what the titles share, and which title it came from. */
export const NEXTX_ENGINE = [
  { title: "Liquid Glass UI", from: "All three", body: "Panels that bend the world behind them like thick glass, with a highlight that follows your finger." },
  { title: "Photoreal terrain", from: "YourGov", body: "Real elevation, rivers, farmland, forests, snow and cities, painted county by county." },
  { title: "Physical sky and sea", from: "YourGov", body: "An atmospheric sky, a sea with surf and drifting clouds." },
  { title: "PBR city renderer", from: "Zero City", body: "Buildings, roads, trees and traffic lit with image-based light and soft shadows." },
  { title: "Cinematic cameras", from: "All three", body: "Smooth orbits, fly-tos and tilts down to street level." },
  { title: "Filmic grading", from: "Both", body: "ACES tone mapping, bloom and ambient occlusion where the device can take it." },
  { title: "Adaptive quality", from: "Both", body: "High detail on desktops, a lighter path on phones, chosen for you." },
  { title: "Phone-first layout", from: "All three", body: "Dock, sheets and tab bars that fit a thumb, upright or sideways." },
  { title: "Open-world streaming", from: "Heatwave", body: "A whole island city streamed in round you as you drive: traffic, people, police and the sea, with a skyline to the horizon." },
  { title: "Logistics simulation", from: "WareForge", body: "Forklifts that find their own way round your racks, trucks that back onto the doors, machines that wear and break." },
];
