import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { randomId } from "../neon-siege/net";

/**
 * The public lobby list. Each lobby's host advertises it; everyone browsing
 * sees the live list. Supabase Realtime presence online, BroadcastChannel
 * heartbeats for same-browser (local) play.
 */

export interface LobbyInfo {
  code: string;
  name: string;
  players: number;
  max: number;
  phase: "lobby" | "match";
}

export interface LobbyDirectory {
  connect(): Promise<void>;
  onList(cb: (list: LobbyInfo[]) => void): () => void;
  /** Advertise (or stop advertising, with null) the lobby this client hosts. */
  advertise(info: LobbyInfo | null): void;
  close(): void;
}

const byName = (a: LobbyInfo, b: LobbyInfo) => (a.phase === b.phase ? a.name.localeCompare(b.name) : a.phase === "lobby" ? -1 : 1);

export class SupabaseDirectory implements LobbyDirectory {
  private channel: RealtimeChannel | null = null;
  private cbs = new Set<(l: LobbyInfo[]) => void>();
  private list: LobbyInfo[] = [];
  private key = randomId();

  async connect() {
    const supabase = getSupabaseBrowser();
    if (!supabase) throw new Error("Online play isn't configured.");
    const ch = supabase.channel("trenches:directory", { config: { presence: { key: this.key } } });
    this.channel = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<Partial<LobbyInfo>>();
      this.list = Object.values(state)
        .flat()
        .filter((m): m is LobbyInfo & { presence_ref: string } => typeof m.code === "string" && typeof m.name === "string")
        .map(({ code, name, players, max, phase }) => ({ code, name, players, max, phase }))
        .sort(byName);
      this.cbs.forEach((cb) => cb(this.list));
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out loading lobbies.")), 10_000);
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          reject(new Error("Couldn't load lobbies."));
        }
      });
    });
  }

  onList(cb: (l: LobbyInfo[]) => void) {
    this.cbs.add(cb);
    cb(this.list);
    return () => void this.cbs.delete(cb);
  }

  advertise(info: LobbyInfo | null) {
    if (!this.channel) return;
    if (info) void this.channel.track(info);
    else void this.channel.untrack();
  }

  close() {
    const ch = this.channel;
    this.channel = null;
    if (ch) void ch.untrack().finally(() => void getSupabaseBrowser()?.removeChannel(ch));
    this.cbs.clear();
  }
}

export class LocalDirectory implements LobbyDirectory {
  private channel: BroadcastChannel | null = null;
  private cbs = new Set<(l: LobbyInfo[]) => void>();
  private seen = new Map<string, { info: LobbyInfo; at: number }>();
  private mine: LobbyInfo | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  async connect() {
    this.channel = new BroadcastChannel("zx-trenches-directory");
    this.channel.onmessage = (e: MessageEvent<{ info: LobbyInfo } | { gone: string } | { ask: true }>) => {
      const d = e.data;
      if ("ask" in d) this.announce();
      else if ("gone" in d) {
        this.seen.delete(d.gone);
        this.emit();
      } else {
        this.seen.set(d.info.code, { info: d.info, at: Date.now() });
        this.emit();
      }
    };
    this.timer = setInterval(() => {
      this.announce();
      const now = Date.now();
      let changed = false;
      for (const [code, v] of this.seen)
        if (now - v.at > 3500) {
          this.seen.delete(code);
          changed = true;
        }
      if (changed) this.emit();
    }, 1000);
    this.channel.postMessage({ ask: true });
  }

  private announce() {
    if (this.mine) this.channel?.postMessage({ info: this.mine });
  }

  private emit() {
    const list = [...this.seen.values()].map((v) => v.info);
    if (this.mine && !list.some((l) => l.code === this.mine!.code)) list.push(this.mine);
    list.sort(byName);
    this.cbs.forEach((cb) => cb(list));
  }

  onList(cb: (l: LobbyInfo[]) => void) {
    this.cbs.add(cb);
    this.emit();
    return () => void this.cbs.delete(cb);
  }

  advertise(info: LobbyInfo | null) {
    const prev = this.mine;
    this.mine = info;
    if (info) this.announce();
    else if (prev) this.channel?.postMessage({ gone: prev.code });
    this.emit();
  }

  close() {
    if (this.mine) this.channel?.postMessage({ gone: this.mine.code });
    if (this.timer) clearInterval(this.timer);
    this.channel?.close();
    this.channel = null;
    this.cbs.clear();
  }
}
