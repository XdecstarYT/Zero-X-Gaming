/**
 * The controller between the rules (sim.ts) and the React UI: holds the game, applies the
 * player's actions, saves after each one, plays the sounds, keeps the player's settings and
 * their library of custom scenarios, and tells the UI (and the platform's score) when
 * something changes.
 */
import { EVENT, SAVE_KEY, type PartyId } from "./data";
import { mapReady, prepareMap } from "./map";
import { checkScenario, readCode, type Scenario } from "./scenario";
import * as C from "./campaign";
import * as P from "./politics";
import * as G from "./sim";
import { Sound } from "./audio";
import type { MapMode } from "./ui/mapColors";

const LIBRARY_KEY = "zx-yourgov-scenarios";
/** Most custom scenarios kept. */
export const LIBRARY_MAX = 24;

export type Tab = "bills" | "write" | "events" | "chamber" | "parties" | "party" | "country" | "news" | "missions" | "settings" | "voters" | "gov" | "hq" | null;
/** The pages of the polling centre (the parties panel). */
export type PollPage = "parties" | "groups" | "regions" | "leaders" | "issues" | "seats";
export type HqPage = "staff" | "manifesto" | "position";
/** The sections of the events panel. */
export type EventKind = "campaign" | "voters" | "money" | "party" | "diary";

/** An outcome worth a card of its own (a debate, a referendum, a challenge). */
export interface ResultCard {
  icon: string;
  title: string;
  lines: string[];
  tone: 1 | 0 | -1;
}
export type View = "map" | "chamber";
export type { MapMode };

export interface UIState {
  tab: Tab;
  view: View;
  mapMode: MapMode;
  /** Which house the chamber view shows. */
  house: "house" | "senate";
  /** Selected state on the map (for events and polls). */
  state: number | null;
  bill: number | null;
  law: string | null;
  event: string | null;
  /** Which section of the events panel is open. */
  evKind: EventKind;
  /** The week an event is for (the current week, or a later one to plan it). */
  evWeek: number | null;
  /** Portfolio whose minister is being picked. */
  appoint: string | null;
  /** Modals put off until next week (crisis, debate or challenge), by the week. */
  later: Record<string, number>;
  result: ResultCard | null;
  poll: PollPage;
  hq: HqPage;
  /** The budget card is open (outside budget season too). */
  budget: boolean;
  /** The law studio: drafting a new law (id null) or editing one of yours. */
  studio: { id: string | null } | null;
  toasts: { id: number; text: string; tone: 1 | 0 | -1 }[];
  /** Election count progress 0–1 (animated by the UI). */
  count: number;
}

export interface Prefs {
  gfx: "auto" | "high" | "low";
  sound: boolean;
  clouds: boolean;
  /** How strongly the politics are painted over the land, 0–1. */
  overlay: number;
  /** Tips for a new player (cleared when they're dismissed). */
  tips: boolean;
}

const PREFS_KEY = "zx-yourgov-prefs";
const DEFAULT_PREFS: Prefs = { gfx: "auto", sound: true, clouds: true, overlay: 0.8, tips: true };

export interface Scorer {
  progress(n: number): void;
  final(n: number): void;
}

export class Game {
  s: G.GameState | null = null;
  ui: UIState = { tab: "missions", view: "map", mapMode: "politics", house: "house", state: null, bill: null, law: null, event: null, evKind: "campaign", evWeek: null, appoint: null, later: {}, result: null, poll: "parties", hq: "staff", budget: false, studio: null, toasts: [], count: 0 };
  prefs: Prefs = { ...DEFAULT_PREFS };
  readonly sound = new Sound();
  private listeners = new Set<() => void>();
  private version = 0;
  private startedAt = performance.now();
  private toastId = 1;
  paused = false;
  /** Waiting for a saved real country's map data to load. */
  loadingSave = false;
  /** The player's own scenarios. */
  library: Scenario[] = [];

