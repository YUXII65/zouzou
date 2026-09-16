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
import { WorkspaceProjectBrowser } from "@/components/workspace-project-browser";
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

  const browserProjects = projects.map((project) => ({
    ...project,
    tasks: project.tasks.map((task) => ({
      ...task,
      stickyNotes: task.stickyNotes.map(serializeTaskStickyNote),
    })),
  }));
  const browserUnassociatedTasks = unassociatedTasks.map((task) => ({
    ...task,
    stickyNotes: task.stickyNotes.map(serializeTaskStickyNote),
  }));

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

      <WorkspaceProjectBrowser
        projects={browserProjects}
        unassociatedTasks={browserUnassociatedTasks}
        projectOptions={projectOptions}
        initialProjectId={showUnassigned ? null : (selectedProject?.id ?? null)}
        initialShowUnassigned={showUnassigned}
        sortMode={sortParam}
        showLabels={firstRun.isFirstRun}
        editingPanel={
          editingTask ? (
            <Panel>
              <PanelHeader
                title="编辑任务"
                icon={ListTodo}
                action={
                  <Link
                    href={editReturnTo}
                    className="text-xs font-medium text-ink-muted transition-colors hover:text-ink"
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
          ) : null
        }
      />
    </>
  );
}
