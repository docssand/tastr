import { clamp01, rescale } from "@/lib/analysis/stats";
import type { PersonScore } from "@/lib/analysis/people";
import type { TasteProfile } from "@/lib/analysis/taste";

/**
 * Parametri del motore di suggerimenti.
 *
 *   voto_bayesiano = (voto · voti + priorMean · priorVotes) / (voti + priorVotes)
 *   consenso       = riscala(voto_bayesiano, crowdFloor, crowdCeiling)        → 0…1
 *   gusto          = base + generi + epoca + provenienza                      → 0…1
 *   punteggio      = gusto · (1 + crowdWeight · fiducia_nel_consenso · (2·consenso − 1))
 *
 * Lo shrinkage bayesiano sul voto pubblico è ciò che impedisce a un film con nove voti
 * e media 9.4 di scavalcare un classico con centomila voti: senza, la lista si riempirebbe
 * di titoli che nessuno ha visto.
 */
export const RECO_TUNING = {
  /** Voto medio di riferimento su TMDB e "voti fantasma" assegnati a quel valore. */
  priorMean: 6.3,
  priorVotes: 500,
  /** Estremi entro cui il voto bayesiano diventa un consenso 0-1. */
  crowdFloor: 5.5,
  crowdCeiling: 8,
  /** Quanto il consenso può spostare il punteggio, prima di essere pesato per la tua fiducia. */
  crowdWeight: 0.6,

  /** Componenti del punteggio di gusto. Sommate al netto dei clamp danno al massimo 1. */
  tasteBase: 0.1,
  genreWeight: 0.4,
  eraWeight: 0.12,
  /** Dentro un genere: quanto conta averlo guardato molto contro quanto conta averlo votato bene. */
  familiarityShare: 0.6,
  affinityShare: 0.4,
  /** Il genere che calza meglio conta più della media di tutti i generi del film. */
  bestGenreShare: 0.6,

  /** Spinta massima per provenienza del candidato (regista amato, film simile, genere di testa). */
  directorPull: [0.35, 0.7] as [number, number],
  actorPull: [0.2, 0.45] as [number, number],
  seedPull: 0.35,
  genrePull: 0.12,
  freshPull: 0.15,
  /** Estremi della qualità di una persona (da `rankPeople`) usati per riscalare la spinta. */
  personQualityLow: 0.85,
  personQualityHigh: 1.6,

  /** Voti minimi perché un candidato entri nelle due liste. Le lacune vogliono titoli riconosciuti. */
  minVotes: 40,
  minGapVotes: 300,
  /** Quanto un genere che ami rende più accessibile un film che colma una lacuna. */
  bridgeWeight: 0.35,
  /** Quanto il consenso pesa di più fra i film-lacuna: lì cerchiamo il titolo giusto, non la sorpresa. */
  gapCrowdExponent: 1.5,

  /** Massimo di titoli per singola provenienza (un regista non può occupare la lista). */
  maxPerSource: 2,
  /** Massimo di titoli per singola lacuna, per non ridurre la lista a un solo buco. */
  maxPerGap: 4,
  /** Quante motivazioni mostrare su una scheda. */
  maxReasons: 3,
  /** Consenso oltre il quale un film si può definire "riconosciuto da tutti". */
  acclaimedThreshold: 0.85,
} as const;

/**
 * Quote di riferimento con cui si misurano le lacune: quanto pesa ciascun genere e ciascun
 * decennio in una dieta cinematografica ampia. Non sono dati misurati, sono una scelta
 * editoriale — l'unica alternativa sarebbe interrogare TMDB su tutto il catalogo — e stanno
 * qui apposta per essere ritarate in un punto solo. Vengono normalizzate a somma 1, così
 * cambiare un valore non obbliga a ribilanciare gli altri a mano.
 */
