"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  getImportResultServerSnapshot,
  getImportResultSnapshot,
  subscribeImportResult,
} from "@/lib/storage";
import { Panel } from "@/components/ui/Panel";
import { Button, LinkButton } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";
import { useMovieCredits } from "@/components/dashboard/useMovieCredits";
import { SuggestionCard, suggestionFormatters } from "@/components/suggestions/SuggestionCard";
import { useSuggestions } from "@/components/suggestions/useSuggestions";
import { TASTE_TUNING, type TasteScope } from "@/lib/analysis/taste";
import type { Gap, Recommendation } from "@/lib/analysis/recommendations";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";
import type { NormalizedEntry } from "@/lib/types";

type SuggestionsDict = Dictionary["suggestions"];
type Tab = "forYou" | "gaps";

interface SuggestionsViewProps {
  lang: string;
  dict: SuggestionsDict;
}

/** Stato dell'arricchimento TMDB: senza credits il profilo non esiste, con credits parziali è più povero. */
function CreditsBanner({
  dict,
  credits,
}: {
  dict: SuggestionsDict["credits"];
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

function ScopePicker({
  scope,
  dict,
  onSelect,
}: {
  scope: TasteScope;
  dict: SuggestionsDict;
  onSelect: (scope: TasteScope) => void;
}) {
  const options: Array<{ label: string; value: TasteScope }> = [
    { label: dict.scopeAll, value: { kind: "all" } },
    { label: dict.scopeRecent, value: { kind: "recent" } },
  ];

  return (
    <div className="flex">
      {options.map((option, i) => (
        <button
          key={option.value.kind}
          type="button"
          onClick={() => onSelect(option.value)}
          aria-pressed={option.value.kind === scope.kind}
          className={`border px-4 py-1.5 text-xs uppercase tracking-widest transition-colors ${
            option.value.kind === scope.kind
              ? "border-accent text-accent"
              : "border-border-strong text-muted hover:text-foreground"
          } ${i > 0 ? "-ml-px" : ""}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function gapLabel(gap: Gap, dict: SuggestionsDict) {
  if (gap.kind === "genre") return gap.genre;
  if (gap.kind === "era") return formatMessage(dict.gapEraLabel, { decade: gap.decade });
  return gap.name;
}

function gapDetail(gap: Gap, dict: SuggestionsDict) {
  if (gap.kind === "director") {
    return formatMessage(dict.gapDirectorSeen, { seen: gap.seenCount, total: gap.filmography });
  }
  return gap.seenCount === 0 ? dict.gapNeverSeen : formatMessage(dict.gapSeen, { count: gap.seenCount });
}

/** Le lacune rilevate, anche come filtro della lista sottostante. */
function GapPicker({
  gaps,
  selected,
  dict,
  onSelect,
}: {
  gaps: Gap[];
  selected: Gap | null;
  dict: SuggestionsDict;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selected === null}
        className={`self-stretch border px-3 py-2 text-xs uppercase tracking-widest transition-colors ${
          selected === null ? "border-accent text-accent" : "border-border-strong text-muted hover:text-foreground"
        }`}
      >
        {dict.gapAll}
      </button>
      {gaps.map((gap) => (
        <button
          key={gap.key}
          type="button"
          onClick={() => onSelect(gap.key)}
          aria-pressed={selected?.key === gap.key}
          className={`min-w-32 border px-3 py-2 text-left transition-colors ${
            selected?.key === gap.key
              ? "border-accent text-accent"
              : "border-border-strong text-muted hover:text-foreground"
          }`}
        >
          <span className="block truncate text-xs uppercase tracking-widest">{gapLabel(gap, dict)}</span>
          <span className="mt-1 block text-[10px] text-muted">{gapDetail(gap, dict)}</span>
          <span className="mt-2 block h-0.5 w-full bg-border">
            <span className="block h-full bg-accent-amber" style={{ width: `${Math.round(gap.severity * 100)}%` }} />
          </span>
        </button>
      ))}
    </div>
  );
}

function SuggestionList({
  items,
  dict,
  format,
  showMatch,
}: {
  items: Recommendation[];
  dict: SuggestionsDict;
  format: ReturnType<typeof suggestionFormatters>;
  showMatch: boolean;
}) {
  if (items.length === 0) return <p className="text-sm leading-relaxed text-muted">{dict.empty}</p>;

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <SuggestionCard
          key={item.candidate.tmdbId}
          recommendation={item}
          dict={dict}
          format={format}
          showMatch={showMatch}
        />
      ))}
    </ul>
  );
}

function SuggestionsContent({ entries, dict, lang }: { entries: NormalizedEntry[]; dict: SuggestionsDict; lang: string }) {
  const credits = useMovieCredits(entries);
  const format = useMemo(() => suggestionFormatters(lang), [lang]);

  const [scope, setScope] = useState<TasteScope>({ kind: "all" });
  const [tab, setTab] = useState<Tab>("forYou");
  const [gapKey, setGapKey] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  const suggestions = useSuggestions({
    entries,
    movies: credits.movies,
    credits: credits.credits,
    creditsLoaded: credits.status !== "loading",
    scope,
  });

  // Il filtro vale finché quella lacuna esiste: cambiando periodo le lacune cambiano.
  const selectedGap = suggestions.gaps.find((gap) => gap.key === gapKey) ?? null;
  const blindSpots = selectedGap
    ? suggestions.blindSpots.filter((item) => item.gap?.key === selectedGap.key)
    : suggestions.blindSpots;

  const { profile, status } = suggestions;
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "forYou", label: dict.tabForYou },
    { key: "gaps", label: dict.tabGaps },
  ];

  return (
    <div className="flex flex-col gap-10">
      <Panel title={dict.scopeLabel}>
        <ScopePicker scope={scope} dict={dict} onSelect={setScope} />
        <p className="mt-5 text-xs leading-relaxed text-muted">{dict.scopeHint}</p>
        <p className="mt-3 text-xs tabular-nums text-muted">
          {formatMessage(dict.profileSummary, {
            movies: profile.creditedCount,
            genres: profile.genres.length,
            rated: profile.ratedCount,
            crowd:
              profile.crowdCorrelation === null
                ? dict.profileUnknown
                : format.percent.format((profile.crowdCorrelation + 1) / 2),
          })}
        </p>
      </Panel>

      <CreditsBanner dict={dict.credits} credits={credits} />

      <Panel title={dict.listsTitle}>
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
                {label}
              </button>
            ))}
          </div>
          {status === "ready" && (
            <button
              type="button"
              onClick={suggestions.refresh}
              title={dict.refreshHint}
              className="text-[11px] uppercase tracking-widest text-muted transition-colors hover:text-accent"
            >
              {dict.refresh}
            </button>
          )}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-muted">
          {tab === "forYou" ? dict.forYouLead : dict.gapsLead}
        </p>

        {status === "harvesting" && (
          <div className="mt-5 border border-border-strong px-4 py-3">
            <span className="text-xs text-muted">
              {formatMessage(dict.harvesting, {
                done: suggestions.progress?.done ?? 0,
                total: suggestions.progress?.total ?? 0,
              })}
            </span>
            <div className="mt-2.5 h-1 w-full bg-border/70">
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{
                  width: `${suggestions.progress?.total ? (suggestions.progress.done / suggestions.progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-danger px-4 py-3">
            <span className="text-xs text-danger">
              {suggestions.errorCode === "config" ? dict.errorConfig : dict.errorGeneric}
            </span>
            {suggestions.errorCode !== "config" && (
              <Button variant="ghost" onClick={suggestions.refresh} className="px-4 py-1.5 text-[11px]">
                {dict.retry}
              </Button>
            )}
          </div>
        )}

        {status === "insufficient" && (
          <p className="mt-5 text-sm leading-relaxed text-muted">
            {formatMessage(dict.insufficientBody, { count: TASTE_TUNING.minMoviesForProfile })}
          </p>
        )}

        {suggestions.failed > 0 && status === "ready" && (
          <p className="mt-5 text-xs text-muted">{formatMessage(dict.failedSome, { count: suggestions.failed })}</p>
        )}

        {status === "loading" && <p className="mt-5 text-sm text-muted">{dict.loading}</p>}

        {status === "ready" && (
          <div className="mt-6">
            {tab === "forYou" ? (
              <SuggestionList items={suggestions.forYou} dict={dict} format={format} showMatch />
            ) : suggestions.gaps.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">{dict.gapsEmptyBody}</p>
            ) : (
              <div className="flex flex-col gap-6">
                <GapPicker gaps={suggestions.gaps} selected={selectedGap} dict={dict} onSelect={setGapKey} />
                <SuggestionList
                  items={blindSpots}
                  dict={dict}
                  format={format}
                  showMatch={false}
                />
              </div>
            )}
          </div>
        )}

        <div className="mt-8 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            aria-expanded={legendOpen}
            className="text-[11px] uppercase tracking-widest text-muted transition-colors hover:text-accent"
          >
            {dict.legendToggle}
          </button>
          {legendOpen && <p className="mt-3 text-xs leading-relaxed text-muted">{dict.legend}</p>}
        </div>
      </Panel>
    </div>
  );
}

export function SuggestionsView({ lang, dict }: SuggestionsViewProps) {
  const result = useSyncExternalStore(
    subscribeImportResult,
    getImportResultSnapshot,
    getImportResultServerSnapshot,
  );

  if (result === null) {
    return (
      <Panel title={dict.emptyTitle}>
        <div className="flex flex-col items-center gap-4 py-6 text-center sm:flex-row sm:text-left">
          <Mascot size={72} />
          <div>
            <p className="text-sm leading-relaxed text-muted">{dict.emptyBody}</p>
            <div className="mt-6">
              <LinkButton href={`/${lang}/upload`} variant="primary">
                {dict.emptyCta}
              </LinkButton>
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  return <SuggestionsContent entries={result.entries} dict={dict} lang={lang} />;
}
