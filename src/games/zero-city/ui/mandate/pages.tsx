/** The Mandate app's pages: the map, the party, the chamber, the laws, the cabinet, the polls and the campaign. */
import { useState } from "react";
import { formatPlaytime, type StringKey } from "../../i18n";
import { CANVASS_COST, CONFERENCE_COST, DISTRICT_AD_COST, HQ, HQ_COST, LAW_POSITION, MAX_DISTRICT_ADS, MAX_ROSTER, OFFICE_COST, RECRUIT_COST, TRAIN_COST, WHIP_CAPITAL, type Position } from "../../politics/mandate";
import { COST, partyStance } from "../../politics/parliament";
import { CHAMBER, FACTIONS, MAJORITY, MINISTRIES, PARTIES, PARTY_COLOR, POLICIES, POLICY_IDS, type Ministry, type PartyId, type PolicyId } from "../../politics/politics";
import type { AppPage, DistrictView } from "../../store";
import { theme } from "../../theme";
import { Segmented } from "../common";
import { useGame, useNum, useT, useUI } from "../hooks";
import { Icon } from "../Icons";
import { Budget, Campaign, FACTION_COLOR, Scandal, VoteResult } from "../politics";
import { DebatePanel } from "./statecraft";
import { Bar, Card, Compass, DistrictMap, Hemicycle, PartyDot, partyOrder, PollLines, Portrait, pct, Stacked, Stat, useDistrictName, useMoney } from "./parts";

const usePol = () => useUI((s) => s.politics)!;
const go = (g: ReturnType<typeof useGame>, page: AppPage) => g.openApp(page);

/** A small primary/secondary action button. */
function Act({ children, onClick, disabled, on, testId, title, className = "" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; on?: boolean; testId?: string; title?: string; className?: string }) {
  return (
    <button type="button" className={`zc-btn min-h-[38px] px-3 text-[0.85em] ${on ? "zc-on" : ""} ${className}`} disabled={disabled} onClick={onClick} data-testid={testId} title={title}>
      {children}
    </button>
  );
}

// -------------------------------------------------------------------- map

