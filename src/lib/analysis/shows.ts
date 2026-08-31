import type { NormalizedEntry } from "@/lib/types";
import { normalizeTitle } from "@/lib/analysis/movies";

/**
 * Una serie distinta della libreria, con le visioni dei suoi episodi accorpate.
 *
 * La differenza sostanziale rispetto a `WatchedMovie` è che qui il titolo non è
 * l'unità di misura: una serie è *una* riga in classifica ma decine di visioni, e
 * quasi tutto ciò che si può dire di quanto ti è piaciuta passa dal numero di
 * episodi che le hai dedicato, non dal fatto di averla aperta.
 */
export interface WatchedShow {
  key: string;
  /** Id TMDB della *serie* (non dell'episodio): è quello che esportano sia Trakt sia Bingers. */
  tmdbId?: number;
  title: string;
  /** Anno di prima messa in onda, quando la sorgente lo fornisce. */
  year?: number;
  /** Episodi distinti visti almeno una volta. */
  episodes: number;
  /** Visioni di episodi in totale, rewatch inclusi. */
  plays: number;
  /** Episodi visti più di una volta. */
  rewatchedEpisodes: number;
  /** Numeri di stagione toccati, in ordine crescente. */
  seasons: number[];
  /** Voto dato alla serie nel suo insieme (o alle sue stagioni), se l'export lo contiene. */
  showRating?: number;
  /** Media dei voti dati ai singoli episodi. */
  episodeRatingAvg?: number;
  /** Quanti episodi hanno un voto: è la confidenza dietro `episodeRatingAvg`. */
  ratedEpisodes: number;
  /**
   * Voto unico usato dalle analisi: quello alla serie se c'è, altrimenti la media
   * degli episodi. Un voto alla serie è un giudizio sull'insieme e vince sempre
   * sulla media di un campione di episodi, che ne è solo un'approssimazione.
   */
  rating?: number;
  firstWatchedAt?: string;
  lastWatchedAt?: string;
}

/**
 * Chiave di identità di una serie. Il prefisso `tv:` la separa dallo spazio degli id
 * dei film: TMDB numera film e serie in due sequenze indipendenti, quindi l'id 100
 * è un film *e* una serie, e sono cose diverse.
 */
export function showKey(show: { tmdbId?: number; title: string; year?: number }) {
  if (show.tmdbId) return `tv:${show.tmdbId}`;
  return `tvtitle:${normalizeTitle(show.title)}|${show.year ?? ""}`;
}

/** Il titolo della serie: gli importer mettono in `showTitle` quello giusto, `title` può essere l'episodio. */
function seriesTitle(entry: NormalizedEntry) {
  return entry.showTitle?.trim() || entry.title.trim();
}

/** Identità di un episodio dentro la sua serie. */
function episodeKey(entry: NormalizedEntry) {
  return `${entry.season ?? ""}|${entry.episode ?? ""}`;
}

/** Vedi la nota gemella in `collectMovies`: una cella non numerica produce NaN, e un solo NaN avvelena ogni media. */
function validRating(rating: number | undefined) {
  return Number.isFinite(rating) ? rating : undefined;
}

function isAfter(a: string | undefined, b: string | undefined) {
  if (!a) return false;
  if (!b) return true;
  return a > b;
}

function isBefore(a: string | undefined, b: string | undefined) {
  if (!a) return false;
  if (!b) return true;
  return a < b;
}

interface ShowAccumulator {
  key: string;
  tmdbId?: number;
  title: string;
  year?: number;
  /** Chiave episodio → visioni. Serve a distinguere "dieci episodi" da "un episodio dieci volte". */
  episodePlays: Map<string, number>;
  seasons: Set<number>;
  episodeRatingSum: number;
  ratedEpisodes: number;
  showRatingSum: number;
  showRatingCount: number;
  firstWatchedAt?: string;
  lastWatchedAt?: string;
}

