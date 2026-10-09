/**
 * The country and the world: society's eight indices (with life expectancy, the season and
 * the big sporting moments), the industries, trade and house prices, the global economy,
 * treaties, aid and sanctions, and the protest movements in the streets.
 */
import { useState } from "react";
import type { Game, WorldPage } from "../game";
import * as P from "../politics";
import * as S from "../society";
import * as W from "../world";
import * as G from "../sim";
import { Bar, Group, MidBar, money, Row, Seg, Sheet } from "./kit";
import { Line } from "./Power";

const PAGES: { id: WorldPage; label: string }[] = [
  { id: "society", label: "Society" },
  { id: "economy", label: "Industry" },
  { id: "world", label: "The world" },
  { id: "protests", label: "Protests" },
];

export function WorldPanel({ g }: { g: Game }) {
  const s = g.s!;
  const page = g.ui.worldPage;
  const se = S.season(s);
  return (
    <Sheet title="Society & the world" eyebrow={`${S.SEASON_ICON[se]} ${se[0].toUpperCase()}${se.slice(1)} · ${s.sc.name}`} onClose={() => g.setUI({ tab: null })} testId="yg-p-world">
      <div className="yg-scrollseg">
        <Seg<WorldPage> value={page} label="Society and the world" onChange={(v) => g.setUI({ worldPage: v })} options={PAGES.map((p) => ({ id: p.id, label: p.id === "protests" && s.soc.protests.length ? `${p.label} ${s.soc.protests.length}` : p.label }))} testId="yg-world-page" />
      </div>
      {page === "society" ? <Society g={g} /> : page === "economy" ? <Industry g={g} /> : page === "world" ? <Abroad g={g} /> : <Protests g={g} />}
    </Sheet>
  );
}

const trend = (s: G.GameState, i: number) => {
  const h = s.soc.hist;
  if (h.length < 2) return 0;
  return h[h.length - 1].v[i] - h[Math.max(0, h.length - 4)].v[i];
};

function Society({ g }: { g: Game }) {
  const s = g.s!;
  const [sel, setSel] = useState<S.SocKey>("health");
  const so = s.soc;
  const sp = so.sport;
  const w = G.weekOf(s.week);
  const tournament = sp && sp.year === G.yearOf(s) && !sp.revealed && w >= S.SPORT_START - 1 && w <= S.SPORT_FINAL;
  const k = S.SOC_KEYS.indexOf(sel);
  const def = S.SOC.find((x) => x.id === sel)!;
  return (
    <div data-testid="yg-society">
      <div className="yg-tiles">
        <div className="yg-tile-stat">
          <span>Life expectancy</span>
          <b>{S.lifeExpectancy(s).toFixed(1)} yrs</b>
        </div>
        <div className="yg-tile-stat">
          <span>Trust in politics</span>
          <b>{Math.round(so.idx.trust)}</b>
        </div>
        <div className="yg-tile-stat">
          <span>Season</span>
          <b>
            {S.SEASON_ICON[S.season(s)]} {S.season(s)}
          </b>
        </div>
      </div>
      {tournament && (
        <button type="button" className="yg-cta" disabled={sp!.watched} onClick={() => g.run((x) => S.watchSport(x), undefined, "cheer")} data-testid="yg-sport-watch">
          <span className="yg-cta-icon">🏟️</span>
          <span>
            <b>The {sp!.name} are on</b>
            <small>{sp!.watched ? "You've been to a match" : `Watch a match with the fans (${money(s, 0.3)}). Here's hoping they win…`}</small>
          </span>
        </button>
      )}
      {sp?.revealed && sp.year === G.yearOf(s) && (
        <p className="yg-note">
          🏆 {sp.name}: the national team were {S.stageText(sp.stage)}.
        </p>
      )}
      <Group label="The state of the nation · tap one for its story">
        {S.SOC.map((x, i) => {
          const v = so.idx[x.id];
          const good = S.goodness(x.id, v);
          const t = trend(s, i);
          const better = x.low ? t < 0 : t > 0;
          return (
            <Row key={x.id} on={sel === x.id} onClick={() => setSel(x.id)} testId={`yg-soc-${x.id}`}>
              <span className="yg-tile-ico small">{x.icon}</span>
              <span style={{ width: 104 }}>{x.name}</span>
              <Bar v={good / 100} color={good >= 55 ? "var(--good)" : good >= 42 ? "var(--warn)" : "var(--bad)"} />
              <span className="r" style={{ width: 52 }}>
                {Math.round(v)}
                <small className={Math.abs(t) < 0.3 ? "yg-faint" : better ? "yg-up" : "yg-down"}> {Math.abs(t) < 0.3 ? "→" : t > 0 ? "↑" : "↓"}</small>
              </span>
            </Row>
          );
        })}
      </Group>
      <p className="yg-muted small" style={{ margin: "2px 4px 6px" }}>
        {def.icon} <b>{def.name}</b>: {def.about} {def.low ? "Lower is better." : "Higher is better."} Laws, policies you deliver, executive actions and crises move it; it moves slowly.
      </p>
      {so.hist.length > 2 && <Line values={so.hist.map((h) => h.v[k])} label={`${def.name}, over time`} unit="" color="#64d2ff" digits={0} />}
    </div>
  );
}

