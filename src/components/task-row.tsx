"use client";

import { StatusBadge } from "@/components/status-badge";
import { TaskTitleButton } from "@/components/task-title-button";
import { TodayTaskActions } from "@/components/today-task-actions";
import { formatDate, isSameDay } from "@/lib/date";
import { taskModeLabel } from "@/lib/task-contract";
import type { TaskStickyNoteData } from "@/lib/task-sticky";

export function TaskRow({
  task,
  projectId,
  projectName = null,
  focused = false,
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
    focusDate?: Date | null;
    executionMode?: string | null;
    doneWhen?: string | null;
    stickyNotes?: TaskStickyNoteData[];
  };
  projectId: string | null;
  projectName?: string | null;
  focused?: boolean;
  /** 新手期：任务行右侧图标展开成"图标 + 文字" */
  showLabels?: boolean;
}) {
  const taskFocused = task.focusDate
    ? isSameDay(new Date(task.focusDate), new Date())
    : focused;

  return (
    <div
      data-project-id={projectId ?? undefined}
      className="zouzou-row-hover flex flex-col gap-3 px-4 py-3 transition-colors lg:flex-row lg:items-center"
    >
      <div className="min-w-0 flex-1">
        <TaskTitleButton
          taskId={task.id}
          title={task.title}
          shortTitle={task.shortTitle}
          notes={task.notes}
          projectName={projectName}
          status={task.status}
          doneWhen={task.doneWhen}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
          <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
            {taskModeLabel(task.executionMode)}
          </span>
          <StatusBadge status={task.priority} />
          {task.dueDate ? (
            <span className="text-danger">截止 {formatDate(task.dueDate)}</span>
          ) : null}
        </div>
      </div>

      <div className="flex w-full items-center justify-end gap-2 lg:w-auto">
        <TodayTaskActions
          taskId={task.id}
          status={task.status}
          focused={taskFocused}
          title={task.title}
          notes={task.notes}
          projectName={projectName}
          initialStickyNotes={task.stickyNotes ?? []}
          showLabels={showLabels}
        />
      </div>
    </div>
  );
}
