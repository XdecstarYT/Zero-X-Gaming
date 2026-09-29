import type { KeyAction } from "@/store/settings";

/**
 * The contract every Zero X game implements. The platform (GameStage) owns
 * lifecycle, pause UI, scoring and submission; the game owns its canvas/DOM
 * inside `root`, its input while running, and its rules.
 */
export interface GameModule {
  readonly slug: string;
  /** Build DOM/canvas inside `root`. Called once, before start(). */
  init(options: GameInitOptions): void;
  /** Begin a fresh run. */
  start(): void;
  pause(): void;
  resume(): void;
  /** Tear down listeners, timers, audio and DOM. The instance is not reused. */
  destroy(): void;
  /** Subscribe to score updates; returns an unsubscribe function. */
  onScore(listener: ScoreListener): () => void;
}

export interface GameSettings {
  sound: boolean;
  volume: number;
  reduceMotion: boolean;
  keybindings: Record<KeyAction, string>;
}

export interface GameInitOptions {
  root: HTMLElement;
  settings: GameSettings;
  /** Ask the platform to pause (e.g. pointer lock was released). Optional for games. */
  requestPause?: () => void;
  /** Display name for online play (username when signed in, "Guest-1234" otherwise). */
  playerName?: string;
}

export type ScoreEvent =
  /** Live score while playing (throttled by the game). */
  | { kind: "progress"; score: number }
  /**
   * The run is over. `durationMs` excludes paused time. `ranked: false` (e.g. an
   * online match whose score can't be verified server-side) skips submission.
   */
  | { kind: "final"; score: number; durationMs: number; ranked?: boolean };

export type ScoreListener = (event: ScoreEvent) => void;

export type GameFactory = () => GameModule;