function Industry({ g }: { g: Game }) {
  const s = g.s!;
  const so = s.soc;
  const sh = S.sectorShares(s);
  const cycle = s.wd.cycle;
  return (
    <div data-testid="yg-industry">
      <div className="yg-tiles">
        <div className="yg-tile-stat">
          <span>Trade (% GDP)</span>
          <b className={so.trade >= 0 ? "yg-up" : "yg-down"}>
            {so.trade >= 0 ? "+" : ""}
            {so.trade.toFixed(1)}%
          </b>
        </div>
        <div className="yg-tile-stat">
          <span>House prices</span>
          <b>{Math.round(so.homes)}</b>
        </div>
        <div className="yg-tile-stat">
          <span>World economy</span>
          <b>{cycle > 0.5 ? "Booming" : cycle > 0.15 ? "Growing" : cycle > -0.15 ? "Steady" : cycle > -0.5 ? "Slowing" : "Recession"}</b>
        </div>
      </div>
      <Group label="Industries (100 = where they started)">
        {S.SECTORS.map((x) => (
          <Row key={x.id}>
            <span className="yg-tile-ico small">{x.icon}</span>
            <span style={{ width: 110 }}>{x.name}</span>
            <Bar v={sh[x.id] / 0.7} color="#64d2ff" />
            <span className="r small muted" style={{ width: 40 }}>
              {Math.round(sh[x.id] * 100)}%
            </span>
            <span className="r" style={{ width: 42 }}>
              {Math.round(so.sectors[x.id])}
            </span>
          </Row>
        ))}
      </Group>
      <p className="yg-muted small" style={{ margin: "2px 4px" }}>
        Trade, subsidies, energy, carbon and corporate taxes, AI and data rules, schools and immigration all move the industries; so does the world economy. A strong industry lifts growth. House prices follow growth and interest rates; building homes and rent controls hold them back.
      </p>
    </div>
  );
}

