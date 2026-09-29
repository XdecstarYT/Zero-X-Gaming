import type { Metadata } from "next";
import { SettingsPanel } from "@/components/SettingsPanel";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight">Settings</h1>
      <p className="mt-2 text-muted">Saved on this device.</p>
      <div className="mt-8">
        <SettingsPanel />
      </div>
    </div>
  );
}
