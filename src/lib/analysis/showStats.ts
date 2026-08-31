import { clamp01 } from "@/lib/analysis/stats";
import { showPersonalMean, type WatchedShow } from "@/lib/analysis/shows";
import type { CreditPerson, ShowCredits } from "@/lib/types";

/**
 * Parametri delle metriche televisive. Raccolti qui per essere tarati in un punto solo,
 * come `SCORING` per le persone del cinema, ma con un'unità di misura diversa.
 *
 *   esposizione = episodi + rewatchWeight · episodi_rivisti
 *   D           = Σ (peso_voto · (voto − media_serie)) / (Σ peso_voto + shrinkK)
 *   qualità     = max(minQuality, 1 + D / qualityScale)
 *   dedizione   = log₂(1 + esposizione) · qualità · fattore_completamento
 *
 * La differenza sostanziale rispetto ai film è che l'esposizione si conta in episodi:
 * per un film il titolo *è* la visione, per una serie il titolo è solo un contenitore.
 * Cinque stagioni e un pilota abbandonato non possono valere lo stesso.
 */
export const SHOW_SCORING = {
  /** Voti "fantasma" alla media aggiunti a ogni serie: penalizza i giudizi poco sostenuti. */
  shrinkK: 3,
  /** Punti di scarto medio (dopo shrinkage) che valgono +100% di qualità. */
  qualityScale: 1,
  /** Quanto vale un episodio rivisto rispetto a uno nuovo. */
  rewatchWeight: 0.3,
  /** Pavimento del moltiplicatore: nemmeno una serie detestata azzera gli episodi visti. */
  minQuality: 0.15,
  /**
   * Peso di un voto dato alla serie, misurato in voti-episodio. Un voto alla serie è un
   * giudizio sull'insieme e vale più di una singola puntata, ma non più di una stagione votata.
   */
  showRatingWeight: 3,
  /** Fattore minimo di completamento: una serie assaggiata conta, ma meno di una finita. */
  completionFloor: 0.55,
  /** Episodi sotto i quali una serie è solo un assaggio, non una visione. */
  sampledEpisodes: 3,
  /** Quota di episodi oltre la quale la serie è vista tutta (i finali di stagione sballano l'ultimo punto). */
  completedShare: 0.9,
  /** Mesi di inattività dopo i quali una serie lasciata a metà è da considerarsi abbandonata. */
  staleMonths: 12,
  /** Media usata quando non c'è nessun voto alle serie. */
  fallbackMean: 7,
} as const;

/**
 * Dove sei arrivato con una serie. È l'informazione più televisiva che esista:
 * un film lo hai visto o non lo hai visto, una serie ha un mezzo.
 */
export type ShowStatus = "completed" | "watching" | "abandoned" | "sampled" | "unknown";

/** L'ordine in cui gli stati vengono mostrati: dal massimo impegno al minimo. */
export const SHOW_STATUSES: ShowStatus[] = ["completed", "watching", "abandoned", "sampled", "unknown"];

export interface ShowStat extends WatchedShow {
  /** Episodi messi in onda, da TMDB. */
  totalEpisodes?: number;
  totalSeasons?: number;
  /** Episodi visti sul totale, 0-1. `undefined` finché TMDB non dice quanti ne esistono. */
  completion?: number;
  /** Minuti passati su questa serie, rewatch inclusi. `undefined` se la durata è ignota. */
  minutes?: number;
  genres: string[];
  /** Voto medio pubblico TMDB. */
  voteAverage?: number;
  /** Vero se la serie è conclusa: distingue "l'hai finita" da "sei in pari con una in corso". */
  ended?: boolean;
  status: ShowStatus;
  /** Punteggio di dedizione: quanto ti sei impegnato con questa serie, e quanto ne è valsa la pena. */
  score: number;
  exposure: number;
  delta: number;
  quality: number;
  hasCredits: boolean;
}

const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

function isStale(lastWatchedAt: string | undefined, now: Date) {
  // Senza data non si può dire da quanto è ferma: nel dubbio non la si dà per abbandonata.
  if (!lastWatchedAt) return false;
  const last = Date.parse(lastWatchedAt);
  if (!Number.isFinite(last)) return false;
  return (now.getTime() - last) / MS_PER_MONTH > SHOW_SCORING.staleMonths;
}

