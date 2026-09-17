"use client";

import { useState } from "react";
import { MessageCircle, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { getTaskCoachAdvice, recordSuggestionFeedback } from "@/app/actions";
import { useRotatingText } from "@/components/rotating-text";
import { TypewriterText } from "@/components/typewriter-text";
import { trackEvent } from "@/lib/track";
import { useClickOutside } from "@/lib/use-click-outside";
import type { TaskCoachAdvice } from "@/lib/ai";

const inputClass =
  "zouzou-input w-full rounded-lg px-3 py-2 text-sm leading-6 text-ink";
const WAITING_LABELS = [
  "正在看你卡在哪里...",
  "正在找能直接开始的动作...",
  "正在写具体建议...",
];

export function AiTaskCoach({
  taskId,
  title,
  notes,
  projectName,
  status,
  showLabel = false,
}: {
  taskId: string;
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  /** 新手期把图标展开成"图标 + 文字" */
  showLabel?: boolean;
}) {
  const { ref, open, setOpen } = useClickOutside<HTMLDivElement>();
  const [message, setMessage] = useState("");
  const [advice, setAdvice] = useState<TaskCoachAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<"useful" | "useless" | null>(null);
  const waitingLabel = useRotatingText(loading, WAITING_LABELS);

  async function ask() {
    if (!message.trim()) return;
    setLoading(true);
    try {
      const next = await getTaskCoachAdvice({
        taskId,
        title,
        notes,
        projectName,
        status,
        message,
      });
      setAdvice(next);
      trackEvent("task_coach_ask", { taskId });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="和 AI 聊聊"
        title="和 AI 聊聊"
        className={
          showLabel
            ? "flex h-8 items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2.5 text-xs font-medium text-accent-strong transition-colors hover:bg-accent/20"
            : "flex size-8 items-center justify-center rounded-md border border-accent/30 bg-accent-soft text-accent-strong transition-colors hover:bg-accent/20"
        }
      >
        <MessageCircle className="size-3.5" />
        {showLabel ? <span>问 AI</span> : null}
      </button>

      {open ? (
        <div className="zouzou-panel absolute right-0 top-10 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-xl p-3 shadow-pop animate-[zouzou-fade-in_240ms_ease-out]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-secondary">和 AI 聊聊</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭讨论"
              title="关闭讨论"
              className="flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {advice ? (
            <div className="zouzou-ai-card mt-3 p-3">
              <p className="text-xs text-ink-muted">你说：“{message}”</p>
              <p className="mt-2 text-sm font-semibold text-ink">
                <TypewriterText text={advice.title} />
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">
                <TypewriterText text={advice.encouragement} />
              </p>
              <ol className="mt-3 space-y-2">
                {advice.steps.map((step, index) => (
                  <li
                    key={`${step}-${index}`}
                    className="flex items-start gap-2 text-sm leading-6 text-ink"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-medium text-ink-secondary">
                      {index + 1}
                    </span>
                    <TypewriterText text={step} />
                  </li>
                ))}
              </ol>
              <p className="mt-3 rounded-md bg-surface-muted/80 px-3 py-2 text-sm leading-6 text-ink">
                现在可以做：<TypewriterText text={advice.nextStep} />
              </p>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                不用想好怎么说。把卡住的感觉、没头绪的想法，或者下一步的疑问直接丢过来。
              </p>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                placeholder="直接说，不用组织语言"
                className={`${inputClass} mt-3`}
              />
              <button
                type="button"
                onClick={ask}
                disabled={!message.trim() || loading}
                className="zouzou-primary-button mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="size-3.5" />
                {loading ? waitingLabel : "帮我想想"}
              </button>
            </>
          )}

          {advice ? (
            <button
              type="button"
              onClick={() => {
                setAdvice(null);
                setMessage("");
              }}
              className="mt-2 text-xs font-medium text-ink-secondary transition-colors hover:text-accent"
            >
              再问一次
            </button>
          ) : null}

          {advice ? (
            <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
              <button
                type="button"
                onClick={() => {
                  if (feedback) return;
                  setFeedback("useful");
                  void recordSuggestionFeedback({
                    source: "task_coach",
                    taskId,
                    action: "useful",
                    detail: `${advice.title} / ${message}`,
                  });
                }}
                aria-label="建议有用"
                title="建议有用"
                className={
                  feedback === "useful"
                    ? "flex size-7 items-center justify-center rounded-md bg-accent-soft text-accent-strong"
                    : "flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-accent"
                }
              >
                <ThumbsUp className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (feedback) return;
                  setFeedback("useless");
                  void recordSuggestionFeedback({
                    source: "task_coach",
                    taskId,
                    action: "useless",
                    detail: `${advice.title} / ${message}`,
                  });
                }}
                aria-label="建议没用"
                title="建议没用"
                className={
                  feedback === "useless"
                    ? "flex size-7 items-center justify-center rounded-md bg-danger/10 text-danger"
                    : "flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-danger"
                }
              >
                <ThumbsDown className="size-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
