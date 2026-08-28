import "server-only";
import { notFound } from "next/navigation";
import { locales, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import en from "@/dictionaries/en.json";
import it from "@/dictionaries/it.json";

const dictionaries: Record<Locale, Dictionary> = { en, it };

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export async function getDictionary(lang: string): Promise<Dictionary> {
  if (!isLocale(lang)) notFound();
  return dictionaries[lang];
}
