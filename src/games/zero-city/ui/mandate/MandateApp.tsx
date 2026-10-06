/**
 * Mandate: the politics side app. A full-screen office over the city with its own sidebar,
 * header and pages: the briefing, the electoral map, the party, the chamber, the laws, the
 * cabinet, the polls, the campaign and the papers. The city keeps running underneath.
 */
import { formatClock, formatPlaytime, type StringKey } from "../../i18n";
import type { News } from "../../politics/mandate";
import { CHAMBER, DILEMMAS, MAJORITY, MINISTRIES, PARTY_COLOR, type PartyId } from "../../politics/politics";
import { APP_PAGES, type AppPage } from "../../store";
import { useGame, useT, useUI } from "../hooks";
import { Icon } from "../Icons";
import { Scandal } from "../politics";
import { CabinetPage, CampaignPage, ChamberPage, LawsPage, MapPage, PartyPage, PollsPage } from "./pages";
import { Card, Hemicycle, MandateDefs, PartyDot, PollLines, pct, Stat, useDistrictName, useMoney } from "./parts";

const ICON: Record<AppPage, string> = { home: "ballot", map: "land", party: "flag", chamber: "columns", laws: "scroll", cabinet: "briefcase", polls: "chart", campaign: "mega", news: "news" };

/** The app's own look: a dark statehouse with paper for the press. */
const STYLE = `
.md{--md-bg:#0b1120;--md-nav:#070c18;--md-card:#121a2c;--md-card2:#172138;--md-line:rgba(255,255,255,.09);--md-track:rgba(255,255,255,.08);--md-ink:#eef2fb;--md-muted:#93a0bb;--md-accent:#22e5ff;--md-good:#4ade80;--md-bad:#f87171;--md-map-bg:#0a0f1c;--md-map-road:#d4dbe7;color:var(--md-ink);background:radial-gradient(1200px 600px at 80% -10%,#16244a 0%,transparent 60%),var(--md-bg)}
.md-card{background:var(--md-card);border:1px solid var(--md-line);border-radius:16px;box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 10px 30px -18px rgba(0,0,0,.6)}
.md-label{font-size:.7em;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--md-muted)}
.md-h{font-weight:900;letter-spacing:.005em}
.md-chip{display:inline-flex;align-items:center;gap:.25em;border-radius:999px;padding:.12em .6em;font-size:.78em;font-weight:800;background:var(--md-track);color:var(--md-ink)}
.md-chip-on{background:var(--md-accent);color:#062a30}
.md-chip-bad{background:var(--md-bad);color:#2a0606}
.md-nav-btn{display:flex;align-items:center;gap:.75em;min-height:44px;border-radius:12px;padding:0 .8em;font-weight:800;color:var(--md-muted);transition:background .15s,color .15s}
.md-nav-btn:hover{background:rgba(255,255,255,.06);color:var(--md-ink)}
.md-nav-btn[aria-current=page]{background:var(--md-accent);color:#062a30}
.md-paper{--md-ink:#1b1a17;--md-muted:#5e5a50;--md-line:rgba(0,0,0,.14);background:#f3eee2;color:#1b1a17;border-radius:16px;font-family:Georgia,"Times New Roman",serif}
.md-paper .md-label{color:#5e5a50}
`;

