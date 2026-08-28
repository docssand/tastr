"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useMovieCredits } from "@/components/dashboard/useMovieCredits";
import {
  compareByDecade,
  compareByGenre,
  comparisonSummary,
  decadeStats,
  genreStats,
  type DecadeStat,
  type GenreStat,
} from "@/lib/analysis/charts";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";
import type { NormalizedEntry } from "@/lib/types";

/** Numero di barre/righe mostrate: oltre, il grafico diventa illeggibile e serve una tabella. */
const TOP_GENRES = 8;

type Tab = "decade" | "genre";
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

/** Riga generica di confronto: la formattazione dell'etichetta (decennio o genere) resta a chi chiama. */
interface ComparisonRow {
  key: string;
  label: string;
  count: number;
  personalAvg: number;
  massAvg: number;
}

const tabs: { key: Tab; label: (d: ChartsDict) => string }[] = [
  { key: "decade", label: (d) => d.tabDecade },
  { key: "genre", label: (d) => d.tabGenre },
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
function DumbbellRow({ row, dict, format }: { row: ComparisonRow; dict: ChartsDict; format: Formatters }) {
  const toPct = (v: number) => `${(v / 10) * 100}%`;
  const left = Math.min(row.personalAvg, row.massAvg);
  const right = Math.max(row.personalAvg, row.massAvg);

  return (
    <li className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs text-muted" title={row.label}>
        {row.label}
      </span>
      <div className="relative h-5 flex-1">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <div
          className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-border-strong"
          style={{ left: toPct(left), right: `${100 - (right / 10) * 100}%` }}
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted ring-2 ring-surface"
          style={{ left: toPct(row.massAvg) }}
          title={`${dict.crowd}: ${format.rating.format(row.massAvg)}`}
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
          style={{ left: toPct(row.personalAvg) }}
          title={`${dict.you}: ${format.rating.format(row.personalAvg)}`}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-foreground/90">
        {format.delta.format(row.personalAvg - row.massAvg)}
      </span>
    </li>
  );
}

function CompareChart({ rows, dict, format }: { rows: ComparisonRow[]; dict: ChartsDict; format: Formatters }) {
  const summary = useMemo(() => comparisonSummary(rows), [rows]);
  if (rows.length === 0) return <p className="text-sm leading-relaxed text-muted">{dict.compareEmpty}</p>;

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
        {rows.map((row) => (
          <DumbbellRow key={row.key} row={row} dict={dict} format={format} />
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
  const [compareMode, setCompareMode] = useState(false);
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

  const decades = useMemo(() => decadeStats(movies, credits), [movies, credits]);
  const genres = useMemo(() => genreStats(movies, credits), [movies, credits]);

  const compareDecadeRows = useMemo<ComparisonRow[]>(
    () =>
      compareByDecade(movies, credits).map((d) => ({
        key: String(d.decade),
        label: formatMessage(cd.decadeLabel, { decade: d.decade }),
        count: d.count,
        personalAvg: d.personalAvg,
        massAvg: d.massAvg,
      })),
    [movies, credits, cd.decadeLabel],
  );
  const compareGenreRows = useMemo<ComparisonRow[]>(
    () =>
      compareByGenre(movies, credits)
        .slice(0, TOP_GENRES)
        .map((g) => ({ key: g.genre, label: g.genre, count: g.count, personalAvg: g.personalAvg, massAvg: g.massAvg })),
    [movies, credits],
  );

  // Il genere richiede sempre i credits TMDB; il decennio solo in modalità confronto
  // (in modalità personale può bastare l'anno già presente nell'import).
  const needsCredits = tab === "genre" || compareMode;
  const isLoading = needsCredits && status === "loading";

  return (
    <Panel title={cd.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              {label(cd)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCompareMode((v) => !v)}
          aria-pressed={compareMode}
          className={`inline-flex items-center gap-2 border px-4 py-1.5 text-xs uppercase tracking-widest transition-colors ${
            compareMode ? "border-accent text-accent" : "border-border-strong text-muted hover:text-foreground"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full transition-colors ${compareMode ? "bg-accent" : "bg-border-strong"}`}
          />
          {cd.compareToggle}
        </button>
      </div>

      {needsCredits && status === "enriching" && progress && (
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

      {needsCredits && status === "incomplete" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-border-strong px-4 py-3">
          <span className="text-xs text-muted">
            {formatMessage(tp.incompleteBody, { count: pendingCount })}
          </span>
          <Button variant="ghost" onClick={enrich} className="px-4 py-1.5 text-[11px]">
            {tp.enrichCta}
          </Button>
        </div>
      )}

      {needsCredits && status === "error" && (
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
          compareMode ? (
            <CompareChart rows={compareDecadeRows} dict={cd} format={format} />
          ) : (
            <DecadeChart stats={decades} dict={cd} format={format} noRatingLabel={tp.filmsNoRating} />
          )
        ) : compareMode ? (
          <CompareChart rows={compareGenreRows} dict={cd} format={format} />
        ) : (
          <GenreChart stats={genres} dict={cd} format={format} noRatingLabel={tp.filmsNoRating} />
        )}
      </div>
    </Panel>
  );
}
