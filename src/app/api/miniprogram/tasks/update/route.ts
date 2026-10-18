import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { taskContractData } from "@/lib/task-contract-fields";
import { syncProjectStageGate } from "@/lib/project-stage";
import {
  scheduleExploreContinuationAfterTask,
  scheduleProjectContinuationPreparation,
} from "@/lib/project-continuation";

export const dynamic = "force-dynamic";

const priorities = ["low", "medium", "high", "urgent"] as const;
const statuses = ["todo", "in_progress", "done", "cancelled"] as const;

function parseDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

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
    status?: string;
    scheduledDate?: string;
    dueDate?: string;
    focusDate?: string;
    projectId?: string;
    doneWhen?: string;
    methodHint?: string;
    executionMode?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const taskId = body.taskId?.trim();
  const title = body.title?.trim();
  if (!taskId || !title) {
    return NextResponse.json({ error: "invalid_task" }, { status: 400 });
  }

  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId: user.id },
    select: { id: true, title: true, notes: true, status: true, completedAt: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let projectId: string | null = null;
  if (body.projectId?.trim()) {
    const project = await prisma.project.findFirst({
      where: { id: body.projectId.trim(), userId: user.id },
      select: { id: true },
    });
    projectId = project?.id ?? null;
  }

  const status =
    typeof body.status === "string" &&
    statuses.includes(body.status as (typeof statuses)[number])
      ? (body.status as (typeof statuses)[number])
      : "todo";
  const priority =
    typeof body.priority === "string" &&
    priorities.includes(body.priority as (typeof priorities)[number])
      ? (body.priority as (typeof priorities)[number])
      : "medium";
  const notes = body.notes?.trim().slice(0, 500) || null;
  // 与网页任务编辑共用同一套字段规范化（src/lib/task-contract-fields.ts）。
  const contract = taskContractData({
    title,
    notes,
    executionMode: body.executionMode ?? null,
    doneWhen: body.doneWhen ?? null,
    methodHint: body.methodHint ?? null,
  });
  const completedAt =
    status === "done"
      ? new Date()
      : existing.status === "done"
        ? null
        : existing.completedAt;

  await prisma.task.update({
    where: { id: existing.id, userId: user.id },
    data: {
      title: title.slice(0, 200),
      shortTitle: body.shortTitle?.trim().slice(0, 40) || title.slice(0, 40),
      notes,
      ...(title !== existing.title || notes !== existing.notes
        ? { nextTaskJson: null, nextTaskUpdatedAt: null }
        : {}),
      projectId,
      status,
      priority,
      scheduledDate: parseDate(body.scheduledDate),
      dueDate: parseDate(body.dueDate),
      focusDate: parseDate(body.focusDate),
      completedAt,
      completedBy:
        status === "done"
          ? existing.status === "done"
            ? undefined
            : "user"
          : null,
      executionMode: contract.executionMode,
      methodHint: contract.methodHint,
      doneWhen: contract.doneWhen,
      maxTurns: contract.maxTurns,
      toolPolicy: contract.toolPolicy,
    },
  });

  if (projectId) {
    await syncProjectStageGate(prisma, { userId: user.id, projectId });
    scheduleProjectContinuationPreparation({
      userId: user.id,
      projectId,
    });
  }
  if (status === "done" || status === "cancelled") {
    await scheduleExploreContinuationAfterTask({
      userId: user.id,
      taskId: existing.id,
    });
  }

  return NextResponse.json({ ok: true });
}
