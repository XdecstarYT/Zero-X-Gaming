import type { PeerInfo, Transport } from "../neon-siege/net";
import type { Pose } from "../code-3/people3d";

/**
 * Who else is in town right now. Everyone in Hometown shares one Realtime
 * room: positions go out a few times a second, chat as it's typed, and a
 * "dirty" ping after anything that changes the town so others refresh their
 * view sooner. None of this is trusted for money or goods; that's the
 * database's job. It's only so you can see and talk to your neighbours.
 */

/** Appearance as palette indexes (small on the wire). */
export interface WireLook {
  sex: "M" | "F";
  skin: number;
  hair: number;
  shirt: number;
}

export type TownMsg =
  | { t: "pos"; x: number; z: number; h: number; s: number; p: Pose; l: WireLook }
  | { t: "chat"; text: string }
  | { t: "dirty" };

export interface Neighbour {
  id: string;
  name: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  pose: Pose;
  look: WireLook;
  seen: number;
}

export interface ChatLine {
  from: string;
  name: string;
  text: string;
  at: number;
  me?: boolean;
}

const POSES = new Set<Pose>(["walk", "stand", "sit", "talk"]);
const CHAT_MAX = 120;
/** Seconds of silence before a ghost avatar is dropped. */
const STALE_S = 20;

export const cleanChat = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX);

const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);

/** Accept only well-formed messages: anyone can send anything to a public room. */
export function parseMsg(m: unknown): TownMsg | null {
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  if (o.t === "dirty") return { t: "dirty" };
  if (o.t === "chat" && typeof o.text === "string") {
    const text = cleanChat(o.text);
    return text ? { t: "chat", text } : null;
  }
  if (o.t === "pos") {
    const x = num(o.x, -400, 400);
    const z = num(o.z, -200, 300);
    const h = num(o.h, -100, 100);
    const s = num(o.s, 0, 20);
    const l = o.l as Record<string, unknown> | undefined;
    if (x === null || z === null || h === null || s === null || !l) return null;
    const p = POSES.has(o.p as Pose) ? (o.p as Pose) : "stand";
    const idx = (v: unknown) => (typeof v === "number" ? Math.abs(Math.floor(v)) % 16 : 0);
    return { t: "pos", x, z, h, s, p, l: { sex: l.sex === "M" ? "M" : "F", skin: idx(l.skin), hair: idx(l.hair), shirt: idx(l.shirt) } };
  }
  return null;
}

export class TownPresence {
  readonly others = new Map<string, Neighbour>();
  readonly chat: ChatLine[] = [];
  private names = new Map<string, string>();
  private offs: (() => void)[] = [];
  private sentAt = -Infinity;
  private last = "";
  private chatAt: number[] = [];
  /** Someone changed the town: refresh soon. */
  onDirty: () => void = () => {};
  onChat: (line: ChatLine) => void = () => {};
  connected = false;

  constructor(
    private t: Transport<TownMsg>,
    private myName: string,
    private clock: () => number = () => performance.now() / 1000,
  ) {}

  get selfId() {
    return this.t.selfId;
  }

  async connect() {
    this.offs.push(
      this.t.onPeers((peers: PeerInfo[]) => {
        this.names = new Map(peers.map((p) => [p.id, p.name.slice(0, 24)]));
        for (const id of this.others.keys()) if (!this.names.has(id)) this.others.delete(id);
      }),
      this.t.onMessage((raw, from) => this.receive(raw, from)),
    );
    await this.t.connect();
    this.connected = true;
  }

  receive(raw: unknown, from: string) {
    if (from === this.t.selfId) return;
    const m = parseMsg(raw);
    if (!m) return;
    const name = this.names.get(from) ?? "Neighbour";
    if (m.t === "pos") {
      this.others.set(from, { id: from, name, x: m.x, z: m.z, heading: m.h, speed: m.s, pose: m.p, look: m.l, seen: this.clock() });
    } else if (m.t === "chat") {
      this.push({ from, name, text: m.text, at: Date.now() });
    } else this.onDirty();
  }

  private push(line: ChatLine) {
    this.chat.push(line);
    if (this.chat.length > 40) this.chat.shift();
    this.onChat(line);
  }

  /** Send where you are: often while moving, a heartbeat while still. */
  update(me: { x: number; z: number; heading: number; speed: number; pose: Pose }, look: WireLook) {
    const now = this.clock();
    for (const [id, o] of this.others) if (now - o.seen > STALE_S) this.others.delete(id);
    if (!this.connected) return;
    const key = `${me.x.toFixed(1)}|${me.z.toFixed(1)}|${me.pose}`;
    const gap = key === this.last ? 2 : 0.15;
    if (now - this.sentAt < gap) return;
    this.sentAt = now;
    this.last = key;
    this.t.send({ t: "pos", x: +me.x.toFixed(2), z: +me.z.toFixed(2), h: +me.heading.toFixed(2), s: +me.speed.toFixed(1), p: me.pose, l: look });
  }

  /** Say something. Five lines per ten seconds, 120 characters each. */
  say(text: string): string | null {
    const clean = cleanChat(text);
    if (!clean) return null;
    const now = this.clock();
    this.chatAt = this.chatAt.filter((t) => now - t < 10);
    if (this.chatAt.length >= 5) return "Slow down a little.";
    this.chatAt.push(now);
    if (this.connected) this.t.send({ t: "chat", text: clean });
    this.push({ from: this.t.selfId, name: this.myName, text: clean, at: Date.now(), me: true });
    return null;
  }

  /** Tell everyone the town changed (a trade, a sale, a new house). */
  dirty() {
    if (this.connected) this.t.send({ t: "dirty" });
  }

  close() {
    for (const f of this.offs) f();
    this.offs = [];
    this.t.close();
    this.connected = false;
  }
}
