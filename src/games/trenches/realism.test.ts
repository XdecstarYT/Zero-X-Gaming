import { describe, expect, it } from "vitest";
import { GROUND } from "../neon-siege/map";
import { MemoryHub } from "../neon-siege/net";
import { IDLE } from "../neon-siege/royale";
import { createEntity } from "../neon-siege/world";
import { DIG_SECONDS, TrenchesMatch } from "./match";
import type { LobbySnapshot, TrenchClass, TrenchMsg } from "./protocol";

const DT = 1 / 60;

function snapshot(players: LobbySnapshot["players"], bots = false): LobbySnapshot {
  return { code: "T1", name: "Test", hostId: players[0].id, phase: "match", max: players.length, bots, front: "somme", players, seed: 7, matchId: 1 };
}

async function pair(cls: TrenchClass = "rifleman", hub = new MemoryHub<TrenchMsg>()) {
  const ta = hub.join("a", "A");
  const tb = hub.join("b", "B");
  await ta.connect();
  await tb.connect();
  const snap = snapshot([
    { id: "a", name: "A", team: 1, ready: true, cls },
    { id: "b", name: "B", team: 2, ready: true, cls },
  ]);
  const roster = [
    { id: "a", name: "A", joinedAt: 1 },
    { id: "b", name: "B", joinedAt: 2 },
  ];
  const ma = new TrenchesMatch(ta, snap, { roster, myClass: cls });
  const mb = new TrenchesMatch(tb, snap, { roster });
  return { ma, mb, hub, snap };
}

/** An open surface cell well away from trenches, walls and wire. */
function openCell(m: TrenchesMatch) {
  const map = m.world.map;
  const C = m.cq.flags[2];
  for (let r = 0; r < 20; r++)
    for (let dx = -r; dx <= r; dx++) {
      const x = Math.floor(C.x) + dx;
      const y = Math.floor(C.y) + r;
      const ok = (i: number) => map.cells[i] === 0 && map.ground[i] !== GROUND.trench && map.ground[i] !== GROUND.floor && map.ground[i] !== GROUND.duck;
      const i = y * map.width + x;
      if (ok(i) && ok(i + 1) && ok(i - 1) && ok(i + map.width) && ok(i - map.width)) return { x: x + 0.5, y: y + 0.5, i };
    }
  throw new Error("no open cell");
}

