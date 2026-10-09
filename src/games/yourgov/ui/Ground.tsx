/**
 * Campaign HQ's new pages: the ground game (energy, holidays, strategy, membership fees,
 * get-out-the-vote drives, bus tours, newspaper endorsements), the battleground regions you
 * target and the candidates you pick for them, and life in opposition (the shadow cabinet,
 * opposition days, poaching members).
 */
import { useState } from "react";
import type { PartyId } from "../data";
import type { Game } from "../game";
import * as Gr from "../grassroots";
import * as P from "../politics";
import * as G from "../sim";
import { Bar, Group, money, Row, Seg, Stars, Sw } from "./kit";

const regionsSorted = (s: G.GameState) => [...G.country(s).states].sort((a, b) => a.name.localeCompare(b.name));

export function GroundGame({ g }: { g: Game }) {
  const s = g.s!;
  const gr = s.gr;
  const c = G.country(s);
  const [tour, setTour] = useState<number[]>(() => regionsSorted(s).slice(0, 3).map((x) => x.id));
  const next = G.nextElection(s);
  const gotvOpen = next.kind !== "upper" && next.week - s.week <= 6;
  const tourWait = Math.max(0, Gr.TOUR_GAP - (s.week - gr.tourAt));
  const resting = Gr.resting(s);
  return (
    <div data-testid="yg-ground">
      <Group label="You">
        <Row>
          <span style={{ width: 70 }}>Energy</span>
          <Bar v={gr.energy / 100} color={gr.energy >= 60 ? "var(--good)" : gr.energy >= 30 ? "var(--warn)" : "var(--bad)"} />
          <span className="r" style={{ width: 44 }}>
            {gr.energy}%
          </span>
        </Row>
        <p className="yg-muted small" style={{ margin: "2px 6px 6px" }}>
          {resting ? "You're resting this week." : gr.energy < 30 ? "Running on empty: events do less, and the doctors may order you to rest." : "Every event tires you a little; you get some back each week."}
        </p>
        <Row onClick={resting ? undefined : () => window.confirm("Take a week off? No events this week; you're back at full energy next week.") && g.run((x) => Gr.takeHoliday(x), undefined, "click", 0)} testId="yg-holiday">
          <span className="yg-tile-ico small">🏖️</span>
          <span className="grow">Take a week off</span>
          <span className="r small muted">{s.week - gr.holidayAt < Gr.HOLIDAY_GAP ? `in ${Gr.HOLIDAY_GAP - (s.week - gr.holidayAt)}w` : "full energy"}</span>
        </Row>
      </Group>
      <p className="yg-label">Campaign strategy</p>
      <div className="yg-scrollseg">
        <Seg value={gr.strategy} label="Campaign strategy" onChange={(v) => g.run((x) => void Gr.setStrategy(x, v), "", "click")} options={Gr.STRATEGIES.map((x) => ({ id: x.id, label: x.name, title: x.about }))} testId="yg-strategy" />
      </div>
      <p className="yg-muted small" style={{ margin: "2px 4px 8px" }}>
        {Gr.STRATEGIES.find((x) => x.id === gr.strategy)?.about}
      </p>
      <p className="yg-label">Membership fee</p>
      <Seg value={String(gr.fee)} label="Membership fee" onChange={(v) => g.run((x) => void Gr.setFee(x, Number(v)), "", "click")} options={Gr.FEES.map((f, i) => ({ id: String(i), label: f.name, title: f.about }))} className="yg-seg-fill" testId="yg-fee" />
      <p className="yg-muted small" style={{ margin: "2px 4px 8px" }}>
        {Gr.FEES[gr.fee].about}
      </p>
      <button type="button" className="yg-cta" disabled={!gotvOpen || gr.gotv === next.week} onClick={() => g.run((x) => Gr.runGotv(x), undefined, "cheer")} data-testid="yg-gotv">
        <span className="yg-cta-icon">🚪</span>
        <span>
          <b>{gr.gotv === next.week ? "Get-out-the-vote drive booked" : "Get out the vote"}</b>
          <small>{gotvOpen ? `${money(s, Gr.GOTV_COST + gr.targets.length * 0.5)}: knock on every door on election day (${next.title}).` : `Opens six weeks before a national election (${next.title} in ${next.week - s.week} weeks).`}</small>
        </span>
      </button>
      <Group label={`Bus tour · three regions in a week (${money(s, Gr.TOUR_COST)})`}>
        {[0, 1, 2].map((i) => (
          <label key={i} className="yg-row">
            <span style={{ width: 54 }} className="small muted">
              Stop {i + 1}
            </span>
            <select className="yg-input" value={tour[i]} onChange={(e) => setTour(tour.map((x, k) => (k === i ? Number(e.target.value) : x)))} aria-label={`Bus tour stop ${i + 1}`}>
              {regionsSorted(s).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="yg-actions" style={{ padding: "4px 6px 8px" }}>
          <button type="button" className="yg-btn primary" disabled={tourWait > 0 || resting} onClick={() => g.run((x) => Gr.busTour(x, tour), undefined, "cheer")} data-testid="yg-bustour">
            🚌 {tourWait > 0 ? `Back on the road in ${tourWait}w` : "Roll out the battle bus"}
          </button>
        </div>
      </Group>
      {Object.keys(gr.endorse).length > 0 && (
        <Group label="Who the papers backed">
          {P.OUTLETS.map((o) => {
            const p = gr.endorse[o.id];
            return p ? (
              <Row key={o.id}>
                <span className="grow">{o.name}</span>
                <Sw c={G.party(s, p).color} />
                <span className="r">{G.party(s, p).short}</span>
              </Row>
            ) : null;
          })}
        </Group>
      )}
      <p className="yg-muted small" style={{ margin: "6px 4px" }}>
        Two weeks before a national election the big outlets endorse a party: win the press over and they back you. {c.states.length} regions to fight for.
      </p>
    </div>
  );
}

export function Targets({ g }: { g: Game }) {
  const s = g.s!;
  const gr = s.gr;
  const c = G.country(s);
  const [open, setOpen] = useState<number | null>(null);
  const bg = Gr.battlegrounds(s);
  const shown = [...new Set([...gr.targets, ...bg.map((b) => b.region)])];
  const margin = (k: number) => bg.find((b) => b.region === k);
  return (
    <div data-testid="yg-targets">
      <p className="yg-lede">Battlegrounds are regions where you&apos;re within six points. Target up to {Gr.MAX_TARGETS}: the party spends {money(s, Gr.TARGET_COST)} a week in each. Pick a candidate in a region to lift your vote there at the next election.</p>
      {!shown.length && <p className="yg-empty">No close races right now. Target a region from the list below.</p>}
      <Group label={`Battlegrounds and targets (${gr.targets.length}/${Gr.MAX_TARGETS} targeted)`}>
        {shown.map((k) => {
          const m = margin(k);
          const cand = gr.candidates[k];
          const on = gr.targets.includes(k);
          return (
            <div key={k}>
              <Row on={open === k} onClick={() => setOpen(open === k ? null : k)} testId={`yg-bg-row-${k}`}>
                <span className="grow">
                  {c.states[k].name}
                  {cand && <span className="yg-tag accent">{Gr.CANDIDATES.find((x) => x.id === cand.kind)?.icon}</span>}
                  {on && <span className="yg-tag good">Target</span>}
                </span>
                {m && (
                  <span className={`r small ${m.margin >= 0 ? "yg-up" : "yg-down"}`}>
                    {m.margin >= 0 ? "+" : ""}
                    {(m.margin * 100).toFixed(1)}
                  </span>
                )}
                {m && <Sw c={G.party(s, m.leader).color} />}
              </Row>
              {open === k && (
                <div className="yg-actions" style={{ padding: "4px 6px 10px", flexWrap: "wrap" }}>
                  <button type="button" className={`yg-btn small${on ? "" : " primary"}`} onClick={() => g.run((x) => Gr.toggleTarget(x, k), on ? "No longer a target" : "Targeted", "click", 0)} data-testid="yg-target-toggle">
                    🎯 {on ? "Stop targeting" : "Target it"}
                  </button>
                  {!cand &&
                    Gr.CANDIDATES.map((x) => (
                      <button key={x.id} type="button" className="yg-btn small" title={x.about} disabled={s.parties[s.party].funds < x.cost} onClick={() => g.run((y) => Gr.pickCandidate(y, k, x.id), undefined, "paper")} data-testid={`yg-cand-pick-${x.id}`}>
                        {x.icon} {x.name} · {money(s, x.cost)}
                      </button>
                    ))}
                  {cand && <span className="yg-muted small">Candidate: {Gr.CANDIDATES.find((x) => x.id === cand.kind)?.name}</span>}
                </div>
              )}
            </div>
          );
        })}
      </Group>
      <label className="yg-pick">
        <span>Target another</span>
        <select className="yg-input" value="" onChange={(e) => e.target.value !== "" && g.run((x) => Gr.toggleTarget(x, Number(e.target.value)), "Targeted", "click", 0)} data-testid="yg-target-add">
          <option value="">Pick a region…</option>
          {regionsSorted(s)
            .filter((r) => !gr.targets.includes(r.id))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      {Object.keys(gr.manifestos).length > 0 && (
        <Group label="What the rivals promise">
          {Object.entries(gr.manifestos).map(([id, list]) => (
            <Row key={id}>
              <Sw c={G.party(s, id).color} />
              <span className="grow small">
                <b>{G.party(s, id).short}</b>:{" "}
                {list
                  .map((x) => {
                    const l = G.lawOf(s, x.law);
                    return l ? `${l.name} → ${l.options[(s.laws[x.law] ?? 0) + x.dir]?.label ?? "?"}` : "";
                  })
                  .filter(Boolean)
                  .join(" · ") || "Nothing new"}
              </span>
            </Row>
          ))}
        </Group>
      )}
    </div>
  );
}

export function Opposition({ g }: { g: Game }) {
  const s = g.s!;
  const gr = s.gr;
  const [law, setLaw] = useState("");
  const [opt, setOpt] = useState(-1);
  if (G.inGovernment(s))
    return (
      <div data-testid="yg-opposition">
        <p className="yg-note">You&apos;re in government. Your shadow team took their posts in the cabinet; opposition days and the shadow cabinet are for when you&apos;re out of power.</p>
        <Poach g={g} />
      </div>
    );
  const pool = Gr.shadowPool(s).sort((a, b) => P.skill(b) - P.skill(a));
  const l = law ? G.lawOf(s, law) : null;
  const oppWait = Math.max(0, Gr.OPPDAY_GAP - (s.week - gr.oppDayAt));
  return (
    <div data-testid="yg-opposition">
      <Group label={`Shadow cabinet · readiness ${Gr.shadowReadiness(s).toFixed(1)}/9`} testId="yg-shadow">
        {P.PORTFOLIOS.map((pf) => {
          const id = gr.shadow[pf.id];
          const p = id !== undefined ? G.pol(s, id) : undefined;
          return (
            <label key={pf.id} className="yg-row">
              <span className="yg-tile-ico small">{pf.icon}</span>
              <span style={{ width: 92 }} className="small">
                {pf.name}
              </span>
              <select className="yg-input small grow" value={id ?? ""} onChange={(e) => e.target.value && g.run((x) => Gr.appointShadow(x, pf.id, Number(e.target.value)), "", "click")} aria-label={`Shadow ${pf.name}`} data-testid={`yg-shadow-${pf.id}`}>
                <option value="">Vacant</option>
                {pool.map((x) => (
                  <option key={x.id} value={x.id}>
                    {G.fullName(x)} ({"★".repeat(Math.max(1, Math.round((P.skill(x) - 2) / 1.4)))})
                  </option>
                ))}
              </select>
              {p && <Stars n={P.skill(p)} />}
            </label>
          );
        })}
      </Group>
      <p className="yg-muted small" style={{ margin: "0 4px 8px" }}>
        A strong shadow team helps you at Question Time and in debates, and moves into the real offices if you win.
      </p>
      <Group label={`Opposition day${oppWait ? ` · next in ${oppWait} weeks` : ""}`}>
        <p className="yg-muted small" style={{ margin: "4px 6px" }}>
          Force a vote in the {G.sys(s).lower.short} on a change the government won&apos;t make. It isn&apos;t binding, but winning it embarrasses them.
        </p>
        <label className="yg-row">
          <select
            className="yg-input"
            value={law}
            onChange={(e) => {
              setLaw(e.target.value);
              setOpt(-1);
            }}
            aria-label="Which law"
            data-testid="yg-oppday-law"
          >
            <option value="">Pick a law…</option>
            {G.allLaws(s).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        {l && (
          <label className="yg-row">
            <select className="yg-input" value={opt} onChange={(e) => setOpt(Number(e.target.value))} aria-label="Which option" data-testid="yg-oppday-opt">
              <option value={-1}>Change it to…</option>
              {l.options.map((o, i) =>
                i === s.laws[l.id] ? null : (
                  <option key={i} value={i}>
                    {o.label}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        <div className="yg-actions" style={{ padding: "4px 6px 8px" }}>
          <button type="button" className="yg-btn primary" disabled={!l || opt < 0 || oppWait > 0} onClick={() => g.oppositionDay(law, opt)} data-testid="yg-oppday-go">
            📣 Put the motion
          </button>
        </div>
      </Group>
      <Poach g={g} />
    </div>
  );
}

function Poach({ g }: { g: Game }) {
  const s = g.s!;
  const wait = Math.max(0, Gr.POACH_GAP - (s.week - s.gr.poachAt));
  const by = G.houseBy(s);
  const rivals = G.running(s).filter((p) => p !== s.party && (by[p] ?? 0) > 0) as PartyId[];
  return (
    <Group label={`Win over a member (${money(s, Gr.POACH_COST)} a try${wait ? `, next in ${wait}w` : ""})`} testId="yg-poach">
      {rivals.map((p) => (
        <Row key={p}>
          <Sw c={G.party(s, p).color} />
          <span className="grow">{G.party(s, p).name}</span>
          <span className="r small muted" style={{ width: 70 }}>
            unity {Math.round(s.parties[p].unity)}
          </span>
          <button type="button" className="yg-btn small" disabled={wait > 0 || s.parties[s.party].funds < Gr.POACH_COST} onClick={() => g.poach(p)} data-testid={`yg-poach-${p}`}>
            Approach
          </button>
        </Row>
      ))}
    </Group>
  );
}
