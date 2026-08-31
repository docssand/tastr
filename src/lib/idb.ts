/**
 * Wrapper minimale su IndexedDB: la cache dei credits TMDB può arrivare a diversi
 * megabyte su librerie grandi, quindi non può stare in localStorage insieme all'import.
 */

const DB_NAME = "tastr";
const DB_VERSION = 3;

export const CREDITS_STORE = "credits";
export const LOOKUP_STORE = "lookups";
/** Risposte TMDB da cui nascono i suggerimenti: liste di candidati, non film già visti. */
export const HARVEST_STORE = "harvest";
/** Credits delle serie. Store separati da quelli dei film: TMDB numera film e serie in due sequenze indipendenti. */
export const SHOW_CREDITS_STORE = "showCredits";
export const SHOW_LOOKUP_STORE = "showLookups";

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
      if (!db.objectStoreNames.contains(HARVEST_STORE)) db.createObjectStore(HARVEST_STORE);
      if (!db.objectStoreNames.contains(SHOW_CREDITS_STORE)) db.createObjectStore(SHOW_CREDITS_STORE);
      if (!db.objectStoreNames.contains(SHOW_LOOKUP_STORE)) db.createObjectStore(SHOW_LOOKUP_STORE);
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
  const stores = [CREDITS_STORE, LOOKUP_STORE, HARVEST_STORE, SHOW_CREDITS_STORE, SHOW_LOOKUP_STORE];
  const tx = db.transaction(stores, "readwrite");
  stores.forEach((store) => tx.objectStore(store).clear());
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Pulizia IndexedDB fallita."));
  });
}

/**
 * Varianti tolleranti di lettura e scrittura: la cache è un'ottimizzazione, non un requisito.
 * Modalità privata, quota piena, storage bloccato dal browser si traducono in "nessuna cache"
 * invece che in un errore che ferma l'analisi.
 */
export async function idbGetManySafe<T>(storeName: string, keys: IDBValidKey[]): Promise<Map<IDBValidKey, T>> {
  if (!isIdbAvailable()) return new Map();
  try {
    return await idbGetMany<T>(storeName, keys);
  } catch {
    return new Map();
  }
}

export async function idbPutManySafe(storeName: string, entries: [IDBValidKey, unknown][]): Promise<void> {
  if (!isIdbAvailable() || entries.length === 0) return;
  try {
    await idbPutMany(storeName, entries);
  } catch {
    // Ignorato di proposito: vedi sopra.
  }
}