function Abroad({ g }: { g: Game }) {
  const s = g.s!;
  const head = s.gov.head === s.you;
  const avg = s.foreign.length ? s.foreign.reduce((a, f) => a + f.rel, 0) / s.foreign.length : 0;
  const next = Object.values(W.SUMMITS)
    .map((x) => ({ ...x, in: (x.week - G.weekOf(s.week) + 52) % 52 }))
    .sort((a, b) => a.in - b.in)[0];
  return (
    <div data-testid="yg-abroad">
      <Group label="The world economy">
        <Row>
          <span className="grow">From recession to boom</span>
          <span className="r small muted">{s.wd.cycle > 0.5 ? "Booming" : s.wd.cycle > 0.15 ? "Growing" : s.wd.cycle > -0.15 ? "Steady" : s.wd.cycle > -0.5 ? "Slowing" : "Recession"}</span>
          <MidBar v={s.wd.cycle} lo={-1} hi={1} w={90} />
        </Row>
        <Row>
          <span className="grow">Next summit</span>
          <span className="r small">
            {next.icon} {next.name}, {next.in ? `in ${next.in} weeks` : "this week"}
          </span>
        </Row>
      </Group>
      <Group label={`Treaties${head ? "" : ` · the ${G.titles(s).head} signs them`}`} testId="yg-treaties">
        {W.TREATIES.map((t) => {
          const on = s.wd.treaties[t.id] !== undefined;
          return (
            <div key={t.id} className="yg-optrow">
              <div className="yg-optrow-main">
                <span className="yg-tile-ico small">{t.icon}</span>
                <span className="grow">
                  <b>{t.name}</b>
                  {on && <span className="yg-tag good">In force</span>}
                  <br />
                  <span className="yg-muted small">{t.about}</span>
                </span>
                {head && (on ? (
                  <button type="button" className="yg-btn small" onClick={() => window.confirm(`Pull out of the ${t.name.toLowerCase()}?`) && g.run((x) => W.withdrawTreaty(x, t.id), undefined, "bad", -1)}>
                    Leave
                  </button>
                ) : (
                  <button type="button" className="yg-btn small primary" disabled={avg < t.minRel} title={avg < t.minRel ? "Relations abroad need to be warmer" : undefined} onClick={() => g.run((x) => W.signTreaty(x, t.id), undefined, "gavel")} data-testid={`yg-treaty-${t.id}`}>
                    Sign
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </Group>
      <Group label="Foreign aid">
        {head ? (
          <div className="yg-scrollseg">
            <Seg value={String(s.wd.aid)} label="Foreign aid" onChange={(v) => g.run((x) => W.setAid(x, Number(v)), undefined, "click", 0)} options={W.AID.map((a, i) => ({ id: String(i), label: a.name }))} testId="yg-aid" />
          </div>
        ) : (
          <Row>
            <span className="grow">Aid budget</span>
            <span className="r">{W.AID[s.wd.aid].name}</span>
          </Row>
        )}
      </Group>
      <Group label={head ? "Sanctions · tap to impose or lift" : "Sanctions"} testId="yg-sanctions">
        {s.foreign.map((f) => (
          <Row key={f.name} onClick={head ? () => window.confirm(f.sanctioned ? `Lift the sanctions on ${f.name}?` : `Put sanctions on ${f.name}? Growth takes a small hit while they last.`) && g.run((x) => W.sanction(x, f.name, !f.sanctioned), undefined, "paper", 0) : undefined}>
            <span className="grow">
              {f.name}
              {f.sanctioned && <span className="yg-tag bad">Sanctioned</span>}
            </span>
            <MidBar v={f.rel} lo={-100} hi={100} w={70} />
          </Row>
        ))}
      </Group>
    </div>
  );
}

function Protests({ g }: { g: Game }) {
  const s = g.s!;
  const mine = G.inGovernment(s);
  const head = s.gov.head === s.you;
  return (
    <div data-testid="yg-protests">
      <p className="yg-lede">When a group feels ignored, it takes to the streets. A big protest wears on the government. Meet them, send in the police, give them what they want, or (in opposition) march with them.</p>
      {!s.soc.protests.length && <p className="yg-empty">The streets are quiet.</p>}
      {s.soc.protests.map((p) => {
        const d = S.PROTEST[p.def];
        const l = G.lawOf(s, p.law);
        const want = l?.options[(s.laws[p.law] ?? 0) + p.dir]?.label;
        const done = p.acted === s.week;
        return (
          <div key={p.id} className="yg-policy" data-testid={`yg-protest-${p.def}`}>
            <div className="yg-policy-head">
              <span className="yg-tile-ico">{d.icon}</span>
              <div className="grow">
                <b>{d.name}</b>
                <p className="yg-muted small">
                  {P.GROUP[d.group]?.icon} {P.GROUP[d.group]?.name} want {l?.name.toLowerCase()} → {want}
                </p>
              </div>
              <span className="yg-tag warn">{s.week - p.week}w</span>
            </div>
            <Row>
              <span style={{ width: 70 }} className="small muted">
                Strength
              </span>
              <Bar v={p.size / 100} color={p.size > 60 ? "var(--bad)" : "var(--warn)"} />
              <span className="r small">{Math.round(p.size)}%</span>
            </Row>
            <div className="yg-actions">
              <button type="button" className="yg-btn small" disabled={done} onClick={() => g.run((x) => S.answerProtest(x, p.id, "meet"), undefined, "paper")} data-testid="yg-protest-meet">
                🤝 Meet them
              </button>
              {head && (
                <button type="button" className="yg-btn small" disabled={done} onClick={() => g.run((x) => S.answerProtest(x, p.id, "police"), undefined, "bad", 0)} data-testid="yg-protest-police">
                  🚓 Police it
                </button>
              )}
              {mine && (
                <button type="button" className="yg-btn small" onClick={() => window.confirm(`Promise them a change to ${l?.name.toLowerCase()}? It becomes a promise you must keep.`) && g.run((x) => S.answerProtest(x, p.id, "concede"), undefined, "cheer")} data-testid="yg-protest-concede">
                  ✋ Give way
                </button>
              )}
              {!mine && (
                <button type="button" className="yg-btn small primary" disabled={done} onClick={() => g.run((x) => S.answerProtest(x, p.id, "join"), undefined, "cheer")} data-testid="yg-protest-join">
                  ✊ March with them
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
