import { GAMES } from "./catalog";
import { gameHref } from "@/lib/nextx";

export interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: string;
  /** Extra words it answers to. */
  words: string;
}

const PAGES: PaletteItem[] = [
  { id: "p-home", label: "Home", hint: "Page", href: "/", icon: "🏠", words: "start" },
  { id: "p-games", label: "All games", hint: "Page", href: "/games", icon: "🎮", words: "browse library catalog" },
  { id: "p-sports", label: "Sports+", hint: "Page", href: "/sports", icon: "🏟️", words: "sport live channels" },
  { id: "p-pass", label: "Battle Pass", hint: "Page", href: "/battle-pass", icon: "🎟️", words: "season tiers rewards xp" },
  { id: "p-nextx", label: "NextX", hint: "Next generation game production: WareForge, YourGov and Zero City", href: "/nextx", icon: "✦", words: "nextx next gen wareforge yourgov zero city studio label app" },
  { id: "p-cash-cup", label: "Cash Cup", hint: "Page", href: "/cash-cup", icon: "🏆", words: "tournament neon siege zx cash prize" },
  { id: "p-shop", label: "Item Shop", hint: "Page", href: "/shop", icon: "🛒", words: "skins coins zx cash buy" },
  { id: "p-locker", label: "Locker", hint: "Page", href: "/locker", icon: "🧥", words: "cosmetics outfit equip" },
  { id: "p-ranks", label: "Leaderboards", hint: "Page", href: "/leaderboards", icon: "🏆", words: "ranks scores top" },
  { id: "p-profile", label: "Profile", hint: "Page", href: "/profile", icon: "👤", words: "account badges level" },
  { id: "p-zlink", label: "ZLink+", hint: "Membership: every Sports+ game, UBusiness Ultimate", href: "/zlink", icon: "➕", words: "zlink link membership pass sports ubusiness" },
  { id: "p-settings", label: "Settings", hint: "Page", href: "/settings", icon: "⚙️", words: "theme keys controls password" },
];

export function paletteItems(owner = false): PaletteItem[] {
  const games = GAMES.filter((g) => g.status === "live").map<PaletteItem>((g) => ({
    id: `g-${g.slug}`,
    label: g.title,
    hint: g.tagline,
    href: gameHref(g.slug),
    icon: "▶",
    words: `${g.category} ${g.tags.join(" ")}`,
  }));
  const extra = owner ? [{ id: "p-owner", label: "Owner panel", hint: "Owner", href: "/owner", icon: "👑", words: "admin dashboard" }] : [];
  return [...games, ...PAGES, ...extra];
}

/** Ranks matches: title starts-with, then title contains, then other words. Empty query lists everything. */
export function searchPalette(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const scored: [number, PaletteItem][] = [];
  for (const it of items) {
    const label = it.label.toLowerCase();
    const rest = `${it.hint} ${it.words}`.toLowerCase();
    const score = label.startsWith(q) ? 0 : label.includes(q) ? 1 : rest.includes(q) ? 2 : -1;
    if (score >= 0) scored.push([score, it]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, it]) => it);
}
