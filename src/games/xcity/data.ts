/**
 * XCity's rules as data: road kinds, district uses and height bands, building styles, roofs and
 * colours, milestones, and the names the city's developers, streets and buildings are drawn from.
 */

export const GAME_SLUG = "xcity";
export const SAVE_KEY = "zx-xcity-save";
export const PREFS_KEY = "zx-xcity-prefs";

/** The map runs from -MAP_HALF to +MAP_HALF metres on x (east) and z (south). */
export const MAP_HALF = 1600;
/** A standard lot: frontage and depth, in metres. */
export const LOT_W = 15;
export const LOT_D = 32;

/* ------------------------------------------------------------------ roads */

export type RoadKind = "lane" | "street" | "avenue";

export interface RoadInfo {
  name: string;
  /** Half the right of way (kerb to kerb plus footpaths), in metres. */
  half: number;
  /** Half the carriageway. */
  carriage: number;
  /** Traffic lanes each way. */
  lanes: number;
  /** Cost per metre to build. */
  cost: number;
  /** Upkeep per metre per month. */
  upkeep: number;
  speed: number;
  /** The population at which it unlocks. */
  unlock: number;
  blurb: string;
}

export const ROADS: Record<RoadKind, RoadInfo> = {
  lane: { name: "Country lane", half: 4.6, carriage: 3.3, lanes: 1, cost: 260, upkeep: 0.2, speed: 16, unlock: 0, blurb: "Gravel-edged and cheap. For farms and the edge of town." },
  street: { name: "Street", half: 8.5, carriage: 5.4, lanes: 1, cost: 1200, upkeep: 0.6, speed: 12, unlock: 0, blurb: "Two lanes with parking, kerbs and footpaths." },
  avenue: { name: "Avenue", half: 15, carriage: 11.4, lanes: 2, cost: 3600, upkeep: 1.6, speed: 15, unlock: 1500, blurb: "Four lanes and a median. Room for a tram." },
};

export const BIKE_COST = 160;
export const TRAM_COST = 5200;
export const TRAM_UPKEEP = 2.4;
export const BRIDGE_MULT = 5;
/** The turning circle at the end of a cul-de-sac. */
export const BULB_R = 15;

/* ------------------------------------------------------------------ districts */

export type Use = "homes" | "mixed" | "shops" | "jobs" | "industry" | "farms" | "parks";

export interface UseInfo {
  name: string;
  icon: string;
  color: string;
  blurb: string;
  /** Height bands this use may be zoned for. */
  bands: number[];
}

export const USES: Record<Use, UseInfo> = {
  homes: { name: "Homes", icon: "🏠", color: "#5fbf6a", blurb: "Houses, townhouses and apartments.", bands: [1, 2, 3, 4, 5] },
  mixed: { name: "Main street", icon: "🏘️", color: "#e0b040", blurb: "Homes over shops. Lively, walkable streets.", bands: [1, 2, 3, 4, 5] },
  shops: { name: "Shops", icon: "🛍️", color: "#4fa3e0", blurb: "Stores, cafés and markets.", bands: [1, 2, 3] },
  jobs: { name: "Offices", icon: "🏢", color: "#8a7ae6", blurb: "Workplaces, from small offices to towers.", bands: [2, 3, 4, 5] },
  industry: { name: "Workshops", icon: "🏭", color: "#c98a52", blurb: "Workshops, depots and light industry. Noisy.", bands: [1, 2] },
  farms: { name: "Farmland", icon: "🌾", color: "#c8b65a", blurb: "Fields and orchards, and the odd farmhouse.", bands: [0] },
  parks: { name: "Parkland", icon: "🌳", color: "#2e9c58", blurb: "Lawns and trees. Nothing gets built.", bands: [0] },
};

export const USE_ORDER: Use[] = ["homes", "mixed", "shops", "jobs", "industry", "farms", "parks"];

export interface Band {
  id: number;
  min: number;
  max: number;
  label: string;
  form: string;
  /** The population at which it unlocks. */
  unlock: number;
}

export const BANDS: Band[] = [
  { id: 0, min: 1, max: 2, label: "Rural", form: "Farmsteads", unlock: 0 },
  { id: 1, min: 1, max: 2, label: "1–2 storeys", form: "Houses", unlock: 0 },
  { id: 2, min: 2, max: 4, label: "2–4 storeys", form: "Townhouses", unlock: 0 },
  { id: 3, min: 4, max: 7, label: "4–7 storeys", form: "Mid-rise", unlock: 800 },
  { id: 4, min: 8, max: 20, label: "8–20 storeys", form: "High-rise", unlock: 6000 },
  { id: 5, min: 20, max: 40, label: "20–40 storeys", form: "Towers", unlock: 25000 },
];

