import { Vector3 } from "three";
import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import { FootyAudio } from "./audio";
import { FootyHud, leaderLine } from "./hud";
import { FootyView, type CamMode, type TimeOfDay } from "./render";
import { clubName, ladder, nextGame, premiers, recordResult, startSeason, type Season } from "./season";
import { clubById, CLUBS, FootySim, GOAL_X, KICK_STYLES, points, type Difficulty, type FootyInput, type KickStyle } from "./sim";
import type { Detail } from "./stadium";

const STICK_R = 52;
const PREFS_KEY = "zx-footy-prefs";
const RECORD_KEY = "zx-footy-record";
const SEASON_KEY = "zx-footy-season";
const STYLES: KickStyle[] = ["punt", "torpedo", "snap"];

interface Prefs {
  mode: "exhibition" | "season";
  club: string;
  weather: "fine" | "rain";
  rival: string;
  difficulty: Difficulty;
  minutes: number;
  tod: TimeOfDay;
  gfx: Detail;
  cam: CamMode;
}
interface Record {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  best: number;
  goals: number;
  flags?: number;
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

const BTN =
  "rounded-md border-2 border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:border-[#facc15] focus-visible:outline-2 focus-visible:outline-[#facc15]";
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
  /** This match is the season's Grand Final / a final, and its label. */
  private fixtureLabel = "";
  private styleBtn: HTMLButtonElement | null = null;

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
    this.prefs = read<Prefs>(PREFS_KEY, { mode: "exhibition", club: "hawks", weather: "fine", rival: "sharks", difficulty: "pro", minutes: 4, tod: "night", gfx: this.coarse ? "low" : "high", cam: "tv" });
    this.season = this.loadSeason();
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
    const rec = read<Record>(RECORD_KEY, { played: 0, wins: 0, losses: 0, draws: 0, best: 0, goals: 0 });
    const p = this.prefs;
    const save = () => write(PREFS_KEY, this.prefs);
    const group = <T extends string | number>(label: string, items: { value: T; title: string; sub?: string }[], current: T, pick: (v: T) => void) => {
      const wrap = el("div", "grid w-full gap-2 sm:grid-cols-3");
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", label);
      const buttons = items.map((it) => {
        const b = button("", `${BTN} text-left`, () => {
          pick(it.value);
          save();
          buttons.forEach((x) => {
            const on = x.dataset.value === String(it.value);
            x.setAttribute("aria-pressed", String(on));
            x.style.borderColor = on ? "#facc15" : "";
          });
        });
        b.dataset.value = String(it.value);
        b.append(el("span", "block font-bold", it.title), el("span", "block text-[11px] font-normal text-white/60", it.sub ?? ""));
        const on = it.value === current;
        b.setAttribute("aria-pressed", String(on));
        if (on) b.style.borderColor = "#facc15";
        return b;
      });
      wrap.append(...buttons);
      return wrap;
    };
    const card = (title: string, ...body: Node[]) =>
      el("section", "flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left", el("h3", "text-[11px] font-bold uppercase tracking-[0.25em] text-[#facc15]", title), ...body);

