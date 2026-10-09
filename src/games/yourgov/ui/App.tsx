import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRng } from "../../engine/rng";
import { COMMITTEES, LAW_GROUPS, type LawDef, type PartyId } from "../data";
import type { CountryPage, Game, PollPage, Tab } from "../game";
import { EXEC_KINDS, LOWER_SYSTEMS, UPPER_KINDS } from "../scenario";
import * as G from "../sim";
import { Portrait } from "./Chamber";
import { Hemicycle, PollChart, Trend } from "./charts";
import { GlassDefs, canRefract, trackSheen } from "./glass";
import { Icon } from "./icons";
import { Bar, big, cap, Flag, fxText, Group, money, pct, Row, Seg, Sheet, Sw } from "./kit";
import { Achievements, Crosstabs, ExitPoll, HQ, Issues, Leaders, RegionTable, Seats, Speech } from "./Campaign";
import { CourtBox, FrontPage, LegacyBox, MarketsPage, Timeline as Story, TraitChip, WhipControl } from "./Power";
import { Confetti, Decisions, Events, Factions, Government, govAlert, ReferendumButton, Voters } from "./Politics";
import { LawStudio } from "./LawStudio";
import type { MapMode } from "./mapColors";
import { Scene } from "./Scene";
import { Title } from "./Title";

function useGame(g: Game) {
  useSyncExternalStore(g.subscribe, g.getVersion, g.getVersion);
  return g;
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
        <Portrait s={s} p={you} size={52} />
        <div>
          <b>{G.fullName(you)}</b>
          <span className="yg-muted">
            {G.party(s, s.party).name} · age {you.age + G.yearOf(s) - s.sc.startYear}
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
      <Achievements g={g} />
      <Story g={g} />
    </Sheet>
  );
}

