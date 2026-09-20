import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { buildTaskContract } from "@/lib/task-contract";
import { toDateInputValue } from "@/lib/date";

export const dynamic = "force-dynamic";

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
    title?: string;
    shortTitle?: string;
    projectId?: string;
    notes?: string;
    scheduledDate?: string;
    dueDate?: string;
    focusDate?: string;
    priority?: string;
    status?: string;
    doneWhen?: string;
  };
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

  const status =
    typeof body.status === "string" &&
    statuses.includes(body.status as (typeof statuses)[number])
      ? (body.status as (typeof statuses)[number])
      : "todo";
  const notes = body.notes?.trim().slice(0, 500) || null;
  const contract = buildTaskContract(`${title} ${notes ?? ""}`.trim(), title);
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      projectId,
      title: title.slice(0, 200),
      shortTitle: body.shortTitle?.trim().slice(0, 40) || title.slice(0, 40),
      notes,
      status,
      priority: ["low", "medium", "high", "urgent"].includes(body.priority ?? "")
        ? (body.priority as "low" | "medium" | "high" | "urgent")
        : "medium",
      scheduledDate: parseDate(body.scheduledDate),
      dueDate: parseDate(body.dueDate),
      focusDate: parseDate(body.focusDate),
      completedAt: status === "done" ? new Date() : null,
      completedBy: status === "done" ? "user" : null,
      executionMode: contract.executionMode,
      doneWhen: body.doneWhen?.trim().slice(0, 500) || contract.doneWhen,
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
      focusDate: true,
    },
  });

  return NextResponse.json({
    task: {
      ...task,
      scheduledDate: task.scheduledDate ? toDateInputValue(task.scheduledDate) : null,
      dueDate: task.dueDate ? toDateInputValue(task.dueDate) : null,
      focusDate: task.focusDate ? toDateInputValue(task.focusDate) : null,
    },
  });
}
