import { loadMatchesPlayed, recordSiegeMatch, rewardLabel } from "@/lib/season-client";
import { toast } from "@/store/toast";
import { registerMatchEnd } from "./index";

/** Ranked matches feed the battle pass (XP, challenges, unlocks) and Cash Cup coins. */
registerMatchEnd(
  (stats, { ranked }) => {
    if (!ranked) return;
    recordSiegeMatch(stats)
      .then((s) => {
        const parts: string[] = [];
        if (s.cashCup)
          parts.push(s.coinsWon ? `Cash Cup: +${s.coinsWon} coins!` : "Cash Cup: finish top 3 next time for coins.");
        if (s.tierAfter > s.tierBefore) parts.push(`Tier ${s.tierAfter} reached!`);
        if (s.unlocked.length) parts.push(`Unlocked: ${s.unlocked.map(rewardLabel).join(", ")}`);
        else if (s.tierAfter > s.tierBefore && !s.hasPass) parts.push("Get the Battle Pass to claim tier rewards.");
        if (s.challenges.length) parts.push(`Challenges done: ${s.challenges.map((c) => c.title).join(", ")}`);
        toast(`+${s.xpMatch + s.xpChallenges} Season XP${s.coinsWon ? ` · +${s.coinsWon} coins` : ""}`, {
          description: parts.join(" · ") || "Check your progress on the Battle Pass page.",
          tone: "success",
          durationMs: 8000,
        });
      })
      .catch(() => toast("Couldn't save season progress", { description: "Check your connection.", tone: "error" }));
  },
  () => loadMatchesPlayed(),
);
