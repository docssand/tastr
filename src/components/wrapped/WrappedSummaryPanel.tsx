"use client";

import { Panel } from "@/components/ui/Panel";
import type { WrappedCard, WrappedReport } from "@/lib/analysis/wrapped";
import { traitNames } from "@/lib/wrappedPresentation";
import type { Dictionary } from "@/i18n/types";
import type { WrappedFormatters } from "@/components/wrapped/WrappedCardPanel";
import { ShareWrappedButton } from "@/components/wrapped/ShareWrappedButton";

type WrappedDict = Dictionary["wrapped"];

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-1.5 truncate text-sm text-foreground/90" title={value}>
        {value}
      </div>
    </div>
  );
}

/** Gli aggettivi delle otto schede, nell'ordine in cui li hai letti scorrendo la pagina. */
function TraitList({ cards, dict }: { cards: WrappedCard[]; dict: WrappedDict }) {
  const names = traitNames(cards, dict);

  if (names.length === 0) return null;

  return (
    <div className="mt-8 border-t border-border pt-5">
      <div className="text-[10px] uppercase tracking-widest text-muted">{dict.summary.traitsTitle}</div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {names.map((name, i) => (
          <li
            key={`${name}-${i}`}
            className="border border-border-strong px-2.5 py-1 text-xs uppercase tracking-widest text-accent"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WrappedSummaryPanel({
  report,
  dict,
  format,
  lang,
  className,
}: {
  report: WrappedReport;
  dict: WrappedDict;
  format: WrappedFormatters;
  lang: string;
  className?: string;
}) {
  const { summary } = report;
  const archetype = dict.archetypes[summary.archetype];
  const none = dict.summary.none;

  return (
    <Panel title={dict.summary.title} tag={dict.summary.tag} className={className}>
      <div className="text-xs uppercase tracking-widest text-muted">{report.year}</div>
      <p className="mt-4 bracket-label text-3xl text-accent text-glow">{archetype.name}</p>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/90">{archetype.body}</p>

      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-6 sm:grid-cols-3 lg:grid-cols-4">
        <Figure label={dict.summary.movies} value={format.count.format(summary.movieCount)} />
        <Figure label={dict.summary.viewings} value={format.count.format(summary.viewingCount)} />
        <Figure label={dict.summary.rated} value={format.count.format(summary.ratedCount)} />
        <Figure
          label={dict.summary.avgRating}
          value={summary.averageRating === null ? none : format.rating.format(summary.averageRating)}
        />
        <Figure label={dict.summary.topGenre} value={summary.topGenre ?? none} />
        <Figure label={dict.summary.topDirector} value={summary.topDirector ?? none} />
        <Figure label={dict.summary.favourite} value={summary.favouriteMovie ?? none} />
      </div>

      <TraitList cards={report.cards} dict={dict} />

      <div className="mt-8 border-t border-border pt-6">
        <ShareWrappedButton report={report} dict={dict} format={format} lang={lang} />
      </div>
    </Panel>
  );
}
