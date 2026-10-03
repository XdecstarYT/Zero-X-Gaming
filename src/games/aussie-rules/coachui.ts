import { BTN, button, card, choice, el } from "../sports-kit/ui";
import { premiershipCeremony } from "./ceremony";
import { clubById, NATIONAL } from "./clubs";
import {
  acceptTrade,
  bestEighteen,
  closeDraft,
  coachRecord,
  draftPick as draftPickUi,
  CoachMatch,
  effective,
  FOCUS,
  LINES,
  openDraft,
  openTrades,
  scoutGrade,
  SPEECHES,
  stay,
  takeJob,
  TACTICS,
  targetText,
  teamRating,
  yourPick,
  type Coach,
  type CoachEvent,
  type Focus,
  type Footballer,
  type Speech,
  type Tactic,
} from "./coach";
import { awardsNight, chip, finalsBracket, grandFinalWeek, honourBoard, ladderTable, roundPanel, tabs } from "./premiership";
import { fullName, rosterFor } from "./rosters";
import { ladder, nextGame, ordinal } from "./season";

/** Screens for the coach career: the job interview, the office, the coaches' box. */

const RED = "#a3122c";
const GOLD = "#facc15";

export function coachCreate(start: (o: { name: string; club: string }) => void) {
  const name = el("input", "w-full rounded-md border-2 border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#facc15] focus:outline-none");
  name.placeholder = "Your name, coach";
  name.maxLength = 24;
  name.setAttribute("aria-label", "Coach name");
  let club = "northmelb";
  const grid = el("div", "grid w-full grid-cols-2 gap-1.5 sm:grid-cols-3");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Club to coach");
  const btns = NATIONAL.map((c) => {
    const b = button("", `${BTN} flex items-center px-2 py-1.5 text-left text-xs`, () => {
      club = c.id;
      for (const x of btns) x.style.borderColor = x.dataset.value === club ? GOLD : "";
    });
    b.dataset.value = c.id;
    b.append(chip(c.id), el("span", "truncate", c.name));
    if (c.id === club) b.style.borderColor = GOLD;
    return b;
  });
  grid.append(...btns);
  const go = button("Take the job", "rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.15em] text-white", () => start({ name: name.value || "Coach", club }));
  go.style.background = RED;
  go.setAttribute("data-testid", "coach-start");
  return card(
    "New coaching career",
    el("p", "text-sm text-white/75", "Pick a club, pick a team, pick a fight. You set the eighteen, the game plan and the week's training, then coach every game from the box: a speech and changes at each break. The board sets a target from where the club's tipped; miss it and they'll sack you. Win and the big clubs come calling. Off-seasons bring trades, the draft and retirements."),
    name,
    el("p", "text-xs text-white/60", "Club"),
    grid,
    go,
  );
}

function bar(v: number, colour?: string) {
  const outer = el("div", "h-1.5 w-full overflow-hidden rounded-full bg-white/10");
  const inner = el("div", "h-full rounded-full");
  inner.style.width = `${Math.max(0, Math.min(100, v))}%`;
  inner.style.background = colour ?? (v >= 70 ? "#4ade80" : v >= 40 ? "#facc15" : "#f87171");
  outer.append(inner);
  return outer;
}

const formArrow = (f: number) => (f >= 4 ? "▲▲" : f >= 1.5 ? "▲" : f <= -4 ? "▼▼" : f <= -1.5 ? "▼" : "•");

export interface CoachHandlers {
  /** Change something (it's saved and the screen redrawn). */
  act: (f: () => void) => void;
  /** Coach the next game from the box. */
  coach: () => void;
  /** Play the next game yourself (3D). */
  play: () => void;
  sim: () => void;
  simRest: () => void;
  restart: () => void;
}

