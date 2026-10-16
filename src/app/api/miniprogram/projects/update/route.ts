import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { updateProjectData } from "@/lib/project-update";

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
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const name = body.name?.trim();
  const objective = body.objective?.trim();
  if (!projectId || !name || !objective) {
    return NextResponse.json({ error: "invalid_project" }, { status: 400 });
  }

  // 与网页项目编辑共用同一份实现（src/lib/project-update.ts）。
  const result = await updateProjectData({
    userId: user.id,
    projectId,
    name,
    objective,
    status: body.status ?? null,
    currentMilestone: body.currentMilestone ?? null,
    notes: body.notes ?? null,
  });
  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}