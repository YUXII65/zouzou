import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";

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

  const review = await prisma.review.findFirst({
    where: { id: reviewId, userId: user.id },
    select: { id: true },
  });
  if (!review) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.review.update({
    where: { id: review.id, userId: user.id },
    data: {
      summary,
      nextActions: body.nextActions?.trim() || null,
      status: "final",
    },
  });

  return NextResponse.json({ ok: true });
}