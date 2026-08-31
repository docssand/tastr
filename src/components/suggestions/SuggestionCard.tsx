"use client";

import Image from "next/image";
import { formatMessage } from "@/lib/i18n";
import type { Recommendation, RecommendationReason } from "@/lib/analysis/recommendations";
import type { Dictionary } from "@/i18n/types";

type SuggestionsDict = Dictionary["suggestions"];

/** w185 è la locandina più piccola di TMDB che regge il raddoppio su schermi retina. */
const POSTER_BASE = "https://image.tmdb.org/t/p/w185";
const POSTER_WIDTH = 80;
const POSTER_HEIGHT = 120;

export interface SuggestionFormatters {
  rating: Intl.NumberFormat;
  percent: Intl.NumberFormat;
}

export function suggestionFormatters(lang: string): SuggestionFormatters {
  return {
    rating: new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    percent: new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }),
  };
}

/** Il motivo è calcolato dall'analisi come dato; qui diventa una frase nella lingua della pagina. */
function reasonText(reason: RecommendationReason, dict: SuggestionsDict): string {
  const r = dict.reasons;
  switch (reason.kind) {
    case "director":
      return formatMessage(r.director, { name: reason.name });
    case "actor":
      return formatMessage(r.actor, { name: reason.name });
    case "similarTo":
      return formatMessage(r.similarTo, { title: reason.title });
    case "genreLove":
      return formatMessage(r.genreLove, { genre: reason.genre });
    case "eraLove":
      return formatMessage(r.eraLove, { decade: reason.decade });
    case "genreGap":
      return formatMessage(r.genreGap, { genre: reason.genre });
    case "eraGap":
      return formatMessage(r.eraGap, { decade: reason.decade });
    case "directorGap":
      return formatMessage(r.directorGap, { name: reason.name, seen: reason.seen, total: reason.total });
    case "acclaimed":
      return r.acclaimed;
  }
}

function Poster({ path, title, dict }: { path: string | null; title: string; dict: SuggestionsDict }) {
  if (!path) {
    return (
      <div
        className="flex shrink-0 items-center justify-center border border-dashed border-border-strong px-1 text-center text-[10px] leading-tight text-muted"
        style={{ width: POSTER_WIDTH, height: POSTER_HEIGHT }}
      >
        {dict.noPoster}
      </div>
    );
  }

  return (
    <Image
      src={`${POSTER_BASE}${path}`}
      alt={title}
      width={POSTER_WIDTH}
      height={POSTER_HEIGHT}
      className="shrink-0 border border-border object-cover"
      style={{ width: POSTER_WIDTH, height: POSTER_HEIGHT }}
    />
  );
}

interface SuggestionCardProps {
  recommendation: Recommendation;
  dict: SuggestionsDict;
  format: SuggestionFormatters;
  /** Nella lista lacune il punteggio di affinità non è il criterio: non lo mostriamo. */
  showMatch?: boolean;
}

export function SuggestionCard({ recommendation, dict, format, showMatch = true }: SuggestionCardProps) {
  const { candidate, taste, reasons } = recommendation;

  return (
    <li className="flex gap-4 border border-border bg-surface p-4">
      <Poster path={candidate.posterPath} title={candidate.title} dict={dict} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate text-sm text-foreground" title={candidate.title}>
            {candidate.title}
          </h3>
          {candidate.year !== undefined && (
            <span className="shrink-0 text-xs tabular-nums text-muted">{candidate.year}</span>
          )}
        </div>

        {candidate.genres.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-muted">{candidate.genres.join(" · ")}</p>
        )}

        <ul className="mt-3 flex flex-wrap gap-1.5">
          {reasons.map((reason, i) => (
            <li
              key={`${reason.kind}-${i}`}
              className="border border-border-strong px-2 py-0.5 text-[10px] leading-relaxed text-muted"
            >
              {reasonText(reason, dict)}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 text-[11px]">
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-accent-amber">
              {formatMessage(dict.crowd, { value: format.rating.format(candidate.voteAverage) })}
            </span>
            {showMatch && (
              <span className="flex items-center gap-2 tabular-nums text-muted">
                <span className="h-1 w-10 bg-border">
                  <span className="block h-full bg-accent" style={{ width: `${Math.round(taste * 100)}%` }} />
                </span>
                {formatMessage(dict.match, { value: format.percent.format(taste) })}
              </span>
            )}
          </div>
          <a
            href={`https://www.themoviedb.org/movie/${candidate.tmdbId}`}
            target="_blank"
            rel="noreferrer"
            aria-label={formatMessage(dict.openInTmdb, { title: candidate.title })}
            className="uppercase tracking-widest text-muted transition-colors hover:text-accent"
          >
            tmdb ↗
          </a>
        </div>
      </div>
    </li>
  );
}