export const GAP_REFERENCE = {
  genres: {
    Drama: 0.17,
    Comedy: 0.12,
    Thriller: 0.09,
    Action: 0.09,
    Adventure: 0.06,
    Crime: 0.06,
    Romance: 0.06,
    Horror: 0.05,
    "Science Fiction": 0.05,
    Animation: 0.04,
    Fantasy: 0.04,
    Mystery: 0.04,
    Documentary: 0.03,
    Family: 0.03,
    War: 0.025,
    History: 0.025,
    Music: 0.02,
    Western: 0.015,
  } as Record<string, number>,
  decades: {
    1930: 0.02,
    1940: 0.02,
    1950: 0.04,
    1960: 0.05,
    1970: 0.07,
    1980: 0.09,
    1990: 0.13,
    2000: 0.16,
    2010: 0.21,
    2020: 0.21,
  } as Record<number, number>,
} as const;

export const GAP_TUNING = {
  /** Sotto questo scarto dalla quota di riferimento non è una lacuna, è una preferenza. */
  minSeverity: 0.5,
  maxGenreGaps: 3,
  maxEraGaps: 2,
  maxDirectorGaps: 3,
  /** Film diretti sotto i quali una filmografia è troppo corta per parlare di lacuna. */
  minFilmography: 4,
  /** Copertura della filmografia sopra la quale il regista non è più una lacuna. */
  maxDirectorCoverage: 0.6,
  /** Un regista è "da recuperare" solo se i suoi film ti sono piaciuti più della tua media. */
  minDirectorDelta: 0.1,
} as const;

// --- candidati ------------------------------------------------------------------------------

/** Da dove arriva un candidato: è insieme il motivo per cui lo proponiamo e il suo peso. */
export type CandidateSource =
  | { kind: "seed"; movieId: number; title: string }
  | { kind: "director"; personId: number; name: string; quality: number }
  | { kind: "actor"; personId: number; name: string; quality: number }
  | { kind: "genre"; genre: string }
  | { kind: "fresh"; genre: string }
  | { kind: "gapGenre"; genre: string }
  | { kind: "gapEra"; decade: number }
  | { kind: "gapDirector"; personId: number; name: string };

export interface CandidateMovie {
  tmdbId: number;
  title: string;
  year?: number;
  posterPath: string | null;
  overview?: string;
  genres: string[];
  voteAverage: number;
  voteCount: number;
  popularity: number;
  sources: CandidateSource[];
}

// --- lacune ---------------------------------------------------------------------------------

export type Gap =
  | { kind: "genre"; key: string; genre: string; seenCount: number; share: number; reference: number; severity: number; priority: number }
  | { kind: "era"; key: string; decade: number; seenCount: number; share: number; reference: number; severity: number; priority: number }
  | {
      kind: "director";
      key: string;
      personId: number;
      name: string;
      seenCount: number;
      filmography: number;
      severity: number;
      priority: number;
    };

function normalized(reference: Record<string | number, number>) {
  const total = Object.values(reference).reduce((sum, v) => sum + v, 0);
  return { reference, total };
}

/**
 * Generi in cui hai un buco: quota di visione molto sotto la quota di riferimento.
 * `severity` è quanto manca alla quota attesa, `priority` la pesa per l'importanza del
 * genere — non aver mai visto un western conta meno che non aver mai visto un dramma.
 */
export function findGenreGaps(profile: TasteProfile): Gap[] {
  const { reference, total } = normalized(GAP_REFERENCE.genres);
  const seen = new Map(profile.genres.map((g) => [g.genre, g]));
  const maxReference = Math.max(...Object.values(reference)) / total;

  const gaps: Gap[] = [];
  for (const [genre, rawReference] of Object.entries(reference)) {
    const expected = rawReference / total;
    const taste = seen.get(genre);
    const share = taste?.share ?? 0;
    const severity = clamp01(1 - share / expected);
    if (severity < GAP_TUNING.minSeverity) continue;

    gaps.push({
      kind: "genre",
      key: `genre:${genre}`,
      genre,
      seenCount: taste?.count ?? 0,
      share,
      reference: expected,
      severity,
      priority: severity * Math.sqrt(expected / maxReference),
    });
  }

  return gaps.sort((a, b) => b.priority - a.priority).slice(0, GAP_TUNING.maxGenreGaps);
}

