import { CREDITS_STORE, LOOKUP_STORE, idbGetMany, idbPutMany, isIdbAvailable } from "@/lib/idb";
import { getMovieDetails, isFatalTmdbError, searchMovie } from "@/lib/tmdb";
import { normalizeTitle, type WatchedMovie } from "@/lib/analysis/movies";
import type { MovieCredits } from "@/lib/types";

/** Quante richieste TMDB tenere in volo: sotto il rate limit del servizio, ma non lentissimo. */
const CONCURRENCY = 8;
/** Ogni quante voci svuotare il buffer di scrittura su IndexedDB. */
const FLUSH_EVERY = 25;
/** Il cast oltre questa posizione non serve a nessuna analisi: non lo salviamo. */
const CAST_LIMIT = 12;

export interface EnrichProgress {
  done: number;
  total: number;
}

export interface CreditsSnapshot {
  credits: Map<number, MovieCredits>;
  /** movieKey → tmdbId, per i film il cui id è stato risolto con una ricerca. */
  resolved: Map<string, number>;
  /** Chiavi dei film che TMDB non conosce: cercarli di nuovo è solo tempo sprecato. */
  unresolvable: Set<string>;
  /** Titoli dei film senza riscontro su TMDB, per il resoconto all'utente. */
  notFound: string[];
  /** Film la cui richiesta è fallita: vale la pena ritentare a un import successivo. */
  failed: string[];
}

function emptySnapshot(): CreditsSnapshot {
  return { credits: new Map(), resolved: new Map(), unresolvable: new Set(), notFound: [], failed: [] };
}

function lookupKey(movie: WatchedMovie) {
  return `${normalizeTitle(movie.title)}|${movie.year ?? ""}`;
}

async function safeGetMany<T>(store: string, keys: IDBValidKey[]): Promise<Map<IDBValidKey, T>> {
  if (!isIdbAvailable()) return new Map();
  try {
    return await idbGetMany<T>(store, keys);
  } catch {
    // Modalità privata, quota piena, storage bloccato: si degrada a "nessuna cache".
    return new Map();
  }
}

async function safePutMany(store: string, entries: [IDBValidKey, unknown][]) {
  if (!isIdbAvailable() || entries.length === 0) return;
  try {
    await idbPutMany(store, entries);
  } catch {
    // Ignorato di proposito: la cache è un'ottimizzazione, non un requisito.
  }
}

/** Legge solo ciò che è già in cache locale, senza nessuna chiamata di rete. */
export async function readCachedCredits(movies: WatchedMovie[]): Promise<CreditsSnapshot> {
  const snapshot = emptySnapshot();
  if (movies.length === 0) return snapshot;

  const unresolved = movies.filter((m) => !m.tmdbId);
  if (unresolved.length > 0) {
    const keys = Array.from(new Set(unresolved.map(lookupKey)));
    const cachedLookups = await safeGetMany<number | null>(LOOKUP_STORE, keys);
    for (const movie of unresolved) {
      const cached = cachedLookups.get(lookupKey(movie));
      if (typeof cached === "number") snapshot.resolved.set(movie.key, cached);
      // null è un esito memorizzato: TMDB non ha questo titolo.
      else if (cached === null) snapshot.unresolvable.add(movie.key);
    }
  }

  const ids = new Set<number>();
  for (const movie of movies) {
    const id = movie.tmdbId ?? snapshot.resolved.get(movie.key);
    if (id) ids.add(id);
  }

  const cachedCredits = await safeGetMany<MovieCredits>(CREDITS_STORE, Array.from(ids));
  cachedCredits.forEach((value, key) => {
    // Le cache scritte prima dell'introduzione di generi/voto TMDB non hanno `genres`:
    // trattarle come assenti forza un refetch che le completa, invece di lasciarle monche.
    if (value.genres !== undefined) snapshot.credits.set(key as number, value);
  });

  return snapshot;
}

/** Film che, dopo la lettura della cache, hanno ancora bisogno della rete. */
export function pendingMovies(movies: WatchedMovie[], snapshot: CreditsSnapshot): WatchedMovie[] {
  return movies.filter((movie) => {
    if (snapshot.unresolvable.has(movie.key)) return false;
    const id = movie.tmdbId ?? snapshot.resolved.get(movie.key);
    return !id || !snapshot.credits.has(id);
  });
}

