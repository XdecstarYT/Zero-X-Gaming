"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OUTFITS, WRAPS } from "@/games/neon-siege/cosmetics";
import type { Preview } from "@/games/neon-siege/three/preview";
import { cn } from "@/lib/cn";
import { BANNERS, rewardFor, type CosmeticKind } from "@/lib/season";
import { saveLoadout } from "@/lib/season-client";
import { useSettings } from "@/store/settings";
import { toast } from "@/store/toast";
import { RewardArt, itemName, rarityColor, rarityOf } from "./RewardArt";
import { useSeason } from "./use-season";

const TABS: { kind: CosmeticKind; label: string; items: string[] }[] = [
  { kind: "outfit", label: "Outfits", items: Object.keys(OUTFITS) },
  { kind: "wrap", label: "Wraps", items: Object.keys(WRAPS) },
  { kind: "banner", label: "Banners", items: Object.keys(BANNERS) },
];

export function Locker() {
  const { state, setState } = useSeason();
  const [tab, setTab] = useState<CosmeticKind>("outfit");
  const previewHost = useRef<HTMLDivElement>(null);
  const preview = useRef<Preview | null>(null);
  const [noWebGL, setNoWebGL] = useState(false);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const loadout = state?.loadout ?? { outfit: "recruit", wrap: "factory", banner: "rookie" };

  // Lazy-load the 3D preview (three.js lives in its own chunk).
  useEffect(() => {
    let cancelled = false;
    import("@/games/neon-siege/three/preview")
      .then(({ createPreview }) => {
        if (cancelled || !previewHost.current) return;
        preview.current = createPreview(previewHost.current, { reduceMotion });
      })
      .catch(() => !cancelled && setNoWebGL(true));
    return () => {
      cancelled = true;
      preview.current?.destroy();
      preview.current = null;
    };
  }, [reduceMotion]);

  useEffect(() => {
    preview.current?.setOutfit(loadout.outfit);
    preview.current?.setWrap(loadout.wrap);
  });

  const equip = (kind: CosmeticKind, item: string) => {
    if (!state) return;
    const next = { ...state.loadout, [kind]: item };
    setState({ ...state, loadout: next });
    saveLoadout(next).catch(() => toast("Couldn't save your loadout", { tone: "error" }));
  };

  const current = TABS.find((t) => t.kind === tab)!;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ffb321]">Neon Siege</p>
      <h1 className="font-display text-3xl font-black uppercase tracking-tight sm:text-4xl">Locker</h1>
      <p className="mt-1 text-sm text-muted">
        Equip what you&apos;ve unlocked. Earn more on the{" "}
        <Link href="/battle-pass" className="text-cyan hover:underline">
          Battle Pass
        </Link>
        .
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div
          className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border sm:aspect-[4/3] lg:aspect-[4/5]"
          style={{ background: BANNERS[loadout.banner]?.art ?? BANNERS.rookie.art }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
          <div ref={previewHost} className="absolute inset-0" data-testid="locker-preview" />
          {noWebGL && <RewardArt kind="outfit" item={loadout.outfit} className="absolute inset-8 bg-transparent" />}
          <div className="pointer-events-none absolute right-4 bottom-4 left-4">
            <p className="font-display text-2xl font-black uppercase">{itemName("outfit", loadout.outfit)}</p>
            <p className="text-xs text-white/80">
              {itemName("wrap", loadout.wrap)} wrap · {itemName("banner", loadout.banner)} banner
            </p>
          </div>
        </div>

        <div>
          <div role="tablist" aria-label="Cosmetic type" className="flex gap-2">
            {TABS.map((t) => (
              <button
                key={t.kind}
                type="button"
                role="tab"
                id={`tab-${t.kind}`}
                aria-selected={tab === t.kind}
                aria-controls="locker-panel"
                onClick={() => setTab(t.kind)}
                className={cn(
                  "rounded-md border px-4 py-2 text-sm font-semibold",
                  tab === t.kind ? "border-cyan text-cyan" : "border-border text-muted hover:text-text",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div id="locker-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {current.items.map((item) => {
                const owned = state?.owned.has(item) ?? ["recruit", "ranger", "factory", "rookie"].includes(item);
                const equipped = loadout[tab] === item;
                const reward = rewardFor(tab, item);
                const rarity = rarityOf(tab, item);
                return (
                  <li key={item}>
                    <button
                      type="button"
                      disabled={!owned || !state}
                      aria-pressed={equipped}
                      onClick={() => equip(tab, item)}
                      className={cn(
                        "flex w-full flex-col overflow-hidden rounded-lg border-2 bg-surface text-left transition hover:brightness-110 disabled:cursor-not-allowed",
                        equipped && "ring-2 ring-cyan ring-offset-2 ring-offset-bg",
                      )}
                      style={{ borderColor: rarityColor(rarity) + (owned ? "" : "55") }}
                    >
                      <RewardArt
                        kind={tab}
                        item={item}
                        className={cn("m-2 aspect-[4/3]", !owned && "opacity-40 grayscale")}
                      />
                      <span className="px-2 pb-2">
                        <span className="block truncate text-sm font-semibold">{itemName(tab, item)}</span>
                        <span className="block text-[11px]" style={{ color: owned ? rarityColor(rarity) : undefined }}>
                          {equipped ? (
                            "Equipped"
                          ) : owned ? (
                            <span className="capitalize">{rarity}</span>
                          ) : reward ? (
                            `Battle Pass tier ${reward.tier}`
                          ) : (
                            "Locked"
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {state && !state.signedIn && (
            <p className="mt-4 text-xs text-muted">
              Guest loadouts are saved on this device. Sign in to keep them on your account.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