/** Come `findGenreGaps`, ma sui decenni di uscita: i "anni" che non hai mai attraversato. */
export function findEraGaps(profile: TasteProfile): Gap[] {
  const { reference, total } = normalized(GAP_REFERENCE.decades);
  const seen = new Map(profile.eras.map((e) => [e.decade, e]));
  const maxReference = Math.max(...Object.values(reference)) / total;

  const gaps: Gap[] = [];
  for (const [rawDecade, rawReference] of Object.entries(reference)) {
    const decade = Number(rawDecade);
    const expected = rawReference / total;
    const taste = seen.get(decade);
    const share = taste?.share ?? 0;
    const severity = clamp01(1 - share / expected);
    if (severity < GAP_TUNING.minSeverity) continue;

    gaps.push({
      kind: "era",
      key: `era:${decade}`,
      decade,
      seenCount: taste?.count ?? 0,
      share,
      reference: expected,
      severity,
      priority: severity * Math.sqrt(expected / maxReference),
    });
  }

  return gaps.sort((a, b) => b.priority - a.priority).slice(0, GAP_TUNING.maxEraGaps);
}

/**
 * Filmografia incompiuta: un regista che ti è piaciuto e di cui hai visto poco.
 * A differenza delle altre due, questa lacuna si può calcolare solo dopo aver chiesto a TMDB
 * quanti film ha diretto: `filmography` arriva da lì.
 */
export function directorGap(person: PersonScore, filmography: number): Gap | null {
  if (filmography < GAP_TUNING.minFilmography) return null;
  if (person.delta < GAP_TUNING.minDirectorDelta) return null;

  const coverage = person.movieCount / filmography;
  if (coverage > GAP_TUNING.maxDirectorCoverage) return null;

  const severity = clamp01(1 - coverage);
  return {
    kind: "director",
    key: `director:${person.id}`,
    personId: person.id,
    name: person.name,
    seenCount: person.movieCount,
    filmography,
    severity,
    // Un regista che hai votato molto sopra la tua media vale più di uno appena sopra.
    priority: severity * clamp01(0.4 + person.delta),
  };
}

export function sortGaps(gaps: Gap[]): Gap[] {
  return [...gaps].sort((a, b) => b.priority - a.priority);
}

// --- punteggio dei candidati ----------------------------------------------------------------

export type RecommendationReason =
  | { kind: "director"; name: string }
  | { kind: "actor"; name: string }
  | { kind: "similarTo"; title: string }
  | { kind: "genreLove"; genre: string }
  | { kind: "eraLove"; decade: number }
  | { kind: "genreGap"; genre: string }
  | { kind: "eraGap"; decade: number }
  | { kind: "directorGap"; name: string; seen: number; total: number }
  | { kind: "acclaimed" };

export interface Recommendation {
  candidate: CandidateMovie;
  score: number;
  /** Quanto somiglia al tuo gusto, 0-1. */
  taste: number;
  /** Quanto piace al pubblico, 0-1, dopo lo shrinkage bayesiano. */
  crowd: number;
  reasons: RecommendationReason[];
  /** Per la lista lacune: quale buco riempie questo titolo. */
  gap?: Gap;
}

/** Voto pubblico portato verso la media generale quando i voti sono pochi. */
export function bayesianRating(voteAverage: number, voteCount: number) {
  return (
    (voteAverage * voteCount + RECO_TUNING.priorMean * RECO_TUNING.priorVotes) /
    (voteCount + RECO_TUNING.priorVotes)
  );
}

export function crowdSignal(candidate: CandidateMovie) {
  return rescale(bayesianRating(candidate.voteAverage, candidate.voteCount), RECO_TUNING.crowdFloor, RECO_TUNING.crowdCeiling);
}

function decadeOf(year: number) {
  return Math.floor(year / 10) * 10;
}

function personPull(quality: number, [low, high]: [number, number]) {
  const t = clamp01((quality - RECO_TUNING.personQualityLow) / (RECO_TUNING.personQualityHigh - RECO_TUNING.personQualityLow));
  return low + (high - low) * t;
}

