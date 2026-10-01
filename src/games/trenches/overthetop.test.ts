import { describe, expect, it } from "vitest";
import { MemoryHub } from "../neon-siege/net";
import { IDLE } from "../neon-siege/royale";
import { activeWeapon, createEntity, type Entity } from "../neon-siege/world";
import { battlefield, generateBattlefield } from "./battlefield";
import { FRONT_IDS, FRONTS } from "./fronts";
import { TrenchesMatch } from "./match";
import type { LobbySnapshot, TrenchClass, TrenchMsg } from "./protocol";
import { clampTraverse, cloudState, GAS, gasAt, gasDamage, hasBayonet, MELEE, meleeTarget, MG, REVIVE, revivable, stepHeat, WIND } from "./warfare";
import { MEDALS, withBattle, EMPTY_RECORD } from "@/lib/war-record";

const DT = 1 / 60;

function snap(cls: TrenchClass = "rifleman", front: LobbySnapshot["front"] = "somme"): LobbySnapshot {
  return { code: "O1", name: "O", hostId: "a", phase: "match", max: 2, bots: false, front, mode: "conquest", players: [{ id: "a", name: "A", team: 1, ready: true, cls }], seed: 5, matchId: 1 };
}

async function solo(cls: TrenchClass = "rifleman", front: LobbySnapshot["front"] = "somme") {
  const hub = new MemoryHub<TrenchMsg>();
  const t = hub.join("a", "A");
  await t.connect();
  return new TrenchesMatch(t, snap(cls, front), { roster: [{ id: "a", name: "A", joinedAt: 1 }] });
}

/** Put a soldier at an open spot next to `me`, `dx` metres in front. */
function place(m: TrenchesMatch, e: Entity, dx: number) {
  e.x = m.me.x + Math.cos(m.me.angle) * dx;
  e.y = m.me.y + Math.sin(m.me.angle) * dx;
  m.world.entities.set(e.id, e);
  return e;
}

describe("poison gas", () => {
  const wind = { x: 0.5, y: 0 };
  const cloud = { id: "g", x: 10, y: 10, born: 0, owner: "x" };

  it("clouds grow, drift with the wind and fade away", () => {
    const early = cloudState(cloud, 0.5, wind)!;
    const full = cloudState(cloud, GAS.grow + 1, wind)!;
    expect(full.r).toBeGreaterThan(early.r);
    expect(full.x).toBeCloseTo(10 + 0.5 * (GAS.grow + 1));
    expect(cloudState(cloud, GAS.life + 1, wind)).toBeNull();
    expect(cloudState(cloud, GAS.life - 1, wind)!.k).toBeLessThan(full.k);
  });

  it("is strongest at the centre, and pools in trenches", () => {
    const t = GAS.grow + 1;
    const c = cloudState(cloud, t, wind)!;
    const centre = gasAt([cloud], t, wind, c.x, c.y, false);
    expect(centre).toBeGreaterThan(gasAt([cloud], t, wind, c.x + c.r * 0.8, c.y, false));
    expect(gasAt([cloud], t, wind, c.x + c.r + 1, c.y, false)).toBe(0);
    expect(gasAt([cloud], t, wind, c.x, c.y, true)).toBeGreaterThan(centre);
  });

  it("a mask stops it once it's on (half-on only helps)", () => {
    expect(gasDamage(1, 0, 1)).toBeCloseTo(GAS.dps);
    expect(gasDamage(1, 1, 1)).toBe(0);
    const half = gasDamage(1, 0.5, 1);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(GAS.dps);
  });

  it("every front has a wind", () => {
    for (const f of Object.keys(FRONTS)) expect(WIND[f as keyof typeof WIND]).toBeDefined();
  });

  it("chokes an unmasked soldier in the match; the mask (M) saves them", async () => {
    for (const masked of [false, true]) {
      const m = await solo();
      if (masked) {
        m.step(DT, { ...IDLE, mask: true });
        for (let i = 0; i < 90; i++) m.step(DT, IDLE);
        expect(m.me.masked).toBe(1);
        expect(m.screen().mask).toBe(1);
      }
      m["clouds"].push({ id: "c", x: m.me.x, y: m.me.y, born: m.world.time - GAS.grow, owner: "artillery" });
      const hp = m.me.hp;
      for (let i = 0; i < 120; i++) m.step(DT, IDLE);
      if (masked) expect(m.me.hp).toBe(hp);
      else {
        expect(m.me.hp).toBeLessThan(hp);
        expect(m.screen().gas).toBeGreaterThan(0);
        expect(m.effects().clouds?.length).toBe(1);
      }
    }
  });
});

