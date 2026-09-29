"use client";

import { useAuth } from "@/store/auth";
import { XPBar } from "@/components/ui/XPBar";
import { Skeleton } from "@/components/ui/Skeleton";

export function YourProgress() {
  const { status, profile, streak } = useAuth();
  if (status === "loading" || (status === "signed_in" && !profile)) {
    return (
      <div aria-hidden>
        <Skeleton className="mb-2 h-3 w-32" />
        <Skeleton className="h-2.5 w-full" />
      </div>
    );
  }
  const signedIn = status === "signed_in" && profile;
  return (
    <div>
      <p className="mb-2 flex justify-between text-xs uppercase tracking-wider text-muted">
        <span>{signedIn ? `${profile.username}'s progress` : "Your progress (guest)"}</span>
        {signedIn && streak > 0 && <span className="text-warning">🔥 {streak}-day streak</span>}
      </p>
      <XPBar xp={signedIn ? profile.xp : 0} />
    </div>
  );
}
