import { revalidatePath } from "next/cache";
import { buildAiContext } from "@/lib/ai-context";
import { withAiQuota } from "@/lib/ai-quota";
import { generateReviewDraft } from "@/lib/ai";
import { endOfDay, startOfDay, toDateInputValue } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { decisionSessionFromReview } from "@/lib/decision";
import { syncReviewRelations } from "@/lib/review-relations";
import {
  formatReviewNextActions,
  parseReviewNextActions,
  shouldSyncReviewActions,
} from "@/lib/task-flow";

async function finalizeReview(
  review: {
    id: string;
    summary: string;
    nextActions: string | null;
    status: string;
  },
  userId: string,
) {
  const nextActions = parseReviewNextActions(review.nextActions ?? "");
  const nextActionsText = formatReviewNextActions(nextActions);
  const shouldSync = shouldSyncReviewActions(
    review.status,
    review.nextActions,
    nextActionsText,
  );
  const decisionSession = decisionSessionFromReview({
    summary: review.summary,
    nextAction: nextActions[0]?.title ?? null,
  });
  const finalized = await prisma.review.update({
    where: { id: review.id },
    data: {
      nextActions: nextActionsText,
      decisionJson: JSON.stringify(decisionSession),
      status: "final",
    },
  });
  if (shouldSync) {
    await syncReviewRelations(finalized, nextActions, userId);
  }
  return finalized;
}

export async function createReviewDraft(input: {
  userId: string;
  reviewDate: Date;
  /** 传了就做"某个项目（探索模式）"的复盘，不传是按天复盘 */
  projectId?: string | null;
  onDelta?: (delta: string) => void;
}) {
  const projectId = input.projectId ?? null;
  const dayStart = startOfDay(input.reviewDate);
  const dayEnd = endOfDay(input.reviewDate);

  // 按项目复盘：只收集这个项目自己的任务和台阶
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: input.userId },
      select: { id: true, name: true, currentMilestone: true, cadence: true },
    });
    if (!project) return null;

    const [doneInProject, openInProject] = await Promise.all([
      prisma.task.findMany({
        where: { userId: input.userId, projectId, status: "done" },
        select: { title: true },
        orderBy: [{ completedAt: "desc" }, { id: "asc" }],
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          userId: input.userId,
          projectId,
          status: { in: ["todo", "in_progress"] },
        },
        select: { id: true, title: true, status: true },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      }),
    ]);

    const aiContext = await buildAiContext({
      kind: "review",
      userId: input.userId,
    });
    const scopedDraft = await withAiQuota("review_draft", () =>
      generateReviewDraft(
        {
          completed: doneInProject.map((task) => ({
            title: task.title,
            projectName: project.name,
          })),
          open: openInProject.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            projectName: project.name,
          })),
          planned: [],
          projects: [
            {
              name: project.name,
              currentMilestone: project.currentMilestone,
              taskCount: openInProject.length,
              openTaskCount: openInProject.length,
            },
          ],
        },
        aiContext.evidence,
        input.onDelta,
        aiContext.decisionMemory,
        { projectName: project.name, cadence: project.cadence },
      ),
      input.userId
    );
    if (!scopedDraft) return null;

    const existingScoped = await prisma.review.findFirst({
      where: {
        userId: input.userId,
        reviewDate: input.reviewDate,
        projectId,
      },
      select: { id: true },
    });
    const scopedReview = existingScoped
      ? await prisma.review.update({
          where: { id: existingScoped.id },
          data: {
            summary: scopedDraft.summary,
            nextActions: scopedDraft.nextActions,
            decisionJson: null,
            status: "draft",
          },
        })
      : await prisma.review.create({
          data: {
            userId: input.userId,
            reviewDate: input.reviewDate,
            projectId,
            summary: scopedDraft.summary,
            nextActions: scopedDraft.nextActions,
            status: "draft",
          },
        });

    const finalized = await finalizeReview(scopedReview, input.userId);
    revalidatePath("/files");
    return {
      reviewId: finalized.id,
      date: toDateInputValue(input.reviewDate),
      projectId,
    };
  }

  const [completedTasks, openTasks, plannedTasks, activeProjects] =
    await Promise.all([
      prisma.task.findMany({
        where: {
          userId: input.userId,
          completedAt: { gte: dayStart, lte: dayEnd },
          status: "done",
        },
        select: { title: true, project: { select: { name: true } } },
        orderBy: [{ completedAt: "desc" }, { id: "asc" }],
      }),
      prisma.task.findMany({
        where: {
          status: { in: ["todo", "in_progress"] },
          userId: input.userId,
        },
        select: {
          id: true,
          title: true,
          status: true,
          project: { select: { name: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          userId: input.userId,
          status: { in: ["todo", "in_progress"] },
          OR: [
            { scheduledDate: { gte: dayStart, lte: dayEnd } },
            { focusDate: { gte: dayStart, lte: dayEnd } },
            { createdAt: { gte: dayStart, lte: dayEnd } },
          ],
        },
        select: { title: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 20,
      }),
      prisma.project.findMany({
        where: { status: "active", userId: input.userId },
        select: {
          name: true,
          currentMilestone: true,
          _count: {
            select: {
              tasks: { where: { status: { in: ["todo", "in_progress"] } } },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      }),
    ]);

  const aiContext = await buildAiContext({
    kind: "review",
    userId: input.userId,
  });
  const draft = await withAiQuota("review_draft", () =>
    generateReviewDraft(
      {
        completed: completedTasks.map((task) => ({
          title: task.title,
          projectName: task.project?.name ?? null,
        })),
        open: openTasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          projectName: task.project?.name ?? null,
        })),
        planned: plannedTasks.map((task) => ({ title: task.title })),
        projects: activeProjects.map((project) => ({
          name: project.name,
          currentMilestone: project.currentMilestone,
          taskCount: project._count.tasks,
          openTaskCount: project._count.tasks,
        })),
      },
      aiContext.evidence,
      input.onDelta,
      aiContext.decisionMemory,
    ),
    input.userId
  );

  // 用 findFirst + update/create 而不是 upsert：projectId 可为空，Postgres 的 NULL 唯一性不适合 upsert
  const existingReview = await prisma.review.findFirst({
    where: {
      userId: input.userId,
      reviewDate: input.reviewDate,
      projectId: null,
    },
    select: { id: true },
  });
  const review = existingReview
    ? await prisma.review.update({
        where: { id: existingReview.id },
        data: {
          summary: draft.summary,
          nextActions: draft.nextActions,
          decisionJson: null,
          status: "draft",
        },
      })
    : await prisma.review.create({
        data: {
          userId: input.userId,
          reviewDate: input.reviewDate,
          summary: draft.summary,
          nextActions: draft.nextActions,
          status: "draft",
        },
      });

  const finalized = await finalizeReview(review, input.userId);
  revalidatePath("/");
  revalidatePath("/");
  return {
    reviewId: finalized.id,
    date: toDateInputValue(input.reviewDate),
  };
}
