import { commentary } from "./commentary";
import { A, B, BEHIND_HALF, FootySim, GOAL_X, KICK_STYLES, points, POSITIONS, type SimEvent } from "./sim";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: (Node | string)[]) {
  const n = document.createElement(tag);
  n.className = className;
  n.append(...children);
  return n;
}

const BREAK = ["", "QUARTER TIME", "HALF TIME", "THREE-QUARTER TIME", "FULL TIME"];

/**
 * The broadcast graphics: the score bug, the umpire's calls, your player and
 * kick power, a minimap of the oval, and the quarter-break scoreboard.
 */
export class FootyHud {
  private root: HTMLDivElement;
  private bug: HTMLDivElement;
  private home: HTMLSpanElement;
  private away: HTMLSpanElement;
  private homeTot: HTMLSpanElement;
  private awayTot: HTMLSpanElement;
  private clock: HTMLSpanElement;
  private quarter: HTMLSpanElement;
  private call: HTMLDivElement;
  private callText: HTMLParagraphElement;
  private callSub: HTMLParagraphElement;
  private callT = 0;
  private me: HTMLDivElement;
  private meName: HTMLParagraphElement;
  private meRole: HTMLParagraphElement;
  private stamina: HTMLDivElement;
  private power: HTMLDivElement;
  private powerFill: HTMLDivElement;
  private shotClock: HTMLParagraphElement;
  private hint: HTMLParagraphElement;
  private map: HTMLCanvasElement;
  private breakBox: HTMLDivElement;
  private live: HTMLDivElement;
  private mapT = 0;
  private ticker: HTMLDivElement;
  private lines: { node: HTMLParagraphElement; t: number }[] = [];
  private powerLabel: HTMLParagraphElement;
  private replay: HTMLDivElement;
  private ideal: HTMLDivElement;
  private setPanel: HTMLDivElement;
  private setInfo: HTMLParagraphElement;
  private setHint: HTMLParagraphElement;
  private setPower: HTMLDivElement;
  private needle: HTMLDivElement;
  private wind: HTMLDivElement;
  private windArrow: HTMLSpanElement;
  private windText: HTMLSpanElement;
  /** The camera's forward direction on the ground (for the wind arrow). */
  private camFwd = { x: 1, z: 0 };

