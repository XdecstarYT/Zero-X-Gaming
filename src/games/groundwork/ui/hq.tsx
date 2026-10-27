"use client";

import { useState } from "react";
import * as co from "../company";
import type { Game, HqTab } from "../game";

const { money } = co;

const TABS: { id: HqTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contracts", label: "Contracts" },
  { id: "property", label: "Property" },
  { id: "crew", label: "Crew" },
  { id: "bank", label: "Bank" },
];

/** The office: the company's books, the contracts board, property, the crew and the bank. */
export function Office({ game }: { game: Game }) {
  const c = game.co;
  return (
    <div className="gw-office" data-testid="gw-office">
      <section className="gw-desk gw-glass" aria-label="The office">
        {c ? <Books game={game} c={c} /> : <Found game={game} />}
      </section>
    </div>
  );
}

function Found({ game }: { game: Game }) {
  const [name, setName] = useState("Groundwork & Co.");
  return (
    <div className="gw-found">
      <div className="gw-desk-h">
        <button type="button" className="gw-btn icon" onClick={() => game.quit()} aria-label="Back to the menu">
          ‹
        </button>
        <div>
          <h2>Start your company</h2>
          <p className="dim">{money(co.START_CASH)} in the bank, a ute and a cement mixer.</p>
        </div>
      </div>
      <p className="muted">
        Tender for building contracts against rival firms, or buy land and build to sell or rent. Hire a crew as the work grows, and borrow against what you own. Every brick is still laid by you.
      </p>
      <label className="gw-field">
        <span>Company name</span>
        <input className="gw-input" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} data-testid="gw-co-name" />
      </label>
      <button type="button" className="gw-btn orange wide" onClick={() => game.foundCompany(name)} data-testid="gw-co-start">
        Open for business
      </button>
    </div>
  );
}

function Books({ game, c }: { game: Game; c: co.Company }) {
  const worth = co.worth(c);
  return (
    <>
      <div className="gw-desk-h">
        <button type="button" className="gw-btn icon" onClick={() => game.quit()} aria-label="Back to the menu" data-testid="gw-office-quit">
          ‹
        </button>
        <div style={{ minWidth: 0 }}>
          <h2 data-testid="gw-co-title">{c.name}</h2>
          <p className="dim num">
            Day {c.day} · week {Math.floor(c.day / 7) + 1} · market {(c.market * 100).toFixed(0)}
          </p>
        </div>
        <button type="button" className="gw-btn small" onClick={() => game.skipWeek()} style={{ marginLeft: "auto" }} data-testid="gw-skip-week">
          ⏭ A week
        </button>
      </div>
      <div className="gw-ledger num">
        <div>
          <small>Cash</small>
          <b className={c.cash < 0 ? "bad" : ""} data-testid="gw-co-cash">
            {money(c.cash)}
          </b>
        </div>
        <div>
          <small>Worth</small>
          <b>{money(worth)}</b>
        </div>
        <div>
          <small>Reputation</small>
          <b className="gold" data-testid="gw-co-rep">
            {c.rep}
          </b>
        </div>
      </div>
      <nav className="gw-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={game.hqTab === t.id} className={game.hqTab === t.id ? "on" : ""} onClick={() => game.setHqTab(t.id)} data-testid={`gw-tab-${t.id}`}>
            {t.label}
            {t.id === "contracts" && c.active.length > 0 && <i className="gw-count">{c.active.length}</i>}
          </button>
        ))}
      </nav>
      <div className="gw-desk-body">
        {game.hqTab === "overview" && <Overview game={game} c={c} />}
        {game.hqTab === "contracts" && <Contracts game={game} c={c} />}
        {game.hqTab === "property" && <Property game={game} c={c} />}
        {game.hqTab === "crew" && <Crew game={game} c={c} />}
        {game.hqTab === "bank" && <Bank game={game} c={c} />}
      </div>
    </>
  );
}

