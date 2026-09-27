"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, StickyNote, Trash2 } from "lucide-react";
import { createTaskStickyNote, deleteTaskStickyNote } from "@/app/actions";
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
 * 任务展开后直接显示的便利贴内容。
 * 不再是弹层、也不再有"便利贴按钮"：点开任务就能看到做法、步骤和下一步。
 */
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

  async function removeNote(noteId: string) {
    setSavedNotes((current) => current.filter((note) => note.id !== noteId));
    await deleteTaskStickyNote(noteId).catch(() => {});
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
        <div className="space-y-2">
          {savedNotes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border border-warning/25 bg-warning/10 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{note.title}</p>
                <button
                  type="button"
                  onClick={() => void removeNote(note.id)}
                  aria-label="删除这张便利贴"
                  title="删除这张便利贴"
                  className="flex size-6 shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {note.encouragement ? (
                <p className="mt-1.5 whitespace-pre-line text-xs leading-5 text-ink-secondary">
                  {note.encouragement}
                </p>
              ) : null}

              {note.steps.length ? (
                <ol className="mt-2 space-y-1.5">
                  {note.steps.map((step, stepIndex) => (
                    <li
                      key={`${step}-${stepIndex}`}
                      className="flex items-start gap-2 text-sm leading-6 text-ink"
                    >
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface/80 text-xs font-medium text-ink-secondary">
                        {stepIndex + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              ) : null}

              {note.nextStep ? (
                <p className="mt-2 rounded-md bg-surface/75 px-3 py-2 text-sm leading-6 text-ink">
                  现在可以做：{note.nextStep}
                </p>
              ) : null}
            </div>
          ))}
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
              placeholder="你有什么想法补充"
              aria-label="你有什么想法补充"
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
