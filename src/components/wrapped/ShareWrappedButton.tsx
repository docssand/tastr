"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { renderWrappedShareImage } from "@/lib/wrappedShareImage";
import type { WrappedReport } from "@/lib/analysis/wrapped";
import type { Dictionary } from "@/i18n/types";
import type { WrappedFormatters } from "@/components/wrapped/WrappedCardPanel";

interface ShareWrappedButtonProps {
  report: WrappedReport;
  dict: Dictionary["wrapped"];
  format: WrappedFormatters;
  lang: string;
}

function fileNameFor(year: number) {
  return `tastr-wrapped-${year}.png`;
}

export function ShareWrappedButton({ report, dict, format, lang }: ShareWrappedButtonProps) {
  const copy = dict.share;
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // L'URL dell'anteprima punta a un blob: va rilasciato quando non serve più.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const closePreview = useCallback(() => {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [preview, closePreview]);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const blob = await renderWrappedShareImage(report, dict, format, lang);
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch {
      toast.error(copy.toastErrorBody, { title: copy.toastErrorTitle });
    } finally {
      setGenerating(false);
    }
  }, [report, dict, format, lang, toast, copy]);

  const download = useCallback(() => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview.url;
    a.download = fileNameFor(report.year);
    a.click();
  }, [preview, report.year]);

  const share = useCallback(async () => {
    if (!preview) return;
    const file = new File([preview.blob], fileNameFor(report.year), { type: "image/png" });
    const canShareFile = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

    if (!navigator.share || !canShareFile) {
      download();
      toast.info(copy.shareUnavailable);
      return;
    }

    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      download();
      toast.info(copy.shareUnavailable);
    }
  }, [preview, report.year, download, toast, copy]);

  return (
    <>
      <Button variant="ghost" onClick={generate} disabled={generating}>
        {generating ? copy.generating : copy.cta}
      </Button>

      {preview && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={copy.previewTitle}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-background/90 p-6"
          onClick={(e) => {
            if (e.target === dialogRef.current) closePreview();
          }}
        >
          <div className="flex max-h-full w-full max-w-sm flex-col items-center gap-5">
            <p className="text-xs uppercase tracking-widest text-muted">{copy.previewTitle}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- immagine generata client-side da un blob: */}
            <img
              src={preview.url}
              alt=""
              className="max-h-[70vh] w-auto rounded-sm border border-border-strong object-contain"
            />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" onClick={share}>
                {copy.shareAction}
              </Button>
              <Button variant="ghost" onClick={download}>
                {copy.download}
              </Button>
              <Button variant="ghost" onClick={closePreview}>
                {copy.close}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
