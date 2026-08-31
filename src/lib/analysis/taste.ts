import { normalizeTitle, type WatchedMovie } from "@/lib/analysis/movies";
import { personalMean, rankPeople, type PersonScore } from "@/lib/analysis/people";
import { releaseYearOf } from "@/lib/analysis/charts";
import { clamp, mean, pearson } from "@/lib/analysis/stats";
import type { MovieCredits } from "@/lib/types";

/**
 * Parametri del profilo di gusto: il ritratto da cui nascono i suggerimenti.
 *
 *   peso_film   = recency(ultima visione) · (1 + rewatchWeight · rewatch)
 *   quota       = Σ peso_film del gruppo / Σ peso_film totale
 *   scarto      = Σ (peso · (voto − media_personale)) / (Σ peso_votati + shrinkK)
 *   affinità    = clamp(scarto / affinityScale, −1, +1)
 *
 * La quota dice *quanto* guardi un genere o un decennio, l'affinità dice *quanto ti piace*:
 * sono due cose diverse e i suggerimenti hanno bisogno di entrambe. Un genere molto guardato
 * ma votato sotto la tua media non è un buon terreno di caccia.
 *
 * Il peso di recency è ciò che unisce storico totale e storico recente in un solo numero:
 * i film di quest'anno pesano il doppio di quelli di tre anni fa, ma il passato non sparisce.
 */
export const TASTE_TUNING = {
  /** Anni dopo i quali una visione vale metà di una di oggi. */
  recencyHalfLife: 3,
  /** Pavimento del peso di recency: nemmeno un film di quindici anni fa esce dal profilo. */
  recencyFloor: 0.3,
  /** Peso delle visioni senza data: né recenti né vecchie, sta in mezzo. */
  undatedWeight: 0.6,
  /** Quanto vale una visione ripetuta rispetto a un film nuovo. */
  rewatchWeight: 0.3,
  /** Voti "fantasma" alla media personale: impedisce a due film di definire un genere. */
  shrinkK: 4,
  /** Punti di scarto (dopo shrinkage) che valgono affinità massima. */
  affinityScale: 1.2,
  /** Sotto questo numero di film con credits il profilo non è affidabile. */
  minMoviesForProfile: 12,
  /** Ampiezza in anni della finestra "gusti recenti". */
  recentWindowYears: 3,
  /** Quanti film usare come seme delle raccomandazioni "simili a…". */
  seedCount: 6,
  /** Registi e attori di testa da cui pescare filmografie. */
  directorCount: 6,
  actorCount: 4,
  /**
   * Quanto ci si fida del voto pubblico, in funzione della correlazione fra i tuoi voti
   * e quelli TMDB: chi vota come la massa riceve suggerimenti guidati dal consenso,
   * chi la contraddice sistematicamente riceve un filtro di qualità più leggero.
   */
  crowdTrustFloor: 0.25,
  crowdTrustCeiling: 1,
} as const;

export interface GenreTaste {
  genre: string;
  /** Film distinti del genere. */
  count: number;
  /** Esposizione pesata per recency e rewatch. */
  weight: number;
  /** Quota di esposizione sul totale (i generi si sovrappongono: la somma supera 1). */
  share: number;
  /** Quota riscalata sul genere più visto: 1 = il tuo genere principale. */
  familiarity: number;
  avgRating: number | null;
  /** Scarto medio dalla media personale, dopo shrinkage. */
  delta: number;
  /** Scarto normalizzato a −1…+1: quanto ti piace il genere, non quanto lo guardi. */
  affinity: number;
}

export interface EraTaste {
  decade: number;
  count: number;
  weight: number;
  share: number;
  familiarity: number;
  avgRating: number | null;
  delta: number;
  affinity: number;
}

/** Film da cui chiedere a TMDB "altri film come questo". */
export interface SeedMovie {
  tmdbId: number;
  title: string;
  year?: number;
  rating?: number;
}

/** Ciò che hai già visto, in una forma pensata per escludere i candidati in O(1). */
export interface SeenIndex {
  tmdbIds: Set<number>;
  /** `titolo normalizzato|anno`: rete di sicurezza per i film importati senza id TMDB. */
  titles: Set<string>;
}

/**
 * Su quale parte dello storico costruire il profilo: tutta la libreria (con le visioni
 * recenti che pesano di più) oppure solo la finestra degli ultimi anni.
 */
export type TasteScope = { kind: "all" } | { kind: "recent" };

