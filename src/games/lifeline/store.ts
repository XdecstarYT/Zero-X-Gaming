import { createStore } from "zustand/vanilla";
import type { EmergencyKind, FloorId, GrantId, ObjectId, ResearchId, Role, RoomId, ScenarioId } from "./data";
import type { QuickId } from "./quick";
import type { GrantState, Notice, Stats } from "./sim";

export type Tool =
  | { kind: "foundation"; floor: FloorId }
  | { kind: "wall" }
  | { kind: "door" }
  | { kind: "floor"; floor: FloorId }
  | { kind: "room"; room: RoomId | null }
  | { kind: "object"; obj: ObjectId; rot: number }
  | { kind: "quick"; id: QuickId; rot: number }
  | { kind: "demolish" };

export type Category = "build" | "quick" | "rooms" | "objects" | "staff" | null;
export type Panel = "staff" | "reports" | "grants" | "research" | "help" | null;

export interface Selected {
  kind: "person" | "room";
  id: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "good" | "bad";
}

export interface HudState {
  screen: "menu" | "game";
  hasSave: boolean;
  cash: number;
  minutes: number;
  speed: number;
  rep: number;
  hygiene: number;
  power: { supply: number; demand: number; ok: boolean };
  stats: Stats | null;
  notices: Notice[];
  grants: Partial<Record<GrantId, GrantState>>;
  staff: { id: number; role: Role; name: string; energy: number; onDuty: boolean; state: string; level: number }[];
  research: { current: ResearchId | null; points: number; done: ResearchId[]; open: ResearchId[]; labs: number };
  scenario: { id: ScenarioId; score: number; medal: number; finished: boolean; hoursLeft: number } | null;
  /** Best medal per scenario on this device. */
  medals: Partial<Record<ScenarioId, number>>;
  /** Show the end-of-scenario card. */
  result: boolean;
  /** The camera follows the selected person. */
  follow: boolean;
  /** Ambulances and helicopters on the radio. */
  incoming: { id: number; kind: "ambulance" | "helicopter"; cond: string; first: string; minutes: number; dispatched: boolean; incident: boolean; ready: boolean }[];
  emergency: { kind: EmergencyKind; detail: string; minutes: number } | null;
  patients: number;
  jobs: number;
  loan: number;
  unlocked: Partial<Record<Role | RoomId, boolean>>;
  tool: Tool | null;
  category: Category;
  panel: Panel;
  selected: Selected | null;
  toasts: Toast[];
  cursor: { x: number; y: number; text: string; bad: boolean } | null;
  cutaway: boolean;
  rooms: boolean;
  events: string[];
}

export type Store = ReturnType<typeof makeStore>;

export function makeStore() {
  return createStore<HudState>(() => ({
    screen: "menu",
    hasSave: false,
    cash: 0,
    minutes: 0,
    speed: 1,
    rep: 2.5,
    hygiene: 1,
    power: { supply: 0, demand: 0, ok: true },
    stats: null,
    notices: [],
    grants: {},
    staff: [],
    research: { current: null, points: 0, done: [], open: [], labs: 0 },
    scenario: null,
    medals: {},
    result: false,
    follow: false,
    incoming: [],
    emergency: null,
    patients: 0,
    jobs: 0,
    loan: 0,
    unlocked: {},
    tool: null,
    category: null,
    panel: null,
    selected: null,
    toasts: [],
    cursor: null,
    cutaway: true,
    rooms: true,
    events: [],
  }));
}
