import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import {
  applyTaskStatus,
  TASK_STATUSES,
  type TaskStatusValue,
} from "@/lib/task-status";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { taskId?: string; status?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const taskId = body.taskId?.trim();
  const status = body.status as TaskStatusValue;
  if (!taskId || !TASK_STATUSES.includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  // 与网页任务状态按钮共用同一份实现（src/lib/task-status.ts）。
  const result = await applyTaskStatus({ userId: user.id, taskId, status });
  return NextResponse.json({
    ok: true,
    status: result.status,
    unchanged: !result.changed,
  });
}