/** Who would vote to move a law from today's option to another (by where the parties stand). */
function backersOf(s: G.GameState, l: LawDef, from: number, to: number) {
  return G.partyDefs(s).filter((p) => !p.noRun && posDist(l.options[from].pos, p.pos) - posDist(l.options[to].pos, p.pos) > 0.05);
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
  const me = G.party(s, s.party).pos;
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
          <span className="r">{money(s, G.BILL_COST)}</span>
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
                <span className="yg-optbtns">
                  {!pending && <ReferendumButton g={g} law={sel.id} option={i} />}
                  <button type="button" className="yg-btn small primary" disabled={pending || s.parties[s.party].funds < G.BILL_COST} onClick={() => g.writeBill(sel.id, i)} data-testid={`yg-propose-${i}`}>
                    Propose
                  </button>
                </span>
              )}
            </div>
            <p className="yg-muted small">{fxText(s, o.fx) || "No change to the numbers"}</p>
            {i !== cur && (
              <p className="yg-backline">
                {backersOf(s, sel, cur, i).map((p) => (
                  <span key={p.id} className="yg-chip" style={{ ["--c" as string]: p.color }}>
                    <i />
                    {p.short}
                  </span>
                ))}
                {!backersOf(s, sel, cur, i).length && <span className="yg-muted small">No party wants this change</span>}
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
                <Sw c={G.party(s, x.party).color} />
                <span className="grow">{billName(s, x)}</span>
                <span className={`yg-tag ${x.stage === "passed" ? "good" : x.stage === "failed" ? "bad" : toVote ? "warn" : ""}`}>{toVote ? "Your vote" : G.stageName(s, x.stage)}</span>
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
  const sy = G.sys(s);
  const instit = b.stage === "committee" ? `Committee ${COMMITTEES[(l?.committee ?? 1) - 1]}` : b.stage === "house" ? `${sy.lower.name}${b.insist ? " (overriding the " + sy.upper.short + ")" : ""}` : b.stage === "senate" ? sy.upper.name : b.stage === "president" ? `The ${G.titles(s).president}` : b.stage === "override" ? "Both houses: veto override" : G.stageName(s, b.stage);
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
        <Portrait s={s} p={lawmaker} size={40} />
        <div className="grow">
          <span className="yg-muted small">
            {lawmaker ? G.fullName(lawmaker) : "—"} · {G.party(s, b.party).short}
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
              <span className="r">{b.stage === "president" ? "Signature" : `${need} (${G.required(s, b) > 0.6 ? "two thirds" : "majority"})`}</span>
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
          <WhipControl g={g} b={b} rebels={proj?.rebels ?? 0} />
          <Group label={`Lobby the parties (${money(s, G.LOBBY_COST)} a go, twice each)`}>
            {G.partyDefs(s)
              .filter((p) => p.id !== s.party && G.voters(s, b).some((id) => G.pol(s, id)?.party === p.id))
              .map((p) => (
              <Row key={p.id}>
                <Sw c={p.color} />
                <span className="grow">{p.name}</span>
                <button type="button" className="yg-btn small" disabled={G.timesLobbied(b, p.id) >= G.LOBBY_MAX || s.parties[s.party].funds < G.LOBBY_COST} onClick={() => g.lobby(b.id, p.id)} data-testid={`yg-lobby-${p.id}`}>
                  {G.timesLobbied(b, p.id) >= G.LOBBY_MAX ? "Lobbied twice" : G.timesLobbied(b, p.id) ? "Lobby again" : "Lobby"}
                </button>
              </Row>
              ))}
          </Group>
        </>
      )}
      {b.last && (
        <Group label={`Result in the ${G.stageName(s, b.last.stage)}`}>
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

function Parliament({ g }: { g: Game }) {
  const s = g.s!;
  const sy = G.sys(s);
  const t = G.titles(s);
  const hasUpper = sy.upper.kind !== "none";
  const which = hasUpper ? g.ui.house : "house";
  const seats = which === "house" ? G.houseBy(s) : G.senateBy(s);
  const total = which === "house" ? s.house.length : s.senate.length;
  const head = G.pol(s, s.gov.head);
  const pres = G.pol(s, s.president);
  const c = G.country(s);
  const govSeats = s.gov.parties.reduce((a, p) => a + (G.houseBy(s)[p] ?? 0), 0);
  const parl = sy.exec !== "presidential";
  const chamber = which === "house" ? sy.lower : sy.upper;
  const how = which === "house" ? LOWER_SYSTEMS.find((x) => x.id === G.lowerSystem(s))?.name : UPPER_KINDS.find((x) => x.id === sy.upper.kind)?.name;
  return (
    <Sheet title={chamber.name} eyebrow={`${how ?? ""} · ${total} seats`} onClose={() => g.setUI({ tab: null })} testId="yg-p-chamber">
      {hasUpper && (
        <Seg
          value={which}
          label="House"
          onChange={(v) => g.setUI({ house: v })}
          options={[
            { id: "house", label: sy.lower.short },
            { id: "senate", label: sy.upper.short },
          ]}
          testId="yg-house"
        />
      )}
      <div className="yg-hemi">
        <Hemicycle seats={seats} parties={G.partyDefs(s)} highlight={s.party} />
      </div>
      <Group>
        {(Object.entries(seats) as [PartyId, number][])
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => (
            <Row key={id}>
              <Sw c={G.party(s, id).color} />
              <span className="grow">
                {G.party(s, id).name}
                {s.gov.parties.includes(id) && <span className="yg-tag good">Gov</span>}
              </span>
              <span className="r">{n}</span>
            </Row>
          ))}
        <Row>
          <span className="grow muted">Majority</span>
          <span className="r">{Math.floor(total / 2) + 1}</span>
        </Row>
      </Group>
      <Row onClick={() => g.setUI({ view: "chamber" })}>
        <Icon name="chamber" size={18} />
        <span className="grow">See the {chamber.short} in session</span>
        <Icon name="chevron" size={16} className="yg-faint" />
      </Row>
      <Group label="The government">
        <Row>
          <Portrait s={s} p={head} size={30} />
          <span className="grow">
            {head ? G.fullName(head) : "—"}
            <span className="yg-muted small"> · {t.head}</span>
          </span>
          <span className="r">{head ? G.party(s, head.party).short : ""}</span>
        </Row>
        {sy.exec === "semi" && pres && (
          <Row>
            <Portrait s={s} p={pres} size={30} />
            <span className="grow">
              {G.fullName(pres)}
              <span className="yg-muted small"> · {t.president}</span>
            </span>
            <span className="r">{G.party(s, pres.party).short}</span>
          </Row>
        )}
        <Row>
          <span className="grow">{s.gov.parties.length > 1 ? "Coalition" : "Governing party"}</span>
          <span className="r">{s.gov.parties.map((p) => G.party(s, p).short).join(" + ")}</span>
        </Row>
        {parl && (
          <Row>
            <span className="grow">Seats behind it</span>
            <span className={`r ${govSeats * 2 > s.house.length ? "" : "muted"}`}>
              {govSeats}/{s.house.length} {govSeats * 2 > s.house.length ? "" : "(minority)"}
            </span>
          </Row>
        )}
        <Row>
          <span className="grow">Next election</span>
          <span className="r">
            {G.nextElection(s).title} · {G.dateLabel(s, G.nextElection(s).week)}
          </span>
        </Row>
      </Group>
      {parl && s.gov.head === s.you && (
        <button type="button" className="yg-btn wide" style={{ marginTop: 8 }} onClick={() => window.confirm("Call an early election? The country votes in six weeks.") && g.callElection()} data-testid="yg-call-election">
          <Icon name="vote" size={16} /> Call an early election
        </button>
      )}
      {parl && !G.inGovernment(s) && (
        <button type="button" className="yg-btn wide" style={{ marginTop: 8 }} disabled={s.parties[s.party].funds < G.MOTION_COST || s.week - s.lastMotion < 26} onClick={() => g.noConfidence()} data-testid="yg-no-confidence">
          <Icon name="bills" size={16} /> Motion of no confidence ({money(s, G.MOTION_COST)})
        </button>
      )}
      <Group label={`${cap(t.regions)}: ${t.regionHead.toLowerCase()}s`}>
        {(Object.entries(Object.fromEntries(G.ids(s).map((id) => [id, s.governors.filter((x) => G.pol(s, x)?.party === id).length]))) as [PartyId, number][])
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => (
            <Row key={id}>
              <Sw c={G.party(s, id).color} />
              <span className="grow">{G.party(s, id).name}</span>
              <span className="r">
                {n}/{c.states.length}
              </span>
            </Row>
          ))}
      </Group>
      <CourtBox g={g} />
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
  const list = [...G.partyDefs(s)].sort((a, b) => (poll[b.id] ?? 0) - (poll[a.id] ?? 0) || (house[b.id] ?? 0) - (house[a.id] ?? 0));
  const page = g.ui.poll;
  const pages = (
    <div className="yg-scrollseg">
      <Seg<PollPage>
        value={page}
        label="Polling centre"
        onChange={(v) => g.setUI({ poll: v })}
        options={[
          { id: "parties", label: "Parties" },
          { id: "groups", label: "Groups" },
          { id: "regions", label: cap(G.titles(s).regions.split(" ")[0]) },
          { id: "leaders", label: "Leaders" },
          { id: "issues", label: "Issues" },
          { id: "seats", label: "Seats" },
        ]}
        testId="yg-poll"
      />
    </div>
  );
  if (page !== "parties")
    return (
      <Sheet title="Polling centre" eyebrow={`${s.sc.name} · ${G.dateLabel(s)}`} onClose={() => g.setUI({ tab: null })} testId="yg-p-parties">
        {pages}
        {page === "groups" ? <Crosstabs g={g} /> : page === "regions" ? <RegionTable g={g} /> : page === "leaders" ? <Leaders g={g} /> : page === "issues" ? <Issues g={g} /> : <Seats g={g} />}
      </Sheet>
    );
  return (
    <Sheet title="Polling centre" eyebrow="National polls" onClose={() => g.setUI({ tab: null })} testId="yg-p-parties">
      {pages}
      <PollChart s={s} />
      {list.map((p) => {
        const ps = s.parties[p.id];
        const leader = G.pol(s, ps.leader);
        return (
          <div key={p.id} className={`yg-partycard${p.id === s.party ? " mine" : ""}`} style={{ ["--c" as string]: p.color }}>
            <div className="yg-partycard-top">
              <Sw c={p.color} />
              <b className="grow">
                {p.name}
                {s.gov.parties.includes(p.id) && <span className="yg-tag good">Gov</span>}
              </b>
              <b>{p.noRun ? "—" : pct(poll[p.id])}</b>
            </div>
            <div className="yg-partycard-mid">
              {!p.noRun && <Portrait s={s} p={leader} size={26} />}
              <span className="grow small">
                {p.noRun ? "Doesn't stand in elections" : `${leader ? G.fullName(leader) : ""} · ${p.ideology}`}
                {!p.noRun && !p.others && <TraitChip s={s} party={p.id} />}
                {p.only && ` · ${p.only.length === 1 ? (G.country(s).states.find((x) => x.key === p.only![0])?.name ?? "") + " only" : "regional"}`}
              </span>
              <span className="small">{house[p.id]} seats</span>
            </div>
            {p.id !== s.party && !p.noRun && (
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
      {G.partyDefs(s)
        .filter((p) => !p.noRun)
        .map((p) => (
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
  const p = G.party(s, s.party);
  const ps = s.parties[s.party];
  const sy = G.sys(s);
  const t = G.titles(s);
  const house = G.houseBy(s)[s.party] ?? 0;
  const senate = G.senateBy(s)[s.party] ?? 0;
  const govs = s.governors.filter((x) => G.pol(s, x)?.party === s.party).length;
  const mayors = s.mayors.filter((m) => G.pol(s, m.holder)?.party === s.party).length;
  const c = G.country(s);
  const line = (label: string, v: number, of: number) => (
    <Row>
      <span style={{ width: 96 }}>{label}</span>
      <Bar v={v / Math.max(1, of)} color={p.color} />
      <span className="r" style={{ width: 62 }}>
        {v}/{of}
      </span>
    </Row>
  );
  const role = s.gov.parties[0] === s.party ? `Leading the government` : G.inGovernment(s) ? "Junior partner in government" : "Opposition";
  return (
    <Sheet title={p.name} eyebrow={`${p.ideology} · ${p.short}`} onClose={() => g.setUI({ tab: null })} testId="yg-p-party">
      <div className="yg-tiles">
        <div className="yg-tile-stat">
          <span>Members</span>
          <b>{(ps.members / 1000).toFixed(0)}k</b>
        </div>
        <div className="yg-tile-stat">
          <span>Funds</span>
          <b>{money(s, ps.funds)}</b>
        </div>
        <div className="yg-tile-stat">
          <span>Unity</span>
          <b>{Math.round(ps.unity)}</b>
        </div>
      </div>
      <Group>
        <Row>
          <span className="grow">{t.leader}</span>
          <span className="r">{G.fullName(G.pol(s, s.you)!)}</span>
        </Row>
        <Row>
          <span className="grow">Headquarters</span>
          <span className="r">{c.sections[c.capital].town}</span>
        </Row>
        <Row>
          <span className="grow">Government</span>
          <span className="r">{role}</span>
        </Row>
        {p.bloc && (
          <Row>
            <span className="grow">Alliance</span>
            <span className="r">
              {G.partyDefs(s)
                .filter((x) => x.bloc === p.bloc)
                .map((x) => x.short)
                .join(" + ")}
            </span>
          </Row>
        )}
      </Group>
      <Group label="Offices held">
        {line(sy.lower.short, house, s.house.length)}
        {sy.upper.kind !== "none" && line(sy.upper.short, senate, s.senate.length)}
        {line(cap(t.regionHead) + "s", govs, c.states.length)}
        {line("Mayors", mayors, s.mayors.length)}
      </Group>
      <Factions g={g} />
      <p className="yg-label">Where the parties stand</p>
      <div className="yg-center">
        <Compass s={s} />
      </div>
    </Sheet>
  );
}

function Country({ g }: { g: Game }) {
  const s = g.s!;
  const c = G.country(s);
  const st = s.stats;
  const sy = G.sys(s);
  const t = G.titles(s);
  const head = G.pol(s, s.gov.head);
  const pres = G.pol(s, s.president);
  const cur = s.sc.economy.cur;
  const pages = (
    <Seg<CountryPage>
      value={g.ui.country}
      label="The country"
      onChange={(v) => g.setUI({ country: v })}
      options={[
        { id: "overview", label: "Overview" },
        { id: "markets", label: "Markets" },
      ]}
      testId="yg-country-page"
      className="yg-seg-fill"
    />
  );
  if (g.ui.country === "markets")
    return (
      <Sheet title={s.sc.name} eyebrow="Inflation, rates and markets" onClose={() => g.setUI({ tab: null })} testId="yg-p-country">
        {pages}
        <MarketsPage g={g} />
      </Sheet>
    );
  return (
    <Sheet title={s.sc.name} eyebrow={EXEC_KINDS.find((x) => x.id === sy.exec)?.name ?? ""} onClose={() => g.setUI({ tab: null })} testId="yg-p-country">
      {pages}
      <div className="yg-tiles">
        <div className="yg-tile-stat">
          <span>Population</span>
          <b>{c.pop >= 1e9 ? `${(c.pop / 1e9).toFixed(2)} B` : `${(c.pop / 1e6).toFixed(1)} M`}</b>
        </div>
        <div className="yg-tile-stat">
          <span>GDP</span>
          <b>
            {cur}
            {st.gdp.toFixed(st.gdp >= 100 ? 0 : 2)} T
          </b>
        </div>
        <div className="yg-tile-stat">
          <span>Debt</span>
          <b>{big(s, st.debt)}</b>
        </div>
      </div>
      <Trend s={s} pick={(p) => p.approval} label="Government approval" unit="%" color="#64d2ff" digits={0} />
      <Trend s={s} pick={(p) => p.happiness} label="Happiness" unit="" color="#30d158" />
      <Trend s={s} pick={(p) => p.growth} label="Growth" unit="%" color="#ffd60a" digits={2} />
      <Trend s={s} pick={(p) => p.unemployment} label="Unemployment" unit="%" color="#ff9f0a" />
      <Group label="How it's governed">
        <Row>
          <span className="grow">{t.head}</span>
          <span className="r">{head ? `${G.fullName(head)} (${G.party(s, head.party).short})` : "—"}</span>
        </Row>
        {sy.exec === "semi" && (
          <Row>
            <span className="grow">{t.president}</span>
            <span className="r">{pres ? `${G.fullName(pres)} (${G.party(s, pres.party).short})` : "—"}</span>
          </Row>
        )}
        <Row>
          <span className="grow">{sy.lower.name}</span>
          <span className="r muted small">
            {sy.lower.seats} · {LOWER_SYSTEMS.find((x) => x.id === G.lowerSystem(s))?.name}
          </span>
        </Row>
        {sy.upper.kind !== "none" && (
          <Row>
            <span className="grow">{sy.upper.name}</span>
            <span className="r muted small">
              {s.senate.length} · {UPPER_KINDS.find((x) => x.id === sy.upper.kind)?.name}
              {sy.upper.power === "weak" ? ", can be overruled" : ""}
            </span>
          </Row>
        )}
        <Row>
          <span className="grow">Capital</span>
          <span className="r">{c.sections[c.capital].town}</span>
        </Row>
        <Row>
          <span className="grow">Budget</span>
          <span className="r">
            {st.budget >= 0 ? "+" : "–"}
            {big(s, st.budget)} / yr
          </span>
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
      <Group label={cap(t.regions)}>
        {c.states.map((x) => {
          const gov = G.pol(s, s.governors[x.id]);
          return (
            <Row key={x.id} on={g.ui.state === x.id} onClick={() => g.setUI({ state: g.ui.state === x.id ? null : x.id })}>
              {gov && <Sw c={G.party(s, gov.party).color} />}
              <span className="grow">{x.name}</span>
              <span className="r muted">{x.pop >= 1e6 ? `${(x.pop / 1e6).toFixed(1)} M` : `${(x.pop / 1e3).toFixed(0)} k`}</span>
            </Row>
          );
        })}
      </Group>
    </Sheet>
  );
}

function News({ g }: { g: Game }) {
  const s = g.s!;
  return (
    <Sheet title="News" eyebrow={`${s.sc.name} today`} onClose={() => g.setUI({ tab: null })} testId="yg-p-news">
      <button type="button" className="yg-cta" onClick={() => g.setUI({ paper: true })} data-testid="yg-open-paper">
        <span className="yg-cta-icon">📰</span>
        <span>
          <b>This week&apos;s front page</b>
          <small>The headlines, the polls and the markets</small>
        </span>
        <Icon name="chevron" size={18} />
      </button>
      {s.news.map((n, i) => (
        <article key={i} className={`yg-news ${n.tone > 0 ? "good" : n.tone < 0 ? "bad" : ""}`}>
          <span className="yg-muted small">
            {G.dateLabel(s, n.week)} · {n.kind}
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
  const c = G.country(s);
  const ids = G.ids(s);
  const P = ids.length;
  const k = g.ui.count;
  const counted = Math.floor(Math.min(1, k / 0.45) * e.order.length);
  const reported = Math.floor(Math.max(0, (k - 0.45) / 0.55) * e.order.length);
  const tot = ids.map(() => 0);
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
  // Show the house that was elected (the lower, or the upper in its own election).
  const upperOnly = !e.contests.lower && e.contests.upper && !!e.upper;
  const seats = upperOnly ? e.senateSeats : e.houseSeats;
  const prev = upperOnly ? e.prevSenate : e.prevHouse;
  const showSeats = done && (e.contests.lower || upperOnly);
  const rows = ids
    .map((id, i) => ({ id, share: tot[i] / sum }))
    .filter((r) => !G.party(s, r.id).noRun && (r.share > 0.002 || (seats[r.id] ?? 0) > 0 || reported === 0))
    .sort((a, b) => (showSeats ? (seats[b.id] ?? 0) - (seats[a.id] ?? 0) || b.share - a.share : b.share - a.share));
  const t = G.titles(s);
  const sy = G.sys(s);
  const voterCount = (voters || turnoutAcc) / 1e6;
  return (
    <section className="yg-glass yg-election" data-testid="yg-p-election" aria-label="Election night">
      <p className="yg-eyebrow">
        Election night · {G.yearOf(s, e.week)}
        {showSeats ? ` · ${upperOnly ? sy.upper.short : sy.lower.short}` : ""}
      </p>
      <h2>{e.title}</h2>
      <div className="yg-progress" aria-label="Counted">
        <i style={{ width: `${Math.min(1, k) * 100}%` }} />
      </div>
      {!done && <ExitPoll s={s} e={e} />}
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
          <b>{voterCount >= 1000 ? `${(voterCount / 1000).toFixed(1)} B` : `${voterCount.toFixed(1)} M`}</b>
        </div>
      </div>
      {showSeats && (
        <div className="yg-center">
          <Hemicycle seats={seats} parties={G.partyDefs(s)} size={250} highlight={s.party} />
        </div>
      )}
      <div className="yg-results">
        {rows.map((r) => (
          <div key={r.id} className={`yg-result${r.id === s.party ? " mine" : ""}`}>
            <Sw c={G.party(s, r.id).color} />
            <span className="name">{G.party(s, r.id).short}</span>
            <Bar v={r.share * 2} color={G.party(s, r.id).color} />
            <span className="pc">{reported > 0 ? pct(r.share) : "—"}</span>
            {showSeats && (
              <span className="seats">
                {seats[r.id] ?? 0}
                <em className={(seats[r.id] ?? 0) >= (prev[r.id] ?? 0) ? "up" : "down"}>
                  {(seats[r.id] ?? 0) >= (prev[r.id] ?? 0) ? "▲" : "▼"}
                  {Math.abs((seats[r.id] ?? 0) - (prev[r.id] ?? 0))}
                </em>
              </span>
            )}
          </div>
        ))}
      </div>
      {done && e.president && (
        <div className={`yg-winner${e.president.party === s.party ? " mine" : ""}`} style={{ ["--c" as string]: G.party(s, e.president.party).color }}>
          <span className="yg-muted small">{t.president}-elect</span>
          <b>
            {e.president.name} ({G.party(s, e.president.party).short})
          </b>
          <span className="small">
            {e.president.college ? `${e.president.college[e.president.party] ?? 0} of ${Object.values(e.president.college).reduce((a, b) => a + b, 0)} electoral votes · ` : ""}
            {Math.round(e.president.share * 100)}%{e.president.runoff ? " in the run-off" : ""}
          </span>
        </div>
      )}
      {done && e.contests.lower && sy.exec !== "presidential" && <p className="yg-muted small">Coalition talks follow the count.</p>}
      {done && (e.president?.party === s.party || (!e.president && seats[s.party] === Math.max(...Object.values(seats)))) && <Confetti colors={[G.party(s, s.party).color, "#ffffff", "#ffd60a"]} />}
      {done && (e.contests.lower || e.contests.pres) && <Speech g={g} />}
      <button type="button" className={`yg-btn wide ${done ? "primary" : ""}`} onClick={() => (done ? g.closeElection() : g.setUI({ count: 1 }))} data-testid={done ? "yg-election-continue" : "yg-election-skip"}>
        {done ? "Continue" : "Skip the count"}
      </button>
    </section>
  );
}

/** Coalition talks: you're invited into a government, or you're forming one. */
function Talks({ g }: { g: Game }) {
  const s = g.s!;
  const t = s.talks!;
  const by = G.houseBy(s);
  const total = s.house.length;
  const seatsOf = (o: PartyId[]) => o.reduce((a, p) => a + (by[p] ?? 0), 0);
  const head = G.titles(s).head;
  return (
    <div className="yg-modal-back" data-testid="yg-talks">
      <section className="yg-glass yg-modal small" role="dialog" aria-modal="true" aria-label="Coalition talks">
        <header className="yg-modal-head">
          <div>
            <p className="yg-eyebrow">Coalition talks · {G.sys(s).lower.name}</p>
            <h2>{t.kind === "invited" ? `The ${G.party(s, t.options[0][0]).short} want you in government` : "Form a government"}</h2>
          </div>
        </header>
        <div className="yg-modal-body">
          <p className="yg-muted">
            {t.kind === "invited"
              ? `${G.party(s, t.options[0][0]).name} would lead, with their leader as ${head}. Join as a partner and your party shares power (and the blame).`
              : `Your party is the biggest that can lead. Pick partners for a majority of ${Math.floor(total / 2) + 1}, or try to govern alone.`}
          </p>
          {t.options.map((o, i) => (
            <button key={i} type="button" className="yg-row btn" style={{ borderRadius: 14, background: "rgba(255,255,255,.07)", marginTop: 8 }} onClick={() => g.chooseGovernment(i)} data-testid={`yg-talks-${i}`}>
              <span className="grow">
                {o.map((p) => (
                  <span key={p} className="yg-chip" style={{ ["--c" as string]: G.party(s, p).color, marginRight: 4 }}>
                    <i />
                    {G.party(s, p).short}
                  </span>
                ))}
              </span>
              <span className="r">
                {seatsOf(o)}/{total}
              </span>
            </button>
          ))}
        </div>
        <footer className="yg-modal-foot">
          <button type="button" className="yg-btn" onClick={() => g.chooseGovernment(-1)} data-testid="yg-talks-decline">
            {t.kind === "invited" ? "Stay in opposition" : "Govern alone (minority)"}
          </button>
          {t.kind === "invited" && (
            <button type="button" className="yg-btn primary" onClick={() => g.chooseGovernment(0)} data-testid="yg-talks-accept">
              <Icon name="check" size={16} /> Join the government
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ the frame

function TopBar({ g }: { g: Game }) {
  const s = g.s!;
  const ps = s.parties[s.party];
  const stat = (icon: string, value: string, label: string, cls = "", testId?: string, onClick?: () => void) =>
    onClick ? (
      <button type="button" className={`yg-stat btn ${cls}`} title={label} data-testid={testId} onClick={onClick}>
        <Icon name={icon} size={16} />
        <b>{value}</b>
        <small>{label}</small>
        <span className="yg-stat-plus" aria-hidden>
          +
        </span>
      </button>
    ) : (
      <span className={`yg-stat ${cls}`} title={label} data-testid={testId}>
        <Icon name={icon} size={16} />
        <b>{value}</b>
        <small>{label}</small>
      </span>
    );
  return (
    <header className="yg-top">
      <div className="yg-glass yg-capsule yg-brand">
        <Flag code={s.sc.flag} name={s.sc.name} />
        <span className="yg-brand-name">{s.sc.name}</span>
      </div>
      <div className="yg-glass yg-capsule yg-stats" aria-label="The country and your party">
        {stat("smile", s.stats.happiness.toFixed(1), "Happiness")}
        {stat("thumb", `${s.stats.approval.toFixed(0)}%`, "Approval")}
        {stat("growth", `${s.stats.growth.toFixed(1)}%`, "Growth", "opt")}
        {stat("coins", money(s, ps.funds), "Funds", "", "yg-funds", () => g.setUI({ tab: "events", evKind: "money", event: "fundraiser", evWeek: null }))}
        {stat("people", `${(ps.members / 1000).toFixed(0)}k`, "Members", "opt")}
        {stat("handshake", String(Math.round(ps.unity)), "Unity", "opt2")}
        {stat("seats", String(G.houseBy(s)[s.party] ?? 0), "Seats", "opt3")}
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
              { id: "states", label: cap(G.titles(s).regions.split(" ")[0]), title: `The ${G.titles(s).regions}` },
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
  { id: "events", icon: "events", label: "Events and the diary" },
  { id: "voters", icon: "target", label: "Voters and the press" },
  { id: "chamber", icon: "parliament", label: "Parliament" },
  { id: "parties", icon: "parties", label: "Polling centre" },
  { id: "party", icon: "party", label: "Your party" },
  { id: "gov", icon: "cabinet", label: "Government" },
  { id: "hq", icon: "people", label: "Campaign HQ" },
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
        <button key={t.id} type="button" className="yg-dock-btn" title={t.label} aria-label={t.label} aria-pressed={g.ui.tab === t.id} disabled={!!s.election} onClick={() => g.setUI({ tab: g.ui.tab === t.id ? null : t.id, bill: null, law: null, appoint: null })} data-testid={`yg-tab-${t.id}`}>
          <Icon name={t.icon} size={21} />
          {((t.id === "bills" && toVote) || (t.id === "news" && freshNews) || (t.id === "gov" && govAlert(s)) || (t.id === "party" && (s.lowUnity >= 3 || !!s.challenge))) && <span className="yg-badge" />}
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
  const el = G.nextElection(s);
  if (el.week - s.week < span) marks.push({ w: el.week, icon: "vote", title: el.title, cls: "accent" });
  for (let w = s.week; w < s.week + span; w++) if (G.weekOf(w) === 40) marks.push({ w, icon: "coins", title: "Budget", cls: "" });
  for (const b of s.bills) if (live(b)) marks.push({ w: b.voteAt, icon: G.youVoteOn(s, b) ? "vote" : "bills", title: billName(s, b), cls: G.youVoteOn(s, b) ? "warn" : "" });
  for (const m of s.missions) if (!m.done && !m.failed && m.deadline - s.week < span) marks.push({ w: m.deadline, icon: "career", title: G.missionText(m, s), cls: "" });
  for (const w of new Set(s.plan.map((p) => p.week))) if (w - s.week < span) marks.push({ w, icon: "calendar", title: `${s.plan.filter((p) => p.week === w).length} planned`, cls: "plan" });
  // Tap a week to plan something for it.
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const w = s.week + Math.max(0, Math.min(span - 1, Math.floor(((e.clientX - r.left) / r.width) * span)));
    g.setUI({ tab: "events", evKind: w > s.week ? "campaign" : "diary", evWeek: w > s.week && w - s.week <= 16 ? w : null, event: null });
  };
  return (
    <div className="yg-timeline" aria-label="Coming up: tap a week to plan for it" role="button" tabIndex={-1} onClick={pick} data-testid="yg-timeline">
      {Array.from({ length: span }, (_, i) => (
        <span key={i} className={`yg-tick${G.weekOf(s.week + i) === 1 ? " year" : ""}`} style={{ left: `${(i / span) * 100}%` }} />
      ))}
      {marks.map((m, i) => (
        <span key={i} className={`yg-mark ${m.cls}`} title={`${G.dateLabel(s, m.w)} · ${m.title}`} style={{ left: `${((m.w - s.week + 0.5) / span) * 100}%` }}>
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
        {g.ui.view === "chamber" && !s.election && G.sys(s).upper.kind !== "none" && (
          <Seg
            value={g.ui.house}
            label="House"
            onChange={(v) => g.setUI({ house: v })}
            options={[
              { id: "house", label: G.sys(s).lower.short },
              { id: "senate", label: G.sys(s).upper.short },
            ]}
          />
        )}
      </div>
      <div className="yg-glass yg-capsule yg-timebar">
        <span className="yg-date" data-testid="yg-date">
          {G.dateLabel(s)}
        </span>
        <Timeline g={g} />
      </div>
      <button type="button" className="yg-glass yg-btn icon yg-ff" title="Skip ahead to the next thing that needs you" aria-label="Skip ahead" disabled={!!s.election || !!s.talks || s.over} onClick={() => g.fastForward()} data-testid="yg-ff">
        ⏩
      </button>
      <button type="button" className="yg-endturn" title="End the week (Enter)" disabled={!!s.election || !!s.talks || s.over} onClick={() => g.endTurn()} data-testid="yg-end-turn">
        <Icon name="hourglass" size={20} stroke={2} />
        <span>End week</span>
      </button>
    </footer>
  );
}

/** The latest headlines, rolling past (wide screens). */
function Ticker({ g }: { g: Game }) {
  const s = g.s!;
  const items = s.news.slice(0, 8);
  if (!items.length) return null;
  return (
    <div className="yg-glass yg-capsule yg-ticker" aria-hidden>
      <b>News</b>
      <div className="yg-ticker-track">
        <div className="yg-ticker-run" key={s.week}>
          {items.map((n, i) => (
            <span key={i} className={n.tone > 0 ? "good" : n.tone < 0 ? "bad" : ""}>
              {n.text}
            </span>
          ))}
        </div>
      </div>
    </div>
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

function GameOver({ g }: { g: Game }) {
  const s = g.s!;
  return (
    <div className="yg-modal-back" data-testid="yg-over">
      <section className="yg-glass yg-modal small" role="dialog" aria-modal="true" aria-label="Career over">
        <header className="yg-modal-head">
          <div>
            <p className="yg-eyebrow">
              {G.fullName(G.pol(s, s.you)!)} · {G.party(s, s.party).name} · {s.sc.name}
            </p>
            <h2>{s.ousted ? "Ousted by your party" : "Career over"}</h2>
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
              <span>Elections won</span>
              <b>{s.electionsWon}</b>
            </div>
          </div>
          <LegacyBox g={g} />
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
          <Story g={g} max={10} />
        </div>
        <footer className="yg-modal-foot">
          <button type="button" className="yg-btn primary wide" onClick={() => g.quit()} data-testid="yg-again">
            Save my score and start again
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
      // A decision on screen (a crisis, a debate, a challenge) is answered, not skipped by a stray key.
      if (document.querySelector(".yg-decision")) return;
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
        {g.loadingSave ? (
          <div className="yg-glass yg-loading" role="status" data-testid="yg-loading-save">
            <span className="yg-spin" /> Loading the map…
          </div>
        ) : (
          <Title g={g} />
        )}
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
    ) : tab === "voters" ? (
      <Voters g={g} />
    ) : tab === "gov" ? (
      <Government g={g} />
    ) : tab === "hq" ? (
      <Sheet title="Campaign HQ" eyebrow={`${G.party(s, s.party).name} · funds ${money(s, s.parties[s.party].funds)}`} onClose={() => g.setUI({ tab: null })} testId="yg-p-hq">
        <HQ g={g} />
      </Sheet>
    ) : tab === "settings" ? (
      <Settings g={g} />
    ) : null;
  return (
    <div className={`${cls}${panel ? " yg-panel-open" : ""}`} ref={root} data-testid="yourgov" style={{ ["--pc" as string]: G.party(s, s.party).color }}>
      <GlassDefs />
      <Scene g={g} />
      <div className="yg-vignette" aria-hidden />
      <TopBar g={g} />
      <Dock g={g} />
      {panel}
      {!s.election && !panel && g.ui.view === "map" && <Missions g={g} />}
      {!s.election && g.ui.view === "map" && g.ui.state !== null && (
        <div className="yg-glass yg-capsule yg-statepill">
          <Icon name="pin" size={15} /> {G.country(s).states[g.ui.state].name}
          <button type="button" className="yg-btn icon tiny" aria-label="Clear the selected state" onClick={() => g.setUI({ state: null })}>
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
      {!s.election && !panel && <Ticker g={g} />}
      <BottomBar g={g} />
      <Toasts g={g} />
      {s.election && <ElectionCard g={g} />}
      {s.talks && !s.election && <Talks g={g} />}
      {g.ui.studio && <LawStudio g={g} />}
      <Decisions g={g} />
      {g.ui.paper && !s.election && <FrontPage g={g} />}
      {s.over && !g.ui.result && <GameOver g={g} />}
    </div>
  );
}
