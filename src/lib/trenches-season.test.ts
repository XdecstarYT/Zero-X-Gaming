import { beforeEach, describe, expect, it, vi } from "vitest";

// Not connected to the online service: Trenches battles use the device save.
vi.mock("./supabase/client", () => ({ getSupabaseBrowser: () => null }));

const { recordTrenchesMatch, loadSeasonState } = await import("./season-client");
const { trenchesMatchXp } = await import("./season");
const { createDeviceAccount, signOutDeviceAccount } = await import("./device-accounts");

const battle = {
  kills: 4,
  deaths: 2,
  captures: 2,
  won: true,
  durationS: 480,
  damage: 700,
  digs: 6,
  grenadeKills: 1,
  bestStreak: 3,
  front: "verdun",
  mode: "conquest" as const,
  players: 20,
};

beforeEach(() => localStorage.clear());

describe("Trenches battles feed the season on this device", () => {
  it("award their own XP, never a Cash Cup, and count as a match", async () => {
    const s = await recordTrenchesMatch(battle);
    expect(s.xpMatch).toBe(trenchesMatchXp(battle));
    expect(s.cashCup).toBe(false);
    const again = await recordTrenchesMatch(battle);
    const third = await recordTrenchesMatch(battle);
    expect(again.cashCup || third.cashCup).toBe(false);
    const state = await loadSeasonState();
    expect(state.matches).toBe(3);
    expect(state.wins).toBe(3);
    expect(state.xp).toBeGreaterThanOrEqual(3 * trenchesMatchXp(battle));
  });

  it("keep each device account's progress separate", async () => {
    await createDeviceAccount("Private_Ryan", "password1");
    await recordTrenchesMatch(battle);
    expect((await loadSeasonState()).matches).toBe(1);
    signOutDeviceAccount();
    expect((await loadSeasonState()).matches).toBe(0);
  });
});
