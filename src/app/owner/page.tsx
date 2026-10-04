import type { Metadata } from "next";
import { OwnerPanel } from "@/components/owner/OwnerPanel";

export const metadata: Metadata = { title: "Owner panel", robots: { index: false, follow: false } };

export default function OwnerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <OwnerPanel />
    </div>
  );
}