function statusOf(show: WatchedShow, completion: number | undefined, now: Date): ShowStatus {
  if (completion === undefined) return "unknown";
  // Prima di tutto il resto: una miniserie di due episodi visti entrambi è finita, non assaggiata.
  if (completion >= SHOW_SCORING.completedShare) return "completed";
  if (show.episodes <= SHOW_SCORING.sampledEpisodes) return "sampled";
  return isStale(show.lastWatchedAt, now) ? "abandoned" : "watching";
}

/**
 * Scarto medio dei voti di una serie dalla media personale, dopo shrinkage.
 * Il denominatore è il numero di *voti* dietro il giudizio, non il numero di serie:
 * trenta episodi votati 9 dicono una cosa più solida di un singolo episodio votato 9.
 */
function ratingDelta(show: WatchedShow, mean: number) {
  let weight = 0;
  let weightedSum = 0;

  if (show.showRating !== undefined) {
    weight += SHOW_SCORING.showRatingWeight;
    weightedSum += SHOW_SCORING.showRatingWeight * (show.showRating - mean);
  }
  if (show.episodeRatingAvg !== undefined) {
    weight += show.ratedEpisodes;
    weightedSum += show.ratedEpisodes * (show.episodeRatingAvg - mean);
  }

  return weightedSum / (weight + SHOW_SCORING.shrinkK);
}

export interface ShowStatsOptions {
  /** Istante rispetto a cui valutare l'abbandono; iniettabile per i test. */
  now?: Date;
}

/** Unisce le serie viste ai dati TMDB e calcola tutto ciò che dipende da entrambi. */
export function buildShowStats(
  shows: WatchedShow[],
  credits: Map<number, ShowCredits>,
  options: ShowStatsOptions = {},
): ShowStat[] {
  const now = options.now ?? new Date();
  const mean = showPersonalMean(shows) ?? SHOW_SCORING.fallbackMean;

  return shows
    .map<ShowStat>((show) => {
      const info = show.tmdbId ? credits.get(show.tmdbId) : undefined;
      const totalEpisodes = info?.totalEpisodes;
      const completion =
        totalEpisodes && totalEpisodes > 0 ? clamp01(show.episodes / totalEpisodes) : undefined;

      const rewatchPlays = Math.max(0, show.plays - show.episodes);
      const exposure = show.episodes + SHOW_SCORING.rewatchWeight * rewatchPlays;
      const delta = ratingDelta(show, mean);
      const quality = Math.max(SHOW_SCORING.minQuality, 1 + delta / SHOW_SCORING.qualityScale);
      // Senza dati TMDB il completamento è ignoto, non basso: non si penalizza ciò che non si sa.
      const completionFactor =
        completion === undefined
          ? 1
          : SHOW_SCORING.completionFloor + (1 - SHOW_SCORING.completionFloor) * completion;

      return {
        ...show,
        totalEpisodes,
        totalSeasons: info?.totalSeasons,
        completion,
        minutes: info?.episodeRuntime ? info.episodeRuntime * show.plays : undefined,
        genres: info?.genres ?? [],
        voteAverage: info?.voteAverage,
        ended: info?.status ? info.status === "Ended" || info.status === "Canceled" : undefined,
        status: statusOf(show, completion, now),
        score: Math.log2(1 + exposure) * quality * completionFactor,
        exposure,
        delta,
        quality,
        hasCredits: info !== undefined,
      };
    })
    .sort((a, b) => b.score - a.score || b.episodes - a.episodes || a.title.localeCompare(b.title));
}

export interface ShowLibrarySummary {
  shows: number;
  episodes: number;
  /** Visioni di episodi, rewatch inclusi. */
  plays: number;
  rewatchedEpisodes: number;
  /** Minuti sulle serie di cui si conosce la durata: le altre restano fuori dal conto. */
  minutes: number;
  /** Serie che hanno contribuito ai minuti, sul totale: dice quanto il tempo è una stima per difetto. */
  timedShows: number;
  ratedShows: number;
  avgRating: number | null;
  completedShows: number;
  /** Serie con dati TMDB: sotto il totale, le percentuali sono parziali. */
  credited: number;
}

