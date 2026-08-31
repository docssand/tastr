"use client";

import { useEffect, useMemo, useState } from "react";
import { collectMovies, type WatchedMovie } from "@/lib/analysis/movies";
import {
  buildSeenIndex,
  buildTasteProfile,
  isRecentWatch,
  recentCutoff,
  type TasteProfile,
  type TasteScope,
} from "@/lib/analysis/taste";
import { rankBlindSpots, rankForYou, type Gap, type Recommendation } from "@/lib/analysis/recommendations";
import { harvestCandidates, type HarvestProgress, type HarvestResult } from "@/lib/enrich/candidates";
import { isFatalTmdbError } from "@/lib/tmdb";
import type { MovieCredits, NormalizedEntry } from "@/lib/types";

/** Lunghezza di ciascuna lista: dieci titoli, senza coda da scorrere. */
const LIST_LIMIT = 10;

export type SuggestionsStatus = "loading" | "insufficient" | "harvesting" | "ready" | "error";
export type SuggestionsErrorCode = "config" | "generic";

export function scopeKey(scope: TasteScope) {
  return scope.kind;
}

interface HarvestState {
  /** Raccolta a cui appartiene questo risultato: dati, periodo e numero di ricostruzione. */
  runId: string;
  result: HarvestResult;
}

export interface SuggestionsState {
  profile: TasteProfile;
  forYou: Recommendation[];
  blindSpots: Recommendation[];
  gaps: Gap[];
  status: SuggestionsStatus;
  progress: HarvestProgress | null;
  errorCode: SuggestionsErrorCode | null;
  /** Liste TMDB non arrivate: i suggerimenti restano validi ma più corti. */
  failed: number;
  /** Rifà la raccolta ignorando la cache locale; è anche il "riprova" degli errori. */
  refresh: () => void;
}

export interface UseSuggestionsInput {
  entries: NormalizedEntry[];
  /** Tutti i film della libreria, da `useMovieCredits`. */
  movies: WatchedMovie[];
  credits: Map<number, MovieCredits>;
  /** Vero quando la cache dei credits è stata letta: prima il profilo sarebbe vuoto. */
  creditsLoaded: boolean;
  scope: TasteScope;
}

/**
 * Trasforma la libreria in due liste di film da vedere.
 *
 * Il profilo si ricostruisce a ogni cambio di periodo (tutto lo storico o un solo anno),
 * mentre l'interrogazione a TMDB parte da sola: le risposte restano in cache locale per
 * due settimane, quindi riaprire la pagina o tornare su un anno già visto non costa nulla.
 */
export function useSuggestions({
  entries,
  movies,
  credits,
  creditsLoaded,
  scope,
}: UseSuggestionsInput): SuggestionsState {
  const [harvest, setHarvest] = useState<HarvestState | null>(null);
  const [error, setError] = useState<{ runId: string; code: SuggestionsErrorCode } | null>(null);
  const [progress, setProgress] = useState<HarvestProgress | null>(null);
  /** Cresce a ogni "ricostruisci": è ciò che fa ripartire l'effetto ignorando la cache. */
  const [request, setRequest] = useState({ token: 0, refresh: false });

  // Istante fissato al primo render: la recency non deve cambiare mentre si guarda la pagina.
  const now = useMemo(() => new Date(), []);

  const scoped = useMemo(() => {
    if (scope.kind === "all") return movies;
    const cutoff = recentCutoff(now);
    return collectMovies(entries.filter((entry) => isRecentWatch(entry.watchedAt, cutoff)));
  }, [entries, movies, scope, now]);

  const profile = useMemo(() => buildTasteProfile(scoped, credits, { scope, now }), [scoped, credits, scope, now]);
  // L'esclusione dei già visti guarda sempre tutta la libreria, anche quando il profilo è annuale.
  const seen = useMemo(() => buildSeenIndex(movies, credits), [movies, credits]);

  /** Identifica una raccolta: cambia con il periodo, con i dati disponibili e a ogni ricostruzione. */
  const runId = `${scopeKey(scope)}|${scoped.length}|${credits.size}|${request.token}`;
  const done = harvest?.runId === runId;
  const failedRun = error?.runId === runId;

  useEffect(() => {
    if (!creditsLoaded || !profile.usable || done || failedRun) return;

    const controller = new AbortController();
    let active = true;

    harvestCandidates(profile, seen, {
      signal: controller.signal,
      onProgress: (value) => {
        if (active) setProgress(value);
      },
      refresh: request.refresh,
      now,
    })
      .then((result) => {
        if (!active) return;
        setHarvest({ runId, result });
        setProgress(null);
        // La richiesta di ricostruzione è servita: le prossime raccolte tornano a usare la cache.
        setRequest((previous) => (previous.refresh ? { ...previous, refresh: false } : previous));
      })
      .catch((err: unknown) => {
        // L'annullamento arriva dalla pulizia dell'effetto: non è un errore da mostrare.
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return;
        setError({ runId, code: isFatalTmdbError(err) && err.status === 503 ? "config" : "generic" });
        setProgress(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [creditsLoaded, profile, seen, runId, done, failedRun, request.refresh, now]);

  const current = done ? harvest.result : null;

  const forYou = useMemo(() => (current ? rankForYou(current.candidates, profile, LIST_LIMIT) : []), [current, profile]);
  const blindSpots = useMemo(
    () => (current ? rankBlindSpots(current.candidates, profile, current.gaps, LIST_LIMIT) : []),
    [current, profile],
  );

  const status: SuggestionsStatus = !creditsLoaded
    ? "loading"
    : !profile.usable
      ? "insufficient"
      : failedRun
        ? "error"
        : current
          ? "ready"
          : "harvesting";

  return {
    profile,
    forYou,
    blindSpots,
    gaps: current?.gaps ?? [],
    status,
    progress,
    errorCode: failedRun ? error.code : null,
    failed: current?.failed ?? 0,
    refresh: () => setRequest((previous) => ({ token: previous.token + 1, refresh: true })),
  };
}
