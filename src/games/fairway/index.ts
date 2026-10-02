import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import type { Detail, TimeOfDay } from "../sports-kit/look";
import { BTN, button, card, choice, el, hero, howTo, primaryButton, read, ResolutionGovernor, stat, write } from "../sports-kit/ui";
import { COURSES, courseById } from "./course";
import { FairwayAudio } from "./audio";
import { FairwayHud } from "./hud";
import { FairwayView } from "./render";
import { GolfSim, LEVELS, type Difficulty, type GolfInput, type Mode } from "./sim";

const PREFS_KEY = "zx-fairway-prefs";
const RECORD_KEY = "zx-fairway-record";
const GREEN = "#15803d";

interface Prefs {
  mode: Mode;
  course: string;
  holes: number;
  difficulty: Difficulty;
  tod: TimeOfDay;
  gfx: Detail;
}
interface GolfRecord {
  rounds: number;
  wins: number;
  /** Best round to par (9 holes), null until one's finished. */
  best: number | null;
  birdies: number;
  eagles: number;
  aces: number;
  ctpBest: number;
}

const fmtPar = (n: number) => (n === 0 ? "E" : n > 0 ? `+${n}` : String(n));

/**
 * Fairway: golf on two original courses, a windswept links and a gum-lined
 * parkland. Stroke play against a field of touring pros, or closest to the
 * pin on a par 3. Aim, pick a club, and swing on the three-press meter.
 */
class FairwayGame implements GameModule {
  readonly slug = "fairway";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private audio!: FairwayAudio;
  private sim: GolfSim | null = null;
  private view: FairwayView | null = null;
  private hud: FairwayHud | null = null;
  private touch: HTMLDivElement | null = null;
  private coarse = false;
  private prefs!: Prefs;
  private ended = false;
  private unranked = false;
  private lastFrame = 0;
  private res = new ResolutionGovernor();
  private overAt = 0;
  private keys = new Set<string>();
  private press = false;
  private club = 0;
  private touchAim = 0;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.prefs = read<Prefs>(PREFS_KEY, { mode: "stroke", course: COURSES[0].id, holes: 9, difficulty: "pro", tod: "day", gfx: this.coarse ? "low" : "high" });
    this.host = el("div", "absolute inset-0 overflow-hidden bg-[#05070c]");
    this.host.style.touchAction = "none";
    opts.root.appendChild(this.host);
    this.menu = el("div", "absolute inset-0 z-10 flex overflow-auto bg-[#05070c]/95 p-3 pb-14 text-white");
    opts.root.appendChild(this.menu);
    this.audio = new FairwayAudio(opts.settings.sound, opts.settings.volume, 0.035);
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
    this.teardown();
    this.menu.remove();
    this.host.remove();
    this.audio.destroy();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  // ------------------------------------------------------------------ menu

  private record() {
    return read<GolfRecord>(RECORD_KEY, { rounds: 0, wins: 0, best: null, birdies: 0, eagles: 0, aces: 0, ctpBest: 0 });
  }

