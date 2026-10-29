/** The news wire: what happened, where, and whether it leads the bulletin. */
import type { NewsItem, World } from "./state";

export function news(w: World, nation: number, text: string, kind: NewsItem["kind"], big = false) {
  w.news.push({ day: w.day, nation, text, kind, big });
  if (w.news.length > 400) w.news.splice(0, w.news.length - 400);
}

/** The bulletin: today's leading stories, home first. */
export function bulletin(w: World, me: number, n = 5): NewsItem[] {
  const recent = w.news.filter((x) => w.day - x.day <= 7);
  const score = (x: NewsItem) => (x.nation === me ? 3 : 0) + (x.big ? 2 : 0) + (x.kind === "war" ? 1 : 0) - (w.day - x.day) * 0.3;
  return recent.sort((a, b) => score(b) - score(a)).slice(0, n);
}
