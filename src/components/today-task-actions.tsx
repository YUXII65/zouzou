"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarOff,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  PencilLine,
  Play,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  clearTodayFocus,
  deleteTask,
  markTodayFocus,
  setTaskStatus,
} from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { AiTaskSticky } from "@/components/ai-task-sticky";
import { markFirstTaskDone } from "@/lib/first-run-hints";
import type { TaskStickyNoteData } from "@/lib/task-sticky";
import { trackEvent } from "@/lib/track";
import { useClickOutside } from "@/lib/use-click-outside";

function nextStatus(status: string) {
  if (status === "in_progress") return "done";
  if (status === "done" || status === "cancelled") return "todo";
  return "in_progress";
}

function actionLabel(status: string) {
  if (status === "in_progress") return "下一步";
  if (status === "done") return "重新开始";
  if (status === "cancelled") return "重新开始";
  return "下一步";
}

function statusButtonClass(status: string) {
  if (status === "in_progress") {
    return "zouzou-primary-button inline-flex h-8 min-w-16 items-center justify-center gap-1.5 rounded-md border border-accent bg-accent-soft px-2.5 text-xs font-medium text-accent-strong transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60";
  }
  if (status === "done") {
    return "zouzou-primary-button inline-flex h-8 min-w-16 items-center justify-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2.5 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-60";
  }
  return "zouzou-secondary-button inline-flex h-8 min-w-16 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60";
}

function statusIcon(status: string) {
  if (status === "in_progress") {
    return <Loader2 className="size-3.5" />;
  }
  if (status === "done") {
    return <CheckCircle2 className="size-3.5" />;
  }
  if (status === "cancelled") {
    return <RotateCcw className="size-3.5" />;
  }
  return <Play className="size-3.5" />;
}

export function TodayTaskActions({
  taskId,
  status,
  focused = false,
  title,
  notes,
  projectName,
  initialStickyNotes = [],
}: {
  taskId: string;
  status: string;
  focused?: boolean;
  title: string;
  notes?: string | null;
  projectName?: string | null;
  initialStickyNotes?: TaskStickyNoteData[];
}) {
  const router = useRouter();
  const { ref, open, setOpen } = useClickOutside<HTMLDivElement>();
  const [optimisticStatus, setOptimisticStatus] = useState(status);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    setOptimisticStatus(status);
  }, [status]);
  const canChangeStatus =
    optimisticStatus !== "done" && optimisticStatus !== "cancelled";

  async function changeStatus() {
    if (updating) return;
    const previous = optimisticStatus;
    const next = nextStatus(previous);
    const formData = new FormData();
    formData.set("id", taskId);
    formData.set("status", next);
    setOptimisticStatus(next);
    setUpdating(true);
    trackEvent("home_task_status", { status: next });
    if (next === "done") markFirstTaskDone();
    try {
      await setTaskStatus(formData);
      router.refresh();
    } catch {
      setOptimisticStatus(previous);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={optimisticStatus} />
      {canChangeStatus ? (
        <button
          type="button"
          onClick={changeStatus}
          disabled={updating}
          className={statusButtonClass(optimisticStatus)}
        >
          {updating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            statusIcon(optimisticStatus)
          )}
          {updating ? "同步中..." : actionLabel(optimisticStatus)}
        </button>
      ) : null}

      <AiTaskSticky
        taskId={taskId}
        title={title}
        notes={notes}
        projectName={projectName}
        status={status}
        initialNotes={initialStickyNotes}
      />

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="任务设置"
          title="任务设置"
          className="zouzou-icon-button flex size-8 items-center justify-center rounded-md border border-border bg-surface text-ink-secondary transition-colors hover:border-accent hover:text-accent"
        >
          <Settings2 className="size-3.5" />
        </button>
        {open ? (
          <div className="zouzou-panel absolute right-0 top-10 z-30 w-48 rounded-xl p-1.5 shadow-pop animate-[zouzou-fade-in_240ms_ease-out]">
            <form action={focused ? clearTodayFocus : markTodayFocus}>
              <input type="hidden" name="id" value={taskId} />
              <SubmitButton
                pendingText="..."
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
              >
                {focused ? (
                  <>
                    <CalendarOff className="size-3.5" />
                    取消今日重点
                  </>
                ) : (
                  <>
                    <CalendarPlus className="size-3.5" />
                    设为今日重点
                  </>
                )}
              </SubmitButton>
            </form>
            <Link
              href={`/workspace?edit=${taskId}`}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <PencilLine className="size-3.5" />
              编辑
            </Link>
            <ConfirmActionButton
              action={deleteTask}
              id={taskId}
              confirmText="确定删除这个任务？"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
            >
              <Trash2 className="size-3.5" />
              删除
            </ConfirmActionButton>
          </div>
        ) : null}
      </div>

    </div>
  );
}