export interface TasteProfile {
  scope: TasteScope;
  /** Film distinti considerati nel profilo. */
  movieCount: number;
  /** Di questi, quanti hanno i dati TMDB: sotto una certa soglia il profilo è cieco. */
  creditedCount: number;
  ratedCount: number;
  personalMean: number | null;
  genres: GenreTaste[];
  eras: EraTaste[];
  directors: PersonScore[];
  actors: PersonScore[];
  seeds: SeedMovie[];
  /** Media dei tuoi voti meno la media TMDB sugli stessi film. */
  crowdDelta: number | null;
  /** Correlazione fra i tuoi voti e quelli pubblici, −1…+1. */
  crowdCorrelation: number | null;
  /** Quanto pesare il voto pubblico nei suggerimenti, 0…1, derivato dalla correlazione. */
  crowdTrust: number;
  /** Vero quando ci sono abbastanza film con credits per fidarsi del profilo. */
  usable: boolean;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function decadeOf(year: number) {
  return Math.floor(year / 10) * 10;
}

/**
 * Peso di una visione in base a quanto è recente: 1 oggi, `recencyFloor` in un passato remoto.
 * È il meccanismo con cui lo stesso profilo tiene dentro tutto lo storico ma somiglia
 * soprattutto a com'è il tuo gusto adesso.
 */
export function recencyWeight(lastWatchedAt: string | undefined, now: Date): number {
  if (!lastWatchedAt) return TASTE_TUNING.undatedWeight;
  const watched = Date.parse(lastWatchedAt);
  if (!Number.isFinite(watched)) return TASTE_TUNING.undatedWeight;

  const ageYears = Math.max(0, (now.getTime() - watched) / MS_PER_YEAR);
  const decay = 0.5 ** (ageYears / TASTE_TUNING.recencyHalfLife);
  return TASTE_TUNING.recencyFloor + (1 - TASTE_TUNING.recencyFloor) * decay;
}

/**
 * Data (YYYY-MM-DD) da cui inizia lo storico recente. Il confronto avviene fra date in
 * forma testuale perché le sorgenti di import scrivono sia "2024-03-12" sia una data ISO
 * completa: tagliare ai primi dieci caratteri le rende confrontabili senza parsing.
 */
export function recentCutoff(now: Date): string {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - TASTE_TUNING.recentWindowYears);
  return cutoff.toISOString().slice(0, 10);
}

/** Vero se la visione cade nella finestra recente. Senza data non si può dire: resta fuori. */
export function isRecentWatch(watchedAt: string | undefined, cutoff: string): boolean {
  return watchedAt !== undefined && watchedAt.slice(0, 10) >= cutoff;
}

function seenTitleKey(title: string, year: number | undefined) {
  return `${normalizeTitle(title)}|${year ?? ""}`;
}

/**
 * L'elenco di ciò che hai già visto. Va costruito sempre sullo storico *intero*, anche
 * quando il profilo guarda un solo anno: un film visto nel 2019 non è un suggerimento
 * valido solo perché stai analizzando il 2024.
 */
export function buildSeenIndex(movies: WatchedMovie[], credits: Map<number, MovieCredits>): SeenIndex {
  const index: SeenIndex = { tmdbIds: new Set(), titles: new Set() };

  for (const movie of movies) {
    if (movie.tmdbId) index.tmdbIds.add(movie.tmdbId);
    const year = releaseYearOf(movie, credits);
    index.titles.add(seenTitleKey(movie.title, year));
  }
  return index;
}

/**
 * Vero se il candidato è già nella tua libreria. Il confronto per titolo tollera uno
 * scarto di un anno: fra export e TMDB la stessa uscita può essere datata diversamente
 * (festival contro distribuzione), e un doppione fra i suggerimenti è peggio di un buco.
 */
export function isSeen(index: SeenIndex, candidate: { tmdbId: number; title: string; year?: number }): boolean {
  if (index.tmdbIds.has(candidate.tmdbId)) return true;
  if (candidate.year === undefined) return index.titles.has(seenTitleKey(candidate.title, undefined));

  for (const offset of [0, -1, 1]) {
    if (index.titles.has(seenTitleKey(candidate.title, candidate.year + offset))) return true;
  }
  return false;
}

interface Bucket {
  count: number;
  weight: number;
  ratedWeight: number;
  weightedDelta: number;
  ratingSum: number;
  ratedCount: number;
}

function emptyBucket(): Bucket {
  return { count: 0, weight: 0, ratedWeight: 0, weightedDelta: 0, ratingSum: 0, ratedCount: 0 };
}

function addToBucket(bucket: Bucket, weight: number, rating: number | undefined, personalAvg: number) {
  bucket.count += 1;
  bucket.weight += weight;
  if (typeof rating === "number") {
    bucket.ratedWeight += weight;
    bucket.weightedDelta += weight * (rating - personalAvg);
    bucket.ratingSum += rating;
    bucket.ratedCount += 1;
  }
}

function finishBucket(bucket: Bucket, totalWeight: number, maxWeight: number) {
  const delta = bucket.weightedDelta / (bucket.ratedWeight + TASTE_TUNING.shrinkK);
  return {
    count: bucket.count,
    weight: bucket.weight,
    share: totalWeight > 0 ? bucket.weight / totalWeight : 0,
    familiarity: maxWeight > 0 ? bucket.weight / maxWeight : 0,
    avgRating: bucket.ratedCount > 0 ? bucket.ratingSum / bucket.ratedCount : null,
    delta,
    affinity: clamp(delta / TASTE_TUNING.affinityScale, -1, 1),
  };
}

