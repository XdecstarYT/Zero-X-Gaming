/**
 * Places where nothing pops up over the page (ads, the intro splash, notices):
 * game invite links, so friends land straight in the lobby, and full-screen
 * apps with their own intro (Cash Cup).
 */
export const QUIET_PATHS = ["/cash-cup"];

export function quietHere(loc: { pathname: string; search: string } = window.location) {
  return /[?&](room|lobby)=/.test(loc.search) || QUIET_PATHS.some((p) => loc.pathname === p || loc.pathname.startsWith(`${p}/`));
}
