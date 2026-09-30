import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCOUNTS_KEY,
  createDeviceAccount,
  currentDeviceAccount,
  deviceSaveSuffix,
  signInDeviceAccount,
  signOutDeviceAccount,
} from "./device-accounts";

beforeEach(() => localStorage.clear());

describe("device accounts", () => {
  it("creates an account, signs in and out, and never stores the password", async () => {
    const made = await createDeviceAccount("Trench_Rat", "correct horse");
    expect(made.ok).toBe(true);
    expect(currentDeviceAccount()?.username).toBe("Trench_Rat");
    expect(localStorage.getItem(ACCOUNTS_KEY)).not.toContain("correct horse");
    expect(deviceSaveSuffix()).toMatch(/^:[0-9a-f-]{36}$/);

    signOutDeviceAccount();
    expect(currentDeviceAccount()).toBeNull();
    expect(deviceSaveSuffix()).toBe("");

    expect(await signInDeviceAccount("trench_rat", "wrong password")).toEqual({ ok: false, error: "Wrong account name or password." });
    expect(await signInDeviceAccount("nobody", "whatever1")).toEqual({ ok: false, error: "Wrong account name or password." });
    const back = await signInDeviceAccount("TRENCH_RAT", "correct horse");
    expect(back.ok && back.account.username).toBe("Trench_Rat");
  });

  it("validates names and passwords and keeps names unique (case-insensitive)", async () => {
    expect(await createDeviceAccount("ab", "longenough")).toMatchObject({ ok: false });
    expect(await createDeviceAccount("good_name", "short")).toMatchObject({ ok: false });
    expect((await createDeviceAccount("Sapper", "longenough")).ok).toBe(true);
    expect(await createDeviceAccount("sapper", "longenough")).toMatchObject({ ok: false, error: expect.stringContaining("taken") });
  });

  it("gives each account a different save slot", async () => {
    await createDeviceAccount("One_", "password1");
    const a = deviceSaveSuffix();
    await createDeviceAccount("Two_", "password2");
    expect(deviceSaveSuffix()).not.toBe(a);
  });
});