export function MapPage() {
  const t = useT();
  const p = usePol();
  const m = p.m;
  const dname = useDistrictName();
  const [sel, setSel] = useState<number | null>(m.districts[0]?.id ?? null);
  const d = m.districts.find((x) => x.id === sel) ?? null;
  return (
    <div className="grid gap-4 @5xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card title={t("md.p.map")} icon="land" action={<span className="md-label">{t("md.districtsN", { n: m.districts.length })}</span>}>
          <DistrictMap districts={m.districts} selected={sel} onPick={setSel} />
          <p className="text-[0.82em] text-[var(--md-muted)]">{t("md.mapHint")}</p>
        </Card>
        <ul className="grid grid-cols-2 gap-2 @2xl:grid-cols-3 @4xl:grid-cols-4">
          {m.districts.map((x) => (
            <li key={x.id}>
              <button type="button" aria-pressed={sel === x.id} onClick={() => setSel(x.id)} className="md-card flex w-full items-center gap-2 p-3 text-start transition-transform hover:-translate-y-0.5" style={{ outline: sel === x.id ? `2px solid ${PARTY_COLOR[x.winner]}` : undefined }} data-testid={`md-d-${x.id}`}>
                <PartyDot party={x.winner} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{dname(x.name)}</span>
                  <span className="block text-[0.78em] text-[var(--md-muted)]">{t("md.seatsN", { n: x.seats })}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {d ? <DistrictPanel d={d} /> : <Card title={t("md.noDistrict")}>{t("md.noMap")}</Card>}
    </div>
  );
}

function DistrictPanel({ d }: { d: DistrictView }) {
  const g = useGame();
  const t = useT();
  const num = useNum();
  const money = useMoney();
  const p = usePol();
  const m = p.m;
  const dname = useDistrictName();
  const polled = m.hq.pollster > 0;
  const idle = m.roster.filter((x) => x.district !== d.id && !x.minister);
  return (
    <Card title={dname(d.name)} icon="pin" testId="md-district" action={<span className="md-label">{t("md.seatsN", { n: d.seats })}</span>}>
      <div className="grid grid-cols-2 gap-2">
        <Stat label={t("md.people")} value={num(d.pop)} />
        <Stat label={t("md.leading")} value={<span className="flex items-center gap-2 text-[0.7em]"><PartyDot party={d.winner} />{t(`party.${d.winner}` as StringKey)}</span>} />
      </div>
      <section className="flex flex-col gap-2">
        <h4 className="md-label">{t("md.whoLives")}</h4>
        {FACTIONS.map((f) => (
          <Bar key={f} label={t(`f.${f}` as StringKey)} value={d.mix[f]} color={FACTION_COLOR[f]} />
        ))}
      </section>
      <section className="flex flex-col gap-2">
        <h4 className="md-label">{t("md.wouldVote")}</h4>
        {polled ? (
          <>
            {partyOrder(m.platform).map((x) => (
              <Bar key={x} label={t(`party.${x}` as StringKey)} value={d.share[x]} color={PARTY_COLOR[x]} right={`${pct(d.share[x])} · ${d.projected[x]}`} />
            ))}
          </>
        ) : (
          <>
            <Bar label={t("party.civic")} value={d.share.civic} color={PARTY_COLOR.civic} />
            <p className="text-[0.8em] text-[var(--md-muted)]">{t("md.needPollster")}</p>
          </>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h4 className="md-label">{t("md.groundGame")}</h4>
        <Bar label={t("md.effort")} value={d.effort / 100} right={Math.round(d.effort)} />
        <p className="text-[0.82em]">
          {d.office ? t("md.hasOffice") : t("md.noOffice")} · {t("md.adsN", { n: d.ads, max: MAX_DISTRICT_ADS })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Act onClick={() => g.canvass(d.id)} disabled={m.funds < CANVASS_COST} testId="md-canvass">
            <Icon name="people" size={15} />
            {t("md.canvassN", { n: money(CANVASS_COST) })}
          </Act>
          {!d.office && (
            <Act onClick={() => g.openOffice(d.id)} disabled={m.funds < OFFICE_COST} testId="md-office">
              <Icon name="flag" size={15} />
              {t("md.officeN", { n: money(OFFICE_COST) })}
            </Act>
          )}
          <Act onClick={() => g.districtAd(d.id)} disabled={!p.challenger || m.funds < DISTRICT_AD_COST || d.ads >= MAX_DISTRICT_ADS} testId="md-ad" title={p.challenger ? undefined : t("md.adsCampaignOnly")}>
            <Icon name="mega" size={15} />
            {t("md.adN", { n: money(DISTRICT_AD_COST) })}
          </Act>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h4 className="md-label">{t("md.workingHere")}</h4>
        {d.workers.length === 0 && <p className="text-[0.85em] text-[var(--md-muted)]">{t("md.nobodyHere")}</p>}
        {d.workers.map((id) => {
          const who = m.roster.find((x) => x.id === id);
          if (!who) return null;
          return (
            <div key={id} className="flex items-center gap-2">
              <Portrait face={who.face} party="civic" size={36} label={who.name} />
              <span className="flex-1 font-semibold">{who.name}</span>
              <button type="button" className="zc-btn min-h-[32px] px-2 text-[0.8em]" onClick={() => g.assignPolitician(id, -1)}>
                {t("md.recall")}
              </button>
            </div>
          );
        })}
        {idle.length > 0 && (
          <select className="zc-btn min-h-[40px] text-[0.85em]" value="" onChange={(e) => e.target.value && g.assignPolitician(Number(e.target.value), d.id)} aria-label={t("md.sendSomeone")} data-testid="md-send">
            <option value="">{t("md.sendSomeone")}</option>
            {idle.map((x) => (
              <option key={x.id} value={x.id}>{`${x.name} · ${t("md.charismaN", { n: x.charisma })}`}</option>
            ))}
          </select>
        )}
      </section>
    </Card>
  );
}

// ------------------------------------------------------------------ party

export function PartyPage() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const num = useNum();
  const p = usePol();
  const m = p.m;
  const [pick, setPick] = useState<Position | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card testId="md-partycard">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-[18px]" style={{ background: PARTY_COLOR.civic, color: "#062a30" }}>
              <Icon name="flag" size={32} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="md-h text-[1.6em]">{t("party.civic")}</h2>
              <p className="text-[var(--md-muted)]">{t("md.partyLine", { n: num(m.members), r: m.roster.length })}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
            <Stat label={t("md.funds")} value={money(m.funds)} sub={t("perDay", { n: `${m.fundsNet >= 0 ? "+" : ""}${money(m.fundsNet)}` })} tone={m.funds < 0 ? "bad" : undefined} testId="md-funds" />
            <Stat label={t("md.members")} value={num(m.members)} />
            <Stat label={t("md.politicians")} value={`${m.roster.length}/${MAX_ROSTER}`} />
            <Stat label={t("md.mps")} value={`${p.parl.seats.civic}/${CHAMBER}`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Act onClick={() => g.gala()} disabled={!m.galaReady} testId="md-gala">
              <Icon name="money" size={15} />
              {m.galaReady ? t("md.gala") : t("md.galaWait")}
            </Act>
            <Act onClick={() => g.recruit()} disabled={m.funds < RECRUIT_COST || m.roster.length >= MAX_ROSTER} testId="md-recruit" on>
              <Icon name="plus" size={15} />
              {t("md.recruitN", { n: money(RECRUIT_COST) })}
            </Act>
          </div>
        </Card>
        <Card title={t("md.platform")} icon="pin" testId="md-platform">
          <Compass platform={m.platform} position={m.position} pick={pick} onPick={m.conferenceReady ? setPick : undefined} size={260} />
          {m.conferenceReady ? (
            <>
              <p className="text-[0.82em] text-[var(--md-muted)]">{pick ? t("md.conferencePick", { e: Math.round(pick[0] * 100), s: Math.round(pick[1] * 100) }) : t("md.conferenceHint")}</p>
              <Act
                on
                onClick={() => {
                  if (pick) g.conference(pick);
                  setPick(null);
                }}
                disabled={!pick || m.funds < CONFERENCE_COST}
                testId="md-conference"
              >
                {t("md.conferenceN", { n: money(CONFERENCE_COST) })}
              </Act>
            </>
          ) : (
            <p className="text-[0.82em] text-[var(--md-muted)]">{t("md.conferenceDone")}</p>
          )}
        </Card>
      </div>
      <Card title={t("md.hq")} icon="hall">
        <div className="grid gap-2 @2xl:grid-cols-2 @5xl:grid-cols-4">
          {HQ.map((h) => {
            const lvl = m.hq[h];
            return (
              <div key={h} className="flex flex-col gap-2 rounded-[12px] border border-[var(--md-line)] p-3" data-testid={`md-hq-${h}`}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-black">{t(`md.hq.${h}` as StringKey)}</span>
                  <span className="flex gap-1" aria-label={t("md.levelN", { n: lvl })}>
                    {[0, 1, 2].map((k) => (
                      <span key={k} className="h-2.5 w-2.5 rounded-full" style={{ background: k < lvl ? "var(--md-accent)" : "var(--md-track)" }} />
                    ))}
                  </span>
                </div>
                <p className="flex-1 text-[0.82em] text-[var(--md-muted)]">{t(`md.hqd.${h}` as StringKey)}</p>
                {lvl < 3 ? (
                  <Act onClick={() => g.upgradeHq(h)} disabled={m.funds < HQ_COST[lvl]} testId={`md-hq-${h}-up`}>
                    {t("md.upgradeN", { n: money(HQ_COST[lvl]) })}
                  </Act>
                ) : (
                  <span className="md-label">{t("md.maxed")}</span>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <Card title={t("md.roster")} icon="people">
        <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3" data-testid="md-roster">
          {m.roster.map((x) => (
            <PoliticianCard key={x.id} id={x.id} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function PoliticianCard({ id }: { id: number }) {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = usePol();
  const m = p.m;
  const dname = useDistrictName();
  const x = m.roster.find((r) => r.id === id)!;
  const stat = (k: StringKey, v: number, max: number) => <Bar label={t(k)} value={v / max} right={max === 10 ? `${v}/10` : Math.round(v)} color={v / max < 0.3 && k !== "md.ambition" ? "var(--md-bad)" : "var(--md-accent)"} />;
  return (
    <article className="flex flex-col gap-2 rounded-[14px] border border-[var(--md-line)] bg-[var(--md-card2)] p-3" data-testid={`md-pol-${x.id}`}>
      <div className="flex items-start gap-3">
        <Portrait face={x.face} party="civic" size={56} label={x.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-black">{x.name}</p>
          <p className="flex flex-wrap gap-1 pt-1">
            <span className="md-chip" title={t(`md.td.${x.trait}` as StringKey)}>
              {t(`md.t.${x.trait}` as StringKey)}
            </span>
            {x.mp && <span className="md-chip md-chip-on">{t("md.mp")}</span>}
            {x.minister && <span className="md-chip md-chip-on">{t(`min.${x.minister}` as StringKey)}</span>}
            {x.loyalty < 30 && x.ambition > 60 && <span className="md-chip md-chip-bad">{t("md.restless")}</span>}
          </p>
        </div>
      </div>
      {stat("md.charisma", x.charisma, 10)}
      {stat("md.competence", x.competence, 10)}
      {stat("md.loyalty", x.loyalty, 100)}
      {stat("md.ambition", x.ambition, 100)}
      {stat("md.popularity", x.popularity, 100)}
      <label className="flex items-center gap-2 text-[0.85em]">
        <Icon name="pin" size={15} />
        <select className="zc-btn min-h-[36px] flex-1 text-[0.85em]" value={x.district} onChange={(e) => g.assignPolitician(x.id, Number(e.target.value))} aria-label={t("md.workingIn", { name: x.name })} disabled={!m.districts.length}>
          <option value={-1}>{t("md.atHq")}</option>
          {m.districts.map((d) => (
            <option key={d.id} value={d.id}>
              {dname(d.name)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-1">
        <Act onClick={() => g.train(x.id, "charisma")} disabled={m.funds < TRAIN_COST || x.charisma >= 10} title={money(TRAIN_COST)}>
          {t("md.trainCharisma")}
        </Act>
        <Act onClick={() => g.train(x.id, "competence")} disabled={m.funds < TRAIN_COST || x.competence >= 10} title={money(TRAIN_COST)}>
          {t("md.trainCompetence")}
        </Act>
        <Act onClick={() => g.expel(x.id)} disabled={x.mp || !!x.minister} title={x.mp || x.minister ? t("md.cantExpel") : undefined}>
          {t("md.expel")}
        </Act>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- chamber

export function ChamberPage() {
  const g = useGame();
  const t = useT();
  const p = usePol();
  const m = p.m;
  const pa = p.parl;
  const dname = useDistrictName();
  const government: PartyId[] = ["civic", ...pa.coalition];
  const order = partyOrder(m.platform);
  return (
    <div className="grid gap-4 @5xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card title={t("md.chamber")} icon="columns" action={<span className="font-black" style={{ color: pa.gov >= MAJORITY ? "var(--md-good)" : "#f5b942" }} data-testid="md-gov">{pa.gov >= MAJORITY ? t("govMajority", { n: pa.gov }) : t("govMinority", { n: pa.gov, m: MAJORITY })}</span>}>
          <Hemicycle mps={m.mps} platform={m.platform} government={government} votes={m.votes} rebels={m.rebels} size={560} />
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[0.85em]">
            {order.map((x) => (
              <span key={x} className="flex items-center gap-1.5">
                <PartyDot party={x} />
                {t(`party.${x}` as StringKey)} <b>{pa.seats[x]}</b>
                {government.includes(x) && <span className="md-label">· {t("md.inGov")}</span>}
              </span>
            ))}
          </div>
          {m.confidence && (
            <p className="rounded-[10px] p-2 text-[0.88em] font-semibold" style={{ background: m.confidence.passed ? "color-mix(in srgb, var(--md-bad) 18%, transparent)" : "var(--md-track)" }} data-testid="md-confidence">
              {t(m.confidence.passed ? "md.ncLostLine" : "md.ncWonLine", { n: m.confidence.against })}
            </p>
          )}
        </Card>
        <Card title={t("md.members")} icon="people">
          <ul className="grid gap-1 @2xl:grid-cols-2 @5xl:grid-cols-3" data-testid="md-mps">
            {[...m.mps]
              .sort((a, b) => order.indexOf(a.party) - order.indexOf(b.party))
              .map((mp) => {
                const d = m.districts.find((x) => x.id === mp.district);
                const rebel = m.rebels.includes(mp.id);
                return (
                  <li key={mp.id} className="flex items-center gap-2 rounded-[10px] p-1.5">
                    <Portrait face={mp.face} party={mp.party} size={34} label={mp.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9em] font-bold">{mp.name}</span>
                      <span className="block truncate text-[0.75em] text-[var(--md-muted)]">
                        {t(`party.${mp.party}` as StringKey)}
                        {d ? ` · ${dname(d.name)}` : ""}
                      </span>
                    </span>
                    {rebel && <span className="md-chip md-chip-bad">{t("md.rebel")}</span>}
                  </li>
                );
              })}
          </ul>
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <BillCard />
        <VoteResult />
        <Card title={t("md.coalition")} icon="hall" testId="md-coalition">
          <ul className="flex flex-col gap-2">
            {PARTIES.filter((x) => x !== "civic").map((x) => {
              const partner = pa.coalition.includes(x);
              const rel = Math.round(pa.relations[x]);
              return (
                <li key={x} className="flex flex-col gap-1.5 rounded-[12px] border border-[var(--md-line)] p-2.5">
                  <div className="flex items-center gap-2">
                    <PartyDot party={x} />
                    <span className="flex-1 font-bold">{t(`party.${x}` as StringKey)}</span>
                    <span className="text-[0.8em] text-[var(--md-muted)]">{t("seats", { n: pa.seats[x] })}</span>
                  </div>
                  <Bar label={t("relations")} value={(rel + 100) / 200} right={rel} color={rel >= 0 ? "var(--md-good)" : "var(--md-bad)"} />
                  {partner && pa.demands[x] && <p className="text-[0.8em]">{t("wants", { law: t(`pol.${pa.demands[x]}` as StringKey) })}</p>}
                  {partner ? (
                    <Act onClick={() => g.dropPartner(x)} testId={`md-drop-${x}`} className="self-start">
                      {t("dropPartner")}
                    </Act>
                  ) : (
                    <Act onClick={() => g.invite(x)} disabled={pa.capital < COST.invite} testId={`md-invite-${x}`} className="self-start">
                      {t("inviteN", { n: COST.invite })}
                    </Act>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/** The bill on the floor: the forecast, lobbying, the whip and the vote. */
function BillCard() {
  const g = useGame();
  const t = useT();
  const p = usePol();
  const m = p.m;
  const d = p.parl.draft;
  if (!d)
    return (
      <Card title={t("onFloor")} icon="vote">
        <p className="text-[0.9em] text-[var(--md-muted)]">{t("md.noBill")}</p>
        <Act onClick={() => go(g, "laws")} on>
          <Icon name="scroll" size={15} />
          {t("md.toLaws")}
        </Act>
      </Card>
    );
  const f = d.forecast;
  return (
    <Card title={t("onFloor")} icon="vote" testId="md-bill">
      <p className="text-[1.1em] font-black">
        {d.enable ? "" : `${t("repeal")}: `}
        {t(`pol.${d.law}` as StringKey)}
      </p>
      <Stacked
        label={t("forecast", { yes: f.yes, no: f.no })}
        parts={[...f.votes.map((v) => ({ key: v.party, value: v.yes, color: PARTY_COLOR[v.party], name: t(`party.${v.party}` as StringKey) })), { key: "no", value: f.no, color: "var(--md-track)", name: t("md.no") }]}
        marker={MAJORITY / CHAMBER}
      />
      <p className="font-bold" style={{ color: f.passed ? "var(--md-good)" : "var(--md-bad)" }} data-testid="md-forecast">
        {t("forecast", { yes: f.yes, no: f.no })} · {t("majorityN", { n: MAJORITY })}
      </p>
      {m.rebels.length > 0 && !m.whip && <p className="text-[0.85em] font-semibold text-[var(--md-bad)]">{t("md.rebelsN", { n: m.rebels.length })}</p>}
      {m.whip && <p className="text-[0.85em] font-semibold">{t("md.whipped")}</p>}
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
                <Act onClick={() => g.lobby(v.party)} disabled={done || p.parl.capital < COST.lobby} testId={`md-lobby-${v.party}`}>
                  {done ? t("lobbied") : t("lobbyN", { n: COST.lobby })}
                </Act>
              </li>
            );
          })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Act onClick={() => g.whip()} disabled={m.whip || p.parl.capital < WHIP_CAPITAL} testId="md-whip">
          {t("md.whipN", { n: WHIP_CAPITAL })}
        </Act>
        <Act onClick={() => g.callVote()} on testId="md-vote">
          <Icon name="vote" size={15} />
          {t("callVote")}
        </Act>
        <Act onClick={() => g.cancelBill()}>{t("withdraw")}</Act>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------- laws

export function LawsPage() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = usePol();
  const [min, setMin] = useState<Ministry | "all">("all");
  const failed = p.parl.failed;
  const laws = POLICY_IDS.filter((id) => min === "all" || POLICIES[id].ministry === min);
  const lean = (id: PolicyId) => {
    const [e, s] = LAW_POSITION[id];
    const parts: string[] = [];
    if (Math.abs(e) >= 0.3) parts.push(t(e < 0 ? "md.left" : "md.right"));
    if (Math.abs(s) >= 0.3) parts.push(t(s < 0 ? "md.progressive" : "md.traditional"));
    return parts.join(" · ") || t("md.centre");
  };
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-[0.9em] text-[var(--md-muted)]">{t("parlHint", { n: MAJORITY, m: CHAMBER })}</p>
        <Segmented label={t("md.ministry")} value={min} onChange={setMin} options={[{ id: "all" as const, label: t("md.allLaws") }, ...MINISTRIES.map((x) => ({ id: x, label: t(`min.${x}` as StringKey) }))]} testId="md-min" fit />
        {failed && p.parl.canReferendum && (
          <Act onClick={() => g.referendum()} testId="md-referendum">
            <Icon name="people" size={15} />
            {t("referendumN", { law: t(`pol.${failed.law}` as StringKey), n: COST.referendum })}
          </Act>
        )}
      </Card>
      <div className="grid gap-3 @2xl:grid-cols-2 @6xl:grid-cols-3">
        {laws.map((id) => {
          const on = p.policies.includes(id);
          const wanted = (Object.entries(p.parl.demands) as [PartyId, string][]).filter(([, law]) => law === id).map(([party]) => party);
          return (
            <article key={id} className="md-card flex flex-col gap-2 p-4" data-testid={`md-law-${id}`}>
              <header className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="md-label">{t(`min.${POLICIES[id].ministry}` as StringKey)}</p>
                  <h4 className="md-h text-[1.05em]">{t(`pol.${id}` as StringKey)}</h4>
                </div>
                {on && <span className="md-chip md-chip-on">{t("inForce")}</span>}
              </header>
              <p className="flex-1 text-[0.88em] text-[var(--md-muted)]">{t(`pold.${id}` as StringKey)}</p>
              <p className="flex flex-wrap gap-1 text-[0.78em]">
                <span className="md-chip">{lean(id)}</span>
                {POLICIES[id].cost > 0 && <span className="md-chip">{t("perDay", { n: money(POLICIES[id].cost) })}</span>}
                {wanted.map((x) => (
                  <span key={x} className="md-chip" style={{ background: PARTY_COLOR[x], color: "#0b0f14" }}>
                    {t("demandOf", { party: t(`party.${x}` as StringKey) })}
                  </span>
                ))}
              </p>
              <div className="flex items-center gap-1.5" aria-label={t("md.whoBacks")}>
                <span className="md-label me-1">{t("md.whoBacks")}</span>
                {PARTIES.filter((x) => x !== "civic").map((x) => {
                  const v = partyStance(x, id, !on);
                  return (
                    <span key={x} className="grid h-6 w-6 place-items-center rounded-full text-[0.75em] font-black" style={{ background: PARTY_COLOR[x], color: "#0b0f14", opacity: Math.abs(v) < 0.08 ? 0.45 : 1 }} title={`${t(`party.${x}` as StringKey)}: ${v > 0.08 ? t("md.aye") : v < -0.08 ? t("md.no") : t("md.undecided")}`}>
                      {v > 0.08 ? "✓" : v < -0.08 ? "✗" : "–"}
                    </span>
                  );
                })}
              </div>
              <Act
                on={!on}
                onClick={() => {
                  g.proposePolicy(id, !on);
                  go(g, "chamber");
                }}
                disabled={!!p.parl.draft}
                testId={`md-law-${id}-go`}
              >
                <Icon name="vote" size={15} />
                {on ? t("repeal") : t("propose")}
              </Act>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- cabinet

export function CabinetPage() {
  const g = useGame();
  const t = useT();
  const p = usePol();
  const pa = p.parl;
  const m = p.m;
  const own = m.roster.filter((x) => !x.minister).sort((a, b) => b.competence - a.competence);
  const partners = pa.pool.filter((x) => x.party !== "civic" && pa.coalition.includes(x.party)).sort((a, b) => b.skill - a.skill);
  return (
    <div className="flex flex-col gap-4">
      <Scandal />
      <p className="text-[0.9em] text-[var(--md-muted)]">{t("cabinetHint")}</p>
      <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {MINISTRIES.map((k) => {
          const who = pa.ministers[k];
          const mine = who ? m.roster.find((x) => x.minister === k) : null;
          const cost = who ? COST.reshuffle : COST.appoint;
          return (
            <Card key={k} title={t(`min.${k}` as StringKey)} icon="briefcase" testId={`md-min-${k}`}>
              <p className="text-[0.82em] text-[var(--md-muted)]">{t(`mine.${k}` as StringKey)}</p>
              {who ? (
                <div className="flex items-center gap-3">
                  <Portrait face={mine?.face ?? who.id * 7919} party={who.party} size={52} label={who.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black">{who.name}</p>
                    <p className="text-[0.8em] text-[var(--md-muted)]">{t(`party.${who.party}` as StringKey)}</p>
                    <p className="text-[0.8em]">
                      {t("skillN", { n: who.skill })} · {t("loyaltyN", { n: Math.round(mine?.loyalty ?? who.loyalty) })}
                    </p>
                  </div>
                  <Act onClick={() => g.dismissMinister(k)}>{t("sack")}</Act>
                </div>
              ) : (
                <p className="font-semibold text-[var(--md-muted)]">{t("vacant")}</p>
              )}
              <select
                className="zc-btn min-h-[40px] text-[0.85em]"
                value=""
                disabled={pa.capital < cost}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  if (v.startsWith("own:")) g.appointOwn(k, Number(v.slice(4)));
                  else g.appoint(k, Number(v.slice(5)));
                }}
                aria-label={t("appointTo", { ministry: t(`min.${k}` as StringKey) })}
                data-testid={`md-appoint-${k}`}
              >
                <option value="">{who ? t("md.reshuffleN", { n: cost }) : t("appointN", { n: cost })}</option>
                <optgroup label={t("party.civic")}>
                  {own.map((x) => (
                    <option key={x.id} value={`own:${x.id}`}>{`${x.name} · ${t("skillN", { n: Math.ceil(x.competence / 2) })} · ${t("loyaltyN", { n: Math.round(x.loyalty) })}`}</option>
                  ))}
                </optgroup>
                {partners.length > 0 && (
                  <optgroup label={t("md.partners")}>
                    {partners.map((x) => (
                      <option key={x.id} value={`pool:${x.id}`}>{`${x.name} · ${t(`party.${x.party}` as StringKey)} · ${t("skillN", { n: x.skill })}`}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Card>
          );
        })}
      </div>
      <Card title={t("ph.budget")} icon="money">
        <Budget />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ polls

export function PollsPage() {
  const t = useT();
  const p = usePol();
  const m = p.m;
  const dname = useDistrictName();
  const order = partyOrder(m.platform);
  return (
    <div className="grid gap-4 @5xl:grid-cols-2">
      <Card title={t("md.pollTrend")} icon="chart" className="@5xl:col-span-2" testId="md-polls">
        <PollLines polls={m.polls} />
      </Card>
      <Card title={t("md.todaysPoll")} icon="chart">
        <Stacked label={t("md.todaysPoll")} parts={order.map((x) => ({ key: x, value: m.poll[x], color: PARTY_COLOR[x], name: t(`party.${x}` as StringKey) }))} />
        <h4 className="md-label pt-2">{t("md.seatProjection")}</h4>
        <Stacked label={t("md.seatProjection")} parts={order.map((x) => ({ key: x, value: m.projected[x], color: PARTY_COLOR[x], name: t(`party.${x}` as StringKey) }))} marker={MAJORITY / CHAMBER} />
        <p className="text-[0.8em] text-[var(--md-muted)]">{t("md.majorityLine", { n: MAJORITY })}</p>
      </Card>
      <Card title={t("md.byGroup")} icon="people">
        {FACTIONS.map((f) => (
          <Bar key={f} label={`${t(`f.${f}` as StringKey)} · ${pct(p.shares[f])}`} value={p.approval[f] / 100} color={FACTION_COLOR[f]} hint={t(`fw.${f}` as StringKey)} />
        ))}
      </Card>
      <Card title={t("md.compass")} icon="pin">
        <Compass platform={m.platform} position={m.position} />
        <p className="text-[0.82em] text-[var(--md-muted)]">{t("md.compassHint")}</p>
      </Card>
      <Card title={t("md.byDistrict")} icon="land">
        {m.hq.pollster < 1 ? (
          <p className="text-[0.9em] text-[var(--md-muted)]">{t("md.needPollster")}</p>
        ) : !m.districts.length ? (
          <p className="text-[0.9em] text-[var(--md-muted)]">{t("md.noMap")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.85em]">
              <thead>
                <tr className="md-label text-start">
                  <th className="py-1 text-start">{t("md.district")}</th>
                  {order.map((x) => (
                    <th key={x} className="px-1 py-1 text-end">
                      <PartyDot party={x} size={10} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.districts.map((d) => (
                  <tr key={d.id} className="border-t border-[var(--md-line)]">
                    <td className="py-1.5 font-semibold">{dname(d.name)}</td>
                    {order.map((x) => (
                      <td key={x} className="px-1 py-1.5 text-end tabular-nums" style={{ fontWeight: d.winner === x ? 900 : 400 }}>
                        {pct(d.share[x])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// --------------------------------------------------------------- campaign

export function CampaignPage() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = usePol();
  const m = p.m;
  const lang = useUI((s) => s.lang);
  const dname = useDistrictName();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 @2xl:grid-cols-3">
        <Stat label={t("md.electionIn")} value={formatPlaytime(lang, p.termLeft * 60)} testId="md-election-in" />
        <Stat label={t("md.challenger")} value={p.challenger || "—"} />
        <Stat label={t("md.projectedSeats")} value={`${m.projected.civic}/${CHAMBER}`} tone={m.projected.civic + p.parl.coalition.reduce((n, x) => n + m.projected[x], 0) >= MAJORITY ? "good" : "bad"} />
      </div>
      {p.challenger ? (
        <>
          <Card title={t("md.cityCampaign")} icon="mega">
            <Campaign noDebate />
          </Card>
          <DebatePanel />
        </>
      ) : (
        <Card title={t("md.cityCampaign")} icon="mega">
          <p className="text-[0.9em] text-[var(--md-muted)]">{t("md.campaignLater")}</p>
        </Card>
      )}
      <Card title={t("md.groundGame")} icon="land" testId="md-ground">
        {!m.districts.length ? (
          <p className="text-[0.9em] text-[var(--md-muted)]">{t("md.noMap")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[0.88em]">
              <thead>
                <tr className="md-label">
                  <th className="py-1 text-start">{t("md.district")}</th>
                  <th className="text-start">{t("md.leading")}</th>
                  <th className="text-start">{t("md.effort")}</th>
                  <th className="text-start">{t("md.workingHere")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {m.districts.map((d) => (
                  <tr key={d.id} className="border-t border-[var(--md-line)]">
                    <td className="py-2 font-semibold">
                      {dname(d.name)} <span className="text-[var(--md-muted)]">· {d.seats}</span>
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <PartyDot party={d.winner} />
                        {m.hq.pollster > 0 ? pct(d.share[d.winner]) : "?"}
                      </span>
                    </td>
                    <td className="w-[22%] pe-3">
                      <Bar label="" value={d.effort / 100} right={Math.round(d.effort)} />
                    </td>
                    <td>
                      <span className="flex -space-x-2">
                        {d.workers.slice(0, 4).map((id) => {
                          const who = m.roster.find((x) => x.id === id);
                          return who ? <Portrait key={id} face={who.face} party="civic" size={28} label={who.name} /> : null;
                        })}
                        {d.office && <Icon name="flag" size={16} className="ms-3 self-center" />}
                      </span>
                    </td>
                    <td className="py-1">
                      <span className="flex justify-end gap-1">
                        <Act onClick={() => g.canvass(d.id)} disabled={m.funds < CANVASS_COST} title={money(CANVASS_COST)}>
                          {t("md.canvass")}
                        </Act>
                        <Act onClick={() => g.districtAd(d.id)} disabled={!p.challenger || m.funds < DISTRICT_AD_COST || d.ads >= MAX_DISTRICT_ADS} title={money(DISTRICT_AD_COST)}>
                          {t("md.ad")} {d.ads}/{MAX_DISTRICT_ADS}
                        </Act>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {m.lastResults && (
        <Card title={t("md.lastElection")} icon="vote" testId="md-results">
          <div className="grid gap-2 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {m.lastResults.map((r) => {
              const d = m.districts.find((x) => x.id === r.id);
              return (
                <div key={r.id} className="flex flex-col gap-1.5 rounded-[12px] border border-[var(--md-line)] p-2.5">
                  <p className="flex items-center gap-2 font-bold">
                    <PartyDot party={r.winner} />
                    {d ? dname(d.name) : t("md.wholeCity")}
                  </p>
                  <Stacked label={t("md.results")} parts={PARTIES.filter((x) => r.seats[x] > 0).map((x) => ({ key: x, value: r.seats[x], color: PARTY_COLOR[x], name: t(`party.${x}` as StringKey) }))} />
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <p className="text-[0.8em]" style={{ color: theme.muted }}>
        {t("md.campaignHint")}
      </p>
    </div>
  );
}
