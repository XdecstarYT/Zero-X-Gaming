"use client";

import { useState } from "react";
import { BUILDINGS, CONSCRIPTION, ECONOMY_LAWS, IDEOLOGIES, IDEOLOGY_ORDER, ITEM_INFO, ITEMS, UNITS, type ConscriptionId, type EconomyLawId, type ItemId } from "../data";
import * as act from "../actions";
import { buy, buyPrice, sell, sellPrice, stabilityTarget } from "../economy";
import { leaveAlliance } from "../military";
import type { Game, PanelId } from "../game";
import { score } from "../sim";
import { dateText, manpowerMax, power, relation, shownCount, unitCount, type Army } from "../state";
import { cityAt } from "../world";
import { money, people, perDay, qty } from "./fmt";

const TITLES: Record<PanelId, string> = { nation: "Your nation", economy: "Economy", military: "Military", diplomacy: "Diplomacy", politics: "Politics", world: "The world" };

export function Panel({ game }: { game: Game }) {
  const p = game.panel!;
  return (
    <div className="sv-sheet sv-glass" data-testid={`sv-panel-${p}`}>
      <div className="sv-sheet-head">
        <h2>{TITLES[p]}</h2>
        <button className="sv-x" type="button" aria-label="Close" onClick={() => game.openPanel(null)}>
          ✕
        </button>
      </div>
      <div className="sv-sheet-body">
        {p === "nation" && <NationPanel game={game} />}
        {p === "economy" && <EconomyPanel game={game} />}
        {p === "military" && <MilitaryPanel game={game} />}
        {p === "diplomacy" && <DiplomacyPanel game={game} />}
        {p === "politics" && <PoliticsPanel game={game} />}
        {p === "world" && <WorldPanel game={game} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ nation */

function NationPanel({ game }: { game: Game }) {
  const s = game.s!;
  const world = game.world!;
  const n = s.nations[s.player];
  const cities = s.cities.filter((c) => c.owner === s.player);
  const pop = cities.reduce((a, c) => a + c.pop, 0);
  const al = s.alliances.find((a) => a.id === n.alliance);
  const subjects = s.nations.filter((o) => o.alive && o.overlord === s.player);
  const forms = act.formableFor(s, s.player);
  const wars = s.wars.filter((w) => w.attackers.includes(s.player) || w.defenders.includes(s.player));
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span className="sv-swatch" style={{ background: n.color, width: 26, height: 26 }} />
        <b style={{ fontSize: 18, flex: 1 }}>{n.name}</b>
        <span className="sv-pill">
          {IDEOLOGIES[n.ideology].icon} {IDEOLOGIES[n.ideology].name}
        </span>
      </div>
      <div className="sv-kv">
        <div>
          <small>Treasury</small>
          <b className={n.money < 0 ? "bad" : ""}>{money(n.money)}</b>
        </div>
        <div>
          <small>Income</small>
          <b className={n.last.income >= 0 ? "good" : "bad"}>{perDay(n.last.income)}</b>
        </div>
        <div>
          <small>GDP</small>
          <b>{perDay(n.last.gdp)}</b>
        </div>
        <div>
          <small>People</small>
          <b>{people(pop)}</b>
        </div>
        <div>
          <small>Cities</small>
          <b>{cities.length}</b>
        </div>
        <div>
          <small>Score</small>
          <b>{score(s).toLocaleString()}</b>
        </div>
      </div>
      <h3 className="sv-h3">The books, a day</h3>
      <div className="sv-row">
        <span className="grow">
          <b>Taxes</b>
          <small>{Math.round(n.tax * 100)}% of GDP, collected at {Math.round(60 + 0.4 * n.stability)}% efficiency</small>
        </span>
        <b className="good num">{perDay(n.last.tax)}</b>
      </div>
      <div className="sv-row">
        <span className="grow">
          <b>Trade deals</b>
          <small>{n.trade.length} partners</small>
        </span>
        <b className="good num">{perDay(n.last.trade)}</b>
      </div>
      <div className="sv-row">
        <span className="grow">
          <b>Forces and debt</b>
          <small>Upkeep of every unit, and interest if you&apos;re in the red</small>
        </span>
        <b className="bad num">{perDay(-n.last.upkeep)}</b>
      </div>
      <h3 className="sv-h3">Stability</h3>
      <div className="sv-bar">
        <span style={{ width: `${n.stability}%`, background: n.stability < 35 ? "var(--bad)" : n.stability < 55 ? "var(--warn)" : "var(--good)" }} />
      </div>
      <p className="sv-note">
        {Math.round(n.stability)}% now, heading for {Math.round(stabilityTarget(s, n))}%. War weariness {Math.round(n.exhaustion)}%. Below 30%, cities riot and occupied ones rise up.
      </p>
      <h3 className="sv-h3">Friends and subjects</h3>
      {al ? (
        <div className="sv-row">
          <span className="sv-swatch" style={{ background: al.color }} />
          <span className="grow">
            <b>{al.name}</b>
            <small>
              {al.members.length} members · led by {s.nations[al.leader]?.name}
            </small>
          </span>
        </div>
      ) : (
        <p className="sv-note">No alliance. Found one or join one in Diplomacy.</p>
      )}
      {subjects.map((o) => (
        <div key={o.id} className="sv-row click" onClick={() => game.inspectNation(o.id)}>
          <span className="sv-swatch" style={{ background: o.color }} />
          <span className="grow">
            <b>{o.name}</b>
            <small>Your subject: pays you 15% of its taxes and fights your wars</small>
          </span>
        </div>
      ))}
      {wars.length > 0 && (
        <>
          <h3 className="sv-h3">Your wars</h3>
          {wars.map((w) => (
            <WarRow key={w.id} game={game} id={w.id} />
          ))}
        </>
      )}
      <h3 className="sv-h3">Form a nation</h3>
      {forms.length ? (
        forms.map((f) => {
          const why = act.canForm(s, world, s.player, f);
          const need = act.formableCities(world, f);
          const have = need.filter((c) => s.cities[c].owner === s.player).length;
          return (
            <div key={f.id} className="sv-row" style={{ alignItems: "flex-start" }}>
              <span className="sv-swatch" style={{ background: f.color, marginTop: 3 }} />
              <span className="grow" style={{ whiteSpace: "normal" }}>
                <b>{f.name}</b>
                <small style={{ whiteSpace: "normal" }}>
                  {f.blurb} {have}/{need.length} cities{f.ideology ? ` · must be ${IDEOLOGIES[f.ideology].name.toLowerCase()}` : ""}.
                </small>
                <small style={{ whiteSpace: "normal" }}>{need.map((c) => `${s.cities[c].owner === s.player ? "✓" : "○"} ${world.cities[c].name}`).join("  ")}</small>
              </span>
              <button className="sv-btn small gold" type="button" disabled={!!why} title={why ?? ""} onClick={() => game.run(act.form(s, world, s.player, f.id))}>
                Form
              </button>
            </div>
          );
        })
      ) : (
        <p className="sv-note">Nothing to form from {n.name}{n.formed ? " (you already have)" : ""}.</p>
      )}
      <h3 className="sv-h3">Nuclear programme</h3>
      {n.nuclear ? (
        <p className="sv-note">
          Complete. {n.nukes} warhead{n.nukes === 1 ? "" : "s"} ready. Build more at a missile silo.
        </p>
      ) : n.nuclearDays > 0 ? (
        <p className="sv-note">Under way: {n.nuclearDays} days to go.</p>
      ) : (
        <button className="sv-btn small" type="button" onClick={() => game.run(act.startNuclear(s, s.player), "Programme started")}>
          ☢️ Start one ({money(act.NUCLEAR_COST)}, 30 uranium, 540 days)
        </button>
      )}
      <h3 className="sv-h3">Game</h3>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="sv-btn small" type="button" onClick={() => (game.persist(), game.toast("Saved", "good"))}>
          Save
        </button>
        <button className="sv-btn small" type="button" onClick={() => game.quitToTitle()}>
          Save and quit
        </button>
        <button className="sv-btn small red" type="button" onClick={() => confirm("Step down and end this game?") && game.resign()}>
          Step down
        </button>
      </div>
    </>
  );
}

function WarRow({ game, id }: { game: Game; id: number }) {
  const s = game.s!;
  const w = s.wars.find((x) => x.id === id);
  if (!w) return null;
  const mine = w.attackers.includes(s.player) ? 1 : w.defenders.includes(s.player) ? -1 : 0;
  const sc = Math.round(act.warScore(s, w) * (mine || 1));
  const other = mine === 1 ? w.defenders[0] : w.attackers[0];
  return (
    <div className="sv-row click" onClick={() => game.inspectNation(mine ? other : w.defenders[0])}>
      <span className="sv-icon">⚔️</span>
      <span className="grow">
        <b>{w.name}</b>
        <small>
          {w.attackers.map((a) => s.nations[a].name).slice(0, 3).join(", ")}
          {w.attackers.length > 3 ? "…" : ""} vs {w.defenders.map((a) => s.nations[a].name).slice(0, 3).join(", ")}
          {w.defenders.length > 3 ? "…" : ""} · day {s.day - w.start}
        </small>
      </span>
      <b className={`num ${mine ? (sc >= 0 ? "good" : "bad") : ""}`}>{mine ? sc : Math.round(act.warScore(s, w))}</b>
    </div>
  );
}

/* ------------------------------------------------------------------ economy */

function EconomyPanel({ game }: { game: Game }) {
  const s = game.s!;
  const world = game.world!;
  const n = s.nations[s.player];
  const [tab, setTab] = useState<"market" | "cities" | "laws">("market");
  return (
    <>
      <div className="sv-seg">
        {(["market", "cities", "laws"] as const).map((t) => (
          <button key={t} type="button" className={`sv-btn small ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t === "market" ? "Resources and market" : t === "cities" ? "Cities" : "Taxes and laws"}
          </button>
        ))}
      </div>
      {tab === "laws" && (
        <>
          <h3 className="sv-h3">Tax rate: {Math.round(n.tax * 100)}%</h3>
          <input className="sv-range" type="range" min={5} max={60} value={Math.round(n.tax * 100)} onChange={(e) => (act.setTax(s, s.player, Number(e.target.value) / 100), game.bump())} aria-label="Tax rate" data-testid="sv-tax" />
          <p className="sv-note">Higher taxes fill the treasury and empty the people&apos;s patience: stability heads for {Math.round(stabilityTarget(s, n))}% at this rate.</p>
          <h3 className="sv-h3">Economy</h3>
          {(Object.keys(ECONOMY_LAWS) as EconomyLawId[]).map((k) => (
            <button key={k} type="button" className="sv-row click" style={{ width: "100%", textAlign: "left", outline: n.economy === k ? "2px solid var(--gold)" : "none" }} onClick={() => (act.setEconomy(s, s.player, k), game.bump())}>
              <span className="grow">
                <b>{ECONOMY_LAWS[k].name}</b>
                <small style={{ whiteSpace: "normal" }}>{ECONOMY_LAWS[k].blurb}</small>
              </span>
            </button>
          ))}
        </>
      )}
      {tab === "market" && (
        <>
          <div className="sv-kv">
            <div>
              <small>Power</small>
              <b className={n.last.power < n.last.powerUse ? "bad" : "good"}>
                {Math.round(n.last.power)}/{Math.round(n.last.powerUse)}
              </b>
            </div>
            <div>
              <small>Shops stocked</small>
              <b className={n.last.consumer < 0.95 ? "bad" : "good"}>{Math.round(n.last.consumer * 100)}%</b>
            </div>
            <div>
              <small>Fuel for forces</small>
              <b className={n.fuel < 1 ? "bad" : "good"}>{Math.round(n.fuel * 100)}%</b>
            </div>
          </div>
          {n.last.power < n.last.powerUse && <p className="sv-note bad">Not enough power: everything runs at {Math.round((100 * n.last.power) / Math.max(1, n.last.powerUse))}%. Build power stations (and keep them fuelled).</p>}
          <h3 className="sv-h3">Stock · a day · world price</h3>
          {ITEMS.map((k) => (
            <ItemRow key={k} game={game} k={k} />
          ))}
          <p className="sv-note">Auto-sell sells anything above a month&apos;s reserve; auto-buy keeps a month&apos;s worth in stock.</p>
        </>
      )}
      {tab === "cities" &&
        s.cities
          .filter((c) => c.owner === s.player)
          .sort((a, b) => b.gdp - a.gdp)
          .map((c) => {
            const wc = world.cities[c.id];
            const lv = Object.values(c.buildings).reduce((a, b) => a + (b ?? 0), 0);
            return (
              <button key={c.id} type="button" className="sv-row click" style={{ width: "100%", textAlign: "left" }} onClick={() => (game.flyTo(wc.x, wc.y, Math.max(1.4, game.view!.cam.zoom)), game.openCity(c.id))}>
                <span className="grow">
                  <b>
                    {wc.name}
                    {n.capital === c.id ? " ★" : ""}
                    {c.build ? " 🏗️" : ""}
                  </b>
                  <small>
                    {people(c.pop)} · dev {c.dev} · {lv} building levels{c.deposits.length ? ` · ${c.deposits.map((d) => ITEM_INFO[d.res].icon).join("")}` : ""}
                  </small>
                </span>
                <b className="num">{perDay(c.gdp)}</b>
              </button>
            );
          })}
    </>
  );
}

function ItemRow({ game, k }: { game: Game; k: ItemId }) {
  const s = game.s!;
  const n = s.nations[s.player];
  const net = (n.last.produced[k] ?? 0) - (n.last.used[k] ?? 0);
  const info = ITEM_INFO[k];
  const toggle = (list: "autoSell" | "autoBuy") => game.toggleAuto(list, k);
  return (
    <div className="sv-row" style={{ flexWrap: "wrap" }}>
      <span className="sv-icon">{info.icon}</span>
      <span className="grow">
        <b>
          {info.name} <span className="num">{qty(n.stock[k])}</span>
        </b>
        <small>
          <span className={net > 0.01 ? "good" : net < -0.01 ? "bad" : ""}>
            {net >= 0 ? "+" : ""}
            {qty(net)}/d
          </span>{" "}
          · sell {money(sellPrice(s, k))} · buy {money(buyPrice(s, k))}
        </small>
      </span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button className="sv-btn tiny" type="button" disabled={n.stock[k] < 1} onClick={() => (sell(s, n, k, Math.min(10, n.stock[k])), game.bump())}>
          Sell 10
        </button>
        <button className="sv-btn tiny" type="button" disabled={n.stock[k] < 1} onClick={() => (sell(s, n, k, n.stock[k]), game.bump())}>
          All
        </button>
        <button className="sv-btn tiny" type="button" disabled={n.money < buyPrice(s, k) * 10} onClick={() => (buy(s, n, k, 10), game.bump())}>
          Buy 10
        </button>
        <button className={`sv-btn tiny ${n.autoSell.includes(k) ? "on" : ""}`} type="button" onClick={() => toggle("autoSell")} title="Sell anything above a month's reserve">
          Auto-sell
        </button>
        <button className={`sv-btn tiny ${n.autoBuy.includes(k) ? "on" : ""}`} type="button" onClick={() => toggle("autoBuy")} title="Keep a month's worth in stock">
          Auto-buy
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ military */

function MilitaryPanel({ game }: { game: Game }) {
  const s = game.s!;
  const world = game.world!;
  const n = s.nations[s.player];
  const mine = s.armies.filter((a) => a.owner === s.player);
  const by = (d: string) => mine.filter((a) => UNITS[a.kind].domain === d);
  const queued = s.cities.filter((c) => c.owner === s.player && c.queue.length);
  const where = (a: Army) => {
    const ci = cityAt(world, a.x, a.y);
    if (ci < 0) return "at sea";
    const wc = world.cities[ci];
    return Math.hypot(wc.x - a.x, wc.y - a.y) < 6 ? `in ${wc.name}` : `near ${wc.name}`;
  };
  const group = (title: string, list: Army[]) =>
    list.length > 0 && (
      <>
        <h3 className="sv-h3">
          {title} · {Math.round(list.reduce((a, b) => a + unitCount(b), 0))} units
          <button className="sv-btn tiny" type="button" style={{ marginLeft: 8 }} onClick={() => game.selectArmies(list.map((a) => a.id))}>
            Select all
          </button>
        </h3>
        {list.map((a) => (
          <button key={a.id} type="button" className="sv-row click" style={{ width: "100%", textAlign: "left" }} onClick={() => game.selectArmies([a.id])}>
            <span className="sv-icon">{UNITS[a.kind].icon}</span>
            <span className="grow">
              <b>
                {shownCount(a)} × {UNITS[a.kind].name}
              </b>
              <small>
                {where(a)}
                {a.path.length ? " · moving" : a.order ? ` · ${a.order.kind}` : ""}
                {a.fighting > 0 ? " · in battle" : ""}
              </small>
            </span>
          </button>
        ))}
      </>
    );
  return (
    <>
      <div className="sv-kv">
        <div>
          <small>Manpower</small>
          <b>
            {people(n.manpower)}/{people(manpowerMax(s, s.player))}
          </b>
        </div>
        <div>
          <small>Strength</small>
          <b>{Math.round(power(s, s.player)).toLocaleString()}</b>
        </div>
        <div>
          <small>Missiles</small>
          <b>{n.missiles}</b>
        </div>
        <div>
          <small>Warheads</small>
          <b>{n.nukes}</b>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <button className="sv-btn small" type="button" disabled={n.missiles < 1} onClick={() => game.aim("missile")}>
          🎯 Launch a missile
        </button>
        <button className="sv-btn small red" type="button" disabled={n.nukes < 1} onClick={() => game.aim("nuke")}>
          ☢️ Launch a warhead
        </button>
      </div>
      <h3 className="sv-h3">Conscription</h3>
      <div className="sv-seg" style={{ flexWrap: "wrap" }}>
        {(Object.keys(CONSCRIPTION) as ConscriptionId[]).map((k) => (
          <button key={k} type="button" className={`sv-btn small ${n.conscription === k ? "on" : ""}`} onClick={() => (act.setConscription(s, s.player, k), game.bump())} title={`${Math.round(CONSCRIPTION[k].share * 1000) / 10}% of people can serve; stability ${CONSCRIPTION[k].stability}`}>
            {CONSCRIPTION[k].name}
          </button>
        ))}
      </div>
      {queued.length > 0 && (
        <>
          <h3 className="sv-h3">In training</h3>
          {queued.map((c) => (
            <button key={c.id} type="button" className="sv-row click" style={{ width: "100%", textAlign: "left" }} onClick={() => (game.flyTo(world.cities[c.id].x, world.cities[c.id].y), game.openCity(c.id))}>
              <span className="grow">
                <b>{world.cities[c.id].name}</b>
                <small>{c.queue.map((q) => UNITS[q.kind].icon).join(" ")}</small>
              </span>
            </button>
          ))}
        </>
      )}
      {group("Army", by("land"))}
      {group("Navy", by("sea"))}
      {group("Air force", by("air"))}
      {!mine.length && <p className="sv-note">No forces. Train them in your cities: tap a city on the map.</p>}
      <p className="sv-note">Tap units on the map to select them, then tap where they should go. Shift-drag to box-select on desktop; right-click to move.</p>
      <p className="sv-note dim">Units need: arms factories for tanks, artillery, air defence and aircraft; an air base for aircraft; a shipyard on the coast for ships; a silo for missiles. {BUILDINGS.arms.icon}</p>
    </>
  );
}

/* ------------------------------------------------------------------ diplomacy */

function DiplomacyPanel({ game }: { game: Game }) {
  const s = game.s!;
  const n = s.nations[s.player];
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const al = s.alliances.find((a) => a.id === n.alliance);
  const list = s.nations
    .filter((o) => o.alive && o.id !== s.player && o.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => relation(s, s.player, b.id) - relation(s, s.player, a.id));
  return (
    <>
      {s.offers.length > 0 && (
        <>
          <h3 className="sv-h3">Proposals for you</h3>
          {s.offers.map((o) => (
            <div key={o.id} className="sv-row">
              <span className="sv-swatch" style={{ background: s.nations[o.from].color }} />
              <span className="grow">
                <b>{s.nations[o.from].name}</b>
                <small>{o.kind === "peace" ? `Peace (${o.terms === "return" ? "give it all back" : o.terms === "subjugate" ? "you submit" : "keep what each holds"})` : o.kind === "nap" ? "Non-aggression pact" : o.kind === "trade" ? "Trade deal" : o.kind === "alliance" ? "Alliance" : "Military access"}</small>
              </span>
              <button className="sv-btn tiny green" type="button" onClick={() => game.reply(o.id, true)}>
                Yes
              </button>
              <button className="sv-btn tiny" type="button" onClick={() => game.reply(o.id, false)}>
                No
              </button>
            </div>
          ))}
        </>
      )}
      <h3 className="sv-h3">Your alliance</h3>
      {al ? (
        <div className="sv-row">
          <span className="sv-swatch" style={{ background: al.color }} />
          <span className="grow">
            <b>{al.name}</b>
            <small>{al.members.map((m) => s.nations[m].name).join(", ")}</small>
          </span>
          <button className="sv-btn tiny" type="button" onClick={() => (leaveAlliance(s, s.player), game.bump())}>
            Leave
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input className="sv-search" style={{ marginBottom: 0 }} placeholder="Name a new alliance" value={name} onChange={(e) => setName(e.target.value)} aria-label="Alliance name" />
          <button className="sv-btn small gold" type="button" onClick={() => game.run(act.createAlliance(s, s.player, name), "Alliance founded")}>
            Found
          </button>
        </div>
      )}
      {s.alliances.filter((a) => a.id !== n.alliance).length > 0 && (
        <>
          <h3 className="sv-h3">Other alliances</h3>
          {s.alliances
            .filter((a) => a.id !== n.alliance)
            .map((a) => (
              <div key={a.id} className="sv-row">
                <span className="sv-swatch" style={{ background: a.color }} />
                <span className="grow">
                  <b>{a.name}</b>
                  <small>
                    {a.members.length} members · {a.members.slice(0, 4).map((m) => s.nations[m].name).join(", ")}
                    {a.members.length > 4 ? "…" : ""}
                  </small>
                </span>
                <button className="sv-btn tiny" type="button" title={act.wouldAccept(s, s.player, a.leader, "alliance") ?? "They'll have you"} onClick={() => game.run(act.joinAlliance(s, s.player, a.id), `Joined the ${a.name}`)}>
                  Ask to join
                </button>
              </div>
            ))}
        </>
      )}
      <h3 className="sv-h3">Nations</h3>
      <input className="sv-search" placeholder="Search nations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search nations" />
      {list.slice(0, 80).map((o) => {
        const r = relation(s, s.player, o.id);
        const war = s.wars.some((w) => (w.attackers.includes(s.player) && w.defenders.includes(o.id)) || (w.defenders.includes(s.player) && w.attackers.includes(o.id)));
        return (
          <button key={o.id} type="button" className="sv-row click" style={{ width: "100%", textAlign: "left" }} onClick={() => game.inspectNation(o.id)} data-testid={`sv-dip-${o.iso}`}>
            <span className="sv-swatch" style={{ background: o.color }} />
            <span className="grow">
              <b>{o.name}</b>
              <small>
                {IDEOLOGIES[o.ideology].name}
                {war ? " · at war" : ""}
                {o.alliance >= 0 && o.alliance === n.alliance ? " · ally" : ""}
                {(n.nap[o.id] ?? 0) > s.day ? " · pact" : ""}
                {n.justify.some((j) => j.target === o.id) ? " · war justified" : ""}
              </small>
            </span>
            <b className={`num ${r > 30 ? "good" : r < -20 ? "bad" : ""}`}>{Math.round(r)}</b>
          </button>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ politics */

function PoliticsPanel({ game }: { game: Game }) {
  const s = game.s!;
  const n = s.nations[s.player];
  return (
    <>
      <h3 className="sv-h3">Government</h3>
      {n.transition && <p className="sv-note warn">Becoming a {IDEOLOGIES[n.transition.to].name.toLowerCase()}: {n.transition.days} days of upheaval left.</p>}
      {IDEOLOGY_ORDER.map((k) => {
        const d = IDEOLOGIES[k];
        const cur = n.ideology === k;
        return (
          <div key={k} className="sv-row" style={{ alignItems: "flex-start", outline: cur ? "2px solid var(--gold)" : "none" }}>
            <span className="sv-icon">{d.icon}</span>
            <span className="grow">
              <b>{d.name}</b>
              <small style={{ whiteSpace: "normal" }}>{d.blurb}</small>
              <small>
                Stability {d.stability} · GDP ×{d.gdp} · factories ×{d.factory} · manpower ×{d.manpower} · wars justified ×{d.justify}
              </small>
            </span>
            {!cur && (
              <button className="sv-btn tiny" type="button" onClick={() => confirm(`Change government to ${d.name}? 60 days of upheaval.`) && game.run(act.changeGovernment(s, s.player, k))}>
                Change
              </button>
            )}
          </div>
        );
      })}
      <h3 className="sv-h3">What&apos;s moving stability</h3>
      {n.mods.length ? (
        n.mods.map((m, i) => (
          <div key={i} className="sv-row">
            <span className="grow">
              <b>{m.text}</b>
              <small>{m.days} days left</small>
            </span>
            <b className={m.stability >= 0 ? "good" : "bad"}>
              {m.stability >= 0 ? "+" : ""}
              {m.stability}
            </b>
          </div>
        ))
      ) : (
        <p className="sv-note">Nothing out of the ordinary.</p>
      )}
      <p className="sv-note">
        Taxes ({Math.round(n.tax * 100)}%), conscription ({CONSCRIPTION[n.conscription].name.toLowerCase()}), the economy law ({ECONOMY_LAWS[n.economy].name.toLowerCase()}), war weariness, empty shops, lost land and debt all weigh on it. {n.ideology === "democracy" ? "Democracies hold elections every four years: a stable country re-elects its government." : ""}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ world */

function WorldPanel({ game }: { game: Game }) {
  const s = game.s!;
  const v = game.view!;
  const alive = s.nations.filter((n) => n.alive);
  const [rank, setRank] = useState<"gdp" | "power" | "cities">("gdp");
  const val = (id: number) => (rank === "gdp" ? s.nations[id].last.gdp : rank === "power" ? power(s, id) : s.cities.filter((c) => c.owner === id).length);
  const top = alive.map((n) => n.id).sort((a, b) => val(b) - val(a));
  const myRank = top.indexOf(s.player) + 1;
  return (
    <>
      <h3 className="sv-h3">Map</h3>
      <div className="sv-seg">
        <button type="button" className={`sv-btn small ${!game.flat ? "on" : ""}`} onClick={() => game.setFlat(false)} data-testid="sv-map-3d">
          3D relief
        </button>
        <button type="button" className={`sv-btn small ${game.flat ? "on" : ""}`} onClick={() => game.setFlat(true)} data-testid="sv-map-flat">
          Flat
        </button>
      </div>
      <div className="sv-seg">
        {(["political", "alliances", "terrain"] as const).map((m) => (
          <button key={m} type="button" className={`sv-btn small ${v.mode === m ? "on" : ""}`} onClick={() => game.setMapMode(m)}>
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <h3 className="sv-h3">Rankings · you are #{myRank}</h3>
      <div className="sv-seg">
        {(["gdp", "power", "cities"] as const).map((r) => (
          <button key={r} type="button" className={`sv-btn small ${rank === r ? "on" : ""}`} onClick={() => setRank(r)}>
            {r === "gdp" ? "Economy" : r === "power" ? "Military" : "Land"}
          </button>
        ))}
      </div>
      {top.slice(0, 10).map((id, i) => (
        <button key={id} type="button" className="sv-row click" style={{ width: "100%", textAlign: "left", outline: id === s.player ? "2px solid var(--gold)" : "none" }} onClick={() => game.inspectNation(id)}>
          <b className="num" style={{ width: 22 }}>
            {i + 1}
          </b>
          <span className="sv-swatch" style={{ background: s.nations[id].color }} />
          <span className="grow">
            <b>{s.nations[id].name}</b>
          </span>
          <b className="num">{rank === "gdp" ? perDay(val(id)) : Math.round(val(id)).toLocaleString()}</b>
        </button>
      ))}
      <h3 className="sv-h3">Wars ({s.wars.length})</h3>
      {s.wars.length ? s.wars.map((w) => <WarRow key={w.id} game={game} id={w.id} />) : <p className="sv-note">The world is at peace. For now.</p>}
      <h3 className="sv-h3">News</h3>
      {s.news.slice(0, 40).map((item, i) => (
        <div key={i} className="sv-row" style={{ minHeight: 34 }}>
          <span>{item.kind === "war" ? "⚔️" : item.kind === "peace" ? "🕊️" : item.kind === "bad" ? "⚠️" : item.kind === "good" ? "✅" : item.kind === "world" ? "🌍" : "📰"}</span>
          <span className="grow" style={{ whiteSpace: "normal" }}>
            <small style={{ whiteSpace: "normal", color: "var(--ink)" }}>{item.text}</small>
            <small>{dateText(item.day)}</small>
          </span>
        </div>
      ))}
    </>
  );
}
