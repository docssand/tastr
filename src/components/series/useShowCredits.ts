"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectShows, type WatchedShow } from "@/lib/analysis/shows";
import {
  applyResolvedIds,
  enrichShows,
  pendingShows,
  readCachedShowCredits,
  type ShowEnrichProgress,
} from "@/lib/enrich/showCredits";
import { isFatalTmdbError } from "@/lib/tmdb";
import type { NormalizedEntry, ShowCredits } from "@/lib/types";

export type ShowCreditsStatus = "loading" | "ready" | "incomplete" | "enriching" | "error";
export type ShowCreditsErrorCode = "config" | "generic";

const NO_CREDITS: Map<number, ShowCredits> = new Map();
const NO_SHOWS: WatchedShow[] = [];

interface CacheState {
  /** Elenco di serie per cui questo risultato è valido: cambia a ogni nuovo import. */
  source: WatchedShow[];
  /** Le stesse serie, con l'id TMDB corretto da eventuali ricerche già in cache. */
  shows: WatchedShow[];
  credits: Map<number, ShowCredits>;
  pending: number;
}

/**
 * Espone i dati TMDB delle serie dell'import corrente leggendo la cache locale, con la
 * possibilità di completarla su richiesta. Gemello di `useMovieCredits`, su un'altra
 * sequenza di id e su un'altra risorsa TMDB.
 */
export function useShowCredits(entries: NormalizedEntry[]) {
  const collected = useMemo(() => collectShows(entries), [entries]);

  const [cache, setCache] = useState<CacheState | null>(null);
  const [phase, setPhase] = useState<"idle" | "enriching" | "error">("idle");
  const [progress, setProgress] = useState<ShowEnrichProgress | null>(null);
  const [errorCode, setErrorCode] = useState<ShowCreditsErrorCode | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;

    readCachedShowCredits(collected)
      .then((snapshot) => {
        if (!active) return;
        setCache({
          source: collected,
          shows: applyResolvedIds(collected, snapshot),
          credits: new Map(snapshot.credits),
          pending: pendingShows(collected, snapshot).length,
        });
        setPhase("idle");
        setErrorCode(null);
      })
      .catch(() => {
        if (!active) return;
        setErrorCode("generic");
        setPhase("error");
      });

    return () => {
      active = false;
      // Un import diverso rende inutile l'arricchimento in corso.
      abortRef.current?.abort();
    };
  }, [collected]);

  // La cache appartiene a un import preciso: finché non è quella giusta, siamo in caricamento.
  const isCurrent = cache?.source === collected;
  const shows = isCurrent ? cache.shows : NO_SHOWS;
  const credits = isCurrent ? cache.credits : NO_CREDITS;
  const pendingCount = isCurrent ? cache.pending : 0;

  const status: ShowCreditsStatus =
    phase === "enriching"
      ? "enriching"
      : phase === "error"
        ? "error"
        : !isCurrent
          ? "loading"
          : pendingCount > 0
            ? "incomplete"
            : "ready";

  const enrich = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("enriching");
    setErrorCode(null);
    setProgress({ done: 0, total: pendingCount });

    try {
      const snapshot = await enrichShows(collected, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      // Le serie che TMDB non conosce restano "pending" per sempre: non è un errore da segnalare.
      setCache({
        source: collected,
        shows: applyResolvedIds(collected, snapshot),
        credits: new Map(snapshot.credits),
        pending: pendingShows(collected, snapshot).length,
      });
      setPhase("idle");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setPhase("idle");
        return;
      }
      setErrorCode(isFatalTmdbError(err) && err.status === 503 ? "config" : "generic");
      setPhase("error");
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }, [collected, pendingCount]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { shows, credits, status, pendingCount, progress, errorCode, enrich, cancel };
}
