import type { MovieCredits } from "@/lib/types";
import type { WatchedMovie } from "@/lib/analysis/movies";

export interface DecadeStat {
  decade: number;
  count: number;
  ratedCount: number;
  avgRating: number | null;
}

function decadeOf(year: number) {
  return Math.floor(year / 10) * 10;
}

export function releaseYearOf(movie: WatchedMovie, credits: Map<number, MovieCredits>): number | undefined {
  // Alcune sorgenti di import (es. Bingers) non includono l'anno di uscita: si ripiega
  // sulla release_date TMDB, disponibile solo dopo l'arricchimento dei credits.
  return movie.year ?? (movie.tmdbId ? credits.get(movie.tmdbId)?.year : undefined);
}

/** Film distinti per decennio d'uscita, con la media dei voti dati a quel decennio. */
export function decadeStats(movies: WatchedMovie[], credits: Map<number, MovieCredits>): DecadeStat[] {
  const byDecade = new Map<number, { count: number; ratingSum: number; ratedCount: number }>();

  for (const movie of movies) {
    const year = releaseYearOf(movie, credits);
    if (year === undefined) continue;
    const decade = decadeOf(year);
    const bucket = byDecade.get(decade) ?? { count: 0, ratingSum: 0, ratedCount: 0 };
    bucket.count += 1;
    if (typeof movie.rating === "number") {
      bucket.ratingSum += movie.rating;
      bucket.ratedCount += 1;
    }
    byDecade.set(decade, bucket);
  }

  return Array.from(byDecade.entries())
    .map(([decade, b]) => ({
      decade,
      count: b.count,
      ratedCount: b.ratedCount,
      avgRating: b.ratedCount > 0 ? b.ratingSum / b.ratedCount : null,
    }))
    .sort((a, b) => a.decade - b.decade);
}

export interface GenreStat {
  genre: string;
  count: number;
  ratedCount: number;
  avgRating: number | null;
}

/**
 * Film distinti per genere TMDB, con la media dei voti dati a quel genere.
 * Un film con più generi conta una volta per ciascuno: la somma dei conteggi supera il totale dei film.
 */
export function genreStats(movies: WatchedMovie[], credits: Map<number, MovieCredits>): GenreStat[] {
  const byGenre = new Map<string, { count: number; ratingSum: number; ratedCount: number }>();

  for (const movie of movies) {
    if (!movie.tmdbId) continue;
    const info = credits.get(movie.tmdbId);
    if (!info) continue;

    for (const genre of info.genres) {
      const bucket = byGenre.get(genre) ?? { count: 0, ratingSum: 0, ratedCount: 0 };
      bucket.count += 1;
      if (typeof movie.rating === "number") {
        bucket.ratingSum += movie.rating;
        bucket.ratedCount += 1;
      }
      byGenre.set(genre, bucket);
    }
  }

  return Array.from(byGenre.entries())
    .map(([genre, b]) => ({
      genre,
      count: b.count,
      ratedCount: b.ratedCount,
      avgRating: b.ratedCount > 0 ? b.ratingSum / b.ratedCount : null,
    }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
}

export interface DecadeComparison {
  decade: number;
  count: number;
  personalAvg: number;
  massAvg: number;
}

/**
 * Confronta, decennio per decennio, la tua media voti con la media pubblica TMDB.
 * Considera solo i film sia votati da te sia con un voto TMDB noto.
 */
export function compareByDecade(movies: WatchedMovie[], credits: Map<number, MovieCredits>): DecadeComparison[] {
  const byDecade = new Map<number, { personalSum: number; massSum: number; count: number }>();

  for (const movie of movies) {
    if (typeof movie.rating !== "number" || !movie.tmdbId) continue;
    const info = credits.get(movie.tmdbId);
    if (!info || typeof info.voteAverage !== "number") continue;
    const year = releaseYearOf(movie, credits);
    if (year === undefined) continue;

    const decade = decadeOf(year);
    const bucket = byDecade.get(decade) ?? { personalSum: 0, massSum: 0, count: 0 };
    bucket.personalSum += movie.rating;
    bucket.massSum += info.voteAverage;
    bucket.count += 1;
    byDecade.set(decade, bucket);
  }

  return Array.from(byDecade.entries())
    .map(([decade, b]) => ({
      decade,
      count: b.count,
      personalAvg: b.personalSum / b.count,
      massAvg: b.massSum / b.count,
    }))
    .sort((a, b) => a.decade - b.decade);
}

export interface GenreComparison {
  genre: string;
  count: number;
  personalAvg: number;
  massAvg: number;
}

/**
 * Confronta, genere per genere, la tua media voti con la media pubblica TMDB.
 * Come in genreStats, un film con più generi conta una volta per ciascuno.
 */
export function compareByGenre(movies: WatchedMovie[], credits: Map<number, MovieCredits>): GenreComparison[] {
  const byGenre = new Map<string, { personalSum: number; massSum: number; count: number }>();

  for (const movie of movies) {
    if (typeof movie.rating !== "number" || !movie.tmdbId) continue;
    const info = credits.get(movie.tmdbId);
    if (!info || typeof info.voteAverage !== "number") continue;

    for (const genre of info.genres) {
      const bucket = byGenre.get(genre) ?? { personalSum: 0, massSum: 0, count: 0 };
      bucket.personalSum += movie.rating;
      bucket.massSum += info.voteAverage;
      bucket.count += 1;
      byGenre.set(genre, bucket);
    }
  }

  return Array.from(byGenre.entries())
    .map(([genre, b]) => ({
      genre,
      count: b.count,
      personalAvg: b.personalSum / b.count,
      massAvg: b.massSum / b.count,
    }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
}

export interface ComparisonSummary {
  count: number;
  personalAvg: number;
  massAvg: number;
  delta: number;
}

/** Riepilogo complessivo del confronto, pesato per numero di film di ogni gruppo (decennio o genere). */
export function comparisonSummary(
  groups: Array<{ count: number; personalAvg: number; massAvg: number }>,
): ComparisonSummary | null {
  if (groups.length === 0) return null;

  let count = 0;
  let personalSum = 0;
  let massSum = 0;
  for (const g of groups) {
    count += g.count;
    personalSum += g.personalAvg * g.count;
    massSum += g.massAvg * g.count;
  }

  const personalAvg = personalSum / count;
  const massAvg = massSum / count;
  return { count, personalAvg, massAvg, delta: personalAvg - massAvg };
}
