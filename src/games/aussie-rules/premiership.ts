import { BTN, button, el } from "../sports-kit/ui";
import { clubById } from "./clubs";
import { fullName } from "./rosters";
import { allLeagueTeam, countOf, finalName, finalsSpots, formGuide, headlines, ladder, lastRound, nextGame, ordinal, roundResults, strength, type Fixture, type Honour, type Season } from "./season";

/**
 * The premiership's furniture, shared by the season hub and the coach's
 * office: tabs, form guides, the round's results and talking points, the
 * finals bracket, Grand Final week, awards night with a live count, and the
 * honour board.
 */

const GOLD = "#facc15";

export function chip(id: string) {
  const c = clubById(id);
  const s = el("span", "mr-1.5 inline-block h-3 w-1.5 shrink-0 rounded-sm align-middle");
  s.style.background = `linear-gradient(${c.guernsey} 0 40%, ${c.hoop} 40% 60%, ${c.guernsey} 60%)`;
  return s;
}

const remembered: Record<string, string> = {};

/** A row of tabs over a panel; the open tab is remembered per `key` while the page lives. */
export function tabs(key: string, items: { id: string; label: string; body: () => Node }[]) {
  const wrap = el("div", "flex flex-col gap-2");
  const bar = el("div", "flex flex-wrap gap-1");
  bar.setAttribute("role", "tablist");
  const panel = el("div", "flex flex-col gap-2");
  const show = (id: string) => {
    remembered[key] = id;
    for (const b of bar.children) {
      const on = (b as HTMLElement).dataset.tab === id;
      (b as HTMLElement).setAttribute("aria-selected", String(on));
      (b as HTMLElement).style.borderColor = on ? GOLD : "";
      (b as HTMLElement).style.color = on ? GOLD : "";
    }
    panel.replaceChildren(items.find((i) => i.id === id)?.body() ?? el("span"));
  };
  for (const it of items) {
    const b = button(it.label, "rounded-full border-2 border-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider", () => show(it.id));
    b.dataset.tab = it.id;
    b.setAttribute("role", "tab");
    b.setAttribute("data-testid", `tab-${it.id}`);
    bar.append(b);
  }
  wrap.append(bar, panel);
  show(items.some((i) => i.id === remembered[key]) ? remembered[key] : items[0].id);
  return wrap;
}

/** W/L/D pills, oldest first. */
export function formChips(s: Season, id: string, n = 5) {
  const w = el("span", "inline-flex gap-0.5 align-middle");
  for (const r of formGuide(s, id, n)) {
    const b = el("span", "grid h-3.5 w-3.5 place-items-center rounded-sm text-[8px] font-black text-black", r);
    b.style.background = r === "W" ? "#4ade80" : r === "L" ? "#f87171" : "#d4d4d8";
    w.append(b);
  }
  return w;
}

/** The ladder (top `rows`, plus your club if it's below), the finals line and everyone's form. */
export function ladderTable(s: Season, rows = 99) {
  const all = ladder(s);
  const spots = finalsSpots(s);
  const table = el("table", "w-full text-xs tabular-nums");
  table.setAttribute("data-testid", "footy-ladder");
  table.append(el("tr", "text-[10px] uppercase tracking-wider text-white/50", ...["", "Club", "P", "W", "L", "D", "%", "Pts", "Form"].map((h, i) => el("th", i < 2 ? "py-0.5 text-left" : i === 8 ? "hidden px-1 text-left sm:table-cell" : "px-1 text-right", h))));
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
        el("td", "hidden px-1 sm:table-cell", formChips(s, r.id)),
      ),
    );
  });
  return table;
}

const scoreLine = (f: Fixture, mine: string) => {
  const [h, a] = f.result ?? [0, 0];
  const win = f.result ? (h > a ? f.home : a > h ? f.away : "") : "";
  return el(
    "li",
    `flex items-center gap-2 rounded px-1.5 py-0.5 ${f.home === mine || f.away === mine ? "bg-[#facc15]/10 font-bold text-[#facc15]" : ""}`,
    el("span", `flex min-w-0 flex-1 items-center truncate ${win === f.home ? "font-bold" : ""}`, chip(f.home), clubById(f.home).name),
    el("span", "w-16 shrink-0 text-center tabular-nums text-white/80", f.result ? `${h} – ${a}` : "v"),
    el("span", `flex min-w-0 flex-1 items-center justify-end truncate ${win === f.away ? "font-bold" : ""}`, clubById(f.away).name, chip(f.away)),
  );
};

