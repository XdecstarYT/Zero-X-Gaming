/**
 * YourGov's fixed data: the parties, the laws (each with options and where they sit on the
 * political compass), the events you can hold, and the name pools. Everything is original.
 */

export const GAME_SLUG = "yourgov";
export const SAVE_KEY = "zx-yourgov-save";
export const START_YEAR = 2046;
export const WEEKS = 52;

/** Political compass: e = economy (-1 left, +1 right), s = society (-1 liberal, +1 conservative). */
export interface Pos {
  e: number;
  s: number;
}

export type PartyId = "lab" | "com" | "ctr" | "lib" | "her" | "grn";
export interface PartyDef {
  id: PartyId;
  name: string;
  short: string;
  color: string;
  pos: Pos;
  ideology: string;
}

export const PARTIES: PartyDef[] = [
  { id: "lab", name: "People's Labour", short: "PL", color: "#e0453a", pos: { e: -0.65, s: -0.1 }, ideology: "Socialism" },
  { id: "com", name: "Commonwealth Party", short: "CP", color: "#3d6fd8", pos: { e: -0.25, s: -0.35 }, ideology: "Social democracy" },
  { id: "ctr", name: "Centre Forward", short: "CF", color: "#f2f2f2", pos: { e: 0.05, s: 0 }, ideology: "Centrism" },
  { id: "lib", name: "Liberty Alliance", short: "LA", color: "#f0b429", pos: { e: 0.6, s: -0.45 }, ideology: "Libertarianism" },
  { id: "her", name: "Heritage Union", short: "HU", color: "#9b4fd6", pos: { e: 0.45, s: 0.6 }, ideology: "Conservatism" },
  { id: "grn", name: "Green Front", short: "GF", color: "#34b25a", pos: { e: -0.4, s: -0.65 }, ideology: "Environmentalism" },
];
export const PARTY: Record<PartyId, PartyDef> = Object.fromEntries(PARTIES.map((p) => [p.id, p])) as Record<PartyId, PartyDef>;

/** What a law option does to the country, per year in force. */
export interface Effects {
  happiness?: number;
  growth?: number;
  /** Budget change, $ billions a year (+ is income). */
  budget?: number;
  unemployment?: number;
}

export interface LawOption {
  label: string;
  pos: Pos;
  fx: Effects;
}

export type LawGroup = "Economy" | "Society" | "Government" | "Services" | "Security";
export interface LawDef {
  id: string;
  name: string;
  group: LawGroup;
  /** Committee that reviews it (I–VIII). */
  committee: number;
  options: LawOption[];
  /** Index of the option in force at the start. */
  start: number;
  /** Changing it needs two thirds. */
  constitutional?: boolean;
}

const rate = (id: string, name: string, committee: number, values: number[], start: number, perPoint: Effects, eFrom: number, eTo: number): LawDef => ({
  id,
  name,
  group: "Economy",
  committee,
  start,
  options: values.map((v, i) => {
    const t = values.length > 1 ? i / (values.length - 1) : 0;
    const k = v - values[start];
    return {
      label: `${v}%`,
      pos: { e: eFrom + (eTo - eFrom) * t, s: 0 },
      fx: { happiness: (perPoint.happiness ?? 0) * k, growth: (perPoint.growth ?? 0) * k, budget: (perPoint.budget ?? 0) * k, unemployment: (perPoint.unemployment ?? 0) * k },
    };
  }),
});

const opts = (...xs: [string, number, number, Effects][]): LawOption[] => xs.map(([label, e, s, fx]) => ({ label, pos: { e, s }, fx }));

