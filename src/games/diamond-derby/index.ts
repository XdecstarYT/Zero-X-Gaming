import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import type { Detail, TimeOfDay } from "../sports-kit/look";
import { BTN, button, card, choice, el, hero, howTo, primaryButton, read, ResolutionGovernor, stat, write } from "../sports-kit/ui";
import { DerbyAudio } from "./audio";
import { DerbyHud } from "./hud";
import { ALL_STARS, DerbyView, type DerbyCam } from "./render";
import { DerbySim, LEVELS, ROUNDS, ZONE, type Difficulty, type DerbyInput } from "./sim";

const PREFS_KEY = "zx-derby-prefs";
const RECORD_KEY = "zx-derby-record";
const RED = "#d61f3a";

interface Prefs {
  difficulty: Difficulty;
  tod: TimeOfDay;
  gfx: Detail;
  cam: DerbyCam;
}
interface DerbyRecord {
  played: number;
  titles: number;
  homers: number;
  longest: number;
  best: number;
}

/**
 * Diamond Derby: a three-round home run derby under the lights. Aim the plate
 * coverage indicator at the pitch, time the swing, and out-homer the AI
 * slugger in each round with ten outs to spend.
 */
class DerbyGame implements GameModule {
  readonly slug = "diamond-derby";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private audio!: DerbyAudio;
  private sim: DerbySim | null = null;
  private view: DerbyView | null = null;
  private hud: DerbyHud | null = null;
  private touch: HTMLDivElement | null = null;
  private coarse = false;
  private prefs!: Prefs;
  private ended = false;
  private unranked = false;
  private lastFrame = 0;
  private res = new ResolutionGovernor();
  private overAt = 0;

