import { el } from "../sports-kit/ui";
import { DerbySim, OUTS_PER_ROUND, PITCHES, ROUNDS, type DerbyEvent } from "./sim";

/**
 * Derby graphics: the score bug (round, your homers and outs against the AI
 * slugger's mark), the pitch readout, a Statcast-style panel for every ball
 * put in play, and the big call in the middle of the screen.
 */
export class DerbyHud {
  private root: HTMLDivElement;
  private round: HTMLSpanElement;
  private you: HTMLSpanElement;
  private them: HTMLSpanElement;
  private themName: HTMLSpanElement;
  private outs: HTMLSpanElement[] = [];
  private need: HTMLParagraphElement;
  private pitch: HTMLParagraphElement;
  private stat: HTMLDivElement;
  private ev: HTMLSpanElement;
  private la: HTMLSpanElement;
  private dist: HTMLSpanElement;
  private call: HTMLDivElement;
  private callText: HTMLParagraphElement;
  private callSub: HTMLParagraphElement;
  private callT = 0;
  private statT = 0;
  private live: HTMLDivElement;
  private hint: HTMLParagraphElement;

  constructor(
    host: HTMLElement,
    private sim: DerbySim,
    coarse: boolean,
    youName: string,
    private spectator = false,
  ) {
    this.root = el("div", "pointer-events-none absolute inset-0 z-[5] select-none font-sans text-white");
    this.round = el("span", "font-bold uppercase tracking-[0.2em] text-[#facc15]");
    this.you = el("span", "min-w-[2ch] text-right text-lg font-black tabular-nums");
    this.them = el("span", "min-w-[2ch] text-right text-lg font-black tabular-nums text-white/80");
    this.themName = el("span", "truncate text-white/80");
    const dots = el("span", "flex gap-1");
    for (let i = 0; i < OUTS_PER_ROUND; i++) {
      const d = el("span", "h-2 w-2 rounded-full bg-white/20");
      this.outs.push(d);
      dots.append(d);
    }
    this.need = el("p", "px-2 pb-1 text-[11px] text-white/70");
    const bug = el(
      "div",
      "absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))] w-60 overflow-hidden rounded-md border border-white/15 bg-black/70 text-[13px] shadow-lg backdrop-blur-sm",
      el("div", "flex items-center justify-between bg-white/10 px-2 py-0.5 text-[11px]", this.round, el("span", "text-white/60", "Diamond Derby")),
      el("div", "flex items-center gap-2 px-2 pt-1", el("span", "h-4 w-1.5 rounded-sm bg-[#d61f3a]"), el("span", "flex-1 truncate font-black", youName), this.you),
      el("div", "flex items-center gap-2 px-2", el("span", "h-4 w-1.5 rounded-sm bg-white/40"), this.themName, el("span", "flex-1"), this.them),
      el("div", "flex items-center gap-2 px-2 py-1 text-[11px] text-white/60", el("span", "", "OUTS"), dots),
      this.need,
    );
    bug.setAttribute("data-testid", "derby-score");
    this.pitch = el("p", "absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 rounded bg-black/60 px-2 py-1 text-xs font-bold uppercase tracking-wider opacity-0 transition-opacity");
    this.ev = el("span", "font-black tabular-nums");
    this.la = el("span", "font-black tabular-nums");
    this.dist = el("span", "font-black tabular-nums text-[#facc15]");
    const cell = (k: string, v: HTMLSpanElement, unit: string) => el("div", "flex flex-col items-center px-2", el("span", "text-[9px] uppercase tracking-[0.2em] text-white/55", k), el("span", "text-lg", v, el("span", "ml-0.5 text-[10px] text-white/60", unit)));
    this.stat = el(
      "div",
      `absolute ${coarse ? "top-[max(0.5rem,env(safe-area-inset-top))] right-16" : "bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3"} flex divide-x divide-white/15 rounded-md border border-white/15 bg-black/70 py-1 opacity-0 transition-opacity`,
      cell("Exit velo", this.ev, "mph"),
      cell("Launch", this.la, "°"),
      cell("Distance", this.dist, "ft"),
    );
    this.callText = el("p", "font-display text-4xl font-black italic tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-6xl");
    this.callSub = el("p", "mt-1 text-sm font-bold uppercase tracking-[0.3em] text-white/85 drop-shadow");
    this.call = el("div", "absolute left-1/2 top-[20%] w-[90%] -translate-x-1/2 text-center opacity-0 transition-opacity duration-300", this.callText, this.callSub);
    this.hint = el(
      "p",
      "absolute top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 hidden -translate-x-1/2 whitespace-nowrap sm:block rounded bg-black/50 px-2 py-1 text-[11px] text-white/80 transition-opacity",
      coarse ? "Drag to aim · tap SWING as the ball arrives" : "Move the mouse to aim · click or Space to swing",
    );
    this.live = el("div", "sr-only");
    this.live.setAttribute("aria-live", "polite");
    this.root.append(bug, this.pitch, this.stat, this.call, this.hint, this.live);
    host.appendChild(this.root);
    this.update(0);
  }