  constructor(
    host: HTMLElement,
    private sim: FootySim,
    private coarse: boolean,
    private opts: { label?: string; spectator?: boolean } = {},
  ) {
    const [h, a] = sim.clubs;
    this.root = el("div", "pointer-events-none absolute inset-0 z-[5] select-none font-sans text-white");
    // Score bug (top left, broadcast style).
    const chip = (c: typeof h) => {
      const s = el("span", "inline-block h-5 w-1.5 rounded-sm");
      s.style.background = `linear-gradient(${c.guernsey} 0 40%, ${c.hoop} 40% 60%, ${c.guernsey} 60%)`;
      return s;
    };
    this.home = el("span", "tabular-nums text-white/70");
    this.away = el("span", "tabular-nums text-white/70");
    this.homeTot = el("span", "min-w-[2.2ch] text-right font-black tabular-nums text-[#facc15]");
    this.awayTot = el("span", "min-w-[2.2ch] text-right font-black tabular-nums text-[#facc15]");
    this.quarter = el("span", "font-bold text-white/80");
    this.clock = el("span", "font-black tabular-nums");
    const line = (c: typeof h, gb: HTMLSpanElement, tot: HTMLSpanElement) =>
      el("div", "flex items-center gap-2 px-2 py-0.5", chip(c), el("span", "w-10 font-black tracking-wider", c.short), gb, tot);
    this.bug = el(
      "div",
      "absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))] overflow-hidden rounded-md border border-white/15 bg-black/70 text-[13px] shadow-lg backdrop-blur-sm sm:text-sm",
      line(h, this.home, this.homeTot),
      line(a, this.away, this.awayTot),
      el("div", "flex items-center justify-between gap-3 bg-white/10 px-2 py-0.5 text-xs", this.quarter, this.clock),
      ...(opts.label ? [el("div", "bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#facc15]", opts.label)] : []),
    );
    this.bug.setAttribute("data-testid", "footy-score");
    // Umpire's call (centre).
    this.callText = el("p", "font-display text-4xl font-black italic tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-6xl");
    this.callSub = el("p", "mt-1 text-sm font-bold uppercase tracking-[0.3em] text-white/85 drop-shadow");
    this.call = el("div", "absolute left-1/2 top-[22%] -translate-x-1/2 text-center opacity-0 transition-opacity duration-300", this.callText, this.callSub);
    this.live = el("div", "sr-only");
    this.live.setAttribute("aria-live", "polite");
    // Your player.
    this.meName = el("p", "text-sm font-black uppercase tracking-wide");
    this.meRole = el("p", "text-[10px] uppercase tracking-[0.2em] text-white/60");
    this.stamina = el("div", "h-full rounded bg-[#facc15] transition-[width]");
    this.me = el(
      "div",
      `absolute ${coarse ? "bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-center" : "left-[max(0.75rem,env(safe-area-inset-left))] bottom-3"} rounded-md bg-black/55 px-3 py-1.5 backdrop-blur-sm`,
      this.meName,
      this.meRole,
      el("div", "mt-1 h-1 w-28 overflow-hidden rounded bg-white/15", this.stamina),
    );
    // Kick power.
    this.powerFill = el("div", "h-full origin-left rounded-full bg-gradient-to-r from-[#facc15] via-[#fb923c] to-[#ef4444]");
    this.powerLabel = el("p", "mb-1 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-white/80", "Kick power");
    this.ideal = el("div", "absolute -top-0.5 h-3.5 w-1 -translate-x-1/2 rounded bg-white shadow-[0_0_6px_#fff]");
    this.power = el(
      "div",
      "absolute bottom-[22%] left-1/2 w-56 -translate-x-1/2 opacity-0 transition-opacity",
      this.powerLabel,
      el("div", "h-2.5 overflow-hidden rounded-full border border-white/30 bg-black/50", this.powerFill),
    );
    this.shotClock = el("p", "absolute bottom-[30%] left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-sm font-bold tabular-nums opacity-0");
    this.hint = el("p", `absolute left-1/2 -translate-x-1/2 rounded bg-black/55 px-3 py-1 text-center text-xs text-white/85 ${coarse ? "bottom-[42%]" : "bottom-3"}`);
    // Minimap.
    this.map = el("canvas", `absolute right-[max(0.5rem,env(safe-area-inset-right))] ${coarse ? "top-[max(0.5rem,env(safe-area-inset-top))]" : "bottom-3"} h-[64px] w-[80px] rounded-md bg-black/40 sm:h-[96px] sm:w-[120px]`);
    this.map.width = 240;
    this.map.height = 192;
    this.breakBox = el("div", "absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition-opacity duration-500");
    // The commentary box: the last few calls, under the score.
    this.ticker = el("div", "absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[calc(max(0.5rem,env(safe-area-inset-top))+5.4rem)] flex w-[min(22rem,60vw)] flex-col gap-1");
    this.ticker.setAttribute("data-testid", "footy-commentary");
    // Instant replay: letterbox bars and the bug.
    this.replay = el(
      "div",
      "absolute inset-0 opacity-0 transition-opacity duration-300",
      el("div", "absolute inset-x-0 top-0 h-[9%] bg-black"),
      el("div", "absolute inset-x-0 bottom-0 h-[9%] bg-black"),
      el("p", "absolute right-4 top-[11%] rounded bg-[#a3122c] px-2 py-0.5 font-display text-sm font-black italic tracking-widest", "REPLAY"),
    );
    this.replay.setAttribute("data-testid", "footy-replay");
    // Power bar: a tick where the power matches the kick you've lined up.
    const barEl = this.powerFill.parentElement!;
    barEl.classList.add("relative");
    barEl.parentElement!.style.position = "absolute";
    const holder = el("div", "relative");
    barEl.replaceWith(holder);
    holder.append(barEl, this.ideal);
    // The set shot: distance and angle, the wind, power, the accuracy needle.
    this.setInfo = el("p", "text-sm font-black");
    this.setHint = el("p", "text-[11px] text-white/75");
    this.setPower = el("div", "h-full origin-left rounded-full bg-gradient-to-r from-[#facc15] via-[#fb923c] to-[#ef4444]");
    this.needle = el("div", "absolute top-0 h-full w-1 -translate-x-1/2 rounded bg-white shadow-[0_0_8px_#fff]");
    this.setPanel = el(
      "div",
      "absolute bottom-[16%] left-1/2 hidden w-72 -translate-x-1/2 rounded-lg border border-white/15 bg-black/70 p-2.5 text-center backdrop-blur-sm",
      this.setInfo,
      this.setHint,
      el("p", "mt-1.5 text-left text-[9px] font-bold uppercase tracking-[0.25em] text-white/60", "Power"),
      el("div", "h-2 overflow-hidden rounded-full border border-white/25 bg-black/50", this.setPower),
      el("p", "mt-1.5 text-left text-[9px] font-bold uppercase tracking-[0.25em] text-white/60", "Accuracy"),
      el(
        "div",
        "relative h-3 overflow-hidden rounded-full border border-white/25",
        Object.assign(el("div", "absolute inset-0"), { style: "background: linear-gradient(90deg,#ef4444,#f59e0b 30%,#22c55e 44%,#22c55e 56%,#f59e0b 70%,#ef4444)" }),
        this.needle,
      ),
    );
    this.setPanel.setAttribute("data-testid", "footy-setshot");
    this.windArrow = el("span", "inline-block transition-transform", "↑");
    this.windText = el("span", "tabular-nums");
    this.wind = el("div", "absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(3.2rem,env(safe-area-inset-top))] flex items-center gap-1 rounded bg-black/55 px-2 py-0.5 text-[11px] font-bold", el("span", "text-white/60", "WIND"), this.windArrow, this.windText);
    this.wind.setAttribute("data-testid", "footy-wind");
    if (opts.spectator) {
      this.ticker.hidden = true;
      this.me.hidden = true;
      this.hint.hidden = true;
      this.power.hidden = true;
    }
    this.root.append(this.setPanel, this.wind, this.replay, this.bug, this.ticker, this.call, this.live, this.me, this.power, this.shotClock, this.hint, this.map, this.breakBox);
    host.appendChild(this.root);
  }

