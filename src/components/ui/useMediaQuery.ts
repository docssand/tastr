"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Segue una media query dal codice, per i casi in cui il layout cambia comportamento
 * e non solo aspetto: da mobile le schede sono un mazzo da trascinare, e il trascinamento
 * esiste in JavaScript, non in CSS.
 */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  // Sul server non esiste un viewport: si assume "non corrisponde" e si corregge all'idratazione.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
