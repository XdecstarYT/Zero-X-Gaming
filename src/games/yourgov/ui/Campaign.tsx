/**
 * The campaign machine's panels and cards: the polling centre's pages (voter groups, regions,
 * leaders, issues, seat projections), campaign HQ (staff, the manifesto, where the party
 * stands), the budget, Question Time, party scandals, achievements and election-night extras.
 */
import { Fragment, useState } from "react";
import { createRng } from "../../engine/rng";
import type { PartyId, Pos } from "../data";
import type { Game, HqPage } from "../game";
import * as C from "../campaign";
import * as P from "../politics";
import * as G from "../sim";
import { Portrait } from "./Chamber";
import { Hemicycle } from "./charts";
import { Icon } from "./icons";
import { Group, Modal, money, pct, Row, Seg, Stars, Sw, wage } from "./kit";

const posDist = (a: Pos, b: Pos) => Math.hypot(a.e - b.e, a.s - b.s);

/** The parties worth a column: the biggest by the national poll. */
const topParties = (s: G.GameState, poll: Record<PartyId, number>, n: number) =>
  G.partyDefs(s)
    .filter((p) => !p.noRun)
    .sort((a, b) => (poll[b.id] ?? 0) - (poll[a.id] ?? 0))
    .slice(0, n);

// ------------------------------------------------------------------ the polling centre

