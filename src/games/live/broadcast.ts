import type { Detail } from "../sports-kit/look";
import type { Card, Slot } from "./schedule";

/**
 * A channel's feed: its sim, view, HUD and sound, driven by the broadcast
 * clock. `step` advances the match one fixed tick (skipping the view while
 * catching up), `render` draws a frame.
 */
export interface Feed {
  step(dt: number, catchUp: boolean): void;
  render(dt: number): void;
  over(): boolean;
  /** A short line for the channel strip ("HAR 4.3 (27) v SHA 2.5 (17) · Q2"). */
  status(): string;
  setMuted(muted: boolean): void;
  setResolution(k: number): void;
  destroy(): void;
}

export interface FeedOptions {
  detail: Detail;
  coarse: boolean;
  /** Commentary lines for the page's commentary box. */
  say: (line: string) => void;
}

export type FeedFactory = (host: HTMLElement, card: Card, slot: Slot, o: FeedOptions) => Feed;

const DT = 1 / 60;

/**
 * Plays a feed in sync with the wall clock: it fast-forwards to "now" in
 * chunks (so the page stays responsive), then steps in real time, catching up
 * again if the tab was hidden. Everyone runs the same deterministic sim from
 * the same seed, so everyone sees the same match.
 */
export class Broadcast {
  private steps = 0;
  private raf = 0;
  private last = 0;
  private stopped = false;
  private fps = 1 / 60;
  private res = 1;
  private resAt = 0;

  constructor(
    readonly feed: Feed,
    readonly slot: Slot,
    private now: () => number = Date.now,
  ) {}

  /** Seconds into the slot the match should be at. */
  private target() {
    return Math.max(0, (this.now() - this.slot.start) / 1000);
  }

  /** Fast-forward to the live point. */
  async catchUp(progress?: (k: number) => void) {
    const goal = Math.floor(this.target() / DT);
    while (this.steps < goal && !this.stopped && !this.feed.over()) {
      const until = Math.min(goal, this.steps + 3000);
      while (this.steps < until && !this.feed.over()) {
        this.feed.step(DT, true);
        this.steps++;
      }
      progress?.(goal ? this.steps / goal : 1);
      await new Promise((r) => setTimeout(r, 0));
    }
    progress?.(1);
  }

  start() {
    this.last = performance.now();
    const frame = () => {
      if (this.stopped) return;
      const t = performance.now();
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      // Real-time steps; a big gap (hidden tab) catches up quietly.
      const goal = Math.floor(this.target() / DT);
      const behind = goal - this.steps;
      const quiet = behind > 240;
      let n = 0;
      while (this.steps < goal && n < (quiet ? 6000 : 8) && !this.feed.over()) {
        this.feed.step(DT, quiet);
        this.steps++;
        n++;
      }
      this.feed.render(dt);
      // Adaptive resolution.
      this.fps += (dt - this.fps) * 0.05;
      if (t - this.resAt > 2500) {
        this.resAt = t;
        const before = this.res;
        if (this.fps > 1 / 40 && this.res > 0.7) this.res -= 0.1;
        else if (this.fps < 1 / 55 && this.res < 1) this.res += 0.05;
        if (this.res !== before) this.feed.setResolution(this.res);
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.feed.destroy();
  }
}
