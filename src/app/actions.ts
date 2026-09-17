"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type {
  Priority,
  ProjectStatus,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdminUsername } from "@/lib/admin";
import {
  createUserSession,
  destroyUserSession,
  getCurrentUser,
  hashPassword,
  isGuestUser,
  requireUser,
  verifyPassword,
} from "@/lib/auth";
import { endOfDay, startOfDay, toDateInputValue } from "@/lib/date";
import { buildAiContext } from "@/lib/ai-context";
import { createInboxClarification, createInboxPlan } from "@/lib/inbox-ai";
import { createReviewDraft } from "@/lib/review-ai";
import { recordAiFeedback } from "@/lib/feedback";
import { recordUsageEvent } from "@/lib/usage";
import { isAiQuotaEnabled, withAiQuota } from "@/lib/ai-quota";
import {
  isOnboardingCompleted,
  setOnboardingCompleted,
} from "@/lib/onboarding";
import {
  isFirstPlanGroupComplete,
  setFirstRunTourStep as persistFirstRunTourStep,
} from "@/lib/first-run";
import {
  serializeTaskStickyNote,
  type TaskStickyNoteData,
} from "@/lib/task-sticky";
import { buildTaskContract } from "@/lib/task-contract";
import {
  clarifyInbox,
  generateFirstRunPlan,
  generateTaskCoachAdvice,
  generateTaskEditSuggestion,
  generateTaskShortTitle,
  generateProjectEditSuggestion,
  planInbox,
  suggestTodayFocus,
  type FirstRunPlanResult,
  type InboxClarification,
  type InboxPlan,
  type TaskEditSuggestion,
  type TaskCoachAdvice,
  type TaskShortTitleSuggestion,
  type ProjectEditSuggestion,
  type TodaySuggestion,
} from "@/lib/ai";

const projectStatuses: ProjectStatus[] = [
  "active",
  "paused",
  "completed",
  "archived",
];

const taskStatuses: TaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "cancelled",
];

const priorities: Priority[] = ["low", "medium", "high", "urgent"];

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function clientAiOverrides(formData: FormData) {
  if (isAiQuotaEnabled()) {
    return {
      apiKey: undefined,
      model: undefined,
      baseUrl: undefined,
    };
  }

  return {
    apiKey: String(formData.get("apiKey") ?? "").trim() || undefined,
    model: undefined,
    baseUrl: undefined,
  };
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

function projectStatus(value: string): ProjectStatus {
  return projectStatuses.includes(value as ProjectStatus)
    ? (value as ProjectStatus)
    : "active";
}

function taskStatus(value: string): TaskStatus {
  return taskStatuses.includes(value as TaskStatus)
    ? (value as TaskStatus)
    : "todo";
}

const TASK_EXECUTION_MODES = [
  "quick",
  "tool",
  "produce",
  "explore",
  "project",
] as const;
const TASK_TOOL_POLICIES = ["none", "read", "confirm-write"] as const;

/**
 * 把「任务要怎么做」这层合同统一落到数据库字段上。
 * 优先使用 AI / 表单给出的值，缺失时按标题与备注重新推断，保证旧入口也有契约。
 */
function taskContractData(input: {
  title: string;
  notes?: string | null;
  executionMode?: FormDataEntryValue | null;
  doneWhen?: FormDataEntryValue | null;
  maxTurns?: FormDataEntryValue | number | null;
  toolPolicy?: FormDataEntryValue | null;
}) {
  const inferred = buildTaskContract(
    `${input.title} ${input.notes ?? ""}`.trim(),
    input.title,
  );
  const rawMode = typeof input.executionMode === "string" ? input.executionMode : "";
  const rawPolicy = typeof input.toolPolicy === "string" ? input.toolPolicy : "";
  const rawDoneWhen = typeof input.doneWhen === "string" ? input.doneWhen.trim() : "";
  const rawMaxTurns = Number(
    typeof input.maxTurns === "string" || typeof input.maxTurns === "number"
      ? input.maxTurns
      : Number.NaN,
  );

  return {
    executionMode: (TASK_EXECUTION_MODES as readonly string[]).includes(rawMode)
      ? rawMode
      : inferred.executionMode,
    doneWhen: rawDoneWhen || inferred.doneWhen,
    maxTurns:
      Number.isFinite(rawMaxTurns) && rawMaxTurns > 0
        ? Math.min(Math.floor(rawMaxTurns), 5)
        : inferred.maxTurns,
    toolPolicy: (TASK_TOOL_POLICIES as readonly string[]).includes(rawPolicy)
      ? rawPolicy
      : inferred.toolPolicy,
  };
}

function priority(value: string): Priority {
  return priorities.includes(value as Priority)
    ? (value as Priority)
    : "medium";
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

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function safeNext(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/";
}

async function ownedProjectId(projectId: string | null, userId: string) {
  if (!projectId) return null;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  return project?.id ?? null;
}

export async function registerUser(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (
    username.length < 2 ||
    username.length > 20 ||
    password.length < 6
  ) {
    redirect(`/login?error=register&next=${encodeURIComponent(next)}`);
  }

  let user: { id: string } | null = null;
  try {
    user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true, passwordHash: true },
    });
    if (existing && verifyPassword(password, existing.passwordHash)) {
      await createUserSession(existing.id);
      after(() => recordUsageEvent({ userId: existing.id, event: "login" }));
      redirect(next);
    }
    redirect(`/login?error=register&next=${encodeURIComponent(next)}`);
  }

  await createUserSession(user.id);
  redirect("/welcome?signup=register");
}

