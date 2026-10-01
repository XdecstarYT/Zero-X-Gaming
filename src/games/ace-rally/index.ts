import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import type { Detail, TimeOfDay } from "../sports-kit/look";
import { BTN, button, card, choice, el, hero, howTo, primaryButton, read, ResolutionGovernor, stat, write } from "../sports-kit/ui";
import { TennisAudio } from "./audio";
import { TennisHud } from "./hud";
import { KITS, TennisView, type TennisCam } from "./render";
import { FORMATS, type MatchFormat } from "./score";
import { LEVELS, NO_INPUT, RIVALS, SURFACES, TennisSim, type Difficulty, type ShotKind, type Surface, type TennisInput } from "./sim";

const STICK_R = 52;
const PREFS_KEY = "zx-tennis-prefs";
const RECORD_KEY = "zx-tennis-record";
const GREEN = "#15803d";

interface Prefs {
  draw: "men" | "women";
  rival: string;
  difficulty: Difficulty;
  surface: Surface;
  format: MatchFormat;
  tod: TimeOfDay;
  gfx: Detail;
  cam: TennisCam;
  footwork: "manual" | "assisted";
  umpire: boolean;
}
interface TennisRecord {
  played: number;
  wins: number;
  aces: number;
  winners: number;
  fastest: number;
  best: number;
}


/**
 * Ace Rally: singles on Centre Court at the Zero X Open. Serve with a toss
 * and a timed hit, then topspin, slice, lob and drop your way through rallies
 * against a touring pro on hard, clay or grass.
 */
class TennisGame implements GameModule {
  readonly slug = "ace-rally";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private audio!: TennisAudio;
  private sim: TennisSim | null = null;
  private view: TennisView | null = null;
  private hud: TennisHud | null = null;
  private touch: HTMLDivElement | null = null;
  private coarse = false;
  private prefs!: Prefs;
  private ended = false;
  private unranked = false;
  private lastFrame = 0;
  private res = new ResolutionGovernor();
  private overAt = 0;

