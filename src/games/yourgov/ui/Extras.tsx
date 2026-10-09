/**
 * Getting around: the command palette (search every panel and action), the inbox (everything
 * waiting on you), photo mode, and the pages that open over the game: the update notes, help
 * and the glossary, career stats, and save slots with export and import.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EVENTS } from "../data";
import { SLOTS, type Game, type UIState } from "../game";
import * as C from "../campaign";
import * as St from "../studio";
import * as G from "../sim";
import { Icon } from "./icons";
import { Group, money, Row } from "./kit";
import { featureCount, GLOSSARY, SHORTCUTS, updateNotes } from "./notes";

interface Command {
  icon: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** Every panel, page and common action, for the palette. */
function commands(g: Game, tabs: { id: string; icon: string; label: string }[]): Command[] {
  const s = g.s!;
  const go = (p: Partial<UIState>) => () => g.setUI({ palette: false, ...p });
  const out: Command[] = [
    {
      icon: "⏭️",
      label: "End the week",
      hint: "Enter",
      run: () => {
        g.setUI({ palette: false });
        g.endTurn();
      },
    },
    {
      icon: "⏩",
      label: "Skip ahead",
      hint: "F",
      run: () => {
        g.setUI({ palette: false });
        g.fastForward();
      },
    },
    { icon: "📥", label: "Inbox", hint: "I", run: go({ inbox: true }) },
    { icon: "📷", label: "Photo mode", hint: "H", run: go({ photo: true, tab: null }) },
    { icon: "🆕", label: "Update notes", run: go({ extra: "notes" }) },
    { icon: "❓", label: "Help and glossary", hint: "?", run: go({ extra: "help" }) },
    { icon: "📈", label: "Career stats", run: go({ extra: "stats" }) },
    { icon: "💾", label: "Save slots, export and import", run: go({ extra: "slots" }) },
    { icon: "⚙️", label: "Settings", run: go({ tab: "settings" }) },
    { icon: "📰", label: "This week's front page", run: go({ paper: true }) },
  ];
  for (const t of tabs) out.push({ icon: "▫️", label: t.label, hint: "Panel", run: go({ tab: t.id as UIState["tab"], bill: null, law: null }) });
  const pages: [string, Partial<UIState>][] = [
    ["Policies: write and announce", { tab: "studio", studioPage: "policies" }],
    ["Executive orders of your own", { tab: "studio", studioPage: "orders" }],
    ["Design an event", { tab: "studio", studioPage: "events" }],
    ["Write a crisis", { tab: "studio", studioPage: "crises" }],
    ["Rebrand the party", { tab: "studio", studioPage: "party" }],
    ["Your leader's profile", { tab: "studio", studioPage: "leader" }],
    ["Speech writer", { tab: "studio", studioPage: "speech" }],
    ["Rename the country, offices and regions", { tab: "studio", studioPage: "names" }],
    ["National holidays", { tab: "studio", studioPage: "holidays" }],
    ["Society", { tab: "world", worldPage: "society" }],
    ["Industry and trade", { tab: "world", worldPage: "economy" }],
    ["Treaties, aid and sanctions", { tab: "world", worldPage: "world" }],
    ["Protests", { tab: "world", worldPage: "protests" }],
    ["Ground game: strategy, fees, bus tours", { tab: "hq", hq: "ground" }],
    ["Battlegrounds and targets", { tab: "hq", hq: "targets" }],
    ["Shadow cabinet and opposition days", { tab: "hq", hq: "shadow" }],
    ["Campaign staff", { tab: "hq", hq: "staff" }],
    ["Manifesto", { tab: "hq", hq: "manifesto" }],
    ["Social media", { tab: "hq", hq: "social" }],
    ["Markets", { tab: "country", country: "markets" }],
    ["Draft a law of your own", { studio: { id: null } }],
    ["The events diary", { tab: "events", evKind: "diary" }],
  ];
  for (const [label, p] of pages) out.push({ icon: "📄", label, hint: "Page", run: go(p) });
  for (const m of ["politics", "support", "states", "margin", "second", "targets", "terrain"] as const) out.push({ icon: "🗺️", label: `Map: ${m}`, hint: "Map", run: go({ mapMode: m, view: "map" }) });
  for (const e of [...EVENTS, ...s.studio.events]) out.push({ icon: e.icon, label: `Hold: ${e.name}`, hint: "Event", run: go({ tab: "events", evKind: e.kind, event: e.id, evWeek: null }) });
  for (const l of G.allLaws(s)) out.push({ icon: "📜", label: `Law: ${l.name}`, hint: l.options[s.laws[l.id] ?? l.start]?.label, run: go({ tab: "write", law: l.id }) });
  return out;
}