/** Voting intention by voter group, YouGov style. */
export function Crosstabs({ g }: { g: Game }) {
  const s = g.s!;
  const poll = G.nationalPoll(s);
  const cols = topParties(s, poll, 5);
  const rows = [{ id: "all", icon: "🗳️", name: "All voters", share: poll }, ...P.GROUPS.map((gr) => ({ id: gr.id, icon: gr.icon, name: gr.name, share: P.groupPoll(s, gr.id, poll) }))];
  return (
    <div data-testid="yg-crosstabs">
      <p className="yg-lede">Voting intention by group. Your goodwill with a group, and the laws you pass, move it.</p>
      <div className="yg-xtab" style={{ gridTemplateColumns: `minmax(104px,1.4fr) repeat(${cols.length}, minmax(44px,1fr))` }}>
        <span className="h" />
        {cols.map((p) => (
          <span key={p.id} className="h" style={{ ["--c" as string]: p.color }}>
            <i />
            {p.short}
          </span>
        ))}
        {rows.map((r) => (
          <Fragment key={r.id}>
            <span className={`n${r.id === "all" ? " all" : ""}`}>
              {r.icon} {r.name}
            </span>
            {cols.map((p) => {
              const v = r.share[p.id] ?? 0;
              return (
                <span key={p.id} className={`c${p.id === s.party ? " mine" : ""}${r.id === "all" ? " all" : ""}`} style={{ background: `color-mix(in srgb, ${p.color} ${Math.round(Math.min(1, v * 1.6) * 70)}%, transparent)` }}>
                  {Math.round(v * 100)}
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
      <p className="yg-muted small" style={{ margin: "6px 4px" }}>
        Figures are percentages. Columns: the five biggest parties.
      </p>
    </div>
  );
}

export function RegionTable({ g }: { g: Game }) {
  const s = g.s!;
  const c = G.country(s);
  const rp = C.regionPolls(s);
  const order = c.states.map((st) => st.id).sort((a, b) => (rp[b][s.party] ?? 0) - (rp[a][s.party] ?? 0));
  return (
    <div data-testid="yg-regions">
      <p className="yg-lede">Your best {G.titles(s).regions} first. Tap one to campaign there.</p>
      <Group>
        {order.map((k) => {
          const sh = (Object.entries(rp[k]) as [PartyId, number][]).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
          const lead = sh[0];
          return (
            <Row key={k} on={g.ui.state === k} onClick={() => g.setUI({ state: k })} testId={`yg-region-row-${k}`}>
              <span className="grow">
                <span className="yg-rname">{c.states[k].name}</span>
                <span className="yg-stack" aria-hidden>
                  {sh.map(([id, v]) => (
                    <i key={id} style={{ width: `${v * 100}%`, background: G.party(s, id).color }} />
                  ))}
                </span>
              </span>
              <span className="r small">
                <Sw c={G.party(s, lead[0]).color} /> {G.party(s, lead[0]).short} {Math.round(lead[1] * 100)}
                <br />
                <span className="yg-muted">you {Math.round((rp[k][s.party] ?? 0) * 100)}</span>
              </span>
            </Row>
          );
        })}
      </Group>
    </div>
  );
}

export function Leaders({ g }: { g: Game }) {
  const s = g.s!;
  const list = C.leaderRatings(s);
  return (
    <div data-testid="yg-leaders">
      <p className="yg-lede">Do voters like the party leaders? Charisma, a united party, the press and (for whoever governs) the government&apos;s approval all count.</p>
      <Group>
        {list.map((x) => {
          const p = G.pol(s, x.leader);
          const net = Math.round((x.fav - x.unfav) * 100);
          return (
            <Row key={x.party}>
              <Portrait s={s} p={p} size={30} />
              <span className="grow">
                {p ? G.fullName(p) : "—"}
                {x.party === s.party && <span className="yg-tag accent">you</span>}
                <span className="yg-fav" aria-label={`${Math.round(x.fav * 100)}% favourable, ${Math.round(x.unfav * 100)}% unfavourable`}>
                  <i className="good" style={{ width: `${x.fav * 100}%` }} />
                  <i className="bad" style={{ width: `${x.unfav * 100}%` }} />
                </span>
                <span className="yg-muted small">
                  <Sw c={G.party(s, x.party).color} /> {G.party(s, x.party).short} · {Math.round(x.fav * 100)}% fav · {Math.round(x.unfav * 100)}% unfav
                </span>
              </span>
              <b className={`r yg-net ${net >= 0 ? "up" : "down"}`}>
                {net > 0 ? "+" : ""}
                {net}
              </b>
            </Row>
          );
        })}
      </Group>
    </div>
  );
}

export function Issues({ g }: { g: Game }) {
  const s = g.s!;
  const is = C.issues(s);
  const poll = G.nationalPoll(s);
  const list = [...C.ISSUES].sort((a, b) => is[b.id] - is[a.id]);
  return (
    <div data-testid="yg-issues">
      <p className="yg-lede">The most important issues facing the country, and the party most trusted on each by the voters who care most.</p>
      <Group>
        {list.map((x) => {
          const gp = P.groupPoll(s, x.group, poll);
          const best = (Object.entries(gp) as [PartyId, number][]).sort((a, b) => b[1] - a[1])[0][0];
          return (
            <Row key={x.id}>
              <span className="yg-tile-ico small">{x.icon}</span>
              <span className="grow">
                {x.name}
                <span className="yg-bar" style={{ display: "block", marginTop: 4 }}>
                  <i style={{ width: `${Math.min(1, is[x.id] * 3) * 100}%`, background: "var(--pc,#0a84ff)" }} />
                </span>
              </span>
              <span className="r small">
                {Math.round(is[x.id] * 100)}%
                <br />
                <span className="yg-muted">
                  <Sw c={G.party(s, best).color} /> {G.party(s, best).short}
                </span>
              </span>
            </Row>
          );
        })}
      </Group>
    </div>
  );
}

export function Seats({ g }: { g: Game }) {
  const s = g.s!;
  const m = s.mrp;
  const sy = G.sys(s);
  const now = G.houseBy(s);
  const total = s.house.length;
  const cost = C.mrpCost(s);
  return (
    <div data-testid="yg-seats">
      <p className="yg-lede">A seat projection runs today&apos;s polls through every seat, the way the {sy.lower.short} is really elected.</p>
      <button type="button" className="yg-btn primary wide" disabled={s.parties[s.party].funds < cost} onClick={() => g.commissionMrp()} data-testid="yg-mrp">
        <Icon name="chart" size={16} /> {m ? "Commission a new projection" : "Commission a seat projection"} ({money(s, cost)})
      </button>
      {m && (
        <>
          <p className="yg-label">
            Projection of {G.dateLabel(s, m.week)}
            {s.week - m.week > 8 ? " · out of date" : ""}
          </p>
          <div className="yg-center">
            <Hemicycle seats={m.lower} parties={G.partyDefs(s)} size={230} highlight={s.party} />
          </div>
          <Group>
            {(Object.entries(m.lower) as [PartyId, number][])
              .filter(([id, n]) => n > 0 || (now[id] ?? 0) > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([id, n]) => {
                const d = n - (now[id] ?? 0);
                return (
                  <Row key={id}>
                    <Sw c={G.party(s, id).color} />
                    <span className="grow">
                      {G.party(s, id).name}
                      <span className="yg-muted small"> · {pct(m.national[id] ?? 0)}</span>
                    </span>
                    <b className="r">{n}</b>
                    <span className={`yg-delta ${d >= 0 ? "up" : "down"}`}>
                      {d >= 0 ? "▲" : "▼"}
                      {Math.abs(d)}
                    </span>
                  </Row>
                );
              })}
            <Row>
              <span className="grow muted">Majority</span>
              <span className="r">{Math.floor(total / 2) + 1}</span>
            </Row>
          </Group>
          {m.pres && (
            <div className="yg-winner" style={{ ["--c" as string]: G.party(s, m.pres.party).color, marginTop: 8 }}>
              <span className="yg-muted small">{G.titles(s).president}: projected winner</span>
              <b>{G.party(s, m.pres.party).name}</b>
              <span className="small">
                {m.pres.college ? `${m.pres.college[m.pres.party] ?? 0} of ${Object.values(m.pres.college).reduce((a, b) => a + b, 0)} electoral votes · ` : ""}
                {Math.round(m.pres.share * 100)}%{m.pres.runoff ? " in a run-off" : ""}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ campaign HQ

function Staff({ g }: { g: Game }) {
  const s = g.s!;
  const next = Math.max(0, C.HIRE_REFRESH - (s.week - s.hiresWeek));
  return (
    <div data-testid="yg-staff">
      <p className="yg-lede">
        Wages {wage(s, C.payroll(s))} a week. New people are looking for work in {next} week{next === 1 ? "" : "s"}. Run out of money and your staff walk.
      </p>
      {C.ROLES.map((r) => {
        const cur = s.staff[r.id];
        const pool = s.hires[r.id] ?? [];
        return (
          <div key={r.id} className="yg-staffcard" data-testid={`yg-role-${r.id}`}>
            <div className="yg-staffcard-top">
              <span className="yg-groupcard-ico">{r.icon}</span>
              <span className="grow">
                <b>{r.name}</b>
                <small className="yg-muted">{r.about}</small>
              </span>
            </div>
            {cur ? (
              <Row>
                <span className="grow">
                  {cur.name} <Stars n={2 + cur.skill * 1.4} />
                </span>
                <span className="r small muted">{wage(s, cur.salary)}/wk</span>
                <button type="button" className="yg-btn small" onClick={() => g.fire(r.id)} data-testid={`yg-fire-${r.id}`}>
                  Let go
                </button>
              </Row>
            ) : (
              pool.map((x, i) => (
                <Row key={i}>
                  <span className="grow">
                    {x.name} <Stars n={2 + x.skill * 1.4} />
                  </span>
                  <span className="r small muted">{wage(s, x.salary)}/wk</span>
                  <button type="button" className="yg-btn small primary" disabled={s.parties[s.party].funds < x.salary * 4} onClick={() => g.hire(r.id, i)} data-testid={`yg-hire-${r.id}-${i}`}>
                    Hire
                  </button>
                </Row>
              ))
            )}
            {!cur && !pool.length && <p className="yg-muted small">Nobody looking right now.</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Changes your voters would welcome, best first. */
function suggestions(s: G.GameState) {
  const me = G.party(s, s.party).pos;
  return G.allLaws(s)
    .filter((l) => !l.constitutional)
    .flatMap((l) => {
      const cur = s.laws[l.id];
      return [-1, 1]
        .filter((d) => l.options[cur + d])
        .map((d) => ({ law: l.id, dir: d, gain: posDist(l.options[cur].pos, me) - posDist(l.options[cur + d].pos, me) }))
        .filter((x) => x.gain > 0.04);
    })
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 14);
}

function Manifesto({ g }: { g: Game }) {
  const s = g.s!;
  const [pick, setPick] = useState<C.Pledge[]>([]);
  const w = C.manifestoElection(s);
  const open = C.manifestoOpen(s);
  const m = s.manifesto && s.manifesto.week === w ? s.manifesto : null;
  const pledged = s.missions.filter((x) => x.pledge && !x.done && !x.failed);
  const toggle = (p: C.Pledge) => setPick((cur) => (cur.some((x) => x.law === p.law) ? cur.filter((x) => x.law !== p.law) : cur.length >= C.MANIFESTO_MAX ? cur : [...cur, p]));
  return (
    <div data-testid="yg-manifesto">
      <p className="yg-lede">
        Up to {C.MANIFESTO_MAX} pledges for the next election. The groups that want them warm to you now; win power and they become promises you have two years to keep.
      </p>
      {pledged.length > 0 && (
        <Group label="Pledges to deliver">
          {pledged.map((x) => (
            <Row key={x.id}>
              <span className="yg-dot warn" />
              <span className="grow">{G.missionText(x, s)}</span>
              <span className="r small">{Math.max(0, x.deadline - s.week)} wk</span>
            </Row>
          ))}
        </Group>
      )}
      {m ? (
        <Group label={`Your manifesto for ${G.dateLabel(s, m.week)}`}>
          {m.pledges.map((p) => {
            const l = G.lawOf(s, p.law);
            return (
              <Row key={p.law}>
                <span className="yg-tile-ico small">📜</span>
                <span className="grow">
                  {l?.name}: {l?.options[s.laws[p.law] + p.dir]?.label ?? "done"}
                </span>
              </Row>
            );
          })}
        </Group>
      ) : !open ? (
        <p className="yg-note">
          Manifestos come out in the {C.MANIFESTO_WINDOW} weeks before an election{w > 0 ? `: yours can be published from ${G.dateLabel(s, w - C.MANIFESTO_WINDOW)}` : ""}.
        </p>
      ) : (
        <>
          <Group label={`Pick your pledges (${pick.length}/${C.MANIFESTO_MAX})`}>
            {suggestions(s).map((x) => {
              const l = G.lawOf(s, x.law)!;
              const on = pick.some((p) => p.law === x.law && p.dir === x.dir);
              const fans = P.GROUPS.filter((gr) => (gr.likes[x.law] ?? 0) * x.dir > 0);
              return (
                <Row key={`${x.law}${x.dir}`} on={on} onClick={() => toggle({ law: x.law, dir: x.dir })} testId={`yg-pledge-${x.law}`}>
                  <span className={`yg-check${on ? " on" : ""}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
                  <span className="grow">
                    {l.name}: {l.options[s.laws[x.law]].label} → <b>{l.options[s.laws[x.law] + x.dir].label}</b>
                  </span>
                  <span className="r small">{fans.map((f) => f.icon).join("")}</span>
                </Row>
              );
            })}
          </Group>
          <button type="button" className="yg-btn primary wide big" disabled={!pick.length || s.parties[s.party].funds < C.MANIFESTO_COST} onClick={() => g.publishManifesto(pick)} data-testid="yg-publish">
            📜 Publish the manifesto ({money(s, C.MANIFESTO_COST)})
          </button>
        </>
      )}
    </div>
  );
}

function Position({ g }: { g: Game }) {
  const s = g.s!;
  const me = G.party(s, s.party);
  const wait = Math.max(0, C.MOVE_GAP - (s.week - s.lastMove));
  const X = (e: number) => 60 + e * 48;
  const Y = (v: number) => 60 - v * 48;
  const btn = (dir: C.MoveDir, label: string, cls: string) => (
    <button type="button" className={`yg-btn small ${cls}`} disabled={wait > 0 || s.parties[s.party].funds < C.MOVE_COST} onClick={() => g.moveParty(dir)} data-testid={`yg-move-${dir}`}>
      {label}
    </button>
  );
  return (
    <div data-testid="yg-position">
      <p className="yg-lede">
        Move the party a step at a time ({money(s, C.MOVE_COST)}, every {C.MOVE_GAP} weeks at most). Voters follow where you stand; the wing you move towards cheers, the others don&apos;t.
      </p>
      <div className="yg-center">
        <svg width="100%" viewBox="0 0 120 120" style={{ maxWidth: 260 }} role="img" aria-label="Your party on the political compass">
          <rect x="10" y="10" width="100" height="100" rx="8" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.18)" />
          <line x1="60" y1="10" x2="60" y2="110" stroke="rgba(255,255,255,.15)" />
          <line x1="10" y1="60" x2="110" y2="60" stroke="rgba(255,255,255,.15)" />
          <circle cx={X(s.pos0.e)} cy={Y(s.pos0.s)} r={C.MOVE_MAX * 48} fill="none" stroke="rgba(255,255,255,.25)" strokeDasharray="2 2" />
          {G.partyDefs(s)
            .filter((p) => !p.noRun && p.id !== s.party)
            .map((p) => (
              <circle key={p.id} cx={X(p.pos.e)} cy={Y(p.pos.s)} r={3.5} fill={p.color} opacity={0.75} />
            ))}
          {s.factions.map((f) => (
            <g key={f.id}>
              <rect x={X(f.pos.e) - 2.5} y={Y(f.pos.s) - 2.5} width={5} height={5} transform={`rotate(45 ${X(f.pos.e)} ${Y(f.pos.s)})`} fill="#fff" opacity={0.3 + f.mood / 150} />
              <text x={X(f.pos.e)} y={Y(f.pos.s) + 9} fontSize="4.5" textAnchor="middle" fill="rgba(245,247,251,.7)">
                {f.name.split(" ")[0]}
              </text>
            </g>
          ))}
          <circle cx={X(me.pos.e)} cy={Y(me.pos.s)} r={6} fill={me.color} stroke="#fff" strokeWidth={1.4} />
          <text x={X(me.pos.e)} y={Y(me.pos.s) - 8} fontSize="5.5" textAnchor="middle" fontWeight="800" fill="#fff">
            {me.short}
          </text>
        </svg>
      </div>
      <div className="yg-dpad">
        {btn("conservative", "▲ Conservative", "up")}
        {btn("left", "◀ Left", "left")}
        {btn("right", "Right ▶", "right")}
        {btn("liberal", "▼ Liberal", "down")}
      </div>
      {wait > 0 && <p className="yg-muted small yg-center">You can move again in {wait} weeks.</p>}
    </div>
  );
}

export function HQ({ g }: { g: Game }) {
  return (
    <>
      <Seg<HqPage>
        value={g.ui.hq}
        label="Campaign HQ"
        onChange={(v) => g.setUI({ hq: v })}
        options={[
          { id: "staff", label: "Staff" },
          { id: "manifesto", label: "Manifesto" },
          { id: "position", label: "Position" },
        ]}
        testId="yg-hq"
        className="yg-seg-fill"
      />
      {g.ui.hq === "staff" ? <Staff g={g} /> : g.ui.hq === "manifesto" ? <Manifesto g={g} /> : <Position g={g} />}
    </>
  );
}

// ------------------------------------------------------------------ the budget

const STEP_SHORT = ["−−", "−", "=", "+", "++"];

export function BudgetCard({ g }: { g: Game }) {
  const s = g.s!;
  const [plan, setPlan] = useState<C.BudgetPlan>(() => ({ ...(s.budgetDraft?.year === G.yearOf(s) ? s.budgetDraft.plan : C.neutralPlan()) }));
  const fx = C.budgetEffects(plan);
  const k = s.sc.economy.gdp / 18;
  // How the vote would go today.
  const bill = { id: -1, law: "budget", option: 0, budget: true, proposer: s.you, party: s.party, stage: "house", voteAt: s.week, committee: [], yourVote: 1, lobbied: [], last: null, plan } as G.Bill;
  const t = G.tally(s, bill, createRng(G.yearOf(s)));
  const passes = G.carries(s, bill, t);
  const sy = G.sys(s);
  return (
    <Modal label="The budget" testId="yg-budget" wide>
      <header className="yg-modal-head">
        <span className="yg-bigico">💷</span>
        <div>
          <p className="yg-eyebrow">
            The budget for {G.yearOf(s) + 1} · to the {sy.lower.short} in week {G.BUDGET_WEEK}
          </p>
          <h2>Write the budget</h2>
        </div>
      </header>
      <div className="yg-modal-body">
        <div className="yg-budget">
          {C.BUDGET_AREAS.map((a) => (
            <div key={a.id} className="yg-budget-row" data-testid={`yg-budget-${a.id}`}>
              <span className="yg-budget-name">
                {a.icon} {a.name}
              </span>
              <Seg<string>
                value={String(plan[a.id] ?? 0)}
                label={a.name}
                onChange={(v) => setPlan({ ...plan, [a.id]: Number(v) })}
                options={STEP_SHORT.map((l, i) => ({ id: String(i - 2), label: l, title: C.BUDGET_STEPS[i] }))}
                className="yg-seg-fill small"
                testId={`yg-budget-${a.id}-seg`}
              />
            </div>
          ))}
        </div>
        <div className="yg-chips" style={{ marginTop: 10 }}>
          <span className={`yg-chip ${fx.happiness >= 0 ? "good" : "bad"}`}>😊 {fx.happiness >= 0 ? "+" : ""}{fx.happiness.toFixed(1)}</span>
          <span className={`yg-chip ${fx.growth >= 0 ? "good" : "bad"}`}>📈 {fx.growth >= 0 ? "+" : ""}{fx.growth.toFixed(2)}%</span>
          <span className={`yg-chip ${fx.budget >= 0 ? "good" : "bad"}`}>
            🏦 {fx.budget >= 0 ? "+" : "–"}
            {s.sc.economy.cur}
            {Math.abs(fx.budget * k).toFixed(0)} B/yr
          </span>
          {fx.approval ? <span className={`yg-chip ${fx.approval >= 0 ? "good" : "bad"}`}>👍 {fx.approval >= 0 ? "+" : ""}{fx.approval.toFixed(1)}</span> : null}
          {fx.unemployment ? <span className="yg-chip good">🛠️ jobless {fx.unemployment.toFixed(2)}%</span> : null}
        </div>
        <p className={`yg-note ${passes ? "" : "warn"}`} data-testid="yg-budget-vote">
          If the vote were today: {t.yes} for, {t.no} against. {passes ? "It would pass." : "It would fail, and a government that loses its budget can fall."}
        </p>
        <p className="yg-muted small">Left-wing parties like spending and taxes; the right likes cuts and worries about deficits. The groups who gain warm to you; the ones who lose remember.</p>
      </div>
      <footer className="yg-modal-foot">
        <button type="button" className="yg-btn" onClick={() => (g.ui.budget ? g.setUI({ budget: false }) : g.later("budget"))} data-testid="yg-budget-later">
          Later
        </button>
        <button type="button" className="yg-btn primary" onClick={() => g.draftBudget(plan)} data-testid="yg-budget-save">
          <Icon name="check" size={16} /> Send it to the {sy.lower.short}
        </button>
      </footer>
    </Modal>
  );
}

/** The budget in the government panel. */
export function BudgetBox({ g }: { g: Game }) {
  const s = g.s!;
  const fx = s.budgetFx;
  const k = s.sc.economy.gdp / 18;
  const head = s.gov.head === s.you;
  const drafted = s.budgetDraft?.year === G.yearOf(s);
  return (
    <Group label="The budget" testId="yg-budgetbox">
      <Row>
        <span className="grow small">
          This year&apos;s: happiness {fx.happiness >= 0 ? "+" : ""}
          {fx.happiness.toFixed(1)} · growth {fx.growth >= 0 ? "+" : ""}
          {fx.growth.toFixed(2)}% · {fx.budget >= 0 ? "+" : "–"}
          {s.sc.economy.cur}
          {Math.abs(fx.budget * k).toFixed(0)} B
        </span>
      </Row>
      {head && (
        <Row onClick={() => g.setUI({ budget: true })} testId="yg-open-budget">
          <span className="grow">{drafted ? "Change next year's budget" : "Write next year's budget"}</span>
          <span className="r small muted">week {G.BUDGET_WEEK}</span>
          <Icon name="chevron" size={15} className="yg-faint" />
        </Row>
      )}
    </Group>
  );
}

// ------------------------------------------------------------------ Question Time and scandals

export function QTCard({ g }: { g: Game }) {
  const s = g.s!;
  const q = s.qt!;
  const rival = G.pol(s, s.parties[q.rival]?.leader ?? -1);
  const you = G.pol(s, s.you);
  const topic = P.DEBATE_TOPICS.find((t) => t.id === q.topic)?.name ?? "the issues";
  return (
    <Modal label={C.qtName(s)} testId="yg-qt">
      <header className="yg-modal-head">
        <span className="yg-bigico">⚔️</span>
        <div>
          <p className="yg-eyebrow">{C.qtName(s)}</p>
          <h2>{q.role === "answer" ? `The ${G.party(s, q.rival).short} leader asks about ${topic}` : `Your question on ${topic}`}</h2>
        </div>
      </header>
      <div className="yg-modal-body">
        <div className="yg-versus">
          <div style={{ ["--c" as string]: G.party(s, s.party).color }}>
            <Portrait s={s} p={you} size={46} />
            <b>{you ? G.fullName(you) : ""}</b>
          </div>
          <span className="yg-vs">vs</span>
          <div style={{ ["--c" as string]: G.party(s, q.rival).color }}>
            <Portrait s={s} p={rival} size={46} />
            <b>{rival ? G.fullName(rival) : G.party(s, q.rival).name}</b>
          </div>
        </div>
        {C.QT_STYLES[q.role].map((st) => (
          <button key={st.id} type="button" className="yg-choice" onClick={() => g.questionTime(st.id)} data-testid={`yg-qt-${st.id}`}>
            <b>{st.name}</b>
            <span className="yg-muted small">{st.about}</span>
          </button>
        ))}
      </div>
      <footer className="yg-modal-foot">
        <p className="yg-muted">{C.staffSkill(s, "speech") ? "Your speechwriter has prepared you." : "A speechwriter would help."}</p>
        <button type="button" className="yg-btn" onClick={() => g.later("qt")} data-testid="yg-qt-later">
          Skip it
        </button>
      </footer>
    </Modal>
  );
}

export function ScandalCard({ g }: { g: Game }) {
  const s = g.s!;
  const x = s.scandal!;
  const def = C.SCANDALS.find((d) => d.id === x.id)!;
  return (
    <Modal label="A scandal" testId="yg-scandal">
      <header className="yg-modal-head">
        <span className="yg-bigico">{def.icon}</span>
        <div>
          <p className="yg-eyebrow">Scandal · {G.party(s, s.party).name}</p>
          <h2>{def.title}</h2>
        </div>
      </header>
      <div className="yg-modal-body">
        <p className="yg-lede">{C.scandalText(s, x, def.text)}</p>
        {C.SCANDAL_OPTIONS.map((o, i) => (
          <button key={i} type="button" className="yg-choice" onClick={() => g.scandal(i)} data-testid={`yg-scandal-${i}`}>
            <b>{x.id === "donor" && i === 0 ? "Return the money" : o.label}</b>
            <span className="yg-muted small">{o.about}</span>
          </button>
        ))}
      </div>
      <footer className="yg-modal-foot">
        <p className="yg-muted">{C.staffSkill(s, "press") ? "Your press secretary softens the blow." : "Undecided by the end of the week, you apologise."}</p>
        <button type="button" className="yg-btn" onClick={() => g.later("scandal")} data-testid="yg-scandal-later">
          Later
        </button>
      </footer>
    </Modal>
  );
}

// ------------------------------------------------------------------ achievements, election night

export function Achievements({ g }: { g: Game }) {
  const s = g.s!;
  const n = Object.keys(s.achievements).length;
  return (
    <>
      <p className="yg-label">
        Achievements · {n}/{C.ACHIEVEMENTS.length}
      </p>
      <div className="yg-badges" data-testid="yg-achievements">
        {C.ACHIEVEMENTS.map((a) => {
          const got = s.achievements[a.id] !== undefined;
          return (
            <div key={a.id} className={`yg-badge-tile${got ? " got" : ""}`} title={`${a.name}: ${a.about}${got ? ` (${G.dateLabel(s, s.achievements[a.id])})` : ""}`}>
              <span>{a.icon}</span>
              <b>{a.name}</b>
              <small>{a.about}</small>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The broadcasters' exit poll, as the count begins (close to the result, not quite it). */
export function ExitPoll({ s, e }: { s: G.GameState; e: G.ElectionRun }) {
  if (!e.contests.lower) return null;
  const ids = G.ids(s);
  const est = ids.map((id, i) => ({ id, n: Math.max(0, Math.round((e.houseSeats[id] ?? 0) * (1 + ((((i + 1) * 7919 + e.week * 31) % 13) - 6) / 100))) })).filter((x) => x.n > 0);
  est.sort((a, b) => b.n - a.n);
  return (
    <div className="yg-exitpoll" data-testid="yg-exitpoll">
      <b>Exit poll</b>
      {est.slice(0, 3).map((x) => (
        <span key={x.id} className="yg-chip" style={{ ["--c" as string]: G.party(s, x.id).color }}>
          <i />
          {G.party(s, x.id).short} {x.n}
        </span>
      ))}
    </div>
  );
}

export function Speech({ g }: { g: Game }) {
  const s = g.s!;
  const e = s.election!;
  if (s.speech === e.week) return <p className="yg-muted small">You&apos;ve given your speech.</p>;
  const won = C.electionWon(s, e);
  return (
    <div className="yg-speech" data-testid="yg-speech">
      <p className="yg-label">{won ? "Your victory speech" : "Your speech"}</p>
      <div className="yg-speech-row">
        {(won ? C.SPEECHES.win : C.SPEECHES.lose).map((sp) => (
          <button key={sp.id} type="button" className="yg-btn small" title={sp.about} onClick={() => g.speech(sp.id)} data-testid={`yg-speech-${sp.id}`}>
            {sp.name}
          </button>
        ))}
      </div>
    </div>
  );
}
