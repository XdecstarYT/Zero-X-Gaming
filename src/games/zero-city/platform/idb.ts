/**
 * A tiny IndexedDB key-value store (one database, named stores), with an
 * in-memory fallback when IndexedDB isn't available (private windows, tests).
 */
const DB = "zero-city";
const STORES = ["saves", "kv"] as const;
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, Map<string, unknown>>();

function open(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

const mem = (store: StoreName) => {
  let m = memory.get(store);
  if (!m) memory.set(store, (m = new Map()));
  return m;
};

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return mem(store).get(key) as T | undefined;
  return run<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>);
}

export async function idbSet(store: StoreName, key: string, value: unknown): Promise<void> {
  const db = await open();
  if (!db) {
    mem(store).set(key, value);
    return;
  }
  await run(store, "readwrite", (s) => s.put(value, key));
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await open();
  if (!db) {
    mem(store).delete(key);
    return;
  }
  await run(store, "readwrite", (s) => s.delete(key));
}

export async function idbKeys(store: StoreName): Promise<string[]> {
  const db = await open();
  if (!db) return [...mem(store).keys()];
  return ((await run(store, "readonly", (s) => s.getAllKeys())) ?? []).map(String);
}
