import { formatPlaytime, type StringKey } from "../i18n";
import { COUNCIL_SEATS, DILEMMAS, FACTIONS, POLICIES, POLICY_IDS, PROMISE_IDS, TOWN_HALL_COST, type DilemmaId, type Faction } from "../politics/politics";
import type { HallTab } from "../store";
import { theme } from "../theme";
import { Segmented } from "./common";
import { useGame, useNum, useT, useUI } from "./hooks";
import { Icon } from "./Icons";

/** Council seat colours, one per voter group (always shown with the group's name). */
export const FACTION_COLOR: Record<Faction, string> = {
  workers: "#f59e0b",
  business: "#60a5fa",
  families: "#f472b6",
  greens: "#4ade80",
  seniors: "#c4b5fd",
};

function useMoney() {
  const num = useNum();
  return (n: number) => `${n < 0 ? "−" : ""}$${num(Math.abs(Math.round(n)))}`;
}

/** The treasury chip that replaces UNLIMITED in Mayor mode. */
export function TreasuryChip() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = useUI((s) => s.politics);
  if (!p) return null;
  const neg = p.cash < 0;
  return (
    <button type="button" className="zc-glass-dark zc-btn rounded-full px-4 font-black" onClick={() => g.openHall("budget")} aria-label={`${t("treasury")}: ${money(p.cash)}`} data-testid="zc-treasury">
      <Icon name="money" size={18} style={{ color: neg ? theme.danger : theme.on }} />
      <span className="tabular-nums" style={{ color: neg ? theme.danger : undefined }} data-testid="zc-cash">
        {money(p.cash)}
      </span>
      <span className="hidden text-[0.75em] tabular-nums opacity-75 @5xl:inline">
        {p.net >= 0 ? "+" : ""}
        {money(p.net)}
      </span>
    </button>
  );
}

/** City Hall button with the overall approval. */
export function HallButton() {
  const g = useGame();
  const t = useT();
  const p = useUI((s) => s.politics);
  const hall = useUI((s) => s.hall);
  if (!p) return null;
  const a = Math.round(p.overall);
  return (
    <button type="button" aria-pressed={!!hall} className="zc-glass-dark zc-btn rounded-full px-4 font-black" onClick={() => g.openHall(hall ? null : "overview")} aria-label={`${t("cityHall")}: ${t("approval")} ${a}%`} data-testid="zc-hall">
      <Icon name="hall" size={18} />
      <span className="tabular-nums" data-testid="zc-approval">
        {a}%
      </span>
      {p.dilemma && <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f5b942" }} aria-hidden />}
    </button>
  );
}

function Meter({ value, label, sub, testId }: { value: number; label: string; sub?: string; testId?: string }) {
  const low = value < 40;
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold">{label}</span>
        <span className="font-black tabular-nums" style={{ color: low ? theme.danger : undefined }}>
          {Math.round(value)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: low ? theme.danger : "var(--zc-accent)" }} />
      </div>
      {sub && <span className="text-[0.78em] opacity-65">{sub}</span>}
    </div>
  );
}

