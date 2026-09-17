"use client";

import { useActionState, useState } from "react";
import { Focus, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { generateTodaySuggestion, recordSuggestionFeedback } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { TypewriterText } from "@/components/typewriter-text";
import type { TodaySuggestion } from "@/lib/ai";
import { trackEvent } from "@/lib/track";

const BRIEF_WAITING_LABELS = [
  "正在看今天的任务...",
  "正在判断先推进哪件...",
  "正在写推荐理由...",
  "快整理好了...",
];

export function TodayBrief({
  initialSuggestions,
}: {
  initialSuggestions: TodaySuggestion[];
}) {
  const [suggestions, formAction, pending] = useActionState(
    generateTodaySuggestion,
    initialSuggestions,
  );
  const [feedback, setFeedback] = useState<
    Record<string, "useful" | "useless">
  >({});

  async function sendFeedback(
    suggestion: TodaySuggestion,
    action: "useful" | "useless",
  ) {
    if (feedback[suggestion.taskId]) return;
    await recordSuggestionFeedback({
      taskId: suggestion.taskId,
      action,
      detail: `${suggestion.title} / ${suggestion.reason}`,
    });
    setFeedback((current) => ({
      ...current,
      [suggestion.taskId]: action,
    }));
    trackEvent("home_brief_feedback", {
      taskId: suggestion.taskId,
      action,
    });
  }

  return (
    <div className="space-y-4 p-4 sm:p-5">
      {suggestions.length ? (
        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <div
              key={`${suggestion.taskId}-${suggestion.title}`}
              className="zouzou-row-hover flex items-start gap-3 rounded-lg bg-surface-muted p-3"
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-ai-soft text-ai">
                <Focus className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {suggestion.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-secondary">
                  <TypewriterText text={suggestion.reason} />
                </p>
                {suggestion.evidence.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {suggestion.evidence.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1 rounded-md bg-ai-soft px-2 py-1 text-[11px] font-medium leading-4 text-ai"
                      >
                        <Sparkles className="size-3" />
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
                {suggestion.projectName ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    {suggestion.projectName}
                  </p>
                ) : null}
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void sendFeedback(suggestion, "useful")}
                  aria-label="建议有用"
                  title="建议有用"
                  className={
                    feedback[suggestion.taskId] === "useful"
                      ? "flex size-7 items-center justify-center rounded-md bg-accent-soft text-accent-strong"
                      : "flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-accent"
                  }
                >
                  <ThumbsUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void sendFeedback(suggestion, "useless")}
                  aria-label="建议没用"
                  title="建议没用"
                  className={
                    feedback[suggestion.taskId] === "useless"
                      ? "flex size-7 items-center justify-center rounded-md bg-danger/10 text-danger"
                      : "flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-danger"
                  }
                >
                  <ThumbsDown className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-ink-muted">
          还没有可推荐的今日任务，先记录一个想法。
        </p>
      )}

      <form
        action={formAction}
        onSubmit={() => trackEvent("home_brief_regenerate")}
      >
        <SubmitButton
          pendingText="正在理解今天..."
          rotatingText={BRIEF_WAITING_LABELS}
          className="zouzou-secondary-button inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
        >
          <Sparkles className="size-4" />
          重新生成
        </SubmitButton>
      </form>
    </div>
  );
}
