export type MediaType = "movie" | "episode" | "show";

export type ImportSource = "letterboxd" | "trakt" | "bingers";

export interface NormalizedEntry {
  id: string;
  mediaType: MediaType;
  title: string;
  year?: number;
  watchedAt?: string;
  rating?: number;
  rewatch?: boolean;
  /** Numero di visioni rappresentate da questa riga (default 1). */
  plays?: number;
  showTitle?: string;
  season?: number;
  episode?: number;
  tmdbId?: number;
  directors?: string[];
  genres?: string[];
}

export type ImportWarningCode =
  | "traktUnreadableJson"
  | "traktNoEntries"
  | "letterboxdNoDiary"
  | "bingersNoWatches"
  | "bingersNoEntries";

export interface ImportWarning {
  code: ImportWarningCode;
  params?: Record<string, string>;
}

export interface ImportResult {
  source: ImportSource;
  importedAt: string;
  fileName: string;
  entries: NormalizedEntry[];
  warnings: ImportWarning[];
}

export interface CreditPerson {
  id: number;
  name: string;
  /** Posizione in locandina; presente solo per il cast. */
  order?: number;
}

/** Record salvato in IndexedDB, uno per film TMDB. */
export interface MovieCredits {
  tmdbId: number;
  directors: CreditPerson[];
  cast: CreditPerson[];
  genres: string[];
  /** Voto medio pubblico TMDB, scala 0-10 come il voto personale. */
  voteAverage?: number;
  /** Anno di uscita da TMDB: unica fonte per le sorgenti di import che non lo forniscono (es. Bingers). */
  year?: number;
  fetchedAt: string;
}

/** Un interprete di una serie, con il peso che ha davvero avuto nella sua storia. */
export interface ShowCastPerson extends CreditPerson {
  /**
   * Episodi in cui compare, sull'intera serie. È ciò che separa un protagonista da
   * una guest star: nei film questa distinzione la fa la posizione in locandina,
   * in una serie la fa il numero di episodi.
   */
  episodeCount?: number;
}

/** Record salvato in IndexedDB, uno per serie TMDB. */
export interface ShowCredits {
  tmdbId: number;
  /** Chi l'ha creata: l'equivalente televisivo del regista, che in una serie cambia a ogni episodio. */
  creators: CreditPerson[];
  cast: ShowCastPerson[];
  genres: string[];
  /** Voto medio pubblico TMDB, scala 0-10 come il voto personale. */
  voteAverage?: number;
  /** Anno di prima messa in onda. */
  year?: number;
  /** Episodi messi in onda in totale: il denominatore del completamento. */
  totalEpisodes?: number;
  totalSeasons?: number;
  /** Durata media di un episodio in minuti: senza, il tempo speso non è calcolabile. */
  episodeRuntime?: number;
  /** Stato TMDB ("Ended", "Returning Series", "Canceled"…): distingue una serie finita da una in corso. */
  status?: string;
  fetchedAt: string;
}

export const SOURCE_LABELS: Record<ImportSource, string> = {
  letterboxd: "Letterboxd",
  trakt: "Trakt",
  bingers: "Bingers",
};
