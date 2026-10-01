import { describe, expect, it } from "vitest";
import { commentary } from "./commentary";
import { ALL_CLUBS, applyClubEdits } from "./clubs";
import { CLUBS, clubById, FootySim, GOAL_X, kickRange, MAX_KICK, MAX_TORP, NO_INPUT, powerFor, type KickStyle, type SimEvent } from "./sim";

const DT = 1 / 60;
const make = (seed = 1, extra: Partial<ConstructorParameters<typeof FootySim>[0]> = {}) =>
  new FootySim({ seed, rival: clubById("collingwood"), difficulty: "pro", quarterSeconds: 60, ...extra });
const run = (sim: FootySim, seconds: number) => {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds && sim.phase !== "over"; t += DT) {
    sim.step(DT, NO_INPUT);
    events.push(...sim.events);
    sim.events.length = 0;
  }
  return events;
};
type Internals = { awardSet: (id: number, x: number, z: number, kind: string, reason: string) => void; startKick: (p: unknown, aim: number, power: number, target: number, shot: boolean, style: KickStyle) => void };

describe("the competition", () => {
  it("has eighteen National League clubs, plus State and Local leagues, all distinct", () => {
    expect(CLUBS).toHaveLength(18);
    expect(new Set(ALL_CLUBS.map((c) => c.id)).size).toBe(34);
    expect(new Set(ALL_CLUBS.map((c) => c.short)).size).toBe(34);
    const sim = make(1, { home: clubById("geelong"), rival: clubById("wolves") });
    expect(sim.clubs.map((c) => c.name)).toEqual(["Geelong Sharks", "Highland Wolves"]);
  });

  it("the club editor renames and recolours, and rejects junk", () => {
    applyClubEdits({ geelong: { name: "My Club", short: "myc", guernsey: "#123456", hoop: "red" } });
    expect(clubById("geelong")).toMatchObject({ name: "My Club", short: "MYC", guernsey: "#123456" });
    expect(clubById("geelong").hoop).toBe("#f2f2f2");
    applyClubEdits({});
    expect(clubById("geelong").name).toBe("Geelong Sharks");
  });
});

describe("kick styles", () => {
  it("the torpedo goes further than the drop punt", () => {
    expect(MAX_TORP).toBeGreaterThan(MAX_KICK + 8);
    expect(MAX_TORP).toBeGreaterThan(70);
    expect(kickRange(0.6, "torpedo")).toBeGreaterThan(kickRange(0.6));
    expect(kickRange(powerFor(40, "snap"), "snap")).toBeCloseTo(40, 0);
  });

  it("a snap from a tight angle curls back in toward the goals, and often goes through", () => {
    let goals = 0;
    let curled = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sim = make(seed);
      const d = sim.dir(0);
      const p = sim.players.find((q) => q.team === 0 && q.role === 12)!;
      // Clear the area, then take the ball 20 m out and 16 m wide of the goals.
      for (const q of sim.players) if (q !== p) q.x = -d * 30;
      const x = d * (GOAL_X - 20);
      (sim as unknown as Internals).awardSet(p.id, x, 16, "mark", "Mark");
      p.x = x;
      p.z = 16;
      sim.phase = "play";
      sim.set = null;
      (sim as unknown as Internals).startKick(p, Math.atan2(-16, d * 20), Math.min(1, powerFor(30, "snap") + 0.05), -1, true, "snap");
      let minZ = 99;
      const ev: SimEvent[] = [];
      for (let t = 0; t < 4 && sim.phase === "play"; t += DT) {
        sim.step(DT, NO_INPUT);
        ev.push(...sim.events);
        sim.events.length = 0;
        if (sim.ball.state === "air") minZ = Math.min(minZ, Math.abs(sim.ball.z));
      }
      if (ev.some((e) => e.kind === "kick" && e.style === "snap")) curled++;
      if (ev.some((e) => e.kind === "goal")) goals++;
      expect(minZ).toBeLessThan(6);
    }
    expect(curled).toBe(10);
    expect(goals).toBeGreaterThanOrEqual(4);
  });
});

describe("rain", () => {
  it("a wet ground skids: the ball rolls further", () => {
    const roll = (wet: boolean) => {
      const sim = make(3, { wet });
      sim.phase = "play";
      sim.stoppage = null;
      for (const q of sim.players) q.x = 70;
      Object.assign(sim.ball, { state: "ground", holder: -1, x: -20, y: 0.1, z: 0, vx: 9, vy: 0, vz: 0, kick: null, ruck: false });
      for (let i = 0; i < 60; i++) sim.step(DT, NO_INPUT);
      return sim.ball.x;
    };
    expect(roll(true)).toBeGreaterThan(roll(false) + 0.5);
  });
});

