"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locales } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import { Mascot } from "@/components/ui/Mascot";

function withLocale(pathname: string, lang: string) {
  const segments = pathname.split("/");
  segments[1] = lang;
  return segments.join("/") || `/${lang}`;
}

export function NavBar({ lang, dict }: { lang: string; dict: Dictionary["nav"] }) {
  const pathname = usePathname();
  const links = [
    { href: `/${lang}`, label: dict.home },
    { href: `/${lang}/upload`, label: dict.upload },
    { href: `/${lang}/dashboard`, label: dict.dashboard },
    { href: `/${lang}/wrapped`, label: dict.wrapped },
  ];

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-5">
        <Link
          href={`/${lang}`}
          className="flex items-center gap-2 text-sm uppercase tracking-widest text-foreground"
        >
          <Mascot size={22} />
          <span>
            <span className="text-accent">{"//"}</span>tastr
            <span className="cursor-blink text-accent">_</span>
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs uppercase tracking-widest text-muted">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-accent">
              {link.label}
            </Link>
          ))}
          <span className="flex items-center gap-2 border-l border-border pl-5">
            {locales.map((locale) => (
              <Link
                key={locale}
                href={withLocale(pathname, locale)}
                className={locale === lang ? "text-accent" : "transition-colors hover:text-accent"}
              >
                {locale}
              </Link>
            ))}
          </span>
        </nav>
      </div>
    </header>
  );
}
