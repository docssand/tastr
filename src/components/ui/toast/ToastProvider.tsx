"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToastItem } from "@/components/ui/toast/ToastItem";

export type ToastTone = "success" | "error" | "info";

export interface ToastLabels {
  regionLabel: string;
  close: string;
  tone: Record<ToastTone, string>;
}

export interface ToastData {
  id: string;
  tone: ToastTone;
  message: string;
  title?: string;
  /** Millisecondi prima della chiusura automatica; 0 = resta finché non viene chiuso a mano. */
  duration: number;
  leaving?: boolean;
}

interface ToastOptions {
  title?: string;
  duration?: number;
}

interface ToastApi {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4500,
  error: 7000,
  info: 5500,
};

const MAX_VISIBLE = 4;
const EXIT_MS = 180;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast deve essere usato all'interno di <ToastProvider>.");
  return api;
}

export function ToastProvider({ children, labels }: { children: ReactNode; labels: ToastLabels }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idRef = useRef(0);
  const exitTimers = useRef(new Map<string, number>());

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    exitTimers.current.delete(id);
  }, []);

  // Segna il toast come "in uscita" e lo rimuove solo a fine animazione.
  const dismiss = useCallback(
    (id: string) => {
      setToasts((prev) =>
        prev.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
      );
      if (exitTimers.current.has(id)) return;
      exitTimers.current.set(id, window.setTimeout(() => remove(id), EXIT_MS));
    },
    [remove],
  );

  const push = useCallback((tone: ToastTone, message: string, options?: ToastOptions) => {
    idRef.current += 1;
    const toast: ToastData = {
      id: `toast-${idRef.current}`,
      tone,
      message,
      title: options?.title,
      duration: options?.duration ?? DEFAULT_DURATION[tone],
    };
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), toast]);
  }, []);

  useEffect(() => {
    const timers = exitTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, options) => push("success", message, options),
      error: (message, options) => push("error", message, options),
      info: (message, options) => push("info", message, options),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label={labels.regionLabel}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-3 px-4 py-6 sm:items-end sm:px-6"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} labels={labels} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
