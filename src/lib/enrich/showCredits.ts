import { SHOW_CREDITS_STORE, SHOW_LOOKUP_STORE, idbGetManySafe, idbPutManySafe } from "@/lib/idb";
import { runPool } from "@/lib/enrich/pool";
import { TmdbError, getTvDetails, isFatalTmdbError, searchTv } from "@/lib/tmdb";
import { normalizeTitle } from "@/lib/analysis/movies";
import type { WatchedShow } from "@/lib/analysis/shows";
import type { ShowCredits } from "@/lib/types";

/** Quante richieste TMDB tenere in volo: sotto il rate limit del servizio, ma non lentissimo. */
const CONCURRENCY = 8;
/** Ogni quante voci svuotare il buffer di scrittura su IndexedDB. */
const FLUSH_EVERY = 25;
/**
 * Il cast di una serie lunga può contare centinaia di nomi fra ricorrenti e comparsate:
 * oltre questa soglia sono figure che non spostano nessuna classifica.
 */
const CAST_LIMIT = 20;

export interface ShowEnrichProgress {
  done: number;
  total: number;
}

export interface ShowCreditsSnapshot {
  credits: Map<number, ShowCredits>;
  /** showKey → tmdbId, per le serie il cui id è stato risolto con una ricerca. */
  resolved: Map<string, number>;
  /** Chiavi delle serie che TMDB non conosce: cercarle di nuovo è solo tempo sprecato. */
  unresolvable: Set<string>;
  /** Titoli senza riscontro su TMDB, per il resoconto all'utente. */
  notFound: string[];
  /** Serie la cui richiesta è fallita: vale la pena ritentare più tardi. */
  failed: string[];
}

function emptySnapshot(): ShowCreditsSnapshot {
  return { credits: new Map(), resolved: new Map(), unresolvable: new Set(), notFound: [], failed: [] };
}

function lookupKey(show: WatchedShow) {
  return `${normalizeTitle(show.title)}|${show.year ?? ""}`;
}

/**
 * Id TMDB da usare per questa serie. L'esito di una ricerca ha la precedenza sull'id
 * dell'import: si scrive solo quando quell'id si è rivelato sbagliato, e senza questa
 * precedenza la serie resterebbe in coda per sempre, rifetchata a ogni apertura.
 */
export function effectiveShowId(show: WatchedShow, snapshot: ShowCreditsSnapshot): number | undefined {
  return snapshot.resolved.get(show.key) ?? show.tmdbId;
}

/** Legge solo ciò che è già in cache locale, senza nessuna chiamata di rete. */
export async function readCachedShowCredits(shows: WatchedShow[]): Promise<ShowCreditsSnapshot> {
  const snapshot = emptySnapshot();
  if (shows.length === 0) return snapshot;

  // Le ricerche si rileggono per tutte le serie, non solo per quelle senza id: anche una
  // serie che l'import diceva di conoscere può essere stata risolta per titolo.
  const keys = Array.from(new Set(shows.map(lookupKey)));
  const cachedLookups = await idbGetManySafe<number | null>(SHOW_LOOKUP_STORE, keys);
  for (const show of shows) {
    const cached = cachedLookups.get(lookupKey(show));
    if (typeof cached === "number") snapshot.resolved.set(show.key, cached);
    // null è un esito memorizzato: TMDB non ha questa serie.
    else if (cached === null) snapshot.unresolvable.add(show.key);
  }

  const ids = new Set<number>();
  for (const show of shows) {
    const id = effectiveShowId(show, snapshot);
    if (id) ids.add(id);
  }

  const cached = await idbGetManySafe<ShowCredits>(SHOW_CREDITS_STORE, Array.from(ids));
  cached.forEach((value, key) => {
    if (value.genres !== undefined) snapshot.credits.set(key as number, value);
  });

  return snapshot;
}

/**
 * Riscrive `tmdbId` con l'id davvero valido, così tutto ciò che sta a valle può
 * limitarsi a leggere `show.tmdbId` senza sapere nulla di ricerche e id stantii.
 */
export function applyResolvedIds(shows: WatchedShow[], snapshot: ShowCreditsSnapshot): WatchedShow[] {
  return shows.map((show) => {
    const id = effectiveShowId(show, snapshot);
    return id === show.tmdbId ? show : { ...show, tmdbId: id };
  });
}

/** Serie che, dopo la lettura della cache, hanno ancora bisogno della rete. */
export function pendingShows(shows: WatchedShow[], snapshot: ShowCreditsSnapshot): WatchedShow[] {
  return shows.filter((show) => {
    const id = effectiveShowId(show, snapshot);
    if (id && snapshot.credits.has(id)) return false;
    return !snapshot.unresolvable.has(show.key);
  });
}

async function resolveTvId(show: WatchedShow, signal?: AbortSignal): Promise<number | null> {
  const byYear = await searchTv(show.title, show.year, signal);
  if (byYear.results?.length) return byYear.results[0].id;

  // L'anno dell'export può discostarsi dalla prima messa in onda TMDB (anteprime, mercati diversi).
  if (show.year) {
    const byTitle = await searchTv(show.title, undefined, signal);
    if (byTitle.results?.length) return byTitle.results[0].id;
  }
  return null;
}

/** "1998-04-12" → 1998. Alcune serie TMDB non hanno una first_air_date: in quel caso resta undefined. */
function parseAirYear(airDate?: string): number | undefined {
  if (!airDate) return undefined;
  const year = Number(airDate.slice(0, 4));
  return Number.isFinite(year) ? year : undefined;
}

