import { BTN, button, card, choice, el } from "../sports-kit/ui";
import {
  ATTRS,
  careerTotals,
  ladderPosition,
  LEAGUE_MEDAL,
  overall,
  pointCost,
  POSITIONS_CAREER,
  type Career,
  type Position,
} from "./career";
import { ALL_CLUBS, clubById, defaultClub, LEAGUES, NATIONAL, type ClubEdit } from "./clubs";
import { countOf, finalName, finalsSpots, ladder, nextGame, ordinal, type Season } from "./season";
import { fullName } from "./rosters";

/** Menu screens for Screamer's modes: the season hub, career, the club editor. */

const RED = "#a3122c";

export function chip(id: string) {
  const c = clubById(id);
  const s = el("span", "mr-1.5 inline-block h-3 w-1.5 shrink-0 rounded-sm align-middle");
  s.style.background = `linear-gradient(${c.guernsey} 0 40%, ${c.hoop} 40% 60%, ${c.guernsey} 60%)`;
  return s;
}

/** A club picker: compact buttons with the colours. */
export function clubPicker(label: string, ids: string[], current: string, pick: (id: string) => void) {
  const wrap = el("div", "grid w-full grid-cols-2 gap-1.5 sm:grid-cols-3");
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", label);
  const buttons = ids.map((id) => {
    const c = clubById(id);
    const b = button("", `${BTN} flex items-center px-2 py-1.5 text-left text-xs`, () => {
      pick(id);
      for (const x of buttons) {
        const on = x.dataset.value === id;
        x.setAttribute("aria-pressed", String(on));
        x.style.borderColor = on ? "#facc15" : "";
      }
    });
    b.dataset.value = id;
    b.append(chip(id), el("span", "truncate", c.name));
    b.setAttribute("aria-pressed", String(id === current));
    if (id === current) b.style.borderColor = "#facc15";
    return b;
  });
  wrap.append(...buttons);
  return wrap;
}

/** The ladder (top `rows`, plus your club if it's below), with the finals line. */
export function ladderTable(s: Season, rows = 99) {
  const all = ladder(s);
  const spots = finalsSpots(s);
  const table = el("table", "w-full text-xs tabular-nums");
  table.setAttribute("data-testid", "footy-ladder");
  table.append(el("tr", "text-[10px] uppercase tracking-wider text-white/50", ...["", "Club", "P", "W", "L", "D", "%", "Pts"].map((h, i) => el("th", i < 2 ? "py-0.5 text-left" : "px-1 text-right", h))));
  all.forEach((r, i) => {
    const mine = r.id === s.club;
    if (i >= rows && !mine) return;
    table.append(
      el(
        "tr",
        `${mine ? "bg-[#facc15]/15 font-bold text-[#facc15]" : ""} ${i === spots - 1 ? "border-b border-dashed border-white/25" : ""}`,
        el("td", "w-5 py-0.5 text-white/50", String(i + 1)),
        el("td", "py-0.5", chip(r.id), clubById(r.id).name),
        ...[r.played, r.won, r.lost, r.drawn, r.pct.toFixed(1), r.points].map((v) => el("td", "px-1 text-right", String(v))),
      ),
    );
  });
  return table;
}

/** The finals so far, week by week. */
export function finalsList(s: Season) {
  if (!s.finals.length) return el("span");
  const rows = s.finals.map((f) =>
    el(
      "li",
      `flex items-center gap-2 ${f.home === s.club || f.away === s.club ? "font-bold text-[#facc15]" : ""}`,
      el("span", "w-28 shrink-0 text-white/60", finalName(f.key ?? "")),
      chip(f.home),
      el("span", "truncate", clubById(f.home).short),
      el("span", "text-white/60", f.result ? `${f.result[0]}–${f.result[1]}` : "v"),
      chip(f.away),
      el("span", "truncate", clubById(f.away).short),
    ),
  );
  return el("ol", "flex flex-col gap-0.5 text-xs", ...rows);
}