  // Input: the aim (zone coordinates) and a swing press.
  private aim = { z: 0, y: 0.8 };
  private keys = new Set<string>();
  private swingPress = false;
  private drag: { id: number; x: number; y: number } | null = null;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.prefs = read<Prefs>(PREFS_KEY, { difficulty: "pro", tod: "night", gfx: this.coarse ? "low" : "high", cam: "batter" });
    this.host = el("div", "absolute inset-0 overflow-hidden bg-[#05070c]");
    this.host.style.touchAction = "none";
    opts.root.appendChild(this.host);
    this.menu = el("div", "absolute inset-0 z-10 flex overflow-auto bg-[#05070c]/95 p-3 pb-14 text-white");
    opts.root.appendChild(this.menu);
    this.audio = new DerbyAudio(opts.settings.sound, opts.settings.volume, 0.13);
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
    const rec = read<DerbyRecord>(RECORD_KEY, { played: 0, titles: 0, homers: 0, longest: 0, best: 0 });
    const p = this.prefs;
    const save = () => write(PREFS_KEY, this.prefs);
    const start = primaryButton("Step into the box", RED, () => void this.begin());
    start.setAttribute("data-testid", "derby-start");
    const controls = this.coarse
      ? "Drag anywhere to move the aim · tap SWING as the ball arrives · CAM switches view"
      : "Mouse (or WASD / arrows) aims · click or Space swings · C camera · Esc pause";
    this.menu.replaceChildren(
      el(
        "div",
        "m-auto flex w-full max-w-2xl flex-col items-center gap-3",
        hero("Sports+", "DIAMOND DERBY", "Home run derby · Three rounds · Under the lights", "radial-gradient(circle at 20% 0%, #d61f3a 0, transparent 55%), radial-gradient(circle at 80% 100%, #13284d 0, transparent 55%), linear-gradient(#123d22, #05070c)"),
        card(
          `${ALL_STARS.name} · your record`,
          el("p", "text-sm", rec.played ? `${rec.titles} titles in ${rec.played} derbies · ${rec.homers} home runs · longest ${rec.longest} ft · best ${rec.best}` : "No derbies yet. Ten outs a round: make them count."),
        ),
        card(
          "Derby",
          choice(
            "Difficulty",
            (Object.keys(LEVELS) as Difficulty[]).map((d) => ({
              value: d,
              title: LEVELS[d].name,
              sub: d === "rookie" ? "Slower pitches, a big sweet spot" : d === "pro" ? "Big-league stuff" : "Gas, a tiny sweet spot, monsters to beat",
            })),
            p.difficulty,
            (v) => ((this.prefs.difficulty = v), save()),
          ),
          choice(
            "Time",
            [
              { value: "night" as const, title: "Night", sub: "Lights, fireworks, a full house" },
              { value: "twilight" as const, title: "Twilight", sub: "Sunset over the bleachers" },
              { value: "day" as const, title: "Day", sub: "A blue-sky afternoon" },
            ],
            p.tod,
            (v) => ((this.prefs.tod = v), save()),
          ),
          choice(
            "Camera",
            [
              { value: "batter" as const, title: "Batter", sub: "Behind the plate" },
              { value: "broadcast" as const, title: "Broadcast", sub: "The centre-field lens" },
            ],
            p.cam,
            (v) => ((this.prefs.cam = v), save()),
          ),
          choice(
            "Graphics",
            [
              { value: "ultra" as const, title: "Ultra", sub: "Ambient occlusion, full crowd" },
              { value: "high" as const, title: "High", sub: "Soft shadows, bloom, sharpened" },
              { value: "low" as const, title: "Low", sub: "Faster on phones" },
            ],
            p.gfx,
            (v) => ((this.prefs.gfx = v), save()),
          ),
        ),
        start,
        howTo([
          ["The derby", `Three rounds (${ROUNDS.join(", ").toLowerCase()}), each against an AI slugger who has already posted a mark. Beat it before you make 10 outs to go through.`],
          ["Outs", "Anything that isn't a home run is an out: a miss, a foul, a grounder, a fly ball, off the wall. So is a strike you take. Balls out of the zone are free to take."],
          ["Aim", "Put the circle (plate coverage) over where the pitch will cross. Low in the circle lifts the ball; high on it pounds it into the dirt."],
          ["Timing", "Swing just before the ball arrives. Early pulls it toward left, late pushes it right; too early or late and you miss."],
          ["Pitches", "4-seam fastballs ride, changeups fade and sink, curves drop off the table, sliders sweep away."],
          ["Score", "100 a homer plus distance, the longest, each round won and 1,000 for the title."],
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
    const test = params.has("derby");
    this.unranked = test;
    const p = this.prefs;
    this.sim = new DerbySim({ seed: Date.now() & 0x7fffffff, difficulty: p.difficulty });
    if (test) {
      // Test hooks: the sim and a fast-forward with the AI hitting for you.
      const w = window as unknown as { __derby?: DerbySim; __derbyAdvance?: (s: number) => void };
      w.__derby = this.sim;
      w.__derbyAdvance = (secs: number) => {
        const sim = this.sim;
        if (!sim) return;
        sim.autopilot = true;
        for (let i = 0; i < secs * 60; i++) this.update(1 / 60);
        sim.autopilot = false;
        for (let i = 0; i < 4; i++) this.view?.render(0.25, this.prefs.cam);
      };
    }
    try {
      this.view = new DerbyView(this.host, this.sim, p.gfx, p.tod, { you: ALL_STARS.name });
    } catch {
      this.showMenu();
      this.menu.prepend(el("p", "w-full rounded bg-red-900/60 p-2 text-center text-sm", "3D graphics aren't available on this device (WebGL is off)."));
      this.sim = null;
      return;
    }
    this.hud = new DerbyHud(this.host, this.sim, this.coarse, ALL_STARS.name);
    if (this.coarse) this.buildTouch();
    this.overAt = 0;
    this.aim = { z: 0, y: 0.8 };
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

  private input(dt: number): DerbyInput {
    const k = (...c: string[]) => c.some((x) => this.keys.has(x));
    const sx = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
    const sy = (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0);
    // Screen right is toward first base (+z) from behind the plate, toward third from centre field.
    const flip = this.prefs.cam === "broadcast" ? -1 : 1;
    this.aim.z += sx * flip * dt * 0.9;
    this.aim.y += sy * dt * 0.9;
    this.clampAim();
    const inp = { aimZ: this.aim.z, aimY: this.aim.y, swing: this.swingPress };
    this.swingPress = false;
    return inp;
  }

  private clampAim() {
    this.aim.z = Math.max(-ZONE.half * 1.6, Math.min(ZONE.half * 1.6, this.aim.z));
    this.aim.y = Math.max(ZONE.lo - 0.25, Math.min(ZONE.hi + 0.25, this.aim.y));
  }

  private update(dt: number) {
    const sim = this.sim;
    if (!sim || !this.view) return;
    sim.step(dt, this.input(dt));
    for (const e of sim.events) {
      this.view.onEvent(e);
      this.hud?.onEvent(e);
      this.audio.onEvent(e);
      if (e.kind === "over") this.overAt = performance.now();
    }
    sim.events.length = 0;
    const tension = sim.phase === "pitch" ? 0.4 : sim.hit && !sim.hit.landed ? Math.min(1, sim.hit.ev / 110) : 0.15;
    this.audio.setExcitement(tension + (sim.opponent.hrs - sim.hrs <= 1 ? 0.3 : 0), dt);
    this.emitter.progress(sim.score(), performance.now());
    if (sim.phase === "over" && !this.ended && this.overAt && performance.now() - this.overAt > 3500) this.finish();
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.view || !this.sim) return;
    this.res.tick(dt, now, (k) => this.view?.setResolution(k));
    this.view.render(dt, this.prefs.cam);
    this.hud?.update(dt);
  }

  private finish() {
    const sim = this.sim!;
    this.ended = true;
    this.loop.pause();
    const score = sim.score();
    const rec = read<DerbyRecord>(RECORD_KEY, { played: 0, titles: 0, homers: 0, longest: 0, best: 0 });
    if (!this.unranked) {
      rec.played++;
      if (sim.champion) rec.titles++;
      rec.homers += sim.totalHrs;
      rec.longest = Math.max(rec.longest, sim.longest);
      rec.best = Math.max(rec.best, score);
      write(RECORD_KEY, rec);
    }
    const final = { kind: "final" as const, score, durationMs: this.loop.activeMs, ranked: !this.unranked };
    const avg = sim.hrLog.length ? Math.round(sim.hrLog.reduce((a, h) => a + h.ev, 0) / sim.hrLog.length) : 0;
    const box = el(
      "div",
      "absolute inset-0 z-20 grid place-items-center overflow-auto bg-black/80 p-4 text-white",
      el(
        "div",
        "w-full max-w-lg rounded-xl border border-white/15 bg-[#0b0f18] p-5 text-center",
        el("p", "text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", "Derby over"),
        el("p", "mt-1 font-display text-3xl font-black uppercase", sim.champion ? "Derby champion!" : `Out in the ${ROUNDS[sim.round].toLowerCase()}`),
        el("p", "mt-1 text-sm text-white/70", sim.opponents.slice(0, sim.round + 1).map((o, i) => `${ROUNDS[i]}: vs ${o.name.replace(/".*" /, "")} (${o.hrs})`).join(" · ")),
        el("div", "mt-4 grid grid-cols-2 gap-2 text-left sm:grid-cols-4", stat("Home runs", sim.totalHrs), stat("Longest", `${sim.longest} ft`), stat("Avg exit velo", avg ? `${avg} mph` : "–"), stat("Total distance", `${sim.totalDist} ft`)),
        el("p", "mt-4 text-xs uppercase tracking-[0.25em] text-white/50", "Derby score"),
        el("p", "font-display text-4xl font-black text-[#facc15]", String(score)),
        button("Continue", `${BTN} mt-4`, () => {
          box.remove();
          this.emitter.emit(final);
        }),
      ),
    );
    box.dataset.results = "";
    box.setAttribute("data-testid", "derby-results");
    this.host.appendChild(box);
  }

  // ----------------------------------------------------------------- input

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.sim || this.ended || !this.loop.isRunning) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "Space" || e.code === "Enter") this.swingPress = true;
    if (e.code === "KeyC") this.toggleCam();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private clearInput = () => {
    this.keys.clear();
    this.drag = null;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.view || this.coarse) return;
    const r = this.host.getBoundingClientRect();
    const a = this.view.aimFromScreen(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (a) {
      this.aim = a;
      this.clampAim();
    }
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.sim || this.coarse || e.button !== 0) return;
    this.swingPress = true;
  };
  private toggleCam() {
    this.prefs.cam = this.prefs.cam === "batter" ? "broadcast" : "batter";
    write(PREFS_KEY, this.prefs);
  }