export async function startGuestExperience() {
  const current = await getCurrentUser();
  if (current) redirect("/welcome");

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
  redirect("/welcome?guest=1&signup=guest");
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

  if (!projectName || !objective || !taskTitle) return;

  const taskContract = taskContractData({
    title: taskTitle,
    notes: objective,
    executionMode: formData.get("taskExecutionMode"),
    doneWhen: formData.get("taskDoneWhen"),
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

  await prisma.task.create({
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

  const allowed = new Set(["1", "2", "3", "4", "done"]);
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
  await requireUser();
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
      taskMaxTurns: 1,
      taskToolPolicy: "none",
      usedFallback: true,
    };
  }

  return withAiQuota("onboarding_plan", () => generateFirstRunPlan(content));
}

export async function clarifyOnboarding(
  idea: string,
): Promise<InboxClarification> {
  await requireUser();
  const content = idea.trim();
  if (!content) {
    return { dimensions: [], supplementPlaceholder: "" };
  }

  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    userId: (await requireUser()).id,
  });

  return withAiQuota("onboarding_clarify", () =>
    clarifyInbox(
      content,
      [],
      undefined,
      undefined,
      undefined,
      [],
      aiContext.summary,
      aiContext.evidence,
    ),
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
        metadata: JSON.stringify({ version: "v2.5" }),
      },
    });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "没送出去，再试一次" };
  }
}

export async function loginUser(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (
    username.length < 2 ||
    username.length > 20 ||
    password.length < 6
  ) {
    redirect(`/login?error=login&next=${encodeURIComponent(next)}`);
  }

  let created: { id: string } | null = null;
  try {
    created = await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true, passwordHash: true },
    });
    if (!existing || !verifyPassword(password, existing.passwordHash)) {
      redirect(`/login?error=login&next=${encodeURIComponent(next)}`);
    }

    await createUserSession(existing.id);
    after(() => recordUsageEvent({ userId: existing.id, event: "login" }));
    redirect(next);
  }

  await createUserSession(created.id);
  redirect("/welcome?signup=register");
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

export async function addInboxItem(formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();

  if (!content) return;
  const user = await requireUser();

  await prisma.inboxItem.create({
    data: {
      userId: user.id,
      content,
      source: "manual",
    },
  });

  await recordUsageEvent({
    userId: user.id,
    event: "task_created",
    detail: "manual",
  });
  revalidatePath("/");
  revalidatePath("/workspace");
}

export async function addInboxItemAndClarify(formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  const user = await requireUser();
  const { apiKey, model, baseUrl } = clientAiOverrides(formData);
  return createInboxClarification({
    userId: user.id,
    content,
    overrides: { apiKey, model, baseUrl },
  });
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
  const aiContext = await buildAiContext({
    kind: "task_edit",
    taskId: input.taskId,
    userId: user.id,
  });
  const { taskId: _taskId, ...suggestionInput } = input;
  void _taskId;
  return withAiQuota("task_edit", () =>
    generateTaskEditSuggestion(
      suggestionInput,
      aiContext.summary,
      aiContext.evidence,
    ),
  );
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
  );

  await prisma.task.update({
    where: { id: task.id, userId: user.id },
    data: { shortTitle: suggestion.shortTitle },
  });
  revalidatePath("/");
  revalidatePath("/workspace");

  return suggestion;
}