export type Parking = 0 | 1 | 2;
export const PARKING_NAMES = ["None", "Some", "Full"] as const;

export interface Rules {
  /** Minimum parking: none, one space for every two homes, or one for every home. */
  parking: Parking;
  /** Corner shops allowed in a homes district. */
  corner: boolean;
  /** Share of new homes that must be affordable (%). */
  affordable: number;
  /** May developers buy neighbouring lots and build across them? */
  merge: boolean;
}

export const DEFAULT_RULES: Rules = { parking: 1, corner: true, affordable: 0, merge: true };

export type Pattern = "grid" | "curvy" | "culdesac" | "superblock";

export const PATTERNS: Record<Pattern, { name: string; blurb: string }> = {
  grid: { name: "Grid", blurb: "Straight streets and long blocks. Efficient." },
  curvy: { name: "Curvy", blurb: "Gentle bends that follow the land." },
  culdesac: { name: "Cul-de-sac", blurb: "Quiet dead ends off a winding spine." },
  superblock: { name: "Superblock", blurb: "Avenues round big blocks with a park inside." },
};

export type Crop = "wheat" | "corn" | "orchard" | "pasture";

/* ------------------------------------------------------------------ buildings */

export type Style = "brick" | "painted" | "stone" | "timber" | "concrete" | "glass";

export interface StyleInfo {
  name: string;
  blurb: string;
  /** The facade shader's wall type. */
  wall: number;
  colors: string[];
  /** Build cost multiplier. */
  cost: number;
  quality: number;
  /** Tallest it can go. */
  max: number;
}

export const STYLES: Record<Style, StyleInfo> = {
  brick: { name: "Traditional brick", blurb: "Red and brown brick with deep windows.", wall: 3, colors: ["#9a4a36", "#7d3b2c", "#a8653f", "#6e4a3a", "#b5763f", "#8f5a48"], cost: 1.04, quality: 1, max: 20 },
  painted: { name: "Painted render", blurb: "Smooth render in soft colours.", wall: 4, colors: ["#e9dcc0", "#d9c9a5", "#f0e8da", "#c8d4d8", "#d8b8a0", "#29374f"], cost: 0.98, quality: 0.5, max: 12 },
  stone: { name: "Sandstone", blurb: "Carved stone, arched windows and cornices.", wall: 2, colors: ["#d4bf94", "#c9b48a", "#bfa77b", "#e0cfa8"], cost: 1.12, quality: 1.5, max: 30 },
  timber: { name: "Timber", blurb: "Weatherboards and porches.", wall: 5, colors: ["#f2efe6", "#c9d8e0", "#e8d9a8", "#9fb59a", "#d9a59a", "#5d6f80"], cost: 0.9, quality: 0.5, max: 4 },
  concrete: { name: "Modern", blurb: "Clean concrete grids and big windows.", wall: 1, colors: ["#cfcac0", "#b8b4ac", "#e6e2da", "#a9a59c"], cost: 1, quality: 0.5, max: 40 },
  glass: { name: "Glass", blurb: "Curtain walls that mirror the sky.", wall: 0, colors: ["#5f7f96", "#4d6a6f", "#7a8f9f", "#3e5468"], cost: 1.22, quality: 1, max: 40 },
};

export const STYLE_ORDER: Style[] = ["brick", "painted", "stone", "timber", "concrete", "glass"];

export type Roof = "plain" | "green" | "terrace" | "solar";

export const ROOFS: Record<Roof, { name: string; blurb: string; cost: number; quality: number; rent: number }> = {
  plain: { name: "Plain", blurb: "Gravel and a water tank.", cost: 0, quality: 0, rent: 0 },
  green: { name: "Green roof", blurb: "Planted, cooler, soaks up the rain.", cost: 0.025, quality: 0.6, rent: 0.01 },
  terrace: { name: "Roof terrace", blurb: "A garden for the residents up top.", cost: 0.02, quality: 0.8, rent: 0.025 },
  solar: { name: "Solar panels", blurb: "Lower power bills.", cost: 0.03, quality: 0.5, rent: 0.015 },
};

export const ROOF_ORDER: Roof[] = ["plain", "green", "terrace", "solar"];