describe("Trenches realism", () => {
  it("digging turns the cell underfoot into trench, for everyone", async () => {
    const { ma, mb } = await pair();
    const spot = openCell(ma);
    const hold = { ...IDLE, dig: true };
    for (let t = 0; t < DIG_SECONDS * 0.5; t += DT) {
      Object.assign(ma.me, { x: spot.x, y: spot.y });
      ma.step(DT, hold);
      mb.step(DT, IDLE);
    }
    expect(ma.task()?.label).toBe("Digging");
    expect(ma.world.map.ground[spot.i]).not.toBe(GROUND.trench);
    for (let t = 0; t < DIG_SECONDS * 0.6; t += DT) {
      Object.assign(ma.me, { x: spot.x, y: spot.y });
      ma.step(DT, hold);
      mb.step(DT, IDLE);
    }
    expect(ma.world.map.ground[spot.i]).toBe(GROUND.trench);
    expect(ma.world.map.dug).toEqual([spot.i]);
    expect(mb.world.map.ground[spot.i]).toBe(GROUND.trench);
    expect(mb.world.map.dug).toEqual([spot.i]);
    expect(ma.inTrench(ma.me)).toBe(true);
    // Letting go resets progress; nothing is dug by accident.
    ma.step(DT, IDLE);
    expect(ma.task()).toBeNull();
  });

  it("engineers dig three times as fast; a late joiner gets the dug cells from the host", async () => {
    const { ma, mb, hub, snap } = await pair("engineer");
    const spot = openCell(ma);
    for (let t = 0; t < DIG_SECONDS / 3 + 0.1; t += DT) {
      Object.assign(ma.me, { x: spot.x, y: spot.y });
      ma.step(DT, { ...IDLE, dig: true });
    }
    expect(ma.world.map.ground[spot.i]).toBe(GROUND.trench);
    const tc = hub.join("c", "C");
    await tc.connect();
    const mc = new TrenchesMatch(tc, snap, {
      roster: [
        { id: "a", name: "A", joinedAt: 1 },
        { id: "b", name: "B", joinedAt: 2 },
        { id: "c", name: "C", joinedAt: 3 },
      ],
    });
    expect(mc.world.map.ground[spot.i]).not.toBe(GROUND.trench);
    for (let t = 0; t < 5.5; t += DT) {
      ma.step(DT, IDLE);
      mb.step(DT, IDLE);
      mc.step(DT, IDLE);
    }
    expect(mc.world.map.ground[spot.i]).toBe(GROUND.trench);
  });

  it("rejects digging into walls, buildings and bad cells from the network", async () => {
    const { ma, mb } = await pair();
    const map = mb.world.map;
    const wall = map.cells.findIndex((c) => c !== 0);
    ma["transport"].send({ t: "dig", m: 1, c: wall });
    ma["transport"].send({ t: "dig", m: 1, c: -5 });
    ma["transport"].send({ t: "dig", m: 1, c: 1.5 });
    ma["transport"].send({ t: "dig", m: 1, c: 10_000_000 });
    expect(map.dug).toEqual([]);
  });

  it("cover: trenches protect, crouching in one hides you completely, prone is a small target", async () => {
    const { ma } = await pair();
    const map = ma.world.map;
    const trench = map.ground.findIndex((g, i) => g === GROUND.trench && i % map.width < map.width / 2);
    const tx = (trench % map.width) + 0.5;
    const ty = Math.floor(trench / map.width) + 0.5;
    const open = openCell(ma);
    const shooter = createEntity({ id: "s", name: "S", kind: "bot", team: 2, x: open.x, y: open.y });
    const target = createEntity({ id: "t", name: "T", kind: "bot", team: 1, x: tx, y: ty });
    const far = 40;
    // Standing in a trench: head and shoulders only (60% of rounds stopped).
    expect(ma.covered(shooter, target, far, 0.5)).toBe(true);
    expect(ma.covered(shooter, target, far, 0.7)).toBe(false);
    // Crouched in a trench: fully covered.
    target.stance = 1;
    expect(ma.covered(shooter, target, far, 0.99)).toBe(true);
    // Point blank, cover doesn't help.
    expect(ma.covered(shooter, target, 2, 0)).toBe(false);
    // A crouched soldier in a trench can't shoot out of it.
    const out = createEntity({ id: "o", name: "O", kind: "bot", team: 1, x: open.x, y: open.y });
    const low = createEntity({ id: "l", name: "L", kind: "bot", team: 2, x: tx, y: ty, stance: 1 });
    expect(ma.covered(low, out, far, 0.99)).toBe(true);
    low.stance = 0;
    expect(ma.covered(low, out, far, 0.99)).toBe(false);
    // In the open: prone halves hits at range, standing is fully exposed.
    out.stance = 2;
    expect(ma.covered(shooter, out, far, 0.4)).toBe(true);
    expect(ma.covered(shooter, out, far, 0.6)).toBe(false);
    out.stance = 0;
    expect(ma.covered(shooter, out, far, 0.01)).toBe(false);
  });

  it("stance toggles, sprint drains stamina and forces standing, and prone is slow", async () => {
    const { ma } = await pair();
    // Walk north-south along the open base road.
    Object.assign(ma.me, { x: 5.5, y: 20.5, angle: Math.PI / 2 });
    ma.step(DT, { ...IDLE, crouch: true });
    expect(ma.me.stance).toBe(1);
    ma.step(DT, { ...IDLE, prone: true });
    expect(ma.me.stance).toBe(2);
    expect(ma.status().detail).toMatch(/^PRONE/);
    const y0 = ma.me.y;
    for (let t = 0; t < 1; t += DT) ma.step(DT, { ...IDLE, forward: 1 });
    const proneDist = ma.me.y - y0;
    ma.step(DT, { ...IDLE, forward: 1, sprint: true });
    expect(ma.me.stance).toBe(0);
    const y1 = ma.me.y;
    for (let t = 0; t < 1; t += DT) ma.step(DT, { ...IDLE, forward: 1, sprint: true });
    const sprintDist = ma.me.y - y1;
    expect(sprintDist).toBeGreaterThan(proneDist * 4);
    expect(ma.me.stamina).toBeLessThan(0.95);
    expect(ma.me.stamina).toBeGreaterThan(0.8);
  });

  it("uses the lobby's front and syncs stance to other players", async () => {
    const { ma, mb } = await pair();
    expect(ma.world.map.name).toBe("The Somme");
    ma.me.stance = 2;
    for (let t = 0; t < 0.3; t += DT) {
      ma.step(DT, IDLE);
      mb.step(DT, IDLE);
    }
    expect(mb.world.entities.get("a")?.stance).toBe(2);
  });
});

