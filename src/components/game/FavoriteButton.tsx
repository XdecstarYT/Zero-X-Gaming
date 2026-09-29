"use client";

import { useLibrary } from "@/store/library";
import { toast } from "@/store/toast";
import { cn } from "@/lib/cn";

export function FavoriteButton({ slug, title, className }: { slug: string; title: string; className?: string }) {
  const isFav = useLibrary((s) => s.favorites.includes(slug));
  const toggle = useLibrary((s) => s.toggleFavorite);

  return (
    <button
      type="button"
      aria-pressed={isFav}
      aria-label={isFav ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
      onClick={() => {
        toggle(slug);
        toast(isFav ? `Removed ${title} from favorites` : `Added ${title} to favorites`, {
          tone: isFav ? "info" : "success",
          durationMs: 2500,
        });
      }}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition-colors",
        isFav
          ? "border-magenta/60 bg-magenta/20 text-magenta"
          : "border-white/15 bg-black/50 text-white/80 hover:border-magenta/60 hover:text-magenta",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill={isFav ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" />
      </svg>
    </button>
  );
}
