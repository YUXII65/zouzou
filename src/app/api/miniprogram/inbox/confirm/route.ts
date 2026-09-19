import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { recordAiFeedback } from "@/lib/feedback";
import { recordUsageEvent } from "@/lib/usage";
import type { InboxPlan } from "@/lib/ai";

export const dynamic = "force-dynamic";

function parseDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parsePlan(value: string | null): InboxPlan | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as InboxPlan;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { itemId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  if (!itemId) {
    return NextResponse.json({ error: "missing_item_id" }, { status: 400 });
  }

  const item = await prisma.inboxItem.findUnique({
    where: { id: itemId, userId: user.id },
  });
  if (!item || item.status !== "inbox") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const plan = parsePlan(item.aiPlanJson);
  if (!plan || plan.action === "ignore" || !plan.tasks.length) {
    return NextResponse.json({ error: "plan_not_ready" }, { status: 409 });
  }

  const tasks = plan.tasks.map((task) => ({
    title: task.title,
    shortTitle: task.shortTitle,
    notes: task.notes,
    priority: ["low", "medium", "high", "urgent"].includes(task.priority)
      ? task.priority
      : "medium",
    scheduledDate: parseDate(task.scheduledDate),
    dueDate: parseDate(task.dueDate),
    executionMode: task.executionMode,
    doneWhen: task.doneWhen,
    maxTurns: task.maxTurns,
    toolPolicy: task.toolPolicy,
  }));

  let confirmedProjectId: string | null = item.projectId;
  await prisma.$transaction(async (tx) => {
    let projectId = item.projectId;

    if (plan.action === "create_project" && plan.projectName) {
      const project = await tx.project.create({
        data: {
          userId: user.id,
          name: plan.projectName,
          objective: plan.projectObjective ?? "由收件箱想法创建的项目",
          currentMilestone: plan.projectMilestone,
          createdFromInboxItemId: item.id,
          notes: item.content,
        },
      });
      projectId = project.id;
    } else if (plan.action === "existing_project" && plan.projectName) {
      const project = await tx.project.findFirst({
        where: { name: plan.projectName, userId: user.id },
        select: { id: true },
      });
      projectId = project?.id ?? projectId;
    }

    for (const [index, task] of tasks.entries()) {
      await tx.task.create({
        data: {
          userId: user.id,
          title: task.title,
          shortTitle: task.shortTitle,
          notes: task.notes,
          projectId,
          priority: task.priority as "low" | "medium" | "high" | "urgent",
          scheduledDate: task.scheduledDate,
          dueDate: task.dueDate,
          planOrder: index,
          inboxItemId: item.id,
          executionMode: task.executionMode,
          doneWhen: task.doneWhen,
          maxTurns: task.maxTurns,
          toolPolicy: task.toolPolicy,
        },
      });
    }

    await tx.inboxItem.update({
      where: { id: item.id, userId: user.id },
      data: {
        status: "processed",
        category: "task",
        title: tasks[0].title,
        projectId,
        priority: tasks[0].priority as "low" | "medium" | "high" | "urgent",
        dueDate: tasks[0].dueDate,
        confirmedAt: new Date(),
        processedAt: new Date(),
      },
    });
    confirmedProjectId = projectId;
  });

  await prisma.aiPlanFeedback.create({
    data: {
      userId: user.id,
      inboxItemId: item.id,
      action: "accepted",
      planJson: item.aiPlanJson!,
      editedJson: JSON.stringify(tasks),
    },
  });
  await recordAiFeedback({
    userId: user.id,
    source: "inbox_plan",
    action: "plan_accepted",
    inboxItemId: item.id,
    projectId: confirmedProjectId,
    beforeJson: item.aiPlanJson,
    afterJson: JSON.stringify(tasks),
    detail: "小程序用户直接确认 AI 计划",
  });
  await recordUsageEvent({
    userId: user.id,
    event: "task_created",
    page: "miniprogram",
    detail: "inbox_plan_confirm",
  });

  return NextResponse.json({
    projectId: confirmedProjectId,
    taskCount: tasks.length,
  });
}