import type { HTMLAttributes, ReactNode } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  tag?: string;
  children: ReactNode;
}

export function Panel({ title, tag, children, className = "", ...props }: PanelProps) {
  return (
    <div
      className={`relative border border-border bg-surface px-6 py-6 ${className}`}
      {...props}
    >
      {title && (
        <div className="absolute -top-3 left-4 bg-background px-2 text-xs uppercase tracking-widest text-muted">
          {title}
        </div>
      )}
      {tag && (
        <div className="absolute -top-3 right-4 bg-background px-2 text-xs uppercase tracking-widest text-accent">
          {tag}
        </div>
      )}
      {children}
    </div>
  );
}