/** One round's results, with arrows through the season and the round's talking points. */
export function roundPanel(s: Season) {
  const last = Math.max(0, lastRound(s));
  let round = last;
  const box = el("div", "flex flex-col gap-2");
  const draw = () => {
    const games = roundResults(s, round);
    const prev = button("‹", `${BTN} px-2 py-0.5 text-xs`, () => ((round = Math.max(0, round - 1)), draw()));
    const next = button("›", `${BTN} px-2 py-0.5 text-xs`, () => ((round = Math.min(s.rounds - 1, round + 1)), draw()));
    prev.disabled = round === 0;
    next.disabled = round >= s.rounds - 1;
    prev.setAttribute("aria-label", "Previous round");
    next.setAttribute("aria-label", "Next round");
    const news = headlines(s, round);
    box.replaceChildren(
      el("div", "flex items-center gap-2", prev, el("p", "flex-1 text-center text-xs font-bold uppercase tracking-widest", `Round ${round + 1}`), next),
      el("ol", "flex flex-col gap-0.5 text-xs", ...games.map((f) => scoreLine(f, s.club))),
      ...(news.length ? [el("ul", "rounded bg-white/5 p-2 text-xs text-white/80", ...news.map((n) => el("li", "", `📰 ${n}`)))] : []),
    );
  };
  draw();
  box.setAttribute("data-testid", "footy-round");
  return box;
}

/** The finals as a bracket, week by week. */
export function finalsBracket(s: Season) {
  if (!s.finals.length) {
    const pos = ladder(s);
    const spots = finalsSpots(s);
    return el("p", "text-xs text-white/60", `The top ${spots} make the finals. As it stands: ${pos.slice(0, spots).map((r) => clubById(r.id).short).join(", ")}.`);
  }
  const weeks = new Map<number, Fixture[]>();
  for (const f of s.finals) weeks.set(f.round, [...(weeks.get(f.round) ?? []), f]);
  const cols = [...weeks.entries()].sort((a, b) => a[0] - b[0]);
  const box = el("div", "grid gap-2", ...cols.map(([, fs]) => el("div", "flex flex-col gap-1", el("p", "text-[10px] font-bold uppercase tracking-[0.2em] text-white/50", finalName(fs[0].key ?? "")), ...fs.map((f) => {
    const card = el("div", `rounded-lg border px-2 py-1 text-xs ${f.key === "GF" ? "border-[#facc15]/60 bg-[#facc15]/10" : "border-white/10 bg-white/5"}`);
    const row = (id: string, pts: number | undefined, won: boolean) => el("div", `flex items-center gap-1 ${won ? "font-black" : "text-white/70"} ${id === s.club ? "text-[#facc15]" : ""}`, chip(id), el("span", "flex-1 truncate", clubById(id).name), el("span", "tabular-nums", pts === undefined ? "" : String(pts)));
    const [h, a] = f.result ?? [undefined, undefined];
    card.append(el("p", "text-[9px] uppercase tracking-wider text-white/40", f.key ?? ""), row(f.home, h, h !== undefined && h >= a!), row(f.away, a, a !== undefined && a > h!));
    return card;
  }))));
  box.style.gridTemplateColumns = `repeat(${cols.length}, minmax(0, 1fr))`;
  box.setAttribute("data-testid", "footy-bracket");
  return box;
}

