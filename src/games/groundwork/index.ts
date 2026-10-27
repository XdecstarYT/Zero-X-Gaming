import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScoreEmitter } from "../engine/emitter";
import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GAME_SLUG } from "./data";
import * as model from "./model";
import { Game } from "./game";
import { showcaseHouse } from "./showcase";
import { App } from "./ui/App";
import { css } from "./ui/style";

/**
 * Groundwork as a Zero X game module: mounts the React app into the stage, saves on pause, and
 * reports the builder's score (stars from jobs plus pieces laid) as it grows and when you leave.
 */
class Groundwork implements GameModule {
  readonly slug = GAME_SLUG;
  private root: Root | null = null;
  private el: HTMLDivElement | null = null;
  private game: Game | null = null;
  private emitter = new ScoreEmitter();

  init(options: GameInitOptions) {
    if (!document.getElementById("gw-style")) {
      const s = document.createElement("style");
      s.id = "gw-style";
      s.textContent = css;
      document.head.appendChild(s);
    }
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0";
    options.root.appendChild(el);
    this.el = el;
    this.game = new Game({
      progress: (n) => this.emitter.progress(n, performance.now(), 1000),
      final: (n) => this.emitter.emit({ kind: "final", score: n, durationMs: Math.min(2 * 3600_000 - 1000, Math.max(60_000, this.game?.activeMs ?? 60_000)) }),
    });
    this.root = createRoot(el);
    this.root.render(createElement(App, { game: this.game }));
    if (new URLSearchParams(window.location.search).has("gw")) {
      // Test hooks: the controller, and a way to put the show home up on the plot.
      const w = window as unknown as { __gw?: Game; __gwHouse?: (stage?: number) => void; __gwModel?: typeof model };
      w.__gw = this.game;
      w.__gwModel = model;
      const game = this.game;
      w.__gwHouse = (stage = 1) => {
        if (!game.s) return;
        showcaseHouse(game.s, stage);
        game.bump();
      };
    }
  }

  start() {}

  pause() {
    this.game?.persist();
  }

  resume() {}

  destroy() {
    this.game?.dispose();
    this.root?.unmount();
    this.el?.remove();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);
}

const factory: GameFactory = () => new Groundwork();
export default factory;
