import type { Difficulty } from "./bots";
import {
  createRoyale,
  matchStats,
  royaleScore,
  stepRoyale,
  type MatchStats,
  type PlayerInput,
  type RoyaleState,
} from "./royale";
import { isShrinking, stormCountdown, type StormState } from "./storm";
import type { Entity, World, WorldEvent } from "./world";

export interface Banner {
  text: string;
  sub?: string;
  color?: string;
}

export interface ScoreRow {
  name: string;
  kills: number;
  deaths: number;
  me: boolean;
}

/** Top-bar facts the HUD shows (each mode fills what applies). */
export interface ModeStatus {
  /** e.g. "12 ALIVE" or "3:41". */
  primary: string;
  kills: number;
  /** Storm line, e.g. "Storm shrinking" / "Storm in 0:24". */
  storm?: string;
  stormUrgent?: boolean;
  /** Extra line under the minimap (e.g. stance and stamina). */
  detail?: string;
}

export interface ViewEffects {
  /** Grenades in flight: world position, z = height (m). */
  projectiles: { id: string; x: number; y: number; z: number }[];
  /** Explosions: `at` in world time. */
  blasts: { id: string; x: number; y: number; at: number; big: boolean }[];
}

/** A point of interest drawn on the minimap and in 3D (e.g. a Conquest flag). */
export interface Marker {
  id: string;
  x: number;
  y: number;
  /** Owner colour (CSS). */
  color: string;
  label?: string;
  /** Capture radius in cells (draws a ring). */
  r?: number;
  /** 0..1 how raised the flag is (3D). */
  raise?: number;
  kind: "flag" | "ally";
}

/** What the Neon Siege shell needs from a game mode (battle royale vs bots, or an online match). */
export interface ModeController {
  readonly world: World;
  readonly me: Entity;
  /** Only verifiable modes submit scores to the leaderboards. */
  readonly ranked: boolean;
  readonly showNames: boolean;
  readonly storm: StormState | null;
  step(dt: number, input: PlayerInput): WorldEvent[];
  status(): ModeStatus;
  banner(): Banner | null;
  scoreboard(showAll: boolean): ScoreRow[] | null;
  isOver(): boolean;
  /** True when the player won (Victory Royale!). */
  won(): boolean;
  score(): number;
  /** Stats for season XP / challenges; null for modes that don't award progress. */
  stats(): MatchStats | null;
  nameOf(id: string): string;
  destroy(): void;
  /** Optional: minimap / world markers (flags, teammates). */
  markers?(): Marker[];
  /** Optional: headline for the results screen (e.g. "Victory"). */
  resultTitle?(): string;
  /** Optional: called after the results screen; return true to go back to the menu instead of ending the run. */
  afterResults?(): boolean;
  /** Optional: name-tag colour for an entity (team games). */
  tagColor?(id: string): string;
  /**
   * Optional realism mode (Trenches): Shift sprints (instead of aiming), C / X
   * toggle crouch / prone, G digs, and the crosshair shrinks to a dot.
   */
  readonly realism?: boolean;
  /** Optional: things in flight and recent explosions for the 3D view (Trenches). */
  effects?(): ViewEffects;
  /** Optional: stat boxes for the results screen, e.g. [["Kills", "7"], ...]. */
  resultLines?(): [string, string][];
  /** Optional: an in-progress action for the HUD progress bar (e.g. digging), k in 0..1. */
  task?(): { label: string; k: number } | null;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export class RoyaleController implements ModeController {
  readonly ranked: boolean;
  readonly showNames = false;
  private s: RoyaleState;
  private bannerUntil = 3;
  private bannerMsg: Banner | null = { text: "DROPPING IN", sub: "Loot up. Outlast the storm. Be the last one standing." };
  private lastPhase = 0;
  private wasShrinking = false;

  /** A Cash Cup round: coins for the top 3 (the server decides; this drives the HUD). */
  readonly cashCup: boolean;

  constructor(
    difficulty: Difficulty,
    seed = Date.now(),
    opts: { outfit?: string; name?: string; stormScale?: number; cashCup?: boolean } = {},
  ) {
    this.s = createRoyale(difficulty, seed, opts);
    this.ranked = this.s.stormScale === 1;
    this.cashCup = !!opts.cashCup && this.ranked;
    if (this.cashCup)
      this.bannerMsg = { text: "CASH CUP", sub: "Top 3 win coins: 50 · 20 · 5", color: "#f2c230" };
  }

  get world() {
    return this.s.world;
  }
  get me() {
    return this.s.player;
  }
  get storm() {
    return this.s.storm;
  }
  /** For tests. */
  get state() {
    return this.s;
  }

  step(dt: number, input: PlayerInput) {
    const events = stepRoyale(this.s, dt, input);
    const storm = this.s.storm;
    const shrinking = isShrinking(storm);
    if (shrinking && !this.wasShrinking) this.flash({ text: "THE STORM IS SHRINKING", color: "#b25cff" }, 2.5);
    else if (storm.phase !== this.lastPhase)
      this.flash({ text: "STORM EYE FORMING", sub: "Get inside the white circle on the map", color: "#b25cff" }, 2.5);
    this.wasShrinking = shrinking;
    this.lastPhase = storm.phase;
    for (const ev of events) {
      if (ev.type === "kill" && ev.killer === this.s.player.id && this.s.phase === "playing") {
        const alive = this.s.alive;
        this.flash({ text: `ELIMINATED ${this.nameOf(ev.victim).toUpperCase()}`, sub: `${alive} left`, color: "#ffb321" }, 1.6);
      }
    }
    return events;
  }

  private flash(b: Banner, seconds: number) {
    this.bannerMsg = b;
    this.bannerUntil = this.s.world.time + seconds;
  }

  status(): ModeStatus {
    const storm = this.s.storm;
    const shrinking = isShrinking(storm);
    return {
      primary: `${this.cashCup ? "CASH CUP · " : ""}${this.s.alive} ALIVE`,
      kills: this.s.player.kills,
      storm: storm.done ? "Final circle" : shrinking ? "Storm shrinking" : `Storm in ${clock(stormCountdown(storm))}`,
      stormUrgent: shrinking,
    };
  }

  banner() {
    if (this.s.phase === "over") {
      return this.s.placement === 1
        ? { text: "#1 VICTORY ROYALE", color: "#ffb321" }
        : { text: `#${this.s.placement} ELIMINATED`, sub: `${this.s.player.kills} eliminations`, color: "#ff4d6d" };
    }
    return this.s.world.time < this.bannerUntil ? this.bannerMsg : null;
  }

  scoreboard() {
    return null;
  }

  isOver() {
    return this.s.phase === "over";
  }

  won() {
    return this.s.placement === 1;
  }

  score() {
    return royaleScore(this.s);
  }

  stats() {
    return matchStats(this.s);
  }

  nameOf(id: string) {
    if (id === "storm") return "The Storm";
    return this.s.world.entities.get(id)?.name ?? id;
  }

  destroy() {}
}
