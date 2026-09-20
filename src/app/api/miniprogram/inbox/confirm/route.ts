import { NextResponse } from "next/server";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma } from "@/lib/prisma";
import { recordAiFeedback } from "@/lib/feedback";
import { recordUsageEvent } from "@/lib/usage";
import type { InboxPlan, InboxPlanTask } from "@/lib/ai";

export const dynamic = "force-dynamic";

type Priority = InboxPlanTask["priority"];
type ConfirmTaskInput = Partial<
  Pick<
    InboxPlanTask,
    | "title"
    | "shortTitle"
    | "notes"
    | "doneWhen"
    | "priority"
    | "scheduledDate"
    | "dueDate"
  >
>;

type ConfirmBody = {
  itemId?: string;
  projectName?: string | null;
  projectObjective?: string | null;
  projectMilestone?: string | null;
  tasks?: ConfirmTaskInput[];
};

const priorities: Priority[] = ["low", "medium", "high", "urgent"];

function cleanText(value: unknown, maxLength = 4000) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizePriority(value: unknown, fallback: Priority): Priority {
  return typeof value === "string" && priorities.includes(value as Priority)
    ? (value as Priority)
    : fallback;
}

function parseDate(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePlan(value: string | null): InboxPlan | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as InboxPlan;
  } catch {
    return null;
  }
}

function dateKey(value: Date | null) {
  if (!value) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function samePlanTasks(
  tasks: Array<{
    title: string;
    shortTitle: string;
    notes: string | null;
    doneWhen: string | null;
    priority: Priority;
    scheduledDate: Date | null;
    dueDate: Date | null;
  }>,
  plannedTasks: InboxPlanTask[],
) {
  if (tasks.length !== plannedTasks.length) return false;
  return tasks.every((task, index) => {
    const planned = plannedTasks[index];
    return (
      task.title === planned.title &&
      task.shortTitle === planned.shortTitle &&
      task.notes === planned.notes &&
      task.doneWhen === planned.doneWhen &&
      task.priority === planned.priority &&
      dateKey(task.scheduledDate) === planned.scheduledDate &&
      dateKey(task.dueDate) === planned.dueDate
    );
  });
}

export async function POST(request: Request) {
  const user = await getMiniProgramUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ConfirmBody;
  try {
    body = (await request.json()) as ConfirmBody;
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

  const taskInputs = Array.isArray(body.tasks) ? body.tasks : [];
  const projectName = cleanText(body.projectName, 120) ?? plan.projectName;
  const projectObjective =
    cleanText(body.projectObjective, 500) ?? plan.projectObjective;
  const projectMilestone =
    cleanText(body.projectMilestone, 500) ?? plan.projectMilestone;

  const tasks = plan.tasks.map((plannedTask, index) => {
    const input = taskInputs[index] ?? {};
    return {
      title: cleanText(input.title, 300) ?? plannedTask.title,
      shortTitle: cleanText(input.shortTitle, 120) ?? plannedTask.shortTitle,
      notes: cleanText(input.notes, 4000) ?? plannedTask.notes,
      doneWhen: cleanText(input.doneWhen, 500) ?? plannedTask.doneWhen,
      priority: normalizePriority(input.priority, plannedTask.priority),
      scheduledDate: parseDate(input.scheduledDate) ?? parseDate(plannedTask.scheduledDate),
      dueDate: parseDate(input.dueDate) ?? parseDate(plannedTask.dueDate),
      executionMode: plannedTask.executionMode,
      maxTurns: plannedTask.maxTurns,
      toolPolicy: plannedTask.toolPolicy,
    };
  });

  const edited = !samePlanTasks(tasks, plan.tasks);
  const confirmedTasksJson = JSON.stringify(
    tasks.map((task) => ({
      title: task.title,
      shortTitle: task.shortTitle,
      notes: task.notes,
      doneWhen: task.doneWhen,
      priority: task.priority,
      scheduledDate: dateKey(task.scheduledDate),
      dueDate: dateKey(task.dueDate),
    })),
  );

  let confirmedProjectId: string | null = item.projectId;
  await prisma.$transaction(async (tx) => {
    let projectId = item.projectId;

    if (plan.action === "create_project" && projectName) {
      const project = await tx.project.create({
        data: {
          userId: user.id,
          name: projectName,
          objective: projectObjective ?? "由收件箱想法创建的项目",
          currentMilestone: projectMilestone,
          createdFromInboxItemId: item.id,
          notes: item.content,
        },
      });
      projectId = project.id;
    } else if (plan.action === "existing_project" && projectName) {
      const project = await tx.project.findFirst({
        where: { name: projectName, userId: user.id },
        select: { id: true },
      });
      projectId = project?.id ?? projectId;
    }

    const firstTask = tasks[0];
    for (const [index, task] of tasks.entries()) {
      await tx.task.create({
        data: {
          userId: user.id,
          title: task.title,
          shortTitle: task.shortTitle,
          notes: task.notes,
          projectId,
          priority: task.priority,
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
        title: firstTask.title,
        projectId,
        priority: firstTask.priority,
        dueDate: firstTask.dueDate,
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
    action: edited ? "plan_edited" : "plan_accepted",
    inboxItemId: item.id,
    projectId: confirmedProjectId,
    beforeJson: item.aiPlanJson,
    afterJson: confirmedTasksJson,
    detail: edited ? "小程序用户编辑 AI 计划后确认" : "小程序用户直接确认 AI 计划",
  });
  await recordUsageEvent({
    userId: user.id,
    event: "task_created",
    page: "miniprogram",
    detail: "inbox_plan",
  });

  return NextResponse.json({
    projectId: confirmedProjectId,
    taskCount: tasks.length,
    edited,
  });
}
