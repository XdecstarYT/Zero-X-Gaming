import { createStore } from "zustand/vanilla";
import type { FloorId, GrantId, ObjectId, Role, RoomId } from "./data";
import type { GrantState, Notice, Stats } from "./sim";

export type Tool =
  | { kind: "foundation"; floor: FloorId }
  | { kind: "wall" }
  | { kind: "door" }
  | { kind: "floor"; floor: FloorId }
  | { kind: "room"; room: RoomId | null }
  | { kind: "object"; obj: ObjectId; rot: number }
  | { kind: "demolish" };

export type Category = "build" | "rooms" | "objects" | "staff" | null;
export type Panel = "staff" | "reports" | "grants" | "help" | null;

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
  staff: { id: number; role: Role; name: string; energy: number; onDuty: boolean; state: string }[];
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
