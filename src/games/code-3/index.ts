import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import { Code3Audio } from "./audio";
import { rankOf, RANKS, readCareer, saveShift, UNITS } from "./career";
import { Code3Hud } from "./hud";
import { Code3View, type CamState, type Quality } from "./render";
import { Code3Sim, NO_INPUT, type Code3Input } from "./sim";
import { SPECS, speedOf, type CarKind } from "./vehicles";

const MOUSE = 0.0024;
const TOUCH_LOOK = 0.007;
const STICK_R = 52;
const GFX_KEY = "zx-code3-gfx";
const UNIT_KEY = "zx-code3-unit";

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

const BTN =
  "rounded-md border-2 border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:border-[#3b82f6] focus-visible:outline-2 focus-visible:outline-[#3b82f6] disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY =
  "rounded-md bg-[#2563eb] px-6 py-3 font-display text-base font-black uppercase tracking-[0.2em] text-white shadow-[0_0_24px_#2563eb88] hover:brightness-110";

/**
 * Code 3: a police patrol sim. Work a shift in Bayview: answer dispatch,
 * run traffic stops by the book, chase, arrest, book, and build a career.
 */
class Code3Game implements GameModule {
  readonly slug = "code-3";
  private opts!: GameInitOptions;
  private host!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private audio!: Code3Audio;
  private sim: Code3Sim | null = null;
  private view: Code3View | null = null;
  private hud: Code3Hud | null = null;
  private touch: HTMLDivElement | null = null;
  private coarse = false;
  private quality: Quality = "high";
  private unit: CarKind = "cruiser";
  private shift: "night" | "day" = "night";
  private length: "full" | "short" = "full";
  private ended = false;
  private lastFrame = 0;
  /** ?code3=quick: a 30 s test shift (unranked). */
  private quick = false;

  // Input.
  private keys = new Set<string>();
  private pressed: Partial<Code3Input> = {};
  private yaw = 0;
  private pitch = 0;
  private orbit = 0;
  private orbitAt = 0;
  private far = false;
  private mouseDown = false;
  private rightDown = false;
  private aimToggle = false;
  private touchFire = false;
  private touchBrake = false;
  private touchYelp = false;
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private look: { id: number; x: number; y: number } | null = null;
  private knob: HTMLDivElement | null = null;
  private wasInCar = true;

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    try {
      const q = localStorage.getItem(GFX_KEY);
      this.quality = q === "low" || q === "high" ? q : this.coarse ? "low" : "high";
      const u = localStorage.getItem(UNIT_KEY) as CarKind | null;
      if (u && UNITS.some((x) => x.kind === u)) this.unit = u;
    } catch {
      // ignore
    }
    this.host = el("div", "absolute inset-0 overflow-hidden bg-[#05070c]");
    this.host.style.touchAction = "none";
    opts.root.appendChild(this.host);
    this.menu = el("div", "absolute inset-0 z-10 flex overflow-auto bg-[#05070c]/95 p-3 pb-14 text-white");
    opts.root.appendChild(this.menu);
    this.audio = new Code3Audio(opts.settings.sound, opts.settings.volume);
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
    window.addEventListener("mousemove", this.onMouseMove);
    this.host.addEventListener("contextmenu", (e) => e.preventDefault());
    this.host.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  start() {
    this.loop.pause();
    this.teardownShift();
    this.showMenu();
  }

  pause() {
    this.loop.pause();
    this.clearInput();
    this.audio.suspend();
    if (document.pointerLockElement === this.host) document.exitPointerLock();
  }

