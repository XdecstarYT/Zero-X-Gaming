/**
 * Tennis scoring: points (love, 15, 30, 40, deuce, advantage), games, sets
 * won by two with a tiebreak at 6–6, best-of-one or best-of-three, or a single
 * match tiebreak to 10. Also who serves, and from which side.
 */

export type MatchFormat = "tiebreak" | "set" | "three";

export const FORMATS: Record<MatchFormat, { name: string; sub: string }> = {
  tiebreak: { name: "Match tiebreak", sub: "First to 10, win by 2" },
  set: { name: "One set", sub: "First to 6 games, tiebreak at 6–6" },
  three: { name: "Best of three", sub: "The full match" },
};

export type Side = 0 | 1;

export interface PointResult {
  game: boolean;
  set: boolean;
  match: boolean;
}

const CALLS = ["0", "15", "30", "40"];

export class TennisScore {
  /** Completed sets' games (or tiebreak points, for a match tiebreak). */
  sets: [number, number][] = [];
  games: [number, number] = [0, 0];
  points: [number, number] = [0, 0];
  tiebreak: boolean;
  server: Side;
  winner: Side | -1 = -1;
  /** Who served the first point of the current tiebreak. */
  private tbFirst: Side;

  constructor(
    readonly format: MatchFormat,
    firstServer: Side = 0,
  ) {
    this.server = firstServer;
    this.tbFirst = firstServer;
    this.tiebreak = format === "tiebreak";
  }

  get setsToWin() {
    return this.format === "three" ? 2 : 1;
  }

  setsWon(p: Side) {
    return this.sets.filter((s) => s[p] > s[1 - p]).length;
  }

  /** Points needed to take the current tiebreak. */
  private get tbTarget() {
    return this.format === "tiebreak" ? 10 : 7;
  }

  /** Award a point. */
  point(p: Side): PointResult {
    const r: PointResult = { game: false, set: false, match: false };
    if (this.winner >= 0) return r;
    const o = (1 - p) as Side;
    this.points[p]++;
    if (this.tiebreak) {
      const total = this.points[0] + this.points[1];
      // The first point is served by one player, then two each.
      this.server = (Math.floor((total + 1) / 2) % 2 === 0 ? this.tbFirst : 1 - this.tbFirst) as Side;
      if (this.points[p] >= this.tbTarget && this.points[p] - this.points[o] >= 2) {
        r.game = r.set = true;
        if (this.format === "tiebreak") this.sets.push([this.points[0], this.points[1]]);
        else {
          this.games[p]++;
          this.sets.push([this.games[0], this.games[1]]);
        }
        // Whoever received first in the tiebreak serves the next game.
        this.server = (1 - this.tbFirst) as Side;
        this.points = [0, 0];
        this.games = [0, 0];
        this.tiebreak = false;
        r.match = this.endSet();
      }
      return r;
    }
    if (this.points[p] >= 4 && this.points[p] - this.points[o] >= 2) {
      r.game = true;
      this.points = [0, 0];
      this.games[p]++;
      this.server = (1 - this.server) as Side;
      const [a, b] = [this.games[p], this.games[o]];
      if (a >= 6 && a - b >= 2) {
        r.set = true;
        this.sets.push([this.games[0], this.games[1]]);
        this.games = [0, 0];
        r.match = this.endSet();
      } else if (this.games[0] === 6 && this.games[1] === 6) {
        this.tiebreak = true;
        this.tbFirst = this.server;
      }
    }
    return r;
  }

  private endSet() {
    for (const p of [0, 1] as Side[])
      if (this.setsWon(p) >= this.setsToWin) {
        this.winner = p;
        return true;
      }
    return false;
  }

  /** Points played in the current game or tiebreak. */
  get pointsInGame() {
    return this.points[0] + this.points[1];
  }

  /** The server serves from the deuce (right) court on even points, the ad court on odd. */
  get court(): "deuce" | "ad" {
    return this.pointsInGame % 2 === 0 ? "deuce" : "ad";
  }

  /** The point score as the umpire calls it, for each player ("15", "40", "AD", or tiebreak numbers). */
  calls(): [string, string] {
    const [a, b] = this.points;
    if (this.tiebreak) return [String(a), String(b)];
    if (a >= 3 && b >= 3) {
      if (a === b) return ["40", "40"];
      return a > b ? ["AD", ""] : ["", "AD"];
    }
    return [CALLS[a], CALLS[b]];
  }

  /** The umpire's call, server's score first ("30–15", "Deuce", "Advantage Varga"). */
  announce(names: [string, string]) {
    const [a, b] = this.points;
    if (this.tiebreak) return `${a}–${b}`;
    if (a >= 3 && b >= 3) return a === b ? "Deuce" : `Advantage ${names[a > b ? 0 : 1]}`;
    const s = this.server;
    const [x, y] = [this.points[s], this.points[1 - s]];
    if (x === y) return x === 0 ? "Love all" : `${CALLS[x]} all`;
    const call = (n: number) => (n === 0 ? "love" : CALLS[n]);
    return `${call(x)}–${call(y)}`;
  }

  /** Break point, set point or match point for the player about to win one more point? */
  pressure(): { kind: "break" | "set" | "match"; for: Side } | null {
    if (this.winner >= 0) return null;
    for (const p of [0, 1] as Side[]) {
      const probe = this.clone();
      const r = probe.point(p);
      if (r.match) return { kind: "match", for: p };
      if (r.set) return { kind: "set", for: p };
      if (r.game && p !== this.server && !this.tiebreak) return { kind: "break", for: p };
    }
    return null;
  }

  clone() {
    const c = new TennisScore(this.format, this.server);
    c.sets = this.sets.map((s) => [...s] as [number, number]);
    c.games = [...this.games];
    c.points = [...this.points];
    c.tiebreak = this.tiebreak;
    c.server = this.server;
    c.winner = this.winner;
    c.tbFirst = this.tbFirst;
    return c;
  }

  /** "6–4 3–6 7–6" from player p's side. */
  line(p: Side = 0) {
    const all = [...this.sets];
    if (this.winner < 0 && (this.games[0] || this.games[1] || this.points[0] || this.points[1]))
      all.push(this.format === "tiebreak" ? [this.points[0], this.points[1]] : [this.games[0], this.games[1]]);
    return all.map((s) => `${s[p]}–${s[1 - p]}`).join(" ");
  }
}
