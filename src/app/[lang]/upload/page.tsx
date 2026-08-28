import type { Metadata } from "next";
import { UploadFlow } from "@/components/upload/UploadFlow";
import { getDictionary } from "@/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/upload">): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  return { title: dict.meta.uploadTitle };
}

export default async function UploadPage({ params }: PageProps<"/[lang]/upload">) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="text-xs uppercase tracking-widest text-accent">{dict.upload.eyebrow}</div>
      <h1 className="mt-4 text-3xl text-foreground">{dict.upload.title}</h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">{dict.upload.lead}</p>

      <div className="mt-10">
        <UploadFlow lang={lang} dict={dict.upload} warningMessages={dict.warnings} />
      </div>
    </div>
  );
}
