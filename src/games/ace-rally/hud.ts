import { el } from "../sports-kit/ui";
import { SHOTS, TennisSim, type TennisEvent } from "./sim";

/**
 * Broadcast graphics: the score bug (server's dot, sets, games, points), the
 * line and chair umpire's calls, the serve speed, a Hawk-Eye card for close
 * calls, break/set/match point flags, and the serve timing meter.
 */
export class TennisHud {
  private root: HTMLDivElement;
  private rows: { name: HTMLSpanElement; sets: HTMLSpanElement; games: HTMLSpanElement; pts: HTMLSpanElement; dot: HTMLSpanElement }[] = [];
  private flag: HTMLDivElement;
  private call: HTMLDivElement;
  private callText: HTMLParagraphElement;
  private callSub: HTMLParagraphElement;
  private callT = 0;
  private speed: HTMLParagraphElement;
  private speedT = 0;
  private hawk: HTMLDivElement;
  private hawkText: HTMLParagraphElement;
  private hawkT = 0;
  private meter: HTMLDivElement;
  private needle: HTMLDivElement;
  private shotTag: HTMLParagraphElement;
  private live: HTMLDivElement;
  private hint: HTMLParagraphElement;

  constructor(
    host: HTMLElement,
    private sim: TennisSim,
    private coarse: boolean,
  ) {
    this.root = el("div", "pointer-events-none absolute inset-0 z-[5] select-none font-sans text-white");
    const bug = el("div", "absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))] overflow-hidden rounded-md border border-white/15 bg-black/75 text-[13px] shadow-lg backdrop-blur-sm");
    bug.setAttribute("data-testid", "tennis-score");
    for (const p of [0, 1]) {
      const dot = el("span", "h-2 w-2 rounded-full bg-[#d9f99d] opacity-0");
      const name = el("span", "w-28 truncate font-bold", sim.names[p]);
      const sets = el("span", "tabular-nums text-white/60");
      const games = el("span", "w-5 text-center font-black tabular-nums");
      const pts = el("span", "w-8 bg-[#facc15] text-center font-black tabular-nums text-black");
      bug.append(el("div", `flex items-center gap-2 pl-2 ${p === 0 ? "border-b border-white/10" : ""}`, dot, name, sets, games, pts));
      this.rows.push({ name, sets, games, pts, dot });
    }
    this.flag = el("div", "absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[calc(max(0.5rem,env(safe-area-inset-top))+3.4rem)] rounded bg-[#a3122c] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.2em] opacity-0 transition-opacity");
    this.callText = el("p", "font-display text-4xl font-black italic tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-6xl");
    this.callSub = el("p", "mt-1 text-sm font-bold uppercase tracking-[0.3em] text-white/85 drop-shadow");
    this.call = el("div", "absolute left-1/2 top-[22%] w-[90%] -translate-x-1/2 text-center opacity-0 transition-opacity duration-300", this.callText, this.callSub);
    this.speed = el("p", "absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 rounded bg-black/65 px-2 py-1 text-xs font-bold uppercase tracking-wider opacity-0 transition-opacity");
    this.hawkText = el("p", "text-lg font-black");
    this.hawk = el(
      "div",
      "absolute right-3 top-[max(3.5rem,env(safe-area-inset-top))] w-44 rounded-md border border-[#38bdf8]/50 bg-[#04121f]/85 p-2 text-center opacity-0 transition-opacity",
      el("p", "text-[10px] font-bold uppercase tracking-[0.3em] text-[#38bdf8]", "Hawk-Eye"),
      this.hawkText,
    );
    this.needle = el("div", "absolute bottom-0 h-full w-1 rounded bg-white");
    this.meter = el(
      "div",
      "absolute bottom-[max(4.5rem,env(safe-area-inset-bottom))] left-1/2 hidden h-3 w-56 -translate-x-1/2 overflow-hidden rounded-full border border-white/30 bg-black/50",
      el("div", "absolute inset-y-0 left-[41%] w-[18%] bg-[#22c55e]/80"),
      this.needle,
    );
    this.shotTag = el("p", "absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded bg-black/55 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider opacity-0 transition-opacity");
    this.hint = el(
      "p",
      "absolute top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/50 px-2 py-1 text-[11px] text-white/80 transition-opacity sm:block",
      coarse ? "SERVE twice: toss, then hit at the top" : "Space: toss, Space again at the top to serve · then Space / J topspin, K slice, L lob, I drop",
    );
    this.live = el("div", "sr-only");
    this.live.setAttribute("aria-live", "polite");
    this.root.append(bug, this.flag, this.call, this.speed, this.hawk, this.meter, this.shotTag, this.hint, this.live);
    host.appendChild(this.root);
    this.update(0);
  }

