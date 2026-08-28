import type { ImportResult, ImportWarning, NormalizedEntry } from "@/lib/types";
import type { ImportAdapter, ZipContents } from "@/lib/importers/types";

interface TraktIds {
  trakt?: number;
  tmdb?: number;
  imdb?: string;
}

interface TraktMovie {
  title: string;
  year?: number;
  ids?: TraktIds;
}

interface TraktEpisode {
  season?: number;
  number?: number;
  title?: string;
}

interface TraktShow {
  title: string;
  year?: number;
  ids?: TraktIds;
}

interface TraktHistoryItem {
  watched_at?: string;
  rating?: number;
  movie?: TraktMovie;
  show?: TraktShow;
  episode?: TraktEpisode;
}

// Formato desunto dalla struttura pubblica delle risposte dell'API Trakt
// (usata anche dai tool di export community); da confermare con un export reale.
const TRAKT_FILE_HINTS = [
  "watched_movies.json",
  "ratings_movies.json",
  "history_movies.json",
  "movies.json",
  "watched.json",
  "ratings.json",
  "history.json",
];

function looksLikeTraktArray(value: unknown): value is TraktHistoryItem[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const sample = value[0] as Record<string, unknown>;
  return Boolean(sample && (sample.movie || sample.show) && typeof sample === "object");
}

async function findTraktFile(zip: ZipContents): Promise<string | undefined> {
  for (const hint of TRAKT_FILE_HINTS) {
    if (zip.has(hint)) return zip.fileNames.find((n) => n === hint || n.endsWith(`/${hint}`));
  }
  const jsonFile = zip.fileNames.find((n) => n.toLowerCase().endsWith(".json"));
  if (!jsonFile) return undefined;
  try {
    const parsed = JSON.parse(await zip.readText(jsonFile));
    return looksLikeTraktArray(parsed) ? jsonFile : undefined;
  } catch {
    return undefined;
  }
}

export const traktAdapter: ImportAdapter = {
  source: "trakt",
  label: "Trakt",

  async detect(zip: ZipContents) {
    return Boolean(await findTraktFile(zip));
  },

  async parse(zip: ZipContents, fileName: string): Promise<ImportResult> {
    const warnings: ImportWarning[] = [];
    const entries: NormalizedEntry[] = [];

    const jsonFiles = zip.fileNames.filter((n) => n.toLowerCase().endsWith(".json"));
    for (const file of jsonFiles) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await zip.readText(file));
      } catch {
        warnings.push({ code: "traktUnreadableJson", params: { file } });
        continue;
      }
      if (!looksLikeTraktArray(parsed)) continue;

      for (const item of parsed) {
        if (item.movie) {
          const key = `trakt:movie:${item.movie.ids?.trakt ?? item.movie.title}:${item.watched_at ?? ""}`;
          entries.push({
            id: key,
            mediaType: "movie",
            title: item.movie.title,
            year: item.movie.year,
            watchedAt: item.watched_at,
            rating: item.rating,
            tmdbId: item.movie.ids?.tmdb,
          });
        } else if (item.show) {
          const key = `trakt:episode:${item.show.ids?.trakt ?? item.show.title}:${item.episode?.season ?? ""}:${item.episode?.number ?? ""}:${item.watched_at ?? ""}`;
          entries.push({
            id: key,
            mediaType: "episode",
            title: item.episode?.title ?? item.show.title,
            showTitle: item.show.title,
            year: item.show.year,
            season: item.episode?.season,
            episode: item.episode?.number,
            watchedAt: item.watched_at,
            rating: item.rating,
            tmdbId: item.show.ids?.tmdb,
          });
        }
      }
    }

    if (entries.length === 0) {
      warnings.push({ code: "traktNoEntries" });
    }

    return {
      source: "trakt",
      importedAt: new Date().toISOString(),
      fileName,
      entries,
      warnings,
    };
  },
};
