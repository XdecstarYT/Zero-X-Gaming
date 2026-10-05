import { useEffect, useRef } from "react";
import { isRtl } from "../i18n";
import { GameContext, useGame, useUI } from "./hooks";
import { Hud } from "./hud";
import { CreditsSheet, LoadingScreen, LoadSheet, LogSheet, MainMenu, MapSelect, PauseMenu, SettingsSheet } from "./screens";
import type { Game } from "../game";

function Root() {
  const g = useGame();
  const host = useRef<HTMLDivElement>(null);
  const screen = useUI((s) => s.screen);
  const overlay = useUI((s) => s.overlay);
  const lang = useUI((s) => s.lang);
  const scale = useUI((s) => s.settings.textScale);
  const draftScale = useUI((s) => s.draft.textScale);
  const reduce = useUI((s) => s.settings.reducedMotion || s.draft.reducedMotion);
  useEffect(() => {
    if (host.current) g.mount(host.current);
  }, [g]);
  const zoom = (overlay === "settings" ? draftScale : scale) / 100;
  return (
    <div className={`zc absolute inset-0 overflow-hidden bg-[#0b0f14] ${reduce ? "zc-reduce" : ""}`} dir={isRtl(lang) ? "rtl" : "ltr"} lang={lang} data-testid="zero-city">
      <div ref={host} className="absolute inset-0" />
      <div className="absolute inset-0" style={{ zoom, pointerEvents: "none" }}>
        <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
          {screen === "game" && <Hud />}
        </div>
        <div className="absolute inset-0" style={{ pointerEvents: screen === "game" && !overlay ? "none" : "auto" }}>
          {screen === "menu" && !overlay && <MainMenu />}
          {screen === "maps" && <MapSelect />}
          {overlay === "settings" && <SettingsSheet />}
          {overlay === "load" && <LoadSheet />}
          {overlay === "log" && <LogSheet />}
          {overlay === "credits" && <CreditsSheet />}
          {overlay === "pause" && <PauseMenu />}
          {screen === "loading" && <LoadingScreen />}
        </div>
      </div>
    </div>
  );
}

export function App({ game }: { game: Game }) {
  return (
    <GameContext.Provider value={game}>
      <Root />
    </GameContext.Provider>
  );
}