export function coachHub(c: Coach, h: CoachHandlers) {
  const club = clubById(c.club);
  const rec = coachRecord(c);
  const badge = el("div", "grid h-14 w-14 shrink-0 place-items-center rounded-lg font-display text-xl font-black", club.short);
  badge.style.background = club.guernsey;
  badge.style.color = "#ffffff";
  badge.style.textShadow = "0 1px 0 #000, 0 0 6px #000";
  badge.style.boxShadow = `inset 0 -10px 0 ${club.hoop}`;
  const head = el(
    "div",
    "flex items-center gap-3",
    badge,
    el(
      "div",
      "min-w-0 flex-1",
      el("p", "truncate font-display text-xl font-black uppercase", c.name),
      el("p", "text-xs text-white/70", `Senior coach · ${club.name} · ${c.year}`),
      el("p", "text-xs text-white/50", `${rec.games} games · ${rec.won}-${rec.lost}${rec.drawn ? `-${rec.drawn}` : ""} (${rec.pct}%) · ${rec.flags} flag${rec.flags === 1 ? "" : "s"}`),
    ),
    el("div", "w-28 shrink-0 text-right", el("p", "text-[10px] uppercase tracking-widest text-white/50", "Reputation"), el("p", "font-display text-2xl font-black text-[#facc15]", String(Math.round(c.reputation)))),
  );
  const board = el(
    "div",
    "flex flex-col gap-1 rounded-lg bg-white/5 p-2",
    el("div", "flex justify-between text-xs", el("span", "font-bold", `The board: ${targetText(c.target)}`), el("span", "text-white/60", `Job security ${Math.round(c.security)}%`)),
    bar(c.security),
  );
  board.setAttribute("data-testid", "coach-board");
  const parts: Node[] = [head, board];

  if (c.stage === "season") parts.push(...seasonStage(c, h));
  else if (c.stage === "review") {
    const r = c.review!;
    const next = button("Open the trade period", "rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.12em] text-white", () => h.act(() => openTrades(c)));
    next.style.background = RED;
    next.setAttribute("data-testid", "coach-trades");
    parts.push(
      el("div", "rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 p-3", el("p", "text-[10px] font-bold uppercase tracking-[0.3em] text-[#facc15]", `${c.year} in review`), el("p", "font-display text-2xl font-black uppercase", r.finish), el("p", "text-sm text-white/80", r.verdict), el("ul", "mt-1 text-sm", ...r.awards.map((a) => el("li", "font-bold text-[#facc15]", `🏆 ${a}`)))),
      awardsNight(c.season),
      next,
    );
  } else if (c.stage === "trades") {
    const go = button("Close trades: on to the draft", "rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.12em] text-white", () => h.act(() => openDraft(c)));
    go.style.background = RED;
    go.setAttribute("data-testid", "coach-draft");
    parts.push(
      el("p", "text-sm font-bold", "Trade period. Other clubs have made offers for your players."),
      ...(c.trades.length
        ? c.trades.map((t, i) => {
            const mine = c.squad.find((p) => p.id === t.give);
            if (!mine) return el("span");
            const acc = button("Accept", `${BTN} text-xs`, () => h.act(() => acceptTrade(c, i)));
            acc.setAttribute("data-testid", `coach-accept-${i}`);
            return el(
              "div",
              "flex items-center gap-2 rounded-lg bg-white/5 p-2 text-xs",
              el("div", "min-w-0 flex-1", el("p", "font-bold", `${clubById(t.club).name} offer:`), el("p", "", `${t.get.first} ${t.get.last} (${t.get.line}, ${t.get.age}, rated ${t.get.rating})`), el("p", "text-white/60", `for ${mine.first} ${mine.last} (${mine.line}, ${mine.age}, rated ${mine.rating})`)),
              acc,
            );
          })
        : [el("p", "text-xs text-white/60", "No more offers on the table.")]),
      go,
    );
  } else if (c.stage === "draft") parts.push(...draftStage(c, h));
  else if (c.stage === "offers" || c.stage === "sacked") {
    const sacked = c.stage === "sacked";
    parts.push(
      el("p", `text-sm font-bold ${sacked ? "text-red-300" : "text-[#facc15]"}`, sacked ? "You've been sacked. A few clubs still want to talk." : "Your phone's ringing: other clubs want you."),
      ...c.offers.map((id) => {
        const b = button(`Take the ${clubById(id).name} job`, `${BTN} text-xs`, () => h.act(() => takeJob(c, id)));
        b.setAttribute("data-testid", `coach-job-${id}`);
        return el("div", "flex items-center gap-2", chip(id), b);
      }),
      ...(sacked ? [] : [button(`Stay at ${club.name}`, `${BTN} self-start text-xs`, () => h.act(() => stay(c)))]),
    );
  }

  if (c.news.length) parts.push(el("ul", "flex flex-col gap-0.5 rounded-lg bg-white/5 p-2 text-xs text-white/80", ...c.news.slice(0, 6).map((n) => el("li", "", `📰 ${n}`))));
  if (c.history.length) parts.push(historyTable(c));
  parts.push(button("Quit and start a new coaching career", `${BTN} self-start text-xs`, h.restart));
  const out = card("Coach", ...parts);
  out.setAttribute("data-testid", "coach-hub");
  return out;
}

