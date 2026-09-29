"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Phase 1 placeholder: explains guest play. Real email / Google / Discord
 * auth replaces the body in Phase 2 (Supabase Auth).
 */
export function SignInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Join Zero X">
      <p className="text-sm text-muted">
        Accounts are coming soon. Sign in with email, Google, or Discord to save scores, earn XP, and climb the
        leaderboards.
      </p>
      <div className="mt-5 grid gap-2">
        <Button variant="secondary" disabled className="w-full">
          Continue with Google
        </Button>
        <Button variant="secondary" disabled className="w-full">
          Continue with Discord
        </Button>
        <Button variant="secondary" disabled className="w-full">
          Continue with email
        </Button>
      </div>
      <p className="mt-5 text-center text-xs text-subtle">Until then, you can play as a guest.</p>
      <Button onClick={onClose} className="mt-3 w-full">
        Play as guest
      </Button>
    </Modal>
  );
}
