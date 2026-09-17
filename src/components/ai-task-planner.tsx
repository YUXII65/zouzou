import { EyeOff, Sparkles } from "lucide-react";
import { ignoreInboxItem } from "@/app/actions";
import { QuickCapture } from "@/components/quick-capture";
import { AiSettings } from "@/components/ai-settings";
import { AiPreferences } from "@/components/ai-preferences";
import { InboxClarification } from "@/components/inbox-clarification";
import { InboxPlanEditor } from "@/components/inbox-plan-editor";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import type { InboxClarification as InboxClarificationType } from "@/lib/ai";
import type { InboxPlan } from "@/lib/ai";

const actionLabels = {
  create_project: "新建项目",
  existing_project: "归入项目",
  single_task: "创建任务",
  ignore: "建议忽略",
};

function parsePlan(item: { aiPlanJson: string | null }): InboxPlan | null {
  if (!item.aiPlanJson) return null;

  try {
    return JSON.parse(item.aiPlanJson) as InboxPlan;
  } catch {
    return null;
  }
}

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
  quotaManaged = false,
  serverAiConfigured = false,
}: {
  pending: Array<{
    id: string;
    content: string;
    aiPlanJson: string | null;
    aiSuggestionJson: string | null;
  }>;
  quotaManaged?: boolean;
  serverAiConfigured?: boolean;
}) {
  return (
    <div className="space-y-4">
      <QuickCapture pendingIds={pending.map((item) => item.id)} />

      {pending.length ? (
        <div className="space-y-3">
          {pending.map((item) => {
            const clarification = parseClarification(item);
            const plan = parsePlan(item);

            return (
              <div
                key={item.id}
                className="zouzou-ai-card p-4"
              >
                {plan ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-6 text-ink">
                        {item.content}
                      </p>
                      <StatusBadge status={actionLabels[plan.action]} />
                    </div>
                    <InboxPlanEditor itemId={item.id} plan={plan} />
                  </>
                ) : clarification ? (
                  <>
                    <InboxClarification
                      itemId={item.id}
                      content={item.content}
                      dimensions={clarification.dimensions}
                      supplementPlaceholder={
                        clarification.supplementPlaceholder
                      }
                    />
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm leading-6 text-ink">
                      {item.content}
                    </p>
                    <span className="inline-flex animate-[zouzou-soft-pulse_1.6s_ease-in-out_infinite] items-center gap-1.5 text-xs font-medium text-ink-secondary">
                      <Sparkles className="size-3.5" />
                      正在梳理...
                    </span>
                  </div>
                )}

                <div className="mt-3 flex justify-end border-t border-border/70 pt-3">
                  <form action={ignoreInboxItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <SubmitButton
                      pendingText="..."
                      className="zouzou-secondary-button inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-warning hover:text-warning"
                    >
                      <EyeOff className="size-3.5" />
                      忽略
                    </SubmitButton>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <details id="ai-settings" className="zouzou-panel rounded-xl bg-surface">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:text-accent">
          <Sparkles className="size-3.5" />
          偏好设置
        </summary>
        <div className="space-y-3 border-t border-border p-3">
          {quotaManaged ? null : (
            <AiSettings serverConnected={serverAiConfigured} />
          )}
          <AiPreferences />
        </div>
      </details>
    </div>
  );
}
