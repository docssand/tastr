import { HARVEST_STORE, idbGetManySafe, idbPutManySafe } from "@/lib/idb";
import { runPool } from "@/lib/enrich/pool";
import {
  discoverMovies,
  getMovieGenres,
  getMovieRecommendations,
  getPersonMovieCredits,
  isFatalTmdbError,
  type TmdbMovieListItem,
} from "@/lib/tmdb";
import {
  directorGap,
  findEraGaps,
  findGenreGaps,
  sortGaps,
  GAP_TUNING,
  type CandidateMovie,
  type CandidateSource,
  type Gap,
} from "@/lib/analysis/recommendations";
import { isSeen, type SeenIndex, type TasteProfile } from "@/lib/analysis/taste";
import type { PersonScore } from "@/lib/analysis/people";

/** Quante richieste TMDB tenere in volo. Più basso dell'arricchimento: qui le risposte sono liste. */
const CONCURRENCY = 6;
/**
 * Quanto resta valida una lista di candidati. I cataloghi di TMDB cambiano lentamente e
 * rigenerare i suggerimenti non deve costare cinquanta richieste ogni volta che si apre la pagina.
 */
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** L'elenco dei generi non cambia praticamente mai. */
const GENRES_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Voti minimi richiesti a discover, per tipo di ricerca. */
const LOVE_MIN_VOTES = "500";
const GAP_MIN_VOTES = "800";
const FRESH_MIN_VOTES = "150";
/** Quanti anni indietro guarda la ricerca delle uscite recenti nel tuo genere principale. */
const FRESH_YEARS = 3;
/** Generi di testa da cui pescare i classici del tuo terreno. */
const LOVE_GENRES = 2;
/** Posizione in locandina oltre la quale un film non è "un film con quell'attore". */
const MAX_BILLING_ORDER = 9;
/** Un candidato con meno voti di così è rumore: non lo teniamo nemmeno in memoria. */
const ABSOLUTE_MIN_VOTES = 20;

export interface HarvestProgress {
  done: number;
  total: number;
}

export interface HarvestResult {
  candidates: CandidateMovie[];
  /** Lacune rilevate: generi, decenni e filmografie incompiute. */
  gaps: Gap[];
  /** Richieste fallite. La lista resta usabile, solo più corta. */
  failed: number;
}

export interface HarvestOptions {
  signal?: AbortSignal;
  onProgress?: (progress: HarvestProgress) => void;
  /** Ignora la cache locale e richiede tutto a TMDB. */
  refresh?: boolean;
  now?: Date;
}

interface CachedList {
  fetchedAt: string;
  items: TmdbMovieListItem[];
}

interface CachedGenres {
  fetchedAt: string;
  genres: Array<{ id: number; name: string }>;
}

/** Una singola interrogazione a TMDB, con la provenienza da attribuire ai suoi risultati. */
interface HarvestRequest {
  key: string;
  source: CandidateSource;
  run: (signal?: AbortSignal) => Promise<TmdbMovieListItem[]>;
  /** Presente sulle filmografie da regista: serve a misurare quanto ne hai visto. */
  director?: PersonScore;
}

function isFresh(fetchedAt: string, ttl: number, now: Date) {
  const at = Date.parse(fetchedAt);
  return Number.isFinite(at) && now.getTime() - at < ttl;
}

