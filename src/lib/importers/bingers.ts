import Papa from "papaparse";
import type { ImportResult, ImportWarning, NormalizedEntry } from "@/lib/types";
import type { ImportAdapter, ZipContents } from "@/lib/importers/types";

interface WatchRow {
  type?: string;
  title?: string;
  tmdb_id?: string;
  season_number?: string;
  episode_number?: string;
  first_watched_at?: string;
  last_watched_at?: string;
  plays?: string;
}

interface RatingRow {
  type?: string;
  title?: string;
  tmdb_id?: string;
  season_number?: string;
  episode_number?: string;
  rating?: string;
}

function parseCsv<T>(text: string): T[] {
  const { data } = Papa.parse<T>(text, { header: true, skipEmptyLines: true });
  return data;
}

function entryKey(row: { type?: string; title?: string; season_number?: string; episode_number?: string }) {
  return row.type === "episode"
    ? `bingers:episode:${row.title}:${row.season_number}:${row.episode_number}`
    : `bingers:movie:${row.title}`;
}

function toEntry(row: { type?: string; title?: string; season_number?: string; episode_number?: string; tmdb_id?: string }): NormalizedEntry {
  const isEpisode = row.type === "episode";
  return {
    id: entryKey(row),
    mediaType: isEpisode ? "episode" : "movie",
    title: row.title ?? "",
    showTitle: isEpisode ? row.title : undefined,
    season: isEpisode && row.season_number ? Number(row.season_number) : undefined,
    episode: isEpisode && row.episode_number ? Number(row.episode_number) : undefined,
    tmdbId: row.tmdb_id ? Number(row.tmdb_id) : undefined,
  };
}

export const bingersAdapter: ImportAdapter = {
  source: "bingers",
  label: "Bingers",

  detect(zip: ZipContents) {
    return zip.has("library.csv") && zip.has("watches.csv");
  },

  async parse(zip: ZipContents, fileName: string): Promise<ImportResult> {
    const warnings: ImportWarning[] = [];
    const entries = new Map<string, NormalizedEntry>();

    if (zip.has("watches.csv")) {
      const rows = parseCsv<WatchRow>(await zip.readText("watches.csv"));
      for (const row of rows) {
        if (!row.title) continue;
        const plays = Number(row.plays);
        entries.set(entryKey(row), {
          ...toEntry(row),
          watchedAt: row.last_watched_at || row.first_watched_at,
          rewatch: plays > 1,
          plays: Number.isFinite(plays) && plays > 0 ? plays : 1,
        });
      }
    } else {
      warnings.push({ code: "bingersNoWatches" });
    }

    if (zip.has("ratings.csv")) {
      const rows = parseCsv<RatingRow>(await zip.readText("ratings.csv"));
      for (const row of rows) {
        if (!row.title || row.rating === undefined || row.rating === "") continue;
        const key = entryKey(row);
        const rating = Number(row.rating) * 2;
        const existing = entries.get(key);
        if (existing) {
          existing.rating = rating;
        } else {
          entries.set(key, { ...toEntry(row), rating });
        }
      }
    }

    if (entries.size === 0) {
      warnings.push({ code: "bingersNoEntries" });
    }

    return {
      source: "bingers",
      importedAt: new Date().toISOString(),
      fileName,
      entries: Array.from(entries.values()),
      warnings,
    };
  },
};
