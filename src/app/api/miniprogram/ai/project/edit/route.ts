import { NextResponse } from "next/server";
import { buildAiContext } from "@/lib/ai-context";
import { withAiQuota } from "@/lib/ai-quota";
import { generateProjectEditSuggestion } from "@/lib/ai";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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

  const aiContext = await buildAiContext({
    kind: "project_edit",
    projectId: body.projectId?.trim(),
    userId: user.id,
  });
  const suggestion = await withAiQuota("project_edit", () =>
    generateProjectEditSuggestion(
      {
        name,
        objective,
        currentMilestone: body.currentMilestone,
        status: body.status,
        notes: body.notes,
        idea,
      },
      aiContext.summary,
      aiContext.evidence,
    ),
  );

  return NextResponse.json({ suggestion });
}