export async function getProjectEditSuggestion(input: {
  projectId?: string;
  name: string;
  objective: string;
  currentMilestone?: string | null;
  status?: string;
  notes?: string | null;
  idea: string;
}): Promise<ProjectEditSuggestion> {
  const user = await requireUser();
  const aiContext = await buildAiContext({
    kind: "project_edit",
    projectId: input.projectId,
    userId: user.id,
  });
  const { projectId: _projectId, ...suggestionInput } = input;
  void _projectId;
  return withAiQuota("project_edit", () =>
    generateProjectEditSuggestion(
      suggestionInput,
      aiContext.summary,
      aiContext.evidence,
    ),
  );
}

export async function getTaskCoachAdvice(input: {
  taskId?: string;
  title: string;
  notes?: string | null;
  projectName?: string | null;
  status?: string;
  message: string;
}): Promise<TaskCoachAdvice> {
  const user = await requireUser();
  const aiContext = await buildAiContext({
    kind: "task_coach",
    taskId: input.taskId,
    userId: user.id,
  });
  return withAiQuota("task_coach", () =>
    generateTaskCoachAdvice(
      input,
      aiContext.summary,
      aiContext.evidence,
    ),
  );
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
    select: { id: true },
  });

  if (!task) throw new Error("任务不存在或无权访问");

  const aiContext = await buildAiContext({
    kind: "task_coach",
    taskId: input.taskId,
    userId: user.id,
  });
  const advice = await withAiQuota("task_coach", () =>
    generateTaskCoachAdvice(
      input,
      aiContext.summary,
      aiContext.evidence,
    ),
  );
  const note = await prisma.taskStickyNote.create({
    data: {
      userId: user.id,
      taskId: input.taskId,
      sourceMessage: input.message,
      title: advice.title,
      encouragement: advice.encouragement,
      stepsJson: JSON.stringify(advice.steps),
      nextStep: advice.nextStep,
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

export async function deleteTaskStickyNote(noteId: string) {
  const user = await requireUser();
  const deleted = await prisma.taskStickyNote.deleteMany({
    where: { id: noteId, userId: user.id },
  });

  revalidatePath("/");
  revalidatePath("/workspace");
  return { ok: deleted.count > 0 };
}

export async function addInboxItemAndPlan(formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  const user = await requireUser();
  const { apiKey, model, baseUrl } = clientAiOverrides(formData);

  const item = await prisma.inboxItem.create({
    data: {
      userId: user.id,
      content,
      source: "manual",
    },
  });

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    select: {
      name: true,
      objective: true,
      currentMilestone: true,
    },
    orderBy: { name: "asc" },
  });
  const projectContext = projects.map((project) => ({
    name: project.name,
    objective: project.objective,
    currentMilestone: project.currentMilestone,
  }));
  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    inboxItemId: item.id,
    userId: user.id,
  });
  const plan = await withAiQuota("inbox_plan", () =>
    planInbox(
      content,
      projects.map((project) => project.name),
      apiKey,
      model,
      baseUrl,
      undefined,
      undefined,
      projectContext,
      aiContext.summary,
      undefined,
      aiContext.evidence,
      aiContext.maxPlanTasks,
    ),
  );

  await prisma.inboxItem.update({
    where: { id: item.id, userId: user.id },
    data: {
      aiPlanJson: JSON.stringify(plan),
      aiAnalyzedAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/workspace");
}

export async function convertInboxItemToTask(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;
  const user = await requireUser();

  const item = await prisma.inboxItem.findUnique({
    where: { id, userId: user.id },
  });

  if (!item || item.status !== "inbox") return;

  const title = item.title ?? item.content;
  const projectId = await ownedProjectId(text(formData, "projectId"), user.id);
  const priorityValue = priority(String(formData.get("priority") ?? "medium"));
  const dueDate = dateInput(formData, "dueDate");

  await prisma.$transaction([
    prisma.inboxItem.update({
      where: { id, userId: user.id },
      data: {
        status: "processed",
        category: "task",
        title,
        projectId,
        priority: priorityValue,
        dueDate,
        processedAt: new Date(),
      },
    }),
    prisma.task.create({
      data: {
        userId: user.id,
        title,
        notes: title === item.content ? null : item.content,
        projectId,
        priority: priorityValue,
        dueDate,
        planOrder: 0,
        inboxItemId: id,
        ...taskContractData({
          title,
          notes: title === item.content ? null : item.content,
        }),
      },
    }),
  ]);

  await recordUsageEvent({
    userId: user.id,
    event: "task_created",
    detail: "inbox",
  });
  revalidatePath("/");
  revalidatePath("/workspace");
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

  await prisma.aiPlanFeedback.create({
    data: {
      userId: user.id,
      inboxItemId: id,
      action: "ignored",
      planJson:
        item.aiPlanJson ?? item.aiSuggestionJson ?? "{}",
    },
  });
  await recordAiFeedback({
    userId: user.id,
    source: "inbox_plan",
    action: "plan_ignored",
    inboxItemId: id,
    beforeJson: item.aiPlanJson ?? item.aiSuggestionJson ?? "{}",
  });

  revalidatePath("/");
  revalidatePath("/workspace");
}

export async function suggestInboxItem(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;
  const user = await requireUser();
  const { apiKey, model, baseUrl } = clientAiOverrides(formData);

  const item = await prisma.inboxItem.findUnique({
    where: { id, userId: user.id },
    select: { id: true, content: true, status: true },
  });

  if (!item || item.status !== "inbox") return;

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    select: {
      name: true,
      objective: true,
      currentMilestone: true,
    },
    orderBy: { name: "asc" },
  });
  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    inboxItemId: id,
    userId: user.id,
  });
  const plan = await withAiQuota("inbox_plan", () =>
    planInbox(
      item.content,
      projects.map((project) => project.name),
      apiKey,
      model,
      baseUrl,
      undefined,
      undefined,
      projects.map((project) => ({
        name: project.name,
        objective: project.objective,
        currentMilestone: project.currentMilestone,
      })),
      aiContext.summary,
      undefined,
      aiContext.evidence,
      aiContext.maxPlanTasks,
    ),
  );

  await prisma.inboxItem.update({
    where: { id, userId: user.id },
    data: {
      aiPlanJson: JSON.stringify(plan),
      aiAnalyzedAt: new Date(),
    },
  });

  revalidatePath("/workspace");
}