export function MandateApp() {
  const g = useGame();
  const t = useT();
  const page = useUI((s) => s.app);
  const p = useUI((s) => s.politics);
  if (!page || !p) return null;
  return (
    <div className="md pointer-events-auto absolute inset-0 z-[25] flex flex-col overflow-hidden zc-in @3xl:flex-row" role="dialog" aria-modal="true" aria-label={t("md.app")} data-testid="md-app">
      <style>{STYLE}</style>
      <MandateDefs />
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-[var(--md-line)] bg-[var(--md-nav)] p-2 @max-3xl:order-last @max-3xl:border-t @3xl:w-[68px] @3xl:flex-col @3xl:items-center @3xl:border-e @3xl:p-2.5 @5xl:w-[212px] @5xl:items-stretch @5xl:p-3" aria-label={t("md.app")}>
        <div className="mb-3 hidden items-center gap-2 px-1 @3xl:flex" title="MANDATE">
          <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: PARTY_COLOR.civic, color: "#062a30" }}>
            <Icon name="ballot" size={20} />
          </span>
          <span className="md-h hidden text-[1.15em] tracking-[0.08em] @5xl:inline">MANDATE</span>
        </div>
        {APP_PAGES.map((id) => (
          <button key={id} type="button" title={t(`md.p.${id}` as StringKey)} className="md-nav-btn relative shrink-0 @3xl:w-11 @3xl:justify-center @3xl:px-0 @5xl:w-full @5xl:justify-start @5xl:px-[0.8em] @max-3xl:w-auto @max-3xl:flex-col @max-3xl:gap-0.5 @max-3xl:px-2 @max-3xl:py-1 @max-3xl:text-[0.68em]" aria-current={page === id ? "page" : undefined} onClick={() => g.openApp(id)} data-testid={`md-nav-${id}`}>
            <Icon name={ICON[id]} size={18} />
            <span className="@3xl:@max-5xl:sr-only">{t(`md.p.${id}` as StringKey)}</span>
            {id === "home" && p.dilemma && <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-[#f5b942]" aria-hidden />}
          </button>
        ))}
        <div className="mt-auto hidden px-1 pt-3 text-[0.75em] text-[var(--md-muted)] @5xl:block">{t("md.tagline")}</div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header />
        <main className="zc-scroll min-h-0 flex-1 p-3 @2xl:p-5" data-testid={`md-page-${page}`}>
          {page === "home" && <HomePage />}
          {page === "map" && <MapPage />}
          {page === "party" && <PartyPage />}
          {page === "chamber" && <ChamberPage />}
          {page === "laws" && <LawsPage />}
          {page === "cabinet" && <CabinetPage />}
          {page === "polls" && <PollsPage />}
          {page === "campaign" && <CampaignPage />}
          {page === "news" && <NewsPage />}
        </main>
      </div>
    </div>
  );
}

function Header() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = useUI((s) => s.politics)!;
  const page = useUI((s) => s.app)!;
  const lang = useUI((s) => s.lang);
  const minutes = useUI((s) => s.minutes);
  const speed = useUI((s) => s.speed);
  const day = Math.floor(minutes / 1440) + 1;
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-[var(--md-line)] px-3 py-2 @2xl:px-5">
      <div className="min-w-0 flex-1">
        <h1 className="md-h truncate text-[1.25em]">{t(`md.p.${page}` as StringKey)}</h1>
        <p className="truncate text-[0.78em] text-[var(--md-muted)] @max-md:hidden">
          {t("md.headerLine", { party: t("party.civic"), term: p.term, day })} · {formatClock(lang, minutes)} · {t("md.electionInShort", { t: formatPlaytime(lang, p.termLeft * 60) })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="md-chip" title={t("approval")} data-testid="md-approval">
          <Icon name="hall" size={14} />
          {Math.round(p.overall)}%
        </span>
        <span className="md-chip" title={t("md.funds")}>
          <Icon name="flag" size={14} />
          {money(p.m.funds)}
        </span>
        <span className="md-chip" title={t("treasury")} style={{ color: p.cash < 0 ? "var(--md-bad)" : undefined }}>
          <Icon name="money" size={14} />
          {money(p.cash)}
        </span>
        <span className="md-chip" title={t("capital")}>
          <Icon name="star" size={14} />
          {Math.round(p.parl.capital)}
        </span>
        <span className="flex items-center rounded-full bg-[var(--md-track)] p-0.5 @max-lg:hidden" role="group" aria-label={t("md.speed")}>
          {[0, 1, 2, 3].map((v) => (
            <button key={v} type="button" aria-pressed={speed === v} className={`grid h-8 min-w-8 place-items-center rounded-full px-2 text-[0.8em] font-black ${speed === v ? "bg-[var(--md-accent)] text-[#062a30]" : ""}`} onClick={() => g.setSpeed(v)} aria-label={v === 0 ? t("pause") : `${v}×`}>
              {v === 0 ? <Icon name="pause" size={13} /> : `${v}×`}
            </button>
          ))}
        </span>
        <button type="button" className="zc-btn min-h-[40px] px-3" onClick={() => g.openApp(null)} title={t("md.toCity")} data-testid="md-close">
          <Icon name="close" size={16} />
          <span className="@max-5xl:sr-only">{t("md.toCity")}</span>
        </button>
      </div>
    </header>
  );
}

// ----------------------------------------------------------------- briefing