/**
 * The count: the league medal (3-2-1 votes, home and away) and the leading
 * goalkicker. During the season, the leaders; at the end, awards night.
 */
export function awardsPanel(s: Season) {
  const medal = countOf(s.medal, 5);
  const goals = countOf(s.goals, 5);
  const done = s.stage !== "home";
  const name = (c: { club: string; last: string }) => `${fullName(c.club, c.last, s.women)} (${clubById(c.club).short})`;
  const list = (title: string, rows: ReturnType<typeof countOf>, unit: string) =>
    el(
      "div",
      "rounded bg-white/5 p-2",
      el("p", "mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#facc15]", title),
      ...(rows.length ? rows.map((r, i) => el("p", `truncate text-xs ${r.club === s.club ? "font-bold text-[#facc15]" : ""}`, `${i + 1}. ${name(r)} · ${r.n} ${unit}`)) : [el("p", "text-xs text-white/50", "No games yet")]),
    );
  const top = medal[0];
  const coleman = goals[0];
  const night =
    done && top && coleman
      ? el(
          "div",
          "rounded-lg border border-[#facc15]/40 bg-[#facc15]/10 p-3 text-center",
          el("p", "text-[10px] font-bold uppercase tracking-[0.3em] text-[#facc15]", "Awards night"),
          el("p", "mt-1 font-display text-lg font-black uppercase", `League Medal: ${name(top)}`),
          el("p", "text-xs text-white/75", `${top.n} votes${medal[1] ? `, from ${fullName(medal[1].club, medal[1].last, s.women)} on ${medal[1].n}` : ""}`),
          el("p", "mt-2 font-display text-base font-black uppercase", `Leading goalkicker: ${name(coleman)}`),
          el("p", "text-xs text-white/75", `${coleman.n} goals in the home and away season`),
        )
      : el("span");
  const wrap = el("div", "flex flex-col gap-2", night, el("div", "grid grid-cols-1 gap-2 sm:grid-cols-2", list(done ? "League Medal · final count" : "League Medal · the leaders", medal, "votes"), list("Leading goalkicker", goals, "goals")));
  wrap.setAttribute("data-testid", "footy-awards");
  return wrap;
}

/** The premiership hub: the ladder, your next game, play or sim. */
export function seasonHub(s: Season, h: { play: () => void; sim: () => void; simRound: () => void; abandon: () => void }) {
  const ng = nextGame(s);
  const status =
    s.stage === "done"
      ? s.premier === s.club
        ? `PREMIERS! ${clubById(s.club).name} have won the flag.`
        : `Season over. ${clubById(s.premier ?? "").name} are the premiers.`
      : ng
        ? `${ng.label}: ${ng.fixture.home === s.club ? "home" : "away"} v ${clubById(ng.opponent).name}`
        : "";
  const play = button(ng ? `Play ${ng.label}` : "Season over", `rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.15em] text-white`, h.play);
  play.style.background = RED;
  play.setAttribute("data-testid", "footy-start");
  play.disabled = !ng;
  const sim = button("Sim this game", `${BTN} text-xs`, h.sim);
  sim.disabled = !ng;
  sim.setAttribute("data-testid", "footy-sim");
  const simRound = button(s.stage === "home" ? "Sim to the finals" : "Sim the rest", `${BTN} text-xs`, h.simRound);
  simRound.disabled = !ng;
  return card(
    `${s.women ? "Women's " : ""}${LEAGUES[s.league].name} · ${s.rounds} rounds · top ${finalsSpots(s)}`,
    el("p", "text-sm font-bold", status),
    el("div", "flex flex-wrap gap-2", play, sim, simRound),
    ladderTable(s),
    finalsList(s),
    awardsPanel(s),
    button("Abandon season", `${BTN} self-start text-xs`, h.abandon),
  );
}

// ------------------------------------------------------------------ career

