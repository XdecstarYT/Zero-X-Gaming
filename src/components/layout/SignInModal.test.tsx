import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAuth } from "@/store/auth";

// The site isn't connected to the online service: accounts live on the device.
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowser: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const { SignInModal } = await import("./SignInModal");

beforeAll(() => {
  // jsdom has no <dialog> modal support.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  useAuth.setState({ status: "guest", profile: null });
});

function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("<SignInModal> without the online service", () => {
  it("creates a ZXG account on this device, carrying over guest progress", async () => {
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 1234, coins: 50 }));
    const onClose = vi.fn();
    render(<SignInModal open onClose={onClose} initialMode="sign_up" />);
    expect(screen.getByText(/saved on this device/)).toBeInTheDocument();
    fill("Account name", "Trench_Rat");
    fill(/^Password$/, "correct horse");
    fill("Confirm password", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const auth = useAuth.getState();
    expect(auth.status).toBe("device");
    expect(auth.profile?.username).toBe("Trench_Rat");
    expect(auth.profile?.xp).toBe(1234);
  });

  it("signs in to an existing device account and rejects a wrong password", async () => {
    const { createDeviceAccount, signOutDeviceAccount } = await import("@/lib/device-accounts");
    await createDeviceAccount("Sapper", "password123");
    signOutDeviceAccount();
    const onClose = vi.fn();
    render(<SignInModal open onClose={onClose} />);
    fill("Account name", "sapper");
    fill(/^Password$/, "not it at all");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Wrong account name or password.")).toBeInTheDocument();
    fill(/^Password$/, "password123");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(useAuth.getState().status).toBe("device"));
    expect(onClose).toHaveBeenCalled();
  });
});
