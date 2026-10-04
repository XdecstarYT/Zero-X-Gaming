import { describe, expect, it } from "vitest";
import { showResults, type MatchReward } from "./results";

const stats = { kills: 4, placement: 2, players: 16, damage: 812, chests: 3, survivedS: 241, difficulty: "hard" as const };
const reward: MatchReward = {
  xpMatch: 400,
  xpChallenges: 300,
  xpTotal: 5200,
  tierBefore: 4,
  tierAfter: 5,
  tierXp: 1000,
  cashCup: true,
  coinsWon: 20,
  tierCoins: 25,
  coins: 45,
  hasPass: false,
  unlocked: [],
  challenges: [{ title: "Eliminate 3 opponents", xp: 300 }],
};

describe("results screen", () => {
  it("shows placement, stats, Cash Cup payout, XP, tier-up and challenges, then resolves on Continue", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const done = showResults(root, { stats, won: false, ranked: true, reward: Promise.resolve(reward), reduceMotion: true, score: 0 });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const text = root.textContent ?? "";
    expect(text).toContain("#2 of 16");
    expect(text).toContain("Eliminations");
    expect(text).toContain("812");
    expect(text).toContain("4:01");
    expect(text).toContain("CASH CUP");
    expect(text).toContain("+20 ZX Cash");
    expect(text).toContain("+700 XP");
    expect(text).toContain("TIER UP! 4 → 5");
    expect(text).toContain("+45 ZX Cash · balance 45");
    expect(text).toContain("Get the Battle Pass");
    expect(text).toContain("Eliminate 3 opponents");
    (root.querySelector("button") as HTMLButtonElement).click();
    await done;
    expect(root.querySelector('[data-testid="siege-results"]')).toBeNull();
  });

  it("marks unranked matches and skips rewards", async () => {
    const root = document.createElement("div");
    const done = showResults(root, { stats, won: true, ranked: false, reward: null, reduceMotion: true, score: 900 });
    expect(root.textContent).toContain("#1 Victory Royale");
    expect(root.textContent).toContain("Unranked match");
    (root.querySelector("button") as HTMLButtonElement).click();
    await done;
  });
});
