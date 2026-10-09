import { useEffect, useMemo, useRef, useState } from "react";
import { PARTY, type PartyId } from "../data";
import type { Game } from "../game";
import * as G from "../sim";
import { Stage3D } from "../render/stage";
import { Chamber } from "./Chamber";
import { countyColors } from "./mapColors";
import { MapView } from "./MapView";

/** The vote the chamber shows: the bill you have open, or the latest House or Senate vote. */
function chamberVote(s: G.GameState, billId: number | null, house: "house" | "senate") {
  const open = s.bills.find((b) => b.id === billId && b.last && b.last.stage === house);
  const b = open ?? [...s.bills].reverse().find((x) => x.last && x.last.stage === house);
  if (!b || !b.last) return null;
  const l = G.lawOf(s, b.law);
  return { key: `${b.id}:${b.last.stage}:${b.last.tally.yes}`, title: b.budget ? "Budget" : l ? `${l.name}: ${l.options[b.option].label}` : "Bill", by: b.last.tally.by, yes: b.last.tally.yes, no: b.last.tally.no, abstain: b.last.tally.abstain, passed: b.last.passed };
}

/**
 * The 3D view behind the HUD: the country (with the politics painted on) or the chamber.
 * Falls back to the flat map and the drawn chamber when WebGL isn't available.
 */
export function Scene({ g }: { g: Game }) {
  const s = g.s!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage3D | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const quality = g.quality;
  const view = s.election ? "map" : g.ui.view;

  // Create the stage once per country and graphics level.
  useEffect(() => {
    if (!canvas.current) return;
    let st: Stage3D;
    try {
      st = new Stage3D(canvas.current, G.country(s.seed), quality, labels.current, {
        onReady: () => setReady(true),
        onPickCounty: (id) => {
          if (id < 0) return;
          const c = G.country(g.s!.seed);
          const state = c.sections[id].state;
          g.setUI({ state: g.ui.state === state ? null : state });
        },
        onHoverCounty: (id, x, y) => setHover(id >= 0 ? { id, x, y } : null),
      });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    st.isPaused = () => g.paused;
    stage.current = st;
    (window as unknown as { __ygStage?: Stage3D }).__ygStage = st;
    return () => {
      st.dispose();
      stage.current = null;
      setReady(false);
    };
  }, [s.seed, quality, g]);

  // The politics on the land: recoloured when the week, the mode or the count moves on.
  const countBucket = s.election ? Math.round(g.ui.count * 240) : -1;
  const colors = useMemo(() => countyColors(s, g.ui.mapMode, s.election ? countBucket / 240 : null), [s, s.week, g.ui.mapMode, countBucket, s.election, g.ui.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const st = stage.current;
    if (!st) return;
    st.world.setOverlay({ colors, selectedState: g.ui.state ?? -1, hoverCounty: hover?.id ?? -1 }, g.prefs.overlay);
    st.labels = { selected: g.ui.state ?? -1, hidden: !!s.election };
    st.world.cloudsOn = g.prefs.clouds;
  });

  // Which view, and the chamber's members and vote.
  const house = g.ui.house;
  const vote = chamberVote(s, g.ui.bill, house);
  const lastVote = useRef<string | null>(null);
  useEffect(() => {
    const st = stage.current;
    if (!st) return;
    st.setActive(view);
    if (view === "chamber") {
      const ids = house === "house" ? s.house : s.senate;
      st.chamber.setMembers(
        house,
        ids.map((id) => {
          const p = G.pol(s, id)!;
          return { id, party: p.party, face: p.face, you: p.you };
        }),
      );
      const key = vote ? `${house}|${vote.key}` : `${house}|none`;
      if (key !== lastVote.current) {
        st.chamber.setVote(vote, lastVote.current !== null);
        lastVote.current = key;
      }
    }
  });

  // Fly to a state when one is picked; back out for the count.
  useEffect(() => {
    stage.current?.world.focusState(s.election ? null : g.ui.state, !!s.election);
  }, [g.ui.state, s.election]);

  if (failed)
    return view === "map" ? (
      <div className="yg-flat">
        <MapView s={s} mode={g.ui.mapMode === "terrain" ? "politics" : g.ui.mapMode} selected={g.ui.state} count={s.election ? g.ui.count : null} onSelect={(st) => g.setUI({ state: st })} />
      </div>
    ) : (
      <div className="yg-flat light">
        <Chamber s={s} house={house} votes={vote?.by ?? null} />
      </div>
    );

  const c = G.country(s.seed);
  const sec = hover && view === "map" && !s.election ? c.sections[hover.id] : null;
  const shares = sec ? G.sharesIn(s, sec.id) : null;
  return (
    <>
      <canvas ref={canvas} className="yg-canvas" data-testid={view === "map" ? "yg-map" : "yg-chamber"} />
      <div ref={labels} className="yg-labels" aria-hidden />
      {!ready && view === "map" && (
        <div className="yg-glass yg-loading" role="status" data-testid="yg-loading">
          <span className="yg-spin" /> Surveying the land…
        </div>
      )}
      {sec && shares && (
        <div className="yg-glass yg-tip" style={{ left: hover!.x + 16, top: hover!.y + 12 }}>
          <b>
            {sec.town}
            {sec.city ? " · city" : ""}
          </b>
          <span className="yg-muted">
            {c.states[sec.state].name} · {(sec.pop / 1000).toFixed(0)}k people
          </span>
          {(G.PARTY_IDS.map((id, i) => [id, shares[i]]) as [PartyId, number][])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id, v]) => (
              <span key={id} className="yg-tip-row">
                <i style={{ background: PARTY[id].color }} />
                {PARTY[id].name}
                <b>{Math.round(v * 100)}%</b>
              </span>
            ))}
        </div>
      )}
    </>
  );
}
