import type { NormalizedEntry } from "@/lib/types";

/** Un film distinto della libreria, con le sue visioni accorpate. */
export interface WatchedMovie {
  key: string;
  tmdbId?: number;
  title: string;
  year?: number;
  /** Voto su scala 0-10; il più recente se il film è stato votato più volte. */
  rating?: number;
  /** Numero di visioni totali (1 = nessun rewatch). */
  plays: number;
  lastWatchedAt?: string;
}

interface MovieAccumulator extends WatchedMovie {
  ratedAt?: string;
}

export function normalizeTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Chiave di identità di un film. Le righe di uno stesso export possono riferirsi
 * allo stesso film con o senza tmdbId, quindi il fallback su titolo+anno è necessario.
 */
export function movieKey(movie: { tmdbId?: number; title: string; year?: number }) {
  if (movie.tmdbId) return `tmdb:${movie.tmdbId}`;
  return `title:${normalizeTitle(movie.title)}|${movie.year ?? ""}`;
}

/**
 * Gli importer ricavano il voto da una colonna CSV (`Number(row.Rating) * 2`), quindi una
 * cella non numerica produce NaN. Un solo NaN che arrivi all'analisi rende NaN la media
 * personale e da lì il punteggio di *ogni* persona, perché `Math.max(min, NaN)` è NaN:
 * la classifica intera collassa. Qui è l'unico imbuto in cui passano tutti gli import.
 */
function validRating(rating: number | undefined) {
  return Number.isFinite(rating) ? rating : undefined;
}

function isAfter(a: string | undefined, b: string | undefined) {
  if (!a) return false;
  if (!b) return true;
  return a > b;
}

/**
 * Riduce le righe dell'import (una per visione) all'elenco dei film distinti.
 * Senza questo passaggio una cronologia Trakt conterebbe ogni rewatch come film nuovo.
 */
export function collectMovies(entries: NormalizedEntry[]): WatchedMovie[] {
  const byKey = new Map<string, MovieAccumulator>();

  for (const entry of entries) {
    if (entry.mediaType !== "movie" || !entry.title) continue;

    const key = movieKey(entry);
    const plays = Number.isFinite(entry.plays) && entry.plays! > 0 ? entry.plays! : 1;
    const rating = validRating(entry.rating);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        key,
        tmdbId: entry.tmdbId,
        title: entry.title,
        year: entry.year,
        rating,
        ratedAt: rating !== undefined ? entry.watchedAt : undefined,
        plays,
        lastWatchedAt: entry.watchedAt,
      });
      continue;
    }

    existing.plays += plays;
    existing.tmdbId ??= entry.tmdbId;
    existing.year ??= entry.year;
    if (isAfter(entry.watchedAt, existing.lastWatchedAt)) existing.lastWatchedAt = entry.watchedAt;

    if (rating !== undefined && (existing.rating === undefined || isAfter(entry.watchedAt, existing.ratedAt))) {
      existing.rating = rating;
      existing.ratedAt = entry.watchedAt;
    }
  }

  return Array.from(byKey.values());
}
