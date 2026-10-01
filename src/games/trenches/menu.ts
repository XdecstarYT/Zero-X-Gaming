import type { ModeController } from "../neon-siege/mode";
import { BroadcastChannelTransport, MemoryHub, normalizeRoom, randomRoom, ROOM_RE, type Transport } from "../neon-siege/net";
import { SupabaseTransport } from "../neon-siege/net-supabase";
import type { Team } from "./battlefield";
import { LocalDirectory, SupabaseDirectory, type LobbyDirectory, type LobbyInfo } from "./directory";
import { FRONTLINE_RESPAWNS, isGameMode, type GameMode } from "./conquest";
import { DEFAULT_FRONT, FRONT_IDS, FRONTLINE_FRONT, FRONTS, isFrontId, type FrontId } from "./fronts";
import { LobbyRoom, MAX_FIGHTERS } from "./lobby";
import { TEAM_COLORS, TEAM_NAMES, TrenchesMatch } from "./match";
import {
  CLASSES,
  DEFAULT_LOADOUTS,
  GADGETS,
  isLoadout,
  PRIMARIES,
  SECONDARIES,
  type Loadout,
  type LobbySnapshot,
  type TrenchClass,
  type TrenchMsg,
} from "./protocol";

/**
 * The Trenches front end (DOM, inside the shared FPS shell): home screen with
 * quick battle / create / join / browse, and the lobby room with teams, ready,
 * classes and chat. Battles launch through `start`.
 */

