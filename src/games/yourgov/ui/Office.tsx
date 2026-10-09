/**
 * Running the government (a priority, honours, inquiries, emergency powers, civil service
 * reform, a one-tap reshuffle), tactics on a bill (name it, amend it, fast-track it, find a
 * co-sponsor, talk it out), a confidence vote in your own leadership, and the summit and State
 * of the Nation cards.
 */
import { useState } from "react";
import type { Game } from "../game";
import * as Gr from "../grassroots";
import * as O from "../office";
import * as P from "../politics";
import * as St from "../studio";
import * as W from "../world";
import * as G from "../sim";
import { fxText, Group, Modal, money, Row, Sw } from "./kit";
import { SpeechWriter } from "./Studio";

export function OfficeBox({ g }: { g: Game }) {
  const s = g.s!;
  const o = s.ox;
  const prWait = Math.max(0, O.PRIORITY_GAP - (s.week - o.priorityAt));
  const emWait = Math.max(0, O.EMERGENCY_GAP - (s.week - o.emergencyAt));
  const reformed = o.reformAt >= 0 && s.week - o.reformAt < O.REFORM_GAP;
  return (
    <>
      <Group label={`The government's priority${prWait ? ` · can change in ${prWait}w` : ""}`} testId="yg-priority">
        {O.PRIORITIES.map((p) => (
          <Row key={p.id} on={o.priority === p.id} disabled={prWait > 0 && o.priority !== p.id} onClick={o.priority === p.id ? undefined : () => g.run((x) => O.setPriority(x, p.id), undefined, "paper", 0)} testId={`yg-priority-${p.id}`}>
            <span className="yg-tile-ico small">{p.icon}</span>
            <span className="grow">
              {p.name}
              <br />
              <span className="yg-muted small">{p.about}</span>
            </span>
            {o.priority === p.id && <span className="yg-tag good">Now</span>}
          </Row>
        ))}
      </Group>
      <Group label="Running the country">
        <Row onClick={() => g.run((x) => O.reshuffle(x), undefined, "paper", 0)} testId="yg-reshuffle">
          <span className="yg-tile-ico small">🔄</span>
          <span className="grow">
            Reshuffle: the best person in every post
            <br />
            <span className="yg-muted small">By skill, in one tap. The factions may grumble about who&apos;s left out.</span>
          </span>
        </Row>
        <Row disabled={!!o.inquiry} onClick={undefined}>
          <span className="yg-tile-ico small">🔍</span>
          <span className="grow">
            Public inquiry{o.inquiry ? `: reports in ${Math.max(0, o.inquiry.due - s.week)} weeks` : ""}
            <br />
            <span className="yg-muted small">{o.inquiry ? O.INQUIRIES.find((x) => x.id === o.inquiry!.topic)?.name : "Costs about 1 B. Reports in 16 weeks; the findings can cut either way."}</span>
          </span>
        </Row>
        {!o.inquiry && (
          <div className="yg-actions" style={{ padding: "0 6px 8px", flexWrap: "wrap" }}>
            {O.INQUIRIES.map((q) => (
              <button key={q.id} type="button" className="yg-btn small" title={q.about} onClick={() => g.run((x) => O.startInquiry(x, q.id), undefined, "paper", 0)} data-testid={`yg-inquiry-${q.id}`}>
                {q.name}
              </button>
            ))}
          </div>
        )}
        <Row disabled={o.honoursYear === G.yearOf(s)} onClick={undefined}>
          <span className="yg-tile-ico small">🎖️</span>
          <span className="grow">
            The honours list{o.honoursYear === G.yearOf(s) ? " (done this year)" : ""}
            <br />
            <span className="yg-muted small">Once a year: who gets the medals?</span>
          </span>
        </Row>
        {o.honoursYear !== G.yearOf(s) && (
          <div className="yg-actions" style={{ padding: "0 6px 8px", flexWrap: "wrap" }}>
            {O.HONOURS.map((h) => (
              <button key={h.id} type="button" className="yg-btn small" title={h.about} onClick={() => g.run((x) => O.honours(x, h.id), undefined, "cheer")} data-testid={`yg-honours-${h.id}`}>
                {h.icon} {h.name}
              </button>
            ))}
          </div>
        )}
        <Row disabled={O.emergencyOn(s) || emWait > 0 || (!s.crisis && !s.soc.protests.length)} onClick={() => window.confirm("Declare a state of emergency? Protests are broken up and crisis decisions bite harder for eight weeks, but trust in politics falls, and the courts may strike it down.") && g.run((x) => O.declareEmergency(x), undefined, "gavel", 0)} testId="yg-emergency">
          <span className="yg-tile-ico small">🚨</span>
          <span className="grow">
            {O.emergencyOn(s) ? `Emergency powers: ${o.emergency - s.week} weeks left` : "Emergency powers"}
            <br />
            <span className="yg-muted small">{emWait && !O.emergencyOn(s) ? `Not again for ${emWait} weeks.` : "Only during a crisis or a protest."}</span>
          </span>
        </Row>
        <Row disabled={reformed} onClick={() => window.confirm("Shake up the civil service? A dip now, savings from six months on.") && g.run((x) => O.civilServiceReform(x), undefined, "paper", 0)} testId="yg-reform">
          <span className="yg-tile-ico small">🏢</span>
          <span className="grow">
            Civil service reform{reformed ? " (under way)" : ""}
            <br />
            <span className="yg-muted small">About 3 B a year saved, from six months on.</span>
          </span>
        </Row>
      </Group>
    </>
  );
}