function seasonStage(c: Coach, h: CoachHandlers): Node[] {
  const s = c.season;
  const ng = nextGame(s);
  const pos = ladder(s).findIndex((r) => r.id === c.club) + 1;
  const coachBtn = button(ng ? `Coach ${ng.label}` : "…", "rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.12em] text-white", h.coach);
  coachBtn.style.background = RED;
  coachBtn.setAttribute("data-testid", "coach-play");
  const play = button("Play it yourself", `${BTN} text-xs`, h.play);
  const sim = button("Sim game", `${BTN} text-xs`, h.sim);
  sim.setAttribute("data-testid", "coach-sim");
  const rest = button("Sim the season", `${BTN} text-xs`, h.simRest);
  const gfw = grandFinalWeek(s);
  return [
    el("p", "text-sm font-bold", ng ? `${ng.label}: ${ng.fixture.home === c.club ? "home" : "away"} v ${clubById(ng.opponent).name}${s.stage === "home" ? ` · ${pos}${ordinal(pos)} on the ladder` : ""}` : ""),
    ...(gfw ? [gfw] : []),
    el("div", "flex flex-wrap gap-2", coachBtn, play, sim, rest),
    tabs("coach", [
      { id: "team", label: "Team", body: () => selection(c, h) },
      { id: "plan", label: "Game plan", body: () => gamePlan(c, h) },
      { id: "list", label: "List", body: () => listTable(c) },
      { id: "ladder", label: "Ladder", body: () => ladderTable(s) },
      { id: "round", label: "Results", body: () => roundPanel(s) },
      { id: "finals", label: "Finals", body: () => finalsBracket(s) },
      { id: "awards", label: "Awards", body: () => awardsNight(s) },
      { id: "honours", label: "Honours", body: () => honourBoard(s.honours, c.club) },
    ]),
  ];
}

/** Pick the eighteen: tap a player in or out. */
function selection(c: Coach, h: CoachHandlers) {
  const sel = new Set(c.selected);
  const box = el("div", "flex flex-col gap-2");
  const head = el(
    "div",
    "flex flex-wrap items-center gap-2 text-xs",
    el("span", "font-bold", `${sel.size}/18 picked · team rating ${teamRating(c).toFixed(1)}`),
    ...LINES.map((l) => {
      const n = c.selected.filter((id) => c.squad.find((p) => p.id === id)?.line === l.id).length;
      return el("span", n === l.slots ? "text-white/60" : "text-red-300", `${l.name} ${n}/${l.slots}`);
    }),
    button("Auto-pick", `${BTN} ml-auto px-2 py-0.5 text-xs`, () => h.act(() => (c.selected = bestEighteen(c)))),
  );
  box.append(head);
  for (const l of LINES) {
    const players = c.squad.filter((p) => p.line === l.id).sort((a, b) => effective(b) - effective(a));
    box.append(el("p", "mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50", l.name));
    for (const p of players) {
      const on = sel.has(p.id);
      const row = button("", `flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${on ? "bg-[#facc15]/15" : "bg-white/[0.03]"} ${p.injury ? "opacity-50" : "hover:bg-white/10"}`, () =>
        h.act(() => {
          if (on) c.selected = c.selected.filter((x) => x !== p.id);
          else if (!p.injury && c.selected.length < 18) c.selected = [...c.selected, p.id];
        }),
      );
      row.disabled = !!p.injury && !on;
      row.setAttribute("aria-pressed", String(on));
      row.setAttribute("data-testid", `coach-player-${p.id}`);
      row.append(
        el("span", `w-4 text-center ${on ? "text-[#facc15]" : "text-white/30"}`, on ? "✓" : "+"),
        el("span", "min-w-0 flex-1 truncate font-bold", `${p.first} ${p.last}`),
        el("span", "w-8 text-right text-white/60", String(p.age)),
        el("span", "w-8 text-right font-black tabular-nums", String(p.rating)),
        el("span", `w-6 text-center ${p.form > 1 ? "text-green-400" : p.form < -1 ? "text-red-400" : "text-white/40"}`, formArrow(p.form)),
        el("span", "w-14", bar(p.fitness)),
        el("span", "w-20 truncate text-right text-[10px] text-red-300", p.injury ? `${p.injuryName ?? "Injured"} ${p.injury}w` : ""),
      );
      box.append(row);
    }
  }
  return box;
}