  private keys = new Set<string>();
  private shot: ShotKind | null = null;
  private servePress = false;
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private knob: HTMLDivElement | null = null;
  private mainBtn: HTMLButtonElement | null = null;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.prefs = read<Prefs>(PREFS_KEY, {
      draw: "men",
      rival: RIVALS.men[0].id,
      difficulty: "pro",
      surface: "hard",
      format: "set",
      tod: "night",
      gfx: this.coarse ? "low" : "high",
      cam: "broadcast",
      footwork: this.coarse ? "assisted" : "manual",
      umpire: true,
    });
    this.host = el("div", "absolute inset-0 overflow-hidden bg-[#05070c]");
    this.host.style.touchAction = "none";
    opts.root.appendChild(this.host);
    this.menu = el("div", "absolute inset-0 z-10 flex overflow-auto bg-[#05070c]/95 p-3 pb-14 text-white");
    opts.root.appendChild(this.menu);
    this.audio = new TennisAudio(opts.settings.sound, opts.settings.volume, this.prefs.umpire);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
      1000 / 60,
    );
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
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
    const rec = read<TennisRecord>(RECORD_KEY, { played: 0, wins: 0, aces: 0, winners: 0, fastest: 0, best: 0 });
    const p = this.prefs;
    const save = () => write(PREFS_KEY, this.prefs);
    const rivals = () =>
      choice(
        "Opponent",
        RIVALS[p.draw].map((r) => ({ value: r.id, title: `${r.name} (${r.country})`, sub: r.style })),
        RIVALS[p.draw].some((r) => r.id === p.rival) ? p.rival : RIVALS[p.draw][0].id,
        (v) => ((this.prefs.rival = v), save()),
      );
    let rivalGroup = rivals();
    const start = primaryButton("Walk out on court", GREEN, () => void this.begin());
    start.setAttribute("data-testid", "tennis-start");
    const controls = this.coarse
      ? "Left thumb moves (and aims at contact) · SERVE / TOPSPIN · SLICE · LOB · DROP · CAM"
      : "WASD / arrows move, and aim as you hit · Space or click: toss, serve, topspin · K / right-click slice · L lob · I drop · C camera · Esc pause";
    this.menu.replaceChildren(
      el(
        "div",
        "m-auto flex w-full max-w-2xl flex-col items-center gap-3",
        hero("Sports+", "ACE RALLY", "Singles · Centre Court · The Zero X Open", "radial-gradient(circle at 20% 0%, #15803d 0, transparent 55%), radial-gradient(circle at 80% 100%, #1d4ed8 0, transparent 55%), linear-gradient(#0f2e1d, #05070c)"),
        card("Your record", el("p", "text-sm", rec.played ? `${rec.wins}–${rec.played - rec.wins} · ${rec.aces} aces · ${rec.winners} winners · fastest serve ${rec.fastest} km/h · best ${rec.best}` : "No matches yet. The crowd is waiting.")),
        card(
          "The draw",
          choice(
            "Draw",
            [
              { value: "men" as const, title: "Men's singles" },
              { value: "women" as const, title: "Women's singles" },
            ],
            p.draw,
            (v) => {
              this.prefs.draw = v;
              this.prefs.rival = RIVALS[v][0].id;
              save();
              const next = rivals();
              rivalGroup.replaceWith(next);
              rivalGroup = next;
            },
          ),
          rivalGroup,
          choice(
            "Difficulty",
            (Object.keys(LEVELS) as Difficulty[]).map((d) => ({ value: d, title: LEVELS[d].name, sub: d === "rookie" ? "Slower, more errors" : d === "pro" ? "Tour level" : "Fast, deep, rarely misses" })),
            p.difficulty,
            (v) => ((this.prefs.difficulty = v), save()),
          ),
        ),
        card(
          "Match",
          choice(
            "Format",
            (Object.keys(FORMATS) as MatchFormat[]).map((f) => ({ value: f, title: FORMATS[f].name, sub: FORMATS[f].sub })),
            p.format,
            (v) => ((this.prefs.format = v), save()),
          ),
          choice(
            "Surface",
            (Object.keys(SURFACES) as Surface[]).map((s) => ({ value: s, title: SURFACES[s].name, sub: SURFACES[s].sub })),
            p.surface,
            (v) => ((this.prefs.surface = v), save()),
          ),
          choice(
            "Time",
            [
              { value: "night" as const, title: "Night session", sub: "Under the lights" },
              { value: "twilight" as const, title: "Twilight", sub: "Long shadows" },
              { value: "day" as const, title: "Day", sub: "Bright sun" },
            ],
            p.tod,
            (v) => ((this.prefs.tod = v), save()),
          ),
          choice(
            "Footwork",
            [
              { value: "manual" as const, title: "Manual", sub: "You run to every ball" },
              { value: "assisted" as const, title: "Assisted", sub: "You pick and time the shot" },
            ],
            p.footwork,
            (v) => ((this.prefs.footwork = v), save()),
          ),
          choice(
            "Camera",
            [
              { value: "broadcast" as const, title: "Broadcast", sub: "High behind the baseline" },
              { value: "player" as const, title: "Player", sub: "Low, behind you" },
            ],
            p.cam,
            (v) => ((this.prefs.cam = v), save()),
          ),
          choice(
            "Graphics",
            [
              { value: "ultra" as const, title: "Ultra", sub: "Ambient occlusion, packed stands" },
              { value: "high" as const, title: "High", sub: "Soft shadows, bloom" },
              { value: "low" as const, title: "Low", sub: "Faster on phones" },
            ],
            p.gfx,
            (v) => ((this.prefs.gfx = v), save()),
          ),
          choice(
            "Umpire's voice",
            [
              { value: 1, title: "On", sub: "Calls and the score, spoken" },
              { value: 0, title: "Off" },
            ],
            p.umpire ? 1 : 0,
            (v) => ((this.prefs.umpire = v === 1), save()),
          ),
        ),
        start,
        howTo([
          ["Serving", "Press once to toss, again to hit. Hit at the top of the toss (the green on the meter) for a big first serve; aim wide or down the T with left/right. Two faults lose the point."],
          ["Shots", "Press a shot as the ball comes to you: about a third to half a second early is perfect. Topspin drives, slice stays low, a lob goes over a net-rusher, a drop shot dies after the net. Overheads become smashes."],
          ["Aiming", "Whatever direction you're holding when you hit is where it goes: left/right across the court, forward for deep, back for short angles."],
          ["Scoring", "15, 30, 40, game; deuce and advantage; six games (by two) for a set, tiebreak at 6–6. Close calls go to Hawk-Eye."],
          ["Surfaces", "Clay is slow and high-bouncing, grass fast and low, hard court in between."],
          ["Score", "Points, games and sets won, aces and winners, a big bonus for the match, more on harder levels."],
        ]),
        el("p", "max-w-xl text-center text-[11px] text-white/50", controls),
      ),
    );
  }

  // ----------------------------------------------------------------- match

  private begin() {
    this.audio.unlock();
    this.menu.hidden = true;
    this.teardown();
    this.ended = false;
    const params = new URLSearchParams(window.location.search);
    const test = params.has("tennis");
    this.unranked = test;
    const p = this.prefs;
    const rival = RIVALS[p.draw].find((r) => r.id === p.rival) ?? RIVALS[p.draw][0];
    this.sim = new TennisSim({
      seed: Date.now() & 0x7fffffff,
      difficulty: p.difficulty,
      surface: p.surface,
      format: test ? "tiebreak" : p.format,
      rival,
      you: this.opts.playerName?.slice(0, 14) || "You",
      autoRun: p.footwork === "assisted",
    });
    if (test) {
      const w = window as unknown as { __tennis?: TennisSim; __tennisAdvance?: (s: number) => void };
      w.__tennis = this.sim;
      w.__tennisAdvance = (secs: number) => {
        const sim = this.sim;
        if (!sim) return;
        sim.autopilot = true;
        for (let i = 0; i < secs * 60; i++) this.update(1 / 60);
        sim.autopilot = false;
        for (let i = 0; i < 4; i++) this.view?.render(0.25, this.prefs.cam);
      };
    }
    try {
      this.view = new TennisView(this.host, this.sim, p.gfx, p.tod, KITS[p.draw]);
    } catch {
      this.showMenu();
      this.menu.prepend(el("p", "w-full rounded bg-red-900/60 p-2 text-center text-sm", "3D graphics aren't available on this device (WebGL is off)."));
      this.sim = null;
      return;
    }
    this.hud = new TennisHud(this.host, this.sim, this.coarse);
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

  private input(): TennisInput {
    const k = (...c: string[]) => c.some((x) => this.keys.has(x));
    let fwd = (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0);
    let right = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
    if (this.stick) {
      right = Math.max(-1, Math.min(1, (this.stick.x - this.stick.ox) / STICK_R));
      fwd = Math.max(-1, Math.min(1, -(this.stick.y - this.stick.oy) / STICK_R));
    }
    const inp: TennisInput = { ...NO_INPUT, mx: fwd, mz: right, ax: right, ay: fwd, shot: this.shot, serve: this.servePress };
    this.shot = null;
    this.servePress = false;
    return inp;
  }

  /** The main button: serve when it's your serve, otherwise topspin. */
  private main() {
    const s = this.sim;
    if (!s) return;
    if ((s.phase === "serve" || s.phase === "toss") && s.server === 0) this.servePress = true;
    else this.shot = "topspin";
  }

  private update(dt: number) {
    const sim = this.sim;
    if (!sim || !this.view) return;
    sim.step(dt, this.input());
    for (const e of sim.events) {
      this.view.onEvent(e);
      this.hud?.onEvent(e);
      this.audio.onEvent(e, sim.names);
      if (e.kind === "over") this.overAt = performance.now();
    }
    sim.events.length = 0;
    const pr = sim.score.pressure();
    this.audio.setExcitement(sim.phase === "rally" ? Math.min(1, 0.2 + sim.rally * 0.06) : pr ? 0.5 : 0.05, dt);
    this.emitter.progress(sim.matchScore(), performance.now());
    if (sim.phase === "over" && !this.ended && this.overAt && performance.now() - this.overAt > 4000) this.finish();
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.view || !this.sim) return;
    this.res.tick(dt, now, (k) => this.view?.setResolution(k));
    this.view.render(dt, this.prefs.cam);
    this.hud?.update(dt);
    if (this.mainBtn) this.mainBtn.textContent = (this.sim.phase === "serve" || this.sim.phase === "toss") && this.sim.server === 0 ? "SERVE" : "TOPSPIN";
  }

  private finish() {
    const sim = this.sim!;
    this.ended = true;
    this.loop.pause();
    const score = sim.matchScore();
    const won = sim.score.winner === 0;
    const st = sim.stats[0];
    const rec = read<TennisRecord>(RECORD_KEY, { played: 0, wins: 0, aces: 0, winners: 0, fastest: 0, best: 0 });
    if (!this.unranked) {
      rec.played++;
      if (won) rec.wins++;
      rec.aces += st.aces;
      rec.winners += st.winners;
      rec.fastest = Math.max(rec.fastest, st.fastestServe);
      rec.best = Math.max(rec.best, score);
      write(RECORD_KEY, rec);
    }
    const final = { kind: "final" as const, score, durationMs: this.loop.activeMs, ranked: !this.unranked };
    const pct = st.firstServes ? `${Math.round((st.firstIn / st.firstServes) * 100)}%` : "–";
    const box = el(
      "div",
      "absolute inset-0 z-20 grid place-items-center overflow-auto bg-black/80 p-4 text-white",
      el(
        "div",
        "w-full max-w-lg rounded-xl border border-white/15 bg-[#0b0f18] p-5 text-center",
        el("p", "text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", "Game, set and match"),
        el("p", "mt-1 font-display text-3xl font-black uppercase", won ? "Champion!" : `${sim.names[1]} wins`),
        el("p", "mt-1 text-sm text-white/70", `${sim.names[0]} ${sim.score.line(0)}`),
        el(
          "div",
          "mt-4 grid grid-cols-2 gap-2 text-left sm:grid-cols-4",
          stat("Points won", st.points),
          stat("Aces", st.aces),
          stat("Winners", st.winners),
          stat("Errors", st.errors),
          stat("Double faults", st.doubleFaults),
          stat("1st serve in", pct),
          stat("Fastest serve", st.fastestServe ? `${st.fastestServe} km/h` : "–"),
          stat("Longest rally", st.longestRally),
        ),
        el("p", "mt-4 text-xs uppercase tracking-[0.25em] text-white/50", "Match score"),
        el("p", "font-display text-4xl font-black text-[#facc15]", String(score)),
        button("Continue", `${BTN} mt-4`, () => {
          box.remove();
          this.emitter.emit(final);
        }),
      ),
    );
    box.dataset.results = "";
    box.setAttribute("data-testid", "tennis-results");
    this.host.appendChild(box);
  }

  // ----------------------------------------------------------------- input

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.sim || this.ended || !this.loop.isRunning) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "Space" || e.code === "KeyJ") this.main();
    if (e.code === "KeyK") this.shot = "slice";
    if (e.code === "KeyL" || e.code === "KeyE") this.shot = "lob";
    if (e.code === "KeyI" || e.code === "KeyQ") this.shot = "drop";
    if (e.code === "KeyC") this.toggleCam();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private clearInput = () => {
    this.keys.clear();
    this.stick = null;
    if (this.knob) this.knob.style.transform = "";
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.sim || this.coarse) return;
    if (e.button === 0) this.main();
    if (e.button === 2) this.shot = "slice";
  };
  private toggleCam() {
    this.prefs.cam = this.prefs.cam === "broadcast" ? "player" : "broadcast";
    write(PREFS_KEY, this.prefs);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || !this.touch) return;
    if (e.clientX < window.innerWidth * 0.45 && !this.stick) this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
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
    const btn = (label: string, cls: string, aria: string, f: () => void) => {
      const b = el("button", `pointer-events-auto absolute grid select-none place-items-center border-2 border-white/40 bg-black/45 text-[10px] font-black text-white active:bg-white/25 ${cls}`, label);
      b.type = "button";
      b.setAttribute("aria-label", aria);
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.vibrate?.(8);
        f();
      });
      return b;
    };
    const main = btn("SERVE", "right-4 bottom-4 h-20 w-20 rounded-full border-[#facc15] text-xs", "Serve or topspin", () => this.main());
    const slice = btn("SLICE", "right-[6.5rem] bottom-4 h-14 w-14 rounded-full", "Slice", () => (this.shot = "slice"));
    const lob = btn("LOB", "right-4 bottom-[6.25rem] h-14 w-14 rounded-full", "Lob", () => (this.shot = "lob"));
    const drop = btn("DROP", "right-[5.75rem] bottom-[5.25rem] h-12 w-12 rounded-full", "Drop shot", () => (this.shot = "drop"));
    const cam = btn("CAM", "right-[9.5rem] top-2 h-10 w-14 rounded-lg", "Change camera", () => this.toggleCam());
    this.mainBtn = main;
    const base = el("div", "pointer-events-none absolute bottom-6 left-6 h-28 w-28 rounded-full border-2 border-white/25 bg-black/25");
    this.knob = el("div", "absolute left-1/2 top-1/2 -ml-6 -mt-6 h-12 w-12 rounded-full border-2 border-white/60 bg-white/20");
    base.append(this.knob);
    this.touch = el("div", "pointer-events-none absolute inset-0 z-[6]", base, main, slice, lob, drop, cam);
    this.host.appendChild(this.touch);
  }
}

const factory: GameFactory = () => new TennisGame();
export default factory;
