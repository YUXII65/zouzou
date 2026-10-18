import { Loader2, Sparkles } from "lucide-react";
import { QuickCapture } from "@/components/quick-capture";
import { InboxClarification } from "@/components/inbox-clarification";
import type { InboxClarification as InboxClarificationType } from "@/lib/ai";

function parseClarification(item: {
  aiSuggestionJson: string | null;
}): InboxClarificationType | null {
  if (!item.aiSuggestionJson) return null;

  try {
    const raw = JSON.parse(item.aiSuggestionJson) as Record<string, unknown>;
    if (Array.isArray(raw.dimensions)) {
      return raw as InboxClarificationType;
    }
    if (typeof raw.question === "string" && Array.isArray(raw.options)) {
      return {
        dimensions: [
          {
            key: "direction",
            question: raw.question,
            options: raw.options.filter(
              (option): option is string =>
                typeof option === "string" && option.trim().length > 0,
            ),
          },
        ],
        supplementPlaceholder:
          typeof raw.supplementPlaceholder === "string"
            ? raw.supplementPlaceholder
            : "如果这些选项都不准确，可以补充两句。",
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function AiTaskPlanner({
  pending,
}: {
  pending: Array<{
    id: string;
    content: string;
    aiPlanJson: string | null;
    aiSuggestionJson: string | null;
  }>;
}) {
  const hasActiveConversation = pending.length > 0;

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-accent/15 bg-gradient-to-br from-accent-soft/55 via-surface to-ai-soft/45 p-4 shadow-sm sm:p-5">
      <QuickCapture
        pendingIds={pending.map((item) => item.id)}
        embedded
        suppressInput={hasActiveConversation}
      />

      {pending.length ? (
        <div className="mt-5 space-y-5">
          {pending.map((item, index) => {
            const clarification = parseClarification(item);

            return (
              <div
                key={item.id}
                className={
                  index > 0
                    ? "border-t border-border/60 pt-5"
                    : ""
                }
              >
                {clarification ? (
                  <InboxClarification
                    itemId={item.id}
                    content={item.content}
                    dimensions={clarification.dimensions}
                    supplementPlaceholder={
                      clarification.supplementPlaceholder
                    }
                    mode={clarification.mode}
                    status={clarification.status}
                    history={clarification.history}

                    frame={clarification.frame}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="ml-auto max-w-[82%] rounded-xl rounded-tr-sm border border-border bg-surface-muted px-3 py-2 text-sm font-medium leading-6 text-ink">
                      {item.content}
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-strong">
                        <Sparkles className="size-3.5" />
                      </span>
                      <div className="rounded-xl rounded-tl-sm border border-border/70 bg-surface px-3 py-2.5 text-sm leading-6 text-ink">
                        <span className="flex items-center gap-2 text-ink-muted">
                          <Loader2 className="size-3.5 shrink-0 animate-spin text-accent/70" />
                          <span>正在读你的话</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
