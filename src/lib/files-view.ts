import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseStagePreview, type StagePreview } from "@/lib/project-progress-types";
import { buildTaskContract } from "@/lib/task-contract";
import { repairUnassignedInboxProjects } from "@/lib/inbox-project";
import {
  normalizeStickySteps,
  serializeTaskStickyNote,
  type TaskStickyNoteData,
} from "@/lib/task-sticky";

/**
 * 文件页的共享视图契约：网页 /files 和小程序文件页消费同一份。
 *
 * 旧结构：网页 files/page.tsx 自己查库、小程序 /api/miniprogram/workspace 另写一套
 *（只给 stickyCount、tracks 不排序、没有便利贴内容），两端看到的东西不一样。
 * 这里收敛成一份，并把「旧任务补执行合同」也放在同一处，避免只补一端。
 */
export type FilesViewTask = {
  id: string;
  title: string;
  shortTitle: string | null;
  notes: string | null;
  status: string;
  priority: string;
  executionMode: string | null;
  doneWhen: string | null;
  methodHint: string | null;
  dueDate: Date | null;
  scheduledDate: Date | null;
  focusDate: Date | null;
  completedAt: Date | null;
  projectId: string | null;
  trackId: string | null;
  stickyNotes: TaskStickyNoteData[];
};

export type FilesViewTrack = {
  id: string;
  name: string;
  intent: string;
  role: string;
  status: string;
  currentFocus: string | null;
};

export type FilesViewStage = {
  id: string;
  order: number;
  status: string;
  deliverable: string;
  doneWhen: string | null;
  nextStage: StagePreview | null;
};

export type FilesViewProject = {
  id: string;
  name: string;
  objective: string | null;
  mode: string;
  status: ProjectStatus;
  currentMilestone: string | null;
  cadence: string | null;
  notes: string | null;
  updatedAt: Date;
  stage: FilesViewStage | null;
  tracks: FilesViewTrack[];
  reviews: Array<{ id: string; reviewDate: Date }>;
  tasks: FilesViewTask[];
};

export type FilesView = {
  projects: FilesViewProject[];
  unassociatedTasks: FilesViewTask[];
  /** 长期项目还缺「下一阶段」总结的阶段 id，调用方决定何时补生成 */
  missingStagePreviewIds: string[];
};

function serializeStickyNotes(
  notes: Array<Parameters<typeof serializeTaskStickyNote>[0]>,
): TaskStickyNoteData[] {
  return notes.map((note) => {
    const serialized = serializeTaskStickyNote(note);
    return { ...serialized, steps: normalizeStickySteps(serialized) };
  });
}

export async function buildFilesView(input: {
  userId: string;
}): Promise<FilesView> {
  // 两端共用：确认计划时可能先生成任务，但项目创建失败或旧包没建项目。
  // 文件页展示前统一把带 inboxItemId 的未关联任务补进项目，避免只在小程序出现“散落任务”。
  await repairUnassignedInboxProjects(input.userId);
  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { userId: input.userId },
      include: {
        tasks: {
          include: { stickyNotes: { orderBy: { createdAt: "desc" } } },
          orderBy: [{ planOrder: "asc" }, { createdAt: "desc" }],
        },
        reviews: {
          orderBy: { reviewDate: "desc" },
          take: 12,
          select: { id: true, reviewDate: true },
        },
        stages: {
          where: { status: { in: ["active", "ready"] } },
          orderBy: [{ order: "desc" }, { id: "asc" }],
          take: 1,
          select: {
            id: true,
            order: true,
            status: true,
            deliverable: true,
            doneWhen: true,
            nextStageJson: true,
          },
        },
        tracks: {
          where: { status: { not: "archived" } },
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            intent: true,
            role: true,
            status: true,
            currentFocus: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.task.findMany({
      where: { userId: input.userId },
      include: {
        project: true,
        stickyNotes: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // 旧任务没有任务合同，第一次打开文件页时补齐，避免列表缺少执行方式。
  const legacyTasks = tasks.filter((task) => !task.executionMode).slice(0, 20);
  if (legacyTasks.length) {
    await Promise.all(
      legacyTasks.map((task) => {
        const contract = buildTaskContract(
          task.title + " " + (task.notes ?? ""),
          task.title,
        );
        return prisma.task.update({
          where: { id: task.id, userId: input.userId },
          data: {
            executionMode: contract.executionMode,
            doneWhen: contract.doneWhen,
            methodHint: contract.methodHint,
            maxTurns: contract.maxTurns,
            toolPolicy: contract.toolPolicy,
          },
          select: { id: true },
        });
      }),
    );
  }

  const missingStagePreviewIds: string[] = [];
  for (const project of projects) {
    const stage = project.stages[0];
    if (
      project.mode === "longterm" &&
      stage &&
      (stage.status === "active" || stage.status === "ready") &&
      !stage.nextStageJson
    ) {
      missingStagePreviewIds.push(stage.id);
    }
  }

  const serializeTask = (
    task: (typeof tasks)[number],
  ): FilesViewTask => ({
    id: task.id,
    title: task.title,
    shortTitle: task.shortTitle,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    executionMode: task.executionMode,
    doneWhen: task.doneWhen,
    methodHint: task.methodHint,
    dueDate: task.dueDate,
    scheduledDate: task.scheduledDate,
    focusDate: task.focusDate,
    completedAt: task.completedAt,
    projectId: task.projectId,
    trackId: task.trackId,
    stickyNotes: serializeStickyNotes(task.stickyNotes),
  });

  const projectTasks = projects.map((project) => project.id);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const projectTaskLists = new Map<string, FilesViewTask[]>();
  for (const projectId of projectTasks) {
    projectTaskLists.set(projectId, []);
  }
  for (const task of tasks) {
    if (!task.projectId) continue;
    const list = projectTaskLists.get(task.projectId);
    if (!list) continue;
    list.push(serializeTask(task));
  }

  return {
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      objective: project.objective,
      mode: project.mode,
      status: project.status,
      currentMilestone: project.currentMilestone,
      cadence: project.cadence,
      notes: project.notes,
      updatedAt: project.updatedAt,
      stage: project.stages[0]
        ? {
            id: project.stages[0].id,
            order: project.stages[0].order,
            status: project.stages[0].status,
            deliverable: project.stages[0].deliverable,
            doneWhen: project.stages[0].doneWhen,
            nextStage: parseStagePreview(project.stages[0].nextStageJson),
          }
        : null,
      // 主线永远排在最前，支线按创建顺序跟在后面。
      tracks: [...project.tracks].sort((a, b) =>
        a.role === b.role ? 0 : a.role === "main" ? -1 : 1,
      ),
      reviews: project.reviews,
      tasks: projectTaskLists.get(project.id) ?? [],
    })),
    unassociatedTasks: tasks
      .filter((task) => !task.projectId)
      .map(serializeTask),
    missingStagePreviewIds,
  };
}