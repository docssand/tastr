import type { Metadata } from "next";
import { SeriesView } from "@/components/series/SeriesView";
import { getDictionary } from "@/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/series">): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  return { title: dict.meta.seriesTitle };
}

export default async function SeriesPage({ params }: PageProps<"/[lang]/series">) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-xs uppercase tracking-widest text-accent">{dict.series.eyebrow}</div>
      <h1 className="mt-4 text-3xl text-foreground">{dict.series.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">{dict.series.lead}</p>

      <div className="mt-10">
        <SeriesView lang={lang} dict={dict.series} />
      </div>
    </div>
  );
}
