import { prisma } from "@/lib/prisma";
import { endOfDay, startOfDay } from "@/lib/date";
import { buildTaskContract } from "@/lib/task-contract";

const TASK_EXECUTION_MODES = ["quick", "tool", "produce", "explore", "project"] as const;
const TASK_TOOL_POLICIES = ["none", "read", "confirm-write"] as const;

function taskContractData(input: { title: string; notes?: string | null; executionMode?: string | null }) {
  const inferred = buildTaskContract(`${input.title} ${input.notes ?? ""}`.trim(), input.title);
  const rawMode = input.executionMode ?? "";
  return {
    executionMode: (TASK_EXECUTION_MODES as readonly string[]).includes(rawMode)
      ? rawMode
      : inferred.executionMode,
    doneWhen: inferred.doneWhen,
    maxTurns: inferred.maxTurns,
    toolPolicy: inferred.toolPolicy,
  };
}

export async function syncReviewRelations(
  review: { id: string; reviewDate: Date },
  nextActions: Array<{ title: string; shortTitle: string }>,
  userId: string,
) {
  const dayStart = startOfDay(review.reviewDate);
  const dayEnd = endOfDay(review.reviewDate);

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      OR: [
        { completedAt: { gte: dayStart, lte: dayEnd } },
        { scheduledDate: { gte: dayStart, lte: dayEnd } },
        { focusDate: { gte: dayStart, lte: dayEnd } },
        { createdAt: { gte: dayStart, lte: dayEnd } },
      ],
    },
    include: {
      project: { select: { id: true, name: true, updatedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const projectStats = new Map<string, { id: string; name: string; count: number; updatedAt: Date }>();
  for (const task of tasks) {
    if (!task.project) continue;
    const current = projectStats.get(task.project.id);
    projectStats.set(task.project.id, {
      id: task.project.id,
      name: task.project.name,
      count: (current?.count ?? 0) + 1,
      updatedAt: current && current.updatedAt > task.project.updatedAt ? current.updatedAt : task.project.updatedAt,
    });
  }

  const projectCandidates = [...projectStats.values()].sort(
    (a, b) => b.count - a.count || b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  const defaultProjectId = projectCandidates[0]?.id ?? null;

  function projectIdForNextAction(title: string) {
    const normalized = title.trim().toLowerCase();
    const namedProject = projectCandidates.find((project) => {
      const name = project.name.trim().toLowerCase();
      return name.length > 0 && normalized.includes(name);
    });
    return namedProject?.id ?? defaultProjectId;
  }

  for (const task of tasks) {
    await prisma.reviewTask.upsert({
      where: { reviewId_taskId: { reviewId: review.id, taskId: task.id } },
      update: {
        titleAtReview: task.title,
        statusAtReview: task.status,
        priorityAtReview: task.priority,
        projectId: task.project?.id ?? null,
      },
      create: {
        userId,
        reviewId: review.id,
        taskId: task.id,
        titleAtReview: task.title,
        statusAtReview: task.status,
        priorityAtReview: task.priority,
        projectId: task.project?.id ?? null,
      },
    });
  }

  const existingActions = await prisma.reviewNextAction.findMany({
    where: { reviewId: review.id, userId },
    orderBy: { sortOrder: "asc" },
  });

  await prisma.$transaction(async (tx) => {
    for (const [index, action] of nextActions.entries()) {
      const existing = existingActions[index];
      const projectId = projectIdForNextAction(action.title);
      if (existing) {
        await tx.reviewNextAction.update({
          where: { id: existing.id, userId },
          data: { title: action.title, status: "pending", sortOrder: index },
        });
        if (existing.taskId) {
          await tx.task.update({
            where: { id: existing.taskId, userId },
            data: {
              title: action.title,
              shortTitle: action.shortTitle,
              projectId,
              ...taskContractData({ title: action.title }),
            },
          });
        }
      } else {
        const scheduledDate = new Date(review.reviewDate);
        scheduledDate.setDate(scheduledDate.getDate() + 1);
        const task = await tx.task.create({
          data: {
            userId,
            title: action.title,
            shortTitle: action.shortTitle,
            projectId,
            priority: "medium",
            scheduledDate,
            ...taskContractData({ title: action.title }),
          },
        });
        await tx.reviewNextAction.create({
          data: {
            userId,
            reviewId: review.id,
            title: action.title,
            sortOrder: index,
            taskId: task.id,
          },
        });
      }
    }

    for (let index = nextActions.length; index < existingActions.length; index += 1) {
      const extra = existingActions[index];
      await tx.reviewNextAction.update({
        where: { id: extra.id, userId },
        data: { status: "cancelled" },
      });
    }
  });
}