type Ctx = {
  container: HTMLElement;
  playerName: string;
  coarse: boolean;
  graphics: HTMLElement;
  start: (c: ModeController) => void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

function button(label: string, className: string, onClick: () => void) {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

const BTN =
  "rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm font-semibold text-text hover:border-cyan focus-visible:outline-2 focus-visible:outline-cyan disabled:opacity-50";
const PRIMARY =
  "rounded-md bg-[#c9a24a] px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-[#1a1408] hover:brightness-110 disabled:opacity-50";
const CARD = "flex w-full flex-col gap-2 rounded-lg border border-border bg-surface/85 p-3 text-left";
const CLASS_KEY = "zx-trenches-class";
const FRONT_KEY = "zx-trenches-front";
const MODE_KEY = "zx-trenches-mode";
const LOADOUT_KEY = "zx-trenches-loadout-";

const MODES: Record<GameMode, { name: string; blurb: string }> = {
  conquest: { name: "Classic", blurb: "Both sides fight for all five flags. Hold more than the enemy to drain their tickets." },
  frontline: {
    name: "Frontline",
    blurb: `Cape Helles: storm the beach, take two villages, cross no-man's-land and seize the HQ, one objective at a time. Attackers get only ${FRONTLINE_RESPAWNS} redeploys (+1 per objective).`,
  },
  breakthrough: {
    name: "Breakthrough",
    blurb: "Iron Legion attacks, Crimson Front defends. Take the sectors in order (A+B, then C, then D+E) before the tickets run out.",
  },
};

function isLocalMode() {
  return new URLSearchParams(window.location.search).get("net") === "local" || !SupabaseTransport.available();
}

function makeTransport(code: string, name: string): Transport<TrenchMsg> {
  return isLocalMode()
    ? new BroadcastChannelTransport<TrenchMsg>(code, name, undefined, "trenches")
    : new SupabaseTransport<TrenchMsg>(code, name, undefined, "trenches");
}

function readClass(): TrenchClass {
  try {
    const c = localStorage.getItem(CLASS_KEY);
    if (c && c in CLASSES) return c as TrenchClass;
  } catch {
    // ignore
  }
  return "rifleman";
}

function readLoadout(c: TrenchClass): Loadout {
  try {
    const l = JSON.parse(localStorage.getItem(LOADOUT_KEY + c) ?? "null");
    if (isLoadout(l)) return l;
  } catch {
    // ignore
  }
  return DEFAULT_LOADOUTS[c];
}

function readFront(): FrontId {
  try {
    const f = localStorage.getItem(FRONT_KEY);
    if (isFrontId(f) && !FRONTS[f].frontlineOnly) return f;
  } catch {
    // ignore
  }
  return DEFAULT_FRONT;
}

export function buildTrenchesMenu(ctx: Ctx): () => void {
  const { container, playerName } = ctx;
  const local = isLocalMode();
  let cls = readClass();
  let front = readFront();
  let mode: GameMode = (() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      return isGameMode(m) ? m : "conquest";
    } catch {
      return "conquest";
    }
  })();
  let directory: LobbyDirectory | null = null;
  let lobby: LobbyRoom | null = null;
  let lobbyUnsub: (() => void)[] = [];
  let dirUnsub: (() => void) | null = null;

  const setClass = (c: TrenchClass) => {
    cls = c;
    try {
      localStorage.setItem(CLASS_KEY, c);
    } catch {
      // ignore
    }
    lobby?.setClass(c);
    refreshLoadout?.();
  };

  let refreshLoadout: (() => void) | null = null;

  /** Primary / secondary / gadget for the current class (remembered per class). */
  function loadoutEditor() {
    const wrap = el("div", "grid w-full gap-2 sm:grid-cols-3");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Loadout");
    const perk = el("p", "text-[11px] font-semibold text-[#c9a24a] sm:col-span-3");
    const field = <K extends keyof Loadout>(key: K, label: string, options: Record<string, string>) => {
      const sel = el("select", "h-9 w-full rounded-md border border-border bg-bg px-2 text-sm");
      sel.id = `trenches-loadout-${key}`;
      for (const [v, name] of Object.entries(options)) {
        const o = el("option", "", name);
        o.value = v;
        sel.append(o);
      }
      sel.addEventListener("change", () => {
        const next = { ...readLoadout(cls), [key]: sel.value } as Loadout;
        if (!isLoadout(next)) return;
        try {
          localStorage.setItem(LOADOUT_KEY + cls, JSON.stringify(next));
        } catch {
          // ignore
        }
      });
      const lab = el("label", "text-[11px] font-semibold uppercase tracking-wider text-muted", label);
      lab.htmlFor = sel.id;
      return { sel, node: el("div", "flex flex-col gap-1", lab, sel) };
    };
    const gadgetNames = Object.fromEntries(Object.entries(GADGETS).map(([k, g]) => [k, `${g.name} (${g.blurb})`]));
    const p = field("primary", "Primary", PRIMARIES);
    const s2 = field("secondary", "Sidearm", SECONDARIES);
    const g = field("gadget", "Gadget", gadgetNames);
    const refresh = () => {
      const l = readLoadout(cls);
      p.sel.value = l.primary;
      s2.sel.value = l.secondary;
      g.sel.value = l.gadget;
      perk.textContent = `${CLASSES[cls].name}: ${CLASSES[cls].perk}`;
    };
    refreshLoadout = refresh;
    refresh();
    wrap.append(p.node, s2.node, g.node, perk);
    return wrap;
  }

  function classPicker() {
    const wrap = el("div", "grid w-full grid-cols-2 gap-2 sm:grid-cols-5");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Class");
    const buttons = (Object.keys(CLASSES) as TrenchClass[]).map((c) => {
      const b = button("", "rounded-md border-2 border-border bg-surface-2 p-2 text-left hover:border-[#c9a24a]", () => {
        setClass(c);
        buttons.forEach((x) => {
          const on = x.dataset.cls === c;
          x.setAttribute("aria-pressed", String(on));
          x.style.borderColor = on ? "#c9a24a" : "";
        });
      });
      b.dataset.cls = c;
      b.append(el("span", "block text-sm font-bold", CLASSES[c].name), el("span", "block text-[11px] leading-tight text-muted", CLASSES[c].blurb));
      b.setAttribute("aria-pressed", String(c === cls));
      if (c === cls) b.style.borderColor = "#c9a24a";
      return b;
    });
    wrap.append(...buttons);
    return wrap;
  }

  /** The five fronts as a pick-one group (Frontline always fights at Cape Helles). */
  function frontPicker(selected: FrontId, onPick: (f: FrontId) => void, locked = false) {
    const wrap = el("div", "grid w-full grid-cols-2 gap-2 sm:grid-cols-5");
    if (locked) wrap.classList.add("opacity-50");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Battlefield");
    const buttons = FRONT_IDS.map((id) => {
      const f = FRONTS[id];
      const b = button("", "rounded-md border-2 border-border bg-surface-2 p-2 text-left hover:border-[#c9a24a]", () => {
        buttons.forEach((x) => {
          const on = x.dataset.front === id;
          x.setAttribute("aria-pressed", String(on));
          x.style.borderColor = on ? "#c9a24a" : "";
        });
        onPick(id);
      });
      b.dataset.front = id;
      b.disabled = locked;
      b.title = f.blurb;
      const swatch = el("span", "mb-1 block h-1.5 w-full rounded-full");
      swatch.style.background = `linear-gradient(90deg, ${f.theme.soil}, ${f.theme.fog.color}, ${f.theme.earth})`;
      b.append(swatch, el("span", "block text-sm font-bold", f.name), el("span", "block text-[11px] leading-tight text-muted", `${f.place} · ${f.width}×${f.height} m`));
      b.setAttribute("aria-pressed", String(id === selected));
      if (id === selected) b.style.borderColor = "#c9a24a";
      return b;
    });
    wrap.append(...buttons);
    return wrap;
  }

  /** Classic / Frontline / Breakthrough as a pick-one group. */
  function modePicker(selected: GameMode, onPick: (m: GameMode) => void) {
    const wrap = el("div", "grid w-full gap-2 sm:grid-cols-3");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Game mode");
    const buttons = (Object.keys(MODES) as GameMode[]).map((id) => {
      const b = button("", "rounded-md border-2 border-border bg-surface-2 p-2 text-left hover:border-[#c9a24a]", () => {
        buttons.forEach((x) => {
          const on = x.dataset.mode === id;
          x.setAttribute("aria-pressed", String(on));
          x.style.borderColor = on ? "#c9a24a" : "";
        });
        onPick(id);
      });
      b.dataset.mode = id;
      b.append(el("span", "block text-sm font-bold", MODES[id].name), el("span", "block text-[11px] leading-tight text-muted", MODES[id].blurb));
      b.setAttribute("aria-pressed", String(id === selected));
      if (id === selected) b.style.borderColor = "#c9a24a";
      return b;
    });
    wrap.append(...buttons);
    return wrap;
  }

  const pickMode = (m: GameMode) => {
    mode = m;
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // ignore
    }
  };

  const pickFront = (f: FrontId) => {
    front = f;
    try {
      localStorage.setItem(FRONT_KEY, f);
    } catch {
      // ignore
    }
  };

  function header() {
    return el(
      "div",
      "text-center",
      el("p", "font-display text-3xl font-black uppercase tracking-[0.25em] text-[#e4d3a8] sm:text-5xl", "Trenches"),
      el("p", "mt-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#c9a24a]", "Classic · Frontline · Breakthrough"),
    );
  }

  // ------------------------------------------------------------------- home

  function showHome(message = "") {
    leaveLobby();
    const status = el("p", "min-h-4 text-xs text-muted", message);
    status.setAttribute("role", "status");

    const quick = button("Quick battle vs bots", PRIMARY, () => void startSolo());
    const frontBlurb = el("p", "text-[11px] text-muted", mode === "frontline" ? `${FRONTS[FRONTLINE_FRONT].name}: ${FRONTS[FRONTLINE_FRONT].blurb}` : FRONTS[front].blurb);

    // Create
    const nameInput = el("input", "h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:border-cyan focus:outline-none");
    nameInput.id = "trenches-lobby-name";
    nameInput.value = `${playerName}'s lobby`;
    nameInput.maxLength = 32;
    const sizeSel = el("select", "h-10 rounded-md border border-border bg-bg px-2 text-sm");
    sizeSel.id = "trenches-lobby-size";
    for (const n of [8, 16, 24, 32]) {
      const o = el("option", "", `${n / 2} v ${n / 2}`);
      o.value = String(n);
      if (n === 16) o.selected = true;
      sizeSel.append(o);
    }
    const botsBox = el("input");
    botsBox.type = "checkbox";
    botsBox.checked = true;
    botsBox.id = "trenches-bots";
    const nameLabel = el("label", "text-xs font-semibold", "Lobby name");
    nameLabel.htmlFor = nameInput.id;
    const sizeLabel = el("label", "text-xs font-semibold", "Size");
    sizeLabel.htmlFor = sizeSel.id;
    const botsLabel = el("label", "flex items-center gap-2 text-xs", botsBox, "Fill empty slots with bots");
    const create = button("Create lobby", PRIMARY, () => {
      const code = randomRoom();
      void joinLobby(code, { name: nameInput.value.trim().slice(0, 32) || `${playerName}'s lobby`, max: Number(sizeSel.value), bots: botsBox.checked, front, mode }, true);
    });

    // Join by code
    const codeInput = el(
      "input",
      "h-10 w-32 rounded-md border border-border bg-bg px-3 text-center font-mono text-sm uppercase tracking-[0.3em] focus:border-cyan focus:outline-none",
    );
    codeInput.id = "trenches-code";
    codeInput.maxLength = 8;
    codeInput.autocomplete = "off";
    const codeLabel = el("label", "sr-only", "Lobby code");
    codeLabel.htmlFor = codeInput.id;
    const join = button("Join", BTN, () => {
      const code = normalizeRoom(codeInput.value);
      codeInput.value = code;
      if (!ROOM_RE.test(code)) {
        status.textContent = "Lobby codes are 4–8 letters or numbers.";
        codeInput.focus();
        return;
      }
      void joinLobby(code, { name: `Lobby ${code}`, max: 16, bots: true, front: DEFAULT_FRONT }, false);
    });
    codeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") join.click();
    });

    // Browse
    const list = el("ul", "flex max-h-56 flex-col gap-1.5 overflow-auto");
    list.setAttribute("aria-label", "Open lobbies");
    list.dataset.testid = "lobby-list";
    const renderList = (items: LobbyInfo[]) => {
      if (!items.length) {
        list.replaceChildren(el("li", "rounded-md border border-dashed border-border p-3 text-center text-xs text-muted", "No open lobbies yet. Create one!"));
        return;
      }
      list.replaceChildren(
        ...items.map((l) => {
          const full = l.players >= l.max;
          const joinBtn = button(full ? "Full" : "Join", BTN, () => void joinLobby(l.code, { name: l.name, max: l.max, bots: true, front: DEFAULT_FRONT }, false));
          joinBtn.disabled = full;
          joinBtn.setAttribute("aria-label", `Join ${l.name}`);
          return el(
            "li",
            "flex items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 py-2",
            el(
              "div",
              "min-w-0",
              el("p", "truncate text-sm font-semibold", l.name),
              el("p", "text-[11px] text-muted", `${l.code} · ${l.players}/${l.max} players · ${l.phase === "match" ? "In battle" : "In lobby"}`),
            ),
            joinBtn,
          );
        }),
      );
    };
    renderList([]);
    void ensureDirectory()
      .then((d) => {
        dirUnsub?.();
        dirUnsub = d.onList(renderList);
      })
      .catch(() => list.replaceChildren(el("li", "p-3 text-center text-xs text-muted", "Couldn't load the lobby list. You can still join with a code.")));

    const controls = ctx.coarse
      ? "Left thumb: move (push fully to sprint) · Right thumb: look · FIRE (drag to aim) · AIM · CRCH / PRONE · NADE · BAYO · MASK · hold DIG · ARTY / SUP / RCN / GAS · tap the prompt to man a gun or revive"
      : "WASD move · Mouse look · Click fire · Right-click aim · Shift sprint · C crouch · X prone · Q grenade · V bayonet · M gas mask · E man a gun / revive (medics) · hold G dig · B artillery · N supplies · T recon flare · H gas shells · 1–5 switch · R reload · Tab scores";
    const news = el(
      "section",
      "w-full max-w-2xl rounded-xl border border-[#c9a24a]/50 bg-[#c9a24a]/10 p-3 text-left",
      el("h3", "text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a24a]", "New: the Over the Top update"),
      el(
        "ul",
        "mt-1 grid gap-x-4 gap-y-0.5 text-[11px] text-muted sm:grid-cols-2",
        ...[
          "Poison gas: shells (H) and barrages; it drifts and sinks into trenches. M for your mask",
          "Bayonets (V): lunge at close range, charge while sprinting",
          "Vickers guns in every front line: E to man one, fire in bursts",
          "Medics revive the fallen (E), giving their side the ticket back",
          "A sixth front: the Argonne Forest, autumn 1918",
          "Four new medals in your war record",
        ].map((t) => el("li", "", `▸ ${t}`)),
      ),
    );

    container.replaceChildren(
      header(),
      news,
      el(
        "section",
        CARD + " max-w-2xl",
        el("h3", "text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a24a]", "Game mode"),
        modePicker(mode, (m) => {
          pickMode(m);
          showHome();
        }),
        el("h3", "mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a24a]", "Battlefield"),
        frontPicker(
          front,
          (f) => {
            pickFront(f);
            frontBlurb.textContent = FRONTS[f].blurb;
          },
          mode === "frontline",
        ),
        frontBlurb,
      ),
      el(
        "section",
        CARD + " max-w-2xl",
        el("h3", "text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a24a]", "Your class"),
        classPicker(),
        el("h3", "mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a24a]", "Loadout"),
        loadoutEditor(),
      ),
      el(
        "div",
        "grid w-full max-w-2xl gap-3 sm:grid-cols-2",
        el(
          "section",
          CARD,
          el("h3", "text-xs font-semibold uppercase tracking-[0.2em] text-cyan", "Play now"),
          el("p", "text-xs text-muted", "10 v 10 against bots on the chosen front and mode, under artillery fire."),
          quick,
          el("h3", "mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan", "Create a lobby"),
          nameLabel,
          nameInput,
          el("div", "flex items-center gap-2", sizeLabel, sizeSel),
          botsLabel,
          create,
        ),
        el(
          "section",
          CARD,
          el("h3", "text-xs font-semibold uppercase tracking-[0.2em] text-cyan", "Lobbies"),
          list,
          el("div", "mt-1 flex items-center gap-2", codeLabel, codeInput, join),
          el(
            "p",
            "text-[11px] text-subtle",
            local ? "Local mode: open Trenches in another tab to play together." : "Lobbies are live: anyone can join an open one.",
          ),
        ),
      ),
      status,
      ctx.graphics,
      el("p", "max-w-xl text-center text-[11px] text-subtle", controls),
    );
  }

  async function ensureDirectory() {
    if (directory) return directory;
    const d: LobbyDirectory = local ? new LocalDirectory() : new SupabaseDirectory();
    await d.connect();
    directory = d;
    return d;
  }

  // ------------------------------------------------------------------ solo

  async function startSolo() {
    const hub = new MemoryHub<TrenchMsg>();
    const transport = hub.join("me", playerName);
    await transport.connect();
    const snap: LobbySnapshot = {
      code: "SOLO",
      name: "Skirmish",
      hostId: "me",
      phase: "match",
      max: 20,
      bots: true,
      front,
      mode,
      players: [{ id: "me", name: playerName, team: 1, ready: true, cls }],
      seed: Math.floor(Math.random() * 2 ** 31),
      matchId: 1,
    };
    ctx.start(new TrenchesMatch(transport, snap, { solo: true, roster: [{ id: "me", name: playerName, joinedAt: 1 }], myClass: cls, myLoadout: readLoadout(cls) }));
  }

  // ----------------------------------------------------------------- lobby

  async function joinLobby(code: string, settings: { name: string; max: number; bots: boolean; front: FrontId; mode?: GameMode }, creating: boolean) {
    leaveLobby();
    const room = new LobbyRoom(makeTransport(code, playerName), code, playerName, settings);
    lobby = room;
    container.replaceChildren(header(), el("p", "text-sm text-muted", creating ? "Creating lobby…" : `Joining ${code}…`));
    try {
      await room.connect();
    } catch (e) {
      lobby = null;
      room.close();
      showHome((e as Error).message || "Couldn't reach that lobby.");
      return;
    }
    if (lobby !== room) return;
    room.setClass(cls);
    const url = new URL(window.location.href);
    url.searchParams.set("lobby", code);
    window.history.replaceState(null, "", url);
    lobbyUnsub.push(
      room.onChange(renderLobby),
      room.onChat(renderChat),
      room.onStart((s) => launch(s)),
    );
    renderLobby();
  }

  function launch(s: LobbySnapshot) {
    const room = lobby;
    if (!room) return;
    ctx.start(
      new TrenchesMatch(room.transport, s, {
        roster: room.roster,
        myClass: cls,
        myLoadout: readLoadout(cls),
        onBackToLobby: () => {
          if (room.isHost) room.backToLobby();
          renderLobby();
        },
      }),
    );
  }

  function leaveLobby() {
    lobbyUnsub.forEach((u) => u());
    lobbyUnsub = [];
    lobby?.close();
    lobby = null;
    directory?.advertise(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("lobby")) {
      url.searchParams.delete("lobby");
      window.history.replaceState(null, "", url);
    }
  }

  let chatLog: HTMLElement | null = null;

  function renderChat() {
    if (!chatLog || !lobby) return;
    chatLog.replaceChildren(
      ...lobby.chat.slice(-40).map((c) => {
        const line = el("p", c.system ? "text-[11px] italic text-subtle" : "text-xs");
        if (c.system) line.textContent = c.text;
        else line.append(el("span", "font-semibold text-[#c9a24a]", `${c.name}: `), document.createTextNode(c.text));
        return line;
      }),
    );
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function renderLobby() {
    const room = lobby;
    if (!room) return;
    const s = room.snapshot;
    if (!s) {
      container.replaceChildren(header(), el("p", "text-sm text-muted", "Waiting for the lobby host…"));
      return;
    }
    const me = room.me;
    const bots = s.bots ? Math.max(0, s.max - s.players.length) : 0;
    if (room.isHost) directory?.advertise({ code: s.code, name: s.name, players: s.players.length, max: s.max, phase: s.phase });

    const team = (t: Team) => {
      const players = s.players.filter((p) => p.team === t);
      const col = el("section", "flex flex-col gap-1.5 rounded-lg border-2 bg-surface/85 p-3");
      col.style.borderColor = TEAM_COLORS[t];
      col.setAttribute("aria-label", TEAM_NAMES[t]);
      col.append(el("h3", "font-display text-sm font-black uppercase tracking-wider", TEAM_NAMES[t]));
      col.querySelector("h3")!.setAttribute("style", `color:${TEAM_COLORS[t]}`);
      const ul = el("ul", "flex flex-col gap-1");
      for (const p of players) {
        const li = el("li", `flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${p.id === room.selfId ? "bg-white/10 font-bold" : ""}`);
        li.append(
          el("span", "truncate", `${p.id === s.hostId ? "★ " : ""}${p.name}${p.id === room.selfId ? " (you)" : ""}`),
          el("span", `shrink-0 text-[11px] ${p.ready ? "text-success" : "text-muted"}`, `${CLASSES[p.cls].name} · ${p.ready ? "Ready" : "Not ready"}`),
        );
        ul.append(li);
      }
      col.append(ul);
      return col;
    };

    const switchTeam = button("Switch team", BTN, () => me && room.setTeam(me.team === 1 ? 2 : 1));
    const ready = button(me?.ready ? "Not ready" : "Ready up", BTN, () => room.setReady(!me?.ready));
    ready.setAttribute("aria-pressed", String(!!me?.ready));
    const notReady = s.players.filter((p) => !p.ready).length;
    const startBtn = button(notReady ? `Start battle (${notReady} not ready)` : "Start battle", PRIMARY, () => room.start());
    startBtn.hidden = !room.isHost || s.phase === "match";
    const rejoin = button("Rejoin battle", PRIMARY, () => launch(s));
    rejoin.hidden = s.phase !== "match";
    const leave = button("Leave lobby", BTN, () => showHome());
    const copy = button("Copy invite link", BTN, async () => {
      const url = new URL(window.location.href);
      url.searchParams.set("lobby", s.code);
      if (local) url.searchParams.set("net", "local");
      try {
        await navigator.clipboard.writeText(url.toString());
        copy.textContent = "Link copied!";
      } catch {
        copy.textContent = s.code;
      }
    });

    chatLog = el("div", "h-32 overflow-auto rounded-md bg-black/30 p-2");
    chatLog.setAttribute("role", "log");
    chatLog.setAttribute("aria-label", "Lobby chat");
    chatLog.setAttribute("aria-live", "polite");
    const chatInput = el("input", "h-9 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-sm focus:border-cyan focus:outline-none");
    chatInput.id = "trenches-chat";
    chatInput.maxLength = 120;
    chatInput.placeholder = "Say something…";
    const chatLabel = el("label", "sr-only", "Chat message");
    chatLabel.htmlFor = chatInput.id;
    const send = () => {
      room.sendChat(chatInput.value);
      chatInput.value = "";
    };
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });

    const lobbyMode: GameMode = isGameMode(s.mode) ? s.mode : "conquest";
    const f = lobbyMode === "frontline" ? FRONTS[FRONTLINE_FRONT] : (FRONTS[s.front] ?? FRONTS[DEFAULT_FRONT]);
    const m = MODES[lobbyMode];
    const frontCard = room.isHost && s.phase !== "match"
      ? el(
          "section",
          CARD + " max-w-2xl",
          el("h3", "text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a24a]", "Game mode"),
          modePicker(lobbyMode, (id) => room.setMode(id)),
          el("h3", "mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a24a]", "Battlefield"),
          frontPicker(s.front, (id) => room.setFront(id), lobbyMode === "frontline"),
        )
      : el("p", "text-sm", el("strong", "", `${f.name} · ${m.name}`), ` · ${f.place}. ${m.blurb}`);
    container.replaceChildren(
      header(),
      el(
        "div",
        "flex w-full max-w-2xl flex-wrap items-center justify-between gap-2",
        el(
          "div",
          "min-w-0 text-left",
          el("h2", "truncate font-display text-lg font-bold", s.name),
          el(
            "p",
            "text-xs text-muted",
            `Code ${s.code} · ${s.players.length}/${s.max} players${bots ? ` · ${bots} bot${bots === 1 ? "" : "s"} will fill in` : ""} · ${s.phase === "match" ? "Battle in progress" : "In lobby"}${room.isHost ? " · You're the host" : ""}`,
          ),
        ),
        copy,
      ),
      frontCard,
      el("div", "grid w-full max-w-2xl gap-3 sm:grid-cols-2", team(1), team(2)),
      el("div", "flex flex-wrap justify-center gap-2", switchTeam, ready, startBtn, rejoin, leave),
      el(
        "section",
        CARD + " max-w-2xl",
        el("h3", "text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a24a]", "Class"),
        classPicker(),
        el("h3", "mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a24a]", "Loadout"),
        loadoutEditor(),
      ),
      el("section", CARD + " max-w-2xl", chatLog, el("div", "flex gap-2", chatLabel, chatInput, button("Send", BTN, send))),
      el("p", "text-[11px] text-subtle", room.isHost ? "Start whenever you like; bots fill the empty slots." : "Waiting for the host to start the battle."),
    );
    renderChat();
  }

  // Invite links: ?lobby=CODE joins straight away.
  const invited = normalizeRoom(new URLSearchParams(window.location.search).get("lobby") ?? "");
  if (ROOM_RE.test(invited)) void joinLobby(invited, { name: `Lobby ${invited}`, max: 16, bots: true, front: DEFAULT_FRONT }, false);
  else showHome();

  return () => {
    leaveLobby();
    dirUnsub?.();
    directory?.close();
    directory = null;
  };
}

export { MAX_FIGHTERS };
