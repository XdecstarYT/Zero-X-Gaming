import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import type { Detail, TimeOfDay } from "../sports-kit/look";
import { BTN, button, card, choice, el, hero, howTo, primaryButton, read, ResolutionGovernor, stat, write } from "../sports-kit/ui";
import { CricketAudio } from "./audio";
import { CricketHud } from "./hud";
import { CricketView, type CricketCam } from "./render";
import { CricketSim, emptyInput, LEVELS, PACE_KINDS, PITCH, SPIN_KINDS, type CricketInput, type Difficulty, type FieldSet, type Kind, type Mode, type ShotType } from "./sim";
import { TEAMS, teamById } from "./teams";
import { advance, caps, myStatus, newLeague, nextFixture, parseLeague, recordPlayed, simMine, table, type Fixture, type League } from "./league";
import { scorecard } from "./scorecard";
import { BroadcastChannelTransport, normalizeRoom, randomRoom, ROOM_RE, type Transport } from "../neon-siege/net";
import { SupabaseTransport } from "../neon-siege/net-supabase";
import { CricketLink, GuestPump, HostPump, matchFrom, type CricketMsg, type MatchConfig } from "./online";

const PREFS_KEY = "zx-cricket-prefs";
const LEAGUE_KEY = "zx-cricket-league";
const RECORD_KEY = "zx-cricket-record";
const TEAL = "#0e7490";

interface Prefs {
  team: string;
  opponent: string;
  mode: Mode | "league";
  overs: number;
  toss: "bat" | "bowl" | "toss";
  difficulty: Difficulty;
  tod: TimeOfDay;
  gfx: Detail;
  cam: CricketCam;
}
interface CricketRecord {
  played: number;
  won: number;
  best: number;
  highScore: number;
  bestBowling: string;
  sixes: number;
}

/**
 * Boundary Blitz: T20 cricket in a floodlit 3D stadium. Bat with aim,
 * shot choice and timing; bowl with deliveries, a target on the pitch, field
 * settings and a release meter. Full matches, a super-over chase, or the nets.
 */
class CricketGame implements GameModule {
  readonly slug = "boundary-blitz";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private audio!: CricketAudio;
  private sim: CricketSim | null = null;
  private view: CricketView | null = null;
  private hud: CricketHud | null = null;
  private coarse = false;
  private prefs!: Prefs;
  private ended = false;
  private unranked = false;
  private lastFrame = 0;
  private res = new ResolutionGovernor();
  private overAt = 0;
  private breakBox: HTMLDivElement | null = null;
  private cardBox: HTMLDivElement | null = null;
  // The Blitz League season, and the fixture being played.
  private league: League | null = null;
  private leagueGame: Fixture | null = null;
  // Online.
  private link: CricketLink | null = null;
  private pump: HostPump | GuestPump | null = null;
  private online: MatchConfig | null = null;
  private room = "";