  resume() {
    if (!this.sim || this.ended) return;
    this.audio.resume();
    this.lockPointer();
    this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    if (document.pointerLockElement === this.host) document.exitPointerLock();
    this.teardownShift();
    this.menu.remove();
    this.host.remove();
    this.audio.destroy();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  // ------------------------------------------------------------------ menu

  private showMenu() {
    this.menu.hidden = false;
    const career = readCareer();
    const rank = rankOf(career.xp);
    const next = RANKS[rank + 1];
    const pct = next ? Math.round(((career.xp - RANKS[rank].xp) / (next.xp - RANKS[rank].xp)) * 100) : 100;
    if (!UNITS.some((u) => u.kind === this.unit && u.rank <= rank)) this.unit = "cruiser";

    const group = <T extends string>(label: string, items: { value: T; title: string; sub?: string; locked?: string }[], current: T, pick: (v: T) => void) => {
      const wrap = el("div", "grid w-full gap-2 sm:grid-cols-2");
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", label);
      const buttons = items.map((it) => {
        const b = button("", `${BTN} text-left`, () => {
          pick(it.value);
          buttons.forEach((x) => {
            const on = x.dataset.value === it.value;
            x.setAttribute("aria-pressed", String(on));
            x.style.borderColor = on ? "#3b82f6" : "";
          });
        });
        b.dataset.value = it.value;
        b.disabled = !!it.locked;
        b.append(el("span", "block font-bold", it.title), el("span", "block text-[11px] font-normal text-white/60", it.locked ?? it.sub ?? ""));
        const on = it.value === current;
        b.setAttribute("aria-pressed", String(on));
        if (on) b.style.borderColor = "#3b82f6";
        return b;
      });
      wrap.append(...buttons);
      return wrap;
    };

    const card = (title: string, ...body: Node[]) =>
      el("section", "flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left", el("h3", "text-[11px] font-bold uppercase tracking-[0.25em] text-[#60a5fa]", title), ...body);

    const start = button("Start shift", PRIMARY, () => void this.beginShift());
    const controls = this.coarse
      ? "Left thumb: drive / walk · Right thumb: look · EXIT/ENTER · LIGHTS · FIRE · Tap the action list to talk, search, cite and arrest"
      : "W/S throttle & brake · A/D steer · Space handbrake · Q lights/siren · H yelp · E exit/enter · Mouse look · Click fire · Right-click aim · X taser/sidearm · G shout · B backup · Y/N answer dispatch · 1–9 actions · Tab MDT · C camera";

    this.menu.replaceChildren(
      el(
        "div",
        "m-auto flex w-full max-w-2xl flex-col items-center gap-3",
        el(
          "div",
          "relative w-full overflow-hidden rounded-xl p-5 text-center",
          Object.assign(el("div", "absolute inset-0 zx-ad-police opacity-60"), { ariaHidden: "true" }),
          el("p", "relative font-display text-5xl font-black italic tracking-tight sm:text-6xl", "CODE 3"),
          el("p", "relative mt-1 text-[11px] font-bold uppercase tracking-[0.35em] text-white/80", "Bayview Police Department · Patrol"),
        ),
        card(
          "Your career",
          el("p", "text-lg font-black", `${RANKS[rank].name}`),
          el(
            "div",
            "h-2 w-full overflow-hidden rounded bg-white/10",
            Object.assign(el("div", "h-full bg-[#3b82f6]"), { style: `width:${pct}%` }),
          ),
          el("p", "text-xs text-white/60", next ? `${career.xp} / ${next.xp} XP to ${next.name}` : `${career.xp} XP · top rank`),
          el("p", "text-xs text-white/60", `${career.shifts} shifts · ${career.arrests} arrests · ${career.calls} calls · best shift ${career.best}`),
        ),
        card(
          "Unit",
          group(
            "Unit",
            UNITS.map((u) => ({ value: u.kind, title: SPECS[u.kind].name, sub: u.blurb, locked: u.rank > rank ? `Unlocks at ${RANKS[u.rank].name}` : undefined })),
            this.unit,
            (v) => {
              this.unit = v;
              try {
                localStorage.setItem(UNIT_KEY, v);
              } catch {
                // ignore
              }
            },
          ),
        ),
        card(
          "Shift",
          group(
            "Shift",
            [
              { value: "night" as const, title: "Night watch", sub: "20:00 – 04:00. Drunk drivers, robberies, the dark." },
              { value: "day" as const, title: "Day watch", sub: "08:00 – 16:00. Busy streets, traffic enforcement." },
            ],
            this.shift,
            (v) => (this.shift = v),
          ),
          group(
            "Length",
            [
              { value: "full" as const, title: "Full shift", sub: "15 minutes" },
              { value: "short" as const, title: "Short shift", sub: "8 minutes" },
            ],
            this.length,
            (v) => (this.length = v),
          ),
          group(
            "Graphics",
            [
              { value: "high" as const, title: "High", sub: "Shadows, bloom, sharper" },
              { value: "low" as const, title: "Low", sub: "Faster on phones and older PCs" },
            ],
            this.quality,
            (v) => {
              this.quality = v;
              try {
                localStorage.setItem(GFX_KEY, v);
              } catch {
                // ignore
              }
            },
          ),
        ),
        start,
        el("p", "max-w-xl text-center text-[11px] text-white/50", controls),
        el(
          "p",
          "max-w-xl text-center text-[11px] text-white/40",
          "Do it by the book: stops need a reason, searches need consent or probable cause, arrests need charges, and deadly force is only for armed attackers. Rank up to unlock bigger calls and faster units.",
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- shift

  private async beginShift() {
    this.audio.unlock();
    this.menu.hidden = true;
    this.teardownShift();
    this.ended = false;
    const rank = rankOf(readCareer().xp);
    const quick = new URLSearchParams(window.location.search).get("code3") === "quick";
    this.quick = quick;
    this.sim = new Code3Sim({
      seed: Date.now() & 0x7fffffff,
      unit: this.unit,
      startHour: this.shift === "night" ? 20 : 8,
      shiftSeconds: quick ? 30 : this.length === "full" ? 900 : 480,
      rank,
      traffic: this.quality === "low" ? 20 : 26,
      peds: this.quality === "low" ? 24 : 34,
      firstCall: quick ? 4 : 25,
    });
    this.yaw = this.sim.unit.h;
    this.pitch = 0;
    this.wasInCar = true;
    try {
      this.view = new Code3View(this.host, this.sim, this.quality);
    } catch {
      this.showMenu();
      this.menu.prepend(el("p", "w-full rounded bg-red-900/60 p-2 text-center text-sm", "3D graphics aren't available on this device (WebGL is off)."));
      this.sim = null;
      return;
    }
    this.hud = new Code3Hud(this.host, this.sim, this.coarse);
    this.hud.onChoose = (i) => (this.pressed.choose = i);
    this.hud.onAccept = (yes) => {
      if (yes) this.pressed.accept = true;
      else this.pressed.decline = true;
    };
    if (this.coarse) this.buildTouch();
    this.lastFrame = performance.now();
    this.lockPointer();
    this.loop.start();
    this.view.canvas.focus({ preventScroll: true });
  }

  private teardownShift() {
    this.hud?.destroy();
    this.hud = null;
    this.view?.destroy();
    this.view = null;
    this.touch?.remove();
    this.touch = null;
    this.sim = null;
    this.host.querySelector("[data-results]")?.remove();
  }

  private input(): Code3Input {
    const sim = this.sim!;
    const k = (...c: string[]) => c.some((x) => this.keys.has(x));
    const inCar = sim.player.inCar;
    let fwd = (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0);
    let side = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
    if (this.stick) {
      const dx = (this.stick.x - this.stick.ox) / STICK_R;
      const dy = (this.stick.y - this.stick.oy) / STICK_R;
      side = Math.max(-1, Math.min(1, dx));
      fwd = Math.max(-1, Math.min(1, -dy));
    }
    if (inCar !== this.wasInCar) {
      // Face the way the car faces when getting in or out.
      this.yaw = sim.unit.h;
      this.orbit = 0;
      this.wasInCar = inCar;
    }
    const p = this.pressed;
    this.pressed = {};
    return {
      ...NO_INPUT,
      throttle: inCar ? fwd : 0,
      steer: inCar ? side : 0,
      handbrake: inCar && (k("Space") || this.touchBrake),
      moveX: inCar ? 0 : side,
      moveZ: inCar ? 0 : fwd,
      yaw: this.yaw,
      sprint: k("ShiftLeft", "ShiftRight") || (!!this.stick && fwd > 0.92),
      fire: !inCar && (this.mouseDown || this.touchFire || k("KeyF")),
      horn: k("KeyH") || this.touchYelp,
      ...p,
    };
  }

  private update(dt: number) {
    const sim = this.sim;
    if (!sim || this.ended) return;
    sim.step(dt, this.input());
    // In the car the camera swings back behind after a moment.
    if (sim.player.inCar && performance.now() - this.orbitAt > 1500) this.orbit *= 1 - Math.min(1, dt * 3);
    if (sim.over && !this.ended) this.endShift();
  }

  private render() {
    const sim = this.sim;
    if (!sim || !this.view || !this.hud) return;
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const aiming = !sim.player.inCar && (this.rightDown || this.aimToggle);
    const cam: CamState = { yaw: this.yaw, pitch: this.pitch, orbit: this.orbit, far: this.far, aiming };
    // Sounds and toasts for this frame's events.
    for (const e of sim.events) {
      if (e.type === "radio") this.audio.radio();
      else if (e.type === "shot") this.audio.shot(e.by !== "player" && Math.hypot(e.x - sim.officer.x, e.z - sim.officer.z) > 25);
      else if (e.type === "taser") this.audio.taser();
      else if (e.type === "crash") this.audio.crash(e.speed);
      else if (e.type === "cuff") this.audio.cuff();
      else if (e.type === "score") {
        if (e.points >= 100) this.hud.flash(`+${e.points}`, "#86efac");
        else if (e.points <= -100) this.hud.flash(`${e.points}`, "#fca5a5");
        if (e.points > 0) this.audio.good();
        else this.audio.bad();
      }
    }
    this.view.render(cam, frameDt);
    sim.events = [];
    const opts = sim.options();
    this.hud.update(aiming, this.yaw, opts);
    const u = sim.unit;
    this.audio.update(frameDt, {
      siren: u.siren,
      yelp: this.keys.has("KeyH") || this.touchYelp,
      speed: speedOf(u),
      throttle: Math.max(0, u.throttle),
      inCar: sim.player.inCar,
      distance: Math.hypot(u.x - sim.player.x, u.z - sim.player.z),
    });
    this.emitter.progress(sim.stats.score, now);
  }

  private endShift() {
    const sim = this.sim!;
    this.ended = true;
    this.loop.pause();
    if (document.pointerLockElement === this.host) document.exitPointerLock();
    const s = sim.stats;
    const { before, after, promoted } = saveShift({ score: s.score, arrests: s.arrests, calls: s.calls, pursuits: s.pursuits });
    const final = { kind: "final" as const, score: Math.max(0, Math.min(100000, s.score)), durationMs: this.loop.activeMs, ranked: !this.quick };
    const good = sim.over?.reason === "End of shift";
    const stat = (k: string, v: string | number) => el("div", "rounded bg-white/5 px-2 py-1.5", el("p", "text-[10px] uppercase tracking-wider text-white/50", k), el("p", "text-lg font-black", String(v)));
    // Shift report first; the platform's game-over (score submit, play again) follows.
    const again = button("Continue", PRIMARY, () => {
      box.remove();
      this.emitter.emit(final);
    });
    const box = el(
      "div",
      "absolute inset-0 z-20 flex overflow-auto bg-black/85 p-3 text-white",
      el(
        "div",
        "m-auto flex w-full max-w-lg flex-col gap-3 rounded-xl border border-white/10 bg-[#0b1220] p-4",
        el("p", `font-display text-3xl font-black uppercase ${good ? "text-white" : "text-[#fca5a5]"}`, sim.over?.reason ?? "Shift over"),
        el("p", "font-display text-5xl font-black tabular-nums", String(s.score)),
        el("div", "grid grid-cols-3 gap-2 text-center", stat("Calls", s.calls), stat("Arrests", s.arrests), stat("Citations", s.citations), stat("Stops", s.stops), stat("Pursuits", s.pursuits), stat("Booked", s.booked)),
        el(
          "ul",
          "max-h-48 overflow-auto rounded bg-black/30 p-2 text-xs",
          ...(s.report.length ? s.report.slice(-14).map((r) => el("li", r.points >= 0 ? "text-[#86efac]" : "text-[#fca5a5]", `${r.points > 0 ? "+" : ""}${r.points}  ${r.text}`)) : [el("li", "text-white/50", "A quiet shift.")]),
        ),
        el(
          "p",
          "text-sm",
          `Career: ${before.xp} → ${after.xp} XP · ${RANKS[rankOf(after.xp)].name}`,
          promoted ? el("strong", "ml-2 text-[#ffd21f]", `PROMOTED to ${RANKS[rankOf(after.xp)].name}!`) : "",
        ),
        again,
      ),
    );
    box.dataset.results = "1";
    box.dataset.testid = "code3-results";
    this.host.append(box);
  }

  // ---------------------------------------------------------------- input

  private lockPointer() {
    if (this.coarse) return;
    try {
      const p = this.host.requestPointerLock?.() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      // Pointer lock unavailable: keyboard still works.
    }
  }

  private onLockChange = () => {
    if (document.pointerLockElement !== this.host && this.loop.isRunning && !this.ended && !this.coarse && !this.hud?.mdtOpen) this.opts.requestPause?.();
  };

  private clearInput = () => {
    this.keys.clear();
    this.mouseDown = false;
    this.rightDown = false;
    this.touchFire = false;
    this.touchBrake = false;
    this.touchYelp = false;
    this.stick = null;
    this.look = null;
    this.knob?.classList.add("hidden");
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.loop.isRunning || !this.sim) return;
    const handled = [
      "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight",
      "KeyE", "KeyQ", "KeyH", "KeyB", "KeyY", "KeyN", "KeyX", "KeyG", "KeyF", "KeyC", "Tab",
      "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
    ];
    if (!handled.includes(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    const p = this.pressed;
    switch (e.code) {
      case "KeyE":
        p.enter = true;
        break;
      case "KeyQ":
        p.lights = (typeof p.lights === "number" ? p.lights : 0) + 1;
        break;
      case "KeyB":
        p.backup = true;
        break;
      case "KeyY":
        p.accept = true;
        break;
      case "KeyN":
        p.decline = true;
        break;
      case "KeyX":
        p.weapon = this.sim.player.weapon === "taser" ? "pistol" : "taser";
        break;
      case "KeyG":
        p.shout = true;
        break;
      case "KeyC":
        this.far = !this.far;
        break;
      case "Tab": {
        const open = this.hud?.toggleMdt();
        if (open && document.pointerLockElement === this.host) document.exitPointerLock();
        else if (!open) this.lockPointer();
        break;
      }
      default:
        if (e.code.startsWith("Digit")) p.choose = Number(e.code.slice(5)) - 1;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.loop.isRunning || this.coarse) return;
    if (document.pointerLockElement !== this.host) this.lockPointer();
    if (e.button === 0) this.mouseDown = true;
    else if (e.button === 2) this.rightDown = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
    else if (e.button === 2) this.rightDown = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.loop.isRunning || document.pointerLockElement !== this.host || !this.sim) return;
    this.turn(e.movementX * MOUSE, e.movementY * MOUSE);
  };

  private turn(dx: number, dy: number) {
    if (!this.sim) return;
    if (this.sim.player.inCar) {
      this.orbit = Math.max(-Math.PI, Math.min(Math.PI, this.orbit + dx));
      this.orbitAt = performance.now();
    } else {
      this.yaw += dx;
      this.pitch = Math.max(-0.5, Math.min(0.6, this.pitch - dy));
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.loop.isRunning || e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const rect = this.host.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.45 && !this.stick) {
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      if (this.knob) {
        this.knob.classList.remove("hidden");
        this.knob.style.left = `${e.clientX - rect.left - 40}px`;
        this.knob.style.top = `${e.clientY - rect.top - 40}px`;
      }
    } else if (!this.look) this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  private onPointerMove = (e: PointerEvent) => {
    if (this.stick?.id === e.pointerId) {
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
    } else if (this.look?.id === e.pointerId) {
      this.turn((e.clientX - this.look.x) * TOUCH_LOOK, (e.clientY - this.look.y) * TOUCH_LOOK);
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    }
  };
  private onPointerUp = (e: PointerEvent) => {
    if (this.stick?.id === e.pointerId) {
      this.stick = null;
      this.knob?.classList.add("hidden");
    }
    if (this.look?.id === e.pointerId) this.look = null;
  };

  private buildTouch() {
    const round = (label: string, pos: string, aria: string) => {
      const b = el("button", `pointer-events-auto absolute grid h-14 w-14 place-items-center rounded-full border-2 border-white/40 bg-black/40 text-[10px] font-black text-white ${pos}`, label);
      b.type = "button";
      b.setAttribute("aria-label", aria);
      return b;
    };
    const tap = (b: HTMLButtonElement, f: () => void) =>
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        f();
      });
    const hold = (b: HTMLButtonElement, set: (v: boolean) => void) => {
      tap(b, () => set(true));
      for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => set(false));
    };
    const enter = round("E", "right-4 bottom-[46%]", "Enter or exit vehicle");
    tap(enter, () => (this.pressed.enter = true));
    const lights = round("LIGHTS", "right-20 bottom-[46%]", "Lights and siren");
    tap(lights, () => (this.pressed.lights = (typeof this.pressed.lights === "number" ? this.pressed.lights : 0) + 1));
    const fire = round("FIRE", "right-4 bottom-[26%] h-16 w-16 border-[#ef4444]", "Fire");
    hold(fire, (v) => (this.touchFire = v));
    const brake = round("BRAKE", "right-24 bottom-[20%]", "Handbrake");
    hold(brake, (v) => (this.touchBrake = v));
    const aim = round("AIM", "right-24 bottom-[32%]", "Aim");
    tap(aim, () => (this.aimToggle = !this.aimToggle));
    const wpn = round("WPN", "right-40 bottom-[26%]", "Switch taser / sidearm");
    tap(wpn, () => (this.pressed.weapon = this.sim?.player.weapon === "taser" ? "pistol" : "taser"));
    const yelp = round("YELP", "right-40 bottom-[38%]", "Siren yelp");
    hold(yelp, (v) => (this.touchYelp = v));
    const shout = round("SHOUT", "right-56 bottom-[32%]", "Shout: police, stop!");
    tap(shout, () => (this.pressed.shout = true));
    const backup = round("BACKUP", "right-4 top-[40%]", "Call backup");
    tap(backup, () => (this.pressed.backup = true));
    const mdt = round("MDT", "right-20 top-[40%]", "Open the MDT");
    tap(mdt, () => this.hud?.toggleMdt());
    this.knob = el("div", "pointer-events-none absolute hidden h-20 w-20 rounded-full border-2 border-white/40 bg-white/10");
    this.touch = el("div", "pointer-events-none absolute inset-0 z-[6]", this.knob, enter, lights, fire, brake, aim, wpn, yelp, shout, backup, mdt);
    this.host.append(this.touch);
  }
}

const factory: GameFactory = () => new Code3Game();
export default factory;
