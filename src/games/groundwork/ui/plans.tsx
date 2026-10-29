"use client";

import { KINDS } from "../data";
import { money, type Game } from "../game";
import { PLANS, planInfo } from "../plans";

const FACES = ["the street", "the right", "the back", "the left"];

/** The plans tool: pick a building, size it and finish it, then tap where it goes. */
export function PlanPicker({ game }: { game: Game }) {
  const info = planInfo(game.planId);
  const dims = game.planDims();
  const look = game.planLook;
  const roofKind = info.id === "shed" || info.id === "carport" ? "sheet" : "tile";
  return (
    <>
      <div className="gw-plans" role="radiogroup" aria-label="Plans">
        {PLANS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={game.planId === p.id} className={`gw-plan${game.planId === p.id ? " on" : ""}`} onClick={() => game.pickPlan(p.id)} data-testid={`gw-plan-${p.id}`}>
            <span aria-hidden>{p.icon}</span>
            {p.name}
          </button>
        ))}
      </div>
      <div className="gw-sizes">
        <Size label={info.line ? "Length" : "Frontage"} v={dims.w} min={info.w[0]} max={info.w[1]} step={info.line ? 0.45 : 0.45} set={(w) => game.setPlan({ w })} id="plan-w" />
        <Size label={info.id === "fence" || info.id === "wall" ? "Height" : "Depth"} v={dims.d} min={info.d[0]} max={info.d[1]} step={info.id === "fence" || info.id === "wall" ? 0.3 : 0.45} set={(d) => game.setPlan({ d })} id="plan-d" />
      </div>
      <div className="gw-scroll" style={{ alignItems: "center" }}>
        {info.brick && (
          <span className="gw-row" style={{ flexWrap: "nowrap" }} aria-label="Brick">
            {KINDS.brick.variants.slice(0, 5).map((v, i) => (
              <button key={v.name} type="button" className={`gw-sw small${look.brick === i ? " on" : ""}`} style={{ background: v.color }} onClick={() => game.setPlan({ brick: i })} aria-label={`${v.name} brick`} title={v.name} />
            ))}
          </span>
        )}
        {info.roof && (
          <span className="gw-row" style={{ flexWrap: "nowrap" }} aria-label="Roof">
            {KINDS[roofKind].variants.map((v, i) => (
              <button key={v.name} type="button" className={`gw-sw small roof${look.roof === i ? " on" : ""}`} style={{ background: v.color }} onClick={() => game.setPlan({ roof: i })} aria-label={`${v.name} roof`} title={`${v.name} roof`} />
            ))}
          </span>
        )}
        <button type="button" className="gw-chip" onClick={() => game.setPlan({ front: (look.front + 1) % 4 })} data-testid="gw-plan-turn">
          ↻ {info.line ? (look.front % 2 ? "Runs front to back" : "Runs across") : `Faces ${FACES[look.front]}`}
        </button>
        {info.roof && (
          <button type="button" className={`gw-chip${look.solar ? " on" : ""}`} onClick={() => game.setPlan({ solar: !look.solar })} aria-pressed={look.solar}>
            ☀ Solar
          </button>
        )}
      </div>
    </>
  );
}

function Size({ label, v, min, max, step, set, id }: { label: string; v: number; min: number; max: number; step: number; set: (n: number) => void; id: string }) {
  return (
    <div className="gw-step">
      <span className="muted">{label}</span>
      <button type="button" onClick={() => set(Math.max(min, +(v - step).toFixed(3)))} disabled={v <= min} aria-label={`Less ${label.toLowerCase()}`}>
        −
      </button>
      <b className="num" data-testid={`gw-${id}`}>
        {v.toFixed(2)} m
      </b>
      <button type="button" onClick={() => set(Math.min(max, +(v + step).toFixed(3)))} disabled={v >= max} aria-label={`More ${label.toLowerCase()}`}>
        +
      </button>
    </div>
  );
}

/** Pegged out and waiting for a yes, or going up stage by stage. */
export function PlanSheet({ game }: { game: Game }) {
  const b = game.building;
  const d = game.draft;
  const s = game.s!;
  if (b) {
    const st = b.stages[b.next];
    return (
      <div className="gw-confirm gw-glass" data-testid="gw-plan-sheet">
        <div className="gw-quote">
          <span>
            {planInfo(b.p.id).icon} <b>{planInfo(b.p.id).name}</b>
          </span>
          <span className="dim num">
            Stage {b.next + 1} of {b.stages.length}
          </span>
        </div>
        <ol className="gw-stages">
          {b.stages.map((x, i) => (
            <li key={x.name} className={i < b.next ? "done" : i === b.next ? "on" : ""}>
              <span aria-hidden>{i < b.next ? "✓" : x.icon}</span>
              {x.name}
            </li>
          ))}
        </ol>
        <div className="gw-actions">
          <button type="button" className="gw-btn" onClick={() => game.stopPlan()} data-testid="gw-plan-stop">
            Stop
          </button>
          <button type="button" className="gw-btn grow" onClick={() => game.buildRest()} data-testid="gw-plan-rest">
            Build the rest
          </button>
          <button type="button" className="gw-btn orange grow" onClick={() => game.buildStage()} data-testid="gw-plan-stage">
            {st ? st.name : "Done"}
          </button>
        </div>
      </div>
    );
  }
  if (!d) return null;
  const info = planInfo(d.id);
  const q = game.quoteOf;
  const blocked = !!game.draftWhy && !game.draftWhy.startsWith("Outside");
  const short = q && s.mode !== "free" && q.cost > s.money;
  return (
    <div className="gw-confirm gw-glass" data-testid="gw-plan-sheet">
      <div className="gw-quote">
        <span>
          {info.icon} <b>{info.name}</b>{" "}
          <span className="dim num">
            {d.w.toFixed(1)} × {d.d.toFixed(1)} m
          </span>
        </span>
        <b className={`num${short ? " bad" : ""}`} data-testid="gw-plan-cost">
          {q ? money(q.cost) : "…"}
        </b>
      </div>
      <div className={`gw-hint${game.draftWhy ? " bad" : ""}`}>
        {game.draftWhy ?? (q ? `${q.pieces.toLocaleString()} pieces, about ${q.days < 1 ? `${Math.max(1, Math.round(q.days * 9))} hours'` : `${q.days.toFixed(1)} days'`} work${s.speed && s.speed > 1 ? ` with your crew` : ""}. Tap elsewhere to move it; ↻ turns it.` : "Working out what it'll take…")}
        {short && " You haven't the cash for all of it: it'll stop when the money runs out."}
      </div>
      <div className="gw-actions">
        <button type="button" className="gw-btn" onClick={() => game.cancel()} data-testid="gw-plan-cancel">
          Cancel
        </button>
        <button type="button" className="gw-btn icon" onClick={() => game.rotate()} aria-label="Turn it">
          ↻
        </button>
        <button type="button" className="gw-btn grow" onClick={() => game.startPlan(false)} disabled={blocked} data-testid="gw-plan-stages">
          Stage by stage
        </button>
        <button type="button" className="gw-btn orange grow" onClick={() => game.startPlan(true)} disabled={blocked} data-testid="gw-plan-all">
          Build it all
        </button>
      </div>
    </div>
  );
}
