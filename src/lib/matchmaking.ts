import { randomRoom, type PeerInfo, type Transport } from "@/games/neon-siege/net";

/**
 * Quick match: find strangers to play with, no codes needed.
 *
 * Each game has a public directory room. Everyone in a quick-match room also
 * sits in the directory with their room code in their presence name
 * (`ROOM|name`), so a newcomer can look for a room with space and join it, or
 * open a new one for the next player to find. It rides on the same transports
 * as the games (Supabase Realtime presence online, BroadcastChannel locally).
 */

export type DirectoryFactory = (name: string) => Transport<unknown>;

export interface QuickMatch {
  room: string;
  /** Others already in that room when you picked it. */
  others: number;
  /** Leave the directory (call when you leave the room). */
  leave: () => void;
}

const parse = (p: PeerInfo) => {
  const i = p.name.indexOf("|");
  return i > 0 ? { room: p.name.slice(0, i), name: p.name.slice(i + 1), joinedAt: p.joinedAt } : null;
};

/** Rooms in the directory right now: code → players (oldest first in each). */
export function roomsOf(peers: PeerInfo[]) {
  const rooms = new Map<string, number>();
  for (const p of peers) {
    const e = parse(p);
    if (e) rooms.set(e.room, (rooms.get(e.room) ?? 0) + 1);
  }
  return rooms;
}

/** The fullest room that still has space (so games start sooner), or null. */
export function pickRoom(rooms: Map<string, number>, max: number) {
  let best: string | null = null;
  let bestN = 0;
  for (const [room, n] of rooms) if (n < max && (n > bestN || (n === bestN && best !== null && room < best))) {
    best = room;
    bestN = n;
  }
  return best ? { room: best, others: bestN } : null;
}

function watch(t: Transport<unknown>, ms: number) {
  return new Promise<PeerInfo[]>((resolve, reject) => {
    let latest: PeerInfo[] = [];
    const off = t.onPeers((p) => (latest = p));
    t.connect().then(
      () => setTimeout(() => (off(), resolve(latest)), ms),
      (e) => (off(), reject(e)),
    );
  });
}

/**
 * Find (or open) a room with space for `max` players, and list yourself in
 * the directory so the next player can find you.
 */
export async function quickMatch(directory: DirectoryFactory, name: string, max: number, listenMs = 1500): Promise<QuickMatch> {
  const look = directory("?");
  let peers: PeerInfo[];
  try {
    peers = await watch(look, listenMs);
  } finally {
    look.close();
  }
  const pick = pickRoom(roomsOf(peers), max);
  const room = pick?.room ?? randomRoom();
  const listed = directory(`${room}|${name}`);
  await listed.connect();
  return { room, others: pick?.others ?? 0, leave: () => listed.close() };
}
