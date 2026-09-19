import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { recordAiFeedback } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { reviewId?: string; action?: "useful" | "useless" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const reviewId = body.reviewId?.trim();
  const action = body.action;
  if (!reviewId || (action !== "useful" && action !== "useless")) {
    return NextResponse.json({ error: "invalid_feedback" }, { status: 400 });
  }

  const review = await prisma.review.findFirst({
    where: { id: reviewId, userId: user.id },
    select: { id: true },
  });
  if (!review) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAiFeedback({
    userId: user.id,
    source: "review_draft",
    action: action === "useful" ? "suggestion_useful" : "suggestion_useless",
    detail: review.id,
  });

  return NextResponse.json({ ok: true });
}