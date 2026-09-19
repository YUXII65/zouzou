import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { syncReviewRelations } from "@/lib/review-relations";
import { recordUsageEvent } from "@/lib/usage";
import { toDateInputValue } from "@/lib/date";

export const dynamic = "force-dynamic";

function parseNextActions(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").replace(/^\d+[.、)]\s*/, "").trim())
    .filter(Boolean);
  const actions: Array<{ title: string; shortTitle: string }> = [];
  for (let index = 0; index < lines.length && actions.length < 3; index += 2) {
    const shortTitle = lines[index].trim().slice(0, 80);
    const detail = (lines[index + 1] ?? shortTitle).trim().slice(0, 200);
    if (shortTitle) actions.push({ title: detail, shortTitle });
  }
  return actions;
}

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
    select: { id: true, reviewDate: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const nextActions = parseNextActions(body.nextActions ?? "");
  const review = await prisma.review.update({
    where: { id: existing.id, userId: user.id },
    data: {
      summary,
      nextActions: nextActions
        .map((action) => action.shortTitle !== action.title ? `${action.shortTitle}\n${action.title}` : action.shortTitle)
        .join("\n"),
      status: "final",
    },
  });

  await syncReviewRelations(review, nextActions, user.id);
  await recordUsageEvent({ userId: user.id, event: "review_saved", page: "miniprogram" });

  return NextResponse.json({ ok: true, date: toDateInputValue(review.reviewDate) });
}