import { recordSiegeMatch, rewardLabel } from "@/lib/season-client";
import { toast } from "@/store/toast";
import { registerMatchEnd } from "./index";

/** Ranked matches feed the battle pass: season XP, challenges and unlocks. */
registerMatchEnd((stats, { ranked }) => {
  if (!ranked) return;
  recordSiegeMatch(stats)
    .then((s) => {
      const parts: string[] = [];
      if (s.tierAfter > s.tierBefore) parts.push(`Tier ${s.tierAfter} reached!`);
      if (s.unlocked.length) parts.push(`Unlocked: ${s.unlocked.map(rewardLabel).join(", ")}`);
      if (s.challenges.length) parts.push(`Challenges done: ${s.challenges.map((c) => c.title).join(", ")}`);
      toast(`+${s.xpMatch + s.xpChallenges} Season XP`, {
        description: parts.join(" · ") || "Check your progress on the Battle Pass page.",
        tone: "success",
        durationMs: 7000,
      });
    })
    .catch(() => toast("Couldn't save season progress", { description: "Check your connection.", tone: "error" }));
});