function parseYear(releaseDate?: string): number | undefined {
  if (!releaseDate) return undefined;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isFinite(year) ? year : undefined;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Elenco dei generi TMDB, con la cache che evita di richiederlo a ogni visita. */
export async function loadGenres(options: HarvestOptions = {}): Promise<Map<number, string>> {
  const now = options.now ?? new Date();
  const key = "genres:movie";

  if (!options.refresh) {
    const cached = (await idbGetManySafe<CachedGenres>(HARVEST_STORE, [key])).get(key);
    if (cached && isFresh(cached.fetchedAt, GENRES_TTL_MS, now)) {
      return new Map(cached.genres.map((g) => [g.id, g.name]));
    }
  }

  const response = await getMovieGenres(options.signal);
  const genres = (response.genres ?? []).map((g) => ({ id: g.id, name: g.name }));
  await idbPutManySafe(HARVEST_STORE, [[key, { fetchedAt: now.toISOString(), genres } satisfies CachedGenres]]);
  return new Map(genres.map((g) => [g.id, g.name]));
}

function discoverRequest(key: string, source: CandidateSource, params: Record<string, string>): HarvestRequest {
  return {
    key,
    source,
    run: async (signal) => (await discoverMovies(params, signal)).results ?? [],
  };
}

/**
 * Costruisce l'elenco delle interrogazioni da fare a TMDB.
 *
 * Le prime tre famiglie servono la lista "per te" — film simili a quelli che hai amato,
 * filmografie di chi ti piace, il meglio dei tuoi generi — l'ultima serve le lacune, dove
 * per definizione non esiste un film già visto da cui partire e bisogna chiedere il catalogo.
 */
function buildPlan(profile: TasteProfile, gaps: Gap[], genreIds: Map<string, number>, now: Date): HarvestRequest[] {
  const requests: HarvestRequest[] = [];

  for (const seed of profile.seeds) {
    requests.push({
      key: `reco:${seed.tmdbId}`,
      source: { kind: "seed", movieId: seed.tmdbId, title: seed.title },
      run: async (signal) => (await getMovieRecommendations(seed.tmdbId, signal)).results ?? [],
    });
  }

  for (const person of profile.directors) {
    requests.push({
      key: `director:${person.id}`,
      source: { kind: "director", personId: person.id, name: person.name, quality: person.quality },
      director: person,
      run: async (signal) => {
        const credits = await getPersonMovieCredits(person.id, signal);
        return (credits.crew ?? []).filter((c) => c.job === "Director");
      },
    });
  }

  for (const person of profile.actors) {
    requests.push({
      key: `actor:${person.id}`,
      source: { kind: "actor", personId: person.id, name: person.name, quality: person.quality },
      run: async (signal) => {
        const credits = await getPersonMovieCredits(person.id, signal);
        return (credits.cast ?? []).filter((c) => (c.order ?? 0) <= MAX_BILLING_ORDER);
      },
    });
  }

  const loved = profile.genres.filter((g) => g.affinity >= 0 && genreIds.has(g.genre)).slice(0, LOVE_GENRES);
  for (const genre of loved) {
    const id = String(genreIds.get(genre.genre));
    requests.push(
      discoverRequest(`genre:${id}`, { kind: "genre", genre: genre.genre }, {
        with_genres: id,
        sort_by: "vote_average.desc",
        "vote_count.gte": LOVE_MIN_VOTES,
      }),
    );
  }

  // Solo per il genere principale: le uscite degli ultimi anni che ti sei perso.
  const top = loved[0];
  if (top) {
    const id = String(genreIds.get(top.genre));
    const from = new Date(now);
    from.setFullYear(from.getFullYear() - FRESH_YEARS);
    requests.push(
      discoverRequest(`fresh:${id}:${from.getFullYear()}`, { kind: "fresh", genre: top.genre }, {
        with_genres: id,
        sort_by: "popularity.desc",
        "vote_count.gte": FRESH_MIN_VOTES,
        "primary_release_date.gte": isoDate(from),
        "primary_release_date.lte": isoDate(now),
      }),
    );
  }

  for (const gap of gaps) {
    if (gap.kind === "genre") {
      const id = genreIds.get(gap.genre);
      if (id === undefined) continue;
      requests.push(
        discoverRequest(`gapGenre:${id}`, { kind: "gapGenre", genre: gap.genre }, {
          with_genres: String(id),
          sort_by: "vote_average.desc",
          "vote_count.gte": GAP_MIN_VOTES,
        }),
      );
    } else if (gap.kind === "era") {
      requests.push(
        discoverRequest(`gapEra:${gap.decade}`, { kind: "gapEra", decade: gap.decade }, {
          sort_by: "vote_average.desc",
          "vote_count.gte": GAP_MIN_VOTES,
          "primary_release_date.gte": `${gap.decade}-01-01`,
          "primary_release_date.lte": `${gap.decade + 9}-12-31`,
        }),
      );
    }
  }

  return requests;
}

/**
 * Interroga TMDB e restituisce i film non ancora visti, ciascuno con l'elenco dei motivi
 * per cui è finito nel mucchio. Non decide nulla sull'ordine: quello è compito di
 * `rankForYou` e `rankBlindSpots`, che lavorano sul risultato senza toccare la rete.
 */
export async function harvestCandidates(
  profile: TasteProfile,
  seen: SeenIndex,
  options: HarvestOptions = {},
): Promise<HarvestResult> {
  const now = options.now ?? new Date();
  const { signal, onProgress } = options;

  const genreNames = await loadGenres(options);
  const genreIds = new Map(Array.from(genreNames, ([id, name]) => [name, id] as const));

  const gaps: Gap[] = [...findGenreGaps(profile), ...findEraGaps(profile)];
  const plan = buildPlan(profile, gaps, genreIds, now);

  const candidates = new Map<number, CandidateMovie>();
  const directorGaps: Gap[] = [];
  const buffer: [IDBValidKey, unknown][] = [];
  const today = isoDate(now);
  let failed = 0;
  let done = 0;

  onProgress?.({ done, total: plan.length });

  const cachedLists = options.refresh
    ? new Map<IDBValidKey, CachedList>()
    : await idbGetManySafe<CachedList>(HARVEST_STORE, plan.map((request) => request.key));

  const absorb = (items: TmdbMovieListItem[], source: CandidateSource) => {
    for (const item of items) {
      if (!item.id || !item.title) continue;

      const voteCount = item.vote_count ?? 0;
      if (voteCount < ABSOLUTE_MIN_VOTES) continue;
      // Un film non ancora uscito non è un suggerimento: non lo puoi guardare stasera.
      if (!item.release_date || item.release_date > today) continue;

      const year = parseYear(item.release_date);
      if (isSeen(seen, { tmdbId: item.id, title: item.title, year })) continue;

      const existing = candidates.get(item.id);
      if (existing) {
        // Lo stesso film può arrivare da più strade: ognuna è un motivo in più per proporlo.
        if (!existing.sources.some((s) => s.kind === source.kind && sourceKey(s) === sourceKey(source))) {
          existing.sources.push(source);
        }
        continue;
      }

      candidates.set(item.id, {
        tmdbId: item.id,
        title: item.title,
        year,
        posterPath: item.poster_path ?? null,
        overview: item.overview,
        genres: (item.genre_ids ?? []).map((id) => genreNames.get(id)).filter((name): name is string => !!name),
        voteAverage: item.vote_average ?? 0,
        voteCount,
        popularity: item.popularity ?? 0,
        sources: [source],
      });
    }
  };

  await runPool(plan, CONCURRENCY, async (request) => {
    if (signal?.aborted) return;

    try {
      const cached = cachedLists.get(request.key);
      let items: TmdbMovieListItem[];

      if (cached && isFresh(cached.fetchedAt, CACHE_TTL_MS, now)) {
        items = cached.items;
      } else {
        items = await request.run(signal);
        buffer.push([request.key, { fetchedAt: now.toISOString(), items } satisfies CachedList]);
      }

      absorb(items, request.source);

      if (request.director) {
        // La filmografia appena letta dice quanto di questo regista ti manca.
        const gap = directorGap(request.director, items.length);
        if (gap) directorGaps.push(gap);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (isFatalTmdbError(err)) throw err;
      // Una lista che non arriva accorcia i suggerimenti, non li annulla.
      failed += 1;
    } finally {
      done += 1;
      onProgress?.({ done, total: plan.length });
    }
  });

  await idbPutManySafe(HARVEST_STORE, buffer);

  return {
    candidates: Array.from(candidates.values()),
    gaps: sortGaps([...gaps, ...sortGaps(directorGaps).slice(0, GAP_TUNING.maxDirectorGaps)]),
    failed,
  };
}

/** Identità di una provenienza, per non ripetere due volte lo stesso motivo su un film. */
function sourceKey(source: CandidateSource): string {
  switch (source.kind) {
    case "seed":
      return String(source.movieId);
    case "director":
    case "actor":
    case "gapDirector":
      return String(source.personId);
    case "genre":
    case "fresh":
    case "gapGenre":
      return source.genre;
    case "gapEra":
      return String(source.decade);
  }
}
