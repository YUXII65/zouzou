import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { buildTaskEditSuggestion } from "@/lib/ai-edit-suggestions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    taskId?: string;
    title?: string;
    shortTitle?: string;
    notes?: string;
    priority?: string;
    scheduledDate?: string;
    dueDate?: string;
    focusDate?: string;
    idea?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = body.title?.trim();
  const idea = body.idea?.trim();
  if (!title || !idea) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // 与网页 AI 辅助编辑共用同一份实现（src/lib/ai-edit-suggestions.ts）。
  const suggestion = await buildTaskEditSuggestion(
    {
      taskId: body.taskId,
      title,
      shortTitle: body.shortTitle,
      notes: body.notes,
      priority: body.priority,
      scheduledDate: body.scheduledDate,
      dueDate: body.dueDate,
      focusDate: body.focusDate,
      idea,
    },
    user.id,
  );

  return NextResponse.json({ suggestion });
}