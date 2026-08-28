"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadZip } from "@/lib/zip";
import { detectAdapter } from "@/lib/importers/registry";
import { saveImportResult } from "@/lib/storage";
import { SOURCE_LABELS, type ImportResult, type ImportWarning } from "@/lib/types";
import { collectMovies, movieKey } from "@/lib/analysis/movies";
import { enrichMovies } from "@/lib/enrich/credits";
import { isFatalTmdbError } from "@/lib/tmdb";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";
import { useToast } from "@/components/ui/toast/ToastProvider";

type Status = "idle" | "processing" | "success" | "error";

interface LogLine {
  text: string;
  tone?: "error";
  /** Riga di avanzamento: viene riscritta al posto di accodarne una nuova. */
  progress?: boolean;
}

interface UploadFlowProps {
  lang: string;
  dict: Dictionary["upload"];
  warningMessages: Dictionary["warnings"];
}

export function UploadFlow({ lang, dict, warningMessages }: UploadFlowProps) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const appendLog = useCallback((text: string, tone?: "error") => {
    setLog((prev) => [...prev, { text, tone }]);
  }, []);

  const updateProgressLog = useCallback((text: string) => {
    setLog((prev) => {
      const line: LogLine = { text, progress: true };
      return prev[prev.length - 1]?.progress ? [...prev.slice(0, -1), line] : [...prev, line];
    });
  }, []);

  /**
   * Scarica da TMDB regia e cast dei film importati e li mette in cache locale,
   * così la dashboard trova i dati già pronti. Un fallimento qui non invalida l'import:
   * l'analisi resta completabile dalla dashboard.
   */
  const enrichEntries = useCallback(
    async (parsed: ImportResult): Promise<ImportResult> => {
      const movies = collectMovies(parsed.entries);
      if (movies.length === 0) return parsed;

      try {
        let started = false;
        const snapshot = await enrichMovies(movies, {
          onProgress: ({ done, total }) => {
            if (total === 0) return;
            if (!started) {
              started = true;
              appendLog(formatMessage(dict.enrichStart, { count: total }));
            }
            // Su migliaia di film non serve ridisegnare il log a ogni singolo risultato.
            const step = Math.max(1, Math.floor(total / 100));
            if (done % step === 0 || done === total) {
              updateProgressLog(formatMessage(dict.enrichProgress, { done, total }));
            }
          },
        });

        appendLog(
          started ? formatMessage(dict.enrichDone, { count: snapshot.credits.size }) : dict.enrichCached,
        );

        if (snapshot.resolved.size === 0) return parsed;
        // Gli id risolti per titolo vengono persistiti nell'import: la dashboard non li ricerca più.
        return {
          ...parsed,
          entries: parsed.entries.map((entry) => {
            if (entry.mediaType !== "movie" || entry.tmdbId) return entry;
            const tmdbId = snapshot.resolved.get(movieKey(entry));
            return tmdbId ? { ...entry, tmdbId } : entry;
          }),
        };
      } catch (err) {
        appendLog(isFatalTmdbError(err) && err.status === 503 ? dict.enrichSkipped : dict.enrichFailed);
        return parsed;
      }
    },
    [appendLog, updateProgressLog, dict],
  );

  const translateWarning = useCallback(
    (warning: ImportWarning) => formatMessage(warningMessages[warning.code], warning.params),
    [warningMessages],
  );

  const processFile = useCallback(
    async (file: File) => {
      setStatus("processing");
      setLog([]);
      setResult(null);

      if (!file.name.toLowerCase().endsWith(".zip")) {
        appendLog(formatMessage(dict.notZip, { name: file.name }), "error");
        setStatus("error");
        toast.error(formatMessage(dict.toastNotZipBody, { name: file.name }), {
          title: dict.toastErrorTitle,
        });
        return;
      }

      try {
        appendLog(formatMessage(dict.readingArchive, { name: file.name }));
        const zip = await loadZip(file);

        appendLog(dict.detectingSource);
        const adapter = await detectAdapter(zip);

        if (!adapter) {
          appendLog(dict.noSourceRecognized);
          setStatus("error");
          toast.error(dict.formatNotRecognized, { title: dict.toastErrorTitle });
          return;
        }

        const sourceLabel = SOURCE_LABELS[adapter.source];
        appendLog(formatMessage(dict.sourceDetected, { source: sourceLabel }));
        appendLog(dict.normalizing);
        const parsed = await adapter.parse(zip, file.name);

        appendLog(formatMessage(dict.itemsImported, { count: parsed.entries.length }));
        parsed.warnings.forEach((w) => appendLog(formatMessage(dict.warningPrefix, { message: translateWarning(w) })));

        const enriched = await enrichEntries(parsed);
        appendLog(dict.ready);

        saveImportResult(enriched);
        setResult(enriched);
        setStatus("success");

        toast.success(
          formatMessage(dict.toastSuccessBody, {
            count: parsed.entries.length,
            source: sourceLabel,
          }),
          { title: dict.toastSuccessTitle },
        );

        if (parsed.warnings.length > 0) {
          toast.info(formatMessage(dict.toastWarningsBody, { count: parsed.warnings.length }), {
            title: dict.toastWarningsTitle,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : dict.processingFailed;
        appendLog(formatMessage(dict.errorPrefix, { message }), "error");
        setStatus("error");
        toast.error(message, { title: dict.toastErrorTitle });
      }
    },
    [appendLog, dict, enrichEntries, translateWarning, toast],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const onFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  return (
    <div className="flex flex-col gap-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer border border-dashed px-6 py-16 text-center transition-colors ${
          dragging ? "border-accent bg-surface-raised" : "border-border-strong bg-surface"
        }`}
      >
        <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={onFileSelected} />
        <p className="text-sm uppercase tracking-widest text-foreground">{dict.dropzone}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted">{dict.dropzoneAlt}</p>
      </div>

      {log.length > 0 && (
        <Panel title={dict.logTitle}>
          <div className="flex flex-col gap-1 font-mono text-xs text-muted">
            {log.map((line, i) => (
              <div key={i} className={line.tone === "error" ? "text-danger" : ""}>
                {line.text}
              </div>
            ))}
            {status === "processing" && <div className="cursor-blink text-accent">_</div>}
          </div>
        </Panel>
      )}

      {status === "success" && result && (
        <Panel title={dict.importCompleteTitle} tag={dict.importCompleteTag}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="accent">{SOURCE_LABELS[result.source]}</Badge>
            <span className="text-sm text-muted">{formatMessage(dict.items, { count: result.entries.length })}</span>
          </div>
          <div className="mt-6">
            <Button variant="primary" onClick={() => router.push(`/${lang}/dashboard`)}>
              {dict.goToDashboard}
            </Button>
          </div>
        </Panel>
      )}

      {status === "error" && (
        <Panel title={dict.importFailedTitle} tag={dict.importFailedTag}>
          <p className="text-sm text-muted">{dict.formatNotRecognized}</p>
          <div className="mt-6">
            <Button variant="ghost" onClick={() => setStatus("idle")}>
              {dict.retry}
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
