import { formatCompact } from "@/lib/format";

export function Rating({ value, count }: { value: number; count?: number }) {
  if (value <= 0) return <span className="text-xs text-muted">No ratings yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-warning" fill="currentColor" aria-hidden>
        <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />
      </svg>
      <span className="font-semibold text-text">{value.toFixed(1)}</span>
      <span className="sr-only">out of 5</span>
      {count !== undefined && <span>({formatCompact(count)} ratings)</span>}
    </span>
  );
}