export async function generateInboxPlan(formData: FormData) {
  const id = text(formData, "id");
  if (!id) return;
  const user = await requireUser();
  const option = text(formData, "option");
  const supplement = text(formData, "supplement");
  const dimensionChoices = [0, 1, 2, 3]
    .map((index) => text(formData, `choice_${index}`))
    .filter((choice): choice is string => Boolean(choice));
  const { apiKey, model, baseUrl } = clientAiOverrides(formData);
  return createInboxPlan({
    userId: user.id,
    itemId: id,
    option: option ?? undefined,
    supplement: supplement ?? undefined,
    dimensionChoices,
    overrides: { apiKey, model, baseUrl },
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
  if (!plan || plan.action === "ignore" || !plan.tasks.length) return;

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
  }));
  const confirmedTasksJson = JSON.stringify(
    tasks.map((task) => ({
      title: task.title,
      shortTitle: task.shortTitle,
      notes: task.notes,
      priority: task.priority,
      scheduledDate: task.scheduledDate
        ? toDateInputValue(task.scheduledDate)
        : null,
      dueDate: task.dueDate ? toDateInputValue(task.dueDate) : null,
    })),
  );
  const edited = confirmedTasksJson !== JSON.stringify(plan.tasks);
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
    for (const [index, plannedTask] of tasks.entries()) {
      await tx.task.create({
        data: {
          userId: user.id,
          title: plannedTask.title,
          shortTitle: plannedTask.shortTitle,
          notes: plannedTask.notes,
          projectId,
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
            maxTurns: plannedTask.maxTurns,
            toolPolicy: plannedTask.toolPolicy,
          }),
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
    detail: edited ? "用户编辑 AI 计划后确认" : "用户直接确认 AI 计划",
  });
  await recordUsageEvent({
    userId: user.id,
    event: "task_created",
    detail: "inbox_plan",
  });

}