export function summarizeShows(stats: ShowStat[]): ShowLibrarySummary {
  const summary: ShowLibrarySummary = {
    shows: stats.length,
    episodes: 0,
    plays: 0,
    rewatchedEpisodes: 0,
    minutes: 0,
    timedShows: 0,
    ratedShows: 0,
    avgRating: null,
    completedShows: 0,
    credited: 0,
  };

  let ratingSum = 0;
  for (const stat of stats) {
    summary.episodes += stat.episodes;
    summary.plays += stat.plays;
    summary.rewatchedEpisodes += stat.rewatchedEpisodes;
    if (stat.minutes !== undefined) {
      summary.minutes += stat.minutes;
      summary.timedShows += 1;
    }
    if (typeof stat.rating === "number") {
      summary.ratedShows += 1;
      ratingSum += stat.rating;
    }
    if (stat.status === "completed") summary.completedShows += 1;
    if (stat.hasCredits) summary.credited += 1;
  }

  summary.avgRating = summary.ratedShows > 0 ? ratingSum / summary.ratedShows : null;
  return summary;
}

export interface StatusBucket {
  status: ShowStatus;
  count: number;
  episodes: number;
  /** Quota sul totale delle serie. */
  share: number;
}

/** Quante serie stanno in ciascuno stato: il ritratto di *come* guardi, non di cosa. */
export function statusBreakdown(stats: ShowStat[]): StatusBucket[] {
  const buckets = new Map<ShowStatus, { count: number; episodes: number }>();
  for (const stat of stats) {
    const bucket = buckets.get(stat.status) ?? { count: 0, episodes: 0 };
    bucket.count += 1;
    bucket.episodes += stat.episodes;
    buckets.set(stat.status, bucket);
  }

  return SHOW_STATUSES.filter((status) => buckets.has(status)).map((status) => {
    const bucket = buckets.get(status)!;
    return {
      status,
      count: bucket.count,
      episodes: bucket.episodes,
      share: stats.length > 0 ? bucket.count / stats.length : 0,
    };
  });
}

export interface ShowGenreStat {
  genre: string;
  /** Serie distinte del genere. */
  shows: number;
  /** Episodi visti nel genere: è questo il peso vero, non il numero di titoli. */
  episodes: number;
  ratedShows: number;
  avgRating: number | null;
}

/**
 * Generi ordinati per episodi visti, non per numero di serie.
 * È la differenza che conta: due sitcom da dieci stagioni pesano più di sei miniserie,
 * anche se in un conteggio per titoli sarebbe il contrario.
 * Una serie con più generi conta una volta per ciascuno.
 */
export function showGenreStats(stats: ShowStat[]): ShowGenreStat[] {
  const byGenre = new Map<string, { shows: number; episodes: number; ratingSum: number; ratedShows: number }>();

  for (const stat of stats) {
    for (const genre of stat.genres) {
      const bucket = byGenre.get(genre) ?? { shows: 0, episodes: 0, ratingSum: 0, ratedShows: 0 };
      bucket.shows += 1;
      bucket.episodes += stat.episodes;
      if (typeof stat.rating === "number") {
        bucket.ratingSum += stat.rating;
        bucket.ratedShows += 1;
      }
      byGenre.set(genre, bucket);
    }
  }

  return Array.from(byGenre.entries())
    .map(([genre, b]) => ({
      genre,
      shows: b.shows,
      episodes: b.episodes,
      ratedShows: b.ratedShows,
      avgRating: b.ratedShows > 0 ? b.ratingSum / b.ratedShows : null,
    }))
    .sort((a, b) => b.episodes - a.episodes || a.genre.localeCompare(b.genre));
}

export type ShowPersonRole = "creator" | "actor";

export interface PersonShow {
  title: string;
  /** Episodi tuoi in cui questa persona compariva. */
  episodes: number;
  rating?: number;
}

export interface ShowPersonScore {
  id: number;
  name: string;
  score: number;
  /** Somma degli episodi visti in cui la persona compariva, stimata per il cast. */
  episodes: number;
  showCount: number;
  ratedCount: number;
  averageRating: number | null;
  delta: number;
  quality: number;
  shows: PersonShow[];
}

