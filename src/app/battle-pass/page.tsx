import type { Metadata } from "next";
import { BattlePass } from "@/components/season/BattlePass";

export const metadata: Metadata = {
  title: "Battle Pass",
  description: "Season 1: Ground Zero. Earn Season XP in Neon Siege to unlock outfits, weapon wraps and banners.",
};

export default function BattlePassPage() {
  return <BattlePass />;
}