/** I film meglio votati (a parità, i più recenti) da usare come seme delle raccomandazioni. */
function pickSeeds(movies: WatchedMovie[], now: Date): SeedMovie[] {
  return movies
    .filter((movie) => movie.tmdbId !== undefined)
    .map((movie) => ({
      movie,
      // Senza voto resta la frequenza: un film rivisto tre volte dice comunque qualcosa.
      rank: (movie.rating ?? 0) + (movie.plays - 1) * 0.5,
      recency: recencyWeight(movie.lastWatchedAt, now),
    }))
    .sort((a, b) => b.rank - a.rank || b.recency - a.recency)
    .slice(0, TASTE_TUNING.seedCount)
    .map(({ movie }) => ({
      tmdbId: movie.tmdbId!,
      title: movie.title,
      year: movie.year,
      rating: movie.rating,
    }));
}

/**
 * Quanto pesare il voto pubblico nei suggerimenti, in funzione di quanto i tuoi voti gli
 * somigliano: la correlazione −1…+1 diventa una fiducia fra `crowdTrustFloor` e
 * `crowdTrustCeiling`. Senza correlazione nota (pochi voti, o voti tutti uguali) si tiene
 * il valore intermedio: nel dubbio la massa vale qualcosa, ma non decide.
 */
function crowdTrustFrom(correlation: number | null) {
  const { crowdTrustFloor: floor, crowdTrustCeiling: ceiling } = TASTE_TUNING;
  if (correlation === null) return (floor + ceiling) / 2;
  return clamp(floor + (ceiling - floor) * ((correlation + 1) / 2), floor, ceiling);
}

export interface TasteProfileOptions {
  scope?: TasteScope;
  /** Istante rispetto a cui calcolare la recency; iniettabile per i test. */
  now?: Date;
}

/**
 * Costruisce il profilo di gusto a partire dai film già visti.
 * `movies` è l'insieme su cui si vuole il ritratto: tutta la libreria, oppure i film
 * di un solo anno di visione (lo storico annuale richiesto dal selettore di periodo).
 */
export function buildTasteProfile(
  movies: WatchedMovie[],
  credits: Map<number, MovieCredits>,
  options: TasteProfileOptions = {},
): TasteProfile {
  const now = options.now ?? new Date();
  const scope = options.scope ?? { kind: "all" };
  const personalAvg = personalMean(movies);
  const baseline = personalAvg ?? 7;

  const genreBuckets = new Map<string, Bucket>();
  const eraBuckets = new Map<number, Bucket>();
  const crowdPairs: Array<[number, number]> = [];

  let totalGenreWeight = 0;
  let totalEraWeight = 0;
  let creditedCount = 0;
  let ratedCount = 0;

  for (const movie of movies) {
    const info = movie.tmdbId ? credits.get(movie.tmdbId) : undefined;
    if (info) creditedCount += 1;
    if (typeof movie.rating === "number") ratedCount += 1;

    const weight = recencyWeight(movie.lastWatchedAt, now) * (1 + TASTE_TUNING.rewatchWeight * Math.max(0, movie.plays - 1));

    for (const genre of info?.genres ?? []) {
      const bucket = genreBuckets.get(genre) ?? emptyBucket();
      addToBucket(bucket, weight, movie.rating, baseline);
      genreBuckets.set(genre, bucket);
      totalGenreWeight += weight;
    }

    const year = releaseYearOf(movie, credits);
    if (year !== undefined) {
      const decade = decadeOf(year);
      const bucket = eraBuckets.get(decade) ?? emptyBucket();
      addToBucket(bucket, weight, movie.rating, baseline);
      eraBuckets.set(decade, bucket);
      totalEraWeight += weight;
    }

    if (typeof movie.rating === "number" && typeof info?.voteAverage === "number") {
      crowdPairs.push([movie.rating, info.voteAverage]);
    }
  }

  const maxGenreWeight = Math.max(0, ...Array.from(genreBuckets.values(), (b) => b.weight));
  const maxEraWeight = Math.max(0, ...Array.from(eraBuckets.values(), (b) => b.weight));

  const genres: GenreTaste[] = Array.from(genreBuckets.entries())
    .map(([genre, bucket]) => ({ genre, ...finishBucket(bucket, totalGenreWeight, maxGenreWeight) }))
    .sort((a, b) => b.weight - a.weight || a.genre.localeCompare(b.genre));

  const eras: EraTaste[] = Array.from(eraBuckets.entries())
    .map(([decade, bucket]) => ({ decade, ...finishBucket(bucket, totalEraWeight, maxEraWeight) }))
    .sort((a, b) => a.decade - b.decade);

  const crowdCorrelation = pearson(crowdPairs);
  const crowdDelta = mean(crowdPairs.map(([mine, theirs]) => mine - theirs));

  return {
    scope,
    movieCount: movies.length,
    creditedCount,
    ratedCount,
    personalMean: personalAvg,
    genres,
    eras,
    directors: rankPeople(movies, credits, "director", TASTE_TUNING.directorCount),
    actors: rankPeople(movies, credits, "actor", TASTE_TUNING.actorCount),
    seeds: pickSeeds(movies, now),
    crowdDelta,
    crowdCorrelation,
    crowdTrust: crowdTrustFrom(crowdCorrelation),
    usable: creditedCount >= TASTE_TUNING.minMoviesForProfile,
  };
}
