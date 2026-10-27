import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import {
  addCheckinItems,
  createCheckinProject,
  deleteCheckinProject,
  toggleCheckinItem,
  updateCheckinItems,
} from "@/lib/checkin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    action?: string;
    items?: string | string[] | Array<{ id?: string; title?: string }>;
    projectId?: string;
    taskId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 网页 server action 和这里共用 src/lib/checkin.ts，业务规则不复制第二份。
  if (body.action === "create") {
    const result = await createCheckinProject({
      userId: user.id,
      items: body.items,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "add") {
    const result = await addCheckinItems({
      userId: user.id,
      projectId: body.projectId,
      items: body.items,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "edit") {
    const result = await updateCheckinItems({
      userId: user.id,
      projectId: body.projectId,
      items: body.items,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "toggle") {
    const taskId = body.taskId?.trim();
    if (!taskId) {
      return NextResponse.json({ error: "missing_task" }, { status: 400 });
    }
    const result = await toggleCheckinItem({ userId: user.id, taskId });
    return NextResponse.json(result, { status: result.ok ? 200 : 404 });
  }

  if (body.action === "delete") {
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return NextResponse.json({ error: "missing_project" }, { status: 400 });
    }
    const result = await deleteCheckinProject({
      userId: user.id,
      projectId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 404 });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