  private showMenu() {
    this.menu.hidden = false;
    const rec = this.record();
    const p = this.prefs;
    const save = () => write(PREFS_KEY, this.prefs);
    const start = primaryButton("Tee off", GREEN, () => void this.begin());
    start.setAttribute("data-testid", "golf-start");
    const controls = this.coarse
      ? "◀ ▶ aim · − + club · tap SWING three times: start, power, accuracy"
      : "A / D (or ← →) aim · W / S (or ↑ ↓) club · Space or click: start, power, accuracy · Esc pause";
    this.menu.replaceChildren(
      el(
        "div",
        "m-auto flex w-full max-w-2xl flex-col items-center gap-3",
        hero("Sports+", "FAIRWAY", "Links and parkland golf · Stroke play · Closest to the pin", "radial-gradient(circle at 20% 0%, #15803d 0, transparent 55%), radial-gradient(circle at 80% 100%, #0e7490 0, transparent 55%), linear-gradient(#173d22, #05070c)"),
        card(
          "Your record",
          el(
            "p",
            "text-sm",
            rec.rounds ? `${rec.wins} wins in ${rec.rounds} rounds · best ${rec.best === null ? "–" : fmtPar(rec.best)} · ${rec.birdies} birdies · ${rec.eagles} eagles · ${rec.aces} aces` : "No rounds yet. The first tee's waiting.",
          ),
        ),
        card(
          "Round",
          choice(
            "Mode",
            [
              { value: "stroke" as const, title: "Stroke play", sub: "Against a field of 11 touring pros" },
              { value: "ctp" as const, title: "Closest to the pin", sub: "Five balls at a par 3" },
            ],
            p.mode,
            (v) => ((this.prefs.mode = v), save()),
          ),
          choice(
            "Course",
            COURSES.map((c) => ({ value: c.id, title: c.name, sub: c.place })),
            p.course,
            (v) => ((this.prefs.course = v), save()),
          ),
          choice(
            "Holes",
            [
              { value: 3, title: "3 holes", sub: "A quick loop" },
              { value: 9, title: "9 holes", sub: "The full nine" },
            ],
            p.holes,
            (v) => ((this.prefs.holes = v), save()),
          ),
          choice(
            "Difficulty",
            (Object.keys(LEVELS) as Difficulty[]).map((d) => ({
              value: d,
              title: LEVELS[d].name,
              sub: d === "amateur" ? "Slow meter, light wind" : d === "pro" ? "The real thing" : "Fast meter, big wind, a hot field",
            })),
            p.difficulty,
            (v) => ((this.prefs.difficulty = v), save()),
          ),
          choice(
            "Time",
            [
              { value: "day" as const, title: "Day", sub: "Bright, clear morning" },
              { value: "twilight" as const, title: "Golden hour", sub: "Long shadows, low sun" },
            ],
            p.tod === "night" ? "twilight" : p.tod,
            (v) => ((this.prefs.tod = v), save()),
          ),
          choice(
            "Graphics",
            [
              { value: "ultra" as const, title: "Ultra", sub: "Ambient occlusion, dense grass" },
              { value: "high" as const, title: "High", sub: "Grass, gallery, soft shadows" },
              { value: "low" as const, title: "Low", sub: "Faster on phones" },
            ],
            p.gfx,
            (v) => ((this.prefs.gfx = v), save()),
          ),
        ),
        start,
        howTo([
          ["The swing", "Press once to start the backswing. Press again to set the power as the meter rises (past the full mark is an overswing: more distance, less control). Press a third time as it comes back, on the white line."],
          ["Accuracy", "On the line flies straight. Early leaves the face open: it starts right and fades or slices. Late closes it: left and drawing or hooking."],
          ["Clubs", "Your caddie picks a club and line for each shot; change them if you know better. The ring shows where a full swing lands without wind."],
          ["Wind and lies", "Wind pushes the ball around, more the higher it flies. Rough and sand cost distance and spin; trees knock it down; water costs a shot and OB costs stroke and distance."],
          ["Putting", "The arrows on the green run downhill. The meter's full mark is the stroke length shown; W/S changes it. Aim off for the break."],
          ["Scoring", "Stableford points for every hole (2 for par, 3 for a birdie...), a bonus for where you finish and 1,000 for winning."],
        ]),
        el("p", "max-w-xl text-center text-[11px] text-white/50", controls),
      ),
    );
  }

  // ----------------------------------------------------------------- round

