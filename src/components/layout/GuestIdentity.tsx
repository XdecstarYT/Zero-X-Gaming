"use client";

import { useAuth } from "@/store/auth";
import { accountTag } from "@/lib/zxg-account";
import { XPBar } from "@/components/ui/XPBar";
import { Avatar, useSignOut } from "./AccountControl";
import { SignInButton } from "./SignInButton";
import { Button } from "@/components/ui/Button";

/**
 * Profile header when there's no online account: a device ZXG account (saved in
 * this browser) or a guest with the option to create one.
 */
export function GuestIdentity({ guestName }: { guestName: string }) {
  const { status, profile } = useAuth();
  const signOut = useSignOut();
  const device = status === "device" && profile;
  const name = device ? profile.username : guestName;
  return (
    <>
      <Avatar name={name} className="h-20 w-20 shrink-0 text-3xl" />
      <div className="flex-1">
        <h1 id="profile-name" className="font-display text-2xl font-black uppercase tracking-wide">
          {name}
        </h1>
        {device && (
          <p className="font-mono text-xs font-semibold tracking-wider text-cyan" data-testid="account-tag">
            {accountTag(profile.id)}
          </p>
        )}
        <p className="text-sm text-muted">
          {device
            ? "Your ZXG account is saved on this device, with its own progress, ZX Cash and Locker."
            : "Playing as a guest. Progress is saved on this device only."}
        </p>
        <XPBar xp={device ? profile.xp : 0} className="mt-4 max-w-md" />
      </div>
      {device ? (
        <Button variant="secondary" className="self-start sm:self-center" onClick={signOut}>
          Sign out
        </Button>
      ) : (
        <SignInButton variant="accent" className="self-start sm:self-center" initialMode="sign_up">
          Create ZXG account
        </SignInButton>
      )}
    </>
  );
}
