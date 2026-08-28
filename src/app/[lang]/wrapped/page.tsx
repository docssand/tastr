import type { Metadata } from "next";
import { WrappedView } from "@/components/wrapped/WrappedView";
import { getDictionary } from "@/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/wrapped">): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  return { title: dict.meta.wrappedTitle };
}

export default async function WrappedPage({ params }: PageProps<"/[lang]/wrapped">) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-xs uppercase tracking-widest text-accent">{dict.wrapped.eyebrow}</div>
      <h1 className="mt-4 text-3xl text-foreground">{dict.wrapped.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">{dict.wrapped.lead}</p>

      <div className="mt-10">
        <WrappedView lang={lang} dict={dict.wrapped} />
      </div>
    </div>
  );
}