export function CommandPalette({ g, tabs }: { g: Game; tabs: { id: string; icon: string; label: string }[] }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => commands(g, tabs), [g, tabs]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = (words.length ? all.filter((c) => words.every((w) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(w))) : all).slice(0, 40);
  useEffect(() => input.current?.focus(), []);
  return (
    <div className="yg-modal-back top" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && g.setUI({ palette: false })} data-testid="yg-palette">
      <section className="yg-glass yg-modal small yg-palette" role="dialog" aria-modal="true" aria-label="Search everything">
        <div className="yg-palette-head">
          <Icon name="target" size={18} />
          <input
            ref={input}
            className="yg-input"
            value={q}
            placeholder="Search panels, events, laws, actions…"
            onChange={(e) => {
              setQ(e.target.value);
              setAt(0);
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
              e.preventDefault();
              if (e.key === "ArrowDown") setAt(Math.min(list.length - 1, at + 1));
              else if (e.key === "ArrowUp") setAt(Math.max(0, at - 1));
              else list[at]?.run();
            }}
            aria-label="Search everything"
            data-testid="yg-palette-input"
          />
          <button type="button" className="yg-btn icon small" aria-label="Close" onClick={() => g.setUI({ palette: false })}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="yg-modal-body yg-palette-list">
          {list.map((c, i) => (
            <button key={`${c.label}-${i}`} type="button" className={`yg-row btn${i === at ? " on" : ""}`} onClick={c.run} onPointerEnter={() => setAt(i)} data-testid={`yg-cmd-${i}`}>
              <span className="yg-tile-ico small">{c.icon}</span>
              <span className="grow">{c.label}</span>
              {c.hint && <span className="r muted small">{c.hint}</span>}
            </button>
          ))}
          {!list.length && <p className="yg-empty">Nothing matches “{q}”.</p>}
        </div>
      </section>
    </div>
  );
}

export function Inbox({ g }: { g: Game }) {
  const items = g.inboxItems();
  return (
    <div className="yg-modal-back top" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && g.setUI({ inbox: false })} data-testid="yg-inbox">
      <section className="yg-glass yg-modal small" role="dialog" aria-modal="true" aria-label="Inbox">
        <header className="yg-modal-head">
          <div>
            <p className="yg-eyebrow">{items.length ? `${items.length} waiting` : "All clear"}</p>
            <h2>Inbox</h2>
          </div>
          <button type="button" className="yg-btn icon" aria-label="Close" onClick={() => g.setUI({ inbox: false })}>
            <Icon name="close" />
          </button>
        </header>
        <div className="yg-modal-body">
          {!items.length && <p className="yg-empty">Nothing needs you right now. End the week, or plan ahead.</p>}
          <Group>
            {items.map((x, i) => (
              <Row key={i} onClick={() => g.setUI({ inbox: false, ...x.go })} testId={`yg-inbox-${i}`}>
                <span className="yg-tile-ico small">{x.icon}</span>
                <span className="grow">{x.text}</span>
                <Icon name="chevron" size={15} className="yg-faint" />
              </Row>
            ))}
          </Group>
        </div>
      </section>
    </div>
  );
}

