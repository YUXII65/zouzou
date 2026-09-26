import { History, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildDecisionHistory,
  inferredPreferenceSummary,
} from "@/lib/decision-history";

const toneClasses = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  accent: "bg-accent-soft text-accent-strong",
  muted: "bg-surface-muted text-ink-secondary",
} as const;

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export async function DecisionHistoryPanel() {
  const user = await requireUser();
  const [events, preferences] = await Promise.all([
    prisma.aiFeedbackEvent.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 12,
      include: {
        task: { select: { title: true } },
        inboxItem: { select: { content: true } },
      },
    }),
    prisma.userPreference.findMany({
      where: { userId: user.id, source: "inferred" },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 8,
    }),
  ]);

  const history = buildDecisionHistory(events);
  const preferenceChange = inferredPreferenceSummary(preferences);
  if (!history.length && !preferenceChange) return null;

  return (
    <details className="zouzou-panel rounded-xl bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink-secondary transition-colors hover:text-accent">
        <History className="size-4 text-accent" />
        最近为什么调整
        {history.length ? (
          <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-ink-muted">
            {history.length}
          </span>
        ) : null}
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3">
        {preferenceChange ? (
          <div className="flex items-start gap-2 rounded-lg bg-accent-soft/60 p-3 text-xs leading-5 text-accent-strong">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" />
            <span>{preferenceChange}</span>
          </div>
        ) : null}
        {history.length ? (
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2.5"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${toneClasses[item.tone]}`}
                >
                  {item.actionLabel}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">
                    {item.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-ink-secondary">
                    {item.explanation}
                  </p>
                </div>
                <span className="ml-auto shrink-0 text-[11px] text-ink-muted">
                  {formatTime(item.createdAt)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}
