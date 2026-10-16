import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { buildProjectEditSuggestion } from "@/lib/ai-edit-suggestions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    projectId?: string;
    name?: string;
    objective?: string;
    currentMilestone?: string;
    status?: string;
    notes?: string;
    idea?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = body.name?.trim();
  const objective = body.objective?.trim();
  const idea = body.idea?.trim();
  if (!name || !objective || !idea) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // 与网页 AI 辅助编辑共用同一份实现（src/lib/ai-edit-suggestions.ts）。
  const suggestion = await buildProjectEditSuggestion(
    {
      projectId: body.projectId,
      name,
      objective,
      currentMilestone: body.currentMilestone,
      status: body.status,
      notes: body.notes,
      idea,
    },
    user.id,
  );

  return NextResponse.json({ suggestion });
}