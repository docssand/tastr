"use client";

import { useSyncExternalStore } from "react";
import {
  clearImportResult,
  getImportResultServerSnapshot,
  getImportResultSnapshot,
  subscribeImportResult,
} from "@/lib/storage";
import { SOURCE_LABELS, type ImportResult } from "@/lib/types";
import { Panel } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { WidgetCard } from "@/components/dashboard/WidgetCard";
import { TopPeoplePanel } from "@/components/dashboard/TopPeoplePanel";
import type { Dictionary } from "@/i18n/types";
import { useToast } from "@/components/ui/toast/ToastProvider";

interface DashboardViewProps {
  lang: string;
  dict: Dictionary["dashboard"];
}

function dateRange(entries: ImportResult["entries"]) {
  const dates = entries.map((e) => e.watchedAt).filter(Boolean).sort();
  if (dates.length === 0) return "—";
  return `${dates[0]?.slice(0, 10)} → ${dates[dates.length - 1]?.slice(0, 10)}`;
}

export function DashboardView({ lang, dict }: DashboardViewProps) {
  const toast = useToast();
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

  return (
    <div className="flex flex-col gap-10">
      <Panel title={dict.activeImportTitle}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="accent">{SOURCE_LABELS[result.source]}</Badge>
            <span className="text-sm text-muted">{result.fileName}</span>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              clearImportResult();
              toast.info(dict.toastClearedBody, { title: dict.toastClearedTitle });
            }}
          >
            {dict.newImport}
          </Button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatCard label={dict.items} value={String(result.entries.length)} />
          <StatCard label={dict.period} value={dateRange(result.entries)} />
          <StatCard label={dict.source} value={SOURCE_LABELS[result.source]} />
        </div>
      </Panel>

      <TopPeoplePanel lang={lang} entries={result.entries} dict={dict.topPeople} />

      <div>
        <div className="mb-4 text-xs uppercase tracking-widest text-muted">{dict.widgetsEyebrow}</div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {dict.widgets.map((title) => (
            <WidgetCard key={title} title={title} comingSoon={dict.comingSoon} />
          ))}
        </div>
      </div>
    </div>
  );
}