describe("Trenches explosives over the network", () => {
  it("a grenade thrown by one player hurts the other player's soldier (and counts as a grenade kill)", async () => {
    const { ma, mb } = await pair();
    const spot = openCell(ma);
    // B stands where A's grenade will land; both parked in the open.
    for (let t = 0; t < 0.3; t += DT) {
      ma.step(DT, IDLE);
      mb.step(DT, IDLE);
    }
    Object.assign(ma.me, { x: spot.x, y: spot.y, angle: 0 });
    mb.me.hp = 1;
    let thrown = false;
    for (let t = 0; t < 5 && mb.me.alive; t += DT) {
      Object.assign(ma.me, { x: spot.x, y: spot.y, angle: 0 });
      const nade = mb["grenades"][0] ?? ma["grenades"][0];
      if (nade) Object.assign(mb.me, { x: nade.x, y: nade.y });
      ma.step(DT, { ...IDLE, throw: !thrown });
      thrown = true;
      mb.step(DT, IDLE);
    }
    expect(ma.me.grenades).toBe(1);
    expect(mb.me.alive).toBe(false);
    for (let t = 0; t < 0.3; t += DT) {
      ma.step(DT, IDLE);
      mb.step(DT, IDLE);
    }
    expect(ma.battleStats().grenadeKills).toBe(1);
    expect(ma.effects().blasts.length).toBeGreaterThan(0);
  });

  it("the host's artillery barrage lands on every client", async () => {
    const { ma, mb } = await pair();
    ma["nextBarrageAt"] = 0;
    for (let t = 0; t < 8; t += DT) {
      ma.step(DT, IDLE);
      mb.step(DT, IDLE);
    }
    expect(mb.effects().blasts.filter((b) => b.big).length).toBeGreaterThanOrEqual(1);
  });
});

describe("Breakthrough battles", () => {
  it("start with the defenders holding every flag and report the attack", async () => {
    const hub = new MemoryHub<TrenchMsg>();
    const t = hub.join("a", "A");
    await t.connect();
    const m = new TrenchesMatch(t, { ...snapshot([{ id: "a", name: "A", team: 1, ready: true, cls: "rifleman" }]), mode: "breakthrough" }, { solo: true, roster: [{ id: "a", name: "A", joinedAt: 1 }] });
    expect(m.cq.flags.every((f) => f.owner === 2)).toBe(true);
    expect(m.status().primary).toMatch(/^ATTACK · SECTOR 1\/3 · 200 TICKETS/);
    expect(m.status().storm).toMatch(/^A theirs · B theirs ·/);
    expect(m.resultLines().map(([k]) => k)).toContain("Flags taken");
  });
});
