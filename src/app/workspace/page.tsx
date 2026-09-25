import Link from "next/link";
import { ListTodo } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FirstRunTour } from "@/components/first-run-tour";
import { Panel, PanelHeader } from "@/components/panel";
import { TaskForm } from "@/components/task-form";
import { WorkspaceProjectBrowser } from "@/components/workspace-project-browser";
import { updateTask } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  getFirstRunState,
  isFirstPlanGroupComplete,
} from "@/lib/first-run";
import { serializeTaskStickyNote } from "@/lib/task-sticky";
import { buildTaskContract } from "@/lib/task-contract";
import { repairUnassignedInboxProjects } from "@/lib/inbox-project";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await repairUnassignedInboxProjects(user.id);
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
  const firstGroupReviewEligible =
    reviewCount === 0 && (await isFirstPlanGroupComplete(user.id));

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
          reviewEligible={firstGroupReviewEligible}
        />
      ) : null}


      <WorkspaceProjectBrowser
        projects={browserProjects}
        unassociatedTasks={browserUnassociatedTasks}
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