export const LAWS: LawDef[] = [
  rate("incomeTax", "Income tax", 1, [10, 15, 20, 25, 30, 35, 40], 3, { happiness: -0.35, growth: -0.04, budget: 38 }, 0.8, -0.8),
  rate("corporateTax", "Corporate tax", 1, [5, 10, 15, 20, 25, 30, 35], 3, { happiness: -0.05, growth: -0.06, budget: 22, unemployment: 0.03 }, 0.8, -0.8),
  rate("salesTax", "Sales tax", 1, [0, 4, 8, 12, 16], 2, { happiness: -0.2, growth: -0.03, budget: 25 }, 0.5, -0.3),
  rate("capitalGains", "Capital gains tax", 1, [0, 10, 20, 30], 1, { happiness: 0, growth: -0.04, budget: 9 }, 0.8, -0.8),
  rate("minimumWage", "Minimum wage", 5, [0, 8, 12, 16, 20], 2, { happiness: 0.15, growth: -0.03, unemployment: 0.05 }, 0.9, -0.9),
  { id: "centralBank", name: "Central bank", group: "Economy", committee: 1, start: 1, options: opts(["Under government", -0.5, 0, { growth: -0.2 }], ["Independent", 0.3, 0, { growth: 0.1 }], ["Abolished", 0.9, -0.2, { growth: -0.3, happiness: -1 }]) },
  { id: "subsidies", name: "Industrial subsidies", group: "Economy", committee: 2, start: 1, options: opts(["None", 0.7, 0, { budget: 12, growth: -0.1 }], ["Targeted", 0, 0, {}], ["Broad", -0.6, 0.1, { budget: -18, growth: 0.25, unemployment: -0.4 }]) },
  { id: "stimulus", name: "Economic stimulus", group: "Economy", committee: 1, start: 0, options: opts(["None", 0.4, 0, {}], ["Infrastructure plan", -0.3, 0, { budget: -30, growth: 0.4, unemployment: -0.6 }], ["Cash for households", -0.6, 0, { budget: -45, happiness: 3, growth: 0.2 }]) },
  { id: "trade", name: "Trade policy", group: "Economy", committee: 7, start: 1, options: opts(["Protectionist", -0.2, 0.4, { growth: -0.2, unemployment: -0.3 }], ["Balanced", 0, 0, {}], ["Free trade", 0.6, -0.2, { growth: 0.3, unemployment: 0.2 }]) },
  { id: "healthcare", name: "Healthcare", group: "Services", committee: 3, start: 1, options: opts(["Private", 0.8, 0.1, { budget: 20, happiness: -4 }], ["Mixed", 0, 0, {}], ["Universal", -0.7, -0.2, { budget: -40, happiness: 6 }]) },
  { id: "education", name: "Education", group: "Services", committee: 3, start: 1, options: opts(["Mostly private", 0.7, 0.2, { budget: 15, happiness: -3, growth: -0.1 }], ["Public schools", 0, 0, {}], ["Free university", -0.6, -0.3, { budget: -22, happiness: 4, growth: 0.15 }]) },
  { id: "pensions", name: "Pensions", group: "Services", committee: 3, start: 1, options: opts(["Private savings", 0.7, 0, { budget: 18, happiness: -4 }], ["State pension", 0, 0, {}], ["Generous state pension", -0.5, 0.2, { budget: -25, happiness: 4 }]) },
  { id: "transport", name: "Public transport", group: "Services", committee: 4, start: 1, options: opts(["Privatised", 0.7, 0, { budget: 6, happiness: -1 }], ["Mixed", 0, 0, {}], ["Free public transport", -0.6, -0.3, { budget: -14, happiness: 3, growth: 0.05 }]) },
  { id: "housing", name: "Social housing", group: "Services", committee: 4, start: 1, options: opts(["None", 0.6, 0.1, { budget: 6, happiness: -2 }], ["Some", 0, 0, {}], ["Large programme", -0.6, -0.1, { budget: -16, happiness: 3, unemployment: -0.2 }]) },
  { id: "energy", name: "Energy policy", group: "Services", committee: 4, start: 1, options: opts(["Fossil first", 0.5, 0.5, { growth: 0.15, happiness: -1 }], ["Mixed", 0, 0, {}], ["Renewables only", -0.4, -0.6, { budget: -10, growth: -0.05, happiness: 1.5 }]) },
  { id: "carbonTax", name: "Carbon tax", group: "Economy", committee: 4, start: 0, options: opts(["None", 0.5, 0.4, {}], ["Low", -0.1, -0.3, { budget: 8, growth: -0.05 }], ["High", -0.4, -0.7, { budget: 18, growth: -0.15, happiness: -1 }]) },
  { id: "immigration", name: "Immigration", group: "Society", committee: 7, start: 1, options: opts(["Closed borders", 0.1, 0.9, { growth: -0.2, happiness: -1 }], ["Points system", 0.2, 0.2, {}], ["Open", 0.1, -0.8, { growth: 0.25, unemployment: 0.2 }]) },
  { id: "gunPolicy", name: "Gun policy", group: "Security", committee: 5, start: 1, options: opts(["Strict ban", -0.2, -0.5, { happiness: 0.5 }], ["Licensed", 0, 0, {}], ["Carry for all", 0.4, 0.7, { happiness: -1 }]) },
  { id: "drugPolicy", name: "Drug policy", group: "Society", committee: 5, start: 0, options: opts(["Prohibition", 0, 0.6, { budget: -3 }], ["Decriminalised", -0.1, -0.4, { budget: 2 }], ["Legal and taxed", 0.2, -0.8, { budget: 8, happiness: 1 }]) },
  { id: "deathPenalty", name: "Death penalty", group: "Security", committee: 5, start: 0, constitutional: true, options: opts(["Abolished", 0, -0.5, {}], ["Allowed", 0, 0.8, { happiness: -0.5 }]) },
  { id: "marriage", name: "Marriage equality", group: "Society", committee: 6, start: 1, options: opts(["Not recognised", 0, 0.9, { happiness: -1 }], ["Civil unions", 0, 0.1, {}], ["Full equality", 0, -0.8, { happiness: 1 }]) },
  { id: "church", name: "Church and state", group: "Society", committee: 6, start: 1, options: opts(["State religion", 0, 1, { happiness: -1 }], ["Secular", 0, -0.2, {}], ["Strictly secular", 0, -0.7, {}]) },
  { id: "speech", name: "Press and speech", group: "Society", committee: 8, start: 1, constitutional: true, options: opts(["State oversight", -0.1, 0.8, { happiness: -3 }], ["Free press", 0, -0.2, {}], ["Absolute free speech", 0.3, -0.4, {}]) },
  { id: "military", name: "Military budget", group: "Security", committee: 7, start: 1, options: opts(["Minimal", -0.5, -0.5, { budget: 30 }], ["Standard", 0, 0, {}], ["Superpower", 0.4, 0.7, { budget: -45, growth: 0.05, unemployment: -0.2 }]) },
  { id: "police", name: "Police funding", group: "Security", committee: 5, start: 1, options: opts(["Cut", -0.3, -0.6, { budget: 8, happiness: -0.5 }], ["Standard", 0, 0, {}], ["Expanded", 0.2, 0.6, { budget: -9, happiness: 0.5 }]) },
  { id: "votingAge", name: "Voting age", group: "Government", committee: 8, start: 1, constitutional: true, options: opts(["16", 0, -0.6, {}], ["18", 0, 0, {}], ["21", 0, 0.6, {}]) },
  { id: "electoralSystem", name: "Election system", group: "Government", committee: 8, start: 0, constitutional: true, options: opts(["Majoritarian", 0.1, 0.3, {}], ["Proportional", -0.1, -0.3, {}]) },
  { id: "termLimits", name: "Presidential term limits", group: "Government", committee: 8, start: 1, constitutional: true, options: opts(["One term", 0, -0.2, {}], ["Two terms", 0, 0, {}], ["No limit", 0, 0.5, { happiness: -1 }]) },
  { id: "campaignFinance", name: "Campaign finance", group: "Government", committee: 8, start: 1, options: opts(["Public funding only", -0.5, -0.3, { budget: -2 }], ["Capped donations", 0, 0, {}], ["Unlimited donations", 0.7, 0.2, {}]) },
  { id: "unions", name: "Trade unions", group: "Economy", committee: 5, start: 1, options: opts(["Restricted", 0.7, 0.3, { growth: 0.1, happiness: -1 }], ["Recognised", 0, 0, {}], ["Strong rights", -0.7, -0.1, { growth: -0.1, happiness: 1.5 }]) },
  { id: "welfare", name: "Unemployment benefits", group: "Services", committee: 3, start: 1, options: opts(["None", 0.8, 0.3, { budget: 12, happiness: -3 }], ["Basic", 0, 0, {}], ["Universal basic income", -0.9, -0.2, { budget: -60, happiness: 6, unemployment: 0.5 }]) },
];
export const LAW: Record<string, LawDef> = Object.fromEntries(LAWS.map((l) => [l.id, l]));