function gamePlan(c: Coach, h: CoachHandlers) {
  return el(
    "div",
    "flex flex-col gap-3",
    choice(
      "Game plan",
      (Object.keys(TACTICS) as Tactic[]).map((t) => ({ value: t, title: TACTICS[t].name, sub: TACTICS[t].sub })),
      c.tactic,
      (v) => h.act(() => (c.tactic = v)),
    ),
    el("p", "text-[11px] text-white/60", "Attack beats the flood, the flood beats pressure, pressure beats possession, possession beats attack. You'll see their plan at the first bounce."),
    choice(
      "Training this week",
      (Object.keys(FOCUS) as Focus[]).map((f) => ({ value: f, title: FOCUS[f].name, sub: FOCUS[f].sub })),
      c.focus,
      (v) => h.act(() => (c.focus = v)),
    ),
  );
}

function listTable(c: Coach) {
  const t = el("table", "w-full text-[11px] tabular-nums");
  t.append(el("tr", "text-[10px] uppercase tracking-wider text-white/50", ...["Player", "Pos", "Age", "Rtg", "Gms", "Gls", "Vts", "Career"].map((x, i) => el("th", i === 0 ? "text-left" : "px-1 text-right", x))));
  for (const p of [...c.squad].sort((a, b) => b.rating - a.rating))
    t.append(
      el(
        "tr",
        c.selected.includes(p.id) ? "" : "text-white/60",
        el("td", "truncate py-0.5", `${p.first} ${p.last}${p.drafted ? " ★" : ""}${p.injury ? " 🩹" : ""}`),
        ...[p.line, p.age, p.rating, p.sGames, p.sGoals, p.sVotes, `${p.games}g ${p.goals}gl`].map((v) => el("td", "px-1 text-right", String(v))),
      ),
    );
  return el("div", "overflow-x-auto", t, el("p", "mt-1 text-[10px] text-white/50", "★ drafted by you · 🩹 injured"));
}

function draftStage(c: Coach, h: CoachHandlers): Node[] {
  const d = c.draft!;
  const pick = yourPick(c);
  const pool = [...d.pool].sort((a, b) => b.rating + b.potential * 0.6 - (a.rating + a.potential * 0.6)).slice(0, 16);
  const done = button("Finish the draft", "rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.12em] text-white", () => h.act(() => closeDraft(c)));
  done.style.background = RED;
  done.setAttribute("data-testid", "coach-draft-done");
  return [
    el("p", "text-sm font-bold", pick ? `National draft: you're on the clock with pick ${pick}.` : "The draft's done for you."),
    ...(pick
      ? pool.map((p: Footballer) => {
          const b = button("Pick", `${BTN} px-2 py-0.5 text-xs`, () => h.act(() => draftPickUi(c, p.id)));
          b.setAttribute("data-testid", `coach-pick-${p.id}`);
          return el("div", "flex items-center gap-2 rounded bg-white/5 px-2 py-1 text-xs", el("span", "flex-1 truncate font-bold", `${p.first} ${p.last}`), el("span", "w-10 text-white/60", p.line), el("span", "w-14 text-right", `rated ${p.rating}`), el("span", "w-14 text-right font-black text-[#facc15]", `grade ${scoutGrade(p)}`), b);
        })
      : [done]),
    el("details", "text-xs", el("summary", "cursor-pointer text-white/60", "The picks so far"), el("ol", "mt-1 text-white/70", ...d.log.slice(-18).map((x) => el("li", "", x)))),
  ];
}

