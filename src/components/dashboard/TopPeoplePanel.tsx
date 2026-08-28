"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useMovieCredits } from "@/components/dashboard/useMovieCredits";
import {
  SCORING,
  creditsCoverage,
  personalMean,
  rankPeople,
  type PersonMovie,
  type PersonRole,
  type PersonScore,
} from "@/lib/analysis/people";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";
import type { NormalizedEntry } from "@/lib/types";

const TOP_N = 10;

interface TopPeoplePanelProps {
  lang: string;
  entries: NormalizedEntry[];
  dict: Dictionary["dashboard"]["topPeople"];
}

const roles: { key: PersonRole; label: (d: TopPeoplePanelProps["dict"]) => string }[] = [
  { key: "director", label: (d) => d.directors },
  { key: "actor", label: (d) => d.actors },
];

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-4">
      {["w-3/5", "w-1/2", "w-2/5", "w-1/3"].map((w, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className={`h-2.5 ${w} bg-border-strong/60`} />
          <div className="h-1 w-full bg-border/60" />
        </div>
      ))}
    </div>
  );
}

interface MovieListProps {
  movies: PersonMovie[];
  dict: TopPeoplePanelProps["dict"];
  formatRating: (value: number) => string;
}

/** Dettaglio di una persona: un film per riga, con il voto dato e le visioni. */
function MovieList({ movies, dict, formatRating }: MovieListProps) {
  return (
    <div className="mt-3 border-t border-border/70 pt-3">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[10px] uppercase tracking-widest text-muted/70">
        <span>{dict.filmsHeader}</span>
        <span className="text-right">{dict.filmsRating}</span>
        <span className="text-right">{dict.filmsPlays}</span>
      </div>
      <ul className="mt-2 flex flex-col">
        {movies.map((movie, i) => (
          <li
            key={`${movie.title}-${movie.year ?? ""}-${i}`}
            className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 py-1 text-xs"
          >
            <span className="truncate text-foreground/90">
              {movie.title}
              {movie.year !== undefined && <span className="text-muted"> ({movie.year})</span>}
            </span>
            <span
              className={`text-right tabular-nums ${
                movie.rating === undefined ? "text-muted/60" : "text-accent"
              }`}
            >
              {movie.rating === undefined ? dict.filmsNoRating : formatRating(movie.rating)}
            </span>
            <span
              className={`text-right tabular-nums ${
                movie.plays > 1 ? "text-foreground/90" : "text-muted/60"
              }`}
            >
              {formatMessage(dict.filmsPlaysValue, { count: movie.plays })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TopPeoplePanel({ lang, entries, dict }: TopPeoplePanelProps) {
  const [role, setRole] = useState<PersonRole>("director");
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const { movies, credits, status, pendingCount, progress, errorCode, enrich, cancel } =
    useMovieCredits(entries);

  const toggle = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // Registi e attori sono insiemi di id diversi: tenere le righe aperte tra i due non ha senso.
  const selectRole = (next: PersonRole) => {
    setRole(next);
    setExpanded(new Set());
  };

  const ranking = useMemo(
    () => rankPeople(movies, credits, role, TOP_N),
    [movies, credits, role],
  );
  const coverage = useMemo(() => creditsCoverage(movies, credits), [movies, credits]);
  const mean = useMemo(() => personalMean(movies), [movies]);

  const format = useMemo(() => {
    const score = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rating = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const delta = new Intl.NumberFormat(lang, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: "exceptZero",
    });
    return { score, rating, delta };
  }, [lang]);

  const maxScore = ranking[0]?.score ?? 1;

  const meta = (person: PersonScore) => {
    const parts = [formatMessage(dict.movies, { count: person.movieCount })];
    parts.push(
      person.averageRating === null
        ? dict.noRating
        : formatMessage(dict.rating, {
            avg: format.rating.format(person.averageRating),
            delta: format.delta.format(person.delta),
          }),
    );
    if (person.rewatchCount > 0) {
      parts.push(formatMessage(dict.rewatches, { count: person.rewatchCount }));
    }
    return parts.join(" · ");
  };

  return (
    <Panel title={dict.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex">
          {roles.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => selectRole(key)}
              aria-pressed={role === key}
              className={`border px-4 py-1.5 text-xs uppercase tracking-widest transition-colors ${
                role === key
                  ? "border-accent text-accent"
                  : "border-border-strong text-muted hover:text-foreground"
              } ${key === "actor" ? "-ml-px" : ""}`}
            >
              {label(dict)}
            </button>
          ))}
        </div>
        {status !== "loading" && (
          <span className="text-[11px] uppercase tracking-widest text-muted">
            {formatMessage(dict.coverage, { covered: coverage.covered, total: coverage.total })}
          </span>
        )}
      </div>

      {status === "enriching" && progress && (
        <div className="mt-5 border border-border-strong px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {formatMessage(dict.enriching, { done: progress.done, total: progress.total })}
            </span>
            <button
              type="button"
              onClick={cancel}
              className="text-[11px] uppercase tracking-widest text-muted hover:text-danger"
            >
              {dict.cancel}
            </button>
          </div>
          <div className="mt-2.5 h-1 w-full bg-border/70">
            <div
              className="h-full bg-accent transition-[width] duration-300"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {status === "incomplete" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-border-strong px-4 py-3">
          <span className="text-xs text-muted">
            {formatMessage(dict.incompleteBody, { count: pendingCount })}
          </span>
          <Button variant="ghost" onClick={enrich} className="px-4 py-1.5 text-[11px]">
            {dict.enrichCta}
          </Button>
        </div>
      )}

      {status === "error" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-danger px-4 py-3">
          <span className="text-xs text-danger">
            {errorCode === "config" ? dict.errorConfig : dict.errorGeneric}
          </span>
          {errorCode !== "config" && (
            <Button variant="ghost" onClick={enrich} className="px-4 py-1.5 text-[11px]">
              {dict.retry}
            </Button>
          )}
        </div>
      )}

      <div className="mt-6">
        {status === "loading" ? (
          <SkeletonRows />
        ) : ranking.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">{dict.empty}</p>
        ) : (
          <ol className="flex flex-col">
            {ranking.map((person, index) => {
              const isOpen = expanded.has(person.id);
              return (
                <li
                  key={person.id}
                  className="flex items-start gap-4 border-t border-border py-3 first:border-t-0 first:pt-0"
                >
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggle(person.id)}
                      aria-expanded={isOpen}
                      aria-controls={`person-movies-${person.id}`}
                      aria-label={formatMessage(isOpen ? dict.collapse : dict.expand, {
                        name: person.name,
                      })}
                      className="group block w-full cursor-pointer text-left"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span
                            aria-hidden="true"
                            className={`shrink-0 text-[10px] text-muted transition-transform group-hover:text-accent ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          >
                            ▶
                          </span>
                          <span className="truncate text-sm text-foreground group-hover:text-accent">
                            {person.name}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-accent text-glow">
                          {format.score.format(person.score)}
                        </span>
                      </div>
                      <div className="mt-2 h-1 w-full bg-border/70">
                        <div
                          className="h-full bg-accent/80"
                          style={{ width: `${Math.max(2, (person.score / maxScore) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 text-[11px] text-muted">{meta(person)}</div>
                    </button>
                    {isOpen && (
                      <div id={`person-movies-${person.id}`}>
                        <MovieList
                          movies={person.movies}
                          dict={dict}
                          formatRating={format.rating.format}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <details className="mt-6 border-t border-border pt-4">
        <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-muted hover:text-accent">
          {dict.legendToggle}
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {formatMessage(dict.legend, {
            mean: format.rating.format(mean ?? SCORING.fallbackMean),
            k: SCORING.shrinkK,
            rewatch: Math.round(SCORING.rewatchWeight * 100),
          })}
        </p>
      </details>
    </Panel>
  );
}
