"use client";

import { useToasts, type ToastTone } from "@/store/toast";
import { cn } from "@/lib/cn";

const toneBar: Record<ToastTone, string> = {
  info: "bg-cyan",
  success: "bg-success",
  error: "bg-danger",
};

/** Renders the toast queue. Mounted once in the root layout. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className="pointer-events-auto flex w-full max-w-sm animate-rise overflow-hidden rounded-lg border border-border-strong bg-surface-2 shadow-card"
        >
          <span className={cn("w-1 shrink-0", toneBar[t.tone])} aria-hidden />
          <div className="flex-1 px-4 py-3">
            <p className="text-sm font-semibold">{t.title}</p>
            {t.description && <p className="mt-0.5 text-sm text-muted">{t.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="px-3 text-muted hover:text-text"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
