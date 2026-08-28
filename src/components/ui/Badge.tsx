import type { ReactNode } from "react";

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "danger" }) {
  const tones = {
    default: "border-border-strong text-muted",
    accent: "border-accent text-accent",
    danger: "border-danger text-danger",
  };
  return (
    <span
      className={`inline-flex items-center border px-2.5 py-1 text-xs uppercase tracking-widest ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
