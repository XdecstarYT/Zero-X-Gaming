import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OUTFITS, WRAPS } from "@/games/neon-siege/cosmetics";
import { BATTLE_PASS_PRICE, CASH_CUP_PRIZES, currentDrop, DROPS, isCashCup, matchesUntilCashCup } from "./economy";
import { BANNERS } from "./season";
import { buyBattlePass, buyShopItem, loadSeasonState, recordGuestMatch, type RecordedMatch } from "./season-client";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260930150000_coins_shop.sql"), "utf8");

const match = (placement: number, difficulty: RecordedMatch["difficulty"] = "hard"): RecordedMatch => ({
  kills: 2,
  placement,
  players: 16,
  damage: 300,
  chests: 1,
  survivedS: 120,
  difficulty,
});

describe("Cash Cups", () => {
  it("every third match is a Cash Cup", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(isCashCup)).toEqual([false, false, true, false, false, true, true]);
    expect([0, 1, 2, 3].map(matchesUntilCashCup)).toEqual([2, 1, 0, 2]);
    expect(CASH_CUP_PRIZES).toEqual({ 1: 50, 2: 20, 3: 5 });
  });

  it("the server uses the same schedule, prizes and pass price", () => {
    expect(sql).toContain("cash_cup := (prog.matches + 1) % 3 = 0;");
    expect(sql).toContain("case p_placement when 1 then 50 when 2 then 20 when 3 then 5 else 0 end");
    expect(sql).toContain(`public.add_coins(uid, -${BATTLE_PASS_PRICE}, 'battle_pass'`);
  });
});

describe("Item Shop", () => {
  it("DROP 1 sells real catalogue items and matches the database seed", () => {
    const d = DROPS[0];
    expect(d.name).toBe("DROP 1");
    expect(d.items.filter((i) => i.featured)).toHaveLength(1);
    const exists = { outfit: OUTFITS, wrap: WRAPS, banner: BANNERS } as const;
    for (const it of d.items) {
      expect(exists[it.kind][it.item], `${it.kind}:${it.item}`).toBeDefined();
      expect(sql).toContain(`('${d.id}', '${d.name}', '${it.kind}', '${it.item}', ${it.price}, '${d.startsAt}', '${d.endsAt}')`);
    }
    expect(currentDrop(Date.parse("2026-10-01T12:00:00Z"))?.id).toBe("drop-1");
    expect(currentDrop(Date.parse("2026-10-20T00:00:00Z"))).toBeNull();
  });
});

describe("guest economy (same rules as the server)", () => {
  beforeEach(() => {
    localStorage.clear();
    // Inside DROP 1 and Season 1, whatever today's date is.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("pays Cash Cup coins on the third match, on Hard only", async () => {
    expect(recordGuestMatch(match(1)).cashCup).toBe(false);
    expect(recordGuestMatch(match(1)).coinsWon).toBe(0);
    const cup = recordGuestMatch(match(1));
    expect(cup).toMatchObject({ cashCup: true, coinsWon: 50, coins: 50 });
    recordGuestMatch(match(2));
    recordGuestMatch(match(2));
    expect(recordGuestMatch(match(2, "normal"))).toMatchObject({ cashCup: true, coinsWon: 0 });
    recordGuestMatch(match(1));
    recordGuestMatch(match(1));
    expect(recordGuestMatch(match(3))).toMatchObject({ coinsWon: 5, coins: 55 });
    expect((await loadSeasonState()).coins).toBe(55);
  });

  it("gates tier rewards behind the 200-coin pass, then grants everything reached", async () => {
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 3500, matches: 5, wins: 0, kills: 0, coins: 150, challenges: {} }));
    expect((await loadSeasonState()).owned.has("urban")).toBe(false);
    await expect(buyBattlePass()).rejects.toThrow(/Not enough coins/);
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 3500, matches: 5, wins: 0, kills: 0, coins: 230, challenges: {} }));
    const r = await buyBattlePass();
    expect(r.coins).toBe(30);
    expect(r.unlocked.map((u) => u.tier)).toEqual([1, 2, 3]);
    const s = await loadSeasonState();
    expect(s.hasPass).toBe(true);
    expect(s.owned.has("urban")).toBe(true);
    await expect(buyBattlePass()).rejects.toThrow(/already own/);
  });

  it("buys shop items once, with enough coins", async () => {
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, challenges: {} }));
    const it = DROPS[0].items.find((i) => i.item === "frostbite")!;
    const { coins } = await buyShopItem("outfit", "frostbite");
    expect(coins).toBe(100 - it.price);
    expect((await loadSeasonState()).owned.has("frostbite")).toBe(true);
    await expect(buyShopItem("outfit", "frostbite")).rejects.toThrow(/already own/);
    await expect(buyShopItem("outfit", "apex")).rejects.toThrow(/Not enough coins/);
    await expect(buyShopItem("outfit", "vanguard")).rejects.toThrow(/isn't in the shop/);
  });
});
