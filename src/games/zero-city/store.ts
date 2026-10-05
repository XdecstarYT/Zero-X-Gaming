import { createStore } from "zustand/vanilla";
import type { Lang, StringKey } from "./i18n";
import type { Player, SaveSummary } from "./platform/zeroxAdapter";
import type { Settings } from "./settings";
import type { Notice, Stats } from "./sim/sim";
import type { BillResult, DilemmaId, ElectionResult, Faction, Ledger, PolicyId, PromiseId, Taxes } from "./politics/politics";
import type { Zone, ServiceKind } from "./world/lots";
import type { Landmark } from "./world/milestones";
import type { RoadTypeId } from "./world/roads";

export type Screen = "loading" | "menu" | "maps" | "game";
export type Overlay = null | "settings" | "load" | "log" | "credits" | "pause";
export type Tab = "roads" | "zoning" | "transit" | "terrain" | "build" | "move" | "land" | "bulldoze";
export const TABS: Tab[] = ["roads", "zoning", "transit", "terrain", "build", "move", "land", "bulldoze"];
export type DrawMode = "straight" | "curve" | "scurve" | "freeform" | "roundabout" | "lanes" | "oneway" | "upgrade";
export type ZoneMode = "line" | "area" | "single";
export type TransitMode = "stop" | "line" | "rail";
export type TerrainMode = "raise" | "lower" | "smooth" | "water" | "trees" | "clear";
export type MoveMode = "select" | "move" | "rotate" | "copy" | "delete";
export type BulldozeMode = "all" | "roads" | "buildings" | "zones";
/** What the Land tab colours lots by. */
export type LandView = "value" | "services" | "pollution" | "fire";

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
export type HallTab = "overview" | "budget" | "policies" | "council";

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
  landmarks: Record<Landmark, "locked" | "built" | "ready">;
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
  bill: BillResult | null;
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
    landmarks: { hospital: "locked", museum: "locked", university: "locked", stadium: "locked", tower: "locked" },
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
    bill: null,
    election: null,
  }));
}
