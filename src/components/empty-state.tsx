import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl border border-border/70 bg-surface-muted text-ink-muted">
        <Icon className="size-5" />
      </span>
      <div className="mt-4 h-px w-8 bg-border" />
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      {hint ? (
        <p className="mt-1 max-w-sm text-xs leading-5 text-ink-secondary">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
