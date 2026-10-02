import { el } from "../sports-kit/ui";
import { CARS, CAREERS, careerById, DEGREES } from "./careers";
import {
  ACTIVITIES,
  applyFor,
  buyCar,
  canDo,
  choose,
  doActivity,
  enrolUni,
  eventById,
  fullName,
  heirs,
  interact,
  isAdult,
  lifeScore,
  livesWithParents,
  money,
  qualifies,
  ribbonsOf,
  rngFor,
  salary,
  type Interaction,
  type Life,
  type Stat,
} from "./life";
import { PLOTS } from "./world";

/**
 * The phone in your pocket: Life's life-sim screen. Your stats, the story of
 * your life year by year, the big Age Up button, events with choices, and
 * tabs for people, activities, work and school, and assets. "Live today"
 * takes you into the 3D world.
 */

export type Tab = "life" | "people" | "activities" | "work" | "assets";

const STAT_COLORS: Record<Stat, string> = { happiness: "#f59e0b", health: "#ef4444", smarts: "#3b82f6", looks: "#ec4899" };
const STAT_ICON: Record<Stat, string> = { happiness: "😊", health: "❤️", smarts: "🧠", looks: "✨" };
const REL_LABEL: Record<string, string> = { mother: "Mother", father: "Father", sibling: "Sibling", friend: "Friend", partner: "Partner", spouse: "Spouse", child: "Child", ex: "Ex" };

const BTN = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 shadow-sm hover:border-emerald-400 active:scale-[0.99] disabled:opacity-40";
const button = (label: string | Node, cls: string, fn: () => void, testid?: string) => {
  const b = el("button", cls);
  b.append(label);
  b.type = "button";
  b.addEventListener("click", fn);
  if (testid) b.setAttribute("data-testid", testid);
  return b;
};

export interface LifeScreenHooks {
  /** Something changed: save and redraw. */
  changed: () => void;
  ageUp: () => void;
  liveToday: () => void;
  newLife: () => void;
  continueAs: (childId: number) => void;
  finish: () => void;
  toast: (t: string) => void;
}

export class LifeScreen {
  readonly root: HTMLDivElement;
  private tab: Tab = "life";
  private body: HTMLDivElement;
  private header: HTMLDivElement;
  private footer: HTMLDivElement;
  private modal: HTMLDivElement;

  constructor(
    host: HTMLElement,
    private life: () => Life,
    private hooks: LifeScreenHooks,
  ) {
    this.root = el("div", "absolute inset-0 z-10 flex justify-center overflow-hidden bg-gradient-to-b from-emerald-900 via-slate-900 to-slate-950 p-2 sm:p-4");
    this.root.setAttribute("data-testid", "life-screen");
    this.header = el("div", "shrink-0");
    this.body = el("div", "min-h-0 flex-1 overflow-y-auto px-3 py-2");
    this.footer = el("div", "shrink-0 border-t border-slate-200 bg-white/95 p-2");
    this.modal = el("div", "absolute inset-0 z-20 hidden place-items-center bg-black/50 p-4");
    const phone = el("div", "relative flex h-full w-full max-w-md flex-col overflow-hidden rounded-[2rem] border-4 border-slate-800 bg-slate-50 text-slate-900 shadow-2xl", this.header, this.body, this.footer, this.modal);
    this.root.append(phone);
    host.appendChild(this.root);
  }

  set hidden(v: boolean) {
    this.root.hidden = v;
  }

  show(tab?: Tab) {
    if (tab) this.tab = tab;
    this.root.hidden = false;
    this.render();
  }

  render() {
    const l = this.life();
    this.renderHeader(l);
    this.renderFooter(l);
    if (!l.me.alive) return this.renderDeath(l);
    switch (this.tab) {
      case "life":
        this.renderLog(l);
        break;
      case "people":
        this.renderPeople(l);
        break;
      case "activities":
        this.renderActivities(l);
        break;
      case "work":
        this.renderWork(l);
        break;
      case "assets":
        this.renderAssets(l);
        break;
    }
    if (l.pending.length) this.renderEvent(l);
    else this.modal.classList.replace("grid", "hidden");
  }

