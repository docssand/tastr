"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SHOW_SCORING, type ShowStat, type ShowStatus } from "@/lib/analysis/showStats";
import { showPersonalMean } from "@/lib/analysis/shows";
import { formatDuration } from "@/components/series/format";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";

/** Serie mostrate prima di dover chiedere il resto: una libreria TV è lunga, la pagina no. */
const INITIAL_ROWS = 15;

type SeriesDict = Dictionary["series"];

interface Formatters {
  score: Intl.NumberFormat;
  rating: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  integer: Intl.NumberFormat;
}

/** Colore dello stato: quanto ti sei spinto avanti si legge prima dal colore che dal testo. */
const STATUS_TONE: Record<ShowStatus, string> = {
  completed: "border-accent text-accent",
  watching: "border-accent-amber/70 text-accent-amber",
  abandoned: "border-danger/60 text-danger",
  sampled: "border-border-strong text-muted",
  unknown: "border-border-strong text-muted/70",
};

export function statusLabel(status: ShowStatus, dict: SeriesDict["status"]) {
  return dict[status];
}

function StatusBadge({ status, dict }: { status: ShowStatus; dict: SeriesDict["status"] }) {
  return (
    <span
      className={`shrink-0 border px-2 py-0.5 text-[10px] uppercase tracking-widest ${STATUS_TONE[status]}`}
    >
      {statusLabel(status, dict)}
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-widest text-muted/70">{label}</dt>
      <dd className="text-xs text-foreground/90">{children}</dd>
    </>
  );
}

interface DetailProps {
  show: ShowStat;
  dict: SeriesDict;
  format: Formatters;
}

/** Scheda della serie: tutto ciò che un film non ha — avanzamento, stagioni, tempo, due livelli di voto. */
function ShowDetail({ show, dict, format }: DetailProps) {
  const sd = dict.shows;

  const rating = (() => {
    const parts: string[] = [];
    if (show.showRating !== undefined) {
      parts.push(formatMessage(sd.detailRatingShow, { value: format.rating.format(show.showRating) }));
    }
    if (show.episodeRatingAvg !== undefined) {
      parts.push(
        formatMessage(sd.detailRatingEpisodes, {
          value: format.rating.format(show.episodeRatingAvg),
          count: show.ratedEpisodes,
        }),
      );
    }
    return parts.length > 0 ? parts.join(" · ") : sd.unknown;
  })();

  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 border-t border-border/70 pt-3">
      <DetailRow label={sd.detailStatus}>
        {statusLabel(show.status, dict.status)}
        {show.ended !== undefined && (
          <span className="text-muted"> · {show.ended ? sd.detailEnded : sd.detailRunning}</span>
        )}
      </DetailRow>

      <DetailRow label={sd.detailProgress}>
        {show.totalEpisodes
          ? `${formatMessage(sd.episodesOf, { seen: show.episodes, total: show.totalEpisodes })}${
              show.completion !== undefined ? ` · ${format.percent.format(show.completion)}` : ""
            }`
          : show.episodes === 1
            ? sd.episodesOne
            : formatMessage(sd.episodesOnly, { count: show.episodes })}
      </DetailRow>

      {show.seasons.length > 0 && (
        <DetailRow label={sd.detailSeasons}>
          {show.totalSeasons
            ? formatMessage(sd.detailSeasonsValue, { seen: show.seasons.length, total: show.totalSeasons })
            : String(show.seasons.length)}
        </DetailRow>
      )}

      <DetailRow label={sd.detailViews}>
        {formatMessage(sd.detailViewsValue, { plays: show.plays, rewatched: show.rewatchedEpisodes })}
      </DetailRow>

      <DetailRow label={sd.detailTime}>
        {show.minutes === undefined ? sd.unknown : formatDuration(show.minutes, dict.summary, format.integer)}
      </DetailRow>

      <DetailRow label={sd.detailRating}>{rating}</DetailRow>

      {show.voteAverage !== undefined && (
        <DetailRow label={sd.detailCrowd}>{format.rating.format(show.voteAverage)}</DetailRow>
      )}

      {show.lastWatchedAt && (
        <DetailRow label={sd.detailPeriod}>
          {formatMessage(sd.detailPeriodRange, {
            from: (show.firstWatchedAt ?? show.lastWatchedAt).slice(0, 10),
            to: show.lastWatchedAt.slice(0, 10),
          })}
        </DetailRow>
      )}
    </dl>
  );
}

