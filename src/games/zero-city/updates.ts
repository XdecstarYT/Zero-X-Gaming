import type { StringKey } from "./i18n";

/** The in-game update log, newest first. Add an entry (and its strings) for each release. */
export const UPDATE_LOG: { v: string; date: string; title: StringKey; body: StringKey }[] = [
  { v: "1.1", date: "2026-10-29", title: "log.11.title", body: "log.11.body" },
  { v: "1.0", date: "2026-10-28", title: "log.10.title", body: "log.10.body" },
  { v: "0.9", date: "2026-10-27", title: "log.09.title", body: "log.09.body" },
  { v: "0.8", date: "2026-10-26", title: "log.08.title", body: "log.08.body" },
  { v: "0.7", date: "2026-10-25", title: "log.07.title", body: "log.07.body" },
  { v: "0.6", date: "2026-10-24", title: "log.06.title", body: "log.06.body" },
  { v: "0.5", date: "2026-10-24", title: "log.05.title", body: "log.05.body" },
];
