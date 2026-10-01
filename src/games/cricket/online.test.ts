import { describe, expect, it } from "vitest";
import { MemoryHub } from "../neon-siege/net";
import { CricketLink, GuestPump, HostPump, matchFrom, type CricketMsg, type MatchConfig } from "./online";
import { emptyInput, SWING_LAG, type CricketInput, type CricketSim } from "./sim";

/** A player who presses as the ball arrives and bowls in the green. */
function play(sim: CricketSim, inp: CricketInput, state: { pressed: boolean; ran: boolean }) {
  inp.shot = null;
  inp.bowl = false;
  inp.next = sim.phase === "break";
  inp.aim = -32;
  if (sim.phase !== "delivery") state.pressed = false;
  if (sim.humanBats && sim.phase === "delivery" && !state.pressed && sim.ball.z - sim.contactZ <= -sim.vel.z * SWING_LAG + 0.2) {
    inp.shot = "ground";
    state.pressed = true;
  }
  if (sim.humanBowls) {
    inp.kind = sim.bowler.style === "spin" ? "offbreak" : "stock";
    if (sim.phase === "plan" && sim.pt > 0.3) inp.bowl = true;
    if (sim.phase === "runup" && sim.meterLocked === null && sim.meter >= 0.84) inp.bowl = true;
  }
}

async function room() {
  const hub = new MemoryHub<CricketMsg>();
  const a = new CricketLink(hub.join("h", "Host"), "Host", "legends");
  const b = new CricketLink(hub.join("g", "Guest"), "Guest", "falcons");
  let started: MatchConfig | null = null;
  b.onStart = (c) => (started = c);
  await a.connect();
  await b.connect();
  return { a, b, started: () => started };
}

describe("online", () => {
  it("elects the first player host and shares the match config", async () => {
    const { a, b, started } = await room();
    expect(a.isHost).toBe(true);
    expect(b.isHost).toBe(false);
    expect(a.ready && b.ready).toBe(true);
    expect(a.opponent?.name).toBe("Guest");
    const cfg = a.start(1, 42);
    expect(started()).toEqual(cfg);
    expect(cfg.teams).toEqual(["legends", "falcons"]);
  });

  it("plays a whole match between two people, both screens agreeing", async () => {
    const { a, b } = await room();
    const cfg = a.start(1, 7);
    const host = matchFrom(cfg, 0);
    const guest = matchFrom(cfg, 1);
    const hp = new HostPump(host, a);
    const gp = new GuestPump(guest, b);
    const hi = emptyInput();
    const gi = emptyInput();
    const hs = { pressed: false, ran: false };
    const gs = { pressed: false, ran: false };
    let now = 0;
    const kinds = new Set<string>();
    let guestBatted = false;
    let guestBowled = false;
    for (let i = 0; i < 60 * 600 && host.phase !== "done"; i++) {
      now += 1000 / 60;
      play(host, hi, hs);
      play(guest, gi, gs);
      if (guest.humanBats && guest.phase === "delivery") guestBatted = true;
      if (guest.humanBowls && guest.phase === "runup") guestBowled = true;
      for (const e of hp.step(1 / 60, hi, now)) kinds.add(e.kind);
      gp.step(1 / 60, gi, now);
    }
    // Let the last messages through.
    for (let i = 0; i < 120; i++) {
      now += 1000 / 60;
      hp.step(1 / 60, hi, now);
      gp.step(1 / 60, gi, now);
    }
    expect(host.phase).toBe("done");
    expect(guest.phase).toBe("done");
    expect(guestBatted && guestBowled).toBe(true);
    expect(kinds.has("hit")).toBe(true);
    expect(guest.innings.map((x) => `${x.runs}/${x.wkts}`)).toEqual(host.innings.map((x) => `${x.runs}/${x.wkts}`));
    expect(guest.resultText).toBe(host.resultText);
    // Each side sees the result from its own end.
    if (host.winner !== null) expect(guest.won).toBe(!host.won);
    expect(host.runsBy[1]).toBeGreaterThan(0);
    expect(host.runsBy[1]).toBe(host.innings.find((x) => x.bat === 1)!.runs - host.innings.find((x) => x.bat === 1)!.extras);
  });
});
