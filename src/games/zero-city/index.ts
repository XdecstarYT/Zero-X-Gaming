import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { ScoreEmitter } from "../engine/emitter";
import { GAME_SLUG } from "./config";
import { Game } from "./game";
import { LANGS, type Lang } from "./i18n";
import { createZeroXPlatform, Signals } from "./platform/zeroxAdapter";
import { defaultSettings, normaliseSettings } from "./settings";
import { makeStore } from "./store";
import { css } from "./theme";
import { App } from "./ui/App";
import { useAuth } from "@/store/auth";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { submitScore } from "@/lib/scores";
import { applyProgress } from "@/lib/progress";

/** Pick the language from the browser on first run. */
function browserLang(): Lang {
  const want = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2).toLowerCase();
  return (LANGS.find((l) => l.id === want)?.id ?? "en") as Lang;
}

/**
 * Zero City as a Zero X game module: mounts the React app into the stage,
 * wires the platform adapter to the site's sign-in and leaderboards, and
 * forwards pause/resume.
 */
class ZeroCity implements GameModule {
  readonly slug = GAME_SLUG;
  private root: Root | null = null;
  private el: HTMLDivElement | null = null;
  private game: Game | null = null;
  private signals = new Signals();
  private emitter = new ScoreEmitter();
  private opts: GameInitOptions | null = null;
  private started = false;

  init(options: GameInitOptions) {
    this.opts = options;
    if (!document.getElementById("zc-style")) {
      const s = document.createElement("style");
      s.id = "zc-style";
      s.textContent = css;
      document.head.appendChild(s);
    }
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0";
    options.root.appendChild(el);
    this.el = el;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const settings = defaultSettings(coarse, browserLang());
    if (options.settings.reduceMotion) settings.reducedMotion = true;
    const store = makeStore(settings);
    const sessionStart = performance.now();
    const platform = createZeroXPlatform(
      {
        player: () => {
          const a = useAuth.getState();
          return a.status === "signed_in" && a.userId ? { id: a.userId, name: a.profile?.username ?? options.playerName ?? "Mayor", avatarUrl: a.profile?.avatar_url ?? undefined } : null;
        },
        guestName: () => options.playerName ?? "Guest",
        postScore: async (value) => {
          const sb = getSupabaseBrowser();
          if (!sb) return false;
          try {
            const res = await submitScore(sb, GAME_SLUG, value, Math.min(2 * 3600 * 1000, Math.max(1500, performance.now() - sessionStart)));
            applyProgress(res.totalXp, res.newAchievements);
            return true;
          } catch {
            return false;
          }
        },
        progress: (value) => this.emitter.progress(value, performance.now()),
        dlcOwned: async () => {
          try {
            const { zeroCityDlcOwned } = await import("@/lib/season-client");
            return await zeroCityDlcOwned();
          } catch {
            return false;
          }
        },
        buyDlc: async () => {
          try {
            const { buyZeroCityDlc } = await import("@/lib/season-client");
            await buyZeroCityDlc();
            return { ok: true };
          } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      this.signals,
    );
    this.game = new Game({ store, platform, signals: this.signals, coarse, site: { sound: options.settings.sound, volume: options.settings.volume }, onPopulation: (n) => this.emitter.progress(n, performance.now()) });
    this.game.setSite({ sound: options.settings.sound, volume: options.settings.volume });
    // Stored settings replace the defaults once they load.
    void platform.getSettings().then((saved) => {
      if (!saved || !this.game) return;
      const s = normaliseSettings(saved, coarse, settings.language);
      this.game.applySettings(s);
      store.setState({ draft: s });
    });
    this.root = createRoot(el);
    this.root.render(createElement(App, { game: this.game }));
    // Test hook (?zc=test): the game, for end-to-end tests.
    if (new URLSearchParams(window.location.search).has("zc")) (window as unknown as { __zc?: Game }).__zc = this.game;
  }

  start() {
    if (!this.game) return;
    if (!this.started) {
      this.started = true;
      void this.game.start();
    } else this.signals.resume();
  }

  pause() {
    this.signals.pause();
  }

  resume() {
    this.signals.resume();
  }

  destroy() {
    this.game?.dispose();
    this.root?.unmount();
    this.el?.remove();
    this.game = null;
    this.root = null;
  }

  onScore(listener: ScoreListener) {
    return this.emitter.on(listener);
  }
}

const factory: GameFactory = () => new ZeroCity();
export default factory;
