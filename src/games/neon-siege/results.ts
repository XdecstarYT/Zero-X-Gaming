import type { MatchStats } from "./royale";

/**
 * The post-match results screen (DOM overlay inside the game): placement,
 * stats, Cash Cup payout, XP breakdown with an animated tier bar, unlocks and
 * challenges. Resolves when the player presses Continue.
 */

export interface MatchReward {
  xpMatch: number;
  xpChallenges: number;
  xpTotal: number;
  tierBefore: number;
  tierAfter: number;
  tierXp: number;
  cashCup: boolean;
  coinsWon: number;
  tierCoins: number;
  coins: number;
  hasPass: boolean;
  unlocked: string[];
  challenges: { title: string; xp: number }[];
  /** Medals earned this battle (Trenches). */
  medals?: { name: string; description: string; ribbon: [string, string, string] }[];
}

export interface ResultsInput {
  stats: MatchStats | null;
  won: boolean;
  ranked: boolean;
  /** Pending season rewards (null for unranked matches). */
  reward: Promise<MatchReward | null> | null;
  reduceMotion: boolean;
  /** Final score shown for modes without placement (online). */
  score: number;
  /** Headline override (e.g. "Victory" / "Defeat" in team modes). */
  title?: string;
  /** Mode-specific stat boxes (replace the battle royale stats). */
  lines?: [string, string][];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) {
  const n = document.createElement(tag);
  n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

const PRIZES: [number, number][] = [
  [1, 50],
  [2, 20],
  [3, 5],
];

function countUp(node: HTMLElement, to: number, ms: number, reduce: boolean, fmt = (v: number) => String(v)) {
  if (reduce || to === 0) {
    node.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    node.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function showResults(root: HTMLElement, input: ResultsInput): Promise<void> {
  const { stats, won, ranked, reduceMotion } = input;
  const overlay = el(
    "div",
    "absolute inset-0 z-30 flex overflow-auto bg-black/80 p-3 text-white backdrop-blur-sm sm:p-6",
  );
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "siege-results-title");
  overlay.dataset.testid = "siege-results";
  const card = el(
    "div",
    "zx-pop m-auto flex w-full max-w-3xl flex-col gap-4 rounded-2xl border border-white/15 bg-[#0d0f14]/95 p-4 sm:p-6",
  );
  overlay.appendChild(card);

  // Placement
  const head = el("div", "text-center");
  const place = stats?.placement ?? 0;
  const title = el(
    "h2",
    "font-display text-3xl font-black uppercase italic sm:text-5xl",
    input.title ?? (won ? "#1 Victory Royale" : place ? `#${place} of ${stats?.players}` : "Match over"),
  );
  title.id = "siege-results-title";
  title.style.color = won ? "#ffb321" : input.title === "Defeat" ? "#ff5a4f" : "#ffffff";
  head.append(title);
  if (!ranked && !input.reward)
    head.append(el("p", "mt-1 text-xs text-white/60", "Unranked match: no XP, coins or leaderboard score."));
  card.append(head);

  // Stats
  if (input.lines?.length) {
    const grid = el("dl", "grid grid-cols-2 gap-2 sm:grid-cols-4");
    for (const [label, value] of input.lines) {
      const box = el("div", "rounded-lg bg-white/5 p-2 text-center");
      box.append(
        el("dt", "text-[11px] uppercase tracking-wider text-white/60", label),
        el("dd", "font-display text-xl font-black", value),
      );
      grid.append(box);
    }
    card.append(grid);
  } else if (stats) {
    const grid = el("dl", "grid grid-cols-2 gap-2 sm:grid-cols-4");
    const mins = `${Math.floor(stats.survivedS / 60)}:${String(stats.survivedS % 60).padStart(2, "0")}`;
    for (const [label, value] of [
      ["Eliminations", String(stats.kills)],
      ["Damage", String(Math.round(stats.damage))],
      ["Chests", String(stats.chests)],
      ["Survived", mins],
    ]) {
      const box = el("div", "rounded-lg bg-white/5 p-2 text-center");
      box.append(
        el("dt", "text-[11px] uppercase tracking-wider text-white/60", label),
        el("dd", "font-display text-xl font-black", value),
      );
      grid.append(box);
    }
    card.append(grid);
  } else {
    card.append(el("p", "text-center font-display text-xl", `Score ${input.score}`));
  }

  const rewards = el("div", "flex flex-col gap-3");
  card.append(rewards);
  const status = el("p", "text-center text-sm text-white/70", input.reward ? "Saving your progress…" : "");
  status.setAttribute("aria-live", "polite");
  rewards.append(status);

  const cont = el(
    "button",
    "mx-auto rounded-md bg-[#ffb321] px-8 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-[#1b1406] hover:brightness-110",
    "Continue",
  ) as HTMLButtonElement;
  cont.type = "button";
  card.append(cont);
  root.appendChild(overlay);
  cont.focus({ preventScroll: true });

  input.reward
    ?.then((r) => {
      if (!r) {
        status.textContent = "";
        return;
      }
      status.remove();

      // Cash Cup payout ladder
      if (r.cashCup) {
        const cup = el("section", "rounded-xl border border-[#f2c230]/50 bg-[#f2c230]/10 p-3");
        cup.append(el("h3", "text-center font-display text-sm font-black tracking-[0.3em] text-[#f2c230]", "CASH CUP"));
        const ladder = el("ol", "mt-2 grid grid-cols-3 gap-2");
        for (const [p, c] of PRIZES) {
          const mine = place === p;
          const li = el(
            "li",
            `rounded-lg p-2 text-center ${mine ? "bg-[#f2c230] text-[#2a1d00]" : "bg-black/30 text-white/70"}`,
          );
          li.append(
            el("div", "font-display text-lg font-black", `#${p}`),
            el("div", "text-sm font-bold", `${c} coins`),
          );
          ladder.append(li);
        }
        cup.append(ladder);
        const payout = el("p", "mt-2 text-center font-display text-2xl font-black text-[#f2c230]");
        if (r.coinsWon) countUp(payout, r.coinsWon, 900, reduceMotion, (v) => `+${v} coins`);
        else payout.textContent = "No payout this time: finish top 3 to cash in.";
        if (!r.coinsWon) payout.className = "mt-2 text-center text-sm text-white/70";
        cup.append(payout);
        rewards.append(cup);
      }

      // XP + tier bar
      const xpBox = el("section", "rounded-xl bg-white/5 p-3");
      const line = el("div", "flex flex-wrap items-baseline justify-between gap-2");
      const xpNum = el("span", "font-display text-2xl font-black text-[#ffb321]");
      countUp(xpNum, r.xpMatch + r.xpChallenges, 1100, reduceMotion, (v) => `+${v} XP`);
      const detail = el(
        "span",
        "text-xs text-white/70",
        `Match ${r.xpMatch}${r.xpChallenges ? ` · Challenges ${r.xpChallenges}` : ""}`,
      );
      line.append(xpNum, detail);
      const tierRow = el("div", "mt-2 flex items-center gap-2");
      const tierLabel = el("span", "w-16 shrink-0 font-display text-sm font-black", `Tier ${r.tierBefore}`);
      const track = el("div", "h-3 flex-1 overflow-hidden rounded-full bg-black/50");
      const fill = el("div", "h-full rounded-full bg-gradient-to-r from-[#ffb321] to-[#ff6a3d]");
      track.append(fill);
      tierRow.append(tierLabel, track);
      const tierUp = el("p", "mt-2 hidden text-center font-display text-lg font-black text-[#7dffb0]");
      xpBox.append(line, tierRow, tierUp);
      rewards.append(xpBox);

      const before = r.xpTotal - r.xpMatch - r.xpChallenges;
      const pctOf = (xp: number, tier: number) => Math.min(1, Math.max(0, (xp - tier * r.tierXp) / r.tierXp));
      const finish = () => {
        tierLabel.textContent = `Tier ${r.tierAfter}`;
        fill.style.width = `${(r.tierAfter >= 30 ? 1 : pctOf(r.xpTotal, r.tierAfter)) * 100}%`;
        if (r.tierAfter > r.tierBefore) {
          tierUp.textContent = `TIER UP! ${r.tierBefore} → ${r.tierAfter}`;
          tierUp.classList.remove("hidden");
        }
      };
      if (reduceMotion) finish();
      else {
        fill.style.width = `${pctOf(before, r.tierBefore) * 100}%`;
        fill.style.transition = "width 900ms cubic-bezier(.2,.8,.2,1)";
        setTimeout(() => {
          if (r.tierAfter > r.tierBefore) {
            fill.style.width = "100%";
            setTimeout(() => {
              fill.style.transition = "none";
              fill.style.width = "0%";
              void fill.offsetWidth;
              fill.style.transition = "width 700ms cubic-bezier(.2,.8,.2,1)";
              finish();
            }, 950);
          } else finish();
        }, 250);
      }

      // Coins summary, unlocks, challenges
      const extras = el("div", "grid gap-2 sm:grid-cols-2");
      if (r.tierCoins || r.coinsWon) {
        const box = el("div", "rounded-lg bg-white/5 p-3 text-sm");
        box.append(el("p", "font-bold text-[#f2c230]", `+${r.tierCoins + r.coinsWon} coins · balance ${r.coins}`));
        if (r.tierCoins) box.append(el("p", "text-white/70", `${r.tierCoins} from the Battle Pass free lane`));
        extras.append(box);
      }
      if (r.unlocked.length) {
        const box = el("div", "rounded-lg bg-white/5 p-3 text-sm");
        box.append(el("p", "font-bold text-[#7dffb0]", "Unlocked"));
        for (const u of r.unlocked) box.append(el("p", "text-white/85", `★ ${u}`));
        extras.append(box);
      } else if (r.tierAfter > r.tierBefore && !r.hasPass) {
        extras.append(
          el(
            "p",
            "rounded-lg bg-white/5 p-3 text-sm text-white/80",
            "Get the Battle Pass (200 coins) to claim your tier rewards.",
          ),
        );
      }
      if (r.challenges.length) {
        const box = el("div", "rounded-lg bg-white/5 p-3 text-sm");
        box.append(el("p", "font-bold text-[#22e5ff]", "Challenges complete"));
        for (const c of r.challenges) box.append(el("p", "text-white/85", `✓ ${c.title} (+${c.xp} XP)`));
        extras.append(box);
      }
      if (extras.childElementCount) rewards.append(extras);

      // Medals (Trenches war record)
      if (r.medals?.length) {
        const box = el("section", "rounded-xl border border-[#c9a24a]/50 bg-[#c9a24a]/10 p-3");
        box.append(el("h3", "text-center font-display text-sm font-black tracking-[0.3em] text-[#e4d3a8]", "MEDAL AWARDED"));
        const row = el("div", "mt-2 flex flex-wrap justify-center gap-3");
        for (const m of r.medals) {
          const item = el("div", "flex w-40 flex-col items-center gap-1 text-center");
          const ribbon = el("div", "h-3 w-10 rounded-sm");
          ribbon.style.background = `linear-gradient(90deg, ${m.ribbon[0]} 0 33%, ${m.ribbon[1]} 33% 66%, ${m.ribbon[2]} 66%)`;
          const disc = el("div", "grid h-9 w-9 place-items-center rounded-full border-2 border-[#8a6a2a] bg-gradient-to-br from-[#f3d98a] to-[#a67c2a] font-display text-sm font-black text-[#3a2a08]", "★");
          item.append(ribbon, disc, el("p", "text-sm font-bold", m.name), el("p", "text-[11px] text-white/70", m.description));
          row.append(item);
        }
        box.append(row);
        rewards.append(box);
      }
    })
    .catch(() => {
      status.textContent = "Couldn't save season progress. Check your connection.";
    });

  return new Promise((resolve) => {
    const done = () => {
      overlay.remove();
      resolve();
    };
    cont.addEventListener("click", done);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") done();
    });
  });
}
