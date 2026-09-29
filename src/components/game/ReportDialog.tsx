"use client";

import { useId, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/store/toast";

export const REPORT_REASONS = [
  { id: "offensive_name", label: "Offensive or inappropriate username" },
  { id: "cheating", label: "Cheating or impossible score" },
  { id: "harassment", label: "Harassment" },
  { id: "other", label: "Something else" },
] as const;

type Reason = (typeof REPORT_REASONS)[number]["id"];

/** Report a player to moderators (reports table, reviewed in the Supabase dashboard). */
export function ReportDialog({
  target,
  onClose,
}: {
  target: { userId: string; username: string } | null;
  onClose: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState<Reason>("offensive_name");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase || !target) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("report_content", {
      p_target_type: "profile",
      p_target_id: target.userId,
      p_reason: reason,
      p_details: details.trim() || undefined,
    });
    setBusy(false);
    if (error) {
      setError(
        error.message === "too many reports"
          ? "You've sent a lot of reports today. Try again tomorrow."
          : "Couldn't send the report. Please try again.",
      );
      return;
    }
    toast("Report sent", { tone: "success", description: "Thanks. A moderator will take a look." });
    setDetails("");
    onClose();
  }

  return (
    <Modal open={target !== null} onClose={onClose} title={`Report ${target?.username ?? "player"}`}>
      <form onSubmit={onSubmit} className="grid gap-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">What&apos;s wrong?</legend>
          <div className="grid gap-2">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-cyan"
              >
                <input
                  type="radio"
                  name={`${id}-reason`}
                  value={r.id}
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                  className="accent-[var(--zx-cyan)]"
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${id}-details`} className="mb-1 block text-sm font-semibold">
            Details <span className="font-normal text-subtle">(optional)</span>
          </label>
          <textarea
            id={`${id}-details`}
            value={details}
            maxLength={500}
            rows={3}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full rounded-md border border-border bg-bg p-3 text-sm focus:border-cyan focus:outline-none"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Sending…" : "Send report"}
        </Button>
      </form>
    </Modal>
  );
}
