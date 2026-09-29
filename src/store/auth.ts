import { create } from "zustand";
import type { Tables } from "@/lib/supabase/database.types";

export type AuthStatus = "loading" | "guest" | "signed_in" | "disabled";

export type Profile = Pick<Tables<"profiles">, "id" | "username" | "avatar_url" | "xp">;

export interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  streak: number;
  set: (patch: Partial<Omit<AuthState, "set">>) => void;
}

export const useAuth = create<AuthState>()((set) => ({
  status: "loading",
  userId: null,
  email: null,
  profile: null,
  streak: 0,
  set: (patch) => set(patch),
}));
