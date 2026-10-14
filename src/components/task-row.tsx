"use client";

import { TaskRowDisclosure } from "@/components/task-row-disclosure";
import { TodayTaskActions } from "@/components/today-task-actions";
import { formatDate, isSameDay } from "@/lib/date";
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
    methodHint?: string | null;
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
        <TaskRowDisclosure
          taskId={task.id}
          title={task.title}
          shortTitle={task.shortTitle}
          notes={task.notes}
          projectName={projectName}
          status={task.status}
          initialNotes={task.stickyNotes ?? []}
        >
          {task.dueDate ? (
            <span className="mt-2 block text-xs text-danger">
              建议 {formatDate(task.dueDate)}前完成
            </span>
          ) : null}
        </TaskRowDisclosure>
      </div>

      <div className="flex w-full items-center justify-end gap-2 lg:w-auto">
        <TodayTaskActions taskId={task.id} status={task.status} />
      </div>
    </div>
  );
}