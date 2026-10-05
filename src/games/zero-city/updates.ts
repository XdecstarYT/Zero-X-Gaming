import type { StringKey } from "./i18n";

/** The in-game update log, newest first. Add an entry (and its strings) for each release. */
export const UPDATE_LOG: { v: string; date: string; title: StringKey; body: StringKey }[] = [{ v: "0.5", date: "2026-10-24", title: "log.05.title", body: "log.05.body" }];