  private renderHeader(l: Life) {
    const job = l.job ? careerById(l.job.career)?.ladder[l.job.level] : l.school.stage === "uni" ? "University student" : l.school.stage === "primary" || l.school.stage === "high" ? "Student" : l.me.age < 5 ? "Little one" : "Unemployed";
    const bars = (Object.keys(STAT_COLORS) as Stat[]).map((s) => {
      const fill = el("div", "h-full rounded-full transition-all");
      fill.style.width = `${l.stats[s]}%`;
      fill.style.background = STAT_COLORS[s];
      const row = el("div", "flex items-center gap-2 text-[11px] font-semibold text-slate-600", el("span", "w-4", STAT_ICON[s]), el("span", "w-16 capitalize", s), el("div", "h-2 flex-1 overflow-hidden rounded-full bg-slate-200", fill), el("span", "w-8 text-right tabular-nums", `${l.stats[s]}%`));
      row.setAttribute("data-testid", `life-stat-${s}`);
      return row;
    });
    const name = el("p", "text-lg font-black leading-tight", fullName(l.me));
    name.setAttribute("data-testid", "life-name");
    const age = el("span", "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800", `Age ${l.me.age}`);
    age.setAttribute("data-testid", "life-age");
    const cash = el("span", `text-sm font-black tabular-nums ${l.money < 0 ? "text-red-600" : "text-emerald-700"}`, money(l.money));
    cash.setAttribute("data-testid", "life-money");
    this.header.replaceChildren(
      el(
        "div",
        "bg-white px-4 pb-3 pt-4 shadow-sm",
        el("div", "flex items-start justify-between gap-2", el("div", "min-w-0", name, el("p", "truncate text-xs text-slate-500", `${job} · Harbour City${l.generation > 1 ? ` · Generation ${l.generation}` : ""}`)), el("div", "flex flex-col items-end gap-1", age, cash)),
        el("div", "mt-3 flex flex-col gap-1", ...bars),
      ),
    );
  }

  private renderFooter(l: Life) {
    const tab = (id: Tab, label: string, icon: string) => {
      const b = button(el("span", "flex flex-col items-center text-[10px] font-bold", el("span", "text-lg leading-none", icon), label), `flex-1 rounded-xl py-1 ${this.tab === id ? "bg-emerald-100 text-emerald-800" : "text-slate-500"}`, () => {
        this.tab = id;
        this.render();
      }, `life-tab-${id}`);
      return b;
    };
    if (!l.me.alive) {
      this.footer.replaceChildren();
      return;
    }
    const age = button(el("span", "flex items-center justify-center gap-2", el("span", "text-2xl font-black", "+"), "Age up"), "flex-1 rounded-2xl bg-emerald-500 py-3 text-lg font-black text-white shadow-lg hover:bg-emerald-600 active:scale-[0.98]", () => this.hooks.ageUp(), "life-age-up");
    const live = button(el("span", "flex flex-col items-center leading-tight", el("span", "text-xs font-black", "LIVE TODAY"), el("span", "text-[10px] font-semibold opacity-80", "in 3D")), "rounded-2xl bg-slate-900 px-4 py-2 text-white shadow-lg hover:bg-slate-700 disabled:opacity-40", () => this.hooks.liveToday(), "life-live");
    (live as HTMLButtonElement).disabled = l.me.age < 4 || l.prison > 0;
    if (l.me.age < 4) live.title = "You're too little to explore. Age up!";
    this.footer.replaceChildren(el("div", "mb-2 flex gap-2", age, live), el("div", "flex gap-1", tab("life", "Life", "📖"), tab("people", "People", "👪"), tab("activities", "Do", "🎯"), tab("work", "Work", "💼"), tab("assets", "Assets", "🏠")));
  }