/** Civic places the city can build on a lot. */
export type CivicKind = "park" | "school" | "clinic" | "library" | "plaza";

export const CIVICS: Record<CivicKind, { name: string; icon: string; cost: number; upkeep: number; radius: number; jobs: number; blurb: string; lots: number }> = {
  park: { name: "Pocket park", icon: "🌳", cost: 180_000, upkeep: 2_000, radius: 450, jobs: 1, blurb: "Lawn, trees and a playground.", lots: 2 },
  plaza: { name: "Plaza", icon: "⛲", cost: 420_000, upkeep: 3_500, radius: 400, jobs: 2, blurb: "Paving, a fountain and room for a market.", lots: 2 },
  school: { name: "School", icon: "🏫", cost: 3_800_000, upkeep: 32_000, radius: 900, jobs: 40, blurb: "Families want one close by.", lots: 4 },
  clinic: { name: "Clinic", icon: "🏥", cost: 2_600_000, upkeep: 26_000, radius: 1100, jobs: 30, blurb: "Doctors and nurses for the neighbourhood.", lots: 2 },
  library: { name: "Library", icon: "📚", cost: 1_900_000, upkeep: 14_000, radius: 900, jobs: 12, blurb: "Books, Wi-Fi and a quiet place to work.", lots: 2 },
};

export const CIVIC_ORDER: CivicKind[] = ["park", "plaza", "school", "clinic", "library"];

/* ------------------------------------------------------------------ economy */

/** Rent for an 80 m² home in a balanced market, per month. */
export const BASE_RENT = 1350;
/** Build cost per m² of floor, low-rise. */
export const BUILD_COST = 2400;
/** Years of rent a buyer pays for a home. */
export const VALUE_YEARS = 17;
export const HOME_AREA = 82;
export const START_MONEY = 30_000_000;
export const START_CLOUT = 10;
/** Real seconds per game month at 1×. */
export const MONTH_SECONDS = 14;

export const MILESTONES: { pop: number; name: string; blurb: string }[] = [
  { pop: 0, name: "Farming village", blurb: "A crossroads, a grain store and a lot of wheat." },
  { pop: 800, name: "Village", blurb: "Mid-rise zoning unlocked." },
  { pop: 1500, name: "Town", blurb: "Avenues and trams unlocked." },
  { pop: 6000, name: "City", blurb: "High-rise zoning unlocked." },
  { pop: 25000, name: "Big city", blurb: "Towers unlocked." },
  { pop: 80000, name: "Metropolis", blurb: "The skyline is yours." },
];

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ------------------------------------------------------------------ names */

export const STREET_NAMES = [
  "Elm", "Oak", "Maple", "Cedar", "Willow", "Birch", "Ash", "Poplar", "Walnut", "Chestnut", "Linden", "Alder", "Hazel", "Juniper", "Laurel", "Magnolia",
  "Harbour", "Mill", "Church", "Station", "Market", "Bridge", "Union", "Grove", "Orchard", "Meadow", "River", "Garden", "Park", "Spring", "Summit", "Valley",
  "Franklin", "Lincoln", "Hamilton", "Jackson", "Madison", "Carter", "Morgan", "Porter", "Fletcher", "Barton", "Holloway", "Ashford", "Wexley", "Thornton", "Kendall", "Lockwood",
  "Clifton", "Dalton", "Everett", "Foster", "Gibson", "Harper", "Irving", "Keller", "Lawson", "Mercer", "Norton", "Palmer", "Quincy", "Russell", "Sutton", "Tilden",
];
export const STREET_SUFFIX: Record<RoadKind, string[]> = {
  lane: ["Lane", "Road", "Track", "Way"],
  street: ["Street", "Street", "Street", "Place", "Court", "Drive", "Close", "Terrace"],
  avenue: ["Avenue", "Boulevard", "Parade", "Avenue"],
};

export const BUILDING_FIRST = [
  "Summit", "Hazel", "Juniper", "Bayview", "Linden", "Ashford", "Wren", "Marlow", "Cedar", "Harbour", "Kestrel", "Fairview", "Rowan", "Sterling", "Aldgate", "Briar",
  "Clement", "Dover", "Ember", "Foxglove", "Garnet", "Holloway", "Ivy", "Larkspur", "Meridian", "Northgate", "Oakley", "Primrose", "Quarry", "Riverside", "Saffron", "Tamarind",
];
export const BUILDING_LAST: Record<string, string[]> = {
  house: ["Cottage", "House", "Bungalow"],
  townhouse: ["Row", "Terraces", "Mews", "Townhomes"],
  walkup: ["Court", "Flats", "Mansions", "House"],
  midrise: ["Court", "Apartments", "Lofts", "Residences"],
  highrise: ["Heights", "Apartments", "Tower", "Place"],
  tower: ["Tower", "One", "Point", "Heights"],
  shop: ["Market", "Store", "Emporium", "Arcade"],
  office: ["House", "Exchange", "Centre", "Plaza"],
  workshop: ["Works", "Yard", "Depot", "Mill"],
};

