import { describe, expect, it } from "vitest";
import { MemoryHub } from "../neon-siege/net";
import { findPath } from "../neon-siege/path";
import { IDLE } from "../neon-siege/royale";
import { weaponDef } from "../neon-siege/items";
import { createEntity } from "../neon-siege/world";
import { battlefield } from "./battlefield";
import {
  ATTACKERS,
  attackersEliminated,
  createConquest,
  FRONTLINE_OBJECTIVES,
  FRONTLINE_SECONDS,
  isLive,
  onDeath,
  stepConquest,
} from "./conquest";
import { FRONT_IDS, FRONTS } from "./fronts";
import { generateFrontline } from "./frontline";
import { equipClass, GRENADES, TrenchesMatch } from "./match";
import type { LobbySnapshot, TrenchMsg } from "./protocol";

const DT = 1 / 60;

describe("Cape Helles (Frontline map)", () => {
  const field = generateFrontline();

  it("is a long landing corridor with five named objectives in order, all reachable from the beach", () => {
    const { map, flags, bases } = field;
    expect([map.width, map.height]).toEqual([FRONTS.helles.width, FRONTS.helles.height]);
    expect(flags.map((f) => f.name)).toEqual(["W Beach", "Sedd el Bahr", "Krithia", "The Line", "Headquarters"]);
    // West to east: each objective is further from the landing than the last.
    for (let i = 1; i < flags.length; i++) expect(flags[i].x).toBeGreaterThan(flags[i - 1].x);
    for (const base of bases)
      for (const f of flags) expect(findPath(map, base[0].x, base[0].y, f.x, f.y), `${f.name}`).not.toBeNull();
    expect(map.front?.id).toBe("helles");
  });

  it("isn't offered for Classic or Breakthrough, and battlefield('helles') builds it", () => {
    expect(FRONT_IDS).not.toContain("helles");
    expect(battlefield("helles").flags).toHaveLength(5);
  });
});

describe("Frontline rules", () => {
  const flags = generateFrontline().flags;

  it("starts with the defenders holding everything and only one objective live at a time", () => {
    const s = createConquest(flags, undefined, "frontline");
    expect(s.flags.every((f) => f.owner === 2)).toBe(true);
    expect(s.flags.map((_, i) => isLive(s, i))).toEqual([true, false, false, false, false]);
    // Deaths never cost tickets in Frontline (redeploys are counted per soldier instead).
    expect(onDeath(s, ATTACKERS)).toEqual([]);
  });

  it("attackers take the objectives one after another and win at the HQ", () => {
    const s = createConquest(flags, undefined, "frontline");
    for (let k = 0; k < FRONTLINE_OBJECTIVES.length; k++) {
      const f = s.flags[FRONTLINE_OBJECTIVES[k][0]];
      const events = [];
      for (let t = 0; t < 40 && s.sector === k; t += 0.05) events.push(...stepConquest(s, [{ x: f.x, y: f.y, team: 1, alive: true }], 0.05));
      expect(f.owner, f.name).toBe(1);
      expect(events.some((e) => e.type === "sector")).toBe(true);
    }
    expect(s.winner).toBe(1);
  });

  it("defenders win when the clock runs out or the landing is wiped out", () => {
    const a = createConquest(flags, undefined, "frontline");
    stepConquest(a, [], FRONTLINE_SECONDS + 1);
    expect(a.winner).toBe(2);
    const b = createConquest(flags, undefined, "frontline");
    expect(attackersEliminated(b)).toEqual([{ type: "ended", winner: 2 }]);
    expect(b.attackersOut).toBe(true);
  });
});

function snap(mode: LobbySnapshot["mode"], cls: LobbySnapshot["players"][number]["cls"] = "rifleman"): LobbySnapshot {
  return { code: "F1", name: "F", hostId: "a", phase: "match", max: 2, bots: false, front: "somme", mode, players: [{ id: "a", name: "A", team: 1, ready: true, cls }], seed: 3, matchId: 1 };
}

async function solo(mode: LobbySnapshot["mode"], opts: ConstructorParameters<typeof TrenchesMatch>[2] = {}) {
  const hub = new MemoryHub<TrenchMsg>();
  const t = hub.join("a", "A");
  await t.connect();
  return { m: new TrenchesMatch(t, snap(mode), { roster: [{ id: "a", name: "A", joinedAt: 1 }], ...opts }), hub };
}

