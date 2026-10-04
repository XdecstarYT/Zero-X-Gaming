"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { getSupabaseBrowser } from "./supabase/client";
import { useAuth } from "@/store/auth";

/**
 * The owner panel's calls. Every one is checked by the database (only the
 * site owner's account gets through); the client checks only decide what to
 * show.
 */

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

function rpc(): Rpc | null {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const untyped = sb as unknown as { rpc: Rpc };
  return (fn, args) => untyped.rpc(fn, args);
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const r = rpc();
  if (!r) throw new Error("The site isn't connected to the online service.");
  const { data, error } = await r(fn, args);
  if (error) throw new Error(error.message === "owner only" ? "Only the site owner can do that." : error.message);
  return data as T;
}

export interface Announcement {
  text: string;
  tone: "info" | "success" | "warning" | "event";
  href?: string | null;
  id: number;
}

export interface SiteSettings {
  announcement?: Announcement | null;
  maintenance?: { games: string[] } | null;
}

export interface Dashboard {
  players: { total: number; new24h: number; new7d: number; active7d: number; hidden: number };
  plays: { total: number; day: number; week: number; daily: { day: string; plays: number }[] };
  games: { slug: string; title: string; status: string; plays: number; week: number; best: number | null }[];
  economy: { coins: number; wallets: number; passHolders: number; season: string | null; unlocks: Record<string, number>; spent7d: number; earned7d: number };
  top: { username: string; xp: number; hidden: boolean; joined: string }[];
  recent: { username: string; xp: number; hidden: boolean; joined: string }[];
  reports: { id: number; target: string; reason: string; details: string | null; at: string; by: string | null }[];
  town: { citizens: number; treasury: number; servers: { id: string; name: string; locked: boolean }[] };
  settings: SiteSettings;
}

export const ownerDashboard = () => call<Dashboard>("owner_dashboard");
export const setSetting = (key: "announcement" | "maintenance", value: unknown) => call<void>("owner_set_setting", { p_key: key, p_value: value });
export const grantCoins = (username: string, amount: number) => call<{ coins: number }>("owner_grant_coins", { p_username: username, p_amount: amount });
export const setHidden = (username: string, hidden: boolean) => call<void>("owner_set_hidden", { p_username: username, p_hidden: hidden });
export const resolveReport = (id: number, status: "actioned" | "dismissed") => call<void>("owner_resolve_report", { p_id: id, p_status: status });
export const setServerLock = (id: string, locked: boolean) => call<void>("town_set_server", { p_id: id, p_locked: locked });

/** Are you the site owner? Asked of the database once per sign-in. */
export const useOwnerStore = create<{ owner: boolean; checked: string | null; set: (owner: boolean, key: string) => void }>()((set) => ({
  owner: false,
  checked: null,
  set: (owner, key) => set({ owner, checked: key }),
}));

export function useIsOwner() {
  const status = useAuth((s) => s.status);
  const userId = useAuth((s) => s.userId);
  const { owner, checked, set } = useOwnerStore();
  const key = status === "signed_in" && userId ? userId : "none";
  useEffect(() => {
    if (checked === key) return;
    if (key === "none") {
      set(false, key);
      return;
    }
    let live = true;
    call<boolean>("is_owner").then(
      (yes) => live && set(!!yes, key),
      () => live && set(false, key),
    );
    return () => {
      live = false;
    };
  }, [key, checked, set]);
  return key !== "none" && checked === key && owner;
}

// ------------------------------------------------------------ site settings

/** The public site settings (the banner, games down for maintenance), loaded once per page load. */
export const useSiteSettings = create<{ settings: SiteSettings; loaded: boolean; load: () => Promise<void> }>()((set) => ({
  settings: {},
  loaded: false,
  load: async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return set({ loaded: true });
    try {
      const { data } = await (sb as unknown as { from: (t: string) => { select: (c: string) => PromiseLike<{ data: { key: string; value: unknown }[] | null }> } }).from("site_settings").select("key,value");
      const out: SiteSettings = {};
      for (const row of data ?? []) if (row.value) (out as Record<string, unknown>)[row.key] = row.value;
      set({ settings: out, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));

export function useSettingsLoaded() {
  const s = useSiteSettings();
  const load = s.load;
  useEffect(() => {
    if (!useSiteSettings.getState().loaded) void load();
  }, [load]);
  return s.settings;
}
