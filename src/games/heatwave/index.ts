import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScoreEmitter } from "../engine/emitter";
import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GAME_SLUG } from "./data";
import { Game } from "./game";
import * as sim from "./sim";
import { App } from "./ui/App";
import { css } from "./ui/style";

/**
 * Heatwave as a Zero X game module: mounts the React app (which owns the canvas) into the stage,
 * pauses with the platform, and reports the score: progress as you play, final when you leave.
 */
class Heatwave implements GameModule {
  readonly slug = GAME_SLUG;
  private root: Root | null = null;
  private el: HTMLDivElement | null = null;
  private game: Game | null = null;
  private emitter = new ScoreEmitter();

  init(options: GameInitOptions) {
    if (!document.getElementById("hw-style")) {
      const s = document.createElement("style");
      s.id = "hw-style";
      s.textContent = css;
      document.head.appendChild(s);
    }
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0";
    options.root.appendChild(el);
    this.el = el;
    const game = new Game(options.settings.sound, options.settings.volume);
    game.onScore = (n) => this.emitter.progress(n, performance.now(), 1000);
    game.onFinal = (n) => this.emitter.emit({ kind: "final", score: n, durationMs: Math.min(2 * 3600_000 - 1000, Math.max(60_000, game.activeMs)) });
    this.game = game;
    this.root = createRoot(el);
    this.root.render(createElement(App, { game }));
    // Test hooks: ?hw exposes the controller and the simulation.
    if (new URLSearchParams(window.location.search).has("hw")) Object.assign(window, { __hw: game, __hwsim: sim });
  }

  start() {
    if (this.game) this.game.paused = false;
  }

  pause() {
    if (this.game) {
      this.game.paused = true;
      this.game.unlockPointer();
    }
  }

  resume() {
    if (this.game) this.game.paused = false;
  }

  destroy() {
    this.game?.dispose();
    this.root?.unmount();
    this.el?.remove();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);
}

const factory: GameFactory = () => new Heatwave();
export default factory;
