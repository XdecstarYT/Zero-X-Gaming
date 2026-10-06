import { createStore } from "zustand/vanilla";
import type { Lang, StringKey } from "./i18n";
import type { Player, SaveSummary } from "./platform/zeroxAdapter";
import type { Settings } from "./settings";
import type { Notice, Stats } from "./sim/sim";
import type { DilemmaId, ElectionResult, Faction, Ledger, Minister, Ministry, PartyId, PolicyId, PromiseId, Taxes } from "./politics/politics";
import type { ParlVote } from "./politics/parliament";
import type { District, DistrictResult, Hq, Mp, News, Politician, Position } from "./politics/mandate";
import type { ActiveCrisis } from "./politics/crises";
import type { DecreeId } from "./politics/decrees";
import type { FactionId } from "./politics/factions";
import type { Ask, LobbyId } from "./politics/lobbies";
import type { DebateState, OutletId, QuestionId } from "./politics/media";
import type { Leader, Opp, OppBill } from "./politics/opposition";
import type { RecordKey } from "./politics/legacy";
import type { Zone, ServiceKind } from "./world/lots";
import type { Landmark } from "./world/milestones";
import type { RoadTypeId } from "./world/roads";

export type Screen = "loading" | "menu" | "maps" | "game";
export type Overlay = null | "settings" | "load" | "log" | "credits" | "pause" | "dlc";
export type Tab = "roads" | "zoning" | "transit" | "terrain" | "build" | "move" | "land" | "bulldoze";
export const TABS: Tab[] = ["roads", "zoning", "transit", "terrain", "build", "move", "land", "bulldoze"];
export type DrawMode = "straight" | "curve" | "scurve" | "freeform" | "roundabout" | "lanes" | "oneway" | "upgrade" | "repair" | "junction";
export type ZoneMode = "line" | "area" | "single";
export type TransitMode = "stop" | "line" | "rail";
export type TerrainMode = "raise" | "lower" | "smooth" | "water" | "trees" | "clear";
export type MoveMode = "select" | "move" | "rotate" | "copy" | "delete";
export type BulldozeMode = "all" | "roads" | "buildings" | "zones";
/** What the Land tab colours lots by. */
export type LandView = "value" | "services" | "pollution" | "fire" | "roads";

export interface Toast {
  id: number;
  title: string;
  body?: string;
  kind?: "info" | "achievement";
}

export interface Inspect {
  kind: "lot" | "service";
  id: number;
  zone?: Zone;
  tier?: number;
  residents?: number;
  jobs?: number;
  lv?: number;
  service?: ServiceKind;
  x: number;
  y: number;
}

export interface VehicleInfo {
  id: number;
  type: number;
  kind: string;
  road: string;
}

export type GameMode = "sandbox" | "mayor";
export type HallTab = "overview" | "budget" | "policies" | "council" | "cabinet";
/** The Mandate app's pages. */
export type AppPage = "home" | "map" | "party" | "caucus" | "chamber" | "opposition" | "laws" | "decrees" | "budget" | "cabinet" | "lobbies" | "media" | "polls" | "campaign" | "news" | "legacy";
export const APP_PAGES: AppPage[] = ["home", "map", "party", "caucus", "chamber", "opposition", "laws", "decrees", "budget", "cabinet", "lobbies", "media", "polls", "campaign", "news", "legacy"];