    const controls = this.coarse
      ? "Left thumb runs · hold KICK and release (longer = further) · HANDBALL · KICK without the ball = LEAP for a mark · TACKLE · SWITCH · SPRINT · CAM"
      : "WASD run · Shift sprint · hold Space / click to kick, release to let fly · R kick style (drop punt, torpedo, snap) · F / right-click handball · Space without the ball = leap for a mark · E tackle · Q switch player · C camera · Esc pause";
    const ng = p.mode === "season" && this.season ? nextGame(this.season) : null;
    const start = button(
      p.mode === "season" ? (this.season ? (ng ? `${ng.label}: v ${clubName(ng.opponent)}` : "New season") : `Start the season with the ${clubName(p.club).split(" ").slice(-1)[0]}`) : "Bounce the ball",
      PRIMARY,
      () => {
        if (p.mode === "season" && (!this.season || !ng)) {
          this.season = startSeason(this.prefs.club, Date.now() & 0x7fffffff);
          this.saveSeason();
          this.showMenu();
          return;
        }
        void this.beginMatch();
      },
    );
    start.setAttribute("data-testid", "footy-start");
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
              { value: "season" as const, title: "Premiership season", sub: "7 rounds, finals, a Grand Final" },
            ],
            p.mode,
            (v) => {
              this.prefs.mode = v;
              save();
              this.showMenu();
            },
          ),
          p.mode === "season" && this.season ? this.seasonPanel() : group(
            "Your club",
            CLUBS.map((c) => ({ value: c.id, title: c.name, sub: c.short })),
            p.club,
            (v) => {
              this.prefs.club = v;
              if (this.prefs.rival === v) this.prefs.rival = CLUBS.find((c) => c.id !== v)!.id;
              save();
              this.showMenu();
            },
          ),
          ...(p.mode === "exhibition"
            ? [
                group(
                  "Opponent",
                  CLUBS.filter((c) => c.id !== p.club).map((c) => ({ value: c.id, title: c.name, sub: c.short })),
                  p.rival === p.club ? CLUBS.find((c) => c.id !== p.club)!.id : p.rival,
                  (v) => (this.prefs.rival = v),
                ),
              ]
            : []),
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
        ),
        card(
          "Match",
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
            "Camera",
            [
              { value: "tv" as const, title: "Broadcast", sub: "High on the wing, like TV" },
              { value: "follow" as const, title: "Player", sub: "Behind your player" },
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
        start,
        this.howToPlay(),
        el("p", "max-w-xl text-center text-[11px] text-white/50", controls),
      ),
    );
  }

  // --------------------------------------------------------------- season

  private loadSeason(): Season | null {
    try {
      const s = JSON.parse(localStorage.getItem(SEASON_KEY) ?? "null") as Season | null;
      return s && s.v === 1 && Array.isArray(s.fixtures) ? s : null;
    } catch {
      return null;
    }
  }

  private saveSeason() {
    write(SEASON_KEY, this.season);
  }

  /** The season hub: the ladder, your next game, or how it finished. */
  private seasonPanel() {
    const s = this.season!;
    const rows = ladder(s);
    const table = el("table", "w-full text-xs tabular-nums");
    table.setAttribute("data-testid", "footy-ladder");
    table.append(el("tr", "text-[10px] uppercase tracking-wider text-white/50", ...["", "Club", "P", "W", "L", "D", "%", "Pts"].map((h, i) => el("th", i < 2 ? "py-0.5 text-left" : "px-1 text-right", h))));
    rows.forEach((r, i) => {
      const mine = r.id === s.club;
      const c = clubById(r.id);
      const chip = el("span", "mr-1.5 inline-block h-3 w-1.5 rounded-sm align-middle");
      chip.style.background = `linear-gradient(${c.guernsey} 0 40%, ${c.hoop} 40% 60%, ${c.guernsey} 60%)`;
      table.append(
        el(
          "tr",
          `${mine ? "bg-[#facc15]/15 font-bold text-[#facc15]" : ""} ${i === 3 ? "border-b border-dashed border-white/25" : ""}`,
          el("td", "w-5 py-0.5 text-white/50", String(i + 1)),
          el("td", "py-0.5", chip, c.name),
          ...[r.played, r.won, r.lost, r.drawn, r.pct.toFixed(1), r.points].map((v) => el("td", "px-1 text-right", String(v))),
        ),
      );
    });
    const ng = nextGame(s);
    const status = s.stage === "done" ? (premiers(s) ? `PREMIERS! The ${clubName(s.club)} have won the flag.` : `Season over. ${clubName(s.premier ?? "")} are the premiers.`) : ng ? `Next: ${ng.label}, ${ng.fixture.home === s.club ? "home" : "away"} v ${clubName(ng.opponent)}` : "";
    const finals = s.finals.length
      ? el("p", "text-[11px] text-white/70", s.finals.map((f) => `${f.round > 7 ? "GF" : "SF"}: ${clubById(f.home).short} ${f.result ? `${f.result[0]}–${f.result[1]}` : "v"} ${clubById(f.away).short}`).join(" · "))
      : el("span");
    const votes = Object.entries(s.votes).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return el(
      "div",
      "flex flex-col gap-2",
      el("p", "text-sm font-bold", status),
      table,
      finals,
      votes.length ? el("p", "text-[11px] text-white/70", `Club champion count: ${votes.map(([n, v]) => `${n} ${v}`).join(", ")}`) : el("span"),
      button("Abandon season", `${BTN} self-start text-xs`, () => {
        if (!confirm("Abandon this season?")) return;
        this.season = null;
        write(SEASON_KEY, null);
        this.showMenu();
      }),
    );
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
        item("Premiership season", "Pick your club: seven rounds against the other seven clubs, a ladder (4 points a win, then percentage), the top four into the finals, then the Grand Final. Win it and lift the cup."),
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
    const ng = p.mode === "season" && this.season ? nextGame(this.season) : null;
    const home = clubById(ng ? this.season!.club : p.club);
    const rivalId = ng ? ng.opponent : p.rival === home.id ? CLUBS.find((c) => c.id !== home.id)!.id : p.rival;
    this.fixtureLabel = ng ? ng.label : "";
    const wet = p.weather === "rain";
    this.sim = new FootySim({
      seed: Date.now() & 0x7fffffff,
      home,
      rival: clubById(rivalId),
      difficulty: p.difficulty,
      quarterSeconds: quick ? 20 : p.minutes * 60,
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
    const inp: FootyInput = {
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
      this.hud?.setReplay(this.view.replaying);
      return;
    }
    this.hud?.setReplay(false);
    const inp = this.input();
    const moving = Math.hypot(inp.mx, inp.mz) > 0.1;
    this.idle = moving ? 0 : this.idle + dt;
    sim.assist = this.idle > 1.2;
    sim.step(dt, inp);
    for (const e of sim.events) {
      this.view.onEvent(e);
      this.hud?.onEvent(e);
      this.audio.onEvent(e, (t) => t === 0);
      if (e.kind === "over") {
        this.overAt = performance.now();
        if (this.fixtureLabel === "Grand Final" && points(sim.score[0]) > points(sim.score[1])) {
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
    this.hud?.update(dt);
    if (this.kickBtn && this.hbBtn) {
      const has = this.sim.ball.state === "held" && this.sim.ball.holder === this.sim.human;
      this.kickBtn.textContent = has ? "KICK" : "LEAP";
      this.hbBtn.textContent = has ? "HAND\nBALL" : "TACKLE";
    }
  }

  private finish() {
    const sim = this.sim!;
    this.ended = true;
    this.loop.pause();
    const us = points(sim.score[0]);
    const them = points(sim.score[1]);
    const score = sim.matchScore();
    const rec = read<Record>(RECORD_KEY, { played: 0, wins: 0, losses: 0, draws: 0, best: 0, goals: 0 });
    if (!this.unranked) {
      rec.played++;
      if (us > them) rec.wins++;
      else if (us < them) rec.losses++;
      else rec.draws++;
      rec.best = Math.max(rec.best, us);
      rec.goals += sim.score[0].goals;
      if (this.fixtureLabel === "Grand Final" && us > them) rec.flags = (rec.flags ?? 0) + 1;
      write(RECORD_KEY, rec);
    }
    // The umpires' votes, and the season moves on.
    const votes = sim.votes();
    let seasonLine = "";
    if (this.season && this.fixtureLabel && !this.unranked) {
      const mine: { [name: string]: number } = {};
      for (const v of votes) if (sim.players[v.id].team === 0) mine[sim.players[v.id].name] = v.votes;
      recordResult(this.season, us, them, mine);
      this.saveSeason();
      const s = this.season;
      const pos = ladder(s).findIndex((r) => r.id === s.club) + 1;
      const ng = nextGame(s);
      seasonLine =
        s.stage === "done"
          ? premiers(s)
            ? "Premiers! Your name's on the cup."
            : `Season over: ${clubName(s.premier ?? "")} won the flag.`
          : ng
            ? `${s.stage === "home" ? `${pos}${["th", "st", "nd", "rd"][pos] ?? "th"} on the ladder · ` : ""}Next: ${ng.label} v ${clubName(ng.opponent)}`
            : "";
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
    const sw = btn("SWITCH", "right-4 bottom-[6.5rem] h-12 w-16 rounded-xl", "Switch player");
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
