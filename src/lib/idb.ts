/**
 * Wrapper minimale su IndexedDB: la cache dei credits TMDB può arrivare a diversi
 * megabyte su librerie grandi, quindi non può stare in localStorage insieme all'import.
 */

const DB_NAME = "tastr";
const DB_VERSION = 1;

export const CREDITS_STORE = "credits";
export const LOOKUP_STORE = "lookups";

let dbPromise: Promise<IDBDatabase> | null = null;

export function isIdbAvailable() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!isIdbAvailable()) {
    return Promise.reject(new Error("IndexedDB non disponibile in questo browser."));
  }
  if (dbPromise) return dbPromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CREDITS_STORE)) db.createObjectStore(CREDITS_STORE);
      if (!db.objectStoreNames.contains(LOOKUP_STORE)) db.createObjectStore(LOOKUP_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Apertura IndexedDB fallita."));
  }).catch((err: unknown) => {
    // Un'apertura fallita non deve avvelenare tutte le chiamate successive.
    dbPromise = null;
    throw err;
  });

  dbPromise = opening;
  return opening;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Operazione IndexedDB fallita."));
  });
}

export async function idbGetMany<T>(storeName: string, keys: IDBValidKey[]): Promise<Map<IDBValidKey, T>> {
  const found = new Map<IDBValidKey, T>();
  if (keys.length === 0) return found;

  const db = await openDb();
  const store = db.transaction(storeName, "readonly").objectStore(storeName);
  const results = await Promise.all(keys.map((key) => promisify<T | undefined>(store.get(key))));

  results.forEach((value, i) => {
    if (value !== undefined) found.set(keys[i], value);
  });
  return found;
}

export async function idbPutMany(storeName: string, entries: [IDBValidKey, unknown][]): Promise<void> {
  if (entries.length === 0) return;

  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  entries.forEach(([key, value]) => store.put(value, key));

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Scrittura IndexedDB fallita."));
    tx.onabort = () => reject(tx.error ?? new Error("Transazione IndexedDB annullata."));
  });
}

export async function idbClearAll(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([CREDITS_STORE, LOOKUP_STORE], "readwrite");
  tx.objectStore(CREDITS_STORE).clear();
  tx.objectStore(LOOKUP_STORE).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Pulizia IndexedDB fallita."));
  });
}
