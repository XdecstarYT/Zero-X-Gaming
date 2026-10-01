"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { getGame } from "@/lib/catalog";
import { SPORTS_PASS_PRICE } from "@/lib/economy";
import type { Broadcast, FeedFactory } from "@/games/live/broadcast";
import { card, CHANNELS, channelById, conditions, slotAt, title, type ChannelId } from "@/games/live/schedule";
import { useSportsPass } from "./use-sports-pass";

const FEEDS: Record<ChannelId, () => Promise<{ default: FeedFactory }>> = {
  footy: () => import("@/games/live/feed-footy"),
  derby: () => import("@/games/live/feed-derby"),
  tennis: () => import("@/games/live/feed-tennis"),
};

const subscribeSecond = (cb: () => void) => {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
};
/** The wall clock to the second (0 on the server, so nothing time-based renders until hydrated). */
function useNow() {
  return useSyncExternalStore(
    subscribeSecond,
    () => Math.floor(Date.now() / 1000) * 1000,
    () => 0,
  );
}

const noop = () => () => {};
/** Phones (coarse pointers) default to the lighter graphics. */
function useCoarse() {
  return useSyncExternalStore(
    noop,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Sports+ Live: three 24/7 channels of AI-versus-AI matches, in sync for
 * every viewer, free to watch. Pick a channel, watch the broadcast (with its
 * score bug, replays and crowd), follow the commentary, see what's on next.
 */
export function LiveSports({ initial = "footy", into }: { initial?: ChannelId; into?: number }) {
  const now = useNow();
  const [channelId, setChannelId] = useState<ChannelId>(initial);
  const [muted, setMuted] = useState(true);
  const coarse = useCoarse();
  const [picked, setQuality] = useState<"low" | "high" | null>(null);
  const quality = picked ?? (coarse ? "low" : "high");
  const [phase, setPhase] = useState<"loading" | "live" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [lines, setLines] = useState<{ id: number; text: string }[]>([]);
  const [status, setStatus] = useState("");
  const [over, setOver] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const live = useRef<Broadcast | null>(null);
  const pending = useRef<string[]>([]);
  const lineId = useRef(0);
  const pass = useSportsPass();
  // A fixed offset into the slot (tests and demos: ?into=seconds).
  const mountAt = useRef(0);

  const channel = channelById(channelId);
  const slotN = now ? slotAt(channel, now).n : -1;
  const slot = useMemo(() => (slotN >= 0 ? { ...slotAt(channel, slotN * channel.slotMin * 60_000) } : null), [channel, slotN]);
  const what = useMemo(() => (slot ? card(slot) : null), [slot]);

  useEffect(() => {
    mountAt.current = Date.now();
  }, []);

  // Run the broadcast for this channel's current slot.
  useEffect(() => {
    if (!slot || !what || !host.current) return;
    let cancelled = false;
    const el = host.current;
    setPhase("loading");
    setProgress(0);
    setOver(false);
    setLines([]);
    pending.current = [];
    void (async () => {
      try {
        const [{ default: make }, { Broadcast }] = await Promise.all([FEEDS[slot.channel.id](), import("@/games/live/broadcast")]);
        if (cancelled) return;
        const feed = make(el, what, slot, {
          detail: quality,
          coarse: window.matchMedia("(pointer: coarse)").matches,
          say: (t) => {
            pending.current.push(t);
            if (pending.current.length > 12) pending.current.shift();
          },
        });
        const base = mountAt.current || Date.now();
        const clockFn = into !== undefined ? () => slot.start + into * 1000 + (Date.now() - base) : Date.now;
        const b = new Broadcast(feed, slot, clockFn);
        live.current = b;
        await b.catchUp((k) => !cancelled && setProgress(k));
        if (cancelled) return;
        feed.setMuted(muted);
        b.start();
        setPhase("live");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      live.current?.stop();
      live.current = null;
      el.replaceChildren();
    };
    // `muted` is applied separately; restarting on it would rewind nothing but waste a catch-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, what, quality, into]);

  useEffect(() => {
    live.current?.feed.setMuted(muted);
  }, [muted]);

  // Commentary and the status line, a few times a second.
  useEffect(() => {
    const id = setInterval(() => {
      const b = live.current;
      if (pending.current.length) {
        const add = pending.current.splice(0).map((text) => ({ id: ++lineId.current, text }));
        setLines((l) => [...add.reverse(), ...l].slice(0, 30));
      }
      if (b) {
        setStatus(b.feed.status());
        setOver(b.feed.over());
      }
    }, 400);
    return () => clearInterval(id);
  }, []);

  const fullscreen = () => {
    const f = frame.current;
    if (!f) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void f.requestFullscreen?.().catch(() => undefined);
  };

  const game = getGame(channel.game);
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {/* Channels */}
      <div role="tablist" aria-label="Channels" className="mb-4 grid gap-2 sm:grid-cols-3">
        {CHANNELS.map((c) => {
          const s = now ? slotAt(c, now) : null;
          const on = c.id === channelId;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              data-testid={`channel-${c.id}`}
              onClick={() => setChannelId(c.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${on ? "border-cyan bg-surface-2" : "border-border bg-surface hover:border-border-strong"}`}
            >
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
                Live
                <span className="text-muted">· {c.sport}</span>
              </span>
              <span className="mt-1 block font-display text-lg font-bold uppercase tracking-wide">{c.name}</span>
              <span className="block truncate text-xs text-muted">{s ? `${title(card(s))} · ${Math.floor((now - s.start) / 60000)} min in` : " "}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div>
          {/* The broadcast */}
          <div ref={frame} className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black" data-testid="live-player">
            <div ref={host} className="absolute inset-0" />
            <div className="pointer-events-none absolute right-3 top-3 z-[7] flex items-center gap-2 rounded bg-black/70 px-2 py-1 text-[11px] font-black uppercase tracking-[0.2em]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
              Live · {channel.name}
            </div>
            {phase === "loading" && (
              <div className="absolute inset-0 z-[8] grid place-items-center bg-black/85 text-center" role="status">
                <div>
                  <p className="font-display text-xl font-bold uppercase tracking-wide">Joining the broadcast…</p>
                  <div className="mx-auto mt-3 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-cyan transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                </div>
              </div>
            )}
            {phase === "error" && (
              <div className="absolute inset-0 z-[8] grid place-items-center bg-black/85 p-4 text-center" role="alert">
                <p>3D graphics aren&apos;t available on this device (WebGL is off), so the broadcast can&apos;t play here.</p>
              </div>
            )}
            {over && slot && (
              <div className="absolute inset-x-0 bottom-0 z-[8] bg-gradient-to-t from-black/90 to-transparent p-4 text-center" data-testid="live-over">
                <p className="font-display text-lg font-bold uppercase">That&apos;s the result</p>
                <p className="text-sm text-muted">Next on {channel.name} in {mmss(Math.max(0, (slot.end - now) / 1000))}</p>
              </div>
            )}
            <div className="absolute bottom-3 left-3 z-[7] flex gap-2">
              <button type="button" onClick={() => setMuted((m) => !m)} className="rounded bg-black/70 px-2.5 py-1 text-xs font-bold uppercase hover:bg-black" aria-pressed={!muted}>
                {muted ? "Sound off" : "Sound on"}
              </button>
              <button type="button" onClick={() => setQuality(quality === "high" ? "low" : "high")} className="rounded bg-black/70 px-2.5 py-1 text-xs font-bold uppercase hover:bg-black">
                {quality === "high" ? "HD" : "SD"}
              </button>
              <button type="button" onClick={fullscreen} className="rounded bg-black/70 px-2.5 py-1 text-xs font-bold uppercase hover:bg-black">
                Full screen
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-bold uppercase tracking-wide">{what ? title(what) : channel.name}</h2>
              <p className="text-sm text-muted">{what ? conditions(what) : ""}</p>
            </div>
            <p className="font-mono text-sm tabular-nums" data-testid="live-status" aria-live="polite">
              {status}
            </p>
          </div>
        </div>

        {/* Commentary */}
        <aside aria-labelledby="calls-title" className="flex max-h-[28rem] flex-col rounded-xl border border-border bg-surface">
          <h2 id="calls-title" className="border-b border-border px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-magenta">
            Commentary
          </h2>
          <ol className="flex-1 space-y-2 overflow-y-auto p-3 text-sm" data-testid="live-commentary">
            {lines.length === 0 && <li className="text-muted">The commentary box is warming up…</li>}
            {lines.map((l) => (
              <li key={l.id} className="leading-snug">
                {l.text}
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {/* Play it yourself */}
      {game && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
          <div>
            <p className="font-display text-lg font-bold uppercase">Fancy a go?</p>
            <p className="text-sm text-muted">
              {pass.owned
                ? `${game.title} is in your Sports+ pass.`
                : `Watching is free. To play ${game.title} (and every Sports+ game), unlock Sports+ once for ${SPORTS_PASS_PRICE} coins.`}
            </p>
          </div>
          {pass.owned ? <LinkButton href={`/games/${game.slug}`}>Play {game.title.split(":")[0]}</LinkButton> : <LinkButton href="/sports#pass">Unlock Sports+</LinkButton>}
        </div>
      )}

      {/* Schedule */}
      <section aria-labelledby="next-title" className="mt-8">
        <h2 id="next-title" className="mb-3 font-display text-xl font-bold uppercase tracking-wide">
          Coming up
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {CHANNELS.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-surface p-3">
              <p className="font-display font-bold uppercase tracking-wide">{c.name}</p>
              <ul className="mt-2 space-y-2 text-sm">
                {now
                  ? [1, 2, 3].map((k) => {
                      const s = slotAt(c, now, k);
                      const w = card(s);
                      return (
                        <li key={s.n}>
                          <span className="font-mono text-xs text-muted">{clock(s.start)}</span> <span className="font-semibold">{title(w)}</span>
                          <span className="block text-xs text-muted">{conditions(w)}</span>
                        </li>
                      );
                    })
                  : null}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Every channel is a deterministic simulation on a shared clock: everyone watching sees the same match, live. Matches are AI against AI.{" "}
          <Link href="/sports" className="underline hover:text-cyan">
            Back to Sports+
          </Link>
        </p>
      </section>
    </div>
  );
}