describe("Frontline matches", () => {
  it("fight at Cape Helles whatever front the lobby picked, and show the objective and redeploys", async () => {
    const { m } = await solo("frontline");
    expect(m.world.map.name).toBe("Cape Helles");
    expect(m.status().primary).toBe("ATTACK · OBJECTIVE 1/5: W BEACH · REDEPLOYS 3");
    expect(m.redeploysLeft()).toBe(3);
  });

  it("each death spends a redeploy; with none left you stay down", async () => {
    const { m } = await solo("frontline");
    for (let d = 0; d < 4; d++) {
      m.me.alive = false;
      m.me.hp = 0;
      m.me.respawnAt = m.world.time;
      m.step(DT, IDLE);
    }
    expect(m.redeploysLeft()).toBe(0);
    expect(m.me.alive).toBe(false);
    m.step(DT, IDLE);
    expect(m.banner()?.text).toMatch(/OUT OF REDEPLOYS|DEFEAT/);
  });

  it("Classic and Breakthrough have no redeploy limit", async () => {
    const { m } = await solo("conquest");
    expect(m.redeploysLeft()).toBeNull();
    expect(m.status().primary).toMatch(/LEGION/);
  });
});

describe("loadouts", () => {
  it("equips Great War weapons, gadgets and per-class grenades", () => {
    const e = createEntity({ id: "x", name: "X", kind: "bot", team: 1, x: 1, y: 1 });
    equipClass(e, "rifleman");
    expect(e.inventory[0]).toMatchObject({ kind: "ar", era: "ww1" });
    expect(weaponDef(e.inventory[0] as never).name).toBe("Lee-Enfield Rifle");
    expect(e.inventory[1]).toMatchObject({ kind: "pistol", era: "ww1" });
    expect(e.grenades).toBe(GRENADES.rifleman + 2);

    equipClass(e, "engineer", { primary: "sniper", secondary: "none", gadget: "armour" });
    expect(weaponDef(e.inventory[0] as never).name).toBe("Scoped Lee-Enfield");
    expect(e.inventory.some((it) => it?.type === "consumable" && it.kind === "shield")).toBe(true);
    expect(e.inventory.filter((it) => it?.type === "weapon")).toHaveLength(1);
    expect(e.grenades).toBe(GRENADES.engineer);
  });

  it("the match uses the player's chosen loadout", async () => {
    const { m } = await solo("conquest", { myClass: "assault", myLoadout: { primary: "shotgun", secondary: "pistol", gadget: "medkits" } });
    expect(weaponDef(m.me.inventory[0] as never).name).toBe("M1897 Trench Gun");
  });
});

describe("support calls", () => {
  it("are on cooldown at the start and show in the HUD", async () => {
    const { m } = await solo("conquest");
    expect(m.status().detail).toMatch(/B ARTILLERY 0:\d\d · N SUPPLY DROP 0:\d\d · T RECON FLARE 0:\d\d/);
    m.step(DT, { ...IDLE, support: "supply" });
    expect(m.banner()?.text).toBe("SUPPLY DROP NOT READY");
  });

  it("a supply drop restocks ammo and grenades; a recon flare marks nearby enemies", async () => {
    const { m } = await solo("conquest");
    m["supportReady"] = { artillery: 0, supply: 0, recon: 0, gas: 0 };
    m.me.grenades = 0;
    const gun = m.me.inventory[0];
    if (gun?.type === "weapon") gun.ammo = 0;
    const enemy = createEntity({ id: "bot-e", name: "E", kind: "bot", team: 2, x: m.me.x + 10, y: m.me.y });
    m.world.entities.set(enemy.id, enemy);
    m.step(DT, { ...IDLE, support: "supply" });
    m.step(DT, IDLE);
    expect(m.me.grenades).toBeGreaterThan(0);
    if (gun?.type === "weapon") expect(gun.ammo).toBe(weaponDef(gun).mag);
    expect(m.markers().some((k) => k.kind === "crate")).toBe(true);
    expect(m.markers().some((k) => k.kind === "enemy")).toBe(false);
    m.step(DT, { ...IDLE, support: "recon" });
    expect(m.markers().some((k) => k.kind === "enemy" && k.id === "bot-e")).toBe(true);
  });

  it("artillery calls reach other players, rate-limited per caller; forged callers are ignored", async () => {
    const hub = new MemoryHub<TrenchMsg>();
    const ta = hub.join("a", "A");
    const tb = hub.join("b", "B");
    await ta.connect();
    await tb.connect();
    const s: LobbySnapshot = { ...snap("conquest"), players: [{ id: "a", name: "A", team: 1, ready: true, cls: "rifleman" }, { id: "b", name: "B", team: 2, ready: true, cls: "rifleman" }] };
    const roster = [
      { id: "a", name: "A", joinedAt: 1 },
      { id: "b", name: "B", joinedAt: 2 },
    ];
    new TrenchesMatch(ta, s, { roster });
    const mb = new TrenchesMatch(tb, s, { roster });
    ta.send({ t: "arty", m: 1, s: [[50, 50, 2]], o: "a" });
    ta.send({ t: "arty", m: 1, s: [[60, 50, 2]], o: "a" });
    ta.send({ t: "arty", m: 1, s: [[70, 50, 2]], o: "b" });
    expect(mb["shells"].map((x: { x: number }) => x.x)).toEqual([50]);
  });
});
