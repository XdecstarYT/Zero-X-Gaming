import type { GameFactory } from "../types";
import { NeonSiege } from "../neon-siege/index";
import type { MatchReward } from "../neon-siege/results";
import { recordTrenchesMatch, rewardLabel } from "@/lib/season-client";
import { SEASON } from "@/lib/season";
import { addBattle } from "@/lib/war-record";
import { buildTrenchesMenu } from "./menu";
import { TrenchesMatch } from "./match";

/**
 * Trenches runs on the shared FPS shell (3D view, HUD, input, audio) with its
 * own menu and modes. Every finished battle feeds the season (XP, challenges,
 * battle pass) and the player's war record (medals).
 */
const factory: GameFactory = () =>
  new NeonSiege(undefined, undefined, undefined, {
    slug: "trenches",
    menu: buildTrenchesMenu,
    onMatchEnd: (mode) => {
      if (!(mode instanceof TrenchesMatch)) return null;
      const battle = mode.battleStats();
      // Too short to count (e.g. joined as it ended).
      if (battle.durationS < 20) return null;
      const medals = addBattle(battle);
      return recordTrenchesMatch(battle).then(
        (s): MatchReward => ({
          xpMatch: s.xpMatch,
          xpChallenges: s.xpChallenges,
          xpTotal: s.xpTotal,
          tierBefore: s.tierBefore,
          tierAfter: s.tierAfter,
          tierXp: SEASON.tierXp,
          cashCup: false,
          coinsWon: 0,
          tierCoins: s.tierCoins,
          coins: s.coins,
          hasPass: s.hasPass,
          unlocked: s.unlocked.map(rewardLabel),
          challenges: s.challenges.map((c) => ({ title: c.title, xp: c.xp })),
          medals: medals.map((m) => ({ name: m.name, description: m.description, ribbon: m.ribbon })),
        }),
      );
    },
  });
export default factory;
