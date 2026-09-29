import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { randomId, type NetMessage, type PeerInfo, type Transport } from "./net";

/**
 * Supabase Realtime room: broadcast for game messages, presence for the roster.
 * Public channel scoped by room code; works for guests with the publishable key.
 */
export class SupabaseTransport implements Transport {
  readonly selfId: string;
  private channel: RealtimeChannel | null = null;
  private msgCbs = new Set<(msg: NetMessage, from: string) => void>();
  private peerCbs = new Set<(peers: PeerInfo[]) => void>();
  private me: PeerInfo;

  constructor(
    private room: string,
    name: string,
    id = randomId(),
  ) {
    this.selfId = id;
    this.me = { id, name, joinedAt: Date.now() };
  }

  static available() {
    return getSupabaseBrowser() !== null;
  }

  connect(): Promise<void> {
    const supabase = getSupabaseBrowser();
    if (!supabase) return Promise.reject(new Error("Online play isn't configured."));
    const channel = supabase.channel(`siege:${this.room}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.selfId } },
    });
    this.channel = channel;

    channel.on("broadcast", { event: "m" }, ({ payload }) => {
      const { from, msg } = payload as { from: string; msg: NetMessage };
      if (from !== this.selfId) this.msgCbs.forEach((cb) => cb(msg, from));
    });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ name: string; joinedAt: number }>();
      const peers: PeerInfo[] = Object.entries(state).map(([id, metas]) => ({
        id,
        name: metas[0]?.name ?? "Player",
        joinedAt: metas[0]?.joinedAt ?? 0,
      }));
      this.peerCbs.forEach((cb) => cb(peers));
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out connecting to the match server.")), 10_000);
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          await channel.track({ name: this.me.name, joinedAt: this.me.joinedAt });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          reject(new Error("Couldn't connect to the match server."));
        }
      });
    });
  }

  send(msg: NetMessage) {
    void this.channel?.send({ type: "broadcast", event: "m", payload: { from: this.selfId, msg } });
  }

  onMessage(cb: (msg: NetMessage, from: string) => void) {
    this.msgCbs.add(cb);
    return () => void this.msgCbs.delete(cb);
  }

  onPeers(cb: (peers: PeerInfo[]) => void) {
    this.peerCbs.add(cb);
    return () => void this.peerCbs.delete(cb);
  }

  close() {
    const ch = this.channel;
    this.channel = null;
    if (ch) {
      void ch.untrack().finally(() => void getSupabaseBrowser()?.removeChannel(ch));
    }
    this.msgCbs.clear();
    this.peerCbs.clear();
  }
}
