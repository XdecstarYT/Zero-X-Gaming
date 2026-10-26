"use client";

import { useEffect, useState } from "react";
import { CHANGELOG } from "../data";
import { fmt, type Game, type PolTab } from "../game";
import * as pol from "../politics";
import type { Axis, Electorate, GroupId, Pol } from "../poltypes";
import { dateLabel } from "../state";
import { MONTHS } from "../data";

/* ------------------------------------------------------------------ bits */

const pct = (v: number) => `${Math.round(v * 100)}%`;

function PartyDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span aria-hidden style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: color, boxShadow: "0 0 0 1.5px rgba(255,255,255,.35)", flex: "none" }} />;
}

function Bars({ p, values }: { p: Pol; values: number[] }) {
  return (
    <div className="xc-bars" style={{ height: 14 }}>
      {values.map((v, i) => (
        <i key={i} style={{ width: `${v * 100}%`, background: p.parties[i].color }} title={`${p.parties[i].name} ${pct(v)}`} />
      ))}
    </div>
  );
}

function Legend({ p, values, fmtv = pct }: { p: Pol; values: number[]; fmtv?: (v: number) => string }) {
  return (
    <div className="xc-legend" style={{ marginTop: 6 }}>
      {p.parties.map((x, i) => (
        <span key={x.id}>
          <b style={{ background: x.color }} />
          {x.short} {fmtv(values[i])}
        </span>
      ))}
    </div>
  );
}

/** The chamber: seats in a half circle, coloured by party. */
export function Hemicycle({ p, seats }: { p: Pol; seats: number[] }) {
  const total = seats.reduce((a, b) => a + b, 0);
  const rows = total > 120 ? 7 : total > 60 ? 6 : 4;
  // Spread seats across rows by arc length.
  const radii = Array.from({ length: rows }, (_, i) => 40 + i * (55 / rows));
  const arc = radii.reduce((a, r) => a + r, 0);
  const per = radii.map((r) => Math.max(1, Math.round((total * r) / arc)));
  let diff = total - per.reduce((a, b) => a + b, 0);
  for (let i = per.length - 1; diff !== 0; i = (i + per.length - 1) % per.length) {
    per[i] += Math.sign(diff);
    diff -= Math.sign(diff);
  }
  const dots: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, ri) => {
    for (let k = 0; k < per[ri]; k++) {
      const a = Math.PI - (Math.PI * (k + 0.5)) / per[ri];
      dots.push({ x: 110 + Math.cos(a) * r, y: 104 - Math.sin(a) * r, a });
    }
  });
  dots.sort((a, b) => b.a - a.a);
  const colours: string[] = [];
  seats.forEach((n, i) => {
    for (let k = 0; k < n; k++) colours.push(p.parties[i].color);
  });
  const rad = Math.max(1.6, Math.min(4, 260 / total));
  return (
    <svg viewBox="0 0 220 110" style={{ width: "100%", maxWidth: 360, display: "block", margin: "0 auto" }} aria-label="Seats in parliament">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={rad} fill={colours[i] ?? "#555"} />
      ))}
      <text x="110" y="104" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">
        {total}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ the title menus */

