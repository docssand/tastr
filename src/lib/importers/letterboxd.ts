import Papa from "papaparse";
import type { ImportResult, ImportWarning, NormalizedEntry } from "@/lib/types";
import type { ImportAdapter, ZipContents } from "@/lib/importers/types";

interface DiaryRow {
  Date?: string;
  Name?: string;
  Year?: string;
  "Letterboxd URI"?: string;
  Rating?: string;
  Rewatch?: string;
  Tags?: string;
  "Watched Date"?: string;
}

interface RatingsRow {
  Date?: string;
  Name?: string;
  Year?: string;
  "Letterboxd URI"?: string;
  Rating?: string;
}

interface WatchedRow {
  Date?: string;
  Name?: string;
  Year?: string;
  "Letterboxd URI"?: string;
}

function parseCsv<T>(text: string): T[] {
  const { data } = Papa.parse<T>(text, { header: true, skipEmptyLines: true });
  return data;
}

function entryKey(name: string, year: string | undefined, watchedAt: string | undefined) {
  return `letterboxd:${name}:${year ?? ""}:${watchedAt ?? ""}`;
}

/** Identità del film, senza data: la stessa pellicola può comparire in più righe di diario. */
function filmKey(name: string, year: string | undefined) {
  return `${name.trim().toLowerCase()}|${year ?? ""}`;
}

export const letterboxdAdapter: ImportAdapter = {
  source: "letterboxd",
  label: "Letterboxd",

  detect(zip: ZipContents) {
    return zip.has("profile.csv") && (zip.has("diary.csv") || zip.has("watched.csv"));
  },

  async parse(zip: ZipContents, fileName: string): Promise<ImportResult> {
    const warnings: ImportWarning[] = [];
    const entries = new Map<string, NormalizedEntry>();

    if (zip.has("diary.csv")) {
      const rows = parseCsv<DiaryRow>(await zip.readText("diary.csv"));
      for (const row of rows) {
        if (!row.Name) continue;
        const watchedAt = row["Watched Date"] || row.Date;
        const year = row.Year ? Number(row.Year) : undefined;
        const key = entryKey(row.Name, row.Year, watchedAt);
        entries.set(key, {
          id: key,
          mediaType: "movie",
          title: row.Name,
          year,
          watchedAt,
          rating: row.Rating ? Number(row.Rating) * 2 : undefined,
          rewatch: row.Rewatch?.toLowerCase() === "yes",
        });
      }
    } else if (zip.has("watched.csv")) {
      const rows = parseCsv<WatchedRow>(await zip.readText("watched.csv"));
      for (const row of rows) {
        if (!row.Name) continue;
        const key = entryKey(row.Name, row.Year, row.Date);
        entries.set(key, {
          id: key,
          mediaType: "movie",
          title: row.Name,
          year: row.Year ? Number(row.Year) : undefined,
          watchedAt: row.Date,
        });
      }
    } else {
      warnings.push({ code: "letterboxdNoDiary" });
    }

    if (zip.has("ratings.csv")) {
      // La colonna Date di ratings.csv è la data del voto, non della visione: agganciare
      // il voto per chiave completa creerebbe un film fantasma a ogni riga votata.
      const byFilm = new Map<string, NormalizedEntry[]>();
      for (const entry of entries.values()) {
        const key = filmKey(entry.title, entry.year ? String(entry.year) : undefined);
        const bucket = byFilm.get(key);
        if (bucket) bucket.push(entry);
        else byFilm.set(key, [entry]);
      }

      const rows = parseCsv<RatingsRow>(await zip.readText("ratings.csv"));
      for (const row of rows) {
        if (!row.Name || !row.Rating) continue;
        const rating = Number(row.Rating) * 2;
        const watched = byFilm.get(filmKey(row.Name, row.Year));

        if (watched) {
          watched.forEach((entry) => {
            entry.rating = entry.rating ?? rating;
          });
        } else {
          const key = entryKey(row.Name, row.Year, row.Date);
          entries.set(key, {
            id: key,
            mediaType: "movie",
            title: row.Name,
            year: row.Year ? Number(row.Year) : undefined,
            watchedAt: row.Date,
            rating,
          });
        }
      }
    }

    return {
      source: "letterboxd",
      importedAt: new Date().toISOString(),
      fileName,
      entries: Array.from(entries.values()),
      warnings,
    };
  },
};
