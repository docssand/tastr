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

/** "2024-07-03T21:10:00Z" → "2024". */
function yearOf(date: string) {
  return date.slice(0, 4);
}

/**
 * Una riga di watches.csv riassume tutte le visioni di un titolo: quante sono, la prima
 * e l'ultima data. Tenerle su una sola riga datata all'ultima visione attribuirebbe
 * all'anno dell'ultima anche le visioni degli anni prima, gonfiando Wrapped e rewatch.
 *
 * Qui la riga si divide in una visione alla prima data e le restanti all'ultima. Le
 * visioni di mezzo cadono fra le due date: se sono nello stesso anno stanno in
 * quell'anno, altrimenti l'anno non si può sapere e restano senza data.
 */
function viewingsOf(row: WatchRow): NormalizedEntry[] {
  const base = toEntry(row);
  const parsed = Number(row.plays);
  const plays = Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : 1;
  const first = row.first_watched_at || undefined;
  const last = row.last_watched_at || undefined;

  if (plays === 1 || !first || !last || first === last) {
    return [{ ...base, watchedAt: last ?? first, rewatch: plays > 1, plays }];
  }

  const middle = plays - 2;
  const sameYear = yearOf(first) === yearOf(last);
  // L'ultima visione va per prima: è lì che ratings.csv attacca il voto.
  const viewings: NormalizedEntry[] = [
    { ...base, watchedAt: last, rewatch: true, plays: sameYear ? middle + 1 : 1 },
    { ...base, id: `${base.id}:first`, watchedAt: first, plays: 1 },
  ];
  if (!sameYear && middle > 0) {
    viewings.push({ ...base, id: `${base.id}:middle`, rewatch: true, plays: middle });
  }
  return viewings;
}

export const bingersAdapter: ImportAdapter = {
  source: "bingers",
  label: "Bingers",

  detect(zip: ZipContents) {
    return zip.has("library.csv") && zip.has("watches.csv");
  },

  async parse(zip: ZipContents, fileName: string): Promise<ImportResult> {
    const warnings: ImportWarning[] = [];
    const entries = new Map<string, NormalizedEntry[]>();

    if (zip.has("watches.csv")) {
      const rows = parseCsv<WatchRow>(await zip.readText("watches.csv"));
      for (const row of rows) {
        if (!row.title) continue;
        entries.set(entryKey(row), viewingsOf(row));
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
          // Sulla visione più recente, che viewingsOf mette per prima: collectShows
          // conta il voto di un episodio solo sulla prima riga che incontra.
          existing[0].rating = rating;
        } else {
          entries.set(key, [{ ...toEntry(row), rating }]);
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
      entries: Array.from(entries.values()).flat(),
      warnings,
    };
  },
};