describe("bayonets", () => {
  const me = { id: "me", x: 0, y: 0, angle: 0, alive: true, team: 1 };
  const enemy = (x: number, y: number, team = 2) => ({ id: `e${x},${y},${team}`, x, y, alive: true, team });
  const clear = () => true;

  it("reach only enemies in front and in range (further when charging)", () => {
    expect(meleeTarget(me, [enemy(1.5, 0)], false, clear)?.x).toBe(1.5);
    expect(meleeTarget(me, [enemy(-1.5, 0)], false, clear)).toBeNull();
    expect(meleeTarget(me, [enemy(1.5, 0, 1)], false, clear)).toBeNull();
    expect(meleeTarget(me, [enemy(3, 0)], false, clear)).toBeNull();
    expect(meleeTarget(me, [enemy(3, 0)], true, clear)?.x).toBe(3);
    expect(meleeTarget(me, [enemy(1.5, 0)], false, () => false)).toBeNull();
    expect(meleeTarget(me, [enemy(2, 0), enemy(1, 0.2)], false, clear)?.x).toBe(1);
  });

  it("rifles carry the bayonet", () => {
    expect(hasBayonet("ar")).toBe(true);
    expect(hasBayonet("sniper")).toBe(true);
    expect(hasBayonet("smg")).toBe(false);
  });

  it("a rifleman's lunge (V) kills an enemy at arm's length", async () => {
    const m = await solo("rifleman");
    m.me.angle = 0;
    const e = place(m, createEntity({ id: "bot-e", name: "Fritz", kind: "bot", team: 2, x: 0, y: 0 }), 1.4);
    // Make sure nothing solid is between them in the test map.
    m.world.map.cells[Math.floor(e.y) * m.world.map.width + Math.floor(e.x)] = 0;
    expect(hasBayonet(activeWeapon(m.me)?.kind)).toBe(true);
    m.step(DT, { ...IDLE, melee: true });
    expect(e.alive).toBe(false);
    expect(m.battleStats().bayonetKills).toBe(1);
    // Cooldown: a second press straight away does nothing.
    const t0 = m.me.meleeAt;
    m.step(DT, { ...IDLE, melee: true });
    expect(m.me.meleeAt).toBe(t0);
    expect(MELEE.cooldown).toBeGreaterThan(DT * 2);
  });
});

describe("emplaced Vickers guns", () => {
  it("every Classic front has guns on both lines, mirrored", () => {
    for (const id of FRONT_IDS) {
      const f = generateBattlefield(id);
      const mgs = f.mgs ?? [];
      expect(mgs.length, id).toBeGreaterThanOrEqual(4);
      expect(mgs.filter((g) => g.team === 1).length).toBe(mgs.filter((g) => g.team === 2).length);
      // The gunner stands in a trench, free to fire over open ground in front.
      for (const g of mgs) expect(f.map.cells[Math.floor(g.y) * f.map.width + Math.floor(g.x)], id).toBe(0);
    }
  });

  it("heat builds with fire, cools at rest, and the traverse is limited", () => {
    let h = 0;
    for (let i = 0; i < 60; i++) h = stepHeat(h, 1, 0.1, true);
    expect(h).toBe(1);
    for (let i = 0; i < 50; i++) h = stepHeat(h, 0, 0.1, false);
    expect(h).toBeLessThan(MG.resume);
    expect(clampTraverse(Math.PI / 2, 0)).toBeCloseTo(MG.arc);
    expect(clampTraverse(0.2, 0)).toBeCloseTo(0.2);
  });

  it("E mans a gun on your own line: locked in place, the Vickers in hand; E again leaves it", async () => {
    const m = await solo();
    const gun = m.field.mgs!.find((g) => g.team === 1)!;
    m.me.x = gun.x + 0.3;
    m.me.y = gun.y;
    expect(m.prompt()).toBe("Man the Vickers gun");
    m.step(DT, { ...IDLE, interact: true });
    expect(m.me.mounted).toBe(true);
    expect(activeWeapon(m.me)?.era).toBe("mg");
    expect(m.markers().some((k) => k.kind === "mg" && k.label === "manned")).toBe(true);
    m.step(DT, { ...IDLE, forward: 1 });
    expect([m.me.x, m.me.y]).toEqual([gun.x, gun.y]);
    for (let i = 0; i < 30; i++) m.step(DT, { ...IDLE, fire: true });
    expect(m.task()?.label).toMatch(/heat/i);
    expect(m.task()!.k).toBeGreaterThan(0);
    m.step(DT, { ...IDLE, interact: true });
    expect(m.me.mounted).toBe(false);
    expect(activeWeapon(m.me)?.era).toBe("ww1");
  });
});

