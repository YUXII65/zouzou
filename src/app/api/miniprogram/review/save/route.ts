import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { syncReviewRelations } from "@/lib/review-relations";
import { recordUsageEvent } from "@/lib/usage";
import { toDateInputValue } from "@/lib/date";
import { formatReviewNextActions, parseReviewNextActions, shouldSyncReviewActions } from "@/lib/task-flow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { reviewId?: string; summary?: string; nextActions?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const reviewId = body.reviewId?.trim();
  const summary = body.summary?.trim();
  if (!reviewId || !summary) {
    return NextResponse.json({ error: "invalid_review" }, { status: 400 });
  }

  const existing = await prisma.review.findFirst({
    where: { id: reviewId, userId: user.id },
    select: { id: true, reviewDate: true, status: true, nextActions: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const nextActions = parseReviewNextActions(body.nextActions ?? "");
  const nextActionsText = formatReviewNextActions(nextActions);
  const shouldSyncActions = shouldSyncReviewActions(
    existing.status,
    existing.nextActions,
    nextActionsText,
  );

  const review = await prisma.review.update({
    where: { id: existing.id, userId: user.id },
    data: {
      summary,
      nextActions: nextActionsText,
      status: "final",
    },
  });

  if (shouldSyncActions) {
    await syncReviewRelations(review, nextActions, user.id);
  }
  await recordUsageEvent({ userId: user.id, event: "review_saved", page: "miniprogram" });

  return NextResponse.json({ ok: true, date: toDateInputValue(review.reviewDate) });
}