export async function generateTodaySuggestion(
  _prevState: TodaySuggestion[],
  _formData: FormData,
) {
  void _prevState;
  void _formData;
  const user = await requireUser();

  const [tasks, latestReview, activeProjects] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId: user.id,
        status: { in: ["todo", "in_progress"] },
      },
      include: { project: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 50,
    }),
    prisma.review.findFirst({
      where: { userId: user.id },
      select: { summary: true },
      orderBy: { reviewDate: "desc" },
    }),
    prisma.project.findMany({
      where: { status: "active", userId: user.id },
      select: {
        name: true,
        objective: true,
        currentMilestone: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 10,
    }),
  ]);

  const aiContext = await buildAiContext({
    kind: "today_focus",
    userId: user.id,
  });
  const suggestions = await withAiQuota("today_focus", () =>
    suggestTodayFocus(
      tasks.map((task) => ({
        id: task.id,
        title: task.title,
        projectName: task.project?.name ?? null,
        priority: task.priority,
        dueDate: task.dueDate,
        scheduledDate: task.scheduledDate,
      })),
      {
        reviewSummary: latestReview?.summary ?? undefined,
        projects: activeProjects,
      },
      aiContext.summary,
      aiContext.evidence,
    ),
  );

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

export async function recordSuggestionFeedback(input: {
  source?: "today_suggestion" | "task_coach" | "review_draft";
  taskId?: string;
  action: "useful" | "useless";
  detail?: string;
}) {
  const user = await requireUser();
  if (!input.taskId && input.source !== "review_draft") return;
  if (input.action !== "useful" && input.action !== "useless") return;

  await recordAiFeedback({
    userId: user.id,
    source: input.source ?? "today_suggestion",
    action:
      input.action === "useful"
        ? "suggestion_useful"
        : "suggestion_useless",
    taskId: input.taskId ?? null,
    detail: input.detail ?? null,
  });
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

export async function generateReviewDraftAction(formData: FormData) {
  const user = await requireUser();
  const today = startOfDay();
  const reviewDate = dateInput(formData, "reviewDate") ?? today;
  const result = await createReviewDraft({
    userId: user.id,
    reviewDate,
  });
  redirect(`/review?date=${result.date}`);
}

async function syncReviewRelations(
  review: { id: string; reviewDate: Date },
  nextActions: Array<{ title: string; shortTitle: string }>,
  userId: string,
) {
  const dayStart = startOfDay(review.reviewDate);
  const dayEnd = endOfDay(review.reviewDate);

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      OR: [
        { completedAt: { gte: dayStart, lte: dayEnd } },
        { scheduledDate: { gte: dayStart, lte: dayEnd } },
        { focusDate: { gte: dayStart, lte: dayEnd } },
        { createdAt: { gte: dayStart, lte: dayEnd } },
      ],
    },
    include: {
      project: { select: { id: true, name: true, updatedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const projectStats = new Map<
    string,
    { id: string; name: string; count: number; updatedAt: Date }
  >();

  for (const task of tasks) {
    if (!task.project) continue;
    const current = projectStats.get(task.project.id);
    projectStats.set(task.project.id, {
      id: task.project.id,
      name: task.project.name,
      count: (current?.count ?? 0) + 1,
      updatedAt:
        current && current.updatedAt > task.project.updatedAt
          ? current.updatedAt
          : task.project.updatedAt,
    });
  }

  const projectCandidates = [...projectStats.values()].sort(
    (a, b) =>
      b.count - a.count || b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  const defaultProjectId = projectCandidates[0]?.id ?? null;

  function projectIdForNextAction(title: string) {
    const normalized = title.trim().toLowerCase();
    const namedProject = projectCandidates.find((project) => {
      const name = project.name.trim().toLowerCase();
      return name.length > 0 && normalized.includes(name);
    });
    return namedProject?.id ?? defaultProjectId;
  }

  for (const task of tasks) {
    await prisma.reviewTask.upsert({
      where: {
        reviewId_taskId: {
          reviewId: review.id,
          taskId: task.id,
        },
      },
      update: {
        titleAtReview: task.title,
        statusAtReview: task.status,
        priorityAtReview: task.priority,
        projectId: task.project?.id ?? null,
      },
      create: {
        userId,
        reviewId: review.id,
        taskId: task.id,
        titleAtReview: task.title,
        statusAtReview: task.status,
        priorityAtReview: task.priority,
        projectId: task.project?.id ?? null,
      },
    });
  }

  const existingActions = await prisma.reviewNextAction.findMany({
    where: { reviewId: review.id, userId },
    orderBy: { sortOrder: "asc" },
  });

  await prisma.$transaction(async (tx) => {
    for (const [index, action] of nextActions.entries()) {
      const { title, shortTitle } = action;
      const existing = existingActions[index];
      const projectId = projectIdForNextAction(title);
      if (existing) {
        await tx.reviewNextAction.update({
          where: { id: existing.id, userId },
          data: { title, status: "pending", sortOrder: index },
        });
        if (existing.taskId) {
          await tx.task.update({
            where: { id: existing.taskId, userId },
            data: {
              title,
              shortTitle,
              projectId,
              ...taskContractData({ title }),
            },
          });
        }
      } else {
        const scheduledDate = new Date(review.reviewDate);
        scheduledDate.setDate(scheduledDate.getDate() + 1);
        const task = await tx.task.create({
          data: {
            userId,
            title,
            shortTitle,
            projectId,
            priority: "medium",
            scheduledDate,
            ...taskContractData({ title }),
          },
        });
        await tx.reviewNextAction.create({
          data: {
            userId,
            reviewId: review.id,
            title,
            sortOrder: index,
            taskId: task.id,
          },
        });
      }
    }

    for (let index = nextActions.length; index < existingActions.length; index++) {
      const extra = existingActions[index];
      await tx.reviewNextAction.update({
        where: { id: extra.id, userId },
        data: { status: "cancelled" },
      });
    }
  });
}

export async function saveReview(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "id");
  const summary = text(formData, "summary");
  const rawNextActions = text(formData, "nextActions") ?? "";

  if (!id || !summary) return;

  const nextActionLines = rawNextActions
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^[-*]\s*/, "")
        .replace(/^\d+[.、)]\s*/, "")
        .trim(),
    )
    .filter(Boolean);
  const nextActions: Array<{ title: string; shortTitle: string }> = [];
  for (
    let index = 0;
    index < nextActionLines.length && nextActions.length < 3;
    index += 2
  ) {
    const shortTitle = nextActionLines[index].trim().slice(0, 80);
    const detail = (nextActionLines[index + 1] ?? shortTitle).trim().slice(0, 200);
    if (shortTitle) nextActions.push({ title: detail, shortTitle });
  }

  const review = await prisma.review.update({
    where: { id, userId: user.id },
    data: {
      summary,
      nextActions: nextActions
        .map((action) =>
          action.shortTitle !== action.title
            ? `${action.shortTitle}\n${action.title}`
            : action.shortTitle,
        )
        .join("\n"),
      status: "final",
    },
  });

  await syncReviewRelations(review, nextActions, user.id);
  await recordUsageEvent({ userId: user.id, event: "review_saved" });

  return { date: toDateInputValue(review.reviewDate) };
}

