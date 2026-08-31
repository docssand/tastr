import { Mascot } from "@/components/ui/Mascot";

export function Footer({ text }: { text: string }) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-5 text-xs uppercase tracking-widest text-muted">
        <Mascot size={16} />
        {text}
      </div>
    </footer>
  );
}
