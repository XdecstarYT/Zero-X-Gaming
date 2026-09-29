import { describe, expect, it } from "vitest";
import { electHost, MemoryHub, normalizeRoom, randomRoom, ROOM_RE } from "./net";
import { KILL_LIMIT, OnlineController, ROOM_SIZE } from "./online";
import type { PlayerInput } from "./solo";

const DT = 1 / 60;
const idle: PlayerInput = { forward: 0, strafe: 0, turn: 0, fire: false, reload: false };

async function room(n: number) {
  const hub = new MemoryHub();
  const players: OnlineController[] = [];
  for (let i = 0; i < n; i++)
    players.push(await OnlineController.join(hub.join(`p${i}`, `Player${i}`), `Player${i}`, "ABCD", i + 1));
  return { hub, players };
}

function run(players: OnlineController[], seconds: number, input: (p: OnlineController) => PlayerInput = () => idle) {
  for (let t = 0; t < seconds; t += DT) for (const p of players) p.step(DT, input(p));
}

/** Put `a` facing `b` down an open corridor (row 5 is open end to end). */
function lineUp(a: OnlineController, b: OnlineController) {
  a.me.x = 2.5;
  a.me.y = 5.5;
  a.me.angle = 0;
  b.me.x = 8.5;
  b.me.y = 5.5;
  // Keep bots out of the way for deterministic duels.
  for (const p of [a, b])
    for (const e of p.world.entities.values()) if (e.kind === "bot") Object.assign(e, { x: 20.5, y: 21.5 });
}

describe("room codes", () => {
  it("normalizes and generates valid codes", () => {
    expect(normalizeRoom(" ab-c d1 ")).toBe("ABCD1");
    for (let i = 0; i < 20; i++) expect(ROOM_RE.test(randomRoom())).toBe(true);
  });

  it("elects the oldest peer as host, consistently", () => {
    const peers = [
      { id: "b", name: "B", joinedAt: 5 },
      { id: "a", name: "A", joinedAt: 5 },
      { id: "c", name: "C", joinedAt: 9 },
    ];
    expect(electHost(peers)).toBe("a");
    expect(electHost([...peers].reverse())).toBe("a");
    expect(electHost([])).toBeNull();
  });
});

describe("online deathmatch", () => {
  it("the first player hosts and bots fill the room; everyone sees them", async () => {
    const { players } = await room(2);
    const [a, b] = players;
    run(players, 0.5);
    expect(a.isHost).toBe(true);
    expect(b.isHost).toBe(false);
    const botsA = [...a.world.entities.values()].filter((e) => e.kind === "bot");
    const botsB = [...b.world.entities.values()].filter((e) => e.kind === "bot");
    expect(botsA).toHaveLength(ROOM_SIZE - 2);
    expect(botsB.map((e) => e.id).sort()).toEqual(botsA.map((e) => e.id).sort());
    expect(b.world.entities.get(a.me.id)?.name).toBe("Player0");
  });

  it("a third player joining replaces a bot", async () => {
    const { players } = await room(3);
    run(players, 0.3);
    expect([...players[0].world.entities.values()].filter((e) => e.kind === "bot")).toHaveLength(ROOM_SIZE - 3);
  });

  it("positions sync and interpolate", async () => {
    const { players } = await room(2);
    const [a, b] = players;
    a.me.x = 3.5;
    a.me.y = 5.5;
    run(players, 0.5);
    const seen = b.world.entities.get(a.me.id)!;
    expect(seen.x).toBeCloseTo(a.me.x, 1);
    expect(seen.y).toBeCloseTo(a.me.y, 1);
  });

  it("hits are applied by the victim's owner and kills are credited once", async () => {
    const { players } = await room(2);
    const [a, b] = players;
    run(players, 0.3);
    lineUp(a, b);
    run(players, 0.3);
    // A fires until B dies.
    for (let t = 0; t < 3 && b.me.alive; t += DT) {
      a.step(DT, { ...idle, fire: true });
      b.step(DT, idle);
      lineUp(a, b);
    }
    expect(b.me.alive).toBe(false);
    expect(b.me.deaths).toBe(1);
    expect(a.me.kills).toBe(1);
    run(players, 0.2);
    expect(b.world.entities.get(a.me.id)?.kills).toBe(1);
    expect(a.world.entities.get(b.me.id)?.alive).toBe(false);
    // B respawns on its own after the delay.
    run(players, 3.2);
    expect(b.me.alive).toBe(true);
    expect(b.me.hp).toBe(100);
  });

  it("bots owned by the host can damage remote players (via hit messages)", async () => {
    const { players } = await room(2);
    const [a, b] = players;
    run(players, 0.3);
    // Park B in the open where the bots roam, and let the host's bots find it.
    let hurt = false;
    for (let t = 0; t < 60 && !hurt; t += DT) {
      a.me.x = 1.5;
      a.me.y = 22.5; // host hides in a corner
      a.step(DT, idle);
      b.step(DT, idle);
      hurt = b.me.hp < 100 || b.me.deaths > 0;
    }
    expect(hurt).toBe(true);
  });

  it("host migration: when the host leaves, the next player adopts the bots", async () => {
    const { players } = await room(2);
    const [a, b] = players;
    run(players, 0.5);
    const botIds = [...b.world.entities.values()].filter((e) => e.kind === "bot").map((e) => e.id);
    a.destroy();
    run([b], 0.1);
    expect(b.isHost).toBe(true);
    // Room is now 1 human, so the new host tops bots up to fill the room.
    const bots = [...b.world.entities.values()].filter((e) => e.kind === "bot");
    expect(bots).toHaveLength(ROOM_SIZE - 1);
    expect(botIds.every((id) => bots.some((x) => x.id === id))).toBe(true);
    const before = bots.map((x) => ({ x: x.x, y: x.y }));
    run([b], 3);
    const moved = bots.some((x, i) => Math.hypot(x.x - before[i].x, x.y - before[i].y) > 0.5);
    expect(moved).toBe(true);
    expect(b.world.entities.has(a.me.id)).toBe(false);
  });

  it("the match ends for everyone at the kill limit", async () => {
    const { players } = await room(2);
    const [a, b] = players;
    run(players, 0.3);
    a.me.kills = KILL_LIMIT;
    run(players, 0.2);
    expect(a.isOver()).toBe(true);
    expect(b.isOver()).toBe(true);
    expect(b.scoreboard(false)?.[0].name).toBe("Player0");
    expect(a.ranked).toBe(false);
  });

  it("ignores damage sent for entities it doesn't own and clamps absurd damage", async () => {
    const { hub, players } = await room(2);
    const [a] = players;
    run(players, 0.3);
    const spy = hub.join("cheater", "Cheater");
    await spy.connect();
    spy.send({ t: "hit", a: "cheater", v: a.me.id, d: 9999 });
    expect(a.me.hp).toBeGreaterThanOrEqual(60);
  });
});
