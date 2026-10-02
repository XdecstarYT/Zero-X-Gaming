import { describe, expect, it } from "vitest";
import { MemoryHub } from "../neon-siege/net";
import { cleanChat, parseMsg, TownPresence, type TownMsg } from "./presence";

const look = { sex: "F" as const, skin: 1, hair: 2, shirt: 3 };

describe("town presence", () => {
  it("shows neighbours where they are and drops them when they leave", async () => {
    const hub = new MemoryHub<TownMsg>();
    let t = 0;
    const a = new TownPresence(hub.join("a", "Alice"), "Alice", () => t);
    const b = new TownPresence(hub.join("b", "Bob"), "Bob", () => t);
    await a.connect();
    await b.connect();
    a.update({ x: 10, z: 20, heading: 1, speed: 2, pose: "walk" }, look);
    expect(b.others.get("a")).toMatchObject({ name: "Alice", x: 10, z: 20, pose: "walk", look });
    // Throttled: nothing new goes out a moment later.
    a.update({ x: 11, z: 20, heading: 1, speed: 2, pose: "walk" }, look);
    expect(b.others.get("a")!.x).toBe(10);
    t += 0.2;
    a.update({ x: 11, z: 20, heading: 1, speed: 2, pose: "walk" }, look);
    expect(b.others.get("a")!.x).toBe(11);
    a.close();
    expect(b.others.has("a")).toBe(false);
  });

  it("carries chat, rate-limited, and dirty pings", async () => {
    const hub = new MemoryHub<TownMsg>();
    const a = new TownPresence(hub.join("a", "Alice"), "Alice", () => 0);
    const b = new TownPresence(hub.join("b", "Bob"), "Bob", () => 0);
    let dirty = 0;
    b.onDirty = () => dirty++;
    await a.connect();
    await b.connect();
    expect(a.say("  hello   town  ")).toBeNull();
    expect(b.chat.at(-1)).toMatchObject({ name: "Alice", text: "hello town" });
    expect(a.chat.at(-1)).toMatchObject({ me: true });
    for (let i = 0; i < 4; i++) a.say(`line ${i}`);
    expect(a.say("one too many")).toMatch(/Slow down/);
    a.dirty();
    expect(dirty).toBe(1);
  });

  it("rejects junk from the public room", () => {
    expect(parseMsg({ t: "pos", x: "1" })).toBeNull();
    expect(parseMsg({ t: "chat", text: "   " })).toBeNull();
    expect(parseMsg({ t: "nope" })).toBeNull();
    expect(parseMsg({ t: "pos", x: 9e9, z: 0, h: 0, s: 99, p: "fly", l: { sex: "M", skin: 99 } })).toEqual({ t: "pos", x: 400, z: 0, h: 0, s: 20, p: "stand", l: { sex: "M", skin: 3, hair: 0, shirt: 0 } });
    expect(cleanChat("a\nb\u0000c" + "x".repeat(200))).toHaveLength(120);
  });
});
