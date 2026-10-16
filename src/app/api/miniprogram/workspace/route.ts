import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { parseStagePreview } from "@/lib/project-progress-types";

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
            methodHint: true,
            executionMode: true,
            status: true,
            priority: true,
            dueDate: true,
            scheduledDate: true,
            focusDate: true,
            completedAt: true,
            _count: { select: { stickyNotes: true } },
          },
        },
        stages: {
          where: { status: { in: ["active", "ready"] } },
          orderBy: [{ order: "desc" }, { id: "asc" }],
          take: 1,
          select: {
            id: true,
            order: true,
            status: true,
            deliverable: true,
            doneWhen: true,
            nextStageJson: true,
          },
        },
        tracks: {
          where: { status: { not: "archived" } },
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            intent: true,
            role: true,
            status: true,
            currentFocus: true,
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
        methodHint: true,
        executionMode: true,
        status: true,
        priority: true,
        dueDate: true,
        scheduledDate: true,
        focusDate: true,
        completedAt: true,
        _count: { select: { stickyNotes: true } },
      },
    }),
  ]);

  function serializeTask(task: (typeof projects)[number]["tasks"][number]) {
    return {
      ...task,
      stickyCount: task._count.stickyNotes,
      dueDate: task.dueDate?.toISOString() ?? null,
      scheduledDate: task.scheduledDate?.toISOString() ?? null,
      focusDate: task.focusDate?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
    };
  }

  return NextResponse.json({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      objective: project.objective,
      mode: project.mode,
      status: project.status,
      currentMilestone: project.currentMilestone,
      cadence: project.cadence,
      notes: project.notes,
      updatedAt: project.updatedAt.toISOString(),
      stage: project.stages[0]
        ? {
            id: project.stages[0].id,
            order: project.stages[0].order,
            status: project.stages[0].status,
            deliverable: project.stages[0].deliverable,
            doneWhen: project.stages[0].doneWhen,
            nextStage: parseStagePreview(project.stages[0].nextStageJson),
          }
        : null,
      tracks: project.tracks,
      tasks: project.tasks.map(serializeTask),
    })),
    unassociatedTasks: unassociatedTasks.map(serializeTask),
  });
}
