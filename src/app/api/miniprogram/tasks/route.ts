import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { buildTaskContract } from "@/lib/task-contract";
import { toDateInputValue } from "@/lib/date";

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

  let body: { title?: string; projectId?: string; notes?: string; scheduledDate?: string; dueDate?: string; priority?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "missing_title" }, { status: 400 });
  }

  let projectId: string | null = null;
  if (body.projectId?.trim()) {
    const project = await prisma.project.findFirst({
      where: { id: body.projectId.trim(), userId: user.id },
      select: { id: true },
    });
    projectId = project?.id ?? null;
  }

  const contract = buildTaskContract(`${title} ${body.notes ?? ""}`.trim(), title);
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      projectId,
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
    select: {
      id: true,
      title: true,
      shortTitle: true,
      status: true,
      priority: true,
      projectId: true,
      scheduledDate: true,
      dueDate: true,
    },
  });

  return NextResponse.json({
    task: {
      ...task,
      scheduledDate: task.scheduledDate ? toDateInputValue(task.scheduledDate) : null,
      dueDate: task.dueDate ? toDateInputValue(task.dueDate) : null,
    },
  });
}