  /** Big centre call, e.g. MARK / GOAL! */
  shout(text: string, sub = "", seconds = 1.8, color = "#ffffff") {
    this.callText.textContent = text;
    this.callText.style.color = color;
    this.callSub.textContent = sub;
    this.callT = seconds;
    this.call.style.opacity = "1";
    this.live.textContent = `${text} ${sub}`.trim();
  }

  /** The camera's forward on the ground, for the wind arrow. */
  setCamera(fx: number, fz: number) {
    const l = Math.hypot(fx, fz) || 1;
    this.camFwd = { x: fx / l, z: fz / l };
  }

  /** Show or hide the replay letterbox. */
  setReplay(on: boolean) {
    this.replay.style.opacity = on ? "1" : "0";
    this.bug.style.opacity = on ? "0" : "1";
  }

  /** Add a commentary line. */
  say(text: string) {
    const node = el("p", "rounded bg-black/60 px-2 py-1 text-[11px] leading-snug text-white/90 shadow transition-opacity duration-700", text);
    this.ticker.append(node);
    this.lines.push({ node, t: 7 });
    while (this.lines.length > 3) this.lines.shift()!.node.remove();
  }

  onEvent(e: SimEvent) {
    const sim = this.sim;
    const line = commentary(e, sim);
    if (line) this.say(line);
    const name = (id: number) => sim.players[id]?.name ?? "";
    const ours = (t: number) => t === 0;
    switch (e.kind) {
      case "goal": {
        const club = sim.clubs[e.team];
        this.shout(e.afterSiren ? "AFTER THE SIREN!" : "GOAL!", `${name(e.by)} · ${Math.round(e.dist)} m · ${club.name}`, 4, ours(e.team) ? "#facc15" : "#ffffff");
        break;
      }
      case "behind":
        this.shout(e.rushed ? "RUSHED" : e.post ? "POSTER" : "BEHIND", e.rushed ? "Rushed behind · 1 point" : "1 point", 2.2);
        break;
      case "mark":
        this.shout(e.screamer ? "SCREAMER!" : "MARK", `${name(e.id)}${e.contested ? " · contested" : ""}`, e.screamer ? 2.6 : 1.4, e.screamer ? "#facc15" : "#ffffff");
        break;
      case "free":
        this.shout("FREE KICK", `${e.reason} · ${name(e.id)}`, 2.2);
        break;
      case "playon":
        this.shout("PLAY ON", "", 1);
        break;
      case "ballup":
        this.shout("BALL UP", "", 1);
        break;
      case "out":
        if (!e.full) this.shout("OUT OF BOUNDS", "Throw-in", 1.2);
        break;
      case "tackle":
        if (ours(e.team)) this.shout("TACKLE", name(e.id), 0.9);
        break;
      case "siren":
        this.shout("SIREN", `End of quarter ${e.quarter}`, 2);
        break;
      case "quarter":
        this.shout(`QUARTER ${e.quarter}`, "Change of ends", 1.6);
        break;
      default:
        break;
    }
  }