type Votes = { votes: { party: PartyId; seats: number; yes: number }[]; yes: number; no: number; passed: boolean };
/** Statecraft, as the app shows it. */
export interface StatecraftView {
  budget: {
    levels: Record<Ministry, number>;
    draft: Record<Ministry, number> | null;
    due: boolean;
    dueAt: number;
    nextDay: number;
    /** Extra daily spending of the budget in force and of the draft. */
    cost: number;
    draftCost: number;
    forecast: Votes | null;
    last: { m: number; passed: boolean; yes: number; no: number } | null;
    passed: number;
  };
  decrees: { id: DecreeId; active: number | null; readyAt: number; can: boolean }[];
  lobbies: { id: LobbyId; relation: number; power: number; target: number; ask: Ask | null; canMeet: boolean }[];
  exposure: number;
  media: {
    rel: Record<OutletId, number>;
    press: { q: QuestionId; i: number; n: number } | null;
    pressReady: boolean;
    interviewReady: boolean;
    debate: DebateState | null;
    debateReady: boolean;
    pressHeld: number;
    debatesWon: number;
  };
  opp: {
    leaders: Record<Opp, Leader>;
    bills: (OppBill & { forecast: Votes })[];
    /** Each party's ground game: its strongest district effort. */
    effort: Record<Opp, number>;
    defeated: number;
    lost: number;
  };
  factions: {
    sat: Record<FactionId, number>;
    strength: Record<FactionId, number>;
    of: Record<number, FactionId>;
    wish: Record<FactionId, PolicyId | null>;
    challenge: { faction: FactionId; name: string; ballot: number; at: number } | null;
    deputy: string | null;
  };
  crisis: (ActiveCrisis & { can: boolean[] }) | null;
  crisesResolved: number;
  legacy: { rec: Record<RecordKey, number>; unlocked: string[]; points: number; title: string; next: { id: string; at: number } | null; peak: number };
}

/** A district as the app shows it: its make-up, how it would vote today, and your work there. */
export interface DistrictView extends District {
  pop: number;
  lots: number;
  mix: Record<Faction, number>;
  share: Record<PartyId, number>;
  projected: Record<PartyId, number>;
  winner: PartyId;
  effort: number;
  office: boolean;
  ads: number;
  workers: number[];
}

/** The Mandate app's snapshot. */
export interface MandateView {
  platform: Position;
  /** Where your government really stands (platform pulled by the laws in force). */
  position: Position;
  funds: number;
  /** Party funds per day. */
  fundsNet: number;
  members: number;
  hq: Record<Hq, number>;
  roster: (Politician & { minister: Ministry | null })[];
  mps: Mp[];
  districts: DistrictView[];
  /** Seats the chamber would return today. */
  projected: Record<PartyId, number>;
  poll: Record<PartyId, number>;
  polls: { m: number; v: Record<PartyId, number> }[];
  news: News[];
  whip: boolean;
  /** Your members who'd rebel on the bill on the floor. */
  rebels: number[];
  /** How each member would vote on the bill on the floor. */
  votes: Record<number, boolean> | null;
  confidence: { m: number; against: number; passed: boolean } | null;
  lastResults: DistrictResult[] | null;
  conferenceReady: boolean;
  galaReady: boolean;
}

/** A vote's result: in the chamber (by party) or a referendum (by the public). */
export type BillView = ParlVote & { referendum?: boolean; support?: number };

/** What the HUD shows of Mayor mode (a snapshot, refreshed a few times a second). */
export interface PoliticsView {
  cash: number;
  net: number;
  ledger: Ledger;
  taxes: Taxes;
  policies: PolicyId[];
  approval: Record<Faction, number>;
  shares: Record<Faction, number>;
  overall: number;
  term: number;
  /** Game minutes until the election. */
  termLeft: number;
  council: Faction[];
  polls: { m: number; a: number }[];
  dilemma: DilemmaId | null;
  promise: PromiseId | null;
  promiseKept: boolean | null;
  challenger: string;
  status: "office" | "ousted";
  townHallReady: boolean;
  parl: {
    seats: Record<PartyId, number>;
    coalition: PartyId[];
    relations: Record<PartyId, number>;
    capital: number;
    gov: number;
    ministers: Record<Ministry, Minister | null>;
    pool: Minister[];
    /** The bill on the floor with the chamber's forecast. */
    draft: { law: PolicyId; enable: boolean; lobbied: PartyId[]; forecast: ParlVote } | null;
    failed: { law: PolicyId; enable: boolean } | null;
    canReferendum: boolean;
    demands: Partial<Record<PartyId, PolicyId>>;
    campaign: { rallies: Faction[]; ads: number; debated: boolean; open: boolean };
    scandal: Ministry | null;
  };
  m: MandateView;
  x: StatecraftView;
}

