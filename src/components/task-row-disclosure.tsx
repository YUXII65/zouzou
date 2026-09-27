"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, PencilLine, Trash2 } from "lucide-react";
import { deleteTask } from "@/app/actions";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { TaskStickyInline } from "@/components/task-sticky-inline";
import { TaskTitleButton } from "@/components/task-title-button";
import type { TaskStickyNoteData } from "@/lib/task-sticky";

/**
 * 任务行里可点开的部分：标题 + 展开后的便利贴内容。
 * 便利贴不再是右边一个按钮，点开任务就能直接看到；编辑/删除也收进展开区，
 * 这样任务行右侧只留状态切换。
 */
export function TaskRowDisclosure({
  taskId,
  title,
  shortTitle,
  notes,
  projectName,
  status,
  initialNotes = [],
}: {
  taskId: string;
  title: string;
  shortTitle?: string | null;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  initialNotes?: TaskStickyNoteData[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button
        type="button"
        data-tour="task-sticky"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full min-w-0 items-start gap-1.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <TaskTitleButton
            taskId={taskId}
            title={title}
            shortTitle={shortTitle}
            notes={notes}
            projectName={projectName}
            status={status}
          />
        </span>
        <ChevronDown
          className={`mt-0.5 size-3.5 shrink-0 text-ink-muted transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded ? (
        <>
          <TaskStickyInline
            taskId={taskId}
            title={title}
            notes={notes}
            projectName={projectName}
            status={status}
            initialNotes={initialNotes}
          />
          <div className="mt-2 flex items-center gap-3 text-xs">
            <Link
              href={`/workspace?edit=${taskId}`}
              className="inline-flex items-center gap-1 text-ink-secondary transition-colors hover:text-accent"
            >
              <PencilLine className="size-3.5" />
              编辑任务
            </Link>
            <ConfirmActionButton
              action={deleteTask}
              id={taskId}
              confirmText="确定删除这个任务？"
              className="inline-flex items-center gap-1 text-danger transition-colors hover:text-danger/80"
            >
              <Trash2 className="size-3.5" />
              删除
            </ConfirmActionButton>
          </div>
        </>
      ) : null}
    </>
  );
}
