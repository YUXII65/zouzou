import { prisma } from "@/lib/prisma";
import { endOfDay, startOfDay } from "@/lib/date";
import { buildTaskContract } from "@/lib/task-contract";
import {
  appendTaskContinuation,
  MAX_REVIEW_NEXT_ACTIONS,
  OPEN_TASK_STATUSES,
} from "@/lib/task-flow";

const TASK_EXECUTION_MODES = ["quick", "tool", "produce", "explore", "project"] as const;

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
  const fallbackProject = projectCandidates.length
    ? null
    : await prisma.project.findFirst({
        where: { userId, status: "active" },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { id: true },
      });
  const defaultProjectId = projectCandidates[0]?.id ?? fallbackProject?.id ?? null;

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
    for (const [index, action] of nextActions
      .slice(0, MAX_REVIEW_NEXT_ACTIONS)
      .entries()) {
      const existing = existingActions[index];
      const projectId = projectIdForNextAction(action.title);
      const scheduledDate = new Date(review.reviewDate);
      scheduledDate.setDate(scheduledDate.getDate() + 1);

      const linkedTask = existing?.taskId
        ? await tx.task.findFirst({
            where: { id: existing.taskId, userId },
            select: { id: true, notes: true, status: true },
          })
        : null;
      const openTask =
        linkedTask && OPEN_TASK_STATUSES.includes(linkedTask.status as (typeof OPEN_TASK_STATUSES)[number])
          ? linkedTask
          : projectId
            ? await tx.task.findFirst({
                where: {
                  userId,
                  projectId,
                  status: { in: [...OPEN_TASK_STATUSES] },
                },
                orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
                select: { id: true, notes: true, status: true },
              })
            : null;

      if (openTask) {
        const notes = appendTaskContinuation(
          openTask.notes,
          action.shortTitle,
          action.title !== action.shortTitle ? action.title : null,
        );
        await tx.task.update({
          where: { id: openTask.id, userId },
          data: { notes },
        });

        if (existing) {
          await tx.reviewNextAction.update({
            where: { id: existing.id, userId },
            data: {
              title: action.title,
              status: "pending",
              sortOrder: index,
              taskId: existing.taskId,
            },
          });
        } else {
          await tx.reviewNextAction.create({
            data: {
              userId,
              reviewId: review.id,
              title: action.title,
              sortOrder: index,
            },
          });
        }
        continue;
      }

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

      if (existing) {
        await tx.reviewNextAction.update({
          where: { id: existing.id, userId },
          data: {
            title: action.title,
            status: "pending",
            sortOrder: index,
            taskId: task.id,
          },
        });
      } else {
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

    for (
      let index = Math.min(nextActions.length, MAX_REVIEW_NEXT_ACTIONS);
      index < existingActions.length;
      index += 1
    ) {
      const extra = existingActions[index];
      if (extra.taskId) {
        const linkedTask = await tx.task.findFirst({
          where: { id: extra.taskId, userId },
          select: { id: true, status: true },
        });
        if (linkedTask?.status === "todo") {
          await tx.task.update({
            where: { id: linkedTask.id, userId },
            data: { status: "cancelled", completedAt: null, completedBy: null },
          });
        }
      }
      await tx.reviewNextAction.update({
        where: { id: extra.id, userId },
        data: { status: "cancelled" },
      });
    }
  });
}