  private renderLog(l: Life) {
    const groups = new Map<number, string[]>();
    for (const e of l.log) (groups.get(e.age) ?? groups.set(e.age, []).get(e.age)!).push(e.text);
    const blocks = [...groups.entries()].map(([age, lines]) => el("div", "mb-3", el("p", "text-xs font-black uppercase tracking-wider text-emerald-700", `Age ${age}`), ...lines.map((t) => el("p", "text-sm leading-snug text-slate-700", t))));
    const log = el("div", "", ...blocks);
    log.setAttribute("data-testid", "life-log");
    this.body.replaceChildren(log);
    this.body.scrollTop = this.body.scrollHeight;
  }

  private renderEvent(l: Life) {
    const e = eventById(l.pending[0]);
    if (!e) {
      l.pending.shift();
      return this.render();
    }
    const card = el(
      "div",
      "w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl",
      el("p", "text-xs font-black uppercase tracking-wider text-emerald-700", "Something happened"),
      el("p", "mt-1 text-base font-semibold text-slate-800", e.text(l, rngFor(l, 1))),
      el(
        "div",
        "mt-3 flex flex-col gap-2",
        ...e.choices.map((c, i) =>
          button(c.label, BTN, () => {
            this.hooks.toast(choose(l, i));
            this.hooks.changed();
          }, `life-choice-${i}`),
        ),
      ),
    );
    card.setAttribute("data-testid", "life-event");
    this.modal.replaceChildren(card);
    this.modal.classList.replace("hidden", "grid");
  }

  private section(title: string, ...items: Node[]) {
    return el("div", "mb-4", el("p", "mb-1.5 text-xs font-black uppercase tracking-wider text-slate-500", title), el("div", "flex flex-col gap-1.5", ...items));
  }

  private renderPeople(l: Life) {
    const people = l.relations.filter((r) => r.npc.alive || r.kind === "mother" || r.kind === "father");
    const order = ["spouse", "partner", "mother", "father", "child", "sibling", "friend", "ex"];
    people.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const rows = people.map((r) => {
      const bar = el("div", "h-1.5 rounded-full bg-emerald-500");
      bar.style.width = `${r.closeness}%`;
      const actions: [Interaction, string][] = [
        ["time", "Spend time"],
        ["compliment", "Compliment"],
        ["gift", "Gift"],
        ["argue", "Argue"],
      ];
      if (r.kind === "mother" || r.kind === "father") actions.push(["money", "Ask for money"]);
      if (r.kind === "partner") actions.push(["propose", "Propose"]);
      if (r.kind === "partner" || r.kind === "spouse") actions.push(["baby", "Try for a baby"], ["breakup", r.kind === "spouse" ? "Divorce" : "Break up"]);
      const acts = el("div", "mt-2 hidden flex-wrap gap-1");
      for (const [a, label] of actions)
        acts.append(
          button(label, "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-emerald-100", () => {
            this.hooks.toast(interact(l, r.npc.id, a) || "Not now.");
            this.hooks.changed();
          }),
        );
      const head = button(
        el(
          "div",
          "flex w-full items-center gap-3",
          el("span", "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-200 text-sm font-black text-slate-600", r.npc.first[0]),
          el("div", "min-w-0 flex-1", el("p", "truncate text-sm font-bold", `${fullName(r.npc)}${r.npc.alive ? "" : " †"}`), el("p", "text-[11px] text-slate-500", `${REL_LABEL[r.kind]} · ${r.npc.age}${r.npc.job ? ` · ${r.npc.job}` : ""}`), el("div", "mt-1 h-1.5 w-full rounded-full bg-slate-200", bar)),
        ),
        "w-full text-left",
        () => r.npc.alive && acts.classList.toggle("hidden"),
      );
      return el("div", "rounded-xl border border-slate-200 bg-white p-2.5", head, acts);
    });
    this.body.replaceChildren(this.section("Relationships", ...(rows.length ? rows : [el("p", "text-sm text-slate-500", "Nobody yet.")])));
  }