  private shout(text: string, sub = "", secs = 1.8) {
    this.callText.textContent = text;
    this.callSub.textContent = sub;
    this.call.style.opacity = "1";
    this.callT = secs;
    this.live.textContent = `${text}. ${sub}`;
  }

  onEvent(e: TennisEvent) {
    const s = this.sim;
    switch (e.kind) {
      case "hit":
        if (e.shot === "serve") {
          this.speed.textContent = `${e.kmh} km/h`;
          this.speed.style.opacity = "1";
          this.speedT = 2.5;
        }
        if (e.who === 0 && e.shot !== "serve") {
          this.shotTag.textContent = `${SHOTS[e.shot].name} · ${e.kmh} km/h${e.quality > 0.95 ? " · perfect" : e.quality < 0.6 ? " · rushed" : ""}`;
          this.shotTag.style.opacity = "1";
        }
        this.callT = Math.min(this.callT, 0.01);
        break;
      case "bounce":
        if (Math.abs(e.margin) < 0.06) {
          const mm = Math.round(Math.abs(e.margin) * 1000);
          this.hawkText.textContent = e.in ? `IN · ${mm} mm` : `OUT · ${mm} mm`;
          this.hawkText.style.color = e.in ? "#86efac" : "#fca5a5";
          this.hawk.style.opacity = "1";
          this.hawkT = 3;
        }
        if (!e.in) this.shout(s.isServe ? "Fault" : "Out!", "", 1.2);
        break;
      case "net":
        if (!e.cord) this.shout("Net", "", 1);
        break;
      case "let":
        this.shout("Let", "First serve again", 1.4);
        break;
      case "fault":
        this.shout(e.second ? "Double fault" : "Fault", e.second ? "" : "Second serve", 1.4);
        break;
      case "point": {
        const who = s.names[e.winner];
        const how = e.why === "ace" ? "Ace!" : e.why === "winner" ? `Winner, ${who}` : e.why === "double" ? "Double fault" : e.rally >= 9 ? `What a rally! ${e.rally} shots` : `Point ${who}`;
        this.shout(how, e.call, 2.1);
        break;
      }
      case "set":
        this.shout(`Set, ${s.names[e.winner]}`, e.sets.map((x) => `${x[0]}–${x[1]}`).join(" "), 3);
        break;
      case "changeover":
        this.shout("Changeover", s.score.line(0), 2.6);
        break;
      case "over":
        this.shout(e.winner === 0 ? "Game, set and match!" : `${s.names[1]} wins`, s.score.line(e.winner), 4);
        break;
      default:
        break;
    }
  }

  update(dt: number) {
    const s = this.sim;
    const sc = s.score;
    const calls = sc.calls();
    for (const p of [0, 1] as const) {
      const r = this.rows[p];
      r.dot.style.opacity = sc.server === p && sc.winner < 0 ? "1" : "0";
      r.sets.textContent = sc.sets.map((x) => x[p]).join(" ");
      r.games.textContent = sc.format === "tiebreak" ? "" : String(sc.games[p]);
      r.pts.textContent = sc.winner >= 0 ? "" : calls[p];
    }
    const pr = sc.pressure();
    if (pr && (s.phase === "serve" || s.phase === "toss")) {
      this.flag.textContent = `${pr.kind} point${pr.for === 0 ? "" : ` · ${s.names[1].split(" ").slice(-1)[0]}`}`;
      this.flag.style.opacity = "1";
    } else this.flag.style.opacity = "0";
    for (const [k, node] of [
      ["callT", this.call],
      ["speedT", this.speed],
      ["hawkT", this.hawk],
    ] as const) {
      if (this[k] > 0) {
        this[k] -= dt;
        if (this[k] <= 0) node.style.opacity = "0";
      }
    }
    // Serve meter: the toss rising and falling; hit in the green.
    const serving = s.server === 0 && !s.autopilot && (s.phase === "toss" || s.phase === "serve");
    this.meter.style.display = serving ? "block" : "none";
    if (serving) this.needle.style.left = `${Math.min(98, (s.phase === "toss" ? s.tossT / 1.05 : 0) * 100)}%`;
    if (s.phase === "serve" && s.phaseT < 0.1) this.shotTag.style.opacity = "0";
    this.hint.style.opacity = sc.sets.length === 0 && sc.games[0] + sc.games[1] === 0 && sc.points[0] + sc.points[1] < 3 ? "1" : "0";
    if (s.phase === "intro") this.shout("Zero X Open", `${s.names[0]} v ${s.names[1]}`, 0.3);
    void this.coarse;
  }

  destroy() {
    this.root.remove();
  }
}