  private begin() {
    this.audio.unlock();
    this.menu.hidden = true;
    this.teardown();
    this.ended = false;
    const params = new URLSearchParams(window.location.search);
    const test = params.has("fairway");
    this.unranked = test;
    const p = this.prefs;
    this.sim = new GolfSim({ course: courseById(p.course), mode: p.mode, holes: p.holes, difficulty: p.difficulty, seed: test ? 4242 : Date.now() & 0x7fffffff });
    if (test) {
      // Test hooks: the sim, a fast-forward with the autopilot, and a direct hit.
      const w = window as unknown as { __golf?: GolfSim; __golfAdvance?: (s: number) => void; __golfHit?: (power: number, acc?: number) => void };
      w.__golf = this.sim;
      w.__golfAdvance = (secs: number) => {
        const sim = this.sim;
        if (!sim) return;
        sim.autopilot = true;
        for (let i = 0; i < secs * 60; i++) this.update(1 / 60);
        sim.autopilot = false;
        this.view?.skipIntro();
        for (let i = 0; i < 4; i++) this.view?.render(0.25);
      };
      w.__golfHit = (power: number, acc = 0) => this.sim?.hitNow(power, acc);
    }
    try {
      this.view = new FairwayView(this.host, this.sim, p.gfx, p.tod);
    } catch {
      this.showMenu();
      this.menu.prepend(el("p", "w-full rounded bg-red-900/60 p-2 text-center text-sm", "3D graphics aren't available on this device (WebGL is off)."));
      this.sim = null;
      return;
    }
    this.hud = new FairwayHud(this.host, this.sim, this.coarse, () => this.view?.lie ?? null);
    if (this.coarse) this.buildTouch();
    // The first hole's announcement, and the fly-over.
    for (const e of this.sim.events) {
      this.view.onEvent(e);
      this.hud.onEvent(e);
    }
    this.sim.events.length = 0;
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

  private input(): GolfInput {
    const k = (...c: string[]) => c.some((x) => this.keys.has(x));
    // Right on screen is -x from behind the ball, a smaller heading.
    const aim = ((k("KeyA", "ArrowLeft") ? 1 : 0) - (k("KeyD", "ArrowRight") ? 1 : 0) + this.touchAim) * (k("ShiftLeft", "ShiftRight") ? 0.25 : 1);
    const inp = { aim, club: this.club, press: this.press };
    this.press = false;
    this.club = 0;
    return inp;
  }

  private update(dt: number) {
    const sim = this.sim;
    if (!sim || !this.view) return;
    sim.step(dt, this.input());
    for (const e of sim.events) {
      this.view.onEvent(e);
      this.hud?.onEvent(e);
      this.audio.onEvent(e);
      if (e.kind === "over") this.overAt = performance.now();
    }
    sim.events.length = 0;
    this.audio.tick(dt);
    this.audio.setExcitement(sim.phase === "flight" ? 0.3 : 0.05, dt);
    this.emitter.progress(sim.score(), performance.now());
    if (sim.phase === "over" && !this.ended && this.overAt && performance.now() - this.overAt > 3000) this.finish();
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.view || !this.sim) return;
    this.res.tick(dt, now, (k) => this.view?.setResolution(k));
    this.view.render(dt);
    this.hud?.update(dt);
  }

