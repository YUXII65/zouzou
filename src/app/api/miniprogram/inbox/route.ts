import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { recordUsageEvent } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const items = await prisma.inboxItem.findMany({
    where: { userId: user.id, status: "inbox" },
    select: {
      id: true,
      content: true,
      aiPlanJson: true,
      aiSuggestionJson: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { content?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const content = String(body.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ error: "empty_content" }, { status: 400 });
  }

  const item = await prisma.inboxItem.create({
    data: {
      userId: user.id,
      content,
      source: "miniprogram",
    },
    select: {
      id: true,
      content: true,
      aiPlanJson: true,
      aiSuggestionJson: true,
      createdAt: true,
    },
  });

  await recordUsageEvent({
    userId: user.id,
    event: "task_created",
    page: "miniprogram",
    detail: "miniprogram_inbox",
  });

  return NextResponse.json({ item });
}