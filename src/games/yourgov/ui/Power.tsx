/**
 * The super mega update's panels and cards: the markets, the whips, the court and its
 * vacancies, the party conference, social media and rival leaders, the weekly front page, and
 * the career's timeline, legacy and hall of fame.
 */
import { useState } from "react";
import type { PartyId } from "../data";
import type { Game } from "../game";
import * as K from "../career";
import * as I from "../institutions";
import * as Mk from "../markets";
import * as Md from "../media";
import * as G from "../sim";
import { Icon } from "./icons";
import { Group, Modal, Row, Seg, Stars, Sw } from "./kit";

// ------------------------------------------------------------------ a small line chart

/** One measure over time: a thin line, the latest value labelled, a hover readout. */
export function Line({ values, label, unit, color, digits = 1 }: { values: number[]; label: string; unit: string; color: string; digits?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (values.length < 2)
    return (
      <div className="yg-trend">
        <div className="yg-trend-head">
          <span>{label}</span>
          <b>
            {values[0]?.toFixed(digits) ?? "—"}
            {unit}
          </b>
        </div>
      </div>
    );
  const W = 300;
  const H = 54;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 4 - ((v - lo) / span) * (H - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const shown = hover ?? values.length - 1;
  return (
    <div className="yg-trend">
      <div className="yg-trend-head">
        <span>{label}</span>
        <b>
          {values[shown].toFixed(digits)}
          {unit}
        </b>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${values[values.length - 1].toFixed(digits)}${unit}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(values.length - 1, Math.round(((e.clientX - r.left) / r.width) * (values.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="rgba(255,255,255,.35)" vectorEffect="non-scaling-stroke" />}
        <circle cx={x(shown)} cy={y(values[shown])} r={3} fill={color} />
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ the markets

export function MarketsPage({ g }: { g: Game }) {
  const s = g.s!;
  const m = s.mk;
  const [rate, setRate] = useState(m.rate);
  const setter = Mk.rateSetter(s);
  const can = Mk.canSetRate(s);
  const wait = Math.max(0, Mk.RATE_GAP - (s.week - m.setAt));
  const h = m.hist.slice(-104);
  const good = m.rating <= 2;
  return (
    <div data-testid="yg-markets">
      <div className="yg-tiles">
        <div className="yg-tile-stat">
          <span>Inflation</span>
          <b className={m.inflation > 4 ? "yg-warn" : ""}>{m.inflation.toFixed(1)}%</b>
        </div>
        <div className="yg-tile-stat">
          <span>Interest rate</span>
          <b>{m.rate.toFixed(2)}%</b>
        </div>
        <div className="yg-tile-stat">
          <span>Credit rating</span>
          <b className={good ? "yg-good" : m.rating >= 7 ? "yg-warn" : ""}>{Mk.RATINGS[m.rating]}</b>
        </div>
      </div>
      {h.length >= 2 ? (
        <>
          <Line values={h.map((p) => p.index)} label="Stock market" unit="" color="#64d2ff" digits={0} />
          <Line values={h.map((p) => p.inflation)} label="Inflation" unit="%" color="#ff9f0a" digits={1} />
          <Line values={h.map((p) => p.rate)} label="Interest rate" unit="%" color="#bf5af2" digits={2} />
        </>
      ) : (
        <p className="yg-note small">The charts fill in as the weeks go by. Stock market: {Math.round(m.index)}.</p>
      )}
      <Group label="Who sets interest rates">
        <Row>
          <span className="grow small">{setter === 1 ? "An independent central bank, to keep inflation near 2%." : setter === 0 ? "The government (the central-bank law puts the bank under it)." : "Nobody: the central bank has been abolished, and prices drift."}</span>
        </Row>
        {can && (
          <div className="yg-ratebox" data-testid="yg-ratebox">
            <button type="button" className="yg-btn icon small" aria-label="Lower" onClick={() => setRate(Math.max(0, Math.round((rate - 0.25) * 4) / 4))}>
              −
            </button>
            <b>{rate.toFixed(2)}%</b>
            <button type="button" className="yg-btn icon small" aria-label="Raise" onClick={() => setRate(Math.min(15, Math.round((rate + 0.25) * 4) / 4))}>
              +
            </button>
            <button type="button" className="yg-btn small primary" disabled={wait > 0 || rate === m.rate} onClick={() => g.setRate(rate)} data-testid="yg-set-rate">
              {wait > 0 ? `In ${wait} wk` : "Set the rate"}
            </button>
          </div>
        )}
      </Group>
      <p className="yg-muted small" style={{ margin: "6px 4px" }}>
        Dearer money cools prices and growth and costs the budget interest; cheap money does the opposite. Debt and deficits move the credit rating a notch at a time, and a downgrade hurts the government.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ the whips

export function WhipControl({ g, b, rebels }: { g: Game; b: G.Bill; rebels: number }) {
  const s = g.s!;
  const sits = G.voters(s, b).some((id) => G.pol(s, id)?.party === s.party);
  if (!sits || b.stage === "president") return null;
  const w = b.whip ?? "normal";
  return (
    <Group label="Whip your lawmakers" testId="yg-whip">
      <div style={{ padding: "8px 8px 4px" }}>
        <Seg<I.Whip> value={w} label="Whip" onChange={(v) => g.setWhip(b.id, v)} options={I.WHIPS.map((x) => ({ id: x.id, label: x.id === "normal" ? "Normal" : x.id === "three" ? "Three-line" : "Free vote", title: x.about }))} className="yg-seg-fill" testId="yg-whip-seg" />
      </div>
      <Row>
        <span className="grow small muted">{I.WHIPS.find((x) => x.id === w)!.about}</span>
        <span className={`r small ${rebels ? "yg-warn" : ""}`}>{w === "free" ? "No line" : rebels ? `${rebels} may rebel` : "Solid"}</span>
      </Row>
    </Group>
  );
}

// ------------------------------------------------------------------ the court

export function CourtBox({ g }: { g: Game }) {
  const s = g.s!;
  const c = s.court;
  const lib = c.judges.filter((j) => I.leanLabel(j.pos) === "Liberal").length;
  const con = c.judges.filter((j) => I.leanLabel(j.pos) === "Conservative").length;
  const order = [...c.judges].sort((a, b) => a.pos.s - b.pos.s);
  return (
    <Group label={`The ${I.courtName(s)}`} testId="yg-court">
      <div className="yg-bench" aria-label={`${lib} liberal, ${c.judges.length - lib - con} centrist, ${con} conservative`}>
        {order.map((j) => (
          <span key={j.id} title={`${j.name} · ${I.leanLabel(j.pos)}`} className={`yg-judge ${I.leanLabel(j.pos).toLowerCase()}`} />
        ))}
        {Array.from({ length: Math.max(0, I.COURT_SIZE - c.judges.length) }, (_, i) => (
          <span key={`v${i}`} className="yg-judge vacant" title="Vacant" />
        ))}
      </div>
      <Row>
        <span className="grow small">
          {lib} liberal · {c.judges.length - lib - con} centrist · {con} conservative
          {c.nominees ? " · a seat is vacant" : ""}
        </span>
      </Row>
      {c.cases.map((k) => {
        const l = G.lawOf(s, k.law);
        const yes = I.upholds(s, k);
        return (
          <Row key={k.id}>
            <span className="yg-tile-ico small">⚖️</span>
            <span className="grow small">
              {k.by} v. {l?.name ?? "a law"}
              <br />
              <span className="yg-muted">Ruling in {Math.max(0, k.week - s.week)} wk · leaning {yes * 2 > c.judges.length ? "to uphold" : "to strike it down"}</span>
            </span>
          </Row>
        );
      })}
    </Group>
  );
}

export function NomineeCard({ g }: { g: Game }) {
  const s = g.s!;
  const list = s.court.nominees!;
  return (
    <Modal label="A court vacancy" testId="yg-nominee">
      <header className="yg-modal-head">
        <span className="yg-bigico">⚖️</span>
        <div>
          <p className="yg-eyebrow">{I.courtName(s)} · a seat is vacant</p>
          <h2>Choose a nominee</h2>
        </div>
      </header>
      <div className="yg-modal-body">
        <p className="yg-lede">Judges sit for years and rule on the laws you pass. {G.sys(s).exec === "presidential" ? `The ${G.sys(s).upper.short} must confirm them.` : "The appointment is yours."}</p>
        {list.map((n, i) => {
          const v = I.confirmation(s, n);
          return (
            <button key={i} type="button" className="yg-choice" onClick={() => g.nominate(i)} data-testid={`yg-nominee-${i}`}>
              <b>
                {n.name} <Stars n={2 + n.skill * 1.4} />
              </b>
              <span className="yg-muted small">
                {n.label} · {I.leanLabel(n.pos)}
                {v ? ` · ${v.yes} of ${v.total} would confirm` : ""}
              </span>
            </button>
          );
        })}
      </div>
      <footer className="yg-modal-foot">
        <p className="yg-muted">Undecided by the end of the week, the moderate is put forward.</p>
        <button type="button" className="yg-btn" onClick={() => g.later("court")} data-testid="yg-nominee-later">
          Later
        </button>
      </footer>
    </Modal>
  );
}

// ------------------------------------------------------------------ the conference

export function ConferenceCard({ g }: { g: Game }) {
  const s = g.s!;
  const c = s.conference!;
  const [speech, setSpeech] = useState("unity");
  const [back, setBack] = useState<boolean[]>(() => c.motions.map(() => false));
  return (
    <Modal label="Party conference" testId="yg-conference">
      <header className="yg-modal-head">
        <span className="yg-bigico">🎪</span>
        <div>
          <p className="yg-eyebrow">{G.party(s, s.party).name} · annual conference</p>
          <h2>Conference week</h2>
        </div>
      </header>
      <div className="yg-modal-body">
        <p className="yg-label">Your speech</p>
        {I.SPEECHES.map((sp) => (
          <button key={sp.id} type="button" className={`yg-choice${speech === sp.id ? " on" : ""}`} onClick={() => setSpeech(sp.id)} aria-pressed={speech === sp.id} data-testid={`yg-conf-${sp.id}`}>
            <b>{sp.name}</b>
            <span className="yg-muted small">{sp.about}</span>
          </button>
        ))}
        {c.motions.length > 0 && <p className="yg-label">Motions from the floor</p>}
        {c.motions.map((m, i) => {
          const l = G.lawOf(s, m.law);
          const f = s.factions.find((x) => x.id === m.faction);
          return (
            <div key={i} className="yg-motion" data-testid={`yg-motion-${i}`}>
              <span className="grow">
                <b>
                  {l?.name}: {l?.options[s.laws[m.law] + m.dir]?.label}
                </b>
                <small className="yg-muted">Moved by the {f?.name.toLowerCase()}. Back it and it becomes a promise.</small>
              </span>
              <Seg<string>
                value={back[i] ? "back" : "oppose"}
                label="Your position"
                onChange={(v) => setBack(back.map((x, k) => (k === i ? v === "back" : x)))}
                options={[
                  { id: "back", label: "Back" },
                  { id: "oppose", label: "Oppose" },
                ]}
                testId={`yg-motion-${i}-seg`}
              />
            </div>
          );
        })}
      </div>
      <footer className="yg-modal-foot">
        <button type="button" className="yg-btn" onClick={() => g.later("conference")} data-testid="yg-conf-later">
          Later
        </button>
        <button type="button" className="yg-btn primary grow" onClick={() => g.conference(speech, back)} data-testid="yg-conf-go">
          <Icon name="check" size={16} /> Close the conference
        </button>
      </footer>
    </Modal>
  );
}

// ------------------------------------------------------------------ social media and rivals

export function TraitChip({ s, party }: { s: G.GameState; party: PartyId }) {
  if (party === s.party) return null;
  const t = Md.TRAITS.find((x) => x.id === Md.traitOf(s, party))!;
  return (
    <span className="yg-tag" title={t.about}>
      {t.icon} {t.name}
    </span>
  );
}

const big = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n));

export function Social({ g }: { g: Game }) {
  const s = g.s!;
  const left = Md.POST_MAX - Md.postsThisWeek(s);
  const [own, setOwn] = useState("");
  return (
    <div data-testid="yg-social">
      <div className="yg-tiles">
        <div className="yg-tile-stat">
          <span>Followers</span>
          <b>{big(s.social.followers)}</b>
        </div>
        <div className="yg-tile-stat">
          <span>Posts left</span>
          <b>{left}/{Md.POST_MAX}</b>
        </div>
        <div className="yg-tile-stat">
          <span>Reach</span>
          <b>{((s.social.followers / Md.followerCap(s)) * 100).toFixed(s.social.followers / Md.followerCap(s) < 0.1 ? 1 : 0)}%</b>
        </div>
      </div>
      <div className="yg-grid">
        {Md.POST_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            className="yg-tile"
            title={k.about}
            disabled={left <= 0}
            onClick={() => {
              g.post(k.id, own);
              setOwn("");
            }}
            data-testid={`yg-post-${k.id}`}
          >
            <span className="yg-tile-ico">{k.icon}</span>
            <span className="yg-tile-name">{k.name}</span>
          </button>
        ))}
      </div>
      <label className="yg-field" style={{ marginTop: 8 }}>
        <span>Write it yourself (optional), then pick the kind of post</span>
        <textarea className="yg-input" rows={2} maxLength={140} value={own} placeholder="Leave empty and your team writes it" onChange={(e) => setOwn(e.target.value)} data-testid="yg-post-own" />
      </label>
      <p className="yg-muted small" style={{ margin: "6px 4px" }}>
        Most posts win a few followers. Some fly, and lift you everywhere; some backfire. A bigger following helps the next one fly.
      </p>
      <p className="yg-label">The feed</p>
      <div className="yg-feed">
        {!s.social.posts.length && <p className="yg-empty">Nothing yet. Post something!</p>}
        {s.social.posts.map((p, i) => {
          const leader = G.pol(s, s.parties[p.party]?.leader ?? -1);
          return (
            <div key={i} className={`yg-post${p.party === s.party ? " mine" : ""}`} style={{ ["--c" as string]: G.party(s, p.party).color }}>
              <div className="yg-post-head">
                <Sw c={G.party(s, p.party).color} />
                <b>{leader ? G.fullName(leader) : G.party(s, p.party).name}</b>
                <span className="yg-muted small">@{G.party(s, p.party).short.toLowerCase()} · {G.dateLabel(s, p.week)}</span>
              </div>
              <p>{p.text}</p>
              <span className="yg-post-foot small">
                ♥ {big(p.likes)}
                {p.viral && <span className="yg-tag good">Viral</span>}
                {p.backfired && <span className="yg-tag bad">Backlash</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the front page

export function FrontPage({ g }: { g: Game }) {
  const s = g.s!;
  const last = s.week - 1;
  // Last week's stories (and, in the first week, the opening ones).
  const items = s.news.filter((n) => n.week >= last);
  const rank = (n: G.NewsItem) => (n.kind === "election" ? 5 : n.kind === "government" ? 4 : n.kind === "scandal" ? 3 : n.kind === "law" || n.kind === "budget" ? 2 : 1) + Math.abs(n.tone);
  const sorted = [...items].sort((a, b) => rank(b) - rank(a));
  const lead = sorted[0];
  const h = s.history;
  const now = h[h.length - 1];
  const then = h[Math.max(0, h.length - 5)];
  const i = G.pidx(s, s.party);
  const you = now ? now.poll[i] : 0;
  const was = then ? then.poll[i] : you;
  const m = s.mk;
  const idx = m.hist.length > 1 ? m.hist[m.hist.length - 1].index / m.hist[Math.max(0, m.hist.length - 5)].index - 1 : 0;
  return (
    <Modal label="The front page" testId="yg-paper" wide>
      <div className="yg-paper">
        <div className="yg-paper-mast">
          <span>{G.dateLabel(s, last)}</span>
          <b>The {s.sc.name} Times</b>
          <span>{s.sc.economy.cur}1</span>
        </div>
        <h2 className="yg-paper-lead">{lead ? lead.text : "A quiet week in politics"}</h2>
        <div className="yg-paper-cols">
          <div>
            {sorted.slice(1, 5).map((n, k) => (
              <p key={k} className={`yg-paper-item ${n.tone > 0 ? "good" : n.tone < 0 ? "bad" : ""}`}>
                {n.text}
              </p>
            ))}
            {sorted.length < 2 && <p className="yg-paper-item">Nothing else of note.</p>}
          </div>
          <div className="yg-paper-box">
            <b>The {G.party(s, s.party).short} in the polls</b>
            <span className="yg-paper-big">{(you * 100).toFixed(1)}%</span>
            <span className={you >= was ? "yg-good" : "yg-warn"}>
              {you >= was ? "▲" : "▼"} {Math.abs((you - was) * 100).toFixed(1)} in a month
            </span>
            <b>Markets</b>
            <span>
              Index {Math.round(m.index)} ({idx >= 0 ? "+" : ""}
              {(idx * 100).toFixed(1)}%) · inflation {m.inflation.toFixed(1)}% · rates {m.rate.toFixed(2)}%
            </span>
            <b>Government approval</b>
            <span>{Math.round(s.stats.approval)}%</span>
          </div>
        </div>
      </div>
      <footer className="yg-modal-foot">
        <button type="button" className="yg-btn primary wide" onClick={() => g.setUI({ paper: false })} data-testid="yg-paper-close">
          Back to work
        </button>
      </footer>
    </Modal>
  );
}

// ------------------------------------------------------------------ the career's story

export function Timeline({ g, max = 40 }: { g: Game; max?: number }) {
  const s = g.s!;
  const list = [...(s.timeline ?? [])].reverse().slice(0, max);
  if (!list.length) return null;
  return (
    <>
      <p className="yg-label">Your story</p>
      <div className="yg-timeline-list" data-testid="yg-story">
        {list.map((m, i) => (
          <div key={i} className="yg-moment">
            <span className="yg-moment-ico">{m.icon}</span>
            <span className="grow">{m.text}</span>
            <span className="yg-muted small">{G.dateLabel(s, m.w)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function LegacyBox({ g }: { g: Game }) {
  const s = g.s!;
  const L = K.legacy(s);
  return (
    <div className="yg-legacy" data-testid="yg-legacy">
      <span className="yg-eyebrow">Your legacy</span>
      <h3>{L.title}</h3>
      <div className="yg-legacy-meter" aria-label={`Legacy ${L.rating} out of 100`}>
        <i style={{ width: `${L.rating}%` }} />
      </div>
      <p className="yg-muted small">{L.lines.join(" · ")}</p>
      {g.hallPlace >= 0 && (
        <p className="yg-note">
          🏆 Number {g.hallPlace + 1} in your hall of fame
        </p>
      )}
    </div>
  );
}

export function HallOfFame({ g }: { g: Game }) {
  if (!g.hall.length) return <p className="yg-muted small">Finish a career and it&apos;s remembered here: your ten best, on this device.</p>;
  return (
    <div className="yg-mine" data-testid="yg-hall">
      {g.hall.map((e, i) => (
        <div key={`${e.date}${i}`} className="yg-country row">
          <span className="yg-hall-rank">{i + 1}</span>
          <span className="grow">
            <b>
              {e.name} <Sw c={e.color} /> {e.party}
            </b>
            <small>
              {e.title} · {e.country} · {e.years} yr
            </small>
          </span>
          <b className="r">{e.score.toLocaleString()}</b>
        </div>
      ))}
    </div>
  );
}

/** Difficulty and sandbox, for a new career. */
export function ModePicker({ mode, onChange }: { mode: K.Mode; onChange: (m: K.Mode) => void }) {
  return (
    <div className="yg-modepick" data-testid="yg-mode">
      <Seg<K.Difficulty> value={mode.difficulty} label="Difficulty" onChange={(d) => onChange({ ...mode, difficulty: d })} options={K.DIFFICULTIES.map((d) => ({ id: d.id, label: d.name, title: d.about }))} testId="yg-difficulty" />
      <label className="yg-switch" title="No twenty-year limit and no leadership challenges">
        <input type="checkbox" checked={mode.sandbox} onChange={(e) => onChange({ ...mode, sandbox: e.target.checked })} data-testid="yg-sandbox" />
        <i />
        <span>
          Sandbox
          <small>No time limit, no challenges</small>
        </span>
      </label>
    </div>
  );
}
