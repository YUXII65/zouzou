import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { saveReviewData } from "@/lib/review-save";

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

  // 与网页复盘面板共用同一份实现（src/lib/review-save.ts）。
  const result = await saveReviewData({
    userId: user.id,
    reviewId,
    summary,
    nextActions: body.nextActions ?? "",
    page: "miniprogram",
  });
  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, date: result.date });
}