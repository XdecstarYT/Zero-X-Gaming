/**
 * Device accounts: ZXG accounts that work with no server at all. When the
 * site isn't connected to Supabase, sign-up / sign-in still work: accounts
 * live in this browser (localStorage), passwords are salted and hashed with
 * PBKDF2 (Web Crypto), and each account keeps its own progress, coins and
 * battle pass. They don't follow you to another device (that needs the online
 * service), and there's no password reset.
 */

import { validatePassword } from "./auth";
import { validateAccountName } from "./zxg-account";

export const ACCOUNTS_KEY = "zx-device-accounts";
export const SESSION_KEY = "zx-device-session";
const ITERATIONS = 150_000;

export interface DeviceAccount {
  id: string;
  username: string;
  createdAt: number;
}

interface StoredAccount extends DeviceAccount {
  salt: string;
  hash: string;
}

type Store = Record<string, StoredAccount>;

function readStore(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(s: Store) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(s));
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    256,
  );
  return b64(new Uint8Array(bits));
}

/** Constant-time string compare (hash strings are the same length). */
function sameHash(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const pub = (a: StoredAccount): DeviceAccount => ({ id: a.id, username: a.username, createdAt: a.createdAt });

export type DeviceResult = { ok: true; account: DeviceAccount } | { ok: false; error: string };

export async function createDeviceAccount(name: string, password: string): Promise<DeviceResult> {
  const problem = validateAccountName(name) ?? validatePassword(password);
  if (problem) return { ok: false, error: problem };
  const store = readStore();
  const key = name.trim().toLowerCase();
  if (store[key]) return { ok: false, error: "That account name is taken on this device. Try another, or sign in." };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const account: StoredAccount = {
    id: crypto.randomUUID(),
    username: name.trim(),
    createdAt: Date.now(),
    salt: b64(salt),
    hash: await hashPassword(password, salt),
  };
  try {
    writeStore({ ...store, [key]: account });
    localStorage.setItem(SESSION_KEY, account.id);
  } catch {
    return { ok: false, error: "This browser is blocking storage, so accounts can't be saved here." };
  }
  return { ok: true, account: pub(account) };
}

export async function signInDeviceAccount(name: string, password: string): Promise<DeviceResult> {
  const account = readStore()[name.trim().toLowerCase()];
  // Hash even for unknown names so both failures take the same time.
  const hash = await hashPassword(password, account ? unb64(account.salt) : new Uint8Array(16));
  if (!account || !sameHash(hash, account.hash)) return { ok: false, error: "Wrong account name or password." };
  try {
    localStorage.setItem(SESSION_KEY, account.id);
  } catch {
    return { ok: false, error: "This browser is blocking storage, so you can't stay signed in." };
  }
  return { ok: true, account: pub(account) };
}

export function signOutDeviceAccount() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // nothing to clear
  }
}

/** The device account signed in on this browser, if any. */
export function currentDeviceAccount(): DeviceAccount | null {
  try {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    const a = Object.values(readStore()).find((x) => x.id === id);
    return a ? pub(a) : null;
  } catch {
    return null;
  }
}

/** Storage-key suffix that keeps each device account's progress separate from guests and other accounts. */
export function deviceSaveSuffix() {
  const a = currentDeviceAccount();
  return a ? `:${a.id}` : "";
}