/** Grand Final week: the build-up, the tale of the tape. */
export function grandFinalWeek(s: Season) {
  const g = nextGame(s);
  if (!g || g.fixture.key !== "GF") return null;
  const a = s.club;
  const b = g.opponent;
  const rows = ladder(s);
  const pos = (id: string) => rows.findIndex((r) => r.id === id) + 1;
  const met = s.fixtures.filter((f) => f.result && ((f.home === a && f.away === b) || (f.home === b && f.away === a)));
  const h2h = met.map((f) => {
    const [x, y] = f.home === a ? f.result! : [f.result![1], f.result![0]];
    return `Round ${f.round + 1}: ${x > y ? "won" : x < y ? "lost" : "drew"} ${x}–${y}`;
  });
  const fav = strength(s, a) >= strength(s, b) ? a : b;
  const side = (id: string) => el("div", "flex flex-1 flex-col items-center gap-1 rounded-lg p-2 text-center", el("p", "font-display text-lg font-black uppercase leading-tight", clubById(id).name), el("p", "text-[11px] text-white/70", `${pos(id)}${ordinal(pos(id))} on the ladder`), formChips(s, id));
  const left = side(a);
  const right = side(b);
  for (const [n, id] of [
    [left, a],
    [right, b],
  ] as const) {
    const c = clubById(id);
    n.style.background = `linear-gradient(160deg, ${c.guernsey}cc, ${c.hoop}55)`;
  }
  const box = el(
    "div",
    "flex flex-col gap-2 rounded-xl border-2 border-[#facc15]/70 bg-gradient-to-b from-[#facc15]/15 to-transparent p-3 text-center",
    el("p", "text-[10px] font-bold uppercase tracking-[0.4em] text-[#facc15]", `Grand Final week · ${s.year ?? ""}`),
    el("p", "font-display text-2xl font-black uppercase italic", "The big dance"),
    el("div", "flex items-stretch gap-2", left, el("span", "self-center font-display text-xl font-black text-white/60", "v"), right),
    el(
      "ul",
      "text-left text-xs text-white/80",
      el("li", "", "🎉 The parade rolls through the city on Friday: a hundred thousand turn out."),
      el("li", "", `📊 ${h2h.length ? `This year: ${h2h.join(" · ")}` : "They didn't meet in the home and away season."}`),
      el("li", "", `🔮 The experts tip ${clubById(fav).name}${fav === a ? ". The pressure is all yours." : ". Nobody gives you a chance. Good."}`),
      el("li", "", "🏟 The Great Ground, 100,000 in, a cup on a dais in the centre."),
    ),
  );
  box.setAttribute("data-testid", "footy-gf-week");
  return box;
}

const who = (s: Season, key: string) => {
  const [club, last] = [key.split(":")[0], key.split(":").slice(1).join(":")];
  return `${fullName(club, last, s.women)} (${clubById(club).short})`;
};

/**
 * Awards night: the medal count, the leading goalkicker, the All-League team,
 * and (when the year's done) the count read out live, round by round.
 */