describe("player stats and votes", () => {
  it("every kick is someone's; the umpires give 3, 2 and 1 votes; commentary calls the goals", () => {
    const sim = make(9, { quarterSeconds: 45 });
    sim.autopilot = true;
    const events = run(sim, 600);
    expect(sim.phase).toBe("over");
    for (const t of [0, 1] as const) {
      const kicks = sim.players.filter((p) => p.team === t).reduce((a, p) => a + p.st.kicks, 0);
      expect(kicks).toBe(sim.stats[t].kicks);
      const goals = sim.players.filter((p) => p.team === t).reduce((a, p) => a + p.st.goals, 0);
      expect(goals).toBe(sim.score[t].goals);
    }
    const v = sim.votes();
    expect(v.map((x) => x.votes)).toEqual([3, 2, 1]);
    expect(v[0].rating).toBeGreaterThanOrEqual(v[2].rating);
    const goal = events.find((e) => e.kind === "goal");
    if (goal) expect(commentary(goal, sim)).toMatch(/goal|through|six|siren|monster/i);
    expect(commentary({ kind: "over" }, sim)).toMatch(/Full time/);
  });
});

describe("wind and kicking", () => {
  it("the wind pushes a kick sideways, and the AI allows for it", () => {
    const calm = make(2, { wind: 0 });
    const windy = make(2, { wind: 8 });
    expect(Math.hypot(calm.wind.x, calm.wind.z)).toBe(0);
    expect(Math.hypot(windy.wind.x, windy.wind.z)).toBeCloseTo(8);
    const p = windy.players[0];
    p.x = 0;
    p.z = 0;
    const aim = 0;
    const adj = windy.windAim(p, aim, 0.8, "punt", 1);
    // Aim into the wind: the correction opposes the crosswind along z.
    if (Math.abs(windy.wind.z) > 1) expect(Math.sign(adj)).toBe(-Math.sign(windy.wind.z));
  });

  it("aiming at a teammate with the mouse picks them, and the right power is truer", () => {
    const sim = make(4);
    const you = sim.you;
    sim.phase = "play";
    sim.stoppage = null;
    Object.assign(sim.ball, { state: "held", holder: you.id, kick: null, ruck: false });
    const mate = sim.players.find((q) => q.team === 0 && q.id !== you.id)!;
    mate.x = you.x + 30 * sim.dir(0);
    mate.z = you.z;
    mate.vx = mate.vz = 0;
    sim.step(DT, { ...NO_INPUT, aim: { x: mate.x, z: mate.z } });
    expect(sim.kickPlan?.target).toBe(mate.id);
    expect(sim.kickPlan!.ideal).toBeCloseTo(powerFor(30), 1);
  });

  it("a centred needle kicks straighter than a needle at the edge", () => {
    const miss = (needleAt: number) => {
      let off = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const sim = make(seed, { wind: 0 });
        const you = sim.you;
        const gx = GOAL_X * sim.dir(0);
        (sim as unknown as Internals).awardSet(you.id, gx - sim.dir(0) * 30, 0, "mark", "Mark");
        for (let i = 0; i < 40; i++) sim.step(DT, NO_INPUT);
        for (let i = 0; i < 50; i++) sim.step(DT, { ...NO_INPUT, kick: true });
        sim.step(DT, NO_INPUT);
        // Let the needle reach the spot we want, then tap.
        const speed = sim.needleSpeed(you);
        const t = Math.acos(-needleAt) / speed;
        while ((sim.set?.needleT ?? 99) < t) sim.step(DT, NO_INPUT);
        sim.step(DT, { ...NO_INPUT, kick: true });
        for (let i = 0; i < 240; i++) {
          sim.step(DT, NO_INPUT);
          if (Math.abs(sim.ball.x) > GOAL_X - 0.5) {
            off += Math.abs(sim.ball.z);
            break;
          }
        }
      }
      return off;
    };
    expect(miss(0)).toBeLessThan(miss(0.95));
  });
});

describe("be a pro", () => {
  it("career: you are one player, named and numbered, and you never switch", () => {
    const sim = make(6, { pro: { name: "Rookie Smith", number: 44, role: 12, skill: { pace: 0.8, kick: 0.8, mark: 0.8, tackle: 0.6, ruck: 0.3 }, composure: 0.6 } });
    const me = sim.you;
    expect(me.name).toBe("Rookie Smith");
    expect(me.number).toBe(44);
    expect(me.role).toBe(12);
    expect(sim.lockHuman).toBe(me.id);
    const events: SimEvent[] = [];
    for (let i = 0; i < 60 * 30; i++) {
      sim.step(DT, { ...NO_INPUT, switchPlayer: i === 60 });
      events.push(...sim.events);
      sim.events.length = 0;
      expect(sim.human).toBe(me.id);
    }
    expect(events.some((e) => e.kind === "call")).toBe(true);
  });
});
