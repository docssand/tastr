const skeletonWidths = ["w-4/5", "w-3/5", "w-2/5", "w-1/2"];

export function WidgetCard({ title, comingSoon }: { title: string; comingSoon: string }) {
  return (
    <div className="border border-border bg-surface px-5 py-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-foreground">{title}</h3>
        <span className="text-[10px] uppercase tracking-widest text-muted">{comingSoon}</span>
      </div>
      <div className="mt-5 flex flex-col gap-2.5">
        {skeletonWidths.map((w, i) => (
          <div key={i} className={`h-2 ${w} bg-border-strong/60`} />
        ))}
      </div>
    </div>
  );
}
