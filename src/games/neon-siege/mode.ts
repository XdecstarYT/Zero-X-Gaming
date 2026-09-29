import type { HudState } from "./render";
import type { PlayerInput } from "./solo";
import type { Entity, World, WorldEvent } from "./world";
import { createSolo, stepSolo, type SoloState } from "./solo";
import type { Difficulty } from "./bots";

/** What the Neon Siege shell needs from a game mode (solo waves or an online match). */
export interface ModeController {
  readonly world: World;
  readonly me: Entity;
  /** Only verifiable modes submit scores to the leaderboards. */
  readonly ranked: boolean;
  readonly showNames: boolean;
  step(dt: number, input: PlayerInput): WorldEvent[];
  topLeft(): string[];
  banner(): HudState["banner"];
  scoreboard(showAll: boolean): HudState["scoreboard"];
  isOver(): boolean;
  score(): number;
  nameOf(id: string): string;
  destroy(): void;
}

export class SoloController implements ModeController {
  readonly ranked = true;
  readonly showNames = false;
  private s: SoloState;
  private waveBannerUntil = 0;
  private waveBanner: HudState["banner"] = null;

  constructor(difficulty: Difficulty, seed = Date.now()) {
    this.s = createSolo(difficulty, seed);
  }

  get world() {
    return this.s.world;
  }
  get me() {
    return this.s.player;
  }

  step(dt: number, input: PlayerInput) {
    const events = stepSolo(this.s, dt, input);
    for (const e of events) {
      if (e.type === "wave") {
        this.waveBanner = e.cleared
          ? { text: `WAVE ${e.wave} CLEARED`, sub: "+35 HP · ammo refilled", color: "#3dffa2" }
          : { text: `WAVE ${e.wave}`, sub: "Hostile drones inbound", color: "#ff2bd6" };
        this.waveBannerUntil = this.s.world.time + 2.2;
      }
    }
    return events;
  }

  topLeft() {
    const s = this.s;
    const left = [...s.world.entities.values()].filter((e) => e.kind === "bot" && e.alive).length + s.toSpawn;
    return [String(s.score).padStart(6, "0"), `WAVE ${Math.max(1, s.wave)} · ${left} LEFT · ${s.kills} KILLS`];
  }

  banner() {
    if (this.s.phase === "intermission" && this.s.wave === 0) return { text: "GET READY", sub: "Survive the waves" };
    return this.s.world.time < this.waveBannerUntil ? this.waveBanner : null;
  }

  scoreboard() {
    return null;
  }

  isOver() {
    return this.s.phase === "over";
  }

  score() {
    return this.s.score;
  }

  nameOf(id: string) {
    return this.s.world.entities.get(id)?.name ?? (id === "you" ? "You" : id);
  }

  destroy() {}
}
