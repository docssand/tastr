"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  getImportResultServerSnapshot,
  getImportResultSnapshot,
  subscribeImportResult,
} from "@/lib/storage";
import { Panel } from "@/components/ui/Panel";
import { Button, LinkButton } from "@/components/ui/Button";
import { useMovieCredits } from "@/components/dashboard/useMovieCredits";
import { buildWrapped, watchYears } from "@/lib/analysis/wrapped";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";
import type { NormalizedEntry } from "@/lib/types";
import { WrappedCardPanel, wrappedFormatters } from "@/components/wrapped/WrappedCardPanel";
import { WrappedSummaryPanel } from "@/components/wrapped/WrappedSummaryPanel";
import { WrappedDeck } from "@/components/wrapped/WrappedDeck";
import { useMediaQuery } from "@/components/ui/useMediaQuery";

type WrappedDict = Dictionary["wrapped"];

interface WrappedViewProps {
  lang: string;
  dict: WrappedDict;
}

/**
 * Stato dell'arricchimento TMDB. Tre schede su otto (approfondimento, massa, generi)
 * non esistono senza: la pagina resta utilizzabile e le sblocca quando l'analisi finisce.
 */
function CreditsBanner({
  dict,
  credits,
}: {
  dict: WrappedDict["credits"];
  credits: ReturnType<typeof useMovieCredits>;
}) {
  const { status, pendingCount, progress, errorCode, enrich, cancel } = credits;

  if (status === "enriching" && progress) {
    return (
      <div className="border border-border-strong px-4 py-3">
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
    );
  }

  if (status === "incomplete") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border-strong px-4 py-3">
        <span className="text-xs text-muted">{formatMessage(dict.incompleteBody, { count: pendingCount })}</span>
        <Button variant="ghost" onClick={enrich} className="px-4 py-1.5 text-[11px]">
          {dict.enrichCta}
        </Button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-danger px-4 py-3">
        <span className="text-xs text-danger">{errorCode === "config" ? dict.errorConfig : dict.errorGeneric}</span>
        {errorCode !== "config" && (
          <Button variant="ghost" onClick={enrich} className="px-4 py-1.5 text-[11px]">
            {dict.retry}
          </Button>
        )}
      </div>
    );
  }

  return null;
}

function YearPicker({
  years,
  selected,
  currentYear,
  dict,
  onSelect,
}: {
  years: number[];
  selected: number;
  currentYear: number;
  dict: WrappedDict;
  onSelect: (year: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {years.map((year) => (
        <button
          key={year}
          type="button"
          onClick={() => onSelect(year)}
          aria-pressed={year === selected}
          className={`border px-4 py-1.5 text-xs uppercase tracking-widest transition-colors ${
            year === selected ? "border-accent text-accent" : "border-border-strong text-muted hover:text-foreground"
          }`}
        >
          {year}
          {year === currentYear && <span className="ml-2 text-[10px] opacity-70">{dict.inProgress}</span>}
        </button>
      ))}
    </div>
  );
}

function WrappedContent({ lang, entries, dict }: { lang: string; entries: NormalizedEntry[]; dict: WrappedDict }) {
  const credits = useMovieCredits(entries);
  const [picked, setPicked] = useState<number | null>(null);
  // Sotto il breakpoint delle due colonne le schede diventano un mazzo: una alla volta, da trascinare.
  const isWide = useMediaQuery("(min-width: 768px)");

  const years = useMemo(() => watchYears(entries), [entries]);
  // Fissato al primo render: il ritmo dell'anno in corso dipende dal mese, non deve cambiare a metà pagina.
  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();

  const format = useMemo(() => wrappedFormatters(lang), [lang]);

  // L'anno scelto resta valido solo finché esiste nell'import: un nuovo upload lo riporta al più recente.
  const fallbackYear = years.includes(currentYear) ? currentYear : years[0];
  const year = picked !== null && years.includes(picked) ? picked : fallbackYear;

  const report = useMemo(
    () => (year === undefined ? null : buildWrapped(entries, credits.credits, year, now)),
    [entries, credits.credits, year, now],
  );

  if (years.length === 0 || !report) {
    return (
      <Panel title={dict.noYearsTitle}>
        <p className="text-sm leading-relaxed text-muted">{dict.noYearsBody}</p>
      </Panel>
    );
  }

  const creditsIncomplete = credits.status !== "ready";

  const cards = report.cards.map((card, i) => (
    <WrappedCardPanel
      key={card.id}
      card={card}
      index={i + 1}
      total={report.cards.length}
      year={report.year}
      creditsIncomplete={creditsIncomplete}
      dict={dict}
      format={format}
    />
  ));

  return (
    <div className="flex flex-col gap-10">
      <Panel title={dict.yearsLabel}>
        <YearPicker years={years} selected={year} currentYear={currentYear} dict={dict} onSelect={setPicked} />
        <p className="mt-5 text-xs text-muted">
          {formatMessage(dict.yearSummary, {
            movies: format.count.format(report.summary.movieCount),
            viewings: format.count.format(report.summary.viewingCount),
            rated: format.count.format(report.summary.ratedCount),
          })}
        </p>
      </Panel>

      <CreditsBanner dict={dict.credits} credits={credits} />

      {credits.status === "loading" ? (
        <p className="text-sm text-muted">{dict.credits.loading}</p>
      ) : isWide ? (
        <>
          <div className="grid gap-x-6 gap-y-12 md:grid-cols-2">
            {cards}
          </div>

          <WrappedSummaryPanel report={report} dict={dict} format={format} />
        </>
      ) : (
        // Cambiare anno rimescola il mazzo: la key lo riporta alla prima scheda.
        <WrappedDeck key={report.year} dict={dict.deck}>
          {[
            ...cards,
            <WrappedSummaryPanel key="summary" report={report} dict={dict} format={format} className="h-full" />,
          ]}
        </WrappedDeck>
      )}
    </div>
  );
}

export function WrappedView({ lang, dict }: WrappedViewProps) {
  const result = useSyncExternalStore(
    subscribeImportResult,
    getImportResultSnapshot,
    getImportResultServerSnapshot,
  );

  if (result === null) {
    return (
      <Panel title={dict.emptyTitle}>
        <p className="text-sm leading-relaxed text-muted">{dict.emptyBody}</p>
        <div className="mt-6">
          <LinkButton href={`/${lang}/upload`} variant="primary">
            {dict.emptyCta}
          </LinkButton>
        </div>
      </Panel>
    );
  }

  return <WrappedContent lang={lang} entries={result.entries} dict={dict} />;
}
