export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-surface px-5 py-4">
      <div className="text-xs uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-2 text-2xl text-accent text-glow">{value}</div>
    </div>
  );
}
