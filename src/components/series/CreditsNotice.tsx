"use client";

import { Button } from "@/components/ui/Button";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";
import type { ShowEnrichProgress } from "@/lib/enrich/showCredits";
import type { ShowCreditsErrorCode, ShowCreditsStatus } from "@/components/series/useShowCredits";

interface CreditsNoticeProps {
  status: ShowCreditsStatus;
  pendingCount: number;
  progress: ShowEnrichProgress | null;
  errorCode: ShowCreditsErrorCode | null;
  enrich: () => void;
  cancel: () => void;
  dict: Dictionary["series"]["credits"];
}

/**
 * Stato dell'arricchimento TMDB, in cima alla pagina.
 *
 * Sta in un componente solo perché qui l'analisi è una sola per tutta la sezione: i
 * pannelli condividono lo stesso hook, quindi condividono anche l'avviso, invece di
 * ripeterlo tre volte come fa la dashboard dove ogni pannello legge per conto suo.
 */
export function CreditsNotice({
  status,
  pendingCount,
  progress,
  errorCode,
  enrich,
  cancel,
  dict,
}: CreditsNoticeProps) {
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
        <span className="text-xs text-muted">
          {formatMessage(dict.incompleteBody, { count: pendingCount })}
        </span>
        <Button variant="ghost" onClick={enrich} className="px-4 py-1.5 text-[11px]">
          {dict.enrichCta}
        </Button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-danger px-4 py-3">
        <span className="text-xs text-danger">
          {errorCode === "config" ? dict.errorConfig : dict.errorGeneric}
        </span>
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
