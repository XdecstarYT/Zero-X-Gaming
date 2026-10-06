/**
 * Every call Zero City makes to its host platform goes through here. Two
 * implementations ship: a standalone mock (IndexedDB only, a local "Guest"
 * player) and the Zero X one, wired to the site's sign-in, leaderboards and
 * pause. Game code only ever sees the ZeroXPlatform interface.
 */
import type { Settings } from "../settings";
import { idbDelete, idbGet, idbKeys, idbSet } from "./idb";

export interface Player {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface SaveSummary {
  slot: string;
  name: string;
  mapId: string;
  population: number;
  playtimeSeconds: number;
  updatedAt: number;
  /** A small JPEG data URL. */
  thumbnail?: string;
}

/** A save: its summary (for menus) plus the compressed, versioned city. */
export interface CitySave {
  summary: SaveSummary;
  version: number;
  /** gzip-compressed JSON when the browser can compress, plain JSON text otherwise. */
  data: Uint8Array | string;
  compressed: boolean;
}

export type Board = "population" | "playtime";

export interface ZeroXPlatform {
  getPlayer(): Promise<Player>;
  listSaves(): Promise<SaveSummary[]>;
  saveCity(slot: string, data: CitySave): Promise<void>;
  loadCity(slot: string): Promise<CitySave | null>;
  deleteCity(slot: string): Promise<void>;
  getSettings(): Promise<Settings | null>;
  setSettings(s: Settings): Promise<void>;
  /** `force` posts even when the value hasn't beaten the last post by much (the Stats panel button). */
  submitScore(board: Board, mapId: string, value: number, opts?: { force?: boolean }): Promise<SubmitOutcome>;
  /** Best value per map on this device (the map select shows it). */
  getBests(board: Board): Promise<Record<string, number>>;
  unlockAchievement(id: string): Promise<boolean>;
  getAchievements(): Promise<string[]>;
  track(event: string, props?: Record<string, unknown>): void;
  /** Does this player own the Riviera DLC? */
  dlcOwned(): Promise<boolean>;
  /** Buy the Riviera DLC (50 ZX Cash on Zero X). */
  buyDlc(): Promise<{ ok: boolean; error?: string }>;
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
}

export type SubmitOutcome = "posted" | "local" | "signed-out" | "failed";

/** Pause/resume fan-out the GameModule drives. */
export class Signals {
  private pauses = new Set<() => void>();
  private resumes = new Set<() => void>();
  onPause(cb: () => void) {
    this.pauses.add(cb);
    return () => this.pauses.delete(cb);
  }
  onResume(cb: () => void) {
    this.resumes.add(cb);
    return () => this.resumes.delete(cb);
  }
  pause() {
    for (const cb of this.pauses) cb();
  }
  resume() {
    for (const cb of this.resumes) cb();
  }
}

/** Shared IndexedDB-backed storage, namespaced per player. */
function localStore(playerId: () => Promise<string>) {
  const ns = async (k: string) => `${await playerId()}/${k}`;
  return {
    async listSaves() {
      const prefix = `${await playerId()}/`;
      const keys = (await idbKeys("saves")).filter((k) => k.startsWith(prefix));
      const all = await Promise.all(keys.map((k) => idbGet<CitySave>("saves", k)));
      return all.filter((s): s is CitySave => !!s).map((s) => s.summary).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async saveCity(slot: string, data: CitySave) {
      await idbSet("saves", await ns(slot), data);
    },
    async loadCity(slot: string) {
      return (await idbGet<CitySave>("saves", await ns(slot))) ?? null;
    },
    async deleteCity(slot: string) {
      await idbDelete("saves", await ns(slot));
    },
    async getSettings() {
      return (await idbGet<Settings>("kv", await ns("settings"))) ?? null;
    },
    async setSettings(s: Settings) {
      await idbSet("kv", await ns("settings"), s);
    },
    async getBests(board: Board) {
      return (await idbGet<Record<string, number>>("kv", await ns(`best-${board}`))) ?? {};
    },
    async recordBest(board: Board, mapId: string, value: number) {
      const bests = (await idbGet<Record<string, number>>("kv", await ns(`best-${board}`))) ?? {};
      if (value <= (bests[mapId] ?? 0)) return false;
      bests[mapId] = value;
      await idbSet("kv", await ns(`best-${board}`), bests);
      return true;
    },
    async getAchievements() {
      return (await idbGet<string[]>("kv", await ns("achievements"))) ?? [];
    },
    async unlockAchievement(id: string) {
      const got = (await idbGet<string[]>("kv", await ns("achievements"))) ?? [];
      if (got.includes(id)) return false;
      await idbSet("kv", await ns("achievements"), [...got, id]);
      return true;
    },
  };
}

/** Standalone: everything on this device, one local player. */
export function createMockPlatform(signals = new Signals()): ZeroXPlatform {
  const player: Player = { id: "local", name: "Guest" };
  const store = localStore(async () => player.id);
  return {
    getPlayer: async () => player,
    ...store,
    async submitScore(board, mapId, value) {
      await store.recordBest(board, mapId, value);
      return "local";
    },
    track() {},
    // Standalone builds have no shop: the DLC is a local switch.
    dlcOwned: async () => !!(await idbGet<boolean>("kv", `${player.id}/dlc-riviera`)),
    async buyDlc() {
      await idbSet("kv", `${player.id}/dlc-riviera`, true);
      return { ok: true };
    },
    onPause: (cb) => signals.onPause(cb),
    onResume: (cb) => signals.onResume(cb),
  };
}

export interface ZeroXHost {
  /** The signed-in Zero X player, or null for a guest. */
  player(): Player | null;
  /** Guest display name from the platform. */
  guestName(): string;
  /** Post a population score to the platform leaderboard. Resolves false if it couldn't. */
  postScore(value: number): Promise<boolean>;
  /** Live score for the platform UI (the pause overlay shows it). */
  progress(value: number): void;
  /** The Riviera DLC: owned, and buying it with ZX Cash. */
  dlcOwned(): Promise<boolean>;
  buyDlc(): Promise<{ ok: boolean; error?: string }>;
}

/**
 * Zero X: the player comes from the site's sign-in; saves, settings and
 * achievements stay on the device (per player); population goes to the
 * site's Zero City leaderboard. The site has one board per game, so the
 * per-map boards live on the device and the site board holds your best city.
 */
export function createZeroXPlatform(host: ZeroXHost, signals: Signals): ZeroXPlatform {
  const playerId = async () => host.player()?.id ?? "guest";
  const store = localStore(playerId);
  let lastPosted = 0;
  return {
    async getPlayer() {
      return host.player() ?? { id: "guest", name: host.guestName() };
    },
    ...store,
    async submitScore(board, mapId, value, opts) {
      await store.recordBest(board, mapId, value);
      if (board !== "population") return "local";
      host.progress(value);
      if (!host.player()) return "signed-out";
      // Post when the city has really grown (or when asked), so autosaves don't spam the board.
      const grown = value >= lastPosted * 1.1 && value >= lastPosted + 250;
      if (!opts?.force && !grown) return "local";
      if (value <= 0) return "local";
      const ok = await host.postScore(value);
      if (ok) lastPosted = Math.max(lastPosted, value);
      return ok ? "posted" : "failed";
    },
    track(event, props) {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("zx:track", { detail: { game: "zero-city", event, ...props } }));
    },
    dlcOwned: () => host.dlcOwned(),
    buyDlc: () => host.buyDlc(),
    onPause: (cb) => signals.onPause(cb),
    onResume: (cb) => signals.onResume(cb),
  };
}
