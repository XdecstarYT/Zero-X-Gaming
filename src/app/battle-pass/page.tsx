import type { Metadata } from "next";

export const metadata: Metadata = { title: "Battle Pass" };

export default function BattlePassPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">Season 1</p>
      <h1 className="font-display text-3xl font-black uppercase tracking-tight sm:text-4xl">Battle Pass</h1>
      <p className="mt-2 text-muted">The Season 1 battle pass unlocks with the Neon Siege update.</p>
    </div>
  );
}