export function careerCreate(start: (o: { name: string; number: number; position: Position }) => void) {
  const name = el("input", "w-full rounded-md border-2 border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#facc15] focus:outline-none");
  name.placeholder = "Your player's name";
  name.maxLength = 24;
  name.value = "";
  name.setAttribute("aria-label", "Player name");
  const num = el("input", "w-24 rounded-md border-2 border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#facc15] focus:outline-none");
  num.type = "number";
  num.min = "1";
  num.max = "99";
  num.value = "23";
  num.setAttribute("aria-label", "Guernsey number");
  let pos: Position = "midfielder";
  const go = button("Start your career", `rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.15em] text-white`, () =>
    start({ name: name.value || "Rookie", number: Number(num.value) || 23, position: pos }),
  );
  go.style.background = RED;
  go.setAttribute("data-testid", "career-start");
  return card(
    "New career · from the local footy to the big time",
    el("p", "text-sm text-white/75", "Start at 17 with a local club. Play well and a State League club picks you up; keep going and you'll be drafted into the National League. Then it's premierships, medals and a place in history."),
    el("div", "flex flex-wrap items-center gap-2", name, num),
    choice(
      "Position",
      (Object.keys(POSITIONS_CAREER) as Position[]).map((p) => ({ value: p, title: POSITIONS_CAREER[p].name })),
      pos,
      (v) => (pos = v),
    ),
    go,
  );
}

function bar(v: number) {
  const outer = el("div", "h-1.5 flex-1 overflow-hidden rounded-full bg-white/10");
  const inner = el("div", "h-full rounded-full");
  inner.style.width = `${v}%`;
  inner.style.background = v >= 80 ? "#facc15" : v >= 65 ? "#4ade80" : v >= 50 ? "#60a5fa" : "#94a3b8";
  outer.append(inner);
  return outer;
}

export interface CareerHandlers {
  play: () => void;
  sim: () => void;
  simRest: () => void;
  spend: (a: (typeof ATTRS)[number]["id"]) => void;
  next: () => void;
  retire: () => void;
  restart: () => void;
}