/** Daily approval polls as a small line chart with a 50% line. */
function PollChart({ polls }: { polls: { m: number; a: number }[] }) {
  const t = useT();
  if (polls.length < 2) return null;
  const W = 300;
  const H = 70;
  const x = (i: number) => 4 + (i / (polls.length - 1)) * (W - 8);
  const y = (a: number) => H - 4 - (a / 100) * (H - 8);
  const d = polls.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.a).toFixed(1)}`).join(" ");
  const last = polls[polls.length - 1];
  return (
    <figure className="m-0">
      <figcaption className="zc-label mb-1 opacity-70">{t("polls")}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[70px] w-full" role="img" aria-label={`${t("polls")}: ${polls.map((p) => p.a).join(", ")}%`}>
        <line x1="0" x2={W} y1={y(50)} y2={y(50)} stroke="rgba(255,255,255,.18)" strokeDasharray="3 4" />
        <path d={d} fill="none" stroke="var(--zc-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(polls.length - 1)} cy={y(last.a)} r="4" fill="var(--zc-accent)" stroke="#0b0f14" strokeWidth="2" />
        {polls.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.a)} r="9" fill="transparent">
            <title>{`${p.a}%`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

function Overview() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = useUI((s) => s.politics)!;
  const lang = useUI((s) => s.lang);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="zc-pill" style={{ background: "var(--zc-accent)", color: "var(--zc-ink)" }}>
          {t("termN", { n: p.term })}
        </span>
        <span className="font-bold" data-testid="zc-election-in">
          {t("electionIn", { t: formatPlaytime(lang, p.termLeft * 60) })}
        </span>
      </div>
      {p.challenger && (
        <p className="flex items-center gap-2 rounded-[var(--zc-rs)] bg-white/5 p-2 text-[0.9em] font-semibold">
          <Icon name="mega" size={18} />
          {t("campaignOn", { name: p.challenger })}
        </p>
      )}
      <Meter value={p.overall} label={t("approval")} testId="zc-overall" />
      <PollChart polls={p.polls} />
      <div className="flex flex-col gap-3">
        {FACTIONS.map((f) => (
          <Meter key={f} value={p.approval[f]} label={`${t(`f.${f}` as StringKey)} · ${Math.round(p.shares[f] * 100)}%`} sub={t(`fw.${f}` as StringKey)} testId={`zc-f-${f}`} />
        ))}
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="zc-label opacity-70">{t("promise")}</h3>
        {p.promise ? (
          <p className="flex items-center justify-between gap-2 rounded-[var(--zc-rs)] bg-white/5 p-2 font-semibold" data-testid="zc-promise">
            <span>{t(`pr.${p.promise}` as StringKey)}</span>
            <span className="zc-pill" style={{ background: p.promiseKept ? theme.on : "#f5b942", color: "#0b0f14" }}>
              {p.promiseKept ? t("promiseOnTrack") : t("promiseOffTrack")}
            </span>
          </p>
        ) : (
          <>
            <p className="text-[0.85em] opacity-70">{t("promiseHint")}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {PROMISE_IDS.map((id) => (
                <button key={id} type="button" className="zc-row min-h-[44px] text-[0.9em] font-semibold" onClick={() => g.promise(id)} data-testid={`zc-pr-${id}`}>
                  <Icon name="check" size={16} />
                  {t(`pr.${id}` as StringKey)}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      <button type="button" className="zc-btn" disabled={!p.townHallReady} onClick={() => g.townHall()} data-testid="zc-townhall">
        <Icon name="people" size={18} />
        {p.townHallReady ? `${t("townHall")} · ${money(TOWN_HALL_COST)}` : t("townHallWait")}
      </button>
    </div>
  );
}

function Budget() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = useUI((s) => s.politics)!;
  const l = p.ledger;
  const row = (label: string, v: number, testId?: string) => (
    <div className="flex justify-between gap-2 py-0.5" data-testid={testId}>
      <span className="opacity-80">{label}</span>
      <span className="font-bold tabular-nums">{money(v)}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="zc-label opacity-70">{t("treasury")}</span>
        <span className="text-[1.6em] font-black tabular-nums" style={{ color: p.cash < 0 ? theme.danger : undefined }}>
          {money(p.cash)}
        </span>
      </div>
      {(["R", "C", "I"] as const).map((z) => (
        <label key={z} className="flex flex-col gap-1">
          <span className="flex justify-between font-bold">
            <span>{t(`tax.${z}` as StringKey)}</span>
            <span className="tabular-nums" data-testid={`zc-tax-${z}-value`}>
              {Math.round(p.taxes[z] * 100)}%
            </span>
          </span>
          <input type="range" min={0} max={20} step={1} value={Math.round(p.taxes[z] * 100)} onChange={(e) => g.setTax(z, Number(e.target.value) / 100)} aria-label={t(`tax.${z}` as StringKey)} data-testid={`zc-tax-${z}`} />
        </label>
      ))}
      <p className="text-[0.82em] opacity-70">{t("taxHint")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h3 className="zc-label mb-1 opacity-70">
            {t("income")} · {t("perDay", { n: "" }).trim()}
          </h3>
          {row(t("tax.R"), l.income.R)}
          {row(t("tax.C"), l.income.C)}
          {row(t("tax.I"), l.income.I)}
        </section>
        <section>
          <h3 className="zc-label mb-1 opacity-70">{t("upkeep")}</h3>
          {row(t("up.roads"), -l.upkeep.roads)}
          {row(t("up.services"), -l.upkeep.services)}
          {row(t("up.policies"), -l.upkeep.policies)}
          {row(t("up.transit"), -l.upkeep.transit)}
        </section>
      </div>
      <div className="flex justify-between border-t border-white/10 pt-2 text-[1.1em] font-black">
        <span>{t("balance")}</span>
        <span className="tabular-nums" style={{ color: p.net < 0 ? theme.danger : theme.on }} data-testid="zc-net">
          {t("perDay", { n: `${p.net >= 0 ? "+" : ""}${money(p.net)}` })}
        </span>
      </div>
    </div>
  );
}

function Policies() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = useUI((s) => s.politics)!;
  const bill = useUI((s) => s.bill);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.82em] opacity-70">{t("councilHint")}</p>
      {bill && (
        <div className="rounded-[var(--zc-rs)] p-3" style={{ background: bill.passed ? "color-mix(in srgb, var(--zc-on) 18%, transparent)" : "color-mix(in srgb, var(--zc-danger) 18%, transparent)" }} role="status" data-testid="zc-bill">
          <p className="font-black">
            {t(`pol.${bill.policy}` as StringKey)} ·{" "}
            {t(bill.passed ? "billPassed" : "billFailed", { yes: bill.votes.filter((v) => v.yes).length, no: bill.votes.filter((v) => !v.yes).length })}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {bill.votes.map((v, i) => (
              <span key={i} className="zc-pill" style={{ background: FACTION_COLOR[v.faction], color: "#0b0f14", opacity: v.yes ? 1 : 0.45 }}>
                {t(`f.${v.faction}` as StringKey)} · {v.yes ? t("yes") : t("no")}
              </span>
            ))}
          </div>
        </div>
      )}
      {POLICY_IDS.map((id) => {
        const on = p.policies.includes(id);
        return (
          <div key={id} className="flex items-center gap-3 rounded-[var(--zc-rs)] bg-white/5 p-2" data-testid={`zc-pol-${id}`}>
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {t(`pol.${id}` as StringKey)}
                {on && (
                  <span className="zc-pill ms-2" style={{ background: theme.on, color: "#0b0f14" }}>
                    {t("inForce")}
                  </span>
                )}
              </p>
              <p className="text-[0.82em] opacity-70">
                {t(`pold.${id}` as StringKey)}
                {POLICIES[id].cost > 0 && ` · ${t("perDay", { n: money(POLICIES[id].cost) })}`}
              </p>
            </div>
            <button type="button" className={`zc-btn shrink-0 ${on ? "" : "zc-on"}`} onClick={() => g.proposePolicy(id, !on)} data-testid={`zc-pol-${id}-go`}>
              <Icon name="vote" size={16} />
              {on ? t("repeal") : t("propose")}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Council() {
  const t = useT();
  const p = useUI((s) => s.politics)!;
  const counts = FACTIONS.map((f) => ({ f, n: p.council.filter((c) => c === f).length })).filter((x) => x.n > 0);
  return (
    <div className="flex flex-col gap-4">
      <svg viewBox="0 0 220 110" className="mx-auto w-full max-w-[320px]" role="img" aria-label={counts.map((c) => `${t(`f.${c.f}` as StringKey)} ${c.n}`).join(", ")}>
        {p.council.map((f, i) => {
          const a = Math.PI - (Math.PI * (i + 0.5)) / COUNCIL_SEATS;
          return <circle key={i} cx={110 + Math.cos(a) * 80} cy={100 - Math.sin(a) * 80} r="13" fill={FACTION_COLOR[f]} stroke="#0b0f14" strokeWidth="2" />;
        })}
      </svg>
      <ul className="flex flex-col gap-1" data-testid="zc-council">
        {counts.map(({ f, n }) => (
          <li key={f} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: FACTION_COLOR[f] }} aria-hidden />
            <span className="flex-1 font-semibold">{t(`f.${f}` as StringKey)}</span>
            <span className="tabular-nums opacity-80">{t("seats", { n })}</span>
            <span className="w-[3em] text-end font-black tabular-nums">{Math.round(p.approval[f])}%</span>
          </li>
        ))}
      </ul>
      <p className="text-[0.82em] opacity-70">{t("councilHint")}</p>
    </div>
  );
}

/** City Hall: overview, budget, policies, council. */
export function CityHall() {
  const g = useGame();
  const t = useT();
  const hall = useUI((s) => s.hall);
  const p = useUI((s) => s.politics);
  if (!hall || !p) return null;
  const tabs: HallTab[] = ["overview", "budget", "policies", "council"];
  return (
    <section className="zc-glass zc-slide pointer-events-auto absolute end-2 top-[calc(var(--zc-top,3rem)+1rem)] flex max-h-[calc(100%-var(--zc-top,3rem)-8.5rem)] w-[min(94%,420px)] flex-col sm:end-3" aria-label={t("cityHall")} data-testid="zc-cityhall">
      <div className="flex items-center gap-2 p-3 pb-2">
        <Icon name="hall" size={20} />
        <h2 className="zc-h flex-1 text-[1.15em]">{t("cityHall")}</h2>
        <button type="button" className="zc-btn px-0" onClick={() => g.openHall(null)} aria-label={t("close")} data-testid="zc-hall-close">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="px-3">
        <Segmented label={t("cityHall")} value={hall} onChange={(v) => g.openHall(v)} options={tabs.map((id) => ({ id, label: t(`ph.${id}` as StringKey) }))} testId="zc-ph" />
      </div>
      <div className="zc-scroll min-h-0 flex-1 p-3">
        {hall === "overview" && <Overview />}
        {hall === "budget" && <Budget />}
        {hall === "policies" && <Policies />}
        {hall === "council" && <Council />}
      </div>
    </section>
  );
}

/** The dilemma on the mayor's desk, as a card with its two answers. */
export function DilemmaCard() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = useUI((s) => s.politics);
  const election = useUI((s) => s.election);
  const id = p?.dilemma;
  if (!id || election) return null;
  return (
    <section className="zc-glass zc-slide pointer-events-auto absolute start-2 top-[calc(var(--zc-top,3rem)+1rem)] w-[min(92%,340px)] p-4 sm:start-3" aria-live="polite" aria-label={t("decision")} data-testid="zc-dilemma">
      <p className="zc-label flex items-center gap-2 opacity-75">
        <Icon name="mega" size={16} />
        {t("decision")}
      </p>
      <h3 className="zc-h mt-1 text-[1.15em]">{t(`d.${id}.t` as StringKey)}</h3>
      <p className="mt-1 text-[0.9em] opacity-85">{t(`d.${id}.b` as StringKey)}</p>
      <div className="mt-3 flex flex-col gap-2">
        {(["a", "b"] as const).map((k) => {
          const label = t(`d.${id}.${k === "a" ? "a" : "n"}` as StringKey);
          return (
            <button key={k} type="button" className={`zc-btn justify-between ${k === "a" ? "zc-on" : ""}`} onClick={() => g.decide(k)} data-testid={`zc-dilemma-${k}`}>
              <span>{label}</span>
              <DilemmaCost id={id} pick={k} money={money} />
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[0.78em] opacity-60">{t("decideHint")}</p>
    </section>
  );
}

function DilemmaCost({ id, pick, money }: { id: DilemmaId; pick: "a" | "b"; money: (n: number) => string }) {
  const c = DILEMMAS[id][pick].cash ?? 0;
  if (!c) return null;
  return <span className="text-[0.85em] tabular-nums opacity-80">{c > 0 ? `+${money(c)}` : money(c)}</span>;
}

/** Election night: the result, how each group voted, the new council. */
export function ElectionNight() {
  const g = useGame();
  const t = useT();
  const r = useUI((s) => s.election);
  if (!r) return null;
  const pct = Math.round(r.share * 100);
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-black/45 p-3 zc-in" role="dialog" aria-modal="true" aria-label={t("electionNight")} data-testid="zc-election">
      <div className="zc-glass zc-sheet zc-slide zc-scroll flex max-h-full w-full max-w-md flex-col gap-4 p-5">
        <p className="zc-label opacity-70">
          {t("electionNight")} · {t("termN", { n: r.term })}
        </p>
        <h2 className="zc-h text-[2em]" style={{ color: r.won ? "var(--zc-accent)" : theme.danger }} data-testid="zc-election-result">
          {r.won ? t("reelected") : t("defeated")}
        </h2>
        <div>
          <div className="relative h-4 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("voteShare", { n: pct, name: r.challenger })}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.won ? "var(--zc-accent)" : theme.danger }} />
            <div className="absolute inset-y-0 start-1/2 w-0.5 bg-white/70" />
          </div>
          <p className="mt-1 font-bold">{t("voteShare", { n: pct, name: r.challenger })}</p>
        </div>
        <ul className="flex flex-col gap-1 text-[0.9em]">
          {FACTIONS.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: FACTION_COLOR[f] }} aria-hidden />
              <span className="flex-1">{t(`f.${f}` as StringKey)}</span>
              <span className="font-black tabular-nums">{Math.round(r.byFaction[f] * 100)}%</span>
            </li>
          ))}
        </ul>
        <div>
          <p className="zc-label mb-1 opacity-70">{t("newCouncil")}</p>
          <div className="flex gap-1">
            {r.council.map((f, i) => (
              <span key={i} className="h-5 flex-1 rounded-full" style={{ background: FACTION_COLOR[f] }} title={t(`f.${f}` as StringKey)} />
            ))}
          </div>
        </div>
        <button type="button" className="zc-btn zc-on min-h-[52px] font-black" onClick={() => g.afterElection()} data-testid="zc-election-go">
          {r.won ? t("beginTerm", { n: r.term + 1 }) : t("keepSandbox")}
        </button>
        {!r.won && (
          <button type="button" className="zc-btn" onClick={() => void g.quitToMenu()}>
            {t("quitToMenu")}
          </button>
        )}
      </div>
    </div>
  );
}
