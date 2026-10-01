"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import { MEDALS, readWarRecord, type WarRecord as Record } from "@/lib/war-record";
import { FRONTS, FRONT_IDS } from "@/games/trenches/fronts";

/** Trenches career: totals, battles per front, and the medals (earned or in progress). */
export function WarRecord() {
  const status = useAuth((s) => s.status);
  const [r, setR] = useState<Record | null>(null);
  useEffect(() => {
    if (status === "loading") return;
    // Read after hydration (the record lives in this browser's storage).
    let live = true;
    void Promise.resolve().then(() => live && setR(readWarRecord()));
    return () => {
      live = false;
    };
  }, [status]);
  if (!r) return null;

  const kd = r.deaths ? (r.kills / r.deaths).toFixed(2) : String(r.kills);
  const stats: [string, string][] = [
    ["Battles", String(r.battles)],
    ["Victories", String(r.wins)],
    ["Kills", String(r.kills)],
    ["K/D", kd],
    ["Flags taken", String(r.captures)],
    ["Trench dug", `${r.digs} m`],
    ["Grenade kills", String(r.grenadeKills)],
    ["Best streak", String(r.bestStreak)],
  ];
  const earned = MEDALS.filter((m) => m.earned(r)).length;

  return (
    <section aria-labelledby="war-title" className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="war-title" className="font-display text-xl font-bold uppercase">
          War record
        </h2>
        <p className="text-sm text-muted">
          Trenches · {earned}/{MEDALS.length} medals
        </p>
      </div>
      {r.battles === 0 && (
        <p className="mb-4 text-sm text-muted">No battles yet. Play Trenches to start your war record and earn medals.</p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-surface-2 p-3">
            <dt className="text-xs uppercase tracking-wider text-muted">{k}</dt>
            <dd className="mt-1 font-display text-xl font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs uppercase tracking-wider text-muted">Battles per front</p>
      <ul className="mt-2 flex flex-wrap gap-2 text-sm">
        {FRONT_IDS.map((id) => (
          <li key={id} className="rounded-full border border-border bg-surface-2 px-3 py-1">
            {FRONTS[id].name}: <strong>{r.fronts[id] ?? 0}</strong>
            {r.frontsWon.includes(id) && <span className="ml-1 text-success" aria-label="won">✓</span>}
          </li>
        ))}
      </ul>
      <h3 className="mt-6 mb-3 font-display text-sm font-bold uppercase tracking-wider">Medals</h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Medals">
        {MEDALS.map((m) => {
          const got = m.earned(r);
          const pct = Math.round(m.progress(r) * 100);
          return (
            <li
              key={m.id}
              className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center ${got ? "border-[#c9a24a]/60 bg-[#c9a24a]/10" : "border-border bg-surface-2"}`}
            >
              <span
                aria-hidden
                className="h-3 w-10 rounded-sm"
                style={{
                  background: `linear-gradient(90deg, ${m.ribbon[0]} 0 33%, ${m.ribbon[1]} 33% 66%, ${m.ribbon[2]} 66%)`,
                  filter: got ? undefined : "grayscale(1)",
                }}
              />
              <span
                aria-hidden
                className={`grid h-9 w-9 place-items-center rounded-full border-2 font-display text-sm font-black ${got ? "border-[#8a6a2a] bg-gradient-to-br from-[#f3d98a] to-[#a67c2a] text-[#3a2a08]" : "border-border bg-surface text-subtle"}`}
              >
                {got ? "★" : "?"}
              </span>
              <span className="text-sm font-semibold">{m.name}</span>
              <span className="text-[11px] text-muted">{m.description}</span>
              <span className="text-[11px] font-semibold text-muted">{got ? "Awarded" : `${pct}%`}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
