import { registerOnlineMenu } from "./index";
import { BroadcastChannelTransport, normalizeRoom, randomRoom, ROOM_RE, type Transport } from "./net";
import { SupabaseTransport } from "./net-supabase";
import { OnlineController, ROOM_SIZE } from "./online";

/**
 * "Online · Deathmatch" section of the Neon Siege menu.
 * Uses Supabase Realtime when configured; otherwise (or with ?net=local) rooms
 * are local to this browser, so two tabs can play each other.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

const BTN =
  "rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm font-semibold text-text hover:border-cyan focus-visible:outline-2 focus-visible:outline-cyan disabled:opacity-50";

function isLocalMode() {
  const forced = new URLSearchParams(window.location.search).get("net") === "local";
  return forced || !SupabaseTransport.available();
}

function makeTransport(room: string, name: string): Transport {
  return isLocalMode() ? new BroadcastChannelTransport(room, name) : new SupabaseTransport(room, name);
}

registerOnlineMenu(({ playerName, start, container }) => {
  const params = new URLSearchParams(window.location.search);
  const initial = normalizeRoom(params.get("room") ?? "") || randomRoom();
  const local = isLocalMode();

  const input = el(
    "input",
    "h-10 w-32 rounded-md border border-border bg-bg px-3 text-center font-mono text-sm uppercase tracking-[0.3em] focus:border-cyan focus:outline-none",
  );
  input.id = "siege-room";
  input.value = initial;
  input.maxLength = 8;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-describedby", "siege-room-hint");

  const status = el("p", "min-h-4 text-xs text-muted");
  status.setAttribute("role", "status");

  const join = el(
    "button",
    "rounded-md bg-magenta px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-bg hover:shadow-glow-magenta disabled:opacity-50",
    "Join room",
  );
  join.type = "button";
  const fresh = el("button", BTN, "New code");
  fresh.type = "button";
  const copy = el("button", BTN, "Copy invite link");
  copy.type = "button";

  fresh.addEventListener("click", () => {
    input.value = randomRoom();
    status.textContent = "";
  });

  copy.addEventListener("click", async () => {
    const code = normalizeRoom(input.value);
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    if (local) url.searchParams.set("net", "local");
    try {
      await navigator.clipboard.writeText(url.toString());
      status.textContent = "Invite link copied.";
    } catch {
      status.textContent = url.toString();
    }
  });

  join.addEventListener("click", async () => {
    const code = normalizeRoom(input.value);
    input.value = code;
    if (!ROOM_RE.test(code)) {
      status.textContent = "Room codes are 4–8 letters or numbers.";
      input.focus();
      return;
    }
    join.disabled = true;
    status.textContent = "Connecting…";
    const transport = makeTransport(code, playerName);
    try {
      const controller = await OnlineController.join(transport, playerName, code);
      status.textContent = "";
      start(controller);
    } catch (e) {
      transport.close();
      status.textContent = (e as Error).message || "Couldn't join the room.";
    } finally {
      join.disabled = false;
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") join.click();
  });

  const label = el("label", "sr-only", "Room code");
  label.htmlFor = input.id;
  const hint = el(
    "p",
    "text-[11px] text-subtle",
    local
      ? "Local mode: open this game in another tab and join the same code to play together."
      : "Share the code (or invite link) with friends.",
  );
  hint.id = "siege-room-hint";

  container.className =
    "flex w-full max-w-md flex-col items-center gap-2 rounded-lg border border-border bg-surface/80 p-3";
  container.append(
    el("h3", "text-xs font-semibold uppercase tracking-[0.2em] text-magenta", "Online · Deathmatch"),
    el(
      "p",
      "text-xs text-muted",
      `Free-for-all, up to ${ROOM_SIZE} fighters. Bots fill empty slots. Unranked. Playing as ${playerName}.`,
    ),
    el("div", "flex flex-wrap items-center justify-center gap-2", label, input, join, fresh, copy),
    hint,
    status,
  );
});