/**
 * Durata media di un episodio. `episode_run_time` è spesso vuoto sulle serie recenti,
 * dove TMDB tiene la durata solo sui singoli episodi: l'ultimo andato in onda è il
 * campione più economico da cui ricavarla.
 */
function episodeRuntimeOf(response: { episode_run_time?: number[]; last_episode_to_air?: { runtime?: number | null } | null }) {
  const runtimes = (response.episode_run_time ?? []).filter((r) => Number.isFinite(r) && r > 0);
  if (runtimes.length > 0) return runtimes.reduce((sum, r) => sum + r, 0) / runtimes.length;

  const last = response.last_episode_to_air?.runtime;
  return typeof last === "number" && last > 0 ? last : undefined;
}

/** Episodi in cui l'interprete compare: `total_episode_count` manca su alcune risposte, i ruoli no. */
function castEpisodeCount(member: { total_episode_count?: number; roles?: Array<{ episode_count?: number }> }) {
  if (typeof member.total_episode_count === "number") return member.total_episode_count;
  const fromRoles = (member.roles ?? []).reduce((sum, role) => sum + (role.episode_count ?? 0), 0);
  return fromRoles > 0 ? fromRoles : undefined;
}

async function fetchShowCredits(tmdbId: number, signal?: AbortSignal): Promise<ShowCredits> {
  const response = await getTvDetails(tmdbId, signal);
  return {
    tmdbId,
    creators: (response.created_by ?? []).map((c) => ({ id: c.id, name: c.name })),
    cast: (response.aggregate_credits?.cast ?? [])
      .slice(0, CAST_LIMIT)
      .map((c) => ({ id: c.id, name: c.name, order: c.order, episodeCount: castEpisodeCount(c) })),
    genres: (response.genres ?? []).map((g) => g.name),
    voteAverage: typeof response.vote_average === "number" ? response.vote_average : undefined,
    year: parseAirYear(response.first_air_date),
    totalEpisodes: typeof response.number_of_episodes === "number" ? response.number_of_episodes : undefined,
    totalSeasons: typeof response.number_of_seasons === "number" ? response.number_of_seasons : undefined,
    episodeRuntime: episodeRuntimeOf(response),
    status: response.status,
    fetchedAt: new Date().toISOString(),
  };
}

export interface ShowEnrichOptions {
  onProgress?: (progress: ShowEnrichProgress) => void;
  signal?: AbortSignal;
  /** Snapshot già letto dalla cache, per non rileggerla due volte. */
  cached?: ShowCreditsSnapshot;
}

/**
 * Completa la cache dei dati delle serie interrogando TMDB per quelle mancanti.
 *
 * L'id che arriva dagli import è quello della serie su TMDB, ma non tutte le sorgenti
 * lo garantiscono: se l'id non risponde si ripiega sulla ricerca per titolo, invece di
 * lasciare la serie senza dati per un id sbagliato.
 */
export async function enrichShows(shows: WatchedShow[], options: ShowEnrichOptions = {}): Promise<ShowCreditsSnapshot> {
  const { onProgress, signal } = options;
  const snapshot = options.cached ?? (await readCachedShowCredits(shows));
  const pending = pendingShows(shows, snapshot);

  const total = pending.length;
  let done = 0;
  onProgress?.({ done, total });
  if (total === 0) return snapshot;

  const creditsBuffer: [IDBValidKey, unknown][] = [];
  const lookupBuffer: [IDBValidKey, unknown][] = [];

  const flush = async () => {
    const credits = creditsBuffer.splice(0, creditsBuffer.length);
    const lookups = lookupBuffer.splice(0, lookupBuffer.length);
    await Promise.all([
      idbPutManySafe(SHOW_CREDITS_STORE, credits),
      idbPutManySafe(SHOW_LOOKUP_STORE, lookups),
    ]);
  };

  await runPool(pending, CONCURRENCY, async (show) => {
    if (signal?.aborted) return;

    try {
      let tmdbId = effectiveShowId(show, snapshot);
      let credits: ShowCredits | undefined;

      if (tmdbId) {
        credits = snapshot.credits.get(tmdbId);
        if (!credits) {
          try {
            credits = await fetchShowCredits(tmdbId, signal);
          } catch (err) {
            // Id che non corrisponde a nessuna serie: l'import lo dava per buono, TMDB no.
            if (!(err instanceof TmdbError) || err.status !== 404) throw err;
            tmdbId = undefined;
          }
        }
      }

      if (!credits) {
        const found = await resolveTvId(show, signal);
        lookupBuffer.push([lookupKey(show), found]);
        if (found === null) {
          snapshot.unresolvable.add(show.key);
          snapshot.notFound.push(show.title);
          return;
        }
        tmdbId = found;
        snapshot.resolved.set(show.key, found);
        credits = snapshot.credits.get(found) ?? (await fetchShowCredits(found, signal));
      }

      if (tmdbId !== undefined && !snapshot.credits.has(tmdbId)) {
        snapshot.credits.set(tmdbId, credits);
        creditsBuffer.push([tmdbId, credits]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (isFatalTmdbError(err)) throw err;
      snapshot.failed.push(show.title);
    } finally {
      done += 1;
      onProgress?.({ done, total });
      if (creditsBuffer.length + lookupBuffer.length >= FLUSH_EVERY) await flush();
    }
  });

  await flush();
  return snapshot;
}
