/**
 * Statecraft's pages in the Mandate app: the caucus, the opposition, decrees, the budget, the
 * lobbies, the press (press conferences, interviews, the TV debate) and your legacy, plus the
 * crisis card on the briefing.
 */
import { formatPlaytime, type StringKey } from "../../i18n";
import { DEPT_EFFECT, LEVELS, STANDARD } from "../../politics/budget";
import { CRISES } from "../../politics/crises";
import { DECREES, type DecreeId } from "../../politics/decrees";
import { CONCEDE_CAPITAL, FACTION_COLOR, FACTION_IDS } from "../../politics/factions";
import { ACHIEVEMENT_IDS, ACHIEVEMENTS, RECORD_KEYS, TITLES } from "../../politics/legacy";
import { LOBBIES, type LobbyId } from "../../politics/lobbies";
import { OUTLET_IDS, OUTLETS, QUESTIONS, type OutletId } from "../../politics/media";
import { NEGOTIATE_CAPITAL, OPP, type Stance } from "../../politics/opposition";
import { CHAMBER, MAJORITY, MINISTRIES, PARTY_COLOR, type Faction, type PartyId } from "../../politics/politics";
import type { StatecraftView } from "../../store";
import { useGame, useT, useUI } from "../hooks";
import { Icon } from "../Icons";
import { FACTION_COLOR as GROUP_COLOR } from "../politics";
import { Bar, Card, PartyDot, Portrait, pct, Stacked, Stat, useDistrictName, useMoney } from "./parts";

const useX = () => useUI((s) => s.politics!.x);
const useMinutes = () => useUI((s) => s.minutes);

function Act({ children, onClick, disabled, on, testId, title, className = "" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; on?: boolean; testId?: string; title?: string; className?: string }) {
  return (
    <button type="button" className={`zc-btn min-h-[38px] px-3 text-[0.85em] ${on ? "zc-on" : ""} ${className}`} disabled={disabled} onClick={onClick} data-testid={testId} title={title}>
      {children}
    </button>
  );
}

/** "3h 20m" from game minutes. */
function useIn() {
  const lang = useUI((s) => s.lang);
  return (mins: number) => formatPlaytime(lang, Math.max(0, mins) * 60);
}

/** A −100…100 meter centred on zero. */
function Rel({ value, label }: { value: number; label: string }) {
  const v = Math.round(value);
  return (
    <div className="flex items-center gap-2 text-[0.82em]">
      <span className="w-[6.5em] shrink-0 text-[var(--md-muted)]">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--md-track)]" role="meter" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
        <div className="absolute inset-y-0 start-1/2 w-px bg-white/40" />
        <div className="absolute inset-y-0 rounded-full" style={{ insetInlineStart: v >= 0 ? "50%" : `${50 + v / 2}%`, width: `${Math.abs(v) / 2}%`, background: v >= 0 ? "var(--md-good)" : "var(--md-bad)" }} />
      </div>
      <span className="w-[2.6em] text-end font-black tabular-nums">{v}</span>
    </div>
  );
}

const Votes = ({ f, label }: { f: NonNullable<StatecraftView["budget"]["forecast"]>; label: string }) => {
  const t = useT();
  return (
    <Stacked
      label={label}
      parts={[...f.votes.map((v) => ({ key: v.party, value: v.yes, color: PARTY_COLOR[v.party], name: t(`party.${v.party}` as StringKey) })), { key: "no", value: f.no, color: "var(--md-track)", name: t("md.no") }]}
      marker={MAJORITY / CHAMBER}
    />
  );
};

// ------------------------------------------------------------------ budget