  private renderActivities(l: Life) {
    const groups = new Map<string, HTMLElement[]>();
    for (const a of ACTIVITIES) {
      const ok = canDo(l, a);
      const b = button(el("span", "flex w-full items-center justify-between gap-2", el("span", "", a.name), el("span", "text-[11px] font-normal text-slate-500", ok === true ? (a.cost ? money(a.cost) : "") : ok)), BTN, () => {
        this.hooks.toast(doActivity(l, a.id));
        this.hooks.changed();
      }, `life-act-${a.id}`);
      (b as HTMLButtonElement).disabled = ok !== true;
      (groups.get(a.group) ?? groups.set(a.group, []).get(a.group)!).push(b);
    }
    this.body.replaceChildren(...[...groups.entries()].map(([g, items]) => this.section(g, ...items)));
  }

  private renderWork(l: Life) {
    const parts: Node[] = [];
    if (l.job) {
      const c = careerById(l.job.career)!;
      const perf = el("div", "h-2 rounded-full bg-emerald-500");
      perf.style.width = `${l.job.performance}%`;
      parts.push(this.section("Your job", el("div", "rounded-xl border border-slate-200 bg-white p-3", el("p", "font-bold", c.ladder[l.job.level]), el("p", "text-xs text-slate-500", `${money(salary(l))} a year · ${l.job.years} year${l.job.years === 1 ? "" : "s"} · at ${c.place}`), el("p", "mt-2 text-[11px] font-semibold text-slate-500", "Performance"), el("div", "h-2 w-full rounded-full bg-slate-200", perf), el("p", "mt-2 text-[11px] text-slate-500", "Work shifts in 3D (Live today → your workplace) to raise your performance and earn extra."))));
    }
    // School.
    const sch = l.school;
    const school: Node[] = [];
    if (sch.stage === "primary" || sch.stage === "high" || sch.stage === "uni") {
      const g = el("div", "h-2 rounded-full bg-blue-500");
      g.style.width = `${sch.grades}%`;
      school.push(el("div", "rounded-xl border border-slate-200 bg-white p-3", el("p", "font-bold", sch.stage === "uni" ? `Harbour University · ${DEGREES.find((d) => d.id === sch.uni)?.name}` : sch.stage === "high" ? "Bayview High" : "Harbour Primary"), el("p", "mt-1 text-[11px] font-semibold text-slate-500", "Grades"), el("div", "h-2 w-full rounded-full bg-slate-200", g)));
    }
    if (l.degrees.length) school.push(el("p", "text-xs text-slate-600", `Qualifications: ${l.degrees.map((d) => (d === "high" ? "High school" : DEGREES.find((x) => x.id === d)?.name)).join(", ")}`));
    if (isAdult(l) && l.degrees.includes("high") && sch.stage !== "uni")
      for (const d of DEGREES) {
        const b = button(el("span", "flex w-full justify-between", `Study ${d.name}`, el("span", "text-[11px] font-normal text-slate-500", `${d.years} yrs · ${money(d.cost)}`)), BTN, () => {
          this.hooks.toast(enrolUni(l, d.id));
          this.hooks.changed();
        }, `life-uni-${d.id}`);
        school.push(b);
      }
    if (school.length) parts.push(this.section("Education", ...school));
    // Jobs board.
    if (l.me.age >= 14) {
      const list = CAREERS.filter((c) => l.me.age >= c.minAge && (c.partTime || isAdult(l))).map((c) => {
        const q = qualifies(l, c.id);
        const b = button(el("span", "flex w-full items-center justify-between gap-2", el("span", "", el("span", "block", c.ladder[0]), el("span", "block text-[11px] font-normal text-slate-500", c.blurb)), el("span", "shrink-0 text-right text-[11px] font-normal text-slate-500", q === true ? `${money(c.pay[0])}/yr` : q)), BTN, () => {
          this.hooks.toast(applyFor(l, c.id));
          this.hooks.changed();
        }, `life-job-${c.id}`);
        (b as HTMLButtonElement).disabled = q !== true || l.job?.career === c.id;
        return b;
      });
      parts.push(this.section(l.job ? "Other jobs" : "Job openings", ...list));
    } else parts.push(el("p", "text-sm text-slate-500", "You can get a part-time job at 14."));
    this.body.replaceChildren(...parts);
  }

