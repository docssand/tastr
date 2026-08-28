"use client";

import { useEffect } from "react";
import type { ToastData, ToastLabels, ToastTone } from "@/components/ui/toast/ToastProvider";

const TONE_STYLES: Record<ToastTone, { border: string; text: string; bar: string }> = {
  success: { border: "border-accent", text: "text-accent", bar: "bg-accent" },
  error: { border: "border-danger", text: "text-danger", bar: "bg-danger" },
  info: { border: "border-accent-amber", text: "text-accent-amber", bar: "bg-accent-amber" },
};

interface ToastItemProps {
  toast: ToastData;
  labels: ToastLabels;
  onDismiss: (id: string) => void;
}

export function ToastItem({ toast, labels, onDismiss }: ToastItemProps) {
  const tone = TONE_STYLES[toast.tone];

  useEffect(() => {
    if (toast.duration <= 0 || toast.leaving) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, toast.leaving, onDismiss]);

  return (
    <div
      className={`pointer-events-auto relative w-full max-w-sm overflow-hidden border bg-surface px-4 py-3 shadow-lg ${tone.border} ${
        toast.leaving ? "toast-out" : "toast-in"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className={`text-[10px] uppercase tracking-widest ${tone.text}`}>
            {toast.title ?? labels.tone[toast.tone]}
          </span>
          <span className="text-xs leading-relaxed text-foreground">{toast.message}</span>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label={labels.close}
          className="text-muted transition-colors hover:text-foreground"
        >
          ×
        </button>
      </div>
      {toast.duration > 0 && !toast.leaving && (
        <div
          className={`toast-progress absolute inset-x-0 bottom-0 h-0.5 origin-left ${tone.bar}`}
          style={{ animationDuration: `${toast.duration}ms` }}
        />
      )}
    </div>
  );
}
