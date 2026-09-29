import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { XPBar } from "./XPBar";

describe("<XPBar>", () => {
  it("exposes level progress to assistive tech", () => {
    render(<XPBar xp={150} />);
    const bar = screen.getByRole("progressbar", { name: "Level 2 progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "18"); // 50 / 280
    expect(screen.getByText("Lvl 2")).toBeInTheDocument();
    expect(screen.getByText("50 / 280 XP")).toBeInTheDocument();
  });
});
