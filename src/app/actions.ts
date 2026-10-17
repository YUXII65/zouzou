"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { prisma, withTransactionRetry } from "@/lib/prisma";
import { safeNext } from "@/lib/safe-next";
import { isAdminUsername } from "@/lib/admin";
import {
  createUserSession,
  destroyUserSession,
  getCurrentUser,
  hashPassword,
  isGuestUser,
  requireUser,
} from "@/lib/auth";
import { startOfDay, toDateInputValue } from "@/lib/date";
import { buildAiContext, invalidateAiContext } from "@/lib/ai-context";
import { recordAiFeedback } from "@/lib/feedback";
import { recordUsageEvent } from "@/lib/usage";
import { guestEntryPath } from "@/lib/entry-policy";
import { withAiQuota } from "@/lib/ai-quota";
import {
  isOnboardingCompleted,
  setOnboardingCompleted,
} from "@/lib/onboarding";
import { setFirstRunTourStep as persistFirstRunTourStep } from "@/lib/first-run";
import {
  serializeTaskStickyNote,
  type TaskStickyNoteData,
} from "@/lib/task-sticky";
import { generateTodayFocus } from "@/lib/today-focus-generate";
import { priority, taskContractData } from "@/lib/task-contract-fields";
import { applyTaskStatus } from "@/lib/task-status";
import { buildTaskEditSuggestion } from "@/lib/ai-edit-suggestions";
import { advanceProjectStage } from "@/lib/project-stage-advance";
import {
  decisionCardFromAdvice,
  decisionCardFromTask,
  routeDecisionKind,
  stickyPayloadFromDecisionCard,
} from "@/lib/decision";
import { ensureInboxProject, ensureProjectTracks } from "@/lib/inbox-project";
import {
  currentProjectStageId,
  ensureCurrentProjectStage,
  syncProjectStageGate,
} from "@/lib/project-stage";
import {
  advanceExploreAfterTask,
  generateLongtermStagePreview,
} from "@/lib/project-progress-agent";
import {
  appendTaskContinuation,
  OPEN_TASK_STATUSES,
} from "@/lib/task-flow";
import {
  generateFirstRunPlan,
  generateSocraticClarification,
  generateTaskCoachAdvice,
  generateTaskShortTitle,
  type FirstRunPlanResult,
  type InboxClarification,
  type InboxPlan,
  type TaskEditSuggestion,
  type TaskShortTitleSuggestion,
  type TodaySuggestion,
} from "@/lib/ai";

const taskStatuses: TaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "cancelled",
];

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function lines(value: string | null | undefined) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function linesOr(value: string | null | undefined, fallback: string[]) {
  const parsed = lines(value);
  return parsed.length ? parsed : fallback;
}

function shortTitleFromTitle(title: string) {
  const first = title.split(/[，,。；;！？!?\n]/)[0]?.trim() || title.trim();
  return first.length > 18 ? `${first.slice(0, 17).trim()}…` : first;
}

