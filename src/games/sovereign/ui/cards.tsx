"use client";

import { BUILDING_ORDER, BUILDINGS, IDEOLOGIES, ITEM_INFO, MAX_DEV, UNITS, buildingCost, developCost, type UnitKind } from "../data";
import * as act from "../actions";
import { atWar } from "../economy";
import type { Game } from "../game";
import { trainingSpeed } from "../military";
import { power, relation, shownCount, unitCount } from "../state";
import { money, people, perDay } from "./fmt";

const TRAIN: UnitKind[] = ["infantry", "tank", "artillery", "antiair", "fighter", "bomber", "destroyer", "submarine", "battleship", "carrier", "missile", "nuke"];

export function CityCard({ game, id }: { game: Game; id: number }) {
  const s = game.s!;
  const world = game.world!;
  const c = s.cities[id];
  const wc = world.cities[id];
  const owner = s.nations[c.owner];
  const mine = c.owner === s.player;
  const me = s.nations[s.player];
  const here = s.armies.filter((a) => Math.hypot(a.x - wc.x, a.y - wc.y) < 6 && UNITS[a.kind].domain !== "strike");
  const close = () => game.clearSelection();
  return (
    <div className="sv-card sv-glass" data-testid="sv-city">
      <div className="sv-sheet-head">
        <span className="sv-swatch" style={{ background: owner.color }} />
        <h2>
          {wc.name}
          {owner.capital === id ? " ★" : ""}
        </h2>
        <button className="sv-x" type="button" aria-label="Close" onClick={close}>
          ✕
        </button>
      </div>
      <div className="sv-sheet-body">
        {!mine && (
          <div className="sv-row click" onClick={() => game.inspectNation(c.owner)}>
            <span className="sv-icon">🏳️</span>
            <span className="grow">
              <b>{owner.name}</b>
              <small>
                {IDEOLOGIES[owner.ideology].name} · relations {Math.round(relation(s, s.player, c.owner))}
                {atWar(s, s.player, c.owner) ? " · at war" : ""}
              </small>
            </span>
            <span className="sv-btn tiny">View</span>
          </div>
        )}
        {c.core !== c.owner && <p className="sv-note warn">Occupied: this is {s.nations[c.core].name}&apos;s land. Output is down and the people are restless.</p>}
        {c.capture && (
          <p className="sv-note bad">
            Under siege by {s.nations[c.capture.by].name}: {Math.round(c.capture.progress)}% taken.
          </p>
        )}
        <div className="sv-kv">
          <div>
            <small>People</small>
            <b>{people(c.pop)}</b>
          </div>
          <div>
            <small>Development</small>
            <b>
              {c.dev}/{MAX_DEV}
            </b>
          </div>
          <div>
            <small>GDP</small>
            <b>{perDay(c.gdp)}</b>
          </div>
          <div>
            <small>Unrest</small>
            <b className={c.unrest > 60 ? "bad" : c.unrest > 30 ? "warn" : ""}>{Math.round(c.unrest)}%</b>
          </div>
          {c.damage > 0.02 && (
            <div>
              <small>Damage</small>
              <b className="bad">{Math.round(c.damage * 100)}%</b>
            </div>
          )}
        </div>
        <h3 className="sv-h3">Resources here</h3>
        {c.deposits.length ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {c.deposits.map((d, i) => (
              <span key={i} className="sv-pill">
                {ITEM_INFO[d.res].icon} {ITEM_INFO[d.res].name} {"●".repeat(d.rich)}
              </span>
            ))}
          </div>
        ) : (
          <p className="sv-note">No deposits.</p>
        )}
        {mine && (
          <>
            <h3 className="sv-h3">Build</h3>
            {c.build ? (
              <div className="sv-row">
                <span className="sv-icon">{c.build.id === "develop" ? "🏙️" : BUILDINGS[c.build.id].icon}</span>
                <span className="grow">
                  <b>{c.build.id === "develop" ? `Developing to level ${c.dev + 1}` : `${BUILDINGS[c.build.id].name} → level ${(c.buildings[c.build.id] ?? 0) + 1}`}</b>
                  <div className="sv-bar" style={{ marginTop: 4 }}>
                    <span style={{ width: `${100 * (1 - c.build.days / c.build.total)}%`, background: "var(--blue)" }} />
                  </div>
                </span>
                <button className="sv-btn tiny" type="button" onClick={() => game.run(act.cancelBuild(s, s.player, id))}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="sv-row click" type="button" style={{ width: "100%", textAlign: "left" }} disabled={!!act.canDevelop(s, s.player, id)} onClick={() => game.run(act.develop(s, s.player, id), `Developing ${wc.name}`)} data-testid="sv-develop">
                <span className="sv-icon">🏙️</span>
                <span className="grow">
                  <b>Develop the city</b>
                  <small>{c.dev >= MAX_DEV ? "Fully developed" : `Level ${c.dev + 1}: more GDP and growth · ${money(developCost(c.dev))}`}</small>
                </span>
              </button>
            )}
            <div className="sv-build" style={{ marginTop: 6 }}>
              {BUILDING_ORDER.filter((b) => (b !== "mine" || c.deposits.length) && ((b !== "port" && b !== "shipyard") || wc.coastal)).map((b) => {
                const def = BUILDINGS[b];
                const lv = c.buildings[b] ?? 0;
                const why = act.canBuild(s, world, s.player, id, b);
                return (
                  <button key={b} type="button" className="sv-bcell" disabled={!!why} title={why ?? def.blurb} onClick={() => game.run(act.build(s, world, s.player, id, b), `${def.name} under way`)} data-testid={`sv-build-${b}`}>
                    <span className="sv-icon">{def.icon}</span>
                    <span style={{ minWidth: 0 }}>
                      <b>{def.name}</b>
                      <small>{lv >= def.max ? "Max level" : money(buildingCost(b, lv))}</small>
                    </span>
                    <span className="sv-lv">{lv ? `L${lv}` : ""}</span>
                  </button>
                );
              })}
            </div>
            <h3 className="sv-h3">Train</h3>
            {c.queue.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {c.queue.map((q, i) => (
                  <div key={i} className="sv-row" style={{ minHeight: 34, padding: "5px 10px" }}>
                    <span>{UNITS[q.kind].icon}</span>
                    <span className="grow">
                      <b style={{ fontSize: 12.5 }}>{UNITS[q.kind].name}</b>
                      {i === 0 && (
                        <div className="sv-bar">
                          <span style={{ width: `${100 * (1 - q.days / q.total)}%`, background: "var(--gold)" }} />
                        </div>
                      )}
                    </span>
                    <small className="dim">{i === 0 ? `${Math.ceil(q.days / trainingSpeed(s, c, q.kind))}d` : "queued"}</small>
                  </div>
                ))}
              </div>
            )}
            <div className="sv-build">
              {TRAIN.filter((k) => {
                const d = UNITS[k];
                if (d.domain === "sea") return wc.coastal && (c.buildings.shipyard ?? 0) > 0;
                if (d.domain === "air") return (c.buildings.airport ?? 0) > 0;
                if (d.domain === "strike") return (c.buildings.silo ?? 0) > 0 && (k !== "nuke" || me.nuclear);
                return true;
              }).map((k) => {
                const d = UNITS[k];
                const why = act.canTrain(s, world, s.player, id, k);
                const items = Object.entries(d.items ?? {})
                  .map(([it, q]) => `${q} ${ITEM_INFO[it as keyof typeof ITEM_INFO].name.toLowerCase()}`)
                  .join(", ");
                return (
                  <button key={k} type="button" className="sv-bcell" disabled={!!why} title={why ?? `${d.blurb}${items ? ` Needs ${items}.` : ""}`} onClick={() => game.run(act.train(s, world, s.player, id, k))} data-testid={`sv-train-${k}`}>
                    <span className="sv-icon">{d.icon}</span>
                    <span style={{ minWidth: 0 }}>
                      <b>{d.name}</b>
                      <small>
                        {money(d.cost)} · {d.days}d{why ? ` · ${why}` : ""}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {here.length > 0 && (
          <>
            <h3 className="sv-h3">Forces here</h3>
            {here.map((a) => (
              <button key={a.id} type="button" className="sv-row click" style={{ width: "100%", textAlign: "left" }} onClick={() => a.owner === s.player && game.selectArmies([a.id], false)}>
                <span className="sv-icon" style={{ background: s.nations[a.owner].color }}>
                  {UNITS[a.kind].icon}
                </span>
                <span className="grow">
                  <b>
                    {shownCount(a)} × {UNITS[a.kind].name}
                  </b>
                  <small>{s.nations[a.owner].name}</small>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function NationCard({ game, id }: { game: Game; id: number }) {
  const s = game.s!;
  const world = game.world!;
  const n = s.nations[id];
  const me = s.nations[s.player];
  const self = id === s.player;
  const r = relation(s, s.player, id);
  const war = s.wars.find((w) => (w.attackers.includes(s.player) && w.defenders.includes(id)) || (w.defenders.includes(s.player) && w.attackers.includes(id)));
  const just = me.justify.find((j) => j.target === id);
  const al = s.alliances.find((a) => a.id === n.alliance);
  const cities = s.cities.filter((c) => c.owner === id);
  const myWar = s.wars.find((w) => (w.attackers[0] === s.player || w.defenders[0] === s.player) && (w.attackers.includes(id) || w.defenders.includes(id)));
  const allyWars = s.wars.filter((w) => !w.attackers.includes(s.player) && !w.defenders.includes(s.player) && (w.attackers.includes(id) || w.defenders.includes(id)));
  const close = () => game.inspectNation(null);
  const capital = world.cities[n.capital];
  return (
    <div className="sv-card sv-glass" data-testid="sv-nation">
      <div className="sv-sheet-head">
        <span className="sv-swatch" style={{ background: n.color }} />
        <h2>{n.name}</h2>
        {capital && (
          <button className="sv-btn tiny" type="button" onClick={() => game.flyTo(capital.x, capital.y, 1.2)}>
            Find
          </button>
        )}
        <button className="sv-x" type="button" aria-label="Close" onClick={close}>
          ✕
        </button>
      </div>
      <div className="sv-sheet-body">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <span className="sv-pill">
            {IDEOLOGIES[n.ideology].icon} {IDEOLOGIES[n.ideology].name}
          </span>
          {!n.alive && <span className="sv-pill war">Conquered</span>}
          {war && <span className="sv-pill war">At war with you</span>}
          {al && <span className="sv-pill ally">{al.name}</span>}
          {n.overlord >= 0 && <span className="sv-pill">Subject of {s.nations[n.overlord].name}</span>}
          {(me.nap[id] ?? 0) > s.day && <span className="sv-pill pact">Pact</span>}
          {me.trade.includes(id) && <span className="sv-pill pact">Trade</span>}
        </div>
        <div className="sv-kv">
          <div>
            <small>Relations</small>
            <b className={r > 30 ? "good" : r < -20 ? "bad" : ""}>{self ? "—" : Math.round(r)}</b>
          </div>
          <div>
            <small>GDP</small>
            <b>{perDay(n.last.gdp)}</b>
          </div>
          <div>
            <small>Military</small>
            <b>{Math.round(power(s, id)).toLocaleString()}</b>
          </div>
          <div>
            <small>Cities</small>
            <b>{cities.length}</b>
          </div>
          <div>
            <small>Stability</small>
            <b>{Math.round(n.stability)}%</b>
          </div>
        </div>
        {!self && n.alive && (
          <>
            <h3 className="sv-h3">Diplomacy</h3>
            <div className="sv-grid2">
              <button className="sv-btn small" type="button" onClick={() => game.run(act.improveRelations(s, s.player, id), "Relations improved")}>
                🤝 Improve relations
              </button>
              <button className="sv-btn small" type="button" onClick={() => game.run(act.denounce(s, s.player, id))}>
                📣 Denounce
              </button>
              {(me.nap[id] ?? 0) > s.day ? (
                <button className="sv-btn small" type="button" onClick={() => game.run(act.cancelTreaty(s, s.player, id, "nap"), "Pact ended")}>
                  End pact
                </button>
              ) : (
                <button className="sv-btn small" type="button" onClick={() => game.run(act.propose(s, s.player, id, "nap"), "Pact signed")}>
                  🕊️ Non-aggression pact
                </button>
              )}
              {me.trade.includes(id) ? (
                <button className="sv-btn small" type="button" onClick={() => game.run(act.cancelTreaty(s, s.player, id, "trade"), "Trade ended")}>
                  End trade
                </button>
              ) : (
                <button className="sv-btn small" type="button" onClick={() => game.run(act.propose(s, s.player, id, "trade"), "Trade deal agreed")}>
                  💱 Trade deal
                </button>
              )}
              {!me.access.includes(id) && (
                <button className="sv-btn small" type="button" onClick={() => game.run(act.propose(s, s.player, id, "access"), "Military access granted")}>
                  🚩 Ask for access
                </button>
              )}
              {n.alliance !== me.alliance || me.alliance < 0 ? (
                <button className="sv-btn small" type="button" onClick={() => game.run(act.propose(s, s.player, id, "alliance"), "They joined your alliance")}>
                  🛡️ Invite to alliance
                </button>
              ) : null}
              {al && al.id !== me.alliance && (
                <button className="sv-btn small" type="button" onClick={() => game.run(act.joinAlliance(s, s.player, al.id), `You joined the ${al.name}`)}>
                  Join {al.name}
                </button>
              )}
              {n.overlord === s.player && (
                <button className="sv-btn small" type="button" onClick={() => game.run(act.release(s, s.player, id))}>
                  Grant independence
                </button>
              )}
            </div>
            <h3 className="sv-h3">War</h3>
            {war ? (
              <>
                <p className="sv-note">
                  The {war.name} · day {s.day - war.start} · war score{" "}
                  <b className={act.warScore(s, war) * (war.attackers.includes(s.player) ? 1 : -1) >= 0 ? "good" : "bad"}>{Math.round(act.warScore(s, war) * (war.attackers.includes(s.player) ? 1 : -1))}</b>
                </p>
                {myWar ? (
                  <div className="sv-grid2">
                    {(["status", "return", "subjugate"] as const).map((t) => {
                      const why = act.peaceAcceptable(s, myWar, s.player, t);
                      return (
                        <button key={t} className={`sv-btn small ${t === "subjugate" ? "gold" : ""}`} type="button" title={why ?? "They'll accept"} onClick={() => game.run(act.makePeace(s, world, myWar.id, s.player, t))}>
                          {t === "status" ? "Peace: keep what we hold" : t === "return" ? "Peace: give it all back" : "Demand they submit"}
                          {why ? " ✗" : " ✓"}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="sv-note">Your war leader decides the peace.</p>
                )}
              </>
            ) : just ? (
              just.days > 0 ? (
                <div>
                  <p className="sv-note">Justifying a war: {just.days} days to go.</p>
                  <div className="sv-bar">
                    <span style={{ width: `${100 * (1 - just.days / just.total)}%`, background: "var(--bad)" }} />
                  </div>
                </div>
              ) : (
                <button className="sv-btn red wide" type="button" onClick={() => game.run(act.declareWar(s, s.player, id))} data-testid="sv-declare">
                  ⚔️ Declare war on {n.name}
                </button>
              )
            ) : (
              <button className="sv-btn wide" type="button" onClick={() => game.run(act.justify(s, s.player, id), `Justifying war (${act.justifyDays(s, s.player, id)} days)`)} title={act.canJustify(s, s.player, id) ?? `Takes ${act.justifyDays(s, s.player, id)} days; ${n.name} will know.`} data-testid="sv-justify">
                Justify a war ({act.justifyDays(s, s.player, id)} days)
              </button>
            )}
            {allyWars.map((w) => {
              const side = w.attackers.includes(id) ? "attackers" : "defenders";
              return (
                <button key={w.id} className="sv-btn small wide" style={{ marginTop: 6 }} type="button" onClick={() => game.run(act.joinWar(s, s.player, w.id, side))}>
                  Join the {w.name} on {n.name}&apos;s side
                </button>
              );
            })}
          </>
        )}
        {!n.alive && s.cities.some((c) => c.core === id && c.owner === s.player) && (
          <button className="sv-btn gold wide" type="button" style={{ marginTop: 8 }} onClick={() => game.run(act.liberate(s, world, s.player, id))}>
            Restore {n.name} as your subject
          </button>
        )}
        {cities.length > 0 && (
          <>
            <h3 className="sv-h3">Cities</h3>
            {cities
              .slice()
              .sort((a, b) => b.pop - a.pop)
              .slice(0, 12)
              .map((c) => (
                <button key={c.id} type="button" className="sv-row click" style={{ width: "100%", textAlign: "left" }} onClick={() => (game.flyTo(world.cities[c.id].x, world.cities[c.id].y, Math.max(1.4, game.view!.cam.zoom)), game.openCity(c.id))}>
                  <span className="grow">
                    <b>
                      {world.cities[c.id].name}
                      {n.capital === c.id ? " ★" : ""}
                    </b>
                    <small>
                      {people(c.pop)} · dev {c.dev} · {s.armies.filter((a) => a.owner === id && Math.hypot(a.x - world.cities[c.id].x, a.y - world.cities[c.id].y) < 6).reduce((x, a) => x + unitCount(a), 0).toFixed(0)} units in town
                    </small>
                  </span>
                </button>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
