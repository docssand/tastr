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

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbGenreListResponse {
  genres: TmdbGenre[];
}

/** Forma con cui TMDB restituisce un film dentro una lista (discover, raccomandazioni, filmografie). */
export interface TmdbMovieListItem {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
}

export interface TmdbMovieListResponse {
  page?: number;
  results?: TmdbMovieListItem[];
  total_pages?: number;
  total_results?: number;
}

/** Voce di `person/{id}/movie_credits`: un film della filmografia, con il ruolo svolto. */
export interface TmdbPersonCreditItem extends TmdbMovieListItem {
  job?: string;
  department?: string;
  order?: number;
}

export interface TmdbPersonCreditsResponse {
  id: number;
  cast?: TmdbPersonCreditItem[];
  crew?: TmdbPersonCreditItem[];
}

export interface TmdbMovieDetailsResponse {
  id: number;
  genres?: TmdbGenre[];
  vote_average?: number;
  release_date?: string;
  credits?: TmdbCreditsResponse;
}

export interface TmdbTvResult {
  id: number;
  name: string;
  first_air_date?: string;
  poster_path?: string | null;
  popularity?: number;
}

export interface TmdbTvSearchResponse {
  results?: TmdbTvResult[];
}

/**
 * Voce di `aggregate_credits`: in una serie una persona non ha un ruolo solo, e quello
 * che conta non è dove sta in locandina ma in quanti episodi compare davvero.
 */
export interface TmdbAggregateCastMember {
  id: number;
  name: string;
  order?: number;
  total_episode_count?: number;
  roles?: Array<{ episode_count?: number }>;
}

export interface TmdbAggregateCreditsResponse {
  cast?: TmdbAggregateCastMember[];
}

export interface TmdbTvDetailsResponse {
  id: number;
  name?: string;
  genres?: TmdbGenre[];
  vote_average?: number;
  first_air_date?: string;
  number_of_episodes?: number;
  number_of_seasons?: number;
  /** TMDB la dà come lista (le serie antologiche hanno più formati) e spesso vuota. */
  episode_run_time?: number[];
  last_episode_to_air?: { runtime?: number | null } | null;
  status?: string;
  created_by?: Array<{ id: number; name: string }>;
  aggregate_credits?: TmdbAggregateCreditsResponse;
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

/** `append_to_response=credits` evita una seconda chiamata per generi/voto e cast/regia. */
export function getMovieDetails(tmdbId: number, signal?: AbortSignal) {
  return tmdbFetch<TmdbMovieDetailsResponse>(`movie/${tmdbId}`, { append_to_response: "credits" }, signal);
}

export function searchTv(title: string, year?: number, signal?: AbortSignal) {
  const params: Record<string, string> = { query: title };
  if (year) params.first_air_date_year = String(year);
  return tmdbFetch<TmdbTvSearchResponse>("search/tv", params, signal);
}

/**
 * Dettagli di una serie. `aggregate_credits` e non `credits`: quest'ultimo, su una serie,
 * restituisce il cast del solo ultimo episodio andato in onda.
 */
export function getTvDetails(tmdbId: number, signal?: AbortSignal) {
  return tmdbFetch<TmdbTvDetailsResponse>(`tv/${tmdbId}`, { append_to_response: "aggregate_credits" }, signal);
}

/** Film che TMDB considera vicini a questo: il seme delle raccomandazioni "simili a…". */
export function getMovieRecommendations(tmdbId: number, signal?: AbortSignal) {
  return tmdbFetch<TmdbMovieListResponse>(`movie/${tmdbId}/recommendations`, {}, signal);
}

/** Filmografia completa di una persona, come interprete e come membro della troupe. */
export function getPersonMovieCredits(personId: number, signal?: AbortSignal) {
  return tmdbFetch<TmdbPersonCreditsResponse>(`person/${personId}/movie_credits`, {}, signal);
}

/**
 * Ricerca per criteri (genere, intervallo di uscita, numero minimo di voti).
 * È il modo per farsi dare da TMDB i titoli di riferimento di un genere o di un decennio
 * che l'utente non ha mai esplorato: lì non c'è nessun film già visto da cui partire.
 */
export function discoverMovies(params: Record<string, string>, signal?: AbortSignal) {
  return tmdbFetch<TmdbMovieListResponse>("discover/movie", { include_adult: "false", ...params }, signal);
}

/**
 * Elenco dei generi con i rispettivi id, necessario perché discover filtra per id mentre
 * il resto dell'app ragiona per nome. Le chiamate restano tutte in lingua predefinita
 * (inglese): i nomi dei generi devono combaciare con quelli già salvati nella cache dei credits.
 */
export function getMovieGenres(signal?: AbortSignal) {
  return tmdbFetch<TmdbGenreListResponse>("genre/movie/list", {}, signal);
}
