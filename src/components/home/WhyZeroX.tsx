import { GAMES } from "@/lib/catalog";
import { cn } from "@/lib/cn";

const TILES: { title: string; text: string; icon: string; tone: string; big?: boolean }[] = [
  { title: `${GAMES.length} original games`, text: "Life sims, a shop empire, a shared town, the Great War, police patrols, footy, cricket, golf and more. Every one built here, every one free to start.", icon: "🎮", tone: "from-cyan/25", big: true },
  { title: "No downloads", text: "Click and you're in. Phone, tablet or desktop.", icon: "⚡", tone: "from-magenta/25" },
  { title: "Play together", text: "Squads in Trenches, a whole town in Hometown.", icon: "🤝", tone: "from-violet/25" },
  { title: "A season to climb", text: "XP, a battle pass, cash cups and ZX Cash.", icon: "🏆", tone: "from-warning/25" },
  { title: "Something every day", text: "Daily rewards, daily goals, new updates.", icon: "📅", tone: "from-success/25" },
];

/** Why Zero X, as a bento grid. */
export function WhyZeroX() {
  return (
    <ul className="grid auto-rows-[minmax(150px,auto)] gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {TILES.map((t) => (
        <li
          key={t.title}
          className={cn(
            "zx-ring group relative overflow-hidden rounded-2xl border border-border bg-surface/85 p-6",
            t.big && "sm:col-span-2 lg:row-span-2",
          )}
        >
          <div className={cn("pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-transform duration-700 group-hover:scale-125", t.tone)} aria-hidden />
          <span className={cn("relative block", t.big ? "text-6xl" : "text-4xl")} aria-hidden>
            {t.icon}
          </span>
          <h3 className={cn("relative mt-4 font-display font-black uppercase tracking-tight", t.big ? "text-3xl sm:text-5xl" : "text-xl")}>{t.title}</h3>
          <p className={cn("relative mt-2 text-muted", t.big ? "max-w-md text-lg" : "text-sm")}>{t.text}</p>
        </li>
      ))}
    </ul>
  );
}
