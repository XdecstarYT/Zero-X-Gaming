/**
 * The panels and decisions of the wider politics: events (with the diary, the region and the
 * week to hold them in), voter groups and the press, the government (cabinet, executive
 * actions, coalition deals, foreign relations), your party's factions, and the cards that
 * need an answer: crises, TV debates, leadership challenges and results.
 */
import { useEffect, useRef, useState } from "react";
import { EVENT, EVENT_MAX, EVENTS, type EventDef, type PartyId } from "../data";
import type { EventKind, Game } from "../game";
import * as P from "../politics";
import * as G from "../sim";
import * as C from "../campaign";
import { BudgetBox, BudgetCard, QTCard, ScandalCard } from "./Campaign";
import { Portrait } from "./Chamber";
import { Icon } from "./icons";
import { Bar, fxText, Group, MidBar, Modal, money, pct, Row, Seg, Sheet, Stars, Sw } from "./kit";

const KINDS: { id: EventKind; label: string }[] = [
  { id: "campaign", label: "Campaign" },
  { id: "voters", label: "Voters" },
  { id: "money", label: "Money" },
  { id: "party", label: "Party" },
  { id: "diary", label: "Diary" },
];

/** Regions in alphabetical order, for the dropdowns. */
const regionsSorted = (s: G.GameState) => [...G.country(s).states].sort((a, b) => a.name.localeCompare(b.name));

