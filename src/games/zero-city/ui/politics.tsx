import { formatPlaytime, type StringKey } from "../i18n";
import { AD_CASH, COST, MAX_ADS, RALLY_CASH } from "../politics/parliament";
import { CHAMBER, DILEMMAS, FACTIONS, MAJORITY, MINISTRIES, PARTIES, PARTY_COLOR, POLICIES, POLICY_IDS, PROMISE_IDS, TOWN_HALL_COST, type DilemmaId, type Faction, type PartyId } from "../politics/politics";
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
      <Scandal />
      <Campaign />
      <Meter value={p.overall} label={t("approval")} testId="zc-overall" />
      <p className="flex items-center justify-between text-[0.9em]">
        <span className="opacity-75">{t("capital")}</span>
        <span className="font-black tabular-nums">{Math.round(p.parl.capital)}</span>
      </p>
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

function PartyDot({ party }: { party: PartyId }) {
  return <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: PARTY_COLOR[party] }} aria-hidden />;
}

/** A vote's result: the tally, and how each party split. */
function VoteResult() {
  const t = useT();
  const bill = useUI((s) => s.bill);
  if (!bill) return null;
  return (
    <div className="rounded-[var(--zc-rs)] p-3" style={{ background: bill.passed ? "color-mix(in srgb, var(--zc-on) 18%, transparent)" : "color-mix(in srgb, var(--zc-danger) 18%, transparent)" }} role="status" data-testid="zc-bill-result">
      <p className="font-black">
        {t(`pol.${bill.law}` as StringKey)} ·{" "}
        {bill.referendum ? t(bill.passed ? "refPassed" : "refFailed", { n: Math.round((bill.support ?? 0) * 100) }) : t(bill.passed ? "billPassed" : "billFailed", { yes: bill.yes, no: bill.no })}
      </p>
      {!bill.referendum && (
        <div className="mt-2 flex flex-wrap gap-1">
          {bill.votes
            .filter((v) => v.seats > 0)
            .map((v) => (
              <span key={v.party} className="zc-pill" style={{ background: PARTY_COLOR[v.party], color: "#0b0f14" }}>
                {t(`party.${v.party}` as StringKey)} {v.yes}/{v.seats}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

/** The bill on the floor: the forecast by party, lobbying, and the vote. */
function Floor() {
  const g = useGame();
  const t = useT();
  const p = useUI((s) => s.politics)!;
  const d = p.parl.draft;
  if (!d) return null;
  const f = d.forecast;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--zc-rs)] border border-white/15 bg-white/5 p-3" data-testid="zc-bill">
      <p className="zc-label opacity-70">{t("onFloor")}</p>
      <p className="font-black">
        {d.enable ? "" : `${t("repeal")}: `}
        {t(`pol.${d.law}` as StringKey)}
      </p>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={CHAMBER} aria-valuenow={f.yes} aria-label={t("forecast", { yes: f.yes, no: f.no })}>
        {f.votes.map((v) => (
          <span key={v.party} style={{ width: `${(v.yes / CHAMBER) * 100}%`, background: PARTY_COLOR[v.party] }} />
        ))}
      </div>
      <p className="text-[0.85em] font-bold" style={{ color: f.passed ? theme.on : theme.danger }} data-testid="zc-forecast">
        {t("forecast", { yes: f.yes, no: f.no })} · {t("majorityN", { n: MAJORITY })}
      </p>
      <ul className="flex flex-col gap-1">
        {f.votes
          .filter((v) => v.party !== "civic" && v.seats > 0)
          .map((v) => {
            const done = d.lobbied.includes(v.party);
            return (
              <li key={v.party} className="flex items-center gap-2 text-[0.9em]">
                <PartyDot party={v.party} />
                <span className="flex-1 font-semibold">
                  {t(`party.${v.party}` as StringKey)} · {v.yes}/{v.seats}
                </span>
                <button type="button" className="zc-btn min-h-[36px] px-2 text-[0.85em]" disabled={done || p.parl.capital < COST.lobby} onClick={() => g.lobby(v.party)} data-testid={`zc-lobby-${v.party}`}>
                  {done ? t("lobbied") : t("lobbyN", { n: COST.lobby })}
                </button>
              </li>
            );
          })}
      </ul>
      <div className="flex gap-2">
        <button type="button" className="zc-btn zc-on flex-1" onClick={() => g.callVote()} data-testid="zc-bill-vote">
          <Icon name="vote" size={16} />
          {t("callVote")}
        </button>
        <button type="button" className="zc-btn" onClick={() => g.cancelBill()} data-testid="zc-bill-withdraw">
          {t("withdraw")}
        </button>
      </div>
    </div>
  );
}

/** Laws, by ministry. Proposing puts a bill on the floor. */
function Policies() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = useUI((s) => s.politics)!;
  const failed = p.parl.failed;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.82em] opacity-70">{t("parlHint", { n: MAJORITY, m: CHAMBER })}</p>
      <VoteResult />
      {failed && p.parl.canReferendum && (
        <button type="button" className="zc-btn" onClick={() => g.referendum()} data-testid="zc-referendum">
          <Icon name="people" size={16} />
          {t("referendumN", { law: t(`pol.${failed.law}` as StringKey), n: COST.referendum })}
        </button>
      )}
      <Floor />
      {MINISTRIES.map((m) => (
        <section key={m} className="flex flex-col gap-1">
          <h3 className="zc-label mt-2 opacity-70">{t(`min.${m}` as StringKey)}</h3>
          {POLICY_IDS.filter((id) => POLICIES[id].ministry === m).map((id) => {
            const on = p.policies.includes(id);
            const wanted = (Object.entries(p.parl.demands) as [PartyId, string][]).filter(([, law]) => law === id).map(([party]) => party);
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
                    {wanted.map((party) => (
                      <span key={party} className="zc-pill ms-1" style={{ background: PARTY_COLOR[party], color: "#0b0f14" }} title={t("demandOf", { party: t(`party.${party}` as StringKey) })}>
                        ★
                      </span>
                    ))}
                  </p>
                  <p className="text-[0.82em] opacity-70">
                    {t(`pold.${id}` as StringKey)}
                    {POLICIES[id].cost > 0 && ` · ${t("perDay", { n: money(POLICIES[id].cost) })}`}
                  </p>
                </div>
                <button type="button" className={`zc-btn shrink-0 ${on ? "" : "zc-on"}`} disabled={!!p.parl.draft} onClick={() => g.proposePolicy(id, !on)} data-testid={`zc-pol-${id}-go`}>
                  <Icon name="vote" size={16} />
                  {on ? t("repeal") : t("propose")}
                </button>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** The chamber: seats by party, your government, relations, coalition building. */
function Council() {
  const g = useGame();
  const t = useT();
  const p = useUI((s) => s.politics)!;
  const pa = p.parl;
  const seats = PARTIES.flatMap((party) => Array.from({ length: pa.seats[party] }, () => party));
  return (
    <div className="flex flex-col gap-4">
      <svg viewBox="0 0 220 115" className="mx-auto w-full max-w-[320px]" role="img" aria-label={PARTIES.map((x) => `${t(`party.${x}` as StringKey)} ${pa.seats[x]}`).join(", ")}>
        {seats.map((party, i) => {
          const row = i % 2;
          const k = Math.floor(i / 2);
          const n = Math.ceil(CHAMBER / 2);
          const a = Math.PI - (Math.PI * (k + 0.5 + row * 0.5)) / (n + 0.5);
          const r = row ? 62 : 92;
          const ally = party === "civic" || pa.coalition.includes(party);
          return <circle key={i} cx={110 + Math.cos(a) * r} cy={105 - Math.sin(a) * r} r="10" fill={PARTY_COLOR[party]} stroke={ally ? "#fff" : "#0b0f14"} strokeWidth={ally ? 2.5 : 2} />;
        })}
        <text x="110" y="100" textAnchor="middle" fill="currentColor" fontSize="16" fontWeight="900">
          {pa.gov}/{CHAMBER}
        </text>
      </svg>
      <p className="text-center font-bold" style={{ color: pa.gov >= MAJORITY ? theme.on : "#f5b942" }} data-testid="zc-gov">
        {pa.gov >= MAJORITY ? t("govMajority", { n: pa.gov }) : t("govMinority", { n: pa.gov, m: MAJORITY })}
      </p>
      <Meter value={pa.capital} label={t("capital")} sub={t("capitalHint")} testId="zc-capital" />
      <ul className="flex flex-col gap-2" data-testid="zc-council">
        {PARTIES.map((party) => {
          const partner = pa.coalition.includes(party);
          const rel = Math.round(pa.relations[party]);
          return (
            <li key={party} className="flex flex-col gap-1 rounded-[var(--zc-rs)] bg-white/5 p-2" data-testid={`zc-party-${party}`}>
              <div className="flex items-center gap-2">
                <PartyDot party={party} />
                <span className="flex-1 font-bold">
                  {t(`party.${party}` as StringKey)}
                  {party !== "civic" && <span className="ms-2 text-[0.8em] opacity-70">{partner ? t("partner") : t("opposition")}</span>}
                </span>
                <span className="tabular-nums opacity-80">{t("seats", { n: pa.seats[party] })}</span>
              </div>
              {party !== "civic" && (
                <>
                  <p className="text-[0.8em] opacity-70">{t(`partyd.${party}` as StringKey)}</p>
                  <div className="flex items-center gap-2 text-[0.82em]">
                    <span className="opacity-75">{t("relations")}</span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={rel} aria-label={t("relations")}>
                      <div className="absolute inset-y-0 start-1/2 w-px bg-white/40" />
                      <div className="absolute inset-y-0 rounded-full" style={{ left: rel >= 0 ? "50%" : `${50 + rel / 2}%`, width: `${Math.abs(rel) / 2}%`, background: rel >= 0 ? theme.on : theme.danger }} />
                    </div>
                    <span className="w-[2.6em] text-end font-black tabular-nums">{rel}</span>
                  </div>
                  {partner && pa.demands[party] && <p className="text-[0.8em]">{t("wants", { law: t(`pol.${pa.demands[party]}` as StringKey) })}</p>}
                  <div className="flex gap-2">
                    {partner ? (
                      <button type="button" className="zc-btn min-h-[36px] text-[0.85em]" onClick={() => g.dropPartner(party)} data-testid={`zc-drop-${party}`}>
                        {t("dropPartner")}
                      </button>
                    ) : (
                      <button type="button" className="zc-btn min-h-[36px] text-[0.85em]" disabled={pa.capital < COST.invite} onClick={() => g.invite(party)} data-testid={`zc-invite-${party}`}>
                        {t("inviteN", { n: COST.invite })}
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The cabinet: a minister for each department, from your party or your partners'. */
function Cabinet() {
  const g = useGame();
  const t = useT();
  const p = useUI((s) => s.politics)!;
  const pa = p.parl;
  const eligible = pa.pool.filter((m) => m.party === "civic" || pa.coalition.includes(m.party)).sort((a, b) => b.skill - a.skill);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.82em] opacity-70">{t("cabinetHint")}</p>
      {MINISTRIES.map((m) => {
        const who = pa.ministers[m];
        return (
          <section key={m} className="flex flex-col gap-1 rounded-[var(--zc-rs)] bg-white/5 p-2" data-testid={`zc-min-${m}`}>
            <div className="flex items-center gap-2">
              <span className="flex-1 font-black">{t(`min.${m}` as StringKey)}</span>
              {who && (
                <button type="button" className="zc-btn min-h-[32px] px-2 text-[0.8em]" onClick={() => g.dismissMinister(m)}>
                  {t("sack")}
                </button>
              )}
            </div>
            <p className="text-[0.8em] opacity-70">{t(`mine.${m}` as StringKey)}</p>
            {who ? (
              <p className="flex items-center gap-2 text-[0.9em]">
                <PartyDot party={who.party} />
                <span className="flex-1 font-semibold">{who.name}</span>
                <span className="tabular-nums">{t("skillN", { n: who.skill })}</span>
                <span className="tabular-nums opacity-75">{t("loyaltyN", { n: who.loyalty })}</span>
              </p>
            ) : (
              <label className="flex items-center gap-2 text-[0.9em]">
                <span className="opacity-70">{t("vacant")}</span>
                <select
                  className="zc-btn min-h-[36px] flex-1 text-[0.85em]"
                  value=""
                  onChange={(e) => e.target.value && g.appoint(m, Number(e.target.value))}
                  disabled={pa.capital < COST.appoint || !eligible.length}
                  aria-label={t("appointTo", { ministry: t(`min.${m}` as StringKey) })}
                  data-testid={`zc-appoint-${m}`}
                >
                  <option value="">{t("appointN", { n: COST.appoint })}</option>
                  {eligible.map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${c.name} · ${t(`party.${c.party}` as StringKey)} · ${t("skillN", { n: c.skill })} · ${t("loyaltyN", { n: c.loyalty })}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Campaign actions, in the last day of the term. */
function Campaign() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = useUI((s) => s.politics)!;
  const c = p.parl.campaign;
  if (!c.open) return null;
  return (
    <section className="flex flex-col gap-2 rounded-[var(--zc-rs)] border border-white/15 p-2" data-testid="zc-campaign">
      <h3 className="zc-label opacity-70">{t("campaign")}</h3>
      <div className="flex flex-wrap gap-1">
        {FACTIONS.map((f) => (
          <button key={f} type="button" className="zc-btn min-h-[36px] text-[0.82em]" disabled={c.rallies.includes(f)} onClick={() => g.rally(f)} data-testid={`zc-rally-${f}`}>
            {t("rallyN", { group: t(`f.${f}` as StringKey), n: money(RALLY_CASH) })}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" className="zc-btn flex-1 text-[0.85em]" disabled={c.ads >= MAX_ADS} onClick={() => g.adBlitz()} data-testid="zc-ads">
          {t("adsN", { n: money(AD_CASH), left: MAX_ADS - c.ads })}
        </button>
        <button type="button" className="zc-btn flex-1 text-[0.85em]" disabled={c.debated} onClick={() => g.debate()} data-testid="zc-debate">
          {c.debated ? t("debated") : t("debate")}
        </button>
      </div>
    </section>
  );
}

/** A minister in the papers. */
function Scandal() {
  const g = useGame();
  const t = useT();
  const p = useUI((s) => s.politics)!;
  const m = p.parl.scandal;
  const who = m ? p.parl.ministers[m] : null;
  if (!m || !who) return null;
  return (
    <section className="flex flex-col gap-2 rounded-[var(--zc-rs)] p-3" style={{ background: "color-mix(in srgb, var(--zc-danger) 16%, transparent)" }} data-testid="zc-scandal">
      <p className="font-black">{t("scandalT", { name: who.name, ministry: t(`min.${m}` as StringKey) })}</p>
      <p className="text-[0.85em] opacity-85">{t("scandalB")}</p>
      <div className="flex gap-2">
        <button type="button" className="zc-btn zc-on flex-1" onClick={() => g.resolveScandal(true)} data-testid="zc-scandal-sack">
          {t("sackThem")}
        </button>
        <button type="button" className="zc-btn flex-1" onClick={() => g.resolveScandal(false)} data-testid="zc-scandal-keep">
          {t("standBy")}
        </button>
      </div>
    </section>
  );
}

/** City Hall: overview, budget, policies, council. */
export function CityHall() {
  const g = useGame();
  const t = useT();
  const hall = useUI((s) => s.hall);
  const p = useUI((s) => s.politics);
  if (!hall || !p) return null;
  const tabs: HallTab[] = ["overview", "budget", "policies", "council", "cabinet"];
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
        <Segmented label={t("cityHall")} value={hall} onChange={(v) => g.openHall(v)} options={tabs.map((id) => ({ id, label: t(`ph.${id}` as StringKey) }))} testId="zc-ph" fit />
      </div>
      <div className="zc-scroll min-h-0 flex-1 p-3">
        {hall === "overview" && <Overview />}
        {hall === "budget" && <Budget />}
        {hall === "policies" && <Policies />}
        {hall === "council" && <Council />}
        {hall === "cabinet" && <Cabinet />}
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
        {r.rescued && <p className="font-bold" data-testid="zc-rescued">{t("rescued")}</p>}
        <div>
          <p className="zc-label mb-1 opacity-70">{t("newCouncil")}</p>
          <div className="flex gap-1">
            {r.seats
              ? PARTIES.flatMap((party) => Array.from({ length: r.seats![party] }, (_, i) => <span key={`${party}${i}`} className="h-5 flex-1 rounded-full" style={{ background: PARTY_COLOR[party] }} title={t(`party.${party}` as StringKey)} />))
              : r.council.map((f, i) => <span key={i} className="h-5 flex-1 rounded-full" style={{ background: FACTION_COLOR[f] }} title={t(`f.${f}` as StringKey)} />)}
          </div>
          {r.seats && (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.85em]">
              {PARTIES.map((party) => (
                <li key={party} className="flex items-center gap-1">
                  <PartyDot party={party} />
                  {t(`party.${party}` as StringKey)} {r.seats![party]}
                </li>
              ))}
            </ul>
          )}
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
