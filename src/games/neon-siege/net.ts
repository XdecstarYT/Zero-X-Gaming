/**
 * Networking for Neon Siege online matches.
 *
 * A Transport is a room: broadcast messages to everyone else, and a presence
 * roster of who's in it. Three implementations share one interface:
 *   - SupabaseTransport: Supabase Realtime broadcast + presence (production)
 *   - BroadcastChannelTransport: tabs of the same browser (local play, E2E tests)
 *   - MemoryHub: in-process, synchronous (unit tests)
 */

import type { Rarity, WeaponKind } from "./items";

export interface PeerInfo {
  id: string;
  name: string;
  joinedAt: number;
}

export interface EntState {
  id: string;
  /** name */
  n: string;
  /** "human" | "bot" */
  k: "human" | "bot";
  x: number;
  y: number;
  a: number;
  hp: number;
  al: boolean;
  ki: number;
  de: number;
  /** shield */
  sh: number;
  /** active weapon kind + rarity (for rendering), null when holding a consumable/nothing */
  w: WeaponKind | null;
  r: Rarity | null;
  /** outfit id */
  o: string;
  /** aiming down sights */
  ad: boolean;
}

export type NetMessage =
  /** Entities the sender owns. `bots: true` means this is the host's complete bot list. */
  | { t: "state"; e: EntState[]; bots?: boolean }
  | { t: "shot"; s: string; w: WeaponKind; fx: number; fy: number; tx: number; ty: number }
  /** Attacker `a` hit victim `v` for `d` damage; only the victim's owner applies it. */
  | { t: "hit"; a: string; v: string; d: number; w: WeaponKind }
  | { t: "kill"; k: string; v: string; w: WeaponKind | "storm" }
  /** Host heartbeat: seconds left, kill limit, and whether the match is over. */
  | { t: "match"; left: number; limit: number; over: boolean };

/** A room. Generic over the message type so other games (Trenches) can reuse the transports. */
export interface Transport<M = NetMessage> {
  readonly selfId: string;
  connect(): Promise<void>;
  send(msg: M): void;
  onMessage(cb: (msg: M, from: string) => void): () => void;
  /** Roster including self, whenever it changes. */
  onPeers(cb: (peers: PeerInfo[]) => void): () => void;
  close(): void;
}

export const ROOM_RE = /^[A-Z0-9]{4,8}$/;

export function normalizeRoom(code: string) {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function randomRoom(rand = Math.random) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
}

export function randomId(rand = Math.random) {
  return `p-${Math.floor(rand() * 36 ** 8)
    .toString(36)
    .padStart(8, "0")}`;
}

/** Oldest peer (ties broken by id) is the host; everyone computes the same answer. */
export function electHost(peers: PeerInfo[]): string | null {
  if (!peers.length) return null;
  return [...peers].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1))[0].id;
}

class Listeners<T extends unknown[]> {
  private set = new Set<(...args: T) => void>();
  add(cb: (...args: T) => void) {
    this.set.add(cb);
    return () => void this.set.delete(cb);
  }
  emit(...args: T) {
    this.set.forEach((cb) => cb(...args));
  }
  clear() {
    this.set.clear();
  }
}

// ---------------------------------------------------------------- in-memory

/** Synchronous in-process room for tests. `hub.join()` returns a Transport. */
export class MemoryHub<M = NetMessage> {
  private peers = new Map<string, { info: PeerInfo; msg: Listeners<[M, string]>; roster: Listeners<[PeerInfo[]]> }>();
  private clock = 0;

  join(id: string, name: string): Transport<M> {
    const msg = new Listeners<[M, string]>();
    const roster = new Listeners<[PeerInfo[]]>();
    return {
      selfId: id,
      connect: async () => {
        this.peers.set(id, { info: { id, name, joinedAt: ++this.clock }, msg, roster });
        this.broadcastRoster();
      },
      send: (m) => {
        const copy = JSON.parse(JSON.stringify(m)) as M;
        for (const [pid, p] of this.peers) if (pid !== id) p.msg.emit(copy, id);
      },
      onMessage: (cb) => msg.add(cb),
      onPeers: (cb) => roster.add(cb),
      close: () => {
        this.peers.delete(id);
        msg.clear();
        roster.clear();
        this.broadcastRoster();
      },
    };
  }

  private broadcastRoster() {
    const list = [...this.peers.values()].map((p) => p.info);
    for (const p of this.peers.values()) p.roster.emit(list);
  }
}

// ------------------------------------------------------- BroadcastChannel

type LocalEnvelope<M> =
  | { kind: "hello"; peer: PeerInfo }
  | { kind: "bye"; id: string }
  | { kind: "msg"; from: string; msg: M };

/** Same-browser rooms (multiple tabs), with presence via heartbeats. */
export class BroadcastChannelTransport<M = NetMessage> implements Transport<M> {
  readonly selfId: string;
  private channel: BroadcastChannel | null = null;
  private msg = new Listeners<[M, string]>();
  private roster = new Listeners<[PeerInfo[]]>();
  private peers = new Map<string, { info: PeerInfo; seen: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private me: PeerInfo;

  constructor(
    private room: string,
    name: string,
    id = randomId(),
    private namespace = "siege",
  ) {
    this.selfId = id;
    this.me = { id, name, joinedAt: Date.now() };
  }

  async connect() {
    this.channel = new BroadcastChannel(`zx-${this.namespace}:${this.room}`);
    this.channel.onmessage = (e: MessageEvent<LocalEnvelope<M>>) => this.receive(e.data);
    this.peers.set(this.selfId, { info: this.me, seen: Date.now() });
    this.hello();
    this.timer = setInterval(() => this.heartbeat(), 700);
    this.emitRoster();
  }

  private hello() {
    this.channel?.postMessage({ kind: "hello", peer: this.me } satisfies LocalEnvelope<M>);
  }

  private heartbeat() {
    this.hello();
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (id !== this.selfId && now - p.seen > 2500) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitRoster();
  }

  private receive(env: LocalEnvelope<M>) {
    if (env.kind === "hello") {
      const known = this.peers.has(env.peer.id);
      this.peers.set(env.peer.id, { info: env.peer, seen: Date.now() });
      if (!known) {
        this.hello(); // let the newcomer learn about us right away
        this.emitRoster();
      }
    } else if (env.kind === "bye") {
      if (this.peers.delete(env.id)) this.emitRoster();
    } else if (env.from !== this.selfId) {
      this.msg.emit(env.msg, env.from);
    }
  }

  private emitRoster() {
    this.roster.emit([...this.peers.values()].map((p) => p.info));
  }

  send(msg: M) {
    this.channel?.postMessage({ kind: "msg", from: this.selfId, msg } satisfies LocalEnvelope<M>);
  }

  onMessage(cb: (msg: M, from: string) => void) {
    return this.msg.add(cb);
  }

  onPeers(cb: (peers: PeerInfo[]) => void) {
    return this.roster.add(cb);
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.channel?.postMessage({ kind: "bye", id: this.selfId } satisfies LocalEnvelope<M>);
    this.channel?.close();
    this.channel = null;
    this.msg.clear();
    this.roster.clear();
  }
}