function ExtraModal({ g, title, eyebrow, children, testId }: { g: Game; title: string; eyebrow?: string; children: ReactNode; testId: string }) {
  return (
    <div className="yg-modal-back" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && g.setUI({ extra: null })} data-testid={testId}>
      <section className="yg-glass yg-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="yg-modal-head">
          <div>
            {eyebrow && <p className="yg-eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="yg-btn icon" aria-label="Close" onClick={() => g.setUI({ extra: null })} data-testid={`${testId}-close`}>
            <Icon name="close" />
          </button>
        </header>
        <div className="yg-modal-body">{children}</div>
      </section>
    </div>
  );
}

export function UpdateNotes({ g }: { g: Game }) {
  const notes = updateNotes();
  const [q, setQ] = useState("");
  const n = featureCount();
  const match = (t: string) => !q || t.toLowerCase().includes(q.toLowerCase());
  const part = (u: "custom" | "mega" | "app", title: string) => {
    const secs = notes.filter((x) => x.update === u);
    const count = secs.reduce((a, x) => a + x.items.length, 0);
    return (
      <>
        <p className="yg-notes-part">
          {title} <span className="yg-tag accent">{count} features</span>
        </p>
        {secs.map((sec) => {
          const items = sec.items.filter(match);
          if (!items.length) return null;
          return (
            <Group key={sec.title} label={`${sec.icon} ${sec.title}`}>
              <ul className="yg-notes">
                {items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Group>
          );
        })}
      </>
    );
  };
  return (
    <ExtraModal g={g} title="What's new" eyebrow={`Two super mega updates · ${n} new features`} testId="yg-notes">
      <input className="yg-input search" value={q} placeholder="Search the notes" onChange={(e) => setQ(e.target.value)} aria-label="Search the notes" />
      {part("custom", "The customisation update")}
      {part("mega", "The mega super update")}
      {part("app", "And around the game")}
    </ExtraModal>
  );
}

export function Help({ g }: { g: Game }) {
  return (
    <ExtraModal g={g} title="Help" eyebrow="How it works" testId="yg-help">
      <p className="yg-lede">Each turn is a week. Hold events to win voters, write bills and vote on them, answer crises, keep your promises and win elections. Everything new is in two panels on the dock: ✨ Customise and 🌐 Society &amp; the world, and in Campaign HQ.</p>
      <Group label="Keyboard shortcuts">
        {SHORTCUTS.map(([k, v]) => (
          <Row key={k}>
            <span className="yg-kbd">{k}</span>
            <span className="grow">{v}</span>
          </Row>
        ))}
      </Group>
      <Group label="Glossary">
        {GLOSSARY.map(([k, v]) => (
          <div key={k} className="yg-gloss">
            <b>{k}</b>
            <span>{v}</span>
          </div>
        ))}
      </Group>
    </ExtraModal>
  );
}

export function CareerStats({ g }: { g: Game }) {
  const s = g.s!;
  const c = s.counters;
  const rows: [string, string | number][] = [
    ["Weeks in politics", s.week],
    ["Weeks leading the government", c.weeksInPower ?? 0],
    ["Weeks in government", c.weeksInGov ?? 0],
    ["Elections won", s.electionsWon],
    ["Laws passed", s.lawsPassed],
    ["Laws you drafted", s.custom.length],
    ["Budgets passed", s.budgetPassed],
    ["Events held", c.eventsHeld ?? 0],
    ["Money raised", money(s, c.moneyRaised ?? 0)],
    ["Policies delivered", c.policiesDelivered ?? 0],
    ["Policies dropped (U-turns)", c.uTurns ?? 0],
    ["Promises broken", c.policiesBroken ?? 0],
    ["Promises kept", c.promisesKept ?? 0],
    ["Speeches given", c.speeches ?? 0],
    ["Orders of your own signed", c.myOrders ?? 0],
    ["Crises decided", c.crisesDecided ?? 0],
    ["Debates won", c.debatesWon ?? 0],
    ["Question Times won", c.qtWins ?? 0],
    ["Referendums won", c.referendumsWon ?? 0],
    ["Treaties signed", c.treaties ?? 0],
    ["Protests ended", c.protestsEnded ?? 0],
    ["Members won over", c.defectors ?? 0],
    ["Opposition days won", c.oppDays ?? 0],
    ["Filibusters", c.filibusters ?? 0],
    ["Posts gone viral", c.viral ?? 0],
    ["Judges appointed", c.judges ?? 0],
    ["Achievements", `${Object.keys(s.achievements).length}/${C.ACHIEVEMENTS.length}`],
    ["Score", s.score.toLocaleString()],
  ];
  return (
    <ExtraModal g={g} title="Career stats" eyebrow={`${G.fullName(G.pol(s, s.you)!)}${s.studio.nick ? ` “${s.studio.nick}”` : ""} · ${G.party(s, s.party).name}`} testId="yg-stats">
      <Group>
        {rows.map(([k, v]) => (
          <Row key={k}>
            <span className="grow">{k}</span>
            <span className="r">{v}</span>
          </Row>
        ))}
      </Group>
    </ExtraModal>
  );
}

export function SaveSlots({ g }: { g: Game }) {
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const exportIt = () => {
    const text = g.exportSave();
    if (!text) return;
    try {
      const blob = new Blob([text], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `yourgov-${(g.s?.sc.name ?? "game").replace(/\W+/g, "-").toLowerCase()}-${g.s ? G.dateLabel(g.s) : ""}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setMsg("Exported.");
    } catch {
      setMsg("This browser can't save files.");
    }
  };
  return (
    <ExtraModal g={g} title="Saves" eyebrow="Keep this career, or carry on another" testId="yg-slots">
      <p className="yg-lede">Your game saves itself every week. Keep copies in the slots, or export a file to move it to another device.</p>
      <Group label="Save slots">
        {Array.from({ length: SLOTS }, (_, i) => {
          const info = g.slotInfo(i);
          return (
            <div key={i} className="yg-optrow">
              <div className="yg-optrow-main">
                <span className="grow">
                  <b>Slot {i + 1}</b>
                  <br />
                  <span className="yg-muted small">{info ? `${info.name} · ${info.date} · ${info.score.toLocaleString()} pts` : "Empty"}</span>
                </span>
                <button type="button" className="yg-btn small primary" disabled={!g.s} onClick={() => (!info || window.confirm(`Overwrite slot ${i + 1}?`)) && g.saveSlot(i)} data-testid={`yg-slot-save-${i}`}>
                  Save
                </button>
                <button type="button" className="yg-btn small" disabled={!info} onClick={() => window.confirm(`Load slot ${i + 1}? The game you're playing now is replaced (save it first).`) && void g.loadSlot(i).then(setMsg)} data-testid={`yg-slot-load-${i}`}>
                  Load
                </button>
                {info && (
                  <button type="button" className="yg-btn icon tiny" aria-label={`Empty slot ${i + 1}`} onClick={() => window.confirm(`Empty slot ${i + 1}?`) && g.deleteSlot(i)}>
                    <Icon name="trash" size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </Group>
      <div className="yg-two">
        <button type="button" className="yg-btn" disabled={!g.s} onClick={exportIt} data-testid="yg-export">
          ⬇️ Export to a file
        </button>
        <button type="button" className="yg-btn" onClick={() => file.current?.click()} data-testid="yg-import">
          ⬆️ Import a file
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 25_000_000) return setMsg("That file is too big to be a save.");
          const err = await g.loadSave(await f.text());
          setMsg(err ?? "Loaded.");
        }}
      />
      {msg && (
        <p className="yg-note" role="status">
          {msg}
        </p>
      )}
    </ExtraModal>
  );
}

/** Photo mode: just the country, and a way back. */
export function PhotoExit({ g }: { g: Game }) {
  const s = g.s!;
  return (
    <div className="yg-photo">
      <span className="yg-glass yg-capsule yg-photo-tag">
        {St.clean(s.sc.name, 40)} · {G.dateLabel(s)}
      </span>
      <button type="button" className="yg-glass yg-btn" onClick={() => g.setUI({ photo: false })} data-testid="yg-photo-exit">
        <Icon name="close" size={16} /> Exit photo mode
      </button>
    </div>
  );
}
