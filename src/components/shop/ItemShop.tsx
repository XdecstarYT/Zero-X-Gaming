"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Preview } from "@/games/neon-siege/three/preview";
import { RewardArt, itemName, rarityColor, rarityOf } from "@/components/season/RewardArt";
import { useSeason } from "@/components/season/use-season";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { CASH_CUP_PRIZES, currentDrop, DROPS, type ShopItem } from "@/lib/economy";
import { BANNERS, COIN_TIERS } from "@/lib/season";
import { buyShopItem, saveLoadout } from "@/lib/season-client";
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

const keyOf = (it: ShopItem) => `${it.kind}:${it.item}`;

export function ItemShop() {
  const { state, setState } = useSeason();
  const now = useNow();
  // Before hydration (no clock yet) render the first drop; the live one takes over on mount.
  const drop = now ? currentDrop(now) : DROPS[0];
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inspect, setInspect] = useState<ShopItem | null>(null);
  const [celebrate, setCelebrate] = useState<ShopItem | null>(null);
  const coins = state?.coins ?? 0;

  async function buy(it: ShopItem) {
    const key = keyOf(it);
    if (confirming !== key) return setConfirming(key);
    setBusy(key);
    try {
      const r = await buyShopItem(it.kind, it.item);
      if (state) setState({ ...state, coins: r.coins, owned: new Set([...state.owned, it.item]) });
      setInspect(null);
      setCelebrate(it);
    } catch (e) {
      toast("Couldn't buy that", { description: (e as Error).message, tone: "error" });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  async function equip(it: ShopItem) {
    if (!state) return;
    const next = { ...state.loadout, [it.kind]: it.item };
    setState({ ...state, loadout: next });
    try {
      await saveLoadout(next);
      toast(`${itemName(it.kind, it.item)} equipped`, { tone: "success" });
    } catch {
      toast("Couldn't save your loadout", { tone: "error" });
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
  const cardProps = (it: ShopItem) => ({
    it,
    owned: !!state?.owned.has(it.item),
    confirming: confirming === keyOf(it),
    busy: busy === keyOf(it),
    canAfford: coins >= it.price,
    disabled: !state,
    onBuy: () => buy(it),
    onInspect: () => {
      setConfirming(null);
      setInspect(it);
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Hero */}
      <section className="zx-stripes relative overflow-hidden rounded-2xl border border-[#ff7a1a]/40 p-5 text-white sm:p-8">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 400px at 85% 0%, rgba(255,122,26,.4), transparent 60%), linear-gradient(90deg, rgba(10,11,13,.85), rgba(10,11,13,.35))",
          }}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ffb06b]">Item Shop · Season 1</p>
            <h1
              className="mt-1 font-display text-5xl font-black uppercase italic tracking-tight sm:text-7xl"
              data-testid="drop-name"
            >
              <span className="bg-gradient-to-r from-[#ff7a1a] via-[#ffd23f] to-[#ff7a1a] bg-clip-text text-transparent">
                {drop.name}
              </span>
            </h1>
            <p className="mt-2 max-w-lg text-sm text-white/85">{drop.tagline}</p>
            <p className="mt-1 text-xs text-white/70">{drop.items.length} items · tap any item to inspect it in 3D</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/90" aria-live="off">
              Leaves in {now ? countdown(Date.parse(drop.endsAt) - now) : "…"}
            </p>
            <p className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm">
              Your balance <CoinAmount amount={coins} className="text-[#f2c230]" />
            </p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <FeaturedCard {...cardProps(featured)} />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={`${drop.name} items`}>
          {rest.map((it) => (
            <li key={keyOf(it)}>
              <ItemCard {...cardProps(it)} />
            </li>
          ))}
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
          The Battle Pass free lane also pays{" "}
          <strong className="text-text">{Object.values(COIN_TIERS).reduce((a, b) => a + b, 0)} coins</strong> across the
          season (every 5 tiers). Spend coins here or on the{" "}
          <Link href="/battle-pass" className="text-cyan underline underline-offset-2">
            Battle Pass
          </Link>{" "}
          (200 coins). Coins can&apos;t be bought with real money.
          {state && !state.signedIn && " Playing as a guest: your coins are saved on this device only."}
        </p>
      </section>

      {inspect && (
        <InspectDialog
          {...cardProps(inspect)}
          onClose={() => {
            setInspect(null);
            setConfirming(null);
          }}
        />
      )}
      {celebrate && (
        <Celebration
          it={celebrate}
          onEquip={() => {
            void equip(celebrate);
            setCelebrate(null);
          }}
          onClose={() => setCelebrate(null)}
        />
      )}
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
  onInspect: () => void;
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
  const { it, onInspect, owned } = props;
  const rarity = rarityOf(it.kind, it.item);
  const color = rarityColor(rarity);
  return (
    <article
      className="zx-shine flex h-full flex-col overflow-hidden rounded-xl border-2 bg-surface transition-transform duration-200 hover:-translate-y-0.5"
      style={{ borderColor: color, boxShadow: `0 10px 30px -18px ${color}` }}
    >
      <button
        type="button"
        onClick={onInspect}
        aria-label={`Inspect ${itemName(it.kind, it.item)}`}
        className="relative block text-left"
        style={{ background: `radial-gradient(circle at 50% 30%, ${color}66, transparent 70%)` }}
      >
        <RewardArt kind={it.kind} item={it.item} className="m-2 aspect-[4/3] bg-transparent" />
        {owned && (
          <span className="absolute top-2 left-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold text-[#7dffb0]">
            ✓ OWNED
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-2 px-2.5 pb-2.5">
        <div>
          <h3 className="truncate text-sm font-bold">{itemName(it.kind, it.item)}</h3>
          <p className="flex items-center gap-1.5 text-[11px] text-muted capitalize">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />
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

/** A live 3D turntable of an outfit (or of the rifle wearing a wrap), or a big banner. */
function ItemStage({ it, className }: { it: ShopItem; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const [noWebGL, setNoWebGL] = useState(it.kind === "banner");

  useEffect(() => {
    if (it.kind === "banner") return;
    let preview: Preview | null = null;
    let cancelled = false;
    import("@/games/neon-siege/three/preview")
      .then(({ createPreview }) => {
        if (cancelled || !host.current) return;
        preview = createPreview(host.current, { reduceMotion });
        if (it.kind === "outfit") preview.setOutfit(it.item);
        else preview.setWrap(it.item);
      })
      .catch(() => !cancelled && setNoWebGL(true));
    return () => {
      cancelled = true;
      preview?.destroy();
    };
  }, [it.kind, it.item, reduceMotion]);

  if (it.kind === "banner")
    return <div aria-hidden className={cn("rounded-xl", className)} style={{ background: BANNERS[it.item]?.art }} />;
  return (
    <div className={className ?? "relative"}>
      <div ref={host} className="absolute inset-0" />
      {noWebGL && <RewardArt kind={it.kind} item={it.item} className="absolute inset-6 bg-transparent" />}
    </div>
  );
}

function FeaturedCard(props: CardProps) {
  const { it, onInspect } = props;
  const rarity = rarityOf(it.kind, it.item);
  const color = rarityColor(rarity);
  return (
    <article
      className="relative flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border-2"
      style={{ borderColor: color, boxShadow: `0 20px 60px -25px ${color}` }}
    >
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 35%, ${color}66, #111318 70%)` }}
      />
      <ItemStage it={it} className="absolute inset-0" />
      <span className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#ffd23f]">
        Featured
      </span>
      <button
        type="button"
        onClick={onInspect}
        className="absolute top-3 right-3 rounded-full bg-black/70 px-3 py-1 text-[11px] font-bold text-white hover:bg-black/90"
      >
        Inspect
      </button>
      <div className="relative mt-auto bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-16 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>
          {rarity} {it.kind}
        </p>
        <h2 className="font-display text-3xl font-black uppercase">{itemName(it.kind, it.item)}</h2>
        <p className="mt-1 text-sm text-white/80">{it.blurb}</p>
        <div className="mt-3">
          <BuyButton {...props} big />
        </div>
      </div>
    </article>
  );
}

function InspectDialog(props: CardProps & { onClose: () => void }) {
  const { it, onClose, owned, canAfford } = props;
  const rarity = rarityOf(it.kind, it.item);
  const color = rarityColor(rarity);
  return (
    <Modal open onClose={onClose} title={itemName(it.kind, it.item)} className="w-[min(94vw,52rem)]">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div
          className="relative aspect-square overflow-hidden rounded-xl"
          style={{ background: `radial-gradient(circle at 50% 35%, ${color}66, #111318 72%)` }}
        >
          <ItemStage it={it} className="absolute inset-0" />
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80">
            Drag to rotate
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold capitalize">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {rarity} {it.kind}
          </p>
          <p className="text-muted">{it.blurb}</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-surface-2 p-2">
              <dt className="text-xs text-muted">Price</dt>
              <dd>
                <CoinAmount amount={it.price} />
              </dd>
            </div>
            <div className="rounded-md bg-surface-2 p-2">
              <dt className="text-xs text-muted">Drop</dt>
              <dd className="font-semibold">DROP 1</dd>
            </div>
          </dl>
          {!owned && !canAfford && (
            <p className="text-xs text-muted">
              You need a few more coins. Win a Cash Cup (every third match) or climb the Battle Pass free lane.
            </p>
          )}
          <div className="mt-auto">
            <BuyButton {...props} big />
          </div>
        </div>
      </div>
    </Modal>
  );
}

const CONFETTI = ["#ffb321", "#ff4d6d", "#22e5ff", "#7dffb0", "#b25cff", "#ffffff"];

/** Full-screen "UNLOCKED!" moment after a purchase, in the item's rarity colour. */
function Celebration({ it, onEquip, onClose }: { it: ShopItem; onEquip: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const color = rarityColor(rarityOf(it.kind, it.item));
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="unlocked-title"
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-white backdrop:bg-black/85"
      style={{ "--zx-burst": color } as React.CSSProperties}
    >
      <div className="relative grid h-full place-items-center">
        <div
          aria-hidden
          className="zx-rays absolute top-1/2 left-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-40"
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 36 }, (_, i) => (
            <span
              key={i}
              className="zx-confetti"
              style={
                {
                  left: `${(i * 37) % 100}%`,
                  background: CONFETTI[i % CONFETTI.length],
                  "--zx-fall": `${2.2 + ((i * 13) % 10) / 6}s`,
                  "--zx-delay": `${-((i * 7) % 20) / 8}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <div className="zx-pop relative flex flex-col items-center gap-4 px-6 text-center">
          <p className="font-display text-xs font-black tracking-[0.5em]" style={{ color }}>
            NEW ITEM
          </p>
          <h2 id="unlocked-title" className="font-display text-4xl font-black uppercase italic sm:text-6xl">
            Unlocked!
          </h2>
          <div
            className="aspect-square w-[min(60vw,18rem)] rounded-2xl border-2"
            style={{
              borderColor: color,
              background: `radial-gradient(circle at 50% 35%, ${color}88, #111318 75%)`,
              boxShadow: `0 0 80px -10px ${color}`,
            }}
          >
            <RewardArt kind={it.kind} item={it.item} className="h-full w-full bg-transparent" />
          </div>
          <p className="text-lg font-bold">{itemName(it.kind, it.item)}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              autoFocus
              onClick={onEquip}
              className="rounded-md bg-[#f2c230] px-6 py-2.5 font-bold text-[#2a1d00] hover:brightness-110"
            >
              Equip now
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/40 px-6 py-2.5 font-bold hover:bg-white/10"
            >
              Keep shopping
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
