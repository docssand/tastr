import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { ToastProvider } from "@/components/ui/toast/ToastProvider";
import { getDictionary } from "@/i18n/dictionaries";
import { locales } from "@/i18n/config";
import "../globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  return { title: dict.meta.title, description: dict.meta.description };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <html lang={lang} className={`${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <div className="crt-overlay" aria-hidden="true" />
        <ToastProvider labels={dict.toast}>
          <NavBar lang={lang} dict={dict.nav} />
          <main className="flex-1">{children}</main>
          <Footer text={dict.footer} />
        </ToastProvider>
      </body>
    </html>
  );
}