/**
 * Episodi *tuoi* in cui la persona compariva.
 *
 * Il dato TMDB dice in quanti episodi della serie compare, non in quali: la stima
 * proporzionale è l'unica onesta senza scaricare la lista episodio per episodio.
 * È anche ciò che separa un protagonista da una guest star, distinzione che nei film
 * fa la posizione in locandina e qui non esiste.
 */
function watchedEpisodesWith(stat: ShowStat, episodeCount: number | undefined) {
  if (episodeCount === undefined) return stat.episodes;
  if (!stat.totalEpisodes) return Math.min(episodeCount, stat.episodes);
  return stat.episodes * clamp01(episodeCount / stat.totalEpisodes);
}

interface PersonAggregate {
  id: number;
  name: string;
  episodes: number;
  ratingSum: number;
  ratedCount: number;
  weightedDelta: number;
  showCount: number;
  shows: PersonShow[];
}

/**
 * Classifica di creatori e interpreti, pesata per episodi visti.
 *
 * Il creatore risponde di tutta la serie, quindi eredita tutti gli episodi che le hai
 * dedicato; l'interprete solo della quota in cui compare. Sotto un episodio stimato la
 * presenza non viene contata: è una comparsata, non una parte della tua visione.
 */
export function rankShowPeople(
  stats: ShowStat[],
  credits: Map<number, ShowCredits>,
  role: ShowPersonRole,
  limit = 10,
): ShowPersonScore[] {
  const mean = showPersonalMean(stats) ?? SHOW_SCORING.fallbackMean;
  const aggregates = new Map<number, PersonAggregate>();

  for (const stat of stats) {
    if (!stat.tmdbId) continue;
    const info = credits.get(stat.tmdbId);
    if (!info) continue;

    const people: Array<{ person: CreditPerson; episodeCount?: number }> =
      role === "creator"
        ? info.creators.map((person) => ({ person }))
        : info.cast.map((person) => ({ person, episodeCount: person.episodeCount }));

    const seen = new Set<number>();
    for (const { person, episodeCount } of people) {
      // La stessa persona può comparire due volte (creatore e interprete di sé stesso, doppi ruoli).
      if (seen.has(person.id)) continue;
      seen.add(person.id);

      const episodes = role === "creator" ? stat.episodes : watchedEpisodesWith(stat, episodeCount);
      if (episodes < 1) continue;

      let aggregate = aggregates.get(person.id);
      if (!aggregate) {
        aggregate = {
          id: person.id,
          name: person.name,
          episodes: 0,
          ratingSum: 0,
          ratedCount: 0,
          weightedDelta: 0,
          showCount: 0,
          shows: [],
        };
        aggregates.set(person.id, aggregate);
      }

      aggregate.episodes += episodes;
      aggregate.showCount += 1;
      aggregate.shows.push({ title: stat.title, episodes, rating: stat.rating });

      if (typeof stat.rating === "number") {
        aggregate.ratingSum += stat.rating;
        aggregate.ratedCount += 1;
        aggregate.weightedDelta += stat.rating - mean;
      }
    }
  }

  return Array.from(aggregates.values())
    .map<ShowPersonScore>((a) => {
      const delta = a.weightedDelta / (a.ratedCount + SHOW_SCORING.shrinkK);
      const quality = Math.max(SHOW_SCORING.minQuality, 1 + delta / SHOW_SCORING.qualityScale);
      return {
        id: a.id,
        name: a.name,
        score: Math.log2(1 + a.episodes) * quality,
        episodes: a.episodes,
        showCount: a.showCount,
        ratedCount: a.ratedCount,
        averageRating: a.ratedCount > 0 ? a.ratingSum / a.ratedCount : null,
        delta,
        quality,
        shows: a.shows.sort((x, y) => y.episodes - x.episodes),
      };
    })
    .sort((a, b) => b.score - a.score || b.episodes - a.episodes || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Quante serie hanno dati TMDB: serve a dire all'utente se le metriche sono complete. */
export function showCreditsCoverage(shows: WatchedShow[], credits: Map<number, ShowCredits>) {
  let covered = 0;
  for (const show of shows) {
    if (show.tmdbId && credits.has(show.tmdbId)) covered += 1;
  }
  return { covered, total: shows.length };
}
