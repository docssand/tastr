"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import {
  SHOW_SCORING,
  rankShowPeople,
  type PersonShow,
  type ShowPersonRole,
  type ShowPersonScore,
  type ShowStat,
} from "@/lib/analysis/showStats";
import { showPersonalMean } from "@/lib/analysis/shows";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";
import type { ShowCredits } from "@/lib/types";

const TOP_N = 10;

type PeopleDict = Dictionary["series"]["people"];

interface Formatters {
  score: Intl.NumberFormat;
  rating: Intl.NumberFormat;
  delta: Intl.NumberFormat;
  integer: Intl.NumberFormat;
}

const roles: { key: ShowPersonRole; label: (d: PeopleDict) => string }[] = [
  { key: "creator", label: (d) => d.creators },
  { key: "actor", label: (d) => d.actors },
];

/** Dettaglio di una persona: una serie per riga, con gli episodi tuoi in cui compariva. */
function ShowList({
  shows,
  dict,
  format,
}: {
  shows: PersonShow[];
  dict: PeopleDict;
  format: Formatters;
}) {
  return (
    <div className="mt-3 border-t border-border/70 pt-3">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[10px] uppercase tracking-widest text-muted/70">
        <span>{dict.showsHeader}</span>
        <span className="text-right">{dict.showsEpisodes}</span>
        <span className="text-right">{dict.showsRating}</span>
      </div>
      <ul className="mt-2 flex flex-col">
        {shows.map((show, i) => (
          <li
            key={`${show.title}-${i}`}
            className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 py-1 text-xs"
          >
            <span className="truncate text-foreground/90">{show.title}</span>
            <span className="text-right tabular-nums text-foreground/90">
              {format.integer.format(Math.round(show.episodes))}
            </span>
            <span
              className={`text-right tabular-nums ${show.rating === undefined ? "text-muted/60" : "text-accent"}`}
            >
              {show.rating === undefined ? "—" : format.rating.format(show.rating)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TopShowPeoplePanelProps {
  shows: ShowStat[];
  credits: Map<number, ShowCredits>;
  dict: PeopleDict;
  format: Formatters;
}

export function TopShowPeoplePanel({ shows, credits, dict, format }: TopShowPeoplePanelProps) {
  const [role, setRole] = useState<ShowPersonRole>("creator");
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());

  const ranking = useMemo(() => rankShowPeople(shows, credits, role, TOP_N), [shows, credits, role]);
  const mean = useMemo(() => showPersonalMean(shows), [shows]);
  const maxScore = ranking[0]?.score ?? 1;

  // Creatori e interpreti sono insiemi di id diversi: tenere le righe aperte fra i due non ha senso.
  const selectRole = (next: ShowPersonRole) => {
    setRole(next);
    setExpanded(new Set());
  };

  const toggle = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const meta = (person: ShowPersonScore) => {
    const episodes = Math.round(person.episodes);
    const parts = [
      episodes === 1 ? dict.episodesOne : formatMessage(dict.episodes, { count: format.integer.format(episodes) }),
      formatMessage(dict.shows, { count: person.showCount }),
    ];
    parts.push(
      person.averageRating === null
        ? dict.noRating
        : formatMessage(dict.rating, {
            avg: format.rating.format(person.averageRating),
            delta: format.delta.format(person.delta),
          }),
    );
    return parts.join(" · ");
  };

  return (
    <Panel title={dict.title}>
      <div className="flex">
        {roles.map(({ key, label }, i) => (
          <button
            key={key}
            type="button"
            onClick={() => selectRole(key)}
            aria-pressed={role === key}
            className={`border px-4 py-1.5 text-xs uppercase tracking-widest transition-colors ${
              role === key ? "border-accent text-accent" : "border-border-strong text-muted hover:text-foreground"
            } ${i > 0 ? "-ml-px" : ""}`}
          >
            {label(dict)}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {ranking.length === 0 ? (
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
                      aria-controls={`show-person-${person.id}`}
                      aria-label={formatMessage(isOpen ? dict.collapse : dict.expand, { name: person.name })}
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
                      <div id={`show-person-${person.id}`}>
                        <ShowList shows={person.shows} dict={dict} format={format} />
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
          {formatMessage(dict.legend, { mean: format.rating.format(mean ?? SHOW_SCORING.fallbackMean) })}
        </p>
      </details>
    </Panel>
  );
}
