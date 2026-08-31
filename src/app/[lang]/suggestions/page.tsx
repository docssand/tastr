import type { Metadata } from "next";
import { SuggestionsView } from "@/components/suggestions/SuggestionsView";
import { getDictionary } from "@/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/suggestions">): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  return { title: dict.meta.suggestionsTitle };
}

export default async function SuggestionsPage({ params }: PageProps<"/[lang]/suggestions">) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-xs uppercase tracking-widest text-accent">{dict.suggestions.eyebrow}</div>
      <h1 className="mt-4 text-3xl text-foreground">{dict.suggestions.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">{dict.suggestions.lead}</p>

      <div className="mt-10">
        <SuggestionsView lang={lang} dict={dict.suggestions} />
      </div>
    </div>
  );
}
