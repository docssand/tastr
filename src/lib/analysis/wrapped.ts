import { collectMovies, type WatchedMovie } from "@/lib/analysis/movies";
import { releaseYearOf } from "@/lib/analysis/charts";
import { mean, pearson, rescale } from "@/lib/analysis/stats";
import type { MovieCredits, NormalizedEntry } from "@/lib/types";

/**
 * Soglie delle schede Wrapped, raccolte qui per essere tarate in un punto solo.
 *
 * Ogni scheda produce un aggettivo, non un numero: il valore di queste costanti decide
 * dove passa il confine fra un aggettivo e l'altro. I minimi `min*` sono la difesa contro
 * il verdetto tirato a caso: sotto quella soglia la scheda dichiara di non sapere invece
 * di etichettare un utente in base a tre film.
 */
export const WRAPPED_TUNING = {
  /** Anni dall'uscita oltre i quali un film è "vecchio" nell'anno in cui l'hai visto. */
  oldAge: 10,

  /** Scarto minimo fra la media sui vecchi e quella sui recenti perché il gusto sia sbilanciato. */
  ratingGap: 0.4,
  minPerRatingBucket: 3,

  minDatedMovies: 5,
  recentShareHigh: 0.6,
  recentShareLow: 0.35,

  /** Quanti generi di testa formano la quota di concentrazione. */
  topGenres: 3,
  minGenreMovies: 5,
  minDirectorMovies: 5,
  /** Estremi entro cui la quota dei generi di testa viene riscalata a punti di concentrazione 0-1. */
  topGenresShareLow: 0.45,
  topGenresShareHigh: 0.6,
  /** Come sopra, per la quota di film di registi già visti nell'anno. */
  repeatDirectorLow: 0.1,
  repeatDirectorHigh: 0.3,
  genreWeight: 0.6,
  directorWeight: 0.4,
  focusHigh: 0.66,
  focusLow: 0.33,

  minCrowdMovies: 8,
  crowdHigh: 0.5,
  crowdLow: 0.15,

  minRatedMovies: 5,
  ratedShareHigh: 0.8,
  ratedShareLow: 0.35,

  minViewings: 8,
  /** Quota di mesi attivi sopra la quale la visione è regolare. */
  activeShareHigh: 0.75,
  activeShareLow: 0.42,
  /** Quota di visioni concentrate nel mese di punta. */
  peakShareHigh: 0.35,
  peakShareMetronome: 0.3,

  minRewatchViewings: 5,
  rewatchShareHigh: 0.25,
  rewatchShareLow: 0.08,
} as const;

export type WrappedCardId =
  | "rating"
  | "watching"
  | "focus"
  | "crowd"
  | "genres"
  | "reviewer"
  | "rhythm"
  | "rewatch";

export type TraitKey =
  // come voti: film vecchi vs recenti
  | "nostalgic"
  | "modern"
  | "gourmet"
  // cosa guardi
  | "current"
  | "archivist"
  | "omnivore"
  // quanto scavi in generi e registi
  | "specialist"
  | "curator"
  | "wanderer"
  // quanto vai d'accordo con la massa
  | "conformist"
  | "independent"
  | "contrarian"
  // quanto voti ciò che vedi
  | "reviewer"
  | "selective"
  | "lurker"
  // come distribuisci le visioni nell'anno
  | "metronome"
  | "tidal"
  | "marathoner"
  // quanto rivedi
  | "ritualist"
  | "loyalist"
  | "pioneer";

export type AnimalKey =
  | "hawk"
  | "panther"
  | "mustang"
  | "dragon"
  | "monkey"
  | "eagle"
  | "raven"
  | "wolf"
  | "bat"
  | "fox"
  | "owl"
  | "swan"
  | "deer"
  | "otter"
  | "elephant"
  | "octopus"
  | "dolphin"
  | "chameleon"
  | "meerkat"
  | "raccoon"
  | "tortoise";

export type ArchetypeKey =
  | "keeper"
  | "scholar"
  | "cultist"
  | "classicist"
  | "cinephile"
  | "heretic"
  | "explorer"
  | "nomad"
  | "maverick"
  | "newcomer";

