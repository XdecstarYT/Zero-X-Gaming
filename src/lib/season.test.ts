import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNERS, COIN_TIERS, DAILY, REWARDS, SEASON, WEEKLY, activeChallenges, matchXp, ownedItems, rewardsBetween, tierCoinsBetween, tierFromXp } from "./season";
import { OUTFITS, WRAPS } from "@/games/neon-siege/cosmetics";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260930120000_season_one.sql"), "utf8");

describe("season catalogue", () => {
  it("has one reward per tier, every item exists, and each is unlocked once", () => {
    expect(REWARDS).toHaveLength(SEASON.tiers);
    const exists = { outfit: OUTFITS, wrap: WRAPS, banner: BANNERS } as const;
    for (const r of REWARDS) expect(exists[r.kind][r.item], `${r.kind}:${r.item}`).toBeDefined();
    expect(new Set(REWARDS.map((r) => `${r.kind}:${r.item}`)).size).toBe(REWARDS.length);
    expect(REWARDS.at(-1)).toMatchObject({ kind: "outfit", item: "vanguard" });
  });

  it("matches the database seed (rewards, challenges, season row)", () => {
    for (const r of REWARDS) expect(sql).toContain(`('s1', ${r.tier}, '${r.kind}', '${r.item}')`);
    for (const c of [...DAILY, ...WEEKLY])
      expect(sql).toContain(`('${c.id}', 's1', '${c.kind}', ${c.idx}, '${c.metric}', ${c.goal}, ${c.xp}, '${c.title}')`);
    expect(sql).toContain(`('s1', 1, 'Ground Zero', '${SEASON.startsAt}', '${SEASON.endsAt}', ${SEASON.tiers}, ${SEASON.tierXp})`);
  });
});

describe("tiers and XP", () => {
  it("maps XP to tiers and caps at the last tier", () => {
    expect(tierFromXp(0)).toMatchObject({ tier: 0, into: 0 });
    expect(tierFromXp(2500)).toMatchObject({ tier: 2, into: 500, pct: 0.5 });
    expect(tierFromXp(999_999).tier).toBe(30);
    expect(rewardsBetween(900, 3100).map((r) => r.tier)).toEqual([1, 2, 3]);
    expect(ownedItems(0).has("recruit")).toBe(true);
    expect(ownedItems(0).has("urban")).toBe(false);
    expect(ownedItems(3000).has("urban")).toBe(true);
  });

  it("computes match XP like the SQL function", () => {
    // 50 + 3*40 + 120 (top 3) + 240/2 + 2*10 + 600/20
    expect(matchXp({ kills: 3, placement: 2, players: 16, damage: 600, chests: 2, survivedS: 240 })).toBe(460);
    expect(matchXp({ kills: 0, placement: 16, players: 16, damage: 0, chests: 0, survivedS: 5 })).toBe(52);
    expect(matchXp({ kills: 15, placement: 1, players: 16, damage: 9999, chests: 60, survivedS: 900 })).toBe(1500);
    expect(sql).toContain("least(1500,");
  });
});

describe("challenges", () => {
  it("rotates 3 dailies and 4 weeklies deterministically", () => {
    const start = Date.parse(SEASON.startsAt);
    const day0 = activeChallenges(start + 1000);
    expect(day0.filter((c) => c.kind === "daily").map((c) => c.id)).toEqual(["d0", "d1", "d2"]);
    expect(day0.filter((c) => c.kind === "weekly").map((c) => c.id)).toEqual(["w0", "w1", "w2", "w3"]);
    const day4 = activeChallenges(start + 4 * 86_400_000 + 5);
    expect(day4.filter((c) => c.kind === "daily").map((c) => c.id)).toEqual(["d3", "d4", "d5"]);
    expect(day4[0].period).toBe("d4");
    const week1 = activeChallenges(start + 8 * 86_400_000);
    expect(week1.filter((c) => c.kind === "weekly").map((c) => c.id)).toEqual(["w4", "w5", "w6", "w7"]);
    expect(week1.at(-1)!.period).toBe("w1");
  });
});

describe("free coin track", () => {
  it("pays coins every 5 tiers to everyone, matching the database", () => {
    const freeSql = readFileSync(join(process.cwd(), "supabase/migrations/20260930170000_free_coin_track.sql"), "utf8");
    for (const [tier, coins] of Object.entries(COIN_TIERS)) expect(freeSql).toContain(`('s1', ${tier}, ${coins})`);
    expect(Object.values(COIN_TIERS).reduce((a, b) => a + b, 0)).toBe(175);
    expect(tierCoinsBetween(4600, 5000)).toBe(25);
    expect(tierCoinsBetween(0, 4999)).toBe(0);
    expect(tierCoinsBetween(0, 99_999)).toBe(175);
  });
});

describe("Trenches battles in the season", () => {
  it("trenchesMatchXp mirrors the SQL (checked against the database: 925)", async () => {
    const { trenchesMatchXp, TRENCHES_XP_CAP } = await import("./season");
    expect(trenchesMatchXp({ kills: 3, captures: 2, won: true, durationS: 600, digs: 10 })).toBe(925);
    expect(trenchesMatchXp({ kills: 60, captures: 30, won: true, durationS: 900, digs: 400 })).toBe(TRENCHES_XP_CAP);
  });

  it("wins count as wins and top-10s for challenges; losses as neither", async () => {
    const { asChallengeMatch, metricValue } = await import("./season");
    const base = { kills: 4, deaths: 1, captures: 0, durationS: 300, damage: 500, digs: 0, grenadeKills: 0, bestStreak: 0, front: "somme", mode: "conquest" as const, players: 8 };
    const win = asChallengeMatch({ ...base, won: true });
    const loss = asChallengeMatch({ ...base, won: false });
    expect([metricValue("wins", win), metricValue("top10", win)]).toEqual([1, 1]);
    expect([metricValue("wins", loss), metricValue("top10", loss)]).toEqual([0, 0]);
    expect(metricValue("kills", loss)).toBe(4);
  });
});