interface ShowsPanelProps {
  shows: ShowStat[];
  dict: SeriesDict;
  format: Formatters;
}

export function ShowsPanel({ shows, dict, format }: ShowsPanelProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const sd = dict.shows;

  const mean = useMemo(() => showPersonalMean(shows), [shows]);
  const visible = showAll ? shows : shows.slice(0, INITIAL_ROWS);

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const meta = (show: ShowStat) => {
    const parts = [
      show.totalEpisodes
        ? formatMessage(sd.episodesOf, { seen: show.episodes, total: show.totalEpisodes })
        : show.episodes === 1
          ? sd.episodesOne
          : formatMessage(sd.episodesOnly, { count: show.episodes }),
    ];
    if (show.seasons.length === 1) parts.push(sd.seasonsOne);
    else if (show.seasons.length > 1) parts.push(formatMessage(sd.seasons, { count: show.seasons.length }));
    parts.push(show.rating === undefined ? sd.noRating : format.rating.format(show.rating));
    if (show.rewatchedEpisodes > 0) {
      parts.push(formatMessage(sd.rewatched, { count: show.rewatchedEpisodes }));
    }
    return parts.join(" · ");
  };

  return (
    <Panel title={sd.title}>
      {shows.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">{sd.empty}</p>
      ) : (
        <ol className="flex flex-col">
          {visible.map((show, index) => {
            const isOpen = expanded.has(show.key);
            return (
              <li
                key={show.key}
                className="flex items-start gap-4 border-t border-border py-3 first:border-t-0 first:pt-0"
              >
                <span className="w-6 shrink-0 text-xs tabular-nums text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => toggle(show.key)}
                    aria-expanded={isOpen}
                    aria-controls={`show-detail-${show.key}`}
                    aria-label={formatMessage(isOpen ? sd.collapse : sd.expand, { name: show.title })}
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
                          {show.title}
                          {show.year !== undefined && <span className="text-muted"> ({show.year})</span>}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-3">
                        <StatusBadge status={show.status} dict={dict.status} />
                        <span className="text-sm tabular-nums text-accent text-glow">
                          {format.score.format(show.score)}
                        </span>
                      </span>
                    </div>
                    {/* La barra misura il completamento, non il punteggio: su una serie
                        "dove sei arrivato" dice più di qualunque classifica. Quando il
                        completamento è ignoto la traccia resta vuota: riempirla col
                        punteggio darebbe alla stessa barra due significati diversi. */}
                    <div className="mt-2 h-1 w-full bg-border/70">
                      {show.completion !== undefined && (
                        <div
                          className="h-full bg-accent/80"
                          style={{ width: `${Math.max(2, show.completion * 100)}%` }}
                        />
                      )}
                    </div>
                    <div className="mt-2 text-[11px] text-muted">{meta(show)}</div>
                  </button>
                  {isOpen && (
                    <div id={`show-detail-${show.key}`}>
                      <ShowDetail show={show} dict={dict} format={format} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {shows.length > INITIAL_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 border-t border-border pt-4 text-[11px] uppercase tracking-widest text-muted hover:text-accent"
        >
          {showAll ? sd.showLess : formatMessage(sd.showAll, { count: shows.length })}
        </button>
      )}

      <details className="mt-6 border-t border-border pt-4">
        <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-muted hover:text-accent">
          {sd.legendToggle}
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {formatMessage(sd.legend, {
            mean: format.rating.format(mean ?? SHOW_SCORING.fallbackMean),
            k: SHOW_SCORING.shrinkK,
            rewatch: Math.round(SHOW_SCORING.rewatchWeight * 100),
            showWeight: SHOW_SCORING.showRatingWeight,
            floor: Math.round(SHOW_SCORING.completionFloor * 100),
          })}
        </p>
      </details>
    </Panel>
  );
}
