import type { GameFactory, GameInitOptions, GameModule, ScoreListener } from "../types";
import { GameLoop } from "../engine/loop";
import { ScoreEmitter } from "../engine/emitter";
import { Sound } from "../engine/audio";
import { CATEGORY_LABELS, type TriviaCategory } from "./questions";
import {
  answer,
  createTrivia,
  current,
  pointsFor,
  ROUND_SECONDS,
  tick,
  type CategoryChoice,
  type TriviaState,
} from "./logic";

const FEEDBACK_MS = 450;

/** Small DOM helper: el("div", "classes", children...). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

const BTN =
  "rounded-lg border border-border-strong bg-surface-2 text-left font-semibold text-text transition-colors hover:border-cyan focus-visible:outline-2 focus-visible:outline-cyan disabled:cursor-default";

/**
 * Trivia renders real DOM (buttons, live region) rather than canvas, so it's
 * fully usable with a screen reader and keyboard.
 */
class BlitzTrivia implements GameModule {
  readonly slug = "blitz-trivia";
  private opts!: GameInitOptions;
  private rootEl!: HTMLDivElement;
  private loop!: GameLoop;
  private emitter = new ScoreEmitter();
  private sound!: Sound;
  private state: TriviaState | null = null;
  private feedbackUntil = 0;
  private ended = false;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private ui: {
    time?: HTMLDivElement;
    timeText?: HTMLSpanElement;
    score?: HTMLSpanElement;
    streak?: HTMLSpanElement;
    prompt?: HTMLParagraphElement;
    buttons?: HTMLButtonElement[];
  } = {};

