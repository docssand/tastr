import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

interface BaseProps {
  variant?: "primary" | "ghost";
  children: ReactNode;
  className?: string;
}

const base =
  "inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const variants = {
  primary: "bg-accent text-background hover:bg-accent-strong",
  ghost: "border border-border-strong text-foreground hover:border-accent hover:text-accent",
};

export function Button({
  variant = "primary",
  children,
  className = "",
  ...props
}: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  children,
  className = "",
  href,
}: BaseProps & { href: string }) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
