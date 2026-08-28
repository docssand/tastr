import { LinkButton } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { getDictionary } from "@/i18n/dictionaries";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  const { home } = dict;

  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <section className="max-w-2xl">
        <div className="text-xs uppercase tracking-widest text-accent">{home.eyebrow}</div>
        <h1 className="mt-4 text-4xl leading-tight text-foreground sm:text-5xl">
          {home.title[0]}
          <br />
          {home.title[1]}
        </h1>
        <p className="mt-6 text-sm leading-relaxed text-muted">{home.lead}</p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <LinkButton href={`/${lang}/upload`} variant="primary">
            <span className="bracket-label">{home.ctaPrimary}</span>
          </LinkButton>
          <LinkButton href={`/${lang}/dashboard`} variant="ghost">
            {home.ctaSecondary}
          </LinkButton>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Badge tone="accent">Trakt</Badge>
          <Badge tone="accent">Letterboxd</Badge>
          <Badge tone="accent">Bingers</Badge>
        </div>
      </section>

      <section className="mt-20 grid gap-6 sm:grid-cols-3">
        {home.steps.map((step) => (
          <Panel key={step.n} tag={step.n}>
            <h2 className="text-sm uppercase tracking-widest text-foreground">{step.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
          </Panel>
        ))}
      </section>

      <section className="mt-20">
        <Panel title={home.statusTitle}>
          <p className="text-sm leading-relaxed text-muted">
            {home.statusBodyPrefix} <span className="text-foreground">TMDB</span>
            {home.statusBodySuffix}
          </p>
        </Panel>
      </section>
    </div>
  );
}