function sourcePull(source: CandidateSource): number {
  switch (source.kind) {
    case "director":
      return personPull(source.quality, RECO_TUNING.directorPull);
    case "actor":
      return personPull(source.quality, RECO_TUNING.actorPull);
    case "seed":
      return RECO_TUNING.seedPull;
    case "genre":
      return RECO_TUNING.genrePull;
    case "fresh":
      return RECO_TUNING.freshPull;
    default:
      // Le provenienze da lacuna non dicono nulla sul fatto che il film ti piacerà.
      return 0;
  }
}

interface GenreFit {
  score: number;
  /** Il genere del film che calza meglio il tuo profilo, se ce n'è uno. */
  best: string | null;
  /** Familiarità massima fra i generi del film: quanto il film è "in casa tua". */
  bridge: number;
}

function genreFit(candidate: CandidateMovie, profile: TasteProfile): GenreFit {
  const byGenre = new Map(profile.genres.map((g) => [g.genre, g]));
  let bestValue = -Infinity;
  let best: string | null = null;
  let bridge = 0;
  let sum = 0;
  let seen = 0;

  for (const genre of candidate.genres) {
    const taste = byGenre.get(genre);
    if (!taste) continue;
    const value = RECO_TUNING.familiarityShare * taste.familiarity + RECO_TUNING.affinityShare * taste.affinity;
    sum += value;
    seen += 1;
    bridge = Math.max(bridge, taste.familiarity);
    if (value > bestValue) {
      bestValue = value;
      best = genre;
    }
  }

  if (seen === 0) return { score: 0, best: null, bridge: 0 };
  const average = sum / seen;
  return {
    score: RECO_TUNING.bestGenreShare * bestValue + (1 - RECO_TUNING.bestGenreShare) * average,
    best,
    bridge,
  };
}

function eraFit(candidate: CandidateMovie, profile: TasteProfile) {
  if (candidate.year === undefined) return { score: 0, decade: null as number | null };
  const decade = decadeOf(candidate.year);
  const taste = profile.eras.find((e) => e.decade === decade);
  if (!taste) return { score: 0, decade };
  return {
    score: RECO_TUNING.familiarityShare * taste.familiarity + RECO_TUNING.affinityShare * taste.affinity,
    decade,
  };
}

function reasonsFor(candidate: CandidateMovie, fit: GenreFit, crowd: number): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  const best = [...candidate.sources].sort((a, b) => sourcePull(b) - sourcePull(a));

  for (const source of best) {
    if (source.kind === "director") reasons.push({ kind: "director", name: source.name });
    else if (source.kind === "actor") reasons.push({ kind: "actor", name: source.name });
    else if (source.kind === "seed") reasons.push({ kind: "similarTo", title: source.title });
    if (reasons.length >= RECO_TUNING.maxReasons - 1) break;
  }

  if (fit.best) reasons.push({ kind: "genreLove", genre: fit.best });
  if (reasons.length < RECO_TUNING.maxReasons && crowd > RECO_TUNING.acclaimedThreshold) reasons.push({ kind: "acclaimed" });

  return reasons.slice(0, RECO_TUNING.maxReasons);
}

/** Chiave con cui limitare quanti titoli può portare una singola provenienza. */
function sourceQuota(candidate: CandidateMovie): string | null {
  const strongest = [...candidate.sources].sort((a, b) => sourcePull(b) - sourcePull(a))[0];
  if (!strongest) return null;
  if (strongest.kind === "director" || strongest.kind === "actor") return `${strongest.kind}:${strongest.personId}`;
  if (strongest.kind === "seed") return `seed:${strongest.movieId}`;
  return null;
}

/** Applica un tetto per chiave, mantenendo l'ordine di punteggio. */
function capBy<T>(items: T[], limit: number, keyOf: (item: T) => string | null, max: number): T[] {
  const used = new Map<string, number>();
  const kept: T[] = [];

  for (const item of items) {
    const key = keyOf(item);
    if (key !== null) {
      const count = used.get(key) ?? 0;
      if (count >= max) continue;
      used.set(key, count + 1);
    }
    kept.push(item);
    if (kept.length >= limit) break;
  }
  return kept;
}

