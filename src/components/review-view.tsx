export function ReviewView({ summary }: { summary: string }) {
  return (
    <div className="p-5">
      <div className="whitespace-pre-wrap rounded-xl border border-border/70 bg-surface-muted/55 px-5 py-4 text-[15px] leading-7 tracking-[0.01em] text-ink-secondary">
        {summary}
      </div>
    </div>
  );
}