/** Your leadership: call a confidence vote to silence the rebels. */
export function ConfidenceBox({ g }: { g: Game }) {
  const s = g.s!;
  const wait = Math.max(0, 26 - (s.week - s.ox.confidenceAt));
  const sup = P.leadershipSupport(s);
  return (
    <Group label="Your leadership">
      <Row disabled={!!s.challenge || wait > 0} onClick={() => window.confirm(`Call a confidence vote in your own leadership? About ${Math.round(sup * 100)}% would back you today. Lose it and you're out.`) && g.confidenceVote()} testId="yg-confidence">
        <span className="yg-tile-ico small">🗳️</span>
        <span className="grow">
          Call a confidence vote in yourself
          <br />
          <span className="yg-muted small">{wait ? `Not again for ${wait} weeks.` : `Win it and the party unites behind you. About ${Math.round(sup * 100)}% support you now.`}</span>
        </span>
      </Row>
    </Group>
  );
}

/** What you can do with a bill beyond voting on it. */
export function BillTools({ g, b }: { g: Game; b: G.Bill }) {
  const s = g.s!;
  const [title, setTitle] = useState(b.title ?? "");
  const mineBill = b.proposer === s.you && !b.budget;
  const ours = b.party === s.party && !b.budget;
  const l = G.lawOf(s, b.law);
  const canFili = !ours && (b.stage === "house" || b.stage === "senate") && G.youVoteOn(s, b);
  const friends = G.running(s).filter((p) => p !== s.party && (s.parties[p].relations[s.party] ?? 0) >= 25);
  if (!mineBill && !ours && !canFili) return null;
  return (
    <Group label="Tactics" testId="yg-billtools">
      {mineBill && (
        <label className="yg-row">
          <input className="yg-input small grow" value={title} maxLength={48} placeholder="Name your bill, e.g. The Clean Air Act" onChange={(e) => setTitle(e.target.value)} aria-label="Name your bill" data-testid="yg-bill-title" />
          <button type="button" className="yg-btn small" onClick={() => g.run((x) => St.nameBill(x, b.id, title), title ? `It's the ${title} now` : "Name cleared", "paper")} data-testid="yg-bill-title-save">
            Name it
          </button>
        </label>
      )}
      {mineBill && l && (b.stage === "committee" || b.stage === "house") && (
        <label className="yg-row">
          <span className="small muted" style={{ width: 64 }}>
            Amend
          </span>
          <select className="yg-input small grow" value={b.option} onChange={(e) => g.run((x) => St.amendBill(x, b.id, Number(e.target.value)), undefined, "paper", 0)} aria-label="Amend the bill" data-testid="yg-bill-amend">
            {l.options.map((o, i) =>
              i === s.laws[b.law] ? null : (
                <option key={i} value={i}>
                  {o.label}
                  {i === b.option ? " (now)" : ` (${money(s, St.AMEND_COST)})`}
                </option>
              ),
            )}
          </select>
        </label>
      )}
      {mineBill && b.stage === "committee" && s.gov.head === s.you && (
        <Row onClick={() => g.run((x) => Gr.fastTrack(x, b.id), undefined, "gavel", 0)} testId="yg-fasttrack">
          <span className="yg-tile-ico small">⏩</span>
          <span className="grow">
            Fast-track it past the committee
            <br />
            <span className="yg-muted small">Saves a week; the party grumbles a little.</span>
          </span>
        </Row>
      )}
      {ours && b.stage !== "passed" && b.stage !== "failed" && !b.cosponsor && (
        <>
          <p className="yg-muted small" style={{ margin: "6px 6px 2px" }}>
            Ask a friendly party to co-sponsor it (they back it; it costs some goodwill with them):
          </p>
          <div className="yg-actions" style={{ padding: "2px 6px 8px", flexWrap: "wrap" }}>
            {friends.length ? (
              friends.map((p) => (
                <button key={p} type="button" className="yg-btn small" onClick={() => g.run((x) => Gr.cosponsor(x, b.id, p), undefined, "paper")} data-testid={`yg-cosponsor-${p}`}>
                  <Sw c={G.party(s, p).color} /> {G.party(s, p).short}
                </button>
              ))
            ) : (
              <span className="yg-muted small">No party is friendly enough yet.</span>
            )}
          </div>
        </>
      )}
      {b.cosponsor && (
        <Row>
          <Sw c={G.party(s, b.cosponsor).color} />
          <span className="grow small">Co-sponsored by the {G.party(s, b.cosponsor).name}</span>
        </Row>
      )}
      {canFili && (
        <Row disabled={(b.filibusters ?? 0) >= 2} onClick={() => g.run((x) => Gr.filibuster(x, b.id), undefined, "paper", 0)} testId="yg-filibuster">
          <span className="yg-tile-ico small">🗣️</span>
          <span className="grow">
            Talk it out (filibuster){b.filibusters ? ` · ${b.filibusters}/2` : ""}
            <br />
            <span className="yg-muted small">Delays the vote two weeks. Needs three in ten of the house behind you.</span>
          </span>
        </Row>
      )}
    </Group>
  );
}