function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * 100).toFixed(1)},${(36 - ((v - lo) / Math.max(1, hi - lo)) * 32).toFixed(1)}`).join(" ");
  return (
    <svg className="gw-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Worth over time">
      <path d={d} fill="none" stroke="var(--orange)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Overview({ game, c }: { game: Game; c: co.Company }) {
  return (
    <>
      <div className="gw-tiles">
        <div className="gw-tile">
          <b className="num">×{co.crewSpeed(c).toFixed(2)}</b>
          <small>work rate ({c.crew.length} crew)</small>
        </div>
        <div className="gw-tile">
          <b className="num">{money(co.wages(c))}</b>
          <small>wages a working day</small>
        </div>
        <div className="gw-tile">
          <b className="num">{money(c.props.filter((p) => p.status === "rented").reduce((a, p) => a + p.rent, 0))}</b>
          <small>rent a week</small>
        </div>
        <div className="gw-tile">
          <b className={`num${c.loan ? " bad" : ""}`}>{money(c.loan)}</b>
          <small>owed to the bank</small>
        </div>
      </div>
      {c.history.length > 1 && (
        <div className="gw-sec">
          <h5>Worth, week by week</h5>
          <Spark pts={c.history.map((h) => h.worth)} />
        </div>
      )}
      {(c.active.length > 0 || c.props.length > 0) && (
        <div className="gw-sec">
          <h5>Sites</h5>
          <div className="gw-list">
            {c.active.map((a) => (
              <button key={a.id} type="button" className="gw-job" onClick={() => game.visit({ kind: "contract", id: a.id })}>
                <span className="ic">{a.c.icon}</span>
                <span>
                  <b>{a.c.title}</b>
                  <small>
                    {a.c.client} · {money(a.price)} · {a.c.days} days on site
                  </small>
                </span>
                <span className="st">Go ›</span>
              </button>
            ))}
            {c.props.map((p) => (
              <button key={p.id} type="button" className="gw-job" onClick={() => game.visit({ kind: "property", id: p.id })}>
                <span className="ic">🏡</span>
                <span>
                  <b>
                    {co.plotName(p)} in {co.suburb(p.suburb).name}
                  </b>
                  <small>{statusText(p)}</small>
                </span>
                <span className="st">Go ›</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="gw-sec">
        <h5>The books</h5>
        <div className="gw-log-list" data-testid="gw-co-log">
          {c.log.slice(0, 14).map((l, i) => (
            <div key={i} className={`gw-logline ${l.kind}`}>
              <small className="num">Day {l.day}</small>
              {l.text}
            </div>
          ))}
        </div>
      </div>
      <div className="gw-kv num">
        <span>Contracts finished</span>
        <span>{c.stats.contracts}</span>
        <span>Tenders lost</span>
        <span>{c.stats.lost}</span>
        <span>Earned from contracts</span>
        <span>{money(c.stats.earned)}</span>
        <span>Properties sold</span>
        <span>{c.stats.sold}</span>
        <span>Best profit on a sale</span>
        <span>{money(c.stats.best)}</span>
        <span>Rent collected</span>
        <span>{money(c.stats.rentIncome)}</span>
      </div>
      <Rename game={game} c={c} />
    </>
  );
}

function Rename({ game, c }: { game: Game; c: co.Company }) {
  const [name, setName] = useState(c.name);
  return (
    <div className="gw-sec">
      <h5>The firm</h5>
      <div className="gw-row">
        <input className="gw-input" style={{ flex: 1 }} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} aria-label="Company name" />
        <button type="button" className="gw-btn small" onClick={() => game.renameCompany(name)} disabled={name.trim() === c.name}>
          Rename
        </button>
        <button
          type="button"
          className="gw-btn small red"
          onClick={() => {
            if (window.confirm("Wind up the company? Its cash, contracts and property are gone for good.")) game.windUp();
          }}
        >
          Wind up
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ contracts */

function Contracts({ game, c }: { game: Game; c: co.Company }) {
  return (
    <>
      {c.active.length > 0 && (
        <div className="gw-sec">
          <h5>On the go</h5>
          <div className="gw-list">
            {c.active.map((a) => (
              <div key={a.id} className="gw-card" data-testid="gw-active">
                <div className="gw-card-h">
                  <span className="ic">{a.c.icon}</span>
                  <div>
                    <b>{a.c.title}</b>
                    <small>
                      {a.c.client} · {co.suburb(a.c.suburb).name}
                    </small>
                  </div>
                  <b className="num" style={{ marginLeft: "auto" }}>
                    {money(a.price)}
                  </b>
                </div>
                <p>{a.c.brief}</p>
                <div className="gw-actions">
                  <button type="button" className="gw-btn small red" onClick={() => window.confirm(`Walk away? You hand back the ${money(a.deposit)} deposit and your reputation suffers.`) && game.abandonContract(a.id)}>
                    Walk away
                  </button>
                  <button type="button" className="gw-btn small orange grow" onClick={() => game.visit({ kind: "contract", id: a.id })} data-testid="gw-go-site">
                    Go to site ›
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="gw-sec">
        <h5>Out to tender</h5>
        <p>
          Price each job: your estimate covers materials and labour. Bid under your rivals and inside the client&apos;s budget to win; a better reputation lets you charge more. You can run {co.MAX_ACTIVE} at once.
        </p>
        <div className="gw-list">
          {c.board.map((x) => (
            <Tender key={x.id} game={game} c={c} x={x} />
          ))}
        </div>
        {c.rep < 75 && <p className="dim">Bigger jobs (garages, granny flats, houses) are offered to builders with a name: finish jobs well to earn one.</p>}
      </div>
    </>
  );
}

function Tender({ game, c, x }: { game: Game; c: co.Company; x: co.Contract }) {
  const cost = Math.round(x.est + (x.labour / 540) * co.LABOUR_RATE);
  const [price, setPrice] = useState(() => Math.round((x.fair * 1.0) / 50) * 50);
  const chance = co.winChance(c, x, price);
  const margin = price - x.est;
  const lo = Math.round((cost * 0.8) / 50) * 50;
  const hi = Math.round((x.fair * 1.7) / 50) * 50;
  return (
    <div className="gw-card" data-testid="gw-tender">
      <div className="gw-card-h">
        <span className="ic">{x.icon}</span>
        <div>
          <b>{x.title}</b>
          <small>
            {x.client} · {co.suburb(x.suburb).name} · closes day {x.expires}
          </small>
        </div>
      </div>
      <p>{x.brief}</p>
      <div className="gw-kv num">
        <span>Materials (estimate)</span>
        <span>{money(x.est)}</span>
        <span>Labour, one builder</span>
        <span>{(x.labour / 540).toFixed(1)} days</span>
        <span>Deadline</span>
        <span>{x.days} working days</span>
        <span>Damages if late</span>
        <span>{money(x.ld)} a day</span>
        <span>Rival bidders</span>
        <span>{x.rivals}</span>
      </div>
      <label className="gw-slider">
        <span className="t">
          Your price <b className="num">{money(price)}</b>
          <span className={`num ${margin >= 0 ? "good" : "bad"}`}> · margin over materials {money(margin)}</span>
        </span>
        <input type="range" min={lo} max={hi} step={50} value={price} onChange={(e) => setPrice(+e.target.value)} aria-label={`Price for ${x.title}`} data-testid="gw-bid-price" />
      </label>
      <div className="gw-actions">
        <span className="gw-chance">
          <i style={{ width: `${Math.round(chance * 100)}%` }} />
          <span className="num">{Math.round(chance * 100)}% to win</span>
        </span>
        <button type="button" className="gw-btn small orange" onClick={() => game.tender(x.id, price)} disabled={c.active.length >= co.MAX_ACTIVE} data-testid="gw-bid">
          Submit bid
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ property */

function statusText(p: co.Property) {
  if (p.status === "rented") return `Let to ${p.tenant} at ${money(p.rent)} a week`;
  if (p.status === "vacant") return "A finished house, empty";
  return p.a && p.a.pieces > 0 ? "Under construction" : "A bare block";
}

function Property({ game, c }: { game: Game; c: co.Company }) {
  return (
    <>
      <div className="gw-sec">
        <h5>Your property</h5>
        {!c.props.length && <p>None yet. Buy a block below, build on it, and sell it or rent it out.</p>}
        <div className="gw-list">
          {c.props.map((p) => {
            const v = co.valuation(c, p);
            return (
              <div key={p.id} className="gw-card" data-testid="gw-prop">
                <div className="gw-card-h">
                  <span className="ic">🏡</span>
                  <div>
                    <b>
                      {co.plotName(p)} in {co.suburb(p.suburb).name}
                    </b>
                    <small>{statusText(p)}</small>
                  </div>
                  <b className="num good" style={{ marginLeft: "auto" }}>
                    {money(v.total)}
                  </b>
                </div>
                <div className="gw-kv num">
                  <span>Paid, with duty</span>
                  <span>{money(p.paid)}</span>
                  <span>Spent building</span>
                  <span>{money(p.spent)}</span>
                  <span>Land · building</span>
                  <span>
                    {money(v.land)} · {money(v.building)}
                  </span>
                  {v.rent > 0 && (
                    <>
                      <span>Would let for</span>
                      <span>{money(v.rent)} a week</span>
                    </>
                  )}
                </div>
                <div className="gw-actions">
                  <button type="button" className="gw-btn small orange grow" onClick={() => game.visit({ kind: "property", id: p.id })} data-testid="gw-prop-go">
                    Go to site ›
                  </button>
                  {p.status === "rented" ? (
                    <button type="button" className="gw-btn small" onClick={() => game.endLease(p.id)}>
                      End the lease
                    </button>
                  ) : (
                    <button type="button" className="gw-btn small" onClick={() => game.rentProperty(p.id)} disabled={!p.a?.finished} data-testid="gw-prop-rent">
                      Rent out
                    </button>
                  )}
                  <button type="button" className="gw-btn small" onClick={() => window.confirm(`Put it up for auction? It should fetch about ${money(v.total)}, less 2% to the agent.`) && game.sellProperty(p.id)} data-testid="gw-prop-sell">
                    Sell
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="gw-sec">
        <h5>Land for sale</h5>
        <p>Prices follow the market (now {(c.market * 100).toFixed(0)}) and the suburb. Stamp duty is 4%.</p>
        <div className="gw-list">
          {c.listings.map((l) => {
            const s = co.suburb(l.suburb);
            const total = l.price + co.duty(l.price);
            return (
              <div key={l.id} className="gw-card" data-testid="gw-listing">
                <div className="gw-card-h">
                  <span className="ic">🪧</span>
                  <div>
                    <b>
                      {co.plotName(l)[0].toUpperCase() + co.plotName(l).slice(1)}, {s.name}
                    </b>
                    <small>
                      {l.land} m² · {l.w} × {l.d} m to build on · until day {l.expires}
                    </small>
                  </div>
                  <b className="num" style={{ marginLeft: "auto" }}>
                    {money(l.price)}
                  </b>
                </div>
                <p>{s.blurb}</p>
                <button type="button" className="gw-btn small orange wide" onClick={() => game.buyLand(l.id)} disabled={c.cash < total || c.props.length >= co.MAX_PROPERTIES} data-testid="gw-buy">
                  Buy for {money(total)} with duty
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ crew and bank */

const skill = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

function Crew({ game, c }: { game: Game; c: co.Company }) {
  return (
    <>
      <div className="gw-sec">
        <h5>Your crew</h5>
        <p>
          On a company site the crew works alongside you: the work goes ×{co.crewSpeed(c).toFixed(2)} as fast, for {money(co.wages(c))} each working day.
        </p>
        {!c.crew.length && <p className="dim">Just you so far.</p>}
        <div className="gw-list">
          {c.crew.map((w) => (
            <div key={w.id} className="gw-person" data-testid="gw-worker">
              <span className="ic">{co.ROLES[w.role].icon}</span>
              <span>
                <b>{w.name}</b>
                <small>
                  {co.ROLES[w.role].name} <span className="gold">{skill(w.skill)}</span> · {money(w.wage)} a day
                </small>
              </span>
              <button type="button" className="gw-btn small" onClick={() => window.confirm(`Let ${w.name} go with a week's pay (${money(w.wage * 5)})?`) && game.fireWorker(w.id)}>
                Let go
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="gw-sec">
        <h5>Looking for work</h5>
        <div className="gw-list">
          {c.hires.map((w) => (
            <div key={w.id} className="gw-person" data-testid="gw-hire">
              <span className="ic">{co.ROLES[w.role].icon}</span>
              <span>
                <b>{w.name}</b>
                <small>
                  {co.ROLES[w.role].name} <span className="gold">{skill(w.skill)}</span> · {money(w.wage)} a day · {co.ROLES[w.role].blurb}
                </small>
              </span>
              <button type="button" className="gw-btn small orange" onClick={() => game.hireWorker(w.id)} disabled={c.crew.length >= co.MAX_CREW} data-testid="gw-hire-btn">
                Hire
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Bank({ game, c }: { game: Game; c: co.Company }) {
  const limit = co.loanLimit(c);
  return (
    <>
      <div className="gw-tiles">
        <div className="gw-tile">
          <b className="num" data-testid="gw-loan">
            {money(c.loan)}
          </b>
          <small>borrowed</small>
        </div>
        <div className="gw-tile">
          <b className="num">{money(Math.max(0, limit - c.loan))}</b>
          <small>you could borrow</small>
        </div>
        <div className="gw-tile">
          <b className="num">{money(Math.round((c.loan * co.RATE) / 52))}</b>
          <small>interest a week</small>
        </div>
      </div>
      <div className="gw-sec">
        <p>
          The bank lends {(co.RATE * 100).toFixed(1)}% against your name and 65% of what your property&apos;s worth. Interest comes out every week; an overdraft costs more.
        </p>
        <div className="gw-row">
          {[10_000, 50_000, 200_000].map((n) => (
            <button key={n} type="button" className="gw-btn small" onClick={() => game.borrow(n)} disabled={limit - c.loan <= 0} data-testid={`gw-borrow-${n}`}>
              Borrow {money(n)}
            </button>
          ))}
        </div>
        <div className="gw-row" style={{ marginTop: 8 }}>
          <button type="button" className="gw-btn small" onClick={() => game.repay(10_000)} disabled={!c.loan || c.cash <= 0}>
            Repay {money(10_000)}
          </button>
          <button type="button" className="gw-btn small" onClick={() => game.repay(c.loan)} disabled={!c.loan || c.cash <= 0} data-testid="gw-repay-all">
            Repay it all
          </button>
        </div>
      </div>
      {c.held.length > 0 && (
        <div className="gw-sec">
          <h5>Retentions held</h5>
          <div className="gw-kv num">
            {c.held.map((h, i) => (
              <span key={i} style={{ display: "contents" }}>
                <span>
                  {h.title} (day {h.day})
                </span>
                <span>{money(h.amount)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
