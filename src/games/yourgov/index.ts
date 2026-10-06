import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScoreEmitter } from "../engine/emitter";
import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GAME_SLUG } from "./data";
import { Game } from "./game";
import { App } from "./ui/App";
import { css } from "./ui/style";

/**
 * YourGov as a Zero X game module: mounts the React app into the stage, forwards
 * pause/resume, and reports the career score (final when the career ends or you retire).
 */
class YourGov implements GameModule {
  readonly slug = GAME_SLUG;
  private root: Root | null = null;
  private el: HTMLDivElement | null = null;
  private game: Game | null = null;
  private emitter = new ScoreEmitter();

  init(options: GameInitOptions) {
    if (!document.getElementById("yg-style")) {
      const s = document.createElement("style");
      s.id = "yg-style";
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
    if (new URLSearchParams(window.location.search).has("yg")) (window as unknown as { __yg?: Game }).__yg = this.game;
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
    this.root?.unmount();
    this.el?.remove();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);
}

const factory: GameFactory = () => new YourGov();
export default factory;
