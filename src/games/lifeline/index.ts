import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScoreEmitter } from "../engine/emitter";
import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GAME_SLUG } from "./data";
import { Game } from "./game";
import { makeStore } from "./store";
import { App } from "./ui/App";
import { css } from "./ui/style";

/**
 * Lifeline as a Zero X game module: mounts the React app (which owns the three.js
 * canvas) into the stage, forwards pause/resume, and reports lives saved as the score.
 */
class Lifeline implements GameModule {
  readonly slug = GAME_SLUG;
  private root: Root | null = null;
  private el: HTMLDivElement | null = null;
  private game: Game | null = null;
  private emitter = new ScoreEmitter();

  init(options: GameInitOptions) {
    if (!document.getElementById("ll-style")) {
      const s = document.createElement("style");
      s.id = "ll-style";
      s.textContent = css;
      document.head.appendChild(s);
    }
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0";
    options.root.appendChild(el);
    this.el = el;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const store = makeStore();
    this.game = new Game(
      store,
      {
        progress: (n) => this.emitter.progress(n, performance.now(), 1000),
        final: (n) => this.emitter.emit({ kind: "final", score: n, durationMs: Math.min(2 * 3600_000 - 1000, Math.max(60_000, this.game?.activeMs ?? 60_000)) }),
      },
      coarse ? "low" : "high",
    );
    this.game.sound.enabled = options.settings.sound;
    this.game.sound.volume = options.settings.volume;
    this.root = createRoot(el);
    this.root.render(createElement(App, { game: this.game }));
    if (new URLSearchParams(window.location.search).has("ll")) (window as unknown as { __ll?: Game }).__ll = this.game;
  }

  start() {
    this.game?.resume();
  }

  pause() {
    this.game?.pause();
  }

  resume() {
    this.game?.resume();
  }

  destroy() {
    this.game?.dispose();
    this.root?.unmount();
    this.el?.remove();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);
}

const factory: GameFactory = () => new Lifeline();
export default factory;
