import type { WrappedCard } from "@/lib/analysis/wrapped";
import type { Dictionary } from "@/i18n/types";

/** Gli aggettivi delle schede con un verdetto, nell'ordine in cui compaiono nel mazzo. */
export function traitNames(cards: WrappedCard[], dict: Dictionary["wrapped"]): string[] {
  return cards
    .map((card) =>
      card.verdict === null
        ? null
        : card.verdict.kind === "animal"
          ? dict.animals[card.verdict.key].name
          : dict.verdicts[card.verdict.key].name,
    )
    .filter((name): name is string => name !== null);
}