export function careerHub(c: Career, h: CareerHandlers) {
  const club = clubById(c.club);
  const tot = careerTotals(c);
  const head = el(
    "div",
    "flex items-center gap-3",
    el("div", "grid h-14 w-14 shrink-0 place-items-center rounded-lg font-display text-2xl font-black", String(c.number)),
    el(
      "div",
      "min-w-0",
      el("p", "truncate font-display text-xl font-black uppercase", `${c.name}${c.captain ? " (C)" : ""}`),
      el("p", "text-xs text-white/70", `${POSITIONS_CAREER[c.position].name} · age ${c.age} · ${club.name} · ${LEAGUES[c.league].name}`),
      el("p", "text-xs text-white/50", `${tot.games} games (${tot.pro} in the National League) · ${tot.goals} goals · ${tot.votes} career votes`),
    ),
    el("div", "ml-auto text-right", el("p", "text-[10px] uppercase tracking-widest text-white/50", "Overall"), el("p", "font-display text-3xl font-black text-[#facc15]", String(overall(c)))),
  );
  const badge = head.firstChild as HTMLElement;
  badge.style.background = club.guernsey;
  badge.style.color = club.number;
  badge.style.boxShadow = `inset 0 -10px 0 ${club.hoop}`;

  const attrs = el(
    "div",
    "grid gap-1.5 sm:grid-cols-2",
    ...ATTRS.map((a) => {
      const v = c.attrs[a.id];
      const plus = button("+", "grid h-6 w-6 place-items-center rounded border border-white/20 text-xs font-black hover:border-[#facc15] disabled:opacity-30", () => h.spend(a.id));
      plus.disabled = c.points < pointCost(v) || v >= 99 || c.stage === "retired";
      plus.setAttribute("aria-label", `Improve ${a.name} (${pointCost(v)} point${pointCost(v) > 1 ? "s" : ""})`);
      return el("div", "flex items-center gap-2 text-xs", el("span", "w-20 text-white/70", a.name), bar(v), el("span", "w-6 text-right font-bold tabular-nums", String(v)), plus);
    }),
  );
  const parts: Node[] = [head, el("p", "text-xs font-bold text-[#facc15]", `${c.points} skill point${c.points === 1 ? "" : "s"} to spend`), attrs];

  if (c.stage === "season") {
    const s = c.season;
    const ng = nextGame(s);
    const l = c.line;
    const avg = l.games ? (l.ratingSum / l.games).toFixed(1) : "–";
    const play = button(ng ? `Play ${ng.label} v ${clubById(ng.opponent).short}` : "…", `rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.12em] text-white`, h.play);
    play.style.background = RED;
    play.setAttribute("data-testid", "career-play");
    const sim = button("Sim game", `${BTN} text-xs`, h.sim);
    sim.setAttribute("data-testid", "career-sim");
    const rest = button("Sim the season", `${BTN} text-xs`, h.simRest);
    parts.push(
      el("p", "mt-1 text-sm font-bold", ng ? `Season ${c.year} · ${ng.label}: ${ng.fixture.home === c.club ? "home" : "away"} v ${clubById(ng.opponent).name}` : ""),
      el("div", "flex flex-wrap gap-2", play, sim, rest),
      el(
        "p",
        "text-xs text-white/75",
        `This season: ${l.games} games · ${l.goals}.${l.behinds} · ${l.disposals} disposals · ${l.marks} marks · ${l.tackles} tackles · avg rating ${avg} · ${ladderPosition(c)}${ordinal(ladderPosition(c))} on the ladder`,
      ),
      el("p", "text-xs text-white/75", `${LEAGUE_MEDAL[c.league]} count: you ${l.votes} · the favourite ${c.leader.votes}`),
      el("details", "text-xs", el("summary", "cursor-pointer text-white/60", "Ladder"), ladderTable(s)),
      finalsList(s),
    );
  } else if (c.stage === "offseason") {
    const last = c.history[c.history.length - 1];
    const next = button(`Start season ${c.year + 1}`, `rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.12em] text-white`, h.next);
    next.style.background = RED;
    next.setAttribute("data-testid", "career-next");
    parts.push(
      el("p", "mt-1 text-sm font-bold", `Season ${last.year} wrap: ${last.games} games, ${last.goals} goals, ${last.votes} votes. ${last.finish}.`),
      ...(last.awards.length ? [el("p", "text-sm font-bold text-[#facc15]", `Honours: ${last.awards.join(" · ")}`)] : []),
      el("p", "text-xs text-white/70", c.league === "national" && c.drafted?.year === last.year ? "You've been drafted! Next season you're in the National League." : `Next season: ${clubById(c.club).name}, ${LEAGUES[c.league].name}.`),
      el("div", "flex flex-wrap gap-2", next, button("Retire", `${BTN} text-xs`, h.retire)),
    );
  } else {
    parts.push(el("p", "mt-1 text-sm font-bold", "Retired. What a career."), button("Start a new career", `${BTN} self-start text-xs`, h.restart));
  }

  if (c.news.length) parts.push(el("ul", "flex flex-col gap-0.5 text-xs text-white/80", ...c.news.slice(0, 5).map((n) => el("li", "", `• ${n}`))));
  if (c.history.length) {
    const t = el("table", "w-full text-[11px] tabular-nums");
    t.append(el("tr", "text-[10px] uppercase tracking-wider text-white/50", ...["Year", "Club", "Lg", "G", "Gls", "Disp", "Votes", "Finish"].map((x, i) => el("th", i < 2 ? "text-left" : "px-1 text-right", x))));
    for (const l of c.history)
      t.append(
        el(
          "tr",
          "",
          el("td", "", String(l.year)),
          el("td", "", chip(l.club), clubById(l.club).short),
          ...[l.league[0].toUpperCase(), l.games, l.goals, l.disposals, l.votes, l.finish].map((v) => el("td", "px-1 text-right", String(v))),
        ),
      );
    parts.push(el("details", "text-xs", el("summary", "cursor-pointer text-white/60", "Career history"), t));
  }
  if (c.honours.length) parts.push(el("details", "text-xs", el("summary", "cursor-pointer text-white/60", `Honours (${c.honours.length})`), el("ul", "mt-1 list-disc pl-4", ...c.honours.map((x) => el("li", "", x)))));
  const out = card("Career", ...parts);
  out.setAttribute("data-testid", "career-hub");
  return out;
}

