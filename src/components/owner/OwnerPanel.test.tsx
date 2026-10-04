import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAuth } from "@/store/auth";
import type { Dashboard } from "@/lib/owner";

const owner = { is: true };
const dashboard: Dashboard = {
  players: { total: 42, new24h: 3, new7d: 9, active7d: 17, hidden: 1 },
  plays: { total: 900, day: 12, week: 80, daily: Array.from({ length: 14 }, (_, i) => ({ day: `2026-09-${String(20 + i).padStart(2, "0")}`, plays: i * 3 })) },
  games: [
    { slug: "life", title: "Life", status: "live", plays: 500, week: 40, best: 1200 },
    { slug: "trenches", title: "Trenches", status: "live", plays: 400, week: 40, best: null },
  ],
  economy: { coins: 5000, wallets: 20, passHolders: 4, season: "s1", unlocks: { "ubusiness-lite": 2, "ubusiness-ultimate": 1, "sports-plus": 5 }, spent7d: 300, earned7d: 450 },
  top: [{ username: "Ace", xp: 9000, hidden: false, joined: "2026-09-01T00:00:00Z" }],
  recent: [{ username: "Newbie", xp: 10, hidden: false, joined: "2026-10-03T00:00:00Z" }],
  reports: [{ id: 7, target: "Griefer", reason: "bad_name", details: "rude name", at: "2026-10-03T00:00:00Z", by: "Ace" }],
  town: { citizens: 6, treasury: 1500, servers: [{ id: "main", name: "Main Street", locked: false }, { id: "harbour", name: "Harbour Side", locked: true }] },
  settings: { maintenance: { games: ["trenches"] } },
};
const api = {
  ownerDashboard: vi.fn(async () => dashboard),
  setSetting: vi.fn(async () => {}),
  grantCoins: vi.fn(async () => ({ coins: 1 })),
  setHidden: vi.fn(async () => {}),
  resolveReport: vi.fn(async () => {}),
  setServerLock: vi.fn(async () => {}),
};

vi.mock("@/lib/owner", () => ({
  ...api,
  useIsOwner: () => owner.is,
  useOwnerStore: (sel: (s: { checked: string }) => unknown) => sel({ checked: "u1" }),
  useSiteSettings: (sel: (s: { load: () => Promise<void> }) => unknown) => sel({ load: async () => {} }),
}));

const { OwnerPanel } = await import("./OwnerPanel");

afterEach(cleanup);
beforeEach(() => {
  owner.is = true;
  Object.values(api).forEach((f) => f.mockClear());
  useAuth.setState({ status: "signed_in", userId: "u1" });
});

describe("<OwnerPanel>", () => {
  it("turns everyone else away", () => {
    owner.is = false;
    render(<OwnerPanel />);
    expect(screen.getByTestId("owner-denied")).toBeInTheDocument();
    expect(api.ownerDashboard).not.toHaveBeenCalled();
  });

  it("shows the site's numbers, games, servers and reports to the owner", async () => {
    render(<OwnerPanel />);
    await screen.findByTestId("owner-panel");
    expect(screen.getByTestId("owner-players")).toHaveTextContent("42");
    expect(screen.getByTestId("owner-maint-trenches")).toHaveTextContent("Down");
    expect(screen.getByTestId("owner-maint-life")).toHaveTextContent("Live");
    expect(screen.getByText("Harbour Side", { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId("owner-reports")).toHaveTextContent("Griefer");
  });

  it("publishes an announcement and takes a game down", async () => {
    render(<OwnerPanel />);
    await screen.findByTestId("owner-panel");
    fireEvent.change(screen.getByTestId("owner-ann-text"), { target: { value: "Double XP weekend!" } });
    fireEvent.click(screen.getByTestId("owner-ann-publish"));
    await waitFor(() => expect(api.setSetting).toHaveBeenCalledWith("announcement", expect.objectContaining({ text: "Double XP weekend!" })));
    fireEvent.click(screen.getByTestId("owner-maint-life"));
    await waitFor(() => expect(api.setSetting).toHaveBeenCalledWith("maintenance", { games: expect.arrayContaining(["trenches", "life"]) }));
  });

  it("closes a report by hiding the player", async () => {
    render(<OwnerPanel />);
    await screen.findByTestId("owner-panel");
    fireEvent.click(screen.getByRole("button", { name: "Hide player" }));
    await waitFor(() => expect(api.resolveReport).toHaveBeenCalledWith(7, "actioned"));
    expect(api.setHidden).toHaveBeenCalledWith("Griefer", true);
  });
});
