"use client";

import { useState } from "react";
import { useSettings, type KeyAction, type Theme } from "@/store/settings";
import { toast } from "@/store/toast";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatKeyCode } from "@/lib/keys";

const ACTION_LABELS: Record<KeyAction, string> = {
  jump: "Jump / confirm",
  pause: "Pause",
  left: "Move left",
  right: "Move right",
};

export function SettingsPanel() {
  const s = useSettings();
  const [listening, setListening] = useState<KeyAction | null>(null);

  return (
    <div className="space-y-8">
      <ThemePicker value={s.theme} onChange={s.setTheme} />

      <section aria-labelledby="audio-title" className="rounded-lg border border-border bg-surface px-5">
        <h2
          id="audio-title"
          className="border-b border-border py-4 font-display text-sm font-bold uppercase tracking-wider"
        >
          Audio
        </h2>
        <div className="divide-y divide-border">
          <Toggle label="Sound effects" checked={s.sound} onChange={s.setSound} />
          <Toggle label="Music" checked={s.music} onChange={s.setMusic} />
          <div className="flex items-center justify-between gap-6 py-4">
            <label htmlFor="volume" className="font-semibold">
              Volume
            </label>
            <input
              id="volume"
              type="range"
              min={0}
              max={100}
              value={Math.round(s.volume * 100)}
              onChange={(e) => s.setVolume(Number(e.target.value) / 100)}
              disabled={!s.sound && !s.music}
              className="w-40 accent-[var(--zx-cyan)] disabled:opacity-40"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="display-title" className="rounded-lg border border-border bg-surface px-5">
        <h2
          id="display-title"
          className="border-b border-border py-4 font-display text-sm font-bold uppercase tracking-wider"
        >
          Display
        </h2>
        <Toggle
          label="Reduce motion"
          description="Turns off glow pulses, transitions, and screen shake. Your system setting is always respected."
          checked={s.reduceMotion}
          onChange={s.setReduceMotion}
        />
      </section>

      <section aria-labelledby="keys-title" className="rounded-lg border border-border bg-surface px-5 pb-5">
        <div className="flex items-center justify-between border-b border-border py-4">
          <h2 id="keys-title" className="font-display text-sm font-bold uppercase tracking-wider">
            Key bindings
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              s.resetKeybindings();
              toast("Key bindings reset", { tone: "success", durationMs: 2500 });
            }}
          >
            Reset
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {(Object.keys(ACTION_LABELS) as KeyAction[]).map((action) => {
            const isListening = listening === action;
            return (
              <li key={action} className="flex items-center justify-between gap-6 py-3">
                <span id={`kb-${action}`} className="font-semibold">
                  {ACTION_LABELS[action]}
                </span>
                <button
                  type="button"
                  aria-describedby={`kb-${action}`}
                  aria-label={
                    isListening
                      ? `Press a key for ${ACTION_LABELS[action]}, Escape to cancel`
                      : `Change key for ${ACTION_LABELS[action]}, currently ${formatKeyCode(s.keybindings[action])}`
                  }
                  onClick={() => setListening(isListening ? null : action)}
                  onBlur={() => isListening && setListening(null)}
                  onKeyDown={(e) => {
                    if (!isListening) return;
                    e.preventDefault();
                    if (e.code !== "Escape") s.setKeybinding(action, e.code);
                    setListening(null);
                  }}
                  className={cn(
                    "min-w-24 rounded-md border px-3 py-1.5 font-mono text-sm",
                    isListening
                      ? "animate-pulse-glow border-magenta text-magenta"
                      : "border-border-strong bg-surface-2 hover:border-cyan",
                  )}
                >
                  {isListening ? "Press a key…" : formatKeyCode(s.keybindings[action])}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

const THEME_OPTIONS: {
  id: Theme;
  name: string;
  blurb: string;
  preview: { bg: string; card: string; text: string; a: string; b: string; font: string };
}[] = [
  {
    id: "classic",
    name: "Classic",
    blurb: "The original Zero X look: dark, neon and arcade.",
    preview: {
      bg: "#05060b",
      card: "#131729",
      text: "#eef1ff",
      a: "#22e5ff",
      b: "#ff2bd6",
      font: "var(--font-orbitron)",
    },
  },
  {
    id: "x1",
    name: "X-1+",
    blurb: "Modern, light and friendly, with softer shapes and brighter colours.",
    preview: {
      bg: "#f5f7ff",
      card: "#ffffff",
      text: "#1c2342",
      a: "#2f5bea",
      b: "#d9366f",
      font: "var(--font-nunito)",
    },
  },
];

function ThemePicker({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  return (
    <section aria-labelledby="theme-title" className="rounded-lg border border-border bg-surface p-5">
      <h2 id="theme-title" className="font-display text-sm font-bold uppercase tracking-wider">
        Theme
      </h2>
      <div role="group" aria-labelledby="theme-title" className="mt-4 grid gap-3 sm:grid-cols-2">
        {THEME_OPTIONS.map((t) => {
          const on = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(t.id)}
              className={cn(
                "flex flex-col gap-3 rounded-lg border-2 p-3 text-left transition",
                on ? "border-cyan shadow-glow-cyan" : "border-border hover:border-border-strong",
              )}
            >
              <span
                aria-hidden
                className="block overflow-hidden rounded-md border border-black/10 p-2"
                style={{ background: t.preview.bg }}
              >
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.preview.a }} />
                  <span
                    className="text-[11px] font-black"
                    style={{ color: t.preview.text, fontFamily: t.preview.font }}
                  >
                    ZERO X
                  </span>
                </span>
                <span className="mt-2 flex gap-1.5">
                  {[t.preview.a, t.preview.b, t.preview.a].map((c, i) => (
                    <span
                      key={i}
                      className="block h-10 flex-1 rounded"
                      style={{ background: t.preview.card, borderTop: `3px solid ${c}` }}
                    />
                  ))}
                </span>
              </span>
              <span>
                <span className="block font-semibold">
                  {t.name}
                  {on && <span className="ml-2 text-xs font-bold text-cyan">Active</span>}
                </span>
                <span className="block text-sm text-muted">{t.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