export interface UIState {
  screen: Screen;
  overlay: Overlay;
  /** Where Settings/Load were opened from (to go back). */
  overlayFrom: Overlay;
  loading: { label: string; progress: number; tip: number };
  lang: Lang;
  settings: Settings;
  draft: Settings;
  player: Player | null;
  saves: SaveSummary[];
  achievements: string[];
  bests: Record<string, number>;
  // In game
  cityName: string;
  mapId: string;
  minutes: number;
  speed: number;
  stats: Stats | null;
  notices: Notice[];
  playSeconds: number;
  tab: Tab | null;
  roadType: RoadTypeId;
  drawMode: DrawMode;
  zoneMode: ZoneMode;
  zone: Zone;
  depth: number;
  width: number;
  mixed: boolean;
  mirror: boolean;
  erase: boolean;
  transitMode: TransitMode;
  lineDraft: number[];
  lines: { id: number; stops: number; color: number }[];
  terrainMode: TerrainMode;
  brush: number;
  service: ServiceKind;
  moveMode: MoveMode;
  bulldozeMode: BulldozeMode;
  landView: LandView;
  /** City milestone reached (index), progress to the next, and each landmark's state. */
  milestone: { i: number; progress: number };
  landmarks: Record<Landmark, "locked" | "built" | "ready" | "dlc">;
  /** The Riviera DLC: owned, a purchase in flight, the last error. */
  dlc: { owned: boolean; busy: boolean; error: string | null };
  canUndo: boolean;
  canRedo: boolean;
  statsOpen: boolean;
  noticesOpen: boolean;
  inspect: Inspect | null;
  vehicle: VehicleInfo | null;
  /** A label that follows the cursor (road length, etc.). */
  cursorLabel: { x: number; y: number; text: string; bad?: boolean } | null;
  toasts: Toast[];
  saving: "idle" | "saving" | "saved";
  posted: "idle" | "posted" | "signed-out" | "failed";
  hint: StringKey | null;
  mode: GameMode;
  /** The mode picked on the map screen for a new city. */
  newMode: GameMode;
  politics: PoliticsView | null;
  hall: HallTab | null;
  /** The Mandate app, open on a page (Mayor mode). */
  app: AppPage | null;
  /** The last TV debate's result (shown until dismissed). */
  debateResult: { won: boolean; you: number; them: number; rival: PartyId } | null;
  bill: BillView | null;
  election: ElectionResult | null;
}

export type Store = ReturnType<typeof makeStore>;

export function makeStore(settings: Settings) {
  return createStore<UIState>(() => ({
    screen: "loading",
    overlay: null,
    overlayFrom: null,
    loading: { label: "", progress: 0, tip: 1 },
    lang: settings.language,
    settings,
    draft: settings,
    player: null,
    saves: [],
    achievements: [],
    bests: {},
    cityName: "",
    mapId: "broad-plains",
    minutes: 9 * 60,
    speed: 1,
    stats: null,
    notices: [],
    playSeconds: 0,
    tab: null,
    roadType: "street",
    drawMode: "straight",
    zoneMode: "line",
    zone: "R",
    depth: 3,
    width: 2,
    mixed: true,
    mirror: true,
    erase: false,
    transitMode: "stop",
    lineDraft: [],
    lines: [],
    terrainMode: "raise",
    brush: 30,
    service: "power",
    moveMode: "select",
    bulldozeMode: "all",
    landView: "value",
    milestone: { i: 0, progress: 0 },
    landmarks: { hospital: "locked", museum: "locked", university: "locked", stadium: "locked", tower: "locked", marina: "dlc", lighthouse: "dlc", casino: "dlc", resort: "dlc" },
    dlc: { owned: false, busy: false, error: null },
    canUndo: false,
    canRedo: false,
    statsOpen: false,
    noticesOpen: false,
    inspect: null,
    vehicle: null,
    cursorLabel: null,
    toasts: [],
    saving: "idle",
    posted: "idle",
    hint: null,
    mode: "sandbox",
    newMode: "sandbox",
    politics: null,
    hall: null,
    app: null,
    debateResult: null,
    bill: null,
    election: null,
  }));
}
