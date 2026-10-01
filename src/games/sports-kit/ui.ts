/** DOM helpers for the Sports+ game menus, results cards and settings. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", ...children: (Node | string)[]) {
  const n = document.createElement(tag);
  n.className = className;
  n.append(...children);
  return n;
}

export function button(label: string, className: string, onClick: () => void) {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

export function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v && typeof v === "object" ? { ...fallback, ...v } : fallback;
  } catch {
    return fallback;
  }
}

export function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Storage blocked: the setting just isn't remembered.
  }
}

export const BTN =
  "rounded-md border-2 border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:border-[#facc15] focus-visible:outline-2 focus-visible:outline-[#facc15]";

export const PRIMARY = "rounded-md px-6 py-3 font-display text-base font-black uppercase tracking-[0.2em] text-white hover:brightness-110";

/** The big call-to-action button, in the game's colour. */
export function primaryButton(label: string, color: string, onClick: () => void) {
  const b = button(label, PRIMARY, onClick);
  b.style.background = color;
  b.style.boxShadow = `0 0 24px ${color}99`;
  return b;
}

/** A row of toggle buttons (one pressed); `pick` runs and the prefs save on change. */
export function choice<T extends string | number>(label: string, items: { value: T; title: string; sub?: string }[], current: T, pick: (v: T) => void) {
  const wrap = el("div", "grid w-full gap-2 sm:grid-cols-3");
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", label);
  const buttons = items.map((it) => {
    const b = button("", `${BTN} text-left`, () => {
      pick(it.value);
      for (const x of buttons) {
        const on = x.dataset.value === String(it.value);
        x.setAttribute("aria-pressed", String(on));
        x.style.borderColor = on ? "#facc15" : "";
      }
    });
    b.dataset.value = String(it.value);
    b.append(el("span", "block font-bold", it.title), el("span", "block text-[11px] font-normal text-white/60", it.sub ?? ""));
    const on = it.value === current;
    b.setAttribute("aria-pressed", String(on));
    if (on) b.style.borderColor = "#facc15";
    return b;
  });
  wrap.append(...buttons);
  return wrap;
}

export const card = (title: string, ...body: Node[]) =>
  el("section", "flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left", el("h3", "text-[11px] font-bold uppercase tracking-[0.25em] text-[#facc15]", title), ...body);

/** The menu's title block. */
export function hero(kicker: string, title: string, sub: string, background: string) {
  return el(
    "div",
    "relative w-full overflow-hidden rounded-xl p-5 text-center",
    Object.assign(el("div", "absolute inset-0 opacity-70"), { ariaHidden: "true", style: `background: ${background}` }),
    el("p", "relative text-[11px] font-bold uppercase tracking-[0.35em] text-[#facc15]", kicker),
    el("p", "relative font-display text-5xl font-black italic tracking-tight sm:text-6xl", title),
    el("p", "relative mt-1 text-[11px] font-bold uppercase tracking-[0.35em] text-white/80", sub),
  );
}

export function howTo(items: [string, string][]) {
  return el(
    "details",
    "w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left text-xs text-white/75 [&[open]>summary]:mb-2",
    el("summary", "cursor-pointer text-[11px] font-bold uppercase tracking-[0.25em] text-[#facc15]", "How to play"),
    el("ul", "flex flex-col gap-1.5", ...items.map(([t, x]) => el("li", "", el("strong", "text-white", `${t}: `), x))),
  );
}

export const stat = (k: string, v: string | number) =>
  el("div", "rounded bg-white/5 px-2 py-1.5", el("p", "text-[10px] uppercase tracking-wider text-white/50", k), el("p", "text-lg font-black", String(v)));

/** Adaptive resolution: hold ~50 fps without going soft. */
export class ResolutionGovernor {
  private avg = 1 / 60;
  private at = 0;
  scale = 1;
  tick(dt: number, now: number, apply: (k: number) => void) {
    this.avg += (dt - this.avg) * 0.05;
    if (now - this.at < 2500) return;
    this.at = now;
    const before = this.scale;
    if (this.avg > 1 / 42 && this.scale > 0.75) this.scale = Math.max(0.75, this.scale - 0.1);
    else if (this.avg < 1 / 57 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.05);
    if (this.scale !== before) apply(this.scale);
  }
}
