import { describe, expect, it } from "vitest";
import { BroadcastChannelTransport } from "@/games/neon-siege/net";
import { pickRoom, quickMatch, roomsOf } from "./matchmaking";

describe("quick match", () => {
  it("picks the fullest room with space", () => {
    const rooms = roomsOf([
      { id: "1", name: "AAAA|ann", joinedAt: 1 },
      { id: "2", name: "BBBB|bob", joinedAt: 2 },
      { id: "3", name: "BBBB|cat", joinedAt: 3 },
      { id: "4", name: "?", joinedAt: 4 },
    ]);
    expect(rooms.get("BBBB")).toBe(2);
    expect(pickRoom(rooms, 4)).toEqual({ room: "BBBB", others: 2 });
    expect(pickRoom(rooms, 2)).toEqual({ room: "AAAA", others: 1 });
    expect(pickRoom(new Map([["CCCC", 2]]), 2)).toBeNull();
  });

  it("pairs strangers through the directory, then opens a new room when full", async () => {
    const ns = `mm-test-${Math.random()}`;
    const dir = (n: string) => new BroadcastChannelTransport<unknown>("QUICK", n, undefined, ns);
    const a = await quickMatch(dir, "ann", 2, 900);
    expect(a.others).toBe(0);
    const b = await quickMatch(dir, "bob", 2, 900);
    expect(b.room).toBe(a.room);
    expect(b.others).toBe(1);
    const c = await quickMatch(dir, "cat", 2, 900);
    expect(c.room).not.toBe(a.room);
    for (const q of [a, b, c]) q.leave();
  }, 15000);
});