/**
 * Esegue `worker` su tutti gli item con al massimo `limit` chiamate in volo.
 * Se un worker solleva un errore, gli altri si fermano al giro successivo:
 * senza questo, una chiave TMDB mancante farebbe partire migliaia di richieste inutili.
 */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  let stopped = false;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length && !stopped) {
      try {
        await worker(items[cursor++]);
      } catch (err) {
        stopped = true;
        throw err;
      }
    }
  });
  await Promise.all(runners);
}

async function resolveTmdbId(movie: WatchedMovie, signal?: AbortSignal): Promise<number | null> {
  const byYear = await searchMovie(movie.title, movie.year, signal);
  if (byYear.results?.length) return byYear.results[0].id;

  // L'anno dell'export può discostarsi da quello di TMDB (uscita festival vs distribuzione).
  if (movie.year) {
    const byTitle = await searchMovie(movie.title, undefined, signal);
    if (byTitle.results?.length) return byTitle.results[0].id;
  }
  return null;
}

async function fetchCredits(tmdbId: number, signal?: AbortSignal): Promise<MovieCredits> {
  const response = await getMovieDetails(tmdbId, signal);
  return {
    tmdbId,
    directors: (response.credits?.crew ?? [])
      .filter((c) => c.job === "Director")
      .map((c) => ({ id: c.id, name: c.name })),
    cast: (response.credits?.cast ?? [])
      .slice(0, CAST_LIMIT)
      .map((c) => ({ id: c.id, name: c.name, order: c.order })),
    genres: (response.genres ?? []).map((g) => g.name),
    voteAverage: typeof response.vote_average === "number" ? response.vote_average : undefined,
    fetchedAt: new Date().toISOString(),
  };
}

export interface EnrichOptions {
  onProgress?: (progress: EnrichProgress) => void;
  signal?: AbortSignal;
  /** Snapshot già letto dalla cache, per non rileggerla due volte. */
  cached?: CreditsSnapshot;
}

/**
 * Completa la cache dei credits interrogando TMDB per i film mancanti.
 * Ogni risultato viene scritto su IndexedDB, quindi un secondo import sugli stessi
 * film non costa nessuna richiesta.
 */
export async function enrichMovies(movies: WatchedMovie[], options: EnrichOptions = {}): Promise<CreditsSnapshot> {
  const { onProgress, signal } = options;
  const snapshot = options.cached ?? (await readCachedCredits(movies));
  const pending = pendingMovies(movies, snapshot);

  const total = pending.length;
  let done = 0;
  onProgress?.({ done, total });
  if (total === 0) return snapshot;

  const creditsBuffer: [IDBValidKey, unknown][] = [];
  const lookupBuffer: [IDBValidKey, unknown][] = [];

  const flush = async () => {
    const credits = creditsBuffer.splice(0, creditsBuffer.length);
    const lookups = lookupBuffer.splice(0, lookupBuffer.length);
    await Promise.all([safePutMany(CREDITS_STORE, credits), safePutMany(LOOKUP_STORE, lookups)]);
  };

  await runPool(pending, CONCURRENCY, async (movie) => {
    if (signal?.aborted) return;

    try {
      let tmdbId = movie.tmdbId ?? snapshot.resolved.get(movie.key);

      if (!tmdbId) {
        const found = await resolveTmdbId(movie, signal);
        lookupBuffer.push([lookupKey(movie), found]);
        if (found === null) {
          snapshot.unresolvable.add(movie.key);
          snapshot.notFound.push(movie.title);
          return;
        }
        tmdbId = found;
        snapshot.resolved.set(movie.key, found);
      }

      if (!snapshot.credits.has(tmdbId)) {
        const credits = await fetchCredits(tmdbId, signal);
        snapshot.credits.set(tmdbId, credits);
        creditsBuffer.push([tmdbId, credits]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (isFatalTmdbError(err)) throw err;
      // Un 404 su un id stantio non deve interrompere l'analisi degli altri film.
      snapshot.failed.push(movie.title);
    } finally {
      done += 1;
      onProgress?.({ done, total });
      if (creditsBuffer.length + lookupBuffer.length >= FLUSH_EVERY) await flush();
    }
  });

  await flush();
  return snapshot;
}