export const DEVELOPERS = [
  "Thornbury & Sons Construction", "Kestrel Living", "Brightwater Homes", "Halvorsen Partners", "Mapleleaf Developments", "Northgate Capital",
  "Carraway Property", "Bluestone Builders", "Ridgeway & Co.", "Sundial Housing Trust", "Fennimore Group", "Holloway Brothers",
];

export const FIRST_NAMES = ["Ana", "Ben", "Chloe", "Dev", "Eli", "Farah", "Gus", "Hana", "Ivan", "Jo", "Kai", "Lena", "Mo", "Nia", "Omar", "Pia", "Raj", "Sol", "Tess", "Uma", "Vic", "Wes", "Yara", "Zed"];

/** What's changed, newest first (the title screen's change log). */
export const CHANGELOG: { version: string; date: string; title: string; items: string[] }[] = [
  {
    version: "1.4",
    date: "October 2026",
    title: "A more real-looking city",
    items: [
      "The river is real water now: deep, reflective and rippling, with reedy, muddy banks.",
      "Roofs have their coverings: tiles and shingles on pitched roofs; membrane, gravel, air-conditioning units, vents and lift housings on flat ones.",
      "Fuller trees, shaded by the light and broken into clumps of leaves, and more of them on the green between blocks.",
      "Grass and fields that vary across the map, and a haze that softens the far side of town and the farms beyond.",
    ],
  },
  {
    version: "1.3",
    date: "October 2026",
    title: "Climb the party",
    items: [
      "Start as a candidate in a party with its own leader (or as the leader yourself).",
      "Build a reputation: win your seat and the city, keep your promises, shine at Question Time and pass bills. Lose, break your word or cross the floor and it falls.",
      "Ask the leader for a ministry (Housing, Transport, Treasury or the Environment), or its shadow in opposition. Your portfolio's bills carry the whole party.",
      "Sound out your colleagues, then challenge the leader: the party's MPs vote, and the loser goes to the back bench. When a beaten leader quits, stand in the ballot.",
      "Lead the party and it votes as you say, and your reputation moves its national vote. Win the most federal seats and you're Prime Minister, setting parliament's agenda.",
    ],
  },
  {
    version: "1.2",
    date: "October 2026",
    title: "Electorates that grow with the city",
    items: [
      "The Electoral Commission draws the electorates round where people live, so every seat has about as many voters: small seats in town, big ones out on the farms.",
      "As the city grows it gets more seats (a village has about 4, a big city up to 16), and the map is redrawn before an election.",
      "Redrawn seats are held notionally by the party that held most of their voters; names and members carry on, new seats get new names.",
      "Choose fewer, bigger seats or more, smaller ones, and whether you stand in the town centre, the suburbs or the country.",
      "Rival parties fit the place: a farm town gets its country party.",
    ],
  },
  {
    version: "1.1",
    date: "October 2026",
    title: "Politics",
    items: [
      "Elections: the city is split into electorates, and parties stand candidates in every one.",
      "Make your own party: name, colour, symbol, leader and where it stands on housing, transport, tax and the environment.",
      "Ten-week campaigns: door-knock, rally, run ads, fundraise, make promises and win endorsements.",
      "A televised debate, polls week by week, and election night, seat by seat.",
      "Lose, and another party runs the city its own way: protest, lobby City Hall and make your case for next time.",
      "Win your seat and you sit in the federal parliament: vote on bills, ask questions and bring in laws that change your city.",
      "New world settings: start as a village or a small town, how fast the region grows, and how much money there is.",
    ],
  },
  {
    version: "1.0",
    date: "October 2026",
    title: "XCity opens",
    items: [
      "Zone by use and height, with rules for parking, affordable homes and corner shops.",
      "Lay out streets as a grid, curves, cul-de-sacs or superblocks.",
      "Developers pitch projects; approve, deny or change the terms.",
      "Design your own buildings, and cater to cars, bikes or trams.",
    ],
  },
];