function HomePage() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const p = useUI((s) => s.politics)!;
  const m = p.m;
  const pa = p.parl;
  const government: PartyId[] = ["civic", ...pa.coalition];
  const vacant = MINISTRIES.filter((k) => !pa.ministers[k]);
  const idle = m.roster.filter((x) => x.district < 0 && !x.minister && !x.mp);
  const todo: { key: string; text: string; page: AppPage; icon: string }[] = [];
  if (pa.draft) todo.push({ key: "bill", text: t("md.todoBill", { law: t(`pol.${pa.draft.law}` as StringKey) }), page: "chamber", icon: "vote" });
  if (pa.campaign.open) todo.push({ key: "camp", text: t("md.todoCampaign"), page: "campaign", icon: "mega" });
  if (vacant.length) todo.push({ key: "min", text: t("md.todoVacant", { n: vacant.length }), page: "cabinet", icon: "briefcase" });
  if (pa.gov < MAJORITY) todo.push({ key: "gov", text: t("md.todoMinority", { n: pa.gov, m: MAJORITY }), page: "chamber", icon: "columns" });
  if (idle.length && m.districts.length) todo.push({ key: "idle", text: t("md.todoIdle", { n: idle.length }), page: "map", icon: "pin" });
  if (!m.districts.length) todo.push({ key: "map", text: t("md.todoGrow"), page: "map", icon: "land" });
  if (m.conferenceReady) todo.push({ key: "conf", text: t("md.todoConference"), page: "party", icon: "flag" });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-3 @5xl:grid-cols-6">
        <Stat label={t("approval")} value={`${Math.round(p.overall)}%`} tone={p.overall < 45 ? "bad" : p.overall > 55 ? "good" : undefined} testId="md-kpi-approval" />
        <Stat label={t("md.pollShare")} value={pct(m.poll.civic)} sub={t("party.civic")} />
        <Stat label={t("md.government")} value={`${pa.gov}/${CHAMBER}`} sub={pa.gov >= MAJORITY ? t("md.majority") : t("md.minority")} tone={pa.gov >= MAJORITY ? "good" : "bad"} />
        <Stat label={t("md.funds")} value={money(m.funds)} sub={t("perDay", { n: `${m.fundsNet >= 0 ? "+" : ""}${money(m.fundsNet)}` })} tone={m.funds < 0 ? "bad" : undefined} />
        <Stat label={t("treasury")} value={money(p.cash)} sub={t("perDay", { n: `${p.net >= 0 ? "+" : ""}${money(p.net)}` })} tone={p.cash < 0 ? "bad" : undefined} />
        <Stat label={t("capital")} value={Math.round(pa.capital)} sub={t("md.capitalSub")} />
      </div>
      <div className="grid gap-4 @5xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Desk />
          <Scandal />
          <Card title={t("md.onYourDesk")} icon="ballot" testId="md-todo">
            {todo.length === 0 && <p className="text-[0.9em] text-[var(--md-muted)]">{t("md.allClear")}</p>}
            <ul className="flex flex-col gap-1.5">
              {todo.map((x) => (
                <li key={x.key}>
                  <button type="button" className="flex w-full items-center gap-3 rounded-[12px] border border-[var(--md-line)] p-2.5 text-start hover:bg-white/5" onClick={() => g.openApp(x.page)}>
                    <Icon name={x.icon} size={18} />
                    <span className="flex-1 font-semibold">{x.text}</span>
                    <span className="md-label">{t(`md.p.${x.page}` as StringKey)} →</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t("md.pollTrend")} icon="chart" action={<button type="button" className="md-label hover:underline" onClick={() => g.openApp("polls")}>{t("md.more")} →</button>}>
            <PollLines polls={m.polls} />
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card title={t("md.chamber")} icon="columns" action={<button type="button" className="md-label hover:underline" onClick={() => g.openApp("chamber")}>{t("md.more")} →</button>}>
            <Hemicycle mps={m.mps} platform={m.platform} government={government} votes={m.votes} rebels={m.rebels} />
          </Card>
          <Card title={t("md.headlines")} icon="news" action={<button type="button" className="md-label hover:underline" onClick={() => g.openApp("news")}>{t("md.more")} →</button>}>
            <ul className="flex flex-col gap-2">
              {m.news.slice(0, 5).map((n, i) => (
                <li key={i} className="flex gap-2 text-[0.9em]">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: n.tone === 1 ? "var(--md-good)" : n.tone === -1 ? "var(--md-bad)" : "var(--md-muted)" }} aria-hidden />
                  <Headline n={n} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** The dilemma on the desk, answered right here. */
function Desk() {
  const g = useGame();
  const t = useT();
  const money = useMoney();
  const id = useUI((s) => s.politics?.dilemma);
  if (!id) return null;
  return (
    <Card title={t("decision")} icon="mega" testId="md-dilemma">
      <h3 className="md-h text-[1.2em]">{t(`d.${id}.t` as StringKey)}</h3>
      <p className="text-[0.92em] text-[var(--md-muted)]">{t(`d.${id}.b` as StringKey)}</p>
      <div className="grid gap-2 @2xl:grid-cols-2">
        {(["a", "b"] as const).map((k) => {
          const c = DILEMMAS[id][k].cash ?? 0;
          return (
            <button key={k} type="button" className={`zc-btn justify-between ${k === "a" ? "zc-on" : ""}`} onClick={() => g.decide(k)} data-testid={`md-dilemma-${k}`}>
              <span>{t(`d.${id}.${k === "a" ? "a" : "n"}` as StringKey)}</span>
              {c !== 0 && <span className="text-[0.85em] tabular-nums opacity-80">{c > 0 ? `+${money(c)}` : money(c)}</span>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------- news

/** A headline (or, with `body`, its story), with the law, party and department names translated. */
function Headline({ n, body = false }: { n: News; body?: boolean }) {
  const t = useT();
  const dname = useDistrictName();
  const v: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(n.v ?? {})) {
    if (k === "law") v[k] = t(`pol.${x}` as StringKey);
    else if (k === "party") v[k] = t(`party.${x}` as StringKey);
    else if (k === "ministry") v[k] = t(`min.${x}` as StringKey);
    else if (k === "district") v[k] = dname(Number(x));
    else v[k] = x;
  }
  return <span>{t((body ? `${n.k}.b` : n.k) as StringKey, v)}</span>;
}

function NewsPage() {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const city = useUI((s) => s.cityName);
  const p = useUI((s) => s.politics)!;
  const news = p.m.news;
  const minutes = useUI((s) => s.minutes);
  const [lead, ...rest] = news;
  const stamp = (m: number) => `${t("md.dayN", { n: Math.floor(m / 1440) + 1 })} · ${formatClock(lang, m % 1440)}`;
  return (
    <article className="md-paper mx-auto flex max-w-5xl flex-col gap-4 p-5 @2xl:p-8" data-testid="md-news">
      <header className="border-b-4 border-double border-[#1b1a17] pb-3 text-center">
        <p className="md-label">{t("md.dayN", { n: Math.floor(minutes / 1440) + 1 })}</p>
        <h2 className="text-[2.2em] font-black leading-none tracking-tight @2xl:text-[3em]">{t("md.paperName", { city })}</h2>
        <p className="mt-1 text-[0.85em] italic">{t("md.paperMotto")}</p>
      </header>
      {lead ? (
        <section className="border-b border-[rgba(0,0,0,.2)] pb-4">
          <p className="md-label">{stamp(lead.m)}</p>
          <h3 className="mt-1 text-[1.7em] font-black leading-tight">
            <Headline n={lead} />
          </h3>
          <p className="mt-2 text-[1.02em] leading-relaxed">
            <Headline n={lead} body />
          </p>
        </section>
      ) : (
        <p className="italic">{t("md.noNews")}</p>
      )}
      <div className="grid gap-x-6 gap-y-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {rest.map((n, i) => (
          <section key={i} className="border-b border-[rgba(0,0,0,.14)] pb-2">
            <p className="md-label flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: n.tone === 1 ? "#15803d" : n.tone === -1 ? "#b91c1c" : "#5e5a50" }} aria-hidden />
              {stamp(n.m)}
            </p>
            <h4 className="mt-0.5 text-[1.08em] font-bold leading-snug">
              <Headline n={n} />
            </h4>
          </section>
        ))}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-[rgba(0,0,0,.2)] pt-3 text-[0.85em]">
        <span className="md-label">{t("md.chamberToday")}</span>
        {(["civic", "labour", "enterprise", "green", "heritage"] as const).map((x) => (
          <span key={x} className="flex items-center gap-1">
            <PartyDot party={x} size={10} />
            {t(`party.${x}` as StringKey)} {p.parl.seats[x]}
          </span>
        ))}
      </footer>
    </article>
  );
}

/** The HUD button that opens the app (Mayor mode). */
export function MandateButton() {
  const g = useGame();
  const t = useT();
  const mode = useUI((s) => s.mode);
  const app = useUI((s) => s.app);
  if (mode !== "mayor") return null;
  return (
    <button type="button" aria-pressed={!!app} className="zc-glass-dark zc-btn rounded-full px-4 font-black" onClick={() => g.openApp(app ? null : "home")} aria-label={t("md.open")} title={t("md.open")} data-testid="md-open">
      <Icon name="ballot" size={18} />
      <span className="hidden @5xl:inline">MANDATE</span>
    </button>
  );
}