  update(dt: number) {
    const sim = this.sim;
    const [h, a] = sim.score;
    this.home.textContent = `${h.goals}.${h.behinds}`;
    this.away.textContent = `${a.goals}.${a.behinds}`;
    this.homeTot.textContent = String(points(h));
    this.awayTot.textContent = String(points(a));
    this.quarter.textContent = sim.phase === "over" ? "FULL TIME" : `Q${sim.quarter}`;
    const c = Math.ceil(sim.clock);
    this.clock.textContent = `${Math.floor(c / 60)}:${String(c % 60).padStart(2, "0")}`;
    this.callT -= dt;
    if (this.callT <= 0) this.call.style.opacity = "0";
    const you = sim.you;
    this.meName.textContent = `#${you.number} ${you.name}`;
    this.meRole.textContent = POSITIONS[you.role].name;
    this.stamina.style.width = `${Math.round(you.stamina * 100)}%`;
    const mySet = sim.phase === "set" && sim.set?.id === sim.human && !sim.autopilot && !this.opts.spectator ? sim.set : null;
    this.power.style.opacity = sim.charge > 0 && !mySet ? "1" : "0";
    const plan = sim.kickPlan;
    this.ideal.style.display = plan && (plan.target >= 0 || plan.shot) ? "block" : "none";
    if (plan) this.ideal.style.left = `${Math.round(Math.min(1, plan.ideal) * 100)}%`;
    // The set-shot meter.
    this.setPanel.style.display = mySet ? "block" : "none";
    if (mySet) {
      const p = sim.players[mySet.id];
      const goal = { x: GOAL_X * sim.dir(p.team), z: 0 };
      const d = Math.round(Math.hypot(goal.x - mySet.x, mySet.z));
      const ang = Math.round((sim.goalAngle(mySet.x, mySet.z, p.team) * 180) / Math.PI);
      this.setInfo.textContent = mySet.kind === "kickin" ? "Kick-in" : `${d} m out · ${ang}° of goal face · ${KICK_STYLES[sim.kickStyle].name}`;
      const kick = this.coarse ? "KICK" : "Space / click";
      this.setHint.textContent =
        mySet.stage === "runup"
          ? "Hold… release at the power you want"
          : mySet.stage === "accuracy"
            ? `Tap ${kick} when the needle's in the green!`
            : `Line it up${this.coarse ? " with the stick" : " with the mouse"} (allow for the wind), then hold ${kick} to run in · ${Math.ceil(mySet.clock)}s`;
      this.setPower.style.transform = `scaleX(${mySet.power ?? 0})`;
      this.needle.style.left = `${50 + (mySet.needle ?? 0) * 48}%`;
      this.needle.style.opacity = mySet.stage === "accuracy" ? "1" : "0.25";
    }
    // Wind: speed and direction relative to the camera.
    const w = sim.wind;
    const ws = Math.hypot(w.x, w.z);
    const f = this.camFwd;
    this.windArrow.style.transform = `rotate(${Math.atan2(w.x * -f.z + w.z * f.x, w.x * f.x + w.z * f.z)}rad)`;
    this.windText.textContent = ws < 0.5 ? "calm" : `${Math.round(ws * 3.6)} km/h`;
    this.powerLabel.textContent = `${KICK_STYLES[sim.kickStyle].name} · power`;
    for (const l of this.lines) {
      l.t -= dt;
      l.node.style.opacity = l.t < 1 ? String(Math.max(0, l.t)) : "1";
    }
    while (this.lines.length && this.lines[0].t <= 0) this.lines.shift()!.node.remove();
    this.powerFill.style.transform = `scaleX(${sim.charge})`;
    const ownSet = sim.phase === "set" && sim.set?.id === sim.human;
    this.shotClock.style.opacity = ownSet && !mySet ? "1" : "0";
    if (ownSet) this.shotClock.textContent = `${sim.set!.kind === "kickin" ? "Kick-in" : sim.set!.kind === "free" ? "Free kick" : "Set shot"} · ${Math.ceil(sim.set!.clock)}`;
    this.hint.textContent = this.hintText();
    this.hint.style.opacity = this.hint.textContent ? "1" : "0";
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 0.1;
      this.drawMap();
    }
    this.breakBox.style.opacity = sim.phase === "break" || sim.phase === "over" ? "1" : "0";
    if (sim.phase === "break" && !this.breakBox.dataset.q) this.drawBreak();
    if (sim.phase !== "break") delete this.breakBox.dataset.q;
  }

  private hintText() {
    const sim = this.sim;
    const you = sim.you;
    const has = sim.ball.state === "held" && sim.ball.holder === you.id;
    const kick = this.coarse ? "hold KICK" : "hold Space";
    const style = `${KICK_STYLES[sim.kickStyle].name} (${this.coarse ? "STYLE" : "R"} to change)`;
    if (sim.phase === "set" && sim.set?.id === you.id && !sim.autopilot) return "";
    if (sim.phase === "set" && sim.set?.id === you.id) return `Aim with ${this.coarse ? "the stick" : "WASD"} · ${kick}, release to kick · ${style} · ${this.coarse ? "SPRINT" : "Shift"} + move = play on`;
    if (has) return `${kick} to kick${this.coarse ? "" : " (aim with the mouse)"} · ${style} · ${this.coarse ? "HANDBALL" : "F"} to handball`;
    if (sim.lockHuman !== null && sim.carrier && sim.carrier.team === 0) return `${this.coarse ? "CALL" : "Q"} to call for it`;
    if (sim.ball.state === "air" && !sim.ball.ruck) return `Get under it · ${this.coarse ? "LEAP" : "Space"} to mark`;
    const c = sim.carrier;
    if (c && c.team === 1 && Math.hypot(c.x - you.x, c.z - you.z) < 6) return `${this.coarse ? "TACKLE" : "E"} to tackle`;
    return "";
  }

  private drawMap() {
    const sim = this.sim;
    const g = this.map.getContext("2d")!;
    const W = this.map.width;
    const H = this.map.height;
    g.clearRect(0, 0, W, H);
    const sx = (x: number) => W / 2 + (x / (A + 6)) * (W / 2);
    const sz = (z: number) => H / 2 + (z / (B + 6)) * (H / 2);
    g.fillStyle = "rgba(40,90,40,0.75)";
    g.beginPath();
    g.ellipse(W / 2, H / 2, (A / (A + 6)) * (W / 2), (B / (B + 6)) * (H / 2), 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.6)";
    g.lineWidth = 1.5;
    g.stroke();
    g.strokeRect(sx(-25), sz(-25), sx(25) - sx(-25), sz(25) - sz(-25));
    g.fillStyle = "#ffffff";
    for (const x of [-GOAL_X, GOAL_X]) for (const z of [-BEHIND_HALF, -3.2, 3.2, BEHIND_HALF]) g.fillRect(sx(x) - 1.5, sz(z) - 1.5, 3, 3);
    for (const p of sim.players) {
      g.fillStyle = p.team === 0 ? sim.clubs[0].guernsey : sim.clubs[1].hoop;
      g.beginPath();
      g.arc(sx(p.x), sz(p.z), p.id === sim.human ? 5 : 3.2, 0, Math.PI * 2);
      g.fill();
      if (p.id === sim.human) {
        g.strokeStyle = "#facc15";
        g.lineWidth = 2;
        g.stroke();
      }
    }
    g.fillStyle = "#ef4444";
    g.beginPath();
    g.arc(sx(sim.ball.x), sz(sim.ball.z), 3.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#fff";
    g.lineWidth = 1;
    g.stroke();
  }

  private drawBreak() {
    const sim = this.sim;
    this.breakBox.dataset.q = String(sim.quarter);
    const rows = sim.byQuarter;
    const table = el("table", "mt-3 w-full text-sm tabular-nums");
    const head = el("tr", "text-[10px] uppercase tracking-widest text-white/50", el("th", "pr-4 text-left font-bold", ""));
    rows.forEach((_, i) => head.append(el("th", "px-2 font-bold", `Q${i + 1}`)));
    table.append(head);
    sim.clubs.forEach((c, t) => {
      const tr = el("tr", "", el("td", "pr-4 text-left font-black", c.name));
      rows.forEach((r) => tr.append(el("td", "px-2 text-center", FootySim.fmt(r[t]))));
      table.append(tr);
    });
    this.breakBox.replaceChildren(
      el(
        "div",
        "rounded-xl border border-white/15 bg-black/75 px-6 py-5 text-center shadow-2xl",
        el("p", "text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", BREAK[sim.quarter] ?? ""),
        el("p", "mt-1 font-display text-2xl font-black uppercase", leaderLine(sim)),
        table,
      ),
    );
  }

  destroy() {
    this.root.remove();
  }
}

export function leaderLine(sim: FootySim) {
  const d = points(sim.score[0]) - points(sim.score[1]);
  if (d === 0) return "Scores level";
  const lead = sim.clubs[d > 0 ? 0 : 1];
  return `${lead.name} by ${Math.abs(d)}`;
}
