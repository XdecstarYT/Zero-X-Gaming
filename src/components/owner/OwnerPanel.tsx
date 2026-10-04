"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { GAMES } from "@/lib/catalog";
import {
  grantCoins,
  ownerDashboard,
  resolveReport,
  setHidden,
  setServerLock,
  setSetting,
  useIsOwner,
  useOwnerStore,
  useSiteSettings,
  type Announcement,
  type Dashboard,
} from "@/lib/owner";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/toast";

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-US");

function Tile({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4" data-testid={testId}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-black tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Card({ title, children, testId, className }: { title: string; children: React.ReactNode; testId?: string; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-surface p-4 sm:p-5", className)} data-testid={testId} aria-label={title}>
      <h2 className="mb-3 font-display text-sm font-black uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  );
}

/** Plays per day for the last two weeks: one series, so one colour and no legend; hover any bar for its number. */
function PlaysChart({ days }: { days: { day: string; plays: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.plays));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="relative flex h-36 items-end gap-[2px] border-b border-border" role="img" aria-label="Plays per day, last 14 days">
        {days.map((d, i) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="w-full rounded-t-[4px] bg-cyan/80 transition-colors group-hover:bg-cyan" style={{ height: `${d.plays ? Math.max(3, (d.plays / max) * 100) : 0}%` }} />
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-bg px-2 py-1 text-xs shadow-card">
                <span className="text-muted">{new Date(d.day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span> · <b>{n(d.plays)}</b> plays
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{days[0] ? new Date(days[0].day).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>Plays per day</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th>{d.day}</th>
              <td>{d.plays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The owner panel: only the site owner's account sees it (the page and every
 * action are checked by the database). Numbers for the whole site, the banner,
 * maintenance, coins, players, reports and Hometown's servers.
 */
export function OwnerPanel() {
  const owner = useIsOwner();
  const status = useAuth((s) => s.status);
  const userId = useAuth((s) => s.userId);
  const checked = useOwnerStore((s) => s.checked);
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reloadSettings = useSiteSettings((s) => s.load);

  const load = useCallback(async () => {
    try {
      setD(await ownerDashboard());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!owner) return;
    const t = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [owner, load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, { tone: "success" });
      await load();
      await reloadSettings();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading" || (status === "signed_in" && userId && checked !== userId)) {
    return <p className="py-20 text-center text-muted">Checking…</p>;
  }
  if (!owner) {
    return (
      <div className="py-20 text-center" data-testid="owner-denied">
        <p className="font-display text-2xl font-black uppercase">Not available</p>
        <p className="mt-2 text-muted">This page is only for the site owner.</p>
        <Link href="/" className="mt-4 inline-block text-cyan underline">
          Back home
        </Link>
      </div>
    );
  }
  if (!d) return <p className="py-20 text-center text-muted">{err ?? "Loading the numbers…"}</p>;

  const unlock = (id: string) => d.economy.unlocks[id] ?? 0;
  return (
    <div className="space-y-6" data-testid="owner-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">👑 Site owner</p>
          <h1 className="font-display text-3xl font-black uppercase tracking-tight sm:text-4xl">Owner panel</h1>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={busy}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Players" value={n(d.players.total)} sub={`+${n(d.players.new24h)} today · +${n(d.players.new7d)} this week`} testId="owner-players" />
        <Tile label="Active this week" value={n(d.players.active7d)} sub={`${n(d.players.hidden)} hidden from boards`} />
        <Tile label="Plays" value={n(d.plays.total)} sub={`${n(d.plays.day)} today · ${n(d.plays.week)} this week`} />
        <Tile label="Coins out there" value={n(d.economy.coins)} sub={`${n(d.economy.wallets)} wallets · +${n(d.economy.earned7d)} / −${n(d.economy.spent7d)} this week`} />
        <Tile label="Battle pass" value={n(d.economy.passHolders)} sub={`holders this season (${d.economy.season ?? "—"})`} />
        <Tile label="Sports+" value={n(unlock("sports-plus"))} sub="passes sold" />
        <Tile label="UBusiness" value={n(unlock("ubusiness-lite") + unlock("ubusiness-ultimate"))} sub={`${n(unlock("ubusiness-lite"))} Lite · ${n(unlock("ubusiness-ultimate"))} Ultimate`} />
        <Tile label="Hometown" value={n(d.town.citizens)} sub={`citizens · treasury $${n(d.town.treasury)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Plays per day · last 14 days">
          <PlaysChart days={d.plays.daily} />
        </Card>
        <AnnouncementEditor current={d.settings.announcement ?? null} busy={busy} onSave={(v) => run(() => setSetting("announcement", v), v ? "Announcement published" : "Announcement cleared")} />
      </div>

      <Card title="Games" testId="owner-games">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-1.5">Game</th>
                <th className="py-1.5 text-right">Plays</th>
                <th className="py-1.5 text-right">This week</th>
                <th className="py-1.5 text-right">Best score</th>
                <th className="py-1.5 text-right">Maintenance</th>
              </tr>
            </thead>
            <tbody>
              {d.games
                .filter((g) => GAMES.some((c) => c.slug === g.slug))
                .map((g) => {
                  const down = d.settings.maintenance?.games.includes(g.slug) ?? false;
                  return (
                    <tr key={g.slug} className="border-t border-border">
                      <td className="py-1.5">
                        <Link href={`/games/${g.slug}`} className="font-semibold hover:text-cyan">
                          {g.title}
                        </Link>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{n(g.plays)}</td>
                      <td className="py-1.5 text-right tabular-nums">{n(g.week)}</td>
                      <td className="py-1.5 text-right tabular-nums">{g.best == null ? "—" : n(g.best)}</td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          data-testid={`owner-maint-${g.slug}`}
                          onClick={() => {
                            const list = new Set(d.settings.maintenance?.games ?? []);
                            if (down) list.delete(g.slug);
                            else list.add(g.slug);
                            void run(() => setSetting("maintenance", { games: [...list] }), down ? `${g.title} is back up` : `${g.title} is down for maintenance`);
                          }}
                          className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold", down ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-border text-muted hover:text-text")}
                        >
                          {down ? "🔧 Down" : "Live"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <CoinsForm busy={busy} onGrant={(u, amt) => run(() => grantCoins(u, amt), `${amt > 0 ? "Gave" : "Took"} ${Math.abs(amt)} coins ${amt > 0 ? "to" : "from"} ${u}`)} />
        <Card title="Hometown servers">
          <ul className="space-y-2">
            {d.town.servers.map((sv) => (
              <li key={sv.id} className="flex items-center justify-between rounded-lg bg-bg px-3 py-2 text-sm">
                <span>
                  {sv.locked ? "🔒" : "🟢"} {sv.name}
                </span>
                {sv.id !== "main" && (
                  <button type="button" disabled={busy} className="rounded-md border border-border px-2.5 py-1 text-xs font-bold hover:border-cyan" onClick={() => void run(() => setServerLock(sv.id, !sv.locked), `${sv.name} ${sv.locked ? "unlocked" : "locked"}`)}>
                    {sv.locked ? "Unlock" : "Lock"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {(["top", "recent"] as const).map((k) => (
          <Card key={k} title={k === "top" ? "Top players (XP)" : "Newest players"}>
            <ul className="divide-y divide-border text-sm">
              {d[k].map((p) => (
                <li key={p.username} className="flex items-center gap-2 py-1.5">
                  <span className={cn("flex-1 truncate font-semibold", p.hidden && "text-muted line-through")}>{p.username}</span>
                  <span className="text-xs tabular-nums text-muted">{n(p.xp)} XP</span>
                  <span className="hidden text-xs text-muted sm:inline">{new Date(p.joined).toLocaleDateString()}</span>
                  <button type="button" disabled={busy} className="rounded-md border border-border px-2 py-0.5 text-xs hover:border-cyan" onClick={() => void run(() => setHidden(p.username, !p.hidden), p.hidden ? `${p.username} is back on the boards` : `${p.username} hidden from the boards`)}>
                    {p.hidden ? "Unhide" : "Hide"}
                  </button>
                </li>
              ))}
              {!d[k].length && <li className="py-2 text-muted">No players yet.</li>}
            </ul>
          </Card>
        ))}
      </div>

      <Card title={`Reports · ${d.reports.length} open`} testId="owner-reports">
        {d.reports.length ? (
          <ul className="space-y-2">
            {d.reports.map((r) => (
              <li key={r.id} className="rounded-lg bg-bg p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{r.target}</b> · {r.reason.replace("_", " ")} <span className="text-muted">· by {r.by ?? "?"} · {new Date(r.at).toLocaleString()}</span>
                  </span>
                  <span className="flex gap-2">
                    <button type="button" disabled={busy} className="rounded-md border border-red-400/50 px-2 py-0.5 text-xs text-red-200" onClick={() => void run(async () => (await setHidden(r.target, true), await resolveReport(r.id, "actioned")), `${r.target} hidden; report closed`)}>
                      Hide player
                    </button>
                    <button type="button" disabled={busy} className="rounded-md border border-border px-2 py-0.5 text-xs" onClick={() => void run(() => resolveReport(r.id, "dismissed"), "Report dismissed")}>
                      Dismiss
                    </button>
                  </span>
                </div>
                {r.details && <p className="mt-1 text-muted">{r.details}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing to review. 🎉</p>
        )}
      </Card>
    </div>
  );
}

function AnnouncementEditor({ current, busy, onSave }: { current: Announcement | null; busy: boolean; onSave: (v: unknown) => void }) {
  const [text, setText] = useState(current?.text ?? "");
  const [tone, setTone] = useState<Announcement["tone"]>(current?.tone ?? "info");
  const [href, setHref] = useState(current?.href ?? "");
  return (
    <Card title="Site announcement" testId="owner-announcement">
      <p className="mb-2 text-xs text-muted">A banner across the top of every page. Players can dismiss it; a new one shows again.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={200} rows={2} placeholder="Double XP all weekend!" className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" data-testid="owner-ann-text" />
      <div className="mt-2 flex flex-wrap gap-2">
        <select value={tone} onChange={(e) => setTone(e.target.value as Announcement["tone"])} className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm">
          <option value="info">Info</option>
          <option value="event">Event</option>
          <option value="success">Good news</option>
          <option value="warning">Warning</option>
        </select>
        <input value={href} onChange={(e) => setHref(e.target.value)} placeholder="Link, e.g. /battle-pass (optional)" className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm" />
      </div>
      <div className="mt-3 flex gap-2">
        <Button disabled={busy || text.trim().length < 2} onClick={() => onSave({ text, tone, ...(href.trim() ? { href: href.trim() } : {}) })} data-testid="owner-ann-publish">
          Publish
        </Button>
        {current && (
          <Button variant="secondary" disabled={busy} onClick={() => onSave(null)}>
            Clear
          </Button>
        )}
      </div>
    </Card>
  );
}

function CoinsForm({ busy, onGrant }: { busy: boolean; onGrant: (username: string, amount: number) => void }) {
  const [user, setUser] = useState("");
  const [amount, setAmount] = useState(50);
  return (
    <Card title="Coins">
      <p className="mb-2 text-xs text-muted">Give a player coins (or take some back with a minus number). Logged in their coin history.</p>
      <div className="flex flex-wrap gap-2">
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Username" className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm" />
        <input type="number" value={amount} onChange={(e) => setAmount(Math.round(Number(e.target.value)))} className="w-28 rounded-md border border-border bg-bg px-3 py-1.5 text-sm tabular-nums" />
        <Button disabled={busy || !user.trim() || !amount} onClick={() => onGrant(user.trim(), amount)}>
          {amount < 0 ? "Take" : "Give"}
        </Button>
      </div>
    </Card>
  );
}
