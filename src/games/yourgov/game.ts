/**
 * The controller between the rules (sim.ts) and the React UI: holds the game, applies the
 * player's actions, saves after each one, and tells the UI (and the platform's score) when
 * something changes.
 */
import { LAW, SAVE_KEY, type PartyId } from "./data";
import * as G from "./sim";

export type Tab = "bills" | "write" | "events" | "chamber" | "parties" | "party" | "country" | "news" | "missions" | null;
export type View = "map" | "chamber";
export type MapMode = "politics" | "states" | "support";

export interface UIState {
  tab: Tab;
  view: View;
  mapMode: MapMode;
  /** Selected state on the map (for events and polls). */
  state: number | null;
  bill: number | null;
  law: string | null;
  event: string | null;
  toast: { text: string; tone: 1 | 0 | -1; at: number } | null;
  /** Election count progress 0–1 (animated by the UI). */
  count: number;
}

export interface Scorer {
  progress(n: number): void;
  final(n: number): void;
}

export class Game {
  s: G.GameState | null = null;
  ui: UIState = { tab: "missions", view: "map", mapMode: "politics", state: null, bill: null, law: null, event: null, toast: null, count: 0 };
  private listeners = new Set<() => void>();
  private version = 0;
  private startedAt = performance.now();
  paused = false;

  constructor(private scorer: Scorer) {
    try {
      this.s = G.load(localStorage.getItem(SAVE_KEY));
    } catch {
      this.s = null;
    }
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

  toast(text: string, tone: 1 | 0 | -1 = 0) {
    this.setUI({ toast: { text, tone, at: performance.now() } });
  }

  // ------------------------------------------------------------ lifecycle

  newGame(party: PartyId, seed = Math.floor(Math.random() * 1e6) + 1) {
    this.s = G.newGame(seed, party);
    this.startedAt = performance.now();
    this.ui = { ...this.ui, tab: "missions", view: "map", state: null, bill: null, law: null, event: null, count: 0 };
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

  // ------------------------------------------------------------ the turn

  endTurn() {
    const s = this.s;
    if (!s || s.over || s.election) return;
    const before = s.news.length ? s.news[0] : null;
    G.endTurn(s);
    if (s.election) this.setUI({ count: 0, tab: null, view: "map" });
    const fresh = s.news.length && s.news[0] !== before ? s.news[0] : null;
    if (fresh) this.toast(fresh.text, fresh.tone);
    if (s.over) this.finish();
    this.changed();
  }

  /** The count has finished: seats change hands. */
  closeElection() {
    if (!this.s?.election) return;
    G.closeElection(this.s);
    this.setUI({ tab: "chamber", view: "chamber" });
    this.changed();
  }

  // ------------------------------------------------------------ actions

  writeBill(law: string, option: number) {
    if (!this.s) return;
    const b = G.writeBill(this.s, law, option);
    if (!b) return this.toast("That bill can't be put forward right now", -1);
    this.toast(`Bill submitted to Committee ${G.committeeName(LAW[law])}`, 1);
    this.setUI({ tab: "bills", bill: b.id });
    this.changed();
  }

  vote(bill: number, v: -1 | 0 | 1) {
    if (!this.s || !G.castVote(this.s, bill, v)) return;
    this.changed();
  }

  lobby(bill: number, party: PartyId) {
    if (!this.s) return;
    if (!G.lobby(this.s, bill, party)) return this.toast("Not enough party funds", -1);
    this.changed();
  }

  holdEvent(id: string, state?: number) {
    if (!this.s) return;
    const r = G.holdEvent(this.s, id, state ?? this.ui.state ?? this.s.homeState);
    if (!r.ok) return this.toast("You can't hold that now", -1);
    if (r.backfired) this.toast("It didn't go well…", -1);
    else if (r.poll) this.toast("Poll results are in", 1);
    else this.toast("Event held", 1);
    this.changed();
  }
}
