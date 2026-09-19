import { NextResponse } from "next/server";
import { buildAiContext } from "@/lib/ai-context";
import { withAiQuota } from "@/lib/ai-quota";
import { generateTaskEditSuggestion } from "@/lib/ai";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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

  const aiContext = await buildAiContext({
    kind: "task_edit",
    taskId: body.taskId?.trim(),
    userId: user.id,
  });
  const suggestion = await withAiQuota("task_edit", () =>
    generateTaskEditSuggestion(
      {
        title,
        shortTitle: body.shortTitle,
        notes: body.notes,
        priority: body.priority,
        scheduledDate: body.scheduledDate,
        dueDate: body.dueDate,
        focusDate: body.focusDate,
        idea,
      },
      aiContext.summary,
      aiContext.evidence,
    ),
  );

  return NextResponse.json({ suggestion });
}