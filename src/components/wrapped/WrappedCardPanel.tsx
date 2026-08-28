"use client";

import { Panel } from "@/components/ui/Panel";
import { formatMessage } from "@/lib/i18n";
import type { WrappedCard, WrappedMetric } from "@/lib/analysis/wrapped";
import type { Dictionary } from "@/i18n/types";

type WrappedDict = Dictionary["wrapped"];

export interface WrappedFormatters {
  count: Intl.NumberFormat;
  rating: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  delta: Intl.NumberFormat;
  score: Intl.NumberFormat;
}

export function wrappedFormatters(lang: string): WrappedFormatters {
  return {
    count: new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }),
    rating: new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    percent: new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }),
    delta: new Intl.NumberFormat(lang, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: "exceptZero",
    }),
    score: new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: "exceptZero",
    }),
  };
}

function formatMetric(metric: WrappedMetric, format: WrappedFormatters, fallback: string) {
  switch (metric.format) {
    case "text":
      return metric.text ?? fallback;
    case "count":
      return format.count.format(metric.value);
    case "rating":
      return format.rating.format(metric.value);
    case "percent":
      return format.percent.format(metric.value);
    case "delta":
      return format.delta.format(metric.value);
    case "score":
      return format.score.format(metric.value);
  }
}

function MetricList({
  metrics,
  dict,
  format,
}: {
  metrics: WrappedMetric[];
  dict: WrappedDict;
  format: WrappedFormatters;
}) {
  if (metrics.length === 0) return null;

  return (
    <dl className="mt-6 flex flex-col gap-2 border-t border-border pt-4">
      {metrics.map((metric) => (
        <div key={metric.key} className="flex items-baseline justify-between gap-4 text-xs">
          <dt className="text-muted">{dict.metrics[metric.key]}</dt>
          <dd className="shrink-0 tabular-nums text-foreground/90">
            {formatMetric(metric, format, dict.summary.none)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface WrappedCardPanelProps {
  card: WrappedCard;
  /** Posizione nel mazzo, da 1: è il numero stampato sulla scheda. */
  index: number;
  total: number;
  year: number;
  /** Vero finché i dati TMDB non sono completi: distingue "manca l'analisi" da "mancano i film". */
  creditsIncomplete: boolean;
  dict: WrappedDict;
  format: WrappedFormatters;
}

export function WrappedCardPanel({
  card,
  index,
  total,
  year,
  creditsIncomplete,
  dict,
  format,
}: WrappedCardPanelProps) {
  const copy = dict.cards[card.id];
  const verdict =
    card.verdict === null
      ? null
      : card.verdict.kind === "animal"
        ? dict.animals[card.verdict.key]
        : dict.verdicts[card.verdict.key];

  return (
    <Panel
      title={copy.title}
      tag={formatMessage(dict.cardCounter, { index: String(index).padStart(2, "0"), total })}
      className="flex h-full flex-col"
    >
      <p className="text-xs leading-relaxed text-muted">{copy.prompt}</p>

      {verdict ? (
        <div className="mt-5">
          <p className="bracket-label text-2xl text-accent text-glow">{verdict.name}</p>
          <p className="mt-3 text-sm leading-relaxed text-foreground/90">{verdict.body}</p>
        </div>
      ) : (
        <div className="mt-5">
          <p className="bracket-label text-2xl text-muted/70">{dict.summary.none}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {card.needsCredits && creditsIncomplete
              ? dict.needsCredits
              : formatMessage(dict.notEnough, { year })}
          </p>
        </div>
      )}

      <div className="mt-auto">
        <MetricList metrics={card.metrics} dict={dict} format={format} />
      </div>
    </Panel>
  );
}
