"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div>
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-sm text-muted">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
          checked ? "border-cyan bg-cyan/30" : "border-border-strong bg-surface-3",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-[left,background-color] duration-200 ease-zx",
            checked ? "left-6 bg-cyan shadow-[0_0_10px_var(--zx-cyan)]" : "left-1 bg-muted",
          )}
        />
      </button>
    </div>
  );
}
