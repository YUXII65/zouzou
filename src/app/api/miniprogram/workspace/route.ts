import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [projects, unassociatedTasks] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id },
      include: {
        tasks: {
          orderBy: [{ planOrder: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            title: true,
            shortTitle: true,
            notes: true,
            doneWhen: true,
            executionMode: true,
            status: true,
            priority: true,
            dueDate: true,
            scheduledDate: true,
            focusDate: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.task.findMany({
      where: { userId: user.id, projectId: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        shortTitle: true,
        notes: true,
        doneWhen: true,
        executionMode: true,
        status: true,
        priority: true,
        dueDate: true,
        scheduledDate: true,
        focusDate: true,
      },
    }),
  ]);

  return NextResponse.json({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      objective: project.objective,
      status: project.status,
      currentMilestone: project.currentMilestone,
      notes: project.notes,
      tasks: project.tasks.map((task) => ({
        ...task,
        dueDate: task.dueDate?.toISOString() ?? null,
        scheduledDate: task.scheduledDate?.toISOString() ?? null,
        focusDate: task.focusDate?.toISOString() ?? null,
      })),
    })),
    unassociatedTasks: unassociatedTasks.map((task) => ({
      ...task,
      dueDate: task.dueDate?.toISOString() ?? null,
      scheduledDate: task.scheduledDate?.toISOString() ?? null,
      focusDate: task.focusDate?.toISOString() ?? null,
    })),
  });
}