export function BudgetPage() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const inT = useIn();
  const minutes = useMinutes();
  const b = useX().budget;
  const levels = b.draft ?? b.levels;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 @2xl:grid-cols-3">
        <Stat label={b.due ? t("bg.dueLabel") : t("bg.nextLabel")} value={inT((b.due ? b.dueAt : b.nextDay) - minutes)} tone={b.due ? "bad" : undefined} testId="bg-when" />
        <Stat label={t("bg.extra")} value={`${b.draftCost >= 0 ? "+" : ""}${money(b.draftCost)}`} sub={t("bg.perDayVsStandard")} tone={b.draftCost > 0 ? "bad" : b.draftCost < 0 ? "good" : undefined} />
        <Stat label={t("bg.passedLabel")} value={b.passed} sub={b.last ? t(b.last.passed ? "bg.lastPassed" : "bg.lastFailed", { yes: b.last.yes, no: b.last.no }) : "—"} />
      </div>
      <Card title={b.due ? t("bg.draft") : t("bg.inForce")} icon="money" testId="bg-depts">
        <p className="text-[0.88em] text-[var(--md-muted)]">{b.due ? t("bg.dueHint") : t("bg.hint")}</p>
        <div className="grid gap-3 @3xl:grid-cols-2">
          {MINISTRIES.map((m) => {
            const lvl = levels[m];
            const changed = b.due && lvl !== b.levels[m];
            return (
              <div key={m} className="flex flex-col gap-2 rounded-[12px] border border-[var(--md-line)] p-3" data-testid={`bg-${m}`}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-black">{t(`min.${m}` as StringKey)}</span>
                  <span className="md-chip" style={changed ? { background: "var(--md-accent)", color: "#062a30" } : undefined}>
                    {t(`bg.level.${lvl}` as StringKey)}
                  </span>
                </div>
                <p className="text-[0.8em] text-[var(--md-muted)]">{t(`bg.eff.${m}` as StringKey)}</p>
                <div className="flex gap-1" role="radiogroup" aria-label={t(`min.${m}` as StringKey)}>
                  {Array.from({ length: LEVELS }, (_, k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={lvl === k}
                      disabled={!b.due}
                      onClick={() => g.setBudget(m, k)}
                      title={t(`bg.level.${k}` as StringKey)}
                      className="h-8 flex-1 rounded-[8px] text-[0.75em] font-black transition-colors disabled:cursor-not-allowed"
                      style={{ background: k <= lvl ? (k < STANDARD ? "var(--md-bad)" : k === STANDARD ? "var(--md-muted)" : "var(--md-good)") : "var(--md-track)", color: k <= lvl ? "#0b0f14" : "var(--md-muted)", opacity: !b.due && lvl !== k ? 0.7 : 1 }}
                      data-testid={`bg-${m}-${k}`}
                    >
                      {k - STANDARD > 0 ? `+${k - STANDARD}` : k - STANDARD}
                    </button>
                  ))}
                </div>
                <p className="flex flex-wrap gap-1 text-[0.75em]">
                  {Object.entries(DEPT_EFFECT[m]).map(([grp, v]) => {
                    const d = (v ?? 0) * (lvl - STANDARD);
                    if (Math.abs(d) < 0.001) return null;
                    return (
                      <span key={grp} className="md-chip" style={{ background: d > 0 ? "color-mix(in srgb, var(--md-good) 25%, transparent)" : "color-mix(in srgb, var(--md-bad) 25%, transparent)" }}>
                        {t(`f.${grp}` as StringKey)} {d > 0 ? "▲" : "▼"}
                      </span>
                    );
                  })}
                </p>
              </div>
            );
          })}
        </div>
      </Card>
      {b.due && b.forecast && (
        <Card title={t("bg.vote")} icon="vote" testId="bg-vote">
          <Votes f={b.forecast} label={t("forecast", { yes: b.forecast.yes, no: b.forecast.no })} />
          <p className="font-bold" style={{ color: b.forecast.passed ? "var(--md-good)" : "var(--md-bad)" }}>
            {t("forecast", { yes: b.forecast.yes, no: b.forecast.no })} · {t("majorityN", { n: MAJORITY })}
          </p>
          <Act on onClick={() => g.presentBudget()} testId="bg-present" className="self-start">
            <Icon name="vote" size={15} />
            {t("bg.present")}
          </Act>
        </Card>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- decrees

export function DecreesPage() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const inT = useIn();
  const minutes = useMinutes();
  const x = useX();
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-[0.9em] text-[var(--md-muted)]">{t("dc.hint")}</p>
      </Card>
      <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {x.decrees.map((d) => {
          const def = DECREES[d.id as DecreeId];
          return (
            <article key={d.id} className="md-card flex flex-col gap-2 p-4" data-testid={`dc-${d.id}`}>
              <header className="flex items-start gap-2">
                <Icon name="seal" size={20} />
                <h4 className="md-h flex-1 text-[1.05em]">{t(`dc.${d.id}` as StringKey)}</h4>
                {d.active && <span className="md-chip md-chip-on">{t("dc.inForce", { t: inT(d.active - minutes) })}</span>}
              </header>
              <p className="flex-1 text-[0.88em] text-[var(--md-muted)]">{t(`dcd.${d.id}` as StringKey)}</p>
              <p className="flex flex-wrap gap-1 text-[0.78em]">
                <span className="md-chip">{t("dc.capitalN", { n: def.capital })}</span>
                {def.cash ? <span className="md-chip">{money(def.cash)}</span> : null}
                <span className="md-chip">{def.hours ? t("dc.lasts", { n: def.hours }) : t("dc.oneOff")}</span>
              </p>
              <Act on={d.can} onClick={() => g.issueDecree(d.id as DecreeId)} disabled={!d.can} testId={`dc-${d.id}-go`} className="self-start">
                {d.active ? t("dc.active") : d.readyAt > minutes ? t("dc.cooldown", { t: inT(d.readyAt - minutes) }) : t("dc.issue")}
              </Act>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- lobbies

export function LobbiesPage() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const inT = useIn();
  const minutes = useMinutes();
  const x = useX();
  const policies = useUI((s) => s.politics!.policies);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-[0.9em] text-[var(--md-muted)]">{t("lb.hint")}</p>
        <Bar label={t("lb.exposure")} value={x.exposure / 100} right={Math.round(x.exposure)} color={x.exposure > 40 ? "var(--md-bad)" : "var(--md-accent)"} hint={t("lb.exposureHint")} />
        <p className="text-[0.78em] text-[var(--md-muted)]">{t("lb.exposureHint")}</p>
      </Card>
      <div className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        {x.lobbies.map((l) => {
          const def = LOBBIES[l.id as LobbyId];
          return (
            <article key={l.id} className="md-card flex flex-col gap-2 p-4" data-testid={`lb-${l.id}`}>
              <header className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: def.color, color: "#0b0f14" }}>
                  <Icon name="handshake" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="md-h truncate">{t(`lb.${l.id}` as StringKey)}</h4>
                  <p className="text-[0.75em] text-[var(--md-muted)]">{Object.keys(def.groups).map((grp) => t(`f.${grp}` as StringKey)).join(" · ")}</p>
                </div>
              </header>
              <p className="text-[0.82em] text-[var(--md-muted)]">{t(`lbd.${l.id}` as StringKey)}</p>
              <Rel value={l.relation} label={t("relations")} />
              <Bar label={t("lb.power")} value={l.power / 100} right={l.power} color={def.color} />
              <p className="text-[0.78em]">
                <span className="md-label">{t("lb.likes")} </span>
                {def.likes.map((law) => (
                  <span key={law} className="md-chip me-1 mt-1" style={policies.includes(law) ? { background: "color-mix(in srgb, var(--md-good) 30%, transparent)" } : undefined}>
                    {t(`pol.${law}` as StringKey)}
                  </span>
                ))}
              </p>
              <p className="text-[0.78em]">
                <span className="md-label">{t("lb.hates")} </span>
                {def.hates.map((law) => (
                  <span key={law} className="md-chip me-1 mt-1" style={policies.includes(law) ? { background: "color-mix(in srgb, var(--md-bad) 30%, transparent)" } : undefined}>
                    {t(`pol.${law}` as StringKey)}
                  </span>
                ))}
              </p>
              {l.ask && (
                <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--md-accent)] p-2.5" data-testid={`lb-${l.id}-ask`}>
                  <p className="font-bold">{l.ask.kind === "demand" ? t("lb.demand", { law: t(`pol.${l.ask.law}` as StringKey) }) : t("lb.offer", { money: money(l.ask.amount) })}</p>
                  <p className="text-[0.78em] text-[var(--md-muted)]">{t("lb.until", { t: inT(l.ask.until - minutes) })}</p>
                  <div className="flex gap-2">
                    {l.ask.kind === "offer" && (
                      <Act on onClick={() => g.acceptOffer(l.id as LobbyId)} testId={`lb-${l.id}-accept`}>
                        {t("lb.accept")}
                      </Act>
                    )}
                    <Act onClick={() => g.declineAsk(l.id as LobbyId)}>{t("lb.decline")}</Act>
                  </div>
                </div>
              )}
              <Act onClick={() => g.meetLobby(l.id as LobbyId)} disabled={!l.canMeet} testId={`lb-${l.id}-meet`} className="self-start">
                <Icon name="people" size={15} />
                {t("lb.meet", { n: 4 })}
              </Act>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- media

export function MediaPage() {
  const g = useGame();
  const t = useT();
  const x = useX();
  const m = x.media;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-4">
        {OUTLET_IDS.map((o) => (
          <article key={o} className="md-card flex flex-col gap-2 p-4" data-testid={`me-${o}`}>
            <header className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] font-black" style={{ background: OUTLETS[o].color, color: "#0b0f14" }}>
                <Icon name={o === "channel9" ? "mic" : "news"} size={18} />
              </span>
              <h4 className="md-h flex-1">{t(`out.${o}` as StringKey)}</h4>
            </header>
            <p className="text-[0.8em] text-[var(--md-muted)]">{t(`outd.${o}` as StringKey)}</p>
            <Rel value={m.rel[o]} label={t("me.coverage")} />
            <p className="flex flex-wrap gap-1 text-[0.72em]">
              {Object.entries(OUTLETS[o].readers).map(([grp, w]) => (
                <span key={grp} className="md-chip">
                  {t(`f.${grp}` as StringKey)} {pct(w ?? 0)}
                </span>
              ))}
            </p>
            <Act onClick={() => g.interview(o as OutletId)} disabled={!m.interviewReady} testId={`me-${o}-interview`} className="self-start">
              <Icon name="mic" size={15} />
              {t("me.interviewWith", { outlet: t(`out.${o}` as StringKey) })}
            </Act>
          </article>
        ))}
      </div>
      <PressPanel />
      <DebatePanel />
    </div>
  );
}

/** The press conference: one question at a time, three answers each. */
function PressPanel() {
  const g = useGame();
  const t = useT();
  const m = useX().media;
  return (
    <Card title={t("me.pressTitle")} icon="mic" testId="me-press">
      {m.press ? (
        <>
          <p className="md-label">{t("me.questionN", { i: m.press.i + 1, n: m.press.n })}</p>
          <p className="text-[1.15em] font-black">“{t(`q.${m.press.q}` as StringKey)}”</p>
          <div className="flex flex-col gap-2">
            {(["a", "b", "c"] as const).map((k, i) => (
              <button key={k} type="button" className="zc-btn justify-start text-start" onClick={() => g.answerPress(i)} data-testid={`me-answer-${i}`}>
                <span className="md-chip">{k.toUpperCase()}</span>
                <span className="flex-1">{t(`q.${m.press!.q}.${k}` as StringKey)}</span>
                <AnswerHint q={m.press!.q} i={i} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-[0.9em] text-[var(--md-muted)]">{t("me.pressHint")}</p>
          <Act on onClick={() => g.startPress()} disabled={!m.pressReady} testId="me-press-start" className="self-start">
            {m.pressReady ? t("me.pressStart") : t("me.pressWait")}
          </Act>
          <p className="text-[0.8em] text-[var(--md-muted)]">{t("me.pressHeld", { n: m.pressHeld })}</p>
        </>
      )}
    </Card>
  );
}

/** Who an answer pleases and annoys (groups only; the outlets are a surprise). */
function AnswerHint({ q, i }: { q: keyof typeof QUESTIONS; i: number }) {
  const t = useT();
  const mood = QUESTIONS[q].answers[i].mood;
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {Object.entries(mood).map(([grp, v]) =>
        v ? (
          <span key={grp} className="h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLOR[grp as Faction], opacity: v > 0 ? 1 : 0.35, outline: v < 0 ? "1.5px solid var(--md-bad)" : undefined }} title={`${t(`f.${grp}` as StringKey)} ${v > 0 ? "▲" : "▼"}`} />
        ) : null,
      )}
    </span>
  );
}

/** The TV debate: three rounds against the biggest rival party's leader. */
export function DebatePanel() {
  const g = useGame();
  const t = useT();
  const x = useX();
  const p = useUI((s) => s.politics!);
  const result = useUI((s) => s.debateResult);
  const d = x.media.debate;
  const rival = d?.rival ?? (OPP.reduce((a, b) => (p.parl.seats[b] > p.parl.seats[a] ? b : a)) as PartyId);
  const leader = x.opp.leaders[rival as (typeof OPP)[number]];
  return (
    <Card title={t("me.debateTitle")} icon="columns" testId="me-debate">
      <div className="flex items-center gap-3">
        <Portrait face={leader?.face ?? 1} party={rival} size={56} label={leader?.name} />
        <div className="min-w-0 flex-1">
          <p className="font-black">{leader?.name}</p>
          <p className="text-[0.8em] text-[var(--md-muted)]">
            {t(`party.${rival}` as StringKey)} · {t(`op.style.${leader?.style ?? "pragmatic"}` as StringKey)}
          </p>
        </div>
      </div>
      {d ? (
        <>
          {d.log.map((r, i) => (
            <p key={i} className="text-[0.82em] text-[var(--md-muted)]">
              {t("me.round", { i: i + 1 })}: {t(`q.${r.q}` as StringKey)} — {t("me.rivalSaid", { name: leader?.name ?? "" })} “{t(`q.${r.q}.${"abc"[r.ra]}` as StringKey)}” ({r.you >= r.them ? "✓" : "✗"})
            </p>
          ))}
          <p className="md-label">{t("me.round", { i: d.i + 1 })}</p>
          <p className="text-[1.15em] font-black">“{t(`q.${d.qs[d.i]}` as StringKey)}”</p>
          <div className="flex flex-col gap-2">
            {(["a", "b", "c"] as const).map((k, i) => (
              <button key={k} type="button" className="zc-btn justify-start text-start" onClick={() => g.debateAnswer(i)} data-testid={`me-debate-${i}`}>
                <span className="md-chip">{k.toUpperCase()}</span>
                <span className="flex-1">{t(`q.${d.qs[d.i]}.${k}` as StringKey)}</span>
                <AnswerHint q={d.qs[d.i]} i={i} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {result && (
            <p className="rounded-[10px] p-2 font-black" style={{ background: result.won ? "color-mix(in srgb, var(--md-good) 22%, transparent)" : "color-mix(in srgb, var(--md-bad) 22%, transparent)" }} data-testid="me-debate-result">
              {result.won ? t("me.youWon") : t("me.youLost")} · {t("me.score", { you: Math.round(result.you * 10), them: Math.round(result.them * 10) })}
            </p>
          )}
          <p className="text-[0.9em] text-[var(--md-muted)]">{t("me.debateHint")}</p>
          <Act on onClick={() => g.startDebate()} disabled={!x.media.debateReady} testId="me-debate-start" className="self-start">
            {x.media.debateReady ? t("me.debateStart", { name: leader?.name ?? "" }) : p.parl.campaign.debated ? t("me.debateDone") : t("me.debateNotYet")}
          </Act>
        </>
      )}
    </Card>
  );
}

// --------------------------------------------------------------- opposition

export function OppositionPage() {
  const g = useGame();
  const t = useT();
  const inT = useIn();
  const minutes = useMinutes();
  const x = useX();
  const p = useUI((s) => s.politics!);
  return (
    <div className="flex flex-col gap-4">
      <Card title={t("op.bills")} icon="vote" testId="op-bills">
        <p className="text-[0.88em] text-[var(--md-muted)]">{t("op.hint")}</p>
        {x.opp.bills.length === 0 && <p className="font-semibold text-[var(--md-muted)]">{t("op.noBills")}</p>}
        {x.opp.bills.map((b) => (
          <div key={b.id} className="flex flex-col gap-2 rounded-[12px] border border-[var(--md-line)] p-3" data-testid={`op-bill-${b.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <PartyDot party={b.party} />
              <span className="flex-1 font-black">
                {b.enable ? "" : `${t("repeal")}: `}
                {t(`pol.${b.law}` as StringKey)}
              </span>
              <span className="md-chip">{t("op.votesIn", { t: inT(b.voteAt - minutes) })}</span>
            </div>
            <p className="text-[0.8em] text-[var(--md-muted)]">{t("op.byParty", { party: t(`party.${b.party}` as StringKey), name: x.opp.leaders[b.party].name })}</p>
            <Votes f={b.forecast} label={t("forecast", { yes: b.forecast.yes, no: b.forecast.no })} />
            <p className="text-[0.85em] font-bold" style={{ color: b.forecast.passed ? "var(--md-bad)" : "var(--md-good)" }}>
              {t(b.forecast.passed ? "op.wouldPass" : "op.wouldFail", { yes: b.forecast.yes, no: b.forecast.no })}
            </p>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("op.yourMembers")}>
              {(["free", "support", "oppose"] as Stance[]).map((st) => (
                <button key={st} type="button" role="radio" aria-checked={b.stance === st} className={`zc-btn min-h-[34px] px-3 text-[0.82em] ${b.stance === st ? "zc-on" : ""}`} onClick={() => g.oppStance(b.id, st)} data-testid={`op-${b.id}-${st}`}>
                  {t(`op.${st}` as StringKey)}
                </button>
              ))}
              <Act onClick={() => g.negotiate(b.id)} disabled={p.parl.capital < NEGOTIATE_CAPITAL} testId={`op-${b.id}-negotiate`}>
                {t("op.negotiateN", { n: NEGOTIATE_CAPITAL })}
              </Act>
            </div>
          </div>
        ))}
        <p className="text-[0.8em] text-[var(--md-muted)]">{t("op.record", { d: x.opp.defeated, l: x.opp.lost })}</p>
      </Card>
      <div className="grid gap-3 @3xl:grid-cols-2">
        {OPP.map((q) => {
          const l = x.opp.leaders[q];
          return (
            <article key={q} className="md-card flex flex-col gap-2 p-4" data-testid={`op-${q}`}>
              <div className="flex items-center gap-3">
                <Portrait face={l.face} party={q} size={56} label={l.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black">{l.name}</p>
                  <p className="text-[0.8em] text-[var(--md-muted)]">
                    {t("op.leaderOf", { party: t(`party.${q}` as StringKey) })} · {t(`op.style.${l.style}` as StringKey)}
                  </p>
                </div>
                <span className="md-chip">{t("seats", { n: p.parl.seats[q] })}</span>
              </div>
              <Bar label={t("md.charisma")} value={l.charisma / 10} right={`${l.charisma}/10`} color={PARTY_COLOR[q]} />
              <Bar label={t("op.ground")} value={x.opp.effort[q] / 100} right={Math.round(x.opp.effort[q])} color={PARTY_COLOR[q]} />
              <Rel value={p.parl.relations[q]} label={t("relations")} />
              <p className="text-[0.8em] text-[var(--md-muted)]">{t(`op.styled.${l.style}` as StringKey)}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ caucus

export function CaucusPage() {
  const g = useGame();
  const t = useT();
  const x = useX();
  const p = useUI((s) => s.politics!);
  const f = x.factions;
  const unity = (f.sat.moderates * f.strength.moderates + f.sat.progressives * f.strength.progressives + f.sat.traditionalists * f.strength.traditionalists) / 100;
  return (
    <div className="flex flex-col gap-4">
      {f.challenge && (
        <Card title={t("fc.challengeT", { name: f.challenge.name, faction: t(`fc.${f.challenge.faction}` as StringKey) })} icon="flag" testId="fc-challenge" className="border-[var(--md-bad)]">
          <p className="text-[0.9em]">{t("fc.challengeB")}</p>
          <Bar label={t("fc.ballot")} value={f.challenge.ballot} color={f.challenge.ballot >= 0.5 ? "var(--md-good)" : "var(--md-bad)"} />
          <div className="flex flex-wrap gap-2">
            <Act onClick={() => g.concede()} disabled={p.parl.capital < CONCEDE_CAPITAL} testId="fc-concede">
              {t("fc.concedeN", { n: CONCEDE_CAPITAL })}
            </Act>
            <Act on onClick={() => g.fightChallenge()} testId="fc-fight">
              {t("fc.fight")}
            </Act>
          </div>
        </Card>
      )}
      <div className="grid gap-2 @2xl:grid-cols-3">
        <Stat label={t("fc.unity")} value={`${Math.round(unity * 100)}%`} tone={unity < 0.4 ? "bad" : unity > 0.65 ? "good" : undefined} testId="fc-unity" />
        <Stat label={t("fc.deputyLabel")} value={f.deputy ?? "—"} />
        <Stat label={t("lg.rec.challengesSurvived")} value={x.legacy.rec.challengesSurvived} />
      </div>
      <p className="text-[0.9em] text-[var(--md-muted)]">{t("fc.hint")}</p>
      <div className="grid gap-3 @3xl:grid-cols-3">
        {FACTION_IDS.map((id) => {
          const members = p.m.roster.filter((r) => f.of[r.id] === id);
          return (
            <Card key={id} title={t(`fc.${id}` as StringKey)} icon="people" testId={`fc-${id}`}>
              <p className="text-[0.82em] text-[var(--md-muted)]">{t(`fcd.${id}` as StringKey)}</p>
              <Bar label={t("fc.satisfaction")} value={f.sat[id] / 100} color={f.sat[id] < 30 ? "var(--md-bad)" : FACTION_COLOR[id]} />
              <Bar label={t("fc.strength")} value={f.strength[id]} color={FACTION_COLOR[id]} />
              {f.wish[id] && <p className="text-[0.82em]">{t("wants", { law: t(`pol.${f.wish[id]}` as StringKey) })}</p>}
              <div className="flex flex-wrap gap-1" aria-label={t("md.politicians")}>
                {members.map((r) => (
                  <span key={r.id} title={r.name}>
                    <Portrait face={r.face} party="civic" size={34} label={r.name} />
                  </span>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ legacy

export function LegacyPage() {
  const t = useT();
  const x = useX();
  const l = x.legacy;
  const nextAt = l.next?.at ?? l.points;
  const prevAt = [...TITLES].reverse().find((tt) => tt.at <= l.points)?.at ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <Card testId="lg-title">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-[18px]" style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#3a2400" }}>
            <Icon name="star" size={32} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="md-label">{t("lg.yourTitle")}</p>
            <h2 className="md-h text-[1.7em]">{t(`lg.title.${l.title}` as StringKey)}</h2>
            <p className="text-[var(--md-muted)]">{t("lg.points", { n: l.points })}</p>
          </div>
        </div>
        {l.next && <Bar label={t("lg.next", { title: t(`lg.title.${l.next.id}` as StringKey), n: l.next.at })} value={(l.points - prevAt) / Math.max(1, nextAt - prevAt)} right={`${l.points}/${l.next.at}`} color="#fbbf24" />}
      </Card>
      <Card title={t("lg.record")} icon="log">
        <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4 @6xl:grid-cols-7">
          {RECORD_KEYS.map((k) => (
            <Stat key={k} label={t(`lg.rec.${k}` as StringKey)} value={l.rec[k]} />
          ))}
          <Stat label={t("lg.peak")} value={`${l.peak}%`} />
        </div>
      </Card>
      <Card title={t("lg.achievements")} icon="star" action={<span className="md-label">{`${l.unlocked.length}/${ACHIEVEMENT_IDS.length}`}</span>} testId="lg-achievements">
        <ul className="grid gap-2 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {ACHIEVEMENT_IDS.map((id) => {
            const got = l.unlocked.includes(id);
            return (
              <li key={id} className="flex items-start gap-3 rounded-[12px] border border-[var(--md-line)] p-3" style={{ opacity: got ? 1 : 0.55 }} data-testid={`lg-${id}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: got ? "#fbbf24" : "var(--md-track)", color: got ? "#3a2400" : "var(--md-muted)" }}>
                  <Icon name={got ? "star" : "check"} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-black">{t(`lg.a.${id}` as StringKey)}</span>
                  <span className="block text-[0.8em] text-[var(--md-muted)]">{t(`lg.ad.${id}` as StringKey)}</span>
                </span>
                <span className="md-chip shrink-0">+{ACHIEVEMENTS[id].points}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ crisis

/** The crisis on your desk, with its three responses. */
export function CrisisCard() {
  const g = useGame();
  const t = useT();
  const inT = useIn();
  const dname = useDistrictName();
  const minutes = useMinutes();
  const c = useX().crisis;
  const districts = useUI((s) => s.politics!.m.districts);
  const money = useMoney();
  if (!c) return null;
  const stage = CRISES[c.id].stages[c.stage];
  const d = districts.find((x) => x.id === c.district);
  const vars = { district: d ? dname(d.name) : t("md.wholeCity"), group: c.group ? t(`f.${c.group}` as StringKey) : "" };
  return (
    <section className="md-card flex flex-col gap-3 border-[var(--md-bad)] p-4" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--md-bad) 18%, var(--md-card)), var(--md-card))" }} data-testid="cr-card" aria-live="polite">
      <p className="md-label flex items-center gap-2" style={{ color: "var(--md-bad)" }}>
        <Icon name="fire" size={16} />
        {t("cr.label")} · {t("cr.timeLeft", { t: inT(c.until - minutes) })}
      </p>
      <h3 className="md-h text-[1.3em]">{t(`cr.${c.id}.t` as StringKey)}</h3>
      <p className="text-[0.95em]">{t(`cr.${c.id}.${c.stage}` as StringKey, vars)}</p>
      {c.id !== "crunch" && (
        <button type="button" className="zc-btn self-start" onClick={() => g.showCrisis()} data-testid="cr-show">
          <Icon name="pin" size={16} />
          {t("cr.show")}
        </button>
      )}
      <div className="grid gap-2 @3xl:grid-cols-3">
        {stage.options.map((o, i) => (
          <button key={i} type="button" className="zc-btn flex-col items-start gap-1 py-2 text-start" disabled={!c.can[i]} onClick={() => g.respondCrisis(i)} data-testid={`cr-opt-${i}`}>
            <span className="font-black">{t(`cr.${c.id}.${c.stage}.${i}` as StringKey)}</span>
            <span className="flex flex-wrap gap-1 text-[0.75em] font-semibold opacity-80">
              {o.cash ? <span>{o.cash > 0 ? "+" : ""}{money(o.cash)}</span> : null}
              {o.capital ? <span>{t("dc.capitalN", { n: -o.capital })}</span> : null}
              {o.chance !== undefined ? <span>{t("cr.chance", { n: Math.round(o.chance * 100) })}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
