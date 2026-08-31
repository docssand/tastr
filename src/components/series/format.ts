import { formatMessage } from "@/lib/i18n";
import type { Dictionary } from "@/i18n/types";

type SummaryDict = Dictionary["series"]["summary"];

/**
 * Minuti in una durata leggibile. Sotto l'ora restano minuti, sotto i due giorni ore,
 * oltre diventano giorni: su una libreria di serie il totale in ore perde presto senso.
 */
export function formatDuration(minutes: number, dict: SummaryDict, nf: Intl.NumberFormat): string {
  const total = Math.round(minutes);
  if (total < 60) return formatMessage(dict.timeMinutes, { minutes: nf.format(total) });

  const hours = Math.floor(total / 60);
  if (hours < 48) return formatMessage(dict.timeHours, { hours: nf.format(hours) });

  return formatMessage(dict.timeDays, {
    days: nf.format(Math.floor(hours / 24)),
    hours: nf.format(hours % 24),
  });
}