  private shout(text: string, sub = "", secs = 2.2) {
    this.callText.textContent = text;
    this.callSub.textContent = sub;
    this.call.style.opacity = "1";
    this.callT = secs;
    this.live.textContent = `${text}. ${sub}`;
  }

  onEvent(e: DerbyEvent) {
    const s = this.sim;
    switch (e.kind) {
      case "pitch":
        this.pitch.textContent = `${e.mph} mph · ${PITCHES[e.type].name}`;
        this.pitch.style.opacity = "1";
        this.stat.style.opacity = "0";
        this.callT = Math.min(this.callT, 0.01);
        break;
      case "contact":
        this.ev.textContent = String(e.ev);
        this.la.textContent = String(e.la);
        this.dist.textContent = "…";
        this.stat.style.opacity = "1";
        this.statT = 6;
        break;
      case "homer":
        this.dist.textContent = String(e.dist);
        this.shout(e.moonshot ? "MOONSHOT!" : "HOME RUN!", `${e.dist} ft · ${e.ev} mph off the bat`, 2.6);
        break;
      case "miss":
        this.shout(e.why === "late" ? "Late!" : e.why === "early" ? "Out in front!" : "Swing and a miss", e.why === "late" || e.why === "early" ? "Swing and a miss" : "Missed it", 1.4);
        break;
      case "take":
        if (e.strike) this.shout("Strike!", "Taken: that costs an out", 1.4);
        break;
      case "out":
        if (s.hit && !s.hit.hr) {
          this.dist.textContent = String(s.hit.dist);
          if (e.why !== "Swing and a miss" && e.why !== "Called strike") this.shout(e.why, `Out ${e.outs} of ${OUTS_PER_ROUND}`, 1.6);
        }
        break;
      case "round":
        this.shout(e.won ? `${ROUNDS[e.round]} won!` : "Eliminated", `${e.you} – ${e.them}`, 3.8);
        break;
      case "over":
        this.shout(e.champion ? "DERBY CHAMPION!" : "Derby over", e.champion ? `${s.totalHrs} home runs · longest ${s.longest} ft` : `${s.totalHrs} home runs`, 4);
        break;
      default:
        break;
    }
  }

  update(dt: number) {
    const s = this.sim;
    this.round.textContent = ROUNDS[Math.min(s.round, ROUNDS.length - 1)];
    this.you.textContent = String(s.hrs);
    this.them.textContent = String(s.opponent.hrs);
    this.themName.textContent = s.opponent.name.replace(/".*" /, "");
    this.outs.forEach((d, i) => (d.style.background = i < s.outs ? "#ef4444" : ""));
    const left = OUTS_PER_ROUND - s.outs;
    const gap = s.opponent.hrs + 1 - s.hrs;
    this.need.textContent = gap <= 0 ? "You're through: keep hitting!" : `Need ${gap} more · ${left} out${left === 1 ? "" : "s"} left`;
    if (this.callT > 0) {
      this.callT -= dt;
      if (this.callT <= 0) this.call.style.opacity = "0";
    }
    if (this.statT > 0) {
      this.statT -= dt;
      if (this.statT <= 0) this.stat.style.opacity = "0";
    }
    if (s.phase === "intro") this.shout(ROUNDS[s.round], `vs ${s.opponent.name} · ${s.opponent.hrs} to beat`, 0.3);
    this.hint.style.opacity = !this.spectator && s.totalHrs === 0 && s.outs < 3 && s.round === 0 ? "1" : "0";
  }

  destroy() {
    this.root.remove();
  }
}
