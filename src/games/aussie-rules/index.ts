import { Vector3 } from "three";
import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import { FootyAudio } from "./audio";
import { FootyHud, leaderLine } from "./hud";
import { FootyView, type CamMode, type TimeOfDay } from "./render";
import { finish as seasonFinish, ladder, nextGame, ordinal, parseSeason, premiers, recordResult, simulateMine, startSeason, type Season } from "./season";
import { clubById, CLUBS, FootySim, GOAL_X, KICK_STYLES, points, type Difficulty, type FootyInput, type KickStyle } from "./sim";
import { LEAGUES, loadClubEdits, NATIONAL, saveClubEdits, type ClubEdit } from "./clubs";
import { difficultyFor, matchRating, newCareer, nextSeason, parseCareer, recordMatch, retire, simulateMatch, spendPoint, toPro, type Career } from "./career";
import { careerCreate, careerHub, clubEditor, clubPicker, seasonHub } from "./menus";
import { rosterNames } from "./rosters";
import type { Awards } from "./season";
import { choice } from "../sports-kit/ui";
import type { Detail } from "./stadium";

const STICK_R = 52;
const PREFS_KEY = "zx-footy-prefs";
const RECORD_KEY = "zx-footy-record";
const SEASON_KEY = "zx-footy-season2";
const CAREER_KEY = "zx-footy-career";
const STYLES: KickStyle[] = ["punt", "torpedo", "snap"];

interface Prefs {
  mode: "exhibition" | "season" | "career" | "kicking";
  /** The men's or the women's competition. */
  comp: "men" | "women";
  /** Premiership season length (home-and-away rounds). */
  rounds: number;
  /** Kick aim: at the mouse pointer, or along your facing. */
  aim: "mouse" | "facing";
  club: string;
  weather: "fine" | "rain";
  rival: string;
  difficulty: Difficulty;
  minutes: number;
  tod: TimeOfDay;
  gfx: Detail;
  cam: CamMode;
}
interface FootyRecord {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  best: number;
  goals: number;
  flags?: number;
  /** Goalkicking challenge: best points. */
  kicking?: number;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: (Node | string)[]) {
  const n = document.createElement(tag);
  n.className = className;
  n.append(...children);
  return n;
}
function button(label: string, className: string, onClick: () => void) {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}
function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v && typeof v === "object" ? { ...fallback, ...v } : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // ignore
  }
}

const PRIMARY =
  "rounded-md bg-[#a3122c] px-6 py-3 font-display text-base font-black uppercase tracking-[0.2em] text-white shadow-[0_0_24px_#a3122c99] hover:brightness-110";

/**
 * Screamer: Aussie Rules. A full four-quarter, 18-a-side match on a floodlit
 * oval: you play the Harbour Hawks (the ball carrier, or the player nearest
 * the ball) against an AI side.
 */
class FootyGame implements GameModule {
  readonly slug = "aussie-rules";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private audio!: FootyAudio;
  private sim: FootySim | null = null;
  private view: FootyView | null = null;
  private hud: FootyHud | null = null;
  private touch: HTMLDivElement | null = null;
  private coarse = false;
  private prefs!: Prefs;
  private ended = false;
  private unranked = false;
  private lastFrame = 0;
  private frameAvg = 1 / 60;
  private resScale = 1;
  private resAt = 0;
  private overAt = 0;
  private idle = 0;
  private season: Season | null = null;
  private career: Career | null = null;
  private clubEdits: Record<string, ClubEdit> = {};
  /** What this match is: an exhibition, your premiership fixture, or a career game. */
  private matchMode: Prefs["mode"] = "exhibition";
  /** The mouse over the canvas (normalised device coordinates), for kick aim. */
  private pointer: { x: number; y: number } | null = null;
  /** This match is the season's Grand Final / a final, and its label. */
  private fixtureLabel = "";
  private styleBtn: HTMLButtonElement | null = null;
  /** A score on its way to review: what it was, and whether the replay's begun. */
  private review: { verdict: string; sub: string; t: number; started: boolean } | null = null;