function historyTable(c: Coach) {
  const t = el("table", "w-full text-[11px] tabular-nums");
  t.append(el("tr", "text-[10px] uppercase tracking-wider text-white/50", ...["Year", "Club", "W-L-D", "Target", "Finish"].map((x, i) => el("th", i < 2 ? "text-left" : "px-1 text-right", x))));
  for (const y of c.history)
    t.append(
      el(
        "tr",
        y.flag ? "font-bold text-[#facc15]" : y.sacked ? "text-red-300" : "",
        el("td", "", String(y.year)),
        el("td", "", chip(y.club), clubById(y.club).short),
        ...[`${y.won}-${y.lost}-${y.drawn}`, y.target, `${y.finish}${y.award ? " · Coach of the Year" : ""}`].map((v) => el("td", "px-1 text-right", String(v))),
      ),
    );
  return el("details", "text-xs", el("summary", "cursor-pointer text-white/60", `Coaching history (${c.history.length})`), t);
}

// -------------------------------------------------------- the coaches' box

/**
 * The match from the coaches' box: the scoreboard, the play as it happens, and
 * at each break your call: the plan, a speech, the changes. A Grand Final gets
 * its build-up and its presentation.
 */
export function matchCentre(host: HTMLElement, c: Coach, done: (m: CoachMatch) => void) {
  const m = new CoachMatch(c);
  const us = clubById(c.club);
  const them = clubById(m.opponent);
  const gf = m.label === "Grand Final";
  const overlay = el("div", "absolute inset-0 z-20 flex flex-col overflow-hidden bg-[#05070c] text-white");
  overlay.setAttribute("data-testid", "coach-match");
  overlay.style.background = gf ? `radial-gradient(circle at 50% 0%, #facc1533 0, #05070c 60%)` : "#05070c";
  const fmt = (i: 0 | 1) => `${m.score[i].g}.${m.score[i].b} (${m.score[i].g * 6 + m.score[i].b})`;
  const side = (cl: typeof us, i: 0 | 1) => {
    const n = el("div", "flex flex-1 flex-col items-center rounded-lg p-2");
    n.style.background = `linear-gradient(160deg, ${cl.guernsey}, ${cl.hoop}66)`;
    n.style.textShadow = "0 2px 0 #000, 0 0 10px #000";
    const sc = el("p", "font-display text-3xl font-black tabular-nums", fmt(i));
    sc.setAttribute("data-testid", `coach-score-${i}`);
    n.append(el("p", "truncate text-xs font-bold uppercase tracking-wider", cl.name), sc);
    return { n, sc };
  };
  const a = side(us, 0);
  const b = side(them, 1);
  const status = el("p", "text-center text-[11px] font-bold uppercase tracking-[0.3em] text-[#facc15]", `${c.year} · ${m.label}${gf ? " · The Great Ground · 100,000" : ""}`);
  const board = el("div", "flex flex-col gap-2 p-3", status, el("div", "flex items-stretch gap-2", a.n, el("span", "self-center font-display text-lg font-black text-white/50", "v"), b.n));
  const feed = el("ol", "flex flex-1 flex-col gap-1 overflow-auto px-3 text-sm");
  feed.setAttribute("data-testid", "coach-feed");
  const panel = el("div", "max-h-[55%] overflow-auto border-t border-white/10 bg-black/60 p-3");
  overlay.append(board, feed, panel);
  host.append(overlay);

  const say = (text: string, cls = "text-white/80") => {
    const li = el("li", cls, text);
    feed.append(li);
    li.scrollIntoView({ block: "nearest" });
  };
  const refresh = () => {
    a.sc.textContent = fmt(0);
    b.sc.textContent = fmt(1);
  };
  let timer = 0;
  const breaks = ["Quarter time", "Half time", "Three-quarter time", "Full time"];

  const breakPanel = () => {
    const tactic = el("div");
    tactic.append(
      choice(
        "Game plan",
        (Object.keys(TACTICS) as Tactic[]).map((t) => ({ value: t, title: TACTICS[t].name })),
        m.tactic,
        (v) => (m.tactic = v),
      ),
    );
    const speeches = el("div", "flex flex-wrap gap-1");
    for (const [k, v] of Object.entries(SPEECHES) as [Speech, (typeof SPEECHES)[Speech]][]) {
      const sb = button(v.name, `${BTN} px-2 py-1 text-xs`, () => {
        m.speech = k;
        for (const x of speeches.children) (x as HTMLElement).style.borderColor = x === sb ? GOLD : "";
      });
      sb.title = v.sub;
      sb.setAttribute("data-testid", `coach-speech-${k}`);
      speeches.append(sb);
    }
    const offSel = el("select", "rounded border border-white/20 bg-black/60 px-1 py-1 text-xs text-white") as HTMLSelectElement;
    offSel.setAttribute("aria-label", "Player off");
    for (const id of m.on) {
      const p = c.squad.find((x) => x.id === id)!;
      const o = el("option", "", `${p.last} (${p.line}, fit ${Math.round(p.fitness)})`) as HTMLOptionElement;
      o.value = String(id);
      offSel.append(o);
    }
    const onSel = el("select", "rounded border border-white/20 bg-black/60 px-1 py-1 text-xs text-white") as HTMLSelectElement;
    onSel.setAttribute("aria-label", "Player on");
    for (const p of m.bench) {
      const o = el("option", "", `${p.last} (${p.line}, ${p.rating})`) as HTMLOptionElement;
      o.value = String(p.id);
      onSel.append(o);
    }
    const swap = button("Make the change", `${BTN} px-2 py-1 text-xs`, () => {
      if (m.interchange(Number(offSel.value), Number(onSel.value))) {
        say(m.events[m.events.length - 1].text, "text-sky-300");
        breakPanel();
      }
    });
    const go = button(m.q === 0 ? "Bounce the ball" : `Start the ${["", "second", "third", "last"][m.q]} quarter`, "rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.12em] text-white", () => quarter());
    go.style.background = RED;
    go.setAttribute("data-testid", "coach-next-q");
    const auto = button("Sim to the siren", `${BTN} text-xs`, () => {
      window.clearInterval(timer);
      while (!m.done) {
        const evs = m.playQuarter();
        for (const e of evs) say(line(e), e.team === 0 ? "text-white" : "text-white/60");
        say(`${breaks[m.q - 1]}: ${fmt(0)} to ${fmt(1)}`, "font-bold text-[#facc15]");
      }
      refresh();
      fullTime();
    });
    auto.setAttribute("data-testid", "coach-sim-rest");
    panel.replaceChildren(
      el("p", "mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#facc15]", m.q === 0 ? `Their plan: ${TACTICS[m.theirTactic].name}` : `${breaks[m.q - 1]}: ${m.points[0]} to ${m.points[1]}`),
      tactic,
      el("p", "mt-2 text-[10px] uppercase tracking-[0.2em] text-white/50", "The speech"),
      speeches,
      ...(m.bench.length ? [el("p", "mt-2 text-[10px] uppercase tracking-[0.2em] text-white/50", "Changes"), el("div", "flex flex-wrap items-center gap-1", offSel, el("span", "text-white/50", "→"), onSel, swap)] : []),
      el("div", "mt-3 flex flex-wrap gap-2", go, auto),
    );
  };

  const line = (e: CoachEvent) => `Q${e.q} ${String(e.min).padStart(2, " ")}' · ${e.text}`;

  const quarter = () => {
    panel.replaceChildren(el("p", "text-center text-xs text-white/60", `${["First", "Second", "Third", "Last"][m.q]} quarter under way…`));
    if (m.speech) say(`The speech: ${SPEECHES[m.speech].name.toLowerCase()}.`, "italic text-white/60");
    const evs = m.playQuarter();
    let i = 0;
    // Replay the quarter's score as it happened.
    const target = [
      { ...m.score[0] },
      { ...m.score[1] },
    ];
    m.score[0] = { g: target[0].g - evs.filter((e) => e.team === 0 && e.kind === "goal").length, b: target[0].b - evs.filter((e) => e.team === 0 && e.kind === "behind").length };
    m.score[1] = { g: target[1].g - evs.filter((e) => e.team === 1 && e.kind === "goal").length, b: target[1].b - evs.filter((e) => e.team === 1 && e.kind === "behind").length };
    refresh();
    window.clearInterval(timer);
    timer = window.setInterval(() => {
      if (!overlay.isConnected) return window.clearInterval(timer);
      const e = evs[i++];
      if (!e) {
        window.clearInterval(timer);
        m.score[0] = target[0];
        m.score[1] = target[1];
        refresh();
        say(`${breaks[m.q - 1]}: ${fmt(0)} to ${fmt(1)}`, "font-bold text-[#facc15]");
        if (m.done) fullTime();
        else breakPanel();
        return;
      }
      if (e.kind === "goal") m.score[e.team].g++;
      if (e.kind === "behind") m.score[e.team].b++;
      refresh();
      say(line(e), e.kind === "injury" ? "font-bold text-red-300" : e.team === 0 ? (e.kind === "goal" ? "font-bold text-white" : "text-white/80") : "text-white/50");
    }, gf ? 320 : 200);
  };

  const fullTime = () => {
    const [p0, p1] = m.points;
    const { awards, mine } = m.awards();
    const votes = Object.entries(awards.votes).sort((x, y) => y[1] - x[1]);
    const who = (key: string) => {
      const [cl, last] = [key.split(":")[0], key.split(":").slice(1).join(":")];
      const p = cl === c.club ? c.squad.find((x) => x.last === last) : null;
      return `${p ? `${p.first} ${p.last}` : fullName(cl, last, c.season.women)} (${clubById(cl).short})`;
    };
    const finish = () => {
      overlay.remove();
      done(m);
    };
    const cont = button("Back to the club", "rounded-md px-5 py-2.5 font-display font-black uppercase tracking-[0.12em] text-white", () => {
      if (!gf || p0 === p1) return finish();
      // The presentation.
      const won = p0 > p1;
      const team = won ? [...new Set([...c.selected, ...m.on])].map((id) => c.squad.find((p) => p.id === id)).filter((p): p is Footballer => !!p).map((p) => `${p.first} ${p.last}`) : rosterNamesFull(m.opponent, !!c.season.women);
      const best = votes.find(([k]) => k.startsWith(`${won ? c.club : m.opponent}:`)) ?? votes[0];
      premiershipCeremony(host, {
        year: c.year,
        winner: won ? us : them,
        loser: won ? them : us,
        scores: won ? [fmt(0), fmt(1)] : [fmt(1), fmt(0)],
        quarters: m.quarters.map((q) => (won ? q : [q[1], q[0]])),
        medal: best ? { name: who(best[0]), line: `${awards.goals[best[0]] ? `${awards.goals[best[0]]} goals · ` : ""}the umpires' best on ground` } : undefined,
        team: team.slice(0, 22),
        ours: won,
        byline: `Coach ${c.name}`,
        margin: Math.abs(p0 - p1),
        onDone: finish,
      });
    });
    cont.style.background = RED;
    cont.setAttribute("data-testid", "coach-done");
    const won = p0 > p1;
    panel.replaceChildren(
      el("p", "font-display text-2xl font-black uppercase", won ? `${us.name.split(" ").slice(-1)[0]} win by ${p0 - p1}` : p0 === p1 ? "A draw!" : `Beaten by ${p1 - p0}`),
      el("p", "text-xs text-white/70", m.quarters.map((q, i) => `${["QT", "HT", "3QT", "FT"][i]} ${q[0]}–${q[1]}`).join(" · ")),
      el("p", "mt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-[#facc15]", "Best on ground · 3-2-1"),
      ...votes.map(([k, v]) => el("p", "text-sm", el("b", "mr-2 text-[#facc15]", String(v)), who(k))),
      ...(Object.keys(mine).length ? [] : [el("p", "text-xs text-white/50", "None of yours got a vote.")]),
      el("div", "mt-3", cont),
    );
  };

  if (gf) {
    // Grand Final day: the build-up, a card at a time.
    const cards = [
      "🎉 Friday: a hundred thousand line the streets for the parade.",
      "🏟 Saturday: the Great Ground is full three hours early.",
      "🎤 The pre-match show, the anthem, a fighter jet flypast.",
      `🎌 ${them.name} burst through their banner first.`,
      `🔥 Then yours: ${us.name}, to a roar you feel in your chest.`,
      "📣 Last words in the rooms. Everything you've worked for.",
    ];
    cards.forEach((t, i) => window.setTimeout(() => overlay.isConnected && say(t, "font-bold text-[#facc15]"), i * 450));
    window.setTimeout(() => overlay.isConnected && breakPanel(), cards.length * 450);
  } else breakPanel();
  return overlay;
}

/** A club's eighteen by full name. */
const rosterNamesFull = (club: string, women: boolean) => rosterFor(club, women).map((p) => `${p.first} ${p.last}`);
