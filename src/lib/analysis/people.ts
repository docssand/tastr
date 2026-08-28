import type { CreditPerson, MovieCredits } from "@/lib/types";
import type { WatchedMovie } from "@/lib/analysis/movies";

/**
 * Parametri del punteggio di affinità. Sono raccolti qui per essere tarati in un punto solo.
 *
 *   esposizione = Σ  peso_billing · (1 + rewatchWeight · rewatch)
 *   D           = Σ (peso_billing · (voto − media_personale)) / (Σ peso_billing_votati + shrinkK)
 *   qualità     = max(minQuality, 1 + D / qualityScale)
 *   score       = log₂(1 + esposizione) · qualità
 *
 * Il denominatore `+ shrinkK` è lo shrinkage bayesiano: è ciò che impedisce a un singolo
 * voto altissimo di battere molti voti sopra la media. Con shrinkK = 3 un solo 10 (media
 * personale 7) produce D = 3/4 = 0.75, mentre sei film a 8.5 producono D = 9/9 = 1.00.
 */
export const SCORING = {
  /** Voti "fantasma" alla media personale aggiunti a ogni persona: penalizza i campioni piccoli. */
  shrinkK: 3,
  /**
   * Punti di scarto medio (dopo shrinkage) che valgono +100% di qualità.
   * Più è basso, più la qualità pesa rispetto al numero di film: a 1.5 un regista
   * visto tantissimo ma votato nella media scavalcava i registi davvero amati.
   */
  qualityScale: 1,
  /** Quanto vale una visione ripetuta rispetto a un film nuovo. */
  rewatchWeight: 0.3,
  /** Pavimento del moltiplicatore: nemmeno un regista detestato azzera l'esposizione. */
  minQuality: 0.15,
  /** Decadimento del peso per posizione in locandina: w = 1 / (1 + order / billingDecay). */
  billingDecay: 4,
  /** Oltre questa posizione in locandina l'attore non viene conteggiato. */
  maxBillingOrder: 9,
  /** Media personale usata quando non esiste nessun voto. */
  fallbackMean: 7,
} as const;

export type PersonRole = "director" | "actor";

export interface PersonMovie {
  title: string;
  year?: number;
  rating?: number;
  plays: number;
}

export interface PersonScore {
  id: number;
  name: string;
  score: number;
  /** Σ dei pesi di esposizione: film distinti, pesati per billing e rewatch. */
  exposure: number;
  movieCount: number;
  ratedCount: number;
  rewatchCount: number;
  /** Media aritmetica dei voti dati ai film di questa persona (non pesata, per leggibilità). */
  averageRating: number | null;
  /** Scarto medio dalla media personale dopo lo shrinkage. */
  delta: number;
  quality: number;
  movies: PersonMovie[];
}

interface Aggregate {
  id: number;
  name: string;
  exposure: number;
  ratedWeight: number;
  weightedDelta: number;
  ratingSum: number;
  ratedCount: number;
  movieCount: number;
  rewatchCount: number;
  movies: PersonMovie[];
}

/** Media di tutti i voti dati, un voto per film. È la baseline contro cui si misura ogni persona. */
export function personalMean(movies: WatchedMovie[]): number | null {
  const rated = movies.filter((m) => typeof m.rating === "number");
  if (rated.length === 0) return null;
  return rated.reduce((sum, m) => sum + m.rating!, 0) / rated.length;
}

function billingWeight(role: PersonRole, order?: number) {
  if (role === "director" || order === undefined) return 1;
  return 1 / (1 + order / SCORING.billingDecay);
}

function peopleFor(role: PersonRole, credits: MovieCredits): CreditPerson[] {
  if (role === "director") return credits.directors;
  return credits.cast.filter((p) => (p.order ?? 0) <= SCORING.maxBillingOrder);
}

/** Quanti film hanno credits in cache: serve a dire all'utente se la classifica è completa. */
export function creditsCoverage(movies: WatchedMovie[], credits: Map<number, MovieCredits>) {
  let covered = 0;
  for (const movie of movies) {
    if (movie.tmdbId && credits.has(movie.tmdbId)) covered += 1;
  }
  return { covered, total: movies.length };
}

export function rankPeople(
  movies: WatchedMovie[],
  credits: Map<number, MovieCredits>,
  role: PersonRole,
  limit = 10,
): PersonScore[] {
  const mean = personalMean(movies) ?? SCORING.fallbackMean;
  const aggregates = new Map<number, Aggregate>();

  for (const movie of movies) {
    if (!movie.tmdbId) continue;
    const movieCredits = credits.get(movie.tmdbId);
    if (!movieCredits) continue;

    const rewatches = Math.max(0, movie.plays - 1);
    const seen = new Set<number>();

    for (const person of peopleFor(role, movieCredits)) {
      // Una persona può comparire due volte negli stessi credits (doppio ruolo, doppia mansione).
      if (seen.has(person.id)) continue;
      seen.add(person.id);

      let aggregate = aggregates.get(person.id);
      if (!aggregate) {
        aggregate = {
          id: person.id,
          name: person.name,
          exposure: 0,
          ratedWeight: 0,
          weightedDelta: 0,
          ratingSum: 0,
          ratedCount: 0,
          movieCount: 0,
          rewatchCount: 0,
          movies: [],
        };
        aggregates.set(person.id, aggregate);
      }

      const weight = billingWeight(role, person.order);
      aggregate.exposure += weight * (1 + SCORING.rewatchWeight * rewatches);
      aggregate.movieCount += 1;
      aggregate.rewatchCount += rewatches;
      aggregate.movies.push({
        title: movie.title,
        year: movie.year,
        rating: movie.rating,
        plays: movie.plays,
      });

      if (typeof movie.rating === "number") {
        // Il rewatch alza l'esposizione, non la fiducia nel voto: qui pesa solo il billing.
        aggregate.ratedWeight += weight;
        aggregate.weightedDelta += weight * (movie.rating - mean);
        aggregate.ratingSum += movie.rating;
        aggregate.ratedCount += 1;
      }
    }
  }

  const scored = Array.from(aggregates.values()).map<PersonScore>((a) => {
    const delta = a.weightedDelta / (a.ratedWeight + SCORING.shrinkK);
    const quality = Math.max(SCORING.minQuality, 1 + delta / SCORING.qualityScale);
    return {
      id: a.id,
      name: a.name,
      score: Math.log2(1 + a.exposure) * quality,
      exposure: a.exposure,
      movieCount: a.movieCount,
      ratedCount: a.ratedCount,
      rewatchCount: a.rewatchCount,
      averageRating: a.ratedCount > 0 ? a.ratingSum / a.ratedCount : null,
      delta,
      quality,
      movies: a.movies.sort((x, y) => (y.rating ?? -1) - (x.rating ?? -1)),
    };
  });

  return scored
    .sort((a, b) => b.score - a.score || b.movieCount - a.movieCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}