  init(opts: GameInitOptions) {
    this.opts = opts;
    this.sound = new Sound(opts.settings.sound, opts.settings.volume);
    this.rootEl = el(
      "div",
      "absolute inset-0 flex flex-col bg-bg p-3 pb-14 sm:p-6 sm:pb-16" /* bottom space keeps the pause button clear */,
    );
    opts.root.appendChild(this.rootEl);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.renderTimer(),
      1000 / 30,
    );
    window.addEventListener("keydown", this.onKey);
  }

  start() {
    this.loop.pause();
    this.state = null;
    this.ended = false;
    this.renderPicker();
  }

  pause() {
    this.loop.pause();
  }

  resume() {
    if (this.state && !this.ended) this.loop.resume();
  }

  destroy() {
    this.loop.pause();
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    window.removeEventListener("keydown", this.onKey);
    this.rootEl.remove();
    this.sound.destroy();
    this.emitter.clear();
  }

  onScore = (l: ScoreListener) => this.emitter.on(l);

  private onKey = (e: KeyboardEvent) => {
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1) return;
    if (!this.state) {
      const btn = this.rootEl.querySelectorAll<HTMLButtonElement>("button[data-category]")[n - 1];
      if (btn) {
        e.preventDefault();
        btn.click();
      }
      return;
    }
    if (!this.loop.isRunning || n > 4) return;
    e.preventDefault();
    this.choose(n - 1);
  };

  private renderPicker() {
    const choices: CategoryChoice[] = ["mixed", ...(Object.keys(CATEGORY_LABELS) as TriviaCategory[])];
    const grid = el("div", "grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3");
    choices.forEach((c, i) => {
      const b = el(
        "button",
        `${BTN} flex items-center gap-2 px-3 py-2 text-sm sm:text-base`,
        el("span", "font-mono text-xs text-subtle", String(i + 1)),
        c === "mixed" ? "Mixed" : CATEGORY_LABELS[c],
      );
      b.type = "button";
      b.dataset.category = c;
      b.addEventListener("click", () => this.begin(c));
      grid.appendChild(b);
    });
    this.rootEl.replaceChildren(
      el(
        "p",
        "mb-2 font-display text-sm font-bold uppercase tracking-wider text-cyan sm:mb-4 sm:text-lg",
        "Pick a category",
      ),
      grid,
    );
    grid.querySelector("button")?.focus();
  }

  private begin(category: CategoryChoice) {
    this.sound.play("select");
    this.state = createTrivia(category);
    this.renderQuestionShell();
    this.renderQuestion();
    this.loop.start();
  }

  private renderQuestionShell() {
    const time = el("div", "h-full rounded-full bg-cyan transition-[width] duration-100");
    const timeText = el("span", "font-mono tabular-nums", String(ROUND_SECONDS));
    const score = el("span", "font-display font-bold text-text", "0");
    const streak = el("span", "text-subtle", "");
    const prompt = el("p", "my-2 font-semibold leading-snug sm:my-5 sm:text-xl");
    prompt.setAttribute("aria-live", "polite");
    const buttons = [0, 1, 2, 3].map((i) => {
      const b = el("button", `${BTN} flex items-center gap-2 px-3 py-1.5 text-xs sm:px-4 sm:py-3 sm:text-base`);
      b.type = "button";
      b.addEventListener("click", () => this.choose(i));
      return b;
    });
    this.ui = { time, timeText, score, streak, prompt, buttons };
    this.rootEl.replaceChildren(
      el(
        "div",
        "flex items-center gap-3 text-xs sm:text-sm",
        el("div", "h-2 flex-1 overflow-hidden rounded-full bg-surface-3", time),
        timeText,
        el("span", "text-muted", "Score ", score),
        streak,
      ),
      prompt,
      el("div", "grid flex-1 grid-cols-2 gap-2 sm:gap-3", ...buttons),
    );
  }

  private renderQuestion() {
    const s = this.state!;
    const q = current(s);
    if (!q) return;
    this.ui.prompt!.textContent = q.prompt;
    this.ui.buttons!.forEach((b, i) => {
      b.disabled = false;
      b.className = `${BTN} flex items-center gap-2 px-3 py-1.5 text-xs sm:px-4 sm:py-3 sm:text-base`;
      b.replaceChildren(el("span", "font-mono text-xs text-subtle", String(i + 1)), q.choices[i]);
      b.setAttribute("aria-label", `${i + 1}: ${q.choices[i]}`);
    });
    this.ui.score!.textContent = String(s.score);
    this.ui.streak!.textContent = s.streak > 0 ? `🔥${s.streak} · next +${pointsFor(s.streak)}` : "";
    this.ui.buttons![0].focus({ preventScroll: true });
  }

  private choose(i: number) {
    const s = this.state;
    if (!s || s.over || performance.now() < this.feedbackUntil) return;
    const res = answer(s, i);
    if (!res) return;
    this.sound.play(res.correct ? "point" : "wrong");
    const btns = this.ui.buttons!;
    btns.forEach((b) => (b.disabled = true));
    btns[res.answer].className += " !border-success !bg-success/20";
    if (!res.correct) btns[i].className += " !border-danger !bg-danger/20";
    this.ui.prompt!.textContent = res.correct
      ? `Correct! +${res.points}`
      : `Wrong: it was “${btns[res.answer].textContent?.slice(1)}”. −5s`;
    this.ui.score!.textContent = String(s.score);
    this.emitter.progress(s.score, performance.now(), 0);
    this.feedbackUntil = performance.now() + FEEDBACK_MS;
    this.feedbackTimer = setTimeout(() => {
      if (s.over) this.finish();
      else this.renderQuestion();
    }, FEEDBACK_MS);
  }

  private update(dt: number) {
    const s = this.state;
    if (!s || performance.now() < this.feedbackUntil) return; // the clock stops during feedback
    tick(s, dt);
    if (s.over) this.finish();
  }

  private renderTimer() {
    const s = this.state;
    if (!s || !this.ui.time) return;
    const frac = s.timeLeft / ROUND_SECONDS;
    this.ui.time.style.width = `${Math.max(0, frac * 100)}%`;
    this.ui.time.style.backgroundColor = frac < 0.2 ? "var(--zx-danger)" : "var(--zx-cyan)";
    this.ui.timeText!.textContent = String(Math.ceil(s.timeLeft));
  }

  private finish() {
    if (this.ended || !this.state) return;
    this.ended = true;
    this.loop.pause();
    this.renderTimer();
    this.ui.buttons?.forEach((b) => (b.disabled = true));
    this.emitter.emit({ kind: "final", score: this.state.score, durationMs: Math.round(this.loop.activeMs) });
  }
}

const factory: GameFactory = () => new BlitzTrivia();
export default factory;