export type MetricKey =
  | "oldAvg"
  | "recentAvg"
  | "ratingGap"
  | "recentShare"
  | "oldShare"
  | "medianAge"
  | "topGenresShare"
  | "repeatDirectorShare"
  | "distinctGenres"
  | "crowdCorrelation"
  | "crowdDelta"
  | "comparedCount"
  | "topGenre"
  | "secondGenre"
  | "topGenreCount"
  | "ratedShare"
  | "ratedCount"
  | "avgRating"
  | "viewings"
  | "activeMonths"
  | "peakMonthShare"
  | "rewatchShare"
  | "rewatchCount"
  | "mostRewatched";

/** Come il componente deve formattare il valore: l'analisi resta indipendente dalla lingua. */
export type MetricFormat = "count" | "rating" | "percent" | "delta" | "score" | "text";

export interface WrappedMetric {
  key: MetricKey;
  format: MetricFormat;
  /** Valore numerico; ignorato dai formati testuali. */
  value: number;
  /** Testo già pronto (titoli, nomi di genere): non è traducibile, viene da TMDB. */
  text?: string;
}

/**
 * L'aggettivo assegnato alla scheda. Il `kind` dice in quale sezione del dizionario
 * cercare la chiave: la scheda sui generi premia con un animale, le altre con un tratto.
 */
export type WrappedVerdict = { kind: "trait"; key: TraitKey } | { kind: "animal"; key: AnimalKey };

export interface WrappedCard {
  id: WrappedCardId;
  /** `null` quando l'anno non ha abbastanza dati per esprimere un giudizio. */
  verdict: WrappedVerdict | null;
  /** Vero quando il verdetto manca solo perché i credits TMDB non sono ancora stati scaricati. */
  needsCredits: boolean;
  metrics: WrappedMetric[];
}

export interface WrappedSummary {
  archetype: ArchetypeKey;
  /** Film distinti visti nell'anno. */
  movieCount: number;
  /** Visioni totali: i rewatch dell'anno contano una volta ciascuno. */
  viewingCount: number;
  ratedCount: number;
  averageRating: number | null;
  topGenre: string | null;
  topDirector: string | null;
  /** Titolo con il voto più alto dell'anno, a parità il più rivisto. */
  favouriteMovie: string | null;
}

export interface WrappedReport {
  year: number;
  movies: WatchedMovie[];
  cards: WrappedCard[];
  summary: WrappedSummary;
}

/** "2024-07-03T21:10:00Z" → 2024. Tutte le sorgenti scrivono una data che inizia con YYYY-MM. */
const WATCHED_AT = /^(\d{4})-(\d{2})/;

export function watchYearOf(watchedAt: string | undefined): number | undefined {
  if (!watchedAt) return undefined;
  const match = WATCHED_AT.exec(watchedAt);
  return match ? Number(match[1]) : undefined;
}

/** Mese 0-11, per la distribuzione delle visioni nell'anno. */
function watchMonthOf(watchedAt: string | undefined): number | undefined {
  if (!watchedAt) return undefined;
  const match = WATCHED_AT.exec(watchedAt);
  if (!match) return undefined;
  const month = Number(match[2]) - 1;
  return month >= 0 && month <= 11 ? month : undefined;
}

