import { loadMatchesPlayed, recordSiegeMatch, rewardLabel } from "@/lib/season-client";
import { SEASON } from "@/lib/season";
import { registerMatchEnd } from "./index";
import type { MatchReward } from "./results";

/**
 * Ranked matches feed the battle pass (XP, challenges, unlocks) and Cash Cup
 * coins; the result is shown on the in-game results screen.
 */
registerMatchEnd(
  (stats) =>
    recordSiegeMatch(stats).then((s): MatchReward => ({
      xpMatch: s.xpMatch,
      xpChallenges: s.xpChallenges,
      xpTotal: s.xpTotal,
      tierBefore: s.tierBefore,
      tierAfter: s.tierAfter,
      tierXp: SEASON.tierXp,
      cashCup: s.cashCup,
      coinsWon: s.coinsWon,
      tierCoins: s.tierCoins,
      coins: s.coins,
      hasPass: s.hasPass,
      unlocked: s.unlocked.map(rewardLabel),
      challenges: s.challenges.map((c) => ({ title: c.title, xp: c.xp })),
    })),
  () => loadMatchesPlayed(),
);
