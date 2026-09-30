import { electHost, type PeerInfo, type Transport } from "../neon-siege/net";
import type { Team } from "./battlefield";
import { cleanChat, type LobbyPlayer, type LobbySnapshot, type TrenchClass, type TrenchMsg } from "./protocol";

/**
 * A Trenches lobby room. The oldest peer is the host: it owns the snapshot
 * (players, teams, ready, classes, settings, phase) and rebroadcasts it; the
 * others send requests. When the host starts a match every client sees the
 * phase flip (and a new matchId) and loads in; late joiners load straight in.
 */

export const MIN_FIGHTERS = 2;
export const MAX_FIGHTERS = 16;
const HEARTBEAT_MS = 1500;

export interface LobbySettings {
  name: string;
  max: number;
  bots: boolean;
}

export interface ChatLine {
  name: string;
  text: string;
  at: number;
  system?: boolean;
}

export class LobbyRoom {
  snapshot: LobbySnapshot | null = null;
  readonly chat: ChatLine[] = [];
  private peers: PeerInfo[] = [];
  private prefs = new Map<string, { team?: Team; ready?: boolean; cls?: TrenchClass }>();
  private changeCbs = new Set<() => void>();
  private startCbs = new Set<(s: LobbySnapshot) => void>();
  private chatCbs = new Set<() => void>();
  private unsub: (() => void)[] = [];
  private beat: ReturnType<typeof setInterval> | null = null;
  private lastMatchId = 0;
  private seedSource: () => number;

  constructor(
    readonly transport: Transport<TrenchMsg>,
    readonly code: string,
    private myName: string,
    private settings: LobbySettings,
    opts: { seed?: () => number } = {},
  ) {
    this.seedSource = opts.seed ?? (() => Math.floor(Math.random() * 2 ** 31));
    this.unsub.push(
      transport.onPeers((p) => this.onPeers(p)),
      transport.onMessage((m, from) => this.onMessage(m, from)),
    );
  }

  get selfId() {
    return this.transport.selfId;
  }

  get isHost() {
    return electHost(this.peers) === this.selfId;
  }

  /** Everyone currently in the room (presence). */
  get roster(): PeerInfo[] {
    return this.peers;
  }

  get me(): LobbyPlayer | undefined {
    return this.snapshot?.players.find((p) => p.id === this.selfId);
  }

  async connect() {
    await this.transport.connect();
    this.beat = setInterval(() => {
      if (this.isHost) this.publish();
    }, HEARTBEAT_MS);
  }

  onChange(cb: () => void) {
    this.changeCbs.add(cb);
    return () => void this.changeCbs.delete(cb);
  }
  onStart(cb: (s: LobbySnapshot) => void) {
    this.startCbs.add(cb);
    return () => void this.startCbs.delete(cb);
  }
  onChat(cb: () => void) {
    this.chatCbs.add(cb);
    return () => void this.chatCbs.delete(cb);
  }

  // --------------------------------------------------------------- requests

  setTeam(team: Team) {
    this.request({ team });
  }
  setReady(ready: boolean) {
    this.request({ ready });
  }
  setClass(cls: TrenchClass) {
    this.request({ cls });
  }

  sendChat(text: string) {
    const t = cleanChat(text);
    if (!t) return;
    this.transport.send({ t: "chat", name: this.myName, text: t });
    this.pushChat({ name: this.myName, text: t, at: Date.now() });
  }

  /** Host: start the battle for everyone in the room. */
  start() {
    if (!this.isHost || !this.snapshot || this.snapshot.phase === "match") return;
    this.snapshot = { ...this.snapshot, phase: "match", seed: this.seedSource(), matchId: this.snapshot.matchId + 1 };
    this.publish();
    this.checkStart();
  }

  /** Host: the battle is over, everyone back to the lobby (ready flags reset). */
  backToLobby() {
    if (!this.isHost || !this.snapshot) return;
    for (const p of this.prefs.values()) p.ready = false;
    this.snapshot = { ...this.snapshot, phase: "lobby" };
    this.rebuild();
  }

  close() {
    if (this.beat) clearInterval(this.beat);
    this.unsub.forEach((u) => u());
    this.transport.close();
  }