  // Input.
  private keys = new Set<string>();
  private mouseKick = false;
  private touchKick = false;
  private touchSprint = false;
  private edges = { handball: false, leap: false, tackle: false, switchPlayer: false };
  private kickWasDown = false;
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private knob: HTMLDivElement | null = null;
  private kickBtn: HTMLButtonElement | null = null;
  private hbBtn: HTMLButtonElement | null = null;
  private fwd = new Vector3();

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.prefs = read<Prefs>(PREFS_KEY, { mode: "exhibition", comp: "men", rounds: 17, aim: this.coarse ? "facing" : "mouse", club: "geelong", weather: "fine", rival: "collingwood", difficulty: "pro", minutes: 4, tod: "night", gfx: this.coarse ? "low" : "high", cam: "tv" });
    if (!NATIONAL.some((c) => c.id === this.prefs.club)) this.prefs.club = "geelong";
    if (!NATIONAL.some((c) => c.id === this.prefs.rival) || this.prefs.rival === this.prefs.club) this.prefs.rival = NATIONAL.find((c) => c.id !== this.prefs.club)!.id;
    this.clubEdits = loadClubEdits();
    this.season = this.load(SEASON_KEY, parseSeason);
    this.career = this.load(CAREER_KEY, parseCareer);
    this.host = el("div", "absolute inset-0 overflow-hidden bg-[#05070c]");
    this.host.style.touchAction = "none";
    opts.root.appendChild(this.host);
    this.menu = el("div", "absolute inset-0 z-10 flex overflow-auto bg-[#05070c]/95 p-3 pb-14 text-white");
    opts.root.appendChild(this.menu);
    this.audio = new FootyAudio(opts.settings.sound, opts.settings.volume);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
      1000 / 60,
    );
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    this.host.addEventListener("mousedown", this.onMouseDown);
    this.host.addEventListener("mousemove", this.onMouseMove);
    this.host.addEventListener("mouseleave", () => (this.pointer = null));
    window.addEventListener("mouseup", this.onMouseUp);
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
    window.removeEventListener("mouseup", this.onMouseUp);
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
    const rec = read<FootyRecord>(RECORD_KEY, { played: 0, wins: 0, losses: 0, draws: 0, best: 0, goals: 0 });
    const p = this.prefs;
    const save = () => write(PREFS_KEY, this.prefs);
    const group = <T extends string | number>(label: string, items: { value: T; title: string; sub?: string }[], current: T, pick: (v: T) => void) =>
      choice(label, items, current, (v) => {
        pick(v);
        save();
      });
    const card = (title: string, ...body: Node[]) =>
      el("section", "flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left", el("h3", "text-[11px] font-bold uppercase tracking-[0.25em] text-[#facc15]", title), ...body);

    const controls = this.coarse
      ? "Left thumb runs (and aims) · hold KICK and release (longer = further) · STYLE · HANDBALL · KICK without the ball = LEAP · TACKLE · SWITCH (CALL in career) · SPRINT · CAM. Set shots: KICK to start the run-up, hold for power, tap again in the middle"
      : "WASD run · Shift sprint · aim with the mouse · hold Space / click to kick, release to let fly · R kick style · F / right-click handball · Space without the ball = leap · E tackle · Q switch (career: call for it) · C camera · Esc pause. Set shots: line up with the mouse, hold for the run-up and power, then tap when the needle's in the middle";

    // The mode's own panel.
    let modePanel: Node;
    let start: HTMLButtonElement | null = null;
    if (p.mode === "exhibition") {
      start = button("Bounce the ball", PRIMARY, () => void this.beginMatch());
      start.setAttribute("data-testid", "footy-start");
      modePanel = card(
        "Exhibition",
        el("p", "text-xs text-white/60", "Your club"),
        clubPicker(
          "Your club",
          NATIONAL.map((c) => c.id),
          p.club,
          (v) => {
            this.prefs.club = v;
            if (this.prefs.rival === v) this.prefs.rival = NATIONAL.find((c) => c.id !== v)!.id;
            save();
            this.showMenu();
          },
        ),
        el("p", "text-xs text-white/60", "Opponent"),
        clubPicker(
          "Opponent",
          NATIONAL.filter((c) => c.id !== p.club).map((c) => c.id),
          p.rival,
          (v) => ((this.prefs.rival = v), save()),
        ),
      );
    } else if (p.mode === "kicking") {
      start = button("Line up", PRIMARY, () => void this.beginMatch());
      start.setAttribute("data-testid", "footy-start");
      modePanel = card(
        "Goalkicking challenge",
        el("p", "text-xs text-white/70", `Ten set shots for your club's full forward: straight in front first, then longer and wider, out to the pockets. 6 for a goal (+1 from 35 m, +3 from 45 m), 1 for a behind. Mind the wind.${rec.kicking ? ` Your best: ${rec.kicking} points.` : ""}`),
        clubPicker(
          "Your club",
          NATIONAL.map((c) => c.id),
          p.club,
          (v) => ((this.prefs.club = v), save()),
        ),
      );
    } else if (p.mode === "season") {
      if (this.season) {
        modePanel = seasonHub(this.season, {
          play: () => void this.beginMatch(),
          sim: () => this.simSeasonGame(1),
          simRound: () => this.simSeasonGame(this.season?.stage === "home" ? this.season.rounds - this.season.round : 10),
          abandon: () => {
            if (!confirm("Abandon this season?")) return;
            this.season = null;
            write(SEASON_KEY, null);
            this.showMenu();
          },
        });
      } else {
        start = button("Start the season", PRIMARY, () => {
          this.season = startSeason({ league: "national", club: this.prefs.club, seed: Date.now() & 0x7fffffff, rounds: this.prefs.rounds, women: this.prefs.comp === "women" });
          write(SEASON_KEY, this.season);
          this.showMenu();
        });
        start.setAttribute("data-testid", "footy-start");
        modePanel = card(
          "Premiership season · National League",
          el("p", "text-xs text-white/70", "Eighteen clubs, a full home-and-away season, the final eight (the top four get the double chance) and the Grand Final. Play every game or sim the ones you want."),
          clubPicker(
            "Your club",
            NATIONAL.map((c) => c.id),
            p.club,
            (v) => ((this.prefs.club = v), save()),
          ),
          group(
            "Season length",
            [
              { value: 9, title: "Short", sub: "9 rounds" },
              { value: 17, title: "Standard", sub: "17 rounds: everyone once" },
              { value: 23, title: "Full", sub: "23 rounds, the real thing" },
            ],
            p.rounds,
            (v) => (this.prefs.rounds = v),
          ),
        );
      }
    } else {
      modePanel = this.career
        ? careerHub(this.career, {
            play: () => void this.beginMatch(),
            sim: () => this.simCareerGame(1),
            simRest: () => this.simCareerGame(60),
            spend: (a) => {
              if (this.career && spendPoint(this.career, a)) this.saveCareer();
              this.showMenu();
            },
            next: () => {
              if (!this.career) return;
              nextSeason(this.career, this.prefs.rounds);
              this.saveCareer();
              this.showMenu();
            },
            retire: () => {
              if (!this.career || !confirm("Retire now? Your career will end.")) return;
              retire(this.career);
              this.saveCareer();
              this.showMenu();
            },
            restart: () => {
              this.career = null;
              write(CAREER_KEY, null);
              this.showMenu();
            },
          })
        : careerCreate((o) => {
            this.career = newCareer({ ...o, seed: Date.now() & 0x7fffffff });
            this.saveCareer();
            this.showMenu();
          });
    }

    this.menu.replaceChildren(
      el(
        "div",
        "m-auto flex w-full max-w-2xl flex-col items-center gap-3",
        el(
          "div",
          "relative w-full overflow-hidden rounded-xl p-5 text-center",
          Object.assign(el("div", "absolute inset-0 opacity-70"), {
            ariaHidden: "true",
            style: "background: radial-gradient(circle at 20% 0%, #a3122c 0, transparent 55%), radial-gradient(circle at 80% 100%, #1a2d68 0, transparent 55%), linear-gradient(#0b3d1f, #05070c)",
          }),
          el("p", "relative text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", "Sports+"),
          el("p", "relative font-display text-5xl font-black italic tracking-tight sm:text-6xl", "SCREAMER"),
          el("p", "relative mt-1 text-[11px] font-bold uppercase tracking-[0.35em] text-white/80", "Aussie Rules · 18 a side · Four quarters"),
        ),
        card(
          "Your record",
          el("p", "text-sm", rec.played ? `${rec.wins} W · ${rec.losses} L · ${rec.draws} D · ${rec.goals} goals · best match ${rec.best} pts${rec.flags ? ` · ${rec.flags} premiership${rec.flags > 1 ? "s" : ""}` : ""}` : "No games yet. Pick a club and run out."),
        ),
        card(
          "Mode",
          group(
            "Mode",
            [
              { value: "exhibition" as const, title: "Exhibition", sub: "One match, any two clubs" },
              { value: "season" as const, title: "Premiership", sub: "A whole season and the finals" },
              { value: "career" as const, title: "Career", sub: "From the local footy to the big time" },
              { value: "kicking" as const, title: "Goalkicking", sub: "Ten set shots, wind and nerves" },
            ],
            p.mode,
            (v) => {
              this.prefs.mode = v;
              save();
              this.showMenu();
            },
          ),
        ),
        p.mode === "career" || (p.mode === "season" && this.season)
          ? el("span")
          : card(
              "Competition",
              group(
                "Competition",
                [
                  { value: "men" as const, title: "Men's", sub: "The National League" },
                  { value: "women" as const, title: "Women's", sub: "The same eighteen clubs, the women's game" },
                ],
                p.comp ?? "men",
                (v) => (this.prefs.comp = v),
              ),
            ),
        modePanel,
        ...(start ? [start] : []),
        el(
          "details",
          "w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left [&[open]>summary]:mb-2",
          el("summary", "cursor-pointer text-[11px] font-bold uppercase tracking-[0.25em] text-[#facc15]", "Match settings"),
          el(
            "div",
            "flex flex-col gap-2",
            group(
              "Difficulty",
              [
                { value: "easy" as const, title: "Rookie", sub: "Slower opposition, more time" },
                { value: "pro" as const, title: "Pro", sub: "An even contest" },
                { value: "legend" as const, title: "Legend", sub: "Quick, accurate, relentless" },
              ],
              p.difficulty,
              (v) => (this.prefs.difficulty = v),
            ),
            group(
              "Quarter length",
              [
                { value: 2, title: "2 min quarters", sub: "A quick game" },
                { value: 4, title: "4 min quarters", sub: "About 18 minutes" },
                { value: 8, title: "8 min quarters", sub: "The full experience" },
              ],
              p.minutes,
              (v) => (this.prefs.minutes = v),
            ),
            group(
              "Time",
              [
                { value: "night" as const, title: "Night", sub: "Under lights, the crowd up" },
                { value: "twilight" as const, title: "Twilight", sub: "Sunset over the stands" },
                { value: "day" as const, title: "Day", sub: "Blue sky, long shadows" },
              ],
              p.tod,
              (v) => (this.prefs.tod = v),
            ),
            group(
              "Weather",
              [
                { value: "fine" as const, title: "Fine", sub: "A dry deck" },
                { value: "rain" as const, title: "Rain", sub: "Greasy ball, skidding bounces" },
              ],
              p.weather,
              (v) => (this.prefs.weather = v),
            ),
            group(
              "Kick aim",
              [
                { value: "mouse" as const, title: "Mouse", sub: "Aim where you point" },
                { value: "facing" as const, title: "Facing", sub: "Where you're running, with assist" },
              ],
              p.aim,
              (v) => (this.prefs.aim = v),
            ),
            group(
              "Camera",
              [
                { value: "tv" as const, title: "Broadcast", sub: "High on the wing, like TV" },
                { value: "follow" as const, title: "Player", sub: "Behind your player (best in career)" },
              ],
              p.cam,
              (v) => (this.prefs.cam = v),
            ),
            group(
              "Graphics",
              [
                { value: "ultra" as const, title: "Ultra", sub: "Ambient occlusion, full crowd" },
                { value: "high" as const, title: "High", sub: "Soft shadows, bloom, sharpened" },
                { value: "low" as const, title: "Low", sub: "Faster on phones" },
              ],
              p.gfx,
              (v) => (this.prefs.gfx = v),
            ),
          ),
        ),
        clubEditor(this.clubEdits, (e) => {
          saveClubEdits(e);
        }),
        this.howToPlay(),
        el("p", "max-w-xl text-center text-[11px] text-white/50", controls),
      ),
    );
  }

  // --------------------------------------------------------------- season

  private load<T>(key: string, parse: (raw: unknown) => T | null): T | null {
    try {
      return parse(JSON.parse(localStorage.getItem(key) ?? "null"));
    } catch {
      return null;
    }
  }

  private saveSeason() {
    write(SEASON_KEY, this.season);
  }

  private saveCareer() {
    write(CAREER_KEY, this.career);
  }

  /** Sim your next `n` premiership games. */
  private simSeasonGame(n: number) {
    const s = this.season;
    if (!s) return;
    for (let i = 0; i < n && nextGame(s); i++) {
      const [us, them] = simulateMine(s);
      recordResult(s, us, them);
    }
    this.saveSeason();
    this.showMenu();
  }

  /** Sim your next `n` career games (stopping at the end of the season). */
  private simCareerGame(n: number) {
    const c = this.career;
    if (!c) return;
    for (let i = 0; i < n && c.stage === "season" && nextGame(c.season); i++) {
      const m = simulateMatch(c);
      recordMatch(c, m.line, m.us, m.them);
    }
    this.saveCareer();
    this.showMenu();
  }

  private howToPlay() {
    const item = (title: string, text: string) => el("li", "", el("strong", "text-white", `${title}: `), text);
    return el(
      "details",
      "w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left text-xs text-white/75 [&[open]>summary]:mb-2",
      el("summary", "cursor-pointer text-[11px] font-bold uppercase tracking-[0.25em] text-[#facc15]", "How to play · the rules"),
      el(
        "ul",
        "flex flex-col gap-1.5",
        item("Scoring", "Kick it between the two tall posts for a goal (6 points). Between a goal post and a short behind post, off any other part of the body, or touched on the way through: a behind (1)."),
        item("Disposal", "Kick or handball only; no throwing. Running with it, you bounce it every 15 m (automatic)."),
        item("Marks", "Catch a kick that's gone 15 m or more, on the full, and it's a mark: a free kick from where you took it. Leap on someone's back for a screamer."),
        item("Set shots", "After a mark or free within range, line up the goals, hold to charge and release. Run off your line (sprint) to play on."),
        item("Tackles", "Tackle the ball carrier. If they've had a chance to get rid of it, it's holding the ball: free kick to you. Otherwise, a ball-up."),
        item("Out of bounds", "Kicked out on the full: free kick to the other side. Otherwise the boundary umpire throws it back in."),
        item("Quarters", "Four quarters, ends change each break. If you mark before the siren, you get your kick after it."),
        item("Kicks", "R (or STYLE) switches kick: the drop punt is the reliable one; the torpedo spirals 70 m+ but sprays; the snap curls back in, so kick it from a tight angle and it bends through."),
        item("Set shots", "Line it up (the mouse or the stick; watch the wind), hold kick to run in and build power, release, then tap again as the accuracy needle crosses the green. Nerves after the siren make the needle quicker."),
        item("Kicking in play", "Aim with the mouse (or your facing). A gold ring shows the teammate you're kicking to; the white tick on the power bar is the power that lands it there. Hit it and the kick is truer."),
        item("Premiership", "Eighteen clubs at their real home bases, a 9, 17 or 23-round season, the final eight (top four get the double chance) and the Grand Final. Play or sim any game."),
        item("Career", "Start at 17 in the Local League. Good seasons get you to the State League and then drafted. You control only your player: Q (or CALL) calls for the ball. Earn skill points every game, chase the League Medal, captain your club, win flags."),
        item("Club editor", "Rename and recolour any club; edits stay on this device."),
        item("Votes", "After every match the umpires give 3-2-1 votes to the best three on the ground."),
        item("Leaderboard", "Your score: points, winning margin, marks, screamers and tackles, more on harder levels."),
      ),
    );
  }

  // ----------------------------------------------------------------- match

  private async beginMatch() {
    this.audio.unlock();
    this.menu.hidden = true;
    this.teardown();
    this.ended = false;
    const params = new URLSearchParams(window.location.search);
    const test = params.has("footy");
    const quick = params.get("footy") === "quick";
    this.unranked = test;
    const p = this.prefs;
    this.matchMode = p.mode;
    const career = p.mode === "career" && this.career?.stage === "season" ? this.career : null;
    if (p.mode === "career" && !career) this.matchMode = "exhibition";
    const ssn = career ? career.season : p.mode === "season" ? this.season : null;
    const ng = ssn ? nextGame(ssn) : null;
    if (!ng && this.matchMode !== "exhibition") this.matchMode = "exhibition";
    const home = clubById(ng ? ssn!.club : p.club);
    const rivalId = ng ? ng.opponent : p.rival === home.id ? CLUBS.find((c) => c.id !== home.id)!.id : p.rival;
    this.fixtureLabel = ng ? ng.label : "";
    if (career && ng) this.fixtureLabel = `${LEAGUES[career.league].name} · ${ng.label}`;
    const wet = p.weather === "rain";
    const kicking = p.mode === "kicking";
    if (kicking) {
      this.matchMode = "kicking";
      this.fixtureLabel = "Goalkicking challenge";
    }
    const women = ssn && !career ? !!ssn.women : !career && p.comp === "women";
    if (women) this.fixtureLabel = [this.fixtureLabel || "Exhibition", "Women's"].join(" · ");
    this.sim = new FootySim({
      women,
      names: [rosterNames(home.id, women), rosterNames(rivalId, women)],
      practice: kicking ? 10 : undefined,
      seed: Date.now() & 0x7fffffff,
      home,
      rival: clubById(rivalId),
      difficulty: career ? difficultyFor(career.league, p.difficulty) : p.difficulty,
      pro: career ? toPro(career) : undefined,
      quarterSeconds: kicking ? 600 : quick ? 20 : p.minutes * 60,
      wet,
    });
    if (test) {
      // Test hooks: the sim, and a fast-forward (the AI plays your side) for scripts.
      const w = window as unknown as { __footy?: FootySim; __footyAdvance?: (s: number) => void; __footyReplay?: () => void; __footyRender?: (n: number, dt: number) => void; __footyCelebrate?: () => void };
      w.__footy = this.sim;
      w.__footyReplay = () => this.view?.replayNow();
      w.__footyRender = (n: number, dt: number) => {
        for (let i = 0; i < n; i++) {
          this.view?.render(dt, this.prefs.cam);
          this.hud?.setReplay(!!this.view?.replaying);
          this.hud?.update(dt);
        }
      };
      w.__footyCelebrate = () => this.view?.celebrate(0);
      (w as unknown as { __footyPlay: (s: number) => void }).__footyPlay = (secs: number) => {
        const sim = this.sim;
        if (!sim) return;
        sim.autopilot = true;
        for (let i = 0; i < secs * 30; i++) {
          this.update(1 / 60);
          this.update(1 / 60);
          this.view?.render(1 / 30, this.prefs.cam);
        }
        sim.autopilot = false;
      };
      w.__footyAdvance = (secs: number) => {
        const sim = this.sim;
        if (!sim) return;
        sim.autopilot = true;
        for (let i = 0; i < secs * 60; i++) {
          this.view?.cancelReplay();
          this.update(1 / 60);
        }
        sim.autopilot = false;
        for (let i = 0; i < 6; i++) this.view?.render(0.5, this.prefs.cam);
      };
    }
    try {
      this.view = new FootyView(this.host, this.sim, p.gfx, p.tod, { wet, replay: test && params.get("footy") !== "replay" ? false : { window: 3.2, speed: 0.5 } });
    } catch {
      this.showMenu();
      this.menu.prepend(el("p", "w-full rounded bg-red-900/60 p-2 text-center text-sm", "3D graphics aren't available on this device (WebGL is off)."));
      this.sim = null;
      return;
    }
    this.hud = new FootyHud(this.host, this.sim, this.coarse, { label: [this.fixtureLabel, wet ? "Rain" : ""].filter(Boolean).join(" · ") || undefined });
    if (wet) this.audio.rain();
    if (this.coarse) this.buildTouch();
    this.overAt = 0;
    this.lastFrame = performance.now();
    this.loop.start();
    this.view.canvas.focus({ preventScroll: true });
  }

  private teardown() {
    this.hud?.destroy();
    this.hud = null;
    this.view?.destroy();
    this.view = null;
    this.touch?.remove();
    this.touch = null;
    this.sim = null;
    this.host.querySelector("[data-results]")?.remove();
  }

  private input(): FootyInput {
    const k = (...c: string[]) => c.some((x) => this.keys.has(x));
    let f = (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0);
    let s = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
    if (this.stick) {
      s = Math.max(-1, Math.min(1, (this.stick.x - this.stick.ox) / STICK_R));
      f = Math.max(-1, Math.min(1, -(this.stick.y - this.stick.oy) / STICK_R));
    }
    // Camera-relative: up the screen is away from the camera.
    const cam = this.view!.camera;
    const fwd = cam.getWorldDirection(this.fwd);
    let fx = fwd.x;
    let fz = fwd.z;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    let mx = fx * f - fz * s;
    let mz = fz * f + fx * s;
    const m = Math.hypot(mx, mz);
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    const kickDown = k("Space") || this.mouseKick || this.touchKick;
    const sim = this.sim!;
    const has = sim.ball.state === "held" && sim.ball.holder === sim.human;
    // Without the ball, the kick button is a leap (on the press).
    const leap = (!has && kickDown && !this.kickWasDown) || this.edges.leap;
    this.kickWasDown = kickDown;
    // Kick aim: the ground under the mouse.
    let aim: FootyInput["aim"] = null;
    if (this.prefs.aim === "mouse" && this.pointer && !this.coarse) aim = this.view!.groundAt(this.pointer.x, this.pointer.y);
    const inp: FootyInput = {
      aim,
      mx,
      mz,
      sprint: k("ShiftLeft", "ShiftRight") || this.touchSprint || (!!this.stick && Math.hypot(s, f) > 0.95),
      kick: has && kickDown,
      handball: this.edges.handball,
      leap,
      tackle: this.edges.tackle,
      switchPlayer: this.edges.switchPlayer,
    };
    this.edges = { handball: false, leap: false, tackle: false, switchPlayer: false };
    return inp;
  }

  private update(dt: number) {
    const sim = this.sim;
    if (!sim || !this.view) return;
    // The instant replay holds the match (any button skips it).
    if (this.view.replaying) {
      const k = this.input();
      if (k.kick || k.handball || k.tackle || k.leap) this.view.cancelReplay();
      if (this.review) this.review.started = true;
      this.hud?.setReplay(this.view.replaying, this.review ? "SCORE REVIEW" : null);
      return;
    }
    this.hud?.setReplay(false);
    if (this.review) {
      // The verdict once the replay's done (or straight away if there isn't one).
      this.review.t += dt;
      if (this.review.started || this.review.t > 2.2) {
        this.hud?.shout(this.review.verdict, this.review.sub, 2.6, this.review.verdict === "GOAL" ? "#facc15" : "#e5e7eb");
        this.review = null;
      }
    }
    const inp = this.input();
    const moving = Math.hypot(inp.mx, inp.mz) > 0.1;
    this.idle = moving ? 0 : this.idle + dt;
    sim.assist = this.idle > 1.2;
    sim.step(dt, inp);
    for (const e of sim.events) {
      // Close to the post or touched: the score goes upstairs while the replay runs.
      if ((e.kind === "goal" || e.kind === "behind") && e.close && !sim.practice) {
        this.review = { verdict: e.kind === "goal" ? "GOAL" : "BEHIND", sub: e.kind === "goal" ? "Score review: it's a goal, all clear" : e.touched ? "Score review: touched off the hands" : e.post ? "Score review: it hit the post" : "Score review: just wide of the post", t: 0, started: false };
        if (e.kind === "behind") this.view.replayNow();
      }
      if (e.kind === "practice") {
        const t = sim.practiceTotals();
        this.hud?.shout(e.result === "goal" ? "GOAL!" : e.result === "behind" ? "BEHIND" : "MISSED", `Shot ${e.shot} of 10 · +${e.points} · ${t.points} points`, 2.4, e.result === "goal" ? "#facc15" : "#ffffff");
      }
      this.view.onEvent(e);
      this.hud?.onEvent(e);
      this.audio.onEvent(e, (t) => t === 0);
      if (e.kind === "over") {
        this.overAt = performance.now();
        if (this.fixtureLabel.endsWith("Grand Final") && points(sim.score[0]) > points(sim.score[1])) {
          this.view.celebrate(0);
          this.hud?.shout("PREMIERS!", `The ${sim.clubs[0].name} have won the flag`, 8, "#facc15");
          this.overAt += 6000;
        }
      }
    }
    sim.events.length = 0;
    // Crowd tension: the ball inside 50, a set shot, a pack.
    const b = sim.ball;
    const near = Math.max(0, 1 - (GOAL_X - Math.abs(b.x)) / 50);
    this.audio.setExcitement(Math.min(1, near * 0.7 + (sim.phase === "set" ? 0.3 : 0)), dt);
    this.emitter.progress(sim.matchScore(), performance.now());
    if (sim.phase === "over" && !this.ended && this.overAt && performance.now() - this.overAt > 3500) this.finish();
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.view || !this.sim) return;
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    if (now - this.resAt > 2500) {
      this.resAt = now;
      // Adaptive resolution: hold ~50 fps without going soft.
      if (this.frameAvg > 1 / 42 && this.resScale > 0.75) this.resScale = Math.max(0.75, this.resScale - 0.1);
      else if (this.frameAvg < 1 / 57 && this.resScale < 1) this.resScale = Math.min(1, this.resScale + 0.05);
      this.view.setResolution(this.resScale);
    }
    this.view.render(dt, this.prefs.cam);
    const f = this.view.camera.getWorldDirection(this.fwd);
    this.hud?.setCamera(f.x, f.z);
    this.hud?.update(dt);
    if (this.kickBtn && this.hbBtn) {
      const has = this.sim.ball.state === "held" && this.sim.ball.holder === this.sim.human;
      this.kickBtn.textContent = has ? "KICK" : "LEAP";
      this.hbBtn.textContent = has ? "HAND\nBALL" : "TACKLE";
    }
  }

  /** The goalkicking challenge's card. */
  private finishKicking() {
    const sim = this.sim!;
    this.ended = true;
    this.loop.pause();
    const t = sim.practiceTotals();
    const score = sim.matchScore();
    const rec = read<FootyRecord>(RECORD_KEY, { played: 0, wins: 0, losses: 0, draws: 0, best: 0, goals: 0 });
    if (!this.unranked) {
      rec.kicking = Math.max(rec.kicking ?? 0, t.points);
      write(RECORD_KEY, rec);
    }
    const final = { kind: "final" as const, score, durationMs: this.loop.activeMs, ranked: !this.unranked };
    const g = sim.goalOf(0);
    const shots = (sim.practice?.shots ?? []).map((x, i) =>
      el(
        "li",
        "flex justify-between gap-2 rounded bg-white/5 px-2 py-1",
        el("span", "", `${i + 1}. ${Math.round(Math.hypot(g.x - x.x, x.z))} m, ${Math.round((Math.abs(Math.atan2(x.z, Math.abs(g.x - x.x))) * 180) / Math.PI)}°`),
        el("span", x.result === "goal" ? "font-black text-[#facc15]" : "text-white/70", x.result === "goal" ? `Goal +${x.points}` : x.result === "behind" ? "Behind +1" : "Missed"),
      ),
    );
    const box = el(
      "div",
      "absolute inset-0 z-20 grid place-items-center overflow-auto bg-black/80 p-4 text-white",
      el(
        "div",
        "w-full max-w-md rounded-xl border border-white/15 bg-[#0b0f18] p-5 text-center",
        el("p", "text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", "Goalkicking challenge"),
        el("p", "mt-1 font-display text-3xl font-black uppercase", `${t.goals} goals, ${t.behinds} behinds`),
        el("p", "mt-1 text-sm text-white/70", `${t.points} points from ten shots${rec.kicking ? ` · best ${rec.kicking}` : ""}`),
        el("ol", "mt-3 flex flex-col gap-1 text-left text-xs", ...shots),
        el("p", "mt-4 text-xs uppercase tracking-[0.25em] text-white/50", "Score"),
        el("p", "font-display text-4xl font-black text-[#facc15]", String(score)),
        button("Continue", `${PRIMARY} mt-4`, () => {
          box.remove();
          this.emitter.emit(final);
        }),
      ),
    );
    box.dataset.results = "";
    box.setAttribute("data-testid", "footy-results");
    this.host.appendChild(box);
  }

  private finish() {
    const sim = this.sim!;
    if (sim.practice) return this.finishKicking();
    this.ended = true;
    this.loop.pause();
    const us = points(sim.score[0]);
    const them = points(sim.score[1]);
    const score = sim.matchScore();
    const rec = read<FootyRecord>(RECORD_KEY, { played: 0, wins: 0, losses: 0, draws: 0, best: 0, goals: 0 });
    if (!this.unranked) {
      rec.played++;
      if (us > them) rec.wins++;
      else if (us < them) rec.losses++;
      else rec.draws++;
      rec.best = Math.max(rec.best, us);
      rec.goals += sim.score[0].goals;
      if (this.fixtureLabel.endsWith("Grand Final") && us > them) rec.flags = (rec.flags ?? 0) + 1;
      write(RECORD_KEY, rec);
    }
    // The umpires' votes, and the season moves on.
    const votes = sim.votes();
    let seasonLine = "";
    const after = (s: Season) => {
      const pos = ladder(s).findIndex((r) => r.id === s.club) + 1;
      const ng = nextGame(s);
      return s.stage === "done"
        ? premiers(s)
          ? "Premiers! Your name's on the cup."
          : `Season over: ${clubById(s.premier ?? "").name} won the flag. You finished: ${seasonFinish(s)}.`
        : ng
          ? `${s.stage === "home" ? `${pos}${ordinal(pos)} on the ladder · ` : ""}Next: ${ng.label} v ${clubById(ng.opponent).name}`
          : "";
    };
    let careerLine = "";
    if (this.matchMode === "season" && this.season && this.fixtureLabel && !this.unranked) {
      const mine: { [name: string]: number } = {};
      for (const v of votes) if (sim.players[v.id].team === 0) mine[sim.players[v.id].name] = v.votes;
      // Everyone's votes and goals for the league's count.
      const awards: Awards = { votes: {}, goals: {} };
      for (const v of votes) awards.votes[`${sim.clubs[sim.players[v.id].team].id}:${sim.players[v.id].name}`] = v.votes;
      for (const pl of sim.players) if (pl.st.goals) awards.goals[`${sim.clubs[pl.team].id}:${pl.name}`] = pl.st.goals;
      recordResult(this.season, us, them, mine, awards);
      this.saveSeason();
      seasonLine = after(this.season);
    } else if (this.matchMode === "career" && this.career && !this.unranked) {
      const c = this.career;
      const me = sim.you;
      const st = me.st;
      const rating = matchRating(st);
      const v = votes.find((x) => x.id === me.id)?.votes ?? 0;
      const before = c.points;
      recordMatch(c, { goals: st.goals, behinds: st.behinds, kicks: st.kicks, handballs: st.handballs, marks: st.marks, tackles: st.tackles, hitouts: st.hitouts, rating, votes: v }, us, them);
      this.saveCareer();
      careerLine = `${me.name}: ${st.kicks + st.handballs} disposals · ${st.marks} marks · ${st.goals}.${st.behinds} · ${st.tackles} tackles · rating ${rating.toFixed(1)}${v ? ` · ${v} vote${v > 1 ? "s" : ""}` : ""} · +${c.points - before} skill points`;
      seasonLine = c.stage === "offseason" ? `Season over: ${c.history[c.history.length - 1].finish}. Off to the off-season.` : after(c.season);
    }
    const final = { kind: "final" as const, score, durationMs: this.loop.activeMs, ranked: !this.unranked };
    const s = sim.stats[0];
    const stat = (k: string, v: string | number) => el("div", "rounded bg-white/5 px-2 py-1.5", el("p", "text-[10px] uppercase tracking-wider text-white/50", k), el("p", "text-lg font-black", String(v)));
    const box = el(
      "div",
      "absolute inset-0 z-20 grid place-items-center overflow-auto bg-black/80 p-4 text-white",
      el(
        "div",
        "w-full max-w-lg rounded-xl border border-white/15 bg-[#0b0f18] p-5 text-center",
        el("p", "text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", "Full time"),
        el("p", "mt-1 font-display text-3xl font-black uppercase", us > them ? `${sim.clubs[0].name.split(" ").slice(-1)[0]} win!` : us < them ? `${sim.clubs[1].name} win` : "A draw!"),
        el("p", "mt-1 text-sm text-white/70", `${sim.clubs[0].name} ${FootySim.fmt(sim.score[0])} · ${sim.clubs[1].name} ${FootySim.fmt(sim.score[1])} · ${leaderLine(sim)}`),
        el(
          "div",
          "mt-4 grid grid-cols-3 gap-2 text-left sm:grid-cols-4",
          stat("Kicks", s.kicks),
          stat("Handballs", s.handballs),
          stat("Marks", s.marks),
          stat("Contested", s.contested),
          stat("Screamers", s.screamers),
          stat("Tackles", s.tackles),
          stat("Hit-outs", s.hitouts),
          stat("Inside 50s", s.inside50),
        ),
        el(
          "div",
          "mt-4 rounded-lg border border-[#facc15]/30 bg-[#facc15]/5 p-3 text-left",
          el("p", "text-[10px] font-bold uppercase tracking-[0.3em] text-[#facc15]", "Best on ground · 3-2-1 votes"),
          ...votes.map((v) => {
            const pl = sim.players[v.id];
            const st = pl.st;
            const line = [`${st.kicks + st.handballs} disposals`, st.marks ? `${st.marks} marks` : "", st.goals ? `${st.goals} goal${st.goals > 1 ? "s" : ""}` : "", st.tackles ? `${st.tackles} tackles` : "", st.hitouts > 4 ? `${st.hitouts} hit-outs` : ""].filter(Boolean).join(", ");
            return el("p", "mt-1 text-sm", el("span", "mr-2 inline-block w-4 font-black text-[#facc15]", String(v.votes)), el("strong", "", `#${pl.number} ${pl.name}`), el("span", "text-white/60", ` (${sim.clubs[pl.team].short}) · ${line}`));
          }),
        ),
        ...(careerLine ? [el("p", "mt-3 rounded bg-white/5 p-2 text-left text-sm", careerLine)] : []),
        ...(seasonLine ? [el("p", "mt-3 text-sm font-bold text-[#facc15]", seasonLine)] : []),
        el("p", "mt-4 text-xs uppercase tracking-[0.25em] text-white/50", "Match score"),
        el("p", "font-display text-4xl font-black text-[#facc15]", String(score)),
        button("Continue", `${PRIMARY} mt-4`, () => {
          box.remove();
          this.emitter.emit(final);
        }),
      ),
    );
    box.dataset.results = "";
    box.setAttribute("data-testid", "footy-results");
    this.host.appendChild(box);
  }

  // ----------------------------------------------------------------- input

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.sim || this.ended || !this.loop.isRunning) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "KeyF") this.edges.handball = true;
    if (e.code === "KeyE") this.edges.tackle = true;
    if (e.code === "KeyQ") this.edges.switchPlayer = true;
    if (e.code === "KeyC") this.toggleCam();
    if (e.code === "KeyR") this.cycleStyle();
  };

  private cycleStyle() {
    const sim = this.sim;
    if (!sim) return;
    sim.kickStyle = STYLES[(STYLES.indexOf(sim.kickStyle) + 1) % STYLES.length];
    this.hud?.shout(KICK_STYLES[sim.kickStyle].name.toUpperCase(), KICK_STYLES[sim.kickStyle].sub, 1.1);
    if (this.styleBtn) this.styleBtn.textContent = sim.kickStyle === "punt" ? "PUNT" : sim.kickStyle === "torpedo" ? "TORP" : "SNAP";
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private clearInput = () => {
    this.keys.clear();
    this.mouseKick = this.touchKick = this.touchSprint = false;
    this.stick = null;
    if (this.knob) this.knob.style.transform = "";
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.sim || this.coarse) return;
    if (e.button === 0) this.mouseKick = true;
    if (e.button === 2) {
      const sim = this.sim;
      const has = sim.ball.state === "held" && sim.ball.holder === sim.human;
      if (has) this.edges.handball = true;
      else this.edges.tackle = true;
    }
  };
  private onMouseMove = (e: MouseEvent) => {
    const r = this.host.getBoundingClientRect();
    this.pointer = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseKick = false;
  };
  private toggleCam() {
    this.prefs.cam = this.prefs.cam === "tv" ? "follow" : "tv";
    write(PREFS_KEY, this.prefs);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || !this.touch) return;
    if (e.clientX < window.innerWidth * 0.45 && !this.stick) {
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    }
  };
  private onPointerMove = (e: PointerEvent) => {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
      const dx = Math.max(-STICK_R, Math.min(STICK_R, e.clientX - this.stick.ox));
      const dy = Math.max(-STICK_R, Math.min(STICK_R, e.clientY - this.stick.oy));
      if (this.knob) this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  };
  private onPointerUp = (e: PointerEvent) => {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      if (this.knob) this.knob.style.transform = "";
    }
  };

  private buildTouch() {
    const btn = (label: string, cls: string, aria: string) => {
      const b = el("button", `pointer-events-auto absolute grid select-none place-items-center whitespace-pre border-2 border-white/40 bg-black/45 text-[10px] font-black leading-tight text-white active:bg-white/25 ${cls}`, label);
      b.type = "button";
      b.setAttribute("aria-label", aria);
      return b;
    };
    const tap = (b: HTMLButtonElement, f: () => void) =>
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.vibrate?.(8);
        f();
      });
    const hold = (b: HTMLButtonElement, set: (v: boolean) => void) => {
      tap(b, () => set(true));
      for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => set(false));
    };
    const kick = btn("KICK", "right-4 bottom-4 h-20 w-20 rounded-full border-[#facc15] text-sm", "Kick (hold to charge) or leap");
    hold(kick, (v) => (this.touchKick = v));
    const hb = btn("HAND\nBALL", "right-[6.5rem] bottom-4 h-16 w-16 rounded-full", "Handball or tackle");
    tap(hb, () => {
      const sim = this.sim;
      if (!sim) return;
      const has = sim.ball.state === "held" && sim.ball.holder === sim.human;
      if (has) this.edges.handball = true;
      else this.edges.tackle = true;
    });
    const sw = btn(this.sim?.lockHuman !== null && this.sim?.lockHuman !== undefined ? "CALL" : "SWITCH", "right-4 bottom-[6.5rem] h-12 w-16 rounded-xl", "Switch player");
    tap(sw, () => (this.edges.switchPlayer = true));
    const sprint = btn("SPRINT", "right-[5.5rem] bottom-[5.75rem] h-12 w-16 rounded-xl", "Sprint (hold)");
    hold(sprint, (v) => (this.touchSprint = v));
    const cam = btn("CAM", "right-[9.5rem] top-2 h-10 w-14 rounded-lg", "Change camera");
    tap(cam, () => this.toggleCam());
    const style = btn("PUNT", "right-[9.75rem] bottom-4 h-12 w-12 rounded-full", "Kick style");
    tap(style, () => this.cycleStyle());
    this.styleBtn = style;
    this.kickBtn = kick;
    this.hbBtn = hb;
    const base = el("div", "pointer-events-none absolute bottom-6 left-6 h-28 w-28 rounded-full border-2 border-white/25 bg-black/25");
    this.knob = el("div", "absolute left-1/2 top-1/2 -ml-6 -mt-6 h-12 w-12 rounded-full border-2 border-white/60 bg-white/20");
    base.append(this.knob);
    this.touch = el("div", "pointer-events-none absolute inset-0 z-[6]", base, kick, hb, sw, sprint, cam, style);
    this.host.appendChild(this.touch);
  }
}

const factory: GameFactory = () => new FootyGame();
export default factory;
