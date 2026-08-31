"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import {
  SHOW_SCORING,
  showGenreStats,
  statusBreakdown,
  type ShowStat,
} from "@/lib/analysis/showStats";
import { statusLabel } from "@/components/series/ShowsPanel";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";

/** Generi mostrati: oltre, il grafico diventa illeggibile e servirebbe una tabella. */
const TOP_GENRES = 8;

type SeriesDict = Dictionary["series"];
type Tab = "status" | "genres";

interface BarRowProps {
  label: string;
  /** Grandezza della barra, 0-1. */
  fill: number;
  value: string;
  detail?: string;
  detailTone?: "muted" | "amber";
}

function BarRow({ label, fill, value, detail, detailTone = "muted" }: BarRowProps) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs text-muted" title={label}>
        {label}
      </span>
      <div className="h-5 flex-1 bg-border/50">
        <div
          className="h-full rounded-r-[4px] bg-accent/80"
          style={{ width: `${Math.max(2, fill * 100)}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-foreground/90">{value}</span>
      <span
        className={`w-16 shrink-0 text-right text-xs tabular-nums ${
          detailTone === "amber" ? "text-accent-amber" : "text-muted"
        }`}
      >
        {detail}
      </span>
    </li>
  );
}

interface HabitsPanelProps {
  shows: ShowStat[];
  dict: SeriesDict;
  format: { rating: Intl.NumberFormat; percent: Intl.NumberFormat };
}

/**
 * Il ritratto di *come* guardi, non di cosa: dove ti fermi con una serie, e quali generi
 * si prendono davvero il tuo tempo (contato in episodi, non in titoli).
 */
export function HabitsPanel({ shows, dict, format }: HabitsPanelProps) {
  const [tab, setTab] = useState<Tab>("status");
  const hd = dict.habits;

  const statuses = useMemo(() => statusBreakdown(shows), [shows]);
  const genres = useMemo(() => showGenreStats(shows).slice(0, TOP_GENRES), [shows]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "status", label: hd.tabStatus },
    { key: "genres", label: hd.tabGenres },
  ];

  const maxEpisodes = Math.max(1, ...genres.map((g) => g.episodes));

  return (
    <Panel title={hd.title}>
      <div className="flex">
        {tabs.map(({ key, label }, i) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`border px-4 py-1.5 text-xs uppercase tracking-widest transition-colors ${
              tab === key ? "border-accent text-accent" : "border-border-strong text-muted hover:text-foreground"
            } ${i > 0 ? "-ml-px" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "status" ? (
          statuses.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted">{hd.statusEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {statuses.map((bucket) => (
                <BarRow
                  key={bucket.status}
                  label={statusLabel(bucket.status, dict.status)}
                  fill={bucket.share}
                  value={formatMessage(hd.showsCount, { count: bucket.count })}
                  detail={formatMessage(hd.episodesCount, { count: bucket.episodes })}
                />
              ))}
            </ul>
          )
        ) : genres.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">{hd.genresEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {genres.map((genre) => (
              <BarRow
                key={genre.genre}
                label={genre.genre}
                fill={genre.episodes / maxEpisodes}
                value={formatMessage(hd.episodesCount, { count: genre.episodes })}
                detail={genre.avgRating === null ? dict.shows.unknown : format.rating.format(genre.avgRating)}
                detailTone="amber"
              />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted">
        {tab === "status"
          ? formatMessage(hd.legendStatus, {
              completed: Math.round(SHOW_SCORING.completedShare * 100),
              sampled: SHOW_SCORING.sampledEpisodes,
              stale: SHOW_SCORING.staleMonths,
            })
          : hd.legendGenres}
      </p>
    </Panel>
  );
}
