"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locales } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";

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
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href={`/${lang}`} className="text-sm uppercase tracking-widest text-foreground">
          <span className="text-accent">{"//"}</span>tastr
          <span className="cursor-blink text-accent">_</span>
        </Link>
        <nav className="flex items-center gap-6 text-xs uppercase tracking-widest text-muted">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-accent">
              {link.label}
            </Link>
          ))}
          <span className="flex items-center gap-2 border-l border-border pl-6">
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
