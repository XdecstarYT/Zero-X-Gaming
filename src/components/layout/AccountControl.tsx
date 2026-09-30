"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/auth";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { levelFromXp } from "@/lib/xp";
import { SignInButton } from "./SignInButton";
import { signOutDeviceAccount } from "@/lib/device-accounts";
import { refreshDeviceAuth } from "./AuthProvider";

export function Avatar({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote OAuth avatars, tiny
    <img src={url} alt="" className={cn("rounded-full object-cover", className)} referrerPolicy="no-referrer" />
  ) : (
    <span
      aria-hidden
      className={cn(
        "grid place-items-center rounded-full bg-gradient-to-br from-cyan to-magenta font-display font-black text-bg",
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function useSignOut() {
  const router = useRouter();
  return async () => {
    if (useAuth.getState().status === "device") {
      signOutDeviceAccount();
      refreshDeviceAuth();
    } else await getSupabaseBrowser()?.auth.signOut();
    toast("Signed out");
    router.refresh();
  };
}

/** Navbar account area: skeleton → sign-in button (guest) → user chip (signed in). */
export function AccountControl({ variant = "bar" }: { variant?: "bar" | "menu" | "compact" }) {
  const { status, profile } = useAuth();
  const signOut = useSignOut();

  if (status === "loading")
    return (
      <Skeleton
        className={variant === "menu" ? "h-10 w-full" : variant === "compact" ? "h-9 w-9 rounded-full" : "h-8 w-24"}
      />
    );

  if (status !== "signed_in" && status !== "device") {
    return (
      <SignInButton size={variant === "menu" ? "md" : "sm"} className={variant === "menu" ? "w-full" : "whitespace-nowrap"}>
        Sign in
      </SignInButton>
    );
  }

  const name = profile?.username ?? "Player";
  const { level } = levelFromXp(profile?.xp ?? 0);

  if (variant === "compact") {
    return (
      <Link href="/profile" aria-label={`Your profile: ${name}, level ${level}`} className="block rounded-full">
        <Avatar name={name} url={profile?.avatar_url} className="h-9 w-9 text-sm" />
      </Link>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", variant === "menu" && "w-full justify-between")}>
      <Link
        href="/profile"
        className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 hover:border-cyan"
        aria-label={`Your profile: ${name}, level ${level}`}
      >
        <Avatar name={name} url={profile?.avatar_url} className="h-7 w-7 text-xs" />
        <span className="max-w-28 truncate text-sm font-semibold">{name}</span>
        <span className="font-display text-[10px] font-bold text-cyan">L{level}</span>
      </Link>
      <Button variant="ghost" size="sm" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
