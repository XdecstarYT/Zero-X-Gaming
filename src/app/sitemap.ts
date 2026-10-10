import type { MetadataRoute } from "next";
import { GAMES } from "@/lib/catalog";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/games`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/sports`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/sports/live`, changeFrequency: "always", priority: 0.7 },
    { url: `${SITE_URL}/leaderboards`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/nextx`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/cash-cup`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/battle-pass`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/locker`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/shop`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/zlink`, changeFrequency: "weekly", priority: 0.6 },
    ...GAMES.map((g) => ({
      url: `${SITE_URL}/games/${g.slug}`,
      lastModified: g.releasedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