export async function createProject(formData: FormData) {
  const user = await requireUser();
  const name = text(formData, "name");
  const objective = text(formData, "objective");

  if (!name || !objective) return;

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name,
      objective,
      status: projectStatus(String(formData.get("status") ?? "active")),
      currentMilestone: text(formData, "currentMilestone"),
      notes: text(formData, "notes"),
    },
  });

  revalidatePath("/");
  revalidatePath("/workspace");
  redirect(`/workspace?project=${project.id}`);
}

export async function updateProject(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const objective = text(formData, "objective");

  if (!id || !name || !objective) return;

  await prisma.project.update({
    where: { id, userId: user.id },
    data: {
      name,
      objective,
      status: projectStatus(String(formData.get("status") ?? "active")),
      currentMilestone: text(formData, "currentMilestone"),
      notes: text(formData, "notes"),
    },
  });

  revalidatePath("/");
  revalidatePath("/workspace");
}

export async function deleteProject(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "id");

  if (!id) return;

  await prisma.project.delete({ where: { id, userId: user.id } });

  revalidatePath("/");
  revalidatePath("/workspace");
  redirect("/workspace");
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const title = text(formData, "title");
  const shortTitle = text(formData, "shortTitle");

  if (!title) return;

  const status = taskStatus(String(formData.get("status") ?? "todo"));
  const notes = text(formData, "notes");

  await prisma.task.create({
    data: {
      userId: user.id,
      title,
      shortTitle,
      notes,
      projectId: await ownedProjectId(text(formData, "projectId"), user.id),
      status,
      priority: priority(String(formData.get("priority") ?? "medium")),
      scheduledDate: dateInput(formData, "scheduledDate"),
      dueDate: dateInput(formData, "dueDate"),
      focusDate: dateInput(formData, "focusDate"),
      completedAt: status === "done" ? new Date() : null,
      ...taskContractData({
        title,
        notes,
        executionMode: formData.get("executionMode"),
        doneWhen: formData.get("doneWhen"),
        maxTurns: formData.get("maxTurns"),
        toolPolicy: formData.get("toolPolicy"),
      }),
    },
  });

  revalidatePath("/");
  revalidatePath("/workspace");

  const returnTo = taskReturnTo(text(formData, "returnTo"));
  if (returnTo) redirect(returnTo);
}