  private renderAssets(l: Life) {
    const parts: Node[] = [];
    const home = livesWithParents(l) ? "Living with family" : `${l.home.owned ? "Own" : "Rent"} · ${PLOTS[l.home.plot]?.number} ${PLOTS[l.home.plot]?.street}`;
    parts.push(this.section("Home", el("div", "rounded-xl border border-slate-200 bg-white p-3", el("p", "font-bold", home), el("p", "text-[11px] text-slate-500", isAdult(l) ? "Buy or rent a place at Harbour Realty on Main Street (Live today), then build your dream house." : "You can move out at 18."))));
    const cars = l.cars.map((id) => el("p", "text-sm", `🚗 ${CARS.find((c) => c.id === id)?.name}`));
    const shop = l.me.age >= 16
      ? CARS.map((c) => {
          const b = button(el("span", "flex w-full justify-between", c.name, el("span", "text-[11px] font-normal text-slate-500", money(c.price))), BTN, () => {
            this.hooks.toast(buyCar(l, c.id));
            this.hooks.changed();
          }, `life-car-${c.id}`);
          (b as HTMLButtonElement).disabled = l.money < c.price || l.cars.includes(c.id);
          return b;
        })
      : [el("p", "text-sm text-slate-500", "You can drive at 16.")];
    parts.push(this.section("Cars", ...(cars.length ? cars : [el("p", "text-sm text-slate-500", "No car yet.")]), ...shop));
    parts.push(this.section("Record", el("p", "text-sm text-slate-600", l.record.length ? `Criminal record: ${l.record.join(", ")}` : "Clean record."), el("p", "text-sm text-slate-600", l.conditions.length ? `Health: ${l.conditions.join(", ")}` : "No health conditions."), el("p", "text-sm text-slate-600", `Fame: ${l.fame}%`)));
    this.body.replaceChildren(...parts);
  }

  private renderDeath(l: Life) {
    this.modal.classList.replace("grid", "hidden");
    const kids = heirs(l);
    const ribbons = ribbonsOf(l);
    const score = lifeScore(l);
    const wrap = el(
      "div",
      "flex flex-col items-center gap-3 py-4 text-center",
      el("p", "text-5xl", "🪦"),
      el("p", "text-xl font-black", `${fullName(l.me)}`),
      el("p", "text-sm text-slate-600", `${l.year - l.me.age} – ${l.year} · died of ${l.me.cause} at ${l.me.age}`),
      el("div", "flex flex-wrap justify-center gap-1", ...(ribbons.length ? ribbons.map((r) => el("span", "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800", `🎗 ${r.name}`)) : [el("span", "text-xs text-slate-500", "No ribbons this time.")])),
      el("div", "grid w-full grid-cols-3 gap-2 text-xs", ...[["Net worth", money(l.money)], ["Kids", String(l.totals.kids)], ["Days lived in 3D", String(l.totals.daysPlayed)]].map(([k, v]) => el("div", "rounded-xl bg-white p-2 shadow-sm", el("p", "text-slate-500", k), el("p", "font-black", v)))),
      el("p", "text-xs uppercase tracking-[0.25em] text-slate-500", "Life score"),
      el("p", "text-4xl font-black text-emerald-600", String(score)),
    );
    wrap.setAttribute("data-testid", "life-death");
    if (kids.length) wrap.append(el("p", "mt-2 text-sm font-bold", "Carry on as one of your children:"), ...kids.map((k) => button(`${fullName(k.npc)} (${k.npc.age})`, `${BTN} w-full text-center`, () => this.hooks.continueAs(k.npc.id), `life-heir-${k.npc.id}`)));
    wrap.append(button("Start a new life", `${BTN} w-full text-center`, () => this.hooks.newLife(), "life-new"), button("Finish & post score", "w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-black text-white", () => this.hooks.finish(), "life-finish"));
    this.body.replaceChildren(wrap);
  }
}
