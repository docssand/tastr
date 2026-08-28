"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useMovieCredits } from "@/components/dashboard/useMovieCredits";
import {
  compareByDecade,
  comparisonSummary,
  decadeStats,
  genreStats,
  type DecadeComparison,
  type DecadeStat,
  type GenreStat,
} from "@/lib/analysis/charts";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";
import type { NormalizedEntry } from "@/lib/types";

/** Numero di generi mostrati: oltre, il grafico diventa illeggibile e serve una tabella. */
const TOP_GENRES = 8;

type Tab = "decade" | "compare" | "genre";
type ChartsDict = Dictionary["dashboard"]["charts"];

interface ChartsPanelProps {
  lang: string;
  entries: NormalizedEntry[];
  dict: Dictionary["dashboard"];
}

interface Formatters {
  rating: Intl.NumberFormat;
  delta: Intl.NumberFormat;
}

const tabs: { key: Tab; label: (d: ChartsDict) => string; needsCredits: boolean }[] = [
  { key: "decade", label: (d) => d.tabDecade, needsCredits: false },
  { key: "compare", label: (d) => d.tabCompare, needsCredits: true },
  { key: "genre", label: (d) => d.tabGenre, needsCredits: true },
];

/** Barra orizzontale: lunghezza = grandezza, etichetta a destra = il tuo voto medio. */
function BarRow({
  label,
  count,
  avgRating,
  maxCount,
  format,
  noRatingLabel,
}: {
  label: string;
  count: number;
  avgRating: number | null;
  maxCount: number;
  format: Formatters;
  noRatingLabel: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs text-muted" title={label}>
        {label}
      </span>
      <div className="h-5 flex-1 bg-border/50">
        <div
          className="h-full rounded-r-[4px] bg-accent/80"
          style={{ width: `${Math.max(2, (count / maxCount) * 100)}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-foreground/90">{count}</span>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-accent-amber">
        {avgRating === null ? noRatingLabel : format.rating.format(avgRating)}
      </span>
    </li>
  );
}

function DecadeChart({
  stats,
  dict,
  format,
  noRatingLabel,
}: {
  stats: DecadeStat[];
  dict: ChartsDict;
  format: Formatters;
  noRatingLabel: string;
}) {
  if (stats.length === 0) return <p className="text-sm leading-relaxed text-muted">{dict.decadeEmpty}</p>;
  const max = Math.max(...stats.map((s) => s.count));

  return (
    <ul className="flex flex-col gap-3">
      {stats.map((s) => (
        <BarRow
          key={s.decade}
          label={formatMessage(dict.decadeLabel, { decade: s.decade })}
          count={s.count}
          avgRating={s.avgRating}
          maxCount={max}
          format={format}
          noRatingLabel={noRatingLabel}
        />
      ))}
    </ul>
  );
}

function GenreChart({
  stats,
  dict,
  format,
  noRatingLabel,
}: {
  stats: GenreStat[];
  dict: ChartsDict;
  format: Formatters;
  noRatingLabel: string;
}) {
  if (stats.length === 0) return <p className="text-sm leading-relaxed text-muted">{dict.genreEmpty}</p>;
  const top = stats.slice(0, TOP_GENRES);
  const max = Math.max(...top.map((s) => s.count));

  return (
    <ul className="flex flex-col gap-3">
      {top.map((s) => (
        <BarRow
          key={s.genre}
          label={s.genre}
          count={s.count}
          avgRating={s.avgRating}
          maxCount={max}
          format={format}
          noRatingLabel={noRatingLabel}
        />
      ))}
    </ul>
  );
}

/** Riga a "manubrio": due pallini sulla stessa scala 0-10, uniti da un tratto. */
function DumbbellRow({ comparison, dict, format }: { comparison: DecadeComparison; dict: ChartsDict; format: Formatters }) {
  const toPct = (v: number) => `${(v / 10) * 100}%`;
  const left = Math.min(comparison.personalAvg, comparison.massAvg);
  const right = Math.max(comparison.personalAvg, comparison.massAvg);

  return (
    <li className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted">
        {formatMessage(dict.decadeLabel, { decade: comparison.decade })}
      </span>
      <div className="relative h-5 flex-1">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <div
          className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-border-strong"
          style={{ left: toPct(left), right: `${100 - (right / 10) * 100}%` }}
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted ring-2 ring-surface"
          style={{ left: toPct(comparison.massAvg) }}
          title={`${dict.crowd}: ${format.rating.format(comparison.massAvg)}`}
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
          style={{ left: toPct(comparison.personalAvg) }}
          title={`${dict.you}: ${format.rating.format(comparison.personalAvg)}`}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-foreground/90">
        {format.delta.format(comparison.personalAvg - comparison.massAvg)}
      </span>
    </li>
  );
}

function CompareChart({
  decades,
  dict,
  format,
}: {
  decades: DecadeComparison[];
  dict: ChartsDict;
  format: Formatters;
}) {
  const summary = useMemo(() => comparisonSummary(decades), [decades]);
  if (decades.length === 0) return <p className="text-sm leading-relaxed text-muted">{dict.compareEmpty}</p>;

  return (
    <div>
      <div className="mb-4 flex items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
          {dict.you}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted" />
          {dict.crowd}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {decades.map((d) => (
          <DumbbellRow key={d.decade} comparison={d} dict={dict} format={format} />
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-3">
        <span className="w-24 shrink-0" />
        <div className="relative flex-1 text-[10px] text-muted">
          <span className="absolute left-0">0</span>
          <span className="absolute left-1/2 -translate-x-1/2">5</span>
          <span className="absolute right-0">10</span>
        </div>
        <span className="w-14 shrink-0" />
      </div>
      {summary && (
        <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted">
          {formatMessage(dict.compareSummary, {
            delta: format.delta.format(summary.delta),
            count: summary.count,
          })}
        </p>
      )}
    </div>
  );
}

export function ChartsPanel({ lang, entries, dict }: ChartsPanelProps) {
  const [tab, setTab] = useState<Tab>("decade");
  const cd = dict.charts;
  const tp = dict.topPeople;
  const { movies, credits, status, pendingCount, progress, errorCode, enrich, cancel } = useMovieCredits(entries);

  const format = useMemo<Formatters>(() => {
    const rating = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const delta = new Intl.NumberFormat(lang, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: "exceptZero",
    });
    return { rating, delta };
  }, [lang]);

  const decades = useMemo(() => decadeStats(movies), [movies]);
  const genres = useMemo(() => genreStats(movies, credits), [movies, credits]);
  const compareDecades = useMemo(() => compareByDecade(movies, credits), [movies, credits]);

  const activeTab = tabs.find((t) => t.key === tab)!;
  const isLoading = activeTab.needsCredits && status === "loading";

  return (
    <Panel title={cd.title}>
      <div className="flex flex-wrap">
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
            {label(cd)}
          </button>
        ))}
      </div>

      {activeTab.needsCredits && status === "enriching" && progress && (
        <div className="mt-5 border border-border-strong px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {formatMessage(tp.enriching, { done: progress.done, total: progress.total })}
            </span>
            <button
              type="button"
              onClick={cancel}
              className="text-[11px] uppercase tracking-widest text-muted hover:text-danger"
            >
              {tp.cancel}
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

      {activeTab.needsCredits && status === "incomplete" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-border-strong px-4 py-3">
          <span className="text-xs text-muted">
            {formatMessage(tp.incompleteBody, { count: pendingCount })}
          </span>
          <Button variant="ghost" onClick={enrich} className="px-4 py-1.5 text-[11px]">
            {tp.enrichCta}
          </Button>
        </div>
      )}

      {activeTab.needsCredits && status === "error" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-danger px-4 py-3">
          <span className="text-xs text-danger">{errorCode === "config" ? tp.errorConfig : tp.errorGeneric}</span>
          {errorCode !== "config" && (
            <Button variant="ghost" onClick={enrich} className="px-4 py-1.5 text-[11px]">
              {tp.retry}
            </Button>
          )}
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted">{cd.loading}</p>
        ) : tab === "decade" ? (
          <DecadeChart stats={decades} dict={cd} format={format} noRatingLabel={tp.filmsNoRating} />
        ) : tab === "compare" ? (
          <CompareChart decades={compareDecades} dict={cd} format={format} />
        ) : (
          <GenreChart stats={genres} dict={cd} format={format} noRatingLabel={tp.filmsNoRating} />
        )}
      </div>
    </Panel>
  );
}