export function awardsNight(s: Season) {
  const medal = countOf(s.medal, 6);
  const goals = countOf(s.goals, 6);
  const done = s.stage !== "home";
  const list = (title: string, rows: ReturnType<typeof countOf>, unit: string) =>
    el(
      "div",
      "rounded bg-white/5 p-2",
      el("p", "mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#facc15]", title),
      ...(rows.length ? rows.map((r, i) => el("p", `truncate text-xs ${r.club === s.club ? "font-bold text-[#facc15]" : ""}`, `${i + 1}. ${who(s, r.key)} · ${r.n} ${unit}`)) : [el("p", "text-xs text-white/50", "No games yet")]),
    );
  const wrap = el("div", "flex flex-col gap-2");
  wrap.setAttribute("data-testid", "footy-awards");
  if (done && medal[0]) {
    // The count, read out round by round.
    const stage = el("div", "rounded-lg border border-[#facc15]/40 bg-[#facc15]/10 p-3 text-center");
    const live = button("🎙 Count it live", `${BTN} text-xs`, () => runCount());
    live.setAttribute("data-testid", "footy-count");
    const verdict = () => {
      const top = countOf(s.medal, 2);
      const coleman = goals[0];
      stage.replaceChildren(
        el("p", "text-[10px] font-bold uppercase tracking-[0.3em] text-[#facc15]", "Awards night"),
        el("p", "mt-1 font-display text-lg font-black uppercase", `League Medal: ${who(s, top[0].key)}`),
        el("p", "text-xs text-white/75", `${top[0].n} votes${top[1] ? `, from ${who(s, top[1].key)} on ${top[1].n}` : ""}`),
        ...(coleman ? [el("p", "mt-2 font-display text-base font-black uppercase", `Leading goalkicker: ${who(s, coleman.key)}`), el("p", "text-xs text-white/75", `${coleman.n} goals in the home and away season`)] : []),
        el("div", "mt-2", live),
      );
    };
    let timer = 0;
    const runCount = () => {
      window.clearInterval(timer);
      const rounds = s.medalRounds ?? [];
      const tally: Record<string, number> = {};
      let r = 0;
      const step = () => {
        if (!stage.isConnected || r >= rounds.length) {
          window.clearInterval(timer);
          if (stage.isConnected) {
            verdict();
            stage.animate?.([{ boxShadow: `0 0 0 0 ${GOLD}` }, { boxShadow: `0 0 40px 6px ${GOLD}` }, { boxShadow: `0 0 0 0 ${GOLD}` }], { duration: 1400 });
          }
          return;
        }
        for (const [k, v] of Object.entries(rounds[r] ?? {})) tally[k] = (tally[k] ?? 0) + v;
        r++;
        const top = countOf(tally, 5);
        stage.replaceChildren(
          el("p", "text-[10px] font-bold uppercase tracking-[0.3em] text-[#facc15]", `The count · after round ${r} of ${rounds.length}`),
          el("ol", "mt-1 flex flex-col gap-0.5 text-left text-sm", ...top.map((t, i) => el("li", `flex justify-between ${i === 0 ? "font-black text-[#facc15]" : ""}`, el("span", "truncate", `${i + 1}. ${who(s, t.key)}`), el("span", "tabular-nums", String(t.n))))),
        );
      };
      step();
      timer = window.setInterval(step, 420);
    };
    verdict();
    wrap.append(stage);
  }
  wrap.append(el("div", "grid grid-cols-1 gap-2 sm:grid-cols-2", list(done ? "League Medal · final count" : "League Medal · the leaders", medal, "votes"), list("Leading goalkicker", goals, "goals")));
  if (done) {
    const team = allLeagueTeam(s);
    if (team.length >= 6)
      wrap.append(
        el(
          "details",
          "rounded bg-white/5 p-2 text-xs",
          el("summary", "cursor-pointer text-[10px] font-bold uppercase tracking-[0.2em] text-[#facc15]", "All-League team"),
          el("ol", "mt-1 grid grid-cols-1 gap-0.5 sm:grid-cols-2", ...team.map((t) => el("li", t.club === s.club ? "font-bold text-[#facc15]" : "", who(s, t.key)))),
        ),
      );
  }
  return wrap;
}

/** Every flag in this premiership's history. */
export function honourBoard(list: Honour[] | undefined, mine: string) {
  if (!list?.length) return el("p", "text-xs text-white/60", "The honour board is empty. Write the first name on it.");
  const t = el("table", "w-full text-[11px]");
  t.append(el("tr", "text-[10px] uppercase tracking-wider text-white/50", ...["Year", "Premiers", "GF", "Runners-up", "You"].map((x, i) => el("th", i === 2 ? "px-1 text-center" : "text-left", x))));
  for (const h of [...list].reverse())
    t.append(
      el(
        "tr",
        h.premier === mine ? "font-bold text-[#facc15]" : "",
        el("td", "py-0.5", String(h.year)),
        el("td", "", chip(h.premier), clubById(h.premier).name),
        el("td", "px-1 text-center tabular-nums", `${h.score[0]}–${h.score[1]}`),
        el("td", "text-white/70", clubById(h.runnerUp).short),
        el("td", "text-white/70", h.ours),
      ),
    );
  const flags = new Map<string, number>();
  for (const h of list) flags.set(h.premier, (flags.get(h.premier) ?? 0) + 1);
  const most = [...flags.entries()].sort((a, b) => b[1] - a[1])[0];
  const box = el("div", "flex flex-col gap-1", t, el("p", "text-[11px] text-white/60", `Most flags: ${clubById(most[0]).name} (${most[1]}).`));
  box.setAttribute("data-testid", "footy-honours");
  return box;
}
