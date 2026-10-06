import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createRng } from "../../engine/rng";
import { COMMITTEES, EVENTS, EVENT, LAW, LAWS, PARTIES, PARTY, type LawGroup, type PartyId } from "../data";
import type { Game, Tab } from "../game";
import * as G from "../sim";
import { Chamber, Hemicycle, Portrait } from "./Chamber";
import { MapView } from "./MapView";

const money = (m: number) => `$${m >= 1000 ? (m / 1000).toFixed(2) + " B" : m.toFixed(1) + " M"}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function useGame(g: Game) {
  useSyncExternalStore(g.subscribe, g.getVersion, g.getVersion);
  return g;
}

function Panel({ title, onClose, children, testId }: { title: string; onClose?: () => void; children: ReactNode; testId?: string }) {
  return (
    <section className="yg-panel" data-testid={testId}>
      <header className="yg-ph">
        {title}
        {onClose && (
          <button type="button" className="yg-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </header>
      <div className="yg-pb">{children}</div>
    </section>
  );
}

function Row({ children, on, onClick, testId }: { children: ReactNode; on?: boolean; onClick?: () => void; testId?: string }) {
  if (onClick)
    return (
      <button type="button" className={`yg-row btn${on ? " on" : ""}`} onClick={onClick} data-testid={testId}>
        {children}
      </button>
    );
  return (
    <div className={`yg-row${on ? " on" : ""}`} data-testid={testId}>
      {children}
    </div>
  );
}

const Bar = ({ v, color }: { v: number; color: string }) => (
  <div className="yg-bar" style={{ flex: 1 }}>
    <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: color }} />
  </div>
);

const Flag = () => (
  <svg width="26" height="18" viewBox="0 0 26 18" aria-label="Avalon">
    <rect width="26" height="18" rx="2" fill="#24408e" />
    <rect y="6" width="26" height="6" fill="#f4f4f4" />
    <circle cx="13" cy="9" r="3.2" fill="#d6a520" />
  </svg>
);

// ------------------------------------------------------------------ panels

function Missions({ g }: { g: Game }) {
  const s = g.s!;
  const you = G.pol(s, s.you)!;
  return (
    <Panel title="Your career" onClose={() => g.setUI({ tab: null })} testId="yg-p-missions">
      <Row>
        <Portrait p={you} size={34} />
        <span>
          {G.fullName(you)}
          <br />
          <small style={{ fontWeight: 700, opacity: 0.7 }}>{G.youHold(s).join(" · ")}</small>
        </span>
      </Row>
      <Row>
        Score <span className="r">{s.score.toLocaleString()}</span>
      </Row>
      <Row>
        Laws passed <span className="r">{s.lawsPassed}</span>
      </Row>
      <Row>
        Elections won <span className="r">{s.electionsWon}</span>
      </Row>
      <p className="yg-label">Missions</p>
      {s.missions.map((m) => (
        <Row key={m.id} testId={`yg-mission-${m.kind}`}>
          <span className="yg-sw" style={{ background: m.done ? "#4caf50" : m.failed ? "#d9534f" : "#e9b52f", borderRadius: "50%" }} />
          <span style={{ flex: 1 }}>{G.missionText(m, s)}</span>
          <span className="r">{m.done ? "✓" : m.failed ? "✗" : `${Math.max(0, m.deadline - s.week)} wk`}</span>
        </Row>
      ))}
      <p className="yg-label">How to play</p>
      <p style={{ margin: "0 4px", fontWeight: 600, color: "#555" }}>
        Each turn is a week. Hold events to win voters, write bills and steer them through committee, the House, the Senate and the President. Vote on bills where you sit. Keep your promises, then win the elections, counted county by county. Press the hourglass (or Enter) to end the week.
      </p>
    </Panel>
  );
}

function WriteBill({ g }: { g: Game }) {
  const s = g.s!;
  const sel = g.ui.law ? LAW[g.ui.law] : null;
  const groups: LawGroup[] = ["Economy", "Services", "Society", "Security", "Government"];
  if (!sel)
    return (
      <Panel title="Write a new bill" onClose={() => g.setUI({ tab: null })} testId="yg-p-write">
        {groups.map((gr) => (
          <div key={gr}>
            <p className="yg-label">{gr}</p>
            {LAWS.filter((l) => l.group === gr).map((l) => {
              const pending = s.bills.some((b) => b.law === l.id && b.stage !== "passed" && b.stage !== "failed");
              return (
                <Row key={l.id} onClick={() => g.setUI({ law: l.id })} testId={`yg-law-${l.id}`}>
                  📄 {l.name}
                  <span className="r" style={{ fontWeight: 700, opacity: 0.7 }}>
                    {pending ? "in progress" : l.options[s.laws[l.id]].label}
                  </span>
                </Row>
              );
            })}
          </div>
        ))}
      </Panel>
    );
  const cur = s.laws[sel.id];
  const pending = s.bills.some((b) => b.law === sel.id && b.stage !== "passed" && b.stage !== "failed");
  const want = (o: number) => {
    const p = PARTY[s.party].pos;
    const d = (x: { e: number; s: number }) => Math.hypot(x.e - p.e, x.s - p.s);
    return d(sel.options[o].pos) < d(sel.options[cur].pos);
  };
  return (
    <Panel title={sel.name} onClose={() => g.setUI({ law: null })} testId="yg-p-law">
      <Row>
        Committee <span className="r" style={{ fontSize: 11 }}>{G.committeeName(sel)}</span>
      </Row>
      <Row>
        Required votes <span className="r">{sel.constitutional ? "Two thirds" : "Majority"}</span>
      </Row>
      <Row>
        Cost <span className="r">{money(G.BILL_COST)}</span>
      </Row>
      <p className="yg-label">Options</p>
      {sel.options.map((o, i) => (
        <Row key={i} on={i === cur}>
          <span style={{ flex: 1 }}>
            {o.label}
            {i !== cur && want(i) && <span className="yg-chip" style={{ marginLeft: 6, background: PARTY[s.party].color, color: "#111" }}>your voters</span>}
          </span>
          {i === cur ? (
            <span className="r">In force</span>
          ) : (
            <button type="button" className="yg-btn" style={{ minHeight: 26 }} disabled={pending || s.parties[s.party].funds < G.BILL_COST} onClick={() => g.writeBill(sel.id, i)} data-testid={`yg-propose-${i}`}>
              Propose
            </button>
          )}
        </Row>
      ))}
      {pending && <p style={{ margin: 6, fontWeight: 700, color: "#8a5a00" }}>A bill on this is already going through.</p>}
      <p className="yg-label">What it does (a year)</p>
      {sel.options.map((o, i) => (
        <p key={i} style={{ margin: "2px 6px", fontWeight: 600, fontSize: 11.5, color: "#555" }}>
          <b>{o.label}:</b> {fxText(o.fx) || "no change from today"}
        </p>
      ))}
    </Panel>
  );
}

function fxText(fx: { happiness?: number; growth?: number; budget?: number; unemployment?: number }) {
  const out: string[] = [];
  if (fx.happiness) out.push(`happiness ${fx.happiness > 0 ? "+" : ""}${fx.happiness.toFixed(1)}`);
  if (fx.growth) out.push(`growth ${fx.growth > 0 ? "+" : ""}${fx.growth.toFixed(2)}%`);
  if (fx.budget) out.push(`budget ${fx.budget > 0 ? "+" : ""}$${Math.round(fx.budget)} B`);
  if (fx.unemployment) out.push(`jobless ${fx.unemployment > 0 ? "+" : ""}${fx.unemployment.toFixed(1)}%`);
  return out.join(", ");
}

function billName(b: G.Bill) {
  return b.budget ? "Budget approval" : `${LAW[b.law].name}: ${LAW[b.law].options[b.option].label}`;
}

function Bills({ g }: { g: Game }) {
  const s = g.s!;
  const b = s.bills.find((x) => x.id === g.ui.bill);
  if (!b)
    return (
      <Panel title="Bills" onClose={() => g.setUI({ tab: null })} testId="yg-p-bills">
        {s.bills.length === 0 && <p style={{ margin: 6, fontWeight: 700, color: "#666" }}>No bills before the legislature. Write one!</p>}
        {s.bills.map((x) => (
          <Row key={x.id} onClick={() => g.setUI({ bill: x.id })} testId={`yg-bill-${x.id}`}>
            <span className="yg-sw" style={{ background: PARTY[x.party].color }} />
            <span style={{ flex: 1 }}>{billName(x)}</span>
            <span className="yg-chip" style={{ background: x.stage === "passed" ? "#9fd3a3" : x.stage === "failed" ? "#eba7a3" : G.youVoteOn(s, x) && x.yourVote === null ? "#f5c96b" : "#cfcfcf" }}>
              {G.stageName(x.stage)}
            </span>
          </Row>
        ))}
      </Panel>
    );
  const live = b.stage !== "passed" && b.stage !== "failed";
  const proj = live ? G.tally(s, b, createRng(b.id * 31 + s.week * 7)) : null;
  const need = live ? Math.floor((proj!.yes + proj!.no) * G.required(b)) + 1 : 0;
  const lawmaker = G.pol(s, b.proposer);
  const mine = G.youVoteOn(s, b) && live;
  const instit = b.stage === "committee" ? `Committee ${COMMITTEES[(LAW[b.law]?.committee ?? 1) - 1]}` : b.stage === "house" ? "House of Representatives" : b.stage === "senate" ? "Senate" : b.stage === "president" ? "The President" : G.stageName(b.stage);
  const btn = (v: -1 | 0 | 1, label: string, n: number | undefined, cls: string) => (
    <button type="button" className={`yg-btn wide ${cls}`} style={{ justifyContent: "space-between", marginBottom: 4, outline: b.yourVote === v ? "3px solid #f5b335" : undefined }} disabled={!mine} onClick={() => g.vote(b.id, v)} data-testid={`yg-vote-${label.toLowerCase()}`}>
      <span>{label}</span>
      <span>{n ?? ""}</span>
    </button>
  );
  return (
    <Panel title={live ? "Vote to approve new bill" : "Bill"} onClose={() => g.setUI({ bill: null })} testId="yg-p-vote">
      <p className="yg-label">Institution</p>
      <Row>{instit}</Row>
      <p className="yg-label">Lawmaker</p>
      <Row>
        <Portrait p={lawmaker} />
        {lawmaker ? G.fullName(lawmaker) : "—"} <span className="r">{PARTY[b.party].short}</span>
      </Row>
      <p className="yg-label">Bill</p>
      <Row>📄 {billName(b)}</Row>
      {live && (
        <>
          <Row>
            System <span className="r">Open vote</span>
          </Row>
          <Row>
            Presence <span className="r">{G.voters(s, b).length}/{G.voters(s, b).length}</span>
          </Row>
          <Row>
            Required votes <span className="r">{b.stage === "president" ? "Signature" : `${need} (${b.budget || !LAW[b.law]?.constitutional ? "ordinary" : "two thirds"})`}</span>
          </Row>
          <Row>
            Vote in <span className="r">{Math.max(0, b.voteAt - s.week)} wk</span>
          </Row>
          <p className="yg-label">{mine ? "Your vote" : "Projected vote"}</p>
          {btn(1, "Approve", proj?.yes, "go")}
          {btn(0, "Abstain", proj?.abstain, "")}
          {btn(-1, "Decline", proj?.no, "no")}
          <p className="yg-label">Lobby the parties ({money(G.LOBBY_COST)} each)</p>
          {PARTIES.filter((p) => p.id !== s.party).map((p) => (
            <Row key={p.id}>
              <span className="yg-sw" style={{ background: p.color }} /> {p.name}
              <button type="button" className="yg-btn" style={{ marginLeft: "auto", minHeight: 24 }} disabled={b.lobbied.includes(p.id) || s.parties[s.party].funds < G.LOBBY_COST} onClick={() => g.lobby(b.id, p.id)} data-testid={`yg-lobby-${p.id}`}>
                {b.lobbied.includes(p.id) ? "Lobbied" : "Lobby"}
              </button>
            </Row>
          ))}
        </>
      )}
      {b.last && (
        <>
          <p className="yg-label">Result in the {G.stageName(b.last.stage)}</p>
          <Row>
            {b.last.passed ? "✅ Passed" : "❌ Rejected"}
            <span className="r">
              {b.last.tally.yes}–{b.last.tally.no} ({b.last.tally.abstain} abstained)
            </span>
          </Row>
        </>
      )}
    </Panel>
  );
}

function Events({ g }: { g: Game }) {
  const s = g.s!;
  const sel = g.ui.event ? EVENT[g.ui.event] : null;
  const c = G.country(s.seed);
  const st = g.ui.state ?? s.homeState;
  const funds = s.parties[s.party].funds;
  const poll = s.polled[st] !== undefined ? G.statePoll(s, st) : null;
  return (
    <Panel title="Create new event" onClose={() => g.setUI({ tab: null, event: null })} testId="yg-p-events">
      <div className="yg-grid">
        {EVENTS.map((e) => (
          <button key={e.id} type="button" className="yg-tile" title={e.name} aria-pressed={g.ui.event === e.id} disabled={s.usedEvents.includes(e.id)} onClick={() => g.setUI({ event: e.id })} data-testid={`yg-ev-${e.id}`}>
            {e.icon}
          </button>
        ))}
      </div>
      {sel && (
        <>
          <p className="yg-label">{sel.name}</p>
          <p style={{ margin: "0 6px 6px", fontWeight: 600, color: "#555" }}>{sel.desc}</p>
          <Row>
            Cost <span className="r">{money(sel.cost)}</span>
          </Row>
          <Row>
            Where <span className="r">{sel.scope === "state" ? c.states[st].name : sel.scope === "national" ? "Nationwide" : "The party"}</span>
          </Row>
          {sel.scope === "state" && <p style={{ margin: "0 6px 6px", fontWeight: 700, color: "#666", fontSize: 11.5 }}>Click a state on the map to choose where.</p>}
          {sel.risk ? (
            <Row>
              Risk <span className="r">{Math.round(sel.risk * 100)}%</span>
            </Row>
          ) : null}
          <button type="button" className="yg-btn go wide" disabled={funds < sel.cost || s.usedEvents.includes(sel.id)} onClick={() => g.holdEvent(sel.id, st)} data-testid="yg-hold">
            {s.usedEvents.includes(sel.id) ? "Held this week" : "Hold the event"}
          </button>
        </>
      )}
      {poll && (
        <>
          <p className="yg-label">
            Poll: {c.states[st].name} ({G.dateLabel(s.polled[st])})
          </p>
          {(Object.entries(poll) as [PartyId, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([id, v]) => (
              <Row key={id}>
                <span className="yg-sw" style={{ background: PARTY[id].color }} /> {PARTY[id].short}
                <Bar v={v * 2} color={PARTY[id].color} />
                <span style={{ width: 44, textAlign: "right" }}>{pct(v)}</span>
              </Row>
            ))}
        </>
      )}
    </Panel>
  );
}

function Parliament({ g }: { g: Game }) {
  const s = g.s!;
  const [which, setWhich] = useState<"house" | "senate">("house");
  const seats = which === "house" ? G.houseBy(s) : G.senateBy(s);
  const pres = G.pol(s, s.president);
  const c = G.country(s.seed);
  return (
    <Panel title={which === "house" ? "House of Representatives" : "Senate"} onClose={() => g.setUI({ tab: null })} testId="yg-p-chamber">
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        <button type="button" className="yg-btn" style={{ flex: 1, background: which === "house" ? "#3d3d3d" : undefined }} onClick={() => setWhich("house")}>
          House
        </button>
        <button type="button" className="yg-btn" style={{ flex: 1, background: which === "senate" ? "#3d3d3d" : undefined }} onClick={() => setWhich("senate")}>
          Senate
        </button>
      </div>
      <div style={{ display: "grid", placeItems: "center" }}>
        <Hemicycle seats={seats} />
      </div>
      {(Object.entries(seats) as [PartyId, number][])
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => (
          <Row key={id}>
            <span className="yg-sw" style={{ background: PARTY[id].color }} /> {PARTY[id].name}
            <span className="r">{n}</span>
          </Row>
        ))}
      <Row>
        Majority <span className="r">{Math.floor((which === "house" ? G.HOUSE_SEATS : s.senate.length) / 2) + 1}</span>
      </Row>
      <p className="yg-label">The President</p>
      <Row>
        <Portrait p={pres} /> {pres ? G.fullName(pres) : "—"} <span className="r">{pres ? PARTY[pres.party].short : ""}</span>
      </Row>
      <p className="yg-label">Governors</p>
      {(Object.entries(Object.fromEntries(G.PARTY_IDS.map((id) => [id, s.governors.filter((x) => G.pol(s, x)?.party === id).length]))) as [PartyId, number][])
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => (
          <Row key={id}>
            <span className="yg-sw" style={{ background: PARTY[id].color }} /> {PARTY[id].name}
            <span className="r">
              {n}/{c.states.length}
            </span>
          </Row>
        ))}
      <p className="yg-label">Committees</p>
      {COMMITTEES.map((name) => (
        <Row key={name}>{name}</Row>
      ))}
    </Panel>
  );
}

function Parties({ g }: { g: Game }) {
  const s = g.s!;
  const poll = G.nationalPoll(s);
  const house = G.houseBy(s);
  return (
    <Panel title="Parties" onClose={() => g.setUI({ tab: null })} testId="yg-p-parties">
      {PARTIES.map((p) => {
        const ps = s.parties[p.id];
        const leader = G.pol(s, ps.leader);
        return (
          <div key={p.id} style={{ marginBottom: 8, borderRadius: 8, background: "#dcdcdc", padding: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 900 }}>
              <span className="yg-sw" style={{ background: p.color }} /> {p.name} ({p.short})
              <span style={{ marginLeft: "auto" }}>{pct(poll[p.id])}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, fontWeight: 700, fontSize: 11.5 }}>
              <Portrait p={leader} size={22} /> {leader ? G.fullName(leader) : ""} · {p.ideology}
              <span style={{ marginLeft: "auto" }}>{house[p.id]} seats</span>
            </div>
            {p.id !== s.party && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, fontSize: 11, fontWeight: 800 }}>
                Relations with you <Bar v={(ps.relations[s.party] + 100) / 200} color={ps.relations[s.party] >= 0 ? "#4caf50" : "#d9534f"} /> {Math.round(ps.relations[s.party])}
              </div>
            )}
          </div>
        );
      })}
    </Panel>
  );
}

function Compass({ s }: { s: G.GameState }) {
  return (
    <svg width="100%" viewBox="0 0 120 120" style={{ maxWidth: 220 }} aria-label="Political compass">
      <rect x="10" y="10" width="100" height="100" fill="#f5f5f5" stroke="#bbb" />
      <line x1="60" y1="10" x2="60" y2="110" stroke="#ccc" />
      <line x1="10" y1="60" x2="110" y2="60" stroke="#ccc" />
      <text x="60" y="8" fontSize="6" textAnchor="middle" fill="#777">Conservative</text>
      <text x="60" y="118" fontSize="6" textAnchor="middle" fill="#777">Liberal</text>
      <text x="6" y="62" fontSize="6" textAnchor="middle" fill="#777" transform="rotate(-90 6 62)">Left</text>
      <text x="115" y="62" fontSize="6" textAnchor="middle" fill="#777" transform="rotate(90 115 62)">Right</text>
      {PARTIES.map((p) => (
        <g key={p.id}>
          <circle cx={60 + p.pos.e * 48} cy={60 - p.pos.s * 48} r={p.id === s.party ? 6 : 4.5} fill={p.color} stroke="#333" strokeWidth={p.id === s.party ? 1.4 : 0.6} />
          <text x={60 + p.pos.e * 48} y={60 - p.pos.s * 48 - 7} fontSize="5.5" textAnchor="middle" fontWeight="900" fill="#333">
            {p.short}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MyParty({ g }: { g: Game }) {
  const s = g.s!;
  const p = PARTY[s.party];
  const ps = s.parties[s.party];
  const house = G.houseBy(s)[s.party];
  const senate = G.senateBy(s)[s.party];
  const govs = s.governors.filter((x) => G.pol(s, x)?.party === s.party).length;
  const mayors = s.mayors.filter((m) => G.pol(s, m.holder)?.party === s.party).length;
  const c = G.country(s.seed);
  return (
    <Panel title={`${p.name} – ${p.short}`} onClose={() => g.setUI({ tab: null })} testId="yg-p-party">
      <Row>
        Secretary <span className="r">{G.fullName(G.pol(s, s.you)!)}</span>
      </Row>
      <Row>
        Ideology <span className="r">{p.ideology}</span>
      </Row>
      <Row>
        Headquarters <span className="r">{c.sections[c.capital].town}</span>
      </Row>
      <Row>
        Members <span className="r">{ps.members.toLocaleString()}</span>
      </Row>
      <Row>
        Funds <span className="r">{money(ps.funds)}</span>
      </Row>
      <Row>
        Unity <Bar v={ps.unity / 100} color="#5b8def" /> <span>{Math.round(ps.unity)}</span>
      </Row>
      <Row>
        Government <span className="r">{G.pol(s, s.president)?.party === s.party ? "In government" : "Opposition"}</span>
      </Row>
      <Row>
        House <Bar v={house / G.HOUSE_SEATS} color={p.color} /> <span>{house}/{G.HOUSE_SEATS}</span>
      </Row>
      <Row>
        Senate <Bar v={senate / Math.max(1, s.senate.length)} color={p.color} /> <span>{senate}/{s.senate.length}</span>
      </Row>
      <Row>
        Governors <Bar v={govs / c.states.length} color={p.color} /> <span>{govs}/{c.states.length}</span>
      </Row>
      <Row>
        Mayors <Bar v={mayors / Math.max(1, s.mayors.length)} color={p.color} /> <span>{mayors}/{s.mayors.length}</span>
      </Row>
      <p className="yg-label">Where the parties stand</p>
      <div style={{ display: "grid", placeItems: "center" }}>
        <Compass s={s} />
      </div>
    </Panel>
  );
}

function Country({ g }: { g: Game }) {
  const s = g.s!;
  const c = G.country(s.seed);
  const st = s.stats;
  const pres = G.pol(s, s.president);
  return (
    <Panel title="Federation of Avalon" onClose={() => g.setUI({ tab: null })} testId="yg-p-country">
      <Row>
        System <span className="r">Presidential republic, federation</span>
      </Row>
      <Row>
        Capital <span className="r">{c.sections[c.capital].town}</span>
      </Row>
      <Row>
        President <span className="r">{pres ? G.fullName(pres) : "—"}</span>
      </Row>
      <Row>
        Population <span className="r">{(c.pop / 1e6).toFixed(1)} M</span>
      </Row>
      <Row>
        States <span className="r">{c.states.length}</span>
      </Row>
      <Row>
        Happiness <span className="r">{st.happiness.toFixed(1)} {st.happiness >= 20 ? "😊" : "😟"}</span>
      </Row>
      <Row>
        Government approval <span className="r">{st.approval.toFixed(0)}%</span>
      </Row>
      <Row>
        GDP <span className="r">${st.gdp.toFixed(2)} T</span>
      </Row>
      <Row>
        GDP per capita <span className="r">${((st.gdp * 1e12) / c.pop / 1000).toFixed(1)} K</span>
      </Row>
      <Row>
        Growth <span className="r">{st.growth.toFixed(2)}%</span>
      </Row>
      <Row>
        Unemployment <span className="r">{st.unemployment.toFixed(1)}%</span>
      </Row>
      <Row>
        Budget <span className="r">{st.budget >= 0 ? "+" : "–"}${Math.abs(st.budget).toFixed(0)} B / yr</span>
      </Row>
      <Row>
        Debt <span className="r">${(st.debt / 1000).toFixed(2)} T</span>
      </Row>
      <p className="yg-label">Laws in force</p>
      {LAWS.map((l) => (
        <Row key={l.id}>
          {l.name} <span className="r">{l.options[s.laws[l.id]].label}</span>
        </Row>
      ))}
      <p className="yg-label">States</p>
      {c.states.map((x) => (
        <Row key={x.id} on={g.ui.state === x.id} onClick={() => g.setUI({ state: x.id })}>
          {x.name} <span className="r">{(x.pop / 1e6).toFixed(1)} M</span>
        </Row>
      ))}
    </Panel>
  );
}

function News({ g }: { g: Game }) {
  const s = g.s!;
  return (
    <Panel title="News" onClose={() => g.setUI({ tab: null })} testId="yg-p-news">
      {s.news.map((n, i) => (
        <div key={i} style={{ marginBottom: 4, borderRadius: 6, background: "#dcdcdc", padding: "5px 8px", fontWeight: 700, borderLeft: `4px solid ${n.tone > 0 ? "#4caf50" : n.tone < 0 ? "#d9534f" : "#9e9e9e"}` }}>
          <small style={{ opacity: 0.6 }}>{G.dateLabel(n.week)}</small>
          <div>{n.text}</div>
        </div>
      ))}
    </Panel>
  );
}

// ------------------------------------------------------------------ election night

function ElectionPanel({ g }: { g: Game }) {
  const s = g.s!;
  const e = s.election!;
  const c = G.country(s.seed);
  const P = G.PARTY_IDS.length;
  const k = g.ui.count;
  const counted = Math.floor(Math.min(1, k / 0.45) * e.order.length);
  const reported = Math.floor(Math.max(0, (k - 0.45) / 0.55) * e.order.length);
  const tot = G.PARTY_IDS.map(() => 0);
  let voters = 0;
  for (let i = 0; i < reported; i++) {
    const id = e.order[i];
    const v = c.sections[id].pop * e.turnout[id];
    voters += v;
    for (let p = 0; p < P; p++) tot[p] += e.shares[id * P + p] * v;
  }
  let turnoutAcc = 0;
  let popAcc = 0;
  for (let i = 0; i < counted; i++) {
    const id = e.order[i];
    turnoutAcc += c.sections[id].pop * e.turnout[id];
    popAcc += c.sections[id].pop;
  }
  const sum = tot.reduce((a, b) => a + b, 0) || 1;
  const done = k >= 1;
  const rows = G.PARTY_IDS.map((id, i) => ({ id, share: tot[i] / sum })).sort((a, b) => (done ? e.houseSeats[b.id] - e.houseSeats[a.id] : b.share - a.share));
  return (
    <Panel title={e.kind === "general" ? "General elections" : "Midterm elections"} testId="yg-p-election">
      <Row>
        Districts <span className="r">{G.country(s.seed).states.length} states</span>
      </Row>
      <Row>
        Sections{" "}
        <span className="r">
          {reported > 0 ? reported : counted} / {e.order.length}
        </span>
      </Row>
      <Row>
        Turnout <span className="r">{popAcc ? pct(turnoutAcc / popAcc) : "—"}</span>
      </Row>
      <Row>
        Voters <span className="r">{Math.round(voters || turnoutAcc).toLocaleString()} 👥</span>
      </Row>
      {rows.map((r) => (
        <div key={r.id} style={{ marginBottom: 4, borderRadius: 6, background: "#dcdcdc", padding: "4px 8px", fontWeight: 800 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="yg-sw" style={{ background: PARTY[r.id].color }} /> {PARTY[r.id].short}
            {done && (
              <span style={{ marginLeft: "auto" }}>
                {e.houseSeats[r.id]}{" "}
                <span style={{ color: e.houseSeats[r.id] >= e.prevHouse[r.id] ? "#2e7d32" : "#c62828" }}>
                  {e.houseSeats[r.id] >= e.prevHouse[r.id] ? "▲" : "▼"}
                  {Math.abs(e.houseSeats[r.id] - e.prevHouse[r.id])}
                </span>
              </span>
            )}
          </div>
          {reported > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <Bar v={r.share * 2} color={PARTY[r.id].color} /> {pct(r.share)}
            </div>
          )}
        </div>
      ))}
      {done && e.president && (
        <Row on>
          🏛️ President: {e.president.name} ({PARTY[e.president.party].short}) {Math.round(e.president.share * 100)}%{e.president.runoff ? " (run-off)" : ""}
        </Row>
      )}
      <button type="button" className={`yg-btn wide ${done ? "go" : ""}`} style={{ marginTop: 6 }} onClick={() => (done ? g.closeElection() : g.setUI({ count: 1 }))} data-testid={done ? "yg-election-continue" : "yg-election-skip"}>
        {done ? "Continue" : "Skip the count"}
      </button>
    </Panel>
  );
}

// ------------------------------------------------------------------ the frame

function TopBar({ g }: { g: Game }) {
  const s = g.s!;
  const ps = s.parties[s.party];
  const modes = ["politics", "states", "support"] as const;
  return (
    <header className="yg-top" data-testid="yg-top">
      <Flag />
      <span className="yg-stat" title="Happiness">
        😊 <b>{s.stats.happiness.toFixed(1)}</b>
      </span>
      <span className="yg-stat" title="Government approval">
        👍 <b>{s.stats.approval.toFixed(0)}%</b>
      </span>
      <span className="yg-stat opt" title="Growth">
        📈 <b>{s.stats.growth.toFixed(1)}%</b>
      </span>
      <span className="yg-stat" title="Party funds" data-testid="yg-funds">
        💰 <b>{money(ps.funds)}</b>
      </span>
      <span className="yg-stat opt" title="Party members">
        👥 <b>{(ps.members / 1000).toFixed(0)}k</b>
      </span>
      <span className="yg-stat opt" title="Party unity">
        🤝 <b>{Math.round(ps.unity)}</b>
      </span>
      <span className="yg-stat" title="Your House seats">
        🏛️ <b>{G.houseBy(s)[s.party]}</b>
      </span>
      <span style={{ flex: 1 }} />
      <button type="button" className="yg-iconbtn" title={`Map: ${g.ui.mapMode}`} onClick={() => g.setUI({ mapMode: modes[(modes.indexOf(g.ui.mapMode) + 1) % modes.length], view: "map" })} data-testid="yg-mapmode">
        ⏷
      </button>
      <button type="button" className="yg-iconbtn" title="Your career" onClick={() => g.setUI({ tab: "missions" })}>
        ?
      </button>
      <button
        type="button"
        className="yg-iconbtn"
        title="Retire (end your career)"
        onClick={() => {
          if (window.confirm("Retire now? Your score becomes final.")) g.retire();
        }}
        data-testid="yg-retire"
      >
        ⚙
      </button>
    </header>
  );
}

const TABS: { id: Exclude<Tab, null>; icon: string; label: string }[] = [
  { id: "missions", icon: "🎯", label: "Your career" },
  { id: "write", icon: "📝", label: "Write a bill" },
  { id: "bills", icon: "📜", label: "Bills and votes" },
  { id: "events", icon: "🎪", label: "Create an event" },
  { id: "chamber", icon: "🏛️", label: "Parliament" },
  { id: "parties", icon: "🧭", label: "Parties" },
  { id: "party", icon: "🚩", label: "Your party" },
  { id: "country", icon: "🌍", label: "Country" },
  { id: "news", icon: "📰", label: "News" },
];

function Rail({ g }: { g: Game }) {
  const s = g.s!;
  const toVote = s.bills.some((b) => b.stage !== "passed" && b.stage !== "failed" && G.youVoteOn(s, b) && b.yourVote === null);
  const freshNews = s.news[0]?.week === s.week - 1;
  return (
    <nav className="yg-rail" aria-label="Panels">
      {TABS.map((t) => (
        <button key={t.id} type="button" className="yg-iconbtn" title={t.label} aria-label={t.label} aria-pressed={g.ui.tab === t.id} onClick={() => g.setUI({ tab: g.ui.tab === t.id ? null : t.id, bill: null, law: null })} data-testid={`yg-tab-${t.id}`}>
          {t.icon}
          {((t.id === "bills" && toVote) || (t.id === "news" && freshNews)) && <span className="yg-dot" />}
        </button>
      ))}
    </nav>
  );
}

function Timeline({ g }: { g: Game }) {
  const s = g.s!;
  const span = 26;
  const marks: { w: number; icon: string; title: string }[] = [];
  const el = G.nextElectionWeek(s);
  if (el - s.week < span) marks.push({ w: el, icon: "🗳️", title: `${G.electionKind(el + 1) === "general" ? "General" : "Midterm"} election` });
  for (let w = s.week; w < s.week + span; w++) if (G.weekOf(w) === 40) marks.push({ w, icon: "💰", title: "Budget" });
  for (const b of s.bills) if (b.stage !== "passed" && b.stage !== "failed") marks.push({ w: b.voteAt, icon: G.youVoteOn(s, b) ? "✋" : "📜", title: billName(b) });
  for (const m of s.missions) if (!m.done && !m.failed && m.deadline - s.week < span) marks.push({ w: m.deadline, icon: "🎯", title: G.missionText(m, s) });
  return (
    <div className="yg-timeline" aria-label="Coming up">
      {Array.from({ length: span }, (_, i) => (
        <span key={i} className="yg-tick" style={{ left: `${(i / span) * 100}%` }} />
      ))}
      {marks.map((m, i) => (
        <span key={i} className="yg-mark" title={`${G.dateLabel(m.w)} · ${m.title}`} style={{ left: `${((m.w - s.week + 0.5) / span) * 100}%` }}>
          {m.icon}
        </span>
      ))}
    </div>
  );
}

function BottomBar({ g }: { g: Game }) {
  const s = g.s!;
  const ps = s.parties[s.party];
  return (
    <footer className="yg-bottom">
      <Portrait p={G.pol(s, s.you)} size={38} />
      <span className="yg-stat" style={{ background: "#6a6a6a", color: "#fff" }}>
        💰 {money(ps.funds)}
      </span>
      <button type="button" className="yg-iconbtn" aria-pressed={g.ui.view === "map"} title="Map" onClick={() => g.setUI({ view: "map" })} data-testid="yg-view-map">
        🗺️
      </button>
      <button type="button" className="yg-iconbtn" aria-pressed={g.ui.view === "chamber"} title="Chamber" onClick={() => g.setUI({ view: "chamber" })} data-testid="yg-view-chamber">
        🏛️
      </button>
      <span className="yg-date" data-testid="yg-date">
        {G.dateLabel(s.week)}
      </span>
      <Timeline g={g} />
      <button type="button" className="yg-hourglass" title="End the week (Enter)" disabled={!!s.election || s.over} onClick={() => g.endTurn()} data-testid="yg-end-turn">
        ⌛
      </button>
    </footer>
  );
}

function Title({ g }: { g: Game }) {
  const [party, setParty] = useState<PartyId>("ctr");
  return (
    <div className="yg-title" data-testid="yg-title">
      <div className="yg-card">
        <div style={{ padding: "18px 20px 10px", background: "#5a5a5a", color: "#fff", borderRadius: "14px 14px 0 0" }}>
          <h1>YourGov</h1>
          <p style={{ margin: "4px 0 0", fontWeight: 700, opacity: 0.85 }}>Lead a party. Write the laws. Win the country, county by county.</p>
        </div>
        <div style={{ padding: 14 }}>
          <p className="yg-label">Choose your party</p>
          {PARTIES.map((p) => (
            <Row key={p.id} on={party === p.id} onClick={() => setParty(p.id)} testId={`yg-party-${p.id}`}>
              <span className="yg-sw" style={{ background: p.color, width: 16, height: 16 }} />
              <span style={{ flex: 1 }}>
                {p.name} <small style={{ opacity: 0.7 }}>· {p.ideology}</small>
              </span>
            </Row>
          ))}
          <p style={{ margin: "8px 4px", fontWeight: 600, color: "#555" }}>
            You start as your party&apos;s secretary in the Federation of Avalon: sixteen states, hundreds of counties, a House, a Senate and a President. Every week, hold events, write and vote on bills, and keep your promises. Every two years the country votes. Your score grows with every law you pass, seat you win and promise you keep, over a twenty-year career.
          </p>
          <button type="button" className="yg-btn go wide" style={{ minHeight: 42, fontSize: 15 }} onClick={() => g.newGame(party)} data-testid="yg-start">
            Begin your career
          </button>
        </div>
      </div>
    </div>
  );
}

function GameOver({ g }: { g: Game }) {
  const s = g.s!;
  return (
    <div className="yg-title" style={{ background: "#0006", zIndex: 6 }} data-testid="yg-over">
      <div className="yg-card" style={{ padding: 18 }}>
        <h1>Career over</h1>
        <p style={{ fontWeight: 700 }}>
          {G.fullName(G.pol(s, s.you)!)} · {PARTY[s.party].name}
        </p>
        <Row>
          Final score <span className="r">{s.score.toLocaleString()}</span>
        </Row>
        <Row>
          Laws passed <span className="r">{s.lawsPassed}</span>
        </Row>
        <Row>
          Presidential elections won <span className="r">{s.electionsWon}</span>
        </Row>
        <Row>
          Budgets approved <span className="r">{s.budgetPassed}</span>
        </Row>
        <button type="button" className="yg-btn go wide" style={{ marginTop: 10 }} onClick={() => g.quit()} data-testid="yg-again">
          Start a new career
        </button>
      </div>
    </div>
  );
}

export function App({ game }: { game: Game }) {
  const g = useGame(game);
  const s = g.s;
  // The election count runs over about twelve seconds.
  const counting = !!s?.election && g.ui.count < 1;
  useEffect(() => {
    if (!counting) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!g.paused) g.setUI({ count: Math.min(1, g.ui.count + dt / 12) });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [counting, g]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        g.endTurn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [g]);
  useEffect(() => {
    if (!g.ui.toast) return;
    const t = setTimeout(() => g.setUI({ toast: null }), 3200);
    return () => clearTimeout(t);
  }, [g, g.ui.toast]);
  // The chamber shows the last House or Senate vote (or the one on the bill you have open).
  const shown = s ? (s.bills.find((x) => x.id === g.ui.bill) ?? [...s.bills].reverse().find((x) => x.last && (x.last.stage === "house" || x.last.stage === "senate"))) : undefined;
  const chamberVotes = shown?.last?.tally.by ?? null;
  if (!s) return <div className="yg">{<Title g={g} />}</div>;
  const tab = s.election ? null : g.ui.tab;
  const panel =
    s.election ? (
      <ElectionPanel g={g} />
    ) : tab === "missions" ? (
      <Missions g={g} />
    ) : tab === "write" ? (
      <WriteBill g={g} />
    ) : tab === "bills" ? (
      <Bills g={g} />
    ) : tab === "events" ? (
      <Events g={g} />
    ) : tab === "chamber" ? (
      <Parliament g={g} />
    ) : tab === "parties" ? (
      <Parties g={g} />
    ) : tab === "party" ? (
      <MyParty g={g} />
    ) : tab === "country" ? (
      <Country g={g} />
    ) : tab === "news" ? (
      <News g={g} />
    ) : null;
  const view = s.election ? "map" : g.ui.view;
  return (
    <div className="yg" data-testid="yourgov">
      <TopBar g={g} />
      <div className="yg-main">
        <Rail g={g} />
        {panel}
        <div className="yg-view" style={{ background: view === "chamber" ? "#e6e6e6" : undefined }}>
          {view === "map" ? (
            <MapView s={s} mode={g.ui.mapMode} selected={g.ui.state} count={s.election ? g.ui.count : null} onSelect={(st) => g.setUI({ state: st })} />
          ) : (
            <Chamber s={s} house="house" votes={chamberVotes} />
          )}
          {!s.election && (
            <div className="yg-missions" aria-label="Missions">
              {s.missions.slice(0, 6).map((m) => (
                <div key={m.id} className={`yg-mission${m.done ? " done" : m.failed ? " failed" : ""}`}>
                  <i /> {G.missionText(m, s)} ({Math.max(0, m.deadline - s.week)})
                </div>
              ))}
            </div>
          )}
          {!s.election && view === "map" && g.ui.state !== null && (
            <div className="yg-mapctl">
              <span className="yg-chip" style={{ background: "#ffffffd0", fontSize: 12 }}>
                📍 {G.country(s.seed).states[g.ui.state].name}
              </span>
            </div>
          )}
          {!s.election && !s.over && (
            <button type="button" className="yg-endturn" onClick={() => g.endTurn()}>
              End turn ⌛
            </button>
          )}
          {g.ui.toast && <div className={`yg-toast ${g.ui.toast.tone > 0 ? "good" : g.ui.toast.tone < 0 ? "bad" : ""}`}>{g.ui.toast.text}</div>}
        </div>
      </div>
      <BottomBar g={g} />
      {s.over && <GameOver g={g} />}
    </div>
  );
}