  // Touch: drag anywhere (relative) to move the aim; the SWING button swings.
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || !this.touch || this.drag) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const k = 0.0045;
    const flip = this.prefs.cam === "broadcast" ? -1 : 1;
    this.aim.z += (e.clientX - this.drag.x) * k * flip;
    this.aim.y -= (e.clientY - this.drag.y) * k;
    this.clampAim();
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
  };
  private onPointerUp = (e: PointerEvent) => {
    if (this.drag && e.pointerId === this.drag.id) this.drag = null;
  };

  private buildTouch() {
    const swing = el("button", "pointer-events-auto absolute bottom-5 right-5 grid h-24 w-24 select-none place-items-center rounded-full border-4 border-[#facc15] bg-black/45 text-base font-black text-white active:bg-white/25", "SWING");
    swing.type = "button";
    swing.setAttribute("aria-label", "Swing");
    swing.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.vibrate?.(10);
      this.swingPress = true;
    });
    const cam = el("button", "pointer-events-auto absolute right-[9.5rem] top-2 h-10 w-14 rounded-lg border-2 border-white/40 bg-black/45 text-[10px] font-black text-white", "CAM");
    cam.type = "button";
    cam.setAttribute("aria-label", "Change camera");
    cam.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleCam();
    });
    this.touch = el("div", "pointer-events-none absolute inset-0 z-[6]", swing, cam);
    this.host.appendChild(this.touch);
  }
}

const factory: GameFactory = () => new DerbyGame();
export default factory;
