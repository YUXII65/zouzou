"use client";

import { useEffect, useState } from "react";
import type { ProjectStatus } from "@prisma/client";
import {
  FolderKanban,
  FolderPlus,
  ListTodo,
  PencilLine,
} from "lucide-react";
import { Panel, PanelHeader } from "@/components/panel";
import { EmptyState } from "@/components/empty-state";
import { ProjectForm } from "@/components/project-form";
import { TaskForm } from "@/components/task-form";
import { TaskRow } from "@/components/task-row";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { StatusBadge } from "@/components/status-badge";
import type { TaskStickyNoteData } from "@/lib/task-sticky";
import {
  createProject,
  createTask,
  deleteProject,
  updateProject,
} from "@/app/actions";

type TaskData = {
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

type ProjectData = {
  id: string;
  name: string;
  status: ProjectStatus;
  objective: string;
  currentMilestone: string | null;
  notes: string | null;
  tasks: TaskData[];
};

const priorityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sortTasks(tasks: TaskData[], sortMode: "order" | "priority") {
  if (sortMode !== "priority") return tasks;
  return [...tasks].sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9),
  );
}

export function WorkspaceProjectBrowser({
  projects,
  unassociatedTasks,
  initialProjectId,
  initialShowUnassigned = false,
  sortMode = "order",
  showLabels = false,
  editingPanel = null,
}: {
  projects: ProjectData[];
  unassociatedTasks: TaskData[];
  initialProjectId: string | null;
  initialShowUnassigned?: boolean;
  sortMode?: "order" | "priority";
  showLabels?: boolean;
  editingPanel?: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState(
    initialProjectId ?? projects[0]?.id ?? null,
  );
  const [showUnassigned, setShowUnassigned] = useState(initialShowUnassigned);

  useEffect(() => {
    setActiveId(initialProjectId ?? projects[0]?.id ?? null);
    setShowUnassigned(initialShowUnassigned);
  }, [initialProjectId, initialShowUnassigned]);

  const activeProject =
    projects.find((project) => project.id === activeId) ?? null;

  function openProject(projectId: string) {
    setActiveId(projectId);
    setShowUnassigned(false);
    window.history.replaceState(
      null,
      "",
      `/workspace?project=${projectId}${sortMode === "priority" ? "&sort=priority" : ""}`,
    );
  }

  function openUnassigned() {
    setShowUnassigned(true);
    window.history.replaceState(null, "", "/workspace?view=unassigned");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <Panel className="min-w-0 self-start">
        <PanelHeader title="项目" icon={FolderKanban} />
        <details className="border-b border-border bg-surface">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 border-b border-dashed border-border-strong/70 px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-surface-hover">
            <FolderPlus className="size-3.5 text-ink-muted" />
            新建项目
          </summary>
          <div className="border-t border-border p-4">
            <ProjectForm action={createProject} submitLabel="创建项目" />
          </div>
        </details>
        <div className="p-2">
          {projects.length ? (
            <div className="space-y-1">
              {projects.map((project) => {
                const active = project.id === activeId && !showUnassigned;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => openProject(project.id)}
                    className={
                      active
                        ? "relative flex w-full items-center justify-between gap-3 rounded-lg bg-accent-soft px-3 py-2 text-left text-sm font-medium text-accent-strong after:absolute after:left-0 after:top-1/2 after:h-4 after:w-0.5 after:-translate-y-1/2 after:rounded-r-full after:bg-accent"
                        : "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
                    }
                  >
                    <span className="min-w-0 truncate">{project.name}</span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {project.tasks.length}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="还没有项目"
              hint="先记一个真实想法，AI 会先听懂你，再帮你拆成可推进的项目。"
            />
          )}
          {unassociatedTasks.length ? (
            <button
              type="button"
              onClick={openUnassigned}
              className={
                showUnassigned
                  ? "relative mt-2 flex w-full items-center justify-between gap-3 rounded-lg bg-accent-soft px-3 py-2 text-left text-sm font-medium text-accent-strong after:absolute after:left-0 after:top-1/2 after:h-4 after:w-0.5 after:-translate-y-1/2 after:rounded-r-full after:bg-accent"
                  : "mt-2 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                <ListTodo className="size-4 shrink-0 text-ink-muted" />
                <span className="truncate">未关联任务</span>
              </span>
              <span className="shrink-0 text-xs text-ink-muted">
                {unassociatedTasks.length}
              </span>
            </button>
          ) : null}
        </div>
      </Panel>

      <div className="min-w-0 space-y-6">
        {editingPanel}
        {!editingPanel && showUnassigned ? (
          <Panel>
            <PanelHeader
              title="未关联任务"
              icon={ListTodo}
              action={
                <span className="text-xs font-medium text-ink-muted">
                  {unassociatedTasks.length} 条
                </span>
              }
            />
            <div className="p-4">
              <details className="zouzou-panel rounded-xl bg-surface">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:text-accent">
                  <FolderPlus className="size-3.5" />
                  新增任务
                </summary>
                <div className="border-t border-border p-3">
                  <TaskForm
                    action={createTask}
                    defaultProjectId={undefined}
                    returnTo="/workspace?view=unassigned"
                    submitLabel="创建任务"
                  />
                </div>
              </details>
              {unassociatedTasks.length ? (
                <div className="zouzou-panel mt-4 divide-y divide-border rounded-xl bg-surface">
                  {unassociatedTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      projectId={null}
                      showLabels={showLabels}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ListTodo}
                  title="没有未关联任务"
                  hint="所有任务都已经归到项目里。"
                />
              )}
            </div>
          </Panel>
        ) : null}
        {!editingPanel && !showUnassigned && activeProject ? (
          <Panel>
            <PanelHeader
              title={activeProject.name}
              icon={FolderKanban}
              action={<StatusBadge status={activeProject.status} />}
            />
            <div className="p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-surface-muted p-4">
                  <p className="text-xs font-medium text-ink-secondary">目标</p>
                  <p className="mt-2 text-sm leading-6 text-ink">
                    {activeProject.objective}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-muted p-4">
                  <p className="text-xs font-medium text-ink-secondary">里程碑</p>
                  <p className="mt-2 text-sm leading-6 text-ink">
                    {activeProject.currentMilestone || "暂无"}
                  </p>
                </div>
              </div>
              <details className="zouzou-panel mt-4 rounded-xl bg-surface">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:text-accent">
                  <PencilLine className="size-3.5" />
                  编辑项目
                </summary>
                <div className="border-t border-border p-3">
                  <ProjectForm
                    action={updateProject}
                    project={activeProject}
                    submitLabel="保存项目"
                  />
                </div>
              </details>
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">任务</p>
                  <details className="rounded-md border border-border bg-surface">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:text-accent">
                      <FolderPlus className="size-3.5" />
                      新增任务
                    </summary>
                    <div className="border-t border-border p-3">
                      <TaskForm
                        action={createTask}
                        defaultProjectId={activeProject.id}
                        returnTo={`/workspace?project=${activeProject.id}`}
                        submitLabel="创建任务"
                      />
                    </div>
                  </details>
                </div>
                {activeProject.tasks.length ? (
                  <div className="zouzou-panel mt-3 divide-y divide-border rounded-xl bg-surface">
                    {sortTasks(activeProject.tasks, sortMode).map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        projectId={activeProject.id}
                        projectName={activeProject.name}
                        showLabels={showLabels}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={ListTodo}
                    title="项目下还没有任务"
                    hint="新增第一条任务，或从 AI 想法梳理里生成。"
                  />
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <ConfirmActionButton
                  action={deleteProject}
                  id={activeProject.id}
                  confirmText={`确定删除项目“${activeProject.name}”？项目下的任务将保留并解除关联。`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-danger/20 bg-danger/10 px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  删除项目
                </ConfirmActionButton>
              </div>
            </div>
          </Panel>
        ) : null}
        {!editingPanel && !showUnassigned && !activeProject ? (
          <Panel>
            <EmptyState
              icon={FolderKanban}
              title="选择或创建一个项目"
              hint="项目详情会显示在这里，保持页面专注。"
            />
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
