"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, StickyNote } from "lucide-react";
import { createTaskStickyNote } from "@/app/actions";
import { useRotatingText } from "@/components/rotating-text";
import { trackEvent } from "@/lib/track";
import type { TaskStickyNoteData } from "@/lib/task-sticky";

const DEFAULT_MESSAGE =
  "这个任务我还没有头绪，请给我一个能直接开始的行动方案";
const WAITING_LABELS = [
  "正在看这项任务...",
  "正在找能立刻开始的动作...",
  "正在写具体步骤...",
  "快写好了...",
];

/**
 * 任务展开后直接显示的执行卡片。
 * 行动块可以带序号，但每块是一段完整行动；标题、解释、"现在可以做"、删除按钮都不显示。
 */
function stickySteps(note: TaskStickyNoteData) {
  return (note.steps.length ? note.steps : [note.nextStep]).filter(Boolean);
}

export function TaskStickyInline({
  taskId,
  title,
  notes,
  projectName,
  status,
  initialNotes = [],
}: {
  taskId: string;
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  initialNotes?: TaskStickyNoteData[];
}) {
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const waitingLabel = useRotatingText(loading, WAITING_LABELS);

  useEffect(() => {
    setSavedNotes(initialNotes);
  }, [initialNotes]);

  async function generate(customMessage = DEFAULT_MESSAGE) {
    const nextMessage = customMessage.trim() || DEFAULT_MESSAGE;
    setLoading(true);
    try {
      const next = await createTaskStickyNote({
        taskId,
        title,
        notes,
        projectName,
        status,
        message: nextMessage,
      });
      setSavedNotes((current) =>
        [next, ...current.filter((note) => note.id !== next.id)].slice(0, 10),
      );
      setMessage("");
      trackEvent(
        nextMessage === DEFAULT_MESSAGE ? "task_sticky_generate" : "task_coach_ask",
        { taskId },
      );
    } finally {
      setLoading(false);
    }
  }

  function submitSupplement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage || loading) return;
    void generate(nextMessage);
  }

  return (
    <div className="mt-2 rounded-xl border border-warning/25 bg-warning/5 p-3">
      {loading ? (
        <p className="flex items-center gap-2 text-sm leading-6 text-ink-secondary">
          <Loader2 className="size-3.5 animate-spin text-ai" />
          {waitingLabel}
        </p>
      ) : savedNotes.length ? (
        <div className="space-y-3">
          {savedNotes[0].encouragement ? (
            <details
              open
              className="mb-2 rounded-lg border border-warning/15 bg-surface/65 px-2.5 py-2"
            >
              <summary className="cursor-pointer list-none text-xs font-medium text-ink-secondary">
                补充信息
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-ink-secondary">
                {savedNotes[0].encouragement}
              </p>
            </details>
          ) : null}

          <ol className="space-y-2">
            {stickySteps(savedNotes[0]).map((step, stepIndex) => (
              <li
                key={`${savedNotes[0].id}-${stepIndex}`}
                className="flex items-start gap-2.5 rounded-lg border border-warning/15 bg-surface/65 px-2.5 py-2 text-sm leading-6 text-ink"
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface/80 text-xs font-medium text-ink-secondary">
                  {stepIndex + 1}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap">{step}</span>
              </li>
            ))}
          </ol>

          {savedNotes.length > 1 ? (
            <details className="rounded-lg border border-warning/15 bg-surface/45 px-2.5 py-2">
              <summary className="cursor-pointer list-none text-xs font-medium text-ink-muted">
                查看之前的便利贴（{savedNotes.length - 1}）
              </summary>
              <div className="mt-2 space-y-3">
                {savedNotes.slice(1).map((note) => (
                  <ol key={note.id} className="space-y-1.5 opacity-80">
                    {stickySteps(note).map((step, stepIndex) => (
                      <li
                        key={`${note.id}-${stepIndex}`}
                        className="flex items-start gap-2 rounded-lg border border-warning/10 bg-surface/50 px-2 py-1.5 text-sm leading-6 text-ink-secondary"
                      >
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-surface/80 text-[10px] font-medium text-ink-muted">
                          {stepIndex + 1}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap">{step}</span>
                      </li>
                    ))}
                  </ol>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="text-xs leading-5 text-ink-secondary">
          还没有便利贴。写一句你的想法，它会给出能直接开始的做法。
        </p>
      )}

      <div className="mt-3 border-t border-warning/20 pt-3">
        {savedNotes.length ? (
          <form onSubmit={submitSupplement}>
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="有卡顿？说说想法"
              aria-label="有卡顿？说说想法"
              className="zouzou-input w-full rounded-lg px-3 py-2 text-sm text-ink"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            className="zouzou-secondary-button inline-flex h-8 items-center gap-1.5 rounded-md border border-ai/30 bg-ai-soft px-3 text-xs font-medium text-ai transition-colors hover:bg-ai/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <StickyNote className="size-3.5" />
            生成便利贴
          </button>
        )}
      </div>
    </div>
  );
}
