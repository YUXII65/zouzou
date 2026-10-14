import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { syncProjectStageGate } from "@/lib/project-stage";
import { advanceExploreAfterTask } from "@/lib/project-progress-agent";
import { after } from "next/server";

export const dynamic = "force-dynamic";

const allowedStatuses = ["todo", "in_progress", "done", "cancelled"] as const;
type AllowedStatus = (typeof allowedStatuses)[number];

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
  const status = body.status as AllowedStatus;
  if (!taskId || !allowedStatuses.includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId: user.id },
    select: { id: true, projectId: true },
  });
  if (!task) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const reviewNextStatus =
    status === "done"
      ? "done"
      : status === "cancelled"
        ? "cancelled"
        : "pending";

  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id, userId: user.id },
      data: {
        status,
        completedAt: status === "done" ? new Date() : null,
        completedBy: status === "done" ? "user" : null,
      },
    }),
    prisma.reviewNextAction.updateMany({
      where: { taskId: task.id, userId: user.id },
      data: { status: reviewNextStatus },
    }),
  ]);

  if (task.projectId) {
    await syncProjectStageGate(prisma, {
      userId: user.id,
      projectId: task.projectId,
    });
  }
  if (status === "done" || status === "cancelled") {
    after(() => advanceExploreAfterTask({ userId: user.id, taskId: task.id }));
  }

  return NextResponse.json({ ok: true, status });
}