// ------------------------------------------------------------ club editor

export function clubEditor(edits: Record<string, ClubEdit>, save: (edits: Record<string, ClubEdit>) => void) {
  let current = NATIONAL[0].id;
  const nameIn = el("input", "w-full rounded border border-white/20 bg-black/40 px-2 py-1 text-sm text-white");
  nameIn.setAttribute("aria-label", "Club name");
  const shortIn = el("input", "w-20 rounded border border-white/20 bg-black/40 px-2 py-1 text-sm uppercase text-white");
  shortIn.setAttribute("aria-label", "Short code");
  shortIn.maxLength = 4;
  const colour = (label: string) => {
    const i = el("input", "h-8 w-12 cursor-pointer rounded border border-white/20 bg-transparent");
    i.type = "color";
    i.setAttribute("aria-label", label);
    return i;
  };
  const g = colour("Guernsey colour");
  const hp = colour("Hoop colour");
  const sh = colour("Shorts colour");
  const nm = colour("Number colour");
  const sel = el("select", "rounded border border-white/20 bg-black/60 px-2 py-1 text-sm text-white");
  sel.setAttribute("aria-label", "Club to edit");
  for (const [lg, list] of [
    ["National League", LEAGUES.national.clubs],
    ["State League", LEAGUES.state.clubs],
    ["Local League", LEAGUES.local.clubs],
  ] as const) {
    const og = el("optgroup");
    og.label = lg;
    for (const cl of list) {
      const o = el("option", "", defaultClub(cl.id)?.name ?? cl.name);
      o.value = cl.id;
      og.append(o);
    }
    sel.append(og);
  }
  const fill = () => {
    const cl = clubById(current);
    nameIn.value = cl.name;
    shortIn.value = cl.short;
    g.value = cl.guernsey;
    hp.value = cl.hoop;
    sh.value = cl.shorts;
    nm.value = cl.number;
  };
  sel.addEventListener("change", () => {
    current = sel.value;
    fill();
  });
  fill();
  const status = el("span", "text-xs text-white/60");
  const apply = button("Save club", `${BTN} text-xs`, () => {
    edits[current] = { name: nameIn.value, short: shortIn.value, guernsey: g.value, hoop: hp.value, shorts: sh.value, number: nm.value };
    save(edits);
    fill();
    status.textContent = "Saved on this device.";
  });
  const reset = button("Reset", `${BTN} text-xs`, () => {
    delete edits[current];
    save(edits);
    fill();
    status.textContent = "Back to the default.";
  });
  const resetAll = button("Reset all clubs", `${BTN} text-xs`, () => {
    for (const k of Object.keys(edits)) delete edits[k];
    save(edits);
    fill();
    status.textContent = "All clubs reset.";
  });
  return el(
    "details",
    "w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left text-sm [&[open]>summary]:mb-2",
    el("summary", "cursor-pointer text-[11px] font-bold uppercase tracking-[0.25em] text-[#facc15]", "Club editor"),
    el(
      "p",
      "mb-2 text-xs text-white/60",
      `Rename and recolour any of the ${ALL_CLUBS.length} clubs (the National League clubs play out of the real home bases). Edits stay on this device and show everywhere in the game.`,
    ),
    el(
      "div",
      "flex flex-col gap-2",
      sel,
      el("div", "flex gap-2", nameIn, shortIn),
      el("div", "flex flex-wrap items-center gap-3 text-xs", el("label", "flex items-center gap-1", g, "Guernsey"), el("label", "flex items-center gap-1", hp, "Hoop"), el("label", "flex items-center gap-1", sh, "Shorts"), el("label", "flex items-center gap-1", nm, "Number")),
      el("div", "flex flex-wrap items-center gap-2", apply, reset, resetAll, status),
    ),
  );
}
