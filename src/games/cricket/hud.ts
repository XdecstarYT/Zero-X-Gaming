import { el } from "../sports-kit/ui";
import { CricketSim, KINDS, PACE_KINDS, SPIN_KINDS, FIELDS, type FieldSet, type Kind, type SimEvent } from "./sim";

/**
 * Broadcast graphics: the score bug (score, overs, the chase, this over),
 * the batters and bowler, the delivery and its speed, the big call in the
 * middle, and your controls (shot buttons when batting; deliveries, field
 * and the release meter when bowling).
 */
export class CricketHud {
  private root: HTMLDivElement;
  private score: HTMLSpanElement;
  private overs: HTMLSpanElement;
  private chase: HTMLParagraphElement;
  private over: HTMLDivElement;
  private batters: HTMLParagraphElement;
  private bowler: HTMLParagraphElement;
  private speed: HTMLParagraphElement;
  private call: HTMLDivElement;
  private callText: HTMLParagraphElement;
  private callSub: HTMLParagraphElement;
  private callT = 0;
  private bowlPanel: HTMLDivElement;
  private kindBtns = new Map<Kind, HTMLButtonElement>();
  private fieldBtns = new Map<FieldSet, HTMLButtonElement>();
  private meter: HTMLDivElement;
  private meterFill: HTMLDivElement;
  private batPanel: HTMLDivElement;
  private hint: HTMLParagraphElement;
  private freeHit: HTMLSpanElement;
  private shotLabel: HTMLSpanElement;
  private kindsKey = "";
  private pp: HTMLSpanElement;
  private drsTag: HTMLSpanElement;
  private drsBox: HTMLDivElement;
  private drsTitle: HTMLParagraphElement;
  private drsRows: HTMLDivElement;
  private drsBtn: HTMLButtonElement;
  private drsKey = "";

  constructor(
    host: HTMLElement,
    private sim: CricketSim,
    private coarse: boolean,
    private ui: {
      kind: () => Kind;
      onKind: (k: Kind) => void;
      onField: (f: FieldSet) => void;
      onShot: (s: "ground" | "loft" | "defend") => void;
      onBowl: () => void;
      onRun: () => void;
      onReview: () => void;
      onCard: () => void;
    },
  ) {
    this.root = el("div", "pointer-events-none absolute inset-0 z-[5] select-none font-sans text-white");
    this.score = el("span", "text-xl font-black tabular-nums");
    this.overs = el("span", "text-sm font-bold tabular-nums text-white/70");
    this.chase = el("p", "px-2 text-[11px] font-bold text-[#22d3ee]");
    this.over = el("div", "flex flex-wrap gap-1 px-2 pb-1.5 pt-1");
    this.freeHit = el("span", "rounded bg-[#f97316] px-1.5 text-[10px] font-black uppercase", "Free hit");
    this.freeHit.hidden = true;
    const team = el("span", "rounded px-1.5 py-0.5 text-xs font-black");
    team.textContent = sim.batTeam.short;
    this.root.dataset.team = "";
    this.pp = el("span", "rounded bg-[#22d3ee] px-1 text-[10px] font-black text-black", "P");
    this.pp.title = "Powerplay: two fielders outside the circle";
    this.pp.setAttribute("data-testid", "cricket-powerplay");
    this.drsTag = el("span", "rounded bg-white/15 px-1 text-[10px] font-bold");
    this.drsTag.setAttribute("data-testid", "cricket-reviews");
    const bug = el(
      "div",
      "absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))] w-64 overflow-hidden rounded-md border border-white/15 bg-black/70 text-[13px] shadow-lg backdrop-blur-sm",
      el("div", "flex items-center gap-2 px-2 pt-1.5", team, this.score, el("span", "flex-1"), this.pp, this.drsTag, this.overs),
      this.chase,
      this.over,
    );
    bug.setAttribute("data-testid", "cricket-score");
    this.batters = el("p", "text-[12px] font-semibold");
    this.bowler = el("p", "text-[11px] text-white/70");
    this.speed = el("p", "text-[11px] font-bold text-[#facc15]");
    const lower = el(
      "div",
      "absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-[max(0.5rem,env(safe-area-inset-left))] max-w-[60%] rounded-md bg-black/60 px-2 py-1 backdrop-blur-sm",
      this.batters,
      this.bowler,
      el("div", "flex items-center gap-2", this.speed, this.freeHit),
    );
    this.callText = el("p", "font-display text-4xl font-black italic uppercase tracking-tight drop-shadow-[0_4px_18px_rgba(0,0,0,0.85)] sm:text-6xl");
    this.callSub = el("p", "mt-1 text-sm font-bold uppercase tracking-[0.3em] text-white/85");
    this.call = el("div", "absolute inset-x-0 top-[26%] text-center opacity-0 transition-opacity duration-300", this.callText, this.callSub);
    this.call.setAttribute("data-testid", "cricket-call");

    // Bowling controls.
    this.bowlPanel = el("div", "pointer-events-auto absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-14 flex max-w-[70%] flex-col items-end gap-1.5");
    this.bowlPanel.setAttribute("data-testid", "cricket-bowl-panel");
    this.meterFill = el("div", "absolute inset-y-0 left-0 bg-white");
    this.meter = el(
      "div",
      "relative h-4 w-56 overflow-hidden rounded-full border-2 border-white/40 bg-black/60",
      Object.assign(el("div", "absolute inset-y-0 bg-[#22c55e]/70"), { style: "left:78%;width:12%" }),
      Object.assign(el("div", "absolute inset-y-0 bg-[#ef4444]/80"), { style: "left:97%;width:3%" }),
      this.meterFill,
    );
    this.meter.setAttribute("data-testid", "cricket-meter");
    // Batting controls.
    this.shotLabel = el("span", "font-black text-[#facc15]");
    this.batPanel = el("div", "pointer-events-auto absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-14 flex flex-col items-end gap-1.5");
    this.hint = el("p", "absolute bottom-24 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/55 px-2 py-1 text-[11px] text-white/80");
    // DRS: the offer (your call) and the ball-tracking read-out.
    this.drsTitle = el("p", "font-display text-lg font-black uppercase tracking-wide");
    this.drsRows = el("div", "mt-1 flex flex-col gap-1 text-xs");
    this.drsBtn = this.btn("Review (V)", "mt-2 h-11 w-full border-[#facc15] bg-[#facc15]/20 text-sm", () => this.ui.onReview(), "cricket-review");
    this.drsBox = el("div", "pointer-events-auto absolute right-[max(0.5rem,env(safe-area-inset-right))] top-16 w-56 rounded-lg border border-white/20 bg-black/75 p-3 backdrop-blur-sm", el("p", "text-[10px] font-bold uppercase tracking-[0.3em] text-[#facc15]", "Decision review"), this.drsTitle, this.drsRows, this.drsBtn);
    this.drsBox.hidden = true;
    this.drsBox.setAttribute("data-testid", "cricket-drs");
    const cardBtn = this.btn("Card", "absolute right-14 top-[max(0.5rem,env(safe-area-inset-top))] h-9 px-3 text-[11px] border-white/40 bg-black/50", () => this.ui.onCard(), "cricket-card-btn");
    this.root.append(bug, lower, this.call, this.bowlPanel, this.batPanel, this.hint, this.drsBox, cardBtn);
    host.appendChild(this.root);
    this.buildBatPanel();
  }

