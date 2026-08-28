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
  fetchedAt: string;
}

export const SOURCE_LABELS: Record<ImportSource, string> = {
  letterboxd: "Letterboxd",
  trakt: "Trakt",
  bingers: "Bingers",
};
