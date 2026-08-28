import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getDictionary } from "@/i18n/dictionaries";

export async function generateMetadata({ params }: PageProps<"/[lang]/dashboard">): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  return { title: dict.meta.dashboardTitle };
}

export default async function DashboardPage({ params }: PageProps<"/[lang]/dashboard">) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-xs uppercase tracking-widest text-accent">{dict.dashboard.eyebrow}</div>
      <h1 className="mt-4 text-3xl text-foreground">{dict.dashboard.title}</h1>

      <div className="mt-10">
        <DashboardView lang={lang} dict={dict.dashboard} />
      </div>
    </div>
  );
}
