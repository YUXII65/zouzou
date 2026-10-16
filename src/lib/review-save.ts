import { prisma } from "@/lib/prisma";
import { decisionSessionFromReview } from "@/lib/decision";
import { syncReviewRelations } from "@/lib/review-relations";
import { recordUsageEvent } from "@/lib/usage";
import { invalidateAiContext } from "@/lib/ai-context";
import { toDateInputValue } from "@/lib/date";
import {
  formatReviewNextActions,
  parseReviewNextActions,
  shouldSyncReviewActions,
} from "@/lib/task-flow";

/**
 * 复盘保存的唯一实现：网页复盘面板和小程序复盘页都调它。
 *
 * 网页那份会写 decisionJson（AI 上下文里复盘决策记忆的来源），
 * 小程序那份没写，等于小程序保存的复盘在后续 AI 里少一段决策记忆。
 */
export async function saveReviewData(input: {
  userId: string;
  reviewId: string;
  summary: string;
  nextActions: string;
  page?: string;
}): Promise<{ date: string } | null> {
  const existing = await prisma.review.findFirst({
    where: { id: input.reviewId, userId: input.userId },
    select: { status: true, nextActions: true, projectId: true },
  });
  if (!existing) return null;

  const nextActions = parseReviewNextActions(input.nextActions);
  const nextActionsText = formatReviewNextActions(nextActions);
  const shouldSyncActions = shouldSyncReviewActions(
    existing.status,
    existing.nextActions,
    nextActionsText,
  );
  const decisionSession = decisionSessionFromReview({
    summary: input.summary,
    nextAction: nextActions[0]?.title ?? null,
  });

  const review = await prisma.review.update({
    where: { id: input.reviewId, userId: input.userId },
    data: {
      summary: input.summary,
      nextActions: nextActionsText,
      decisionJson: JSON.stringify(decisionSession),
      status: "final",
    },
  });

  // 已保存过的同一批下一步只更新复盘正文，不再重复创建或替换任务。
  if (shouldSyncActions) {
    await syncReviewRelations(review, nextActions, input.userId);
  }
  await recordUsageEvent({
    userId: input.userId,
    event: "review_saved",
    ...(input.page ? { page: input.page } : {}),
  });
  invalidateAiContext(input.userId);

  return { date: toDateInputValue(review.reviewDate) };
}