// ------------------------------------------------------------------ decisions

export function SummitCard({ g }: { g: Game }) {
  const s = g.s!;
  const sm = s.wd.summit!;
  const def = W.SUMMITS[sm.kind];
  return (
    <Modal label={def.name} testId="yg-summit">
      <header className="yg-modal-head">
        <span className="yg-bigico">{def.icon}</span>
        <div>
          <p className="yg-eyebrow">Summit · {G.dateLabel(s)}</p>
          <h2>{def.name}</h2>
        </div>
      </header>
      <div className="yg-modal-body">
        <p className="yg-lede">{def.text}</p>
        {def.options.map((o, i) => (
          <button key={i} type="button" className="yg-choice" onClick={() => g.answerSummit(i)} data-testid={`yg-summit-${i}`}>
            <b>{o.label}</b>
            <span className="yg-chips">
              {fxText(s, { approval: o.approval, budget: o.budget, growth: o.growth })
                .split(" · ")
                .filter(Boolean)
                .map((t) => (
                  <span key={t} className="yg-chip plain">
                    {t}
                  </span>
                ))}
              {o.foreign ? <span className={`yg-chip ${o.foreign > 0 ? "good" : "bad"}`}>🌐 {o.foreign > 0 ? "+" : ""}{o.foreign}</span> : null}
              {o.env ? <span className="yg-chip good">🌿 environment +{o.env}</span> : null}
              {Object.entries(o.goodwill ?? {}).map(([k, v]) => (
                <span key={k} className={`yg-chip ${v > 0 ? "good" : "bad"}`}>
                  {P.GROUP[k].icon} {v > 0 ? "+" : ""}
                  {v}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
      <footer className="yg-modal-foot">
        <p className="yg-muted">Undecided by the end of the week, you cooperate quietly.</p>
        <button type="button" className="yg-btn" onClick={() => g.later("summit")} data-testid="yg-summit-later">
          Later
        </button>
      </footer>
    </Modal>
  );
}

export function SotnCard({ g }: { g: Game }) {
  const s = g.s!;
  return (
    <Modal label="State of the Nation" testId="yg-sotn" wide>
      <header className="yg-modal-head">
        <span className="yg-bigico">📜</span>
        <div>
          <p className="yg-eyebrow">{G.yearOf(s)} · the whole country is watching</p>
          <h2>The State of the Nation</h2>
        </div>
      </header>
      <div className="yg-modal-body">
        <p className="yg-lede">Once a year the {G.titles(s).head} tells the country how it&apos;s doing and what comes next. Write the speech.</p>
        <SpeechWriter g={g} onGive={(d) => g.giveSotn(d)} cta="Deliver the address" testId="yg-sotn-speech" />
      </div>
      <footer className="yg-modal-foot">
        <p className="yg-muted">Put off past the end of the week, your speechwriters write a safe one.</p>
        <button type="button" className="yg-btn" onClick={() => g.later("sotn")} data-testid="yg-sotn-later">
          Later
        </button>
      </footer>
    </Modal>
  );
}
