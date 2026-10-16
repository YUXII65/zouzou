import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMiniProgramUser } from "@/lib/miniprogram-auth";
import { prisma, withTransactionRetry } from "@/lib/prisma";
import { recordAiFeedback } from "@/lib/feedback";
import { recordUsageEvent } from "@/lib/usage";
import type { InboxPlan, InboxPlanTask } from "@/lib/ai";
import { appendTaskContinuation, OPEN_TASK_STATUSES } from "@/lib/task-flow";
import {
  decisionCardFromTask,
  stickyPayloadFromDecisionCard,
} from "@/lib/decision";
import {
  currentProjectStageId,
  ensureCurrentProjectStage,
  syncProjectStageGate,
} from "@/lib/project-stage";
import { ensureProjectTracks } from "@/lib/inbox-project";

export const dynamic = "force-dynamic";

type Priority = InboxPlanTask["priority"];
type ConfirmTaskInput = Partial<
  Pick<
    InboxPlanTask,
    | "title"
    | "shortTitle"
    | "notes"
    | "doneWhen"
    | "methodHint"
    | "recommendation"
    | "executionSteps"
    | "fallback"
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
    methodHint: string;
    recommendation: string;
    executionSteps: string[];
    fallback: string;
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
      task.methodHint === planned.methodHint &&
      task.recommendation === planned.recommendation &&
      JSON.stringify(task.executionSteps) === JSON.stringify(planned.executionSteps) &&
      task.fallback === planned.fallback &&
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
  if (!plan) {
    return NextResponse.json({ error: "plan_not_ready" }, { status: 409 });
  }

  if (plan.action === "answer" || plan.responseMode === "answer") {
    await prisma.inboxItem.update({
      where: { id: item.id, userId: user.id },
      data: {
        status: "processed",
        confirmedAt: new Date(),
        processedAt: new Date(),
      },
    });
    return NextResponse.json({
      ok: true,
      projectId: null,
      attachedTaskId: null,
      taskCount: 0,
      directAnswer: plan.directAnswer ?? "",
    });
  }

  if (plan.action === "ignore" || !plan.tasks.length) {
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
      methodHint: cleanText(input.methodHint, 500) ?? plannedTask.methodHint,
      recommendation:
        cleanText(input.recommendation, 500) ?? plannedTask.recommendation,
      executionSteps: Array.isArray(input.executionSteps)
        ? input.executionSteps
            .map((step) => String(step).trim())
            .filter(Boolean)
            .slice(0, 10)
        : plannedTask.executionSteps,
      fallback: cleanText(input.fallback, 500) ?? plannedTask.fallback,
      priority: normalizePriority(input.priority, plannedTask.priority),
      scheduledDate: parseDate(input.scheduledDate) ?? parseDate(plannedTask.scheduledDate),
      dueDate: parseDate(input.dueDate) ?? parseDate(plannedTask.dueDate),
      executionMode: plannedTask.executionMode,
      maxTurns: plannedTask.maxTurns,
      toolPolicy: plannedTask.toolPolicy,
      trackName: plannedTask.trackName ?? null,
    };
  });

  const edited = !samePlanTasks(tasks, plan.tasks);
  const confirmedTasksJson = JSON.stringify(
    tasks.map((task) => ({
      title: task.title,
      shortTitle: task.shortTitle,
      notes: task.notes,
      doneWhen: task.doneWhen,
      methodHint: task.methodHint,
      recommendation: task.recommendation,
      executionSteps: task.executionSteps,
      fallback: task.fallback,
      priority: task.priority,
      scheduledDate: dateKey(task.scheduledDate),
      dueDate: dateKey(task.dueDate),
    })),
  );

  let confirmedProjectId: string | null = item.projectId;
  let attachedTaskId: string | null = null;
  await withTransactionRetry(async (tx) => {
    let projectId = item.projectId;

    if (plan.action === "create_project" && projectName) {
      const project = await tx.project.create({
        data: {
          userId: user.id,
          name: projectName,
          objective: projectObjective ?? "由收件箱想法创建的项目",
          mode: plan.mode ?? item.mode ?? "normal",
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

    const project = projectId
      ? await tx.project.findUnique({
          where: { id: projectId, userId: user.id },
          select: { mode: true, objective: true },
        })
      : null;
    if (projectId) {
      await ensureCurrentProjectStage(tx, {
        userId: user.id,
        projectId,
        mode: project?.mode ?? plan.mode ?? item.mode ?? "normal",
        milestone: projectMilestone,
        objective: projectObjective ?? project?.objective,
      });
    }
    const stageId = projectId
      ? await currentProjectStageId(tx, { userId: user.id, projectId })
      : null;
    // 探索模式落线路图；其他模式 plan.tracks 为空。
    const trackMap = projectId
      ? await ensureProjectTracks(tx, {
          userId: user.id,
          projectId,
          tracks:
            (project?.mode ?? plan.mode ?? item.mode) === "explore"
              ? plan.tracks ?? []
              : [],
        })
      : new Map<string, string>();

    const firstTask = tasks[0];
    const openTasks = projectId
      ? await tx.task.findMany({
          where: {
            userId: user.id,
            projectId,
            status: { in: [...OPEN_TASK_STATUSES] },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, notes: true },
        })
      : [];
    const shouldCreateNewBatch =
      openTasks.length === 0 || plan.taskDisposition !== "attach";
    const createCount = shouldCreateNewBatch ? tasks.length : 0;
    const tasksToCreate = tasks.slice(0, createCount);
    const tasksToAttach = tasks.slice(createCount);
    let anchorTaskId = openTasks[0]?.id ?? null;
    let anchorTaskNotes = openTasks[0]?.notes ?? null;

    for (const [index, task] of tasksToCreate.entries()) {
      const created = await tx.task.create({
        data: {
          userId: user.id,
          title: task.title,
          shortTitle: task.shortTitle,
          notes: task.notes,
          projectId,
          stageId,
          trackId: task.trackName ? trackMap.get(task.trackName) ?? null : null,
          priority: task.priority,
          scheduledDate: task.scheduledDate,
          dueDate: task.dueDate,
          planOrder: index,
          inboxItemId: item.id,
          executionMode: task.executionMode,
          doneWhen: task.doneWhen,
          methodHint: task.methodHint,
          maxTurns: task.maxTurns,
          toolPolicy: task.toolPolicy,
        },
        select: { id: true },
      });
      const sticky = stickyPayloadFromDecisionCard(
        decisionCardFromTask(task),
      );
      await tx.taskStickyNote.create({
        data: {
          userId: user.id,
          taskId: created.id,
          sourceMessage: item.content,
          title: sticky.title,
          encouragement: sticky.encouragement,
          stepsJson: JSON.stringify(sticky.steps),
          nextStep: sticky.nextStep,
        },
      });
      if (!anchorTaskId) {
        anchorTaskId = created.id;
        anchorTaskNotes = task.notes;
      }
    }

    if (anchorTaskId && tasksToAttach.length) {
      let mergedNotes = anchorTaskNotes;
      for (const task of tasksToAttach) {
        mergedNotes = appendTaskContinuation(mergedNotes, task.title, task.notes);
      }
      await tx.task.update({
        where: { id: anchorTaskId, userId: user.id },
        data: { notes: mergedNotes },
      });
      attachedTaskId = anchorTaskId;
    }

    if (projectId) {
      await syncProjectStageGate(tx, { userId: user.id, projectId });
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
    detail: attachedTaskId
      ? "小程序新想法并入当前任务"
      : edited
        ? "小程序用户编辑 AI 计划后确认"
        : "小程序用户直接确认 AI 计划",
  });
  await recordUsageEvent({
    userId: user.id,
    event: attachedTaskId ? "plan_attached" : "task_created",
    page: "miniprogram",
    detail: "inbox_plan",
  });

  revalidatePath("/");
  revalidatePath("/files");
  revalidatePath("/workspace");

  return NextResponse.json({
    projectId: confirmedProjectId,
    attachedTaskId,
    taskCount: attachedTaskId ? 0 : tasks.length,
    edited,
  });
}
