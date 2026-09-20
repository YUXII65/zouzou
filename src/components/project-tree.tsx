import type { ProjectStatus } from "@prisma/client";
import {
  FolderKanban,
  ListTodo,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { TaskRow } from "@/components/task-row";
import { TaskForm } from "@/components/task-form";
import { ProjectForm } from "@/components/project-form";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { createTask, deleteProject, updateProject } from "@/app/actions";

type AccordionTask = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  scheduledDate: Date | null;
  dueDate: Date | null;
  focusDate?: Date | null;
};

type AccordionProject = {
  id: string;
  name: string;
  status: ProjectStatus;
  objective: string;
  currentMilestone: string | null;
  notes: string | null;
  tasks: AccordionTask[];
};

const priorityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function ProjectTree({
  projects,
  unassociatedTasks,
  defaultOpenProjectId,
  sortMode = "order",
}: {
  projects: AccordionProject[];
  unassociatedTasks: AccordionTask[];
  defaultOpenProjectId?: string;
  sortMode?: "order" | "priority";
}) {
  function sortTasks(tasks: AccordionTask[]) {
    if (sortMode === "priority") {
      return [...tasks].sort(
        (a, b) =>
          (priorityOrder[a.priority] ?? 9) -
          (priorityOrder[b.priority] ?? 9),
      );
    }
    return tasks;
  }

  return (
    <div className="space-y-2">
      {projects.map((project) => {
        const sortedTasks = sortTasks(project.tasks);
        return (
        <details
          key={project.id}
          className="zouzou-panel rounded-xl bg-surface"
          open={project.id === defaultOpenProjectId}
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted">
            <span className="flex min-w-0 items-center gap-2">
              <FolderKanban className="size-4 shrink-0 text-ink-muted" />
              <span className="truncate text-sm font-semibold text-ink">
                {project.name}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <StatusBadge status={project.status} />
              <span className="text-xs text-ink-muted">
                {sortedTasks.length} 个任务
              </span>
            </span>
          </summary>

          <div className="border-t border-border px-4 py-3">
            <p className="text-sm leading-6 text-ink-secondary">
              {project.objective}
            </p>
            {project.currentMilestone ? (
              <p className="mt-1 text-xs text-ink-secondary">
                里程碑：{project.currentMilestone}
              </p>
            ) : null}

            <div className="zouzou-panel mt-3 overflow-hidden rounded-xl bg-surface-muted/60">
              {sortedTasks.length ? (
                <div className="divide-y divide-border">
                  {sortedTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      projectId={project.id}
                      projectName={project.name}
                    />
                  ))}
                </div>
              ) : (
                <p className="px-4 py-3 text-xs text-ink-muted">暂无任务</p>
              )}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <details className="rounded-md border border-border bg-surface">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:text-success">
                  <Plus className="size-3.5" />
                  新增任务
                </summary>
                <div className="border-t border-border p-3">
                  <TaskForm
                    action={createTask}
                    defaultProjectId={project.id}
                    returnTo={`/workspace?project=${project.id}`}
                    submitLabel="创建任务"
                  />
                </div>
              </details>

              <details className="rounded-md border border-border bg-surface">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:text-success">
                  <PencilLine className="size-3.5" />
                  编辑项目
                </summary>
                <div className="border-t border-border p-3">
                  <ProjectForm
                    action={updateProject}
                    project={project}
                    submitLabel="保存项目"
                  />
                </div>
              </details>
            </div>

            <div className="mt-3 flex justify-end">
              <ConfirmActionButton
                action={deleteProject}
                id={project.id}
                confirmText={`确定删除项目“${project.name}”？项目下的任务将保留并解除关联。`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-danger/20 bg-danger/10 px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="size-3.5" />
                删除项目
              </ConfirmActionButton>
            </div>
          </div>
        </details>
        );
      })}

      {unassociatedTasks.length ? (
        <details className="zouzou-panel rounded-xl bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted">
            <span className="flex min-w-0 items-center gap-2">
              <ListTodo className="size-4 shrink-0 text-ink-muted" />
              <span className="truncate text-sm font-semibold text-ink">
                未关联任务
              </span>
            </span>
            <span className="text-xs text-ink-muted">
              {unassociatedTasks.length} 条
            </span>
          </summary>
          <div className="divide-y divide-border border-t border-border">
            {sortTasks(unassociatedTasks).map((task) => (
              <TaskRow key={task.id} task={task} projectId={null} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
