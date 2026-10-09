/**
 * The controller between the rules (sim.ts) and the React UI: holds the game, applies the
 * player's actions, saves after each one, plays the sounds, keeps the player's settings, and
 * tells the UI (and the platform's score) when something changes.
 */
import { SAVE_KEY, type PartyId } from "./data";
import * as G from "./sim";
import { Sound } from "./audio";
import type { MapMode } from "./ui/mapColors";

export type Tab = "bills" | "write" | "events" | "chamber" | "parties" | "party" | "country" | "news" | "missions" | "settings" | null;
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
  ui: UIState = { tab: "missions", view: "map", mapMode: "politics", house: "house", state: null, bill: null, law: null, event: null, studio: null, toasts: [], count: 0 };
  prefs: Prefs = { ...DEFAULT_PREFS };
  readonly sound = new Sound();
  private listeners = new Set<() => void>();
  private version = 0;
  private startedAt = performance.now();
  private toastId = 1;
  paused = false;

  constructor(private scorer: Scorer) {
    try {
      this.s = G.load(localStorage.getItem(SAVE_KEY));
    } catch {
      this.s = null;
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

  newGame(party: PartyId, seed = Math.floor(Math.random() * 1e6) + 1) {
    this.s = G.newGame(seed, party);
    this.startedAt = performance.now();
    this.ui = { ...this.ui, tab: "missions", view: "map", state: null, bill: null, law: null, event: null, studio: null, count: 0 };
    this.sound.play("start");
    this.changed();
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
    if (!s || s.over || s.election) return;
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
    } else if (s.lawsPassed > lawsBefore) this.sound.play("gavel");
    else this.sound.play("turn");
    // The two biggest stories of the week.
    for (const n of fresh.filter((x) => x.tone !== 0).slice(0, 2)) this.toast(n.text, n.tone);
    if (!fresh.some((x) => x.tone !== 0) && fresh[0]) this.toast(fresh[0].text, 0);
    if (s.over) this.finish();
    this.changed();
  }

  /** The count has finished: seats change hands. */
  closeElection() {
    const s = this.s;
    if (!s?.election) return;
    const won = s.election.president?.party === s.party || s.election.houseSeats[s.party] > s.election.prevHouse[s.party];
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
    if (!r.ok) return this.toast("You can't hold that now", -1);
    if (r.backfired) {
      this.sound.play("bad");
      this.toast("It didn't go well…", -1);
    } else {
      this.sound.play(r.poll ? "click" : "cheer");
      this.toast(r.poll ? "Poll results are in" : "Event held", 1);
    }
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

  repealLaw(id: string) {
    if (!this.s) return;
    const name = G.lawOf(this.s, id)?.name ?? "The law";
    if (!G.repealLaw(this.s, id)) return this.toast("Not while a bill on it is going through", -1);
    this.toast(`${name} is struck from the books`, 0);
    this.setUI({ law: null, studio: null });
    this.changed();
  }
}
