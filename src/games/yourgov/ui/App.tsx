import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createRng } from "../../engine/rng";
import { COMMITTEES, EVENTS, EVENT, LAW_GROUPS, PARTIES, PARTY, type LawDef, type PartyId } from "../data";
import type { Game, Tab } from "../game";
import * as G from "../sim";
import { Stage3D } from "../render/stage";
import { Portrait } from "./Chamber";
import { Hemicycle, PollChart, Trend } from "./charts";
import { GlassDefs, canRefract, trackSheen } from "./glass";
import { Icon } from "./icons";
import { LawStudio } from "./LawStudio";
import type { MapMode } from "./mapColors";
import { Scene } from "./Scene";

const money = (m: number) => `$${m >= 1000 ? (m / 1000).toFixed(2) + " B" : m.toFixed(1) + " M"}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function useGame(g: Game) {
  useSyncExternalStore(g.subscribe, g.getVersion, g.getVersion);
  return g;
}

// ------------------------------------------------------------------ building blocks

function Sheet({ title, eyebrow, onClose, onBack, children, testId, actions }: { title: string; eyebrow?: string; onClose?: () => void; onBack?: () => void; children: ReactNode; testId?: string; actions?: ReactNode }) {
  return (
    <section className="yg-glass yg-sheet" data-testid={testId} aria-label={title}>
      <header className="yg-sheet-head">
        {onBack && (
          <button type="button" className="yg-btn icon small" onClick={onBack} aria-label="Back">
            <Icon name="back" size={18} />
          </button>
        )}
        <div className="yg-sheet-title">
          {eyebrow && <p className="yg-eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        {actions}
        {onClose && (
          <button type="button" className="yg-btn icon small" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        )}
      </header>
      <div className="yg-sheet-body">{children}</div>
    </section>
  );
}

function Row({ children, on, onClick, testId, className = "" }: { children: ReactNode; on?: boolean; onClick?: () => void; testId?: string; className?: string }) {
  if (onClick)
    return (
      <button type="button" className={`yg-row btn${on ? " on" : ""} ${className}`} onClick={onClick} data-testid={testId}>
        {children}
      </button>
    );
  return (
    <div className={`yg-row${on ? " on" : ""} ${className}`} data-testid={testId}>
      {children}
    </div>
  );
}

const Group = ({ label, children }: { label?: string; children: ReactNode }) => (
  <div className="yg-group">
    {label && <p className="yg-label">{label}</p>}
    <div className="yg-group-box">{children}</div>
  </div>
);

const Bar = ({ v, color }: { v: number; color: string }) => (
  <span className="yg-bar">
    <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: color }} />
  </span>
);

const Sw = ({ c }: { c: string }) => <span className="yg-sw" style={{ background: c }} />;

const Flag = ({ size = 22 }: { size?: number }) => (
  <svg width={size * 1.45} height={size} viewBox="0 0 29 20" aria-label="Flag of Avalon" style={{ borderRadius: 4, flex: "none", boxShadow: "0 0 0 1px rgba(255,255,255,.25)" }}>
    <rect width="29" height="20" fill="#24408e" />
    <rect y="7" width="29" height="6" fill="#f4f4f4" />
    <circle cx="14.5" cy="10" r="3.4" fill="#d6a520" />
  </svg>
);

function Seg<T extends string>({ value, options, onChange, label, testId }: { value: T; options: { id: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string; testId?: string }) {
  return (
    <div className="yg-seg" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} title={o.title} onClick={() => onChange(o.id)} data-testid={testId ? `${testId}-${o.id}` : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function fxText(fx: { happiness?: number; growth?: number; budget?: number; unemployment?: number }) {
  const out: string[] = [];
  if (fx.happiness) out.push(`happiness ${fx.happiness > 0 ? "+" : ""}${fx.happiness.toFixed(1)}`);
  if (fx.growth) out.push(`growth ${fx.growth > 0 ? "+" : ""}${fx.growth.toFixed(2)}%`);
  if (fx.budget) out.push(`budget ${fx.budget > 0 ? "+" : ""}$${Math.round(fx.budget)} B`);
  if (fx.unemployment) out.push(`jobless ${fx.unemployment > 0 ? "+" : ""}${fx.unemployment.toFixed(1)}%`);
  return out.join(" · ");
}

function billName(s: G.GameState, b: G.Bill) {
  if (b.budget) return "Budget approval";
  const l = G.lawOf(s, b.law);
  return l ? `${l.name}: ${l.options[b.option].label}` : "A repealed law";
}

const live = (b: G.Bill) => b.stage !== "passed" && b.stage !== "failed";
const posDist = (a: { e: number; s: number }, b: { e: number; s: number }) => Math.hypot(a.e - b.e, a.s - b.s);

// ------------------------------------------------------------------ panels

function Career({ g }: { g: Game }) {
  const s = g.s!;
  const you = G.pol(s, s.you)!;
  const steps = [
    { done: s.usedEvents.length > 0 || s.week > 3, text: "Hold an event (a rally, an interview…) to win voters" },
    { done: s.bills.some((b) => b.proposer === s.you), text: "Write a bill to change a law" },
    { done: s.custom.length > 0, text: "Draft a law of your own in the law studio" },
    { done: s.week > 2, text: "End the week with the hourglass (or Enter)" },
  ];
  return (
    <Sheet title="Your career" eyebrow={G.youHold(s).join(" · ")} onClose={() => g.setUI({ tab: null })} testId="yg-p-missions">
      <div className="yg-profile">
        <Portrait p={you} size={52} />
        <div>
          <b>{G.fullName(you)}</b>
          <span className="yg-muted">
            {PARTY[s.party].name} · age {you.age + G.yearOf(s.week) - 2046}
          </span>
        </div>
      </div>
      <div className="yg-tiles">
        <div className="yg-tile-stat">
          <span>Score</span>
          <b>{s.score.toLocaleString()}</b>
        </div>
        <div className="yg-tile-stat">
          <span>Laws passed</span>
          <b>{s.lawsPassed}</b>
        </div>
        <div className="yg-tile-stat">
          <span>Elections won</span>
          <b>{s.electionsWon}</b>
        </div>
      </div>
      {g.prefs.tips && (
        <Group label="First steps">
          {steps.map((x, i) => (
            <Row key={i} className={x.done ? "done" : ""}>
              <span className={`yg-check${x.done ? " on" : ""}`}>{x.done && <Icon name="check" size={13} stroke={3} />}</span>
              <span className="grow">{x.text}</span>
            </Row>
          ))}
          <Row onClick={() => g.setPrefs({ tips: false })}>
            <span className="yg-muted grow">Hide these tips</span>
          </Row>
        </Group>
      )}
      <Group label="Missions">
        {s.missions.map((m) => (
          <Row key={m.id} testId={`yg-mission-${m.kind}`}>
            <span className={`yg-dot ${m.done ? "good" : m.failed ? "bad" : "warn"}`} />
            <span className="grow">{G.missionText(m, s)}</span>
            <span className="r">{m.done ? "Done" : m.failed ? "Failed" : `${Math.max(0, m.deadline - s.week)} wk`}</span>
          </Row>
        ))}
      </Group>
    </Sheet>
  );
}

/** Who would vote to move a law from today's option to another (by where the parties stand). */
function backersOf(l: LawDef, from: number, to: number) {
  return PARTIES.filter((p) => posDist(l.options[from].pos, p.pos) - posDist(l.options[to].pos, p.pos) > 0.05);
}

function WriteBill({ g }: { g: Game }) {
  const s = g.s!;
  const [q, setQ] = useState("");
  const sel = g.ui.law ? G.lawOf(s, g.ui.law) : null;
  if (!sel) {
    const laws = G.allLaws(s).filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()));
    const groups: { label: string; laws: LawDef[] }[] = [{ label: "Your laws", laws: laws.filter((l) => l.custom) }, ...LAW_GROUPS.map((gr) => ({ label: gr, laws: laws.filter((l) => l.group === gr && !l.custom) }))];
    return (
      <Sheet title="Write a new bill" eyebrow="The lawbook" onClose={() => g.setUI({ tab: null })} testId="yg-p-write">
        <button type="button" className="yg-cta" onClick={() => g.setUI({ studio: { id: null } })} disabled={s.custom.length >= G.CUSTOM_MAX} data-testid="yg-new-law">
          <span className="yg-cta-icon">
            <Icon name="sparkle" />
          </span>
          <span>
            <b>Draft a law of your own</b>
            <small>{s.custom.length >= G.CUSTOM_MAX ? `You have ${G.CUSTOM_MAX} already` : "Name it, set its options and what they do"}</small>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        <input className="yg-input search" placeholder="Search the laws" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the laws" />
        {groups
          .filter((gr) => gr.laws.length)
          .map((gr) => (
            <Group key={gr.label} label={gr.label}>
              {gr.laws.map((l) => {
                const pending = s.bills.some((b) => b.law === l.id && live(b));
                return (
                  <Row key={l.id} onClick={() => g.setUI({ law: l.id })} testId={`yg-law-${l.id}`}>
                    <span className="grow">
                      {l.name}
                      {l.constitutional && <span className="yg-tag">⅔</span>}
                    </span>
                    <span className="r muted">{pending ? "In progress" : l.options[s.laws[l.id] ?? l.start].label}</span>
                    <Icon name="chevron" size={16} className="yg-faint" />
                  </Row>
                );
              })}
            </Group>
          ))}
      </Sheet>
    );
  }
  const cur = s.laws[sel.id];
  const pending = s.bills.some((b) => b.law === sel.id && live(b));
  const me = PARTY[s.party].pos;
  const want = (o: number) => posDist(sel.options[o].pos, me) < posDist(sel.options[cur].pos, me);
  return (
    <Sheet
      title={sel.name}
      eyebrow={sel.custom ? "Your law" : sel.group}
      onBack={() => g.setUI({ law: null })}
      onClose={() => g.setUI({ tab: null, law: null })}
      testId="yg-p-law"
      actions={
        sel.custom ? (
          <button type="button" className="yg-btn small" onClick={() => g.setUI({ studio: { id: sel.id } })} data-testid="yg-law-edit">
            <Icon name="edit" size={15} /> Edit
          </button>
        ) : undefined
      }
    >
      {sel.about && <p className="yg-lede">{sel.about}</p>}
      <Group>
        <Row>
          <span className="grow">Committee</span>
          <span className="r muted small">{G.committeeName(sel)}</span>
        </Row>
        <Row>
          <span className="grow">Votes needed</span>
          <span className="r">{sel.constitutional ? "Two thirds" : "A majority"}</span>
        </Row>
        <Row>
          <span className="grow">Cost of a bill</span>
          <span className="r">{money(G.BILL_COST)}</span>
        </Row>
      </Group>
      <Group label="Options">
        {sel.options.map((o, i) => (
          <div key={i} className={`yg-optrow${i === cur ? " on" : ""}`}>
            <div className="yg-optrow-main">
              <span className="grow">
                <b>{o.label}</b>
                {i !== cur && want(i) && <span className="yg-tag accent">your voters</span>}
              </span>
              {i === cur ? (
                <span className="yg-tag good">In force</span>
              ) : (
                <button type="button" className="yg-btn small primary" disabled={pending || s.parties[s.party].funds < G.BILL_COST} onClick={() => g.writeBill(sel.id, i)} data-testid={`yg-propose-${i}`}>
                  Propose
                </button>
              )}
            </div>
            <p className="yg-muted small">{fxText(o.fx) || "No change to the numbers"}</p>
            {i !== cur && (
              <p className="yg-backline">
                {backersOf(sel, cur, i).map((p) => (
                  <span key={p.id} className="yg-chip" style={{ ["--c" as string]: p.color }}>
                    <i />
                    {p.short}
                  </span>
                ))}
                {!backersOf(sel, cur, i).length && <span className="yg-muted small">No party wants this change</span>}
              </p>
            )}
          </div>
        ))}
      </Group>
      {pending && <p className="yg-note warn">A bill on this law is already going through.</p>}
    </Sheet>
  );
}

function Bills({ g }: { g: Game }) {
  const s = g.s!;
  const b = s.bills.find((x) => x.id === g.ui.bill);
  if (!b)
    return (
      <Sheet title="Bills" eyebrow="Before the legislature" onClose={() => g.setUI({ tab: null })} testId="yg-p-bills">
        {s.bills.length === 0 && <p className="yg-empty">No bills before the legislature. Write one!</p>}
        <Group>
          {s.bills.map((x) => {
            const toVote = live(x) && G.youVoteOn(s, x) && x.yourVote === null;
            return (
              <Row key={x.id} onClick={() => g.setUI({ bill: x.id })} testId={`yg-bill-${x.id}`}>
                <Sw c={PARTY[x.party].color} />
                <span className="grow">{billName(s, x)}</span>
                <span className={`yg-tag ${x.stage === "passed" ? "good" : x.stage === "failed" ? "bad" : toVote ? "warn" : ""}`}>{toVote ? "Your vote" : G.stageName(x.stage)}</span>
              </Row>
            );
          })}
        </Group>
      </Sheet>
    );
  const isLive = live(b);
  const proj = isLive ? G.tally(s, b, createRng(b.id * 31 + s.week * 7)) : null;
  const need = isLive ? Math.floor((proj!.yes + proj!.no) * G.required(s, b)) + 1 : 0;
  const lawmaker = G.pol(s, b.proposer);
  const mine = G.youVoteOn(s, b) && isLive;
  const l = G.lawOf(s, b.law);
  const instit = b.stage === "committee" ? `Committee ${COMMITTEES[(l?.committee ?? 1) - 1]}` : b.stage === "house" ? "House of Representatives" : b.stage === "senate" ? "Senate" : b.stage === "president" ? "The President" : G.stageName(b.stage);
  const total = Math.max(1, (proj?.yes ?? 0) + (proj?.no ?? 0) + (proj?.abstain ?? 0));
  const btn = (v: -1 | 0 | 1, label: string, n: number | undefined, cls: string) => (
    <button type="button" className={`yg-vote ${cls}${b.yourVote === v ? " chosen" : ""}`} disabled={!mine} onClick={() => g.vote(b.id, v)} data-testid={`yg-vote-${label.toLowerCase()}`}>
      <span>{label}</span>
      <b>{n ?? ""}</b>
    </button>
  );
  return (
    <Sheet title={isLive ? "Vote to approve new bill" : "Bill"} eyebrow={instit} onBack={() => g.setUI({ bill: null })} onClose={() => g.setUI({ tab: null, bill: null })} testId="yg-p-vote">
      <div className="yg-billcard">
        <Portrait p={lawmaker} size={40} />
        <div className="grow">
          <span className="yg-muted small">
            {lawmaker ? G.fullName(lawmaker) : "—"} · {PARTY[b.party].short}
          </span>
          <b>{billName(s, b)}</b>
        </div>
      </div>
      {isLive && (
        <>
          <Group>
            <Row>
              <span className="grow">System</span>
              <span className="r">Open vote</span>
            </Row>
            <Row>
              <span className="grow">Presence</span>
              <span className="r">
                {G.voters(s, b).length}/{G.voters(s, b).length}
              </span>
            </Row>
            <Row>
              <span className="grow">Required votes</span>
              <span className="r">{b.stage === "president" ? "Signature" : `${need} (${b.budget || !l?.constitutional ? "ordinary" : "two thirds"})`}</span>
            </Row>
            <Row>
              <span className="grow">Vote in</span>
              <span className="r">{Math.max(0, b.voteAt - s.week)} wk</span>
            </Row>
          </Group>
          <p className="yg-label">{mine ? "Your vote" : "Projected vote"}</p>
          {proj && (
            <div className="yg-split" aria-hidden>
              <i className="good" style={{ width: `${(proj.yes / total) * 100}%` }} />
              <i className="muted" style={{ width: `${(proj.abstain / total) * 100}%` }} />
              <i className="bad" style={{ width: `${(proj.no / total) * 100}%` }} />
            </div>
          )}
          <div className="yg-votes">
            {btn(1, "Approve", proj?.yes, "good")}
            {btn(0, "Abstain", proj?.abstain, "")}
            {btn(-1, "Decline", proj?.no, "bad")}
          </div>
          <Group label={`Lobby the parties (${money(G.LOBBY_COST)} each)`}>
            {PARTIES.filter((p) => p.id !== s.party).map((p) => (
              <Row key={p.id}>
                <Sw c={p.color} />
                <span className="grow">{p.name}</span>
                <button type="button" className="yg-btn small" disabled={b.lobbied.includes(p.id) || s.parties[s.party].funds < G.LOBBY_COST} onClick={() => g.lobby(b.id, p.id)} data-testid={`yg-lobby-${p.id}`}>
                  {b.lobbied.includes(p.id) ? "Lobbied" : "Lobby"}
                </button>
              </Row>
            ))}
          </Group>
        </>
      )}
      {b.last && (
        <Group label={`Result in the ${G.stageName(b.last.stage)}`}>
          <Row>
            <span className={`yg-dot ${b.last.passed ? "good" : "bad"}`} />
            <span className="grow">{b.last.passed ? "Passed" : "Rejected"}</span>
            <span className="r">
              {b.last.tally.yes}–{b.last.tally.no} ({b.last.tally.abstain} abstained)
            </span>
          </Row>
          {(b.last.stage === "house" || b.last.stage === "senate") && (
            <Row onClick={() => g.setUI({ view: "chamber", house: b.last!.stage as "house" | "senate" })}>
              <Icon name="chamber" size={18} />
              <span className="grow">Watch it in the chamber</span>
              <Icon name="chevron" size={16} className="yg-faint" />
            </Row>
          )}
        </Group>
      )}
    </Sheet>
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
    <Sheet title="Create new event" eyebrow={`Funds ${money(funds)}`} onClose={() => g.setUI({ tab: null, event: null })} testId="yg-p-events">
      <div className="yg-grid">
        {EVENTS.map((e) => (
          <button key={e.id} type="button" className="yg-tile" title={e.name} aria-label={e.name} aria-pressed={g.ui.event === e.id} disabled={s.usedEvents.includes(e.id)} onClick={() => g.setUI({ event: e.id })} data-testid={`yg-ev-${e.id}`}>
            <span className="yg-tile-ico">{e.icon}</span>
            <span className="yg-tile-name">{e.name}</span>
          </button>
        ))}
      </div>
      {sel && (
        <div className="yg-evcard">
          <b>{sel.name}</b>
          <p className="yg-muted">{sel.desc}</p>
          <Group>
            <Row>
              <span className="grow">Cost</span>
              <span className="r">{money(sel.cost)}</span>
            </Row>
            <Row>
              <span className="grow">Where</span>
              <span className="r">{sel.scope === "state" ? c.states[st].name : sel.scope === "national" ? "Nationwide" : "The party"}</span>
            </Row>
            {sel.risk ? (
              <Row>
                <span className="grow">Risk</span>
                <span className="r">{Math.round(sel.risk * 100)}%</span>
              </Row>
            ) : null}
          </Group>
          {sel.scope === "state" && (
            <p className="yg-muted small">
              <Icon name="pin" size={13} /> Click a state on the map to choose where.
            </p>
          )}
          <button type="button" className="yg-btn primary wide" disabled={funds < sel.cost || s.usedEvents.includes(sel.id)} onClick={() => g.holdEvent(sel.id, st)} data-testid="yg-hold">
            {s.usedEvents.includes(sel.id) ? "Held this week" : "Hold the event"}
          </button>
        </div>
      )}
      {poll && (
        <Group label={`Poll: ${c.states[st].name} (${G.dateLabel(s.polled[st])})`}>
          {(Object.entries(poll) as [PartyId, number][])
            .sort((a, b) => b[1] - a[1])
            .map(([id, v]) => (
              <Row key={id}>
                <Sw c={PARTY[id].color} />
                <span style={{ width: 30 }}>{PARTY[id].short}</span>
                <Bar v={v * 2} color={PARTY[id].color} />
                <span className="r" style={{ width: 48 }}>
                  {pct(v)}
                </span>
              </Row>
            ))}
        </Group>
      )}
    </Sheet>
  );
}

function Parliament({ g }: { g: Game }) {
  const s = g.s!;
  const which = g.ui.house;
  const seats = which === "house" ? G.houseBy(s) : G.senateBy(s);
  const pres = G.pol(s, s.president);
  const c = G.country(s.seed);
  return (
    <Sheet title={which === "house" ? "House of Representatives" : "Senate"} eyebrow="Parliament" onClose={() => g.setUI({ tab: null })} testId="yg-p-chamber">
      <Seg
        value={which}
        label="House"
        onChange={(v) => g.setUI({ house: v })}
        options={[
          { id: "house", label: "House" },
          { id: "senate", label: "Senate" },
        ]}
        testId="yg-house"
      />
      <div className="yg-hemi">
        <Hemicycle seats={seats} highlight={s.party} />
      </div>
      <Group>
        {(Object.entries(seats) as [PartyId, number][])
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => (
            <Row key={id}>
              <Sw c={PARTY[id].color} />
              <span className="grow">{PARTY[id].name}</span>
              <span className="r">{n}</span>
            </Row>
          ))}
        <Row>
          <span className="grow muted">Majority</span>
          <span className="r">{Math.floor((which === "house" ? G.HOUSE_SEATS : s.senate.length) / 2) + 1}</span>
        </Row>
      </Group>
      <Row onClick={() => g.setUI({ view: "chamber" })}>
        <Icon name="chamber" size={18} />
        <span className="grow">See the {which === "house" ? "House" : "Senate"} in session</span>
        <Icon name="chevron" size={16} className="yg-faint" />
      </Row>
      <Group label="The President">
        <Row>
          <Portrait p={pres} size={30} />
          <span className="grow">{pres ? G.fullName(pres) : "—"}</span>
          <span className="r">{pres ? PARTY[pres.party].short : ""}</span>
        </Row>
      </Group>
      <Group label="Governors">
        {(Object.entries(Object.fromEntries(G.PARTY_IDS.map((id) => [id, s.governors.filter((x) => G.pol(s, x)?.party === id).length]))) as [PartyId, number][])
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => (
            <Row key={id}>
              <Sw c={PARTY[id].color} />
              <span className="grow">{PARTY[id].name}</span>
              <span className="r">
                {n}/{c.states.length}
              </span>
            </Row>
          ))}
      </Group>
      <Group label="Committees">
        {COMMITTEES.map((name) => (
          <Row key={name}>
            <span className="grow small">{name}</span>
          </Row>
        ))}
      </Group>
    </Sheet>
  );
}

function Parties({ g }: { g: Game }) {
  const s = g.s!;
  const poll = G.nationalPoll(s);
  const house = G.houseBy(s);
  return (
    <Sheet title="Parties" eyebrow="National polls" onClose={() => g.setUI({ tab: null })} testId="yg-p-parties">
      <PollChart s={s} />
      {PARTIES.map((p) => {
        const ps = s.parties[p.id];
        const leader = G.pol(s, ps.leader);
        return (
          <div key={p.id} className={`yg-partycard${p.id === s.party ? " mine" : ""}`} style={{ ["--c" as string]: p.color }}>
            <div className="yg-partycard-top">
              <Sw c={p.color} />
              <b className="grow">{p.name}</b>
              <b>{pct(poll[p.id])}</b>
            </div>
            <div className="yg-partycard-mid">
              <Portrait p={leader} size={26} />
              <span className="grow small">
                {leader ? G.fullName(leader) : ""} · {p.ideology}
              </span>
              <span className="small">{house[p.id]} seats</span>
            </div>
            {p.id !== s.party && (
              <div className="yg-partycard-rel small">
                <span>Relations with you</span>
                <Bar v={(ps.relations[s.party] + 100) / 200} color={ps.relations[s.party] >= 0 ? "#30d158" : "#ff453a"} />
                <b>{Math.round(ps.relations[s.party])}</b>
              </div>
            )}
          </div>
        );
      })}
    </Sheet>
  );
}

function Compass({ s }: { s: G.GameState }) {
  return (
    <svg width="100%" viewBox="0 0 120 120" style={{ maxWidth: 230 }} role="img" aria-label="Where the parties stand on the political compass">
      <rect x="10" y="10" width="100" height="100" rx="8" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.18)" />
      <line x1="60" y1="10" x2="60" y2="110" stroke="rgba(255,255,255,.15)" />
      <line x1="10" y1="60" x2="110" y2="60" stroke="rgba(255,255,255,.15)" />
      <text x="60" y="7" fontSize="6" textAnchor="middle" fill="rgba(245,247,251,.6)">
        Conservative
      </text>
      <text x="60" y="118" fontSize="6" textAnchor="middle" fill="rgba(245,247,251,.6)">
        Liberal
      </text>
      <text x="5" y="62" fontSize="6" textAnchor="middle" fill="rgba(245,247,251,.6)" transform="rotate(-90 5 62)">
        Left
      </text>
      <text x="115" y="62" fontSize="6" textAnchor="middle" fill="rgba(245,247,251,.6)" transform="rotate(90 115 62)">
        Right
      </text>
      {PARTIES.map((p) => (
        <g key={p.id}>
          <circle cx={60 + p.pos.e * 48} cy={60 - p.pos.s * 48} r={p.id === s.party ? 6 : 4.5} fill={p.color} stroke={p.id === s.party ? "#fff" : "rgba(0,0,0,.5)"} strokeWidth={p.id === s.party ? 1.4 : 0.6} />
          <text x={60 + p.pos.e * 48} y={60 - p.pos.s * 48 - 7.5} fontSize="5.5" textAnchor="middle" fontWeight="800" fill="rgba(245,247,251,.95)">
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
  const line = (label: string, v: number, of: number) => (
    <Row>
      <span style={{ width: 82 }}>{label}</span>
      <Bar v={v / Math.max(1, of)} color={p.color} />
      <span className="r" style={{ width: 52 }}>
        {v}/{of}
      </span>
    </Row>
  );
  return (
    <Sheet title={p.name} eyebrow={`${p.ideology} · ${p.short}`} onClose={() => g.setUI({ tab: null })} testId="yg-p-party">
      <div className="yg-tiles">
        <div className="yg-tile-stat">
          <span>Members</span>
          <b>{(ps.members / 1000).toFixed(0)}k</b>
        </div>
        <div className="yg-tile-stat">
          <span>Funds</span>
          <b>{money(ps.funds)}</b>
        </div>
        <div className="yg-tile-stat">
          <span>Unity</span>
          <b>{Math.round(ps.unity)}</b>
        </div>
      </div>
      <Group>
        <Row>
          <span className="grow">Secretary</span>
          <span className="r">{G.fullName(G.pol(s, s.you)!)}</span>
        </Row>
        <Row>
          <span className="grow">Headquarters</span>
          <span className="r">{c.sections[c.capital].town}</span>
        </Row>
        <Row>
          <span className="grow">Government</span>
          <span className="r">{G.pol(s, s.president)?.party === s.party ? "In government" : "Opposition"}</span>
        </Row>
      </Group>
      <Group label="Offices held">
        {line("House", house, G.HOUSE_SEATS)}
        {line("Senate", senate, s.senate.length)}
        {line("Governors", govs, c.states.length)}
        {line("Mayors", mayors, s.mayors.length)}
      </Group>
      <p className="yg-label">Where the parties stand</p>
      <div className="yg-center">
        <Compass s={s} />
      </div>
    </Sheet>
  );
}

function Country({ g }: { g: Game }) {
  const s = g.s!;
  const c = G.country(s.seed);
  const st = s.stats;
  const pres = G.pol(s, s.president);
  return (
    <Sheet title="Federation of Avalon" eyebrow="Presidential republic · federation" onClose={() => g.setUI({ tab: null })} testId="yg-p-country">
      <div className="yg-tiles">
        <div className="yg-tile-stat">
          <span>Population</span>
          <b>{(c.pop / 1e6).toFixed(1)} M</b>
        </div>
        <div className="yg-tile-stat">
          <span>GDP</span>
          <b>${st.gdp.toFixed(2)} T</b>
        </div>
        <div className="yg-tile-stat">
          <span>Debt</span>
          <b>${(st.debt / 1000).toFixed(1)} T</b>
        </div>
      </div>
      <Trend s={s} pick={(p) => p.approval} label="Government approval" unit="%" color="#64d2ff" digits={0} />
      <Trend s={s} pick={(p) => p.happiness} label="Happiness" unit="" color="#30d158" />
      <Trend s={s} pick={(p) => p.growth} label="Growth" unit="%" color="#ffd60a" digits={2} />
      <Trend s={s} pick={(p) => p.unemployment} label="Unemployment" unit="%" color="#ff9f0a" />
      <Group>
        <Row>
          <span className="grow">Capital</span>
          <span className="r">{c.sections[c.capital].town}</span>
        </Row>
        <Row>
          <span className="grow">President</span>
          <span className="r">{pres ? G.fullName(pres) : "—"}</span>
        </Row>
        <Row>
          <span className="grow">Budget</span>
          <span className="r">
            {st.budget >= 0 ? "+" : "–"}${Math.abs(st.budget).toFixed(0)} B / yr
          </span>
        </Row>
        <Row>
          <span className="grow">GDP per person</span>
          <span className="r">${((st.gdp * 1e12) / c.pop / 1000).toFixed(1)} K</span>
        </Row>
      </Group>
      <Group label="Laws in force">
        {G.allLaws(s).map((l) => (
          <Row key={l.id} onClick={() => g.setUI({ tab: "write", law: l.id })}>
            <span className="grow">
              {l.name}
              {l.custom && <span className="yg-tag accent">yours</span>}
            </span>
            <span className="r muted">{l.options[s.laws[l.id] ?? l.start].label}</span>
          </Row>
        ))}
      </Group>
      <Group label="States">
        {c.states.map((x) => (
          <Row key={x.id} on={g.ui.state === x.id} onClick={() => g.setUI({ state: g.ui.state === x.id ? null : x.id })}>
            <span className="grow">{x.name}</span>
            <span className="r muted">{(x.pop / 1e6).toFixed(1)} M</span>
          </Row>
        ))}
      </Group>
    </Sheet>
  );
}

function News({ g }: { g: Game }) {
  const s = g.s!;
  return (
    <Sheet title="News" eyebrow="The Avalon Herald" onClose={() => g.setUI({ tab: null })} testId="yg-p-news">
      {s.news.map((n, i) => (
        <article key={i} className={`yg-news ${n.tone > 0 ? "good" : n.tone < 0 ? "bad" : ""}`}>
          <span className="yg-muted small">
            {G.dateLabel(n.week)} · {n.kind}
          </span>
          <p>{n.text}</p>
        </article>
      ))}
    </Sheet>
  );
}

function Settings({ g }: { g: Game }) {
  const p = g.prefs;
  return (
    <Sheet title="Settings" onClose={() => g.setUI({ tab: null })} testId="yg-p-settings">
      <Group label="Graphics">
        <Row>
          <span className="grow">Quality</span>
          <Seg
            value={p.gfx}
            label="Graphics quality"
            onChange={(v) => g.setPrefs({ gfx: v })}
            options={[
              { id: "auto", label: "Auto" },
              { id: "high", label: "High" },
              { id: "low", label: "Low" },
            ]}
            testId="yg-gfx"
          />
        </Row>
        <label className="yg-row yg-switch-row">
          <span className="grow">Clouds</span>
          <span className="yg-switch">
            <input type="checkbox" checked={p.clouds} onChange={(e) => g.setPrefs({ clouds: e.target.checked })} />
            <i />
          </span>
        </label>
        <label className="yg-row">
          <span style={{ width: 110 }}>Map colours</span>
          <input className="yg-range" type="range" min={0.2} max={1} step={0.05} value={p.overlay} onChange={(e) => g.setPrefs({ overlay: Number(e.target.value) })} aria-label="How strongly the map is coloured" />
        </label>
      </Group>
      <Group label="Sound">
        <label className="yg-row yg-switch-row">
          <span className="grow">Sound effects</span>
          <span className="yg-switch">
            <input type="checkbox" checked={p.sound} onChange={(e) => g.setPrefs({ sound: e.target.checked })} />
            <i />
          </span>
        </label>
      </Group>
      <Group label="Help">
        <Row onClick={() => g.setPrefs({ tips: true })}>
          <span className="grow">Show the first-steps tips</span>
        </Row>
      </Group>
      <Group label="Career">
        <Row
          onClick={() => {
            if (window.confirm("Retire now? Your score becomes final.")) g.retire();
          }}
          testId="yg-retire"
          className="danger"
        >
          <span className="grow">Retire (end your career)</span>
        </Row>
      </Group>
      <p className="yg-muted small">Drag to pan the map, scroll or pinch to zoom, right-drag or two-finger twist to turn it. Enter ends the week.</p>
    </Sheet>
  );
}

// ------------------------------------------------------------------ election night

function ElectionCard({ g }: { g: Game }) {
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
    <section className="yg-glass yg-election" data-testid="yg-p-election" aria-label="Election night">
      <p className="yg-eyebrow">Election night · {G.yearOf(e.week)}</p>
      <h2>{e.kind === "general" ? "General election" : "Midterm elections"}</h2>
      <div className="yg-progress" aria-label="Counted">
        <i style={{ width: `${Math.min(1, k) * 100}%` }} />
      </div>
      <div className="yg-tiles">
        <div className="yg-tile-stat">
          <span>Sections</span>
          <b>
            {reported > 0 ? reported : counted}/{e.order.length}
          </b>
        </div>
        <div className="yg-tile-stat">
          <span>Turnout</span>
          <b>{popAcc ? pct(turnoutAcc / popAcc) : "—"}</b>
        </div>
        <div className="yg-tile-stat">
          <span>Voters</span>
          <b>{((voters || turnoutAcc) / 1e6).toFixed(1)} M</b>
        </div>
      </div>
      {done && (
        <div className="yg-center">
          <Hemicycle seats={e.houseSeats} size={250} highlight={s.party} />
        </div>
      )}
      <div className="yg-results">
        {rows.map((r) => (
          <div key={r.id} className={`yg-result${r.id === s.party ? " mine" : ""}`}>
            <Sw c={PARTY[r.id].color} />
            <span className="name">{PARTY[r.id].short}</span>
            <Bar v={r.share * 2} color={PARTY[r.id].color} />
            <span className="pc">{reported > 0 ? pct(r.share) : "—"}</span>
            {done && (
              <span className="seats">
                {e.houseSeats[r.id]}
                <em className={e.houseSeats[r.id] >= e.prevHouse[r.id] ? "up" : "down"}>
                  {e.houseSeats[r.id] >= e.prevHouse[r.id] ? "▲" : "▼"}
                  {Math.abs(e.houseSeats[r.id] - e.prevHouse[r.id])}
                </em>
              </span>
            )}
          </div>
        ))}
      </div>
      {done && e.president && (
        <div className={`yg-winner${e.president.party === s.party ? " mine" : ""}`} style={{ ["--c" as string]: PARTY[e.president.party].color }}>
          <span className="yg-muted small">President-elect</span>
          <b>
            {e.president.name} ({PARTY[e.president.party].short})
          </b>
          <span className="small">
            {Math.round(e.president.share * 100)}%{e.president.runoff ? " in the run-off" : ""}
          </span>
        </div>
      )}
      <button type="button" className={`yg-btn wide ${done ? "primary" : ""}`} onClick={() => (done ? g.closeElection() : g.setUI({ count: 1 }))} data-testid={done ? "yg-election-continue" : "yg-election-skip"}>
        {done ? "Continue" : "Skip the count"}
      </button>
    </section>
  );
}

// ------------------------------------------------------------------ the frame

function TopBar({ g }: { g: Game }) {
  const s = g.s!;
  const ps = s.parties[s.party];
  const stat = (icon: string, value: string, label: string, cls = "", testId?: string) => (
    <span className={`yg-stat ${cls}`} title={label} data-testid={testId}>
      <Icon name={icon} size={16} />
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
  return (
    <header className="yg-top">
      <div className="yg-glass yg-capsule yg-brand">
        <Flag />
        <span className="yg-brand-name">Avalon</span>
      </div>
      <div className="yg-glass yg-capsule yg-stats" aria-label="The country and your party">
        {stat("smile", s.stats.happiness.toFixed(1), "Happiness")}
        {stat("thumb", `${s.stats.approval.toFixed(0)}%`, "Approval")}
        {stat("growth", `${s.stats.growth.toFixed(1)}%`, "Growth", "opt")}
        {stat("coins", money(ps.funds), "Funds", "", "yg-funds")}
        {stat("people", `${(ps.members / 1000).toFixed(0)}k`, "Members", "opt")}
        {stat("handshake", String(Math.round(ps.unity)), "Unity", "opt2")}
        {stat("seats", String(G.houseBy(s)[s.party]), "Seats", "opt3")}
      </div>
      <span className="grow" />
      {g.ui.view === "map" && !s.election && (
        <div className="yg-glass yg-capsule yg-modes">
          <Seg<MapMode>
            value={g.ui.mapMode}
            label="Map"
            onChange={(m) => g.setUI({ mapMode: m })}
            options={[
              { id: "politics", label: "Politics", title: "Who leads each county" },
              { id: "support", label: "Support", title: "Your party's support" },
              { id: "states", label: "States", title: "The sixteen states" },
              { id: "terrain", label: "Land", title: "Just the land" },
            ]}
            testId="yg-mapmode"
          />
        </div>
      )}
      <button type="button" className="yg-glass yg-btn icon" aria-label="Settings" aria-pressed={g.ui.tab === "settings"} onClick={() => g.setUI({ tab: g.ui.tab === "settings" ? null : "settings" })} data-testid="yg-tab-settings">
        <Icon name="settings" />
      </button>
    </header>
  );
}

const TABS: { id: Exclude<Tab, null | "settings">; icon: string; label: string }[] = [
  { id: "missions", icon: "career", label: "Your career" },
  { id: "write", icon: "write", label: "Write a bill" },
  { id: "bills", icon: "bills", label: "Bills and votes" },
  { id: "events", icon: "events", label: "Create an event" },
  { id: "chamber", icon: "parliament", label: "Parliament" },
  { id: "parties", icon: "parties", label: "Parties and polls" },
  { id: "party", icon: "party", label: "Your party" },
  { id: "country", icon: "country", label: "The country" },
  { id: "news", icon: "news", label: "News" },
];

function Dock({ g }: { g: Game }) {
  const s = g.s!;
  const toVote = s.bills.some((b) => live(b) && G.youVoteOn(s, b) && b.yourVote === null);
  const freshNews = s.news[0]?.week === s.week - 1;
  return (
    <nav className="yg-glass yg-dock" aria-label="Panels">
      {TABS.map((t) => (
        <button key={t.id} type="button" className="yg-dock-btn" title={t.label} aria-label={t.label} aria-pressed={g.ui.tab === t.id} disabled={!!s.election} onClick={() => g.setUI({ tab: g.ui.tab === t.id ? null : t.id, bill: null, law: null })} data-testid={`yg-tab-${t.id}`}>
          <Icon name={t.icon} size={21} />
          {((t.id === "bills" && toVote) || (t.id === "news" && freshNews)) && <span className="yg-badge" />}
        </button>
      ))}
    </nav>
  );
}

function Missions({ g }: { g: Game }) {
  const s = g.s!;
  const [open, setOpen] = useState(true);
  const list = s.missions.filter((m) => !m.failed).slice(0, 5);
  return (
    <aside className={`yg-glass yg-missions${open ? "" : " closed"}`} aria-label="Missions">
      <button type="button" className="yg-missions-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="career" size={16} /> Missions
        <Icon name="chevron" size={14} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : undefined, transition: "transform .2s" }} />
      </button>
      {open &&
        list.map((m) => (
          <div key={m.id} className={`yg-mission${m.done ? " done" : ""}`}>
            <span className={`yg-dot ${m.done ? "good" : "warn"}`} />
            <span className="grow">{G.missionText(m, s)}</span>
            <span className="yg-muted small">{m.done ? "✓" : `${Math.max(0, m.deadline - s.week)}w`}</span>
          </div>
        ))}
    </aside>
  );
}

function Timeline({ g }: { g: Game }) {
  const s = g.s!;
  const span = 26;
  const marks: { w: number; icon: string; title: string; cls: string }[] = [];
  const el = G.nextElectionWeek(s);
  if (el - s.week < span) marks.push({ w: el, icon: "vote", title: `${G.electionKind(el + 1) === "general" ? "General" : "Midterm"} election`, cls: "accent" });
  for (let w = s.week; w < s.week + span; w++) if (G.weekOf(w) === 40) marks.push({ w, icon: "coins", title: "Budget", cls: "" });
  for (const b of s.bills) if (live(b)) marks.push({ w: b.voteAt, icon: G.youVoteOn(s, b) ? "vote" : "bills", title: billName(s, b), cls: G.youVoteOn(s, b) ? "warn" : "" });
  for (const m of s.missions) if (!m.done && !m.failed && m.deadline - s.week < span) marks.push({ w: m.deadline, icon: "career", title: G.missionText(m, s), cls: "" });
  return (
    <div className="yg-timeline" aria-label="Coming up">
      {Array.from({ length: span }, (_, i) => (
        <span key={i} className={`yg-tick${G.weekOf(s.week + i) === 1 ? " year" : ""}`} style={{ left: `${(i / span) * 100}%` }} />
      ))}
      {marks.map((m, i) => (
        <span key={i} className={`yg-mark ${m.cls}`} title={`${G.dateLabel(m.w)} · ${m.title}`} style={{ left: `${((m.w - s.week + 0.5) / span) * 100}%` }}>
          <Icon name={m.icon} size={12} stroke={2.2} />
        </span>
      ))}
    </div>
  );
}

function BottomBar({ g }: { g: Game }) {
  const s = g.s!;
  return (
    <footer className="yg-bottom">
      <div className="yg-glass yg-capsule yg-viewswitch">
        <Seg
          value={s.election ? "map" : g.ui.view}
          label="View"
          onChange={(v) => g.setUI({ view: v })}
          options={[
            { id: "map", label: <Icon name="map" size={18} />, title: "The country" },
            { id: "chamber", label: <Icon name="chamber" size={18} />, title: "The chamber" },
          ]}
        />
        {/* Kept for tests and keyboard users: the same two buttons, named. */}
        <button type="button" className="yg-sr" onClick={() => g.setUI({ view: "map" })} data-testid="yg-view-map">
          Map
        </button>
        <button type="button" className="yg-sr" onClick={() => g.setUI({ view: "chamber" })} data-testid="yg-view-chamber">
          Chamber
        </button>
        {g.ui.view === "chamber" && !s.election && (
          <Seg
            value={g.ui.house}
            label="House"
            onChange={(v) => g.setUI({ house: v })}
            options={[
              { id: "house", label: "House" },
              { id: "senate", label: "Senate" },
            ]}
          />
        )}
      </div>
      <div className="yg-glass yg-capsule yg-timebar">
        <span className="yg-date" data-testid="yg-date">
          {G.dateLabel(s.week)}
        </span>
        <Timeline g={g} />
      </div>
      <button type="button" className="yg-endturn" title="End the week (Enter)" disabled={!!s.election || s.over} onClick={() => g.endTurn()} data-testid="yg-end-turn">
        <Icon name="hourglass" size={20} stroke={2} />
        <span>End week</span>
      </button>
    </footer>
  );
}

function Toasts({ g }: { g: Game }) {
  return (
    <div className="yg-toasts" aria-live="polite">
      {g.ui.toasts.map((t) => (
        <div key={t.id} className={`yg-glass yg-toast ${t.tone > 0 ? "good" : t.tone < 0 ? "bad" : ""}`}>
          <span className={`yg-dot ${t.tone > 0 ? "good" : t.tone < 0 ? "bad" : "info"}`} />
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ title and game over

/** The title: your country, slowly turning in the sun, behind the party picker. */
function Title({ g }: { g: Game }) {
  const [party, setParty] = useState<PartyId>("ctr");
  const [seed] = useState(() => Math.floor(Math.random() * 1e6) + 1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const quality = g.quality;
  useEffect(() => {
    if (!canvas.current) return;
    let st: Stage3D | null = null;
    try {
      st = new Stage3D(canvas.current, G.country(seed), quality, null, {});
      st.spin = 0.035;
      st.isPaused = () => g.paused;
      st.world.rig.jump({ target: st.world.rig.goal.target.clone().set(0, 0, 10), dist: 330, yaw: 0.5, pitch: 0.62 });
      st.world.setOverlay({ colors: new Uint8Array(4096), selectedState: -1, hoverCounty: -1 }, 0);
      st.world.bordersOn = false;
      st.labels = { selected: -1, hidden: true };
    } catch {
      st = null;
    }
    return () => st?.dispose();
  }, [seed, quality, g]);
  const p = PARTY[party];
  return (
    <div className="yg-title" data-testid="yg-title">
      <canvas ref={canvas} className="yg-canvas" aria-hidden />
      <div className="yg-title-shade" />
      <div className="yg-glass yg-title-card">
        <div className="yg-title-head">
          <Flag size={26} />
          <div>
            <h1>YourGov</h1>
            <p>Lead a party. Write the laws. Win the country, county by county.</p>
          </div>
        </div>
        <p className="yg-label">Choose your party</p>
        <div className="yg-parties">
          {PARTIES.map((x) => (
            <button key={x.id} type="button" className={`yg-partypick${party === x.id ? " on" : ""}`} style={{ ["--c" as string]: x.color }} onClick={() => setParty(x.id)} aria-pressed={party === x.id} data-testid={`yg-party-${x.id}`}>
              <i />
              <b>{x.name}</b>
              <small>{x.ideology}</small>
            </button>
          ))}
        </div>
        <p className="yg-muted small yg-title-blurb">
          You start as the {p.name} secretary in the Federation of Avalon: sixteen states, hundreds of counties, a House, a Senate and a President. Each week, hold events, write and vote on bills (and draft laws of your own), and keep your promises. Every two years the country votes. Your score grows with every law, seat and promise over a twenty-year career.
        </p>
        <button type="button" className="yg-btn primary wide big" onClick={() => g.newGame(party, seed)} data-testid="yg-start">
          <Icon name="play" size={16} /> Begin your career
        </button>
      </div>
    </div>
  );
}

function GameOver({ g }: { g: Game }) {
  const s = g.s!;
  return (
    <div className="yg-modal-back" data-testid="yg-over">
      <section className="yg-glass yg-modal small" role="dialog" aria-modal="true" aria-label="Career over">
        <header className="yg-modal-head">
          <div>
            <p className="yg-eyebrow">
              {G.fullName(G.pol(s, s.you)!)} · {PARTY[s.party].name}
            </p>
            <h2>Career over</h2>
          </div>
        </header>
        <div className="yg-modal-body">
          <div className="yg-tiles">
            <div className="yg-tile-stat">
              <span>Final score</span>
              <b>{s.score.toLocaleString()}</b>
            </div>
            <div className="yg-tile-stat">
              <span>Laws passed</span>
              <b>{s.lawsPassed}</b>
            </div>
            <div className="yg-tile-stat">
              <span>Presidencies</span>
              <b>{s.electionsWon}</b>
            </div>
          </div>
          <Group>
            <Row>
              <span className="grow">Budgets approved</span>
              <span className="r">{s.budgetPassed}</span>
            </Row>
            <Row>
              <span className="grow">Laws you drafted</span>
              <span className="r">{s.custom.length}</span>
            </Row>
          </Group>
        </div>
        <footer className="yg-modal-foot">
          <button type="button" className="yg-btn primary wide" onClick={() => g.quit()} data-testid="yg-again">
            Start a new career
          </button>
        </footer>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ the app

export function App({ game }: { game: Game }) {
  const g = useGame(game);
  const s = g.s;
  const root = useRef<HTMLDivElement>(null);
  const refract = useMemo(() => canRefract(), []);
  useEffect(() => (root.current ? trackSheen(root.current) : undefined), []);
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
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, button, [role=slider]") || g.ui.studio)) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        g.endTurn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [g]);

  const cls = `yg${refract ? " yg-refract" : ""}`;
  if (!s)
    return (
      <div className={cls} ref={root}>
        <GlassDefs />
        <Title g={g} />
      </div>
    );
  const tab = s.election ? null : g.ui.tab;
  const panel =
    tab === "missions" ? (
      <Career g={g} />
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
    ) : tab === "settings" ? (
      <Settings g={g} />
    ) : null;
  return (
    <div className={cls} ref={root} data-testid="yourgov">
      <GlassDefs />
      <Scene g={g} />
      <div className="yg-vignette" aria-hidden />
      <TopBar g={g} />
      <Dock g={g} />
      {panel}
      {!s.election && !panel && g.ui.view === "map" && <Missions g={g} />}
      {!s.election && g.ui.view === "map" && g.ui.state !== null && (
        <div className="yg-glass yg-capsule yg-statepill">
          <Icon name="pin" size={15} /> {G.country(s.seed).states[g.ui.state].name}
          <button type="button" className="yg-btn icon tiny" aria-label="Clear the selected state" onClick={() => g.setUI({ state: null })}>
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
      <BottomBar g={g} />
      <Toasts g={g} />
      {s.election && <ElectionCard g={g} />}
      {g.ui.studio && <LawStudio g={g} />}
      {s.over && <GameOver g={g} />}
    </div>
  );
}
