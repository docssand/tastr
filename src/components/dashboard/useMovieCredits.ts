"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectMovies, type WatchedMovie } from "@/lib/analysis/movies";
import {
  enrichMovies,
  pendingMovies,
  readCachedCredits,
  type EnrichProgress,
} from "@/lib/enrich/credits";
import { isFatalTmdbError } from "@/lib/tmdb";
import type { MovieCredits, NormalizedEntry } from "@/lib/types";

export type CreditsStatus = "loading" | "ready" | "incomplete" | "enriching" | "error";
export type CreditsErrorCode = "config" | "generic";

const NO_CREDITS: Map<number, MovieCredits> = new Map();

interface CacheState {
  /** Elenco di film per cui questo risultato è valido: cambia a ogni nuovo import. */
  source: WatchedMovie[];
  credits: Map<number, MovieCredits>;
  pending: number;
}

/**
 * Espone i credits dei film dell'import corrente leggendo la cache locale,
 * con la possibilità di completarla su richiesta (percorso usato quando l'import
 * è stato fatto prima che l'arricchimento esistesse, o è stato interrotto).
 */
export function useMovieCredits(entries: NormalizedEntry[]) {
  const movies = useMemo(() => collectMovies(entries), [entries]);

  const [cache, setCache] = useState<CacheState | null>(null);
  const [phase, setPhase] = useState<"idle" | "enriching" | "error">("idle");
  const [progress, setProgress] = useState<EnrichProgress | null>(null);
  const [errorCode, setErrorCode] = useState<CreditsErrorCode | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;

    readCachedCredits(movies)
      .then((snapshot) => {
        if (!active) return;
        setCache({
          source: movies,
          credits: new Map(snapshot.credits),
          pending: pendingMovies(movies, snapshot).length,
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
  }, [movies]);

  // La cache appartiene a un import preciso: finché non è quella giusta, siamo in caricamento.
  const isCurrent = cache?.source === movies;
  const credits = isCurrent ? cache.credits : NO_CREDITS;
  const pendingCount = isCurrent ? cache.pending : 0;

  const status: CreditsStatus =
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
      const snapshot = await enrichMovies(movies, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      // I film che TMDB non conosce restano "pending" per sempre: non è un errore da segnalare.
      setCache({
        source: movies,
        credits: new Map(snapshot.credits),
        pending: pendingMovies(movies, snapshot).length,
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
  }, [movies, pendingCount]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { movies, credits, status, pendingCount, progress, errorCode, enrich, cancel };
}