/**
 * Riduce le righe dell'import all'elenco delle serie distinte.
 *
 * Una riga senza numero di episodio non è una visione: è il voto a una serie o a una
 * stagione, che Trakt esporta con la stessa forma delle visioni. Contarla come episodio
 * gonfierebbe di uno ogni serie che hai votato senza averne visto nulla di nuovo.
 */
export function collectShows(entries: NormalizedEntry[]): WatchedShow[] {
  const byKey = new Map<string, ShowAccumulator>();

  for (const entry of entries) {
    if (entry.mediaType !== "episode" && entry.mediaType !== "show") continue;

    const title = seriesTitle(entry);
    if (!title) continue;

    const key = showKey({ tmdbId: entry.tmdbId, title, year: entry.year });
    let show = byKey.get(key);
    if (!show) {
      show = {
        key,
        tmdbId: entry.tmdbId,
        title,
        year: entry.year,
        episodePlays: new Map(),
        seasons: new Set(),
        episodeRatingSum: 0,
        ratedEpisodes: 0,
        showRatingSum: 0,
        showRatingCount: 0,
      };
      byKey.set(key, show);
    }

    show.tmdbId ??= entry.tmdbId;
    show.year ??= entry.year;

    const rating = validRating(entry.rating);
    const isViewing = entry.mediaType === "episode" && entry.episode !== undefined;

    if (!isViewing) {
      // Voto alla serie o a una stagione: nessun episodio visto, solo un giudizio.
      if (rating !== undefined) {
        show.showRatingSum += rating;
        show.showRatingCount += 1;
      }
      continue;
    }

    const plays = Number.isFinite(entry.plays) && entry.plays! > 0 ? entry.plays! : 1;
    const epKey = episodeKey(entry);
    const previous = show.episodePlays.get(epKey);
    show.episodePlays.set(epKey, (previous ?? 0) + plays);

    if (entry.season !== undefined) show.seasons.add(entry.season);
    if (isAfter(entry.watchedAt, show.lastWatchedAt)) show.lastWatchedAt = entry.watchedAt;
    if (isBefore(entry.watchedAt, show.firstWatchedAt)) show.firstWatchedAt = entry.watchedAt;

    // Il voto sta sulla riga della visione: lo stesso episodio rivisto due volte non
    // vale due voti, quindi si conta solo la prima riga che ne porta uno.
    if (rating !== undefined && previous === undefined) {
      show.episodeRatingSum += rating;
      show.ratedEpisodes += 1;
    }
  }

  return Array.from(byKey.values()).map((show) => {
    let plays = 0;
    let rewatchedEpisodes = 0;
    for (const count of show.episodePlays.values()) {
      plays += count;
      if (count > 1) rewatchedEpisodes += 1;
    }

    const showRating = show.showRatingCount > 0 ? show.showRatingSum / show.showRatingCount : undefined;
    const episodeRatingAvg = show.ratedEpisodes > 0 ? show.episodeRatingSum / show.ratedEpisodes : undefined;

    return {
      key: show.key,
      tmdbId: show.tmdbId,
      title: show.title,
      year: show.year,
      episodes: show.episodePlays.size,
      plays,
      rewatchedEpisodes,
      seasons: Array.from(show.seasons).sort((a, b) => a - b),
      showRating,
      episodeRatingAvg,
      ratedEpisodes: show.ratedEpisodes,
      rating: showRating ?? episodeRatingAvg,
      firstWatchedAt: show.firstWatchedAt,
      lastWatchedAt: show.lastWatchedAt,
    };
  });
}

/** Media dei voti dati alle serie. È la baseline TV: si vota una serie con un metro diverso da un film. */
export function showPersonalMean(shows: WatchedShow[]): number | null {
  const rated = shows.filter((s) => typeof s.rating === "number");
  if (rated.length === 0) return null;
  return rated.reduce((sum, s) => sum + s.rating!, 0) / rated.length;
}
