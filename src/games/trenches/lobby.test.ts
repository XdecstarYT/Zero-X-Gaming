import { afterEach, describe, expect, it } from "vitest";
import { MemoryHub } from "../neon-siege/net";
import { IDLE } from "../neon-siege/royale";
import { LobbyRoom } from "./lobby";
import { TrenchesMatch } from "./match";
import type { LobbySnapshot, TrenchMsg } from "./protocol";

const rooms: LobbyRoom[] = [];
afterEach(() => {
  rooms.splice(0).forEach((r) => r.close());
});

async function lobby(hub: MemoryHub<TrenchMsg>, id: string, max = 8) {
  const r = new LobbyRoom(hub.join(id, `Player ${id}`), "WAR01", `Player ${id}`, { name: "Friday Night Trenches", max, bots: true }, { seed: () => 4242 });
  rooms.push(r);
  await r.connect();
  return r;
}

describe("Trenches lobby", () => {
  it("elects the first player as host, auto-balances teams and syncs one snapshot", async () => {
    const hub = new MemoryHub<TrenchMsg>();
    const a = await lobby(hub, "a");
    const b = await lobby(hub, "b");
    const c = await lobby(hub, "c");
    expect(a.isHost).toBe(true);
    expect(b.isHost).toBe(false);
    for (const r of [a, b, c]) {
      expect(r.snapshot?.name).toBe("Friday Night Trenches");
      expect(r.snapshot?.players.map((p) => [p.id, p.team])).toEqual([
        ["a", 1],
        ["b", 2],
        ["c", 1],
      ]);
    }
  });

  it("applies team, class and ready requests through the host, and relays chat", async () => {
    const hub = new MemoryHub<TrenchMsg>();
    const a = await lobby(hub, "a");
    const b = await lobby(hub, "b");
    b.setTeam(1);
    b.setClass("marksman");
    b.setReady(true);
    const seen = a.snapshot!.players.find((p) => p.id === "b")!;
    expect(seen).toMatchObject({ team: 1, cls: "marksman", ready: true });
    expect(b.me).toMatchObject({ team: 1, cls: "marksman", ready: true });
    b.sendChat("   hold   the line!  ");
    expect(a.chat.at(-1)).toMatchObject({ name: "Player b", text: "hold the line!" });
    expect(b.chat.at(-1)?.text).toBe("hold the line!");
  });

  it("the host starts the battle for everyone; late joiners drop straight in", async () => {
    const hub = new MemoryHub<TrenchMsg>();
    const a = await lobby(hub, "a");
    const b = await lobby(hub, "b");
    const started: string[] = [];
    b.onStart(() => started.push("b"));
    a.onStart(() => started.push("a"));
    b.start(); // not host: ignored
    expect(started).toEqual([]);
    a.start();
    expect(started.sort()).toEqual(["a", "b"]);
    expect(b.snapshot).toMatchObject({ phase: "match", seed: 4242, matchId: 1 });

    const late = new LobbyRoom(hub.join("z", "Late"), "WAR01", "Late", { name: "", max: 8, bots: true });
    rooms.push(late);
    let lateStart: LobbySnapshot | null = null;
    late.onStart((s) => (lateStart = s));
    await late.connect();
    expect(lateStart).not.toBeNull();
    expect(lateStart!.players.map((p) => p.id)).toContain("z");
  });

  it("hands the room to the next player when the host leaves", async () => {
    const hub = new MemoryHub<TrenchMsg>();
    const a = await lobby(hub, "a");
    const b = await lobby(hub, "b");
    a.close();
    rooms.splice(rooms.indexOf(a), 1);
    expect(b.isHost).toBe(true);
    expect(b.snapshot?.players.map((p) => p.id)).toEqual(["b"]);
    expect(b.snapshot?.name).toBe("Friday Night Trenches");
  });
});

describe("Trenches battle over the network", () => {
  const DT = 1 / 60;

  async function battle() {
    const hub = new MemoryHub<TrenchMsg>();
    const a = await lobby(hub, "a", 6);
    const b = await lobby(hub, "b", 6);
    a.start();
    const ma = new TrenchesMatch(a.transport, a.snapshot!, { roster: a.roster });
    const mb = new TrenchesMatch(b.transport, b.snapshot!, { roster: b.roster });
    const run = (s: number) => {
      for (let t = 0; t < s; t += DT) {
        ma.step(DT, IDLE);
        mb.step(DT, IDLE);
      }
    };
    return { ma, mb, run };
  }

  it("the host fills the teams with bots and everyone sees the same soldiers", async () => {
    const { ma, mb, run } = await battle();
    run(0.5);
    expect(ma.isHost).toBe(true);
    const botsA = [...ma.world.entities.values()].filter((e) => e.kind === "bot");
    expect(botsA).toHaveLength(4);
    const teams = [...ma.world.entities.values()].map((e) => e.team);
    expect(teams.filter((t) => t === 1)).toHaveLength(3);
    expect(teams.filter((t) => t === 2)).toHaveLength(3);
    expect([...mb.world.entities.keys()].sort()).toEqual([...ma.world.entities.keys()].sort());
    expect(mb.world.entities.get("b-bot") ?? mb.world.entities.get(botsA[0].id)).toBeDefined();
    expect(ma.me.outfit).toBe("legion");
    expect(mb.me.outfit).toBe("front");
  });

  it("flag captures and ticket changes on the host reach every client", async () => {
    const { ma, mb, run } = await battle();
    run(0.2);
    // Park everyone but player A far away, and put A on flag A.
    const A = ma.cq.flags[0];
    const tickets = ma.cq.tickets[1];
    for (let t = 0; t < 10; t += DT) {
      for (const e of ma.world.entities.values()) if (e.kind === "bot") Object.assign(e, { x: 3.5, y: e.team === 1 ? 5.5 : 42.5 });
      Object.assign(ma.me, { x: A.x, y: A.y });
      ma.step(DT, IDLE);
      mb.step(DT, IDLE);
    }
    expect(ma.cq.flags[0].owner).toBe(1);
    expect(mb.cq.flags[0].owner).toBe(1);
    expect(mb.status().storm).toMatch(/^A theirs/);
    expect(ma.status().storm).toMatch(/^A ours/);
    expect(ma.cq.tickets[1]).toBeLessThanOrEqual(tickets);
    expect(mb.markers().find((m) => m.id === "A")?.color).toBe("#5b93ff");
  });

  it("deaths cost tickets and the battle ends for everyone", async () => {
    const { ma, mb, run } = await battle();
    run(0.2);
    ma.cq.tickets = [5, 1];
    mb.me.hp = 1;
    // Host's player shoots B point blank.
    Object.assign(ma.me, { x: 40.5, y: 20.5, angle: 0 });
    Object.assign(mb.me, { x: 43.5, y: 20.5 });
    for (let t = 0; t < 2 && !ma.isOver(); t += DT) {
      Object.assign(ma.me, { x: 40.5, y: 20.5, angle: 0 });
      Object.assign(mb.me, { x: 43.5, y: 20.5 });
      for (const e of ma.world.entities.values()) if (e.kind === "bot") Object.assign(e, { x: 3.5, y: 5.5, alive: false, respawnAt: 999 });
      ma.step(DT, { ...IDLE, fire: true });
      mb.step(DT, IDLE);
    }
    run(0.5);
    expect(ma.isOver()).toBe(true);
    expect(mb.isOver()).toBe(true);
    expect(ma.resultTitle()).toBe("Victory");
    expect(mb.resultTitle()).toBe("Defeat");
    expect(mb.banner()?.text).toBe("DEFEAT");
  });
});
