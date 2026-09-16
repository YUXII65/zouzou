"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { AiTaskSticky } from "@/components/ai-task-sticky";
import { TaskSettingsMenu } from "@/components/task-settings-menu";
import { TaskTitleButton } from "@/components/task-title-button";
import { markFirstTaskDone, notifyTourStep } from "@/lib/first-run-hints";
import { setTaskStatus } from "@/app/actions";
import { formatDate } from "@/lib/date";
import { taskModeLabel } from "@/lib/task-contract";
import type { TaskStickyNoteData } from "@/lib/task-sticky";

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

export function TaskRow({
  task,
  projectId,
  showLabels = false,
}: {
  task: {
    id: string;
    title: string;
    shortTitle?: string | null;
    notes: string | null;
    status: string;
    priority: string;
    scheduledDate: Date | null;
    dueDate: Date | null;
    executionMode?: string | null;
    doneWhen?: string | null;
    stickyNotes?: TaskStickyNoteData[];
  };
  projectId: string | null;
  /** 新手期：任务行右侧图标展开成"图标 + 文字" */
  showLabels?: boolean;
}) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useState(task.status);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    setOptimisticStatus(task.status);
  }, [task.status]);
  const canChangeStatus =
    optimisticStatus !== "done" && optimisticStatus !== "cancelled";

  async function changeStatus() {
    if (updating) return;
    const previous = optimisticStatus;
    const next = nextStatus(previous);
    const formData = new FormData();
    formData.set("id", task.id);
    formData.set("status", next);
    setOptimisticStatus(next);
    setUpdating(true);
    if (next === "in_progress") notifyTourStep("3");
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
    <div className="zouzou-row-hover flex flex-col gap-3 px-4 py-3 transition-colors lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <TaskTitleButton
          taskId={task.id}
          title={task.title}
          shortTitle={task.shortTitle}
          notes={task.notes}
          projectName={null}
          status={task.status}
          doneWhen={task.doneWhen}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
          <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
            {taskModeLabel(task.executionMode)}
          </span>
          <StatusBadge status={task.priority} />
          <StatusBadge status={optimisticStatus} />
          {task.scheduledDate ? (
            <span>计划 {formatDate(task.scheduledDate)}</span>
          ) : null}
          {task.dueDate ? (
            <span className="text-danger">截止 {formatDate(task.dueDate)}</span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {canChangeStatus ? (
          <button
            type="button"
            data-tour="task-next"
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

        <div className="flex items-center gap-2">
          <AiTaskSticky
            taskId={task.id}
            title={task.title}
            notes={task.notes}
            projectName={null}
            status={task.status}
            showLabel={showLabels}
            initialNotes={task.stickyNotes ?? []}
          />

          <TaskSettingsMenu
            taskId={task.id}
            projectId={projectId}
            title={task.title}
            showLabel={showLabels}
          />
        </div>

      </div>
    </div>
  );
}