function dateInput(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function dateString(value: string | null | undefined) {
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function taskStatus(value: string): TaskStatus {
  return taskStatuses.includes(value as TaskStatus)
    ? (value as TaskStatus)
    : "todo";
}

function taskReturnTo(value: string | null) {
  if (!value) return null;
  if (
    value === "/workspace" ||
    value.startsWith("/workspace?tab=projects") ||
    value.startsWith("/workspace?project=")
  ) {
    return value;
  }
  return null;
}

function taskSnapshot(task: {
  title: string;
  status: string;
  priority?: string | null;
  scheduledDate?: Date | null;
  dueDate?: Date | null;
  projectId?: string | null;
}) {
  return JSON.stringify({
    title: task.title,
    status: task.status,
    priority: task.priority ?? null,
    scheduledDate: task.scheduledDate
      ? toDateInputValue(task.scheduledDate)
      : null,
    dueDate: task.dueDate ? toDateInputValue(task.dueDate) : null,
    projectId: task.projectId ?? null,
  });
}

function parseInboxPlan(item: { aiPlanJson: string | null }): InboxPlan | null {
  if (!item.aiPlanJson) return null;

  try {
    return JSON.parse(item.aiPlanJson) as InboxPlan;
  } catch {
    return null;
  }
}

async function ownedProjectId(projectId: string | null, userId: string) {
  if (!projectId) return null;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  return project?.id ?? null;
}


export async function startGuestExperience() {
  const current = await getCurrentUser();
  if (current) redirect("/");

  const username = `guest_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const password = randomBytes(12).toString("base64url");
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: hashPassword(password),
    },
    select: { id: true },
  });

  await createUserSession(user.id);
  redirect(guestEntryPath());
}

export async function claimGuestAccount(formData: FormData) {
  const user = await requireUser();
  if (!isGuestUser(user)) redirect("/");

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (
    username.length < 2 ||
    username.length > 20 ||
    password.length < 6
  ) {
    redirect(`/guest/register?error=register`);
  }

  const existing = await prisma.user.findFirst({
    where: { username, NOT: { id: user.id } },
    select: { id: true },
  });
  if (existing) {
    redirect(`/guest/register?error=register`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      username,
      passwordHash: hashPassword(password),
    },
  });
  await setOnboardingCompleted(user.id, true);
  await recordUsageEvent({ userId: user.id, event: "guest_claimed" });
  redirect(next);
}

export async function completeFirstRun(formData: FormData) {
  const user = await requireUser();
  const projectName = text(formData, "projectName");
  const objective = text(formData, "objective");
  const milestone = text(formData, "milestone");
  const taskTitle = text(formData, "taskTitle");
  const taskShortTitle = text(formData, "taskShortTitle");
  const taskRecommendation = text(formData, "taskRecommendation");
  const taskFallback = text(formData, "taskFallback");

  if (!projectName || !objective || !taskTitle) return;

  const taskContract = taskContractData({
    title: taskTitle,
    notes: objective,
    executionMode: formData.get("taskExecutionMode"),
    doneWhen: formData.get("taskDoneWhen"),
    methodHint: formData.get("taskMethodHint"),
    maxTurns: formData.get("taskMaxTurns"),
    toolPolicy: formData.get("taskToolPolicy"),
  });
  if (await isOnboardingCompleted(user.id)) {
    redirect("/");
  }

  const existingProject = await prisma.project.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (existingProject) {
    await setOnboardingCompleted(user.id, true);
    await persistFirstRunTourStep(user.id, "2");
    redirect("/workspace");
  }

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: projectName,
      objective,
      currentMilestone: milestone,
      status: "active",
      notes: text(formData, "sourceIdea"),
    },
    select: { id: true },
  });

  const createdTask = await prisma.task.create({
    data: {
      userId: user.id,
      title: taskTitle,
      shortTitle: taskShortTitle,
      projectId: project.id,
      status: "todo",
      priority: "medium",
      scheduledDate: startOfDay(),
      planOrder: 0,
      ...taskContract,
    },
    select: { id: true },
  });

  const sticky = stickyPayloadFromDecisionCard(
    decisionCardFromTask({
      title: taskTitle,
      shortTitle: taskShortTitle ?? taskTitle,
      recommendation: taskRecommendation,
      executionSteps: lines(text(formData, "taskExecutionSteps")),
      fallback: taskFallback,
      methodHint: taskContract.methodHint,
      doneWhen: taskContract.doneWhen,
    }),
  );
  await prisma.taskStickyNote.create({
    data: {
      userId: user.id,
      taskId: createdTask.id,
      sourceMessage: text(formData, "sourceIdea") ?? objective,
      title: sticky.title,
      encouragement: sticky.encouragement,
      stepsJson: JSON.stringify(sticky.steps),
      nextStep: sticky.nextStep,
    },
  });

  await recordUsageEvent({
    userId: user.id,
    event: "task_created",
    detail: "onboarding",
  });
  await setOnboardingCompleted(user.id, true);
  await persistFirstRunTourStep(user.id, "2");
  await recordUsageEvent({ userId: user.id, event: "onboarding_complete" });
  revalidatePath("/");
  revalidatePath("/workspace");
  redirect("/workspace");
}

/**
 * 保存用户资料：昵称 + 头像。
 * 头像用客户端压缩后的 data URL 存库（不引入对象存储，保持部署简单），
 * 这里做大小与类型兜底，避免被塞进超大字段。
 */
export async function updateUserProfile(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const rawAvatar = String(formData.get("avatarUrl") ?? "");
  const avatarUrl =
    rawAvatar.startsWith("data:image/") && rawAvatar.length <= 400_000
      ? rawAvatar
      : null;

  // 已注册用户：昵称与登录名合并成一个字段（数据归属靠不可变的 user.id，改名不影响任何数据）
  if (!isGuestUser(user)) {
    if (name && name !== user.username) {
      if (name.length < 2 || name.length > 20) {
        return { ok: false as const, error: "昵称需要 2-20 个字符。" };
      }
      if (isAdminUsername(user.username)) {
        return { ok: false as const, error: "管理员账号名不能修改。" };
      }
      const taken = await prisma.user.findFirst({
        where: { username: name, NOT: { id: user.id } },
        select: { id: true },
      });
      if (taken) {
        return { ok: false as const, error: "这个名字已经被占用了，换一个。" };
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { username: name, displayName: null, avatarUrl },
      });
      revalidatePath("/", "layout");
      return { ok: true as const };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { displayName: null, avatarUrl },
    });
    revalidatePath("/", "layout");
    return { ok: true as const };
  }

  // 游客：只能改显示昵称。账号名保持 guest_ 前缀，否则会破坏游客识别与"注册保存"流程
  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: name.slice(0, 24) || null,
      avatarUrl,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/**
 * 新手引导进度（1 / 2 / 3 / done）。
 * 客户端会在切换步骤时调用，失败不影响使用。
 */
export async function setFirstRunTourStep(step: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const allowed = new Set(["1", "2", "3", "done"]);
  await persistFirstRunTourStep(user.id, allowed.has(step) ? step : "done");
  return { ok: true };
}

export async function skipOnboarding(_formData?: FormData) {
  void _formData;
  const user = await requireUser();
  await setOnboardingCompleted(user.id, true);
  await persistFirstRunTourStep(user.id, "1");
  await recordUsageEvent({ userId: user.id, event: "onboarding_skipped" });
  revalidatePath("/");
  redirect("/");
}

export async function planOnboarding(idea: string): Promise<FirstRunPlanResult> {
  const user = await requireUser();
  const content = idea.trim();
  if (!content) {
    return {
      projectName: "第一个项目",
      objective: "把第一个想法变成可推进的个人项目",
      milestone: "开始推进",
      taskTitle: "写下今天可以推进的一个具体动作",
      taskShortTitle: "写下具体动作",
      taskExecutionMode: "quick",
      taskDoneWhen: "写下今天能马上开始的一个具体动作",
      taskMethodHint: "先写成一个 30 分钟内能完成的具体动作，再判断它是否真的能推进。",
      taskRecommendation: "先写成一个 30 分钟内能完成的具体动作，再判断它是否真的能推进。",
      taskExecutionSteps: ["写下今天能马上开始的那个具体动作"],
      taskFallback: "",
      taskMaxTurns: 1,
      taskToolPolicy: "none",
      usedFallback: true,
    };
  }

  return withAiQuota("onboarding_plan", () => generateFirstRunPlan(content), user.id);
}

export async function clarifyOnboarding(
  idea: string,
): Promise<InboxClarification> {
  const user = await requireUser();
  const content = idea.trim();
  if (!content) {
    return { dimensions: [], supplementPlaceholder: "" };
  }

  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    userId: user.id,
  });

  return withAiQuota("onboarding_clarify", () =>
    generateSocraticClarification({
      content,
      history: [],
      projectContext: aiContext.projectFacts,
      memorySummary: aiContext.summary,
      evidence: aiContext.evidence,
      decisionMemory: aiContext.decisionMemory,
      maxQuestions: 4,
      minQuestions: 2,
    }),
    user.id
  );
}

export async function recordPageView(page: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await recordUsageEvent({ userId: user.id, event: "page_view", page });
}

export async function submitProductFeedback(formData: FormData) {
  const user = await requireUser();
  const message = String(formData.get("message") ?? "").trim().slice(0, 1200);
  const page = String(formData.get("page") ?? "").trim().slice(0, 200);

  if (!message) {
    return { ok: false as const, error: "写一句再送出" };
  }

  try {
    await prisma.usageEvent.create({
      data: {
        userId: user.id,
        event: "product_feedback",
        page: page || null,
        detail: message,
        metadata: JSON.stringify({ version: "v3.5" }),
      },
    });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "没送出去，再试一次" };
  }
}


export async function recordSignupEvent(kind: string) {
  const user = await requireUser();
  await recordUsageEvent({
    userId: user.id,
    event: kind === "guest_start" ? "guest_start" : "register",
  });
}

export async function logoutUser() {
  await destroyUserSession();
  redirect("/landing");
}

export async function getTaskEditSuggestion(input: {
  taskId?: string;
  title: string;
  shortTitle?: string | null;
  notes?: string | null;
  priority?: string;
  scheduledDate?: string | null;
  dueDate?: string | null;
  focusDate?: string | null;
  idea: string;
}): Promise<TaskEditSuggestion> {
  const user = await requireUser();
  // 实现收在 src/lib/ai-edit-suggestions.ts，小程序走同一个函数。
  return buildTaskEditSuggestion(input, user.id);
}

export async function ensureTaskShortTitle(input: {
  taskId: string;
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
}): Promise<TaskShortTitleSuggestion> {
  const user = await requireUser();
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, userId: user.id },
    select: {
      id: true,
      title: true,
      shortTitle: true,
      notes: true,
      status: true,
      project: { select: { name: true } },
    },
  });

  if (!task) return { shortTitle: input.title };
  if (task.shortTitle?.trim()) return { shortTitle: task.shortTitle };

  const suggestion = await withAiQuota("task_short_title", () =>
    generateTaskShortTitle({
      title: task.title,
      notes: task.notes,
      projectName: task.project?.name ?? input.projectName,
      status: task.status,
    }),
    user.id
  );

  await prisma.task.update({
    where: { id: task.id, userId: user.id },
    data: { shortTitle: suggestion.shortTitle },
  });
  revalidatePath("/");
  revalidatePath("/workspace");

  return suggestion;
}



export async function createTaskStickyNote(input: {
  taskId: string;
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  message: string;
}): Promise<TaskStickyNoteData> {
  const user = await requireUser();
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, userId: user.id },
    select: {
      id: true,
      executionMode: true,
      doneWhen: true,
      methodHint: true,
      project: { select: { mode: true } },
    },
  });

  if (!task) throw new Error("任务不存在或无权访问");
  const previousNotes = await prisma.taskStickyNote.findMany({
    where: { userId: user.id, taskId: input.taskId },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  const previousStickyNotes = previousNotes.map((note) => {
    const serialized = serializeTaskStickyNote(note);
    return {
      sourceMessage: serialized.sourceMessage,
      title: serialized.title,
      steps: serialized.steps,
      nextStep: serialized.nextStep,
    };
  });

  const aiContext = await buildAiContext({
    kind: "task_coach",
    taskId: input.taskId,
    userId: user.id,
  });
  const advice = await withAiQuota("task_coach", () =>
    generateTaskCoachAdvice(
      {
        ...input,
        projectMode: task.project?.mode ?? null,
        executionMode: task.executionMode,
        doneWhen: task.doneWhen,
        methodHint: task.methodHint,
        previousStickyNotes,
      },
      aiContext.summary,
      aiContext.evidence,
    ),
    user.id
  );
  const sticky = stickyPayloadFromDecisionCard(
    decisionCardFromAdvice(
      advice,
      routeDecisionKind({ message: input.message, mode: "coach" }),
    ),
  );
  const note = await prisma.taskStickyNote.create({
    data: {
      userId: user.id,
      taskId: input.taskId,
      sourceMessage: input.message,
      title: sticky.title,
      encouragement: sticky.encouragement,
      stepsJson: JSON.stringify(sticky.steps),
      nextStep: sticky.nextStep,
    },
  });
  const overflowNotes = await prisma.taskStickyNote.findMany({
    where: { userId: user.id, taskId: input.taskId, id: { not: note.id } },
    orderBy: { createdAt: "desc" },
    skip: 9,
    select: { id: true },
  });
  if (overflowNotes.length) {
    await prisma.taskStickyNote.deleteMany({
      where: { id: { in: overflowNotes.map((item) => item.id) } },
    });
  }

  revalidatePath("/");
  revalidatePath("/workspace");
  return serializeTaskStickyNote(note);
}


export async function ignoreInboxItem(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;
  const user = await requireUser();

  const item = await prisma.inboxItem.findUnique({
    where: { id, userId: user.id },
    select: {
      status: true,
      aiSuggestionJson: true,
      aiPlanJson: true,
    },
  });

  if (!item || item.status !== "inbox") return;

  await prisma.inboxItem.update({
    where: { id, userId: user.id },
    data: {
      status: "ignored",
      category: "ignore",
      processedAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/workspace");

  // 反馈记录不能反过来阻断用户的忽略操作。
  after(async () => {
    try {
      invalidateAiContext(user.id);

  await prisma.aiPlanFeedback.create({
        data: {
          userId: user.id,
          inboxItemId: id,
          action: "ignored",
          planJson: item.aiPlanJson ?? item.aiSuggestionJson ?? "{}",
        },
      });
    } catch {
      // Ignore analytics failure.
    }

    try {
      await recordAiFeedback({
        userId: user.id,
        source: "inbox_plan",
        action: "plan_ignored",
        inboxItemId: id,
        beforeJson: item.aiPlanJson ?? item.aiSuggestionJson ?? "{}",
      });
    } catch {
      // Ignore analytics failure.
    }
  });
}

export async function confirmInboxPlan(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;
  const user = await requireUser();

  const item = await prisma.inboxItem.findUnique({
    where: { id, userId: user.id },
  });

  if (!item || item.status !== "inbox" || !item.aiPlanJson) return;

  const plan = parseInboxPlan(item);
  if (!plan) return;

  if (plan.action === "answer" || plan.responseMode === "answer") {
    await prisma.inboxItem.update({
      where: { id: item.id, userId: user.id },
      data: {
        status: "processed",
        processedAt: new Date(),
        confirmedAt: new Date(),
      },
    });
    return {
      ok: true as const,
      projectId: null,
      attachedTaskId: null,
      showProjectHint: false,
      directAnswer: plan.directAnswer ?? "",
    };
  }

  if (plan.action === "ignore" || !plan.tasks.length) return;

  const projectName = text(formData, "projectName") ?? plan.projectName;
  const projectObjective =
    text(formData, "projectObjective") ?? plan.projectObjective;
  const projectMilestone =
    text(formData, "projectMilestone") ?? plan.projectMilestone;
  const tasks = plan.tasks.map((plannedTask, index) => ({
    title: text(formData, `tasks[${index}].title`) ?? plannedTask.title,
    shortTitle:
      text(formData, `tasks[${index}].shortTitle`) ?? plannedTask.shortTitle,
    notes: text(formData, `tasks[${index}].notes`) ?? plannedTask.notes,
    executionMode:
      text(formData, `tasks[${index}].executionMode`) ??
      plannedTask.executionMode,
    doneWhen:
      text(formData, `tasks[${index}].doneWhen`) ?? plannedTask.doneWhen,
    methodHint:
      text(formData, `tasks[${index}].methodHint`) ?? plannedTask.methodHint,
    recommendation:
      text(formData, `tasks[${index}].recommendation`) ??
      plannedTask.recommendation,
    executionSteps: linesOr(
      text(formData, `tasks[${index}].executionSteps`),
      plannedTask.executionSteps,
    ),
    fallback:
      text(formData, `tasks[${index}].fallback`) ?? plannedTask.fallback,
    maxTurns: plannedTask.maxTurns,
    toolPolicy: plannedTask.toolPolicy,
    priority: priority(
      String(
        formData.get(`tasks[${index}].priority`) ?? plannedTask.priority,
      ),
    ),
    scheduledDate:
      dateInput(formData, `tasks[${index}].scheduledDate`) ??
      dateString(plannedTask.scheduledDate),
    dueDate:
      dateInput(formData, `tasks[${index}].dueDate`) ??
      dateString(plannedTask.dueDate),
    trackName: plannedTask.trackName ?? null,
  }));
  const firstTask = tasks[0];
  const [existingProjectCount, existingTaskCount] = await Promise.all([
    prisma.project.count({ where: { userId: user.id } }),
    prisma.task.count({ where: { userId: user.id } }),
  ]);
  const showProjectHint =
    existingProjectCount === 0 || existingTaskCount === 0;
  const confirmedTasksJson = JSON.stringify(
    tasks.map((task) => ({
      title: task.title,
      shortTitle: task.shortTitle,
      notes: task.notes,
      executionMode: task.executionMode,
      methodHint: task.methodHint,
      recommendation: task.recommendation,
      executionSteps: task.executionSteps,
      fallback: task.fallback,
      priority: task.priority,
      scheduledDate: task.scheduledDate
        ? toDateInputValue(task.scheduledDate)
        : null,
      dueDate: task.dueDate ? toDateInputValue(task.dueDate) : null,
    })),
  );
  const edited = confirmedTasksJson !== JSON.stringify(plan.tasks);
  let confirmedProjectId: string | null = item.projectId;
  let attachedTaskId: string | null = null;

  await withTransactionRetry(async (tx) => {
    const projectId = await ensureInboxProject(tx, {
      userId: user.id,
      inboxItemId: item.id,
      content: item.content,
      projectId: item.projectId,
      projectName,
      projectObjective,
      projectMilestone,
      // 只有计划明确说"归入已有项目"时才允许按名字复用，否则一律新建。
      reuseExistingProject: plan.action === "existing_project",
      fallbackTaskTitle: firstTask.title,
      fallbackTaskShortTitle: firstTask.shortTitle,
      fallbackDoneWhen: firstTask.doneWhen,
      // 首页选的模式（智能则用模型判断结果）在这里落到项目上。
      mode: plan.mode ?? item.mode,
    });

    const project = await tx.project.findUnique({
      where: { id: projectId, userId: user.id },
      select: { mode: true, objective: true },
    });
    await ensureCurrentProjectStage(tx, {
      userId: user.id,
      projectId,
      mode: project?.mode ?? "normal",
      milestone: projectMilestone,
      objective: projectObjective ?? project?.objective,
    });
    // 探索模式落线路图；其他模式 plan.tracks 为空，不会建线。
    const trackMap = await ensureProjectTracks(tx, {
      userId: user.id,
      projectId,
      tracks:
        (project?.mode ?? plan.mode) === "explore" ? plan.tracks ?? [] : [],
    });
    const stage = await tx.projectStage.findFirst({
      where: {
        userId: user.id,
        projectId,
        status: { in: ["active", "ready"] },
      },
      orderBy: [{ order: "desc" }, { id: "asc" }],
      select: { id: true },
    });

    const openTasks = await tx.task.findMany({
      where: {
        userId: user.id,
        projectId,
        status: { in: [...OPEN_TASK_STATUSES] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, notes: true },
    });
    const shouldCreateNewBatch =
      openTasks.length === 0 || plan.taskDisposition !== "attach";
    const createCount = shouldCreateNewBatch ? tasks.length : 0;
    const tasksToCreate = tasks.slice(0, createCount);
    const tasksToAttach = tasks.slice(createCount);
    let anchorTaskId = openTasks[0]?.id ?? null;
    let anchorTaskNotes = openTasks[0]?.notes ?? null;

    for (const [index, plannedTask] of tasksToCreate.entries()) {
      const created = await tx.task.create({
        data: {
          userId: user.id,
          title: plannedTask.title,
          shortTitle: plannedTask.shortTitle,
          notes: plannedTask.notes,
          projectId,
          stageId: stage?.id ?? null,
          trackId: plannedTask.trackName
            ? trackMap.get(plannedTask.trackName) ?? null
            : null,
          priority: plannedTask.priority,
          scheduledDate: plannedTask.scheduledDate,
          dueDate: plannedTask.dueDate,
          planOrder: index,
          inboxItemId: item.id,
          ...taskContractData({
            title: plannedTask.title,
            notes: plannedTask.notes,
            executionMode: plannedTask.executionMode,
            doneWhen: plannedTask.doneWhen,
            methodHint: plannedTask.methodHint,
            maxTurns: plannedTask.maxTurns,
            toolPolicy: plannedTask.toolPolicy,
          }),
        },
        select: { id: true },
      });
      const sticky = stickyPayloadFromDecisionCard(
        decisionCardFromTask(plannedTask),
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
        anchorTaskNotes = plannedTask.notes;
      }
    }

    if (anchorTaskId && tasksToAttach.length) {
      let mergedNotes = anchorTaskNotes;
      for (const plannedTask of tasksToAttach) {
        mergedNotes = appendTaskContinuation(
          mergedNotes,
          plannedTask.title,
          plannedTask.notes,
        );
      }
      await tx.task.update({
        where: { id: anchorTaskId, userId: user.id },
        data: { notes: mergedNotes },
      });
      attachedTaskId = anchorTaskId;
    }

    await syncProjectStageGate(tx, { userId: user.id, projectId });

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
      planJson: item.aiPlanJson,
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
      ? "新想法并入当前任务"
      : edited
        ? "用户编辑 AI 计划后确认"
        : "用户直接确认 AI 计划",
  });
  await recordUsageEvent({
    userId: user.id,
    event: attachedTaskId ? "plan_attached" : "task_created",
    detail: "inbox_plan",
  });

  revalidatePath("/");
  revalidatePath("/files");
  revalidatePath("/workspace");

  return {
    ok: true as const,
    projectId: confirmedProjectId,
    attachedTaskId,
    showProjectHint,
  };
}

export async function generateTodaySuggestion(
  _prevState: TodaySuggestion[],
  _formData: FormData,
) {
  void _prevState;
  void _formData;
  const user = await requireUser();

  // 今日推荐只在 src/lib/today-focus-generate.ts 里实现，小程序走同一个函数。
  const suggestions = await generateTodayFocus(user.id);
  revalidatePath("/");
  return suggestions;
}

export async function getUserPreferences() {
  const user = await requireUser();
  return prisma.userPreference.findMany({
    where: { userId: user.id },
    select: { key: true, value: true },
    orderBy: { key: "asc" },
  });
}

export async function saveUserPreferences(formData: FormData) {
  const user = await requireUser();
  const preferenceKeys = [
    "plan_scale",
    "default_start_action",
    "avoid_overdue",
    "project_focus",
  ] as const;

  await prisma.$transaction(
    preferenceKeys.map((key) => {
      const value = String(formData.get(key) ?? "").trim();
      if (!value) {
        return prisma.userPreference.deleteMany({
          where: { key, source: "manual", userId: user.id },
        });
      }
      return prisma.userPreference.upsert({
        where: {
          userId_key_source: {
            userId: user.id,
            key,
            source: "manual",
          },
        },
        update: { value },
        create: {
          userId: user.id,
          key,
          value,
          source: "manual",
        },
      });
    }),
  );

  revalidatePath("/");
}


export async function recordEditSuggestionApplied(input: {
  source: "task_edit" | "project_edit";
  taskId?: string;
  projectId?: string;
  beforeJson?: string;
  afterJson?: string;
  detail?: string;
}) {
  const user = await requireUser();
  await recordAiFeedback({
    userId: user.id,
    source: input.source,
    action: "suggestion_applied",
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    beforeJson: input.beforeJson ?? null,
    afterJson: input.afterJson ?? null,
    detail: input.detail ?? null,
  });
}







export async function confirmStagePreviewAction(formData: FormData) {
  const user = await requireUser();
  const stageId = text(formData, "stageId");
  if (!stageId) return;

  // 阶段推进只在 src/lib/project-stage-advance.ts 里实现，小程序走同一个函数。
  const result = await advanceProjectStage({ userId: user.id, stageId });

  // 新阶段的「下一阶段」预览放到响应之后生成：点「进入下一阶段」应该立刻进去，
  // 不该等一次模型调用；等用户看页面的时间，这份预览已经在后台备好了。
  if (result.nextStageId) {
    const nextStageId = result.nextStageId;
    after(() =>
      generateLongtermStagePreview({
        userId: user.id,
        stageId: nextStageId,
      }).catch(() => {}),
    );
  }

  if (result.advanced) {
    invalidateAiContext(user.id);
    revalidatePath("/");
    revalidatePath("/files");
    revalidatePath("/workspace");
  }
}



/**
 * 长期项目当前阶段完成后，自动生成下一阶段预览。
 * 「从想变为做」的承接就在这里：做完一步不等于整件事结束，系统要接着给出下一步。
 */
function scheduleLongtermStagePreview(input: {
  userId: string;
  projectId: string | null;
  gate: { state: string } | null;
}) {
  if (!input.projectId || input.gate?.state !== "ready") return;
  const projectId = input.projectId;
  after(async () => {
    try {
      const stageId = await currentProjectStageId(prisma, {
        userId: input.userId,
        projectId,
      });
      if (!stageId) return;
      const stage = await prisma.projectStage.findFirst({
        where: { id: stageId, userId: input.userId },
        select: { nextStageJson: true },
      });
      if (!stage || stage.nextStageJson) return;
      await generateLongtermStagePreview({
        userId: input.userId,
        stageId,
      });
    } catch {
      // 预览生成失败不阻塞任务完成，用户进入项目时仍可手动生成
    }
  });
}


export async function updateTask(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const notes = text(formData, "notes");

  if (!id || !title) return;

  const existing = await prisma.task.findUnique({
    where: { id, userId: user.id },
    select: {
      title: true,
      shortTitle: true,
      status: true,
      priority: true,
      scheduledDate: true,
      dueDate: true,
      projectId: true,
      completedAt: true,
      reviewNextAction: { select: { id: true } },
    },
  });

  if (!existing) return;

  const status = taskStatus(String(formData.get("status") ?? "todo"));
  const priorityValue = priority(String(formData.get("priority") ?? "medium"));
  const projectId = await ownedProjectId(text(formData, "projectId"), user.id);
  const scheduledDate = dateInput(formData, "scheduledDate");
  const dueDate = dateInput(formData, "dueDate");
  const focusDate = dateInput(formData, "focusDate");
  const shortTitle =
    title === existing.title
      ? existing.shortTitle ?? shortTitleFromTitle(title)
      : shortTitleFromTitle(title);
  const completedAt =
    status === "done"
      ? new Date()
      : existing.status === "done"
        ? null
        : existing.completedAt;

  await prisma.task.update({
    where: { id, userId: user.id },
    data: {
      title,
      shortTitle,
      notes,
      projectId,
      status,
      priority: priorityValue,
      scheduledDate,
      dueDate,
      focusDate,
      completedAt,
      ...taskContractData({
        title,
        notes,
        executionMode: formData.get("executionMode"),
        doneWhen: formData.get("doneWhen"),
        methodHint: formData.get("methodHint"),
        maxTurns: formData.get("maxTurns"),
        toolPolicy: formData.get("toolPolicy"),
      }),
      completedBy:
        status === "done"
          ? existing.status === "done"
            ? undefined
            : "user"
          : null,
    },
  });

  const beforeJson = taskSnapshot(existing);
  const afterJson = taskSnapshot({
    title,
    status,
    priority: priorityValue,
    scheduledDate,
    dueDate,
    projectId,
  });
  if (status === "done" && existing.status !== "done") {
    await recordAiFeedback({
      userId: user.id,
      source: "task",
      action: "task_completed",
      taskId: id,
      projectId,
      beforeJson,
      afterJson,
    });
    await recordUsageEvent({
      userId: user.id,
      event: "task_completed",
      detail: id,
    });
  } else if (status === "cancelled" && existing.status !== "cancelled") {
    await recordAiFeedback({
      userId: user.id,
      source: "task",
      action: "task_cancelled",
      taskId: id,
      projectId,
      beforeJson,
      afterJson,
    });
  } else if (
    existing.dueDate &&
    dueDate &&
    dueDate.getTime() > existing.dueDate.getTime()
  ) {
    await recordAiFeedback({
      userId: user.id,
      source: "task",
      action: "task_delayed",
      taskId: id,
      projectId,
      beforeJson,
      afterJson,
      detail: "用户延后了任务截止日期",
    });
  }

  if (projectId) {
    const stageGate = await syncProjectStageGate(prisma, {
      userId: user.id,
      projectId,
    });
    scheduleLongtermStagePreview({
      userId: user.id,
      projectId,
      gate: stageGate,
    });
  }

  if (
    (status === "done" || status === "cancelled") &&
    existing.status !== status
  ) {
    after(() => advanceExploreAfterTask({ userId: user.id, taskId: id }));
  }

  if (existing.reviewNextAction?.id) {
    await prisma.reviewNextAction.update({
      where: { id: existing.reviewNextAction.id, userId: user.id },
      data: {
        status:
          status === "done"
            ? "done"
            : status === "cancelled"
              ? "cancelled"
              : "pending",
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/workspace");

  const returnTo = taskReturnTo(text(formData, "returnTo"));
  if (returnTo) redirect(returnTo);
}

export async function setTaskStatus(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "id");
  const status = taskStatus(String(formData.get("status") ?? "todo"));
  if (!id) return;

  // 任务状态变更的唯一实现在 src/lib/task-status.ts，小程序走同一个函数。
  await applyTaskStatus({ userId: user.id, taskId: id, status });
  revalidatePath("/");
  revalidatePath("/files");
  revalidatePath("/workspace");
}



