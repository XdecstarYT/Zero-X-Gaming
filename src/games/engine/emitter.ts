import type { ScoreEvent, ScoreListener } from "../types";

export class ScoreEmitter {
  private listeners = new Set<ScoreListener>();
  private lastProgressAt = 0;
  private lastProgress = -1;

  on(listener: ScoreListener) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  emit(event: ScoreEvent) {
    this.listeners.forEach((l) => l(event));
  }

  /** Emits progress at most every `intervalMs`, and only when the score changed. */
  progress(score: number, now: number, intervalMs = 250) {
    if (score === this.lastProgress || now - this.lastProgressAt < intervalMs) return;
    this.lastProgress = score;
    this.lastProgressAt = now;
    this.emit({ kind: "progress", score });
  }

  clear() {
    this.listeners.clear();
  }
}
