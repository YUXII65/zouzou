"use client";

import { ChevronDown } from "lucide-react";
import { TaskStickyInline } from "@/components/task-sticky-inline";
import { TaskTitleButton } from "@/components/task-title-button";
import { useClickOutside } from "@/lib/use-click-outside";
import type { TaskStickyNoteData } from "@/lib/task-sticky";

/**
 * 任务行里可点开的部分：标题 + 展开后的便利贴内容。
 * 点标题展开；点便利贴以外任意区域（或按 Esc）收回。
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
  const { ref, open: expanded, setOpen: setExpanded } =
    useClickOutside<HTMLDivElement>();

  return (
    <div ref={ref} className="min-w-0">
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
        <TaskStickyInline
          taskId={taskId}
          title={title}
          notes={notes}
          projectName={projectName}
          status={status}
          initialNotes={initialNotes}
        />
      ) : null}
    </div>
  );
}
