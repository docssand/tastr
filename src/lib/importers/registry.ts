import type { ImportAdapter, ZipContents } from "@/lib/importers/types";
import { letterboxdAdapter } from "@/lib/importers/letterboxd";
import { traktAdapter } from "@/lib/importers/trakt";
import { bingersAdapter } from "@/lib/importers/bingers";

export const importAdapters: ImportAdapter[] = [letterboxdAdapter, traktAdapter, bingersAdapter];

export async function detectAdapter(zip: ZipContents): Promise<ImportAdapter | undefined> {
  for (const adapter of importAdapters) {
    if (await adapter.detect(zip)) return adapter;
  }
  return undefined;
}
