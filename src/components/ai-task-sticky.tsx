"use client";

import { useEffect, useState, type FormEvent } from "react";
import { StickyNote, Trash2, X } from "lucide-react";
import {
  createTaskStickyNote,
  deleteTaskStickyNote,
} from "@/app/actions";
import { useRotatingText } from "@/components/rotating-text";
import { TypewriterText } from "@/components/typewriter-text";
import { trackEvent } from "@/lib/track";
import { useClickOutside } from "@/lib/use-click-outside";
import type { TaskStickyNoteData } from "@/lib/task-sticky";

const DEFAULT_MESSAGE =
  "这个任务我还没有头绪，请给我一个能直接开始的行动方案";
const STICKY_WAITING_LABELS = [
  "正在看这项任务...",
  "正在找能立刻开始的动作...",
  "正在写具体步骤...",
  "快写好了...",
];

function formatNoteTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AiTaskSticky({
  taskId,
  title,
  notes,
  projectName,
  status,
  showLabel = false,
  initialNotes = [],
}: {
  taskId: string;
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  /** 新手期把图标展开成"图标 + 文字"，第二次访问自动收起 */
  showLabel?: boolean;
  initialNotes?: TaskStickyNoteData[];
}) {
  const { ref, open, setOpen } = useClickOutside<HTMLDivElement>();
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(
    initialNotes[0]?.id ?? null,
  );
  const [noteExpanded, setNoteExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [supplementOpen, setSupplementOpen] = useState(false);
  const waitingLabel = useRotatingText(loading, STICKY_WAITING_LABELS);

  useEffect(() => {
    setSavedNotes(initialNotes);
    setActiveNoteId((current) =>
      current && initialNotes.some((note) => note.id === current)
        ? current
        : initialNotes[0]?.id ?? null,
    );
  }, [initialNotes]);

  const latestNote = savedNotes[0] ?? null;
  const activeNote = noteExpanded
    ? savedNotes.find((note) => note.id === activeNoteId) ?? latestNote
    : null;

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
      setSavedNotes((current) => [
        next,
        ...current.filter((note) => note.id !== next.id),
      ]);
      setActiveNoteId(next.id);
      setNoteExpanded(true);
      setMessage("");
      setOpen(true);
      setSavedNotes((current) => current.slice(0, 10));
      trackEvent(
        nextMessage === DEFAULT_MESSAGE
          ? "task_sticky_generate"
          : "task_coach_ask",
        { taskId },
      );
    } finally {
      setLoading(false);
    }
  }

  async function removeNote(noteId: string) {
    const next = savedNotes.filter((note) => note.id !== noteId);
    setSavedNotes(next);
    if (activeNoteId === noteId) {
      setActiveNoteId(next[0]?.id ?? null);
      setNoteExpanded(true);
    }
    await deleteTaskStickyNote(noteId).catch(() => {});
  }

  function submitSupplement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage || loading) return;
    setOpen(true);
    void generate(nextMessage);
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setActiveNoteId((current) =>
      current && savedNotes.some((note) => note.id === current)
        ? current
        : savedNotes[0]?.id ?? null,
    );
    setNoteExpanded(true);
    if (!savedNotes.length && !loading) {
      void generate();
    }
  }

  return (
    <div
      className="group relative"
      ref={ref}
      onMouseEnter={() => setSupplementOpen(true)}
      onMouseLeave={() => setSupplementOpen(false)}
    >
      <div className="relative">
        {savedNotes.length > 2 ? (
          <span className="pointer-events-none absolute inset-0 rotate-6 rounded-md border border-ai/20 bg-ai-soft" />
        ) : null}
        {savedNotes.length > 1 ? (
          <span className="pointer-events-none absolute inset-0 -rotate-6 rounded-md border border-ai/25 bg-ai-soft" />
        ) : null}
        <button
          type="button"
          onClick={toggle}
          data-tour="task-sticky"
          aria-label={`便利贴${savedNotes.length ? `，${savedNotes.length} 张` : ""}`}
          title="便利贴"
          className={
            showLabel
              ? "relative z-10 flex h-8 items-center gap-1.5 rounded-md border border-ai/30 bg-ai-soft px-2.5 text-xs font-medium text-ai transition-transform hover:-translate-y-0.5"
              : "relative z-10 flex size-8 items-center justify-center rounded-md border border-ai/30 bg-ai-soft text-ai transition-transform hover:-translate-y-0.5"
          }
        >
          <StickyNote className="size-3.5 transition-transform duration-200 group-hover:-rotate-6" />
          {showLabel ? <span>便利贴</span> : null}
          {savedNotes.length ? (
            <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-ai text-[10px] font-semibold text-white">
              {savedNotes.length}
            </span>
          ) : null}
        </button>
      </div>

      {!open && supplementOpen && savedNotes.length ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (latestNote) {
              setActiveNoteId(latestNote.id);
              setNoteExpanded(true);
            }
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              if (latestNote) {
                setActiveNoteId(latestNote.id);
                setNoteExpanded(true);
              }
              setOpen(true);
            }
          }}
          className="absolute right-0 top-8 z-40 w-64 max-w-[calc(100vw-2rem)] cursor-pointer rounded-xl border border-warning/25 bg-warning/10 p-3 shadow-pop animate-[zouzou-fade-in_180ms_ease-out]"
        >
          <p className="text-xs font-semibold text-ink">{latestNote?.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-secondary">
            {latestNote?.encouragement}
          </p>
          <p className="mt-2 text-[11px] font-medium text-ai">
            共 {savedNotes.length} 张 · 点击查看
          </p>
        </div>
      ) : null}

      {!open && supplementOpen && !savedNotes.length ? (
        <div className="absolute right-0 top-8 z-40 w-72 max-w-[calc(100vw-2rem)] pt-2">
          <div className="rounded-xl border border-ai/25 bg-surface p-3 shadow-pop animate-[zouzou-fade-in_180ms_ease-out]">
            <form onSubmit={submitSupplement}>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="你有什么想法补充？"
                aria-label="你有什么想法补充？"
                className="zouzou-input w-full rounded-lg px-3 py-2 text-sm text-ink"
              />
            </form>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="zouzou-panel absolute right-0 top-10 z-30 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl p-3 shadow-pop animate-[zouzou-fade-in_240ms_ease-out]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-secondary">
              便利贴{savedNotes.length ? ` · ${savedNotes.length} 张` : ""}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭便利贴"
              title="关闭"
              className="flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {loading ? (
            <p className="mt-4 inline-flex items-center gap-2 text-sm leading-6 text-ink-secondary">
              <span className="flex gap-1">
                <span className="size-1.5 animate-[zouzou-soft-pulse_1s_ease-in-out_infinite] rounded-full bg-ai" />
                <span className="size-1.5 animate-[zouzou-soft-pulse_1s_ease-in-out_infinite] rounded-full bg-ai [animation-delay:150ms]" />
                <span className="size-1.5 animate-[zouzou-soft-pulse_1s_ease-in-out_infinite] rounded-full bg-ai [animation-delay:300ms]" />
              </span>
              {waitingLabel}
            </p>
          ) : savedNotes.length ? (
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {savedNotes.map((note, index) => {
                const active = note.id === activeNote?.id;
                const tilt =
                  index % 3 === 0
                    ? "-rotate-[0.5deg]"
                    : index % 3 === 1
                      ? "rotate-[0.5deg]"
                      : "";

                return (
                  <div
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (note.id === activeNoteId) {
                        setNoteExpanded((value) => !value);
                        return;
                      }
                      setActiveNoteId(note.id);
                      setNoteExpanded(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        if (note.id === activeNoteId) {
                          setNoteExpanded((value) => !value);
                        } else {
                          setActiveNoteId(note.id);
                          setNoteExpanded(true);
                        }
                      }
                    }}
                    className={`rounded-lg border border-warning/25 bg-warning/10 p-3 shadow-sm transition-all ${tilt} ${
                      active ? "ring-1 ring-warning/35" : "cursor-pointer hover:-translate-y-0.5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {note.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {formatNoteTime(note.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeNote(note.id);
                        }}
                        aria-label="删除这张便利贴"
                        title="删除这张便利贴"
                        className="flex size-6 shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    {active ? (
                      <div className="mt-2 border-t border-warning/20 pt-2">
                        <p className="text-xs leading-5 text-ink-secondary">
                          <TypewriterText text={note.encouragement} />
                        </p>
                        <ol className="mt-2 space-y-1.5">
                          {note.steps.map((step, stepIndex) => (
                            <li
                              key={`${step}-${stepIndex}`}
                              className="flex items-start gap-2 text-sm leading-6 text-ink"
                            >
                              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface/80 text-xs font-medium text-ink-secondary">
                                {stepIndex + 1}
                              </span>
                              <TypewriterText text={step} />
                            </li>
                          ))}
                        </ol>
                        <p className="mt-2 rounded-md bg-surface/75 px-3 py-2 text-sm leading-6 text-ink">
                          现在可以做：<TypewriterText text={note.nextStep} />
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-secondary">
                        点击展开具体内容
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-ink-secondary">
              写下想法后会自动保存成便利贴，可以继续添加多张。
            </p>
          )}

          <div className="mt-3 border-t border-border pt-3">
            <form onSubmit={submitSupplement}>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="你有什么想法补充"
                aria-label="你有什么想法补充"
                className="zouzou-input w-full rounded-lg px-3 py-2 text-sm text-ink"
              />
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