/** A dropdown of the regions (so nobody has to hit a small one on the map with a thumb). */
export function RegionSelect({ g, label = "Where" }: { g: Game; label?: string }) {
  const s = g.s!;
  const st = g.ui.state ?? s.homeState;
  return (
    <label className="yg-pick">
      <span>
        <Icon name="pin" size={14} /> {label}
      </span>
      <select className="yg-input" value={st} onChange={(e) => g.setUI({ state: Number(e.target.value) })} data-testid="yg-region">
        {regionsSorted(s).map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.id === s.homeState ? " (home)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The weeks you can hold or plan an event in. */
function WeekStrip({ g }: { g: Game }) {
  const s = g.s!;
  const week = g.ui.evWeek ?? s.week;
  const el = G.nextElection(s).week;
  return (
    <div className="yg-weeks" role="radiogroup" aria-label="When" data-testid="yg-weeks">
      {Array.from({ length: P.PLAN_AHEAD + 1 }, (_, i) => s.week + i).map((w) => {
        const n = s.plan.filter((p) => p.week === w).length;
        return (
          <button key={w} type="button" role="radio" aria-checked={w === week} className={`yg-week${w === el ? " vote" : ""}`} onClick={() => g.setUI({ evWeek: w === s.week ? null : w })} data-testid={`yg-week-${w - s.week}`}>
            <small>{w === s.week ? "Now" : w === s.week + 1 ? "Next" : `+${w - s.week}`}</small>
            <b>{G.weekOf(w)}</b>
            <em>{w === el ? "🗳" : n ? "•".repeat(Math.min(3, n)) : G.yearOf(s, w) % 100}</em>
          </button>
        );
      })}
    </div>
  );
}

function eventFx(s: G.GameState, e: EventDef) {
  const out: string[] = [];
  if (e.boost) out.push(`${e.scope === "national" ? "Support everywhere" : "Support here"} +${e.boost}`);
  if (e.money) out.push(`Raises about ${money(s, e.money * G.donorFactor(s))}`);
  if (e.members) out.push(`+${e.members.toLocaleString()} members`);
  if (e.unity) out.push(`Unity ${e.unity > 0 ? "+" : ""}${e.unity}`);
  if (e.group) out.push(`${P.GROUP[e.group].name} +${e.goodwill}`);
  if (e.attack) out.push("Hurts the leading rival");
  if (e.poll) out.push("Polls the region");
  return out;
}

export function Events({ g }: { g: Game }) {
  const s = g.s!;
  const kind = g.ui.evKind;
  const sel = g.ui.event ? EVENT[g.ui.event] : null;
  const c = G.country(s);
  const st = g.ui.state ?? s.homeState;
  const funds = s.parties[s.party].funds;
  const week = Math.max(s.week, g.ui.evWeek ?? s.week);
  const planning = week > s.week;
  const poll = s.polled[st] !== undefined ? G.statePoll(s, st) : null;
  const list = EVENTS.filter((e) => e.kind === kind);
  const usesFor = (id: string) => (planning ? s.plan.filter((p) => p.week === week && p.event === id).length : G.eventUses(s, id));
  const blocked = sel ? (planning ? (usesFor(sel.id) >= EVENT_MAX ? "Already twice that week." : null) : G.eventBlocked(s, sel.id)) : null;
  const pick = (k: EventKind) => g.setUI({ evKind: k, event: g.ui.event && EVENT[g.ui.event]?.kind === k ? g.ui.event : null });
  // On a small screen the card for the event you pick is below the grid: bring it into view.
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (g.ui.event) card.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [g.ui.event]);
  return (
    <Sheet title={planning ? `Plan for ${G.dateLabel(s, week)}` : "Events"} eyebrow={`Funds ${money(s, funds)}${s.plan.length ? ` · ${s.plan.length} planned` : ""}`} onClose={() => g.setUI({ tab: null, event: null })} testId="yg-p-events">
      <Seg<EventKind> value={kind} label="Kind of event" onChange={pick} options={KINDS.map((k) => ({ id: k.id, label: k.id === "diary" && s.plan.length ? `${k.label} ${s.plan.length}` : k.label }))} testId="yg-evkind" className="yg-seg-fill" />
      {kind !== "diary" && (
        <>
          <p className="yg-label">When</p>
          <WeekStrip g={g} />
          {kind === "money" && (
            <p className="yg-note small">
              Fundraisers pay for themselves, so you can always hold one. Donors give less if you ask too often: right now they give <b>{Math.round(G.donorFactor(s) * 100)}%</b>.
            </p>
          )}
          <div className="yg-grid">
            {list.map((e) => {
              const n = usesFor(e.id);
              return (
                <button key={e.id} type="button" className="yg-tile" title={e.name} aria-label={e.name} aria-pressed={g.ui.event === e.id} disabled={n >= EVENT_MAX} onClick={() => g.setUI({ event: e.id })} data-testid={`yg-ev-${e.id}`}>
                  <span className="yg-tile-ico">{e.icon}</span>
                  <span className="yg-tile-name">{e.name}</span>
                  {n > 0 && <span className="yg-uses">{n}/{EVENT_MAX}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
      {kind !== "diary" && sel && sel.kind === kind && (
        <div className="yg-evcard" data-testid="yg-evcard" ref={card}>
          <div className="yg-evcard-head">
            <span className="yg-evcard-ico">{sel.icon}</span>
            <div className="grow">
              <b>{sel.name}</b>
              <p className="yg-muted small">{sel.desc}</p>
            </div>
          </div>
          <div className="yg-chips">
            {eventFx(s, sel).map((x) => (
              <span key={x} className="yg-chip plain">
                {x}
              </span>
            ))}
            {sel.risk ? <span className="yg-chip warn">{Math.round(sel.risk * 100)}% risk</span> : null}
          </div>
          <Group>
            <Row>
              <span className="grow">Cost</span>
              <span className="r">{sel.fund ? `${money(s, sel.cost)} (from the takings)` : money(s, sel.cost)}</span>
            </Row>
            {sel.scope !== "state" && (
              <Row>
                <span className="grow">Where</span>
                <span className="r">{sel.scope === "national" ? "Nationwide" : "The party"}</span>
              </Row>
            )}
            <Row>
              <span className="grow">This {planning ? "week" : "week so far"}</span>
              <span className="r">
                {usesFor(sel.id)} of {EVENT_MAX}
              </span>
            </Row>
          </Group>
          {usesFor(sel.id) === 1 && !planning && <p className="yg-muted small">The second time this week does a little less.</p>}
          {sel.scope === "state" && <RegionSelect g={g} />}
          {planning ? (
            <button type="button" className="yg-btn primary wide big" disabled={!!blocked} onClick={() => g.planEvent(sel.id, week, st)} data-testid="yg-plan">
              <Icon name="calendar" size={17} /> {blocked ?? `Plan it for ${G.dateLabel(s, week)}`}
            </button>
          ) : (
            <button type="button" className="yg-btn primary wide big" disabled={!!blocked} onClick={() => g.holdEvent(sel.id, st)} data-testid="yg-hold">
              {blocked ?? (usesFor(sel.id) ? "Hold it again" : sel.fund ? "Hold the fundraiser" : "Hold the event")}
            </button>
          )}
          {planning && <p className="yg-muted small">It’s held, and paid for, when the week comes. If the party can’t afford it then, it’s called off.</p>}
        </div>
      )}
      {kind === "diary" && <Diary g={g} />}
      {kind !== "diary" && poll && (
        <Group label={`Poll: ${c.states[st].name} (${G.dateLabel(s, s.polled[st])})`}>
          {(Object.entries(poll) as [PartyId, number][])
            .filter(([, v]) => v > 0.001)
            .sort((a, b) => b[1] - a[1])
            .map(([id, v]) => (
              <Row key={id}>
                <Sw c={G.party(s, id).color} />
                <span style={{ width: 52 }}>{G.party(s, id).short}</span>
                <Bar v={v * 2} color={G.party(s, id).color} />
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

function Diary({ g }: { g: Game }) {
  const s = g.s!;
  const c = G.country(s);
  const weeks = [...new Set(s.plan.map((p) => p.week))];
  const cost = s.plan.reduce((a, p) => a + (EVENT[p.event].fund ? 0 : EVENT[p.event].cost), 0);
  return (
    <div data-testid="yg-diary">
      <p className="yg-lede">
        Book events up to {P.PLAN_AHEAD} weeks ahead: pick a week on the strip in any other tab, then an event. {s.plan.length ? `${s.plan.length} booked, ${money(s, cost)} to pay as they come.` : ""}
      </p>
      {!s.plan.length && <p className="yg-empty">Nothing in the diary yet.</p>}
      <button type="button" className="yg-btn primary wide" onClick={() => g.setUI({ evKind: "campaign", evWeek: s.week + 1, event: null })} data-testid="yg-diary-add">
        <Icon name="calendar" size={16} /> Plan an event
      </button>
      {weeks.map((w) => (
        <Group key={w} label={`${G.dateLabel(s, w)} · ${w - s.week === 1 ? "next week" : `in ${w - s.week} weeks`}`}>
          {s.plan
            .filter((p) => p.week === w)
            .map((p) => {
              const e = EVENT[p.event];
              return (
                <Row key={p.id} testId={`yg-plan-${p.id}`}>
                  <span className="yg-tile-ico small">{e.icon}</span>
                  <span className="grow">
                    {e.name}
                    <span className="yg-muted small"> · {e.scope === "state" ? c.states[p.state]?.name : e.scope === "national" ? "nationwide" : "the party"}</span>
                  </span>
                  <span className="r muted small">{e.fund ? "pays" : money(s, e.cost)}</span>
                  <button type="button" className="yg-btn icon tiny" aria-label={`Cancel ${e.name}`} onClick={() => g.unplan(p.id)} data-testid={`yg-unplan-${p.id}`}>
                    <Icon name="close" size={12} />
                  </button>
                </Row>
              );
            })}
        </Group>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ voters and the press

const moodWord = (v: number) => (v >= 30 ? "Loves you" : v >= 12 ? "Warm" : v > -12 ? "Neutral" : v > -30 ? "Cool" : "Hostile");

export function Voters({ g }: { g: Game }) {
  const s = g.s!;
  const poll = G.nationalPoll(s);
  const me = G.party(s, s.party);
  return (
    <Sheet title="Voters & press" eyebrow="Who you need to win" onClose={() => g.setUI({ tab: null })} testId="yg-p-voters">
      <p className="yg-lede">
        Win a group over with events aimed at it and with the laws you pass; goodwill fades without attention, and courting one side of a divide (workers or business, faith or the young, green or rural) costs you a little with the other.
      </p>
      <div className="yg-groups">
        {P.GROUPS.map((gr) => {
          const gp = P.groupPoll(s, gr.id, poll);
          const top = (Object.entries(gp) as [PartyId, number][]).sort((a, b) => b[1] - a[1])[0];
          const gw = s.goodwill[gr.id] ?? 0;
          const ev = P.courtEvent(gr.id);
          return (
            <div key={gr.id} className="yg-groupcard" data-testid={`yg-group-${gr.id}`}>
              <div className="yg-groupcard-top">
                <span className="yg-groupcard-ico">{gr.icon}</span>
                <span className="grow">
                  <b>{gr.name}</b>
                  <small className="yg-muted">{Math.round(gr.base * 100)}% of voters · {moodWord(gw)}</small>
                </span>
                <span className="r" title={`${pct(gp[s.party] ?? 0)} back you`}>
                  <Sw c={me.color} /> {pct(gp[s.party] ?? 0)}
                </span>
              </div>
              <MidBar v={gw} lo={-40} hi={60} />
              <div className="yg-groupcard-foot small">
                <span className="grow yg-muted">
                  Most back <Sw c={G.party(s, top[0]).color} /> <b className="yg-text">{G.party(s, top[0]).short}</b> · {gr.lobby}: {s.lobbies[gr.id] >= 55 ? "endorsing you" : moodWord((s.lobbies[gr.id] ?? 0) / 1.6).toLowerCase()}
                </span>
                {ev && (
                  <button type="button" className="yg-btn small" onClick={() => g.setUI({ tab: "events", evKind: "voters", event: ev })} data-testid={`yg-court-${gr.id}`}>
                    {EVENT[ev].icon} Win over
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Group label={`The press · ${P.pressLift(s) >= 1 ? "kinder than usual" : P.pressLift(s) <= -1 ? "harsher than usual" : "as usual"}`}>
        {P.OUTLETS.map((o) => (
          <Row key={o.id}>
            <span className="grow">
              {o.name}
              <span className="yg-muted small"> · {o.kind}</span>
            </span>
            <MidBar v={s.press[o.id] ?? 0} lo={-50} hi={50} w={90} />
          </Row>
        ))}
      </Group>
      <p className="yg-muted small" style={{ margin: "8px 4px" }}>
        Press conferences, interviews and a good debate win coverage; anything that backfires, and ministers’ scandals, cost it.
      </p>
      <Group label="Interest groups">
        {P.GROUPS.map((gr) => (
          <Row key={gr.id}>
            <span className="grow">
              {gr.lobby}
              {(s.lobbies[gr.id] ?? 0) >= 55 && <span className="yg-tag good">Backs you</span>}
            </span>
            <span className="r muted small">{(s.lobbies[gr.id] ?? 0) > 0 ? `gives ${money(s, Math.max(0, s.lobbies[gr.id]) * 0.0025 * 52)}/yr` : ""}</span>
            <MidBar v={s.lobbies[gr.id] ?? 0} lo={-50} hi={100} w={70} />
          </Row>
        ))}
      </Group>
    </Sheet>
  );
}

// ------------------------------------------------------------------ your party's factions

export function Factions({ g }: { g: Game }) {
  const s = g.s!;
  const sup = P.leadershipSupport(s);
  return (
    <>
      <Group label={`Factions · ${Math.round(sup * 100)}% would back you as ${G.titles(s).leader.toLowerCase()}`} testId="yg-factions">
        {s.factions.map((f) => (
          <Row key={f.id}>
            <span className="grow">
              {f.name}
              <span className="yg-muted small"> · {f.strength}%</span>
            </span>
            <span className="r small muted" style={{ width: 64 }}>
              {f.mood >= 70 ? "Happy" : f.mood >= 45 ? "Content" : f.mood >= 25 ? "Restless" : "Furious"}
            </span>
            <Bar v={f.mood / 100} color={f.mood >= 45 ? "var(--good)" : f.mood >= 25 ? "var(--warn)" : "var(--bad)"} w={80} />
          </Row>
        ))}
      </Group>
      {s.lowUnity >= 3 && <p className="yg-note warn">The party is restless ({s.lowUnity} weeks of low unity). Keep it up and rebels will challenge you.</p>}
      <p className="yg-muted small" style={{ margin: "6px 4px" }}>
        Each wing judges the laws you pass by its own politics, wants its share of your party’s ministers, and cheers up at a congress or a caucus dinner. Lose seats and they all sulk.
      </p>
      <button type="button" className="yg-btn wide" onClick={() => g.setUI({ tab: "events", evKind: "party", event: "congress" })} data-testid="yg-to-congress">
        🎪 Rally the party
      </button>
    </>
  );
}

// ------------------------------------------------------------------ the government

function Cabinet({ g }: { g: Game }) {
  const s = g.s!;
  const head = s.gov.head === s.you;
  const fx = P.cabinetFx(s);
  const pf = g.ui.appoint ? P.PORTFOLIOS.find((x) => x.id === g.ui.appoint) : null;
  if (pf && head) {
    const pool = P.candidates(s).sort((a, b) => P.skill(b) - P.skill(a));
    const now = G.pol(s, s.cabinet[pf.id] ?? -1);
    const postOf = (id: number) => Object.entries(s.cabinet).find(([, v]) => v === id)?.[0];
    return (
      <div data-testid="yg-appoint">
        <Row onClick={() => g.setUI({ appoint: null })}>
          <Icon name="back" size={16} />
          <span className="grow">
            <b>{P.ministerTitle(s, pf.id)}</b>
            <span className="yg-muted small"> · {pf.about}</span>
          </span>
        </Row>
        {now && <p className="yg-lede">Now: {G.fullName(now)}</p>}
        <Group label="Who could serve">
          {pool.slice(0, 40).map((p) => {
            const post = postOf(p.id);
            return (
              <Row key={p.id} onClick={() => g.appoint(pf.id, p.id)} on={p.id === now?.id} testId={`yg-cand-${p.id}`}>
                <Portrait s={s} p={p} size={28} />
                <span className="grow">
                  {G.fullName(p)}
                  <span className="yg-muted small">
                    {" "}
                    · {G.party(s, p.party).short}
                    {p.party === s.party ? ` · ${s.factions.find((f) => f.id === P.factionOf(p))?.name.toLowerCase()}` : ""}
                    {post && post !== pf.id ? ` · now ${P.PORTFOLIOS.find((x) => x.id === post)?.name}` : ""}
                  </span>
                </span>
                <Stars n={P.skill(p)} />
              </Row>
            );
          })}
        </Group>
      </div>
    );
  }
  return (
    <>
      <Group label={`The cabinet${head ? " · tap a post to appoint" : ""}`} testId="yg-cabinet">
        {P.PORTFOLIOS.map((x) => {
          const p = G.pol(s, s.cabinet[x.id] ?? -1);
          return (
            <Row key={x.id} onClick={head ? () => g.setUI({ appoint: x.id }) : undefined} testId={`yg-post-${x.id}`}>
              <span className="yg-tile-ico small">{x.icon}</span>
              <span className="grow">
                <span className="yg-muted small">{P.ministerTitle(s, x.id)}</span>
                <br />
                {p ? G.fullName(p) : <span className="yg-warn">Vacant</span>}
                {p && <span className="yg-muted small"> · {G.party(s, p.party).short}</span>}
              </span>
              {p && <Stars n={P.skill(p)} />}
              {head && <Icon name="chevron" size={15} className="yg-faint" />}
            </Row>
          );
        })}
      </Group>
      <p className="yg-muted small" style={{ margin: "6px 4px" }}>
        What the cabinet does to the country: {fxText(s, { growth: fx.growth, approval: fx.approval, happiness: fx.happiness }) || "nothing much either way"}.
      </p>
    </>
  );
}

function Orders({ g }: { g: Game }) {
  const s = g.s!;
  const [sel, setSel] = useState<string | null>(null);
  const o = sel ? P.ORDER[sel] : null;
  const presidential = G.sys(s).exec === "presidential";
  return (
    <>
      <p className="yg-label">{presidential ? "Executive orders" : "Government actions"}</p>
      <div className="yg-grid" data-testid="yg-orders">
        {P.ORDERS.map((x) => {
          const wait = Math.max(0, (s.orders[x.id] ?? 0) - s.week);
          return (
            <button key={x.id} type="button" className="yg-tile" aria-pressed={sel === x.id} onClick={() => setSel(sel === x.id ? null : x.id)} data-testid={`yg-order-${x.id}`}>
              <span className="yg-tile-ico">{x.icon}</span>
              <span className="yg-tile-name">{x.name}</span>
              {wait > 0 && <span className="yg-uses">{wait}w</span>}
            </button>
          );
        })}
      </div>
      {o && (
        <div className="yg-evcard">
          <b>
            {o.icon} {o.name}
          </b>
          <p className="yg-muted small">{o.desc}</p>
          <div className="yg-chips">
            {fxText(s, { approval: o.approval, happiness: o.happiness, budget: o.budget, growth: o.growth, unemployment: o.unemployment })
              .split(" · ")
              .filter(Boolean)
              .map((t) => (
                <span key={t} className="yg-chip plain">
                  {t}
                </span>
              ))}
            {Object.entries(o.goodwill ?? {}).map(([k, v]) => (
              <span key={k} className={`yg-chip ${v > 0 ? "good" : "bad"}`}>
                {P.GROUP[k].icon} {v > 0 ? "+" : ""}
                {v}
              </span>
            ))}
            {o.foreign ? <span className="yg-chip bad">Abroad {o.foreign}</span> : null}
            {o.risk ? <span className="yg-chip warn">{Math.round(o.risk * (presidential ? 100 : 50))}% the courts block it</span> : null}
          </div>
          <button type="button" className="yg-btn primary wide" disabled={(s.orders[o.id] ?? 0) > s.week} onClick={() => g.order(o.id)} data-testid="yg-order-go">
            {(s.orders[o.id] ?? 0) > s.week ? `Ready in ${s.orders[o.id] - s.week} weeks` : `Do it (then again in ${o.cooldown} weeks)`}
          </button>
        </div>
      )}
    </>
  );
}

function Coalition({ g }: { g: Game }) {
  const s = g.s!;
  const partners = Object.keys(s.partners);
  const junior = G.inGovernment(s) && s.gov.parties[0] !== s.party;
  if (!partners.length && !s.deals.length && !junior) return null;
  return (
    <Group label="The coalition" testId="yg-coalition">
      {partners.map((p) => (
        <Row key={p}>
          <Sw c={G.party(s, p).color} />
          <span className="grow">{G.party(s, p).name}</span>
          <span className="r small muted" style={{ width: 66 }}>
            {s.partners[p] >= 60 ? "Loyal" : s.partners[p] >= 35 ? "Uneasy" : "On the brink"}
          </span>
          <Bar v={s.partners[p] / 100} color={s.partners[p] >= 35 ? "var(--good)" : "var(--bad)"} w={70} />
        </Row>
      ))}
      {s.deals.map((d, i) => {
        const l = G.lawOf(s, d.law);
        const to = l?.options[d.start + d.dir]?.label;
        return (
          <Row key={i}>
            <span className="yg-tile-ico small">🤝</span>
            <span className="grow small">
              {d.forYou ? "Promised to you" : `The ${G.party(s, d.party).short} want`}: <b>{l?.name}</b> → {to}
            </span>
            <span className="r small">{Math.max(0, d.deadline - s.week)}w</span>
          </Row>
        );
      })}
      {junior && (
        <Row onClick={() => window.confirm("Walk out of the government? Your ministers resign and the senior party won't forget it.") && g.leaveGovernment()} className="danger" testId="yg-leave-gov">
          <span className="grow">Leave the government</span>
        </Row>
      )}
    </Group>
  );
}

function Foreign({ g }: { g: Game }) {
  const s = g.s!;
  const head = s.gov.head === s.you;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Group label={head ? "Foreign relations · tap a country" : "Foreign relations"} testId="yg-foreign">
      {s.foreign.map((f) => {
        const wait = Math.max(0, f.ready - s.week);
        return (
          <div key={f.name}>
            <Row onClick={head ? () => setOpen(open === f.name ? null : f.name) : undefined} on={open === f.name} testId={`yg-country-${f.name.replace(/\s+/g, "-")}`}>
              <span className="grow">
                {f.name}
                {f.deal && <span className="yg-tag good">Trade deal</span>}
              </span>
              <span className="r small muted" style={{ width: 54 }}>
                {f.rel >= 50 ? "Ally" : f.rel >= 15 ? "Friendly" : f.rel > -15 ? "Cool" : "Hostile"}
              </span>
              <MidBar v={f.rel} lo={-100} hi={100} w={70} />
            </Row>
            {open === f.name && head && (
              <div className="yg-actions">
                <button type="button" className="yg-btn small" disabled={wait > 0} onClick={() => g.diplomacy(f.name, "visit")} data-testid="yg-dip-visit">
                  ✈️ State visit
                </button>
                <button type="button" className="yg-btn small" disabled={wait > 0 || f.deal || f.rel < 35} title={f.rel < 35 ? "Relations need to be warmer" : undefined} onClick={() => g.diplomacy(f.name, "deal")} data-testid="yg-dip-deal">
                  📦 Trade deal
                </button>
                <button type="button" className="yg-btn small" disabled={wait > 0} onClick={() => g.diplomacy(f.name, "condemn")} data-testid="yg-dip-condemn">
                  📢 Condemn
                </button>
                {wait > 0 && <span className="yg-muted small">Ready in {wait} weeks</span>}
              </div>
            )}
          </div>
        );
      })}
    </Group>
  );
}

export function Government({ g }: { g: Game }) {
  const s = g.s!;
  const t = G.titles(s);
  const head = s.gov.head === s.you;
  const hp = G.pol(s, s.gov.head);
  const role = head ? `You are ${t.head}` : G.inGovernment(s) ? "Junior partner" : "In opposition";
  const nextRef = Math.max(0, P.REFERENDUM_GAP - (s.week - s.lastReferendum));
  return (
    <Sheet title="Government" eyebrow={role} onClose={() => g.setUI({ tab: null, appoint: null })} testId="yg-p-gov">
      {!g.ui.appoint && (
        <div className="yg-govhead">
          <Portrait s={s} p={hp} size={44} />
          <div className="grow">
            <span className="yg-muted small">{t.head}</span>
            <b>{hp ? G.fullName(hp) : "—"}</b>
            <span className="yg-chips">
              {s.gov.parties.map((p) => (
                <span key={p} className="yg-chip" style={{ ["--c" as string]: G.party(s, p).color }}>
                  <i />
                  {G.party(s, p).short}
                </span>
              ))}
            </span>
          </div>
          <div className="yg-govappr">
            <b>{Math.round(s.stats.approval)}%</b>
            <small>approval</small>
          </div>
        </div>
      )}
      {s.crisis && !g.ui.appoint && (
        <button type="button" className="yg-cta warn" onClick={() => g.setUI({ later: { ...g.ui.later, crisis: -1 } })} data-testid="yg-open-crisis">
          <span className="yg-cta-icon">{P.CRISIS[s.crisis.id].icon}</span>
          <span>
            <b>{P.crisisText(s, s.crisis, P.CRISIS[s.crisis.id].title)}</b>
            <small>{s.crisis.mine ? "Waiting on your decision" : "How will you respond?"}</small>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      )}
      <Cabinet g={g} />
      {!g.ui.appoint && (
        <>
          {head ? (
            <>
              <Orders g={g} />
              <Group label="Referendums">
                <Row onClick={() => g.setUI({ tab: "write", law: null })}>
                  <span className="grow small">
                    Put a change to any law straight to the people ({money(s, P.REFERENDUM_COST)}): open the law in <b>Write a bill</b>.{nextRef ? ` Next one in ${nextRef} weeks.` : ""}
                  </span>
                  <Icon name="chevron" size={15} className="yg-faint" />
                </Row>
              </Group>
            </>
          ) : (
            <p className="yg-note">Executive actions, appointments, diplomacy and referendums belong to the {t.head}. Win power to use them.</p>
          )}
          <BudgetBox g={g} />
          <Coalition g={g} />
          <Foreign g={g} />
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ decisions

function CrisisCard({ g }: { g: Game }) {
  const s = g.s!;
  const c = s.crisis!;
  const def = P.CRISIS[c.id];
  const optFx = (o: P.CrisisOption) => (
    <span className="yg-chips">
      {fxText(s, { approval: o.approval, happiness: o.happiness, budget: o.budget, growth: o.growth })
        .split(" · ")
        .filter(Boolean)
        .map((t) => (
          <span key={t} className="yg-chip plain">
            {t}
          </span>
        ))}
      {Object.entries(o.goodwill ?? {}).map(([k, v]) => (
        <span key={k} className={`yg-chip ${v > 0 ? "good" : "bad"}`}>
          {P.GROUP[k].icon} {v > 0 ? "+" : ""}
          {v}
        </span>
      ))}
      {o.foreign ? <span className={`yg-chip ${o.foreign > 0 ? "good" : "bad"}`}>🌐 {o.foreign > 0 ? "+" : ""}{o.foreign}</span> : null}
    </span>
  );
  const gov = def.options[c.govChoice] ?? def.options[0];
  return (
    <Modal label="A crisis" testId="yg-crisis">
      <header className="yg-modal-head">
        <span className="yg-bigico">{def.icon}</span>
        <div>
          <p className="yg-eyebrow">Crisis · {G.dateLabel(s, c.week + 1)}</p>
          <h2>{P.crisisText(s, c, def.title)}</h2>
        </div>
      </header>
      <div className="yg-modal-body">
        <p className="yg-lede">{P.crisisText(s, c, def.text)}</p>
        {c.mine ? (
          <>
            <p className="yg-label">Your decision, {G.titles(s).head}</p>
            {def.options.map((o, i) => (
              <button key={i} type="button" className="yg-choice" onClick={() => g.crisis(i)} data-testid={`yg-crisis-${i}`}>
                <b>{o.label}</b>
                {optFx(o)}
              </button>
            ))}
          </>
        ) : (
          <>
            <p className="yg-label">The government’s response</p>
            <div className="yg-choice static">
              <b>{gov.label}</b>
              {optFx(gov)}
            </div>
            <div className="yg-two" style={{ marginTop: 10 }}>
              <button type="button" className="yg-btn" onClick={() => g.crisis(0)} data-testid="yg-crisis-0">
                👍 Back the government
              </button>
              <button type="button" className="yg-btn" onClick={() => g.crisis(1)} data-testid="yg-crisis-1">
                👎 Attack its handling
              </button>
            </div>
            <p className="yg-muted small" style={{ marginTop: 8 }}>
              Backing a response that works helps you a little; attacking one that goes badly helps you more.
            </p>
          </>
        )}
      </div>
      <footer className="yg-modal-foot">
        <p className="yg-muted">{c.mine ? "Undecided by the end of the week, your ministers pick the first option." : ""}</p>
        <button type="button" className="yg-btn" onClick={() => g.later("crisis")} data-testid="yg-crisis-later">
          Later
        </button>
      </footer>
    </Modal>
  );
}

function DebateCard({ g }: { g: Game }) {
  const s = g.s!;
  const d = s.debate!;
  const rival = G.party(s, d.rival);
  const rl = G.pol(s, s.parties[d.rival].leader);
  const you = G.pol(s, s.you);
  const k = d.answers.length;
  const topic = P.DEBATE_TOPICS.find((x) => x.id === d.topics[k]);
  const total = d.answers.reduce((a, x) => a + x.points, 0);
  return (
    <Modal label="Debate night" testId="yg-debate">
      <header className="yg-modal-head">
        <span className="yg-bigico">🎙️</span>
        <div>
          <p className="yg-eyebrow">Debate night · question {Math.min(k + 1, d.topics.length)} of {d.topics.length}</p>
          <h2>
            You vs the {rival.short}
          </h2>
        </div>
      </header>
      <div className="yg-modal-body">
        <div className="yg-versus">
          <div style={{ ["--c" as string]: G.party(s, s.party).color }}>
            <Portrait s={s} p={you} size={54} />
            <b>{you ? G.fullName(you) : ""}</b>
          </div>
          <span className="yg-vs">{total >= 0 ? "+" : ""}{total.toFixed(1)}</span>
          <div style={{ ["--c" as string]: rival.color }}>
            <Portrait s={s} p={rl} size={54} />
            <b>{rl ? G.fullName(rl) : rival.name}</b>
          </div>
        </div>
        {topic && (
          <p className="yg-question">
            “What would you do about <b>{topic.name}</b>?”
          </p>
        )}
        {P.DEBATE_STYLES.map((st) => (
          <button key={st.id} type="button" className="yg-choice" onClick={() => g.debate(st.id)} data-testid={`yg-debate-${st.id}`}>
            <b>{st.name}</b>
            <span className="yg-muted small">{st.about}</span>
          </button>
        ))}
        {k > 0 && (
          <p className="yg-muted small" style={{ marginTop: 8 }}>
            So far:{" "}
            {d.answers.map((a, i) => (
              <span key={i} className={`yg-chip ${a.points > 1 ? "good" : a.points < -1 ? "bad" : "plain"}`} style={{ marginRight: 4 }}>
                {a.points > 0 ? "+" : ""}
                {a.points.toFixed(1)}
              </span>
            ))}
          </p>
        )}
      </div>
      <footer className="yg-modal-foot">
        <p className="yg-muted">Skip it and you give safe answers.</p>
        <button type="button" className="yg-btn" onClick={() => g.later("debate")} data-testid="yg-debate-later">
          Later
        </button>
      </footer>
    </Modal>
  );
}

function ChallengeCard({ g }: { g: Game }) {
  const s = g.s!;
  const ch = s.challenge!;
  const f = s.factions.find((x) => x.id === ch.faction) ?? s.factions[0];
  const sup = P.leadershipSupport(s);
  return (
    <Modal label="Leadership challenge" testId="yg-challenge">
      <header className="yg-modal-head">
        <span className="yg-bigico">⚔️</span>
        <div>
          <p className="yg-eyebrow">{G.party(s, s.party).name}</p>
          <h2>The {f.name.toLowerCase()} challenge your leadership</h2>
        </div>
      </header>
      <div className="yg-modal-body">
        <p className="yg-lede">
          Months of infighting have come to a head. About <b>{Math.round(sup * 100)}%</b> of the party would back you in a vote today. You need half.
        </p>
        <button type="button" className="yg-choice" onClick={() => g.challenge("vote")} data-testid="yg-challenge-vote">
          <b>Face the vote</b>
          <span className="yg-muted small">Win and the rebels fall into line. Lose and your career is over.</span>
        </button>
        <button type="button" className="yg-choice" disabled={s.parties[s.party].funds < P.CONGRESS_COST} onClick={() => g.challenge("congress")} data-testid="yg-challenge-congress">
          <b>Call a congress first ({money(s, P.CONGRESS_COST)})</b>
          <span className="yg-muted small">Win every wing over a little, then vote.</span>
        </button>
        <button type="button" className="yg-choice" onClick={() => g.challenge("concede")} data-testid="yg-challenge-concede">
          <b>Make concessions</b>
          <span className="yg-muted small">Give the {f.name.toLowerCase()} what they want. You stay, but it costs you standing (score).</span>
        </button>
      </div>
    </Modal>
  );
}

function ResultCard({ g }: { g: Game }) {
  const r = g.ui.result!;
  return (
    <Modal label={r.title} testId="yg-result">
      <div className={`yg-resultcard ${r.tone > 0 ? "good" : r.tone < 0 ? "bad" : ""}`}>
        <span className="yg-bigico">{r.icon}</span>
        <h2>{r.title}</h2>
        {r.lines.map((l, i) => (
          <p key={i} className={i ? "yg-muted" : ""}>
            {l}
          </p>
        ))}
        {r.tone > 0 && <Confetti />}
      </div>
      <footer className="yg-modal-foot">
        <button type="button" className="yg-btn primary wide" onClick={() => g.setUI({ result: null })} data-testid="yg-result-ok">
          Continue
        </button>
      </footer>
    </Modal>
  );
}

/** Party-coloured confetti for a win. */
export function Confetti({ colors }: { colors?: string[] }) {
  const cs = colors?.length ? colors : ["#ffd60a", "#30d158", "#64d2ff", "#ff9f0a", "#bf5af2"];
  return (
    <div className="yg-confetti" aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: cs[i % cs.length], animationDelay: `${((i * 13) % 20) / 20}s`, animationDuration: `${2.2 + ((i * 7) % 10) / 10}s` }} />
      ))}
    </div>
  );
}

/** The decision (if any) that should be on screen now. */
export function Decisions({ g }: { g: Game }) {
  const s = g.s!;
  if (s.election || s.talks || g.ui.studio) return null;
  if (g.ui.result) return <ResultCard g={g} />;
  if (s.over) return null;
  const later = (k: string) => g.ui.later[k] === s.week;
  if (s.challenge && !later("challenge")) return <ChallengeCard g={g} />;
  if (g.ui.budget && s.gov.head === s.you) return <BudgetCard g={g} />;
  if (s.scandal && s.scandal.week < s.week && !later("scandal")) return <ScandalCard g={g} />;
  if (s.crisis && !later("crisis")) return <CrisisCard g={g} />;
  if (C.budgetDue(s) && !later("budget")) return <BudgetCard g={g} />;
  if (s.debate && s.debate.week < s.week && !later("debate")) return <DebateCard g={g} />;
  if (s.qt && s.qt.week < s.week && !later("qt")) return <QTCard g={g} />;
  return null;
}

/** What needs the player's attention in the government panel. */
export const govAlert = (s: G.GameState) => !!s.crisis || C.budgetDue(s) || (s.gov.head === s.you && Object.keys(s.cabinet).length < P.PORTFOLIOS.length);

/** For the law page: put a change to the people. */
export function ReferendumButton({ g, law, option }: { g: Game; law: string; option: number }) {
  const s = g.s!;
  if (s.gov.head !== s.you) return null;
  const wait = Math.max(0, P.REFERENDUM_GAP - (s.week - s.lastReferendum));
  const l = G.lawOf(s, law)!;
  return (
    <button
      type="button"
      className="yg-btn small"
      disabled={wait > 0 || s.parties[s.party].funds < P.REFERENDUM_COST}
      title={wait > 0 ? `Next referendum in ${wait} weeks` : `Put it to the people (${money(s, P.REFERENDUM_COST)})`}
      onClick={() => window.confirm(`Hold a referendum on ${l.name.toLowerCase()}: ${l.options[option].label}? It costs ${money(s, P.REFERENDUM_COST)}; if the people say no, your government takes a knock.`) && g.referendum(law, option)}
      data-testid={`yg-referendum-${option}`}
    >
      🗳️ Referendum
    </button>
  );
}

