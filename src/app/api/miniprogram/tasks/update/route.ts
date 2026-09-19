import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { buildTaskContract } from "@/lib/task-contract";

export const dynamic = "force-dynamic";

function parseDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { taskId?: string; title?: string; notes?: string; priority?: string; scheduledDate?: string; dueDate?: string };
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
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const contract = buildTaskContract(`${title} ${body.notes ?? ""}`.trim(), title);
  await prisma.task.update({
    where: { id: existing.id, userId: user.id },
    data: {
      title: title.slice(0, 200),
      shortTitle: title.slice(0, 40),
      notes: body.notes?.trim().slice(0, 500) || null,
      priority: ["low", "medium", "high", "urgent"].includes(body.priority ?? "")
        ? (body.priority as "low" | "medium" | "high" | "urgent")
        : "medium",
      scheduledDate: parseDate(body.scheduledDate),
      dueDate: parseDate(body.dueDate),
      executionMode: contract.executionMode,
      doneWhen: contract.doneWhen,
      maxTurns: contract.maxTurns,
      toolPolicy: contract.toolPolicy,
    },
  });

  return NextResponse.json({ ok: true });
}