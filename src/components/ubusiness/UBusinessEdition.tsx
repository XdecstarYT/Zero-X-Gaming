"use client";

import { UBusinessCard } from "./UBusinessCard";
import { useUBusiness } from "./use-ubusiness";

/** Under the game: your edition, and the upgrade to Ultimate if you have Lite. (Before you own one, the game's own lock card does the selling.) */
export function UBusinessEdition() {
  const { tier } = useUBusiness();
  if (!tier) return null;
  return (
    <div className="mt-4">
      <UBusinessCard />
    </div>
  );
}
