/**
 * City milestones and landmarks (the Metropolis update). Milestones go by the best
 * population the city has reached; each one names the city, pays a grant in Mayor mode
 * and unlocks landmarks. Pure: shared by the UI, the tools and the tests.
 */
import type { ServiceKind } from "./lots";

export type MilestoneId = "hamlet" | "village" | "town" | "smallCity" | "city" | "largeCity" | "metropolis" | "megalopolis";

export const MILESTONES: { id: MilestoneId; pop: number; grant: number }[] = [
  { id: "hamlet", pop: 0, grant: 0 },
  { id: "village", pop: 300, grant: 10_000 },
  { id: "town", pop: 1_000, grant: 25_000 },
  { id: "smallCity", pop: 3_000, grant: 50_000 },
  { id: "city", pop: 6_000, grant: 90_000 },
  { id: "largeCity", pop: 12_000, grant: 150_000 },
  { id: "metropolis", pop: 25_000, grant: 250_000 },
  { id: "megalopolis", pop: 50_000, grant: 400_000 },
];

export type Landmark = "hospital" | "museum" | "university" | "stadium" | "tower";
export const LANDMARKS: Landmark[] = ["hospital", "museum", "university", "stadium", "tower"];

/** The milestone (index into MILESTONES) that unlocks each landmark. */
export const LANDMARK_UNLOCK: Record<Landmark, number> = { hospital: 2, museum: 3, university: 4, stadium: 5, tower: 6 };

export const isLandmark = (k: ServiceKind | string): k is Landmark => (LANDMARKS as string[]).includes(k);

/** Index of the milestone a population has reached. */
export function milestoneAt(pop: number) {
  let i = 0;
  while (i + 1 < MILESTONES.length && pop >= MILESTONES[i + 1].pop) i++;
  return i;
}

/** How far from this milestone to the next, 0–1 (1 at the last). */
export function milestoneProgress(pop: number) {
  const i = milestoneAt(pop);
  const next = MILESTONES[i + 1];
  if (!next) return 1;
  const cur = MILESTONES[i].pop;
  return Math.max(0, Math.min(1, (pop - cur) / (next.pop - cur)));
}

/** Can this landmark be built now (unlocked, and not built already)? */
export function landmarkState(kind: Landmark, best: number, built: Set<string>): "locked" | "built" | "ready" {
  if (built.has(kind)) return "built";
  return milestoneAt(best) >= LANDMARK_UNLOCK[kind] ? "ready" : "locked";
}