  private finish() {
    const sim = this.sim!;
    this.ended = true;
    this.loop.pause();
    const score = sim.score();
    const rec = this.record();
    const me = sim.field[0];
    const unders = me.card.map((s, i) => sim.holes[i].par - s);
    if (!this.unranked) {
      if (sim.opts.mode === "stroke") {
        rec.rounds++;
        if (sim.won) rec.wins++;
        if (sim.holes.length === 9) rec.best = rec.best === null ? sim.toPar() : Math.min(rec.best, sim.toPar());
        rec.birdies += unders.filter((u) => u === 1).length;
        rec.eagles += unders.filter((u) => u >= 2).length;
        rec.aces += me.card.filter((s) => s === 1).length;
      } else {
        rec.aces += sim.ctp.filter((c) => c.dist === 0).length;
        rec.ctpBest = Math.max(rec.ctpBest, score);
      }
      write(RECORD_KEY, rec);
    }
    const final = { kind: "final" as const, score, durationMs: this.loop.activeMs, ranked: !this.unranked };
    const stroke = sim.opts.mode === "stroke";
    const best = sim.ctp.filter((c) => Number.isFinite(c.dist)).sort((a, b) => a.dist - b.dist)[0];
    const pos = sim.position();
    const box = el(
      "div",
      "absolute inset-0 z-20 grid place-items-center overflow-auto bg-black/80 p-4 text-white",
      el(
        "div",
        "w-full max-w-lg rounded-xl border border-white/15 bg-[#0b1410] p-5 text-center",
        el("p", "text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", stroke ? `${sim.opts.course.name} · ${sim.holes.length} holes` : `Closest to the pin · ${sim.opts.course.name}`),
        el("p", "mt-1 font-display text-3xl font-black uppercase", stroke ? (sim.won ? "Champion!" : `Finished ${pos}${["th", "st", "nd", "rd"][pos % 10 > 3 || Math.floor(pos / 10) === 1 ? 0 : pos % 10]}`) : best ? `Best: ${best.dist === 0 ? "in the hole!" : `${best.dist.toFixed(1)} m`}` : "No ball on the green"),
        stroke
          ? el(
              "div",
              "mt-4 grid grid-cols-2 gap-2 text-left sm:grid-cols-4",
              stat("To par", fmtPar(sim.toPar())),
              stat("Strokes", me.card.reduce((a, b) => a + b, 0)),
              stat("Points", sim.points()),
              stat("Birdies+", unders.filter((u) => u >= 1).length),
            )
          : el("div", "mt-4 grid grid-cols-5 gap-2 text-left", ...sim.ctp.map((c, i) => stat(`Ball ${i + 1}`, c.dist === 0 ? "Ace" : Number.isFinite(c.dist) ? `${c.dist.toFixed(1)}m` : "–"))),
        el("p", "mt-4 text-xs uppercase tracking-[0.25em] text-white/50", "Score"),
        el("p", "font-display text-4xl font-black text-[#facc15]", String(score)),
        button("Continue", `${BTN} mt-4`, () => {
          box.remove();
          this.emitter.emit(final);
        }),
      ),
    );
    box.dataset.results = "";
    box.setAttribute("data-testid", "golf-results");
    this.host.appendChild(box);
  }

  // ----------------------------------------------------------------- input

  private doPress() {
    if (!this.sim) return;
    this.view?.skipIntro();
    this.audio.unlock();
    this.press = true;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.sim || this.ended || !this.loop.isRunning) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "Enter") this.doPress();
    if (e.code === "KeyW" || e.code === "ArrowUp") this.club = -1;
    if (e.code === "KeyS" || e.code === "ArrowDown") this.club = 1;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private clearInput = () => {
    this.keys.clear();
    this.touchAim = 0;
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.sim || this.coarse || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    this.doPress();
  };

  private buildTouch() {
    const btn = (label: string, cls: string, aria: string, down: () => void, up?: () => void) => {
      const b = el("button", `pointer-events-auto grid select-none place-items-center rounded-full border-2 border-white/40 bg-black/45 font-black text-white active:bg-white/25 ${cls}`, label);
      b.type = "button";
      b.setAttribute("aria-label", aria);
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        down();
      });
      if (up) for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => up());
      return b;
    };
    const swing = btn("SWING", "h-24 w-24 border-4 border-[#facc15] text-base", "Swing", () => {
      navigator.vibrate?.(10);
      this.doPress();
    });
    const left = btn("◀", "h-14 w-14 text-xl", "Aim left", () => (this.touchAim = 1), () => (this.touchAim = 0));
    const right = btn("▶", "h-14 w-14 text-xl", "Aim right", () => (this.touchAim = -1), () => (this.touchAim = 0));
    const longer = btn("−", "h-11 w-11 text-xl", "Longer club", () => (this.club = -1));
    const shorter = btn("+", "h-11 w-11 text-xl", "Shorter club", () => (this.club = 1));
    this.touch = el(
      "div",
      "pointer-events-none absolute inset-0 z-[6]",
      el("div", "absolute bottom-5 left-4 flex items-end gap-2", left, right),
      el("div", "absolute bottom-24 left-4 flex gap-2", longer, shorter),
      el("div", "absolute bottom-5 right-5", swing),
    );
    this.host.appendChild(this.touch);
  }
}

const factory: GameFactory = () => new FairwayGame();
export default factory;
