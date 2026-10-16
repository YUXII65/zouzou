import { prisma } from "@/lib/prisma";
import { buildAiContext } from "@/lib/ai-context";
import { withAiQuota } from "@/lib/ai-quota";
import { suggestTodayFocus, type TodaySuggestion } from "@/lib/ai";
import { writeTodayFocus } from "@/lib/today-focus";

/**
 * 「今天要做」的 AI 取舍：网页首页和小程序首页共用同一份实现。
 *
 * 网页侧原来只写在 server action 里，小程序只能靠规则排序取前三条；
 * 抽到这里后两端排序、推荐理由完全一致。
 */
export async function generateTodayFocus(
  userId: string,
): Promise<TodaySuggestion[]> {
  const [tasks, latestReview, activeProjects] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        status: { in: ["todo", "in_progress"] },
      },
      include: { project: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 50,
    }),
    prisma.review.findFirst({
      where: { userId },
      select: { summary: true },
      orderBy: { reviewDate: "desc" },
    }),
    prisma.project.findMany({
      where: { status: "active", userId },
      select: {
        name: true,
        objective: true,
        currentMilestone: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 10,
    }),
  ]);

  const aiContext = await buildAiContext({
    kind: "today_focus",
    userId,
  });
  const suggestions = await withAiQuota(
    "today_focus",
    () =>
      suggestTodayFocus(
        tasks.map((task) => ({
          id: task.id,
          title: task.title,
          projectName: task.project?.name ?? null,
          priority: task.priority,
          dueDate: task.dueDate,
          scheduledDate: task.scheduledDate,
          planOrder: task.planOrder,
          batchId: task.inboxItemId,
        })),
        {
          reviewSummary: latestReview?.summary ?? undefined,
          projects: activeProjects,
        },
        aiContext.summary,
        aiContext.evidence,
        aiContext.decisionMemory,
      ),
    userId,
  );

  await writeTodayFocus(userId, suggestions);
  return suggestions;
}