/**
 * Lista "per te": film non visti che somigliano a ciò che guardi e voti bene.
 * Il consenso pubblico entra pesato per quanto i tuoi voti gli somigliano (`crowdTrust`):
 * a chi vota sistematicamente contro la massa non serve una classifica della massa.
 */
export function rankForYou(candidates: CandidateMovie[], profile: TasteProfile, limit: number): Recommendation[] {
  const scored: Recommendation[] = [];

  for (const candidate of candidates) {
    if (candidate.voteCount < RECO_TUNING.minVotes) continue;

    const fit = genreFit(candidate, profile);
    const era = eraFit(candidate, profile);
    const pull = Math.max(0, ...candidate.sources.map(sourcePull));
    const taste = clamp01(
      RECO_TUNING.tasteBase + RECO_TUNING.genreWeight * fit.score + RECO_TUNING.eraWeight * era.score + pull,
    );
    const crowd = crowdSignal(candidate);
    const score = taste * (1 + RECO_TUNING.crowdWeight * profile.crowdTrust * (2 * crowd - 1));

    scored.push({ candidate, score, taste, crowd, reasons: reasonsFor(candidate, fit, crowd) });
  }

  scored.sort((a, b) => b.score - a.score || b.crowd - a.crowd);
  return capBy(scored, limit, (r) => sourceQuota(r.candidate), RECO_TUNING.maxPerSource);
}

function gapsMatching(candidate: CandidateMovie, gaps: Gap[]): Gap[] {
  const decade = candidate.year === undefined ? null : decadeOf(candidate.year);
  const directorIds = new Set(
    candidate.sources
      .filter((s): s is Extract<CandidateSource, { kind: "gapDirector" | "director" }> => s.kind === "gapDirector" || s.kind === "director")
      .map((s) => s.personId),
  );

  return gaps.filter((gap) => {
    if (gap.kind === "genre") return candidate.genres.includes(gap.genre);
    if (gap.kind === "era") return decade === gap.decade;
    return directorIds.has(gap.personId);
  });
}

/**
 * Lista "lacune": film che dovresti provare perché coprono un buco del profilo.
 * Il punteggio non è più l'affinità ma la coppia gravità della lacuna × riconoscibilità del
 * titolo, con un bonus se il film tocca anche un genere che già ami: entrare in un decennio
 * mai visto è più facile da un film che ti somiglia almeno per metà.
 */
export function rankBlindSpots(
  candidates: CandidateMovie[],
  profile: TasteProfile,
  gaps: Gap[],
  limit: number,
): Recommendation[] {
  const scored: Recommendation[] = [];

  for (const candidate of candidates) {
    if (candidate.voteCount < RECO_TUNING.minGapVotes) continue;

    const matching = gapsMatching(candidate, gaps);
    if (matching.length === 0) continue;

    const gap = matching.reduce((best, g) => (g.priority > best.priority ? g : best));
    const fit = genreFit(candidate, profile);
    const crowd = crowdSignal(candidate);
    const score =
      gap.priority * Math.pow(crowd, RECO_TUNING.gapCrowdExponent) * (1 + RECO_TUNING.bridgeWeight * fit.bridge);

    const reasons: RecommendationReason[] = [];
    if (gap.kind === "genre") reasons.push({ kind: "genreGap", genre: gap.genre });
    else if (gap.kind === "era") reasons.push({ kind: "eraGap", decade: gap.decade });
    else reasons.push({ kind: "directorGap", name: gap.name, seen: gap.seenCount, total: gap.filmography });

    if (fit.bridge > 0.4 && fit.best && fit.best !== (gap.kind === "genre" ? gap.genre : null)) {
      reasons.push({ kind: "genreLove", genre: fit.best });
    }
    if (reasons.length < RECO_TUNING.maxReasons && crowd > RECO_TUNING.acclaimedThreshold) reasons.push({ kind: "acclaimed" });

    scored.push({ candidate, score, taste: fit.score, crowd, reasons, gap });
  }

  scored.sort((a, b) => b.score - a.score || b.crowd - a.crowd);
  return capBy(scored, limit, (r) => r.gap?.key ?? null, RECO_TUNING.maxPerGap);
}
