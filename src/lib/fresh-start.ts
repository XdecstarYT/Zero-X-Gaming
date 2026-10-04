/**
 * The ZX Cash fresh start. Coins became ZX Cash and every player starts again
 * from zero: on the server a migration wiped balances, memberships, passes and
 * progress; on each device this runs once, before the page draws, and clears
 * the guest saves the same way. Accounts, settings, graphics choices and
 * favourites stay. Bump the epoch to run another wipe in future.
 */

export const FRESH_START_EPOCH = "2026-10-zx-cash";
export const FRESH_START_KEY = "zx-fresh-start";
/** Set once the player has seen the "coins are now ZX Cash" notice (this epoch). */
export const FRESH_SEEN_KEY = "zx-fresh-seen";

/** Saved keys that survive (settings, sign-ins and preferences, never progress). */
const KEEP_EXACT = ["zx-settings", "zx-device-accounts", "zx-device-session", "zx-guest-name", "zx-intro-seen", "zx-mega-ad-seen", "zx-library", "zx-sports-follow", "zx-trenches-front", "zx-trenches-mode", FRESH_START_KEY];
const KEEP_SUFFIX = ["-prefs", "-gfx", "-ad-count", "-ad-session"];

/** Does this storage key survive the wipe? (Per-account saves carry a ":<id>" suffix.) */
export function keepKey(key: string) {
  if (!key.startsWith("zx-")) return true;
  const base = key.split(":")[0];
  return KEEP_EXACT.includes(base) || KEEP_SUFFIX.some((s) => base.endsWith(s));
}

/** The keys to remove from a store, given all its keys. */
export const wipeList = (keys: string[]) => keys.filter((k) => !keepKey(k));

/** Inline, before first paint: wipe once per device per epoch. */
export const freshStartScript = `try{var L=localStorage;if(L.getItem(${JSON.stringify(FRESH_START_KEY)})!==${JSON.stringify(FRESH_START_EPOCH)}){var E=${JSON.stringify(KEEP_EXACT)},S=${JSON.stringify(KEEP_SUFFIX)};var n=0,keep=function(k){if(k.indexOf("zx-")!==0)return true;var b=k.split(":")[0];return E.indexOf(b)>=0||S.some(function(s){return b.slice(-s.length)===s})};[L,sessionStorage].forEach(function(st){var ks=[];for(var i=0;i<st.length;i++)ks.push(st.key(i));ks.forEach(function(k){if(!keep(k)){st.removeItem(k);n++}})});L.setItem(${JSON.stringify(FRESH_START_KEY)},${JSON.stringify(FRESH_START_EPOCH)});if(n)document.documentElement.dataset.fresh="1"}}catch(e){}`;