/** Anni in cui l'utente ha visto almeno un film, dal più recente. Le righe senza data non hanno anno. */
export function watchYears(entries: NormalizedEntry[]): number[] {
  const years = new Set<number>();
  for (const entry of entries) {
    if (entry.mediaType !== "movie" || !entry.title) continue;
    const year = watchYearOf(entry.watchedAt);
    if (year !== undefined) years.add(year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

function entriesForYear(entries: NormalizedEntry[], year: number): NormalizedEntry[] {
  return entries.filter((entry) => watchYearOf(entry.watchedAt) === year);
}

function playsOf(entry: NormalizedEntry) {
  return Number.isFinite(entry.plays) && entry.plays! > 0 ? entry.plays! : 1;
}

function metric(key: MetricKey, value: number, format: Exclude<MetricFormat, "text">): WrappedMetric {
  return { key, value, format };
}

function textMetric(key: MetricKey, text: string): WrappedMetric {
  return { key, value: 0, format: "text", text };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function creditsOf(movie: WatchedMovie, credits: Map<number, MovieCredits>) {
  return movie.tmdbId ? credits.get(movie.tmdbId) : undefined;
}

/** Vero se almeno un film dell'anno aspetta ancora i dati TMDB: distingue "manca l'analisi" da "mancano i film". */
function awaitingCredits(movies: WatchedMovie[], credits: Map<number, MovieCredits>) {
  return movies.some((movie) => movie.tmdbId !== undefined && !credits.has(movie.tmdbId));
}

function emptyCard(id: WrappedCardId, metrics: WrappedMetric[] = [], needsCredits = false): WrappedCard {
  return { id, verdict: null, needsCredits, metrics };
}

function traitCard(id: WrappedCardId, key: TraitKey, metrics: WrappedMetric[]): WrappedCard {
  return { id, verdict: { kind: "trait", key }, needsCredits: false, metrics };
}

// --- scheda 1: come voti i film vecchi rispetto ai recenti ------------------------------------

function ratingCard(movies: WatchedMovie[], credits: Map<number, MovieCredits>, year: number): WrappedCard {
  const old: number[] = [];
  const recent: number[] = [];

  for (const movie of movies) {
    if (typeof movie.rating !== "number") continue;
    const released = releaseYearOf(movie, credits);
    if (released === undefined) continue;
    (year - released >= WRAPPED_TUNING.oldAge ? old : recent).push(movie.rating);
  }

  const oldAvg = mean(old);
  const recentAvg = mean(recent);
  const metrics: WrappedMetric[] = [];
  if (oldAvg !== null) metrics.push(metric("oldAvg", oldAvg, "rating"));
  if (recentAvg !== null) metrics.push(metric("recentAvg", recentAvg, "rating"));

  const enough =
    old.length >= WRAPPED_TUNING.minPerRatingBucket && recent.length >= WRAPPED_TUNING.minPerRatingBucket;
  if (!enough || oldAvg === null || recentAvg === null) {
    // Senza voti su entrambi i lati non c'è nessun confronto da fare, solo un'etichetta inventata.
    return emptyCard("rating", metrics, awaitingCredits(movies, credits));
  }

  const gap = oldAvg - recentAvg;
  metrics.push(metric("ratingGap", gap, "delta"));

  const key: TraitKey =
    Math.abs(gap) < WRAPPED_TUNING.ratingGap ? "gourmet" : gap > 0 ? "nostalgic" : "modern";
  return traitCard("rating", key, metrics);
}

// --- scheda 2: cosa guardi, novità o catalogo ------------------------------------------------

function watchingCard(movies: WatchedMovie[], credits: Map<number, MovieCredits>, year: number): WrappedCard {
  const ages: number[] = [];
  for (const movie of movies) {
    const released = releaseYearOf(movie, credits);
    if (released !== undefined) ages.push(year - released);
  }

  if (ages.length < WRAPPED_TUNING.minDatedMovies) {
    return emptyCard("watching", [], awaitingCredits(movies, credits));
  }

  const oldCount = ages.filter((age) => age >= WRAPPED_TUNING.oldAge).length;
  const oldShare = oldCount / ages.length;
  const recentShare = 1 - oldShare;

  const metrics: WrappedMetric[] = [
    metric("recentShare", recentShare, "percent"),
    metric("oldShare", oldShare, "percent"),
    metric("medianAge", median(ages) ?? 0, "count"),
  ];

  const key: TraitKey =
    recentShare >= WRAPPED_TUNING.recentShareHigh
      ? "current"
      : recentShare <= WRAPPED_TUNING.recentShareLow
        ? "archivist"
        : "omnivore";
  return traitCard("watching", key, metrics);
}

// --- scheda 3: quanto scavi negli stessi generi e registi -------------------------------------

function focusCard(movies: WatchedMovie[], credits: Map<number, MovieCredits>): WrappedCard {
  const genreCounts = new Map<string, number>();
  let genreAssignments = 0;
  let moviesWithGenres = 0;

  const directorFilms = new Map<number, number>();
  const movieDirectors: number[][] = [];

  for (const movie of movies) {
    const info = creditsOf(movie, credits);
    if (!info) continue;

    if (info.genres.length > 0) {
      moviesWithGenres += 1;
      for (const genre of info.genres) {
        genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
        genreAssignments += 1;
      }
    }

    if (info.directors.length > 0) {
      const ids = Array.from(new Set(info.directors.map((d) => d.id)));
      movieDirectors.push(ids);
      for (const id of ids) directorFilms.set(id, (directorFilms.get(id) ?? 0) + 1);
    }
  }

  const metrics: WrappedMetric[] = [];
  /** Coppie punteggio-peso: si media solo su ciò che i dati permettono davvero di misurare. */
  const signals: Array<[points: number, weight: number]> = [];

  if (moviesWithGenres >= WRAPPED_TUNING.minGenreMovies && genreAssignments > 0) {
    const topShare =
      Array.from(genreCounts.values())
        .sort((a, b) => b - a)
        .slice(0, WRAPPED_TUNING.topGenres)
        .reduce((sum, count) => sum + count, 0) / genreAssignments;
    metrics.push(metric("topGenresShare", topShare, "percent"));
    metrics.push(metric("distinctGenres", genreCounts.size, "count"));
    signals.push([
      rescale(topShare, WRAPPED_TUNING.topGenresShareLow, WRAPPED_TUNING.topGenresShareHigh),
      WRAPPED_TUNING.genreWeight,
    ]);
  }

  if (movieDirectors.length >= WRAPPED_TUNING.minDirectorMovies) {
    // Un film conta come "approfondimento" se almeno uno dei suoi registi torna nell'anno.
    const repeats = movieDirectors.filter((ids) => ids.some((id) => (directorFilms.get(id) ?? 0) > 1)).length;
    const repeatShare = repeats / movieDirectors.length;
    metrics.push(metric("repeatDirectorShare", repeatShare, "percent"));
    signals.push([
      rescale(repeatShare, WRAPPED_TUNING.repeatDirectorLow, WRAPPED_TUNING.repeatDirectorHigh),
      WRAPPED_TUNING.directorWeight,
    ]);
  }

  if (signals.length === 0) return emptyCard("focus", metrics, true);

  const totalWeight = signals.reduce((sum, [, weight]) => sum + weight, 0);
  const score = signals.reduce((sum, [points, weight]) => sum + points * weight, 0) / totalWeight;

  const key: TraitKey =
    score >= WRAPPED_TUNING.focusHigh ? "specialist" : score <= WRAPPED_TUNING.focusLow ? "wanderer" : "curator";
  return traitCard("focus", key, metrics);
}

// --- scheda 4: quanto vai d'accordo con la massa ----------------------------------------------

function crowdCard(movies: WatchedMovie[], credits: Map<number, MovieCredits>): WrappedCard {
  const pairs: Array<[number, number]> = [];
  for (const movie of movies) {
    if (typeof movie.rating !== "number") continue;
    const info = creditsOf(movie, credits);
    if (!info || typeof info.voteAverage !== "number") continue;
    pairs.push([movie.rating, info.voteAverage]);
  }

  if (pairs.length < WRAPPED_TUNING.minCrowdMovies) return emptyCard("crowd", [], true);

  const correlation = pearson(pairs);
  const delta = mean(pairs.map(([mine, theirs]) => mine - theirs)) ?? 0;
  const metrics: WrappedMetric[] = [
    metric("crowdDelta", delta, "delta"),
    metric("comparedCount", pairs.length, "count"),
  ];

  // Voti tutti identici: non c'è modo di dire se sei d'accordo sulla classifica, solo sul livello.
  if (correlation === null) return emptyCard("crowd", metrics);

  metrics.unshift(metric("crowdCorrelation", correlation, "score"));

  const key: TraitKey =
    correlation >= WRAPPED_TUNING.crowdHigh
      ? "conformist"
      : correlation <= WRAPPED_TUNING.crowdLow
        ? "contrarian"
        : "independent";
  return traitCard("crowd", key, metrics);
}

// --- scheda 5: i due generi di testa, e l'animale che ne esce ----------------------------------

type FamilyKey = "adrenaline" | "dark" | "heart" | "wonder" | "light" | "real";

/**
 * I 19 generi TMDB raccolti in sei famiglie. Le coppie di generi possibili sono 171:
 * troppe per una tabella scritta a mano, mentre le coppie di famiglie sono 21 e si coprono tutte.
 */
const GENRE_FAMILY: Record<string, FamilyKey> = {
  Action: "adrenaline",
  Adventure: "adrenaline",
  Thriller: "adrenaline",
  War: "adrenaline",
  Western: "adrenaline",
  Horror: "dark",
  Crime: "dark",
  Mystery: "dark",
  Romance: "heart",
  Drama: "heart",
  Music: "heart",
  Fantasy: "wonder",
  "Science Fiction": "wonder",
  Animation: "wonder",
  Comedy: "light",
  Family: "light",
  "TV Movie": "light",
  Documentary: "real",
  History: "real",
};

/** L'ordine rende canonica la chiave della coppia: (light, dark) e (dark, light) danno lo stesso animale. */
const FAMILY_ORDER: FamilyKey[] = ["adrenaline", "dark", "heart", "wonder", "light", "real"];

const ANIMAL_BY_FAMILIES: Record<string, AnimalKey> = {
  "adrenaline+adrenaline": "hawk",
  "adrenaline+dark": "panther",
  "adrenaline+heart": "mustang",
  "adrenaline+wonder": "dragon",
  "adrenaline+light": "monkey",
  "adrenaline+real": "eagle",
  "dark+dark": "raven",
  "dark+heart": "wolf",
  "dark+wonder": "bat",
  "dark+light": "fox",
  "dark+real": "owl",
  "heart+heart": "swan",
  "heart+wonder": "deer",
  "heart+light": "otter",
  "heart+real": "elephant",
  "wonder+wonder": "octopus",
  "wonder+light": "dolphin",
  "wonder+real": "chameleon",
  "light+light": "meerkat",
  "light+real": "raccoon",
  "real+real": "tortoise",
};

export function animalForGenres(first: string, second: string): AnimalKey | null {
  // Un genere fuori dalla lista TMDB nota non ha famiglia: si ripiega su quella dell'altro,
  // così la coppia resta valida invece di far sparire la scheda.
  const a = GENRE_FAMILY[first] ?? GENRE_FAMILY[second];
  const b = GENRE_FAMILY[second] ?? GENRE_FAMILY[first];
  if (!a || !b) return null;

  const [low, high] = [a, b].sort((x, y) => FAMILY_ORDER.indexOf(x) - FAMILY_ORDER.indexOf(y));
  return ANIMAL_BY_FAMILIES[`${low}+${high}`] ?? null;
}

interface GenreTally {
  genre: string;
  count: number;
  ratingSum: number;
  ratedCount: number;
}

/** Generi dell'anno, dal più visto. A parità di film vince quello che hai votato meglio. */
function yearGenres(movies: WatchedMovie[], credits: Map<number, MovieCredits>): GenreTally[] {
  const byGenre = new Map<string, GenreTally>();

  for (const movie of movies) {
    const info = creditsOf(movie, credits);
    if (!info) continue;
    for (const genre of info.genres) {
      const tally = byGenre.get(genre) ?? { genre, count: 0, ratingSum: 0, ratedCount: 0 };
      tally.count += 1;
      if (typeof movie.rating === "number") {
        tally.ratingSum += movie.rating;
        tally.ratedCount += 1;
      }
      byGenre.set(genre, tally);
    }
  }

  const avg = (t: GenreTally) => (t.ratedCount > 0 ? t.ratingSum / t.ratedCount : 0);
  return Array.from(byGenre.values()).sort(
    (a, b) => b.count - a.count || avg(b) - avg(a) || a.genre.localeCompare(b.genre),
  );
}

function genresCard(movies: WatchedMovie[], genres: GenreTally[], credits: Map<number, MovieCredits>): WrappedCard {
  const withGenres = movies.filter((movie) => (creditsOf(movie, credits)?.genres.length ?? 0) > 0).length;
  if (genres.length < 2 || withGenres < WRAPPED_TUNING.minGenreMovies) return emptyCard("genres", [], true);

  const [first, second] = genres;
  const animal = animalForGenres(first.genre, second.genre);
  const metrics: WrappedMetric[] = [
    textMetric("topGenre", first.genre),
    textMetric("secondGenre", second.genre),
    metric("topGenreCount", first.count, "count"),
  ];

  if (!animal) return emptyCard("genres", metrics);
  return { id: "genres", verdict: { kind: "animal", key: animal }, needsCredits: false, metrics };
}

// --- scheda 6: voti quello che vedi, o guardi e basta ------------------------------------------

function reviewerCard(movies: WatchedMovie[]): WrappedCard {
  if (movies.length < WRAPPED_TUNING.minRatedMovies) return emptyCard("reviewer");

  const ratings = movies.map((m) => m.rating).filter((r): r is number => typeof r === "number");
  const ratedShare = ratings.length / movies.length;
  const metrics: WrappedMetric[] = [
    metric("ratedShare", ratedShare, "percent"),
    metric("ratedCount", ratings.length, "count"),
  ];
  const average = mean(ratings);
  if (average !== null) metrics.push(metric("avgRating", average, "rating"));

  const key: TraitKey =
    ratedShare >= WRAPPED_TUNING.ratedShareHigh
      ? "reviewer"
      : ratedShare >= WRAPPED_TUNING.ratedShareLow
        ? "selective"
        : "lurker";
  return traitCard("reviewer", key, metrics);
}

// --- scheda 7: come distribuisci le visioni nell'anno ------------------------------------------

/**
 * Mesi già trascorsi dell'anno: per l'anno in corso il denominatore è il mese corrente,
 * altrimenti un anno appena iniziato risulterebbe sempre discontinuo.
 */
function monthsElapsed(year: number, now: Date) {
  if (year > now.getFullYear()) return 12;
  return year === now.getFullYear() ? now.getMonth() + 1 : 12;
}

function rhythmCard(entries: NormalizedEntry[], year: number, now: Date): WrappedCard {
  const perMonth = new Array<number>(12).fill(0);
  let viewings = 0;

  for (const entry of entries) {
    if (entry.mediaType !== "movie" || !entry.title) continue;
    const month = watchMonthOf(entry.watchedAt);
    if (month === undefined) continue;
    const plays = playsOf(entry);
    perMonth[month] += plays;
    viewings += plays;
  }

  if (viewings < WRAPPED_TUNING.minViewings) return emptyCard("rhythm");

  const elapsed = monthsElapsed(year, now);
  const activeMonths = perMonth.slice(0, elapsed).filter((count) => count > 0).length;
  const activeShare = activeMonths / elapsed;
  const peakShare = Math.max(...perMonth) / viewings;

  const metrics: WrappedMetric[] = [
    metric("viewings", viewings, "count"),
    metric("activeMonths", activeMonths, "count"),
    metric("peakMonthShare", peakShare, "percent"),
  ];

  const key: TraitKey =
    activeShare >= WRAPPED_TUNING.activeShareHigh && peakShare <= WRAPPED_TUNING.peakShareMetronome
      ? "metronome"
      : peakShare >= WRAPPED_TUNING.peakShareHigh || activeShare <= WRAPPED_TUNING.activeShareLow
        ? "marathoner"
        : "tidal";
  return traitCard("rhythm", key, metrics);
}

// --- scheda 8: quanto rivedi ciò che hai già visto ----------------------------------------------

function rewatchCard(movies: WatchedMovie[]): WrappedCard {
  const viewings = movies.reduce((sum, movie) => sum + movie.plays, 0);
  if (viewings < WRAPPED_TUNING.minRewatchViewings) return emptyCard("rewatch");

  const repeats = viewings - movies.length;
  const rewatchShare = repeats / viewings;
  const metrics: WrappedMetric[] = [
    metric("rewatchShare", rewatchShare, "percent"),
    metric("rewatchCount", repeats, "count"),
  ];

  const mostRewatched = movies.reduce<WatchedMovie | null>(
    (best, movie) => (movie.plays > 1 && (!best || movie.plays > best.plays) ? movie : best),
    null,
  );
  if (mostRewatched) metrics.push(textMetric("mostRewatched", mostRewatched.title));

  const key: TraitKey =
    rewatchShare >= WRAPPED_TUNING.rewatchShareHigh
      ? "ritualist"
      : rewatchShare >= WRAPPED_TUNING.rewatchShareLow
        ? "loyalist"
        : "pioneer";
  return traitCard("rewatch", key, metrics);
}

// --- scheda finale ------------------------------------------------------------------------------

/**
 * L'archetipo incrocia i due assi che dicono di più sul profilo: quanto scavi (scheda 3)
 * e quanto sei d'accordo con la massa (scheda 4). Se uno dei due manca non c'è abbastanza
 * materiale per un titolo, e l'anno resta quello di un esordiente.
 */
const ARCHETYPES: Record<string, ArchetypeKey> = {
  "specialist+conformist": "keeper",
  "specialist+independent": "scholar",
  "specialist+contrarian": "cultist",
  "curator+conformist": "classicist",
  "curator+independent": "cinephile",
  "curator+contrarian": "heretic",
  "wanderer+conformist": "explorer",
  "wanderer+independent": "nomad",
  "wanderer+contrarian": "maverick",
};

function traitOf(card: WrappedCard | undefined): TraitKey | null {
  return card?.verdict?.kind === "trait" ? card.verdict.key : null;
}

function topDirectorName(movies: WatchedMovie[], credits: Map<number, MovieCredits>): string | null {
  const byDirector = new Map<number, { name: string; count: number }>();

  for (const movie of movies) {
    const info = creditsOf(movie, credits);
    if (!info) continue;
    for (const id of new Set(info.directors.map((d) => d.id))) {
      const director = info.directors.find((d) => d.id === id)!;
      const tally = byDirector.get(id) ?? { name: director.name, count: 0 };
      tally.count += 1;
      byDirector.set(id, tally);
    }
  }

  const ranked = Array.from(byDirector.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  return ranked[0]?.name ?? null;
}

function favouriteMovieTitle(movies: WatchedMovie[]): string | null {
  const best = movies.reduce<WatchedMovie | null>((current, movie) => {
    if (typeof movie.rating !== "number") return current;
    if (!current) return movie;
    if (movie.rating !== current.rating!) return movie.rating > current.rating! ? movie : current;
    return movie.plays > current.plays ? movie : current;
  }, null);
  return best?.title ?? null;
}

function buildSummary(
  movies: WatchedMovie[],
  credits: Map<number, MovieCredits>,
  cards: WrappedCard[],
  genres: GenreTally[],
): WrappedSummary {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const focus = traitOf(byId.get("focus"));
  const crowd = traitOf(byId.get("crowd"));
  const archetype = (focus && crowd ? ARCHETYPES[`${focus}+${crowd}`] : undefined) ?? "newcomer";

  const ratings = movies.map((m) => m.rating).filter((r): r is number => typeof r === "number");

  return {
    archetype,
    movieCount: movies.length,
    viewingCount: movies.reduce((sum, movie) => sum + movie.plays, 0),
    ratedCount: ratings.length,
    averageRating: mean(ratings),
    topGenre: genres[0]?.genre ?? null,
    topDirector: topDirectorName(movies, credits),
    favouriteMovie: favouriteMovieTitle(movies),
  };
}

/**
 * Costruisce le otto schede più il riepilogo per un singolo anno di visione.
 * `now` è iniettabile perché il ritmo dell'anno in corso dipende dal mese corrente.
 */
export function buildWrapped(
  entries: NormalizedEntry[],
  credits: Map<number, MovieCredits>,
  year: number,
  now: Date = new Date(),
): WrappedReport {
  const yearEntries = entriesForYear(entries, year);
  const movies = collectMovies(yearEntries);
  const genres = yearGenres(movies, credits);

  const cards: WrappedCard[] = [
    ratingCard(movies, credits, year),
    watchingCard(movies, credits, year),
    focusCard(movies, credits),
    crowdCard(movies, credits),
    genresCard(movies, genres, credits),
    reviewerCard(movies),
    rhythmCard(yearEntries, year, now),
    rewatchCard(movies),
  ];

  return { year, movies, cards, summary: buildSummary(movies, credits, cards, genres) };
}
