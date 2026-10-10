import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScoreEmitter } from "../engine/emitter";
import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GAME_SLUG } from "./data";
import { Game } from "./game";
import { App } from "./ui/App";
import { css } from "./ui/style";

/**
 * WareForge as a Zero X game module: mounts the React app into the stage, forwards
 * pause/resume, and reports the score (final when the season ends or the business goes bust).
 */
class WareForge implements GameModule {
  readonly slug = GAME_SLUG;
  private root: Root | null = null;
  private el: HTMLDivElement | null = null;
  private game: Game | null = null;
  private emitter = new ScoreEmitter();

  init(options: GameInitOptions) {
    if (!document.getElementById("wf-style")) {
      const s = document.createElement("style");
      s.id = "wf-style";
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
    }, options.settings);
    this.root = createRoot(el);
    this.root.render(createElement(App, { game: this.game }));
    if (new URLSearchParams(window.location.search).has("wf")) (window as unknown as { __wf?: Game }).__wf = this.game;
  }

  start() {
    if (this.game) this.game.paused = false;
  }

  pause() {
    if (this.game) this.game.paused = true;
  }

  resume() {
    if (this.game) this.game.paused = false;
  }

  destroy() {
    this.game?.submitFinal();
    this.root?.unmount();
    this.game?.dispose();
    this.el?.remove();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);
}

const factory: GameFactory = () => new WareForge();
export default factory;