  constructor(private scorer: Scorer) {
    try {
      this.s = G.load(localStorage.getItem(SAVE_KEY));
    } catch {
      this.s = null;
    }
    // A saved real country needs its map before anything can be drawn.
    if (this.s && !mapReady(this.s.sc.map)) {
      const s = this.s;
      this.s = null;
      this.loadingSave = true;
      prepareMap(s.sc.map)
        .then(() => {
          this.s = s;
        })
        .catch(() => {
          this.s = null;
        })
        .finally(() => {
          this.loadingSave = false;
          this.changed(false);
        });
    }
    try {
      const raw = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "[]") as unknown[];
      this.library = (Array.isArray(raw) ? raw : []).map((x) => checkScenario(x)).filter((x): x is Scenario => typeof x !== "string");
    } catch {
      this.library = [];
    }
    try {
      this.prefs = { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
    } catch {
      /* defaults */
    }
    this.sound.enabled = this.prefs.sound;
  }

  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => void this.listeners.delete(f);
  };
  getVersion = () => this.version;

  private changed(save = true) {
    this.version++;
    if (save && this.s && !this.s.over)
      for (const a of C.checkAchievements(this.s)) {
        this.sound.play("win");
        this.toast(`${a.icon} Achievement: ${a.name}`, 1);
      }
    if (save && this.s) {
      try {
        localStorage.setItem(SAVE_KEY, G.save(this.s));
      } catch {
        /* storage full or blocked: play on */
      }
      this.scorer.progress(this.s.score);
    }
    this.listeners.forEach((f) => f());
  }

  setUI(p: Partial<UIState>) {
    this.ui = { ...this.ui, ...p };
    this.changed(false);
  }

  setPrefs(p: Partial<Prefs>) {
    this.prefs = { ...this.prefs, ...p };
    this.sound.enabled = this.prefs.sound;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      /* ignore */
    }
    this.changed(false);
  }

  /** The graphics level to use (auto picks low on small or modest devices). */
  get quality(): "high" | "low" {
    if (this.prefs.gfx !== "auto") return this.prefs.gfx;
    if (typeof navigator === "undefined") return "high";
    const nav = navigator as Navigator & { deviceMemory?: number };
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    return (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || (nav.hardwareConcurrency ?? 8) <= 4 || small ? "low" : "high";
  }

  toast(text: string, tone: 1 | 0 | -1 = 0) {
    const id = this.toastId++;
    this.setUI({ toasts: [...this.ui.toasts, { id, text, tone }].slice(-3) });
    setTimeout(() => this.setUI({ toasts: this.ui.toasts.filter((t) => t.id !== id) }), 3600);
  }

  // ------------------------------------------------------------------ lifecycle

  /** Start a career (the scenario's map must be loaded: see `prepare`). */
  newGame(party: PartyId, seed = Math.floor(Math.random() * 1e6) + 1, scenario?: Scenario) {
    this.s = G.newGame(seed, party, scenario ? { scenario: structuredClone(scenario) } : {});
    this.startedAt = performance.now();
    this.ui = { ...this.ui, tab: "missions", view: "map", state: null, bill: null, law: null, event: null, evKind: "campaign", evWeek: null, appoint: null, later: {}, result: null, poll: "parties", hq: "staff", budget: false, studio: null, count: 0 };
    this.sound.play("start");
    this.changed();
  }

  /** Load what a scenario's map needs (real countries' outlines and elevation). */
  async prepare(sc: Scenario) {
    if (mapReady(sc.map)) return;
    await prepareMap(sc.map);
    this.changed(false);
  }

  // ------------------------------------------------------------------ custom scenarios

  private saveLibrary() {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(this.library));
    } catch {
      /* storage full or blocked */
    }
    this.changed(false);
  }

  /** Keep a scenario in the library (replacing one with the same id). Returns an error, or null. */
  saveScenario(raw: Scenario): string | null {
    const sc = checkScenario(raw);
    if (typeof sc === "string") return sc;
    if (!sc.id.startsWith("custom-")) sc.id = `custom-${Date.now().toString(36)}`;
    const i = this.library.findIndex((x) => x.id === sc.id);
    if (i >= 0) this.library[i] = sc;
    else {
      if (this.library.length >= LIBRARY_MAX) return `You can keep ${LIBRARY_MAX} scenarios. Delete one first.`;
      this.library = [...this.library, sc];
    }
    this.saveLibrary();
    return null;
  }

  deleteScenario(id: string) {
    this.library = this.library.filter((x) => x.id !== id);
    this.saveLibrary();
  }

  /** Add a scenario someone shared as a code. Returns it, or why it couldn't be read. */
  importScenario(code: string): Scenario | string {
    const sc = readCode(code);
    if (typeof sc === "string") return sc;
    sc.id = `custom-${Date.now().toString(36)}`;
    const err = this.saveScenario(sc);
    return err ?? this.library[this.library.length - 1];
  }

  quit() {
    this.s = null;
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    this.changed(false);
  }

  /** End your career now: the score is final. */
  retire() {
    if (!this.s) return;
    this.s.over = true;
    this.finish();
    this.changed();
  }

  private finish() {
    if (!this.s) return;
    this.scorer.final(this.s.score);
  }

  get activeMs() {
    return performance.now() - this.startedAt;
  }

  // ------------------------------------------------------------------ the turn

  endTurn() {
    const s = this.s;
    if (!s || s.over || s.election || s.talks) return;
    const before = s.news[0] ?? null;
    const lawsBefore = s.lawsPassed;
    G.endTurn(s);
    const fresh: G.NewsItem[] = [];
    for (const n of s.news) {
      if (n === before) break;
      fresh.push(n);
    }
    if (s.election) {
      this.setUI({ count: 0, tab: null, view: "map", studio: null });
      this.sound.play("count");
    } else if (s.talks) this.sound.play("paper");
    else if (s.lawsPassed > lawsBefore) this.sound.play("gavel");
    else this.sound.play("turn");
    // The two biggest stories of the week.
    for (const n of fresh.filter((x) => x.tone !== 0).slice(0, 2)) this.toast(n.text, n.tone);
    if (!fresh.some((x) => x.tone !== 0) && fresh[0]) this.toast(fresh[0].text, 0);
    if (s.ousted) this.setUI({ result: { icon: "👋", title: "Ousted", lines: [`Your party has removed you as ${G.titles(s).leader.toLowerCase()}.`], tone: -1 } });
    if (s.over) this.finish();
    this.changed();
  }

  /** The count has finished: seats change hands. */
  closeElection() {
    const s = this.s;
    if (!s?.election) return;
    const won = s.election.president?.party === s.party || (s.election.houseSeats[s.party] ?? 0) > (s.election.prevHouse[s.party] ?? 0);
    G.closeElection(s);
    this.sound.play(won ? "win" : "lose");
    this.setUI({ tab: "chamber", view: "chamber", house: "house" });
    this.changed();
  }

  // ------------------------------------------------------------------ actions

  writeBill(law: string, option: number) {
    if (!this.s) return;
    const b = G.writeBill(this.s, law, option);
    if (!b) return this.toast("That bill can't be put forward right now", -1);
    this.sound.play("paper");
    this.toast(`Bill sent to Committee ${G.committeeName(G.lawOf(this.s, law)!)}`, 1);
    this.setUI({ tab: "bills", bill: b.id });
    this.changed();
  }

  vote(bill: number, v: -1 | 0 | 1) {
    if (!this.s || !G.castVote(this.s, bill, v)) return;
    this.sound.play("click");
    this.changed();
  }

  lobby(bill: number, party: PartyId) {
    if (!this.s) return;
    if (!G.lobby(this.s, bill, party)) return this.toast("Not enough party funds", -1);
    this.sound.play("coin");
    this.changed();
  }

  holdEvent(id: string, state?: number) {
    if (!this.s) return;
    const r = G.holdEvent(this.s, id, state ?? this.ui.state ?? this.s.homeState);
    if (!r.ok) return this.toast(r.why ?? "You can't hold that now", -1);
    const again = G.eventUses(this.s, id) < 2;
    if (r.backfired) {
      this.sound.play("bad");
      this.toast("It didn't go well…", -1);
    } else if (r.raised !== undefined) {
      this.sound.play("coin");
      this.toast(`Raised ${r.raised >= 0 ? "" : "–"}${this.s.sc.economy.cur}${Math.abs(r.raised).toFixed(1)} M${again ? ". You can hold it once more this week" : ""}`, 1);
    } else {
      this.sound.play(r.poll ? "click" : "cheer");
      this.toast(r.poll ? "Poll results are in" : again ? "Event held. You can hold it once more this week" : "Event held", 1);
    }
    this.changed();
  }

  /** Book an event for a later week (it's held and paid for when the week comes). */
  planEvent(id: string, week: number, state?: number) {
    if (!this.s) return;
    const r = P.schedule(this.s, id, week, state ?? this.ui.state ?? this.s.homeState);
    if (typeof r === "string") return this.toast(r, -1);
    this.sound.play("paper");
    this.toast(`${EVENT[id].name} planned for ${G.dateLabel(this.s, week)}`, 1);
    this.changed();
  }

  unplan(id: number) {
    if (!this.s || !P.unschedule(this.s, id)) return;
    this.sound.play("click");
    this.changed();
  }

  // ------------------------------------------------------------------ the wider politics

  /** Put a decision (crisis, debate, challenge…) off to the end of the week. */
  later(kind: "crisis" | "debate" | "challenge" | "qt" | "scandal" | "budget") {
    if (!this.s) return;
    this.setUI({ later: { ...this.ui.later, [kind]: this.s.week } });
  }

  debate(style: P.DebateStyle) {
    const s = this.s;
    if (!s?.debate) return;
    const rival = G.party(s, s.debate.rival);
    const topic = P.DEBATE_TOPICS.find((x) => x.id === s.debate!.topics[s.debate!.answers.length]);
    const r = P.debateAnswer(s, style);
    if (!r) return;
    this.sound.play(r.points > 3 ? "cheer" : r.points < 0 ? "bad" : "click");
    if (r.done) {
      const d = r.done;
      this.setUI({ result: { icon: "🎙️", title: d.won ? "You won the debate" : d.lost ? `The ${rival.short} won the debate` : "No clear winner", lines: [`Your answers scored ${d.total.toFixed(1)} points.`, d.won ? "The polls move your way, and the groups you spoke to remember it." : d.lost ? "Your rival gets a lift in the polls." : "The race is unchanged."], tone: d.won ? 1 : d.lost ? -1 : 0 } });
    } else this.toast(`On ${topic?.name ?? "that"}: ${r.points >= 4 ? "a strong answer" : r.points >= 1 ? "a solid answer" : r.points >= -1 ? "a shaky answer" : "a bad moment"} (${r.points > 0 ? "+" : ""}${r.points.toFixed(1)})`, r.points > 1 ? 1 : r.points < -1 ? -1 : 0);
    this.changed();
  }

  crisis(choice: number) {
    const s = this.s;
    if (!s || !P.answerCrisis(s, choice)) return;
    this.sound.play("paper");
    this.toast(s.news[0]?.text ?? "Decided", s.news[0]?.tone ?? 0);
    this.changed();
  }

  challenge(a: P.ChallengeAnswer) {
    const s = this.s;
    if (!s?.challenge) return;
    if (a === "congress" && s.parties[s.party].funds < P.CONGRESS_COST) return this.toast("Not enough party funds for a congress", -1);
    const r = P.answerChallenge(s, a);
    if (!r) return;
    this.sound.play(r.survived ? "win" : "lose");
    if (a !== "concede") this.setUI({ result: { icon: r.survived ? "👑" : "👋", title: r.survived ? "You survive the challenge" : "Ousted", lines: [`${Math.round(r.support * 100)}% of the party backed you.`, r.survived ? "The rebels fall into line, for now." : `Your career as ${G.titles(s).leader.toLowerCase()} is over.`], tone: r.survived ? 1 : -1 } });
    if (s.over) this.finish();
    this.changed();
  }

  appoint(portfolio: string, id: number) {
    const s = this.s;
    if (!s || !P.appoint(s, portfolio, id)) return this.toast("You can't appoint them", -1);
    this.sound.play("paper");
    this.toast(`${G.fullName(G.pol(s, id)!)} is the new ${P.ministerTitle(s, portfolio)}`, 1);
    this.setUI({ appoint: null });
    this.changed();
  }

  order(id: string) {
    const s = this.s;
    if (!s) return;
    const r = P.issueOrder(s, id);
    if (!r.ok) return this.toast(r.why ?? "You can't do that now", -1);
    this.sound.play(r.blocked ? "bad" : "gavel");
    this.toast(r.blocked ? "The courts block it" : `${P.ORDER[id].name}: done`, r.blocked ? -1 : 1);
    this.changed();
  }

  referendum(law: string, option: number) {
    const s = this.s;
    if (!s) return;
    const r = P.callReferendum(s, law, option);
    if (typeof r === "string") return this.toast(r, -1);
    const l = G.lawOf(s, law)!;
    this.sound.play(r.passed ? "win" : "lose");
    this.setUI({ result: { icon: "🗳️", title: r.passed ? "Yes wins" : "No wins", lines: [`Referendum on ${l.name.toLowerCase()} (${l.options[option].label}).`, `Yes ${Math.round(r.yes * 100)}% · No ${Math.round((1 - r.yes) * 100)}%`, r.passed ? "The law changes today." : "The law stays as it is, and your government takes a knock."], tone: r.passed ? 1 : -1 } });
    this.changed();
  }

  diplomacy(name: string, a: P.ForeignAction) {
    const s = this.s;
    if (!s) return;
    const r = P.diplomacy(s, name, a);
    if (!r.ok) return this.toast(r.why ?? "You can't do that now", -1);
    this.sound.play(r.success ? "cheer" : "bad");
    this.toast(s.news[0]?.text ?? "Done", r.success ? 1 : -1);
    this.changed();
  }

  // ------------------------------------------------------------------ the campaign machine

  commissionMrp() {
    const s = this.s;
    if (!s) return;
    const e = C.commissionMrp(s);
    if (e) return this.toast(e, -1);
    this.sound.play("paper");
    this.toast("The seat projection is in", 1);
    this.changed();
  }

  hire(role: string, i: number) {
    const s = this.s;
    if (!s) return;
    const e = C.hire(s, role, i);
    if (e) return this.toast(e, -1);
    this.sound.play("cheer");
    this.changed();
  }

  fire(role: string) {
    const s = this.s;
    if (!s || !C.fire(s, role)) return;
    this.sound.play("click");
    this.changed();
  }

  publishManifesto(pledges: C.Pledge[]) {
    const s = this.s;
    if (!s) return;
    const e = C.publishManifesto(s, pledges);
    if (e) return this.toast(e, -1);
    this.sound.play("cheer");
    this.toast("Your manifesto is out", 1);
    this.changed();
  }

  draftBudget(plan: C.BudgetPlan) {
    const s = this.s;
    if (!s) return;
    const e = C.draftBudget(s, plan);
    if (e) return this.toast(e, -1);
    this.sound.play("paper");
    this.toast(`The budget goes to the ${G.sys(s).lower.short} in week ${G.BUDGET_WEEK}`, 1);
    this.setUI({ budget: false });
    this.changed();
  }

  questionTime(style: string) {
    const s = this.s;
    if (!s?.qt) return;
    const pts = C.answerQT(s, style);
    if (pts === null) return;
    this.sound.play(pts >= 1 ? "cheer" : pts <= -2 ? "bad" : "click");
    this.toast(s.news[0]?.text ?? "Done", pts >= 1 ? 1 : pts <= -2 ? -1 : 0);
    this.changed();
  }

  scandal(choice: number) {
    const s = this.s;
    if (!s?.scandal) return;
    const r = C.answerScandal(s, choice);
    this.sound.play(r?.worse ? "bad" : "paper");
    this.toast(s.news[0]?.text ?? "Done", r?.worse ? -1 : 0);
    this.changed();
  }

  moveParty(dir: C.MoveDir) {
    const s = this.s;
    if (!s) return;
    const e = C.moveParty(s, dir);
    if (e) return this.toast(e, -1);
    this.sound.play("paper");
    this.toast(s.news[0]?.text ?? "Done", 0);
    this.changed();
  }

  speech(id: string) {
    const s = this.s;
    if (!s || !C.electionSpeech(s, id)) return;
    this.sound.play("cheer");
    this.changed();
  }

  leaveGovernment() {
    const s = this.s;
    if (!s || !P.leaveGovernment(s)) return;
    this.sound.play("paper");
    this.toast("Your party leaves the government", 0);
    this.changed();
  }

  /** Draft a new law (or save changes to one of yours). Returns an error message, or null. */
  saveLaw(d: G.LawDraft, id: string | null): string | null {
    if (!this.s) return "No game";
    const r = id ? G.editLaw(this.s, id, d) : G.draftLaw(this.s, d);
    if (typeof r === "string") return r;
    this.sound.play("paper");
    this.toast(id ? `${r.name}: changes saved` : `${r.name} is on the books. Write a bill to change it.`, 1);
    this.setUI({ studio: null, tab: "write", law: r.id });
    this.changed();
    return null;
  }

  /** Answer coalition talks: an option's index, or -1 (decline, or govern alone). */
  chooseGovernment(i: number) {
    if (!this.s || !G.chooseGovernment(this.s, i)) return;
    this.sound.play(G.inGovernment(this.s) ? "cheer" : "click");
    this.changed();
  }

  /** As head of government, call an early election. */
  callElection() {
    if (!this.s) return;
    if (!G.callElection(this.s)) return this.toast("You can't call an election now", -1);
    this.sound.play("paper");
    this.toast(`An election is called for ${G.dateLabel(this.s, this.s.cal.lower)}`, 1);
    this.changed();
  }

  /** In opposition, table a motion of no confidence. */
  noConfidence() {
    if (!this.s) return;
    const r = G.noConfidence(this.s);
    if (!r.ok) return this.toast("You can't table a motion now", -1);
    this.sound.play(r.passed ? "gavel" : "bad");
    this.toast(r.passed ? "The motion carries: the government falls" : `The motion is defeated, ${r.tally!.yes} to ${r.tally!.no}`, r.passed ? 1 : -1);
    this.changed();
  }

  repealLaw(id: string) {
    if (!this.s) return;
    const name = G.lawOf(this.s, id)?.name ?? "The law";
    if (!G.repealLaw(this.s, id)) return this.toast("Not while a bill on it is going through", -1);
    this.toast(`${name} is struck from the books`, 0);
    this.setUI({ law: null, studio: null });
    this.changed();
  }
}