export async function updateTask(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const shortTitle = text(formData, "shortTitle");

  if (!id || !title) return;

  const existing = await prisma.task.findUnique({
    where: { id, userId: user.id },
    select: {
      title: true,
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
      notes: text(formData, "notes"),
      projectId,
      status,
      priority: priorityValue,
      scheduledDate,
      dueDate,
      focusDate,
      completedAt,
      ...(title === existing.title
        ? {}
        : taskContractData({
            title,
            notes: text(formData, "notes"),
            executionMode: formData.get("executionMode"),
            doneWhen: formData.get("doneWhen"),
            maxTurns: formData.get("maxTurns"),
            toolPolicy: formData.get("toolPolicy"),
          })),
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

  const transitionFilter =
    status === "done"
      ? { status: { not: "done" as const } }
      : status === "cancelled"
        ? { status: { not: "cancelled" as const } }
        : {};
  const updated = await prisma.task.updateManyAndReturn({
    where: { id, userId: user.id, ...transitionFilter },
    data: {
      status,
      completedAt: status === "done" ? new Date() : null,
      completedBy: status === "done" ? "user" : null,
    },
    select: {
      title: true,
      status: true,
      priority: true,
      scheduledDate: true,
      dueDate: true,
      projectId: true,
    },
  });

  if (!updated.length) return;

  let reviewHintEligible = false;
  if (status === "done" || status === "cancelled") {
    const [firstPlanGroupComplete, reviewCount] = await Promise.all([
      isFirstPlanGroupComplete(user.id),
      prisma.review.count({ where: { userId: user.id } }),
    ]);
    reviewHintEligible = firstPlanGroupComplete && reviewCount === 0;
  }

  const updatedTask = updated[0];
  const reviewNextStatus =
    status === "done"
      ? "done"
      : status === "cancelled"
        ? "cancelled"
        : "pending";

  // 状态按钮必须尽快返回。统计、偏好学习和复盘联动放到响应完成后执行，
  // 避免 Neon 的网络往返和整页重渲染阻塞用户操作。
  after(async () => {
    const backgroundTasks: Promise<unknown>[] = [
      prisma.reviewNextAction.updateMany({
        where: { taskId: id, userId: user.id },
        data: { status: reviewNextStatus },
      }),
    ];

    if (status === "done") {
      backgroundTasks.push(
        recordAiFeedback({
          userId: user.id,
          source: "task",
          action: "task_completed",
          taskId: id,
          projectId: updatedTask.projectId,
          afterJson: taskSnapshot(updatedTask),
        }),
        recordUsageEvent({
          userId: user.id,
          event: "task_completed",
          detail: id,
        }),
      );
    } else if (status === "cancelled") {
      backgroundTasks.push(
        recordAiFeedback({
          userId: user.id,
          source: "task",
          action: "task_cancelled",
          taskId: id,
          projectId: updatedTask.projectId,
          afterJson: taskSnapshot(updatedTask),
        }),
      );
    }

    await Promise.all(backgroundTasks).catch(() => {});
  });

  return { reviewHintEligible };
}

export async function markTodayFocus(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "id");
  if (!id) return;

  const task = await prisma.task.findUnique({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!task) return;

  await prisma.task.update({
    where: { id, userId: user.id },
    data: { focusDate: startOfDay() },
  });

  revalidatePath("/");
  revalidatePath("/workspace");
}

export async function clearTodayFocus(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "id");
  if (!id) return;

  const task = await prisma.task.findUnique({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!task) return;

  await prisma.task.update({
    where: { id, userId: user.id },
    data: { focusDate: null },
  });

  revalidatePath("/");
  revalidatePath("/workspace");
}

export async function deleteTask(formData: FormData) {
  const user = await requireUser();
  const id = text(formData, "id");

  if (!id) return;

  await prisma.task.delete({ where: { id, userId: user.id } });

  revalidatePath("/");
  revalidatePath("/workspace");
}
