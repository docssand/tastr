export interface TmdbMovieResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  popularity?: number;
}

export interface TmdbSearchResponse {
  results: TmdbMovieResult[];
}

export interface TmdbCastMember {
  id: number;
  name: string;
  order?: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job?: string;
  department?: string;
}

export interface TmdbCreditsResponse {
  id: number;
  cast?: TmdbCastMember[];
  crew?: TmdbCrewMember[];
}

/** Errore che espone lo status HTTP, così il chiamante distingue "chiave mancante" da "film non trovato". */
export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

const MAX_RETRIES = 3;

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Operazione annullata", "AbortError"));
      },
      { once: true },
    );
  });
}

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const url = `/api/tmdb/${path}${query ? `?${query}` : ""}`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal });
    if (res.ok) return res.json();

    // 429 = rate limit TMDB, 5xx = intoppo temporaneo: entrambi vale la pena ritentarli.
    // Il 503 lo emette il nostro proxy quando manca la chiave: ritentarlo è inutile.
    const retriable = res.status === 429 || (res.status >= 500 && res.status !== 503);
    if (!retriable || attempt >= MAX_RETRIES) {
      throw new TmdbError(`Richiesta TMDB fallita (${res.status})`, res.status);
    }

    const retryAfter = Number(res.headers.get("retry-after"));
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt, signal);
  }
}

/**
 * Errori che non ha senso assorbire film per film: chiave mancante o non valida.
 * Riguardano tutta la sessione, quindi l'arricchimento si ferma subito.
 */
export function isFatalTmdbError(err: unknown): err is TmdbError {
  return err instanceof TmdbError && [401, 403, 503].includes(err.status);
}

export function searchMovie(title: string, year?: number, signal?: AbortSignal) {
  const params: Record<string, string> = { query: title };
  if (year) params.year = String(year);
  return tmdbFetch<TmdbSearchResponse>("search/movie", params, signal);
}

export function getMovieCredits(tmdbId: number, signal?: AbortSignal) {
  return tmdbFetch<TmdbCreditsResponse>(`movie/${tmdbId}/credits`, {}, signal);
}
