"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getImportResultServerSnapshot,
  getImportResultSnapshot,
  subscribeImportResult,
} from "@/lib/storage";
import { Panel } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { LinkButton } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";
import { useShowCredits } from "@/components/series/useShowCredits";
import { CreditsNotice } from "@/components/series/CreditsNotice";
import { ShowsPanel } from "@/components/series/ShowsPanel";
import { HabitsPanel } from "@/components/series/HabitsPanel";
import { TopShowPeoplePanel } from "@/components/series/TopShowPeoplePanel";
import { formatDuration } from "@/components/series/format";
import { buildShowStats, showCreditsCoverage, summarizeShows } from "@/lib/analysis/showStats";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";
import type { NormalizedEntry } from "@/lib/types";

interface SeriesViewProps {
  lang: string;
  dict: Dictionary["series"];
}

function EmptyPanel({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
  return (
    <Panel title={title}>
      <div className="flex flex-col items-center gap-4 py-6 text-center sm:flex-row sm:text-left">
        <Mascot size={72} />
        <div>
          <p className="text-sm leading-relaxed text-muted">{body}</p>
          <div className="mt-6">
            <LinkButton href={href} variant="primary">
              {cta}
            </LinkButton>
          </div>
        </div>
      </div>
    </Panel>
  );
}

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

/**
 * Il contenuto vero della sezione. L'arricchimento TMDB si legge una volta sola qui e
 * scende ai pannelli già calcolato: le serie di una libreria sono poche rispetto ai film,
 * e tenerle in un posto solo evita tre letture della cache per la stessa pagina.
 */
function SeriesContent({ lang, entries, dict }: { lang: string; entries: NormalizedEntry[]; dict: Dictionary["series"] }) {
  const { shows, credits, status, pendingCount, progress, errorCode, enrich, cancel } = useShowCredits(entries);

  const format = useMemo(
    () => ({
      score: new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      rating: new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      delta: new Intl.NumberFormat(lang, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        signDisplay: "exceptZero",
      }),
      percent: new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }),
      integer: new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }),
    }),
    [lang],
  );

  const stats = useMemo(() => buildShowStats(shows, credits), [shows, credits]);
  const summary = useMemo(() => summarizeShows(stats), [stats]);
  const coverage = useMemo(() => showCreditsCoverage(shows, credits), [shows, credits]);

  if (status === "loading") {
    return (
      <Panel title={dict.shows.title}>
        <SkeletonRows />
      </Panel>
    );
  }

  if (stats.length === 0) {
    return (
      <EmptyPanel
        title={dict.noShowsTitle}
        body={dict.noShowsBody}
        cta={dict.noShowsCta}
        href={`/${lang}/dashboard`}
      />
    );
  }

  const sd = dict.summary;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={sd.shows}
            value={format.integer.format(summary.shows)}
            detail={formatMessage(sd.showsDetail, { count: summary.completedShows })}
          />
          <StatCard
            label={sd.episodes}
            value={format.integer.format(summary.episodes)}
            detail={formatMessage(sd.episodesDetail, {
              plays: summary.plays,
              rewatched: summary.rewatchedEpisodes,
            })}
          />
          <StatCard
            label={sd.time}
            value={summary.minutes > 0 ? formatDuration(summary.minutes, sd, format.integer) : sd.none}
            detail={formatMessage(sd.timeDetail, { covered: summary.timedShows, total: summary.shows })}
          />
          <StatCard
            label={sd.rating}
            value={summary.avgRating === null ? sd.none : format.rating.format(summary.avgRating)}
            detail={formatMessage(sd.ratingDetail, { count: summary.ratedShows })}
          />
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <CreditsNotice
            status={status}
            pendingCount={pendingCount}
            progress={progress}
            errorCode={errorCode}
            enrich={enrich}
            cancel={cancel}
            dict={dict.credits}
          />
          <span className="text-[11px] uppercase tracking-widest text-muted">
            {formatMessage(dict.credits.coverage, { covered: coverage.covered, total: coverage.total })}
          </span>
        </div>
      </div>

      <ShowsPanel shows={stats} dict={dict} format={format} />

      <HabitsPanel shows={stats} dict={dict} format={format} />

      <TopShowPeoplePanel shows={stats} credits={credits} dict={dict.people} format={format} />
    </div>
  );
}

export function SeriesView({ lang, dict }: SeriesViewProps) {
  const result = useSyncExternalStore(
    subscribeImportResult,
    getImportResultSnapshot,
    getImportResultServerSnapshot,
  );

  if (result === null) {
    return (
      <EmptyPanel
        title={dict.emptyTitle}
        body={dict.emptyBody}
        cta={dict.emptyCta}
        href={`/${lang}/upload`}
      />
    );
  }

  return <SeriesContent lang={lang} entries={result.entries} dict={dict} />;
}
