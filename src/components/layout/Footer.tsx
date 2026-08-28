export function Footer({ text }: { text: string }) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-5xl px-6 py-5 text-xs uppercase tracking-widest text-muted">{text}</div>
    </footer>
  );
}
