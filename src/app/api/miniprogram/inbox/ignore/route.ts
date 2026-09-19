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

  let body: { itemId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  if (!itemId) {
    return NextResponse.json({ error: "missing_item_id" }, { status: 400 });
  }

  const item = await prisma.inboxItem.findFirst({
    where: { id: itemId, userId: user.id, status: "inbox" },
    select: { id: true, aiSuggestionJson: true, aiPlanJson: true },
  });
  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const beforeJson = item.aiPlanJson ?? item.aiSuggestionJson ?? "{}";
  await prisma.inboxItem.update({
    where: { id: item.id, userId: user.id },
    data: {
      status: "ignored",
      category: "ignore",
      processedAt: new Date(),
    },
  });
  await prisma.aiPlanFeedback.create({
    data: {
      userId: user.id,
      inboxItemId: item.id,
      action: "ignored",
      planJson: beforeJson,
    },
  });
  await recordAiFeedback({
    userId: user.id,
    source: "inbox_plan",
    action: "plan_ignored",
    inboxItemId: item.id,
    beforeJson,
  });

  return NextResponse.json({ ok: true });
}