  // Input.
  private inp: CricketInput = emptyInput();
  private aim = -20;
  private shotType: ShotType = "ground";
  private kind: Kind = "stock";
  private field: FieldSet = "balanced";
  private target = { x: -0.15, z: 6 };
  private keys = new Set<string>();
  private drag: { id: number; x: number; y: number } | null = null;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.prefs = read<Prefs>(PREFS_KEY, { team: "legends", opponent: "blaze", mode: "match", overs: 5, toss: "bat", difficulty: "pro", tod: "night", gfx: this.coarse ? "low" : "high", cam: "broadcast" });
    try {
      this.league = parseLeague(JSON.parse(localStorage.getItem(LEAGUE_KEY) ?? "null"));
    } catch {
      this.league = null;
    }
    this.host = el("div", "absolute inset-0 overflow-hidden bg-[#05070c]");
    this.host.style.touchAction = "none";
    opts.root.appendChild(this.host);
    this.menu = el("div", "absolute inset-0 z-10 flex overflow-auto bg-[#05070c]/95 p-3 pb-14 text-white");
    opts.root.appendChild(this.menu);
    this.audio = new CricketAudio(opts.settings.sound, opts.settings.volume, 0.14);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
      1000 / 60,
    );
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    this.host.addEventListener("mousemove", this.onMouseMove);
    this.host.addEventListener("mousedown", this.onMouseDown);
    this.host.addEventListener("contextmenu", (e) => e.preventDefault());
    this.host.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  start() {
    this.loop.pause();
    this.teardown();
    this.showMenu();
  }

  pause() {
    this.loop.pause();
    this.clearInput();
    this.audio.suspend();
  }

  resume() {
    if (!this.sim || this.ended) return;
    this.audio.resume();
    this.lastFrame = performance.now();
    this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.teardown();
    this.menu.remove();
    this.host.remove();
    this.audio.destroy();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  // ------------------------------------------------------------------ menu

  private showMenu() {
    this.menu.hidden = false;
    const rec = read<CricketRecord>(RECORD_KEY, { played: 0, won: 0, best: 0, highScore: 0, bestBowling: "", sixes: 0 });
    const p = this.prefs;
    const save = () => write(PREFS_KEY, this.prefs);
    const start = primaryButton("Walk out to the middle", TEAL, () => void this.begin());
    start.setAttribute("data-testid", "cricket-start");
    const teamChoice = (label: string, current: string, pick: (id: string) => void) =>
      choice(
        label,
        TEAMS.map((t) => ({ value: t.id, title: t.name, sub: `${"★".repeat(t.rating)}${"☆".repeat(5 - t.rating)} · ${t.short}` })),
        current,
        pick,
      );
    const controls = this.coarse
      ? "Drag to aim · SHOT, LOFT, BLOCK and RUN buttons · bowling: tap the pitch, pick a ball, BOWL then BOWL in the green"
      : "Mouse aims, click plays a shot, right-click / Shift lofts, S blocks, R runs · bowling: click the pitch, 1–6 deliveries, F field, Space twice · C camera · Esc pause";
    this.menu.replaceChildren(
      el(
        "div",
        "m-auto flex w-full max-w-2xl flex-col items-center gap-3",
        hero("Sports+", "BOUNDARY BLITZ", "T20 cricket · Under lights · Every ball counts", "radial-gradient(circle at 20% 0%, #0e7490 0, transparent 55%), radial-gradient(circle at 80% 100%, #c2410c 0, transparent 55%), linear-gradient(#0f3d1f, #05070c)"),
        card(
          "Your record",
          el("p", "text-sm", rec.played ? `${rec.won} wins in ${rec.played} matches · top score ${rec.highScore} · ${rec.sixes} sixes${rec.bestBowling ? ` · best bowling ${rec.bestBowling}` : ""} · best ${rec.best}` : "No matches yet. The crowd's in and the lights are on."),
        ),
        card(
          "Match",
          choice(
            "Mode",
            [
              { value: "match" as const, title: "T20 match", sub: "Bat and bowl, two innings" },
              { value: "superover" as const, title: "Super over", sub: "Chase it in six balls, two wickets" },
              { value: "nets" as const, title: "Nets", sub: "Practise your shots, no outs" },
              { value: "league" as const, title: "Blitz League", sub: "A season, semi-finals and a final" },
            ],
            p.mode,
            (v) => {
              const was = this.prefs.mode;
              this.prefs.mode = v;
              save();
              if ((was === "league") !== (v === "league")) this.showMenu();
            },
          ),
          choice(
            "Overs",
            [
              { value: 2, title: "2 overs", sub: "A quick slog" },
              { value: 5, title: "5 overs", sub: "About 20 minutes" },
              { value: 20, title: "20 overs", sub: "The full T20" },
            ],
            p.overs,
            (v) => ((this.prefs.overs = v), save()),
          ),
          choice(
            "Toss",
            [
              { value: "bat" as const, title: "Bat first", sub: "Set a total" },
              { value: "bowl" as const, title: "Bowl first", sub: "Chase it down" },
              { value: "toss" as const, title: "Toss a coin", sub: "Let fate decide" },
            ],
            p.toss,
            (v) => ((this.prefs.toss = v), save()),
          ),
          choice(
            "Difficulty",
            (Object.keys(LEVELS) as Difficulty[]).map((d) => ({ value: d, title: LEVELS[d].name, sub: d === "rookie" ? "Wayward bowling, generous fielders" : d === "pro" ? "A fair contest" : "Sharp fielders, nagging lines" })),
            p.difficulty,
            (v) => ((this.prefs.difficulty = v), save()),
          ),
        ),
        card(
          "Your team",
          teamChoice("Your team", p.team, (v) => {
            this.prefs.team = v;
            save();
            if (this.link) {
              this.link.team = v;
              this.link.hello();
            }
          }),
        ),
        p.mode === "league" ? el("span") : card("Opponent", teamChoice("Opponent", p.opponent, (v) => ((this.prefs.opponent = v), save()))),
        card(
          "Presentation",
          choice(
            "Time",
            [
              { value: "night" as const, title: "Night", sub: "Floodlights, white ball" },
              { value: "twilight" as const, title: "Twilight", sub: "Sunset start" },
              { value: "day" as const, title: "Day", sub: "Blue skies" },
            ],
            p.tod,
            (v) => ((this.prefs.tod = v), save()),
          ),
          choice(
            "Camera",
            [
              { value: "broadcast" as const, title: "Broadcast", sub: "Behind the bowler's arm" },
              { value: "batter" as const, title: "Batter", sub: "From the crease" },
            ],
            p.cam,
            (v) => ((this.prefs.cam = v), save()),
          ),
          choice(
            "Graphics",
            [
              { value: "ultra" as const, title: "Ultra", sub: "Ambient occlusion, full crowd" },
              { value: "high" as const, title: "High", sub: "Soft shadows, bloom" },
              { value: "low" as const, title: "Low", sub: "Faster on phones" },
            ],
            p.gfx,
            (v) => ((this.prefs.gfx = v), save()),
          ),
        ),
        p.mode === "league" ? this.leaguePanel() : start,
        this.onlineCard(),
        howTo([
          ["Batting", "Aim where you want to hit it (the arrow on the ground), then play as the ball reaches you. Perfect timing goes where you aimed, and fast. Early pulls it to leg, late slices it to the off side; way off and you miss."],
          ["Shots", "SHOT keeps it on the ground, LOFT goes over the top (six, or caught in the deep), BLOCK defends a good ball. Play with the line: drive the full ones, cut and pull the short ones, and don't play across a straight one."],
          ["Out", "Bowled, caught, LBW (pad in front of the stumps) or run out. Edges fly to the keeper and slips."],
          ["Running", "Your batters run what's safe. Press RUN while the ball's in the field to push for one more: beat the throw or you're run out."],
          ["Bowling", "Pick a delivery (pace: stock, swing, bouncer, yorker, slower ball; spin: off-break, leg-break, arm ball, flight), aim the ring on the pitch, set the field, then run in and stop the meter in the green. Late is a no-ball and a free hit."],
          ["Online", "Join the same room code as a friend (or send them the invite link). The first one in hosts and starts the match; one of you bats while the other bowls, then you swap for the chase. Online matches don't go on the leaderboard."],
          ["DRS", "Umpires get the odd LBW wrong. Each side has one review an innings: press V (or REVIEW) when a decision goes against you and ball-tracking shows where it pitched, where it hit the pad and whether it was hitting the stumps. Umpire's call keeps the review."],
          ["Powerplay", "The first 30% of the overs: only two fielders outside the circle. Go hard."],
          ["Blitz League", "Seven rounds against the other franchises, the top four to the semi-finals and a final. Play your games or sim them; the Orange and Purple Caps go to the leading run-scorer and wicket-taker."],
          ["Score", "Your runs, 20 a wicket, 4 a six, and 150 for a win."],
        ]),
        el("p", "max-w-xl text-center text-[11px] text-white/50", controls),
      ),
    );
  }

  // ----------------------------------------------------------------- match

  private saveLeague() {
    write(LEAGUE_KEY, this.league);
  }

  /** The league hub: where you stand, your next game, the table, the caps. */
  private leaguePanel() {
    const L = this.league;
    if (!L) {
      const go = primaryButton("Start the Blitz League", TEAL, () => {
        this.league = newLeague({ team: this.prefs.team, overs: this.prefs.overs, seed: Date.now() & 0x7fffffff });
        this.saveLeague();
        this.showMenu();
      });
      go.setAttribute("data-testid", "cricket-league-new");
      return card(
        "Blitz League",
        el("p", "text-xs text-white/70", `Your team plays the other seven once (${this.prefs.overs} overs a side), the top four go to the semi-finals and the winners meet in the final. Two points a win, then net run rate.`),
        go,
      );
    }
    const f = nextFixture(L);
    const opp = f ? teamById(f.a === L.team ? f.b : f.a) : null;
    const label = f ? (f.key === "F" ? "The final" : f.key ? "Semi-final" : `Round ${f.round + 1}`) : "";
    const play = primaryButton(f && opp ? `Play ${label} v ${opp.short}` : "Season over", TEAL, () => void this.begin());
    play.setAttribute("data-testid", "cricket-start");
    play.disabled = !f;
    const sim = button("Sim this match", `${BTN} text-xs`, () => {
      simMine(L);
      this.saveLeague();
      this.showMenu();
    });
    sim.disabled = !f;
    sim.setAttribute("data-testid", "cricket-league-sim");
    const rest = button("Sim the rest of the season", `${BTN} text-xs`, () => {
      for (let i = 0; i < 20 && L.stage !== "done"; i++) {
        if (nextFixture(L)) simMine(L);
        else advance(L);
      }
      this.saveLeague();
      this.showMenu();
    });
    rest.disabled = L.stage === "done";
    const skip = button("Skip ahead", `${BTN} text-xs`, () => {
      advance(L);
      this.saveLeague();
      this.showMenu();
    });
    skip.hidden = !!f || L.stage === "done";
    const rows = table(L);
    const th = (t: string, left = false) => el("th", `px-1 text-[10px] uppercase tracking-wider text-white/50 ${left ? "text-left" : "text-right"}`, t);
    const tbl = el(
      "table",
      "w-full text-xs tabular-nums",
      el("tr", "", th("", true), th("Team", true), th("P"), th("W"), th("L"), th("T"), th("NRR"), th("Pts")),
      ...rows.map((r, i) =>
        el(
          "tr",
          `${r.id === L.team ? "bg-[#22d3ee]/15 font-bold text-[#22d3ee]" : ""} ${i === 3 ? "border-b border-dashed border-white/25" : ""}`,
          el("td", "w-4 py-0.5 text-white/50", String(i + 1)),
          el("td", "py-0.5", teamById(r.id).name),
          ...[r.p, r.w, r.l, r.t, (r.nrr >= 0 ? "+" : "") + r.nrr.toFixed(2), r.pts].map((v) => el("td", "px-1 text-right", String(v))),
        ),
      ),
    );
    tbl.setAttribute("data-testid", "cricket-table");
    const cp = caps(L);
    const capList = (title: string, color: string, list: typeof cp.orange, fmt: (x: (typeof cp.orange)[number]) => string) =>
      el(
        "div",
        "rounded bg-white/5 p-2",
        el("p", "mb-1 text-[10px] font-bold uppercase tracking-[0.2em]", Object.assign(el("span", ""), { textContent: title, style: `color:${color}` })),
        ...(list.length ? list.slice(0, 3).map((x, i) => el("p", "truncate text-xs", `${i + 1}. ${x.name} (${teamById(x.team).short}) ${fmt(x)}`)) : [el("p", "text-xs text-white/50", "No games yet")]),
      );
    const po = L.playoffs.length
      ? el(
          "ol",
          "flex flex-col gap-0.5 text-xs",
          ...L.playoffs.map((x) => el("li", x.a === L.team || x.b === L.team ? "font-bold text-[#22d3ee]" : "", `${x.key === "F" ? "Final" : x.key === "SF1" ? "Semi 1" : "Semi 2"}: ${teamById(x.a).short} v ${teamById(x.b).short}${x.result ? ` · ${x.result.text}` : ""}`)),
        )
      : el("span");
    const abandon = button("Abandon season", `${BTN} self-start text-xs`, () => {
      if (!confirm("Abandon this season?")) return;
      this.league = null;
      write(LEAGUE_KEY, null);
      this.showMenu();
    });
    const panel = card(
      `Blitz League · ${teamById(L.team).name} · ${L.overs} overs`,
      el("p", "text-sm font-bold", myStatus(L)),
      el("div", "flex flex-wrap gap-2", play, sim, skip, rest),
      tbl,
      po,
      el("div", "grid grid-cols-2 gap-2", capList("Orange Cap", "#fb923c", cp.orange, (x) => `${x.runs}`), capList("Purple Cap", "#c084fc", cp.purple, (x) => `${x.wkts}w`)),
      abandon,
    );
    panel.setAttribute("data-testid", "cricket-league");
    return panel;
  }

  private begin() {
    if (this.prefs.mode === "league") return this.beginLeague();
    this.leagueGame = null;
    this.audio.unlock();
    this.menu.hidden = true;
    this.teardown();
    this.ended = false;
    const params = new URLSearchParams(window.location.search);
    const test = params.has("cricket");
    this.unranked = test;
    const p = this.prefs;
    const me = teamById(p.team);
    let them = teamById(p.opponent);
    if (them.id === me.id) them = TEAMS.find((t) => t.id !== me.id)!;
    const seed = Date.now() & 0x7fffffff;
    const batFirst: 0 | 1 = p.mode === "nets" || p.mode === "superover" ? 0 : p.toss === "bat" ? 0 : p.toss === "bowl" ? 1 : seed % 2 ? 0 : 1;
    this.sim = new CricketSim({
      teams: [me, them],
      human: 0,
      batFirst,
      overs: p.mode === "nets" ? 3 : p.overs,
      difficulty: p.difficulty,
      mode: p.mode === "league" ? "match" : p.mode,
      seed,
      target: p.mode === "superover" ? 14 + (seed % 9) : undefined,
    });
    this.launch(test);
  }

  private beginLeague() {
    const L = this.league;
    const f = L && nextFixture(L);
    if (!L || !f) return;
    this.audio.unlock();
    this.menu.hidden = true;
    this.teardown();
    this.ended = false;
    this.unranked = new URLSearchParams(window.location.search).has("cricket");
    this.leagueGame = f;
    const me = teamById(L.team);
    const them = teamById(f.a === L.team ? f.b : f.a);
    const seed = Date.now() & 0x7fffffff;
    this.sim = new CricketSim({ teams: [me, them], human: 0, batFirst: seed % 2 ? 0 : 1, overs: L.overs, difficulty: this.prefs.difficulty, mode: "match", seed });
    this.launch(this.unranked);
  }

  // ---------------------------------------------------------------- online

  private onlineCard() {
    const params = new URLSearchParams(window.location.search);
    const input = el("input", "h-10 w-32 rounded-md border-2 border-white/15 bg-black/40 px-3 text-center font-mono text-sm uppercase tracking-[0.3em] text-white focus:border-[#22d3ee] focus:outline-none");
    input.value = this.room || normalizeRoom(params.get("room") ?? "") || randomRoom();
    input.maxLength = 8;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Room code");
    input.setAttribute("data-testid", "cricket-room");
    const status = el("p", "min-h-4 text-xs text-white/75");
    status.setAttribute("role", "status");
    status.setAttribute("data-testid", "cricket-online-status");
    const lobby = el("div", "flex flex-col gap-2");
    const join = button("Join room", `${BTN} border-[#22d3ee]`, () => void this.joinRoom(normalizeRoom(input.value), status, lobby, join));
    join.setAttribute("data-testid", "cricket-join");
    const copy = button("Copy invite link", BTN, () => {
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("room", normalizeRoom(input.value));
      void navigator.clipboard?.writeText(url.toString()).then(
        () => (status.textContent = "Invite link copied. Send it to a friend."),
        () => (status.textContent = url.toString()),
      );
    });
    if (this.link) this.renderLobby(lobby, status, join);
    return card(
      "Play a friend online",
      el("p", "text-xs text-white/70", `Pick a room code and share it (or the invite link). One of you bats while the other bowls, then you swap for the chase. Uses your team and the overs above.${this.localNet() ? " Local mode: rooms work between tabs of this browser." : ""}`),
      el("div", "flex flex-wrap items-center gap-2", input, join, copy),
      status,
      lobby,
    );
  }

  private localNet() {
    return new URLSearchParams(window.location.search).get("net") === "local" || !SupabaseTransport.available();
  }

  private async joinRoom(code: string, status: HTMLElement, lobby: HTMLElement, join: HTMLButtonElement) {
    if (!ROOM_RE.test(code)) {
      status.textContent = "Room codes are 4 to 8 letters or numbers.";
      return;
    }
    this.link?.close();
    this.room = code;
    const name = this.opts.playerName ?? "Player";
    const t: Transport<CricketMsg> = this.localNet() ? new BroadcastChannelTransport<CricketMsg>(code, name, undefined, "cricket") : new SupabaseTransport<CricketMsg>(code, name, undefined, "cricket");
    const link = new CricketLink(t, name, this.prefs.team);
    this.link = link;
    join.disabled = true;
    status.textContent = "Connecting…";
    link.onChange = () => this.renderLobby(lobby, status, join);
    link.onStart = (cfg) => {
      if (!this.online) this.beginOnline(cfg, 1);
    };
    try {
      await link.connect();
    } catch (e) {
      status.textContent = (e as Error).message;
      join.disabled = false;
      if (this.link === link) this.link = null;
      return;
    }
    this.renderLobby(lobby, status, join);
  }

  private renderLobby(lobby: HTMLElement, status: HTMLElement, join: HTMLButtonElement) {
    const link = this.link;
    if (!link || this.online) return;
    if (link.full) {
      status.textContent = "That room already has two players. Try another code.";
      lobby.replaceChildren();
      return;
    }
    const opp = link.opponent;
    const host = link.isHost;
    status.textContent = !opp ? `Room ${this.room}: waiting for your opponent…` : host ? `${opp.name} is in. Start when you're ready.` : "Waiting for the host to start the match…";
    const row = (who: string, name: string, team: string | null) =>
      el("div", "flex items-center justify-between rounded bg-white/5 px-3 py-2 text-sm", el("span", "font-bold", `${who}: ${name}`), el("span", "text-white/70", team ? teamById(team).name : "—"));
    const leave = button("Leave room", `${BTN} text-xs`, () => {
      link.close();
      this.link = null;
      lobby.replaceChildren();
      status.textContent = "";
      join.disabled = false;
    });
    const items: HTMLElement[] = [row(host ? "You (host)" : "You", link.name, link.team), row("Opponent", opp?.name ?? "waiting…", opp?.team ?? null)];
    if (host) {
      const go = primaryButton(`Start online match · ${this.prefs.overs} overs`, TEAL, () => {
        if (!link.ready) return;
        const cfg = link.start(this.prefs.overs);
        this.beginOnline(cfg, 0);
      });
      go.setAttribute("data-testid", "cricket-online-start");
      go.disabled = !link.ready;
      if (!link.ready) go.style.opacity = "0.5";
      items.push(go);
    }
    items.push(leave);
    lobby.replaceChildren(...items);
    lobby.setAttribute("data-testid", "cricket-lobby");
  }

  /** Start an online match (side 0 hosts, side 1 is the guest). */
  private beginOnline(cfg: MatchConfig, side: 0 | 1) {
    const link = this.link;
    if (!link) return;
    this.audio.unlock();
    this.menu.hidden = true;
    this.teardown(false);
    this.ended = false;
    this.unranked = true;
    this.online = cfg;
    this.sim = matchFrom(cfg, side);
    this.pump = side === 0 ? new HostPump(this.sim, link, cfg) : new GuestPump(this.sim, link);
    this.launch(new URLSearchParams(window.location.search).has("cricket"));
  }

  private launch(test: boolean) {
    const p = this.prefs;
    if (!this.sim) return;
    this.kind = this.sim.bowler.style === "spin" ? SPIN_KINDS[0] : PACE_KINDS[0];
    if (test) {
      const w = window as unknown as { __cricket?: CricketSim; __cricketAdvance?: (s: number) => void };
      w.__cricket = this.sim;
      w.__cricketAdvance = (secs: number) => {
        const sim = this.sim;
        if (!sim) return;
        sim.autopilot = true;
        for (let i = 0; i < secs * 60 && sim.phase !== "done"; i++) this.update(1 / 60);
        sim.autopilot = false;
        for (let i = 0; i < 3; i++) this.view?.render(0.2, this.prefs.cam, { aim: this.aim, target: this.target, shot: this.shotType });
        this.hud?.update(0.1, { kind: this.kind, field: this.field, shot: this.shotType });
      };
    }
    try {
      this.view = new CricketView(this.host, this.sim, p.gfx, p.tod);
    } catch {
      this.showMenu();
      this.menu.prepend(el("p", "w-full rounded bg-red-900/60 p-2 text-center text-sm", "3D graphics aren't available on this device (WebGL is off)."));
      this.sim = null;
      return;
    }
    this.view.canvas.setAttribute("data-testid", "cricket-canvas");
    this.hud = new CricketHud(this.host, this.sim, this.coarse, {
      kind: () => this.kind,
      onKind: (k) => (this.kind = k),
      onField: (f) => (this.field = f),
      onShot: (s) => this.playShot(s),
      onBowl: () => (this.inp.bowl = true),
      onRun: () => (this.inp.run = true),
      onReview: () => (this.inp.review = true),
      onCard: () => this.toggleCard(),
    });
    this.overAt = 0;
    this.lastFrame = performance.now();
    this.loop.start();
    this.view.canvas.focus({ preventScroll: true });
  }

  private teardown(leaveRoom = true) {
    if (leaveRoom) {
      this.link?.close();
      this.link = null;
      this.online = null;
    }
    this.pump = null;
    this.hud?.destroy();
    this.hud = null;
    this.view?.destroy();
    this.view = null;
    this.breakBox?.remove();
    this.breakBox = null;
    this.cardBox?.remove();
    this.cardBox = null;
    this.sim = null;
    this.host.querySelector("[data-results]")?.remove();
  }

  private playShot(s: ShotType) {
    this.shotType = s;
    this.inp.shot = s;
  }

  private update(dt: number) {
    const sim = this.sim;
    if (!sim || !this.view) return;
    const k = (...c: string[]) => c.some((x) => this.keys.has(x));
    const turn = (k("KeyD", "ArrowRight", "KeyE") ? 1 : 0) - (k("KeyA", "ArrowLeft", "KeyQ") ? 1 : 0);
    if (turn) this.aim = Math.max(-175, Math.min(175, this.aim + turn * dt * 110));
    if (sim.humanBowls && sim.phase === "plan") {
      const tx = (k("KeyJ") ? -1 : 0) + (k("KeyL") ? 1 : 0);
      const tz = (k("KeyI") ? 1 : 0) - (k("KeyK") ? 1 : 0);
      this.target.x = Math.max(-1.6, Math.min(1.2, this.target.x + tx * dt * 1.2));
      this.target.z = Math.max(0.5, Math.min(13, this.target.z + tz * dt * 4));
    }
    const inp = this.inp;
    inp.aim = this.aim;
    inp.kind = this.kind;
    inp.target = this.target;
    inp.field = this.field;
    let events = sim.events;
    if (this.pump) events = this.pump.step(dt, inp, performance.now());
    else sim.step(dt, inp);
    inp.shot = null;
    inp.bowl = false;
    inp.run = false;
    inp.next = false;
    inp.review = false;
    // Online: the other player left mid-match.
    if (this.online && this.link?.opponentGone && sim.phase !== "done" && !this.ended) {
      this.finish("Your opponent left the match.");
      return;
    }
    for (const e of events) {
      this.view.onEvent(e);
      this.hud?.onEvent(e);
      this.audio.onEvent(e);
      if (e.kind === "inningsEnd") this.showBreak(e.summary);
      if (e.kind === "matchEnd") this.overAt = performance.now();
    }
    sim.events.length = 0;
    if (sim.phase !== "break" && this.breakBox) {
      this.breakBox.remove();
      this.breakBox = null;
    }
    const tension = sim.phase === "delivery" ? 0.5 : sim.phase === "live" ? 0.8 : 0.25;
    this.audio.setExcitement(tension + (sim.target && sim.target - sim.inn.runs < 12 ? 0.3 : 0), dt);
    this.emitter.progress(sim.score(), performance.now());
    if (sim.phase === "done" && !this.ended && this.overAt && performance.now() - this.overAt > 2500) this.finish();
  }

  private showBreak(summary: string) {
    const sim = this.sim!;
    const next = button("Start the chase", `${BTN} mt-3`, () => (this.inp.next = true));
    next.setAttribute("data-testid", "cricket-continue");
    const target = sim.innings[0].runs + 1;
    const chasing = sim.teams[1 - sim.innings[0].bat];
    this.breakBox = el(
      "div",
      "absolute inset-0 z-20 grid place-items-center bg-black/60 p-4 text-white",
      el(
        "div",
        "w-full max-w-md rounded-xl border border-white/15 bg-[#0b0f18] p-5 text-center",
        el("p", "text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", "Innings break"),
        el("p", "mt-1 font-display text-2xl font-black", summary),
        el("p", "mt-2 text-sm text-white/75", `${chasing.name} need ${target} to win from ${sim.ballsPerInnings / 6} overs.`),
        this.topCard(0),
        this.fullCards([0]),
        next,
      ),
    );
    this.breakBox.firstElementChild?.classList.add("max-h-full", "overflow-auto");
    this.host.appendChild(this.breakBox);
  }

  private topCard(i: number) {
    const sim = this.sim!;
    const inn = sim.innings[i];
    if (!inn) return el("div");
    const bat = sim.teams[inn.bat];
    const bowl = sim.teams[1 - inn.bat];
    const top = inn.cards
      .map((c, k) => ({ c, k }))
      .filter((x) => x.c.balls > 0)
      .sort((a, b) => b.c.runs - a.c.runs)
      .slice(0, 3);
    const bw = [...inn.bowl.entries()].sort((a, b) => b[1].wkts - a[1].wkts || a[1].runs - b[1].runs).slice(0, 2);
    return el(
      "div",
      "mt-3 grid grid-cols-2 gap-2 text-left text-xs",
      el("div", "rounded bg-white/5 p-2", el("p", "mb-1 font-bold text-white/60", bat.short), ...top.map(({ c, k }) => el("p", "", `${bat.players[k].name.split(" ")[1]} ${c.runs}${c.out ? "" : "*"} (${c.balls})`))),
      el("div", "rounded bg-white/5 p-2", el("p", "mb-1 font-bold text-white/60", bowl.short), ...bw.map(([k, b]) => el("p", "", `${bowl.players[k].name.split(" ")[1]} ${b.wkts}-${b.runs}`))),
    );
  }

  /** Both innings' full scorecards, folded away. */
  private fullCards(which: number[]) {
    const sim = this.sim!;
    const parts = which
      .filter((i) => sim.innings[i])
      .map((i) => {
        const inn = sim.innings[i];
        return el(
          "details",
          "mt-2 rounded bg-white/5 p-2 text-left",
          el("summary", "cursor-pointer text-xs font-bold uppercase tracking-wider text-white/70", `${sim.teams[inn.bat].name} ${inn.runs}/${inn.wkts} · full scorecard`),
          scorecard(inn, sim.teams[inn.bat], sim.teams[1 - inn.bat], (b) => sim.overs(b)),
        );
      });
    return el("div", "", ...parts);
  }

  /** The scorecard overlay during play (Tab or CARD). */
  private toggleCard() {
    const sim = this.sim;
    if (!sim) return;
    if (this.cardBox) {
      this.cardBox.remove();
      this.cardBox = null;
      return;
    }
    const close = button("Close", `${BTN} mt-2`, () => this.toggleCard());
    const inns = sim.innings.map((inn) =>
      el(
        "section",
        "mt-2",
        el("p", "text-xs font-bold uppercase tracking-[0.2em] text-[#facc15]", `${sim.teams[inn.bat].name} ${inn.runs}/${inn.wkts} (${sim.overs(inn.balls)})`),
        scorecard(inn, sim.teams[inn.bat], sim.teams[1 - inn.bat], (b) => sim.overs(b)),
      ),
    );
    this.cardBox = el("div", "absolute inset-0 z-[15] grid place-items-center bg-black/70 p-3 text-white", el("div", "max-h-full w-full max-w-2xl overflow-auto rounded-xl border border-white/15 bg-[#0b0f18] p-4", ...inns, close));
    this.cardBox.setAttribute("data-testid", "cricket-card");
    this.host.appendChild(this.cardBox);
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.view || !this.sim) return;
    this.res.tick(dt, now, (k) => this.view?.setResolution(k));
    this.view.render(dt, this.prefs.cam, { aim: this.aim, target: this.target, shot: this.shotType });
    this.hud?.update(dt, { kind: this.kind, field: this.field, shot: this.shotType });
  }

  private finish(note?: string) {
    const sim = this.sim!;
    this.ended = true;
    this.loop.pause();
    const score = sim.score();
    const meIdx = Math.max(0, sim.opts.human);
    const rec = read<CricketRecord>(RECORD_KEY, { played: 0, won: 0, best: 0, highScore: 0, bestBowling: "", sixes: 0 });
    const mine = sim.innings.find((i) => i.bat === meIdx);
    const myTop = mine ? Math.max(0, ...mine.cards.map((c) => c.runs)) : 0;
    const theirs = sim.innings.find((i) => i.bat !== meIdx);
    const bestFig = theirs ? [...theirs.bowl.values()].sort((a, b) => b.wkts - a.wkts || a.runs - b.runs)[0] : undefined;
    if (!this.unranked) {
      rec.played++;
      if (sim.won) rec.won++;
      rec.best = Math.max(rec.best, score);
      rec.highScore = Math.max(rec.highScore, myTop);
      rec.sixes += sim.sixes;
      if (bestFig && (!rec.bestBowling || bestFig.wkts > Number(rec.bestBowling.split("/")[0]))) rec.bestBowling = `${bestFig.wkts}/${bestFig.runs}`;
      write(RECORD_KEY, rec);
    }
    let leagueLine = "";
    if (this.leagueGame && this.league && !note && sim.phase === "done") {
      recordPlayed(this.league, this.leagueGame, sim);
      advance(this.league);
      this.saveLeague();
      leagueLine = myStatus(this.league);
      this.leagueGame = null;
    }
    const final = { kind: "final" as const, score, durationMs: this.loop.activeMs, ranked: !this.unranked };
    const title = note ? "Match abandoned" : sim.opts.mode === "nets" ? "Nets session over" : sim.won === true ? "You won!" : sim.won === false ? "Beaten" : "Match tied";
    const vs = this.online ? `${this.online.names[0]} v ${this.online.names[1]} · online` : "";
    const box = el(
      "div",
      "absolute inset-0 z-20 grid place-items-center overflow-auto bg-black/80 p-4 text-white",
      el(
        "div",
        "w-full max-w-lg rounded-xl border border-white/15 bg-[#0b0f18] p-5 text-center",
        el("p", "text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", sim.opts.mode === "match" ? "Full time" : sim.opts.mode === "superover" ? "Super over" : "Nets"),
        el("p", "mt-1 font-display text-3xl font-black uppercase", title),
        el("p", "mt-1 text-sm text-white/70", note ?? sim.resultText),
        vs ? el("p", "mt-1 text-xs uppercase tracking-[0.25em] text-[#22d3ee]", vs) : el("span"),
        el("div", "mt-4 grid grid-cols-2 gap-2 text-left sm:grid-cols-4", stat("Your runs", sim.humanRuns), stat("Wickets", sim.humanWkts), stat("Sixes", sim.sixes), stat("Longest six", sim.longest ? `${sim.longest} m` : "–")),
        this.topCard(0),
        sim.innings[1] ? this.topCard(1) : el("div"),
        this.fullCards([0, 1]),
        leagueLine ? el("p", "mt-3 text-sm font-bold text-[#22d3ee]", `Blitz League: ${leagueLine}`) : el("span"),
        el("p", "mt-4 text-xs uppercase tracking-[0.25em] text-white/50", "Match score"),
        el("p", "font-display text-4xl font-black text-[#facc15]", String(score)),
        button("Continue", `${BTN} mt-4`, () => {
          box.remove();
          this.emitter.emit(final);
        }),
      ),
    );
    box.dataset.results = "";
    box.setAttribute("data-testid", "cricket-results");
    this.host.appendChild(box);
  }

  // ----------------------------------------------------------------- input

  private onKeyDown = (e: KeyboardEvent) => {
    const sim = this.sim;
    if (!sim || this.ended || !this.loop.isRunning) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "KeyC") {
      this.prefs.cam = this.prefs.cam === "broadcast" ? "batter" : "broadcast";
      write(PREFS_KEY, this.prefs);
    }
    if (sim.phase === "break" && (e.code === "Enter" || e.code === "Space")) this.inp.next = true;
    if (e.code === "KeyV") this.inp.review = true;
    if (e.code === "Tab") {
      e.preventDefault();
      this.toggleCard();
    }
    if (sim.humanBats) {
      if (e.code === "Space" || e.code === "KeyW") this.playShot(e.shiftKey ? "loft" : "ground");
      if (e.code === "KeyF" || e.code === "ArrowUp") this.playShot("loft");
      if (e.code === "KeyS" || e.code === "ArrowDown") this.playShot("defend");
      if (e.code === "KeyR") this.inp.run = true;
    } else if (sim.humanBowls) {
      if (e.code === "Space" || e.code === "Enter") this.inp.bowl = true;
      const kinds = sim.bowler.style === "spin" ? SPIN_KINDS : PACE_KINDS;
      const d = /^Digit([1-6])$/.exec(e.code);
      if (d && kinds[Number(d[1]) - 1]) this.kind = kinds[Number(d[1]) - 1];
      if (e.code === "KeyF") this.field = this.field === "attack" ? "balanced" : this.field === "balanced" ? "defend" : "attack";
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private clearInput = () => {
    this.keys.clear();
    this.drag = null;
  };

  private ndc(e: { clientX: number; clientY: number }) {
    const r = this.host.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }

  private aimAt(e: { clientX: number; clientY: number }) {
    if (!this.view || !this.sim) return;
    const n = this.ndc(e);
    const g = this.view.groundAt(n.x, n.y);
    if (!g) return;
    if (this.sim.humanBats) {
      // Aim from the batter toward the point under the pointer.
      const dz = g.z - 1.6;
      const dx = g.x - 0.2;
      if (Math.hypot(dx, dz) > 0.8) this.aim = (Math.atan2(dx, dz) * 180) / Math.PI;
    }
  }

  private onMouseMove = (e: MouseEvent) => {
    if (this.coarse) return;
    this.aimAt(e);
  };
  private onMouseDown = (e: MouseEvent) => {
    const sim = this.sim;
    if (!sim || this.coarse || e.target !== this.view?.canvas) return;
    if (sim.humanBats) {
      if (e.button === 2 || e.shiftKey) this.playShot("loft");
      else if (e.button === 0) this.playShot("ground");
    } else if (sim.humanBowls && sim.phase === "plan" && e.button === 0) this.setTarget(e);
  };

  private setTarget(e: { clientX: number; clientY: number }) {
    const n = this.ndc(e);
    const g = this.view?.groundAt(n.x, n.y);
    if (!g || g.z < 0 || g.z > PITCH - 3 || Math.abs(g.x) > 2.5) return false;
    this.target = { x: Math.max(-1.6, Math.min(1.2, g.x)), z: Math.max(0.5, Math.min(13, g.z)) };
    return true;
  }

  // Touch: drag to swing the aim; tap the pitch to set the bowling target.
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || !this.sim || e.target !== this.view?.canvas) return;
    if (this.sim.humanBowls && this.sim.phase === "plan") {
      this.setTarget(e);
      return;
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    // Drag left/right swings the aim (broadcast camera: screen left is the off side).
    this.aim = Math.max(-175, Math.min(175, this.aim + (e.clientX - this.drag.x) * 0.45));
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
  };
  private onPointerUp = (e: PointerEvent) => {
    if (this.drag && e.pointerId === this.drag.id) this.drag = null;
  };
}

const factory: GameFactory = () => new CricketGame();
export default factory;
