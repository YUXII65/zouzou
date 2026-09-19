import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      shortTitle: true,
      notes: true,
      status: true,
      priority: true,
      scheduledDate: true,
      dueDate: true,
      focusDate: true,
      projectId: true,
      project: { select: { name: true } },
    },
  });
  if (!task) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    task: {
      ...task,
      scheduledDate: task.scheduledDate ? toDateInputValue(task.scheduledDate) : "",
      dueDate: task.dueDate ? toDateInputValue(task.dueDate) : "",
      focusDate: task.focusDate ? toDateInputValue(task.focusDate) : "",
      projectName: task.project?.name ?? "",
    },
  });
}