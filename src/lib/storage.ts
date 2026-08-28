import type { ImportResult } from "@/lib/types";

const STORAGE_KEY = "tastr:import";

type Listener = () => void;

const listeners = new Set<Listener>();
let cached: ImportResult | null = null;
let loaded = false;

function readFromLocalStorage(): ImportResult | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImportResult;
  } catch {
    return null;
  }
}

export function saveImportResult(result: ImportResult) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  cached = result;
  loaded = true;
  listeners.forEach((listener) => listener());
}

export function clearImportResult() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  cached = null;
  loaded = true;
  listeners.forEach((listener) => listener());
}

export function subscribeImportResult(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getImportResultSnapshot(): ImportResult | null {
  if (!loaded) {
    cached = readFromLocalStorage();
    loaded = true;
  }
  return cached;
}

export function getImportResultServerSnapshot(): ImportResult | null {
  return null;
}
