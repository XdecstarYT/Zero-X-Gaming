// NEXT_PUBLIC_* values are inlined at build time, so they must be referenced literally.
// The defaults are the live project's public values: the URL and the publishable key ship to every browser by
// design (row-level security protects the data), so the site connects wherever it's built. Env vars override them.
const DEFAULT_URL = "https://tbvaqinnbicxhlaqltik.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_ZFde2o_aok2RndgLDaWihQ_RIRQy5VI";

/** Set NEXT_PUBLIC_SUPABASE_URL=off to build in guest-only mode (tests, forks without a backend). */
const off = process.env.NEXT_PUBLIC_SUPABASE_URL === "off";
export const SUPABASE_URL = off ? "" : process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
export const SUPABASE_PUBLISHABLE_KEY = off ? "" : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY;

/** When false the app runs in guest-only mode (no auth, local storage only). */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