  // -------------------------------------------------------------- internals

  private request(r: { team?: Team; ready?: boolean; cls?: TrenchClass }) {
    if (this.isHost) {
      this.prefs.set(this.selfId, { ...this.prefs.get(this.selfId), ...r });
      this.rebuild();
    } else this.transport.send({ t: "req", ...r });
  }

  private onPeers(peers: PeerInfo[]) {
    const had = new Set(this.peers.map((p) => p.id));
    const now = new Set(peers.map((p) => p.id));
    const joined = peers.filter((p) => !had.has(p.id) && p.id !== this.selfId && this.peers.length > 0);
    const left = this.peers.filter((p) => !now.has(p.id));
    this.peers = peers;
    for (const p of joined) this.pushChat({ name: "", text: `${p.name} joined`, at: Date.now(), system: true });
    for (const p of left) {
      this.prefs.delete(p.id);
      this.pushChat({ name: "", text: `${p.name} left`, at: Date.now(), system: true });
    }
    if (this.isHost) this.rebuild();
    else this.emitChange();
  }

  private onMessage(m: TrenchMsg, from: string) {
    switch (m.t) {
      case "lobby": {
        // Only trust the current host's snapshot (a stale host's is ignored).
        if (from !== electHost(this.peers) && this.peers.length) return;
        this.snapshot = m.s;
        // Adopt the host's view of everyone's prefs (used if we become host).
        for (const p of m.s.players) this.prefs.set(p.id, { team: p.team, ready: p.ready, cls: p.cls });
        this.settings = { name: m.s.name, max: m.s.max, bots: m.s.bots };
        this.emitChange();
        this.checkStart();
        break;
      }
      case "req":
        if (!this.isHost) return;
        this.prefs.set(from, {
          ...this.prefs.get(from),
          ...(m.team === 1 || m.team === 2 ? { team: m.team } : {}),
          ...(typeof m.ready === "boolean" ? { ready: m.ready } : {}),
          ...(m.cls ? { cls: m.cls } : {}),
        });
        this.rebuild();
        break;
      case "chat": {
        const t = cleanChat(m.text);
        if (t) this.pushChat({ name: cleanChat(m.name).slice(0, 24) || "Player", text: t, at: Date.now() });
        break;
      }
    }
  }

  /** Host: recompute the snapshot from the roster + prefs (auto-balancing new players). */
  private rebuild() {
    const counts: Record<Team, number> = { 1: 0, 2: 0 };
    for (const p of this.peers) {
      const t = this.prefs.get(p.id)?.team;
      if (t) counts[t]++;
    }
    const players: LobbyPlayer[] = [...this.peers]
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1))
      .map((p) => {
        const pref = this.prefs.get(p.id) ?? {};
        let team = pref.team;
        if (!team) {
          team = counts[1] <= counts[2] ? 1 : 2;
          counts[team]++;
          this.prefs.set(p.id, { ...pref, team });
        }
        return { id: p.id, name: p.name, team, ready: !!pref.ready, cls: pref.cls ?? "rifleman" };
      });
    const prev = this.snapshot;
    this.snapshot = {
      code: this.code,
      name: this.settings.name,
      hostId: this.selfId,
      phase: prev?.phase ?? "lobby",
      max: Math.max(MIN_FIGHTERS, Math.min(MAX_FIGHTERS, this.settings.max)),
      bots: this.settings.bots,
      players,
      seed: prev?.seed ?? 0,
      matchId: prev?.matchId ?? 0,
    };
    this.publish();
    this.emitChange();
  }

  private publish() {
    if (this.snapshot) this.transport.send({ t: "lobby", s: this.snapshot });
  }

  private checkStart() {
    const s = this.snapshot;
    if (s?.phase === "match" && s.matchId !== this.lastMatchId) {
      this.lastMatchId = s.matchId;
      this.startCbs.forEach((cb) => cb(s));
    }
  }

  private pushChat(line: ChatLine) {
    this.chat.push(line);
    if (this.chat.length > 60) this.chat.shift();
    this.chatCbs.forEach((cb) => cb());
  }

  private emitChange() {
    this.changeCbs.forEach((cb) => cb());
  }
}