describe("medics and revives", () => {
  it("a fallen soldier can be revived for a while, not after", () => {
    expect(revivable(false, 0, REVIVE.window - 1)).toBe(true);
    expect(revivable(false, 0, REVIVE.window + 1)).toBe(false);
    expect(revivable(true, 0, 1)).toBe(false);
    expect(revivable(false, undefined, 1)).toBe(false);
  });

  it("a medic holds E by a fallen teammate to bring them back, and the ticket returns", async () => {
    const m = await solo("medic");
    const mate = place(m, createEntity({ id: "bot-mate", name: "Tommy", kind: "bot", team: 1, x: 0, y: 0 }), 1);
    mate.alive = false;
    mate.hp = 0;
    mate.respawnAt = m.world.time + 30;
    m["deadAt"].set(mate.id, m.world.time);
    const tickets = m.cq.tickets[0];
    expect(m.prompt()).toBe("Revive Tommy");
    expect(m.markers().some((k) => k.kind === "wounded")).toBe(true);
    m.step(DT, { ...IDLE, interact: true });
    expect(m.task()?.label).toBe("First aid");
    for (let t = 0; t < REVIVE.hold + 0.2; t += DT) m.step(DT, IDLE);
    expect(mate.alive).toBe(true);
    expect(mate.hp).toBe(Math.round(mate.maxHp * REVIVE.hp));
    expect(m.cq.tickets[0]).toBe(tickets + 1);
    expect(m.battleStats().revives).toBe(1);
  });

  it("you wait as WOUNDED when a medic is near, and fire redeploys you straight away", async () => {
    const m = await solo("rifleman");
    const medic = place(m, createEntity({ id: "bot-doc", name: "Doc", kind: "bot", team: 1, x: 0, y: 0 }), 5);
    m["botClass"].set(medic.id, "medic");
    m.me.hp = 1;
    m.world.entities.get(m.me.id)!.shield = 0;
    m["clouds"].push({ id: "c", x: m.me.x, y: m.me.y, born: m.world.time - GAS.grow, owner: "artillery" });
    for (let i = 0; i < 120 && m.me.alive; i++) m.step(DT, IDLE);
    expect(m.me.alive).toBe(false);
    m["clouds"].length = 0;
    m.step(DT, IDLE);
    expect(m.banner()?.text).toBe("WOUNDED");
    for (let i = 0; i < 60; i++) m.step(DT, IDLE);
    m.step(DT, { ...IDLE, fire: true });
    m.step(DT, IDLE);
    expect(m.me.alive).toBe(true);
  });
});

describe("the Argonne Forest", () => {
  it("is a sixth Classic front: dense forest, the old mill, every flag reachable", () => {
    expect(FRONT_IDS).toContain("argonne");
    const f = battlefield("argonne");
    expect(f.map.name).toBe("Argonne Forest");
    const trees = [...f.map.cells].filter((c) => c === 4).length;
    expect(trees).toBeGreaterThan(150);
    expect(f.map.front?.id).toBe("argonne");
  });
});

describe("war record", () => {
  it("counts bayonet, Vickers, gas kills and revives into the new medals", () => {
    let r = EMPTY_RECORD;
    const battle = { kills: 3, deaths: 1, captures: 0, won: true, durationS: 200, damage: 100, digs: 0, grenadeKills: 0, bestStreak: 3, front: "argonne", mode: "conquest" as const, players: 16, bayonetKills: 5, mgKills: 13, revives: 8, gasKills: 1 };
    r = withBattle(withBattle(r, battle), battle);
    expect([r.bayonetKills, r.mgKills, r.revives, r.gasKills]).toEqual([10, 26, 16, 2]);
    const earned = MEDALS.filter((x) => x.earned(r)).map((x) => x.id);
    expect(earned).toEqual(expect.arrayContaining(["cold-steel", "machine-gun-corps", "stretcher-bearer", "argonne-cross"]));
  });
});
