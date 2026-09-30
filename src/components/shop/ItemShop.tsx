"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Preview } from "@/games/neon-siege/three/preview";
import { RewardArt, itemName, rarityColor, rarityOf } from "@/components/season/RewardArt";
import { useSeason } from "@/components/season/use-season";
import { cn } from "@/lib/cn";
import { CASH_CUP_PRIZES, currentDrop, DROPS, type ShopItem } from "@/lib/economy";
import { buyShopItem } from "@/lib/season-client";
import { useSettings } from "@/store/settings";
import { toast } from "@/store/toast";
import { CoinAmount, CoinIcon } from "./Coin";

const subscribeSecond = (cb: () => void) => {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
};
function useNow() {
  return useSyncExternalStore(
    subscribeSecond,
    () => Math.floor(Date.now() / 1000) * 1000,
    () => null,
  );
}

function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${sec}s`;
}

export function ItemShop() {
  const { state, setState } = useSeason();
  const now = useNow();
  // Before hydration (no clock yet) render the first drop; the live one takes over on mount.
  const drop = now ? currentDrop(now) : DROPS[0];
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const coins = state?.coins ?? 0;

  async function buy(it: ShopItem) {
    const key = `${it.kind}:${it.item}`;
    if (confirming !== key) return setConfirming(key);
    setBusy(key);
    try {
      const r = await buyShopItem(it.kind, it.item);
      if (state) setState({ ...state, coins: r.coins, owned: new Set([...state.owned, it.item]) });
      toast(`${itemName(it.kind, it.item)} is yours!`, { description: "Equip it in the Locker.", tone: "success" });
    } catch (e) {
      toast("Couldn't buy that", { description: (e as Error).message, tone: "error" });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  if (!drop) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-black uppercase">Item Shop</h1>
        <p className="mt-2 text-muted">The next drop is on its way. Check back soon!</p>
      </div>
    );
  }

  const featured = drop.items.find((i) => i.featured) ?? drop.items[0];
  const rest = drop.items.filter((i) => i !== featured);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-2xl border border-[#ff7a1a]/40 p-5 text-white sm:p-8"
        style={{
          background:
            "radial-gradient(900px 400px at 85% 0%, rgba(255,122,26,.35), transparent 60%), repeating-linear-gradient(135deg, #16181c 0 22px, #1b1d22 22px 44px)",
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ffb06b]">Item Shop</p>
            <h1
              className="mt-1 font-display text-5xl font-black uppercase italic tracking-tight sm:text-7xl"
              data-testid="drop-name"
            >
              <span className="bg-gradient-to-r from-[#ff7a1a] via-[#ffd23f] to-[#ff7a1a] bg-clip-text text-transparent">
                {drop.name}
              </span>
            </h1>
            <p className="mt-2 max-w-lg text-sm text-white/80">{drop.tagline}</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white/90" aria-live="off">
              Leaves in {now ? countdown(Date.parse(drop.endsAt) - now) : "…"}
            </p>
            <p className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-sm">
              Your balance <CoinAmount amount={coins} className="text-[#f2c230]" />
            </p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <FeaturedCard
          it={featured}
          owned={!!state?.owned.has(featured.item)}
          confirming={confirming === `${featured.kind}:${featured.item}`}
          busy={busy === `${featured.kind}:${featured.item}`}
          canAfford={coins >= featured.price}
          disabled={!state}
          onBuy={() => buy(featured)}
        />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={`${drop.name} items`}>
          {rest.map((it) => {
            const key = `${it.kind}:${it.item}`;
            return (
              <li key={key}>
                <ItemCard
                  it={it}
                  owned={!!state?.owned.has(it.item)}
                  confirming={confirming === key}
                  busy={busy === key}
                  canAfford={coins >= it.price}
                  disabled={!state}
                  onBuy={() => buy(it)}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <section
        className="mt-8 grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3"
        aria-labelledby="earn-title"
      >
        <div className="sm:col-span-1">
          <h2 id="earn-title" className="font-display text-lg font-bold uppercase">
            How to earn coins
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every third Neon Siege match is a <strong className="text-text">Cash Cup</strong> against Hard bots. Finish
            in the top 3 to win:
          </p>
        </div>
        <ol className="grid grid-cols-3 gap-3 sm:col-span-2">
          {[1, 2, 3].map((p) => (
            <li key={p} className="rounded-lg border border-border bg-surface-2 p-3 text-center">
              <p className="font-display text-2xl font-black">#{p}</p>
              <CoinAmount amount={CASH_CUP_PRIZES[p]} className="mt-1 justify-center text-lg" />
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted sm:col-span-3">
          Spend coins here or on the{" "}
          <Link href="/battle-pass" className="text-cyan underline underline-offset-2">
            Battle Pass
          </Link>{" "}
          (200 coins). Coins can&apos;t be bought with real money.
          {state && !state.signedIn && " Playing as a guest: your coins are saved on this device only."}
        </p>
      </section>
    </div>
  );
}

interface CardProps {
  it: ShopItem;
  owned: boolean;
  confirming: boolean;
  busy: boolean;
  canAfford: boolean;
  disabled: boolean;
  onBuy: () => void;
}

function BuyButton({ it, owned, confirming, busy, canAfford, disabled, onBuy, big }: CardProps & { big?: boolean }) {
  const name = itemName(it.kind, it.item);
  if (owned)
    return (
      <Link
        href="/locker"
        className={cn(
          "block rounded-md border border-success/50 bg-success/10 text-center font-semibold text-success",
          big ? "py-2.5" : "py-1.5 text-sm",
        )}
      >
        Owned · Equip
      </Link>
    );
  return (
    <button
      type="button"
      onClick={onBuy}
      disabled={disabled || busy || !canAfford}
      aria-label={confirming ? `Confirm: buy ${name} for ${it.price} coins` : `Buy ${name} for ${it.price} coins`}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 rounded-md font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
        big ? "py-2.5 text-base" : "py-1.5 text-sm",
        confirming ? "bg-[#ff7a1a] text-black" : "bg-[#f2c230] text-[#2a1d00] hover:brightness-110",
      )}
    >
      {busy ? (
        "Buying…"
      ) : confirming ? (
        "Tap again to confirm"
      ) : (
        <>
          <CoinIcon /> {it.price}
        </>
      )}
    </button>
  );
}

function ItemCard(props: CardProps) {
  const { it } = props;
  const rarity = rarityOf(it.kind, it.item);
  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-xl border-2 bg-surface"
      style={{ borderColor: rarityColor(rarity) }}
    >
      <div
        className="relative"
        style={{ background: `linear-gradient(180deg, ${rarityColor(rarity)}55, transparent)` }}
      >
        <RewardArt kind={it.kind} item={it.item} className="m-2 aspect-[4/3] bg-transparent" />
      </div>
      <div className="flex flex-1 flex-col gap-2 px-2.5 pb-2.5">
        <div>
          <h3 className="truncate text-sm font-bold">{itemName(it.kind, it.item)}</h3>
          <p className="flex items-center gap-1.5 text-[11px] text-muted capitalize">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: rarityColor(rarity) }} />
            {rarity} {it.kind}
          </p>
        </div>
        <div className="mt-auto">
          <BuyButton {...props} />
        </div>
      </div>
    </article>
  );
}

/** Big featured card; outfits get the live 3D turntable. */
function FeaturedCard(props: CardProps) {
  const { it } = props;
  const host = useRef<HTMLDivElement>(null);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const [noWebGL, setNoWebGL] = useState(it.kind !== "outfit");
  const rarity = rarityOf(it.kind, it.item);

  useEffect(() => {
    if (it.kind !== "outfit") return;
    let preview: Preview | null = null;
    let cancelled = false;
    import("@/games/neon-siege/three/preview")
      .then(({ createPreview }) => {
        if (cancelled || !host.current) return;
        preview = createPreview(host.current, { reduceMotion });
        preview.setOutfit(it.item);
      })
      .catch(() => !cancelled && setNoWebGL(true));
    return () => {
      cancelled = true;
      preview?.destroy();
    };
  }, [it.kind, it.item, reduceMotion]);

  return (
    <article
      className="relative flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border-2"
      style={{ borderColor: rarityColor(rarity) }}
    >
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 35%, ${rarityColor(rarity)}66, #111318 70%)` }}
      />
      <div ref={host} className="absolute inset-0" />
      {noWebGL && <RewardArt kind={it.kind} item={it.item} className="absolute inset-10 bg-transparent" />}
      <span className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#ffd23f]">
        Featured
      </span>
      <div className="relative mt-auto bg-gradient-to-t from-black/85 via-black/60 to-transparent p-4 pt-16 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: rarityColor(rarity) }}>
          {rarity} {it.kind}
        </p>
        <h2 className="font-display text-3xl font-black uppercase">{itemName(it.kind, it.item)}</h2>
        <div className="mt-3">
          <BuyButton {...props} big />
        </div>
      </div>
    </article>
  );
}
