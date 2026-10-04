"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useIsOwner } from "@/lib/owner";

/** The crown in the bar: only the site owner's account sees it. */
export function OwnerLink() {
  const owner = useIsOwner();
  const pathname = usePathname();
  if (!owner) return null;
  const active = pathname === "/owner";
  return (
    <Link
      href="/owner"
      aria-label="Owner panel"
      aria-current={active ? "page" : undefined}
      data-testid="owner-link"
      className={cn(
        "grid h-10 w-10 place-items-center rounded-md text-lg hover:bg-surface-2",
        active ? "bg-surface-2" : "",
      )}
    >
      <span aria-hidden>👑</span>
    </Link>
  );
}
