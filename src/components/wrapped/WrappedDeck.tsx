"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";

/** Spostamento orizzontale oltre il quale il gesto è uno swipe e non l'inizio di uno scroll verticale. */
const DRAG_LOCK = 8;
/** Quanto va trascinata la scheda perché voli via invece di tornare al suo posto. */
const SWIPE_OUT = 90;
/** Durata del volo via, allineata alla transizione di .wrapped-deck-card. */
const EXIT_MS = 220;
/** Quante schede si intravedono sotto quella in cima. */
const VISIBLE_BEHIND = 2;

type Direction = 1 | -1;

interface WrappedDeckProps {
  /** Una scheda per elemento, nell'ordine del mazzo. */
  children: ReactNode[];
  dict: Dictionary["wrapped"]["deck"];
}

/** Fuori dallo schermo, ruotata: è la posa sia di chi sta volando via sia di chi è già passata. */
function flownAway(direction: Direction): CSSProperties {
  return { transform: `translate3d(${direction * 130}%, 0, 0) rotate(${direction * 12}deg)`, opacity: 0 };
}

export function WrappedDeck({ children, dict }: WrappedDeckProps) {
  const total = children.length;
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exit, setExit] = useState<Direction | null>(null);
  const gesture = useRef<{ pointerId: number; x: number; y: number; locked: boolean } | null>(null);

  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isLast = index === total - 1;

  // Il volo via è solo l'animazione: la scheda successiva sale quando è finita.
  useEffect(() => {
    if (exit === null) return;
    const timer = setTimeout(
      () => {
        setIndex((current) => Math.min(current + 1, total - 1));
        setOffset(0);
        setExit(null);
      },
      reducedMotion ? 0 : EXIT_MS,
    );
    return () => clearTimeout(timer);
  }, [exit, total, reducedMotion]);

  const advance = useCallback(
    (direction: Direction) => {
      if (exit !== null || isLast) return;
      setExit(direction);
    },
    [exit, isLast],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (exit !== null) return;
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, locked: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;

    if (!current.locked) {
      // Finché il gesto è più verticale che orizzontale resta della pagina: è uno scroll.
      if (Math.abs(dx) < DRAG_LOCK || Math.abs(dx) <= Math.abs(dy)) return;
      current.locked = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }

    setOffset(dx);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    gesture.current = null;
    if (!current || current.pointerId !== event.pointerId || !current.locked) return;

    setDragging(false);
    // Destra o sinistra è lo stesso gesto: cambia solo da che parte esce la scheda.
    if (Math.abs(offset) >= SWIPE_OUT && !isLast) setExit(offset > 0 ? 1 : -1);
    else setOffset(0);
  };

  function styleFor(position: number): CSSProperties {
    if (position < index) return { ...flownAway(-1), zIndex: 0 };

    const depth = position - index;
    const zIndex = total - depth;

    if (depth === 0) {
      if (exit !== null) return { ...flownAway(exit), zIndex };
      return {
        transform: `translate3d(${offset}px, 0, 0) rotate(${offset * 0.04}deg)`,
        zIndex,
        touchAction: "pan-y",
      };
    }

    const shown = Math.min(depth, VISIBLE_BEHIND);
    return {
      // L'origine in basso fa sbucare le schede dietro dal bordo inferiore invece di nasconderle.
      transformOrigin: "bottom center",
      transform: `translate3d(0, ${shown * 10}px, 0) scale(${1 - shown * 0.04})`,
      opacity: depth > VISIBLE_BEHIND ? 0 : 1 - shown * 0.3,
      zIndex,
    };
  }

  return (
    <div>
      {/* Il margine sta fuori dalla griglia: le schede dietro sono posizionate sul suo riquadro,
          e con il padding dentro risulterebbero più alte di quella in cima, mostrandone il testo. */}
      <div className="pt-4 pb-8">
        <div className="relative grid overflow-x-clip">
          {children.map((child, position) => {
            const isCurrent = position === index;
            return (
              <div
                key={position}
                // Tutte nella stessa cella della griglia, così si sovrappongono; solo quella in cima
                // resta nel flusso, e il mazzo prende l'altezza della scheda che stai leggendo
                // invece di quella della più alta di tutte.
                className={`wrapped-deck-card [grid-area:1/1] ${isCurrent ? "relative" : "absolute inset-0"}`}
                data-dragging={isCurrent && dragging ? "true" : undefined}
                style={styleFor(position)}
                inert={!isCurrent}
                onPointerDown={isCurrent ? onPointerDown : undefined}
                onPointerMove={isCurrent ? onPointerMove : undefined}
                onPointerUp={isCurrent ? onPointerEnd : undefined}
                onPointerCancel={isCurrent ? onPointerEnd : undefined}
              >
                {child}
              </div>
            );
          })}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {formatMessage(dict.position, { index: index + 1, total })}
      </p>

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0 || exit !== null}
          className="border border-border-strong px-4 py-1.5 text-xs uppercase tracking-widest text-muted transition-colors hover:text-foreground disabled:opacity-30"
        >
          {dict.previous}
        </button>

        <div className="flex gap-1.5" aria-hidden="true">
          {children.map((_, position) => (
            <span
              key={position}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                position === index ? "bg-accent" : "bg-border-strong"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => (isLast ? setIndex(0) : advance(1))}
          disabled={exit !== null}
          className="border border-accent px-4 py-1.5 text-xs uppercase tracking-widest text-accent transition-colors hover:text-accent-strong disabled:opacity-30"
        >
          {isLast ? dict.restart : dict.next}
        </button>
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">{dict.hint}</p>
    </div>
  );
}
