import Link from "next/link";
import {
  ArrowRight,
  FolderKanban,
  FolderPlus,
  ListTodo,
  PencilLine,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FirstRunTour } from "@/components/first-run-tour";
import { FirstTaskReviewHint } from "@/components/first-task-review-hint";
import { Panel, PanelHeader } from "@/components/panel";
import { EmptyState } from "@/components/empty-state";
import { ProjectForm } from "@/components/project-form";
import { TaskForm } from "@/components/task-form";
import { TaskRow } from "@/components/task-row";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { StatusBadge } from "@/components/status-badge";
import {
  createProject,
  createTask,
  deleteProject,
  updateProject,
  updateTask,
} from "@/app/actions";
import { cx } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getFirstRunState } from "@/lib/first-run";
import { serializeTaskStickyNote } from "@/lib/task-sticky";
import { buildTaskContract } from "@/lib/task-contract";

export const dynamic = "force-dynamic";

const priorityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sortTasks<T extends { priority: string }>(
  tasks: T[],
  sortMode: "order" | "priority",
) {
  if (sortMode !== "priority") return tasks;
  return [...tasks].sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9),
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const firstRun = await getFirstRunState(user.id, user.createdAt);
  const params = await searchParams;
  const projectParam =
    typeof params.project === "string" ? params.project : "";
  const editParam = typeof params.edit === "string" ? params.edit : "";
  const viewParam = typeof params.view === "string" ? params.view : "";
  const sortParam =
    typeof params.sort === "string" && params.sort === "priority"
      ? "priority"
      : "order";

  const [projects, tasks, reviewCount] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id },
      include: {
        tasks: {
          include: {
            stickyNotes: { orderBy: { createdAt: "desc" } },
          },
          orderBy: [{ planOrder: "asc" }, { createdAt: "desc" }],
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.task.findMany({
      where: { userId: user.id },
      include: {
        project: true,
        stickyNotes: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.review.count({ where: { userId: user.id } }),
  ]);

  const editingTask = editParam
    ? (tasks.find((task) => task.id === editParam) ?? null)
    : null;
  const unassociatedTasks = tasks.filter((task) => !task.projectId);
  const firstTaskReviewEligible =
    tasks.some((task) => task.status === "done") && reviewCount === 0;

  // 旧任务没有任务合同，第一次打开书桌时补齐，避免列表缺少执行方式和完成标准。
  const legacyTasks = tasks.filter((task) => !task.executionMode).slice(0, 20);
  if (legacyTasks.length) {
    await Promise.all(
      legacyTasks.map((task) => {
        const contract = buildTaskContract(
          `${task.title} ${task.notes ?? ""}`.trim(),
          task.title,
        );
        task.executionMode = contract.executionMode;
        task.doneWhen = contract.doneWhen;
        task.maxTurns = contract.maxTurns;
        task.toolPolicy = contract.toolPolicy;
        return prisma.task.update({
          where: { id: task.id, userId: user.id },
          data: {
            executionMode: contract.executionMode,
            doneWhen: contract.doneWhen,
            maxTurns: contract.maxTurns,
            toolPolicy: contract.toolPolicy,
          },
          select: { id: true },
        });
      }),
    );
  }
  const projectOptions = projects.map((project) => ({
    id: project.id,
    name: project.name,
  }));
  const editReturnTo = editingTask?.projectId
    ? `/workspace?project=${editingTask.projectId}`
    : "/workspace";

  const selectedProject =
    projects.find((project) => project.id === projectParam) ??
    (projectParam ? null : projects[0] ?? null);
  const showUnassigned =
    viewParam === "unassigned" ||
    (!projectParam && projects.length === 0 && unassociatedTasks.length > 0);

  return (
    <>
      <PageHeader title="书桌" />

      {firstRun.isFirstRun ? (
        <FirstRunTour
          initialStep={firstRun.tourStep}
          context="workspace"
          hasTasks={tasks.length > 0}
        />
      ) : null}

      <FirstTaskReviewHint eligible={firstTaskReviewEligible} />

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
                  const active =
                    selectedProject?.id === project.id && !showUnassigned;
                  return (
                    <Link
                      key={project.id}
                      href={`/workspace?project=${project.id}${
                        sortParam === "priority" ? "&sort=priority" : ""
                      }`}
                      className={cx(
                        "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "relative bg-accent-soft font-medium text-accent-strong after:absolute after:left-0 after:top-1/2 after:h-4 after:w-0.5 after:-translate-y-1/2 after:rounded-r-full after:bg-accent"
                          : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
                      )}
                    >
                      <span className="min-w-0 truncate">{project.name}</span>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {project.tasks.length}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={FolderKanban}
                title="还没有项目"
                hint="先别急着建。去记一个真实想法，AI 会先听懂你，再帮你拆成可推进的项目。"
                action={
                  <Link
                    href="/"
                    className="zouzou-primary-button inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
                  >
                    去收件箱记一个想法
                    <ArrowRight className="size-4" />
                  </Link>
                }
              />
            )}

            {unassociatedTasks.length ? (
              <Link
                href="/workspace?view=unassigned"
                className={cx(
                  "mt-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  showUnassigned
                    ? "relative bg-accent-soft font-medium text-accent-strong after:absolute after:left-0 after:top-1/2 after:h-4 after:w-0.5 after:-translate-y-1/2 after:rounded-r-full after:bg-accent"
                    : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ListTodo className="size-4 shrink-0 text-ink-muted" />
                  <span className="truncate">未关联任务</span>
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {unassociatedTasks.length}
                </span>
              </Link>
            ) : null}
          </div>
        </Panel>

        <div className="min-w-0 space-y-6">
          {editingTask ? (
            <Panel>
              <PanelHeader
                title="编辑任务"
                icon={PencilLine}
                action={
                  <Link
                    href={editReturnTo}
                    className="text-xs font-medium text-ink-secondary hover:text-accent"
                  >
                    关闭编辑
                  </Link>
                }
              />
              <TaskForm
                action={updateTask}
                projects={projectOptions}
                task={editingTask}
                returnTo={editReturnTo}
                submitLabel="保存任务"
              />
            </Panel>
          ) : null}

          {showUnassigned ? (
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
                      projects={projectOptions}
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
                        task={{
                          ...task,
                          stickyNotes: task.stickyNotes.map(
                            serializeTaskStickyNote,
                          ),
                        }}
                        projectId={null}
                        showLabels={firstRun.isFirstRun}
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
          ) : selectedProject ? (
            <Panel>
              <PanelHeader
                title={selectedProject.name}
                icon={FolderKanban}
                action={<StatusBadge status={selectedProject.status} />}
              />
              <div className="p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-surface-muted p-4">
                    <p className="text-xs font-medium text-ink-secondary">
                      目标
                    </p>
                    <p className="mt-2 text-sm leading-6 text-ink">
                      {selectedProject.objective}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-muted p-4">
                    <p className="text-xs font-medium text-ink-secondary">
                      里程碑
                    </p>
                    <p className="mt-2 text-sm leading-6 text-ink">
                      {selectedProject.currentMilestone || "暂无"}
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
                      project={selectedProject}
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
                          projects={projectOptions}
                          defaultProjectId={selectedProject.id}
                          returnTo={`/workspace?project=${selectedProject.id}`}
                          submitLabel="创建任务"
                        />
                      </div>
                    </details>
                  </div>

                  {selectedProject.tasks.length ? (
                    <div className="zouzou-panel mt-3 divide-y divide-border rounded-xl bg-surface">
                      {sortTasks(selectedProject.tasks, sortParam).map((task) => (
                        <TaskRow
                          key={task.id}
                          task={{
                            ...task,
                            stickyNotes: task.stickyNotes.map(
                              serializeTaskStickyNote,
                            ),
                          }}
                          projectId={selectedProject.id}
                          showLabels={firstRun.isFirstRun}
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
                    id={selectedProject.id}
                    confirmText={`确定删除项目“${selectedProject.name}”？项目下的任务将保留并解除关联。`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-danger/20 bg-danger/10 px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                  >
                    删除项目
                  </ConfirmActionButton>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel>
              <EmptyState
                icon={FolderKanban}
                title="选择或创建一个项目"
                hint="项目详情会显示在这里，保持页面专注。"
              />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