export const COMMITTEES = [
  "I · Finance, Treasury",
  "II · Agriculture, Environment",
  "III · Health, Education, Welfare",
  "IV · Infrastructure, Transport, Energy",
  "V · Work, Justice, Equality",
  "VI · Sports, Culture, Entertainment",
  "VII · Defence, Foreign relations, Trade",
  "VIII · Interior, Constitutional affairs",
];

export type EventScope = "state" | "national" | "self";
export interface EventDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  scope: EventScope;
  /** Campaign boost to your party where it's held (state) or everywhere (national). */
  boost: number;
  money?: number;
  members?: number;
  unity?: number;
  /** Hurt another party (scope applies). */
  attack?: number;
  /** Learn the polls in a state. */
  poll?: boolean;
  /** Chance it backfires (negative boost). */
  risk?: number;
  desc: string;
}

/** $ in millions. */
export const EVENTS: EventDef[] = [
  { id: "speech", name: "Public speech", icon: "💬", cost: 0.2, scope: "state", boost: 1.5, desc: "Speak in a town square. Cheap and local." },
  { id: "rally", name: "Rally", icon: "📣", cost: 1.5, scope: "state", boost: 5, risk: 0.05, desc: "A big rally in one state." },
  { id: "townHall", name: "Town hall", icon: "🏛️", cost: 0.6, scope: "state", boost: 3, desc: "Take questions from voters." },
  { id: "doorToDoor", name: "Door to door", icon: "🚪", cost: 0.4, scope: "state", boost: 2.5, members: 300, desc: "Volunteers knock on doors." },
  { id: "tvAd", name: "TV advert", icon: "📺", cost: 6, scope: "national", boost: 2.5, desc: "A national TV spot." },
  { id: "onlineAds", name: "Online ads", icon: "📱", cost: 2, scope: "national", boost: 1.2, members: 500, desc: "Targeted ads everywhere." },
  { id: "interview", name: "TV interview", icon: "🎙️", cost: 0.3, scope: "national", boost: 1.5, risk: 0.15, desc: "Prime-time interview. Could go badly." },
  { id: "pressConf", name: "Press conference", icon: "📰", cost: 0.2, scope: "national", boost: 1, risk: 0.1, desc: "Set the news agenda." },
  { id: "debate", name: "Challenge to debate", icon: "⚖️", cost: 0.5, scope: "national", boost: 2.5, risk: 0.3, desc: "High risk, high reward." },
  { id: "attackAd", name: "Attack advert", icon: "⚔️", cost: 3, scope: "national", boost: 0, attack: 3, risk: 0.15, desc: "Hit the leading rival." },
  { id: "scandal", name: "Dig up a scandal", icon: "🔎", cost: 2.5, scope: "national", boost: 0, attack: 5, risk: 0.3, desc: "Investigate a rival. May backfire." },
  { id: "fundraiser", name: "Fundraising dinner", icon: "🍽️", cost: 0.3, scope: "self", boost: 0, money: 4, desc: "Raise money from donors." },
  { id: "crowdfund", name: "Crowdfunding", icon: "💰", cost: 0, scope: "self", boost: 0, money: 1.5, members: 200, desc: "Small donations from members." },
  { id: "recruit", name: "Membership drive", icon: "🤝", cost: 0.8, scope: "self", boost: 0, members: 4000, desc: "Grow the party." },
  { id: "congress", name: "Party congress", icon: "🎪", cost: 3, scope: "self", boost: 1, unity: 15, desc: "Rally the party behind you." },
  { id: "poll", name: "Commission a poll", icon: "📊", cost: 0.4, scope: "state", boost: 0, poll: true, desc: "Find out where you stand in a state." },
  { id: "charity", name: "Charity event", icon: "🎗️", cost: 1, scope: "state", boost: 2, desc: "Good works, good press." },
  { id: "factory", name: "Factory visit", icon: "🏭", cost: 0.5, scope: "state", boost: 2.5, desc: "Meet workers on the shop floor." },
  { id: "farm", name: "Farm tour", icon: "🚜", cost: 0.5, scope: "state", boost: 2.5, desc: "Win over the countryside." },
  { id: "concert", name: "Campaign concert", icon: "🎸", cost: 2.5, scope: "state", boost: 5.5, members: 800, desc: "A star-studded night." },
  { id: "endorse", name: "Celebrity endorsement", icon: "⭐", cost: 4, scope: "national", boost: 3, desc: "A famous face backs you." },
  { id: "protest", name: "Lead a protest", icon: "✊", cost: 0.5, scope: "state", boost: 3, risk: 0.2, desc: "Take to the streets." },
  { id: "manifesto", name: "Publish manifesto", icon: "📜", cost: 1, scope: "national", boost: 2, unity: 5, desc: "Set out your programme." },
  { id: "flight", name: "Campaign tour", icon: "✈️", cost: 5, scope: "national", boost: 3.5, desc: "Fly across the country." },
];
export const EVENT: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export const FIRST = ["Adam", "Alexis", "Amber", "Andrew", "Angela", "Ashley", "Barbara", "Ben", "Carla", "Chris", "Daniel", "Dana", "Elena", "Ethan", "Fiona", "Frank", "Grace", "Hector", "Iris", "Jamal", "Jane", "Jonah", "Karen", "Kofi", "Laura", "Leo", "Maya", "Marcus", "Nadia", "Noah", "Olivia", "Omar", "Priya", "Quinn", "Rosa", "Ryan", "Sofia", "Susanne", "Tom", "Uma", "Victor", "Wendy", "Xavier", "Yara", "Zane", "Gloria", "Martin", "Helen", "Ivan", "June"];
export const LAST = ["Anderson", "Bailey", "Brooks", "Campbell", "Carter", "Chen", "Clark", "Diaz", "Edwards", "Evans", "Fisher", "Foster", "Garcia", "Gray", "Green", "Hughes", "Hunt", "Ito", "Jensen", "Kim", "Lane", "Lopez", "Martin", "Morgan", "Nakamura", "Nash", "Novak", "Okafor", "Owens", "Patel", "Price", "Reed", "Rivera", "Rossi", "Santos", "Scott", "Shaw", "Singh", "Smith", "Spencer", "Stone", "Sullivan", "Turner", "Vance", "Walsh", "Ward", "Webb", "Young", "Zimmer", "Brennan"];

/** Syllables for state and city names. */
export const SYL_A = ["Ash", "Bel", "Cor", "Dun", "El", "Fair", "Glen", "Har", "Kel", "Lor", "Mar", "Nor", "Or", "Pen", "Red", "Sal", "Tal", "Ver", "West", "Wil", "Ald", "Brack", "Cal", "Dal", "Ever", "Rook", "Stan", "Mid"];
export const SYL_B = ["mont", "ford", "ton", "wick", "dale", "field", "haven", "more", "ridge", "brook", "vale", "port", "land", "bury", "shire", "mere", "gate", "holm", "stead", "crest"];
