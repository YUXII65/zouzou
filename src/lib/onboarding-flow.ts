import { prisma } from "@/lib/prisma";
import { buildAiContext } from "@/lib/ai-context";
import { withAiQuota } from "@/lib/ai-quota";
import { recordUsageEvent } from "@/lib/usage";
import { isOnboardingCompleted, setOnboardingCompleted } from "@/lib/onboarding";
import { setFirstRunTourStep } from "@/lib/first-run";
import { startOfDay } from "@/lib/date";
import { taskContractData } from "@/lib/task-contract-fields";
import {
  decisionCardFromTask,
  stickyPayloadFromDecisionCard,
} from "@/lib/decision";
import {
  generateFirstRunPlan,
  generateSocraticClarification,
  type FirstRunPlanResult,
  type InboxClarification,
} from "@/lib/ai";

export type FirstRunCompleteInput = {
  projectName: string;
  objective: string;
  milestone?: string | null;
  taskTitle: string;
  taskShortTitle?: string | null;
  sourceIdea?: string | null;
  taskExecutionMode?: string | null;
  taskDoneWhen?: string | null;
  taskMethodHint?: string | null;
  taskMaxTurns?: string | number | null;
  taskToolPolicy?: string | null;
  taskRecommendation?: string | null;
  taskExecutionSteps?: string[] | string | null;
  taskFallback?: string | null;
};

function clean(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeSteps(value: FirstRunCompleteInput["taskExecutionSteps"]) {
  if (Array.isArray(value)) {
    return value.map((item) => clean(item, 400)).filter(Boolean).slice(0, 10);
  }
  return clean(value, 4000)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export async function clarifyOnboardingForUser(
  userId: string,
  idea: string,
): Promise<InboxClarification> {
  const content = clean(idea);
  if (!content) {
    return { dimensions: [], supplementPlaceholder: "" };
  }

  const aiContext = await buildAiContext({
    kind: "inbox_plan",
    userId,
  });

  return withAiQuota(
    "onboarding_clarify",
    () =>
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
    userId,
  );
}

export async function planOnboardingForUser(
  userId: string,
  idea: string,
): Promise<FirstRunPlanResult> {
  const content = clean(idea);
  if (!content) {
    return {
      projectName: "个人推进项目",
      objective: "把第一个想法变成可推进的个人项目",
      milestone: "开始推进",
      taskTitle: "写下今天可以推进的一个具体动作",
      taskShortTitle: "写下具体动作",
      taskExecutionMode: "quick",
      taskDoneWhen: "写下今天能马上开始的一个具体动作",
      taskMethodHint:
        "先写成一个 30 分钟内能完成的具体动作，再判断它是否真的能推进。",
      taskRecommendation:
        "先写成一个 30 分钟内能完成的具体动作，再判断它是否真的能推进。",
      taskExecutionSteps: ["写下今天能马上开始的那个具体动作"],
      taskFallback: "",
      taskMaxTurns: 1,
      taskToolPolicy: "none",
      usedFallback: true,
    };
  }

  return withAiQuota(
    "onboarding_plan",
    () => generateFirstRunPlan(content),
    userId,
  );
}

export async function skipOnboardingForUser(userId: string) {
  await setOnboardingCompleted(userId, true);
  await setFirstRunTourStep(userId, "1");
  await recordUsageEvent({ userId, event: "onboarding_skipped" });
}

export async function completeFirstRunForUser(
  userId: string,
  input: FirstRunCompleteInput,
) {
  const projectName = clean(input.projectName, 80);
  const objective = clean(input.objective, 1000);
  const milestone = clean(input.milestone, 200) || null;
  const taskTitle = clean(input.taskTitle, 500);
  const taskShortTitle = clean(input.taskShortTitle, 80) || null;
  const sourceIdea = clean(input.sourceIdea, 4000) || objective;

  if (!projectName || !objective || !taskTitle) {
    return { ok: false as const, error: "项目名、目标和今日任务不能为空" };
  }

  if (await isOnboardingCompleted(userId)) {
    return { ok: true as const, alreadyComplete: true };
  }

  const existingProject = await prisma.project.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existingProject) {
    await setOnboardingCompleted(userId, true);
    await setFirstRunTourStep(userId, "2");
    return { ok: true as const, alreadyComplete: true };
  }

  const taskContract = taskContractData({
    title: taskTitle,
    notes: objective,
    executionMode: input.taskExecutionMode,
    doneWhen: input.taskDoneWhen,
    methodHint: input.taskMethodHint,
    maxTurns: input.taskMaxTurns,
    toolPolicy: input.taskToolPolicy,
  });

  const project = await prisma.project.create({
    data: {
      userId,
      name: projectName,
      objective,
      currentMilestone: milestone,
      status: "active",
      notes: sourceIdea,
    },
    select: { id: true },
  });

  const createdTask = await prisma.task.create({
    data: {
      userId,
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
      recommendation: input.taskRecommendation ?? null,
      executionSteps: normalizeSteps(input.taskExecutionSteps),
      fallback: input.taskFallback ?? null,
      methodHint: taskContract.methodHint,
      doneWhen: taskContract.doneWhen,
    }),
  );

  await prisma.taskStickyNote.create({
    data: {
      userId,
      taskId: createdTask.id,
      sourceMessage: sourceIdea,
      title: sticky.title,
      encouragement: sticky.encouragement,
      stepsJson: JSON.stringify(sticky.steps),
      nextStep: sticky.nextStep,
    },
  });

  await recordUsageEvent({
    userId,
    event: "task_created",
    detail: "onboarding",
  });
  await setOnboardingCompleted(userId, true);
  await setFirstRunTourStep(userId, "2");
  await recordUsageEvent({ userId, event: "onboarding_complete" });

  return {
    ok: true as const,
    projectId: project.id,
    taskId: createdTask.id,
  };
}
