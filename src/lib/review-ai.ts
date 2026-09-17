import { revalidatePath } from "next/cache";
import { buildAiContext } from "@/lib/ai-context";
import { withAiQuota } from "@/lib/ai-quota";
import { generateReviewDraft } from "@/lib/ai";
import { endOfDay, startOfDay, toDateInputValue } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export async function createReviewDraft(input: {
  userId: string;
  reviewDate: Date;
  onDelta?: (delta: string) => void;
}) {
  const dayStart = startOfDay(input.reviewDate);
  const dayEnd = endOfDay(input.reviewDate);

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
        select: { title: true, project: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
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
          _count: { select: { tasks: true } },
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
          title: task.title,
          projectName: task.project?.name ?? null,
        })),
        planned: plannedTasks.map((task) => ({ title: task.title })),
        projects: activeProjects.map((project) => ({
          name: project.name,
          currentMilestone: project.currentMilestone,
          taskCount: project._count.tasks,
        })),
      },
      aiContext.evidence,
      input.onDelta,
    ),
  );

  const review = await prisma.review.upsert({
    where: {
      userId_reviewDate: {
        userId: input.userId,
        reviewDate: input.reviewDate,
      },
    },
    update: {
      summary: draft.summary,
      nextActions: draft.nextActions,
      status: "draft",
    },
    create: {
      userId: input.userId,
      reviewDate: input.reviewDate,
      summary: draft.summary,
      nextActions: draft.nextActions,
      status: "draft",
    },
  });

  revalidatePath("/");
  revalidatePath("/review");
  return {
    reviewId: review.id,
    date: toDateInputValue(input.reviewDate),
  };
}
