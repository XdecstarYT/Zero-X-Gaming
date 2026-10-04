"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useIsOwner } from "@/lib/owner";
import { paletteItems, searchPalette } from "@/lib/palette";

/** Search every game and page: the button in the bar, or Ctrl/⌘+K anywhere. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const owner = useIsOwner();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search the site (Ctrl+K)"
        title="Search (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
        data-testid="palette-open"
        className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      {open && <Palette owner={owner} onClose={() => setOpen(false)} />}
    </>
  );
}

function Palette({ owner, onClose }: { owner: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const items = useMemo(() => paletteItems(owner), [owner]);
  const results = useMemo(() => searchPalette(items, q).slice(0, 12), [items, q]);
  const listRef = useRef<HTMLUListElement>(null);
  const active = Math.min(sel, Math.max(0, results.length - 1));

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        data-testid="palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border-strong bg-surface shadow-card"
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((active + 1) % Math.max(1, results.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((active - 1 + results.length) % Math.max(1, results.length));
            } else if (e.key === "Enter" && results[active]) go(results[active].href);
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[active] ? `pal-${results[active].id}` : undefined}
          aria-label="Search the site"
          placeholder="Search games and pages…"
          className="w-full border-b border-border bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-subtle"
        />
        <ul id="palette-list" ref={listRef} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{q}”.</li>}
          {results.map((it, i) => (
            <li
              key={it.id}
              id={`pal-${it.id}`}
              data-i={i}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setSel(i)}
              onClick={() => go(it.href)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2", i === active ? "bg-cyan/15" : "")}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-2 text-sm" aria-hidden>
                {it.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{it.label}</span>
                <span className="block truncate text-xs text-muted">{it.hint}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-border px-4 py-2 text-[11px] text-subtle">↑↓ to move · Enter to open · Esc to close</p>
      </div>
    </div>
  );
}