  private btn(label: string, cls: string, fn: () => void, testid?: string) {
    const b = el("button", `pointer-events-auto select-none rounded-lg border-2 font-black uppercase text-white ${cls}`, label);
    b.type = "button";
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.vibrate?.(8);
      fn();
    });
    if (testid) b.setAttribute("data-testid", testid);
    return b;
  }

  private buildBatPanel() {
    const big = this.coarse ? "h-16 w-16 text-[11px]" : "h-12 px-3 text-xs";
    const row = el(
      "div",
      "flex gap-2",
      this.btn("Block", `${big} border-[#60a5fa] bg-black/50`, () => this.ui.onShot("defend"), "cricket-block"),
      this.btn("Loft", `${big} border-[#f97316] bg-black/50`, () => this.ui.onShot("loft"), "cricket-loft"),
      this.btn("Shot", `${big} border-[#facc15] bg-black/50`, () => this.ui.onShot("ground"), "cricket-shot"),
    );
    const run = this.btn("Run!", "h-10 px-4 text-xs border-[#22c55e] bg-black/50", () => this.ui.onRun(), "cricket-run");
    this.batPanel.append(run, row);
  }

  private buildBowlPanel() {
    const kinds = this.sim.bowler.style === "spin" ? SPIN_KINDS : PACE_KINDS;
    const key = kinds.join();
    if (key === this.kindsKey) return;
    this.kindsKey = key;
    if (!kinds.includes(this.ui.kind())) this.ui.onKind(kinds[0]);
    this.kindBtns.clear();
    this.fieldBtns.clear();
    const kindRow = el("div", "flex flex-wrap justify-end gap-1");
    kinds.forEach((k, i) => {
      const b = this.btn(`${i + 1} ${KINDS[k].name}`, "px-2 py-1 text-[10px] border-white/25 bg-black/60", () => this.ui.onKind(k), `cricket-kind-${k}`);
      this.kindBtns.set(k, b);
      kindRow.append(b);
    });
    const fieldRow = el("div", "flex flex-wrap justify-end gap-1");
    (Object.keys(FIELDS) as FieldSet[]).forEach((f) => {
      const b = this.btn(FIELDS[f].name, "px-2 py-1 text-[10px] border-white/25 bg-black/60", () => this.ui.onField(f), `cricket-field-${f}`);
      this.fieldBtns.set(f, b);
      fieldRow.append(b);
    });
    const bowl = this.btn(this.coarse ? "Bowl" : "Bowl (Space)", "h-12 px-5 text-sm border-[#22d3ee] bg-black/60", () => this.ui.onBowl(), "cricket-bowl");
    this.bowlPanel.replaceChildren(fieldRow, kindRow, el("div", "flex items-center gap-2", this.meter, bowl));
  }

  onEvent(e: SimEvent) {
    const s = this.sim;
    switch (e.kind) {
      case "six":
        return this.show("SIX!", `${e.dist} metres`, "#facc15", 2.6);
      case "four":
        return this.show("FOUR!", "To the rope", "#22d3ee", 2.4);
      case "out":
        return this.show(e.how === "Run out" ? "RUN OUT!" : e.how === "LBW" ? "LBW!" : e.how.startsWith("c ") ? "CAUGHT!" : `${e.how.toUpperCase()}!`, `${e.batter} ${e.runs} (${e.balls})`, "#ef4444", 3);
      case "drop":
        return this.show("DROPPED!", `${e.by} puts it down`, "#f97316", 2);
      case "notout":
        return this.show("Not out", "", "#e5e7eb", 1.4);
      case "wide":
        return this.show("Wide", "+1", "#e5e7eb", 1.2);
      case "noball":
        return this.show("No ball", "Free hit next", "#f97316", 1.6);
      case "hit":
        if (s.humanBats) this.show(e.label, `${e.speed} km/h off the bat`, "#ffffff", 1.2, true);
        return;
      case "edge":
        return this.show("Edged!", "", "#fde68a", 1.2, true);
      case "beaten":
        if (s.humanBats) this.show("Beaten", "", "#e5e7eb", 1, true);
        return;
      case "overEnd":
        return this.show("End of the over", e.summary, "#ffffff", 2);
      case "release":
        this.speed.textContent = `${s.delivery ? KINDS[s.delivery.kind].name : ""} · ${e.speed} km/h`;
        return;
      case "runs":
        if (e.n >= 2) this.show(`${e.n} runs`, "", "#ffffff", 1.2, true);
        return;
      case "powerplay":
        return this.show(e.on ? "Powerplay" : "Powerplay over", e.on ? "Only two fielders outside the circle" : "The field can spread", "#22d3ee", 2);
      case "drs":
        if (e.stage === "offer") return this.show(e.out ? "Given out!" : "Not out", s.opts.human === e.side ? "Review it? You have one review" : "", e.out ? "#ef4444" : "#e5e7eb", 2);
        if (e.stage === "review") return this.show("Review!", e.text, "#facc15", 2);
        return this.show(e.out ? "OUT" : "NOT OUT", e.text, e.out ? "#ef4444" : "#22c55e", 3.2);
    }
  }

  private show(text: string, sub: string, color: string, secs: number, small = false) {
    this.callText.textContent = text;
    this.callText.style.color = color;
    this.callText.style.fontSize = small ? "2rem" : "";
    this.callSub.textContent = sub;
    this.call.style.opacity = "1";
    this.callT = secs;
  }

  update(dt: number, ui: { kind: Kind; field: FieldSet; shot: "ground" | "loft" | "defend" }) {
    const s = this.sim;
    const inn = s.inn;
    this.score.textContent = `${inn.runs}/${inn.wkts}`;
    this.overs.textContent = `${s.overs()}${s.opts.mode === "nets" ? "" : ` / ${s.ballsPerInnings / 6}`} ov`;
    const tgt = s.target;
    this.chase.textContent = tgt ? `Need ${Math.max(0, tgt - inn.runs)} off ${s.ballsPerInnings - inn.balls} · target ${tgt}` : s.cur === 0 && s.opts.mode === "match" ? `${s.bowlTeam.short} bowling · first innings` : s.opts.mode === "nets" ? "Nets · no outs" : "";
    const key = inn.over.join(",");
    if (this.over.dataset.k !== key) {
      this.over.dataset.k = key;
      this.over.replaceChildren(
        ...inn.over.map((b) => {
          const c = b === "W" ? "bg-[#ef4444]" : b === "4" ? "bg-[#0ea5e9]" : b === "6" ? "bg-[#a855f7]" : b.startsWith("wd") || b.startsWith("nb") ? "bg-[#f97316]" : "bg-white/15";
          return el("span", `grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black ${c}`, b);
        }),
      );
    }
    const st = inn.cards[inn.striker];
    const ns = inn.cards[inn.nonStriker];
    this.batters.textContent = `${s.batTeam.players[inn.striker].name}* ${st.runs} (${st.balls})   ${s.batTeam.players[inn.nonStriker].name} ${ns.runs} (${ns.balls})`;
    const bc = inn.bowl.get(inn.bowler);
    this.bowler.textContent = `${s.bowler.name} ${bc ? `${bc.wkts}-${bc.runs} (${s.overs(bc.balls)})` : ""} · ${s.bowler.style === "spin" ? "spin" : "pace"}`;
    this.freeHit.hidden = s.result?.text !== "No ball! Free hit" || s.phase === "dead";
    this.pp.hidden = !(s.opts.mode === "match" && s.powerplay);
    const me = s.opts.human;
    this.drsTag.hidden = !s.drsOn || me < 0;
    if (me >= 0) this.drsTag.textContent = `DRS ${s.reviews[me as 0 | 1]}`;
    this.updateDrs();
    // Controls.
    const bowling = s.humanBowls && s.phase !== "break" && s.phase !== "done";
    const batting = s.humanBats && s.phase !== "break" && s.phase !== "done";
    this.bowlPanel.hidden = !bowling;
    this.batPanel.hidden = !batting || !this.coarse;
    if (bowling) {
      this.buildBowlPanel();
      for (const [k, b] of this.kindBtns) b.style.borderColor = k === ui.kind ? "#22d3ee" : "rgba(255,255,255,0.25)";
      for (const [f, b] of this.fieldBtns) b.style.borderColor = f === ui.field ? "#facc15" : "rgba(255,255,255,0.25)";
      const m = s.phase === "runup" ? (s.meterLocked ?? s.meter) : s.phase === "plan" ? 0 : (s.meterLocked ?? 0);
      this.meterFill.style.width = `${Math.round(m * 100)}%`;
      this.meterFill.style.background = s.meterLocked !== null ? (s.meterLocked > 0.97 ? "#ef4444" : s.meterLocked >= 0.78 && s.meterLocked <= 0.9 ? "#22c55e" : "#facc15") : "#ffffff";
    }
    this.hint.hidden = !(batting || bowling) || s.phase !== "plan";
    if (batting)
      this.hint.textContent = this.coarse
        ? "Drag to aim · SHOT along the ground, LOFT over the top, BLOCK to defend · RUN for another"
        : "Mouse aims · click shot · right-click / Shift loft · S block · R run · C camera";
    else if (bowling) this.hint.textContent = this.coarse ? "Tap the pitch to aim · pick a delivery · BOWL, then BOWL again in the green" : "Click the pitch to aim · 1–6 delivery · F field · Space to run in, Space in the green to bowl";
    if (this.callT > 0) {
      this.callT -= dt;
      if (this.callT <= 0) this.call.style.opacity = "0";
    }
  }

  /** The review panel: your call to make, then pitching, impact and wickets revealed one by one. */
  private updateDrs() {
    const s = this.sim;
    const c = s.phase === "review" ? s.drs : null;
    this.drsBox.hidden = !c;
    if (!c) {
      this.drsKey = "";
      return;
    }
    const mine = c.stage === "offer" && s.opts.human === c.side && !s.autopilot;
    this.drsBtn.hidden = !mine;
    this.drsTitle.textContent = c.stage === "offer" ? `${c.given ? "Out" : "Not out"} · ${mine ? `review? ${Math.max(0, Math.ceil(7 - c.t))}s` : "on the field"}` : "Ball-tracking";
    const shown = c.stage === "review" ? (c.t > 4.2 ? 3 : c.t > 2.8 ? 2 : c.t > 1.4 ? 1 : 0) : 0;
    const key = `${c.stage}:${shown}`;
    if (key === this.drsKey) return;
    this.drsKey = key;
    const good = (v: string) => (v === "in line" || v === "hitting" || v === "full toss" ? "#22c55e" : v === "umpire's call" ? "#f59e0b" : "#ef4444");
    const rows: [string, string][] = [
      ["Pitching", c.pitching],
      ["Impact", c.impact],
      ["Wickets", c.wickets],
    ];
    this.drsRows.replaceChildren(
      ...rows.map(([k, v], i) => {
        const val = el("span", "rounded px-1.5 py-0.5 font-black uppercase text-black", i < shown ? v : "…");
        val.style.background = i < shown ? good(v) : "rgba(255,255,255,0.2)";
        return el("div", "flex items-center justify-between", el("span", "uppercase tracking-wider text-white/70", k), val);
      }),
    );
  }

  destroy() {
    this.root.remove();
  }
}