export function ChangeLog({ game }: { game: Game }) {
  return (
    <section className="xc-panel xc-glass xc-center" data-testid="xc-changelog">
      <div className="xc-panel-h">
        <div className="ic" aria-hidden>
          📰
        </div>
        <div>
          <h3>What&apos;s new</h3>
          <p>The change log</p>
        </div>
        <button className="x" type="button" onClick={() => game.openTitlePanel(null)} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="xc-body">
        {CHANGELOG.map((c) => (
          <div key={c.version} className="xc-sec">
            <h5>
              {c.version} · {c.title} · {c.date}
            </h5>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5, fontSize: 13.5, lineHeight: 1.4 }}>
              {c.items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SettingsPanel({ game }: { game: Game }) {
  return (
    <section className="xc-panel xc-glass xc-center" data-testid="xc-settings">
      <div className="xc-panel-h">
        <div className="ic" aria-hidden>
          ⚙️
        </div>
        <div>
          <h3>Settings</h3>
          <p>Saved on this device</p>
        </div>
        <button className="x" type="button" onClick={() => game.openTitlePanel(null)} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="xc-body">
        <div className="xc-sec">
          <h5>Graphics</h5>
          <div className="xc-row">
            {(["low", "medium", "high"] as const).map((q) => (
              <button key={q} className={`xc-chip${game.quality === q ? " on" : ""}`} type="button" onClick={() => game.setQuality(q)}>
                {q[0].toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
          <p className="xc-hint" style={{ marginTop: 6 }}>
            High adds ambient occlusion and sharper shadows; low suits older phones.
          </p>
        </div>
        <div className="xc-toggle">
          <span>Autosave every 45 seconds</span>
          <button type="button" className={`xc-switch${game.autosave ? " on" : ""}`} role="switch" aria-checked={game.autosave} aria-label="Autosave" onClick={() => game.setAutosave(!game.autosave)} />
        </div>
        {game.hasSave && (
          <button className="xc-btn red small" type="button" onClick={() => game.deleteSave()} data-testid="xc-delete-save">
            Delete saved world
          </button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ setting up a world */

function Choice<T extends string | number>({ label, value, options, onChange, id }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; id?: string }) {
  return (
    <div className="xc-sec">
      <h5>{label}</h5>
      <div className="xc-row">
        {options.map(([v, l]) => (
          <button key={String(v)} className={`xc-chip${value === v ? " on" : ""}`} type="button" onClick={() => onChange(v)} data-testid={id ? `${id}-${v}` : undefined}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

const COLOURS = ["#1fb5a0", "#3557a8", "#d0453b", "#e0a020", "#3c9a46", "#8a6a3a", "#8b5cf6", "#ec4899", "#0ea5e9", "#f97316"];
const ICONS = ["🏠", "🏛️", "✊", "💼", "🌿", "🌾", "⭐", "🚋", "🦉", "🔥", "🌊", "🗽", "⚖️", "🌻"];

export function Setup({ game }: { game: Game }) {
  const d = game.draft;
  const steps: [typeof game.step, string][] = [
    ["politics", "Politics"],
    ["world", "World"],
    ["party", "Your party"],
  ];
  const idx = steps.findIndex((x) => x[0] === game.step);
  const last = idx === steps.length - 1 || (game.step === "world" && !d.world.politics);
  return (
    <div className="xc-setup" data-testid="xc-setup">
      <section className="xc-panel xc-glass xc-center">
        <div className="xc-panel-h">
          <div className="ic" aria-hidden>
            {game.step === "politics" ? "🗳️" : game.step === "world" ? "🌍" : d.party.icon}
          </div>
          <div>
            <h3>New world</h3>
            <p>
              Step {idx + 1} of {d.world.politics ? 3 : 2}: {steps[idx][1]}
            </p>
          </div>
          <button className="x" type="button" onClick={() => game.quitToTitle()} aria-label="Back to the title">
            ✕
          </button>
        </div>
        <div className="xc-tabs">
          {steps.map(([k, l], i) => (
            <button key={k} type="button" className={game.step === k ? "on" : ""} disabled={i === 2 && !d.world.politics} onClick={() => game.setStep(k)} data-testid={`xc-step-${k}`}>
              {i + 1}. {l}
            </button>
          ))}
        </div>
        <div className="xc-body">
          {game.step === "politics" && (
            <>
              <div className="xc-toggle">
                <span>
                  <b>Elections and parliament</b>
                  <br />
                  <span className="dim" style={{ fontSize: 12 }}>
                    Off: a sandbox where you plan from day one.
                  </span>
                </span>
                <button type="button" className={`xc-switch${d.world.politics ? " on" : ""}`} role="switch" aria-checked={d.world.politics} aria-label="Elections and parliament" onClick={() => game.editSetup({ world: { politics: !d.world.politics } })} data-testid="xc-politics-toggle" />
              </div>
              {d.world.politics && (
                <>
                  <Choice label="Voting" value={d.pol.system} options={[["preferential", "Preferential"], ["fptp", "First past the post"]]} onChange={(v) => game.editSetup({ pol: { system: v } })} />
                  <Choice label="Term" value={d.pol.termYears} options={[[2, "2 years"], [3, "3 years"], [4, "4 years"]]} onChange={(v) => game.editSetup({ pol: { termYears: v } })} />
                  <Choice label="Campaign" value={d.pol.campaignWeeks} options={[[6, "6 weeks"], [10, "10 weeks"], [14, "14 weeks"]]} onChange={(v) => game.editSetup({ pol: { campaignWeeks: v } })} />
                  <Choice label="Electorates in the city" value={d.pol.electorates} options={[[4, "4"], [6, "6"], [8, "8"]]} onChange={(v) => game.editSetup({ pol: { electorates: v } })} id="xc-electorates" />
                  <Choice label="Rival parties" value={d.pol.aiParties} options={[[2, "2"], [3, "3"], [4, "4"], [5, "5"]]} onChange={(v) => game.editSetup({ pol: { aiParties: v } })} />
                  <Choice label="Federal parliament" value={d.pol.federalSeats} options={[[51, "51 seats"], [101, "101 seats"], [151, "151 seats"]]} onChange={(v) => game.editSetup({ pol: { federalSeats: v } })} />
                  <Choice label="Difficulty" value={d.pol.difficulty} options={[["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]]} onChange={(v) => game.editSetup({ pol: { difficulty: v } })} />
                </>
              )}
            </>
          )}
          {game.step === "world" && (
            <>
              <div className="xc-sec">
                <h5>City name</h5>
                <input className="xc-input" value={d.world.name} maxLength={24} onChange={(e) => game.editSetup({ world: { name: e.target.value } })} data-testid="xc-city-name" />
              </div>
              <div className="xc-sec">
                <h5>Map seed</h5>
                <div className="xc-row" style={{ alignItems: "center" }}>
                  <input className="xc-input" style={{ width: 120 }} inputMode="numeric" value={d.world.seed} onChange={(e) => game.editSetup({ world: { seed: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) } })} />
                  <button className="xc-btn small" type="button" onClick={() => game.editSetup({ world: { seed: Math.floor(Math.random() * 1e6) } })}>
                    🎲 Random
                  </button>
                </div>
              </div>
              <Choice label="Start as" value={d.world.start} options={[["village", "Farming village"], ["town", "Small town"]]} onChange={(v) => game.editSetup({ world: { start: v } })} />
              <Choice label="How fast the region grows" value={d.world.pace} options={[["relaxed", "Relaxed"], ["normal", "Normal"], ["booming", "Booming"]]} onChange={(v) => game.editSetup({ world: { pace: v } })} />
              <Choice label="City budget" value={d.world.money} options={[["tight", "$12M"], ["normal", "$30M"], ["rich", "$80M"]]} onChange={(v) => game.editSetup({ world: { money: v } })} />
            </>
          )}
          {game.step === "party" && <PartyDesigner game={game} />}
          <div className="xc-actions">
            {idx > 0 && (
              <button className="xc-btn grow" type="button" onClick={() => game.setStep(steps[idx - 1][0])}>
                Back
              </button>
            )}
            {last ? (
              <button className="xc-btn white grow" type="button" onClick={() => game.beginWorld()} data-testid="xc-begin">
                {d.world.politics ? "Start the campaign" : "Start planning"}
              </button>
            ) : (
              <button className="xc-btn white grow" type="button" onClick={() => game.setStep(steps[idx + 1][0])} data-testid="xc-next">
                Next
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PartyDesigner({ game }: { game: Game }) {
  const d = game.draft;
  const party = d.party;
  return (
    <>
      <div className="xc-sec">
        <h5>Start from</h5>
        <div className="xc-presets">
          {pol.PARTY_PRESETS.map((x, i) => (
            <button key={x.name} type="button" className={`xc-preset${party.name === x.name ? " on" : ""}`} onClick={() => game.usePreset(i)} style={{ borderColor: x.color }} data-testid={`xc-preset-${i}`}>
              <span style={{ fontSize: 20 }}>{x.icon}</span>
              <b>{x.name}</b>
              <small>{x.blurb}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="xc-sec">
        <h5>Party name</h5>
        <input className="xc-input" value={party.name} maxLength={28} onChange={(e) => game.editSetup({ party: { name: e.target.value } })} data-testid="xc-party-name" />
      </div>
      <div className="xc-row">
        <div className="xc-sec" style={{ flex: "1 1 120px" }}>
          <h5>Short name</h5>
          <input className="xc-input" value={party.short} maxLength={4} onChange={(e) => game.editSetup({ party: { short: e.target.value.toUpperCase() } })} />
        </div>
        <div className="xc-sec" style={{ flex: "2 1 180px" }}>
          <h5>Your name (the leader)</h5>
          <input className="xc-input" value={party.leader} maxLength={24} onChange={(e) => game.editSetup({ party: { leader: e.target.value } })} data-testid="xc-leader" />
        </div>
      </div>
      <div className="xc-sec">
        <h5>Colour</h5>
        <div className="xc-swatches">
          {COLOURS.map((c) => (
            <button key={c} type="button" className={`xc-sw${party.color === c ? " on" : ""}`} style={{ background: c }} onClick={() => game.editSetup({ party: { color: c } })} aria-label={`Colour ${c}`} />
          ))}
          <input type="color" value={party.color} onChange={(e) => game.editSetup({ party: { color: e.target.value } })} aria-label="Any colour" style={{ width: 34, height: 30, border: 0, background: "none", padding: 0 }} />
        </div>
      </div>
      <div className="xc-sec">
        <h5>Symbol</h5>
        <div className="xc-row">
          {ICONS.map((ic) => (
            <button key={ic} type="button" className={`xc-chip${party.icon === ic ? " on" : ""}`} style={{ fontSize: 18, padding: "0 9px" }} onClick={() => game.editSetup({ party: { icon: ic } })}>
              {ic}
            </button>
          ))}
        </div>
      </div>
      <div className="xc-sec">
        <h5>Where you stand</h5>
        {pol.AXES.map((a) => (
          <label key={a} className="xc-slider">
            <span className="t">
              {pol.AXIS_INFO[a].icon} {pol.AXIS_INFO[a].name}
            </span>
            <input type="range" min={-100} max={100} step={5} value={Math.round(party.pos[a] * 100)} onChange={(e) => game.editSetup({ party: { pos: { ...party.pos, [a]: Number(e.target.value) / 100 } } })} data-testid={`xc-pos-${a}`} />
            <span className="ends">
              <i>{pol.AXIS_INFO[a].lo}</i>
              <i>{pol.AXIS_INFO[a].hi}</i>
            </span>
          </label>
        ))}
        <p className="xc-hint">Who&apos;ll like you: {groupFit(party.pos)}</p>
      </div>
      <div className="xc-sec">
        <h5>Your electorate</h5>
        <div className="xc-row">
          {pol.ELECTORATE_NAMES.slice(0, d.pol.electorates).map((n, i) => (
            <button key={n} className={`xc-chip${d.seat === i ? " on" : ""}`} type="button" onClick={() => game.editSetup({ seat: i })}>
              {n}
              {i === 0 ? " (the town)" : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="xc-preview" style={{ borderColor: party.color }}>
        <span style={{ fontSize: 28 }}>{party.icon}</span>
        <div>
          <b style={{ color: party.color }}>{party.name || "Your party"}</b>
          <div className="dim" style={{ fontSize: 12 }}>
            {party.short} · led by {party.leader || "you"}
          </div>
        </div>
      </div>
    </>
  );
}

function groupFit(pos: Pol["parties"][number]["pos"]) {
  const ranked = pol.GROUP_ORDER.map((g) => ({ g, d: pol.distance(g, pos) })).sort((a, b) => a.d - b.d);
  return ranked
    .slice(0, 3)
    .map((x) => `${pol.GROUPS[x.g].icon} ${pol.GROUPS[x.g].name.toLowerCase()}`)
    .join(", ");
}

/* ------------------------------------------------------------------ campaign HQ */

const TABS: [PolTab, string][] = [
  ["campaign", "Campaign"],
  ["promises", "Promises"],
  ["groups", "Groups"],
  ["opposition", "Opposition"],
  ["parliament", "Parliament"],
  ["polls", "Polls"],
];

export function PoliticsPanel({ game }: { game: Game }) {
  const s = game.s!;
  const p = s.pol!;
  const me = pol.playerParty(p);
  const tabs = TABS.filter(([t]) => t !== "opposition" || p.government !== p.player);
  const tab = tabs.some((t) => t[0] === game.polTab) ? game.polTab : "campaign";
  const share = pol.cityShare(p);
  return (
    <section className="xc-panel xc-glass" data-testid="xc-politics">
      <div className="xc-panel-h">
        <div className="ic" aria-hidden style={{ background: me.color }}>
          {me.icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <h3>{me.name}</h3>
          <p>{pol.roleText(p)}</p>
        </div>
        <button className="x" type="button" onClick={() => game.openPanel(null)} aria-label="Close" data-testid="xc-close">
          ✕
        </button>
      </div>
      <div className="xc-tabs xc-scroll" style={{ gap: 14 }}>
        {tabs.map(([t, l]) => (
          <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => game.setPolTab(t)} data-testid={`xc-pol-${t}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="xc-body">
        <div className="xc-tiles">
          <div className="xc-tile">
            <b className="num">{p.ap}</b>
            <small>actions left</small>
          </div>
          <div className="xc-tile">
            <b className="num">${fmt(p.funds)}</b>
            <small>party funds</small>
          </div>
          <div className="xc-tile">
            <b className="num" style={{ color: me.color }}>
              {pct(share[p.player])}
            </b>
            <small>city poll</small>
          </div>
          <div className="xc-tile">
            <b className="num">{p.trust}</b>
            <small>trust</small>
          </div>
        </div>
        {tab === "campaign" && <CampaignTab game={game} />}
        {tab === "promises" && <PromisesTab game={game} />}
        {tab === "groups" && <GroupsTab game={game} />}
        {tab === "opposition" && <OppositionTab game={game} />}
        {tab === "parliament" && <ParliamentTab game={game} />}
        {tab === "polls" && <PollsTab game={game} />}
      </div>
    </section>
  );
}

function ElectorateRow({ game, e }: { game: Game; e: Electorate }) {
  const p = game.s!.pol!;
  const lead = e.support.indexOf(Math.max(...e.support));
  const sel = game.selElectorate === e.id;
  return (
    <button type="button" className={`xc-elec${sel ? " on" : ""}`} onClick={() => game.selectElectorate(e.id)} data-testid={`xc-elec-${e.id}`}>
      <span className="n">
        {e.id === p.seat && "⭐ "}
        {e.name}
        <small className="dim">
          {e.holder >= 0 ? ` · held by ${p.parties[e.holder].short}` : ""} · {e.voters.toLocaleString()} voters
        </small>
      </span>
      <Bars p={p} values={e.support} />
      <span className="l">
        <PartyDot color={p.parties[lead].color} /> {p.parties[lead].short} {pct(e.support[lead])}
        {lead !== p.player && <span className="dim"> · you {pct(e.support[p.player])}</span>}
      </span>
    </button>
  );
}

function CampaignTab({ game }: { game: Game }) {
  const s = game.s!;
  const p = s.pol!;
  const e = p.electorates[game.selElectorate];
  const weeksLeft = p.settings.campaignWeeks - p.week;
  return (
    <>
      {p.campaign ? (
        <div className="xc-note yes" style={{ alignItems: "center" }}>
          🗳️{" "}
          <span style={{ flex: 1 }}>
            <b>
              Week {p.week + 1} of {p.settings.campaignWeeks}.
            </b>{" "}
            {weeksLeft <= 1 ? "Election day is next." : `${weeksLeft} weeks to go.`}
          </span>
          <button className="xc-btn white small" type="button" onClick={() => game.endWeek()} data-testid="xc-end-week">
            {weeksLeft <= 1 ? "Go to the polls" : "End week"}
          </button>
        </div>
      ) : (
        <div className="xc-note">
          📅 Next election: {dateLabel(p.electionAt, MONTHS)}. The campaign starts {dateLabel(p.campaignFrom, MONTHS)}. You get 2 more actions each month until then.
        </div>
      )}
      {p.debate && !p.debate.asked && <Debate game={game} />}
      <div className="xc-sec">
        <h5>Electorates · tap one, or tap the map</h5>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {p.electorates.map((x) => (
            <ElectorateRow key={x.id} game={game} e={x} />
          ))}
        </div>
      </div>
      <div className="xc-sec">
        <h5>{e ? `Campaign in ${e.name}` : "Campaign"}</h5>
        <div className="xc-terms">
          {(Object.keys(pol.CAMPAIGN) as pol.CampaignKind[]).map((k) => {
            const c = pol.CAMPAIGN[k];
            const needs = (k === "doorknock" || k === "rally") && !e;
            return (
              <button key={k} className="xc-btn small" type="button" disabled={needs || p.ap < c.ap || p.funds < c.cost} onClick={() => game.campaign(k)} data-testid={`xc-camp-${k}`} title={c.blurb}>
                {c.icon} {c.name}
                <span className="dim" style={{ fontSize: 11 }}>
                  {c.ap}⚡{c.cost ? ` $${fmt(c.cost)}` : ""}
                </span>
              </button>
            );
          })}
        </div>
        {e && (
          <div className="xc-kv" style={{ marginTop: 8 }}>
            <span>Your candidate</span>
            <span>{e.candidates[p.player]}</span>
            <span>Sitting member</span>
            <span>{e.mp ? `${e.mp} (${p.parties[e.holder]?.short})` : "None"}</span>
            {pol.GROUP_ORDER.filter((g) => e.groups[g] > 0.08).map((g) => (
              <span key={g} style={{ display: "contents" }}>
                <span>
                  {pol.GROUPS[g].icon} {pol.GROUPS[g].name}
                </span>
                <span>{pct(e.groups[g])}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Debate({ game }: { game: Game }) {
  const p = game.s!.pol!;
  const ax = p.debate!.topic;
  const info = pol.AXIS_INFO[ax];
  return (
    <div className="xc-agenda-card" data-testid="xc-debate">
      <div className="by">
        <span>📺 The leaders&apos; debate</span>
        <span>Tonight</span>
      </div>
      <h4>
        {info.icon} {info.name}: where do you stand?
      </h4>
      <div className="xc-terms" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <button className="xc-btn tiny" type="button" onClick={() => game.debate(-1)} data-testid="xc-debate-lo">
          {info.lo}
        </button>
        <button className="xc-btn tiny" type="button" onClick={() => game.debate(0)}>
          Somewhere between
        </button>
        <button className="xc-btn tiny" type="button" onClick={() => game.debate(1)} data-testid="xc-debate-hi">
          {info.hi}
        </button>
      </div>
    </div>
  );
}

function PromisesTab({ game }: { game: Game }) {
  const s = game.s!;
  const p = s.pol!;
  const e = p.electorates[game.selElectorate];
  const open = p.promises.filter((x) => x.status === "open");
  return (
    <>
      <p className="xc-hint">Promises win votes now. At the next election, each one you kept builds trust; each one you broke costs it, and the people who wanted it remember.</p>
      {open.length > 0 && (
        <div className="xc-sec">
          <h5>Your promises</h5>
          {open.map((r) => (
            <div key={r.id} className="xc-note" style={{ marginBottom: 6 }}>
              {pol.PROMISES[r.kind].icon}{" "}
              <span>
                <b>{r.label}</b>
                <br />
                <span className="dim">
                  {pol.PROMISES[r.kind].blurb} {p.role !== "candidate" && (pol.promiseKept(s, r) ? "On track ✓" : "Not yet")}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="xc-sec">
        <h5>Make a promise · 1⚡</h5>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pol.PROMISE_ORDER.map((k) => {
            const d = pol.PROMISES[k];
            const label = d.label(pol.homesTarget(s), e?.name ?? "an electorate");
            const fans = (Object.entries(d.effects) as [GroupId, number][]).filter((x) => x[1] > 0).map(([g]) => pol.GROUPS[g].icon).join(" ");
            const foes = (Object.entries(d.effects) as [GroupId, number][]).filter((x) => x[1] < 0).map(([g]) => pol.GROUPS[g].icon).join(" ");
            return (
              <button key={k} className="xc-promise" type="button" disabled={p.ap < 1 || (d.local && !e)} onClick={() => game.promise(k)} data-testid={`xc-promise-${k}`}>
                <span style={{ fontSize: 20 }}>{d.icon}</span>
                <span style={{ flex: 1, textAlign: "left" }}>
                  <b>{label}</b>
                  <br />
                  <small className="dim">
                    👍 {fans}
                    {foes && <> · 👎 {foes}</>}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {p.promises.some((x) => x.status !== "open") && (
        <div className="xc-sec">
          <h5>Past promises</h5>
          {p.promises
            .filter((x) => x.status !== "open")
            .slice(-8)
            .map((r) => (
              <div key={r.id} style={{ fontSize: 13 }} className={r.status === "kept" ? "good" : "bad"}>
                {r.status === "kept" ? "✓" : "✗"} {r.label}
              </div>
            ))}
        </div>
      )}
    </>
  );
}

function GroupsTab({ game }: { game: Game }) {
  const p = game.s!.pol!;
  const me = p.player;
  return (
    <>
      <p className="xc-hint">Court the groups that speak for voters. At 60 they endorse you and their members lean your way; above 30 they donate every month. Courting one cools its rivals.</p>
      {pol.GROUP_ORDER.map((g) => {
        const G = pol.GROUPS[g];
        const rel = p.lobby[g];
        const end = p.endorse[g];
        return (
          <div key={g} className="xc-group">
            <span style={{ fontSize: 22 }}>{G.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{G.lobby}</b>
              <small className="dim" style={{ display: "block" }}>
                {G.name}
                {end >= 0 ? ` · endorses ${p.parties[end].short}` : ""}
              </small>
              <span className="xc-meter" style={{ width: "100%", marginTop: 4 }}>
                <i style={{ width: `${Math.max(0, rel)}%`, background: end === me ? "var(--green)" : rel < 0 ? "var(--bad)" : "var(--gold)" }} />
              </span>
            </span>
            <button className="xc-btn tiny" type="button" disabled={p.ap < 1} onClick={() => game.lobby(g)} data-testid={`xc-lobby-${g}`}>
              Lobby 1⚡
            </button>
          </div>
        );
      })}
    </>
  );
}

function OppositionTab({ game }: { game: Game }) {
  const p = game.s!.pol!;
  const gov = p.parties[p.government];
  return (
    <>
      <div className="xc-note" style={{ borderLeft: `4px solid ${gov.color}` }}>
        {gov.icon}{" "}
        <span>
          <b>{gov.name}</b> runs the city, led by {gov.leader}. They decide the zoning, the applications, the trams and the tax, by their own lights.
        </span>
      </div>
      <div className="xc-sec">
        <h5>Protest · 2⚡ $25k</h5>
        {!p.log.length && <p className="xc-hint">Nothing to march against yet. Watch what City Hall does.</p>}
        {p.log.slice(0, 10).map((a) => (
          <div key={a.id} className="xc-group">
            <span style={{ fontSize: 18 }}>{pol.AXIS_INFO[a.axis].icon}</span>
            <span style={{ flex: 1, fontSize: 13 }}>
              {a.text}
              <small className="dim" style={{ display: "block" }}>
                {dateLabel(a.month, MONTHS)}
              </small>
            </span>
            <button className="xc-btn tiny red" type="button" disabled={a.protested || p.ap < 2 || p.funds < 25_000} onClick={() => game.protest(a.id)} data-testid={`xc-protest-${a.id}`}>
              {a.protested ? "Marched" : "✊ Protest"}
            </button>
          </div>
        ))}
      </div>
      <div className="xc-sec">
        <h5>Lobby City Hall · 1⚡</h5>
        <div className="xc-terms">
          {(Object.keys(pol.ASKS) as pol.Ask[]).map((k) => (
            <button key={k} className="xc-btn tiny" type="button" disabled={p.ap < 1} onClick={() => game.askCityHall(k)} data-testid={`xc-ask-${k}`}>
              {pol.AXIS_INFO[pol.ASKS[k].axis].icon} {pol.ASKS[k].name}
            </button>
          ))}
        </div>
        <p className="xc-hint" style={{ marginTop: 6 }}>
          They&apos;ll only do what suits them, but asking shows voters what you stand for.
        </p>
      </div>
    </>
  );
}

function ParliamentTab({ game }: { game: Game }) {
  const s = game.s!;
  const p = s.pol!;
  const F = p.federal;
  const seat = pol.hasSeat(p);
  const gov = p.parties[F.government];
  const majority = Math.floor(F.seats.reduce((a, b) => a + b, 0) / 2) + 1;
  return (
    <>
      <Hemicycle p={p} seats={F.seats} />
      <Legend p={p} values={F.seats} fmtv={(v) => String(v)} />
      <div className="xc-note" style={{ borderLeft: `4px solid ${gov.color}` }}>
        🏛️{" "}
        <span>
          <b>{gov.name}</b> governs the country with {F.seats[F.government]} seats ({majority} for a majority). You {seat ? `sit for ${p.electorates[p.seat].name}` : "have no seat in parliament"}.
        </span>
      </div>
      {!F.sitting ? (
        <p className="xc-hint">Parliament next sits {dateLabel(F.nextSitting, MONTHS)}.</p>
      ) : (
        <>
          <div className="xc-sec">
            <h5>On the floor</h5>
            {!F.bills.length && <p className="xc-hint">No government bills this sitting.</p>}
            {F.bills.map((b) => (
              <div key={b.id} className="xc-agenda-card" data-testid={`xc-bill-${b.id}`}>
                <div className="by">
                  <span>{b.by < 0 ? `${gov.short} government bill` : `Private member's bill (${p.parties[b.by]?.short})`}</span>
                  <span>{b.status === "pending" ? "Vote now" : `${b.status} ${b.yes}–${b.no}`}</span>
                </div>
                <h4>
                  {b.repeal ? "Repeal: " : ""}
                  {pol.BILLS[b.kind].title}
                </h4>
                <div className="what">{pol.BILLS[b.kind].blurb}</div>
                {b.status === "pending" && seat && (
                  <div className="xc-actions">
                    <button className="xc-btn blue small grow" type="button" onClick={() => game.voteBill(b.id, "yes")} data-testid={`xc-vote-yes-${b.id}`}>
                      Aye
                    </button>
                    <button className="xc-btn small grow" type="button" onClick={() => game.voteBill(b.id, "no")} data-testid={`xc-vote-no-${b.id}`}>
                      No
                    </button>
                    <button className="xc-btn tiny" type="button" onClick={() => game.voteBill(b.id, "abstain")}>
                      Abstain
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {seat && (
            <>
              <div className="xc-sec">
                <h5>Question Time {F.asked && "· asked"}</h5>
                <div className="xc-terms">
                  {pol.AXES.map((a: Axis) => (
                    <button key={a} className="xc-btn tiny" type="button" disabled={F.asked} onClick={() => game.question(a)} data-testid={`xc-question-${a}`}>
                      {pol.AXIS_INFO[a].icon} Ask about {pol.AXIS_INFO[a].name.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="xc-sec">
                <h5>Bring in a bill {F.proposed && "· done this sitting"}</h5>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {pol.BILL_ORDER.map((k) => (
                    <button key={k} className="xc-promise" type="button" disabled={F.proposed} onClick={() => game.propose(k)} data-testid={`xc-propose-${k}`}>
                      <span style={{ flex: 1, textAlign: "left" }}>
                        <b>
                          {F.laws[k] ? "Repeal the " : ""}
                          {pol.BILLS[k].title}
                        </b>
                        <br />
                        <small className="dim">{pol.BILLS[k].blurb}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
      <div className="xc-sec">
        <h5>Laws in force</h5>
        {pol.BILL_ORDER.filter((k) => F.laws[k]).map((k) => (
          <div key={k} style={{ fontSize: 13 }}>
            ⚖️ <b>{pol.BILLS[k].title}</b> <span className="dim">{pol.BILLS[k].blurb}</span>
          </div>
        ))}
        {!pol.BILL_ORDER.some((k) => F.laws[k]) && <p className="xc-hint">None of the big ones yet.</p>}
      </div>
    </>
  );
}

function PollsTab({ game }: { game: Game }) {
  const p = game.s!.pol!;
  const share = pol.cityShare(p);
  const proj = pol.projection(p);
  const hist = p.polls.slice(-40);
  return (
    <>
      <div className="xc-sec">
        <h5>City-wide vote</h5>
        <Bars p={p} values={share} />
        <Legend p={p} values={share} />
      </div>
      <div className="xc-sec">
        <h5>If the election were today</h5>
        <Legend p={p} values={proj} fmtv={(v) => `${v} seat${v === 1 ? "" : "s"}`} />
      </div>
      <div className="xc-sec">
        <h5>The trend</h5>
        {hist.length < 2 ? (
          <p className="xc-hint">A few weeks of polling will show here.</p>
        ) : (
          <svg className="xc-spark" viewBox="0 0 300 70" preserveAspectRatio="none" aria-label="Polling over time" style={{ height: 80 }}>
            {p.parties.map((x, i) => (
              <polyline key={x.id} fill="none" stroke={x.color} strokeWidth={i === p.player ? 3 : 1.5} vectorEffect="non-scaling-stroke" points={hist.map((h, k) => `${(k / (hist.length - 1)) * 300},${68 - (h.share[i] ?? 0) * 120}`).join(" ")} />
            ))}
          </svg>
        )}
      </div>
      {p.results.length > 0 && (
        <div className="xc-sec">
          <h5>Past elections</h5>
          {p.results
            .slice()
            .reverse()
            .map((r) => (
              <div key={r.month} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                <PartyDot color={p.parties[r.winner].color} />
                {dateLabel(r.month, MONTHS)}: {p.parties[r.winner].name} won {r.seats[r.winner]} of {p.electorates.length}
                {r.mine ? " · you held your seat" : " · you lost your seat"}
              </div>
            ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ election night */

export function ElectionNight({ game }: { game: Game }) {
  const s = game.s!;
  const p = s.pol!;
  const r = p.night!;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= r.rows.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 900);
    return () => clearTimeout(t);
  }, [shown, r.rows.length]);
  const done = shown >= r.rows.length;
  const tally = p.parties.map((_, i) => r.rows.slice(0, shown).filter((x) => x.winner === i).length);
  const w = p.parties[r.winner];
  const me = pol.playerParty(p);
  const majority = Math.floor(p.electorates.length / 2) + 1;
  return (
    <div className="xc-night" data-testid="xc-night">
      <section className="xc-panel xc-glass xc-center">
        <div className="xc-panel-h">
          <div className="ic" aria-hidden>
            🗳️
          </div>
          <div>
            <h3>Election night in {s.name}</h3>
            <p>
              {majority} seats for a majority · {done ? "all seats declared" : `counting… ${shown} of ${r.rows.length} declared`}
            </p>
          </div>
        </div>
        <div className="xc-body">
          <div className="xc-seatbars">
            {p.parties.map((x, i) => (
              <div key={x.id} className="row">
                <span className="nm">
                  {x.icon} {x.short}
                </span>
                <span className="bar">
                  <i style={{ width: `${(tally[i] / p.electorates.length) * 100}%`, background: x.color }} />
                </span>
                <b className="num">{tally[i]}</b>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {r.rows.slice(0, shown).map((row) => {
              const e = p.electorates[row.electorate];
              const win = p.parties[row.winner];
              const gain = row.was >= 0 && row.was !== row.winner;
              return (
                <div key={row.electorate} className="xc-result" style={{ borderLeftColor: win.color }}>
                  <b>
                    {row.electorate === p.seat && "⭐ "}
                    {e.name}
                  </b>
                  <span>
                    <PartyDot color={win.color} /> {win.short} {gain ? `gain from ${p.parties[row.was].short}` : "hold"} · {pct(row.margin)} margin
                  </span>
                  <small className="dim">{e.candidates[row.winner]} elected</small>
                </div>
              );
            })}
          </div>
          {done && (
            <div className={`xc-note ${r.winner === p.player ? "yes" : "no"}`} data-testid="xc-night-verdict">
              {w.icon}{" "}
              <span>
                <b>
                  {r.winner === p.player ? `${me.name} wins! You run ${s.name}.` : `${w.name} wins ${s.name}.`}
                </b>{" "}
                {r.mine ? `You hold ${p.electorates[p.seat].name} and take your seat in the federal parliament.` : `You lost ${p.electorates[p.seat].name}.`} Across the country, {p.parties[r.federalWinner].name} wins {r.federal[r.federalWinner]} of {r.federal.reduce((a, b) => a + b, 0)} seats.
                {(r.kept > 0 || r.broken > 0) && ` You kept ${r.kept} promise${r.kept === 1 ? "" : "s"} and broke ${r.broken}.`}
              </span>
            </div>
          )}
          <div className="xc-actions">
            {!done && (
              <button className="xc-btn grow" type="button" onClick={() => setShown(r.rows.length)} data-testid="xc-night-skip">
                Skip the count
              </button>
            )}
            {done && (
              <button className="xc-btn white grow" type="button" onClick={() => game.closeNight()} data-testid="xc-night-continue">
                Continue
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export type { Pol };
